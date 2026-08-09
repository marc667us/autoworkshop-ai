-- verify/073 — the relationships, proven by what they refuse, what they still
-- allow, and what they must not make impossible.
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 THIS FILE IS THE SECOND DRAFT, AND THE FIRST ONE PASSED 9/9 OVER NINE
-- BROKEN CONSTRAINTS. Worth stating plainly, because the reasons generalise:
--
--   · it matched constraint NAMES. A name proves an ALTER ran, not what it
--     created — a key on the wrong parent with the wrong action would have
--     passed in full. Check 1 now asserts the complete definition.
--   · it exercised CASCADE and RESTRICT and never once ran a delete through a
--     SET NULL key. Nine of the eighteen were SET NULL and every one of them
--     raised "null value in column tenant_id" on first use. Check 5 runs one.
--   · its cleanup deleted rows in dependency order before deleting the
--     organisation, which CONCEALED whether a populated organisation can be
--     deleted at all. Check 7 deletes one without tidying up first.
--
-- Each of those was a check walking through its own gap. Two reviewers found
-- them; neither found all of them.
--
-- ⚠️ NONE OF THIS NEEDS RENDER'S PRIVILEGE SHAPE. Referential integrity checks
-- bypass row level security by design, so a superuser and an ordinary role
-- observe the SAME refusals. That is not a convenience — it is the reason the
-- migration was necessary, and it is why these checks mean something locally
-- when RLS checks do not.
-- ══════════════════════════════════════════════════════════════════════════

DO $verify$
DECLARE
    tid uuid := gen_random_uuid();
    orgA uuid := gen_random_uuid();
    orgB uuid := gen_random_uuid();
    me uuid; mk uuid;
    custA uuid := gen_random_uuid(); vehA uuid := gen_random_uuid();
    custB uuid := gen_random_uuid(); vehB uuid := gen_random_uuid();
    jcA uuid := gen_random_uuid(); jcA2 uuid := gen_random_uuid();
    jcA3 uuid := gen_random_uuid(); jcB uuid := gen_random_uuid();
    itemA uuid := gen_random_uuid(); resA uuid := gen_random_uuid();
    intakeA uuid := gen_random_uuid();
    r record; n int; refused boolean; passed int := 0;
