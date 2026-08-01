import { describe, expect, it, vi } from 'vitest';
import {
  SecurityPostureService,
  type PostureControl,
  type SecurityPosture,
} from './security-posture.service';
import type { DatabaseService } from '../database/database.service';

/**
 * These tests exist because of a defect found in this very file during its own
 * construction, and the shape of that defect is the thing worth protecting
 * against.
 *
 * Control 3 was first written as `WHERE p.polwithcheck IS NULL`, to find `FOR
 * ALL` policies that reuse `USING` as their write predicate. It returned zero
 * rows and read as a clean pass. It was wrong: PostgreSQL does not leave
 * `polwithcheck` null in that case, it stores a COPY of the `USING` expression.
 * The check could never have matched anything, against a database that held
 * thirty-nine policies of exactly that shape.
 *
 * That is the repo's most expensive defect class — a control that is present,
 * configured, and inert — and no unit test with a mocked database can catch it,
 * because a mock returns whatever it is told to. So the division of labour is:
 *
 *   * `security-posture.integration.spec.ts` runs the REAL queries against the
 *     REAL database and asserts each one is capable of returning a row.
 *   * this file asserts the classification logic on top of them.
 *
 * A test that only did the second half would be the same lie one layer up.
 */

function fakeDb(responses: Record<string, unknown[]>): DatabaseService {
  return {
    queryWithoutTenant: vi.fn(async (text: string) => {
      // Matched on a distinctive fragment of each query rather than on call
      // order, so re-ordering the Promise.all does not silently swap results
      // between controls.
      if (text.includes('NOT c.relrowsecurity')) return responses['rlsEnabled'] ?? [];
      if (text.includes('NOT c.relforcerowsecurity')) return responses['rlsForced'] ?? [];
      if (text.includes('polwithcheck')) return responses['policyShape'] ?? [];
      if (text.includes('pg_attribute')) return responses['fkPresent'] ?? [];
      if (text.includes('convalidated')) return responses['fkValidated'] ?? [];
      if (text.includes('has_table_privilege')) return responses['appendOnly'] ?? [];
      if (text.includes('audit.events')) return responses['activity'] ?? [];
      if (text.includes('pg_roles')) return responses['role'] ?? [];
      if (text.includes('SELECT now()')) return [{ now: new Date('2026-08-01T00:00:00Z') }];
      throw new Error(`unexpected query: ${text.slice(0, 60)}`);
    }),
  } as unknown as DatabaseService;
}

/** A database in the state a correctly-configured deployment should be in. */
function healthy(overrides: Record<string, unknown[]> = {}) {
  return fakeDb({
    rlsEnabled: [],
    rlsForced: [],
    policyShape: [],
    fkPresent: [],
    fkValidated: [],
    appendOnly: [{ table_name: 'audit.events', can_update: false, can_delete: false }],
    activity: [{ total: '297', recent: '297', latest: new Date('2026-08-01T00:00:00Z') }],
    role: [{ role_name: 'autoworkshop_app', is_superuser: false, bypasses_rls: false }],
    ...overrides,
  });
}

const control = (posture: SecurityPosture, id: string): PostureControl => {
  const found = posture.controls.find((c) => c.id === id);
  // Thrown rather than asserted with `!`: a renamed control id would otherwise
  // surface as "cannot read status of undefined" three lines later, pointing at
  // the assertion instead of at the rename.
  if (!found) throw new Error(`no control with id "${id}" — was it renamed?`);
  return found;
};

