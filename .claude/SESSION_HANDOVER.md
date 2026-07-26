# Session handover

## 2026-07-25 — Release 0.1 foundation

**Completed:** repo created and pushed; CI + security lanes green; pnpm/Turborepo workspace; 7 Next.js apps;
NestJS API with health endpoint + test; docker compose (Postgres+pgvector, Redis, NATS, MinIO, Keycloak,
coturn); design tokens; ADR-001…016; `.claude` control files.

**CI defects found and fixed on the first runs:**
1. Zero-cost gate false-positived — `xargs -r` exits 0 on empty input and `if <exit 0>` is true.
2. `pnpm@latest` (v11) requires Node >=22.13 but Node 20 is pinned to match the dev machine — pinned pnpm 9.
3. `google/osv-scanner-action@v1` does not resolve — replaced with `go install`.

**Outstanding:** Storybook, remaining seed docs, tag `v0.1.0`.

**Owner decisions still open:** where the self-hosted Docker stack runs (always-free VM / existing machine /
local only).

**Recommended next task:** T-0002 — Keycloak realm, then the Phase 2 identity chain.

---

## 2026-07-25 (late) — Release 0.1 scaffolding complete

**Completed this session (all committed):**
- pnpm 9.15.4 via corepack (Node 20 — matches CI; pnpm 10+/11 need Node >=22.13, do NOT upgrade)
- Workspace: pnpm-workspace.yaml, turbo.json, tsconfig.base.json, .npmrc, .nvmrc, .editorconfig,
  .prettierrc.json, .env.example
- `packages/config` (shared eslint + tsconfig), `packages/design-tokens`, `packages/ui`
- 7 Next.js apps: customer(3000) workshop(3001) supplier(3002) fleet(3003) insurance(3004)
  towing(3005) admin(3006) — all typecheck clean
- `apps/api` NestJS + health endpoint + passing vitest
- `infrastructure/docker/docker-compose.yml` — Postgres+pgvector, Redis, NATS, MinIO, Keycloak
  (heap capped 512MB), coturn. All self-hosted FOSS.
- ADR-001 … ADR-016
- Root governance: CLAUDE.md, context.MD, MEMORY.md, MCP.md, ARCHITECTURE.md, ROADMAP.md,
  CHANGELOG.md, CONTRIBUTING.md, README.md, SECURITY.md
  (Project OS directive + Agentic ADK Extension seeded, each marker present exactly once)
- `.claude/` control files

**Verified:** `pnpm -r typecheck` = 10/10 Done · `pnpm -r test` passes · CI + Security lanes green.

**Bug found and fixed:** `packages/ui` declared React as a peer dependency but had no build-time
types, so `tsc` failed on JSX. Added react + @types/react as devDependencies.

**NOT yet done in Release 0.1:**
- Storybook is scaffolded as a directory but not configured/running
- Seed docs under `docs/00-project`, `01-product`, `04-security`, `05-database`, `10-testing`
  are still empty (ADRs are done)
- **Tag `v0.1.0` deliberately NOT applied** — the two items above are part of the 0.1 acceptance
  criteria, so tagging now would overstate completion.

**Owner decision still open:** where the self-hosted Docker stack runs — always-free cloud VM,
an existing machine, or local-only for now. Nothing to purchase either way.

**Recommended next task:** finish Storybook + seed docs -> tag v0.1.0 -> then T-0002 (Keycloak realm)
and the Phase 2 identity chain.

### Overnight run — machine power settings changed 2026-07-25

Sleep would suspend the build, so AC timeouts were disabled for the overnight run.

**RESTORED 2026-07-26** — all three verified back at their original values.
Previous values (kept for reference):
```powershell
powercfg /change standby-timeout-ac 30     # was 30 min  (0x708)
powercfg /change hibernate-timeout-ac 180  # was 3 hours (0x2a30)
powercfg /change monitor-timeout-ac 10     # was 10 min  (0x258)
```

Locking the workstation with **Win+L is safe** — Windows keeps background processes running while
locked. Only sleep/hibernate would have stopped work, and both are now disabled.

---

## 2026-07-25 (overnight) — Release 0.1 COMPLETE + Phase 2 started

**Release 0.1 shipped and tagged.** All acceptance criteria met and VERIFIED, not assumed.

Verified live:
- All 6 docker services running: postgres+pgvector, redis, nats, minio, keycloak, coturn
- Migrations 001 + 002 applied via the tracked runner
- Tenant isolation PROVEN against a live database as a non-superuser
- 7/7 unit tests pass; typecheck clean across all 11 packages; Storybook builds

**Three real defects found by verifying against a real database — all fixed:**

1. **RLS was inert.** A superuser bypasses RLS entirely, EVEN WITH FORCE. The bootstrap POSTGRES_USER
   is a superuser, so the app would have had every policy present and none applied. Migration 002 adds
   `autoworkshop_app` (NOSUPERUSER, NOBYPASSRLS, DML-only). **The app must never connect as the
   bootstrap role.**
2. **`current_role` is a PostgreSQL reserved keyword**, so `SET LOCAL app.current_role = '...'` is a
   syntax error. tenant-context.ts emitted exactly that and would have failed at runtime. Now uses
   set_config(); a test asserts the broken form never returns.
3. **set_config(..., true) is transaction-local**, and psql runs each statement in its own implicit
   transaction, so seed context evaporated before the next INSERT. Seeding is session-scoped; the app
   deliberately stays transaction-local so pooled connections cannot leak tenant context.

Plus earlier: vitest worker-RPC timeouts on Windows (fixed with the forks pool, 246s -> 14s), and
packages/ui missing build-time React types.

**Phase 2 progress:** migration 001 (tenancy foundation + append-only audit), migration 002 (app role),
tracked migration runner with checksum drift detection, tenant context resolution with confused-deputy
defence, and the tenant isolation proof.

**Next tasks:** T-0002 Keycloak realm + client wiring · then users/orgs/branches CRUD through the
domain-service layer · then WAL archiving + off-host backup (Supervisor condition C3).

**Owner decision still open (nothing to buy):** where the self-hosted Docker stack runs — always-free
cloud VM, an existing machine, or local-only for now. It runs locally today.

**Power settings RESTORED 2026-07-26** — sleep 30 min, hibernate 3 h, monitor 10 min, all verified.

### Correction — v0.1.0 was tagged before CI confirmed

I tagged and reported Release 0.1 complete while CI was still running; it then failed.

Cause: `pnpm/action-setup` rejects the pnpm version being declared twice — `version: 9` in the workflow
AND `packageManager: pnpm@9.15.4` in package.json. Introduced by my own earlier pnpm/Node fix.

Fix: removed the action's pin. `packageManager` is now the single source of truth, so corepack locally
and the action in CI read the same value and cannot drift.

The tag was deleted and re-created on the green commit (aaa89e8), so v0.1.0 points at a verified build.

**Lesson for future releases: do not tag until CI reports green on that exact commit.**
