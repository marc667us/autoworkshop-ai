# AutoWorkshop AI — COMBINED IMPLEMENTATION PLAN (v2)

**Authors:** Claude (plan v1) + Codex Reviewer (independent plan v1 + adjudication)
**Codex verdict on v1:** `PASS WITH CORRECTIONS` — all 14 corrections applied below
**Owner directions incorporated:** name locked · stop cutting · reuse Solar but don't mix things up
**Status:** ✅ **APPROVED — all gates complete.** Codex `PASS WITH CORRECTIONS` (14 applied) →
Supervisor `PASS WITH CONDITIONS` (8 applied, §14). See §15 and §16.
*(Corrected 2026-07-26: this line read "awaiting Supervisor adjudication" while §15 and §16 recorded the
Supervisor pass and declared all gates complete. One document cannot hold two release states — a stale
header on an approved plan is how work gets re-run or, worse, started under the belief it was never gated.)*
**Date:** 2026-07-25 · header corrected 2026-07-26

---

## 0. Provenance

Built from 10 unique spec files (~548 KB) in `Documents\autoworkshop app\`; two duplicate pairs discarded
(`0 (1).txt` ≡ `0.txt`, `04.txt` ≡ `03.txt`). Claude and Codex each read all 10 independently and drafted a
plan without seeing the other's. Codex then adjudicated. Where they disagreed, the winner and the governing
spec citation are recorded in §12.

---

## 1. Locked decisions

### D1 — Product identity — ✅ OWNER-LOCKED
**AutoWorkshop AI**, at **`autoworkshop.aiappinvent.com`**. Closed by owner instruction 2026-07-25.
"GarageOS AI" is dropped entirely — not a fallback. Module sub-brands (Studio, Doctor, Connect, Parts,
Knowledge, Fleet, Claims, Analytics) survive only as UI section names.

### D2 — Stack
Next.js (App Router) · React · TypeScript · Tailwind · shadcn/ui · Radix — frontend.
NestJS · TypeScript — backend. PostgreSQL · Redis · Keycloak. Python + Google ADK — agent layer.
`autoworkshop 2.txt`'s "reuse the Solar stack" is overruled: it openly admits it was guessing at Solar's
configuration, and Solar is a Flask single-file app that memory forbids editing. `1.txt` §5–6 and `05.txt` §1
both mandate the stack above.

### D2a — Solar reuse boundary — ✅ OWNER-DIRECTED, tightened per Codex correction #9/#10

Reuse is encouraged. Entanglement is prohibited.

**✅ REUSE — patterns and sanitised config, copied into this repo**

| What | How |
|---|---|
| Deploy patterns | `render.yaml` shape, health-check/start-command conventions, the manual `Force Render Deploy` workflow with its `inputs.confirm` dry-run gate |
| Postgres discipline | Migration structure, the 48 proven RLS policy patterns, backup + restore-drill scripts, `RETURNING id` |
| Keycloak config | Realm/client setup patterns, theme approach, cutover runbook |
| CI/CD shape | Workflow layout, gating structure, quality-gate script conventions |
| Observability | Prometheus + Loki + Grafana config from the SOC-2 sprint |
| Hard-won gotchas | Render ignores the Procfile · auto-deploy flaky · Keycloak OOMs on Render free · `CREATE-IF-NOT-EXISTS` schema drift · RLS seeding needs `set_config('app.current_role','admin',true)` · widen narrow `VARCHAR`→`TEXT` · PowerShell pipes inject a BOM into secrets |
| Governance | Project OS directive, Agentic ADK Extension, four-gate quality bar |

**❌ DO NOT MIX — hard boundaries**

1. **Separate repository** — `Documents\autoworkshop-ai\`. Not a folder in Solar, not a branch of it.
2. **Never edit Solar to serve AutoWorkshop.** `web_app.py`, `wsgi.py`, Solar templates stay untouched.
3. **Separate database** — own instance, own schemas. No shared tables, no cross-app FKs, no reading Solar's data.
4. **Separate Keycloak *realm*** — not merely a separate client *(Codex correction #9: a shared realm risks identity-data entanglement)*.
5. **Separate deployment, domain, secrets and CI environments.** A Solar deploy must never be able to break AutoWorkshop, or the reverse.
6. **No stack bleed.** Solar is Flask/Python. Copying Solar's Flask code here is prohibited — reuse the *pattern*, re-implement in TypeScript.
7. **Copy patterns, not files.** No relative imports into `../solar-pv-designer-lite`, no shared database queries, no shared deployment units. Genuinely shared logic becomes a versioned package per §0.3.
8. **No runtime dependency on any Solar service.**

**Acceptance test:** *if Solar were deleted tomorrow, would AutoWorkshop still build, deploy and run?*
If no, the coupling is wrong and gets removed.

### D3 — Design toolchain: Penpot, not Figma
`01 (1).txt` §61/§89 mandates Figma + Dev Mode + Chromatic; `05.txt` §1 mandates zero-cost/open-source only
and names Penpot; `06.txt`'s DECISION_LOG records "Penpot selected instead of Figma". Figma Dev Mode and
Chromatic are paid at team scale. **Penpot** for design, **Storybook OSS** as component catalogue,
**Playwright `toHaveScreenshot()`** for visual regression, **axe-core** for accessibility, **Vitest** for unit
tests. Everything else in `01 (1).txt` §64–§87 — token hierarchy, colour semantics, component catalogue,
component states, quality gates — is kept verbatim. Only the vendor changes.

### D4 — Agent framework: Google ADK over MCP  *(ADR-013)*
Platform governance §0.1 permits only Google ADK; the specs mandate an "AI Host + Agent Orchestrator + MCP
clients". Same shape, different words.

```
Tier 6  apps/agent-host      Python 3.14 + google-adk 2.2.0
          orchestrators/root_orchestrator.py
          conductors/  intake · diagnostic · solution · parts · finance · knowledge
          specialists/ ~20 LlmAgents
          MCP clients (ADK MCPToolset) ──────┐
                                              │  MCP over HTTP, via the Gateway
