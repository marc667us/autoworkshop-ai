# Database migrations

## Rules

1. **All schema change goes through versioned migration scripts.** No exceptions.
2. **`CREATE TABLE IF NOT EXISTS` is banned in application boot code.** It is how a live schema silently
   drifts from the migration history — a defect Solar hit and paid for.
3. Backward-compatible migrations are preferred; destructive change uses **expand-and-contract** so the
   previous application version stays compatible during rollback.
4. **No `VARCHAR(n)` on free-text or generated columns** — use `TEXT`. Narrow VARCHARs meeting
   AI-generated content caused a live truncation defect in Solar.
5. `RETURNING id` on inserts, never `lastrowid`.
6. Approvals, payments, warranty decisions and audit events are **append-only**; corrections are new rows.
7. A verified backup is taken automatically before any high-risk migration.

## CI validation (blocking)

- Migration lint
- Forward migration against a clean database
- **Rollback tested**
- Schema drift detection against the previous production schema
- Seed data validation
- **Row-level-security policy tests**

## Every tenant-owned table

```sql
tenant_id       uuid NOT NULL,
organization_id uuid NOT NULL,
branch_id       uuid NULL,
created_by      uuid NOT NULL,
created_at      timestamptz NOT NULL DEFAULT now(),
updated_by      uuid NULL,
updated_at      timestamptz NULL
```

plus:

```sql
ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <t> FORCE  ROW LEVEL SECURITY;
```

`FORCE` matters — without it, the table owner bypasses the policy.

## Seeding

Seed scripts must set the role explicitly or inserts fail silently under RLS:

```sql
SELECT set_config('app.current_role', 'admin', true);
```
