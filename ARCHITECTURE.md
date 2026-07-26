# Architecture — AutoWorkshop AI

Full detail: `docs/02-architecture/` and `docs/02-architecture/adr/`.

## Nine tiers (`autoworkshop 0.txt` §2)

```
1  Presentation                 7 Next.js apps + mobile (React Native/Expo)
2  Frontend application logic   packages/ui, navigation, forms, tables, offline-sync, i18n
3  API gateway / BFF            per-workspace interfaces
4  Business domain services     NestJS modular monolith — 13 bounded domains  << rules live ONLY here
5  Workflow orchestration       long-running processes, approval state machines
6  AI host + agents             Python + Google ADK: orchestrator -> conductors -> specialists
7  MCP gateway + 19 servers     TypeScript, @modelcontextprotocol/sdk
8  Data access                  tenant-aware repositories
9  Data stores                  PostgreSQL+pgvector, Redis, NATS, MinIO
```

## The AI boundary — the rule everything hangs on

```
ADK agent -> MCP client -> MCP Gateway -> MCP server -> NestJS app service -> repository -> RLS -> Postgres
                              |                             |
                              |                             +-- business rules, approval gate,
                              |                                 transaction, domain event, audit row
                              +-- authn, tenant resolve, tool allowlist, rate limit,
                                  prompt-injection scan, DLP, approval routing, audit
```

An MCP tool holds **no business logic and no database credential**. It validates arguments, resolves tenant
context, and calls the *same* application service the REST controller calls. Identical rules apply whether
the caller is a human or an agent.

**Human-in-the-loop classes** (`0.txt` §18), enforced at the Gateway **and** re-checked in the domain service:

| Class | Meaning | Gate |
|---|---|---|
| A | Read-only | Auto-execute, tenant-filtered, audited |
| B | Reversible draft | Auto-execute, output stays a draft |
| C | Business-committing | Explicit authenticated approval |
| D | Safety / financial / privileged | Authorised human approval, dual control, MFA, reason capture |

## Multi-tenancy — six enforcement layers

NestJS tenant context (from validated Keycloak claims + membership only) -> repository filter ->
**PostgreSQL RLS FORCE** -> object-storage path prefix -> search-index filter -> Redis key prefix.
Event messages carry tenant metadata. **A client-supplied tenant id is never trusted** (`1.txt` §9).

## Zero-cost, self-hosted, upgrade-ready

Every component is FOSS and self-hosted (ADR-012). No free-tier lock-in: full IaC, S3-compatible storage
interface, search interface, provider adapters, standard Postgres with WAL — so moving to commercial
infrastructure later is a hosting change, not a rewrite (ADR-016).
