#!/usr/bin/env bash
#
# Put the `autoworkshop-mobile` Keycloak client into the LOCAL dev realm, and
# allow the Expo Go redirect for THIS machine's LAN address.
#
# ── WHY THIS EXISTS ────────────────────────────────────────────────────────
#
# 🔴 THE CLIENT WAS IN THE COMMITTED REALM AND NOT IN THE RUNNING ONE.
# `infrastructure/keycloak/realm-autoworkshop.json` has declared
# `autoworkshop-mobile` since the mobile app was scaffolded, but the realm is
# imported ONCE when the Keycloak container first initialises its database. Any
# client added to the file afterwards exists only on disk. Signing in from the
# phone would have failed with "Client not found" — at the Keycloak redirect,
# after the user had already left the app.
#
# It went unnoticed because the mobile app had never been STARTED: its unit
# tests pass without a realm, and a config file that reads correct is not a
# mechanism that runs. Same shape as every other entry in this repo's
# "config reads correct while the mechanism is INERT" list.
#
# 🔴 AND THE LAN REDIRECT URI IS NOT IN THE FILE ON PURPOSE.
# The realm declares `exp://localhost:8081/*` and `exp://127.0.0.1:8081/*`.
# Neither matches a PHYSICAL phone: Expo Go builds its redirect from the LAN
# address Metro is serving on, so the phone sends `exp://192.168.x.y:8081/...`
# and Keycloak correctly refuses it as an unregistered redirect_uri.
#
# That address is specific to one machine on one network, so committing it
# would be wrong twice over — it would be stale for anybody else, and it would
# ride into the production realm, which already carries an open hardening item
# to REMOVE the `exp://` entries rather than add more. It is therefore applied
# to the running DEV realm only, by this script, every time the address changes.
#
# Usage:
#   bash scripts/sync-mobile-client.sh                 # detect the LAN address
#   MOBILE_HOST=192.168.0.124 bash scripts/sync-mobile-client.sh
#
# Idempotent: re-running updates the redirect list rather than duplicating it.
set -euo pipefail

CONTAINER="${KC_CONTAINER:-aw-keycloak}"
REALM="${KEYCLOAK_REALM:-autoworkshop}"
KC_URL="${KEYCLOAK_URL:-http://localhost:8080}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-change_me_locally}"
CLIENT_ID="autoworkshop-mobile"
METRO_PORT="${METRO_PORT:-8081}"

# The same refusal seed-dev-identity.sh carries. This script relaxes a redirect
# allow-list, which is exactly the change that must never reach a real realm by
# way of a stray environment variable.
case "$KC_URL" in
  http://localhost:*|http://127.0.0.1:*) ;;
  *)
    echo "REFUSING: sync-mobile-client.sh targets local Keycloak only (got $KC_URL)" >&2
    exit 1
    ;;
esac

# 🔴 AND THE CONTAINER, BECAUSE THE URL ALONE DOES NOT NAME THE TARGET.
# Raised by Codex. `kcadm` runs INSIDE `$CONTAINER`, so `$KC_URL` is resolved
# from that container's own network namespace — `http://localhost:8080` means
# "whatever Keycloak this container is", not "the local dev one". A run of
#
#   KC_CONTAINER=prod-keycloak bash scripts/sync-mobile-client.sh
#
# therefore passed the check above and would have widened the redirect
# allow-list of a PRODUCTION public client, which is the one change on this
# script that could be turned into token theft.
#
# The reachable alternative is stated in the refusal rather than left implicit:
# point KC_CONTAINER at the local container, which is the default anyway.
if [ "$CONTAINER" != "aw-keycloak" ]; then
  echo "REFUSING: sync-mobile-client.sh only targets the local dev container." >&2
  echo "  got KC_CONTAINER=$CONTAINER, expected aw-keycloak" >&2
  echo "  kcadm runs INSIDE the container, so $KC_URL would resolve to THAT" >&2
  echo "  Keycloak's own localhost — the URL check above cannot see this." >&2
  echo "  If you meant the local stack, unset KC_CONTAINER and re-run." >&2
  exit 1
fi


# MSYS_NO_PATHCONV=1 — Git Bash rewrites the container-absolute path into a
# host path before docker sees it. Same reason as seed-dev-identity.sh.
kcadm() { MSYS_NO_PATHCONV=1 docker exec -i "$CONTAINER" /opt/keycloak/bin/kcadm.sh "$@"; }

# The LAN address, not the loopback: this is the whole point of the script.
# Tailscale and the Docker/WSL virtual switches are excluded because a phone on
# the house wifi cannot route to any of them.
detect_host() {
  powershell.exe -NoProfile -Command "
    (Get-NetIPAddress -AddressFamily IPv4 |
      Where-Object { \$_.InterfaceAlias -notmatch 'Loopback|vEthernet|WSL|Tailscale' -and
                     \$_.IPAddress -notmatch '^169\.' } |
      Select-Object -First 1 -ExpandProperty IPAddress)" 2>/dev/null | tr -d '\r\n '
}

HOST_IP="${MOBILE_HOST:-$(detect_host)}"
if [ -z "$HOST_IP" ]; then
  echo "Could not detect a LAN address. Pass one: MOBILE_HOST=192.168.0.10 bash $0" >&2
  exit 1
fi

