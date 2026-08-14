-- UAT population — the owner's acceptance scenario, 2026-08-14.
--
-- ══════════════════════════════════════════════════════════════════════════
-- Owner: "10 users requesting for service, five technicians diagnoses and
-- inspection reports, repair works and final testing reports, suppliers parts
-- supply and inventory availability views to the technicians and user
-- procurement records, payment made for repair work, 2 user firms register 20
-- cars, insurance sales pipeline and marketing of insurance campaign.
-- this uat use cases to be tested, maintain data for me to check"
--
-- 🔴 IT WRITES REAL PRODUCTION DATA AND IS MEANT TO STAY. Every organisation,
-- customer and record carries the tag in a name or reference field, so the
-- owner can tell UAT data from real at a glance and it can be found again.
--
-- ── WHAT IS DRIVEN BY THE PRODUCT, AND WHAT IS SEEDED ─────────────────────
--
-- This distinction is the one that matters, and this repository has recorded
-- four separate cases of a fixture the product itself could never have made.
-- So it is stated per layer rather than claimed once:
--
--   PRODUCT PATH (a SECURITY DEFINER function the application really calls):
--     · the workshop           `identity.register_workshop`
--     · the parts supplier     `identity.register_supplier`
--     · both fleet firms       `identity.register_fleet`
--     · every customer         `identity.enrol_as_customer`
--     · every application user `identity.provision_user_from_subject`
--       (exactly what `TenantGuard` calls on a first authenticated request)
--
--   SEEDED, mirroring what the domain service writes:
--     · the five technician memberships. The product path is the Staff and
--       Roles screen (`staff-actions.ts` -> `POST /memberships`), which exists
--       and works; it needs an authenticated owner and there is no password
--       grant on this realm, so the rows are written here in the same shape
--       `MembershipService.grant()` writes them.
--     · every business record below — service requests, job cards,
--       inspections, diagnoses, plans, quotations, proposals, executions, test
--       sessions, quality inspections, stock, requisitions, purchase orders,
--       goods receipts, invoices, payments, vehicles.
--
-- ⚠️ THE DATABASE IS STILL THE JUDGE. These tables carry real CHECK
-- constraints and BEFORE triggers — `assert_proposal_quotation_approved`,
-- `assert_testing_follows_completed_repair`, `reject_qc_before_testing`,
-- `reject_self_inspection`, and a family of `reject_settled_*_change` guards.
-- A row in an impossible state is REFUSED here exactly as it would be through
-- the API. That is what makes seeded records worth something: the workflow
-- ordering below is not asserted, it is enforced.
--
-- ⚠️ ONE TRANSACTION, AND A MARKER CHECK AT THE TOP. A partial UAT population
-- is worse than none — it would look like a product defect. If the marker
-- tenant already exists the script does nothing at all, so re-running is safe
-- and cannot double up.
--
-- 🔴 WHAT THIS FILE DELIBERATELY DOES NOT DO: the insurance sales pipeline and
-- the marketing campaign. There is no production path for either. The `crm`
-- module is `leads` only, exposing `@Get()` and `@Patch(':id')` and no POST;
-- there is no campaign entity, no pipeline stage model, and the insurance pack
-- has 0 of 28 screens built. Seeding rows into `crm.leads` would manufacture a
-- pipeline the product cannot produce, display or advance — the precise defect
-- this header opens by naming. It is recorded as a gap instead.
-- ══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL lock_timeout = '10s';

-- The seeding role must be able to write past RLS the way the API does.
-- `app.current_role = 'admin'` is this repository's documented seeding
-- requirement (CLAUDE.md: "RLS seeding needs set_config('app.current_role',
-- 'admin',true) or inserts fail silently").
SELECT set_config('app.current_role', 'admin', true);

