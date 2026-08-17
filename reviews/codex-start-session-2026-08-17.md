codex.cmd : OpenAI Codex v0.147.0
At line:1 char:439
+ ...  -Raw; $p | & C:\Users\USER\nodejs\codex.cmd exec --skip-git-repo-che ...
+                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (OpenAI Codex v0.147.0:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
--------
workdir: C:\Users\USER\Documents\autoworkshop-ai
model: gpt-5.6-sol
provider: openai
approval: never
sandbox: read-only
reasoning effort: none
reasoning summaries: none
session id: 01a00f9d-548c-7940-bf53-e2ad2bec8369
--------
user
Review the UNCOMMITTED changes to `scripts/start-session.sh` in this repository
(run `git diff -- scripts/start-session.sh` to see them). It is the session-start
orientation script: read-mostly, idempotent, and it must never START a server.

What changed today:
1. A PATH-resolution block (section 0) so `python`, `powershell.exe`, `docker`
   and `codex.cmd` are resolved by name before any conclusion is drawn from
   their absence. It exists because the script reported "Docker is not
   responding. Start Docker Desktop" and exit 1 while all five aw-* containers
   were up and healthy â€” the docker CLI was simply not on that shell's PATH.
2. Section 1's pointer list is now DERIVED (newest `.claude/TASK_LIST_*.md`)
   instead of naming two files that were 12 and 10 days stale, and it prints
   each file's age in days.
3. A `skip()` counter so "did not run" is reported separately from "passed",
   plus a final `passed/failed/SKIPPED/warnings` summary.
4. Section 4's migration check no longer pipes into `tail`/`sed` inside `if`
   (it was testing sed's exit code, so its failure branch was unreachable).
5. New section 4b: what the last WORKING DAY changed under scripts/ and
   .github/workflows, boundary derived from commit dates.
6. New section 4c: checks Codex is present and names the Supervisor commands.

Review specifically for:
- Shell correctness under `set -uo pipefail`: unbound variables, quoting,
  subshell/pipeline exit-code handling, the new if/else/fi nesting in section 2.
- Whether any new check CAN actually fail, or is a check that always passes.
  This repo has a recorded defect class of exactly that.
- Whether `age_days` and the awk boundary in 4b are correct and portable to
  Git-for-Windows bash (busybox-ish coreutils).
- Whether anything I added could START a process or mutate state it should not.
- Anything I claimed in a comment that the code does not actually do.

Be concrete: file, line, what breaks, and the failing input. Report severity as
CRITICAL / HIGH / MEDIUM / LOW. If a claim of mine is wrong, say so plainly.


codex
I’ll inspect the diff and the full script context, then exercise the risky shell expressions with representative inputs. I’m treating this as a read-only review; I won’t modify the worktree.
2026-08-17T12:06:41.935214Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git diff -- scripts/start-session.sh; Write-Output 
"`n--- FULL FILE WITH LINES ---"; $n=0; Get-Content scripts/start-session.sh | ForEach-Object { $n++; '"'{0,5}: {1}' -f "'$n, $_ }; Write-Output "`n--- STATUS ---"; git status --short -- 
scripts/start-session.sh'` rejected: blocked by policy
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git diff -- scripts/start-session.sh; Write-Output "`n--- FULL FILE WITH LINES ---"; $n=0; Get-Content 
scripts/start-session.sh | ForEach-Object { $n++; '"'{0,5}: {1}' -f "'$n, $_ }; Write-Output "`n--- STATUS ---"; git status --short -- scripts/start-session.sh' in 
C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git diff -- scripts/start-session.sh; Write-Output "`n--- FULL FILE WITH LINES ---"; $n=0; Get-Content 
scripts/start-session.sh | ForEach-Object { $n++; '"'{0,5}: {1}' -f "'$n, $_ }; Write-Output "`n--- STATUS ---"; git status --short -- scripts/start-session.sh'` rejected: blocked by policy
codex
The combined inspection command was rejected by the workspace policy, so I’m splitting it into simple read-only commands.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git diff -- scripts/start-session.sh' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 1117ms:
diff --git a/scripts/start-session.sh b/scripts/start-session.sh
index 701e224..42b9b49 100644
--- a/scripts/start-session.sh
+++ b/scripts/start-session.sh
@@ -25,10 +25,57 @@ set -uo pipefail
 
 cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
 
+N_OK=0
+N_WARN=0
+N_FAIL=0
+N_SKIP=0
+
 bold() { printf '\n\033[1m%s\033[0m\n' "$1"; }
-ok()   { printf '  [OK]   %s\n' "$1"; }
-warn() { printf '  [WARN] %s\n' "$1"; }
-fail() { printf '  [FAIL] %s\n' "$1"; }
+ok()   { N_OK=$((N_OK + 1));   printf '  [OK]   %s\n' "$1"; }
+warn() { N_WARN=$((N_WARN + 1)); printf '  [WARN] %s\n' "$1"; }
+fail() { N_FAIL=$((N_FAIL + 1)); printf '  [FAIL] %s\n' "$1"; }
+# A step that could not RUN is not a step that PASSED. Kept as its own state
+# because "passed / failed / SKIPPED are three states" is a recorded rule here
+# and a skip counted as a pass is how a gate stops being a gate.
+skip() { N_SKIP=$((N_SKIP + 1)); printf '  [SKIP] %s\n' "$1"; }
+
+# ── 0. TOOLING, RESOLVED BEFORE ANYTHING IS CONCLUDED FROM IT ──────────────
+#
+# 🔴 THIS BLOCK EXISTS BECAUSE THIS SCRIPT REPORTED A FALSE OUTAGE ON 2026-08-17.
+#
+# Run from a shell whose PATH had been stripped, it printed:
+#     [FAIL] Docker is not responding. Start Docker Desktop, then re-run.
+# and exited — while all five `aw-*` containers were up and healthy, verified
+# from PowerShell seconds later. It also lost the stale-server kill entirely
+# ("python: command not found", "powershell.exe not on PATH"), which is the one
+# thing this script exists to do.
+#
+# "The tool is not on MY PATH" and "the service is down" are different findings
+# with different fixes, and conflating them sends the next session to restart
+# Docker Desktop over a shell configuration problem. Every probe below now names
+# which of the two it found.
+add_path() {
+  [ -d "$1" ] || return 0
+  case ":$PATH:" in
+    *":$1:"*) ;;
+    *) PATH="$PATH:$1" ;;
+  esac
+}
+add_path "/c/Program Files/Git/usr/bin"
+add_path "/c/Program Files/Git/bin"
+add_path "/c/Program Files/Docker/Docker/resources/bin"
+add_path "/c/Windows/System32"
+add_path "/c/Windows/System32/WindowsPowerShell/v1.0"
+add_path "$HOME/nodejs"
+add_path "$HOME/bin"
+export PATH
+
+# Resolved once, by name, so the failure message can say WHICH is missing.
+PYTHON_BIN="$(command -v python 2>/dev/null || command -v python3 2>/dev/null || command -v py 2>/dev/null || true)"
+PWSH_BIN="$(command -v powershell.exe 2>/dev/null || command -v pwsh.exe 2>/dev/null || true)"
+DOCKER_BIN="$(command -v docker 2>/dev/null || true)"
+CODEX_BIN="$(command -v codex.cmd 2>/dev/null || true)"
+[ -n "$CODEX_BIN" ] || { [ -x "$HOME/nodejs/codex.cmd" ] && CODEX_BIN="$HOME/nodejs/codex.cmd"; }
 
 bold "AutoWorkshop AI — session start"
 printf '  repo   %s\n' "$(pwd)"
@@ -37,11 +84,47 @@ printf '  tip    %s\n' "$(git log --oneline -1 2>/dev/null || echo '?')"
 
 # ── 1. the pointer ─────────────────────────────────────────────────────────
 bold "1. READ THESE FIRST — in this order"
-for f in .claude/NEXT_SESSION_START_HERE.md .claude/CURRENT_TASK.md; do
-  if [ -f "$f" ]; then ok "$f"; else fail "$f is MISSING"; fi
+#
+# 🔴 THE POINTER IS DERIVED, NOT TYPED — and it prints each file's AGE.
+#
+# Until 2026-08-17 this section named `NEXT_SESSION_START_HERE.md` and
+# `CURRENT_TASK.md`, which were 12 and 10 days old and had been SUPERSEDED in
+# writing by `.claude/TASK_LIST_2026-08-15.md`. The script therefore sent every
+# session to the wrong two files while reporting [OK] on both — a pointer that
+# is confidently wrong, which is the failure mode this repo has recorded most
+# often ("status files have been wrong in BOTH directions").
+#
+# The newest `TASK_LIST_<date>.md` wins because the dates are ISO and sort
+# lexically. Ages are printed so a stale pointer announces itself instead of
+# being trusted for another four days.
+age_days() {  # prints whole days since a file was last modified
+  local mtime now
+  mtime="$(date -r "$1" +%s 2>/dev/null)" || { printf '?'; return; }
+  now="$(date +%s)"
+  printf '%s' "$(( (now - mtime) / 86400 ))"
+}
+
+POINTER="$(ls -1 .claude/TASK_LIST_*.md 2>/dev/null | sort | tail -1)"
+if [ -n "$POINTER" ]; then
+  ok "$POINTER  ← THE RESUME POINTER (newest task list, $(age_days "$POINTER")d old)"
+else
+  fail "no .claude/TASK_LIST_*.md exists — fall back to SESSION_HANDOVER.md"
+fi
+for f in .claude/SESSION_HANDOVER.md .claude/CURRENT_PHASE.md; do
+  if [ -f "$f" ]; then ok "$f  ($(age_days "$f")d old)"; else fail "$f is MISSING"; fi
+done
+printf '\n  The task list carries the ranked work and the traps; the handover carries\n'
+printf '  what last session MEASURED; the phase file carries where the plan stands.\n'
+printf '  ⚠️ Anything above more than ~2 days old is a claim, not a measurement.\n'
+printf '     Re-measure before depending on it — that is the recorded rule, and\n'
+printf '     it is what these ages are printed for.\n'
+
+# Superseded, kept discoverable rather than deleted: a file that vanishes from
+# the pointer list is indistinguishable from one that was forgotten.
+for f in .claude/NEXT_SESSION_SCHEDULE.md .claude/TASK_GAP_AND_JOB_LIST.md \
+         .claude/NEXT_SESSION_START_HERE.md .claude/CURRENT_TASK.md; do
+  [ -f "$f" ] && printf '  [OLD]  %s  (%sd — superseded by the task list above)\n' "$f" "$(age_days "$f")"
 done
