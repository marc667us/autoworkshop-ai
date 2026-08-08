import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DirectoryService } from './directory.service';
import { WORKSHOP_STAFF_ROLES } from '../authz/workshop-roles';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * 🔴 `describe()` WAS THE UNGATED ONE. `assertGoverns` guards `save` and
 * `setPublication`; the READ guarded nothing — the shape this repository has
 * now recorded seven times.
 *
 * What it returns is the workshop's DRAFT listing state and `suggested`, a
 * pre-fill block read straight from `core.organization_profile` whose
 * `publicPhone` the service's own comment flags as "may be a private office
 * line. The owner has to accept it into a public field."
 *
 * Migration 028 made the listing readable by any MEMBER, deliberately and for a
 * good reason: a manager who cannot see whether their own workshop is listed
 * cannot ask the owner to change it. That policy's comment says "No role
 * condition, deliberately… not privileged information inside the organization"
 * — true when a membership meant a colleague, and migration 061 made `customer`
 * self-service, so it no longer does.
 *
 * 028 is applied and checksummed and is NOT edited. The gate is in the service.
 */

const ctx = (activeRole: string): TenantContext =>
  ({
    tenantId: 't', organizationId: 'o', branchId: null,
    userId: 'u', activeRole, correlationId: 'c',
  }) as TenantContext;

/** Throws on entry, so a gate placed after the SELECT fails rather than passes. */
function refusingDb() {
  const withTenant = vi.fn(async () => {
    throw new Error('withTenant was entered — the gate ran too late, or not at all');
  });
  return { svc: new DirectoryService({ withTenant } as never), withTenant };
}

/**
 * A database that answers. `queries` records the SQL actually issued, which is
 * how the "not read at all" claim below is checked — a test that only inspected
 * the RESPONSE would pass on a service that fetched the private phone number
 * and then dropped it.
 */
function answeringDb(listingRow: Record<string, unknown> | null) {
  const queries: string[] = [];
  const withTenant = vi.fn(async (_ctx: TenantContext, fn: (c: unknown) => Promise<unknown>) =>
    fn({
      query: async (sql: string) => {
        queries.push(sql);
        if (sql.includes('mechanic_directory')) {
          return { rows: listingRow ? [listingRow] : [] };
        }
        return {
          rows: [
            {
              trading_name: 'Profile Motors',
              city: 'Accra',
              country: 'GH',
              // 🔴 THE PRIVATE OFFICE LINE. If this string reaches a
              // non-editor's response, the fix did not work.
              phone: '+233-000-PRIVATE',
            },
          ],
        };
      },
    }),
  );
  return { svc: new DirectoryService({ withTenant } as never), queries };
}

describe('the directory listing screen belongs to the workshop', () => {
  it('REFUSES a customer, without touching the database', async () => {
    const { svc, withTenant } = refusingDb();
    await expect(svc.describe(ctx('customer'))).rejects.toBeInstanceOf(ForbiddenException);
    expect(withTenant).not.toHaveBeenCalled();
  });

  it('names what the refused customer CAN reach', async () => {
    const { svc } = refusingDb();
    await expect(svc.describe(ctx('customer'))).rejects.toThrow(/your own pages/i);
  });

  it('refuses the other roles that share this tenancy', async () => {
    const { svc } = refusingDb();
    for (const role of ['supplier_owner', 'fleet_administrator', 'insurance_assessor', '']) {
      await expect(svc.describe(ctx(role)), role || '(empty)').rejects.toBeInstanceOf(
        ForbiddenException,
      );
    }
  });

  /**
   * ⚠️ THE CONTROL. 028 exists because a manager and a technician saw "Not
   * listed" about a listing that existed. A gate that refused them would
   * recreate exactly that defect, so every staff role must still get through.
   */
  it('admits every workshop staff role — 028’s rule is preserved', async () => {
    const { svc, withTenant } = refusingDb();
    for (const role of WORKSHOP_STAFF_ROLES) {
      withTenant.mockClear();
      await expect(svc.describe(ctx(role)), role).rejects.toThrow(/withTenant was entered/);
      expect(withTenant, role).toHaveBeenCalledTimes(1);
    }
  });
});

describe('the profile pre-fill is for the person who can act on it', () => {
  it('gives the owner the suggestions, because they fill the form', async () => {
    const { svc, queries } = answeringDb(null);
    const out = (await svc.describe(ctx('workshop_owner'))) as {
      suggested: Record<string, unknown>;
      mayEdit: boolean;
    };
    expect(out.mayEdit).toBe(true);
    expect(out.suggested.tradingName).toBe('Profile Motors');
    expect(out.suggested.publicPhone).toBe('+233-000-PRIVATE');
    expect(queries.some((q) => q.includes('core.organization_profile'))).toBe(true);
  });

  it('withholds them from staff who cannot edit — and does not even READ them', async () => {
    const { svc, queries } = answeringDb(null);
    const out = (await svc.describe(ctx('workshop_manager'))) as {
      suggested: Record<string, unknown>;
      mayEdit: boolean;
    };
    expect(out.mayEdit).toBe(false);
    expect(out.suggested.publicPhone).toBeNull();
    expect(out.suggested.tradingName).toBeNull();
    expect(queries.some((q) => q.includes('core.organization_profile'))).toBe(false);
  });

  /**
   * 🔴 THE KEY STAYS. `directory-screen.tsx` does
   * `const { listing, suggested, mayEdit } = res.data` and then reads
   * `suggested.tradingName`. Returning the block as `null` would throw a
   * TypeError inside a server component and take the page down for the manager
   * this change protects — a fix that produces an outage is not a fix.
   */
  it('keeps the `suggested` key present so the shipped screen still renders', async () => {
    const { svc } = answeringDb(null);
    const out = (await svc.describe(ctx('technician'))) as Record<string, unknown>;
    expect(Object.keys(out)).toContain('suggested');
    expect(out.suggested).not.toBeNull();
    for (const field of ['tradingName', 'city', 'country', 'publicPhone']) {
      expect(out.suggested as Record<string, unknown>, field).toHaveProperty(field);
    }
  });

  /** The SAVED listing is still shown to everyone — that is the whole of 028. */
  it('still shows a non-editor the listing that exists', async () => {
    const { svc } = answeringDb({
      trading_name: 'Saved Motors',
      city: 'Kumasi',
      country: 'GH',
      public_phone: '+233-111-PUBLIC',
      services: ['brakes'],
      specialisms: [],
      is_published: false,
      updated_at: '2026-08-08T00:00:00.000Z',
    });
    const out = (await svc.describe(ctx('reception_staff'))) as {
      listing: Record<string, unknown> | null;
    };
    expect(out.listing).not.toBeNull();
    expect(out.listing!.tradingName).toBe('Saved Motors');
    expect(out.listing!.isPublished).toBe(false);
  });
});
