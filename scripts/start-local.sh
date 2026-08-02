#!/usr/bin/env bash
#
# Start the local stack on ONE canonical hostname, reachable from this machine
# AND from a phone on the same wifi.
#
# ── 🔴 THE BUG THIS EXISTS TO PREVENT ──────────────────────────────────────
#
# Keycloak's `start-dev` derives a token's `iss` from the Host header of the
# request that minted it. The API validates with `jwt.verify({ issuer })`
# against its OWN `KEYCLOAK_URL`. Those two values must match BYTE FOR BYTE.
#
# Signing in over the LAN mints `iss=http://<lan-ip>:8080/realms/autoworkshop`
# while an API started from `.env` expects `http://localhost:8080/...`, so the
# API rejected every token. The failure is silent and deeply misleading: the
# Auth.js session cookie is perfectly valid, so the shell renders "Sign out"
# and "Switch user" — while `/me` 401s, the viewer resolves to null, and the
# same page also says "Not signed in". Diagnosed by Codex, 2026-08-02.
#
# Starting the two processes from one derived value is the fix. There is no
# second place to keep in step.
#
# ── SECRETS ────────────────────────────────────────────────────────────────
#
# Every secret is READ FROM `.env` AT RUN TIME, never printed, and never written
# into any file this script creates. `.env` is git-ignored. Nothing here embeds a
# credential, and no secret reaches the browser: the web app reads AUTH_SECRET
# server-side only and this repo defines no `NEXT_PUBLIC_*` at all.
#
# 🔴 ONE HONEST LIMITATION, because the previous version of this paragraph
# claimed the opposite and was WRONG (found by Codex). `kcadm` accepts its admin
# password ONLY as a command-line argument — it offers no stdin or password-file
# mode. So the password IS in an argv somewhere. What the code below does is
# confine that argv to INSIDE the container: it crosses as a `docker exec -e`
# variable and is expanded by a shell in the container, so it no longer appears
# in the HOST process list where any other local user could read it with `ps`.
# It remains visible to processes inside the Keycloak container, which run
# nothing but Keycloak. That is a real reduction and NOT a complete fix, and it
# is written down rather than papered over.
#
#   bash scripts/start-local.sh              # detect the LAN address
#   MOBILE_HOST=192.168.0.124 bash scripts/start-local.sh
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

REALM="${KEYCLOAK_REALM:-autoworkshop}"
CONTAINER="${KC_CONTAINER:-aw-keycloak}"
KC_ADMIN="${KEYCLOAK_ADMIN:-admin}"
KC_ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-change_me_locally}"
WEB_PORT=3001
API_PORT=4000
KC_PORT=8080

if [ ! -f .env ]; then
  echo "REFUSING: .env is missing. Copy .env.example and fill it in." >&2
  exit 1
fi

# Same locality guard as sync-mobile-client.sh, and for the same reason: kcadm
# runs INSIDE the container, so the container is the real target.
if [ "$CONTAINER" != "aw-keycloak" ]; then
  echo "REFUSING: start-local.sh only drives the local dev container." >&2
  echo "  got KC_CONTAINER=$CONTAINER, expected aw-keycloak" >&2
  echo "  Unset KC_CONTAINER and re-run." >&2
  exit 1
fi

detect_host() {
  powershell.exe -NoProfile -Command "
    (Get-NetIPAddress -AddressFamily IPv4 |
      Where-Object { \$_.InterfaceAlias -notmatch 'Loopback|vEthernet|WSL|Tailscale' -and
                     \$_.IPAddress -notmatch '^169\.' } |
      Select-Object -First 1 -ExpandProperty IPAddress)" 2>/dev/null | tr -d '\r\n '
}

# The realm name is interpolated into an inline `node -e` program further down,
# so it is constrained to the characters a realm name may legally contain. A
# value carrying a quote could otherwise rewrite that program. Raised by Codex.
if ! printf '%s' "$REALM" | grep -Eq '^[A-Za-z0-9._-]+$'; then
  echo "REFUSING: KEYCLOAK_REALM must match ^[A-Za-z0-9._-]+\$ (got '$REALM')." >&2
  exit 1
fi

HOST_IP="${MOBILE_HOST:-$(detect_host)}"
# Validated for the same reason as in sync-mobile-client.sh: this value is
# written into a public OAuth client's redirect allow-list, where a wildcard
# would hand authorization codes to any address that asked.
if ! printf '%s' "$HOST_IP" | grep -Eq '^((25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])$'; then
  echo "REFUSING: could not determine a plain IPv4 LAN address (got '${HOST_IP:-<empty>}')." >&2
  echo "  Find yours with: ipconfig | findstr IPv4   then re-run:" >&2
  echo "  MOBILE_HOST=192.168.0.10 bash scripts/start-local.sh" >&2
  exit 1
