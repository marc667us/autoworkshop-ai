# ADR-022 — n8n was evaluated as an agent-creation surface and REJECTED

- **Date:** 2026-08-16
- **Status:** **Rejected** — owner decision, same day it was proposed
- **Relates to:** ADR-010, ADR-013, ADR-018, ADR-019, ADR-021

> **Read this before proposing n8n again.** It was considered in full on
> 2026-08-16, reviewed by Codex and the Supervisor, and rejected by the owner.
> The analysis is kept so the next session does not repeat it. Directive §3.

## What was asked

Owner, 2026-08-16: *"look for n8n agent creation tool and use as coworker skills
for agents"*, then *"i need you to install n8n for agent creation."* Then, after
the review came back: *"n8n has been found to breach the zero cost policy, its
not free so remove and continue with this session task."*

## Decision

**n8n is not adopted, in any lane — not as a product agent runtime, not as an
authoring surface, and not as dev-lane automation.** Nothing was installed: the
image pull never completed, no container or volume was created beyond one empty
`n8n_data` volume which was removed. The product `docker compose` stack, CI,
`render.yaml` and the runtime were never touched.

**Owner's stated ground: cost.** That is the decision and it stands.

## Supporting analysis, recorded so it is not re-derived

**Codex — `VERDICT: BLOCK-PENDING-ADR`:**

- n8n Community self-hosted carries **no licence fee**, but it is **fair-code
  under the Sustainable Use License, not OSI open source** — free for internal
  business use, restricted for redistribution and customer-facing use. Against
  the FOSS Stack Rule that is a documented exception, and any future
  customer-facing use would need a fresh licence review.
- **The real cost is operational, not licensing:** a persistent host, a
  database, a credential store, patching, backups and monitoring. The production
  account exhausted its free instance-hour allowance **twice** (2026-07-28,
  2026-08-11), and ADR-021 collapsed ten services to four for exactly that
  reason. Adding an always-on service there was assessed as unsafe.
- Against the existing pipeline — 38 GitHub Actions workflows plus
  `scripts/quality-gate.sh`, `scripts/codex-*.sh`, `scripts/supervise-codex.sh` —
  n8n **duplicates working machinery** and adds a second control plane without
  removing anything. No concrete capability gap was identified.
- `CLAUDE.md` §0.1 forbids competing agent frameworks without an ADR; n8n's AI
  Agent node is one.

**Supervisor — findings Codex did not reach:**

1. **The §0.1 exception has precedent.** `ADR-018-REPAIR-ORCHESTRATOR-NO-ADK`
   and `ADR-019-AGENT-HOST-WITHOUT-ADK` both already took it with owner
   approval, so an ADR was a viable route — the blocker was never governance.
2. **A seam already exists.** `AGENT_HOST_URL` / `AGENT_HOST_TOKEN`
   (`apps/api/src/agents/agent-host.client.ts:186-187`) is a defined contract for
   a non-ADK agent runtime. Any future agent tooling should implement *that*
   rather than become a third control plane.
3. **Machine-wide absence verified** (Codex's sandbox could not): no `~/.n8n`,
   no npm global package, no Docker image, no repository reference. Confirmed
   again after cleanup.

## Corrections to my own analysis, recorded because they changed the picture

I asserted early in the session that **"the ADK/MCP agent tier does not exist in
this repo"**, on the strength of an `apps/` directory listing alone. **Wrong
twice over** — caught by Codex, then confirmed by the Supervisor:

- `services/agent-host/` exists — a stateless Python/FastAPI service with three
  skills (triage, supplier discovery, lead discovery), `pyproject.toml`, `tests/`.
- `apps/api/src/agents/` holds seven TypeScript files plus migration
  `064_agent_proposals_and_leads.sql`.
- `.claude/CURRENT_PHASE.md` records Phase 8 as **"Started, and off-plan"**, with
  the warning *"the risk here is drift from §0.2, not absence — J16 must
  reconcile, never rebuild."*

A directory listing is not a measurement of whether a capability exists.

## Two pre-existing defects found while doing this, NOT introduced by it

1. **ADR number collision.** Two files are numbered 018 —
   `ADR-018-EXPO-SDK-52-FOR-THE-MOBILE-APP.md` and
   `ADR-018-REPAIR-ORCHESTRATOR-NO-ADK.md`. Fix deliberately; do not renumber an
   ADR that is already referenced elsewhere.
2. **`CLAUDE.md` contradicts itself on agent frameworks.** §0.1 forbids LangGraph
   and CrewAI; the FOSS Stack Rule table in the same file recommends them as the
   "AI Agent Framework". The later generic table cannot override the earlier
   explicit hard rule. The table is the line that should change.
