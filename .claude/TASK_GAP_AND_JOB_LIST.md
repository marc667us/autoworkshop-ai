# Task gap, job list and schedule — 2026-08-11

**Written at session start on tip `ee27c44`, `master`, tree clean.**
Source of truth for scope: `docs/00-project/COMBINED_PLAN_v2.md` (v2) and
`docs/00-project/PLAN_EXTENSION_v1.md` (extension). This file does not decide
scope — it measures how far the build is from those two documents and orders
the remaining work.

⚠️ **Two kinds of statement live below and they are labelled.**
**MEASURED** = a command was run this session and its output is quoted.
**READ** = a deliverable list in the plan was compared against code by eye.
A route with a page is not a feature that runs — that confusion has its own
recorded defect in this repository. Challenge the READ rows; do not quote them
as measurements.

---

## 1. What was measured, and with what

| Instrument | Result |
|---|---|
| `bash scripts/start-session.sh` | migrations **0 applied / 76 skipped**, 5 containers healthy, ports free after killing a stale listener on 4000 |
| `bash scripts/record-live-state.sh` | apex/customer/api/keycloak **200**, supplier **307**; 9 anonymous routes **401**; 18 parts, 1 mechanic; all 3 owner buttons in the served HTML |
| `node scripts/audit-menu-coverage.mjs --all` | **267 of 380 distinct screens working (70%)**, 405 menu entries across 11 role trees, **111 with no page anywhere** |
| `grep CREATE TABLE` over `infrastructure/migrations/*.sql` | 18 schemas exist. **No `fleet` schema. No `insurance` schema.** `towing` has 7 tables |
| `ls apps/api/src` | 33 modules. **No `fleet` module. No `insurance` module.** `towing` present |
| Registration doors | DB: `identity.register_{workshop,supplier,fleet}`. API: `POST /registration/{workshop,supplier,fleet,customer}`. **No self-service insurance door** — but `insurance_assessor` **is** in `GRANTABLE_ROLES` (`membership.service.ts:37`) and an authorised admin can already write one (`membership.service.ts:225`) |
| Extension §6 table list (24 named) | **4 present by name** (`service_requests` 058, `approval_limits` 045, `diagrams` 048, `towing.requests` 074 — the plan's label is `towing_requests`). **6 more have differently-named equivalents** whose fitness for the extension's purpose is unproven: `knowledge.procedures`, `knowledge.fault_codes`, `knowledge.diagnostic_trees`, `knowledge.articles` (≈`library_records`), `core.vehicle_makes`/`vehicle_models` (≈`vehicle_catalogue`), `parts.tools` (≈`tools_equipment`) — **none carries the `content_rights`, review-queue or supersession columns the extension's library is built on**. **14 are absent outright** |
| Plan §3 repo layout | **Missing entirely:** `apps/mcp-gateway`, `apps/mcp-servers`, `apps/agent-host`, `apps/media-worker`, `python-packages/`, `domains/`. `packages/` holds **7** (`auth config design-tokens marketplace-ui navigation next-shell ui`), of which **5 appear in the plan's list of 23**. `apps/mobile` is a **16-file Expo scaffold** (`git ls-files`) |
| Codex (read-only pass, this session) | Confirmed the platform-admin API gap **TRUE**, with 7 endpoints named at file:line |
| Supervisor (independent pass, this session) | **29 further files** carry `platform_administrator` in a role allowlist that Codex's 7-endpoint answer does not cover |

### Screen gap by app — MEASURED

Two different numbers come out of the same run and they are **not the same
measure**. "Menu entries working" counts what a role's nav tree advertises and
finds a page for; "app routes" counts pages the app actually has. The app-route
figure runs one higher on several apps, because a route exists that no tree
advertises. Both are printed below rather than blended.

| App | Menu entries working | Dead ends | App routes |
|---|---:|---:|---:|
| workshop-web (5 trees) | 237 of 239 (+2 signposted) | 0 | 215 |
| customer-web | 36 of 36 | 0 | 40 |
| towing-web | 10 of 10 | 0 | 11 |
| **supplier-web** | **5 of 39** | **34** | 6 |
| **admin-web** | **5 of 26** | **21** | 6 |
| **fleet-web** | **1 of 29** | **28** | 2 |
| **insurance-web** | **0 of 28** | **28** | 1 |
| **distinct across 7 apps** | **267 of 380 (70%)** | **111** | — |

The workshop row sums five overlapping role trees (60 + 66 + 39 + 30 + 42), so
its screens are counted more than once there; the 267/380 line is the deduped
figure and is the one to quote.

---

## 2. The gap against the plan, phase by phase

Phases are v2 §8 as extended by extension §8. Nothing is renumbered.

| Phase | Release | v2 core | Extension adds | Gap |
|---|---|---|---|---|
| 1 Foundation | 0.1 | 🟡 **not done** | — | v2 §11 step 4 requires the **`python-packages/` skeleton in Phase 1**, and §3/§5 require **all 19 MCP server skeletons "from day one"**. Neither exists, along with `domains/`, 4 apps and ~13 packages. **Calling this ✅ was wrong** |
| 2 Identity | — | ✅ done | account types (as **requests**, not grants), verification variants, workspace provisioning, **workshop staff invitation with role + approval limits** | `account_types` and `workspace_provisioning` absent. **Staff invitation is INCOMPLETE, not missing** — `staff-form.tsx` and `membership.service.ts:119` already grant by email with a role; **approval limits are not assigned at invitation** |
| 3 Shell + Nav | 0.2 | ✅ done | **My Workspace resolver + Home Page card**; nav → workspace × role | nav model **done**; **My Workspace resolver missing** |
| 4 Customer + Vehicle | 0.3 | ✅ done | personal vehicle workspace, My Repair Dashboard, approve/reject/modify | `service_requests` exists; the **customer-side dashboard/approve-modify surface is READ as partial** |
| 5 Workshop + Repair | 0.4 | ✅ done | 07 pt2 §5–§39 operational detail | READ as covered by the 213 workshop screens |
| 6 Parts + Suppliers | 0.5 | 🟡 | — | **supplier verification, product validation engine, badges NOT built** — and 34 supplier screens are dead ends |
| 7 Finance + Partners | 0.6 | 🟡 | transport/fleet workspaces, approval limits, cost centres, **emergency towing + location privacy criteria** | invoices/payments/warranty built · **towing built workshop-side** · **fleet 1/29** · **insurance 0/28** · `cost_centres` absent · customer-side emergency towing + the six location-privacy criteria absent |
| 8 MCP + AI | 0.7 | 🟡 **started, off-plan** | 3 knowledge agents registered; simulation agents scaffolded | **An agent layer already exists inside the API** — `AgentsModule` (`app.module.ts:68`), `agent-host.client.ts`, `agent-proposal.service.ts`, `service-request-triage.agent.ts`, `discovery.agent.ts`, persistence in migration 064. **What is absent is the plan's shape**: no MCP gateway, no 19 skeletons, no separate `apps/agent-host`, no ADK root orchestrator or conductors. Calling this ⛔ was wrong — the risk is not "nothing", it is **drift from §0.2** |
| 9 Comms + Knowledge | 0.8 | 🟡 | whole 09 library, agent chain, copyright control | chat/voice/WebRTC shipped · **Knowledge CMS authoring is the gap** (048's tables are empty) · **library_records / content_rights / external_sources / technician_reviews all absent** |
| 10 Multimedia | 0.9 | ⛔ | 7-layer model, isolation, exploded views | **nothing** — no CV, sound, 3D, OBD, offline-sync, i18n; mobile is a scaffold |
| 11 Hardening | 1.0 | ⛔ | — | Playwright last ran 2026-07-29; §11 benchmark gate (extension §9.3) not defined |
| 12 Simulation | 1.1 | — | new phase | ⛔ by design, post-1.0 |
| 13 Knowledge Ops | 1.2 | — | new phase | ⛔ by design, post-1.0 |
| 14 Community | 1.3 | — | new phase (news feed, social, moderation) | ⛔ by design, post-1.0 |

### The three gaps that are invisible in a phase table

1. **`.claude/CURRENT_PHASE.md` is dated 2026-08-07 and is now wrong** — it
   predates towing (074), the fleet door (075) and migration 077. It is read as
   current. Correcting it is a job, not a footnote.
2. **The extension is almost entirely unscheduled — but not entirely, and an
   earlier draft of this file got that wrong.** `.claude/TASK_QUEUE.md:49` does
   carry **T-0028 "Account types as *requests*, workshop staff invitation,
   approval limits", phase 2, status `queued`** — so J11 below is a *resumption*
   of an existing queued task, not a new one. Everything else in extension §2,
   §2A, §2B, §3 and §4 has no queue entry, and **17 of its 24 tables do not
   exist at all** (three of the four that do predate the extension). That is
   still the largest single block of unscheduled approved scope.
3. **Two apps are deployed with nothing behind them.** fleet-web (1/29) and
   insurance-web (0/28) consume two of nine free Render service slots and no
   user can even sign into insurance-web, because no production path writes an
   insurance role.

---

## 3. Findings from this session's two gates

### Codex — the platform-admin API half is REAL. Verdict: **TRUE**

Migration 077 made `identity.is_platform_admin()` require an un-revoked row in
`identity.platform_administrators`. The API still derives `platform.admin` from
the membership `role_name` along this chain, each step quoted at file:line:
`keycloak-jwt.service.ts:91` → `tenant.guard.ts:52` →
`membership.repository.ts:74` → `tenant-context.ts:207` →
`permission-matrix.ts:77` → `permissionsForRole()` at `permission-matrix.ts:111`.

**Seven endpoints admit a revoked administrator:**

| Endpoint | Gate |
|---|---|
| `GET /security/posture` | `security.controller.ts:61` |
| `GET /operations/report` | `operations.controller.ts:39` |
| `GET /admin/catalogue/review-queue` | `catalogue.controller.ts:164` |
| `PATCH /admin/catalogue/suppliers/:id/publication` | `catalogue.controller.ts:170` |
| `PATCH /admin/catalogue/parts/:id/publication` | `catalogue.controller.ts:185` |
| `GET /registrations` | `organization-registration.service.ts:162` |
| `POST /registrations/:id/decision` | `organization-registration.service.ts:229` |

**Two of them have no database backstop at all** — the application check *is*
the enforcement: `GET /security/posture` reads server-wide `pg_catalog` through
`queryWithoutTenant` (`security-posture.service.ts:122-126`), and
`GET /operations/report` runs unscoped probes (`operations.controller.ts:33-37`,
`operations.service.ts:295`).

### Supervisor — Codex answered the question asked, and the surface is 4× larger

Codex was asked for endpoints gated **on `platform.admin`**. That is 7. But
`platform_administrator` is also an entry in a **role allowlist** in **29 further
API files**, and each of those confers authority the grant table no longer backs:

- `authz/approval-limits.ts:44` — `UNLIMITED_ROLES`. A revoked administrator
  still approves **any amount**.
- `repair/job-card-stages.ts:175` — `platform_administrator: STAGES`. **Every**
  stage transition, including quality control and release.
- `core/customer.service.ts:99` — the comment at `:85` calls it "the cross-tenant
  support role". Customer book read.
- `identity/organization.service.ts:16` — `CAN_CREATE_ORG`.
- `settings/settings.service.ts:103` — `MAY_GOVERN`.
- plus `directory.service.ts`, `pricing.service.ts`, `branch.service.ts`,
  `membership.service.ts`, `vehicle.service.ts`, `agent-operator-roles.ts`,
  `towing-roles.ts`, `workshop-roles.ts`, `reports.service.ts`,
  `knowledge.service.ts`, `calls.service.ts`, `comms.service.ts`,
  `supplier-request.service.ts` and the 11 `repair/*-rules.ts` files.

**Consequence for J1 below: the fix is not "regate 7 endpoints". It is 33 files,
and it needs a single resolved fact (`ctx.hasPlatformGrant`) that all of them
consult — not 33 separate edits to 33 allowlists.** Sizing J1 off the Codex
answer alone would under-scope it by a factor of four.

---

## 4. The job list

Ranked. `Gate` is what must pass before the job is called done — Codex →
Supervisor → (deploy) → **full live suite, both jobs, three numbers**.

### Block 0 — live defects. Nothing else starts first.

| # | Job | Size | Depends | Why first |
|---|---|---|---|---|
| **J1** | **Platform-admin API half.** Resolve grant state once in `TenantContext` (`ctx.hasPlatformGrant`), gate `PERMISSIONS.platformAdmin` on it, and sweep the **29 allowlist files** onto the same fact. Tests: membership-without-grant DENIED · active grant ALLOWED · revoked grant DENIED immediately. | L | — | **CRITICAL and live.** The DB is hardened on production; the API is not. Revoking a grant today removes DB reach and leaves 7 endpoints plus unlimited approval authority open |
| **J2** | **14 two-column `(x, tenant_id)` FKs** → migration 078, the shape 073 used for eighteen others. Named in `docs/05-database/RELATIONSHIPS.md` §8. **Do not touch the 2 that are correctly two-column.** | M | — | Cross-organisation writes inside one tenant; RI bypasses RLS, so no policy is consulted |
| **J3** | **Port the 5 supplier-web deploy defects.** Fixed forms already exist in `deploy-towing-web.yml`: falling-through poll, discarded deploy id, `\|\| echo 000` → `000000`, sleepless retries, inert `len()` guard, runtime `NEXT_PUBLIC_` | S | — | A green deploy that verified the OLD image is worse than a red one |
| **J4** | **Re-run `Release`** — failed on a GHCR secondary rate limit after the image built and passed its container smoke test | XS | — | Not a code defect. The apex serves the previous image until it runs |
| **J5** | **Rewrite `.claude/CURRENT_PHASE.md`** — dated 08-07, predates towing, the fleet door and 077 | XS | — | A stale phase file is read as current; that is its own recorded defect |

### Block 1 — the 111 dead ends. This is what the owner sees.

| # | Job | Size | Depends | Notes |
|---|---|---|---|---|
| **J6** | **supplier-web: 34 screens** + Phase 6's missing **supplier verification, product validation engine, badges** | XL | — | 5 of 39 work today. Phase 6 remainder and the screen gap are the same job |
| **J7** | **admin-web: 21 screens** — directory, governance, security & operations, AI/MCP surfaces | L | **J1** | Every one is a platform-admin screen. Building them before J1 ships 21 screens behind a gate that does not hold |
| **J8** | **The insurance self-service door.** ⚠️ **The recorded claim that `insurance_assessor` has NO production writer is WRONG and this file said so in an earlier draft** — it is in `GRANTABLE_ROLES` (`membership.service.ts:37`) and an authorised admin grants it at `membership.service.ts:225`. What is missing is a **self-service** `identity.register_insurer` + controller route, the way workshop, supplier and fleet have one | M | — | So the role question is **answered**, not open: an admin grant writes it today. Owner decides whether insurers self-register at all |
| **J9** | **Fleet domain: schema → API → 28 screens.** Org-scoped to the `fleet_operator` org, composite keys from line one (copy 074's shape). Membership aggregation per ADR-020 | XL | — | Both blockers already cleared (075 door, ADR-020). An empty Repairs screen must say *"you have not added a workshop yet"*, never render blank |
| **J10** | **Insurance domain: schema → API → 28 screens** | XL | **none** | No schema, no module. The only app at 0%. **It does NOT depend on J8** — an admin can already grant `insurance_assessor`, so the domain can be built and driven by a real assessor today; only the self-service funnel waits on J8 |

### Block 2 — approved extension scope, almost all of it unscheduled (J11 is the exception: T-0028 is queued)

| # | Job | Size | Phase | Notes |
|---|---|---|---|---|
| **J11** | **T-0028, already queued, and partly built** (staff-add exists; approval limits at invitation do not) — **account types** (Car Owner, Owner-Driver, Transport Manager, Fleet Manager) + workspace provisioning + **workshop staff invitation with role and approval limits** | L | 2 | **Invariant, non-negotiable:** the type a user selects is a **request, never a grant**; single-valued; not self-mutable; **authority derives from membership and role, never from the type claim.** Same rule that killed the realm-role shape |
| **J12** | **My Workspace resolver + Home Page card** — one control resolving per role after checking role, organization, vehicle registration and approval authority | M | 3 | Account type ≠ workspace. Car Owner and Owner-Driver are both `customer`; Transport and Fleet Manager are both `fleet`. Do not fork the nav tree four ways |
| **J13** | **Customer-side emergency towing** + `cost_centres` + approval limits for fleet/transport | L | 7 | Ships with the **six binding location criteria**: bounded retention · share only with the accepted provider · fleet vehicles only, never a personal vehicle · mid-request revocation degrades to a manual pin · **denied geolocation is a supported path, not an error** · every read/share/revocation audited |
| **J14** | **Knowledge CMS authoring** — the Phase 9 gap that leaves 048's tables empty | L | 9 | Prerequisite for J15 |
| **J15** | **Repair library + the 3 ADK knowledge agents** (`RepairKnowledgeAgent`, `ExternalResearchAgent`, `LibraryUpdateAgent`) under a `knowledge_conductor`, + `content_rights` copyright control | XL | 9 | **Blocked on an owner decision** — extension §9 blocking question 1: who authorises a host for the research agent? Recommendation on record: platform admin + per-tenant opt-in under D7. **No record reaches `approved` with `content_rights` unset** |

### Block 3 — the large phases (8 is started but off-plan; 10, 11 and 12–14 are not started)

| # | Job | Size | Phase | Notes |
|---|---|---|---|---|
| **J16** | **MCP + AI**: gateway, all **19** server skeletons, ADK root orchestrator + conductors, Class A/B live, C/D gated, approval UI, audit + kill switch — **and reconcile the agent layer that already exists** (`apps/api/src/agents/`, migration 064) onto the §0.2 topology rather than building a second one | XXL | 8 | Needs `apps/mcp-gateway`, `apps/mcp-servers`, `apps/agent-host`, `python-packages/` — none exist. **Count stays 19**: the three new surfaces are capabilities, not servers. ADK is permitted here (ADR-018 amendment). **Directive §3 applies: extend, do not duplicate** |
| **J17** | **Multimedia + Intelligence**: CV inspection, engine-sound, 3D viewer, OBD, offline-sync, mobile (Android first), multilingual | XXL | 10 | `apps/mobile` is a 20-file scaffold. `packages/offline-sync` and `packages/i18n` do not exist |
| **J18** | **Hardening**: full suite, security + a11y + responsive review, backup/restore drill, DR exercise, pilot onboarding — **plus the measured capacity benchmark** extension §9.3 requires instead of the word "comfortable" | XL | 11 | Playwright has not run since 2026-07-29 |
| **J19** | Phases **12 / 13 / 14** — simulation intelligence, knowledge operations, community | XXL | post-1.0 | Deliberately last. **No Phase 1–11 artefact may advertise these as present** — that is the condition that keeps their sequencing non-blocking |

### Block 4 — five tasks already `queued` in `.claude/TASK_QUEUE.md` and dropped from every recent schedule

An earlier draft of this file omitted these entirely. They are open, small, and
four of them are operational safety rather than features.

| # | Job | Queue id | Phase |
|---|---|---|---|
| **J20** | Quick-create, tasks, messages, notifications and help panels (§9–§14) | T-0017 | 3 |
| **J21** | **Drill a restore from the OFF-HOST copy alone** | T-0020 | 2 |
| **J22** | MinIO object-lock / immutability (needs a bucket rebuild) | T-0021 | 2 |
| **J23** | Rebuild the local cluster with `--data-checksums` on | T-0022 | 2 |
| **J24** | **Deliver the health-check alert somewhere a human sees it** (closes T-0019) | T-0023 | 2 |

J21 and J24 belong in Block 0 on merit — an untested off-host restore and an
alert nobody receives are both the "detection done, delivery is not" shape this
repository has been bitten by before. They are held here only because they do
not touch a live authorization hole. **Pull them forward if S1 finishes early.**

---

## 5. The schedule

Owner rule: **five slices plus issue resolution per session.** Every session ends
with the four gates and, if anything deployed, the **full live suite on the live
site reported as three numbers — passed / failed / skipped — never an exit code.**

| Session | Slices | Outcome that proves it |
|---|---|---|
| **S1 — next** | J1 · J2 · J3 · J4 · J5 | Revoked grant denied on all 7 endpoints **and** refused unlimited approval · migration 078 verified as `autoworkshop_app` · deploy poll proven to fail on a stuck deploy · Release green · phase file matches reality |
| **S2** | J6 part 1 — supplier verification + product validation engine + badges, ~10 screens | A supplier submits a product, it is validated, a badge is awarded, and the workshop sees it |
| **S3** | J6 part 2 — remaining ~24 supplier screens | supplier-web **39/39**, measured by the coverage audit and re-measured on the live site |
| **S4** | J8 (insurance self-service door) · J7 part 1 — ~10 admin screens | An insurer registers **without an administrator**, and the admin directory reads real rows. (An assessor can already be created by admin grant today — that is not what S4 proves) |
| **S5** | J7 part 2 — remaining ~11 admin screens | admin-web **26/26** |
| **S6** | J9 part 1 — fleet schema + API + membership aggregation | A fleet administrator signs in and sees their own vehicles; the empty state links to enrolment |
| **S7** | J9 part 2 — 28 fleet screens | fleet-web **29/29** |
| **S8** | J10 part 1 — insurance schema + API | A claim exists and is reachable only by its own organisation |
| **S9** | J10 part 2 — 28 insurance screens | insurance-web **28/28** · **coverage 380/380, 0 dead ends** |
| **S10** | J11 · J12 — account types, provisioning, staff invitation, My Workspace | A selected account type grants **nothing** until an organisation approves it — proven by a denial |
| **S11** | J13 — emergency towing, cost centres, approval limits | Geolocation **denied** still completes a towing request via a manual pin |
| **S12** | J14 · start J15 | An authored knowledge record reaches `approved`, and cannot with `content_rights` unset |
| **S13+** | J15 → J16 → J17 → J18, then J19 | Per phase acceptance |

**J20–J24 are the slack.** Every session above lists four or five slices; where
one lands short, take the next unstarted job from Block 4 rather than extending
scope on the current one. **J21 (off-host restore drill) and J24 (health alert
delivery) go first** — a backup nobody has restored and an alert nobody receives
are the same defect class, and both are cheap.

### Owner decisions this schedule is waiting on — none of them block S1

1. **Approved-source registry ownership** (extension §9 q1) — blocks J15 only.
   Recommendation on record: platform admin, plus a per-tenant opt-in list under D7.
2. **Nine free Render services on one ~750h allowance sized for four.** fleet-web
   and insurance-web are the only trimming candidates and S6–S9 are precisely the
   sessions that make them worth keeping. **Do not add services to `keep-warm.yml`** —
   over-warming is how this account was suspended on 2026-07-28.
3. **Phase 12/13/14 sequencing after 1.0** — may be pulled earlier at the cost of
   building against fixtures.

### Standing rules that apply to every session above

- **Read the plans before implementing a note in a control file.** The 08-10
  schedule asked for platform admin from the `realm_access.roles` claim; v2 §4 and
  extension §2.1 both forbid it, and §2.1 exists *because* Codex found that hole at
  plan stage.
- **Reproduce every red before changing anything.** On 08-10, three of four
  defects were in the checking machinery, not the product.
- **No single reviewer catches everything.** Run Codex *and* the Supervisor —
  this session is the eleventh instance: Codex found 7 endpoints, the Supervisor
  found 29 more files.
- **Codex prompts go in a quoted heredoc file.** Backticks inside a
  double-quoted shell string execute.
- **Read the count, never the exit code.** And the live suite is **two jobs** —
  reading only the anonymous one hides the signed-in job's skips.

---

## 6. Gate record for THIS document, 2026-08-11

Documentation-only change, no running app — so per the root CLAUDE.md the
Supervisor `/verify` runtime check is replaced by a manual read, and both other
gates were run for real.

**Codex, pass 1** (`codex.cmd exec -s read-only`, prompt in a heredoc file):
verified the platform-admin API gap independently and returned **TRUE** with 7
endpoints at file:line. Recorded in §3.

**Supervisor, pass 1** (independent, on the same question): found **29 further
files** Codex's 7-endpoint answer did not cover, which changes J1 from a 7-file
job to a 33-file one. Also found **three overstatements in this file's own first
draft** — a screen table that blended two different measures, a packages count,
and an extension-table count.

**Supervisor, pass 2:** found this file had claimed the extension was *entirely*
unscheduled when **T-0028 is queued at `TASK_QUEUE.md:49`**, and that five other
queued tasks (T-0017, T-0020, T-0021, T-0022, T-0023) had been dropped from
every recent schedule. They are now Block 4 / J20–J24.

**Codex, pass 2** (review of this file against the repo): **7 findings, all
verified by me and all accepted.** Three of them corrected claims this
repository has been carrying for several sessions:

| # | Corrected |
|---|---|
| 1 | 🔴 **"`insurance_assessor` has NO production writer" is FALSE** — it is in `GRANTABLE_ROLES` (`membership.service.ts:37`) and an admin grant writes it (`:225`). The recorded "fourth instance of the role question" was wrong; only the *self-service door* is missing. **J10 does not depend on J8** |
| 2 | 🔴 **Phase 1 is NOT done** — v2 §11 step 4 puts `python-packages/` in Phase 1 and §3/§5 put all 19 MCP skeletons "from day one". This file had marked it ✅ while listing the same items as missing |
| 3 | 🔴 **Phase 8 is not "nothing"** — `AgentsModule`, `agent-host.client.ts`, `service-request-triage.agent.ts`, `discovery.agent.ts` and migration 064 exist. The risk is **drift from §0.2**, not absence; J16 must reconcile, not rebuild |
| 4 | 14 extension tables absent outright, not 17 — `knowledge.articles`, `core.vehicle_makes`/`models` and `parts.tools` are differently-named equivalents |
| 5 | Workshop staff invitation is **incomplete, not missing** (`staff-form.tsx`, `membership.service.ts:119`); approval limits at invitation are the actual gap |
| 6 | `apps/mobile` is **16** tracked files, not 20 |
| 7 | J8's stated blocker and J10's dependency on it were not real — follows from #1 |

🔴 **The lesson this file adds to the record: the gap analysis was wrong in the
same direction three times — it called things ABSENT that existed.** Two of
those errors were inherited from earlier session notes rather than measured
fresh. **Measure the repo, do not quote the last handover.**
