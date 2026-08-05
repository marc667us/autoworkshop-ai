-- 046 — messaging: threads, messages, participants, read receipts
--
-- ══════════════════════════════════════════════════════════════════════════
-- SLICE 7 of docs/00-project/COMPLETION_PLAN.md — text and files. Calls are 11.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── 🔴 THIS SLICE NEEDS NO NEW ATTACHMENT MECHANISM ────────────────────────
--
-- `media.links.owner_type` has carried `'message'` since migration 040, and
-- `MediaService.OWNER_TABLES` already maps it to `comms.messages`. The service
-- currently answers *"attaching files to a message is not built yet"* — not
-- because attaching is unimplemented, but because the TABLE it probes does not
-- exist and the `42P01` is translated into that sentence.
--
-- So creating `comms.messages` with `tenant_id` and `organization_id` is the
-- whole of it: `assertOwnerReachable` starts finding rows and attachments work.
-- Building a second attachment path here would have duplicated a working one —
-- the exact defect Directive §3 exists to stop.
--
-- ⚠️ WHICH MAKES THE COLUMN NAMES LOAD-BEARING. `MediaService` probes
-- `WHERE id = $1 AND tenant_id = $2 AND organization_id = $3`. A `comms.messages`
-- that named either column differently would compile, deploy, and refuse every
-- attachment with "no such message".
--
-- ── 🔴 A THREAD IS NOT A CHAT ROOM; IT IS A CONVERSATION ABOUT SOMETHING ───
--
-- Every thread optionally names a job card. That is what makes a customer's
-- question land against the right repair on the workshop side rather than in a
-- general inbox somebody has to triage. `01.txt` §33/§48 both describe messages
-- reached FROM a job, not beside it.
--
-- ── 🔴 READ RECEIPTS ARE PER (message, person) AND APPEND-ONLY ─────────────
--
-- The tempting shape is `messages.is_read boolean`. It is wrong the moment two
-- people share an inbox: whoever opens it first marks it read for everybody,
-- and the second person never learns the message existed. It is also the
-- "counter that drifts" mistake slices 3 and 4 both refused.
--
-- Unread is therefore DERIVED: messages in my threads, not sent by me, with no
-- receipt row for me. That is what the layout's badge reads — replacing a
-- hardcoded 5 that had been sitting on the first screen every user sees.
--
-- ── ⚠️ ORGANISATION-SCOPED RLS, AS 045 ESTABLISHED ─────────────────────────
--
-- Same reasoning as migration 045: a tenant here holds more than one
-- organisation, so a tenant-only predicate is not isolation. Messages are the
-- most obviously private thing in the product, so they get both predicates.

BEGIN;

CREATE SCHEMA IF NOT EXISTS comms;
GRANT USAGE ON SCHEMA comms TO autoworkshop_app;

-- ── threads ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS comms.threads (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    -- A closed vocabulary. Each value is a separate screen in the nav trees
    -- (§46 customer/technician/supplier messages, §49 specialist support), and
    -- a free-text kind could not be routed to one.
    thread_kind      TEXT NOT NULL CHECK (thread_kind IN (
                        'customer', 'technician', 'supplier', 'internal', 'specialist_support')),

    subject          TEXT NOT NULL CHECK (length(btrim(subject)) > 0),

    -- What the conversation is ABOUT. Nullable: a supplier chasing an invoice
    -- has no job card, and forcing one would mean inventing a job to hold a
    -- message.
    job_card_id      uuid REFERENCES repair.job_cards(id) ON DELETE SET NULL,
    customer_id      uuid REFERENCES core.customers(id) ON DELETE SET NULL,

    status           TEXT NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'closed')),

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    -- Denormalised ONLY as an ordering key for the inbox. It is not a count and
    -- it is not authority for anything; the messages table remains the truth.
    last_message_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_threads_tenant ON comms.threads (tenant_id);
