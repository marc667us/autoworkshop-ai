import { Controller, ForbiddenException, Get, Req, UseGuards } from '@nestjs/common';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import { PERMISSIONS, permissionsForContext } from '../authz/permission-matrix';
import { OperationsService } from './operations.service';

/**
 * The Operations Centre — platform administrators only.
 *
 * Serves the admin workspace's existing `home/operations-dashboard` route, which
 * `packages/navigation` has carried under `platform.admin` since the approved
 * trees were built. No navigation change; `05.txt` §2 prohibits one without
 * review.
 *
 * ⚠️ ADMINISTRATOR-ONLY EVEN THOUGH IT READS NO BUSINESS DATA, for the same
 * reason as the Security Hub: what it discloses is the SHAPE of the deployment.
 * "Redis is down", "the audit log has no events in 24 hours", "Keycloak is
 * serving the wrong realm" are the facts an attacker most wants and a technician
 * has no use for. `05.txt` §32 restricts this workspace to "authorized
 * administrative, security and operational users".
 *
 * ⚠️ AND THERE IS NO RLS UNDERNEATH THIS ONE EITHER. The probes talk to sockets
 * and read `pg_catalog`-adjacent metadata, so this role check is the only
 * enforcement — the same property `security.controller.ts` carries, tested the
 * same way in `operations.controller.spec.ts`.
 */
@Controller('operations')
@UseGuards(TenantGuard)
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get('report')
  async report(@Req() req: AuthenticatedRequest) {
    // Gated on the PERMISSION, not on `DB_PLATFORM_ADMIN_ROLE_NAMES` — the full
    // reasoning is in `security.controller.ts`, and it applies identically here:
    // that constant carries the database's `admin` compatibility alias, which
    // would make this endpoint wider than the navigation that fronts it, on a
    // route with no row-level security underneath. Fails closed on any unknown
    // role, because `permissionsForRole` returns `[]` for one.
    if (!permissionsForContext(req.tenantContext).includes(PERMISSIONS.platformAdmin)) {
      throw new ForbiddenException(
        'the operations report is restricted to platform administrators',
      );
    }
    return this.operations.report();
  }
}
