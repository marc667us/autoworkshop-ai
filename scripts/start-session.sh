#!/usr/bin/env bash
# ============================================================================
# START HERE. This script IS the start of a session.
#
#   bash scripts/start-session.sh
#
# It exists because the last three sessions each lost time to the same two
# things, and neither is discoverable by reading code:
#
#   1. STALE SERVERS. `pkill -f` does not kill Windows processes, so a server
#      from a PREVIOUS DAY keeps serving port 3001/4000. The symptoms look
#      exactly like product defects — a finished page renders the "not built
#      yet" catch-all, a new route 404s while an old one answers 401 — and on
#      2026-07-30 that cost an hour before anyone checked the process start
#      time. This script kills them and PROVES the port is free.
#   2. FORGETTING THE MIGRATIONS. Local schema ahead of, or behind, migration
#      history is the drift this repo bans.
#
# It is READ-MOSTLY and idempotent: it kills dev servers, checks Docker, applies
# pending migrations, and then PRINTS what to read and what to run. It does not
# build or start anything — that is the operator's call, and a script that
# silently starts servers is how you end up with two.
# ============================================================================
set -uo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

N_OK=0
N_WARN=0
N_FAIL=0
N_SKIP=0

bold() { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok()   { N_OK=$((N_OK + 1));   printf '  [OK]   %s\n' "$1"; }
warn() { N_WARN=$((N_WARN + 1)); printf '  [WARN] %s\n' "$1"; }
fail() { N_FAIL=$((N_FAIL + 1)); printf '  [FAIL] %s\n' "$1"; }
# A step that could not RUN is not a step that PASSED. Kept as its own state
# because "passed / failed / SKIPPED are three states" is a recorded rule here
# and a skip counted as a pass is how a gate stops being a gate.
skip() { N_SKIP=$((N_SKIP + 1)); printf '  [SKIP] %s\n' "$1"; }

# ── 0. TOOLING, RESOLVED BEFORE ANYTHING IS CONCLUDED FROM IT ──────────────
#
# 🔴 THIS BLOCK EXISTS BECAUSE THIS SCRIPT REPORTED A FALSE OUTAGE ON 2026-08-17.
#
# Run from a shell whose PATH had been stripped, it printed:
#     [FAIL] Docker is not responding. Start Docker Desktop, then re-run.
# and exited — while all five `aw-*` containers were up and healthy, verified
# from PowerShell seconds later. It also lost the stale-server kill entirely
# ("python: command not found", "powershell.exe not on PATH"), which is the one
# thing this script exists to do.
#
# "The tool is not on MY PATH" and "the service is down" are different findings
# with different fixes, and conflating them sends the next session to restart
# Docker Desktop over a shell configuration problem. Every probe below now names
# which of the two it found.
# `${PATH:-}` / `${HOME:-}` because `set -u` aborts on an unset variable and both
# are unset under `env -i` / `env -u HOME`. A session-start script that dies on
# its own first line teaches nothing about the session. (Codex, LOW.)
: "${PATH:=}"
: "${HOME:=}"
add_path() {
  [ -n "$1" ] && [ -d "$1" ] || return 0
  case ":$PATH:" in
    *":$1:"*) ;;
    *) PATH="$PATH:$1" ;;
  esac
}
add_path "/c/Program Files/Git/usr/bin"
add_path "/c/Program Files/Git/bin"
add_path "/c/Program Files/Docker/Docker/resources/bin"
add_path "/c/Windows/System32"
add_path "/c/Windows/System32/WindowsPowerShell/v1.0"
add_path "$HOME/nodejs"
add_path "$HOME/bin"
export PATH

# Resolved once, by name, so the failure message can say WHICH is missing.
PYTHON_BIN="$(command -v python 2>/dev/null || command -v python3 2>/dev/null || command -v py 2>/dev/null || true)"
PWSH_BIN="$(command -v powershell.exe 2>/dev/null || command -v pwsh.exe 2>/dev/null || true)"
DOCKER_BIN="$(command -v docker 2>/dev/null || true)"
# 🔴 curl WAS THE ONE TOOL THIS BLOCK FORGOT, and section 3b calls it four
# times. Under the exact premise this block was written for — a stripped PATH —
# `curl: command not found` yields empty output, which is != "200", so 3b
# printed "minio unreachable — try: docker restart aw-minio" and "keycloak realm
# did not answer" and sent the next session to restart healthy containers over a
# shell-configuration problem. The very defect section 0 exists to prevent,
# committed by section 0. Found by the Supervisor, 2026-08-17.
CURL_BIN="$(command -v curl 2>/dev/null || true)"
CODEX_BIN="$(command -v codex.cmd 2>/dev/null || true)"
[ -n "$CODEX_BIN" ] || { [ -x "$HOME/nodejs/codex.cmd" ] && CODEX_BIN="$HOME/nodejs/codex.cmd"; }

bold "AutoWorkshop AI — session start"
printf '  repo   %s\n' "$(pwd)"
printf '  branch %s\n' "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
printf '  tip    %s\n' "$(git log --oneline -1 2>/dev/null || echo '?')"

