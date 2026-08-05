-- 048 — knowledge, technical tools and learning
--
-- ══════════════════════════════════════════════════════════════════════════
-- SLICE 10 of docs/00-project/COMPLETION_PLAN.md
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── 🔴 THE LIBRARY IS BUILT; THE CORPUS ACCUMULATES ────────────────────────
--
-- `CLAUDE.md` §4 stages exactly two things: LICENSED CONTENT (OEM wiring
-- diagrams, vehicle-specific 3D geometry) and labelled ML corpora. Everything
-- else gets built structurally — the owner rejected all scope cuts.
--
-- The distinction matters here more than anywhere, because it would be very
-- easy to read "licensed content is staged" as "the knowledge module is
-- staged". It is not. What is staged is somebody else's copyrighted diagram —
-- not the shelf it would sit on, not the fault-code index, not the workshop's
-- own procedures, and not the record of who is certified to do what.
--
-- So `knowledge.diagrams` EXISTS and carries a `source` column with a
-- `licensed_pending` value. A workshop can file its own diagrams today; the OEM
-- set arrives when there is a licence. The table is not a placeholder.
--
-- ── ⚠️ ARTICLES ARE THE WORKSHOP'S OWN, AND ORGANISATION-SCOPED ────────────
--
-- A procedure written by one workshop is that workshop's intellectual property
-- and its liability. Sharing it platform-wide by default would publish a
-- garage's own method to its competitors, which nobody consented to. `is_shared`
-- exists for the day a workshop chooses otherwise; today every read is scoped.
--
-- ── ⚠️ FAULT CODES ARE THE ONE GENUINELY GLOBAL THING HERE ─────────────────
--
-- P0300 means the same thing in every workshop on earth — it is a published
-- standard, not anybody's property. So `knowledge.fault_codes` carries NO
-- tenant, and its RLS is a read-for-everyone policy. Scoping it per workshop
-- would have meant 500 workshops each typing in the same standard table.

BEGIN;

CREATE SCHEMA IF NOT EXISTS knowledge;
CREATE SCHEMA IF NOT EXISTS learning;
GRANT USAGE ON SCHEMA knowledge TO autoworkshop_app;
GRANT USAGE ON SCHEMA learning  TO autoworkshop_app;

-- ── fault codes: global, standard, not anybody's property ───────────────────

