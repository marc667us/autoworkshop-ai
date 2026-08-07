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

    status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'sent', 'failed', 'suppressed')),
    attempts         integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error       TEXT,
    sent_at          timestamptz,
    read_at          timestamptz,

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
-- The DRAIN does not read through this policy: it runs as a definer function
-- below, because a background sender legitimately has no user context at all.
DROP POLICY IF EXISTS notification_select ON comms.notifications;
CREATE POLICY notification_select ON comms.notifications FOR SELECT USING (
  identity.is_platform_admin()
  OR recipient_id = identity.current_user_id()
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

-- No DELETE policy and no DELETE grant. A notification is a record that
-- something was said; it is dismissed by being read, not by disappearing.
GRANT SELECT, INSERT, UPDATE ON comms.notifications TO autoworkshop_app;

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

    INSERT INTO comms.notifications (
        tenant_id, organization_id, recipient_id, event_key, channel,
        subject, body, to_address, resource_type, resource_id, dedupe_key
    ) VALUES (
        p_tenant_id, p_organization_id, p_recipient_id, p_event_key, p_channel,
        p_subject, p_body, p_to_address, p_resource_type, p_resource_id, p_dedupe_key
    )
    -- The duplicate is not an error: the event genuinely happened twice, and
    -- the caller wants to know the message is already owed, not to crash.
    ON CONFLICT ON CONSTRAINT uq_notification_dedupe DO NOTHING
    RETURNING id INTO v_id;

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
    SELECT n.id, n.organization_id, n.recipient_id, n.channel,
           n.subject, n.body, n.to_address, n.attempts
      FROM comms.notifications n
     WHERE n.status = 'pending'
       AND n.channel = 'email'
       -- Five attempts, then it stops costing time on every drain for ever.
       -- The row stays `pending` rather than being falsified as `sent`.
       AND n.attempts < 5
     ORDER BY n.created_at
     -- 🔴 SKIP LOCKED: two drains overlapping is normal (a cron fires while the
     -- previous run is still finishing). Without this they would both select the
     -- same rows and send every message twice.
     FOR UPDATE SKIP LOCKED
     LIMIT GREATEST(p_limit, 0);
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
       SET status     = CASE WHEN p_sent THEN 'sent' ELSE 'pending' END,
           -- Counted on FAILURE only. Counting successes would let a row that
           -- was delivered first time look like one that had struggled.
           attempts   = attempts + CASE WHEN p_sent THEN 0 ELSE 1 END,
           last_error = CASE WHEN p_sent THEN NULL ELSE p_error END,
           sent_at    = CASE WHEN p_sent THEN now() ELSE sent_at END,
           updated_at = now()
     WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION comms.claim_pending_notifications(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION comms.record_notification_result(uuid, boolean, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION comms.claim_pending_notifications(integer) TO autoworkshop_app;
GRANT EXECUTE ON FUNCTION comms.record_notification_result(uuid, boolean, TEXT) TO autoworkshop_app;

COMMIT;
