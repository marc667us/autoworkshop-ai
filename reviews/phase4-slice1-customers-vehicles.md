# Phase 4 slice 1 — customers and vehicles · review record

Date: 2026-07-28 · Tip at review: staged working tree on `master`

## Gate 1 — Codex CLI

Scope: the staged diff only, with `docs/*.md` and older logs excluded by name and
per-claim evidence demanded (see `feedback_codex_stale_artifact_distraction`).

**2 findings, both ACCEPTED and FIXED.**

### P1 — reads were tenant-scoped, not organization-scoped

`CustomerService.list/findById` and `VehicleService.list/findById/readOne`
filtered only on `tenant_id`, and the vehicle `create` parent lookup did the
same. But migration 004 makes these records ORGANIZATION-owned, and
`01 (1).txt` §19 says "Workshop staff shall see **organizational** customer
records" — a line quoted in the migration's own comments.

So in a tenant holding more than one organisation, a member of one could list
the other's customers and vehicles, and could attach a vehicle to the other's
customer. RLS does not catch it: both rows are in the same tenant, so the policy
is satisfied. This was a genuine gap between the documented intent and the
implementation.

**Fixed:** `organization_id = ctx.organizationId` added to every read and to both
parent lookups. Pinned by `core.spec.ts` — *"scopes reads to the ACTIVE
ORGANIZATION, not just the tenant"*.

### P2 — malformed body ids reached SQL as a 500

Only the `customerId` QUERY parameter carried `ParseUUIDPipe`. The ids in a POST
body did not, so a malformed `customerId`, `makeId` or `modelId` reached a
comparison against a `uuid` column and PostgreSQL raised `22P02` — surfacing as
a 500 that reads like an outage, for what is a bad field. The same applied to the
CHECK-constrained columns.

**Fixed:** `apps/api/src/core/validate.ts`, applied in the SERVICE and not in a
controller pipe — `0.txt` §13/§26 means an MCP tool calls the same service, so a
rule enforced only by a controller does not exist for an agent. Pinned by three
`it.each` cases asserting a 400 **and zero queries issued**.

## Gate 2 — Supervisor, run INDEPENDENTLY

Run separately rather than as a rubber stamp, because this project's record is
that Codex misses things (2 of 7 defects one session; 3 more found by the
Supervisor on T-0005). It found one issue Codex did not.

### MEDIUM — cross-organization existence oracle · ACCEPTED and FIXED

Fixing Codex's P1 narrowed READS to the organization, but migration 004's
uniqueness constraint was still per TENANT:

    UNIQUE (tenant_id, upper(registration_number))

The two scopes disagreed, and **a unique constraint is observable through the
error it raises.** A caller in organisation A submitting a plate held by
organisation B of the same tenant got `409 already exists` for a row they may not
read. 409 means "they have it", 201 means "they do not" — iterating a plate or
VIN list enumerates another organisation's vehicle register.

This is exactly the oracle class the codebase already guards against on purpose:
`findById` answers 404 rather than 403 specifically so a status code cannot
confirm a record exists. The constraint reintroduced it one layer down. **The fix
for one finding created the conditions for this one**, which is why the
Supervisor pass runs after the Codex fixes rather than beside them.

**Fixed:** migration `005_vehicle_uniqueness_per_organization.sql` moves both
unique indexes to `organization_id`, so the constraint scope matches the read
scope and a collision can only be raised against a row the caller may already
see. Safe on existing data by construction — an organisation is contained in one
tenant, so tenant-uniqueness *implies* organization-uniqueness; the change
strictly relaxes what the database rejects and no existing row can violate it.
Applied and verified: `uq_vehicles_org_registration`, `uq_vehicles_org_vin`
present; the tenant-scoped pair gone.

### Assessed and deliberately NOT raised

- SQL injection — every query binds parameters; no interpolation anywhere in the
  diff, including `validate.ts` and the `set_config` context statements.
- XSS — React with auto-escaping, no `dangerouslySetInnerHTML`.
- `core.vehicle_makes` / `vehicle_models` carry no RLS and grant INSERT to the
  app role, so one tenant can add a taxonomy row every tenant sees. Deliberate
  and documented: a shared taxonomy is the point of normalising it, UPDATE and
  DELETE are withheld so existing rows cannot be altered, provenance is recorded
  in `created_by_tenant_id`, and the value renders through React. Low impact, no
  concrete exploit.
- Dev verification scripts — `read-page-signed-in.mjs` refuses any non-localhost
  host before launching a browser; the others require `AUTH_SECRET` or a local
  `DATABASE_URL`. Remaining exposure rests on operator-controlled environment
  variables.

## The defect neither gate found — it was found by RUNNING the thing

Before either gate, the API was asked directly what it hands a technician, using
a real access token captured from a real Keycloak session:

    GET /api/v1/customers -> HTTP 200
    array of 3: Adjoa Boateng, Kwame Mensah, Sunrise Logistics Ltd

The screen 404'd that same viewer. Tenant isolation held; **role authorization
did not exist.** The whole customer book — names, telephone numbers, locations —
to a role whose own navigation deliberately omits it, behind a page that looked
correctly locked. That is what CLAUDE.md §8 means by "Hidden ≠ secure", and it
would have shipped.

`packages/auth/verify/call-api-as.mjs` exists so that question can be asked in one
command in future, rather than trusted to a comment claiming the page gate is not
the control.

After the fix, the identical request:

    GET /api/v1/customers -> HTTP 403 role 'technician' may not read customer records
    GET /api/v1/vehicles  -> HTTP 403 role 'technician' may not read vehicle records

## A second thing found by running rather than reviewing

`reception_staff` — the role whose entire job is the customer book — got a **404**
on the screen built for them. The four workshop role trees route this concept to
four different paths (`§34 /customer-reception/*`, `§46 /customers-and-vehicles/*`,
`§48 /customers/customer-search`; §47 and §49 have none). A screen built at one
path is invisible to every role that uses another.

Resolved without touching approved navigation: the screen lives once in
`app/_screens/` and each path is a thin `page.tsx` that gates itself with its own
route.

## Verdict

**SUPERVISOR VERDICT: PASS.**

All findings from both gates are fixed, and each fix is pinned by a test or by a
live measurement rather than by assertion. typecheck 15/15 · lint 15/15 · 180
unit tests · page-gate guardrail 19/19 self-test and clean on the repo · both
screens verified signed in through real Keycloak, in both the allowed and the
refused direction.
