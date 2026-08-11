import { describe, expect, it } from 'vitest';
import { assertWithinApprovalLimit } from './approval-limits';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * A6 — approval limits, proven to REFUSE and proven not to over-refuse.
 *
 * 🔴 THE SECOND HALF MATTERS AS MUCH AS THE FIRST. A limit that refuses too
 * much freezes every approval in every workshop that never opened the settings
 * screen — an outage delivered as a feature. So there are as many tests here
 * for what it MUST allow as for what it must refuse.
 */

const ctx = (role: string): TenantContext => ({
  tenantId: 't', organizationId: 'o', branchId: null,
  userId: 'u', activeRole: role, hasPlatformGrant: false, correlationId: 'c',
});

/** A client stub returning the given rows per query, in order. */
function client(...results: Array<Array<Record<string, unknown>>>) {
  let i = 0;
  return {
    query: async () => ({ rows: results[i++] ?? [] }),
  } as never;
}

describe('approval limits', () => {
  it('refuses an amount above the configured ceiling', async () => {
    await expect(
      assertWithinApprovalLimit(
        client([{ max_amount: '500.00', currency: 'GHS' }], [{ role_name: 'workshop_manager' }]),
        ctx('workshop_supervisor'),
        { amount: 5000, what: 'This variation' },
      ),
    ).rejects.toThrow(/above the GHS 500.00 your role may approve/i);
  });

  it('names who CAN approve it — a refusal with no escape hatch is a wall', async () => {
    await expect(
      assertWithinApprovalLimit(
        client([{ max_amount: '500.00', currency: 'GHS' }], [{ role_name: 'workshop_manager' }]),
        ctx('workshop_supervisor'),
        { amount: 5000, what: 'This variation' },
      ),
    ).rejects.toThrow(/ask workshop manager/i);
  });

  it('falls back to the owner when no role has a high enough limit', async () => {
    await expect(
      assertWithinApprovalLimit(
        client([{ max_amount: '500.00', currency: 'GHS' }], []),
        ctx('workshop_supervisor'),
        { amount: 5000, what: 'This variation' },
      ),
    ).rejects.toThrow(/ask the workshop owner/i);
  });

  it('allows an amount within the ceiling', async () => {
    await expect(
      assertWithinApprovalLimit(
        client([{ max_amount: '500.00', currency: 'GHS' }]),
        ctx('workshop_supervisor'),
        { amount: 500, what: 'This variation' },
      ),
    ).resolves.toBeUndefined();
  });

  it('ALLOWS when the workshop has configured no limit for the role', async () => {
    // The outage case. A tenant that configures nothing still gets a working
    // app; defaulting to zero would freeze every approval everywhere.
    await expect(
      assertWithinApprovalLimit(client([]), ctx('workshop_supervisor'), {
        amount: 999_999,
        what: 'This variation',
      }),
    ).resolves.toBeUndefined();
  });

  it('never limits the workshop owner or a platform administrator', async () => {
    // A limit that can lock the owner out of their own workshop has no escape
    // hatch, and a rule whose escape hatch does not exist is a wall.
    for (const role of ['workshop_owner', 'platform_administrator']) {
      await expect(
        assertWithinApprovalLimit(client([{ max_amount: '1.00', currency: 'GHS' }]), ctx(role), {
          amount: 1_000_000,
          what: 'This variation',
        }),
      ).resolves.toBeUndefined();
    }
  });

  it('treats a zero limit as meaningful — may approve nothing', async () => {
    // 045's own comment: "0 is meaningful: may approve nothing". A falsy-check
    // on the limit would turn that into "no limit at all", which is the exact
    // inversion of what the workshop configured.
    await expect(
      assertWithinApprovalLimit(client([{ max_amount: '0.00', currency: 'GHS' }], []), ctx('technician'), {
        amount: 1,
        what: 'This variation',
      }),
    ).rejects.toThrow(/above the GHS 0.00/i);
  });
});
