import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ORG_TYPES } from './organization.schemas';

/**
 * A DRIFT CHECK, not a restatement.
 *
 * `ORG_TYPES` exists so a bad `orgType` is refused as a 400 naming the field,
 * rather than reaching Postgres and returning a 500 that names a constraint.
 * That only holds while the two lists agree. Asserting the array against a
 * hand-copied literal would prove nothing — it would drift with the same edit
 * that broke it — so this READS THE MIGRATION and compares.
 */
describe('ORG_TYPES', () => {
  it('matches the CHECK constraint in 001_tenancy_foundation.sql', () => {
    const sql = readFileSync(
      join(__dirname, '../../../../infrastructure/migrations/001_tenancy_foundation.sql'),
      'utf8',
    );

    const match = /org_type\s+TEXT\s+NOT NULL\s*CHECK \(org_type IN \(([^)]*)\)\)/s.exec(sql);
    expect(match, 'could not find the org_type CHECK constraint in the migration').toBeTruthy();

    const fromMigration = [...(match?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

    // Guards the regex itself: if it silently matched nothing, an empty list
    // would compare equal to an empty list and this test would pass while
    // checking nothing.
    expect(fromMigration.length).toBeGreaterThan(5);
    expect([...fromMigration].sort()).toEqual([...ORG_TYPES].sort());
  });
});