CREATE TABLE IF NOT EXISTS knowledge.fault_codes (
    code             TEXT PRIMARY KEY CHECK (code ~ '^[A-Z][0-9A-Z]{4}$'),
    system           TEXT NOT NULL CHECK (system IN (
                        'powertrain', 'chassis', 'body', 'network', 'undefined')),
    title            TEXT NOT NULL CHECK (length(btrim(title)) > 0),
    description      TEXT,
    common_causes    TEXT,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_faultcode_system ON knowledge.fault_codes (system);

-- ── articles: the workshop's own knowledge base ─────────────────────────────

CREATE TABLE IF NOT EXISTS knowledge.articles (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    title            TEXT NOT NULL CHECK (length(btrim(title)) > 0),
    -- TEXT, never VARCHAR(n) — CLAUDE.md's schema rules. Solar's truncation
    -- incident came from narrow VARCHARs meeting generated content.
    body             TEXT NOT NULL CHECK (length(btrim(body)) > 0),

    category         TEXT NOT NULL DEFAULT 'general'
                     CHECK (category IN ('general', 'diagnostic', 'repair', 'safety',
                                         'equipment', 'customer_service')),
    -- Optional links to what the article is ABOUT, so a fault code page can
    -- show what this workshop has learned about it.
    fault_code       TEXT REFERENCES knowledge.fault_codes(code) ON DELETE SET NULL,

    -- See the header: a workshop's own method is its own until it says
    -- otherwise. Nothing reads this yet; it exists so the default is recorded
    -- as a decision rather than as an absence.
    is_shared        boolean NOT NULL DEFAULT false,
    is_published     boolean NOT NULL DEFAULT true,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_article_tenant ON knowledge.articles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_article_org    ON knowledge.articles (organization_id, category);
CREATE INDEX IF NOT EXISTS idx_article_code   ON knowledge.articles (fault_code)
    WHERE fault_code IS NOT NULL;

-- ── repair procedures ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS knowledge.procedures (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    title            TEXT NOT NULL CHECK (length(btrim(title)) > 0),
    -- What system it applies to, in the workshop's own words. Not a FK to a
    -- vehicle: a procedure that only applies to one car in one garage is a
    -- note, not a procedure.
    applies_to       TEXT,
    steps            TEXT NOT NULL CHECK (length(btrim(steps)) > 0),

    estimated_minutes integer CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),

    -- 🔴 SAFETY IS ITS OWN FIELD, NOT A PARAGRAPH INSIDE `steps`. A warning
    -- buried in step nine is a warning read after step eight.
    safety_notes     TEXT,
    -- The certification a technician must hold. Nullable; nothing enforces it
    -- yet, and `is_enforced` is reported as false on the screen for the same
    -- reason approval limits are.
    requires_certification TEXT,

    is_active        boolean NOT NULL DEFAULT true,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_procedure_tenant ON knowledge.procedures (tenant_id);
CREATE INDEX IF NOT EXISTS idx_procedure_org    ON knowledge.procedures (organization_id, is_active);

-- ── diagrams ────────────────────────────────────────────────────────────────
--
-- 🔴 `source` IS THE STAGING BOUNDARY, MADE EXPLICIT IN THE SCHEMA.
--
-- `own` — the workshop drew or photographed it. Fully supported today.
-- `licensed_pending` — an OEM diagram this workshop has NOT licensed. The row
--   may exist as a placeholder so a procedure can reference what it needs, and
--   `asset_id` MUST be null: filing an unlicensed OEM diagram is the thing
--   CLAUDE.md §4 stages, and a nullable column with no constraint would let it
--   happen by accident.
-- `licensed` — licensed and held.

CREATE TABLE IF NOT EXISTS knowledge.diagrams (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    title            TEXT NOT NULL CHECK (length(btrim(title)) > 0),
    diagram_kind     TEXT NOT NULL DEFAULT 'wiring'
                     CHECK (diagram_kind IN ('wiring', 'hydraulic', 'exploded_view',
                                             'routing', 'other')),
    applies_to       TEXT,

    source           TEXT NOT NULL DEFAULT 'own'
                     CHECK (source IN ('own', 'licensed', 'licensed_pending')),
    licence_note     TEXT,

    asset_id         uuid REFERENCES media.assets(id) ON DELETE SET NULL,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    -- The staging rule, enforced rather than documented. A pending row is a
    -- note that a diagram is WANTED; it may not carry the file.
    CONSTRAINT ck_pending_holds_no_file CHECK (
        source <> 'licensed_pending' OR asset_id IS NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_diagram_tenant ON knowledge.diagrams (tenant_id);
CREATE INDEX IF NOT EXISTS idx_diagram_org    ON knowledge.diagrams (organization_id, diagram_kind);

-- ── learning: courses and certifications ────────────────────────────────────

CREATE TABLE IF NOT EXISTS learning.courses (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    title            TEXT NOT NULL CHECK (length(btrim(title)) > 0),
    description      TEXT,
    provider         TEXT,
    duration_minutes integer CHECK (duration_minutes IS NULL OR duration_minutes > 0),

    -- What holding this course grants. Free text rather than a vocabulary:
    -- certification names are the industry's, not this platform's.
    grants_certification TEXT,

    is_active        boolean NOT NULL DEFAULT true,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_tenant ON learning.courses (tenant_id);
CREATE INDEX IF NOT EXISTS idx_course_org    ON learning.courses (organization_id, is_active);

CREATE TABLE IF NOT EXISTS learning.certifications (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    user_id          uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    course_id        uuid REFERENCES learning.courses(id) ON DELETE SET NULL,

    name             TEXT NOT NULL CHECK (length(btrim(name)) > 0),
    awarded_on       date NOT NULL,
    -- NULL means it does not expire, which is not the same as expired. The same
    -- distinction slice 9 makes about vehicle documents, and for the same
    -- reason: a reminder must never fire on something with no expiry.
    expires_on       date,
    reference        TEXT,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    -- A certification cannot expire before it was awarded.
    CONSTRAINT ck_cert_dates CHECK (expires_on IS NULL OR expires_on >= awarded_on)
);

CREATE INDEX IF NOT EXISTS idx_cert_tenant ON learning.certifications (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cert_user   ON learning.certifications (organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_cert_expiry ON learning.certifications (organization_id, expires_on)
    WHERE expires_on IS NOT NULL;

-- ── 🔴 THE SEED RUNS BEFORE RLS IS FORCED, AND THAT ORDER IS LOAD-BEARING ──
--
-- This block used to sit at the END of the file, after
-- `ALTER TABLE knowledge.fault_codes FORCE ROW LEVEL SECURITY` and after a
-- policy that grants SELECT and nothing else. Under FORCE RLS an INSERT with no
-- INSERT policy is REFUSED — including for the table's owner, which is what
-- FORCE means.
--
-- It passed locally anyway, because the local `autoworkshop` role is
-- `superuser=true bypassrls=true` and no policy applied to it at all. On Render
-- that role is NOT a superuser, and the live rehearsal failed with
--
--     ERROR:  new row violates row-level security policy for table "fault_codes"
--
-- This is the exact defect class `rehearse-migration.yml` was built for after
-- 036-039 cost three sessions, and it is the first time it has caught one
-- before the migration reached production rather than after.
--
-- ⚠️ DO NOT MOVE THIS BELOW THE RLS BLOCK. Seeding reference data is a write,
-- and this table deliberately has no INSERT policy because the application must
-- never write to it.

-- ── seed the standard fault codes ───────────────────────────────────────────
--
-- ⚠️ A SMALL, HONEST SET. These are the generic OBD-II codes every scanner
-- reports — public standard, no licence. The full manufacturer-specific set is
-- tens of thousands of codes and is exactly the licensed content §4 stages;
-- seeding a plausible-looking subset and calling the index complete would be
-- the "disconnected mock page" failure in data form. The screen says how many
-- codes are held so nobody mistakes this for the whole standard.

INSERT INTO knowledge.fault_codes (code, system, title, description, common_causes) VALUES
  ('P0300', 'powertrain', 'Random/multiple cylinder misfire detected',
   'The engine control module has detected misfires across more than one cylinder.',
   'Worn spark plugs; failing coils; vacuum leak; low fuel pressure; timing.'),
  ('P0301', 'powertrain', 'Cylinder 1 misfire detected',
   'Misfire isolated to cylinder 1.', 'Spark plug; coil; injector; compression.'),
  ('P0171', 'powertrain', 'System too lean (bank 1)',
   'The mixture on bank 1 is leaner than the ECM can correct for.',
   'Vacuum leak; dirty MAF; weak fuel pump; leaking intake gasket.'),
  ('P0420', 'powertrain', 'Catalyst system efficiency below threshold (bank 1)',
   'The catalytic converter is not converting as expected.',
   'Failing catalytic converter; faulty downstream oxygen sensor; exhaust leak.'),
  ('P0128', 'powertrain', 'Coolant thermostat below regulating temperature',
   'The engine is not reaching operating temperature in the expected time.',
   'Thermostat stuck open; faulty coolant temperature sensor.'),
  ('P0442', 'powertrain', 'Evaporative emission system small leak detected',
   'A small leak in the EVAP system.', 'Loose or failed fuel cap; cracked hose; purge valve.'),
  ('C0035', 'chassis', 'Left front wheel speed sensor circuit',
   'The ABS module cannot read the left front wheel speed sensor.',
   'Damaged sensor; wiring; contaminated reluctor ring.'),
  ('B1318', 'body', 'Battery voltage low',
   'System voltage below the threshold body modules require.',
   'Failing battery; charging system fault; parasitic drain.'),
  ('U0100', 'network', 'Lost communication with ECM/PCM',
   'A module has lost communication with the engine control module on the bus.',
   'CAN bus wiring; failed module; poor ground; low battery voltage.')
ON CONFLICT (code) DO NOTHING;

-- ── row-level security ──────────────────────────────────────────────────────

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'knowledge.articles', 'knowledge.procedures', 'knowledge.diagrams',
        'learning.courses', 'learning.certifications'
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

-- 🔴 FAULT CODES CARRY NO TENANT AND ARE READABLE BY EVERYONE. P0300 means the
-- same thing in every workshop on earth; it is a published standard, not
-- anybody's property. RLS is still ENABLED and FORCED so that WRITES are
-- refused to the application role entirely (see the grants) — the table is
-- reference data, maintained by migration, not by a workshop.
ALTER TABLE knowledge.fault_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.fault_codes FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS everyone_reads ON knowledge.fault_codes;
CREATE POLICY everyone_reads ON knowledge.fault_codes FOR SELECT USING (true);

-- ── grants ──────────────────────────────────────────────────────────────────
--
-- ⚠️ THE REVOKES ARE NOT REDUNDANT — 006's ALTER DEFAULT PRIVILEGES grants
-- UPDATE and DELETE on every new table in these schemas.

GRANT SELECT                 ON knowledge.fault_codes    TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE ON knowledge.articles       TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE ON knowledge.procedures     TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE ON knowledge.diagrams       TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE ON learning.courses         TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE ON learning.certifications  TO autoworkshop_app;

-- Reference data: the application reads it and may never change it.
REVOKE INSERT, UPDATE, DELETE ON knowledge.fault_codes FROM autoworkshop_app;

-- Retired, never deleted: a procedure that was followed on a past job, and a
-- certification that authorised past work, must both remain readable.
REVOKE DELETE ON knowledge.articles      FROM autoworkshop_app;
REVOKE DELETE ON knowledge.procedures    FROM autoworkshop_app;
REVOKE DELETE ON knowledge.diagrams      FROM autoworkshop_app;
REVOKE DELETE ON learning.courses        FROM autoworkshop_app;
REVOKE DELETE ON learning.certifications FROM autoworkshop_app;

COMMIT;
