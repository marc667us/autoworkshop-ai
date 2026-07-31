-- Proof by effect for migration 023 (supplier accounts).
--
-- 023 makes two claims that are easy to write and easy to get wrong:
--   (a) a supplier sees orders addressed to THEM and to nobody else;
--   (b) a supplier may change an order's status and tracking, but NOT its money,
--       its buyer or its delivery address.
--
-- (b) is enforced by a trigger rather than a policy, because RLS selects rows
-- and not columns. A trigger that never fires looks exactly like a trigger that
-- passes, so every allowed column is exercised as well as every frozen one —
-- if the ALLOWED update stops working, the guard has become a wall.
--
--   docker exec -i aw-postgres psql -U autoworkshop -d autoworkshop \
--     -v ON_ERROR_STOP=1 -f - < infrastructure/migrations/verify/023_supplier_accounts.sql
--
-- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.

BEGIN;

CREATE TEMP TABLE _fx (k TEXT PRIMARY KEY, v UUID) ON COMMIT DROP;
GRANT SELECT ON _fx TO autoworkshop_app;

INSERT INTO _fx (k, v) VALUES
  ('buyer',      gen_random_uuid()),
  ('sup_user_1', gen_random_uuid()),
  ('sup_user_2', gen_random_uuid()),
  ('revoked',    gen_random_uuid());

INSERT INTO identity.users (id, keycloak_subject, email, display_name, preferred_locale, status)
SELECT v, 'verify-023-' || k, k || '@verify.invalid', 'Verify ' || k, 'en', 'active' FROM _fx;

-- Two DIFFERENT suppliers, each with an order. One supplier alone would let a
-- policy that returns everything pass check 4.
INSERT INTO _fx (k, v)
SELECT 'supplier_1', id FROM catalogue.suppliers ORDER BY id LIMIT 1;
INSERT INTO _fx (k, v)
SELECT 'supplier_2', id FROM catalogue.suppliers
 WHERE id <> (SELECT v FROM _fx WHERE k = 'supplier_1') ORDER BY id LIMIT 1;

-- sup_user_1 and the revoked user both belong to supplier_1; sup_user_2 to
-- supplier_2.
INSERT INTO catalogue.supplier_users (supplier_id, user_id, member_role, status)
VALUES
  ((SELECT v FROM _fx WHERE k='supplier_1'), (SELECT v FROM _fx WHERE k='sup_user_1'), 'owner', 'active'),
  ((SELECT v FROM _fx WHERE k='supplier_2'), (SELECT v FROM _fx WHERE k='sup_user_2'), 'owner', 'active'),
  ((SELECT v FROM _fx WHERE k='supplier_1'), (SELECT v FROM _fx WHERE k='revoked'),    'staff', 'revoked');

INSERT INTO catalogue.orders (
  order_number, buyer_user_id, supplier_id, supplier_name,
  currency, subtotal, total, delivery_recipient, delivery_phone, delivery_address
)
SELECT 'VERIFY-023-' || n, (SELECT v FROM _fx WHERE k='buyer'),
       (SELECT v FROM _fx WHERE k='supplier_' || n),
       s.name, 'GHS', 100.00, 100.00, 'Recipient', '+233000000000', 'Address, Accra'
  FROM (VALUES ('1'), ('2')) AS t(n)
  JOIN catalogue.suppliers s ON s.id = (SELECT v FROM _fx WHERE k='supplier_' || n);

SET LOCAL ROLE autoworkshop_app;

DO $$
DECLARE
  n INTEGER;
