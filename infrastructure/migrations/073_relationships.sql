-- 073 — the job card is the spine of a workshop, and the database never said so
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHAT THIS IS. Owner instruction, standing since 2026-07-27 and repeated
-- 2026-08-09: *use RELATIONSHIPS in the databases and schemas* — real foreign
-- keys and real joins, not columns that merely look like references.
--
-- Measured against the live schema before writing a line of this:
--
--     30 columns ending in `_id` across the application schemas carry NO
--     foreign key. Twenty name exactly one parent table. THIRTEEN of the
--     twenty point at `repair.job_cards`.
--
-- The job card is the central artefact of an automotive workshop: the invoice,
-- the parts reservation, the bay booking, the stock movement, the appointment
-- it was converted from, the warranty it earned and the claim against that
-- warranty all hang off it. Not one of those thirteen links was declared.
--
-- Eighteen are declared here. Two of the twenty are deliberately left out —
-- see section 6.
--
-- ── ⚠️ FIVE OF THE TWENTY WERE DELIBERATE, AND ARE ARGUED WITH, NOT IGNORED ─
--
-- An absent foreign key is not automatically a defect. Five carry a comment in
-- the migration that created them explaining the omission.
--
-- **TWO ARE RIGHT AND ARE LEFT ALONE.** `014_repair_plans.sql:231`:
--
--     "NOT a foreign key to identity.users: the plan may name somebody who
--      later leaves, and a RESTRICT would block the leaver while a CASCADE
--      would silently strip the assignment out of a settled plan."
--
-- That anticipates and refutes exactly what I first drafted. See section 6.
--
-- **THREE REST ON A PREMISE THAT IS FALSE, AND IT WAS MEASURED.**
-- `043_warranty.sql:49`, repeated at `044_parts_stock.sql:119`:
--
--     "a job card is scoped by tenant + organisation and a composite key would
--      add nothing RLS does not already enforce"
--     "No FK: ... RLS already answers reachability."
--
-- Run on this database as `autoworkshop_app` — NOSUPERUSER, `rolbypassrls =
-- f`, Render's exact privilege shape — in a rolled-back transaction, with
-- organisation A's context and a job card belonging to organisation B of the
-- same tenant:
--
--     A can read B's job card?              0 rows visible   ← RLS works
--     INSERT warranty in A citing B's job   INSERT 0 1       ← and is irrelevant
--
-- 🔴 RLS ANSWERS REACHABILITY FOR READS. IT SAYS NOTHING ABOUT REFERENCES.
-- A policy governs which rows a query returns; no query is involved in storing
-- a uuid. Organisation A wrote a warranty against a job card it cannot see,
-- and nothing refused it. The warranty then renders blank for ever, because
-- every join that would display the job is filtered by the same RLS that let
-- the row be written.
--
-- ── 🔴 WHY A PLAIN `REFERENCES repair.job_cards(id)` WOULD ALSO BE WRONG ───
--
-- REFERENTIAL INTEGRITY CHECKS BYPASS ROW LEVEL SECURITY — PostgreSQL
-- documents it (CREATE POLICY, "Notes") and FORCE RLS does not change it. A
-- single-column key would accept another workshop's id with no policy
-- consulted: it closes "points at nothing" and leaves "points at someone
-- else's" wide open, while looking in a diff like the problem was solved.
--
-- Every key below is scoped to the composite its parent publishes:
--
--     FOREIGN KEY (job_card_id, tenant_id, organization_id)
--          REFERENCES repair.job_cards (id, tenant_id, organization_id)
--
-- All eighteen child tables carry `tenant_id` and `organization_id` NOT NULL
-- (verified against pg_attribute), so MATCH SIMPLE skips the check only when
-- the optional reference is itself NULL — the intended meaning of "this
-- appointment was never converted".
--
-- ── ⚠️ WHAT THIS MIGRATION DOES **NOT** DO ────────────────────────────────
--
-- An earlier draft of this header claimed the three-column shape was "the
-- convention migration 054 established, which `fk_line_invoice_scope`,
-- `fk_payment_invoice_scope` and `fk_po_line_scope` already follow". **THAT IS
-- FALSE and the Supervisor caught it.** All three are TWO-column and predate
-- 054:
--
--     fk_line_invoice_scope   FOREIGN KEY (invoice_id, tenant_id)
--                             REFERENCES finance.invoices (id, tenant_id)
--
-- Counted: **16 two-column `(x, tenant_id)` foreign keys remain** across
-- finance, parts, repair, warranty, media and catalogue — including
-- `fk_claim_policy_scope`, `fk_credit_invoice_scope`, `fk_movement_item_scope`
-- and `fk_link_asset_scope`. Every one of them carries the SAME defect this
-- migration was written about: organisation A can attach an invoice line to
-- organisation B's invoice, or a claim to B's policy, in the same tenant.
--
-- So the honest statement is: **this migration adds eighteen
-- organisation-scoped keys where there were none. It does not make every
-- reference in the schema organisation-scoped — sixteen tenant-only keys are
-- still open, and closing them is the next migration, not this one.**
-- `docs/05-database/RELATIONSHIPS.md` §8 names all sixteen.
--
-- ── 🔴 WHY `NO ACTION` AND NOT `RESTRICT` ─────────────────────────────────
--
-- They differ in WHEN the check runs. RESTRICT fires immediately, before other
-- cascades in the same statement have finished; NO ACTION fires at end of
-- statement. Every one of these children is ALSO cascade-deleted by
-- `organization_id REFERENCES identity.organizations(id) ON DELETE CASCADE`.
--
-- So under RESTRICT, `DELETE FROM identity.organizations` can abort: if the
-- job card's cascade fires before the walk-in's, the walk-in still references
-- it and RESTRICT refuses — even though that same statement was about to
-- delete the walk-in too. Whether it aborts depends on trigger firing order,
-- which depends on constraint creation order. Measured on this database it
-- currently SUCCEEDS; that is luck, not design, and it would flip the next
-- time a constraint is added.
--
-- NO ACTION gives the identical refusal for a genuine orphan-creating delete
-- (deleting only the job card is still refused, and verify/073 proves it)
-- while letting a whole-organisation delete resolve as one set.
--
-- ── 🔴 WHY EVERY `SET NULL` NAMES ITS COLUMN ──────────────────────────────
--
-- Unqualified, `SET NULL` nulls EVERY referencing column — including
-- `tenant_id` and `organization_id`, both NOT NULL here. An earlier draft
-- shipped nine unqualified ones; Codex found them, and the measurement was:
--
--     DELETE FROM repair.job_cards WHERE id = ...;
--     ERROR 23502: null value in column "tenant_id" of relation "walk_ins"
--                  violates not-null constraint
--
-- Every one was a refusal wearing the wrong name, announcing itself as a
-- not-null fault on an unrelated column. The column list (PostgreSQL 15+;
-- section 1 refuses to run on older) fixes it.
--
-- Three tables cannot use SET NULL at all, qualified or not:
-- `reception.appointments`, `reception.service_requests` and
-- `reception.walk_ins` each CHECK `(status='converted') = (link IS NOT NULL)`,
-- so clearing the link while the row still reads `converted` violates it. The
-- constraint is right — converting an intake into a job card is a fact about
-- what happened at the desk — so those three refuse instead.
--
-- Append-only children (`parts.stock_movements`, `reception.customer_feedback`,
-- `finance.invoices`, `finance.invoice_lines`) reject the UPDATE that SET NULL
-- performs and would raise an immutability error in answer to a referential
-- question. They refuse too.
-- ══════════════════════════════════════════════════════════════════════════

