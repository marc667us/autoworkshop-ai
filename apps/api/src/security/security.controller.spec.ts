import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { SecurityController } from './security.controller';
import type { SecurityPostureService } from './security-posture.service';
import type { AuthenticatedRequest } from '../auth/tenant.guard';
import { PERMISSIONS, ROLE_PERMISSIONS, permissionsForRole } from '../authz/permission-matrix';

/**
 * 🔴 THIS FILE EXISTS BECAUSE THE BROWSER RUN COULD NOT PROVE WHAT IT LOOKED
 * LIKE IT PROVED.
 *
 * `verify-security-hub.mjs` drives a technician at the Security page and
 * confirms they see no report. That check passes — but the log says which layer
 * refused, and the layer was the NAVIGATION GATE: the route is outside a
 * technician's tree, so admin-web 404s it and the API is never called at all.
 *
 * So the browser run proves the page is unreachable. It proves NOTHING about
 * `assertAdmin`, and if that check were deleted the browser run would still pass
 * — while anyone holding a technician's token could call the endpoint directly
 * and receive a list of every unprotected table in the database.
 *
 * A route that is merely hidden is not protected (CLAUDE.md §8). This file
 * tests the refusal at the layer that actually enforces it.
 *
 * ⚠️ AND THERE IS NO RLS UNDERNEATH THIS ONE. Everywhere else in this codebase
 * an application-layer check is a courtesy over a database policy that denies
 * independently. `pg_catalog` has no policies and no tenant column, so this
 * check IS the enforcement — there is no third layer to catch a mistake.
 */

const posture = { generatedAt: '2026-08-01T00:00:00Z', schemas: [], controls: [], counts: { pass: 0, warn: 0, fail: 0 } };

function req(activeRole: string): AuthenticatedRequest {
  return {
    tenantContext: {
      tenantId: '11111111-1111-1111-1111-111111111111',
      organizationId: 'aaaaaaaa-0000-0000-0000-000000000001',
      branchId: null,
      userId: '00000000-0000-0000-0000-0000000000ff',
      activeRole,
      correlationId: 'spec',
    },
  } as AuthenticatedRequest;
}

function controller() {
  const audit = vi.fn(async () => posture);
  const svc = { audit } as unknown as SecurityPostureService;
  return { ctrl: new SecurityController(svc), audit };
}

describe('SecurityController', () => {
  it('serves the posture report to a platform administrator', async () => {
    const { ctrl, audit } = controller();
    await expect(ctrl.getPosture(req('platform_administrator'))).resolves.toBe(posture);
    expect(audit).toHaveBeenCalledOnce();
  });

  // Every role in the product that is NOT an administrator. Enumerated rather
  // than sampled: "a technician is refused" would still pass if a manager or a
  // cashier had been quietly admitted.
  const nonAdmin = [
    'technician',
    'workshop_owner',
    'workshop_manager',
    'reception_staff',
    'workshop_supervisor',
    'cashier',
    'customer',
    'supplier_user',
    '',
    // 🔴 THE ROLE CODEX CAUGHT. `admin` is the DATABASE's compatibility alias
    // (migration 025's SQL predicate accepts it because seed scripts and psql
    // set that GUC). It is not an identity, it holds no permissions, and it
    // appears in no navigation tree. Gating on DB_PLATFORM_ADMIN_ROLE_NAMES —
    // which this controller did first — admitted it, making the API wider than
    // the UI on an endpoint with no RLS beneath it.
    'admin',
  ];

  for (const role of nonAdmin) {
    it(`REFUSES "${role || '(no role)'}" and does not run the audit at all`, async () => {
      const { ctrl, audit } = controller();
      await expect(ctrl.getPosture(req(role))).rejects.toBeInstanceOf(ForbiddenException);
      // 🔴 The audit must not even run. A refusal that computes the report first
      // and then throws still reads the catalog, and any future change that
      // logged or cached the result would leak it.
      expect(audit).not.toHaveBeenCalled();
    });
  }

  it('admits exactly the roles holding platform.admin, and no others', async () => {
    // Derived from the permission model rather than restated, so a role granted
    // `platform.admin` later is covered without editing this test — and a role
    // that LOSES it starts failing here, which is the direction that matters.
    const admins = Object.keys(ROLE_PERMISSIONS).filter((r) =>
      permissionsForRole(r).includes(PERMISSIONS.platformAdmin),
    );
    expect(admins.length).toBeGreaterThan(0);
    for (const role of admins) {
      const { ctrl } = controller();
      await expect(ctrl.getPosture(req(role))).resolves.toBe(posture);
    }
    // And the gate is genuinely narrow: not every role is an administrator.
    expect(admins.length).toBeLessThan(Object.keys(ROLE_PERMISSIONS).length);
  });

  it('names the reason in the refusal, so it is not mistaken for a broken page', async () => {
    const { ctrl } = controller();
    await expect(ctrl.getPosture(req('technician'))).rejects.toThrow(/platform administrators/i);
  });
});
