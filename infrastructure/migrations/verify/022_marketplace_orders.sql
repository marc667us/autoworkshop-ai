-- Proof by effect for migration 022 (marketplace orders).
--
-- 022 introduces the first table in this repository whose RLS predicate is
-- NEITHER the tenant one NOR a public `is_published` flag: an order is owned by
-- its BUYER, keyed on `identity.current_user_id()`. A brand-new predicate is
-- exactly the kind of thing that reads correct and does nothing, so every check
-- below reads rows and counts them rather than asserting policy text.
--
--   docker exec -i aw-postgres psql -U autoworkshop -d autoworkshop \
--     -v ON_ERROR_STOP=1 -f - < infrastructure/migrations/verify/022_marketplace_orders.sql
--
-- Seeds its own fixtures as the SUPERUSER (which bypasses RLS, so the setup
-- cannot be blocked by the very policies under test), then drops to
-- `autoworkshop_app` — the role the API actually connects as, and the one that
-- is subject to FORCE — to make every assertion.
--
-- Wrapped in a transaction that ROLLS BACK, so it is re-runnable and writes
-- nothing.

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures. Two buyers, so the isolation checks have somebody to be isolated
-- FROM. A single-buyer fixture would let a policy that returns everything pass.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _fx (k TEXT PRIMARY KEY, v UUID) ON COMMIT DROP;

-- The assertions run as `autoworkshop_app`, which does not own this temp table
-- and therefore cannot read it without this. Without the GRANT the file dies
-- with "permission denied for table _fx" long before any policy is tested.
GRANT SELECT ON _fx TO autoworkshop_app;

INSERT INTO _fx (k, v) VALUES
  ('buyer_a', gen_random_uuid()),
  ('buyer_b', gen_random_uuid()),
  ('order_a', gen_random_uuid()),
  ('order_b', gen_random_uuid());

INSERT INTO identity.users (id, keycloak_subject, email, display_name, preferred_locale, status)
SELECT v, 'verify-022-' || k, k || '@verify.invalid', 'Verify ' || k, 'en', 'active'
  FROM _fx WHERE k IN ('buyer_a', 'buyer_b');

-- Real catalogue rows, so the FKs and the snapshot columns are exercised
-- against data that actually exists rather than invented ids.
INSERT INTO catalogue.orders (
  id, order_number, buyer_user_id, supplier_id, supplier_name,
  currency, subtotal, total, delivery_recipient, delivery_phone, delivery_address
)
SELECT
  (SELECT v FROM _fx WHERE k = 'order_' || who),
  'VERIFY-022-' || upper(who),
  (SELECT v FROM _fx WHERE k = 'buyer_' || who),
  p.supplier_id, s.name, 'GHS', 100.00, 100.00,
  'Verify Recipient', '+233000000000', 'Verify Address, Accra'
FROM (VALUES ('a'), ('b')) AS t(who)
CROSS JOIN LATERAL (
  SELECT id, supplier_id FROM catalogue.parts ORDER BY id LIMIT 1
) p
JOIN catalogue.suppliers s ON s.id = p.supplier_id;

INSERT INTO catalogue.order_lines (
  order_id, part_id, part_name, quantity, unit_price, currency, line_total
)
SELECT o.id, p.id, p.name, 2, 50.00, 'GHS', 100.00
FROM catalogue.orders o
CROSS JOIN LATERAL (SELECT id, name FROM catalogue.parts ORDER BY id LIMIT 1) p
WHERE o.order_number LIKE 'VERIFY-022-%';

INSERT INTO catalogue.order_events (order_id, event_type, actor_user_id, detail)
SELECT o.id, 'placed', o.buyer_user_id, 'seeded by verify/022'
FROM catalogue.orders o WHERE o.order_number LIKE 'VERIFY-022-%';

-- ---------------------------------------------------------------------------
-- Assertions, as the application role.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE autoworkshop_app;

DO $$
DECLARE
  n        INTEGER;
  a_id     UUID := (SELECT v FROM _fx WHERE k = 'buyer_a');
  b_id     UUID := (SELECT v FROM _fx WHERE k = 'buyer_b');
  order_b  UUID := (SELECT v FROM _fx WHERE k = 'order_b');
