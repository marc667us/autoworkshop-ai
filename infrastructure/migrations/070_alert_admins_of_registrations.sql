-- 070 — every platform administrator is told when a business registers
--
-- ══════════════════════════════════════════════════════════════════════════
-- Owner, 2026-08-09: *"when [a new] workshop or supplier [registers] the ADMIN
-- IS ALERTED to verify and approve and update the registries."*
--
-- 069 built the queue. This is the alert: a self-registration writes one
-- in-app notification per platform administrator, and it does so INSIDE THE
-- REGISTRATION'S OWN TRANSACTION.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── ⚠️ WHY A TRIGGER AND NOT A SERVICE CALL ───────────────────────────────
--
-- The obvious shape is "the controller registers, then the controller
-- notifies". It was rejected on this repository's own evidence:
--
--   · `MembershipRepository` reaches these functions through
--     `queryWithoutTenant`, which is a SINGLE statement on a pooled connection
--     — i.e. autocommit. Two calls are TWO TRANSACTIONS. A crash between them
--     leaves a registered business that no administrator is ever asked to
--     verify, and nothing anywhere would report it. That is the same shape as
--     the row lock that "protected" work in another process on 2026-08-07.
--   · Migration 060's rule, already load-bearing here, is that a notification
--     is written in the business transaction and DELIVERED separately. A
--     trigger on the queue table inherits that for free: it fires inside the
--     inserting transaction, so the alert and the registration commit together
--     or not at all.
--
-- ⚠️ AND IT AVOIDS RE-EMITTING THE TWO REGISTRATION FUNCTION BODIES A THIRD
-- TIME. `CREATE OR REPLACE` requires the whole body; 069 already restated both
-- in full. A third copy is a third thing to keep in step, and the copy that
-- silently falls behind is how a function stops meaning what its migration
-- says.
--
-- ── ⚠️ THE ADMINS ARE FOUND BY ROLE, AND THE FUNCTION IS SECURITY DEFINER ──
--
-- `identity.memberships` is under FORCE RLS, and the registration transaction
-- has no tenant context at all — the registrant does not belong anywhere yet
-- (that is what is being fixed). An INVOKER-rights trigger would therefore read
-- ZERO administrators and write ZERO alerts, silently, on every sign-up.
--
-- 🔴 SO THIS MUST BE REHEARSED AS `autoworkshop_app`, NOT AS THE LOCAL OWNER.
-- The local owner is a superuser and bypasses RLS, so a local test of a definer
-- path proves nothing about Render, where the owner is NOT a superuser and
-- FORCE RLS binds it. That is a recorded scar in this repository, and the
-- rehearsal for this migration runs under the application role for that reason.
--
-- ── ⚠️ THE NOTIFICATION IS ADDRESSED TO THE ADMIN AND SCOPED TO THE NEW ORG ─
--
-- `comms.notifications` carries the tenant/organisation of the SUBJECT — the
-- business being registered — while `recipient_id` is the administrator. That
-- is correct and readable: 060's `notification_select` admits a row when
-- `recipient_id = identity.current_user_id()` OR `identity.is_platform_admin()`,
-- so an administrator reads it regardless of whose tenant it belongs to, and
-- the row still says what it is ABOUT. Scoping it to the admin's own
-- organisation instead would lose that.
--
-- ⚠️ A FAILED ALERT MUST NOT LOSE A REGISTRATION — but it also must not pass
-- silently. `comms.notify_user` already returns 0 rather than raising for an
-- inactive recipient, and its dedupe key makes a retried sign-up a no-op. What
-- is NOT swallowed is a genuine error: this trigger does not wrap anything in
-- an exception block, so a broken notification path aborts the sign-up loudly
-- instead of producing businesses nobody is told about. Given the alternative
-- is an invisible verification backlog, failing loudly is the right trade.

BEGIN;