fi
# 🔴 A PRIVATE LAN ADDRESS, NOT MERELY A SYNTACTICALLY VALID ONE. Raised by
# Codex: the first version accepted any dotted quad, so `MOBILE_HOST=203.0.113.10`
# would have written a PUBLIC address into a public OAuth client's redirect
# allow-list and pointed KEYCLOAK_URL at a host this machine does not control.
if ! printf '%s' "$HOST_IP" | grep -Eq '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)'; then
  echo "REFUSING: '$HOST_IP' is not a private LAN address (10/8, 172.16/12, 192.168/16)." >&2
  echo "  This value goes into a PUBLIC OAuth client's redirect allow-list, so a" >&2
  echo "  routable address there would accept redirects from off this network." >&2
  echo "  Pass your wifi address: MOBILE_HOST=192.168.0.10 bash scripts/start-local.sh" >&2
  exit 1
fi

# 🔴 THE ONE VALUE. Everything below is derived from it; nothing re-states it.
CANONICAL_KC="http://${HOST_IP}:${KC_PORT}"
WEB_URL="http://${HOST_IP}:${WEB_PORT}"

echo "==> canonical host  : $HOST_IP"
echo "==> Keycloak issuer : ${CANONICAL_KC}/realms/${REALM}"
echo "==> web             : $WEB_URL"

# ── 1. the web client must accept a redirect back to the LAN origin ────────
kcadm() { MSYS_NO_PATHCONV=1 docker exec -i "$CONTAINER" /opt/keycloak/bin/kcadm.sh "$@"; }

echo "==> registering ${WEB_URL} on the workshop-web client"
# See the SECRETS note at the top for exactly what this protects and what it
# does not. The password crosses as a `docker exec -e` variable and is expanded
# by a shell INSIDE the container, keeping it out of the host process list.
MSYS_NO_PATHCONV=1 docker exec -i -e KC_PW="$KC_ADMIN_PASS" "$CONTAINER" sh -c \
  '/opt/keycloak/bin/kcadm.sh config credentials --server "$1" --realm master --user "$2" --password "$KC_PW"' \
  _ "http://localhost:${KC_PORT}" "$KC_ADMIN" >/dev/null

WEB_CLIENT_UUID="$(kcadm get clients -r "$REALM" --fields id,clientId --format json 2>/dev/null \
  | python -c "
import json,sys
for c in json.load(sys.stdin):
    if c.get('clientId') == 'autoworkshop-workshop-web':
        print(c['id']); break
")"
if [ -z "$WEB_CLIENT_UUID" ]; then
  echo "REFUSING: autoworkshop-workshop-web is not in the running realm." >&2
  echo "  The realm is imported once, on Keycloak's FIRST boot; a client added" >&2
  echo "  to realm-autoworkshop.json afterwards exists only on disk." >&2
  exit 1
fi

# Merged, never replaced — and built by a JSON encoder so a value cannot change
# the shape of the document.
kcadm get "clients/$WEB_CLIENT_UUID" -r "$REALM" --format json 2>/dev/null \
  | python -c "
import json, sys
web = sys.argv[1]
c = json.load(sys.stdin)
patch = {
    'redirectUris': sorted(set(c.get('redirectUris', []) + [web + '/*'])),
    'webOrigins':   sorted(set(c.get('webOrigins', [])   + [web])),
}
print(json.dumps(patch))
" "$WEB_URL" | kcadm update "clients/$WEB_CLIENT_UUID" -r "$REALM" -f - >/dev/null
echo "    registered"

# ── 2. free the ports ──────────────────────────────────────────────────────
echo "==> freeing ports ${API_PORT} and ${WEB_PORT}"
powershell.exe -NoProfile -Command "
  foreach (\$p in @(${API_PORT},${WEB_PORT})) {
    Get-NetTCPConnection -LocalPort \$p -State Listen -ErrorAction SilentlyContinue |
      ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -ErrorAction SilentlyContinue }
  }" 2>/dev/null || true
sleep 2

# ── 3. the API, with the canonical issuer ──────────────────────────────────
# `.env` supplies the database and Redis credentials. KEYCLOAK_URL is
# OVERRIDDEN after sourcing, because `.env` holds the loopback value that
# caused the mismatch this script exists to prevent.
set -a
# shellcheck disable=SC1091
. ./.env
set +a
export KEYCLOAK_URL="$CANONICAL_KC"

echo "==> starting API on ${API_PORT}"
( cd apps/api && nohup node dist/main.js </dev/null >/tmp/aw-api.log 2>&1 & ) </dev/null

