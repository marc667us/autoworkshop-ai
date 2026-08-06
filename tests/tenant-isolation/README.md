# Tenant and organisation isolation — where the proof actually lives

**`apps/api/src/tenancy/organisation-isolation.integration.spec.ts`**

It runs under `pnpm test`, so CI runs it, so it is a real gate.

## Why `rls_proof.sql` was removed

It was the right idea and it had stopped working:

- **Nothing ran it.** No workflow in `.github/` referenced it. A security test
  nobody runs is not a safety net — it is a note claiming there is one, which is
  worse than no note at all. This repository has a recorded defect for exactly
  that shape (`pnpm e2e` exited 0 having executed ZERO tests for two days).
- **It had been broken since migrations 037/038**, which shut the registration
  bootstrap door. Its fixture inserted **0 rows** (`INSERT 0 0`, three times) and
  it then failed on unrelated pre-existing data with
  `ISOLATION BROKEN: tenant A sees 2 organizations`. The message named the
  product; the cause was the fixture.
- It ran as `autoworkshop_app`, which **cannot** use the bootstrap door — that
  is reserved to the owner of `register_workshop` (migration 038). So it could
  never build its own tenant again.

## What replaced it, and what is stronger now

The spec builds its fixture **as the owner** and asserts **as
`autoworkshop_app`** via `SET LOCAL ROLE`, because an RLS assertion made by a
role that bypasses RLS says nothing at all. It proves:

1. RLS is `ENABLE`d **and** `FORCE`d on every organisation-scoped table.
2. Every such table has a policy naming `current_organization_id()` — a
   **whole-schema** check, so the gap that migrations 001–044 carried for months
   cannot come back on a table added tomorrow.
3. **Behaviourally**, two organisations in one tenant cannot read each other.
4. **Behaviourally**, two tenants cannot read each other (what `rls_proof.sql`
   was for).
5. The rightful owner can still read its own rows — a refusal that also refuses
   the owner is an outage, not a fix.

Migration `054_organisation_isolation.sql` is the fix those checks guard, and
`verify/054` is its per-migration proof.
