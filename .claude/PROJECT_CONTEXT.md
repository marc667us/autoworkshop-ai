# Project context — AutoWorkshop AI

**Product:** AutoWorkshop AI · `autoworkshop.aiappinvent.com` (Namecheap DNS)
**Repo:** https://github.com/marc667us/autoworkshop-ai (public, `master` + `develop`)
**Approved plan:** `C:\Users\USER\Documents\autoworkshop app\_plan\COMBINED_PLAN_v2.md`

## Quality chain that approved this plan

| Gate | Verdict |
|---|---|
| Codex Reviewer | `PASS WITH CORRECTIONS` — 14 applied |
| Supervisor | `PASS WITH CONDITIONS` — 8 applied |

## Non-negotiables

1. **Zero cost, including production** (ADR-012). Never introduce a paid dependency. Never propose spending.
2. **Solar non-entanglement** (ADR-011). Separate repo, DB, realm, deploy, secrets, CI. Never edit Solar's
   `web_app.py`, `wsgi.py` or templates. Test: *if Solar were deleted, would this still build?*
3. **Agents never touch the database** (ADR-010). MCP Gateway -> MCP server -> NestJS domain service.
4. **Build everything structurally.** The owner rejected all scope cuts. Only licensed content and labelled
   ML corpora are staged.
5. **Tenant isolation is Severity-1.** RLS FORCE everywhere; isolation tests are a blocking gate.

## Stack

Next.js · NestJS · PostgreSQL+pgvector · Redis · NATS · MinIO · Keycloak · coturn · Google ADK (Python) ·
Ollama · Penpot · Storybook · Playwright · Vitest · axe-core · Docker.