Tier 7  apps/mcp-gateway + apps/mcp-servers/* ┘  TypeScript, @modelcontextprotocol/sdk
Tier 4  apps/api  NestJS domain services — the only place business rules live
```

MCP is the **sole** cross-language boundary. NestJS never imports Python; ADK never imports TypeScript;
neither ever holds a database credential on an agent's behalf.

### D5 — Keycloak is mandatory  *(Codex correction #8 — Codex won this)*
`05.txt` §1 and §3, and `1.txt` §11, make Keycloak the authentication architecture. **The NestJS-native JWT
fallback from Claude v1 is removed.** Keycloak ships in Phase 2. Its hosting difficulty is a *deployment*
risk to be solved with hosting (§9), not licence to implement a second auth product.

---

## 2. Scope: build everything — stage content, not features

**Owner direction: stop cutting.** Claude v1 deferred six areas on the strength of `05.txt`'s "16 weeks";
Codex v1 additionally cut fleet, insurance, towing, marketplace depth, offline sync and mobile. **Both
positions are withdrawn.** Codex's adjudication concedes this: *"Claude's revised Section 2 wins. The owner
overruled both cuts, and the specs support full structural scope."*

**Principle: every feature gets built structurally. What stages is (a) content we must license or collect,
and (b) two external dependencies — relay bandwidth and OBD hardware.**

The specs already anticipate this. `2.txt` says the 3D module "should be introduced progressively because
high-quality vehicle-specific models require licensed data"; it requires CV results to be "reviewable by a
qualified technician" and sound results to be "diagnostic leads rather than final conclusions". A working
baseline with honest confidence labelling and a human gate **satisfies** the spec.

| Area | Built in full | Genuinely staged | Blocker type |
|---|---|---|---|
| **Voice/video/screen-share** | WebRTC signaling, room lifecycle, participant permissions, recording consent + notice, call records, call summaries, low-bandwidth mode, quality telemetry, **plus self-hosted `coturn`** giving zero-cost TURN **at limited capacity**, with quotas, abuse controls, UDP/TCP/TLS fallback and a documented degradation path | TURN **capacity** at scale — bandwidth, public UDP reachability, multi-AZ resilience (`1.txt` §26, §62) | **Capacity, not licence.** coturn removes the software cost, not the bandwidth/resilience constraint |
| **Computer-vision inspection** | Upload → quarantine → malware scan → EXIF strip → frame extraction → annotation → damage mapping → intake-vs-completion comparison → **qualified-assessor gate**. Baseline classification via local Ollama `llava`, surfaced as *candidate leads with confidence*, never deterministic diagnosis | A *trained* damage-estimation model | **Data** — labelled corpus, accumulated from assessor-confirmed jobs |
| **Engine-sound analysis** | Guided capture (phone placement, engine speed, duration), storage, speech/noise separation, FFT + spectral-band feature extraction producing *candidate leads with confidence*, technician confirmation required | High-accuracy multi-class classifier | **Data** — labelled audio corpus, accumulated the same way |
| **3D repair viewer** | Three.js: rotate/zoom/hide/isolate, exploded views, component metadata, assembly order, animated overlays (current, fluid, combustion, transmission), generic + CC0 geometry | *Vehicle-specific* OEM geometry | **Licensing** |
| **OBD integration** | **FULLY BUILDABLE at zero cost.** Full DTC model, code interpretation, freeze-frame, live-parameter schema, wiring-diagram linkage, guided test generation, file import (scanner CSV/JSON), manual DTC entry, device-integration interface, **and the live session path tested against an open-source ELM327 emulator** (FOSS, replays real vehicle data over serial/TCP) | *nothing* | — *(no purchase required)* |
| **Knowledge library** | Full CMS: authoring, versioning, technical/safety/copyright review roles, publication workflow, vehicle-applicability indexing, semantic search (pgvector), audio narration, chaptered video, dictionary cross-linking | "Millions of procedures" of *content* | **Content licensing/production** |

**Fleet, insurance, towing, marketplace depth, offline-first sync and the mobile app are all in scope, no caveat.**

### The only genuine limits — law and safety, not effort
1. **OEM wiring diagrams and manufacturer repair data are not preloaded.** `2.txt`/`3.txt` both say "where
   licensing permits". Library, schema, interactive circuit viewer and test-point tooling all ship; the
   copyrighted content does not.
2. **Class C/D MCP tools are implemented structurally** — approval ledgers, workflow state machines, dual
   control, reason capture — **and enabled by feature-policy gate only after the required human/governance
   approval** *(Codex correction #7; `0.txt` §18 + §46)*. This is the spec's own gating, not added caution.
3. **Sequencing is not scope.** Fleet approval cannot precede the job card it approves. Everything lands, in
   dependency order.

### Timeline
The 16-week figure is dead — it was a human-team estimate that should never have driven scope. Per Codex
correction #2, **week numbers are TBD pending Phase 1 velocity measurement**; the *sequence* below is fixed
and every release is independently shippable **from 0.2 onward**. **Release 0.1 is an internal bootstrap
release, not a shippable product** — it is monorepo, scaffolding, CI and docs, with no user-facing function,
and calling it "shippable" alongside that definition was a contradiction. The owner sees working software
from Release 0.2 onward, which is what the sentence was always meant to promise.
Releases 0.8 and 0.9 — reserved in `06.txt`'s release-file list, unused by `05.txt` — absorb the restored areas.

---

## 3. Repository layout

Monorepo, pnpm + Turborepo, at `C:\Users\USER\Documents\autoworkshop-ai\`.

```
autoworkshop-ai/
├── apps/
│   ├── customer-web/ workshop-web/ supplier-web/ fleet-web/
│   ├── insurance-web/ towing-web/ admin-web/     Next.js — 7 apps per `01 (1).txt` §86
│   ├── mobile/                                   React Native + Expo, ANDROID FIRST (correction #3)
│   ├── api/                                      NestJS modular monolith, 13 domains
│   ├── mcp-gateway/                              authn · allowlist · DLP · injection scan · approval · audit
│   ├── mcp-servers/                              ALL 19 skeletons from day one (correction #6)
│   ├── agent-host/                               Python + google-adk 2.2.0
│   ├── media-worker/                             BullMQ: scan, transcode, thumbnail, EXIF strip, transcribe
│   └── storybook/
├── packages/
│   ├── design-tokens/ ui/ navigation/ forms/ tables/ charts/ workflow/ media/
│   ├── ai-assistant/ mcp-ui/ accessibility/ auth/ api-client/ domain-contracts/
│   ├── validation/ events/ observability/ security/ config/ logger/ testing/
│   ├── offline-sync/                             IndexedDB + service worker + queue + conflict rules (#4)
│   └── i18n/                                     locale + translation infrastructure (#5)
├── python-packages/                              §0.3 pip-installable
│   ├── adk-core/ adk-agents/ mcp-client/ agent-evals/
├── domains/                                      13 bounded contexts, pure business logic
├── infrastructure/                               docker/ compose/ render/ neon/ keycloak/ migrations/ policies/
├── tests/                                        playwright/ visual/ a11y/ tenant-isolation/ offline/ mcp/
├── docs/                                         00-project … 14-user-guides, just-in-time
├── .claude/                                      CURRENT_PHASE · CURRENT_TASK · TASK_QUEUE · SESSION_HANDOVER …
├── CLAUDE.md  context.MD  MCP.md                 seeded from home-root templates
└── README.md ARCHITECTURE.md ROADMAP.md SECURITY.md CHANGELOG.md
```

Seven web apps, not one: `01 (1).txt` §86 lists them explicitly, and Codex conceded this
(*"Claude wins… A shared shell should live in packages, not collapse the specified apps"*). The shared shell,
navigation and design system live in `packages/` and are consumed by all seven.

Docs are created **just-in-time**. `06.txt` explicitly forbids generating the tree as placeholders: Phase 1
creates only its ~25 "minimum files to create first" plus `.claude/` control files.

---

## 4. Data model and multi-tenancy

**13 business domains** *(Codex correction #14 — align to `1.txt` §4 / `0.txt` §11)*: identity-access ·
customer-vehicle · complaint-appointment · workshop-technician · repair-job-diagnosis ·
solution-quotation-agreement · inventory-procurement · supplier-marketplace-verification · communication ·
knowledge-training · fleet-insurance-towing · finance-payment-warranty · platform-admin-audit.

One PostgreSQL cluster, **one schema per business domain**, with tables grouped as modules inside each — not
25 top-level schemas.

**Tenancy.** A *tenant* is the legal/commercial isolation boundary. Organizations belong to tenants; branches
to organizations; users gain access through memberships. A user may belong to several tenants, but **every
request resolves exactly one active tenant context, derived solely from validated Keycloak claims and
membership records — never from a client-supplied tenant id** *(Codex correction #4; `1.txt` §9: "the gateway
must never trust a tenant identifier supplied only by the client")*.

Every tenant row carries `tenant_id, organization_id, branch_id?, created_by, created_at, updated_by, updated_at`.

**RLS.** `ENABLE` + `FORCE ROW LEVEL SECURITY` on every tenant-owned table. The API sets transaction-local
`app.tenant_id`, `app.user_id`, `app.organization_ids`, `app.branch_ids`, `app.current_role` after validating
claims. Application filters remain; Postgres is the final backstop. Isolation is enforced at six layers:
NestJS tenant context → repository filter → RLS → object-storage path prefix → search-index filter → Redis
key prefix. Event messages carry tenant metadata.

**Hard schema rules** (Solar lessons):
- **No `VARCHAR(n)` on free-text or generated columns** — `TEXT`. Solar's truncation incident came from narrow
  VARCHARs meeting AI-generated content.
- **No `CREATE TABLE IF NOT EXISTS` in boot code.** Migrations only — versioned, forward- and rollback-tested
  in CI. IF-NOT-EXISTS is how live schema silently drifts from migration history.
- Approvals, payments, warranty decisions and audit events are **append-only**; corrections are new rows.
- `RETURNING id`, never `lastrowid`.

---

## 5. MCP + AI layer

**The rule the design hangs on:** an MCP tool contains no business logic and holds no database credential.
It validates arguments, resolves tenant/user context, and calls the same authoritative NestJS application
service the REST controller calls. Identical rules apply whether the caller is a human or an agent.

```
ADK agent → MCP client → MCP Gateway → MCP server → NestJS app service → repository → RLS → Postgres
                            │                            │
                            └ authn, tenant resolve,     └ business rules, approval gate, transaction,
                              tool allowlist, rate limit,   domain event, immutable audit row
                              injection scan, DLP,
                              approval routing, audit
```

**All 19 MCP servers get skeletons and contracts from day one** *(correction #6; `0.txt` §11–12, §35)*:
identity-access · customer-vehicle · complaint-appointment · workshop-technician · repair-diagnostic ·
solution-agreement · inventory-procurement · supplier-product · communication · knowledge-training ·
fleet-insurance-towing · finance-warranty · platform-operations · media-processing · simulation ·
notification · search · document-generation · marketplace. Executable tools are enabled per server as the
underlying domain service matures — structure first, execution in dependency order.

**Human-in-the-loop classes** (`0.txt` §18), enforced in the Gateway *and* re-checked in the domain service,
never only in a prompt:
- **A read-only** → auto-execute, tenant-filtered, audited
- **B draft** → auto-execute, output remains a draft pending user review
- **C business-committing** → authenticated role approval + immutable audit
- **D safety/financial/privileged** → privileged human approval, dual control where defined, MFA, reason capture

All four are **implemented structurally**; C and D are enabled by feature-policy gate after governance
approval *(correction #7)*.

**Prompt-injection defence** is testable, not aspirational. All retrieved content — repair documents,
supplier descriptions, customer uploads, chat messages, search results — is tagged untrusted and passed as
data, never instruction. CI carries a standing injection corpus; a PR that lets a poisoned document trigger a
tool call fails the build.

**Zero-cost LLM:** local Ollama (`llama3.2` text, `llava` vision) via ADK `LiteLlm` — the pattern already
proven on the Public Building Access Audit Platform. Every AI output records model version, prompt version,
retrieved sources and confidence.

---

## 6. Offline-first  *(Codex correction #4 — missing from Claude v1)*

Required by `1.txt` §5 and §42, and `2.txt` OFFLINE-FIRST OPERATION.

`packages/offline-sync` provides: IndexedDB stores + service-worker shell (web) and an encrypted queue
(mobile); cached assigned jobs, vehicle details, downloaded repair procedures, dictionary entries, inspection
forms, photos and approved quotations; a sync engine with a durable outbound queue; and **conflict rules that
prevent duplicate invoices, duplicated parts issuance and contradictory job-status updates**. Large videos
and 3D models are never auto-downloaded — the user selects content or a configurable workshop download pack.
Offline records are visibly flagged and reconciled on restore. Offline E2E tests are a CI gate.

---

## 7. Multilingual  *(Codex correction #5 — missing from Claude v1)*

Required by `2.txt` MULTILINGUAL SUPPORT. English first; architecture ready for Twi, Ga, Ewe, Hausa, French
and other regional languages. `packages/i18n` + translation tables make **interface labels, dictionary
entries, customer explanations and audio guidance independently translatable**. Technical terms retain the
recognised English industry term alongside the local-language explanation. Audio narration carries language
selection.

---

## 8. Phases and releases

Sequence fixed; week numbers TBD pending Phase 1 velocity *(correction #2)*.

| Phase | Release | Deliverable |
|---|---|---|
| 1 Foundation | **0.1** | Monorepo, 7 Next.js apps scaffolded, NestJS, Postgres, Redis, Docker compose, Git flow, lint/format/TS, CI skeleton, design tokens, Storybook, ~25 seed docs, `.claude/` control files, **env bootstrap (§11)** |
| 2 Identity | — | **Keycloak (mandatory)** realm + clients, login/logout/session, users, orgs, branches, roles, permissions, workspace/org/branch switching, tenant-context resolution, RLS, audit framework |
| 3 Shell + Nav | **0.2** | Top nav (workspace/org/branch/search/create/tasks/messages/notifications/AI/help/profile), collapsible grouped side nav, breadcrumbs, page headers, tabs, drawers, dialogs, badges, AI panel — desktop/tablet/mobile |
| 4 Customer + Vehicle | **0.3** | Registration, profile, vehicle garage, documents, service history, maintenance schedule, complaint submission (text/audio/image/video), appointment request, workshop search, dashboard |
| 5 Workshop + Repair | **0.4** | Workshop dashboard, reception, intake, complaint inbox, job cards, repair staging board, technician/bay assignment, inspection, diagnosis, repair plan, quotation, **Solution Studio** proposal + versioning + variation + e-approval, execution, testing, QC, release |
| 6 Parts + Suppliers | **0.5** | Catalogue, locations, reservations, issues/returns, requisitions, POs, goods receipt, supplier registration + verification, product submission + validation engine + badges, marketplace search, compatibility, orders |
| 7 Finance + Partners | **0.6** | Invoices, payments, receipts, balances, warranty records + claims, fleet vehicles/requests/approvals, insurance claims + repair authorisation, towing requests + dispatch |
| 8 MCP + AI | **0.7** | Gateway, registry, all 19 server skeletons, ADK orchestrator + conductors + specialists, Class A/B enabled, C/D gated, approval UI, MCP audit + kill switch |
| 9 Communication + Knowledge | **0.8** | Chat, voice notes, **WebRTC voice/video/screen-share**, group collaboration, call summaries · knowledge CMS, dictionary, wiring library, semantic search, training + certification |
| 10 Multimedia + Intelligence | **0.9** | **Computer-vision inspection · engine-sound analysis · 3D repair viewer · OBD integration · offline-first sync · mobile app (Android) · multilingual** |
| 11 Hardening + Release | **1.0** | Full test suite, security + accessibility + responsive review, backup/restore drill, DR exercise, production build, deploy, pilot onboarding |

**Critical path:** Phase 2 (identity + tenancy) → Phase 3 (shell) → Phase 5 (repair job). Everything branches
off those three.

**Definition of done per task** (`05.txt` §6): migration runs · backend rule exists · API works · page renders
with loading/empty/error/permission states · permissions enforced · tests pass · lint + typecheck pass ·
Playwright journey passes · responsive checked · docs updated · no paid dependency introduced · committed.

---

## 9. CI/CD, security gates, deployment

**CI stages** (from `1.txt` §23–24, `2.txt`, plus Codex's Python additions):
repo validation → locked install → format/lint/typecheck **TS *and* Python** → **architecture-boundary tests**
(specialists must not import specialists; API routes must not import specialists; frontend must not import
`domains/`) → unit (Vitest + pytest) → contract (OpenAPI, events, backward-compat) → integration
(testcontainers: Postgres, Redis, MinIO, Keycloak) → **DB validation** (migration lint, forward, rollback,
drift, seed, **RLS tests**) → security (gitleaks, osv-scanner, pip-audit, semgrep, trivy, IaC, licence) →
build + SBOM (syft) → **E2E** (Playwright journeys + role-access + **tenant-isolation** + **offline**) →
visual regression + axe-core → **MCP contract + agent evaluation** (protocol init, capability negotiation,
schema validation, **prompt-injection corpus**, tool poisoning, unauthorized tool call, cross-tenant,
data exfiltration) → publish signed artifacts + evidence.

**No merge if** tenant-isolation, authorization, migration or approval-gate tests fail.
**No production promotion if** (`05.txt` §7) critical tests fail · permissions bypassable · data crosses
tenant boundaries · core workflows incomplete · mobile unusable · approvals bypassed · MCP tools reach
unrestricted data.


### D7 — BRING-YOUR-OWN-CONNECTION: the user decides how they connect — ✅ OWNER-DIRECTED

**Owner direction 2026-07-25: "allow users to decide how they connect to make the app work for them."**

This is now a governing product principle, and it resolves the remaining cost conflicts more cleanly than
anything the planners proposed. **AutoWorkshop AI does not mandate, bundle or purchase any external
provider or device. It exposes interfaces, and each tenant connects whatever they already own, prefer, or
can afford — including nothing at all.**

The spec already asks for exactly this. `2.txt` (OBD AND DIAGNOSTIC DEVICE INTEGRATION) requires *"a
device-integration interface so additional scanners, oscilloscopes, battery testers, wheel-alignment machines
and tire-pressure monitoring tools can be added later"*, and `1.txt` §12 requires payment integration
*"through secure provider adapters"*. Adapters, not a bundled vendor.

| Capability | Options the tenant chooses from | Platform cost |
|---|---|---|
| **OBD / diagnostics** | Any ELM327 Bluetooth/Wi-Fi/USB adapter they already own · a professional workshop scanner · **file import** of a scanner's CSV/JSON export · **manual DTC entry** · FOSS ELM327 emulator for testing | **£0** — we ship the interface, they bring the device |
| **Payments** | Cash · bank transfer · manually-recorded mobile money · **their own** mobile-money merchant account · **their own** card-provider account | **£0** — tenant's own account, tenant's own fees, entirely their decision |
| **Email** | Platform free-tier allowance · **their own** SMTP server · **their own** provider credentials | **£0** |
| **SMS** | Disabled by default · **their own** SMS gateway credentials if they want it | **£0** |
| **LLM / AI** | Local Ollama (default, free) · **their own** API key for a hosted model if they prefer | **£0** by default |
| **Storage** | Platform-hosted MinIO · **their own** S3-compatible endpoint | **£0** |
| **Deployment** | Self-host anywhere Docker runs — their machine, their VM, their choice | **£0** |

**Why this matters beyond cost.** It also fits the market the specs describe. `3.txt` catalogues users
ranging from a single roadside vulcanizer to a multi-branch enterprise fleet operator. A one-size mandate
would exclude the small technician entirely — exactly the person `3.txt` says the platform exists to bring
into the formal sector. A starter workshop runs on manual entry and cash records; an enterprise connects its
own scanners, payment merchant account and SMS gateway. **Same application, different connections.**

**Engineering consequence.** Every external capability is an interface with a **default zero-cost
implementation** and a **tenant-configurable adapter**. No provider credential is ever hard-coded, bundled or
required to run. Adapter configuration is per-tenant, encrypted, and lives in tenant settings — never in the
platform's own secrets. A tenant that configures nothing still gets a fully working application.

**This closes every remaining cost question in this plan.** The platform's own running cost stays £0; any
spend is a tenant's own choice, made with their own account, on their own terms.


### D8 — ZERO-COST NOW, COMMERCIAL-READY LATER — ✅ OWNER-DIRECTED

**Owner direction 2026-07-25: "after build and test, if we are going commercial we will upgrade to more
commercial infrastructure."**

This sets the sequencing and settles the last open tension in this plan. **Build and test at zero cost. The
upgrade to commercial infrastructure is a later, separate, owner-made decision — triggered by going
commercial, not by an engineering preference.**

It also partly vindicates Codex: its instinct that free-tier infrastructure is not dependable at commercial
scale was sound *engineering*. Where it was wrong was governance — it tried to make that call now, and to
pre-commit the owner to spending. The owner's sequencing is the correct resolution: **Codex's concern is
deferred, not dismissed.**

**Binding design constraint that follows: no free-tier lock-in.** Because a commercial upgrade is a known
future event, the architecture must make it a *configuration change, not a rewrite*. Enforced by:

| Rule | Effect at upgrade time |
|---|---|
| **Everything self-hosted FOSS, nothing proprietary-managed** | Postgres, Redis, Keycloak, MinIO, NATS, coturn all move to bigger hardware unchanged — the *same software*, more resources |
| **Full infrastructure-as-code** (`docker compose` → Helm/K8s manifests already in `infrastructure/`) | Re-point at commercial hosts and redeploy; `1.txt` §26 already names Kubernetes/Helm/Terraform as the scale target |
| **No provider-specific APIs in business logic** (§0.3) | Nothing to unpick — no vendor SDK is embedded anywhere |
| **S3-compatible storage interface** | MinIO → any commercial S3 endpoint by changing an endpoint URL |
| **`packages/search` interface** (C4) | Postgres FTS → OpenSearch without touching call sites |
| **Adapter pattern for every external provider** (D7) | Payments, email, SMS switch on by adding credentials |
| **Standard Postgres, standard WAL** (C3) | Dump/restore or streaming-replicate into managed Postgres; no migration project |
| **Capacity envelope documented** (D6) | The upgrade trigger is measurable — you will *see* which ceiling you hit and size accordingly |

**Practical consequence:** the zero-cost build is not throwaway and not a prototype to be rewritten. It is the
production system, running on free infrastructure, deliberately designed so that scaling it is a hosting
decision rather than a software decision. Nothing built now has to be unbuilt later.

**The upgrade decision point is yours, and only becomes live if the product goes commercial.** Until then the
platform's running cost stays £0.

### D6 — ZERO-COST **CONSTRAINED** PRODUCTION — ✅ OWNER-CONFIRMED · **CODEX OVERRULED ON GOVERNANCE, HEEDED ON ENGINEERING**

**Codex's §9 recommendation ("zero-cost production is a fantasy… call it a pilot, not production… budget for
paid database and compute") is REJECTED.** It contradicts the specification directly, and the owner has
confirmed the policy applies here. Codex is not infallible; this is a case where it was wrong.

The spec states the requirement four times, including as a prohibition and a definition-of-done gate:

| Source | Text |
|---|---|
| `05.txt` §1 | "The implementation shall use **only zero-cost and open-source tools**." |
| `05.txt` §2 | Claude Code shall **not**: "Introduce **paid tools or mandatory paid services**." |
| `05.txt` §6 | Task not complete until: "**No paid dependency has been introduced.**" |
| `05.txt` §8 | "The **first production release** shall provide a secure, professional, responsive and operational platform built **entirely with zero-cost and open-source tools**." |
| `06.txt` | `ADR-012-ZERO-COST-TOOLS.md` · "Only zero-cost tools accepted" · "Zero-cost tool restriction" |

`05.txt` §8 is decisive: the **production release**, not a pilot, must be zero-cost. There is no
pilot/production split to hide behind. **Zero cost is a design constraint, not a phase.**

This is also achievable, because every tool the spec approves is FOSS and self-hostable — Next.js, NestJS,
PostgreSQL, Redis, Keycloak, Storybook, Playwright, Vitest, axe-core, Penpot, **Docker**. The spec approves
Docker precisely so the stack can be self-hosted rather than rented. The correct architecture is therefore
**self-host the FOSS stack on always-free compute**, not **rent managed services and hope the free tier holds**.

### Deployment — zero-cost architecture

**DNS: Namecheap** (owner-confirmed). `aiappinvent.com` is registered there and already serves
`solarpro.aiappinvent.com`. `autoworkshop.aiappinvent.com` is a new record in the same Namecheap zone —
**a separate record pointing at separate infrastructure**, per D2a. TLS via Let's Encrypt (`cert-manager` or
Caddy), the same mechanism already proven on Solar since 2026-06-09.

| Component | Zero-cost solution | Cost |
|---|---|---|
| **DNS** | Namecheap — `autoworkshop` record in the existing `aiappinvent.com` zone | £0 (domain already owned) |
| **TLS** | Let's Encrypt, auto-renew | £0 |
| **Always-on compute** | Single always-free ARM VM running Docker Compose — the self-host target the spec's Docker approval implies | £0 |
| **PostgreSQL** | **Self-hosted Postgres 16 + `pgvector` in Docker.** No expiry, no suspension, no tier games — the failure mode that destroyed Solar cannot occur | £0 |
| **Redis** | Self-hosted in Docker — no per-command quota | £0 |
| **Keycloak** | Self-hosted, **own realm** (D2a) | £0 |
| **Object storage** | Self-hosted **MinIO** (S3-compatible, spec-named in `1.txt` §7) | £0 |
| **TURN relay** | Self-hosted **coturn** on the same VM — removes the *software cost* of the WebRTC blocker. It does **not** remove the bandwidth, public-UDP-reachability or multi-AZ capacity constraint, which §2 still stages | £0 |
| **Search / vector** | Postgres FTS + `pg_trgm` + `pgvector` | £0 |
| **Observability** | Prometheus + Grafana + Loki, self-hosted (Solar's SOC-2 stack) | £0 |
| **Web apps** | Static/SSR on a free static host, or served from the same VM | £0 |
| **LLM** | Local **Ollama** (`llama3.2`, `llava`) via ADK `LiteLlm` — already proven on the Audit Platform | £0 |
| **CI/CD** | GitHub Actions free tier | £0 |
| **Email** | Free-tier transactional provider (or SMTP relay) | £0 |
| **Backups** | **Continuous WAL archiving → PITR**, encrypted physical (`pg_basebackup`) + logical (`pg_dump -Fc`) + Keycloak realm, checksummed, **encrypted off-host copy under separate bucket-scoped credentials**, retention, scheduled restore drill | £0 |

**Zero-cost correction (owner direction):** an earlier draft proposed buying an ELM327 dongle. **That was a
breach of the zero-cost policy and is withdrawn — no purchase is proposed or required.** The live OBD path is
tested against an **open-source ELM327 emulator** which emulates the adapter over serial/TCP and replays
recorded vehicle data. Pilot workshops in `2.txt`'s pilot group already own scanners if real-vehicle
validation is ever wanted, at no cost to this project. **No hardware is bought.**

**Consequence for §2 — corrected after Supervisor audit.** My earlier claim that coturn made WebRTC
"fully buildable with no staged tail" was **overclaiming, and is withdrawn**. Self-hosting coturn removes the
TURN *licence and service* cost — it does not remove bandwidth, public UDP reachability, abuse-control or
multi-AZ resilience constraints. `1.txt` §26 names "TURN servers in more than one availability zone" and §62
names "TURN capacity limits" as monitored concerns. Correct position: **zero-cost TURN at limited capacity,
with quotas, abuse controls, UDP/TCP/TLS fallback, monitoring and a documented degradation path.**

**Capacity envelope — this is constrained production, not unlimited production.**
Per the Supervisor: the correct position is *"zero-cost production must be narrowly capacity-scoped and
operationally constrained"* — not Codex's blanket "budget for paid services", but not an unqualified promise
either. Documented ceiling, budget guards and alerts at 80% of every quota:

| Resource | Free ceiling | Guard |
|---|---|---|
| Always-free ARM compute | small ARM instance; **capacity shortages and idle reclaim are documented provider behaviour** | keep-alive checks; full IaC rebuild; off-VM backups |
| Block storage | ~200 GB | media quotas per tenant; lifecycle expiry on raw uploads |
| Object storage (off-VM copy) | ~10 GB/month free tier | backup rotation + compression; alert at 8 GB |
| Outbound transfer | ~10 TB/month | TURN relay quotas; per-tenant media caps |
| CI minutes | finite on private repos | keep the repo lean; cache aggressively |

**Signup assumption:** the always-free tier requires one-time account creation with card verification
(not charged). **This is a prerequisite the owner must complete before Phase 1** — the whole architecture
rests on it. Regional ARM capacity can be scarce; if unavailable, fall back to a second always-free provider
or Docker-on-local-host for development while the account is provisioned.

**Honest risks of this approach — stated, not hidden:**
1. Always-free tiers require card verification (not charged) and can reclaim idle instances → keep-alive
   health checks + **off-VM nightly backups** so reclamation is recoverable, never fatal.
2. Single VM = single point of failure. Mitigated by: infrastructure-as-code so the whole stack rebuilds from
   `docker compose up`, off-VM backups, and a documented restore runbook — **tested monthly, not assumed**.
3. Resource ceiling. Postgres + Keycloak + Redis + MinIO + coturn + observability on one host is comfortable
   at pilot scale and will need a second node at real scale. That is a **success problem**, and the IaC makes
   it a config change rather than a migration.

**Backups run from day one, not Phase 11** — **continuous WAL archiving and point-in-time recovery**, not a
nightly logical dump. A nightly dump does not meet the source spec's RPO and C3 (§14) corrected it; this row
previously still said "nightly logical dump", so anyone implementing from the deployment table would have
built the weaker system the correction rejected. Off-host encrypted copy under separate credentials, and a
**scheduled** restore drill recording achieved RPO/RTO.

**Status — this is built, not planned.** T-0008 delivered it on 2026-07-26 and the drill passes 4/4 with
RPO 0. The work also proved the danger this row is guarding against: WAL archiving had *never once* succeeded
while every setting read back correct. Solar's 2026-07-09 destruction by an expiring free Postgres with no
backups is the original argument, and self-hosting removes the expiry vector that caused it.

---

## 10. Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | Full structural scope is large | Fixed sequence, independently shippable releases, velocity measured at Phase 1 before any date is quoted |
| 2 | Free-tier data loss (already killed Solar once) | **Self-hosted Postgres — no expiry/suspension vector at all**; off-VM nightly dump from day 1; monthly restore drill; alert on backup age |
| 3 | Keycloak hosting/complexity | Mandatory; self-hosted in Docker on always-free compute with its **own realm**; simple realm/client/role model; realm exports reviewed in CI |
| 4 | Prompt injection via untrusted uploads (this app ingests them by design) | Untrusted tagging, Gateway scan, allowlist, C/D gated, standing CI corpus |
| 5 | Cross-tenant leakage across 13 domains × 7 apps × 19 MCP servers | RLS FORCE everywhere + tenant-isolation E2E as a blocking gate + object/cache/index prefixing + single resolved tenant context |
| 6 | Python/TypeScript contract drift | OpenAPI contracts, shared JSON schemas, generated clients, versioned npm + pip packages, contract tests in CI |
| 7 | Unsafe AI repair instruction followed by a technician | Safety agent reviews high-risk output; RAG grounded on *approved* content only; technician approval before any customer-facing proposal; confidence + sources on every output |
| 8 | Content licensing (OEM diagrams, 3D geometry) | Ship containers + tooling, not copyrighted content; owned/licensed/user-generated only |
| 9 | Media storage cost explosion (video complaints) | Per-tenant quotas, transcode-and-downscale on ingest, lifecycle expiry on raw uploads, quota alerts |
| 10 | Solo-developer context loss across a long programme | `.claude/SESSION_HANDOVER.md` every session; ADRs for every decision; docs written per-phase |
| 11 | Accidental Solar entanglement | D2a boundaries + the deletion test enforced in review |
| 12 | Always-free VM reclaimed / single point of failure | Full IaC (`docker compose up` rebuilds everything) + off-VM nightly backups + keep-alive health checks + **monthly tested** restore runbook |

---

## 11. Environment bootstrap  *(Codex correction #11)*

Verified on this machine 2026-07-25:

| Tool | Status |
|---|---|
| Node | ✅ 20.19.2 |
| npm | ✅ 10.8.2 |
| Python | ✅ 3.14.4 |
| **google-adk** | ✅ **2.2.0 imports cleanly on 3.14.4** — pin 3.14.4 locally *(correction #9: v1's "Python 3.12" was wrong)* |
| Docker | ✅ 29.4.3 |
| Ollama | ✅ 0.24.0 |
| Git | ✅ 2.53.0 |
| **pnpm** | ❌ **NOT INSTALLED** — `corepack enable && corepack prepare pnpm@latest --activate` is step 0 of Phase 1 *(correction #8)* |

---

## 12. Adjudication record

| # | Question | Winner | Governing evidence |
|---|---|---|---|
| 1 | Restore full scope? | **Claude** | Owner direction; `1.txt` §5/§66, `2.txt` CV/sound/OBD/3D/offline sections |
| 2 | 7 web apps or 1? | **Claude — 7** | `01 (1).txt` §86 lists all seven explicitly |
| 3 | MCP rollout | **Claude structure, Codex correction** | All 19 skeletons day one; `0.txt` §11, §12, §35 |
| 4 | Keycloak vs JWT fallback | **Codex — Keycloak mandatory** | `05.txt` §1, §3; `1.txt` §11 |
| 5 | Solar boundary | **Claude, tightened** | Owner direction; separate *realm* not client |
| 6 | Database for pilot | **Codex — not Render free** | `1.txt` §30–37 recoverability; Render free Postgres expires at 30 days |

**Codex verdict on Claude v1:** `PASS WITH CORRECTIONS`. All 14 corrections applied.

---

## 13. Open questions for the owner

0. ~~Product name~~ — **CLOSED**: `autoworkshop.aiappinvent.com` / AutoWorkshop AI.
0. ~~Scope deferrals~~ — **CLOSED**: build everything; stage only licensed content + TURN bandwidth + OBD hardware.
0. ~~Pilot vs production hosting budget~~ — **CLOSED**: zero-cost is a hard spec requirement (`05.txt` §8),
   owner-confirmed. Self-hosted FOSS stack on always-free compute. Codex's "budget for paid services"
   recommendation is overruled. See D6.
0. ~~TURN relay~~ — **CLOSED as a COST question**: self-hosted `coturn` on the same VM, £0. **The capacity
   tail remains staged** per §2 — bandwidth, public UDP reachability and multi-AZ resilience are not solved
   by removing the licence fee, and a single coturn VM must not be treated as production-complete.
0. ~~OBD hardware~~ — **CLOSED, and the ask was withdrawn as a zero-cost breach.** No dongle is bought.
   Live-session testing uses an open-source ELM327 emulator. **Nothing to purchase.**
1. **Where should the self-hosted stack run?** The architecture needs one always-on Docker host. Zero-cost
   options, **owner's choice — I will not commit you to any of them**:
   (a) an always-free cloud VM (signup requires card *verification*, never a charge — flagged because it is
       your decision, not mine); (b) an existing machine you already own/run; (c) local Docker on this
       workstation for development while you decide. **No option requires spending.**

**Standing rule added to this plan: I do not propose purchases. If something appears to need money, I bring
you the zero-cost alternative or flag it as blocked — the spend decision is yours alone.**

**Per D7, external providers are never the platform's cost or choice: each tenant connects their own device,
merchant account, SMTP server or API key if they want one, and the app works fully without any of them.**

---

## 14. Supervisor must-fix conditions — applied

Supervisor verdict on v2: **`PASS WITH CONDITIONS`**. All 8 applied. Conditions 1–2 are patched in place
above (D6 capacity envelope; WebRTC overclaim withdrawn). Conditions 3–8 follow.

### C3 — Backup design upgraded to meet spec RPO *(was below spec)*

The Supervisor was right: nightly `pg_dump` does not satisfy `1.txt` §29 (**RPO ≤ 5 minutes** for critical
databases) nor §30–§37's layered model. Corrected, in place **before Phase 1 completes** — all FOSS, zero cost:

| Layer | Mechanism | Meets |
|---|---|---|
| Continuous | **WAL archiving → PITR** (`pgBackRest` or `wal-g` — both FOSS) | §29 RPO ≤ 5 min; §30 |
| Daily | Encrypted physical base backup | §32 |
| Daily | Logical export of critical schemas | §32 |
| Weekly | Full physical backup | §32 |
| Off-host | Encrypted copy to free object storage, **separate credentials** | §34, 3-2-1-1-0 |
| Immutable | Object-lock / offline-protected copy of the weekly | §31 |
| Versioning | Object-storage versioning + deletion protection | §30 |
| Pre-migration | Automatic verified backup before any high-risk migration | §32 |
| Keycloak | Realm + config export daily and after any change | §32 |
| Object store | Inventory + integrity report daily; restore path tested | §30, §35 |
| Retention | WAL 7d · daily 35d · weekly 12w · monthly 12m | §33 |
| **Validation** | **Monthly restore drill recording actual achieved RPO/RTO** — a backup never restored is not a backup | §36, §37 |

Backup encryption keys live **outside** the host being backed up (§34).

### C4 — ADR-014: event broker and search *(silently dropped in v2)*

`1.txt` §6/§66 names **RabbitMQ or NATS** for domain events; §7/§66 names **OpenSearch** for catalogue and
knowledge search. v2 silently substituted Redis/BullMQ and Postgres FTS. That may be right, but it must be a
recorded decision, not a silent drop. Both NATS and OpenSearch are FOSS and self-hostable — neither conflicts
with zero cost.

- **Domain events → NATS** (self-hosted; far lighter than RabbitMQ, fits the capacity envelope). BullMQ is
  retained only for short-lived background jobs, which is what it is for.
- **Search → Postgres FTS + `pg_trgm` + `pgvector` initially**, behind a `packages/search` interface, with
  **OpenSearch as the declared target** once capacity allows. The domain-event and search *contracts* are not
  dropped — only the current implementation is provisional, and swapping it is config, not a rewrite.

### C5 — Media security boundary *(hard requirement, before Phase 4)*

Required by `1.txt` §17, `2.txt` MEDIA PIPELINE, `3.txt` security additions. This app ingests untrusted
customer audio, images and video **by design** — the largest attack surface in the system.

Mandatory pipeline, no exceptions: **quarantine bucket on upload** → authenticated + tenant-assigned →
extension allowlist → **MIME/magic-byte sniffing** (never trust the declared type) → **decompression and size
limits** (archive-bomb defence) → malware scan → **EXIF/metadata stripping** → transcode in a **sandboxed
worker** (no network egress, no credentials, resource-capped) → integrity hash → private bucket → access only
via **short-lived signed URLs**, never public links.

**Hard rule: raw untrusted media never becomes agent-readable context.** Nothing reaches RAG or an LLM prompt
until it has cleared the pipeline and been marked safe. Files failing validation stay quarantined and are
never served. This closes the prompt-injection-via-upload path.

### C6 — Zero-cost payment, email, SMS and notification adapters

`1.txt` §12 requires payment-provider adapters and `2.txt` requires card/mobile-money support — both paid
services, colliding with `05.txt` §2's "no mandatory paid services".

**Resolution — full structure, no mandatory paid dependency:** all financial *records* (quotations, invoices,
deposits, balances, refunds, settlements, reconciliation) are first-class and fully built. Settlement methods
for first production are **cash, bank transfer and manually-recorded mobile money** — recorded, audited,
reconciled, zero cost. Card and automated mobile-money integration are built as **adapters behind an
interface**, tested against sandbox credentials, and **enabled only if the owner ever chooses to opt into a
paid provider. That is the owner's decision, never mine.** No paid provider is required for first production.

Email uses a free-tier allowance or SMTP relay. **SMS has no free tier**, so notifications degrade to
in-app + email + push, with the SMS adapter built but disabled. Templates are approved and version-controlled.

### C7 — AI/MCP boundary enforced in infrastructure, not policy text

"Agents don't touch the database" written in a document is not a control. Enforced concretely:

- The `agent-host` container is issued **no** database, object-storage, payment or admin-API credentials —
  they are absent from its environment entirely
- **Restricted egress**: agent containers reach the MCP Gateway and the local LLM endpoint, nothing else
- **Network segmentation** per `0.txt` §36 — AI host / gateway / MCP server / business service / database
  networks separated; MCP servers accept no public traffic
- **Signed tool registry** + per-agent MCP server allowlist at the Gateway
- Each MCP server runs under its own workload identity with only the secrets its function needs (`0.txt` §37)
- **Negative tests are a CI gate**: an agent container attempting a direct Postgres, object-store or payment
  connection must *fail*, and the test asserts that failure

### C8 — Mobile and offline test gates made explicit

Blocking CI gates per `2.txt` mobile testing + OFFLINE-FIRST OPERATION: Android camera capture · audio
recording · **encrypted offline queue** · sync conflict resolution (no duplicate invoices, no duplicated parts
issuance, no contradictory job-status updates) · low-bandwidth mode · offline E2E journeys · notification
delivery · selective content download (large video and 3D never auto-downloaded).

---

## 15. Quality chain — final status

| Gate | Outcome |
|---|---|
| Claude plan v1 | Drafted from 10 spec files, independently |
| Codex plan v1 | Drafted from the same 10 files, independently, without sight of Claude's |
| **Codex adjudication** | **`PASS WITH CORRECTIONS`** — 14 corrections, all applied |
| Owner directions | 8 issued mid-process, all binding, all incorporated (D1, D2a, scope, D6, D7, D8) |
| **Supervisor adjudication** | **`PASS WITH CONDITIONS`** — 8 conditions, all applied (§14) |

**Corrections the reviewers and the owner made to my work — recorded honestly:**

1. Codex — Keycloak is mandatory; my JWT fallback was wrong (`05.txt` §1/§3, `1.txt` §11)
2. Codex — I missed the mobile app, offline-first sync and multilingual architecture entirely
3. Codex — I overstated FFT sound analysis as deterministic; it yields candidate leads only
4. Codex — Render free Postgres is unfit for persistence (the Solar failure vector)
5. **Codex was itself wrong** on zero-cost production, contradicting `05.txt` §8 — overruled
6. Supervisor — I overclaimed "WebRTC fully buildable, no staged tail"; withdrawn (C2)
7. Supervisor — my nightly `pg_dump` was below the spec's 5-minute RPO; upgraded to WAL/PITR (C3)
8. Supervisor — I silently dropped NATS and OpenSearch; now a recorded ADR (C4)
9. **Owner — I proposed buying an OBD dongle. That breached the zero-cost policy and was not my decision
   to make. Withdrawn; replaced with a FOSS ELM327 emulator. Standing rule added: I do not propose spending.**

**Zero-cost compliance statement:** every component in this plan is FOSS or free-tier. Nothing in it requires
a purchase, a subscription, or a paid dependency. Where the spec references a paid capability (card payments,
SMS), it is built as a disabled adapter behind an interface, and enabling it is the owner's decision alone.
Per **D7**, external providers are the tenant's own choice and cost; per **D8**, the platform is built
upgrade-ready so that moving to commercial infrastructure later is a hosting change, not a rewrite.

---

## 16. Ready to build

All **review** gates are complete. Phase 1, Release 0.1 is unblocked and can begin on the owner's word.

**The open hosting question does not block Phase 1.** Development runs entirely on local Docker; the
always-free host account is a prerequisite for *deployment*, not for building. It becomes blocking at the
first release that must be reachable from outside this machine. Stated explicitly because §9 calls the host
a "prerequisite the owner must complete before Phase 1" while §13 leaves the choice open — two readings of
the same fact.


1. `corepack enable && corepack prepare pnpm@latest --activate` (only missing tool)
2. `Documents\\autoworkshop-ai\\` · `git init` · protected `main`
3. Seed Project OS (`CLAUDE.md` + `context.MD`) and Agentic ADK Extension (`seed_agentic_adk.sh`)
4. pnpm + Turborepo workspace; `apps/` + `packages/` + `python-packages/` skeleton
5. 7 Next.js apps scaffolded; NestJS `api`; Postgres + Redis + MinIO + NATS via `docker compose`
6. `packages/design-tokens` + Storybook
7. GitHub Actions CI skeleton (stages 1–4 live, remainder stubbed)
8. The ~25 seed docs from `06.txt` + `.claude/` control files
9. **ADR-001…014**, including ADR-007 (Penpot), ADR-012 (zero-cost), ADR-013 (ADK+MCP), ADR-014 (NATS/OpenSearch)
10. Tag `v0.1.0`
