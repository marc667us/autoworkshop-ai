# CLAUDE.md — AutoWorkshop AI

Guidance for Claude Code working in this repository.

**Product:** AutoWorkshop AI · `autoworkshop.aiappinvent.com` (Namecheap DNS)
**Repo:** https://github.com/marc667us/autoworkshop-ai — public, `master` + `develop`
**Approved plan:** `C:\Users\USER\Documents\autoworkshop app\_plan\COMBINED_PLAN_v2.md`
**Source specs:** `C:\Users\USER\Documents\autoworkshop app\*.txt` (10 unique files)

This plan passed the full quality chain before any code was written:
Codex Reviewer `PASS WITH CORRECTIONS` (14 applied) -> Supervisor `PASS WITH CONDITIONS` (8 applied).

---

## Non-negotiables — read before every task

### 1. Zero cost, including production (ADR-012)
`05.txt` §1, §2, §6 and §8 require zero-cost open-source tooling — §8 covers the **first production release**,
not merely a pilot. **Never introduce a paid tool, subscription or mandatory paid service. Never propose that
the owner spends money**, not even a small amount; the spend decision is the owner's alone. If something looks
like it needs money, find the FOSS path — it usually exists. A task is **not complete** if it added a paid
dependency. CI enforces this.

### 2. Solar non-entanglement (ADR-011)
Solar PV Designer Lite is the **reference implementation** — always refer to it for patterns, CI shape and
operational lessons. But the two applications must never entangle:
separate repository, database, Keycloak **realm**, deployment, secrets and CI. **Never edit Solar's
`web_app.py`, `wsgi.py` or templates.** Never import from it. Never share a database.
**Acceptance test: if Solar were deleted tomorrow, would this still build, deploy and run?**

### 3. Agents never touch the database (ADR-010, ADR-013)
`ADK agent -> MCP client -> MCP Gateway -> MCP server -> NestJS domain service -> repository -> RLS -> Postgres`
The agent host holds **no** database, storage, payment or admin credential. Business rules live only in
domain services. Enforced in infrastructure and asserted by negative tests in CI — not by policy text.

### 4. Build everything structurally
The owner rejected all scope cuts. Every feature in the specs gets built. Only **licensed content** (OEM
wiring diagrams, vehicle-specific 3D geometry) and **labelled ML corpora** are staged — and those accumulate
from real jobs. Do not quietly re-defer features.

### 5. Tenant isolation is Severity-1
`tenant_id` on every tenant-owned table, `ENABLE` + `FORCE ROW LEVEL SECURITY`, tenant context derived
**only** from validated Keycloak claims and membership — never from a client-supplied id. Isolation tests are
a blocking CI gate.

### 6. Bring-your-own-connection (ADR-015)
Never bundle or mandate an external provider. Every external capability is an interface with a zero-cost
default and a **tenant-configurable** adapter. A tenant that configures nothing still gets a working app.

---

## Prohibited (`05.txt` §2)

Building all pages at once · disconnected mock pages · business rules in the frontend · AI agents reaching
the database · bypassing role/permission controls · introducing paid dependencies · changing approved
navigation without review.

## Required per module (`05.txt` §2)

Frontend pages · backend services · database tables and migrations · permissions · validation · audit
logging · tests · loading states · empty states · error states · responsive layouts.

## Definition of complete (`05.txt` §6)

Page renders · API works · permissions enforced · migration runs · tests pass · lint + typecheck pass ·
Playwright journey passes · responsive checked · docs updated · **no paid dependency** · committed.

## Schema rules (learned from Solar — do not relearn these the hard way)

- **No `VARCHAR(n)` on free-text or generated columns** — use `TEXT`. Solar's truncation incident came from
  narrow VARCHARs meeting AI-generated content.
- **No `CREATE TABLE IF NOT EXISTS` in boot code.** Migrations only, forward- and rollback-tested in CI.
  IF-NOT-EXISTS is how live schema silently drifts from migration history.
- Approvals, payments, warranty decisions and audit events are **append-only**.
- `RETURNING id`, never `lastrowid`.
- RLS seeding needs `set_config('app.current_role','admin',true)` or inserts fail silently.
- Keycloak heap must be capped — Solar's Keycloak OOM'd on a constrained host.

## Commands

```bash
pnpm install          # workspace install (pnpm 9, Node 20 — versions must match CI)
pnpm dev              # all apps
pnpm build            # all apps
pnpm lint             # eslint
pnpm typecheck        # tsc
pnpm test             # vitest
pnpm infra:up         # postgres, redis, nats, minio, keycloak, coturn
pnpm infra:down
```

## Control files

`.claude/CURRENT_PHASE.md` · `.claude/CURRENT_TASK.md` · `.claude/TASK_QUEUE.md` ·
`.claude/SESSION_HANDOVER.md` — update `SESSION_HANDOVER.md` before ending any session.

---

<!-- BEGIN: AGENTIC ADK EXTENSION (canonical — do not edit in place; re-sync from C:\Users\USER\_agentic_adk_append.md) -->

# AGENTIC DEVELOPMENT EXTENSION — Google ADK + Claude Code + Governance Agents

> **READ ALONGSIDE THE PROJECT EXECUTION DIRECTIVE.** This extension adds the agentic-architecture layer that every app under this account must follow. It does not replace the directive — it extends it.
> Canonical sources:
> - `C:\Users\USER\Documents\agentic proper2\agenticadk1.txt` — master Enterprise AI Agent Factory prompt (architecture spec + 24-section blueprint + Section 26 governance agents)
> - `C:\Users\USER\_agentic_adk_append.md` — this template (CLAUDE.md content)
> - `C:\Users\USER\_agentic_adk_context_append.md` — companion context.MD append
> - `C:\Users\USER\_agentic_adk_mcp.md` — companion MCP.md per-app file

## 0. Why this exists

Every app in this account — past, present, and future — is part of a single agentic platform. The split is:

- **Claude Code** is the **Software Engineering Agent**. It writes code, fixes bugs, creates APIs, databases, Dockerfiles, CI/CD pipelines, tests, and deployment scripts. It does NOT orchestrate business workflows.
- **Google ADK (Agent Development Kit)** is the **Agent Operating System AND the agent framework**. It coordinates business agents (executive, engineering, construction, procurement, finance, healthcare, legal, research, sales, support, technology) across workflows, tools, memory, and execution. **It is also the only framework used to design and implement any agent in any app under this account** — see §0.1 below.
- **Codex CLI + Supervisor** is the **Pair-Coding Review Lane**. It reviews Claude Code's diffs; the Supervisor adjudicates. See the existing pair-coding skeleton at `ai-coworkers/`, `reviews/`, `scripts/`.
- **Governance Agents (Work Reviewer, Development Supervisor, Work Scheduler)** are the **Quality + Planning Lane** running inside ADK. They run for every project deliverable, not just code.

> A feature is NOT done until: code is written → Codex reviews → Supervisor signs off → Work Reviewer Agent approves → Work Scheduler Agent marks the task `approved`. All four gates are mandatory.

## 0.1 HARD RULE — Google ADK Is the Only Agent Framework