describe('SecurityPostureService', () => {
  it('reports every control passing against a correctly-configured database', async () => {
    const posture = await new SecurityPostureService(healthy()).audit();
    expect(posture.counts.fail).toBe(0);
    expect(posture.counts.warn).toBe(0);
    expect(posture.controls).toHaveLength(8);
  });

  it('FAILS when a table has no row-level security and no recorded reason', async () => {
    const posture = await new SecurityPostureService(
      healthy({ rlsEnabled: [{ table_name: 'repair.job_cards' }] }),
    ).audit();
    const c = control(posture, 'rls.enabled');
    expect(c.status).toBe('fail');
    expect(c.findings[0]).toContain('repair.job_cards');
  });

  it('PASSES a table without RLS only when the exemption carries a reason', async () => {
    // `identity.users` is exempt and the exemption states its compensating
    // control: every query reaches it by joining identity.memberships.
    const posture = await new SecurityPostureService(
      healthy({ rlsEnabled: [{ table_name: 'identity.users' }] }),
    ).audit();
    const c = control(posture, 'rls.enabled');
    expect(c.status).toBe('pass');
    expect(c.findings[0]).toContain('identity.memberships');
  });

  it('FAILS when RLS is enabled but not forced, because the policies are inert', async () => {
    const posture = await new SecurityPostureService(
      healthy({ rlsForced: [{ table_name: 'repair.quotations' }] }),
    ).audit();
    expect(control(posture, 'rls.forced').status).toBe('fail');
  });

  it('WARNS when a FOR ALL policy cannot distinguish reads from writes', async () => {
    // The shape migration 029 had to fix: one predicate governing both, so
    // every role that may read may also write.
    const posture = await new SecurityPostureService(
      healthy({
        policyShape: [{ table_name: 'repair.organization_pricing', policy: 'tenant_isolation' }],
      }),
    ).audit();
    const c = control(posture, 'rls.policy_shape');
    expect(c.status).toBe('warn');
    expect(c.findings[0]).toContain('tenant_isolation');
  });

  it('WARNS about an identifier column with no foreign key behind it', async () => {
    const posture = await new SecurityPostureService(
      healthy({
        fkPresent: [
          { table_name: 'repair.execution_time_entries', column_name: 'technician_id' },
        ],
      }),
    ).audit();
    const c = control(posture, 'relationships.foreign_keys');
    expect(c.status).toBe('warn');
    expect(c.findings[0]).toContain('unexplained');
  });

  it('accepts the audit log having no foreign keys, because evidence outlives its subject', async () => {
    const posture = await new SecurityPostureService(
      healthy({
        fkPresent: [
          { table_name: 'audit.events', column_name: 'actor_user_id' },
          { table_name: 'audit.events', column_name: 'tenant_id' },
        ],
      }),
    ).audit();
    expect(control(posture, 'relationships.foreign_keys').status).toBe('pass');
  });

  it('FAILS when the audit log can be rewritten after the fact', async () => {
    const posture = await new SecurityPostureService(
      healthy({
        appendOnly: [{ table_name: 'audit.events', can_update: true, can_delete: false }],
      }),
    ).audit();
    const c = control(posture, 'audit.append_only');
    expect(c.status).toBe('fail');
    expect(c.findings[0]).toContain('UPDATE');
  });

  it('FAILS when there is no audit table at all, rather than passing vacuously', async () => {
    // 🔴 The control returns "no table can be updated" for an empty list, which
    // is true and worthless. An audit schema with no tables is a worse state
    // than a writable one, not a better one.
    const posture = await new SecurityPostureService(healthy({ appendOnly: [] })).audit();
    expect(control(posture, 'audit.append_only').status).toBe('fail');
  });

  it('WARNS when the audit log is empty, because a silent control is unproven', async () => {
    const posture = await new SecurityPostureService(
      healthy({ activity: [{ total: '0', recent: '0', latest: null }] }),
    ).audit();
    expect(control(posture, 'audit.activity').status).toBe('warn');
  });

  it('FAILS when the application connects as a role that bypasses RLS', async () => {
    const posture = await new SecurityPostureService(
      healthy({
        role: [{ role_name: 'autoworkshop', is_superuser: true, bypasses_rls: false }],
      }),
    ).audit();
    const c = control(posture, 'connection.least_privilege');
    expect(c.status).toBe('fail');
    expect(c.summary).toContain('BYPASSES');
  });

  it('reads nothing from any tenant-owned table', async () => {
    const db = healthy();
    await new SecurityPostureService(db).audit();
    const queries = (db.queryWithoutTenant as unknown as { mock: { calls: string[][] } }).mock.calls.map(
      (c) => c[0],
    );
    // The posture report must never become a way to read customer, vehicle or
    // job data. Every query is catalog metadata plus the audit COUNT.
    for (const q of queries) {
      expect(q).not.toMatch(/\b(core|repair|catalogue)\.\w+/);
    }
  });
});
