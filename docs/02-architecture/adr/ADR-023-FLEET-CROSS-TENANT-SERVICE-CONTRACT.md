# ADR-023 — The fleet ↔ workshop cross-tenant service contract

**Date:** 2026-08-19
**Status:** Accepted
**Supersedes:** nothing. **Depends on:** ADR-020 (fleet reads workshop data through its own memberships), migrations 075/076 (the fleet registration door).

---

## Context

Fleet is the largest measured hole in the product. Re-measured today before writing a line:

| Fact | Value | How |
|---|---|---|
| `fleet` database schema | **does not exist** | `grep 'CREATE SCHEMA.*fleet' infrastructure/migrations/*.sql` |
| `fleet` API module | **does not exist** | `ls apps/api/src/` — 33 modules, no `fleet` |
| Fleet screens | **1 of 29 (3%)**, 28 dead ends | `node scripts/audit-menu-coverage.mjs --all` |
| What 075/076 built | `identity.register_fleet` and nothing else | `grep 'CREATE.*FUNCTION' 075 076` |

So a fleet can register, sign in, and reach one dashboard. Everything the workspace advertises — vehicles, drivers, service requests, quotations, approvals, costs — has nothing behind it.

**The hard part is not volume. It is that a fleet is its own tenant.**
`076_fleet_registration_race.sql:140` gives every fleet its own `identity.tenants` row and a `fleet_operator` organisation. A fleet asking an independent workshop to service a van is therefore a **cross-tenant act**, and this platform's entire isolation model — `(x, tenant_id, organization_id)` foreign keys, RLS predicates on `current_tenant_id()` — is built to make exactly that impossible.

A design that ignores this produces one of two failures, both of which this repository has already recorded in other forms:

- **Model the request inside the workshop's tenant** → the fleet cannot see its own request. The read half is missing, which is the shape found four times in one day on 2026-08-17.
- **Model it inside the fleet's tenant** → the workshop cannot see the work it has been asked to do. Same defect, mirrored.

---

## Decision

### 1. There is no `fleet.vehicles`. Fleet vehicles are `core.vehicles`.

`core.vehicles` (`004_core_customers_and_vehicles.sql:140`) already owns registration number, VIN, make, model, variant, model year, engine/transmission/fuel type, mileage, colour, insurer, policy number, policy expiry and lifecycle status — plus per-organisation uniqueness on registration and VIN from migration 005.

A second vehicle table would duplicate vehicle identity and guarantee divergent records: the same van, two rows, two mileages, two insurance expiry dates, and no answer to which is true.

> **Towing is the proof of this rule, not the counter-example.** `towing.recovery_vehicles` are the operator's own **tow trucks** — plant, not customer vehicles — while towing *requests* already reference `core.vehicles`. The distinction is ownership of the identity, not which workspace looks at it.

**⚠️ The consequence, stated because it is not free.** `core.vehicles.customer_id` is **NOT NULL**. A fleet's vehicles therefore hang off a `core.customers` row **in the fleet's own tenant and organisation**, created once at registration and representing the fleet as its own customer of record. That is mildly odd to read and it is the honest shape: the alternative is making `customer_id` nullable, which would weaken a NOT NULL that every workshop query relies on, for the benefit of one caller.

### 2. `fleet.service_requests` is the contract, and it is deliberately not tenant-scoped in the usual way.

It is the **only** table in the fleet schema that both organisations can see, and it carries both sides explicitly:

| Side | Columns | Key tier (19c) |
|---|---|---|
| Fleet (requester) | `fleet_tenant_id`, `fleet_organization_id` | **2 columns** → `identity.organizations(id, tenant_id)` |
| Vehicle | `vehicle_id` + the two fleet columns | **3 columns** → `core.vehicles(id, tenant_id, organization_id)` |
| Workshop (asked) | `workshop_directory_id` | **1 column** → `catalogue.mechanic_directory(id)` |
| Workshop, for RLS | `workshop_organization_id` | **no FK** — denormalised, trigger-maintained |

**The workshop is referenced through its PUBLIC DIRECTORY ROW, not through `identity.organizations`.** This is not invented here — it is the shape `catalogue.orders` already uses for the buyer↔supplier relationship (`supplier_id → catalogue.suppliers(id)`), and `catalogue.mechanic_directory` is the workshop's equivalent public row: platform-level, not tenant-scoped, `is_published` gated, one per organisation (`uq_directory_org`).

Referencing the directory rather than the identity organisation means a fleet can only address a workshop **that has chosen to be publicly listed**. Discoverability and addressability become the same decision, made by the workshop, rather than a fleet being able to name any organisation id it can guess.

### 3. Snapshots cross the boundary. Foreign keys do not.