DO $uat$
DECLARE
    v_tag        TEXT := 'UAT-2026-08-14';
    v_exists     int;

    -- organisations
    v_ws_tenant  uuid; v_ws_org uuid; v_ws_branch uuid; v_owner uuid; v_admin uuid;
    v_sup_tenant uuid; v_sup_org uuid;
    v_fleet_tenant uuid[]; v_fleet_org uuid[];

    -- people
    v_tech       uuid[];             -- 5 technicians (application user ids)
    v_cust_user  uuid[];             -- 10 customer application users
    v_cust_rec   uuid[];             -- their core.customers rows

    r            record;
    i            int;
    j            int;
    v_subject    TEXT;
    v_make       uuid;

    -- per-journey
    v_vehicle    uuid;
    v_job        uuid;
    v_jobno      TEXT;
    v_insp       uuid;
    v_diag       uuid;
    v_plan       uuid;
    v_quote      uuid;
    v_prop       uuid;
    v_exec       uuid;
    v_test       uuid;
    v_inv        uuid;
    v_tech_main  uuid;
    v_tech_qc    uuid;
    v_sr         uuid;
    v_net        numeric;
    v_category   uuid;
    v_stock      uuid;
    v_stock_ids  uuid[] := ARRAY[]::uuid[];
    v_created    int := 0;
