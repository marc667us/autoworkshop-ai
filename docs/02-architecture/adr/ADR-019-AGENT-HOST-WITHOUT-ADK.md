# ADR-019 — The agent layer ships without Google ADK, and is shaped so ADK can wrap it

- **Date:** 2026-08-08
- **Status:** Accepted
- **Supersedes:** nothing. **Extends:** ADR-010, ADR-013, ADR-018.

## Context

On 2026-08-08 the owner asked for three agents: one that receives a customer's
service request and drives it into the workshop, one that scrapes the web for
products and suppliers and registers them, and one that finds sales leads
online. In the same instruction: *"open codes and supervisor, dont open goole
adk and stitch."*

That instruction collides with a standing governance rule, and the collision has
to be resolved in writing rather than silently.

**What the rules say.** `CLAUDE.md` §0.1 makes Google ADK the **only** agent
framework permitted in any app under this account, with no exception "without
explicit owner approval logged in `docs/IMPLEMENTATION_LOG.md` and an ADR". §0.2
requires a root orchestrator with department conductors. ADR-013 fixes the
Python-ADK / TypeScript-MCP split.

**What the repository actually contains.** Measured 2026-08-08: **no agent
runtime of any kind.** No `google.adk` import, no `LlmAgent`, no MCP server, no
MCP gateway, no LLM client at all. `OLLAMA_BASE_URL` sits in `.env.example` with
zero readers. `packages/ui/src/AiAssistantPanel.tsx` is complete and rendered in
all seven web apps, permanently displaying "The assistant connects in Phase 8".
`.claude/CURRENT_PHASE.md` lists Phase 8 as `⛔ Not started`.

**What ADR-018 already established.** The owner previously banned ADK, and the
repair orchestrator shipped as deterministic pure functions
(`apps/api/src/repair/repair-orchestration.ts`) rather than as an agent. Its
2026-08-07 amendment permits ADK **"for Phase 8 only, when the programme reaches
Phase 8, not before"**.

So there are two readings of the owner's instruction. "Do not launch the ADK dev
UI as a boot-check team member" is the narrow one; "do not introduce ADK into
this work" is the broad one. The owner's words on 2026-08-08 were an
instruction about this session's work, and the 08-07 amendment is explicit that
ADK arrives *at* Phase 8. This work is not Phase 8 — it is a value-chain feature
that happens to use a model.

## Decision

**Build the agent layer now, without ADK, and shape every part of it so that
adopting ADK at Phase 8 is a wrapper rather than a rewrite.**

Concretely:

1. **A separate Python service, `services/agent-host`.** Every skill is a
   **pure function** over typed pydantic inputs returning a typed result. That
   is precisely the shape an ADK `FunctionTool` wraps — `FunctionTool(fn)` over
   an existing pure function is a one-line adoption. The HTTP layer (FastAPI) is
   a thin shell over those functions and is not where any logic lives.
2. **No agent framework in the reasoning loop.** No ADK, LangGraph, AutoGen or
   CrewAI orchestrator. (`scrapegraph-ai` pulls LangChain in as its own internal
   dependency; that is a transitive library, not an agent loop we wrote, and is
   unavoidable without dropping the scraper the owner asked for.)
3. **Orchestration stays in the NestJS domain layer**, where the tenancy, RLS,
   audit and permission machinery already is. `AgentsModule` composes the
   skills; it does not delegate control flow to a model. This preserves §0.2's
   *intent* — a single entry point that classifies and routes — while keeping
   business rules in domain services per `CLAUDE.md` §3.
4. **The boundary of ADR-010 is kept exactly.** The agent host holds no
   database, storage, payment or admin credential and cannot reach Postgres. It
   receives JSON and returns JSON. This is asserted by a test in the host that
   no database driver is even importable from its package — measured, not
   promised.

## Alternatives considered

**Use ADK anyway, on the strength of §0.1.** Rejected: the owner gave a direct
instruction in this session, and a standing document does not override a live
instruction from the person who owns the product. ADR-018 also shows this is not
a new position.

**Wait for Phase 8 and build nothing.** Rejected: it would refuse the owner's
actual request. Phase 8 is a schedule artefact, and the value chain the owner is
pressing on is Phase 5.

**Put the skills inside the NestJS API in TypeScript.** Rejected on one hard
fact: `scrapegraph-ai` is a Python library, so a Python process must exist
regardless. Given that, putting the model-facing skills there too keeps them in
one place — and keeps the LLM out of the process that holds the database
credential.

**Build the MCP gateway now (ADR-013's endpoint).** Rejected as
disproportionate: nineteen MCP servers plus a gateway, a registry and a kill
switch is a phase of work, not a step in a feature. The HTTP boundary here is
one bounded, authenticated, fail-closed call — it is replaceable by MCP without
touching a single skill.

## Consequences

**Good.**
- The owner's three agents exist and are reachable, without violating a live
  instruction.
- Nothing about the ADR-010 credential boundary is weakened; it is now
  *enforced by a test* rather than asserted in prose, which it was not before.
- The product runs with **no agent host at all**: `UnconfiguredAgentHost` is a
  first-class implementation, so a deployment with no `AGENT_HOST_URL` still
  takes service requests and still notifies reception. Zero-cost (ADR-012) and
  bring-your-own-connection (ADR-015) both hold.

**Bad, stated honestly.**
- 🔴 **This is a deviation from `CLAUDE.md` §0.1**, and it is logged here
  because a governance rule broken without a note is how a codebase stops
  meaning what its documentation says. §0.1's stated benefit — uniform run
  records that the governance agents can introspect — is **not** delivered by
  this design. The proposals table gives a uniform record of what agents
  *proposed and what humans decided*, which is the part the four-gate bar
  actually needs, but it is not ADK's run/eval telemetry.
- There is no root orchestrator or department conductor tree (§0.2). With three
  skills and no agent-to-agent handoff, a conductor would be a misnamed helper —
  which §0.2 itself forbids. Revisit when a second agent must call a first.
- Two runtimes to deploy instead of one.

**When Phase 8 arrives**, the migration is: wrap each skill in `FunctionTool`,
put an ADK `LlmAgent` in front of them, expose the same three operations over
MCP, and repoint `HttpAgentHost` at the gateway. The skills, the schemas, the
proposals table, the approval flow and every screen stay as they are.

## Compliance notes

- Directive §14 (human approval for business-committing actions) is satisfied by
  `agents.proposals`: an agent proposes, a human decides, and the decision is
  attributed. Enforced by a CHECK constraint — a decided proposal with no
  `decided_by` cannot be stored.
- `02.txt` §8's five required disclosures are NOT NULL columns on that table, so
  a proposal that cannot say what it will touch cannot be written.
- `crm.leads` holds data about people who did not ask to be there. There is
  deliberately **no outbound path** from that table anywhere in the platform.
  ⚠️ A lawful-basis note and a deletion path are **flagged and not built** —
  Ghana's Data Protection Act 2012 applies to the owner's market and that is a
  legal decision for the owner, not an engineering one.
