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
- [ ] Storybook running
- [ ] Seed docs complete
- [ ] Tag v0.1.0

## Acceptance criteria

`pnpm install` clean · `pnpm build` green · `pnpm infra:up` healthy · CI green · no paid dependency.

## Next phase

Phase 2 — Keycloak, users, organizations, branches, roles, permissions, tenant context, RLS, audit.
