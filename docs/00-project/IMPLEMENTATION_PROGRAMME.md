# Implementation programme

Approved sequence. Week numbers are deliberately **TBD** — the source spec's "16 weeks" was a human-team
estimate that should never have driven scope, and it was withdrawn. The sequence is fixed; every release
ships working software independently.

| Phase | Release | Deliverable |
|---|---|---|
| 1 | 0.1 | Foundation — monorepo, 7 apps, API, docker stack, tokens, Storybook, CI, ADRs |
| 2 | — | Identity — Keycloak, users, orgs, branches, roles, permissions, tenant context, RLS, audit, backups |
| 3 | 0.2 | Application shell — top nav, grouped side nav, breadcrumbs, tabs, drawers, AI panel, responsive |
| 4 | 0.3 | Customer + vehicle — registration, garage, documents, history, complaints, appointments |
| 5 | 0.4 | Workshop + repair — reception, job cards, staging board, diagnosis, Solution Studio, approval, QC |
| 6 | 0.5 | Parts + suppliers — catalogue, stock, procurement, verification, marketplace |
| 7 | 0.6 | Finance + partners — invoices, payments, warranty, fleet, insurance, towing |
| 8 | 0.7 | MCP + AI — gateway, 19 server skeletons, ADK orchestrator, Class A/B live |
| 9 | 0.8 | Communication + knowledge — chat, WebRTC, knowledge CMS, dictionary, training |
| 10 | 0.9 | Multimedia + intelligence — CV, sound, 3D, OBD, offline sync, mobile, multilingual |
| 11 | 1.0 | Hardening — full test suite, security/a11y review, backup + DR drill, production, pilot |

**Critical path:** Phase 2 -> Phase 3 -> Phase 5. Everything else branches off those three.

## Working rules (`05.txt` §6)

One release at a time. Per task: read requirements -> identify affected layers -> checklist -> migrations
first -> backend rules -> API -> frontend with shared components -> loading/empty/error/permission states
-> tests -> lint + typecheck -> Playwright -> docs -> commit.
