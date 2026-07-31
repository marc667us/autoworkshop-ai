-- 021_public_catalogue.sql
--
-- THE PUBLIC SURFACE. Everything in this repository up to migration 020 is
-- tenant-owned and unreadable without a validated Keycloak claim. This is the
-- first schema that is deliberately readable by somebody with no account at
-- all: the parts marketplace a vehicle owner browses before they sign up, and
-- the mechanic directory they search to find a workshop.
--
-- Pattern taken from Solar's `marketplace_public` (ADR-011 permits reading
-- Solar for patterns and forbids importing from it): free to browse, cards
-- grouped by category, search across name/brand/model, sign-up prompt in the
-- hero rather than a wall in front of the content.
--
-- ⚠️ WHY `catalogue.mechanic_directory` DUPLICATES FIELDS THAT ALREADY EXIST IN
-- `core.organization_profile`, WHICH IS NOT AN OVERSIGHT.
-- The obvious implementation is a public endpoint that reads
-- `core.organization_profile` where some `is_listed` flag is true. That would
-- require the public read path to get past that table's tenant RLS policy —
-- i.e. it would require punching a hole in the isolation boundary that
-- Severity-1 (CLAUDE.md §5) exists to defend, and every future reader of that
-- policy would have to re-derive why the hole is safe.
--
-- Publication is therefore an explicit ACT that copies consented fields into a
-- public table, not a predicate that exempts rows from isolation. A workshop
-- publishes its trading name, town and phone number; its legal name, tax
-- identification number, customer book and job cards remain unreachable by the
-- same mechanism that protects every other tenant. If this table is wrong, a
-- workshop's public listing is wrong. If the alternative were wrong, the
-- customer book leaks.
--
-- ⚠️ CONSTRAINT ORDERING. A foreign key can only cite a unique constraint that
-- ALREADY EXISTS at the point the FK is declared. Writing a migration top-down
-- puts the ALTER after the CREATE and fails with "there is no unique constraint
-- matching given keys for referenced table" — hit three times in this repo
-- (014, 016, 020). Each ALTER below sits ABOVE the table that references it.

BEGIN;

CREATE SCHEMA IF NOT EXISTS catalogue;
GRANT USAGE ON SCHEMA catalogue TO autoworkshop_app;

-- ---------------------------------------------------------------------------
-- Suppliers — the "different suppliers" whose parts appear side by side.
-- ---------------------------------------------------------------------------
-- NOT `identity.organizations`. A supplier here is a catalogue entity: it has
-- no tenant, no users, no job cards, and it exists whether or not it ever signs
-- up. Modelling it as an organization would give every parts distributor a
-- tenant row and a membership surface it has no use for.
CREATE TABLE catalogue.suppliers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL,
  name          TEXT NOT NULL,
  country       TEXT NOT NULL,
  city          TEXT,
  website       TEXT,
  -- Says whether anybody checked that this supplier is real. Displayed on the
  -- card, because "verified" is the whole reason a stranger trusts a price.
  is_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  -- The publication switch. RLS below makes this the ONLY thing standing
  -- between a draft row and the open internet, so it is NOT NULL with a
  -- default of FALSE: a row created without thinking about it is invisible.
  is_published  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_supplier_slug UNIQUE (slug),
  CONSTRAINT ck_supplier_slug_shape CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

-- ---------------------------------------------------------------------------
-- Part categories — the chips and the card grouping.
-- ---------------------------------------------------------------------------
CREATE TABLE catalogue.part_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL,
  name          TEXT NOT NULL,
  -- Sort key, because alphabetical order puts "Air Filters" above "Brakes" and
  -- a driver looking for brakes should not have to scroll past filters.
  display_order INTEGER NOT NULL DEFAULT 100,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_part_category_slug UNIQUE (slug)
);