# ── 1. the pointer ─────────────────────────────────────────────────────────
bold "1. READ THESE FIRST — in this order"
#
# 🔴 THE POINTER IS DERIVED, NOT TYPED — and it prints each file's AGE.
#
# Until 2026-08-17 this section named `NEXT_SESSION_START_HERE.md` and
# `CURRENT_TASK.md`, which were 12 and 10 days old and had been SUPERSEDED in
# writing by `.claude/TASK_LIST_2026-08-15.md`. The script therefore sent every
# session to the wrong two files while reporting [OK] on both — a pointer that
# is confidently wrong, which is the failure mode this repo has recorded most
# often ("status files have been wrong in BOTH directions").
#
# The newest `TASK_LIST_<date>.md` wins because the dates are ISO and sort
# lexically. Ages are printed so a stale pointer announces itself instead of
# being trusted for another four days.
age_days() {  # whole ELAPSED 24h periods since a file was last modified
  local mtime now age
  mtime="$(date -r "$1" +%s 2>/dev/null)" || { printf '?'; return; }
  now="$(date +%s)"
  age=$(( (now - mtime) / 86400 ))
  # A future mtime (clock skew, a copied file) would otherwise print a negative
  # age, which reads as "fresher than now" instead of "unknown". (Codex, MEDIUM.)
  [ "$age" -lt 0 ] && age=0
  printf '%s' "$age"
}

# ⚠️ `[0-9]*`, not `*`. The glob is what enforces the date convention the sort
# relies on; with a bare `*` a file called `TASK_LIST_ZZ_BACKUP.md` would sort
# above every real date and become "the resume pointer". The comment used to
# claim ISO sorting that the code did not require. (Codex, LOW.)
POINTER="$(ls -1 .claude/TASK_LIST_[0-9]*.md 2>/dev/null | sort | tail -1)"
if [ -n "$POINTER" ]; then
  ok "$POINTER  ← THE RESUME POINTER (newest task list, $(age_days "$POINTER")d old)"
else
  fail "no .claude/TASK_LIST_*.md exists — fall back to SESSION_HANDOVER.md"
fi
for f in .claude/SESSION_HANDOVER.md .claude/CURRENT_PHASE.md; do
  if [ -f "$f" ]; then ok "$f  ($(age_days "$f")d old)"; else fail "$f is MISSING"; fi
done
printf '\n  The task list carries the ranked work and the traps; the handover carries\n'
printf '  what last session MEASURED; the phase file carries where the plan stands.\n'
printf '  ⚠️ Anything above more than ~2 days old is a claim, not a measurement.\n'
printf '     Re-measure before depending on it — that is the recorded rule, and\n'
printf '     it is what these ages are printed for.\n'

# Superseded, kept discoverable rather than deleted: a file that vanishes from
# the pointer list is indistinguishable from one that was forgotten.
for f in .claude/NEXT_SESSION_SCHEDULE.md .claude/TASK_GAP_AND_JOB_LIST.md \
         .claude/NEXT_SESSION_START_HERE.md .claude/CURRENT_TASK.md; do
  [ -f "$f" ] && printf '  [OLD]  %s  (%sd — superseded by the task list above)\n' "$f" "$(age_days "$f")"
done

# ── 2. stale dev servers ───────────────────────────────────────────────────
bold "2. Killing stale dev servers (pkill does NOT work here)"
#
# 🔴 THE PORT LIST IS DERIVED, NOT TYPED. It used to be the literal
# `3000,3001,3002,4000`, which covered three of the SEVEN web apps. A stale
# admin-web on 3006 therefore survived this step twice — on 08-01 it served
# HTTP 200 with none of the session's content, and on 08-02 a process from the
# previous afternoon was still holding the port. Both times the app looked
# built and broken rather than not-restarted.
#
# Reading the ports out of each app's `start` script removes the second list
# there was to remember. 4000 (API) and 8081 (Expo Metro) are appended because
# they are not Next apps and have no `start` script to read.
#
# ⚠️ AND IT SAYS SO WHEN IT CANNOT READ ONE. Codex pointed out that the first
# version of this claimed adding an app "cannot silently omit it" while only
# matching the exact form `next start -p <port>` — so `--port`, `PORT=… next
# start`, or any non-Next server would have been dropped silently, which is the
# original bug wearing a derived-list costume. An app whose start script exists
# but yields no port is now NAMED, because a list that is quietly short is
# exactly what cost two sessions.
#
# 🔴 AND IT WAS STILL QUIETLY SHORT ON 2026-08-17. The Supervisor measured what
# this actually produced — `3000,4000,8081` — against what this repo really
# serves on, and found the guarantee above did not hold:
#   · `apps/storybook` has NO `start` key at all, so `if not start: continue`
#     dropped it with no warning — while its `dev` script is
#     `storybook dev -p 6006`, a real long-lived listener.
#   · `scripts/start-local.sh` — THIS REPO'S OWN LAUNCHER — defaults to
#     `APPS="${APPS:-workshop:3001}"` and documents `supplier:3002 admin:3006`.
#     None of those ports came from `apps/*/package.json`, so a server started
#     the repo's own documented way was never killed and never named.
# So `dev` scripts are now read as well as `start`, an app with NEITHER is
# named rather than dropped, and `start-local.sh`'s own ports are parsed out of
# it. The rule this keeps failing is: a derived list is only honest if it can
# say what it could not derive.
if [ -z "$PYTHON_BIN" ]; then
  skip "no python on PATH — the derived port list cannot be built, so NOTHING was killed."
  printf '      This is a TOOLING gap in this shell, not a repo defect. A stale server\n'
  printf '      from a previous day may still be serving and will look exactly like a\n'
  printf '      product defect. Check by hand before believing any page:\n'
  printf '        powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000,3001,3002,3006,4000,6006,8081 -State Listen"\n'
  PORT_SCAN=""
