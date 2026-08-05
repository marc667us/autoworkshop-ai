-- 040 — media.assets and media.links: the evidence a repair actually carries
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHY THIS TABLE EXISTS AT ALL
-- ══════════════════════════════════════════════════════════════════════════
--
-- `repair.execution_evidence.storage_key` has been present and DELIBERATELY
-- UNUSED since migration 019, whose own comment says so: MinIO was running and
-- no upload path existed, so a column claiming to hold a file would have been a
-- lie. `StorageService` then landed the presigned-PUT half. This migration is
-- the missing third: the record of what was uploaded, by whom, and what it is
-- attached to.
--
-- ── ⚠️ WHY A SEPARATE TABLE AND NOT MORE COLUMNS ON execution_evidence ─────
--
-- Because the same photograph is needed by things that are not a repair
-- execution. `COMPLETION_PLAN.md` slice 2 attaches photos to a VEHICLE INTAKE
-- (the dent that was already there when the car arrived — the single most
-- disputed fact in a workshop), and slice 7 attaches files to a MESSAGE. Adding
-- `intake_id` and `message_id` columns to `execution_evidence` would make a
-- repair record pretend to be an intake record.
--
-- So: `media.assets` is the FILE — one row per object in MinIO, and it knows
-- nothing about repairs. `media.links` is what the file is ATTACHED TO, and one
-- asset may be attached to several things (an intake photo that later becomes
-- evidence in the repair is the same photograph, not a second upload).
--
-- ── ⚠️ THE ASSET IS NOT VALID UNTIL THE UPLOAD IS CONFIRMED ────────────────
--
-- A presigned URL is minted BEFORE the browser uploads, and the browser may
-- close the tab, lose signal, or simply not bother. If a row were treated as a
-- file the moment the URL was minted, every gallery in the product would show
-- broken images and nobody could tell a failed upload from a deleted one.
--
-- So an asset starts `pending` and only a confirmed upload moves it to `stored`.
-- Readers filter on `stored`. `pending` rows older than the signature lifetime
-- are garbage, and are safe to sweep precisely because they never had a file.
--
-- ── ⚠️ APPEND-ONLY ON THE STORAGE KEY, AND WHY THAT IS THE SEVERE ONE ──────
--
-- CLAUDE.md makes approvals, payments, warranty decisions and audit events
-- append-only. Evidence is not on that list but belongs to the same family: a
-- photograph of a dent is the record of a dispute. `storage_key` is therefore
-- immutable after insert — re-pointing an asset at a different object would let
-- somebody swap the photograph while every reference to it stayed valid, which
-- is worse than deleting it because nothing would look different.
--
-- Status may still advance (pending -> stored -> quarantined), because that is
-- the upload's own lifecycle rather than a rewrite of what was uploaded.
--
-- ── ⚠️ THE VIRUS SCAN IS A STATUS, NOT A PROMISE ──────────────────────────
--
-- `scan_status` starts `skipped`, because there is no scanner in the compose
-- file and ADR-012 forbids paying for one. A column that said `clean` when
-- nothing had scanned it would be the "comment claiming a guard that does not
-- exist" defect this repository has now recorded three times. `skipped` is the
-- truth, and it is what the UI must show.

BEGIN;

CREATE SCHEMA IF NOT EXISTS media;
GRANT USAGE ON SCHEMA media TO autoworkshop_app;

