-- ============================================================================
-- Migration 018 — the workshop's business identity, for documents it issues
-- (Phase 5, slice 6)
--
-- A repair proposal is not an internal screen. It is a COMMERCIAL DOCUMENT that
-- leaves the building: a customer reads it, decides on it, and may later rely on
-- it in a dispute. `1.txt` §424 makes an approved one immutable precisely because
-- it has that standing.
--
-- ⚠️ NOTHING IN THE SCHEMA COULD ADDRESS SUCH A DOCUMENT. Checked, not assumed:
-- `identity.organizations` holds a `name`, an `org_type` and a `status` — it is
-- the PLATFORM'S tenancy record, not a business letterhead. There is no address,
-- no telephone number, no tax registration. A proposal rendered from it would be
-- a page of prices with no idea who is offering them, which is not a document
-- anybody can act on and would not be accepted as one.
--
-- ── WHY A SEPARATE TABLE AND NOT COLUMNS ON `organizations` ────────────────
--
-- `identity.organizations` answers "who is this tenant on the platform". This
-- answers "what does this business call itself in writing, and where does the
-- post go". They change for different reasons and are read by different code —
-- and putting a trading name behind identity's RLS would make a letterhead edit
-- an identity write. Same judgement 016 made about pricing.
--
-- ── EVERY FIELD IS OPTIONAL, AND THAT IS DELIBERATE ────────────────────────
--
-- ADR-015's bring-your-own-connection rule applied to paperwork: a workshop that
-- has configured nothing still gets a working document. The renderer falls back to
-- `organizations.name` and simply omits the lines it has nothing for, rather than
-- printing "null" or an empty letterhead block. A workshop should not be blocked
-- from quoting because it has not yet typed its VAT number.
--
-- The one thing NOT modelled here is a logo: that needs media storage and an
-- upload path, and MinIO is running but nothing writes to it yet. Named rather
-- than silently dropped (CLAUDE.md §4).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS core.organization_profile (
    organization_id  uuid PRIMARY KEY REFERENCES identity.organizations(id) ON DELETE CASCADE,
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,

    -- What the business is called ON PAPER. Two names, because they differ often
    -- and a document needs both: the legal entity is who the contract is with, the
    -- trading name is who the customer thinks they are dealing with.
    legal_name       TEXT,
    trading_name     TEXT,

    -- The address as free TEXT with newlines rather than street/city/postcode
    -- columns. Deliberate: address formats differ by country, this platform is
    -- being built for Ghana first and must not assume a UK or US shape, and every
    -- consumer of this field renders it verbatim. Structured address parsing is a
    -- problem nobody here needs solved.
    address          TEXT,
    city             TEXT,
    country          TEXT,

    phone            TEXT,
    email            TEXT,
    website          TEXT,

    -- Ghana: the TIN, and the VAT registration where the business is registered.
    -- A quotation showing a tax line and no registration number is a document a
    -- customer's accountant will query.
    tax_identification_number TEXT,
    vat_registration_number   TEXT,

    -- Standing wording printed at the foot of every document — bank details,
    -- terms of business, a registered-office line.
    document_footer  TEXT,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT fk_profile_org_scope
        FOREIGN KEY (organization_id, tenant_id)
        REFERENCES identity.organizations (id, tenant_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_org_profile_tenant
    ON core.organization_profile (tenant_id);

-- ── row-level security ──────────────────────────────────────────────────────
-- ENABLE *and* FORCE. Enable alone exempts the table owner, which is the role the
-- app connects as — isolation present and inert.

ALTER TABLE core.organization_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.organization_profile FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON core.organization_profile;
CREATE POLICY tenant_isolation ON core.organization_profile
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

-- DELETE withheld: a business identity is superseded by an edit, never removed —
-- and a document already issued must still be explicable.
GRANT SELECT, INSERT, UPDATE ON core.organization_profile TO autoworkshop_app;
REVOKE DELETE ON core.organization_profile FROM autoworkshop_app;

COMMIT;
