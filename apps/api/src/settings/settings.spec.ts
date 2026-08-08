import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SettingsService } from './settings.service';
import { WORKSHOP_STAFF_ROLES } from '../authz/workshop-roles';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * 🔴 TWO SETTINGS READS HAD NO ROLE ASSERTION AT ALL.
 *
 * Five reads in this service call `assertMayReadConfig`. `listOpeningHours` and
 * `listServiceCategories` called nothing, and the file's own comment said that
 * was deliberate "because they are published to the public profile anyway".
 * Neither query carries an `is_published` / `is_active` predicate, so what came
 * back was the DRAFT and DEACTIVATED catalogue — `indicative_price` and
 * `currency` per category, the workshop's internal price list — plus opening
 * hours it has not agreed to show anybody.
 *
 * Migration 061 made `customer` self-service, so "only a colleague could see
 * this" became "any signed-up stranger who enrolled at this workshop could see
 * this". RLS does not backstop it: 045's `org_select` is tenant + organisation
 * with no role clause, and a customer's active organisation IS the workshop's.
 *
 * ⚠️ `*.spec.ts`, NOT `*.test.ts` — the package config collects only the
 * former, and a whole suite once ran ZERO tests while exiting 0.
 */

const ctx = (activeRole: string): TenantContext =>
  ({
    tenantId: 't', organizationId: 'o', branchId: null,
    userId: 'u', activeRole, correlationId: 'c',
  }) as TenantContext;

function makeService() {
  // Throws the moment it is entered, so a gate placed AFTER the SELECT — which
  // would still 403 having already read the price list — fails here rather
  // than passing.
  const withTenant = vi.fn(async () => {
    throw new Error('withTenant was entered — the gate ran too late, or not at all');
  });
  const audit = { write: vi.fn() };
  return { svc: new SettingsService({ withTenant } as never, audit as never), withTenant };
}

describe('the workshop’s service catalogue is not a customer’s to read', () => {
  it('REFUSES a customer the service categories, without touching the database', async () => {
    const { svc, withTenant } = makeService();
    await expect(svc.listServiceCategories(ctx('customer'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(withTenant).not.toHaveBeenCalled();
  });

  it('REFUSES a customer the opening hours, without touching the database', async () => {
    const { svc, withTenant } = makeService();
    await expect(svc.listOpeningHours(ctx('customer'))).rejects.toBeInstanceOf(ForbiddenException);
    expect(withTenant).not.toHaveBeenCalled();
  });

  /** A refusal that names no alternative is a wall — the costliest defect here. */
  it('names where the published hours and services really are', async () => {
    const { svc } = makeService();
    await expect(svc.listOpeningHours(ctx('customer'))).rejects.toThrow(/public profile/i);
  });

  it('refuses the other roles that can share this organisation', async () => {
    const { svc } = makeService();
    for (const role of ['supplier_owner', 'fleet_administrator', 'towing_operator', '']) {
      await expect(
        svc.listServiceCategories(ctx(role)),
        role || '(empty)',
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  /**
   * ⚠️ THE CONTROL THAT STOPS THIS BEING A WALL. Without it a gate that refused
   * EVERYBODY would pass every negative above and take the booking screens away
   * from reception, who need the categories to book anything at all.
   */
  it('still admits every workshop staff role, reception included', async () => {
    const { svc, withTenant } = makeService();
    for (const role of WORKSHOP_STAFF_ROLES) {
      for (const call of [
        () => svc.listServiceCategories(ctx(role)),
        () => svc.listOpeningHours(ctx(role)),
      ]) {
        withTenant.mockClear();
        await expect(call(), role).rejects.toThrow(/withTenant was entered/);
        expect(withTenant, role).toHaveBeenCalledTimes(1);
      }
    }
  });

  /**
   * 🔴 THE QUALITY CONTROL INSPECTOR WAS LOCKED OUT BY A NAME THAT DOES NOT
   * EXIST. `MAY_READ_CONFIG` listed `quality_controller`; the role is
   * `quality_control_inspector`. Asserted here as well as in
   * `role-vocabulary.spec` because this is one of the six gates it silently
   * refused.
   */
  it('admits the quality control inspector', async () => {
    const { svc } = makeService();
    await expect(svc.listServiceCategories(ctx('quality_control_inspector'))).rejects.toThrow(
      /withTenant was entered/,
    );
  });
});

/**
 * DRIFT + BOTH LAYERS (CLAUDE.md §7). The service is the first line of defence
 * and produces a sentence a person can act on; the policy is the last and holds
 * even if a future caller forgets. This reads 045's and 066's TEXT rather than
 * restating what they are believed to say.
 */
describe('migration 066 closes the org_select policy 045 left open', () => {
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

  const SQL_045 = () => migration('045_workshop_settings.sql');
  const SQL_066 = () => migration('066_settings_reads_exclude_customer.sql');

  /** Comment lines carry role names in prose; what is asserted is what runs. */
  function statementsOf(sql: string): string {
    return sql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
  }

  it('pins the defect: 045’s org_select has tenant and organisation and no role', () => {
    // If somebody ever "fixes" 045 in place this fails, which is the point — an
    // applied migration is checksummed and must not change.
    const sql = statementsOf(SQL_045());
    // The policy is built by a `format()` over seven tables, so what is read is
    // the TEMPLATE between the CREATE and the `'org_select'` argument that
    // names it.
    const orgSelect = sql
      .split("'CREATE POLICY %I ON %s FOR SELECT USING '")[1]!
      .split("'org_select', t)")[0]!;
    expect(orgSelect).toContain('identity.current_organization_id()');
    expect(orgSelect).not.toContain('current_role_name');
  });

  it('replaces org_select on BOTH publishable tables, adding exactly the clause', () => {
    const sql = statementsOf(SQL_066());
    for (const table of ['core.service_categories', 'core.opening_hours']) {
      expect(sql).toContain(`DROP POLICY IF EXISTS org_select ON ${table}`);
      expect(sql).toContain(`CREATE POLICY org_select ON ${table} FOR SELECT USING`);
    }
    expect(sql.match(/current_role_name\(\) <> 'customer'/g) ?? []).toHaveLength(2);
    // One transaction, so a half-applied policy swap cannot exist.
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
  });

  /**
   * 🔴 `public_read` IS WHY THE FLAGS EXIST. It is what lets a stranger with no
   * tenant context read a workshop's published profile through
   * `GET /public/workshops/:organizationId/profile` — the only reader of these
   * two tables outside the workspace. Dropping or narrowing it would empty the
   * public landing page, and would look like a tightening rather than an outage.
   */
  it('does not touch public_read, the write policies, or anything structural', () => {
    const sql = statementsOf(SQL_066());
    for (const forbidden of [
      'public_read', 'org_insert', 'org_update', 'org_delete',
      'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'GRANT ', 'REVOKE ', 'CREATE INDEX',
      // The other five tables 045 covers are out of scope for this fix.
      'core.approval_limits', 'core.document_templates', 'core.notification_preferences',
      'core.workflow_rules', 'core.integrations',
    ]) {
      expect(sql, forbidden).not.toContain(forbidden);
    }
  });

  it('is a NEW file, because applied migrations are checksummed', () => {
    expect(SQL_066()).toContain('066');
  });
});
