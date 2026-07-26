# context.MD — AutoWorkshop AI

## Product

AutoWorkshop AI — the complete AI-powered automotive service, repair and workshop operating system.
One platform for vehicle owners, workshops, technicians, auto electricians, electronics specialists, body
repairers, spray painters, welders, vulcanizers, upholsterers, suppliers, fleet operators, insurers and
towing providers.

**Promise:** report the problem -> diagnose the fault -> simulate the solution -> approve the work ->
verify the parts -> track the repair. Every step authenticated, authorised, audited and recoverable.

**Domain:** `autoworkshop.aiappinvent.com` · Namecheap DNS · Let's Encrypt TLS
**Market:** Ghana first, then wider Africa. English first; architecture ready for Twi, Ga, Ewe, Hausa, French.

## Operator profile

Single owner-operator (marc667us). Zero-cost mandate. Prefers built software over questions. Reviews via
the App Factory chain: Claude implements -> Codex reviews -> Supervisor audits -> Scheduler queues.

## The 13 business domains (`1.txt` §4)

1. Identity, organization and access management
2. Customer, vehicle and service history
3. Complaint, service request and appointment
4. Digital workshop and technician operations
5. Job card, diagnosis and repair execution
6. Solution simulation, quotation and customer agreement
7. Parts depot, inventory and procurement
8. Supplier, marketplace and product verification
9. Communication and collaboration
10. Knowledge, training and technical content
11. Fleet, insurance, towing and partner services
12. Finance, payment, warranty and commercial management
13. Platform administration, analytics, audit and operations

## Architecture tiers (`0.txt` §2)

1 Presentation · 2 Frontend logic · 3 API gateway / BFF · 4 Business domain services · 5 Workflow
orchestration · 6 **AI host, ADK agents, MCP clients** · 7 **MCP gateway + 19 MCP servers** · 8 Data access ·
9 Database, cache, search, messaging, storage.

## Stack

Next.js · React · TypeScript · Tailwind · shadcn/ui · Radix · NestJS · PostgreSQL + pgvector · Redis · NATS ·
MinIO · Keycloak · coturn · Google ADK (Python) · Ollama · Penpot · Storybook · Playwright · Vitest ·
axe-core · Docker · Prometheus · Grafana · Loki. **All FOSS, all self-hosted.**

## Key decisions

See `docs/02-architecture/adr/` — ADR-001 … ADR-016.
The four that shaped everything: **ADR-007** Penpot not Figma · **ADR-010** MCP Gateway as sole AI boundary ·
**ADR-012** zero-cost including production · **ADR-013** ADK/TypeScript split with MCP as the only boundary.

## Reference implementation

`solar-pv-designer-lite` (github.com/marc667us) — Flask/Render/Postgres/Keycloak at
`solarpro.aiappinvent.com`. **Always refer to it** for patterns and operational lessons.
**Never entangle with it** (ADR-011).

---

<!-- BEGIN: AGENTIC ADK CONTEXT (canonical — do not edit in place; re-sync from C:\Users\USER\_agentic_adk_context_append.md) -->

# Agentic Development Context Addendum

This project operates under the **Agentic Development Extension** appended to this app's `CLAUDE.md` and elaborated in this app's `MCP.md`. Together they define the three-layer agentic platform every app under this account belongs to.

## What This Extension Adds

- **Google ADK** is the Agent Operating System — it orchestrates business agents (executive, engineering, construction, procurement, finance, healthcare, legal, research, sales, support, technology) across workflows, tools, and memory.
- **HARD RULE — Google ADK is the only agent framework** for every agent in every app. All agent classes, tools, memory, handoffs, and orchestration use ADK primitives. No LangChain / LangGraph / AutoGen / CrewAI / Semantic Kernel / hand-rolled while-loops without an approved ADR. See CLAUDE.md §0.1 for the full rule.
- **HARD RULE — Always start from orchestration; branch into conductors when needed.** Every request enters via a single Root Orchestrator agent (`app/agents/orchestrators/root_orchestrator.py`). The Root Orchestrator routes to department Conductors (`app/agents/conductors/<dept>_conductor.py`) when a branch needs to coordinate ≥2 specialists or non-trivial flow; otherwise it calls a specialist directly. Specialists never call other agents. See CLAUDE.md §0.2 for full branching rules + topology diagram.
- **HARD RULE — Agents and code must be reusable across apps.** Every app is a pip-installable package (`pyproject.toml` at root, `app/` package, `__init__.py` everywhere, `__all__` declaring the public API). Other apps consume agents/tools/schemas either by `pip install -e ../this-app` and importing, or via the MCP mesh (this-app's MCP server registered in the consumer's MCP.md). No copy-paste between apps; no hardcoded paths inside business logic; no cross-department imports between specialists; no business logic in route handlers. Each app maintains `docs/REUSABILITY.md` listing its public exports + consumers. See CLAUDE.md §0.3 for full rules.
- **Claude Code** is the **Software Engineering Agent** living inside the Technology Department. It writes code; it does NOT orchestrate business workflows.
- **Codex CLI + Supervisor** is the pair-coding review lane (existing — see `ai-coworkers/`, `reviews/`, `scripts/`).
- **Governance Agents** — Work Reviewer, Development Supervisor, Work Scheduler — are mandatory in every app and themselves implemented in ADK. They are the project's quality and planning gates.
- **MCP.md** in the app root enumerates the Model Context Protocol servers and how Claude Code connects to ADK for this app specifically.

