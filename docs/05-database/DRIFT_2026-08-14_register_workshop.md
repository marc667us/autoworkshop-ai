# Production's `register_workshop` is not the one in this repository

**Found 2026-08-14. Not yet closed.** Recorded because an undocumented
difference between production and the migration history is the most dangerous
kind of unknown this project has: every test, every local verification and every
migration rehearsal runs against a function production does not use.

## The evidence

Production's `identity.register_workshop` contains:

```sql
INSERT INTO catalogue.mechanic_directory
    (organization_id, trading_name, city, country, is_published)
```

Local's does not. Read from `pg_get_functiondef` on both, not inferred:

| Question | Local | Production |
|---|---|---|
| `register_workshop` mentions `mechanic_directory` | **no** | **YES** |
| Triggers on `identity.organization_registrations` | 1 (`trg_alert_admins_of_registration`) | 1 (same) |
| Triggers on `identity.organizations` | 0 | 0 |
| Triggers on `catalogue.mechanic_directory` | 1 (`trg_reject_unverified_publication`) | 1 (same) |

So it is not a trigger, and not a second code path. The installed **function
body itself differs**.

## And the migration history says they should be identical

Every checksum in `public.schema_migrations` for the migrations that define or
replace this function is byte-identical between the two databases:

```
036_signup_and_workshop_registration     759d3cc536311aa5
037_registration_rls_bootstrap           365658e74792b1d5
070_alert_admins_of_registrations        87b30fd94de84df1
071_registration_defects_from_codex      3436e3d5f50b5046
072_registration_defects_from_supervisor e356a9aaf0bbc5f4
```

Same files, same checksums, different installed function.

**Therefore the change was applied to production outside the migration system** —
a hand-run `CREATE OR REPLACE FUNCTION` against the live database. `run.sh`'s
checksum guard cannot see that: it verifies that the FILES have not changed since
they were applied, not that the DATABASE still matches what they produced.

This is precisely the failure `CLAUDE.md` bans `CREATE TABLE IF NOT EXISTS` to
avoid — *"IF-NOT-EXISTS is how live schema silently drifts from migration
history"* — arriving by a different door.

## How it surfaced

The 2026-08-14 UAT seeder registered a workshop through the real
`register_workshop`, approved it, and then failed inserting the directory row:

```
duplicate key value violates unique constraint "uq_directory_org"
```

A row for a brand-new organisation already existed. Locally the same sequence
inserts cleanly. Nothing else in the product would have noticed, because nothing
else registers a workshop and then writes that table.

## Which version is right

**Production's, on the evidence.** A workshop that is not in
`catalogue.mechanic_directory` can never be found by a customer, and
`identity.enrol_as_customer` (migration 061) refuses a workshop that has not
published itself — so a workshop registered through the repository's version has
no directory row and no path to gaining one except a hand-written INSERT. The
UAT seeder had to write that INSERT itself, which is the tell.

Somebody appears to have fixed a real gap directly on production and never
brought it back into a migration.

## What closing it requires

1. **Dump production's full function body** and diff it against migration 036 as
   modified by 071/072 — two lines are known, the rest is not, and a migration
   written from a partial reading would be a third version rather than a
   reconciliation.
2. **Write migration 081** that makes the repository produce production's
   behaviour, so a database rebuilt from migrations matches the live one.
3. **Decide what `is_published` should be** on that insert. It cannot be `true`:
   `trg_reject_unverified_publication` refuses publication before a platform
   administrator approves, so production's version must insert `false` — but
   that is inference and needs reading, not assuming.
4. **Then check the other four registration functions the same way**
   (`register_supplier`, `register_fleet`, `register_insurer`,
   `register_towing_operator`). If one function drifted by hand, the others are
   not proven innocent — only unexamined.

Re-run the evidence at any time, read-only:

```bash
gh workflow run diagnose-directory-drift.yml
```

## Until it is closed

`infrastructure/seed/uat_population.sql` detects the drift at runtime and reports
it by name rather than failing on it. That is a workaround in a seed script, not
a fix, and it will keep being one until migration 081 exists.