BEGIN
    SELECT id INTO me FROM identity.users LIMIT 1;
    SELECT id INTO mk FROM core.vehicle_makes LIMIT 1;
    IF me IS NULL OR mk IS NULL THEN
        RAISE EXCEPTION 'verify/073: needs at least one user and one vehicle make';
    END IF;

    -- ── 1. EVERY KEY, IN FULL ─────────────────────────────────────────────
    -- 'a' NO ACTION · 'c' CASCADE · 'n' SET NULL
    FOR r IN
        SELECT * FROM (VALUES
            ('fk_invoice_job_card_scope',            'finance.invoices',            'job_card_id',                 'repair.job_cards',       'a'),
            ('fk_invoice_quotation_scope',           'finance.invoices',            'quotation_id',                'repair.quotations',      'a'),
            ('fk_invoice_line_quotation_line_scope', 'finance.invoice_lines',       'quotation_line_id',           'repair.quotation_lines', 'a'),
            ('fk_requisition_job_card_scope',        'parts.purchase_requisitions', 'job_card_id',                 'repair.job_cards',       'n'),
            ('fk_reservation_job_card_scope',        'parts.reservations',          'job_card_id',                 'repair.job_cards',       'c'),
            ('fk_booking_job_card_scope',            'parts.resource_bookings',     'job_card_id',                 'repair.job_cards',       'c'),
            ('fk_movement_job_card_scope',           'parts.stock_movements',       'job_card_id',                 'repair.job_cards',       'a'),
            ('fk_movement_goods_receipt_scope',      'parts.stock_movements',       'goods_receipt_id',            'parts.goods_receipts',   'a'),
            ('fk_supplier_request_job_card_scope',   'parts.supplier_requests',     'job_card_id',                 'repair.job_cards',       'n'),
            ('fk_supplier_request_po_scope',         'parts.supplier_requests',     'converted_purchase_order_id', 'parts.purchase_orders',  'n'),
            ('fk_appointment_job_card_scope',        'reception.appointments',      'converted_job_card_id',       'repair.job_cards',       'a'),
            ('fk_feedback_job_card_scope',           'reception.customer_feedback', 'job_card_id',                 'repair.job_cards',       'a'),
            ('fk_service_request_job_card_scope',    'reception.service_requests',  'converted_job_card_id',       'repair.job_cards',       'a'),
            ('fk_intake_job_card_scope',             'reception.vehicle_intakes',   'job_card_id',                 'repair.job_cards',       'n'),
            ('fk_walk_in_job_card_scope',            'reception.walk_ins',          'converted_job_card_id',       'repair.job_cards',       'a'),
            ('fk_claim_remedial_job_card_scope',     'warranty.claims',             'remedial_job_card_id',        'repair.job_cards',       'n'),
            ('fk_policy_job_card_scope',             'warranty.policies',           'job_card_id',                 'repair.job_cards',       'a'),
            ('fk_policy_invoice_scope',              'warranty.policies',           'invoice_id',                  'finance.invoices',       'n')
        ) AS t(cname, child, col, parent, del)
    LOOP
        SELECT count(*) INTO n
          FROM pg_constraint k
          JOIN pg_class c ON c.oid = k.conrelid
          JOIN pg_class p ON p.oid = k.confrelid
         WHERE k.conname = r.cname
           AND k.contype = 'f'
           AND k.convalidated                       -- not quietly left NOT VALID
           AND c.relnamespace::regnamespace::text || '.' || c.relname = r.child
           AND p.relnamespace::regnamespace::text || '.' || p.relname = r.parent
           AND k.confdeltype = r.del
           AND (SELECT array_agg(a.attname::text ORDER BY ord)
                  FROM unnest(k.conkey) WITH ORDINALITY AS u(attnum, ord)
                  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = u.attnum)
               = ARRAY[r.col, 'tenant_id', 'organization_id']
           AND (SELECT array_agg(a.attname::text ORDER BY ord)
                  FROM unnest(k.confkey) WITH ORDINALITY AS u(attnum, ord)
                  JOIN pg_attribute a ON a.attrelid = p.oid AND a.attnum = u.attnum)
               = ARRAY['id', 'tenant_id', 'organization_id'];

        IF n <> 1 THEN
            RAISE EXCEPTION 'verify/073 #1: % is not defined as % (%) -> % ON DELETE code %',
                r.cname, r.child, r.col, r.parent, r.del;
        END IF;

        -- 🔴 A SET NULL MUST NAME ITS COLUMN. Unqualified, PostgreSQL nulls
        -- tenant_id and organization_id too, and both are NOT NULL — which is
        -- the defect that shipped in the first draft of 073.
        IF r.del = 'n' THEN
            SELECT count(*) INTO n
              FROM pg_constraint k
              JOIN pg_class c ON c.oid = k.conrelid
             WHERE k.conname = r.cname
               AND (SELECT array_agg(a.attname::text)
                      FROM unnest(k.confdelsetcols) AS u(attnum)
                      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = u.attnum)
                   = ARRAY[r.col];
            IF n <> 1 THEN
                RAISE EXCEPTION 'verify/073 #1b: % is SET NULL but does not name '
                                '% as the only column to clear — it would null '
                                'tenant_id and organization_id as well', r.cname, r.col;
            END IF;
        END IF;
    END LOOP;
    passed := passed + 1;

    -- ── 2. Parent keys and child indexes, by TABLE not just by name ───────
    --
    -- Index names are unique per schema, so a same-named index elsewhere would
    -- satisfy a name-only check while the intended table has no support at all.
    SELECT count(*) INTO n FROM pg_indexes
     WHERE (schemaname, tablename, indexname) IN (
        ('finance','invoices','uq_invoices_id_tenant_org'),
        ('repair','quotation_lines','uq_quotation_lines_id_tenant_org'),
        ('parts','goods_receipts','uq_goods_receipts_id_tenant_org'),
        ('parts','purchase_orders','uq_purchase_orders_id_tenant_org'));
    IF n <> 4 THEN RAISE EXCEPTION 'verify/073 #2: expected 4 parent keys, found %', n; END IF;

    SELECT count(*) INTO n FROM pg_indexes
     WHERE (schemaname, tablename, indexname) IN (
        ('finance','invoices','idx_invoices_quotation'),
        ('finance','invoice_lines','idx_invoice_lines_quote_line'),
        ('parts','purchase_requisitions','idx_requisitions_job_card'),
        ('parts','stock_movements','idx_movements_goods_receipt'),
        ('parts','supplier_requests','idx_supplier_requests_job_card'),
        ('parts','supplier_requests','idx_supplier_requests_po'),
        ('reception','appointments','idx_appointments_job_card'),
        ('reception','customer_feedback','idx_feedback_job_card'),
        ('reception','service_requests','idx_service_requests_job_card'),
        ('reception','walk_ins','idx_walk_ins_job_card'),
        ('warranty','claims','idx_claims_remedial_job_card'),
        ('warranty','policies','idx_policies_invoice'));
    IF n <> 12 THEN RAISE EXCEPTION 'verify/073 #2b: expected 12 child indexes, found %', n; END IF;

    -- The five that were NOT added because they already existed. If one of
    -- these ever disappears, the key it supports silently loses its index.
    SELECT count(*) INTO n FROM pg_indexes
     WHERE (schemaname, tablename, indexname) IN (
        ('finance','invoices','idx_invoice_job_card'),
        ('parts','reservations','idx_reservation_job'),
        ('parts','resource_bookings','idx_booking_org_job'),
        ('parts','stock_movements','idx_movement_job'),
        ('reception','vehicle_intakes','idx_intake_job_card'));
    IF n <> 5 THEN
        RAISE EXCEPTION 'verify/073 #2c: one of the 5 PRE-EXISTING covering '
                        'indexes is gone (found %) — 073 relied on them and '
                        'deliberately did not duplicate them', n;
    END IF;
    passed := passed + 1;

    -- ── FIXTURES: two workshops in ONE tenant ─────────────────────────────
    PERFORM set_config('app.bootstrap', 'on', true);
    PERFORM set_config('app.bootstrap_user', me::text, true);
    INSERT INTO identity.tenants (id, name, slug, created_by)
      VALUES (tid, 'verify-073', 'verify-073-' || replace(tid::text,'-',''), me);
    INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
      VALUES (orgA, tid, 'verify-073 workshop A', 'individual_workshop', me),
             (orgB, tid, 'verify-073 workshop B', 'individual_workshop', me);
    PERFORM set_config('app.bootstrap', 'off', true);

    PERFORM set_config('app.tenant_id', tid::text, true);
    PERFORM set_config('app.user_id', me::text, true);
    PERFORM set_config('app.organization_ids', orgA::text || ',' || orgB::text, true);
    PERFORM set_config('app.current_role', 'workshop_owner', true);

    INSERT INTO core.customers (id, tenant_id, organization_id, customer_type, display_name, preferred_contact)
      VALUES (custA, tid, orgA, 'individual', 'A customer', 'phone'),
             (custB, tid, orgB, 'individual', 'B customer', 'phone');
    INSERT INTO core.vehicles (id, tenant_id, organization_id, customer_id, registration_number, make_id)
      VALUES (vehA, tid, orgA, custA, 'V-073-A', mk),
             (vehB, tid, orgB, custB, 'V-073-B', mk);
    INSERT INTO repair.job_cards (id, tenant_id, organization_id, job_number, customer_id, vehicle_id, complaint)
      VALUES (jcA,  tid, orgA, 'JC-073-A',  custA, vehA, 'A: brake judder'),
             (jcA2, tid, orgA, 'JC-073-A2', custA, vehA, 'A: stock hold'),
             (jcA3, tid, orgA, 'JC-073-A3', custA, vehA, 'A: intake'),
             (jcB,  tid, orgB, 'JC-073-B',  custB, vehB, 'B: clutch slip');

    -- ── 3. A REFERENCE TO A JOB CARD THAT DOES NOT EXIST IS REFUSED ───────
    refused := false;
    BEGIN
        INSERT INTO warranty.policies
            (tenant_id, organization_id, job_card_id, policy_number, cover_summary, expires_on)
        VALUES (tid, orgA, gen_random_uuid(), 'POL-073-GHOST', '12 months', CURRENT_DATE + 365);
    EXCEPTION WHEN foreign_key_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'verify/073 #3: a warranty was written against a job card that does not exist';
    END IF;
    passed := passed + 1;

    -- ── 4. 🔴 ANOTHER WORKSHOP'S JOB CARD IS REFUSED ──────────────────────
    --
    -- Organisation A, same tenant, citing organisation B's job card. This
    -- exact statement returned INSERT 0 1 before the migration, as
    -- `autoworkshop_app` with rolbypassrls = f.
    refused := false;
    BEGIN
        INSERT INTO warranty.policies
            (tenant_id, organization_id, job_card_id, policy_number, cover_summary, expires_on)
        VALUES (tid, orgA, jcB, 'POL-073-CROSS-ORG',
                '12 months on another workshop''s job', CURRENT_DATE + 365);
    EXCEPTION WHEN foreign_key_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'verify/073 #4: organisation A wrote a warranty against '
                        'organisation B''s job card — the key is not '
                        'organisation-scoped and 073 achieved nothing';
    END IF;
    passed := passed + 1;

    -- ── 5. 🔴 SET NULL CLEARS THE LINK AND NOTHING ELSE ───────────────────
    --
    -- The path the first draft never took. Before the fix this DELETE raised
    -- "null value in column tenant_id ... violates not-null constraint",
    -- because an unqualified composite SET NULL nulls every key column.
    INSERT INTO reception.vehicle_intakes (id, tenant_id, organization_id, vehicle_id, job_card_id)
      VALUES (intakeA, tid, orgA, vehA, jcA3);

    DELETE FROM repair.job_cards WHERE id = jcA3;

    SELECT count(*) INTO n FROM reception.vehicle_intakes
     WHERE id = intakeA AND job_card_id IS NULL
       AND tenant_id = tid AND organization_id = orgA;
    IF n <> 1 THEN
        RAISE EXCEPTION 'verify/073 #5: after deleting the job card the intake '
                        'row is not [link cleared, scope intact]';
    END IF;
    passed := passed + 1;

    -- ── 6. CASCADE releases a stock hold; NO ACTION refuses, and a NORMAL
    --       reference is still ACCEPTED ─────────────────────────────────────
    --
    -- The "still accepted" half matters most: a constraint that refused
    -- everything would pass checks 3, 4 and 8 perfectly.
    INSERT INTO warranty.policies
        (tenant_id, organization_id, job_card_id, policy_number, cover_summary, expires_on)
    VALUES (tid, orgA, jcA, 'POL-073-GOOD', '12 months on our own job', CURRENT_DATE + 365);
    SELECT count(*) INTO n FROM warranty.policies WHERE policy_number = 'POL-073-GOOD';
    IF n <> 1 THEN
        RAISE EXCEPTION 'verify/073 #6: a legitimate same-workshop warranty was '
                        'refused — 073 has broken normal operation';
    END IF;

    INSERT INTO parts.stock_items (id, tenant_id, organization_id, part_number, name)
      VALUES (itemA, tid, orgA, 'BP-073', 'Brake pad set');
    INSERT INTO parts.reservations (id, tenant_id, organization_id, stock_item_id, job_card_id, quantity)
      VALUES (resA, tid, orgA, itemA, jcA2, 2);
    DELETE FROM repair.job_cards WHERE id = jcA2;
    SELECT count(*) INTO n FROM parts.reservations WHERE id = resA;
    IF n <> 0 THEN
        RAISE EXCEPTION 'verify/073 #6b: the job card was deleted and its stock '
                        'hold survived — parts are locked against nothing';
    END IF;

    -- NO ACTION refuses: jcA still carries POL-073-GOOD.
    refused := false;
    BEGIN
        DELETE FROM repair.job_cards WHERE id = jcA;
    EXCEPTION WHEN foreign_key_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'verify/073 #6c: a job card under warranty was deleted '
                        'out from under its policy';
    END IF;
    passed := passed + 1;

    -- ── 7. 🔴 A POPULATED ORGANISATION CAN STILL BE DELETED ───────────────
    --
    -- The check the first draft's cleanup CONCEALED by deleting children in
    -- dependency order first.
    --
    -- Ten of these keys refuse a delete that would orphan a row, and every one
    -- of these children is ALSO cascade-deleted by `organization_id
    -- REFERENCES identity.organizations ON DELETE CASCADE`. Under RESTRICT —
    -- checked IMMEDIATELY — offboarding could abort depending on which cascade
    -- fired first, i.e. on constraint creation order. Under NO ACTION —
    -- checked at END OF STATEMENT — the whole set resolves together.
    --
    -- This deletes organisation A with a warranty, a converted walk-in, a
    -- customer, a vehicle and job cards still in it, and tidies NOTHING first.
    INSERT INTO reception.walk_ins
        (tenant_id, organization_id, contact_name, vehicle_description,
         complaint, converted_job_card_id, status)
      VALUES (tid, orgA, 'Kofi', 'Hilux', 'knock', jcA, 'converted');

    BEGIN
        DELETE FROM identity.organizations WHERE id = orgA;
    EXCEPTION WHEN foreign_key_violation THEN
        RAISE EXCEPTION 'verify/073 #7: a populated organisation can no longer '
                        'be deleted — 073 has made offboarding impossible. '
                        'This is why the ten refusing keys are NO ACTION and '
                        'not RESTRICT.';
    END;

    SELECT count(*) INTO n FROM repair.job_cards WHERE organization_id = orgA;
    IF n <> 0 THEN
        RAISE EXCEPTION 'verify/073 #7b: the organisation went but % of its job '
                        'cards remain', n;
    END IF;
    passed := passed + 1;

    -- ── 8. THE TWO DELIBERATE OMISSIONS ARE STILL OMITTED ─────────────────
    --
    -- ⚠️ SCOPED TO TWO NAMED TABLES. An earlier draft asked "does any
    -- technician column in `repair` have a key?" and failed — because
    -- `repair.job_cards.assigned_technician_id` HAS one, ON DELETE SET NULL.
    -- That is not an inconsistency, it is the distinction 014 drew: a LIVE
    -- pointer (who is on this job now, which should clear when they leave)
    -- versus a HISTORICAL RECORD inside a settled document.
    SELECT count(*) INTO n
      FROM pg_constraint k
      JOIN pg_class c ON c.oid = k.conrelid
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (k.conkey)
     WHERE k.contype = 'f'
       AND c.relnamespace::regnamespace::text || '.' || c.relname
           IN ('repair.repair_plan_tasks', 'repair.execution_time_entries')
       AND a.attname IN ('technician_id', 'assigned_technician_id');
    IF n <> 0 THEN
        RAISE EXCEPTION 'verify/073 #8: a foreign key was added to a technician '
                        'column on a settled document. See 014''s reasoning and '
                        '073 section 6 — a workshop has staff turnover, and a '
                        'settled plan records who WAS assigned, not who is employed.';
    END IF;
    passed := passed + 1;

    -- ── CLEANUP ───────────────────────────────────────────────────────────
    -- Organisation A went with check 7. Organisation B and the tenant remain.
    DELETE FROM repair.job_cards       WHERE tenant_id = tid;
    DELETE FROM core.vehicles          WHERE tenant_id = tid;
    DELETE FROM core.customers         WHERE tenant_id = tid;
    DELETE FROM parts.stock_items      WHERE tenant_id = tid;
    DELETE FROM identity.organizations WHERE tenant_id = tid;
    DELETE FROM identity.tenants       WHERE id = tid;

    RAISE NOTICE 'verify/073: % / 8 passed. The load-bearing ones are 4 (a '
                 'cross-workshop reference refused), 5 (a SET NULL delete '
                 'actually run) and 7 (a populated organisation still '
                 'deletable).', passed;
END
$verify$;

-- ⚠️ NOT TESTED HERE, AND SAID SO RATHER THAN IMPLIED:
--
--   · `fk_policy_invoice_scope ON DELETE SET NULL (invoice_id)` can never
--     fire. `finance.invoices` refuses DELETE unconditionally ("void the
--     invoice with a reason instead"), so there is no reachable path to it.
--     Check 1 asserts its definition; nothing can exercise it.
--   · Four of the six SET NULL keys and one of the two CASCADE keys are
--     asserted by definition only. One of each action is exercised on a real
--     row, which is what distinguishes a working mechanism from a declared
--     one; exercising all eighteen would need a fixture per table for
--     diminishing return.
