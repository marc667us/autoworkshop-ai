-- verify/077 — platform authority comes from a grant row, and a role name buys nothing.
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🟢 THE PREDICATE CHECKS RUN AS `autoworkshop_app`, WHICH IS NOBYPASSRLS.
--
-- ⚠️ NOT *every* check, and the header used to say so — wrongly (Codex).
-- Checks 1, 2, 3a and 4 run as `autoworkshop_app`, because that is the role the
-- API connects as and the one whose answer matters. Checks 3b, 5, 6, 7 and 8 run
-- as the OWNER, because they assert operator-side behaviour — the seed escape,
-- the catalogue, and the write-path triggers — none of which the application
-- role can even reach (it holds SELECT only).
--
-- Check 9 is MIXED and says so: the revoking UPDATE is the owner's, and the
-- `is_platform_admin()` assertion that follows it switches to `autoworkshop_app`,
-- because "is this person still an administrator" is only a meaningful question
-- of the role that asks it in production.
--
-- The distinction is the point of the file: this repository has twice shipped a
-- guard that passed as the owner and was inert as the application role.
--
-- 🔴 CHECK 2 IS THE WHOLE POINT. Before 077, `app.current_role =
-- 'platform_administrator'` — a plain TEXT column on a membership row inside
-- ONE organisation — opened every tenant table in the database. It must now buy
-- nothing at all.
--
-- 🔴 CHECK 5 GUARDS AGAINST A CHANGE THAT WOULD HANG THE DATABASE. This table's
-- own RLS policies must never call `is_platform_admin()`: that function selects
-- from this table, so a policy calling it would re-enter the function on every
-- policy evaluation anywhere in the schema. Asserted structurally, because the
-- symptom is not a failing test — it is a production deadlock.
--
-- ⚠️ IDS ARE RESOLVED BEFORE `SET ROLE`, DELIBERATELY. Reading them afterwards
-- returns NOTHING — the grant table is FORCE RLS and only shows a caller their
-- own row — and `set_config` would then bind an EMPTY user id and every check
-- below would read false for the right-looking reason. That mistake was made
-- while writing this file.
-- ══════════════════════════════════════════════════════════════════════════

DO $verify$
DECLARE
    v_granted    uuid;
    v_ungranted  uuid;
    v_answer     boolean;
    v_count      int;
    v_policies   int;