BEGIN
  -- 1. RLS on the new membership table.
  SELECT count(*) INTO n
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname='catalogue' AND c.relname='supplier_users'
     AND c.relrowsecurity AND c.relforcerowsecurity;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 1 FAILED: supplier_users is not ENABLE+FORCE RLS';
  END IF;
  RAISE NOTICE 'check 1 OK: supplier_users is ENABLE + FORCE row level security';

  -- 2. CONTROL. Supplier 1's member sees supplier 1's order. Everything below
  --    is an exclusion, and exclusions prove nothing without this.
  PERFORM set_config('app.user_id', (SELECT v FROM _fx WHERE k='sup_user_1')::text, true);
  SELECT count(*) INTO n FROM catalogue.orders WHERE order_number='VERIFY-023-1';
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 2 FAILED: supplier 1 cannot see their own order — the exclusions are vacuous';
  END IF;
  RAISE NOTICE 'check 2 OK: a supplier member sees orders addressed to them';

  -- 3. And not the other supplier's.
  SELECT count(*) INTO n FROM catalogue.orders WHERE order_number='VERIFY-023-2';
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 3 FAILED: supplier 1 can read supplier 2''s order';
  END IF;
  RAISE NOTICE 'check 3 OK: a supplier cannot read another supplier''s order';

  -- 4. A REVOKED member is inert. The row is kept for the record, so the test
  --    is whether `status` is actually consulted rather than whether the row is
  --    gone.
  PERFORM set_config('app.user_id', (SELECT v FROM _fx WHERE k='revoked')::text, true);
  SELECT count(*) INTO n FROM catalogue.orders WHERE order_number LIKE 'VERIFY-023-%';
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 4 FAILED: a REVOKED supplier member still reads % orders', n;
  END IF;
  RAISE NOTICE 'check 4 OK: a revoked member reads nothing, though the row remains';

  -- 5. THE ALLOWED UPDATE STILL WORKS. Checks 6 and 7 below assert refusals;
  --    if the trigger refused everything they would both pass while the feature
  --    was dead. This is the check that makes them meaningful.
  PERFORM set_config('app.user_id', (SELECT v FROM _fx WHERE k='sup_user_1')::text, true);
  UPDATE catalogue.orders
     SET status='confirmed', delivery_tracking_reference='TRK-123', delivery_notes='leaving Tue'
   WHERE order_number='VERIFY-023-1';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 5 FAILED: a supplier could not update status/tracking on their own order (% rows)', n;
  END IF;
  RAISE NOTICE 'check 5 OK: a supplier CAN set status, tracking and notes';

  -- 6. But not the money.
  BEGIN
    UPDATE catalogue.orders SET total = 1.00 WHERE order_number='VERIFY-023-1';
    RAISE EXCEPTION 'check 6 FAILED: a supplier rewrote the total of an order';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 6 OK: a supplier cannot change the money on an order';
  END;

  -- 7. And not where it goes. A supplier who could rewrite the address could
  --    redirect goods the buyer paid for.
  BEGIN
    UPDATE catalogue.orders SET delivery_address='Somewhere else'
     WHERE order_number='VERIFY-023-1';
    RAISE EXCEPTION 'check 7 FAILED: a supplier rewrote the delivery address';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 7 OK: a supplier cannot change the delivery address';
  END;

  -- 8. Nor who the buyer is.
  BEGIN
    UPDATE catalogue.orders SET buyer_user_id=(SELECT v FROM _fx WHERE k='sup_user_1')
     WHERE order_number='VERIFY-023-1';
    RAISE EXCEPTION 'check 8 FAILED: a supplier reassigned the buyer of an order';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 8 OK: a supplier cannot reassign the buyer';
  END;

  -- 9. order_events stays append-only for the supplier too — the REVOKE in 022
  --    is role-wide, so adding a supplier INSERT policy must not have reopened
  --    UPDATE.
  BEGIN
    UPDATE catalogue.order_events SET detail='tampered';
    RAISE EXCEPTION 'check 9 FAILED: supplier context could UPDATE order_events';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 9 OK: order_events remains append-only in supplier context';
  END;

  -- 10. NO REGRESSION FOR THE BUYER. 023 added policies to tables 022 owns;
  --     permissive policies OR together, so the risk is widening, not breaking.
  --     Assert the buyer still sees exactly their own two orders.
  PERFORM set_config('app.user_id', (SELECT v FROM _fx WHERE k='buyer')::text, true);
  SELECT count(*) INTO n FROM catalogue.orders WHERE order_number LIKE 'VERIFY-023-%';
  IF n <> 2 THEN
    RAISE EXCEPTION 'check 10 FAILED: the buyer sees % of their own 2 orders', n;
  END IF;
  RAISE NOTICE 'check 10 OK: the buyer still sees their own orders (no regression from 022)';

  -- 11. A buyer is not a supplier. The buyer has no UPDATE policy at all, so a
  --     buyer-context update must touch nothing.
  UPDATE catalogue.orders SET status='dispatched' WHERE order_number='VERIFY-023-1';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 11 FAILED: a BUYER updated an order (% rows)', n;
  END IF;
  RAISE NOTICE 'check 11 OK: a buyer cannot update an order at all';

  -- 12. An anonymous connection still sees no orders, with supplier policies
  --     now in play. `current_user_supplies` must return false, not error, when
  --     there is no user.
  PERFORM set_config('app.user_id', '', true);
  SELECT count(*) INTO n FROM catalogue.orders;
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 12 FAILED: % orders visible anonymously after 023', n;
  END IF;
  RAISE NOTICE 'check 12 OK: anonymous still sees zero orders — supplier policy fails closed';

  RAISE NOTICE '--- verify/023: 12/12 passed ---';
END $$;

ROLLBACK;
