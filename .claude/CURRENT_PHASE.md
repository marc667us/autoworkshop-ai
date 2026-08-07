# Current phase

**Rewritten 2026-08-07. The previous version was STALE — it said "Phase 5 IN
PROGRESS" and was dated 2026-08-04, while Phase 5 had since completed. A phase
file that lags is worse than none: it is read as current.**

Phases and releases are defined in `docs/00-project/COMBINED_PLAN_v2.md §8`.

## ⚠️ WHAT IS MEASURED, AND WHAT IS JUDGEMENT

**Measured** — `node scripts/audit-menu-coverage.mjs --all`: every menu entry in
every role tree resolves to a working page. **0 dead ends, 0 entries with no page
anywhere.** That is route coverage, and it is a real number.

**NOT measured** — whether each phase's full deliverable list actually works
end to end. A route with a page is not a feature that runs; this repository has
a recorded defect for exactly that confusion. The 🟡 rows below are a reading of
the plan's deliverable lists against the code, not a measurement, and should be
challenged rather than quoted.

## Status

| Phase | Release | State |
|---|---|---|
| 1 Foundation | 0.1 | ✅ Complete |
| 2 Identity | — | ✅ Complete — Keycloak, orgs, roles, RLS. The 45-screen leak lived here and is fixed (`b4b2e1c`) |
| 3 Shell + Nav | 0.2 | ✅ Complete |
| 4 Customer + Vehicle | 0.3 | ✅ Complete — registration, garage, complaints, dashboard, documents, service history, maintenance schedule, appointments all resolve |
| **5 Workshop + Repair** | **0.4** | ✅ **Complete** — reception through QC and release; 0 dead ends |
| 6 Parts + Suppliers | 0.5 | 🟡 Catalogue, marketplace, requisitions, POs, goods receipt **and the new supplier request/quote edge** (059). Supplier verification + product validation engine + badges NOT built |
| 7 Finance + Partners | 0.6 | 🟡 Invoices, payments, receipts, warranty records + claims built. Fleet, insurance and towing partial |
| 8 MCP + AI | 0.7 | ⛔ Not started. **ADK IS NOW PERMITTED HERE** (owner, 2026-08-07) — see the amendment in `ADR-018`. Build when the programme reaches it |
| 9 Communication + Knowledge | 0.8 | 🟡 Chat, voice, WebRTC video shipped. **Knowledge CMS authoring is the gap**, and 057's tables are empty because of it |
| 10 Multimedia + Intelligence | 0.9 | ⛔ Not started |
| 11 Hardening + Release | 1.0 | ⛔ Not started. Playwright has not run since 2026-07-29 |
| 12 Simulation Intelligence | after 1.0 | ⛔ By design. The only 2 signposted routes in the product |

## ▶ Where the work is

The customer→workshop→supplier chain now exists end to end in code:
landing → free search → Request for Service → reception inbox → convert to job
card → repair orchestration → inspection report to the customer; and the
workshop → supplier ask → quote → accept.

**None of it is live.** Migrations 058 and 059 are rehearsed but not applied, and
the API and customer-web deploys are gated on `confirm=APPLY`, which only the
owner can run. See `.claude/CURRENT_TASK.md`.

**Nearest real gaps**, in the order they matter:
1. Deploy and drive the chain once as a real customer. Nothing above has been
   exercised by a user.
2. 059's supplier-visibility checks SKIP on live — no `supplier_users` row
   exists to act as. Seed one and re-run the rehearsal.
3. Paystack (mobile money + local cards) — recorded, not built. There is now
   something to pay for.
4. Phase 6's supplier verification and product validation.