# 🔴 VALIDATED BEFORE IT REACHES THE PAYLOAD. Raised by Codex. This value ends
# up inside a Keycloak client's `redirectUris`, so a value containing a quote
# could close the JSON string and append entries of its own — `*` among them.
# A wildcard redirect on a PUBLIC client hands the authorization code to any
# address that asks for it, which defeats the whole point of PKCE. A dotted
# quad is the only shape this script has any use for, so everything else is
# REFUSED rather than escaped: escaping would still accept a hostname that
# happens to resolve somewhere unintended.
if ! printf '%s' "$HOST_IP" | grep -Eq '^((25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])$'; then
  echo "REFUSING: MOBILE_HOST must be a plain IPv4 address (got '$HOST_IP')." >&2
  echo "  It is written into a public client's redirect allow-list." >&2
  echo "  Find yours with: ipconfig | findstr IPv4   then re-run:" >&2
  echo "  MOBILE_HOST=192.168.0.10 bash $0" >&2
  exit 1
fi
echo "==> LAN address: $HOST_IP"

echo "==> authenticating to $KC_URL"
kcadm config credentials --server "$KC_URL" --realm master \
  --user "$ADMIN_USER" --password "$ADMIN_PASS" >/dev/null

UUID="$(kcadm get clients -r "$REALM" --fields id,clientId --format json 2>/dev/null \
  | python -c "
import json,sys
for c in json.load(sys.stdin):
    if c.get('clientId') == '$CLIENT_ID':
        print(c['id']); break
")"

# ⚠️ THE PAYLOAD IS BUILT BY A JSON ENCODER, NOT BY STRING CONCATENATION.
# Raised by Codex alongside the validation above, and the two are separate
# defences on purpose: the validation decides WHICH values are acceptable, the
# encoder guarantees that whatever is accepted cannot change the SHAPE of the
# document. Values arrive through argv rather than being interpolated into the
# program text, so there is no quoting context for them to escape from.
#
# The payload is otherwise IDENTICAL on create and update, so a client that
# already exists cannot drift away from the committed definition — the redirect
# list is the one field this script is allowed to widen.
#
# The custom-scheme entries matter for a real installed build; the exp:// ones
# only for Expo Go, which is the only way to run this app on a machine with no
# Android SDK.
PAYLOAD="$(python -c '
import json, sys
client_id, host, port = sys.argv[1], sys.argv[2], sys.argv[3]
print(json.dumps({
    "clientId": client_id,
    "name": "Mobile (Android)",
    "enabled": True,
    "publicClient": True,
    "protocol": "openid-connect",
    "standardFlowEnabled": True,
    "directAccessGrantsEnabled": False,
    "attributes": {
        "pkce.code.challenge.method": "S256",
        "post.logout.redirect.uris": "+",
    },
    "redirectUris": [
        "autoworkshop://auth",
        "autoworkshop://auth/*",
        "exp://localhost:%s/*" % port,
        "exp://127.0.0.1:%s/*" % port,
        "exp://%s:%s/*" % (host, port),
    ],
    "webOrigins": [],
}))' "$CLIENT_ID" "$HOST_IP" "$METRO_PORT")"

if [ -z "$UUID" ]; then
  echo "==> creating $CLIENT_ID (it was missing from the running realm)"
  printf '%s' "$PAYLOAD" | kcadm create clients -r "$REALM" -f - >/dev/null
else
  echo "==> updating $CLIENT_ID ($UUID)"
  printf '%s' "$PAYLOAD" | kcadm update "clients/$UUID" -r "$REALM" -f - >/dev/null
fi

# ── verify by READING BACK, never by trusting the write ─────────────────────
#
# ⚠️ READ THE SINGLE-CLIENT ENDPOINT, NOT THE LIST. `kcadm get clients` does
# NOT return `attributes` however they are requested with `--fields`, so the
# first version of this check reported "PKCE is not S256" against a client that
# had S256 set correctly. A check that reads a field its source never carries
# fails the same way in both directions — this one cried wolf, and the same
# mistake on an assertion phrased the other way round would have PASSED a
# client with no PKCE at all.
echo "==> verifying"
UUID="$(kcadm get clients -r "$REALM" --fields id,clientId --format json 2>/dev/null \
  | python -c "
import json,sys
for c in json.load(sys.stdin):
    if c.get('clientId') == '$CLIENT_ID':
        print(c['id']); break
")"
if [ -z "$UUID" ]; then
  echo "    FAIL - $CLIENT_ID still absent after the write" >&2
  exit 1
fi

kcadm get "clients/$UUID" -r "$REALM" --format json 2>/dev/null \
  | python -c "
import json,sys
want = 'exp://${HOST_IP}:${METRO_PORT}/*'
c = json.load(sys.stdin)
uris = c.get('redirectUris', [])
attrs = c.get('attributes') or {}
pkce = attrs.get('pkce.code.challenge.method')
print('    redirectUris:')
for u in sorted(uris):
    print('      ' + u)
print('    publicClient:', c.get('publicClient'))
print('    PKCE        :', pkce)
if want not in uris:
    sys.exit('    FAIL - %s is NOT registered' % want)
if pkce != 'S256':
    sys.exit('    FAIL - PKCE is not S256; a public client without it is not protected')
if c.get('directAccessGrantsEnabled'):
    sys.exit('    FAIL - direct access grants are ON; the app could collect passwords itself')
print('    OK - phone redirect registered, PKCE enforced, password grant refused')
"
echo "==> done. Start Metro with: MOBILE_HOST=$HOST_IP npx expo start --lan"
