-- REHEARSAL — run migration 060's delivery path under RENDER'S PRIVILEGE SHAPE,
-- on the LOCAL database, inside a transaction that is ROLLED BACK.
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 WHY THIS FILE EXISTS
--
-- On 2026-08-07 the Supervisor found that the notification drain COULD NOT HAVE
-- READ A SINGLE ROW on Render. `notification_select` admitted only
-- `recipient_id = current_user_id()`, and a drain has no user. Every drain would
-- have reported `claimed: 0` for ever, and a message that DID send could never
-- be recorded as sent — so it would be re-sent after its lease, indefinitely.
--
-- That defect was invisible to the entire local suite, and it was invisible for
-- one reason, which this repository has now been burned by more than any other:
--
--     LOCAL IS A SUPERUSER. RENDER IS NOT.
--
-- Measured on this machine (2026-08-07):
--
--     proname                      | owner        | rolsuper | rolbypassrls
--     claim_pending_notifications  | autoworkshop | t        | t
--     record_notification_result   | autoworkshop | t        | t
--
-- A SECURITY DEFINER function runs as its OWNER. Locally that owner holds
-- BYPASSRLS, so no policy on `comms.notifications` is ever consulted and a green
-- drain test proves only that nodemailer works. On Render the owner is an
-- ordinary role and the table is FORCE ROW LEVEL SECURITY — the one setting that
-- stops even the owner being exempt — so the policies bind and the drain is
-- subject to every one of them.
--
-- verify/060 is honest about this: its checks 4 and 11 RAISE NOTICE locally and
-- are counted only under `Rehearse Migration On Live`. That is correct, but it
-- means the most dangerous property of this migration can only be observed by
-- reaching production. This file moves that observation to the laptop.
--
-- ── HOW THE SHAPE IS REPRODUCED ──────────────────────────────────────────────
--
-- A throwaway role is created with NOSUPERUSER NOBYPASSRLS, and the notification
-- table AND the four definer functions are re-owned to it. That reproduces the
-- three facts that matter simultaneously:
--
--   * the definer functions run as a role that cannot bypass RLS,
--   * that role is also the table owner, exactly as on Render, and
--   * the table is FORCE RLS, so being the owner grants no exemption.
--
-- Then the drain is exercised WITH NO TENANT AND NO USER CONTEXT, which is the
-- true state of a background drain and the state in which the defect existed.
--
-- ⚠️ EVERYTHING IS ROLLED BACK. CREATE ROLE, ALTER ... OWNER and the seeded rows
-- are all transactional in PostgreSQL, so it WRITES NOTHING THAT SURVIVES.
--
-- 🔴 THAT IS NOT THE SAME AS "HARMLESS ANYWHERE", and the first draft of this
-- header said it was. While the transaction is open, re-owning the table takes
-- an ACCESS EXCLUSIVE lock on `comms.notifications` — on a live database every
-- read and write of it blocks until the rollback. Nothing persists and the
-- service still stalls. So there is a hard guard at the top of the block: this
-- refuses to run on anything but a local development database.
--
-- ── HOW TO RUN ───────────────────────────────────────────────────────────────
--
--   docker exec -i aw-postgres psql -U autoworkshop -d autoworkshop -v ON_ERROR_STOP=1 \
--     < infrastructure/migrations/rehearse/060_notifications_render_privileges.sql
--
-- Must be run as a SUPERUSER, because only a superuser can re-own objects to
-- another role. That is not a weakening: the superuser is the STAGE HAND here,
-- and every assertion below is made while the acting role cannot bypass RLS.
-- ══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

BEGIN;

DO $rehearse$
DECLARE
    sim_role  CONSTANT text := 'aw_render_sim';
    tid uuid; oid uuid; me uuid;
    nid uuid;
    claimed_count int;
    claimed_id uuid;
    row_status text;
    row_sent_at timestamptz;
    row_attempts int;
    row_error TEXT;
    row_claimed_at timestamptz;
    passed int := 0;
    failed int := 0;
