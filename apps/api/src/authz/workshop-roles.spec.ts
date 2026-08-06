import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { assertWorkshopStaff, isWorkshopStaff, WORKSHOP_STAFF_ROLES } from './workshop-roles';
import type { TenantContext } from '../tenancy/tenant-context';

const ctx = (activeRole: string): TenantContext =>
  ({
    tenantId: 't', organizationId: 'o', branchId: null,
    userId: 'u', activeRole, correlationId: 'c',
  }) as TenantContext;

describe('workshop staff gate', () => {
  /**
   * 🔴 THE ONE THAT MATTERS. `customer` is a real membership role whose
   * organizationId IS the workshop's, and organisation-scoped RLS cannot tell
   * the two apart. Eleven read methods across finance, warranty and parts were
   * ungated, so a signed-in customer could read the workshop's entire invoice
   * book, payment record, stock, supplier orders and warranty decisions.
   */
  it('refuses a customer', () => {
    expect(isWorkshopStaff(ctx('customer'))).toBe(false);
    expect(() => assertWorkshopStaff(ctx('customer'), 'The invoice book')).toThrow(ForbiddenException);
  });

  it('refuses roles from other workspaces that share a tenancy', () => {
    for (const role of ['supplier_user', 'fleet_manager', 'insurance_assessor', 'towing_operator']) {
      expect(isWorkshopStaff(ctx(role))).toBe(false);
    }
  });

  it('refuses an empty or unknown role rather than defaulting open', () => {
    expect(isWorkshopStaff(ctx(''))).toBe(false);
    expect(isWorkshopStaff(ctx('not_a_role'))).toBe(false);
  });

  it('admits every workshop staff role', () => {
    for (const role of WORKSHOP_STAFF_ROLES) {
      expect(isWorkshopStaff(ctx(role))).toBe(true);
      expect(() => assertWorkshopStaff(ctx(role), 'anything')).not.toThrow();
    }
  });

  /** A refusal that names no alternative is a wall — the costliest defect here. */
  it('names what the refused caller CAN reach', () => {
    try {
      assertWorkshopStaff(ctx('customer'), 'The invoice book');
      throw new Error('should have refused');
    } catch (e) {
      expect((e as Error).message).toMatch(/your own pages/i);
    }
  });
});
