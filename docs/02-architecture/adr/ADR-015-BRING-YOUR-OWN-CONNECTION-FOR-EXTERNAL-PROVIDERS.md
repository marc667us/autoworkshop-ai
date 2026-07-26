# ADR-015 — Bring-your-own-connection for external providers

**Status:** Accepted · **Date:** 2026-07-25 · **Release:** 0.1

## Context

`1.txt` §12 requires payment adapters and `2.txt` requires card/mobile-money support — paid services that collide with the zero-cost rule. The owner directed: allow users to decide how they connect.

## Decision

Every external capability is an interface with a zero-cost default and a tenant-configurable adapter. Tenants connect their own OBD device, payment merchant account, SMTP server, SMS gateway or model API key. Credentials are per-tenant, encrypted, never in the platform secret store.

## Consequences

The platform costs nothing to run and excludes nobody — a single vulcanizer runs on manual entry and cash; an enterprise connects its own providers. A tenant that configures nothing still gets a working app.
