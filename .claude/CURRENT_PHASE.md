# Current phase

**Rewritten 2026-08-11. The previous version was dated 2026-08-07 and was being
read as current while being wrong in four places** — it predated towing (074),
the fleet registration door (075), migration 077, and it said "None of it is
live" when everything it described has been on production since 08-09. A phase
file that lags is worse than none.

Phases and releases are defined in `docs/00-project/COMBINED_PLAN_v2.md §8`, as
extended by `docs/00-project/PLAN_EXTENSION_v1.md §8` (phases 12, 13, 14).
**The measured gap, the job list J1–J24 and the S1–S13 schedule live in
`.claude/TASK_GAP_AND_JOB_LIST.md`.** This file is the summary; that one is the
work.

## ⚠️ WHAT IS MEASURED, AND WHAT IS JUDGEMENT

**Measured** — `node scripts/audit-menu-coverage.mjs --all` (**re-run
2026-08-15**): **272 of 384 distinct screens (71%)**, 409 menu entries in 11
role trees, **110 with no page anywhere**: supplier 34, fleet 28, insurance 27,
admin 21.

> ⚠️ The 2026-08-11 reading this file used to carry (*"267 of 380 (70%)"*) was
> taken with an audit script that ADR-021 had broken — it scanned
> `apps/workshop-web/app`, a directory the consolidation deleted. The script was
> repaired on 08-14; the figure above is the first honest reading since. **If
> this line is more than a session old, re-run the command rather than quoting
> it** — that is what went wrong the first time.

**NOT measured** — whether each phase's full deliverable list works end to end.
A route with a page is not a feature that runs; this repository has a recorded
defect for exactly that confusion. The 🟡 rows are a reading of the plan against
the code, and should be challenged rather than quoted.

## Status

| Phase | Release | State |
|---|---|---|
| 1 Foundation | 0.1 | 🟡 **Not complete, and it was wrongly marked ✅.** v2 §11 step 4 puts the `python-packages/` skeleton in Phase 1 and §3/§5 require all **19 MCP server skeletons "from day one"**. Neither exists, nor `domains/`, nor 4 of the 11 apps §3 names |
| 2 Identity | — | ✅ Complete for v2. **Extension adds account types, workspace provisioning and approval limits at staff invitation — T-0028, queued, not built.** Staff invitation itself exists (`staff-form.tsx`) |
| 3 Shell + Nav | 0.2 | ✅ Complete, incl. workspace × role. **Extension's My Workspace resolver not built** |
| 4 Customer + Vehicle | 0.3 | ✅ Complete |
| 5 Workshop + Repair | 0.4 | ✅ Complete — reception through QC and release; 0 dead ends in all five workshop trees |
| 6 Parts + Suppliers | 0.5 | 🟡 Catalogue, marketplace, requisitions, POs, goods receipt, supplier request/quote. **Supplier verification, product validation engine and badges NOT built — and 34 of supplier-web's 39 screens are dead ends** |
| 7 Finance + Partners | 0.6 | 🟡 Invoices, payments, receipts, warranty built. **Towing complete (074, 10/10 screens, deployed). Fleet 1 of 29 — no `fleet` schema and no API module** (verified 08-15). **Insurance is now 5 of 32**: migrations 082/083/084 shipped a MARKETPLACE — products, policies, a levy computed by a trigger, admin verification endpoints and four seller screens, live on production 08-14. **Its claims + repair-authorisation deliverable is still absent, and no shopper screen renders the public listing.** `cost_centres` absent (verified 08-15) |
| 8 MCP + AI | 0.7 | 🟡 **Started, and off-plan.** `AgentsModule`, `agent-host.client.ts`, `service-request-triage.agent.ts`, `discovery.agent.ts` and migration 064 exist. Absent: MCP gateway, the 19 skeletons, a separate `apps/agent-host`, the ADK root orchestrator and conductors. **The risk here is drift from §0.2, not absence** — J16 must reconcile, never rebuild |
| 9 Communication + Knowledge | 0.8 | 🟡 Chat, voice, WebRTC shipped. **Knowledge CMS authoring is the gap**; 048/057's tables are empty because of it. The extension's whole repair library (`library_records`, `content_rights`, the 3 ADK agents) is absent |
| 10 Multimedia + Intelligence | 0.9 | ⛔ Not started. `apps/mobile` is a 16-file Expo scaffold; no `offline-sync`, no `i18n` |
| 11 Hardening + Release | 1.0 | ⛔ Not started. Playwright has not run since 2026-07-29 |
| 12 Simulation · 13 Knowledge Ops · 14 Community | 1.1–1.3 | ⛔ By design, after 1.0. **No Phase 1–11 artefact may advertise them as present** |

## ▶ Where the work is

**Production is live.** Since ADR-021 (08-13) Render runs **four** services —
web + keycloak + api + postgres — not nine; the seven packs are one deployed
application. **Migrations: 82 files in repo, 82 applied on the LOCAL cluster**
(corroborated by the 08-15 restore drill's "migration history 82/82").
🔴 **Production's applied count has NOT been measured since 083/084 landed** —
measure it before depending on it, and watch your own dispatch's run id, because
a push triggers `apply-migrations` as a DRY RUN whose "success" means nothing.
Live suite last read **70/0/1** (66 anonymous + 4 signed-in) on 08-14.

**The nearest real gaps, in order** — `TASK_GAP_AND_JOB_LIST.md` has the J1–J24
detail but is dated 08-11; `.claude/TASK_LIST_2026-08-15.md` supersedes it:

1. ~~🔴 **J1 is code-complete and NOT DEPLOYED.**~~ **✅ CODE-COMPLETE AND IN
   `master`; recorded as deployed 2026-08-11.**
   **Verified in source on 08-15** (not quoted): `tenant-context.ts:177` refuses
   a `platform_administrator` membership without `hasPlatformGrant`, and
   `platform.admin` is added only by `permissionsForContext`
   (`permission-matrix.ts:190`) — it is absent from `ROLE_PERMISSIONS`, so there
   is no path from a role name to it. Migration 078 is in the repo and applied
   locally.
   ⚠️ **The DEPLOYED-ON-PRODUCTION half is recorded, not re-measured** (the
   08-11 record cites verify/078 10/10 and a signed-in live job 4/0/0). Confirm
   it under A7, and note A7 is gated behind A6.
   **Left struck through, not deleted, so nobody re-opens it.**
2. **110 dead-end screens** (08-15 reading) — supplier 34, fleet 28,
   insurance 27, admin 21. **Fleet is the worst tree in the product at 1 of 29
   (3%)**, and there is no `fleet` schema or API module beneath it.
3. ~~**14 two-column `(x, tenant_id)` FKs** still carry the cross-organisation
   hole 073 closed for eighteen others.~~ **✅ CLOSED — do not rebuild this.**
   Migration 079 converted all fourteen on 2026-08-11; verified against a
   database on 2026-08-15 (two-column keys in those ten schemas: **2**, and both
   are the pair that is *correctly* two-column). `RELATIONSHIPS.md` §8 kept the
   "STILL OPEN" heading for four days after the work shipped and this line
   inherited it — **the entry is left here struck through rather than deleted,
   because a silently vanishing task is indistinguishable from one that was
   forgotten.**
4. **Phase 6's supplier verification and product validation engine.**
