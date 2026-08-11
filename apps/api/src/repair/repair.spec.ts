import { describe, expect, it, vi } from 'vitest';
import { JobCardService } from './job-card.service';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * Job card rules — Phase 5.
 *
 * UNIT tests over a fake client, following `core.spec.ts` and `identity.spec.ts`.
 * They assert what the database cannot express: WHOSE job cards a viewer sees,
 * whose vehicle a card may be raised against, and who may be assigned one.
 *
 * ⚠️ THE SCOPE TESTS ARE THE POINT OF THIS FILE. Three roles get three different
 * answers from the SAME query, and the difference is a parameter. A refactor
 * that dropped one predicate would return more rows, not fewer — so it would
 * look like everything working, and only these tests would object.
 */

const ctx = (over: Partial<TenantContext> = {}): TenantContext => ({
  tenantId: 'tenant-a',
  organizationId: 'org-1',
  branchId: null,
  userId: 'user-1',
  activeRole: 'reception_staff',
  hasPlatformGrant: false,
  correlationId: 'corr-1',
  ...over,
});

function fakeDb(rows: unknown[] = [], rowsFor?: (text: string) => unknown[] | undefined) {
  const queries: Array<{ text: string; values?: unknown[] }> = [];
  const client = {
    query: vi.fn(async (text: string, values?: unknown[]) => {
      queries.push({ text, values });
      return { rows: rowsFor?.(text) ?? rows };
    }),
  };
  return {
    queries,
    db: {
      withTenant: vi.fn(async (_c: TenantContext, work: (c: unknown) => Promise<unknown>) =>
        work(client),
      ),
    } as never,
  };
}

const fakeAudit = () => ({ write: vi.fn(async () => undefined) }) as never;

const VEHICLE_ID = '11111111-2222-3333-4444-555555555555';
const TECH_ID = '66666666-7777-8888-9999-aaaaaaaaaaaa';

const jobRow = {
  id: 'j1',
  job_number: 'JC-000001',
  customer_id: 'c1',
  customer_name: 'Kwame Mensah',
  vehicle_id: VEHICLE_ID,
  registration_number: 'GR 4821-22',
  make: 'Toyota',
  model: null,
  model_year: 2018,
  complaint: 'Brakes squealing.',
  stage: 'complaint_received',
  priority: 'high',
  assigned_technician_id: TECH_ID,
  technician_name: 'A. Technician',
  expected_completion_on: null,
  mileage_at_intake: 84500,
  opened_at: new Date('2026-07-28T00:00:00Z'),
  stage_changed_at: new Date('2026-07-28T00:00:00Z'),
  closed_at: null,
};

describe('JobCardService — who sees which cards', () => {
  it('narrows a TECHNICIAN to cards assigned to them', async () => {
    const { db, queries } = fakeDb([jobRow]);
    const svc = new JobCardService(db, fakeAudit());
    await svc.list(ctx({ activeRole: 'technician', userId: 'tech-9' }));
    // Third parameter is the assignment scope. Without it a technician would
    // see every card in the organisation.
    expect(queries[0]?.values?.[2]).toBe('tech-9');
    expect(queries[0]?.values?.[3]).toBeNull();
  });

  it('narrows a CUSTOMER to cards against their own vehicles', async () => {
    const { db, queries } = fakeDb([jobRow]);
    const svc = new JobCardService(db, fakeAudit());
    await svc.list(ctx({ activeRole: 'customer', userId: 'cust-9' }));
    expect(queries[0]?.values?.[2]).toBeNull();
    expect(queries[0]?.values?.[3]).toBe('cust-9');
  });

  it('does NOT narrow workshop staff, who see their organisation', async () => {
    const { db, queries } = fakeDb([jobRow]);
    const svc = new JobCardService(db, fakeAudit());
    await svc.list(ctx({ activeRole: 'workshop_manager' }));
    expect(queries[0]?.values?.[2]).toBeNull();
    expect(queries[0]?.values?.[3]).toBeNull();
  });

  it('scopes to tenant AND organization, not tenant alone', async () => {
    const { db, queries } = fakeDb([jobRow]);
    const svc = new JobCardService(db, fakeAudit());
    await svc.list(ctx({ organizationId: 'org-7' }));
    expect(queries[0]?.text).toMatch(/j\.organization_id = \$2/);
    expect(queries[0]?.values?.[1]).toBe('org-7');
  });

  it('applies the technician scope to findById too, not only the list', async () => {
    // A per-record read is exactly where a missing predicate hides: the list
    // looks right and one guessed id returns somebody else's card.
    const { db, queries } = fakeDb([jobRow]);
    const svc = new JobCardService(db, fakeAudit());
    await svc.findById(ctx({ activeRole: 'technician', userId: 'tech-9' }), 'j1');
    expect(queries[0]?.values?.[3]).toBe('tech-9');
  });

  for (const role of ['towing_operator', 'not_a_role']) {
    it(`refuses '${role}' before touching the database`, async () => {
      const { db, queries } = fakeDb([jobRow]);
      const svc = new JobCardService(db, fakeAudit());
      await expect(svc.list(ctx({ activeRole: role }))).rejects.toThrow(/may not read/);
      expect(queries).toHaveLength(0);
    });
  }
});

