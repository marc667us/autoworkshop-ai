-- 079 — the fourteen keys 073 did not convert.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHAT IS WRONG.
--
-- 073 declared eighteen relationships that did not exist and made them
-- three-column `(x, tenant_id, organization_id)`. It did NOT convert the keys
-- that ALREADY existed, and sixteen of those are two-column `(x, tenant_id)`.
-- Fourteen carry the same hole 073 closed for the others:
--
--     ORGANISATION A CAN ATTACH A ROW TO ORGANISATION B'S PARENT,
--     INSIDE THE SAME TENANT, AND NO POLICY IS CONSULTED.
--
-- 🔴 RLS DOES NOT STOP THIS, AND THAT IS THE WHOLE POINT. Referential-integrity
-- checks bypass row-level security even under FORCE. Measured on 2026-08-09:
-- organisation A could not READ organisation B's job card (0 rows) and could
-- still WRITE a warranty citing it (`INSERT 0 1`). RLS answers reachability for
-- reads, not for references.
--
-- `docs/05-database/RELATIONSHIPS.md` §8 names all fourteen.
--
-- ⚠️ TWO OF THE SIXTEEN ARE CORRECTLY TWO-COLUMN AND ARE NOT TOUCHED.
-- `core.organization_profile.fk_profile_org_scope` and
-- `repair.organization_pricing.fk_pricing_org_scope` reference
-- `identity.organizations(id, tenant_id)` — the parent IS the organisation, so
-- there is no third column to add. Converting them would be nonsense; they are
-- excluded by name below rather than by a filter that might drift.
--
-- ── A SECOND DEFECT, FOUND WHILE MEASURING FOR THIS ONE ───────────────────
--
-- 🔴 THREE OF THE FOURTEEN ARE `ON DELETE SET NULL` ON A COMPOSITE KEY, AND
-- THAT NULLS EVERY COLUMN IN THE KEY — including `tenant_id`, which is NOT NULL
-- on all three children (verified, not assumed). So today, deleting a
-- `parts.stock_items` row that any purchase-order line references does not null
-- the reference: it RAISES, because the cascade tries to write NULL into
-- `tenant_id`. The delete fails for a reason that has nothing to do with the
-- caller's intent.
--
--   parts.goods_receipts.fk_receipt_po_scope
--   parts.purchase_order_lines.fk_po_line_item_scope
--   parts.purchase_requisitions.fk_requisition_item_scope
--
-- 073 already recorded this lesson and used the fix — `SET NULL (column)`,
-- PostgreSQL 15+ — for the keys it created. These three predate it. Widening
-- them to three columns without naming the column would make the same bug
-- worse, so both are fixed in one step.
--
-- ── WHAT THIS MIGRATION DOES ──────────────────────────────────────────────
--
--   1. Adds the `(id, tenant_id, organization_id)` unique index to the five
--      parents that lack one. A three-column foreign key needs it to exist;
--      `finance.invoices`, `parts.purchase_orders` and `parts.goods_receipts`
--      already have theirs from 073.
--   2. REFUSES TO PROCEED if any existing row already crosses an organisation
--      boundary, naming every one. Zero locally; production is a different
--      database and this migration does not assume they agree.
--   3. Drops and recreates the fourteen keys with the third column, preserving
--      each one's existing ON DELETE action and naming the column on the three
--      SET NULLs.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. the unique indexes the new keys reference ───────────────────────────
--
-- A foreign key needs a unique constraint or index on exactly its referenced
-- columns. Created CONCURRENTLY is impossible inside a transaction and this
-- migration must be atomic, so these are plain CREATE UNIQUE INDEX. The tables
-- are small (this product has one live workshop) and the lock is brief; on a
-- large table this step would need its own migration outside a transaction.

