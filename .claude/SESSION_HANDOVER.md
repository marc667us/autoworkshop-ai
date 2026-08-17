# Session handover

## ═══ 2026-08-17 — the org-admin roles, and an instrument that could not fail ═══

**Tip `fa0b38e`. Six commits (`1c6d591` → `fa0b38e`). Tree clean, all pushed.**

### ▶ NEXT SESSION STARTS AT `.claude/TASK_LIST_2026-08-17.md`

`scripts/start-session.sh` now DERIVES that pointer (newest
`TASK_LIST_[0-9]*.md`) and prints every control file's age, so it will keep
finding the right file without anyone editing the script.

```bash
bash scripts/start-session.sh          # ALWAYS first
```

### State, measured after the deploy — not quoted

| | |
|---|---|
| typecheck / lint | **11/11** · **10/10** |
| Unit tests | **972 API passed · 1 skipped** (964 at session start; +8 from the new regression net) |
| `verify/085` · `verify/080` | **6/6** · **6/6** |
| **Live suite — anonymous** | **66 passed · 0 failed · 1 skipped** after every one of the four deploys |
| **Live suite — signed-in** | 🔴 **NOT RUN — 4 checks UNMEASURED.** Blocked by `gh` auth |
| Screen coverage | **274 of 385 (71%)**, 410 menu entries, **109** dead ends (was 273 / 110) |
| Migrations in repo | **83** (085 added). 🔴 **NOT applied to production** |

### 🔴 THREE THINGS FOR THE OWNER, IN ORDER

1. **`gh`'s keyring token is invalid.** `git push` still works — separate
   credential store — which is exactly the partial failure that reads as
   "everything is fine". Until it is fixed **no workflow can be listed or
   dispatched**: the signed-in live suite, `apply-migrations`, every diagnostic.
   `! gh auth login -h github.com`
2. **Then apply migration 085.** Verified in `apply-migrations.yml`, not quoted:
   the `workflow_run` trigger leaves `confirm` unset, and unset means
   **inspect-only**. Until it lands, `POST /registration/insurance` **replies
   `insurance_owner` while the database writes `insurance_assessor`** — a
   misleading response, not a failure. Nothing else regresses.
   `gh workflow run apply-migrations.yml -f confirm=APPLY`, then **confirm the
   run STARTED** — the shared firewall concurrency group silently evicts a
   pending run.
3. **An open question I found and did not chase.**
   `/insurance/sales/my-products` and `/insurance/home/dashboard` answer **200
   to an anonymous visitor**. Both carry sign-in markers so it is most likely
   the app shell, **but keyword matching cannot settle it.** If any real product
   or policy row renders before sign-in, that is a leak.

### What shipped

**1. `scripts/start-session.sh` — the instrument was lying in three ways.**
It reported `[FAIL] Docker is not responding` and `exit 1` while all five
containers were healthy (the CLI was simply not on that shell's PATH); its
pointer named two files **12 and 9 days stale** and printed `[OK]` on both; and
its migration check tested **sed's** exit code, so the failure branch was
unreachable. Now: tooling gaps and outages are separate findings, the pointer is
derived with ages printed, and it ends with **passed / failed / SKIPPED /
warnings** plus a non-zero exit — it previously exited 0 while printing its own
red.

**2. Migration 085 — `insurance_owner` and `towing_owner`.** Two of the six
self-service organisation types could never appoint anybody:
`CAN_GRANT_MEMBERSHIP` held four roles and neither operational role was among
them, `membership.service.ts` has the only membership INSERT in the API, and 080
writes just the founder. Ten insurance screens and ten towing screens above a
team that could not be assembled.

**3. T1a — the screens that make it usable.** One implementation in
`app/_shared/org-staff/`; insurance gets the new route
`/insurance/settings/users`, towing renders the section inside its existing
`/operations/settings` (§52 defines one settings entry, and changing approved
navigation is prohibited).

### 🔴 THE LESSON OF THE DAY: THE REVIEWERS FOUND TWENTY-SEVEN THINGS, AND THE SHARPEST WERE ABOUT CLAIMS I HAD JUST MADE

Codex: 9 on the script, 6 on 085, 4 on T1a. The Supervisor, run independently:
**10 more on 085 and 8 more on T1a that Codex did not find.** Ninth consecutive
session in which neither reviewer alone was sufficient.

Three of them are worth carrying:

- 🔴 **A MIGRATION THAT PASSED LOCALLY AND WOULD HAVE DONE NOTHING ON RENDER.**
  The backfill ran before its admin context was set. Locally `autoworkshop` is
  `rolsuper = t, rolbypassrls = t`, so RLS never applied and every check passed;
  on Render the owner is not a superuser and the CTE would have seen **zero
  rows**. Measured, not argued: as the owner, `identity.is_platform_admin()`
  returns **`f` without** the context and **`t` with** it.
- 🔴 **"THE WRITE HALF OPENED, THE READ HALF DID NOT" — FOUR TIMES IN ONE DAY.**
  `CAN_GRANT_MEMBERSHIP` without the roster · `CAN_CREATE_BRANCH` without the
  branch list · `MembershipService.list()` widened and `UserService.list()` not
  · and `grant()` tenant-scoped while `withdraw()` became org-scoped, producing
  memberships an admin could create and could not revoke.
  **`apps/api/src/identity/org-admin-access.spec.ts` is now the net for that
  shape**, and it is PROVEN to discriminate — reverting a gate fails it by file
  and line.
- 🔴 **MY OWN REGRESSION TEST HAD THE DEFECT IT WAS WRITTEN TO CATCH.** It
  anchored on the first `UPDATE identity.memberships`, which is the reinstate
  inside `grant()`, so it would have passed with the organisation predicate
  deleted from `withdraw()`.

⚠️ **AND ONE REVIEWER FINDING WAS RIGHT IN DIAGNOSIS AND WRONG IN REMEDY.** The
Supervisor showed my comment "§52's towing tree has no gated entry" was false —
it gates two. But granting `towing_operator` `finance.read` is refused by
`permission-matrix.spec.ts`: a dispatcher is not a bookkeeper. **The empty list
was correct; only the comment was wrong.** Check every finding against source.

### 🔴 MY WORST ERROR: I SEVERED THE DOCKER STACK

Widening the kill list to cover `scripts/start-local.sh`, I matched any
`<word>:<port>` — which also matches **`localhost:8080` inside a URL**. 8080
entered the KILL list, section 2 killed the process listening on it, and on
Windows that is **Docker Desktop's port proxy**. It took the API pipe with it:
every container unreachable, and the next probes reported an outage that reads
exactly like the 2026-08-01 host-forwarding fault. Docker Desktop had to be
restarted by hand, and `evercoat-postgres` — **another project's database** —
went down with it.

Two independent guards now, and the refusal is printed rather than silent:
the parse is anchored on `APPS`, and `INFRA_PORTS`
(`5432, 8080, 6379, 4222, 9000, 9001, 3478, 1025, 8025`) can never be killed
whatever any parse says.

▶ **THE RULE THAT WOULD HAVE PREVENTED IT: a widened kill list is a DESTRUCTIVE
change and must be DRY-RUN before it is executed.** The port-scan block runs
standalone — do that first, every time.

⚠️ A second outage followed and was **not** mine: `Docker Desktop Installer` was
running and the API version moved **v1.54 → v1.55** across the restart. Docker
was auto-updating itself. Two causes, and conflating them would have sent the
next session hunting the wrong one.

### New in the repo this session

| Path | What it is |
|---|---|
| `scripts/run-live-suite-locally.sh` | Runs the anonymous live suite **without `gh`**, by extracting the inline Python out of `live-suite.yml`. Warms with `-L` first — the pack roots are `redirect()` stubs, so without it the destination is never woken. Proven: 66/0/1. |
| `scripts/proofs/prove-085-backfill.sql` | Adversarial proof of 085's founder rule, rolled back: founder promoted · later assessor **not** · admin-created first member **not** · later self-created row **not**. |
| `scripts/proofs/prove-085-rls.sql` | Shows the backfill's visibility as `autoworkshop_app` vs the owner — the local-superuser trap in one file. |
| `apps/api/src/identity/org-admin-access.spec.ts` | The write-half/read-half regression net. |
| `infrastructure/migrations/085_*` + `verify/085_*` | The org-admin roles and their proof. |

⚠️ **`verify/080` WAS EDITED, DELIBERATELY.** 085 replaces the functions it
asserts, so `rehearse-migration.yml migration=080` — a supported operation —
would have been a guaranteed red run against a correct database.

### ⚠️ NOT DONE, and stated rather than implied

**Nobody has signed in and LOOKED at the new screens.** The route compiles
(`ƒ /insurance/settings/users 1.19 kB`), the coverage audit counts it, every
gate is green — and this repository records that **a green build is not a
working feature**. A signed-in pass as an `insurance_owner` needs 085 on a
database plus a seeded identity. Do it before calling T1a finished.

The new route returns **404 anonymously and that is CORRECT** — measured against
its peers: `/insurance/settings/claim-rules` and `/towing/operations/settings`
are both `organization.admin`-gated and also 404.

---

## ═══ 2026-08-16 — the firewall mutex, the switchers that stranded the owner, and slice 18 part 1 ═══

**Tip `b12bf70`. 20 commits (`757c41b` -> `b12bf70`). Tree clean, all pushed.**

### State, measured after the deploy — not quoted

| | |
|---|---|
| Release / CI / Security CI on `4f03cfa` | **GREEN** — after one RED for a lint error I had not run, see My errors |
| **Live suite — anonymous** | **66 passed · 0 failed · 1 skipped** |
| **Live suite — signed-in** | **4 passed · 0 failed · 0 skipped** |
| **Live suite — total** | **70 passed · 0 failed · 1 skipped** — the 08-15 baseline, held |
| Migrations on PRODUCTION | **IN REPO 82 · APPLIED 82 · PENDING 0** |
| The one skip | *"served forms carry a submit control — no form on this page to check"* — the same benign skip as 08-15. **A skip is not a pass.** |

Read from `gh api …/actions/jobs/<id>/logs` — `gh run view --log` still returns
0 bytes. Both live-suite jobs read, per the recorded rule.

### ▶ NEXT SESSION STARTS AT `.claude/TASK_LIST_2026-08-15.md`

Still the work. **A6 is now CLOSED**, so the blockade it imposed is lifted —
A4 diagnostics, backup work, migration verification and production seeds may
proceed. **Next executable item: slice 18, then 17, then 19, then 20.** That
order is load-bearing; the reasons are in Part B of the task list.

### ▶ NEXT SESSION: SLICE 18 PART 2 IS BLOCKED — READ THIS BEFORE PICKING IT UP

**Slice 18 part 1 SHIPPED** — the admin insurance verification screen, live at
`admin/catalogue-and-content/insurance-products`. It also gave WITHDRAWAL its
first caller (`reviewQueue` returned only unverified products, so a verified one
vanished from the only list that existed and could never be reversed).

🔴 **PART 2 — Claims Approver — MUST NOT BE BUILT AS THE TASK LIST WRITES IT.**
Asking the list's own question first is what caught it:

```
CAN_GRANT_MEMBERSHIP = { platform_administrator, workshop_owner,
                         supplier_owner, fleet_administrator }
```

`insurance_assessor` is NOT in it. Measured three ways: that set is the only
gate, `membership.service.ts:345` is the ONLY `INSERT INTO identity.memberships`
in the whole API, and migration 080 writes just the founder. **An insurance
company cannot appoint anyone.** Adding `claims_approver` would be the SIXTH
role with no production write path — created by the slice that names the
question.

🔴 **`towing_operator` is missing from that set too — TWO of the six
self-service organisation types can never build a team.** Recorded nowhere else.

**Real shape: insurers (and towing firms) need an org-admin role the way
supplier and fleet have one.** Splitting the assessor in two does not help while
neither half can appoint the other. Full options and the recommendation are in
`.claude/TASK_LIST_2026-08-15.md` under slice 18. **Do not start by adding
strings to allow-lists.**

### 🔴 THE OWNER COULD NOT SEE THE PRODUCT — two real defects, both now fixed

**"the admin and marc667us dont see anything" → "do not have access error".**

**Defect 1 — the switchers stranded you (ADR-021, third instance today).**
`setActiveRoleAction` set the cookie, revalidated, and re-rendered THE SAME URL.
Switching from `platform_administrator` to `workshop_owner` while on `/admin/...`
left the viewer there — a pack they no longer hold `platform.admin` for — so the
layout refused them. **The switch worked and then dumped them somewhere they
were not allowed.** When each pack was its own host there was nowhere to send
anyone; seven path-prefixed packs make a role change a PACK change.
`homeWorkspaceFor()` already encoded it and `/` already used it — the switchers
were the callers that never got it. **Codex found the organisation switcher had
the identical defect**, which would have stranded them again.

**Defect 2 — the audit memberships were invisible.** My first attempt joined
EXISTING partner organisations, which are OTHER TENANTS. `me.service.ts` filters
`AND m.tenant_id = $2` — *"memberships in other tenants are deliberately not
listed here"*. I wrote those rows before reading that. Fixed by creating
`[AUDIT]` organisations inside the account's OWN tenant; the dead cross-tenant
rows were deleted.

**Result — `marc667us@yahoo.com` now holds SEVEN roles in ONE tenant**, so every
tree is switcher-reachable: `platform_administrator` · `workshop_owner` ·
`customer` (Marc Auto Works) · `supplier_owner` · `fleet_administrator` ·
`insurance_assessor` · `towing_operator` (`[AUDIT] …` orgs).
Zero cross-tenant rows remain.

⚠️ **The `[AUDIT]` orgs have no business data.** A `parts_supplier` org with no
`catalogue.suppliers` row renders an EMPTY supplier tree. The tree is reachable
and auditable; populating it is a seeding question. **Do not report empty
screens as broken.**

🔴 **I WAS WRONG TWICE ON THE DIAGNOSIS BEFORE GETTING IT RIGHT.** First I said
the platform-admin grant was missing — it has been active since 2026-08-10; my
own diagnostic returned `(0 rows)` because `set_config(...,true)` is
TRANSACTION-LOCAL and each psql statement outside a transaction is its own
transaction, so the admin read context was discarded and FORCE RLS hid the
table. Sections 2 and 4 coming back empty is what caught it. Then I blamed
multi-membership lockout — the resolver defaults to the STRONGEST role and
`platform_administrator` is index 0. **Neither guess survived measurement.**

### ✅ CLOSED — the twelve dead redirect URIs are GONE from the live realm

**Measured, removed and verified on 2026-08-16.** New workflow
`prune-keycloak-dead-redirects.yml` (the missing half:
`sync-keycloak-client-uris.yml` is add-only by design and merges-then-PUTs, so
it can never delete anything).

| | |
|---|---|
| Dry run (run `31952738394`) | **measured 12 dead entries across 6 clients, live** — until then this was inferred, not measured |
| APPLY (run `31952822707`) | 6 clients UPDATED · re-read confirms **no dead per-pack redirect remains** · `autoworkshop-customer-web` **still allows the apex callback** |
| Sign-in re-proven (run `31952883691`) | **70 passed · 0 failed · 1 skipped** — incl. `PASS signing in at the apex` and `PASS signing out ends the session` |

No client was left empty: each retained a real URI (customer-web the apex, the
other five their `<pack>.autoworkshop.aiappinvent.com` address).

⚠️ **The APPLY run emits a warning naming `admin-cli`, `autoworkshop-api`,
`broker`, `realm-management` as "clients with NO redirect URI".** That is a
FALSE POSITIVE of my own check — those are Keycloak built-ins and the
bearer-only API client, none of which uses a browser redirect flow, and none was
touched. The check warns across the whole realm rather than only the clients it
edited. Harmless; narrow it if it ever causes a misread.

⚠️ **Still open, deliberately:** the realm declares five pack web clients
(supplier/fleet/insurance/towing/admin) that no deployed app can sign in through
any more, plus `autoworkshop-mobile`. Their remaining
`<pack>.autoworkshop.aiappinvent.com` addresses are subdomains **we own**, so
this is tidiness rather than exposure. Deleting realm clients is an identity
change needing its own ADR — not a hostname tidy-up.

### What shipped

0. **The stale-host sweep** (`b9d5e9d`) — `live-screen-audit.sh` and
   `live-soak.sh` both aimed every probe at six deleted hosts, so both reported
   a healthy site as broken; `point-web-at-keycloak.yml` defaulted to two of
   them; `sync-keycloak-client-uris.yml` checked a callback that could only ever
   be REFUSED and would abort `confirm=APPLY`; and six realm clients registered
   redirect URIs at hosts we no longer control.
   🔴 **Codex caught a regression I introduced in that very sweep** — dropping
   the customer-host check left only `autoworkshop-workshop-web`, but
   `apps/web/auth.ts:73` sets `ARTIFACT_WORKSPACE='customer'`, so production
   authenticates as **customer-web**. The gate would have passed while real
   sign-in was refused. Both are checked now, customer-web first.
1. **A6 — the database-firewall race. It was FIFTEEN workflows, not six, with
   at least THREE race mechanisms, not one.** One shared
   `concurrency: production-db-firewall` + `cancel-in-progress: false` across
   all fifteen, plus `timeout-minutes` on the three that had none.
2. **Three instruments that lied**, all in `record-live-state.sh`: two deleted
   per-pack hostnames reported as failures, `curl … || echo 000` → `000000`,
   and `grep -c … || echo 0` → `"0\n0"`. Plus a live `curl … || echo 000` in
   `live-screen-audit.sh`.
3. **`lint-shell-idioms.sh` rule 4**, closing the gap that let #2 survive.
4. **ADR-022 — n8n evaluated for agent creation and REJECTED** by the owner on
   cost grounds. Nothing installed; nothing left behind.

### 🔴 The findings that cost the most to get right

1. **THE SCOPE IN THE TASK LIST WAS 2.5× TOO SMALL.** It named six workflows.
   `grep -l ipAllowList .github/workflows/` returns fifteen. The recorded
   under-scoping pattern, again — a job sized off the previous session's
   question shape.
2. **FIVE OF THE FIFTEEN ALREADY HAD A `concurrency:` BLOCK — each with its own
   per-workflow group.** That reads as protection and is none: a per-workflow
   group cannot prevent a race *between* workflows. Two literals in two files,
   in a new costume.
3. **CODEX FOUND A THIRD RACE MECHANISM I HAD MISSED.** Two unfiltered runs both
   GET the same original list, then both PATCH `original + mine`; the second add
   deletes the first's entry *before* either restore. (Plus mixed-order
   *resurrection* of a stale entry.)