-- ⚠️ SELF-WRAPPED, like every migration since 048. `run.sh` applies the file
-- with plain `psql`, which autocommits statement by statement — so without
-- this BEGIN a failure partway would leave some keys and indexes applied and
-- NO ledger row, and the next run would re-apply from the top and die on
-- "already exists". That is the silent drift `DATABASE_MIGRATIONS.md` bans
-- CREATE-IF-NOT-EXISTS to prevent.
BEGIN;

-- ── 1. PRECONDITIONS ──────────────────────────────────────────────────────

DO $guard$
BEGIN
    IF current_setting('server_version_num')::int < 150000 THEN
        RAISE EXCEPTION
            '073 needs PostgreSQL 15 or newer for ON DELETE SET NULL (column); '
            'this server is %. Without it a composite key cannot clear one '
            'column without clearing tenant_id and organization_id too.',
            current_setting('server_version');
    END IF;
END
$guard$;

-- Fail fast rather than hold ACCESS EXCLUSIVE on seventeen tables while
-- queueing behind somebody else's long transaction.
SET LOCAL lock_timeout = '5s';

-- ── 2. ORPHAN PRE-CHECK ───────────────────────────────────────────────────
--
-- 🔴 THIS BLOCK IS THE ONE THAT ALMOST SHIPPED INERT, AND IT IS WORTH READING.
--
-- The first draft simply counted orphans. On THIS laptop that works, because
-- the migration role is a superuser. On Render it is not, and every one of
-- these eighteen tables is ENABLE + FORCE ROW LEVEL SECURITY with
--
--     USING (identity.is_platform_admin() OR tenant_id = current_tenant_id())
--
-- `run.sh` sets no `app.*` settings, so `current_tenant_id()` is NULL and
-- `is_platform_admin()` is false. Measured, as `autoworkshop_app`:
--
--     SELECT count(*) FROM repair.job_cards;   -- as owner/superuser:  6
--     SELECT count(*) FROM repair.job_cards;   -- as the Render role:  0
--
-- So on production the check would have returned "0 orphans" over rows it
-- could not see, and its own "how many of my checks were vacuous" report would
-- have been a fixed lie rather than a measurement — while `ALTER TABLE ... ADD
-- FOREIGN KEY` validated against ALL the rows regardless, because RI bypasses
-- RLS. The migration would abort with a bare constraint name: exactly the
-- outcome this block exists to prevent. The Supervisor found it.
--
-- The escape is the one every policy here already carries. Both the permissive
-- and the RESTRICTIVE (054) policies read `is_platform_admin() OR ...`, and
-- `is_platform_admin()` is `current_role_name() IN ('admin',
-- 'platform_administrator')`. Measured again with it set: 0 → 6.
--
-- ⚠️ AND THE ESCAPE IS ASSERTED, NOT ASSUMED. If a future policy drops the
-- admin clause this block must FAIL LOUDLY, not quietly return to counting
-- zero over an invisible table.

