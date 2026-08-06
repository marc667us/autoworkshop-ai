-- 057 — slice 16: the last four technician routes that CAN be built
--
-- ══════════════════════════════════════════════════════════════════════════
-- `/learning/{assessments,audio-guides,technical-videos}` and
-- `/technical-tools/diagnostic-trees`. Each was signposted because the thing
-- behind it genuinely did not exist. This builds the things.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── 🔴 THE LEARNING DECISION, MADE EXPLICITLY ─────────────────────────────
--
-- There were two readings and they lead to very different products:
--
--   A. the platform HOSTS training media — needs object storage per course, an
--      upload path, a player, transcoding, and a licence position on content it
--      did not create. That is a module.
--   B. the platform RECORDS training that happens elsewhere — the workshop
--      already has its videos on a drive, its audio guides from a supplier, its
--      assessments from a trade body. It needs a LINK, a kind, and who has
--      completed what.
--
-- **B is what this builds**, and the reasons are not just size:
--   · ADR-012 forbids paid dependencies, and hosting media at any scale is the
--     clearest example of a cost that arrives later and cannot be undone.
--   · `learning.courses` already exists as a REGISTER — provider, duration,
--     whether it grants a certification. It was ALREADY modelling "training
--     that happened elsewhere". A hosts everything it implies; B finishes what
--     the schema already started.
--   · A workshop can use B on day one with the material it already has.
--
-- ⚠️ THE SCREENS MUST SAY THIS. A "technical videos" page that lists links is
-- honest; one that implies the platform holds the video is not.
--
-- ── 🔴 A DIAGNOSTIC TREE IS NOT A PROCEDURE ────────────────────────────────
--
-- `knowledge.procedures` is a LINEAR step list: do this, then this. A
-- diagnostic tree BRANCHES — "is there voltage at the connector?" yes goes one
-- way, no goes another. Mounting the procedures library under this name would
-- have renamed a thing rather than built one, which is why it stayed a signpost
-- until now.
--
-- Modelled as nodes with a parent and an ANSWER that leads to them. Adjacency
-- list rather than nested sets: a tree here is tens of nodes, edited by hand,
-- and the cost of nested sets is paid on every edit for a read speed nobody
-- needs.

BEGIN;

