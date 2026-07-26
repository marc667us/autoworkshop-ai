# ADR-010 — MCP Gateway as the sole AI boundary

**Status:** Accepted · **Date:** 2026-07-25 · **Release:** 0.1

## Context

`autoworkshop 0.txt` §7, §24, §25 require all agent traffic to pass a controlled gateway and forbid agents reaching the database.

## Decision

Agents call the MCP Gateway only. The Gateway authenticates, resolves tenant, allowlists tools, scans for injection, applies DLP, routes approvals and audits. MCP servers call NestJS domain services, which own every business rule.

## Consequences

The same rules apply whether a human or an agent acts. Enforced in infrastructure — the agent host holds no privileged credential, and CI asserts that direct access fails.