`fleet_name`, `workshop_name`, `vehicle_registration` and `vehicle_description` are **copied onto the request** at creation.

This is the mechanism that makes the contract work at all: the workshop must be able to read what it has been asked to do **without joining into the fleet's tenant**, which RLS forbids and should forbid. A join would either return zero rows (the 084 failure — "a join silently re-imposes the strictest policy in the chain and does it by returning fewer rows rather than by failing") or require opening the fleet's data to the workshop wholesale.

It is also correct on its own terms, for the reason `catalogue.orders` gives for `supplier_name`: *"a supplier rename must not silently rewrite a placed order."* A fleet that re-registers a van must not rewrite the history of what a workshop was asked to work on.

**⚠️ The disclosure boundary is therefore explicit and narrow.** The workshop learns: which fleet, which registration, a description, and what was asked. It does not learn the fleet's other vehicles, its drivers, its costs, its other workshops, or its users. Nothing on this table exposes them, and there is no join that could.

### 4. RLS admits the two sides by two different predicates.

```
fleet side      : fleet_tenant_id = current_tenant_id()
                  AND fleet_organization_id = current_organization_id()
workshop side   : workshop_organization_id = current_organization_id()
platform admin  : identity.is_platform_admin()
```

Permissive policies OR together, so each party sees exactly its own rows and neither sees the other's unrelated work. **The workshop-side predicate is the one that does not fit the house pattern**, and it is why this table cannot simply reuse the standard tenant-isolation policy: it is scoped by organisation *without* a tenant match, because the tenants genuinely differ.

### 5. What this does NOT create.

- **No second financial source of truth.** `finance.invoices` owns invoices. Fleet cost screens read `finance`; they do not shadow it.
- **No second approvals mechanism.** `apps/api/src/authz/approval-limits.ts` already exists and already enforces `core.approval_limits`. Fleet approval limits extend that module and that table.
- **No fleet-side copy of repair progress.** Repair state lives in the workshop's tenant where the work happens. The fleet sees the request's own lifecycle, and detail is disclosed by the workshop advancing that lifecycle — not by the fleet reading into the workshop.

### 6. Lifecycle: only states someone can actually assert.

`draft → submitted → accepted → declined → in_progress → completed → cancelled`

Each transition has an actor who can observe it: the fleet submits and may cancel; the workshop accepts, declines, starts and completes. Following `catalogue.orders`' rule — *"there is no `out_for_delivery` because nothing in this system can observe it, and a state we cannot set is a state that gets stuck"* — there is no `awaiting_parts`, no `quality_check`, no `ready_for_collection`. Those are workshop-internal states that already exist on the job card, in the workshop's tenant.

**If either party is suspended**, the request keeps its state. Suspension is an identity concern and is enforced where memberships are resolved; freezing or deleting contract rows would rewrite a shared record that the other party also relies on.

---

## Consequences

**Good.** Vehicle identity has one home. The workshop↔fleet relationship reuses the directory shape the platform already has. The disclosure boundary is a property of the schema rather than of query discipline. The fleet workspace has a data layer to build 28 screens on.

**Costs, stated.**

- A fleet must exist as a `core.customers` row in its own tenant. One extra row per fleet, created at registration.
- `workshop_organization_id` is denormalised. It is trigger-maintained from the directory row, following 084's `set_insurer_name` precedent, because *"a denormalised value the service is trusted to populate is one that will one day be missing or stale, and the failure is invisible."*
- The workshop-side RLS predicate is organisation-scoped without a tenant match. That is a deliberate exception and is the single most security-sensitive line in the slice, so `verify/087` exercises it from **both** directions and from a third, unrelated organisation.

**Rejected alternatives.**

1. **A `fleet.vehicles` table.** Duplicates vehicle identity — see decision 1.
2. **Put the request in the workshop's tenant, with a fleet "view".** The fleet cannot read its own request without a cross-tenant read, which is the thing being avoided; it moves the problem rather than solving it.
3. **A shared "platform" tenant that both parties join.** Every isolation predicate in the codebase would need a special case, and a tenant that everyone belongs to is not a tenant.
4. **FK straight to `identity.organizations` for the workshop.** Lets a fleet address any organisation whose id it can obtain, including unlisted ones and non-workshops. The directory is the workshop's own opt-in.

---

## How this is proven

- `infrastructure/migrations/verify/087_*.sql` — the boundary, run as `autoworkshop_app`: the fleet sees its own request, the workshop sees the same row, a **third** organisation sees neither, and the workshop cannot reach the fleet's vehicles.
- `apps/api/src/fleet/*.integration.spec.ts` — the service half, which SQL cannot establish: role gating, and that a refusal names a reachable alternative.
