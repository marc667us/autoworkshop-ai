# Tenant isolation

The highest-severity concern in the platform. Cross-tenant exposure is a Severity-1 incident.

## Six enforcement layers

No single control is trusted.

| # | Layer | Mechanism |
|---|---|---|
| 1 | Request context | NestJS request-scoped tenant context from **validated Keycloak claims + membership records only** |
| 2 | Repository | Every query carries a tenant filter |
| 3 | Database | PostgreSQL `ENABLE` + **`FORCE ROW LEVEL SECURITY`** on every tenant-owned table |
| 4 | Object storage | Tenant path prefixing; access only by short-lived signed URL |
| 5 | Search | Tenant filter applied to every index query |
| 6 | Cache | Tenant-prefixed Redis keys |

Domain event messages carry tenant metadata.

## The rule that matters most

**A client-supplied tenant identifier is never trusted** (`1.txt` §9: "The gateway must never trust a
tenant identifier supplied only by the client"). Every request resolves **exactly one** active tenant
context, server-side, from validated identity.

## The application must NEVER connect as a superuser

**`ENABLE` + `FORCE ROW LEVEL SECURITY` is necessary but not sufficient. A superuser bypasses RLS
entirely, even with `FORCE`.** An application connecting as the bootstrap `POSTGRES_USER` role would have
every policy present and none of them applied — isolation silently switched off.

This was found by running the proof against a live database: tenant A could see 2 organizations when it
should have seen 1. The policies were correct; the connecting role was wrong.

| Role | Superuser | BYPASSRLS | Use |
|---|---|---|---|
| `autoworkshop` | yes | yes | **Migrations only.** Never the application. |
| `autoworkshop_app` | **no** | **no** | The application connects as this, always. |

`autoworkshop_app` is created by migration 002 with `NOSUPERUSER NOBYPASSRLS` and DML-only grants — no
DDL, because schema change belongs to migrations, not to a running application.

**The isolation proof runs as `autoworkshop_app` for the same reason: a proof run as a superuser proves
nothing at all.**

## Transaction-local settings

```sql
SET LOCAL app.tenant_id        = '<uuid>';
SET LOCAL app.user_id          = '<uuid>';
SET LOCAL app.current_role     = '<role>';
SET LOCAL app.organization_ids = '<csv>';
SET LOCAL app.branch_ids       = '<csv>';
```

RLS policies compare row ownership against these. **Seeding must set `app.current_role` explicitly** —
`set_config('app.current_role','admin',true)` — or inserts fail silently under RLS. This cost Solar real
debugging time; it is written down so it is not relearned.

## Testing

Tenant-isolation tests are a **blocking CI gate**. They assert that tenant A cannot read, write, list,
search, or receive events for tenant B's data through any route — REST, MCP tool, search index, object
storage or cache.

## MCP

MCP servers resolve tenant context per request and re-check it in the domain service. `MCP_TENANT_MISMATCH`
is a defined error (`0.txt` §31). Cross-tenant rejection rate is a monitored metric (`0.txt` §32).
