import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { MediaService, type OwnerType } from './media.service';
import { OWNER_TYPES } from './media.schemas';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * 🔴 THE WORST OF THE FOUR: `assertOwnerReachable` ASKED THE WRONG QUESTION.
 *
 * It probed `id = $1 AND tenant_id = $2 AND organization_id = $3` — "is this
 * thing in this workshop?" — and never "is this thing THIS PERSON'S?". A
 * customer's active organisation IS the workshop's, so every owner row in the
 * workshop passed. `GET /media?ownerType=job_card&ownerId=<uuid>` returned
 * another customer's repair photographs, and `DELETE /media/:id/link` — a WRITE
 * — detached them.
 *
 * ── ⚠️ WHAT THE FAKE CLIENT BELOW DOES AND DOES NOT PROVE ──────────────────
 *
 * It is not Postgres and does not pretend to be. It models exactly one rule:
 * a bound `$4` narrows the result ONLY IF the statement actually contains the
 * `$4::uuid IS NULL OR …` clause — which is what Postgres does, and which is
 * what makes these tests go RED if the predicate is removed from the SQL while
 * the parameter is still passed. The join chains themselves (a task reaching
 * its customer through its execution and job card) are SQL and are only truly
 * proved against a real database; what is proved here is that the clause is
 * present, bound rather than interpolated, and applied to the customer alone.
 */

const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const OWNING_CUSTOMER_USER = '22222222-2222-2222-2222-222222222222';
const STRANGER_CUSTOMER_USER = '33333333-3333-3333-3333-333333333333';

const ctx = (activeRole: string, userId = 'staff-user'): TenantContext =>
  ({
    tenantId: 't', organizationId: 'o', branchId: null,
    userId, activeRole, correlationId: 'c',
  }) as TenantContext;

/**
 * A workshop holding ONE owner row, which belongs to `OWNING_CUSTOMER_USER`.
 * Everything else about the world is uninteresting to these assertions.
 */
function makeService() {
  const probes: { text: string; values: unknown[] }[] = [];
  const deletes: { text: string; values: unknown[] }[] = [];

  const client = {
    query: vi.fn(async (text: string, values: unknown[] = []) => {
      if (text.includes('DELETE FROM media.links')) {
        deletes.push({ text, values });
        return { rowCount: 1, rows: [] };
      }
      if (text.trimStart().startsWith('SELECT 1 FROM')) {
        probes.push({ text, values });
        const [ownerId, tenantId, organizationId] = values as string[];
        if (ownerId !== OWNER_ID) return { rowCount: 0, rows: [] };
        if (tenantId !== 't' || organizationId !== 'o') return { rowCount: 0, rows: [] };
        // ── the whole point ────────────────────────────────────────────────
        // A parameter that the STATEMENT does not reference cannot filter
        // anything, exactly as in Postgres. So the narrowing applies only when
        // the clause is really in the SQL.
        const narrows = text.includes('$4::uuid IS NULL OR');
        const bound = values[3] ?? null;
        if (narrows && bound !== null && bound !== OWNING_CUSTOMER_USER) {
          return { rowCount: 0, rows: [] };
        }
        return { rowCount: 1, rows: [] };
      }
      // `selectAssets` — the gallery itself. Empty is fine; these tests are
      // about who gets as far as running it.
      return { rowCount: 0, rows: [] };
    }),
  };

  const db = { withTenant: vi.fn(async (_c: TenantContext, fn: (c: unknown) => unknown) => fn(client)) };
  const storage = {
    assetKey: () => 'k',
    presignPut: () => ({ url: 'u', key: 'k', expiresIn: 900 }),
    presignGet: () => ({ url: 'u', key: 'k', expiresIn: 300 }),
  };

  return { svc: new MediaService(db as never, storage as never), probes, deletes, client };
}

