# ADR-016 — Zero-cost now, commercial-ready later

**Status:** Accepted · **Date:** 2026-07-25 · **Release:** 0.1

## Context

The owner directed that after build and test, if the product goes commercial, it will move to commercial infrastructure. Codex's engineering concern about free-tier dependability is deferred, not dismissed.

## Decision

No free-tier lock-in. Everything self-hosted FOSS with full infrastructure-as-code, an S3-compatible storage interface, a search interface, adapters for every provider, and standard Postgres with WAL.

## Consequences

The zero-cost build is the production system, not a throwaway prototype. Scaling it is a hosting decision, not a software decision. Nothing built now has to be unbuilt later.
