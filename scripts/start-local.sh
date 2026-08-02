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
#   bash scripts/start-local.sh                        # workshop only
#   APPS="workshop:3001 supplier:3002 admin:3006" bash scripts/start-local.sh
#   MOBILE_HOST=192.168.0.124 bash scripts/start-local.sh
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

REALM="${KEYCLOAK_REALM:-autoworkshop}"
CONTAINER="${KC_CONTAINER:-aw-keycloak}"
KC_ADMIN="${KEYCLOAK_ADMIN:-admin}"
KC_ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-change_me_locally}"
API_PORT=4000
KC_PORT=8080

# ⚠️ THE ISSUER PROBLEM IS NOT SPECIFIC TO ONE APP. Every one of the seven web
# apps signs in against the same realm, so every one needs the canonical host
# and its own registered redirect. This started as a workshop-only script and
# `verify-catalogue-screens` immediately needed supplier and admin as well —
# so the list is a parameter rather than a fourth place to hardcode a port.
#
# `<workspace>:<port>`. The Keycloak client id is DERIVED as
# `autoworkshop-<workspace>-web`, exactly as `clientIdForWorkspace` derives it
# in packages/auth, so the two cannot disagree.
APPS="${APPS:-workshop:3001}"

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

echo "==> canonical host  : $HOST_IP"
echo "==> Keycloak issuer : ${CANONICAL_KC}/realms/${REALM}"
echo "==> apps            : $APPS"

# ── 1. the web client must accept a redirect back to the LAN origin ────────
kcadm() { MSYS_NO_PATHCONV=1 docker exec -i "$CONTAINER" /opt/keycloak/bin/kcadm.sh "$@"; }

# See the SECRETS note at the top for exactly what this protects and what it
# does not. The password crosses as a `docker exec -e` variable and is expanded
# by a shell INSIDE the container, keeping it out of the host process list.
MSYS_NO_PATHCONV=1 docker exec -i -e KC_PW="$KC_ADMIN_PASS" "$CONTAINER" sh -c \
  '/opt/keycloak/bin/kcadm.sh config credentials --server "$1" --realm master --user "$2" --password "$KC_PW"' \
  _ "http://localhost:${KC_PORT}" "$KC_ADMIN" >/dev/null

CLIENTS_JSON="$(kcadm get clients -r "$REALM" --fields id,clientId --format json 2>/dev/null)"

# The workspaces that actually exist, DERIVED from the directories rather than
# typed, so adding an app covers it automatically. Raised by Codex: `ws` becomes
# a directory path (`apps/<ws>-web`) and a log filename, so an entry containing
# `/` or `..` would read and write outside the intended set. A port-only check
# left that open.
KNOWN_WS="$(ls -d apps/*-web 2>/dev/null | sed 's|apps/||; s|-web$||' | tr '\n' ' ')"

for entry in $APPS; do
  ws="${entry%%:*}"; port="${entry##*:}"
  if ! printf '%s' "$port" | grep -Eq '^[0-9]{1,5}$' || [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
    echo "REFUSING: '$entry' is not <workspace>:<port> with a port in 1-65535." >&2
    exit 1
  fi
  case " $KNOWN_WS " in
    *" $ws "*) ;;
    *)
      echo "REFUSING: '$ws' is not a workspace in this repo." >&2
      echo "  Known: $KNOWN_WS" >&2
      exit 1
      ;;
  esac
  # Derived exactly as packages/auth derives it, so the two cannot disagree.
  client="autoworkshop-${ws}-web"
  url="http://${HOST_IP}:${port}"

  uuid="$(printf '%s' "$CLIENTS_JSON" | python -c "
import json,sys
want = sys.argv[1]
for c in json.load(sys.stdin):
    if c.get('clientId') == want:
        print(c['id']); break
" "$client")"
  if [ -z "$uuid" ]; then
    echo "REFUSING: $client is not in the running realm." >&2
    echo "  The realm is imported once, on Keycloak's FIRST boot; a client added" >&2
    echo "  to realm-autoworkshop.json afterwards exists only on disk." >&2
    exit 1
  fi

  # Merged, never replaced — and built by a JSON encoder so a value cannot
  # change the shape of the document.
  kcadm get "clients/$uuid" -r "$REALM" --format json 2>/dev/null \
    | python -c "
import json, sys
web = sys.argv[1]
c = json.load(sys.stdin)
print(json.dumps({
    'redirectUris': sorted(set(c.get('redirectUris', []) + [web + '/*'])),
    'webOrigins':   sorted(set(c.get('webOrigins', [])   + [web])),
}))
" "$url" | kcadm update "clients/$uuid" -r "$REALM" -f - >/dev/null
  echo "    registered ${url} on ${client}"
done

# ── 2. free the ports ──────────────────────────────────────────────────────
APP_PORT_LIST="$API_PORT"
for entry in $APPS; do APP_PORT_LIST="${APP_PORT_LIST},${entry##*:}"; done
echo "==> freeing ports ${APP_PORT_LIST}"
powershell.exe -NoProfile -Command "
  foreach (\$p in @(${APP_PORT_LIST})) {
    Get-NetTCPConnection -LocalPort \$p -State Listen -ErrorAction SilentlyContinue |
      ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -ErrorAction SilentlyContinue }
  }" 2>/dev/null || true
sleep 2