-- ---------------------------------------------------------------------------
-- Parts.
-- ---------------------------------------------------------------------------
CREATE TABLE catalogue.parts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id    UUID NOT NULL REFERENCES catalogue.suppliers(id) ON DELETE CASCADE,
  category_id    UUID NOT NULL REFERENCES catalogue.part_categories(id),
  part_number    TEXT NOT NULL,
  name           TEXT NOT NULL,
  brand          TEXT,
  description    TEXT,
  -- TEXT, never VARCHAR(n), on anything free-text (CLAUDE.md schema rules —
  -- Solar's truncation incident came from narrow VARCHARs).
  price          NUMERIC(14, 2),
  currency       TEXT NOT NULL DEFAULT 'GBP',
  in_stock       BOOLEAN NOT NULL DEFAULT TRUE,
  is_published   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Two suppliers may legitimately stock the same part number; one supplier
  -- may not list it twice.
  CONSTRAINT uq_part_per_supplier UNIQUE (supplier_id, part_number),
  -- A published price must be a real price. A NULL price is allowed (some
  -- parts are quote-only) but a negative one is a data error, and a zero one
  -- reads as "free" on the card.
  CONSTRAINT ck_part_price_positive CHECK (price IS NULL OR price > 0),
  CONSTRAINT ck_part_currency_shape CHECK (currency ~ '^[A-Z]{3}$')
);

-- ---------------------------------------------------------------------------
-- Fitment — "searchable by car model and year".
-- ---------------------------------------------------------------------------
-- ⚠️ THE YEAR RANGE IS THE POINT OF THIS TABLE, and it is why fitment is not
-- three columns on `parts`. A brake disc fits a Focus 2011-2018 AND a C-Max
-- 2010-2019; a part has MANY fitments and a fitment covers MANY years. Storing
-- `model` + `year` on the part would force one row per model per year.
--
-- `year_to` is NULLABLE and means "still current" — an open-ended range. Every
-- query below must therefore treat NULL as +infinity rather than as a missing
-- value, which is what `year_to IS NULL OR year_to >= $n` does.
CREATE TABLE catalogue.part_fitments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id    UUID NOT NULL REFERENCES catalogue.parts(id) ON DELETE CASCADE,
  make       TEXT NOT NULL,
  model      TEXT NOT NULL,
  year_from  SMALLINT NOT NULL,
  year_to    SMALLINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- An inverted range silently matches nothing, which looks like "no parts
  -- available" rather than like a data error. Refuse it at write time.
  CONSTRAINT ck_fitment_year_order CHECK (year_to IS NULL OR year_to >= year_from),
  CONSTRAINT ck_fitment_year_sane  CHECK (year_from BETWEEN 1900 AND 2100),
  CONSTRAINT uq_fitment UNIQUE (part_id, make, model, year_from)
);

-- ---------------------------------------------------------------------------
-- Mechanic directory — searchable free, usable only when signed in.
-- ---------------------------------------------------------------------------
-- See the header note: consented fields only, published deliberately.
CREATE TABLE catalogue.mechanic_directory (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Points AT the tenant that published it so the listing can be withdrawn and
  -- audited, but carries no tenant predicate itself — this table is public by
  -- construction and its RLS is a publication check, not an isolation check.
  organization_id   UUID NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
  trading_name      TEXT NOT NULL,
  city              TEXT NOT NULL,
  country           TEXT NOT NULL,
  -- Deliberately NOT the tenant's full address. A town is enough to choose a
  -- workshop; the street address is what you get after you have an account.
  public_phone      TEXT,
  services          TEXT[] NOT NULL DEFAULT '{}',
  specialisms       TEXT[] NOT NULL DEFAULT '{}',
  is_published      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_directory_org UNIQUE (organization_id)
);

-- ---------------------------------------------------------------------------
-- Indexes.
-- ---------------------------------------------------------------------------
-- Every public query filters on `is_published` first, so it leads each index —
-- an unpublished row should never be scanned, not merely never returned.
CREATE INDEX idx_parts_published        ON catalogue.parts (is_published, category_id);
CREATE INDEX idx_parts_supplier         ON catalogue.parts (supplier_id);
CREATE INDEX idx_fitment_lookup         ON catalogue.part_fitments (lower(make), lower(model), year_from);
CREATE INDEX idx_fitment_part           ON catalogue.part_fitments (part_id);
CREATE INDEX idx_directory_published    ON catalogue.mechanic_directory (is_published, lower(city));
-- Free-text search across the three fields the search box claims to cover.
-- A trigram index would serve `ILIKE %x%` better, but pg_trgm is an extension
-- this database does not install and CLAUDE.md §1 forbids adding dependencies
-- casually; the catalogue is small enough that this is a measurement to redo
-- when it stops being small, not a guess to optimise now.
CREATE INDEX idx_parts_name_search      ON catalogue.parts (lower(name));