BEGIN
    -- ── Resolved as the OWNER, before any SET ROLE ──────────────────────────
    SELECT user_id INTO v_granted
      FROM identity.platform_administrators
     WHERE revoked_at IS NULL
     LIMIT 1;

    IF v_granted IS NULL THEN
        RAISE EXCEPTION 'check 0 FAILED: no active platform administrator grant exists. '
                        'The 077 backfill should have created one per active '
                        'platform_administrator membership — if there were none, this '
                        'database has no administrator at all.';
    END IF;

    SELECT u.id INTO v_ungranted
      FROM identity.users u
     WHERE NOT EXISTS (SELECT 1 FROM identity.platform_administrators pa
                        WHERE pa.user_id = u.id AND pa.revoked_at IS NULL)
     LIMIT 1;

    IF v_ungranted IS NULL THEN
        RAISE EXCEPTION 'check 0 FAILED: every user holds a grant, so check 2 could not '
                        'distinguish anything. Seed an ordinary user first.';
    END IF;

    SET LOCAL ROLE autoworkshop_app;

    -- ── 1. A GRANT CONFERS AUTHORITY, WHATEVER THE ROLE NAME SAYS ──────────
    PERFORM set_config('app.user_id', v_granted::text, true);
    PERFORM set_config('app.current_role', 'technician', true);
    SELECT identity.is_platform_admin() INTO v_answer;
    IF NOT v_answer THEN
        RAISE EXCEPTION 'check 1 FAILED: a user holding an active grant is not a platform '
                        'administrator. The 077 backfill has locked out every existing '
                        'administrator, including the owner.';
    END IF;
    RAISE NOTICE 'check 1 OK — an active grant confers authority even under role=technician';

    -- ── 2. 🔴 THE ROLE NAME ALONE BUYS NOTHING ─────────────────────────────
    PERFORM set_config('app.user_id', v_ungranted::text, true);
    PERFORM set_config('app.current_role', 'platform_administrator', true);
    SELECT identity.is_platform_admin() INTO v_answer;
    IF v_answer THEN
        RAISE EXCEPTION 'check 2 FAILED: claiming role_name platform_administrator still '
                        'confers platform authority. This is the escalation 077 exists to '
                        'close — any path that writes that TEXT value owns every tenant.';
    END IF;
    RAISE NOTICE 'check 2 OK — role_name platform_administrator confers nothing without a grant';

    -- ── 3a. 🔴 THE ADMIN GUC ALONE MUST NOT WORK FROM THE APPLICATION ──────
    --
    -- `app.current_role` is a custom GUC and ANY role can set it, including the
    -- application's. The first version of 077 accepted it unconditionally, so a
    -- single injected `set_config('app.current_role','admin',true)` restored
    -- authority over every table WITHOUT any grant — through the function
    -- written to prevent exactly that. Codex found it; this check exists so it
    -- cannot come back. Still running as `autoworkshop_app` here, which is the
    -- role the API connects as on Render too (deploy-api proves it is not a
    -- superuser), so this is production's shape and not a local artefact.
    PERFORM set_config('app.user_id', '', true);
    PERFORM set_config('app.current_role', 'admin', true);
    SELECT identity.is_platform_admin() INTO v_answer;
    IF v_answer THEN
        RAISE EXCEPTION 'check 3a FAILED: setting app.current_role = admin from the APPLICATION '
                        'role confers platform authority with no grant. SQL injection anywhere '
                        'in the API is a full RLS bypass.';
    END IF;
    RAISE NOTICE 'check 3a OK — the admin GUC buys nothing from the application role';

    RESET ROLE;

    -- ── 3b. AND IT MUST STILL WORK FOR THE OWNER, OR EVERY MIGRATION BREAKS ─
    PERFORM set_config('app.user_id', '', true);
    PERFORM set_config('app.current_role', 'admin', true);
    SELECT identity.is_platform_admin() INTO v_answer;
    IF NOT v_answer THEN
        RAISE EXCEPTION 'check 3b FAILED: the owner can no longer use the admin escape. Every '
                        'migration and seed script would write nothing, silently, under RLS.';
    END IF;
    RAISE NOTICE 'check 3b OK — the owner keeps the seed escape';

    SET LOCAL ROLE autoworkshop_app;

    -- ── 4. NO RECURSION: a table whose policy calls the predicate is readable ─
    -- If this table's policies ever call `is_platform_admin()`, this statement
    -- does not fail — it never returns. Kept as a real read for that reason.
    PERFORM set_config('app.user_id', v_granted::text, true);
    PERFORM set_config('app.current_role', 'technician', true);
    SELECT count(*) INTO v_count FROM identity.tenants;
    RAISE NOTICE 'check 4 OK — identity.tenants read through an is_platform_admin() policy (% rows)', v_count;

    RESET ROLE;

    -- ── 5. THE POLICIES ON THIS TABLE MUST NOT CALL THE PREDICATE ──────────
    SELECT count(*) INTO v_policies
      FROM pg_policies
     WHERE schemaname = 'identity'
       AND tablename  = 'platform_administrators'
       AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%is_platform_admin%';
    IF v_policies > 0 THEN
        RAISE EXCEPTION 'check 5 FAILED: % polic(y/ies) on identity.platform_administrators call '
                        'is_platform_admin(), which SELECTs from this very table. Every policy '
                        'evaluation in the schema would re-enter it. This is a deadlock, not a '
                        'style problem.', v_policies;
    END IF;
    RAISE NOTICE 'check 5 OK — no policy on the grant table calls the predicate that reads it';

    -- ── 6. APPEND-ONLY IS ENFORCED BY THE DATABASE ─────────────────────────
    PERFORM set_config('app.current_role', 'admin', true);
    BEGIN
        DELETE FROM identity.platform_administrators WHERE revoked_at IS NULL;
        RAISE EXCEPTION 'check 6 FAILED: a grant row was DELETED. The authority ledger is '
                        'supposed to be append-only, so a revocation leaves no trace.';
    EXCEPTION
        WHEN sqlstate 'P0001' THEN
            IF sqlerrm LIKE 'check 6 FAILED%' THEN RAISE; END IF;
            RAISE NOTICE 'check 6 OK — DELETE refused: %', sqlerrm;
    END;

    -- ── 7. HISTORY CANNOT BE REWRITTEN ─────────────────────────────────────
    BEGIN
        UPDATE identity.platform_administrators
           SET granted_reason = 'rewritten by verify/077'
         WHERE revoked_at IS NULL;
        RAISE EXCEPTION 'check 7 FAILED: granted_reason was rewritten on an existing grant.';
    EXCEPTION
        WHEN sqlstate 'P0001' THEN
            IF sqlerrm LIKE 'check 7 FAILED%' THEN RAISE; END IF;
            RAISE NOTICE 'check 7 OK — editing a grant refused: %', sqlerrm;
    END;

    -- ── 8. A HALF-REVOCATION IS NOT AN EDIT YOU MAY MAKE ───────────────────
    -- Codex: the first trigger allowed touching `revoked_by` on a LIVE grant
    -- while leaving `revoked_at` null — an edit to an authority row that
    -- revoked nothing, on a ledger this migration calls append-only.
    --
    -- 🔴 AND IT MUST RUN BEFORE THE REVOCATION CHECK. Placed after it, this
    -- UPDATE matched ZERO rows whenever the revoked grant was the only active
    -- one — no trigger fired, no exception was raised, and the check reported a
    -- failure for a correct database. It passed here only because this instance
    -- happened to hold a SECOND grant. A check whose result depends on how much
    -- data exists is not a check. Found by Codex.
    PERFORM set_config('app.current_role', 'admin', true);
    BEGIN
        UPDATE identity.platform_administrators
           SET revoked_by = user_id
         WHERE revoked_at IS NULL;
        RAISE EXCEPTION 'check 8 FAILED: a live grant was edited without being revoked.';
    EXCEPTION
        WHEN sqlstate 'P0001' THEN
            IF sqlerrm LIKE 'check 8 FAILED%' THEN RAISE; END IF;
            RAISE NOTICE 'check 8 OK — half-revocation refused: %', sqlerrm;
    END;

    -- ── 9. REVOCATION TAKES EFFECT IMMEDIATELY, NOT AT TOKEN EXPIRY ────────
    -- The reason this design was chosen over reading the Keycloak realm role.
    UPDATE identity.platform_administrators
       SET revoked_at = now(), revoked_reason = 'verify/077 rehearsal',
           revoked_actor = 'verify/077'
     WHERE user_id = v_granted AND revoked_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'check 9 FAILED: expected to revoke exactly one grant, revoked %. '
                        'A revocation check that revokes nothing proves nothing.', v_count;
    END IF;

    SET LOCAL ROLE autoworkshop_app;
    PERFORM set_config('app.user_id', v_granted::text, true);
    PERFORM set_config('app.current_role', 'technician', true);
    SELECT identity.is_platform_admin() INTO v_answer;
    IF v_answer THEN
        RAISE EXCEPTION 'check 9 FAILED: a revoked administrator is still a platform '
                        'administrator in the same session.';
    END IF;
    RAISE NOTICE 'check 9 OK — revocation is effective on the next statement';
    RESET ROLE;


    RAISE EXCEPTION 'verify/077 complete — 10/10 checks passed (rolling back deliberately)';
END
$verify$;
