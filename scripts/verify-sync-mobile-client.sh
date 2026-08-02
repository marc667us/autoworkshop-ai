#!/usr/bin/env bash
#
# Proof that `sync-mobile-client.sh`'s refusals actually REFUSE.
#
# 🔴 WHY THIS EXISTS. That script relaxes the redirect allow-list of a PUBLIC
# OAuth client. Every guard on it was written as a result of a Codex finding,
# and this repository's most expensive recurring defect is a guard that reads
# correct and never fires — a check that walks through its own gap and reports
# a pass. So each refusal is proven here by INJECTING the failure it exists to
# stop, never by observing that a good run succeeds.
#
# The `docker` stub is the instrument. It records that it was called and exits
# 0, so a guard that failed to fire would let the script reach a real Keycloak
# call — and this test would SEE that and fail. Refusing before `docker` is the
# whole property under test, not a side effect of the command being missing.
#
# ⚠️ AND THERE IS A CONTROL. A test of refusals alone would pass just as
# happily against a script that refused EVERYTHING, which would be a different
# bug with the same green output. Case 4 proves the script still proceeds past
# the guards when the inputs are legitimate.
#
#   bash scripts/verify-sync-mobile-client.sh
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
TARGET="scripts/sync-mobile-client.sh"

STUB_DIR="$(mktemp -d)"
MARKER="$STUB_DIR/docker-was-called"
trap 'rm -rf "$STUB_DIR"' EXIT

# The stub answers every kcadm invocation with empty JSON so the script can get
# as far as it legitimately can, rather than dying for an unrelated reason and
# looking like a refusal.
cat > "$STUB_DIR/docker" <<'STUB'
#!/usr/bin/env bash
echo "called" >> "$DOCKER_CALL_MARKER"
echo "[]"
exit 0
STUB
chmod +x "$STUB_DIR/docker"

pass=0
fail=0

# Runs the target with the given environment and reports whether it refused
# and whether it reached `docker`.
run_case() {
  local label="$1" expect_refuse="$2" expect_docker="$3"
  shift 3
  : > "$MARKER"
  local out rc docker_called
  out="$(env "$@" \
      DOCKER_CALL_MARKER="$MARKER" \
      PATH="$STUB_DIR:$PATH" \
      bash "$TARGET" 2>&1)"
  rc=$?
  if [ -s "$MARKER" ]; then docker_called=yes; else docker_called=no; fi

  local refused=no
  [ "$rc" -ne 0 ] && refused=yes

  if [ "$refused" = "$expect_refuse" ] && [ "$docker_called" = "$expect_docker" ]; then
    echo "  PASS  $label"
    echo "        (exit $rc, docker called: $docker_called)"
    pass=$((pass + 1))
  else
    echo "  FAIL  $label"
    echo "        expected refuse=$expect_refuse docker=$expect_docker"
    echo "        got      refuse=$refused docker=$docker_called (exit $rc)"
    echo "        --- output ---"
    printf '%s\n' "$out" | sed 's/^/        /' | head -20
    fail=$((fail + 1))
  fi
}

echo "1. a remote Keycloak URL must be refused before anything runs"
run_case "https:// realm is refused, and docker is never reached" yes no \
  KEYCLOAK_URL=https://auth.autoworkshop.aiappinvent.com MOBILE_HOST=192.168.0.10

echo
echo "2. a non-local CONTAINER must be refused even with a local-looking URL"
# 🔴 THE FINDING THIS ENCODES. kcadm runs INSIDE the container, so
# http://localhost:8080 is resolved from THAT container's network namespace —
# a production container would have been updated by a command that looked local.
run_case "KC_CONTAINER=prod-keycloak is refused despite localhost URL" yes no \
  KC_CONTAINER=prod-keycloak KEYCLOAK_URL=http://localhost:8080 MOBILE_HOST=192.168.0.10

echo
echo "3. a MOBILE_HOST that is not a plain IPv4 address must be refused"
# The injection this stops: a value that closes the JSON string and appends a
# wildcard redirect. A wildcard on a public client hands the authorization code
# to any address that asks, defeating PKCE.
run_case 'a quote-injection MOBILE_HOST is refused' yes no \
  KEYCLOAK_URL=http://localhost:8080 'MOBILE_HOST=1.2.3.4","*'
run_case 'a hostname (not an IP) is refused' yes no \
  KEYCLOAK_URL=http://localhost:8080 MOBILE_HOST=evil.example.com

echo
echo "4. CONTROL — legitimate input must still get PAST the guards"
# Without this, every check above would pass against a script that refused
# unconditionally. It must reach `docker`; what happens after is the stub's
# business, so only the fact that the guards let it through is asserted.
: > "$MARKER"
out="$(env KEYCLOAK_URL=http://localhost:8080 MOBILE_HOST=192.168.0.10 \
    DOCKER_CALL_MARKER="$MARKER" PATH="$STUB_DIR:$PATH" \
    bash "$TARGET" 2>&1)"
if [ -s "$MARKER" ]; then
  echo "  PASS  valid local input reaches docker — the guards are not blanket refusals"
  pass=$((pass + 1))
else
  echo "  FAIL  valid local input was ALSO refused — the guards refuse everything"
  printf '%s\n' "$out" | sed 's/^/        /' | head -20
  fail=$((fail + 1))
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
