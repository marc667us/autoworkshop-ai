import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SupplierRequestService } from './supplier-request.service';
import { WORKSHOP_STAFF_ROLES } from '../authz/workshop-roles';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * 🔴 EVERY WRITE WAS GATED AND THE READ WAS NOT.
 *
 * `create` and `decide` both check `MAY_ASK`; `listForWorkshop` checked nothing,
 * and it is the method that returns the whole procurement conversation —
 * `quote_minor` (the price the workshop PAYS, before the margin the customer is
 * billed), the lead time, and the free-text `notes` written between staff and a
 * supplier. `customer` is a real membership role whose organisation IS the
 * workshop's, so organisation-scoped RLS could not tell the two apart.
 *
 * ⚠️ `*.spec.ts`, NOT `*.test.ts` — the package config collects only the former,
 * and a whole suite once ran ZERO tests while exiting 0. Read the COUNT.
 */

const ctx = (activeRole: string): TenantContext =>
  ({
    tenantId: 't', organizationId: 'o', branchId: null,
    userId: 'u', activeRole, correlationId: 'c',
  }) as TenantContext;

function makeService() {
  // Throws the moment it is entered, so a gate placed AFTER the SELECT — which
  // would still 403 having already read the supplier's prices — fails here
  // rather than passing.
  const withTenant = vi.fn(async () => {
    throw new Error('withTenant was entered — the gate ran too late, or not at all');
  });
  return { svc: new SupplierRequestService({ withTenant } as never), withTenant };
}

describe('the parts-request book is the workshop’s, not a customer’s', () => {
  it('REFUSES a customer, without touching the database', async () => {
    const { svc, withTenant } = makeService();
    await expect(svc.listForWorkshop(ctx('customer'))).rejects.toBeInstanceOf(ForbiddenException);
    expect(withTenant).not.toHaveBeenCalled();
  });

  it('names what the refused customer CAN reach', async () => {
    const { svc } = makeService();
    await expect(svc.listForWorkshop(ctx('customer'))).rejects.toThrow(/your own pages/i);
  });

  it('refuses the other non-staff roles that share this tenancy', async () => {
    const { svc } = makeService();
    for (const role of ['supplier_user', 'fleet_manager', 'insurance_assessor', '']) {
      await expect(svc.listForWorkshop(ctx(role)), role || '(empty)').rejects.toBeInstanceOf(
        ForbiddenException,
      );
    }
  });

  it('admits every workshop staff role — the gate is not a wall', async () => {
    // Without this control a check that refused EVERYBODY would pass all three
    // negatives above and take the screen away from the storekeeper who uses it.
    const { svc, withTenant } = makeService();
    for (const role of WORKSHOP_STAFF_ROLES) {
      withTenant.mockClear();
      await expect(svc.listForWorkshop(ctx(role))).rejects.toThrow(/withTenant was entered/);
      expect(withTenant, role).toHaveBeenCalledTimes(1);
    }
  });

  it('is WIDER than the write list, deliberately', async () => {
    // `MAY_ASK` excludes the technician and the cashier from RAISING a request.
    // They may still read what has been ordered — a narrower read would be a
    // different rule, and it is not the one being fixed here.
    const { svc, withTenant } = makeService();
    for (const role of ['technician', 'cashier', 'quality_control_inspector']) {
      withTenant.mockClear();
      await expect(svc.listForWorkshop(ctx(role))).rejects.toThrow(/withTenant was entered/);
      expect(withTenant, role).toHaveBeenCalledTimes(1);
    }
    await expect(
      svc.create(ctx('technician'), { supplierId: 's', partDescription: 'x', quantity: 1 }),
    ).rejects.toThrow(/may not raise a parts request/);
  });
});

/**
 * DRIFT + THE ASYMMETRY ITSELF. The service is the first line of defence; the
 * RLS policy is the last (CLAUDE.md §7). 059 wrote the `<> 'customer'` clause
 * into its INSERT and UPDATE policies and omitted it from SELECT, so this reads
 * the migration text rather than restating what it is believed to say.
 */
describe('migration 062 closes the SELECT policy 059 left open', () => {
  function migration(name: string): string {
    let dir = resolve(__dirname);
    let sqlPath = '';
    for (let i = 0; i < 8 && sqlPath === ''; i += 1) {
      const candidate = join(dir, `infrastructure/migrations/${name}`);
      if (existsSync(candidate)) sqlPath = candidate;
      dir = dirname(dir);
    }
    expect(sqlPath, `could not locate ${name}`).not.toBe('');
    return readFileSync(sqlPath, 'utf8');
  }

  const SQL_059 = () => migration('059_supplier_requests.sql');
  const SQL_062 = () => migration('062_supplier_request_select_excludes_customer.sql');

  it('pins the defect: 059’s SELECT policy has no customer clause', () => {
    // If somebody ever "fixes" 059 in place this fails, which is the point —
    // an applied migration is checksummed and must not change.
    const select = SQL_059().split('CREATE POLICY supplier_request_select')[1]!.split(');')[0]!;
    expect(select).not.toContain("current_role_name() <> 'customer'");
    // …while both writes carry it, which is what makes the omission accidental
    // rather than a decision.
    expect(SQL_059()).toContain("AND identity.current_role_name() <> 'customer'\n      AND status = 'new')");
  });

  /**
   * ⚠️ COMMENT LINES ARE STRIPPED FIRST, and that is not a convenience. The
   * file's header quotes `supplier_request_insert`/`_update` while explaining
   * which clause was copied from them, so a naive substring search over the
   * whole file would fail on the PROSE and say the migration touched policies
   * it does not touch. What is asserted is what Postgres executes.
   */
  function statementsOf(sql: string): string {
    return sql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
  }

  it('replaces ONLY that policy, and adds exactly the missing clause', () => {
    const sql = statementsOf(SQL_062());
    expect(sql).toContain('DROP POLICY IF EXISTS supplier_request_select ON parts.supplier_requests');
    expect(sql).toContain('CREATE POLICY supplier_request_select ON parts.supplier_requests FOR SELECT');
    expect(sql).toContain("identity.current_role_name() <> 'customer'");
    // Nothing else may move. A migration that also touched the table, the
    // grants or the other two policies would be a second change hiding inside
    // a security fix.
    for (const forbidden of [
      'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'GRANT ', 'REVOKE ',
      'supplier_request_insert', 'supplier_request_update', 'CREATE INDEX',
    ]) {
      expect(sql, forbidden).not.toContain(forbidden);
    }
    // It is one transaction, so a half-applied policy swap cannot exist.
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
  });

  it('PRESERVES the platform-admin and supplier arms verbatim', () => {
    // 🔴 The supplier arm is the whole of `listForSupplier`'s result. Dropping
    // it, or AND-ing the customer clause onto it, would empty every supplier's
    // inbox — and would look like a tightening rather than an outage.
    const sql = statementsOf(SQL_062());
    expect(sql).toContain('identity.is_platform_admin()');
    expect(sql).toContain('parts.current_user_supplies(supplier_id)');
    // The clause belongs to the tenant/organisation arm only.
    const policy = sql.split('FOR SELECT USING (')[1]!.split(');')[0]!;
    const supplierArm = policy.split('OR parts.current_user_supplies')[1]!;
    expect(supplierArm).not.toContain('current_role_name');
  });

  it('is a NEW file, because applied migrations are checksummed', () => {
    // 059 is unchanged above; this asserts the fix went to the next number.
    expect(SQL_062()).toContain('062');
  });
});