else
PORT_SCAN="$("$PYTHON_BIN" - <<'PY'
import glob, json, os, re

# The two apps whose port cannot be read from their scripts, because they are
# not Next apps: the API takes its port from the environment and Metro owns 8081
# by convention. Listed HERE rather than appended to the result, so they are
# covered without also being reported as unparsable every single session — a
# warning that fires on a known-good case teaches people to ignore it.
KNOWN = {'api': 4000, 'mobile': 8081}

PORT_RE = (r'(?:-p|--port)[=\s]+(\d{2,5})\b', r'\bPORT=(\d{2,5})\b')

def find_port(cmd):
    for pattern in PORT_RE:
        m = re.search(pattern, cmd)
        if m:
            return int(m.group(1))
    return None

ports, unparsed = set(KNOWN.values()), []
for path in sorted(glob.glob('apps/*/package.json')):
    app = os.path.basename(os.path.dirname(path))
    if app in KNOWN:
        continue
    try:
        with open(path, encoding='utf-8') as fh:
            pkg = json.load(fh)
    except (OSError, ValueError):
        continue
    scripts = pkg.get('scripts') or {}
    # BOTH, not just `start`. A dev server is the thing that goes stale, and
    # storybook only has `dev`.
    candidates = [(k, scripts[k]) for k in ('start', 'dev') if scripts.get(k)]
    if not candidates:
        # An app with neither script cannot listen (apps/e2e), so this is not
        # worth a warning — but it is worth being able to see.
        continue
    found = [find_port(cmd) for _, cmd in candidates]
    if any(p is not None for p in found):
        ports.update(p for p in found if p is not None)
    else:
        unparsed.append('%s -> %s' % (app, '; '.join('%s: %s' % kv for kv in candidates)))

# `scripts/start-local.sh` is this repo's own launcher and its ports live
# NOWHERE in apps/*/package.json. Parsing it here is what stops a server started
# the documented way from surviving this section.
try:
    with open('scripts/start-local.sh', encoding='utf-8') as fh:
        launcher = fh.read()
except OSError:
    launcher = ''
# 🔴 THIS PARSE SEVERED THE WHOLE DOCKER STACK ON 2026-08-17. READ BEFORE EDITING.
#
# The first version matched any `<word>:<port>` in the file:
#     re.findall(r'\b[a-z][a-z0-9-]*:(\d{4,5})\b', launcher)
# which also matches `localhost:8080` inside a URL — so **8080 entered the KILL
# list**. Section 2 then killed whatever was listening on 8080, and on Windows
# that is Docker Desktop's port proxy, not an app. It took the Docker API pipe
# with it: every container became unreachable, `docker ps` failed outright, and
# the next three probes reported postgres/minio/keycloak "down" — a self-inflicted
# outage that reads exactly like the 2026-08-01 fault this script was written to
# detect. Docker Desktop had to be restarted by hand.
#
# TWO INDEPENDENT GUARDS, because either alone would have been enough to stop it
# and the failure was expensive:
#
#   1. ANCHOR ON `APPS`. Only `<name>:<port>` pairs appearing in an APPS
#      assignment or its documented example are app ports. A port in a URL is
#      not an app port.
#   2. NEVER KILL AN INFRASTRUCTURE PORT, whatever the parse says. These belong
#      to the Docker containers this same script checks in section 3; killing
#      one is always wrong, and a derived list must not be able to reach them.
INFRA_PORTS = {5432, 8080, 6379, 4222, 9000, 9001, 3478, 1025, 8025}

local_ports = set()
for line in launcher.splitlines():
    if 'APPS' not in line:
        continue
    for p in re.findall(r'\b[a-z][a-z0-9-]*:(\d{4,5})\b', line):
        local_ports.add(int(p))

# Guard 2 applies to EVERY source, not only the launcher — an app whose start
# script names 8080 must not take the stack down either.
local_ports -= INFRA_PORTS
ports -= INFRA_PORTS
ports.update(local_ports)
blocked = sorted(INFRA_PORTS & {int(p) for p in re.findall(r':(\d{4,5})\b', launcher)})

# ⚠️ THE PORT LIST MUST BE LINE 1 — the shell reads it with `head -1`. Every
# other line is diagnostic and MUST come after it. (The `GUARDED` line was
# briefly printed first, which would have handed the kill list to the shell as
# the string "GUARDED 8080".)
print(','.join(str(p) for p in sorted(ports)))
if blocked:
    print('GUARDED ' + ','.join(str(p) for p in blocked))