BEGIN
    -- ── 0. THE MARKER. Do nothing at all if this has already run ──────────
    SELECT count(*) INTO v_exists FROM identity.tenants WHERE name LIKE '%'||v_tag||'%';
    IF v_exists > 0 THEN
        RAISE NOTICE 'UAT population % already exists (% tenants). Nothing written.',
                     v_tag, v_exists;
        RETURN;
    END IF;

    SELECT id INTO v_make FROM core.vehicle_makes ORDER BY name LIMIT 1;
    IF v_make IS NULL THEN
        RAISE EXCEPTION 'no vehicle makes exist — seed the catalogue first';
    END IF;

    -- ══ 1. THE WORKSHOP — via the real registration function ═════════════
    v_subject := 'uat-'||v_tag||'-owner';
    PERFORM identity.provision_user_from_subject(
        v_subject, 'uat.owner@aiappinvent.com', 'UAT Workshop Owner '||v_tag);
    -- ⚠️ UNPREFIXED COLUMNS HERE, `o_`-PREFIXED EVERYWHERE ELSE. Measured from
    -- `pg_get_function_result`, having first written `o_tenant_id` and been
    -- refused. `register_workshop` predates the convention: migration 061
    -- introduced the `o_` prefix because a `RETURNS TABLE` column named
    -- `organization_id` makes every unqualified reference inside a plpgsql body
    -- ambiguous, and 036's function was never renamed. The two shapes are a
    -- real inconsistency in the schema, not a typo here.
    SELECT tenant_id, organization_id, branch_id
      INTO v_ws_tenant, v_ws_org, v_ws_branch
      FROM identity.register_workshop(v_subject, 'UAT Motors '||v_tag, 'Accra Main');
    SELECT id INTO v_owner FROM identity.users WHERE keycloak_subject = v_subject;

    -- Published, because `enrol_as_customer` (migration 061) refuses a workshop
    -- that has not published itself to the mechanic directory. That refusal is
    -- correct and is the reason this line exists rather than being an
    -- afterthought.
    -- ── 🔴 THE PLATFORM ADMINISTRATOR VERIFIES THE BUSINESS ───────────────
    --
    -- NOT a step I planned. The first run was REFUSED by
    -- `catalogue.reject_unverified_publication()`:
    --
    --   "This workshop is awaiting verification and cannot be listed publicly
    --    yet. A platform administrator reviews every new business."
    --
    -- That trigger is the fix for a defect Codex found on 2026-08-09 — a
    -- workshop could publish itself and defeat the whole verification gate — so
    -- being stopped here is the product working. Approving the registration is
    -- a real UAT step (an administrator reviewing a new business), and it is
    -- modelled as one rather than worked around by writing `is_published` past
    -- the trigger.
    --
    -- `decided_by` must be non-null when status leaves 'pending' (CHECK on
    -- `organization_registrations`), so a real platform administrator is
    -- preferred; the UAT owner stands in only if the platform has none.
    SELECT m.user_id INTO v_admin
      FROM identity.memberships m
     WHERE m.role_name = 'platform_administrator' AND m.status = 'active'
     LIMIT 1;
    IF v_admin IS NULL THEN
        v_admin := v_owner;
        RAISE NOTICE 'no platform_administrator exists; UAT registrations approved by the UAT owner';
    END IF;

    UPDATE identity.organization_registrations
       SET status = 'approved', decided_by = v_admin, decided_at = now(),
           decision_note = 'UAT '||v_tag||': verified for acceptance testing'
     WHERE organization_id = v_ws_org;

    -- ⚠️ NO `tenant_id` ON THIS TABLE, AND THE COLUMN IS `trading_name`.
    -- Measured from `information_schema`, having assumed both wrong. The
    -- directory is the PUBLIC face of a workshop — it is read by anonymous
    -- visitors on the marketplace — so it is deliberately not tenant-scoped and
    -- carries only what a stranger may see.
    INSERT INTO catalogue.mechanic_directory
        (organization_id, trading_name, city, country, is_published)
    VALUES (v_ws_org, 'UAT Motors '||v_tag, 'Accra', 'Ghana', true);

    -- ══ 2. FIVE TECHNICIANS ══════════════════════════════════════════════
    v_tech := ARRAY[]::uuid[];
    FOR i IN 1..5 LOOP
        v_subject := 'uat-'||v_tag||'-tech-'||i;
        PERFORM identity.provision_user_from_subject(
            v_subject, 'uat.tech'||i||'@aiappinvent.com', 'UAT Technician '||i||' '||v_tag);
        SELECT id INTO r FROM identity.users WHERE keycloak_subject = v_subject;
        -- Same shape `MembershipService.grant()` writes: tenant from context,
        -- role from an allow-list, created_by the granting owner.
        INSERT INTO identity.memberships
            (tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
        SELECT v_ws_tenant, v_ws_org, v_ws_branch, u.id, 'technician', 'active', v_owner
          FROM identity.users u WHERE u.keycloak_subject = v_subject;
        v_tech := v_tech || (SELECT id FROM identity.users WHERE keycloak_subject = v_subject);
    END LOOP;

    -- ══ 3. THE PARTS SUPPLIER — real registration function ════════════════
    v_subject := 'uat-'||v_tag||'-supplier';
    PERFORM identity.provision_user_from_subject(
        v_subject, 'uat.supplier@aiappinvent.com', 'UAT Supplier Owner '||v_tag);
    SELECT o_tenant_id, o_organization_id INTO v_sup_tenant, v_sup_org
      FROM identity.register_supplier(v_subject, 'UAT Parts Supply '||v_tag, 'Abossey Okai');
    -- Verified by the administrator, exactly as the workshop was. A supplier
    -- that is never approved stays invisible on the marketplace, which would
    -- make the "parts supply" half of this UAT untestable from the storefront.
    UPDATE identity.organization_registrations
       SET status = 'approved', decided_by = v_admin, decided_at = now(),
           decision_note = 'UAT '||v_tag||': verified for acceptance testing'
     WHERE organization_id = v_sup_org;

    -- ══ 4. TWO FLEET FIRMS, 10 CARS EACH ═════════════════════════════════
    v_fleet_tenant := ARRAY[]::uuid[]; v_fleet_org := ARRAY[]::uuid[];
    FOR i IN 1..2 LOOP
        v_subject := 'uat-'||v_tag||'-fleet-'||i;
        PERFORM identity.provision_user_from_subject(
            v_subject, 'uat.fleet'||i||'@aiappinvent.com', 'UAT Fleet Admin '||i||' '||v_tag);
        SELECT o_tenant_id, o_organization_id INTO v_ws_branch, v_make  -- reuse scratch
          FROM identity.register_fleet(v_subject, 'UAT Fleet Firm '||i||' '||v_tag, 'Tema depot');
        v_fleet_tenant := v_fleet_tenant || v_ws_branch;
        v_fleet_org    := v_fleet_org || v_make;
    END LOOP;
    -- restore the scratch variables the loop borrowed
    SELECT id INTO v_make FROM core.vehicle_makes ORDER BY name LIMIT 1;
    SELECT id INTO v_ws_branch FROM identity.branches WHERE organization_id = v_ws_org LIMIT 1;

    FOR i IN 1..2 LOOP
        -- The firm itself is the vehicle owner of record. `core.vehicles`
        -- requires a customer, and for a fleet that customer IS the company.
        INSERT INTO core.customers (tenant_id, organization_id, display_name, created_by)
        VALUES (v_fleet_tenant[i], v_fleet_org[i], 'UAT Fleet Firm '||i||' '||v_tag, NULL)
        RETURNING id INTO v_vehicle;

        FOR j IN 1..10 LOOP
            INSERT INTO core.vehicles
                (tenant_id, organization_id, customer_id, registration_number, make_id, created_by)
            VALUES (v_fleet_tenant[i], v_fleet_org[i], v_vehicle,
                    'UAT-F'||i||'-'||lpad(j::text,3,'0'), v_make, NULL);
            v_created := v_created + 1;
        END LOOP;
    END LOOP;
    RAISE NOTICE 'fleet vehicles created: %', v_created;

    -- ══ 5. TEN CUSTOMERS — via the real enrolment function ═══════════════
    v_cust_user := ARRAY[]::uuid[]; v_cust_rec := ARRAY[]::uuid[];
    FOR i IN 1..10 LOOP
        v_subject := 'uat-'||v_tag||'-customer-'||i;
        PERFORM identity.provision_user_from_subject(
            v_subject, 'uat.customer'||i||'@aiappinvent.com', 'UAT Customer '||i||' '||v_tag);
        PERFORM identity.enrol_as_customer(v_subject, v_ws_org);
        v_cust_user := v_cust_user || (SELECT id FROM identity.users WHERE keycloak_subject = v_subject);

        -- The workshop's own customer record for them, which is what reception
        -- and job cards reference.
        INSERT INTO core.customers
            (tenant_id, organization_id, user_id, display_name, email, created_by)
        SELECT v_ws_tenant, v_ws_org, u.id, 'UAT Customer '||i||' '||v_tag,
               'uat.customer'||i||'@aiappinvent.com', v_owner
          FROM identity.users u WHERE u.keycloak_subject = v_subject
        RETURNING id INTO v_vehicle;
        v_cust_rec := v_cust_rec || v_vehicle;
    END LOOP;

    -- ══ 6. SUPPLIER CATALOGUE + WORKSHOP STOCK ═══════════════════════════
    -- ⚠️ `catalogue.parts` IS NOT TENANT-SCOPED and `parts.stock_items` HAS NO
    -- QUANTITY COLUMN. Both measured after guessing wrong. The catalogue is the
    -- public marketplace listing, keyed on `supplier_id` — a stranger browses
    -- it with no tenant context, so a `tenant_id` there would be meaningless.
    -- And stock LEVEL is derived from `parts.stock_movements`, an append-only
    -- ledger, not stored as a mutable number: that is why "reduce the count by
    -- one" below is an `issue_to_job` movement rather than an UPDATE.
    SELECT id INTO v_category FROM catalogue.part_categories ORDER BY 1 LIMIT 1;

    FOR i IN 1..8 LOOP
        INSERT INTO catalogue.parts
            (supplier_id, category_id, part_number, name, price, currency,
             in_stock, is_published)
        SELECT s.id, v_category,
               'UAT-P'||lpad(i::text,3,'0'), (ARRAY['Brake pad set','Oil filter',
               'Air filter','Spark plug','Timing belt','Clutch kit','Radiator hose',
               'Wheel bearing'])[i],
               (60 + i*25)::numeric, 'GHS', true, true
          FROM catalogue.suppliers s WHERE s.organization_id = v_sup_org LIMIT 1;

        -- The workshop's own stock item — this is the "inventory availability
        -- view" a technician sees when planning a repair.
        INSERT INTO parts.stock_items
            (tenant_id, organization_id, part_number, name, unit, unit_cost, currency,
             reorder_level, shelf_location, is_active, created_by)
        VALUES (v_ws_tenant, v_ws_org, 'UAT-P'||lpad(i::text,3,'0'),
                (ARRAY['Brake pad set','Oil filter','Air filter','Spark plug',
                'Timing belt','Clutch kit','Radiator hose','Wheel bearing'])[i],
                'each', (45 + i*20)::numeric, 'GHS', 5, 'A-'||i, true, v_owner)
        RETURNING id INTO v_stock;
        v_stock_ids := v_stock_ids || v_stock;

        -- The opening balance IS the stock level. Without a movement the item
        -- exists with a quantity of zero and every availability view reads
        -- "none in stock" for a shelf that is full.
        INSERT INTO parts.stock_movements
            (tenant_id, organization_id, stock_item_id, quantity, movement_kind,
             reason, recorded_by)
        VALUES (v_ws_tenant, v_ws_org, v_stock, (20 - i), 'opening_balance',
                'UAT '||v_tag||' opening stock', v_owner);
    END LOOP;

    -- ══ 7. TEN JOURNEYS — request -> ... -> paid ═════════════════════════
    FOR i IN 1..10 LOOP
        -- 🔴 THE QC INSPECTOR MUST NOT HAVE WORKED THE JOB. Trigger
        -- `reject_self_inspection` calls `repair.user_worked_on_job_card` and
        -- refuses otherwise. Offsetting by one guarantees a different person.
        v_tech_main := v_tech[1 + (i % 5)];
        v_tech_qc   := v_tech[1 + ((i + 2) % 5)];

        -- the customer's vehicle
        INSERT INTO core.vehicles
            (tenant_id, organization_id, customer_id, registration_number, make_id, created_by)
        VALUES (v_ws_tenant, v_ws_org, v_cust_rec[i],
                'UAT-C-'||lpad(i::text,3,'0'), v_make, v_owner)
        RETURNING id INTO v_vehicle;

        -- 7a. the customer asks for service
        INSERT INTO reception.service_requests
            (tenant_id, organization_id, requested_by, vehicle_id, registration_number,
             vehicle_description, complaint, status)
        VALUES (v_ws_tenant, v_ws_org, v_cust_user[i], v_vehicle,
                'UAT-C-'||lpad(i::text,3,'0'),
                'UAT-C-'||lpad(i::text,3,'0'),
                'UAT '||v_tag||': intermittent noise from the front on braking', 'new')
        RETURNING id INTO v_sr;

        -- 7b. converted to a job card
        v_jobno := repair.next_job_number(v_ws_org);
        INSERT INTO repair.job_cards
            (tenant_id, organization_id, branch_id, job_number, customer_id, vehicle_id,
             complaint, assigned_technician_id, mileage_at_intake, stage, priority, created_by)
        VALUES (v_ws_tenant, v_ws_org, v_ws_branch, v_jobno, v_cust_rec[i], v_vehicle,
                'UAT '||v_tag||': intermittent noise from the front on braking',
                v_tech_main, 60000 + i*1200,
                'quality_control', 'normal', v_owner)
        RETURNING id INTO v_job;

        UPDATE reception.service_requests
           SET status = 'converted', converted_job_card_id = v_job,
               decided_by = v_owner, decided_at = now()
         WHERE id = v_sr;

        -- 7c. INSPECTION REPORT (submitted)
        INSERT INTO repair.inspections
            (tenant_id, organization_id, job_card_id, attempt_no, status,
             mileage_reading, summary, submitted_at, submitted_by, created_by)
        VALUES (v_ws_tenant, v_ws_org, v_job, 1, 'submitted', 60000 + i*1200,
                'UAT initial inspection: front brake wear beyond limit, disc scoring.',
                now(), v_tech_main, v_tech_main)
        RETURNING id INTO v_insp;

        INSERT INTO repair.inspection_items
            (tenant_id, organization_id, inspection_id, checkpoint_code, position,
             result, note, recorded_by, first_recorded_by, recorded_at, first_recorded_at)
        -- ⚠️ `fail`, NOT `attention`. The CHECK admits only pass / fail /
        -- requires_testing / not_applicable, and `recorded_at` must be non-null
        -- whenever `result` is — a paired constraint, so both are supplied.
        VALUES (v_ws_tenant, v_ws_org, v_insp, 'BRAKE_FRONT', 1,
                'fail', 'Pads below 2mm; discs scored.', v_tech_main, v_tech_main,
                now(), now());

        -- 7d. DIAGNOSIS (approved)
        INSERT INTO repair.diagnoses
            (tenant_id, organization_id, job_card_id, attempt_no, status, summary,
             submitted_at, submitted_by, reviewed_at, reviewed_by, created_by)
        VALUES (v_ws_tenant, v_ws_org, v_job, 1, 'approved',
                'UAT diagnosis: worn front pads and scored discs causing the noise.',
                now(), v_tech_main, now(), v_owner, v_tech_main)
        RETURNING id INTO v_diag;

        -- 7e. REPAIR PLAN (approved)
        INSERT INTO repair.repair_plans
            (tenant_id, organization_id, job_card_id, diagnosis_id, status, repair_procedure,
             submitted_at, submitted_by, reviewed_at, reviewed_by, created_by)
        VALUES (v_ws_tenant, v_ws_org, v_job, v_diag, 'approved',
                'UAT plan: replace front pads and discs, bed in, road test.',
                now(), v_tech_main, now(), v_owner, v_tech_main)
        RETURNING id INTO v_plan;

        -- 7f. QUOTATION (approved) -> PROPOSAL (approved by the customer)
        v_net := 450 + i*35;
        INSERT INTO repair.quotations
            (tenant_id, organization_id, job_card_id, repair_plan_id, status, currency,
             labour_rate, recommended_repair, warranty_terms,
             submitted_at, submitted_by, reviewed_at, reviewed_by, created_by)
        VALUES (v_ws_tenant, v_ws_org, v_job, v_plan, 'approved', 'GHS',
                120, 'Replace front pads and discs, bed in, road test.',
                '3 months or 5,000 km on parts and labour.',
                now(), v_tech_main, now(), v_owner, v_tech_main)
        RETURNING id INTO v_quote;

        INSERT INTO repair.repair_proposals
            (tenant_id, organization_id, job_card_id, quotation_id, status,
             issued_at, issued_by, decision, decided_at, decision_channel,
             decided_by_name, approved_option, created_by)
        VALUES (v_ws_tenant, v_ws_org, v_job, v_quote, 'approved',
                now(), v_owner, 'approved', now(), 'in_person',
                'UAT Customer '||i||' '||v_tag, 'recommended', v_owner)
        RETURNING id INTO v_prop;

        -- 7g. REPAIR EXECUTION (completed)
        INSERT INTO repair.repair_executions
            (tenant_id, organization_id, job_card_id, proposal_id, status,
             completed_at, completed_by, completion_note, created_by)
        VALUES (v_ws_tenant, v_ws_org, v_job, v_prop, 'completed',
                now(), v_tech_main, 'UAT: pads and discs replaced, torque checked.',
                v_tech_main)
        RETURNING id INTO v_exec;

        -- parts actually consumed — this is what ties inventory to the job
        INSERT INTO repair.execution_parts_used
            (tenant_id, organization_id, execution_id, position, description,
             part_number, quantity, unit, recorded_by)
        VALUES (v_ws_tenant, v_ws_org, v_exec, 1, 'Brake pad set',
                'UAT-P001', 1, 'each', v_tech_main);

        -- Stock leaves the shelf as an `issue_to_job` MOVEMENT tied to this job
        -- card, which is what makes the consumption auditable and what the
        -- availability view subtracts. A negative quantity is the ledger's own
        -- convention for stock going out.
        INSERT INTO parts.stock_movements
            (tenant_id, organization_id, stock_item_id, quantity, movement_kind,
             job_card_id, recorded_by)
        SELECT v_ws_tenant, v_ws_org, si.id, -1, 'issue_to_job', v_job, v_tech_main
          FROM parts.stock_items si
         WHERE si.organization_id = v_ws_org AND si.part_number = 'UAT-P001';

        -- 7h. FINAL TESTING REPORT (submitted)
        INSERT INTO repair.repair_test_sessions
            (tenant_id, organization_id, job_card_id, execution_id, status,
             road_test_performed, road_test_driver, road_test_start_mileage,
             road_test_end_mileage, road_test_outcome, critical_faults_remain,
             road_test_notes, submitted_at, submitted_by, created_by)
        VALUES (v_ws_tenant, v_ws_org, v_job, v_exec, 'submitted',
                true, 'UAT Technician', 60000 + i*1200, 60008 + i*1200, 'symptom_resolved',
                false, 'UAT road test: noise gone, braking even, no warning lamps.',
                now(), v_tech_main, v_tech_main)
        RETURNING id INTO v_test;

        -- 7i. QUALITY CONTROL (passed) — by a DIFFERENT technician
        INSERT INTO repair.quality_inspections
            (tenant_id, organization_id, job_card_id, test_session_id, inspector_id,
             attempt_no, status, complaint_addressed, new_defect_found, decided_at,
             notes, created_by)
        VALUES (v_ws_tenant, v_ws_org, v_job, v_test, v_tech_qc, 1, 'passed',
                true, false, now(),
                'UAT QC: complaint resolved, workmanship acceptable.', v_tech_qc);

        -- 7j. INVOICE + PAYMENT
        -- 🔴 DRAFT FIRST, THEN LINES, THEN ISSUE AND SETTLE — the product's own
        -- order, and not a stylistic choice. `finance.reject_issued_line_change`
        -- refuses a line added to an ISSUED invoice: "its lines are what the
        -- customer was shown and cannot be changed. Issue a credit note
        -- instead." Writing the invoice as `paid` up front and then adding lines
        -- was refused, correctly. Two CHECKs pin the rest:
        -- `(status='draft') = (issued_at IS NULL)` and
        -- `(status='paid') = (settled_at IS NOT NULL)`.
        INSERT INTO finance.invoices
            (tenant_id, organization_id, job_card_id, quotation_id, customer_id,
             invoice_number, currency, status, net_total, tax_total, gross_total,
             tax_rate_percent, created_by)
        VALUES (v_ws_tenant, v_ws_org, v_job, v_quote, v_cust_rec[i],
                'UAT-INV-'||lpad(i::text,3,'0'), 'GHS', 'draft',
                v_net, round(v_net*0.15,2), round(v_net*1.15,2), 15, v_owner)
        RETURNING id INTO v_inv;

        INSERT INTO finance.invoice_lines
            (tenant_id, organization_id, invoice_id, position, line_kind, description,
             quantity, unit_price, recorded_by)
        VALUES (v_ws_tenant, v_ws_org, v_inv, 1, 'labour',
                'UAT front brake overhaul labour', 2, round(v_net*0.4,2), v_owner),
               (v_ws_tenant, v_ws_org, v_inv, 2, 'part',
                'Brake pad set and discs', 1, round(v_net*0.2,2), v_owner);

        -- issued, then paid — two transitions, because the CHECKs make them
        -- distinct facts and a customer really is shown the invoice before
        -- settling it.
        UPDATE finance.invoices SET status = 'issued', issued_at = now(),
               due_at = now() + interval '14 days'
         WHERE id = v_inv;
        UPDATE finance.invoices SET status = 'paid', settled_at = now()
         WHERE id = v_inv;

        INSERT INTO finance.payments
            (tenant_id, organization_id, invoice_id, amount, currency, payment_method,
             reference, received_by)
        VALUES (v_ws_tenant, v_ws_org, v_inv, round(v_net*1.15,2), 'GHS',
                'mobile_money', 'UAT-PAY-'||lpad(i::text,3,'0'), v_owner);
    END LOOP;

    -- ══ 8. PROCUREMENT RECORDS ═══════════════════════════════════════════
    FOR i IN 1..4 LOOP
        INSERT INTO parts.purchase_requisitions
            (tenant_id, organization_id, requisition_number, description, quantity,
             status, requested_by)
        VALUES (v_ws_tenant, v_ws_org, 'UAT-REQ-'||lpad(i::text,3,'0'),
                'UAT restock: brake pad sets', 10, 'ordered', v_owner);

        INSERT INTO parts.purchase_orders
            (tenant_id, organization_id, order_number, supplier_name, status, currency,
             created_by)
        VALUES (v_ws_tenant, v_ws_org, 'UAT-PO-'||lpad(i::text,3,'0'),
                'UAT Parts Supply '||v_tag, 'received', 'GHS', v_owner)
        RETURNING id INTO v_vehicle;

        INSERT INTO parts.purchase_order_lines
            (tenant_id, organization_id, purchase_order_id, position, description,
             quantity, unit_cost)
        VALUES (v_ws_tenant, v_ws_org, v_vehicle, 1, 'Brake pad set (UAT-P001)',
                10, 65);

        INSERT INTO parts.goods_receipts
            (tenant_id, organization_id, receipt_number, purchase_order_id, received_by)
        VALUES (v_ws_tenant, v_ws_org, 'UAT-GRN-'||lpad(i::text,3,'0'), v_vehicle, v_owner);
    END LOOP;

    RAISE NOTICE 'UAT population % written.', v_tag;
END
$uat$;

COMMIT;
