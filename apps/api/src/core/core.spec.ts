import { describe, expect, it, vi } from 'vitest';
import { CustomerService } from './customer.service';
import { VehicleService } from './vehicle.service';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * Customer and vehicle service rules — Phase 4.
 *
 * UNIT tests over a fake client, following `identity.spec.ts`: they assert the
 * rules the database cannot express — who may read, who may write, which parent
 * lookups happen before an insert, and what reaches the audit trail.
 *
 * They deliberately do NOT re-test row-level security. RLS is proven against a
 * real cluster as a non-superuser in `database.integration.spec.ts`; asserting
 * it against a mock would prove only that the mock agrees with itself.
 *
 * ⚠️ THE READ TESTS BELOW EXIST BECAUSE THE CHECK THEY COVER WAS MISSING, and
 * that was found by asking the running API rather than by reading the code. With
 * a real technician token captured from a real Keycloak session,
 * `GET /api/v1/customers` answered **200 with the entire customer book** while
 * the screen 404'd the same viewer. Tenant isolation held; role authorization
 * did not exist. These tests are what stops it coming back.
 */

const ctx = (over: Partial<TenantContext> = {}): TenantContext => ({
  tenantId: 'tenant-a',
  organizationId: 'org-1',
  branchId: null,
  userId: 'user-1',
  activeRole: 'reception_staff',
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
    client,
    db: {
      withTenant: vi.fn(async (_c: TenantContext, work: (c: unknown) => Promise<unknown>) =>
        work(client),
      ),
    } as never,
  };
}

const fakeAudit = () => ({ write: vi.fn(async () => undefined) }) as never;

// Real UUIDs: the services validate id shape before touching SQL, so a
// placeholder like 'c1' is now a 400 rather than reaching a query.
const CUSTOMER_ID = '11111111-2222-3333-4444-555555555555';
const MAKE_ID = '66666666-7777-8888-9999-aaaaaaaaaaaa';
const MODEL_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';

const customerRow = {
  id: 'c1',
  organization_id: 'org-1',
  user_id: null,
  customer_type: 'individual',
  display_name: 'Kwame Mensah',
  email: null,
  phone: '+233 24 111 2233',
  preferred_contact: 'phone',
  location: 'Accra',
  status: 'active',
  vehicle_count: 2,
  created_at: new Date('2026-07-28T00:00:00Z'),
};

const vehicleRow = {
  id: 'v1',
  customer_id: 'c1',
  customer_name: 'Kwame Mensah',
  registration_number: 'GR 4821-22',
  vin: null,
  make: 'Toyota',
  model: null,
  variant: null,
  model_year: 2018,
  engine_type: null,
  transmission_type: 'automatic',
  fuel_type: 'petrol',
  current_mileage_km: 84500,
  colour: 'Silver',
  insurer_name: null,
  insurance_expires_on: null,
  status: 'active',
  created_at: new Date('2026-07-28T00:00:00Z'),
};