4. **THE FIX INTRODUCES A REGRESSION AND IT MUST NOT BE FORGOTTEN.** A GitHub
   concurrency group is a mutex with a **one-element replacement waiting room**,
   not a fifteen-deep queue: one pending run per group, older discarded when a
   newer arrives, no ordering guarantee. So a pending deploy, migration APPLY,
   seed or backup **can be silently dropped** — and `apply-migrations` fires
   after every Release, so automatic inspections compete with deliberate
   requests. **▶ After dispatching any of the fifteen, capture the run id and
   confirm it STARTED. A `cancelled` run you did not cancel is an evicted
   request — re-dispatch it.**
5. **A CHECK THAT WALKED THROUGH ITS OWN GAP.** `lint-shell-idioms.sh` had a
   rule for `grep -c … || echo` and none for the curl sibling, though this repo
   records both as the same defect — so a live instance sat in
   `live-screen-audit.sh` long after the class was "known".
6. **HEAD-OF-LINE BLOCKING IS REAL, NOT THEORETICAL.**
   `rehearse-migration` run `31126439386` ran for **205 MINUTES**. Under a
   shared group with no timeout that would have blocked everything for 3.5h.
   Bounds sized from *measured* durations, not guesses.

### 🔴 My errors

- **I claimed "the ADK/MCP agent tier does not exist in this repo" from an
  `apps/` directory listing alone. Wrong twice over.** `services/agent-host/`
  exists; `apps/api/src/agents/` holds seven files plus migration 064; and
  `CURRENT_PHASE.md` records Phase 8 as **"Started, and off-plan"** with the
  warning *"J16 must reconcile, never rebuild"*. **A directory listing is not a
  measurement of whether a capability exists.** Caught by Codex.
- **I treated a §0.1 ADK exception as unprecedented.** It is the third —
  ADR-018 and ADR-019 both took it, and ADR-019 answers a near-identical owner
  instruction from 08-08.
- **My first proof of the new lint rule was invalid** — the probe was untracked
  and `TARGETS` is `git ls-files`, so the rule never read it and "passed" a file
  it had not seen. *A test that cannot see its subject is not a passing test.*
- **I reproduced the `grep -c … || echo 0` defect in my own diagnostic** while
  measuring it. Instrument, not product — but it is a persistent reflex.

### Pre-existing defects found, NOT introduced, NOT fixed

- **Two ADRs are both numbered 018** (`EXPO-SDK-52`, `REPAIR-ORCHESTRATOR-NO-ADK`).
  Fix deliberately; do not renumber one that is already referenced.
- **`CLAUDE.md` contradicts itself on agent frameworks** — §0.1 forbids
  LangGraph and CrewAI; the FOSS Stack Rule table recommends them. The table is
  the line that should change.

### 🛠 Commands — including everything BUILT this session

```bash
bash scripts/start-session.sh                 # ALWAYS first
bash scripts/record-live-state.sh             # FIXED — it now tells the truth
bash scripts/live-screen-audit.sh             # FIXED — was aimed at 6 deleted hosts
bash scripts/live-soak.sh                     # FIXED — same 6 deleted hosts
node scripts/audit-menu-coverage.mjs --all    # re-measure coverage, never quote it

# 🔴 RUN LINT BEFORE CLAIMING ANYTHING IS DEPLOYABLE. Skipping it turned
# Release RED this session and `image`/`promote` were SKIPPED, so the work did
# not deploy at all. tsc + tests + next build were all green at the time.
./node_modules/.bin/turbo run lint
bash scripts/guardrails/lint-shell-idioms.sh  # rule 4 (curl || echo 000) is NEW

# Codex: prompt on STDIN from a FILE, output REDIRECTED (never | tail)
C:/Users/USER/nodejs/codex.cmd exec --skip-git-repo-check -s read-only - < prompt.txt > review.txt 2>&1
```

**Workflows written this session — all dry-run by default:**

```bash
# Appoint a platform administrator. THE MISSING WRITE PATH (C1a).
# grant-platform-admin.yml is STALE — it writes the membership 077/078 made
# inert. Use this instead.
gh workflow run provision-audit-superuser.yml -f email=<addr>                      # report
gh workflow run provision-audit-superuser.yml -f email=<addr> -f confirm=APPLY \
                                              -f audit_orgs=true                   # + all 7 trees

# Remove Keycloak redirect URIs at hosts ADR-021 deleted.
# sync-keycloak-client-uris.yml is ADD-ONLY and can NEVER delete — that is why
# this exists. Ran 2026-08-16: 12 removed, sign-in re-proven.
gh workflow run prune-keycloak-dead-redirects.yml                                  # report
gh workflow run prune-keycloak-dead-redirects.yml -f confirm=APPLY

# Set a password WITHOUT it appearing anywhere public. Written, NEVER RUN.
# Needs the owner to set the secret first — they choose it, nobody else sees it:
#   gh secret set AUDIT_SUPERUSER_PASSWORD --repo marc667us/autoworkshop-ai
# ⚠️ Do NOT pipe the value from PowerShell — it injects a BOM.
gh workflow run set-audit-superuser-password.yml -f confirm=APPLY
```

⚠️ **Reading run logs:** `gh run view --log` returns 0 BYTES. Use
`gh api repos/marc667us/autoworkshop-ai/actions/jobs/<job_id>/logs`, and strip
ANSI (`sed 's/\x1b\[[0-9;]*m//g'`) — the log echoes the script before its
output, so take the LAST occurrence of your marker, not the first.

⚠️ **Codex is v0.147.0** (the notes said 0.137.0). ChatGPT auth, $0/call.