-- ---------------------------------------------------------------------------
-- RLS.
-- ---------------------------------------------------------------------------
-- ⚠️ RLS ON A PUBLIC TABLE IS NOT CEREMONY. `is_published` is the only thing
-- separating a half-written listing from the open internet. Enforcing it in the
-- service layer alone means one forgotten `WHERE` in one query leaks every
-- draft row; enforcing it here means the database refuses regardless of what
-- the query says. Same argument as tenant isolation, different predicate.
--
-- FORCE as well as ENABLE: ENABLE alone exempts the table OWNER, and in this
-- deployment the owner is a role that migrations run as — so a policy without
-- FORCE is one `psql` session away from being decorative.
ALTER TABLE catalogue.suppliers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogue.suppliers          FORCE  ROW LEVEL SECURITY;
ALTER TABLE catalogue.part_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogue.part_categories    FORCE  ROW LEVEL SECURITY;
ALTER TABLE catalogue.parts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogue.parts              FORCE  ROW LEVEL SECURITY;
ALTER TABLE catalogue.part_fitments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogue.part_fitments      FORCE  ROW LEVEL SECURITY;
ALTER TABLE catalogue.mechanic_directory ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogue.mechanic_directory FORCE  ROW LEVEL SECURITY;

-- Anybody may read PUBLISHED rows. No tenant context required, and that is the
-- deliberate difference from every other policy in this repository.
CREATE POLICY public_read ON catalogue.suppliers
  FOR SELECT USING (is_published);
CREATE POLICY public_read ON catalogue.parts
  FOR SELECT USING (is_published);
CREATE POLICY public_read ON catalogue.mechanic_directory
  FOR SELECT USING (is_published);

-- Categories are labels, not content — publishing them individually would mean
-- a category chip could exist with no readable name. They are readable always.
CREATE POLICY public_read ON catalogue.part_categories
  FOR SELECT USING (TRUE);

-- A fitment is readable exactly when ITS PART is. Written as a subquery rather
-- than a copied `is_published` column so the two can never disagree — a
-- denormalised flag here would be a second place to forget to unpublish.
CREATE POLICY public_read ON catalogue.part_fitments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM catalogue.parts p WHERE p.id = part_id AND p.is_published)
  );

-- Writes are platform-admin only, via the same `app.current_role` convention
-- the rest of the repo seeds with. Note this is FOR ALL, so an admin also
-- SELECTs unpublished drafts — permissive policies OR together.
CREATE POLICY admin_write ON catalogue.suppliers
  FOR ALL USING (identity.current_role_name() = 'admin')
  WITH CHECK (identity.current_role_name() = 'admin');
CREATE POLICY admin_write ON catalogue.part_categories
  FOR ALL USING (identity.current_role_name() = 'admin')
  WITH CHECK (identity.current_role_name() = 'admin');
CREATE POLICY admin_write ON catalogue.parts
  FOR ALL USING (identity.current_role_name() = 'admin')
  WITH CHECK (identity.current_role_name() = 'admin');
CREATE POLICY admin_write ON catalogue.part_fitments
  FOR ALL USING (identity.current_role_name() = 'admin')
  WITH CHECK (identity.current_role_name() = 'admin');
CREATE POLICY admin_write ON catalogue.mechanic_directory
  FOR ALL USING (identity.current_role_name() = 'admin')
  WITH CHECK (identity.current_role_name() = 'admin');

-- ---------------------------------------------------------------------------
-- Grants.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON catalogue.suppliers          TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON catalogue.part_categories    TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON catalogue.parts              TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON catalogue.part_fitments      TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON catalogue.mechanic_directory TO autoworkshop_app;

COMMIT;