if local_ports:
    print('LAUNCHER ' + ','.join(str(p) for p in sorted(local_ports)))
for u in unparsed:
    print('UNPARSED ' + u)
PY
)"
DEV_PORTS="$(printf '%s' "$PORT_SCAN" | head -1)"

# ⚠️ PROCESS SUBSTITUTION, NOT A PIPE. As `... | while read`, the loop is the
# last stage of a pipeline and therefore runs in a SUBSHELL, so every `warn`
# incremented a copy of N_WARN that died with it — the line printed and the
# summary still said "warnings 0". Found by Codex 2026-08-17.
while read -r _ app rest; do
  warn "no port found in ${app}'s start/dev scripts — it will NOT be killed: ${rest}"
done < <(printf '%s\n' "$PORT_SCAN" | grep '^UNPARSED ')

while read -r _ plist; do
  printf '  [INFO] scripts/start-local.sh can also serve on %s — included\n' "$plist"
done < <(printf '%s\n' "$PORT_SCAN" | grep '^LAUNCHER ')

# The guard that stops this section taking the Docker stack down. Printed, not
# silent, so the next person can see it worked rather than assume it.
while read -r _ plist; do
  printf '  [INFO] infrastructure port(s) %s refused for killing — they belong to\n' "$plist"
  printf '         the containers section 3 checks, never to a dev server.\n'
done < <(printf '%s\n' "$PORT_SCAN" | grep '^GUARDED ')

if [ -z "$DEV_PORTS" ]; then
  # 🔴 THIS BRANCH USED TO BE `: # the reason is already printed`. It was not.
  #
  # The KNOWN ports (4000, 8081) are seeded unconditionally, so line 1 is empty
  # ONLY when the interpreter itself failed — a Windows Store python stub, a
  # traceback, a wrong `python`. That is precisely the case where nothing was
  # printed and no counter moved: section 2 did nothing, the summary still read
  # `failed 0 · SKIPPED 0`, and the stale server this whole script exists to
  # kill survived leaving no trace at all. Found by the Supervisor, 2026-08-17.
  skip "the port scan produced NOTHING — '$PYTHON_BIN' failed to run. No server was killed."
  printf '      Re-run it by hand to see the error:  "%s" --version\n' "$PYTHON_BIN"
elif [ -n "$PWSH_BIN" ]; then
  "$PWSH_BIN" -NoProfile -Command "
    \$ports = @(${DEV_PORTS})
  "'
    foreach ($p in $ports) {
      Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
        $pr = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
        if ($pr) {
          Write-Output ("  killed port {0} -> PID {1}, started {2}" -f $p, $pr.Id, $pr.StartTime)
          Stop-Process -Id $pr.Id -Force -ErrorAction SilentlyContinue
        }
      }
    }
    Start-Sleep -Seconds 2
    $remaining = 0
    foreach ($p in $ports) {
      $n = (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count
      if ($n -gt 0) { Write-Output ("  [FAIL] port {0} STILL has {1} listener(s)" -f $p, $n); $remaining += $n }
    }
    if ($remaining -gt 0) { exit 1 } else { exit 0 }
  ' 2>/dev/null | sed 's/^/ /'
  # 🔴 READ THE STATUS, NOT THE OUTPUT. Until 2026-08-17 this called `ok`
  # UNCONDITIONALLY, so a port that survived `Stop-Process` printed
  # "[FAIL] port 3001 STILL has 1 listener(s)" and was then counted as a PASS —
  # while the header of this file claims the script "PROVES the port is free".
  # A denied Stop-Process or a service that reopens the port is exactly the
  # stale-server case this section exists to catch, so the one input that
  # matters was the one it got wrong. Found by Codex.
  #
  # PIPESTATUS[0] is powershell's own status; `sed` would otherwise mask it —
  # the recorded rule, in the same file that already records it.
  if [ "${PIPESTATUS[0]}" -eq 0 ]; then
    ok "ports ${DEV_PORTS} free — re-checked after the kill, nothing still listening"
  else
    fail "a dev server SURVIVED the kill (named above). It will serve stale pages"
    printf '      that look exactly like product defects. Kill it by hand and re-run.\n'
  fi
else
  skip "powershell.exe is not on THIS SHELL'S PATH — no dev server was killed."
  printf '      Tooling gap, not a repo defect. Kill them by hand before building.\n'
fi
fi   # closes the `if [ -z "$PYTHON_BIN" ]` guard opened above

# ── 3. infrastructure ──────────────────────────────────────────────────────
bold "3. Docker infrastructure"
#
# 🔴 TWO DIFFERENT FINDINGS, KEPT APART — see the note in section 0. The old
# code ran `docker ps` and blamed Docker Desktop for every non-zero exit,
# including "the docker CLI is not on this shell's PATH", and then `exit 1`
# threw away the reporting sections that need no Docker at all.
INFRA_OK=0
if [ -z "$DOCKER_BIN" ]; then
  skip "the docker CLI is NOT ON THIS SHELL'S PATH — container state was NOT read."
  printf '      This is NOT evidence that Docker is down. Do not restart Docker Desktop\n'
  printf '      on the strength of it. Read the state directly instead:\n'
  printf '        powershell -NoProfile -Command "docker ps --format \x27{{.Names}}  {{.Status}}\x27"\n'
elif ! "$DOCKER_BIN" ps >/dev/null 2>&1; then
  fail "the docker CLI is present but the DAEMON is not responding — start Docker Desktop."
  printf '      (Do NOT kill wslrelay.exe — it severs host port forwarding.)\n'
else
  INFRA_OK=1
fi

if [ "$INFRA_OK" -eq 1 ]; then
for c in aw-postgres aw-keycloak aw-redis aw-minio aw-nats; do
  line="$("$DOCKER_BIN" ps --filter "name=^${c}$" --format '{{.Status}}' 2>/dev/null)"
  if [ -z "$line" ]; then
    fail "$c is NOT running — try: pnpm infra:up"
  else
    case "$line" in
      *unhealthy*) fail "$c $line" ;;
      *) ok "$c — $line" ;;
    esac
  fi