-- ── the file ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS media.assets (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    -- The object in MinIO. TEXT, never VARCHAR(n): the key is composed from
    -- tenant + organisation + owner + uuid and a narrow column is how Solar's
    -- truncation incident started.
    storage_key      TEXT NOT NULL CHECK (length(btrim(storage_key)) > 0),

    -- ⚠️ THE ORIGINAL FILENAME IS DATA, NOT A PATH. `StorageService.evidenceKey`
    -- deliberately does not use it, because a caller-supplied name may contain
    -- `../`, a null byte, or 4KB of unicode. It is kept so a person can
    -- recognise their own file, and it is rendered as text.
    original_name    TEXT,
    content_type     TEXT NOT NULL CHECK (length(btrim(content_type)) > 0),
    byte_size        bigint CHECK (byte_size IS NULL OR byte_size >= 0),

    status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'stored', 'quarantined')),

    -- Honest by default. See the header.
    scan_status      TEXT NOT NULL DEFAULT 'skipped'
                     CHECK (scan_status IN ('skipped', 'pending', 'clean', 'infected')),

    uploaded_by      uuid REFERENCES identity.users(id) ON DELETE SET NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    confirmed_at     timestamptz,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    -- A confirmed upload must say when. Without this the two facts can disagree
    -- and no reader can tell which one to believe.
    CONSTRAINT chk_asset_confirmed_has_time
        CHECK ((status = 'stored') = (confirmed_at IS NOT NULL)),

    -- One row per object. A retry that re-mints a URL for the same key must
    -- update the existing row, not create a second one that shadows it.
    CONSTRAINT uq_asset_key UNIQUE (tenant_id, storage_key)
);

