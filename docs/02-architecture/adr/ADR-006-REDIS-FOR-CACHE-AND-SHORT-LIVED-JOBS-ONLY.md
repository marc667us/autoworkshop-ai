# ADR-006 — Redis for cache and short-lived jobs only

**Status:** Accepted · **Date:** 2026-07-25 · **Release:** 0.1

## Context

Redis is specified for cache, locks and rate limiting. It is not a durable event bus.

## Decision

Redis + BullMQ for cache, locks and short-lived background jobs. Domain events go to NATS (ADR-014).

## Consequences

Clear split: transient work in Redis, durable business events in NATS.