**Every agent — in every app, in every department, current and future — must be designed and implemented in Google ADK.** No exceptions without explicit owner approval logged in `docs/IMPLEMENTATION_LOG.md` and an ADR in `docs/ARCHITECTURE_DECISIONS.md`.

This applies to:

- Agent class definitions (always subclass / compose ADK primitives — `Agent`, `LlmAgent`, `SequentialAgent`, `ParallelAgent`, `LoopAgent`, etc.)
- Tool definitions (always ADK `Tool` / `FunctionTool` / `AgentTool` — never bare function dispatchers or competing tool-call schemas).
- Memory and session state (always ADK session services + the memory layer in §6).
- Agent-to-agent handoffs (always ADK transfer / sub-agent invocation — never direct LLM-to-LLM hand-rolled loops).
- Orchestration (always ADK workflows — never custom while-loops, custom orchestrators, or shell-driven agent chains).

**Forbidden without an approved ADR:**

- LangChain agents, LangGraph, AutoGen, CrewAI, Smolagents, Letta/MemGPT, OpenAI Assistants API agents, Microsoft Semantic Kernel — or any other competing agent framework.
- Hand-rolled "while-LLM-says-not-done" loops.
- Direct provider SDK calls (`anthropic.messages.create`, `openai.chat.completions.create`, `vertexai.GenerativeModel.generate_content`) **inside an agent's reasoning loop**. Direct SDK calls are fine for one-shot utility prompts (e.g., a deterministic summariser inside a tool); they are NOT fine as a substitute for an agent.
- Storing agent prompts, tools, or graph topology outside of ADK definitions (e.g. as YAML interpreted by a custom runner).

**Why this matters:**

- A single framework means observability, evals, memory, and governance schemas all converge — the Work Reviewer / Development Supervisor / Work Scheduler agents can introspect any agent's run because every agent shares the same lifecycle.
- ADK is the bridge to Vertex AI for production hosting; non-ADK agents cannot ride that deployment path.
- The four-gate quality bar depends on uniform run records; bespoke agents break those records.

**How Claude Code applies this rule when implementing:**

1. Before writing any agent code, confirm the ADK class to subclass / compose. If unsure, read `agenticadk1.txt` §2–§13 for the canonical agent role list.
2. Tools go in `app/tools/<department>/` as ADK tools — even if the underlying logic is a pure function, wrap it in `FunctionTool` (or equivalent ADK primitive).
3. Multi-agent flows go in `app/workflows/` using ADK `SequentialAgent` / `ParallelAgent` / `LoopAgent` — never a custom Python orchestrator.
4. If the user asks for "just a quick agent", default to a minimal `LlmAgent` with one tool, NOT a script with a `while` loop around `client.messages.create()`.
5. If a request seems to require a non-ADK framework, **stop** and surface the conflict — propose an ADR rather than silently introducing the competing library.

## 0.2 HARD RULE — Always Start From Orchestration; Branch Into Conductors When Needed

**Every agent system in every app MUST start from an orchestration agent at the top.** No request enters the platform by going directly to a specialist agent or a tool. The shape is:

```
                ┌───────────────────────────────────┐
   User /  ───▶ │  ROOT ORCHESTRATOR (ADK)          │  ← always present
   API          │  e.g. ChiefExecutiveOrchestrator  │     (LlmAgent / SequentialAgent)
                └────────────┬──────────────────────┘
                             │ classifies request, routes
                  ┌──────────┴──────────┐
                  │                     │
                  ▼                     ▼
            CONDUCTOR A             CONDUCTOR B          ← branch here only WHEN
        (sub-orchestrator       (sub-orchestrator           the sub-workflow needs
         e.g. ConstructionDept   e.g. FinanceDept           its own coordination
         Conductor)               Conductor)                of multiple specialists
                  │                     │
        ┌─────────┼─────────┐     ┌─────┴────┐
        ▼         ▼         ▼     ▼          ▼
    Specialist Specialist Tool  Specialist  Tool         ← leaves
       Agent     Agent    call    Agent     call
```

**Definitions:**

- **Root Orchestrator** — the single ADK entry agent for the app. It owns request classification, top-level routing, and the §3 control sequence (Work Scheduler → assignments → Work Reviewer → executive report). It is always an ADK agent — typically `LlmAgent` with sub-agents, or `SequentialAgent` wrapping the §3 pipeline.
- **Conductor** — a sub-orchestrator agent. Use one when a branch needs to coordinate **more than one specialist agent** OR **a non-trivial workflow** (sequencing, retries, parallel fan-out, conditional routing). A conductor IS an ADK orchestrator agent (`SequentialAgent`, `ParallelAgent`, `LoopAgent`, or an `LlmAgent` with its own `sub_agents`) — it is NOT a specialist with tool calls.
- **Specialist** — a leaf agent (one department role: Electrical Design Agent, BOQ Agent, Lead Generation Agent, etc.) that does the actual work via its tools.

**Branching rules — when to introduce a conductor vs. keep it flat:**

| Situation | Pattern |
|---|---|
| Single specialist needed for the request | Root Orchestrator → Specialist (no conductor) |
| Two or three specialists in strict sequence | Root Orchestrator → `SequentialAgent` Conductor → Specialists |
| Several specialists running in parallel | Root Orchestrator → `ParallelAgent` Conductor → Specialists |
| Iterative refinement (e.g. design → review → revise) | Root Orchestrator → `LoopAgent` Conductor → Specialists |
| Whole department's work for this request | Root Orchestrator → Department Conductor (`LlmAgent` w/ sub-agents) → Specialists |
| Cross-department workflow (engineering + finance + procurement) | Root Orchestrator → one Conductor per department → Specialists; Root composes their outputs |

**Forbidden shapes:**

- Calling a specialist agent directly from an API handler without going through the Root Orchestrator.
- A Root Orchestrator that contains all 50+ specialists as direct sub-agents — flatten this into department conductors.
- A "conductor" that is actually a tool function dispatching to other tools — that is not a conductor, that is a misnamed helper. Conductors are ADK agents with sub-agents.
- Mixing orchestration logic into a specialist (a specialist may NOT spawn or hand off to other agents — only conductors do that).

**Mandatory files when this rule is implemented in an app:**

```
app/agents/
├── orchestrators/
│   └── root_orchestrator.py          ← REQUIRED — the single entry agent
├── conductors/
│   ├── executive_conductor.py        ← coordinates Chief* agents + governance
│   ├── technology_conductor.py       ← coordinates Dev Supervisor + Claude Code + ...
│   ├── engineering_conductor.py      ← coordinates engineering specialists
│   ├── construction_conductor.py
│   ├── procurement_conductor.py
│   ├── finance_conductor.py
│   ├── healthcare_conductor.py
│   ├── legal_conductor.py
│   ├── research_conductor.py
│   ├── sales_conductor.py
│   └── support_conductor.py
└── {executive,technology,engineering,...}/   ← specialists live here, NOT in conductors/
```

Department conductors are stubbed (just a `SequentialAgent` with no sub-agents yet) until that department's first specialist exists. Stubs are required so the orchestration topology is always visible.