describe('CustomerService', () => {
  describe('read authorization', () => {
    // Every role the navigation model puts in front of the customer book.
    for (const role of [
      'platform_administrator',
      'workshop_owner',
      'workshop_manager',
      'reception_staff',
      'cashier',
    ]) {
      it(`allows ${role} to list customers`, async () => {
        const { db } = fakeDb([customerRow]);
        const svc = new CustomerService(db, fakeAudit());
        await expect(svc.list(ctx({ activeRole: role }))).resolves.toHaveLength(1);
      });
    }

    // §49 gives the technician no customer list, and §50 scopes them to
    // assigned jobs. This is the case that was live and unprotected.
    for (const role of [
      'technician',
      'storekeeper',
      'quality_control_inspector',
      'workshop_supervisor',
    ]) {
      it(`refuses ${role}`, async () => {
        const { db, queries } = fakeDb([customerRow]);
        const svc = new CustomerService(db, fakeAudit());
        await expect(svc.list(ctx({ activeRole: role }))).rejects.toThrow(/may not read/);
        // Refused BEFORE the database is touched — not filtered afterwards.
        expect(queries).toHaveLength(0);
      });
    }

    it('refuses an unknown role, rather than defaulting to allow', async () => {
      const { db } = fakeDb([customerRow]);
      const svc = new CustomerService(db, fakeAudit());
      await expect(svc.list(ctx({ activeRole: 'not_a_role' }))).rejects.toThrow(/may not read/);
    });
  });

  describe('scoping', () => {
    it('narrows a customer-role viewer to their own record', async () => {
      const { db, queries } = fakeDb([customerRow]);
      const svc = new CustomerService(db, fakeAudit());
      await svc.list(ctx({ activeRole: 'customer', userId: 'user-9' }));
      // The self-scope parameter carries the viewer's user id, so the query
      // cannot return another customer's row.
      expect(queries[0]?.values).toEqual(['tenant-a', 'org-1', 'user-9']);
    });

    it('does not narrow staff, who see the whole organisation book', async () => {
      const { db, queries } = fakeDb([customerRow]);
      const svc = new CustomerService(db, fakeAudit());
      await svc.list(ctx({ activeRole: 'reception_staff' }));
      expect(queries[0]?.values).toEqual(['tenant-a', 'org-1', null]);
    });

    /**
     * Codex P1, accepted and fixed.
     *
     * A customer record is ORGANIZATION-owned (`01 (1).txt` §19 — "Workshop
     * staff shall see ORGANIZATIONAL customer records"), and migration 004
     * models that with `organization_id`. The queries filtered only on
     * `tenant_id`, so in a tenant holding more than one organisation — a
     * workshop group and a supplier, say — a member of one could list the
     * other's customers. RLS does not catch it: both rows are in the same
     * tenant, so the policy is satisfied.
     */
    it('scopes reads to the ACTIVE ORGANIZATION, not just the tenant', async () => {
      const { db, queries } = fakeDb([customerRow]);
      const svc = new CustomerService(db, fakeAudit());
      await svc.list(ctx({ organizationId: 'org-7' }));
      expect(queries[0]?.text).toMatch(/c\.organization_id = \$2/);
      expect(queries[0]?.values?.[1]).toBe('org-7');
    });

    it('always filters by tenant in the query, not only by RLS', async () => {
      const { db, queries } = fakeDb([customerRow]);
      const svc = new CustomerService(db, fakeAudit());
      await svc.list(ctx());
      // CLAUDE.md §6 requires the application predicate as well: the RLS policy
      // exempts a platform administrator, so a bare query would return every
      // tenant's customers from an endpoint scoped to one.
      expect(queries[0]?.text).toMatch(/c\.tenant_id = \$1/);
    });
  });

  describe('create', () => {
    it('refuses a role that may not create', async () => {
      const { db } = fakeDb([customerRow]);
      const svc = new CustomerService(db, fakeAudit());
      await expect(
        svc.create(ctx({ activeRole: 'technician' }), { displayName: 'X' }),
      ).rejects.toThrow(/may not create/);
    });

    it('rejects a blank name as a bad request, not a permission failure', async () => {
      const { db } = fakeDb([customerRow]);
      const svc = new CustomerService(db, fakeAudit());
      await expect(svc.create(ctx(), { displayName: '   ' })).rejects.toThrow(
        /displayName is required/,
      );
    });

    it('takes tenant and organization from the context, never the body', async () => {
      const { db, queries } = fakeDb([customerRow]);
      const svc = new CustomerService(db, fakeAudit());
      await svc.create(ctx(), { displayName: 'Kwame Mensah' });
      const insert = queries.find((q) => /INSERT INTO core\.customers/.test(q.text));
      expect(insert?.values?.[0]).toBe('tenant-a');
      expect(insert?.values?.[1]).toBe('org-1');
    });

    it('keeps personal contact details OUT of the audit detail', async () => {
      const { db } = fakeDb([customerRow]);
      const audit = fakeAudit();
      const svc = new CustomerService(db, audit);
      await svc.create(ctx(), {
        displayName: 'Kwame Mensah',
        email: 'kwame@example.test',
        phone: '+233 24 111 2233',
      });
      // `1.txt` §1646 — an audit trail records that the act happened and by
      // whom; it is not a second copy of the personal data, because it is read
      // and exported by people who do not need it.
      const detail = JSON.stringify((audit as unknown as { write: { mock: { calls: unknown[][] } } }).write.mock.calls[0]?.[2]);
      expect(detail).not.toContain('kwame@example.test');
      expect(detail).not.toContain('+233 24 111 2233');
    });
  });
});