done
fi   # closes `if [ "$INFRA_OK" -eq 1 ]`

# ── 3b. REACHABILITY FROM THE HOST ─────────────────────────────────────────
#
# ⚠️ DELIBERATELY NOT GATED ON `INFRA_OK`. These probes speak the real protocols
# from the host and need no docker CLI at all — so when section 3 could not read
# container state, THIS is the section that still answers "is the stack usable?".
# Gating it on Docker would have made the tooling gap look like a dead stack.
#
# 🔴 THIS SECTION EXISTS BECAUSE THE CHECK ABOVE LIED FOR FIVE DAYS.
#
# On 2026-08-01 `docker ps` reported all five containers healthy while Redis,
# NATS and MinIO were completely unreachable from the host — Docker's port proxy
# accepted the connection and then closed it without a reply. MinIO answered
# HTTP 200 INSIDE its container and HTTP 000 from outside. The applications run
# on the HOST, so all three were unusable, and nothing said so.
#
# The cause was stale port-forward wiring: postgres and keycloak had been
# restarted on 07-28 and worked; redis, nats and minio had been up since 07-27
# and did not. `docker restart` on the three re-established the mapping.
#
# The warning printed here used to say "a container reporting healthy is not
# proof the service works" — and then the script read container health anyway.
# The warning was right; the check was the weaker one. These probes complete a
# REAL protocol exchange from the host, which is the only thing that can tell
# the difference. No new dependencies: bash /dev/tcp and curl.
printf '\n'
bold "3b. Reachable FROM THE HOST (not from Docker's point of view)"

probe_fail=0

# Redis must answer +PONG, not merely accept a socket.
if reply="$( (exec 3<>/dev/tcp/127.0.0.1/6379 && printf 'PING\r\n' >&3 && timeout 3 head -c 7 <&3; exec 3<&-) 2>/dev/null )" \
   && [ "${reply#+PONG}" != "$reply" ]; then
  ok "redis     answered +PONG"
else
  fail "redis     did NOT answer PING from the host — try: docker restart aw-redis"
  probe_fail=1
fi

# NATS greets every connection with an INFO banner; anything listening on 4222
# would satisfy a bare connect.
if reply="$( (exec 3<>/dev/tcp/127.0.0.1/4222 && timeout 3 head -c 5 <&3; exec 3<&-) 2>/dev/null )" \
   && [ "${reply#INFO}" != "$reply" ]; then
  ok "nats      sent its INFO banner"
else
  fail "nats      sent no INFO banner from the host — try: docker restart aw-nats"
  probe_fail=1
fi

