# Roadmap — AutoWorkshop AI

Sequence is fixed; week numbers are deliberately **TBD** pending Phase 1 velocity. Every release ships
working software independently. Scope is full — the owner rejected all cuts.

| Phase | Release | Deliverable | Status |
|---|---|---|---|
| 1 Foundation | **0.1** | Monorepo, 7 apps, API, docker stack, tokens, Storybook, CI, ADRs | **in progress** |
| 2 Identity | — | Keycloak, users, orgs, branches, roles, permissions, tenant context, RLS, audit, backups | queued |
| 3 Shell + navigation | **0.2** | Top nav, grouped side nav, breadcrumbs, tabs, drawers, AI panel — responsive | queued |
| 4 Customer + vehicle | **0.3** | Registration, garage, documents, history, complaints (text/audio/image/video), appointments | queued |
| 5 Workshop + repair | **0.4** | Reception, intake, job cards, staging board, inspection, diagnosis, Solution Studio, approval, QC | queued |
| 6 Parts + suppliers | **0.5** | Catalogue, stock, reservations, procurement, supplier verification, marketplace | queued |
| 7 Finance + partners | **0.6** | Invoices, payments, warranty, fleet, insurance, towing | queued |
| 8 MCP + AI | **0.7** | Gateway, 19 server skeletons, ADK orchestrator/conductors/specialists, Class A/B live | queued |
| 9 Communication + knowledge | **0.8** | Chat, voice notes, WebRTC calls, knowledge CMS, dictionary, wiring library, training | queued |
| 10 Multimedia + intelligence | **0.9** | Computer vision, sound analysis, 3D viewer, OBD, offline sync, mobile, multilingual | queued |
| 11 Hardening | **1.0** | Full test suite, security/a11y/responsive review, backup + DR drill, production, pilot | queued |

**Critical path:** Phase 2 (identity + tenancy) -> Phase 3 (shell) -> Phase 5 (repair job).

## Staged, not cut

Only two things stage, and neither is a feature: **licensed content** (OEM wiring diagrams, vehicle-specific
3D geometry) and **labelled ML corpora** for trained damage/fault classifiers — which accumulate from real
assessor-confirmed jobs. Everything else is built.
