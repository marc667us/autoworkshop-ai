# ADR-009 — Playwright for E2E, visual and accessibility testing

**Status:** Accepted · **Date:** 2026-07-25 · **Release:** 0.1

## Context

`05.txt` §1 names Playwright and axe-core. Chromatic is rejected (ADR-007).

## Decision

Playwright for E2E journeys, role-based access tests, tenant-isolation tests, offline journeys and screenshot-based visual regression. axe-core for accessibility.

## Consequences

One free tool covers four gates. Visual baselines live in the repo rather than a paid SaaS.
