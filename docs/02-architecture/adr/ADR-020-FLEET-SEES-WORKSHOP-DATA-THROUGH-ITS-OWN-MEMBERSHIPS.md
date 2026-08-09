# ADR-020 — A fleet sees workshop data through its own memberships, not a cross-organisation read path

- **Date:** 2026-08-09
- **Status:** Accepted
- **Extends:** ADR-011 (tenant isolation), migration 054 (organisation scoping),
  migration 061 (customer self-enrolment), migration 075 (fleet registration).

## Context

`packages/navigation` gives the fleet workspace 29 entries (`02.txt` §36).
Roughly a third of them — **Repairs in Progress, Completed Repairs, Quotations,
Pending Approvals, Approval History, Parts Installed, Warranties, Invoices** —
are not the fleet's own records at all. They are `repair.job_cards`,
`repair.quotations`, `finance.invoices` and `warranty.policies`, and every one
of those rows lives in the **workshop's** organisation.

Row level security in this database is organisation-scoped and FORCED. Migration
054 exists precisely because a tenant here holds more than one organisation, and
migration 073 exists because referential integrity bypasses RLS. A fleet
operator is its own `fleet_operator` organisation with its own tenant. So the
question is unavoidable and structural:

> How does a fleet see the status of a repair happening inside a workshop's
> organisation, without weakening the isolation the whole schema is built on?

The owner chose the membership route on 2026-08-09. This ADR records what that
means concretely, and — more importantly — records that the mechanism was
**verified against the running database before anything was built on it**.

## Decision

**A fleet's user holds a second, ordinary `customer` membership at each workshop
the fleet uses. The fleet workspace aggregates across those memberships. No new
cross-organisation read path is introduced, and no policy is widened.**

Three parts:

1. **The fleet's own data** — vehicles, drivers, maintenance plans, downtime,
   cost centres, approval limits, service policies — lives in a `fleet` schema
   scoped to the `fleet_operator` organisation. Ordinary `ENABLE` + `FORCE` RLS,
   ordinary organisation predicate. Nothing special.

2. **Workshop-side data** is read through the membership the user already holds
   there. `identity.memberships_for_subject(subject)` (SECURITY DEFINER, returns
   every membership for a subject across organisations) resolves the caller's
   active `customer` memberships; the API then builds a `TenantContext` **per
   workshop** and reuses `SelfServiceService` — the same code a customer's own
   pages use. Each read therefore executes inside that workshop's tenant
   context, under that workshop's policies, with a grant the user genuinely
   holds.

3. **"Approved Workshops"** is the enrolment screen: the fleet enrols at a
   published workshop via the existing `identity.enrol_as_customer`, and that
   membership is what makes the other eight screens have anything in them.

## Why not the alternative

The alternative was a dedicated cross-organisation read path — a service that,
given a fleet, reads job cards belonging to organisations the caller is not a
member of, gated by some new `fleet_can_read_workshop` table.

Rejected because it would be **the first code in this application permitted to
read another organisation's rows**. Every existing refusal — `assertWorkshopStaff`,
the `<> 'customer'` clauses, `org_restrict` — assumes no such path exists. Adding
one means every future policy has to be written twice: once for the normal case
and once for "unless a fleet is asking". This repository's most expensive defect
class is a rule that is enforced in one place and not another; a second reading
regime would institutionalise it.

The membership route has the opposite property: **there is nothing new to
enforce.** A fleet sees exactly what its own membership admits, and the day
somebody revokes that membership the fleet stops seeing it, with no code change.

## What was verified before accepting this

Not inferred — run against the local database on 2026-08-09.

| Question | Answer |
|---|---|
| Can a `fleet_administrator` hold a **second** membership? | **Yes.** `enrol_as_customer` scopes its "already has a role" check to `AND m.organization_id = p_organization_id`. It is `register_workshop` / `register_supplier` / `register_fleet` that enforce one-organisation-per-person, and only at registration. |
| Does the fleet user still land in fleet-web? | **Yes.** `ROLE_PRECEDENCE` ranks `fleet_administrator` above `customer`, so `resolveTenantContext` picks the fleet organisation by default; `OrganizationSwitcher` moves between them. |
| Is there a supported cross-organisation membership lookup? | **Yes.** `identity.memberships_for_subject(text)` is SECURITY DEFINER and returns `(user_id, tenant_id, organization_id, branch_id, role_name, status, display_name)` for every membership. |
| Can the reads be reused rather than rewritten? | **Yes.** `SelfServiceService` already takes a `TenantContext` and answers the customer-scoped questions the fleet screens ask. |

The first row is the one the whole decision rests on, so it was not left as a
reading of the source. Run in a rolled-back transaction: register a fleet, then
enrol the same account at a published workshop.

```
NOTICE:  fleet membership created: 1deb46dd-9543-4dc3-827e-fea19382af71
NOTICE:  customer membership at workshop: (…,aaaaaaaa-0000-0000-0000-000000000001,…,t)
NOTICE:  RESULT: this account now holds 2 active membership(s)
NOTICE:  memberships_for_subject sees 2 row(s) across organisations
```

🔴 **And the probe guards against being vacuous**: with no published workshop in
the database it prints `SKIP` and asserts nothing, rather than passing over an
enrolment that never happened. Two published workshops existed when this ran.

⚠️ **A refusal this design inherits, deliberately.** `enrol_as_customer` refuses
a workshop that is not published in the mechanic directory, and refuses an
account that already holds a *staff* role at that workshop. Both carry over to
fleets, and both are right: a fleet cannot quietly attach itself to a workshop
that has not invited customers in, and a person who works at a workshop must not
also be its customer — `resolveTenantContext` would offer them a role the
product never meant them to hold.

## Consequences

- **Isolation is unchanged.** No policy is relaxed and no service gains the
  ability to read an organisation the caller is not in. The blast radius of a
  bug in fleet-web is the fleet's own memberships.
- **A fleet's view is exactly as good as its enrolments.** A workshop that has
  not published cannot be added, and its repairs will not appear. That is a
  product limitation to state on the "Approved Workshops" screen in words,
  **not** a bug to work around later — an empty Repairs screen must say *"you
  have not added a workshop yet"* and link to enrolment, never render blank.
- **Aggregation costs one query per enrolled workshop.** Acceptable at fleet
  sizes; if it stops being acceptable the fix is a materialised read model fed
  by the existing CDC outbox, not a cross-organisation SELECT.
- **`identity.memberships_for_subject` becomes load-bearing for a second
  caller.** It was written for sign-in. Its contract is now depended on by the
  fleet aggregation, and that is recorded here so it is not narrowed casually.

## Open

The fleet domain schema, its API module and the 29 screens are **not built**.
This ADR settles the structural question they depend on; migration 075 settled
the prior one (nothing could create a `fleet_administrator` at all). Build order:
fleet schema → fleet API including the membership aggregation → screens.