⚠️ **A6 is fixed, so the fifteen firewall workflows QUEUE rather than race** —
but GitHub holds only ONE pending run per group and discards the older. After
dispatching any of them, confirm your run actually STARTED; a `cancelled` run
you did not cancel is an evicted request.

---

## ═══ 2026-08-15 — the consolidation left the pipeline behind ═══

**Tip `3c8b341`. 3 commits (`1816ba7` → `3c8b341`). Tree clean, all pushed.**

### ▶ NEXT SESSION STARTS AT `.claude/TASK_LIST_2026-08-15.md`

That file is the work: **Part A** carried-forward items, **Part B** four Phase-7
slices, **Part C** the roles audit, **Part D** the defects found and fixed.
`NEXT_SESSION_SCHEDULE.md` (08-14) is superseded by it; `TASK_GAP_AND_JOB_LIST.md`
(08-11) is older still.

**▶ FIRST TASK: A6 — the database-firewall race.** It is the first executable
item in the list and everything else depends on it, because it manufactures
false evidence that looks exactly like a database outage. **The fix is a shared
`concurrency:` group, NOT "remove only my entry"** — Render's API PATCHes the
whole allow-list, so every variant of read-modify-write is still racy.

### State, measured at close

| | |
|---|---|
| Migrations | **IN REPO 82 / APPLIED 82 / PENDING 0 — on PRODUCTION** |
| Live suite | **70 passed / 0 failed / 1 skipped** (66 anon + 4 signed-in) |
| Release | **GREEN** — first success since 08-14 20:57Z, after eight failures |
| Screen coverage | **272 of 384 (71%)**, 110 with no page |
| Local restore drill | PASS 8/8, RTO 62s, RPO 0 |

### What this session found, in order of how much it cost

1. 🔴 **ADR-021 UPDATED THE CODE AND LEFT THE PIPELINE POINTING AT THE OLD
   WORLD.** `_deploy-render.yml` probed `${BASE}/home/dashboard` → **seven red
   Releases on deploys that had already succeeded.** Then three more instances:
   `render-resume-production.yml` (would report a **recovered** site as dead —
   and it runs precisely when production is down) and two provisioning
   workflows setting a `healthCheckPath` Render could never mark healthy.
   **`release.yml`'s own container check had already been fixed for exactly
   this, with a comment explaining exactly this.** Two literals in two files.
2. 🔴 **I FIXED A FALSE RED BY CREATING A FALSE GREEN.** My first fix probed `/`
   alone — which passes while deleting the only assertion that any pack mounts.
   Codex refused it. The Supervisor then showed that even seven pack roots prove
   nothing: they are three-line `redirect()` stubs, so **the exact 08-13 defect
   would still have passed.** Now `/` + seven roots + `-L` + retries.
3. 🔴 **THE WORKSHOP AND SUPPLIER ACQUISITION FUNNEL RENDERED FOR NOBODY.** The
   "Run a workshop, or sell parts?" band is gated on two props **no caller
   anywhere passed**; production's apex served neither button nor the heading,
   and its only outbound links were customer sign-in callbacks. Fixed, deployed,
   and **verified in production's served HTML**.
4. 🔴 **A FIFTH ROLE WITH NO PRODUCTION WRITE PATH: `platform_administrator`.**
   Every API reference to `identity.platform_administrators` is a READ; the only
   writer is 077's one-time backfill. **There is no way to appoint a second
   administrator or replace the first.** Provisioning gap, not an access hole.
5. 🔴 **THREE STATUS ARTIFACTS WERE LYING, AND ONE HAD PROPAGATED.**
   `RELATIONSHIPS.md §8` said fourteen keys were open; 079 closed them on 08-11.
   `CURRENT_PHASE.md` inherited it as gap #3, **so the next session would have
   rebuilt migration 079** — which Directive §3 forbids. All corrected, verified
   against a database (two-column FKs: 2, three-column: 71).

### Decisions taken (the owner delegated them)

- **Phase 7 proceeds**, but **Release 0.5 may NOT be claimed complete** while
  Phase 6's product-validation engine and supplier badges are absent.
- **Insurance = insurer-recorded + a customer enquiry**, not self-service
  checkout — the levy is proven that way on production, and checkout would make
  the platform a payment intermediary, which D7 forbids.
- **The 16 spec roles absent from code split 8/8** — trades become
  **competencies** on a technician; Claims Approver, Fleet Approver, Supplier
  Staff, Towing Driver, Platform Support, Security Analyst, MCP Administrator
  and Workshop Administrator become **real roles**. Five left open, not guessed.

### 🔴 My errors

- **Piped Codex through `tail -200` and destroyed the head of the review** — a
  recorded defect, reintroduced. Redirect to a file.
- **Claimed `point-web-at-keycloak.yml` "could never" set `SUPPLIER_WEB_URL`** —
  false, it accepts 3xx. And counted six Release failures while listing seven.
- **Nearly reported `live-suite.yml` as broken on Codex's say-so.** It is
  correct: its base URLs carry the prefix (`FLEET: …/fleet`). Verify first.
- **Left an unguarded `$(curl)` under `set -euo pipefail`** in the file I was
  editing — the Supervisor caught it. It defeated a ten-attempt wait loop.

### 🛠 Commands

```bash
bash scripts/start-session.sh                 # ALWAYS first
node scripts/audit-menu-coverage.mjs --all    # re-measure coverage, never quote it

gh workflow run apply-migrations.yml          # no confirm = inspect only
gh workflow run live-suite.yml                # READ BOTH JOBS
gh api repos/marc667us/autoworkshop-ai/actions/jobs/<job_id>/logs   # `run view --log` returns 0 BYTES

# Codex: prompt on STDIN from a FILE, output REDIRECTED (never | tail)
C:/Users/USER/nodejs/codex.cmd exec --skip-git-repo-check -s read-only - < prompt.txt > review.txt 2>&1
```

⚠️ **Do not run two firewall-opening workflows at once until A6 is fixed** — and
a push triggers `apply-migrations` as a dry run, which counts as one.

---

## ═══ 2026-08-13 — ten Render services became one artifact ═══

**Tip `062876c`. Tree clean, all pushed. Live suite 70/0/1.**

**▶ NEXT SESSION STARTS AT `.claude/NEXT_SESSION_SCHEDULE.md`** — it carries the
three ordered tasks, the full error list, and the commands.

ADR-021: seven packs, one deployed application, `main` calls them. Render went
from ten services to **web + keycloak + api + postgres**, which is Solar's shape.
341 pages moved by `git mv` of whole directories, so only seven files in the
tree imported out past `app/`. One Auth.js instance, one session cookie, one
`/api/auth/*`, one `/auth/error`.

### The three things waiting

1. **The database expires 2026-09-01 and has never been backed up.**
   `infrastructure/backup/` targets the LOCAL container — 4/4 drills, RPO 0,
   HEALTHY 7/7, all about `aw-postgres`. `backup-production-db.yml` is written;
   the last blocker is `--exclude-table='public.databasechangelog*'` because
   Keycloak's Liquibase tables live in `public` and we cannot read them.
2. **"Access is denied to users"** — owner-reported, UNVERIFIED. Likely the
   session-cookie rename; reproduce before fixing.
3. **New requirement: user roles, signup and login** — not yet scoped. Ask of
   every role which production path WRITES it; that question has caught four
   roles that could not exist.

### What I got wrong, because it is the expensive part

Five wrong diagnoses on one connection, each asserted as measured — the probe
that found it took one run and I ran it fourth. Pushed three times having run
only some of eleven test targets. Reintroduced a recorded backtick defect inside
a comment explaining a different defect. **And I broke every pre-consolidation
URL while the live suite stayed green at 70/0/1, including a run dispatched
while the owner was looking at the 404s** — it only asks for paths the new
topology advertises. After a URL migration, test the OLD urls.

---

# Session handover

## ═══ 2026-08-11 — the API half closed, and the account went down ═══

**Tip `9cbe677`. 7 commits (`ee27c44` → `9cbe677`). Tree clean, all pushed.**
**Migrations IN REPO 78 / APPLIED 78 / PENDING 0** — 078 and 079 both live.
**Live suite 71/0/0** (67 anonymous + 4 signed-in) — measured *before* the suspension.

**▶ NEXT SESSION STARTS AT `.claude/TASK_GAP_AND_JOB_LIST.md`** — the measured
gap against COMBINED_PLAN_v2 and PLAN_EXTENSION_v1, jobs J1–J24, schedule S1–S13.

### 🔴 THE FIRST THING TO CHECK: RENDER IS SUSPENDED

**Every service returned 503 "Service Suspended" at ~17:00 UTC** — apex, api,
customer, supplier, towing, insurance. Account-wide, not a flap and not a cold
start. This is the free-tier instance-hour allowance exhausted, the same failure
as **2026-07-28**. Nine services share one ~750h allowance; a month is ~730h.

🔴 **I CONTRIBUTED TO IT AND SHOULD HAVE KNOWN BETTER.** I dispatched the live
suite three times in one session, and each run WAKES ALL NINE SERVICES before it
measures anything. `keep-warm.yml`'s header does exactly this sum, and I had read
it earlier in the same session. **Budget live-suite runs — they are not free.**

- **A suspension from consumed hours cannot be lifted via the API** — proven
  07-28: `POST /resume` → *"only services suspended by a user can be resumed"*.
- **Do NOT propose spending.** Zero-cost is a standing hard rule.
- **The only lever is how many services stay deployed.** The candidates are the
  two with nothing behind them: **fleet-web (1 of 29 screens)** and
  **insurance-web (0 of 28)**. Owner's scope decision, still open.
- **The database is a separate paid service and was unaffected.** Every seeded
  row is intact and waiting.

### ✅ WHAT SHIPPED, AND IS ON PRODUCTION

1. **J1 — the platform-admin API half (migration 078).** The critical the last
   two sessions flagged. Revoking a grant used to remove database reach and leave
   **every API gate open**, including two endpoints that read server-wide
   catalogues with no RLS beneath them, where the application check IS the
   enforcement.
   **Fixed at the FACT, not at 33 call sites:** `resolveTenantContext` refuses to
   select a `platform_administrator` membership without an un-revoked grant, so
   the string cannot reach `activeRole` and all 29 allow-list files are correct
   by construction. `platformAdmin` is gone from `ROLE_PERMISSIONS` entirely;
   `permissionsForContext` is its only source.
   Proven: verify/078 **10/10** as `autoworkshop_app`; revocation measured
   immediate in one transaction (`before=t → after=f`); signed-in live job
   **4/0/0** after deploy, which is the no-lockout proof.
2. **J2 — the 14 two-column `(x, tenant_id)` FKs (migration 079).** Plus a second
   defect found while measuring: three were `ON DELETE SET NULL` on a composite
   key, which nulls EVERY key column including the NOT NULL `tenant_id` — so
   those deletes RAISED instead of nulling. Both fixed. verify/079 **6/6**, and
   check 3 is a real cross-organisation WRITE that must be refused, not a
   catalogue inspection.
3. **J5** — `CURRENT_PHASE.md` rewritten. It was four facts stale and wrongly
   marked Phase 1 complete and Phase 8 not-started.
4. **Live-suite reachability retries got a backoff.** They had none, so four
   attempts landed inside one transient window, and a 180s timeout meant four
   transport hangs could burn twelve minutes. Same defect already fixed in
   `deploy-supplier-web.yml`; this copy was missed. Run time 24m → ~4m.
5. **Sample population seeded on production, and it stays** (owner asked for it
   and asked to keep it): **10 workshops · 10 suppliers · 20 customers · 20
   vehicles**, all through the REAL `register_workshop` / `register_supplier` /
   `enrol_as_customer` functions, tagged `[SAMPLE-2026-08-11]` in every name.
   Idempotent by measurement: the second run created 0 and skipped 40.
6. **Two list screens got the create button they lacked** — see below.

### 🔴 "ALL VIEWS MUST HAVE ADD NEW" — THE COUNT IS NOT THE FINDING

Measured: **100 list-shaped screens, 29 with a create control, 71 without.**

But of **405 navigation entries only NINE are create-shaped**, and four of those
("New Claims", "New Orders", "New Requests", "New Complaints") are FILTERED
LISTS, not create actions. **There are exactly FIVE real create routes in this
product**: `register-customer`, `register-vehicle`, `add-vehicle`, `add-product`,
`create-job-card`.

