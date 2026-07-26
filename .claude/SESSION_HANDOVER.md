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

**Previous values (restore these when the run is done):**
```powershell
powercfg /change standby-timeout-ac 30     # was 30 min  (0x708)
powercfg /change hibernate-timeout-ac 180  # was 3 hours (0x2a30)
powercfg /change monitor-timeout-ac 10     # was 10 min  (0x258)
```

Locking the workstation with **Win+L is safe** — Windows keeps background processes running while
locked. Only sleep/hibernate would have stopped work, and both are now disabled.
