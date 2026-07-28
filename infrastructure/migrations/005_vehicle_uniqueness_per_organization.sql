-- ============================================================================
-- Migration 005 — vehicle uniqueness follows the READ scope
--
-- Closes the Supervisor security finding on Phase 4 slice 1: a cross-
-- ORGANIZATION existence oracle.
--
-- ── THE DEFECT ──────────────────────────────────────────────────────────────
--
-- Migration 004 made registration number and VIN unique per TENANT:
--     UNIQUE (tenant_id, upper(registration_number))
--
-- The services then read per ORGANIZATION (`v.organization_id = $2`), because
-- `01 (1).txt` §19 makes these records organizational. Those two scopes
-- disagreed, and a unique constraint is observable through the error it raises.
--
-- So a caller in organization A submitting a plate that exists in organization B
-- OF THE SAME TENANT received `409 already exists` for a row they may not read.
-- The status code alone discloses it: 409 means "org B has this vehicle", 201
-- means it does not. Iterating a plate or VIN list enumerates another
-- organization's vehicle register.
--
-- This is precisely the oracle class this codebase already guards against on
-- purpose — `findById` answers 404 rather than 403 so that a status code cannot
-- confirm a record exists. The constraint quietly reintroduced it one layer down.
--
-- ── THE FIX ─────────────────────────────────────────────────────────────────
--
-- Make the constraint scope MATCH the read scope. A collision can then only be
-- raised against a row the caller is already entitled to see, so the 409 tells
-- them nothing they could not have learned by listing.
--
-- SAFE ON EXISTING DATA, and that is provable rather than hopeful: an
-- organization is contained in exactly one tenant, so tenant-uniqueness IMPLIES
-- organization-uniqueness. Every row that satisfied the old constraint satisfies
-- the new one. The change strictly relaxes what the database rejects, so no
-- existing row can violate it and no backfill is required.
--
-- WHAT IS DELIBERATELY GIVEN UP: two organizations inside one tenant may now
-- each hold a row for the same physical car. That was already true ACROSS
-- tenants by design — 004 documents it — and it is the correct model here for
-- the same reason: each organization keeps its own customer book and its own
-- service history, and one may not see the other's.
-- ============================================================================

BEGIN;

-- Created before the old ones are dropped, so the table is never briefly
-- unconstrained. Both are plain (non-CONCURRENT) index builds inside the
-- transaction, which is correct for tables this size and keeps the migration
-- atomic — CREATE INDEX CONCURRENTLY cannot run in a transaction block.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicles_org_registration
    ON core.vehicles (organization_id, upper(registration_number));

CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicles_org_vin
    ON core.vehicles (organization_id, upper(vin)) WHERE vin IS NOT NULL;

DROP INDEX IF EXISTS core.uq_vehicles_tenant_registration;
DROP INDEX IF EXISTS core.uq_vehicles_tenant_vin;

COMMIT;
