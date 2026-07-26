# ADR-013 — Google ADK over MCP — the Python/TypeScript split

**Status:** Accepted · **Date:** 2026-07-25 · **Release:** 0.1

## Context

Platform governance §0.1 permits only Google ADK as an agent framework. The specs mandate an 'AI Host + Agent Orchestrator + MCP clients'. ADK is Python; the application backend is TypeScript.

## Decision

Tier 6 is a Python ADK service (root orchestrator -> conductors -> specialists). Tier 7 is TypeScript MCP servers behind the Gateway. MCP — a language-agnostic protocol — is the SOLE cross-language boundary.

## Consequences

Both constraints are satisfied without compromise. Cost: a second toolchain and CI lane. Mitigation: no shared code, only contracts; drift is caught by MCP contract tests.