CREATE UNIQUE INDEX IF NOT EXISTS finance_payments_id_tenant_org_key
    ON finance.payments (id, tenant_id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS media_assets_id_tenant_org_key
    ON media.assets (id, tenant_id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS parts_stock_items_id_tenant_org_key
    ON parts.stock_items (id, tenant_id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS warranty_claims_id_tenant_org_key
    ON warranty.claims (id, tenant_id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS warranty_policies_id_tenant_org_key
    ON warranty.policies (id, tenant_id, organization_id);

-- ── 2. refuse to constrain data that already violates the constraint ───────

DO $check$
DECLARE
    r         record;
    n         bigint;
    report    text := '';
    offenders int := 0;
    checked   int := 0;
BEGIN
    -- 🔴 WITHOUT THIS ESCAPE THE CHECK BELOW IS INERT, AND IT WOULD PASS.
    --
    -- Every table here is FORCE RLS and the migration role does not bypass it
    -- in production — the owner is a superuser locally and is NOT one on
    -- Render. 073's own orphan check read 6 rows as the owner and 0 as the
    -- Render role. A confident zero over invisible rows is the worst possible
    -- result for a check that gates a schema change.
    --
    -- ⚠️ AND THE ESCAPE IS ASSERTED, NOT ASSUMED — migration 077 changed
    -- `is_platform_admin()` so that `app.current_role = 'admin'` is no longer
    -- sufficient on its own: the caller must ALSO own
    -- `identity.platform_administrators`. A migration does, which is exactly
    -- the case 077 preserved for seeds and psql. If that ever stops being true
    -- this block must be rewritten, never skipped.
    PERFORM set_config('app.current_role', 'admin', true);

    IF NOT identity.is_platform_admin() THEN
        RAISE EXCEPTION
            '079: cannot see the rows it is about to constrain. Setting '
            'app.current_role did not make is_platform_admin() true — since 077 '
            'that predicate also requires the caller to own '
            'identity.platform_administrators. A policy or that function has '
            'changed and this block must be rewritten, not skipped.';
    END IF;

    FOR r IN
        SELECT c.relnamespace::regnamespace || '.' || c.relname AS child,
               k.conname,
               (SELECT attname FROM pg_attribute
                 WHERE attrelid = k.conrelid AND attnum = k.conkey[1]) AS col,
               p.relnamespace::regnamespace || '.' || p.relname AS parent
          FROM pg_constraint k
          JOIN pg_class c ON c.oid = k.conrelid
          JOIN pg_class p ON p.oid = k.confrelid
         WHERE k.contype = 'f'
           AND array_length(k.conkey, 1) = 2
           -- The two legitimate two-column keys, excluded BY NAME.
           AND k.conname NOT IN ('fk_profile_org_scope', 'fk_pricing_org_scope')
           AND c.relnamespace::regnamespace::text IN
               ('finance','parts','reception','repair','warranty','core','crm',
                'comms','media','catalogue')
    LOOP
        checked := checked + 1;
        EXECUTE format(
            'SELECT count(*) FROM %s ch
               JOIN %s pa ON pa.id = ch.%I AND pa.tenant_id = ch.tenant_id
              WHERE pa.organization_id IS DISTINCT FROM ch.organization_id',
            r.child, r.parent, r.col) INTO n;
        IF n > 0 THEN
            offenders := offenders + 1;
            report := report || format(E'\n  · %s.%s -> %s: %s row(s)',
                                       r.child, r.conname, r.parent, n);
        END IF;
    END LOOP;

    -- ⚠️ A CHECK THAT FOUND NOTHING TO CHECK IS NOT A PASS. If the constraint
    -- names drift, the loop above runs zero times and reports a clean zero.
    -- Fourteen is the number `RELATIONSHIPS.md` §8 records; anything else means
    -- the schema moved and this migration is reasoning about the wrong keys.
    IF checked <> 14 THEN
        RAISE EXCEPTION
            '079: expected 14 two-column keys to convert, found %. The schema '
            'has moved since RELATIONSHIPS.md §8 was written. Re-derive the '
            'list rather than letting this migration run over the wrong set.',
            checked;
    END IF;

    IF offenders > 0 THEN
        RAISE EXCEPTION E'079: % relationship(s) already hold rows that point at another organisation:%\n\n  Every one must be resolved before the key can be tightened. A\n  reference that crosses an organisation boundary is the hole this\n  migration exists to close — see the header.',
            offenders, report;
    END IF;

    RAISE NOTICE '079: 14 keys checked, 0 cross-organisation rows. Safe to tighten.';
END;
$check$;

-- ── 3. the fourteen keys ───────────────────────────────────────────────────
--
-- Each ON DELETE action is PRESERVED exactly as it was. This migration changes
-- what a key permits, not what a delete does — with the single deliberate
-- exception of naming the column on the three SET NULLs, which is a fix, not a
-- change of intent (see the header).

-- finance.credit_notes -> finance.invoices
ALTER TABLE finance.credit_notes DROP CONSTRAINT fk_credit_invoice_scope;
ALTER TABLE finance.credit_notes
    ADD CONSTRAINT fk_credit_invoice_scope
    FOREIGN KEY (invoice_id, tenant_id, organization_id)
    REFERENCES finance.invoices (id, tenant_id, organization_id)
    ON DELETE RESTRICT;

-- finance.invoice_lines -> finance.invoices
ALTER TABLE finance.invoice_lines DROP CONSTRAINT fk_line_invoice_scope;
ALTER TABLE finance.invoice_lines
    ADD CONSTRAINT fk_line_invoice_scope
    FOREIGN KEY (invoice_id, tenant_id, organization_id)
    REFERENCES finance.invoices (id, tenant_id, organization_id)
    ON DELETE CASCADE;

-- finance.payments -> finance.invoices
ALTER TABLE finance.payments DROP CONSTRAINT fk_payment_invoice_scope;
ALTER TABLE finance.payments
    ADD CONSTRAINT fk_payment_invoice_scope
    FOREIGN KEY (invoice_id, tenant_id, organization_id)
    REFERENCES finance.invoices (id, tenant_id, organization_id)
    ON DELETE RESTRICT;

-- finance.receipts -> finance.payments
ALTER TABLE finance.receipts DROP CONSTRAINT fk_receipt_payment_scope;
ALTER TABLE finance.receipts
    ADD CONSTRAINT fk_receipt_payment_scope
    FOREIGN KEY (payment_id, tenant_id, organization_id)
    REFERENCES finance.payments (id, tenant_id, organization_id)
    ON DELETE RESTRICT;

-- finance.refunds -> finance.payments
ALTER TABLE finance.refunds DROP CONSTRAINT fk_refund_payment_scope;
ALTER TABLE finance.refunds
    ADD CONSTRAINT fk_refund_payment_scope
    FOREIGN KEY (payment_id, tenant_id, organization_id)
    REFERENCES finance.payments (id, tenant_id, organization_id)
    ON DELETE RESTRICT;

-- media.links -> media.assets
ALTER TABLE media.links DROP CONSTRAINT fk_link_asset_scope;
ALTER TABLE media.links
    ADD CONSTRAINT fk_link_asset_scope
    FOREIGN KEY (asset_id, tenant_id, organization_id)
    REFERENCES media.assets (id, tenant_id, organization_id)
    ON DELETE CASCADE;

-- parts.goods_receipts -> parts.purchase_orders
-- 🔴 `SET NULL (purchase_order_id)`, not bare SET NULL — see the header.
ALTER TABLE parts.goods_receipts DROP CONSTRAINT fk_receipt_po_scope;
ALTER TABLE parts.goods_receipts
    ADD CONSTRAINT fk_receipt_po_scope
    FOREIGN KEY (purchase_order_id, tenant_id, organization_id)
    REFERENCES parts.purchase_orders (id, tenant_id, organization_id)
    ON DELETE SET NULL (purchase_order_id);

-- parts.purchase_order_lines -> parts.purchase_orders
ALTER TABLE parts.purchase_order_lines DROP CONSTRAINT fk_po_line_scope;
ALTER TABLE parts.purchase_order_lines
    ADD CONSTRAINT fk_po_line_scope
    FOREIGN KEY (purchase_order_id, tenant_id, organization_id)
    REFERENCES parts.purchase_orders (id, tenant_id, organization_id)
    ON DELETE CASCADE;

-- parts.purchase_order_lines -> parts.stock_items
ALTER TABLE parts.purchase_order_lines DROP CONSTRAINT fk_po_line_item_scope;
ALTER TABLE parts.purchase_order_lines
    ADD CONSTRAINT fk_po_line_item_scope
    FOREIGN KEY (stock_item_id, tenant_id, organization_id)
    REFERENCES parts.stock_items (id, tenant_id, organization_id)
    ON DELETE SET NULL (stock_item_id);

-- parts.purchase_requisitions -> parts.stock_items
ALTER TABLE parts.purchase_requisitions DROP CONSTRAINT fk_requisition_item_scope;
ALTER TABLE parts.purchase_requisitions
    ADD CONSTRAINT fk_requisition_item_scope
    FOREIGN KEY (stock_item_id, tenant_id, organization_id)
    REFERENCES parts.stock_items (id, tenant_id, organization_id)
    ON DELETE SET NULL (stock_item_id);

-- parts.reservations -> parts.stock_items
ALTER TABLE parts.reservations DROP CONSTRAINT fk_reservation_item_scope;
ALTER TABLE parts.reservations
    ADD CONSTRAINT fk_reservation_item_scope
    FOREIGN KEY (stock_item_id, tenant_id, organization_id)
    REFERENCES parts.stock_items (id, tenant_id, organization_id)
    ON DELETE RESTRICT;

-- parts.stock_movements -> parts.stock_items
ALTER TABLE parts.stock_movements DROP CONSTRAINT fk_movement_item_scope;
ALTER TABLE parts.stock_movements
    ADD CONSTRAINT fk_movement_item_scope
    FOREIGN KEY (stock_item_id, tenant_id, organization_id)
    REFERENCES parts.stock_items (id, tenant_id, organization_id)
    ON DELETE RESTRICT;

-- warranty.claim_events -> warranty.claims
ALTER TABLE warranty.claim_events DROP CONSTRAINT fk_event_claim_scope;
ALTER TABLE warranty.claim_events
    ADD CONSTRAINT fk_event_claim_scope
    FOREIGN KEY (claim_id, tenant_id, organization_id)
    REFERENCES warranty.claims (id, tenant_id, organization_id)
    ON DELETE CASCADE;

-- warranty.claims -> warranty.policies
ALTER TABLE warranty.claims DROP CONSTRAINT fk_claim_policy_scope;
ALTER TABLE warranty.claims
    ADD CONSTRAINT fk_claim_policy_scope
    FOREIGN KEY (policy_id, tenant_id, organization_id)
    REFERENCES warranty.policies (id, tenant_id, organization_id)
    ON DELETE RESTRICT;

COMMIT;
