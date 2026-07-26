# ADR-005 — Keycloak is mandatory

**Status:** Accepted · **Date:** 2026-07-25 · **Release:** 0.1

## Context

`05.txt` §1 and §3 and `1.txt` §11 make Keycloak the authentication architecture. An earlier plan draft proposed a NestJS-native JWT fallback; Codex rejected it and was right.

## Decision

Keycloak, own realm, OAuth 2.1 + PKCE, short-lived tokens, rotating refresh tokens. No alternative auth product is implemented.

## Consequences

Hosting Keycloak is a real operational cost in effort — solved with hosting (heap-capped container), not by weakening the architecture. A separate realm from Solar is mandatory (ADR-011).
