# ADR-001 — Monorepo

**Status:** Accepted · **Date:** 2026-07-25 · **Release:** 0.1

## Context

Seven web applications, a NestJS API, an MCP gateway, 19 MCP servers, a Python agent host and ~20 shared packages must stay version-consistent. `autoworkshop 1.txt` §21 specifies a monorepo layout.

## Decision

pnpm workspaces + Turborepo. TypeScript packages under `apps/*` and `packages/*`; Python under `python-packages/*` as a separate pip workspace.

## Consequences

One install, one lockfile, atomic cross-package changes. The Python half stays deliberately separate — MCP is the only boundary between them (ADR-013).