-printf '\n  The first file carries: state at last close, the complete outstanding\n'
-printf '  list, and the traps. The second carries the next slice, in steps.\n'
 
 # ── 2. stale dev servers ───────────────────────────────────────────────────
 bold "2. Killing stale dev servers (pkill does NOT work here)"
@@ -64,7 +147,15 @@ bold "2. Killing stale dev servers (pkill does NOT work here)"
 # original bug wearing a derived-list costume. An app whose start script exists
 # but yields no port is now NAMED, because a list that is quietly short is
 # exactly what cost two sessions.
-PORT_SCAN="$(python - <<'PY'
+if [ -z "$PYTHON_BIN" ]; then
+  skip "no python on PATH — the derived port list cannot be built, so NOTHING was killed."
+  printf '      This is a TOOLING gap in this shell, not a repo defect. A stale server\n'
+  printf '      from a previous day may still be serving 3001/4000 and will look exactly\n'
+  printf '      like a product defect. Check by hand before believing any page:\n'
+  printf '        powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3001,4000 -State Listen"\n'
+  PORT_SCAN=""
+else
+PORT_SCAN="$("$PYTHON_BIN" - <<'PY'
 import glob, json, os, re
 
 # The two apps whose port cannot be read from their start script, because they
@@ -106,8 +197,10 @@ printf '%s\n' "$PORT_SCAN" | grep '^UNPARSED ' | while read -r _ app rest; do
   warn "no port found in ${app}'s start script — it will NOT be killed: ${rest}"
 done
 
