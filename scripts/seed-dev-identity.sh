#!/usr/bin/env bash
# Seed ONE development identity across Keycloak and the application database.
#
# WHY THIS EXISTS
#
# T-0005 wires a real Keycloak session into the seven Next apps, and until this
# script ran there was nobody to log in as: the realm held ZERO users and
# `identity.users` held ZERO rows. Both halves are required and neither is
# sufficient — `TenantGuard` verifies the token, then looks the subject up with
# `MembershipRepository.findByKeycloakSubject()` and refuses a valid token whose
# subject has no application user ("authentication is not authorization").
#
# The two halves must agree on ONE value: Keycloak's user id, stored as
# `identity.users.keycloak_subject`. That is why this is a single script rather
# than a realm fixture plus a SQL seed — split across two files they drift, and
# the symptom of the drift is a successful login that 401s on every API call,
# which reads like a token bug and is not one.
#
# DEV ONLY. It refuses to run against anything but a local Keycloak, and it
# creates a user with a well-known password. Nothing here may reach a deployed
# environment; real users arrive through registration and invitation (T-0028).
#
# Idempotent: re-running reconciles rather than duplicating, so it is safe after
# a realm rebuild, a database reset, or either one alone.
set -euo pipefail

CONTAINER="${KC_CONTAINER:-aw-keycloak}"
PG_CONTAINER="${PG_CONTAINER:-aw-postgres}"
KC_URL="${KEYCLOAK_URL:-http://localhost:8080}"
REALM="${KEYCLOAK_REALM:-autoworkshop}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-change_me_locally}"
DB="${POSTGRES_DB:-autoworkshop}"
DB_USER="${POSTGRES_USER:-autoworkshop}"

# The seeded identity. A TECHNICIAN on purpose, not an owner: `technician` holds
# none of the three permission keys the navigation gates on, so the permission
# filtering stays genuinely exercised. A viewer holding every grant is how the
# only security-relevant assertion in the Playwright suite came to skip in all
# seven workspaces while reporting green.
DEV_EMAIL="${DEV_USER_EMAIL:-technician@autoworkshop.local}"
DEV_FIRST="${DEV_USER_FIRST:-A.}"
DEV_LAST="${DEV_USER_LAST:-Technician}"
DEV_ROLE="${DEV_USER_ROLE:-technician}"
# Must satisfy the realm password policy: length(12), upperCase(1),
# lowerCase(1), digits(1), specialChars(1), notUsername, notEmail.
DEV_PASSWORD="${DEV_USER_PASSWORD:-Change_me_locally1!}"

# ── dev-only guard ──────────────────────────────────────────────────────────
# Checked against the URL, before anything is created. A seeded well-known
# password on a reachable realm is a live account with a published credential.
case "$KC_URL" in
  http://localhost:*|http://127.0.0.1:*) ;;
  *)
    echo "REFUSING: seed-dev-identity.sh targets local Keycloak only (got $KC_URL)" >&2
    exit 1
    ;;
esac

# MSYS_NO_PATHCONV=1 — on Git Bash for Windows, MSYS rewrites the
# container-absolute path /opt/keycloak/bin/kcadm.sh into a host path before
# docker ever sees it. Same reason as import-realm.sh.
kcadm() { MSYS_NO_PATHCONV=1 docker exec -i "$CONTAINER" /opt/keycloak/bin/kcadm.sh "$@"; }
psql_run() { docker exec -i "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB" "$@"; }
trim() { echo "$1" | tr -d '\r' | xargs; }

echo "==> authenticating to $KC_URL"
kcadm config credentials --server "$KC_URL" --realm master \
  --user "$ADMIN_USER" --password "$ADMIN_PASS" >/dev/null

# ── 1. the Keycloak user ────────────────────────────────────────────────────
# The realm sets registrationEmailAsUsername, so the username IS the email.
echo "==> ensuring Keycloak user $DEV_EMAIL"
if kcadm create users -r "$REALM" \
     -s "username=$DEV_EMAIL" \
     -s "email=$DEV_EMAIL" \
     -s "emailVerified=true" \
     -s "enabled=true" \
     -s "firstName=$DEV_FIRST" \
     -s "lastName=$DEV_LAST" >/dev/null 2>&1; then
  echo "    created"
else
  echo "    already present"
fi

SUBJECT="$(trim "$(kcadm get users -r "$REALM" -q "username=$DEV_EMAIL" --fields id --format csv 2>/dev/null | tr -d '"' | head -1)")"
if [ -z "$SUBJECT" ]; then
  echo "FAILED: could not read back the Keycloak subject for $DEV_EMAIL" >&2
  exit 1