DO $orphans$
DECLARE
    r          record;
    n          bigint;
    report     text := '';
    offenders  int := 0;
    checked    int := 0;
    populated  int := 0;
BEGIN
    PERFORM set_config('app.current_role', 'admin', true);

    IF NOT identity.is_platform_admin() THEN
        RAISE EXCEPTION
            '073: cannot see the rows it is about to constrain. Every table '
            'here is FORCE RLS and the migration role does not bypass it, so '
            'without the platform-admin escape this check would report a '
            'confident zero over invisible rows. Setting app.current_role did '
            'not make is_platform_admin() true — a policy or that function has '
            'changed and this block must be rewritten, not skipped.';
    END IF;

    FOR r IN
        SELECT * FROM (VALUES
            ('finance.invoices',            'job_card_id',                 'repair.job_cards'),
            ('finance.invoices',            'quotation_id',                'repair.quotations'),
            ('finance.invoice_lines',       'quotation_line_id',           'repair.quotation_lines'),
            ('parts.purchase_requisitions', 'job_card_id',                 'repair.job_cards'),
            ('parts.reservations',          'job_card_id',                 'repair.job_cards'),
            ('parts.resource_bookings',     'job_card_id',                 'repair.job_cards'),
            ('parts.stock_movements',       'job_card_id',                 'repair.job_cards'),
            ('parts.stock_movements',       'goods_receipt_id',            'parts.goods_receipts'),
            ('parts.supplier_requests',     'job_card_id',                 'repair.job_cards'),
            ('parts.supplier_requests',     'converted_purchase_order_id', 'parts.purchase_orders'),
            ('reception.appointments',      'converted_job_card_id',       'repair.job_cards'),
            ('reception.customer_feedback', 'job_card_id',                 'repair.job_cards'),
            ('reception.service_requests',  'converted_job_card_id',       'repair.job_cards'),
            ('reception.vehicle_intakes',   'job_card_id',                 'repair.job_cards'),
            ('reception.walk_ins',          'converted_job_card_id',       'repair.job_cards'),
            ('warranty.claims',             'remedial_job_card_id',        'repair.job_cards'),
            ('warranty.policies',           'job_card_id',                 'repair.job_cards'),
            ('warranty.policies',           'invoice_id',                  'finance.invoices')
        ) AS t(child, col, parent)
    LOOP
        checked := checked + 1;

        -- A reference crossing an organisation boundary counts as an orphan
        -- here, deliberately: that is the case the experiment in the header
        -- produced, and the case the key is about to start refusing.
        EXECUTE format(
            'SELECT count(*) FROM %s c WHERE c.%I IS NOT NULL AND NOT EXISTS ('
            || 'SELECT 1 FROM %s p WHERE p.id = c.%I '
            || 'AND p.tenant_id = c.tenant_id AND p.organization_id = c.organization_id)',
            r.child, r.col, r.parent, r.col
        ) INTO n;

        IF n > 0 THEN
            offenders := offenders + 1;
            report := report || format(E'\n    %s.%s -> %s : %s orphan row(s)',
                                       r.child, r.col, r.parent, n);
        END IF;

        EXECUTE format('SELECT count(%I) FROM %s', r.col, r.child) INTO n;
        IF n > 0 THEN populated := populated + 1; END IF;
    END LOOP;

    IF offenders > 0 THEN
        RAISE EXCEPTION E'073: % of % relationships have rows that point nowhere or point outside their own workshop:%\n\n  Resolve these before the relationship can be declared. A\n  reference that crosses an organisation boundary counts as an\n  orphan here — see this migration''s header for why.',
            offenders, checked, report;
    END IF;

    RAISE NOTICE '073 orphan pre-check: % relationships checked, 0 orphans.', checked;
    IF populated < checked THEN
        RAISE NOTICE '073 ⚠️  % of the % checks ran over an EMPTY column and '
                     'therefore proved nothing about this database.',
                     checked - populated, checked;
    ELSE
        RAISE NOTICE '073 all % checks had rows to examine.', checked;
    END IF;
