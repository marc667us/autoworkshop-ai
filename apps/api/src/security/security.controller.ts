import { Controller, ForbiddenException, Get, Req, UseGuards } from '@nestjs/common';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import { PERMISSIONS, permissionsForContext } from '../authz/permission-matrix';
import { SecurityPostureService } from './security-posture.service';

/**
 * The Security Hub — platform administrators only.
 *
 * Serves the admin workspace's existing `security-and-operations/security`
 * route. No navigation change was needed: `packages/navigation` has carried that
 * entry since the approved trees were built, gated on `platform.admin`.
 *
 * ⚠️ `TenantGuard` RATHER THAN `UserGuard`, and here the reason is different
 * from the catalogue controllers. There the guard mattered because `withTenant`
 * is the only path that sets `app.current_role`, so the wrong guard produced a
 * cheerful 200 that changed nothing. This controller does not write, and does
 * not read tenant data at all — it reads `pg_catalog`. `TenantGuard` is used
 * because it is what resolves an ACTIVE ROLE from proved memberships, and the
 * active role is the whole authorization decision below.
 *
 * ⚠️ THE ROLE CHECK IS THE ONLY THING PROTECTING THIS DATA. Everywhere else in
 * this codebase an application-layer check is a courtesy and RLS is the
 * enforcement — a technician who slips past a controller still gets zero rows.
 * That is NOT true here. `pg_catalog` has no policies and no tenant column, so
 * there is no second line of defence underneath this method. It is the reason
 * the check is written as a hard refusal rather than as a filter, and the reason
 * `security.controller.spec.ts` asserts a non-administrator is refused rather
 * than merely served less.
 *
 * What leaks if it fails is not customer data — it is a map of which tables are
 * unprotected. That is an attacker's shopping list, which is precisely why
 * `05.txt` §32 restricts this workspace to "authorized administrative, security
 * and operational users".
 */
@Controller('security')
@UseGuards(TenantGuard)
export class SecurityController {
  constructor(private readonly posture: SecurityPostureService) {}

  @Get('posture')
  async getPosture(@Req() req: AuthenticatedRequest) {
    // 🔴 GATED ON THE PERMISSION, **NOT** ON `DB_PLATFORM_ADMIN_ROLE_NAMES`.
    // This was written the other way first and Codex was right to reject it.
    //
    // That constant is the list of role names the SQL predicate in migration 025
    // accepts, and it deliberately includes the literal `admin` because seed
    // scripts, migrations and hand-run psql set that GUC. It is a DATABASE
    // compatibility alias, not an identity.
    //
    // Using it here made the API strictly MORE permissive than the navigation,
    // which gates on `platform.admin` — and `identity.memberships.role_name`
    // has no CHECK constraint (verified: the only constraint on that table is
    // on `status`), so a membership row carrying `role_name = 'admin'` is
    // insertable, would pass this check, and would appear in no navigation tree.
    // On an endpoint with row-level security beneath it that is survivable. This
    // endpoint reads `pg_catalog`, which has no policies, so this check IS the
    // enforcement and it must be the NARROWER of the two, never the wider.
    //
    // `permissionsForRole` returns `[]` for any name absent from
    // `ROLE_PERMISSIONS`, so it fails closed on an unknown role.
    if (!permissionsForContext(req.tenantContext).includes(PERMISSIONS.platformAdmin)) {
      throw new ForbiddenException(
        'the security posture report is restricted to platform administrators',
      );
    }
    return this.posture.audit();
  }
}
