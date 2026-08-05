-- 050 — three defects Codex found in the slice 6-11 branch
--
-- ══════════════════════════════════════════════════════════════════════════
-- All three are mine. All three are the same shape: a rule enforced for one
-- relationship and forgotten for its sibling.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── 🔴 FINDING 3 — A CUSTOMER COULD FILE A CASE AGAINST ANOTHER CUSTOMER'S
-- JOB CARD ─────────────────────────────────────────────────────────────────
--
-- Migration 047 gave `core.vehicle_documents` and `core.maintenance_schedules`
-- a trigger asserting that the row's `customer_id` matches the OWNER of the
-- vehicle it names. `support.cases` got a plain foreign key and nothing more.
--
-- So a customer holding another customer's job-card uuid — same organisation,
-- and org-scoped RLS cannot tell two customers apart — could raise a case
-- against it. `listCases` joins `repair.job_cards` and returns `job_number`, so
-- that leaks the other customer's job number, and it misdirects the workshop's
-- own triage to the wrong repair.
--
-- ⚠️ THE SERVICE NOW CHECKS THIS TOO. Both, on purpose: the service turns the
-- refusal into a sentence somebody can act on, and this trigger is what makes
-- it true for every future caller, including one that forgets.
--
-- ⚠️ AND IT FIRES ON INSERT *AND* UPDATE. A rule enforced on one statement is
-- defeated by the other — recorded twice in this repository already.

BEGIN;

CREATE OR REPLACE FUNCTION support.assert_case_targets_own_records()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    owner_id uuid;
BEGIN
    IF NEW.job_card_id IS NOT NULL THEN
        SELECT customer_id INTO owner_id
          FROM repair.job_cards
         WHERE id = NEW.job_card_id;
        -- A job card with no customer cannot be attributed to one. Refusing is
        -- correct: silently accepting would file the case against nobody.
        IF owner_id IS NULL OR owner_id <> NEW.customer_id THEN
            RAISE EXCEPTION
                'this case names customer % but job card % belongs to customer % — '
                'a case cannot be raised against somebody else''s repair',
                NEW.customer_id, NEW.job_card_id, owner_id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- The same rule for the vehicle, which had exactly the same hole.
    IF NEW.vehicle_id IS NOT NULL THEN
        SELECT customer_id INTO owner_id FROM core.vehicles WHERE id = NEW.vehicle_id;
        IF owner_id IS NULL OR owner_id <> NEW.customer_id THEN
            RAISE EXCEPTION
                'this case names customer % but vehicle % belongs to customer % — '
                'a case cannot be raised against somebody else''s vehicle',
                NEW.customer_id, NEW.vehicle_id, owner_id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_case_targets_own_records ON support.cases;
CREATE TRIGGER trg_case_targets_own_records
    BEFORE INSERT OR UPDATE ON support.cases
    FOR EACH ROW EXECUTE FUNCTION support.assert_case_targets_own_records();

-- ── 🔴 FINDING 2 — A CALL COULD BE ATTACHED TO ANOTHER PERSON'S JOB CARD OR
-- PRIVATE THREAD ───────────────────────────────────────────────────────────
--
-- `createCall` validated `job_card_id` by tenant and organisation only, and
-- validated `thread_id` NOT AT ALL. Organisation scope does not separate two
-- customers, and it certainly does not separate two private conversations
-- inside one workshop — slice 7 established that thread access is PARTICIPATION,
-- not organisation.
--
-- So a call could be pinned to a conversation the caller was never part of.
-- The service now refuses both; this trigger is the line that holds when a
-- future caller forgets, exactly as above.

CREATE OR REPLACE FUNCTION comms.assert_call_links_are_reachable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    ok boolean;
BEGIN
    IF NEW.thread_id IS NOT NULL THEN
        -- 🔴 PARTICIPATION, NOT ORGANISATION. The whole point of slice 7's
        -- access rule is that two colleagues share an organisation and must not
        -- share a customer's private thread.
        SELECT EXISTS (
            SELECT 1
              FROM comms.participants p
             WHERE p.thread_id = NEW.thread_id
               AND p.user_id = NEW.created_by
        ) INTO ok;
        IF NOT ok THEN
            RAISE EXCEPTION
                'a call cannot be attached to a conversation its creator is not part of'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF NEW.job_card_id IS NOT NULL THEN
        -- The job card must at least belong to the same organisation as the
        -- call. The per-customer rule lives in `CallsService`, because a
        -- WORKSHOP user legitimately calls about any job in their workshop and
        -- a CUSTOMER may only call about their own — a distinction this trigger
        -- cannot make without knowing the caller's role.
        SELECT EXISTS (
            SELECT 1 FROM repair.job_cards jc
             WHERE jc.id = NEW.job_card_id
               AND jc.tenant_id = NEW.tenant_id
               AND jc.organization_id = NEW.organization_id
        ) INTO ok;
        IF NOT ok THEN
            RAISE EXCEPTION
                'a call cannot be attached to a job card in another workshop'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_call_links_reachable ON comms.calls;
CREATE TRIGGER trg_call_links_reachable
    BEFORE INSERT OR UPDATE ON comms.calls
    FOR EACH ROW EXECUTE FUNCTION comms.assert_call_links_are_reachable();

COMMIT;