**So most of the 71 cannot be given a working button — there is nothing for it to
point at.** `quickCreateHref` resolves out of the viewer's own navigation and
returns null when the route is not advertised, so adding buttons would render
nothing at all. **This is a build-the-write-half job, not a button job.** Sizing
it as buttons would under-scope it enormously, which is why it is written down
here rather than left to be rediscovered.

Wired this session: **customer-web garage** — its own empty state had always said
*"you can also add one yourself from Add Vehicle"* while the screen offered no
way to do it — and **workshop-web job-cards**, where `job-queue-screen` has
offered Create Job Card since it was built. Supplier catalogue needed nothing; it
already creates inline via `AddPartForm`.

`QuickCreateButton` moved into `packages/ui` and became a plain `<a>`:
`packages/ui` is deliberately framework-free (react is its only peer dependency),
and adding `next` to the design-system package for one component is the bigger
change. Prefetch is lost; every reason the component gives for being a link is
kept.

### ⚠️ OPEN, AND HONESTLY UNRESOLVED

- 🔴 **THE API SUITE'S SKIP COUNT VARIES BETWEEN RUNS ON THE SAME CODE.**
  Observed **943 passed / 6 skipped**, then **948 / 1** minutes later with no
  change in between. The stable skip is `mail-delivery.integration.spec.ts`
  (Mailpit's self-signed CA is untrusted). The other five are unexplained.
  **Do not quote either number as the baseline until this is understood** —
  "passed / failed / SKIPPED are three states" is a recorded rule here, and a
  wandering skip count is the same family of defect.
- **J3 is 1 of 5 done.** Remaining supplier-web deploy defects: the poll that
  falls through to a green read-back of the OLD image, the discarded deploy id,
  `|| echo 000` yielding `000000`, and the inert `len()` guard.
- **The live suite dispatched after the seed FAILED** — it ran into the
  suspension, not a product defect. Re-run when the account is back; that is the
  outstanding proof for both the seed and migration 079.

### 🔴 GATE LESSONS THIS SESSION ADDED

- **Codex found my confident reasoning WRONG.** I argued an API-first deploy
  could not break anything new because the request already depends on
  `memberships_for_subject` — false: 039 created that, so any database at 077 has
  it, whereas 078's function is new. An API image ahead of the migration would
  have been a **near-total outage for every role**. Now caught, and CONFIRMED
  with `to_regprocedure` before being believed, because 42883 can also be raised
  from inside an installed function.
- **Codex's third pass found two of my new tests proved nothing.** They now say
  so in their own titles instead of reading like proof.
- **The Supervisor found 29 files Codex's question shape excluded** — J1 was 4×
  its apparent size. Neither reviewer alone was enough, for the fourth session
  running.
- **My own gap analysis called three things ABSENT that exist** —
  `insurance_assessor` IS grantable (only the self-service door is missing, so
  insurance is NOT blocked); Phase 1 is NOT done; Phase 8 is NOT nothing. Two of
  the three were inherited from earlier handovers rather than measured.
  **Measure the repo, do not quote the last handover.**
- **A missing `time` import in my own live-suite fix** would have killed the
  whole suite at the first flap — strictly worse than the false red it fixed.
  Caught by syntax-checking the extracted Python before dispatching, not by a
  24-minute live run.

### 🛠 COMMANDS

```bash
bash scripts/start-session.sh                # ALWAYS first
bash scripts/record-live-state.sh            # what is really deployed

# 🔴 BUDGET THESE. Each live-suite run wakes all nine services.
gh workflow run live-suite.yml               # READ BOTH JOBS
gh workflow run apply-migrations.yml         # no confirm = inspect only
gh workflow run seed-sample-population.yml -f verify_only=true   # re-read, writes nothing

docker exec -i aw-postgres psql -U autoworkshop -d autoworkshop \
  < infrastructure/migrations/verify/079_organisation_scoped_keys.sql

printf '%s' "$P" > /tmp/p.txt   # ALWAYS a FILE — backticks in "..." EXECUTE
C:/Users/USER/nodejs/codex.cmd exec --skip-git-repo-check -s read-only - < /tmp/p.txt
```

---

## ═══ 2026-08-10 — three reds that were not the product, and half a security fix ═══

**Tip `2a179dc`. 8 commits (`4188c2a` → `2a179dc`). Tree clean, all pushed.**
**PRODUCTION == BUILD**: migrations **IN REPO 76 / APPLIED 76 / PENDING 0**.
**Live suite 67/0/0 anonymous + 4/0/0 signed-in = 71/0/0**, still 71/0/0 after
migration 077 went live. Security CI **6/6** on a full-history dispatch.

**▶ NEXT SESSION STARTS AT `.claude/NEXT_SESSION_SCHEDULE.md`.**
**▶ FIRST TASK: finish the platform-admin API half (below). It is a CRITICAL and
it is live-unprotected right now.**

### The one thing you must not miss

🔴 **Migration 077 hardened the DATABASE and the API was NOT changed.**
`identity.is_platform_admin()` now requires an un-revoked row in
`identity.platform_administrators`. The API still derives `platform.admin` from
`ROLE_PERMISSIONS['platform_administrator']`, keyed on the membership
`role_name`. **So revoking a grant on production today removes DB reach and
leaves every API gate open** — and `security.controller.ts` reads `pg_catalog`,
so for that endpoint the application check IS the enforcement. Fix: resolve grant
state during `TenantContext` construction and gate `platform.admin` on it.

⚠️ The schedule's own item 3 asked for the FORBIDDEN shape (platform admin from
the Keycloak `realm_access.roles` claim). COMBINED_PLAN_v2 §4 and
PLAN_EXTENSION_v1 §2.1 both prohibit a claim conferring authority; §2.1 exists
*because Codex found that hole at plan stage*. **Read the plans before
implementing a note in a control file.**

### What shipped

1. **`/customer-reception/leads`** — the one live failure, and NOT a product
   defect. The owner tree has no `customer-reception` group; its leads item is
   `/workshop-operations/leads`. The TEST asserted another role's tree — the
   second instance in a file that documents the first in its own comments.
2. **Security CI had been red since 08-03 behind eight green push runs.**
   `gitleaks-action@v2` scans only pushed commits on `push`, the whole history on
   `schedule`. Both findings were one synthetic JWT and its echo in a review log.
   `.gitleaksignore` allowlists them BY FINGERPRINT, never a path rule.
3. **Journey seeder run on production** (owner-approved): 5 journeys to
   `completed`, 15 stage events each, ratings 5/5/4/2/1. Its read-back was
   invalid SQL and its verdict column called NULL "NOT happy"; both fixed, and
   `verify_only=true` added so the report re-runs without writing.
4. **Migration 077** — platform authority is a grant record. verify/077 **10/10**.
5. **customer-web 502** — see below.

### 🔴 Diagnoses I got WRONG, recorded so they are not repeated

- **"customer-web 502 is a cold start" — WRONG, twice.** The suite's OWN wake
  step recorded `customer-web -> 200` minutes before the suite read 502 from the
  same URL. It was awake. On demand: 200 fifteen times at ~1s, ten more with the
  suite's exact UA. It is Render's edge flap; `up()` was the last single-sample
  checker and now retries reporting attempt counts (`3616e61`).
- **My `/security-review` on migration 077 reported ZERO findings.** Codex then
  found two CRITICALs in it, one of which I had explicitly considered and
  dismissed by reasoning about who may WRITE the grant table — the escape
  (`app.current_role='admin'`, a GUC any role can set) never touches it.
- **A verify check passed for the wrong reason**: the half-revocation check ran
  after the revocation check, so it updated 0 rows whenever the revoked grant was
  the only active one. It passed only because that DB held a SECOND grant.

### ⚠️ Open, not blocked

- **Release needs a re-run** — failed on a **GHCR secondary rate limit** after
  the image built and passed its container smoke test. Six pushes in one day.
  The apex still serves the previous image.
- **Nine free Render services share one ~750h allowance sized for four.**
  `keep-warm.yml` pings Keycloak ONLY, deliberately — over-warming is how this
  account was SUSPENDED on 2026-07-28. **Do not add services to the warmer.**
  The only zero-cost lever is how many stay deployed; fleet-web (0/29 screens)
  and insurance-web (0/28) are the candidates. **Owner's scope decision.**
- **A local API is listening on port 4000** (PID 10932, started 05:10 on 08-10,
  origin unexplained — I did not start it). `start-session.sh` kills stale
  listeners, so it is covered; check it first if a local defect looks impossible.

### Commands this session actually used (copy these, do not re-derive)

```bash
bash scripts/start-session.sh                      # ALWAYS first
bash scripts/record-live-state.sh                  # what is really deployed
bash infrastructure/migrations/run.sh              # local migrations (checksummed)
docker exec -i aw-postgres psql -U autoworkshop -d autoworkshop <   infrastructure/migrations/verify/077_platform_administrator_grants.sql

# RLS is testable locally — this is Render's privilege shape
docker exec -i aw-postgres psql -U autoworkshop -d autoworkshop -c "SET ROLE autoworkshop_app; ..."

# gates
printf '%s' "$P" > /tmp/p.txt   # ⚠️ ALWAYS a FILE — backticks in a "..." string EXECUTE
C:/Users/USER/nodejs/codex.cmd exec --skip-git-repo-check -s read-only - < /tmp/p.txt
# Supervisor: /code-review , /security-review , /verify

# production
gh workflow run apply-migrations.yml -f confirm=APPLY
gh workflow run live-suite.yml            # READ BOTH JOBS: live + signed-in
gh workflow run security.yml              # dispatch = FULL HISTORY scan
gh workflow run seed-repair-journeys.yml -f verify_only=true   # re-read, writes nothing
gh run view <id> --log | grep "PASSED"    # READ THE COUNT, never the exit code
```

⚠️ `gh run view --log` returns **0 bytes and exit 0** for older/in-flight runs.
Use the run's artifact (SARIF etc.) or re-dispatch rather than concluding "no output".

---

## ═══ 2026-08-07 — slices 6-11, deployed, and three security findings ═══

**Tip `db5e525`. PRODUCTION == BUILD.** local = origin = Release headSha,
52 migrations applied on live, 0 pending, tree clean, no servers running.

**▶ NEXT SESSION STARTS AT `.claude/NEXT_SESSION_SCHEDULE.md` — LIST A, then LIST B.**

### What shipped

All six remaining slices, then re-mounts: **157 -> 215 of 242**.

| Slice | Routes | Total |
|---|---:|---:|
| 6 Settings & workshop admin | 10 | 153 |
| 7 Messaging (text + files) | 9 | 162 |
| 9 Customer self-service | 6 | 182 |
| 10 Knowledge, tools, learning | 6 | 188 |
| 8 Reports | 14 | 202 |
| 11 In-app voice + video | 6 | 208 |
| technician re-mounts | 7 | **215** |

Manager 100% · Owner 98% · Default 98% · Reception 97% · Technician 50%->67% ·
Customer 31%->60%. Migrations **045-052**, each with a verify.

**In-app WebRTC shipped** (owner asked for in-app phone/video/text). Signalling
rides our own API and Postgres; media flows browser-to-browser and never touches
the platform. My first analysis said this could not ship on the free tier — that
conflated signalling (a message channel, which we had), STUN (stateless, free)
and TURN (the only piece needing a UDP relay, and a fallback).

### 🔴 The three findings that matter most

1. **ELEVEN UNGATED READS, LIVE ON PRODUCTION.** A signed-in *customer* could
   read the workshop's whole invoice book, payment record, stock, supplier
   orders and warranty decisions. `customer` is a real membership role in the
   same organisation; RLS is org-scoped and cannot tell them apart; controllers
   carry only `TenantGuard`; there is **no global guard**. Shipped in slices
   3/4/5 in PREVIOUS sessions — newly found, now fixed and deployed
   (`authz/workshop-roles.ts`). **Writes were gated everywhere, reads nowhere.**

