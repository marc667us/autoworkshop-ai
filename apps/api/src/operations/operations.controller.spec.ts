import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { OperationsController } from './operations.controller';
import type { OperationsService, OperationsReport } from './operations.service';
import type { AuthenticatedRequest } from '../auth/tenant.guard';
import { PERMISSIONS, ROLE_PERMISSIONS, permissionsForRole } from '../authz/permission-matrix';

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
  const run = vi.fn(async () => report);
  return { ctrl: new OperationsController({ report: run } as unknown as OperationsService), run };
}

describe('OperationsController', () => {
  it('serves the operations report to a platform administrator', async () => {
    const { ctrl, run } = controller();
    await expect(ctrl.report(req('platform_administrator'))).resolves.toBe(report);
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

  it('admits exactly the roles holding platform.admin', async () => {
    const admins = Object.keys(ROLE_PERMISSIONS).filter((r) =>
      permissionsForRole(r).includes(PERMISSIONS.platformAdmin),
    );
    expect(admins.length).toBeGreaterThan(0);
    for (const role of admins) {
      const { ctrl } = controller();
      await expect(ctrl.report(req(role))).resolves.toBe(report);
    }
    expect(admins.length).toBeLessThan(Object.keys(ROLE_PERMISSIONS).length);
  });
});
