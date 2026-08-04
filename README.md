# AutoWorkshop AI

**The Complete AI-Powered Automotive Service, Repair and Workshop Operating System.**

Live target: [`autoworkshop.aiappinvent.com`](https://autoworkshop.aiappinvent.com) · Status: **Phase 5 — Release 0.4 (workshop + repair), in progress**

> ⚠️ **`master` IS NOT DEPLOYABLE AS IT STANDS.** Workshop registration returns
> 500 in production until migration **037** is applied — `register_workshop`
> runs as a non-superuser there, where `FORCE ROW LEVEL SECURITY` applies to
> table owners. The fix is committed and verified; applying it is one workflow
> run, recorded in `.claude/CURRENT_TASK.md`. Everything else on `master` is
> green. This banner comes down when that workflow has run.
>
> `.claude/CURRENT_PHASE.md` carries the detailed phase state; this line is the
> release-level summary and the two must agree.

One platform connecting vehicle owners, workshops, technicians, auto electricians, electronics
specialists, body repairers, spray painters, welders, vulcanizers, upholsterers, suppliers, fleet
operators, insurers and towing providers.

The promise, end to end: **report the problem → diagnose the fault → simulate the solution → approve the
work → verify the parts → track the repair** — every step authenticated, authorised, audited and recoverable.

---

## Zero-cost policy (hard)

Per `autoworkshop 05.txt` §1, §2, §6, §8 and ADR-012, this project uses **only zero-cost and open-source
tools — including in production**. No paid tool, subscription or mandatory paid service may be introduced.
A task is not complete if it added a paid dependency.

Where a capability normally costs money, it is built as a **disabled adapter behind an interface**:

- **Bring-your-own-connection (D7)** — each tenant connects their *own* OBD device, payment merchant
  account, SMTP server or model API key if they want one. The application works fully with none configured.
- **Upgrade-ready (D8)** — everything is self-hosted FOSS with full infrastructure-as-code, so moving to
  commercial infrastructure later (only if the product goes commercial) is a *hosting* change, not a rewrite.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router) · React · TypeScript · Tailwind · shadcn/ui · Radix |
| Backend | NestJS · TypeScript — modular monolith, 13 bounded domains |
| Database | PostgreSQL + `pgvector` — row-level security (`FORCE`) on every tenant table |
| Cache / jobs | Redis + BullMQ · **NATS** for domain events |
| Identity | Keycloak — own realm, OAuth 2.1 + PKCE |
| Storage | MinIO (S3-compatible) |
| Realtime | WebRTC + self-hosted `coturn` |
| AI | **Google ADK** (Python) → **MCP Gateway** → 19 MCP servers → NestJS domain services |
| LLM | Local Ollama (`llama3.2`, `llava`) via ADK `LiteLlm` |
| Design | **Penpot** · Storybook · Playwright (incl. visual regression) · axe-core · Vitest |
| Ops | Docker · Prometheus · Grafana · Loki |

**The AI never touches the database.** Agents hold no database, storage, payment or admin credentials;
they call the MCP Gateway, which calls authoritative NestJS domain services, which enforce every business
rule. Enforced in infrastructure and asserted by negative tests in CI — not by policy text.

---

## Repository layout

```
apps/        customer-web workshop-web supplier-web fleet-web insurance-web towing-web admin-web
             mobile (React Native/Expo, Android first) · api (NestJS) · mcp-gateway · mcp-servers
             agent-host (Python + ADK) · media-worker · storybook
packages/    design-tokens ui navigation forms tables charts workflow media offline-sync i18n
             ai-assistant mcp-ui accessibility auth api-client domain-contracts validation events …
python-packages/  adk-core adk-agents mcp-client agent-evals
domains/     13 bounded contexts — pure business logic
infrastructure/   docker compose keycloak migrations policies
tests/       playwright visual a11y tenant-isolation offline mcp
docs/        00-project … 14-user-guides
```

## Branches & commits

`master` (production-ready) · `develop` (integration) · short-lived `feature/*` branches.
Conventional commits: `feat(scope):` · `fix(scope):` · `chore(scope):` · `docs(scope):`.

## Documentation

`ARCHITECTURE.md` · `SECURITY.md` · `ROADMAP.md` · `CLAUDE.md` · `docs/`
Approved plan: `Documents\autoworkshop app\_plan\COMBINED_PLAN_v2.md`
(passed Codex `PASS WITH CORRECTIONS` → Supervisor `PASS WITH CONDITIONS`, all applied).

**Reference implementation: [`solar-pv-designer-lite`](https://github.com/marc667us/solar-pv-designer-lite)** —
patterns, CI shape and operational lessons are taken from it. The two applications are deliberately
**not** entangled: separate repo, database, Keycloak realm, deployment, secrets and CI. If Solar were
deleted tomorrow, this must still build, deploy and run.