-if command -v powershell.exe >/dev/null 2>&1; then
-  powershell.exe -NoProfile -Command "
+if [ -z "$DEV_PORTS" ]; then
+  : # section skipped above — the reason is already printed
+elif [ -n "$PWSH_BIN" ]; then
+  "$PWSH_BIN" -NoProfile -Command "
     \$ports = @(${DEV_PORTS})
   "'
     foreach ($p in $ports) {
@@ -127,18 +220,34 @@ if command -v powershell.exe >/dev/null 2>&1; then
   ' 2>/dev/null | sed 's/^/ /'
   ok "ports ${DEV_PORTS} free (anything still listening is printed above)"
 else
-  warn "powershell.exe not on PATH — kill dev servers by hand before building"
+  skip "powershell.exe is not on THIS SHELL'S PATH — no dev server was killed."
+  printf '      Tooling gap, not a repo defect. Kill them by hand before building.\n'
 fi
+fi   # closes the `if [ -z "$PYTHON_BIN" ]` guard opened above
 
 # ── 3. infrastructure ──────────────────────────────────────────────────────
 bold "3. Docker infrastructure"
-if ! docker ps >/dev/null 2>&1; then
-  fail "Docker is not responding. Start Docker Desktop, then re-run this script."
-  printf '  (Do NOT kill wslrelay.exe — it severs host port forwarding.)\n'
-  exit 1
+#
+# 🔴 TWO DIFFERENT FINDINGS, KEPT APART — see the note in section 0. The old
+# code ran `docker ps` and blamed Docker Desktop for every non-zero exit,
+# including "the docker CLI is not on this shell's PATH", and then `exit 1`
+# threw away the reporting sections that need no Docker at all.
+INFRA_OK=0
+if [ -z "$DOCKER_BIN" ]; then
+  skip "the docker CLI is NOT ON THIS SHELL'S PATH — container state was NOT read."
+  printf '      This is NOT evidence that Docker is down. Do not restart Docker Desktop\n'
+  printf '      on the strength of it. Read the state directly instead:\n'
+  printf '        powershell -NoProfile -Command "docker ps --format \x27{{.Names}}  {{.Status}}\x27"\n'
+elif ! "$DOCKER_BIN" ps >/dev/null 2>&1; then
+  fail "the docker CLI is present but the DAEMON is not responding — start Docker Desktop."
+  printf '      (Do NOT kill wslrelay.exe — it severs host port forwarding.)\n'
+else
+  INFRA_OK=1
 fi
+
+if [ "$INFRA_OK" -eq 1 ]; then
 for c in aw-postgres aw-keycloak aw-redis aw-minio aw-nats; do
-  line="$(docker ps --filter "name=^${c}$" --format '{{.Status}}' 2>/dev/null)"
+  line="$("$DOCKER_BIN" ps --filter "name=^${c}$" --format '{{.Status}}' 2>/dev/null)"
   if [ -z "$line" ]; then
     fail "$c is NOT running — try: pnpm infra:up"
   else
@@ -148,9 +257,15 @@ for c in aw-postgres aw-keycloak aw-redis aw-minio aw-nats; do
     esac
   fi
 done
+fi   # closes `if [ "$INFRA_OK" -eq 1 ]`
 
 # ── 3b. REACHABILITY FROM THE HOST ─────────────────────────────────────────
 #
+# ⚠️ DELIBERATELY NOT GATED ON `INFRA_OK`. These probes speak the real protocols
+# from the host and need no docker CLI at all — so when section 3 could not read
+# container state, THIS is the section that still answers "is the stack usable?".
+# Gating it on Docker would have made the tooling gap look like a dead stack.
+#
 # 🔴 THIS SECTION EXISTS BECAUSE THE CHECK ABOVE LIED FOR FIVE DAYS.
 #
 # On 2026-08-01 `docker ps` reported all five containers healthy while Redis,
@@ -225,16 +340,109 @@ fi
 
 # ── 4. migrations ──────────────────────────────────────────────────────────
 bold "4. Migrations (idempotent by tracking, never by IF NOT EXISTS)"
-if bash infrastructure/migrations/run.sh 2>&1 | tail -3 | sed 's/^/  /'; then
-  :
+#
+# 🔴 THIS CHECK COULD NOT FAIL UNTIL 2026-08-17. It was written as
+#     if bash infrastructure/migrations/run.sh 2>&1 | tail -3 | sed …; then
+# so the `if` tested SED's exit code, not the migration runner's. sed succeeds
+# on any input, so the `fail` branch was unreachable and a broken migration run
+# reported clean. That is this repository's own recorded rule — "PIPING TO
+# `tail` MASKS THE EXIT CODE" — reproduced inside the session-start script.
+#
+# The fix is the recorded one: redirect to a file, read the STATUS separately
+# from the OUTPUT.
+if [ "$INFRA_OK" -ne 1 ]; then
+  skip "migrations NOT run — section 3 could not confirm Postgres is reachable."
+  printf '      Local schema may be behind migration history. That is drift, and this\n'
+  printf '      repo bans it. Re-run this script once docker answers.\n'
 else
-  fail "migrations did not apply cleanly — read the output above before building"
+  MIG_LOG="$(mktemp 2>/dev/null || echo /tmp/aw-migrations.$$.log)"
+  bash infrastructure/migrations/run.sh >"$MIG_LOG" 2>&1
+  MIG_RC=$?
+  tail -3 "$MIG_LOG" | sed 's/^/  /'
+  if [ "$MIG_RC" -eq 0 ]; then
+    ok "migration runner exited 0"
+  else
+    fail "migrations did NOT apply cleanly (exit $MIG_RC) — full log: $MIG_LOG"
+  fi
 fi
 printf '\n  ⚠️ These land on the LOCAL Postgres only. Run them wherever else the DB\n'
 printf '     lives before anything depends on them.\n'
+printf '  ⚠️ And LOCAL IS SUPERUSER while Render is NOT. A migration that passes here\n'
+printf '     can still be refused by FORCE RLS in production. Verify with SET ROLE.\n'
+
+# ── 4b. WHAT LAST SESSION ACTUALLY CHANGED ─────────────────────────────────
+#
+# Reading the handover tells you what the last session SAID it did. This tells
+# you what it DID. The two have disagreed in this repo often enough that the
+# rule "measure the repo, do not quote the last handover" is written down.
+#
+# The boundary is derived from the newest "Session close" commit rather than
+# typed, so it stays correct without maintenance.
+bold "4b. Last session's diff — scripts and workflows it changed"
+#
+# ⚠️ THE BOUNDARY IS THE WORKING DAY, NOT THE "Session close" COMMIT. The first
+# version of this section took the second-newest `Session close` commit — and
+# 2026-08-16 alone contains FOUR of them, so it reported "no script changed"
+# over a session that had rewritten three instruments and fifteen workflows.
+# A boundary that is usually right and silently wrong on a busy day is worse
+# than none, because its answer is "nothing happened".
+LAST_DAY="$(git log -1 --format=%cd --date=short 2>/dev/null)"
+LAST_CLOSE="$(git log --format='%H %cd' --date=short 2>/dev/null \
+              | awk -v d="$LAST_DAY" '$2 != d { print $1; exit }')"
+if [ -z "$LAST_DAY" ]; then
+  skip "no commits — cannot derive the last session boundary."
+elif [ -z "$LAST_CLOSE" ]; then
+  warn "every commit in this repo is from $LAST_DAY — showing the whole history"
+  LAST_CLOSE="$(git rev-list --max-parents=0 HEAD 2>/dev/null | tail -1)"
+fi
+if [ -n "$LAST_CLOSE" ]; then
+  printf '  last working day %s — %s commit(s), since %s\n' \
+    "$LAST_DAY" \
+    "$(git rev-list --count "$LAST_CLOSE"..HEAD 2>/dev/null)" \
+    "$(git log --oneline -1 "$LAST_CLOSE" 2>/dev/null)"
+  CHANGED="$(git diff --name-status "$LAST_CLOSE"..HEAD -- scripts .github/workflows 2>/dev/null)"
+  if [ -z "$CHANGED" ]; then
+    ok "no script or workflow changed since that close"
+  else
+    printf '%s\n' "$CHANGED" | sed 's/^/    /'
+    printf '\n  ⚠️ Re-read any script above BEFORE trusting its output. Three instruments\n'
+    printf '     in this directory were found LYING on 2026-08-16 — defaulted to hosts\n'
+    printf '     ADR-021 had deleted, and `curl … || echo 000` yielding `000000`.\n'
+  fi
+fi
+
+# ── 4c. THE REVIEW LANE ────────────────────────────────────────────────────
+#
+# Standing owner instruction, recorded 2026-08-04 and reaffirmed since:
+# open and run CODEX and the SUPERVISOR only. Do NOT open Google ADK or Stitch.
+# This section checks the two that are wanted and names the two that are not,
+# because a silent omission reads as an oversight rather than a decision.
+bold "4c. Reviewers — Codex and the Supervisor ONLY"
+if [ -z "$CODEX_BIN" ]; then
+  fail "codex.cmd not found — the FIRST quality gate cannot run. Expected ~/nodejs/codex.cmd"
+else
+  ok "codex  $("$CODEX_BIN" --version 2>/dev/null || echo '(version unreadable)')  → $CODEX_BIN"
+fi
+if [ -f "$HOME/.codex/auth.json" ]; then
+  ok "codex auth present (ChatGPT Plus, \$0/call — never propose a paid reviewer)"
+else
+  fail "no ~/.codex/auth.json — Codex will prompt for sign-in and the gate will stall"
+fi
+cat <<'REVIEW'
+  Supervisor (Claude Code skills, run INDEPENDENTLY of Codex — neither alone has
+  been sufficient for six sessions running, and neither is an oracle: check every
+  finding against source before acting on it):
+      /code-review      /security-review      /verify
+
+  ⛔ NOT OPENED, BY STANDING OWNER INSTRUCTION: Google ADK · Stitch MCP.
+     Their absence here is deliberate. Do not "helpfully" start them.
+
+  Codex needs its prompt on STDIN — as argv it reads only the first line:
+      printf '%s' "$PROMPT" | "$CODEX_BIN" exec --skip-git-repo-check -
+REVIEW
 
 # ── 5. what to do next ─────────────────────────────────────────────────────
-bold "5. Next, by hand — section 1 of NEXT_SESSION_START_HERE.md has the detail"
+bold "5. Next, by hand — the task list named in section 1 has the ranked work"
 cat <<'NEXT'
   # four dev identities + seed data (idempotent; password Change_me_locally1!)
   bash scripts/seed-dev-identity.sh
@@ -268,6 +476,26 @@ cat <<'RULES'
     has been the most expensive class of defect in this repo.
   · Codex needs its prompt on STDIN: printf '%s' "$P" | codex.cmd exec ... -
     Passed as an argv string it reads only the first line and asks for the rest.
+  · A GH concurrency group is a ONE-SLOT replacement waiting room, not a queue.
+    After dispatching a deploy/APPLY/seed/backup, CONFIRM YOUR RUN ID STARTED —
+    a `cancelled` run nobody cancelled is an EVICTED request. Re-dispatch it.
+  · `gh run view --log` returns 0 bytes. Use:
+    gh api repos/marc667us/autoworkshop-ai/actions/jobs/<job_id>/logs
+  · Budget live-suite runs — each wakes every service on a free-tier allowance
+    that has already been exhausted twice.
 RULES
 
-bold "Ready. Open .claude/NEXT_SESSION_START_HERE.md and start there."
+# ── 6. HONEST SUMMARY ──────────────────────────────────────────────────────
+#
+# Three numbers, not an exit code. A skip is not a pass — that rule is recorded
+# in this repository and this script previously had no way to express it.
+bold "Session-start result"
+printf '  passed %s · failed %s · SKIPPED %s · warnings %s\n' "$N_OK" "$N_FAIL" "$N_SKIP" "$N_WARN"
+if [ "$N_SKIP" -gt 0 ]; then
+  printf '  ⚠️ %s check(s) did NOT RUN. Their subjects are UNMEASURED, not healthy.\n' "$N_SKIP"
+fi
+if [ "$N_FAIL" -gt 0 ]; then
+  printf '  🔴 %s check(s) FAILED — read them above before building anything.\n' "$N_FAIL"
+fi
+
+bold "Ready. Open the task list named in section 1 and start there."

2026-08-17T12:06:54.657594Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "bash -n scripts/start-session.sh; if (Get-Command 
shellcheck -ErrorAction SilentlyContinue) { shellcheck -x scripts/start-session.sh } else { Write-Output 'shellcheck unavailable' }; cmd /c findstr /n \""'^" scripts'"\\start-session.sh"` 
rejected: blocked by policy
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "bash -n scripts/start-session.sh; if (Get-Command shellcheck -ErrorAction SilentlyContinue) { shellcheck -x 
scripts/start-session.sh } else { Write-Output 'shellcheck unavailable' }; cmd /c findstr /n \""'^" scripts'"\\start-session.sh" in C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "bash -n scripts/start-session.sh; if (Get-Command shellcheck -ErrorAction SilentlyContinue) { shellcheck -x 
scripts/start-session.sh } else { Write-Output 'shellcheck unavailable' }; cmd /c findstr /n \""'^" scripts'"\\start-session.sh"` rejected: blocked by policy
2026-08-17T12:06:58.026452Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'bash -n scripts/start-session.sh'` rejected: blocked 
by policy
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'bash -n scripts/start-session.sh' in C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'bash -n scripts/start-session.sh'` rejected: blocked by policy
2026-08-17T12:07:01.888352Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Command bash | Format-List Source'` rejected: 
blocked by policy
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Command bash | Format-List Source' in C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Command bash | Format-List Source'` rejected: blocked by policy
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "''^" scripts/start-session.sh' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 4254ms:
1:#!/usr/bin/env bash
2:# ============================================================================
3:# START HERE. This script IS the start of a session.
4:#
5:#   bash scripts/start-session.sh
6:#
7:# It exists because the last three sessions each lost time to the same two
8:# things, and neither is discoverable by reading code:
9:#
10:#   1. STALE SERVERS. `pkill -f` does not kill Windows processes, so a server
11:#      from a PREVIOUS DAY keeps serving port 3001/4000. The symptoms look
12:#      exactly like product defects — a finished page renders the "not built
13:#      yet" catch-all, a new route 404s while an old one answers 401 — and on
14:#      2026-07-30 that cost an hour before anyone checked the process start
15:#      time. This script kills them and PROVES the port is free.
16:#   2. FORGETTING THE MIGRATIONS. Local schema ahead of, or behind, migration
17:#      history is the drift this repo bans.
18:#
19:# It is READ-MOSTLY and idempotent: it kills dev servers, checks Docker, applies
20:# pending migrations, and then PRINTS what to read and what to run. It does not
21:# build or start anything — that is the operator's call, and a script that
22:# silently starts servers is how you end up with two.
23:# ============================================================================
24:set -uo pipefail
25:
26:cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
27:
28:N_OK=0
29:N_WARN=0
30:N_FAIL=0
31:N_SKIP=0
32:
33:bold() { printf '\n\033[1m%s\033[0m\n' "$1"; }
34:ok()   { N_OK=$((N_OK + 1));   printf '  [OK]   %s\n' "$1"; }
35:warn() { N_WARN=$((N_WARN + 1)); printf '  [WARN] %s\n' "$1"; }
36:fail() { N_FAIL=$((N_FAIL + 1)); printf '  [FAIL] %s\n' "$1"; }
37:# A step that could not RUN is not a step that PASSED. Kept as its own state
38:# because "passed / failed / SKIPPED are three states" is a recorded rule here
39:# and a skip counted as a pass is how a gate stops being a gate.
40:skip() { N_SKIP=$((N_SKIP + 1)); printf '  [SKIP] %s\n' "$1"; }
41:
42:# ── 0. TOOLING, RESOLVED BEFORE ANYTHING IS CONCLUDED FROM IT ──────────────
43:#
44:# 🔴 THIS BLOCK EXISTS BECAUSE THIS SCRIPT REPORTED A FALSE OUTAGE ON 2026-08-17.
45:#
46:# Run from a shell whose PATH had been stripped, it printed:
47:#     [FAIL] Docker is not responding. Start Docker Desktop, then re-run.
48:# and exited — while all five `aw-*` containers were up and healthy, verified
49:# from PowerShell seconds later. It also lost the stale-server kill entirely
50:# ("python: command not found", "powershell.exe not on PATH"), which is the one
51:# thing this script exists to do.
52:#
53:# "The tool is not on MY PATH" and "the service is down" are different findings
54:# with different fixes, and conflating them sends the next session to restart
55:# Docker Desktop over a shell configuration problem. Every probe below now names
56:# which of the two it found.
57:add_path() {
58:  [ -d "$1" ] || return 0
59:  case ":$PATH:" in
60:    *":$1:"*) ;;
61:    *) PATH="$PATH:$1" ;;
62:  esac
63:}
64:add_path "/c/Program Files/Git/usr/bin"
65:add_path "/c/Program Files/Git/bin"
66:add_path "/c/Program Files/Docker/Docker/resources/bin"
67:add_path "/c/Windows/System32"
68:add_path "/c/Windows/System32/WindowsPowerShell/v1.0"
69:add_path "$HOME/nodejs"
70:add_path "$HOME/bin"
71:export PATH
72:
73:# Resolved once, by name, so the failure message can say WHICH is missing.
74:PYTHON_BIN="$(command -v python 2>/dev/null || command -v python3 2>/dev/null || command -v py 2>/dev/null || true)"
75:PWSH_BIN="$(command -v powershell.exe 2>/dev/null || command -v pwsh.exe 2>/dev/null || true)"
76:DOCKER_BIN="$(command -v docker 2>/dev/null || true)"
77:CODEX_BIN="$(command -v codex.cmd 2>/dev/null || true)"
78:[ -n "$CODEX_BIN" ] || { [ -x "$HOME/nodejs/codex.cmd" ] && CODEX_BIN="$HOME/nodejs/codex.cmd"; }
79:
80:bold "AutoWorkshop AI — session start"
81:printf '  repo   %s\n' "$(pwd)"
82:printf '  branch %s\n' "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
83:printf '  tip    %s\n' "$(git log --oneline -1 2>/dev/null || echo '?')"
84:
85:# ── 1. the pointer ─────────────────────────────────────────────────────────
86:bold "1. READ THESE FIRST — in this order"
87:#
88:# 🔴 THE POINTER IS DERIVED, NOT TYPED — and it prints each file's AGE.
89:#
90:# Until 2026-08-17 this section named `NEXT_SESSION_START_HERE.md` and
91:# `CURRENT_TASK.md`, which were 12 and 10 days old and had been SUPERSEDED in
92:# writing by `.claude/TASK_LIST_2026-08-15.md`. The script therefore sent every
93:# session to the wrong two files while reporting [OK] on both — a pointer that
94:# is confidently wrong, which is the failure mode this repo has recorded most
95:# often ("status files have been wrong in BOTH directions").
96:#
97:# The newest `TASK_LIST_<date>.md` wins because the dates are ISO and sort
98:# lexically. Ages are printed so a stale pointer announces itself instead of
99:# being trusted for another four days.
100:age_days() {  # prints whole days since a file was last modified
101:  local mtime now
102:  mtime="$(date -r "$1" +%s 2>/dev/null)" || { printf '?'; return; }
103:  now="$(date +%s)"
104:  printf '%s' "$(( (now - mtime) / 86400 ))"
105:}
106:
107:POINTER="$(ls -1 .claude/TASK_LIST_*.md 2>/dev/null | sort | tail -1)"
108:if [ -n "$POINTER" ]; then
109:  ok "$POINTER  ← THE RESUME POINTER (newest task list, $(age_days "$POINTER")d old)"
110:else
111:  fail "no .claude/TASK_LIST_*.md exists — fall back to SESSION_HANDOVER.md"
112:fi
113:for f in .claude/SESSION_HANDOVER.md .claude/CURRENT_PHASE.md; do
114:  if [ -f "$f" ]; then ok "$f  ($(age_days "$f")d old)"; else fail "$f is MISSING"; fi
115:done
116:printf '\n  The task list carries the ranked work and the traps; the handover carries\n'
117:printf '  what last session MEASURED; the phase file carries where the plan stands.\n'
118:printf '  ⚠️ Anything above more than ~2 days old is a claim, not a measurement.\n'
119:printf '     Re-measure before depending on it — that is the recorded rule, and\n'
120:printf '     it is what these ages are printed for.\n'
121:
122:# Superseded, kept discoverable rather than deleted: a file that vanishes from
123:# the pointer list is indistinguishable from one that was forgotten.
124:for f in .claude/NEXT_SESSION_SCHEDULE.md .claude/TASK_GAP_AND_JOB_LIST.md \
125:         .claude/NEXT_SESSION_START_HERE.md .claude/CURRENT_TASK.md; do
126:  [ -f "$f" ] && printf '  [OLD]  %s  (%sd — superseded by the task list above)\n' "$f" "$(age_days "$f")"
127:done
128:
129:# ── 2. stale dev servers ───────────────────────────────────────────────────
130:bold "2. Killing stale dev servers (pkill does NOT work here)"
131:#
132:# 🔴 THE PORT LIST IS DERIVED, NOT TYPED. It used to be the literal
133:# `3000,3001,3002,4000`, which covered three of the SEVEN web apps. A stale
134:# admin-web on 3006 therefore survived this step twice — on 08-01 it served
135:# HTTP 200 with none of the session's content, and on 08-02 a process from the
136:# previous afternoon was still holding the port. Both times the app looked
137:# built and broken rather than not-restarted.
138:#
139:# Reading the ports out of each app's `start` script removes the second list
140:# there was to remember. 4000 (API) and 8081 (Expo Metro) are appended because
141:# they are not Next apps and have no `start` script to read.
142:#
143:# ⚠️ AND IT SAYS SO WHEN IT CANNOT READ ONE. Codex pointed out that the first
144:# version of this claimed adding an app "cannot silently omit it" while only
145:# matching the exact form `next start -p <port>` — so `--port`, `PORT=… next
146:# start`, or any non-Next server would have been dropped silently, which is the
147:# original bug wearing a derived-list costume. An app whose start script exists
148:# but yields no port is now NAMED, because a list that is quietly short is
149:# exactly what cost two sessions.
150:if [ -z "$PYTHON_BIN" ]; then
151:  skip "no python on PATH — the derived port list cannot be built, so NOTHING was killed."
152:  printf '      This is a TOOLING gap in this shell, not a repo defect. A stale server\n'
153:  printf '      from a previous day may still be serving 3001/4000 and will look exactly\n'
154:  printf '      like a product defect. Check by hand before believing any page:\n'
155:  printf '        powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3001,4000 -State Listen"\n'
156:  PORT_SCAN=""
157:else
158:PORT_SCAN="$("$PYTHON_BIN" - <<'PY'
159:import glob, json, os, re
160:
161:# The two apps whose port cannot be read from their start script, because they
162:# are not Next apps: the API takes its port from the environment and Metro owns
163:# 8081 by convention. Listed HERE rather than appended to the result, so they
164:# are covered without also being reported as unparsable every single session —
165:# a warning that fires on a known-good case teaches people to ignore it.
166:KNOWN = {'api': 4000, 'mobile': 8081}
167:
168:ports, unparsed = set(KNOWN.values()), []
169:for path in sorted(glob.glob('apps/*/package.json')):
170:    app = os.path.basename(os.path.dirname(path))
171:    if app in KNOWN:
172:        continue
173:    try:
174:        with open(path, encoding='utf-8') as fh:
175:            pkg = json.load(fh)
176:    except (OSError, ValueError):
177:        continue
178:    start = (pkg.get('scripts') or {}).get('start')
179:    if not start:
180:        continue
181:    # -p 3001 | --port 3001 | --port=3001 | PORT=3001
182:    m = re.search(r'(?:-p|--port)[=\s]+(\d{2,5})\b', start) or \
183:        re.search(r'\bPORT=(\d{2,5})\b', start)
184:    if m:
185:        ports.add(int(m.group(1)))
186:    else:
187:        unparsed.append('%s -> %s' % (app, start))
188:
189:print(','.join(str(p) for p in sorted(ports)))
190:for u in unparsed:
191:    print('UNPARSED ' + u)
192:PY
193:)"
194:DEV_PORTS="$(printf '%s' "$PORT_SCAN" | head -1)"
195:
196:printf '%s\n' "$PORT_SCAN" | grep '^UNPARSED ' | while read -r _ app rest; do
197:  warn "no port found in ${app}'s start script — it will NOT be killed: ${rest}"
198:done
199:
200:if [ -z "$DEV_PORTS" ]; then
201:  : # section skipped above — the reason is already printed
202:elif [ -n "$PWSH_BIN" ]; then
203:  "$PWSH_BIN" -NoProfile -Command "
204:    \$ports = @(${DEV_PORTS})
205:  "'
206:    foreach ($p in $ports) {
207:      Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
208:        $pr = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
209:        if ($pr) {
210:          Write-Output ("  killed port {0} -> PID {1}, started {2}" -f $p, $pr.Id, $pr.StartTime)
211:          Stop-Process -Id $pr.Id -Force -ErrorAction SilentlyContinue
212:        }
213:      }
214:    }
215:    Start-Sleep -Seconds 2
216:    foreach ($p in $ports) {
217:      $n = (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count
218:      if ($n -gt 0) { Write-Output ("  [FAIL] port {0} STILL has {1} listener(s)" -f $p, $n) }
219:    }
220:  ' 2>/dev/null | sed 's/^/ /'
221:  ok "ports ${DEV_PORTS} free (anything still listening is printed above)"
222:else
223:  skip "powershell.exe is not on THIS SHELL'S PATH — no dev server was killed."
224:  printf '      Tooling gap, not a repo defect. Kill them by hand before building.\n'
225:fi
226:fi   # closes the `if [ -z "$PYTHON_BIN" ]` guard opened above
227:
228:# ── 3. infrastructure ──────────────────────────────────────────────────────
229:bold "3. Docker infrastructure"
230:#
231:# 🔴 TWO DIFFERENT FINDINGS, KEPT APART — see the note in section 0. The old
232:# code ran `docker ps` and blamed Docker Desktop for every non-zero exit,
233:# including "the docker CLI is not on this shell's PATH", and then `exit 1`
234:# threw away the reporting sections that need no Docker at all.
235:INFRA_OK=0
236:if [ -z "$DOCKER_BIN" ]; then
237:  skip "the docker CLI is NOT ON THIS SHELL'S PATH — container state was NOT read."
238:  printf '      This is NOT evidence that Docker is down. Do not restart Docker Desktop\n'
239:  printf '      on the strength of it. Read the state directly instead:\n'
240:  printf '        powershell -NoProfile -Command "docker ps --format \x27{{.Names}}  {{.Status}}\x27"\n'
241:elif ! "$DOCKER_BIN" ps >/dev/null 2>&1; then
242:  fail "the docker CLI is present but the DAEMON is not responding — start Docker Desktop."
243:  printf '      (Do NOT kill wslrelay.exe — it severs host port forwarding.)\n'
244:else
245:  INFRA_OK=1
246:fi
247:
248:if [ "$INFRA_OK" -eq 1 ]; then
249:for c in aw-postgres aw-keycloak aw-redis aw-minio aw-nats; do
250:  line="$("$DOCKER_BIN" ps --filter "name=^${c}$" --format '{{.Status}}' 2>/dev/null)"
251:  if [ -z "$line" ]; then
252:    fail "$c is NOT running — try: pnpm infra:up"
253:  else
254:    case "$line" in
255:      *unhealthy*) fail "$c $line" ;;
256:      *) ok "$c — $line" ;;
257:    esac
258:  fi
259:done
260:fi   # closes `if [ "$INFRA_OK" -eq 1 ]`
261:
262:# ── 3b. REACHABILITY FROM THE HOST ─────────────────────────────────────────
263:#
264:# ⚠️ DELIBERATELY NOT GATED ON `INFRA_OK`. These probes speak the real protocols
265:# from the host and need no docker CLI at all — so when section 3 could not read
266:# container state, THIS is the section that still answers "is the stack usable?".
267:# Gating it on Docker would have made the tooling gap look like a dead stack.
268:#
269:# 🔴 THIS SECTION EXISTS BECAUSE THE CHECK ABOVE LIED FOR FIVE DAYS.
270:#
271:# On 2026-08-01 `docker ps` reported all five containers healthy while Redis,
272:# NATS and MinIO were completely unreachable from the host — Docker's port proxy
273:# accepted the connection and then closed it without a reply. MinIO answered
274:# HTTP 200 INSIDE its container and HTTP 000 from outside. The applications run
275:# on the HOST, so all three were unusable, and nothing said so.
276:#
277:# The cause was stale port-forward wiring: postgres and keycloak had been
278:# restarted on 07-28 and worked; redis, nats and minio had been up since 07-27
279:# and did not. `docker restart` on the three re-established the mapping.
280:#
281:# The warning printed here used to say "a container reporting healthy is not
282:# proof the service works" — and then the script read container health anyway.
283:# The warning was right; the check was the weaker one. These probes complete a
284:# REAL protocol exchange from the host, which is the only thing that can tell
285:# the difference. No new dependencies: bash /dev/tcp and curl.
286:printf '\n'
287:bold "3b. Reachable FROM THE HOST (not from Docker's point of view)"
288:
289:probe_fail=0
290:
291:# Redis must answer +PONG, not merely accept a socket.
292:if reply="$( (exec 3<>/dev/tcp/127.0.0.1/6379 && printf 'PING\r\n' >&3 && timeout 3 head -c 7 <&3; exec 3<&-) 2>/dev/null )" \
293:   && [ "${reply#+PONG}" != "$reply" ]; then
294:  ok "redis     answered +PONG"
295:else
296:  fail "redis     did NOT answer PING from the host — try: docker restart aw-redis"
297:  probe_fail=1
298:fi
299:
300:# NATS greets every connection with an INFO banner; anything listening on 4222
301:# would satisfy a bare connect.
302:if reply="$( (exec 3<>/dev/tcp/127.0.0.1/4222 && timeout 3 head -c 5 <&3; exec 3<&-) 2>/dev/null )" \
303:   && [ "${reply#INFO}" != "$reply" ]; then
304:  ok "nats      sent its INFO banner"
305:else
306:  fail "nats      sent no INFO banner from the host — try: docker restart aw-nats"
307:  probe_fail=1
308:fi
309:
310:# ⚠️ MinIO takes ~20-30s to become reachable after a restart (its IAM refresh
311:# runs first), so a single immediate probe reports a false failure.
312:if [ "$(curl -s -o /dev/null -m 5 -w '%{http_code}' http://localhost:9000/minio/health/live 2>/dev/null)" = "200" ]; then
313:  ok "minio     answered its liveness endpoint"
314:else
315:  fail "minio     unreachable from the host — try: docker restart aw-minio, then wait ~30s"
316:  probe_fail=1
317:fi
318:
319:# ⚠️ THE REALM, NOT THE SERVER. Keycloak's own /health/ready answered UP for 30
320:# hours with a dead database. Asking the REALM for its discovery document makes
321:# Keycloak read that database.
322:if [ "$(curl -s -o /dev/null -m 8 -w '%{http_code}' \
323:        http://localhost:8080/realms/autoworkshop/.well-known/openid-configuration 2>/dev/null)" = "200" ]; then
324:  ok "keycloak  realm served its discovery document"
325:else
326:  fail "keycloak  realm did not answer — sign-in will fail. Try: docker restart aw-keycloak"
327:  probe_fail=1
328:fi
329:
330:# Postgres is deliberately NOT probed here: section 4 connects to it for real to
331:# apply migrations, which is stronger evidence than any handshake this script
332:# could fake. A failure there is a Postgres failure.
333:printf '  %s\n' "postgres  proved by the migration step below, which really connects"
334:
335:if [ "$probe_fail" -eq 1 ]; then
336:  printf '\n  ⚠️ A dependency is healthy in Docker and unreachable from the host. That is\n'
337:  printf '     the 2026-08-01 fault: the app runs on the HOST, so it cannot use it.\n'
338:  printf '     `docker restart <name>` re-establishes the port mapping.\n'
339:fi
340:
341:# ── 4. migrations ──────────────────────────────────────────────────────────
342:bold "4. Migrations (idempotent by tracking, never by IF NOT EXISTS)"
343:#
344:# 🔴 THIS CHECK COULD NOT FAIL UNTIL 2026-08-17. It was written as
345:#     if bash infrastructure/migrations/run.sh 2>&1 | tail -3 | sed …; then
346:# so the `if` tested SED's exit code, not the migration runner's. sed succeeds
347:# on any input, so the `fail` branch was unreachable and a broken migration run
348:# reported clean. That is this repository's own recorded rule — "PIPING TO
349:# `tail` MASKS THE EXIT CODE" — reproduced inside the session-start script.
350:#
351:# The fix is the recorded one: redirect to a file, read the STATUS separately
352:# from the OUTPUT.
353:if [ "$INFRA_OK" -ne 1 ]; then
354:  skip "migrations NOT run — section 3 could not confirm Postgres is reachable."
355:  printf '      Local schema may be behind migration history. That is drift, and this\n'
356:  printf '      repo bans it. Re-run this script once docker answers.\n'
357:else
358:  MIG_LOG="$(mktemp 2>/dev/null || echo /tmp/aw-migrations.$$.log)"
359:  bash infrastructure/migrations/run.sh >"$MIG_LOG" 2>&1
360:  MIG_RC=$?
361:  tail -3 "$MIG_LOG" | sed 's/^/  /'
362:  if [ "$MIG_RC" -eq 0 ]; then
363:    ok "migration runner exited 0"
364:  else
365:    fail "migrations did NOT apply cleanly (exit $MIG_RC) — full log: $MIG_LOG"
366:  fi
367:fi
368:printf '\n  ⚠️ These land on the LOCAL Postgres only. Run them wherever else the DB\n'
369:printf '     lives before anything depends on them.\n'
370:printf '  ⚠️ And LOCAL IS SUPERUSER while Render is NOT. A migration that passes here\n'
371:printf '     can still be refused by FORCE RLS in production. Verify with SET ROLE.\n'
372:
373:# ── 4b. WHAT LAST SESSION ACTUALLY CHANGED ─────────────────────────────────
374:#
375:# Reading the handover tells you what the last session SAID it did. This tells
376:# you what it DID. The two have disagreed in this repo often enough that the
377:# rule "measure the repo, do not quote the last handover" is written down.
378:#
379:# The boundary is derived from the newest "Session close" commit rather than
380:# typed, so it stays correct without maintenance.
381:bold "4b. Last session's diff — scripts and workflows it changed"
382:#
383:# ⚠️ THE BOUNDARY IS THE WORKING DAY, NOT THE "Session close" COMMIT. The first
384:# version of this section took the second-newest `Session close` commit — and
385:# 2026-08-16 alone contains FOUR of them, so it reported "no script changed"
386:# over a session that had rewritten three instruments and fifteen workflows.
387:# A boundary that is usually right and silently wrong on a busy day is worse
388:# than none, because its answer is "nothing happened".
389:LAST_DAY="$(git log -1 --format=%cd --date=short 2>/dev/null)"
390:LAST_CLOSE="$(git log --format='%H %cd' --date=short 2>/dev/null \
391:              | awk -v d="$LAST_DAY" '$2 != d { print $1; exit }')"
392:if [ -z "$LAST_DAY" ]; then
393:  skip "no commits — cannot derive the last session boundary."
394:elif [ -z "$LAST_CLOSE" ]; then
395:  warn "every commit in this repo is from $LAST_DAY — showing the whole history"
396:  LAST_CLOSE="$(git rev-list --max-parents=0 HEAD 2>/dev/null | tail -1)"
397:fi
398:if [ -n "$LAST_CLOSE" ]; then
399:  printf '  last working day %s — %s commit(s), since %s\n' \
400:    "$LAST_DAY" \
401:    "$(git rev-list --count "$LAST_CLOSE"..HEAD 2>/dev/null)" \
402:    "$(git log --oneline -1 "$LAST_CLOSE" 2>/dev/null)"
403:  CHANGED="$(git diff --name-status "$LAST_CLOSE"..HEAD -- scripts .github/workflows 2>/dev/null)"
404:  if [ -z "$CHANGED" ]; then
405:    ok "no script or workflow changed since that close"
406:  else
407:    printf '%s\n' "$CHANGED" | sed 's/^/    /'
408:    printf '\n  ⚠️ Re-read any script above BEFORE trusting its output. Three instruments\n'
409:    printf '     in this directory were found LYING on 2026-08-16 — defaulted to hosts\n'
410:    printf '     ADR-021 had deleted, and `curl … || echo 000` yielding `000000`.\n'
411:  fi
412:fi
413:
414:# ── 4c. THE REVIEW LANE ────────────────────────────────────────────────────
415:#
416:# Standing owner instruction, recorded 2026-08-04 and reaffirmed since:
417:# open and run CODEX and the SUPERVISOR only. Do NOT open Google ADK or Stitch.
418:# This section checks the two that are wanted and names the two that are not,
419:# because a silent omission reads as an oversight rather than a decision.
420:bold "4c. Reviewers — Codex and the Supervisor ONLY"
421:if [ -z "$CODEX_BIN" ]; then
422:  fail "codex.cmd not found — the FIRST quality gate cannot run. Expected ~/nodejs/codex.cmd"
423:else
424:  ok "codex  $("$CODEX_BIN" --version 2>/dev/null || echo '(version unreadable)')  → $CODEX_BIN"
425:fi
426:if [ -f "$HOME/.codex/auth.json" ]; then
427:  ok "codex auth present (ChatGPT Plus, \$0/call — never propose a paid reviewer)"
428:else
429:  fail "no ~/.codex/auth.json — Codex will prompt for sign-in and the gate will stall"
430:fi
431:cat <<'REVIEW'
432:  Supervisor (Claude Code skills, run INDEPENDENTLY of Codex — neither alone has
433:  been sufficient for six sessions running, and neither is an oracle: check every
434:  finding against source before acting on it):
435:      /code-review      /security-review      /verify
436:
437:  ⛔ NOT OPENED, BY STANDING OWNER INSTRUCTION: Google ADK · Stitch MCP.
438:     Their absence here is deliberate. Do not "helpfully" start them.
439:
440:  Codex needs its prompt on STDIN — as argv it reads only the first line:
441:      printf '%s' "$PROMPT" | "$CODEX_BIN" exec --skip-git-repo-check -
442:REVIEW
443:
444:# ── 5. what to do next ─────────────────────────────────────────────────────
445:bold "5. Next, by hand — the task list named in section 1 has the ranked work"
446:cat <<'NEXT'
447:  # four dev identities + seed data (idempotent; password Change_me_locally1!)
448:  bash scripts/seed-dev-identity.sh
449:  DEV_USER_ROLE=platform_administrator DEV_USER_EMAIL=admin@autoworkshop.local     bash scripts/seed-dev-identity.sh
450:  DEV_USER_ROLE=reception_staff        DEV_USER_EMAIL=reception@autoworkshop.local bash scripts/seed-dev-identity.sh
451:  DEV_USER_ROLE=customer               DEV_USER_EMAIL=customer@autoworkshop.local  bash scripts/seed-dev-identity.sh
452:  DEV_USER_ROLE=workshop_supervisor    DEV_USER_EMAIL=supervisor@autoworkshop.local bash scripts/seed-dev-identity.sh
453:  bash scripts/seed-dev-core.sh
454:
455:  # build + run (rm -rf first: a stale dist/.next is the other phantom-defect source)
456:  (cd apps/api && rm -rf dist && ./node_modules/.bin/nest build)
457:  set -a && . ./.env && set +a && (cd apps/api && node dist/main.js &)
458:
459:  (cd apps/workshop-web && rm -rf .next && ./node_modules/.bin/next build)
460:  # then next start -p 3001 with AUTH_SECRET/AUTH_URL/API_BASE_URL/KEYCLOAK_* set
461:
462:  # THEN PROVE THE SERVER IS YOURS — not yesterday's:
463:  curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4000/api/v1/health   # 200
464:  powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort 3001 -State Listen | ForEach-Object { Get-Process -Id \$_.OwningProcess | Select-Object Id,StartTime }"
465:NEXT
466:
467:bold "Reminders that have each cost a session"
468:cat <<'RULES'
469:  · READ THE COUNT, NEVER THE EXIT CODE. `playwright test` once exited 0 while
470:    running ZERO tests for two days. Baseline: 138 passed / 2 skipped; 344 unit.
471:  · Playwright runs from apps/e2e via ./node_modules/.bin/playwright test —
472:    there is no root `pnpm e2e` script.
473:  · export MSYS_NO_PATHCONV=1 before node scripts taking /paths — but NOT for pnpm.
474:  · A migration already applied is CHECKSUMMED. Fixes go in the next number.
475:  · Every refusal must name a REACHABLE alternative. Three slices running, that
476:    has been the most expensive class of defect in this repo.
477:  · Codex needs its prompt on STDIN: printf '%s' "$P" | codex.cmd exec ... -
478:    Passed as an argv string it reads only the first line and asks for the rest.
479:  · A GH concurrency group is a ONE-SLOT replacement waiting room, not a queue.
480:    After dispatching a deploy/APPLY/seed/backup, CONFIRM YOUR RUN ID STARTED —
481:    a `cancelled` run nobody cancelled is an EVICTED request. Re-dispatch it.
482:  · `gh run view --log` returns 0 bytes. Use:
483:    gh api repos/marc667us/autoworkshop-ai/actions/jobs/<job_id>/logs
484:  · Budget live-suite runs — each wakes every service on a free-tier allowance
485:    that has already been exhausted twice.
486:RULES
487:
488:# ── 6. HONEST SUMMARY ──────────────────────────────────────────────────────
489:#
490:# Three numbers, not an exit code. A skip is not a pass — that rule is recorded
491:# in this repository and this script previously had no way to express it.
492:bold "Session-start result"
493:printf '  passed %s · failed %s · SKIPPED %s · warnings %s\n' "$N_OK" "$N_FAIL" "$N_SKIP" "$N_WARN"
494:if [ "$N_SKIP" -gt 0 ]; then
495:  printf '  ⚠️ %s check(s) did NOT RUN. Their subjects are UNMEASURED, not healthy.\n' "$N_SKIP"
496:fi
497:if [ "$N_FAIL" -gt 0 ]; then
498:  printf '  🔴 %s check(s) FAILED — read them above before building anything.\n' "$N_FAIL"
499:fi
500:
501:bold "Ready. Open the task list named in section 1 and start there."