# Postgres, probed HERE rather than inferred from the migration step. Until
# 2026-08-17 this section printed "postgres proved by the migration step below"
# UNCONDITIONALLY — including on every path where that step did not run, which
# left the one dependency with no probe at all carrying an assertion that it had
# been proven. `/dev/tcp` + the startup packet is enough to tell "listening" from
# "the port proxy accepts and closes", which is the 2026-08-01 fault this whole
# section exists for. (Supervisor, 2026-08-17.)
if (exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null; then
  ok "postgres  accepted a connection on 5432"
  PG_REACHABLE=1
else
  fail "postgres  is NOT accepting connections on 5432 — try: docker restart aw-postgres"
  probe_fail=1
  PG_REACHABLE=0
fi

# ⚠️ MinIO takes ~20-30s to become reachable after a restart (its IAM refresh
# runs first), so a single immediate probe reports a false failure.
if [ -z "$CURL_BIN" ]; then
  skip "minio + keycloak NOT probed — curl is not on this shell's PATH."
  printf '      A TOOLING gap. Do NOT restart either container on the strength of it.\n'
  KC_OK=unknown
elif [ "$("$CURL_BIN" -s -o /dev/null -m 5 -w '%{http_code}' http://localhost:9000/minio/health/live 2>/dev/null)" = "200" ]; then
  ok "minio     answered its liveness endpoint"
else
  fail "minio     unreachable from the host — try: docker restart aw-minio, then wait ~30s"
  probe_fail=1
fi

# ⚠️ THE REALM, NOT THE SERVER. Keycloak's own /health/ready answered UP for 30
# hours with a dead database. Asking the REALM for its discovery document makes
# Keycloak read that database.
if [ -z "$CURL_BIN" ]; then
  : # already reported once above; one skip for the pair, not two
elif [ "$("$CURL_BIN" -s -o /dev/null -m 8 -w '%{http_code}' \
        http://localhost:8080/realms/autoworkshop/.well-known/openid-configuration 2>/dev/null)" = "200" ]; then
  ok "keycloak  realm served its discovery document"
else
  fail "keycloak  realm did not answer — sign-in will fail. Try: docker restart aw-keycloak"
  probe_fail=1
fi

if [ "$probe_fail" -eq 1 ]; then
  printf '\n  ⚠️ A dependency is healthy in Docker and unreachable from the host. That is\n'
  printf '     the 2026-08-01 fault: the app runs on the HOST, so it cannot use it.\n'
  printf '     `docker restart <name>` re-establishes the port mapping.\n'
fi

# ── 4. migrations ──────────────────────────────────────────────────────────
bold "4. Migrations (idempotent by tracking, never by IF NOT EXISTS)"
#
# 🔴 THIS CHECK COULD NOT FAIL UNTIL 2026-08-17. It was written as
#     if bash infrastructure/migrations/run.sh 2>&1 | tail -3 | sed …; then
# so the `if` tested SED's exit code, not the migration runner's. sed succeeds
# on any input, so the `fail` branch was unreachable and a broken migration run
# reported clean. That is this repository's own recorded rule — "PIPING TO
# `tail` MASKS THE EXIT CODE" — reproduced inside the session-start script.
#
# The fix is the recorded one: redirect to a file, read the STATUS separately
# from the OUTPUT.
# 🔴 GATED ON POSTGRES, NOT ON THE DOCKER CLI. This read `if [ "$INFRA_OK" -ne 1 ]`
# with the message "section 3 could not confirm Postgres is reachable" — but
# INFRA_OK records only that the *docker CLI* was found and the daemon answered.
# With a stripped PATH and a perfectly healthy stack, migrations were skipped
# over a shell-configuration problem, and the stated reason was not the fact that
# had been measured. 3b now probes Postgres directly, so the gate can use it.
# (Supervisor, 2026-08-17.)
if [ "${PG_REACHABLE:-0}" -ne 1 ]; then
  skip "migrations NOT run — Postgres did not accept a connection on 5432 (section 3b)."
  printf '      Local schema may be behind migration history. That is drift, and this\n'
  printf '      repo bans it. Re-run once Postgres answers.\n'
else
  MIG_LOG="$(mktemp 2>/dev/null || echo /tmp/aw-migrations.$$.log)"
  # 🔴 `</dev/null` IS LOAD-BEARING, NOT TIDINESS. `run.sh` reaches Postgres with
  # `docker exec -i`, and `-i` attaches the CALLER'S stdin — this script's. On
  # 2026-08-17 the runner completed normally ("0 applied, 82 skipped") and the
  # script then hung for seven minutes, because stdin had been consumed and the
  # next command that reads it (`codex --version`, section 4c) blocked forever.
  # A session-start script must never be able to wait on input nobody will type.
  bash infrastructure/migrations/run.sh >"$MIG_LOG" 2>&1 </dev/null
  MIG_RC=$?
  tail -3 "$MIG_LOG" | sed 's/^/  /'
  if [ "$MIG_RC" -eq 0 ]; then
    ok "migration runner exited 0"
  else
    fail "migrations did NOT apply cleanly (exit $MIG_RC) — full log: $MIG_LOG"
  fi
fi
printf '\n  ⚠️ These land on the LOCAL Postgres only. Run them wherever else the DB\n'
printf '     lives before anything depends on them.\n'
printf '  ⚠️ And LOCAL IS SUPERUSER while Render is NOT. A migration that passes here\n'
printf '     can still be refused by FORCE RLS in production. Verify with SET ROLE.\n'

# ── 4b. WHAT LAST SESSION ACTUALLY CHANGED ─────────────────────────────────
#
# Reading the handover tells you what the last session SAID it did. This tells
# you what it DID. The two have disagreed in this repo often enough that the
# rule "measure the repo, do not quote the last handover" is written down.
#
bold "4b. Last session's diff — scripts and workflows it changed"
#
# ⚠️ THE BOUNDARY IS THE WORKING DAY, NOT THE "Session close" COMMIT. The first
# version of this section took the second-newest `Session close` commit — and
# 2026-08-16 alone contains FOUR of them, so it reported "no script changed"
# over a session that had rewritten three instruments and fifteen workflows.
# A boundary that is usually right and silently wrong on a busy day is worse
# than none, because its answer is "nothing happened".
#
# ⚠️ AND IT SELECTS BY DATE, NOT BY TRAVERSAL ORDER. The second version walked
# `git log` and stopped at the first differently-dated commit — but log order is
# topological, not chronological, so one rebased or merged commit dated earlier
# would truncate the range and hide every later-listed commit of the same day.
# `--since` asks git the question directly and has no such failure mode.
# Both defects found by Codex, 2026-08-17.
# ⚠️ `short-local`, NOT `short`. `--date=short` renders the committer date in
# THE COMMIT'S OWN recorded timezone, while `--since`/`--before` interpret their
# argument in the LOCAL zone — so for a commit made near midnight in another
# zone (a CI/bot commit in UTC, a rebase) the two halves disagreed and the
# boundary could land a day out, excluding HEAD itself and reporting "no script
# changed" over a day that changed plenty. Pinning both to local makes the
# comparison self-consistent. (Supervisor, 2026-08-17.)
LAST_DAY="$(git log -1 --format=%cd --date=short-local 2>/dev/null)"
if [ -z "$LAST_DAY" ]; then
  skip "no commits — cannot derive the last session boundary."
else
  DAY_COMMITS="$(git rev-list --count --since="${LAST_DAY} 00:00:00" HEAD 2>/dev/null)"
  # The commit the day STARTED from. Empty when the whole repo is one day old,
  # in which case the empty tree is the correct lower bound — using the root
  # commit instead would silently exclude every file the root introduced.
  BASE="$(git rev-list --before="${LAST_DAY} 00:00:00" -n 1 HEAD 2>/dev/null)"
  if [ -n "$BASE" ]; then
    printf '  last working day %s — %s commit(s), since %s\n' \
      "$LAST_DAY" "$DAY_COMMITS" "$(git log --oneline -1 "$BASE" 2>/dev/null)"
  else
    BASE="$(git hash-object -t tree /dev/null 2>/dev/null)"   # the empty tree
    printf '  last working day %s — %s commit(s); the repo has no earlier day, so\n' \
      "$LAST_DAY" "$DAY_COMMITS"
    printf '  the whole history is shown (lower bound: the empty tree).\n'
  fi

  CHANGED="$(git diff --name-status "$BASE" HEAD -- scripts .github/workflows 2>/dev/null)"
  if [ -z "$CHANGED" ]; then
    ok "no script or workflow changed on $LAST_DAY"
  else
    printf '%s\n' "$CHANGED" | sed 's/^/    /'
  fi

  # ⚠️ COMMITTED WORK ONLY, ABOVE. Uncommitted edits are a separate question and
  # were invisible here until Codex pointed out that this section's own
  # in-progress edit did not appear in it.
  PENDING="$(git status --porcelain -- scripts .github/workflows 2>/dev/null)"
  if [ -n "$PENDING" ]; then
    printf '\n  ⚠️ UNCOMMITTED, in the working tree right now:\n'
    printf '%s\n' "$PENDING" | sed 's/^/    /'
  fi

  if [ -n "$CHANGED" ] || [ -n "$PENDING" ]; then
    printf '\n  ⚠️ Re-read any script above BEFORE trusting its output. Three instruments\n'
    printf '     in this directory were found LYING on 2026-08-16 — defaulted to hosts\n'
    printf '     ADR-021 had deleted, and `curl … || echo 000` yielding `000000`.\n'
  fi
fi

# ── 4c. THE REVIEW LANE ────────────────────────────────────────────────────
#
# Standing owner instruction, recorded 2026-08-04 and reaffirmed since:
# open and run CODEX and the SUPERVISOR only. Do NOT open Google ADK or Stitch.
# This section checks the two that are wanted and names the two that are not,
# because a silent omission reads as an oversight rather than a decision.
bold "4c. Reviewers — Codex and the Supervisor ONLY"
if [ -z "$CODEX_BIN" ]; then
  fail "codex.cmd not found — the FIRST quality gate cannot run. Expected ~/nodejs/codex.cmd"
else
  # 🔴 RUN IT, DO NOT MERELY FIND IT. This read
  #     ok "codex $("$CODEX_BIN" --version || echo '(version unreadable)')"
  # which passes whenever a PATH lookup succeeds — a present-but-broken Codex
  # (missing Node, corrupt install) printed "(version unreadable)" and was
  # counted as a PASS on the gate it is supposed to prove can run. Found by
  # Codex reviewing itself, 2026-08-17.
  # `</dev/null` for the same reason as the migration step: Codex reads its
  # prompt from STDIN by design in this repo, so it must never be handed an open
  # one here — a version check that can block is not a check.
  if CODEX_VER="$("$CODEX_BIN" --version 2>/dev/null </dev/null)" && [ -n "$CODEX_VER" ]; then
    ok "codex  $CODEX_VER  → $CODEX_BIN"
  else
    fail "codex.cmd is present at $CODEX_BIN but --version FAILED — the gate cannot run"
  fi
fi
if [ -f "$HOME/.codex/auth.json" ]; then
  ok "codex auth present (ChatGPT Plus, \$0/call — never propose a paid reviewer)"
else
  fail "no ~/.codex/auth.json — Codex will prompt for sign-in and the gate will stall"
fi
cat <<'REVIEW'
  Supervisor (Claude Code skills, run INDEPENDENTLY of Codex — neither alone has
  been sufficient for six sessions running, and neither is an oracle: check every
  finding against source before acting on it):
      /code-review      /security-review      /verify

  ⛔ NOT OPENED, BY STANDING OWNER INSTRUCTION: Google ADK · Stitch MCP.
     Their absence here is deliberate. Do not "helpfully" start them.

  Codex needs its prompt on STDIN — as argv it reads only the first line:
      printf '%s' "$PROMPT" | "$CODEX_BIN" exec --skip-git-repo-check -
REVIEW

# ── 5. what to do next ─────────────────────────────────────────────────────
bold "5. Next, by hand — the task list named in section 1 has the ranked work"
cat <<'NEXT'
  # four dev identities + seed data (idempotent; password Change_me_locally1!)
  bash scripts/seed-dev-identity.sh
  DEV_USER_ROLE=platform_administrator DEV_USER_EMAIL=admin@autoworkshop.local     bash scripts/seed-dev-identity.sh
  DEV_USER_ROLE=reception_staff        DEV_USER_EMAIL=reception@autoworkshop.local bash scripts/seed-dev-identity.sh
  DEV_USER_ROLE=customer               DEV_USER_EMAIL=customer@autoworkshop.local  bash scripts/seed-dev-identity.sh
  DEV_USER_ROLE=workshop_supervisor    DEV_USER_EMAIL=supervisor@autoworkshop.local bash scripts/seed-dev-identity.sh
  bash scripts/seed-dev-core.sh

  # build + run (rm -rf first: a stale dist/.next is the other phantom-defect source)
  (cd apps/api && rm -rf dist && ./node_modules/.bin/nest build)
  set -a && . ./.env && set +a && (cd apps/api && node dist/main.js &)

  (cd apps/workshop-web && rm -rf .next && ./node_modules/.bin/next build)
  # then next start -p 3001 with AUTH_SECRET/AUTH_URL/API_BASE_URL/KEYCLOAK_* set

  # THEN PROVE THE SERVER IS YOURS — not yesterday's:
  curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4000/api/v1/health   # 200
  powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort 3001 -State Listen | ForEach-Object { Get-Process -Id \$_.OwningProcess | Select-Object Id,StartTime }"
NEXT

bold "Reminders that have each cost a session"
cat <<'RULES'
  · READ THE COUNT, NEVER THE EXIT CODE. `playwright test` once exited 0 while
    running ZERO tests for two days. Baseline: 138 passed / 2 skipped; 344 unit.
  · Playwright runs from apps/e2e via ./node_modules/.bin/playwright test —
    there is no root `pnpm e2e` script.
  · export MSYS_NO_PATHCONV=1 before node scripts taking /paths — but NOT for pnpm.
  · A migration already applied is CHECKSUMMED. Fixes go in the next number.
  · Every refusal must name a REACHABLE alternative. Three slices running, that
    has been the most expensive class of defect in this repo.
  · Codex needs its prompt on STDIN: printf '%s' "$P" | codex.cmd exec ... -
    Passed as an argv string it reads only the first line and asks for the rest.
  · A GH concurrency group is a ONE-SLOT replacement waiting room, not a queue.
    After dispatching a deploy/APPLY/seed/backup, CONFIRM YOUR RUN ID STARTED —
    a `cancelled` run nobody cancelled is an EVICTED request. Re-dispatch it.
  · `gh run view --log` returns 0 bytes. Use:
    gh api repos/marc667us/autoworkshop-ai/actions/jobs/<job_id>/logs
  · Budget live-suite runs — each wakes every service on a free-tier allowance
    that has already been exhausted twice.
RULES

# ── 6. HONEST SUMMARY ──────────────────────────────────────────────────────
#
# Three numbers, not an exit code. A skip is not a pass — that rule is recorded
# in this repository and this script previously had no way to express it.
bold "Session-start result"
printf '  passed %s · failed %s · SKIPPED %s · warnings %s\n' "$N_OK" "$N_FAIL" "$N_SKIP" "$N_WARN"
if [ "$N_SKIP" -gt 0 ]; then
  printf '  ⚠️ %s check(s) did NOT RUN. Their subjects are UNMEASURED, not healthy.\n' "$N_SKIP"
fi
if [ "$N_FAIL" -gt 0 ]; then
  printf '  🔴 %s check(s) FAILED — read them above before building anything.\n' "$N_FAIL"
fi

bold "Ready. Open the task list named in section 1 and start there."

# 🔴 EXIT NON-ZERO WHEN SOMETHING FAILED. The rewrite removed the old `exit 1`
# and left `bold` as the last command, so the script exited 0 even while printing
# "🔴 3 check(s) FAILED" — a green gate over its own red findings. Any caller
# that chains (`bash scripts/start-session.sh && pnpm dev`, a hook, a CI step)
# would have walked straight through. The three-number summary is the right
# HUMAN output; the status is the machine's half of the same answer, and this
# repo's rule is to read the count rather than the exit code, not to make the
# exit code lie. (Supervisor, 2026-08-17.)
#
# A SKIP does not fail the script — it is "unmeasured", and the operator has
# been told so in three places.
[ "$N_FAIL" -eq 0 ]
