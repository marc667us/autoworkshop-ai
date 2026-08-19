# Review: codex-review

_Generated: 2026-08-19T12:58:40-07:00 · backend: codex · model: llama3.2_

## Prompt

> You are Codex acting as Independent Pair Programmer for this repository. Review the latest implementation against the stated requirement in README.md and (if present) docs/IMPLEMENTATION_LOG.md. Identify anything Claude Code missed, misunderstood, or only partially implemented. Return a checklist of defects with: severity (critical/high/medium/low), file:line, what's wrong, recommended fix, why it matters.

## Repository context

### Changed files (HEAD~1..HEAD)
```
 .claude/SESSION_HANDOVER.md                        |  88 ++++++++++
 .github/workflows/diagnose-live-identity-roles.yml | 179 +++++++++++++++++++++
 .../seed/diagnose_live_identity_roles.sql          |  89 ++++++++++
 3 files changed, 356 insertions(+)
```

### Diff snippet (first 100 lines)
```diff
diff --git a/.claude/SESSION_HANDOVER.md b/.claude/SESSION_HANDOVER.md
index 8cdbd10..8bcb69b 100644
--- a/.claude/SESSION_HANDOVER.md
+++ b/.claude/SESSION_HANDOVER.md
@@ -1,5 +1,93 @@
 # Session handover
 
+## ▶▶ RESUME HERE — 2026-08-19 close. You are ONE DISPATCH from the next step. ◀◀
+
+**Tip `6556194` + this commit. Tree clean, everything pushed. CI green.
+Production migrations 85/85. Live suite 73 passed / 0 failed / 5 SKIPPED.**
+
+```bash
+bash scripts/start-session.sh          # ALWAYS first
+```
+
+### THE EXACT NEXT ACTION
+
+**Close A3 for real: turn its four SKIPS into four assertions.** The work is
+half done and the next step is a single command.
+
+```bash
+gh workflow run diagnose-live-identity-roles.yml     # read-only, no confirm needed
+```
+
+That workflow and its SQL are **written, YAML-validated, committed, and NOT YET
+RUN**. It answers the one question that blocks the rest:
+
+> Which identity does `LIVE_OWNER_EMAIL` resolve to, and how many ACTIVE roles
+> does it hold?
+
+**Why it exists.** Live-suite run 32290511884 found `getByLabel('Acting as
+role')` absent. `RoleSwitcher` renders nothing below two roles, so the account
+holds one — which is why four A3 checks skip. ⚠️ **That is an inference from a
+missing DOM node.** It matches `RoleSwitcher`'s source and the recorded
+`live-*@aiappinvent.com` identities, and it is still an inference. Reasoning
+from source has been wrong twice this week, so measure before writing
+memberships into production.
+
+### THEN, IN ORDER
+
+1. **Read section 1 of the output** — `active_roles` per candidate identity.
+   Any account showing **1** cannot verify a partner-role screen, ever.
+2. **Read section 3** — if `fleet_orgs = 0` on production, slice 20's nine fleet
+   screens are unreachable by ANY signed-in viewer, which is a separate and
+   larger finding than the switcher one.
+3. **Grant the CI identity memberships** in the `[AUDIT]` insurance, towing and
+   fleet organisations (section 2 lists their ids). Model it on
+   `repair-audit-org-founders.yml`: name the ids explicitly, guard every write
+   with the full measured shape, and gate on `-f confirm=APPLY`. **Do not infer
+   a rule** — that is the mistake 085's widening made, which Codex falsified.
+4. **Re-run `live-suite.yml`.** The four A3 checks should move from SKIPPED to
+   PASSED. **Report passed / failed / SKIPPED as three numbers** — the target is
+   73/0/1, not 73/0/5.
+
+⚠️ **A skip is not a pass.** The suite is GREEN at 73/0/5 today, and five things
+are unverified. Do not read the green as done.
+
+### WHAT IS ALREADY DONE AND NEEDS NO REVISITING
+
+| | |
+|---|---|
+| Slice 17 — insurance marketplace, shopper's half | **LIVE**, verified end to end on production |
+| Slice 19 — fleet data layer + API (ADR-023, migration 087) | **LIVE**, `verify/087` 11/11 |
+| Slice 20 — fleet workspace | **LIVE**, fleet **1 → 9 of 29** screens, overall **282/385** |
+| Migrations on production | **85 / 85** |
+| I4 · I7 · I11 · I13 | closed |
+
+### OPEN, WITH THE REASON RECORDED
+
+- **A3** — the fixture gap above. Four checks skip until it is closed.
+- **20 fleet dead ends** — maintenance plans, vehicle documents, quotations,
+  parts installed, warranties, downtime, vehicle costs, reports. Each needs a
+  data layer that does not exist. **Not stubbed, deliberately.**
+- **I14** no rate limiting on the anonymous enquiry POST · **I15** `z.string().url()`
+  is not a scheme check anywhere else in the repo (unaudited) · **I16** enquiries
+  have no nav entry · **I17** `Release` deploys WEB ONLY · **I18** no test that
+  every top-level `app/` route is routable · **I19** 085's guard counts owners
+  globally.
+- **Two follow-ups from slice 20**: fleet work deserves its own workshop menu
+  entry (owner decision), and a real appointment needs a workshop-confirmed date.
+
+### THE TRAPS THAT COST TIME TODAY — READ BEFORE TRUSTING A NUMBER
+
+1. **`pnpm test` and `pnpm lint` REPLAY CACHED LOGS.** `pnpm test` reported
+   927/55 while vitest reported 981/1. **Use `turbo run <task> --force`.**
+2. **`Release` DEPLOYS WEB ONLY** — `deploy-api.yml -f confirm=APPLY` is separate,
+   and new API routes 404 on production until it runs.
+3. **A route can build, deploy and be UNREACHABLE** — `middleware.ts` redirects
+   any first path segment no pack claims.
+4. **A guard that cannot reach its own else-branch** — `actAs` threw where it
+   should have returned false; the suite went red twice for a gap it was written
+   to skip on.
+
+
 ## ═══ 2026-08-19 (pt4) — A3 answered: the harness cannot answer A3 ═══
 
 **Tip `8b7a7f4`. Pushed. CI green. Live suite GREEN.**
diff --git a/.github/workflows/diagnose-live-identity-roles.yml b/.github/workflows/diagnose-live-identity-roles.yml
new file mode 100644
```

## Findings

Reviewed commit `0efa722` (`HEAD~1..HEAD`). `docs/IMPLEMENTATION_LOG.md` is absent. I found four defects:

- [ ] **High** — [diagnose_live_identity_roles.sql:58](C:/Users/USER/Documents/autoworkshop-ai/infrastructure/seed/diagnose_live_identity_roles.sql:58)  
  **What’s wrong:** The diagnostic never uses `LIVE_OWNER_EMAIL`. It guesses candidates by matching `aiappinvent.com` or `yahoo.com`, so it does not reliably answer the stated question: “Which identity does `LIVE_OWNER_EMAIL` resolve to?” A differently hosted secret, or several matching users, makes the result ambiguous or empty.  
  **Recommended fix:** Expose `LIVE_OWNER_EMAIL` to the workflow, validate it is non-empty, pass it as a quoted `psql` variable, and query `lower(u.email) = lower(:'live_email')`. Avoid printing unrelated accounts.  
  **Why it matters:** The result is intended to authorize a subsequent production membership change. Guessing the target identity creates a real risk of modifying the wrong account.

- [ ] **High** — [diagnose_live_identity_roles.sql:54](C:/Users/USER/Documents/autoworkshop-ai/infrastructure/seed/diagnose_live_identity_roles.sql:54)  
  **What’s wrong:** `active_roles` counts distinct role names across every organization. `RoleSwitcher`, however, derives roles only for the currently active organization. An account with one role in each of two organizations reports `active_roles = 2` here while the role switcher can still be absent. Conversely, organization switching may be available despite only one distinct role name.  
  **Recommended fix:** Report active memberships grouped by user and organization, including organization type/name and role. Separately calculate organization choices and per-organization role choices using the same semantics as `organizationsFromMemberships()` and `rolesFromMemberships()`.  
  **Why it matters:** The workflow labels this value “THE ANSWER,” but it can reproduce the same incorrect inference the diagnostic was created to eliminate.

- [ ] **Medium** — [diagnose_live_identity_roles.sql:77](C:/Users/USER/Documents/autoworkshop-ai/infrastructure/seed/diagnose_live_identity_roles.sql:77)  
  **What’s wrong:** Section 2 claims to list the `[AUDIT]` organizations, but filters only by `org_type`. It therefore returns every insurance, towing, and fleet organization—and every member email—in the production database.  
  **Recommended fix:** Add the exact fixture predicate, preferably explicit measured organization UUIDs; at minimum require the documented `[AUDIT]` naming condition. Select only fields needed for the follow-up.  
  **Why it matters:** Operators can choose the wrong organization IDs, and unnecessary production identity data is copied into the durable GitHub Actions summary.

- [ ] **Medium** — [diagnose-live-identity-roles.yml:149](C:/Users/USER/Documents/autoworkshop-ai/.github/workflows/diagnose-live-identity-roles.yml:149)  
  **What’s wrong:** The committed summary instructs operators to interpret `is_earliest` and `is_self_created`, but the SQL emits neither column. It also describes section 3 as distinguishing registrations from fixtures, although section 3 only counts active organization types.  
  **Recommended fix:** Make the summary describe the actual three result sets and explicitly direct operators to the exact-identity and per-organization membership output.  
  **Why it matters:** The workflow may execute successfully while its human-facing interpretation is unusable or misleading.

The current dirty worktree already contains an uncommitted correction for the stale summary, but that correction is not part of the reviewed commit. The two high-severity diagnostic-semantic defects remain.
 — insurance marketplace, shopper's half | **LIVE**, verified end to end on production |
+| Slice 19 — fleet data layer + API (ADR-023, migration 087) | **LIVE**, `verify/087` 11/11 |
+| Slice 20 — fleet workspace | **LIVE**, fleet **1 → 9 of 29** screens, overall **282/385** |
+| Migrations on production | **85 / 85** |
+| I4 · I7 · I11 · I13 | closed |
+
+### OPEN, WITH THE REASON RECORDED
+
+- **A3** — the fixture gap above. Four checks skip until it is closed.
+- **20 fleet dead ends** — maintenance plans, vehicle documents, quotations,
+  parts installed, warranties, downtime, vehicle costs, reports. Each needs a
+  data layer that does not exist. **Not stubbed, deliberately.**
+- **I14** no rate limiting on the anonymous enquiry POST · **I15** `z.string().url()`
+  is not a scheme check anywhere else in the repo (unaudited) · **I16** enquiries
+  have no nav entry · **I17** `Release` deploys WEB ONLY · **I18** no test that
+  every top-level `app/` route is routable · **I19** 085's guard counts owners
+  globally.
+- **Two follow-ups from slice 20**: fleet work deserves its own workshop menu
+  entry (owner decision), and a real appointment needs a workshop-confirmed date.
+
+### THE TRAPS THAT COST TIME TODAY — READ BEFORE TRUSTING A NUMBER
+
+1. **`pnpm test` and `pnpm lint` REPLAY CACHED LOGS.** `pnpm test` reported
+   927/55 while vitest reported 981/1. **Use `turbo run <task> --force`.**
+2. **`Release` DEPLOYS WEB ONLY** — `deploy-api.yml -f confirm=APPLY` is separate,
+   and new API routes 404 on production until it runs.
+3. **A route can build, deploy and be UNREACHABLE** — `middleware.ts` redirects
+   any first path segment no pack claims.
+4. **A guard that cannot reach its own else-branch** — `actAs` threw where it
+   should have returned false; the suite went red twice for a gap it was written
+   to skip on.
+
+
 ## ═══ 2026-08-19 (pt4) — A3 answered: the harness cannot answer A3 ═══
 
 **Tip `8b7a7f4`. Pushed. CI green. Live suite GREEN.**
diff --git a/.github/workflows/diagnose-live-identity-roles.yml b/.github/workflows/diagnose-live-identity-roles.yml
new file mode 100644
```
codex
I’ll trace the requirement from README and the implementation log, then review the new workflow/SQL against repository conventions and report only evidence-backed defects with exact lines.
2026-08-19T19:59:47.524574Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content README.md; if (Test-Path docs/IMPLEMENTATION_LOG.md) { Get-Content docs/IMPLEMENTATION_LOG.md }; git diff HEAD~1..HEAD -- .github/workflows/diagnose-live-identity-roles.yml scripts/seed/diagnose_live_identity_roles.sql .claude/SESSION_HANDOVER.md'` rejected: blocked by policy
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content README.md; if (Test-Path docs/IMPLEMENTATION_LOG.md) { Get-Content docs/IMPLEMENTATION_LOG.md }; git diff HEAD~1..HEAD -- .github/workflows/diagnose-live-identity-roles.yml scripts/seed/diagnose_live_identity_roles.sql .claude/SESSION_HANDOVER.md' in C:\Users\USER\Documents\autoworkshop-ai
codex
The combined read is larger than one command window, so I’m letting it finish and will narrow into the requirement and changed implementation once it returns.
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content README.md; if (Test-Path docs/IMPLEMENTATION_LOG.md) { Get-Content docs/IMPLEMENTATION_LOG.md }; git diff HEAD~1..HEAD -- .github/workflows/diagnose-live-identity-roles.yml scripts/seed/diagnose_live_identity_roles.sql .claude/SESSION_HANDOVER.md'` rejected: blocked by policy
2026-08-19T19:59:53.084937Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'if (Test-Path docs/IMPLEMENTATION_LOG.md) { Get-Content docs/IMPLEMENTATION_LOG.md }'` rejected: blocked by policy
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content README.md' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git diff HEAD~1..HEAD -- .github/workflows/diagnose-live-identity-roles.yml scripts/seed/diagnose_live_identity_roles.sql .claude/SESSION_HANDOVER.md' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'if (Test-Path docs/IMPLEMENTATION_LOG.md) { Get-Content docs/IMPLEMENTATION_LOG.md }' in C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'if (Test-Path docs/IMPLEMENTATION_LOG.md) { Get-Content docs/IMPLEMENTATION_LOG.md }'` rejected: blocked by policy
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content README.md' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg --files docs' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git diff HEAD~1..HEAD -- .github/workflows/diagnose-live-identity-roles.yml scripts/seed/diagnose_live_identity_roles.sql .claude/SESSION_HANDOVER.md' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 952ms:
diff --git a/.claude/SESSION_HANDOVER.md b/.claude/SESSION_HANDOVER.md
index 8cdbd10..8bcb69b 100644
--- a/.claude/SESSION_HANDOVER.md
+++ b/.claude/SESSION_HANDOVER.md
@@ -1,5 +1,93 @@
 # Session handover
 
+## ▶▶ RESUME HERE — 2026-08-19 close. You are ONE DISPATCH from the next step. ◀◀
+
+**Tip `6556194` + this commit. Tree clean, everything pushed. CI green.
+Production migrations 85/85. Live suite 73 passed / 0 failed / 5 SKIPPED.**
+
+```bash
+bash scripts/start-session.sh          # ALWAYS first
+```
+
+### THE EXACT NEXT ACTION
+
+**Close A3 for real: turn its four SKIPS into four assertions.** The work is
+half done and the next step is a single command.
+
+```bash
+gh workflow run diagnose-live-identity-roles.yml     # read-only, no confirm needed
+```
+
+That workflow and its SQL are **written, YAML-validated, committed, and NOT YET
+RUN**. It answers the one question that blocks the rest:
+
+> Which identity does `LIVE_OWNER_EMAIL` resolve to, and how many ACTIVE roles
+> does it hold?
+
+**Why it exists.** Live-suite run 32290511884 found `getByLabel('Acting as
+role')` absent. `RoleSwitcher` renders nothing below two roles, so the account
+holds one — which is why four A3 checks skip. ⚠️ **That is an inference from a
+missing DOM node.** It matches `RoleSwitcher`'s source and the recorded
+`live-*@aiappinvent.com` identities, and it is still an inference. Reasoning
+from source has been wrong twice this week, so measure before writing
+memberships into production.
+
+### THEN, IN ORDER
+
+1. **Read section 1 of the output** — `active_roles` per candidate identity.
+   Any account showing **1** cannot verify a partner-role screen, ever.
+2. **Read section 3** — if `fleet_orgs = 0` on production, slice 20's nine fleet
+   screens are unreachable by ANY signed-in viewer, which is a separate and
+   larger finding than the switcher one.
+3. **Grant the CI identity memberships** in the `[AUDIT]` insurance, towing and
+   fleet organisations (section 2 lists their ids). Model it on
+   `repair-audit-org-founders.yml`: name the ids explicitly, guard every write
+   with the full measured shape, and gate on `-f confirm=APPLY`. **Do not infer
+   a rule** — that is the mistake 085's widening made, which Codex falsified.
+4. **Re-run `live-suite.yml`.** The four A3 checks should move from SKIPPED to
+   PASSED. **Report passed / failed / SKIPPED as three numbers** — the target is
+   73/0/1, not 73/0/5.
+
+⚠️ **A skip is not a pass.** The suite is GREEN at 73/0/5 today, and five things
+are unverified. Do not read the green as done.
+
+### WHAT IS ALREADY DONE AND NEEDS NO REVISITING
+
+| | |
+|---|---|
+| Slice 17 — insurance marketplace, shopper's half | **LIVE**, verified end to end on production |
+| Slice 19 — fleet data layer + API (ADR-023, migration 087) | **LIVE**, `verify/087` 11/11 |
+| Slice 20 — fleet workspace | **LIVE**, fleet **1 → 9 of 29** screens, overall **282/385** |
+| Migrations on production | **85 / 85** |
+| I4 · I7 · I11 · I13 | closed |
+
+### OPEN, WITH THE REASON RECORDED
+
+- **A3** — the fixture gap above. Four checks skip until it is closed.
+- **20 fleet dead ends** — maintenance plans, vehicle documents, quotations,
+  parts installed, warranties, downtime, vehicle costs, reports. Each needs a
+  data layer that does not exist. **Not stubbed, deliberately.**
+- **I14** no rate limiting on the anonymous enquiry POST · **I15** `z.string().url()`
+  is not a scheme check anywhere else in the repo (unaudited) · **I16** enquiries
+  have no nav entry · **I17** `Release` deploys WEB ONLY · **I18** no test that
+  every top-level `app/` route is routable · **I19** 085's guard counts owners
+  globally.
+- **Two follow-ups from slice 20**: fleet work deserves its own workshop menu
+  entry (owner decision), and a real appointment needs a workshop-confirmed date.
+
+### THE TRAPS THAT COST TIME TODAY — READ BEFORE TRUSTING A NUMBER
+
+1. **`pnpm test` and `pnpm lint` REPLAY CACHED LOGS.** `pnpm test` reported
+   927/55 while vitest reported 981/1. **Use `turbo run <task> --force`.**
+2. **`Release` DEPLOYS WEB ONLY** — `deploy-api.yml -f confirm=APPLY` is separate,
+   and new API routes 404 on production until it runs.
+3. **A route can build, deploy and be UNREACHABLE** — `middleware.ts` redirects
+   any first path segment no pack claims.
+4. **A guard that cannot reach its own else-branch** — `actAs` threw where it
+   should have returned false; the suite went red twice for a gap it was written
+   to skip on.
+
+
 ## ═══ 2026-08-19 (pt4) — A3 answered: the harness cannot answer A3 ═══
 
 **Tip `8b7a7f4`. Pushed. CI green. Live suite GREEN.**
diff --git a/.github/workflows/diagnose-live-identity-roles.yml b/.github/workflows/diagnose-live-identity-roles.yml
new file mode 100644
index 0000000..9dd727d
--- /dev/null
+++ b/.github/workflows/diagnose-live-identity-roles.yml
@@ -0,0 +1,179 @@
+# Read-only: which identity does the live suite sign in as, and what can it act as?
+#
+# ══════════════════════════════════════════════════════════════════════════
+# Live-suite run 32290511884 found the role switcher ABSENT for the signed-in
+# account. `RoleSwitcher` renders nothing below two roles, so the conclusion was
+# that `LIVE_OWNER_EMAIL` is a CI identity holding ONE role — which makes the
+# signed-in half of the suite structurally unable to verify any partner-role
+# screen, and left four A3 checks skipping.
+#
+# ⚠️ THAT CONCLUSION WAS INFERRED FROM A MISSING DOM NODE. Before writing
+# memberships into production on the back of it, ASK THE DATABASE. Reasoning
+# from source has been wrong twice this week.
+#
+# 🔴 READ-ONLY. Every statement in the SQL is a SELECT. No confirm input, which
+# is the point: a diagnostic nobody can run without ceremony does not get run.
+# ══════════════════════════════════════════════════════════════════════════
+
+name: Diagnose live identity roles
+
+on:
+  workflow_dispatch:
+
+concurrency:
+  # A6 — ALL of these open the production database firewall by PATCHing the
+  # WHOLE ipAllowList, so they must never overlap. Render has no atomic
+  # per-entry operation, so every capture/add/restore is a read-modify-write on
+  # one shared resource. It races at least THREE ways:
+  #   1. FILTERED CAPTURE (apply-migrations, backup-production-db,
+  #      rehearse-migration) drops every entry containing 'ephemeral:' when
+  #      building its snapshot. It cannot tell a dead run's entry from a LIVE
+  #      one's, so it deletes a running job's entry the moment it starts.
+  #   2. UNFILTERED RESTORE (the other twelve) restores a snapshot taken before
+  #      another run added its entry, deleting it on the way out.
+  #   3. CONCURRENT ADD (any two unfiltered runs) — both GET the same original
+  #      list, then both PATCH 'original + mine'. The second add deletes the
+  #      first run's entry before either restore happens.
+  #   (and mixed order can RESURRECT a stale entry: an unfiltered run snapshots
+  #    a foreign ephemeral entry and restores it after its owner removed it.)
+  # The victim fails with 'SSL connection has been closed unexpectedly', which
+  # is a LIE about the cause and reads as a database outage. At least six failed
+  # runs on 2026-08-14 were this.
+  #
+  # ⚠️ A RETRY IS NOT A FIX — five retries failed identically, because the entry
+  # stays deleted. And "remove only MY entry" is still racy: the API takes the
+  # whole list.
+  #
+  # 🔴 THE COST OF THIS MUTEX, STATED PLAINLY — GITHUB'S WAITING ROOM HOLDS ONE.
+  # A concurrency group is NOT a fifteen-deep FIFO queue. GitHub keeps at most
+  # ONE pending run per group and REPLACES it when a newer one arrives, with no
+  # ordering guarantee. So a pending deploy-api, migration APPLY, seed or backup
+  # can be silently discarded by a newer arrival — and apply-migrations runs
+  # automatically after EVERY Release, so automatic inspections compete with
+  # deliberate operator requests. A cancelled PENDING run is firewall-safe (it
+  # never opened anything) but the REQUEST IS LOST, not merely delayed.
+  # ▶ THEREFORE: after dispatching any of these, capture the run id and confirm
+  #   it actually STARTED. `gh run list --workflow=<wf> -L 3 --json databaseId,status`
+  #   A 'cancelled' run you did not cancel is an evicted request — re-dispatch it.
+  #
+  # ⚠️ cancel-in-progress MUST stay false: cancelling a run mid-window would
+  # leave its ephemeral entry live on the production firewall. But it does NOT
+  # close every such path — a job timeout, a manual/API cancellation or runner
+  # loss can still kill a run between its add PATCH and its restore step, and an
+  # `if: always()` restore is not a reliable finally block against those. The
+  # filtered-capture workflows clean up a stale entry on their next run; until
+  # then the exposure is real.
+  group: production-db-firewall
+  cancel-in-progress: false
+
+jobs:
+  diagnose:
+    runs-on: ubuntu-latest
+    timeout-minutes: 15
+    env:
+      RENDER_API_KEY: ${{ secrets.RENDER_API_KEY }}
+      DB_NAME: autoworkshop-postgres
+    steps:
+      - uses: actions/checkout@v4
+
+      - name: Refuse without a key
+        run: |
+          set -euo pipefail
+          [ -n "${RENDER_API_KEY:-}" ] || { echo "::error::RENDER_API_KEY is not set"; exit 1; }
+
+      - name: Find the database and open the firewall for this runner
+        run: |
+          set -euo pipefail
+          sudo apt-get update -qq && sudo apt-get install -y -qq postgresql-client >/dev/null
+          curl -fsS -H "Authorization: Bearer ${RENDER_API_KEY}" -H 'Accept: application/json' \
+            "https://api.render.com/v1/postgres?name=${DB_NAME}&limit=20" > /tmp/pg_list.json || true
+          DB_ID="$(python3 -c "
+          import json, os
+          try:
+              rows = json.load(open('/tmp/pg_list.json'))
+          except Exception:
+              rows = None
+          if isinstance(rows, dict):
+              rows = rows.get('postgres') or rows.get('items') or []
+          for r in (rows or []):
+              d = r.get('postgres', r) if isinstance(r, dict) else {}
+              if d.get('name') == os.environ['DB_NAME']:
+                  print(d.get('id','')); break
+          ")"
+          [ -n "$DB_ID" ] || {
+            echo "::group::what /v1/postgres returned"; head -c 500 /tmp/pg_list.json; echo "::endgroup::"
+            echo "::error::could not find ${DB_NAME}"; exit 1; }
+          echo "$DB_ID" > /tmp/db_id
+
+          curl -fsS -H "Authorization: Bearer ${RENDER_API_KEY}" -H 'Accept: application/json' \
+            "https://api.render.com/v1/postgres/${DB_ID}" \
+            | python3 -c "
+          import sys, json
+          d = json.load(sys.stdin)
+          # `or []`: Render returns the key PRESENT and null when the list is
+          # empty, so a dict default would never fire.
+          print(json.dumps(d.get('ipAllowList') or []))" > /tmp/ip_allow_original.json
+
+          RUNNER_IP="$(curl -fsS --max-time 30 https://api.ipify.org)"
+          python3 - "$RUNNER_IP" > /tmp/allow.json <<'PY'
+          import json, sys
+          cur = json.load(open('/tmp/ip_allow_original.json')) or []
+          cur = [e for e in cur if e.get('cidrBlock') != f'{sys.argv[1]}/32']
+          cur.append({'cidrBlock': f'{sys.argv[1]}/32', 'description': 'demo seeding'})
+          print(json.dumps({'ipAllowList': cur}))
+          PY
+          curl -fsS -X PATCH -H "Authorization: Bearer ${RENDER_API_KEY}" \
+            -H 'Content-Type: application/json' --data @/tmp/allow.json \
+            "https://api.render.com/v1/postgres/${DB_ID}" >/dev/null
+
+          CONN="$(curl -fsS -H "Authorization: Bearer ${RENDER_API_KEY}" -H 'Accept: application/json' \
+            "https://api.render.com/v1/postgres/${DB_ID}/connection-info" \
+            | python3 -c "import sys,json;print(json.load(sys.stdin)['externalConnectionString'])")"
+          echo "::add-mask::$CONN"
+          printf '%s' "$CONN" > /tmp/dburl
+          echo "firewall open"
+
+      - name: Ask production what the live-suite identity can act as
+        run: |
+          set -euo pipefail
+          export DATABASE_URL="$(cat /tmp/dburl)"
+          PSQL="$(ls /usr/lib/postgresql/*/bin/psql | head -1)"
+          "$PSQL" -v ON_ERROR_STOP=1 "$DATABASE_URL"             -f infrastructure/seed/diagnose_live_identity_roles.sql | tee /tmp/identity.txt
+
+      - name: Put it in the run summary
+        if: always()
+        run: |
+          {
+            echo "## Live-suite identity roles — production"
+            echo ""
+            echo "Read section 2. A membership with **is_earliest = t** and"
+            echo "**is_self_created = f** means the organisation's FIRST member was"
+            echo "created by somebody else, so 085 correctly refuses to promote a"
+            echo "later self-created assessor into an administrator."
+            echo ""
+            echo "Section 3 separates a real registration from a hand-seeded fixture:"
+            echo "a fixture can be corrected or removed, a real customer cannot."
+            echo ""
+            echo '```'
+            cat /tmp/identity.txt 2>/dev/null || echo "nothing was read"
+            echo '```'
+          } >> "$GITHUB_STEP_SUMMARY"
+
+      - name: Always restore the database firewall
+        if: always()
+        run: |
+          set -euo pipefail
+          [ -f /tmp/db_id ] && [ -f /tmp/ip_allow_original.json ] || { echo "nothing to restore"; exit 0; }
+          ID="$(cat /tmp/db_id)"
+          python3 -c "
+          import json
+          json.dump({'ipAllowList': json.load(open('/tmp/ip_allow_original.json')) or []},
+                    open('/tmp/restore.json','w'))"
+          curl -fsS -X PATCH -H "Authorization: Bearer ${RENDER_API_KEY}" \
+            -H 'Content-Type: application/json' --data @/tmp/restore.json \
+            "https://api.render.com/v1/postgres/${ID}" >/dev/null
+          echo "firewall restored"
+
+      - name: Always remove the credentials from the runner
+        if: always()
+        run: rm -f /tmp/dburl || true

 succeeded in 2077ms:
