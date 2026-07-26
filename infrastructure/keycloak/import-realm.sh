#!/usr/bin/env bash
# Import (or re-import) the AutoWorkshop realm from version-controlled JSON.
#
# The realm is configuration-as-code, not console clicking: it is reproducible,
# reviewable in a diff, and restorable after a Keycloak loss. `1.txt` §32
# requires a realm export daily and after any material change — that is only
# meaningful if the realm has a canonical source in git.
#
# OWN REALM, never Solar's (ADR-011).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER="${KC_CONTAINER:-aw-keycloak}"
KC_URL="${KEYCLOAK_URL:-http://localhost:8080}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-change_me_locally}"
REALM_FILE="$DIR/realm-autoworkshop.json"
REALM_NAME="autoworkshop"

# MSYS_NO_PATHCONV=1 is required on Git Bash for Windows: without it, MSYS
# rewrites the container-absolute path /opt/keycloak/bin/kcadm.sh into
# C:/Program Files/Git/opt/keycloak/bin/kcadm.sh before docker ever sees it.
kcadm() { MSYS_NO_PATHCONV=1 docker exec -i "$CONTAINER" /opt/keycloak/bin/kcadm.sh "$@"; }

echo "==> authenticating to $KC_URL"
kcadm config credentials --server "$KC_URL" --realm master \
  --user "$ADMIN_USER" --password "$ADMIN_PASS" >/dev/null

echo "==> copying realm definition into the container"
# The LOCAL side of `docker cp` must be a native path that docker.exe understands,
# while the CONTAINER side must not be rewritten. Convert the local path
# explicitly (cygpath on Git Bash) and guard only the container side.
if command -v cygpath >/dev/null 2>&1; then
  SRC="$(cygpath -w "$REALM_FILE")"
else
  SRC="$REALM_FILE"
fi
MSYS_NO_PATHCONV=1 docker cp "$SRC" "$CONTAINER:/tmp/realm-autoworkshop.json"

if kcadm get "realms/$REALM_NAME" >/dev/null 2>&1; then
  echo "==> realm '$REALM_NAME' exists — updating in place"
  kcadm update "realms/$REALM_NAME" -f /tmp/realm-autoworkshop.json
  echo "    NOTE: update does not remove roles or clients deleted from the file."
  echo "    For a clean rebuild: kcadm delete realms/$REALM_NAME, then re-run."
else
  echo "==> creating realm '$REALM_NAME'"
  kcadm create realms -f /tmp/realm-autoworkshop.json
fi

echo "==> creating the audience client scope"
# Created AFTER import, never inside the realm JSON. A `clientScopes` array in
# the realm representation REPLACES Keycloak's built-in scopes wholesale — which
# left the realm with only 2 scopes and no `roles` scope at all, so tokens
# carried no realm_access.roles claim and the API could not have authorized
# anything. Found by listing the realm's scopes, not by reading the config back.
if command -v cygpath >/dev/null 2>&1; then
  SCOPE_SRC="$(cygpath -w "$DIR/client-scope-audience.json")"
else
  SCOPE_SRC="$DIR/client-scope-audience.json"
fi
MSYS_NO_PATHCONV=1 docker cp "$SCOPE_SRC" "$CONTAINER:/tmp/client-scope-audience.json"
kcadm create client-scopes -r "$REALM_NAME" -f /tmp/client-scope-audience.json >/dev/null 2>&1   && echo "    created autoworkshop-audience"   || echo "    autoworkshop-audience already present"

echo "==> attaching client scopes"
STANDARD_SCOPES="profile email roles web-origins acr basic autoworkshop-audience"
SCOPE_CSV="$(kcadm get client-scopes -r "$REALM_NAME" --fields id,name --format csv 2>/dev/null | tr -d '"')"
for client in customer workshop supplier fleet insurance towing admin; do
  CID="$(kcadm get clients -r "$REALM_NAME" -q "clientId=autoworkshop-${client}-web" --fields id --format csv 2>/dev/null | tr -d '"' | head -1)"
  [ -z "$CID" ] && { echo "    !! ${client}-web not found"; continue; }
  attached=""
  for scope in $STANDARD_SCOPES; do
    SID="$(echo "$SCOPE_CSV" | awk -F, -v s="$scope" '$2==s {print $1}' | head -1)"
    [ -z "$SID" ] && continue
    kcadm update "clients/$CID/default-client-scopes/$SID" -r "$REALM_NAME" >/dev/null 2>&1 && attached="$attached $scope"
  done
  echo "    ${client}-web:$attached"
done

echo "==> verifying"
kcadm get "realms/$REALM_NAME" --fields realm,enabled,registrationAllowed,bruteForceProtected
echo "    realm roles:   $(kcadm get "realms/$REALM_NAME/roles" --fields name --format csv 2>/dev/null | wc -l)"
echo "    clients:       $(kcadm get "realms/$REALM_NAME/clients" --fields clientId --format csv 2>/dev/null | wc -l)"
echo "==> done"