END
$orphans$;

-- ── 3. PARENT KEYS ────────────────────────────────────────────────────────
--
-- A composite key needs a unique index over exactly its referenced columns.
-- `repair.job_cards`, `repair.quotations` and `repair.repair_plans` already
-- publish `(id, tenant_id, organization_id)` (054). Four more parents are
-- referenced below and publish only `(id)` or `(id, tenant_id)`.

CREATE UNIQUE INDEX uq_invoices_id_tenant_org
    ON finance.invoices (id, tenant_id, organization_id);

CREATE UNIQUE INDEX uq_quotation_lines_id_tenant_org
    ON repair.quotation_lines (id, tenant_id, organization_id);

CREATE UNIQUE INDEX uq_goods_receipts_id_tenant_org
    ON parts.goods_receipts (id, tenant_id, organization_id);

CREATE UNIQUE INDEX uq_purchase_orders_id_tenant_org
    ON parts.purchase_orders (id, tenant_id, organization_id);

-- ── 4. THE THIRTEEN LINKS TO THE JOB CARD ─────────────────────────────────

-- Invoiced work cannot vanish under its invoice. NOT NULL, and the invoice is
-- frozen once issued.
ALTER TABLE finance.invoices
    ADD CONSTRAINT fk_invoice_job_card_scope
    FOREIGN KEY (job_card_id, tenant_id, organization_id)
    REFERENCES repair.job_cards (id, tenant_id, organization_id)
    ON DELETE NO ACTION;

-- A requisition raised for a job outlives it as a procurement record.
ALTER TABLE parts.purchase_requisitions
    ADD CONSTRAINT fk_requisition_job_card_scope
    FOREIGN KEY (job_card_id, tenant_id, organization_id)
    REFERENCES repair.job_cards (id, tenant_id, organization_id)
    ON DELETE SET NULL (job_card_id);

-- A reservation is a HOLD ON STOCK for one job card. NOT NULL; with the job
-- card gone the hold is not merely orphaned but wrong — it would keep parts
-- locked against nothing. CASCADE releases it.
ALTER TABLE parts.reservations
    ADD CONSTRAINT fk_reservation_job_card_scope
    FOREIGN KEY (job_card_id, tenant_id, organization_id)
    REFERENCES repair.job_cards (id, tenant_id, organization_id)
    ON DELETE CASCADE;

-- Same for a bay or lift booking.
--
-- ⚠️ `assert_resource_exists` ALREADY validates this column on INSERT and
-- UPDATE, tenant- and organisation-scoped, and 056 says so. This is not a
-- duplicate of it: a BEFORE INSERT/UPDATE trigger on the CHILD cannot see the
-- PARENT being deleted, so today a deleted job card leaves the ramp booked.
-- The trigger keeps the insert path; the key adds the delete path.
ALTER TABLE parts.resource_bookings
    ADD CONSTRAINT fk_booking_job_card_scope
    FOREIGN KEY (job_card_id, tenant_id, organization_id)
    REFERENCES repair.job_cards (id, tenant_id, organization_id)
    ON DELETE CASCADE;

-- 🔴 Unconditionally append-only: the on-hand figure IS the sum of these rows.
ALTER TABLE parts.stock_movements
    ADD CONSTRAINT fk_movement_job_card_scope
    FOREIGN KEY (job_card_id, tenant_id, organization_id)
    REFERENCES repair.job_cards (id, tenant_id, organization_id)
    ON DELETE NO ACTION;