CREATE OR REPLACE FUNCTION identity.alert_admins_of_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
-- Explicit, because the body names objects in three schemas. An empty
-- search_path (060's choice) would need every one of them qualified anyway;
-- naming them here keeps the body readable and is equally safe — nothing below
-- is resolved from a caller-controlled path.
SET search_path = identity, comms, pg_catalog, pg_temp
AS $$
DECLARE
    v_admin   RECORD;
    v_org     TEXT;
    v_kind    TEXT;
    v_written integer := 0;
BEGIN
    -- Only a fresh submission is worth an alert. A decision is an admin's own
    -- action and they do not need telling about it.
    IF NEW.status <> 'pending' THEN
        RETURN NEW;
    END IF;

    SELECT o.name INTO v_org
      FROM identity.organizations o
     WHERE o.id = NEW.organization_id;

    v_kind := CASE NEW.kind WHEN 'supplier' THEN 'parts supplier' ELSE 'workshop' END;

    -- Every ACTIVE platform administrator. DISTINCT because one person may hold
    -- the role in more than one organisation, and telling them twice about one
    -- registration is how an alert becomes noise.
    FOR v_admin IN
        SELECT DISTINCT m.user_id
          FROM identity.memberships m
         WHERE m.role_name = 'platform_administrator'
           AND m.status = 'active'
    LOOP
        v_written := v_written + comms.notify_user(
            NEW.tenant_id,
            NEW.organization_id,
            v_admin.user_id,
            'organization.registered',
            format('Verify a new %s: %s', v_kind, COALESCE(v_org, 'unnamed')),
            format(
                '%s registered as a %s and is waiting to be verified. '
                'It is NOT listed publicly yet — approving it is what publishes it '
                'to the %s. Open Registrations to check the business and decide.',
                COALESCE(v_org, 'An organisation'),
                v_kind,
                CASE NEW.kind WHEN 'supplier' THEN 'parts marketplace' ELSE 'mechanic directory' END
            ),
            'organization_registration',
            NEW.id,
            -- 🔴 THE DEDUPE KEY CARRIES THE REGISTRATION *AND* THE RECIPIENT.
            -- Without the recipient, the second administrator's notification
            -- would collide with the first's and only one person would ever be
            -- told. `comms.notify_user` appends the resource id to this prefix,
            -- so the recipient is the part that has to be added here.
            format('organization.registered:%s', v_admin.user_id)
        );
    END LOOP;

    -- ⚠️ ZERO ADMINISTRATORS IS NOT AN ERROR, AND IS WORTH SAYING OUT LOUD.
    -- A deployment can legitimately have none yet — the very first one is
    -- created by a seed. Raising here would make the platform's first
    -- registration impossible. A NOTICE lands in the server log, where the
    -- absence is visible without being fatal.
    IF v_written = 0 THEN
        RAISE NOTICE
            'registration % queued but NO platform administrator was alerted '
            '(none active, or none reachable by email). It is in the queue and '
            'will be found by anyone who opens it.', NEW.id;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION identity.alert_admins_of_registration() IS
'Writes one in-app notification per active platform administrator when a '
'workshop or parts supplier registers itself. SECURITY DEFINER because the '
'registering transaction has no tenant context, so an invoker-rights read of '
'identity.memberships under FORCE RLS would find zero administrators and '
'silently alert nobody.';

REVOKE ALL ON FUNCTION identity.alert_admins_of_registration() FROM PUBLIC;

-- AFTER INSERT: the registration row must exist before anything is said about
-- it, and `NEW.id` is referenced as the notification's resource.
DROP TRIGGER IF EXISTS trg_alert_admins_of_registration
    ON identity.organization_registrations;
CREATE TRIGGER trg_alert_admins_of_registration
    AFTER INSERT ON identity.organization_registrations
    FOR EACH ROW EXECUTE FUNCTION identity.alert_admins_of_registration();

-- ── PROVE THE TRIGGER IS ATTACHED AND PRIVILEGED CORRECTLY ─────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgname = 'trg_alert_admins_of_registration'
           AND tgrelid = 'identity.organization_registrations'::regclass
           AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'the alert trigger is not attached. Nothing has been applied.';
    END IF;

    -- 🔴 INVOKER RIGHTS HERE WOULD ALERT NOBODY, SILENTLY, FOR EVER. It is the
    -- single most consequential property of this migration and the one that
    -- would never surface as an error.
    IF NOT (SELECT p.prosecdef FROM pg_proc p
             WHERE p.oid = 'identity.alert_admins_of_registration()'::regprocedure) THEN
        RAISE EXCEPTION
            'alert_admins_of_registration is not SECURITY DEFINER — under FORCE RLS '
            'with no tenant context it would find zero administrators and write zero '
            'alerts without error. Nothing has been applied.';
    END IF;
END $$;

COMMIT;
