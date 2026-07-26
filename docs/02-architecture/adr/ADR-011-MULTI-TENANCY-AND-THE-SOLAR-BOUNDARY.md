# ADR-011 — Multi-tenancy and the Solar boundary

**Status:** Accepted · **Date:** 2026-07-25 · **Release:** 0.1

## Context

The owner directed: reuse Solar components but do not mix things up. Shared identity data would entangle two products that must be able to fail independently.

## Decision

Shared cluster, logical isolation, RLS. Separate repository, database, Keycloak realm, deployment, secrets and CI from Solar. Patterns are copied; code and runtime are not shared.

## Consequences

Acceptance test: if Solar were deleted tomorrow, AutoWorkshop must still build, deploy and run. CI fails the build if any code references the Solar repository.
