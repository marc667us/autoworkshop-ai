-- 063 — one customer record per person per workshop
--
-- ── WHY THIS IS NEEDED NOW ─────────────────────────────────────────────────
--
-- Migration 061 made customer enrolment self-service, and the funnel calls it
-- on EVERY visit to a workshop's Request for Service page. The membership half
-- is already race-safe: `identity.memberships` is unique on
-- (organization_id, user_id, role_name), so a double-submitted form hits
-- `ON CONFLICT DO NOTHING` and the loser reads the winner's row.
--
-- The `core.customers` half had no such constraint. `CustomerEnrolmentService`
-- creates the customer record after the membership, and a check-then-insert
-- under READ COMMITTED lets two concurrent requests BOTH see "no row" and BOTH
-- insert. The result is two customer records for one person at one workshop —
-- and because every customer-scoped read resolves through
-- `core.customers.user_id`, their garage would then show half their vehicles
-- depending on which row a given query joined. A duplicate here is not
-- cosmetic; it silently splits somebody's repair history in two.
--
-- ── WHY PARTIAL, AND WHY THIS IS NOT A NEW RULE ────────────────────────────
--
-- `user_id` is NULLABLE by design (migration 004): "a walk-in customer who
-- never signs in is still a customer". A workshop may hold any number of
-- walk-in records with no login, and this index must not stand in the way of
-- that — so it applies ONLY where `user_id IS NOT NULL`. In Postgres a plain
-- unique index would already permit many NULLs, but spelling the predicate out
-- makes the intent legible and keeps the index off the rows it does not govern.
--
-- This is the invariant the application already ASSUMES. `myCustomerId()`
-- (`selfservice/customer-scope.ts`) resolves a signed-in person to ONE customer
-- id per organisation; the join predicate `AND c.user_id = $n` used across ~40
-- read methods is only correct if there is exactly one. The constraint is
-- therefore a statement of an existing assumption, not a new restriction.
--
-- ⚠️ NOT `CONCURRENTLY`. The runner applies each migration inside a
-- transaction, and CREATE INDEX CONCURRENTLY cannot run in one. `core.customers`
-- is small on every deployment of this product today, so the brief lock is
-- acceptable; revisit if that stops being true.

-- ── the guard, and it must not fail on data that already exists ────────────
--
-- Nothing in the application has ever WRITTEN `core.customers.user_id`
-- (measured 2026-08-08: `CustomerService.create` omits the column and the only
-- writes anywhere are test fixtures), so on every real database this index has
-- nothing to reject. The DO block below is not defensive padding — it is here
-- so that if a fixture or a manual repair HAS produced duplicates, this
-- migration fails with a sentence naming them rather than with a bare
-- "could not create unique index", which says nothing about what to fix.
DO $$
DECLARE
    dupes INT;
BEGIN
    SELECT count(*) INTO dupes
      FROM (
        SELECT organization_id, user_id
          FROM core.customers
         WHERE user_id IS NOT NULL
         GROUP BY organization_id, user_id
        HAVING count(*) > 1
      ) d;

    IF dupes > 0 THEN
        RAISE EXCEPTION
            'migration 063 cannot proceed: % (organisation, user) pair(s) already have more than one customer record. Merge them first — the query in this migration lists them.', dupes;
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_org_user
    ON core.customers (organization_id, user_id)
    WHERE user_id IS NOT NULL;

COMMENT ON INDEX core.uq_customers_org_user IS
'One customer record per signed-in person per workshop. Partial, because user_id '
'is NULL for walk-in customers who never sign in (migration 004) and a workshop '
'may hold any number of those. Added with migration 061 self-service enrolment: '
'the funnel runs on every visit, and a check-then-insert under READ COMMITTED '
'would let two concurrent requests both create a record — splitting one person''s '
'repair history across two rows that every customer-scoped read joins through.';