**The §3 control sequence runs INSIDE the Root Orchestrator.** Concretely:

1. Root Orchestrator receives the request and asks the Chief Executive Agent (a sub-agent) to classify.
2. Root Orchestrator hands the schedule task to the Work Scheduler Agent (sub-agent).
3. Root Orchestrator routes scheduled tasks to the relevant Conductor(s).
4. Each Conductor coordinates its specialists and returns the department's output.
5. Root Orchestrator hands collected outputs to the Work Reviewer Agent.
6. Root Orchestrator returns the final report.

**How Claude Code applies this rule when implementing:**

1. If the app has no `app/agents/orchestrators/root_orchestrator.py`, create it as the first agent file, even before any specialist. Wire `/api/agents/execute` and `/api/demo/run` through it.
2. Never add an API route that calls a specialist or tool directly. The route calls the Root Orchestrator; the Root Orchestrator decides.
3. When asked for a multi-step workflow, the first design question is "which conductor owns this?" — not "which specialist runs it?"
4. If a conductor would have a single specialist underneath it, do NOT create the conductor — call the specialist from the Root Orchestrator directly. Conductors exist to coordinate ≥2 agents or non-trivial control flow.
5. Document the orchestrator/conductor tree in `docs/ARCHITECTURE_DECISIONS.md` whenever a new conductor is added.

## 0.3 HARD RULE — Agents and Code Must Be Reusable Across Apps

**Every agent, conductor, tool, schema, and utility in every app MUST be importable from another app's codebase, unchanged.** The factory only works if a Solar Design Agent built for `solar-pv-designer-lite` can be imported and used by `pvsolar1` or `ai-app-invent-sales-platform` without copying source. No exceptions.

**Concrete requirements:**

1. **Each app is a pip-installable Python package.** Every app root has:
   - `pyproject.toml` declaring `name`, `version`, and a `packages = ["app"]` (or `setuptools.find_packages`) so `pip install -e /path/to/app` makes everything under `app/` importable.
   - A top-level `app/__init__.py` and an `__init__.py` in every subpackage (`agents/`, `agents/executive/`, `agents/conductors/`, `tools/`, `schemas/`, `workflows/`, `memory/`, ...).
   - A `py.typed` marker for type-checker support.

2. **Public API is explicit.** Each package's `__init__.py` re-exports the agents/tools/schemas other apps may consume:
   ```python
   # app/agents/engineering/__init__.py
   from .solar_design_agent import SolarDesignAgent
   from .electrical_design_agent import ElectricalDesignAgent
   __all__ = ["SolarDesignAgent", "ElectricalDesignAgent"]
   ```
   If it isn't in `__all__`, it is not part of the public contract. Other apps should not import it.

3. **No app-local hardcoded paths inside agent/tool/schema code.** All paths come from config (`pydantic-settings`, `os.getenv`, or a `Settings` object injected at construction). Anything that reads `C:\Users\USER\...` or this-app-only relative paths inside business logic is a defect. Hardcoded paths belong in `app/main.py` or the deployment layer only.

4. **Dependency injection over globals.** Agents and tools accept their dependencies — DB session factory, LLM client, MCP client, settings — via constructor or factory function. No module-level singletons that another app would have to monkey-patch. ADK already encourages this pattern; follow it.

5. **No business logic in route handlers.** (Restates Directive §4 — Router → Service → Repository → DB.) The Service and Repository layers must be the importable units; the Router is the only piece that is allowed to be app-specific.

6. **Cross-app installation patterns:**
   - **Direct pip install** (development):
     `pip install -e "C:/Users/USER/Desktop/solar-pv-designer-lite"`
     then `from app.agents.engineering import SolarDesignAgent`.
   - **MCP mesh** (production / cross-runtime): the producing app exposes the agent's tool surface as an MCP server (see MCP.md §5.2); the consuming app declares it in MCP.md §5.1 and calls it via the MCP client. Use this when the consumer is in another language or another runtime.
   - **Wheel / private index** (releases): when an app reaches a stable version, publish a wheel to a private index (GitHub Packages, internal PyPI) so other apps can pin a version rather than `-e` to a working tree.

7. **Stable import paths.** Once an agent or tool is published under `app.agents.<dept>.<name>`, that import path is a contract. Rename only with a deprecation alias for at least one minor version:
   ```python
   # app/agents/engineering/__init__.py
   from .pv_design_agent import PvDesignAgent
   SolarDesignAgent = PvDesignAgent  # deprecated alias, remove in v2
   ```

8. **No circular dependencies between departments.** A Sales agent may NOT import an Engineering specialist directly to do calculations — it asks the Root Orchestrator to route to Engineering, OR it calls the Engineering app's MCP surface. Department-to-department coupling at the import layer breaks reusability.

9. **Tests travel with the code.** When another app installs this package and runs its own test suite, the imported package's invariants should still hold. That means tests live in `tests/` at app root AND every public agent/tool ships with at least one example test that can be re-run by consumers.

10. **Schemas are the contract surface.** `app/schemas/` defines Pydantic models used at every public boundary. Other apps import schemas — they do NOT inspect agent internals. If the schemas change shape, that is a breaking change requiring a version bump.

**Forbidden:**

- Copy-pasting an agent from one app into another. If you find yourself doing this, stop, install the source app as a package instead, and add the missing export to its `__all__`.
- `sys.path.append("../other-app")` hacks. Use `pip install -e` or the MCP mesh.
- App-local `from .config import THIS_APP_ONLY_FLAG` reads inside an agent. Configuration is injected.
- Database models reaching across apps. If two apps need the same table, the table belongs in a shared package, not duplicated.

**Mandatory files for the reusability contract:**

```
<app-root>/
├── pyproject.toml             ← REQUIRED — name, version, packages
├── app/
│   ├── __init__.py            ← REQUIRED — re-exports the public API
│   ├── py.typed               ← REQUIRED — empty marker file
│   ├── agents/__init__.py     ← lists the top-level orchestrator + conductors
│   ├── agents/<dept>/__init__.py   ← lists that department's agents
│   ├── tools/__init__.py
│   ├── tools/<area>/__init__.py
│   ├── schemas/__init__.py    ← lists the public schemas
│   └── workflows/__init__.py
└── docs/REUSABILITY.md        ← REQUIRED — lists what is publicly exported
                                  and which other apps currently consume it
```

**How Claude Code applies this rule when implementing:**

1. Before creating a new agent or tool, check whether an equivalent already exists in this app OR in any sibling app (`C:\Users\USER\Documents\*` and `C:\Users\USER\Desktop\*`). If it does, **install the sibling app as a package and import from it**. Do not duplicate. (Restates and tightens Directive §3.)
2. When adding a new agent/tool, place it under the correct package path AND add it to the parent package's `__init__.py` `__all__`. An agent that isn't exported is not finished.
3. When `pyproject.toml` is missing, scaffold a minimal one before any other code: `[project] name="<app-slug>"`, `version="0.1.0"`, `[tool.setuptools.packages.find] where=["."]`.
4. If a new feature needs a value that today is hardcoded in this app, move it to `app/core/config.py` (or equivalent `Settings` class) and inject it. Do not propagate the hardcoding into a new module.
5. Update `docs/REUSABILITY.md` whenever the public `__all__` of any package changes, listing the new export, its schema, and any consumer app that will need updating.