2. **TWO FEATURES HAD NEVER ONCE WORKED**, both found by the Supervisor, not by
   any gate. Slice 11's proxy omitted the API's `/api/v1` prefix so every
   signalling call 404'd and the client swallowed it; every slice-9 write
   committed and then threw 403. Typecheck, lint, build and their verifies were
   green throughout.

3. **THE LIVE REHEARSAL CAUGHT ITS FIRST PRE-PRODUCTION DEFECT.** 048 seeded
   `knowledge.fault_codes` *after* forcing RLS with only a SELECT policy — it
   passed locally because the local role is superuser+bypassrls, and failed on
   live. This is exactly what the workflow was built for after 036-039 cost
   three sessions.

### Also fixed
Codex: the signalling sequence gap (identity values are visible at COMMIT, not
INSERT — a poller could skip one for ever), `createCall`/`createThread`/
`raiseCase` all accepting ids they never validated. A credential blacklist that
let `key`, `access_key`, `passphrase`, `signing_key` and four more straight
through (inverted to an allow-list). Two workflow defects found by RUNNING them:
concurrent rehearsals clobber the database firewall, and a leftover ephemeral
entry would have become permanent.

**Part A closed: A1, A2, A3, A4, A5, A7, A8.** A4's T-0044 was measured at 0px
(the ticket claimed 51px). A5's Playwright re-run found 5 regressions from the
08-05/08-06 landing work — two `<main>` landmarks and 3.62:1 contrast — now 138
passing, the exact 07-29 baseline with ~90 more pages.

### Still open
**A6** (systematic tenant-isolation suite) and **A9** (`RENDER_API_KEY`,
unrotated since the 2026-07-27 leak, owner-only). Plus the customer-scoped reads
that the security fix now requires — LIST A item A1.

### Corrections to earlier claims
- **Solution Studio is BUILT.** I reported it mid-session as the outstanding
  Phase 5 item; it and its `[id]` route are working.
- **I am NOT classifier-blocked** on `apply-migrations.yml`, `deploy-api.yml` or
  `rehearse-migration.yml`. All three ran from here. Older notes saying only the
  owner can run them are stale.
- **Keycloak is not down.** Measured twice on owner report: 125-137s cold, then
  0.5-0.7s. The real Auth.js flow reaches the IdP with no `error=Configuration`.
  Render free-tier spin-down; `keep-warm.yml` cannot hold it because GitHub cron
  delivers ~0.6 runs/h whatever is asked.

---


## 2026-07-28 pt2 — PHASE 4 BUILT, PHASE 5 STARTED · 9 commits · tip `e4efc81`

**Read `.claude/NEXT_SESSION_START_HERE.md` FIRST** — it carries the start-up
commands, the sign-in steps, the acceptance checks and the next task.

Tree clean, pushed. typecheck 15/15 - lint 15/15 - 208 unit tests - page gates 23/23.

### The nine commits

| # | Commit | What |
|---|---|---|
| 1 | `53b2f05` | Phase 4 slice 1 - `core` schema (mig 004), customers + vehicles, first screens |
| 2 | `2dd628b` | The WRITE path - register customer / register vehicle, `apiPost` |
| 3 | `3f512e6` | Detail pages; a detail route gates on its PARENT list route |
| 4 | `dad5f8b` | The customer GARAGE - owner-scoping finally ran against real data |
| 5 | `3d850fa` | Add Vehicle (customer self-service); form controls moved to `packages/ui` |
| 6 | `00a022f` | T-0016 organisation switcher - and two latent lockouts it uncovered |
| 7 | `f187cfb` | Customer dashboard - real data, honest about what is not built |
| 8 | `188a314` | PHASE 5 BEGINS - job cards (mig 006) + customer complaint opens one |
| 9 | `e4efc81` | Fixed the "your session has ended" lie shown to first-time visitors (mig 007) |

### Six defects found by RUNNING things, not reviewing them

1. **The API handed a TECHNICIAN the whole customer book** - 200 with names,
   phones and locations - while the page 404'd them. Tenant isolation held;
   ROLE authorization did not exist. Found with a real token.
2. **`reception_staff` got a 404 on the screen built for them** - the four role
   trees route one concept to four different paths.
3. **The migration ledger blamed an edit nobody made** - CRLF vs LF. The
   anti-drift guard had CAUSED drift: mig 003 was applied by hand, unrecorded.
4. **Owner-scoping had NEVER executed** - every seeded `customers.user_id` was
   NULL, so a customer would have seen an empty garage that looked correct.
5. **TWO lockouts in tenant resolution** - multi-membership, and a stale org
   cookie. Both failed `/me`, so the shell could never render the switcher
   needed to recover.
6. **"Your session has ended" shown to people who never signed in** - reported
   by the owner trying the app. Fixed across all 11 screens.

### Gates

Codex ran on every slice and found **8 real defects**, including: reads scoped
to tenant when the records are organization-owned; POST body ids reaching SQL
as 500s; a job card assignable to a cashier who would never see it; `engineType`
sent with no field to enter it. The **Supervisor pass found one Codex missed** -
narrowing reads to the organisation while uniqueness stayed tenant-wide turned a
409 into a cross-organisation existence oracle (fixed by migration 005).

---

## 2026-07-28 — findings 5 + 4 closed and gated · THE FIRST DATA-BACKED SCREEN · production suspended

**Tip `9b29ebd` on `master`, pushed, tree clean.**
Read this, then `.claude/TASK_QUEUE.md`, then `docs/13-operations/LIVE-OUTAGE-2026-07-28.md`.

---

### ▶ YOU ARE HERE — the next session starts at this exact point

**T-0005 findings 5 and 4 are CLOSED and fully gated. The first screen that
reads real data has SHIPPED. The next task is PHASE 4 — Customer + Vehicle
(Release 0.3).** Nothing is blocked by the production outage: Phase 4 is built
and tested entirely against the local stack.

#### 1. Confirm where you are

```bash
cd /c/Users/USER/Documents/autoworkshop-ai
git log --oneline -3                            # expect 9b29ebd at the tip
docker ps --format "{{.Names}}\t{{.Status}}"    # aw-keycloak must say (healthy)
```

Keycloak hangs rather than exits when it dies, so `docker restart aw-keycloak`
IS the repair. If Postgres was restarted at any point, restart Keycloak after it.

#### 2. Bring the stack up and re-prove the screen that already works

Build on something proven, not assumed. **Rebuild both — a stale `dist` cost an
hour this session.**

```bash
# dev identities (idempotent; both already exist)
bash scripts/seed-dev-identity.sh                                   # technician
DEV_USER_ROLE=platform_administrator DEV_USER_EMAIL=admin@autoworkshop.local \
  bash scripts/seed-dev-identity.sh                                 # platform admin

# API
cd apps/api && rm -rf dist && ./node_modules/.bin/nest build && cd ../..
set -a && . ./.env && set +a && (cd apps/api && node dist/main.js &)

# admin-web
cd apps/admin-web && rm -rf .next && ./node_modules/.bin/next build
AUTH_SECRET='local_dev_only_2SbQ8vJmK4pR7wZxN1cT6yH9gL0aE3dU' \
AUTH_URL='http://localhost:3006' API_BASE_URL='http://localhost:4000' \
KEYCLOAK_URL='http://localhost:8080' KEYCLOAK_REALM='autoworkshop' \
  ./node_modules/.bin/next start -p 3006
```

Open `http://localhost:3006/directory/organizations`, sign in as
`admin@autoworkshop.local` / `Change_me_locally1!`.

**Expected: `Alpha Motors` ONLY, caption "1 organisation".** Postgres holds two
organisations; `Beta Auto` is Tenant B and must not appear. **If both appear,
tenant isolation has regressed — stop everything, that is Severity-1.**

#### 3. Then build Phase 4

Copy `apps/admin-web/app/directory/organizations/page.tsx` and
`packages/next-shell/src/api.ts`. The order that works:

1. **Migration first** — `infrastructure/migrations/004_*.sql`, customer + vehicle.
2. **Domain service** on the `OrganizationService` shape — rules in the service,
   never the controller, so an MCP tool gets the same rules.
3. **Controller** under `/api/v1`, thin, `@UseGuards(TenantGuard)`.
4. **Page** — `requireWorkspaceAccess()` as the FIRST statement, all four states.
5. **Verify by signing in and looking**, not by the unit suite alone.

##### 🔴 OWNER RULE, BINDING ON THIS SCHEMA (2026-07-27, restated 07-28)

**Use real relationships: foreign keys, joins, normalised tables.** With the
qualifier that matters — **a foreign key cannot carry a tenant predicate.**
Relationships give integrity, RLS gives isolation, **both are required**. So
every tenant-owned table still gets `tenant_id`, `ENABLE` + `FORCE ROW LEVEL
SECURITY`, an explicit `WHERE tenant_id = $1` in the query, and the tenant index
baseline. Migration 001 and `identity.organizations` are the worked examples.

---

### 🔴 Production is DOWN — owner action, not a code problem

| | |
|---|---|
| `autoworkshop.aiappinvent.com` | **503**, in <0.5 s — NOT a cold start |
| `srv-d9ju49id0e5s7389fjlg` | `suspended`, **`suspenders: ['billing']`** |
| Resume | `POST /resume` → **400** `"only services suspended by a user can be resumed"` |
| Staging `srv-d9jun8m417fc73dore50` | **DELETED** on owner approval — `DELETE 204`, `GET` after → 404 |

**A billing suspension cannot be lifted through the API.** Deleting staging
stopped future consumption of the free allowance; it cannot restore a consumed
one, and production stayed 503 across ten checks 20 s apart.

**The reason is UNKNOWN and I could not obtain it.** `GET /v1/owners/{id}`
returns **200 with an empty object** — the key reads services and exposes no
billing detail. ⚠️ **Do not state free-instance-hour exhaustion as fact.** That
is inference; the account also carries Solar's *paid* Postgres, so a payment
issue fits the same evidence. Only the Render dashboard distinguishes them.

**Not caused by any 07-28 commit** — `checks` and `image` pass on all of them.
The Release failure is the deploy step hitting a suspended target; it clears
itself with no code change. Re-run Release once production serves.

Offered but NOT done: delete the retired node service `srv-d9jsliu7r5hc73b1kncg`
— never deployed, never served, domain detached.

---

### The session, in order

| # | What happened | Commit |
|---|---|---|
| 1 | Read the resume pointer. Schedule: finding 5 → finding 4 → T-0016/17 → Phase 4 | — |
| 2 | **Finding 5** — `1d10bd5` left `revokeRefreshToken()` typechecking, untested, **called by nothing**. Wired `performSignOut()` (revoke → clear cookie → end SSO session; the ORDER is load-bearing), 7 per-app server actions, `AccountControl` in the top bar. Proved by A/B refresh grant: **200 without sign-out, 400 `invalid_grant` with** | `32e5f50` |
| 3 | Found while proving it: the session cookie name came from `NODE_ENV` but Auth.js picks it from the URL **scheme** — over http a signed-in user resolved to **nobody**, silently. And `viewerLabels(null).userLabel` was the string `Sign in`, so the control offered **Sign out to anonymous visitors** | — |
| 4 | **Codex gate** — 2 MEDIUM, both real: non-secure cookie name first = session fixation on https; sign-out must not depend on `/me` | `39396ef` |
| 5 | **Supervisor gate, run independently** — 3 MORE that Codex missed. Worst: logout sent no `client_id`, so after any refresh dropping the id token, sign-out clears the cookie, reports success and **leaves the Keycloak session alive** | `6725b14` |
| 6 | **Finding 4** — gated in the layout, then **probed my own fix and found it wrong**: signed out, the DOM showed only the denial but the page's server component **EXECUTED** and its output shipped in the **RSC flight payload**. So: layout gate for chrome/enumeration + `requireWorkspaceAccess()` per page for data + `check-page-gates.sh` as a build gate | `a7d2fa5` |
| 7 | **Codex on the guardrail** — it was satisfied by an *import line*. Made strict, 9/9 self-test | `9560c7a` |
| 8 | *"Run full test on the live site"* → production **and** staging 503. `render-status.yml` had been probing the **retired** service and reported healthy | `aba2f7b`, `44100e3` |
| 9 | Owner: *"yes drop"* → deleted staging behind a dry-run gate with a name assertion; removed the staging gate from `release.yml` and wrote down what protection that costs. Resume attempted; Render refused | `a22fd5f`, `cd3e610`, `f617d4d` |
| 10 | Owner: *"no front end to access the back end"* / *"no feature"* → measured: 8 endpoints, front end called **one**. Built `apiGet()` + the Organizations screen. Verified signed-in: **2 orgs in Postgres, 1 rendered** | `9b29ebd` |

