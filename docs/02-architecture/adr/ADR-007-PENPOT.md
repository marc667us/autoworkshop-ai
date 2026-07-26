# ADR-007 — Penpot, not Figma

**Status:** Accepted · **Date:** 2026-07-25 · **Release:** 0.1

## Context

`01 (1).txt` §61/§89 mandates Figma + Dev Mode + Chromatic. `05.txt` §1 mandates zero-cost open-source tooling and names Penpot; `06.txt`'s decision log records 'Penpot selected instead of Figma'. Figma Dev Mode and Chromatic are paid at team scale — a direct conflict.

## Decision

Penpot for design. Storybook as the component catalogue. Playwright `toHaveScreenshot()` for visual regression instead of Chromatic. Everything else in `01 (1).txt` §64-§87 is kept verbatim.

## Consequences

Zero-cost is preserved with no loss of design rigour. Only the vendor changes — the token hierarchy, component catalogue, states and quality gates are unchanged. CI fails if Chromatic or Figma tooling appears in any package.json.
