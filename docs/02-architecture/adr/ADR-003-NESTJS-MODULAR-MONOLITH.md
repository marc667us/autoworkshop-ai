# ADR-003 — NestJS modular monolith

**Status:** Accepted · **Date:** 2026-07-25 · **Release:** 0.1

## Context

`autoworkshop 1.txt` §6 specifies NestJS, starting as a modular monolith with 13 bounded domains that can later be extracted.

## Decision

One NestJS application, 13 domain modules, strict boundaries enforced by CI architecture tests.

## Consequences

Simple to deploy and reason about now; extraction later is a module move, not a rewrite.