codex
I’ve found two “green despite failure” paths already: the stale-port check still reports `[OK]` after a listener survives, and Codex version execution can fail while being counted as passed. I’m 
checking the date-boundary logic against the actual history now.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git log -15 --format="%H %cd %s" --date=short' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 797ms:
1c6d5912a12920a60268d9945900824ff9993cae 2026-08-16 Handover tip: b12bf70
b12bf709733e5aa15a9d729de9d10f4ca5bf5fc7 2026-08-16 Session close: correct the handover tip and record this session's tooling
4f03cfa1e296ceeca4c9183c6f30aea063853640 2026-08-16 Session close 2026-08-16: slice 18 part 2 stopped before it became defect six
ee38cf9be532a8a76d520cc19b71ae3c37c5f683 2026-08-16 Lint: an unused catch binding, which is why nothing deployed
e1c32ceae90f3ef870c9181c84a71a9bcdb2ed18 2026-08-16 Slice 18 part 1: the admin insurance verification screen
34762aa3ae72196b1c26bfcbe4d45596c9bf665f 2026-08-16 Session close 2026-08-16: the owner can now reach all seven trees
9d28ccd7327ab79dde12d6c4125937d59c833263 2026-08-16 Audit organisations inside the account's OWN tenant — the version that works
318397aaec520dbfdf457629545023e497b62533 2026-08-16 Apply the Codex findings: navigation belongs to the switcher, and the org half
c5714be2010950ba0ed98a40bf5d0f9c6fbac043 2026-08-16 Switching role now goes where that role lives, instead of stranding you
8fb7e075c7cbf295ce6a3c37a53994548c777bce 2026-08-16 A safe way to set the audit superuser's password on a PUBLIC repo
3d93f641554949731017b033926d58e49a6c8792 2026-08-16 identity.users is platform-global and has no tenant_id
c05eceddf55b90b589d8208048af9c0c8f5f94ef 2026-08-16 The report lied to me: a transaction-local GUC discarded before the next query
05432aad5bf9216ac6eb7bfab1f20f630978184e 2026-08-16 The missing write path: appoint a platform administrator
36c6b0bf744c7a1e9f8f66f68e25a0dccfce1269 2026-08-16 The twelve dead redirects are gone from the live realm, and sign-in still works
abdd3868e8cac33fa7515845bec2bf389d11eed9 2026-08-16 Prune the dead Keycloak redirects the add-only sync cannot remove

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git log --format="%H %cd" --date=short | Select-Object -First 40' in C:\Users\USER\Documents\autoworkshop-ai
2026-08-17T12:07:48.390671Z ERROR codex_core::tools::router: error=Exit code: 124
Wall time: 10.1 seconds
Output:
command timed out after 10057 milliseconds
1c6d5912a12920a60268d9945900824ff9993cae 2026-08-16
b12bf709733e5aa15a9d729de9d10f4ca5bf5fc7 2026-08-16
4f03cfa1e296ceeca4c9183c6f30aea063853640 2026-08-16
ee38cf9be532a8a76d520cc19b71ae3c37c5f683 2026-08-16
e1c32ceae90f3ef870c9181c84a71a9bcdb2ed18 2026-08-16
34762aa3ae72196b1c26bfcbe4d45596c9bf665f 2026-08-16
9d28ccd7327ab79dde12d6c4125937d59c833263 2026-08-16
318397aaec520dbfdf457629545023e497b62533 2026-08-16
c5714be2010950ba0ed98a40bf5d0f9c6fbac043 2026-08-16
8fb7e075c7cbf295ce6a3c37a53994548c777bce 2026-08-16
3d93f641554949731017b033926d58e49a6c8792 2026-08-16
c05eceddf55b90b589d8208048af9c0c8f5f94ef 2026-08-16
05432aad5bf9216ac6eb7bfab1f20f630978184e 2026-08-16
36c6b0bf744c7a1e9f8f66f68e25a0dccfce1269 2026-08-16
abdd3868e8cac33fa7515845bec2bf389d11eed9 2026-08-16
26259acf85968ea49b7e6b2bbf7e9ce2ed9c46ab 2026-08-16
b9d5e9d7c4b9552c22aff70b21caa2ae414c740b 2026-08-16
6b72426faa7856d088dc907e4999ec7a7a47534d 2026-08-16
4b95f9eeaecb455e44fdd54ea7f31cc9ce964567 2026-08-16
096dd6e10024d5f7226744bb1697f242ddd0c157 2026-08-16
fea553a863073d0dce2654fa677917793effdf85 2026-08-16
757c41bcdf926612ca40db140e47f8504b989fcd 2026-08-15
3c8b341a1471b2eb15944a5e23076ba40fb19019 2026-08-15
01919b5afc3b45113e334811aebb963e88a3aea0 2026-08-15
56a7dcaed5b1a141bddd7341c2aa83118621d59d 2026-08-15
1816ba755860a916a4a7fecf2d57395fefd088f6 2026-08-14
83104cff47e8c4fe68e9cc791dd4288f705f9072 2026-08-14
f18e8d16b2dccd3f3e1114e8aa7a27ba78f800af 2026-08-14
41c3e38d64cba97b8eef13ca124797c77c219186 2026-08-14
8cecab2e70b84310997c19f100680d1d2673d63e 2026-08-14
ea03fb98961ca947abe514b682dbbb4a15bcd628 2026-08-14
78a84cdd76b24dcb09a1389cc2eaefafff2596dc 2026-08-14
bfc7c3ad8f8ce8e37b51f27683ea4f51fd9af5e5 2026-08-14
13180a069e84da0e217007653405e3622ca86025 2026-08-14
9239afefc53e976ec6378fd98478f4aa295dd64e 2026-08-14
990f1174582ee3c76dda736ce4127678b3e97f8c 2026-08-14
717b8301894c605d913fe62a13ec4d387e3aed4b 2026-08-14
85e5b48e1e2d1af02685d4ed984544ec0257d7ef 2026-08-14
29f6133a47d8b676195ac8a7dc1863c2c3abd34f 2026-08-14
fe9ce61964150d2bc67f90b3131023b5d82c2481 2026-08-14

 exited 124 in 10057ms:
1c6d5912a12920a60268d9945900824ff9993cae 2026-08-16
b12bf709733e5aa15a9d729de9d10f4ca5bf5fc7 2026-08-16
4f03cfa1e296ceeca4c9183c6f30aea063853640 2026-08-16
ee38cf9be532a8a76d520cc19b71ae3c37c5f683 2026-08-16
e1c32ceae90f3ef870c9181c84a71a9bcdb2ed18 2026-08-16
34762aa3ae72196b1c26bfcbe4d45596c9bf665f 2026-08-16
9d28ccd7327ab79dde12d6c4125937d59c833263 2026-08-16
318397aaec520dbfdf457629545023e497b62533 2026-08-16
c5714be2010950ba0ed98a40bf5d0f9c6fbac043 2026-08-16
8fb7e075c7cbf295ce6a3c37a53994548c777bce 2026-08-16
3d93f641554949731017b033926d58e49a6c8792 2026-08-16
c05eceddf55b90b589d8208048af9c0c8f5f94ef 2026-08-16
05432aad5bf9216ac6eb7bfab1f20f630978184e 2026-08-16
36c6b0bf744c7a1e9f8f66f68e25a0dccfce1269 2026-08-16
abdd3868e8cac33fa7515845bec2bf389d11eed9 2026-08-16
26259acf85968ea49b7e6b2bbf7e9ce2ed9c46ab 2026-08-16
b9d5e9d7c4b9552c22aff70b21caa2ae414c740b 2026-08-16
6b72426faa7856d088dc907e4999ec7a7a47534d 2026-08-16
4b95f9eeaecb455e44fdd54ea7f31cc9ce964567 2026-08-16
096dd6e10024d5f7226744bb1697f242ddd0c157 2026-08-16
fea553a863073d0dce2654fa677917793effdf85 2026-08-16
757c41bcdf926612ca40db140e47f8504b989fcd 2026-08-15
3c8b341a1471b2eb15944a5e23076ba40fb19019 2026-08-15
01919b5afc3b45113e334811aebb963e88a3aea0 2026-08-15
56a7dcaed5b1a141bddd7341c2aa83118621d59d 2026-08-15
1816ba755860a916a4a7fecf2d57395fefd088f6 2026-08-14
83104cff47e8c4fe68e9cc791dd4288f705f9072 2026-08-14
f18e8d16b2dccd3f3e1114e8aa7a27ba78f800af 2026-08-14
41c3e38d64cba97b8eef13ca124797c77c219186 2026-08-14
8cecab2e70b84310997c19f100680d1d2673d63e 2026-08-14
ea03fb98961ca947abe514b682dbbb4a15bcd628 2026-08-14
78a84cdd76b24dcb09a1389cc2eaefafff2596dc 2026-08-14
bfc7c3ad8f8ce8e37b51f27683ea4f51fd9af5e5 2026-08-14
13180a069e84da0e217007653405e3622ca86025 2026-08-14
9239afefc53e976ec6378fd98478f4aa295dd64e 2026-08-14
990f1174582ee3c76dda736ce4127678b3e97f8c 2026-08-14
717b8301894c605d913fe62a13ec4d387e3aed4b 2026-08-14
85e5b48e1e2d1af02685d4ed984544ec0257d7ef 2026-08-14
29f6133a47d8b676195ac8a7dc1863c2c3abd34f 2026-08-14
fe9ce61964150d2bc67f90b3131023b5d82c2481 2026-08-14

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "docker|start|up|compose|psql" infrastructure/migrations/run.sh' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 592ms:
17:# `DATABASE_URL` set  -> a remote Postgres, reached with a real `psql` client.
27:# ⚠️ `PSQL_BIN` IS AN ABSOLUTE PATH IN CI, NOT BARE `psql`. Solar lost a run to
33:  PSQL_BIN="${PSQL_BIN:-psql}"
34:  psql_run() { "$PSQL_BIN" -v ON_ERROR_STOP=1 "$DATABASE_URL" "$@"; }
37:  psql_run() { docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U "$USER_NAME" -d "$DB" "$@"; }
72:psql_run -q <<'SQL'
87:  existing="$(psql_run -tAc "SELECT checksum FROM public.schema_migrations WHERE version = '$version'" || true)"
113:  psql_run -q < "$file"
114:  psql_run -q -c "INSERT INTO public.schema_migrations (version, checksum) VALUES ('$version', '$checksum')"