describe('JobCardService — opening a card', () => {
  it('refuses a technician, who works on jobs rather than opening them', async () => {
    const { db } = fakeDb([]);
    const svc = new JobCardService(db, fakeAudit());
    await expect(
      svc.create(ctx({ activeRole: 'technician' }), { vehicleId: VEHICLE_ID, complaint: 'x' }),
    ).rejects.toThrow(/may not open/);
  });

  it('refuses a customer opening a card against a vehicle that is not theirs', async () => {
    // The vehicle lookup returns nothing — what it does for someone else's car,
    // because the query carries `c.user_id = <viewer>`.
    const { db, queries } = fakeDb([], (t) => (/FROM core\.vehicles/.test(t) ? [] : [{ id: 'x' }]));
    const svc = new JobCardService(db, fakeAudit());
    await expect(
      svc.create(ctx({ activeRole: 'customer', userId: 'cust-9' }), {
        vehicleId: VEHICLE_ID,
        complaint: 'Brakes squealing.',
      }),
    ).rejects.toThrow(/vehicle not found/);
    expect(queries.some((q) => /INSERT INTO repair\.job_cards/.test(q.text))).toBe(false);
  });

  it('passes the viewer as the ownership predicate for a customer', async () => {
    const { db, queries } = fakeDb([], (t) =>
      /FROM core\.vehicles/.test(t) ? [{ id: VEHICLE_ID, customer_id: 'c1', current_mileage_km: 100 }] : [jobRow],
    );
    const svc = new JobCardService(db, fakeAudit());
    await svc.create(ctx({ activeRole: 'customer', userId: 'cust-9' }), {
      vehicleId: VEHICLE_ID,
      complaint: 'Brakes squealing.',
    });
    const lookup = queries.find((q) => /FROM core\.vehicles/.test(q.text));
    expect(lookup?.values?.[3]).toBe('cust-9');
  });

  it('does NOT narrow staff to their own vehicles when opening a card', async () => {
    const { db, queries } = fakeDb([], (t) =>
      /FROM core\.vehicles/.test(t) ? [{ id: VEHICLE_ID, customer_id: 'c1', current_mileage_km: 100 }] : [jobRow],
    );
    const svc = new JobCardService(db, fakeAudit());
    await svc.create(ctx({ activeRole: 'reception_staff' }), {
      vehicleId: VEHICLE_ID,
      complaint: 'Brakes squealing.',
    });
    const lookup = queries.find((q) => /FROM core\.vehicles/.test(q.text));
    expect(lookup?.values?.[3]).toBeNull();
  });

  it('refuses a customer trying to assign a technician', async () => {
    const { db } = fakeDb([]);
    const svc = new JobCardService(db, fakeAudit());
    await expect(
      svc.create(ctx({ activeRole: 'customer' }), {
        vehicleId: VEHICLE_ID,
        complaint: 'x',
        assignedTechnicianId: TECH_ID,
      }),
    ).rejects.toThrow(/may not assign/);
  });

  /**
   * Codex P2, accepted and fixed. Membership alone would allow assigning a card
   * to a cashier: it would then appear on NO technician's "My Assigned Work",
   * and the person it was given to has no screen that says it is theirs. The
   * job would not fail — it would simply never be picked up.
   */
  it('requires the assignee to actually hold the technician role', async () => {
    const { db, queries } = fakeDb([], (t) => {
      if (/FROM core\.vehicles/.test(t)) return [{ id: VEHICLE_ID, customer_id: 'c1', current_mileage_km: 1 }];
      if (/FROM identity\.memberships/.test(t)) return []; // not a technician
      return [jobRow];
    });
    const svc = new JobCardService(db, fakeAudit());
    await expect(
      svc.create(ctx(), { vehicleId: VEHICLE_ID, complaint: 'x', assignedTechnicianId: TECH_ID }),
    ).rejects.toThrow(/not an active technician/);
    const check = queries.find((q) => /FROM identity\.memberships/.test(q.text));
    expect(check?.text).toMatch(/role_name = 'technician'/);
  });

  it('derives the customer from the VEHICLE, never from the caller', async () => {
    const { db, queries } = fakeDb([], (t) =>
      /FROM core\.vehicles/.test(t)
        ? [{ id: VEHICLE_ID, customer_id: 'derived-customer', current_mileage_km: 4200 }]
        : [jobRow],
    );
    const svc = new JobCardService(db, fakeAudit());
    await svc.create(ctx(), { vehicleId: VEHICLE_ID, complaint: 'Brakes squealing.' });
    const insert = queries.find((q) => /INSERT INTO repair\.job_cards/.test(q.text));
    // Accepting a customer id from the caller would allow a card whose customer
    // does not own its vehicle — both ids individually valid, the row incoherent.
    expect(insert?.values).toContain('derived-customer');
  });

  it('falls back to the vehicle mileage when intake mileage is not given', async () => {
    const { db, queries } = fakeDb([], (t) =>
      /FROM core\.vehicles/.test(t)
        ? [{ id: VEHICLE_ID, customer_id: 'c1', current_mileage_km: 84500 }]
        : [jobRow],
    );
    const svc = new JobCardService(db, fakeAudit());
    await svc.create(ctx(), { vehicleId: VEHICLE_ID, complaint: 'Brakes squealing.' });
    const insert = queries.find((q) => /INSERT INTO repair\.job_cards/.test(q.text));
    expect(insert?.values).toContain(84500);
  });

  it('keeps the complaint TEXT out of the audit detail', async () => {
    const { db } = fakeDb([], (t) =>
      /FROM core\.vehicles/.test(t) ? [{ id: VEHICLE_ID, customer_id: 'c1', current_mileage_km: 1 }] : [jobRow],
    );
    const audit = fakeAudit();
    const svc = new JobCardService(db, audit);
    await svc.create(ctx(), {
      vehicleId: VEHICLE_ID,
      complaint: 'My wife hit a pole outside 14 Acacia Road',
    });
    // A complaint is free text the customer typed and may contain anything;
    // the audit trail records that a card was opened, not what it says.
    const detail = JSON.stringify(
      (audit as unknown as { write: { mock: { calls: unknown[][] } } }).write.mock.calls[0]?.[2],
    );
    expect(detail).not.toContain('Acacia Road');
  });

  it('rejects a blank complaint as a bad request', async () => {
    const { db } = fakeDb([]);
    const svc = new JobCardService(db, fakeAudit());
    await expect(svc.create(ctx(), { vehicleId: VEHICLE_ID, complaint: '   ' })).rejects.toThrow(
      /complaint is required/,
    );
  });

  it('rejects a priority outside the CHECK constraint', async () => {
    const { db } = fakeDb([]);
    const svc = new JobCardService(db, fakeAudit());
    await expect(
      svc.create(ctx(), { vehicleId: VEHICLE_ID, complaint: 'x', priority: 'catastrophic' }),
    ).rejects.toThrow(/priority must be one of/);
  });
});