CREATE INDEX IF NOT EXISTS idx_threads_org    ON comms.threads (organization_id, thread_kind, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_job    ON comms.threads (job_card_id) WHERE job_card_id IS NOT NULL;

-- ── participants ────────────────────────────────────────────────────────────
--
-- ⚠️ THIS TABLE IS THE ACCESS RULE, not a display list. A message is readable
-- because you are in its thread. Deriving readership from role instead would
-- mean every technician could read every customer's private conversation.

CREATE TABLE IF NOT EXISTS comms.participants (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
    thread_id        uuid NOT NULL REFERENCES comms.threads(id) ON DELETE CASCADE,

    user_id          uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    -- Which side they are on. A customer participant is a real application user
    -- (they sign in to customer-web), so this is not an identity, it is a
    -- STANCE in this conversation.
    party_kind       TEXT NOT NULL CHECK (party_kind IN ('workshop', 'customer', 'supplier', 'specialist')),

    added_by         uuid,
    added_at         timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_participant UNIQUE (thread_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_participants_tenant ON comms.participants (tenant_id);
CREATE INDEX IF NOT EXISTS idx_participants_user   ON comms.participants (user_id, thread_id);

-- ── messages ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS comms.messages (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- 🔴 THESE TWO COLUMN NAMES ARE A CONTRACT WITH `MediaService`, which probes
    -- `WHERE id = $1 AND tenant_id = $2 AND organization_id = $3`. Renaming
    -- either would break every attachment with "no such message" — and would
    -- typecheck, lint and deploy first.
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    thread_id        uuid NOT NULL REFERENCES comms.threads(id) ON DELETE CASCADE,
    sender_user_id   uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,

    -- TEXT, never VARCHAR(n) — CLAUDE.md's schema rules. The length bound lives
    -- on the request schema, where exceeding it is a validation message rather
    -- than a silent truncation.
    body             TEXT NOT NULL CHECK (length(btrim(body)) > 0),

    sent_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_tenant ON comms.messages (tenant_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON comms.messages (thread_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON comms.messages (sender_user_id);

-- ── read receipts ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS comms.read_receipts (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    message_id       uuid NOT NULL REFERENCES comms.messages(id) ON DELETE CASCADE,
    user_id          uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    read_at          timestamptz NOT NULL DEFAULT now(),

    -- One receipt per person per message. Re-opening a message is not a second
    -- reading, and ON CONFLICT DO NOTHING against this is what makes marking
    -- read idempotent under a retry.
    CONSTRAINT uq_receipt UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_receipts_tenant ON comms.read_receipts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_receipts_user   ON comms.read_receipts (user_id, message_id);

-- ── a message cannot be edited or unsent ────────────────────────────────────
--
-- ⚠️ FIRES ON UPDATE *AND* DELETE. A rule enforced on one statement is defeated
-- by the other — recorded twice in this repository (QC 030, variations 032).
-- The grants below withhold both as well: this trigger is the second line of
-- defence, not the only one.

CREATE OR REPLACE FUNCTION comms.reject_message_rewrite()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'a sent message cannot be edited or deleted. Send a correction to the '
        'same thread — the conversation is the record.'
        USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_message_immutable ON comms.messages;
CREATE TRIGGER trg_message_immutable
    BEFORE UPDATE OR DELETE ON comms.messages
    FOR EACH ROW EXECUTE FUNCTION comms.reject_message_rewrite();

-- ── keep `last_message_at` honest ───────────────────────────────────────────
--
-- In a trigger rather than in the service, so a thread's ordering cannot drift
-- when a second caller inserts a message some other way.

CREATE OR REPLACE FUNCTION comms.touch_thread()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE comms.threads
       SET last_message_at = NEW.sent_at
     WHERE id = NEW.thread_id
       AND last_message_at < NEW.sent_at;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_thread ON comms.messages;
CREATE TRIGGER trg_touch_thread
    AFTER INSERT ON comms.messages
    FOR EACH ROW EXECUTE FUNCTION comms.touch_thread();

-- ── row-level security ──────────────────────────────────────────────────────

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'comms.threads', 'comms.participants', 'comms.messages', 'comms.read_receipts'
    ] LOOP
        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %s FORCE  ROW LEVEL SECURITY', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_select', t);
        EXECUTE format(
            'CREATE POLICY %I ON %s FOR SELECT USING '
            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
            'AND organization_id = identity.current_organization_id()))',
            'org_select', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_insert', t);
        EXECUTE format(
            'CREATE POLICY %I ON %s FOR INSERT WITH CHECK '
            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
            'AND organization_id = identity.current_organization_id()))',
            'org_insert', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_update', t);
        EXECUTE format(
            'CREATE POLICY %I ON %s FOR UPDATE USING '
            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
            'AND organization_id = identity.current_organization_id())) '
            'WITH CHECK '
            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
            'AND organization_id = identity.current_organization_id()))',
            'org_update', t);
    END LOOP;
END $$;

-- ── grants ──────────────────────────────────────────────────────────────────
--
-- ⚠️ THE REVOKES ARE NOT REDUNDANT — 006's ALTER DEFAULT PRIVILEGES grants
-- UPDATE and DELETE on every new table in these schemas.
--
-- `messages` gets INSERT and SELECT only: a conversation that can be rewritten
-- afterwards is not a record of what was said.

GRANT SELECT, INSERT, UPDATE ON comms.threads       TO autoworkshop_app;
GRANT SELECT, INSERT, DELETE ON comms.participants  TO autoworkshop_app;
GRANT SELECT, INSERT         ON comms.messages      TO autoworkshop_app;
GRANT SELECT, INSERT         ON comms.read_receipts TO autoworkshop_app;

REVOKE UPDATE, DELETE ON comms.messages      FROM autoworkshop_app;
REVOKE UPDATE, DELETE ON comms.read_receipts FROM autoworkshop_app;
REVOKE DELETE          ON comms.threads      FROM autoworkshop_app;

COMMIT;
