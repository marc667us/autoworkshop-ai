# Review: codex-review

_Generated: 2026-08-04T07:28:53-07:00 · backend: codex · model: llama3.2_

## Prompt

> You are Codex acting as Independent Pair Programmer for this repository. Review the latest implementation against the stated requirement in README.md and (if present) docs/IMPLEMENTATION_LOG.md. Identify anything Claude Code missed, misunderstood, or only partially implemented. Return a checklist of defects with: severity (critical/high/medium/low), file:line, what's wrong, recommended fix, why it matters.

## Repository context

### Changed files (HEAD~1..HEAD)
```
 .claude/CURRENT_PHASE.md           |  12 ++-
 .claude/CURRENT_TASK.md            | 157 +++++++++++++++----------------------
 .claude/NEXT_SESSION_START_HERE.md |  64 +++++++++++++++
 3 files changed, 139 insertions(+), 94 deletions(-)
```

### Diff snippet (first 500 lines)
```diff
diff --git a/.claude/CURRENT_PHASE.md b/.claude/CURRENT_PHASE.md
index 31321d1..348bc75 100644
--- a/.claude/CURRENT_PHASE.md
+++ b/.claude/CURRENT_PHASE.md
@@ -1,6 +1,16 @@
 # Current phase
 
-**▶ PHASE 5 — Workshop + Repair · Release 0.4 · IN PROGRESS** as of 2026-07-28.
+**▶ PHASE 5 — Workshop + Repair · Release 0.4 · IN PROGRESS.**
+
+**2026-08-04:** the TECHNICIAN chain is structurally COMPLETE — 21/21 screens
+verified reachable in a browser as a technician, from "assigned to me" through
+inspection, diagnosis, planning, execution and testing to quality control. The
+21 §49 entries still on the placeholder are Phase 9 knowledge libraries and
+Phase 6 parts depot; none blocks a job reaching QC.
+
+The CUSTOMER journey is complete end to end and its decision point now works:
+report a problem → track it → **approve the proposal in-app** → collect → read
+the service history. 19/19 in a browser. Customer menu coverage 5/35 → 10/35.
 
 Slice 1 shipped: `repair.job_cards` (migration 006), the 19 stages of
 `1.txt` §322-§360 plus `on_hold`, per-organization job numbers, and three access
diff --git a/.claude/CURRENT_TASK.md b/.claude/CURRENT_TASK.md
index a4045aa..58e5a8a 100644
--- a/.claude/CURRENT_TASK.md
+++ b/.claude/CURRENT_TASK.md
@@ -1,111 +1,82 @@
 # Current task
 
-## ▶ START HERE — ONE BLOCKER, AND IT IS UNDERSTOOD
+## ▶ START HERE — ONE BLOCKER, AND ONLY THE OWNER CAN CLEAR IT
 
-`POST /api/v1/registration/workshop` returns **500** on production. Everything
-either side of it works. Diagnosed to the exact line by
-`.github/workflows/diagnose-registration-500.yml` (run it again any time — it
-rehearses against the live database inside a transaction that ROLLS BACK, so it
-creates nothing):
+Migration **037 is written, verified 13/13 and pushed**. Applying it to
+production is classifier-blocked for the assistant, so the owner runs:
 
 ```
-Render log : new row violates row-level security policy for table "tenants"
-rehearsal  : permission denied to set role "autoworkshop_app"
+! C:\Users\USER\bin\gh.exe workflow run apply-migrations.yml -f confirm=APPLY --repo marc667us/autoworkshop-ai
 ```
 
-### 🔴 THE CAUSE, AND WHY NO LOCAL TEST COULD EVER HAVE SEEN IT
+Until then `POST /registration/workshop` still 500s live and **no workshop can
+be created**. Afterwards: sign in at `autoworkshop.aiappinvent.com`, create the
+workshop through the form (not by INSERT), then re-run `Seed live catalogue` so
+the mechanic directory stops reading 0.
 
-**Render's `autoworkshop` database user is NOT a superuser. Locally it is.**
+### WHY 037, IN ONE PARAGRAPH
 
-`identity.register_workshop` is `SECURITY DEFINER` and owned by `autoworkshop`.
-A superuser bypasses row-level security entirely, so locally the function's four
-INSERTs sail through. On Render the same user is merely the table owner, and
-`FORCE ROW LEVEL SECURITY` applies to owners — so the first INSERT is refused.
+`identity.register_workshop` is SECURITY DEFINER owned by `autoworkshop`.
+Locally that user is a SUPERUSER and bypasses RLS; on Render it is merely the
+table owner, and `FORCE ROW LEVEL SECURITY` applies to owners. Same function,
+different role — which is why `verify/036` passed 9/9 against a defect that
+existed only in production. 037 opens a narrow, auditable bootstrap door keyed
+on two transaction-local settings and pinned to the registering user, and closes
+it before returning. It also gives `identity.memberships` a narrow SELECT policy,
+because the one-workshop-per-person guard was a SELECT on a FORCE-RLS table with
+no tenant context and **had never been able to fire**.
 
-The function is byte-identical in both places. **The ROLE is not.** `verify/036`
-passed 9 of 9 locally against a defect that exists only in production, which is
-why this file says: for anything touching RLS, **rehearse ON LIVE**.
-
-### THE FIX — MIGRATION 037, NOT AN EDIT TO 036
-
-036 is applied and checksummed in both databases. Fixes go in the next number.
-
-**Preferred shape** — a controlled, auditable bypass scoped to this one
-function:
-
-1. `register_workshop` does `SET LOCAL app.bootstrap = 'on'` as its first
-   statement.
-2. Migration 037 adds a permissive **INSERT** policy to `identity.tenants`,
-   `identity.organizations`, `identity.branches` and `identity.memberships`:
-   `WITH CHECK (current_setting('app.bootstrap', true) = 'on')`.
-
-⚠️ **Do NOT weaken the existing policies generally.** The bypass must be
-reachable only from inside this function, and only for INSERT. Registration is
-the one operation that legitimately has no tenant context — it is what CREATES
-the tenant.
-
-⚠️ **Rejected alternative:** a `BYPASSRLS` role to own the function. Creating
-one needs privileges Render's user probably lacks, and it would move the bypass
-somewhere far less visible than a policy named in a migration.
-
-**Verify with:** `Diagnose registration 500` (must show the four ids returned,
-then roll back), then `apply-migrations.yml` with `confirm=APPLY`, then the real
-thing — sign in at `autoworkshop.aiappinvent.com` and create the workshop.
-
-### THEN: FINISH THE SEED
-
-The owner's application user EXISTS on live (`marc667us@yahoo.com`, provisioned
-2026-08-03) and holds **no membership**. Once 037 is applied, signing in and
-using the "create your workshop" form on `/home/dashboard` completes it. Nothing
-needs to be inserted by hand.
+`verify/037` re-owns the function to a non-superuser inside the transaction —
+the only way this defect class is reproducible locally — and REFUSES to run if
+the owner is still a superuser.
 
 ---
 
-## ✅ DONE 2026-08-03 pt3
-
-### The public landing is live on the apex, with NO DNS change
-
-Learned by reading Solar: **one service, 421 routes, 88 public**, and `/` renders
-the landing for everyone — signed in or not, no redirect. No second service means
-nothing for a CNAME to point at differently, which is why Solar never needed a
-Namecheap change.
+## ✅ DONE 2026-08-04
 
-The seven-app decision stands, so the public surface became
-**`packages/marketplace-ui`** and `workshop-web` — which already owns the apex —
-mounts it at `/`. `AddToBasket` is a render prop, so the package depends on no
-app.
+**Both workflows finished and driven in a browser as the right role:**
 
-### 🔴 The audience defect: every authenticated call was refused
-
-```
-aud: account
-"token rejected: jwt audience invalid. expected: autoworkshop-api"
-```
-
-**No audience mapper existed anywhere in the realm.** The API refused every
-authenticated request from every web app while public routes worked — so the
-site looked alive and said "Not signed in" beside a working "Sign out". That
-symptom was misread three times across two sessions.
-
-Fixed on 7 clients in `realm-autoworkshop.json` **and applied to the live realm
-directly**, because `deploy-keycloak.yml` imports the realm on FIRST BOOT ONLY.
-
-### VIN funnel
-
-Offline ISO 3779 decode is the primary (no key, no cost, instant); NHTSA vPIC
-enriches when reachable. `/public/vin/:vin` is free, `/vin/:vin` needs a session.
-**The gate is the API sending less, never the page hiding fields** — and the
-deploy asserts it: if the public endpoint ever returns `detail`, `plantCode` or
-`serial`, the deploy fails.
-
-### Defects only a browser found
-
-A form with **no submit button** (three green gates missed it) · "Not signed in"
-beside "Sign out" in customer-web, permanently, for every customer · onboarding
-replacing the **public** landing · a middleware fix that passed typecheck, lint
-and build then crashed the edge runtime with `Cannot redefine property:
-__import_unsupported` · a leak check that reported two **false** leaks by
-searching the whole page instead of the VIN section.
+| suite | result |
+|---|---|
+| `verify-technician-workflow.mjs` | 21/21 screens · 24/24 checks |
+| `verify-customer-workflow.mjs` | 11/11 screens · 19/19 checks, twice running |
+
+⚠️ The customer suite **CONSUMES its fixture**. Run
+`bash scripts/seed-customer-proposal-fixture.sh` before each verification, or
+the approval path is skipped — and it now FAILS rather than passing quietly when
+no answerable proposal exists (`ALLOW_EMPTY_CUSTOMER_PROPOSALS=1` to opt out).
+
+**The customer can now approve their own repair.** `POST
+/proposals/:id/customer-decision` — a separate route from the staff one, because
+`decidedByName`, `decisionChannel` and `recorded_by` stop being inputs and are
+derived. The role admits the read; a `c.user_id` predicate scopes it.
+
+**Keycloak's `error=Configuration`** is replaced by an honest "starting up"
+screen with one bounded retry, at `/auth/error` in all seven apps.
+⚠️ A 24/7 keep-warm was REJECTED on arithmetic: four free services share one
+750-hour allowance and a month is ~730 hours. `keep-warm.yml` is windowed.
+
+### 🔴 THREE GATES WERE NOT GATES
+
+- **Codex had never run on a real diff** — prompt passed as argv,
+  `Argument list too long` — **and the runner exited 0 when it failed.**
+- **Package vitest configs collected only `*.test.ts`** while `apps/api` uses
+  `*.spec.ts`; a misnamed file was silently never collected.
+
+Ask of any gate: *would its not-running look different from its passing?*
+
+### 🔴 AND THINGS THAT LOOKED FINE AND WERE NOT
+
+- `decidable` was still computed from the STAFF role set, so the customer
+  approval form **rendered nothing** while the service and all ten of its tests
+  passed. Test what the VIEWER is told they may do, not only what the service does.
+- Both decision routes accepted a **superseded** proposal by direct POST.
+  `decidable` hides it; hiding is not refusing.
+- The technician dashboard told a signed-in technician **nobody was signed in**,
+  then my first fix read `currentViewer() !== null`, which is null when `/me`
+  FAILS. It reads `viewerHasSession` now.
+- After approving, the screen still said "contact the workshop to approve" —
+  recording a decision does not move the job card; that is staff's action.
 
 ---
 
diff --git a/.claude/NEXT_SESSION_START_HERE.md b/.claude/NEXT_SESSION_START_HERE.md
index 38b7a08..dba51ee 100644
--- a/.claude/NEXT_SESSION_START_HERE.md
+++ b/.claude/NEXT_SESSION_START_HERE.md
@@ -6,6 +6,70 @@ bash scripts/start-session.sh
 
 ---
 
+## SESSION CLOSE 2026-08-04 — BOTH WORKFLOWS FINISHED
+
+**Tip `59e3838`, pushed, tree clean.** Seven commits.
+
+### ▶ THE ONE THING ONLY THE OWNER CAN DO
+
+```
+! C:\Users\USER\bin\gh.exe workflow run apply-migrations.yml -f confirm=APPLY --repo marc667us/autoworkshop-ai
+```
+
+Migration **037** is written, committed and verified **13/13** locally under
+production privileges — and proven to FAIL with the exact live error before it.
+Until it is applied, `POST /registration/workshop` still 500s and no workshop
+can be created live. Detail in `.claude/CURRENT_TASK.md`.
+
+### WHAT SHIPPED
+
+- **Technician workflow 21/21**, **customer 19/19**, both driven in a real
+  browser as the role whose tree owns the routes.
+- **A customer can approve their own repair** — new
+  `POST /proposals/:id/customer-decision`, with the consent fields DERIVED
+  rather than accepted.
+- **Keycloak's `error=Configuration`** replaced by an honest "starting up"
+  screen in all seven apps.
+- **Landing cards on Solar's scale** (12px radius, 24px padding).
+
+### ⚠️ RUNNING THE VERIFICATIONS
+
+```bash
+bash scripts/seed-customer-proposal-fixture.sh   # the customer run CONSUMES it
+cd apps/e2e
+node verify/verify-technician-workflow.mjs
+node verify/verify-customer-workflow.mjs
+```
+
+The customer suite now **FAILS** rather than passing quietly when there is no
+answerable proposal, because the whole approve path sits behind that condition.
+
+### 🔴 THE LESSON OF THE DAY, IN ONE LINE
+
+**Ask of any gate: would its not-running look different from its passing?**
+Codex had never run on a real diff (prompt passed as argv → `Argument list too
+long`) *and exited 0 when it failed*. Package vitest configs collected only
+`*.test.ts` while `apps/api` uses `*.spec.ts`. Both fixed.
+
+And its sibling: **hiding is not refusing.** `decidable` hid superseded
+proposals from the screen while both write routes still accepted them by POST.
+
+### Local stack at close
+
+Everything on **plain `localhost`** — API 4000, workshop-web 3001,
+customer-web 3000, Keycloak 8080. Sign in as
+`technician@autoworkshop.local` / `customer@autoworkshop.local`,
+password `Change_me_locally1!`.
+
+⚠️ `scripts/start-local.sh` **HUNG at its `kcadm` step** this session. It was
+bypassed by starting each process with `KEYCLOAK_URL=http://localhost:8080`,
+which keeps the issuer matching `.env` and works because the realm's dev clients
+already allow `http://localhost:<port>/*`. Worth fixing before relying on it.
+
+⚠️ Servers were left RUNNING.
+
+---
+
 ## SESSION CLOSE 2026-08-03 - THE LIVE SITE CAN NOW BE SIGNED INTO
 
 **Tip `386ac55`, pushed, tree clean.** Six commits.
```

## Findings

Checklist of defects found:

- [ ] **High** — [infrastructure/migrations/037_registration_rls_bootstrap.sql](/c:/Users/USER/Documents/autoworkshop-ai/infrastructure/migrations/037_registration_rls_bootstrap.sql:88)  
  **What’s wrong:** The RLS bootstrap policies trust mutable custom GUCs: `app.bootstrap` and `app.bootstrap_user`. `autoworkshop_app` already has broad DML on `identity` tables from [002_application_role.sql](/c:/Users/USER/Documents/autoworkshop-ai/infrastructure/migrations/002_application_role.sql:48), so any SQL execution path as the app role can `SET app.bootstrap='on'` and satisfy these policies directly.  
  **Recommended fix:** Add a non-spoofable predicate, e.g. require the SECURITY DEFINER owner via `current_user = 'autoworkshop'`, or redesign so direct app-role table DML cannot use the bootstrap path. Add a verify case that, as `autoworkshop_app`, explicitly sets both GUCs and proves direct INSERT/SELECT is still refused.  
  **Why it matters:** README says RLS is enforced in infrastructure, not policy text. This makes the new “narrow bootstrap door” wider than documented.

- [ ] **High** — [.claude/CURRENT_TASK.md](/c:/Users/USER/Documents/autoworkshop-ai/.claude/CURRENT_TASK.md:12)  
  **What’s wrong:** The repo is on `master`, README says `master` is production-ready, but the control file says live workshop registration still 500s and no workshop can be created.  
  **Recommended fix:** Either do not land this state on `master`, or update README/release status to explicitly mark production as blocked until migration 037 is applied.  
  **Why it matters:** Operators and reviewers will treat `master` as deployable while a primary production signup path is knowingly broken.

- [ ] **Medium** — [README.md](/c:/Users/USER/Documents/autoworkshop-ai/README.md:5)  
  **What’s wrong:** README still says `Phase 1 — Release 0.1 (foundation)`, while [.claude/CURRENT_PHASE.md](/c:/Users/USER/Documents/autoworkshop-ai/.claude/CURRENT_PHASE.md:3) says `PHASE 5 — Release 0.4`.  
  **Recommended fix:** Update README status or make `.claude/CURRENT_PHASE.md` clearly subordinate/non-release-truth.  
  **Why it matters:** The stated requirement baseline is ambiguous, so future review can target the wrong acceptance criteria.

- [ ] **Medium** — [.claude/NEXT_SESSION_START_HERE.md](/c:/Users/USER/Documents/autoworkshop-ai/.claude/NEXT_SESSION_START_HERE.md:11)  
  **What’s wrong:** It claims tip `59e3838`, pushed, tree clean, but latest commit shown by `git show` is `80ede42`; current worktree also shows `M reviews/codex-review.md`.  
  **Recommended fix:** Replace the stale tip/tree-clean statement with the actual HEAD and current dirty-state note.  
  **Why it matters:** The next session starts from a false baseline and may skip reviewing uncommitted work.

- [ ] **Medium** — [.claude/CURRENT_PHASE.md](/c:/Users/USER/Documents/autoworkshop-ai/.claude/CURRENT_PHASE.md:11)  
  **What’s wrong:** Customer workflow count is inconsistent: this file says “19/19 in a browser”, [.claude/CURRENT_TASK.md](/c:/Users/USER/Documents/autoworkshop-ai/.claude/CURRENT_TASK.md:42) says `11/11 screens · 19/19 checks`, and [.claude/NEXT_SESSION_START_HERE.md](/c:/Users/USER/Documents/autoworkshop-ai/.claude/NEXT_SESSION_START_HERE.md:26) says `customer 19/19`.  
  **Recommended fix:** Standardize wording as either screens or checks everywhere.  
  **Why it matters:** These docs are being used as gates; mixing screen count and check count makes skipped coverage easier to miss.

- [ ] **Low** — [.claude/CURRENT_TASK.md](/c:/Users/USER/Documents/autoworkshop-ai/.claude/CURRENT_TASK.md:59)  
  **What’s wrong:** Heading says “THREE GATES WERE NOT GATES”, but only two bullets are listed; later line 116 refers to “four gates”.  
  **Recommended fix:** Name all gates consistently and state which were fixed versus still manual/unrun.  
  **Why it matters:** Gate failures are the main lesson recorded here; imprecise accounting weakens the handoff.
rkshop`.
+Locally that user is a SUPERUSER and bypasses RLS; on Render it is merely the
+table owner, and `FORCE ROW LEVEL SECURITY` applies to owners. Same function,
+different role — which is why `verify/036` passed 9/9 against a defect that
+existed only in production. 037 opens a narrow, auditable bootstrap door keyed
+on two transaction-local settings and pinned to the registering user, and closes
+it before returning. It also gives `identity.memberships` a narrow SELECT policy,
+because the one-workshop-per-person guard was a SELECT on a FORCE-RLS table with
+no tenant context and **had never been able to fire**.
 
-The function is byte-identical in both places. **The ROLE is not.** `verify/036`
-passed 9 of 9 locally against a defect that exists only in production, which is
-why this file says: for anything touching RLS, **rehearse ON LIVE**.
-
-### THE FIX — MIGRATION 037, NOT AN EDIT TO 036
-
-036 is applied and checksummed in both databases. Fixes go in the next number.
-
-**Preferred shape** — a controlled, auditable bypass scoped to this one
-function:
-
-1. `register_workshop` does `SET LOCAL app.bootstrap = 'on'` as its first
-   statement.
-2. Migration 037 adds a permissive **INSERT** policy to `identity.tenants`,
-   `identity.organizations`, `identity.branches` and `identity.memberships`:
-   `WITH CHECK (current_setting('app.bootstrap', true) = 'on')`.
-
-⚠️ **Do NOT weaken the existing policies generally.** The bypass must be
-reachable only from inside this function, and only for INSERT. Registration is
-the one operation that legitimately has no tenant context — it is what CREATES
-the tenant.
-
-⚠️ **Rejected alternative:** a `BYPASSRLS` role to own the function. Creating
-one needs privileges Render's user probably lacks, and it would move the bypass
-somewhere far less visible than a policy named in a migration.
-
-**Verify with:** `Diagnose registration 500` (must show the four ids returned,
-then roll back), then `apply-migrations.yml` with `confirm=APPLY`, then the real
-thing — sign in at `autoworkshop.aiappinvent.com` and create the workshop.
-
-### THEN: FINISH THE SEED
-
-The owner's application user EXISTS on live (`marc667us@yahoo.com`, provisioned
-2026-08-03) and holds **no membership**. Once 037 is applied, signing in and
-using the "create your workshop" form on `/home/dashboard` completes it. Nothing
-needs to be inserted by hand.
+`verify/037` re-owns the function to a non-superuser inside the transaction —
+the only way this defect class is reproducible locally — and REFUSES to run if
+the owner is still a superuser.
 
 ---
 
-## ✅ DONE 2026-08-03 pt3
-
-### The public landing is live on the apex, with NO DNS change
-
-Learned by reading Solar: **one service, 421 routes, 88 public**, and `/` renders
-the landing for everyone — signed in or not, no redirect. No second service means
-nothing for a CNAME to point at differently, which is why Solar never needed a
-Namecheap change.
+## ✅ DONE 2026-08-04
 
-The seven-app decision stands, so the public surface became
-**`packages/marketplace-ui`** and `workshop-web` — which already owns the apex —
-mounts it at `/`. `AddToBasket` is a render prop, so the package depends on no
-app.
+**Both workflows finished and driven in a browser as the right role:**
 
-### 🔴 The audience defect: every authenticated call was refused
-
-```
-aud: account
-"token rejected: jwt audience invalid. expected: autoworkshop-api"
-```
-
-**No audience mapper existed anywhere in the realm.** The API refused every
-authenticated request from every web app while public routes worked — so the
-site looked alive and said "Not signed in" beside a working "Sign out". That
-symptom was misread three times across two sessions.
-
-Fixed on 7 clients in `realm-autoworkshop.json` **and applied to the live realm
-directly**, because `deploy-keycloak.yml` imports the realm on FIRST BOOT ONLY.
-
-### VIN funnel
-
-Offline ISO 3779 decode is the primary (no key, no cost, instant); NHTSA vPIC
-enriches when reachable. `/public/vin/:vin` is free, `/vin/:vin` needs a session.
-**The gate is the API sending less, never the page hiding fields** — and the
-deploy asserts it: if the public endpoint ever returns `detail`, `plantCode` or
-`serial`, the deploy fails.
-
-### Defects only a browser found
-
-A form with **no submit button** (three green gates missed it) · "Not signed in"
-beside "Sign out" in customer-web, permanently, for every customer · onboarding
-replacing the **public** landing · a middleware fix that passed typecheck, lint
-and build then crashed the edge runtime with `Cannot redefine property:
-__import_unsupported` · a leak check that reported two **false** leaks by
-searching the whole page instead of the VIN section.
+| suite | result |
+|---|---|
+| `verify-technician-workflow.mjs` | 21/21 screens · 24/24 checks |
+| `verify-customer-workflow.mjs` | 11/11 screens · 19/19 checks, twice running |
+
+⚠️ The customer suite **CONSUMES its fixture**. Run
+`bash scripts/seed-customer-proposal-fixture.sh` before each verification, or
+the approval path is skipped — and it now FAILS rather than passing quietly when
+no answerable proposal exists (`ALLOW_EMPTY_CUSTOMER_PROPOSALS=1` to opt out).
+
+**The customer can now approve their own repair.** `POST
+/proposals/:id/customer-decision` — a separate route from the staff one, because
+`decidedByName`, `decisionChannel` and `recorded_by` stop being inputs and are
+derived. The role admits the read; a `c.user_id` predicate scopes it.
+
+**Keycloak's `error=Configuration`** is replaced by an honest "starting up"
+screen with one bounded retry, at `/auth/error` in all seven apps.
+⚠️ A 24/7 keep-warm was REJECTED on arithmetic: four free services share one
+750-hour allowance and a month is ~730 hours. `keep-warm.yml` is windowed.
+
+### 🔴 THREE GATES WERE NOT GATES
+
+- **Codex had never run on a real diff** — prompt passed as argv,
+  `Argument list too long` — **and the runner exited 0 when it failed.**
+- **Package vitest configs collected only `*.test.ts`** while `apps/api` uses
+  `*.spec.ts`; a misnamed file was silently never collected.
+
+Ask of any gate: *would its not-running look different from its passing?*
+
+### 🔴 AND THINGS THAT LOOKED FINE AND WERE NOT
+
+- `decidable` was still computed from the STAFF role set, so the customer
+  approval form **rendered nothing** while the service and all ten of its tests
+  passed. Test what the VIEWER is told they may do, not only what the service does.
+- Both decision routes accepted a **superseded** proposal by direct POST.
+  `decidable` hides it; hiding is not refusing.
+- The technician dashboard told a signed-in technician **nobody was signed in**,
+  then my first fix read `currentViewer() !== null`, which is null when `/me`
+  FAILS. It reads `viewerHasSession` now.
+- After approving, the screen still said "contact the workshop to approve" —
+  recording a decision does not move the job card; that is staff's action.
 
 ---
 
diff --git a/.claude/NEXT_SESSION_START_HERE.md b/.claude/NEXT_SESSION_START_HERE.md
index 38b7a08..dba51ee 100644
--- a/.claude/NEXT_SESSION_START_HERE.md
+++ b/.claude/NEXT_SESSION_START_HERE.md
@@ -6,6 +6,70 @@ bash scripts/start-session.sh
 
 ---
 
+## SESSION CLOSE 2026-08-04 — BOTH WORKFLOWS FINISHED
+
+**Tip `59e3838`, pushed, tree clean.** Seven commits.
+
+### ▶ THE ONE THING ONLY THE OWNER CAN DO
+
+```
+! C:\Users\USER\bin\gh.exe workflow run apply-migrations.yml -f confirm=APPLY --repo marc667us/autoworkshop-ai
+```
+
+Migration **037** is written, committed and verified **13/13** locally under
+production privileges — and proven to FAIL with the exact live error before it.
+Until it is applied, `POST /registration/workshop` still 500s and no workshop
+can be created live. Detail in `.claude/CURRENT_TASK.md`.
+
+### WHAT SHIPPED
+
+- **Technician workflow 21/21**, **customer 19/19**, both driven in a real
+  browser as the role whose tree owns the routes.
+- **A customer can approve their own repair** — new
+  `POST /proposals/:id/customer-decision`, with the consent fields DERIVED
+  rather than accepted.
+- **Keycloak's `error=Configuration`** replaced by an honest "starting up"
+  screen in all seven apps.
+- **Landing cards on Solar's scale** (12px radius, 24px padding).
+
+### ⚠️ RUNNING THE VERIFICATIONS
+
+```bash
+bash scripts/seed-customer-proposal-fixture.sh   # the customer run CONSUMES it
+cd apps/e2e
+node verify/verify-technician-workflow.mjs
+node verify/verify-customer-workflow.mjs
+```
+
+The customer suite now **FAILS** rather than passing quietly when there is no
+answerable proposal, because the whole approve path sits behind that condition.
+
+### 🔴 THE LESSON OF THE DAY, IN ONE LINE
+
+**Ask of any gate: would its not-running look different from its passing?**
+Codex had never run on a real diff (prompt passed as argv → `Argument list too
+long`) *and exited 0 when it failed*. Package vitest configs collected only
+`*.test.ts` while `apps/api` uses `*.spec.ts`. Both fixed.
+
+And its sibling: **hiding is not refusing.** `decidable` hid superseded
+proposals from the screen while both write routes still accepted them by POST.
+
+### Local stack at close
+
+Everything on **plain `localhost`** — API 4000, workshop-web 3001,
+customer-web 3000, Keycloak 8080. Sign in as
+`technician@autoworkshop.local` / `customer@autoworkshop.local`,
+password `Change_me_locally1!`.
+
+⚠️ `scripts/start-local.sh` **HUNG at its `kcadm` step** this session. It was
+bypassed by starting each process with `KEYCLOAK_URL=http://localhost:8080`,
+which keeps the issuer matching `.env` and works because the realm's dev clients
+already allow `http://localhost:<port>/*`. Worth fixing before relying on it.
+
+⚠️ Servers were left RUNNING.
+
+---
+
 ## SESSION CLOSE 2026-08-03 - THE LIVE SITE CAN NOW BE SIGNED INTO
 
 **Tip `386ac55`, pushed, tree clean.** Six commits.
```
codex
I’ll review this as a code-review pass against the repo requirements, focusing on whether the changed session/task docs accurately reflect README and implementation-log state. I’ll read the requirements first, then inspect the latest commit and referenced files/paths enough to identify concrete defects with line numbers.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "git show --stat --oneline HEAD; git show --name-only --format='' HEAD" in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'if (Test-Path docs/IMPLEMENTATION_LOG.md) { Get-Content -Path docs/IMPLEMENTATION_LOG.md }' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path README.md' in C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'if (Test-Path docs/IMPLEMENTATION_LOG.md) { Get-Content -Path docs/IMPLEMENTATION_LOG.md }'` rejected: blocked by policy
2026-08-04T14:29:23.398427Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'if (Test-Path docs/IMPLEMENTATION_LOG.md) { Get-Content -Path docs/IMPLEMENTATION_LOG.md }'` rejected: blocked by policy
 succeeded in 617ms:
# AutoWorkshop AI

**The Complete AI-Powered Automotive Service, Repair and Workshop Operating System.**

Live target: [`autoworkshop.aiappinvent.com`](https://autoworkshop.aiappinvent.com) Â· Status: **Phase 1 â€” Release 0.1 (foundation)**

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

 succeeded in 735ms:
80ede42 docs: session close 2026-08-04 — control files record the state, the blocker and the lessons
 .claude/CURRENT_PHASE.md           |  12 ++-
 .claude/CURRENT_TASK.md            | 157 +++++++++++++++----------------------
 .claude/NEXT_SESSION_START_HERE.md |  64 +++++++++++++++
 3 files changed, 139 insertions(+), 94 deletions(-)
.claude/CURRENT_PHASE.md
.claude/CURRENT_TASK.md
.claude/NEXT_SESSION_START_HERE.md

codex
The latest commit is documentation-only in `.claude/*`, so the main risk is stale or over-claimed control-file state versus the repository’s stated Phase 1/foundation baseline and any implementation log. One of the parallel reads was blocked by the sandbox policy syntax, so I’m checking the docs path with simpler read-only commands.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content -Path .claude'"\\CURRENT_PHASE.md | ForEach-Object { "'$i++; '"'{0,4}: {1}' -f "'$i, $_ }' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content -Path .claude'"\\NEXT_SESSION_START_HERE.md | ForEach-Object { "'$i++; '"'{0,4}: {1}' -f "'$i, $_ }' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-ChildItem -Path docs -Filter IMPLEMENTATION_LOG.md' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content -Path .claude'"\\CURRENT_TASK.md | ForEach-Object { "'$i++; '"'{0,4}: {1}' -f "'$i, $_ }' in C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content -Path .claude'"\\CURRENT_PHASE.md | ForEach-Object { "'$i++; '"'{0,4}: {1}' -f "'$i, $_ }'` rejected: blocked by policy
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content -Path .claude'"\\CURRENT_TASK.md | ForEach-Object { "'$i++; '"'{0,4}: {1}' -f "'$i, $_ }'` rejected: blocked by policy
2026-08-04T14:29:40.634551Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content -Path .claude'"\\CURRENT_PHASE.md | ForEach-Object { "'$i++; '"'{0,4}: {1}' -f "'$i, $_ }'` rejected: blocked by policy
2026-08-04T14:29:40.635040Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content -Path .claude'"\\CURRENT_TASK.md | ForEach-Object { "'$i++; '"'{0,4}: {1}' -f "'$i, $_ }'` rejected: blocked by policy
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content -Path .claude'"\\NEXT_SESSION_START_HERE.md | ForEach-Object { "'$i++; '"'{0,4}: {1}' -f "'$i, $_ }'` rejected: blocked by policy
2026-08-04T14:29:40.636442Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content -Path .claude'"\\NEXT_SESSION_START_HERE.md | ForEach-Object { "'$i++; '"'{0,4}: {1}' -f "'$i, $_ }'` rejected: blocked by policy
 succeeded in 819ms:
codex
There is no `docs/IMPLEMENTATION_LOG.md` in this checkout. I’m switching to `rg -n` for line-numbered reads, which avoids the PowerShell constructs the sandbox is blocking.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "''^" .claude/CURRENT_PHASE.md' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "''^" .claude/NEXT_SESSION_START_HERE.md' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "''^" .claude/CURRENT_TASK.md' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "Status:|Phase|Release|foundation|production-ready|zero-cost|Solar|solar" README.md' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 796ms:
1:# Current phase
2:
3:**▶ PHASE 5 — Workshop + Repair · Release 0.4 · IN PROGRESS.**
4:
5:**2026-08-04:** the TECHNICIAN chain is structurally COMPLETE — 21/21 screens
6:verified reachable in a browser as a technician, from "assigned to me" through
7:inspection, diagnosis, planning, execution and testing to quality control. The
8:21 §49 entries still on the placeholder are Phase 9 knowledge libraries and
9:Phase 6 parts depot; none blocks a job reaching QC.
10:
11:The CUSTOMER journey is complete end to end and its decision point now works:
12:report a problem → track it → **approve the proposal in-app** → collect → read
13:the service history. 19/19 in a browser. Customer menu coverage 5/35 → 10/35.
14:
15:Slice 1 shipped: `repair.job_cards` (migration 006), the 19 stages of
16:`1.txt` §322-§360 plus `on_hold`, per-organization job numbers, and three access
17:scopes from one query - staff see the organisation, a technician sees only cards
18:assigned to them, a customer only cards against their own vehicles.
19:
20:**Next: the Repair Staging Board and stage transitions.** A card cannot yet
21:leave `complaint_received`.
22:
23:## Phase 4 - Customer + Vehicle · Release 0.3 · LARGELY COMPLETE
24:
25:Built: registration (customer + vehicle), vehicle garage, customer dashboard,
26:detail pages, complaint submission, and the organisation switcher.
27:
28:Outstanding, each blocked on something ABSENT rather than on time: service
29:history (needs completed jobs), vehicle documents (file storage), maintenance
30:schedule (service-interval rules), appointment request (an appointments table),
31:workshop search (a public organisation directory). **Customer profile is small
32:and buildable now.**
33:
34:---
35:
36:**▶ PHASE 4 — Customer + Vehicle · Release 0.3 · STARTING (not yet begun)**
37:as of 2026-07-28. Phase 3 closed; T-0005 findings 5 and 4 are shut and gated,
38:and the first screen that reads real data shipped
39:() — copy that pattern.
40:Read  first.
41:
42:---
43:
44:## Previous — Phase 3 — Application shell and navigation · Release **0.2** · ✅ COMPLETE (2026-07-27)
45:(Phase 1 / Release 0.1 ✅ complete and tagged `v0.1.0`; Phase 2 identity partially complete —
46:see `TASK_QUEUE.md` for exactly which parts.)
47:
48:Phases 2 and 3 are deliberately interleaved: the owner needed something to look at, and the shell
49:does not depend on the remainder of identity. Where it would have, it reads `viewerGrants()` — one
50:function to replace when the Keycloak session lands.
51:
52:## Objective
53:
54:`01 (1).txt` §2: top navigation bar, collapsible grouped side navigation, breadcrumbs, page headers,
55:tabs, drawers, dialogs, badges and the AI panel — working on desktop, tablet and mobile, across all
56:seven workspaces, from one shared shell.
57:
58:## Deliverables
59:
60:- [x] `packages/navigation` — all 7 workspaces' navigation, from the spec (27 tests)
61:- [x] `packages/next-shell` — one Next adapter for all 7 apps (no per-app copies)
62:- [x] Top navigation bar (§3-§15)
63:- [x] Collapsible grouped side navigation with counters, warnings and search (§16)
64:- [x] Breadcrumbs and page headers, with loading / empty / error states
65:- [x] Tabs, Dialog, Drawer (modal and non-modal), StatusBadge
66:- [x] AI assistant side panel (`02.txt` §8) — discloses action, data used, read-only vs
67:      changes-data, approval requirement, sources
68:- [x] Runtime theming: light / dark / system, no flash of wrong theme
69:- [x] Responsive — mobile overlay nav drawer with focus trap; `prefers-reduced-motion` honoured
70:- [x] Permission-aware visibility, with the router resolving from the same grants as the nav
71:- [x] Storybook story per component (`01 (1).txt` §71) — 77 stories, axe 84/84
72:- [x] Playwright shell journey + axe-core gate — `apps/e2e`, 138 passing
73:- [ ] Workspace / org / branch switchers (blocked on Phase 2 membership data)
74:- [ ] Quick-create, tasks, messages, notifications, help panels (§9-§14)
75:
76:## Acceptance criteria
77:
78:`pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build` all green · every workspace renders its
79:own navigation · no route reachable that the navigation does not advertise to that viewer · no paid
80:dependency.
81:
82:**Status against those (2026-07-27):** typecheck 14/14, lint 14/14, unit tests 64, build 10/10,
83:Playwright 138 passed / 0 failed / 2 legitimate skips. Route/nav agreement verified live and locked by
84:`packages/next-shell/src/viewer.test.ts`; permission gating is now genuinely exercised in 5 of the 7
85:workspaces, having previously skipped in all 7 without anyone noticing.
86:
87:## Next phase
88:
89:Phase 4 — Customer and Vehicle (Release 0.3): registration, profile, vehicle garage, documents,
90:service history, complaint submission, appointment request, workshop search, dashboard.
91:
92:**The gate that used to block Phase 4 is now clear.** T-0008's restore drill was the oldest
93:outstanding Supervisor condition; it is done, drilled 4/4 (RTO 16–106 s, RPO 0) and scheduled
94:(T-0018). Phase 4 is blocked only by the remaining Release 0.2 items below.
95:
96:**Release 0.2 is closed.** T-0014 and T-0015 shipped 2026-07-26; T-0030 — the last item holding it
97:open — closed 2026-07-27 and turned out not to be a product defect at all, but a stale `next start`
98:server feeding the test suite a build that no longer existed on disk. A build-freshness gate now
99:fails the run when that recurs. See `reviews/supervisor-adjudication-t0030-harness.md`.
100:
101:**Still open, and correctly NOT blocking 0.2:** T-0031 (ThemeToggle radiogroup activation), T-0016
102:(switchers, blocked on T-0003 membership data) and T-0017 (quick-create / tasks / messages /
103:notifications / help panels). T-0027 — the navigation model becoming workspace × role per `07.txt`
104:part 2 §46–§50 — lands in Phase 3's scope but blocks Phase 5, so it is the next structural item.

 succeeded in 832ms:
1:# Current task
2:
3:## ▶ START HERE — ONE BLOCKER, AND ONLY THE OWNER CAN CLEAR IT
4:
5:Migration **037 is written, verified 13/13 and pushed**. Applying it to
6:production is classifier-blocked for the assistant, so the owner runs:
7:
8:```
9:! C:\Users\USER\bin\gh.exe workflow run apply-migrations.yml -f confirm=APPLY --repo marc667us/autoworkshop-ai
10:```
11:
12:Until then `POST /registration/workshop` still 500s live and **no workshop can
13:be created**. Afterwards: sign in at `autoworkshop.aiappinvent.com`, create the
14:workshop through the form (not by INSERT), then re-run `Seed live catalogue` so
15:the mechanic directory stops reading 0.
16:
17:### WHY 037, IN ONE PARAGRAPH
18:
19:`identity.register_workshop` is SECURITY DEFINER owned by `autoworkshop`.
20:Locally that user is a SUPERUSER and bypasses RLS; on Render it is merely the
21:table owner, and `FORCE ROW LEVEL SECURITY` applies to owners. Same function,
22:different role — which is why `verify/036` passed 9/9 against a defect that
23:existed only in production. 037 opens a narrow, auditable bootstrap door keyed
24:on two transaction-local settings and pinned to the registering user, and closes
25:it before returning. It also gives `identity.memberships` a narrow SELECT policy,
26:because the one-workshop-per-person guard was a SELECT on a FORCE-RLS table with
27:no tenant context and **had never been able to fire**.
28:
29:`verify/037` re-owns the function to a non-superuser inside the transaction —
30:the only way this defect class is reproducible locally — and REFUSES to run if
31:the owner is still a superuser.
32:
33:---
34:
35:## ✅ DONE 2026-08-04
36:
37:**Both workflows finished and driven in a browser as the right role:**
38:
39:| suite | result |
40:|---|---|
41:| `verify-technician-workflow.mjs` | 21/21 screens · 24/24 checks |
42:| `verify-customer-workflow.mjs` | 11/11 screens · 19/19 checks, twice running |
43:
44:⚠️ The customer suite **CONSUMES its fixture**. Run
45:`bash scripts/seed-customer-proposal-fixture.sh` before each verification, or
46:the approval path is skipped — and it now FAILS rather than passing quietly when
47:no answerable proposal exists (`ALLOW_EMPTY_CUSTOMER_PROPOSALS=1` to opt out).
48:
49:**The customer can now approve their own repair.** `POST
50:/proposals/:id/customer-decision` — a separate route from the staff one, because
51:`decidedByName`, `decisionChannel` and `recorded_by` stop being inputs and are
52:derived. The role admits the read; a `c.user_id` predicate scopes it.
53:
54:**Keycloak's `error=Configuration`** is replaced by an honest "starting up"
55:screen with one bounded retry, at `/auth/error` in all seven apps.
56:⚠️ A 24/7 keep-warm was REJECTED on arithmetic: four free services share one
57:750-hour allowance and a month is ~730 hours. `keep-warm.yml` is windowed.
58:
59:### 🔴 THREE GATES WERE NOT GATES
60:
61:- **Codex had never run on a real diff** — prompt passed as argv,
62:  `Argument list too long` — **and the runner exited 0 when it failed.**
63:- **Package vitest configs collected only `*.test.ts`** while `apps/api` uses
64:  `*.spec.ts`; a misnamed file was silently never collected.
65:
66:Ask of any gate: *would its not-running look different from its passing?*
67:
68:### 🔴 AND THINGS THAT LOOKED FINE AND WERE NOT
69:
70:- `decidable` was still computed from the STAFF role set, so the customer
71:  approval form **rendered nothing** while the service and all ten of its tests
72:  passed. Test what the VIEWER is told they may do, not only what the service does.
73:- Both decision routes accepted a **superseded** proposal by direct POST.
74:  `decidable` hides it; hiding is not refusing.
75:- The technician dashboard told a signed-in technician **nobody was signed in**,
76:  then my first fix read `currentViewer() !== null`, which is null when `/me`
77:  FAILS. It reads `viewerHasSession` now.
78:- After approving, the screen still said "contact the workshop to approve" —
79:  recording a decision does not move the job card; that is staff's action.
80:
81:---
82:
83:## Standing warnings
84:
85:- **Keycloak cold start is up to 136 seconds** and produces
86:  `error=Configuration` on sign-in, not a wait. The first visitor after an idle
87:  period gets a hard error.
88:- **Four free Render services now share one instance-hour allowance.** This
89:  account was suspended with `suspenders: ['billing']` on 2026-07-28, and
90:  `autoworkshop-customer` 404'd for a stretch on 2026-08-03. **No paid remedy is
91:  to be proposed** — zero cost is a hard rule.
92:- `scripts/guardrails/check-page-gates.sh` is RED with **19 pre-existing** FAILs,
93:  all apparently false. Verified identical before and after this session's work.
94:- `RENDER_API_KEY` still unrotated since the 2026-07-27 leak.
95:
96:---
97:
98:## 📋 THE COMPLETE OUTSTANDING REGISTER — everything still open
99:
100:Consolidated at the 2026-08-03 pt3 close. Ordered by what unblocks the most.
101:
102:### A. BLOCKING — do first
103:
104:| # | Item | Where |
105:|---|---|---|
106:| A1 | **Migration 037 — the RLS bootstrap fix.** Detailed at the top of this file. Without it no workshop can be created in production. | `infrastructure/migrations/037_*.sql` |
107:| A2 | **Finish seeding the owner's workshop.** The user row exists live and holds no membership; A1 is the only thing in the way. Use the form, not an INSERT. | `autoworkshop.aiappinvent.com` |
108:
109:### B. PRODUCTION RISKS — none is a code bug, all can bite a real user
110:
111:| # | Item | Note |
112:|---|---|---|
113:| B1 | **Keycloak cold start reached 136s** and throws `error=Configuration` at whoever signs in first after idle — a hard error, not a wait. Needs either a keep-warm (Solar's `keep-warm.yml` is the worked pattern: ONE delivered cron fire drives a 5h30m loop) or a friendlier failure. | — |
114:| B2 | **Four free Render services share one 750h allowance.** A month is ~730h. T-0034 records the 2026-07-28 billing suspension from exactly this. `autoworkshop-customer` 404'd for a stretch on 08-03. **No paid remedy is to be proposed.** Consider retiring `autoworkshop-customer` — the apex now serves the same landing from `workshop-web`, so it is largely redundant. | T-0034 |
115:| B3 | **`RENDER_API_KEY` unrotated** since the 2026-07-27 transcript leak. Treat as compromised. | — |
116:| B4 | **The four gates were not run on most of this session's 17 commits.** Codex ran once early, `/security-review` once. CLAUDE.md requires Codex → Supervisor → Work Reviewer → Work Scheduler per feature. | `scripts/quality-gate.sh` |
117:
118:### C. PRODUCT — the owner's stated priority is what a user can SEE
119:
120:| # | Item | Size |
121:|---|---|---|
122:| C1 | **Menu coverage is 28-50% per role** — measured today: owner 19/56, manager 21/64, reception 15/36, technician 8/29, default 21/42. Everything else lands on "not built yet". `node scripts/audit-menu-coverage.mjs --all` names each one. | LARGE, slice it |
123:| C2 | **"Add staff" has no screen.** The nav advertises `staff` and `technicians`, the `MembershipService` API exists, no page. Own slice: a list plus an add-member form. | MED |
124:| C3 | **Customer workspace has 6 real screens.** Dashboard, garage, add vehicle, parts orders, report a problem, vehicle lookup. The rest of §33 is nav without pages. | LARGE |
125:| C4 | **Evidence upload** — `POST /evidence/upload-url` + `storage_key` wiring + UI. Photos/voice/video/OBD are in §537 and the report-a-problem screen says so honestly. | MED |
126:| C5 | **T-0017** — quick-create, tasks, messages, notifications, help panels (§9-§14). The top-bar buttons render disabled until these land. | MED |
127:| C6 | **Mobile**: offline queue, camera capture, push — all still empty. | LARGE |
128:| C7 | **T-0028** — account types as requests, workshop staff invitation, approval limits. Pairs naturally with C2. | MED |
129:
130:### D. CORRECTNESS AND HYGIENE
131:
132:| # | Item |
133:|---|---|
134:| D1 | **T-0006** — full tenant-isolation suite. RLS is proven as a non-superuser; the suite is not written. A1 makes this urgent: production RLS behaves differently from local, and nothing tests that. |
135:| D2 | **Repo-wide RLS org-scoping** — plan before code. |
136:| D3 | **T-0044** — the document scrolls 51px sideways at a 768px viewport on EVERY page. Pre-existing shell defect; 1280 and 390 are clean. |
137:| D4 | **`check-page-gates.sh` is RED with 19 pre-existing FAILs**, all apparently false (a `const ROUTE` indirection, and customer-web's `(app)` route groups). A Stage-0 guardrail that cries wolf 19 times is one nobody reads — either fix the script or delete it. |
138:| D5 | A finding's `recorded_by` is **re-stamped on edit**, so the original recorder survives only in the audit trail. |
139:| D6 | **Permission denials are not audited anywhere**, though CLAUDE.md §16 lists them as an audit event. |
140:| D7 | **T-0019/T-0023** — backup health detection works; delivery to a human does not. |
141:| D8 | **T-0020/T-0021/T-0022** — restore drill from the off-host copy, MinIO object-lock, cluster rebuild with `--data-checksums`. |
142:| D9 | The new browser checks (`verify-vin-funnel`, `verify-workshop-onboarding`, `verify-top-bar-identity`) are **not wired into CI**. They need a running stack, so they are manual today. |
143:| D10 | Playwright baseline is **138 passed / 2 skipped** and was NOT re-run this session. **Read the COUNT, never the exit code** — this suite silently ran zero tests for two days. |
144:
145:### F. FROM TESTING THE LIVE LANDING — 2026-08-03
146:
147:| # | Item | Status |
148:|---|---|---|
149:| F1 | **Seed the live catalogue.** The apex landing went live reporting `parts 0 · suppliers 0 · countries 0 · mechanics 0` — a shop with nothing in it. | ✅ **DONE** — `Seed live catalogue` workflow; now **18 parts · 5 suppliers · 3 countries** across 8 categories, GHS priced, unpublished rows correctly withheld. |
150:| F2 | **Mechanics directory is still 0.** It is copied from workshops that actually exist, and none do. | ⏳ **BLOCKED BY A1** — it fills once migration 037 unblocks workshop registration. Re-run the seed afterwards. |
151:| F3 | **The live checks assert STRUCTURE, NOT CONTENT.** 24/24 passed against a completely empty shop: they confirm the catalogue section renders, never that anything is in it. `verify-live-site.mjs` and `verify-vin-funnel.mjs` both need a non-empty assertion. `seed-live-catalogue.yml`'s read-back is written correctly and can be copied. | OPEN |
152:
153:### E. DECISIONS WAITING ON THE OWNER
154:
155:| # | Item |
156:|---|---|
157:| E1 | **Retire `autoworkshop-customer`?** It duplicates the apex landing and consumes free instance-hours. Keeping it costs hours; removing it loses the consumer basket flow until that moves too. |
158:| E2 | **Workshop staff vs consumer front door.** The apex now shows a parts marketplace to everyone, including workshop staff arriving to work. Watch whether that reads well in practice; the wordmark and nav both reach the dashboard. |
159:
160:---
161:
162:## ✅ LIVE SUITE AT CLOSE — 2026-08-03, 24/24 against production
163:
164:| suite | result |
165:|---|---|
166:| `verify-live-site.mjs` (existing) | **9/9** — serves, shell renders, sign-in reaches Keycloak, unknown route 404s, no console errors |
167:| `verify-vin-funnel.mjs` against the APEX | **9/9** — VIN decodes signed out, gate holds, CTA carries the VIN through sign-up |
168:| signed-in identity, live | **6/6** — real session, no "Not signed in", the AUTHENTICATED API answers |
169:
170:**⚠️ ONE MEASUREMENT CHANGED MEANING, AND IT IS NOT A FIX.** The suite reports
171:**0px horizontal overflow at 768px**, where T-0044 recorded 51px. That is
172:because `/` is now the public landing rather than a redirect into the shell —
173:**a different page is being measured.** T-0044 is a SHELL defect and remains
174:open; re-measure it on `/home/dashboard` and `/workshop-floor/job-cards` before
175:believing it is gone.
176:
177:The signed-in run also asserts the known blocker as a KNOWN state: if
178:"still no workshop" ever FAILS, A1 and A2 are done and this file needs updating.

 succeeded in 837ms:
5:Live target: [`autoworkshop.aiappinvent.com`](https://autoworkshop.aiappinvent.com) · Status: **Phase 1 — Release 0.1 (foundation)**
18:Per `autoworkshop 05.txt` §1, §2, §6, §8 and ADR-012, this project uses **only zero-cost and open-source
70:`master` (production-ready) · `develop` (integration) · short-lived `feature/*` branches.
79:**Reference implementation: [`solar-pv-designer-lite`](https://github.com/marc667us/solar-pv-designer-lite)** —
81:**not** entangled: separate repo, database, Keycloak realm, deployment, secrets and CI. If Solar were

 succeeded in 1743ms:
1:# > START HERE - next session
2:
3:```bash
4:bash scripts/start-session.sh
5:```
6:
7:---
8:
9:## SESSION CLOSE 2026-08-04 — BOTH WORKFLOWS FINISHED
10:
11:**Tip `59e3838`, pushed, tree clean.** Seven commits.
12:
13:### ▶ THE ONE THING ONLY THE OWNER CAN DO
14:
15:```
16:! C:\Users\USER\bin\gh.exe workflow run apply-migrations.yml -f confirm=APPLY --repo marc667us/autoworkshop-ai
17:```
18:
19:Migration **037** is written, committed and verified **13/13** locally under
20:production privileges — and proven to FAIL with the exact live error before it.
21:Until it is applied, `POST /registration/workshop` still 500s and no workshop
22:can be created live. Detail in `.claude/CURRENT_TASK.md`.
23:
24:### WHAT SHIPPED
25:
26:- **Technician workflow 21/21**, **customer 19/19**, both driven in a real
27:  browser as the role whose tree owns the routes.
28:- **A customer can approve their own repair** — new
29:  `POST /proposals/:id/customer-decision`, with the consent fields DERIVED
30:  rather than accepted.
31:- **Keycloak's `error=Configuration`** replaced by an honest "starting up"
32:  screen in all seven apps.
33:- **Landing cards on Solar's scale** (12px radius, 24px padding).
34:
35:### ⚠️ RUNNING THE VERIFICATIONS
36:
37:```bash
38:bash scripts/seed-customer-proposal-fixture.sh   # the customer run CONSUMES it
39:cd apps/e2e
40:node verify/verify-technician-workflow.mjs
41:node verify/verify-customer-workflow.mjs
42:```
43:
44:The customer suite now **FAILS** rather than passing quietly when there is no
45:answerable proposal, because the whole approve path sits behind that condition.
46:
47:### 🔴 THE LESSON OF THE DAY, IN ONE LINE
48:
49:**Ask of any gate: would its not-running look different from its passing?**
50:Codex had never run on a real diff (prompt passed as argv → `Argument list too
51:long`) *and exited 0 when it failed*. Package vitest configs collected only
52:`*.test.ts` while `apps/api` uses `*.spec.ts`. Both fixed.
53:
54:And its sibling: **hiding is not refusing.** `decidable` hid superseded
55:proposals from the screen while both write routes still accepted them by POST.
56:
57:### Local stack at close
58:
59:Everything on **plain `localhost`** — API 4000, workshop-web 3001,
60:customer-web 3000, Keycloak 8080. Sign in as
61:`technician@autoworkshop.local` / `customer@autoworkshop.local`,
62:password `Change_me_locally1!`.
63:
64:⚠️ `scripts/start-local.sh` **HUNG at its `kcadm` step** this session. It was
65:bypassed by starting each process with `KEYCLOAK_URL=http://localhost:8080`,
66:which keeps the issuer matching `.env` and works because the realm's dev clients
67:already allow `http://localhost:<port>/*`. Worth fixing before relying on it.
68:
69:⚠️ Servers were left RUNNING.
70:
71:---
72:
73:## SESSION CLOSE 2026-08-03 - THE LIVE SITE CAN NOW BE SIGNED INTO
74:
75:**Tip `386ac55`, pushed, tree clean.** Six commits.
76:
77:### LIVE CREDENTIALS - verified by real browser sign-in, both accounts
78:
79:| | |
80:|---|---|
81:| **URL** | **https://autoworkshop.aiappinvent.com** |
82:| Owner | `marc667us@yahoo.com` / `Forest-prism-bramble-nomad7` |
83:| Admin | `admin@aiappinvent.com` / `Basalt-oyster-thistle-quill4` |
84:| Keycloak | https://autoworkshop-keycloak.onrender.com (realm `autoworkshop`) |
85:
86:Also in `C:\Users\USER\autoworkshop-owner-login.txt`.
87:Keycloak master admin password lives in `C:\Users\USER\autoworkshop-keycloak-admin.txt`
88:- **the only readable copy**; Keycloak honours it on a FIRST boot only.
89:
90:Realm password policy: `length(12) upperCase(1) lowerCase(1) digits(1)
91:specialChars(1) passwordHistory(3)` - a plain lowercase passphrase is REFUSED.
92:
93:### WHAT THE OWNER WILL SEE, AND IT IS NOT AN AUTH BUG
94:
95:Both accounts sign in. Then the dashboard reads **zero** and the header shows
96:**"Not signed in" beside "Sign out"**. Authentication genuinely succeeded - the
97:**API service is not deployed**, so nothing can answer `/me`, and Postgres holds
98:**no tenant, organisation or membership** for these users. Those are steps 1 and
99:2 in `.claude/CURRENT_TASK.md`.
100:
101:**Do not chase this as the 08-02 issuer bug.** That one is fixed and verified in
102:both directions; this is missing infrastructure, and the screen says so itself.
103:
104:### What went live
105:
106:- **Keycloak deployed to Render** - it never existed before. Three bugs blocked
107:  it, each fatal: the JVM refused to start (two garbage collectors selected),
108:  the deploy's own password generator broke its pipe under `pipefail`, and
109:  `KeyError: 'ownerId'` from a Render response shape.
110:- **The web service now points at it** (`point-web-at-keycloak.yml` - a MERGE,
111:  because Render's env endpoint is a whole-set PUT that would otherwise delete
112:  `AUTH_SECRET`).
113:- **The production realm had ZERO users** by design; owner + admin created. The
114:  client also allowed only the `workshop.` subdomain while the app serves the
115:  apex - fixed.
116:
117:### Product shipped
118:
119:- **Web job-card detail screen**, one screen at FOUR role-tree routes; job
120:  numbers now link. 52/52 in a browser as four identities.
121:- **"Add customer" / "Register vehicle" buttons** on the list screens, href
122:  resolved from the viewer's own navigation. 11/11 across three roles.
123:- **"Add staff" NOT built** - there is no staff screen to link to. Own slice.
124:
125:### Local stack at close
126:
127:Servers were left RUNNING (API 4000, workshop-web 3001 bound to 192.168.0.124).
128:`AUTH_URL` is the LAN host, so **hitting `localhost:3001` gives `MissingCSRF`** -
129:use `http://192.168.0.124:3001`. Local login is `owner@autoworkshop.local` /
130:`Change_me_locally1!`. Cloudflared tunnels were used mid-session and stopped.
131:
132:---
133:
134:## 📍 SESSION CLOSE 2026-08-02 — READ THIS BLOCK FIRST
135:
136:**Tip `217a648`, pushed, tree clean.** Owner's instruction mid-session:
137:*"i need only the web and mobile app"* — no deployment work after that point.
138:
139:### Local URLs and the login
140:
141:| | |
142:|---|---|
143:| Workshop web | `http://<LAN>:3001` |
144:| Supplier web | `http://<LAN>:3002` |
145:| Admin web | `http://<LAN>:3006` |
146:| Mobile | `exp://<LAN>:8081` (Expo Go) |
147:
148:```
149:owner@autoworkshop.local / Change_me_locally1!     (FULL EMAIL, plain http)
150:```
151:Others, same password: `admin@`, `manager@`, `reception@`, `technician@`,
152:`supervisor@`, `customer@autoworkshop.local`.
153:
154:⚠️ `owner@` defaults to **platform_administrator** by ROLE_PRECEDENCE and lands
155:on the DEFAULT tree. Owner-tree screens (Pricing, Repair Control, Workshop
156:Operations) need **Switch user → workshop_owner** first.
157:
158:### ▶ NEXT SESSION — JOB LIST, in order
159:
160:**J0. Dry-run the Keycloak deploy.** It is built and NEVER RUN.
161:`gh workflow run deploy-keycloak.yml --repo marc667us/autoworkshop-ai`
162:(no `confirm=APPLY`). Read what it reports, THEN apply. This is the shortest
163:path to a live sign-in — everything under it is already done and verified.
164:
165:**J1. Web job-card detail screen** — see item 1 below. Highest product value.
166:
167:**J2. Steps 4-6 of the live deploy** — API service, point the web service at
168:Keycloak + the API, seed accounts. Only after J0 succeeds.
169:
170:**J3. More menu entries → real screens** (127 left) — item 2 below.
171:
172:**J4. Mobile: offline queue, then camera, then push** — item 3 below.
173:
174:**J5. Evidence upload endpoint + UI** — item 4 below.
175:
176:**J6. Repo-wide RLS org-scoping** — PLAN BEFORE CODE, item 5 below.
177:
178:**J7. Rotate `RENDER_API_KEY`** — leaked in a transcript 2026-07-27, still live.
179:
180:### ▶ DETAIL ON THE PRODUCT ITEMS, in order
181:
182:1. **The web job-card DETAIL screen.** There is no
183:   `workshop-floor/job-cards/[id]` page, so the 14 new queue screens render the
184:   job number as PLAIN TEXT — a link would send the user's most obvious click
185:   into the "not built yet" catch-all. **Highest value next slice**: it unblocks
186:   the primary action on 14 screens. The MOBILE app already has a detail screen
187:   with stage transitions (`apps/mobile/src/screens/`) to follow.
188:2. **More menu entries → real screens.** 127 still hit the placeholder;
189:   `node scripts/audit-menu-coverage.mjs --all` lists every one. Buildable NOW
190:   are those whose API exists: catalogue/parts, customers, vehicles,
191:   memberships. The rest need their API first (finance, reports, communication,
192:   knowledge, learning, technical tools).
193:3. **Mobile: offline queue, camera capture, push.** All three empty;
194:   `packages/offline-sync` is an empty directory. A workshop phone loses signal
195:   constantly, so the offline queue changes how the app feels most.
196:4. **Evidence upload.** Storage layer done and proven against MinIO (`06ccf8d`);
197:   still needs `POST /evidence/upload-url`, `storage_key` wiring, and the UI.
198:5. **Repo-wide RLS org-scoping** — needs a PLAN before code. Migration 027's
199:   `identity.current_organization_id()` is the start; both failure modes fail
200:   closed (unset GUC → NULL matches nothing, non-uuid → RAISE).
201:
202:### 🔴 ISSUE LOG
203:
204:| # | Issue | State |
205:|---|---|---|
206:| I1 | **Live sign-in still impossible** — DB migrated AND `KC_BOOTSTRAP_ADMIN_PASSWORD` set 2026-08-02. Steps 3-6 remain. | **UNBLOCKED** — deploy Keycloak next |
207:| I2 | No web job-card detail page; queue job numbers are plain text | open → item 1 |
208:| I3 | 127 menu entries still render "not built yet" | open → item 2 |
209:| I4 | Mobile has no offline queue / camera / push | open → item 3 |
210:| I5 | `RENDER_API_KEY` unrotated since the 07-27 transcript leak | treat as compromised |
211:| I6 | T-0044 — document scrolls 51px sideways at 768px, every page | open, pre-existing |
212:| I7 | `record-diagnosis-in-browser` and `plan-repair-in-browser` CONSUME their fixtures | seed first; diagnosis has NO seeder |
213:| I8 | `security-posture.integration.spec` flakes on pool contention in the full run | passes alone; uninvestigated |
214:| I9 | `next start` warns `output: standalone` is set but unused | cosmetic, unexamined |
215:
216:**I1 — no longer owner-gated.** `KC_BOOTSTRAP_ADMIN_PASSWORD` was generated and
217:set on the repo 2026-08-02.
218:
219:🔴 **GITHUB SECRETS ARE WRITE-ONLY. The only readable copy of that password
220:is `C:\\Users\\USER\\autoworkshop-keycloak-admin.txt`** — outside the repo, never
221:printed to a transcript. Without it the Keycloak admin console is unreachable
222:and the instance would have to be recreated, because Keycloak reads that
223:variable ONLY on a FIRST boot.
224:
225:**Step 3 is BUILT BUT NEVER RUN.** `.github/workflows/deploy-keycloak.yml`,
226:`infrastructure/keycloak/render/{Dockerfile,build-prod-realm.mjs}` and migration
227:035 (Keycloak schema + role, applied locally AND on Render) are all in place.
228:
229:⚠️ The workflow has NOT been executed, not even a dry run. Its YAML parses; that
230:is all that is verified. **Run it without `confirm=APPLY` first.**
231:
232:```
233:gh workflow run deploy-keycloak.yml --repo marc667us/autoworkshop-ai
234:```
235:
236:Verified separately: the realm builder strips all 9 dev redirect URIs and
237:refuses a wildcard or a baked-in user (control passes); `keycloak_app` is denied
238:on identity/core/repair/audit and can only use its own schema.
239:
240:Then steps 4-6: deploy the API service, point the web service at it, seed accounts.
241:
242:✅ Done this session: database **created**, and migrations **001-034 APPLIED to
243:Render** (run `30761632886`, 44 tables). `apply-migrations.yml` dry-runs by
244:default and CALLS `infrastructure/migrations/run.sh` rather than reimplementing
245:the ledger.
246:
247:### WHAT CHANGED — the load-bearing parts
248:
249:**The mobile app had never actually run.** Three defects stopped it booting and
250:no test caught any of them: `vitest` exercises modules, and `expo start` prints
251:"Waiting on :8081" without building anything. **Requesting the bundle found all
252:three.** Its Keycloak client also existed in the committed realm and NOT in the
253:running one — a realm imports ONCE, on first boot.
254:
255:⚠️ The Metro config deliberately does NOT set `disableHierarchicalLookup`,
256:contrary to Expo's monorepo guide: that guide assumes npm/yarn hoisting, and
257:pnpm needs the walk-up lookup to resolve a package's own dependencies.
258:
259:**The auth failure that shows two contradictory things at once.** Keycloak
260:derives a token's `iss` from the request Host; the API validates
261:`jwt.verify({issuer})` against its own KEYCLOAK_URL. A LAN sign-in against an
262:API expecting localhost rejected every token — while the session cookie stayed
263:valid, so the page rendered **"Sign out" AND "Not signed in" together**.
264:
265:**`.gitignore` had no env rule at all.** `.env` holds `POSTGRES_PASSWORD`,
266:`DATABASE_URL` and `AUTH_SECRET`, kept out of the repo by discipline alone.
267:
268:**Input validation was never enforced** — every write body was a TypeScript
269:type, erased at runtime. 43 endpoints now validated with Zod at the boundary.
270:A global `ValidationPipe` was REJECTED: without DTOs it validates nothing while
271:making every controller look guarded.
272:
273:### TRAPS THAT BIT THIS SESSION
274:
275:- 🔴 **A field name that would have lied to every user.** The mobile detail
276:  screen was written against `stageOptions`; the API returns `allowedStages`.
277:  Nothing throws — the list is empty and the screen says *"your role cannot move
278:  this job"*, shown to owners included.
279:- 🔴 **Same class in the web queues:** `awaiting_internal_review` is a BOARD
280:  COLUMN key, not a stage. The drift test caught it on its first run.
281:- 🔴 **My own verification lied twice.** The queue check reported 1/14 (thirteen
282:  CORRECT `requireNavRoute` refusals — it drove every route as a platform
283:  administrator), then 0/14 from a corrupted regex while all fourteen worked.
284:  **Drive each route as the role whose tree owns it.**
285:- 🔴 **`Boolean('false')` is `true`** — found in `inStock` AFTER fixing the same
286:  bug on the three publication routes. Enumerate accepted values, never coerce.
287:- ⚠️ **`|| true` on a `find` is load-bearing** in `start-local.sh`: not every app
288:  has `src/`, and under `set -euo pipefail` a missing path killed the script
289:  SILENTLY after the API had already started.
290:- ⚠️ **`MSYS_NO_PATHCONV=1`** before any node script taking `/routes` as argv.
291:- ⚠️ **The Bash tool's cwd persists between calls** — several commands failed on
292:  a leftover `cd apps/x`.
293:- ⚠️ **`cmd | head -N && echo ok`** reports `head`'s exit code, not `cmd`'s.
294:
295:---
296:
297:## 📍 SESSION CLOSE 2026-08-01 pt2 — READ THIS BLOCK FIRST
298:
299:**Tip `06ccf8d`, tree clean, pushed.** 634 API tests / 29 files · nav audit
300:exits 0 · every browser verify green.
301:
302:### ▶ THE FIRST THING TO DO — still the owner's, still one command
303:
304:The live site cannot be signed into. It needs a database, and the assistant is
305:**classifier-blocked** from creating one:
306:
307:```
308:! C:\Users\USER\bin\gh.exe workflow run provision-database.yml -f confirm=CREATE --repo marc667us/autoworkshop-ai
309:```
310:
311:If it fails on the PLAN, Render no longer offers free Postgres → that is a SPEND
312:decision, the owner's alone. Unchanged from the previous session.
313:
314:### 🔴 OWNER DECISION WAITING — the menu promises 3x what it delivers
315:
316:**Raised by the owner 2026-08-01: "all these pages and dont see all at the front
317:end." They were right, and the progress figure I gave was misleading.**
318:
319:Re-measure any time: `node scripts/audit-menu-coverage.mjs`
320:
321:| Role | Menu entries | Built | Placeholder |
322:|---|---|---|---|
323:| Owner §46 | 64 | **17 (27%)** | 47 |
324:| Default §34 (supervisor, QC, storekeeper, cashier, platform admin) | 56 | **18 (32%)** | 38 |
325:| Technician §49 | 42 | **14 (33%)** | 28 |
326:| Manager §47 | 36 | **13 (36%)** | 23 |
327:| Reception §48 | 29 | **7 (24%)** | 22 |
328:
329:**141 distinct menu entries have no page anywhere.** An owner signing in finds
330:roughly three of every four clicks render *"the screen's own content is scheduled
331:for a later phase."*
332:
333:⚠️ **CORRECTION TO THE PROGRESS REPORT.** I said "99 screens in workshop-web" /
334:"115 total". That counted every `page.tsx` FILE — including `[id]` detail
335:variants and one screen mounted at several role-tree routes. **The honest figure
336:is 61 distinct built routes in workshop-web, ~30% menu coverage, Phase 5 of 11.**
337:
338:**WHY:** the navigation trees were written from the FULL 11-phase spec up front;
339:pages are built phase by phase. Much of the emptiness is correct — parts depot,
340:finance, AI, knowledge are Phases 6-9. But entries like appointments, vehicle
341:intake, technicians, service bays, calendar and tasks sit beside finished Phase 5
342:work and read as broken.
343:
344:**TWO OPTIONS — the owner's call, because it is a navigation change (`05.txt` §2):**
345:1. **Hide unbuilt entries.** The app feels complete at every stage. Cost: the
346:   visible roadmap goes, and the trees stop matching the approved spec docs.
347:2. **Keep them, MARK them** — a visible "Phase 6" style marker in the menu, so
348:   nothing surprises anyone after they click. **← recommended:** honest, keeps
349:   the approved navigation intact, stops the app reading as broken.
350:
351:Nothing applied. No navigation was changed for this.
352:
353:### ▶ NEXT PIECE OF WORK — finish the evidence upload
354:
355:`06ccf8d` shipped the STORAGE LAYER only, proven against real MinIO (presigned
356:PUT accepted, expiry enforced, bucket private). What remains:
357:
358:1. **The endpoint that mints a URL.** `POST /evidence/upload-url` — resolve the
359:   execution FIRST (so the caller is already permitted to write it), then
360:   `StorageService.presignPut`. The service is deliberately NOT an authorization
361:   control; see its header.
362:2. **Record the key.** `execution_evidence.storage_key` already exists; wire the
363:   returned key into the existing evidence-recording path.
364:3. **The upload UI**, on the execution sheet.
365:
366:⚠️ Reading an object back needs its own presigned GET, which is NOT built — the
367:bucket is private and that is correct.
368:
369:### ▶ THEN — the last Slice D item
370:
371:**Repo-wide RLS org-scoping (outstanding issue 8).** Explicitly NEEDS A PLAN
372:BEFORE CODE and has not been started. Starting point: migration 027 introduced
373:`identity.current_organization_id()` for ONE table, and its failure modes are
374:proven — an unset GUC returns NULL and matches nothing; a non-uuid RAISES. Both
375:fail closed.
376:
377:---
378:
379:## 🔴 WHAT CHANGED THIS SESSION — the load-bearing parts
380:
381:### Infrastructure was lying, for five days
382:Redis, NATS and MinIO were **unreachable from the host** while `docker ps`
383:reported all five containers healthy. MinIO answered HTTP 200 *inside* its
384:container and HTTP 000 from outside. Cause: stale Docker port-forward wiring —
385:the two containers restarted on 07-28 worked, the three from 07-27 did not.
386:Fixed with `docker restart` (`d9845c3`).
387:
388:**`start-session.sh` section 3b is the durable half.** It used to PRINT
389:"a container reporting healthy is not proof the service works" and then read
390:container health anyway. It now completes a real protocol exchange from the host
391:— Redis must answer `+PONG`, NATS must send its `INFO` banner, Keycloak's realm
392:must serve its discovery document. Proven to FAIL with a container stopped.
393:
394:### The navigation and the API disagreed about who does what
395:`docs/03-ui-ux/NAVIGATION-GAPS-PROPOSAL.md` — 7 gaps found and closed
396:(`6c3e534`, owner-approved Option A). Root cause is structural: `ROLE_TO_NAV`
397:maps 8 roles but only 4 trees exist, so supervisor, storekeeper, QC inspector
398:and cashier all fall back to the DEFAULT tree, as does platform_administrator.
399:**All 21 write capabilities span 2-5 trees.**
400:
401:`scripts/audit-nav-coverage.mjs` is now ENFORCING (exit 1). It caught the
402:owner/manager variation gap before anyone tripped over it — the first time.
403:
404:### ⚠️ TWO E2E RUNS CONSUME THEIR OWN FIXTURE
405:Seed first or they report a clean pass while testing nothing:
406:```bash
407:bash scripts/seed-qc-fixture.sh          # before verify-quality-control.mjs
408:bash scripts/seed-variation-fixture.sh   # before verify-variation-screen.mjs
409:```
410:Both were added because the run reported green while the main path never ran.
411:
412:---
413:
414:## 🔴 TRAPS — the ones that cost time THIS session
415:
416:- **A trigger enforcing a rule on UPDATE and nowhere else.** Hit TWICE in one
417:  session — QC (030→031) and variations (032→033). A direct INSERT bypassed
418:  both. **Ask every trigger which statements it fires on.**
419:- **A verify script that walks through the gap it guards.** `verify/032`
420:  performed the internal review as the technician who raised the variation —
421:  exactly what §3792 forbids — and reported 15/15. Migration 033 made it fail;
422:  that is the only reason it surfaced.
423:- **A predicate that can never match.** `polwithcheck IS NULL` returned 0 rows
424:  against 39 matching policies (Postgres stores a COPY of USING). The nav audit
425:  did the same thing differently — `indexOf('[')` matched the `[]` in
426:  `NavGroup[]`, every tree parsed as 0 routes, 21 false gaps reported
427:  confidently.
428:- **Backticks inside a SQL `--` comment inside a TS template literal.** Three
429:  times. It terminates the string.
430:- **`Boolean('false')` is TRUE and `Number('')` is 0.** Both would have written
431:  the dangerous value silently — a QC pass, a free variation, a zero labour rate.
432:- **Stale `next start` on a port `start-session.sh` does not clear** (3006, 4000)
433:  served 200 with none of the new build. Check `StartTime`.
434:- **`next build` after sourcing `.env`** is refused by `assert-build-env.mjs` —
435:  NODE_ENV=development loads the DEV React runtime. Use `unset NODE_ENV`.
436:- **admin-web is :3006, customer-web :3000, workshop-web :3001** — pinned by the
437:  realm's redirect URIs, not free choice.
438:
439:---
440:
441:## Ports / state at close
442:
443:| | |
444:|---|---|
445:| API | :4000 |
446:| workshop-web | :3001 |
447:| admin-web | :3006 |
448:| customer-web | :3000 — the **Abossey Okai marketplace landing** (signed out) |
449:
450:⚠️ Servers were left RUNNING.
451:✅ Migrations **001-034 are now on RENDER** as well as locally (2026-08-02).
452:`apply-migrations.yml` is the workflow; it dry-runs by default and calls
453:`infrastructure/migrations/run.sh` rather than reimplementing the ledger.

codex
The control docs make several implementation claims about migration 037, customer decision routes, auth-error handling, keep-warm, and gates. I’m sampling those exact surfaces now to separate real misses from wording-only drift.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg --files | rg "(037_|customer-decision|keep-warm|auth/error|verify-customer-workflow|verify-technician-workflow|quality-gate|vitest.config|run-codex|codex)"' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "customer-decision|decidable|superseded|proposal|decision" apps/api domains packages apps/workshop-web apps/customer-web' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "include|spec|testMatch|testRegex|vitest" --glob "*vitest*" --glob "package.json" apps packages domains' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "auth/error|Configuration|starting up|retry|keep-warm|KEEP|warm" apps .github scripts packages' in C:\Users\USER\Documents\autoworkshop-ai
 exited 1 in 1371ms:
apps/customer-web\app\_screens\repair-journey.ts:110:    detail: 'We are pricing the work. Your proposal will arrive shortly.',
apps/customer-web\app\_screens\repair-journey.ts:116:    detail: 'A repair proposal is waiting for your decision. Nothing starts until you approve it.',
apps/customer-web\app\_screens\repair-journey-screen.tsx:7:import { ProposalDecisionForm } from './proposal-decision-form';
apps/customer-web\app\_screens\repair-journey-screen.tsx:19: *   /service-and-repairs/repair-proposals    the ones waiting on the customer
apps/customer-web\app\_screens\repair-journey-screen.tsx:61: * WARNING: NAMES TAKEN FROM apps/api/src/repair/proposal.service.ts, not
apps/customer-web\app\_screens\repair-journey-screen.tsx:64: * wrote. `decidable` is the API's OWN judgement of whether an answer is still
apps/customer-web\app\_screens\repair-journey-screen.tsx:66: * re-derives. A superseded version is therefore never offered.
apps/customer-web\app\_screens\repair-journey-screen.tsx:77:  decidable: boolean;
apps/customer-web\app\_screens\repair-journey-screen.tsx:78:  decision: string | null;
apps/customer-web\app\_screens\repair-journey-screen.tsx:170:  const proposals =
apps/customer-web\app\_screens\repair-journey-screen.tsx:171:    view === 'needs-you' ? await apiGet<ProposalRow[]>('customer', '/proposals') : null;
apps/customer-web\app\_screens\repair-journey-screen.tsx:213:          <Link href="/service-and-repairs/repair-proposals">See what is needed</Link>
apps/customer-web\app\_screens\repair-journey-screen.tsx:223:              The proposal still OPEN on this card. `decidable` is the API's
apps/customer-web\app\_screens\repair-journey-screen.tsx:224:              judgement, so an already-answered or superseded version is not
apps/customer-web\app\_screens\repair-journey-screen.tsx:227:            proposal={
apps/customer-web\app\_screens\repair-journey-screen.tsx:228:              proposals?.ok
apps/customer-web\app\_screens\repair-journey-screen.tsx:229:                ? proposals.data.find((p) => p.jobCardId === card.id && p.decidable)
apps/customer-web\app\_screens\repair-journey-screen.tsx:233:              The most recent proposal on this card that has ALREADY been
apps/customer-web\app\_screens\repair-journey-screen.tsx:234:              answered. Needed because recording a decision does NOT move the
apps/customer-web\app\_screens\repair-journey-screen.tsx:238:              answerable proposal on it, and the screen told the customer to
apps/customer-web\app\_screens\repair-journey-screen.tsx:243:              proposals?.ok
apps/customer-web\app\_screens\repair-journey-screen.tsx:244:                ? proposals.data
apps/customer-web\app\_screens\repair-journey-screen.tsx:245:                    .filter((p) => p.jobCardId === card.id && p.decision !== null)
apps/customer-web\app\_screens\repair-journey-screen.tsx:258:  proposal,
apps/customer-web\app\_screens\repair-journey-screen.tsx:262:  proposal?: ProposalRow;
apps/customer-web\app\_screens\repair-journey-screen.tsx:352:          {proposal ? (
apps/customer-web\app\_screens\repair-journey-screen.tsx:363:                Repair proposal {proposal.presentation.documentReference} is waiting for your answer.
apps/customer-web\app\_screens\repair-journey-screen.tsx:365:              {proposal.expectedResult ? (
apps/customer-web\app\_screens\repair-journey-screen.tsx:367:                  {proposal.expectedResult}
apps/customer-web\app\_screens\repair-journey-screen.tsx:377:              {proposal.riskAndLimitations ? (
apps/customer-web\app\_screens\repair-journey-screen.tsx:385:                  <strong>Risks and limitations:</strong> {proposal.riskAndLimitations}
apps/customer-web\app\_screens\repair-journey-screen.tsx:388:              {proposal.uncertainties ? (
apps/customer-web\app\_screens\repair-journey-screen.tsx:396:                  <strong>Still to be confirmed:</strong> {proposal.uncertainties}
apps/customer-web\app\_screens\repair-journey-screen.tsx:400:                proposalId={proposal.id}
apps/customer-web\app\_screens\repair-journey-screen.tsx:401:                recommendedTotal={proposal.presentation.recommendedTotal}
apps/customer-web\app\_screens\repair-journey-screen.tsx:402:                comprehensiveTotal={proposal.presentation.comprehensiveTotal}
apps/customer-web\app\_screens\repair-journey-screen.tsx:403:                currency={proposal.presentation.currency}
apps/customer-web\app\_screens\repair-journey-screen.tsx:410:              contradicting the decision it recorded a moment earlier.
apps/customer-web\app\_screens\repair-journey-screen.tsx:413:              You {answered.decision === 'approved' ? 'approved' : 'answered'} proposal{' '}
apps/customer-web\app\_screens\repair-journey-screen.tsx:420:              No proposal on this card at all. The customer is still the hold-up
apps/customer-web\app\_screens\repair-journey-screen.tsx:439:      return 'approve or decline the repair proposal';
packages\ui\src\AppShell.tsx:60:   * ⚠️ NOT A SECURITY CONTROL, like every other visibility decision in this
packages\ui\src\AiAssistantPanel.tsx:15: * It renders proposals and collects the user's decision. It does not call an
packages\ui\src\AiAssistantPanel.tsx:22: * server's decision, never the decision itself.
packages\ui\src\AiAssistantPanel.tsx:33: * The `AgentProposal` type below makes all five REQUIRED fields. A proposal that
packages\ui\src\AiAssistantPanel.tsx:39:/** The §5 human-in-the-loop classes, carried on every proposal. */
packages\ui\src\AiAssistantPanel.tsx:117:  proposals?: readonly AgentProposal[];
packages\ui\src\AiAssistantPanel.tsx:119:  /** Approve a Class C/D proposal. The server re-validates the approver. */
packages\ui\src\AiAssistantPanel.tsx:120:  onApprove?: (proposalId: string) => void;
packages\ui\src\AiAssistantPanel.tsx:121:  onReject?: (proposalId: string) => void;
packages\ui\src\AiAssistantPanel.tsx:138:  proposals = [],
packages\ui\src\AiAssistantPanel.tsx:204:      <section aria-labelledby="aw-assistant-proposals">
packages\ui\src\AiAssistantPanel.tsx:206:          id="aw-assistant-proposals"
packages\ui\src\AiAssistantPanel.tsx:218:        {proposals.length === 0 ? (
packages\ui\src\AiAssistantPanel.tsx:231:            {proposals.map((p) => (
packages\ui\src\AiAssistantPanel.tsx:234:                  proposal={p}
packages\ui\src\AiAssistantPanel.tsx:248:  proposal,
packages\ui\src\AiAssistantPanel.tsx:252:  proposal: AgentProposal;
packages\ui\src\AiAssistantPanel.tsx:256:  const classInfo = CLASS_LABEL[proposal.actionClass];
packages\ui\src\AiAssistantPanel.tsx:257:  const needsDecision = proposal.status === 'awaiting-approval' && proposal.approvalRequired;
packages\ui\src\AiAssistantPanel.tsx:271:      <p style={{ margin: 0, fontWeight: 600 }}>{proposal.action}</p>
packages\ui\src\AiAssistantPanel.tsx:277:        {proposal.approvalRequired
packages\ui\src\AiAssistantPanel.tsx:278:          ? ` · approval required${proposal.approverRole ? ` (${proposal.approverRole})` : ''}`
packages\ui\src\AiAssistantPanel.tsx:283:      {proposal.dataUsed.length > 0 ? (
packages\ui\src\AiAssistantPanel.tsx:286:          <span>{proposal.dataUsed.join(', ')}</span>
packages\ui\src\AiAssistantPanel.tsx:290:      {proposal.status === 'running' ? (
packages\ui\src\AiAssistantPanel.tsx:296:      {proposal.status === 'failed' && proposal.error ? (
packages\ui\src\AiAssistantPanel.tsx:298:          {proposal.error}
packages\ui\src\AiAssistantPanel.tsx:302:      {proposal.status === 'rejected' ? (
packages\ui\src\AiAssistantPanel.tsx:306:      {proposal.result ? <p style={{ margin: 0 }}>{proposal.result}</p> : null}
packages\ui\src\AiAssistantPanel.tsx:308:      {typeof proposal.confidence === 'number' ? (
packages\ui\src\AiAssistantPanel.tsx:313:          Confidence {Math.round(proposal.confidence * 100)}% — a suggestion to check, not a
packages\ui\src\AiAssistantPanel.tsx:319:      {proposal.sources && proposal.sources.length > 0 ? (
packages\ui\src\AiAssistantPanel.tsx:322:          {proposal.sources.map((s, i) => (
apps/customer-web\app\_screens\proposal-decision-form.tsx:6:import { decideProposalAction } from './proposal-decision-actions';
apps/customer-web\app\_screens\proposal-decision-form.tsx:9: * §7 — the customer's answer to a repair proposal, made by the customer.
apps/customer-web\app\_screens\proposal-decision-form.tsx:18: * Sent: the decision, the option (only when approving) and a note. NOT the
apps/customer-web\app\_screens\proposal-decision-form.tsx:21: * `proposal-decision-actions.ts`.
apps/customer-web\app\_screens\proposal-decision-form.tsx:24:  proposalId,
apps/customer-web\app\_screens\proposal-decision-form.tsx:29:  proposalId: string;
apps/customer-web\app\_screens\proposal-decision-form.tsx:34:  const [decision, setDecision] = React.useState('approved');
apps/customer-web\app\_screens\proposal-decision-form.tsx:35:  const approving = decision === 'approved';
apps/customer-web\app\_screens\proposal-decision-form.tsx:49:        <input type="hidden" name="proposalId" value={proposalId} />
apps/customer-web\app\_screens\proposal-decision-form.tsx:51:        <Field label="Your answer" htmlFor="decision">
apps/customer-web\app\_screens\proposal-decision-form.tsx:53:            id="decision"
apps/customer-web\app\_screens\proposal-decision-form.tsx:54:            name="decision"
apps/customer-web\app\_screens\proposal-decision-form.tsx:55:            value={decision}
apps/customer-web\app\_screens\proposal-decision-actions.ts:8: * §7 — the customer approves, declines or questions a repair proposal, themselves.
apps/customer-web\app\_screens\proposal-decision-actions.ts:12: * Not `decidedByName`, and not `decisionChannel`. Both are DERIVED by the API:
apps/customer-web\app\_screens\proposal-decision-actions.ts:13: * the name from the customer record the proposal hangs off, the channel from
apps/customer-web\app\_screens\proposal-decision-actions.ts:17: * That is not tidiness. `decided_by_name` and `decision_channel` are the consent
apps/customer-web\app\_screens\proposal-decision-actions.ts:22: * ⚠️ The screen never sends a proposal id the viewer did not receive from their
apps/customer-web\app\_screens\proposal-decision-actions.ts:32:  const proposalId = read('proposalId');
apps/customer-web\app\_screens\proposal-decision-actions.ts:33:  if (!proposalId) return { error: 'Nothing was selected to answer. Reload the page and try again.' };
apps/customer-web\app\_screens\proposal-decision-actions.ts:35:  const decision = read('decision');
apps/customer-web\app\_screens\proposal-decision-actions.ts:37:  const result = await apiPost(`customer`, `/proposals/${proposalId}/customer-decision`, {
apps/customer-web\app\_screens\proposal-decision-actions.ts:38:    decision,
apps/customer-web\app\_screens\proposal-decision-actions.ts:41:    approvedOption: decision === 'approved' ? read('approvedOption') : undefined,
apps/customer-web\app\_screens\proposal-decision-actions.ts:50:        "this proposal has not been sent to you yet" and "you already answered
apps/customer-web\app\_screens\proposal-decision-actions.ts:63:          ? (result.message ?? 'Your account may not answer this proposal.')
apps/customer-web\app\_screens\proposal-decision-actions.ts:67:              ? 'That proposal is no longer available. Reload the page.'
apps/customer-web\app\_screens\proposal-decision-actions.ts:72:  // Every customer screen that shows the state of a repair, because a decision
apps/customer-web\app\_screens\proposal-decision-actions.ts:73:  // moves the job card as well as the proposal. Revalidating only this page
apps/customer-web\app\_screens\proposal-decision-actions.ts:76:    '/service-and-repairs/repair-proposals',
apps/customer-web\app\_screens\proposal-decision-actions.ts:86:      decision === 'approved'
apps/customer-web\app\_screens\proposal-decision-actions.ts:88:        : decision === 'declined'
apps/customer-web\app\_screens\parts-orders-screen.tsx:148:              provider is configured — that is the owner's decision — so what the
apps/customer-web\app\_screens\parts-order-actions.ts:99: * is configured, and choosing one is the owner's decision alone. Cash, bank
apps/customer-web\app\_screens\basket-panel.tsx:274:        not exist. No payment provider is configured — that decision is the
apps/workshop-web\app\_screens\variations-screen.tsx:55:  decision: string | null;
apps/workshop-web\app\_screens\variations-screen.tsx:57:  decisionChannel: string | null;
apps/workshop-web\app\_screens\variations-screen.tsx:58:  decisionNote: string | null;
apps/workshop-web\app\_screens\variations-screen.tsx:289:        {v.decisionChannel ? ` (${v.decisionChannel.replace('_', ' ')})` : ''}
apps/workshop-web\app\_screens\variations-screen.tsx:292:      {v.decisionNote && <Detail label="What they said" value={v.decisionNote} />}
apps/workshop-web\app\_screens\variation-forms.tsx:177:  const [decision, setDecision] = React.useState('');
apps/workshop-web\app\_screens\variation-forms.tsx:179:  const needsConsent = chargeable && decision === 'approved';
apps/workshop-web\app\_screens\variation-forms.tsx:180:  const needsReason = decision === 'rejected';
apps/workshop-web\app\_screens\variation-forms.tsx:189:      <Field label="What did the customer say?" htmlFor="decision">
apps/workshop-web\app\_screens\variation-forms.tsx:191:          id="decision"
apps/workshop-web\app\_screens\variation-forms.tsx:192:          name="decision"
apps/workshop-web\app\_screens\variation-forms.tsx:194:          value={decision}
apps/workshop-web\app\_screens\variation-forms.tsx:214:          <Field label="How did they approve it?" htmlFor="decisionChannel">
apps/workshop-web\app\_screens\variation-forms.tsx:216:              id="decisionChannel"
apps/workshop-web\app\_screens\variation-forms.tsx:217:              name="decisionChannel"
apps/workshop-web\app\_screens\variation-forms.tsx:234:        htmlFor="decisionNote"
apps/workshop-web\app\_screens\variation-forms.tsx:241:        <TextInput id="decisionNote" name="decisionNote" required={needsReason} maxLength={4000} />
apps/workshop-web\app\_screens\variation-forms.tsx:244:      {decision === 'approved' && (
apps/workshop-web\app\_screens\variation-actions.ts:104:  const decision = String(form.get('decision') ?? '');
apps/workshop-web\app\_screens\variation-actions.ts:107:    `/variations/${variationId}/decision`,
apps/workshop-web\app\_screens\variation-actions.ts:109:      decision,
apps/workshop-web\app\_screens\variation-actions.ts:111:      decisionChannel: String(form.get('decisionChannel') ?? ''),
apps/workshop-web\app\_screens\variation-actions.ts:112:      decisionNote: String(form.get('decisionNote') ?? ''),
apps/workshop-web\app\_screens\variation-actions.ts:119:  if (decision === 'approved') {
apps/workshop-web\app\_screens\variation-actions.ts:125:  if (decision === 'modified') {
apps/workshop-web\app\_screens\testing-actions.ts:221: * ⚠️ THIS IS NOT A CHECKBOX. It is a decision with a name against it, held to a narrower
packages\next-shell\src\WorkspaceShell.tsx:55:   * The single-decision-point rule still holds — `viewerRole()` remains the only
packages\next-shell\src\WorkspaceGate.tsx:52: * decision, so it must be assertable without a React renderer, a DOM or a Next
packages\next-shell\src\viewer-contract.ts:21: * So: this file knows how to TURN a viewer into navigation decisions and never
apps/workshop-web\app\_screens\repair-plan-sheet-screen.tsx:35: * "this plan is finished and a revised proposal is a new attempt".
apps/workshop-web\app\_screens\repair-plan-sheet-screen.tsx:179:            This plan cannot be changed. Record a revised proposal as a new plan from the
apps/workshop-web\app\_screens\repair-plan-sheet-screen.tsx:307:      return 'Approved. This is the plan of record for this attempt, and what the quotation is priced from; a revised proposal is a new attempt.';
apps/workshop-web\app\_screens\repair-plan-review-form.tsx:17: * `<button name="decision" value="...">` puts the choice in the submitted data, so
apps/workshop-web\app\_screens\repair-plan-review-form.tsx:18: * which button was pressed IS the decision — there is no hidden state that can
apps/workshop-web\app\_screens\repair-plan-review-form.tsx:61:    // `submitter` is what carries the decision — see the header note. Read before any
apps/workshop-web\app\_screens\repair-plan-review-form.tsx:64:    const decision = submitter?.value === 'rejected' ? 'rejected' : 'approved';
apps/workshop-web\app\_screens\repair-plan-review-form.tsx:72:    data.set('decision', decision);
apps/workshop-web\app\_screens\repair-plan-review-form.tsx:74:    setPending(decision);
apps/workshop-web\app\_screens\repair-plan-review-form.tsx:183:          {/* States the consequence before either button is pressed. Neither decision can
apps/workshop-web\app\_screens\repair-plan-review-form.tsx:185:          A decision cannot be undone: a rejected plan is kept as the record of the
apps/workshop-web\app\_screens\repair-plan-review-form.tsx:186:          disagreement rather than reopened, and a revised proposal is a new attempt.
apps/workshop-web\app\_screens\repair-plan-review-form.tsx:202:            name="decision"
apps/workshop-web\app\_screens\repair-plan-review-form.tsx:205:            style={decisionButton(pending === 'approved', primitive.color.blue[600])}
apps/workshop-web\app\_screens\repair-plan-review-form.tsx:211:            name="decision"
apps/workshop-web\app\_screens\repair-plan-review-form.tsx:214:            style={decisionButton(pending === 'rejected', primitive.color.red[700])}
apps/workshop-web\app\_screens\repair-plan-review-form.tsx:224:function decisionButton(busy: boolean, background: string) {
apps/workshop-web\app\_screens\repair-plan-queue-screen.tsx:312:                          repair plan to record a revised proposal" — so that has to be
apps/workshop-web\app\_screens\repair-plan-labels.ts:87: * The opposite decision to the hours, and for a reason: quantities are usually whole
apps/workshop-web\app\_screens\repair-plan-builder-form.tsx:529:          so it must not move underneath them — and a revised proposal is a new attempt.
apps/workshop-web\app\_screens\repair-plan-actions.ts:415:  const decision = String(formData.get('decision') ?? '').trim();
apps/workshop-web\app\_screens\repair-plan-actions.ts:421:  if (decision !== 'approved' && decision !== 'rejected') {
apps/workshop-web\app\_screens\repair-plan-actions.ts:424:  if (decision === 'rejected' && note === '') {
apps/workshop-web\app\_screens\repair-plan-actions.ts:434:    { decision, note: note === '' ? undefined : note },
apps/workshop-web\app\_screens\quotation-sheet-screen.tsx:22: *   2. SUBMITTED, and this viewer may approve it — the document plus §5's decision.
apps/workshop-web\app\_screens\quotation-review-form.tsx:12: * ONE FORM, TWO BUTTONS, the decision carried by the button that was pressed:
apps/workshop-web\app\_screens\quotation-review-form.tsx:13: * `<button name="decision" value="...">` puts the choice in the submitted data, so
apps/workshop-web\app\_screens\quotation-review-form.tsx:44:    const decision = submitter?.value === 'rejected' ? 'rejected' : 'approved';
apps/workshop-web\app\_screens\quotation-review-form.tsx:49:    data.set('decision', decision);
apps/workshop-web\app\_screens\quotation-review-form.tsx:51:    setPending(decision);
apps/workshop-web\app\_screens\quotation-review-form.tsx:112:          A decision cannot be undone: a rejected quotation is kept as the record of the
apps/workshop-web\app\_screens\quotation-review-form.tsx:123:          <button type="submit" name="decision" value="approved" disabled={pending !== null}
apps/workshop-web\app\_screens\quotation-review-form.tsx:127:          <button type="submit" name="decision" value="rejected" disabled={pending !== null}
apps/workshop-web\app\_screens\quotation-actions.ts:223:  const decision = String(formData.get('decision') ?? '').trim();
apps/workshop-web\app\_screens\quotation-actions.ts:227:  if (decision !== 'approved' && decision !== 'rejected') {
apps/workshop-web\app\_screens\quotation-actions.ts:230:  if (decision === 'rejected' && note === '') {
apps/workshop-web\app\_screens\quotation-actions.ts:237:    { decision, note: note === '' ? undefined : note },
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:6:import { ProposalNarrativeForm } from './proposal-narrative-form';
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:7:import { ProposalDecisionForm } from './proposal-decision-form';
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:8:import { ProposalDocument, type ProposalDocumentData } from './proposal-document';
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:14:} from './proposal-labels';
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:17: * One customer proposal — `1.txt` §410-§422's document, `07.txt` §7's decision.
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:47:  status: 'draft' | 'issued' | 'approved' | 'declined' | 'changes_requested' | 'superseded';
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:54:  decision: string | null;
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:58:  decisionChannelLabel: string | null;
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:59:  decisionNote: string | null;
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:79:  decidable: boolean;
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:84:  proposalId,
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:87:  proposalId: string;
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:90:    <Suspense fallback={<LoadingState label="Loading the proposal…" />}>
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:91:      <Sheet route={route} proposalId={proposalId} />
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:96:async function Sheet({ route, proposalId }: { route: string; proposalId: string }) {
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:97:  const result = await apiGet<Proposal>('workshop', `/proposals/${proposalId}`);
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:108:          Back to the proposal queue
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:114:      {p.decision !== null ? (
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:116:          role={p.decision === 'approved' ? 'status' : 'alert'}
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:121:              p.decision === 'approved' ? themeVar.borderDefault : primitive.color.red[700]
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:131:              color: p.decision === 'approved' ? themeVar.textPrimary : primitive.color.red[700],
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:134:            {p.decision === 'approved'
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:136:              : p.decision === 'declined'
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:144:            {p.decisionChannelLabel ? ` · ${p.decisionChannelLabel}` : ''}
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:154:          {p.decisionNote ? (
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:156:              {p.decisionNote}
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:159:          {p.decision !== 'approved' ? (
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:175:      {p.status === 'superseded' ? (
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:224:          proposalId={p.id}
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:234:      {p.decidable ? (
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:236:          proposalId={p.id}
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:245:      {p.status === 'issued' && !p.decidable ? (
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:254:          This proposal is with the customer. Your role can read it but not record their
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:255:          decision — reception, a manager or the owner does that.
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:267:        : 'A draft proposal. Your role can read it but not change it.';
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:8:import { PrepareProposalForm } from './prepare-proposal-form';
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:9:import { PROPOSAL_STATUS_KIND, PROPOSAL_STATUS_LABEL, formatMoney } from './proposal-labels';
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:12: * The customer-proposal queue — `1.txt` §396-§424, `07.txt` §7. Three workshop routes:
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:14: *   §34 default  `/solution-and-approval/customer-proposals`  "Customer Proposals"
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:18: * The fourth `repair-proposals` item in `workspaces.ts` belongs to the CUSTOMER
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:21: * decision taken by telephone or in person, which §7 requires in any case since it
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:27: * proposal sitting unanswered is a car sitting in a bay. And unlike every other queue
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:29: * to be impossible to miss. Issued proposals sort first.
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:45:  status: 'draft' | 'issued' | 'approved' | 'declined' | 'changes_requested' | 'superseded';
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:48:  decisionChannelLabel: string | null;
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:52:  decidable: boolean;
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:55:/** The stages at which a proposal is the work in hand. */
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:64:        description="What the customer has been shown, and what they said. A proposal presents an approved quotation; once the customer approves it, §424 makes it immutable and any material change needs a new version."
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:66:      <Suspense fallback={<LoadingState label="Loading the proposal queue…" />}>
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:74:  const [cardsResult, proposalsResult] = await Promise.all([
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:76:    apiGet<Proposal[]>('workshop', '/proposals'),
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:79:  if (!proposalsResult.ok) return <ApiFailure reason={proposalsResult.reason} workspaceId="workshop" />;
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:84:  for (const p of proposalsResult.data) {
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:96:        title="No customer proposals"
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:122:          {waiting > 0 ? `${waiting} proposal(s) waiting on the customer. ` : ''}
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:137:            Customer proposals, their version, what the customer decided and what they agreed to pay
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:191:                          {p.decisionChannelLabel ? ` (${p.decisionChannelLabel})` : null}
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:236:                          {p.decidable ? 'Record decision on' : p.editable ? 'Write' : 'View'}{' '}
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:237:                          proposal for {card.jobNumber}
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:243:                            answered proposal says to prepare a new version. */}
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:280:        by email — and the channel is recorded against the decision. Self-service
apps/workshop-web\app\_screens\proposal-narrative-form.tsx:6:import { issueProposalAction, recordProposalNarrativeAction } from './proposal-actions';
apps/workshop-web\app\_screens\proposal-narrative-form.tsx:9: * The three things a person writes on a proposal — §418's expected result and §422's
apps/workshop-web\app\_screens\proposal-narrative-form.tsx:24: * than after: once the proposal is with the customer, its content cannot change, and a
apps/workshop-web\app\_screens\proposal-narrative-form.tsx:28:  proposalId,
apps/workshop-web\app\_screens\proposal-narrative-form.tsx:36:  proposalId: string;
apps/workshop-web\app\_screens\proposal-narrative-form.tsx:116:          data.set('proposalId', proposalId);
apps/workshop-web\app\_screens\proposal-narrative-form.tsx:124:          note="Required before the proposal can be issued. In plain language: what will be different for the customer once the work is done."
apps/workshop-web\app\_screens\proposal-narrative-form.tsx:207:          promise attached is not a proposal.
apps/workshop-web\app\_screens\proposal-narrative-form.tsx:215:          data.set('proposalId', proposalId);
apps/workshop-web\app\_screens\proposal-narrative-form.tsx:222:          aria-label={`Issue the proposal for job card ${jobNumber} to the customer`}
apps/workshop-web\app\_screens\proposal-labels.ts:17:  superseded: 'Superseded',
apps/workshop-web\app\_screens\proposal-labels.ts:23: * `changes_requested` is `blocked`: the workshop must act. `superseded` is muted — a
apps/workshop-web\app\_screens\proposal-labels.ts:32:  superseded: 'draft',
apps/workshop-web\app\_screens\proposal-labels.ts:35:/** §7's channels — recording HOW a decision arrived is what makes it investigable. */
apps/workshop-web\app\_screens\proposal-labels.ts:58:/** Money in the proposal's own currency — never defaulted, see the quotation labels. */
apps/workshop-web\app\_screens\proposal-document.tsx:2:import { PROPOSAL_OPTION_LABEL, formatMoney } from './proposal-labels';
apps/workshop-web\app\_screens\proposal-document.tsx:55:  decision: string | null;
apps/workshop-web\app\_screens\proposal-document.tsx:59:  decisionChannelLabel: string | null;
apps/workshop-web\app\_screens\proposal-document.tsx:60:  decisionNote: string | null;
apps/workshop-web\app\_screens\proposal-document.tsx:295:            Not yet written. This proposal cannot be issued until it is.
apps/workshop-web\app\_screens\proposal-document.tsx:334:            ? `This proposal is open for acceptance until ${v.validUntil}.`
apps/workshop-web\app\_screens\proposal-document.tsx:335:            : 'No validity period has been set for this proposal.'}
apps/workshop-web\app\_screens\proposal-document.tsx:346:      {data.decision === null ? (
apps/workshop-web\app\_screens\proposal-document.tsx:349:            Work will not begin until this proposal is accepted. Please confirm which
apps/workshop-web\app\_screens\proposal-document.tsx:354:              workshop records the decision through the form below the document. */}
apps/workshop-web\app\_screens\proposal-document.tsx:377:            {data.decision === 'approved'
apps/workshop-web\app\_screens\proposal-document.tsx:379:              : data.decision === 'declined'
apps/workshop-web\app\_screens\proposal-document.tsx:384:          {data.decisionChannelLabel ? <Term label="Given">{data.decisionChannelLabel}</Term> : null}
apps/workshop-web\app\_screens\proposal-document.tsx:396:          {data.decisionNote ? <Term label="Noted">{data.decisionNote}</Term> : null}
packages\navigation\src\workspaces.ts:67:    ['repair-proposals', 'Repair Proposals', { counterKey: 'customer.proposals.pending' }],
packages\navigation\src\workspaces.ts:178:    ['customer-proposals', 'Customer Proposals'],
packages\navigation\src\workspaces.ts:180:    ['approvals', 'Approvals', { counterKey: 'workshop.proposals.pendingApproval' }],
packages\navigation\src\workspaces.ts:679:    ['customer-approval', 'Customer Approval', { counterKey: 'workshop.proposals.pendingApproval' }],
packages\navigation\src\workspaces.ts:739:    ['pending-approvals', 'Pending Approvals', { counterKey: 'workshop.proposals.pendingApproval' }],
packages\navigation\src\workspaces.ts:841:    audience: 'Vehicle owners — garage, complaints, proposals, payments',
apps/workshop-web\app\_screens\proposal-decision-form.tsx:6:import { recordProposalDecisionAction } from './proposal-actions';
apps/workshop-web\app\_screens\proposal-decision-form.tsx:12:} from './proposal-labels';
apps/workshop-web\app\_screens\proposal-decision-form.tsx:31: * ⚠️ NOT THE AUTHORIZATION POINT. Renders only when the API said `decidable`. The
apps/workshop-web\app\_screens\proposal-decision-form.tsx:36:  proposalId,
apps/workshop-web\app\_screens\proposal-decision-form.tsx:43:  proposalId: string;
apps/workshop-web\app\_screens\proposal-decision-form.tsx:56:  const [decision, setDecision] = React.useState<'approved' | 'declined' | 'changes_requested'>(
apps/workshop-web\app\_screens\proposal-decision-form.tsx:63:    data.set('decision', decision);
apps/workshop-web\app\_screens\proposal-decision-form.tsx:64:    setPending(decision);
apps/workshop-web\app\_screens\proposal-decision-form.tsx:69:      // The whole page changes — the proposal becomes immutable and this form
apps/workshop-web\app\_screens\proposal-decision-form.tsx:98:        Record the customer&rsquo;s decision
apps/workshop-web\app\_screens\proposal-decision-form.tsx:107:        Job {jobNumber} for {customerName}. Once recorded, §424 makes this proposal
apps/workshop-web\app\_screens\proposal-decision-form.tsx:112:        <input type="hidden" name="proposalId" value={proposalId} />
apps/workshop-web\app\_screens\proposal-decision-form.tsx:131:                name="decisionChoice"
apps/workshop-web\app\_screens\proposal-decision-form.tsx:133:                checked={decision === value}
apps/workshop-web\app\_screens\proposal-decision-form.tsx:141:        {decision === 'approved' ? (
apps/workshop-web\app\_screens\proposal-decision-form.tsx:186:            <label htmlFor="decision-channel" style={labelStyle}>
apps/workshop-web\app\_screens\proposal-decision-form.tsx:189:            <select id="decision-channel" name="decisionChannel" defaultValue="in_person" style={input}>
apps/workshop-web\app\_screens\proposal-decision-form.tsx:200:          <label htmlFor="decision-note" style={labelStyle}>
apps/workshop-web\app\_screens\proposal-decision-form.tsx:201:            {decision === 'approved'
apps/workshop-web\app\_screens\proposal-decision-form.tsx:206:            id="decision-note"
apps/workshop-web\app\_screens\proposal-decision-form.tsx:214:              decision === 'approved'
apps/workshop-web\app\_screens\proposal-decision-form.tsx:236:          aria-label={`Record the customer decision for job card ${jobNumber}`}
apps/workshop-web\app\_screens\proposal-decision-form.tsx:250:          {pending !== null ? 'Recording…' : 'Record decision'}
packages\navigation\src\resolve.test.ts:334:   * attached to the decision.
apps/api\src\tenancy\tenant-context.ts:14:// Ranks roles for the DEFAULT selection only. Not an authorization decision:
apps/workshop-web\app\_screens\proposal-actions.ts:8: * Preparing, issuing and answering a customer proposal — `1.txt` §396-§424, `07.txt` §7.
apps/workshop-web\app\_screens\proposal-actions.ts:14: * a proposal, who may record a decision, that the quotation behind it is APPROVED, and
apps/workshop-web\app\_screens\proposal-actions.ts:15: * §424's immutability — an approved proposal cannot be edited, only superseded by a new
apps/workshop-web\app\_screens\proposal-actions.ts:39:  '/solution-and-approval/customer-proposals',
apps/workshop-web\app\_screens\proposal-actions.ts:57:/** Draft a proposal, or §424's new VERSION of one. */
apps/workshop-web\app\_screens\proposal-actions.ts:64:    `/job-cards/${jobCardId}/proposals`,
apps/workshop-web\app\_screens\proposal-actions.ts:77:  const proposalId = String(formData.get('proposalId') ?? '').trim();
apps/workshop-web\app\_screens\proposal-actions.ts:78:  if (!proposalId) return { error: 'That proposal could not be identified. Reload the page.' };
apps/workshop-web\app\_screens\proposal-actions.ts:80:  const result = await apiPatch<{ id: string }>('workshop', `/proposals/${proposalId}`, {
apps/workshop-web\app\_screens\proposal-actions.ts:96:  const proposalId = String(formData.get('proposalId') ?? '').trim();
apps/workshop-web\app\_screens\proposal-actions.ts:97:  if (!proposalId) return { error: 'That proposal could not be identified. Reload the page.' };
apps/workshop-web\app\_screens\proposal-actions.ts:101:    `/proposals/${proposalId}/issue`,
apps/workshop-web\app\_screens\proposal-actions.ts:122:  const proposalId = String(formData.get('proposalId') ?? '').trim();
apps/workshop-web\app\_screens\proposal-actions.ts:123:  const decision = String(formData.get('decision') ?? '').trim();
apps/workshop-web\app\_screens\proposal-actions.ts:125:  const decisionChannel = String(formData.get('decisionChannel') ?? '').trim();
apps/workshop-web\app\_screens\proposal-actions.ts:129:  if (!proposalId) return { error: 'That proposal could not be identified. Reload the page.' };
apps/workshop-web\app\_screens\proposal-actions.ts:130:  if (!['approved', 'declined', 'changes_requested'].includes(decision)) {
apps/workshop-web\app\_screens\proposal-actions.ts:136:  if (decisionChannel === '') {
apps/workshop-web\app\_screens\proposal-actions.ts:139:  if (decision === 'approved' && approvedOption === '') {
apps/workshop-web\app\_screens\proposal-actions.ts:142:  if (decision !== 'approved' && note === '') {
apps/workshop-web\app\_screens\proposal-actions.ts:148:  const result = await apiPost<{ jobNumber: string; decision: string; versionNo: number }>(
apps/workshop-web\app\_screens\proposal-actions.ts:150:    `/proposals/${proposalId}/decision`,
apps/workshop-web\app\_screens\proposal-actions.ts:152:      decision,
apps/workshop-web\app\_screens\proposal-actions.ts:154:      decisionChannel,
apps/workshop-web\app\_screens\proposal-actions.ts:155:      approvedOption: decision === 'approved' ? approvedOption : undefined,
apps/workshop-web\app\_screens\proposal-actions.ts:164:      result.data.decision === 'approved'
apps/workshop-web\app\_screens\pricing-form.tsx:180:          them is the workshop owner&rsquo;s decision — ask an owner if they need to change.
apps/workshop-web\app\_screens\prepare-proposal-form.tsx:6:import { prepareProposalAction } from './proposal-actions';
apps/workshop-web\app\_screens\prepare-proposal-form.tsx:9: * "Prepare proposal" — and, on an answered proposal, §424's NEW VERSION.
apps/workshop-web\app\_screens\prepare-proposal-form.tsx:17: * proposal stage, the viewer may prepare one, no undecided version is outstanding, and
apps/workshop-web\app\_screens\prepare-proposal-form.tsx:25:  label = 'Prepare proposal',
apps/workshop-web\app\_screens\prepare-proposal-form.tsx:47:      setError('The request could not be completed. No proposal was prepared.');
apps/workshop-web\app\_screens\job-queue-definitions.ts:39:    emptyBody: 'No job is authorised to start. Approval happens on the proposal, after a quotation.',
apps/workshop-web\app\_screens\job-queue-definitions.ts:76:    emptyBody: 'No job is held for a customer decision or deposit.',
apps/api\src\security\security.controller.ts:19: * active role is the whole authorization decision below.
packages\marketplace-ui\src\marketplace-landing.tsx:343:          A PLAIN GET FORM, and that is a decision rather than a shortcut. The
packages\marketplace-ui\src\index.ts:16: * AutoWorkshop keeps its seven apps (that decision stands), so the equivalent
apps/api\src\security\security-posture.service.ts:264:   * decision", not "these are broken".
apps/api\src\security\security-posture.service.ts:415:   * CLAUDE.md: approvals, payments, warranty decisions and audit events are
apps/workshop-web\app\_screens\job-cards-screen.tsx:68: * ELSE — a customer decision, a deposit, a part. Those are the cards a manager
apps/workshop-web\app\_screens\job-card-detail-href.ts:54: * decision instead of a silent inheritance.
apps/customer-web\app\(app)\service-and-repairs\repair-proposals\page.tsx:5: * /service-and-repairs/repair-proposals — `01 (1).txt` §33, the customer workspace.
apps/customer-web\app\(app)\service-and-repairs\repair-proposals\page.tsx:20:  await requireNavRoute('customer', '/service-and-repairs/repair-proposals');
apps/workshop-web\app\_screens\execution-work-form.tsx:37: * `editable`. Every rule is in `ExecutionService`: the approved-proposal requirement,
apps/workshop-web\app\_screens\execution-work-form.tsx:390:            note="⚠️ If it is CHARGEABLE, it must be raised as a variation — a new quotation and a new proposal version — not simply carried out. Record it here so it is not lost."
apps/workshop-web\app\_screens\execution-sheet-screen.tsx:44:  proposalVersionNo: number;
apps/workshop-web\app\_screens\execution-sheet-screen.tsx:165:        <Fact label="Authorised by" value={`Proposal v${e.proposalVersionNo}`} />
apps/workshop-web\app\_screens\execution-queue-screen.tsx:70:        description="Vehicles being worked on. A repair cannot start until the customer has approved a proposal, and cannot be completed while an approved task is unfinished or somebody is still clocked on."
apps/workshop-web\app\_screens\execution-queue-screen.tsx:101:        description="A vehicle appears here once its job card is authorised to start, which follows the customer approving a proposal. Record a customer decision on the Customer Proposals screen first."
apps/workshop-web\app\_screens\execution-queue-screen.tsx:286:        during a repair must be raised as a VARIATION (a new quotation and a new proposal
apps/workshop-web\app\_screens\execution-actions.ts:14: * out a repair, that an APPROVED customer proposal exists (§7), that a blocked task
apps/api\src\repair\variation.spec.ts:122:    expect(() => parseDecision({ decision: 'approved' }, true)).toThrow(/name against it/i);
apps/api\src\repair\variation.spec.ts:123:    expect(() => parseDecision({ decision: 'approved', decidedByName: 'Mr Mensah' }, true))
apps/api\src\repair\variation.spec.ts:129:      { decision: 'approved', decidedByName: 'Mr Mensah', decisionChannel: 'phone' },
apps/api\src\repair\variation.spec.ts:132:    expect(out.decision).toBe('approved');
apps/api\src\repair\variation.spec.ts:142:    expect(() => parseDecision({ decision: 'approved' }, false)).not.toThrow();
apps/api\src\repair\variation.spec.ts:146:    expect(() => parseDecision({ decision: 'rejected' }, true)).toThrow(/must give a reason/i);
apps/api\src\repair\variation.spec.ts:147:    expect(() => parseDecision({ decision: 'rejected' }, false)).toThrow(/must give a reason/i);
apps/api\src\repair\variation.spec.ts:149:      parseDecision({ decision: 'rejected', decisionNote: 'Sourcing the part elsewhere.' }, true)
apps/api\src\repair\variation.spec.ts:150:        .decisionNote,
apps/api\src\repair\variation.spec.ts:156:    // is why it is a decision in its own right and not a flavour of rejection.
apps/api\src\repair\variation.spec.ts:157:    expect(parseDecision({ decision: 'modified' }, true).decision).toBe('modified');
apps/api\src\repair\variation.spec.ts:163:        { decision: 'approved', decidedByName: 'X', decisionChannel: 'carrier_pigeon' },
apps/api\src\repair\variation.spec.ts:169:  it('refuses a decision that is not one of the three', () => {
apps/api\src\repair\variation.spec.ts:171:      expect(() => parseDecision({ decision: bad }, true), String(bad)).toThrow(/approved, rejected/i);
apps/api\src\repair\variation.service.ts:266:   * Record the customer's decision, and — only for an approval — authorise the
apps/api\src\repair\variation.service.ts:290:          `a decision can only be recorded once the variation has been sent to the customer; ` +
apps/api\src\repair\variation.service.ts:304:      if (input.decision === 'modified') {
apps/api\src\repair\variation.service.ts:307:        // `sent_to_customer -> draft` and why this is a decision in its own
apps/api\src\repair\variation.service.ts:311:              SET status='draft', decision_note=$2, recorded_by=$3,
apps/api\src\repair\variation.service.ts:314:          [variationId, input.decisionNote, ctx.userId],
apps/api\src\repair\variation.service.ts:319:      const approved = input.decision === 'approved';
apps/api\src\repair\variation.service.ts:323:                decision = $2,
apps/api\src\repair\variation.service.ts:326:                decision_channel = $4,
apps/api\src\repair\variation.service.ts:327:                decision_note = $5,
apps/api\src\repair\variation.service.ts:342:          input.decisionChannel,
apps/api\src\repair\variation.service.ts:343:          input.decisionNote,
apps/api\src\repair\variation.service.ts:396:      decision: (r['decision'] as string | null) ?? null,
apps/api\src\repair\variation.service.ts:398:      decisionChannel: (r['decision_channel'] as string | null) ?? null,
apps/api\src\repair\variation.service.ts:399:      decisionNote: (r['decision_note'] as string | null) ?? null,
apps/api\src\repair\variation-rules.ts:51: * Who may REVIEW one internally, and who may record the customer's decision.
apps/api\src\repair\variation-rules.ts:187:  decision: 'approved' | 'rejected' | 'modified';
apps/api\src\repair\variation-rules.ts:189:  decisionChannel: string | null;
apps/api\src\repair\variation-rules.ts:190:  decisionNote: string | null;
apps/api\src\repair\variation-rules.ts:209:  const decision = String(raw['decision'] ?? '').trim();
apps/api\src\repair\variation-rules.ts:210:  if (decision !== 'approved' && decision !== 'rejected' && decision !== 'modified') {
apps/api\src\repair\variation-rules.ts:212:      'the decision must be approved, rejected, or modified (the customer wants it changed)',
apps/api\src\repair\variation-rules.ts:218:  const decisionChannel = String(raw['decisionChannel'] ?? '').trim() || null;
apps/api\src\repair\variation-rules.ts:219:  const decisionNote = String(raw['decisionNote'] ?? '').trim() || null;
apps/api\src\repair\variation-rules.ts:221:  if (decisionChannel !== null && !(DECISION_CHANNELS as readonly string[]).includes(decisionChannel)) {
apps/api\src\repair\variation-rules.ts:225:  if (decision === 'approved' && chargeable) {
apps/api\src\repair\variation-rules.ts:229:    if (!decisionChannel) {
apps/api\src\repair\variation-rules.ts:236:  if (decision === 'rejected' && !decisionNote) {
apps/api\src\repair\variation-rules.ts:240:  if (decisionNote && decisionNote.length > MAX_TEXT) {
apps/api\src\repair\variation-rules.ts:241:    problems.push(`the decision note must be ${MAX_TEXT} characters or fewer`);
apps/api\src\repair\variation-rules.ts:246:  return { decision, decidedByName, decisionChannel, decisionNote };
apps/api\src\repair\testing.spec.ts:354:    // A safety audit reads the override list expecting every row to be a real decision.
apps/api\src\repair\testing.service.ts:476:        // safety audit reads it expecting every row to be a real decision.
apps/api\src\repair\repair.schemas.ts:22: * They do NOT enumerate the VALUE DOMAINS: `toStage`, `decision`, `outcome`,
apps/api\src\repair\repair.schemas.ts:51: * A decision plus a note — the shape of every submit/review endpoint across
apps/api\src\repair\repair.schemas.ts:52: * diagnoses, repair plans, quotations and proposals. Written once so the four
apps/api\src\repair\repair.schemas.ts:56:  decision: optionalText(40),
apps/api\src\repair\repair.schemas.ts:242:// ── proposals ──────────────────────────────────────────────────────────────
apps/api\src\repair\repair.schemas.ts:253: * The customer's decision on a proposal.
apps/api\src\repair\repair.schemas.ts:254: * ⚠️ `decidedByName` and `decisionChannel` are the CONSENT RECORD — slice 7b
apps/api\src\repair\repair.schemas.ts:259:  decision: optionalText(40),
apps/api\src\repair\repair.schemas.ts:262:  decisionChannel: optionalText(60),
apps/api\src\repair\repair.schemas.ts:268: * The customer's decision, made BY the customer in their own workspace.
apps/api\src\repair\repair.schemas.ts:270: * 🔴 THE ABSENCE OF `decidedByName` AND `decisionChannel` IS THE SECURITY
apps/api\src\repair\repair.schemas.ts:273: * the name from the customer record the proposal hangs off, the channel from
apps/api\src\repair\repair.schemas.ts:278: * recording exists for. `decided_by_name` and `decision_channel` are the consent
apps/api\src\repair\repair.schemas.ts:287:  decision: optionalText(40),
apps/api\src\repair\repair.module.ts:19:import { ProposalService } from './proposal.service';
apps/workshop-web\app\_screens\diagnosis-review-form.tsx:16: * press the other's button. `<button name="decision" value="...">` puts the choice in
apps/workshop-web\app\_screens\diagnosis-review-form.tsx:17: * the submitted data, so which button was pressed IS the decision — there is no
apps/workshop-web\app\_screens\diagnosis-review-form.tsx:48:    // `submitter` is what carries the decision — see the header note. Read before any
apps/workshop-web\app\_screens\diagnosis-review-form.tsx:51:    const decision = submitter?.value === 'rejected' ? 'rejected' : 'approved';
apps/workshop-web\app\_screens\diagnosis-review-form.tsx:59:    data.set('decision', decision);
apps/workshop-web\app\_screens\diagnosis-review-form.tsx:61:    setPending(decision);
apps/workshop-web\app\_screens\diagnosis-review-form.tsx:151:          {/* States the consequence before either button is pressed. Neither decision
apps/workshop-web\app\_screens\diagnosis-review-form.tsx:154:          A decision cannot be undone: a rejected diagnosis is kept as the record of the
apps/workshop-web\app\_screens\diagnosis-review-form.tsx:170:            name="decision"
apps/workshop-web\app\_screens\diagnosis-review-form.tsx:173:            style={decisionButton(pending === 'approved', primitive.color.blue[600])}
apps/workshop-web\app\_screens\diagnosis-review-form.tsx:179:            name="decision"
apps/workshop-web\app\_screens\diagnosis-review-form.tsx:182:            style={decisionButton(pending === 'rejected', primitive.color.red[700])}
apps/workshop-web\app\_screens\diagnosis-review-form.tsx:192:function decisionButton(busy: boolean, background: string) {
apps/api\src\repair\repair.controller.ts:21:import { ProposalService } from './proposal.service';
apps/api\src\repair\repair.controller.ts:81:    private readonly proposals: ProposalService,
apps/api\src\repair\repair.controller.ts:250:  /** The customer proposals for a job card — `1.txt` §396-§424 (slice 6). */
apps/api\src\repair\repair.controller.ts:251:  @Get(':id/proposals')
apps/api\src\repair\repair.controller.ts:256:    return this.proposals.listForJobCard(req.tenantContext, id);
apps/api\src\repair\repair.controller.ts:260:   * Draft a proposal from the approved quotation — or §424's NEW VERSION of it.
apps/api\src\repair\repair.controller.ts:265:  @Post(':id/proposals')
apps/api\src\repair\repair.controller.ts:270:    return this.proposals.prepare(req.tenantContext, id);
apps/api\src\repair\repair.controller.ts:285:   * The service refuses unless an APPROVED customer proposal exists (§7: work shall
apps/api\src\repair\repair.controller.ts:799: * A SEPARATE controller, the judgement every sibling here made: recording a decision
apps/api\src\repair\repair.controller.ts:802:@Controller('proposals')
apps/api\src\repair\repair.controller.ts:805:  constructor(private readonly proposals: ProposalService) {}
apps/api\src\repair\repair.controller.ts:813:    return this.proposals.list(req.tenantContext);
apps/api\src\repair\repair.controller.ts:821:    return this.proposals.findById(req.tenantContext, id);
apps/api\src\repair\repair.controller.ts:836:    return this.proposals.recordNarrative(req.tenantContext, id, body ?? {});
apps/api\src\repair\repair.controller.ts:840:   * Put the proposal in front of the customer.
apps/api\src\repair\repair.controller.ts:850:    return this.proposals.issue(req.tenantContext, id);
apps/api\src\repair\repair.controller.ts:859:  @Post(':id/decision')
apps/api\src\repair\repair.controller.ts:865:    return this.proposals.recordDecision(req.tenantContext, id, body ?? {});
apps/api\src\repair\repair.controller.ts:871:   * A SEPARATE ROUTE from `:id/decision`, and the body is the reason: this one
apps/api\src\repair\repair.controller.ts:872:   * accepts only the decision, the option and a note. `decidedByName`,
apps/api\src\repair\repair.controller.ts:873:   * `decisionChannel` and `recorded_by` are DERIVED from the session and the
apps/api\src\repair\repair.controller.ts:876:   * person's name, and accepting `decisionChannel` would let a portal approval
apps/api\src\repair\repair.controller.ts:882:  @Post(':id/customer-decision')
apps/api\src\repair\repair.controller.ts:888:    return this.proposals.recordCustomerDecision(req.tenantContext, id, body ?? {});
apps/api\src\repair\repair.controller.ts:1075:   * themselves is not an approval, and §35 exists precisely so that decision has a name
apps/api\src\repair\repair.controller.ts:1186: * phone. So `decidedByName` and `decisionChannel` are what carry the consent,
apps/api\src\repair\repair.controller.ts:1223:  @Patch(':id/decision')
apps/api\src\repair\repair-plan.spec.ts:284:      service.review(ctx({ activeRole: 'technician' }), PLAN_ID, { decision: 'approved' }),
apps/api\src\repair\repair-plan.spec.ts:453:    // The nullability is a decision, so it is asserted rather than assumed: forcing a
apps/api\src\repair\repair-plan.spec.ts:700:    // ⚠️ REPORTED, NOT REFUSED — and this is the design decision, so it is asserted.
apps/api\src\repair\repair-plan.spec.ts:727:        decision: 'approved',
apps/api\src\repair\repair-plan.spec.ts:741:      decision: 'approved',
apps/api\src\repair\repair-plan.spec.ts:753:        decision: 'rejected',
apps/api\src\repair\repair-plan.spec.ts:764:        { decision: 'approved' },
apps/api\src\repair\repair-plan.spec.ts:773:        { decision: 'rejected', note: 'no' },
apps/api\src\repair\repair-plan.spec.ts:785:        { decision: 'approved' },
apps/api\src\repair\repair-plan.spec.ts:942:  it('keeps the review decisions a strict subset of the statuses', () => {
apps/api\src\repair\repair-plan.spec.ts:944:    for (const decision of PLAN_REVIEW_DECISIONS) {
apps/api\src\repair\repair-plan.spec.ts:945:      expect(REPAIR_PLAN_STATUSES).toContain(decision);
apps/api\src\repair\repair-plan.service.ts:986:   * It stops being writable and becomes the proposal the reviewer answers.
apps/api\src\repair\repair-plan.service.ts:1113:    input: { decision?: string; note?: string },
apps/api\src\repair\repair-plan.service.ts:1117:    const decision: PlanReviewDecision = requireOneOf(
apps/api\src\repair\repair-plan.service.ts:1118:      input.decision,
apps/api\src\repair\repair-plan.service.ts:1120:      'decision',
apps/api\src\repair\repair-plan.service.ts:1128:    if (decision === 'rejected' && note === null) {
apps/api\src\repair\repair-plan.service.ts:1176:        [decision, ctx.userId, note, id, ctx.tenantId],
apps/api\src\repair\repair-plan.service.ts:1180:        action: decision === 'approved' ? 'repair_plan.approved' : 'repair_plan.rejected',
apps/api\src\repair\repair-plan.service.ts:1186:        detail: { jobNumber: row.job_number, attemptNo: row.attempt_no, decision },
apps/api\src\repair\repair-plan.service.ts:1494:          'start a new repair plan to record a revised proposal',
apps/api\src\repair\repair-plan-rules.ts:28: * about it, and the next proposal is a NEW ATTEMPT. Reopening it would erase the
apps/api\src\repair\repair-plan-rules.ts:53: * Modelling five decisions where the database has two would put three statuses in
apps/api\src\repair\repair-plan-rules.ts:121: * ⚠️ THE ABSENCES, restated because they are decisions:
apps/api\src\repair\quotation.spec.ts:194:    // decision. This is the second separation, and it is the one a single role set
apps/api\src\repair\quotation.spec.ts:202:        ctx({ activeRole: 'reception_staff' }), QUOTE_ID, { decision: 'approved' },
apps/api\src\repair\quotation.spec.ts:214:        ctx({ activeRole: 'workshop_supervisor' }), QUOTE_ID, { decision: 'approved' },
apps/api\src\repair\quotation.spec.ts:279:    // The decision no later migration can repair: if these were READ at display time,
apps/api\src\repair\quotation.spec.ts:491:      new QuotationService(db, fakeAudit()).review(ctx({ userId: 'user-1' }), QUOTE_ID, { decision: 'approved' }),
apps/api\src\repair\quotation.spec.ts:502:    await new QuotationService(db, audit as never).review(ctx(), QUOTE_ID, { decision: 'approved' });
apps/api\src\repair\quotation.spec.ts:507:      new QuotationService(db2, fakeAudit()).review(ctx(), QUOTE_ID, { decision: 'rejected' }),
apps/api\src\repair\quotation.spec.ts:514:      new QuotationService(db, fakeAudit()).review(ctx(), QUOTE_ID, { decision: 'approved' }),
apps/api\src\repair\quotation.spec.ts:557:  it('keeps the review decisions a strict subset of the statuses', () => {
apps/api\src\repair\quotation.service.ts:663:    input: { decision?: string; note?: string },
apps/api\src\repair\quotation.service.ts:667:    const decision: QuotationReviewDecision = requireOneOf(
apps/api\src\repair\quotation.service.ts:668:      input.decision, QUOTATION_REVIEW_DECISIONS, 'decision',
apps/api\src\repair\quotation.service.ts:671:    if (decision === 'rejected' && note === null) {
apps/api\src\repair\quotation.service.ts:707:        [decision, ctx.userId, note, id, ctx.tenantId],
apps/api\src\repair\quotation.service.ts:711:        action: decision === 'approved' ? 'quotation.approved' : 'quotation.rejected',
apps/api\src\repair\quotation.service.ts:714:        detail: { jobNumber: row.job_number, attemptNo: row.attempt_no, decision },
apps/workshop-web\app\_screens\diagnosis-actions.ts:350:  const decision = String(formData.get('decision') ?? '').trim();
apps/workshop-web\app\_screens\diagnosis-actions.ts:356:  if (decision !== 'approved' && decision !== 'rejected') {
apps/workshop-web\app\_screens\diagnosis-actions.ts:359:  if (decision === 'rejected' && note === '') {
apps/workshop-web\app\_screens\diagnosis-actions.ts:369:    { decision, note: note === '' ? undefined : note },
apps/api\src\repair\quality.spec.ts:20: * What this file covers is the ROLE half and the decision logic.
apps/api\src\repair\quality.spec.ts:98:   * customer. Migration 030's `ck_qc_decision_consistent` refuses it in the
apps/api\src\repair\quality.service.ts:292:   * `parseQualityDecision`. Migration 030's `ck_qc_decision_consistent` makes
apps/api\src\repair\quality-rules.ts:9: * decisions are testable without a database. Every constraint below EXISTS IN
apps/api\src\repair\quality-rules.ts:84: * Normalise an inspector's decision.
apps/api\src\repair\quality-rules.ts:91: * customer. Migration 030's `ck_qc_decision_consistent` refuses that pairing at
apps/api\src\repair\proposal.spec.ts:4:import { ProposalService } from './proposal.service';
apps/api\src\repair\proposal.spec.ts:13:  decisionChannelLabel,
apps/api\src\repair\proposal.spec.ts:14:} from './proposal-rules';
apps/api\src\repair\proposal.spec.ts:18: * Customer proposals — Phase 5, slice 6.
apps/api\src\repair\proposal.spec.ts:21: * offer to a customer, that the attribution of a decision is mandatory, and that §424's
apps/api\src\repair\proposal.spec.ts:25: * rule; and by trigger in migration 017, proven by `verify/017_repair_proposals.sql` and
apps/api\src\repair\proposal.spec.ts:26: * end-to-end by `probe-proposal.mjs`. A fake client cannot enforce a constraint, so a
apps/api\src\repair\proposal.spec.ts:91:  decision: null,
apps/api\src\repair\proposal.spec.ts:95:  decision_channel: null,
apps/api\src\repair\proposal.spec.ts:96:  decision_note: null,
apps/api\src\repair\proposal.spec.ts:97:  superseded_by: null,
apps/api\src\repair\proposal.spec.ts:114:  decisionLookup: /p\.version_no, j\.job_number/,
apps/api\src\repair\proposal.spec.ts:123:  insert: /INSERT INTO repair\.repair_proposals/,
apps/api\src\repair\proposal.spec.ts:124:  update: /UPDATE repair\.repair_proposals/,
apps/api\src\repair\proposal.spec.ts:173:describe('proposal roles — a commercial offer, not a technical one', () => {
apps/api\src\repair\proposal.spec.ts:177:      /may not prepare a customer proposal/,
apps/api\src\repair\proposal.spec.ts:183:    ).rejects.toThrow(/may not prepare a customer proposal/);
apps/api\src\repair\proposal.spec.ts:200:    // commonest real case: reception issues a proposal and the customer answers them
apps/api\src\repair\proposal.spec.ts:238:  it('⚠️ refuses to supersede an APPROVED proposal without a fresh quotation', async () => {
apps/api\src\repair\proposal.spec.ts:252:  it('creates version n+1 and marks the one it replaces superseded', async () => {
apps/api\src\repair\proposal.spec.ts:265:    const supersede = queries.find((q) => Q.update.test(q.text) && /superseded_by/.test(q.text));
apps/api\src\repair\proposal.spec.ts:328:          headerRow({ status: 'approved', decision: 'approved', approved_option: 'recommended' }),
apps/api\src\repair\proposal.spec.ts:339:// ── the decision ───────────────────────────────────────────────────────────
apps/api\src\repair\proposal.spec.ts:343:    Q.decisionLookup,
apps/api\src\repair\proposal.spec.ts:344:    [{ id: PROPOSAL_ID, status: 'issued', version_no: 1, job_number: 'JC-1', superseded_by: null }],
apps/api\src\repair\proposal.spec.ts:351:        decision: 'approved', approvedOption: 'recommended', decisionChannel: 'telephone',
apps/api\src\repair\proposal.spec.ts:356:        decision: 'approved', approvedOption: 'recommended', decidedByName: 'Kwame',
apps/api\src\repair\proposal.spec.ts:358:    ).rejects.toThrow(/decisionChannel/);
apps/api\src\repair\proposal.spec.ts:362:    // §424: the answer belongs to the CURRENT version. A superseded row can
apps/api\src\repair\proposal.spec.ts:366:    const superseded = [
apps/api\src\repair\proposal.spec.ts:367:      Q.decisionLookup,
apps/api\src\repair\proposal.spec.ts:368:      [{ id: PROPOSAL_ID, status: 'issued', version_no: 1, job_number: 'JC-1', superseded_by: 'newer' }],
apps/api\src\repair\proposal.spec.ts:371:      new ProposalService(fakeDb([superseded]).db, fakeAudit()).recordDecision(ctx(), PROPOSAL_ID, {
apps/api\src\repair\proposal.spec.ts:372:        decision: 'approved', approvedOption: 'recommended',
apps/api\src\repair\proposal.spec.ts:373:        decidedByName: 'Kwame', decisionChannel: 'telephone',
apps/api\src\repair\proposal.spec.ts:375:    ).rejects.toThrow(/superseded by a newer proposal/);
apps/api\src\repair\proposal.spec.ts:383:        decision: 'changes_requested', decidedByName: 'Kwame', decisionChannel: 'telephone',
apps/api\src\repair\proposal.spec.ts:391:        decision: 'approved', decidedByName: 'Kwame', decisionChannel: 'in_person',
apps/api\src\repair\proposal.spec.ts:403:        decision: 'approved',
apps/api\src\repair\proposal.spec.ts:406:        decisionChannel: 'telephone',
apps/api\src\repair\proposal.spec.ts:416:      decision: 'approved',
apps/api\src\repair\proposal.spec.ts:422:  it('refuses a decision on a draft, and a second decision on a settled one', async () => {
apps/api\src\repair\proposal.spec.ts:423:    const draft = [Q.decisionLookup, [{ id: PROPOSAL_ID, status: 'draft', version_no: 1, job_number: 'JC-1', superseded_by: null }]] as [RegExp, unknown[]];
apps/api\src\repair\proposal.spec.ts:426:        decision: 'approved', approvedOption: 'recommended', decidedByName: 'K', decisionChannel: 'sms',
apps/api\src\repair\proposal.spec.ts:430:    const done = [Q.decisionLookup, [{ id: PROPOSAL_ID, status: 'approved', version_no: 1, job_number: 'JC-1', superseded_by: null }]] as [RegExp, unknown[]];
apps/api\src\repair\proposal.spec.ts:433:        decision: 'declined', decidedByName: 'K', decisionChannel: 'sms', note: 'no',
apps/api\src\repair\proposal.spec.ts:443:  // The lookup this route uses is the decision lookup PLUS the customer's own
apps/api\src\repair\proposal.spec.ts:446:    Q.decisionLookup,
apps/api\src\repair\proposal.spec.ts:447:    [{ id: PROPOSAL_ID, status: 'issued', version_no: 1, job_number: 'JC-1', display_name: 'Kwame Mensah', superseded_by: null }],
apps/api\src\repair\proposal.spec.ts:460:          { decision: 'approved', approvedOption: 'recommended' },
apps/api\src\repair\proposal.spec.ts:472:      customerCtx(), PROPOSAL_ID, { decision: 'approved', approvedOption: 'recommended' },
apps/api\src\repair\proposal.spec.ts:474:    const lookup = queries.find((q) => Q.decisionLookup.test(q.text));
apps/api\src\repair\proposal.spec.ts:490:        decision: 'approved',
apps/api\src\repair\proposal.spec.ts:493:        decisionChannel: 'telephone',
apps/api\src\repair\proposal.spec.ts:498:    expect(update?.text).toMatch(/decision_channel = 'customer_portal'/);
apps/api\src\repair\proposal.spec.ts:508:      customerCtx(), PROPOSAL_ID, { decision: 'approved', approvedOption: 'recommended' },
apps/api\src\repair\proposal.spec.ts:511:      decision: 'approved',
apps/api\src\repair\proposal.spec.ts:522:        customerCtx(), PROPOSAL_ID, { decision: 'declined' },
apps/api\src\repair\proposal.spec.ts:530:        customerCtx(), PROPOSAL_ID, { decision: 'approved' },
apps/api\src\repair\proposal.spec.ts:536:    // The CONTROL behind the `decidable` flag. Hiding the version from the
apps/api\src\repair\proposal.spec.ts:538:    // the workshop has replaced would bind them to a superseded price.
apps/api\src\repair\proposal.spec.ts:539:    const superseded = [
apps/api\src\repair\proposal.spec.ts:540:      Q.decisionLookup,
apps/api\src\repair\proposal.spec.ts:543:        display_name: 'Kwame Mensah', superseded_by: 'a-newer-proposal',
apps/api\src\repair\proposal.spec.ts:547:      new ProposalService(fakeDb([superseded]).db, fakeAudit()).recordCustomerDecision(
apps/api\src\repair\proposal.spec.ts:548:        customerCtx(), PROPOSAL_ID, { decision: 'approved', approvedOption: 'recommended' },
apps/api\src\repair\proposal.spec.ts:550:    ).rejects.toThrow(/replaced by a newer proposal/);
apps/api\src\repair\proposal.spec.ts:553:  it('404s rather than 403s when the proposal is not theirs', async () => {
apps/api\src\repair\proposal.spec.ts:555:    // else's proposal exists by the shape of the refusal.
apps/api\src\repair\proposal.spec.ts:557:      new ProposalService(fakeDb([[Q.decisionLookup, []]]).db, fakeAudit()).recordCustomerDecision(
apps/api\src\repair\proposal.spec.ts:558:        customerCtx(), PROPOSAL_ID, { decision: 'approved', approvedOption: 'recommended' },
apps/api\src\repair\proposal.spec.ts:560:    ).rejects.toThrow(/proposal not found/);
apps/api\src\repair\proposal.spec.ts:563:  it('refuses to answer a proposal that was never sent, or was already answered', async () => {
apps/api\src\repair\proposal.spec.ts:565:      Q.decisionLookup,
apps/api\src\repair\proposal.spec.ts:566:      [{ id: PROPOSAL_ID, status: 'draft', version_no: 1, job_number: 'JC-1', display_name: 'K', superseded_by: null }],
apps/api\src\repair\proposal.spec.ts:570:        customerCtx(), PROPOSAL_ID, { decision: 'approved', approvedOption: 'recommended' },
apps/api\src\repair\proposal.spec.ts:575:      Q.decisionLookup,
apps/api\src\repair\proposal.spec.ts:576:      [{ id: PROPOSAL_ID, status: 'approved', version_no: 2, job_number: 'JC-1', display_name: 'K', superseded_by: null }],
apps/api\src\repair\proposal.spec.ts:580:        customerCtx(), PROPOSAL_ID, { decision: 'declined', note: 'changed my mind' },
apps/api\src\repair\proposal.spec.ts:586:describe('a customer reading proposals', () => {
apps/api\src\repair\proposal.spec.ts:589:    // this predicate a customer receives every proposal in the organisation —
apps/api\src\repair\proposal.spec.ts:598:    // would empty every workshop screen that reads proposals.
apps/api\src\repair\proposal.spec.ts:608:   * WHY THIS BLOCK EXISTS. `decidable` was left computing from the STAFF role
apps/api\src\repair\proposal.spec.ts:611:   * form only on `decidable`. The self-service approval was completely inert
apps/api\src\repair\proposal.spec.ts:621:  it('🔴 a customer may decide an ISSUED proposal', async () => {
apps/api\src\repair\proposal.spec.ts:624:    expect(p.decidable, 'the approval form renders on this flag and on nothing else').toBe(true);
apps/api\src\repair\proposal.spec.ts:630:    expect(p.decidable).toBe(true);
apps/api\src\repair\proposal.spec.ts:640:    expect(p.decidable).toBe(false);
apps/api\src\repair\proposal.spec.ts:646:    expect(p.decidable).toBe(false);
apps/api\src\repair\proposal.spec.ts:654:    expect(p.decidable).toBe(false);
apps/api\src\repair\proposal.spec.ts:659:    // `decidable` — the same oversight in the other direction.
apps/api\src\repair\proposal.spec.ts:668:  it('refuses to edit an issued or decided proposal, naming the rule', async () => {
apps/api\src\repair\proposal.spec.ts:676:    const approvedRow = [Q.draft, [{ id: PROPOSAL_ID, status: 'approved', version_no: 1, job_number: 'JC-1', superseded_by: null }]] as [RegExp, unknown[]];
apps/api\src\repair\proposal.spec.ts:686:      [Q.draft, [{ id: PROPOSAL_ID, status: 'draft', version_no: 1, job_number: 'JC-1', superseded_by: null }]],
apps/api\src\repair\proposal.spec.ts:690:    // attached is not a proposal.
apps/api\src\repair\proposal.spec.ts:699:describe('proposal-rules matches what migration 017 applied', () => {
apps/api\src\repair\proposal.spec.ts:711:  const SQL = () => migration('017_repair_proposals.sql');
apps/api\src\repair\proposal.spec.ts:719:  it('carries exactly the six proposal statuses', () => {
apps/api\src\repair\proposal.spec.ts:723:  it('carries exactly §7s three decisions', () => {
apps/api\src\repair\proposal.spec.ts:724:    expect(checkValues(SQL(), 'decision')).toEqual([...PROPOSAL_DECISIONS].sort());
apps/api\src\repair\proposal.spec.ts:732:    expect(checkValues(SQL(), 'decision_channel')).toEqual([...DECISION_CHANNELS].sort());
apps/api\src\repair\proposal.spec.ts:734:      expect({ c, label: decisionChannelLabel(c) }).not.toEqual({ c, label: c });
apps/api\src\repair\proposal.spec.ts:738:  it('⚠️ makes the decision attribution MANDATORY at the database level', () => {
apps/api\src\repair\proposal.spec.ts:743:    expect(sql).toMatch(/CONSTRAINT proposal_decision_attributed CHECK/);
apps/api\src\repair\proposal.spec.ts:745:    expect(sql).toMatch(/decision_channel IS NOT NULL/);
apps/api\src\repair\proposal.spec.ts:748:  it('pins the status and the decision together so they cannot drift', () => {
apps/api\src\repair\proposal.spec.ts:749:    expect(SQL()).toMatch(/CONSTRAINT proposal_status_matches_decision CHECK/);
apps/api\src\repair\proposal.spec.ts:752:  it('⚠️ refuses to edit a decided proposal, and permits ONLY the supersession', () => {
apps/api\src\repair\proposal.spec.ts:758:    expect(sql).toMatch(/NEW\.status = 'superseded'/);
apps/api\src\repair\proposal.spec.ts:761:  it('withholds DELETE entirely — a proposal is superseded, never erased', () => {
apps/api\src\repair\proposal.spec.ts:763:    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE ON repair\.repair_proposals/);
apps/api\src\repair\proposal.spec.ts:764:    expect(sql).toMatch(/REVOKE DELETE ON repair\.repair_proposals/);
apps/api\src\repair\proposal.spec.ts:765:    expect(sql).not.toMatch(/GRANT[^;]*DELETE[^;]*ON repair\.repair_proposals/);
apps/api\src\repair\proposal.spec.ts:770:    expect(sql).toMatch(/ALTER TABLE repair\.repair_proposals ENABLE ROW LEVEL SECURITY/);
apps/api\src\repair\proposal.spec.ts:771:    expect(sql).toMatch(/ALTER TABLE repair\.repair_proposals FORCE\s+ROW LEVEL SECURITY/);
apps/api\src\repair\proposal.service.ts:22:  decisionChannelLabel,
apps/api\src\repair\proposal.service.ts:27:} from './proposal-rules';
apps/api\src\repair\proposal.service.ts:34: * time a proposal can exist — a submitted inspection (010), an approved diagnosis
apps/api\src\repair\proposal.service.ts:36: * the proposal would create a second version of a fact that can never change, and a
apps/api\src\repair\proposal.service.ts:130:  decision: ProposalDecision | null;
apps/api\src\repair\proposal.service.ts:134:  decisionChannel: DecisionChannel | string | null;
apps/api\src\repair\proposal.service.ts:135:  decisionChannelLabel: string | null;
apps/api\src\repair\proposal.service.ts:136:  decisionNote: string | null;
apps/api\src\repair\proposal.service.ts:138:  supersededBy: string | null;
apps/api\src\repair\proposal.service.ts:144:  decidable: boolean;
apps/api\src\repair\proposal.service.ts:155: * The customer proposal — `1.txt` §396-§424, `07.txt` §7.
apps/api\src\repair\proposal.service.ts:159: * "Approved proposals shall be immutable. A material change shall create a new
apps/api\src\repair\proposal.service.ts:162: *   · A decided proposal cannot be edited — in the service AND by trigger. The only
apps/api\src\repair\proposal.service.ts:163: *     writable field left on it is `superseded_by`, because recording the
apps/api\src\repair\proposal.service.ts:166: *   · `prepare()` on a card whose latest proposal is already decided creates
apps/api\src\repair\proposal.service.ts:168: *   · An ISSUED proposal freezes too. A document that changes while the customer is
apps/api\src\repair\proposal.service.ts:174: * records that are frozen before a proposal can be created. They are read at display
apps/api\src\repair\proposal.service.ts:175: * time from the exact quotation, plan, diagnosis and inspection the proposal names —
apps/api\src\repair\proposal.service.ts:189:      // 404 for a card this viewer cannot see, BEFORE any proposal is read.
apps/api\src\repair\proposal.service.ts:202:    const proposalId = requireUuid(id, 'id');
apps/api\src\repair\proposal.service.ts:204:      const rows = await this.readProposals(client, ctx, { proposalId });
apps/api\src\repair\proposal.service.ts:210:   * Draft a proposal from the approved quotation — or, when the last one has been
apps/api\src\repair\proposal.service.ts:222:          `a proposal may only be prepared while the job card is at ` +
apps/api\src\repair\proposal.service.ts:228:      // ── one UNDECIDED proposal at a time ─────────────────────────────────
apps/api\src\repair\proposal.service.ts:230:        `SELECT id, status, version_no FROM repair.repair_proposals
apps/api\src\repair\proposal.service.ts:240:            ? `version ${open.version_no} of this proposal is still a draft; issue it or finish it before starting another`
apps/api\src\repair\proposal.service.ts:242:              'record their decision before issuing a new version',
apps/api\src\repair\proposal.service.ts:247:      // version, so the previous decided row is marked superseded rather than edited.
apps/api\src\repair\proposal.service.ts:249:        `SELECT id, version_no, status FROM repair.repair_proposals
apps/api\src\repair\proposal.service.ts:283:          'a proposal presents an APPROVED quotation, and this job card has none. ' +
apps/api\src\repair\proposal.service.ts:291:        `INSERT INTO repair.repair_proposals
apps/api\src\repair\proposal.service.ts:298:      const proposalId = inserted.rows[0].id as string;
apps/api\src\repair\proposal.service.ts:303:      if (previous && previous.status !== 'superseded') {
apps/api\src\repair\proposal.service.ts:305:          `UPDATE repair.repair_proposals
apps/api\src\repair\proposal.service.ts:306:              SET superseded_by = $1, status = 'superseded', updated_at = now(), updated_by = $2
apps/api\src\repair\proposal.service.ts:308:          [proposalId, ctx.userId, previous.id, ctx.tenantId],
apps/api\src\repair\proposal.service.ts:313:        action: 'proposal.prepared',
apps/api\src\repair\proposal.service.ts:314:        resourceType: 'proposal',
apps/api\src\repair\proposal.service.ts:315:        resourceId: proposalId,
apps/api\src\repair\proposal.service.ts:324:      const rows = await this.readProposals(client, ctx, { proposalId });
apps/api\src\repair\proposal.service.ts:332:    proposalId: string,
apps/api\src\repair\proposal.service.ts:336:    const id = requireUuid(proposalId, 'id');
apps/api\src\repair\proposal.service.ts:356:    const sql = `UPDATE repair.repair_proposals SET ${sets.join(', ')}
apps/api\src\repair\proposal.service.ts:360:      const proposal = await this.assertDraft(client, ctx, id);
apps/api\src\repair\proposal.service.ts:363:        action: 'proposal.narrative_recorded',
apps/api\src\repair\proposal.service.ts:364:        resourceType: 'proposal',
apps/api\src\repair\proposal.service.ts:366:        detail: { jobNumber: proposal.job_number, versionNo: proposal.version_no },
apps/api\src\repair\proposal.service.ts:368:      const rows = await this.readProposals(client, ctx, { proposalId: id });
apps/api\src\repair\proposal.service.ts:374:   * Put the proposal in front of the customer.
apps/api\src\repair\proposal.service.ts:376:   * ⚠️ THE GATE IS §418, NOT A FORMALITY. A proposal that does not say what the work
apps/api\src\repair\proposal.service.ts:382:  async issue(ctx: TenantContext, proposalId: string): Promise<RepairProposal> {
apps/api\src\repair\proposal.service.ts:384:    const id = requireUuid(proposalId, 'id');
apps/api\src\repair\proposal.service.ts:387:      const proposal = await this.assertDraft(client, ctx, id);
apps/api\src\repair\proposal.service.ts:389:      const current = ProposalService.one(await this.readProposals(client, ctx, { proposalId: id }));
apps/api\src\repair\proposal.service.ts:392:          'a proposal cannot be issued without saying what the work should achieve (§418). ' +
apps/api\src\repair\proposal.service.ts:398:        `UPDATE repair.repair_proposals
apps/api\src\repair\proposal.service.ts:406:        action: 'proposal.issued',
apps/api\src\repair\proposal.service.ts:407:        resourceType: 'proposal',
apps/api\src\repair\proposal.service.ts:412:          jobNumber: proposal.job_number,
apps/api\src\repair\proposal.service.ts:413:          versionNo: proposal.version_no,
apps/api\src\repair\proposal.service.ts:421:      const rows = await this.readProposals(client, ctx, { proposalId: id });
apps/api\src\repair\proposal.service.ts:437:   * decision frequently arrives off-system — and "approved" with no channel is an
apps/api\src\repair\proposal.service.ts:442:    proposalId: string,
apps/api\src\repair\proposal.service.ts:444:      decision?: string;
apps/api\src\repair\proposal.service.ts:447:      decisionChannel?: string;
apps/api\src\repair\proposal.service.ts:452:    const id = requireUuid(proposalId, 'id');
apps/api\src\repair\proposal.service.ts:453:    const decision: ProposalDecision = requireOneOf(input.decision, PROPOSAL_DECISIONS, 'decision');
apps/api\src\repair\proposal.service.ts:455:      input.decisionChannel, DECISION_CHANNELS, 'decisionChannel',
apps/api\src\repair\proposal.service.ts:462:    if (decision !== 'approved' && note === null) {
apps/api\src\repair\proposal.service.ts:464:        decision === 'declined'
apps/api\src\repair\proposal.service.ts:465:          ? 'a declined proposal must record why; note is required'
apps/api\src\repair\proposal.service.ts:471:      decision === 'approved'
apps/api\src\repair\proposal.service.ts:477:        `SELECT p.id, p.status, p.version_no, j.job_number, p.superseded_by
apps/api\src\repair\proposal.service.ts:478:           FROM repair.repair_proposals p
apps/api\src\repair\proposal.service.ts:481:          -- Serialises two people recording an answer to the same proposal, so the
apps/api\src\repair\proposal.service.ts:492:            superseded_by: string | null;
apps/api\src\repair\proposal.service.ts:496:      if (!row) throw new NotFoundException('proposal not found');
apps/api\src\repair\proposal.service.ts:500:          'this proposal has not been issued to the customer yet, so there is no decision to record',
apps/api\src\repair\proposal.service.ts:506:      // stopped selecting this column would yield — REFUSES the decision rather
apps/api\src\repair\proposal.service.ts:508:      // "not superseded" and silently restore the hole this closes.
apps/api\src\repair\proposal.service.ts:510:      // §424 makes an approved proposal immutable and a material change a NEW
apps/api\src\repair\proposal.service.ts:513:      // wrong price. Status alone does not catch it — a superseded row can still
apps/api\src\repair\proposal.service.ts:515:      if (row.superseded_by !== null) {
apps/api\src\repair\proposal.service.ts:517:          `version ${row.version_no} has been superseded by a newer proposal; §424 requires ` +
apps/api\src\repair\proposal.service.ts:530:        `UPDATE repair.repair_proposals
apps/api\src\repair\proposal.service.ts:531:            SET status = $1, decision = $1, approved_option = $2,
apps/api\src\repair\proposal.service.ts:532:                decided_at = now(), decided_by_name = $3, decision_channel = $4,
apps/api\src\repair\proposal.service.ts:533:                decision_note = $5, recorded_by = $6,
apps/api\src\repair\proposal.service.ts:536:        [decision, approvedOption, decidedByName, channel, note, ctx.userId, id, ctx.tenantId],
apps/api\src\repair\proposal.service.ts:541:          decision === 'approved'
apps/api\src\repair\proposal.service.ts:542:            ? 'proposal.approved_by_customer'
apps/api\src\repair\proposal.service.ts:543:            : decision === 'declined'
apps/api\src\repair\proposal.service.ts:544:              ? 'proposal.declined_by_customer'
apps/api\src\repair\proposal.service.ts:545:              : 'proposal.changes_requested',
apps/api\src\repair\proposal.service.ts:546:        resourceType: 'proposal',
apps/api\src\repair\proposal.service.ts:553:          decision,
apps/api\src\repair\proposal.service.ts:559:      const rows = await this.readProposals(client, ctx, { proposalId: id });
apps/api\src\repair\proposal.service.ts:581:   *   · `decisionChannel` — is `customer_portal` by construction. Taking it from
apps/api\src\repair\proposal.service.ts:592:   * predicate is what stops them deciding on somebody else's proposal. Both are
apps/api\src\repair\proposal.service.ts:597:    proposalId: string,
apps/api\src\repair\proposal.service.ts:598:    input: { decision?: string; approvedOption?: string; note?: string },
apps/api\src\repair\proposal.service.ts:602:        `role '${ctx.activeRole}' may not decide as the customer; staff use POST /proposals/:id/decision`,
apps/api\src\repair\proposal.service.ts:605:    const id = requireUuid(proposalId, 'id');
apps/api\src\repair\proposal.service.ts:606:    const decision: ProposalDecision = requireOneOf(input.decision, PROPOSAL_DECISIONS, 'decision');
apps/api\src\repair\proposal.service.ts:612:    if (decision !== 'approved' && note === null) {
apps/api\src\repair\proposal.service.ts:614:        decision === 'declined'
apps/api\src\repair\proposal.service.ts:615:          ? 'a declined proposal must record why; note is required'
apps/api\src\repair\proposal.service.ts:621:      decision === 'approved'
apps/api\src\repair\proposal.service.ts:626:      // The proposal, its card, and the customer's OWN name — all in one read,
apps/api\src\repair\proposal.service.ts:632:                p.superseded_by
apps/api\src\repair\proposal.service.ts:633:           FROM repair.repair_proposals p
apps/api\src\repair\proposal.service.ts:648:            superseded_by: string | null;
apps/api\src\repair\proposal.service.ts:652:      // customer must not be able to learn that somebody else's proposal exists.
apps/api\src\repair\proposal.service.ts:653:      if (!row) throw new NotFoundException('proposal not found');
apps/api\src\repair\proposal.service.ts:657:          'this proposal has not been sent to you yet, so there is nothing to answer',
apps/api\src\repair\proposal.service.ts:663:            'changed, ask the workshop to send a revised proposal',
apps/api\src\repair\proposal.service.ts:667:      // 🔴 THE CONTROL, not the affordance. `decidable` hides a superseded
apps/api\src\repair\proposal.service.ts:669:      // `decidable` is documented as a UI convenience and CLAUDE.md §8 is
apps/api\src\repair\proposal.service.ts:672:      // has already replaced, binding the workshop to a superseded price.
apps/api\src\repair\proposal.service.ts:674:      // `prepare()` will not supersede a proposal that is still with the
apps/api\src\repair\proposal.service.ts:677:      if (row.superseded_by !== null) {
apps/api\src\repair\proposal.service.ts:679:          `version ${row.version_no} has been replaced by a newer proposal. ` +
apps/api\src\repair\proposal.service.ts:685:        `UPDATE repair.repair_proposals
apps/api\src\repair\proposal.service.ts:686:            SET status = $1, decision = $1, approved_option = $2,
apps/api\src\repair\proposal.service.ts:687:                decided_at = now(), decided_by_name = $3, decision_channel = 'customer_portal',
apps/api\src\repair\proposal.service.ts:688:                decision_note = $4, recorded_by = $5,
apps/api\src\repair\proposal.service.ts:691:        [decision, approvedOption, row.display_name, note, ctx.userId, id, ctx.tenantId],
apps/api\src\repair\proposal.service.ts:696:          decision === 'approved'
apps/api\src\repair\proposal.service.ts:697:            ? 'proposal.approved_by_customer'
apps/api\src\repair\proposal.service.ts:698:            : decision === 'declined'
apps/api\src\repair\proposal.service.ts:699:              ? 'proposal.declined_by_customer'
apps/api\src\repair\proposal.service.ts:700:              : 'proposal.changes_requested',
apps/api\src\repair\proposal.service.ts:701:        resourceType: 'proposal',
apps/api\src\repair\proposal.service.ts:710:          decision,
apps/api\src\repair\proposal.service.ts:717:      const rows = await this.readProposals(client, ctx, { proposalId: id });
apps/api\src\repair\proposal.service.ts:727:   * Five queries for any number of proposals, never one per row.
apps/api\src\repair\proposal.service.ts:732:    filter: { jobCardId?: string; proposalId?: string },
apps/api\src\repair\proposal.service.ts:751:              p.issued_at, p.decision, p.approved_option, p.decided_at,
apps/api\src\repair\proposal.service.ts:752:              p.decided_by_name, p.decision_channel, p.decision_note, p.superseded_by,
apps/api\src\repair\proposal.service.ts:755:              -- The money, read from the exact quotation this proposal names.
apps/api\src\repair\proposal.service.ts:775:         FROM repair.repair_proposals p
apps/api\src\repair\proposal.service.ts:800:          -- every proposal in the organisation — prices, contact details and
apps/api\src\repair\proposal.service.ts:811:        filter.jobCardId ?? null, filter.proposalId ?? null,
apps/api\src\repair\proposal.service.ts:912:        decision: row.decision,
apps/api\src\repair\proposal.service.ts:916:        decisionChannel: row.decision_channel,
apps/api\src\repair\proposal.service.ts:917:        decisionChannelLabel: row.decision_channel ? decisionChannelLabel(row.decision_channel) : null,
apps/api\src\repair\proposal.service.ts:918:        decisionNote: row.decision_note,
apps/api\src\repair\proposal.service.ts:920:        supersededBy: row.superseded_by,
apps/api\src\repair\proposal.service.ts:994:         * `decidable` evaluated FALSE for every customer — and the customer
apps/api\src\repair\proposal.service.ts:995:         * screen shows its approval form only on `decidable`. The whole
apps/api\src\repair\proposal.service.ts:1011:        decidable:
apps/api\src\repair\proposal.service.ts:1016:          // costs nothing and offering somebody a decision on a document the
apps/api\src\repair\proposal.service.ts:1019:          row.superseded_by === null &&
apps/api\src\repair\proposal.service.ts:1051:   * The proposal exists, this viewer may reach it, and it is still a DRAFT.
apps/api\src\repair\proposal.service.ts:1059:    proposalId: string,
apps/api\src\repair\proposal.service.ts:1063:         FROM repair.repair_proposals p
apps/api\src\repair\proposal.service.ts:1067:      [proposalId, ctx.tenantId, ctx.organizationId],
apps/api\src\repair\proposal.service.ts:1072:    if (!row) throw new NotFoundException('proposal not found');
apps/api\src\repair\proposal.service.ts:1077:            'record their decision, then prepare a new version'
apps/api\src\repair\proposal.service.ts:1078:          : `version ${row.version_no} is ${row.status}. §424: an approved proposal is ` +
apps/api\src\repair\proposal.service.ts:1111:    if (!first) throw new NotFoundException('proposal not found');
apps/api\src\repair\proposal.service.ts:1117:      throw new ForbiddenException(`role '${ctx.activeRole}' may not read proposals`);
apps/api\src\repair\proposal.service.ts:1123:      throw new ForbiddenException(`role '${ctx.activeRole}' may not prepare a customer proposal`);
apps/api\src\repair\proposal.service.ts:1130:        `role '${ctx.activeRole}' may not record a customer decision`,
apps/api\src\repair\proposal.service.ts:1195:  decision: ProposalDecision | null;
apps/api\src\repair\proposal.service.ts:1199:  decision_channel: DecisionChannel | null;
apps/api\src\repair\proposal.service.ts:1200:  decision_note: string | null;
apps/api\src\repair\proposal.service.ts:1201:  superseded_by: string | null;
apps/api\src\repair\proposal-rules.ts:2: * Repair proposal rules — Phase 5, slice 6 (the Solution Studio).
apps/api\src\repair\proposal-rules.ts:7: * and `proposal.spec.ts` compares them against the migration text.
apps/api\src\repair\proposal-rules.ts:11: * The proposal lifecycle — §7's outcomes plus §424's versioning.
apps/api\src\repair\proposal-rules.ts:13: * `superseded` is the one that is not a customer action: §424 says a material change
apps/api\src\repair\proposal-rules.ts:22:  'superseded',
apps/api\src\repair\proposal-rules.ts:64: * §7's channels. Recording HOW a decision arrived is what makes a disputed approval
apps/api\src\repair\proposal-rules.ts:85:export function decisionChannelLabel(value: string): string {
apps/api\src\repair\proposal-rules.ts:90: * Roles that may PREPARE and ISSUE a proposal to a customer.
apps/api\src\repair\proposal-rules.ts:97: * ⚠️ `technician` and `workshop_supervisor` ARE ABSENT. A proposal is a commercial
apps/api\src\repair\proposal-rules.ts:109: * Roles that may RECORD the customer's decision.
apps/api\src\repair\proposal-rules.ts:112: * approval gate. The decision is the CUSTOMER'S; the staff member is a scribe, and
apps/api\src\repair\proposal-rules.ts:118: * decision rather than an omission. Everywhere else in Phase 5 the two parties are
apps/api\src\repair\proposal-rules.ts:122: * real case: reception issues a proposal and the customer answers them on the spot.
apps/api\src\repair\proposal-rules.ts:129: * Roles that may READ a proposal.
apps/api\src\repair\proposal-rules.ts:155:   * `customer` viewer to proposals on job cards raised against their own
apps/api\src\repair\proposal-rules.ts:159:   * proposals, prices and customer contact details.
apps/api\src\repair\proposal-rules.ts:165: * Roles that may record a decision AS THE CUSTOMER THEMSELVES.
apps/api\src\repair\proposal-rules.ts:181: * The stages at which a proposal is the work in hand.
apps/api\src\repair\proposal-rules.ts:183: * A proposal is DRAFTED once the price exists (`quotation_preparation`) and ISSUED
apps/api\src\repair\pricing.service.ts:41:   * as "saving is broken" rather than "this is the owner's decision". The policy
apps/api\src\repair\pricing.service.ts:52:          'rates, so they are the owner’s decision — ask an owner to change them.',
apps/api\src\repair\job-card.service.ts:295:    // workshop's decision (`07.txt` pt2 §47 puts it under the manager).
apps/api\src\repair\inspection-checklist.ts:137: * `customer` is ABSENT, and that is a decision rather than an omission. `2.txt`
apps/api\src\repair\execution.spec.ts:69:  proposal_id: PROPOSAL_ID,
apps/api\src\repair\execution.spec.ts:70:  proposal_version_no: 1,
apps/api\src\repair\execution.spec.ts:130:  approvedProposal: /FROM repair\.repair_proposals pr/,
apps/api\src\repair\execution.spec.ts:225:      /customer has approved a proposal.*Customer\s+Proposals screen/s,
apps/api\src\repair\execution.spec.ts:542:    expect(sql).toMatch(/proposal_id\s+uuid NOT NULL/);
apps/api\src\repair\execution.service.ts:93:  proposalId: string;
apps/api\src\repair\execution.service.ts:94:  proposalVersionNo: number;
apps/api\src\repair\execution.service.ts:140: * foreign key to an APPROVED proposal plus a trigger, not a checkbox. §32's five
apps/api\src\repair\execution.service.ts:225:      // The newest APPROVED proposal, and the plan behind it — the work list comes
apps/api\src\repair\execution.service.ts:229:      const proposalRow = await client.query(
apps/api\src\repair\execution.service.ts:231:           FROM repair.repair_proposals pr
apps/api\src\repair\execution.service.ts:238:      const proposal = proposalRow.rows[0] as
apps/api\src\repair\execution.service.ts:241:      if (!proposal) {
apps/api\src\repair\execution.service.ts:242:        // The refusal names a route that exists — the proposal queue is where a
apps/api\src\repair\execution.service.ts:243:        // customer's decision is recorded.
apps/api\src\repair\execution.service.ts:245:          'repair work cannot start until the customer has approved a proposal, and this ' +
apps/api\src\repair\execution.service.ts:246:            'job card has none approved. Record the customer decision on the Customer ' +
apps/api\src\repair\execution.service.ts:260:           (tenant_id, organization_id, job_card_id, proposal_id, attempt_no,
apps/api\src\repair\execution.service.ts:265:          ctx.tenantId, ctx.organizationId, cardId, proposal.id, attemptNo,
apps/api\src\repair\execution.service.ts:281:        [ctx.tenantId, ctx.organizationId, executionId, ctx.userId, proposal.repair_plan_id],
apps/api\src\repair\execution.service.ts:291:          proposalVersionNo: proposal.version_no,
apps/api\src\repair\execution.service.ts:734:              e.proposal_id, pr.version_no AS proposal_version_no,
apps/api\src\repair\execution.service.ts:745:         JOIN repair.repair_proposals pr ON pr.id = e.proposal_id AND pr.tenant_id = e.tenant_id
apps/api\src\repair\execution.service.ts:883:        proposalId: row.proposal_id,
apps/api\src\repair\execution.service.ts:884:        proposalVersionNo: row.proposal_version_no,
apps/api\src\repair\execution.service.ts:1083:  proposal_id: string;
apps/api\src\repair\execution.service.ts:1084:  proposal_version_no: number;
apps/api\src\repair\execution-rules.ts:109: * ⚠️ ABSENT, and each is a decision:
apps/api\src\repair\diagnosis.spec.ts:302:      svc.review(ctx({ activeRole: 'technician' }), DIAGNOSIS_ID, { decision: 'approved' }),
apps/api\src\repair\diagnosis.spec.ts:317:        decision: 'approved',
apps/api\src\repair\diagnosis.spec.ts:331:      { decision: 'approved' },
apps/api\src\repair\diagnosis.spec.ts:344:        decision: 'rejected',
apps/api\src\repair\diagnosis.spec.ts:357:        decision: 'approved',
apps/api\src\repair\diagnosis.spec.ts:370:        decision: 'approved',
apps/api\src\repair\diagnosis.spec.ts:385:        decision: 'approved',
apps/api\src\repair\diagnosis.spec.ts:396:        decision: 'approved',
apps/api\src\repair\diagnosis.spec.ts:1131:  it('keeps the review decisions a strict subset of the statuses', () => {
apps/api\src\repair\diagnosis.service.ts:778:    input: { decision?: string; note?: string },
apps/api\src\repair\diagnosis.service.ts:782:    const decision: ReviewDecision = requireOneOf(input.decision, REVIEW_DECISIONS, 'decision');
apps/api\src\repair\diagnosis.service.ts:789:    if (decision === 'rejected' && note === null) {
apps/api\src\repair\diagnosis.service.ts:837:        [decision, ctx.userId, note, id, ctx.tenantId],
apps/api\src\repair\diagnosis.service.ts:841:        action: decision === 'approved' ? 'diagnosis.approved' : 'diagnosis.rejected',
apps/api\src\repair\diagnosis.service.ts:847:        detail: { jobNumber: row.job_number, attemptNo: row.attempt_no, decision },
apps/api\src\repair\diagnosis-rules.ts:117: * ⚠️ THE ABSENCES, restated because they are decisions:
apps/api\src\public\catalogue-rules.ts:5: * so the decisions can be tested without a database. Nothing here touches
apps/customer-web\app\(app)\layout.tsx:17:  description: 'Vehicle owners — garage, complaints, proposals, payments',
apps/api\src\marketplace\payment-provider.ts:6: * decision and it belongs to the owner alone (CLAUDE.md §1: never introduce a
apps/api\src\marketplace\order.service.ts:103:        // Converting would need a rate, and a rate is a financial decision this
apps/api\src\marketplace\order.service.ts:289:      const decision = canTransition(order.status, to, actor);
apps/api\src\marketplace\order.service.ts:290:      if (!decision.allowed) throw new BadRequestException(decision.reason);
apps/api\src\marketplace\order.service.ts:401:   * decision alone.
apps/api\src\marketplace\order-rules.ts:5: * decisions can be tested without a database. Nothing in this file is async and
apps/api\src\marketplace\order-rules.ts:310: * require a rate, and a rate is a financial decision this platform has no
apps/api\src\marketplace\order-rules.spec.ts:104:    // Converting needs a rate, and a rate is a financial decision this
apps/api\src\marketplace\order-rules.spec.ts:290:    // settlement route nobody chose. That is a spend decision leaking into a
apps/api\src\marketplace\marketplace.controller.ts:113:   * configured, and choosing one is the owner's decision alone. This is the
apps/workshop-web\app\page.tsx:32: * AutoWorkshop keeps its seven apps — that decision stands — so the equivalent
apps/workshop-web\app\layout.tsx:129:            'workshop.proposals.pendingApproval': 2,
apps/workshop-web\app\workshop-management\pricing-rules\page.tsx:28: * recorded in `.claude/CURRENT_TASK.md` as a decision for the owner rather than
packages\auth\verify\probe-repair-plan.mjs:228:      decision: 'rejected',
packages\auth\verify\probe-repair-plan.mjs:259:      decision: 'rejected',
packages\auth\verify\probe-repair-plan.mjs:395:const approved = await call(SUP, `/diagnoses/${diagnosisId}/review`, 'POST', { decision: 'approved' });
packages\auth\verify\probe-repair-plan.mjs:651:const techReview = await call(TECH, `/repair-plans/${planId}/review`, 'POST', { decision: 'approved' });
packages\auth\verify\probe-repair-plan.mjs:658:const noReason = await call(SUP, `/repair-plans/${planId}/review`, 'POST', { decision: 'rejected' });
packages\auth\verify\probe-repair-plan.mjs:666:  decision: 'approved',
packages\auth\verify\probe-repair-plan.mjs:672:const again = await call(SUP, `/repair-plans/${planId}/review`, 'POST', { decision: 'rejected', note: 'no' });
packages\auth\verify\probe-repair-plan.mjs:700:  const ownReview = await call(SUP, `/repair-plans/${supPlanId}/review`, 'POST', { decision: 'approved' });
packages\auth\verify\probe-repair-plan.mjs:719:    decision: 'approved',
apps/api\src\identity\me.service.ts:43: * The response is a VIEW, not an authorization decision. A client that ignores
apps/workshop-web\app\home\dashboard\page.tsx:221:      hint: 'Parked — needs a decision',
apps/workshop-web\app\customers-and-vehicles\register-vehicle\page.tsx:9: * Added by the navigation-gap proposal (`docs/03-ui-ux/NAVIGATION-GAPS-PROPOSAL.md`,
apps/workshop-web\app\solution-and-approval\customer-proposals\[id]\page.tsx:2:import { ProposalSheetScreen } from '../../../_screens/proposal-sheet-screen';
apps/workshop-web\app\solution-and-approval\customer-proposals\[id]\page.tsx:5: * /solution-and-approval/customer-proposals/<id> — one customer proposal. the §34 WORKSPACE DEFAULT tree.
apps/workshop-web\app\solution-and-approval\customer-proposals\[id]\page.tsx:8: * navigation advertises one entry per proposal. `check-page-gates.sh` strips trailing
apps/workshop-web\app\solution-and-approval\customer-proposals\[id]\page.tsx:18:  await requireNavRoute('workshop', '/solution-and-approval/customer-proposals');
apps/workshop-web\app\solution-and-approval\customer-proposals\[id]\page.tsx:20:  return <ProposalSheetScreen route="/solution-and-approval/customer-proposals" proposalId={id} />;
apps/workshop-web\app\customers-and-vehicles\register-customer\page.tsx:9: * Added by the navigation-gap proposal (`docs/03-ui-ux/NAVIGATION-GAPS-PROPOSAL.md`,
apps/workshop-web\app\solution-and-approval\customer-proposals\page.tsx:2:import { ProposalQueueScreen } from '../../_screens/proposal-queue-screen';
apps/workshop-web\app\solution-and-approval\customer-proposals\page.tsx:5: * /solution-and-approval/customer-proposals — the §34 WORKSPACE DEFAULT tree.
apps/workshop-web\app\solution-and-approval\customer-proposals\page.tsx:19:  await requireNavRoute('workshop', '/solution-and-approval/customer-proposals');
apps/workshop-web\app\solution-and-approval\customer-proposals\page.tsx:20:  return <ProposalQueueScreen route="/solution-and-approval/customer-proposals" />;
packages\auth\verify\probe-quotation.mjs:183:    decision: 'rejected', note: 'settled by a re-run of probe-quotation.mjs',
packages\auth\verify\probe-quotation.mjs:344:const ownApproval = await call(ADMIN, `/quotations/${q.id}/review`, 'POST', { decision: 'approved' });
packages\auth\verify\probe-quotation.mjs:351:const supApproval = await call(SUP, `/quotations/${q.id}/review`, 'POST', { decision: 'approved' });
packages\auth\verify\probe-quotation.mjs:358:const noReason = await call(TECH, `/quotations/${q.id}/review`, 'POST', { decision: 'rejected' });
packages\auth\verify\probe-quotation.mjs:366:  decision: 'approved',
apps/api\src\catalogue\supplier-catalogue.service.ts:355:   * Everything awaiting a decision.
apps/api\src\catalogue\supplier-catalogue.service.ts:496:            'publishing is an administrator decision. Your draft is saved and appears in ' +
apps/api\src\catalogue\directory.service.ts:32:   * decision". The policy is the enforcement; this is the explanation.
apps/workshop-web\app\settings\pricing\page.tsx:7: * Added by the navigation-gap proposal (`docs/03-ui-ux/NAVIGATION-GAPS-PROPOSAL.md`,
apps/api\src\catalogue\catalogue.controller.ts:117: * ADMINISTRATOR-side catalogue decisions — publication and verification.
apps/api\src\catalogue\catalogue.controller.ts:145:        'publishing to the public marketplace is a platform administrator decision',
apps/api\src\catalogue\catalogue.controller.ts:150:  /** Everything awaiting a decision: unpublished suppliers and unpublished parts. */
apps/api\src\catalogue\catalogue-write-rules.ts:10: * decisions are testable without a database — and, more importantly, so the
apps/api\src\catalogue\catalogue-write-rules.spec.ts:175:    // Publication is an administrator decision (024). Even if the trigger were
apps/workshop-web\app\requests-and-reception\register-vehicle\page.tsx:9: * Added by the navigation-gap proposal (`docs/03-ui-ux/NAVIGATION-GAPS-PROPOSAL.md`,
apps/workshop-web\app\requests-and-reception\register-customer\page.tsx:9: * Added by the navigation-gap proposal (`docs/03-ui-ux/NAVIGATION-GAPS-PROPOSAL.md`,
apps/api\Dockerfile:5:# critical path. That decision was made because Render's builder failed
packages\auth\verify\probe-proposal.mjs:2: * Probe the proposal endpoints with REAL Keycloak access tokens — Phase 5, slice 6.
packages\auth\verify\probe-proposal.mjs:4: * WHY THIS EXISTS. §424 — "approved proposals shall be immutable; a material change
packages\auth\verify\probe-proposal.mjs:14: *   (cd packages/auth && node verify/probe-proposal.mjs)
packages\auth\verify\probe-proposal.mjs:97:const prior = (await call(ADMIN, `/job-cards/${card.id}/proposals`)).json ?? [];
packages\auth\verify\probe-proposal.mjs:102:    await call(ADMIN, `/proposals/${openProposal.id}`, 'PATCH', { expectedResult: 'residue' });
packages\auth\verify\probe-proposal.mjs:103:    await call(ADMIN, `/proposals/${openProposal.id}/issue`, 'POST', {});
packages\auth\verify\probe-proposal.mjs:105:  await call(ADMIN, `/proposals/${openProposal.id}/decision`, 'POST', {
packages\auth\verify\probe-proposal.mjs:106:    decision: 'declined', decidedByName: 'probe residue', decisionChannel: 'in_person',
packages\auth\verify\probe-proposal.mjs:107:    note: 'settled by a re-run of probe-proposal.mjs',
packages\auth\verify\probe-proposal.mjs:115:const techPrepare = await call(TECH, `/job-cards/${card.id}/proposals`, 'POST', {});
packages\auth\verify\probe-proposal.mjs:117:  'a TECHNICIAN may not prepare a customer proposal',
packages\auth\verify\probe-proposal.mjs:121:const supPrepare = await call(SUP, `/job-cards/${card.id}/proposals`, 'POST', {});
packages\auth\verify\probe-proposal.mjs:132:const prepared = await call(ADMIN, `/job-cards/${card.id}/proposals`, 'POST', {});
packages\auth\verify\probe-proposal.mjs:133:check('a proposal is prepared', prepared.status === 201 || prepared.status === 200, message(prepared));
packages\auth\verify\probe-proposal.mjs:135:if (!p?.id) { console.error('no proposal'); process.exit(2); }
packages\auth\verify\probe-proposal.mjs:178:console.log('\n3. §418 — a price with no promise attached is not a proposal');
packages\auth\verify\probe-proposal.mjs:180:const tooEarly = await call(ADMIN, `/proposals/${p.id}/issue`, 'POST', {});
packages\auth\verify\probe-proposal.mjs:187:const narrative = await call(ADMIN, `/proposals/${p.id}`, 'PATCH', {
packages\auth\verify\probe-proposal.mjs:193:const issued = await call(ADMIN, `/proposals/${p.id}/issue`, 'POST', {});
packages\auth\verify\probe-proposal.mjs:197:const editAfterIssue = await call(ADMIN, `/proposals/${p.id}`, 'PATCH', {
packages\auth\verify\probe-proposal.mjs:201:  '⚠️ an ISSUED proposal is frozen — the customer is reading this exact document',
packages\auth\verify\probe-proposal.mjs:206:// ── 4. §7's decision, and its attribution ───────────────────────────────────
packages\auth\verify\probe-proposal.mjs:208:console.log('\n4. §7 — the decision, and who made it');
packages\auth\verify\probe-proposal.mjs:210:const noName = await call(ADMIN, `/proposals/${p.id}/decision`, 'POST', {
packages\auth\verify\probe-proposal.mjs:211:  decision: 'approved', approvedOption: 'recommended', decisionChannel: 'telephone',
packages\auth\verify\probe-proposal.mjs:218:const noChannel = await call(ADMIN, `/proposals/${p.id}/decision`, 'POST', {
packages\auth\verify\probe-proposal.mjs:219:  decision: 'approved', approvedOption: 'recommended', decidedByName: 'Kwame Mensah',
packages\auth\verify\probe-proposal.mjs:226:const noReason = await call(ADMIN, `/proposals/${p.id}/decision`, 'POST', {
packages\auth\verify\probe-proposal.mjs:227:  decision: 'declined', decidedByName: 'Kwame Mensah', decisionChannel: 'telephone',
packages\auth\verify\probe-proposal.mjs:231:const decided = await call(ADMIN, `/proposals/${p.id}/decision`, 'POST', {
packages\auth\verify\probe-proposal.mjs:232:  decision: 'approved',
packages\auth\verify\probe-proposal.mjs:235:  decisionChannel: 'telephone',
packages\auth\verify\probe-proposal.mjs:240:check('the channel is recorded', decided.json?.decisionChannel === 'telephone', decided.json?.decisionChannel);
packages\auth\verify\probe-proposal.mjs:254:console.log('\n5. §424 — an approved proposal is IMMUTABLE');
packages\auth\verify\probe-proposal.mjs:256:const editAfterApproval = await call(ADMIN, `/proposals/${p.id}`, 'PATCH', {
packages\auth\verify\probe-proposal.mjs:265:const decideAgain = await call(ADMIN, `/proposals/${p.id}/decision`, 'POST', {
packages\auth\verify\probe-proposal.mjs:266:  decision: 'declined', decidedByName: 'Someone Else', decisionChannel: 'email', note: 'no',
packages\auth\verify\probe-proposal.mjs:269:  'and the decision cannot be overwritten',
packages\auth\verify\probe-proposal.mjs:274:const newVersion = await call(ADMIN, `/job-cards/${card.id}/proposals`, 'POST', {});
packages\auth\verify\probe-proposal.mjs:276:  '⚠️ a new version is REFUSED on an approved proposal without a fresh quotation',
packages\auth\verify\probe-proposal.mjs:289:const missing = await call(ADMIN, '/proposals/00000000-0000-4000-8000-000000000000');
packages\auth\verify\probe-proposal.mjs:291:const techRead = await call(TECH, `/proposals/${p.id}`);
apps/workshop-web\app\repair-services\repairs-in-progress\page.tsx:12: * requires an APPROVED customer proposal before any work starts (§7), and Postgres RLS
apps/workshop-web\app\customer-reception\register-vehicle\page.tsx:9: * Added by the navigation-gap proposal (`docs/03-ui-ux/NAVIGATION-GAPS-PROPOSAL.md`,
apps/workshop-web\app\customer-reception\register-customer\page.tsx:9: * Added by the navigation-gap proposal (`docs/03-ui-ux/NAVIGATION-GAPS-PROPOSAL.md`,
apps/workshop-web\app\customer-approval\pending-approvals\[id]\page.tsx:2:import { ProposalSheetScreen } from '../../../_screens/proposal-sheet-screen';
apps/workshop-web\app\customer-approval\pending-approvals\[id]\page.tsx:5: * /customer-approval/pending-approvals/<id> — one customer proposal. the §47 WORKSHOP MANAGER tree — the role that chases an unanswered proposal.
apps/workshop-web\app\customer-approval\pending-approvals\[id]\page.tsx:8: * navigation advertises one entry per proposal. `check-page-gates.sh` strips trailing
apps/workshop-web\app\customer-approval\pending-approvals\[id]\page.tsx:20:  return <ProposalSheetScreen route="/customer-approval/pending-approvals" proposalId={id} />;
apps/workshop-web\app\customer-approval\pending-approvals\page.tsx:2:import { ProposalQueueScreen } from '../../_screens/proposal-queue-screen';
apps/workshop-web\app\customer-approval\pending-approvals\page.tsx:5: * /customer-approval/pending-approvals — the §47 WORKSHOP MANAGER tree — the role that chases an unanswered proposal.
apps/workshop-web\app\repair-control\repairs-in-progress\page.tsx:12: * requires an APPROVED customer proposal before any work starts (§7), and Postgres RLS
apps/workshop-web\app\repair-control\repair-progress\page.tsx:12: * requires an APPROVED customer proposal before any work starts (§7), and Postgres RLS
packages\auth\verify\probe-execution.mjs:114:// ── locate a card with an APPROVED customer proposal ────────────────────────
packages\auth\verify\probe-execution.mjs:116:const proposals = (await call(ADMIN, '/proposals')).json ?? [];
packages\auth\verify\probe-execution.mjs:117:const approved = proposals.find((p) => p.status === 'approved');
packages\auth\verify\probe-execution.mjs:119:  console.error('no APPROVED customer proposal anywhere — run probe-proposal.mjs first');
packages\auth\verify\probe-execution.mjs:124:if (!card) { console.error('the approved proposal is on a card this identity cannot see'); process.exit(2); }
packages\auth\verify\probe-execution.mjs:203:check('it records WHICH proposal authorised it', e.proposalId === approved.id, e.proposalId);
apps/workshop-web\app\repair-control\customer-approval\[id]\page.tsx:2:import { ProposalSheetScreen } from '../../../_screens/proposal-sheet-screen';
apps/workshop-web\app\repair-control\customer-approval\[id]\page.tsx:5: * /repair-control/customer-approval/<id> — one customer proposal. the §46 WORKSHOP OWNER tree.
apps/workshop-web\app\repair-control\customer-approval\[id]\page.tsx:8: * navigation advertises one entry per proposal. `check-page-gates.sh` strips trailing
apps/workshop-web\app\repair-control\customer-approval\[id]\page.tsx:20:  return <ProposalSheetScreen route="/repair-control/customer-approval" proposalId={id} />;
apps/workshop-web\app\repair-control\customer-approval\page.tsx:2:import { ProposalQueueScreen } from '../../_screens/proposal-queue-screen';
packages\auth\src\workspace-auth.ts:393:  // as guaranteed — as an earlier comment here did — put the whole decision on a
packages\auth\src\sign-out.ts:70:  // supply the full address would move that decision out of the allow-list.
apps/workshop-web\app\record-work\variation-requests\page.tsx:7: * The §49 TECHNICIAN tree's route, under Record Work — where §3764 step 11 puts it, between recording unexpected findings and completing the authorised repair. This is where variations are RAISED. The technician sees no review or decision controls here: they raised it, so §3792 requires somebody else.
apps/workshop-web\app\record-work\time-records\page.tsx:12: * requires an APPROVED customer proposal before any work starts (§7), and Postgres RLS
apps/workshop-web\app\record-work\repair-tasks\page.tsx:12: * requires an APPROVED customer proposal before any work starts (§7), and Postgres RLS
apps/workshop-web\app\record-work\repair-evidence\page.tsx:12: * requires an APPROVED customer proposal before any work starts (§7), and Postgres RLS
apps/workshop-web\app\record-work\parts-used\page.tsx:12: * requires an APPROVED customer proposal before any work starts (§7), and Postgres RLS
packages\auth\verify\probe-diagnosis.mjs:415:  decision: 'approved',
packages\auth\verify\probe-diagnosis.mjs:433:  decision: 'rejected',
packages\auth\verify\probe-diagnosis.mjs:442:  decision: 'approved',
packages\auth\verify\probe-diagnosis.mjs:455:  decision: 'rejected',
packages\auth\verify\probe-catalogue.mjs:234:console.log('\n5. fitments on a published part are an administrator decision');
rg: domains: The system cannot find the file specified. (os error 2)

2026-08-04T14:30:15.265710Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 1.4 seconds
Total output lines: 982
Output:
apps/customer-web\app\_screens\repair-journey.ts:110:    detail: 'We are pricing the work. Your proposal will arrive shortly.',
apps/customer-web\app\_screens\repair-journey.ts:116:    detail: 'A repair proposal is waiting for your decision. Nothing starts until you approve it.',
apps/customer-web\app\_screens\repair-journey-screen.tsx:7:import { ProposalDecisionForm } from './proposal-decision-form';
apps/customer-web\app\_screens\repair-journey-screen.tsx:19: *   /service-and-repairs/repair-proposals    the ones waiting on the customer
apps/customer-web\app\_screens\repair-journey-screen.tsx:61: * WARNING: NAMES TAKEN FROM apps/api/src/repair/proposal.service.ts, not
apps/customer-web\app\_screens\repair-journey-screen.tsx:64: * wrote. `decidable` is the API's OWN judgement of whether an answer is still
apps/customer-web\app\_screens\repair-journey-screen.tsx:66: * re-derives. A superseded version is therefore never offered.
apps/customer-web\app\_screens\repair-journey-screen.tsx:77:  decidable: boolean;
apps/customer-web\app\_screens\repair-journey-screen.tsx:78:  decision: string | null;
apps/customer-web\app\_screens\repair-journey-screen.tsx:170:  const proposals =
apps/customer-web\app\_screens\repair-journey-screen.tsx:171:    view === 'needs-you' ? await apiGet<ProposalRow[]>('customer', '/proposals') : null;
apps/customer-web\app\_screens\repair-journey-screen.tsx:213:          <Link href="/service-and-repairs/repair-proposals">See what is needed</Link>
apps/customer-web\app\_screens\repair-journey-screen.tsx:223:              The proposal still OPEN on this card. `decidable` is the API's
apps/customer-web\app\_screens\repair-journey-screen.tsx:224:              judgement, so an already-answered or superseded version is not
apps/customer-web\app\_screens\repair-journey-screen.tsx:227:            proposal={
apps/customer-web\app\_screens\repair-journey-screen.tsx:228:              proposals?.ok
apps/customer-web\app\_screens\repair-journey-screen.tsx:229:                ? proposals.data.find((p) => p.jobCardId === card.id && p.decidable)
apps/customer-web\app\_screens\repair-journey-screen.tsx:233:              The most recent proposal on this card that has ALREADY been
apps/customer-web\app\_screens\repair-journey-screen.tsx:234:              answered. Needed because recording a decision does NOT move the
apps/customer-web\app\_screens\repair-journey-screen.tsx:238:              answerable proposal on it, and the screen told the customer to
apps/customer-web\app\_screens\repair-journey-screen.tsx:243:              proposals?.ok
apps/customer-web\app\_screens\repair-journey-screen.tsx:244:                ? proposals.data
apps/customer-web\app\_screens\repair-journey-screen.tsx:245:                    .filter((p) => p.jobCardId === card.id && p.decision !== null)
apps/customer-web\app\_screens\repair-journey-screen.tsx:258:  proposal,
apps/customer-web\app\_screens\repair-journey-screen.tsx:262:  proposal?: ProposalRow;
apps/customer-web\app\_screens\repair-journey-screen.tsx:352:          {proposal ? (
apps/customer-web\app\_screens\repair-journey-screen.tsx:363:                Repair proposal {proposal.presentation.documentReference} is waiting for your answer.
apps/customer-web\app\_screens\repair-journey-screen.tsx:365:              {proposal.expectedResult ? (
apps/customer-web\app\_screens\repair-journey-screen.tsx:367:                  {proposal.expectedResult}
apps/customer-web\app\_screens\repair-journey-screen.tsx:377:              {proposal.riskAndLimitations ? (
apps/customer-web\app\_screens\repair-journey-screen.tsx:385:                  <strong>Risks and limitations:</strong> {proposal.riskAndLimitations}
apps/customer-web\app\_screens\repair-journey-screen.tsx:388:              {proposal.uncertainties ? (
apps/customer-web\app\_screens\repair-journey-screen.tsx:396:                  <strong>Still to be confirmed:</strong> {proposal.uncertainties}
apps/customer-web\app\_screens\repair-journey-screen.tsx:400:                proposalId={proposal.id}
apps/customer-web\app\_screens\repair-journey-screen.tsx:401:                recommendedTotal={proposal.presentation.recommendedTotal}
apps/customer-web\app\_screens\repair-journey-screen.tsx:402:                comprehensiveTotal={proposal.presentation.comprehensiveTotal}
apps/customer-web\app\_screens\repair-journey-screen.tsx:403:                currency={proposal.presentation.currency}
apps/customer-web\app\_screens\repair-journey-screen.tsx:410:              contradicting the decision it recorded a moment earlier.
apps/customer-web\app\_screens\repair-journey-screen.tsx:413:              You {answered.decision === 'approved' ? 'approved' : 'answered'} proposal{' '}
apps/customer-web\app\_screens\repair-journey-screen.tsx:420:              No proposal on this card at all. The customer is still the hold-up
apps/customer-web\app\_screens\repair-journey-screen.tsx:439:      return 'approve or decline the repair proposal';
packages\ui\src\AppShell.tsx:60:   * ⚠️ NOT A SECURITY CONTROL, like every other visibility decision in this
packages\ui\src\AiAssistantPanel.tsx:15: * It renders proposals and collects the user's decision. It does not call an
packages\ui\src\AiAssistantPanel.tsx:22: * server's decision, never the decision itself.
packages\ui\src\AiAssistantPanel.tsx:33: * The `AgentProposal` type below makes all five REQUIRED fields. A proposal that
packages\ui\src\AiAssistantPanel.tsx:39:/** The §5 human-in-the-loop classes, carried on every proposal. */
packages\ui\src\AiAssistantPanel.tsx:117:  proposals?: readonly AgentProposal[];
packages\ui\src\AiAssistantPanel.tsx:119:  /** Approve a Class C/D proposal. The server re-validates the approver. */
packages\ui\src\AiAssistantPanel.tsx:120:  onApprove?: (proposalId: string) => void;
packages\ui\src\AiAssistantPanel.tsx:121:  onReject?: (proposalId: string) => void;
packages\ui\src\AiAssistantPanel.tsx:138:  proposals = [],
packages\ui\src\AiAssistantPanel.tsx:204:      <section aria-labelledby="aw-assistant-proposals">
packages\ui\src\AiAssistantPanel.tsx:206:          id="aw-assistant-proposals"
packages\ui\src\AiAssistantPanel.tsx:218:        {proposals.length === 0 ? (
packages\ui\src\AiAssistantPanel.tsx:231:            {proposals.map((p) => (
packages\ui\src\AiAssistantPanel.tsx:234:                  proposal={p}
packages\ui\src\AiAssistantPanel.tsx:248:  proposal,
packages\ui\src\AiAssistantPanel.tsx:252:  proposal: AgentProposal;
packages\ui\src\AiAssistantPanel.tsx:256:  const classInfo = CLASS_LABEL[proposal.actionClass];
packages\ui\src\AiAssistantPanel.tsx:257:  const needsDecision = proposal.status === 'awaiting-approval' && proposal.approvalRequired;
packages\ui\src\AiAssistantPanel.tsx:271:      <p style={{ margin: 0, fontWeight: 600 }}>{proposal.action}</p>
packages\ui\src\AiAssistantPanel.tsx:277:        {proposal.approvalRequired
packages\ui\src\AiAssistantPanel.tsx:278:          ? ` · approval required${proposal.approverRole ? ` (${proposal.approverRole})` : ''}`
packages\ui\src\AiAssistantPanel.tsx:283:      {proposal.dataUsed.length > 0 ? (
packages\ui\src\AiAssistantPanel.tsx:286:          <span>{proposal.dataUsed.join(', ')}</span>
packages\ui\src\AiAssistantPanel.tsx:290:      {proposal.status === 'running' ? (
packages\ui\src\AiAssistantPanel.tsx:296:      {proposal.status === 'failed' && proposal.error ? (
packages\ui\src\AiAssistantPanel.tsx:298:          {proposal.error}
packages\ui\src\AiAssistantPanel.tsx:302:      {proposal.status === 'rejected' ? (
packages\ui\src\AiAssistantPanel.tsx:306:      {proposal.result ? <p style={{ margin: 0 }}>{proposal.result}</p> : null}
packages\ui\src\AiAssistantPanel.tsx:308:      {typeof proposal.confidence === 'number' ? (
packages\ui\src\AiAssistantPanel.tsx:313:          Confidence {Math.round(proposal.confidence * 100)}% — a suggestion to check, not a
packages\ui\src\AiAssistantPanel.tsx:319:      {proposal.sources && proposal.sources.length > 0 ? (
packages\ui\src\AiAssistantPanel.tsx:322:          {proposal.sources.map((s, i) => (
apps/customer-web\app\_screens\proposal-decision-form.tsx:6:import { decideProposalAction } from './proposal-decision-actions';
apps/customer-web\app\_screens\proposal-decision-form.tsx:9: * §7 — the customer's answer to a repair proposal, made by the customer.
apps/customer-web\app\_screens\proposal-decision-form.tsx:18: * Sent: the decision, the option (only when approving) and a note. NOT the
apps/customer-web\app\_screens\proposal-decision-form.tsx:21: * `proposal-decision-actions.ts`.
apps/customer-web\app\_screens\proposal-decision-form.tsx:24:  proposalId,
apps/customer-web\app\_screens\proposal-decision-form.tsx:29:  proposalId: string;
apps/customer-web\app\_screens\proposal-decision-form.tsx:34:  const [decision, setDecision] = React.useState('approved');
apps/customer-web\app\_screens\proposal-decision-form.tsx:35:  const approving = decision === 'approved';
apps/customer-web\app\_screens\proposal-decision-form.tsx:49:        <input type="hidden" name="proposalId" value={proposalId} />
apps/customer-web\app\_screens\proposal-decision-form.tsx:51:        <Field label="Your answer" htmlFor="decision">
apps/customer-web\app\_screens\proposal-decision-form.tsx:53:            id="decision"
apps/customer-web\app\_screens\proposal-decision-form.tsx:54:            name="decision"
apps/customer-web\app\_screens\proposal-decision-form.tsx:55:            value={decision}
apps/customer-web\app\_screens\proposal-decision-actions.ts:8: * §7 — the customer approves, declines or questions a repair proposal, themselves.
apps/customer-web\app\_screens\proposal-decision-actions.ts:12: * Not `decidedByName`, and not `decisionChannel`. Both are DERIVED by the API:
apps/customer-web\app\_screens\proposal-decision-actions.ts:13: * the name from the customer record the proposal hangs off, the channel from
apps/customer-web\app\_screens\proposal-decision-actions.ts:17: * That is not tidiness. `decided_by_name` and `decision_channel` are the consent
apps/customer-web\app\_screens\proposal-decision-actions.ts:22: * ⚠️ The screen never sends a proposal id the viewer did not receive from their
apps/customer-web\app\_screens\proposal-decision-actions.ts:32:  const proposalId = read('proposalId');
apps/customer-web\app\_screens\proposal-decision-actions.ts:33:  if (!proposalId) return { error: 'Nothing was selected to answer. Reload the page and try again.' };
apps/customer-web\app\_screens\proposal-decision-actions.ts:35:  const decision = read('decision');
apps/customer-web\app\_screens\proposal-decision-actions.ts:37:  const result = await apiPost(`customer`, `/proposals/${proposalId}/customer-decision`, {
apps/customer-web\app\_screens\proposal-decision-actions.ts:38:    decision,
apps/customer-web\app\_screens\proposal-decision-actions.ts:41:    approvedOption: decision === 'approved' ? read('approvedOption') : undefined,
apps/customer-web\app\_screens\proposal-decision-actions.ts:50:        "this proposal has not been sent to you yet" and "you already answered
apps/customer-web\app\_screens\proposal-decision-actions.ts:63:          ? (result.message ?? 'Your account may not answer this proposal.')
apps/customer-web\app\_screens\proposal-decision-actions.ts:67:              ? 'That proposal is no longer available. Reload the page.'
apps/customer-web\app\_screens\proposal-decision-actions.ts:72:  // Every customer screen that shows the state of a repair, because a decision
apps/customer-web\app\_screens\proposal-decision-actions.ts:73:  // moves the job card as well as the proposal. Revalidating only this page
apps/customer-web\app\_screens\proposal-decision-actions.ts:76:    '/service-and-repairs/repair-proposals',
apps/customer-web\app\_screens\proposal-decision-actions.ts:86:      decision === 'approved'
apps/customer-web\app\_screens\proposal-decision-actions.ts:88:        : decision === 'declined'
apps/customer-web\app\_screens\parts-orders-screen.tsx:148:              provider is configured — that is the owner's decision — so what the
apps/customer-web\app\_screens\parts-order-actions.ts:99: * is configured, and choosing one is the owner's decision alone. Cash, bank
apps/customer-web\app\_screens\basket-panel.tsx:274:        not exist. No payment provider is configured — that decision is the
apps/workshop-web\app\_screens\variations-screen.tsx:55:  decision: string | null;
apps/workshop-web\app\_screens\variations-screen.tsx:57:  decisionChannel: string | null;
apps/workshop-web\app\_screens\variations-screen.tsx:58:  decisionNote: string | null;
apps/workshop-web\app\_screens\variations-screen.tsx:289:        {v.decisionChannel ? ` (${v.decisionChannel.replace('_', ' ')})` : ''}
apps/workshop-web\app\_screens\variations-screen.tsx:292:      {v.decisionNote && <Detail label="What they said" value={v.decisionNote} />}
apps/workshop-web\app\_screens\variation-forms.tsx:177:  const [decision, setDecision] = React.useState('');
apps/workshop-web\app\_screens\variation-forms.tsx:179:  const needsConsent = chargeable && decision === 'approved';
apps/workshop-web\app\_screens\variation-forms.tsx:180:  const needsReason = decision === 'rejected';
apps/workshop-web\app\_screens\variation-forms.tsx:189:      <Field label="What did the customer say?" htmlFor="decision">
apps/workshop-web\app\_screens\variation-forms.tsx:191:          id="decision"
apps/workshop-web\app\_screens\variation-forms.tsx:192:          name="decision"
apps/workshop-web\app\_screens\variation-forms.tsx:194:          value={decision}
apps/workshop-web\app\_screens\variation-forms.tsx:214:          <Field label="How did they approve it?" htmlFor="decisionChannel">
apps/workshop-web\app\_screens\variation-forms.tsx:216:              id="decisionChannel"
apps/workshop-web\app\_screens\variation-forms.tsx:217:              name="decisionChannel"
apps/workshop-web\app\_screens\variation-forms.tsx:234:        htmlFor="decisionNote"
apps/workshop-web\app\_screens\variation-forms.tsx:241:        <TextInput id="decisionNote" name="decisionNote" required={needsReason} maxLength={4000} />
apps/workshop-web\app\_screens\variation-forms.tsx:244:      {decision === 'approved' && (
apps/workshop-web\app\_screens\variation-actions.ts:104:  const decision = String(form.get('decision') ?? '');
apps/workshop-web\app\_screens\variation-actions.ts:107:    `/variations/${variationId}/decision`,
apps/workshop-web\app\_screens\variation-actions.ts:109:      decision,
apps/workshop-web\app\_screens\variation-actions.ts:111:      decisionChannel: String(form.get('decisionChannel') ?? ''),
apps/workshop-web\app\_screens\variation-actions.ts:112:      decisionNote: String(form.get('decisionNote') ?? ''),
apps/workshop-web\app\_screens\variation-actions.ts:119:  if (decision === 'approved') {
apps/workshop-web\app\_screens\variation-actions.ts:125:  if (decision === 'modified') {
apps/workshop-web\app\_screens\testing-actions.ts:221: * ⚠️ THIS IS NOT A CHECKBOX. It is a decision with a name against it, held to a narrower
packages\next-shell\src\WorkspaceShell.tsx:55:   * The single-decision-point rule still holds — `viewerRole()` remains the only
packages\next-shell\src\WorkspaceGate.tsx:52: * decision, so it must be assertable without a React renderer, a DOM or a Next
packages\next-shell\src\viewer-contract.ts:21: * So: this file knows how to TURN a viewer into navigation decisions and never
apps/workshop-web\app\_screens\repair-plan-sheet-screen.tsx:35: * "this plan is finished and a revised proposal is a new attempt".
apps/workshop-web\app\_screens\repair-plan-sheet-screen.tsx:179:            This plan cannot be changed. Record a revised proposal as a new plan from the
apps/workshop-web\app\_screens\repair-plan-sheet-screen.tsx:307:      return 'Approved. This is the plan of record for this attempt, and what the quotation is priced from; a revised proposal is a new attempt.';
apps/workshop-web\app\_screens\repair-plan-review-form.tsx:17: * `<button name="decision" value="...">` puts the choice in the submitted data, so
apps/workshop-web\app\_screens\repair-plan-review-form.tsx:18: * which button was pressed IS the decision — there is no hidden state that can
apps/workshop-web\app\_screens\repair-plan-review-form.tsx:61:    // `submitter` is what carries the decision — see the header note. Read before any
apps/workshop-web\app\_screens\repair-plan-review-form.tsx:64:    const decision = submitter?.value === 'rejected' ? 'rejected' : 'approved';
apps/workshop-web\app\_screens\repair-plan-review-form.tsx:72:    data.set('decision', decision);
apps/workshop-web\app\_screens\repair-plan-review-form.tsx:74:    setPending(decision);
apps/workshop-web\app\_screens\repair-plan-review-form.tsx:183:          {/* States the consequence before either button is pressed. Neither decision can
apps/workshop-web\app\_screens\repair-plan-review-form.tsx:185:          A decision cannot be undone: a rejected plan is kept as the record of the
apps/workshop-web\app\_screens\repair-plan-review-form.tsx:186:          disagreement rather than reopened, and a revised proposal is a new attempt.
apps/workshop-web\app\_screens\repair-plan-review-form.tsx:202:            name="decision"
apps/workshop-web\app\_screens\repair-plan-review-form.tsx:205:            style={decisionButton(pending === 'approved', primitive.color.blue[600])}
apps/workshop-web\app\_screens\repair-plan-review-form.tsx:211:            name="decision"
apps/workshop-web\app\_screens\repair-plan-review-form.tsx:214:            style={decisionButton(pending === 'rejected', primitive.color.red[700])}
apps/workshop-web\app\_screens\repair-plan-review-form.tsx:224:function decisionButton(busy: boolean, background: string) {
apps/workshop-web\app\_screens\repair-plan-queue-screen.tsx:312:                          repair plan to record a revised proposal" — so that has to be
apps/workshop-web\app\_screens\repair-plan-labels.ts:87: * The opposite decision to the hours, and for a reason: quantities are usually whole
apps/workshop-web\app\_screens\repair-plan-builder-form.tsx:529:          so it must not move underneath them — and a revised proposal is a new attempt.
apps/workshop-web\app\_screens\repair-plan-actions.ts:415:  const decision = String(formData.get('decision') ?? '').trim();
apps/workshop-web\app\_screens\repair-plan-actions.ts:421:  if (decision !== 'approved' && decision !== 'rejected') {
apps/workshop-web\app\_screens\repair-plan-actions.ts:424:  if (decision === 'rejected' && note === '') {
apps/workshop-web\app\_screens\repair-plan-actions.ts:434:    { decision, note: note === '' ? undefined : note },
apps/workshop-web\app\_screens\quotation-sheet-screen.tsx:22: *   2. SUBMITTED, and this viewer may approve it — the document plus §5's decision.
apps/workshop-web\app\_screens\quotation-review-form.tsx:12: * ONE FORM, TWO BUTTONS, the decision carried by the button that was pressed:
apps/workshop-web\app\_screens\quotation-review-form.tsx:13: * `<button name="decision" value="...">` puts the choice in the submitted data, so
apps/workshop-web\app\_screens\quotation-review-form.tsx:44:    const decision = submitter?.value === 'rejected' ? 'rejected' : 'approved';
apps/workshop-web\app\_screens\quotation-review-form.tsx:49:    data.set('decision', decision);
apps/workshop-web\app\_screens\quotation-review-form.tsx:51:    setPending(decision);
apps/workshop-web\app\_screens\quotation-review-form.tsx:112:          A decision cannot be undone: a rejected quotation is kept as the record of the
apps/workshop-web\app\_screens\quotation-review-form.tsx:123:          <button type="submit" name="decision" value="approved" disabled={pending !== null}
apps/workshop-web\app\_screens\quotation-review-form.tsx:127:          <button type="submit" name="decision" value="rejected" disabled={pending !== null}
apps/workshop-web\app\_screens\quotation-…18546 tokens truncated…. Record the customer decision on the Customer ' +
apps/api\src\repair\execution.service.ts:260:           (tenant_id, organization_id, job_card_id, proposal_id, attempt_no,
apps/api\src\repair\execution.service.ts:265:          ctx.tenantId, ctx.organizationId, cardId, proposal.id, attemptNo,
apps/api\src\repair\execution.service.ts:281:        [ctx.tenantId, ctx.organizationId, executionId, ctx.userId, proposal.repair_plan_id],
apps/api\src\repair\execution.service.ts:291:          proposalVersionNo: proposal.version_no,
apps/api\src\repair\execution.service.ts:734:              e.proposal_id, pr.version_no AS proposal_version_no,
apps/api\src\repair\execution.service.ts:745:         JOIN repair.repair_proposals pr ON pr.id = e.proposal_id AND pr.tenant_id = e.tenant_id
apps/api\src\repair\execution.service.ts:883:        proposalId: row.proposal_id,
apps/api\src\repair\execution.service.ts:884:        proposalVersionNo: row.proposal_version_no,
apps/api\src\repair\execution.service.ts:1083:  proposal_id: string;
apps/api\src\repair\execution.service.ts:1084:  proposal_version_no: number;
apps/api\src\repair\execution-rules.ts:109: * ⚠️ ABSENT, and each is a decision:
apps/api\src\repair\diagnosis.spec.ts:302:      svc.review(ctx({ activeRole: 'technician' }), DIAGNOSIS_ID, { decision: 'approved' }),
apps/api\src\repair\diagnosis.spec.ts:317:        decision: 'approved',
apps/api\src\repair\diagnosis.spec.ts:331:      { decision: 'approved' },
apps/api\src\repair\diagnosis.spec.ts:344:        decision: 'rejected',
apps/api\src\repair\diagnosis.spec.ts:357:        decision: 'approved',
apps/api\src\repair\diagnosis.spec.ts:370:        decision: 'approved',
apps/api\src\repair\diagnosis.spec.ts:385:        decision: 'approved',
apps/api\src\repair\diagnosis.spec.ts:396:        decision: 'approved',
apps/api\src\repair\diagnosis.spec.ts:1131:  it('keeps the review decisions a strict subset of the statuses', () => {
apps/api\src\repair\diagnosis.service.ts:778:    input: { decision?: string; note?: string },
apps/api\src\repair\diagnosis.service.ts:782:    const decision: ReviewDecision = requireOneOf(input.decision, REVIEW_DECISIONS, 'decision');
apps/api\src\repair\diagnosis.service.ts:789:    if (decision === 'rejected' && note === null) {
apps/api\src\repair\diagnosis.service.ts:837:        [decision, ctx.userId, note, id, ctx.tenantId],
apps/api\src\repair\diagnosis.service.ts:841:        action: decision === 'approved' ? 'diagnosis.approved' : 'diagnosis.rejected',
apps/api\src\repair\diagnosis.service.ts:847:        detail: { jobNumber: row.job_number, attemptNo: row.attempt_no, decision },
apps/api\src\repair\diagnosis-rules.ts:117: * ⚠️ THE ABSENCES, restated because they are decisions:
apps/api\src\public\catalogue-rules.ts:5: * so the decisions can be tested without a database. Nothing here touches
apps/customer-web\app\(app)\layout.tsx:17:  description: 'Vehicle owners — garage, complaints, proposals, payments',
apps/api\src\marketplace\payment-provider.ts:6: * decision and it belongs to the owner alone (CLAUDE.md §1: never introduce a
apps/api\src\marketplace\order.service.ts:103:        // Converting would need a rate, and a rate is a financial decision this
apps/api\src\marketplace\order.service.ts:289:      const decision = canTransition(order.status, to, actor);
apps/api\src\marketplace\order.service.ts:290:      if (!decision.allowed) throw new BadRequestException(decision.reason);
apps/api\src\marketplace\order.service.ts:401:   * decision alone.
apps/api\src\marketplace\order-rules.ts:5: * decisions can be tested without a database. Nothing in this file is async and
apps/api\src\marketplace\order-rules.ts:310: * require a rate, and a rate is a financial decision this platform has no
apps/api\src\marketplace\order-rules.spec.ts:104:    // Converting needs a rate, and a rate is a financial decision this
apps/api\src\marketplace\order-rules.spec.ts:290:    // settlement route nobody chose. That is a spend decision leaking into a
apps/api\src\marketplace\marketplace.controller.ts:113:   * configured, and choosing one is the owner's decision alone. This is the
apps/workshop-web\app\page.tsx:32: * AutoWorkshop keeps its seven apps — that decision stands — so the equivalent
apps/workshop-web\app\layout.tsx:129:            'workshop.proposals.pendingApproval': 2,
apps/workshop-web\app\workshop-management\pricing-rules\page.tsx:28: * recorded in `.claude/CURRENT_TASK.md` as a decision for the owner rather than
packages\auth\verify\probe-repair-plan.mjs:228:      decision: 'rejected',
packages\auth\verify\probe-repair-plan.mjs:259:      decision: 'rejected',
packages\auth\verify\probe-repair-plan.mjs:395:const approved = await call(SUP, `/diagnoses/${diagnosisId}/review`, 'POST', { decision: 'approved' });
packages\auth\verify\probe-repair-plan.mjs:651:const techReview = await call(TECH, `/repair-plans/${planId}/review`, 'POST', { decision: 'approved' });
packages\auth\verify\probe-repair-plan.mjs:658:const noReason = await call(SUP, `/repair-plans/${planId}/review`, 'POST', { decision: 'rejected' });
packages\auth\verify\probe-repair-plan.mjs:666:  decision: 'approved',
packages\auth\verify\probe-repair-plan.mjs:672:const again = await call(SUP, `/repair-plans/${planId}/review`, 'POST', { decision: 'rejected', note: 'no' });
packages\auth\verify\probe-repair-plan.mjs:700:  const ownReview = await call(SUP, `/repair-plans/${supPlanId}/review`, 'POST', { decision: 'approved' });
packages\auth\verify\probe-repair-plan.mjs:719:    decision: 'approved',
apps/api\src\identity\me.service.ts:43: * The response is a VIEW, not an authorization decision. A client that ignores
apps/workshop-web\app\home\dashboard\page.tsx:221:      hint: 'Parked — needs a decision',
apps/workshop-web\app\customers-and-vehicles\register-vehicle\page.tsx:9: * Added by the navigation-gap proposal (`docs/03-ui-ux/NAVIGATION-GAPS-PROPOSAL.md`,
apps/workshop-web\app\solution-and-approval\customer-proposals\[id]\page.tsx:2:import { ProposalSheetScreen } from '../../../_screens/proposal-sheet-screen';
apps/workshop-web\app\solution-and-approval\customer-proposals\[id]\page.tsx:5: * /solution-and-approval/customer-proposals/<id> — one customer proposal. the §34 WORKSPACE DEFAULT tree.
apps/workshop-web\app\solution-and-approval\customer-proposals\[id]\page.tsx:8: * navigation advertises one entry per proposal. `check-page-gates.sh` strips trailing
apps/workshop-web\app\solution-and-approval\customer-proposals\[id]\page.tsx:18:  await requireNavRoute('workshop', '/solution-and-approval/customer-proposals');
apps/workshop-web\app\solution-and-approval\customer-proposals\[id]\page.tsx:20:  return <ProposalSheetScreen route="/solution-and-approval/customer-proposals" proposalId={id} />;
apps/workshop-web\app\customers-and-vehicles\register-customer\page.tsx:9: * Added by the navigation-gap proposal (`docs/03-ui-ux/NAVIGATION-GAPS-PROPOSAL.md`,
apps/workshop-web\app\solution-and-approval\customer-proposals\page.tsx:2:import { ProposalQueueScreen } from '../../_screens/proposal-queue-screen';
apps/workshop-web\app\solution-and-approval\customer-proposals\page.tsx:5: * /solution-and-approval/customer-proposals — the §34 WORKSPACE DEFAULT tree.
apps/workshop-web\app\solution-and-approval\customer-proposals\page.tsx:19:  await requireNavRoute('workshop', '/solution-and-approval/customer-proposals');
apps/workshop-web\app\solution-and-approval\customer-proposals\page.tsx:20:  return <ProposalQueueScreen route="/solution-and-approval/customer-proposals" />;
packages\auth\verify\probe-quotation.mjs:183:    decision: 'rejected', note: 'settled by a re-run of probe-quotation.mjs',
packages\auth\verify\probe-quotation.mjs:344:const ownApproval = await call(ADMIN, `/quotations/${q.id}/review`, 'POST', { decision: 'approved' });
packages\auth\verify\probe-quotation.mjs:351:const supApproval = await call(SUP, `/quotations/${q.id}/review`, 'POST', { decision: 'approved' });
packages\auth\verify\probe-quotation.mjs:358:const noReason = await call(TECH, `/quotations/${q.id}/review`, 'POST', { decision: 'rejected' });
packages\auth\verify\probe-quotation.mjs:366:  decision: 'approved',
apps/api\src\catalogue\supplier-catalogue.service.ts:355:   * Everything awaiting a decision.
apps/api\src\catalogue\supplier-catalogue.service.ts:496:            'publishing is an administrator decision. Your draft is saved and appears in ' +
apps/api\src\catalogue\directory.service.ts:32:   * decision". The policy is the enforcement; this is the explanation.
apps/workshop-web\app\settings\pricing\page.tsx:7: * Added by the navigation-gap proposal (`docs/03-ui-ux/NAVIGATION-GAPS-PROPOSAL.md`,
apps/api\src\catalogue\catalogue.controller.ts:117: * ADMINISTRATOR-side catalogue decisions — publication and verification.
apps/api\src\catalogue\catalogue.controller.ts:145:        'publishing to the public marketplace is a platform administrator decision',
apps/api\src\catalogue\catalogue.controller.ts:150:  /** Everything awaiting a decision: unpublished suppliers and unpublished parts. */
apps/api\src\catalogue\catalogue-write-rules.ts:10: * decisions are testable without a database — and, more importantly, so the
apps/api\src\catalogue\catalogue-write-rules.spec.ts:175:    // Publication is an administrator decision (024). Even if the trigger were
apps/workshop-web\app\requests-and-reception\register-vehicle\page.tsx:9: * Added by the navigation-gap proposal (`docs/03-ui-ux/NAVIGATION-GAPS-PROPOSAL.md`,
apps/workshop-web\app\requests-and-reception\register-customer\page.tsx:9: * Added by the navigation-gap proposal (`docs/03-ui-ux/NAVIGATION-GAPS-PROPOSAL.md`,
apps/api\Dockerfile:5:# critical path. That decision was made because Render's builder failed
packages\auth\verify\probe-proposal.mjs:2: * Probe the proposal endpoints with REAL Keycloak access tokens — Phase 5, slice 6.
packages\auth\verify\probe-proposal.mjs:4: * WHY THIS EXISTS. §424 — "approved proposals shall be immutable; a material change
packages\auth\verify\probe-proposal.mjs:14: *   (cd packages/auth && node verify/probe-proposal.mjs)
packages\auth\verify\probe-proposal.mjs:97:const prior = (await call(ADMIN, `/job-cards/${card.id}/proposals`)).json ?? [];
packages\auth\verify\probe-proposal.mjs:102:    await call(ADMIN, `/proposals/${openProposal.id}`, 'PATCH', { expectedResult: 'residue' });
packages\auth\verify\probe-proposal.mjs:103:    await call(ADMIN, `/proposals/${openProposal.id}/issue`, 'POST', {});
packages\auth\verify\probe-proposal.mjs:105:  await call(ADMIN, `/proposals/${openProposal.id}/decision`, 'POST', {
packages\auth\verify\probe-proposal.mjs:106:    decision: 'declined', decidedByName: 'probe residue', decisionChannel: 'in_person',
packages\auth\verify\probe-proposal.mjs:107:    note: 'settled by a re-run of probe-proposal.mjs',
packages\auth\verify\probe-proposal.mjs:115:const techPrepare = await call(TECH, `/job-cards/${card.id}/proposals`, 'POST', {});
packages\auth\verify\probe-proposal.mjs:117:  'a TECHNICIAN may not prepare a customer proposal',
packages\auth\verify\probe-proposal.mjs:121:const supPrepare = await call(SUP, `/job-cards/${card.id}/proposals`, 'POST', {});
packages\auth\verify\probe-proposal.mjs:132:const prepared = await call(ADMIN, `/job-cards/${card.id}/proposals`, 'POST', {});
packages\auth\verify\probe-proposal.mjs:133:check('a proposal is prepared', prepared.status === 201 || prepared.status === 200, message(prepared));
packages\auth\verify\probe-proposal.mjs:135:if (!p?.id) { console.error('no proposal'); process.exit(2); }
packages\auth\verify\probe-proposal.mjs:178:console.log('\n3. §418 — a price with no promise attached is not a proposal');
packages\auth\verify\probe-proposal.mjs:180:const tooEarly = await call(ADMIN, `/proposals/${p.id}/issue`, 'POST', {});
packages\auth\verify\probe-proposal.mjs:187:const narrative = await call(ADMIN, `/proposals/${p.id}`, 'PATCH', {
packages\auth\verify\probe-proposal.mjs:193:const issued = await call(ADMIN, `/proposals/${p.id}/issue`, 'POST', {});
packages\auth\verify\probe-proposal.mjs:197:const editAfterIssue = await call(ADMIN, `/proposals/${p.id}`, 'PATCH', {
packages\auth\verify\probe-proposal.mjs:201:  '⚠️ an ISSUED proposal is frozen — the customer is reading this exact document',
packages\auth\verify\probe-proposal.mjs:206:// ── 4. §7's decision, and its attribution ───────────────────────────────────
packages\auth\verify\probe-proposal.mjs:208:console.log('\n4. §7 — the decision, and who made it');
packages\auth\verify\probe-proposal.mjs:210:const noName = await call(ADMIN, `/proposals/${p.id}/decision`, 'POST', {
packages\auth\verify\probe-proposal.mjs:211:  decision: 'approved', approvedOption: 'recommended', decisionChannel: 'telephone',
packages\auth\verify\probe-proposal.mjs:218:const noChannel = await call(ADMIN, `/proposals/${p.id}/decision`, 'POST', {
packages\auth\verify\probe-proposal.mjs:219:  decision: 'approved', approvedOption: 'recommended', decidedByName: 'Kwame Mensah',
packages\auth\verify\probe-proposal.mjs:226:const noReason = await call(ADMIN, `/proposals/${p.id}/decision`, 'POST', {
packages\auth\verify\probe-proposal.mjs:227:  decision: 'declined', decidedByName: 'Kwame Mensah', decisionChannel: 'telephone',
packages\auth\verify\probe-proposal.mjs:231:const decided = await call(ADMIN, `/proposals/${p.id}/decision`, 'POST', {
packages\auth\verify\probe-proposal.mjs:232:  decision: 'approved',
packages\auth\verify\probe-proposal.mjs:235:  decisionChannel: 'telephone',
packages\auth\verify\probe-proposal.mjs:240:check('the channel is recorded', decided.json?.decisionChannel === 'telephone', decided.json?.decisionChannel);
packages\auth\verify\probe-proposal.mjs:254:console.log('\n5. §424 — an approved proposal is IMMUTABLE');
packages\auth\verify\probe-proposal.mjs:256:const editAfterApproval = await call(ADMIN, `/proposals/${p.id}`, 'PATCH', {
packages\auth\verify\probe-proposal.mjs:265:const decideAgain = await call(ADMIN, `/proposals/${p.id}/decision`, 'POST', {
packages\auth\verify\probe-proposal.mjs:266:  decision: 'declined', decidedByName: 'Someone Else', decisionChannel: 'email', note: 'no',
packages\auth\verify\probe-proposal.mjs:269:  'and the decision cannot be overwritten',
packages\auth\verify\probe-proposal.mjs:274:const newVersion = await call(ADMIN, `/job-cards/${card.id}/proposals`, 'POST', {});
packages\auth\verify\probe-proposal.mjs:276:  '⚠️ a new version is REFUSED on an approved proposal without a fresh quotation',
packages\auth\verify\probe-proposal.mjs:289:const missing = await call(ADMIN, '/proposals/00000000-0000-4000-8000-000000000000');
packages\auth\verify\probe-proposal.mjs:291:const techRead = await call(TECH, `/proposals/${p.id}`);
apps/workshop-web\app\repair-services\repairs-in-progress\page.tsx:12: * requires an APPROVED customer proposal before any work starts (§7), and Postgres RLS
apps/workshop-web\app\customer-reception\register-vehicle\page.tsx:9: * Added by the navigation-gap proposal (`docs/03-ui-ux/NAVIGATION-GAPS-PROPOSAL.md`,
apps/workshop-web\app\customer-reception\register-customer\page.tsx:9: * Added by the navigation-gap proposal (`docs/03-ui-ux/NAVIGATION-GAPS-PROPOSAL.md`,
apps/workshop-web\app\customer-approval\pending-approvals\[id]\page.tsx:2:import { ProposalSheetScreen } from '../../../_screens/proposal-sheet-screen';
apps/workshop-web\app\customer-approval\pending-approvals\[id]\page.tsx:5: * /customer-approval/pending-approvals/<id> — one customer proposal. the §47 WORKSHOP MANAGER tree — the role that chases an unanswered proposal.
apps/workshop-web\app\customer-approval\pending-approvals\[id]\page.tsx:8: * navigation advertises one entry per proposal. `check-page-gates.sh` strips trailing
apps/workshop-web\app\customer-approval\pending-approvals\[id]\page.tsx:20:  return <ProposalSheetScreen route="/customer-approval/pending-approvals" proposalId={id} />;
apps/workshop-web\app\customer-approval\pending-approvals\page.tsx:2:import { ProposalQueueScreen } from '../../_screens/proposal-queue-screen';
apps/workshop-web\app\customer-approval\pending-approvals\page.tsx:5: * /customer-approval/pending-approvals — the §47 WORKSHOP MANAGER tree — the role that chases an unanswered proposal.
apps/workshop-web\app\repair-control\repairs-in-progress\page.tsx:12: * requires an APPROVED customer proposal before any work starts (§7), and Postgres RLS
apps/workshop-web\app\repair-control\repair-progress\page.tsx:12: * requires an APPROVED customer proposal before any work starts (§7), and Postgres RLS
packages\auth\verify\probe-execution.mjs:114:// ── locate a card with an APPROVED customer proposal ────────────────────────
packages\auth\verify\probe-execution.mjs:116:const proposals = (await call(ADMIN, '/proposals')).json ?? [];
packages\auth\verify\probe-execution.mjs:117:const approved = proposals.find((p) => p.status === 'approved');
packages\auth\verify\probe-execution.mjs:119:  console.error('no APPROVED customer proposal anywhere — run probe-proposal.mjs first');
packages\auth\verify\probe-execution.mjs:124:if (!card) { console.error('the approved proposal is on a card this identity cannot see'); process.exit(2); }
packages\auth\verify\probe-execution.mjs:203:check('it records WHICH proposal authorised it', e.proposalId === approved.id, e.proposalId);
apps/workshop-web\app\repair-control\customer-approval\[id]\page.tsx:2:import { ProposalSheetScreen } from '../../../_screens/proposal-sheet-screen';
apps/workshop-web\app\repair-control\customer-approval\[id]\page.tsx:5: * /repair-control/customer-approval/<id> — one customer proposal. the §46 WORKSHOP OWNER tree.
apps/workshop-web\app\repair-control\customer-approval\[id]\page.tsx:8: * navigation advertises one entry per proposal. `check-page-gates.sh` strips trailing
apps/workshop-web\app\repair-control\customer-approval\[id]\page.tsx:20:  return <ProposalSheetScreen route="/repair-control/customer-approval" proposalId={id} />;
apps/workshop-web\app\repair-control\customer-approval\page.tsx:2:import { ProposalQueueScreen } from '../../_screens/proposal-queue-screen';
packages\auth\src\workspace-auth.ts:393:  // as guaranteed — as an earlier comment here did — put the whole decision on a
packages\auth\src\sign-out.ts:70:  // supply the full address would move that decision out of the allow-list.
apps/workshop-web\app\record-work\variation-requests\page.tsx:7: * The §49 TECHNICIAN tree's route, under Record Work — where §3764 step 11 puts it, between recording unexpected findings and completing the authorised repair. This is where variations are RAISED. The technician sees no review or decision controls here: they raised it, so §3792 requires somebody else.
apps/workshop-web\app\record-work\time-records\page.tsx:12: * requires an APPROVED customer proposal before any work starts (§7), and Postgres RLS
apps/workshop-web\app\record-work\repair-tasks\page.tsx:12: * requires an APPROVED customer proposal before any work starts (§7), and Postgres RLS
apps/workshop-web\app\record-work\repair-evidence\page.tsx:12: * requires an APPROVED customer proposal before any work starts (§7), and Postgres RLS
apps/workshop-web\app\record-work\parts-used\page.tsx:12: * requires an APPROVED customer proposal before any work starts (§7), and Postgres RLS
packages\auth\verify\probe-diagnosis.mjs:415:  decision: 'approved',
packages\auth\verify\probe-diagnosis.mjs:433:  decision: 'rejected',
packages\auth\verify\probe-diagnosis.mjs:442:  decision: 'approved',
packages\auth\verify\probe-diagnosis.mjs:455:  decision: 'rejected',
packages\auth\verify\probe-catalogue.mjs:234:console.log('\n5. fitments on a published part are an administrator decision');
rg: domains: The system cannot find the file specified. (os error 2)

 exited 1 in 1260ms:
apps\api\vitest.config.ts:1:import { defineConfig } from 'vitest/config';
apps\api\vitest.config.ts:5:    include: ['src/**/*.spec.ts'],
packages\ui\vitest.config.ts:1:import { defineConfig } from 'vitest/config';
packages\ui\vitest.config.ts:6:    // `apps/api` on `.spec.ts`, and NOTHING enforced which one you were in — a
packages\ui\vitest.config.ts:9:    // exactly that (`pnpm e2e` green while collecting nothing), so the include
packages\ui\vitest.config.ts:12:    include: ['src/**/*.{test,spec}.ts'],
apps\workshop-web\package.json:11:    "test": "vitest run"
apps\workshop-web\package.json:30:    "vitest": "^2.1.9"
packages\ui\package.json:17:    "test": "vitest run --passWithNoTests"
packages\ui\package.json:27:    "vitest": "^2.1.8"
packages\auth\vitest.config.ts:1:import { defineConfig } from 'vitest/config';
packages\auth\vitest.config.ts:6:    // `apps/api` on `.spec.ts`, and NOTHING enforced which one you were in — a
packages\auth\vitest.config.ts:9:    // exactly that (`pnpm e2e` green while collecting nothing), so the include
packages\auth\vitest.config.ts:12:    include: ['src/**/*.{test,spec}.ts'],
packages\auth\package.json:18:    "test": "vitest run --passWithNoTests"
packages\auth\package.json:29:    "vitest": "^2.1.8"
packages\navigation\package.json:10:    "test": "vitest run --passWithNoTests"
packages\navigation\package.json:18:    "vitest": "^2.1.8"
packages\marketplace-ui\package.json:19:    "test": "vitest run --passWithNoTests"
packages\marketplace-ui\package.json:30:    "vitest": "^2.1.8"
packages\next-shell\package.json:20:    "test": "vitest run --passWithNoTests"
packages\next-shell\package.json:31:    "vitest": "^2.1.8"
apps\api\package.json:11:    "test": "vitest run --passWithNoTests"
apps\api\package.json:38:    "vitest": "^2.1.8"
packages\next-shell\vitest.config.ts:1:import { defineConfig } from 'vitest/config';
packages\next-shell\vitest.config.ts:6:    // `apps/api` on `.spec.ts`, and NOTHING enforced which one you were in — a
packages\next-shell\vitest.config.ts:9:    // exactly that (`pnpm e2e` green while collecting nothing), so the include
packages\next-shell\vitest.config.ts:12:    include: ['src/**/*.{test,spec}.ts'],
apps\customer-web\package.json:11:    "test": "vitest run"
apps\customer-web\package.json:30:    "vitest": "^2.1.9"
apps\mobile\package.json:10:    "test": "vitest run"
apps\mobile\package.json:28:    "vitest": "^2.1.9"
rg: domains: The system cannot find the file specified. (os error 2)

2026-08-04T14:30:15.272556Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 1.3 seconds
Output:
apps\api\vitest.config.ts:1:import { defineConfig } from 'vitest/config';
apps\api\vitest.config.ts:5:    include: ['src/**/*.spec.ts'],
packages\ui\vitest.config.ts:1:import { defineConfig } from 'vitest/config';
packages\ui\vitest.config.ts:6:    // `apps/api` on `.spec.ts`, and NOTHING enforced which one you were in — a
packages\ui\vitest.config.ts:9:    // exactly that (`pnpm e2e` green while collecting nothing), so the include
packages\ui\vitest.config.ts:12:    include: ['src/**/*.{test,spec}.ts'],
apps\workshop-web\package.json:11:    "test": "vitest run"
apps\workshop-web\package.json:30:    "vitest": "^2.1.9"
packages\ui\package.json:17:    "test": "vitest run --passWithNoTests"
packages\ui\package.json:27:    "vitest": "^2.1.8"
packages\auth\vitest.config.ts:1:import { defineConfig } from 'vitest/config';
packages\auth\vitest.config.ts:6:    // `apps/api` on `.spec.ts`, and NOTHING enforced which one you were in — a
packages\auth\vitest.config.ts:9:    // exactly that (`pnpm e2e` green while collecting nothing), so the include
packages\auth\vitest.config.ts:12:    include: ['src/**/*.{test,spec}.ts'],
packages\auth\package.json:18:    "test": "vitest run --passWithNoTests"
packages\auth\package.json:29:    "vitest": "^2.1.8"
packages\navigation\package.json:10:    "test": "vitest run --passWithNoTests"
packages\navigation\package.json:18:    "vitest": "^2.1.8"
packages\marketplace-ui\package.json:19:    "test": "vitest run --passWithNoTests"
packages\marketplace-ui\package.json:30:    "vitest": "^2.1.8"
packages\next-shell\package.json:20:    "test": "vitest run --passWithNoTests"
packages\next-shell\package.json:31:    "vitest": "^2.1.8"
apps\api\package.json:11:    "test": "vitest run --passWithNoTests"
apps\api\package.json:38:    "vitest": "^2.1.8"
packages\next-shell\vitest.config.ts:1:import { defineConfig } from 'vitest/config';
packages\next-shell\vitest.config.ts:6:    // `apps/api` on `.spec.ts`, and NOTHING enforced which one you were in — a
packages\next-shell\vitest.config.ts:9:    // exactly that (`pnpm e2e` green while collecting nothing), so the include
packages\next-shell\vitest.config.ts:12:    include: ['src/**/*.{test,spec}.ts'],
apps\customer-web\package.json:11:    "test": "vitest run"
apps\customer-web\package.json:30:    "vitest": "^2.1.9"
apps\mobile\package.json:10:    "test": "vitest run"
apps\mobile\package.json:28:    "vitest": "^2.1.9"
rg: domains: The system cannot find the file specified. (os error 2)

 succeeded in 1635ms:
scripts\_codex-runner.sh
scripts\supervise-codex.sh
scripts\quality-gate.sh
scripts\codex-test-review.sh
scripts\codex-security-review.sh
scripts\codex-review.sh
scripts\codex-performance-review.sh
scripts\codex-db-review.sh
reviews\codex-security-review.md
reviews\codex-review.md
reviews\codex-review-t0030-harness.md
reviews\codex-review-t0027-workspace-role.md
reviews\codex-review-t0018-scheduling.md
reviews\codex-review-t0005-finding5-signout.md
reviews\codex-review-t0003-identity.md
reviews\codex-review-phase3-pass2.md
reviews\codex-review-phase3-pass1.md
reviews\codex-review-guardrail-selftest.md
reviews\codex-review-c3-backup.md
packages\ui\vitest.config.ts
packages\next-shell\vitest.config.ts
packages\auth\vitest.config.ts
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql
infrastructure\migrations\037_registration_rls_bootstrap.sql
apps\e2e\verify\verify-technician-workflow.mjs
apps\e2e\verify\verify-customer-workflow.mjs
apps\api\vitest.config.ts
ai-coworkers\quality-gates.md
ai-coworkers\codex-role.md
ai-coworkers\codex-review-prompts.md

 succeeded in 2254ms:
apps\supplier-web\app\auth\error\page.tsx:4: * /auth/error — where `pages.error` sends a failed sign-in.
apps\workshop-web\app\_screens\testing-actions.ts:30:      return 'Your session has ended. Sign in again, then retry.';
apps\workshop-web\app\_screens\stage-actions.ts:47:      return 'Your session has ended. Sign in again, then retry.';
apps\workshop-web\app\_screens\repair-plan-actions.ts:55:      return 'Your session has ended. Sign in again, then retry.';
apps\workshop-web\app\_screens\register-actions.ts:52:      return 'Your session has ended. Sign in again, then retry.';
apps\workshop-web\app\_screens\quotation-actions.ts:35:      return 'Your session has ended. Sign in again, then retry.';
apps\workshop-web\app\_screens\proposal-actions.ts:30:      return 'Your session has ended. Sign in again, then retry.';
apps\workshop-web\app\_screens\inspection-actions.ts:46:      return 'Your session has ended. Sign in again, then retry.';
apps\workshop-web\app\_screens\execution-actions.ts:30:      return 'Your session has ended. Sign in again, then retry.';
apps\workshop-web\app\_screens\diagnosis-actions.ts:53:      return 'Your session has ended. Sign in again, then retry.';
apps\workshop-web\app\_screens\create-workshop-actions.ts:62:          ? 'Your session has ended. Sign in again, then retry.'
apps\insurance-web\app\auth\error\page.tsx:4: * /auth/error — where `pages.error` sends a failed sign-in.
packages\next-shell\src\viewer.ts:62:  // by the same retry.
packages\next-shell\src\viewer-contract.ts:268: * signed in. `/me` recovers by retrying without the selection, so the shell
packages\next-shell\src\index.ts:76: * `workspace-auth.ts`. Every app must mount it at `/auth/error`, or that
packages\next-shell\src\AuthErrorScreen.tsx:14: *     Configuration — "There is a problem with the server configuration."
packages\next-shell\src\AuthErrorScreen.tsx:23: * ── WHY THIS RATHER THAN A KEEP-WARM ────────────────────────────────────────
packages\next-shell\src\AuthErrorScreen.tsx:25: * A warmer was the obvious fix and the arithmetic refuses it. FOUR free Render
packages\next-shell\src\AuthErrorScreen.tsx:30: * `suspenders: ['billing']` on 2026-07-28. `keep-warm.yml` exists alongside this
packages\next-shell\src\AuthErrorScreen.tsx:38: * ⚠️ IT STILL DISTINGUISHES A REAL FAULT. `Configuration` after a wake has
packages\next-shell\src\AuthErrorScreen.tsx:40: * that — the retry is bounded, and once the countdown is spent the copy stops
packages\next-shell\src\AuthErrorScreen.tsx:42: * that says "starting up" forever is the monitor that always reports healthy.
packages\next-shell\src\AuthErrorScreen.tsx:46: * Auth.js's error codes. `Configuration` is the one this screen exists for; the
packages\next-shell\src\AuthErrorScreen.tsx:51:  Configuration: {
packages\next-shell\src\AuthErrorScreen.tsx:52:    title: 'The sign-in service is starting up',
packages\next-shell\src\AuthErrorScreen.tsx:88:   * That was the first version and it CRASHES on `/auth/error?error=`. With an
packages\next-shell\src\AuthErrorScreen.tsx:166: * ⚠️ ONE automatic retry, then it stops and hands over to the visitor. A page
packages\next-shell\src\AuthErrorScreen.tsx:179:        <Link href={signInHref} id="aw-auth-retry">
packages\next-shell\src\AuthErrorScreen.tsx:189:  var link = document.getElementById('aw-auth-retry');
packages\next-shell\src\AuthErrorScreen.tsx:194:  // promising "retrying automatically" and then did nothing. A screen whose
packages\next-shell\src\AuthErrorScreen.tsx:198:    el.textContent = '— automatic retry already used; use the link above';
packages\next-shell\src\AuthErrorScreen.tsx:215:    el.textContent = '— retrying automatically in ' + left + 's';
packages\navigation\src\workspaces.ts:494:      ['system-configuration', 'System Configuration'],
apps\fleet-web\app\auth\error\page.tsx:4: * /auth/error — where `pages.error` sends a failed sign-in.
apps\e2e\verify\verify-workshop-onboarding.mjs:134:  // "Create" quick-action placeholder and spent three minutes retrying a
packages\auth\src\workspace-auth.ts:156:     * KEEP THAT ALLOW-LIST TIGHT. It is currently `http://localhost:<port>/*`
packages\auth\src\workspace-auth.ts:171:     * fetch fails and Auth.js renders `Configuration` — "There is a problem with
packages\auth\src\workspace-auth.ts:179:     * ⚠️ EVERY APP MUST MOUNT `/auth/error`. This is set once here for all seven
packages\auth\src\workspace-auth.ts:185:    pages: { error: '/auth/error' },
packages\auth\src\auth-error-route.test.ts:8: * `workspace-auth.ts` points every workspace's failed sign-in at `/auth/error`.
packages\auth\src\auth-error-route.test.ts:44:  it.each(webApps)('%s mounts /auth/error', (app) => {
packages\auth\src\auth-error-route.test.ts:45:    const page = join(appsDir, app, 'app/auth/error/page.tsx');
packages\auth\src\auth-error-route.test.ts:48:      `${app} has no app/auth/error/page.tsx — a failed sign-in there 404s, because ` +
packages\auth\src\auth-error-route.test.ts:49:        'workspace-auth.ts sets pages.error = "/auth/error" for every workspace',
packages\auth\src\auth-error-route.test.ts:59:    expect(config).toContain("pages: { error: '/auth/error' }");
apps\e2e\playwright.config.ts:47:  // A shell defect is usually deterministic; a retry that goes green is a
apps\e2e\playwright.config.ts:48:  // flake worth seeing, so retry only on CI and never locally.
apps\customer-web\app\_screens\report-problem-actions.ts:52:            ? 'Your session has ended. Sign in again, then retry.'
apps\customer-web\app\_screens\proposal-decision-actions.ts:65:            ? 'Your session has ended. Sign in again, then retry.'
apps\customer-web\app\_screens\add-vehicle-actions.ts:65:            ? 'Your session has ended. Sign in again, then retry.'
apps\customer-web\app\auth\error\page.tsx:4: * /auth/error — where `pages.error` sends a failed sign-in.
apps\customer-web\app\(app)\marketplace\page.tsx:22: * ⚠️ INSIDE THE `(app)` GROUP, SO IT KEEPS THE SHELL — and that was a fix, not
apps\api\src\repair\job-card.service.ts:524:                -- WARRANTY FOLLOW-UP KEEPS THE CLOSE (Supervisor pass on this
apps\api\src\repair\job-card-stages.spec.ts:156:  it('KEEPS the completion date when the card moves to warranty follow-up', async () => {
apps\api\src\repair\diagnosis.spec.ts:272:  it('lets the STOREKEEPER read but never record', async () => {
apps\api\src\identity\registration.controller.ts:130:      // the other end was told the server was broken. They would retry, get 500
apps\api\src\catalogue\supplier-catalogue.service.ts:106:   * retry and the membership INSERT that follows would both fail with
apps\api\src\catalogue\supplier-catalogue.service.ts:133:        // ⚠️ ZERO ROWS IS A POLICY REFUSAL, NOT A COLLISION, and retrying it
apps\workshop-web\app\auth\error\page.tsx:4: * /auth/error — where `pages.error` sends a failed sign-in.
apps\towing-web\app\auth\error\page.tsx:4: * /auth/error — where `pages.error` sends a failed sign-in.
apps\admin-web\app\auth\error\page.tsx:4: * /auth/error — where `pages.error` sends a failed sign-in.
.github\workflows\keep-warm.yml:7:# that wake, sign-in fails with `Configuration`, which reads to the visitor as
.github\workflows\keep-warm.yml:19:#     Keycloak warm 24/7   = ~730 h/month  = the ENTIRE allowance, alone
.github\workflows\keep-warm.yml:20:#     Keycloak warm 10h×22 = ~220 h/month  = leaves ~530 h for the other three
.github\workflows\keep-warm.yml:22:# A round-the-clock warmer does not merely risk the budget, it consumes all of
.github\workflows\keep-warm.yml:38:# kept nothing warm for weeks while reporting success on every run. You cannot
.github\workflows\keep-warm.yml:46:# behind the live warmer rather than killing it; `true` was tried on Solar and is
.github\workflows\keep-warm.yml:47:# worse, because it stops the running warmer before its replacement has a runner
.github\workflows\keep-warm.yml:50:# STAYING GREEN IS DELIBERATE. A warmer must never page anyone for a slow wake,
.github\workflows\keep-warm.yml:54:# it keeps warming until the window closes.
.github\workflows\keep-warm.yml:56:name: keep-warm
.github\workflows\keep-warm.yml:71:  group: keep-warm
.github\workflows\keep-warm.yml:75:  warm:
.github\workflows\keep-warm.yml:83:    # warmer is one nobody looks at. Caught by Codex, 2026-08-04.
.github\workflows\keep-warm.yml:93:          # A failed ping must never kill the loop. A warmer that dies on the
.github\workflows\keep-warm.yml:100:          # 16:40 warms for 80 minutes and stops, instead of running past the
.github\workflows\keep-warm.yml:112:          # which is how a warmer ends up proving nothing. Do not lower this
.github\workflows\keep-warm.yml:127:            echo "warmed ${MINS} min | ${ROUNDS} pings | ${FAILURES} failed"
.github\workflows\keep-warm.yml:130:              # run summary, but do NOT fail: a warmer that pages people teaches
.github\workflows\keep-warm.yml:132:              echo "::warning::keep-warm: every ping failed (${FAILURES}/${ROUNDS}). Keycloak may be down."
.github\workflows\keep-warm.yml:145:            # for a warmer — a 500 still proves the container answered, which is
.github\workflows\provision-database.yml:8:# `/api/auth/error?error=Configuration`: there is nothing to authenticate

codex
I’ve got enough to identify several concrete documentation/control-state defects. I’m doing one more pass over the migration and workflow files because some claims depend on whether 037 and the keep-warm changes are actually present, not just mentioned.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "''^|customer-decision|superseded|decidable|decide|proposal" apps/api/src/repair/proposal.controller.ts apps/api/src/repair/proposal.service.ts apps/api/src/repair/proposal.spec.ts' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "''^|register_workshop|bootstrap|current_setting|memberships|SELECT|WITH CHECK|set_config|SET LOCAL|RESET" infrastructure/migrations/037_registration_rls_bootstrap.sql infrastructure/migrations/verify/037_registration_rls_bootstrap.sql' in C:\Users\USER\Documents\autoworkshop-ai
2026-08-04T14:30:35.518936Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git branch --show-current; git rev-parse --short HEAD; git status --short'` rejected: blocked by policy
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "''^|window|cron|schedule|750|730|concurrency|minutes|curl" .github/workflows/keep-warm.yml' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git branch --show-current; git rev-parse --short HEAD; git status --short' in C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git branch --show-current; git rev-parse --short HEAD; git status --short'` rejected: blocked by policy
2026-08-04T14:30:36.253611Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 0.9 seconds
Total output lines: 2009
Output:
apps/api/src/repair/proposal.spec.ts:1:import { existsSync, readFileSync } from 'node:fs';
apps/api/src/repair/proposal.spec.ts:2:import { dirname, join, resolve } from 'node:path';
apps/api/src/repair/proposal.spec.ts:3:import { describe, expect, it, vi } from 'vitest';
apps/api/src/repair/proposal.spec.ts:4:import { ProposalService } from './proposal.service';
apps/api/src/repair/proposal.spec.ts:5:import {
apps/api/src/repair/proposal.spec.ts:6:  CAN_PREPARE_PROPOSAL,
apps/api/src/repair/proposal.spec.ts:7:  CAN_READ_PROPOSAL,
apps/api/src/repair/proposal.spec.ts:8:  CAN_RECORD_DECISION,
apps/api/src/repair/proposal.spec.ts:9:  DECISION_CHANNELS,
apps/api/src/repair/proposal.spec.ts:10:  PROPOSAL_DECISIONS,
apps/api/src/repair/proposal.spec.ts:11:  PROPOSAL_OPTIONS,
apps/api/src/repair/proposal.spec.ts:12:  PROPOSAL_STATUSES,
apps/api/src/repair/proposal.spec.ts:13:  decisionChannelLabel,
apps/api/src/repair/proposal.spec.ts:14:} from './proposal-rules';
apps/api/src/repair/proposal.spec.ts:15:import type { TenantContext } from '../tenancy/tenant-context';
apps/api/src/repair/proposal.spec.ts:16:
apps/api/src/repair/proposal.spec.ts:17:/**
apps/api/src/repair/proposal.spec.ts:18: * Customer proposals — Phase 5, slice 6.
apps/api/src/repair/proposal.spec.ts:19: *
apps/api/src/repair/proposal.spec.ts:20: * UNIT tests over a fake client, asserting what the database cannot: who may make an
apps/api/src/repair/proposal.spec.ts:21: * offer to a customer, that the attribution of a decision is mandatory, and that §424's
apps/api/src/repair/proposal.spec.ts:22: * immutability is enforced in the service as well as by trigger.
apps/api/src/repair/proposal.spec.ts:23: *
apps/api/src/repair/proposal.spec.ts:24: * ⚠️ §424 IS PROVEN TWICE, DELIBERATELY. Here, so a caller gets a sentence naming the
apps/api/src/repair/proposal.spec.ts:25: * rule; and by trigger in migration 017, proven by `verify/017_repair_proposals.sql` and
apps/api/src/repair/proposal.spec.ts:26: * end-to-end by `probe-proposal.mjs`. A fake client cannot enforce a constraint, so a
apps/api/src/repair/proposal.spec.ts:27: * green result here says nothing about the database — and the reverse is equally true.
apps/api/src/repair/proposal.spec.ts:28: */
apps/api/src/repair/proposal.spec.ts:29:
apps/api/src/repair/proposal.spec.ts:30:const CARD_ID = '11111111-2222-3333-4444-555555555555';
apps/api/src/repair/proposal.spec.ts:31:const PROPOSAL_ID = 'cccccccc-dddd-eeee-ffff-000000000000';
apps/api/src/repair/proposal.spec.ts:32:const QUOTE_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
apps/api/src/repair/proposal.spec.ts:33:const PLAN_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
apps/api/src/repair/proposal.spec.ts:34:
apps/api/src/repair/proposal.spec.ts:35:const ctx = (over: Partial<TenantContext> = {}): TenantContext => ({
apps/api/src/repair/proposal.spec.ts:36:  tenantId: 'tenant-a',
apps/api/src/repair/proposal.spec.ts:37:  organizationId: 'org-1',
apps/api/src/repair/proposal.spec.ts:38:  branchId: null,
apps/api/src/repair/proposal.spec.ts:39:  userId: 'user-1',
apps/api/src/repair/proposal.spec.ts:40:  activeRole: 'reception_staff',
apps/api/src/repair/proposal.spec.ts:41:  correlationId: 'corr-1',
apps/api/src/repair/proposal.spec.ts:42:  ...over,
apps/api/src/repair/proposal.spec.ts:43:});
apps/api/src/repair/proposal.spec.ts:44:
apps/api/src/repair/proposal.spec.ts:45:const cardRow = (over: Record<string, unknown> = {}) => ({
apps/api/src/repair/proposal.spec.ts:46:  id: CARD_ID,
apps/api/src/repair/proposal.spec.ts:47:  job_number: 'JC-000003',
apps/api/src/repair/proposal.spec.ts:48:  stage: 'quotation_preparation',
apps/api/src/repair/proposal.spec.ts:49:  ...over,
apps/api/src/repair/proposal.spec.ts:50:});
apps/api/src/repair/proposal.spec.ts:51:
apps/api/src/repair/proposal.spec.ts:52:const headerRow = (over: Record<string, unknown> = {}) => ({
apps/api/src/repair/proposal.spec.ts:53:  id: PROPOSAL_ID,
apps/api/src/repair/proposal.spec.ts:54:  job_card_id: CARD_ID,
apps/api/src/repair/proposal.spec.ts:55:  job_number: 'JC-000003',
apps/api/src/repair/proposal.spec.ts:56:  complaint: 'Rough idle',
apps/api/src/repair/proposal.spec.ts:57:  registration_number: 'GR 4821-22',
apps/api/src/repair/proposal.spec.ts:58:  customer_name: 'Kwame Mensah',
apps/api/src/repair/proposal.spec.ts:59:  customer_email: 'kwame@example.com',
apps/api/src/repair/proposal.spec.ts:60:  customer_phone: '+233 24 000 0000',
apps/api/src/repair/proposal.spec.ts:61:  customer_location: 'Accra',
apps/api/src/repair/proposal.spec.ts:62:  org_name: 'Alpha Motors',
apps/api/src/repair/proposal.spec.ts:63:  legal_name: 'Alpha Motors Limited',
apps/api/src/repair/proposal.spec.ts:64:  trading_name: 'Alpha Motors',
apps/api/src/repair/proposal.spec.ts:65:  org_address: 'Plot 14, Spintex Road',
apps/api/src/repair/proposal.spec.ts:66:  org_city: 'Accra',
apps/api/src/repair/proposal.spec.ts:67:  org_country: 'Ghana',
apps/api/src/repair/proposal.spec.ts:68:  org_phone: '+233 30 123 4567',
apps/api/src/repair/proposal.spec.ts:69:  org_email: 'service@alpha.example',
apps/api/src/repair/proposal.spec.ts:70:  org_website: null,
apps/api/src/repair/proposal.spec.ts:71:  tax_identification_number: 'C0012345678',
apps/api/src/repair/proposal.spec.ts:72:  vat_registration_number: 'VAT-GH-004521',
apps/api/src/repair/proposal.spec.ts:73:  document_footer: 'Payment due on collection.',
apps/api/src/repair/proposal.spec.ts:74:  make_name: 'Toyota',
apps/api/src/repair/proposal.spec.ts:75:  model_name: 'Corolla',
apps/api/src/repair/proposal.spec.ts:76:  model_year: 2018,
apps/api/src/repair/proposal.spec.ts:77:  quotation_id: QUOTE_ID,
apps/api/src/repair/proposal.spec.ts:78:  quotation_attempt_no: 1,
apps/api/src/repair/proposal.spec.ts:79:  currency: 'GHS',
apps/api/src/repair/proposal.spec.ts:80:  warranty_terms: '12 months',
apps/api/src/repair/proposal.spec.ts:81:  completion_conditions: null,
apps/api/src/repair/proposal.spec.ts:82:  valid_until: null,
apps/api/src/repair/proposal.spec.ts:83:  repair_plan_id: PLAN_ID,
apps/api/src/repair/proposal.spec.ts:84:  version_no: 1,
apps/api/src/repair/proposal.spec.ts:85:  status: 'draft',
apps/api/src/repair/proposal.spec.ts:86:  expected_result: null,
apps/api/src/repair/proposal.spec.ts:87:  risk_and_limitations: null,
apps/api/src/repair/proposal.spec.ts:88:  uncertainties: null,
apps/api/src/repair/proposal.spec.ts:89:  presentation_note: null,
apps/api/src/repair/proposal.spec.ts:90:  issued_at: null,
apps/api/src/repair/proposal.spec.ts:91:  decision: null,
apps/api/src/repair/proposal.spec.ts:92:  approved_option: null,
apps/api/src/repair/proposal.spec.ts:93:  decided_at: null,
apps/api/src/repair/proposal.spec.ts:94:  decided_by_name: null,
apps/api/src/repair/proposal.spec.ts:95:  decision_channel: null,
apps/api/src/repair/proposal.spec.ts:96:  decision_note: null,
apps/api/src/repair/proposal.spec.ts:97:  superseded_by: null,
apps/api/src/repair/proposal.spec.ts:98:  issued_by_name: null,
apps/api/src/repair/proposal.spec.ts:99:  recorded_by_name: null,
apps/api/src/repair/proposal.spec.ts:100:  // ⚠️ STRINGS — `pg` returns `numeric` as text. Number fixtures would make the
apps/api/src/repair/proposal.spec.ts:101:  // conversion assertions vacuous.
apps/api/src/repair/proposal.spec.ts:102:  chargeable_total: '1000.00',
apps/api/src/repair/proposal.spec.ts:103:  optional_total: '500.00',
apps/api/src/repair/proposal.spec.ts:104:  discount_amount: '0.00',
apps/api/src/repair/proposal.spec.ts:105:  tax_rate_percent: '0.000',
apps/api/src/repair/proposal.spec.ts:106:  plan_hours: '3.50',
apps/api/src/repair/proposal.spec.ts:107:  inspection_summary: 'All checkpoints completed',
apps/api/src/repair/proposal.spec.ts:108:  inspection_checked: 19,
apps/api/src/repair/proposal.spec.ts:109:  ...over,
apps/api/src/repair/proposal.spec.ts:110:});
apps/api/src/repair/proposal.spec.ts:111:
apps/api/src/repair/proposal.spec.ts:112:const Q = {
apps/api/src/repair/proposal.spec.ts:113:  card: /FROM repair\.job_cards j\s+JOIN core\.customers/,
apps/api/src/repair/proposal.spec.ts:114:  decisionLookup: /p\.version_no, j\.job_number/,
apps/api/src/repair/proposal.spec.ts:115:  draft: /FOR UPDATE OF p/,
apps/api/src/repair/proposal.spec.ts:116:  header: /LEFT JOIN identity\.users rb/,
apps/api/src/repair/proposal.spec.ts:117:  faults: /JOIN repair\.diagnostic_findings f/,
apps/api/src/repair/proposal.spec.ts:118:  tasks: /FROM repair\.repair_plan_tasks/,
apps/api/src/repair/proposal.spec.ts:119:  parts: /FROM repair\.quotation_lines/,
apps/api/src/repair/proposal.spec.ts:120:  openCheck: /status IN \('draft', 'issued'\)/,
apps/api/src/repair/proposal.spec.ts:121:  latest: /ORDER BY version_no DESC LIMIT 1/,
apps/api/src/repair/proposal.spec.ts:122:  approvedQuote: /FROM repair\.quotations\s+WHERE job_card_id/,
apps/api/src/repair/proposal.spec.ts:123:  insert: /INSERT INTO repair\.repair_proposals/,
apps/api/src/repair/proposal.spec.ts:124:  update: /UPDATE repair\.repair_proposals/,
apps/api/src/repair/proposal.spec.ts:125:} as const;
apps/api/src/repair/proposal.spec.ts:126:
apps/api/src/repair/proposal.spec.ts:127:function fakeDb(handlers: Array<[RegExp, unknown[]]>) {
apps/api/src/repair/proposal.spec.ts:128:  const queries: Array<{ text: string; values?: unknown[] }> = [];
apps/api/src/repair/proposal.spec.ts:129:  const client = {
apps/api/src/repair/proposal.spec.ts:130:    query: vi.fn(async (text: string, values?: unknown[]) => {
apps/api/src/repair/proposal.spec.ts:131:      queries.push({ text, values });
apps/api/src/repair/proposal.spec.ts:132:      const hit = handlers.find(([re]) => re.test(text));
apps/api/src/repair/proposal.spec.ts:133:      const rows = hit ? hit[1] : [];
apps/api/src/repair/proposal.spec.ts:134:      return { rows, rowCount: rows.length };
apps/api/src/repair/proposal.spec.ts:135:    }),
apps/api/src/repair/proposal.spec.ts:136:  };
apps/api/src/repair/proposal.spec.ts:137:  return {
apps/api/src/repair/proposal.spec.ts:138:    queries,
apps/api/src/repair/proposal.spec.ts:139:    db: {
apps/api/src/repair/proposal.spec.ts:140:      withTenant: vi.fn(async (_c: TenantContext, work: (c: unknown) => Promise<unknown>) =>
apps/api/src/repair/proposal.spec.ts:141:        work(client),
apps/api/src/repair/proposal.spec.ts:142:      ),
apps/api/src/repair/proposal.spec.ts:143:    } as never,
apps/api/src/repair/proposal.spec.ts:144:  };
apps/api/src/repair/proposal.spec.ts:145:}
apps/api/src/repair/proposal.spec.ts:146:
apps/api/src/repair/proposal.spec.ts:147:const fakeAudit = () => ({ write: vi.fn(async () => undefined) }) as never;
apps/api/src/repair/proposal.spec.ts:148:const spyAudit = () => ({
apps/api/src/repair/proposal.spec.ts:149:  write: vi.fn(
apps/api/src/repair/proposal.spec.ts:150:    async (
apps/api/src/repair/proposal.spec.ts:151:      _client: unknown,
apps/api/src/repair/proposal.spec.ts:152:      _ctx: TenantContext,
apps/api/src/repair/proposal.spec.ts:153:      _event: { action: string; detail?: Record<string, unknown> },
apps/api/src/repair/proposal.spec.ts:154:    ) => undefined,
apps/api/src/repair/proposal.spec.ts:155:  ),
apps/api/src/repair/proposal.spec.ts:156:});
apps/api/src/repair/proposal.spec.ts:157:
apps/api/src/repair/proposal.spec.ts:158:const readHandlers = (over: { header?: unknown[] } = {}): Array<[RegExp, unknown[]]> => [
apps/api/src/repair/proposal.spec.ts:159:  [Q.header, over.header ?? [headerRow()]],
apps/api/src/repair/proposal.spec.ts:160:  [Q.faults, []],
apps/api/src/repair/proposal.spec.ts:161:  [Q.tasks, []],
apps/api/src/repair/proposal.spec.ts:162:  [Q.parts, []],
apps/api/src/repair/proposal.spec.ts:163:];
apps/api/src/repair/proposal.spec.ts:164:
apps/api/src/repair/proposal.spec.ts:165:function only<T>(rows: T[]): T {
apps/api/src/repair/proposal.spec.ts:166:  const first = rows[0];
apps/api/src/repair/proposal.spec.ts:167:  if (!first) throw new Error(`expected one row, received ${rows.length}`);
apps/api/src/repair/proposal.spec.ts:168:  return first;
apps/api/src/repair/proposal.spec.ts:169:}
apps/api/src/repair/proposal.spec.ts:170:
apps/api/src/repair/proposal.spec.ts:171:// ── who may make an offer ──────────────────────────────────────────────────
apps/api/src/repair/proposal.spec.ts:172:
apps/api/src/repair/proposal.spec.ts:173:describe('proposal roles — a commercial offer, not a technical one', () => {
apps/api/src/repair/proposal.spec.ts:174:  it('refuses a technician and a supervisor', async () => {
apps/api/src/repair/proposal.spec.ts:175:    const service = () => new ProposalService(fakeDb([]).db, fakeAudit());
apps/api/src/repair/proposal.spec.ts:176:    await expect(service().prepare(ctx({ activeRole: 'technician' }), CARD_ID)).rejects.toThrow(
apps/api/src/repair/proposal.spec.ts:177:      /may not prepare a customer proposal/,
apps/api/src/repair/proposal.spec.ts:178:    );
apps/api/src/repair/proposal.spec.ts:179:    // ⚠️ THE ASYMMETRY WITH SLICE 4, ASSERTED. A supervisor approves the repair PLAN;
apps/api/src/repair/proposal.spec.ts:180:    // §50's authority is technical review and stops at the customer's door.
apps/api/src/repair/proposal.spec.ts:181:    await expect(
apps/api/src/repair/proposal.spec.ts:182:      service().prepare(ctx({ activeRole: 'workshop_supervisor' }), CARD_ID),
apps/api/src/repair/proposal.spec.ts:183:    ).rejects.toThrow(/may not prepare a customer proposal/);
apps/api/src/repair/proposal.spec.ts:184:    expect(CAN_PREPARE_PROPOSAL.has('workshop_supervisor')).toBe(false);
apps/api/src/repair/proposal.spec.ts:185:    expect(CAN_PREPARE_PROPOSAL.has('reception_staff')).toBe(true);
apps/api/src/repair/proposal.spec.ts:186:  });
apps/api/src/repair/proposal.spec.ts:187:
apps/api/src/repair/proposal.spec.ts:188:  it('lets a technician READ one — §32 has them confirm the approval before starting', async () => {
apps/api/src/repair/proposal.spec.ts:189:    expect(CAN_READ_PROPOSAL.has('technician')).toBe(true);
apps/api/src/repair/proposal.spec.ts:190:    const { db, queries } = fakeDb(readHandlers());
apps/api/src/repair/proposal.spec.ts:191:    await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'technician', userId: 't9' }));
apps/api/src/repair/proposal.spec.ts:192:    // ...but only for a card assigned to them.
apps/api/src/repair/proposal.spec.ts:193:    expect(queries.find((q) => Q.header.test(q.text))?.values?.[4]).toBe('t9');
apps/api/src/repair/proposal.spec.ts:194:  });
apps/api/src/repair/proposal.spec.ts:195:
apps/api/src/repair/proposal.spec.ts:196:  it('does NOT apply an independence rule between issuer and recorder, by design', () => {
apps/api/src/repair/proposal.spec.ts:197:    // Everywhere else in Phase 5 both parties are staff, so independence must be
apps/api/src/repair/proposal.spec.ts:198:    // enforced. Here the deciding party is the CUSTOMER — outside the system — so a
apps/api/src/repair/proposal.spec.ts:199:    // check between the issuer and the scribe would be theatre and would block the
apps/api/src/repair/proposal.spec.ts:200:    // commonest real case: reception issues a proposal and the customer answers them
apps/api/src/repair/proposal.spec.ts:201:    // on the spot. What protects the record instead is mandatory attribution.
apps/api/src/repair/proposal.spec.ts:202:    expect(CAN_RECORD_DECISION).toBe(CAN_PREPARE_PROPOSAL);
apps/api/src/repair/proposal.spec.ts:203:  });
apps/api/src/repair/proposal.spec.ts:204:});
apps/api/src/repair/proposal.spec.ts:205:
apps/api/src/repair/proposal.spec.ts:206:// ── preparing and versioning ───────────────────────────────────────────────
apps/api/src/repair/proposal.spec.ts:207:
apps/api/src/repair/proposal.spec.ts:208:describe('prepare — §424 versioning', () => {
apps/api/src/repair/proposal.spec.ts:209:  it('refuses a card at the wrong stage', async () => {
apps/api/src/repair/proposal.spec.ts:210:    const { db } = fakeDb([[Q.card, [cardRow({ stage: 'repair_in_progress' })]]]);
apps/api/src/repair/proposal.spec.ts:211:    await expect(new ProposalService(db, fakeAudit()).prepare(ctx(), CARD_ID)).rejects.toThrow(
apps/api/src/repair/proposal.spec.ts:212:      /may only be prepared while the job card is at/,
apps/api/src/repair/proposal.spec.ts:213:    );
apps/api/src/repair/proposal.spec.ts:214:  });
apps/api/src/repair/proposal.spec.ts:215:
apps/api/src/repair/proposal.spec.ts:216:  it('refuses when there is no APPROVED quotation, naming a reachable route', async () => {
apps/api/src/repair/proposal.spec.ts:217:    const { db } = fakeDb([
apps/api/src/repair/proposal.spec.ts:218:      [Q.card, [cardRow()]],
apps/api/src/repair/proposal.spec.ts:219:      [Q.openCheck, []],
apps/api/src/repair/proposal.spec.ts:220:      [Q.latest, []],
apps/api/src/repair/proposal.spec.ts:221:      [Q.approvedQuote, []],
apps/api/src/repair/proposal.spec.ts:222:    ]);
apps/api/src/repair/proposal.spec.ts:223:    await expect(new ProposalService(db, fakeAudit()).prepare(ctx(), CARD_ID)).rejects.toThrow(
apps/api/src/repair/proposal.spec.ts:224:      /APPROVED quotation.*Quotations screen/s,
apps/api/src/repair/proposal.spec.ts:225:    );
apps/api/src/repair/proposal.spec.ts:226:  });
apps/api/src/repair/proposal.spec.ts:227:
apps/api/src/repair/proposal.spec.ts:228:  it('refuses a second version while one is with the customer', async () => {
apps/api/src/repair/proposal.spec.ts:229:    const { db } = fakeDb([
apps/api/src/repair/proposal.spec.ts:230:      [Q.card, [cardRow()]],
apps/api/src/repair/proposal.spec.ts:231:      [Q.openCheck, [{ id: PROPOSAL_ID, status: 'issued', version_no: 1 }]],
apps/api/src/repair/proposal.spec.ts:232:    ]);
apps/api/src/repair/proposal.spec.ts:233:    await expect(new ProposalService(db, fakeAudit()).prepare(ctx(), CARD_ID)).rejects.toThrow(
apps/api/src/repair/proposal.spec.ts:234:      /has not been answered/,
apps/api/src/repair/proposal.spec.ts:235:    );
apps/api/src/repair/proposal.spec.ts:236:  });
apps/api/src/repair/proposal.spec.ts:237:
apps/api/src/repair/proposal.spec.ts:238:  it('⚠️ refuses to supersede an APPROVED proposal without a fresh quotation', async () => {
apps/api/src/repair/proposal.spec.ts:239:    const { db } = fakeDb([
apps/api/src/repair/proposal.spec.ts:240:      [Q.card, [cardRow()]],
apps/api/src/repair/proposal.spec.ts:241:      [Q.openCheck, []],
apps/api/src/repair/proposal.spec.ts:242:      [Q.latest, [{ id: PROPOSAL_ID, version_no: 2, status: 'approved' }]],
apps/api/src/repair/proposal.spec.ts:243:    ]);
apps/api/src/repair/proposal.spec.ts:244:    // Replacing an agreement the customer has already given is a commercial act, not a
apps/api/src/repair/proposal.spec.ts:245:    // side effect of pressing a button on a job that is already authorised. §7: work
apps/api/src/repair/proposal.spec.ts:246:    // shall not start until the required approval is received — and it already has been.
apps/api/src/repair/proposal.spec.ts:247:    await expect(new ProposalService(db, fakeAudit()).prepare(ctx(), CARD_ID)).rejects.toThrow(
apps/api/src/repair/proposal.spec.ts:248:      /APPROVED by the customer/,
apps/api/src/repair/proposal.spec.ts:249:    );
apps/api/src/repair/proposal.spec.ts:250:  });
apps/api/src/repair/proposal.spec.ts:251:
apps/api/src/repair/proposal.spec.ts:252:  it('creates version n+1 and marks the one it replaces superseded', async () => {
apps/api/src/repair/proposal.spec.ts:253:    const { db, queries } = fakeDb([
apps/api/src/repair/proposal.spec.ts:254:      [Q.card, [cardRow()]],
apps/…33718 tokens truncated…pi/src/repair/proposal.service.ts:984:            : row.approved_option === 'recommended'
apps/api/src/repair/proposal.service.ts:985:              ? recommendedTotal
apps/api/src/repair/proposal.service.ts:986:              : null,
apps/api/src/repair/proposal.service.ts:987:        editable: status === 'draft' && CAN_PREPARE_PROPOSAL.has(ctx.activeRole),
apps/api/src/repair/proposal.service.ts:988:        issuable: status === 'draft' && CAN_PREPARE_PROPOSAL.has(ctx.activeRole),
apps/api/src/repair/proposal.service.ts:989:        /**
apps/api/src/repair/proposal.service.ts:990:         * 🔴 BOTH ROLE SETS, AND THE SECOND ONE WAS MISSED.
apps/api/src/repair/proposal.service.ts:991:         *
apps/api/src/repair/proposal.service.ts:992:         * `CAN_RECORD_DECISION` is the STAFF set. When `customer` was added to
apps/api/src/repair/proposal.service.ts:993:         * `CAN_READ_PROPOSAL` (2026-08-04) this line was not revisited, so
apps/api/src/repair/proposal.service.ts:994:         * `decidable` evaluated FALSE for every customer — and the customer
apps/api/src/repair/proposal.service.ts:995:         * screen shows its approval form only on `decidable`. The whole
apps/api/src/repair/proposal.service.ts:996:         * self-service approval therefore rendered nothing at all, while the
apps/api/src/repair/proposal.service.ts:997:         * service behind it worked and its ten tests passed.
apps/api/src/repair/proposal.service.ts:998:         *
apps/api/src/repair/proposal.service.ts:999:         * Nothing threw. No error appeared. The customer simply saw the old
apps/api/src/repair/proposal.service.ts:1000:         * "contact the workshop" fallback, which is exactly what the feature was
apps/api/src/repair/proposal.service.ts:1001:         * built to replace — a flag reading correct while the mechanism it gates
apps/api/src/repair/proposal.service.ts:1002:         * is inert. Found by the security review reading this line, not by any
apps/api/src/repair/proposal.service.ts:1003:         * test, because every test exercised the SERVICE and none asked what the
apps/api/src/repair/proposal.service.ts:1004:         * viewer was told they could do.
apps/api/src/repair/proposal.service.ts:1005:         *
apps/api/src/repair/proposal.service.ts:1006:         * ⚠️ THIS IS A UI AFFORDANCE, NEVER A CONTROL. Both routes re-derive the
apps/api/src/repair/proposal.service.ts:1007:         * whole judgement server-side — `assertMayRecordDecision` for staff,
apps/api/src/repair/proposal.service.ts:1008:         * `CAN_DECIDE_AS_CUSTOMER` plus the `c.user_id` predicate for the
apps/api/src/repair/proposal.service.ts:1009:         * customer. Widening this flag grants nobody anything (CLAUDE.md §8).
apps/api/src/repair/proposal.service.ts:1010:         */
apps/api/src/repair/proposal.service.ts:1011:        decidable:
apps/api/src/repair/proposal.service.ts:1012:          status === 'issued' &&
apps/api/src/repair/proposal.service.ts:1013:          // A SUPERSEDED version is never answerable, even if its status still
apps/api/src/repair/proposal.service.ts:1014:          // reads `issued`. The real flow cannot produce that pair — prepare()
apps/api/src/repair/proposal.service.ts:1015:          // refuses a new version while one is with the customer — but the flag
apps/api/src/repair/proposal.service.ts:1016:          // costs nothing and offering somebody a decision on a document the
apps/api/src/repair/proposal.service.ts:1017:          // workshop has since replaced is the worst kind of control to get
apps/api/src/repair/proposal.service.ts:1018:          // wrong. Found while a fixture manufactured exactly that state.
apps/api/src/repair/proposal.service.ts:1019:          row.superseded_by === null &&
apps/api/src/repair/proposal.service.ts:1020:          (CAN_RECORD_DECISION.has(ctx.activeRole) || CAN_DECIDE_AS_CUSTOMER.has(ctx.activeRole)),
apps/api/src/repair/proposal.service.ts:1021:      };
apps/api/src/repair/proposal.service.ts:1022:    });
apps/api/src/repair/proposal.service.ts:1023:  }
apps/api/src/repair/proposal.service.ts:1024:
apps/api/src/repair/proposal.service.ts:1025:  private async assertCardVisible(
apps/api/src/repair/proposal.service.ts:1026:    client: Client,
apps/api/src/repair/proposal.service.ts:1027:    ctx: TenantContext,
apps/api/src/repair/proposal.service.ts:1028:    cardId: string,
apps/api/src/repair/proposal.service.ts:1029:    opts: { lock?: boolean } = {},
apps/api/src/repair/proposal.service.ts:1030:  ): Promise<CardRow> {
apps/api/src/repair/proposal.service.ts:1031:    const found = await client.query(
apps/api/src/repair/proposal.service.ts:1032:      `SELECT j.id, j.job_number, j.stage
apps/api/src/repair/proposal.service.ts:1033:         FROM repair.job_cards j
apps/api/src/repair/proposal.service.ts:1034:         JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
apps/api/src/repair/proposal.service.ts:1035:        WHERE j.id = $1 AND j.tenant_id = $2 AND j.organization_id = $3
apps/api/src/repair/proposal.service.ts:1036:          AND ($4::uuid IS NULL OR j.assigned_technician_id = $4::uuid)
apps/api/src/repair/proposal.service.ts:1037:          AND ($5::uuid IS NULL OR c.user_id = $5::uuid)
apps/api/src/repair/proposal.service.ts:1038:        ${opts.lock ? 'FOR UPDATE OF j' : ''}`,
apps/api/src/repair/proposal.service.ts:1039:      [
apps/api/src/repair/proposal.service.ts:1040:        cardId, ctx.tenantId, ctx.organizationId,
apps/api/src/repair/proposal.service.ts:1041:        ctx.activeRole === 'technician' ? ctx.userId : null,
apps/api/src/repair/proposal.service.ts:1042:        ctx.activeRole === 'customer' ? ctx.userId : null,
apps/api/src/repair/proposal.service.ts:1043:      ],
apps/api/src/repair/proposal.service.ts:1044:    );
apps/api/src/repair/proposal.service.ts:1045:    const card = found.rows[0] as CardRow | undefined;
apps/api/src/repair/proposal.service.ts:1046:    if (!card) throw new NotFoundException('job card not found');
apps/api/src/repair/proposal.service.ts:1047:    return card;
apps/api/src/repair/proposal.service.ts:1048:  }
apps/api/src/repair/proposal.service.ts:1049:
apps/api/src/repair/proposal.service.ts:1050:  /**
apps/api/src/repair/proposal.service.ts:1051:   * The proposal exists, this viewer may reach it, and it is still a DRAFT.
apps/api/src/repair/proposal.service.ts:1052:   *
apps/api/src/repair/proposal.service.ts:1053:   * The message names §424 by name, because "cannot be changed" without the reason
apps/api/src/repair/proposal.service.ts:1054:   * reads as a bug to somebody who has not read the specification.
apps/api/src/repair/proposal.service.ts:1055:   */
apps/api/src/repair/proposal.service.ts:1056:  private async assertDraft(
apps/api/src/repair/proposal.service.ts:1057:    client: Client,
apps/api/src/repair/proposal.service.ts:1058:    ctx: TenantContext,
apps/api/src/repair/proposal.service.ts:1059:    proposalId: string,
apps/api/src/repair/proposal.service.ts:1060:  ): Promise<{ job_number: string; version_no: number }> {
apps/api/src/repair/proposal.service.ts:1061:    const found = await client.query(
apps/api/src/repair/proposal.service.ts:1062:      `SELECT p.id, p.status, p.version_no, j.job_number
apps/api/src/repair/proposal.service.ts:1063:         FROM repair.repair_proposals p
apps/api/src/repair/proposal.service.ts:1064:         JOIN repair.job_cards j ON j.id = p.job_card_id AND j.tenant_id = p.tenant_id
apps/api/src/repair/proposal.service.ts:1065:        WHERE p.id = $1 AND p.tenant_id = $2 AND p.organization_id = $3
apps/api/src/repair/proposal.service.ts:1066:        FOR UPDATE OF p`,
apps/api/src/repair/proposal.service.ts:1067:      [proposalId, ctx.tenantId, ctx.organizationId],
apps/api/src/repair/proposal.service.ts:1068:    );
apps/api/src/repair/proposal.service.ts:1069:    const row = found.rows[0] as
apps/api/src/repair/proposal.service.ts:1070:      | { id: string; status: ProposalStatus; version_no: number; job_number: string }
apps/api/src/repair/proposal.service.ts:1071:      | undefined;
apps/api/src/repair/proposal.service.ts:1072:    if (!row) throw new NotFoundException('proposal not found');
apps/api/src/repair/proposal.service.ts:1073:    if (row.status !== 'draft') {
apps/api/src/repair/proposal.service.ts:1074:      throw new ConflictException(
apps/api/src/repair/proposal.service.ts:1075:        row.status === 'issued'
apps/api/src/repair/proposal.service.ts:1076:          ? `version ${row.version_no} is with the customer and its content is frozen; ` +
apps/api/src/repair/proposal.service.ts:1077:            'record their decision, then prepare a new version'
apps/api/src/repair/proposal.service.ts:1078:          : `version ${row.version_no} is ${row.status}. §424: an approved proposal is ` +
apps/api/src/repair/proposal.service.ts:1079:            'immutable and a material change requires a NEW VERSION — prepare one instead',
apps/api/src/repair/proposal.service.ts:1080:      );
apps/api/src/repair/proposal.service.ts:1081:    }
apps/api/src/repair/proposal.service.ts:1082:    return { job_number: row.job_number, version_no: row.version_no };
apps/api/src/repair/proposal.service.ts:1083:  }
apps/api/src/repair/proposal.service.ts:1084:
apps/api/src/repair/proposal.service.ts:1085:  /**
apps/api/src/repair/proposal.service.ts:1086:   * Absent leaves it, null/'' clears it, a string sets it.
apps/api/src/repair/proposal.service.ts:1087:   *
apps/api/src/repair/proposal.service.ts:1088:   * ⚠️ A NON-STRING IS A 400, NOT A SILENT CLEAR — the data-loss regression the
apps/api/src/repair/proposal.service.ts:1089:   * Supervisor caught on slice 3b's clear-semantics commit, avoided here by default.
apps/api/src/repair/proposal.service.ts:1090:   */
apps/api/src/repair/proposal.service.ts:1091:  private nullableText(
apps/api/src/repair/proposal.service.ts:1092:    set: (column: string, value: unknown) => void,
apps/api/src/repair/proposal.service.ts:1093:    column: string,
apps/api/src/repair/proposal.service.ts:1094:    raw: unknown,
apps/api/src/repair/proposal.service.ts:1095:    field: string,
apps/api/src/repair/proposal.service.ts:1096:    max: number,
apps/api/src/repair/proposal.service.ts:1097:  ): void {
apps/api/src/repair/proposal.service.ts:1098:    if (raw === undefined) return;
apps/api/src/repair/proposal.service.ts:1099:    if (raw === null || raw === '') {
apps/api/src/repair/proposal.service.ts:1100:      set(column, null);
apps/api/src/repair/proposal.service.ts:1101:      return;
apps/api/src/repair/proposal.service.ts:1102:    }
apps/api/src/repair/proposal.service.ts:1103:    if (typeof raw !== 'string') {
apps/api/src/repair/proposal.service.ts:1104:      throw new BadRequestException(`${field} must be a string, or null to clear it`);
apps/api/src/repair/proposal.service.ts:1105:    }
apps/api/src/repair/proposal.service.ts:1106:    set(column, optionalText(raw, field, max));
apps/api/src/repair/proposal.service.ts:1107:  }
apps/api/src/repair/proposal.service.ts:1108:
apps/api/src/repair/proposal.service.ts:1109:  private static one(rows: RepairProposal[]): RepairProposal {
apps/api/src/repair/proposal.service.ts:1110:    const first = rows[0];
apps/api/src/repair/proposal.service.ts:1111:    if (!first) throw new NotFoundException('proposal not found');
apps/api/src/repair/proposal.service.ts:1112:    return first;
apps/api/src/repair/proposal.service.ts:1113:  }
apps/api/src/repair/proposal.service.ts:1114:
apps/api/src/repair/proposal.service.ts:1115:  private assertMayRead(ctx: TenantContext): void {
apps/api/src/repair/proposal.service.ts:1116:    if (!CAN_READ_PROPOSAL.has(ctx.activeRole)) {
apps/api/src/repair/proposal.service.ts:1117:      throw new ForbiddenException(`role '${ctx.activeRole}' may not read proposals`);
apps/api/src/repair/proposal.service.ts:1118:    }
apps/api/src/repair/proposal.service.ts:1119:  }
apps/api/src/repair/proposal.service.ts:1120:
apps/api/src/repair/proposal.service.ts:1121:  private assertMayPrepare(ctx: TenantContext): void {
apps/api/src/repair/proposal.service.ts:1122:    if (!CAN_PREPARE_PROPOSAL.has(ctx.activeRole)) {
apps/api/src/repair/proposal.service.ts:1123:      throw new ForbiddenException(`role '${ctx.activeRole}' may not prepare a customer proposal`);
apps/api/src/repair/proposal.service.ts:1124:    }
apps/api/src/repair/proposal.service.ts:1125:  }
apps/api/src/repair/proposal.service.ts:1126:
apps/api/src/repair/proposal.service.ts:1127:  private assertMayRecordDecision(ctx: TenantContext): void {
apps/api/src/repair/proposal.service.ts:1128:    if (!CAN_RECORD_DECISION.has(ctx.activeRole)) {
apps/api/src/repair/proposal.service.ts:1129:      throw new ForbiddenException(
apps/api/src/repair/proposal.service.ts:1130:        `role '${ctx.activeRole}' may not record a customer decision`,
apps/api/src/repair/proposal.service.ts:1131:      );
apps/api/src/repair/proposal.service.ts:1132:    }
apps/api/src/repair/proposal.service.ts:1133:  }
apps/api/src/repair/proposal.service.ts:1134:}
apps/api/src/repair/proposal.service.ts:1135:
apps/api/src/repair/proposal.service.ts:1136:function round2(value: number): number {
apps/api/src/repair/proposal.service.ts:1137:  return Math.round(value * 100) / 100;
apps/api/src/repair/proposal.service.ts:1138:}
apps/api/src/repair/proposal.service.ts:1139:
apps/api/src/repair/proposal.service.ts:1140:interface Client {
apps/api/src/repair/proposal.service.ts:1141:  query: (
apps/api/src/repair/proposal.service.ts:1142:    text: string,
apps/api/src/repair/proposal.service.ts:1143:    values: unknown[],
apps/api/src/repair/proposal.service.ts:1144:  ) => Promise<{ rows: unknown[]; rowCount: number | null }>;
apps/api/src/repair/proposal.service.ts:1145:}
apps/api/src/repair/proposal.service.ts:1146:
apps/api/src/repair/proposal.service.ts:1147:interface CardRow {
apps/api/src/repair/proposal.service.ts:1148:  id: string;
apps/api/src/repair/proposal.service.ts:1149:  job_number: string;
apps/api/src/repair/proposal.service.ts:1150:  stage: string;
apps/api/src/repair/proposal.service.ts:1151:}
apps/api/src/repair/proposal.service.ts:1152:
apps/api/src/repair/proposal.service.ts:1153:interface FaultRow {
apps/api/src/repair/proposal.service.ts:1154:  id: string;
apps/api/src/repair/proposal.service.ts:1155:  fault_description: string;
apps/api/src/repair/proposal.service.ts:1156:  fault_code: string | null;
apps/api/src/repair/proposal.service.ts:1157:  finding_status: string;
apps/api/src/repair/proposal.service.ts:1158:}
apps/api/src/repair/proposal.service.ts:1159:
apps/api/src/repair/proposal.service.ts:1160:interface TaskRow {
apps/api/src/repair/proposal.service.ts:1161:  id: string;
apps/api/src/repair/proposal.service.ts:1162:  title: string;
apps/api/src/repair/proposal.service.ts:1163:  estimated_labour_hours: string | null;
apps/api/src/repair/proposal.service.ts:1164:}
apps/api/src/repair/proposal.service.ts:1165:
apps/api/src/repair/proposal.service.ts:1166:interface PartRow {
apps/api/src/repair/proposal.service.ts:1167:  quotation_id: string;
apps/api/src/repair/proposal.service.ts:1168:  id: string;
apps/api/src/repair/proposal.service.ts:1169:  description: string;
apps/api/src/repair/proposal.service.ts:1170:  quantity: string;
apps/api/src/repair/proposal.service.ts:1171:  unit_price: string;
apps/api/src/repair/proposal.service.ts:1172:}
apps/api/src/repair/proposal.service.ts:1173:
apps/api/src/repair/proposal.service.ts:1174:interface HeaderRow {
apps/api/src/repair/proposal.service.ts:1175:  id: string;
apps/api/src/repair/proposal.service.ts:1176:  job_card_id: string;
apps/api/src/repair/proposal.service.ts:1177:  job_number: string;
apps/api/src/repair/proposal.service.ts:1178:  complaint: string;
apps/api/src/repair/proposal.service.ts:1179:  registration_number: string;
apps/api/src/repair/proposal.service.ts:1180:  customer_name: string;
apps/api/src/repair/proposal.service.ts:1181:  quotation_id: string;
apps/api/src/repair/proposal.service.ts:1182:  quotation_attempt_no: number;
apps/api/src/repair/proposal.service.ts:1183:  currency: string;
apps/api/src/repair/proposal.service.ts:1184:  warranty_terms: string | null;
apps/api/src/repair/proposal.service.ts:1185:  completion_conditions: string | null;
apps/api/src/repair/proposal.service.ts:1186:  valid_until: Date | null;
apps/api/src/repair/proposal.service.ts:1187:  repair_plan_id: string;
apps/api/src/repair/proposal.service.ts:1188:  version_no: number;
apps/api/src/repair/proposal.service.ts:1189:  status: ProposalStatus;
apps/api/src/repair/proposal.service.ts:1190:  expected_result: string | null;
apps/api/src/repair/proposal.service.ts:1191:  risk_and_limitations: string | null;
apps/api/src/repair/proposal.service.ts:1192:  uncertainties: string | null;
apps/api/src/repair/proposal.service.ts:1193:  presentation_note: string | null;
apps/api/src/repair/proposal.service.ts:1194:  issued_at: Date | null;
apps/api/src/repair/proposal.service.ts:1195:  decision: ProposalDecision | null;
apps/api/src/repair/proposal.service.ts:1196:  approved_option: ProposalOption | null;
apps/api/src/repair/proposal.service.ts:1197:  decided_at: Date | null;
apps/api/src/repair/proposal.service.ts:1198:  decided_by_name: string | null;
apps/api/src/repair/proposal.service.ts:1199:  decision_channel: DecisionChannel | null;
apps/api/src/repair/proposal.service.ts:1200:  decision_note: string | null;
apps/api/src/repair/proposal.service.ts:1201:  superseded_by: string | null;
apps/api/src/repair/proposal.service.ts:1202:  issued_by_name: string | null;
apps/api/src/repair/proposal.service.ts:1203:  recorded_by_name: string | null;
apps/api/src/repair/proposal.service.ts:1204:  chargeable_total: string;
apps/api/src/repair/proposal.service.ts:1205:  optional_total: string;
apps/api/src/repair/proposal.service.ts:1206:  discount_amount: string;
apps/api/src/repair/proposal.service.ts:1207:  tax_rate_percent: string;
apps/api/src/repair/proposal.service.ts:1208:  plan_hours: string;
apps/api/src/repair/proposal.service.ts:1209:  inspection_summary: string | null;
apps/api/src/repair/proposal.service.ts:1210:  inspection_checked: number;
apps/api/src/repair/proposal.service.ts:1211:  customer_email: string | null;
apps/api/src/repair/proposal.service.ts:1212:  customer_phone: string | null;
apps/api/src/repair/proposal.service.ts:1213:  customer_location: string | null;
apps/api/src/repair/proposal.service.ts:1214:  org_name: string;
apps/api/src/repair/proposal.service.ts:1215:  legal_name: string | null;
apps/api/src/repair/proposal.service.ts:1216:  trading_name: string | null;
apps/api/src/repair/proposal.service.ts:1217:  org_address: string | null;
apps/api/src/repair/proposal.service.ts:1218:  org_city: string | null;
apps/api/src/repair/proposal.service.ts:1219:  org_country: string | null;
apps/api/src/repair/proposal.service.ts:1220:  org_phone: string | null;
apps/api/src/repair/proposal.service.ts:1221:  org_email: string | null;
apps/api/src/repair/proposal.service.ts:1222:  org_website: string | null;
apps/api/src/repair/proposal.service.ts:1223:  tax_identification_number: string | null;
apps/api/src/repair/proposal.service.ts:1224:  vat_registration_number: string | null;
apps/api/src/repair/proposal.service.ts:1225:  document_footer: string | null;
apps/api/src/repair/proposal.service.ts:1226:  make_name: string | null;
apps/api/src/repair/proposal.service.ts:1227:  model_name: string | null;
apps/api/src/repair/proposal.service.ts:1228:  model_year: number | null;
apps/api/src/repair/proposal.service.ts:1229:}
rg: apps/api/src/repair/proposal.controller.ts: The system cannot find the file specified. (os error 2)

 exited 1 in 907ms:
apps/api/src/repair/proposal.spec.ts:1:import { existsSync, readFileSync } from 'node:fs';
apps/api/src/repair/proposal.spec.ts:2:import { dirname, join, resolve } from 'node:path';
apps/api/src/repair/proposal.spec.ts:3:import { describe, expect, it, vi } from 'vitest';
apps/api/src/repair/proposal.spec.ts:4:import { ProposalService } from './proposal.service';
apps/api/src/repair/proposal.spec.ts:5:import {
apps/api/src/repair/proposal.spec.ts:6:  CAN_PREPARE_PROPOSAL,
apps/api/src/repair/proposal.spec.ts:7:  CAN_READ_PROPOSAL,
apps/api/src/repair/proposal.spec.ts:8:  CAN_RECORD_DECISION,
apps/api/src/repair/proposal.spec.ts:9:  DECISION_CHANNELS,
apps/api/src/repair/proposal.spec.ts:10:  PROPOSAL_DECISIONS,
apps/api/src/repair/proposal.spec.ts:11:  PROPOSAL_OPTIONS,
apps/api/src/repair/proposal.spec.ts:12:  PROPOSAL_STATUSES,
apps/api/src/repair/proposal.spec.ts:13:  decisionChannelLabel,
apps/api/src/repair/proposal.spec.ts:14:} from './proposal-rules';
apps/api/src/repair/proposal.spec.ts:15:import type { TenantContext } from '../tenancy/tenant-context';
apps/api/src/repair/proposal.spec.ts:16:
apps/api/src/repair/proposal.spec.ts:17:/**
apps/api/src/repair/proposal.spec.ts:18: * Customer proposals — Phase 5, slice 6.
apps/api/src/repair/proposal.spec.ts:19: *
apps/api/src/repair/proposal.spec.ts:20: * UNIT tests over a fake client, asserting what the database cannot: who may make an
apps/api/src/repair/proposal.spec.ts:21: * offer to a customer, that the attribution of a decision is mandatory, and that §424's
apps/api/src/repair/proposal.spec.ts:22: * immutability is enforced in the service as well as by trigger.
apps/api/src/repair/proposal.spec.ts:23: *
apps/api/src/repair/proposal.spec.ts:24: * ⚠️ §424 IS PROVEN TWICE, DELIBERATELY. Here, so a caller gets a sentence naming the
apps/api/src/repair/proposal.spec.ts:25: * rule; and by trigger in migration 017, proven by `verify/017_repair_proposals.sql` and
apps/api/src/repair/proposal.spec.ts:26: * end-to-end by `probe-proposal.mjs`. A fake client cannot enforce a constraint, so a
apps/api/src/repair/proposal.spec.ts:27: * green result here says nothing about the database — and the reverse is equally true.
apps/api/src/repair/proposal.spec.ts:28: */
apps/api/src/repair/proposal.spec.ts:29:
apps/api/src/repair/proposal.spec.ts:30:const CARD_ID = '11111111-2222-3333-4444-555555555555';
apps/api/src/repair/proposal.spec.ts:31:const PROPOSAL_ID = 'cccccccc-dddd-eeee-ffff-000000000000';
apps/api/src/repair/proposal.spec.ts:32:const QUOTE_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
apps/api/src/repair/proposal.spec.ts:33:const PLAN_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
apps/api/src/repair/proposal.spec.ts:34:
apps/api/src/repair/proposal.spec.ts:35:const ctx = (over: Partial<TenantContext> = {}): TenantContext => ({
apps/api/src/repair/proposal.spec.ts:36:  tenantId: 'tenant-a',
apps/api/src/repair/proposal.spec.ts:37:  organizationId: 'org-1',
apps/api/src/repair/proposal.spec.ts:38:  branchId: null,
apps/api/src/repair/proposal.spec.ts:39:  userId: 'user-1',
apps/api/src/repair/proposal.spec.ts:40:  activeRole: 'reception_staff',
apps/api/src/repair/proposal.spec.ts:41:  correlationId: 'corr-1',
apps/api/src/repair/proposal.spec.ts:42:  ...over,
apps/api/src/repair/proposal.spec.ts:43:});
apps/api/src/repair/proposal.spec.ts:44:
apps/api/src/repair/proposal.spec.ts:45:const cardRow = (over: Record<string, unknown> = {}) => ({
apps/api/src/repair/proposal.spec.ts:46:  id: CARD_ID,
apps/api/src/repair/proposal.spec.ts:47:  job_number: 'JC-000003',
apps/api/src/repair/proposal.spec.ts:48:  stage: 'quotation_preparation',
apps/api/src/repair/proposal.spec.ts:49:  ...over,
apps/api/src/repair/proposal.spec.ts:50:});
apps/api/src/repair/proposal.spec.ts:51:
apps/api/src/repair/proposal.spec.ts:52:const headerRow = (over: Record<string, unknown> = {}) => ({
apps/api/src/repair/proposal.spec.ts:53:  id: PROPOSAL_ID,
apps/api/src/repair/proposal.spec.ts:54:  job_card_id: CARD_ID,
apps/api/src/repair/proposal.spec.ts:55:  job_number: 'JC-000003',
apps/api/src/repair/proposal.spec.ts:56:  complaint: 'Rough idle',
apps/api/src/repair/proposal.spec.ts:57:  registration_number: 'GR 4821-22',
apps/api/src/repair/proposal.spec.ts:58:  customer_name: 'Kwame Mensah',
apps/api/src/repair/proposal.spec.ts:59:  customer_email: 'kwame@example.com',
apps/api/src/repair/proposal.spec.ts:60:  customer_phone: '+233 24 000 0000',
apps/api/src/repair/proposal.spec.ts:61:  customer_location: 'Accra',
apps/api/src/repair/proposal.spec.ts:62:  org_name: 'Alpha Motors',
apps/api/src/repair/proposal.spec.ts:63:  legal_name: 'Alpha Motors Limited',
apps/api/src/repair/proposal.spec.ts:64:  trading_name: 'Alpha Motors',
apps/api/src/repair/proposal.spec.ts:65:  org_address: 'Plot 14, Spintex Road',
apps/api/src/repair/proposal.spec.ts:66:  org_city: 'Accra',
apps/api/src/repair/proposal.spec.ts:67:  org_country: 'Ghana',
apps/api/src/repair/proposal.spec.ts:68:  org_phone: '+233 30 123 4567',
apps/api/src/repair/proposal.spec.ts:69:  org_email: 'service@alpha.example',
apps/api/src/repair/proposal.spec.ts:70:  org_website: null,
apps/api/src/repair/proposal.spec.ts:71:  tax_identification_number: 'C0012345678',
apps/api/src/repair/proposal.spec.ts:72:  vat_registration_number: 'VAT-GH-004521',
apps/api/src/repair/proposal.spec.ts:73:  document_footer: 'Payment due on collection.',
apps/api/src/repair/proposal.spec.ts:74:  make_name: 'Toyota',
apps/api/src/repair/proposal.spec.ts:75:  model_name: 'Corolla',
apps/api/src/repair/proposal.spec.ts:76:  model_year: 2018,
apps/api/src/repair/proposal.spec.ts:77:  quotation_id: QUOTE_ID,
apps/api/src/repair/proposal.spec.ts:78:  quotation_attempt_no: 1,
apps/api/src/repair/proposal.spec.ts:79:  currency: 'GHS',
apps/api/src/repair/proposal.spec.ts:80:  warranty_terms: '12 months',
apps/api/src/repair/proposal.spec.ts:81:  completion_conditions: null,
apps/api/src/repair/proposal.spec.ts:82:  valid_until: null,
apps/api/src/repair/proposal.spec.ts:83:  repair_plan_id: PLAN_ID,
apps/api/src/repair/proposal.spec.ts:84:  version_no: 1,
apps/api/src/repair/proposal.spec.ts:85:  status: 'draft',
apps/api/src/repair/proposal.spec.ts:86:  expected_result: null,
apps/api/src/repair/proposal.spec.ts:87:  risk_and_limitations: null,
apps/api/src/repair/proposal.spec.ts:88:  uncertainties: null,
apps/api/src/repair/proposal.spec.ts:89:  presentation_note: null,
apps/api/src/repair/proposal.spec.ts:90:  issued_at: null,
apps/api/src/repair/proposal.spec.ts:91:  decision: null,
apps/api/src/repair/proposal.spec.ts:92:  approved_option: null,
apps/api/src/repair/proposal.spec.ts:93:  decided_at: null,
apps/api/src/repair/proposal.spec.ts:94:  decided_by_name: null,
apps/api/src/repair/proposal.spec.ts:95:  decision_channel: null,
apps/api/src/repair/proposal.spec.ts:96:  decision_note: null,
apps/api/src/repair/proposal.spec.ts:97:  superseded_by: null,
apps/api/src/repair/proposal.spec.ts:98:  issued_by_name: null,
apps/api/src/repair/proposal.spec.ts:99:  recorded_by_name: null,
apps/api/src/repair/proposal.spec.ts:100:  // ⚠️ STRINGS — `pg` returns `numeric` as text. Number fixtures would make the
apps/api/src/repair/proposal.spec.ts:101:  // conversion assertions vacuous.
apps/api/src/repair/proposal.spec.ts:102:  chargeable_total: '1000.00',
apps/api/src/repair/proposal.spec.ts:103:  optional_total: '500.00',
apps/api/src/repair/proposal.spec.ts:104:  discount_amount: '0.00',
apps/api/src/repair/proposal.spec.ts:105:  tax_rate_percent: '0.000',
apps/api/src/repair/proposal.spec.ts:106:  plan_hours: '3.50',
apps/api/src/repair/proposal.spec.ts:107:  inspection_summary: 'All checkpoints completed',
apps/api/src/repair/proposal.spec.ts:108:  inspection_checked: 19,
apps/api/src/repair/proposal.spec.ts:109:  ...over,
apps/api/src/repair/proposal.spec.ts:110:});
apps/api/src/repair/proposal.spec.ts:111:
apps/api/src/repair/proposal.spec.ts:112:const Q = {
apps/api/src/repair/proposal.spec.ts:113:  card: /FROM repair\.job_cards j\s+JOIN core\.customers/,
apps/api/src/repair/proposal.spec.ts:114:  decisionLookup: /p\.version_no, j\.job_number/,
apps/api/src/repair/proposal.spec.ts:115:  draft: /FOR UPDATE OF p/,
apps/api/src/repair/proposal.spec.ts:116:  header: /LEFT JOIN identity\.users rb/,
apps/api/src/repair/proposal.spec.ts:117:  faults: /JOIN repair\.diagnostic_findings f/,
apps/api/src/repair/proposal.spec.ts:118:  tasks: /FROM repair\.repair_plan_tasks/,
apps/api/src/repair/proposal.spec.ts:119:  parts: /FROM repair\.quotation_lines/,
apps/api/src/repair/proposal.spec.ts:120:  openCheck: /status IN \('draft', 'issued'\)/,
apps/api/src/repair/proposal.spec.ts:121:  latest: /ORDER BY version_no DESC LIMIT 1/,
apps/api/src/repair/proposal.spec.ts:122:  approvedQuote: /FROM repair\.quotations\s+WHERE job_card_id/,
apps/api/src/repair/proposal.spec.ts:123:  insert: /INSERT INTO repair\.repair_proposals/,
apps/api/src/repair/proposal.spec.ts:124:  update: /UPDATE repair\.repair_proposals/,
apps/api/src/repair/proposal.spec.ts:125:} as const;
apps/api/src/repair/proposal.spec.ts:126:
apps/api/src/repair/proposal.spec.ts:127:function fakeDb(handlers: Array<[RegExp, unknown[]]>) {
apps/api/src/repair/proposal.spec.ts:128:  const queries: Array<{ text: string; values?: unknown[] }> = [];
apps/api/src/repair/proposal.spec.ts:129:  const client = {
apps/api/src/repair/proposal.spec.ts:130:    query: vi.fn(async (text: string, values?: unknown[]) => {
apps/api/src/repair/proposal.spec.ts:131:      queries.push({ text, values });
apps/api/src/repair/proposal.spec.ts:132:      const hit = handlers.find(([re]) => re.test(text));
apps/api/src/repair/proposal.spec.ts:133:      const rows = hit ? hit[1] : [];
apps/api/src/repair/proposal.spec.ts:134:      return { rows, rowCount: rows.length };
apps/api/src/repair/proposal.spec.ts:135:    }),
apps/api/src/repair/proposal.spec.ts:136:  };
apps/api/src/repair/proposal.spec.ts:137:  return {
apps/api/src/repair/proposal.spec.ts:138:    queries,
apps/api/src/repair/proposal.spec.ts:139:    db: {
apps/api/src/repair/proposal.spec.ts:140:      withTenant: vi.fn(async (_c: TenantContext, work: (c: unknown) => Promise<unknown>) =>
apps/api/src/repair/proposal.spec.ts:141:        work(client),
apps/api/src/repair/proposal.spec.ts:142:      ),
apps/api/src/repair/proposal.spec.ts:143:    } as never,
apps/api/src/repair/proposal.spec.ts:144:  };
apps/api/src/repair/proposal.spec.ts:145:}
apps/api/src/repair/proposal.spec.ts:146:
apps/api/src/repair/proposal.spec.ts:147:const fakeAudit = () => ({ write: vi.fn(async () => undefined) }) as never;
apps/api/src/repair/proposal.spec.ts:148:const spyAudit = () => ({
apps/api/src/repair/proposal.spec.ts:149:  write: vi.fn(
apps/api/src/repair/proposal.spec.ts:150:    async (
apps/api/src/repair/proposal.spec.ts:151:      _client: unknown,
apps/api/src/repair/proposal.spec.ts:152:      _ctx: TenantContext,
apps/api/src/repair/proposal.spec.ts:153:      _event: { action: string; detail?: Record<string, unknown> },
apps/api/src/repair/proposal.spec.ts:154:    ) => undefined,
apps/api/src/repair/proposal.spec.ts:155:  ),
apps/api/src/repair/proposal.spec.ts:156:});
apps/api/src/repair/proposal.spec.ts:157:
apps/api/src/repair/proposal.spec.ts:158:const readHandlers = (over: { header?: unknown[] } = {}): Array<[RegExp, unknown[]]> => [
apps/api/src/repair/proposal.spec.ts:159:  [Q.header, over.header ?? [headerRow()]],
apps/api/src/repair/proposal.spec.ts:160:  [Q.faults, []],
apps/api/src/repair/proposal.spec.ts:161:  [Q.tasks, []],
apps/api/src/repair/proposal.spec.ts:162:  [Q.parts, []],
apps/api/src/repair/proposal.spec.ts:163:];
apps/api/src/repair/proposal.spec.ts:164:
apps/api/src/repair/proposal.spec.ts:165:function only<T>(rows: T[]): T {
apps/api/src/repair/proposal.spec.ts:166:  const first = rows[0];
apps/api/src/repair/proposal.spec.ts:167:  if (!first) throw new Error(`expected one row, received ${rows.length}`);
apps/api/src/repair/proposal.spec.ts:168:  return first;
apps/api/src/repair/proposal.spec.ts:169:}
apps/api/src/repair/proposal.spec.ts:170:
apps/api/src/repair/proposal.spec.ts:171:// ── who may make an offer ──────────────────────────────────────────────────
apps/api/src/repair/proposal.spec.ts:172:
apps/api/src/repair/proposal.spec.ts:173:describe('proposal roles — a commercial offer, not a technical one', () => {
apps/api/src/repair/proposal.spec.ts:174:  it('refuses a technician and a supervisor', async () => {
apps/api/src/repair/proposal.spec.ts:175:    const service = () => new ProposalService(fakeDb([]).db, fakeAudit());
apps/api/src/repair/proposal.spec.ts:176:    await expect(service().prepare(ctx({ activeRole: 'technician' }), CARD_ID)).rejects.toThrow(
apps/api/src/repair/proposal.spec.ts:177:      /may not prepare a customer proposal/,
apps/api/src/repair/proposal.spec.ts:178:    );
apps/api/src/repair/proposal.spec.ts:179:    // ⚠️ THE ASYMMETRY WITH SLICE 4, ASSERTED. A supervisor approves the repair PLAN;
apps/api/src/repair/proposal.spec.ts:180:    // §50's authority is technical review and stops at the customer's door.
apps/api/src/repair/proposal.spec.ts:181:    await expect(
apps/api/src/repair/proposal.spec.ts:182:      service().prepare(ctx({ activeRole: 'workshop_supervisor' }), CARD_ID),
apps/api/src/repair/proposal.spec.ts:183:    ).rejects.toThrow(/may not prepare a customer proposal/);
apps/api/src/repair/proposal.spec.ts:184:    expect(CAN_PREPARE_PROPOSAL.has('workshop_supervisor')).toBe(false);
apps/api/src/repair/proposal.spec.ts:185:    expect(CAN_PREPARE_PROPOSAL.has('reception_staff')).toBe(true);
apps/api/src/repair/proposal.spec.ts:186:  });
apps/api/src/repair/proposal.spec.ts:187:
apps/api/src/repair/proposal.spec.ts:188:  it('lets a technician READ one — §32 has them confirm the approval before starting', async () => {
apps/api/src/repair/proposal.spec.ts:189:    expect(CAN_READ_PROPOSAL.has('technician')).toBe(true);
apps/api/src/repair/proposal.spec.ts:190:    const { db, queries } = fakeDb(readHandlers());
apps/api/src/repair/proposal.spec.ts:191:    await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'technician', userId: 't9' }));
apps/api/src/repair/proposal.spec.ts:192:    // ...but only for a card assigned to them.
apps/api/src/repair/proposal.spec.ts:193:    expect(queries.find((q) => Q.header.test(q.text))?.values?.[4]).toBe('t9');
apps/api/src/repair/proposal.spec.ts:194:  });
apps/api/src/repair/proposal.spec.ts:195:
apps/api/src/repair/proposal.spec.ts:196:  it('does NOT apply an independence rule between issuer and recorder, by design', () => {
apps/api/src/repair/proposal.spec.ts:197:    // Everywhere else in Phase 5 both parties are staff, so independence must be
apps/api/src/repair/proposal.spec.ts:198:    // enforced. Here the deciding party is the CUSTOMER — outside the system — so a
apps/api/src/repair/proposal.spec.ts:199:    // check between the issuer and the scribe would be theatre and would block the
apps/api/src/repair/proposal.spec.ts:200:    // commonest real case: reception issues a proposal and the customer answers them
apps/api/src/repair/proposal.spec.ts:201:    // on the spot. What protects the record instead is mandatory attribution.
apps/api/src/repair/proposal.spec.ts:202:    expect(CAN_RECORD_DECISION).toBe(CAN_PREPARE_PROPOSAL);
apps/api/src/repair/proposal.spec.ts:203:  });
apps/api/src/repair/proposal.spec.ts:204:});
apps/api/src/repair/proposal.spec.ts:205:
apps/api/src/repair/proposal.spec.ts:206:// ── preparing and versioning ───────────────────────────────────────────────
apps/api/src/repair/proposal.spec.ts:207:
apps/api/src/repair/proposal.spec.ts:208:describe('prepare — §424 versioning', () => {
apps/api/src/repair/proposal.spec.ts:209:  it('refuses a card at the wrong stage', async () => {
apps/api/src/repair/proposal.spec.ts:210:    const { db } = fakeDb([[Q.card, [cardRow({ stage: 'repair_in_progress' })]]]);
apps/api/src/repair/proposal.spec.ts:211:    await expect(new ProposalService(db, fakeAudit()).prepare(ctx(), CARD_ID)).rejects.toThrow(
apps/api/src/repair/proposal.spec.ts:212:      /may only be prepared while the job card is at/,
apps/api/src/repair/proposal.spec.ts:213:    );
apps/api/src/repair/proposal.spec.ts:214:  });
apps/api/src/repair/proposal.spec.ts:215:
apps/api/src/repair/proposal.spec.ts:216:  it('refuses when there is no APPROVED quotation, naming a reachable route', async () => {
apps/api/src/repair/proposal.spec.ts:217:    const { db } = fakeDb([
apps/api/src/repair/proposal.spec.ts:218:      [Q.card, [cardRow()]],
apps/api/src/repair/proposal.spec.ts:219:      [Q.openCheck, []],
apps/api/src/repair/proposal.spec.ts:220:      [Q.latest, []],
apps/api/src/repair/proposal.spec.ts:221:      [Q.approvedQuote, []],
apps/api/src/repair/proposal.spec.ts:222:    ]);
apps/api/src/repair/proposal.spec.ts:223:    await expect(new ProposalService(db, fakeAudit()).prepare(ctx(), CARD_ID)).rejects.toThrow(
apps/api/src/repair/proposal.spec.ts:224:      /APPROVED quotation.*Quotations screen/s,
apps/api/src/repair/proposal.spec.ts:225:    );
apps/api/src/repair/proposal.spec.ts:226:  });
apps/api/src/repair/proposal.spec.ts:227:
apps/api/src/repair/proposal.spec.ts:228:  it('refuses a second version while one is with the customer', async () => {
apps/api/src/repair/proposal.spec.ts:229:    const { db } = fakeDb([
apps/api/src/repair/proposal.spec.ts:230:      [Q.card, [cardRow()]],
apps/api/src/repair/proposal.spec.ts:231:      [Q.openCheck, [{ id: PROPOSAL_ID, status: 'issued', version_no: 1 }]],
apps/api/src/repair/proposal.spec.ts:232:    ]);
apps/api/src/repair/proposal.spec.ts:233:    await expect(new ProposalService(db, fakeAudit()).prepare(ctx(), CARD_ID)).rejects.toThrow(
apps/api/src/repair/proposal.spec.ts:234:      /has not been answered/,
apps/api/src/repair/proposal.spec.ts:235:    );
apps/api/src/repair/proposal.spec.ts:236:  });
apps/api/src/repair/proposal.spec.ts:237:
apps/api/src/repair/proposal.spec.ts:238:  it('⚠️ refuses to supersede an APPROVED proposal without a fresh quotation', async () => {
apps/api/src/repair/proposal.spec.ts:239:    const { db } = fakeDb([
apps/api/src/repair/proposal.spec.ts:240:      [Q.card, [cardRow()]],
apps/api/src/repair/proposal.spec.ts:241:      [Q.openCheck, []],
apps/api/src/repair/proposal.spec.ts:242:      [Q.latest, [{ id: PROPOSAL_ID, version_no: 2, status: 'approved' }]],
apps/api/src/repair/proposal.spec.ts:243:    ]);
apps/api/src/repair/proposal.spec.ts:244:    // Replacing an agreement the customer has already given is a commercial act, not a
apps/api/src/repair/proposal.spec.ts:245:    // side effect of pressing a button on a job that is already authorised. §7: work
apps/api/src/repair/proposal.spec.ts:246:    // shall not start until the required approval is received — and it already has been.
apps/api/src/repair/proposal.spec.ts:247:    await expect(new ProposalService(db, fakeAudit()).prepare(ctx(), CARD_ID)).rejects.toThrow(
apps/api/src/repair/proposal.spec.ts:248:      /APPROVED by the customer/,
apps/api/src/repair/proposal.spec.ts:249:    );
apps/api/src/repair/proposal.spec.ts:250:  });
apps/api/src/repair/proposal.spec.ts:251:
apps/api/src/repair/proposal.spec.ts:252:  it('creates version n+1 and marks the one it replaces superseded', async () => {
apps/api/src/repair/proposal.spec.ts:253:    const { db, queries } = fakeDb([
apps/api/src/repair/proposal.spec.ts:254:      [Q.card, [cardRow()]],
apps/api/src/repair/proposal.spec.ts:255:      [Q.openCheck, []],
apps/api/src/repair/proposal.spec.ts:256:      [Q.latest, [{ id: 'older', version_no: 2, status: 'declined' }]],
apps/api/src/repair/proposal.spec.ts:257:      [Q.approvedQuote, [{ id: QUOTE_ID, attempt_no: 1 }]],
apps/api/src/repair/proposal.spec.ts:258:      [Q.insert, [{ id: PROPOSAL_ID }]],
apps/api/src/repair/proposal.spec.ts:259:      [Q.update, []],
apps/api/src/repair/proposal.spec.ts:260:      ...readHandlers({ header: [headerRow({ version_no: 3 })] }),
apps/api/src/repair/proposal.spec.ts:261:    ]);
apps/api/src/repair/proposal.spec.ts:262:    await new ProposalService(db, fakeAudit()).prepare(ctx(), CARD_ID);
apps/api/src/repair/proposal.spec.ts:263:    expect(queries.find((q) => Q.insert.test(q.text))?.values?.[4]).toBe(3);
apps/api/src/repair/proposal.spec.ts:264:    // §424: the old row points at its replacement rather than being edited or removed.
apps/api/src/repair/proposal.spec.ts:265:    const supersede = queries.find((q) => Q.update.test(q.text) && /superseded_by/.test(q.text));
apps/api/src/repair/proposal.spec.ts:266:    expect(supersede?.values?.[0]).toBe(PROPOSAL_ID);
apps/api/src/repair/proposal.spec.ts:267:  });
apps/api/src/repair/proposal.spec.ts:268:});
apps/api/src/repair/proposal.spec.ts:269:
apps/api/src/repair/proposal.spec.ts:270:// ── the document ───────────────────────────────────────────────────────────
apps/api/src/repair/proposal.spec.ts:271:
apps/api/src/repair/proposal.spec.ts:272:describe('the assembled document — §410-§422', () => {
apps/api/src/repair/proposal.spec.ts:273:  it('resolves a letterhead and an addressee, and a reference both sides can quote', async () => {
apps/api/src/repair/proposal.spec.ts:274:    const { db } = fakeDb(readHandlers());
apps/api/src/repair/proposal.spec.ts:275:    const p = only(await new ProposalService(db, fakeAudit()).list(ctx()));
apps/api/src/repair/proposal.spec.ts:276:    // A document with no issuer cannot be acted on, and one addressed to nobody is a
apps/api/src/repair/proposal.spec.ts:277:    // draft.
apps/api/src/repair/proposal.spec.ts:278:    expect(p.presentation.issuer.name).toBe('Alpha Motors');
apps/api/src/repair/proposal.spec.ts:279:    expect(p.presentation.issuer.vatRegistrationNumber).toBe('VAT-GH-004521');
apps/api/src/repair/proposal.spec.ts:280:    expect(p.presentation.addressee.name).toBe('Kwame Mensah');
apps/api/src/repair/proposal.spec.ts:281:    expect(p.presentation.documentReference).toBe('PROP-JC-000003-V1');
apps/api/src/repair/proposal.spec.ts:282:    expect(p.presentation.vehicleDescription).toBe('2018 Toyota Corolla');
apps/api/src/repair/proposal.spec.ts:283:  });
apps/api/src/repair/proposal.spec.ts:284:
apps/api/src/repair/proposal.spec.ts:285:  it('falls back to the platform name when no letterhead is configured', async () => {
apps/api/src/repair/proposal.spec.ts:286:    const { db } = fakeDb(
apps/api/src/repair/proposal.spec.ts:287:      readHandlers({
apps/api/src/repair/proposal.spec.ts:288:        header: [headerRow({ trading_name: null, legal_name: null, org_address: null })],
apps/api/src/repair/proposal.spec.ts:289:      }),
apps/api/src/repair/proposal.spec.ts:290:    );
apps/api/src/repair/proposal.spec.ts:291:    const p = only(await new ProposalService(db, fakeAudit()).list(ctx()));
apps/api/src/repair/proposal.spec.ts:292:    // ADR-015 applied to paperwork: a workshop that has configured nothing still gets a
apps/api/src/repair/proposal.spec.ts:293:    // usable document, and the renderer omits the lines it has nothing for.
apps/api/src/repair/proposal.spec.ts:294:    expect(p.presentation.issuer.name).toBe('Alpha Motors');
apps/api/src/repair/proposal.spec.ts:295:    expect(p.presentation.issuer.address).toBeNull();
apps/api/src/repair/proposal.spec.ts:296:  });
apps/api/src/repair/proposal.spec.ts:297:
apps/api/src/repair/proposal.spec.ts:298:  it('computes both price tiers, and excludes the optional lines from the lower one', async () => {
apps/api/src/repair/proposal.spec.ts:299:    const { db } = fakeDb(readHandlers());
apps/api/src/repair/proposal.spec.ts:300:    const p = only(await new ProposalService(db, fakeAudit()).list(ctx()));
apps/api/src/repair/proposal.spec.ts:301:    expect(p.presentation.recommendedTotal).toBe(1000);
apps/api/src/repair/proposal.spec.ts:302:    expect(p.presentation.comprehensiveTotal).toBe(1500);
apps/api/src/repair/proposal.spec.ts:303:  });
apps/api/src/repair/proposal.spec.ts:304:
apps/api/src/repair/proposal.spec.ts:305:  it('applies the discount before tax and never lets the base go negative', async () => {
apps/api/src/repair/proposal.spec.ts:306:    const { db } = fakeDb(
apps/api/src/repair/proposal.spec.ts:307:      readHandlers({
apps/api/src/repair/proposal.spec.ts:308:        header: [headerRow({ discount_amount: '5000.00', tax_rate_percent: '15.000' })],
apps/api/src/repair/proposal.spec.ts:309:      }),
apps/api/src/repair/proposal.spec.ts:310:    );
apps/api/src/repair/proposal.spec.ts:311:    const p = only(await new ProposalService(db, fakeAudit()).list(ctx()));
apps/api/src/repair/proposal.spec.ts:312:    expect(p.presentation.recommendedTotal).toBe(0);
apps/api/src/repair/proposal.spec.ts:313:  });
apps/api/src/repair/proposal.spec.ts:314:
apps/api/src/repair/proposal.spec.ts:315:  it('converts every pg numeric to a number', async () => {
apps/api/src/repair/proposal.spec.ts:316:    const { db } = fakeDb(readHandlers());
apps/api/src/repair/proposal.spec.ts:317:    const p = only(await new ProposalService(db, fakeAudit()).list(ctx()));
apps/api/src/repair/proposal.spec.ts:318:    // Left as strings these would concatenate rather than add — a wrong price with no
apps/api/src/repair/proposal.spec.ts:319:    // type error to catch it.
apps/api/src/repair/proposal.spec.ts:320:    expect(typeof p.presentation.recommendedTotal).toBe('number');
apps/api/src/repair/proposal.spec.ts:321:    expect(p.presentation.estimatedLabourHours).toBe(3.5);
apps/api/src/repair/proposal.spec.ts:322:  });
apps/api/src/repair/proposal.spec.ts:323:
apps/api/src/repair/proposal.spec.ts:324:  it('reports the AGREED total once a tier has been accepted', async () => {
apps/api/src/repair/proposal.spec.ts:325:    const { db } = fakeDb(
apps/api/src/repair/proposal.spec.ts:326:      readHandlers({
apps/api/src/repair/proposal.spec.ts:327:        header: [
apps/api/src/repair/proposal.spec.ts:328:          headerRow({ status: 'approved', decision: 'approved', approved_option: 'recommended' }),
apps/api/src/repair/proposal.spec.ts:329:        ],
apps/api/src/repair/proposal.spec.ts:330:      }),
apps/api/src/repair/proposal.spec.ts:331:    );
apps/api/src/repair/proposal.spec.ts:332:    const p = only(await new ProposalService(db, fakeAudit()).list(ctx()));
apps/api/src/repair/proposal.spec.ts:333:    // The figure an invoice is later checked against — which is why the option is
apps/api/src/repair/proposal.spec.ts:334:    // stored rather than inferred from whichever total happens to be larger.
apps/api/src/repair/proposal.spec.ts:335:    expect(p.agreedTotal).toBe(1000);
apps/api/src/repair/proposal.spec.ts:336:  });
apps/api/src/repair/proposal.spec.ts:337:});
apps/api/src/repair/proposal.spec.ts:338:
apps/api/src/repair/proposal.spec.ts:339:// ── the decision ───────────────────────────────────────────────────────────
apps/api/src/repair/proposal.spec.ts:340:
apps/api/src/repair/proposal.spec.ts:341:describe('recordDecision — §7 and the attribution', () => {
apps/api/src/repair/proposal.spec.ts:342:  const issued = [
apps/api/src/repair/proposal.spec.ts:343:    Q.decisionLookup,
apps/api/src/repair/proposal.spec.ts:344:    [{ id: PROPOSAL_ID, status: 'issued', version_no: 1, job_number: 'JC-1', superseded_by: null }],
apps/api/src/repair/proposal.spec.ts:345:  ] as [RegExp, unknown[]];
apps/api/src/repair/proposal.spec.ts:346:
apps/api/src/repair/proposal.spec.ts:347:  it('requires the customer name and the channel', async () => {
apps/api/src/repair/proposal.spec.ts:348:    const service = () => new ProposalService(fakeDb([issued]).db, fakeAudit());
apps/api/src/repair/proposal.spec.ts:349:    await expect(
apps/api/src/repair/proposal.spec.ts:350:      service().recordDecision(ctx(), PROPOSAL_ID, {
apps/api/src/repair/proposal.spec.ts:351:        decision: 'approved', approvedOption: 'recommended', decisionChannel: 'telephone',
apps/api/src/repair/proposal.spec.ts:352:      }),
apps/api/src/repair/proposal.spec.ts:353:    ).rejects.toThrow(/decidedByName/);
apps/api/src/repair/proposal.spec.ts:354:    await expect(
apps/api/src/repair/proposal.spec.ts:355:      service().recordDecision(ctx(), PROPOSAL_ID, {
apps/api/src/repair/proposal.spec.ts:356:        decision: 'approved', approvedOption: 'recommended', decidedByName: 'Kwame',
apps/api/src/repair/proposal.spec.ts:357:      }),
apps/api/src/repair/proposal.spec.ts:358:    ).rejects.toThrow(/decisionChannel/);
apps/api/src/repair/proposal.spec.ts:359:  });
apps/api/src/repair/proposal.spec.ts:360:
apps/api/src/repair/proposal.spec.ts:361:  it('🔴 refuses a SUPERSEDED version on the STAFF route too', async () => {
apps/api/src/repair/proposal.spec.ts:362:    // §424: the answer belongs to the CURRENT version. A superseded row can
apps/api/src/repair/proposal.spec.ts:363:    // still read `issued`, so status alone does not catch it — and recording
apps/api/src/repair/proposal.spec.ts:364:    // an approval against a replaced document authorises work at a price the
apps/api/src/repair/proposal.spec.ts:365:    // workshop has withdrawn.
apps/api/src/repair/proposal.spec.ts:366:    const superseded = [
apps/api/src/repair/proposal.spec.ts:367:      Q.decisionLookup,
apps/api/src/repair/proposal.spec.ts:368:      [{ id: PROPOSAL_ID, status: 'issued', version_no: 1, job_number: 'JC-1', superseded_by: 'newer' }],
apps/api/src/repair/proposal.spec.ts:369:    ] as [RegExp, unknown[]];
apps/api/src/repair/proposal.spec.ts:370:    await expect(
apps/api/src/repair/proposal.spec.ts:371:      new ProposalService(fakeDb([superseded]).db, fakeAudit()).recordDecision(ctx(), PROPOSAL_ID, {
apps/api/src/repair/proposal.spec.ts:372:        decision: 'approved', approvedOption: 'recommended',
apps/api/src/repair/proposal.spec.ts:373:        decidedByName: 'Kwame', decisionChannel: 'telephone',
apps/api/src/repair/proposal.spec.ts:374:      }),
apps/api/src/repair/proposal.spec.ts:375:    ).rejects.toThrow(/superseded by a newer proposal/);
apps/api/src/repair/proposal.spec.ts:376:  });
apps/api/src/repair/proposal.spec.ts:377:
apps/api/src/repair/proposal.spec.ts:378:  it('requires a reason for anything that is not an approval', async () => {
apps/api/src/repair/proposal.spec.ts:379:    // §7's five "request" actions all arrive as `changes_requested`, and the note is
apps/api/src/repair/proposal.spec.ts:380:    // what says which — so without it the workshop has nothing to act on.
apps/api/src/repair/proposal.spec.ts:381:    await expect(
apps/api/src/repair/proposal.spec.ts:382:      new ProposalService(fakeDb([issued]).db, fakeAudit()).recordDecision(ctx(), PROPOSAL_ID, {
apps/api/src/repair/proposal.spec.ts:383:        decision: 'changes_requested', decidedByName: 'Kwame', decisionChannel: 'telephone',
apps/api/src/repair/proposal.spec.ts:384:      }),
apps/api/src/repair/proposal.spec.ts:385:    ).rejects.toThrow(/what the customer asked to change/);
apps/api/src/repair/proposal.spec.ts:386:  });
apps/api/src/repair/proposal.spec.ts:387:
apps/api/src/repair/proposal.spec.ts:388:  it('requires an option when approving', async () => {
apps/api/src/repair/proposal.spec.ts:389:    await expect(
apps/api/src/repair/proposal.spec.ts:390:      new ProposalService(fakeDb([issued]).db, fakeAudit()).recordDecision(ctx(), PROPOSAL_ID, {
apps/api/src/repair/proposal.spec.ts:391:        decision: 'approved', decidedByName: 'Kwame', decisionChannel: 'in_person',
apps/api/src/repair/proposal.spec.ts:392:      }),
apps/api/src/repair/proposal.spec.ts:393:    ).rejects.toThrow(/approvedOption/);
apps/api/src/repair/proposal.spec.ts:394:  });
apps/api/src/repair/proposal.spec.ts:395:
apps/api/src/repair/proposal.spec.ts:396:  it('⚠️ records the customer as the decider and the staff member separately', async () => {
apps/api/src/repair/proposal.spec.ts:397:    const audit = spyAudit();
apps/api/src/repair/proposal.spec.ts:398:    const { db, queries } = fakeDb([issued, [Q.update, []], ...readHandlers()]);
apps/api/src/repair/proposal.spec.ts:399:    await new ProposalService(db, audit as never).recordDecision(
apps/api/src/repair/proposal.spec.ts:400:      ctx({ userId: 'reception-7' }),
apps/api/src/repair/proposal.spec.ts:401:      PROPOSAL_ID,
apps/api/src/repair/proposal.spec.ts:402:      {
apps/api/src/repair/proposal.spec.ts:403:        decision: 'approved',
apps/api/src/repair/proposal.spec.ts:404:        approvedOption: 'comprehensive',
apps/api/src/repair/proposal.spec.ts:405:        decidedByName: 'Kwame Mensah',
apps/api/src/repair/proposal.spec.ts:406:        decisionChannel: 'telephone',
apps/api/src/repair/proposal.spec.ts:407:      },
apps/api/src/repair/proposal.spec.ts:408:    );
apps/api/src/repair/proposal.spec.ts:409:    const update = queries.find((q) => Q.update.test(q.text));
apps/api/src/repair/proposal.spec.ts:410:    // Position 3 is `decided_by_name` (the customer), position 6 is `recorded_by` (the
apps/api/src/repair/proposal.spec.ts:411:    // scribe). Conflating them would record reception as having authorised the
apps/api/src/repair/proposal.spec.ts:412:    // customer's own repair.
apps/api/src/repair/proposal.spec.ts:413:    expect(update?.values?.[2]).toBe('Kwame Mensah');
apps/api/src/repair/proposal.spec.ts:414:    expect(update?.values?.[5]).toBe('reception-7');
apps/api/src/repair/proposal.spec.ts:415:    expect(audit.write.mock.calls[0]?.[2]?.detail).toMatchObject({
apps/api/src/repair/proposal.spec.ts:416:      decision: 'approved',
apps/api/src/repair/proposal.spec.ts:417:      channel: 'telephone',
apps/api/src/repair/proposal.spec.ts:418:      approvedOption: 'comprehensive',
apps/api/src/repair/proposal.spec.ts:419:    });
apps/api/src/repair/proposal.spec.ts:420:  });
apps/api/src/repair/proposal.spec.ts:421:
apps/api/src/repair/proposal.spec.ts:422:  it('refuses a decision on a draft, and a second decision on a settled one', async () => {
apps/api/src/repair/proposal.spec.ts:423:    const draft = [Q.decisionLookup, [{ id: PROPOSAL_ID, status: 'draft', version_no: 1, job_number: 'JC-1', superseded_by: null }]] as [RegExp, unknown[]];
apps/api/src/repair/proposal.spec.ts:424:    await expect(
apps/api/src/repair/proposal.spec.ts:425:      new ProposalService(fakeDb([draft]).db, fakeAudit()).recordDecision(ctx(), PROPOSAL_ID, {
apps/api/src/repair/proposal.spec.ts:426:        decision: 'approved', approvedOption: 'recommended', decidedByName: 'K', decisionChannel: 'sms',
apps/api/src/repair/proposal.spec.ts:427:      }),
apps/api/src/repair/proposal.spec.ts:428:    ).rejects.toThrow(/has not been issued/);
apps/api/src/repair/proposal.spec.ts:429:
apps/api/src/repair/proposal.spec.ts:430:    const done = [Q.decisionLookup, [{ id: PROPOSAL_ID, status: 'approved', version_no: 1, job_number: 'JC-1', superseded_by: null }]] as [RegExp, unknown[]];
apps/api/src/repair/proposal.spec.ts:431:    await expect(
apps/api/src/repair/proposal.spec.ts:432:      new ProposalService(fakeDb([done]).db, fakeAudit()).recordDecision(ctx(), PROPOSAL_ID, {
apps/api/src/repair/proposal.spec.ts:433:        decision: 'declined', decidedByName: 'K', decisionChannel: 'sms', note: 'no',
apps/api/src/repair/proposal.spec.ts:434:      }),
apps/api/src/repair/proposal.spec.ts:435:    ).rejects.toThrow(/§424 requires a new version/);
apps/api/src/repair/proposal.spec.ts:436:  });
apps/api/src/repair/proposal.spec.ts:437:});
apps/api/src/repair/proposal.spec.ts:438:
apps/api/src/repair/proposal.spec.ts:439:// ── §424 in the service ────────────────────────────────────────────────────
apps/api/src/repair/proposal.spec.ts:440:
apps/api/src/repair/proposal.spec.ts:441:
apps/api/src/repair/proposal.spec.ts:442:describe('recordCustomerDecision — the customer answers for themselves', () => {
apps/api/src/repair/proposal.spec.ts:443:  // The lookup this route uses is the decision lookup PLUS the customer's own
apps/api/src/repair/proposal.spec.ts:444:  // name, and it is constrained to a card that customer owns.
apps/api/src/repair/proposal.spec.ts:445:  const mine = [
apps/api/src/repair/proposal.spec.ts:446:    Q.decisionLookup,
apps/api/src/repair/proposal.spec.ts:447:    [{ id: PROPOSAL_ID, status: 'issued', version_no: 1, job_number: 'JC-1', display_name: 'Kwame Mensah', superseded_by: null }],
apps/api/src/repair/proposal.spec.ts:448:  ] as [RegExp, unknown[]];
apps/api/src/repair/proposal.spec.ts:449:
apps/api/src/repair/proposal.spec.ts:450:  const customerCtx = () => ctx({ activeRole: 'customer', userId: 'cust-1' });
apps/api/src/repair/proposal.spec.ts:451:
apps/api/src/repair/proposal.spec.ts:452:  it('🔴 refuses any role that is not the customer', async () => {
apps/api/src/repair/proposal.spec.ts:453:    // Staff have their own route, where the two attributions stay separate.
apps/api/src/repair/proposal.spec.ts:454:    // Letting reception in here would file THEIR name as the decider.
apps/api/src/repair/proposal.spec.ts:455:    for (const role of ['reception_staff', 'workshop_owner', 'technician']) {
apps/api/src/repair/proposal.spec.ts:456:      await expect(
apps/api/src/repair/proposal.spec.ts:457:        new ProposalService(fakeDb([mine]).db, fakeAudit()).recordCustomerDecision(
apps/api/src/repair/proposal.spec.ts:458:          ctx({ activeRole: role, userId: 'staff-1' }),
apps/api/src/repair/proposal.spec.ts:459:          PROPOSAL_ID,
apps/api/src/repair/proposal.spec.ts:460:          { decision: 'approved', approvedOption: 'recommended' },
apps/api/src/repair/proposal.spec.ts:461:        ),
apps/api/src/repair/proposal.spec.ts:462:      ).rejects.toThrow(/may not decide as the customer/);
apps/api/src/repair/proposal.spec.ts:463:    }
apps/api/src/repair/proposal.spec.ts:464:  });
apps/api/src/repair/proposal.spec.ts:465:
apps/api/src/repair/proposal.spec.ts:466:  it('🔴 scopes the lookup to the calling customer, not just to the tenant', async () => {
apps/api/src/repair/proposal.spec.ts:467:    // THE CONTROL. The role check says a customer may use this route; THIS is
apps/api/src/repair/proposal.spec.ts:468:    // what stops them approving somebody else's repair. Position 4 is
apps/api/src/repair/proposal.spec.ts:469:    // `c.user_id`, and it must be the session's user — never a request value.
apps/api/src/repair/proposal.spec.ts:470:    const { db, queries } = fakeDb([mine, [Q.update, []], ...readHandlers()]);
apps/api/src/repair/proposal.spec.ts:471:    await new ProposalService(db, fakeAudit()).recordCustomerDecision(
apps/api/src/repair/proposal.spec.ts:472:      customerCtx(), PROPOSAL_ID, { decision: 'approved', approvedOption: 'recommended' },
apps/api/src/repair/proposal.spec.ts:473:    );
apps/api/src/repair/proposal.spec.ts:474:    const lookup = queries.find((q) => Q.decisionLookup.test(q.text));
apps/api/src/repair/proposal.spec.ts:475:    expect(lookup?.values?.[3]).toBe('cust-1');
apps/api/src/repair/proposal.spec.ts:476:    expect(lookup?.text).toMatch(/c\.user_id = \$4/);
apps/api/src/repair/proposal.spec.ts:477:  });
apps/api/src/repair/proposal.spec.ts:478:
apps/api/src/repair/proposal.spec.ts:479:  it('🔴 derives the decider and the channel — a request cannot set either', async () => {
apps/api/src/repair/proposal.spec.ts:480:    // The whole reason this is a separate route. `decidedByName` comes from the
apps/api/src/repair/proposal.spec.ts:481:    // CUSTOMER RECORD and the channel from the route, so a customer cannot
apps/api/src/repair/proposal.spec.ts:482:    // approve under another name or file a portal approval as a phone call.
apps/api/src/repair/proposal.spec.ts:483:    const { db, queries } = fakeDb([mine, [Q.update, []], ...readHandlers()]);
apps/api/src/repair/proposal.spec.ts:484:    await new ProposalService(db, fakeAudit()).recordCustomerDecision(
apps/api/src/repair/proposal.spec.ts:485:      customerCtx(),
apps/api/src/repair/proposal.spec.ts:486:      PROPOSAL_ID,
apps/api/src/repair/proposal.spec.ts:487:      // Deliberately smuggling both fields in. The type does not admit them and
apps/api/src/repair/proposal.spec.ts:488:      // Zod strips them; this asserts the SERVICE ignores them even so.
apps/api/src/repair/proposal.spec.ts:489:      {
apps/api/src/repair/proposal.spec.ts:490:        decision: 'approved',
apps/api/src/repair/proposal.spec.ts:491:        approvedOption: 'recommended',
apps/api/src/repair/proposal.spec.ts:492:        decidedByName: 'Somebody Else',
apps/api/src/repair/proposal.spec.ts:493:        decisionChannel: 'telephone',
apps/api/src/repair/proposal.spec.ts:494:      } as never,
apps/api/src/repair/proposal.spec.ts:495:    );
apps/api/src/repair/proposal.spec.ts:496:    const update = queries.find((q) => Q.update.test(q.text));
apps/api/src/repair/proposal.spec.ts:497:    expect(update?.values?.[2]).toBe('Kwame Mensah');
apps/api/src/repair/proposal.spec.ts:498:    expect(update?.text).toMatch(/decision_channel = 'customer_portal'/);
apps/api/src/repair/proposal.spec.ts:499:    // And the customer is BOTH decider and recorder here — one person, which is
apps/api/src/repair/proposal.spec.ts:500:    // the strongest form of the record.
apps/api/src/repair/proposal.spec.ts:501:    expect(update?.values?.[4]).toBe('cust-1');
apps/api/src/repair/proposal.spec.ts:502:  });
apps/api/src/repair/proposal.spec.ts:503:
apps/api/src/repair/proposal.spec.ts:504:  it('marks the audit entry as self-service so a dispute can tell the two apart', async () => {
apps/api/src/repair/proposal.spec.ts:505:    const audit = spyAudit();
apps/api/src/repair/proposal.spec.ts:506:    const { db } = fakeDb([mine, [Q.update, []], ...readHandlers()]);
apps/api/src/repair/proposal.spec.ts:507:    await new ProposalService(db, audit as never).recordCustomerDecision(
apps/api/src/repair/proposal.spec.ts:508:      customerCtx(), PROPOSAL_ID, { decision: 'approved', approvedOption: 'recommended' },
apps/api/src/repair/proposal.spec.ts:509:    );
apps/api/src/repair/proposal.spec.ts:510:    expect(audit.write.mock.calls[0]?.[2]?.detail).toMatchObject({
apps/api/src/repair/proposal.spec.ts:511:      decision: 'approved',
apps/api/src/repair/proposal.spec.ts:512:      channel: 'customer_portal',
apps/api/src/repair/proposal.spec.ts:513:      selfService: true,
apps/api/src/repair/proposal.spec.ts:514:    });
apps/api/src/repair/proposal.spec.ts:515:  });
apps/api/src/repair/proposal.spec.ts:516:
apps/api/src/repair/proposal.spec.ts:517:  it('still requires a reason for anything that is not an approval', async () => {
apps/api/src/repair/proposal.spec.ts:518:    // Not relaxed just because the customer typed it themselves — a refusal with
apps/api/src/repair/proposal.spec.ts:519:    // no reason leaves the workshop nothing to act on either way.
apps/api/src/repair/proposal.spec.ts:520:    await expect(
apps/api/src/repair/proposal.spec.ts:521:      new ProposalService(fakeDb([mine]).db, fakeAudit()).recordCustomerDecision(
apps/api/src/repair/proposal.spec.ts:522:        customerCtx(), PROPOSAL_ID, { decision: 'declined' },
apps/api/src/repair/proposal.spec.ts:523:      ),
apps/api/src/repair/proposal.spec.ts:524:    ).rejects.toThrow(/must record why/);
apps/api/src/repair/proposal.spec.ts:525:  });
apps/api/src/repair/proposal.spec.ts:526:
apps/api/src/repair/proposal.spec.ts:527:  it('still requires an option when approving', async () => {
apps/api/src/repair/proposal.spec.ts:528:    await expect(
apps/api/src/repair/proposal.spec.ts:529:      new ProposalService(fakeDb([mine]).db, fakeAudit()).recordCustomerDecision(
apps/api/src/repair/proposal.spec.ts:530:        customerCtx(), PROPOSAL_ID, { decision: 'approved' },
apps/api/src/repair/proposal.spec.ts:531:      ),
apps/api/src/repair/proposal.spec.ts:532:    ).rejects.toThrow(/approvedOption/);
apps/api/src/repair/proposal.spec.ts:533:  });
apps/api/src/repair/proposal.spec.ts:534:
apps/api/src/repair/proposal.spec.ts:535:  it('🔴 refuses a SUPERSEDED version even while its status still reads issued', async () => {
apps/api/src/repair/proposal.spec.ts:536:    // The CONTROL behind the `decidable` flag. Hiding the version from the
apps/api/src/repair/proposal.spec.ts:537:    // screen is not enough — a caller can POST any id, and answering a document
apps/api/src/repair/proposal.spec.ts:538:    // the workshop has replaced would bind them to a superseded price.
apps/api/src/repair/proposal.spec.ts:539:    const superseded = [
apps/api/src/repair/proposal.spec.ts:540:      Q.decisionLookup,
apps/api/src/repair/proposal.spec.ts:541:      [{
apps/api/src/repair/proposal.spec.ts:542:        id: PROPOSAL_ID, status: 'issued', version_no: 1, job_number: 'JC-1',
apps/api/src/repair/proposal.spec.ts:543:        display_name: 'Kwame Mensah', superseded_by: 'a-newer-proposal',
apps/api/src/repair/proposal.spec.ts:544:      }],
apps/api/src/repair/proposal.spec.ts:545:    ] as [RegExp, unknown[]];
apps/api/src/repair/proposal.spec.ts:546:    await expect(
apps/api/src/repair/proposal.spec.ts:547:      new ProposalService(fakeDb([superseded]).db, fakeAudit()).recordCustomerDecision(
apps/api/src/repair/proposal.spec.ts:548:        customerCtx(), PROPOSAL_ID, { decision: 'approved', approvedOption: 'recommended' },
apps/api/src/repair/proposal.spec.ts:549:      ),
apps/api/src/repair/proposal.spec.ts:550:    ).rejects.toThrow(/replaced by a newer proposal/);
apps/api/src/repair/proposal.spec.ts:551:  });
apps/api/src/repair/proposal.spec.ts:552:
apps/api/src/repair/proposal.spec.ts:553:  it('404s rather than 403s when the proposal is not theirs', async () => {
apps/api/src/repair/proposal.spec.ts:554:    // The non-oracle rule: a customer must not be able to learn that somebody
apps/api/src/repair/proposal.spec.ts:555:    // else's proposal exists by the shape of the refusal.
apps/api/src/repair/proposal.spec.ts:556:    await expect(
apps/api/src/repair/proposal.spec.ts:557:      new ProposalService(fakeDb([[Q.decisionLookup, []]]).db, fakeAudit()).recordCustomerDecision(
apps/api/src/repair/proposal.spec.ts:558:        customerCtx(), PROPOSAL_ID, { decision: 'approved', approvedOption: 'recommended' },
apps/api/src/repair/proposal.spec.ts:559:      ),
apps/api/src/repair/proposal.spec.ts:560:    ).rejects.toThrow(/proposal not found/);
apps/api/src/repair/proposal.spec.ts:561:  });
apps/api/src/repair/proposal.spec.ts:562:
apps/api/src/repair/proposal.spec.ts:563:  it('refuses to answer a proposal that was never sent, or was already answered', async () => {
apps/api/src/repair/proposal.spec.ts:564:    const draft = [
apps/api/src/repair/proposal.spec.ts:565:      Q.decisionLookup,
apps/api/src/repair/proposal.spec.ts:566:      [{ id: PROPOSAL_ID, status: 'draft', version_no: 1, job_number: 'JC-1', display_name: 'K', superseded_by: null }],
apps/api/src/repair/proposal.spec.ts:567:    ] as [RegExp, unknown[]];
apps/api/src/repair/proposal.spec.ts:568:    await expect(
apps/api/src/repair/proposal.spec.ts:569:      new ProposalService(fakeDb([draft]).db, fakeAudit()).recordCustomerDecision(
apps/api/src/repair/proposal.spec.ts:570:        customerCtx(), PROPOSAL_ID, { decision: 'approved', approvedOption: 'recommended' },
apps/api/src/repair/proposal.spec.ts:571:      ),
apps/api/src/repair/proposal.spec.ts:572:    ).rejects.toThrow(/not been sent to you yet/);
apps/api/src/repair/proposal.spec.ts:573:
apps/api/src/repair/proposal.spec.ts:574:    const answered = [
apps/api/src/repair/proposal.spec.ts:575:      Q.decisionLookup,
apps/api/src/repair/proposal.spec.ts:576:      [{ id: PROPOSAL_ID, status: 'approved', version_no: 2, job_number: 'JC-1', display_name: 'K', superseded_by: null }],
apps/api/src/repair/proposal.spec.ts:577:    ] as [RegExp, unknown[]];
apps/api/src/repair/proposal.spec.ts:578:    await expect(
apps/api/src/repair/proposal.spec.ts:579:      new ProposalService(fakeDb([answered]).db, fakeAudit()).recordCustomerDecision(
apps/api/src/repair/proposal.spec.ts:580:        customerCtx(), PROPOSAL_ID, { decision: 'declined', note: 'changed my mind' },
apps/api/src/repair/proposal.spec.ts:581:      ),
apps/api/src/repair/proposal.spec.ts:582:    ).rejects.toThrow(/already answered version 2/);
apps/api/src/repair/proposal.spec.ts:583:  });
apps/api/src/repair/proposal.spec.ts:584:});
apps/api/src/repair/proposal.spec.ts:585:
apps/api/src/repair/proposal.spec.ts:586:describe('a customer reading proposals', () => {
apps/api/src/repair/proposal.spec.ts:587:  it('🔴 is narrowed to their own cards by the QUERY, not by the role check', async () => {
apps/api/src/repair/proposal.spec.ts:588:    // CAN_READ_PROPOSAL admits the role; position 6 is what scopes it. Without
apps/api/src/repair/proposal.spec.ts:589:    // this predicate a customer receives every proposal in the organisation —
apps/api/src/repair/proposal.spec.ts:590:    // prices, contact details and all.
apps/api/src/repair/proposal.spec.ts:591:    const { db, queries } = fakeDb(readHandlers());
apps/api/src/repair/proposal.spec.ts:592:    await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'customer', userId: 'cust-9' }));
apps/api/src/repair/proposal.spec.ts:593:    expect(queries.find((q) => Q.header.test(q.text))?.values?.[5]).toBe('cust-9');
apps/api/src/repair/proposal.spec.ts:594:  });
apps/api/src/repair/proposal.spec.ts:595:
apps/api/src/repair/proposal.spec.ts:596:  it('does NOT narrow a staff viewer by customer', async () => {
apps/api/src/repair/proposal.spec.ts:597:    // The predicate must bind to the CUSTOMER role only. Applied to staff it
apps/api/src/repair/proposal.spec.ts:598:    // would empty every workshop screen that reads proposals.
apps/api/src/repair/proposal.spec.ts:599:    const { db, queries } = fakeDb(readHandlers());
apps/api/src/repair/proposal.spec.ts:600:    await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'workshop_owner' }));
apps/api/src/repair/proposal.spec.ts:601:    expect(queries.find((q) => Q.header.test(q.text))?.values?.[5]).toBeNull();
apps/api/src/repair/proposal.spec.ts:602:  });
apps/api/src/repair/proposal.spec.ts:603:});
apps/api/src/repair/proposal.spec.ts:604:
apps/api/src/repair/proposal.spec.ts:605:
apps/api/src/repair/proposal.spec.ts:606:describe('the affordance flags — what the VIEWER is told they may do', () => {
apps/api/src/repair/proposal.spec.ts:607:  /**
apps/api/src/repair/proposal.spec.ts:608:   * WHY THIS BLOCK EXISTS. `decidable` was left computing from the STAFF role
apps/api/src/repair/proposal.spec.ts:609:   * set when the customer role was added to CAN_READ_PROPOSAL, so it evaluated
apps/api/src/repair/proposal.spec.ts:610:   * false for every customer — and the customer screen renders its approval
apps/api/src/repair/proposal.spec.ts:611:   * form only on `decidable`. The self-service approval was completely inert
apps/api/src/repair/proposal.spec.ts:612:   * while the service behind it worked and its ten tests passed.
apps/api/src/repair/proposal.spec.ts:613:   *
apps/api/src/repair/proposal.spec.ts:614:   * Nothing threw and nothing logged. Every existing test drove the SERVICE;
apps/api/src/repair/proposal.spec.ts:615:   * none asked what the viewer had been TOLD they could do. That gap is the bug,
apps/api/src/repair/proposal.spec.ts:616:   * so these assert the flags directly.
apps/api/src/repair/proposal.spec.ts:617:   */
apps/api/src/repair/proposal.spec.ts:618:  const issuedHeader = (over: Record<string, unknown> = {}) =>
apps/api/src/repair/proposal.spec.ts:619:    readHandlers({ header: [headerRow({ status: 'issued', issued_at: new Date('2026-08-01T00:00:00Z'), ...over })] });
apps/api/src/repair/proposal.spec.ts:620:
apps/api/src/repair/proposal.spec.ts:621:  it('🔴 a customer may decide an ISSUED proposal', async () => {
apps/api/src/repair/proposal.spec.ts:622:    const { db } = fakeDb(issuedHeader());
apps/api/src/repair/proposal.spec.ts:623:    const p = only(await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'customer', userId: 'cust-1' })));
apps/api/src/repair/proposal.spec.ts:624:    expect(p.decidable, 'the approval form renders on this flag and on nothing else').toBe(true);
apps/api/src/repair/proposal.spec.ts:625:  });
apps/api/src/repair/proposal.spec.ts:626:
apps/api/src/repair/proposal.spec.ts:627:  it('staff may still decide one — the customer did not displace them', async () => {
apps/api/src/repair/proposal.spec.ts:628:    const { db } = fakeDb(issuedHeader());
apps/api/src/repair/proposal.spec.ts:629:    const p = only(await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'reception_staff' })));
apps/api/src/repair/proposal.spec.ts:630:    expect(p.decidable).toBe(true);
apps/api/src/repair/proposal.spec.ts:631:  });
apps/api/src/repair/proposal.spec.ts:632:
apps/api/src/repair/proposal.spec.ts:633:  it('a role that may read but not answer is NOT offered the choice', async () => {
apps/api/src/repair/proposal.spec.ts:634:    // A technician reads the approval to confirm it before starting work; they
apps/api/src/repair/proposal.spec.ts:635:    // do not make it. Offering them the control would be a button that 403s.
apps/api/src/repair/proposal.spec.ts:636:    const { db } = fakeDb(issuedHeader());
apps/api/src/repair/proposal.spec.ts:637:    const p = only(
apps/api/src/repair/proposal.spec.ts:638:      await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'technician', userId: 't1' })),
apps/api/src/repair/proposal.spec.ts:639:    );
apps/api/src/repair/proposal.spec.ts:640:    expect(p.decidable).toBe(false);
apps/api/src/repair/proposal.spec.ts:641:  });
apps/api/src/repair/proposal.spec.ts:642:
apps/api/src/repair/proposal.spec.ts:643:  it('nobody may decide a DRAFT — it has not been sent yet', async () => {
apps/api/src/repair/proposal.spec.ts:644:    const { db } = fakeDb(readHandlers({ header: [headerRow({ status: 'draft' })] }));
apps/api/src/repair/proposal.spec.ts:645:    const p = only(await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'customer', userId: 'c1' })));
apps/api/src/repair/proposal.spec.ts:646:    expect(p.decidable).toBe(false);
apps/api/src/repair/proposal.spec.ts:647:  });
apps/api/src/repair/proposal.spec.ts:648:
apps/api/src/repair/proposal.spec.ts:649:  it('nobody may decide one that was already answered', async () => {
apps/api/src/repair/proposal.spec.ts:650:    // Otherwise the customer is offered a second answer to a settled document
apps/api/src/repair/proposal.spec.ts:651:    // and the API refuses it — a control that fails, which reads as a bug.
apps/api/src/repair/proposal.spec.ts:652:    const { db } = fakeDb(readHandlers({ header: [headerRow({ status: 'approved' })] }));
apps/api/src/repair/proposal.spec.ts:653:    const p = only(await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'customer', userId: 'c1' })));
apps/api/src/repair/proposal.spec.ts:654:    expect(p.decidable).toBe(false);
apps/api/src/repair/proposal.spec.ts:655:  });
apps/api/src/repair/proposal.spec.ts:656:
apps/api/src/repair/proposal.spec.ts:657:  it('a customer is never offered the EDIT or ISSUE controls', async () => {
apps/api/src/repair/proposal.spec.ts:658:    // Those belong to the workshop. `editable`/`issuable` must not widen with
apps/api/src/repair/proposal.spec.ts:659:    // `decidable` — the same oversight in the other direction.
apps/api/src/repair/proposal.spec.ts:660:    const { db } = fakeDb(readHandlers({ header: [headerRow({ status: 'draft' })] }));
apps/api/src/repair/proposal.spec.ts:661:    const p = only(await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'customer', userId: 'c1' })));
apps/api/src/repair/proposal.spec.ts:662:    expect(p.editable).toBe(false);
apps/api/src/repair/proposal.spec.ts:663:    expect(p.issuable).toBe(false);
apps/api/src/repair/proposal.spec.ts:664:  });
apps/api/src/repair/proposal.spec.ts:665:});
apps/api/src/repair/proposal.spec.ts:666:
apps/api/src/repair/proposal.spec.ts:667:describe('§424 — immutability', () => {
apps/api/src/repair/proposal.spec.ts:668:  it('refuses to edit an issued or decided proposal, naming the rule', async () => {
apps/api/src/repair/proposal.spec.ts:669:    const issuedRow = [Q.draft, [{ id: PROPOSAL_ID, status: 'issued', version_no: 1, job_number: 'JC-1' }]] as [RegExp, unknown[]];
apps/api/src/repair/proposal.spec.ts:670:    await expect(
apps/api/src/repair/proposal.spec.ts:671:      new ProposalService(fakeDb([issuedRow]).db, fakeAudit()).recordNarrative(ctx(), PROPOSAL_ID, {
apps/api/src/repair/proposal.spec.ts:672:        expectedResult: 'changed',
apps/api/src/repair/proposal.spec.ts:673:      }),
apps/api/src/repair/proposal.spec.ts:674:    ).rejects.toThrow(/with the customer and its content is frozen/);
apps/api/src/repair/proposal.spec.ts:675:
apps/api/src/repair/proposal.spec.ts:676:    const approvedRow = [Q.draft, [{ id: PROPOSAL_ID, status: 'approved', version_no: 1, job_number: 'JC-1', superseded_by: null }]] as [RegExp, unknown[]];
apps/api/src/repair/proposal.spec.ts:677:    await expect(
apps/api/src/repair/proposal.spec.ts:678:      new ProposalService(fakeDb([approvedRow]).db, fakeAudit()).recordNarrative(ctx(), PROPOSAL_ID, {
apps/api/src/repair/proposal.spec.ts:679:        expectedResult: 'changed',
apps/api/src/repair/proposal.spec.ts:680:      }),
apps/api/src/repair/proposal.spec.ts:681:    ).rejects.toThrow(/§424/);
apps/api/src/repair/proposal.spec.ts:682:  });
apps/api/src/repair/proposal.spec.ts:683:
apps/api/src/repair/proposal.spec.ts:684:  it('refuses to issue without §418s expected result', async () => {
apps/api/src/repair/proposal.spec.ts:685:    const { db } = fakeDb([
apps/api/src/repair/proposal.spec.ts:686:      [Q.draft, [{ id: PROPOSAL_ID, status: 'draft', version_no: 1, job_number: 'JC-1', superseded_by: null }]],
apps/api/src/repair/proposal.spec.ts:687:      ...readHandlers(),
apps/api/src/repair/proposal.spec.ts:688:    ]);
apps/api/src/repair/proposal.spec.ts:689:    // The one section of §410-§422 no other record can supply: a price with no promise
apps/api/src/repair/proposal.spec.ts:690:    // attached is not a proposal.
apps/api/src/repair/proposal.spec.ts:691:    await expect(new ProposalService(db, fakeAudit()).issue(ctx(), PROPOSAL_ID)).rejects.toThrow(
apps/api/src/repair/proposal.spec.ts:692:      /what the work should achieve/,
apps/api/src/repair/proposal.spec.ts:693:    );
apps/api/src/repair/proposal.spec.ts:694:  });
apps/api/src/repair/proposal.spec.ts:695:});
apps/api/src/repair/proposal.spec.ts:696:
apps/api/src/repair/proposal.spec.ts:697:// ── the rules module against the migration ─────────────────────────────────
apps/api/src/repair/proposal.spec.ts:698:
apps/api/src/repair/proposal.spec.ts:699:describe('proposal-rules matches what migration 017 applied', () => {
apps/api/src/repair/proposal.spec.ts:700:  function migration(name: string): string {
apps/api/src/repair/proposal.spec.ts:701:    let dir = resolve(__dirname);
apps/api/src/repair/proposal.spec.ts:702:    let sqlPath = '';
apps/api/src/repair/proposal.spec.ts:703:    for (let i = 0; i < 8 && sqlPath === ''; i += 1) {
apps/api/src/repair/proposal.spec.ts:704:      const candidate = join(dir, `infrastructure/migrations/${name}`);
apps/api/src/repair/proposal.spec.ts:705:      if (existsSync(candidate)) sqlPath = candidate;
apps/api/src/repair/proposal.spec.ts:706:      dir = dirname(dir);
apps/api/src/repair/proposal.spec.ts:707:    }
apps/api/src/repair/proposal.spec.ts:708:    expect(sqlPath, `could not locate ${name}`).not.toBe('');
apps/api/src/repair/proposal.spec.ts:709:    return readFileSync(sqlPath, 'utf8');
apps/api/src/repair/proposal.spec.ts:710:  }
apps/api/src/repair/proposal.spec.ts:711:  const SQL = () => migration('017_repair_proposals.sql');
apps/api/src/repair/proposal.spec.ts:712:
apps/api/src/repair/proposal.spec.ts:713:  function checkValues(sql: string, column: string): string[] {
apps/api/src/repair/proposal.spec.ts:714:    const re = new RegExp(`${column}\\s+IN\\s*\\(([\\s\\S]*?)\\)`);
apps/api/src/repair/proposal.spec.ts:715:    const body = re.exec(sql)?.[1] ?? '';
apps/api/src/repair/proposal.spec.ts:716:    return [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string).sort();
apps/api/src/repair/proposal.spec.ts:717:  }
apps/api/src/repair/proposal.spec.ts:718:
apps/api/src/repair/proposal.spec.ts:719:  it('carries exactly the six proposal statuses', () => {
apps/api/src/repair/proposal.spec.ts:720:    expect(checkValues(SQL(), 'status')).toEqual([...PROPOSAL_STATUSES].sort());
apps/api/src/repair/proposal.spec.ts:721:  });
apps/api/src/repair/proposal.spec.ts:722:
apps/api/src/repair/proposal.spec.ts:723:  it('carries exactly §7s three decisions', () => {
apps/api/src/repair/proposal.spec.ts:724:    expect(checkValues(SQL(), 'decision')).toEqual([...PROPOSAL_DECISIONS].sort());
apps/api/src/repair/proposal.spec.ts:725:  });
apps/api/src/repair/proposal.spec.ts:726:
apps/api/src/repair/proposal.spec.ts:727:  it('carries exactly §398-§402s offered options', () => {
apps/api/src/repair/proposal.spec.ts:728:    expect(checkValues(SQL(), 'approved_option')).toEqual([...PROPOSAL_OPTIONS].sort());
apps/api/src/repair/proposal.spec.ts:729:  });
apps/api/src/repair/proposal.spec.ts:730:
apps/api/src/repair/proposal.spec.ts:731:  it('carries exactly §7s channels, and labels each', () => {
apps/api/src/repair/proposal.spec.ts:732:    expect(checkValues(SQL(), 'decision_channel')).toEqual([...DECISION_CHANNELS].sort());
apps/api/src/repair/proposal.spec.ts:733:    for (const c of DECISION_CHANNELS) {
apps/api/src/repair/proposal.spec.ts:734:      expect({ c, label: decisionChannelLabel(c) }).not.toEqual({ c, label: c });
apps/api/src/repair/proposal.spec.ts:735:    }
apps/api/src/repair/proposal.spec.ts:736:  });
apps/api/src/repair/proposal.spec.ts:737:
apps/api/src/repair/proposal.spec.ts:738:  it('⚠️ makes the decision attribution MANDATORY at the database level', () => {
apps/api/src/repair/proposal.spec.ts:739:    // The service checks it and this test pins the second layer: a decided row must name
apps/api/src/repair/proposal.spec.ts:740:    // the person, the time and the channel. This is the record a workshop relies on when
apps/api/src/repair/proposal.spec.ts:741:    // a customer says they never agreed.
apps/api/src/repair/proposal.spec.ts:742:    const sql = SQL();
apps/api/src/repair/proposal.spec.ts:743:    expect(sql).toMatch(/CONSTRAINT proposal_decision_attributed CHECK/);
apps/api/src/repair/proposal.spec.ts:744:    expect(sql).toMatch(/decided_by_name IS NOT NULL/);
apps/api/src/repair/proposal.spec.ts:745:    expect(sql).toMatch(/decision_channel IS NOT NULL/);
apps/api/src/repair/proposal.spec.ts:746:  });
apps/api/src/repair/proposal.spec.ts:747:
apps/api/src/repair/proposal.spec.ts:748:  it('pins the status and the decision together so they cannot drift', () => {
apps/api/src/repair/proposal.spec.ts:749:    expect(SQL()).toMatch(/CONSTRAINT proposal_status_matches_decision CHECK/);
apps/api/src/repair/proposal.spec.ts:750:  });
apps/api/src/repair/proposal.spec.ts:751:
apps/api/src/repair/proposal.spec.ts:752:  it('⚠️ refuses to edit a decided proposal, and permits ONLY the supersession', () => {
apps/api/src/repair/proposal.spec.ts:753:    const sql = SQL();
apps/api/src/repair/proposal.spec.ts:754:    // §424 in the database. The narrow exception is deliberate: recording the
apps/api/src/repair/proposal.spec.ts:755:    // supersession would otherwise require breaking the very immutability that makes
apps/api/src/repair/proposal.spec.ts:756:    // versioning necessary.
apps/api/src/repair/proposal.spec.ts:757:    expect(sql).toMatch(/has been decided and cannot be changed/);
apps/api/src/repair/proposal.spec.ts:758:    expect(sql).toMatch(/NEW\.status = 'superseded'/);
apps/api/src/repair/proposal.spec.ts:759:  });
apps/api/src/repair/proposal.spec.ts:760:
apps/api/src/repair/proposal.spec.ts:761:  it('withholds DELETE entirely — a proposal is superseded, never erased', () => {
apps/api/src/repair/proposal.spec.ts:762:    const sql = SQL();
apps/api/src/repair/proposal.spec.ts:763:    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE ON repair\.repair_proposals/);
apps/api/src/repair/proposal.spec.ts:764:    expect(sql).toMatch(/REVOKE DELETE ON repair\.repair_proposals/);
apps/api/src/repair/proposal.spec.ts:765:    expect(sql).not.toMatch(/GRANT[^;]*DELETE[^;]*ON repair\.repair_proposals/);
apps/api/src/repair/proposal.spec.ts:766:  });
apps/api/src/repair/proposal.spec.ts:767:
apps/api/src/repair/proposal.spec.ts:768:  it('FORCEs row-level security', () => {
apps/api/src/repair/proposal.spec.ts:769:    const sql = SQL();
apps/api/src/repair/proposal.spec.ts:770:    expect(sql).toMatch(/ALTER TABLE repair\.repair_proposals ENABLE ROW LEVEL SECURITY/);
apps/api/src/repair/proposal.spec.ts:771:    expect(sql).toMatch(/ALTER TABLE repair\.repair_proposals FORCE\s+ROW LEVEL SECURITY/);
apps/api/src/repair/proposal.spec.ts:772:  });
apps/api/src/repair/proposal.spec.ts:773:
apps/api/src/repair/proposal.spec.ts:774:  it('requires the letterhead table to be tenant-isolated too — migration 018', () => {
apps/api/src/repair/proposal.spec.ts:775:    const sql = migration('018_organization_profile.sql');
apps/api/src/repair/proposal.spec.ts:776:    expect(sql).toMatch(/ALTER TABLE core\.organization_profile FORCE\s+ROW LEVEL SECURITY/);
apps/api/src/repair/proposal.spec.ts:777:    expect(sql).toMatch(/REVOKE DELETE ON core\.organization_profile/);
apps/api/src/repair/proposal.spec.ts:778:  });
apps/api/src/repair/proposal.spec.ts:779:});
apps/api/src/repair/proposal.service.ts:1:import {
apps/api/src/repair/proposal.service.ts:2:  BadRequestException,
apps/api/src/repair/proposal.service.ts:3:  ConflictException,
apps/api/src/repair/proposal.service.ts:4:  ForbiddenException,
apps/api/src/repair/proposal.service.ts:5:  Injectable,
apps/api/src/repair/proposal.service.ts:6:  NotFoundException,
apps/api/src/repair/proposal.service.ts:7:} from '@nestjs/common';
apps/api/src/repair/proposal.service.ts:8:import { AuditService } from '../audit/audit.service';
apps/api/src/repair/proposal.service.ts:9:import { DatabaseService } from '../database/database.service';
apps/api/src/repair/proposal.service.ts:10:import type { TenantContext } from '../tenancy/tenant-context';
apps/api/src/repair/proposal.service.ts:11:import { optionalText, requireOneOf, requireText, requireUuid } from '../core/validate';
apps/api/src/repair/proposal.service.ts:12:import {
apps/api/src/repair/proposal.service.ts:13:  CAN_PREPARE_PROPOSAL,
apps/api/src/repair/proposal.service.ts:14:  CAN_DECIDE_AS_CUSTOMER,
apps/api/src/repair/proposal.service.ts:15:  CAN_READ_PROPOSAL,
apps/api/src/repair/proposal.service.ts:16:  CAN_RECORD_DECISION,
apps/api/src/repair/proposal.service.ts:17:  DECISION_CHANNELS,
apps/api/src/repair/proposal.service.ts:18:  PROPOSAL_DECISIONS,
apps/api/src/repair/proposal.service.ts:19:  PROPOSAL_OPTIONS,
apps/api/src/repair/proposal.service.ts:20:  PROPOSAL_STAGES,
apps/api/src/repair/proposal.service.ts:21:  REQUIRED_QUOTATION_STATUS,
apps/api/src/repair/proposal.service.ts:22:  decisionChannelLabel,
apps/api/src/repair/proposal.service.ts:23:  type DecisionChannel,
apps/api/src/repair/proposal.service.ts:24:  type ProposalDecision,
apps/api/src/repair/proposal.service.ts:25:  type ProposalOption,
apps/api/src/repair/proposal.service.ts:26:  type ProposalStatus,
apps/api/src/repair/proposal.service.ts:27:} from './proposal-rules';
apps/api/src/repair/proposal.service.ts:28:
apps/api/src/repair/proposal.service.ts:29:/**
apps/api/src/repair/proposal.service.ts:30: * What §410-§422 says the customer must be shown, gathered from the records that
apps/api/src/repair/proposal.service.ts:31: * already hold it.
apps/api/src/repair/proposal.service.ts:32: *
apps/api/src/repair/proposal.service.ts:33: * ⚠️ EVERY FIELD HERE IS READ, NEVER COPIED. Each source is already immutable by the
apps/api/src/repair/proposal.service.ts:34: * time a proposal can exist — a submitted inspection (010), an approved diagnosis
apps/api/src/repair/proposal.service.ts:35: * (012), an approved plan (014), an approved quotation (016). Snapshotting them onto
apps/api/src/repair/proposal.service.ts:36: * the proposal would create a second version of a fact that can never change, and a
apps/api/src/repair/proposal.service.ts:37: * second thing to keep in step.
apps/api/src/repair/proposal.service.ts:38: */
apps/api/src/repair/proposal.service.ts:39:/**
apps/api/src/repair/proposal.service.ts:40: * The workshop's own identity, as it appears at the head of a document it issues.
apps/api/src/repair/proposal.service.ts:41: *
apps/api/src/repair/proposal.service.ts:42: * Every field is optional — a workshop that has configured nothing still gets a usable
apps/api/src/repair/proposal.service.ts:43: * document, and the renderer omits the lines it has nothing for rather than printing
apps/api/src/repair/proposal.service.ts:44: * blanks. `name` always resolves, falling back to the platform's record.
apps/api/src/repair/proposal.service.ts:45: */
apps/api/src/repair/proposal.service.ts:46:export interface IssuerIdentity {
apps/api/src/repair/proposal.service.ts:47:  name: string;
apps/api/src/repair/proposal.service.ts:48:  legalName: string | null;
apps/api/src/repair/proposal.service.ts:49:  address: string | null;
apps/api/src/repair/proposal.service.ts:50:  city: string | null;
apps/api/src/repair/proposal.service.ts:51:  country: string | null;
apps/api/src/repair/proposal.service.ts:52:  phone: string | null;
apps/api/src/repair/proposal.service.ts:53:  email: string | null;
apps/api/src/repair/proposal.service.ts:54:  website: string | null;
apps/api/src/repair/proposal.service.ts:55:  taxIdentificationNumber: string | null;
apps/api/src/repair/proposal.service.ts:56:  vatRegistrationNumber: string | null;
apps/api/src/repair/proposal.service.ts:57:  documentFooter: string | null;
apps/api/src/repair/proposal.service.ts:58:}
apps/api/src/repair/proposal.service.ts:59:
apps/api/src/repair/proposal.service.ts:60:/** Who the document is addressed to. */
apps/api/src/repair/proposal.service.ts:61:export interface AddresseeIdentity {
apps/api/src/repair/proposal.service.ts:62:  name: string;
apps/api/src/repair/proposal.service.ts:63:  email: string | null;
apps/api/src/repair/proposal.service.ts:64:  phone: string | null;
apps/api/src/repair/proposal.service.ts:65:  location: string | null;
apps/api/src/repair/proposal.service.ts:66:}
apps/api/src/repair/proposal.service.ts:67:
apps/api/src/repair/proposal.service.ts:68:export interface ProposalPresentation {
apps/api/src/repair/proposal.service.ts:69:  /** §410 — what was reported. */
apps/api/src/repair/proposal.service.ts:70:  complaint: string;
apps/api/src/repair/proposal.service.ts:71:  /** §412 — what was inspected. */
apps/api/src/repair/proposal.service.ts:72:  inspectionSummary: string | null;
apps/api/src/repair/proposal.service.ts:73:  inspectionCheckedCount: number;
apps/api/src/repair/proposal.service.ts:74:  /** §414 — what was confirmed. */
apps/api/src/repair/proposal.service.ts:75:  confirmedFaults: Array<{ id: string; faultDescription: string; faultCode: string | null }>;
apps/api/src/repair/proposal.service.ts:76:  /**
apps/api/src/repair/proposal.service.ts:77:   * §416 — WHAT REMAINS SUSPECTED.
apps/api/src/repair/proposal.service.ts:78:   *
apps/api/src/repair/proposal.service.ts:79:   * The field most likely to be dropped and the one §416 names explicitly: a customer
apps/api/src/repair/proposal.service.ts:80:   * agreeing to a repair is entitled to know what the workshop has NOT established, or
apps/api/src/repair/proposal.service.ts:81:   * the first unexpected extra reads as incompetence rather than as a stated unknown.
apps/api/src/repair/proposal.service.ts:82:   */
apps/api/src/repair/proposal.service.ts:83:  suspectedFaults: Array<{ id: string; faultDescription: string; faultCode: string | null }>;
apps/api/src/repair/proposal.service.ts:84:  /** §418's proposed work — the approved plan's tasks. */
apps/api/src/repair/proposal.service.ts:85:  proposedWork: Array<{ id: string; title: string; estimatedLabourHours: number | null }>;
apps/api/src/repair/proposal.service.ts:86:  /** §418's proposed parts. */
apps/api/src/repair/proposal.service.ts:87:  proposedParts: Array<{ id: string; description: string; quantity: number; unitPrice: number }>;
apps/api/src/repair/proposal.service.ts:88:  /** §420 — how long it should take, summed from the plan. */
apps/api/src/repair/proposal.service.ts:89:  estimatedLabourHours: number;
apps/api/src/repair/proposal.service.ts:90:  /** §420 — what it will cost. */
apps/api/src/repair/proposal.service.ts:91:  currency: string;
apps/api/src/repair/proposal.service.ts:92:  recommendedTotal: number;
apps/api/src/repair/proposal.service.ts:93:  comprehensiveTotal: number;
apps/api/src/repair/proposal.service.ts:94:  /** §422 — what warranty applies. */
apps/api/src/repair/proposal.service.ts:95:  warrantyTerms: string | null;
apps/api/src/repair/proposal.service.ts:96:  completionConditions: string | null;
apps/api/src/repair/proposal.service.ts:97:  validUntil: string | null;
apps/api/src/repair/proposal.service.ts:98:  /** The letterhead — who is making this offer. */
apps/api/src/repair/proposal.service.ts:99:  issuer: IssuerIdentity;
apps/api/src/repair/proposal.service.ts:100:  /** The addressee — who it is made to. */
apps/api/src/repair/proposal.service.ts:101:  addressee: AddresseeIdentity;
apps/api/src/repair/proposal.service.ts:102:  /**
apps/api/src/repair/proposal.service.ts:103:   * The document's own reference.
apps/api/src/repair/proposal.service.ts:104:   *
apps/api/src/repair/proposal.service.ts:105:   * A commercial document a customer may quote back at the workshop needs an
apps/api/src/repair/proposal.service.ts:106:   * identifier that is short, human-readable and stable. Derived from the job number
apps/api/src/repair/proposal.service.ts:107:   * and the version rather than stored, because both are already immutable and a
apps/api/src/repair/proposal.service.ts:108:   * stored copy could only drift from them.
apps/api/src/repair/proposal.service.ts:109:   */
apps/api/src/repair/proposal.service.ts:110:  documentReference: string;
apps/api/src/repair/proposal.service.ts:111:  vehicleDescription: string;
apps/api/src/repair/proposal.service.ts:112:}
apps/api/src/repair/proposal.service.ts:113:
apps/api/src/repair/proposal.service.ts:114:export interface RepairProposal {
apps/api/src/repair/proposal.service.ts:115:  id: string;
apps/api/src/repair/proposal.service.ts:116:  jobCardId: string;
apps/api/src/repair/proposal.service.ts:117:  jobNumber: string;
apps/api/src/repair/proposal.service.ts:118:  registrationNumber: string;
apps/api/src/repair/proposal.service.ts:119:  customerName: string;
apps/api/src/repair/proposal.service.ts:120:  quotationId: string;
apps/api/src/repair/proposal.service.ts:121:  quotationAttemptNo: number;
apps/api/src/repair/proposal.service.ts:122:  versionNo: number;
apps/api/src/repair/proposal.service.ts:123:  status: ProposalStatus;
apps/api/src/repair/proposal.service.ts:124:  expectedResult: string | null;
apps/api/src/repair/proposal.service.ts:125:  riskAndLimitations: string | null;
apps/api/src/repair/proposal.service.ts:126:  uncertainties: string | null;
apps/api/src/repair/proposal.service.ts:127:  presentationNote: string | null;
apps/api/src/repair/proposal.service.ts:128:  issuedByName: string | null;
apps/api/src/repair/proposal.service.ts:129:  issuedAt: string | null;
apps/api/src/repair/proposal.service.ts:130:  decision: ProposalDecision | null;
apps/api/src/repair/proposal.service.ts:131:  approvedOption: ProposalOption | null;
apps/api/src/repair/proposal.service.ts:132:  decidedAt: string | null;
apps/api/src/repair/proposal.service.ts:133:  decidedByName: string | null;
apps/api/src/repair/proposal.service.ts:134:  decisionChannel: DecisionChannel | string | null;
apps/api/src/repair/proposal.service.ts:135:  decisionChannelLabel: string | null;
apps/api/src/repair/proposal.service.ts:136:  decisionNote: string | null;
apps/api/src/repair/proposal.service.ts:137:  recordedByName: string | null;
apps/api/src/repair/proposal.service.ts:138:  supersededBy: string | null;
apps/api/src/repair/proposal.service.ts:139:  presentation: ProposalPresentation;
apps/api/src/repair/proposal.service.ts:140:  /** §7 — the total the customer actually agreed to, once they have. */
apps/api/src/repair/proposal.service.ts:141:  agreedTotal: number | null;
apps/api/src/repair/proposal.service.ts:142:  editable: boolean;
apps/api/src/repair/proposal.service.ts:143:  issuable: boolean;
apps/api/src/repair/proposal.service.ts:144:  decidable: boolean;
apps/api/src/repair/proposal.service.ts:145:}
apps/api/src/repair/proposal.service.ts:146:
apps/api/src/repair/proposal.service.ts:147:interface NarrativeInput {
apps/api/src/repair/proposal.service.ts:148:  expectedResult?: string | null;
apps/api/src/repair/proposal.service.ts:149:  riskAndLimitations?: string | null;
apps/api/src/repair/proposal.service.ts:150:  uncertainties?: string | null;
apps/api/src/repair/proposal.service.ts:151:  presentationNote?: string | null;
apps/api/src/repair/proposal.service.ts:152:}
apps/api/src/repair/proposal.service.ts:153:
apps/api/src/repair/proposal.service.ts:154:/**
apps/api/src/repair/proposal.service.ts:155: * The customer proposal — `1.txt` §396-§424, `07.txt` §7.
apps/api/src/repair/proposal.service.ts:156: *
apps/api/src/repair/proposal.service.ts:157: * ── §424 IS THE WHOLE SLICE ────────────────────────────────────────────────
apps/api/src/repair/proposal.service.ts:158: *
apps/api/src/repair/proposal.service.ts:159: * "Approved proposals shall be immutable. A material change shall create a new
apps/api/src/repair/proposal.service.ts:160: * version requiring new approval." Everything here follows from that sentence:
apps/api/src/repair/proposal.service.ts:161: *
apps/api/src/repair/proposal.service.ts:162: *   · A decided proposal cannot be edited — in the service AND by trigger. The only
apps/api/src/repair/proposal.service.ts:163: *     writable field left on it is `superseded_by`, because recording the
apps/api/src/repair/proposal.service.ts:164: *     supersession would otherwise require breaking the immutability that makes
apps/api/src/repair/proposal.service.ts:165: *     versioning necessary in the first place.
apps/api/src/repair/proposal.service.ts:166: *   · `prepare()` on a card whose latest proposal is already decided creates
apps/api/src/repair/proposal.service.ts:167: *     VERSION n+1 and links the old row to it, rather than reopening anything.
apps/api/src/repair/proposal.service.ts:168: *   · An ISSUED proposal freezes too. A document that changes while the customer is
apps/api/src/repair/proposal.service.ts:169: *     reading it is a different offer from the one they say yes to.
apps/api/src/repair/proposal.service.ts:170: *
apps/api/src/repair/proposal.service.ts:171: * ── WHY THE PRESENTATION IS ASSEMBLED, NOT STORED ──────────────────────────
apps/api/src/repair/proposal.service.ts:172: *
apps/api/src/repair/proposal.service.ts:173: * §410-§422 lists twelve things the customer must see, and ten already exist in
apps/api/src/repair/proposal.service.ts:174: * records that are frozen before a proposal can be created. They are read at display
apps/api/src/repair/proposal.service.ts:175: * time from the exact quotation, plan, diagnosis and inspection the proposal names —
apps/api/src/repair/proposal.service.ts:176: * so the document is reproducible forever without a single copied field.
apps/api/src/repair/proposal.service.ts:177: */
apps/api/src/repair/proposal.service.ts:178:@Injectable()
apps/api/src/repair/proposal.service.ts:179:export class ProposalService {
apps/api/src/repair/proposal.service.ts:180:  constructor(
apps/api/src/repair/proposal.service.ts:181:    private readonly db: DatabaseService,
apps/api/src/repair/proposal.service.ts:182:    private readonly audit: AuditService,
apps/api/src/repair/proposal.service.ts:183:  ) {}
apps/api/src/repair/proposal.service.ts:184:
apps/api/src/repair/proposal.service.ts:185:  async listForJobCard(ctx: TenantContext, jobCardId: string): Promise<RepairProposal[]> {
apps/api/src/repair/proposal.service.ts:186:    this.assertMayRead(ctx);
apps/api/src/repair/proposal.service.ts:187:    const cardId = requireUuid(jobCardId, 'jobCardId');
apps/api/src/repair/proposal.service.ts:188:    return this.db.withTenant(ctx, async (client) => {
apps/api/src/repair/proposal.service.ts:189:      // 404 for a card this viewer cannot see, BEFORE any proposal is read.
apps/api/src/repair/proposal.service.ts:190:      await this.assertCardVisible(client, ctx, cardId);
apps/api/src/repair/proposal.service.ts:191:      return this.readProposals(client, ctx, { jobCardId: cardId });
apps/api/src/repair/proposal.service.ts:192:    });
apps/api/src/repair/proposal.service.ts:193:  }
apps/api/src/repair/proposal.service.ts:194:
apps/api/src/repair/proposal.service.ts:195:  async list(ctx: TenantContext): Promise<RepairProposal[]> {
apps/api/src/repair/proposal.service.ts:196:    this.assertMayRead(ctx);
apps/api/src/repair/proposal.service.ts:197:    return this.db.withTenant(ctx, (client) => this.readProposals(client, ctx, {}));
apps/api/src/repair/proposal.service.ts:198:  }
apps/api/src/repair/proposal.service.ts:199:
apps/api/src/repair/proposal.service.ts:200:  async findById(ctx: TenantContext, id: string): Promise<RepairProposal> {
apps/api/src/repair/proposal.service.ts:201:    this.assertMayRead(ctx);
apps/api/src/repair/proposal.service.ts:202:    const proposalId = requireUuid(id, 'id');
apps/api/src/repair/proposal.service.ts:203:    return this.db.withTenant(ctx, async (client) => {
apps/api/src/repair/proposal.service.ts:204:      const rows = await this.readProposals(client, ctx, { proposalId });
apps/api/src/repair/proposal.service.ts:205:      return ProposalService.one(rows);
apps/api/src/repair/proposal.service.ts:206:    });
apps/api/src/repair/proposal.service.ts:207:  }
apps/api/src/repair/proposal.service.ts:208:
apps/api/src/repair/proposal.service.ts:209:  /**
apps/api/src/repair/proposal.service.ts:210:   * Draft a proposal from the approved quotation — or, when the last one has been
apps/api/src/repair/proposal.service.ts:211:   * decided, §424's NEW VERSION of it.
apps/api/src/repair/proposal.service.ts:212:   */
apps/api/src/repair/proposal.service.ts:213:  async prepare(ctx: TenantContext, jobCardId: string): Promise<RepairProposal> {
apps/api/src/repair/proposal.service.ts:214:    this.assertMayPrepare(ctx);
apps/api/src/repair/proposal.service.ts:215:    const cardId = requireUuid(jobCardId, 'jobCardId');
apps/api/src/repair/proposal.service.ts:216:
apps/api/src/repair/proposal.service.ts:217:    return this.db.withTenant(ctx, async (client) => {
apps/api/src/repair/proposal.service.ts:218:      const card = await this.assertCardVisible(client, ctx, cardId, { lock: true });
apps/api/src/repair/proposal.service.ts:219:
apps/api/src/repair/proposal.service.ts:220:      if (!PROPOSAL_STAGES.includes(card.stage)) {
apps/api/src/repair/proposal.service.ts:221:        throw new BadRequestException(
apps/api/src/repair/proposal.service.ts:222:          `a proposal may only be prepared while the job card is at ` +
apps/api/src/repair/proposal.service.ts:223:            `${PROPOSAL_STAGES.map((s) => `'${s}'`).join(' or ')}; this card is at ` +
apps/api/src/repair/proposal.service.ts:224:            `'${card.stage}'. Move the card to '${PROPOSAL_STAGES[0]}' first.`,
apps/api/src/repair/proposal.service.ts:225:        );
apps/api/src/repair/proposal.service.ts:226:      }
apps/api/src/repair/proposal.service.ts:227:
apps/api/src/repair/proposal.service.ts:228:      // ── one UNDECIDED proposal at a time ─────────────────────────────────
apps/api/src/repair/proposal.service.ts:229:      const openRow = await client.query(
apps/api/src/repair/proposal.service.ts:230:        `SELECT id, status, version_no FROM repair.repair_proposals
apps/api/src/repair/proposal.service.ts:231:          WHERE job_card_id = $1 AND tenant_id = $2
apps/api/src/repair/proposal.service.ts:232:            AND status IN ('draft', 'issued')
apps/api/src/repair/proposal.service.ts:233:          ORDER BY version_no DESC LIMIT 1`,
apps/api/src/repair/proposal.service.ts:234:        [cardId, ctx.tenantId],
apps/api/src/repair/proposal.service.ts:235:      );
apps/api/src/repair/proposal.service.ts:236:      const open = openRow.rows[0] as { id: string; status: string; version_no: number } | undefined;
apps/api/src/repair/proposal.service.ts:237:      if (open) {
apps/api/src/repair/proposal.service.ts:238:        throw new ConflictException(
apps/api/src/repair/proposal.service.ts:239:          open.status === 'draft'
apps/api/src/repair/proposal.service.ts:240:            ? `version ${open.version_no} of this proposal is still a draft; issue it or finish it before starting another`
apps/api/src/repair/proposal.service.ts:241:            : `version ${open.version_no} is with the customer and has not been answered; ` +
apps/api/src/repair/proposal.service.ts:242:              'record their decision before issuing a new version',
apps/api/src/repair/proposal.service.ts:243:        );
apps/api/src/repair/proposal.service.ts:244:      }
apps/api/src/repair/proposal.service.ts:245:
apps/api/src/repair/proposal.service.ts:246:      // The version this one replaces, if any. §424: a material change creates a NEW
apps/api/src/repair/proposal.service.ts:247:      // version, so the previous decided row is marked superseded rather than edited.
apps/api/src/repair/proposal.service.ts:248:      const previousRow = await client.query(
apps/api/src/repair/proposal.service.ts:249:        `SELECT id, version_no, status FROM repair.repair_proposals
apps/api/src/repair/proposal.service.ts:250:          WHERE job_card_id = $1 AND tenant_id = $2
apps/api/src/repair/proposal.service.ts:251:          ORDER BY version_no DESC LIMIT 1`,
apps/api/src/repair/proposal.service.ts:252:        [cardId, ctx.tenantId],
apps/api/src/repair/proposal.service.ts:253:      );
apps/api/src/repair/proposal.service.ts:254:      const previous = previousRow.rows[0] as
apps/api/src/repair/proposal.service.ts:255:        | { id: string; version_no: number; status: string }
apps/api/src/repair/proposal.service.ts:256:        | undefined;
apps/api/src/repair/proposal.service.ts:257:
apps/api/src/repair/proposal.service.ts:258:      // ⚠️ AN APPROVED PROPOSAL IS NOT SUPERSEDED SILENTLY. Once a customer has
apps/api/src/repair/proposal.service.ts:259:      // agreed, replacing that agreement is a commercial act, and §7 says repair work
apps/api/src/repair/proposal.service.ts:260:      // shall not start until the required approval is received — so a new version
apps/api/src/repair/proposal.service.ts:261:      // must be a deliberate re-quote, not a side effect of pressing a button on a
apps/api/src/repair/proposal.service.ts:262:      // job that is already authorised.
apps/api/src/repair/proposal.service.ts:263:      if (previous?.status === 'approved') {
apps/api/src/repair/proposal.service.ts:264:        throw new ConflictException(
apps/api/src/repair/proposal.service.ts:265:          `version ${previous.version_no} has been APPROVED by the customer. A material ` +
apps/api/src/repair/proposal.service.ts:266:            'change needs a new quotation first, which is then proposed as a new version — ' +
apps/api/src/repair/proposal.service.ts:267:            'prepare a fresh quotation on the Quotations screen.',
apps/api/src/repair/proposal.service.ts:268:        );
apps/api/src/repair/proposal.service.ts:269:      }
apps/api/src/repair/proposal.service.ts:270:
apps/api/src/repair/proposal.service.ts:271:      const quotationRow = await client.query(
apps/api/src/repair/proposal.service.ts:272:        `SELECT id, attempt_no FROM repair.quotations
apps/api/src/repair/proposal.service.ts:273:          WHERE job_card_id = $1 AND tenant_id = $2 AND organization_id = $3
apps/api/src/repair/proposal.service.ts:274:            AND status = $4
apps/api/src/repair/proposal.service.ts:275:          ORDER BY attempt_no DESC LIMIT 1`,
apps/api/src/repair/proposal.service.ts:276:        [cardId, ctx.tenantId, ctx.organizationId, REQUIRED_QUOTATION_STATUS],
apps/api/src/repair/proposal.service.ts:277:      );
apps/api/src/repair/proposal.service.ts:278:      const quotation = quotationRow.rows[0] as { id: string; attempt_no: number } | undefined;
apps/api/src/repair/proposal.service.ts:279:      if (!quotation) {
apps/api/src/repair/proposal.service.ts:280:        // The refusal names a route that exists: the quotation queue is where a price
apps/api/src/repair/proposal.service.ts:281:        // is both prepared and internally approved.
apps/api/src/repair/proposal.service.ts:282:        throw new ConflictException(
apps/api/src/repair/proposal.service.ts:283:          'a proposal presents an APPROVED quotation, and this job card has none. ' +
apps/api/src/repair/proposal.service.ts:284:            'Prepare a quotation and have a manager approve it on the Quotations screen first.',
apps/api/src/repair/proposal.service.ts:285:        );
apps/api/src/repair/proposal.service.ts:286:      }
apps/api/src/repair/proposal.service.ts:287:
apps/api/src/repair/proposal.service.ts:288:      const nextVersion = (previous?.version_no ?? 0) + 1;
apps/api/src/repair/proposal.service.ts:289:
apps/api/src/repair/proposal.service.ts:290:      const inserted = await client.query(
apps/api/src/repair/proposal.service.ts:291:        `INSERT INTO repair.repair_proposals
apps/api/src/repair/proposal.service.ts:292:           (tenant_id, organization_id, job_card_id, quotation_id, version_no,
apps/api/src/repair/proposal.service.ts:293:            created_by, updated_by)
apps/api/src/repair/proposal.service.ts:294:         VALUES ($1,$2,$3,$4,$5,$6,$6)
apps/api/src/repair/proposal.service.ts:295:         RETURNING id`,
apps/api/src/repair/proposal.service.ts:296:        [ctx.tenantId, ctx.organizationId, cardId, quotation.id, nextVersion, ctx.userId],
apps/api/src/repair/proposal.service.ts:297:      );
apps/api/src/repair/proposal.service.ts:298:      const proposalId = inserted.rows[0].id as string;
apps/api/src/repair/proposal.service.ts:299:
apps/api/src/repair/proposal.service.ts:300:      // Link the version it replaces. Done AFTER the insert because the new id is what
apps/api/src/repair/proposal.service.ts:301:      // the old row points at, and the trigger permits exactly this one write on a
apps/api/src/repair/proposal.service.ts:302:      // decided row.
apps/api/src/repair/proposal.service.ts:303:      if (previous && previous.status !== 'superseded') {
apps/api/src/repair/proposal.service.ts:304:        await client.query(
apps/api/src/repair/proposal.service.ts:305:          `UPDATE repair.repair_proposals
apps/api/src/repair/proposal.service.ts:306:              SET superseded_by = $1, status = 'superseded', updated_at = now(), updated_by = $2
apps/api/src/repair/proposal.service.ts:307:            WHERE id = $3 AND tenant_id = $4`,
apps/api/src/repair/proposal.service.ts:308:          [proposalId, ctx.userId, previous.id, ctx.tenantId],
apps/api/src/repair/proposal.service.ts:309:        );
apps/api/src/repair/proposal.service.ts:310:      }
apps/api/src/repair/proposal.service.ts:311:
apps/api/src/repair/proposal.service.ts:312:      await this.audit.write(client, ctx, {
apps/api/src/repair/proposal.service.ts:313:        action: 'proposal.prepared',
apps/api/src/repair/proposal.service.ts:314:        resourceType: 'proposal',
apps/api/src/repair/proposal.service.ts:315:        resourceId: proposalId,
apps/api/src/repair/proposal.service.ts:316:        detail: {
apps/api/src/repair/proposal.service.ts:317:          jobNumber: card.job_number,
apps/api/src/repair/proposal.service.ts:318:          versionNo: nextVersion,
apps/api/src/repair/proposal.service.ts:319:          quotationAttemptNo: quotation.attempt_no,
apps/api/src/repair/proposal.service.ts:320:          supersedes: previous?.version_no ?? null,
apps/api/src/repair/proposal.service.ts:321:        },
apps/api/src/repair/proposal.service.ts:322:      });
apps/api/src/repair/proposal.service.ts:323:
apps/api/src/repair/proposal.service.ts:324:      const rows = await this.readProposals(client, ctx, { proposalId });
apps/api/src/repair/proposal.service.ts:325:      return ProposalService.one(rows);
apps/api/src/repair/proposal.service.ts:326:    });
apps/api/src/repair/proposal.service.ts:327:  }
apps/api/src/repair/proposal.service.ts:328:
apps/api/src/repair/proposal.service.ts:329:  /** §418's expected result, §422's risks and uncertainties. */
apps/api/src/repair/proposal.service.ts:330:  async recordNarrative(
apps/api/src/repair/proposal.service.ts:331:    ctx: TenantContext,
apps/api/src/repair/proposal.service.ts:332:    proposalId: string,
apps/api/src/repair/proposal.service.ts:333:    input: NarrativeInput,
apps/api/src/repair/proposal.service.ts:334:  ): Promise<RepairProposal> {
apps/api/src/repair/proposal.service.ts:335:    this.assertMayPrepare(ctx);
apps/api/src/repair/proposal.service.ts:336:    const id = requireUuid(proposalId, 'id');
apps/api/src/repair/proposal.service.ts:337:
apps/api/src/repair/proposal.service.ts:338:    const sets: string[] = [];
apps/api/src/repair/proposal.service.ts:339:    const values: unknown[] = [];
apps/api/src/repair/proposal.service.ts:340:    const set = (column: string, value: unknown): void => {
apps/api/src/repair/proposal.service.ts:341:      values.push(value);
apps/api/src/repair/proposal.service.ts:342:      sets.push(`${column} = $${values.length}`);
apps/api/src/repair/proposal.service.ts:343:    };
apps/api/src/repair/proposal.service.ts:344:
apps/api/src/repair/proposal.service.ts:345:    // Column names come from these literals and NEVER from the request.
apps/api/src/repair/proposal.service.ts:346:    this.nullableText(set, 'expected_result', input.expectedResult, 'expectedResult', 8000);
apps/api/src/repair/proposal.service.ts:347:    this.nullableText(set, 'risk_and_limitations', input.riskAndLimitations, 'riskAndLimitations', 8000);
apps/api/src/repair/proposal.service.ts:348:    this.nullableText(set, 'uncertainties', input.uncertainties, 'uncertainties', 8000);
apps/api/src/repair/proposal.service.ts:349:    this.nullableText(set, 'presentation_note', input.presentationNote, 'presentationNote', 8000);
apps/api/src/repair/proposal.service.ts:350:
apps/api/src/repair/proposal.service.ts:351:    if (sets.length === 0) throw new BadRequestException('nothing to update');
apps/api/src/repair/proposal.service.ts:352:    set('updated_by', ctx.userId);
apps/api/src/repair/proposal.service.ts:353:    sets.push('updated_at = now()');
apps/api/src/repair/proposal.service.ts:354:
apps/api/src/repair/proposal.service.ts:355:    values.push(id, ctx.tenantId);
apps/api/src/repair/proposal.service.ts:356:    const sql = `UPDATE repair.repair_proposals SET ${sets.join(', ')}
apps/api/src/repair/proposal.service.ts:357:                  WHERE id = $${values.length - 1} AND tenant_id = $${values.length}`;
apps/api/src/repair/proposal.service.ts:358:
apps/api/src/repair/proposal.service.ts:359:    return this.db.withTenant(ctx, async (client) => {
apps/api/src/repair/proposal.service.ts:360:      const proposal = await this.assertDraft(client, ctx, id);
apps/api/src/repair/proposal.service.ts:361:      await client.query(sql, values);
apps/api/src/repair/proposal.service.ts:362:      await this.audit.write(client, ctx, {
apps/api/src/repair/proposal.service.ts:363:        action: 'proposal.narrative_recorded',
apps/api/src/repair/proposal.service.ts:364:        resourceType: 'proposal',
apps/api/src/repair/proposal.service.ts:365:        resourceId: id,
apps/api/src/repair/proposal.service.ts:366:        detail: { jobNumber: proposal.job_number, versionNo: proposal.version_no },
apps/api/src/repair/proposal.service.ts:367:      });
apps/api/src/repair/proposal.service.ts:368:      const rows = await this.readProposals(client, ctx, { proposalId: id });
apps/api/src/repair/proposal.service.ts:369:      return ProposalService.one(rows);
apps/api/src/repair/proposal.service.ts:370:    });
apps/api/src/repair/proposal.service.ts:371:  }
apps/api/src/repair/proposal.service.ts:372:
apps/api/src/repair/proposal.service.ts:373:  /**
apps/api/src/repair/proposal.service.ts:374:   * Put the proposal in front of the customer.
apps/api/src/repair/proposal.service.ts:375:   *
apps/api/src/repair/proposal.service.ts:376:   * ⚠️ THE GATE IS §418, NOT A FORMALITY. A proposal that does not say what the work
apps/api/src/repair/proposal.service.ts:377:   * should ACHIEVE is a price with no promise attached, and it is the one thing on
apps/api/src/repair/proposal.service.ts:378:   * §410-§422's list that no other record can supply — the complaint, the findings,
apps/api/src/repair/proposal.service.ts:379:   * the tasks and the totals are all read from frozen sources, but "what this will fix
apps/api/src/repair/proposal.service.ts:380:   * for you" exists nowhere until somebody writes it.
apps/api/src/repair/proposal.service.ts:381:   */
apps/api/src/repair/proposal.service.ts:382:  async issue(ctx: TenantContext, proposalId: string): Promise<RepairProposal> {
apps/api/src/repair/proposal.service.ts:383:    this.assertMayPrepare(ctx);
apps/api/src/repair/proposal.service.ts:384:    const id = requireUuid(proposalId, 'id');
apps/api/src/repair/proposal.service.ts:385:
apps/api/src/repair/proposal.service.ts:386:    return this.db.withTenant(ctx, async (client) => {
apps/api/src/repair/proposal.service.ts:387:      const proposal = await this.assertDraft(client, ctx, id);
apps/api/src/repair/proposal.service.ts:388:
apps/api/src/repair/proposal.service.ts:389:      const current = ProposalService.one(await this.readProposals(client, ctx, { proposalId: id }));
apps/api/src/repair/proposal.service.ts:390:      if (current.expectedResult === null) {
apps/api/src/repair/proposal.service.ts:391:        throw new BadRequestException(
apps/api/src/repair/proposal.service.ts:392:          'a proposal cannot be issued without saying what the work should achieve (§418). ' +
apps/api/src/repair/proposal.service.ts:393:            'Record the expected result first.',
apps/api/src/repair/proposal.service.ts:394:        );
apps/api/src/repair/proposal.service.ts:395:      }
apps/api/src/repair/proposal.service.ts:396:
apps/api/src/repair/proposal.service.ts:397:      await client.query(
apps/api/src/repair/proposal.service.ts:398:        `UPDATE repair.repair_proposals
apps/api/src/repair/proposal.service.ts:399:            SET status = 'issued', issued_by = $1, issued_at = now(),
apps/api/src/repair/proposal.service.ts:400:                updated_at = now(), updated_by = $1
apps/api/src/repair/proposal.service.ts:401:          WHERE id = $2 AND tenant_id = $3`,
apps/api/src/repair/proposal.service.ts:402:        [ctx.userId, id, ctx.tenantId],
apps/api/src/repair/proposal.service.ts:403:      );
apps/api/src/repair/proposal.service.ts:404:
apps/api/src/repair/proposal.service.ts:405:      await this.audit.write(client, ctx, {
apps/api/src/repair/proposal.service.ts:406:        action: 'proposal.issued',
apps/api/src/repair/proposal.service.ts:407:        resourceType: 'proposal',
apps/api/src/repair/proposal.service.ts:408:        resourceId: id,
apps/api/src/repair/proposal.service.ts:409:        // The money the customer is being shown, so the trail records the offer as
apps/api/src/repair/proposal.service.ts:410:        // made rather than only that an offer happened.
apps/api/src/repair/proposal.service.ts:411:        detail: {
apps/api/src/repair/proposal.service.ts:412:          jobNumber: proposal.job_number,
apps/api/src/repair/proposal.service.ts:413:          versionNo: proposal.version_no,
apps/api/src/repair/proposal.service.ts:414:          currency: current.presentation.currency,
apps/api/src/repair/proposal.service.ts:415:          recommendedTotal: current.presentation.recommendedTotal,
apps/api/src/repair/proposal.service.ts:416:          comprehensiveTotal: current.presentation.comprehensiveTotal,
apps/api/src/repair/proposal.service.ts:417:          suspectedFaultsDisclosed: current.presentation.suspectedFaults.length,
apps/api/src/repair/proposal.service.ts:418:        },
apps/api/src/repair/proposal.service.ts:419:      });
apps/api/src/repair/proposal.service.ts:420:
apps/api/src/repair/proposal.service.ts:421:      const rows = await this.readProposals(client, ctx, { proposalId: id });
apps/api/src/repair/proposal.service.ts:422:      return ProposalService.one(rows);
apps/api/src/repair/proposal.service.ts:423:    });
apps/api/src/repair/proposal.service.ts:424:  }
apps/api/src/repair/proposal.service.ts:425:
apps/api/src/repair/proposal.service.ts:426:  /**
apps/api/src/repair/proposal.service.ts:427:   * §7 — record the customer's answer.
apps/api/src/repair/proposal.service.ts:428:   *
apps/api/src/repair/proposal.service.ts:429:   * ── THE ATTRIBUTION IS THE RECORD ──────────────────────────────────────────
apps/api/src/repair/proposal.service.ts:430:   *
apps/api/src/repair/proposal.service.ts:431:   * `decidedByName` is the CUSTOMER and is mandatory; `recorded_by` is the staff
apps/api/src/repair/proposal.service.ts:432:   * member who captured it, taken from the session and never from the request. Those
apps/api/src/repair/proposal.service.ts:433:   * are two different facts, and an approval that conflates them cannot answer "who
apps/api/src/repair/proposal.service.ts:434:   * agreed to this" when a customer later says they did not.
apps/api/src/repair/proposal.service.ts:435:   *
apps/api/src/repair/proposal.service.ts:436:   * The channel is mandatory too. §7 offers telephone and video consultation, so a
apps/api/src/repair/proposal.service.ts:437:   * decision frequently arrives off-system — and "approved" with no channel is an
apps/api/src/repair/proposal.service.ts:438:   * assertion rather than a record.
apps/api/src/repair/proposal.service.ts:439:   */
apps/api/src/repair/proposal.service.ts:440:  async recordDecision(
apps/api/src/repair/proposal.service.ts:441:    ctx: TenantContext,
apps/api/src/repair/proposal.service.ts:442:    proposalId: string,
apps/api/src/repair/proposal.service.ts:443:    input: {
apps/api/src/repair/proposal.service.ts:444:      decision?: string;
apps/api/src/repair/proposal.service.ts:445:      approvedOption?: string;
apps/api/src/repair/proposal.service.ts:446:      decidedByName?: string;
apps/api/src/repair/proposal.service.ts:447:      decisionChannel?: string;
apps/api/src/repair/proposal.service.ts:448:      note?: string;
apps/api/src/repair/proposal.service.ts:449:    },
apps/api/src/repair/proposal.service.ts:450:  ): Promise<RepairProposal> {
apps/api/src/repair/proposal.service.ts:451:    this.assertMayRecordDecision(ctx);
apps/api/src/repair/proposal.service.ts:452:    const id = requireUuid(proposalId, 'id');
apps/api/src/repair/proposal.service.ts:453:    const decision: ProposalDecision = requireOneOf(input.decision, PROPOSAL_DECISIONS, 'decision');
apps/api/src/repair/proposal.service.ts:454:    const channel: DecisionChannel = requireOneOf(
apps/api/src/repair/proposal.service.ts:455:      input.decisionChannel, DECISION_CHANNELS, 'decisionChannel',
apps/api/src/repair/proposal.service.ts:456:    );
apps/api/src/repair/proposal.service.ts:457:    const decidedByName = requireText(input.decidedByName, 'decidedByName', 300);
apps/api/src/repair/proposal.service.ts:458:    const note = optionalText(input.note, 'note', 8000);
apps/api/src/repair/proposal.service.ts:459:
apps/api/src/repair/proposal.service.ts:460:    // §7's five "request" actions all arrive as `changes_requested`, and the note is
apps/api/src/repair/proposal.service.ts:461:    // what says which. A decline with no reason leaves the workshop nothing to act on.
apps/api/src/repair/proposal.service.ts:462:    if (decision !== 'approved' && note === null) {
apps/api/src/repair/proposal.service.ts:463:      throw new BadRequestException(
apps/api/src/repair/proposal.service.ts:464:        decision === 'declined'
apps/api/src/repair/proposal.service.ts:465:          ? 'a declined proposal must record why; note is required'
apps/api/src/repair/proposal.service.ts:466:          : 'say what the customer asked to change, or what they want explained; note is required',
apps/api/src/repair/proposal.service.ts:467:      );
apps/api/src/repair/proposal.service.ts:468:    }
apps/api/src/repair/proposal.service.ts:469:
apps/api/src/repair/proposal.service.ts:470:    const approvedOption: ProposalOption | null =
apps/api/src/repair/proposal.service.ts:471:      decision === 'approved'
apps/api/src/repair/proposal.service.ts:472:        ? requireOneOf(input.approvedOption, PROPOSAL_OPTIONS, 'approvedOption')
apps/api/src/repair/proposal.service.ts:473:        : null;
apps/api/src/repair/proposal.service.ts:474:
apps/api/src/repair/proposal.service.ts:475:    return this.db.withTenant(ctx, async (client) => {
apps/api/src/repair/proposal.service.ts:476:      const found = await client.query(
apps/api/src/repair/proposal.service.ts:477:        `SELECT p.id, p.status, p.version_no, j.job_number, p.superseded_by
apps/api/src/repair/proposal.service.ts:478:           FROM repair.repair_proposals p
apps/api/src/repair/proposal.service.ts:479:           JOIN repair.job_cards j ON j.id = p.job_card_id AND j.tenant_id = p.tenant_id
apps/api/src/repair/proposal.service.ts:480:          WHERE p.id = $1 AND p.tenant_id = $2 AND p.organization_id = $3
apps/api/src/repair/proposal.service.ts:481:          -- Serialises two people recording an answer to the same proposal, so the
apps/api/src/repair/proposal.service.ts:482:          -- second reads the status the first committed.
apps/api/src/repair/proposal.service.ts:483:          FOR UPDATE OF p`,
apps/api/src/repair/proposal.service.ts:484:        [id, ctx.tenantId, ctx.organizationId],
apps/api/src/repair/proposal.service.ts:485:      );
apps/api/src/repair/proposal.service.ts:486:      const row = found.rows[0] as
apps/api/src/repair/proposal.service.ts:487:        | {
apps/api/src/repair/proposal.service.ts:488:            id: string;
apps/api/src/repair/proposal.service.ts:489:            status: ProposalStatus;
apps/api/src/repair/proposal.service.ts:490:            version_no: number;
apps/api/src/repair/proposal.service.ts:491:            job_number: string;
apps/api/src/repair/proposal.service.ts:492:            superseded_by: string | null;
apps/api/src/repair/proposal.service.ts:493:          }
apps/api/src/repair/proposal.service.ts:494:        | undefined;
apps/api/src/repair/proposal.service.ts:495:      // 404, not 403 — the non-oracle rule this codebase holds everywhere.
apps/api/src/repair/proposal.service.ts:496:      if (!row) throw new NotFoundException('proposal not found');
apps/api/src/repair/proposal.service.ts:497:
apps/api/src/repair/proposal.service.ts:498:      if (row.status === 'draft') {
apps/api/src/repair/proposal.service.ts:499:        throw new ConflictException(
apps/api/src/repair/proposal.service.ts:500:          'this proposal has not been issued to the customer yet, so there is no decision to record',
apps/api/src/repair/proposal.service.ts:501:        );
apps/api/src/repair/proposal.service.ts:502:      }
apps/api/src/repair/proposal.service.ts:503:      // 🔴 THE SAME CHECK AS THE CUSTOMER ROUTE, and it belongs on BOTH.
apps/api/src/repair/proposal.service.ts:504:      //
apps/api/src/repair/proposal.service.ts:505:      // `!== null`, deliberately: an `undefined` — which is what a query that
apps/api/src/repair/proposal.service.ts:506:      // stopped selecting this column would yield — REFUSES the decision rather
apps/api/src/repair/proposal.service.ts:507:      // than waving it through. A loose `!= null` would read a broken query as
apps/api/src/repair/proposal.service.ts:508:      // "not superseded" and silently restore the hole this closes.
apps/api/src/repair/proposal.service.ts:509:      //
apps/api/src/repair/proposal.service.ts:510:      // §424 makes an approved proposal immutable and a material change a NEW
apps/api/src/repair/proposal.service.ts:511:      // version; recording an answer against a version that has already been
apps/api/src/repair/proposal.service.ts:512:      // replaced authorises work against the wrong document and against the
apps/api/src/repair/proposal.service.ts:513:      // wrong price. Status alone does not catch it — a superseded row can still
apps/api/src/repair/proposal.service.ts:514:      // read `issued`. (Codex, 2026-08-04.)
apps/api/src/repair/proposal.service.ts:515:      if (row.superseded_by !== null) {
apps/api/src/repair/proposal.service.ts:516:        throw new ConflictException(
apps/api/src/repair/proposal.service.ts:517:          `version ${row.version_no} has been superseded by a newer proposal; §424 requires ` +
apps/api/src/repair/proposal.service.ts:518:            'the answer to be recorded against the current version',
apps/api/src/repair/proposal.service.ts:519:        );
apps/api/src/repair/proposal.service.ts:520:      }
apps/api/src/repair/proposal.service.ts:521:
apps/api/src/repair/proposal.service.ts:522:      if (row.status !== 'issued') {
apps/api/src/repair/proposal.service.ts:523:        throw new ConflictException(
apps/api/src/repair/proposal.service.ts:524:          `version ${row.version_no} was already ${row.status}; §424 requires a new version ` +
apps/api/src/repair/proposal.service.ts:525:            'for a material change, and a further answer belongs to that version',
apps/api/src/repair/proposal.service.ts:526:        );
apps/api/src/repair/proposal.service.ts:527:      }
apps/api/src/repair/proposal.service.ts:528:
apps/api/src/repair/proposal.service.ts:529:      await client.query(
apps/api/src/repair/proposal.service.ts:530:        `UPDATE repair.repair_proposals
apps/api/src/repair/proposal.service.ts:531:            SET status = $1, decision = $1, approved_option = $2,
apps/api/src/repair/proposal.service.ts:532:                decided_at = now(), decided_by_name = $3, decision_channel = $4,
apps/api/src/repair/proposal.service.ts:533:                decision_note = $5, recorded_by = $6,
apps/api/src/repair/proposal.service.ts:534:                updated_at = now(), updated_by = $6
apps/api/src/repair/proposal.service.ts:535:          WHERE id = $7 AND tenant_id = $8`,
apps/api/src/repair/proposal.service.ts:536:        [decision, approvedOption, decidedByName, channel, note, ctx.userId, id, ctx.tenantId],
apps/api/src/repair/proposal.service.ts:537:      );
apps/api/src/repair/proposal.service.ts:538:
apps/api/src/repair/proposal.service.ts:539:      await this.audit.write(client, ctx, {
apps/api/src/repair/proposal.service.ts:540:        action:
apps/api/src/repair/proposal.service.ts:541:          decision === 'approved'
apps/api/src/repair/proposal.service.ts:542:            ? 'proposal.approved_by_customer'
apps/api/src/repair/proposal.service.ts:543:            : decision === 'declined'
apps/api/src/repair/proposal.service.ts:544:              ? 'proposal.declined_by_customer'
apps/api/src/repair/proposal.service.ts:545:              : 'proposal.changes_requested',
apps/api/src/repair/proposal.service.ts:546:        resourceType: 'proposal',
apps/api/src/repair/proposal.service.ts:547:        resourceId: id,
apps/api/src/repair/proposal.service.ts:548:        // The channel and the option, never the customer's free text. This is the
apps/api/src/repair/proposal.service.ts:549:        // entry a dispute over authorisation is settled from.
apps/api/src/repair/proposal.service.ts:550:        detail: {
apps/api/src/repair/proposal.service.ts:551:          jobNumber: row.job_number,
apps/api/src/repair/proposal.service.ts:552:          versionNo: row.version_no,
apps/api/src/repair/proposal.service.ts:553:          decision,
apps/api/src/repair/proposal.service.ts:554:          approvedOption,
apps/api/src/repair/proposal.service.ts:555:          channel,
apps/api/src/repair/proposal.service.ts:556:        },
apps/api/src/repair/proposal.service.ts:557:      });
apps/api/src/repair/proposal.service.ts:558:
apps/api/src/repair/proposal.service.ts:559:      const rows = await this.readProposals(client, ctx, { proposalId: id });
apps/api/src/repair/proposal.service.ts:560:      return ProposalService.one(rows);
apps/api/src/repair/proposal.service.ts:561:    });
apps/api/src/repair/proposal.service.ts:562:  }
apps/api/src/repair/proposal.service.ts:563:
apps/api/src/repair/proposal.service.ts:564:
apps/api/src/repair/proposal.service.ts:565:  /**
apps/api/src/repair/proposal.service.ts:566:   * §7 — the customer records their OWN answer, from the customer workspace.
apps/api/src/repair/proposal.service.ts:567:   *
apps/api/src/repair/proposal.service.ts:568:   * ── WHY THIS IS A SEPARATE ROUTE AND NOT A FLAG ON `recordDecision` ────────
apps/api/src/repair/proposal.service.ts:569:   *
apps/api/src/repair/proposal.service.ts:570:   * `recordDecision` is written for STAFF CAPTURE: a customer answers by phone,
apps/api/src/repair/proposal.service.ts:571:   * a staff member types it in, and the record keeps those two people apart —
apps/api/src/repair/proposal.service.ts:572:   * `decided_by_name` is the customer, `recorded_by` is whoever took the call.
apps/api/src/repair/proposal.service.ts:573:   * That separation is the entire evidential value of the row.
apps/api/src/repair/proposal.service.ts:574:   *
apps/api/src/repair/proposal.service.ts:575:   * When the customer decides in the portal there is no intermediary, and three
apps/api/src/repair/proposal.service.ts:576:   * of that method's inputs stop being inputs at all:
apps/api/src/repair/proposal.service.ts:577:   *
apps/api/src/repair/proposal.service.ts:578:   *   · `decidedByName`   — IS the session. Accepting it from the body would let
apps/api/src/repair/proposal.service.ts:579:   *                         a customer approve under somebody else's name, which
apps/api/src/repair/proposal.service.ts:580:   *                         is the confused-deputy shape `1.txt` §9 forbids.
apps/api/src/repair/proposal.service.ts:581:   *   · `decisionChannel` — is `customer_portal` by construction. Taking it from
apps/api/src/repair/proposal.service.ts:582:   *                         the request would let the strongest form of approval
apps/api/src/repair/proposal.service.ts:583:   *                         be filed as a phone call nobody can check.
apps/api/src/repair/proposal.service.ts:584:   *   · `recorded_by`     — is the customer themselves.
apps/api/src/repair/proposal.service.ts:585:   *
apps/api/src/repair/proposal.service.ts:586:   * A boolean on the existing method would have left all three settable and
apps/api/src/repair/proposal.service.ts:587:   * relied on a caller passing the right combination. These are DERIVED here,
apps/api/src/repair/proposal.service.ts:588:   * so there is no combination to get wrong.
apps/api/src/repair/proposal.service.ts:589:   *
apps/api/src/repair/proposal.service.ts:590:   * ⚠️ THE ROLE CHECK IS NOT THE SCOPE CHECK. `CAN_DECIDE_AS_CUSTOMER` says a
apps/api/src/repair/proposal.service.ts:591:   * customer may use this route; `assertCardVisible` with the `c.user_id`
apps/api/src/repair/proposal.service.ts:592:   * predicate is what stops them deciding on somebody else's proposal. Both are
apps/api/src/repair/proposal.service.ts:593:   * required, and RLS is under both.
apps/api/src/repair/proposal.service.ts:594:   */
apps/api/src/repair/proposal.service.ts:595:  async recordCustomerDecision(
apps/api/src/repair/proposal.service.ts:596:    ctx: TenantContext,
apps/api/src/repair/proposal.service.ts:597:    proposalId: string,
apps/api/src/repair/proposal.service.ts:598:    input: { decision?: string; approvedOption?: string; note?: string },
apps/api/src/repair/proposal.service.ts:599:  ): Promise<RepairProposal> {
apps/api/src/repair/proposal.service.ts:600:    if (!CAN_DECIDE_AS_CUSTOMER.has(ctx.activeRole)) {
apps/api/src/repair/proposal.service.ts:601:      throw new ForbiddenException(
apps/api/src/repair/proposal.service.ts:602:        `role '${ctx.activeRole}' may not decide as the customer; staff use POST /proposals/:id/decision`,
apps/api/src/repair/proposal.service.ts:603:      );
apps/api/src/repair/proposal.service.ts:604:    }
apps/api/src/repair/proposal.service.ts:605:    const id = requireUuid(proposalId, 'id');
apps/api/src/repair/proposal.service.ts:606:    const decision: ProposalDecision = requireOneOf(input.decision, PROPOSAL_DECISIONS, 'decision');
apps/api/src/repair/proposal.service.ts:607:    const note = optionalText(input.note, 'note', 8000);
apps/api/src/repair/proposal.service.ts:608:
apps/api/src/repair/proposal.service.ts:609:    // Identical rule to the staff route, deliberately restated rather than
apps/api/src/repair/proposal.service.ts:610:    // relaxed: a refusal with no reason leaves the workshop nothing to act on,
apps/api/src/repair/proposal.service.ts:611:    // and it is no less true because the customer typed it themselves.
apps/api/src/repair/proposal.service.ts:612:    if (decision !== 'approved' && note === null) {
apps/api/src/repair/proposal.service.ts:613:      throw new BadRequestException(
apps/api/src/repair/proposal.service.ts:614:        decision === 'declined'
apps/api/src/repair/proposal.service.ts:615:          ? 'a declined proposal must record why; note is required'
apps/api/src/repair/proposal.service.ts:616:          : 'say what you would like changed or explained; note is required',
apps/api/src/repair/proposal.service.ts:617:      );
apps/api/src/repair/proposal.service.ts:618:    }
apps/api/src/repair/proposal.service.ts:619:
apps/api/src/repair/proposal.service.ts:620:    const approvedOption: ProposalOption | null =
apps/api/src/repair/proposal.service.ts:621:      decision === 'approved'
apps/api/src/repair/proposal.service.ts:622:        ? requireOneOf(input.approvedOption, PROPOSAL_OPTIONS, 'approvedOption')
apps/api/src/repair/proposal.service.ts:623:        : null;
apps/api/src/repair/proposal.service.ts:624:
apps/api/src/repair/proposal.service.ts:625:    return this.db.withTenant(ctx, async (client) => {
apps/api/src/repair/proposal.service.ts:626:      // The proposal, its card, and the customer's OWN name — all in one read,
apps/api/src/repair/proposal.service.ts:627:      // and all constrained to a card this customer owns. `c.user_id` is the
apps/api/src/repair/proposal.service.ts:628:      // scope; `c.display_name` is the attribution, taken from the customer
apps/api/src/repair/proposal.service.ts:629:      // record rather than from the request.
apps/api/src/repair/proposal.service.ts:630:      const found = await client.query(
apps/api/src/repair/proposal.service.ts:631:        `SELECT p.id, p.status, p.version_no, j.job_number, c.display_name,
apps/api/src/repair/proposal.service.ts:632:                p.superseded_by
apps/api/src/repair/proposal.service.ts:633:           FROM repair.repair_proposals p
apps/api/src/repair/proposal.service.ts:634:           JOIN repair.job_cards j ON j.id = p.job_card_id AND j.tenant_id = p.tenant_id
apps/api/src/repair/proposal.service.ts:635:           JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
apps/api/src/repair/proposal.service.ts:636:          WHERE p.id = $1 AND p.tenant_id = $2 AND p.organization_id = $3
apps/api/src/repair/proposal.service.ts:637:            AND c.user_id = $4
apps/api/src/repair/proposal.service.ts:638:          FOR UPDATE OF p`,
apps/api/src/repair/proposal.service.ts:639:        [id, ctx.tenantId, ctx.organizationId, ctx.userId],
apps/api/src/repair/proposal.service.ts:640:      );
apps/api/src/repair/proposal.service.ts:641:      const row = found.rows[0] as
apps/api/src/repair/proposal.service.ts:642:        | {
apps/api/src/repair/proposal.service.ts:643:            id: string;
apps/api/src/repair/proposal.service.ts:644:            status: ProposalStatus;
apps/api/src/repair/proposal.service.ts:645:            version_no: number;
apps/api/src/repair/proposal.service.ts:646:            job_number: string;
apps/api/src/repair/proposal.service.ts:647:            display_name: string;
apps/api/src/repair/proposal.service.ts:648:            superseded_by: string | null;
apps/api/src/repair/proposal.service.ts:649:          }
apps/api/src/repair/proposal.service.ts:650:        | undefined;
apps/api/src/repair/proposal.service.ts:651:      // 404, not 403 — the non-oracle rule this codebase holds everywhere. A
apps/api/src/repair/proposal.service.ts:652:      // customer must not be able to learn that somebody else's proposal exists.
apps/api/src/repair/proposal.service.ts:653:      if (!row) throw new NotFoundException('proposal not found');
apps/api/src/repair/proposal.service.ts:654:
apps/api/src/repair/proposal.service.ts:655:      if (row.status === 'draft') {
apps/api/src/repair/proposal.service.ts:656:        throw new ConflictException(
apps/api/src/repair/proposal.service.ts:657:          'this proposal has not been sent to you yet, so there is nothing to answer',
apps/api/src/repair/proposal.service.ts:658:        );
apps/api/src/repair/proposal.service.ts:659:      }
apps/api/src/repair/proposal.service.ts:660:      if (row.status !== 'issued') {
apps/api/src/repair/proposal.service.ts:661:        throw new ConflictException(
apps/api/src/repair/proposal.service.ts:662:          `you already answered version ${row.version_no} (${row.status}). If something has ` +
apps/api/src/repair/proposal.service.ts:663:            'changed, ask the workshop to send a revised proposal',
apps/api/src/repair/proposal.service.ts:664:        );
apps/api/src/repair/proposal.service.ts:665:      }
apps/api/src/repair/proposal.service.ts:666:
apps/api/src/repair/proposal.service.ts:667:      // 🔴 THE CONTROL, not the affordance. `decidable` hides a superseded
apps/api/src/repair/proposal.service.ts:668:      // version from the screen; this is what makes hiding it irrelevant.
apps/api/src/repair/proposal.service.ts:669:      // `decidable` is documented as a UI convenience and CLAUDE.md §8 is
apps/api/src/repair/proposal.service.ts:670:      // explicit that hidden is not secure — a caller can POST whatever id they
apps/api/src/repair/proposal.service.ts:671:      // like, and without this line they could answer a document the workshop
apps/api/src/repair/proposal.service.ts:672:      // has already replaced, binding the workshop to a superseded price.
apps/api/src/repair/proposal.service.ts:673:      //
apps/api/src/repair/proposal.service.ts:674:      // `prepare()` will not supersede a proposal that is still with the
apps/api/src/repair/proposal.service.ts:675:      // customer, so the real flow cannot produce this pair. That is an argument
apps/api/src/repair/proposal.service.ts:676:      // for the check being cheap, not for omitting it. (Codex, 2026-08-04.)
apps/api/src/repair/proposal.service.ts:677:      if (row.superseded_by !== null) {
apps/api/src/repair/proposal.service.ts:678:        throw new ConflictException(
apps/api/src/repair/proposal.service.ts:679:          `version ${row.version_no} has been replaced by a newer proposal. ` +
apps/api/src/repair/proposal.service.ts:680:            'Please answer the current one instead',
apps/api/src/repair/proposal.service.ts:681:        );
apps/api/src/repair/proposal.service.ts:682:      }
apps/api/src/repair/proposal.service.ts:683:
apps/api/src/repair/proposal.service.ts:684:      await client.query(
apps/api/src/repair/proposal.service.ts:685:        `UPDATE repair.repair_proposals
apps/api/src/repair/proposal.service.ts:686:            SET status = $1, decision = $1, approved_option = $2,
apps/api/src/repair/proposal.service.ts:687:                decided_at = now(), decided_by_name = $3, decision_channel = 'customer_portal',
apps/api/src/repair/proposal.service.ts:688:                decision_note = $4, recorded_by = $5,
apps/api/src/repair/proposal.service.ts:689:                updated_at = now(), updated_by = $5
apps/api/src/repair/proposal.service.ts:690:          WHERE id = $6 AND tenant_id = $7`,
apps/api/src/repair/proposal.service.ts:691:        [decision, approvedOption, row.display_name, note, ctx.userId, id, ctx.tenantId],
apps/api/src/repair/proposal.service.ts:692:      );
apps/api/src/repair/proposal.service.ts:693:
apps/api/src/repair/proposal.service.ts:694:      await this.audit.write(client, ctx, {
apps/api/src/repair/proposal.service.ts:695:        action:
apps/api/src/repair/proposal.service.ts:696:          decision === 'approved'
apps/api/src/repair/proposal.service.ts:697:            ? 'proposal.approved_by_customer'
apps/api/src/repair/proposal.service.ts:698:            : decision === 'declined'
apps/api/src/repair/proposal.service.ts:699:              ? 'proposal.declined_by_customer'
apps/api/src/repair/proposal.service.ts:700:              : 'proposal.changes_requested',
apps/api/src/repair/proposal.service.ts:701:        resourceType: 'proposal',
apps/api/src/repair/proposal.service.ts:702:        resourceId: id,
apps/api/src/repair/proposal.service.ts:703:        // `selfService: true` is the fact that distinguishes this entry from the
apps/api/src/repair/proposal.service.ts:704:        // staff-captured one. Same actions, so existing queries keep working;
apps/api/src/repair/proposal.service.ts:705:        // one extra key, so a dispute can tell a portal approval from a phone
apps/api/src/repair/proposal.service.ts:706:        // call written down afterwards.
apps/api/src/repair/proposal.service.ts:707:        detail: {
apps/api/src/repair/proposal.service.ts:708:          jobNumber: row.job_number,
apps/api/src/repair/proposal.service.ts:709:          versionNo: row.version_no,
apps/api/src/repair/proposal.service.ts:710:          decision,
apps/api/src/repair/proposal.service.ts:711:          approvedOption,
apps/api/src/repair/proposal.service.ts:712:          channel: 'customer_portal',
apps/api/src/repair/proposal.service.ts:713:          selfService: true,
apps/api/src/repair/proposal.service.ts:714:        },
apps/api/src/repair/proposal.service.ts:715:      });
apps/api/src/repair/proposal.service.ts:716:
apps/api/src/repair/proposal.service.ts:717:      const rows = await this.readProposals(client, ctx, { proposalId: id });
apps/api/src/repair/proposal.service.ts:718:      return ProposalService.one(rows);
apps/api/src/repair/proposal.service.ts:719:    });
apps/api/src/repair/proposal.service.ts:720:  }
apps/api/src/repair/proposal.service.ts:721:
apps/api/src/repair/proposal.service.ts:722:  // ── reads ────────────────────────────────────────────────────────────────
apps/api/src/repair/proposal.service.ts:723:
apps/api/src/repair/proposal.service.ts:724:  /**
apps/api/src/repair/proposal.service.ts:725:   * Assembles §410-§422's document from the frozen records behind it.
apps/api/src/repair/proposal.service.ts:726:   *
apps/api/src/repair/proposal.service.ts:727:   * Five queries for any number of proposals, never one per row.
apps/api/src/repair/proposal.service.ts:728:   */
apps/api/src/repair/proposal.service.ts:729:  private async readProposals(
apps/api/src/repair/proposal.service.ts:730:    client: Client,
apps/api/src/repair/proposal.service.ts:731:    ctx: TenantContext,
apps/api/src/repair/proposal.service.ts:732:    filter: { jobCardId?: string; proposalId?: string },
apps/api/src/repair/proposal.service.ts:733:  ): Promise<RepairProposal[]> {
apps/api/src/repair/proposal.service.ts:734:    const headers = await client.query(
apps/api/src/repair/proposal.service.ts:735:      `SELECT p.id, p.job_card_id, j.job_number, j.complaint, v.registration_number,
apps/api/src/repair/proposal.service.ts:736:              c.display_name AS customer_name,
apps/api/src/repair/proposal.service.ts:737:              c.email AS customer_email, c.phone AS customer_phone,
apps/api/src/repair/proposal.service.ts:738:              c.location AS customer_location,
apps/api/src/repair/proposal.service.ts:739:              o.name AS org_name,
apps/api/src/repair/proposal.service.ts:740:              op.legal_name, op.trading_name, op.address AS org_address,
apps/api/src/repair/proposal.service.ts:741:              op.city AS org_city, op.country AS org_country,
apps/api/src/repair/proposal.service.ts:742:              op.phone AS org_phone, op.email AS org_email, op.website AS org_website,
apps/api/src/repair/proposal.service.ts:743:              op.tax_identification_number, op.vat_registration_number,
apps/api/src/repair/proposal.service.ts:744:              op.document_footer,
apps/api/src/repair/proposal.service.ts:745:              mk.name AS make_name, md.name AS model_name, v.model_year,
apps/api/src/repair/proposal.service.ts:746:              p.quotation_id, q.attempt_no AS quotation_attempt_no,
apps/api/src/repair/proposal.service.ts:747:              q.currency, q.warranty_terms, q.completion_conditions, q.valid_until,
apps/api/src/repair/proposal.service.ts:748:              q.repair_plan_id,
apps/api/src/repair/proposal.service.ts:749:              p.version_no, p.status, p.expected_result, p.risk_and_limitations,
apps/api/src/repair/proposal.service.ts:750:              p.uncertainties, p.presentation_note,
apps/api/src/repair/proposal.service.ts:751:              p.issued_at, p.decision, p.approved_option, p.decided_at,
apps/api/src/repair/proposal.service.ts:752:              p.decided_by_name, p.decision_channel, p.decision_note, p.superseded_by,
apps/api/src/repair/proposal.service.ts:753:              ib.display_name AS issued_by_name,
apps/api/src/repair/proposal.service.ts:754:              rb.display_name AS recorded_by_name,
apps/api/src/repair/proposal.service.ts:755:              -- The money, read from the exact quotation this proposal names.
apps/api/src/repair/proposal.service.ts:756:              (SELECT COALESCE(sum(l.line_total), 0) FROM repair.quotation_lines l
apps/api/src/repair/proposal.service.ts:757:                WHERE l.quotation_id = q.id AND l.tenant_id = q.tenant_id
apps/api/src/repair/proposal.service.ts:758:                  AND l.is_optional = false) AS chargeable_total,
apps/api/src/repair/proposal.service.ts:759:              (SELECT COALESCE(sum(l.line_total), 0) FROM repair.quotation_lines l
apps/api/src/repair/proposal.service.ts:760:                WHERE l.quotation_id = q.id AND l.tenant_id = q.tenant_id
apps/api/src/repair/proposal.service.ts:761:                  AND l.is_optional = true) AS optional_total,
apps/api/src/repair/proposal.service.ts:762:              q.discount_amount, q.tax_rate_percent,
apps/api/src/repair/proposal.service.ts:763:              -- §420 — how long it should take.
apps/api/src/repair/proposal.service.ts:764:              (SELECT COALESCE(sum(t.estimated_labour_hours), 0) FROM repair.repair_plan_tasks t
apps/api/src/repair/proposal.service.ts:765:                WHERE t.plan_id = q.repair_plan_id AND t.tenant_id = q.tenant_id) AS plan_hours,
apps/api/src/repair/proposal.service.ts:766:              -- §412 — what was inspected. The latest submitted sheet on this card.
apps/api/src/repair/proposal.service.ts:767:              (SELECT i.summary FROM repair.inspections i
apps/api/src/repair/proposal.service.ts:768:                WHERE i.job_card_id = j.id AND i.tenant_id = j.tenant_id
apps/api/src/repair/proposal.service.ts:769:                  AND i.status <> 'in_progress'
apps/api/src/repair/proposal.service.ts:770:                ORDER BY i.attempt_no DESC LIMIT 1) AS inspection_summary,
apps/api/src/repair/proposal.service.ts:771:              (SELECT count(*)::int FROM repair.inspection_items ii
apps/api/src/repair/proposal.service.ts:772:                JOIN repair.inspections i2 ON i2.id = ii.inspection_id AND i2.tenant_id = ii.tenant_id
apps/api/src/repair/proposal.service.ts:773:               WHERE i2.job_card_id = j.id AND i2.tenant_id = j.tenant_id
apps/api/src/repair/proposal.service.ts:774:                 AND i2.status <> 'in_progress' AND ii.result IS NOT NULL) AS inspection_checked
apps/api/src/repair/proposal.service.ts:775:         FROM repair.repair_proposals p
apps/api/src/repair/proposal.service.ts:776:         JOIN repair.job_cards j ON j.id = p.job_card_id AND j.tenant_id = p.tenant_id
apps/api/src/repair/proposal.service.ts:777:         JOIN core.vehicles v ON v.id = j.vehicle_id AND v.tenant_id = j.tenant_id
apps/api/src/repair/proposal.service.ts:778:         -- The make and model are reference tables, not columns. LEFT on the model
apps/api/src/repair/proposal.service.ts:779:         -- because 004 allows a vehicle whose exact model is unknown.
apps/api/src/repair/proposal.service.ts:780:         LEFT JOIN core.vehicle_makes mk ON mk.id = v.make_id
apps/api/src/repair/proposal.service.ts:781:         LEFT JOIN core.vehicle_models md ON md.id = v.model_id
apps/api/src/repair/proposal.service.ts:782:         JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
apps/api/src/repair/proposal.service.ts:783:         JOIN identity.organizations o ON o.id = p.organization_id
apps/api/src/repair/proposal.service.ts:784:         -- LEFT: a workshop that has configured no letterhead still gets a document.
apps/api/src/repair/proposal.service.ts:785:         LEFT JOIN core.organization_profile op
apps/api/src/repair/proposal.service.ts:786:           ON op.organization_id = p.organization_id AND op.tenant_id = p.tenant_id
apps/api/src/repair/proposal.service.ts:787:         JOIN repair.quotations q ON q.id = p.quotation_id AND q.tenant_id = p.tenant_id
apps/api/src/repair/proposal.service.ts:788:         LEFT JOIN identity.users ib ON ib.id = p.issued_by
apps/api/src/repair/proposal.service.ts:789:         LEFT JOIN identity.users rb ON rb.id = p.recorded_by
apps/api/src/repair/proposal.service.ts:790:        WHERE p.tenant_id = $1
apps/api/src/repair/proposal.service.ts:791:          AND p.organization_id = $2
apps/api/src/repair/proposal.service.ts:792:          AND ($3::uuid IS NULL OR p.job_card_id = $3::uuid)
apps/api/src/repair/proposal.service.ts:793:          AND ($4::uuid IS NULL OR p.id = $4::uuid)
apps/api/src/repair/proposal.service.ts:794:          -- The same narrowing the job card carries: a technician sees the approval
apps/api/src/repair/proposal.service.ts:795:          -- only for a card assigned to them.
apps/api/src/repair/proposal.service.ts:796:          AND ($5::uuid IS NULL OR j.assigned_technician_id = $5::uuid)
apps/api/src/repair/proposal.service.ts:797:          -- 🔴 AND THE CUSTOMER SEES ONLY THEIR OWN. The customer role was added
apps/api/src/repair/proposal.service.ts:798:          -- to CAN_READ_PROPOSAL on 2026-08-04; the role admits the read and
apps/api/src/repair/proposal.service.ts:799:          -- THIS LINE is what scopes it. Without it a customer would receive
apps/api/src/repair/proposal.service.ts:800:          -- every proposal in the organisation — prices, contact details and
apps/api/src/repair/proposal.service.ts:801:          -- all — because the role check alone says nothing about whose card it
apps/api/src/repair/proposal.service.ts:802:          -- is. Same predicate assertCardVisible already uses.
apps/api/src/repair/proposal.service.ts:803:          --
apps/api/src/repair/proposal.service.ts:804:          -- NO BACKTICKS IN THIS COMMENT. It sits inside a TS template literal,
apps/api/src/repair/proposal.service.ts:805:          -- so a backtick TERMINATES THE STRING and the file stops parsing with
apps/api/src/repair/proposal.service.ts:806:          -- a misleading "',' expected". Four times now.
apps/api/src/repair/proposal.service.ts:807:          AND ($6::uuid IS NULL OR c.user_id = $6::uuid)
apps/api/src/repair/proposal.service.ts:808:        ORDER BY p.version_no DESC`,
apps/api/src/repair/proposal.service.ts:809:      [
apps/api/src/repair/proposal.service.ts:810:        ctx.tenantId, ctx.organizationId,
apps/api/src/repair/proposal.service.ts:811:        filter.jobCardId ?? null, filter.proposalId ?? null,
apps/api/src/repair/proposal.service.ts:812:        ctx.activeRole === 'technician' ? ctx.userId : null,
apps/api/src/repair/proposal.service.ts:813:        ctx.activeRole === 'customer' ? ctx.userId : null,
apps/api/src/repair/proposal.service.ts:814:      ],
apps/api/src/repair/proposal.service.ts:815:    );
apps/api/src/repair/proposal.service.ts:816:
apps/api/src/repair/proposal.service.ts:817:    const rows = headers.rows as HeaderRow[];
apps/api/src/repair/proposal.service.ts:818:    if (rows.length === 0) return [];
apps/api/src/repair/proposal.service.ts:819:
apps/api/src/repair/proposal.service.ts:820:    const planIds = [...new Set(rows.map((r) => r.repair_plan_id))];
apps/api/src/repair/proposal.service.ts:821:    const quotationIds = [...new Set(rows.map((r) => r.quotation_id))];
apps/api/src/repair/proposal.service.ts:822:    const cardIds = [...new Set(rows.map((r) => r.job_card_id))];
apps/api/src/repair/proposal.service.ts:823:
apps/api/src/repair/proposal.service.ts:824:    const [faults, tasks, parts] = await Promise.all([
apps/api/src/repair/proposal.service.ts:825:      // §414 and §416 — confirmed AND suspected, from the diagnosis behind the plan.
apps/api/src/repair/proposal.service.ts:826:      client.query(
apps/api/src/repair/proposal.service.ts:827:        `SELECT p.id AS plan_id, f.id, f.fault_description, f.fault_code, f.finding_status
apps/api/src/repair/proposal.service.ts:828:           FROM repair.repair_plans p
apps/api/src/repair/proposal.service.ts:829:           JOIN repair.diagnostic_findings f
apps/api/src/repair/proposal.service.ts:830:             ON f.diagnosis_id = p.diagnosis_id AND f.tenant_id = p.tenant_id
apps/api/src/repair/proposal.service.ts:831:          WHERE p.id = ANY($1::uuid[]) AND p.tenant_id = $2
apps/api/src/repair/proposal.service.ts:832:            AND f.finding_status IN ('confirmed', 'suspected')
apps/api/src/repair/proposal.service.ts:833:          ORDER BY f.position`,
apps/api/src/repair/proposal.service.ts:834:        [planIds, ctx.tenantId],
apps/api/src/repair/proposal.service.ts:835:      ),
apps/api/src/repair/proposal.service.ts:836:      client.query(
apps/api/src/repair/proposal.service.ts:837:        `SELECT plan_id, id, title, estimated_labour_hours
apps/api/src/repair/proposal.service.ts:838:           FROM repair.repair_plan_tasks
apps/api/src/repair/proposal.service.ts:839:          WHERE plan_id = ANY($1::uuid[]) AND tenant_id = $2
apps/api/src/repair/proposal.service.ts:840:          ORDER BY position`,
apps/api/src/repair/proposal.service.ts:841:        [planIds, ctx.tenantId],
apps/api/src/repair/proposal.service.ts:842:      ),
apps/api/src/repair/proposal.service.ts:843:      client.query(
apps/api/src/repair/proposal.service.ts:844:        `SELECT quotation_id, id, description, quantity, unit_price
apps/api/src/repair/proposal.service.ts:845:           FROM repair.quotation_lines
apps/api/src/repair/proposal.service.ts:846:          WHERE quotation_id = ANY($1::uuid[]) AND tenant_id = $2
apps/api/src/repair/proposal.service.ts:847:            AND line_kind IN ('part', 'consumable')
apps/api/src/repair/proposal.service.ts:848:          ORDER BY position`,
apps/api/src/repair/proposal.service.ts:849:        [quotationIds, ctx.tenantId],
apps/api/src/repair/proposal.service.ts:850:      ),
apps/api/src/repair/proposal.service.ts:851:    ]);
apps/api/src/repair/proposal.service.ts:852:    void cardIds;
apps/api/src/repair/proposal.service.ts:853:
apps/api/src/repair/proposal.service.ts:854:    const byPlan = <T>(list: Array<T & { plan_id: string }>): Map<string, T[]> => {
apps/api/src/repair/proposal.service.ts:855:      const m = new Map<string, T[]>();
apps/api/src/repair/proposal.service.ts:856:      for (const r of list) {
apps/api/src/repair/proposal.service.ts:857:        const l = m.get(r.plan_id) ?? [];
apps/api/src/repair/proposal.service.ts:858:        l.push(r);
apps/api/src/repair/proposal.service.ts:859:        m.set(r.plan_id, l);
apps/api/src/repair/proposal.service.ts:860:      }
apps/api/src/repair/proposal.service.ts:861:      return m;
apps/api/src/repair/proposal.service.ts:862:    };
apps/api/src/repair/proposal.service.ts:863:    const faultsByPlan = byPlan(faults.rows as Array<FaultRow & { plan_id: string }>);
apps/api/src/repair/proposal.service.ts:864:    const tasksByPlan = byPlan(tasks.rows as Array<TaskRow & { plan_id: string }>);
apps/api/src/repair/proposal.service.ts:865:    const partsByQuotation = new Map<string, PartRow[]>();
apps/api/src/repair/proposal.service.ts:866:    for (const r of parts.rows as PartRow[]) {
apps/api/src/repair/proposal.service.ts:867:      const l = partsByQuotation.get(r.quotation_id) ?? [];
apps/api/src/repair/proposal.service.ts:868:      l.push(r);
apps/api/src/repair/proposal.service.ts:869:      partsByQuotation.set(r.quotation_id, l);
apps/api/src/repair/proposal.service.ts:870:    }
apps/api/src/repair/proposal.service.ts:871:
apps/api/src/repair/proposal.service.ts:872:    return rows.map((row) => {
apps/api/src/repair/proposal.service.ts:873:      const planFaults = faultsByPlan.get(row.repair_plan_id) ?? [];
apps/api/src/repair/proposal.service.ts:874:      const planTasks = tasksByPlan.get(row.repair_plan_id) ?? [];
apps/api/src/repair/proposal.service.ts:875:      const quotationParts = partsByQuotation.get(row.quotation_id) ?? [];
apps/api/src/repair/proposal.service.ts:876:
apps/api/src/repair/proposal.service.ts:877:      // ⚠️ EVERY `numeric` ARRIVES AS A STRING FROM `pg`. Converted at the boundary —
apps/api/src/repair/proposal.service.ts:878:      // left alone, the totals below would be string concatenation, which is a wrong
apps/api/src/repair/proposal.service.ts:879:      // price no type error catches.
apps/api/src/repair/proposal.service.ts:880:      const chargeable = Number(row.chargeable_total);
apps/api/src/repair/proposal.service.ts:881:      const optional = Number(row.optional_total);
apps/api/src/repair/proposal.service.ts:882:      const discount = Number(row.discount_amount);
apps/api/src/repair/proposal.service.ts:883:      const taxRate = Number(row.tax_rate_percent);
apps/api/src/repair/proposal.service.ts:884:
apps/api/src/repair/proposal.service.ts:885:      // The same arithmetic slice 5 uses, applied to two tiers. Rounded at each step in
apps/api/src/repair/proposal.service.ts:886:      // the currency's minor unit so a displayed total always equals the sum of the
apps/api/src/repair/proposal.service.ts:887:      // lines a customer can read.
apps/api/src/repair/proposal.service.ts:888:      const withTax = (net: number): number => {
apps/api/src/repair/proposal.service.ts:889:        const taxable = Math.max(0, round2(net - discount));
apps/api/src/repair/proposal.service.ts:890:        return round2(taxable + round2((taxable * taxRate) / 100));
apps/api/src/repair/proposal.service.ts:891:      };
apps/api/src/repair/proposal.service.ts:892:      const recommendedTotal = withTax(chargeable);
apps/api/src/repair/proposal.service.ts:893:      const comprehensiveTotal = withTax(round2(chargeable + optional));
apps/api/src/repair/proposal.service.ts:894:
apps/api/src/repair/proposal.service.ts:895:      const status = row.status;
apps/api/src/repair/proposal.service.ts:896:      return {
apps/api/src/repair/proposal.service.ts:897:        id: row.id,
apps/api/src/repair/proposal.service.ts:898:        jobCardId: row.job_card_id,
apps/api/src/repair/proposal.service.ts:899:        jobNumber: row.job_number,
apps/api/src/repair/proposal.service.ts:900:        registrationNumber: row.registration_number,
apps/api/src/repair/proposal.service.ts:901:        customerName: row.customer_name,
apps/api/src/repair/proposal.service.ts:902:        quotationId: row.quotation_id,
apps/api/src/repair/proposal.service.ts:903:        quotationAttemptNo: row.quotation_attempt_no,
apps/api/src/repair/proposal.service.ts:904:        versionNo: row.version_no,
apps/api/src/repair/proposal.service.ts:905:        status,
apps/api/src/repair/proposal.service.ts:906:        expectedResult: row.expected_result,
apps/api/src/repair/proposal.service.ts:907:        riskAndLimitations: row.risk_and_limitations,
apps/api/src/repair/proposal.service.ts:908:        uncertainties: row.uncertainties,
apps/api/src/repair/proposal.service.ts:909:        presentationNote: row.presentation_note,
apps/api/src/repair/proposal.service.ts:910:        issuedByName: row.issued_by_name,
apps/api/src/repair/proposal.service.ts:911:        issuedAt: row.issued_at ? row.issued_at.toISOString() : null,
apps/api/src/repair/proposal.service.ts:912:        decision: row.decision,
apps/api/src/repair/proposal.service.ts:913:        approvedOption: row.approved_option,
apps/api/src/repair/proposal.service.ts:914:        decidedAt: row.decided_at ? row.decided_at.toISOString() : null,
apps/api/src/repair/proposal.service.ts:915:        decidedByName: row.decided_by_name,
apps/api/src/repair/proposal.service.ts:916:        decisionChannel: row.decision_channel,
apps/api/src/repair/proposal.service.ts:917:        decisionChannelLabel: row.decision_channel ? decisionChannelLabel(row.decision_channel) : null,
apps/api/src/repair/proposal.service.ts:918:        decisionNote: row.decision_note,
apps/api/src/repair/proposal.service.ts:919:        recordedByName: row.recorded_by_name,
apps/api/src/repair/proposal.service.ts:920:        supersededBy: row.superseded_by,
apps/api/src/repair/proposal.service.ts:921:        presentation: {
apps/api/src/repair/proposal.service.ts:922:          complaint: row.complaint,
apps/api/src/repair/proposal.service.ts:923:          inspectionSummary: row.inspection_summary,
apps/api/src/repair/proposal.service.ts:924:          inspectionCheckedCount: Number(row.inspection_checked ?? 0),
apps/api/src/repair/proposal.service.ts:925:          confirmedFaults: planFaults
apps/api/src/repair/proposal.service.ts:926:            .filter((f) => f.finding_status === 'confirmed')
apps/api/src/repair/proposal.service.ts:927:            .map((f) => ({ id: f.id, faultDescription: f.fault_description, faultCode: f.fault_code })),
apps/api/src/repair/proposal.service.ts:928:          suspectedFaults: planFaults
apps/api/src/repair/proposal.service.ts:929:            .filter((f) => f.finding_status === 'suspected')
apps/api/src/repair/proposal.service.ts:930:            .map((f) => ({ id: f.id, faultDescription: f.fault_description, faultCode: f.fault_code })),
apps/api/src/repair/proposal.service.ts:931:          proposedWork: planTasks.map((t) => ({
apps/api/src/repair/proposal.service.ts:932:            id: t.id,
apps/api/src/repair/proposal.service.ts:933:            title: t.title,
apps/api/src/repair/proposal.service.ts:934:            estimatedLabourHours:
apps/api/src/repair/proposal.service.ts:935:              t.estimated_labour_hours === null ? null : Number(t.estimated_labour_hours),
apps/api/src/repair/proposal.service.ts:936:          })),
apps/api/src/repair/proposal.service.ts:937:          proposedParts: quotationParts.map((p) => ({
apps/api/src/repair/proposal.service.ts:938:            id: p.id,
apps/api/src/repair/proposal.service.ts:939:            description: p.description,
apps/api/src/repair/proposal.service.ts:940:            quantity: Number(p.quantity),
apps/api/src/repair/proposal.service.ts:941:            unitPrice: Number(p.unit_price),
apps/api/src/repair/proposal.service.ts:942:          })),
apps/api/src/repair/proposal.service.ts:943:          estimatedLabourHours: round2(Number(row.plan_hours)),
apps/api/src/repair/proposal.service.ts:944:          currency: row.currency,
apps/api/src/repair/proposal.service.ts:945:          recommendedTotal,
apps/api/src/repair/proposal.service.ts:946:          comprehensiveTotal,
apps/api/src/repair/proposal.service.ts:947:          warrantyTerms: row.warranty_terms,
apps/api/src/repair/proposal.service.ts:948:          completionConditions: row.completion_conditions,
apps/api/src/repair/proposal.service.ts:949:          validUntil: row.valid_until ? row.valid_until.toISOString().slice(0, 10) : null,
apps/api/src/repair/proposal.service.ts:950:          issuer: {
apps/api/src/repair/proposal.service.ts:951:            // The trading name is what a customer recognises; the legal name is who the
apps/api/src/repair/proposal.service.ts:952:            // contract is with. Falls back to the platform's record so the letterhead is
apps/api/src/repair/proposal.service.ts:953:            // never blank.
apps/api/src/repair/proposal.service.ts:954:            name: row.trading_name ?? row.legal_name ?? row.org_name,
apps/api/src/repair/proposal.service.ts:955:            legalName: row.legal_name,
apps/api/src/repair/proposal.service.ts:956:            address: row.org_address,
apps/api/src/repair/proposal.service.ts:957:            city: row.org_city,
apps/api/src/repair/proposal.service.ts:958:            country: row.org_country,
apps/api/src/repair/proposal.service.ts:959:            phone: row.org_phone,
apps/api/src/repair/proposal.service.ts:960:            email: row.org_email,
apps/api/src/repair/proposal.service.ts:961:            website: row.org_website,
apps/api/src/repair/proposal.service.ts:962:            taxIdentificationNumber: row.tax_identification_number,
apps/api/src/repair/proposal.service.ts:963:            vatRegistrationNumber: row.vat_registration_number,
apps/api/src/repair/proposal.service.ts:964:            documentFooter: row.document_footer,
apps/api/src/repair/proposal.service.ts:965:          },
apps/api/src/repair/proposal.service.ts:966:          addressee: {
apps/api/src/repair/proposal.service.ts:967:            name: row.customer_name,
apps/api/src/repair/proposal.service.ts:968:            email: row.customer_email,
apps/api/src/repair/proposal.service.ts:969:            phone: row.customer_phone,
apps/api/src/repair/proposal.service.ts:970:            location: row.customer_location,
apps/api/src/repair/proposal.service.ts:971:          },
apps/api/src/repair/proposal.service.ts:972:          // e.g. PROP-JC-000003-V2 — short, human-readable, and derivable forever from
apps/api/src/repair/proposal.service.ts:973:          // two values that can never change.
apps/api/src/repair/proposal.service.ts:974:          documentReference: `PROP-${row.job_number}-V${row.version_no}`,
apps/api/src/repair/proposal.service.ts:975:          vehicleDescription: [row.model_year, row.make_name, row.model_name]
apps/api/src/repair/proposal.service.ts:976:            .filter(Boolean)
apps/api/src/repair/proposal.service.ts:977:            .join(' '),
apps/api/src/repair/proposal.service.ts:978:        },
apps/api/src/repair/proposal.service.ts:979:        // What the customer actually agreed to — the figure an invoice is later checked
apps/api/src/repair/proposal.service.ts:980:        // against, and the reason `approved_option` is stored rather than inferred.
apps/api/src/repair/proposal.service.ts:981:        agreedTotal:
apps/api/src/repair/proposal.service.ts:982:          row.approved_option === 'comprehensive'
apps/api/src/repair/proposal.service.ts:983:            ? comprehensiveTotal
apps/api/src/repair/proposal.service.ts:984:            : row.approved_option === 'recommended'
apps/api/src/repair/proposal.service.ts:985:              ? recommendedTotal
apps/api/src/repair/proposal.service.ts:986:              : null,
apps/api/src/repair/proposal.service.ts:987:        editable: status === 'draft' && CAN_PREPARE_PROPOSAL.has(ctx.activeRole),
apps/api/src/repair/proposal.service.ts:988:        issuable: status === 'draft' && CAN_PREPARE_PROPOSAL.has(ctx.activeRole),
apps/api/src/repair/proposal.service.ts:989:        /**
apps/api/src/repair/proposal.service.ts:990:         * 🔴 BOTH ROLE SETS, AND THE SECOND ONE WAS MISSED.
apps/api/src/repair/proposal.service.ts:991:         *
apps/api/src/repair/proposal.service.ts:992:         * `CAN_RECORD_DECISION` is the STAFF set. When `customer` was added to
apps/api/src/repair/proposal.service.ts:993:         * `CAN_READ_PROPOSAL` (2026-08-04) this line was not revisited, so
apps/api/src/repair/proposal.service.ts:994:         * `decidable` evaluated FALSE for every customer — and the customer
apps/api/src/repair/proposal.service.ts:995:         * screen shows its approval form only on `decidable`. The whole
apps/api/src/repair/proposal.service.ts:996:         * self-service approval therefore rendered nothing at all, while the
apps/api/src/repair/proposal.service.ts:997:         * service behind it worked and its ten tests passed.
apps/api/src/repair/proposal.service.ts:998:         *
apps/api/src/repair/proposal.service.ts:999:         * Nothing threw. No error appeared. The customer simply saw the old
apps/api/src/repair/proposal.service.ts:1000:         * "contact the workshop" fallback, which is exactly what the feature was
apps/api/src/repair/proposal.service.ts:1001:         * built to replace — a flag reading correct while the mechanism it gates
apps/api/src/repair/proposal.service.ts:1002:         * is inert. Found by the security review reading this line, not by any
apps/api/src/repair/proposal.service.ts:1003:         * test, because every test exercised the SERVICE and none asked what the
apps/api/src/repair/proposal.service.ts:1004:         * viewer was told they could do.
apps/api/src/repair/proposal.service.ts:1005:         *
apps/api/src/repair/proposal.service.ts:1006:         * ⚠️ THIS IS A UI AFFORDANCE, NEVER A CONTROL. Both routes re-derive the
apps/api/src/repair/proposal.service.ts:1007:         * whole judgement server-side — `assertMayRecordDecision` for staff,
apps/api/src/repair/proposal.service.ts:1008:         * `CAN_DECIDE_AS_CUSTOMER` plus the `c.user_id` predicate for the
apps/api/src/repair/proposal.service.ts:1009:         * customer. Widening this flag grants nobody anything (CLAUDE.md §8).
apps/api/src/repair/proposal.service.ts:1010:         */
apps/api/src/repair/proposal.service.ts:1011:        decidable:
apps/api/src/repair/proposal.service.ts:1012:          status === 'issued' &&
apps/api/src/repair/proposal.service.ts:1013:          // A SUPERSEDED version is never answerable, even if its status still
apps/api/src/repair/proposal.service.ts:1014:          // reads `issued`. The real flow cannot produce that pair — prepare()
apps/api/src/repair/proposal.service.ts:1015:          // refuses a new version while one is with the customer — but the flag
apps/api/src/repair/proposal.service.ts:1016:          // costs nothing and offering somebody a decision on a document the
apps/api/src/repair/proposal.service.ts:1017:          // workshop has since replaced is the worst kind of control to get
apps/api/src/repair/proposal.service.ts:1018:          // wrong. Found while a fixture manufactured exactly that state.
apps/api/src/repair/proposal.service.ts:1019:          row.superseded_by === null &&
apps/api/src/repair/proposal.service.ts:1020:          (CAN_RECORD_DECISION.has(ctx.activeRole) || CAN_DECIDE_AS_CUSTOMER.has(ctx.activeRole)),
apps/api/src/repair/proposal.service.ts:1021:      };
apps/api/src/repair/proposal.service.ts:1022:    });
apps/api/src/repair/proposal.service.ts:1023:  }
apps/api/src/repair/proposal.service.ts:1024:
apps/api/src/repair/proposal.service.ts:1025:  private async assertCardVisible(
apps/api/src/repair/proposal.service.ts:1026:    client: Client,
apps/api/src/repair/proposal.service.ts:1027:    ctx: TenantContext,
apps/api/src/repair/proposal.service.ts:1028:    cardId: string,
apps/api/src/repair/proposal.service.ts:1029:    opts: { lock?: boolean } = {},
apps/api/src/repair/proposal.service.ts:1030:  ): Promise<CardRow> {
apps/api/src/repair/proposal.service.ts:1031:    const found = await client.query(
apps/api/src/repair/proposal.service.ts:1032:      `SELECT j.id, j.job_number, j.stage
apps/api/src/repair/proposal.service.ts:1033:         FROM repair.job_cards j
apps/api/src/repair/proposal.service.ts:1034:         JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
apps/api/src/repair/proposal.service.ts:1035:        WHERE j.id = $1 AND j.tenant_id = $2 AND j.organization_id = $3
apps/api/src/repair/proposal.service.ts:1036:          AND ($4::uuid IS NULL OR j.assigned_technician_id = $4::uuid)
apps/api/src/repair/proposal.service.ts:1037:          AND ($5::uuid IS NULL OR c.user_id = $5::uuid)
apps/api/src/repair/proposal.service.ts:1038:        ${opts.lock ? 'FOR UPDATE OF j' : ''}`,
apps/api/src/repair/proposal.service.ts:1039:      [
apps/api/src/repair/proposal.service.ts:1040:        cardId, ctx.tenantId, ctx.organizationId,
apps/api/src/repair/proposal.service.ts:1041:        ctx.activeRole === 'technician' ? ctx.userId : null,
apps/api/src/repair/proposal.service.ts:1042:        ctx.activeRole === 'customer' ? ctx.userId : null,
apps/api/src/repair/proposal.service.ts:1043:      ],
apps/api/src/repair/proposal.service.ts:1044:    );
apps/api/src/repair/proposal.service.ts:1045:    const card = found.rows[0] as CardRow | undefined;
apps/api/src/repair/proposal.service.ts:1046:    if (!card) throw new NotFoundException('job card not found');
apps/api/src/repair/proposal.service.ts:1047:    return card;
apps/api/src/repair/proposal.service.ts:1048:  }
apps/api/src/repair/proposal.service.ts:1049:
apps/api/src/repair/proposal.service.ts:1050:  /**
apps/api/src/repair/proposal.service.ts:1051:   * The proposal exists, this viewer may reach it, and it is still a DRAFT.
apps/api/src/repair/proposal.service.ts:1052:   *
apps/api/src/repair/proposal.service.ts:1053:   * The message names §424 by name, because "cannot be changed" without the reason
apps/api/src/repair/proposal.service.ts:1054:   * reads as a bug to somebody who has not read the specification.
apps/api/src/repair/proposal.service.ts:1055:   */
apps/api/src/repair/proposal.service.ts:1056:  private async assertDraft(
apps/api/src/repair/proposal.service.ts:1057:    client: Client,
apps/api/src/repair/proposal.service.ts:1058:    ctx: TenantContext,
apps/api/src/repair/proposal.service.ts:1059:    proposalId: string,
apps/api/src/repair/proposal.service.ts:1060:  ): Promise<{ job_number: string; version_no: number }> {
apps/api/src/repair/proposal.service.ts:1061:    const found = await client.query(
apps/api/src/repair/proposal.service.ts:1062:      `SELECT p.id, p.status, p.version_no, j.job_number
apps/api/src/repair/proposal.service.ts:1063:         FROM repair.repair_proposals p
apps/api/src/repair/proposal.service.ts:1064:         JOIN repair.job_cards j ON j.id = p.job_card_id AND j.tenant_id = p.tenant_id
apps/api/src/repair/proposal.service.ts:1065:        WHERE p.id = $1 AND p.tenant_id = $2 AND p.organization_id = $3
apps/api/src/repair/proposal.service.ts:1066:        FOR UPDATE OF p`,
apps/api/src/repair/proposal.service.ts:1067:      [proposalId, ctx.tenantId, ctx.organizationId],
apps/api/src/repair/proposal.service.ts:1068:    );
apps/api/src/repair/proposal.service.ts:1069:    const row = found.rows[0] as
apps/api/src/repair/proposal.service.ts:1070:      | { id: string; status: ProposalStatus; version_no: number; job_number: string }
apps/api/src/repair/proposal.service.ts:1071:      | undefined;
apps/api/src/repair/proposal.service.ts:1072:    if (!row) throw new NotFoundException('proposal not found');
apps/api/src/repair/proposal.service.ts:1073:    if (row.status !== 'draft') {
apps/api/src/repair/proposal.service.ts:1074:      throw new ConflictException(
apps/api/src/repair/proposal.service.ts:1075:        row.status === 'issued'
apps/api/src/repair/proposal.service.ts:1076:          ? `version ${row.version_no} is with the customer and its content is frozen; ` +
apps/api/src/repair/proposal.service.ts:1077:            'record their decision, then prepare a new version'
apps/api/src/repair/proposal.service.ts:1078:          : `version ${row.version_no} is ${row.status}. §424: an approved proposal is ` +
apps/api/src/repair/proposal.service.ts:1079:            'immutable and a material change requires a NEW VERSION — prepare one instead',
apps/api/src/repair/proposal.service.ts:1080:      );
apps/api/src/repair/proposal.service.ts:1081:    }
apps/api/src/repair/proposal.service.ts:1082:    return { job_number: row.job_number, version_no: row.version_no };
apps/api/src/repair/proposal.service.ts:1083:  }
apps/api/src/repair/proposal.service.ts:1084:
apps/api/src/repair/proposal.service.ts:1085:  /**
apps/api/src/repair/proposal.service.ts:1086:   * Absent leaves it, null/'' clears it, a string sets it.
apps/api/src/repair/proposal.service.ts:1087:   *
apps/api/src/repair/proposal.service.ts:1088:   * ⚠️ A NON-STRING IS A 400, NOT A SILENT CLEAR — the data-loss regression the
apps/api/src/repair/proposal.service.ts:1089:   * Supervisor caught on slice 3b's clear-semantics commit, avoided here by default.
apps/api/src/repair/proposal.service.ts:1090:   */
apps/api/src/repair/proposal.service.ts:1091:  private nullableText(
apps/api/src/repair/proposal.service.ts:1092:    set: (column: string, value: unknown) => void,
apps/api/src/repair/proposal.service.ts:1093:    column: string,
apps/api/src/repair/proposal.service.ts:1094:    raw: unknown,
apps/api/src/repair/proposal.service.ts:1095:    field: string,
apps/api/src/repair/proposal.service.ts:1096:    max: number,
apps/api/src/repair/proposal.service.ts:1097:  ): void {
apps/api/src/repair/proposal.service.ts:1098:    if (raw === undefined) return;
apps/api/src/repair/proposal.service.ts:1099:    if (raw === null || raw === '') {
apps/api/src/repair/proposal.service.ts:1100:      set(column, null);
apps/api/src/repair/proposal.service.ts:1101:      return;
apps/api/src/repair/proposal.service.ts:1102:    }
apps/api/src/repair/proposal.service.ts:1103:    if (typeof raw !== 'string') {
apps/api/src/repair/proposal.service.ts:1104:      throw new BadRequestException(`${field} must be a string, or null to clear it`);
apps/api/src/repair/proposal.service.ts:1105:    }
apps/api/src/repair/proposal.service.ts:1106:    set(column, optionalText(raw, field, max));
apps/api/src/repair/proposal.service.ts:1107:  }
apps/api/src/repair/proposal.service.ts:1108:
apps/api/src/repair/proposal.service.ts:1109:  private static one(rows: RepairProposal[]): RepairProposal {
apps/api/src/repair/proposal.service.ts:1110:    const first = rows[0];
apps/api/src/repair/proposal.service.ts:1111:    if (!first) throw new NotFoundException('proposal not found');
apps/api/src/repair/proposal.service.ts:1112:    return first;
apps/api/src/repair/proposal.service.ts:1113:  }
apps/api/src/repair/proposal.service.ts:1114:
apps/api/src/repair/proposal.service.ts:1115:  private assertMayRead(ctx: TenantContext): void {
apps/api/src/repair/proposal.service.ts:1116:    if (!CAN_READ_PROPOSAL.has(ctx.activeRole)) {
apps/api/src/repair/proposal.service.ts:1117:      throw new ForbiddenException(`role '${ctx.activeRole}' may not read proposals`);
apps/api/src/repair/proposal.service.ts:1118:    }
apps/api/src/repair/proposal.service.ts:1119:  }
apps/api/src/repair/proposal.service.ts:1120:
apps/api/src/repair/proposal.service.ts:1121:  private assertMayPrepare(ctx: TenantContext): void {
apps/api/src/repair/proposal.service.ts:1122:    if (!CAN_PREPARE_PROPOSAL.has(ctx.activeRole)) {
apps/api/src/repair/proposal.service.ts:1123:      throw new ForbiddenException(`role '${ctx.activeRole}' may not prepare a customer proposal`);
apps/api/src/repair/proposal.service.ts:1124:    }
apps/api/src/repair/proposal.service.ts:1125:  }
apps/api/src/repair/proposal.service.ts:1126:
apps/api/src/repair/proposal.service.ts:1127:  private assertMayRecordDecision(ctx: TenantContext): void {
apps/api/src/repair/proposal.service.ts:1128:    if (!CAN_RECORD_DECISION.has(ctx.activeRole)) {
apps/api/src/repair/proposal.service.ts:1129:      throw new ForbiddenException(
apps/api/src/repair/proposal.service.ts:1130:        `role '${ctx.activeRole}' may not record a customer decision`,
apps/api/src/repair/proposal.service.ts:1131:      );
apps/api/src/repair/proposal.service.ts:1132:    }
apps/api/src/repair/proposal.service.ts:1133:  }
apps/api/src/repair/proposal.service.ts:1134:}
apps/api/src/repair/proposal.service.ts:1135:
apps/api/src/repair/proposal.service.ts:1136:function round2(value: number): number {
apps/api/src/repair/proposal.service.ts:1137:  return Math.round(value * 100) / 100;
apps/api/src/repair/proposal.service.ts:1138:}
apps/api/src/repair/proposal.service.ts:1139:
apps/api/src/repair/proposal.service.ts:1140:interface Client {
apps/api/src/repair/proposal.service.ts:1141:  query: (
apps/api/src/repair/proposal.service.ts:1142:    text: string,
apps/api/src/repair/proposal.service.ts:1143:    values: unknown[],
apps/api/src/repair/proposal.service.ts:1144:  ) => Promise<{ rows: unknown[]; rowCount: number | null }>;
apps/api/src/repair/proposal.service.ts:1145:}
apps/api/src/repair/proposal.service.ts:1146:
apps/api/src/repair/proposal.service.ts:1147:interface CardRow {
apps/api/src/repair/proposal.service.ts:1148:  id: string;
apps/api/src/repair/proposal.service.ts:1149:  job_number: string;
apps/api/src/repair/proposal.service.ts:1150:  stage: string;
apps/api/src/repair/proposal.service.ts:1151:}
apps/api/src/repair/proposal.service.ts:1152:
apps/api/src/repair/proposal.service.ts:1153:interface FaultRow {
apps/api/src/repair/proposal.service.ts:1154:  id: string;
apps/api/src/repair/proposal.service.ts:1155:  fault_description: string;
apps/api/src/repair/proposal.service.ts:1156:  fault_code: string | null;
apps/api/src/repair/proposal.service.ts:1157:  finding_status: string;
apps/api/src/repair/proposal.service.ts:1158:}
apps/api/src/repair/proposal.service.ts:1159:
apps/api/src/repair/proposal.service.ts:1160:interface TaskRow {
apps/api/src/repair/proposal.service.ts:1161:  id: string;
apps/api/src/repair/proposal.service.ts:1162:  title: string;
apps/api/src/repair/proposal.service.ts:1163:  estimated_labour_hours: string | null;
apps/api/src/repair/proposal.service.ts:1164:}
apps/api/src/repair/proposal.service.ts:1165:
apps/api/src/repair/proposal.service.ts:1166:interface PartRow {
apps/api/src/repair/proposal.service.ts:1167:  quotation_id: string;
apps/api/src/repair/proposal.service.ts:1168:  id: string;
apps/api/src/repair/proposal.service.ts:1169:  description: string;
apps/api/src/repair/proposal.service.ts:1170:  quantity: string;
apps/api/src/repair/proposal.service.ts:1171:  unit_price: string;
apps/api/src/repair/proposal.service.ts:1172:}
apps/api/src/repair/proposal.service.ts:1173:
apps/api/src/repair/proposal.service.ts:1174:interface HeaderRow {
apps/api/src/repair/proposal.service.ts:1175:  id: string;
apps/api/src/repair/proposal.service.ts:1176:  job_card_id: string;
apps/api/src/repair/proposal.service.ts:1177:  job_number: string;
apps/api/src/repair/proposal.service.ts:1178:  complaint: string;
apps/api/src/repair/proposal.service.ts:1179:  registration_number: string;
apps/api/src/repair/proposal.service.ts:1180:  customer_name: string;
apps/api/src/repair/proposal.service.ts:1181:  quotation_id: string;
apps/api/src/repair/proposal.service.ts:1182:  quotation_attempt_no: number;
apps/api/src/repair/proposal.service.ts:1183:  currency: string;
apps/api/src/repair/proposal.service.ts:1184:  warranty_terms: string | null;
apps/api/src/repair/proposal.service.ts:1185:  completion_conditions: string | null;
apps/api/src/repair/proposal.service.ts:1186:  valid_until: Date | null;
apps/api/src/repair/proposal.service.ts:1187:  repair_plan_id: string;
apps/api/src/repair/proposal.service.ts:1188:  version_no: number;
apps/api/src/repair/proposal.service.ts:1189:  status: ProposalStatus;
apps/api/src/repair/proposal.service.ts:1190:  expected_result: string | null;
apps/api/src/repair/proposal.service.ts:1191:  risk_and_limitations: string | null;
apps/api/src/repair/proposal.service.ts:1192:  uncertainties: string | null;
apps/api/src/repair/proposal.service.ts:1193:  presentation_note: string | null;
apps/api/src/repair/proposal.service.ts:1194:  issued_at: Date | null;
apps/api/src/repair/proposal.service.ts:1195:  decision: ProposalDecision | null;
apps/api/src/repair/proposal.service.ts:1196:  approved_option: ProposalOption | null;
apps/api/src/repair/proposal.service.ts:1197:  decided_at: Date | null;
apps/api/src/repair/proposal.service.ts:1198:  decided_by_name: string | null;
apps/api/src/repair/proposal.service.ts:1199:  decision_channel: DecisionChannel | null;
apps/api/src/repair/proposal.service.ts:1200:  decision_note: string | null;
apps/api/src/repair/proposal.service.ts:1201:  superseded_by: string | null;
apps/api/src/repair/proposal.service.ts:1202:  issued_by_name: string | null;
apps/api/src/repair/proposal.service.ts:1203:  recorded_by_name: string | null;
apps/api/src/repair/proposal.service.ts:1204:  chargeable_total: string;
apps/api/src/repair/proposal.service.ts:1205:  optional_total: string;
apps/api/src/repair/proposal.service.ts:1206:  discount_amount: string;
apps/api/src/repair/proposal.service.ts:1207:  tax_rate_percent: string;
apps/api/src/repair/proposal.service.ts:1208:  plan_hours: string;
apps/api/src/repair/proposal.service.ts:1209:  inspection_summary: string | null;
apps/api/src/repair/proposal.service.ts:1210:  inspection_checked: number;
apps/api/src/repair/proposal.service.ts:1211:  customer_email: string | null;
apps/api/src/repair/proposal.service.ts:1212:  customer_phone: string | null;
apps/api/src/repair/proposal.service.ts:1213:  customer_location: string | null;
apps/api/src/repair/proposal.service.ts:1214:  org_name: string;
apps/api/src/repair/proposal.service.ts:1215:  legal_name: string | null;
apps/api/src/repair/proposal.service.ts:1216:  trading_name: string | null;
apps/api/src/repair/proposal.service.ts:1217:  org_address: string | null;
apps/api/src/repair/proposal.service.ts:1218:  org_city: string | null;
apps/api/src/repair/proposal.service.ts:1219:  org_country: string | null;
apps/api/src/repair/proposal.service.ts:1220:  org_phone: string | null;
apps/api/src/repair/proposal.service.ts:1221:  org_email: string | null;
apps/api/src/repair/proposal.service.ts:1222:  org_website: string | null;
apps/api/src/repair/proposal.service.ts:1223:  tax_identification_number: string | null;
apps/api/src/repair/proposal.service.ts:1224:  vat_registration_number: string | null;
apps/api/src/repair/proposal.service.ts:1225:  document_footer: string | null;
apps/api/src/repair/proposal.service.ts:1226:  make_name: string | null;
apps/api/src/repair/proposal.service.ts:1227:  model_name: string | null;
apps/api/src/repair/proposal.service.ts:1228:  model_year: number | null;
apps/api/src/repair/proposal.service.ts:1229:}
rg: apps/api/src/repair/proposal.controller.ts: The system cannot find the file specified. (os error 2)

 succeeded in 919ms:
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:1:-- Proof by effect for migration 037 (registration under FORCE row-level
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:2:-- security, as a NON-superuser — i.e. under production's conditions).
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:3:--
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:4:-- ── 🔴 WHY THIS FILE EXISTS AT ALL, AND WHAT verify/036 COULD NOT SEE ───────
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:5:--
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:6:-- `verify/036` passed 9 of 9 locally against a defect that made registration
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:7:-- return 500 on every attempt in production. It was not careless: it did
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:8:-- `SET LOCAL ROLE autoworkshop_app` and asserted `current_user`. That was
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:9:-- necessary and still insufficient, for one reason:
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:10:--
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:11:--     A SECURITY DEFINER function DISCARDS the caller's role and executes as
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:12:--     the function's OWNER. Locally that owner is `autoworkshop`, a SUPERUSER,
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:13:--     and a superuser is exempt from row-level security. On Render the very
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:14:--     same user is merely the table owner, and migration 001 applied FORCE ROW
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:15:--     LEVEL SECURITY, which exists exactly so owners are NOT exempt.
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:16:--
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:17:-- So the outer SET ROLE was undone the instant the function was entered. The
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:18:-- test measured a privilege level the application never runs at.
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:19:--
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:20:-- ── HOW THIS FILE FIXES THE MEASUREMENT ─────────────────────────────────────
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:21:--
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:22:-- It re-owns the function to `autoworkshop_app` — a plain, non-superuser role —
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:23:-- INSIDE the transaction, so the SECURITY DEFINER elevation lands somewhere
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:24:-- that RLS actually applies. DDL is transactional in Postgres, so the ROLLBACK
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:25:-- at the end restores the original owner. That reproduces production's
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:26:-- conditions on a local box, which is the only way this defect class is
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:27:-- catchable before it ships.
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:28:--
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:29:-- Check 0 REFUSES TO CONTINUE if the effective owner still turns out to be a
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:30:-- superuser. A file that silently measures the wrong thing is worse than no
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:31:-- file: this repo has now been burned four times by a check that walks through
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:32:-- its own gap and reports a pass.
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:33:--
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:34:-- Guards are proved by INJECTING the failure — attempting the forbidden thing
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:35:-- and requiring a refusal — never by exercising the happy path and inferring.
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:36:--
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:37:--   docker exec -i aw-postgres psql -U autoworkshop -d autoworkshop \
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:38:--     -v ON_ERROR_STOP=1 -f - < infrastructure/migrations/verify/037_registration_rls_bootstrap.sql
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:39:--
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:40:-- Seeds nothing, asserts under production privileges, ROLLS BACK.
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:41:
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:42:BEGIN;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:43:
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:44:-- Subjects unique to THIS run. A fixed literal would make the second run judge
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:45:-- rows the first left behind, and the duplicate guard would then fire on the
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:46:-- happy path — the file failing for the wrong reason. Two runs in this repo
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:47:-- have already consumed their own fixture.
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:48:CREATE TEMP TABLE _fx (k TEXT PRIMARY KEY, v TEXT) ON COMMIT DROP;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:49:GRANT SELECT ON _fx TO autoworkshop_app;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:50:INSERT INTO _fx VALUES
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:51:  ('subject',  'verify037-'  || replace(gen_random_uuid()::text, '-', '')),
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:52:  ('subject2', 'verify037b-' || replace(gen_random_uuid()::text, '-', ''));
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:53:
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:54:-- ── THE MEASUREMENT FIX ─────────────────────────────────────────────────────
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:55:-- Make the SECURITY DEFINER elevation land on a non-superuser, as it does on
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:56:-- Render. Rolled back with everything else.
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:57:ALTER FUNCTION identity.register_workshop(TEXT, TEXT, TEXT)          OWNER TO autoworkshop_app;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:58:ALTER FUNCTION identity.provision_user_from_subject(TEXT, TEXT, TEXT) OWNER TO autoworkshop_app;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:59:
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:60:SET LOCAL ROLE autoworkshop_app;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:61:
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:62:DO $$
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:63:DECLARE
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:64:  s        TEXT := (SELECT v FROM _fx WHERE k = 'subject');
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:65:  s2       TEXT := (SELECT v FROM _fx WHERE k = 'subject2');
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:66:  uid      uuid;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:67:  uid2     uuid;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:68:  reg      RECORD;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:69:  n        INT;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:70:  role     TEXT;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:71:  owner_su BOOLEAN;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:72:BEGIN
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:73:  -- ── 0. IS THIS MEASUREMENT EVEN VALID? ────────────────────────────────────
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:74:  -- Two ways it could quietly become meaningless: running as the wrong caller,
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:75:  -- or — the one that actually happened — the function still executing as a
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:76:  -- superuser and sailing past every policy under test.
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:77:  IF current_user <> 'autoworkshop_app' THEN
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:78:    RAISE EXCEPTION 'MEASUREMENT INVALID: caller is %, not autoworkshop_app', current_user;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:79:  END IF;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:80:
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:81:  SELECT r.rolsuper INTO owner_su
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:82:    FROM pg_proc p
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:83:    JOIN pg_roles r ON r.oid = p.proowner
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:84:   WHERE p.oid = 'identity.register_workshop(text,text,text)'::regprocedure;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:85:
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:86:  IF owner_su IS NOT FALSE THEN
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:87:    RAISE EXCEPTION
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:88:      'MEASUREMENT INVALID: register_workshop still executes as a SUPERUSER, so '
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:89:      'row-level security is bypassed and NOTHING below is being tested. This is '
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:90:      'the exact blind spot that let verify/036 pass 9/9 against a live 500.';
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:91:  END IF;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:92:  RAISE NOTICE 'PASS 0  the function executes as a NON-superuser: RLS is genuinely in force';
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:93:
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:94:  -- ── 1. sign-up still works under these privileges ─────────────────────────
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:95:  uid := identity.provision_user_from_subject(s, 'verify037@example.com', 'Verify Threeseven');
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:96:  IF uid IS NULL THEN RAISE EXCEPTION 'FAIL 1: sign-up returned no user id'; END IF;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:97:  RAISE NOTICE 'PASS 1  a validated subject becomes an application user';
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:98:
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:99:  -- ── 2. 🔴 THE HEADLINE: registration is no longer refused by RLS ──────────
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:100:  -- Before 037 this raised
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:101:  --   new row violates row-level security policy for table "tenants"
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:102:  -- and returned 500 to every user in production.
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:103:  SELECT * INTO reg FROM identity.register_workshop(s, 'Verify Motors 037', 'Verify Branch');
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:104:  IF reg.tenant_id IS NULL OR reg.organization_id IS NULL
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:105:     OR reg.branch_id IS NULL OR reg.membership_id IS NULL THEN
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:106:    RAISE EXCEPTION 'FAIL 2: registration did not return all four ids';
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:107:  END IF;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:108:  RAISE NOTICE 'PASS 2  registration creates tenant + organisation + branch + membership under FORCE RLS';
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:109:
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:110:  -- ── 3. the rows are real, seen through the boundary the app itself uses ───
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:111:  -- NOT a direct SELECT: that correctly returns zero under RLS with no tenant
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:112:  -- context, and reading that as a failure is how verify/036's first draft
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:113:  -- reported a working registration as broken.
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:114:  SELECT role_name INTO role
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:115:    FROM identity.memberships_for_subject(s) WHERE tenant_id IS NOT NULL;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:116:  IF role IS DISTINCT FROM 'workshop_owner' THEN
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:117:    RAISE EXCEPTION 'FAIL 3: resolved role is %, expected workshop_owner', COALESCE(role, '(none)');
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:118:  END IF;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:119:  RAISE NOTICE 'PASS 3  the registrant resolves as workshop_owner — the nav tree and permissions will bind';
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:120:
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:121:  -- ── 4. 🔴 THE DUPLICATE GUARD ACTUALLY FIRES NOW ──────────────────────────
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:122:  -- This is the second defect 037 closes. The guard is a SELECT on
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:123:  -- identity.memberships; under FORCE RLS with no tenant context it returned
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:124:  -- ZERO ROWS for everybody, so it could not fire at all. It has been reading
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:125:  -- as a safety net while being incapable of catching anything. Had 037 opened
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:126:  -- only the INSERT door, this would have shipped as a working duplicate bug.
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:127:  BEGIN
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:128:    PERFORM identity.register_workshop(s, 'Duplicate Motors', 'X');
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:129:    RAISE EXCEPTION 'FAIL 4: a SECOND registration was allowed for the same person';
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:130:  EXCEPTION WHEN raise_exception THEN
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:131:    IF SQLERRM LIKE 'FAIL 4:%' THEN RAISE; END IF;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:132:    RAISE NOTICE 'PASS 4  a repeated registration is refused: %', SQLERRM;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:133:  END;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:134:
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:135:  -- ── 5. THE DOOR IS SHUT AGAIN ON THE WAY OUT ──────────────────────────────
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:136:  -- The caller's transaction continues after the function returns. If the flag
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:137:  -- were still set, the rest of that transaction would hold a bypass nobody
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:138:  -- asked for.
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:139:  IF COALESCE(current_setting('app.bootstrap', true), '') = 'on' THEN
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:140:    RAISE EXCEPTION 'FAIL 5: app.bootstrap is STILL ON after the function returned';
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:141:  END IF;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:142:  RAISE NOTICE 'PASS 5  app.bootstrap is cleared before control returns to the caller';
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:143:
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:144:  -- ── 6. GUARD, INJECTED: with the door shut, a bare INSERT is refused ──────
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:145:  -- Proves the bypass is the ONLY way through, and that 037 did not simply
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:146:  -- weaken the table.
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:147:  BEGIN
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:148:    INSERT INTO identity.tenants (name, slug, status, created_by)
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:149:    VALUES ('Backdoor Motors', 'backdoor-' || substr(gen_random_uuid()::text,1,8), 'active', uid);
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:150:    RAISE EXCEPTION 'FAIL 6: an ordinary INSERT into identity.tenants was ACCEPTED';
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:151:  EXCEPTION
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:152:    WHEN insufficient_privilege THEN
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:153:      RAISE NOTICE 'PASS 6  an INSERT outside the function is still refused by RLS';
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:154:    WHEN raise_exception THEN
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:155:      IF SQLERRM LIKE 'FAIL 6:%' THEN RAISE; END IF;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:156:      RAISE NOTICE 'PASS 6  an INSERT outside the function is still refused: %', SQLERRM;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:157:  END;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:158:
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:159:  -- ── 7. GUARD, INJECTED: the flag alone is NOT enough ──────────────────────
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:160:  -- The policies pin the row to app.bootstrap_user. Force the flag on but name
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:161:  -- somebody else, and the write must still be refused — otherwise the bypass
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:162:  -- would be "RLS off" wearing a nicer name.
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:163:  uid2 := identity.provision_user_from_subject(s2, 'verify037b@example.com', 'Other Person');
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:164:  PERFORM set_config('app.bootstrap',      'on',         true);
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:165:  PERFORM set_config('app.bootstrap_user', uid2::text,   true);
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:166:  BEGIN
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:167:    INSERT INTO identity.tenants (name, slug, status, created_by)
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:168:    VALUES ('Impersonation Motors', 'imp-' || substr(gen_random_uuid()::text,1,8), 'active', uid);
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:169:    RAISE EXCEPTION 'FAIL 7: the bootstrap door wrote a row attributed to ANOTHER user';
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:170:  EXCEPTION
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:171:    WHEN insufficient_privilege THEN
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:172:      RAISE NOTICE 'PASS 7  the door is pinned to one user: a row for anyone else is refused';
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:173:    WHEN raise_exception THEN
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:174:      IF SQLERRM LIKE 'FAIL 7:%' THEN RAISE; END IF;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:175:      RAISE NOTICE 'PASS 7  the door is pinned to one user: %', SQLERRM;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:176:  END;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:177:
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:178:  -- ── 8. GUARD, INJECTED: a membership cannot be minted for someone else ────
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:179:  -- The membership policy pins created_by AND user_id, because created_by alone
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:180:  -- would let this door grant somebody else access to a tenant.
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:181:  BEGIN
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:182:    INSERT INTO identity.memberships
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:183:      (tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:184:    VALUES (reg.tenant_id, reg.organization_id, reg.branch_id, uid,
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:185:            'workshop_owner', 'active', uid2);
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:186:    RAISE EXCEPTION 'FAIL 8: the bootstrap door granted a membership to a third party';
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:187:  EXCEPTION
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:188:    WHEN insufficient_privilege THEN
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:189:      RAISE NOTICE 'PASS 8  a membership for a third party is refused';
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:190:    WHEN raise_exception THEN
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:191:      IF SQLERRM LIKE 'FAIL 8:%' THEN RAISE; END IF;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:192:      RAISE NOTICE 'PASS 8  a membership for a third party is refused: %', SQLERRM;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:193:  END;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:194:  PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:195:  PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:196:
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:197:  -- ── 9. GUARD, INJECTED: junk in the GUC fails CLOSED, and does not 500 ────
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:198:  -- The comparison is made on TEXT precisely so a non-uuid cannot RAISE a cast
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:199:  -- error. A guard that turns bad input into a 500 is a denial of service with
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:200:  -- good intentions.
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:201:  PERFORM set_config('app.bootstrap',      'on',           true);
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:202:  PERFORM set_config('app.bootstrap_user', 'not-a-uuid-at-all', true);
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:203:  BEGIN
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:204:    INSERT INTO identity.tenants (name, slug, status, created_by)
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:205:    VALUES ('Junk Motors', 'junk-' || substr(gen_random_uuid()::text,1,8), 'active', uid);
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:206:    RAISE EXCEPTION 'FAIL 9: a junk app.bootstrap_user was accepted';
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:207:  EXCEPTION
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:208:    WHEN insufficient_privilege THEN
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:209:      RAISE NOTICE 'PASS 9  a junk bootstrap_user is refused, not crashed on';
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:210:    WHEN raise_exception THEN
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:211:      IF SQLERRM LIKE 'FAIL 9:%' THEN RAISE; END IF;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:212:      RAISE NOTICE 'PASS 9  a junk bootstrap_user is refused: %', SQLERRM;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:213:  END;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:214:  PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:215:  PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:216:
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:217:  -- ── 10. GUARD, INJECTED: an unknown subject still cannot register ────────
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:218:  BEGIN
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:219:    PERFORM identity.register_workshop('subject-037-does-not-exist', 'Ghost Motors', 'X');
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:220:    RAISE EXCEPTION 'FAIL 10: an unprovisioned subject registered a workshop';
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:221:  EXCEPTION WHEN raise_exception THEN
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:222:    IF SQLERRM LIKE 'FAIL 10:%' THEN RAISE; END IF;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:223:    RAISE NOTICE 'PASS 10 an unknown subject cannot register: %', SQLERRM;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:224:  END;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:225:
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:226:  -- ── 11. GUARD, INJECTED: a suspended user cannot register ────────────────
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:227:  UPDATE identity.users SET status = 'suspended' WHERE id = uid2;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:228:  BEGIN
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:229:    PERFORM identity.register_workshop(s2, 'Suspended Motors', 'X');
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:230:    RAISE EXCEPTION 'FAIL 11: a suspended user registered a workshop';
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:231:  EXCEPTION WHEN raise_exception THEN
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:232:    IF SQLERRM LIKE 'FAIL 11:%' THEN RAISE; END IF;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:233:    RAISE NOTICE 'PASS 11 a suspended user cannot register: %', SQLERRM;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:234:  END;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:235:
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:236:  -- ── 12. a second, DIFFERENT person can still register ────────────────────
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:237:  -- The duplicate guard must bind to the PERSON, not to "anyone has registered
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:238:  -- already". A guard that is too wide breaks sign-up for the whole platform
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:239:  -- after the first workshop, which is a far worse failure than the one fixed.
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:240:  SELECT count(*) INTO n FROM identity.users WHERE id = uid2;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:241:  UPDATE identity.users SET status = 'active' WHERE id = uid2;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:242:  SELECT * INTO reg FROM identity.register_workshop(s2, 'Second Person Motors', 'Main');
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:243:  IF reg.tenant_id IS NULL THEN
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:244:    RAISE EXCEPTION 'FAIL 12: the SECOND person on the platform could not register';
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:245:  END IF;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:246:  RAISE NOTICE 'PASS 12 a different person registers their own workshop normally';
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:247:
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:248:  RAISE NOTICE 'ALL 13 CHECKS PASSED (caller %, function owner is a non-superuser)', current_user;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:249:END;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:250:$$;
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:251:
infrastructure/migrations/verify/037_registration_rls_bootstrap.sql:252:ROLLBACK;
infrastructure/migrations/037_registration_rls_bootstrap.sql:1:-- ============================================================================
infrastructure/migrations/037_registration_rls_bootstrap.sql:2:-- 037 — REGISTRATION UNDER ROW-LEVEL SECURITY, AS THE APPLICATION ROLE
infrastructure/migrations/037_registration_rls_bootstrap.sql:3:--
infrastructure/migrations/037_registration_rls_bootstrap.sql:4:-- ── THE DEFECT THIS FIXES ───────────────────────────────────────────────────
infrastructure/migrations/037_registration_rls_bootstrap.sql:5:--
infrastructure/migrations/037_registration_rls_bootstrap.sql:6:--   Render log : new row violates row-level security policy for table "tenants"
infrastructure/migrations/037_registration_rls_bootstrap.sql:7:--
infrastructure/migrations/037_registration_rls_bootstrap.sql:8:-- `identity.register_workshop` (migration 036) is SECURITY DEFINER and owned by
infrastructure/migrations/037_registration_rls_bootstrap.sql:9:-- the `autoworkshop` database user. LOCALLY that user is a SUPERUSER, and a
infrastructure/migrations/037_registration_rls_bootstrap.sql:10:-- superuser bypasses row-level security entirely — so all four INSERTs sailed
infrastructure/migrations/037_registration_rls_bootstrap.sql:11:-- through and `verify/036` reported 9 of 9. ON RENDER the same user is merely
infrastructure/migrations/037_registration_rls_bootstrap.sql:12:-- the table OWNER, and migration 001 applied `FORCE ROW LEVEL SECURITY`, which
infrastructure/migrations/037_registration_rls_bootstrap.sql:13:-- exists precisely so that owners are NOT exempt. The first INSERT is refused.
infrastructure/migrations/037_registration_rls_bootstrap.sql:14:--
infrastructure/migrations/037_registration_rls_bootstrap.sql:15:-- The function is byte-identical in both places. **The ROLE is not.** This is
infrastructure/migrations/037_registration_rls_bootstrap.sql:16:-- why anything touching RLS is rehearsed ON LIVE, as the app role, and never
infrastructure/migrations/037_registration_rls_bootstrap.sql:17:-- believed on the strength of a local pass.
infrastructure/migrations/037_registration_rls_bootstrap.sql:18:--
infrastructure/migrations/037_registration_rls_bootstrap.sql:19:-- ── THE SECOND DEFECT, FOUND WHILE FIXING THE FIRST ─────────────────────────
infrastructure/migrations/037_registration_rls_bootstrap.sql:20:--
infrastructure/migrations/037_registration_rls_bootstrap.sql:21:-- 🔴 THE DUPLICATE-REGISTRATION GUARD HAS NEVER RUN IN PRODUCTION EITHER.
infrastructure/migrations/037_registration_rls_bootstrap.sql:22:--
infrastructure/migrations/037_registration_rls_bootstrap.sql:23:--     IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations/037_registration_rls_bootstrap.sql:24:--                 WHERE user_id = v_user AND status = 'active') THEN
infrastructure/migrations/037_registration_rls_bootstrap.sql:25:--         RAISE EXCEPTION 'this account already belongs to an organisation';
infrastructure/migrations/037_registration_rls_bootstrap.sql:26:--     END IF;
infrastructure/migrations/037_registration_rls_bootstrap.sql:27:--
infrastructure/migrations/037_registration_rls_bootstrap.sql:28:-- That is a SELECT against a FORCE-RLS table with NO tenant context. Its policy
infrastructure/migrations/037_registration_rls_bootstrap.sql:29:-- evaluates `tenant_id = NULL` for every row, so the query returns ZERO ROWS —
infrastructure/migrations/037_registration_rls_bootstrap.sql:30:-- always, for everybody. The guard cannot fire. It has been reading as a safety
infrastructure/migrations/037_registration_rls_bootstrap.sql:31:-- net while being incapable of catching anything, which is the failure shape
infrastructure/migrations/037_registration_rls_bootstrap.sql:32:-- this repo has now paid for repeatedly: a check that walks through its own gap
infrastructure/migrations/037_registration_rls_bootstrap.sql:33:-- and reports success. Locally, again, superuser made it look correct.
infrastructure/migrations/037_registration_rls_bootstrap.sql:34:--
infrastructure/migrations/037_registration_rls_bootstrap.sql:35:-- Left alone, the moment the INSERT fix lands a user could register a SECOND
infrastructure/migrations/037_registration_rls_bootstrap.sql:36:-- workshop by double-submitting the form, and nothing in any screen would
infrastructure/migrations/037_registration_rls_bootstrap.sql:37:-- reveal the duplicate. So the fix below opens the read as well as the write —
infrastructure/migrations/037_registration_rls_bootstrap.sql:38:-- if it opened only the write it would ship a working duplicate bug.
infrastructure/migrations/037_registration_rls_bootstrap.sql:39:--
infrastructure/migrations/037_registration_rls_bootstrap.sql:40:-- ── THE SHAPE OF THE FIX ────────────────────────────────────────────────────
infrastructure/migrations/037_registration_rls_bootstrap.sql:41:--
infrastructure/migrations/037_registration_rls_bootstrap.sql:42:-- A controlled bypass, scoped to this one function, visible in the catalogue as
infrastructure/migrations/037_registration_rls_bootstrap.sql:43:-- named policies rather than hidden in a role attribute:
infrastructure/migrations/037_registration_rls_bootstrap.sql:44:--
infrastructure/migrations/037_registration_rls_bootstrap.sql:45:--   1. `register_workshop` sets two transaction-local GUCs before it touches a
infrastructure/migrations/037_registration_rls_bootstrap.sql:46:--      tenant-owned table: `app.bootstrap = 'on'` and `app.bootstrap_user` =
infrastructure/migrations/037_registration_rls_bootstrap.sql:47:--      the id of the user being registered. It CLEARS them again before it
infrastructure/migrations/037_registration_rls_bootstrap.sql:48:--      returns.
infrastructure/migrations/037_registration_rls_bootstrap.sql:49:--   2. This migration adds one permissive policy per table, admitting a row
infrastructure/migrations/037_registration_rls_bootstrap.sql:50:--      ONLY when the flag is on AND the row is attributed to that same user.
infrastructure/migrations/037_registration_rls_bootstrap.sql:51:--
infrastructure/migrations/037_registration_rls_bootstrap.sql:52:-- ⚠️ The bypass is NOT "ignore RLS while the flag is set". Every policy below
infrastructure/migrations/037_registration_rls_bootstrap.sql:53:-- also pins `created_by` (or `user_id`) to `app.bootstrap_user`, so even with
infrastructure/migrations/037_registration_rls_bootstrap.sql:54:-- the flag forced on, the door can only create rows belonging to the one person
infrastructure/migrations/037_registration_rls_bootstrap.sql:55:-- registering. It cannot read or write anybody else's tenant.
infrastructure/migrations/037_registration_rls_bootstrap.sql:56:--
infrastructure/migrations/037_registration_rls_bootstrap.sql:57:-- ⚠️ FAIL-CLOSED IN BOTH DIRECTIONS, deliberately:
infrastructure/migrations/037_registration_rls_bootstrap.sql:58:--   · `current_setting(..., true)` returns NULL when unset. `NULL = 'on'` is
infrastructure/migrations/037_registration_rls_bootstrap.sql:59:--     NULL, which is not TRUE, so the policy refuses. An unset flag is a
infrastructure/migrations/037_registration_rls_bootstrap.sql:60:--     closed door, not an open one.
infrastructure/migrations/037_registration_rls_bootstrap.sql:61:--   · The user comparison is made on TEXT, not uuid. A junk value in
infrastructure/migrations/037_registration_rls_bootstrap.sql:62:--     `app.bootstrap_user` therefore fails to match rather than RAISEing a
infrastructure/migrations/037_registration_rls_bootstrap.sql:63:--     cast error — no remote input can turn this into a 500.
infrastructure/migrations/037_registration_rls_bootstrap.sql:64:--
infrastructure/migrations/037_registration_rls_bootstrap.sql:65:-- ⚠️ REJECTED ALTERNATIVE: a `BYPASSRLS` role owning the function. It needs
infrastructure/migrations/037_registration_rls_bootstrap.sql:66:-- privileges Render's user probably lacks, and it would move the exemption from
infrastructure/migrations/037_registration_rls_bootstrap.sql:67:-- a policy anyone can read in `pg_policies` into a role attribute nobody looks
infrastructure/migrations/037_registration_rls_bootstrap.sql:68:-- at. The existing tenant_isolation policies are NOT weakened here.
infrastructure/migrations/037_registration_rls_bootstrap.sql:69:--
infrastructure/migrations/037_registration_rls_bootstrap.sql:70:-- ── WHY THE INSERTS NO LONGER USE `RETURNING` ───────────────────────────────
infrastructure/migrations/037_registration_rls_bootstrap.sql:71:--
infrastructure/migrations/037_registration_rls_bootstrap.sql:72:-- `INSERT ... RETURNING id` reads the row back, which brings the SELECT policy
infrastructure/migrations/037_registration_rls_bootstrap.sql:73:-- into play on top of the INSERT one. Rather than widen SELECT on four tables
infrastructure/migrations/037_registration_rls_bootstrap.sql:74:-- to satisfy a convenience, the function now generates each id up front with
infrastructure/migrations/037_registration_rls_bootstrap.sql:75:-- `gen_random_uuid()` and inserts it explicitly. Same values, no read required,
infrastructure/migrations/037_registration_rls_bootstrap.sql:76:-- one less policy interaction to reason about. (`RETURNING id, never lastrowid`
infrastructure/migrations/037_registration_rls_bootstrap.sql:77:-- in CLAUDE.md is a rule about not using a driver's row-id side channel; it is
infrastructure/migrations/037_registration_rls_bootstrap.sql:78:-- not a requirement to read back a key we already hold.)
infrastructure/migrations/037_registration_rls_bootstrap.sql:79:-- ============================================================================
infrastructure/migrations/037_registration_rls_bootstrap.sql:80:
infrastructure/migrations/037_registration_rls_bootstrap.sql:81:BEGIN;
infrastructure/migrations/037_registration_rls_bootstrap.sql:82:
infrastructure/migrations/037_registration_rls_bootstrap.sql:83:-- ── 1. the bootstrap policies ───────────────────────────────────────────────
infrastructure/migrations/037_registration_rls_bootstrap.sql:84:-- Permissive, so each is OR'd with the existing `tenant_isolation` policy
infrastructure/migrations/037_registration_rls_bootstrap.sql:85:-- rather than replacing it. FOR INSERT only, except on memberships, which also
infrastructure/migrations/037_registration_rls_bootstrap.sql:86:-- needs the narrow SELECT the duplicate guard depends on.
infrastructure/migrations/037_registration_rls_bootstrap.sql:87:
infrastructure/migrations/037_registration_rls_bootstrap.sql:88:DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.tenants;
infrastructure/migrations/037_registration_rls_bootstrap.sql:89:CREATE POLICY registration_bootstrap_insert ON identity.tenants
infrastructure/migrations/037_registration_rls_bootstrap.sql:90:    FOR INSERT
infrastructure/migrations/037_registration_rls_bootstrap.sql:91:    WITH CHECK (
infrastructure/migrations/037_registration_rls_bootstrap.sql:92:        current_setting('app.bootstrap', true) = 'on'
infrastructure/migrations/037_registration_rls_bootstrap.sql:93:        AND created_by::text = current_setting('app.bootstrap_user', true)
infrastructure/migrations/037_registration_rls_bootstrap.sql:94:    );
infrastructure/migrations/037_registration_rls_bootstrap.sql:95:
infrastructure/migrations/037_registration_rls_bootstrap.sql:96:DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.organizations;
infrastructure/migrations/037_registration_rls_bootstrap.sql:97:CREATE POLICY registration_bootstrap_insert ON identity.organizations
infrastructure/migrations/037_registration_rls_bootstrap.sql:98:    FOR INSERT
infrastructure/migrations/037_registration_rls_bootstrap.sql:99:    WITH CHECK (
infrastructure/migrations/037_registration_rls_bootstrap.sql:100:        current_setting('app.bootstrap', true) = 'on'
infrastructure/migrations/037_registration_rls_bootstrap.sql:101:        AND created_by::text = current_setting('app.bootstrap_user', true)
infrastructure/migrations/037_registration_rls_bootstrap.sql:102:    );
infrastructure/migrations/037_registration_rls_bootstrap.sql:103:
infrastructure/migrations/037_registration_rls_bootstrap.sql:104:DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.branches;
infrastructure/migrations/037_registration_rls_bootstrap.sql:105:CREATE POLICY registration_bootstrap_insert ON identity.branches
infrastructure/migrations/037_registration_rls_bootstrap.sql:106:    FOR INSERT
infrastructure/migrations/037_registration_rls_bootstrap.sql:107:    WITH CHECK (
infrastructure/migrations/037_registration_rls_bootstrap.sql:108:        current_setting('app.bootstrap', true) = 'on'
infrastructure/migrations/037_registration_rls_bootstrap.sql:109:        AND created_by::text = current_setting('app.bootstrap_user', true)
infrastructure/migrations/037_registration_rls_bootstrap.sql:110:    );
infrastructure/migrations/037_registration_rls_bootstrap.sql:111:
infrastructure/migrations/037_registration_rls_bootstrap.sql:112:-- The membership row is the one that grants the caller their own access, so it
infrastructure/migrations/037_registration_rls_bootstrap.sql:113:-- is pinned on BOTH columns: the row must be created by the registering user
infrastructure/migrations/037_registration_rls_bootstrap.sql:114:-- AND be about the registering user. `created_by` alone would let a future
infrastructure/migrations/037_registration_rls_bootstrap.sql:115:-- caller of this door mint a membership for somebody else.
infrastructure/migrations/037_registration_rls_bootstrap.sql:116:DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.memberships;
infrastructure/migrations/037_registration_rls_bootstrap.sql:117:CREATE POLICY registration_bootstrap_insert ON identity.memberships
infrastructure/migrations/037_registration_rls_bootstrap.sql:118:    FOR INSERT
infrastructure/migrations/037_registration_rls_bootstrap.sql:119:    WITH CHECK (
infrastructure/migrations/037_registration_rls_bootstrap.sql:120:        current_setting('app.bootstrap', true) = 'on'
infrastructure/migrations/037_registration_rls_bootstrap.sql:121:        AND created_by::text = current_setting('app.bootstrap_user', true)
infrastructure/migrations/037_registration_rls_bootstrap.sql:122:        AND user_id::text   = current_setting('app.bootstrap_user', true)
infrastructure/migrations/037_registration_rls_bootstrap.sql:123:    );
infrastructure/migrations/037_registration_rls_bootstrap.sql:124:
infrastructure/migrations/037_registration_rls_bootstrap.sql:125:-- 🔴 THIS ONE IS WHAT MAKES THE DUPLICATE GUARD REAL.
infrastructure/migrations/037_registration_rls_bootstrap.sql:126:-- Without it the guard reads zero rows forever and one person can own several
infrastructure/migrations/037_registration_rls_bootstrap.sql:127:-- workshops. It exposes a single person's OWN membership rows, and only while
infrastructure/migrations/037_registration_rls_bootstrap.sql:128:-- the flag is on — it is not a general read of the table.
infrastructure/migrations/037_registration_rls_bootstrap.sql:129:DROP POLICY IF EXISTS registration_bootstrap_select ON identity.memberships;
infrastructure/migrations/037_registration_rls_bootstrap.sql:130:CREATE POLICY registration_bootstrap_select ON identity.memberships
infrastructure/migrations/037_registration_rls_bootstrap.sql:131:    FOR SELECT
infrastructure/migrations/037_registration_rls_bootstrap.sql:132:    USING (
infrastructure/migrations/037_registration_rls_bootstrap.sql:133:        current_setting('app.bootstrap', true) = 'on'
infrastructure/migrations/037_registration_rls_bootstrap.sql:134:        AND user_id::text = current_setting('app.bootstrap_user', true)
infrastructure/migrations/037_registration_rls_bootstrap.sql:135:    );
infrastructure/migrations/037_registration_rls_bootstrap.sql:136:
infrastructure/migrations/037_registration_rls_bootstrap.sql:137:COMMENT ON POLICY registration_bootstrap_insert ON identity.tenants IS
infrastructure/migrations/037_registration_rls_bootstrap.sql:138:'Sign-up only. Admits an INSERT while identity.register_workshop holds '
infrastructure/migrations/037_registration_rls_bootstrap.sql:139:'app.bootstrap=on, and only for a row attributed to app.bootstrap_user. '
infrastructure/migrations/037_registration_rls_bootstrap.sql:140:'Registration is the one operation that legitimately has no tenant context — '
infrastructure/migrations/037_registration_rls_bootstrap.sql:141:'it is what CREATES the tenant a context is later made from.';
infrastructure/migrations/037_registration_rls_bootstrap.sql:142:
infrastructure/migrations/037_registration_rls_bootstrap.sql:143:COMMENT ON POLICY registration_bootstrap_select ON identity.memberships IS
infrastructure/migrations/037_registration_rls_bootstrap.sql:144:'Lets identity.register_workshop see whether the registering user ALREADY '
infrastructure/migrations/037_registration_rls_bootstrap.sql:145:'belongs to an organisation. Under FORCE RLS with no tenant context that check '
infrastructure/migrations/037_registration_rls_bootstrap.sql:146:'returned zero rows for everyone, so the one-workshop-per-person rule could '
infrastructure/migrations/037_registration_rls_bootstrap.sql:147:'never fire. Scoped to that single user, and only while app.bootstrap=on.';
infrastructure/migrations/037_registration_rls_bootstrap.sql:148:
infrastructure/migrations/037_registration_rls_bootstrap.sql:149:-- ── 2. the function, taught to open and close the door ──────────────────────
infrastructure/migrations/037_registration_rls_bootstrap.sql:150:
infrastructure/migrations/037_registration_rls_bootstrap.sql:151:CREATE OR REPLACE FUNCTION identity.register_workshop(
infrastructure/migrations/037_registration_rls_bootstrap.sql:152:    p_subject       TEXT,
infrastructure/migrations/037_registration_rls_bootstrap.sql:153:    p_workshop_name TEXT,
infrastructure/migrations/037_registration_rls_bootstrap.sql:154:    p_branch_name   TEXT
infrastructure/migrations/037_registration_rls_bootstrap.sql:155:)
infrastructure/migrations/037_registration_rls_bootstrap.sql:156:RETURNS TABLE (
infrastructure/migrations/037_registration_rls_bootstrap.sql:157:    tenant_id       uuid,
infrastructure/migrations/037_registration_rls_bootstrap.sql:158:    organization_id uuid,
infrastructure/migrations/037_registration_rls_bootstrap.sql:159:    branch_id       uuid,
infrastructure/migrations/037_registration_rls_bootstrap.sql:160:    membership_id   uuid
infrastructure/migrations/037_registration_rls_bootstrap.sql:161:)
infrastructure/migrations/037_registration_rls_bootstrap.sql:162:LANGUAGE plpgsql
infrastructure/migrations/037_registration_rls_bootstrap.sql:163:SECURITY DEFINER
infrastructure/migrations/037_registration_rls_bootstrap.sql:164:SET search_path = identity, pg_catalog, pg_temp
infrastructure/migrations/037_registration_rls_bootstrap.sql:165:AS $$
infrastructure/migrations/037_registration_rls_bootstrap.sql:166:DECLARE
infrastructure/migrations/037_registration_rls_bootstrap.sql:167:    v_user   uuid;
infrastructure/migrations/037_registration_rls_bootstrap.sql:168:    v_tenant uuid;
infrastructure/migrations/037_registration_rls_bootstrap.sql:169:    v_org    uuid;
infrastructure/migrations/037_registration_rls_bootstrap.sql:170:    v_branch uuid;
infrastructure/migrations/037_registration_rls_bootstrap.sql:171:    v_member uuid;
infrastructure/migrations/037_registration_rls_bootstrap.sql:172:    v_slug   TEXT;
infrastructure/migrations/037_registration_rls_bootstrap.sql:173:BEGIN
infrastructure/migrations/037_registration_rls_bootstrap.sql:174:    IF p_workshop_name IS NULL OR btrim(p_workshop_name) = '' THEN
infrastructure/migrations/037_registration_rls_bootstrap.sql:175:        RAISE EXCEPTION 'a workshop needs a name';
infrastructure/migrations/037_registration_rls_bootstrap.sql:176:    END IF;
infrastructure/migrations/037_registration_rls_bootstrap.sql:177:
infrastructure/migrations/037_registration_rls_bootstrap.sql:178:    -- The caller is resolved from the SUBJECT, never passed in as a user id.
infrastructure/migrations/037_registration_rls_bootstrap.sql:179:    -- A user id parameter would let any caller register a workshop in somebody
infrastructure/migrations/037_registration_rls_bootstrap.sql:180:    -- else's name, which is the confused-deputy shape `1.txt` §9 forbids.
infrastructure/migrations/037_registration_rls_bootstrap.sql:181:    -- `identity.users` is not tenant-scoped, so this read needs no bypass.
infrastructure/migrations/037_registration_rls_bootstrap.sql:182:    SELECT id INTO v_user
infrastructure/migrations/037_registration_rls_bootstrap.sql:183:      FROM identity.users
infrastructure/migrations/037_registration_rls_bootstrap.sql:184:     WHERE keycloak_subject = p_subject
infrastructure/migrations/037_registration_rls_bootstrap.sql:185:       AND status = 'active';
infrastructure/migrations/037_registration_rls_bootstrap.sql:186:
infrastructure/migrations/037_registration_rls_bootstrap.sql:187:    IF v_user IS NULL THEN
infrastructure/migrations/037_registration_rls_bootstrap.sql:188:        RAISE EXCEPTION 'no active application user for this identity';
infrastructure/migrations/037_registration_rls_bootstrap.sql:189:    END IF;
infrastructure/migrations/037_registration_rls_bootstrap.sql:190:
infrastructure/migrations/037_registration_rls_bootstrap.sql:191:    -- ── the door opens here, and only here ─────────────────────────────────
infrastructure/migrations/037_registration_rls_bootstrap.sql:192:    -- Both settings are transaction-local (`is_local => true`), so a connection
infrastructure/migrations/037_registration_rls_bootstrap.sql:193:    -- returned to the pool cannot carry them to the next request even if this
infrastructure/migrations/037_registration_rls_bootstrap.sql:194:    -- function were to abort. They are cleared explicitly below as well,
infrastructure/migrations/037_registration_rls_bootstrap.sql:195:    -- because the SUCCESS path leaves the caller's transaction open and the
infrastructure/migrations/037_registration_rls_bootstrap.sql:196:    -- flag must not still be set when control returns to the service.
infrastructure/migrations/037_registration_rls_bootstrap.sql:197:    PERFORM set_config('app.bootstrap',      'on',          true);
infrastructure/migrations/037_registration_rls_bootstrap.sql:198:    PERFORM set_config('app.bootstrap_user', v_user::text,  true);
infrastructure/migrations/037_registration_rls_bootstrap.sql:199:
infrastructure/migrations/037_registration_rls_bootstrap.sql:200:    -- ⚠️ ONE WORKSHOP PER PERSON, and this check only became CAPABLE of firing
infrastructure/migrations/037_registration_rls_bootstrap.sql:201:    -- in migration 037: under FORCE RLS with no tenant context it read zero
infrastructure/migrations/037_registration_rls_bootstrap.sql:202:    -- rows for everybody. It sits AFTER the flag is set for that reason.
infrastructure/migrations/037_registration_rls_bootstrap.sql:203:    -- A retried request — a double-submitted form, a client that resends on a
infrastructure/migrations/037_registration_rls_bootstrap.sql:204:    -- slow response — would otherwise create a SECOND tenant with the same
infrastructure/migrations/037_registration_rls_bootstrap.sql:205:    -- owner, and there is no UI anywhere that would reveal the duplicate.
infrastructure/migrations/037_registration_rls_bootstrap.sql:206:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations/037_registration_rls_bootstrap.sql:207:                WHERE user_id = v_user AND status = 'active') THEN
infrastructure/migrations/037_registration_rls_bootstrap.sql:208:        PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations/037_registration_rls_bootstrap.sql:209:        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations/037_registration_rls_bootstrap.sql:210:        RAISE EXCEPTION 'this account already belongs to an organisation';
infrastructure/migrations/037_registration_rls_bootstrap.sql:211:    END IF;
infrastructure/migrations/037_registration_rls_bootstrap.sql:212:
infrastructure/migrations/037_registration_rls_bootstrap.sql:213:    -- A readable, unique slug. `identity.tenants.slug` is NOT NULL and unique;
infrastructure/migrations/037_registration_rls_bootstrap.sql:214:    -- deriving it from the name alone would collide on the second "Auto Fix".
infrastructure/migrations/037_registration_rls_bootstrap.sql:215:    v_slug := regexp_replace(lower(btrim(p_workshop_name)), '[^a-z0-9]+', '-', 'g');
infrastructure/migrations/037_registration_rls_bootstrap.sql:216:    v_slug := btrim(v_slug, '-');
infrastructure/migrations/037_registration_rls_bootstrap.sql:217:    IF v_slug = '' THEN
infrastructure/migrations/037_registration_rls_bootstrap.sql:218:        v_slug := 'workshop';
infrastructure/migrations/037_registration_rls_bootstrap.sql:219:    END IF;
infrastructure/migrations/037_registration_rls_bootstrap.sql:220:    v_slug := left(v_slug, 40) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
infrastructure/migrations/037_registration_rls_bootstrap.sql:221:
infrastructure/migrations/037_registration_rls_bootstrap.sql:222:    -- Ids are generated here rather than read back with RETURNING — see the
infrastructure/migrations/037_registration_rls_bootstrap.sql:223:    -- header. Same uuid source the column defaults use.
infrastructure/migrations/037_registration_rls_bootstrap.sql:224:    v_tenant := gen_random_uuid();
infrastructure/migrations/037_registration_rls_bootstrap.sql:225:    v_org    := gen_random_uuid();
infrastructure/migrations/037_registration_rls_bootstrap.sql:226:    v_branch := gen_random_uuid();
infrastructure/migrations/037_registration_rls_bootstrap.sql:227:    v_member := gen_random_uuid();
infrastructure/migrations/037_registration_rls_bootstrap.sql:228:
infrastructure/migrations/037_registration_rls_bootstrap.sql:229:    INSERT INTO identity.tenants (id, name, slug, status, created_by)
infrastructure/migrations/037_registration_rls_bootstrap.sql:230:    VALUES (v_tenant, btrim(p_workshop_name), v_slug, 'active', v_user);
infrastructure/migrations/037_registration_rls_bootstrap.sql:231:
infrastructure/migrations/037_registration_rls_bootstrap.sql:232:    -- ⚠️ `individual_workshop`, NOT `workshop`. `organizations_org_type_check`
infrastructure/migrations/037_registration_rls_bootstrap.sql:233:    -- (migration 001) admits ten specific values and `workshop` is not one of
infrastructure/migrations/037_registration_rls_bootstrap.sql:234:    -- them — the first run of this function died on that constraint. A new
infrastructure/migrations/037_registration_rls_bootstrap.sql:235:    -- registration starts as a single workshop; `multi_branch_workshop` is what
infrastructure/migrations/037_registration_rls_bootstrap.sql:236:    -- it becomes when a second branch is added, which is a later decision and
infrastructure/migrations/037_registration_rls_bootstrap.sql:237:    -- not one to guess at sign-up.
infrastructure/migrations/037_registration_rls_bootstrap.sql:238:    INSERT INTO identity.organizations (id, tenant_id, name, org_type, status, created_by)
infrastructure/migrations/037_registration_rls_bootstrap.sql:239:    VALUES (v_org, v_tenant, btrim(p_workshop_name), 'individual_workshop', 'active', v_user);
infrastructure/migrations/037_registration_rls_bootstrap.sql:240:
infrastructure/migrations/037_registration_rls_bootstrap.sql:241:    -- Every workshop gets one branch immediately. `resolveTenantContext` copes
infrastructure/migrations/037_registration_rls_bootstrap.sql:242:    -- with a NULL branch, but the screens read better with a real one, and a
infrastructure/migrations/037_registration_rls_bootstrap.sql:243:    -- workshop with nowhere to do the work is not a state worth representing.
infrastructure/migrations/037_registration_rls_bootstrap.sql:244:    INSERT INTO identity.branches (id, tenant_id, organization_id, name, status, created_by)
infrastructure/migrations/037_registration_rls_bootstrap.sql:245:    VALUES (v_branch, v_tenant, v_org,
infrastructure/migrations/037_registration_rls_bootstrap.sql:246:            COALESCE(NULLIF(btrim(p_branch_name), ''), 'Main branch'),
infrastructure/migrations/037_registration_rls_bootstrap.sql:247:            'active', v_user);
infrastructure/migrations/037_registration_rls_bootstrap.sql:248:
infrastructure/migrations/037_registration_rls_bootstrap.sql:249:    -- `workshop_owner`, spelled exactly as `permission-matrix.ts` and
infrastructure/migrations/037_registration_rls_bootstrap.sql:250:    -- `viewer-contract.ts`'s ROLE_TO_NAV expect. A role name that is merely
infrastructure/migrations/037_registration_rls_bootstrap.sql:251:    -- plausible resolves to no navigation tree and no permissions, and the user
infrastructure/migrations/037_registration_rls_bootstrap.sql:252:    -- lands in a workshop they can see nothing in.
infrastructure/migrations/037_registration_rls_bootstrap.sql:253:    INSERT INTO identity.memberships
infrastructure/migrations/037_registration_rls_bootstrap.sql:254:        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure/migrations/037_registration_rls_bootstrap.sql:255:    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'workshop_owner', 'active', v_user);
infrastructure/migrations/037_registration_rls_bootstrap.sql:256:
infrastructure/migrations/037_registration_rls_bootstrap.sql:257:    -- ── and the door closes ────────────────────────────────────────────────
infrastructure/migrations/037_registration_rls_bootstrap.sql:258:    -- The caller's transaction continues after this function returns. Leaving
infrastructure/migrations/037_registration_rls_bootstrap.sql:259:    -- the flag set would hand the rest of that transaction a bypass it was
infrastructure/migrations/037_registration_rls_bootstrap.sql:260:    -- never meant to have — a bypass whose blast radius is small (it is pinned
infrastructure/migrations/037_registration_rls_bootstrap.sql:261:    -- to this user) but which would still be an exemption nobody asked for.
infrastructure/migrations/037_registration_rls_bootstrap.sql:262:    PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations/037_registration_rls_bootstrap.sql:263:    PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations/037_registration_rls_bootstrap.sql:264:
infrastructure/migrations/037_registration_rls_bootstrap.sql:265:    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
infrastructure/migrations/037_registration_rls_bootstrap.sql:266:END;
infrastructure/migrations/037_registration_rls_bootstrap.sql:267:$$;
infrastructure/migrations/037_registration_rls_bootstrap.sql:268:
infrastructure/migrations/037_registration_rls_bootstrap.sql:269:COMMENT ON FUNCTION identity.register_workshop(TEXT, TEXT, TEXT) IS
infrastructure/migrations/037_registration_rls_bootstrap.sql:270:'Registration: creates tenant + organisation + branch + owner membership for the '
infrastructure/migrations/037_registration_rls_bootstrap.sql:271:'caller, atomically. The ONLY function that grants a membership to its own caller, '
infrastructure/migrations/037_registration_rls_bootstrap.sql:272:'and safe only because the tenant did not exist a moment earlier: it accepts no '
infrastructure/migrations/037_registration_rls_bootstrap.sql:273:'tenant id and refuses a caller who already belongs to one. Adding a person to an '
infrastructure/migrations/037_registration_rls_bootstrap.sql:274:'EXISTING organisation is MembershipService.grant(), which requires an admin. '
infrastructure/migrations/037_registration_rls_bootstrap.sql:275:'Opens a narrow RLS bootstrap door (app.bootstrap / app.bootstrap_user, both '
infrastructure/migrations/037_registration_rls_bootstrap.sql:276:'transaction-local) because it runs as a NON-superuser owner on production, where '
infrastructure/migrations/037_registration_rls_bootstrap.sql:277:'FORCE ROW LEVEL SECURITY applies to owners too. Closes it before returning.';
infrastructure/migrations/037_registration_rls_bootstrap.sql:278:
infrastructure/migrations/037_registration_rls_bootstrap.sql:279:REVOKE ALL ON FUNCTION identity.register_workshop(TEXT, TEXT, TEXT) FROM PUBLIC;
infrastructure/migrations/037_registration_rls_bootstrap.sql:280:GRANT EXECUTE ON FUNCTION identity.register_workshop(TEXT, TEXT, TEXT) TO autoworkshop_app;
infrastructure/migrations/037_registration_rls_bootstrap.sql:281:
infrastructure/migrations/037_registration_rls_bootstrap.sql:282:COMMIT;

 succeeded in 781ms:
1:# Keeps Keycloak awake during working hours so sign-in does not cold-start.
2:#
3:# ── THE PROBLEM ─────────────────────────────────────────────────────────────
4:# Render's free tier powers a service down after 15 minutes of idle. Keycloak's
5:# cold start was MEASURED at up to 136 seconds on 2026-08-03, and Auth.js
6:# discovers its endpoints from `.well-known/openid-configuration` — so during
7:# that wake, sign-in fails with `Configuration`, which reads to the visitor as
8:# "this site is broken". The first visitor after any quiet period gets it.
9:#
10:# `packages/next-shell/src/AuthErrorScreen.tsx` fixes what they are TOLD. This
11:# file reduces how often they are told it.
12:#
13:# ── 🔴 WHY THIS IS WINDOWED AND NOT 24/7 — READ BEFORE WIDENING IT ──────────
14:#
15:# FOUR free Render services share ONE 750-instance-hour monthly allowance:
16:# autoworkshop-api, autoworkshop-keycloak, the workshop web service and
17:# autoworkshop-customer. A calendar month is ~730 hours. So:
18:#
19:#     Keycloak warm 24/7   = ~730 h/month  = the ENTIRE allowance, alone
20:#     Keycloak warm 10h×22 = ~220 h/month  = leaves ~530 h for the other three
21:#
22:# A round-the-clock warmer does not merely risk the budget, it consumes all of
23:# it and starves the API and both web services — which is precisely how this
24:# account was suspended with `suspenders: ['billing']` on 2026-07-28, and why
25:# `autoworkshop-customer` 404'd for a stretch on 2026-08-03. Zero cost is a hard
26:# rule (ADR-012) and NO PAID REMEDY IS TO BE PROPOSED, so the only lever is how
27:# many hours to spend and when.
28:#
29:# The window below is therefore deliberately modest: weekdays, 08:00-18:00 UTC.
30:# Ghana is UTC+0, so that is local working hours with no offset arithmetic.
31:# WIDENING IT SPENDS HOURS THE OTHER THREE SERVICES NEED. Do the sum first.
32:#
33:# ── WHY ONE RUN LOOPS INSTEAD OF ASKING CRON FOR MORE FIRES ─────────────────
34:#
35:# Measured on the Solar repo across 8 workflows: GitHub delivers ~0.6 scheduled
36:# runs/hour REGARDLESS of the requested rate — 12/h and 2/h both arrive at
37:# ~0.6/h. Every gap exceeded Render's 15-minute idle timeout, so a 5-minute cron
38:# kept nothing warm for weeks while reporting success on every run. You cannot
39:# out-schedule a scheduler that is dropping you.
40:#
41:# So this does not depend on cron FREQUENCY, only on it eventually firing: each
42:# delivered run becomes a loop that pings every 5 minutes until the window ends.
43:# One landed fire covers the rest of the working day.
44:#
45:# `cancel-in-progress: false` is load-bearing. A landing fire is held PENDING
46:# behind the live warmer rather than killing it; `true` was tried on Solar and is
47:# worse, because it stops the running warmer before its replacement has a runner
48:# and opens a coverage gap several times an hour.
49:#
50:# STAYING GREEN IS DELIBERATE. A warmer must never page anyone for a slow wake,
51:# so ping failures are counted and summarised, never fatal.
52:#
53:# To stop entirely: disable in the Actions tab AND cancel the in-flight run, or
54:# it keeps warming until the window closes.
55:
56:name: keep-warm
57:
58:on:
59:  schedule:
60:    # Asked often so that at least one lands inside the window; the delivered
61:    # rate is ~0.6/h whatever this says. Offset minutes avoid the :00 high-load
62:    # slot GitHub's own docs call the worst one. Do NOT tighten this to "fix"
63:    # thin coverage — it has no measurable effect.
64:    - cron: "3,18,33,48 8-17 * * 1-5"
65:  workflow_dispatch: {}
66:
67:permissions:
68:  contents: read
69:
70:concurrency:
71:  group: keep-warm
72:  cancel-in-progress: false
73:
74:jobs:
75:  warm:
76:    runs-on: ubuntu-latest
77:    # 🔴 300, AND THE LOOP STOPS ITSELF AT 290 — the two must not be the other
78:    # way round. The first version paired `timeout-minutes: 335` with a loop
79:    # bounded only by an 18:00 UTC window. A fire landing at 08:03 would then run
80:    # for 597 minutes and be KILLED by the timeout at 13:38, which GitHub records
81:    # as `failure` — so the workflow whose header promises "staying green is
82:    # deliberate" would have gone red on every normal morning start, and a red
83:    # warmer is one nobody looks at. Caught by Codex, 2026-08-04.
84:    #
85:    # The loop now ends itself BEFORE the cap, which is what makes the handoff
86:    # work: it exits cleanly, the fire already queued behind it (see
87:    # `cancel-in-progress: false`) starts within seconds, and a 10-hour window is
88:    # covered by two green runs instead of one killed one.
89:    timeout-minutes: 300
90:    steps:
91:      - name: Warm Keycloak until the window closes
92:        run: |
93:          # A failed ping must never kill the loop. A warmer that dies on the
94:          # first slow cold wake is the exact bug that made Solar's
95:          # keycloak-keepalive workflow useless.
96:          set +e
97:
98:          # 18:00 UTC — the end of the window declared in the header. Computed
99:          # from the clock rather than a fixed duration so a fire that lands at
100:          # 16:40 warms for 80 minutes and stops, instead of running past the
101:          # window and spending hours nobody is awake for.
102:          WINDOW_END_HOUR=18
103:          # 290 min, ten short of the job's 300-minute cap. Whichever comes
104:          # first — the window closing or this budget running out — ends the run
105:          # CLEANLY, so it is recorded green and the queued successor takes over.
106:          # Being killed by the cap instead would mark the run failed and teach
107:          # everyone to ignore this workflow's status.
108:          MAX_RUN_SECONDS=17400
109:          INTERVAL=300        # 5 min, comfortably inside Render's 15-min idle
110:          # 150s, not 90s. A free-tier wake was measured at 136s on 2026-08-03,
111:          # and a cap that expires MID-WAKE aborts the very wake it triggered —
112:          # which is how a warmer ends up proving nothing. Do not lower this
113:          # without a new measurement.
114:          MAXTIME=150
115:
116:          # Only Keycloak. The API and the web services wake on real traffic and
117:          # each one added here costs another ~220 h/month from a 750 h budget
118:          # shared by four services. See the header before adding a URL.
119:          URL="https://autoworkshop-keycloak.onrender.com/realms/autoworkshop/.well-known/openid-configuration"
120:
121:          START=$(date +%s); ROUNDS=0; FAILURES=0
122:          DEADLINE=$((START + MAX_RUN_SECONDS))
123:
124:          summary() {
125:            MINS=$(( ($(date +%s) - START) / 60 ))
126:            echo "----------------------------------------"
127:            echo "warmed ${MINS} min | ${ROUNDS} pings | ${FAILURES} failed"
128:            if [ "$ROUNDS" -gt 0 ] && [ "$FAILURES" -eq "$ROUNDS" ]; then
129:              # Every ping failed for the whole run. Warn so it is visible in the
130:              # run summary, but do NOT fail: a warmer that pages people teaches
131:              # them to ignore it, and this is not the outage detector.
132:              echo "::warning::keep-warm: every ping failed (${FAILURES}/${ROUNDS}). Keycloak may be down."
133:            fi
134:          }
135:          # The NORMAL way this run ends is the window closing or a newer fire
136:          # superseding it — print the tally either way, or the common case
137:          # leaves no record of what happened.
138:          trap 'summary; exit 0' TERM INT
139:
140:          # BOTH bounds, every cycle: the working-hours window AND this run's own
141:          # budget. Either one alone leaves the failure the other prevents.
142:          while [ "$(date -u +%H)" -lt "$WINDOW_END_HOUR" ] && [ "$(date +%s)" -lt "$DEADLINE" ]; do
143:            ROUNDS=$((ROUNDS + 1))
144:            # No -f: curl exits 0 for ANY HTTP response, including 5xx. Correct
145:            # for a warmer — a 500 still proves the container answered, which is
146:            # the only thing being measured. Judging health is not this job.
147:            OUT=$(curl -sS --max-time "$MAXTIME" -o /dev/null -w "%{http_code} in %{time_total}s" "$URL" 2>&1)
148:            if [ $? -ne 0 ]; then
149:              FAILURES=$((FAILURES + 1))
150:              echo "  WARN $(echo "$OUT" | tr '\n' ' ')"
151:            else
152:              echo "  ok   ${OUT}"
153:            fi
154:            # Re-check BEFORE sleeping, so the last cycle does not sleep five
155:            # minutes past the window — or past the run budget — just to exit.
156:            [ "$(date -u +%H)" -lt "$WINDOW_END_HOUR" ] || break
157:            [ $(( $(date +%s) + INTERVAL )) -lt "$DEADLINE" ] || break
158:            sleep "$INTERVAL"
159:          done
160:
161:          summary

codex
The implementation surfaces mostly exist, but the changed control docs still contain misleading state. I’m checking the exact branch/HEAD separately because the “tip” value in the session note already looks suspicious.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git rev-parse --short HEAD' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git branch --show-current' in C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git rev-parse --short HEAD'` rejected: blocked by policy
2026-08-04T14:30:51.539566Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git rev-parse --short HEAD'` rejected: blocked by policy
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git status --short' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"Migration \\*\\*037|Tip "'`|customer 19/19|verify-customer-workflow|THREE GATES|four gates|Phase 1|Phase 5|production-ready" README.md .claude/CURRENT_PHASE.md .claude/CURRENT_TASK.md .claude/NEXT_SESSION_START_HERE.md' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 681ms:
master

 succeeded in 610ms:
.claude/NEXT_SESSION_START_HERE.md:11:**Tip `59e3838`, pushed, tree clean.** Seven commits.
.claude/NEXT_SESSION_START_HERE.md:19:Migration **037** is written, committed and verified **13/13** locally under
.claude/NEXT_SESSION_START_HERE.md:26:- **Technician workflow 21/21**, **customer 19/19**, both driven in a real
.claude/NEXT_SESSION_START_HERE.md:41:node verify/verify-customer-workflow.mjs
.claude/NEXT_SESSION_START_HERE.md:75:**Tip `386ac55`, pushed, tree clean.** Six commits.
.claude/NEXT_SESSION_START_HERE.md:136:**Tip `217a648`, pushed, tree clean.** Owner's instruction mid-session:
.claude/NEXT_SESSION_START_HERE.md:299:**Tip `06ccf8d`, tree clean, pushed.** 634 API tests / 29 files · nav audit
.claude/NEXT_SESSION_START_HERE.md:336:is 61 distinct built routes in workshop-web, ~30% menu coverage, Phase 5 of 11.**
.claude/NEXT_SESSION_START_HERE.md:341:intake, technicians, service bays, calendar and tasks sit beside finished Phase 5
.claude/CURRENT_TASK.md:5:Migration **037 is written, verified 13/13 and pushed**. Applying it to
.claude/CURRENT_TASK.md:42:| `verify-customer-workflow.mjs` | 11/11 screens · 19/19 checks, twice running |
.claude/CURRENT_TASK.md:59:### 🔴 THREE GATES WERE NOT GATES
.claude/CURRENT_TASK.md:116:| B4 | **The four gates were not run on most of this session's 17 commits.** Codex ran once early, `/security-review` once. CLAUDE.md requires Codex → Supervisor → Work Reviewer → Work Scheduler per feature. | `scripts/quality-gate.sh` |
.claude/CURRENT_PHASE.md:45:(Phase 1 / Release 0.1 ✅ complete and tagged `v0.1.0`; Phase 2 identity partially complete —
.claude/CURRENT_PHASE.md:104:part 2 §46–§50 — lands in Phase 3's scope but blocks Phase 5, so it is the next structural item.
README.md:5:Live target: [`autoworkshop.aiappinvent.com`](https://autoworkshop.aiappinvent.com) · Status: **Phase 1 — Release 0.1 (foundation)**
README.md:70:`master` (production-ready) · `develop` (integration) · short-lived `feature/*` branches.

 succeeded in 662ms:
 M reviews/codex-review.md

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"GRANT .* ON .*identity\\.(tenants|organizations|branches|memberships)|GRANT INSERT|ALTER DEFAULT PRIVILEGES|autoworkshop_app\" infrastructure/migrations/0*.sql" in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "recordDecision|recordCustomerDecision|customerDecision|customer-decision|superseded_by|status !== '"'issued'|decidable\" apps/api/src/repair/proposal.service.ts apps/api/src/repair/repair.controller.ts apps/api/src/repair/*.controller.ts" in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"describe\\(|it\\(|customer.*decision|superseded|decidable|CAN_DECIDE_AS_CUSTOMER\" apps/api/src/repair/proposal.spec.ts" in C:\Users\USER\Documents\autoworkshop-ai
 exited 1 in 799ms:
rg: infrastructure/migrations/0*.sql: IO error for operation on infrastructure/migrations/0*.sql: The filename, directory name, or volume label syntax is incorrect. (os error 123)

2026-08-04T14:31:16.685569Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 0.8 seconds
Output:
rg: infrastructure/migrations/0*.sql: IO error for operation on infrastructure/migrations/0*.sql: The filename, directory name, or volume label syntax is incorrect. (os error 123)

 exited 1 in 813ms:
apps/api/src/repair/repair.controller.ts:860:  recordDecision(
apps/api/src/repair/repair.controller.ts:865:    return this.proposals.recordDecision(req.tenantContext, id, body ?? {});
apps/api/src/repair/repair.controller.ts:882:  @Post(':id/customer-decision')
apps/api/src/repair/repair.controller.ts:883:  recordCustomerDecision(
apps/api/src/repair/repair.controller.ts:888:    return this.proposals.recordCustomerDecision(req.tenantContext, id, body ?? {});
apps/api/src/repair/proposal.service.ts:144:  decidable: boolean;
apps/api/src/repair/proposal.service.ts:163: *     writable field left on it is `superseded_by`, because recording the
apps/api/src/repair/proposal.service.ts:306:              SET superseded_by = $1, status = 'superseded', updated_at = now(), updated_by = $2
apps/api/src/repair/proposal.service.ts:440:  async recordDecision(
apps/api/src/repair/proposal.service.ts:477:        `SELECT p.id, p.status, p.version_no, j.job_number, p.superseded_by
apps/api/src/repair/proposal.service.ts:492:            superseded_by: string | null;
apps/api/src/repair/proposal.service.ts:515:      if (row.superseded_by !== null) {
apps/api/src/repair/proposal.service.ts:522:      if (row.status !== 'issued') {
apps/api/src/repair/proposal.service.ts:568:   * ── WHY THIS IS A SEPARATE ROUTE AND NOT A FLAG ON `recordDecision` ────────
apps/api/src/repair/proposal.service.ts:570:   * `recordDecision` is written for STAFF CAPTURE: a customer answers by phone,
apps/api/src/repair/proposal.service.ts:595:  async recordCustomerDecision(
apps/api/src/repair/proposal.service.ts:632:                p.superseded_by
apps/api/src/repair/proposal.service.ts:648:            superseded_by: string | null;
apps/api/src/repair/proposal.service.ts:660:      if (row.status !== 'issued') {
apps/api/src/repair/proposal.service.ts:667:      // 🔴 THE CONTROL, not the affordance. `decidable` hides a superseded
apps/api/src/repair/proposal.service.ts:669:      // `decidable` is documented as a UI convenience and CLAUDE.md §8 is
apps/api/src/repair/proposal.service.ts:677:      if (row.superseded_by !== null) {
apps/api/src/repair/proposal.service.ts:752:              p.decided_by_name, p.decision_channel, p.decision_note, p.superseded_by,
apps/api/src/repair/proposal.service.ts:920:        supersededBy: row.superseded_by,
apps/api/src/repair/proposal.service.ts:994:         * `decidable` evaluated FALSE for every customer — and the customer
apps/api/src/repair/proposal.service.ts:995:         * screen shows its approval form only on `decidable`. The whole
apps/api/src/repair/proposal.service.ts:1011:        decidable:
apps/api/src/repair/proposal.service.ts:1019:          row.superseded_by === null &&
apps/api/src/repair/proposal.service.ts:1201:  superseded_by: string | null;
rg: apps/api/src/repair/*.controller.ts: The filename, directory name, or volume label syntax is incorrect. (os error 123)

2026-08-04T14:31:16.725637Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 0.8 seconds
Output:
apps/api/src/repair/repair.controller.ts:860:  recordDecision(
apps/api/src/repair/repair.controller.ts:865:    return this.proposals.recordDecision(req.tenantContext, id, body ?? {});
apps/api/src/repair/repair.controller.ts:882:  @Post(':id/customer-decision')
apps/api/src/repair/repair.controller.ts:883:  recordCustomerDecision(
apps/api/src/repair/repair.controller.ts:888:    return this.proposals.recordCustomerDecision(req.tenantContext, id, body ?? {});
apps/api/src/repair/proposal.service.ts:144:  decidable: boolean;
apps/api/src/repair/proposal.service.ts:163: *     writable field left on it is `superseded_by`, because recording the
apps/api/src/repair/proposal.service.ts:306:              SET superseded_by = $1, status = 'superseded', updated_at = now(), updated_by = $2
apps/api/src/repair/proposal.service.ts:440:  async recordDecision(
apps/api/src/repair/proposal.service.ts:477:        `SELECT p.id, p.status, p.version_no, j.job_number, p.superseded_by
apps/api/src/repair/proposal.service.ts:492:            superseded_by: string | null;
apps/api/src/repair/proposal.service.ts:515:      if (row.superseded_by !== null) {
apps/api/src/repair/proposal.service.ts:522:      if (row.status !== 'issued') {
apps/api/src/repair/proposal.service.ts:568:   * ── WHY THIS IS A SEPARATE ROUTE AND NOT A FLAG ON `recordDecision` ────────
apps/api/src/repair/proposal.service.ts:570:   * `recordDecision` is written for STAFF CAPTURE: a customer answers by phone,
apps/api/src/repair/proposal.service.ts:595:  async recordCustomerDecision(
apps/api/src/repair/proposal.service.ts:632:                p.superseded_by
apps/api/src/repair/proposal.service.ts:648:            superseded_by: string | null;
apps/api/src/repair/proposal.service.ts:660:      if (row.status !== 'issued') {
apps/api/src/repair/proposal.service.ts:667:      // 🔴 THE CONTROL, not the affordance. `decidable` hides a superseded
apps/api/src/repair/proposal.service.ts:669:      // `decidable` is documented as a UI convenience and CLAUDE.md §8 is
apps/api/src/repair/proposal.service.ts:677:      if (row.superseded_by !== null) {
apps/api/src/repair/proposal.service.ts:752:              p.decided_by_name, p.decision_channel, p.decision_note, p.superseded_by,
apps/api/src/repair/proposal.service.ts:920:        supersededBy: row.superseded_by,
apps/api/src/repair/proposal.service.ts:994:         * `decidable` evaluated FALSE for every customer — and the customer
apps/api/src/repair/proposal.service.ts:995:         * screen shows its approval form only on `decidable`. The whole
apps/api/src/repair/proposal.service.ts:1011:        decidable:
apps/api/src/repair/proposal.service.ts:1019:          row.superseded_by === null &&
apps/api/src/repair/proposal.service.ts:1201:  superseded_by: string | null;
rg: apps/api/src/repair/*.controller.ts: The filename, directory name, or volume label syntax is incorrect. (os error 123)

 succeeded in 740ms:
21: * offer to a customer, that the attribution of a decision is mandatory, and that §424's
97:  superseded_by: null,
173:describe('proposal roles — a commercial offer, not a technical one', () => {
174:  it('refuses a technician and a supervisor', async () => {
175:    const service = () => new ProposalService(fakeDb([]).db, fakeAudit());
188:  it('lets a technician READ one — §32 has them confirm the approval before starting', async () => {
191:    await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'technician', userId: 't9' }));
196:  it('does NOT apply an independence rule between issuer and recorder, by design', () => {
208:describe('prepare — §424 versioning', () => {
209:  it('refuses a card at the wrong stage', async () => {
211:    await expect(new ProposalService(db, fakeAudit()).prepare(ctx(), CARD_ID)).rejects.toThrow(
216:  it('refuses when there is no APPROVED quotation, naming a reachable route', async () => {
223:    await expect(new ProposalService(db, fakeAudit()).prepare(ctx(), CARD_ID)).rejects.toThrow(
228:  it('refuses a second version while one is with the customer', async () => {
233:    await expect(new ProposalService(db, fakeAudit()).prepare(ctx(), CARD_ID)).rejects.toThrow(
238:  it('⚠️ refuses to supersede an APPROVED proposal without a fresh quotation', async () => {
247:    await expect(new ProposalService(db, fakeAudit()).prepare(ctx(), CARD_ID)).rejects.toThrow(
252:  it('creates version n+1 and marks the one it replaces superseded', async () => {
262:    await new ProposalService(db, fakeAudit()).prepare(ctx(), CARD_ID);
265:    const supersede = queries.find((q) => Q.update.test(q.text) && /superseded_by/.test(q.text));
272:describe('the assembled document — §410-§422', () => {
273:  it('resolves a letterhead and an addressee, and a reference both sides can quote', async () => {
275:    const p = only(await new ProposalService(db, fakeAudit()).list(ctx()));
285:  it('falls back to the platform name when no letterhead is configured', async () => {
291:    const p = only(await new ProposalService(db, fakeAudit()).list(ctx()));
298:  it('computes both price tiers, and excludes the optional lines from the lower one', async () => {
300:    const p = only(await new ProposalService(db, fakeAudit()).list(ctx()));
305:  it('applies the discount before tax and never lets the base go negative', async () => {
311:    const p = only(await new ProposalService(db, fakeAudit()).list(ctx()));
315:  it('converts every pg numeric to a number', async () => {
317:    const p = only(await new ProposalService(db, fakeAudit()).list(ctx()));
324:  it('reports the AGREED total once a tier has been accepted', async () => {
332:    const p = only(await new ProposalService(db, fakeAudit()).list(ctx()));
341:describe('recordDecision — §7 and the attribution', () => {
344:    [{ id: PROPOSAL_ID, status: 'issued', version_no: 1, job_number: 'JC-1', superseded_by: null }],
347:  it('requires the customer name and the channel', async () => {
348:    const service = () => new ProposalService(fakeDb([issued]).db, fakeAudit());
361:  it('🔴 refuses a SUPERSEDED version on the STAFF route too', async () => {
362:    // §424: the answer belongs to the CURRENT version. A superseded row can
366:    const superseded = [
368:      [{ id: PROPOSAL_ID, status: 'issued', version_no: 1, job_number: 'JC-1', superseded_by: 'newer' }],
371:      new ProposalService(fakeDb([superseded]).db, fakeAudit()).recordDecision(ctx(), PROPOSAL_ID, {
375:    ).rejects.toThrow(/superseded by a newer proposal/);
378:  it('requires a reason for anything that is not an approval', async () => {
382:      new ProposalService(fakeDb([issued]).db, fakeAudit()).recordDecision(ctx(), PROPOSAL_ID, {
388:  it('requires an option when approving', async () => {
390:      new ProposalService(fakeDb([issued]).db, fakeAudit()).recordDecision(ctx(), PROPOSAL_ID, {
396:  it('⚠️ records the customer as the decider and the staff member separately', async () => {
397:    const audit = spyAudit();
422:  it('refuses a decision on a draft, and a second decision on a settled one', async () => {
423:    const draft = [Q.decisionLookup, [{ id: PROPOSAL_ID, status: 'draft', version_no: 1, job_number: 'JC-1', superseded_by: null }]] as [RegExp, unknown[]];
425:      new ProposalService(fakeDb([draft]).db, fakeAudit()).recordDecision(ctx(), PROPOSAL_ID, {
430:    const done = [Q.decisionLookup, [{ id: PROPOSAL_ID, status: 'approved', version_no: 1, job_number: 'JC-1', superseded_by: null }]] as [RegExp, unknown[]];
432:      new ProposalService(fakeDb([done]).db, fakeAudit()).recordDecision(ctx(), PROPOSAL_ID, {
442:describe('recordCustomerDecision — the customer answers for themselves', () => {
447:    [{ id: PROPOSAL_ID, status: 'issued', version_no: 1, job_number: 'JC-1', display_name: 'Kwame Mensah', superseded_by: null }],
452:  it('🔴 refuses any role that is not the customer', async () => {
457:        new ProposalService(fakeDb([mine]).db, fakeAudit()).recordCustomerDecision(
466:  it('🔴 scopes the lookup to the calling customer, not just to the tenant', async () => {
471:    await new ProposalService(db, fakeAudit()).recordCustomerDecision(
472:      customerCtx(), PROPOSAL_ID, { decision: 'approved', approvedOption: 'recommended' },
479:  it('🔴 derives the decider and the channel — a request cannot set either', async () => {
484:    await new ProposalService(db, fakeAudit()).recordCustomerDecision(
504:  it('marks the audit entry as self-service so a dispute can tell the two apart', async () => {
505:    const audit = spyAudit();
508:      customerCtx(), PROPOSAL_ID, { decision: 'approved', approvedOption: 'recommended' },
517:  it('still requires a reason for anything that is not an approval', async () => {
521:      new ProposalService(fakeDb([mine]).db, fakeAudit()).recordCustomerDecision(
522:        customerCtx(), PROPOSAL_ID, { decision: 'declined' },
527:  it('still requires an option when approving', async () => {
529:      new ProposalService(fakeDb([mine]).db, fakeAudit()).recordCustomerDecision(
530:        customerCtx(), PROPOSAL_ID, { decision: 'approved' },
535:  it('🔴 refuses a SUPERSEDED version even while its status still reads issued', async () => {
536:    // The CONTROL behind the `decidable` flag. Hiding the version from the
538:    // the workshop has replaced would bind them to a superseded price.
539:    const superseded = [
543:        display_name: 'Kwame Mensah', superseded_by: 'a-newer-proposal',
547:      new ProposalService(fakeDb([superseded]).db, fakeAudit()).recordCustomerDecision(
548:        customerCtx(), PROPOSAL_ID, { decision: 'approved', approvedOption: 'recommended' },
553:  it('404s rather than 403s when the proposal is not theirs', async () => {
557:      new ProposalService(fakeDb([[Q.decisionLookup, []]]).db, fakeAudit()).recordCustomerDecision(
558:        customerCtx(), PROPOSAL_ID, { decision: 'approved', approvedOption: 'recommended' },
563:  it('refuses to answer a proposal that was never sent, or was already answered', async () => {
566:      [{ id: PROPOSAL_ID, status: 'draft', version_no: 1, job_number: 'JC-1', display_name: 'K', superseded_by: null }],
569:      new ProposalService(fakeDb([draft]).db, fakeAudit()).recordCustomerDecision(
570:        customerCtx(), PROPOSAL_ID, { decision: 'approved', approvedOption: 'recommended' },
576:      [{ id: PROPOSAL_ID, status: 'approved', version_no: 2, job_number: 'JC-1', display_name: 'K', superseded_by: null }],
579:      new ProposalService(fakeDb([answered]).db, fakeAudit()).recordCustomerDecision(
580:        customerCtx(), PROPOSAL_ID, { decision: 'declined', note: 'changed my mind' },
586:describe('a customer reading proposals', () => {
587:  it('🔴 is narrowed to their own cards by the QUERY, not by the role check', async () => {
592:    await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'customer', userId: 'cust-9' }));
596:  it('does NOT narrow a staff viewer by customer', async () => {
600:    await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'workshop_owner' }));
606:describe('the affordance flags — what the VIEWER is told they may do', () => {
608:   * WHY THIS BLOCK EXISTS. `decidable` was left computing from the STAFF role
611:   * form only on `decidable`. The self-service approval was completely inert
621:  it('🔴 a customer may decide an ISSUED proposal', async () => {
623:    const p = only(await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'customer', userId: 'cust-1' })));
624:    expect(p.decidable, 'the approval form renders on this flag and on nothing else').toBe(true);
627:  it('staff may still decide one — the customer did not displace them', async () => {
629:    const p = only(await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'reception_staff' })));
630:    expect(p.decidable).toBe(true);
633:  it('a role that may read but not answer is NOT offered the choice', async () => {
638:      await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'technician', userId: 't1' })),
640:    expect(p.decidable).toBe(false);
643:  it('nobody may decide a DRAFT — it has not been sent yet', async () => {
645:    const p = only(await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'customer', userId: 'c1' })));
646:    expect(p.decidable).toBe(false);
649:  it('nobody may decide one that was already answered', async () => {
653:    const p = only(await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'customer', userId: 'c1' })));
654:    expect(p.decidable).toBe(false);
657:  it('a customer is never offered the EDIT or ISSUE controls', async () => {
659:    // `decidable` — the same oversight in the other direction.
661:    const p = only(await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'customer', userId: 'c1' })));
667:describe('§424 — immutability', () => {
668:  it('refuses to edit an issued or decided proposal, naming the rule', async () => {
671:      new ProposalService(fakeDb([issuedRow]).db, fakeAudit()).recordNarrative(ctx(), PROPOSAL_ID, {
676:    const approvedRow = [Q.draft, [{ id: PROPOSAL_ID, status: 'approved', version_no: 1, job_number: 'JC-1', superseded_by: null }]] as [RegExp, unknown[]];
678:      new ProposalService(fakeDb([approvedRow]).db, fakeAudit()).recordNarrative(ctx(), PROPOSAL_ID, {
684:  it('refuses to issue without §418s expected result', async () => {
686:      [Q.draft, [{ id: PROPOSAL_ID, status: 'draft', version_no: 1, job_number: 'JC-1', superseded_by: null }]],
691:    await expect(new ProposalService(db, fakeAudit()).issue(ctx(), PROPOSAL_ID)).rejects.toThrow(
699:describe('proposal-rules matches what migration 017 applied', () => {
719:  it('carries exactly the six proposal statuses', () => {
723:  it('carries exactly §7s three decisions', () => {
727:  it('carries exactly §398-§402s offered options', () => {
731:  it('carries exactly §7s channels, and labels each', () => {
738:  it('⚠️ makes the decision attribution MANDATORY at the database level', () => {
748:  it('pins the status and the decision together so they cannot drift', () => {
752:  it('⚠️ refuses to edit a decided proposal, and permits ONLY the supersession', () => {
758:    expect(sql).toMatch(/NEW\.status = 'superseded'/);
761:  it('withholds DELETE entirely — a proposal is superseded, never erased', () => {
768:  it('FORCEs row-level security', () => {
774:  it('requires the letterhead table to be tenant-isolated too — migration 018', () => {

codex
One implementation point is worth checking carefully: migration 037’s “narrow bootstrap door” is implemented with custom session settings. In PostgreSQL those are not inherently privileged, so whether this is truly narrow depends on grants and call surface. I’m checking table grants before I include it as a defect.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"GRANT .*identity\\.(tenants|organizations|branches|memberships)|GRANT INSERT|GRANT SELECT|GRANT UPDATE|GRANT DELETE|autoworkshop_app\" infrastructure/migrations" in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"CREATE POLICY|registration_bootstrap|app\\.bootstrap|bootstrap_user|set_config\" infrastructure/migrations/037_registration_rls_bootstrap.sql" in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"CREATE POLICY|WITH CHECK|USING|identity\\.tenants|identity\\.organizations|identity\\.branches|identity\\.memberships\" infrastructure/migrations/001*.sql infrastructure/migrations/0*.sql" in C:\Users\USER\Documents\autoworkshop-ai
 exited 1 in 541ms:
rg: infrastructure/migrations/001*.sql: The filename, directory name, or volume label syntax is incorrect. (os error 123)
rg: infrastructure/migrations/0*.sql: The filename, directory name, or volume label syntax is incorrect. (os error 123)

2026-08-04T14:31:32.112847Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 0.5 seconds
Output:
rg: infrastructure/migrations/001*.sql: The filename, directory name, or volume label syntax is incorrect. (os error 123)
rg: infrastructure/migrations/0*.sql: The filename, directory name, or volume label syntax is incorrect. (os error 123)

 succeeded in 676ms:
46:--      tenant-owned table: `app.bootstrap = 'on'` and `app.bootstrap_user` =
53:-- also pins `created_by` (or `user_id`) to `app.bootstrap_user`, so even with
62:--     `app.bootstrap_user` therefore fails to match rather than RAISEing a
88:DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.tenants;
89:CREATE POLICY registration_bootstrap_insert ON identity.tenants
92:        current_setting('app.bootstrap', true) = 'on'
93:        AND created_by::text = current_setting('app.bootstrap_user', true)
96:DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.organizations;
97:CREATE POLICY registration_bootstrap_insert ON identity.organizations
100:        current_setting('app.bootstrap', true) = 'on'
101:        AND created_by::text = current_setting('app.bootstrap_user', true)
104:DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.branches;
105:CREATE POLICY registration_bootstrap_insert ON identity.branches
108:        current_setting('app.bootstrap', true) = 'on'
109:        AND created_by::text = current_setting('app.bootstrap_user', true)
116:DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.memberships;
117:CREATE POLICY registration_bootstrap_insert ON identity.memberships
120:        current_setting('app.bootstrap', true) = 'on'
121:        AND created_by::text = current_setting('app.bootstrap_user', true)
122:        AND user_id::text   = current_setting('app.bootstrap_user', true)
129:DROP POLICY IF EXISTS registration_bootstrap_select ON identity.memberships;
130:CREATE POLICY registration_bootstrap_select ON identity.memberships
133:        current_setting('app.bootstrap', true) = 'on'
134:        AND user_id::text = current_setting('app.bootstrap_user', true)
137:COMMENT ON POLICY registration_bootstrap_insert ON identity.tenants IS
139:'app.bootstrap=on, and only for a row attributed to app.bootstrap_user. '
143:COMMENT ON POLICY registration_bootstrap_select ON identity.memberships IS
147:'never fire. Scoped to that single user, and only while app.bootstrap=on.';
197:    PERFORM set_config('app.bootstrap',      'on',          true);
198:    PERFORM set_config('app.bootstrap_user', v_user::text,  true);
208:        PERFORM set_config('app.bootstrap',      '', true);
209:        PERFORM set_config('app.bootstrap_user', '', true);
262:    PERFORM set_config('app.bootstrap',      '', true);
263:    PERFORM set_config('app.bootstrap_user', '', true);
275:'Opens a narrow RLS bootstrap door (app.bootstrap / app.bootstrap_user, both '

 succeeded in 679ms:
infrastructure/migrations\002_application_role.sql:16:-- RULE: the application connects as `autoworkshop_app`, NEVER as the bootstrap
infrastructure/migrations\002_application_role.sql:17:-- superuser. The isolation proof runs as `autoworkshop_app` for the same
infrastructure/migrations\002_application_role.sql:25:    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'autoworkshop_app') THEN
infrastructure/migrations\002_application_role.sql:27:        CREATE ROLE autoworkshop_app
infrastructure/migrations\002_application_role.sql:36:        ALTER ROLE autoworkshop_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
infrastructure/migrations\002_application_role.sql:40:GRANT CONNECT ON DATABASE autoworkshop TO autoworkshop_app;
infrastructure/migrations\002_application_role.sql:42:GRANT USAGE ON SCHEMA identity TO autoworkshop_app;
infrastructure/migrations\002_application_role.sql:43:GRANT USAGE ON SCHEMA audit    TO autoworkshop_app;
infrastructure/migrations\002_application_role.sql:44:GRANT USAGE ON SCHEMA public   TO autoworkshop_app;
infrastructure/migrations\002_application_role.sql:48:GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA identity TO autoworkshop_app;
infrastructure/migrations\002_application_role.sql:49:GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA identity TO autoworkshop_app;
infrastructure/migrations\002_application_role.sql:53:GRANT SELECT, INSERT ON audit.events TO autoworkshop_app;
infrastructure/migrations\002_application_role.sql:54:GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA audit TO autoworkshop_app;
infrastructure/migrations\002_application_role.sql:56:GRANT SELECT ON public.schema_migrations TO autoworkshop_app;
infrastructure/migrations\002_application_role.sql:62:    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO autoworkshop_app;
infrastructure/migrations\002_application_role.sql:64:    GRANT USAGE, SELECT ON SEQUENCES TO autoworkshop_app;
infrastructure/migrations\002_application_role.sql:66:    GRANT SELECT, INSERT ON TABLES TO autoworkshop_app;
infrastructure/migrations\002_application_role.sql:68:    GRANT USAGE, SELECT ON SEQUENCES TO autoworkshop_app;
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:7:-- `autoworkshop_app` with no tenant context, which is exactly the state the
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:24:--     current_user = autoworkshop_app, rolsuper = f
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:57:-- neither, while 002 grants SELECT on it to `autoworkshop_app`. Confirmed live:
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:122:GRANT EXECUTE ON FUNCTION identity.memberships_for_subject(TEXT) TO autoworkshop_app;
infrastructure/migrations\004_core_customers_and_vehicles.sql:248:-- The application connects as autoworkshop_app (NOSUPERUSER, NOBYPASSRLS).
infrastructure/migrations\004_core_customers_and_vehicles.sql:254:GRANT USAGE ON SCHEMA core TO autoworkshop_app;
infrastructure/migrations\004_core_customers_and_vehicles.sql:256:GRANT SELECT, INSERT, UPDATE, DELETE ON core.customers TO autoworkshop_app;
infrastructure/migrations\004_core_customers_and_vehicles.sql:257:GRANT SELECT, INSERT, UPDATE, DELETE ON core.vehicles  TO autoworkshop_app;
infrastructure/migrations\004_core_customers_and_vehicles.sql:262:GRANT SELECT, INSERT ON core.vehicle_makes  TO autoworkshop_app;
infrastructure/migrations\004_core_customers_and_vehicles.sql:263:GRANT SELECT, INSERT ON core.vehicle_models TO autoworkshop_app;
infrastructure/migrations\004_core_customers_and_vehicles.sql:266:    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO autoworkshop_app;
infrastructure/migrations\004_core_customers_and_vehicles.sql:268:    GRANT USAGE, SELECT ON SEQUENCES TO autoworkshop_app;
infrastructure/migrations\006_repair_job_cards.sql:180:GRANT USAGE ON SCHEMA repair TO autoworkshop_app;
infrastructure/migrations\006_repair_job_cards.sql:181:GRANT SELECT, INSERT, UPDATE, DELETE ON repair.job_cards TO autoworkshop_app;
infrastructure/migrations\006_repair_job_cards.sql:183:GRANT SELECT, INSERT, UPDATE ON repair.job_number_counters TO autoworkshop_app;
infrastructure/migrations\006_repair_job_cards.sql:184:GRANT EXECUTE ON FUNCTION repair.next_job_number(uuid) TO autoworkshop_app;
infrastructure/migrations\006_repair_job_cards.sql:187:    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO autoworkshop_app;
infrastructure/migrations\006_repair_job_cards.sql:189:    GRANT USAGE, SELECT ON SEQUENCES TO autoworkshop_app;
infrastructure/migrations\008_job_card_stage_events.sql:40:-- ⚠️ Migration 006 ran `ALTER DEFAULT PRIVILEGES IN SCHEMA repair GRANT SELECT,
infrastructure/migrations\008_job_card_stage_events.sql:41:-- INSERT, UPDATE, DELETE ON TABLES TO autoworkshop_app`. So a new table in this
infrastructure/migrations\008_job_card_stage_events.sql:114:GRANT SELECT, INSERT ON repair.job_card_stage_events TO autoworkshop_app;
infrastructure/migrations\008_job_card_stage_events.sql:117:REVOKE UPDATE, DELETE ON repair.job_card_stage_events FROM autoworkshop_app;
infrastructure/migrations\012_repair_diagnoses.sql:324:GRANT SELECT, INSERT, UPDATE ON repair.diagnoses           TO autoworkshop_app;
infrastructure/migrations\012_repair_diagnoses.sql:325:GRANT SELECT, INSERT, UPDATE ON repair.diagnostic_findings TO autoworkshop_app;
infrastructure/migrations\012_repair_diagnoses.sql:326:REVOKE DELETE ON repair.diagnoses           FROM autoworkshop_app;
infrastructure/migrations\012_repair_diagnoses.sql:327:REVOKE DELETE ON repair.diagnostic_findings FROM autoworkshop_app;
infrastructure/migrations\010_repair_inspections.sql:218:-- ⚠️ THIS IS THE SLICE-2 LESSON APPLIED. There, `GRANT SELECT, INSERT` LOOKED
infrastructure/migrations\010_repair_inspections.sql:321:GRANT SELECT, INSERT, UPDATE ON repair.inspections      TO autoworkshop_app;
infrastructure/migrations\010_repair_inspections.sql:322:GRANT SELECT, INSERT, UPDATE ON repair.inspection_items TO autoworkshop_app;
infrastructure/migrations\010_repair_inspections.sql:323:REVOKE DELETE ON repair.inspections      FROM autoworkshop_app;
infrastructure/migrations\010_repair_inspections.sql:324:REVOKE DELETE ON repair.inspection_items FROM autoworkshop_app;
infrastructure/migrations\013_diagnostic_finding_removal.sql:41:GRANT DELETE ON repair.diagnostic_findings TO autoworkshop_app;
infrastructure/migrations\013_diagnostic_finding_removal.sql:45:REVOKE DELETE ON repair.diagnoses FROM autoworkshop_app;
infrastructure/migrations\015_repair_plan_identity_immutable.sql:12:-- `GRANT UPDATE ON repair.repair_plans` is needed — a plan is worked on over a
infrastructure/migrations\015_repair_plan_identity_immutable.sql:19:-- succeeds. CONFIRMED BY EXPERIMENT as `autoworkshop_app` under RLS, not
infrastructure/migrations\014_repair_plans.sql:561:GRANT SELECT, INSERT, UPDATE         ON repair.repair_plans           TO autoworkshop_app;
infrastructure/migrations\014_repair_plans.sql:562:GRANT SELECT, INSERT, UPDATE, DELETE ON repair.repair_plan_tasks      TO autoworkshop_app;
infrastructure/migrations\014_repair_plans.sql:563:GRANT SELECT, INSERT, UPDATE, DELETE ON repair.repair_plan_resources  TO autoworkshop_app;
infrastructure/migrations\014_repair_plans.sql:564:REVOKE DELETE ON repair.repair_plans FROM autoworkshop_app;
infrastructure/migrations\016_quotations.sql:520:GRANT SELECT, INSERT, UPDATE         ON repair.quotations           TO autoworkshop_app;
infrastructure/migrations\016_quotations.sql:521:GRANT SELECT, INSERT, UPDATE, DELETE ON repair.quotation_lines      TO autoworkshop_app;
infrastructure/migrations\016_quotations.sql:522:GRANT SELECT, INSERT, UPDATE         ON repair.organization_pricing TO autoworkshop_app;
infrastructure/migrations\016_quotations.sql:523:REVOKE DELETE ON repair.quotations           FROM autoworkshop_app;
infrastructure/migrations\016_quotations.sql:524:REVOKE DELETE ON repair.organization_pricing FROM autoworkshop_app;
infrastructure/migrations\017_repair_proposals.sql:363:GRANT SELECT, INSERT, UPDATE ON repair.repair_proposals TO autoworkshop_app;
infrastructure/migrations\017_repair_proposals.sql:364:REVOKE DELETE ON repair.repair_proposals FROM autoworkshop_app;
infrastructure/migrations\018_organization_profile.sql:101:GRANT SELECT, INSERT, UPDATE ON core.organization_profile TO autoworkshop_app;
infrastructure/migrations\018_organization_profile.sql:102:REVOKE DELETE ON core.organization_profile FROM autoworkshop_app;
infrastructure/migrations\019_repair_execution.sql:597:GRANT SELECT, INSERT, UPDATE         ON repair.repair_executions      TO autoworkshop_app;
infrastructure/migrations\019_repair_execution.sql:598:GRANT SELECT, INSERT, UPDATE, DELETE ON repair.execution_tasks        TO autoworkshop_app;
infrastructure/migrations\019_repair_execution.sql:599:GRANT SELECT, INSERT, UPDATE, DELETE ON repair.execution_time_entries TO autoworkshop_app;
infrastructure/migrations\019_repair_execution.sql:600:GRANT SELECT, INSERT, UPDATE, DELETE ON repair.execution_parts_used   TO autoworkshop_app;
infrastructure/migrations\019_repair_execution.sql:601:GRANT SELECT, INSERT, UPDATE, DELETE ON repair.execution_evidence     TO autoworkshop_app;
infrastructure/migrations\019_repair_execution.sql:602:REVOKE DELETE ON repair.repair_executions FROM autoworkshop_app;
infrastructure/migrations\020_repair_testing.sql:435:GRANT SELECT, INSERT, UPDATE         ON repair.repair_test_sessions TO autoworkshop_app;
infrastructure/migrations\020_repair_testing.sql:436:GRANT SELECT, INSERT, UPDATE, DELETE ON repair.repair_test_results  TO autoworkshop_app;
infrastructure/migrations\020_repair_testing.sql:437:REVOKE DELETE ON repair.repair_test_sessions FROM autoworkshop_app;
infrastructure/migrations\022_marketplace_orders.sql:332:GRANT SELECT, INSERT, UPDATE, DELETE ON catalogue.orders       TO autoworkshop_app;
infrastructure/migrations\022_marketplace_orders.sql:333:GRANT SELECT, INSERT, UPDATE, DELETE ON catalogue.order_lines  TO autoworkshop_app;
infrastructure/migrations\022_marketplace_orders.sql:334:GRANT SELECT, INSERT                 ON catalogue.order_events TO autoworkshop_app;
infrastructure/migrations\022_marketplace_orders.sql:338:-- `autoworkshop_app` at CREATE TABLE time, so the narrower GRANT above does NOT
infrastructure/migrations\022_marketplace_orders.sql:346:REVOKE UPDATE, DELETE ON catalogue.order_events FROM autoworkshop_app;
infrastructure/migrations\021_public_catalogue.sql:40:GRANT USAGE ON SCHEMA catalogue TO autoworkshop_app;
infrastructure/migrations\021_public_catalogue.sql:246:GRANT SELECT, INSERT, UPDATE, DELETE ON catalogue.suppliers          TO autoworkshop_app;
infrastructure/migrations\021_public_catalogue.sql:247:GRANT SELECT, INSERT, UPDATE, DELETE ON catalogue.part_categories    TO autoworkshop_app;
infrastructure/migrations\021_public_catalogue.sql:248:GRANT SELECT, INSERT, UPDATE, DELETE ON catalogue.parts              TO autoworkshop_app;
infrastructure/migrations\021_public_catalogue.sql:249:GRANT SELECT, INSERT, UPDATE, DELETE ON catalogue.part_fitments      TO autoworkshop_app;
infrastructure/migrations\021_public_catalogue.sql:250:GRANT SELECT, INSERT, UPDATE, DELETE ON catalogue.mechanic_directory TO autoworkshop_app;
infrastructure/migrations\023_supplier_accounts.sql:101:GRANT EXECUTE ON FUNCTION catalogue.current_user_supplies(UUID) TO autoworkshop_app;
infrastructure/migrations\023_supplier_accounts.sql:243:GRANT SELECT, INSERT, UPDATE, DELETE ON catalogue.supplier_users TO autoworkshop_app;
infrastructure/migrations\027_mechanic_directory_optin.sql:87:GRANT EXECUTE ON FUNCTION identity.current_organization_id() TO autoworkshop_app;
infrastructure/migrations\027_mechanic_directory_optin.sql:88:GRANT EXECUTE ON FUNCTION identity.current_user_governs_organization() TO autoworkshop_app;
infrastructure/migrations\025_platform_admin_role_name.sql:74:GRANT EXECUTE ON FUNCTION identity.is_platform_admin() TO autoworkshop_app;
infrastructure/migrations\032_repair_variations.sql:252:GRANT SELECT, INSERT, UPDATE ON repair.repair_variations TO autoworkshop_app;
infrastructure/migrations\032_repair_variations.sql:253:REVOKE DELETE ON repair.repair_variations FROM autoworkshop_app;
infrastructure/migrations\031_quality_control_hardening.sql:111:GRANT  EXECUTE ON FUNCTION repair.user_worked_on_job_card(uuid, uuid) TO autoworkshop_app;
infrastructure/migrations\033_variation_hardening.sql:88:GRANT SELECT, INSERT ON repair.variation_decisions TO autoworkshop_app;
infrastructure/migrations\033_variation_hardening.sql:89:REVOKE UPDATE, DELETE ON repair.variation_decisions FROM autoworkshop_app;
infrastructure/migrations\030_quality_control.sql:286:GRANT SELECT, INSERT, UPDATE ON repair.quality_inspections TO autoworkshop_app;
infrastructure/migrations\030_quality_control.sql:287:REVOKE DELETE ON repair.quality_inspections FROM autoworkshop_app;
infrastructure/migrations\036_signup_and_workshop_registration.sql:113:GRANT EXECUTE ON FUNCTION identity.provision_user_from_subject(TEXT, TEXT, TEXT) TO autoworkshop_app;
infrastructure/migrations\036_signup_and_workshop_registration.sql:230:GRANT EXECUTE ON FUNCTION identity.register_workshop(TEXT, TEXT, TEXT) TO autoworkshop_app;
infrastructure/migrations\035_keycloak_schema_and_role.sql:15:-- `autoworkshop_app` would mean:
infrastructure/migrations\035_keycloak_schema_and_role.sql:20:--   * `autoworkshop_app` could read Keycloak's credential tables — which
infrastructure/migrations\035_keycloak_schema_and_role.sql:84:REVOKE ALL ON SCHEMA keycloak FROM autoworkshop_app;
infrastructure/migrations\037_registration_rls_bootstrap.sql:280:GRANT EXECUTE ON FUNCTION identity.register_workshop(TEXT, TEXT, TEXT) TO autoworkshop_app;
infrastructure/migrations\verify\015_plan_identity_immutable.sql:2:-- Proof by EFFECT for migration 015 — run as `autoworkshop_app`, under RLS.
infrastructure/migrations\verify\015_plan_identity_immutable.sql:28:GRANT SELECT ON t_target TO autoworkshop_app;
infrastructure/migrations\verify\015_plan_identity_immutable.sql:30:SET ROLE autoworkshop_app;
infrastructure/migrations\verify\014_repair_plans.sql:2:-- Proof by EFFECT for migration 014 — run as `autoworkshop_app`, the role the
infrastructure/migrations\verify\014_repair_plans.sql:33:GRANT SELECT ON t_target TO autoworkshop_app;
infrastructure/migrations\verify\014_repair_plans.sql:35:SET ROLE autoworkshop_app;
infrastructure/migrations\verify\013_finding_removal.sql:2:-- Proof by EFFECT for migration 013 — run as `autoworkshop_app`, the role the
infrastructure/migrations\verify\013_finding_removal.sql:35:GRANT SELECT ON t_target TO autoworkshop_app;
infrastructure/migrations\verify\013_finding_removal.sql:37:SET ROLE autoworkshop_app;
infrastructure/migrations\verify\023_supplier_accounts.sql:16:-- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.
infrastructure/migrations\verify\023_supplier_accounts.sql:21:GRANT SELECT ON _fx TO autoworkshop_app;
infrastructure/migrations\verify\023_supplier_accounts.sql:58:SET LOCAL ROLE autoworkshop_app;
infrastructure/migrations\verify\022_marketplace_orders.sql:14:-- `autoworkshop_app` — the role the API actually connects as, and the one that
infrastructure/migrations\verify\022_marketplace_orders.sql:28:-- The assertions run as `autoworkshop_app`, which does not own this temp table
infrastructure/migrations\verify\022_marketplace_orders.sql:31:GRANT SELECT ON _fx TO autoworkshop_app;
infrastructure/migrations\verify\022_marketplace_orders.sql:76:SET LOCAL ROLE autoworkshop_app;
infrastructure/migrations\verify\021_public_catalogue.sql:3:-- Runs as `autoworkshop_app` with NO tenant context and NO admin role — i.e.
infrastructure/migrations\verify\021_public_catalogue.sql:16:SET LOCAL ROLE autoworkshop_app;
infrastructure/migrations\verify\021_public_catalogue.sql:54:  RAISE NOTICE 'check 2 OK: unpublished supplier is invisible to autoworkshop_app';
infrastructure/migrations\verify\016_quotations.sql:2:-- Proof by EFFECT for migration 016 — run as `autoworkshop_app`, under RLS.
infrastructure/migrations\verify\016_quotations.sql:24:GRANT SELECT ON t_target TO autoworkshop_app;
infrastructure/migrations\verify\016_quotations.sql:26:SET ROLE autoworkshop_app;
infrastructure/migrations\verify\026_fitment_publication_guard.sql:17:-- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.
infrastructure/migrations\verify\026_fitment_publication_guard.sql:24:GRANT SELECT ON _fx TO autoworkshop_app;
infrastructure/migrations\verify\026_fitment_publication_guard.sql:58:SET LOCAL ROLE autoworkshop_app;
infrastructure/migrations\verify\025_platform_admin_role_name.sql:12:-- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.
infrastructure/migrations\verify\025_platform_admin_role_name.sql:19:GRANT SELECT ON _fx TO autoworkshop_app;
infrastructure/migrations\verify\025_platform_admin_role_name.sql:43:SET LOCAL ROLE autoworkshop_app;
infrastructure/migrations\verify\024_supplier_catalogue.sql:16:-- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.
infrastructure/migrations\verify\024_supplier_catalogue.sql:31:GRANT SELECT ON _fx TO autoworkshop_app;
infrastructure/migrations\verify\024_supplier_catalogue.sql:70:SET LOCAL ROLE autoworkshop_app;
infrastructure/migrations\verify\028_directory_member_read.sql:14:-- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.
infrastructure/migrations\verify\028_directory_member_read.sql:21:GRANT SELECT ON _fx TO autoworkshop_app;
infrastructure/migrations\verify\028_directory_member_read.sql:43:SET LOCAL ROLE autoworkshop_app;
infrastructure/migrations\verify\027_mechanic_directory_optin.sql:15:-- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.
infrastructure/migrations\verify\027_mechanic_directory_optin.sql:22:GRANT SELECT ON _fx TO autoworkshop_app;
infrastructure/migrations\verify\027_mechanic_directory_optin.sql:45:SET LOCAL ROLE autoworkshop_app;
infrastructure/migrations\verify\029_pricing_write_scope.sql:21:-- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.
infrastructure/migrations\verify\029_pricing_write_scope.sql:28:GRANT SELECT ON _fx TO autoworkshop_app;
infrastructure/migrations\verify\029_pricing_write_scope.sql:84:SET LOCAL ROLE autoworkshop_app;
infrastructure/migrations\verify\029_pricing_write_scope.sql:271:  --     application connects as `autoworkshop_app` (NOSUPERUSER) so this table
infrastructure/migrations\verify\030_quality_control.sql:15:-- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.
infrastructure/migrations\verify\030_quality_control.sql:22:GRANT SELECT ON _fx TO autoworkshop_app;
infrastructure/migrations\verify\030_quality_control.sql:100:SET LOCAL ROLE autoworkshop_app;
infrastructure/migrations\verify\031_quality_control_hardening.sql:17:-- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.
infrastructure/migrations\verify\031_quality_control_hardening.sql:24:GRANT SELECT ON _fx TO autoworkshop_app;
infrastructure/migrations\verify\031_quality_control_hardening.sql:89:SET LOCAL ROLE autoworkshop_app;
infrastructure/migrations\verify\031_quality_control_hardening.sql:180:  IF NOT has_function_privilege('autoworkshop_app',
infrastructure/migrations\verify\032_repair_variations.sql:14:-- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.
infrastructure/migrations\verify\032_repair_variations.sql:21:GRANT SELECT ON _fx TO autoworkshop_app;
infrastructure/migrations\verify\032_repair_variations.sql:51:SET LOCAL ROLE autoworkshop_app;
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql:8:-- `SET LOCAL ROLE autoworkshop_app` and asserted `current_user`. That was
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql:22:-- It re-owns the function to `autoworkshop_app` — a plain, non-superuser role —
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql:49:GRANT SELECT ON _fx TO autoworkshop_app;
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql:57:ALTER FUNCTION identity.register_workshop(TEXT, TEXT, TEXT)          OWNER TO autoworkshop_app;
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql:58:ALTER FUNCTION identity.provision_user_from_subject(TEXT, TEXT, TEXT) OWNER TO autoworkshop_app;
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql:60:SET LOCAL ROLE autoworkshop_app;
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql:77:  IF current_user <> 'autoworkshop_app' THEN
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql:78:    RAISE EXCEPTION 'MEASUREMENT INVALID: caller is %, not autoworkshop_app', current_user;
infrastructure/migrations\verify\033_variation_hardening.sql:16:-- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.
infrastructure/migrations\verify\033_variation_hardening.sql:23:GRANT SELECT ON _fx TO autoworkshop_app;
infrastructure/migrations\verify\033_variation_hardening.sql:49:SET LOCAL ROLE autoworkshop_app;
infrastructure/migrations\verify\036_signup_and_workshop_registration.sql:3:-- ⚠️ EVERY ASSERTION BELOW RUNS AS `autoworkshop_app`, NEVER AS THE OWNER, and
infrastructure/migrations\verify\036_signup_and_workshop_registration.sql:27:-- `autoworkshop_app`, ROLLS BACK.
infrastructure/migrations\verify\036_signup_and_workshop_registration.sql:37:GRANT SELECT ON _fx TO autoworkshop_app;
infrastructure/migrations\verify\036_signup_and_workshop_registration.sql:42:SET LOCAL ROLE autoworkshop_app;
infrastructure/migrations\verify\036_signup_and_workshop_registration.sql:54:  IF current_user <> 'autoworkshop_app' THEN
infrastructure/migrations\verify\036_signup_and_workshop_registration.sql:55:    RAISE EXCEPTION 'MEASUREMENT INVALID: running as %, not autoworkshop_app', current_user;

codex
Checklist of defects found:

- [ ] **High** — [infrastructure/migrations/037_registration_rls_bootstrap.sql](/c:/Users/USER/Documents/autoworkshop-ai/infrastructure/migrations/037_registration_rls_bootstrap.sql:88)  
  **What’s wrong:** The RLS bootstrap policies trust mutable custom GUCs: `app.bootstrap` and `app.bootstrap_user`. `autoworkshop_app` already has broad DML on `identity` tables from [002_application_role.sql](/c:/Users/USER/Documents/autoworkshop-ai/infrastructure/migrations/002_application_role.sql:48), so any SQL execution path as the app role can `SET app.bootstrap='on'` and satisfy these policies directly.  
  **Recommended fix:** Add a non-spoofable predicate, e.g. require the SECURITY DEFINER owner via `current_user = 'autoworkshop'`, or redesign so direct app-role table DML cannot use the bootstrap path. Add a verify case that, as `autoworkshop_app`, explicitly sets both GUCs and proves direct INSERT/SELECT is still refused.  
  **Why it matters:** README says RLS is enforced in infrastructure, not policy text. This makes the new “narrow bootstrap door” wider than documented.

- [ ] **High** — [.claude/CURRENT_TASK.md](/c:/Users/USER/Documents/autoworkshop-ai/.claude/CURRENT_TASK.md:12)  
  **What’s wrong:** The repo is on `master`, README says `master` is production-ready, but the control file says live workshop registration still 500s and no workshop can be created.  
  **Recommended fix:** Either do not land this state on `master`, or update README/release status to explicitly mark production as blocked until migration 037 is applied.  
  **Why it matters:** Operators and reviewers will treat `master` as deployable while a primary production signup path is knowingly broken.

- [ ] **Medium** — [README.md](/c:/Users/USER/Documents/autoworkshop-ai/README.md:5)  
  **What’s wrong:** README still says `Phase 1 — Release 0.1 (foundation)`, while [.claude/CURRENT_PHASE.md](/c:/Users/USER/Documents/autoworkshop-ai/.claude/CURRENT_PHASE.md:3) says `PHASE 5 — Release 0.4`.  
  **Recommended fix:** Update README status or make `.claude/CURRENT_PHASE.md` clearly subordinate/non-release-truth.  
  **Why it matters:** The stated requirement baseline is ambiguous, so future review can target the wrong acceptance criteria.

- [ ] **Medium** — [.claude/NEXT_SESSION_START_HERE.md](/c:/Users/USER/Documents/autoworkshop-ai/.claude/NEXT_SESSION_START_HERE.md:11)  
  **What’s wrong:** It claims tip `59e3838`, pushed, tree clean, but latest commit shown by `git show` is `80ede42`; current worktree also shows `M reviews/codex-review.md`.  
  **Recommended fix:** Replace the stale tip/tree-clean statement with the actual HEAD and current dirty-state note.  
  **Why it matters:** The next session starts from a false baseline and may skip reviewing uncommitted work.

- [ ] **Medium** — [.claude/CURRENT_PHASE.md](/c:/Users/USER/Documents/autoworkshop-ai/.claude/CURRENT_PHASE.md:11)  
  **What’s wrong:** Customer workflow count is inconsistent: this file says “19/19 in a browser”, [.claude/CURRENT_TASK.md](/c:/Users/USER/Documents/autoworkshop-ai/.claude/CURRENT_TASK.md:42) says `11/11 screens · 19/19 checks`, and [.claude/NEXT_SESSION_START_HERE.md](/c:/Users/USER/Documents/autoworkshop-ai/.claude/NEXT_SESSION_START_HERE.md:26) says `customer 19/19`.  
  **Recommended fix:** Standardize wording as either screens or checks everywhere.  
  **Why it matters:** These docs are being used as gates; mixing screen count and check count makes skipped coverage easier to miss.

- [ ] **Low** — [.claude/CURRENT_TASK.md](/c:/Users/USER/Documents/autoworkshop-ai/.claude/CURRENT_TASK.md:59)  
  **What’s wrong:** Heading says “THREE GATES WERE NOT GATES”, but only two bullets are listed; later line 116 refers to “four gates”.  
  **Recommended fix:** Name all gates consistently and state which were fixed versus still manual/unrun.  
  **Why it matters:** Gate failures are the main lesson recorded here; imprecise accounting weakens the handoff.
tokens used
81,068