BEGIN
  -- 1. ENABLE *and* FORCE on all three new tables, named rather than counted —
  --    counting the schema is what made verify/021 fail when 022 landed.
  SELECT count(*) INTO n
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'catalogue' AND c.relkind = 'r'
     AND c.relname IN ('orders', 'order_lines', 'order_events')
     AND c.relrowsecurity AND c.relforcerowsecurity;
  IF n <> 3 THEN
    RAISE EXCEPTION 'check 1 FAILED: expected 3 order tables ENABLE+FORCE, found %', n;
  END IF;
  RAISE NOTICE 'check 1 OK: orders, order_lines, order_events are ENABLE + FORCE';

  -- 2. NO USER CONTEXT => NO ORDERS. This is the public marketplace's
  --    connection: `identity.current_user_id()` is NULL and every predicate
  --    must therefore be false. If this ever returns rows, the anonymous
  --    catalogue endpoints are one join away from leaking private orders.
  PERFORM set_config('app.user_id', '', true);
  SELECT count(*) INTO n FROM catalogue.orders;
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 2 FAILED: % orders visible with NO user context', n;
  END IF;
  RAISE NOTICE 'check 2 OK: an anonymous connection sees zero orders (fails closed)';

  -- 3. CONTROL. Buyer A sees their OWN order. Without this, check 2 and check 4
  --    would both pass against a policy that simply returns nothing, and the
  --    whole file would be vacuous.
  PERFORM set_config('app.user_id', a_id::text, true);
  SELECT count(*) INTO n FROM catalogue.orders WHERE order_number = 'VERIFY-022-A';
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 3 FAILED: buyer A cannot see their own order (found %) — checks 2 and 4 are vacuous', n;
  END IF;
  RAISE NOTICE 'check 3 OK: buyer A sees their own order — the exclusions below are meaningful';

  -- 4. Buyer A cannot see buyer B's order.
  SELECT count(*) INTO n FROM catalogue.orders WHERE order_number = 'VERIFY-022-B';
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 4 FAILED: buyer A can read buyer B''s order';
  END IF;
  RAISE NOTICE 'check 4 OK: buyer A cannot read buyer B''s order';

  -- 5. Lines follow their order. The line policy is a subquery against
  --    `orders`, so this proves the indirection holds rather than assuming it.
  SELECT count(*) INTO n FROM catalogue.order_lines;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 5 FAILED: buyer A sees % order lines, expected exactly their own 1', n;
  END IF;
  RAISE NOTICE 'check 5 OK: buyer A sees only their own order line';

  -- 6. Events follow their order too.
  SELECT count(*) INTO n FROM catalogue.order_events;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 6 FAILED: buyer A sees % order events, expected exactly their own 1', n;
  END IF;
  RAISE NOTICE 'check 6 OK: buyer A sees only their own order event';

  -- 7. A buyer cannot place an order in somebody else's name. This is the
  --    WITH CHECK on buyer_insert, and it is the reason the policy spells out
  --    FOR INSERT instead of relying on FOR ALL reusing USING.
  BEGIN
    INSERT INTO catalogue.orders (
      order_number, buyer_user_id, supplier_id, supplier_name,
      currency, subtotal, total, delivery_recipient, delivery_phone, delivery_address
    )
    SELECT 'VERIFY-022-FORGED', b_id, s.id, s.name, 'GHS', 1.00, 1.00,
           'x', '+233000000000', 'x'
      FROM catalogue.suppliers s LIMIT 1;
    RAISE EXCEPTION 'check 7 FAILED: buyer A inserted an order owned by buyer B';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 7 OK: buyer A cannot create an order naming another buyer';
  END;

  -- 8. `order_events` is APPEND-ONLY, and the proof is the privilege, not the
  --    policy. The GRANT in 022 lists only SELECT and INSERT, but ALTER DEFAULT
  --    PRIVILEGES had already granted the full set — so this passes only
  --    because of the explicit REVOKE.
  BEGIN
    UPDATE catalogue.order_events SET detail = 'tampered';
    RAISE EXCEPTION 'check 8 FAILED: order_events accepted an UPDATE — it is not append-only';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 8 OK: UPDATE on order_events is refused';
  END;

  -- 9. Same for DELETE — history cannot be erased, only added to.
  BEGIN
    DELETE FROM catalogue.order_events;
    RAISE EXCEPTION 'check 9 FAILED: order_events accepted a DELETE — it is not append-only';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 9 OK: DELETE on order_events is refused';
  END;

  -- 10. The arithmetic a customer can check. A line whose total disagrees with
  --     quantity x unit price is the most damaging silent defect this schema
  --     can carry, so the database refuses it.
  BEGIN
    INSERT INTO catalogue.order_lines (
      order_id, part_id, part_name, quantity, unit_price, currency, line_total
    )
    SELECT o.id, p.id, p.name, 2, 50.00, 'GHS', 999.00
      FROM catalogue.orders o
      CROSS JOIN LATERAL (SELECT id, name FROM catalogue.parts ORDER BY id LIMIT 1) p
     WHERE o.order_number = 'VERIFY-022-A';
    RAISE EXCEPTION 'check 10 FAILED: an order line with inconsistent arithmetic was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'check 10 OK: line_total must equal quantity x unit_price';
  END;

  RAISE NOTICE '--- verify/022: all checks passed ---';
END $$;

-- 11 and 12 need the admin path, because a buyer has no UPDATE policy at all.
SET LOCAL ROLE autoworkshop;
DO $$
DECLARE
  ok BOOLEAN;
BEGIN
  -- 11. A cancelled order must carry a reason. A cancellation nobody can
  --     explain is an argument with a customer that cannot be settled.
  BEGIN
    UPDATE catalogue.orders SET status = 'cancelled'
     WHERE order_number = 'VERIFY-022-A';
    RAISE EXCEPTION 'check 11 FAILED: an order was cancelled with no reason';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'check 11 OK: cancelling without a reason is refused';
  END;

  -- 12. And the other direction — a live order must not carry a stale reason
  --     left over from a cancellation that was undone. Constraining only one
  --     direction leaves the other free to be wrong.
  BEGIN
    UPDATE catalogue.orders SET cancelled_reason = 'left over'
     WHERE order_number = 'VERIFY-022-A';
    RAISE EXCEPTION 'check 12 FAILED: a non-cancelled order kept a cancellation reason';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'check 12 OK: a live order cannot carry a cancellation reason';
  END;

  -- 13. Issue 4 from the handover: the currency default was GBP while the
  --     product prices in GHS.
  SELECT column_default = '''GHS''::text' INTO ok
    FROM information_schema.columns
   WHERE table_schema = 'catalogue' AND table_name = 'parts' AND column_name = 'currency';
  IF NOT ok THEN
    RAISE EXCEPTION 'check 13 FAILED: catalogue.parts.currency default is not GHS';
  END IF;
  RAISE NOTICE 'check 13 OK: catalogue.parts.currency defaults to GHS';

  RAISE NOTICE '--- verify/022: 13/13 passed ---';
END $$;

ROLLBACK;
