-- One-off: give the two `[AUDIT]` fixture organisations an org-admin member.
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 WHY THIS IS A NAMED ONE-OFF AND NOT A RULE IN MIGRATION 085.
--
-- 085 aborted on production (`apply-migrations` run 32252947622):
--
--   ERROR: 085 would leave 2 insurance/towing organisation(s) with no member
--          who can grant a membership. ... do NOT relax the rule to role_name
--          alone, which would promote every assessor.
--
-- The read-only diagnostic (`diagnose-085-stranded-orgs.yml`, run 32253435512)
-- named them rather than guessing:
--
--   [AUDIT] Insurance Company  d7d30afd-…  insurance_assessor  1 active member
--   [AUDIT] Towing Company     c5c43056-…  towing_operator     1 active member
--   both: created_by IS NULL, member = marc667us@yahoo.com (the account owner)
--
-- They are the fixture organisations created on 2026-08-16 so the owner could
-- REACH the insurance and towing trees at all. Hand-seeded rows carry no
-- `created_by`, so 085's founder rule (`created_by = user_id`) evaluates to
-- NULL — not false — and excludes them.
--
-- ── THE FIX THAT WAS TRIED AND REVERTED ───────────────────────────────────
--
-- Widening 085's rule with `OR active_members = 1` — "a single-member
-- organisation has nobody to escalate past". Codex falsified it the same day:
--
--   `ranked` filters to `status = 'active'`, so `rn = 1` means EARLIEST ACTIVE
--   membership, not the organisation's FIRST member. Suspend or revoke a real
--   founder, leave one assessor active, and that assessor satisfies both
--   `rn = 1` and `active_members = 1` — and is permanently promoted.
--
-- And it is not only appointment authority: `towing_operator` holds NO
-- permissions while `towing_owner` holds `finance.read` + `organization.admin`.
-- The widening was reverted, and `verify/085` check 6 now asserts that exact
-- succession shape is REFUSED.
--
-- ▶ SO THE ORGANISATIONS ARE NAMED, NOT INFERRED. Two ids, two membership ids,
--   written down after being measured. A rule that has to be true of every
--   future organisation is the wrong instrument for repairing two known rows.
--
-- ── WHY IT SETS THE ROLE RATHER THAN BACKFILLING `created_by` ─────────────
--
-- Setting `created_by = user_id` would also make 085's rule match, and it was
-- rejected: it writes a claim about HISTORY that this script cannot establish.
-- Setting the role writes the decision actually being made, which is auditable.
--
-- 🔴 EVERY UPDATE BELOW IS GUARDED BY THE FULL SHAPE THAT WAS MEASURED —
-- organisation id, membership id, org_type, current role, active status, AND
-- "this is the only active membership". If production has moved on since the
-- diagnostic, nothing is written and the script says so. A one-off that
-- silently updates a row that no longer looks the way you think it does is how
-- a repair becomes an incident.
-- ══════════════════════════════════════════════════════════════════════════

\pset pager off
\set ON_ERROR_STOP on

BEGIN;

-- Transaction-local: this IS one transaction, so `true` is correct here.
SELECT set_config('app.current_role', 'admin', true);

\echo ''
\echo '=== BEFORE ==='
SELECT o.id AS org_id, o.name, o.org_type, m.id AS membership_id,
       m.role_name, m.status, m.user_id, m.created_by
  FROM identity.organizations o
  JOIN identity.memberships m ON m.organization_id = o.id AND m.tenant_id = o.tenant_id
 WHERE o.id IN ('d7d30afd-a615-4c0b-a8d2-fa61c44570bb',
                'c5c43056-8920-47c9-8735-2d52e8ee3115')
 ORDER BY o.name, m.created_at;

DO $repair$
DECLARE
    -- Measured 2026-08-19 by diagnose-085-stranded-orgs.yml run 32253435512.
    v_ins_org  uuid := 'd7d30afd-a615-4c0b-a8d2-fa61c44570bb';
    v_ins_mem  uuid := 'ced6b218-bc1e-4f88-b5f3-dc33e84a3851';
    v_tow_org  uuid := 'c5c43056-8920-47c9-8735-2d52e8ee3115';
    v_tow_mem  uuid := 'f383715d-c592-47a3-b7fc-1bbd10f20487';
    v_changed  int;
    v_total    int := 0;