## 0.4 Verified Toolchain (as of 2026-06-12)

The framework above assumes a working install of the three core components. As of 2026-06-12 these are the validated versions on this account's primary Windows workstation:

| Component | Version | Verified by |
|---|---|---|
| Google ADK (Python) | `google-adk 2.2.0` | `python -c "import google.adk; print(google.adk.__version__)"` |
| Python | 3.14.4 (Windows x64) | `python --version` |
| Claude Code | Opus 4.7 (`claude-opus-4-7`) | this session |
| Codex CLI | v0.137.0 (ChatGPT Plus auth, `stored auth mode: chatgpt`) | `codex --version` |

When this row drifts (new ADK release, new Claude Code model), update it here, NOT in the per-app `CLAUDE.md` — then re-sync.

## 0.5 Local Dev Runtime — Windows Install Playbook

The first-time install of ADK on a fresh Windows machine hits four real friction points. These are documented here so the next setup is one-shot, not a debugging session.

**1. Network — PyPI may be unreachable, use a mirror.** Direct `pip install google-adk` against `pypi.org` was reset (`ConnectionResetError 10054`) on this machine while `google.com` worked fine. The workaround that succeeded:

```
pip install -i https://pypi.tuna.tsinghua.edu.cn/simple/ google-adk
```

Tsinghua is a third-party mirror; once the canonical PyPI route clears, reinstall to restore standard package provenance.

**2. Console encoding — set UTF-8 before any `adk` call.** PowerShell's default cp1252 console can't render the Unicode in `adk create`'s success banner and the call crashes — but only *after* the files are already written. Files are correct; only the success message dies. Set before every `adk` call:

```
$env:PYTHONIOENCODING = 'utf-8'
```

**3. PATH — pip installs `adk.exe` off-PATH on Windows.** pip drops scripts under `C:\Users\USER\AppData\Local\Python\pythoncore-3.14-64\Scripts\` which is not on the default PATH. Add it once:

```powershell
$scripts = 'C:\Users\USER\AppData\Local\Python\pythoncore-3.14-64\Scripts'
$current = [Environment]::GetEnvironmentVariable('Path', 'User')
if (($current -split ';') -notcontains $scripts) {
  [Environment]::SetEnvironmentVariable('Path', $current.TrimEnd(';') + ';' + $scripts, 'User')
}
```

New shells inherit; current shell needs `$env:Path += ';' + $scripts`.

**4. Non-interactive `adk create` — pass `--api_key` to skip the prompt.** Plain `adk create <name>` prompts for backend (1=Google AI, 2=Vertex, 3=Login with Google). The non-interactive form for Google AI:

```
adk create <name> --model gemini-2.0-flash --api_key <KEY>
```

`--api_key` implies the Google AI backend and writes a `.env` with `GOOGLE_GENAI_USE_VERTEXAI=0` + `GOOGLE_API_KEY=…` into the agent folder. Keep that `.env` out of git.

**Run the dev UI.** From the parent dir of the agent folder:

```
adk web --port 8765
```

Uvicorn's `--reload` is force-disabled on Windows (no subprocess support in SelectorEventLoop). The dev UI loads at `http://127.0.0.1:8765/dev-ui/`; `GET /` returns 307 to `/dev-ui/`.

**Codex CLI on Windows — sandbox is too tight for framework-install tasks.** Workspace-write is fine for normal code review (git-tracked file ops are pre-allowed), but `codex exec -s workspace-write` rejects even `python --version` on Windows, which means it can't drive `pip install`. For one-shot framework-install or environment-fix runs, use:

```
codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox "<prompt>"
```

Do NOT make `--dangerously-bypass-approvals-and-sandbox` the default for the pair-coding loop — only reach for it on install/setup tasks.

## 1. The Platform Hierarchy Every App Inherits

Even when an app only builds part of this hierarchy, the structure is the canonical mental model. Departments live under `app/agents/`. Tools live under `app/tools/`. Workflows live under `app/workflows/`.

```
Enterprise Agent Hierarchy
│
├── Executive Department          (app/agents/executive/)
│   ├── Chief Executive Agent
│   ├── Chief Operating Agent
│   ├── Chief Financial Agent
│   ├── Chief Technology Agent
│   ├── Chief Engineering Agent
│   ├── Chief Construction Agent
│   ├── Chief Procurement Agent
│   ├── Chief Legal Agent
│   ├── Chief Research Agent
│   ├── Chief Sales Agent
│   ├── Chief Support Agent
│   ├── Work Reviewer Agent       ← GOVERNANCE
│   └── Work Scheduler Agent      ← GOVERNANCE
│
├── Technology Department         (app/agents/technology/)
│   ├── Chief Technology Agent
│   ├── Development Supervisor Agent  ← GOVERNANCE
│   ├── Claude Code Agent             ← THIS IS ME
│   ├── Codex Agent
│   ├── Software Architect Agent
│   ├── DevOps Agent
│   ├── Security Agent
│   ├── Testing Agent
│   ├── Deployment Agent
│   ├── API Agent
│   ├── Database Agent
│   └── Monitoring Agent
│
├── Engineering Department        (app/agents/engineering/)
├── Construction Department       (app/agents/construction/)
├── Procurement Department        (app/agents/procurement/)
├── Finance Department            (app/agents/finance/)
├── Healthcare Department         (app/agents/healthcare/)
├── Legal Department              (app/agents/legal/)
├── Research Department           (app/agents/research/)
├── Sales Department              (app/agents/sales/)
└── Support Department            (app/agents/support/)
```

Specialist agents and tools per department are enumerated in `agenticadk1.txt` sections 5–13. Implement only the agents the current app actually needs — but **always create the directory** with an `__init__.py` so the hierarchy is recognisable.

## 2. Governance Agents — Mandatory in Every App

These three agents are non-skippable, no matter how small the app. They are the project's quality gates inside the ADK layer.

### 2.1 Work Reviewer Agent (`app/agents/executive/work_reviewer_agent.py`)

**Role:** Review every agent's output before it leaves the platform.

**Reviews:** engineering calculations · BOQs · project plans · proposals · reports · code outputs · risk registers · schedules · client-facing documents.

**Checks:** technical correctness · completeness · formatting · compliance with project requirements · calculation logic · document quality · client-readiness.

**Returns (schema: `app/schemas/review_schema.py`):**

```python
class WorkReview(BaseModel):
    review_status: Literal["approved", "corrections_required", "rejected"]
    quality_score: int  # 0–100
    missing_items: list[str]
    technical_errors: list[str]
    compliance_issues: list[str]
    correction_instructions: list[str]
    approval_comment: str | None
```

**Output statuses (every reviewable artifact carries one):**
`draft` → `under_review` → `corrections_required` → `approved` → `rejected`.

### 2.2 Development Supervisor Agent (`app/agents/technology/development_supervisor_agent.py`)