# ── 4. the web app, with the SAME issuer ───────────────────────────────────
# ⚠️ NODE_ENV IS FORCED TO production. `.env` sets it to `development`, and a
# `next start` inheriting that serves the DEV React runtime against a
# production build — the defect that crashed prerender on 07-30.
echo "==> starting web on ${WEB_PORT}"
(
  cd apps/workshop-web &&
  NODE_ENV=production \
  AUTH_URL="$WEB_URL" \
  AUTH_TRUST_HOST=true \
  KEYCLOAK_URL="$CANONICAL_KC" \
  nohup ./node_modules/.bin/next start -p "$WEB_PORT" -H 0.0.0.0 </dev/null >/tmp/aw-web.log 2>&1 &
) </dev/null

# ── 5. prove it, rather than announce it ───────────────────────────────────
echo "==> waiting for both to answer"
for _ in $(seq 1 60); do
  if node -e "
    Promise.all([
      fetch('http://localhost:${API_PORT}/api/v1/health'),
      fetch('${WEB_URL}/home/dashboard'),
    ]).then(rs => process.exit(rs.every(r => r.ok) ? 0 : 1)).catch(() => process.exit(1))
  " 2>/dev/null; then
    ok=1; break
  fi
  sleep 2
done

if [ "${ok:-0}" != "1" ]; then
  echo "  FAILED to come up. Logs: /tmp/aw-api.log /tmp/aw-web.log" >&2
  exit 1
fi

# The issuer the realm actually serves on this host, read back rather than
# assumed — a mismatch here IS the bug, so it is asserted and not printed and
# hoped over.
node -e "
fetch('${CANONICAL_KC}/realms/${REALM}/.well-known/openid-configuration')
  .then(r => r.json())
  .then(j => {
    const want = '${CANONICAL_KC}/realms/${REALM}';
    if (j.issuer !== want) {
      console.error('  ISSUER MISMATCH: realm serves ' + j.issuer + ', API expects ' + want);
      process.exit(1);
    }
    console.log('  issuer agrees: ' + j.issuer);
  })
  .catch(e => { console.error('  could not read the realm: ' + e.message); process.exit(1); });
"

# 🔴 AND THE PROTECTED PATH, because everything above can pass while the bug
# this script exists to prevent is still present. Raised by Codex, and it is the
# repository's signature defect: `/api/v1/health` returns 200 unconditionally and
# `/home/dashboard` renders for an anonymous visitor, so BOTH were green during
# the very failure that motivated this file. What was actually broken was `/me`.
#
# A correct token cannot be minted here — the realm disables direct access
# grants on every client, deliberately — so this asserts the reachable half: the
# endpoint that resolves the viewer must REFUSE an anonymous call and must
# refuse a token from the WRONG issuer. A 200 to either means the guard is not
# running, which is the failure that renders "Not signed in" beside "Sign out".
echo "==> proving the protected path is guarded"
node -e "
const api = 'http://localhost:${API_PORT}/api/v1';
(async () => {
  const anon = await fetch(api + '/me');
  if (anon.status === 200) {
    console.error('  FAIL: /me answered 200 with NO token — the guard is not running');
    process.exit(1);
  }
  // A syntactically valid JWT signed by nobody: must be refused by signature
  // AND issuer. If this is accepted, verification is off entirely.
  const junk = ['eyJhbGciOiJSUzI1NiJ9',
    Buffer.from(JSON.stringify({ iss: 'http://evil.invalid/realms/x', sub: 'x' })).toString('base64url'),
    'not-a-signature'].join('.');
  const forged = await fetch(api + '/me', { headers: { authorization: 'Bearer ' + junk } });
  if (forged.status === 200) {
    console.error('  FAIL: /me accepted a token from a foreign issuer');
    process.exit(1);
  }
  console.log('  /me refuses anonymous (' + anon.status + ') and a foreign issuer (' + forged.status + ')');
})().catch(e => { console.error('  could not reach /me: ' + e.message); process.exit(1); });
"

# ⚠️ WHAT IS STILL NOT PROVEN HERE: that a GENUINE token is ACCEPTED. Only a
# real browser sign-in can show that, because the realm requires the
# authorization-code flow. Run it when the auth wiring has changed:
#   (cd apps/e2e && WORKSHOP_WEB_URL=${WEB_URL} node verify/verify-pricing-screen.mjs)

cat <<INFO

  Web app : ${WEB_URL}
  Mobile  : exp://${HOST_IP}:8081   (run: MOBILE_HOST=${HOST_IP} npx expo start --lan)

  Sign in with the FULL EMAIL, over plain http.
  Accounts are created by scripts/seed-dev-identity.sh; the password is that
  script's DEV_USER_PASSWORD and is not repeated here.

INFO
