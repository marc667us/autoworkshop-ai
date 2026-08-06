# 🔴 Severity-1 finding — RLS policies on migrations 001–044 carry NO organisation predicate

**Found 2026-08-06** while scoping LIST A item A2. Not fixed. This document exists
so the finding survives the session that found it.

## The finding, measured not inferred

Every RLS policy written before migration 045 is **tenant-scoped only**:

```sql
-- the 001–044 shape (finance 042, warranty 043, parts 044, reception 041, …)
CREATE POLICY tenant_select ON finance.invoices FOR SELECT USING
  (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
```

Migration 045 onwards uses the correct shape:

```sql
-- the 045+ shape
CREATE POLICY org_select ON core.opening_hours FOR SELECT USING
  (identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id()
   AND organization_id = identity.current_organization_id()))
```

Counted across every migration that creates a policy:

| Migrations | Policies | Using `current_organization_id()` |
|---|---:|---:|
| 001–044 (except 027/028/029) | ~100 | **0** |
| 045–052 | 22 | 22 |

The exceptions (027, 028, 029) are the mechanic-directory and pricing policies,
which were written with the organisation predicate for their own reasons.

## Why it matters

`COMPLETION_PLAN.md` §4 item 1 requires **both** a tenant and an organisation
predicate, and states plainly: *tenant alone is not isolation here.* The reason is
that **a tenant in this database holds more than one organisation** — verify/045
builds a second organisation precisely so its isolation checks are not vacuous.

So for every table created by 001–044, the database's second line of defence
stops at the tenant boundary. Two workshops under one tenant are separated by the
**application layer alone** — which does carry `AND organization_id = $2` almost
everywhere, so this is a **missing second line of defence, not an open door**.
That is the same conclusion Solar reached about its own `ENABLE`-without-`FORCE`
gap, and it was still worth closing there.

Affected: `core.customers`, `core.vehicles`, all of `repair.*` (job cards,
inspections, diagnoses, plans, quotations, proposals, execution, testing, QC,
variations), `finance.*`, `warranty.*`, `parts.*`, `reception.*`, `media.*`.

## ⚠️ DO NOT APPLY THIS BLIND — the three things that will break

`identity.current_organization_id()` reads `app.organization_ids` and returns
NULL when unset. `organization_id = NULL` is NULL, so the policy is FALSE and the
read is refused. Anything running without an organisation context breaks:

1. **`withUser()`** — the marketplace buyer path. Sets only `app.user_id`, by
   design (migration 022: a private buyer has no workshop). Tables it touches
   must NOT get an organisation predicate.
2. **`queryWithoutTenant()`** — health checks, the migrations ledger, and the
   PUBLIC catalogue (021) and public workshop profile. verify/045 check 9 asserts
   published opening hours are readable with no tenant context at all.
3. **The registration bootstrap** (037/038). `register_workshop` INSERTs the
   organisation before any context naming it exists.

`withTenant()` — the path every `TenantGuard` route uses — **does** set
`app.organization_ids` (`tenancy/tenant-context.ts:221`), so tables reached only
through it are safe to retrofit. That is the workshop business schema, and it is
the set worth doing.

## How to do it

1. Build the table list from tables reached **only** via `withTenant`. Exclude
   `identity.*` bootstrap tables, `public.*` catalogue, `marketplace.*`,
   `supplier.*`.
2. One migration, driven by that list, using 045's exact `org_select` /
   `org_insert` / `org_update` / `org_delete` block.
3. A verify that **builds two organisations in one tenant** and asserts a row in
   A is invisible from B — the assertion that is impossible to make today.
   Prove it non-inert by injecting a tenant-only policy and watching it fail.
4. **Rehearse on live first.** Local is superuser and will prove nothing about
   whether the app role can still read its own rows.

## Related

`feedback_a_check_that_walks_through_its_own_gap` ·
LIST A item A4 (the systematic tenant-isolation suite) — this finding is what
that suite would have caught, and building the suite first would be a reasonable
way to sequence it.
