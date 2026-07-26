# ADR-012 — Zero-cost tooling, including in production

**Status:** Accepted · **Date:** 2026-07-25 · **Release:** 0.1

## Context

`05.txt` §1, §2, §6 and §8 require zero-cost open-source tools — §8 explicitly covers the FIRST PRODUCTION RELEASE, not merely a pilot. Codex recommended budgeting for paid infrastructure; that contradicts the specification and was overruled by the owner.

## Decision

Every component is FOSS and self-hosted: PostgreSQL, Redis, NATS, MinIO, Keycloak, coturn, Prometheus, Grafana, Loki, Ollama. No paid tool, subscription or mandatory paid service. A task is not complete if it introduced a paid dependency.

## Consequences

Zero running cost, at the price of operating the stack ourselves. Capacity is constrained and documented. Where a capability normally costs money it becomes a disabled adapter (ADR-015). Upgrading to commercial infrastructure later is a hosting change, not a rewrite (ADR-016).
