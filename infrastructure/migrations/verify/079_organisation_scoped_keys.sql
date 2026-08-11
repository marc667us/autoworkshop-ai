-- verify/079 — the fourteen keys refuse a cross-organisation reference, and the
-- three SET NULLs no longer take `tenant_id` down with them.
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 CHECK 3 IS THE ONE THAT MATTERS, AND IT IS A WRITE, NOT AN INSPECTION.
--
-- Counting three columns in `pg_constraint` proves the DDL landed. It does not
-- prove the database REFUSES anything — and this repository has a recorded
-- defect for exactly that gap: "owner-scoping written and never executed". So
-- check 3 actually attempts the cross-organisation insert that 073's header
-- describes (org A writing a row against org B's parent, same tenant) and
-- requires it to fail.
--
-- ⚠️ RI CHECKS BYPASS RLS, so this proves something RLS cannot. Measured
-- 2026-08-09: org A could not READ org B's job card and could still WRITE a
-- warranty citing it.
--
-- ⚠️ THIS FILE ROLLS BACK. Every row it writes is discarded.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $verify$
DECLARE
    n         int;
    two_col   int;
    setnull   int;
    tenant    uuid;
    org_a     uuid;
    org_b     uuid;
    asset_b   uuid;
    failed    boolean;
BEGIN
    PERFORM set_config('app.current_role', 'admin', true);
    IF NOT identity.is_platform_admin() THEN
        RAISE EXCEPTION 'verify/079: the platform-admin escape is not live; every '
                        'count below would be a confident zero over invisible rows.';
    END IF;

    -- 1. All fourteen are now three-column.
    SELECT count(*) INTO n
      FROM pg_constraint k
      JOIN pg_class c ON c.oid = k.conrelid
     WHERE k.contype = 'f'
       AND array_length(k.conkey, 1) = 3
       AND k.conname IN ('fk_credit_invoice_scope','fk_line_invoice_scope',
            'fk_payment_invoice_scope','fk_receipt_payment_scope','fk_refund_payment_scope',
            'fk_link_asset_scope','fk_receipt_po_scope','fk_po_line_scope',
            'fk_po_line_item_scope','fk_requisition_item_scope','fk_reservation_item_scope',
            'fk_movement_item_scope','fk_event_claim_scope','fk_claim_policy_scope');
    IF n <> 14 THEN
        RAISE EXCEPTION 'check 1 FAILED: % of 14 keys are three-column.', n;
    END IF;

    -- 2. The two legitimate two-column keys were NOT touched. Their parent IS
    --    identity.organizations, so a third column would be nonsense.
    SELECT count(*) INTO two_col
      FROM pg_constraint k
     WHERE k.contype = 'f' AND array_length(k.conkey, 1) = 2
       AND k.conname IN ('fk_profile_org_scope','fk_pricing_org_scope');
    IF two_col <> 2 THEN
        RAISE EXCEPTION 'check 2 FAILED: the two organisation-parent keys should '
                        'still be two-column; found % of 2. 079 over-reached.', two_col;
    END IF;

    -- 3. 🔴 THE REFUSAL, PROVEN BY ATTEMPTING IT.
    SELECT id INTO tenant FROM identity.tenants LIMIT 1;
    IF tenant IS NULL THEN
        RAISE EXCEPTION 'check 3 FAILED: no tenant exists, so the refusal cannot be '
                        'exercised. Do not weaken this into a skip — an untested '
                        'constraint is the defect this file exists to catch.';
    END IF;

    SELECT id INTO org_a FROM identity.organizations WHERE tenant_id = tenant LIMIT 1;
    INSERT INTO identity.organizations (tenant_id, name, org_type, status)
         VALUES (tenant, 'verify079 other org', 'individual_workshop', 'active')
      RETURNING id INTO org_b;

    -- ⚠️ media.assets -> media.links IS CHOSEN BECAUSE IT IS SELF-CONTAINED.
    -- The pair needs no job card, vehicle or customer, so this check exercises
    -- the CONSTRAINT rather than the ability to build a fixture. warranty was
    -- tried first and abandoned: warranty.policies requires a NOT NULL
    -- job_card_id, which drags in the whole repair chain and would make a
    -- fixture failure look like a constraint failure.
    INSERT INTO media.assets (tenant_id, organization_id, storage_key, content_type)
         VALUES (tenant, org_b, 'verify079/other-org.bin', 'application/octet-stream')
      RETURNING id INTO asset_b;

    -- Org A tries to link org B's asset, same tenant. The old two-column key
    -- permitted this; the new one must not.
    failed := false;
    BEGIN
        INSERT INTO media.links (tenant_id, organization_id, asset_id, owner_type, owner_id)
             VALUES (tenant, org_a, asset_b, 'job_card', gen_random_uuid());
    EXCEPTION WHEN foreign_key_violation THEN
        failed := true;
    END;

    IF NOT failed THEN
        RAISE EXCEPTION 'check 3 FAILED: organisation % linked organisation %''s media '
                        'asset inside the same tenant. The key is three columns wide '
                        'and is not enforcing them.', org_a, org_b;
    END IF;

    -- 3b. The SAME insert inside the OWNING organisation still works. A
    --     constraint that refuses everything is not a constraint, it is an outage.
    INSERT INTO media.links (tenant_id, organization_id, asset_id, owner_type, owner_id)
         VALUES (tenant, org_b, asset_b, 'job_card', gen_random_uuid());

    -- 4. The three SET NULLs name their column, so a parent delete cannot try to
    --    write NULL into a NOT NULL tenant_id.
    SELECT count(*) INTO setnull
      FROM pg_constraint k
     WHERE k.contype = 'f'
       AND k.conname IN ('fk_receipt_po_scope','fk_po_line_item_scope',
                         'fk_requisition_item_scope')
       AND k.confdeltype = 'n'
       AND array_length(k.confdelsetcols, 1) = 1;
    IF setnull <> 3 THEN
        RAISE EXCEPTION 'check 4 FAILED: % of 3 SET NULL keys name the column they null. '
                        'A composite SET NULL nulls EVERY key column, including the NOT '
                        'NULL tenant_id, so the delete raises instead of nulling.', setnull;
    END IF;

    -- 5. The five new unique indexes exist. Without them the keys above could
    --    not have been created at all, so this is belt-and-braces against a
    --    future migration dropping one and taking the keys with it.
    SELECT count(*) INTO n FROM pg_indexes
     WHERE indexname IN ('finance_payments_id_tenant_org_key','media_assets_id_tenant_org_key',
                         'parts_stock_items_id_tenant_org_key','warranty_claims_id_tenant_org_key',
                         'warranty_policies_id_tenant_org_key');
    IF n <> 5 THEN
        RAISE EXCEPTION 'check 5 FAILED: % of 5 parent unique indexes present.', n;
    END IF;

    RAISE NOTICE '079 verify: 6/6 checks passed (1, 2, 3, 3b, 4, 5) — including a '
                 'real cross-organisation write that was REFUSED.';
END;
$verify$;

ROLLBACK;
