# Session handover

> Read this first, then `.claude/CURRENT_PHASE.md` and `.claude/TASK_QUEUE.md`.

## Where the project stands — 2026-07-26

**Release 0.1 shipped and tagged `v0.1.0`** (CI green on that exact commit).
**Phase 2 (identity) well underway.** Everything below is committed and pushed to `master` + `develop`.

Repo: https://github.com/marc667us/autoworkshop-ai — public, `master` + `develop`.
Approved plan: `C:\Users\USER\Documents\autoworkshop app\_plan\COMBINED_PLAN_v2.md`
(Codex `PASS WITH CORRECTIONS` 14/14 applied → Supervisor `PASS WITH CONDITIONS` 8/8 applied).

## Completed

**Release 0.1 — foundation**
- pnpm 9.15.4 + Turborepo monorepo; 7 Next.js apps; NestJS API; Storybook; design tokens
- Docker stack, all self-hosted FOSS: Postgres+pgvector, Redis, NATS, MinIO, Keycloak, coturn
- CI + Security lanes; ADR-001…016; governance docs (CLAUDE.md, context.MD, MEMORY.md, MCP.md, …)

**Phase 2 — identity (in progress)**
- Migration 001 — tenancy foundation (tenants, organizations, branches, users, memberships)
  + append-only `audit.events`
- Migration 002 — `autoworkshop_app` role: `NOSUPERUSER`, `NOBYPASSRLS`, DML-only grants
- Tracked migration runner with checksum drift detection
- `DatabaseService.withTenant()` — the only sanctioned route to tenant data
- `AuditService` — writes in the same transaction as the work it records
- `OrganizationService` + controller — first real domain slice
- `KeycloakJwtService` + `TenantGuard` — full auth chain
- Keycloak realm as configuration-as-code: 30 roles, 7 PKCE clients, bearer-only API client

**Tests: 20/20 passing.** Typecheck clean across 11 packages. CI green on both lanes.

## Defects found by verifying against real systems — do NOT reintroduce

All of these read back as "working" in configuration and were invisible to unit tests:

1. **RLS was completely inert.** A superuser bypasses RLS *even with FORCE*. The bootstrap
   `POSTGRES_USER` is a superuser, so the app would have had every policy present and none applied.
   → migration 002, plus a boot-time guard in `DatabaseService` that refuses to start on a superuser URL.
2. **`current_role` is a PostgreSQL reserved keyword** — `SET LOCAL app.current_role` is a syntax error.
   → `set_config()`, parameterised. A test asserts the broken form never returns.
3. **`set_config(..., true)` is transaction-local**, and psql runs each statement in its own implicit
   transaction, so seed context evaporated. Seeding is session-scoped; the app stays transaction-local
   deliberately so pooled connections cannot leak tenant context.
4. **A `clientScopes` array in Keycloak realm JSON REPLACES the built-in scopes.** The realm ended up
   with 2 scopes and no `roles` scope — tokens carried no `realm_access.roles` claim, so the API could
   not have authorized anything. → audience scope created post-import from its own file.
5. **`defaultDefaultClientScopes` has the same replacement problem.** Removed.
6. **Keycloak rejects unknown JSON keys** — `_comment` fields broke the import outright.
7. **pnpm version declared twice** (workflow + `packageManager`) fails the action.
   `packageManager` is the single source of truth.
8. **vitest worker-RPC timeouts on Windows** → `pool: 'forks'` (246s → 14s).
9. **`packages/ui`** declared React as a peer dependency with no build-time types.

## IN FLIGHT — pick up here

**Supervisor condition C3 — WAL archiving + tested restore.** The outstanding must-fix from the plan
review. It addresses the risk that actually destroyed Solar on 2026-07-09 (expiring free-tier database,
no backups).

**Done and VERIFIED live:**
`infrastructure/docker/docker-compose.yml` — Postgres recreated with `wal_level=replica`,
`archive_mode=on`, `archive_command` copying to `/wal_archive`, `archive_timeout=300`, plus new
`pgwal` and `pgbackup` volumes. Confirmed on the running server:
`archive_mode=on  archive_timeout=5min  wal_level=replica`

**Known limitation, stated honestly:** `--data-checksums` is in `POSTGRES_INITDB_ARGS` but the running
cluster reports `checksums=off`, because the `pgdata` volume already existed and `initdb` did not re-run.
Data checksums **cannot be enabled on an existing cluster** without a dump/restore rebuild. Either accept
it for local dev and ensure the production cluster is initialised fresh with checksums on, or rebuild
locally: `docker compose down -v` then `up` (destroys local data), then re-run migrations.

**Still to do for C3:**
- `infrastructure/backup/` scripts — `pg_basebackup` daily, encrypted off-host copy to MinIO,
  retention (WAL 7d / daily 35d / weekly 12w / monthly 12m, `1.txt` §33)
- **A restore drill that actually restores** and records achieved RPO/RTO. A backup that has not been
  restored is not a backup (`1.txt` §36–37)
- Keycloak realm export on a schedule (`1.txt` §32)
- Update `docs/05-database/BACKUP_AND_RESTORE.md` from plan to as-built

## Next tasks after C3

- T-0003 remainder: users, branches, memberships services + controllers, on the `OrganizationService` pattern
- T-0004: permission matrix enforcement
- Phase 3: application shell — top nav, grouped side nav, breadcrumbs (Release 0.2)

## Environment

Node 20.19.2 · pnpm 9.15.4 (**do not upgrade — pnpm 10+/11 require Node ≥22.13**) · Python 3.14.4 ·
google-adk 2.2.0 · Docker 29.4.3 · Ollama 0.24.0 · gh CLI at `%USERPROFILE%\bin\gh.exe`.

Local infra: `pnpm infra:up`.
API: `cd apps/api && npx nest build && node dist/main.js` with
`DATABASE_URL=postgresql://autoworkshop_app:change_me_locally@localhost:5432/autoworkshop`.
**Never point the app at the `autoworkshop` superuser** — the boot guard refuses it, by design.

Windows: `kcadm` runs in-container, so `MSYS_NO_PATHCONV=1 docker exec …` is required or Git Bash
rewrites `/opt/keycloak/...` into `C:/Program Files/Git/opt/...`. The local side of `docker cp` needs
the opposite treatment — `cygpath -w`.

## Owner directions — binding

1. Name fixed: **AutoWorkshop AI** at `autoworkshop.aiappinvent.com` (Namecheap DNS)
2. **Stop cutting scope** — build everything structurally; only licensed content and labelled ML corpora stage
3. **Reuse Solar patterns, never entangle** — separate repo, DB, Keycloak realm, deploy, secrets, CI
4. **Zero cost including production** — never propose spending; that decision is the owner's alone
5. **Bring-your-own-connection** — tenants connect their own device/provider/credentials
6. Zero cost now; commercial infrastructure later, only if going commercial
7. **Solar is the reference — always refer to it**

## Open owner decision (nothing to buy)

Where the self-hosted Docker stack should run: an always-free cloud VM, a machine already owned, or
local-only. It runs locally today, so nothing is blocked.

## Machine state

Sleep, hibernate and monitor timeouts are currently **disabled** (owner asked for uninterrupted running).
To restore: `powercfg /change standby-timeout-ac 30`, `hibernate-timeout-ac 180`,
`monitor-timeout-ac 10`.
