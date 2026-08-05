-- verify/044 — the stock ledger, PROVEN BY INJECTING EACH FAILURE.
--
-- Same shape as verify/042: it builds its own tenant through the registration
-- bootstrap door (whose guard is `current_user = owner of register_workshop`,
-- which a migration is and the APPLICATION is not), shuts the door, and runs
-- every check under the permissions a real user has.
--
-- ⚠️ EVERY ASSERTION HERE TRIES THE FORBIDDEN THING AND CHECKS IT WAS REFUSED,
-- or checks a DERIVED number against a hand-computed one. A verify that only
-- does permitted things proves the happy path and nothing else.

DO $verify$
DECLARE
    tid uuid; oid uuid; me uuid; item uuid; jc uuid := gen_random_uuid();
    refused boolean;
    onhand numeric; v_reserved numeric; avail numeric; v_reorder boolean;
    passed int := 0;
BEGIN
    SELECT id INTO me FROM identity.users LIMIT 1;
    IF me IS NULL THEN RAISE EXCEPTION 'verify/044: no user rows — cannot build a fixture'; END IF;

    tid := identity.current_tenant_id();
    IF tid IS NULL THEN
        tid := gen_random_uuid(); oid := gen_random_uuid();
        PERFORM set_config('app.bootstrap', 'on', true);
        PERFORM set_config('app.bootstrap_user', me::text, true);
        INSERT INTO identity.tenants (id, name, slug, created_by)
        VALUES (tid, 'verify-044 tenant', 'verify-044-' || replace(tid::text,'-',''), me);
        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
        VALUES (oid, tid, 'verify-044 workshop', 'individual_workshop', me);
        -- Shut it immediately: every check below must run under the permissions
        -- the application actually has, not the bootstrap's.
        PERFORM set_config('app.bootstrap', 'off', true);
    ELSE
        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
    END IF;
    PERFORM set_config('app.tenant_id', tid::text, true);
    IF oid IS NULL THEN RAISE EXCEPTION 'verify/044: tenant % has no organisation', tid; END IF;

    -- 1. a stock item exists before it has any stock
    INSERT INTO parts.stock_items (tenant_id, organization_id, part_number, name, reorder_level, created_by)
    VALUES (tid, oid, 'VFY-044-' || substr(gen_random_uuid()::text,1,8), 'Test alternator', 2, me)
    RETURNING id INTO item;
    SELECT on_hand INTO onhand FROM parts.stock_on_hand WHERE stock_item_id = item;
    IF onhand <> 0 THEN RAISE EXCEPTION 'a brand-new item claimed % on hand', onhand; END IF;
    passed := passed + 1;
    RAISE NOTICE '  1/7 a new stock item is zero on hand, not null';

    -- 2. on-hand is the SUM of the ledger, not a counter
    INSERT INTO parts.stock_movements (tenant_id, organization_id, stock_item_id, quantity, movement_kind, recorded_by)
    VALUES (tid, oid, item, 10, 'goods_receipt', me);
    INSERT INTO parts.stock_movements (tenant_id, organization_id, stock_item_id, quantity, movement_kind, job_card_id, recorded_by)
    VALUES (tid, oid, item, -3, 'issue_to_job', jc, me);
    SELECT on_hand INTO onhand FROM parts.stock_on_hand WHERE stock_item_id = item;
    IF onhand <> 7 THEN RAISE EXCEPTION 'on_hand should be 7 after +10 and -3, got %', onhand; END IF;
    passed := passed + 1;
    RAISE NOTICE '  2/7 on_hand is the sum of the movement ledger (10 - 3 = 7)';

    -- 3. RESERVED IS NOT CONSUMED — the shelf count must not move
    INSERT INTO parts.reservations (tenant_id, organization_id, stock_item_id, job_card_id, quantity, reserved_by)
    VALUES (tid, oid, item, jc, 4, me);
    SELECT on_hand, reserved, available INTO onhand, v_reserved, avail
      FROM parts.stock_on_hand WHERE stock_item_id = item;
    IF onhand <> 7 THEN RAISE EXCEPTION 'reserving changed on_hand to % — a reservation is not a movement', onhand; END IF;
    IF v_reserved <> 4 THEN RAISE EXCEPTION 'reserved should be 4, got %', v_reserved; END IF;
    IF avail <> 3 THEN RAISE EXCEPTION 'available should be 7-4=3, got %', avail; END IF;
    passed := passed + 1;
    RAISE NOTICE '  3/7 a reservation holds stock without taking it off the shelf (7 on hand, 4 held, 3 free)';

    -- 4. releasing a reservation frees it again
    UPDATE parts.reservations
       SET status = 'released', release_reason = 'verify', settled_at = now()
     WHERE stock_item_id = item;
    SELECT reserved, available INTO v_reserved, avail FROM parts.stock_on_hand WHERE stock_item_id = item;
    IF v_reserved <> 0 OR avail <> 7 THEN
        RAISE EXCEPTION 'releasing left reserved=% available=%', v_reserved, avail;
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  4/7 releasing a reservation frees the stock again';

    -- 5. needs_reorder is DERIVED — it must follow the ledger with no write
    INSERT INTO parts.stock_movements (tenant_id, organization_id, stock_item_id, quantity, movement_kind, job_card_id, recorded_by)
    VALUES (tid, oid, item, -6, 'issue_to_job', jc, me);
    SELECT available, needs_reorder INTO avail, v_reorder FROM parts.stock_on_hand WHERE stock_item_id = item;
    IF avail <> 1 THEN RAISE EXCEPTION 'available should be 1, got %', avail; END IF;
    IF NOT v_reorder THEN RAISE EXCEPTION 'available 1 <= reorder level 2 but needs_reorder was false'; END IF;
    passed := passed + 1;
    RAISE NOTICE '  5/7 needs_reorder follows the ledger with nothing written to the item';

    -- 6. INJECT: rewrite the ledger
    refused := false;
    BEGIN
        UPDATE parts.stock_movements SET quantity = 999 WHERE stock_item_id = item;
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    -- ⚠️ ASSERT THE EFFECT, NOT THE MECHANISM. verify/042 learned this the hard
    -- way: locally the superuser reaches the row and the trigger raises; live
    -- there is no UPDATE policy in play for a role RLS has already filtered, and
    -- a refusal can be silent. What matters is that the number did not change.
    SELECT on_hand INTO onhand FROM parts.stock_on_hand WHERE stock_item_id = item;
    IF onhand <> 1 THEN
        RAISE EXCEPTION 'the ledger was REWRITTEN — on_hand became % (raised=%)', onhand, refused;
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  6/7 the movement ledger cannot be rewritten (raised=%)', refused;

    -- 7. INJECT: delete from the ledger
    refused := false;
    BEGIN
        DELETE FROM parts.stock_movements WHERE stock_item_id = item;
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    SELECT on_hand INTO onhand FROM parts.stock_on_hand WHERE stock_item_id = item;
    IF onhand <> 1 THEN
        RAISE EXCEPTION 'ledger rows were DELETED — on_hand became % (raised=%)', onhand, refused;
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  7/7 movement rows cannot be deleted (raised=%)', refused;

    RAISE NOTICE 'verify/044: OK (%/7)', passed;
END $verify$;