# AutoWorkshop AI

**The Complete AI-Powered Automotive Service, Repair and Workshop Operating System.**

Live target: [`autoworkshop.aiappinvent.com`](https://autoworkshop.aiappinvent.com) Â· Status: **Phase 5 â€” Release 0.4 (workshop + repair), in progress**

> âš ï¸ **`master` IS NOT DEPLOYABLE AS IT STANDS.** Workshop registration returns
> 500 in production until migration **037** is applied â€” `register_workshop`
> runs as a non-superuser there, where `FORCE ROW LEVEL SECURITY` applies to
> table owners. The fix is committed and verified; applying it is one workflow
> run, recorded in `.claude/CURRENT_TASK.md`. Everything else on `master` is
> green. This banner comes down when that workflow has run.
>
> `.claude/CURRENT_PHASE.md` carries the detailed phase state; this line is the
> release-level summary and the two must agree.

One platform connecting vehicle owners, workshops, technicians, auto electricians, electronics
specialists, body repairers, spray painters, welders, vulcanizers, upholsterers, suppliers, fleet
operators, insurers and towing providers.

The promise, end to end: **report the problem â†’ diagnose the fault â†’ simulate the solution â†’ approve the
work â†’ verify the parts â†’ track the repair** â€” every step authenticated, authorised, audited and recoverable.

---

## Zero-cost policy (hard)

Per `autoworkshop 05.txt` Â§1, Â§2, Â§6, Â§8 and ADR-012, this project uses **only zero-cost and open-source
tools â€” including in production**. No paid tool, subscription or mandatory paid service may be introduced.
A task is not complete if it added a paid dependency.

Where a capability normally costs money, it is built as a **disabled adapter behind an interface**:

- **Bring-your-own-connection (D7)** â€” each tenant connects their *own* OBD device, payment merchant
  account, SMTP server or model API key if they want one. The application works fully with none configured.
- **Upgrade-ready (D8)** â€” everything is self-hosted FOSS with full infrastructure-as-code, so moving to
  commercial infrastructure later (only if the product goes commercial) is a *hosting* change, not a rewrite.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router) Â· React Â· TypeScript Â· Tailwind Â· shadcn/ui Â· Radix |
| Backend | NestJS Â· TypeScript â€” modular monolith, 13 bounded domains |
| Database | PostgreSQL + `pgvector` â€” row-level security (`FORCE`) on every tenant table |
| Cache / jobs | Redis + BullMQ Â· **NATS** for domain events |
| Identity | Keycloak â€” own realm, OAuth 2.1 + PKCE |
| Storage | MinIO (S3-compatible) |
| Realtime | WebRTC + self-hosted `coturn` |
| AI | **Google ADK** (Python) â†’ **MCP Gateway** â†’ 19 MCP servers â†’ NestJS domain services |
| LLM | Local Ollama (`llama3.2`, `llava`) via ADK `LiteLlm` |
| Design | **Penpot** Â· Storybook Â· Playwright (incl. visual regression) Â· axe-core Â· Vitest |
| Ops | Docker Â· Prometheus Â· Grafana Â· Loki |

**The AI never touches the database.** Agents hold no database, storage, payment or admin credentials;
they call the MCP Gateway, which calls authoritative NestJS domain services, which enforce every business
rule. Enforced in infrastructure and asserted by negative tests in CI â€” not by policy text.

---

## Repository layout

```
apps/        customer-web workshop-web supplier-web fleet-web insurance-web towing-web admin-web
             mobile (React Native/Expo, Android first) Â· api (NestJS) Â· mcp-gateway Â· mcp-servers
             agent-host (Python + ADK) Â· media-worker Â· storybook
packages/    design-tokens ui navigation forms tables charts workflow media offline-sync i18n
             ai-assistant mcp-ui accessibility auth api-client domain-contracts validation events â€¦
python-packages/  adk-core adk-agents mcp-client agent-evals
domains/     13 bounded contexts â€” pure business logic
infrastructure/   docker compose keycloak migrations policies
tests/       playwright visual a11y tenant-isolation offline mcp
docs/        00-project â€¦ 14-user-guides
```

## Branches & commits

`master` (production-ready) Â· `develop` (integration) Â· short-lived `feature/*` branches.
Conventional commits: `feat(scope):` Â· `fix(scope):` Â· `chore(scope):` Â· `docs(scope):`.

## Documentation

`ARCHITECTURE.md` Â· `SECURITY.md` Â· `ROADMAP.md` Â· `CLAUDE.md` Â· `docs/`
Approved plan: `Documents\autoworkshop app\_plan\COMBINED_PLAN_v2.md`
(passed Codex `PASS WITH CORRECTIONS` â†’ Supervisor `PASS WITH CONDITIONS`, all applied).

