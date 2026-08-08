-- 067 — the OTHER five 045 settings tables also admit a customer
--
-- ══════════════════════════════════════════════════════════════════════════
-- 066 closed `org_select` on the two PUBLISHABLE settings tables
-- (`core.service_categories`, `core.opening_hours`) and said so explicitly:
--
--     "The other five tables 045 covers (approval_limits, document_templates,
--      notification_preferences, workflow_rules, integrations) are NOT touched
--      here. Their service methods already refuse a customer by role. They are
--      worth a policy of their own later; that is a separate migration with its
--      own evidence, not a line added here."
--
-- This is that separate migration, and this is that evidence.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── 🔴 MEASURED, NOT INFERRED (2026-08-09, local Postgres) ────────────────
--
-- A `customer` membership in the workshop's own organisation, session settings
-- as `TenantGuard` sets them, `SET LOCAL ROLE autoworkshop_app` so RLS really
-- applies — then a bare `SELECT count(*)` against each table:
--
--     tbl                | visible_to_customer
--     -------------------+--------------------
--     approval_limits    |                   1
--     workflow_rules     |                   1
--     integrations       |                   1
--     document_templates |                   1
--
-- Not zero. 045's `org_select` carries tenant AND organisation and NO role
-- clause, and since migration 061 a customer's active organisation IS the
-- workshop's, so the organisation arm is TRUE for them. Identical cause to 066,
-- 062 and 059 — this is the fourth table group with the same defect.
--
-- ── ⚠️ THIS IS DEFENCE IN DEPTH, AND SAYING SO IS NOT MINIMISING IT ───────
--
-- 066 was right that `SettingsService` refuses a customer on all five of these
-- reads (`assertMayReadConfig` / `assertMayGovern`), so no HTTP route reaches
-- them today. That makes this the SECOND line, not the first — `CLAUDE.md` §7:
-- app code is the first line of defence, RLS is the final, and BOTH are
-- required. The reason to close it anyway is that the first line is one
-- forgotten `assert` away from being the only line, and this repository has
-- shipped exactly that: migration 059 put `<> 'customer'` on INSERT and UPDATE
-- and not on SELECT, and the read that exploited the gap was written months
-- later by somebody who had no reason to suspect the policy did not cover them.
--
-- ── WHAT IS BEHIND EACH POLICY, SO THE VALUE IS CONCRETE ──────────────────
--
--   · `approval_limits`  — the amount each ROLE may approve without escalation.
--     A customer negotiating a repair quote learns precisely what figure keeps
--     their job below the manager's desk. This is the one that would matter
--     most on the day it was reachable.
--   · `integrations`     — `provider_kind`, `provider_name`, `status`,
--     `secret_ref` and `last_error`. No secret VALUE is there (045's
--     `reject_secret_in_config` trigger forbids it), but the provider list and
--     a failing integration's error text are the workshop's internal plumbing.
--   · `document_templates` — the full body and subject of every customer-facing
--     letter, including drafts nobody has approved for sending.
--   · `workflow_rules`   — which events trigger which automatic action, i.e. how
--     to get a job escalated, or how to avoid it.
--   · `notification_preferences` — who in the workshop is told about what.
--
-- ── ⚠️ ONLY `org_select`, AND ONLY THE ROLE ARM ───────────────────────────
--
-- `org_insert`, `org_update`, `org_delete` are untouched: every WRITE in
-- `SettingsService` calls `assertMayAdminister` or `assertMayGovern`, and
-- widening this change into them would be a second change hiding inside a
-- security fix — 066's own words, and they are still right.
--
-- ⚠️ AND UNLIKE 066, THERE IS NO `public_read` ON THESE FIVE TABLES to preserve.
-- 045 gave that policy only to `opening_hours` and `service_categories`, because
-- only those two have an `is_published` flag and a public profile route to serve.
-- So for these five the change is total: after this migration a customer session
-- matches NO permissive policy on them and reads nothing. Verified below rather
-- than assumed, because "no other policy exists" is exactly the kind of claim
-- that is true until somebody adds one.
--
-- ── ⚠️ 045 AND 066 ARE NOT EDITED ─────────────────────────────────────────
--
-- `run.sh` CHECKSUMS every applied migration so live schema cannot drift from
-- history. Editing an applied file makes it disagree with its recorded checksum
-- and blocks every later migration. Fixes go in the next number, always.
--
-- No table, column, index, grant or trigger changes here. Five policies are
-- replaced, and only their organisation arm differs from 045.

BEGIN;

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'core.approval_limits',
        'core.document_templates',
        'core.notification_preferences',
        'core.workflow_rules',
        'core.integrations'
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_select', t);
        EXECUTE format(
            'CREATE POLICY %I ON %s FOR SELECT USING '
            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
            'AND organization_id = identity.current_organization_id() '
            -- ── THE ONLY DIFFERENCE FROM 045 ────────────────────────────
            -- Same clause, same spelling, as 062's `supplier_request_select`
            -- and 066's two. Spelled identically on purpose: a grep for
            -- `current_role_name() <> ''customer''` has to find every one of
            -- them, or the next audit of "which tables exclude a customer?"
            -- reads a partial answer as a complete one.
            'AND identity.current_role_name() <> ''customer''))',
            'org_select', t);
    END LOOP;
END $$;

-- ── PROVE IT IN THE MIGRATION, NOT ONLY IN A TEST ──────────────────────────
--
-- 🔴 A POLICY THAT DID NOT TAKE EFFECT LOOKS EXACTLY LIKE ONE THAT DID.
-- `CREATE POLICY` reports success for a predicate that never matches what the
-- application actually sends, and this repository has been bitten by precisely
-- that shape twice in a week (061's `ON CONFLICT` ambiguity reported success at
-- CREATE time and failed at RUNTIME; the first 061 draft read the raw
-- `app.bootstrap` setting and silently reopened 038's hole). So the migration
-- asserts its own effect before committing: every one of the five must now
-- carry the clause, or this transaction aborts and nothing is applied.
DO $$
DECLARE
    missing text;
BEGIN
    SELECT string_agg(format('%s.%s', schemaname, tablename), ', ')
      INTO missing
      FROM pg_policies
     WHERE schemaname = 'core'
       AND tablename IN ('approval_limits','document_templates',
                         'notification_preferences','workflow_rules','integrations')
       AND policyname = 'org_select'
       AND qual NOT LIKE '%<> ''customer''%';

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION
            'org_select still admits a customer on: %. The policy was created but '
            'does not carry the role clause — nothing has been applied.', missing;
    END IF;

    -- And the count, because "none are missing the clause" is also true when
    -- the loop matched no table at all.
    IF (SELECT count(*) FROM pg_policies
         WHERE schemaname = 'core'
           AND tablename IN ('approval_limits','document_templates',
                             'notification_preferences','workflow_rules','integrations')
           AND policyname = 'org_select') <> 5 THEN
        RAISE EXCEPTION
            'Expected 5 org_select policies across the five settings tables. '
            'A table was renamed or its policy is missing — nothing has been applied.';
    END IF;
END $$;

COMMIT;