describe('one customer cannot read another customer’s attachments', () => {
  it('🔴 REFUSES a customer who does not own the job card', async () => {
    // Without the predicate this resolves with a (possibly empty) gallery and
    // a 200 — which is how another customer's photographs were served.
    const { svc } = makeService();
    await expect(
      svc.listForOwner(ctx('customer', STRANGER_CUSTOMER_USER), 'job_card', OWNER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 404, never 403 — so it is not an existence oracle', async () => {
    // The same answer a request for a job card in another tenancy gives. A
    // distinguishable refusal would confirm that this id names a real record.
    const { svc } = makeService();
    await expect(
      svc.listForOwner(ctx('customer', STRANGER_CUSTOMER_USER), 'job_card', OWNER_ID),
    ).rejects.toThrow(/no such job card/);
  });

  it('ADMITS the customer whose job card it is', async () => {
    // The control. A gate that refused every customer would pass the test above
    // and break the customer's own gallery, which is the feature this exists to
    // serve.
    const { svc } = makeService();
    await expect(
      svc.listForOwner(ctx('customer', OWNING_CUSTOMER_USER), 'job_card', OWNER_ID),
    ).resolves.toEqual([]);
  });

  it('leaves staff untouched — the predicate binds NULL for them', async () => {
    const { svc, probes } = makeService();
    for (const role of ['workshop_owner', 'technician', 'reception_staff']) {
      await expect(svc.listForOwner(ctx(role), 'job_card', OWNER_ID)).resolves.toEqual([]);
    }
    for (const probe of probes) expect(probe.values[3]).toBeNull();
  });
});

describe('DELETE /media/:id/link is gated by the same check as the read', () => {
  it('🔴 REFUSES a stranger customer detaching another customer’s photograph', async () => {
    const { svc, deletes } = makeService();
    await expect(
      svc.unlink(ctx('customer', STRANGER_CUSTOMER_USER), 'asset-1', 'job_card', OWNER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    // 🔴 AND NOTHING WAS DELETED. A refusal raised after the DELETE would still
    // throw and still pass a `rejects` assertion, having already destroyed the
    // link — the exact shape of "a gate that runs too late".
    expect(deletes).toHaveLength(0);
  });

  it('still lets the owning customer detach their own', async () => {
    const { svc, deletes } = makeService();
    await expect(
      svc.unlink(ctx('customer', OWNING_CUSTOMER_USER), 'asset-1', 'job_card', OWNER_ID),
    ).resolves.toBeUndefined();
    expect(deletes).toHaveLength(1);
  });
});

describe('every owner type carries a customer-ownership path', () => {
  it('applies the clause for ALL SIX types, not just job cards', async () => {
    // ⚠️ EVERY TYPE, NOT A SAMPLE. `OWNER_TYPES` is the schema's own list, so a
    // seventh type added later without a `customerPath` fails here rather than
    // shipping open. A test that checked one type while its name claimed all of
    // them is the same defect as a comment that overclaims.
    for (const ownerType of OWNER_TYPES as readonly OwnerType[]) {
      const { svc, probes } = makeService();
      await expect(
        svc.listForOwner(ctx('customer', STRANGER_CUSTOMER_USER), ownerType, OWNER_ID),
        ownerType,
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(probes, ownerType).toHaveLength(1);
      expect(probes[0]!.text, ownerType).toContain('$4::uuid IS NULL OR');
      expect(probes[0]!.values[3], ownerType).toBe(STRANGER_CUSTOMER_USER);
    }
  });

  it('binds the ids, never interpolates them', async () => {
    // The table name is interpolated by design (a closed enum key); an owner id
    // or a user id in the SQL text would be an injection site and a log leak.
    const { svc, probes } = makeService();
    await svc.listForOwner(ctx('customer', OWNING_CUSTOMER_USER), 'job_card', OWNER_ID);
    expect(probes[0]!.text).not.toContain(OWNER_ID);
    expect(probes[0]!.text).not.toContain(OWNING_CUSTOMER_USER);
  });

  it('reaches an intake through the VEHICLE, because job_card_id is nullable', async () => {
    // 041 records an intake at the gate, before a card exists. Scoping through
    // `job_card_id` would leave exactly the newest intake — the one the
    // customer just watched being written — unreachable by its owner.
    const { svc, probes } = makeService();
    await svc.listForOwner(ctx('customer', OWNING_CUSTOMER_USER), 'vehicle_intake', OWNER_ID);
    expect(probes[0]!.text).toContain('core.vehicles');
    expect(probes[0]!.text).not.toContain('o.job_card_id');
  });

  it('reaches a message through PARTICIPATION, not the thread’s subject customer', async () => {
    // 046: `comms.participants` "IS THE ACCESS RULE, not a display list." A
    // thread's `customer_id` is what the conversation is ABOUT — scoping on it
    // would hand a customer the attachments on an INTERNAL thread that merely
    // mentions them.
    const { svc, probes } = makeService();
    await svc.listForOwner(ctx('customer', OWNING_CUSTOMER_USER), 'message', OWNER_ID);
    expect(probes[0]!.text).toContain('comms.participants');
    expect(probes[0]!.text).not.toContain('customer_id');
  });

  it('keeps the organisation predicate that was already there', async () => {
    // The 2026-08-06 fix. A tenant here really does hold more than one
    // organisation, and the new clause must not have displaced the old one.
    const { svc, probes } = makeService();
    await svc.listForOwner(ctx('workshop_owner'), 'job_card', OWNER_ID);
    expect(probes[0]!.text).toContain('o.tenant_id = $2');
    expect(probes[0]!.text).toContain('o.organization_id = $3');
  });
});