fi
echo "    subject $SUBJECT"

# Set the password only when the user has NO credential.
#
# Not an optimisation — unconditionally re-setting it breaks the second run.
# The realm policy includes passwordHistory(3), so re-applying the same password
# is rejected with "must not be equal to any of last 3 passwords", `set -e`
# fires, and the script aborts before it ever reaches the database half. That is
# how a script that ran once looks idempotent and is not.
#
# Keyed on the credential actually being absent rather than on "did we just
# create the user", because the case worth covering is a user that survived a
# database reset with its credentials intact, or a realm rebuild that left the
# user without any.
CREDS="$(trim "$(kcadm get "users/$SUBJECT/credentials" -r "$REALM" --fields type --format csv 2>/dev/null | tr -d '"')")"
if [ -z "$CREDS" ]; then
  kcadm set-password -r "$REALM" --username "$DEV_EMAIL" --new-password "$DEV_PASSWORD" >/dev/null
  echo "    password set"
else
  echo "    password already set — left unchanged ($CREDS)"
fi

# ── 2. the application user and membership ──────────────────────────────────
# Runs as the BOOTSTRAP SUPERUSER, which bypasses RLS. That is correct for a
# seed and wrong for the application: migration 002 exists precisely so the app
# connects as `autoworkshop_app` (NOSUPERUSER, NOBYPASSRLS) and is subject to
# its own policies. Seeding is not an application operation — there is no tenant
# context yet to scope it to, which is the same reason
# `MembershipRepository.findByKeycloakSubject()` runs without one.
#
# The organisation and branch are looked up BY TENANT, not passed in: a
# membership whose tenant_id and organization_id belong to different tenants
# satisfies both the foreign keys and the RLS WITH CHECK, and is exactly the
# defect MembershipService.grant() guards against. A seed must not create by
# hand the row the service refuses to create.
echo "==> ensuring identity.users + identity.memberships"
psql_run -q -v subject="$SUBJECT" -v email="$DEV_EMAIL" \
  -v display="$DEV_FIRST $DEV_LAST" -v role="$DEV_ROLE" <<'SQL'
BEGIN;

WITH target AS (
    SELECT o.tenant_id,
           o.id                        AS organization_id,
           (SELECT b.id
              FROM identity.branches b
             WHERE b.organization_id = o.id
               AND b.tenant_id = o.tenant_id
             ORDER BY b.name
             LIMIT 1)                  AS branch_id
      FROM identity.organizations o
     ORDER BY o.name
     LIMIT 1
),
seeded_user AS (
    INSERT INTO identity.users (keycloak_subject, email, display_name, status)
    VALUES (:'subject', :'email', :'display', 'active')
    ON CONFLICT (keycloak_subject) DO UPDATE
        SET email        = EXCLUDED.email,
            display_name = EXCLUDED.display_name,
            status       = 'active',
            updated_at   = now()
    RETURNING id
)
INSERT INTO identity.memberships
    (tenant_id, organization_id, branch_id, user_id, role_name, status)
SELECT t.tenant_id, t.organization_id, t.branch_id, u.id, :'role', 'active'
  FROM target t, seeded_user u
-- The unique constraint is (organization_id, user_id, role_name), so a re-run
-- reconciles the existing membership instead of adding a second one.
ON CONFLICT (organization_id, user_id, role_name) DO UPDATE
    SET status     = 'active',
        branch_id  = EXCLUDED.branch_id,
        updated_at = now();

COMMIT;
SQL

# ── 3. verify what was actually written ─────────────────────────────────────
# Reading the rows back rather than trusting the exit code: an INSERT ... SELECT
# whose SELECT matched nothing succeeds and writes nothing.
echo "==> verifying"
RESULT="$(psql_run -tAc "
  SELECT u.keycloak_subject || ' | ' || u.email || ' | ' || m.role_name
         || ' | tenant ' || t.name || ' | org ' || o.name
         || ' | branch ' || COALESCE(b.name, '(none)')
    FROM identity.users u
    JOIN identity.memberships m  ON m.user_id = u.id
    JOIN identity.tenants t      ON t.id = m.tenant_id
    JOIN identity.organizations o ON o.id = m.organization_id
    LEFT JOIN identity.branches b ON b.id = m.branch_id
   WHERE u.keycloak_subject = '$SUBJECT'
     AND m.status = 'active'")"

if [ -z "$(trim "$RESULT")" ]; then
  echo "FAILED: no active membership exists for subject $SUBJECT" >&2
  echo "        (are identity.organizations and identity.branches seeded?)" >&2
  exit 1
fi
echo "    $RESULT"
echo "==> done — sign in as $DEV_EMAIL"
