# ADR-004 — PostgreSQL with row-level security

**Status:** Accepted · **Date:** 2026-07-25 · **Release:** 0.1

## Context

Multi-tenant isolation is the highest-severity concern. `1.txt` §10 requires tenant ids and RLS.

## Decision

One cluster, one schema per business domain, `tenant_id` on every tenant-owned table, `ENABLE` + `FORCE ROW LEVEL SECURITY` everywhere, plus `pgvector` for semantic search.

## Consequences

Isolation survives an application bug. Costs: every query needs tenant context set, and seeding needs `set_config('app.current_role','admin',true)` — a Solar lesson.