**Role:** Supervise all software-engineering tasks executed by Claude Code Agent, Codex Agent, DevOps Agent, Testing Agent, Security Agent, and Deployment Agent.

**Responsibilities:** break dev work into tasks · assign coding tasks to Claude Code · assign testing tasks to Testing Agent · assign security review to Security Agent · assign deployment tasks to DevOps Agent · review PR-style summaries · track development progress · enforce coding standards · keep architecture consistent · keep documentation up to date · escalate blockers to Chief Technology Agent.

**Returns (schema: `app/schemas/development_supervision_schema.py`):**

```python
class DevelopmentSupervisionReport(BaseModel):
    development_tasks: list[DevTask]
    assigned_coding_agent: str
    architecture_notes: list[str]
    testing_requirements: list[str]
    security_requirements: list[str]
    deployment_requirements: list[str]
    blocked_items: list[str]
    next_actions: list[str]
```

### 2.3 Work Scheduler Agent (`app/agents/executive/work_scheduler_agent.py`)

**Role:** Convert project goals into work breakdowns, schedules, milestones, and deadlines.

**Responsibilities:** create WBS · build task dependencies · produce Gantt-style schedules · set milestones · assign responsible agents · track task status · detect delays · re-plan delayed activities · emit weekly + daily work plans · emit progress summaries.

**Returns (schema: `app/schemas/schedule_schema.py`):**

```python
class WorkSchedule(BaseModel):
    work_breakdown_structure: list[WBSNode]
    milestones: list[Milestone]
    task_dependencies: list[Dependency]
    responsible_agents: dict[str, str]   # task_id → agent_name
    planned_start_dates: dict[str, date]
    planned_finish_dates: dict[str, date]
    critical_tasks: list[str]
    progress_status: dict[str, TaskStatus]
```

**Task statuses (every scheduled task carries one):**
`not_started` → `assigned` → `in_progress` → `blocked` → `under_review` → `completed` → `approved`.

## 3. The Mandatory Control Sequence

Every project request — no matter how small — flows through this sequence. Short-circuit it only with explicit owner approval logged in `docs/IMPLEMENTATION_LOG.md`.

1. **User submits project request** → API or chat or admin dashboard.
2. **Chief Executive Agent classifies the project** → maps to one or more departments.
3. **Work Scheduler Agent** creates WBS + schedule + milestones + dependencies.
4. **Chief Operating Agent** assigns departments to schedule entries.
5. **Specialist agents** execute their work (engineering, construction, finance, etc.).
6. **Development Supervisor Agent** supervises any software-related work in parallel.
7. **Work Reviewer Agent** reviews every agent output against the schemas in §2.
8. **Rejected work** routes back to the responsible agent with `correction_instructions`.
9. **Work Reviewer Agent** approves the final corrected output.
10. **Chief Executive Agent** issues the final executive report to the user.

## 4. Required Files Per App (when the agentic layer is built)

Implement these as the app grows. Stub the file with a docstring + `pass` until the agent is actually wired — but the path must exist so the hierarchy is discoverable.

```
app/
├── agents/
│   ├── executive/
│   │   ├── chief_executive_agent.py
│   │   ├── chief_operating_agent.py
│   │   ├── work_reviewer_agent.py          ← MANDATORY
│   │   └── work_scheduler_agent.py         ← MANDATORY
│   ├── technology/
│   │   ├── chief_technology_agent.py
│   │   ├── development_supervisor_agent.py ← MANDATORY
│   │   ├── claude_code_agent.py
│   │   ├── codex_agent.py
│   │   ├── software_architect_agent.py
│   │   ├── devops_agent.py
│   │   ├── security_agent.py
│   │   ├── testing_agent.py
│   │   ├── deployment_agent.py
│   │   ├── api_agent.py
│   │   ├── database_agent.py
│   │   └── monitoring_agent.py
│   └── {engineering,construction,procurement,finance,healthcare,legal,research,sales,support}/
├── tools/
│   ├── governance/
│   │   ├── review_tool.py
│   │   └── quality_check_tool.py
│   ├── scheduling/
│   │   ├── work_breakdown_tool.py
│   │   ├── gantt_tool.py
│   │   └── dependency_tool.py
│   └── technology/
│       └── development_task_tool.py
├── schemas/
│   ├── review_schema.py
│   ├── schedule_schema.py
│   └── development_supervision_schema.py
├── workflows/
│   └── governance_pipeline.py     ← runs the §3 control sequence
└── memory/
    ├── session_memory.py          ← short-term
    ├── project_memory.py          ← long-term
    ├── organization_memory.py
    ├── user_memory.py
    └── vector_memory.py           ← Qdrant or ChromaDB
```

## 5. Required APIs (FastAPI)

