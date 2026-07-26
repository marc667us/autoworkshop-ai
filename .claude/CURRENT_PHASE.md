# Current phase

**Phase 1 — Project foundation** · Release **0.1**

## Objective

A working development environment: monorepo, frontend, backend, database, Storybook, CI.

## Deliverables

- [x] Repository, `.gitignore`, README, SECURITY
- [x] CI + security workflows, green on `master` and `develop`
- [x] pnpm + Turborepo workspace
- [x] 7 Next.js apps scaffolded
- [x] NestJS API with health endpoint
- [x] Docker compose: Postgres, Redis, NATS, MinIO, Keycloak, coturn
- [x] Design tokens package
- [x] ADR-001 … ADR-016
- [x] Storybook running (react-vite, a11y addon, telemetry off)
- [x] Seed docs complete (06.txt 'minimum files to create first')
- [ ] Tag v0.1.0 — pending live verification of the docker stack + migration

## Acceptance criteria

`pnpm install` clean · `pnpm build` green · `pnpm infra:up` healthy · CI green · no paid dependency.

## Next phase

Phase 2 — Keycloak, users, organizations, branches, roles, permissions, tenant context, RLS, audit.
