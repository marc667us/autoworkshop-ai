# Changelog

All notable changes to AutoWorkshop AI. Format: [Keep a Changelog](https://keepachangelog.com/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-07-25 — Development foundation

### Added
- Repository, `.gitignore`, README, SECURITY policy
- CI lane: repo validation, TypeScript, Python, architecture boundaries, zero-cost policy gate
- Security lane: gitleaks, semgrep, osv-scanner, bandit, trivy, AI/MCP boundary negative tests
- pnpm + Turborepo workspace (pnpm 9, Node 20 — matching CI)
- Seven Next.js applications: customer, workshop, supplier, fleet, insurance, towing, admin
- NestJS API with health endpoint and unit test
- Docker stack: PostgreSQL+pgvector, Redis, NATS, MinIO, Keycloak, coturn — all self-hosted FOSS
- `@autoworkshop/design-tokens` — primitive/semantic/component hierarchy, automotive status colours
- `@autoworkshop/ui` — StatusBadge, with a mandatory `label` so colour is never the only status signal
- ADR-001 … ADR-016
- Governance: CLAUDE.md, context.MD, MEMORY.md, MCP.md, ARCHITECTURE.md, ROADMAP.md
- `.claude/` control files

### Fixed
- Zero-cost CI gate false-positived on an empty repository (`xargs -r` exits 0; `if <exit 0>` is true)
- pnpm pinned to 9 — pnpm 11 requires Node >=22.13 while Node 20 is pinned to match the dev machine
- `google/osv-scanner-action@v1` does not resolve — replaced with `go install`

### Governance
- Plan approved by Codex (`PASS WITH CORRECTIONS`, 14 applied) and Supervisor (`PASS WITH CONDITIONS`, 8 applied)
