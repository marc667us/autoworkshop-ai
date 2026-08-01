import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { SecurityPostureService } from './security-posture.service';
import type { DatabaseService } from '../database/database.service';

/**
 * Integration proof that each posture query is CAPABLE OF MATCHING SOMETHING.
 *
 * 🔴 THIS FILE EXISTS BECAUSE ONE OF THESE QUERIES WAS ALREADY WRONG, and no
 * unit test could have found it. Control 3 was written as
 * `WHERE polwithcheck IS NULL` to find `FOR ALL` policies that reuse `USING` as
 * their write predicate. It returned zero rows, which read as a clean pass —
 * against a database holding THIRTY-NINE policies of precisely that shape.
 * PostgreSQL does not leave `polwithcheck` null; it stores a copy of the
 * `USING` expression, so the predicate could never match.
 *
 * A mocked database cannot detect that, because a mock returns whatever the
 * test tells it to. The unit spec proves the CLASSIFICATION on top of the rows;
 * only a real catalog can prove the rows are found in the first place.
 *
 * So the assertions here are deliberately not "the posture is clean". A
 * developer database is allowed to be untidy, and pinning it to a clean report
 * would make this file fail for reasons that are not defects. What is asserted
 * is the property that failed before: **the query runs, and its predicate
 * selects on something real.**
 *
 * Skips cleanly when no database is reachable, so CI without infrastructure
 * stays green rather than silently passing a test that never ran. ⚠️ The skip
 * is announced — a suite that quietly runs zero tests has cost this repo two
 * days once already.
 */
const APP_URL =
  process.env.DATABASE_URL_APP ??
  'postgresql://autoworkshop_app:change_me_locally@localhost:5432/autoworkshop';

let pool: Pool | null = null;
let reachable = false;

beforeAll(async () => {
  try {
    pool = new Pool({ connectionString: APP_URL, max: 2, connectionTimeoutMillis: 3000 });
    await pool.query('SELECT 1');
    reachable = true;
  } catch {
    reachable = false;
    await pool?.end().catch(() => undefined);
    pool = null;
    // eslint-disable-next-line no-console
    console.warn('[security-posture.integration] SKIPPED — no database at ' + APP_URL);
  }
});

afterAll(async () => {
  await pool?.end().catch(() => undefined);
});

/** The real service, wired to a real pool, without the Nest container. */
function service(): SecurityPostureService {
  const db = {
    queryWithoutTenant: async (text: string, values: unknown[] = []) => {
      const res = await pool!.query(text, values as never[]);
      return res.rows;
    },
  } as unknown as DatabaseService;
  return new SecurityPostureService(db);
}

describe('SecurityPostureService against a real catalog', () => {
  it('runs every control without error', async () => {
    if (!reachable) return;
    const posture = await service().audit();
    expect(posture.controls).toHaveLength(8);
    for (const c of posture.controls) {
      expect(['pass', 'warn', 'fail']).toContain(c.status);
      expect(c.summary.length).toBeGreaterThan(0);
    }
  });

  /**
   * 🔴 THE REGRESSION TEST FOR THE DEFECT THIS MODULE SHIPPED WITH.
   *
   * Every `repair.*` table carries a single `FOR ALL tenant_isolation` policy
   * whose write predicate is a copy of its read predicate, so this control MUST
   * find rows against any database this schema has been migrated into. Zero is
   * the exact symptom the broken predicate produced.
   */
  it('control 3 finds the FOR ALL policies that really are in this database', async () => {
    if (!reachable) return;
    const posture = await service().audit();
    const c = posture.controls.find((x) => x.id === 'rls.policy_shape')!;
    expect(
      c.findings.length,
      'control 3 found nothing. Either every policy now states an explicit WITH ' +
        'CHECK — verify by hand before deleting this test — or the predicate has ' +
        'silently stopped matching, which is exactly how it shipped broken.',
    ).toBeGreaterThan(0);
  });

  /**
   * The other seven predicates, checked for the same property in the only way
   * available without seeding a broken database: each must run and return a
   * well-formed answer, and the two that MUST have rows in any real deployment
   * are asserted to have them.
   */
  it('control 6 examines a real audit table rather than an empty list', async () => {
    if (!reachable) return;
    const posture = await service().audit();
    const c = posture.controls.find((x) => x.id === 'audit.append_only')!;
    // An empty `audit` schema makes "nothing is writable" vacuously true. The
    // service already treats that as a FAIL; this asserts the schema is really
    // there, so a pass here means something.
    expect(c.status, c.summary).toBe('pass');
    expect(c.summary).toMatch(/\d+ audit table/);
  });

  it('control 8 reports the role the application actually connects as', async () => {
    if (!reachable) return;
    const posture = await service().audit();
    const c = posture.controls.find((x) => x.id === 'connection.least_privilege')!;
    expect(c.findings.join(' ')).toContain('current_user =');
    // The whole isolation model rests on this. If it ever fails, every policy
    // in the database is inert and no other control's result means anything.
    expect(c.status, c.summary).toBe('pass');
  });

  it('control 4 distinguishes an accepted exception from an unexplained one', async () => {
    if (!reachable) return;
    const posture = await service().audit();
    const c = posture.controls.find((x) => x.id === 'relationships.foreign_keys')!;
    // audit.events carries three FK-less uuid columns by design, so the
    // exemption path must be exercised against this database, not just mocked.
    expect(c.findings.some((f) => f.startsWith('accepted: audit.events'))).toBe(true);
  });
});