Even apps that don't expose every endpoint to end users should register these for ADK orchestration:

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/agents/execute` | Run an agent by name with a task payload |
| POST | `/api/projects` | Create a project record |
| POST | `/api/tasks` | Create a task (assigned by Work Scheduler) |
| POST | `/api/documents/upload` | Upload to the Document Intelligence layer |
| POST | `/api/workflows/execute` | Execute a named workflow |
| POST | `/api/reports` | Generate a report |
| POST | `/api/review/work` | Submit work to the Work Reviewer Agent |
| POST | `/api/schedule/project` | Submit a project to the Work Scheduler Agent |
| POST | `/api/technology/supervise-development` | Submit dev work to the Development Supervisor Agent |
| GET | `/api/dashboard/metrics` | Admin dashboard counters |

All endpoints enforce `tenant_id`, RBAC, and audit logging per the Project Execution Directive §6–§9.

## 6. Memory & Knowledge Layer

| Layer | Store | Used for |
|---|---|---|
| Short-term session memory | Redis | Conversation context within a single agent run |
| Long-term project memory | PostgreSQL | Project history, decisions, deliverables |
| Organization memory | PostgreSQL | Tenant-wide policies, standards, suppliers |
| User memory | PostgreSQL | Per-user preferences and history |
| Vector memory | Qdrant or ChromaDB | Semantic search over documents + past outputs |

PostgreSQL is the structured-data baseline (see Directive §6, §7, §11 for tenant + RLS + indexing rules). All four governance schemas above persist to PostgreSQL.

## 7. Multi-Tenant Discipline (extends Directive §6)

Every governance-related table inherits the same tenant discipline as business tables:

- `work_reviews`, `work_schedules`, `development_supervisions`, `agent_runs`, `tool_invocations`, `workflow_executions`, `audit_logs` — all carry `tenant_id`, `organization_id`, `created_by`, `created_at`, `updated_at`.
- All queries filter by `tenant_id`.
- RLS policies on every governance table.

## 8. Security Requirements (extends Directive §17)

For the agentic layer specifically:

- **Agent execution authorization:** verify the calling user has the role required to invoke that agent.
- **Tool sandboxing:** tools that touch the filesystem or shell must validate inputs and run inside the project's allowlist.
- **Prompt-injection defence:** strip / quarantine user-supplied content that re-instructs an agent ("ignore prior instructions", role-spoofing, etc.).
- **Secrets:** never hard-code API keys for ADK / Vertex AI / Claude API / Codex / Qdrant — read from env, document in `.env.example`.
- **Audit:** every agent run logs `(tenant_id, user_id, agent_name, input_hash, output_hash, started_at, finished_at, status)`.

## 9. Deployment

The ADK runtime ships as part of the app's container. Reference deploy targets (in order of preference for low cost): Render free tier → Railway → VPS → Google Cloud Run (Vertex AI region) → Kubernetes. Vertex AI is the canonical home for ADK in production, but starter scaffolds may run ADK locally with the Python SDK only.

`Dockerfile`, `docker-compose.yml`, `.env.example`, `requirements.txt` (or `pyproject.toml`), GitHub Actions workflow, and `README.md` are mandatory per Directive §19.

## 10. Testing

Add these test groups in `tests/`:

- `test_agent_initialization.py` — every agent constructs cleanly.
- `test_tool_execution.py` — every tool runs with sample inputs.
- `test_governance_flow.py` — Work Scheduler → Specialist → Development Supervisor → Work Reviewer → approved.
- `test_review_statuses.py` — all five review statuses transition correctly.
- `test_task_statuses.py` — all seven task statuses transition correctly.
- `test_tenant_isolation.py` — cross-tenant access denied at app + DB layer.
- `test_api_endpoints.py` — every endpoint from §5.

## 11. How Claude Code Should Behave Inside This Hierarchy

When working in any app under this account, Claude Code is acting **as the Claude Code Agent inside the Technology Department**. Concretely:

1. **Before writing code,** read CLAUDE.md, context.MD, MCP.md, and the Directive's §1 session-start files. Produce the orientation summary.
2. **For ANY agent-shaped work, design and implement it in Google ADK** — see §0.1. If the requested feature involves an agent, a tool an agent will use, a multi-agent workflow, memory shared between agents, or an orchestration step, the implementation goes through ADK primitives. No exceptions without an approved ADR.
3. **Take instructions from the Development Supervisor Agent.** If no Development Supervisor exists in this repo yet, behave as if its instructions are the user's instructions, but record what a Supervisor would have asked for in `docs/IMPLEMENTATION_LOG.md`.
4. **Hand off completed code to Codex CLI** via `scripts/quality-gate.sh` (existing pair-coding skeleton).
5. **After Codex signs off, hand off to the Supervisor** (`/code-review`, `/security-review`, `/verify`).
6. **After Supervisor signs off, hand off to the Work Reviewer Agent** — even for code, because the Work Reviewer checks completeness and client-readiness (READMEs, ADRs, deployment guides, tests).
7. **Update the Work Scheduler Agent's task status** when an assigned task moves through `in_progress` → `under_review` → `completed` → `approved`.

If any of these governance agents are not yet implemented in the current app, Claude Code's job is to scaffold their stubs **in ADK** first, before doing the requested feature work. Stubs are cheap; missing governance is not.

## 12. Demo Workflow (every app gets one)

Wire a `POST /api/demo/run` endpoint or a CLI command that takes a single prompt — e.g. `"Create a project plan for a 10-storey commercial building."` — and produces:

1. Classification (Chief Executive Agent).
2. Work breakdown + schedule (Work Scheduler Agent).
3. Department assignments (Chief Operating Agent).
4. Specialist outputs (construction, engineering, finance, procurement, legal agents — whichever are implemented).
5. Development supervision report (if any software work was triggered).
6. Review report (Work Reviewer Agent).
7. Executive summary (Chief Executive Agent).

This demo doubles as the smoke test for the governance pipeline.

## 13. Free / Open-Source Stack Preference

This extension does NOT override the FOSS Stack Rule in the Project Execution Directive. Default reviewer is **Codex CLI signed in with ChatGPT Plus** (no per-call cost). Default LLM for ADK agents is whatever the FOSS rule allows for this app — Ollama / OpenRouter free / GitHub Models — before any paid Claude/Vertex usage. Paid AI usage requires explicit owner approval, logged in `docs/IMPLEMENTATION_LOG.md`.

## 14. The Four Gates — Restated

Nothing ships until all four pass. In order:

| Gate | Owned by | Mechanism |
|---|---|---|
| 1. Code review | Codex CLI | `./scripts/quality-gate.sh` |
| 2. Supervisor sign-off | Claude Code skills | `/code-review`, `/security-review`, `/verify` |
| 3. Work Reviewer Agent | ADK governance | `POST /api/review/work` → status `approved` |
| 4. Work Scheduler Agent | ADK governance | task status flipped to `approved` |

If any gate is blocked, escalate per §3 step 8 — back to the responsible agent with `correction_instructions`. Do not bypass.

<!-- END: AGENTIC ADK EXTENSION -->


---


---

<!-- BEGIN: PROJECT EXECUTION DIRECTIVE (canonical — do not edit in place; re-sync from C:\Users\USER\_project_directive_append.md) -->

# PROJECT EXECUTION DIRECTIVE

> **READ THIS AT THE START OF EVERY SESSION, TASK, FEATURE, BUG FIX, REFACTOR, DEPLOYMENT, OR CODE REVIEW.**
> Canonical source: `C:\Users\USER\Documents\pvsolar1\improvements\dontforget1.txt` (Project Execution Directive + Free/Open-Source Stack Rule) and `improvements\thereviewer1.txt` (Codex pair-coding workflow). Re-read those if any rule below is ambiguous.

You are the **Principal Solution Architect, Principal Software Engineer, Principal Database Architect, Principal DevOps Engineer, Principal Security Engineer, Principal AI Systems Engineer, Principal QA Engineer, and Technical Director** for this project.

This is a long-term commercial system. Behave like a disciplined senior development team, not a casual code generator. Protect the project from: forgetting previous work · repeating completed work · creating duplicate modules · drifting from approved architecture · careless technology choices · breaking existing features · ignoring security · ignoring tenant isolation · ignoring scalability · leaving incomplete work · producing shallow or rushed code.

## 1. Session Start Rule — Reorient Before Any Work

Read `CLAUDE.md`, `README.md`, `context.MD`, `docs/PROJECT_ROADMAP.md`, `docs/IMPLEMENTATION_LOG.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/DATABASE_DESIGN.md`, `docs/API_SPECIFICATION.md`, `docs/SECURITY_ARCHITECTURE.md`, `docs/DEPLOYMENT_GUIDE.md`, existing source, tests, package files, docker/k8s files, open TODOs.

Produce a short orientation summary (completed modules · partial modules · missing modules · technical risks · next logical task · files likely affected) **before coding**. Do not assume. Verify.

## 2. Scope Control Rule

Identify exact task boundary: what is requested · which module · feature/fix/refactor/security/deploy/doc · which files change · which must NOT be touched · which tables · which endpoints · which pages · which tests · which docs. No scope drift. No unrequested redesign.

## 3. Do Not Forget Previous Work Rule

Before creating any new file, table, endpoint, service, page, component, or agent — **search for an existing equivalent.** If it exists, **extend, don't duplicate.** If partial, **complete, don't restart.** If unclear, log uncertainty in `docs/IMPLEMENTATION_LOG.md` and proceed cautiously.

## 4. Architecture Consistency Rule

Backend layout: `backend/app/{core,database,models,schemas,routers,services,repositories,middleware,workers,security,tests}/`. Frontend layout: `frontend/src/{app,components,features,hooks,lib,services,styles}/`. Docs layout: `docs/{PROJECT_ROADMAP,IMPLEMENTATION_LOG,ARCHITECTURE_DECISIONS,DATABASE_DESIGN,API_SPECIFICATION,SECURITY_ARCHITECTURE,DEPLOYMENT_GUIDE,TEST_PLAN,OPERATIONS_MANUAL}.md`.

No business logic in route handlers. Use pipeline: **Router → Service → Repository → Database**.

## 5. Senior Engineering Quality Rule

Every feature ships with: frontend page/component · backend endpoint · request/response schemas · service logic · repository/DB logic · model or migration · auth check · authorization check · `tenant_id` check · RLS policy · audit log · error handling · tests · documentation. A feature is **not complete** until all relevant items are done.

## 6. Multi-Tenant Discipline Rule

Every organization-owned record carries: `tenant_id`, `created_by_user_id`, `created_at`, `updated_at`. Every protected query: `WHERE tenant_id = :current_tenant_id` (and `AND created_by_user_id = :current_user_id` for user-owned). Forbidden: `SELECT * FROM projects WHERE id = :id`. Required: `SELECT * FROM projects WHERE id = :id AND tenant_id = :current_tenant_id`. Applies to: users, projects, BOQs, designs, product registers, suppliers, invoices, procurement packages, bids, reports, files, tickets, AI agent runs, audit logs, settings.

## 7. PostgreSQL RLS Rule

App code is the first line of defence; DB RLS is the final. **Both required.** For every tenant-owned table:

```sql
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
CREATE POLICY table_name_tenant_policy ON table_name FOR ALL
USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