Gates: `typecheck 15/15 · lint 15/15 · unit 149 · identity journey 2/2 · page-gate guardrail 9/9`.

---

### Traps this session paid for — do not relearn them

- **Stale build artifacts, three times.** `apps/api/dist` predating a security
  fix made `/me` 500 then 401 and read like an auth bug. `rm -rf` `.next`/`dist`
  and kill old servers **before** verifying anything.
- **Do NOT kill `wslrelay.exe`.** I did; it severed Docker's host port
  forwarding, so Keycloak and Postgres became unreachable from the host while
  perfectly healthy inside their containers. Repair is `docker restart` per
  container. A Postgres restart also kills Keycloak — restart it after.
- **An indented heredoc terminator inside a YAML `run:` block never closes.**
  The step printed nothing and read like an empty API response.
- **`trap ... EXIT` fires inside a process-substitution subshell** — it deleted a
  fixture directory mid-run and surfaced as "No such file or directory" pointing
  at a line that was correct.
- **`packages/ui` is framework-free on purpose.** Anything needing `next/*`,
  `react-dom` or a server action belongs in `packages/next-shell`.
- **React is pinned to 18.3.1 with Next 15** — a form action works at runtime but
  has no React 18 type. The cast in `AccountControl.tsx` is deliberate; delete it
  if React goes to 19.
- **Vitest cannot resolve `next/server`** in `packages/auth`, so anything
  importing `next-auth` cannot be imported from `tokens.test.ts`. That is why
  `origin.ts` and `logout-url.ts` are separate modules.

### Also open

- **T-0016** switchers, **T-0017** panels — both visible to the owner.
- **T-0033** — `AUTH_URL` absent from `render.yaml`; a probable `workshop-web`
  realm/origin mismatch (`render.yaml` deploys it at
  `autoworkshop.aiappinvent.com` while that client's allow-list has
  `workshop.autoworkshop.aiappinvent.com`); no audit event on logout, which
  CLAUDE.md §9/§16 require.
- **`RENDER_API_KEY` still unrotated** from the transcript leak.
- **Playwright full suite not re-run** since these changes — only the identity
  journey (2/2). The other six apps have stale `.next` builds on disk.

---

## 2026-07-27 (pt2) — T-0005 sessions + Render deploy blocked

**Tip `0b678b5` on `master`, pushed, tree clean.** Read `.claude/NEXT_SESSION_SCHEDULE.md`
for the ranked plan, then `.claude/CURRENT_TASK.md`.

### Commits

| Commit | What |
|---|---|
| `dc0ab95` | Render blueprint + provisioning workflow |
| `71d7d8a` | deploy build skips the checks CI already runs |
| `379bc41` | single in-process build worker on the deploy builder |
| `0b678b5` | **T-0005 — Keycloak session in all 7 Next apps. GATES PENDING.** |

### Headline 1 — Keycloak had been dead for ~30 hours and nothing noticed

Postgres restarted underneath it at `12:25:24` on 07-26. Keycloak's first Agroal failure
was `12:25:54` — thirty seconds later — and the pool never recovered. `docker ps` reported
**"Up 41 hours"** throughout. It spanned three prior sessions. Nothing noticed because
nothing exercised Keycloak: the shell had no session, which is precisely what T-0005 was
about.

`restart: unless-stopped` did not help — the process never exited, it hung. And
`KC_HEALTH_ENABLED: "true"` was set with **no healthcheck reading it**. Compose now probes
the **realm discovery document**, deliberately not `/health/ready`: Keycloak ships with the
Quarkus datasource health check disabled, so that endpoint answers
`{"status":"UP","checks":[]}` without touching the database and would have said UP for all
thirty hours. Proven to discriminate in both directions before shipping.

### Headline 2 — two auth defects survived every gate

Found by **starting the app**, after typecheck 15/15, lint 15/15, 122 unit tests and a
10-target build were all green:

1. `UntrustedHost` — Auth.js v5 rejects an unrecognised Host and only auto-detects Vercel.
2. The Keycloak provider had **no `issuer`**, so it had no endpoints at all.

Both made every `/api/auth/*` route return **500 while ordinary pages returned 200**. That
asymmetry is the reason a build-green check cannot see them. Verify auth by calling
`/api/auth/session` and `/api/auth/providers`.

### Headline 3 — the Render build fails silently, and six attempts did not find it

`autoworkshop.aiappinvent.com` is **not live**. DNS is correct, the service exists with the
right config, the custom domain is attached. `next build` exits **1** immediately after
"Skipping linting" with **completely empty stderr**.

