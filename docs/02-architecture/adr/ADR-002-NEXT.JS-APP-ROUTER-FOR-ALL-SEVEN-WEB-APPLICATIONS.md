# ADR-002 — Next.js App Router for all seven web applications

**Status:** Accepted · **Date:** 2026-07-25 · **Release:** 0.1

## Context

`autoworkshop 1.txt` §5 specifies the Next.js App Router. `01 (1).txt` §86 lists seven distinct apps. Codex argued for a single app with role-based workspaces; the spec is explicit and won.

## Decision

Seven separate Next.js apps. The shared shell, navigation and design system live in `packages/` and are consumed by all seven.

## Consequences

Each workspace deploys and scales independently. Duplication is avoided by putting everything shared in packages — an app that duplicates shell code is a review failure.