BEGIN
    -- ══════════════════════════════════════════════════════════════════════
    -- 🔴 REFUSE TO RUN ANYWHERE BUT A LOCAL DEVELOPMENT DATABASE.
    --
    -- The header used to say this "leaves the database exactly as it found
    -- it". Rollback does restore every catalog row, so nothing PERSISTS — but
    -- that claim was still too broad, because for the life of the transaction
    -- this takes OWNERSHIP-CHANGING DDL LOCKS on a live table and five live
    -- functions. On production that is an `ACCESS EXCLUSIVE` lock on
    -- `comms.notifications`: every notification read and write blocks behind
    -- it, and a rehearsal is not worth an outage. Codex, 2026-08-07.
    --
    -- The guard is on the SERVER, not on the operator remembering. It fails
    -- closed: an unrecognised database name is refused rather than allowed.
    -- ══════════════════════════════════════════════════════════════════════
    IF current_database() NOT IN ('autoworkshop', 'autoworkshop_test') THEN
        RAISE EXCEPTION 'rehearse/060 refuses to run on database % — it is for a LOCAL development database only', current_database();
    END IF;
    IF inet_server_addr() IS NOT NULL
       AND NOT (inet_server_addr() <<= inet '127.0.0.0/8'
             OR inet_server_addr() <<= inet '10.0.0.0/8'
             OR inet_server_addr() <<= inet '172.16.0.0/12'
             OR inet_server_addr() <<= inet '192.168.0.0/16') THEN
        RAISE EXCEPTION 'rehearse/060 refuses to run against the non-private server % — it takes DDL locks and is for LOCAL use only', inet_server_addr();
    END IF;
    -- ── 0. PROVE THE STARTING CONDITION, or the rehearsal is theatre ────────
    --
    -- If this database's definer owner already lacked BYPASSRLS there would be
    -- nothing to reproduce, and a pass would mean something different. Said out
    -- loud so a future reader knows which world the result came from.
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          JOIN pg_roles r ON r.oid = p.proowner
         WHERE n.nspname = 'comms'
           AND p.proname = 'claim_pending_notifications'
           AND r.rolbypassrls
    ) THEN
        RAISE NOTICE 'NOTE: the definer owner already lacks BYPASSRLS here; this database is not the local shape this rehearsal was written for.';
    ELSE
        RAISE NOTICE 'start: definer owner HOLDS bypassrls (the local shape) — re-owning to a role that does not.';
    END IF;

    -- ── 1. A ROLE SHAPED LIKE RENDER'S ──────────────────────────────────────
    EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS', sim_role);
    -- The current superuser must be a member to SET ROLE into it.
    EXECUTE format('GRANT %I TO CURRENT_USER', sim_role);
    EXECUTE format('GRANT USAGE ON SCHEMA comms, identity, core, audit TO %I', sim_role);

    -- ── 2. RE-OWN THE TABLE AND ITS DEFINER FUNCTIONS ───────────────────────
    --
    -- Owner == definer == a role with no exemption, which is Render exactly.
    EXECUTE format('ALTER TABLE comms.notifications OWNER TO %I', sim_role);
    EXECUTE format('ALTER FUNCTION comms.enqueue_notification(uuid,uuid,uuid,text,text,text,text,text,text,uuid,text) OWNER TO %I', sim_role);
    EXECUTE format('ALTER FUNCTION comms.notify_user(uuid,uuid,uuid,text,text,text,text,uuid,text) OWNER TO %I', sim_role);
    EXECUTE format('ALTER FUNCTION comms.notify_workshop_staff(uuid,uuid,text,text,text,text,uuid,text) OWNER TO %I', sim_role);
    EXECUTE format('ALTER FUNCTION comms.claim_pending_notifications(integer) OWNER TO %I', sim_role);
    EXECUTE format('ALTER FUNCTION comms.record_notification_result(uuid,boolean,text) OWNER TO %I', sim_role);

    -- The definer functions read these; on Render the owner has rights to them
    -- because it owns the whole schema. Granted explicitly here so that a
    -- failure below is a POLICY failure and never a missing-privilege failure —
    -- the two look identical in the error and mean opposite things.
    EXECUTE format('GRANT SELECT ON identity.users, identity.memberships, core.notification_preferences TO %I', sim_role);

    -- The POLICIES call these — `is_platform_admin()`, `current_user_id()`,
    -- `current_organization_id()` and friends — so without EXECUTE every check
    -- below dies on "permission denied for function ..." BEFORE reaching the
    -- policy it was meant to test, which would read as a failure of the drain
    -- rather than of the scaffolding.
    --
    -- Granted schema-wide rather than function-by-function on purpose: on Render
    -- the owner owns these outright, and enumerating them here means this file
    -- breaks every time a policy starts calling one more helper. Scaffolding,
    -- not a relaxation — the RLS policies are untouched and still bind.
    EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA identity TO %I', sim_role);
    EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA core TO %I', sim_role);

    -- ── 3. SEED ONE PENDING EMAIL, as the app does ──────────────────────────
    SELECT u.id INTO me FROM identity.users u
      WHERE u.status = 'active' AND u.email IS NOT NULL LIMIT 1;
    IF me IS NULL THEN
        RAISE EXCEPTION 'rehearse/060: no active user with an email — seed the dev identities first';
    END IF;
    SELECT t.id INTO tid FROM identity.tenants t LIMIT 1;
    SELECT o.id INTO oid FROM identity.organizations o WHERE o.tenant_id = tid LIMIT 1;
    IF oid IS NULL THEN
        RAISE EXCEPTION 'rehearse/060: no organisation under tenant %', tid;
    END IF;

    -- Written with tenant context, because a real notification is raised inside
    -- a business transaction that has one.
    PERFORM set_config('app.tenant_id', tid::text, true);
    PERFORM set_config('app.user_id', me::text, true);

    PERFORM comms.notify_user(
        tid, oid, me, 'service_request.created',
        'rehearsal', 'rehearsal body',
        'service_request', gen_random_uuid(),
        'rehearse-060:' || gen_random_uuid()::text);

    SELECT n.id INTO nid FROM comms.notifications n
     WHERE n.recipient_id = me AND n.channel = 'email' AND n.status = 'pending'
     ORDER BY n.created_at DESC LIMIT 1;
    IF nid IS NULL THEN
        RAISE EXCEPTION 'rehearse/060: the seed enqueue wrote no pending email row';
    END IF;
    RAISE NOTICE 'seeded pending email notification %', nid;

    -- ══════════════════════════════════════════════════════════════════════
    -- 🔴 THE REHEARSAL PROPER — FROM HERE ON THERE IS NO USER AND NO TENANT.
    --
    -- This is the drain's real state. Clearing the context is the entire point:
    -- with it set, `recipient_id = current_user_id()` would satisfy the SELECT
    -- policy and the check would pass for a reason the drain never has. That is
    -- exactly how the 2026-08-07 verify passed 15/15 against a dead drain — its
    -- fixture enqueued TO the same user it set as the caller.
    -- ══════════════════════════════════════════════════════════════════════
    PERFORM set_config('app.tenant_id', '', true);
    PERFORM set_config('app.user_id', '', true);
    PERFORM set_config('app.organization_ids', '', true);
    PERFORM set_config('app.current_role', '', true);

    -- 🔴 THE CALLER IS THE APP ROLE, NOT THE OWNER. That is Render exactly: the
    -- API connects as `autoworkshop_app`, and the definer functions it calls run
    -- as their owner (`aw_render_sim` here). Acting as the owner instead would
    -- quietly test a caller the product does not have.
    SET LOCAL ROLE autoworkshop_app;

    -- CHECK 1 — the acting role really cannot bypass RLS.
    -- Asserted rather than assumed: if this is false every check below is void.
    IF (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) THEN
        RAISE EXCEPTION 'rehearse/060: acting role % still bypasses RLS — the rehearsal proves nothing', current_user;
    END IF;
    passed := passed + 1;
    RAISE NOTICE 'PASS 1 — acting as %, bypassrls=false, no user context', current_user;

    -- CHECK 2 — 🔴 THE CLAIM CAN SEE WORK.
    -- This is the check that was worth the whole file. Before the Supervisor's
    -- fix this returned zero rows on Render while returning one locally.
    --
    -- Only the COUNT is taken here: `min(uuid)` is not an aggregate PostgreSQL
    -- offers, and claiming is a state change, so re-running it to fetch an id
    -- would claim different rows and quietly change what the next check means.
    SELECT count(*) INTO claimed_count
      FROM comms.claim_pending_notifications(10) c;
    IF claimed_count = 0 THEN
        failed := failed + 1;
        RAISE WARNING 'FAIL 2 — the drain claimed 0 rows with no user context. This is the 2026-08-07 defect: the SELECT policy has no clause a drain satisfies.';
    ELSE
        passed := passed + 1;
        RAISE NOTICE 'PASS 2 — the drain claimed % row(s) with no user context', claimed_count;
    END IF;

    -- CHECK 3 — the claim is a STATE CHANGE that survives the statement.
    -- A `FOR UPDATE SKIP LOCKED` claim would read as claimed here and still be
    -- `pending` to the next drain, because the API calls this through
    -- `pool.query` — one autocommit statement, locks released on return.
    --
    -- 🔴 THE READ-BACK RUNS AS THE STAGE HAND, NOT AS THE APP ROLE, and the
    -- first draft of this file got that wrong: it asserted while still acting as
    -- `autoworkshop_app` with no user context, so `notification_select` hid the
    -- row and every state check reported `<invisible>` — three FAILs against a
    -- drain that was working correctly. The distinction matters and is the whole
    -- discipline of this file: PRODUCT ACTIONS are performed under Render's
    -- privileges, INSPECTION is performed by the superuser running the
    -- rehearsal. Asserting through the restricted role would only re-test the
    -- SELECT policy, which check 2 already covers.
    RESET ROLE;
    SELECT n.status INTO row_status FROM comms.notifications n WHERE n.id = nid;
    SET LOCAL ROLE autoworkshop_app;
    IF row_status IS DISTINCT FROM 'sending' THEN
        failed := failed + 1;
        RAISE WARNING 'FAIL 3 — after claiming, status is % and not `sending`. A second drain would send this message again.', coalesce(row_status, '<invisible>');
    ELSE
        passed := passed + 1;
        RAISE NOTICE 'PASS 3 — the claimed row is `sending`, so a concurrent drain will not take it';
    END IF;

    -- CHECK 4 — a second claim does NOT return the same row.
    SELECT count(*) INTO claimed_count FROM comms.claim_pending_notifications(10) c WHERE c.id = nid;
    IF claimed_count <> 0 THEN
        failed := failed + 1;
        RAISE WARNING 'FAIL 4 — a second drain re-claimed the same row. Every recipient would get two copies.';
    ELSE
        passed := passed + 1;
        RAISE NOTICE 'PASS 4 — a second drain did not re-claim the row';
    END IF;

    -- CHECK 5 — 🔴 SUCCESS CAN BE RECORDED.
    -- The other half of the same defect: a message that sent but could not be
    -- written back as `sent` is re-sent after its lease, for ever. A customer
    -- receiving the same mail hourly is worse than never receiving it.
    PERFORM comms.record_notification_result(nid, true, NULL);
    RESET ROLE;  -- inspect as the stage hand; see check 3
    SELECT n.status, n.sent_at INTO row_status, row_sent_at
      FROM comms.notifications n WHERE n.id = nid;
    SET LOCAL ROLE autoworkshop_app;
    IF row_status IS DISTINCT FROM 'sent' OR row_sent_at IS NULL THEN
        failed := failed + 1;
        RAISE WARNING 'FAIL 5 — a delivered message could not be recorded as sent (status=%, sent_at=%). It would be re-sent after every lease.',
            coalesce(row_status, '<invisible>'), row_sent_at;
    ELSE
        passed := passed + 1;
        RAISE NOTICE 'PASS 5 — delivery was recorded: status=sent, sent_at set';
    END IF;

    -- CHECK 6 — a FAILURE is recorded too, and counts an attempt.
    -- Recording only success would leave a permanently retried row looking
    -- untouched, and the 5-attempt ceiling would never be reached.
    -- 🔴 THE ID COMES FROM THE ENQUEUE, NOT FROM `claim(...) LIMIT 1`.
    -- The first version claimed a batch and took whichever row came back
    -- first, so on a database with any other pending email it would assert
    -- against A DIFFERENT MESSAGE than the one it seeded — a fixture that
    -- silently tests something it did not create. Codex, 2026-08-07.
    SELECT comms.enqueue_notification(
        tid, oid, me, 'service_request.created', 'email',
        'rehearsal-2', 'rehearsal body 2', 'nobody@example.invalid',
        'service_request', gen_random_uuid(), 'rehearse-060-fail:' || gen_random_uuid()::text)
      INTO claimed_id;
    IF claimed_id IS NULL THEN
        failed := failed + 1;
        RAISE WARNING 'FAIL 6 — the second fixture was suppressed by a preference and never enqueued';
    ELSE
        PERFORM comms.claim_pending_notifications(10);
        PERFORM comms.record_notification_result(claimed_id, false, 'rehearsed failure');
        RESET ROLE;  -- inspect as the stage hand; see check 3
        -- 🔴 `attempts` IS ASSERTED, NOT ASSUMED. The check used to read only
        -- `status` while its own message claimed "with an attempt counted" —
        -- so a regression that restored `pending` and left `attempts` at 0
        -- would have PASSED, and the retry ceiling would never be reached.
        -- A message whose own text is broader than its assertion is this
        -- repository's most-recorded defect. `last_error` and `claimed_at`
        -- are checked for the same reason: the lease must be released or the
        -- row is stuck for 45 minutes after a failure that took no time.
        SELECT n.status, n.attempts, n.last_error, n.claimed_at
          INTO row_status, row_attempts, row_error, row_claimed_at
          FROM comms.notifications n WHERE n.id = claimed_id;
        SET LOCAL ROLE autoworkshop_app;
        IF row_status IS DISTINCT FROM 'pending' THEN
            failed := failed + 1;
            RAISE WARNING 'FAIL 6 — after one failure the row is % and not back to `pending` for retry', coalesce(row_status, '<invisible>');
        ELSIF row_attempts IS DISTINCT FROM 1 THEN
            failed := failed + 1;
            RAISE WARNING 'FAIL 6 — the failure was not counted: attempts=%, so the 5-attempt ceiling would never be reached', coalesce(row_attempts::text, '<null>');
        ELSIF row_error IS NULL THEN
            failed := failed + 1;
            RAISE WARNING 'FAIL 6 — the row is retryable but records no reason, so nobody can act on it';
        ELSIF row_claimed_at IS NOT NULL THEN
            failed := failed + 1;
            RAISE WARNING 'FAIL 6 — the lease was not released, so this row waits 45 minutes before a retry it could have had at once';
        ELSE
            passed := passed + 1;
            RAISE NOTICE 'PASS 6 — a failed send returned the row to `pending`, counted attempt 1, recorded the reason and released the lease';
        END IF;
    END IF;

    -- CHECK 7 — 🔴 A DIRECT INSERT IS STILL REFUSED under this privilege shape.
    -- verify/060 can only NOTICE this locally. Here it is genuinely observable,
    -- because the acting role is not exempt. The app role holds no INSERT at
    -- all, so this must fail on privileges before any policy is consulted.
    -- ⚠️ ONLY `insufficient_privilege` IS CAUGHT, DELIBERATELY. An earlier draft
    -- of this block caught OTHERS, which would have turned a typo in the INSERT
    -- — a wrong column, a bad cast — into a reported PASS. That is this
    -- repository's "a check that walks through its own gap and passes", and it
    -- would have been introduced by the very file written to prevent it. A
    -- refusal must be observed as a REFUSAL and nothing else.
    BEGIN
        EXECUTE format(
            'INSERT INTO comms.notifications (tenant_id, organization_id, recipient_id, event_key, channel, subject, body, dedupe_key) '
            'VALUES (%L, %L, %L, %L, %L, %L, %L, %L)',
            tid, oid, me, 'service_request.created', 'email', 'forged', 'forged', 'rehearse-060-forge:' || gen_random_uuid()::text);
        failed := failed + 1;
        RAISE WARNING 'FAIL 7 — the app role INSERTED a notification directly. A customer could forge a message wearing the workshop''s voice.';
    EXCEPTION
        -- `insufficient_privilege` (42501) and NOTHING ELSE. It is the code for
        -- both refusals that count here — a missing GRANT and
        -- "new row violates row-level security policy" share it — so one branch
        -- covers the lock holding either way.
        --
        -- ⚠️ `check_violation` is deliberately NOT caught. A CHECK failure would
        -- mean this statement never reached the lock at all (a bad `event_key`,
        -- a malformed dedupe key), and counting that as a refusal would let a
        -- broken fixture certify a door that was never tested.
        WHEN insufficient_privilege THEN
            passed := passed + 1;
            RAISE NOTICE 'PASS 7 — a direct INSERT by the app role was refused (%)', SQLERRM;
    END;

    RAISE NOTICE '─────────────────────────────────────────────';
    IF failed > 0 THEN
        RAISE EXCEPTION 'rehearse/060: % passed, % FAILED under Render''s privilege shape', passed, failed;
    END IF;
    RAISE NOTICE 'rehearse/060: %/% checks passed under Render''s privilege shape', passed, passed;
END;
$rehearse$;

-- 🔴 NOTHING IS KEPT. The role, the ownership changes and the seeded rows all
-- disappear here. A rehearsal that left state behind would be a migration.
ROLLBACK;