# 🔴 ASSERT THE PORTS ARE ACTUALLY FREE. Raised by Codex, and it is the defect
# this whole file was written to avoid. The kill above swallows every failure
# with `|| true`, so if PowerShell is missing or the listener belongs to another
# user, the new `next start` dies with EADDRINUSE while the STALE server keeps
# answering — and a readiness probe that only asks "does something reply?" would
# report success against yesterday's build. Exactly the hour lost on 07-30.
STILL_HELD="$(powershell.exe -NoProfile -Command "
  @(${APP_PORT_LIST}) | ForEach-Object {
    if (Get-NetTCPConnection -LocalPort \$_ -State Listen -ErrorAction SilentlyContinue) { \$_ }
  }" 2>/dev/null | tr -d '\r' | tr '\n' ' ')"
if [ -n "$(printf '%s' "$STILL_HELD" | tr -d ' ')" ]; then
  echo "REFUSING: these ports are STILL held after the kill: $STILL_HELD" >&2
  echo "  Starting now would leave a stale server answering while the new one" >&2
  echo "  fails with EADDRINUSE, and everything below would look healthy." >&2
  echo "  Find the owner:  Get-NetTCPConnection -LocalPort <p> -State Listen |" >&2
  echo "                     ForEach-Object { Get-Process -Id \$_.OwningProcess }" >&2
  exit 1
fi

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
for entry in $APPS; do
  ws="${entry%%:*}"; port="${entry##*:}"
  dir="apps/${ws}-web"
  # 🔴 REFUSE A STALE BUILD, NOT MERELY A MISSING ONE. The first version of
  # this checked that `.next` EXISTED and the comment claimed it stopped stale
  # builds — it did not, and Codex called that out. A `.next` from days ago
  # passes an existence test and `next start` serves it happily, which is how
  # three stale servers faked product defects for an hour on 07-30.
  #
  # The real question is whether the build is OLDER THAN THE SOURCE. `BUILD_ID`
  # is written at the end of a successful build, so its timestamp is the build's
  # completion time; anything under the app or the shared packages that is newer
  # than that is not in the bundle being served.
  if [ ! -f "$dir/.next/BUILD_ID" ]; then
    echo "REFUSING: $dir has no completed .next build." >&2
    echo "  Build it:  (cd $dir && rm -rf .next && ./node_modules/.bin/next build)" >&2
    exit 1
  fi
  # ⚠️ `|| true` ON THE FIND, and it is load-bearing rather than sloppy: not
  # every app has a `src/`, `find` exits non-zero for a path that is not there,
  # and under `set -euo pipefail` that killed the whole script SILENTLY — after
  # the API had already started. Only the directories that exist are searched.
  SEARCH=""
  for d in "$dir/app" "$dir/src" packages/*/src; do
    [ -d "$d" ] && SEARCH="$SEARCH $d"
  done
  NEWER="$( { find $SEARCH -type f \
                \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) \
                -newer "$dir/.next/BUILD_ID" 2>/dev/null || true; } | head -3)"
  if [ -n "$NEWER" ]; then
    echo "REFUSING: $dir/.next is OLDER than its source — it would serve a stale build." >&2
    printf '  changed since the build: %s\n' $NEWER >&2
    echo "  Rebuild:  (cd $dir && rm -rf .next && ./node_modules/.bin/next build)" >&2
    exit 1
  fi
  echo "==> starting ${ws}-web on ${port}"
  (
    cd "$dir" &&
    NODE_ENV=production \
    AUTH_URL="http://${HOST_IP}:${port}" \
    AUTH_TRUST_HOST=true \
    KEYCLOAK_URL="$CANONICAL_KC" \
    nohup ./node_modules/.bin/next start -p "$port" -H 0.0.0.0 </dev/null >"/tmp/aw-${ws}-web.log" 2>&1 &
  ) </dev/null
done

# ── 5. prove it, rather than announce it ───────────────────────────────────
URL_LIST="http://localhost:${API_PORT}/api/v1/health"
for entry in $APPS; do
  # `/api/auth/signin` rather than `/`. Raised by Codex: `status < 500` on the
  # root accepted 404, 401 and 403 as healthy, so an app whose routes were all
  # broken still reported ready as long as something answered. This route is
  # rendered by the app's own Auth.js handler, so a 200 proves the server is
  # running THIS app with a working auth config — the thing every browser test
  # below depends on — rather than merely proving a socket is open.
  URL_LIST="${URL_LIST} http://${HOST_IP}:${entry##*:}/api/auth/signin"
done

echo "==> waiting for every service to answer"
for _ in $(seq 1 90); do
  # Explicit expected statuses, never a `< 500` band. A redirect is accepted
  # only as 307/308, which is what a Next landing route legitimately returns.
  if node -e "
    const OK = new Set([200, 307, 308]);
    const urls = '${URL_LIST}'.split(' ').filter(Boolean);
    Promise.all(urls.map(u => fetch(u, { redirect: 'manual' })))
      .then(rs => process.exit(rs.every(r => OK.has(r.status)) ? 0 : 1))
      .catch(() => process.exit(1))
  " 2>/dev/null; then
    ok=1; break
  fi
  sleep 2
done

if [ "${ok:-0}" != "1" ]; then
  echo "  FAILED to come up. Logs: /tmp/aw-api.log /tmp/aw-*-web.log" >&2
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
#   (cd apps/e2e && WORKSHOP_WEB_URL=http://${HOST_IP}:3001 \
#      node verify/verify-pricing-screen.mjs)

echo
for entry in $APPS; do
  printf '  %-9s : http://%s:%s\n' "${entry%%:*}" "$HOST_IP" "${entry##*:}"
done

cat <<INFO

  Mobile    : exp://${HOST_IP}:8081   (run: MOBILE_HOST=${HOST_IP} npx expo start --lan)

  Sign in with the FULL EMAIL, over plain http.
  Accounts are created by scripts/seed-dev-identity.sh; the password is that
  script's DEV_USER_PASSWORD and is not repeated here.

INFO