describe('VehicleService', () => {
  it('refuses a technician to read the vehicle register', async () => {
    const { db, queries } = fakeDb([vehicleRow]);
    const svc = new VehicleService(db, fakeAudit());
    await expect(svc.list(ctx({ activeRole: 'technician' }))).rejects.toThrow(/may not read/);
    expect(queries).toHaveLength(0);
  });

  it('narrows a customer-role viewer to vehicles of their own customer record', async () => {
    const { db, queries } = fakeDb([vehicleRow]);
    const svc = new VehicleService(db, fakeAudit());
    await svc.list(ctx({ activeRole: 'customer', userId: 'user-9' }));
    // Last parameter is the self-scope; without it a signed-in customer would
    // see every vehicle the workshop services.
    expect(queries[0]?.values).toEqual(['tenant-a', 'org-1', null, 'user-9']);
  });

  it('applies the self-scope even when filtering by a customer id', async () => {
    const { db, queries } = fakeDb([vehicleRow]);
    const svc = new VehicleService(db, fakeAudit());
    await svc.list(ctx({ activeRole: 'customer', userId: 'user-9' }), 'c-other');
    // The customer filter is applied ON TOP of the scope, never instead of it —
    // otherwise the nested route would be a way around the ownership rule.
    expect(queries[0]?.values).toEqual(['tenant-a', 'org-1', 'c-other', 'user-9']);
  });

  it('refuses to attach a vehicle to a customer outside the active tenant', async () => {
    // The parent lookup returns nothing — which is what RLS does for a customer
    // in another tenant — so the insert must never be reached.
    const { db, queries } = fakeDb([], (text) =>
      /FROM core\.customers/.test(text) ? [] : [{ id: 'v1' }],
    );
    const svc = new VehicleService(db, fakeAudit());
    await expect(
      svc.create(ctx(), {
        customerId: CUSTOMER_ID,
        registrationNumber: 'GR 1',
        makeId: MAKE_ID,
      }),
    ).rejects.toThrow(/customer not found/);
    expect(queries.some((q) => /INSERT INTO core\.vehicles/.test(q.text))).toBe(false);
  });

  it('refuses a model that does not belong to the given make', async () => {
    const { db } = fakeDb([], (text) => {
      if (/FROM core\.vehicle_models/.test(text)) return []; // mismatch
      return [{ id: 'x' }];
    });
    const svc = new VehicleService(db, fakeAudit());
    await expect(
      svc.create(ctx(), {
        customerId: CUSTOMER_ID,
        registrationNumber: 'GR 1',
        makeId: MAKE_ID,
        modelId: MODEL_ID,
      }),
    ).rejects.toThrow(/does not belong to the given make/);
  });

  it('scopes the vehicle register to the ACTIVE ORGANIZATION (Codex P1)', async () => {
    const { db, queries } = fakeDb([vehicleRow]);
    const svc = new VehicleService(db, fakeAudit());
    await svc.list(ctx({ organizationId: 'org-7' }));
    expect(queries[0]?.text).toMatch(/v\.organization_id = \$2/);
    expect(queries[0]?.values?.[1]).toBe('org-7');
  });

  /**
   * Codex P2, accepted and fixed. A malformed id used to reach a comparison
   * against a `uuid` column, where PostgreSQL raised 22P02 and the caller saw a
   * 500 — an outage-shaped answer to a bad field. Rejected before any SQL now,
   * which the query count asserts.
   */
  it.each([
    ['customerId', { customerId: 'not-a-uuid', registrationNumber: 'GR 1', makeId: MAKE_ID }],
    ['makeId', { customerId: CUSTOMER_ID, registrationNumber: 'GR 1', makeId: 'nope' }],
    ['modelId', { customerId: CUSTOMER_ID, registrationNumber: 'GR 1', makeId: MAKE_ID, modelId: 'x' }],
  ])('rejects a malformed %s with a 400 before touching the database', async (_f, input) => {
    const { db, queries } = fakeDb([], () => [{ id: 'x' }]);
    const svc = new VehicleService(db, fakeAudit());
    await expect(svc.create(ctx(), input as never)).rejects.toThrow(/must be a UUID/);
    expect(queries).toHaveLength(0);
  });

  it('rejects a fuel type outside the CHECK constraint with a 400', async () => {
    const { db } = fakeDb([], () => [{ id: 'x' }]);
    const svc = new VehicleService(db, fakeAudit());
    await expect(
      svc.create(ctx(), {
        customerId: CUSTOMER_ID,
        registrationNumber: 'GR 1',
        makeId: MAKE_ID,
        fuelType: 'plutonium',
      }),
    ).rejects.toThrow(/fuelType must be one of/);
  });

  it('rejects a non-integer mileage rather than letting it reach the column', async () => {
    const { db } = fakeDb([], () => [{ id: 'x' }]);
    const svc = new VehicleService(db, fakeAudit());
    await expect(
      svc.create(ctx(), {
        customerId: CUSTOMER_ID,
        registrationNumber: 'GR 1',
        makeId: MAKE_ID,
        currentMileageKm: -5,
      }),
    ).rejects.toThrow(/currentMileageKm/);
  });

  /**
   * Supervisor security finding, accepted and fixed by migration 005.
   *
   * The 409 below is only safe while the uniqueness constraint is scoped to the
   * ORGANIZATION — the same scope these queries read at. Under migration 004 it
   * was scoped to the TENANT while reads were org-scoped, which turned this
   * response into a cross-organization existence oracle: a 409 confirmed that
   * another organization in the same tenant held that registration.
   *
   * This test pins the read scope that the constraint must agree with, so a
   * future change that re-widens either one has to confront the pairing.
   */
  it('reads at organization scope, which is what makes the 409 safe', async () => {
    const { db, queries } = fakeDb([vehicleRow]);
    const svc = new VehicleService(db, fakeAudit());
    await svc.list(ctx({ organizationId: 'org-7' }));
    expect(queries[0]?.text).toMatch(/v\.organization_id = \$2/);
  });

  it('translates a duplicate registration into a conflict, not a 500', async () => {
    const { db } = fakeDb([], (text) => {
      if (/INSERT INTO core\.vehicles/.test(text)) {
        throw Object.assign(new Error('duplicate key'), { code: '23505' });
      }
      return [{ id: 'x' }];
    });
    const svc = new VehicleService(db, fakeAudit());
    await expect(
      svc.create(ctx(), { customerId: CUSTOMER_ID, registrationNumber: 'GR 1', makeId: MAKE_ID }),
    ).rejects.toThrow(/already exists/);
  });
});