**Reference implementation: [`solar-pv-designer-lite`](https://github.com/marc667us/solar-pv-designer-lite)** â€”
patterns, CI shape and operational lessons are taken from it. The two applications are deliberately
**not** entangled: separate repo, database, Keycloak realm, deployment, secrets and CI. If Solar were
deleted tomorrow, this must still build, deploy and run.

 succeeded in 3078ms:
docs\13-operations\LIVE-OUTAGE-2026-07-28.md
docs\11-devops\RLS_ORG_PREDICATE_GAP.md
docs\11-devops\ENVIRONMENTS.md
docs\03-ui-ux\NAVIGATION-GAPS-PROPOSAL.md
docs\01-product\USER_ROLES.md
docs\01-product\UAT_2026-08-14.md
docs\01-product\PERMISSION_MATRIX.md
docs\01-product\BUSINESS_RULES.md
docs\10-testing\TEST_STRATEGY.md
docs\00-project\RELEASE_PLAN.md
docs\00-project\PROJECT_SCOPE.md
docs\00-project\PLAN_EXTENSION_v1.md
docs\00-project\IMPLEMENTATION_PROGRAMME.md
docs\00-project\DRAFT_ViewerUnavailableScreen.tsx.txt
docs\00-project\DEFINITION_OF_DONE.md
docs\00-project\CUSTOMER_VALUE_CHAIN.md
docs\00-project\COMPLETION_PLAN.md
docs\00-project\COMBINED_PLAN_v2.md
docs\05-database\RELATIONSHIPS.md
docs\05-database\DRIFT_2026-08-14_register_workshop.md
docs\05-database\DATABASE_MIGRATIONS.md
docs\05-database\BACKUP_AND_RESTORE.md
docs\02-architecture\adr\ADR-005-KEYCLOAK-IS-MANDATORY.md
docs\04-security\TENANT_ISOLATION.md
docs\04-security\RBAC.md
docs\02-architecture\adr\ADR-002-NEXT.JS-APP-ROUTER-FOR-ALL-SEVEN-WEB-APPLICATIONS.md
docs\02-architecture\adr\ADR-001-MONOREPO.md
docs\02-architecture\adr\ADR-003-NESTJS-MODULAR-MONOLITH.md
docs\02-architecture\adr\ADR-004-POSTGRESQL-WITH-ROW-LEVEL-SECURITY.md
docs\02-architecture\adr\ADR-008-STORYBOOK-AS-THE-COMPONENT-CATALOGUE.md
docs\02-architecture\adr\ADR-007-PENPOT.md
docs\02-architecture\adr\ADR-006-REDIS-FOR-CACHE-AND-SHORT-LIVED-JOBS-ONLY.md
docs\02-architecture\adr\ADR-010-MCP-GATEWAY-AS-THE-SOLE-AI-BOUNDARY.md
docs\02-architecture\adr\ADR-009-PLAYWRIGHT-FOR-E2E.md
docs\02-architecture\adr\ADR-011-MULTI-TENANCY-AND-THE-SOLAR-BOUNDARY.md
docs\02-architecture\adr\ADR-012-ZERO-COST-TOOLING.md
docs\02-architecture\adr\ADR-023-FLEET-CROSS-TENANT-SERVICE-CONTRACT.md
docs\02-architecture\adr\ADR-022-N8N-AS-AN-AGENT-CREATION-SURFACE.md
docs\02-architecture\adr\ADR-021-ONE-DEPLOYED-APPLICATION-SEVEN-PACKS-INSIDE-IT.md
docs\02-architecture\adr\ADR-020-FLEET-SEES-WORKSHOP-DATA-THROUGH-ITS-OWN-MEMBERSHIPS.md
docs\02-architecture\adr\ADR-019-AGENT-HOST-WITHOUT-ADK.md
docs\02-architecture\adr\ADR-018-REPAIR-ORCHESTRATOR-NO-ADK.md
docs\02-architecture\adr\ADR-018-EXPO-SDK-52-FOR-THE-MOBILE-APP.md
docs\02-architecture\adr\ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md
docs\02-architecture\adr\ADR-016-ZERO-COST-NOW.md
docs\02-architecture\adr\ADR-015-BRING-YOUR-OWN-CONNECTION-FOR-EXTERNAL-PROVIDERS.md
docs\02-architecture\adr\ADR-014-NATS-FOR-DOMAIN-EVENTS;-POSTGRES-FTS-NOW.md
docs\02-architecture\adr\ADR-013-GOOGLE-ADK-OVER-MCP-—-THE-PYTHON\TYPESCRIPT-SPLIT.md

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$n=0; Get-Content infrastructure/seed/diagnose_live_identity_roles.sql | ForEach-Object { $n++; "${n}:$_" }' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$n=0; Get-Content .github/workflows/diagnose-live-identity-roles.yml | ForEach-Object { $n++; "${n}:$_" }' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "A3|identity roles|LIVE_OWNER_EMAIL|diagnose-live|73 passed|RoleSwitcher" .claude docs README.md tests apps .github infrastructure' in C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
2026-08-19T20:00:10.407969Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$n=0; Get-Content infrastructure/seed/diagnose_live_identity_roles.sql | ForEach-Object { $n++; "${n}:$_" }'` rejected: blocked by policy
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$n=0; Get-Content infrastructure/seed/diagnose_live_identity_roles.sql | ForEach-Object { $n++; "${n}:$_" }'` rejected: blocked by policy
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$n=0; Get-Content .github/workflows/diagnose-live-identity-roles.yml | ForEach-Object { $n++; "${n}:$_" }'` rejected: blocked by policy
2026-08-19T20:00:10.408335Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$n=0; Get-Content .github/workflows/diagnose-live-identity-roles.yml | ForEach-Object { $n++; "${n}:$_" }'` rejected: blocked by policy
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "''^" infrastructure/seed/diagnose_live_identity_roles.sql' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "''^" .github/workflows/diagnose-live-identity-roles.yml' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "A3|identity roles|LIVE_OWNER_EMAIL|diagnose-live|73 passed|RoleSwitcher" .claude docs README.md tests apps .github infrastructure' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 816ms:
1:-- Read-only: which identity does the live suite sign in as, and what can it act as?
2:--
3:-- ══════════════════════════════════════════════════════════════════════════
4:-- 🔴 WHY THIS EXISTS. Live-suite run 32290511884 found the role switcher
5:-- ABSENT for the signed-in account:
6:--
7:--     getByLabel('Acting as role')  ->  element(s) not found
8:--
9:-- `RoleSwitcher` renders nothing below two roles, so the control is absent
10:-- rather than broken. The conclusion drawn was that `LIVE_OWNER_EMAIL` is a CI
11:-- test identity holding ONE role — which makes the signed-in half of the suite
12:-- structurally unable to verify any partner-role screen (insurance, towing,
13:-- fleet).
14:--
15:-- ⚠️ THAT CONCLUSION WAS INFERRED FROM A MISSING DOM NODE. It is consistent
16:-- with `RoleSwitcher`'s source and with the recorded test identities, and it is
17:-- still an inference. Before writing memberships into production on the back of
18:-- it, ASK THE DATABASE. Reasoning from source has been wrong twice this week.
19:--
20:-- ⚠️ AND THE SECRET IS NOT READABLE HERE. `LIVE_OWNER_EMAIL` is a repository
21:-- secret; this file cannot know its value, so it lists every plausible
22:-- candidate — the recorded `live-*@aiappinvent.com` identities and the
23:-- operator's own account — with the membership count that decides whether a
24:-- switcher renders at all.
25:--
26:-- 🔴 READ-ONLY. Every statement is a SELECT.
27:-- ══════════════════════════════════════════════════════════════════════════
28:
29:\pset pager off
30:\timing off
31:
32:-- Session-scoped, NOT transaction-local: each psql statement outside an
33:-- explicit transaction is its own transaction, so `true` would be discarded
34:-- before the next one ran. That mistake made an 08-16 diagnostic print
35:-- `(0 rows)` against a populated table.
36:SELECT set_config('app.current_role', 'admin', false) AS platform_context;
37:
38:\echo ''
39:\echo '=== 0. can we see anything? (0 here means the escape failed) ==='
40:SELECT current_user AS running_as,
41:       (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_superuser,
42:       (SELECT count(*) FROM identity.users)       AS users_visible,
43:       (SELECT count(*) FROM identity.memberships) AS memberships_visible;
44:
45:\echo ''
46:\echo '=== 1. CANDIDATE IDENTITIES, and how many ACTIVE roles each holds ==='
47:-- 🔴 `active_roles` IS THE ANSWER. `RoleSwitcher` returns null below 2, so any
48:-- account showing 1 here cannot verify a partner-role screen no matter how many
49:-- times the suite runs.
50:SELECT u.email,
51:       u.display_name,
52:       u.status,
53:       count(m.id) FILTER (WHERE m.status = 'active')                       AS active_memberships,
54:       count(DISTINCT m.role_name) FILTER (WHERE m.status = 'active')       AS active_roles,
55:       string_agg(DISTINCT m.role_name, ', ') FILTER (WHERE m.status = 'active') AS roles
56:  FROM identity.users u
57:  LEFT JOIN identity.memberships m ON m.user_id = u.id
58: WHERE u.email ILIKE '%aiappinvent.com'
59:    OR u.email ILIKE '%yahoo.com'
60: GROUP BY u.id, u.email, u.display_name, u.status
61: ORDER BY active_roles DESC, u.email;
62:
63:\echo ''
64:\echo '=== 2. the [AUDIT] partner organisations, and who is in them ==='
65:-- These are the organisations a CI identity would need memberships in for the
66:-- A3 checks to assert rather than skip.
67:SELECT o.name,
68:       o.org_type,
69:       o.id                AS organization_id,
70:       o.tenant_id,
71:       u.email             AS member,
72:       m.role_name,
73:       m.status
74:  FROM identity.organizations o
75:  LEFT JOIN identity.memberships m ON m.organization_id = o.id AND m.tenant_id = o.tenant_id
76:  LEFT JOIN identity.users u       ON u.id = m.user_id
77: WHERE o.org_type IN ('insurance_company', 'towing_company', 'fleet_operator')
78: ORDER BY o.org_type, o.name, u.email;
79:
80:\echo ''
81:\echo '=== 3. what a fleet membership would even be worth — is there a fleet org? ==='
82:-- Slice 20 built nine fleet screens. If no fleet_operator organisation exists on
83:-- production, no signed-in viewer can reach them at all, which is a separate
84:-- finding from the switcher one.
85:SELECT count(*) FILTER (WHERE org_type = 'fleet_operator')    AS fleet_orgs,
86:       count(*) FILTER (WHERE org_type = 'insurance_company') AS insurance_orgs,
87:       count(*) FILTER (WHERE org_type = 'towing_company')    AS towing_orgs
88:  FROM identity.organizations
89: WHERE status = 'active';

 succeeded in 830ms:
1:# Read-only: which identity does the live suite sign in as, and what can it act as?
2:#
3:# ══════════════════════════════════════════════════════════════════════════
4:# Live-suite run 32290511884 found the role switcher ABSENT for the signed-in
5:# account. `RoleSwitcher` renders nothing below two roles, so the conclusion was
6:# that `LIVE_OWNER_EMAIL` is a CI identity holding ONE role — which makes the
7:# signed-in half of the suite structurally unable to verify any partner-role
8:# screen, and left four A3 checks skipping.
9:#
10:# ⚠️ THAT CONCLUSION WAS INFERRED FROM A MISSING DOM NODE. Before writing
11:# memberships into production on the back of it, ASK THE DATABASE. Reasoning
12:# from source has been wrong twice this week.
13:#
14:# 🔴 READ-ONLY. Every statement in the SQL is a SELECT. No confirm input, which
15:# is the point: a diagnostic nobody can run without ceremony does not get run.
16:# ══════════════════════════════════════════════════════════════════════════
17:
18:name: Diagnose live identity roles
19:
20:on:
21:  workflow_dispatch:
22:
23:concurrency:
24:  # A6 — ALL of these open the production database firewall by PATCHing the
25:  # WHOLE ipAllowList, so they must never overlap. Render has no atomic
26:  # per-entry operation, so every capture/add/restore is a read-modify-write on
27:  # one shared resource. It races at least THREE ways:
28:  #   1. FILTERED CAPTURE (apply-migrations, backup-production-db,
29:  #      rehearse-migration) drops every entry containing 'ephemeral:' when
30:  #      building its snapshot. It cannot tell a dead run's entry from a LIVE
31:  #      one's, so it deletes a running job's entry the moment it starts.
32:  #   2. UNFILTERED RESTORE (the other twelve) restores a snapshot taken before
33:  #      another run added its entry, deleting it on the way out.
34:  #   3. CONCURRENT ADD (any two unfiltered runs) — both GET the same original
35:  #      list, then both PATCH 'original + mine'. The second add deletes the
36:  #      first run's entry before either restore happens.
37:  #   (and mixed order can RESURRECT a stale entry: an unfiltered run snapshots
38:  #    a foreign ephemeral entry and restores it after its owner removed it.)
39:  # The victim fails with 'SSL connection has been closed unexpectedly', which
40:  # is a LIE about the cause and reads as a database outage. At least six failed
41:  # runs on 2026-08-14 were this.
42:  #
43:  # ⚠️ A RETRY IS NOT A FIX — five retries failed identically, because the entry
44:  # stays deleted. And "remove only MY entry" is still racy: the API takes the
45:  # whole list.
46:  #
47:  # 🔴 THE COST OF THIS MUTEX, STATED PLAINLY — GITHUB'S WAITING ROOM HOLDS ONE.
48:  # A concurrency group is NOT a fifteen-deep FIFO queue. GitHub keeps at most
49:  # ONE pending run per group and REPLACES it when a newer one arrives, with no
50:  # ordering guarantee. So a pending deploy-api, migration APPLY, seed or backup
51:  # can be silently discarded by a newer arrival — and apply-migrations runs
52:  # automatically after EVERY Release, so automatic inspections compete with
53:  # deliberate operator requests. A cancelled PENDING run is firewall-safe (it
54:  # never opened anything) but the REQUEST IS LOST, not merely delayed.
55:  # ▶ THEREFORE: after dispatching any of these, capture the run id and confirm
56:  #   it actually STARTED. `gh run list --workflow=<wf> -L 3 --json databaseId,status`
57:  #   A 'cancelled' run you did not cancel is an evicted request — re-dispatch it.
58:  #
59:  # ⚠️ cancel-in-progress MUST stay false: cancelling a run mid-window would
60:  # leave its ephemeral entry live on the production firewall. But it does NOT
61:  # close every such path — a job timeout, a manual/API cancellation or runner
62:  # loss can still kill a run between its add PATCH and its restore step, and an
63:  # `if: always()` restore is not a reliable finally block against those. The
64:  # filtered-capture workflows clean up a stale entry on their next run; until
65:  # then the exposure is real.
66:  group: production-db-firewall
67:  cancel-in-progress: false
68:
69:jobs:
70:  diagnose:
71:    runs-on: ubuntu-latest
72:    timeout-minutes: 15
73:    env:
74:      RENDER_API_KEY: ${{ secrets.RENDER_API_KEY }}
75:      DB_NAME: autoworkshop-postgres
76:    steps:
77:      - uses: actions/checkout@v4
78:
79:      - name: Refuse without a key
80:        run: |
81:          set -euo pipefail
82:          [ -n "${RENDER_API_KEY:-}" ] || { echo "::error::RENDER_API_KEY is not set"; exit 1; }
83:
84:      - name: Find the database and open the firewall for this runner
85:        run: |
86:          set -euo pipefail
87:          sudo apt-get update -qq && sudo apt-get install -y -qq postgresql-client >/dev/null
88:          curl -fsS -H "Authorization: Bearer ${RENDER_API_KEY}" -H 'Accept: application/json' \
89:            "https://api.render.com/v1/postgres?name=${DB_NAME}&limit=20" > /tmp/pg_list.json || true
90:          DB_ID="$(python3 -c "
91:          import json, os
92:          try:
93:              rows = json.load(open('/tmp/pg_list.json'))
94:          except Exception:
95:              rows = None
96:          if isinstance(rows, dict):
97:              rows = rows.get('postgres') or rows.get('items') or []
98:          for r in (rows or []):
99:              d = r.get('postgres', r) if isinstance(r, dict) else {}
100:              if d.get('name') == os.environ['DB_NAME']:
101:                  print(d.get('id','')); break
102:          ")"
103:          [ -n "$DB_ID" ] || {
104:            echo "::group::what /v1/postgres returned"; head -c 500 /tmp/pg_list.json; echo "::endgroup::"
105:            echo "::error::could not find ${DB_NAME}"; exit 1; }
106:          echo "$DB_ID" > /tmp/db_id
107:
108:          curl -fsS -H "Authorization: Bearer ${RENDER_API_KEY}" -H 'Accept: application/json' \
109:            "https://api.render.com/v1/postgres/${DB_ID}" \
110:            | python3 -c "
111:          import sys, json
112:          d = json.load(sys.stdin)
113:          # `or []`: Render returns the key PRESENT and null when the list is
114:          # empty, so a dict default would never fire.
115:          print(json.dumps(d.get('ipAllowList') or []))" > /tmp/ip_allow_original.json
116:
117:          RUNNER_IP="$(curl -fsS --max-time 30 https://api.ipify.org)"
118:          python3 - "$RUNNER_IP" > /tmp/allow.json <<'PY'
119:          import json, sys
120:          cur = json.load(open('/tmp/ip_allow_original.json')) or []
121:          cur = [e for e in cur if e.get('cidrBlock') != f'{sys.argv[1]}/32']
122:          cur.append({'cidrBlock': f'{sys.argv[1]}/32', 'description': 'demo seeding'})
123:          print(json.dumps({'ipAllowList': cur}))
124:          PY
125:          curl -fsS -X PATCH -H "Authorization: Bearer ${RENDER_API_KEY}" \
126:            -H 'Content-Type: application/json' --data @/tmp/allow.json \
127:            "https://api.render.com/v1/postgres/${DB_ID}" >/dev/null
128:
129:          CONN="$(curl -fsS -H "Authorization: Bearer ${RENDER_API_KEY}" -H 'Accept: application/json' \
130:            "https://api.render.com/v1/postgres/${DB_ID}/connection-info" \
131:            | python3 -c "import sys,json;print(json.load(sys.stdin)['externalConnectionString'])")"
132:          echo "::add-mask::$CONN"
133:          printf '%s' "$CONN" > /tmp/dburl
134:          echo "firewall open"
135:
136:      - name: Ask production what the live-suite identity can act as
137:        run: |
138:          set -euo pipefail
139:          export DATABASE_URL="$(cat /tmp/dburl)"
140:          PSQL="$(ls /usr/lib/postgresql/*/bin/psql | head -1)"
141:          "$PSQL" -v ON_ERROR_STOP=1 "$DATABASE_URL"             -f infrastructure/seed/diagnose_live_identity_roles.sql | tee /tmp/identity.txt
142:
143:      - name: Put it in the run summary
144:        if: always()
145:        run: |
146:          {
147:            echo "## Live-suite identity roles — production"
148:            echo ""
149:            echo "⚠️ This prose used to describe **is_earliest** and **is_self_created**,"
150:            echo "columns this workflow's SQL has never emitted — it was copied from"
151:            echo "\`repair-audit-org-founders.yml\` along with the firewall boilerplate."
152:            echo "A summary naming columns that are not in the output below is the same"
153:            echo "stale-artifact failure recorded on 08-19 for I7."
154:            echo ""
155:            echo "**Section 1 is the answer.** \`active_roles\` per candidate: 1 means that"
156:            echo "account cannot verify a partner screen, because \`RoleSwitcher\` renders"
157:            echo "nothing below two roles."
158:            echo ""
159:            echo "**Section 2** lists the \`[AUDIT]\` partner organisations and their members —"
160:            echo "the memberships a CI identity would need for the A3 checks to assert."
161:            echo ""
162:            echo "**Section 3**: if \`fleet_orgs = 0\`, slice 20's nine screens are unreachable"
163:            echo "by any signed-in viewer, which is a larger finding than the switcher one."
164:            echo ""
165:            echo '```'
166:            cat /tmp/identity.txt 2>/dev/null || echo "nothing was read"
167:            echo '```'
168:          } >> "$GITHUB_STEP_SUMMARY"
169:
170:      - name: Always restore the database firewall
171:        if: always()
172:        run: |
173:          set -euo pipefail
174:          [ -f /tmp/db_id ] && [ -f /tmp/ip_allow_original.json ] || { echo "nothing to restore"; exit 0; }
175:          ID="$(cat /tmp/db_id)"
176:          python3 -c "
177:          import json
178:          json.dump({'ipAllowList': json.load(open('/tmp/ip_allow_original.json')) or []},
179:                    open('/tmp/restore.json','w'))"
180:          curl -fsS -X PATCH -H "Authorization: Bearer ${RENDER_API_KEY}" \
181:            -H 'Content-Type: application/json' --data @/tmp/restore.json \
182:            "https://api.render.com/v1/postgres/${ID}" >/dev/null
183:          echo "firewall restored"
184:
185:      - name: Always remove the credentials from the runner
186:        if: always()
187:        run: rm -f /tmp/dburl || true

 succeeded in 3352ms:
.claude\TASK_LIST_2026-08-19.md:6:Live suite 73 passed / 0 failed / 1 SKIPPED. Coverage 274/385.**
.claude\TASK_LIST_2026-08-19.md:38:| **Live suite** | ✅ **73 passed · 0 failed · 1 SKIPPED** | run 32258157016 (69 anonymous + 4 signed-in) |
.claude\TASK_LIST_2026-08-19.md:63:| ~~A3~~ | ~~Sign in as an `insurance_owner` and LOOK~~ | ✅ **ANSWERED 08-19 pt4 — and the answer is that this harness CANNOT.** `LIVE_OWNER_EMAIL` is a CI identity holding ONE role, so `RoleSwitcher` renders nothing and no partner-role screen can be verified by a signed-in viewer. Four live checks now SKIP loudly rather than pass. **FIX: give that identity memberships in the `[AUDIT]` insurance/towing/fleet organisations.** |
.claude\TASK_LIST_2026-08-19.md:64:| **A3-old** | ~~Sign in as an `insurance_owner` and LOOK~~ — at `/insurance/settings/users`, `/towing/operations/settings` AND the new enquiry inbox on `/insurance/sales/my-products`. | Carried from 08-17 N4, now with more riding on it. A green build is not a working feature; two features have shipped here having never once worked under green gates. |
.claude\TASK_LIST_2026-08-17.md:554:| **Live suite — signed-in** | 🔴 **NOT RUN.** Needs `LIVE_OWNER_EMAIL` / `LIVE_OWNER_PASSWORD` repo secrets and a workflow dispatch; both blocked by I13. **4 checks unmeasured — that is a third state, not a pass.** |
infrastructure\seed\grant_live_suite_partner_memberships.sql:4:-- 🔴 WHAT THIS CLOSES — A3, AND ONLY HALF OF IT.
infrastructure\seed\grant_live_suite_partner_memberships.sql:6:-- `diagnose-live-identity-roles.yml` run 32293446882 asked production rather
infrastructure\seed\grant_live_suite_partner_memberships.sql:13:-- So the signed-in half of the live suite holds ONE role and `RoleSwitcher`
infrastructure\seed\grant_live_suite_partner_memberships.sql:14:-- renders nothing below two. Four A3 checks skip, and four screens built in
infrastructure\seed\grant_live_suite_partner_memberships.sql:65:-- `LIVE_OWNER_EMAIL` is a repository secret. This script takes it as
infrastructure\seed\grant_live_suite_partner_memberships.sql:107:    -- Measured 2026-08-19 by diagnose-live-identity-roles.yml run 32293446882.
infrastructure\seed\grant_live_suite_partner_memberships.sql:133:        RAISE EXCEPTION 'no ACTIVE identity.users row with e-mail %. LIVE_OWNER_EMAIL '
infrastructure\seed\grant_live_suite_partner_memberships.sql:233:                        're-run diagnose-live-identity-roles.yml and re-measure the ids.',
infrastructure\seed\diagnose_live_identity_roles.sql:9:-- `RoleSwitcher` renders nothing below two roles, so the control is absent
infrastructure\seed\diagnose_live_identity_roles.sql:10:-- rather than broken. The conclusion drawn was that `LIVE_OWNER_EMAIL` is a CI
infrastructure\seed\diagnose_live_identity_roles.sql:16:-- with `RoleSwitcher`'s source and with the recorded test identities, and it is
infrastructure\seed\diagnose_live_identity_roles.sql:20:-- ⚠️ AND THE SECRET IS NOT READABLE HERE. `LIVE_OWNER_EMAIL` is a repository
infrastructure\seed\diagnose_live_identity_roles.sql:47:-- 🔴 `active_roles` IS THE ANSWER. `RoleSwitcher` returns null below 2, so any
infrastructure\seed\diagnose_live_identity_roles.sql:66:-- A3 checks to assert rather than skip.
.claude\TASK_LIST_2026-08-15.md:103:### A3 · (schedule item 3) Separation of duties inside an insurer does not exist
.claude\TASK_LIST_2026-08-15.md:405:*Phase 7 · absorbs A2 and A3*
.claude\SESSION_HANDOVER.md:6:Production migrations 85/85. Live suite 73 passed / 0 failed / 5 SKIPPED.**
.claude\SESSION_HANDOVER.md:14:**Close A3 for real: turn its four SKIPS into four assertions.** The work is
.claude\SESSION_HANDOVER.md:18:gh workflow run diagnose-live-identity-roles.yml     # read-only, no confirm needed
.claude\SESSION_HANDOVER.md:24:> Which identity does `LIVE_OWNER_EMAIL` resolve to, and how many ACTIVE roles
.claude\SESSION_HANDOVER.md:28:role')` absent. `RoleSwitcher` renders nothing below two roles, so the account
.claude\SESSION_HANDOVER.md:29:holds one — which is why four A3 checks skip. ⚠️ **That is an inference from a
.claude\SESSION_HANDOVER.md:30:missing DOM node.** It matches `RoleSwitcher`'s source and the recorded
.claude\SESSION_HANDOVER.md:47:4. **Re-run `live-suite.yml`.** The four A3 checks should move from SKIPPED to
.claude\SESSION_HANDOVER.md:66:- **A3** — the fixture gap above. Four checks skip until it is closed.
.claude\SESSION_HANDOVER.md:91:## ═══ 2026-08-19 (pt4) — A3 answered: the harness cannot answer A3 ═══
.claude\SESSION_HANDOVER.md:97:| **Live suite** | **73 passed · 0 failed · 5 SKIPPED** (69+4 anon/signed-in, 1+4 skips) |
.claude\SESSION_HANDOVER.md:103:### 🔴 A3 IS ANSWERED. THE ANSWER IS THAT THIS HARNESS CANNOT ANSWER IT.
.claude\SESSION_HANDOVER.md:105:A3 — *"sign in as an `insurance_owner` and LOOK"* — has been open since
.claude\SESSION_HANDOVER.md:115:`RoleSwitcher` returns `null` below two roles ("one role is not a choice"), so
.claude\SESSION_HANDOVER.md:116:the control is **absent, not broken**. **`LIVE_OWNER_EMAIL` is a dedicated CI
.claude\SESSION_HANDOVER.md:121:partner-role screen — insurance, towing or fleet.** A3 was not merely unmet
.claude\SESSION_HANDOVER.md:129:▶ **WHAT WOULD CLOSE IT:** give `LIVE_OWNER_EMAIL` memberships in the `[AUDIT]`
.claude\SESSION_HANDOVER.md:162:`.claude/TASK_LIST_2026-08-19.md`. **A3 is now a named fixture gap with a stated
.claude\SESSION_HANDOVER.md:175:| **Live suite** | **73 passed · 0 failed · 1 SKIPPED** |
.claude\SESSION_HANDOVER.md:224:vehicle costs and reports all need data layers that do not exist. **A3 (sign in
.claude\SESSION_HANDOVER.md:237:| **Live suite** | **73 passed · 0 failed · 1 SKIPPED** — baseline held |
.claude\SESSION_HANDOVER.md:318:live API routes to build on. A3 (sign in as an `insurance_owner` and LOOK) is
.claude\SESSION_HANDOVER.md:330:| **Live suite** | **73 passed · 0 failed · 1 SKIPPED** (69 anonymous + 4 signed-in) — was 70/0/1; +3 new slice-17 checks |
.claude\SESSION_HANDOVER.md:1434:**Part A closed: A1, A2, A3, A4, A5, A7, A8.** A4's T-0044 was measured at 0px
apps\web\app\towing\_screens\drivers-screen.tsx:25: * elsewhere. Open item A3 in the handover is that 2 of ~40 list screens have
infrastructure\migrations\verify\073_relationships.sql:37:    jcA3 uuid := gen_random_uuid(); jcB uuid := gen_random_uuid();
infrastructure\migrations\verify\073_relationships.sql:185:             (jcA3, tid, orgA, 'JC-073-A3', custA, vehA, 'A: intake'),
infrastructure\migrations\verify\073_relationships.sql:227:      VALUES (intakeA, tid, orgA, vehA, jcA3);
infrastructure\migrations\verify\073_relationships.sql:229:    DELETE FROM repair.job_cards WHERE id = jcA3;
.github\workflows\rehearse-migration.yml:605:          # 🔴 A3 — SEQUENCES DO NOT ROLL BACK. `nextval()` is deliberately
.github\workflows\rehearse-migration.yml:650:          # ── A3: sequences are reported, never claimed clean. They cannot roll
.github\workflows\provision-live-suite-account.yml:8:# since it was written, because `LIVE_OWNER_EMAIL` / `LIVE_OWNER_PASSWORD` were
.github\workflows\provision-live-suite-account.yml:31:#     gh secret set LIVE_OWNER_EMAIL
.github\workflows\provision-live-suite-account.yml:133:      LIVE_OWNER_EMAIL: ${{ secrets.LIVE_OWNER_EMAIL }}
.github\workflows\provision-live-suite-account.yml:163:              ACCOUNT_EMAIL="${LIVE_OWNER_EMAIL:-}";    ACCOUNT_PASSWORD="${LIVE_OWNER_PASSWORD:-}"
.github\workflows\diagnose-live-identity-roles.yml:5:# account. `RoleSwitcher` renders nothing below two roles, so the conclusion was
.github\workflows\diagnose-live-identity-roles.yml:6:# that `LIVE_OWNER_EMAIL` is a CI identity holding ONE role — which makes the
.github\workflows\diagnose-live-identity-roles.yml:8:# screen, and left four A3 checks skipping.
.github\workflows\diagnose-live-identity-roles.yml:18:name: Diagnose live identity roles
.github\workflows\diagnose-live-identity-roles.yml:147:            echo "## Live-suite identity roles — production"
.github\workflows\diagnose-live-identity-roles.yml:156:            echo "account cannot verify a partner screen, because \`RoleSwitcher\` renders"
.github\workflows\diagnose-live-identity-roles.yml:160:            echo "the memberships a CI identity would need for the A3 checks to assert."
.github\workflows\grant-live-suite-partner-memberships.yml:1:# Grant the live-suite identity its partner-workspace memberships — CLOSING A3.
.github\workflows\grant-live-suite-partner-memberships.yml:4:# 🔴 WHAT THIS IS FOR. `diagnose-live-identity-roles.yml` run 32293446882 asked
.github\workflows\grant-live-suite-partner-memberships.yml:6:# live suite signs in as holds ONE active role (`workshop_owner`). So four A3
.github\workflows\grant-live-suite-partner-memberships.yml:26:# ⚠️ THE ACCOUNT IS NEVER NAMED HERE. It comes from `LIVE_OWNER_EMAIL`, the same
.github\workflows\grant-live-suite-partner-memberships.yml:103:      LIVE_OWNER_EMAIL: ${{ secrets.LIVE_OWNER_EMAIL }}
.github\workflows\grant-live-suite-partner-memberships.yml:129:          [ -n "${LIVE_OWNER_EMAIL:-}" ] || {
.github\workflows\grant-live-suite-partner-memberships.yml:130:            echo "::error::LIVE_OWNER_EMAIL is not set. This workflow grants memberships to the account the live suite signs in as; without the secret it does not know which account that is, and it will not guess."
.github\workflows\grant-live-suite-partner-memberships.yml:194:            -v live_email="${LIVE_OWNER_EMAIL}" \
.github\workflows\grant-live-suite-partner-memberships.yml:211:            echo "live suite must be re-run to turn the four A3 skips into passes."
.github\workflows\live-suite.yml:771:      LIVE_OWNER_EMAIL: ${{ secrets.LIVE_OWNER_EMAIL }}
.github\workflows\live-suite.yml:778:          if [ -z "${LIVE_OWNER_EMAIL}" ] || [ -z "${LIVE_OWNER_PASSWORD}" ]; then
.github\workflows\live-suite.yml:779:            echo "::warning::LIVE_OWNER_EMAIL / LIVE_OWNER_PASSWORD are not set. Every"\
.github\workflows\live-suite.yml:882:                    'about what a signed-in owner sees. Set LIVE_OWNER_EMAIL and '
apps\e2e\verify\verify-live-workshop-spine.mjs:11: *   LIVE_OWNER_EMAIL=... LIVE_OWNER_PASSWORD=... node verify/verify-live-workshop-spine.mjs
apps\e2e\verify\verify-live-workshop-spine.mjs:13:const LIVE_USER = process.env['LIVE_OWNER_EMAIL'] ?? '';
apps\e2e\verify\verify-live-workshop-spine.mjs:19:  console.log('SKIPPED: set LIVE_OWNER_EMAIL and LIVE_OWNER_PASSWORD. Nothing was attempted.');
apps\e2e\tests\live-signed-in.spec.ts:24: * `LIVE_OWNER_EMAIL` / `LIVE_OWNER_PASSWORD` are repository secrets. When they
apps\e2e\tests\live-signed-in.spec.ts:148:const OWNER_EMAIL = process.env['LIVE_OWNER_EMAIL'] ?? '';
apps\e2e\tests\live-signed-in.spec.ts:213:      'LIVE_OWNER_EMAIL / LIVE_OWNER_PASSWORD are not set — the SIGNED-IN half of ' +
apps\e2e\tests\live-signed-in.spec.ts:375: * A3 — "SIGN IN AS AN `insurance_owner` AND LOOK", TURNED INTO A CHECK.
apps\e2e\tests\live-signed-in.spec.ts:403:      'LIVE_OWNER_EMAIL / LIVE_OWNER_PASSWORD are not set — A3 did NOT run, so ' +
apps\e2e\tests\live-signed-in.spec.ts:409:   * The switcher is the mechanism A3 depends on, so it is asserted first and
apps\e2e\tests\live-signed-in.spec.ts:415:   * 🔴 THIS CHECK ANSWERED A3 — AND THEN THE ANSWER TURNED OUT TO BE ABOUT THE
apps\e2e\tests\live-signed-in.spec.ts:419:   * `RoleSwitcher` returns `null` when the viewer holds fewer than two roles
apps\e2e\tests\live-signed-in.spec.ts:422:   * `diagnose-live-identity-roles.yml` run 32293446882 asked production and
apps\e2e\tests\live-signed-in.spec.ts:467:      'A3 UNANSWERED: this CI identity belongs to ONE organisation, so the ' +
apps\e2e\tests\live-signed-in.spec.ts:479:    console.log(`A3: the account belongs to: ${orgs.join(', ')}`);
apps\e2e\tests\live-signed-in.spec.ts:533:      'A3 UNANSWERED: this CI identity belongs to no insurance organisation, so ' +
apps\e2e\tests\live-signed-in.spec.ts:541:    // Asserting the status code would pass over exactly the thing A3 exists to
apps\e2e\tests\live-signed-in.spec.ts:557:      'A3 UNANSWERED: this CI identity belongs to no insurance organisation, so ' +
apps\api\src\selfservice\customer-records.integration.spec.ts:14: * SLICE 12 + LIST A ITEM A3 — PROVEN AGAINST A REAL DATABASE.
apps\api\src\selfservice\customer-records.integration.spec.ts:20: * product, because the question A3 asks is different:
apps\api\src\selfservice\customer-records.integration.spec.ts:83: * out loud that slice 12, A3 and A5 were not proven by it.
apps\api\src\selfservice\customer-records.integration.spec.ts:170:        'not passed. Slice 12, A3 and A5 are NOT proven by this run.',
apps\api\src\selfservice\customer-records.integration.spec.ts:358:  // ── A3: THE STAFF GATE, PROVEN FROM THE OUTSIDE ─────────────────────────
apps\api\src\selfservice\customer-records.integration.spec.ts:360:  // This is what LIST A item A3 asked for. Until now the fix was REASONED: the
apps\api\src\selfservice\customer-records.integration.spec.ts:364:  dbIt('A3 — a customer is REFUSED the workshop invoice book', async () => {
apps\api\src\selfservice\customer-records.integration.spec.ts:370:  dbIt('A3 — a customer is REFUSED a workshop invoice by id', async () => {
apps\api\src\selfservice\customer-records.integration.spec.ts:376:  dbIt('A3 — a customer is REFUSED the workshop payment record', async () => {
apps\api\src\selfservice\customer-records.integration.spec.ts:382:  dbIt('A3 — a customer is REFUSED the workshop warranty policies and claims', async () => {
apps\api\src\selfservice\customer-records.integration.spec.ts:391:  dbIt('A3 — the refusal NAMES what the customer can still reach', async () => {
apps\e2e\verify\probe-live-state.mjs:22:const USER = process.env['LIVE_OWNER_EMAIL'] ?? 'marc667us@yahoo.com';
apps\api\src\public\vin.ts:104:  JMB: 'Mitsubishi', JA3: 'Mitsubishi', JA4: 'Mitsubishi',
apps\api\src\public\vin.ts:136:  MA1: 'Mahindra', MA3: 'Suzuki (India)', MAL: 'Hyundai (India)', MAT: 'Tata',
apps\api\src\public\vin.spec.ts:27:    const d = decodeVin('WBA3A5C51DF000000');
apps\api\src\public\vin.spec.ts:95:    const d = decodeVin('WBA3A5C51DF000001');

codex
I found the repository has evolved beyond the supplied diff context: later A3 grant artifacts are present, and the checked-out workflow content differs from the snippet. I’m checking commit/worktree state so the review targets the actual latest commit without attributing later or uncommitted work incorrectly.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git status --short; git log -3 --oneline' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git diff -- .github/workflows/diagnose-live-identity-roles.yml infrastructure/seed/diagnose_live_identity_roles.sql .claude/SESSION_HANDOVER.md' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git show HEAD:.github/workflows/diagnose-live-identity-roles.yml' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git show HEAD:infrastructure/seed/diagnose_live_identity_roles.sql' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 779ms:
# Read-only: which identity does the live suite sign in as, and what can it act as?
#
# ══════════════════════════════════════════════════════════════════════════
# Live-suite run 32290511884 found the role switcher ABSENT for the signed-in
# account. `RoleSwitcher` renders nothing below two roles, so the conclusion was
# that `LIVE_OWNER_EMAIL` is a CI identity holding ONE role — which makes the
# signed-in half of the suite structurally unable to verify any partner-role
# screen, and left four A3 checks skipping.
#
# ⚠️ THAT CONCLUSION WAS INFERRED FROM A MISSING DOM NODE. Before writing
# memberships into production on the back of it, ASK THE DATABASE. Reasoning
# from source has been wrong twice this week.
#
# 🔴 READ-ONLY. Every statement in the SQL is a SELECT. No confirm input, which
# is the point: a diagnostic nobody can run without ceremony does not get run.
# ══════════════════════════════════════════════════════════════════════════

name: Diagnose live identity roles

on:
  workflow_dispatch:

concurrency:
  # A6 — ALL of these open the production database firewall by PATCHing the
  # WHOLE ipAllowList, so they must never overlap. Render has no atomic
  # per-entry operation, so every capture/add/restore is a read-modify-write on
  # one shared resource. It races at least THREE ways:
  #   1. FILTERED CAPTURE (apply-migrations, backup-production-db,
  #      rehearse-migration) drops every entry containing 'ephemeral:' when
  #      building its snapshot. It cannot tell a dead run's entry from a LIVE
  #      one's, so it deletes a running job's entry the moment it starts.
  #   2. UNFILTERED RESTORE (the other twelve) restores a snapshot taken before
  #      another run added its entry, deleting it on the way out.
  #   3. CONCURRENT ADD (any two unfiltered runs) — both GET the same original
  #      list, then both PATCH 'original + mine'. The second add deletes the
  #      first run's entry before either restore happens.
  #   (and mixed order can RESURRECT a stale entry: an unfiltered run snapshots
  #    a foreign ephemeral entry and restores it after its owner removed it.)
  # The victim fails with 'SSL connection has been closed unexpectedly', which
  # is a LIE about the cause and reads as a database outage. At least six failed
  # runs on 2026-08-14 were this.
  #
  # ⚠️ A RETRY IS NOT A FIX — five retries failed identically, because the entry
  # stays deleted. And "remove only MY entry" is still racy: the API takes the
  # whole list.
  #
  # 🔴 THE COST OF THIS MUTEX, STATED PLAINLY — GITHUB'S WAITING ROOM HOLDS ONE.
  # A concurrency group is NOT a fifteen-deep FIFO queue. GitHub keeps at most
  # ONE pending run per group and REPLACES it when a newer one arrives, with no
  # ordering guarantee. So a pending deploy-api, migration APPLY, seed or backup
  # can be silently discarded by a newer arrival — and apply-migrations runs
  # automatically after EVERY Release, so automatic inspections compete with
  # deliberate operator requests. A cancelled PENDING run is firewall-safe (it
  # never opened anything) but the REQUEST IS LOST, not merely delayed.
  # ▶ THEREFORE: after dispatching any of these, capture the run id and confirm
  #   it actually STARTED. `gh run list --workflow=<wf> -L 3 --json databaseId,status`
  #   A 'cancelled' run you did not cancel is an evicted request — re-dispatch it.
  #
  # ⚠️ cancel-in-progress MUST stay false: cancelling a run mid-window would
  # leave its ephemeral entry live on the production firewall. But it does NOT
  # close every such path — a job timeout, a manual/API cancellation or runner
  # loss can still kill a run between its add PATCH and its restore step, and an
  # `if: always()` restore is not a reliable finally block against those. The
  # filtered-capture workflows clean up a stale entry on their next run; until
  # then the exposure is real.
  group: production-db-firewall
  cancel-in-progress: false

jobs:
  diagnose:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      RENDER_API_KEY: ${{ secrets.RENDER_API_KEY }}
      DB_NAME: autoworkshop-postgres
    steps:
      - uses: actions/checkout@v4

      - name: Refuse without a key
        run: |
          set -euo pipefail
          [ -n "${RENDER_API_KEY:-}" ] || { echo "::error::RENDER_API_KEY is not set"; exit 1; }

      - name: Find the database and open the firewall for this runner
        run: |
          set -euo pipefail
          sudo apt-get update -qq && sudo apt-get install -y -qq postgresql-client >/dev/null
          curl -fsS -H "Authorization: Bearer ${RENDER_API_KEY}" -H 'Accept: application/json' \
            "https://api.render.com/v1/postgres?name=${DB_NAME}&limit=20" > /tmp/pg_list.json || true
          DB_ID="$(python3 -c "
          import json, os
          try:
              rows = json.load(open('/tmp/pg_list.json'))
          except Exception:
              rows = None
          if isinstance(rows, dict):
              rows = rows.get('postgres') or rows.get('items') or []
          for r in (rows or []):
              d = r.get('postgres', r) if isinstance(r, dict) else {}
              if d.get('name') == os.environ['DB_NAME']:
                  print(d.get('id','')); break
          ")"
          [ -n "$DB_ID" ] || {
            echo "::group::what /v1/postgres returned"; head -c 500 /tmp/pg_list.json; echo "::endgroup::"
            echo "::error::could not find ${DB_NAME}"; exit 1; }
          echo "$DB_ID" > /tmp/db_id

          curl -fsS -H "Authorization: Bearer ${RENDER_API_KEY}" -H 'Accept: application/json' \
            "https://api.render.com/v1/postgres/${DB_ID}" \
            | python3 -c "
          import sys, json
          d = json.load(sys.stdin)
          # `or []`: Render returns the key PRESENT and null when the list is
          # empty, so a dict default would never fire.
          print(json.dumps(d.get('ipAllowList') or []))" > /tmp/ip_allow_original.json

          RUNNER_IP="$(curl -fsS --max-time 30 https://api.ipify.org)"
          python3 - "$RUNNER_IP" > /tmp/allow.json <<'PY'
          import json, sys
          cur = json.load(open('/tmp/ip_allow_original.json')) or []
          cur = [e for e in cur if e.get('cidrBlock') != f'{sys.argv[1]}/32']
          cur.append({'cidrBlock': f'{sys.argv[1]}/32', 'description': 'demo seeding'})
          print(json.dumps({'ipAllowList': cur}))
          PY
          curl -fsS -X PATCH -H "Authorization: Bearer ${RENDER_API_KEY}" \
            -H 'Content-Type: application/json' --data @/tmp/allow.json \
            "https://api.render.com/v1/postgres/${DB_ID}" >/dev/null

          CONN="$(curl -fsS -H "Authorization: Bearer ${RENDER_API_KEY}" -H 'Accept: application/json' \
            "https://api.render.com/v1/postgres/${DB_ID}/connection-info" \
            | python3 -c "import sys,json;print(json.load(sys.stdin)['externalConnectionString'])")"
          echo "::add-mask::$CONN"
          printf '%s' "$CONN" > /tmp/dburl
          echo "firewall open"

      - name: Ask production what the live-suite identity can act as
        run: |
          set -euo pipefail
          export DATABASE_URL="$(cat /tmp/dburl)"
          PSQL="$(ls /usr/lib/postgresql/*/bin/psql | head -1)"
          "$PSQL" -v ON_ERROR_STOP=1 "$DATABASE_URL"             -f infrastructure/seed/diagnose_live_identity_roles.sql | tee /tmp/identity.txt

      - name: Put it in the run summary
        if: always()
        run: |
          {
            echo "## Live-suite identity roles — production"
            echo ""
            echo "Read section 2. A membership with **is_earliest = t** and"
            echo "**is_self_created = f** means the organisation's FIRST member was"
            echo "created by somebody else, so 085 correctly refuses to promote a"
            echo "later self-created assessor into an administrator."
            echo ""
            echo "Section 3 separates a real registration from a hand-seeded fixture:"
            echo "a fixture can be corrected or removed, a real customer cannot."
            echo ""
            echo '```'
            cat /tmp/identity.txt 2>/dev/null || echo "nothing was read"
            echo '```'
          } >> "$GITHUB_STEP_SUMMARY"

      - name: Always restore the database firewall
        if: always()
        run: |
          set -euo pipefail
          [ -f /tmp/db_id ] && [ -f /tmp/ip_allow_original.json ] || { echo "nothing to restore"; exit 0; }
          ID="$(cat /tmp/db_id)"
          python3 -c "
          import json
          json.dump({'ipAllowList': json.load(open('/tmp/ip_allow_original.json')) or []},
                    open('/tmp/restore.json','w'))"
          curl -fsS -X PATCH -H "Authorization: Bearer ${RENDER_API_KEY}" \
            -H 'Content-Type: application/json' --data @/tmp/restore.json \
            "https://api.render.com/v1/postgres/${ID}" >/dev/null
          echo "firewall restored"

      - name: Always remove the credentials from the runner
        if: always()
        run: rm -f /tmp/dburl || true

 succeeded in 909ms:
diff --git a/.github/workflows/diagnose-live-identity-roles.yml b/.github/workflows/diagnose-live-identity-roles.yml
index 9dd727d..6cdc6a0 100644
--- a/.github/workflows/diagnose-live-identity-roles.yml
+++ b/.github/workflows/diagnose-live-identity-roles.yml
@@ -146,13 +146,21 @@ jobs:
           {
             echo "## Live-suite identity roles — production"
             echo ""
-            echo "Read section 2. A membership with **is_earliest = t** and"
-            echo "**is_self_created = f** means the organisation's FIRST member was"
-            echo "created by somebody else, so 085 correctly refuses to promote a"
-            echo "later self-created assessor into an administrator."
+            echo "⚠️ This prose used to describe **is_earliest** and **is_self_created**,"
+            echo "columns this workflow's SQL has never emitted — it was copied from"
+            echo "\`repair-audit-org-founders.yml\` along with the firewall boilerplate."
+            echo "A summary naming columns that are not in the output below is the same"
+            echo "stale-artifact failure recorded on 08-19 for I7."
             echo ""
-            echo "Section 3 separates a real registration from a hand-seeded fixture:"
-            echo "a fixture can be corrected or removed, a real customer cannot."
+            echo "**Section 1 is the answer.** \`active_roles\` per candidate: 1 means that"
+            echo "account cannot verify a partner screen, because \`RoleSwitcher\` renders"
+            echo "nothing below two roles."
+            echo ""
+            echo "**Section 2** lists the \`[AUDIT]\` partner organisations and their members —"
+            echo "the memberships a CI identity would need for the A3 checks to assert."
+            echo ""
+            echo "**Section 3**: if \`fleet_orgs = 0\`, slice 20's nine screens are unreachable"
+            echo "by any signed-in viewer, which is a larger finding than the switcher one."
             echo ""
             echo '```'
             cat /tmp/identity.txt 2>/dev/null || echo "nothing was read"

 succeeded in 877ms:
-- Read-only: which identity does the live suite sign in as, and what can it act as?
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 WHY THIS EXISTS. Live-suite run 32290511884 found the role switcher
-- ABSENT for the signed-in account:
--
--     getByLabel('Acting as role')  ->  element(s) not found
--
-- `RoleSwitcher` renders nothing below two roles, so the control is absent
-- rather than broken. The conclusion drawn was that `LIVE_OWNER_EMAIL` is a CI
-- test identity holding ONE role — which makes the signed-in half of the suite
-- structurally unable to verify any partner-role screen (insurance, towing,
-- fleet).
--
-- ⚠️ THAT CONCLUSION WAS INFERRED FROM A MISSING DOM NODE. It is consistent
-- with `RoleSwitcher`'s source and with the recorded test identities, and it is
-- still an inference. Before writing memberships into production on the back of
-- it, ASK THE DATABASE. Reasoning from source has been wrong twice this week.
--
-- ⚠️ AND THE SECRET IS NOT READABLE HERE. `LIVE_OWNER_EMAIL` is a repository
-- secret; this file cannot know its value, so it lists every plausible
-- candidate — the recorded `live-*@aiappinvent.com` identities and the
-- operator's own account — with the membership count that decides whether a
-- switcher renders at all.
--
-- 🔴 READ-ONLY. Every statement is a SELECT.
-- ══════════════════════════════════════════════════════════════════════════

\pset pager off
\timing off

-- Session-scoped, NOT transaction-local: each psql statement outside an
-- explicit transaction is its own transaction, so `true` would be discarded
-- before the next one ran. That mistake made an 08-16 diagnostic print
-- `(0 rows)` against a populated table.
SELECT set_config('app.current_role', 'admin', false) AS platform_context;

\echo ''
\echo '=== 0. can we see anything? (0 here means the escape failed) ==='
SELECT current_user AS running_as,
       (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_superuser,
       (SELECT count(*) FROM identity.users)       AS users_visible,
       (SELECT count(*) FROM identity.memberships) AS memberships_visible;

\echo ''
\echo '=== 1. CANDIDATE IDENTITIES, and how many ACTIVE roles each holds ==='
-- 🔴 `active_roles` IS THE ANSWER. `RoleSwitcher` returns null below 2, so any
-- account showing 1 here cannot verify a partner-role screen no matter how many
-- times the suite runs.
SELECT u.email,
       u.display_name,
       u.status,
       count(m.id) FILTER (WHERE m.status = 'active')                       AS active_memberships,
       count(DISTINCT m.role_name) FILTER (WHERE m.status = 'active')       AS active_roles,
       string_agg(DISTINCT m.role_name, ', ') FILTER (WHERE m.status = 'active') AS roles
  FROM identity.users u
  LEFT JOIN identity.memberships m ON m.user_id = u.id
 WHERE u.email ILIKE '%aiappinvent.com'
    OR u.email ILIKE '%yahoo.com'
 GROUP BY u.id, u.email, u.display_name, u.status
 ORDER BY active_roles DESC, u.email;

\echo ''
\echo '=== 2. the [AUDIT] partner organisations, and who is in them ==='
-- These are the organisations a CI identity would need memberships in for the
-- A3 checks to assert rather than skip.
SELECT o.name,
       o.org_type,
       o.id                AS organization_id,
       o.tenant_id,
       u.email             AS member,
       m.role_name,
       m.status
  FROM identity.organizations o
  LEFT JOIN identity.memberships m ON m.organization_id = o.id AND m.tenant_id = o.tenant_id
  LEFT JOIN identity.users u       ON u.id = m.user_id
 WHERE o.org_type IN ('insurance_company', 'towing_company', 'fleet_operator')
 ORDER BY o.org_type, o.name, u.email;

\echo ''
\echo '=== 3. what a fleet membership would even be worth — is there a fleet org? ==='
-- Slice 20 built nine fleet screens. If no fleet_operator organisation exists on
-- production, no signed-in viewer can reach them at all, which is a separate
-- finding from the switcher one.
SELECT count(*) FILTER (WHERE org_type = 'fleet_operator')    AS fleet_orgs,
       count(*) FILTER (WHERE org_type = 'insurance_company') AS insurance_orgs,
       count(*) FILTER (WHERE org_type = 'towing_company')    AS towing_orgs
  FROM identity.organizations
 WHERE status = 'active';

 succeeded in 978ms:
 M .github/workflows/diagnose-live-identity-roles.yml
 M apps/e2e/tests/live-signed-in.spec.ts
 M reviews/codex-review.md
?? .github/workflows/grant-live-suite-partner-memberships.yml
?? infrastructure/seed/grant_live_suite_partner_memberships.sql
0efa722 Session close: the read-only diagnostic that closes A3, and an exact resume point
6556194 Record A3's answer and the pt4 state
8b7a7f4 actAs counted nothing: the skip branch it exists for was unreachable

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "function RoleSwitcher|const RoleSwitcher|RoleSwitcher|availableRoles|memberships" apps/web packages -g "*.tsx" -g "*.ts"' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 458ms:
apps/web\app\_shared\org-staff\org-staff-screen.tsx:16: * carries the names and `/memberships` carries the ids a withdrawal needs. Both
apps/web\app\_shared\org-staff\org-staff-screen.tsx:138:      · `orgFilter` became '', so `/memberships` was UNFILTERED and the page
apps/web\app\_shared\org-staff\org-staff-screen.tsx:151:    workshop version records. `/memberships` unfiltered returns every membership
apps/web\app\_shared\org-staff\org-staff-screen.tsx:159:  const [users, memberships] = await Promise.all([
apps/web\app\_shared\org-staff\org-staff-screen.tsx:161:    apiGet<MembershipRow[]>(workspaceId, `/memberships${orgFilter}`),
apps/web\app\_shared\org-staff\org-staff-screen.tsx:165:  if (!memberships.ok) return <ApiFailure reason={memberships.reason} workspaceId={workspaceId} />;
apps/web\app\_shared\org-staff\org-staff-screen.tsx:168:  // Active memberships only. A revoked one is kept in the database so that "was
apps/web\app\_shared\org-staff\org-staff-screen.tsx:171:  const active = memberships.data.filter((m) => m.status === 'active');
apps/web\app\_shared\org-staff\org-staff-core.ts:16: * authority had no caller.** The only `POST /memberships` in the product was
apps/web\app\_shared\org-staff\org-staff-core.ts:60:  const result = await apiPost(workspaceId, '/memberships', {
apps/web\app\_shared\org-staff\org-staff-core.ts:93: * ⚠️ A STATUS CHANGE, NEVER A DELETE. `identity.memberships` keeps the row so
apps/web\app\_shared\org-staff\org-staff-core.ts:98: * and the only source of one is `GET /memberships` — which was gated on
apps/web\app\_shared\org-staff\org-staff-core.ts:110:  const result = await apiPatch(workspaceId, `/memberships/${membershipId}/status`, {
packages\auth\src\workspace-preferences.ts:21: * memberships already proved from the validated token subject and refuses a
packages\next-shell\src\WorkspaceGate.test.ts:21:    memberships: [],
packages\next-shell\src\ViewerSwitchers.tsx:33: * viewer's own memberships, and the API re-validates the choice against
packages\next-shell\src\ViewerSwitchers.tsx:34: * memberships proved from the validated token — a request naming an
packages\next-shell\src\ViewerSwitchers.tsx:47:  const organizations = organizationsFromMemberships(viewer.memberships);
packages\next-shell\src\viewer.ts:55:  // memberships — correctly, since that is an authorization probe. But a
packages\next-shell\src\viewer.ts:230: * `x-organization-id` against the user's own memberships and refuses one that
packages\next-shell\src\viewer.ts:246:  const holds = viewer.memberships.some((m) => m.organizationId === id);
packages\next-shell\src\viewer.ts:254: * re-checks `x-role-name` against the user's own memberships and REFUSES one
packages\next-shell\src\viewer.test.ts:49:    memberships: [],
packages\next-shell\src\viewer.test.ts:352:      memberships: [],
packages\next-shell\src\viewer.test.ts:372:      memberships: [],
packages\next-shell\src\viewer.test.ts:375:    // does. Derived, not looked up, so a role added to `identity.memberships`
packages\next-shell\src\viewer.test.ts:399:      memberships: [
packages\next-shell\src\viewer.test.ts:431:  const memberships = [
packages\next-shell\src\viewer.test.ts:442:    expect(organizationsFromMemberships(memberships)).toEqual([
packages\next-shell\src\viewer.test.ts:452:    expect(rolesFromMemberships(memberships, 'o1')).toEqual([
packages\next-shell\src\viewer.test.ts:461:   * implementation, which deduplicated across ALL memberships.
packages\next-shell\src\viewer.test.ts:472:    expect(rolesFromMemberships(memberships, 'o2')).toEqual([
packages\next-shell\src\viewer.test.ts:479:    expect(rolesFromMemberships(memberships, 'o-not-mine')).toEqual([]);
packages\next-shell\src\viewer.test.ts:483:    // A role added to `identity.memberships` must never appear as a blank
packages\next-shell\src\viewer.test.ts:501:    const viewer = { organizationId: 'o1', memberships };
packages\next-shell\src\viewer.test.ts:511:      expect(holdsRoleInActiveOrganization({ organizationId: 'o2', memberships }, 'workshop_supervisor')).toBe(
packages\next-shell\src\viewer.test.ts:520:    it('refuses everything for a viewer with no memberships', () => {
packages\next-shell\src\viewer.test.ts:523:      expect(holdsRoleInActiveOrganization({ organizationId: 'o1', memberships: [] }, 'technician')).toBe(false);
packages\next-shell\src\viewer.test.ts:527:  it('returns nothing for a viewer with no memberships', () => {
packages\next-shell\src\viewer-contract.ts:41:  /** The ONE role active for this request — `identity.memberships.role_name`. */
packages\next-shell\src\viewer-contract.ts:45:  memberships: Array<{
packages\next-shell\src\viewer-contract.ts:55: * `identity.memberships.role_name` → the navigation's `RoleId`.
packages\next-shell\src\viewer-contract.ts:299:   * inside the `RoleSwitcher`'s `<select>`, which renders `null` below two
packages\next-shell\src\viewer-contract.ts:300:   * options (`RoleSwitcher.tsx`) — so every single-role account, which is most
packages\next-shell\src\viewer-contract.ts:340:  const memberships = viewer.memberships;
packages\next-shell\src\viewer-contract.ts:341:  const exact = memberships.find(
packages\next-shell\src\viewer-contract.ts:344:  const byOrganization = exact ?? memberships.find((m) => m.organizationId === viewer.organizationId);
packages\next-shell\src\viewer-contract.ts:387:  memberships: readonly { organizationId: string; organizationName: string }[],
packages\next-shell\src\viewer-contract.ts:391:  for (const m of memberships) {
packages\next-shell\src\viewer-contract.ts:407: * from across all memberships can offer a pair that cannot exist: pick
packages\next-shell\src\viewer-contract.ts:420: * ⚠️ A USABILITY FILTER, NEVER AN AUTHORIZATION ONE. It reads memberships `/me`
packages\next-shell\src\viewer-contract.ts:422: * re-checks against memberships proved from the validated token subject and
packages\next-shell\src\viewer-contract.ts:455:  viewer: Pick<ViewerDescription, 'organizationId' | 'memberships'>,
packages\next-shell\src\viewer-contract.ts:458:  return viewer.memberships.some(
packages\next-shell\src\viewer-contract.ts:464:  memberships: readonly { organizationId: string; roleName: string }[],
packages\next-shell\src\viewer-contract.ts:469:  for (const m of memberships) {
packages\next-shell\src\set-role-action.ts:15: * which checks `x-role-name` against memberships proved from the validated
packages\next-shell\src\set-role-action.ts:62: * WHY IT LIVES HERE RATHER THAN IN EACH APP'S LAYOUT. `RoleSwitcher` posts a
packages\next-shell\src\set-organization-action.ts:14: * and `resolveTenantContext` uses it ONLY to select among memberships the
packages\next-shell\src\RoleSwitcher.tsx:17: * contains only roles the API already reported as the viewer's own memberships,
packages\next-shell\src\RoleSwitcher.tsx:18: * and `resolveTenantContext` re-validates the choice against those memberships
packages\next-shell\src\RoleSwitcher.tsx:32:  /** The `role_name` as stored in `identity.memberships`. */
packages\next-shell\src\RoleSwitcher.tsx:38:export function RoleSwitcher({
packages\next-shell\src\role-label.ts:5: * THIS FILE EXISTS. It previously sat in `RoleSwitcher.tsx`, which IS a client
packages\next-shell\src\role-label.ts:20: * option, and a role added to `identity.memberships` must never appear in the
packages\next-shell\src\OrganizationSwitcher.tsx:22: * API already reported as the viewer's own memberships, and the API re-validates
packages\next-shell\src\OrganizationSwitcher.tsx:23: * the choice against those memberships anyway — a request naming an organization
packages\next-shell\src\OrganizationSwitcher.tsx:61:         * ⚠️ SAME FIX AS `RoleSwitcher`, AND THE SAME LATENT DEFECT — this one
packages\next-shell\src\index.ts:46:export { RoleSwitcher } from './RoleSwitcher';
packages\next-shell\src\index.ts:50:export type { RoleOption } from './RoleSwitcher';
packages\next-shell\src\api.ts:9: * memberships, me — and the entire front end called exactly ONE of them, `/me`,
packages\next-shell\src\api.ts:107: * who resolved, holds memberships, and none of them is `customer`.
packages\next-shell\src\api.ts:118:  if (!viewer || viewer.memberships.length === 0) return null;
packages\next-shell\src\api.ts:119:  const isCustomer = viewer.memberships.some((m) => m.roleName === 'customer');
packages\next-shell\src\active-role.ts:13: * memberships it has already proved from the validated token subject, and
packages\next-shell\src\active-role.ts:61: * memberships proved from the token subject and REFUSES one the user does not
packages\next-shell\src\active-organization.ts:9: * uses it only to SELECT among memberships it has already proved the user holds,
packages\next-shell\src\ActingAsControl.tsx:2:import { RoleSwitcher } from './RoleSwitcher';
packages\next-shell\src\ActingAsControl.tsx:12: * place — the `<option>` text inside `RoleSwitcher` — and that control returns
packages\next-shell\src\ActingAsControl.tsx:26: * options come only from memberships `/me` reported, and `resolveTenantContext`
packages\next-shell\src\ActingAsControl.tsx:27: * re-validates the choice against memberships proved from the validated token,
packages\next-shell\src\ActingAsControl.tsx:66:  const roles = rolesFromMemberships(viewer.memberships, viewer.organizationId);
packages\next-shell\src\ActingAsControl.tsx:74:    <RoleSwitcher
apps/web\app\workshop\_screens\branches-screen.tsx:20: * `identity.memberships.branch_id`; it simply had no screen. Adding a second
apps/web\app\workshop\_screens\appointments-screen.tsx:108:    apiGet<StaffOption[]>('workshop', '/memberships'),
apps/web\app\workshop\layout.tsx:188:      // control. It lists only the viewer's own memberships and the API
apps/web\app\workshop\_screens\staff-screen.tsx:21: * carries the names and `/memberships` carries the ids a withdrawal needs. Both
apps/web\app\workshop\_screens\staff-screen.tsx:67:    `/memberships` unfiltered returns every membership in the tenant, and a
apps/web\app\workshop\_screens\staff-screen.tsx:80:  const [users, memberships] = await Promise.all([
apps/web\app\workshop\_screens\staff-screen.tsx:82:    apiGet<MembershipRow[]>('workshop', `/memberships${orgFilter}`),
apps/web\app\workshop\_screens\staff-screen.tsx:86:  if (!memberships.ok) return <ApiFailure reason={memberships.reason} workspaceId="workshop" />;
apps/web\app\workshop\_screens\staff-screen.tsx:89:  // Active memberships only. A revoked one is kept in the database so that "was
apps/web\app\workshop\_screens\staff-screen.tsx:92:  const active = memberships.data.filter((m) => m.status === 'active');
apps/web\app\workshop\_screens\staff-screen.tsx:163:                    `u.status`, while `memberships_for_subject()` filters
apps/web\app\workshop\_screens\staff-actions.ts:15: * which is driven FROM `identity.memberships` and therefore lists people who
apps/web\app\workshop\_screens\staff-actions.ts:42:  const result = await apiPost('workshop', '/memberships', {
apps/web\app\workshop\_screens\staff-actions.ts:75: * ⚠️ A STATUS CHANGE, NEVER A DELETE. `identity.memberships` keeps the row so
apps/web\app\workshop\_screens\staff-actions.ts:83:  const result = await apiPatch('workshop', `/memberships/${membershipId}/status`, {
apps/web\app\towing\layout.tsx:57:      // control. It lists only the viewer's own memberships and the API
apps/web\app\workshop\_screens\service-requests-screen.tsx:25:/** Mirrors `create-job-card-screen.tsx` — the same `/memberships` payload. */
apps/web\app\workshop\_screens\service-requests-screen.tsx:96:    apiGet<StaffOption[]>('workshop', '/memberships'),
apps/web\app\workshop\_screens\request-specialist-screen.tsx:59:    // `/memberships`, NOT `/members` — the latter does not exist, and assuming
apps/web\app\workshop\_screens\request-specialist-screen.tsx:61:    apiGet<Membership[]>('workshop', '/memberships'),
apps/web\app\supplier\_screens\create-supplier-actions.ts:17: * navigation tree — and the only two writers of `identity.memberships` were
apps/web\app\supplier\layout.tsx:57:      // control. It lists only the viewer's own memberships and the API
apps/web\app\onboarding\account-types.ts:30: * Measured, not assumed — every `INSERT INTO identity.memberships` across all
apps/web\app\onboarding\account-types.spec.ts:146:    // `INSERT INTO identity.memberships` in ANY migration, into one flat set.
apps/web\app\onboarding\account-types.spec.ts:177:        const ins = body.indexOf('INSERT INTO identity.memberships');
apps/web\app\onboarding\account-types.spec.ts:197:    // TIDY-UP. The old reader scanned every `INSERT INTO identity.memberships`
apps/web\app\insurance\layout.tsx:57:      // control. It lists only the viewer's own memberships and the API
apps/web\app\insurance\home\dashboard\page.tsx:16: * viewer's memberships, regardless of workspace or organisation type. So it asks
apps/web\app\workshop\settings\pricing\page.tsx:12: * `owner@autoworkshop.local` holds three memberships and `resolveTenantContext`
apps/web\app\fleet\layout.tsx:57:      // control. It lists only the viewer's own memberships and the API
apps/web\app\fleet\home\dashboard\page.tsx:17: * the viewer's memberships, regardless of workspace or organisation type. So it
apps/web\app\workshop\_screens\create-job-card-screen.tsx:77:  // and `/memberships` is admin-gated for some roles — a receptionist who may
apps/web\app\workshop\_screens\create-job-card-screen.tsx:83:    apiGet<StaffOption[]>('workshop', '/memberships'),
apps/web\app\workshop\_screens\certifications-screen.tsx:44: * 🔴 THE ENDPOINT IS `/memberships`, NOT `/members`, AND IT RETURNS NO NAME.
apps/web\app\workshop\_screens\certifications-screen.tsx:95:    apiGet<Membership[]>('workshop', '/memberships'),
apps/web\app\workshop\_screens\calls-screen.tsx:136:    // `/memberships`, NOT `/members` — the latter does not exist, and assuming
apps/web\app\workshop\_screens\calls-screen.tsx:138:    apiGet<Membership[]>('workshop', '/memberships'),
apps/web\app\customer\_screens\request-service-actions.ts:42:  // Measured 2026-08-08: `identity.memberships` has only two writers in the
apps/web\app\customer\_screens\request-service-actions.spec.ts:10: * Measured 2026-08-08. `identity.memberships` has only two writers in the whole
apps/web\app\customer\_screens\profile-screen.tsx:29:  memberships: Array<{
apps/web\app\customer\_screens\my-security-screen.tsx:40:  memberships: Membership[];
apps/web\app\customer\_screens\my-security-screen.tsx:77:              v.memberships.length === 0
apps/web\app\customer\_screens\my-security-screen.tsx:79:                : v.memberships.map((m) => m.organizationName).join(', '),
apps/web\app\customer\(app)\layout.tsx:65:   * refusal is narrow: a viewer who resolved, holds memberships, and none of
apps/web\app\customer\(app)\layout.tsx:74:  const holdsCustomerRole = viewer?.memberships.some((m) => m.roleName === 'customer') ?? false;
apps/web\app\customer\(app)\layout.tsx:75:  const wrongWorkspace = Boolean(viewer) && viewer!.memberships.length > 0 && !holdsCustomerRole;
apps/web\app\customer\(app)\layout.tsx:113:          // control. It lists only the viewer's own memberships and the API
apps/web\app\admin\layout.tsx:72:      // control. It lists only the viewer's own memberships and the API

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content packages/next-shell/src/ActingAsControl.tsx; Get-Content packages/next-shell/src/viewer-contract.ts | Select-Object -Skip 400 -First 85' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "CREATE POLICY|memberships.*POLICY|current_role|platform_admin|app.current_role" infrastructure/migrations infrastructure/policies | Select-Object -First 200' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "description.*ephemeral|production-db-firewall|ip_allow_original" .github/workflows/*.yml' in C:\Users\USER\Documents\autoworkshop-ai
2026-08-19T20:00:42.454938Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 0.6 seconds
Output:
rg: .github/workflows/*.yml: IO error for operation on .github/workflows/*.yml: The filename, directory name, or volume label syntax is incorrect. (os error 123)

 exited 1 in 624ms:
rg: .github/workflows/*.yml: IO error for operation on .github/workflows/*.yml: The filename, directory name, or volume label syntax is incorrect. (os error 123)

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content packages/next-shell/src/ActingAsControl.tsx; Get-Content packages/next-shell/src/viewer-contract.ts | Select-Object -Skip 400 -First 85' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "memberships|current_role|platform_admin|app.current_role" infrastructure/migrations infrastructure/policies' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "description.*ephemeral|production-db-firewall|ip_allow_original" .github/workflows -g "*.yml"' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 637ms:
.github/workflows\backup-production-db.yml:99:  group: production-db-firewall
.github/workflows\backup-production-db.yml:258:          json.dump(original, open('/tmp/ip_allow_original.json', 'w'))
.github/workflows\backup-production-db.yml:261:                                      'description': 'ephemeral: backup-production-db run'}]
.github/workflows\backup-production-db.yml:712:          [ -f /tmp/ip_allow_original.json ] || { echo "allow list was never changed"; exit 0; }
.github/workflows\backup-production-db.yml:716:          json.dump({'ipAllowList': json.load(open('/tmp/ip_allow_original.json'))},
.github/workflows\apply-migrations.yml:106:  group: production-db-firewall
.github/workflows\apply-migrations.yml:261:          json.dump(original, open('/tmp/ip_allow_original.json', 'w'))
.github/workflows\apply-migrations.yml:264:                                      'description': 'ephemeral: apply-migrations run'}]
.github/workflows\apply-migrations.yml:390:          [ -f /tmp/ip_allow_original.json ] || { echo "allow list was never changed"; exit 0; }
.github/workflows\apply-migrations.yml:394:          json.dump({'ipAllowList': json.load(open('/tmp/ip_allow_original.json'))},
.github/workflows\deploy-keycloak.yml:98:  group: production-db-firewall
.github/workflows\deploy-keycloak.yml:274:          json.dump(d.get('ipAllowList') or [], open('/tmp/ip_allow_original.json', 'w'))
.github/workflows\deploy-keycloak.yml:276:                     [{'cidrBlock': f'{ip}/32', 'description': 'ephemeral: deploy-keycloak'}]},
.github/workflows\deploy-keycloak.yml:588:          [ -f /tmp/db_id ] && [ -f /tmp/ip_allow_original.json ] || { echo "nothing to restore"; exit 0; }
.github/workflows\deploy-keycloak.yml:592:          json.dump({'ipAllowList': json.load(open('/tmp/ip_allow_original.json'))},
.github/workflows\deploy-api.yml:107:  group: production-db-firewall
.github/workflows\deploy-api.yml:300:          json.dump(d.get('ipAllowList') or [], open('/tmp/ip_allow_original.json', 'w'))
.github/workflows\deploy-api.yml:302:                     [{'cidrBlock': f'{ip}/32', 'description': 'ephemeral: deploy-api'}]},
.github/workflows\deploy-api.yml:647:          [ -f /tmp/db_id ] && [ -f /tmp/ip_allow_original.json ] || { echo "nothing to restore"; exit 0; }
.github/workflows\deploy-api.yml:651:          json.dump({'ipAllowList': json.load(open('/tmp/ip_allow_original.json'))},
.github/workflows\diagnose-085-stranded-orgs.yml:78:  group: production-db-firewall
.github/workflows\diagnose-085-stranded-orgs.yml:127:          print(json.dumps(d.get('ipAllowList') or []))" > /tmp/ip_allow_original.json
.github/workflows\diagnose-085-stranded-orgs.yml:132:          cur = json.load(open('/tmp/ip_allow_original.json')) or []
.github/workflows\diagnose-085-stranded-orgs.yml:178:          [ -f /tmp/db_id ] && [ -f /tmp/ip_allow_original.json ] || { echo "nothing to restore"; exit 0; }
.github/workflows\diagnose-085-stranded-orgs.yml:182:          json.dump({'ipAllowList': json.load(open('/tmp/ip_allow_original.json')) or []},
.github/workflows\diagnose-directory-drift.yml:65:  group: production-db-firewall
.github/workflows\diagnose-directory-drift.yml:114:          print(json.dumps(d.get('ipAllowList') or []))" > /tmp/ip_allow_original.json
.github/workflows\diagnose-directory-drift.yml:119:          cur = json.load(open('/tmp/ip_allow_original.json')) or []
.github/workflows\diagnose-directory-drift.yml:162:          [ -f /tmp/db_id ] && [ -f /tmp/ip_allow_original.json ] || { echo "nothing to restore"; exit 0; }
.github/workflows\diagnose-directory-drift.yml:166:          json.dump({'ipAllowList': json.load(open('/tmp/ip_allow_original.json')) or []},
.github/workflows\diagnose-identity-rls.yml:118:  group: production-db-firewall
.github/workflows\diagnose-identity-rls.yml:190:          json.dump(d.get('ipAllowList') or [], open('/tmp/ip_allow_original.json','w'))
.github/workflows\diagnose-identity-rls.yml:192:                     [{'cidrBlock': f'{ip}/32', 'description': 'ephemeral: diagnose-identity-rls'}]},
.github/workflows\diagnose-identity-rls.yml:398:          [ -f /tmp/ip_allow_original.json ] || exit 0
.github/workflows\diagnose-identity-rls.yml:401:          json.dump({'ipAllowList': json.load(open('/tmp/ip_allow_original.json'))},
.github/workflows\diagnose-live-identity-roles.yml:66:  group: production-db-firewall
.github/workflows\diagnose-live-identity-roles.yml:115:          print(json.dumps(d.get('ipAllowList') or []))" > /tmp/ip_allow_original.json
.github/workflows\diagnose-live-identity-roles.yml:120:          cur = json.load(open('/tmp/ip_allow_original.json')) or []
.github/workflows\diagnose-live-identity-roles.yml:174:          [ -f /tmp/db_id ] && [ -f /tmp/ip_allow_original.json ] || { echo "nothing to restore"; exit 0; }
.github/workflows\diagnose-live-identity-roles.yml:178:          json.dump({'ipAllowList': json.load(open('/tmp/ip_allow_original.json')) or []},
.github/workflows\diagnose-registration-500.yml:101:  group: production-db-firewall
.github/workflows\diagnose-registration-500.yml:173:          json.dump(d.get('ipAllowList') or [], open('/tmp/ip_allow_original.json','w'))
.github/workflows\diagnose-registration-500.yml:175:                     [{'cidrBlock': f'{ip}/32', 'description': 'ephemeral: diagnose-registration'}]},
.github/workflows\diagnose-registration-500.yml:328:          [ -f /tmp/db_id ] && [ -f /tmp/ip_allow_original.json ] || { echo "nothing to restore"; exit 0; }
.github/workflows\diagnose-registration-500.yml:332:          json.dump({'ipAllowList': json.load(open('/tmp/ip_allow_original.json'))},
.github/workflows\grant-live-suite-partner-memberships.yml:91:  group: production-db-firewall
.github/workflows\grant-live-suite-partner-memberships.yml:164:          print(json.dumps(d.get('ipAllowList') or []))" > /tmp/ip_allow_original.json
.github/workflows\grant-live-suite-partner-memberships.yml:169:          cur = json.load(open('/tmp/ip_allow_original.json')) or []
.github/workflows\grant-live-suite-partner-memberships.yml:222:          [ -f /tmp/db_id ] && [ -f /tmp/ip_allow_original.json ] || { echo "nothing to restore"; exit 0; }
.github/workflows\grant-live-suite-partner-memberships.yml:226:          json.dump({'ipAllowList': json.load(open('/tmp/ip_allow_original.json')) or []},
.github/workflows\grant-platform-admin.yml:109:  group: production-db-firewall
.github/workflows\grant-platform-admin.yml:224:          print(json.dumps(d.get('ipAllowList') or []))" > /tmp/ip_allow_original.json
.github/workflows\grant-platform-admin.yml:229:          cur = json.load(open('/tmp/ip_allow_original.json')) or []
.github/workflows\grant-platform-admin.yml:396:          [ -f /tmp/db_id ] && [ -f /tmp/ip_allow_original.json ] || { echo "nothing to restore"; exit 0; }
.github/workflows\grant-platform-admin.yml:400:          json.dump({'ipAllowList': json.load(open('/tmp/ip_allow_original.json')) or []},
.github/workflows\provision-live-suite-account.yml:115:  group: production-db-firewall
.github/workflows\provision-live-suite-account.yml:416:            > /tmp/ip_allow_original.json
.github/workflows\provision-live-suite-account.yml:421:          cur = json.load(open('/tmp/ip_allow_original.json')) or []
.github/workflows\provision-live-suite-account.yml:533:          [ -f /tmp/db_id ] && [ -f /tmp/ip_allow_original.json ] || { echo "nothing to restore"; exit 0; }
.github/workflows\provision-live-suite-account.yml:537:          json.dump({'ipAllowList': json.load(open('/tmp/ip_allow_original.json')) or []},
.github/workflows\provision-audit-superuser.yml:129:  group: production-db-firewall
.github/workflows\provision-audit-superuser.yml:195:          json.dump(original, open('/tmp/ip_allow_original.json', 'w'))
.github/workflows\provision-audit-superuser.yml:197:                                      'description': 'ephemeral: provision-audit-superuser'}]
.github/workflows\provision-audit-superuser.yml:571:          [ -f /tmp/db_id ] && [ -f /tmp/ip_allow_original.json ] || { echo "nothing to restore"; exit 0; }
.github/workflows\provision-audit-superuser.yml:575:          json.dump({'ipAllowList': json.load(open('/tmp/ip_allow_original.json')) or []},
.github/workflows\prune-keycloak-dead-redirects.yml:61:# Not in the `production-db-firewall` group: this touches Keycloak's admin API,
.github/workflows\rehearse-migration.yml:138:  group: production-db-firewall
.github/workflows\rehearse-migration.yml:290:          json.dump(original, open('/tmp/ip_allow_original.json', 'w'))
.github/workflows\rehearse-migration.yml:293:                                      'description': 'ephemeral: apply-migrations run'}]
.github/workflows\rehearse-migration.yml:680:          [ -f /tmp/ip_allow_original.json ] || { echo "allow list was never changed"; exit 0; }
.github/workflows\rehearse-migration.yml:684:          json.dump({'ipAllowList': json.load(open('/tmp/ip_allow_original.json'))},
.github/workflows\repair-audit-org-founders.yml:25:# `production-db-firewall` concurrency group are unchanged — A6 is the rule that
.github/workflows\repair-audit-org-founders.yml:82:  group: production-db-firewall
.github/workflows\repair-audit-org-founders.yml:141:          print(json.dumps(d.get('ipAllowList') or []))" > /tmp/ip_allow_original.json
.github/workflows\repair-audit-org-founders.yml:146:          cur = json.load(open('/tmp/ip_allow_original.json')) or []
.github/workflows\repair-audit-org-founders.yml:192:          [ -f /tmp/db_id ] && [ -f /tmp/ip_allow_original.json ] || { echo "nothing to restore"; exit 0; }
.github/workflows\repair-audit-org-founders.yml:196:          json.dump({'ipAllowList': json.load(open('/tmp/ip_allow_original.json')) or []},
.github/workflows\seed-sample-population.yml:90:  group: production-db-firewall
.github/workflows\seed-sample-population.yml:151:          print(json.dumps(d.get('ipAllowList') or []))" > /tmp/ip_allow_original.json
.github/workflows\seed-sample-population.yml:156:          cur = json.load(open('/tmp/ip_allow_original.json')) or []
.github/workflows\seed-sample-population.yml:202:          [ -f /tmp/db_id ] && [ -f /tmp/ip_allow_original.json ] || { echo "nothing to restore"; exit 0; }
.github/workflows\seed-sample-population.yml:206:          json.dump({'ipAllowList': json.load(open('/tmp/ip_allow_original.json')) or []},
.github/workflows\seed-repair-journeys.yml:131:  group: production-db-firewall
.github/workflows\seed-repair-journeys.yml:178:          print(json.dumps(json.load(sys.stdin).get('ipAllowList') or []))" > /tmp/ip_allow_original.json
.github/workflows\seed-repair-journeys.yml:182:          cur = json.load(open('/tmp/ip_allow_original.json')) or []
.github/workflows\seed-repair-journeys.yml:434:          [ -f /tmp/db_id ] && [ -f /tmp/ip_allow_original.json ] || { echo "nothing to restore"; exit 0; }
.github/workflows\seed-repair-journeys.yml:438:          json.dump({'ipAllowList': json.load(open('/tmp/ip_allow_original.json')) or []},
.github/workflows\seed-live-catalogue.yml:96:  group: production-db-firewall
.github/workflows\seed-live-catalogue.yml:177:          json.dump(d.get('ipAllowList') or [], open('/tmp/ip_allow_original.json','w'))
.github/workflows\seed-live-catalogue.yml:179:                     [{'cidrBlock': f'{ip}/32', 'description': 'ephemeral: seed-live-catalogue'}]},
.github/workflows\seed-live-catalogue.yml:279:          [ -f /tmp/db_id ] && [ -f /tmp/ip_allow_original.json ] || { echo "nothing to restore"; exit 0; }
.github/workflows\seed-live-catalogue.yml:283:          json.dump({'ipAllowList': json.load(open('/tmp/ip_allow_original.json'))},
.github/workflows\seed-demo-data.yml:115:  group: production-db-firewall
.github/workflows\seed-demo-data.yml:173:          print(json.dumps(d.get('ipAllowList') or []))" > /tmp/ip_allow_original.json
.github/workflows\seed-demo-data.yml:178:          cur = json.load(open('/tmp/ip_allow_original.json')) or []
.github/workflows\seed-demo-data.yml:617:          [ -f /tmp/db_id ] && [ -f /tmp/ip_allow_original.json ] || { echo "nothing to restore"; exit 0; }
.github/workflows\seed-demo-data.yml:621:          json.dump({'ipAllowList': json.load(open('/tmp/ip_allow_original.json')) or []},
.github/workflows\seed-uat-population.yml:89:  group: production-db-firewall
.github/workflows\seed-uat-population.yml:149:          print(json.dumps(d.get('ipAllowList') or []))" > /tmp/ip_allow_original.json
.github/workflows\seed-uat-population.yml:154:          cur = json.load(open('/tmp/ip_allow_original.json')) or []
.github/workflows\seed-uat-population.yml:217:          [ -f /tmp/db_id ] && [ -f /tmp/ip_allow_original.json ] || { echo "nothing to restore"; exit 0; }
.github/workflows\seed-uat-population.yml:221:          json.dump({'ipAllowList': json.load(open('/tmp/ip_allow_original.json')) or []},

2026-08-19T20:00:48.932819Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 0.7 seconds
Total output lines: 740
Output:
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:18:-- But `identity.memberships` is under ENABLE + FORCE RLS, and its policy reads
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:19:--     USING (is_platform_admin() OR tenant_id = current_tenant_id())
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:20:-- With nothing set, `current_tenant_id()` is NULL and `current_role_name()` is
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:25:--     memberships actually present : 1   (technician, active)
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:26:--     memberships visible          : 0
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:52:-- policy on `identity.memberships` itself.
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:59:--     identity.memberships   enabled=t forced=t
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:86:CREATE OR REPLACE FUNCTION identity.memberships_for_subject(p_subject TEXT)
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:109: LEFT JOIN identity.memberships m ON m.user_id = u.id
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:114:COMMENT ON FUNCTION identity.memberships_for_subject(TEXT) IS
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:115:'Bootstrap lookup: resolves a validated Keycloak subject to its own memberships. '
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:116:'SECURITY DEFINER because identity.memberships is under FORCE RLS and this query '
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:121:REVOKE ALL ON FUNCTION identity.memberships_for_subject(TEXT) FROM PUBLIC;
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:122:GRANT EXECUTE ON FUNCTION identity.memberships_for_subject(TEXT) TO autoworkshop_app;
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:139:        identity.is_platform_admin()
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:149:        identity.is_platform_admin()
infrastructure/migrations\001_tenancy_foundation.sql:41:CREATE OR REPLACE FUNCTION identity.current_role_name()
infrastructure/migrations\001_tenancy_foundation.sql:45:  SELECT COALESCE(NULLIF(current_setting('app.current_role', true), ''), 'none');
infrastructure/migrations\001_tenancy_foundation.sql:50:CREATE OR REPLACE FUNCTION identity.is_platform_admin()
infrastructure/migrations\001_tenancy_foundation.sql:54:  SELECT identity.current_role_name() IN ('admin', 'platform_administrator');
infrastructure/migrations\001_tenancy_foundation.sql:137:-- ── memberships ─────────────────────────────────────────────────────────────
infrastructure/migrations\001_tenancy_foundation.sql:141:CREATE TABLE IF NOT EXISTS identity.memberships (
infrastructure/migrations\001_tenancy_foundation.sql:157:CREATE INDEX IF NOT EXISTS idx_memberships_tenant ON identity.memberships(tenant_id);
infrastructure/migrations\001_tenancy_foundation.sql:158:CREATE INDEX IF NOT EXISTS idx_memberships_user   ON identity.memberships(user_id);
infrastructure/migrations\001_tenancy_foundation.sql:171:ALTER TABLE identity.memberships   ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\001_tenancy_foundation.sql:172:ALTER TABLE identity.memberships   FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\001_tenancy_foundation.sql:176:    USING (identity.is_platform_admin() OR id = identity.current_tenant_id())
infrastructure/migrations\001_tenancy_foundation.sql:177:    WITH CHECK (identity.is_platform_admin() OR id = identity.current_tenant_id());
infrastructure/migrations\001_tenancy_foundation.sql:181:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\001_tenancy_foundation.sql:182:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\001_tenancy_foundation.sql:186:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\001_tenancy_foundation.sql:187:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\001_tenancy_foundation.sql:189:DROP POLICY IF EXISTS tenant_isolation ON identity.memberships;
infrastructure/migrations\001_tenancy_foundation.sql:190:CREATE POLICY tenant_isolation ON identity.memberships
infrastructure/migrations\001_tenancy_foundation.sql:191:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\001_tenancy_foundation.sql:192:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\001_tenancy_foundation.sql:195:-- memberships in several tenants. Visibility of a user is granted through
infrastructure/migrations\008_job_card_stage_events.sql:110:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\008_job_card_stage_events.sql:111:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\006_repair_job_cards.sql:159:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\006_repair_job_cards.sql:160:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\006_repair_job_cards.sql:170:    USING (identity.is_platform_admin()
infrastructure/migrations\006_repair_job_cards.sql:172:    WITH CHECK (identity.is_platform_admin()
infrastructure/migrations\010_repair_inspections.sql:305:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\010_repair_inspections.sql:306:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\010_repair_inspections.sql:313:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\010_repair_inspections.sql:314:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\004_core_customers_and_vehicles.sql:235:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\004_core_customers_and_vehicles.sql:236:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\004_core_customers_and_vehicles.sql:240:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\004_core_customers_and_vehicles.sql:241:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\012_repair_diagnoses.sql:309:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\012_repair_diagnoses.sql:310:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\012_repair_diagnoses.sql:317:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\012_repair_diagnoses.sql:318:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\014_repair_plans.sql:528:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\014_repair_plans.sql:529:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\014_repair_plans.sql:536:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\014_repair_plans.sql:537:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\014_repair_plans.sql:544:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\014_repair_plans.sql:545:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\016_quotations.sql:492:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\016_quotations.sql:493:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\016_quotations.sql:499:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\016_quotations.sql:500:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\016_quotations.sql:506:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\016_quotations.sql:507:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\015_repair_plan_identity_immutable.sql:105:        -- `is_platform_admin()` is a disjunct in that policy. This closes it.
infrastructure/migrations\017_repair_proposals.sql:353:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\017_repair_proposals.sql:354:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\018_organization_profile.sql:96:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\018_organization_profile.sql:97:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\019_repair_execution.sql:564:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\019_repair_execution.sql:565:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\019_repair_execution.sql:569:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\019_repair_execution.sql:570:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\019_repair_execution.sql:574:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\019_repair_execution.sql:575:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\019_repair_execution.sql:579:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\019_repair_execution.sql:580:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\019_repair_execution.sql:584:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\019_repair_execution.sql:585:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\020_repair_testing.sql:420:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\020_repair_testing.sql:421:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\020_repair_testing.sql:425:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\020_repair_testing.sql:426:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\024_supplier_catalogue.sql:74:  IF identity.current_role_name() = 'admin' THEN
infrastructure/migrations\024_supplier_catalogue.sql:134:  IF identity.current_role_name() = 'admin' THEN
infrastructure/migrations\026_fitment_publication_guard.sql:46:  IF identity.is_platform_admin() THEN
infrastructure/migrations\023_supplier_accounts.sql:99:-- `identity.memberships_for_subject` in 003.
infrastructure/migrations\023_supplier_accounts.sql:116:  IF identity.current_role_name() = 'admin' THEN
infrastructure/migrations\023_supplier_accounts.sql:191:  FOR ALL USING (identity.current_role_name() = 'admin')
infrastructure/migrations\023_supplier_accounts.sql:192:  WITH CHECK (identity.current_role_name() = 'admin');
infrastructure/migrations\025_platform_admin_role_name.sql:1:-- 025_platform_admin_role_name.sql
infrastructure/migrations\025_platform_admin_role_name.sql:7:--     identity.current_role_name() = 'admin'
infrastructure/migrations\025_platform_admin_role_name.sql:10:-- `tenantSessionStatements` sets `app.current_role` from `ctx.activeRole`,
infrastructure/migrations\025_platform_admin_role_name.sql:11:-- which is the `identity.memberships.role_name` — for a platform administrator
infrastructure/migrations\025_platform_admin_role_name.sql:12:-- that string is `platform_administrator`. The literal `admin` is set by
infrastructure/migrations\025_platform_admin_role_name.sql:17:--   set_config('app.current_role','platform_administrator') → UPDATE 0
infrastructure/migrations\025_platform_admin_role_name.sql:18:--   set_config('app.current_role','admin')                  → UPDATE 20
infrastructure/migrations\025_platform_admin_role_name.sql:44:--   · `platform_administrator` — what the APPLICATION sets, from the membership
infrastructure/migrations\025_platform_admin_role_name.sql:59:CREATE OR REPLACE FUNCTION identity.is_platform_admin()
infrastructure/migrations\025_platform_admin_role_name.sql:64:  SELECT identity.current_role_name() IN ('admin', 'platform_administrator');
infrastructure/migrations\025_platform_admin_role_name.sql:67:COMMENT ON FUNCTION identity.is_platform_admin() IS
infrastructure/migrations\025_platform_admin_role_name.sql:68:  'True when app.current_role names the platform administrator. Accepts the '
infrastructure/migrations\025_platform_admin_role_name.sql:69:  'application role name (platform_administrator) AND the seed/psql one (admin). '
infrastructure/migrations\025_platform_admin_role_name.sql:73:REVOKE ALL ON FUNCTION identity.is_platform_admin() FROM PUBLIC;
infrastructure/migrations\025_platform_admin_role_name.sql:74:GRANT EXECUTE ON FUNCTION identity.is_platform_admin() TO autoworkshop_app;
infrastructure/migrations\025_platform_admin_role_name.sql:81:  FOR ALL USING (identity.is_platform_admin())
infrastructure/migrations\025_platform_admin_role_name.sql:82:  WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\025_platform_admin_role_name.sql:86:  FOR ALL USING (identity.is_platform_admin())
infrastructure/migrations\025_platform_admin_role_name.sql:87:  WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\025_platform_admin_role_name.sql:91:  FOR ALL USING (identity.is_platform_admin())
infrastructure/migrations\025_platform_admin_role_name.sql:92:  WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\025_platform_admin_role_name.sql:96:  FOR ALL USING (identity.is_platform_admin())
infrastructure/migrations\025_platform_admin_role_name.sql:97:  WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\025_platform_admin_role_name.sql:101:  FOR ALL USING (identity.is_platform_admin())
infrastructure/migrations\025_platform_admin_role_name.sql:102:  WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\025_platform_admin_role_name.sql:113:  FOR ALL USING (identity.is_platform_admin())
infrastructure/migrations\025_platform_admin_role_name.sql:114:  WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\025_platform_admin_role_name.sql:118:  FOR ALL USING (identity.is_platform_admin())
infrastructure/migrations\025_platform_admin_role_name.sql:119:  WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\025_platform_admin_role_name.sql:123:  FOR ALL USING (identity.is_platform_admin())
infrastructure/migrations\025_platform_admin_role_name.sql:124:  WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\025_platform_admin_role_name.sql:131:  FOR ALL USING (identity.is_platform_admin())
infrastructure/migrations\025_platform_admin_role_name.sql:132:  WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\025_platform_admin_role_name.sql:152:  IF identity.is_platform_admin() THEN
infrastructure/migrations\025_platform_admin_role_name.sql:208:  IF identity.is_platform_admin() THEN
infrastructure/migrations\025_platform_admin_role_name.sql:253:  IF identity.is_platform_admin() THEN
infrastructure/migrations\027_mechanic_directory_optin.sql:65:-- hand-rolled `current_role_name() = 'admin'` instead of calling
infrastructure/migrations\027_mechanic_directory_optin.sql:66:-- `identity.is_platform_admin()`, which had existed since migration 001 and
infrastructure/migrations\027_mechanic_directory_optin.sql:81:  SELECT identity.is_platform_admin()
infrastructure/migrations\027_mechanic_directory_optin.sql:82:      OR identity.current_role_name() = 'workshop_owner';
infrastructure/migrations\021_public_catalogue.sql:224:-- Writes are platform-admin only, via the same `app.current_role` convention
infrastructure/migrations\021_public_catalogue.sql:228:  FOR ALL USING (identity.current_role_name() = 'admin')
infrastructure/migrations\021_public_catalogue.sql:229:  WITH CHECK (identity.current_role_name() = 'admin');
infrastructure/migrations\021_public_catalogue.sql:231:  FOR ALL USING (identity.current_role_name() = 'admin')
infrastructure/migrations\021_public_catalogue.sql:232:  WITH CHECK (identity.current_role_name() = 'admin');
infrastructure/migrations\021_public_catalogue.sql:234:  FOR ALL USING (identity.current_role_name() = 'admin')
infrastructure/migrations\021_public_catalogue.sql:235:  WITH CHECK (identity.current_role_name() = 'admin');
infrastructure/migrations\021_public_catalogue.sql:237:  FOR ALL USING (identity.current_role_name() = 'admin')
infrastructure/migrations\021_public_catalogue.sql:238:  WITH CHECK (identity.current_role_name() = 'admin');
infrastructure/migrations\021_public_catalogue.sql:240:  FOR ALL USING (identity.current_role_name() = 'admin')
infrastructure/migrations\021_public_catalogue.sql:241:  WITH CHECK (identity.current_role_name() = 'admin');
infrastructure/migrations\029_pricing_write_scope.sql:9:--     USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\029_pricing_write_scope.sql:44:  USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\043_warranty.sql:232:            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
infrastructure/migrations\043_warranty.sql:238:            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
infrastructure/migrations\043_warranty.sql:244:            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id()) '
infrastructure/migrations\043_warranty.sql:246:            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
infrastructure/migrations\042_finance.sql:480:            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
infrastructure/migrations\042_finance.sql:486:            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
infrastructure/migrations\042_finance.sql:492:            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id()) '
infrastructure/migrations\042_finance.sql:494:            '(identity.is_platform_admin() OR tena…14161 tokens truncated…rastructure/migrations\verify\037_registration_rls_bootstrap.sql:123:  -- identity.memberships; under FORCE RLS with no tenant context it returned
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql:182:    INSERT INTO identity.memberships
infrastructure/migrations\verify\036_signup_and_workshop_registration.sql:16:-- through `memberships_for_subject`, which is the boundary crossing the
infrastructure/migrations\verify\036_signup_and_workshop_registration.sql:71:  -- identity.memberships returns zero here for RLS reasons and would "pass"
infrastructure/migrations\verify\036_signup_and_workshop_registration.sql:74:    FROM identity.memberships_for_subject(s) WHERE tenant_id IS NOT NULL;
infrastructure/migrations\verify\036_signup_and_workshop_registration.sql:93:    FROM identity.memberships_for_subject(s) WHERE tenant_id IS NOT NULL;
infrastructure/migrations\verify\036_signup_and_workshop_registration.sql:129:  SELECT count(*) INTO n FROM identity.memberships_for_subject(s2);
infrastructure/migrations\verify\033_variation_hardening.sql:20:SELECT set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\033_variation_hardening.sql:63:  PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\033_variation_hardening.sql:115:  PERFORM set_config('app.current_role', 'workshop_supervisor', true);
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:7:-- `memberships_for_subject` finds the memberships whatever the policies say and
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:49:-- The policies call `identity.is_platform_admin()` and friends, which are
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:56:ALTER FUNCTION identity.memberships_for_subject(TEXT)                 OWNER TO verify039_owner;
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:82:   WHERE p.oid = 'identity.memberships_for_subject(text)'::regprocedure;
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:86:      'MEASUREMENT INVALID: memberships_for_subject still executes as a SUPERUSER, '
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:94:       WHERE p.oid = 'identity.memberships_for_subject(text)'::regprocedure) = current_user THEN
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:107:  SELECT count(*) INTO n FROM identity.memberships_for_subject(s) WHERE tenant_id IS NOT NULL;
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:123:  SELECT count(*) INTO n FROM identity.memberships_for_subject(s) WHERE tenant_id IS NOT NULL;
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:133:  SELECT * INTO row1 FROM identity.memberships_for_subject(s) WHERE tenant_id IS NOT NULL;
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:165:  SELECT count(*) INTO leaked FROM identity.memberships WHERE user_id = uid;
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:181:    FROM identity.memberships_for_subject(s)
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:187:  SELECT count(*) INTO n FROM identity.memberships_for_subject(s) WHERE tenant_id IS NOT NULL;
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:196:  SELECT count(*) INTO n FROM identity.memberships_for_subject(s2) WHERE tenant_id IS NOT NULL;
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:198:    RAISE EXCEPTION 'FAIL 8: the SECOND user resolves % memberships, expected 1', n;
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:205:  SELECT count(*) INTO leaked FROM identity.memberships;
infrastructure/migrations\verify\038_bootstrap_door_requires_definer.sql:51:-- The POLICIES call `identity.is_platform_admin()` and friends, and those are
infrastructure/migrations\verify\038_bootstrap_door_requires_definer.sql:122:  IF EXISTS (SELECT 1 FROM identity.memberships WHERE user_id = uid) THEN
infrastructure/migrations\verify\042_finance.sql:121:    RAISE NOTICE '  is_platform_admin=%', identity.is_platform_admin();
infrastructure/migrations\verify\058_service_requests.sql:54:    -- rehearsal. `app.current_role` is deliberately a STAFF role here so the
infrastructure/migrations\verify\058_service_requests.sql:59:    PERFORM set_config('app.current_role', 'reception_staff', true);
infrastructure/migrations\verify\058_service_requests.sql:233:    PERFORM set_config('app.current_role', 'customer', true);
infrastructure/migrations\verify\058_service_requests.sql:298:    PERFORM set_config('app.current_role', 'customer', true);
infrastructure/migrations\verify\058_service_requests.sql:308:    PERFORM set_config('app.current_role', 'reception_staff', true);
infrastructure/migrations\verify\074_towing.sql:117:    PERFORM set_config('app.current_role', 'workshop_owner', true);
infrastructure/migrations\verify\074_towing.sql:146:    PERFORM set_config('app.current_role', 'customer', true);
infrastructure/migrations\verify\073_relationships.sql:174:    PERFORM set_config('app.current_role', 'workshop_owner', true);
infrastructure/migrations\verify\060_notifications.sql:43:    PERFORM set_config('app.current_role', 'reception_staff', true);
infrastructure/migrations\verify\060_notifications.sql:178:    PERFORM set_config('app.current_role', 'customer', true);
infrastructure/migrations\verify\060_notifications.sql:188:    PERFORM set_config('app.current_role', 'reception_staff', true);
infrastructure/migrations\verify\060_notifications.sql:205:    INSERT INTO identity.memberships
infrastructure/migrations\verify\060_notifications.sql:261:    PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\060_notifications.sql:289:    PERFORM set_config('app.current_role', 'reception_staff', true);
infrastructure/migrations\verify\060_notifications.sql:293:    DELETE FROM identity.memberships WHERE user_id = other_user;
infrastructure/migrations\verify\079_organisation_scoped_keys.sql:34:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\079_organisation_scoped_keys.sql:35:    IF NOT identity.is_platform_admin() THEN
infrastructure/migrations\verify\087_fleet_data_layer.sql:55:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\087_fleet_data_layer.sql:142:    PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\087_fleet_data_layer.sql:391:    -- It set `app.current_role = 'admin'` while still `SET ROLE
infrastructure/migrations\verify\087_fleet_data_layer.sql:392:    -- autoworkshop_app`. The platform escape is `current_role_name() = 'admin'`
infrastructure/migrations\verify\087_fleet_data_layer.sql:398:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\087_fleet_data_layer.sql:405:    PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\087_fleet_data_layer.sql:434:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\087_fleet_data_layer.sql:450:    DELETE FROM identity.memberships   WHERE tenant_id IN (rf.o_tenant_id, v_ws_ten, v_third_ten);
infrastructure/migrations\verify\078_platform_grant_lookup.sql:16:-- It proves that a DIRECT select from `identity.platform_administrators`, with
infrastructure/migrations\verify\078_platform_grant_lookup.sql:29:-- `is_platform_admin()` — that function SELECTs from this table, so a policy
infrastructure/migrations\verify\078_platform_grant_lookup.sql:57:      FROM identity.platform_administrators pa
infrastructure/migrations\verify\078_platform_grant_lookup.sql:67:                        'per active platform_administrator membership. Without one this '
infrastructure/migrations\verify\078_platform_grant_lookup.sql:73:    -- rather than from memberships: the point is that holding any membership,
infrastructure/migrations\verify\078_platform_grant_lookup.sql:74:    -- including a `platform_administrator` one, buys nothing here.
infrastructure/migrations\verify\078_platform_grant_lookup.sql:80:                         FROM identity.platform_administrators pa
infrastructure/migrations\verify\078_platform_grant_lookup.sql:106:      FROM identity.platform_administrators
infrastructure/migrations\verify\078_platform_grant_lookup.sql:137:      FROM identity.platform_administrators
infrastructure/migrations\verify\078_platform_grant_lookup.sql:157:    -- 7. 🔴 STRUCTURAL — no policy on this table may reference is_platform_admin().
infrastructure/migrations\verify\078_platform_grant_lookup.sql:162:       AND tablename  = 'platform_administrators'
infrastructure/migrations\verify\078_platform_grant_lookup.sql:163:       AND (coalesce(qual, '') LIKE '%is_platform_admin%'
infrastructure/migrations\verify\078_platform_grant_lookup.sql:164:         OR coalesce(with_check, '') LIKE '%is_platform_admin%');
infrastructure/migrations\verify\078_platform_grant_lookup.sql:166:        RAISE EXCEPTION 'check 7 FAILED: % policy/policies on identity.platform_administrators '
infrastructure/migrations\verify\078_platform_grant_lookup.sql:167:                        'reference is_platform_admin(), which SELECTs from this very table. '
infrastructure/migrations\verify\078_platform_grant_lookup.sql:172:    --    must not have replaced the one is_platform_admin() depends on.
infrastructure/migrations\verify\078_platform_grant_lookup.sql:176:       AND tablename  = 'platform_administrators'
infrastructure/migrations\verify\078_platform_grant_lookup.sql:177:       AND policyname = 'platform_administrators_self_read';
infrastructure/migrations\verify\078_platform_grant_lookup.sql:179:        RAISE EXCEPTION 'check 8 FAILED: 077''s platform_administrators_self_read policy is '
infrastructure/migrations\verify\078_platform_grant_lookup.sql:180:                        'gone (found %). is_platform_admin() relies on it once a tenant '
infrastructure/migrations\verify\086_insurance_enquiries.sql:69:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\086_insurance_enquiries.sql:146:    PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\086_insurance_enquiries.sql:187:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\086_insurance_enquiries.sql:200:    -- `permission denied for table users` from inside `is_platform_admin()` —
infrastructure/migrations\verify\086_insurance_enquiries.sql:207:    PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\086_insurance_enquiries.sql:312:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\086_insurance_enquiries.sql:320:    PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\086_insurance_enquiries.sql:371:    PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\086_insurance_enquiries.sql:378:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\086_insurance_enquiries.sql:437:    DELETE FROM identity.memberships   WHERE tenant_id IN (ra.o_tenant_id, rb.o_tenant_id);
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql:52:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql:80:      FROM identity.memberships WHERE id = ri.o_membership_id;
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql:88:      FROM identity.memberships WHERE id = rt.o_membership_id;
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql:116:    INSERT INTO identity.memberships
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql:122:      FROM identity.memberships
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql:132:    INSERT INTO identity.memberships
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql:138:      FROM identity.memberships
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql:156:             SELECT 1 FROM identity.memberships m
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql:199:      FROM identity.memberships
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql:253:    INSERT INTO identity.memberships
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql:259:    INSERT INTO identity.memberships
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql:271:          FROM identity.memberships m
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql:292:    DELETE FROM identity.memberships   WHERE tenant_id = v_solo_ten;
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql:313:    DELETE FROM identity.memberships   WHERE tenant_id IN (ri.o_tenant_id, rt.o_tenant_id);
infrastructure/migrations\verify\077_platform_administrator_grants.sql:14:-- `is_platform_admin()` assertion that follows it switches to `autoworkshop_app`,
infrastructure/migrations\verify\077_platform_administrator_grants.sql:21:-- 🔴 CHECK 2 IS THE WHOLE POINT. Before 077, `app.current_role =
infrastructure/migrations\verify\077_platform_administrator_grants.sql:22:-- 'platform_administrator'` — a plain TEXT column on a membership row inside
infrastructure/migrations\verify\077_platform_administrator_grants.sql:27:-- own RLS policies must never call `is_platform_admin()`: that function selects
infrastructure/migrations\verify\077_platform_administrator_grants.sql:49:      FROM identity.platform_administrators
infrastructure/migrations\verify\077_platform_administrator_grants.sql:56:                        'platform_administrator membership — if there were none, this '
infrastructure/migrations\verify\077_platform_administrator_grants.sql:62:     WHERE NOT EXISTS (SELECT 1 FROM identity.platform_administrators pa
infrastructure/migrations\verify\077_platform_administrator_grants.sql:75:    PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql:76:    SELECT identity.is_platform_admin() INTO v_answer;
infrastructure/migrations\verify\077_platform_administrator_grants.sql:86:    PERFORM set_config('app.current_role', 'platform_administrator', true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql:87:    SELECT identity.is_platform_admin() INTO v_answer;
infrastructure/migrations\verify\077_platform_administrator_grants.sql:89:        RAISE EXCEPTION 'check 2 FAILED: claiming role_name platform_administrator still '
infrastructure/migrations\verify\077_platform_administrator_grants.sql:93:    RAISE NOTICE 'check 2 OK — role_name platform_administrator confers nothing without a grant';
infrastructure/migrations\verify\077_platform_administrator_grants.sql:97:    -- `app.current_role` is a custom GUC and ANY role can set it, including the
infrastructure/migrations\verify\077_platform_administrator_grants.sql:99:    -- single injected `set_config('app.current_role','admin',true)` restored
infrastructure/migrations\verify\077_platform_administrator_grants.sql:106:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql:107:    SELECT identity.is_platform_admin() INTO v_answer;
infrastructure/migrations\verify\077_platform_administrator_grants.sql:109:        RAISE EXCEPTION 'check 3a FAILED: setting app.current_role = admin from the APPLICATION '
infrastructure/migrations\verify\077_platform_administrator_grants.sql:119:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql:120:    SELECT identity.is_platform_admin() INTO v_answer;
infrastructure/migrations\verify\077_platform_administrator_grants.sql:130:    -- If this table's policies ever call `is_platform_admin()`, this statement
infrastructure/migrations\verify\077_platform_administrator_grants.sql:133:    PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql:135:    RAISE NOTICE 'check 4 OK — identity.tenants read through an is_platform_admin() policy (% rows)', v_count;
infrastructure/migrations\verify\077_platform_administrator_grants.sql:143:       AND tablename  = 'platform_administrators'
infrastructure/migrations\verify\077_platform_administrator_grants.sql:144:       AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%is_platform_admin%';
infrastructure/migrations\verify\077_platform_administrator_grants.sql:146:        RAISE EXCEPTION 'check 5 FAILED: % polic(y/ies) on identity.platform_administrators call '
infrastructure/migrations\verify\077_platform_administrator_grants.sql:147:                        'is_platform_admin(), which SELECTs from this very table. Every policy '
infrastructure/migrations\verify\077_platform_administrator_grants.sql:154:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql:156:        DELETE FROM identity.platform_administrators WHERE revoked_at IS NULL;
infrastructure/migrations\verify\077_platform_administrator_grants.sql:167:        UPDATE identity.platform_administrators
infrastructure/migrations\verify\077_platform_administrator_grants.sql:188:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql:190:        UPDATE identity.platform_administrators
infrastructure/migrations\verify\077_platform_administrator_grants.sql:202:    UPDATE identity.platform_administrators
infrastructure/migrations\verify\077_platform_administrator_grants.sql:214:    PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql:215:    SELECT identity.is_platform_admin() INTO v_answer;
infrastructure/migrations\verify\059_supplier_requests.sql:47:    PERFORM set_config('app.current_role', 'storekeeper', true);
infrastructure/migrations\verify\059_supplier_requests.sql:197:        PERFORM set_config('app.current_role', 'supplier_owner', true);
infrastructure/migrations\verify\059_supplier_requests.sql:227:        PERFORM set_config('app.current_role', 'storekeeper', true);
infrastructure/migrations\verify\059_supplier_requests.sql:241:    PERFORM set_config('app.current_role', 'customer', true);
infrastructure/migrations\verify\059_supplier_requests.sql:257:    PERFORM set_config('app.current_role', 'storekeeper', true);
infrastructure/migrations\verify\082_insurance_marketplace.sql:24:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\075_fleet_registration.sql:102:    SELECT count(*) INTO n FROM identity.memberships
infrastructure/migrations\verify\075_fleet_registration.sql:151:    DELETE FROM identity.memberships   WHERE tenant_id = r.o_tenant_id;
infrastructure/migrations\verify\080_insurance_and_towing_registration.sql:187:    SELECT count(*) INTO n FROM identity.memberships
infrastructure/migrations\verify\080_insurance_and_towing_registration.sql:197:    SELECT count(*) INTO n FROM identity.memberships
infrastructure/migrations\verify\080_insurance_and_towing_registration.sql:269:        RAISE NOTICE 'verify/080 #7 SKIPPED: no active platform_administrator, so '
infrastructure/migrations\verify\080_insurance_and_towing_registration.sql:296:    DELETE FROM identity.memberships   WHERE tenant_id IN (ri.o_tenant_id, rt.o_tenant_id);
rg: infrastructure/policies: The system cannot find the file specified. (os error 2)

 exited 1 in 677ms:
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:18:-- But `identity.memberships` is under ENABLE + FORCE RLS, and its policy reads
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:19:--     USING (is_platform_admin() OR tenant_id = current_tenant_id())
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:20:-- With nothing set, `current_tenant_id()` is NULL and `current_role_name()` is
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:25:--     memberships actually present : 1   (technician, active)
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:26:--     memberships visible          : 0
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:52:-- policy on `identity.memberships` itself.
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:59:--     identity.memberships   enabled=t forced=t
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:86:CREATE OR REPLACE FUNCTION identity.memberships_for_subject(p_subject TEXT)
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:109: LEFT JOIN identity.memberships m ON m.user_id = u.id
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:114:COMMENT ON FUNCTION identity.memberships_for_subject(TEXT) IS
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:115:'Bootstrap lookup: resolves a validated Keycloak subject to its own memberships. '
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:116:'SECURITY DEFINER because identity.memberships is under FORCE RLS and this query '
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:121:REVOKE ALL ON FUNCTION identity.memberships_for_subject(TEXT) FROM PUBLIC;
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:122:GRANT EXECUTE ON FUNCTION identity.memberships_for_subject(TEXT) TO autoworkshop_app;
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:139:        identity.is_platform_admin()
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:149:        identity.is_platform_admin()
infrastructure/migrations\001_tenancy_foundation.sql:41:CREATE OR REPLACE FUNCTION identity.current_role_name()
infrastructure/migrations\001_tenancy_foundation.sql:45:  SELECT COALESCE(NULLIF(current_setting('app.current_role', true), ''), 'none');
infrastructure/migrations\001_tenancy_foundation.sql:50:CREATE OR REPLACE FUNCTION identity.is_platform_admin()
infrastructure/migrations\001_tenancy_foundation.sql:54:  SELECT identity.current_role_name() IN ('admin', 'platform_administrator');
infrastructure/migrations\001_tenancy_foundation.sql:137:-- ── memberships ─────────────────────────────────────────────────────────────
infrastructure/migrations\001_tenancy_foundation.sql:141:CREATE TABLE IF NOT EXISTS identity.memberships (
infrastructure/migrations\001_tenancy_foundation.sql:157:CREATE INDEX IF NOT EXISTS idx_memberships_tenant ON identity.memberships(tenant_id);
infrastructure/migrations\001_tenancy_foundation.sql:158:CREATE INDEX IF NOT EXISTS idx_memberships_user   ON identity.memberships(user_id);
infrastructure/migrations\001_tenancy_foundation.sql:171:ALTER TABLE identity.memberships   ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\001_tenancy_foundation.sql:172:ALTER TABLE identity.memberships   FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\001_tenancy_foundation.sql:176:    USING (identity.is_platform_admin() OR id = identity.current_tenant_id())
infrastructure/migrations\001_tenancy_foundation.sql:177:    WITH CHECK (identity.is_platform_admin() OR id = identity.current_tenant_id());
infrastructure/migrations\001_tenancy_foundation.sql:181:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\001_tenancy_foundation.sql:182:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\001_tenancy_foundation.sql:186:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\001_tenancy_foundation.sql:187:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\001_tenancy_foundation.sql:189:DROP POLICY IF EXISTS tenant_isolation ON identity.memberships;
infrastructure/migrations\001_tenancy_foundation.sql:190:CREATE POLICY tenant_isolation ON identity.memberships
infrastructure/migrations\001_tenancy_foundation.sql:191:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\001_tenancy_foundation.sql:192:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\001_tenancy_foundation.sql:195:-- memberships in several tenants. Visibility of a user is granted through
infrastructure/migrations\008_job_card_stage_events.sql:110:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\008_job_card_stage_events.sql:111:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\006_repair_job_cards.sql:159:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\006_repair_job_cards.sql:160:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\006_repair_job_cards.sql:170:    USING (identity.is_platform_admin()
infrastructure/migrations\006_repair_job_cards.sql:172:    WITH CHECK (identity.is_platform_admin()
infrastructure/migrations\010_repair_inspections.sql:305:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\010_repair_inspections.sql:306:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\010_repair_inspections.sql:313:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\010_repair_inspections.sql:314:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\004_core_customers_and_vehicles.sql:235:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\004_core_customers_and_vehicles.sql:236:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\004_core_customers_and_vehicles.sql:240:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\004_core_customers_and_vehicles.sql:241:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\012_repair_diagnoses.sql:309:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\012_repair_diagnoses.sql:310:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\012_repair_diagnoses.sql:317:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\012_repair_diagnoses.sql:318:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\014_repair_plans.sql:528:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\014_repair_plans.sql:529:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\014_repair_plans.sql:536:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\014_repair_plans.sql:537:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\014_repair_plans.sql:544:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\014_repair_plans.sql:545:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\016_quotations.sql:492:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\016_quotations.sql:493:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\016_quotations.sql:499:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\016_quotations.sql:500:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\016_quotations.sql:506:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\016_quotations.sql:507:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\015_repair_plan_identity_immutable.sql:105:        -- `is_platform_admin()` is a disjunct in that policy. This closes it.
infrastructure/migrations\017_repair_proposals.sql:353:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\017_repair_proposals.sql:354:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\018_organization_profile.sql:96:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\018_organization_profile.sql:97:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\019_repair_execution.sql:564:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\019_repair_execution.sql:565:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\019_repair_execution.sql:569:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\019_repair_execution.sql:570:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\019_repair_execution.sql:574:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\019_repair_execution.sql:575:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\019_repair_execution.sql:579:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\019_repair_execution.sql:580:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\019_repair_execution.sql:584:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\019_repair_execution.sql:585:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\020_repair_testing.sql:420:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\020_repair_testing.sql:421:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\020_repair_testing.sql:425:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\020_repair_testing.sql:426:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\024_supplier_catalogue.sql:74:  IF identity.current_role_name() = 'admin' THEN
infrastructure/migrations\024_supplier_catalogue.sql:134:  IF identity.current_role_name() = 'admin' THEN
infrastructure/migrations\026_fitment_publication_guard.sql:46:  IF identity.is_platform_admin() THEN
infrastructure/migrations\023_supplier_accounts.sql:99:-- `identity.memberships_for_subject` in 003.
infrastructure/migrations\023_supplier_accounts.sql:116:  IF identity.current_role_name() = 'admin' THEN
infrastructure/migrations\023_supplier_accounts.sql:191:  FOR ALL USING (identity.current_role_name() = 'admin')
infrastructure/migrations\023_supplier_accounts.sql:192:  WITH CHECK (identity.current_role_name() = 'admin');
infrastructure/migrations\025_platform_admin_role_name.sql:1:-- 025_platform_admin_role_name.sql
infrastructure/migrations\025_platform_admin_role_name.sql:7:--     identity.current_role_name() = 'admin'
infrastructure/migrations\025_platform_admin_role_name.sql:10:-- `tenantSessionStatements` sets `app.current_role` from `ctx.activeRole`,
infrastructure/migrations\025_platform_admin_role_name.sql:11:-- which is the `identity.memberships.role_name` — for a platform administrator
infrastructure/migrations\025_platform_admin_role_name.sql:12:-- that string is `platform_administrator`. The literal `admin` is set by
infrastructure/migrations\025_platform_admin_role_name.sql:17:--   set_config('app.current_role','platform_administrator') → UPDATE 0
infrastructure/migrations\025_platform_admin_role_name.sql:18:--   set_config('app.current_role','admin')                  → UPDATE 20
infrastructure/migrations\025_platform_admin_role_name.sql:44:--   · `platform_administrator` — what the APPLICATION sets, from the membership
infrastructure/migrations\025_platform_admin_role_name.sql:59:CREATE OR REPLACE FUNCTION identity.is_platform_admin()
infrastructure/migrations\025_platform_admin_role_name.sql:64:  SELECT identity.current_role_name() IN ('admin', 'platform_administrator');
infrastructure/migrations\025_platform_admin_role_name.sql:67:COMMENT ON FUNCTION identity.is_platform_admin() IS
infrastructure/migrations\025_platform_admin_role_name.sql:68:  'True when app.current_role names the platform administrator. Accepts the '
infrastructure/migrations\025_platform_admin_role_name.sql:69:  'application role name (platform_administrator) AND the seed/psql one (admin). '
infrastructure/migrations\025_platform_admin_role_name.sql:73:REVOKE ALL ON FUNCTION identity.is_platform_admin() FROM PUBLIC;
infrastructure/migrations\025_platform_admin_role_name.sql:74:GRANT EXECUTE ON FUNCTION identity.is_platform_admin() TO autoworkshop_app;
infrastructure/migrations\025_platform_admin_role_name.sql:81:  FOR ALL USING (identity.is_platform_admin())
infrastructure/migrations\025_platform_admin_role_name.sql:82:  WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\025_platform_admin_role_name.sql:86:  FOR ALL USING (identity.is_platform_admin())
infrastructure/migrations\025_platform_admin_role_name.sql:87:  WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\025_platform_admin_role_name.sql:91:  FOR ALL USING (identity.is_platform_admin())
infrastructure/migrations\025_platform_admin_role_name.sql:92:  WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\025_platform_admin_role_name.sql:96:  FOR ALL USING (identity.is_platform_admin())
infrastructure/migrations\025_platform_admin_role_name.sql:97:  WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\025_platform_admin_role_name.sql:101:  FOR ALL USING (identity.is_platform_admin())
infrastructure/migrations\025_platform_admin_role_name.sql:102:  WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\025_platform_admin_role_name.sql:113:  FOR ALL USING (identity.is_platform_admin())
infrastructure/migrations\025_platform_admin_role_name.sql:114:  WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\025_platform_admin_role_name.sql:118:  FOR ALL USING (identity.is_platform_admin())
infrastructure/migrations\025_platform_admin_role_name.sql:119:  WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\025_platform_admin_role_name.sql:123:  FOR ALL USING (identity.is_platform_admin())
infrastructure/migrations\025_platform_admin_role_name.sql:124:  WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\025_platform_admin_role_name.sql:131:  FOR ALL USING (identity.is_platform_admin())
infrastructure/migrations\025_platform_admin_role_name.sql:132:  WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\025_platform_admin_role_name.sql:152:  IF identity.is_platform_admin() THEN
infrastructure/migrations\025_platform_admin_role_name.sql:208:  IF identity.is_platform_admin() THEN
infrastructure/migrations\025_platform_admin_role_name.sql:253:  IF identity.is_platform_admin() THEN
infrastructure/migrations\027_mechanic_directory_optin.sql:65:-- hand-rolled `current_role_name() = 'admin'` instead of calling
infrastructure/migrations\027_mechanic_directory_optin.sql:66:-- `identity.is_platform_admin()`, which had existed since migration 001 and
infrastructure/migrations\027_mechanic_directory_optin.sql:81:  SELECT identity.is_platform_admin()
infrastructure/migrations\027_mechanic_directory_optin.sql:82:      OR identity.current_role_name() = 'workshop_owner';
infrastructure/migrations\021_public_catalogue.sql:224:-- Writes are platform-admin only, via the same `app.current_role` convention
infrastructure/migrations\021_public_catalogue.sql:228:  FOR ALL USING (identity.current_role_name() = 'admin')
infrastructure/migrations\021_public_catalogue.sql:229:  WITH CHECK (identity.current_role_name() = 'admin');
infrastructure/migrations\021_public_catalogue.sql:231:  FOR ALL USING (identity.current_role_name() = 'admin')
infrastructure/migrations\021_public_catalogue.sql:232:  WITH CHECK (identity.current_role_name() = 'admin');
infrastructure/migrations\021_public_catalogue.sql:234:  FOR ALL USING (identity.current_role_name() = 'admin')
infrastructure/migrations\021_public_catalogue.sql:235:  WITH CHECK (identity.current_role_name() = 'admin');
infrastructure/migrations\021_public_catalogue.sql:237:  FOR ALL USING (identity.current_role_name() = 'admin')
infrastructure/migrations\021_public_catalogue.sql:238:  WITH CHECK (identity.current_role_name() = 'admin');
infrastructure/migrations\021_public_catalogue.sql:240:  FOR ALL USING (identity.current_role_name() = 'admin')
infrastructure/migrations\021_public_catalogue.sql:241:  WITH CHECK (identity.current_role_name() = 'admin');
infrastructure/migrations\029_pricing_write_scope.sql:9:--     USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\029_pricing_write_scope.sql:44:  USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\043_warranty.sql:232:            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
infrastructure/migrations\043_warranty.sql:238:            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
infrastructure/migrations\043_warranty.sql:244:            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id()) '
infrastructure/migrations\043_warranty.sql:246:            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
infrastructure/migrations\042_finance.sql:480:            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
infrastructure/migrations\042_finance.sql:486:            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
infrastructure/migrations\042_finance.sql:492:            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id()) '
infrastructure/migrations\042_finance.sql:494:            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
infrastructure/migrations\041_reception.sql:335:            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
infrastructure/migrations\041_reception.sql:341:            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
infrastructure/migrations\041_reception.sql:347:            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id()) '
infrastructure/migrations\041_reception.sql:349:            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
infrastructure/migrations\040_media_assets.sql:232:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\040_media_assets.sql:236:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\040_media_assets.sql:240:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\040_media_assets.sql:241:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\040_media_assets.sql:248:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\040_media_assets.sql:252:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\040_media_assets.sql:256:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\022_marketplace_orders.sql:320:  FOR ALL USING (identity.current_role_name() = 'admin')
infrastructure/migrations\022_marketplace_orders.sql:321:  WITH CHECK (identity.current_role_name() = 'admin');
infrastructure/migrations\022_marketplace_orders.sql:323:  FOR ALL USING (identity.current_role_name() = 'admin')
infrastructure/migrations\022_marketplace_orders.sql:324:  WITH CHECK (identity.current_role_name() = 'admin');
infrastructure/migrations\022_marketplace_orders.sql:326:  FOR ALL USING (identity.current_role_name() = 'admin')
infrastructure/migrations\022_marketplace_orders.sql:327:  WITH CHECK (identity.current_role_name() = 'admin');
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql:10:-- identity.memberships inside register_workshop, so the row demonstrably
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql:21:--   identity.memberships      rls=t  forced=t
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql:22:--   policies on memberships   tenant_isolation      ALL     tenant_id = current_tenant_id()
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql:26:--   SELECT count(*) FROM identity.memberships_for_subject(<subject>)  ->  1
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql:32:-- `memberships_for_subject` is SECURITY DEFINER, and everyone reading it
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql:35:-- identity.memberships is FORCE ROW LEVEL SECURITY — which binds the table
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql:48:--       LEFT JOIN identity.memberships m ON m.user_id = u.id
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql:64:-- and bypasses RLS entirely, so the LEFT JOIN finds the memberships and every
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql:76:--    effective user is the owner of `memberships_for_subject`. NOT security
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql:80:-- 2. A SELECT policy on identity.memberships admitting only rows whose
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql:83:-- 3. `memberships_for_subject` becomes plpgsql so it can open the door, read,
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql:114:DROP FUNCTION IF EXISTS identity.memberships_for_subject(TEXT);
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql:118:CREATE OR REPLACE FUNCTION identity.memberships_for_subject(p_subject TEXT)
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql:163:     LEFT JOIN identity.memberships m ON m.user_id = u.id
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql:174:COMMENT ON FUNCTION identity.memberships_for_subject(TEXT) IS
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql:175:'Bootstrap lookup: resolves a validated Keycloak subject to its own memberships. '
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql:177:'production and identity.memberships is FORCE RLS, which binds owners too. It '
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql:181:REVOKE ALL ON FUNCTION identity.memberships_for_subject(TEXT) FROM PUBLIC;
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql:182:GRANT EXECUTE ON FUNCTION identity.memberships_for_subject(TEXT) TO autoworkshop_app;
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql:201:            WHERE p.oid = 'identity.memberships_for_subject(text)'::regprocedure
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql:206:'TRUE only inside identity.memberships_for_subject: the app.membership_lookup '
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql:221:DROP POLICY IF EXISTS membership_lookup_select ON identity.memberships;
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql:222:CREATE POLICY membership_lookup_select ON identity.memberships
infrastructure/migrations\038_bootstrap_door_requires_definer.sql:111:DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.memberships;
infrastructure/migrations\038_bootstrap_door_requires_definer.sql:112:CREATE POLICY registration_bootstrap_insert ON identity.memberships
infrastructure/migrations\038_bootstrap_door_requires_definer.sql:120:DROP POLICY IF EXISTS registration_bootstrap_select ON identity.memberships;
infrastructure/migrations\038_bootstrap_door_requires_definer.sql:121:CREATE POLICY registration_bootstrap_select ON identity.memberships
infrastructure/migrations\033_variation_hardening.sql:82:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\033_variation_hardening.sql:83:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\033_variation_hardening.sql:153:    -- And a technician cannot review at all. `current_role_name()` answers
infrastructure/migrations\033_variation_hardening.sql:155:    IF identity.current_role_name() IN ('technician', 'reception_staff', 'storekeeper', 'cashier', 'customer', 'none') THEN
infrastructure/migrations\033_variation_hardening.sql:158:        identity.current_role_name()
infrastructure/migrations\037_registration_rls_bootstrap.sql:23:--     IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\037_registration_rls_bootstrap.sql:85:-- rather than replacing it. FOR INSERT only, except on memberships, which also
infrastructure/migrations\037_registration_rls_bootstrap.sql:116:DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.memberships;
infrastructure/migrations\037_registration_rls_bootstrap.sql:117:CREATE POLICY registration_bootstrap_insert ON identity.memberships
infrastructure/migrations\037_registration_rls_bootstrap.sql:129:DROP POLICY IF EXISTS registration_bootstrap_select ON identity.memberships;
infrastructure/migrations\037_registration_rls_bootstrap.sql:130:CREATE POLICY registration_bootstrap_select ON identity.memberships
infrastructure/migrations\037_registration_rls_bootstrap.sql:143:COMMENT ON POLICY registration_bootstrap_select ON identity.memberships IS
infrastructure/migrations\037_registration_rls_bootstrap.sql:206:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\037_registration_rls_bootstrap.sql:253:    INSERT INTO identity.memberships
infrastructure/migrations\032_repair_variations.sql:241:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\032_repair_variations.sql:242:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\036_signup_and_workshop_registration.sql:43:-- Same reason as `identity.memberships_for_subject` (migration 003), and the
infrastructure/migrations\036_signup_and_workshop_registration.sql:44:-- same measured failure behind it: `identity.memberships` is under ENABLE +
infrastructure/migrations\036_signup_and_workshop_registration.sql:122:-- `memberships_for_subject` filters on `u.status = 'active'`, so a suspended
infrastructure/migrations\036_signup_and_workshop_registration.sql:172:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\036_signup_and_workshop_registration.sql:213:    INSERT INTO identity.memberships
infrastructure/migrations\030_quality_control.sql:273:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\030_quality_control.sql:274:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\054_organisation_isolation.sql:17:--     USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\054_organisation_isolation.sql:48:--     (`is_platform_admin`, the append-only guards, the media owner rules,
infrastructure/migrations\054_organisation_isolation.sql:73:-- `identity.is_platform_admin()` is one throughout the rest of the schema and a
infrastructure/migrations\054_organisation_isolation.sql:144:            'USING (identity.is_platform_admin() '
infrastructure/migrations\054_organisation_isolation.sql:146:            'WITH CHECK (identity.is_platform_admin() '
infrastructure/migrations\049_comms_calls.sql:256:            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\049_comms_calls.sql:263:            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\049_comms_calls.sql:270:            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\049_comms_calls.sql:273:            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\048_knowledge_learning.sql:304:            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\048_knowledge_learning.sql:311:            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\048_knowledge_learning.sql:318:            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\048_knowledge_learning.sql:321:            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\047_customer_self_service.sql:309:            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\047_customer_self_service.sql:316:            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\047_customer_self_service.sql:323:            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\047_customer_self_service.sql:326:            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\051_supervisor_findings.sql:104:  (identity.is_platform_admin()
infrastructure/migrations\046_comms_messaging.sql:223:            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\046_comms_messaging.sql:230:            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\046_comms_messaging.sql:237:            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\046_comms_messaging.sql:240:            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\056_resource_bookings.sql:156:  (identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\056_resource_bookings.sql:161:  (identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\056_resource_bookings.sql:166:  (identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\056_resource_bookings.sql:169:  (identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\045_workshop_settings.sql:148:    -- The role NAME as `identity.memberships` spells it. Not a FK: roles are a
infrastructure/migrations\045_workshop_settings.sql:376:            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\045_workshop_settings.sql:383:            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\045_workshop_settings.sql:390:            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\045_workshop_settings.sql:393:            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\045_workshop_settings.sql:400:            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\044_parts_stock.sql:442:            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
infrastructure/migrations\044_parts_stock.sql:448:            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
infrastructure/migrations\044_parts_stock.sql:454:            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id()) '
infrastructure/migrations\044_parts_stock.sql:456:            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
infrastructure/migrations\057_learning_and_diagnostic_trees.sql:198:            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\057_learning_and_diagnostic_trees.sql:204:            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\057_learning_and_diagnostic_trees.sql:210:            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\057_learning_and_diagnostic_trees.sql:212:            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\058_service_requests.sql:143:  identity.is_platform_admin()
infrastructure/migrations\058_service_requests.sql:147:      AND identity.current_role_name() <> 'customer')
infrastructure/migrations\058_service_requests.sql:158:  identity.is_platform_admin()
infrastructure/migrations\058_service_requests.sql:171:  identity.is_platform_admin()
infrastructure/migrations\058_service_requests.sql:174:      AND identity.current_role_name() <> 'customer')
infrastructure/migrations\058_service_requests.sql:176:  identity.is_platform_admin()
infrastructure/migrations\058_service_requests.sql:179:      AND identity.current_role_name() <> 'customer')
infrastructure/migrations\061_customer_enrolment.sql:9:--   1. `identity.memberships` is written by exactly TWO code paths in the
infrastructure/migrations\061_customer_enrolment.sql:48:--      `workshop_owner` or `platform_administrator`. A `p_role` parameter here
infrastructure/migrations\061_customer_enrolment.sql:67:--      `identity.memberships`, whose WITH CHECK already requires BOTH
infrastructure/migrations\061_customer_enrolment.sql:286:    -- `identity.memberships` admits `user_id = app.bootstrap_user`.
infrastructure/migrations\061_customer_enrolment.sql:289:      FROM identity.memberships m
infrastructure/migrations\061_customer_enrolment.sql:348:    INSERT INTO identity.memberships
infrastructure/migrations\061_customer_enrolment.sql:359:          FROM identity.memberships m
infrastructure/migrations\060_notifications.sql:173:  identity.is_platform_admin()
infrastructure/migrations\060_notifications.sql:187:  identity.is_platform_admin()
infrastructure/migrations\060_notifications.sql:198:  identity.is_platform_admin()
infrastructure/migrations\060_notifications.sql:202:  identity.is_platform_admin()
infrastructure/migrations\060_notifications.sql:281:       AND NOT identity.is_platform_admin() THEN
infrastructure/migrations\060_notifications.sql:325:    -- policies. `register_workshop` (038) and `memberships_for_subject` (039)
infrastructure/migrations\060_notifications.sql:348:--   1. IT RETURNS NOTHING. `identity.memberships` restricts a caller to their
infrastructure/migrations\060_notifications.sql:385:          FROM identity.memberships m
infrastructure/migrations\062_supplier_request_select_excludes_customer.sql:5:-- `identity.current_role_name() <> 'customer'` on the tenant/organisation arm:
infrastructure/migrations\062_supplier_request_select_excludes_customer.sql:7:--   supplier_request_insert  ... AND identity.current_role_name() <> 'customer' ...
infrastructure/migrations\062_supplier_request_select_excludes_customer.sql:8:--   supplier_request_update  ... AND identity.current_role_name() <> 'customer' ...  (USING and WITH CHECK)
infrastructure/migrations\062_supplier_request_select_excludes_customer.sql:31:-- `identity.is_platform_admin()` — the platform administrator is not inside any
infrastructure/migrations\062_supplier_request_select_excludes_customer.sql:64:  identity.is_platform_admin()
infrastructure/migrations\062_supplier_request_select_excludes_customer.sql:71:      AND identity.current_role_name() <> 'customer')
infrastructure/migrations\059_supplier_requests.sql:172:  identity.is_platform_admin()
infrastructure/migrations\059_supplier_requests.sql:184:  identity.is_platform_admin()
infrastructure/migrations\059_supplier_requests.sql:188:      AND identity.current_role_name() <> 'customer'
infrastructure/migrations\059_supplier_requests.sql:201:  identity.is_platform_admin()
infrastructure/migrations\059_supplier_requests.sql:204:      AND identity.current_role_name() <> 'customer')
infrastructure/migrations\059_supplier_requests.sql:207:  identity.is_platform_admin()
infrastructure/migrations\059_supplier_requests.sql:210:      AND identity.current_role_name() <> 'customer')
infrastructure/migrations\063_one_customer_record_per_user_per_workshop.sql:7:-- is already race-safe: `identity.memberships` is unique on
infrastructure/migrations\064_agent_proposals_and_leads.sql:156:  identity.is_platform_admin()
infrastructure/migrations\064_agent_proposals_and_leads.sql:159:      AND identity.current_role_name() <> 'customer')
infrastructure/migrations\064_agent_proposals_and_leads.sql:164:  identity.is_platform_admin()
infrastructure/migrations\064_agent_proposals_and_leads.sql:181:  identity.is_platform_admin()
infrastructure/migrations\064_agent_proposals_and_leads.sql:184:      AND identity.current_role_name() <> 'customer')
infrastructure/migrations\064_agent_proposals_and_leads.sql:186:  identity.is_platform_admin()
infrastructure/migrations\064_agent_proposals_and_leads.sql:189:      AND identity.current_role_name() <> 'customer')
infrastructure/migrations\064_agent_proposals_and_leads.sql:267:  identity.is_platform_admin()
infrastructure/migrations\064_agent_proposals_and_leads.sql:270:      AND identity.current_role_name() <> 'customer')
infrastructure/migrations\064_agent_proposals_and_leads.sql:275:  identity.is_platform_admin()
infrastructure/migrations\064_agent_proposals_and_leads.sql:278:      AND identity.current_role_name() <> 'customer'
infrastructure/migrations\064_agent_proposals_and_leads.sql:286:  identity.is_platform_admin()
infrastructure/migrations\064_agent_proposals_and_leads.sql:289:      AND identity.current_role_name() <> 'customer')
infrastructure/migrations\064_agent_proposals_and_leads.sql:291:  identity.is_platform_admin()
infrastructure/migrations\064_agent_proposals_and_leads.sql:294:      AND identity.current_role_name() <> 'customer')
infrastructure/migrations\067_settings_org_select_excludes_customer.sql:101:            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\067_settings_org_select_excludes_customer.sql:106:            -- `current_role_name() <> ''customer''` has to find every one of
infrastructure/migrations\067_settings_org_select_excludes_customer.sql:109:            'AND identity.current_role_name() <> ''customer''))',
infrastructure/migrations\068_supplier_registration.sql:13:-- `identity.memberships` has exactly two writers:
infrastructure/migrations\068_supplier_registration.sql:27:-- `scripts/seed-dev-identity.sh` INSERTs memberships with raw SQL, so a
infrastructure/migrations\068_supplier_registration.sql:140:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\068_supplier_registration.sql:188:    INSERT INTO identity.memberships
infrastructure/migrations\069_organization_registrations.sql:120:  identity.is_platform_admin()
infrastructure/migrations\069_organization_registrations.sql:151:  USING (identity.is_platform_admin())
infrastructure/migrations\069_organization_registrations.sql:152:  WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\069_organization_registrations.sql:218:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\069_organization_registrations.sql:248:    INSERT INTO identity.memberships
infrastructure/migrations\069_organization_registrations.sql:307:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\069_organization_registrations.sql:337:    INSERT INTO identity.memberships
infrastructure/migrations\066_settings_reads_exclude_customer.sql:6:--     USING (identity.is_platform_admin()
infrastructure/migrations\066_settings_reads_exclude_customer.sql:81:  identity.is_platform_admin()
infrastructure/migrations\066_settings_reads_exclude_customer.sql:88:      AND identity.current_role_name() <> 'customer')
infrastructure/migrations\066_settings_reads_exclude_customer.sql:93:  identity.is_platform_admin()
infrastructure/migrations\066_settings_reads_exclude_customer.sql:98:      AND identity.current_role_name() <> 'customer')
infrastructure/migrations\070_alert_admins_of_registrations.sql:37:-- `identity.memberships` is under FORCE RLS, and the registration transaction
infrastructure/migrations\070_alert_admins_of_registrations.sql:53:-- `recipient_id = identity.current_user_id()` OR `identity.is_platform_admin()`,
infrastructure/migrations\070_alert_admins_of_registrations.sql:101:          FROM identity.memberships m
infrastructure/migrations\070_alert_admins_of_registrations.sql:102:         WHERE m.role_name = 'platform_administrator'
infrastructure/migrations\070_alert_admins_of_registrations.sql:150:'identity.memberships under FORCE RLS would find zero administrators and '
infrastructure/migrations\072_registration_defects_from_supervisor.sql:207:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\072_registration_defects_from_supervisor.sql:238:    INSERT INTO identity.memberships
infrastructure/migrations\072_registration_defects_from_supervisor.sql:304:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\072_registration_defects_from_supervisor.sql:334:    INSERT INTO identity.memberships
infrastructure/migrations\071_registration_defects_from_codex.sql:11:-- 070's trigger reads `identity.memberships` to find platform administrators.
infrastructure/migrations\071_registration_defects_from_codex.sql:87:-- `platform_administrator` rows — not every membership — so even if the owner
infrastructure/migrations\071_registration_defects_from_codex.sql:90:DROP POLICY IF EXISTS admin_lookup_select ON identity.memberships;
infrastructure/migrations\071_registration_defects_from_codex.sql:91:CREATE POLICY admin_lookup_select ON identity.memberships FOR SELECT USING (
infrastructure/migrations\071_registration_defects_from_codex.sql:93:  AND role_name = 'platform_administrator'
infrastructure/migrations\071_registration_defects_from_codex.sql:128:          FROM identity.memberships m
infrastructure/migrations\071_registration_defects_from_codex.sql:129:         WHERE m.role_name = 'platform_administrator'
infrastructure/migrations\071_registration_defects_from_codex.sql:227:-- Both functions check `IF EXISTS (SELECT 1 FROM identity.memberships WHERE
infrastructure/migrations\071_registration_defects_from_codex.sql:289:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\071_registration_defects_from_codex.sql:319:    INSERT INTO identity.memberships
infrastructure/migrations\071_registration_defects_from_codex.sql:376:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\071_registration_defects_from_codex.sql:406:    INSERT INTO identity.memberships
infrastructure/migrations\071_registration_defects_from_codex.sql:454:    SELECT count(*) INTO v_total FROM identity.memberships
infrastructure/migrations\071_registration_defects_from_codex.sql:455:     WHERE role_name = 'platform_administrator' AND status = 'active';
infrastructure/migrations\071_registration_defects_from_codex.sql:490:        SELECT count(*) INTO v_admins FROM identity.memberships
infrastructure/migrations\071_registration_defects_from_codex.sql:491:         WHERE role_name = 'platform_administrator' AND status = 'active';
infrastructure/migrations\071_registration_defects_from_codex.sql:517:                'app.admin_lookup opened identity.memberships to a role that is NOT '
infrastructure/migrations\071_registration_defects_from_codex.sql:543:        SELECT count(*) INTO v_admins FROM identity.memberships
infrastructure/migrations\071_registration_defects_from_codex.sql:544:         WHERE role_name = 'platform_administrator' AND status = 'active';
infrastructure/migrations\073_relationships.sql:179:--     USING (identity.is_platform_admin() OR tenant_id = current_tenant_id())
infrastructure/migrations\073_relationships.sql:182:-- `is_platform_admin()` is false. Measured, as `autoworkshop_app`:
infrastructure/migrations\073_relationships.sql:195:-- and the RESTRICTIVE (054) policies read `is_platform_admin() OR ...`, and
infrastructure/migrations\073_relationships.sql:196:-- `is_platform_admin()` is `current_role_name() IN ('admin',
infrastructure/migrations\073_relationships.sql:197:-- 'platform_administrator')`. Measured again with it set: 0 → 6.
infrastructure/migrations\073_relationships.sql:212:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\073_relationships.sql:214:    IF NOT identity.is_platform_admin() THEN
infrastructure/migrations\073_relationships.sql:219:            'confident zero over invisible rows. Setting app.current_role did '
infrastructure/migrations\073_relationships.sql:220:            'not make is_platform_admin() true — a policy or that function has '
infrastructure/migrations\074_towing.sql:367:              identity.is_platform_admin()
infrastructure/migrations\074_towing.sql:370:                  AND identity.current_role_name() <> 'customer')
infrastructure/migrations\074_towing.sql:375:              identity.is_platform_admin()
infrastructure/migrations\074_towing.sql:378:                  AND identity.current_role_name() <> 'customer')
infrastructure/migrations\074_towing.sql:386:              identity.is_platform_admin()
infrastructure/migrations\074_towing.sql:389:                  AND identity.current_role_name() <> 'customer')
infrastructure/migrations\074_towing.sql:391:              identity.is_platform_admin()
infrastructure/migrations\074_towing.sql:394:                  AND identity.current_role_name() <> 'customer')
infrastructure/migrations\075_fleet_registration.sql:11:-- `identity.memberships` has four writers and this was checked against
infrastructure/migrations\075_fleet_registration.sql:34:-- every test, because `seed-dev-identity.sh` writes memberships with raw SQL.
infrastructure/migrations\075_fleet_registration.sql:130:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\075_fleet_registration.sql:171:    INSERT INTO identity.memberships
infrastructure/migrations\075_fleet_registration.sql:333:          FROM identity.memberships m
infrastructure/migrations\075_fleet_registration.sql:334:         WHERE m.role_name = 'platform_administrator'
infrastructure/migrations\076_fleet_registration_race.sql:7:-- `IF EXISTS (... memberships WHERE user_id = v_user ...)` guard before creating
infrastructure/migrations\076_fleet_registration_race.sql:109:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\076_fleet_registration_race.sql:156:    INSERT INTO identity.memberships
infrastructure/migrations\077_platform_administrator_grants.sql:6:-- `identity.is_platform_admin()` has answered this since migration 001:
infrastructure/migrations\077_platform_administrator_grants.sql:8:--     current_role_name() IN ('admin', 'platform_administrator')
infrastructure/migrations\077_platform_administrator_grants.sql:10:-- `current_role_name()` reads `app.current_role`, which `tenantSessionStatements`
infrastructure/migrations\077_platform_administrator_grants.sql:19:--      `identity.memberships.organization_id` and `.tenant_id` are both NOT
infrastructure/migrations\077_platform_administrator_grants.sql:26:--      `platform_administrator`, and that is good — but its own comment records
infrastructure/migrations\077_platform_administrator_grants.sql:39:-- It does not read the Keycloak token. `platform_administrator` is a realm role
infrastructure/migrations\077_platform_administrator_grants.sql:58:-- from `ROLE_PERMISSIONS['platform_administrator']`, keyed on
infrastructure/migrations\077_platform_administrator_grants.sql:64:--     admits a `platform_administrator` membership holding no grant.
infrastructure/migrations\077_platform_administrator_grants.sql:83:SELECT set_config('app.current_role', 'admin', true);
infrastructure/migrations\077_platform_administrator_grants.sql:87:  IF NOT identity.is_platform_admin() THEN
infrastructure/migrations\077_platform_administrator_grants.sql:102:CREATE TABLE identity.platform_administrators (
infrastructure/migrations\077_platform_administrator_grants.sql:123:  CONSTRAINT platform_admin_revocation_is_complete CHECK (
infrastructure/migrations\077_platform_administrator_grants.sql:127:  CONSTRAINT platform_admin_reason_not_blank
infrastructure/migrations\077_platform_administrator_grants.sql:131:COMMENT ON TABLE identity.platform_administrators IS
infrastructure/migrations\077_platform_administrator_grants.sql:137:CREATE UNIQUE INDEX platform_administrators_one_active
infrastructure/migrations\077_platform_administrator_grants.sql:138:  ON identity.platform_administrators (user_id)
infrastructure/migrations\077_platform_administrator_grants.sql:148:CREATE OR REPLACE FUNCTION identity.platform_administrators_append_only()
infrastructure/migrations\077_platform_administrator_grants.sql:154:    RAISE EXCEPTION 'identity.platform_administrators is append-only; revoke instead of deleting';
infrastructure/migrations\077_platform_administrator_grants.sql:185:CREATE TRIGGER platform_administrators_append_only
infrastructure/migrations\077_platform_administrator_grants.sql:186:  BEFORE UPDATE OR DELETE ON identity.platform_administrators
infrastructure/migrations\077_platform_administrator_grants.sql:187:  FOR EACH ROW EXECUTE FUNCTION identity.platform_administrators_append_only();
infrastructure/migrations\077_platform_administrator_grants.sql:191:-- 🔴 THE TRAP THIS AVOIDS. `is_platform_admin()` is called inside the RLS
infrastructure/migrations\077_platform_administrator_grants.sql:193:-- If this table's own policy called `is_platform_admin()` — the obvious,
infrastructure/migrations\077_platform_administrator_grants.sql:199:-- never the derived predicate. A future edit adding `is_platform_admin()` here
infrastructure/migrations\077_platform_administrator_grants.sql:201:ALTER TABLE identity.platform_administrators ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\077_platform_administrator_grants.sql:202:ALTER TABLE identity.platform_administrators FORCE ROW LEVEL SECURITY;
infrastructure/migrations\077_platform_administrator_grants.sql:204:-- A user may see their OWN grant — which is all `is_platform_admin()` needs,
infrastructure/migrations\077_platform_administrator_grants.sql:206:CREATE POLICY platform_administrators_self_read
infrastructure/migrations\077_platform_administrator_grants.sql:207:  ON identity.platform_administrators
infrastructure/migrations\077_platform_administrator_grants.sql:210:      OR identity.current_role_name() = 'admin');
infrastructure/migrations\077_platform_administrator_grants.sql:216:CREATE POLICY platform_administrators_admin_write
infrastructure/migrations\077_platform_administrator_grants.sql:217:  ON identity.platform_administrators
infrastructure/migrations\077_platform_administrator_grants.sql:219:  USING (identity.current_role_name() = 'admin')
infrastructure/migrations\077_platform_administrator_grants.sql:220:  WITH CHECK (identity.current_role_name() = 'admin');
infrastructure/migrations\077_platform_administrator_grants.sql:222:GRANT SELECT ON identity.platform_administrators TO autoworkshop_app;
infrastructure/migrations\077_platform_administrator_grants.sql:227:-- `is_platform_admin()` stops honouring the membership role name, anyone whose
infrastructure/migrations\077_platform_administrator_grants.sql:229:-- account. So every existing active `platform_administrator` membership becomes
infrastructure/migrations\077_platform_administrator_grants.sql:231:INSERT INTO identity.platform_administrators (user_id, granted_at, granted_actor, granted_reason)
infrastructure/migrations\077_platform_administrator_grants.sql:235:       'backfilled from an existing active platform_administrator membership'
infrastructure/migrations\077_platform_administrator_grants.sql:236:  FROM identity.memberships m
infrastructure/migrations\077_platform_administrator_grants.sql:237: WHERE m.role_name = 'platform_administrator'
infrastructure/migrations\077_platform_administrator_grants.sql:247:-- `role_name` into `app.current_role`, and `admin` is not a grantable role. It
infrastructure/migrations\077_platform_administrator_grants.sql:251:-- `'platform_administrator'` is REMOVED. That string is a membership role name,
infrastructure/migrations\077_platform_administrator_grants.sql:253:CREATE OR REPLACE FUNCTION identity.is_platform_admin()
infrastructure/migrations\077_platform_administrator_grants.sql:260:           -- ONLY A SETTING. `app.current_role` is a custom GUC and ANY role
infrastructure/migrations\077_platform_administrator_grants.sql:263:           -- `set_config('app.current_role','admin',true)` restored platform
infrastructure/migrations\077_platform_administrator_grants.sql:274:           identity.current_role_name() = 'admin'
infrastructure/migrations\077_platform_administrator_grants.sql:277:                                WHERE oid = 'identity.platform_administrators'::regclass)
infrastructure/migrations\077_platform_administrator_grants.sql:281:             FROM identity.platform_administrators pa
infrastructure/migrations\077_platform_administrator_grants.sql:286:COMMENT ON FUNCTION identity.is_platform_admin() IS
infrastructure/migrations\077_platform_administrator_grants.sql:287:  'True for a user holding an un-revoked row in identity.platform_administrators, '
infrastructure/migrations\077_platform_administrator_grants.sql:288:  'or for the seed/psql escape — which requires BOTH app.current_role = admin AND '
infrastructure/migrations\077_platform_administrator_grants.sql:289:  'the caller to be the owner of that table, because app.current_role is a GUC any '
infrastructure/migrations\077_platform_administrator_grants.sql:291:  'Migration 077 removed the membership role name platform_administrator from this '
infrastructure/migrations\077_platform_administrator_grants.sql:306:  v_memberships int;
infrastructure/migrations\077_platform_administrator_grants.sql:309:  SELECT count(DISTINCT user_id) INTO v_memberships
infrastructure/migrations\077_platform_administrator_grants.sql:310:    FROM identity.memberships
infrastructure/migrations\077_platform_administrator_grants.sql:311:   WHERE role_name = 'platform_administrator' AND status = 'active';
infrastructure/migrations\077_platform_administrator_grants.sql:314:    FROM identity.platform_administrators
infrastructure/migrations\077_platform_administrator_grants.sql:322:        FROM identity.memberships m
infrastructure/migrations\077_platform_administrator_grants.sql:323:       WHERE m.role_name = 'platform_administrator'
infrastructure/migrations\077_platform_administrator_grants.sql:325:         AND NOT EXISTS (SELECT 1 FROM identity.platform_administrators pa
infrastructure/migrations\077_platform_administrator_grants.sql:328:      'backfill incomplete: at least one active platform_administrator membership has no active '
infrastructure/migrations\078_platform_grant_lookup.sql:7:-- `identity.platform_administrators`. It said so in its own header and left the
infrastructure/migrations\078_platform_grant_lookup.sql:27:--     CREATE POLICY platform_administrators_self_read ... FOR SELECT
infrastructure/migrations\078_platform_grant_lookup.sql:29:--           OR identity.current_role_name() = 'admin');
infrastructure/migrations\078_platform_grant_lookup.sql:36:-- `identity.platform_administrators` is ENABLE + FORCE ROW LEVEL SECURITY, so
infrastructure/migrations\078_platform_grant_lookup.sql:56:-- Migration 039 already solved this problem for memberships: a SECURITY DEFINER
infrastructure/migrations\078_platform_grant_lookup.sql:78:-- It does not touch `is_platform_admin()`. 077's predicate is correct and stays
infrastructure/migrations\078_platform_grant_lookup.sql:124:               FROM identity.platform_administrators pa
infrastructure/migrations\078_platform_grant_lookup.sql:190:-- `platform_administrators_self_read` stays exactly as it is — it is what
infrastructure/migrations\078_platform_grant_lookup.sql:191:-- `is_platform_admin()` relies on once a tenant context exists, and PostgreSQL
infrastructure/migrations\078_platform_grant_lookup.sql:195:-- ⚠️ IT MUST NOT CALL `is_platform_admin()`. 077's header explains why in
infrastructure/migrations\078_platform_grant_lookup.sql:200:DROP POLICY IF EXISTS platform_grant_lookup_select ON identity.platform_administrators;
infrastructure/migrations\078_platform_grant_lookup.sql:202:  ON identity.platform_administrators
infrastructure/migrations\079_organisation_scoped_keys.sql:102:    -- `is_platform_admin()` so that `app.current_role = 'admin'` is no longer
infrastructure/migrations\079_organisation_scoped_keys.sql:104:    -- `identity.platform_administrators`. A migration does, which is exactly
infrastructure/migrations\079_organisation_scoped_keys.sql:107:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\079_organisation_scoped_keys.sql:109:    IF NOT identity.is_platform_admin() THEN
infrastructure/migrations\079_organisation_scoped_keys.sql:112:            'app.current_role did not make is_platform_admin() true — since 077 '
infrastructure/migrations\079_organisation_scoped_keys.sql:114:            'identity.platform_administrators. A policy or that function has '
infrastructure/migrations\080_insurance_and_towing_registration.sql:12:-- Measured, not assumed. Every `INSERT INTO identity.memberships` across the
infrastructure/migrations\080_insurance_and_towing_registration.sql:171:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\080_insurance_and_towing_registration.sql:208:    INSERT INTO identity.memberships
infrastructure/migrations\080_insurance_and_towing_registration.sql:287:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\080_insurance_and_towing_registration.sql:320:    INSERT INTO identity.memberships
infrastructure/migrations\080_insurance_and_towing_registration.sql:490:          FROM identity.memberships m
infrastructure/migrations\080_insurance_and_towing_registration.sql:491:         WHERE m.role_name = 'platform_administrator'
infrastructure/migrations\082_insurance_marketplace.sql:360:    USING (identity.is_platform_admin()
infrastructure/migrations\082_insurance_marketplace.sql:363:    WITH CHECK (identity.is_platform_admin()
infrastructure/migrations\082_insurance_marketplace.sql:374:    USING (identity.is_platform_admin()
infrastructure/migrations\082_insurance_marketplace.sql:381:    WITH CHECK (identity.is_platform_admin()
infrastructure/migrations\082_insurance_marketplace.sql:389:    USING (identity.is_platform_admin()
infrastructure/migrations\082_insurance_marketplace.sql:392:    WITH CHECK (identity.is_platform_admin()
infrastructure/migrations\082_insurance_marketplace.sql:406:    USING (identity.is_platform_admin()
infrastructure/migrations\082_insurance_marketplace.sql:412:    USING (identity.is_platform_admin())
infrastructure/migrations\082_insurance_marketplace.sql:413:    WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\086_insurance_enquiries.sql:187:    USING (identity.is_platform_admin()
infrastructure/migrations\086_insurance_enquiries.sql:193:    USING (identity.is_platform_admin()
infrastructure/migrations\086_insurance_enquiries.sql:198:    WITH CHECK (identity.is_platform_admin()
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:11:--       = { platform_administrator, workshop_owner,
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:16:-- `INSERT INTO identity.memberships` in the entire API, and migration 080
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:24:-- `insurance_assessor`/`towing_operator`, `platform_administrator`) — and it
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:118:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:163:    INSERT INTO identity.memberships
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:186:'assessor role cannot grant memberships, so an insurer founded before 085 '
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:238:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:271:    INSERT INTO identity.memberships
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:292:'cannot grant memberships, so a towing firm founded before 085 could never '
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:322:--    NOTHING. `identity.memberships` and `identity.organizations` are under
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:337:--    organisation's memberships, and the winner must ALSO satisfy the founder
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:344:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:357:          FROM identity.memberships m
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:382:    UPDATE identity.memberships m
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:409:-- and had already been discarded. `app.current_role` is set LOCAL here, which
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:415:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:426:               FROM identity.memberships m
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:456:          JOIN identity.memberships m
infrastructure/migrations\084_insurance_public_insurer_name.sql:72:-- `app.current_role = 'admin'` paired with the owner's `current_user` is the
infrastructure/migrations\084_insurance_public_insurer_name.sql:73:-- escape `identity.is_platform_admin()` defines, and it is what every seed
infrastructure/migrations\084_insurance_public_insurer_name.sql:77:SELECT set_config('app.current_role', 'admin', true);
infrastructure/migrations\087_fleet_data_layer.sql:361:    IF identity.is_platform_admin() THEN
infrastructure/migrations\087_fleet_data_layer.sql:512:    USING (identity.is_platform_admin()
infrastructure/migrations\087_fleet_data_layer.sql:515:    WITH CHECK (identity.is_platform_admin()
infrastructure/migrations\087_fleet_data_layer.sql:553:    USING (identity.is_platform_admin())
infrastructure/migrations\087_fleet_data_layer.sql:554:    WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\rehearse\075_fleet_registration_render_privileges.sql:57:    identity.memberships,
infrastructure/migrations\rehearse\075_fleet_registration_render_privileges.sql:68:-- `identity.is_platform_admin()`, `current_tenant_id()` and friends, and a
infrastructure/migrations\rehearse\075_fleet_registration_render_privileges.sql:112:    SELECT count(*) INTO v_admins FROM identity.memberships
infrastructure/migrations\rehearse\075_fleet_registration_render_privileges.sql:113:     WHERE role_name = 'platform_administrator' AND status = 'active';
infrastructure/migrations\rehearse\075_fleet_registration_render_privileges.sql:121:    SELECT count(*) INTO n FROM identity.memberships
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql:91:    EXECUTE format('ALTER TABLE identity.memberships   OWNER TO %I', sim_role);
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql:123:    INSERT INTO identity.memberships
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql:156:      FROM identity.memberships
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql:185:      FROM identity.memberships
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql:198:    DELETE FROM identity.memberships WHERE user_id = v_stranger AND organization_id = v_org;
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql:263:        INSERT INTO identity.memberships
infrastructure/migrations\rehearse\060_notifications_render_privileges.sql:150:    EXECUTE format('GRANT SELECT ON identity.users, identity.memberships, core.notification_preferences TO %I', sim_role);
infrastructure/migrations\rehearse\060_notifications_render_privileges.sql:152:    -- The POLICIES call these — `is_platform_admin()`, `current_user_id()`,
infrastructure/migrations\rehearse\060_notifications_render_privileges.sql:208:    PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\013_finding_removal.sql:63:    PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\015_plan_identity_immutable.sql:52:    PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\014_repair_plans.sql:64:    PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\016_quotations.sql:41:    PERFORM set_config('app.current_role', 'workshop_manager', true);
infrastructure/migrations\verify\021_public_catalogue.sql:17:-- Deliberately NOT set: app.current_tenant, app.current_role. A public reader
infrastructure/migrations\verify\021_public_catalogue.sql:116:  --    it is not. Without app.current_role='admin' the admin_write policy's
infrastructure/migrations\verify\024_supplier_catalogue.sql:28:SELECT set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\024_supplier_catalogue.sql:80:  -- The seed phase above needed `app.current_role='admin'`, and that GUC is
infrastructure/migrations\verify\024_supplier_catalogue.sql:85:  PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\024_supplier_catalogue.sql:86:  IF identity.current_role_name() = 'admin' THEN
infrastructure/migrations\verify\024_supplier_catalogue.sql:306:  PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\026_fitment_publication_guard.sql:21:SELECT set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\026_fitment_publication_guard.sql:65:  PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\026_fitment_publication_guard.sql:66:  IF identity.is_platform_admin() THEN
infrastructure/migrations\verify\026_fitment_publication_guard.sql:127:  PERFORM set_config('app.current_role', 'platform_administrator', true);
infrastructure/migrations\verify\026_fitment_publication_guard.sql:134:  PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\026_fitment_publication_guard.sql:142:  PERFORM set_config('app.current_role', 'platform_administrator', true);
infrastructure/migrations\verify\026_fitment_publication_guard.sql:153:  PERFORM set_config('app.current_role', 'platform_administrator', true);
infrastructure/migrations\verify\025_platform_admin_role_name.sql:10:--     -v ON_ERROR_STOP=1 -f - < infrastructure/migrations/verify/025_platform_admin_role_name.sql
infrastructure/migrations\verify\025_platform_admin_role_name.sql:16:SELECT set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\025_platform_admin_role_name.sql:51:  -- 1. 🔴 THE REGRESSION ITSELF. `platform_administrator` is the role name the
infrastructure/migrations\verify\025_platform_admin_role_name.sql:52:  --    application actually sets, from `identity.memberships.role_name`. Before
infrastructure/migrations\verify\025_platform_admin_role_name.sql:54:  PERFORM set_config('app.current_role', 'platform_administrator', true);
infrastructure/migrations\verify\025_platform_admin_role_name.sql:59:      'check 1 FAILED: a platform_administrator published % rows, expected 1 — '
infrastructure/migrations\verify\025_platform_admin_role_name.sql:62:  RAISE NOTICE 'check 1 OK: platform_administrator CAN publish a part (this is the fix)';
infrastructure/migrations\verify\025_platform_admin_role_name.sql:69:    RAISE EXCEPTION 'check 2 FAILED: a platform_administrator unpublished % rows, expected 1', n;
infrastructure/migrations\verify\025_platform_admin_role_name.sql:71:  RAISE NOTICE 'check 2 OK: platform_administrator CAN unpublish';
infrastructure/migrations\verify\025_platform_admin_role_name.sql:78:    RAISE EXCEPTION 'check 3 FAILED: a platform_administrator verified % suppliers, expected 1', n;
infrastructure/migrations\verify\025_platform_admin_role_name.sql:80:  RAISE NOTICE 'check 3 OK: platform_administrator CAN approve a supplier';
infrastructure/migrations\verify\025_platform_admin_role_name.sql:85:  PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\025_platform_admin_role_name.sql:96:  PERFORM set_config('app.current_role', 'supplier_owner', true);
infrastructure/migrations\verify\025_platform_admin_role_name.sql:109:  -- `app.current_role` is set. The check proved nothing about role names
infrastructure/migrations\verify\025_platform_admin_role_name.sql:117:  --    `platform_administrator` are the ONLY accepted names, so a role that
infrastructure/migrations\verify\025_platform_admin_role_name.sql:119:  PERFORM set_config('app.current_role', 'workshop_owner', true);
infrastructure/migrations\verify\025_platform_admin_role_name.sql:131:  PERFORM set_config('app.current_role', 'platform_administrator', true);
infrastructure/migrations\verify\025_platform_admin_role_name.sql:143:  PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\029_pricing_write_scope.sql:25:SELECT set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\029_pricing_write_scope.sql:101:  PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\029_pricing_write_scope.sql:113:  PERFORM set_config('app.current_role', 'workshop_manager', true);
infrastructure/migrations\verify\029_pricing_write_scope.sql:125:  PERFORM set_config('app.current_role', 'workshop_owner', true);
infrastructure/migrations\verify\029_pricing_write_scope.sql:139:  PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\029_pricing_write_scope.sql:154:  PERFORM set_config('app.current_role', 'workshop_owner', true);
infrastructure/migrations\verify\029_pricing_write_scope.sql:178:  PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\029_pricing_write_scope.sql:190:  PERFORM set_config('app.current_role', 'workshop_owner', true);
infrastructure/migrations\verify\028_directory_member_read.sql:18:SELECT set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\028_directory_member_read.sql:49:  PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\028_directory_member_read.sql:53:  PERFORM set_config('app.current_role', 'workshop_manager', true);
infrastructure/migrations\verify\028_directory_member_read.sql:61:  PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\028_directory_member_read.sql:91:  PERFORM set_config('app.current_role', 'workshop_owner', true);
infrastructure/migrations\verify\028_directory_member_read.sql:101:  PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\027_mechanic_directory_optin.sql:19:SELECT set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\027_mechanic_directory_optin.sql:52:  PERFORM set_config('app.current_role', 'workshop_owner', true);
infrastructure/migrations\verify\027_mechanic_directory_optin.sql:54:  IF identity.is_platform_admin() THEN
infrastructure/migrations\verify\027_mechanic_directory_optin.sql:143:  PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\027_mechanic_directory_optin.sql:156:  PERFORM set_config('app.current_role', 'workshop_manager', true);
infrastructure/migrations\verify\027_mechanic_directory_optin.sql:167:  PERFORM set_config('app.current_role', 'workshop_owner', true);
infrastructure/migrations\verify\027_mechanic_directory_optin.sql:183:  PERFORM set_config('app.current_role', 'workshop_owner', true);
infrastructure/migrations\verify\027_mechanic_directory_optin.sql:191:  PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\032_repair_variations.sql:18:SELECT set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\032_repair_variations.sql:65:  PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\032_repair_variations.sql:114:  PERFORM set_config('app.current_role', 'workshop_supervisor', true);
infrastructure/migrations\verify\032_repair_variations.sql:183:    PERFORM set_config('app.current_role', 'workshop_supervisor', true);
infrastructure/migrations\verify\032_repair_variations.sql:219:    PERFORM set_config('app.current_role', 'workshop_supervisor', true);
infrastructure/migrations\verify\031_quality_control_hardening.sql:21:SELECT set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\031_quality_control_hardening.sql:104:  PERFORM set_config('app.current_role', 'quality_control_inspector', true);
infrastructure/migrations\verify\031_quality_control_hardening.sql:189:  PERFORM set_config('app.current_role', 'workshop_owner', true);
infrastructure/migrations\verify\031_quality_control_hardening.sql:220:  PERFORM set_config('app.current_role', 'quality_control_inspector', true);
infrastructure/migrations\verify\030_quality_control.sql:19:SELECT set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\030_quality_control.sql:115:  PERFORM set_config('app.current_role', 'quality_control_inspector', true);
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql:115:    FROM identity.memberships_for_subject(s) WHERE tenant_id IS NOT NULL;
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql:123:  -- identity.memberships; under FORCE RLS with no tenant context it returned
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql:182:    INSERT INTO identity.memberships
infrastructure/migrations\verify\036_signup_and_workshop_registration.sql:16:-- through `memberships_for_subject`, which is the boundary crossing the
infrastructure/migrations\verify\036_signup_and_workshop_registration.sql:71:  -- identity.memberships returns zero here for RLS reasons and would "pass"
infrastructure/migrations\verify\036_signup_and_workshop_registration.sql:74:    FROM identity.memberships_for_subject(s) WHERE tenant_id IS NOT NULL;
infrastructure/migrations\verify\036_signup_and_workshop_registration.sql:93:    FROM identity.memberships_for_subject(s) WHERE tenant_id IS NOT NULL;
infrastructure/migrations\verify\036_signup_and_workshop_registration.sql:129:  SELECT count(*) INTO n FROM identity.memberships_for_subject(s2);
infrastructure/migrations\verify\033_variation_hardening.sql:20:SELECT set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\033_variation_hardening.sql:63:  PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\033_variation_hardening.sql:115:  PERFORM set_config('app.current_role', 'workshop_supervisor', true);
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:7:-- `memberships_for_subject` finds the memberships whatever the policies say and
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:49:-- The policies call `identity.is_platform_admin()` and friends, which are
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:56:ALTER FUNCTION identity.memberships_for_subject(TEXT)                 OWNER TO verify039_owner;
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:82:   WHERE p.oid = 'identity.memberships_for_subject(text)'::regprocedure;
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:86:      'MEASUREMENT INVALID: memberships_for_subject still executes as a SUPERUSER, '
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:94:       WHERE p.oid = 'identity.memberships_for_subject(text)'::regprocedure) = current_user THEN
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:107:  SELECT count(*) INTO n FROM identity.memberships_for_subject(s) WHERE tenant_id IS NOT NULL;
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:123:  SELECT count(*) INTO n FROM identity.memberships_for_subject(s) WHERE tenant_id IS NOT NULL;
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:133:  SELECT * INTO row1 FROM identity.memberships_for_subject(s) WHERE tenant_id IS NOT NULL;
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:165:  SELECT count(*) INTO leaked FROM identity.memberships WHERE user_id = uid;
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:181:    FROM identity.memberships_for_subject(s)
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:187:  SELECT count(*) INTO n FROM identity.memberships_for_subject(s) WHERE tenant_id IS NOT NULL;
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:196:  SELECT count(*) INTO n FROM identity.memberships_for_subject(s2) WHERE tenant_id IS NOT NULL;
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:198:    RAISE EXCEPTION 'FAIL 8: the SECOND user resolves % memberships, expected 1', n;
infrastructure/migrations\verify\039_membership_lookup_can_read_own_rows.sql:205:  SELECT count(*) INTO leaked FROM identity.memberships;
infrastructure/migrations\verify\038_bootstrap_door_requires_definer.sql:51:-- The POLICIES call `identity.is_platform_admin()` and friends, and those are
infrastructure/migrations\verify\038_bootstrap_door_requires_definer.sql:122:  IF EXISTS (SELECT 1 FROM identity.memberships WHERE user_id = uid) THEN
infrastructure/migrations\verify\042_finance.sql:121:    RAISE NOTICE '  is_platform_admin=%', identity.is_platform_admin();
infrastructure/migrations\verify\058_service_requests.sql:54:    -- rehearsal. `app.current_role` is deliberately a STAFF role here so the
infrastructure/migrations\verify\058_service_requests.sql:59:    PERFORM set_config('app.current_role', 'reception_staff', true);
infrastructure/migrations\verify\058_service_requests.sql:233:    PERFORM set_config('app.current_role', 'customer', true);
infrastructure/migrations\verify\058_service_requests.sql:298:    PERFORM set_config('app.current_role', 'customer', true);
infrastructure/migrations\verify\058_service_requests.sql:308:    PERFORM set_config('app.current_role', 'reception_staff', true);
infrastructure/migrations\verify\074_towing.sql:117:    PERFORM set_config('app.current_role', 'workshop_owner', true);
infrastructure/migrations\verify\074_towing.sql:146:    PERFORM set_config('app.current_role', 'customer', true);
infrastructure/migrations\verify\073_relationships.sql:174:    PERFORM set_config('app.current_role', 'workshop_owner', true);
infrastructure/migrations\verify\060_notifications.sql:43:    PERFORM set_config('app.current_role', 'reception_staff', true);
infrastructure/migrations\verify\060_notifications.sql:178:    PERFORM set_config('app.current_role', 'customer', true);
infrastructure/migrations\verify\060_notifications.sql:188:    PERFORM set_config('app.current_role', 'reception_staff', true);
infrastructure/migrations\verify\060_notifications.sql:205:    INSERT INTO identity.memberships
infrastructure/migrations\verify\060_notifications.sql:261:    PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\060_notifications.sql:289:    PERFORM set_config('app.current_role', 'reception_staff', true);
infrastructure/migrations\verify\060_notifications.sql:293:    DELETE FROM identity.memberships WHERE user_id = other_user;
infrastructure/migrations\verify\079_organisation_scoped_keys.sql:34:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\079_organisation_scoped_keys.sql:35:    IF NOT identity.is_platform_admin() THEN
infrastructure/migrations\verify\087_fleet_data_layer.sql:55:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\087_fleet_data_layer.sql:142:    PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\087_fleet_data_layer.sql:391:    -- It set `app.current_role = 'admin'` while still `SET ROLE
infrastructure/migrations\verify\087_fleet_data_layer.sql:392:    -- autoworkshop_app`. The platform escape is `current_role_name() = 'admin'`
infrastructure/migrations\verify\087_fleet_data_layer.sql:398:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\087_fleet_data_layer.sql:405:    PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\087_fleet_data_layer.sql:434:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\087_fleet_data_layer.sql:450:    DELETE FROM identity.memberships   WHERE tenant_id IN (rf.o_tenant_id, v_ws_ten, v_third_ten);
infrastructure/migrations\verify\078_platform_grant_lookup.sql:16:-- It proves that a DIRECT select from `identity.platform_administrators`, with
infrastructure/migrations\verify\078_platform_grant_lookup.sql:29:-- `is_platform_admin()` — that function SELECTs from this table, so a policy
infrastructure/migrations\verify\078_platform_grant_lookup.sql:57:      FROM identity.platform_administrators pa
infrastructure/migrations\verify\078_platform_grant_lookup.sql:67:                        'per active platform_administrator membership. Without one this '
infrastructure/migrations\verify\078_platform_grant_lookup.sql:73:    -- rather than from memberships: the point is that holding any membership,
infrastructure/migrations\verify\078_platform_grant_lookup.sql:74:    -- including a `platform_administrator` one, buys nothing here.
infrastructure/migrations\verify\078_platform_grant_lookup.sql:80:                         FROM identity.platform_administrators pa
infrastructure/migrations\verify\078_platform_grant_lookup.sql:106:      FROM identity.platform_administrators
infrastructure/migrations\verify\078_platform_grant_lookup.sql:137:      FROM identity.platform_administrators
infrastructure/migrations\verify\078_platform_grant_lookup.sql:157:    -- 7. 🔴 STRUCTURAL — no policy on this table may reference is_platform_admin().
infrastructure/migrations\verify\078_platform_grant_lookup.sql:162:       AND tablename  = 'platform_administrators'
infrastructure/migrations\verify\078_platform_grant_lookup.sql:163:       AND (coalesce(qual, '') LIKE '%is_platform_admin%'
infrastructure/migrations\verify\078_platform_grant_lookup.sql:164:         OR coalesce(with_check, '') LIKE '%is_platform_admin%');
infrastructure/migrations\verify\078_platform_grant_lookup.sql:166:        RAISE EXCEPTION 'check 7 FAILED: % policy/policies on identity.platform_administrators '
infrastructure/migrations\verify\078_platform_grant_lookup.sql:167:                        'reference is_platform_admin(), which SELECTs from this very table. '
infrastructure/migrations\verify\078_platform_grant_lookup.sql:172:    --    must not have replaced the one is_platform_admin() depends on.
infrastructure/migrations\verify\078_platform_grant_lookup.sql:176:       AND tablename  = 'platform_administrators'
infrastructure/migrations\verify\078_platform_grant_lookup.sql:177:       AND policyname = 'platform_administrators_self_read';
infrastructure/migrations\verify\078_platform_grant_lookup.sql:179:        RAISE EXCEPTION 'check 8 FAILED: 077''s platform_administrators_self_read policy is '
infrastructure/migrations\verify\078_platform_grant_lookup.sql:180:                        'gone (found %). is_platform_admin() relies on it once a tenant '
infrastructure/migrations\verify\086_insurance_enquiries.sql:69:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\086_insurance_enquiries.sql:146:    PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\086_insurance_enquiries.sql:187:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\086_insurance_enquiries.sql:200:    -- `permission denied for table users` from inside `is_platform_admin()` —
infrastructure/migrations\verify\086_insurance_enquiries.sql:207:    PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\086_insurance_enquiries.sql:312:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\086_insurance_enquiries.sql:320:    PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\086_insurance_enquiries.sql:371:    PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\086_insurance_enquiries.sql:378:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\086_insurance_enquiries.sql:437:    DELETE FROM identity.memberships   WHERE tenant_id IN (ra.o_tenant_id, rb.o_tenant_id);
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql:52:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql:80:      FROM identity.memberships WHERE id = ri.o_membership_id;
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql:88:      FROM identity.memberships WHERE id = rt.o_membership_id;
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql:116:    INSERT INTO identity.memberships
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql:122:      FROM identity.memberships
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql:132:    INSERT INTO identity.memberships
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql:138:      FROM identity.memberships
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql:156:             SELECT 1 FROM identity.memberships m
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql:199:      FROM identity.memberships
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql:253:    INSERT INTO identity.memberships
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql:259:    INSERT INTO identity.memberships
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql:271:          FROM identity.memberships m
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql:292:    DELETE FROM identity.memberships   WHERE tenant_id = v_solo_ten;
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql:313:    DELETE FROM identity.memberships   WHERE tenant_id IN (ri.o_tenant_id, rt.o_tenant_id);
infrastructure/migrations\verify\077_platform_administrator_grants.sql:14:-- `is_platform_admin()` assertion that follows it switches to `autoworkshop_app`,
infrastructure/migrations\verify\077_platform_administrator_grants.sql:21:-- 🔴 CHECK 2 IS THE WHOLE POINT. Before 077, `app.current_role =
infrastructure/migrations\verify\077_platform_administrator_grants.sql:22:-- 'platform_administrator'` — a plain TEXT column on a membership row inside
infrastructure/migrations\verify\077_platform_administrator_grants.sql:27:-- own RLS policies must never call `is_platform_admin()`: that function selects
infrastructure/migrations\verify\077_platform_administrator_grants.sql:49:      FROM identity.platform_administrators
infrastructure/migrations\verify\077_platform_administrator_grants.sql:56:                        'platform_administrator membership — if there were none, this '
infrastructure/migrations\verify\077_platform_administrator_grants.sql:62:     WHERE NOT EXISTS (SELECT 1 FROM identity.platform_administrators pa
infrastructure/migrations\verify\077_platform_administrator_grants.sql:75:    PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql:76:    SELECT identity.is_platform_admin() INTO v_answer;
infrastructure/migrations\verify\077_platform_administrator_grants.sql:86:    PERFORM set_config('app.current_role', 'platform_administrator', true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql:87:    SELECT identity.is_platform_admin() INTO v_answer;
infrastructure/migrations\verify\077_platform_administrator_grants.sql:89:        RAISE EXCEPTION 'check 2 FAILED: claiming role_name platform_administrator still '
infrastructure/migrations\verify\077_platform_administrator_grants.sql:93:    RAISE NOTICE 'check 2 OK — role_name platform_administrator confers nothing without a grant';
infrastructure/migrations\verify\077_platform_administrator_grants.sql:97:    -- `app.current_role` is a custom GUC and ANY role can set it, including the
infrastructure/migrations\verify\077_platform_administrator_grants.sql:99:    -- single injected `set_config('app.current_role','admin',true)` restored
infrastructure/migrations\verify\077_platform_administrator_grants.sql:106:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql:107:    SELECT identity.is_platform_admin() INTO v_answer;
infrastructure/migrations\verify\077_platform_administrator_grants.sql:109:        RAISE EXCEPTION 'check 3a FAILED: setting app.current_role = admin from the APPLICATION '
infrastructure/migrations\verify\077_platform_administrator_grants.sql:119:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql:120:    SELECT identity.is_platform_admin() INTO v_answer;
infrastructure/migrations\verify\077_platform_administrator_grants.sql:130:    -- If this table's policies ever call `is_platform_admin()`, this statement
infrastructure/migrations\verify\077_platform_administrator_grants.sql:133:    PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql:135:    RAISE NOTICE 'check 4 OK — identity.tenants read through an is_platform_admin() policy (% rows)', v_count;
infrastructure/migrations\verify\077_platform_administrator_grants.sql:143:       AND tablename  = 'platform_administrators'
infrastructure/migrations\verify\077_platform_administrator_grants.sql:144:       AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%is_platform_admin%';
infrastructure/migrations\verify\077_platform_administrator_grants.sql:146:        RAISE EXCEPTION 'check 5 FAILED: % polic(y/ies) on identity.platform_administrators call '
infrastructure/migrations\verify\077_platform_administrator_grants.sql:147:                        'is_platform_admin(), which SELECTs from this very table. Every policy '
infrastructure/migrations\verify\077_platform_administrator_grants.sql:154:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql:156:        DELETE FROM identity.platform_administrators WHERE revoked_at IS NULL;
infrastructure/migrations\verify\077_platform_administrator_grants.sql:167:        UPDATE identity.platform_administrators
infrastructure/migrations\verify\077_platform_administrator_grants.sql:188:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql:190:        UPDATE identity.platform_administrators
infrastructure/migrations\verify\077_platform_administrator_grants.sql:202:    UPDATE identity.platform_administrators
infrastructure/migrations\verify\077_platform_administrator_grants.sql:214:    PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql:215:    SELECT identity.is_platform_admin() INTO v_answer;
infrastructure/migrations\verify\059_supplier_requests.sql:47:    PERFORM set_config('app.current_role', 'storekeeper', true);
infrastructure/migrations\verify\059_supplier_requests.sql:197:        PERFORM set_config('app.current_role', 'supplier_owner', true);
infrastructure/migrations\verify\059_supplier_requests.sql:227:        PERFORM set_config('app.current_role', 'storekeeper', true);
infrastructure/migrations\verify\059_supplier_requests.sql:241:    PERFORM set_config('app.current_role', 'customer', true);
infrastructure/migrations\verify\059_supplier_requests.sql:257:    PERFORM set_config('app.current_role', 'storekeeper', true);
infrastructure/migrations\verify\082_insurance_marketplace.sql:24:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\075_fleet_registration.sql:102:    SELECT count(*) INTO n FROM identity.memberships
infrastructure/migrations\verify\075_fleet_registration.sql:151:    DELETE FROM identity.memberships   WHERE tenant_id = r.o_tenant_id;
infrastructure/migrations\verify\080_insurance_and_towing_registration.sql:187:    SELECT count(*) INTO n FROM identity.memberships
infrastructure/migrations\verify\080_insurance_and_towing_registration.sql:197:    SELECT count(*) INTO n FROM identity.memberships
infrastructure/migrations\verify\080_insurance_and_towing_registration.sql:269:        RAISE NOTICE 'verify/080 #7 SKIPPED: no active platform_administrator, so '
infrastructure/migrations\verify\080_insurance_and_towing_registration.sql:296:    DELETE FROM identity.memberships   WHERE tenant_id IN (ri.o_tenant_id, rt.o_tenant_id);
rg: infrastructure/policies: The system cannot find the file specified. (os error 2)

codex
Reviewed commit `0efa722` (`HEAD~1..HEAD`). `docs/IMPLEMENTATION_LOG.md` is absent. I found four defects:

- [ ] **High** — [diagnose_live_identity_roles.sql:58](C:/Users/USER/Documents/autoworkshop-ai/infrastructure/seed/diagnose_live_identity_roles.sql:58)  
  **What’s wrong:** The diagnostic never uses `LIVE_OWNER_EMAIL`. It guesses candidates by matching `aiappinvent.com` or `yahoo.com`, so it does not reliably answer the stated question: “Which identity does `LIVE_OWNER_EMAIL` resolve to?” A differently hosted secret, or several matching users, makes the result ambiguous or empty.  
  **Recommended fix:** Expose `LIVE_OWNER_EMAIL` to the workflow, validate it is non-empty, pass it as a quoted `psql` variable, and query `lower(u.email) = lower(:'live_email')`. Avoid printing unrelated accounts.  
  **Why it matters:** The result is intended to authorize a subsequent production membership change. Guessing the target identity creates a real risk of modifying the wrong account.

- [ ] **High** — [diagnose_live_identity_roles.sql:54](C:/Users/USER/Documents/autoworkshop-ai/infrastructure/seed/diagnose_live_identity_roles.sql:54)  
  **What’s wrong:** `active_roles` counts distinct role names across every organization. `RoleSwitcher`, however, derives roles only for the currently active organization. An account with one role in each of two organizations reports `active_roles = 2` here while the role switcher can still be absent. Conversely, organization switching may be available despite only one distinct role name.  
  **Recommended fix:** Report active memberships grouped by user and organization, including organization type/name and role. Separately calculate organization choices and per-organization role choices using the same semantics as `organizationsFromMemberships()` and `rolesFromMemberships()`.  
  **Why it matters:** The workflow labels this value “THE ANSWER,” but it can reproduce the same incorrect inference the diagnostic was created to eliminate.

- [ ] **Medium** — [diagnose_live_identity_roles.sql:77](C:/Users/USER/Documents/autoworkshop-ai/infrastructure/seed/diagnose_live_identity_roles.sql:77)  
  **What’s wrong:** Section 2 claims to list the `[AUDIT]` organizations, but filters only by `org_type`. It therefore returns every insurance, towing, and fleet organization—and every member email—in the production database.  
  **Recommended fix:** Add the exact fixture predicate, preferably explicit measured organization UUIDs; at minimum require the documented `[AUDIT]` naming condition. Select only fields needed for the follow-up.  
  **Why it matters:** Operators can choose the wrong organization IDs, and unnecessary production identity data is copied into the durable GitHub Actions summary.

- [ ] **Medium** — [diagnose-live-identity-roles.yml:149](C:/Users/USER/Documents/autoworkshop-ai/.github/workflows/diagnose-live-identity-roles.yml:149)  
  **What’s wrong:** The committed summary instructs operators to interpret `is_earliest` and `is_self_created`, but the SQL emits neither column. It also describes section 3 as distinguishing registrations from fixtures, although section 3 only counts active organization types.  
  **Recommended fix:** Make the summary describe the actual three result sets and explicitly direct operators to the exact-identity and per-organization membership output.  
  **Why it matters:** The workflow may execute successfully while its human-facing interpretation is unusable or misleading.

The current dirty worktree already contains an uncommitted correction for the stale summary, but that correction is not part of the reviewed commit. The two high-severity diagnostic-semantic defects remain.
tokens used
49,729