-- 059 left this key out "to keep this table usable from the parts desk without
-- a job". That concern is real and is met by the column staying NULLABLE —
-- MATCH SIMPLE does not check a NULL — so restocking is unaffected. Its second
-- reason, that the job card "lives in another schema's lifecycle", is not a
-- rule this database observes: parts already references catalogue, and finance
-- already references core and identity.
ALTER TABLE parts.supplier_requests
    ADD CONSTRAINT fk_supplier_request_job_card_scope
    FOREIGN KEY (job_card_id, tenant_id, organization_id)
    REFERENCES repair.job_cards (id, tenant_id, organization_id)
    ON DELETE SET NULL (job_card_id);

-- The next three carry CHECK ((status='converted') = (link IS NOT NULL)), so
-- the link cannot be cleared on its own. The conversion is a fact.
ALTER TABLE reception.appointments
    ADD CONSTRAINT fk_appointment_job_card_scope
    FOREIGN KEY (converted_job_card_id, tenant_id, organization_id)
    REFERENCES repair.job_cards (id, tenant_id, organization_id)
    ON DELETE NO ACTION;

ALTER TABLE reception.service_requests
    ADD CONSTRAINT fk_service_request_job_card_scope
    FOREIGN KEY (converted_job_card_id, tenant_id, organization_id)
    REFERENCES repair.job_cards (id, tenant_id, organization_id)
    ON DELETE NO ACTION;

ALTER TABLE reception.walk_ins
    ADD CONSTRAINT fk_walk_in_job_card_scope
    FOREIGN KEY (converted_job_card_id, tenant_id, organization_id)
    REFERENCES repair.job_cards (id, tenant_id, organization_id)
    ON DELETE NO ACTION;

-- Append-only: a customer's verdict on the work is not rewritten.
ALTER TABLE reception.customer_feedback
    ADD CONSTRAINT fk_feedback_job_card_scope
    FOREIGN KEY (job_card_id, tenant_id, organization_id)
    REFERENCES repair.job_cards (id, tenant_id, organization_id)
    ON DELETE NO ACTION;

ALTER TABLE reception.vehicle_intakes
    ADD CONSTRAINT fk_intake_job_card_scope
    FOREIGN KEY (job_card_id, tenant_id, organization_id)
    REFERENCES repair.job_cards (id, tenant_id, organization_id)
    ON DELETE SET NULL (job_card_id);

-- The remedial job card is the rework a claim produced; the claim predates it
-- and survives it.
ALTER TABLE warranty.claims
    ADD CONSTRAINT fk_claim_remedial_job_card_scope
    FOREIGN KEY (remedial_job_card_id, tenant_id, organization_id)
    REFERENCES repair.job_cards (id, tenant_id, organization_id)
    ON DELETE SET NULL (remedial_job_card_id);

-- A warranty is a promise ABOUT a specific job. NOT NULL — the promise cannot
-- outlive the record of what was promised. This is the exact column the
-- experiment in the header attached to another workshop's job card.
ALTER TABLE warranty.policies
    ADD CONSTRAINT fk_policy_job_card_scope
    FOREIGN KEY (job_card_id, tenant_id, organization_id)
    REFERENCES repair.job_cards (id, tenant_id, organization_id)
    ON DELETE NO ACTION;

-- ── 5. THE FIVE REMAINING LINKS ───────────────────────────────────────────