-- `media.links.fk_link_asset_scope` references (id, tenant_id), and Postgres
-- requires a UNIQUE constraint matching a composite reference — the primary key
-- on `id` alone does not satisfy it. Declared HERE, before the referencing
-- table, because a constraint added afterwards is too late for the FK.
ALTER TABLE media.assets DROP CONSTRAINT IF EXISTS uq_asset_id_tenant;
ALTER TABLE media.assets ADD CONSTRAINT uq_asset_id_tenant UNIQUE (id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_media_assets_tenant
    ON media.assets (tenant_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_tenant_status
    ON media.assets (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_media_assets_tenant_created
    ON media.assets (tenant_id, created_at DESC);

-- ── what the file is attached to ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS media.links (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    asset_id         uuid NOT NULL,

    -- ⚠️ A STRING, NOT A FOREIGN KEY PER OWNER TYPE, and that is a real
    -- trade-off rather than laziness. The owner's rule is RELATIONSHIPS in
    -- schemas, and a polymorphic column cannot carry a FK.
    --
    -- What is bought: one attachment mechanism that slices 2 and 7 can use
    -- without a migration each. What is given up: the database cannot prove the
    -- target row exists. That is mitigated where it matters — `owner_id` is
    -- resolved by the SERVICE against the owning table under the caller's own
    -- permissions before a link is written, so a link to a job card in another
    -- organisation cannot be created through the API at all. The CHECK below
    -- keeps the vocabulary closed so a typo cannot invent a new owner type.
    owner_type       TEXT NOT NULL CHECK (owner_type IN (
        'job_card', 'execution', 'execution_task', 'vehicle_intake',
        'quality_inspection', 'message')),
    owner_id         uuid NOT NULL,

    caption          TEXT,
    position         integer NOT NULL DEFAULT 0,

    created_by       uuid REFERENCES identity.users(id) ON DELETE SET NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT fk_link_asset_scope
        FOREIGN KEY (asset_id, tenant_id) REFERENCES media.assets (id, tenant_id)
        ON DELETE CASCADE,

    -- The same photograph attached twice to the same thing is a double-click,
    -- not two pieces of evidence.
    CONSTRAINT uq_link_once UNIQUE (asset_id, owner_type, owner_id)
);

CREATE INDEX IF NOT EXISTS idx_media_links_owner
    ON media.links (tenant_id, owner_type, owner_id, position);
CREATE INDEX IF NOT EXISTS idx_media_links_tenant
    ON media.links (tenant_id);
CREATE INDEX IF NOT EXISTS idx_media_links_asset
    ON media.links (asset_id);

-- ── the storage key is immutable ────────────────────────────────────────────
--
-- ⚠️ THIS TRIGGER FIRES ON UPDATE ONLY, AND THAT IS CORRECT HERE — but the
-- question is worth asking of every trigger in this repository, because "a rule
-- enforced on UPDATE and nowhere else" has been the defect twice (QC 030,
-- variations 032). An INSERT cannot violate immutability: there is no prior
-- value to change. What an INSERT could do is assert a `stored` status for a
-- file nobody uploaded, and that is stopped by the CHECK constraint above plus
-- the service, which only ever inserts `pending`.

CREATE OR REPLACE FUNCTION media.reject_asset_rewrite()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.storage_key IS DISTINCT FROM OLD.storage_key THEN
        RAISE EXCEPTION
            'media.assets.storage_key is immutable (asset %): repointing an asset '
            'at a different object would swap the file while every reference to '
            'it stayed valid. Upload a new asset instead.', OLD.id
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
        RAISE EXCEPTION
            'media.assets ownership is immutable (asset %)', OLD.id
            USING ERRCODE = 'check_violation';
    END IF;

    -- A stored asset cannot go back to pending: that would make a real file
    -- invisible to every gallery while leaving the object in place.
    IF OLD.status = 'stored' AND NEW.status = 'pending' THEN
        RAISE EXCEPTION
            'media.assets (asset %) cannot return to pending once stored', OLD.id
            USING ERRCODE = 'check_violation';
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_asset_rewrite ON media.assets;
CREATE TRIGGER trg_asset_rewrite
    BEFORE UPDATE ON media.assets
    FOR EACH ROW
    EXECUTE FUNCTION media.reject_asset_rewrite();

-- ── row-level security ──────────────────────────────────────────────────────
--
-- ENABLE *and* FORCE. Enable alone exempts the table owner, which is the role
-- the app connects as — isolation present and inert. And FORCE is not optional
-- theatre here: 039 exists because the production owner is NOT a superuser
-- while the local one is, so a policy that looks inert locally binds live.
--
-- POLICIES ARE PER COMMAND, not one `FOR ALL` with a bare `USING`. Postgres
-- reuses `USING` as the `WITH CHECK` for INSERT, which is how a table ends up
-- rejecting its own legitimate first write.

ALTER TABLE media.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE media.assets FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assets_select ON media.assets;
CREATE POLICY assets_select ON media.assets FOR SELECT
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

DROP POLICY IF EXISTS assets_insert ON media.assets;
CREATE POLICY assets_insert ON media.assets FOR INSERT
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

DROP POLICY IF EXISTS assets_update ON media.assets;
CREATE POLICY assets_update ON media.assets FOR UPDATE
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

ALTER TABLE media.links ENABLE ROW LEVEL SECURITY;
ALTER TABLE media.links FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS links_select ON media.links;
CREATE POLICY links_select ON media.links FOR SELECT
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

DROP POLICY IF EXISTS links_insert ON media.links;
CREATE POLICY links_insert ON media.links FOR INSERT
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

DROP POLICY IF EXISTS links_delete ON media.links;
CREATE POLICY links_delete ON media.links FOR DELETE
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

-- ── grants ──────────────────────────────────────────────────────────────────
--
-- ⚠️ THE REVOKE IS NOT REDUNDANT. Migration 006's `ALTER DEFAULT PRIVILEGES`
-- already grants UPDATE/DELETE on new tables, so a table that merely omits
-- DELETE from its GRANT still HAS it. 008 learned that expensively — an
-- append-only table that silently was not.
--
-- NO DELETE ON assets. Detaching a photograph is `DELETE FROM media.links`,
-- which removes it from a repair while the file and the record of who uploaded
-- it survive. Destroying the object is an operator action, not an API one.

GRANT SELECT, INSERT, UPDATE ON media.assets TO autoworkshop_app;
REVOKE DELETE ON media.assets FROM autoworkshop_app;

GRANT SELECT, INSERT, DELETE ON media.links TO autoworkshop_app;
REVOKE UPDATE ON media.links FROM autoworkshop_app;

COMMIT;