codex
No CRITICAL findings. I found three HIGH, four MEDIUM, and two LOW issues.

## HIGH

- [scripts/start-session.sh:203](C:/Users/USER/Documents/autoworkshop-ai/scripts/start-session.sh:203) — the stale-port check can report `[OK]` when it failed.

  PowerShell prints `[FAIL] port ... STILL has ... listener(s)` but does not exit nonzero. The following line unconditionally calls:

  ```sh
  ok "ports ${DEV_PORTS} free ..."
  ```

  Failing input: `Stop-Process` is denied, or a service immediately reopens port 3001. The output contains both `[FAIL] port 3001 STILL...` and `[OK] ports ... free`; the summary counts only the 
pass.

  The top-of-file claim that the script “PROVES the port is free” is plainly false. Make PowerShell exit nonzero when any listener remains, capture that status, and call `fail` instead of `ok`.

- [scripts/start-session.sh:424](C:/Users/USER/Documents/autoworkshop-ai/scripts/start-session.sh:424) — the Codex execution check always passes once a path resolves.

  ```sh
  ok "codex $("$CODEX_BIN" --version ... || echo '(version unreadable)') ..."
  ```

  Failing input: `codex.cmd` exists but Node is missing, its installation is corrupt, or it exits nonzero. The fallback text becomes `(version unreadable)` and the result is still counted as 
