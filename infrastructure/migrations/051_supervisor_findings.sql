-- 051 — the two schema-level findings from the Supervisor pass
--
-- ══════════════════════════════════════════════════════════════════════════
-- The service-layer findings (settings/knowledge read gates, thread and call
-- participant validation, and the two features that had never worked) are
-- fixed in code. These two are the database's share.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── 🔴 FINDING A — THE CREDENTIAL GUARD WAS A NAME BLACKLIST WITH HOLES ────
--
-- Migration 045 refuses a credential in `core.integrations.config` by matching
-- key names against `(secret|password|passwd|token|api_?key|private_?key|
-- credential|auth)`, and its own comment called that "ENFORCED, not asked for"
-- and "proven by INJECTION in verify/045".
--
-- Both halves were over-confident. `api_?key` requires the literal `api`, so
-- every one of these passed straight through:
--
--     key   access_key   accessKey   passphrase   account_sid
--     signature   pin   sk_live   client_secret is caught, but secret_key is
--     caught only by `secret` — while `signing_key` was not
--
-- Those are the exact names an SMS gateway, a payment merchant and an
-- S3-compatible store hand out. And only TOP-LEVEL keys were examined; nothing
-- walked a nested object.
--
-- 🔴 INVERTED TO AN ALLOW-LIST. A blacklist of credential names is a race
-- against every provider's naming choices, and the provider always wins. What a
-- workshop legitimately needs to store here is a short, knowable set — a label,
-- a sender id, a region, an endpoint, an account reference. Anything else is
-- refused by default, which is the direction a security control should fail in.
--
-- ⚠️ AND IT WALKS NESTED OBJECTS, because the zod schema that currently blocks
-- nesting is one edit away from not doing so, and this is the layer that must
-- hold when it changes.

BEGIN;

CREATE OR REPLACE FUNCTION core.reject_secret_in_config()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    k text;
    v jsonb;
    allowed CONSTANT text[] := ARRAY[
        'accountlabel', 'account_label', 'accountreference', 'account_reference',
        'senderid', 'sender_id', 'region', 'endpoint', 'baseurl', 'base_url',
        'merchantid', 'merchant_id', 'currency', 'environment', 'timezone',
        'fromaddress', 'from_address', 'fromname', 'from_name', 'devicelabel',
        'device_label', 'bucket', 'notes'
    ];
BEGIN
    -- 🔴 ALLOW-LIST, NOT BLACKLIST. Anything not named here is refused, so a
    -- provider inventing `signing_key` tomorrow is refused today.
    FOR k, v IN SELECT * FROM jsonb_each(NEW.config) LOOP
        IF NOT (lower(k) = ANY (allowed)) THEN
            RAISE EXCEPTION
                'core.integrations.config accepts only non-secret connection '
                'settings (key % is not one). Credentials are never stored here — '
                'put the secret in the platform secret store and record its name '
                'in secret_ref.', k
                USING ERRCODE = 'check_violation';
        END IF;

        -- ⚠️ A NESTED OBJECT OR ARRAY IS REFUSED OUTRIGHT rather than walked.
        -- Walking it would mean allow-listing every possible nested shape; a
        -- flat record of settings is all this column is for, and refusing the
        -- rest is both simpler and stricter.
        IF jsonb_typeof(v) IN ('object', 'array') THEN
            RAISE EXCEPTION
                'core.integrations.config holds flat settings only (key % is a '
                'nested value). Nesting is refused because it cannot be checked '
                'for credentials as reliably as a flat key can.', k
                USING ERRCODE = 'check_violation';
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$;

-- ── 🔴 FINDING B — DELETE WAS GRANTED WHERE NO DELETE POLICY EXISTS ────────
--
-- Under FORCE ROW LEVEL SECURITY a command with no matching policy matches ZERO
-- ROWS. It does not raise. So `core.vehicle_documents`, `core.maintenance_
-- schedules` (047) and `comms.participants` (046) each hold a `GRANT ... DELETE`
-- while their policy loops created SELECT, INSERT and UPDATE only.
--
-- This fails CLOSED, so it is not a hole — but it is the exact shape of the
-- "silently matched zero rows" defect that cost a session on 2026-08-06: a
-- future "remove this document" or "remove this participant" control would
-- report success and do nothing, and the test for it would pass locally as
-- superuser.
--
-- Two ways to resolve it honestly: add the policy, or withdraw the grant. The
-- grant is withdrawn where nothing deletes today (documents and schedules are
-- the customer's record and should be corrected, not erased) and the policy is
-- added for `comms.participants`, where leaving a conversation is a real thing
-- a person will need to do.

DROP POLICY IF EXISTS org_delete ON comms.participants;
CREATE POLICY org_delete ON comms.participants FOR DELETE USING
  (identity.is_platform_admin()
   OR (tenant_id = identity.current_tenant_id()
       AND organization_id = identity.current_organization_id()));

-- A document or a scheduled service is the customer's own record. Correcting
-- one is an UPDATE; erasing it loses why a reminder once fired.
REVOKE DELETE ON core.vehicle_documents     FROM autoworkshop_app;
REVOKE DELETE ON core.maintenance_schedules FROM autoworkshop_app;

COMMIT;