Ruled out by measurement: memory (builder has 48 CPUs / 95 GB / 8 GB cgroup, exit 1 not
137), worker pool (`cpus: 1` changed nothing), lint and type-checking (skipping moved the
failure), `sharp` (tested directly), and the code itself (a fresh clone of `master` built
cleanly with Render's exact commands).

**Two of the six attempts were fixes for wrong diagnoses.** The heap cap was removed;
`experimental.cpus: 1` is still in all seven `next.config.mjs` and **should come out**.

**Next move: run the same build in GitHub Actions on Ubuntu** — Linux like Render, and it
does not swallow stderr.

### Traps worth carrying forward

1. **Search before adding.** The audience mapper I was about to add already existed as the
   `autoworkshop-audience` client scope. Verified against a real token
   (`aud: ["autoworkshop-api","account"]`) instead of assumed.
2. **A stale server lies.** The build-freshness gate caught seven `next start` servers from
   before the rebuild, and caught my own on port 3100 mid-verification.
3. **Idempotence is not obvious.** `seed-dev-identity.sh` failed on its second run — the
   realm's `passwordHistory(3)` rejects re-setting the same password, so it now sets one
   only when no credential exists. A script that ran once looked idempotent and was not.
4. **`getAccessToken()` must not demand the secret before checking for a session.** It
   runs on every render; requiring `AUTH_SECRET` up front would 500 every page for
   visitors who have no session and need none.

### Owner direction

- **`RENDER_API_KEY` was pasted into the chat transcript.** Owner: "soon we rotate".
  Treat as compromised until rotated, then update the GitHub secret on this repo.
- Service naming settled: **one service, `autoworkshop`**, matching the Solar pattern
  (`solarpro-global` serves `solarpro.aiappinvent.com` — name and subdomain need not match).

---

# Session handover

> Read this first, then `.claude/CURRENT_PHASE.md` and `.claude/TASK_QUEUE.md`.

## Where the project stands — 2026-07-26 (session 2, afternoon)

**Release 0.1 shipped and tagged `v0.1.0`.** **Phase 2 (identity) partially complete.**
**Phase 3 (application shell, Release 0.2) is the current work and is now gated green.**

Repo: https://github.com/marc667us/autoworkshop-ai — public, `master` + `develop`.
Approved plan: `C:\Users\USER\Documents\autoworkshop app\_plan\COMBINED_PLAN_v2.md`
(Codex `PASS WITH CORRECTIONS` 14/14 applied → Supervisor `PASS WITH CONDITIONS` 8/8 applied).

## This session — resumed a frozen session and finished its work

The previous session (transcript `f2cda62b-ed38-42fd-87de-540a2665efb4`) froze mid-command at
14:27 UTC, part-way through `pnpm typecheck && pnpm build` after fixing a circular-import crash.
Its process did not survive. This session read that transcript, resumed at exactly that point, and
completed the work.

**Gates, all green:** typecheck 13/13 · lint 13/13 · **tests 64** · build 9/9 (7 apps + API +
Storybook). Runtime verified by serving the production build, not just by building it.

### Shipped

- `packages/navigation` — navigation model for all 7 workspaces from `01 (1).txt` §34-§39 and
  `02.txt` §52/§58. 27 tests, including that all 25 platform-admin entries are present.
- `packages/next-shell` — ONE Next adapter (`WorkspaceShell`, `renderModulePage`, `viewerGrants`)
  for all 7 apps. The per-app shell copy that existed briefly was deleted.
- `packages/ui` — AppShell, TopNav, SideNav, Breadcrumbs, PageHeader, StatusBadge, ThemeProvider,
  **Tabs, Dialog, Drawer, AiAssistantPanel**, `useFocusTrap`, `useMediaQuery`.
- Runtime theming (light / dark / **system**) via CSS custom properties + no-flash boot script.
- Responsive shell: below 768px the side nav becomes a modal overlay drawer with a focus trap.
  `prefers-reduced-motion` is honoured by every animation.
- AI assistant panel per `02.txt` §8 — discloses the proposed action, the data it will use,
  read-only vs changes-data, the approval requirement and sources. Not wired to an agent (Phase 8),
  and it says so plainly rather than presenting an input box that swallows questions.
- `ai-coworkers/` + `reviews/` + `scripts/` pair-coding skeleton installed (was missing entirely,
  contrary to root CLAUDE.md). `./scripts/quality-gate.sh` now exists in this repo.

## Defects found by review — do NOT reintroduce

Codex reviewed the diff; each finding was verified against source before being accepted, and each
fix was verified at runtime afterwards. Reviews are saved under `reviews/`.

1. **The catch-all route ignored permissions entirely.** `renderModulePage` resolved against
   `workspace.groups`, not the grant-filtered tree, so any permission-gated module rendered by URL —
   and the placeholder page *printed the required permission name*, handing out a map of the
   authorization model. It also claimed "permissions for this screen are working" while checking
   none. Now resolves via `visibleGroups(workspace, grants)`, defaults to `[]` (fail closed), prints
   no permission names, and the copy is honest. **Verified live: gated URL 404s, ungated 200s.**
2. **Every right-hand top-nav button was focusable and inert.** Create / Tasks / Messages /
   Notifications / Help rendered as live buttons with count badges and no handler; the TopNav
   docstring simultaneously claimed "none of them silently no-op". An action with no `onSelect` now
   renders `disabled` with ", not available yet" in its accessible name. The workspace/org/branch/
   user indicators render as **plain text**, not buttons, until their switchers exist.
3. **Self-found, after Codex's pass: the nav and the router disagreed about who the viewer is.**
   The 7 `layout.tsx` files passed a hardcoded grants array while the catch-all passed none, so the
   workshop nav advertised `/finance-and-warranty/invoices` and that URL 404'd. Both now read
   `viewerGrants()` in `packages/next-shell/src/viewer.ts` — one function, one truth. Locked by
   `viewer.test.ts`, which asserts the *property* (everything advertised must resolve), not the
   symptom. **This is the bug class to watch for: two literals in two files cannot be type-checked
   into agreement.**
4. **`ThemeToggle` declared `role="radiogroup"` without the keyboard behaviour that promises.**
   Three tab stops, no arrow keys. Now a roving tabindex with arrow/Home/End, per the ARIA pattern.
5. **A circular import between `packages/design-tokens/src/themes.ts` and `index.ts`** put `primitive` in the
   temporal dead zone and crashed the production build while typecheck stayed green. Fixed by the
   previous session by extracting `primitive.ts`. **Watch for this class — a green typecheck does
   not prove a module graph initialises.**

## The rule this session kept learning

Everything in items 1, 2 and 3 passed typecheck, lint, 47-then-59 unit tests and a 7-app production
build while broken. **Build the thing, then run it and look.** Every real defect here was found by
either reading the code adversarially or by `curl`-ing the running app — none by a green gate.

## T-0008 (Supervisor C3) — DONE AND DRILLED

**WAL archiving had never once worked.** It was recorded last session as "done and VERIFIED live";
that verification had read the settings back. `pg_stat_archiver` said `archived_count=0`,
`failed_count=864`. `/wal_archive` was a root-owned Docker volume and `archive_command` runs as
uid 999 — every attempt denied, retried forever, nothing surfaced. **There was no point-in-time
recovery at all.** Fixed by the `postgres-init` service in the compose file.

Now in `infrastructure/backup/`: `verify-archiving.sh` (proves archiving by forcing a switch),
`backup.sh` (encrypted physical + logical + Keycloak realm, checksums, manifest, off-host copy,
retention) and `restore-drill.sh` (restores into a throwaway cluster and measures RTO/RPO).

**Drill passes 4/4 runs, 8/8 checks: RTO 16–106 s, RPO 0** — including all 10 transactions committed
*after* the backup, which is the actual proof of WAL replay. Reports in
`infrastructure/backup/drills/`. Full record in `reviews/supervisor-adjudication-c3-backup.md`.

Run it: `cd infrastructure/backup && ./restore-drill.sh` (~2 min, never touches the live cluster).


## Scheduling is LIVE (T-0018 / T-0019) — 2026-07-26

Four Windows Task Scheduler tasks under `\AutoWorkshop\`, all proven by triggering them:
health (every 6h) · daily 02:15 · weekly Sun 03:15 · **restore drill Sat 04:15**.
Production equivalent: `infrastructure/backup/schedule/autoworkshop-backup.cron`.
`./check-backup-health.sh` reports HEALTHY (7/7). Re-install: `schedule/install-windows.ps1`.

Two defects the scheduler found that manual runs never would:
1. `pg_switch_wal()` is a NO-OP with no WAL activity, so the pre-backup archiving gate blocked
   backups entirely on an **idle** database. Fixed with a heartbeat write before the switch.
2. The health check ran `grep` inside the minio container (minimal image, no grep) -> false
   CRITICAL "no off-host backup" while four sat in the bucket.

Caveat: Windows tasks run as the interactive user, so they need you logged in. The first scheduled
weekly returned 0xC000013A (terminated) mid-run; clean on every retry, root cause unconfirmed —
glance at the first real Sunday 03:15 run.

**Re-verified 2026-07-26T19:47Z:** all four tasks `Ready`, `LastResult 0x0`, next runs scheduled
(daily 07-27 02:15 · weekly 08-02 03:15 · drill 08-01 04:15 · health 6-hourly). Health check live:
**HEALTHY 7/7**, WAL `archived=50, failed=0`, newest backup 1 h old, 4 base backups off-host.

**Cosmetic, not urgent:** the *registered* task descriptions in Task Scheduler are still the old
text and show mojibake (`Monthly restore drill â€” …`) because the installer used non-ASCII dashes.
The source is fixed; the live descriptions refresh on the next `install-windows.ps1` run. Triggers
and behaviour are correct now — the tasks were left running rather than re-registered for a string.

**T-0019 is partial, not done.** `check-backup-health.sh` *detects* (age, job freshness,
`failed_count`, drill age) and exits non-zero, but delivery is cron-mail only — **on Windows
nothing notifies anyone**; it writes `status/health.json` and waits to be read. Closing that is
T-0023.

⚠️ **`71a17fd` shipped without either review gate** — no `reviews/` record, and it updated no
control file, which is why this handover and `TASK_QUEUE.md` both went stale. Retro-reviewed
2026-07-26 (Codex + Supervisor); records in `reviews/`.

**That retro-review found a CRITICAL and a HIGH, both now fixed.** The off-host-copy check reported
`OK` when there were **zero** off-host backups — right on the healthy path, wrong on the only day it
matters — and the per-job lock allowed two concurrent `pg_basebackup`s the file's own header said
were impossible. **Codex found neither**; it drifted onto the Markdown files on both attempts
despite an explicit four-file allow-list. Every code defect here came from the Supervisor pass.
Treat a green Codex verdict on infrastructure shell as unproven until someone reads the code.

## Viewing the app locally

`pnpm build` then, per app, `cd apps/<name>-web && npx next start -p <port>`:
customer 3000 · workshop 3001 · supplier 3002 · fleet 3003 · insurance 3004 · towing 3005 · admin 3006.
**`npx next start` without `-p` ignores the package.json port and every app fights over 3000.**
Stop them before rebuilding — a running server locks `.next` on Windows.
Nothing is deployed to autoworkshop.aiappinvent.com yet.

## SESSION 2026-07-26 pt3 — close. Tip `bdfe65c`, pushed, tree clean.

Seven commits. Release 0.2 is **one defect away** from closing.

**T-0014 done** — 77 stories, every component in `packages/ui`.
**T-0015 done and PROVEN** — Storybook axe **84/84 green**; journey **37 passed / 4 failed**, and the four
are left failing on purpose because they are real.

🔴 **START HERE NEXT SESSION — T-0030.** At 360px the side nav renders **inline instead of as an overlay**:
`main` is squeezed to **103px** and the page scrolls horizontally by **161px**. `useIsMobile()` is returning
false in the built app while TopNav's CSS-driven mobile filtering still works, which is what hides it.
Confirmed *after* waiting for hydration, so it is not a test race. **This is Phase-3 defect 7, still live**,
underneath a green typecheck, green lint, 37 unit tests and a 9-target build.
Start at `packages/ui/src/AppShell.tsx:89` (`const isMobile = useIsMobile()`) and
`packages/ui/src/useMediaQuery.ts:26`. Reproduce with:
`cd apps/e2e && npx playwright test --project=shell-journey -g "overflow at 360px"`

Also fixed today: dangling `aria-controls` (axe CRITICAL) in **two** places — every *collapsed* SideNav group,
and TopNav's hardcoded `app-side-nav` while the mobile Drawer is unmounted. TopNav now takes `sideNavId`.

**Two of the four failures were the TESTS being wrong, not the code** — worth knowing before "fixing" them:
Tabs implements **manual activation deliberately** (arrows move focus, Enter selects; each panel costs a
fetch), and the modal-drawer focus test slept 200ms and raced the focus-trap effect.

**Guardrails shipped** (`scripts/guardrails/`, Stage 0 of `quality-gate.sh`): BM25 RAG grounding,
claim verification, scoped review with drift audit, shell-idiom lint. See `scripts/guardrails/README.md`.

**Plan extended** for specs 07/08/09 → `docs/00-project/PLAN_EXTENSION_v1.md`. New Phases 12 (simulation
intelligence), 13 (knowledge ops), 14 (community). ⚠️ `autoworkshop 07.txt` is **two documents** — lines
1798–5069 are a separate workshop-side spec (§1–52) that the first draft missed entirely.

**Beware the pipe trap.** `cmd | tail` reports *tail's* exit status. It made `playwright | tail` look like
exit 0 over 9 failures, and let a commit through while both guardrails were failing. Capture `$?` before any
pipe.

## SESSION 2026-07-27 — T-0030 CLOSED. It was never a product defect.

**Start here: T-0031, then T-0027.** Release 0.2 is closed.

### T-0030 was a stale server, not a responsive bug

Carried in as a live red defect: at 360px the side nav rendered inline, `main` squeezed to 103px,
161px of horizontal overflow, `useIsMobile()` false in the built app. **The shell was correct all
along.**

Seven `next start` servers were launched at 12:35 and the apps were rebuilt at 14:38 underneath them.
`next start` resolves its chunk manifest once at boot, so those servers kept serving HTML that
referenced chunk hashes the rebuild had deleted. Every chunk 404'd, React never hydrated, and
`useIsMobile()` never advanced past the `false` it deliberately starts with for SSR safety.
`reuseExistingServer: !CI` handed those stale servers straight to Playwright.

Reproduced under control rather than argued: stale server -> `main` 103px, scrollWidth 521 vs
clientWidth 360, no `__react*` keys on `<body>`. Fresh server, same build -> 360px, no overflow,
hydrated. Both numbers match the original report exactly.

**Why it fooled a careful reader.** The server still answers 200, the SSR markup is correct, and
TopNav's mobile rules are plain CSS *inside that markup* so they keep working. The previous session
cited that asymmetry as proof the bug was real. It is actually the signature of a page whose
JavaScript never ran. Waiting longer for hydration cannot fix a chunk that 404s — which is why "I
waited for hydration, so it is not a race" ruled out the wrong hypothesis.

### Now gated

`apps/e2e/tests/build-freshness.setup.ts` runs as a Playwright dependency project before every other
project and fails the run if any server references a `/_next/static` asset that is not on disk in
that app's `.next`. Proven both directions: it names the exact missing chunk on a stale server, and
passes 7/7 on fresh ones. "Stop the servers before rebuilding" was already written in THIS FILE when
the incident happened — documentation did not prevent it, so it is a gate now.

### Four more defects found, none of them by Codex

1. **The only security-relevant test in the suite had never once executed.** `"<workspace>: a gated
   URL 404s when typed directly"` — the regression test for the permission-BYPASS defect —
   `test.skip`ped in **all seven** workspaces, silently, every run. The nav model gates on just two
   permission keys and the demo viewer held both, so `gatedHref()` found nothing gated anywhere.
   Fixed: `DEMO_DEFAULT` no longer holds `finance.read`, and a new test fails if no workspace
   exercises gating. **When it was made to run, fail-closed held** — real 404s. It just had no proof.
2. **The suite served every app with the wrong Next major.** `npx next start ../<app>` ran from
   `apps/e2e`, which pinned `next@14.2.21`, against apps built with `15.1.3`. Next 14 dies on a
   missing `font-manifest.json`. Latent since T-0015 was written and masked entirely by the stale
   server reuse — removing one bug exposed the other. Fixed with per-app `cwd` + version alignment.
3. **The overlay test was a sleep-race** and would have stayed red on a correct app: it never waited
   for hydration. The overflow tests waited with `waitForTimeout(400)` — a race with the machine, not
   the app. All now use `waitForHydration()`, which waits for React's `__reactFiber$` keys, not a
   duration. `readyState === 'complete'` is NOT sufficient: it is equally true of a page whose JS 404'd.
4. **The disclosure assertion could not pass on correct code** — it matched the viewer's own grants in
   the RSC flight payload. Tightened to the gated module's specific required permission.

Codex found one real defect (stale copy on the workshop dashboard naming `finance.read`), which was
outside the changed files — a good catch. It also skipped both questions it was explicitly told to
answer and emitted no `VERDICT` line, for the third review running.

### T-0031 was the same phantom

Closed the same day. "Arrows move focus but not selection" is exactly how a correct radiogroup
behaves when its JavaScript never loaded: `setPreference` cannot run, so `aria-checked` never
changes. The roving tabindex and arrow/Home/End handling had already shipped with the defect-4 fix.
Both radiogroup tests pass on a fresh build, verified twice.

**So all four tests left red at the previous close were one environmental fault** — three T-0030,
one T-0031 — and no shell code was wrong in any of them.

### Open, recorded honestly

- **One unexplained anomaly:** a single build-guard run passed against a demonstrably stale server.
  Two later runs on the same state failed correctly and named the chunk, and a direct replication of
  the guard's logic also reported it missing. Not reproducible, no explanation. Recorded rather than
  rationalised — the direction (passing when it should fail) is the one that matters.
- **Guard covers each app's entry route only.** The shared runtime chunks it does check change on
  essentially any edit, so coverage is high but not total. Extending to a sample of routes is a cheap
  follow-up.

### Gates, 2026-07-27

typecheck 14/14 · lint 14/14 · unit 64 · build 10/10 · **Playwright 138 passed, 0 failed, 2
legitimate skips** (admin holds every grant; customer has no gated item). The three tests left
deliberately red last session are green and **none was weakened** to get there.

## T-0027 DONE — navigation is now workspace x role. Phase 5 unblocked.

`07.txt` **part 2** §46-§49 gives four DISTINCT navigation trees inside the single `workshop`
workspace. They are not filtered views of §34: the spec groups and labels the same work differently
per role (the owner's "Repair Requests" is the manager's "Repair Request Inbox"; "MY JOBS" and
"TECHNICAL TOOLS" exist for the technician alone). §50 names EIGHT roles but gives trees for four —
supervisor, storekeeper, quality-control and cashier fall back to the workspace default, which is what
the spec provides.

**Design, and why:** `workspaceForRole()` returns a `Workspace` with the role's groups swapped in, so
the shell, `breadcrumbsFor`, the catch-all router and the journey tests all keep taking the type they
already took. Threading a `role` parameter through each would have created a SECOND place where "which
tree is this viewer on" gets decided — and this repo already shipped that bug for grants, where the nav
advertised routes the router 404'd. **`viewerRole()` is the single decision point**, called by both
`WorkspaceShell` and `renderModulePage`. Role selects the tree; permissions still filter it.

**Verified live, not just built:** the workshop app renders §49 exactly (Home · My Jobs · Technical
Tools · Plan Work · Record Work · Testing · Learning). `/my-jobs/inspection-required` -> 200,
`/technical-tools/fault-code-search` -> 200, and the §34-only `/workshop-floor/repair-staging` -> **404**.
The menu and the router moved together, which is the entire property at stake.

**Codex found two real defects, both confirmed and fixed:**
1. `workspaceForRole` kept `roleGroups` on its result, so re-applying it with a different role fell
   back to the FIRST role's tree — a supervisor would have got the technician's navigation under their
   own name. Fixed by dropping the field: a resolved view has no business carrying the menu of
   alternatives it was chosen from.
2. `/home/dashboard` is a concrete route that bypasses the catch-all, and its header still said
   "Workshop Dashboard" while the technician nav called it "Technician Dashboard". Now derived.

**The Supervisor pass found a third**, in the area Codex was asked about and skipped: a role tree could
silently drop a permission during transcription — `07.txt` prints "Invoices" as plain text, the trees
are hand-transcribed per role, and every existing test would stay green because the item is *supposed*
to be there. Guard added.

**One finding was correctly REJECTED.** That guard's first run flagged
`reception: /vehicle-intake/issue-intake-receipt`. §48's "Issue Intake Receipt" is proof the workshop
took custody of the vehicle, not a payment receipt — gating it would have hidden a core reception
function from reception staff to satisfy a regex. Handled as a named exception with its reason, plus a
test that the exception still refers to a live item.

**Skips rose 2 -> 3:** `workshop` no longer exercises the gated-URL test, because §49's technician tree
legitimately has no permission-gated item. Five workspaces still do, and
`at least one workspace must exercise permission gating` enforces it never reaches zero.

Records: `reviews/supervisor-adjudication-t0027-workspace-role.md`.

**Gates:** typecheck 14/14 · lint 14/14 · **unit 79** · build 10/10 · **Playwright 137 passed, 0
failed, 3 legitimate skips**.

## T-0003 DONE — identity services. Next blocker is T-0005, not more services.

The tables already existed (migration 001). This was the SERVICES: `BranchService`, `UserService`,
`MembershipService` + controllers, on the `OrganizationService` pattern so a REST controller and an
MCP tool are thin callers of one service. Eight routes live under `/api/v1`; every one returns **401**
unauthenticated, on a forged token, and on the privilege-granting POST.

### The defect class this task is really about

**`identity.users` has NO `tenant_id` and NO row-level security** — deliberately, because one human
may hold memberships in several tenants. So unlike everywhere else in this schema, **RLS will not
save you here**: a plain `SELECT * FROM identity.users` inside `withTenant` returns every user on the
platform and no policy stops it. It type-checks and reads naturally.

Every `UserService` query therefore starts `FROM identity.memberships` (which IS under FORCE RLS) and
joins outward. **The join is the security control**, and `identity.spec.ts` asserts the query SHAPE
because nothing downstream would notice the property being violated.

### Three defects found, all fixed

1. **HIGH — a foreign key cannot carry a tenant predicate.** The FKs reference
   `organizations(id)`/`branches(id)` by id alone, and RLS `WITH CHECK` validates the tenant of the
   INSERTED row, never the tenant of the row it points at. So `tenant_id = A` +
   `organization_id = <org in tenant B>` satisfied both. On the privilege-granting operation. Fixed by
   looking the parent up through the RLS-protected table first: a foreign organization is invisible
   there, so the check IS the isolation. Branch-belongs-to-organization checked too.
2. **The same hole in `BranchService`**, which Codex never saw because it was outside the file it
   focused on. Found by asking "where else does this shape appear?".
3. **MEDIUM — `withdraw`'s status was never validated at runtime.** The union type is erased and the
   controller forwards the body verbatim, so `{"status":"active"}` passed the DB CHECK: a withdrawal
   that changed nothing but still audited `membership.active`. **Fixed in the SERVICE, not the
   controller** — an MCP tool calls the service directly, so a rule at the HTTP edge does not bind
   agents.

### Reviewer note — Codex's best pass yet

First time it answered every question it was asked AND emitted the required `VERDICT` line
(`CHANGES REQUIRED`). Two of its three findings this pass had already been found independently by the
Supervisor; **the third had not, and would have shipped.** The standing rule to run the Supervisor
independently still holds — it now cuts both ways.

### Operational warning

The API on :4000 had been running since **2026-07-26 05:09**, serving a build older than every
controller in this change — the same stale-server condition that produced the T-0030 phantom, in a
service the build-freshness gate does NOT cover (it watches the seven Next apps only). **A long-lived
`node dist/main.js` is exactly as dangerous as a long-lived `next start`.** Restart it after every
`nest build`.

**Gates:** typecheck 14/14 · lint 14/14 · **unit 98** (api 39) · `nest build` clean · 8 routes live,
all failing closed.

**NOT done, and not claimed:** the web apps are still not session-wired, so `viewerGrants()` and
`viewerRole()` keep their demo bodies. Replacing them is **T-0005**, not more identity services.

## T-0005 STARTED — API side done, Next side NOT. Resume exactly here.

`viewerGrants()`/`viewerRole()` cannot stop being demo data until something can
answer "what may this viewer see?" from a real role. **Nothing could**: the navigation gates on
`finance.read`, `organization.admin` and `platform.admin`, and no code anywhere mapped a role to any
of them. So T-0004's matrix was built first, because T-0005 is blocked on it in practice.

**Landed:**
- `apps/api/src/authz/permission-matrix.ts` — all 13 grantable roles → the 3 keys the nav gates on,
  each entry traced to `07.txt` pt2 §50, `01 (1).txt` §29 or §32. Deliberately small; new keys arrive
  with the modules that gate on them.
- **`GET /api/v1/me`** — userId, displayName, tenantId, organizationId, branchId, activeRole,
  `permissions[]`, and `memberships[]` (org + branch names, for T-0016's switchers). Every field
  derived server-side from the validated token plus membership; no request field can influence the
  role or the permission list.

**A real defect the tests caught:** `permissionsForRole('constructor')` returned the `Object`
function, because `ROLE_PERMISSIONS[roleName] ?? []` resolves up the **prototype chain** — truthy, so
`??` never fired. `Object.freeze` does not help; it seals own properties and says nothing about
inherited ones. Now `Object.hasOwn`. Same trap applies to any string-keyed lookup in this codebase.

### ▶ NEXT SLICE — the actual remaining work of T-0005

**The seven Next apps have NO session at all.** There is no Auth.js/next-auth dependency anywhere;
`packages/auth` exists but is an EMPTY directory. So:

1. Add Auth.js (next-auth v5) with the **Keycloak provider** into `packages/auth` — FOSS, zero cost,
   and named in the approved stack (`05.txt` §1 "Keycloak, Auth.js, JWT").
2. Server-side session → access token → call `GET /api/v1/me` → that becomes the body of
   `viewerGrants()` and `viewerRole()`.
3. **The refactor that will bite:** both are SYNC today and `viewerRole()` also feeds
   `workspaceForRole()`. They must become async server-side reads. Known call sites:
   the 7 `layout.tsx`, `renderModulePage`, and — watch this one —
   `apps/workshop-web/app/home/dashboard/page.tsx` computes `VISIBLE` / `NAV_GROUP_COUNT` /
   `PAGE_TITLE` **at MODULE SCOPE**. Module scope cannot await a per-request session; those must move
   into the component body.
4. `apps/e2e/tests/shell-journey.spec.ts` imports both functions to derive what the nav should
   advertise. Once they need a session, the suite needs a fixture identity — do not let this silently
   become untestable.

## IN FLIGHT — pick up here

**No feature work is in flight.** See `.claude/CURRENT_TASK.md`.

1. **T-0005 remainder** — Auth.js + Keycloak session in the 7 Next apps, then point
   `viewerGrants()`/`viewerRole()` at `GET /api/v1/me`. See the slice notes above, especially the
   sync→async refactor and the module-scope constants. Still the only thing holding T-0016.
2. **T-0023** — deliver the backup health alert to a human. Detection done; Windows routes it nowhere.
3. **T-0017** — quick-create / tasks / messages / notifications / help panels (§9-§14).
4. T-0020…T-0022 — off-host-only restore drill, MinIO object-lock, `--data-checksums` rebuild.

## Environment

Node 20.19.2 · pnpm 9.15.4 (**do not upgrade — pnpm 10+/11 require Node ≥22.13**) · Python 3.14.4 ·
google-adk 2.2.0 · Docker 29.4.3 · Ollama 0.24.0 · gh CLI at `%USERPROFILE%\bin\gh.exe`.

Local infra: `pnpm infra:up`.
API: `cd apps/api && npx nest build && node dist/main.js` with
`DATABASE_URL=postgresql://autoworkshop_app:change_me_locally@localhost:5432/autoworkshop`.
**Never point the app at the `autoworkshop` superuser** — the boot guard refuses it, by design.

Serve a built app to check it: `cd apps/workshop-web && npx next start -p 3001`.
**Stop it before rebuilding** — a running Next server holds a lock on `.next` and the build fails on
Windows with a file-lock error that looks like a code error and is not.

Windows: `kcadm` runs in-container, so `MSYS_NO_PATHCONV=1 docker exec …` is required or Git Bash
rewrites `/opt/keycloak/...` into `C:/Program Files/Git/opt/...`. The local side of `docker cp`
needs the opposite treatment — `cygpath -w`.

Codex CLI: `codex exec` **blocks waiting on stdin** unless you redirect `< /dev/null`, and it will
answer a briefing-shaped prompt by acknowledging the role instead of doing the work. Give it an
imperative first line, a diff already written to disk, and closed stdin. Its sandbox rejects
`pnpm`/PowerShell, so it cannot run the tests — it reads only.

## Owner directions — binding

10. **Use RELATIONSHIPS in databases and schemas** (2026-07-27). Model with real foreign keys and
    joins — normalised, referential, no duplicated columns standing in for a relation and no
    denormalised blobs where a table belongs. Already the shape of the identity schema
    (`tenants → organizations → branches → memberships → users`, with `/me` joining across them for
    organisation and branch names rather than copying them). It is binding for every table added from
    here: parts, job cards, quotations, invoices, warranty, fleet, claims, library records.
    ⚠️ **A foreign key still cannot carry a tenant predicate** — see the T-0003 finding. Relationships
    give integrity, RLS gives isolation, and you need both.

1. Name fixed: **AutoWorkshop AI** at `autoworkshop.aiappinvent.com` (Namecheap DNS)
2. **Stop cutting scope** — build everything structurally; only licensed content and labelled ML
   corpora stage
3. **Reuse Solar patterns, never entangle** — separate repo, DB, Keycloak realm, deploy, secrets, CI.
   **Do not open or run the Solar app.** Patterns are reused from memory and documentation, not by
   launching it.
4. **Zero cost including production** — never propose spending; that decision is the owner's alone
5. **Bring-your-own-connection** — tenants connect their own device/provider/credentials
6. Zero cost now; commercial infrastructure later, only if going commercial
7. **Solar is the reference — always refer to it**
8. **Codex is the reviewer; the Supervisor is the adjudicator.** Codex's findings are verified
   against source before being accepted — it is not infallible, and this session's third defect was
   one it missed.
9. **Do not run Google ADK or Stitch without the owner's approval.**

## Open owner decision (nothing to buy)

Where the self-hosted Docker stack should run: an always-free cloud VM, a machine already owned, or
local-only. It runs locally today, so nothing is blocked.

## Machine state

Sleep, hibernate and monitor timeouts are currently **disabled** (owner asked for uninterrupted
running). To restore: `powercfg /change standby-timeout-ac 30`, `hibernate-timeout-ac 180`,
`monitor-timeout-ac 10`.

A NestJS API process from the frozen session (`node dist/main.js`, started 05:09) was left running
deliberately — it is a working service and nothing required restarting it.