BEGIN
    -- ── the insurer ───────────────────────────────────────────────────────
    UPDATE identity.memberships m
       SET role_name  = 'insurance_owner',
           updated_at = now()
      FROM identity.organizations o
     WHERE m.id              = v_ins_mem
       AND m.organization_id = v_ins_org
       AND o.id              = m.organization_id
       AND o.tenant_id       = m.tenant_id
       AND o.org_type        = 'insurance_company'
       AND m.status          = 'active'
       AND m.role_name       = 'insurance_assessor'
       -- 🔴 AND IT IS STILL THE ONLY ACTIVE MEMBER. If somebody has joined
       -- since the diagnostic, promoting this row is no longer the same,
       -- reviewed decision — it becomes a choice between two people.
       AND (SELECT count(*) FROM identity.memberships x
             WHERE x.organization_id = v_ins_org AND x.status = 'active') = 1;
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    RAISE NOTICE 'insurance: % row(s) promoted to insurance_owner', v_changed;
    v_total := v_total + v_changed;

    -- ── the towing firm ───────────────────────────────────────────────────
    UPDATE identity.memberships m
       SET role_name  = 'towing_owner',
           updated_at = now()
      FROM identity.organizations o
     WHERE m.id              = v_tow_mem
       AND m.organization_id = v_tow_org
       AND o.id              = m.organization_id
       AND o.tenant_id       = m.tenant_id
       AND o.org_type        = 'towing_company'
       AND m.status          = 'active'
       AND m.role_name       = 'towing_operator'
       AND (SELECT count(*) FROM identity.memberships x
             WHERE x.organization_id = v_tow_org AND x.status = 'active') = 1;
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    RAISE NOTICE 'towing: % row(s) promoted to towing_owner', v_changed;
    v_total := v_total + v_changed;

    -- ⚠️ IDEMPOTENT BY THE ROLE PREDICATE. Re-running after success changes
    -- nothing, because the rows no longer hold the operational role — so
    -- `v_total = 0` on a second run is SUCCESS, not failure. That is why this
    -- does not raise on zero; the real gate is the check below.
    RAISE NOTICE 'total promoted this run: % (0 on a re-run is expected)', v_total;
END;
$repair$;

-- ── THE GATE: 085's own invariant, asserted before we commit ──────────────
--
-- 🔴 THIS IS WHAT MAKES THE REPAIR MEANINGFUL. Promoting rows is not the goal;
-- the goal is that `apply-migrations` can get past 085's guard. So the guard's
-- exact predicate is re-run here, and this transaction ROLLS BACK if it still
-- finds a stranded organisation — rather than reporting success and leaving the
-- migration to fail again ten minutes later.
DO $gate$
DECLARE
    v_stranded int;
BEGIN
    PERFORM set_config('app.current_role', 'admin', true);

    SELECT count(*) INTO v_stranded
      FROM identity.organizations o
     WHERE o.org_type IN ('insurance_company', 'towing_company')
       AND o.status = 'active'
       AND NOT EXISTS (
             SELECT 1 FROM identity.memberships m
              WHERE m.organization_id = o.id
                AND m.tenant_id       = o.tenant_id
                AND m.status          = 'active'
                AND m.role_name IN ('insurance_owner', 'towing_owner'));

    IF v_stranded > 0 THEN
        RAISE EXCEPTION 'repair did not clear the way: % organisation(s) still have '
                        'no member who can grant a membership, so migration 085 would '
                        'abort again. Re-run diagnose-085-stranded-orgs.yml — the '
                        'population has changed since it was measured.', v_stranded;
    END IF;

    RAISE NOTICE 'gate passed: every active insurance/towing organisation now has an org admin';
END;
$gate$;

\echo ''
\echo '=== AFTER ==='
SELECT o.id AS org_id, o.name, o.org_type, m.role_name, m.status
  FROM identity.organizations o
  JOIN identity.memberships m ON m.organization_id = o.id AND m.tenant_id = o.tenant_id
 WHERE o.org_type IN ('insurance_company','towing_company')
 ORDER BY o.name;

COMMIT;
