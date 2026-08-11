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

**Measured** — `node scripts/audit-menu-coverage.mjs --all` (2026-08-11):
**267 of 380 distinct screens across 7 apps (70%)**, 405 menu entries in 11 role
trees, **111 with no page anywhere**: supplier 34, fleet 28, insurance 28,
admin 21.

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
| 7 Finance + Partners | 0.6 | 🟡 Invoices, payments, receipts, warranty built. **Towing complete (074, 10/10 screens, deployed). Fleet 1 of 29 — no `fleet` schema and no API module. Insurance 0 of 28 — same.** `cost_centres` absent |
| 8 MCP + AI | 0.7 | 🟡 **Started, and off-plan.** `AgentsModule`, `agent-host.client.ts`, `service-request-triage.agent.ts`, `discovery.agent.ts` and migration 064 exist. Absent: MCP gateway, the 19 skeletons, a separate `apps/agent-host`, the ADK root orchestrator and conductors. **The risk here is drift from §0.2, not absence** — J16 must reconcile, never rebuild |
| 9 Communication + Knowledge | 0.8 | 🟡 Chat, voice, WebRTC shipped. **Knowledge CMS authoring is the gap**; 048/057's tables are empty because of it. The extension's whole repair library (`library_records`, `content_rights`, the 3 ADK agents) is absent |
| 10 Multimedia + Intelligence | 0.9 | ⛔ Not started. `apps/mobile` is a 16-file Expo scaffold; no `offline-sync`, no `i18n` |
| 11 Hardening + Release | 1.0 | ⛔ Not started. Playwright has not run since 2026-07-29 |
| 12 Simulation · 13 Knowledge Ops · 14 Community | 1.1–1.3 | ⛔ By design, after 1.0. **No Phase 1–11 artefact may advertise them as present** |

## ▶ Where the work is

**Production is live and current.** apex, customer, supplier, towing, admin,
fleet, insurance, api and keycloak all deploy; migrations IN REPO 78 / APPLIED 77
after this session's 078 lands. Live suite last read **71/0/0** (67 anonymous +
4 signed-in).

**The nearest real gaps, in order** — full detail in `TASK_GAP_AND_JOB_LIST.md`:

1. 🔴 **J1 is code-complete and NOT DEPLOYED.** Migration 078 + the API half of
   077. Until it ships, revoking a platform grant on production still leaves
   every API gate open. **Deploy order is not optional: migrations FIRST, then
   the API.** The image tolerates the wrong order (it catches `undefined_function`
   and refuses administrators only) but that is a safety net, not a plan.
2. **111 dead-end screens** — supplier 34, admin 21, fleet 28, insurance 28.
3. **14 two-column `(x, tenant_id)` FKs** still carry the cross-organisation hole
   073 closed for eighteen others (`docs/05-database/RELATIONSHIPS.md` §8).
4. **Phase 6's supplier verification and product validation engine.**