## The Four Mandatory Quality Gates

Nothing ships until all four pass, in order:

1. **Codex CLI** review via `./scripts/quality-gate.sh`.
2. **Supervisor** sign-off via `/code-review`, `/security-review`, `/verify`.
3. **Work Reviewer Agent** approval (`POST /api/review/work` → status `approved`).
4. **Work Scheduler Agent** marks the task `approved`.

## Canonical Sources

- `C:\Users\USER\Documents\agentic proper2\agenticadk1.txt` — Enterprise AI Agent Factory master prompt
- `C:\Users\USER\_agentic_adk_append.md` — CLAUDE.md template (this extension's full text)
- `C:\Users\USER\_agentic_adk_mcp.md` — MCP.md template
- `C:\Users\USER\_agentic_adk_context_append.md` — this file
- `C:\Users\USER\Documents\pvsolar1\improvements\dontforget1.txt` — original Project Execution Directive + FOSS Stack Rule
- `C:\Users\USER\Documents\pvsolar1\improvements\thereviewer1.txt` — Codex pair-coding workflow

If this app's `CLAUDE.md` extension drifts from those source files, re-read them and reconcile.

## Per-Session Orientation Summary (update every session)

Append the latest snapshot below so the next session inherits accurate state. The template:

```
Date:
Agentic layer status:
- ADK installed:                  yes | no | partial
- Executive Department agents:    list of implemented agents
- Technology Department agents:   list of implemented agents
- Governance agents (Reviewer/Supervisor/Scheduler):  status of each
- Other departments stubbed:      list
- Active MCP servers (see MCP.md): list
- Last governance pipeline run:   pass | fail | not run | path to report
- Next agentic task:
```

Granular per-task changes go to `docs/IMPLEMENTATION_LOG.md` per the Project Execution Directive §21.

<!-- END: AGENTIC ADK CONTEXT -->


---


---

<!-- BEGIN: PROJECT OS CONTEXT (canonical — do not edit in place; re-sync from C:\Users\USER\_project_context_append.md) -->

# Project OS — Context Addendum

This project operates under the **Project Execution Directive** appended to this app's `CLAUDE.md`. See that file for:

- **Session-start rule** (read CLAUDE.md, README.md, this context.MD, all `docs/*.md`, code, tests, infra files BEFORE coding; produce an orientation summary).
- **24 numbered discipline rules** covering scope control · reuse-before-create · architecture pipeline (Router → Service → Repository → DB) · multi-tenant `tenant_id` discipline · PostgreSQL RLS · hidden-page protection · logout-must-really-work · scalability · indexing · caching · queues · AI agent discipline · error handling · audit logging · admin operations · dependency audits · testing · documentation · ADR + implementation-log templates · pre/post-coding checklists.
- **Free / Open-Source Stack Rule** with the full FOSS technology table, cost-control checklist, and low-cost deployment ladder. Paid SaaS only when explicitly approved by the project owner.
- **Codex CLI Pair-Coding Workflow** — Claude implements, Codex reviews; a feature is NOT complete until Codex review passes the 10-item quality gate.

## Canonical Sources

- `C:\Users\USER\Documents\pvsolar1\improvements\dontforget1.txt` — original Project Execution Directive + FOSS Stack Rule
- `C:\Users\USER\Documents\pvsolar1\improvements\thereviewer1.txt` — original Codex pair-coding workflow

If this app's `CLAUDE.md` directive drifts from those source files, re-read them and reconcile.

## Per-Session Orientation Summary (update every session)

Append the latest snapshot here so the next session inherits accurate state. The template:

```
Date:
Current project status:
- Completed modules:
- Partially completed modules:
- Missing modules:
- Current technical risks:
- Next logical task:
- Files likely to be affected:
```

Granular per-task changes go to `docs/IMPLEMENTATION_LOG.md` per the directive's §21.

<!-- END: PROJECT OS CONTEXT -->