passed.

  This verifies only that a name/path was found, not that “the FIRST quality gate can run.” Capture the exit status separately and fail when `--version` fails.

- [scripts/start-session.sh:389](C:/Users/USER/Documents/autoworkshop-ai/scripts/start-session.sh:389) — section 4b does not reliably derive a working-day boundary.

  `git log` traversal is not guaranteed to be monotonically ordered by `%cd`. A merge, rebased commit, or commit with an unusual committer date can place an older-dated commit before another 
latest-day commit. The awk exits at the first differing date, so `LAST_CLOSE..HEAD` can omit commits belonging to the claimed working day.

  Failing history: traversal dates `2026-08-16, 2026-08-15, 2026-08-16`. The second `2026-08-16` commit falls outside the selected range.

  Therefore the comment saying the boundary “stays correct without maintenance” is false. Use a time boundary such as the start of `$LAST_DAY` and select commits/diffs based on that, with an 
explicit first-parent policy if that is intended.

## MEDIUM

- [scripts/start-session.sh:196](C:/Users/USER/Documents/autoworkshop-ai/scripts/start-session.sh:196) — warnings raised for unparsed applications disappear from the summary.

  The `while` loop is the last component of a pipeline and therefore runs in a subshell in normal Bash. `warn` increments `N_WARN` only inside that subshell.

  Failing input: an app has `"start": "vite preview"`. A visible `[WARN]` is printed, but the final summary says `warnings 0`.

  Use process substitution:

  ```sh
  while ...; do
    warn ...
  done < <(printf ... | grep ...)
  ```

