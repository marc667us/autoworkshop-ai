# ADR-014 — NATS for domain events; Postgres FTS now, OpenSearch later

**Status:** Accepted · **Date:** 2026-07-25 · **Release:** 0.1

## Context

`1.txt` §6 names 'RabbitMQ or NATS'; §7 names OpenSearch. An earlier plan draft silently substituted Redis/BullMQ and Postgres FTS — the Supervisor caught the omission and required a recorded decision.

## Decision

NATS for domain events (lighter than RabbitMQ, fits the capacity envelope). Search is Postgres FTS + `pg_trgm` + `pgvector` behind a `packages/search` interface, with OpenSearch as the declared target once capacity allows.

## Consequences

The domain-event and search CONTRACTS are honoured; only the search implementation is provisional, and swapping it is a config change rather than a rewrite.
