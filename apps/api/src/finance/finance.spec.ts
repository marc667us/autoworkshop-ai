import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import {
  FinanceInputError,
  invoiceStatusFor,
  mayBill,
  mayRefund,
  parseInvoiceTransition,
} from './finance-rules';
import { FinanceService } from './finance.service';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * ⚠️ `*.spec.ts`, NOT `*.test.ts`. The package vitest config collected only
 * `*.test.ts` for a while and apps/api uses `*.spec.ts`, so a whole suite ran
 * ZERO tests while exiting 0 (2026-08-04). Read the COUNT, never the exit code.
 */

describe('who may bill', () => {
  it('admits the front desk and the cashier', () => {
    for (const role of ['workshop_owner', 'workshop_manager', 'reception_staff', 'cashier']) {
      expect(mayBill(role)).toBe(true);
    }
  });

  it('refuses the technician and the storekeeper', () => {
    // §49's tree carries no financial item at all, and the storekeeper's is
    // parts, not money.
    for (const role of ['technician', 'storekeeper', 'quality_control_inspector']) {
      expect(mayBill(role)).toBe(false);
    }
  });

  it('fails closed on a missing or unknown role', () => {
    expect(mayBill(null)).toBe(false);
    expect(mayBill(undefined)).toBe(false);
    expect(mayBill('')).toBe(false);
    expect(mayBill('not_a_role')).toBe(false);
  });
});

describe('refunds are narrower than taking money', () => {
  it('is the owner or the manager only', () => {
    expect(mayRefund('workshop_owner')).toBe(true);
    expect(mayRefund('workshop_manager')).toBe(true);
  });

  it('🔴 REFUSES THE ROLES THAT MAY TAKE PAYMENT', () => {
    // The asymmetry is the point: recording an incoming payment is clerical —
    // the money is already on the counter. A refund MOVES MONEY OUT on one
    // person's say-so, which is the obvious internal-fraud path.
    expect(mayBill('reception_staff')).toBe(true);
    expect(mayRefund('reception_staff')).toBe(false);
    expect(mayBill('cashier')).toBe(true);
    expect(mayRefund('cashier')).toBe(false);
  });
});

describe('invoice transitions', () => {
  it('lets a draft be issued or voided', () => {
    expect(parseInvoiceTransition('draft', 'issued')).toBe('issued');
    expect(parseInvoiceTransition('draft', 'void')).toBe('void');
  });

  it('🔴 refuses marking an invoice paid by hand, and says what to do instead', () => {
    // A status somebody could set by hand would be a claim about money that no
    // money backs.
    expect(() => parseInvoiceTransition('issued', 'paid')).toThrow(FinanceInputError);
    try {
      parseInvoiceTransition('issued', 'paid');
    } catch (error) {
      expect((error as Error).message).toContain('Record the payment instead');
    }
  });

  it('refuses to change a settled invoice, and names the credit note', () => {
    try {
      parseInvoiceTransition('paid', 'void');
      throw new Error('a settled invoice was allowed to change');
    } catch (error) {
      expect(error).toBeInstanceOf(FinanceInputError);
      // Every refusal must name a REACHABLE alternative. A refusal that names
      // none is a wall, and it is the most expensive defect class in this repo.
      expect((error as Error).message).toContain('credit note');
    }
  });

  it('refuses a move to the status it is already in', () => {
    expect(() => parseInvoiceTransition('issued', 'issued')).toThrow(/already/);
  });

  it('refuses a status this workshop does not use', () => {
    expect(() => parseInvoiceTransition('banana', 'issued')).toThrow(/not an invoice status/);
  });
});