-- Quotation -> invoice provenance. Nullable by design (042: "a workshop
-- occasionally invoices work that never had a formal quotation").
ALTER TABLE finance.invoices
    ADD CONSTRAINT fk_invoice_quotation_scope
    FOREIGN KEY (quotation_id, tenant_id, organization_id)
    REFERENCES repair.quotations (id, tenant_id, organization_id)
    ON DELETE NO ACTION;

-- "Where this charge came from, so a customer asking 'what is this?' can
-- always be answered" (042). An answer pointing at a deleted or foreign line
-- cannot do that.
ALTER TABLE finance.invoice_lines
    ADD CONSTRAINT fk_invoice_line_quotation_line_scope
    FOREIGN KEY (quotation_line_id, tenant_id, organization_id)
    REFERENCES repair.quotation_lines (id, tenant_id, organization_id)
    ON DELETE NO ACTION;

-- Which delivery note put this stock on the shelf. Append-only child.
ALTER TABLE parts.stock_movements
    ADD CONSTRAINT fk_movement_goods_receipt_scope
    FOREIGN KEY (goods_receipt_id, tenant_id, organization_id)
    REFERENCES parts.goods_receipts (id, tenant_id, organization_id)
    ON DELETE NO ACTION;

ALTER TABLE parts.supplier_requests
    ADD CONSTRAINT fk_supplier_request_po_scope
    FOREIGN KEY (converted_purchase_order_id, tenant_id, organization_id)
    REFERENCES parts.purchase_orders (id, tenant_id, organization_id)
    ON DELETE SET NULL (converted_purchase_order_id);

-- ⚠️ This action can never actually fire: `finance.invoices` refuses DELETE
-- unconditionally ("void the invoice with a reason instead"). It is declared
-- for correctness of the relationship, not because the path is reachable, and
-- verify/073 says so rather than pretending to test it.
ALTER TABLE warranty.policies
    ADD CONSTRAINT fk_policy_invoice_scope
    FOREIGN KEY (invoice_id, tenant_id, organization_id)
    REFERENCES finance.invoices (id, tenant_id, organization_id)
    ON DELETE SET NULL (invoice_id);

-- ── 6. DELIBERATELY NOT DECLARED ──────────────────────────────────────────
--
-- Recorded here so the next audit does not "find" them again, and so the
-- reason survives outside a comment on one column. verify/073 pins them.
--
--   repair.repair_plan_tasks.assigned_technician_id  → identity.users
--   repair.execution_time_entries.technician_id      → identity.users
--     014's reasoning stands: staff leave, and neither RESTRICT (blocks the
--     leaver) nor CASCADE (rewrites a settled plan) is acceptable. Both are
--     HISTORICAL RECORDS inside settled documents.
--     ⚠️ `repair.job_cards.assigned_technician_id` DOES have a key, ON DELETE
--     SET NULL — because it is a LIVE pointer to who is on the job now, and
--     when they leave the job should become unassigned. That is the
--     distinction, not an inconsistency.
--
--   agents.proposals.resource_id · comms.notifications.resource_id ·
--   media.links.owner_id · parts.resource_bookings.resource_id
--     Polymorphic — the target table depends on a sibling discriminator.
--     `resource_bookings` enforces its own with `assert_resource_exists`,
--     which is stricter than a key because it also pins the organisation.
--
--   audit.events.*  Append-only. An audit row must outlive what it describes.

-- ── 7. INDEXES ON THE CHILD SIDE ──────────────────────────────────────────
--
-- An unindexed foreign key makes every parent delete a sequential scan of the
-- child table while holding row locks — thirteen of them for one job card —
-- and makes "show me everything attached to this job card", the workshop's
-- main question, thirteen sequential scans.
--
-- ⚠️ TWELVE, NOT SEVENTEEN. An earlier draft added seventeen on the strength
-- of an audit of mine that only inspected each index's LEADING column, so it
-- could not see five existing covering indexes whose first column is
-- `tenant_id` or `organization_id` — `idx_invoice_job_card`,
-- `idx_reservation_job`, `idx_booking_org_job`, `idx_movement_job`,
-- `idx_intake_job_card`. The RI lookup matches all three columns by equality,
-- so those serve it. Codex found the duplication. A duplicate index costs
-- write throughput and storage and buys nothing.
--
-- `warranty.policies.job_card_id` is likewise already covered by
-- `uq_policy_job`.

CREATE INDEX idx_invoices_quotation         ON finance.invoices (quotation_id);
CREATE INDEX idx_invoice_lines_quote_line   ON finance.invoice_lines (quotation_line_id);
CREATE INDEX idx_requisitions_job_card      ON parts.purchase_requisitions (job_card_id);
CREATE INDEX idx_movements_goods_receipt    ON parts.stock_movements (goods_receipt_id);
CREATE INDEX idx_supplier_requests_job_card ON parts.supplier_requests (job_card_id);
CREATE INDEX idx_supplier_requests_po       ON parts.supplier_requests (converted_purchase_order_id);
CREATE INDEX idx_appointments_job_card      ON reception.appointments (converted_job_card_id);
CREATE INDEX idx_feedback_job_card          ON reception.customer_feedback (job_card_id);
CREATE INDEX idx_service_requests_job_card  ON reception.service_requests (converted_job_card_id);
CREATE INDEX idx_walk_ins_job_card          ON reception.walk_ins (converted_job_card_id);
CREATE INDEX idx_claims_remedial_job_card   ON warranty.claims (remedial_job_card_id);
CREATE INDEX idx_policies_invoice           ON warranty.policies (invoice_id);

COMMIT;
