import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { OperationsController } from './operations.controller';
import type { OperationsService, OperationsReport } from './operations.service';
import type { AuthenticatedRequest } from '../auth/tenant.guard';
import { ROLE_PERMISSIONS } from '../authz/permission-matrix';

/**
 * The same reasoning as `security.controller.spec.ts`, and it applies for the
 * same measured reason.
 *
 * The browser run drives a technician at `home/operations-dashboard` and finds
 * no report — but the layer that refuses is the NAVIGATION GATE, because the
 * route is outside a technician's tree. So the browser proves the page is
 * unreachable and proves NOTHING about the role check in this controller. If
 * that check were deleted, the browser run would still pass while anyone
 * holding a technician's token could read the deployment's dependency map
 * directly from the API.
 *
 * Hidden is not secure (CLAUDE.md §8), and there is no RLS underneath an
 * endpoint that talks to sockets.
 */

const report: OperationsReport = {
  generatedAt: '2026-08-01T00:00:00Z',
  probes: [],
  migrations: { applied: 29, latest: '029_pricing_write_scope', detail: '' },
  audit: { total: 0, last24h: 0, detail: '' },
  counts: { up: 0, down: 0, degraded: 0, notConfigured: 0 },
};

/**
 * ⚠️ `hasPlatformGrant` DEFAULTS TO FALSE, and that default is the test.
 *
 * Every refusal case below calls `req(role)` with one argument, so each one
 * asserts the post-078 world: a role name alone, including
 * `platform_administrator` itself, buys nothing on this endpoint. Only a call
 * that passes `true` — i.e. a user with an un-revoked row in
 * `identity.platform_administrators` — gets in.
 */
function req(activeRole: string, hasPlatformGrant = false): AuthenticatedRequest {
  return {
    tenantContext: {
      tenantId: '11111111-1111-1111-1111-111111111111',
      organizationId: 'aaaaaaaa-0000-0000-0000-000000000001',
      branchId: null,
      userId: '00000000-0000-0000-0000-0000000000ff',
      activeRole,
      hasPlatformGrant,
      correlationId: 'spec',
    },
  } as AuthenticatedRequest;
}

function controller() {
  const run = vi.fn(async () => report);
  return { ctrl: new OperationsController({ report: run } as unknown as OperationsService), run };
}

describe('OperationsController', () => {
  it('serves the operations report to a platform administrator', async () => {
    const { ctrl, run } = controller();
    await expect(ctrl.report(req('platform_administrator', true))).resolves.toBe(report);
    expect(run).toHaveBeenCalledOnce();
  });

  for (const role of [
    'technician',
    'workshop_owner',
    'workshop_manager',
    'reception_staff',
    'workshop_supervisor',
    'cashier',
    'customer',
    'supplier_user',
    '',
    // The database's `admin` GUC alias — an alias, not an identity. See the
    // note in security.controller.spec.ts.
    'admin',
  ]) {
    it(`REFUSES "${role || '(no role)'}" and runs no probe at all`, async () => {
      const { ctrl, run } = controller();
      await expect(ctrl.report(req(role))).rejects.toBeInstanceOf(ForbiddenException);
      // 🔴 The probes must not run. They open sockets to every dependency, so a
      // refusal that probes first turns this endpoint into an unauthenticated
      // way to make the server connect outward on demand.
      expect(run).not.toHaveBeenCalled();
    });
  }

  it('🔴 NO ROLE NAME ADMITS ANYONE — not even platform_administrator', async () => {
    // Inverted by migration 078. The old version derived its admitted set from
    // `permissionsForRole` and therefore asserted the very defect 077 left open
    // in the API: a membership `role_name` conferring authority over every
    // tenant. This endpoint runs unscoped probes and reads the migration ledger
    // through `queryWithoutTenant`, so there is no row-level security beneath it
    // and this check IS the enforcement.
    for (const role of Object.keys(ROLE_PERMISSIONS)) {
      const { ctrl } = controller();
      await expect(ctrl.report(req(role))).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('🟢 an un-revoked GRANT admits, and only while the role is the platform one', async () => {
    const admitted = controller();
    await expect(admitted.ctrl.report(req('platform_administrator', true))).resolves.toBe(report);

    // A granted administrator acting as someone else is acting as someone else.
    const downgraded = controller();
    await expect(
      downgraded.ctrl.report(req('workshop_owner', true)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
