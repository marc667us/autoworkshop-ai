-- 060 — notifications that are actually DELIVERED, not merely preferred
--
-- ══════════════════════════════════════════════════════════════════════════
-- Owner, 2026-08-07: "emailing system dont work".
--
-- `core.notification_preferences` has existed since 045: a workshop can say
-- which events it wants, on which channel, per user. NOTHING HAS EVER SENT
-- ANYTHING. The preference table is read and written by the settings screen and
-- consulted by no sender, because no sender exists. That is this repository's
-- "recorded, not enforced" shape, and here it means the product silently
-- promises a communication channel it does not have.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── 🔴 WHY AN OUTBOX AND NOT A DIRECT SEND ────────────────────────────────
--
-- A notification is raised INSIDE a business transaction — a service request is
-- filed, a repair is authorised — and mail delivery is the least reliable thing
-- in the system. If sending were inline:
--
--   * a slow or dead SMTP relay would slow or fail the BUSINESS action, so a
--     customer could not file a request because a mail server was down, and
--   * a message lost to a transient failure would be lost for ever, with no
--     record that it was ever owed.
--
-- The row is therefore written in the SAME transaction as the business change —
-- so it cannot be lost if the business change commits — and delivery is
-- attempted afterwards. A failure updates the row and nothing else.
--
-- ⚠️ THIS IS ALSO WHAT MAKES THE FEATURE WORK WITH NO MAIL SERVER AT ALL
-- (ADR-015, bring-your-own-connection). With nothing configured, rows are
-- written and stay `pending`, the in-app channel still works, and the moment a
-- relay exists the backlog drains. The app is never broken by the absence of a
-- provider it was never guaranteed.
--
-- ── 🔴 WHY AN `INSERT` POLICY COULD NOT EXPRESS THIS ──────────────────────
--
-- The whole point of a notification is that the person who TRIGGERS it is not
-- the person who RECEIVES it. A customer files a request; RECEPTION must hear
-- about it. So:
--
--   * "recipient = current_user_id()" refuses the only insert that matters, and
--   * "any member of the tenant may insert for any other" lets a customer forge
--     a message that arrives wearing the workshop's own voice — a phishing
--     surface inside the product.
--
-- Neither is acceptable, so inserting is not granted to the app at all. The
-- ONLY way in is `comms.enqueue_notification`, which sets `app.notify` for the
-- statement and is the single thing the INSERT policy trusts. That is the same
-- shape migration 037 used for registration bootstrap, and it is used here for
-- the same reason: a row that a caller legitimately cannot insert on its own
-- authority.
--
-- ⚠️ `SET LOCAL` — scoped to the transaction, so the door shuts on COMMIT even
-- if the caller never cleans up. A `SET` here would leave it open for the rest
-- of the pooled connection's life, which is every subsequent request.

BEGIN;

