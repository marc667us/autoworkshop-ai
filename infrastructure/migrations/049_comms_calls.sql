-- 049 — in-app voice, video and consultations
--
-- ══════════════════════════════════════════════════════════════════════════
-- SLICE 11 of docs/00-project/COMPLETION_PLAN.md
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── WHAT THIS IS FOR ───────────────────────────────────────────────────────
--
-- Owner, 2026-08-06: "i need the in app communications phone video and text".
-- Text shipped in slice 7 (`comms.threads` / `messages`). This slice adds VOICE
-- and VIDEO **inside the product** — not a link out to somebody else's meeting
-- room — and the record of what was decided on the call, against the job card.
--
-- ── 🔴 THE MISTAKE THIS SCHEMA EXISTS BECAUSE I CORRECTED ──────────────────
--
-- The first pass concluded WebRTC could not ship, because coturn needs host
-- networking with a UDP relay range (3478 + 49160-49200) and Render's free tier
-- serves HTTP only. That reasoning treated three separate things as one:
--
--   1. SIGNALLING — swapping SDP offers/answers and ICE candidates. This is a
--      handful of small messages between two peers over a few seconds. It needs
--      A MESSAGE CHANNEL, not a media server, and this platform already has
--      one: its own API and Postgres. That is what `comms.call_signals` is.
--   2. STUN — "what is my public address?". Stateless, free, no account, and it
--      never sees a byte of media or signalling content.
--   3. TURN — RELAYING media when a direct peer-to-peer path cannot be found.
--      This is the only piece that needs a UDP relay, and it is a FALLBACK.
--
-- Direct peer-to-peer succeeds for the large majority of real-world NATs. So
-- voice and video ship now, media flows browser-to-browser — which is more
-- private than routing a customer's repair conversation through a third party —
-- and no new Render service is required.
--
-- ⚠️ THE LIMITATION IS REAL AND IS DETECTED, NOT HIDDEN. Behind symmetric NAT
-- or a restrictive corporate firewall the peers cannot find a path. The client
-- watches `iceConnectionState` and reports `connection_failed` as a call event,
-- so the screen SAYS the media could not connect instead of spinning for ever.
-- That is the difference between a limitation and a defect.
--
-- ⚠️ AND `phone` / `in_person` REMAIN. A workshop that rings a customer on a
-- mobile still wants the outcome against the job card, and D7 requires the app
-- to work fully with nothing configured.

BEGIN;