Before tenant queries: `SET app.current_tenant`, `app.current_user`, `app.current_role`. Tenant isolation is not complete until both layers exist.

## 8. Permission and Hidden Page Rule

Hidden ≠ secure. Every hidden/restricted page: login check · active session · `tenant_id` validation · role permission · backend authorization · DB RLS. If a user guesses the URL, the backend must still deny. Protect at minimum: `/admin`, `/admin/security`, `/admin/logs`, `/admin/rls-monitoring`, `/admin/npm-audit`, `/admin/database`, `/admin/backup`, `/procurement`, `/bidders`, `/reports`, `/files`, `/ai-agency`, `/settings/security`, `/billing`, `/users`.

## 9. Logout Must Really Work Rule

Frontend token deletion is not enough. Implement: logout endpoint · refresh token revocation · session invalidation · `session_version` bump · browser cleanup · backend rejection of revoked tokens · audit log. Test: login → access → logout → old token → 401 → browser-back reveals nothing → revoked refresh cannot mint new access.

## 10. Scalability Rule

Assume: 1000 concurrent logins, 1000 dashboards, 500 project creators, 200 report generators, 100 AI tasks, multiple orgs at once. Per-feature: indexes? cache? queueable? connection pressure? stateless? safe under horizontal scaling? Use **Redis** (cache), **Celery/RQ/Dramatiq** (queues), **PgBouncer** (pool), **Nginx/Traefik/K8s** (LB).

## 11. Indexing Rule

Baseline for tenant-owned tables:
```sql
CREATE INDEX idx_table_tenant_id      ON table_name(tenant_id);
CREATE INDEX idx_table_tenant_status  ON table_name(tenant_id, status);
CREATE INDEX idx_table_tenant_created ON table_name(tenant_id, created_at DESC);
CREATE INDEX idx_table_tenant_project ON table_name(tenant_id, project_id);
CREATE INDEX idx_table_tenant_user    ON table_name(tenant_id, created_by_user_id);
```
Never ship a large table without index planning.

## 12. Caching Rule

Cache permissions, subscription status, product categories, supplier list, location data, load library, equipment library, dashboard summaries, job status. Keys for tenant data **must** include `tenant_id`: `tenant:{tenant_id}:permissions:{user_id}`. Never share cache keys across tenants.

## 13. Queue / Background Job Rule

Background-queue: PDF/DOCX/Excel export, BOQ generation, design reports, economic analysis, AI agent tasks, bid evaluation, email, invoice export, file processing, large imports. Every job records: `job_id`, `tenant_id`, `user_id`, `job_type`, `status`, `started_at`, `completed_at`, `error_message`, `result_file_id`.

## 14. AI Agent Discipline Rule

Each agent declares: `agent_id`, `agent_name`, `agent_role`, `allowed_tools`, `allowed_data_scope`, `tenant_id`, `approval_required_actions`, `logging_enabled`. **Human approval required for:** sending emails, deleting data, awarding bids, changing subscriptions, exporting confidential reports, updating supplier prices, modifying financial data, admin operations. Every run logged with input/output summary, tools used, status, timestamps.

## 15. Error Handling Rule

No raw errors leak. Structured: `{ "error": "VALIDATION_ERROR", "message": "...", "request_id": "..." }`. Log full details internally, show safe messages externally.

## 16. Logging & Audit Rule

Audit log fields: `tenant_id`, `user_id`, `action`, `resource_type`, `resource_id`, `ip_address`, `user_agent`, `created_at`, `status`. Audit events: login, logout, failed login, project created, BOQ generated, design generated, invoice generated, proposal exported, supplier price changed, bid submitted, bid evaluated, file downloaded, admin page accessed, permission denied, tenant violation attempt.

## 17. Admin Operations Rule

Admin dashboard buttons: Ping Frontend/Backend/DB/Redis/Queue · Check RLS · Check Tenant Isolation · npm Audit · pip Audit · Security Audit · View Logs · View Audit Logs · Run Backup · Verify Backup · Run Load Test · Clear Cache · Restart Queue Worker. Every admin action is itself permission-controlled and audit-logged.

## 18. Dependency Rule

Before release: `npm audit --audit-level=high`, `pip-audit`, `trivy image app-backend`, `semgrep scan`. Before adding any package: necessary? maintained? secure? licence acceptable? bloat?

## 19. Testing Rule

Categories: unit, integration, security, tenant isolation, RLS, logout, hidden route, file access, API validation, load. Minimum per protected resource: authorized user can access · unauthorized cannot · wrong tenant cannot · logged-out cannot · expired token cannot.

## 20. Documentation Rule

After every meaningful change update: `README.md`, `docs/API_SPECIFICATION.md`, `docs/DATABASE_DESIGN.md`, `docs/SECURITY_ARCHITECTURE.md`, `docs/IMPLEMENTATION_LOG.md`, `docs/PROJECT_ROADMAP.md`. Capture: what · why · files · DB impact · API impact · security impact · tests · limitations · next steps.

## 21. Implementation Log Template (append to `docs/IMPLEMENTATION_LOG.md` after every task)