CREATE TABLE IF NOT EXISTS comms.notifications (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    -- WHO IS BEING TOLD. Always a real user: a notification with no addressee
    -- is a log line, and this table is not a log.
    recipient_id     uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,

    -- Same vocabulary as `core.notification_preferences.event_key`, and the
    -- same CHECK, so a preference can never silently fail to match a
    -- notification because one side allowed a shape the other did not.
    event_key        TEXT NOT NULL CHECK (event_key ~ '^[a-z][a-z0-9_.]{2,80}$'),
    channel          TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'in_app', 'push')),

    -- TEXT, never VARCHAR(n). Subjects and bodies are generated, and this
    -- project already has a truncation incident from narrow columns meeting
    -- generated content.
    subject          TEXT NOT NULL CHECK (length(btrim(subject)) > 0),
    body             TEXT NOT NULL CHECK (length(btrim(body)) > 0),

    -- The address at the moment of sending. Kept because a user may change
    -- their email later and "where did we actually send it" is an audit
    -- question, not a lookup.
    to_address       TEXT,

    -- What it is ABOUT, so the in-app list can link back to the thing.
    resource_type    TEXT,
    resource_id      uuid,

    -- 🔴 `sending` IS NOT DECORATION. A drain that merely SELECTed pending rows
    -- would leave them pending while it was sending them, and the second drain
    -- would send them again — see `claim_pending_notifications` for why
    -- FOR UPDATE alone cannot prevent that here.
    status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'suppressed')),
    attempts         integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error       TEXT,
    sent_at          timestamptz,
    read_at          timestamptz,
    -- When the current attempt started. A drain that dies mid-send would
    -- otherwise strand its rows in `sending` for ever; anything older than the
    -- lease below is reclaimed.
    claimed_at       timestamptz,

    -- 🔴 THE SAME EVENT MUST NOT ARRIVE TWICE. A retry, a double-submitted
    -- form, or a drain that runs while a previous drain is still finishing all
    -- produce a second attempt at the same message. The caller supplies a key
    -- describing the EVENT ("service_request.created:<id>:<recipient>"), and
    -- the database refuses the duplicate rather than trusting every caller to
    -- remember.
    dedupe_key       TEXT NOT NULL,

    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_notification_dedupe UNIQUE (organization_id, dedupe_key),

    -- A sent notification must say when. Without this a row can claim delivery
    -- and carry no evidence of it, which is the state every "did they get it?"
    -- question dies in.
    CONSTRAINT ck_notification_sent_at
        CHECK ((status <> 'sent') OR (sent_at IS NOT NULL))
);

-- The recipient's own list, newest first — the in-app bell.
CREATE INDEX IF NOT EXISTS idx_notification_recipient
    ON comms.notifications (recipient_id, created_at DESC);
-- The drain's query: everything still owed, oldest first so nothing starves.
CREATE INDEX IF NOT EXISTS idx_notification_pending
    ON comms.notifications (status, created_at)
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notification_tenant
    ON comms.notifications (tenant_id);
CREATE INDEX IF NOT EXISTS idx_notification_org
    ON comms.notifications (organization_id, event_key, created_at DESC);

ALTER TABLE comms.notifications ENABLE ROW LEVEL SECURITY;
-- FORCE: the app connects as the table owner on Render, and an un-FORCEd
-- policy is inert for the owner.
ALTER TABLE comms.notifications FORCE ROW LEVEL SECURITY;