CREATE TABLE IF NOT EXISTS comms.calls (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    -- The conversation this call belongs to, when there is one. A call is a
    -- thread that happened out loud; a call-only inbox would split one
    -- conversation across two screens.
    thread_id        uuid REFERENCES comms.threads(id) ON DELETE SET NULL,
    job_card_id      uuid REFERENCES repair.job_cards(id) ON DELETE SET NULL,

    call_kind        TEXT NOT NULL CHECK (call_kind IN (
                        'customer', 'technician', 'supplier', 'specialist_consultation')),

    -- 🔴 `voice` AND `video` ARE IN-APP WEBRTC. `phone` means somebody picked up
    -- a handset and is logging it afterwards. Naming the in-app ones `phone`
    -- would have made the log unable to answer "did we actually use the
    -- product?" — and a name that blurs that is the "name that reads as a
    -- policy statement" defect recorded here before.
    medium           TEXT NOT NULL CHECK (medium IN (
                        'voice', 'video', 'phone', 'in_person')),

    subject          TEXT NOT NULL CHECK (length(btrim(subject)) > 0),

    status           TEXT NOT NULL DEFAULT 'scheduled'
                     CHECK (status IN ('scheduled', 'ringing', 'in_progress', 'completed',
                                       'no_answer', 'failed', 'cancelled')),

    scheduled_for    timestamptz,
    started_at       timestamptz,
    ended_at         timestamptz,

    -- What came of it. The whole reason to log a call.
    outcome          TEXT,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_call_times CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at),

    -- 🔴 A COMPLETED CALL MUST SAY WHAT HAPPENED. Same rule as slice 9's
    -- resolved support case: one marked done with no outcome looks finished and
    -- nobody can tell whether it was useful.
    CONSTRAINT ck_completed_has_outcome CHECK (
        status <> 'completed'
        OR (outcome IS NOT NULL AND length(btrim(outcome)) > 0 AND started_at IS NOT NULL)
    ),

    -- A scheduled call needs a time, or it can never come round — the same
    -- "reminder that can never fire" refusal slice 9 makes about maintenance.
    CONSTRAINT ck_scheduled_has_a_time CHECK (
        status <> 'scheduled' OR scheduled_for IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_call_tenant ON comms.calls (tenant_id);
CREATE INDEX IF NOT EXISTS idx_call_org    ON comms.calls (organization_id, status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_call_thread ON comms.calls (thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_job    ON comms.calls (job_card_id) WHERE job_card_id IS NOT NULL;

-- ── who is on the call ──────────────────────────────────────────────────────
--
-- ⚠️ THE ACCESS RULE, exactly as `comms.participants` is for threads. A call is
-- joinable and its log readable because you are ON it, never because of your
-- role — a technician must not be able to join every customer's private
-- consultation.

CREATE TABLE IF NOT EXISTS comms.call_participants (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
    call_id          uuid NOT NULL REFERENCES comms.calls(id) ON DELETE CASCADE,

    user_id          uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    party_kind       TEXT NOT NULL CHECK (party_kind IN ('workshop', 'customer', 'supplier', 'specialist')),

    -- Set when this person's browser actually attached to the media session,
    -- which is a different fact from being invited.
    joined_at        timestamptz,
    left_at          timestamptz,

    added_by         uuid,
    added_at         timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_call_participant UNIQUE (call_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_callpart_tenant ON comms.call_participants (tenant_id);
CREATE INDEX IF NOT EXISTS idx_callpart_user   ON comms.call_participants (user_id, call_id);

-- ── the signalling channel ──────────────────────────────────────────────────
--
-- 🔴 THIS TABLE *IS* THE SIGNALLING SERVER. That is the whole insight behind
-- shipping WebRTC on this hosting tier.
--
-- Signalling is not a media path. It is a few small messages — one SDP offer,
-- one answer, a handful of ICE candidates — exchanged over a few seconds while
-- the peers work out how to reach each other. Once they have, the media flows
-- BROWSER TO BROWSER and never touches this platform at all.
--
-- So the channel can be the API we already have. Each peer writes signals
-- addressed to the other and polls for its own, ordered by `seq`.
--
-- ⚠️ `seq` IS AN IDENTITY COLUMN, NOT A TIMESTAMP. Two candidates written in
-- the same millisecond must still have a defined order, and a client that polls
-- "everything after seq N" cannot miss one the way a timestamp cursor can.
--
-- ⚠️ APPEND-ONLY. A rewritten ICE candidate is a media path nobody can explain
-- afterwards, and the negotiation is the thing you most need to read when a
-- call fails to connect.
--
-- ⚠️ `payload` IS OPAQUE SDP/ICE. It carries network addresses, so it is
-- private to the two parties — enforced by the participant check in the service
-- and by the organisation policy below. It carries no audio and no video.

CREATE TABLE IF NOT EXISTS comms.call_signals (
    seq              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
    call_id          uuid NOT NULL REFERENCES comms.calls(id) ON DELETE CASCADE,

    from_user_id     uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    -- NULL means "to everyone else on this call". A two-party call names the
    -- other peer; leaving it open lets a third participant be added later
    -- without a schema change.
    to_user_id       uuid REFERENCES identity.users(id) ON DELETE CASCADE,

    signal_kind      TEXT NOT NULL CHECK (signal_kind IN ('offer', 'answer', 'ice', 'bye')),
    payload          jsonb NOT NULL,

    created_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_signal_payload_object CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_signal_tenant ON comms.call_signals (tenant_id);
-- The hot read: "everything on this call for me, after seq N".
CREATE INDEX IF NOT EXISTS idx_signal_poll   ON comms.call_signals (call_id, seq);

-- ── the call's own history ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS comms.call_events (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
    call_id          uuid NOT NULL REFERENCES comms.calls(id) ON DELETE CASCADE,

    -- 🔴 `connection_failed` IS A FIRST-CLASS EVENT. When the peers cannot find
    -- a path — symmetric NAT, a locked-down firewall — that is a fact about the
    -- call and must be recorded, not swallowed into a spinner. It is also the
    -- measurement that would justify a TURN relay later, which is the honest
    -- way to make that case rather than assuming it up front.
    event_kind       TEXT NOT NULL CHECK (event_kind IN (
                        'scheduled', 'ringing', 'joined', 'connected', 'left',
                        'ended', 'no_answer', 'connection_failed', 'cancelled',
                        'rescheduled')),
    note             TEXT,

    recorded_by      uuid,
    occurred_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_callevent_tenant ON comms.call_events (tenant_id);
CREATE INDEX IF NOT EXISTS idx_callevent_call   ON comms.call_events (call_id, occurred_at);

-- A recorded event cannot be rewritten or removed.
--
-- ⚠️ FIRES ON UPDATE *AND* DELETE — a rule enforced on one statement is
-- defeated by the other, recorded twice here (QC 030, variations 032).

CREATE OR REPLACE FUNCTION comms.reject_call_event_rewrite()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'a call event is a record of what happened and cannot be edited or '
        'deleted. Record a further event instead.'
        USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_call_event_immutable ON comms.call_events;
CREATE TRIGGER trg_call_event_immutable
    BEFORE UPDATE OR DELETE ON comms.call_events
    FOR EACH ROW EXECUTE FUNCTION comms.reject_call_event_rewrite();

-- The same rule for signals: a negotiation you cannot replay is one you cannot
-- debug, and a rewritten candidate is a media path nobody can account for.
DROP TRIGGER IF EXISTS trg_call_signal_immutable ON comms.call_signals;
CREATE TRIGGER trg_call_signal_immutable
    BEFORE UPDATE OR DELETE ON comms.call_signals
    FOR EACH ROW EXECUTE FUNCTION comms.reject_call_event_rewrite();

-- ── row-level security ──────────────────────────────────────────────────────

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'comms.calls', 'comms.call_participants', 'comms.call_signals', 'comms.call_events'
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
-- `call_signals` gets INSERT and SELECT only. A negotiation is a record.

GRANT SELECT, INSERT, UPDATE ON comms.calls             TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE ON comms.call_participants TO autoworkshop_app;
GRANT SELECT, INSERT         ON comms.call_signals      TO autoworkshop_app;
GRANT SELECT, INSERT         ON comms.call_events       TO autoworkshop_app;

REVOKE DELETE         ON comms.calls             FROM autoworkshop_app;
REVOKE DELETE         ON comms.call_participants FROM autoworkshop_app;
REVOKE UPDATE, DELETE ON comms.call_signals      FROM autoworkshop_app;
REVOKE UPDATE, DELETE ON comms.call_events       FROM autoworkshop_app;

COMMIT;
