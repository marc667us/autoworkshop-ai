# Release plan

| Release | Contents | Rollback |
|---|---|---|
| **0.1** | Repository, workspace, 7 apps, API, docker stack, design tokens, Storybook, CI, ADRs | Revert commit; nothing deployed |
| **0.2** | Authentication, roles, permissions, organizations, branches, navigation shell, responsive layout | Feature flag off; previous image |
| **0.3** | Customer profile, vehicle registration, complaint submission, appointment request, workshop search | Flag off |
| **0.4** | Reception, intake, job cards, staging, diagnosis, quotation, customer approval, QC | Flag off; approval records are append-only and preserved |
| **0.5** | Parts catalogue, stock, supplier registration, product verification, marketplace, procurement | Flag off |
| **0.6** | Invoices, payments, warranty, fleet, insurance, towing | Flag off; financial records preserved |
| **0.7** | MCP gateway, core MCP servers, AI assistant, Class A/B tools, human approval | **Kill switch** — disable all MCP processing |
| **0.8** | Chat, voice notes, WebRTC calls, knowledge CMS, dictionary, training | Flag off |
| **0.9** | Computer vision, sound analysis, 3D viewer, OBD, offline sync, mobile, multilingual | Flag off per capability |
| **1.0** | Pilot production release | Blue/green; previous version retained |

## Approval

Every release passes: implementation -> automated tests -> code review (Codex) -> Supervisor audit ->
security review -> business workflow review -> UAT -> release approval.

## Rollback rule

Database changes use expand-and-contract so the previous application version stays compatible during a
rollback. A verified backup is taken before any high-risk migration.