-- ── SELECT: THE RECIPIENT, AND NOBODY ELSE ────────────────────────────────
--
-- Deliberately NOT "anyone in the organisation". A notification carries the
-- subject and body of a message addressed to one person — a customer's repair
-- quote, a technician's assignment. An org-wide predicate would let every
-- member of a workshop read every other member's and every customer's messages,
-- which is the 45-screen leak again, one layer further down.
--
-- 🔴 `app.notify` IS ON THIS POLICY TOO, AND LEAVING IT OFF BROKE EVERYTHING.
--
-- The first version said "the DRAIN does not read through this policy: it runs
-- as a definer function". That is wrong twice. A SECURITY DEFINER function runs
-- as the function's OWNER, and the owner of this table is `autoworkshop`, which
-- ON RENDER IS NOT A SUPERUSER (migration 037's header records exactly this) —
-- and the table is FORCE ROW LEVEL SECURITY, which is precisely the setting
-- that stops the owner being exempt. So the drain DOES read through this
-- policy, with no `app.user_id` set, and both disjuncts above are false.
--
-- MEASURED, not reasoned: as `autoworkshop_app` with no user context this table
-- returned 0 rows — and still 0 with `app.notify=on`, because the flag was on
-- INSERT and UPDATE and not here. `claim_pending_notifications` selects inside a
-- CTE and `record_notification_result` matches `WHERE id = p_id`; both need
-- SELECT. The consequence was total: every drain would report `claimed: 0` for
-- ever, no email would ever be sent, and a *successfully sent* message could
-- never be recorded as sent — so it would be reclaimed after its lease and
-- delivered to the customer again, indefinitely.
--
-- Found by the Supervisor. It passed locally for the one reason this repository
-- has been burned by more than any other: the local role is a superuser and
-- bypasses RLS entirely.
DROP POLICY IF EXISTS notification_select ON comms.notifications;
CREATE POLICY notification_select ON comms.notifications FOR SELECT USING (
  identity.is_platform_admin()
  OR recipient_id = identity.current_user_id()
  -- The drain's door, open only inside a transaction one of the definer
  -- functions below has opened.
  OR current_setting('app.notify', true) = 'on'
);

-- ── INSERT: ONLY THROUGH THE FUNCTION ─────────────────────────────────────
--
-- See the header. `app.notify` is set by `comms.enqueue_notification` for the
-- duration of one transaction and by nothing else, so a direct INSERT from the
-- app role is refused even though the app role holds the grant.
DROP POLICY IF EXISTS notification_insert ON comms.notifications;
CREATE POLICY notification_insert ON comms.notifications FOR INSERT WITH CHECK (
  identity.is_platform_admin()
  OR current_setting('app.notify', true) = 'on'
);

-- ── UPDATE: the recipient marks it READ; the sender marks it SENT ─────────
--
-- Two different writers with two different rights, so the WITH CHECK is not a
-- copy of the USING clause. A recipient may touch their own row (to read it);
-- delivery bookkeeping happens through the definer function, under `app.notify`.
DROP POLICY IF EXISTS notification_update ON comms.notifications;
CREATE POLICY notification_update ON comms.notifications FOR UPDATE USING (
  identity.is_platform_admin()
  OR recipient_id = identity.current_user_id()
  OR current_setting('app.notify', true) = 'on'
) WITH CHECK (
  identity.is_platform_admin()
  OR recipient_id = identity.current_user_id()
  OR current_setting('app.notify', true) = 'on'
);

-- ── 🔴 THE GRANTS ARE THE REAL DOOR, NOT THE GUC ──────────────────────────
--
-- The INSERT policy above trusts `current_setting('app.notify')`, and Codex was
-- right to point out on 2026-08-07 that POSTGRES DOES NOT STOP THE CALLER
-- SETTING THAT ITSELF. `autoworkshop_app` could run
-- `SELECT set_config('app.notify','on',true)` and then insert. The comment
-- claiming the function was "the only way in" was therefore describing an
-- intention, not an enforcement — the same shape as a comment asserting a guard
-- that does not exist, which this repository has now recorded three times.
--
-- So the privilege is removed rather than argued about. The app role holds NO
-- INSERT on this table at all: the definer functions run as the table's OWNER
-- and are the only thing that can create a notification. A forged direct INSERT
-- now fails on PRIVILEGES, before any policy is consulted, and the GUC becomes
-- what it should always have been — defence in depth, not the lock.
--
-- ⚠️ UPDATE IS COLUMN-SCOPED. A recipient must be able to mark their own
-- notification read, and nothing more. With a table-wide UPDATE grant that same
-- path could rewrite `status`, `attempts` or `sent_at` — letting a recipient
-- mark their own unsent mail as delivered, or resurrect a failed one. Postgres
-- expresses "only these columns" directly, so it is said in the grant instead
-- of being left to every future call site to remember.
GRANT SELECT ON comms.notifications TO autoworkshop_app;
GRANT UPDATE (read_at, updated_at) ON comms.notifications TO autoworkshop_app;

-- ══════════════════════════════════════════════════════════════════════════
-- ENQUEUE — the only door in
-- ══════════════════════════════════════════════════════════════════════════
--
-- Returns the row id, or NULL when the recipient has switched this event off.
-- A suppressed notification writes NOTHING: a row would claim the product tried
-- to tell somebody something it was asked not to say.
--
-- ⚠️ THE PREFERENCE LOOKUP IS "MOST SPECIFIC WINS": a row naming the user beats
-- the organisation default, and silence means ENABLED. Defaulting to disabled
-- would mean a workshop that never opened the settings screen is never told
-- anything, and would look identical to this feature not working.
CREATE OR REPLACE FUNCTION comms.enqueue_notification(
    p_tenant_id       uuid,
    p_organization_id uuid,
    p_recipient_id    uuid,
    p_event_key       TEXT,
    p_channel         TEXT,
    p_subject         TEXT,
    p_body            TEXT,
    p_to_address      TEXT,
    p_resource_type   TEXT,
    p_resource_id     uuid,
    p_dedupe_key      TEXT
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
-- An empty search_path: every object below is schema-qualified, so a caller
-- cannot shadow `comms` or `core` with something of their own and have this
-- definer function execute it.
SET search_path = ''
AS $$
DECLARE
    v_enabled boolean;
    v_id      uuid;
BEGIN
    -- 🔴 THE CALLER MAY ONLY NOTIFY INSIDE ITS OWN TENANT.
    --
    -- These functions are SECURITY DEFINER and take the tenant, the recipient
    -- and the body as arguments, so without this they are a general-purpose
    -- "send anything to anyone" primitive granted to the whole app role — the
    -- one place a bug or an injection elsewhere would turn into cross-tenant
    -- messages wearing another workshop's voice. Codex raised this, 2026-08-07.
    --
    -- A background drain legitimately has NO tenant context, so an unset tenant
    -- is allowed through: it can only reach the two bookkeeping functions
    -- below, neither of which creates a notification.
    IF identity.current_tenant_id() IS NOT NULL
       AND p_tenant_id <> identity.current_tenant_id()
       AND NOT identity.is_platform_admin() THEN
        RAISE EXCEPTION 'a notification may not be raised for another tenant';
    END IF;

    -- Most specific preference wins; no row at all means enabled.
    SELECT p.is_enabled INTO v_enabled
      FROM core.notification_preferences p
     WHERE p.organization_id = p_organization_id
       AND p.event_key = p_event_key
       AND p.channel = p_channel
       AND (p.user_id = p_recipient_id OR p.user_id IS NULL)
     ORDER BY (p.user_id IS NOT NULL) DESC
     LIMIT 1;

    IF v_enabled IS NOT NULL AND v_enabled = false THEN
        RETURN NULL;
    END IF;

    -- The door, open for THIS TRANSACTION ONLY.
    PERFORM set_config('app.notify', 'on', true);

    -- 🔴 AN IN-APP NOTIFICATION HAS NO TRANSPORT, so it is DELIVERED the moment
    -- it is written and must say so. Left `pending` it would sit in the drain's
    -- partial index for the life of the row — a permanently growing backlog of
    -- "work that is owed" which nothing will ever do, making the one metric an
    -- operator would check meaningless (Supervisor, 2026-08-07).
    INSERT INTO comms.notifications (
        tenant_id, organization_id, recipient_id, event_key, channel,
        subject, body, to_address, resource_type, resource_id, dedupe_key,
        status, sent_at
    ) VALUES (
        p_tenant_id, p_organization_id, p_recipient_id, p_event_key, p_channel,
        p_subject, p_body, p_to_address, p_resource_type, p_resource_id, p_dedupe_key,
        CASE WHEN p_channel = 'in_app' THEN 'sent' ELSE 'pending' END,
        CASE WHEN p_channel = 'in_app' THEN now() ELSE NULL END
    )
    -- The duplicate is not an error: the event genuinely happened twice, and
    -- the caller wants to know the message is already owed, not to crash.
    ON CONFLICT ON CONSTRAINT uq_notification_dedupe DO NOTHING
    RETURNING id INTO v_id;

    -- 🔴 SHUT THE DOOR. `SET LOCAL` already scopes it to the transaction, but a
    -- business transaction continues after this returns — so every later
    -- statement in the customer's request would still satisfy the notification
    -- policies. `register_workshop` (038) and `memberships_for_subject` (039)
    -- both close their own doors for this reason; leaving it open here was an
    -- inconsistency the Supervisor was right to name.
    PERFORM set_config('app.notify', 'off', true);
    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION comms.enqueue_notification(
    uuid, uuid, uuid, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, uuid, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION comms.enqueue_notification(
    uuid, uuid, uuid, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, uuid, TEXT) TO autoworkshop_app;

-- ══════════════════════════════════════════════════════════════════════════
-- TELL THE WORKSHOP'S STAFF
-- ══════════════════════════════════════════════════════════════════════════
--
-- 🔴 WHY THE RECIPIENTS ARE RESOLVED IN HERE AND NOT IN THE APPLICATION.
--
-- The event that most needs this is a CUSTOMER filing a service request, and
-- the people who must hear about it are the workshop's STAFF. Resolving them in
-- the API would mean running that query in the customer's own session, where:
--
--   1. IT RETURNS NOTHING. `identity.memberships` restricts a caller to their
--      own rows (migration 039), so the customer would resolve zero recipients
--      and the workshop would never be told — a complete feature with no
--      reachable caller, which this repository has recorded four times.
--   2. IT WOULD BE WORSE IF IT WORKED. Loosening that policy to make it work
--      would hand every customer the workshop's staff list AND THEIR EMAIL
--      ADDRESSES — the same class of leak as the call participants defect,
--      where a name and an email were rendered back across a boundary.
--
-- Doing it here keeps the addresses inside the database: the customer's request
-- never sees a staff email, it only causes one to be written.
--
-- ⚠️ `customer` IS DELIBERATELY NOT IN THE ROLE LIST. It is a real membership
-- role in the workshop's own organisation — the fact behind every ungated-read
-- defect in this codebase — so "everybody in the org" would email the workshop's
-- intake back to the customers who filed it.
CREATE OR REPLACE FUNCTION comms.notify_workshop_staff(
    p_tenant_id       uuid,
    p_organization_id uuid,
    p_event_key       TEXT,
    p_subject         TEXT,
    p_body            TEXT,
    p_resource_type   TEXT,
    p_resource_id     uuid,
    p_dedupe_prefix   TEXT
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    r record;
    n integer := 0;
    v_id uuid;
BEGIN
    FOR r IN
        SELECT DISTINCT u.id, u.email
          FROM identity.memberships m
          JOIN identity.users u ON u.id = m.user_id
         WHERE m.organization_id = p_organization_id
           -- 'active' is a STATUS, not a boolean. There is no `is_active`
           -- column on this table.
           AND m.status = 'active'
           AND u.status = 'active'
           AND m.role_name IN ('reception_staff', 'workshop_manager', 'workshop_owner')
    LOOP
        v_id := comms.enqueue_notification(
            p_tenant_id, p_organization_id, r.id, p_event_key, 'in_app',
            p_subject, p_body, r.email, p_resource_type, p_resource_id,
            p_dedupe_prefix || ':' || r.id::text || ':in_app');
        IF v_id IS NOT NULL THEN n := n + 1; END IF;

        v_id := comms.enqueue_notification(
            p_tenant_id, p_organization_id, r.id, p_event_key, 'email',
            p_subject, p_body, r.email, p_resource_type, p_resource_id,
            p_dedupe_prefix || ':' || r.id::text || ':email');
        IF v_id IS NOT NULL THEN n := n + 1; END IF;
    END LOOP;
    RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION comms.notify_workshop_staff(
    uuid, uuid, TEXT, TEXT, TEXT, TEXT, uuid, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION comms.notify_workshop_staff(
    uuid, uuid, TEXT, TEXT, TEXT, TEXT, uuid, TEXT) TO autoworkshop_app;

-- ══════════════════════════════════════════════════════════════════════════
-- TELL ONE PERSON
-- ══════════════════════════════════════════════════════════════════════════
--
-- The mirror of the function above, and it exists for the same reason: the
-- decision to accept or decline a request is taken by STAFF, and the person who
-- must hear about it is the CUSTOMER. Resolving that customer's email in the
-- staff member's session would work today only because staff can read users in
-- their tenant — which is a privilege that should not quietly become a
-- dependency of the notification system. Resolving it here keeps the address
-- out of the request entirely.
--
-- ⚠️ The address is read from `identity.users` AT SEND TIME and stored on the
-- row, so "where did we actually send it" stays answerable after somebody
-- changes their email.
CREATE OR REPLACE FUNCTION comms.notify_user(
    p_tenant_id       uuid,
    p_organization_id uuid,
    p_recipient_id    uuid,
    p_event_key       TEXT,
    p_subject         TEXT,
    p_body            TEXT,
    p_resource_type   TEXT,
    p_resource_id     uuid,
    p_dedupe_prefix   TEXT
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_email TEXT;
    v_id    uuid;
    n       integer := 0;
BEGIN
    SELECT u.email INTO v_email
      FROM identity.users u
     WHERE u.id = p_recipient_id AND u.status = 'active';

    -- No such user, or a closed account: nothing is owed. Writing a row
    -- addressed to nobody would sit in the queue failing for ever.
    IF v_email IS NULL THEN
        RETURN 0;
    END IF;

    v_id := comms.enqueue_notification(
        p_tenant_id, p_organization_id, p_recipient_id, p_event_key, 'in_app',
        p_subject, p_body, v_email, p_resource_type, p_resource_id,
        p_dedupe_prefix || ':in_app');
    IF v_id IS NOT NULL THEN n := n + 1; END IF;

    v_id := comms.enqueue_notification(
        p_tenant_id, p_organization_id, p_recipient_id, p_event_key, 'email',
        p_subject, p_body, v_email, p_resource_type, p_resource_id,
        p_dedupe_prefix || ':email');
    IF v_id IS NOT NULL THEN n := n + 1; END IF;

    RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION comms.notify_user(
    uuid, uuid, uuid, TEXT, TEXT, TEXT, TEXT, uuid, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION comms.notify_user(
    uuid, uuid, uuid, TEXT, TEXT, TEXT, TEXT, uuid, TEXT) TO autoworkshop_app;

-- ══════════════════════════════════════════════════════════════════════════
-- THE DRAIN'S TWO CALLS
-- ══════════════════════════════════════════════════════════════════════════
--
-- A background sender has NO USER CONTEXT — there is no signed-in person when a
-- cron drains a queue — so it cannot read through `notification_select`, whose
-- whole purpose is to be about the signed-in person. These two definer
-- functions are its entire surface: claim some pending work, record what
-- happened to it. It can do nothing else, and in particular it cannot read a
-- notification it did not claim.
-- 🔴 CLAIMING IS AN UPDATE, NOT A SELECT — AND THE FIRST VERSION GOT THIS WRONG.
--
-- It was `SELECT ... FOR UPDATE SKIP LOCKED`, with a comment asserting that two
-- overlapping drains therefore could not send the same message twice. THAT WAS
-- FALSE, and Codex caught it: the API calls this through `queryWithoutTenant`,
-- which is `pool.query` — a SINGLE AUTOCOMMIT STATEMENT. The row locks are
-- released the moment the function returns, long before any mail is sent. Two
-- drains would each claim the same rows and every customer would get two copies.
--
-- A row lock can only protect work done INSIDE its transaction, and the work
-- here is an SMTP conversation in another process. So the claim must CHANGE THE
-- ROW: `sending` is a state the next drain does not select, and it survives the
-- statement because it is committed data rather than a lock.
--
-- ⚠️ AND A LEASE, because a drain that dies mid-send would otherwise strand its
-- rows in `sending` for ever — swapping a double-send for a silent never-send.
-- Anything claimed longer ago than the lease is fair game again.
--
-- 🔴 THE LEASE MUST OUTLAST THE WORST-CASE BATCH, or a drain reclaims rows the
-- previous drain is STILL SENDING and the customer gets two copies — the very
-- fault this function was rewritten to fix, reintroduced through the timeout.
-- 45 minutes against a batch capped at 50 messages × a 20s socket timeout
-- (~17 minutes worst case), and the API stops sending at 10 minutes anyway.
-- It was 15 minutes with a default batch of 200, i.e. up to ~66 minutes of work
-- against a 15-minute lease (Supervisor, 2026-08-07).
CREATE OR REPLACE FUNCTION comms.claim_pending_notifications(p_limit integer)
RETURNS TABLE (
    id uuid, organization_id uuid, recipient_id uuid, channel TEXT,
    subject TEXT, body TEXT, to_address TEXT, attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM set_config('app.notify', 'on', true);
    RETURN QUERY
    WITH picked AS (
        SELECT n.id
          FROM comms.notifications n
         WHERE n.channel = 'email'
           AND (
                 n.status = 'pending'
                 -- Reclaimed: a previous drain took it and never reported back.
                 OR (n.status = 'sending' AND n.claimed_at < now() - interval '45 minutes')
               )
           -- Five attempts, then `record_notification_result` marks it failed
           -- and it stops costing time on every drain for ever.
           AND n.attempts < 5
         ORDER BY n.created_at
         -- Still SKIP LOCKED, but now it only protects two drains racing to run
         -- THIS statement — which is exactly the scope a row lock can cover.
         FOR UPDATE SKIP LOCKED
         LIMIT GREATEST(p_limit, 0)
    )
    UPDATE comms.notifications n
       SET status = 'sending', claimed_at = now(), updated_at = now()
      FROM picked
     WHERE n.id = picked.id
    RETURNING n.id, n.organization_id, n.recipient_id, n.channel,
              n.subject, n.body, n.to_address, n.attempts;
    PERFORM set_config('app.notify', 'off', true);
END;
$$;

CREATE OR REPLACE FUNCTION comms.record_notification_result(
    p_id uuid, p_sent boolean, p_error TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM set_config('app.notify', 'on', true);
    UPDATE comms.notifications
       SET status     = CASE
                          WHEN p_sent THEN 'sent'
                          -- 🔴 A ROW THE DRAIN WILL NEVER TAKE AGAIN MUST NOT
                          -- SAY `pending`. The claim stops at 5 attempts, so
                          -- the previous version left exhausted messages
                          -- permanently pending and undrainable: an operator
                          -- reading the queue would see work that was owed and
                          -- would never happen. Codex, 2026-08-07.
                          WHEN attempts + 1 >= 5 THEN 'failed'
                          ELSE 'pending'
                        END,
           -- Counted on FAILURE only. Counting successes would let a row that
           -- was delivered first time look like one that had struggled.
           attempts   = attempts + CASE WHEN p_sent THEN 0 ELSE 1 END,
           last_error = CASE WHEN p_sent THEN NULL ELSE p_error END,
           sent_at    = CASE WHEN p_sent THEN now() ELSE sent_at END,
           -- Released either way: the attempt is over.
           claimed_at = NULL,
           updated_at = now()
     WHERE id = p_id;
    PERFORM set_config('app.notify', 'off', true);
END;
$$;

REVOKE ALL ON FUNCTION comms.claim_pending_notifications(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION comms.record_notification_result(uuid, boolean, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION comms.claim_pending_notifications(integer) TO autoworkshop_app;
GRANT EXECUTE ON FUNCTION comms.record_notification_result(uuid, boolean, TEXT) TO autoworkshop_app;

COMMIT;