- [scripts/start-session.sh:403](C:/Users/USER/Documents/autoworkshop-ai/scripts/start-session.sh:403) — section 4b silently excludes uncommitted changes.

  Its claim is “what the last session actually changed,” but `git diff "$LAST_CLOSE"..HEAD` only compares commits. Any working-tree changes under `scripts/` or `.github/workflows` are 
omitted—including the current uncommitted change to this script.

  If the intended scope is committed work only, say so plainly. Otherwise also report `git diff --name-status -- ...` and staged changes.

- [scripts/start-session.sh:395](C:/Users/USER/Documents/autoworkshop-ai/scripts/start-session.sh:395) — “showing the whole history” is incorrect for a one-day repository.

  The fallback chooses the root commit, then uses `root..HEAD`. That excludes the root commit and every file introduced by it.

  Failing input: a repository with one root commit containing `scripts/setup.sh`. Section 4b reports no change because the root tree is excluded. Use the empty tree as the lower endpoint or diff 
the root with `git show`.

- [scripts/start-session.sh:100](C:/Users/USER/Documents/autoworkshop-ai/scripts/start-session.sh:100) — `age_days` measures elapsed 24-hour periods, not calendar-day age.

  At 00:05, a file modified at 23:55 the previous day prints `0d old`; a future-dated file can print a negative age. If “age in days” means elapsed whole days, the arithmetic is correct. If it 
means the dated-document staleness implied by the text, it is misleading.

  Git-for-Windows’ GNU `date -r FILE +%s` supports this invocation. It is less broadly portable to arbitrary BusyBox builds, so the “busybox-ish” requirement should not be assumed without 
checking the deployed BusyBox version.

## LOW

- [scripts/start-session.sh:97](C:/Users/USER/Documents/autoworkshop-ai/scripts/start-session.sh:97) — the pointer is not actually restricted to ISO-dated task lists.

  The glob accepts every `TASK_LIST_*.md`, and lexical sorting selects the whole filename. Failing input: `.claude/TASK_LIST_Z_BACKUP.md`; it wins over `.claude/TASK_LIST_2026-08-17.md`.

  The comment “the dates are ISO and sort lexically” describes a naming convention, not something the code enforces.

- [scripts/start-session.sh:57](C:/Users/USER/Documents/autoworkshop-ai/scripts/start-session.sh:57) — section 0 is not safe if `PATH` or `HOME` is unset under `set -u`.

  `$PATH` is expanded at line 59 and `$HOME` at line 69. Failing input:

  ```sh
  env -u HOME bash scripts/start-session.sh
  ```

  This aborts before orientation. An unset `PATH` can likewise abort depending on how Bash was launched. Initialize them with guarded defaults before use, e.g. `${PATH-}` and `${HOME-}`.

The new section 2 `if/else/fi` nesting is syntactically balanced, and the migration exit-status capture now tests `run.sh` rather than `tail`/`sed`.

Nothing newly added starts a server. It does launch short-lived commands, including `codex.cmd --version`, and section 4 still mutates the database by applying migrations as before. The new 
`mktemp` also creates log files and never removes successful ones, so the script is not literally read-only, but neither action starts a server.
tokens used
31,831
No CRITICAL findings. I found three HIGH, four MEDIUM, and two LOW issues.

## HIGH

- [scripts/start-session.sh:203](C:/Users/USER/Documents/autoworkshop-ai/scripts/start-session.sh:203) — the stale-port check can report `[OK]` when it failed.

  PowerShell prints `[FAIL] port ... STILL has ... listener(s)` but does not exit nonzero. The following line unconditionally calls:

  ```sh
  ok "ports ${DEV_PORTS} free ..."
  ```

  Failing input: `Stop-Process` is denied, or a service immediately reopens port 3001. The output contains both `[FAIL] port 3001 STILL...` and `[OK] ports ... free`; the summary counts only the pass.

  The top-of-file claim that the script “PROVES the port is free” is plainly false. Make PowerShell exit nonzero when any listener remains, capture that status, and call `fail` instead of `ok`.

- [scripts/start-session.sh:424](C:/Users/USER/Documents/autoworkshop-ai/scripts/start-session.sh:424) — the Codex execution check always passes once a path resolves.

  ```sh
  ok "codex $("$CODEX_BIN" --version ... || echo '(version unreadable)') ..."
  ```

  Failing input: `codex.cmd` exists but Node is missing, its installation is corrupt, or it exits nonzero. The fallback text becomes `(version unreadable)` and the result is still counted as passed.

  This verifies only that a name/path was found, not that “the FIRST quality gate can run.” Capture the exit status separately and fail when `--version` fails.

- [scripts/start-session.sh:389](C:/Users/USER/Documents/autoworkshop-ai/scripts/start-session.sh:389) — section 4b does not reliably derive a working-day boundary.

  `git log` traversal is not guaranteed to be monotonically ordered by `%cd`. A merge, rebased commit, or commit with an unusual committer date can place an older-dated commit before another latest-day commit. The awk exits at the first differing date, so `LAST_CLOSE..HEAD` can omit commits belonging to the claimed working day.

  Failing history: traversal dates `2026-08-16, 2026-08-15, 2026-08-16`. The second `2026-08-16` commit falls outside the selected range.

  Therefore the comment saying the boundary “stays correct without maintenance” is false. Use a time boundary such as the start of `$LAST_DAY` and select commits/diffs based on that, with an explicit first-parent policy if that is intended.

## MEDIUM

- [scripts/start-session.sh:196](C:/Users/USER/Documents/autoworkshop-ai/scripts/start-session.sh:196) — warnings raised for unparsed applications disappear from the summary.

  The `while` loop is the last component of a pipeline and therefore runs in a subshell in normal Bash. `warn` increments `N_WARN` only inside that subshell.

  Failing input: an app has `"start": "vite preview"`. A visible `[WARN]` is printed, but the final summary says `warnings 0`.

  Use process substitution:

  ```sh
  while ...; do
    warn ...
  done < <(printf ... | grep ...)
  ```

- [scripts/start-session.sh:403](C:/Users/USER/Documents/autoworkshop-ai/scripts/start-session.sh:403) — section 4b silently excludes uncommitted changes.

  Its claim is “what the last session actually changed,” but `git diff "$LAST_CLOSE"..HEAD` only compares commits. Any working-tree changes under `scripts/` or `.github/workflows` are omitted—including the current uncommitted change to this script.

  If the intended scope is committed work only, say so plainly. Otherwise also report `git diff --name-status -- ...` and staged changes.

- [scripts/start-session.sh:395](C:/Users/USER/Documents/autoworkshop-ai/scripts/start-session.sh:395) — “showing the whole history” is incorrect for a one-day repository.

  The fallback chooses the root commit, then uses `root..HEAD`. That excludes the root commit and every file introduced by it.

  Failing input: a repository with one root commit containing `scripts/setup.sh`. Section 4b reports no change because the root tree is excluded. Use the empty tree as the lower endpoint or diff the root with `git show`.

- [scripts/start-session.sh:100](C:/Users/USER/Documents/autoworkshop-ai/scripts/start-session.sh:100) — `age_days` measures elapsed 24-hour periods, not calendar-day age.

  At 00:05, a file modified at 23:55 the previous day prints `0d old`; a future-dated file can print a negative age. If “age in days” means elapsed whole days, the arithmetic is correct. If it means the dated-document staleness implied by the text, it is misleading.

  Git-for-Windows’ GNU `date -r FILE +%s` supports this invocation. It is less broadly portable to arbitrary BusyBox builds, so the “busybox-ish” requirement should not be assumed without checking the deployed BusyBox version.

## LOW

- [scripts/start-session.sh:97](C:/Users/USER/Documents/autoworkshop-ai/scripts/start-session.sh:97) — the pointer is not actually restricted to ISO-dated task lists.

  The glob accepts every `TASK_LIST_*.md`, and lexical sorting selects the whole filename. Failing input: `.claude/TASK_LIST_Z_BACKUP.md`; it wins over `.claude/TASK_LIST_2026-08-17.md`.

  The comment “the dates are ISO and sort lexically” describes a naming convention, not something the code enforces.

- [scripts/start-session.sh:57](C:/Users/USER/Documents/autoworkshop-ai/scripts/start-session.sh:57) — section 0 is not safe if `PATH` or `HOME` is unset under `set -u`.

  `$PATH` is expanded at line 59 and `$HOME` at line 69. Failing input:

  ```sh
  env -u HOME bash scripts/start-session.sh
  ```

  This aborts before orientation. An unset `PATH` can likewise abort depending on how Bash was launched. Initialize them with guarded defaults before use, e.g. `${PATH-}` and `${HOME-}`.

The new section 2 `if/else/fi` nesting is syntactically balanced, and the migration exit-status capture now tests `run.sh` rather than `tail`/`sed`.

Nothing newly added starts a server. It does launch short-lived commands, including `codex.cmd --version`, and section 4 still mutates the database by applying migrations as before. The new `mktemp` also creates log files and never removes successful ones, so the script is not literally read-only, but neither action starts a server.