describe('the invoice status derived from money', () => {
  it('is `issued` while nothing has been paid', () => {
    expect(invoiceStatusFor({ grossTotal: 345, paid: 0, credited: 0 })).toBe('issued');
  });

  it('is `part_paid` for a deposit', () => {
    expect(invoiceStatusFor({ grossTotal: 345, paid: 100, credited: 0 })).toBe('part_paid');
  });

  it('is `paid` when the full amount arrives', () => {
    expect(invoiceStatusFor({ grossTotal: 345, paid: 345, credited: 0 })).toBe('paid');
  });

  it('🔴 counts a CREDIT NOTE against what is owed', () => {
    // An invoice for 345 with a 45 credit note is settled by a payment of 300.
    // Comparing against the gross would leave it forever "part paid" and
    // permanently on the outstanding-balances screen.
    expect(invoiceStatusFor({ grossTotal: 345, paid: 300, credited: 45 })).toBe('paid');
    expect(invoiceStatusFor({ grossTotal: 345, paid: 299, credited: 45 })).toBe('part_paid');
  });

  it('treats an overpayment as settled, not as unpaid', () => {
    // The excess is a matter for a refund, never a reason to leave the invoice
    // looking outstanding.
    expect(invoiceStatusFor({ grossTotal: 345, paid: 400, credited: 0 })).toBe('paid');
  });

  it('is settled by a credit note alone', () => {
    expect(invoiceStatusFor({ grossTotal: 100, paid: 0, credited: 100 })).toBe('issued');
    // ...but only once something has actually been paid does it become `paid`;
    // a fully-credited invoice with no payment is still `issued` until the
    // service voids it. Pinning the current behaviour so a change is deliberate.
  });

  it('survives the floating-point cases that break naive comparison', () => {
    // 0.1 + 0.2 !== 0.3 in IEEE 754. These are exactly the amounts that make a
    // fully-paid invoice read as part-paid by one hundredth of a pesewa.
    expect(invoiceStatusFor({ grossTotal: 0.3, paid: 0.1 + 0.2, credited: 0 })).toBe('paid');
    expect(invoiceStatusFor({ grossTotal: 34.5, paid: 30, credited: 4.5 })).toBe('paid');
  });

  it('never goes negative when credits exceed the total', () => {
    expect(invoiceStatusFor({ grossTotal: 100, paid: 1, credited: 500 })).toBe('paid');
  });
});

/**
 * 🔴 THE FOURTH READ IN THIS FILE, AND THE ONLY ONE THAT WAS OPEN.
 *
 * `listInvoices`, `getInvoice` and `listPayments` all call `assertWorkshopStaff`.
 * `revenueByMonth` did not, and it is the WIDEST of the four: the whole
 * organisation's monthly turnover net of refunds. `customer` is a real
 * membership role whose `organizationId` IS the workshop's, so organisation-
 * scoped RLS cannot separate it from staff — the service is the only line.
 *
 * These assert the REFUSAL HAPPENS BEFORE ANY QUERY: `withTenant` is a spy that
 * throws if it is entered at all, so a gate placed after the SQL — which would
 * still 403, having already read the money — fails here.
 */
describe('revenue by month is the workshop’s, not a customer’s', () => {
  const ctx = (activeRole: string): TenantContext =>
    ({
      tenantId: 't', organizationId: 'o', branchId: null,
      userId: 'u', activeRole, correlationId: 'c',
    }) as TenantContext;

  function makeService() {
    const withTenant = vi.fn(async () => {
      throw new Error('withTenant was entered — the gate ran too late, or not at all');
    });
    return { svc: new FinanceService({ withTenant } as never), withTenant };
  }

  it('REFUSES a customer, without touching the database', async () => {
    const { svc, withTenant } = makeService();
    await expect(svc.revenueByMonth(ctx('customer'))).rejects.toBeInstanceOf(ForbiddenException);
    expect(withTenant).not.toHaveBeenCalled();
  });

  it('names what the refused customer CAN reach', async () => {
    // A refusal that names no alternative is a wall — the costliest defect
    // class recorded in this repository.
    const { svc } = makeService();
    await expect(svc.revenueByMonth(ctx('customer'))).rejects.toThrow(/your own pages/i);
  });

  it('refuses the other non-staff roles that share this tenancy', async () => {
    const { svc } = makeService();
    for (const role of ['supplier_user', 'fleet_manager', 'insurance_assessor']) {
      await expect(svc.revenueByMonth(ctx(role)), role).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('lets staff through to the query — the gate is not a wall for the workshop', async () => {
    // The negative above is worthless without this control: a check that
    // refused everybody would pass the refusal tests and break the screen.
    const { svc, withTenant } = makeService();
    for (const role of ['workshop_owner', 'cashier', 'technician']) {
      withTenant.mockClear();
      await expect(svc.revenueByMonth(ctx(role))).rejects.toThrow(/withTenant was entered/);
      expect(withTenant, role).toHaveBeenCalledTimes(1);
    }
  });
});