-- ── learning materials ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS learning.course_materials (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    course_id        uuid REFERENCES learning.courses(id) ON DELETE CASCADE,

    -- WHICH of the three technician routes this belongs on. A material with no
    -- kind could not be shown on any of them, which is why it is NOT NULL.
    material_kind    TEXT NOT NULL
                     CHECK (material_kind IN ('video', 'audio', 'assessment', 'document')),

    title            TEXT NOT NULL CHECK (length(btrim(title)) > 0),
    description      TEXT,

    -- 🔴 A LINK, NOT A FILE. See the header: this platform records training, it
    -- does not host it. `https`-only because a training link that downgrades to
    -- http is a link the workshop's own browser will block anyway.
    external_url     TEXT CHECK (external_url IS NULL OR external_url ~* '^https://'),

    duration_minutes integer CHECK (duration_minutes IS NULL OR duration_minutes > 0),
    is_active        boolean NOT NULL DEFAULT true,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    -- ⚠️ AN ASSESSMENT NEEDS NO LINK; A VIDEO OR AUDIO GUIDE IS NOTHING
    -- WITHOUT ONE. A row promising a video and carrying no way to watch it is
    -- the empty player this migration exists to avoid.
    CONSTRAINT ck_material_playable CHECK (
        material_kind NOT IN ('video', 'audio')
        OR (external_url IS NOT NULL AND length(btrim(external_url)) > 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_material_org_kind
    ON learning.course_materials (organization_id, material_kind, is_active);
CREATE INDEX IF NOT EXISTS idx_material_tenant ON learning.course_materials (tenant_id);

-- ── who has completed what ─────────────────────────────────────────────────
--
-- This is what makes `/learning/assessments` a real screen rather than a list:
-- a technician wants to know what they still owe, and a manager wants to know
-- who has done it.

CREATE TABLE IF NOT EXISTS learning.completions (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    material_id      uuid NOT NULL REFERENCES learning.course_materials(id) ON DELETE CASCADE,
    user_id          uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,

    completed_on     date NOT NULL DEFAULT CURRENT_DATE,
    -- Nullable: a video has no score, an assessment does.
    score_percent    integer CHECK (score_percent IS NULL
                                    OR (score_percent >= 0 AND score_percent <= 100)),
    note             TEXT,

    recorded_by      uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),

    -- One completion per person per material. A retake UPDATES the score rather
    -- than adding a second row, because "have they done it?" must have one
    -- answer.
    CONSTRAINT uq_completion UNIQUE (material_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_completion_org_user
    ON learning.completions (organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_completion_tenant ON learning.completions (tenant_id);

-- ── diagnostic trees ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS knowledge.diagnostic_trees (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    title            TEXT NOT NULL CHECK (length(btrim(title)) > 0),
    -- Free text, same as `knowledge.procedures.applies_to`: "Toyota Hilux 2015
    -- onwards" is more use than a structured field nobody fills in.
    applies_to       TEXT,
    fault_code       TEXT,

    is_published     boolean NOT NULL DEFAULT false,
    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge.diagnostic_tree_nodes (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    tree_id          uuid NOT NULL REFERENCES knowledge.diagnostic_trees(id) ON DELETE CASCADE,

    -- 🔴 THE BRANCH. `parent_id IS NULL` is the root; `answer` is the reply that
    -- LEADS HERE from the parent. That is what makes this a tree and not the
    -- linear step list `knowledge.procedures` already holds.
    parent_id        uuid REFERENCES knowledge.diagnostic_tree_nodes(id) ON DELETE CASCADE,
    answer           TEXT,

    -- A node either ASKS something or STATES an outcome. Both would be
    -- ambiguous to render and to follow.
    node_kind        TEXT NOT NULL CHECK (node_kind IN ('question', 'outcome')),
    text             TEXT NOT NULL CHECK (length(btrim(text)) > 0),
    position         integer NOT NULL DEFAULT 0,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),

    -- The root has no answer leading to it; every other node must say which
    -- reply gets you there, or the tree cannot be walked.
    CONSTRAINT ck_node_answer CHECK (
        (parent_id IS NULL AND answer IS NULL)
        OR (parent_id IS NOT NULL AND answer IS NOT NULL AND length(btrim(answer)) > 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_node_tree ON knowledge.diagnostic_tree_nodes (tree_id, parent_id, position);
CREATE INDEX IF NOT EXISTS idx_node_tenant ON knowledge.diagnostic_tree_nodes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tree_org ON knowledge.diagnostic_trees (organization_id, is_published);

-- ⚠️ ONE ROOT PER TREE. Two roots is not a tree, and the walker would silently
-- pick whichever came back first.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tree_single_root
    ON knowledge.diagnostic_tree_nodes (tree_id) WHERE parent_id IS NULL;

-- ── row-level security: BOTH predicates, per command, from the start ───────

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'learning.course_materials', 'learning.completions',
        'knowledge.diagnostic_trees', 'knowledge.diagnostic_tree_nodes'
    ] LOOP
        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %s FORCE  ROW LEVEL SECURITY', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_select', t);
        EXECUTE format(
            'CREATE POLICY %I ON %s FOR SELECT USING '
            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
            'AND organization_id = identity.current_organization_id()))', 'org_select', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_insert', t);
        EXECUTE format(
            'CREATE POLICY %I ON %s FOR INSERT WITH CHECK '
            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
            'AND organization_id = identity.current_organization_id()))', 'org_insert', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_update', t);
        EXECUTE format(
            'CREATE POLICY %I ON %s FOR UPDATE USING '
            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
            'AND organization_id = identity.current_organization_id())) WITH CHECK '
            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
            'AND organization_id = identity.current_organization_id()))', 'org_update', t);

        EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %s TO autoworkshop_app', t);
    END LOOP;
END $$;

COMMIT;
