# Task queue

| ID | Task | Phase | Status |
|---|---|---|---|
| T-0001 | Release 0.1 foundation | 1 | **done** — tagged `v0.1.0` |
| T-0002 | Keycloak realm + client + docker wiring | 2 | **done** — realm as configuration-as-code |
| T-0003 | Users, organizations, branches, memberships | 2 | **partial** — organizations + tenant DB layer + audit done; users/branches/memberships services outstanding |
| T-0004 | Roles, permissions, permission matrix | 2 | queued |
| T-0005 | Tenant context resolution from validated claims | 2 | **partial** — `KeycloakJwtService` + `TenantGuard` done; web apps not yet session-wired (see `viewerGrants`) |
| T-0006 | RLS FORCE + tenant-isolation test suite | 2 | **partial** — RLS proven as non-superuser; full suite outstanding |
| T-0007 | Audit framework (append-only) | 2 | **done** — `AuditService`, same transaction as the work it records |
| T-0008 | WAL archiving + PITR + off-host backup (Supervisor C3) | 2 | **partial** — WAL archiving live and verified; backup scripts + restore drill outstanding |
| T-0009 | Top navigation bar | 3 | **done** |
| T-0010 | Collapsible grouped side navigation | 3 | **done** |
| T-0011 | Shell surfaces: tabs, dialogs, drawers, AI assistant panel | 3 | **done** |
| T-0012 | Runtime theming (light / dark / system) | 3 | **done** |
| T-0013 | Responsive shell — mobile overlay nav, tablet behaviour | 3 | **done** |
| T-0014 | Storybook stories for every shell component (`01 (1).txt` §71) | 3 | queued |
| T-0015 | Playwright shell journey + axe-core accessibility gate | 3 | queued |
| T-0016 | Workspace / organisation / branch switchers | 3 | **blocked** on T-0003 membership data |
| T-0017 | Quick-create, tasks, messages, notifications, help panels (§9-§14) | 3 | queued |

**Next up:** T-0014 and T-0015 close Release 0.2. T-0008's restore drill is the oldest outstanding
Supervisor condition and should not slip further — a backup that has never been restored is not a
backup.