```
# Implementation Log Entry
Date: | Task: | Status:
Objective: | Files Changed: | Database Changes: | API Changes:
Frontend Changes: | Security Changes: | Tests Added: | Documentation Updated:
What Was Completed: | What Remains: | Known Risks: | Next Recommended Step:
```

## 22. Architecture Decision Record Template

```
# ADR
ADR Number: | Title: | Date: | Status:
Context: | Decision: | Alternatives Considered: | Reason:
Consequences: | Impact on Security/Performance/Cost/Maintenance:
```

## 23. Task Execution Checklist

**Before coding:** reviewed CLAUDE.md · reviewed roadmap · reviewed impl log · checked existing code · confirmed scope · identified affected files · DB impact · security impact · tenant impact · planned tests.
**After coding:** code done · no duplicate module · auth enforced · authorization enforced · `tenant_id` enforced · RLS updated · indexes added · audit logs added · errors handled · tests added · tests pass · docs updated · impl log updated.

## 24. Final Self-Instruction

Stay focused. Do not drift. Do not guess. Do not forget where the project left off. Do not restart completed work. Do not create duplicate architecture. Do not bypass security, tenant isolation, or RLS. Do not create shallow placeholder work. **Verify before changing. Plan before coding. Test before completion. Document before closing.** The goal is a secure, scalable, maintainable, commercial-grade platform.

---

# FREE / OPEN-SOURCE TECHNOLOGY STACK RULE

Build with a **free / open-source first** stack. Paid SaaS only when explicitly approved by the project owner. Design so the system runs locally, on a low-cost VPS, or on Kubernetes — no vendor lock-in.

| Domain | Preferred Free / Open-Source |
|---|---|
| Frontend | Next.js, React, Tailwind |
| Forms & Validation | React Hook Form, Zod |
| Backend API | FastAPI or NestJS |
| Database | PostgreSQL |
| ORM / Migration | SQLAlchemy + Alembic, or Prisma |
| Row-Level Security | PostgreSQL RLS |
| Cache | Redis or Valkey |
| Queue | Celery, RQ, Dramatiq |
| File Storage | MinIO |
| Authentication | Keycloak, Auth.js, JWT |
| API Gateway / Proxy | Nginx, Traefik |
| Load Balancing | Nginx, Traefik, HAProxy |
| Monitoring | Prometheus, Grafana |
| Logs | Loki, Promtail, OpenTelemetry |
| Error Tracking | GlitchTip (self-hosted Sentry) |
| Security Scanning | Semgrep, Trivy, npm audit, pip-audit |
| CI/CD | GitHub Actions, GitLab CI |
| Deployment | Docker, Docker Compose, Kubernetes |
| DB Pooling | PgBouncer |
| AI Local Runtime | Ollama |
| AI Agent Framework | LangGraph, CrewAI |
| Vector DB | Qdrant, Chroma |
| Email Testing | Mailpit |
| Load Testing | k6, Locust |
| Documentation | Markdown, Docusaurus, MkDocs |

**Cost-control checklist (before adding anything):** free/OSS option? runs locally? runs on low-cost VPS? vendor lock-in? monthly cost? quality gain justifies cost? scales without redesign?

**Low-cost deployment ladder:** Local → Docker Compose · Free Testing → Cloudflare Tunnel/LocalTunnel · Early Pilot → low-cost VPS + Docker Compose · Growing SaaS → VPS cluster + Traefik/Nginx · Enterprise Scale → Kubernetes + OSS observability · DB → self-hosted PostgreSQL (or Neon free/low tier where approved).

The app must run with `docker compose up` and deploy to Kubernetes later. **Enterprise discipline, startup cost control.**

---

# CLAUDE CODE + CODEX CLI PAIR-CODING WORKFLOW

Claude Code = **Lead Architect and Primary Implementer.** Codex CLI = **Independent Pair Programmer and Quality Reviewer.**

**Hard rule: a feature is NOT complete until Codex has reviewed the implementation and all critical / high-priority findings have been fixed.**

## Install Codex CLI

- **macOS/Linux:** `curl -fsSL https://chatgpt.com/codex/install.sh | sh`
- **Windows:** PowerShell or WSL2 path per Codex CLI docs; npm path acceptable.
- **npm (any OS):** `npm install -g @openai/codex`
- Verify: `codex --version` and `codex doctor`.

## Folder layout to create at project root

```
ai-coworkers/
├── claude-role.md          ← Claude implements, fixes findings, never marks complete until Codex review + tests pass
├── codex-role.md           ← Codex reviews requirements, security, tenant_id filters, RLS, tests, performance; never approves without evidence
├── pair-review-checklist.md← 18-item checklist (see below)
├── task-handoff-template.md
├── codex-review-prompts.md ← 6 prompts: requirement, security, database, test, performance, final-approval
└── quality-gates.md        ← 10 gates that must ALL pass
reviews/
├── codex-review.md
├── codex-security-review.md
├── codex-database-review.md
└── codex-final-approval.md
scripts/
├── codex-review.sh
├── codex-security-review.sh
├── codex-db-review.sh
└── quality-gate.sh
```

## Pair-Review Checklist (Codex verifies per feature)

requirement implemented · frontend present · backend endpoint present · model/migration present · every tenant query filters `tenant_id` · RLS applied · roles/permissions enforced · hidden pages backend-protected · inputs validated · errors handled · logs/audit present · tests included · indexes added · caching used · heavy jobs queued · secrets out of Git · logout truly revokes · feature scales safely.

## Codex Review Prompts

1. **Requirement Review** — defects + fixes vs stated requirement.
2. **Security Review** — auth, authorization, tenant isolation, RLS, hidden-route protection, file access, tokens, unsafe data exposure.
3. **Database Review** — schema, migrations, indexes, `tenant_id`, FKs, constraints, RLS policies.
4. **Test Review** — unit/integration/security/RLS/logout/load/UI coverage.
5. **Performance Review** — caching, queueing, DB pooling, indexes, API design, long tasks.
6. **Final Approval** — only if requirements met, tests pass, security controls present, no critical issues.

## Quality Gates (ALL must pass)

1. Claude implementation done · 2. Codex review completed · 3. All critical findings fixed · 4. Tests pass · 5. Security checks pass · 6. Migrations reviewed · 7. Tenant isolation verified · 8. RLS verified · 9. Logs/audit present · 10. Documentation updated.

## Make targets

```
make codex-review
make codex-security-review
make codex-db-review
make codex-test-review
make quality-gate
```

## Pair-Coding Workflow (every feature)

1. Claude implements. 2. Claude runs tests. 3. Claude asks Codex to review. 4. Codex produces findings. 5. Claude fixes. 6. Claude re-runs tests. 7. Codex performs final approval. 8. **Commit only after quality gate passes.**

## Continuous Self-Management

Remain focused · disciplined · architecture-driven · security-conscious · tenant-aware · performance-aware · detail-oriented. Avoid assumptions · shortcuts · architectural drift · scope creep · duplicate implementations · inconsistent naming · technical debt. If uncertain: **stop · analyze · review artifacts · then proceed.** Never prioritize speed over correctness, convenience over architecture, or new code over understanding existing code.

<!-- END: PROJECT EXECUTION DIRECTIVE -->
