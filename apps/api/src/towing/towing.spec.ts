import { ForbiddenException } from '@nestjs/common';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '../tenancy/tenant-context';
import { assertTowingStaff, isTowingStaff, TOWING_ROLES } from './towing-roles';
import {
  DRIVER_STATUSES,
  INCIDENT_KINDS,
  INCIDENT_STATUSES,
  RECOVERY_STATUSES,
  REQUEST_PRIORITIES,
  REQUEST_STATUSES,
  VEHICLE_STATUSES,
  VEHICLE_TYPES,
} from './towing.service';

const ctxFor = (activeRole: string): TenantContext => ({
  tenantId: '11111111-1111-1111-1111-111111111111',
  organizationId: '22222222-2222-2222-2222-222222222222',
  branchId: null,
  userId: '33333333-3333-3333-3333-333333333333',
  activeRole,
  hasPlatformGrant: false,
  correlationId: 'test',
});

describe('who may use the towing desk', () => {
  it('admits the workspace’s own role', () => {
    // The check that would have failed if `assertWorkshopStaff` had been reused:
    // `towing_operator` is in NON_WORKSHOP_ROLES, so the workshop helper refuses
    // the one role §52 is written for.
    expect(isTowingStaff(ctxFor('towing_operator'))).toBe(true);
  });

  it('admits the owner, the manager and a platform administrator', () => {
    for (const role of ['workshop_owner', 'workshop_manager', 'platform_administrator']) {
      expect(isTowingStaff(ctxFor(role))).toBe(true);
    }
  });

  it('🔴 refuses a customer — since 061 that is any stranger who enrolled', () => {
    expect(isTowingStaff(ctxFor('customer'))).toBe(false);
    expect(() => assertTowingStaff(ctxFor('customer'), 'The driver roster')).toThrow(
      ForbiddenException,
    );
  });

  it('refuses workshop-floor roles that have no dispatch duty', () => {
    for (const role of ['technician', 'reception_staff', 'storekeeper', 'cashier']) {
      expect(isTowingStaff(ctxFor(role))).toBe(false);
    }
  });

  it('refuses the other workspaces’ roles', () => {
    for (const role of ['supplier_owner', 'fleet_administrator', 'insurance_assessor']) {
      expect(isTowingStaff(ctxFor(role))).toBe(false);
    }
  });

  it('gives an UNKNOWN role nothing — a typo must remove access, not grant it', () => {
    expect(isTowingStaff(ctxFor('towing-operator'))).toBe(false);
    expect(isTowingStaff(ctxFor(''))).toBe(false);
  });

  it('🔴 names a reachable alternative in the refusal', () => {
    // A rule whose escape hatch does not exist is a wall, and walls are the
    // most expensive defect class recorded in this repository.
    try {
      assertTowingStaff(ctxFor('customer'), 'Towing invoices');
      expect.unreachable('should have refused');
    } catch (e) {
      const message = (e as ForbiddenException).message;
      expect(message).toContain('Towing invoices');
      expect(message).toMatch(/job card|your own/i);
    }
  });

  it('every name in TOWING_ROLES is a real role in the precedence list', async () => {
    const { ROLE_PRECEDENCE } = await import('../authz/permission-matrix');
    for (const role of TOWING_ROLES) {
      expect(ROLE_PRECEDENCE).toContain(role);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 🔴 THE VOCABULARIES IN TYPESCRIPT MUST EQUAL THE ONES IN POSTGRES.
 *
 * This repository has already shipped two services that were each green and
 * never met — Python `snake_case` against TypeScript `camelCase` — because each
 * suite asserted its own convention and nothing tested the wire between them.
 * The same shape is available here: migration 074 spells the allowed statuses
 * inside CHECK constraints, `towing.service.ts` spells them again in `as const`
 * arrays, and a value added to one and not the other fails at runtime as a
 * constraint violation on a screen nobody tested with that value.
 *
 * So the constraint is READ FROM THE DATABASE and compared. Nothing here trusts
 * a copy of the vocabulary; the database is the authority.
 *
 * ⚠️ NO DATABASE IS A **SKIP**, NOT A PASS AND NOT A FAILURE — three states,
 * never two. Asserting reachability itself is what turned `Release` red on
 * 2026-08-08 for the environmental reason that CI has no Postgres.
 *
 * ⚠️ AND THE SKIP IS A RUNTIME `ctx.skip()`, NOT `it.runIf(...)`. `runIf` is
 * evaluated at COLLECTION time, before `beforeAll` has connected, so nine tests
 * once reported "skipped" against a perfectly healthy database.
 * ══════════════════════════════════════════════════════════════════════════ */

const CONN =
  process.env.DATABASE_URL ??
  `postgres://${process.env.POSTGRES_USER ?? 'autoworkshop'}:${
    process.env.POSTGRES_PASSWORD ?? 'change_me_locally'
  }@${process.env.POSTGRES_HOST ?? 'localhost'}:${process.env.POSTGRES_PORT ?? 5432}/${
    process.env.POSTGRES_DB ?? 'autoworkshop'
  }`;

let pool: Pool | undefined;
let reachable = false;

beforeAll(async () => {
  try {
    pool = new Pool({ connectionString: CONN, connectionTimeoutMillis: 3000, max: 1 });
    await pool.query('SELECT 1');
    reachable = true;
  } catch {
    reachable = false;
    // Loud, and it names what was NOT proven rather than passing quietly.
    console.warn(
      '\n⚠️  towing.spec: no Postgres — the vocabulary checks are SKIPPED.\n' +
        '   NOT proven: that the TypeScript status lists match migration 074’s\n' +
        '   CHECK constraints. A drift between them fails only at runtime.\n',
    );
  }
});

afterAll(async () => {
  await pool?.end();
});

const dbIt = (name: string, fn: () => Promise<void>) =>
  it(name, async (ctx) => {
    if (!reachable) return ctx.skip();
    await fn();
  });

/** The literals inside a CHECK constraint, e.g. `status IN ('a','b')` → [a,b]. */
async function checkValues(table: string, column: string): Promise<string[]> {
  const res = await pool!.query(
    `SELECT pg_get_constraintdef(k.oid) AS def
       FROM pg_constraint k
       JOIN pg_class c ON c.oid = k.conrelid
      WHERE k.contype = 'c'
        AND c.relnamespace = 'towing'::regnamespace
        AND c.relname = $1
        AND pg_get_constraintdef(k.oid) LIKE '%' || $2 || '%ANY (ARRAY[%'`,
    [table, column],
  );
  const def = (res.rows[0] as { def: string } | undefined)?.def;
  if (!def) throw new Error(`no CHECK constraint found on towing.${table}.${column}`);
  // `.filter(Boolean)` rather than `!`: a capture group that did not match is a
  // real possibility if the constraint is ever reformatted, and asserting it
  // away would turn a changed constraint into `undefined` inside the comparison
  // instead of a visible mismatch.
  return [...def.matchAll(/'([a-z_0-9]+)'::text/g)]
    .map((m) => m[1])
    .filter((v): v is string => typeof v === 'string');
}

describe('the TypeScript vocabularies equal migration 074’s CHECK constraints', () => {
  const cases: Array<[string, string, readonly string[]]> = [
    ['requests', 'status', REQUEST_STATUSES],
    ['requests', 'priority', REQUEST_PRIORITIES],
    ['recoveries', 'status', RECOVERY_STATUSES],
    ['drivers', 'status', DRIVER_STATUSES],
    ['recovery_vehicles', 'status', VEHICLE_STATUSES],
    ['recovery_vehicles', 'vehicle_type', VEHICLE_TYPES],
    ['incidents', 'kind', INCIDENT_KINDS],
    ['incidents', 'status', INCIDENT_STATUSES],
  ];

  for (const [table, column, ts] of cases) {
    dbIt(`towing.${table}.${column}`, async () => {
      const sql = await checkValues(table, column);
      expect([...sql].sort()).toEqual([...ts].sort());
    });
  }
});
