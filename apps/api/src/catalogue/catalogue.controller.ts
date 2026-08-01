import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserGuard, type UserRequest } from '../auth/user.guard';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import { DB_PLATFORM_ADMIN_ROLE_NAMES } from '../authz/permission-matrix';
import { SupplierCatalogueService } from './supplier-catalogue.service';
import { DirectoryService } from './directory.service';

/**
 * SUPPLIER-side catalogue management — Slice B.
 *
 * ⚠️ `UserGuard`, NOT `TenantGuard`, for the same reason `MarketplaceController`
 * uses it: a supplier is a `catalogue.suppliers` row with `catalogue.supplier_users`
 * members, and holds no tenant, organisation or branch. `TenantGuard` would 401
 * every supplier — `resolveTenantContext` has no membership to resolve for them.
 *
 * The safety argument is unchanged: a request authenticated here never receives
 * a tenant context, so `withUser` leaves `app.tenant_id` unset and every
 * tenant-owned table returns zero rows. It also leaves `app.current_role` unset,
 * which is what keeps these routes on the MEMBERSHIP policies and away from the
 * administrator ones.
 */
@Controller('catalogue')
@UseGuards(UserGuard)
export class SupplierCatalogueController {
  constructor(private readonly catalogue: SupplierCatalogueService) {}

  /** Apply to be listed. Anyone signed in may; nothing becomes public. */
  @Post('suppliers')
  apply(@Req() req: UserRequest, @Body() body: Record<string, unknown>) {
    return this.catalogue.apply(req.appUserId, body ?? {});
  }

  /** The suppliers this user may act for. */
  @Get('suppliers')
  mine(@Req() req: UserRequest) {
    return this.catalogue.mySuppliers(req.appUserId);
  }

  @Patch('suppliers/:id')
  updateSupplier(
    @Req() req: UserRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.catalogue.updateSupplier(req.appUserId, id, body ?? {});
  }

  @Get('suppliers/:id/parts')
  listParts(@Req() req: UserRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalogue.listParts(req.appUserId, id);
  }

  @Post('suppliers/:id/parts')
  createPart(
    @Req() req: UserRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.catalogue.createPart(req.appUserId, id, body ?? {});
  }

  @Patch('parts/:id')
  updatePart(
    @Req() req: UserRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.catalogue.updatePart(req.appUserId, id, body ?? {});
  }

  @Delete('parts/:id')
  deletePart(@Req() req: UserRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalogue.deletePart(req.appUserId, id);
  }

  @Get('parts/:id/fitments')
  listFitments(@Req() req: UserRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalogue.listFitments(req.appUserId, id);
  }

  @Post('parts/:id/fitments')
  addFitment(
    @Req() req: UserRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.catalogue.addFitment(req.appUserId, id, body ?? {});
  }

  @Delete('fitments/:id')
  removeFitment(@Req() req: UserRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalogue.removeFitment(req.appUserId, id);
  }

  /** Part categories, for the form. */
  @Get('categories')
  categories(@Req() req: UserRequest) {
    return this.catalogue.categories(req.appUserId);
  }
}

/**
 * ADMINISTRATOR-side catalogue decisions — publication and verification.
 *
 * ⚠️ `TenantGuard`, AND THAT IS THE POINT RATHER THAN A COPIED HABIT. The
 * administrator's authority is their ROLE, and the ONLY code path that sets
 * `app.current_role` is `tenantSessionStatements`, which runs inside
 * `withTenant`. On `UserGuard` these endpoints would authenticate perfectly,
 * return 200, and change NOTHING — the policies would not match and an UPDATE
 * affecting zero rows raises no error. That is precisely the failure migration
 * 025 was written to fix, and it would reappear here silently.
 *
 * ⚠️ THE ROLE IS CHECKED IN THE APPLICATION AS WELL AS IN POSTGRES. Not because
 * the policy is insufficient — it is the enforcement point and denies
 * independently — but because without this check a workshop technician calling
 * these routes would get 404 "not found, or not permitted" on every row, which
 * reads as a broken feature rather than as a refusal. CLAUDE.md §8: hidden is
 * not secure, and neither is confusing.
 */
@Controller('admin/catalogue')
@UseGuards(TenantGuard)
export class AdminCatalogueController {
  constructor(private readonly catalogue: SupplierCatalogueService) {}

  private assertAdmin(req: AuthenticatedRequest): void {
    // Compared against the SAME list the SQL predicate uses, which a drift test
    // pins to migration 025. Restating the strings here would let the two
    // separate again — the original defect.
    if (!DB_PLATFORM_ADMIN_ROLE_NAMES.includes(req.tenantContext.activeRole)) {
      throw new ForbiddenException(
        'publishing to the public marketplace is a platform administrator decision',
      );
    }
  }

  /** Everything awaiting a decision: unpublished suppliers and unpublished parts. */
  @Get('review-queue')
  queue(@Req() req: AuthenticatedRequest) {
    this.assertAdmin(req);
    return this.catalogue.reviewQueue(req.tenantContext);
  }

  @Patch('suppliers/:id/publication')
  setSupplierPublication(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { published?: unknown; verified?: unknown },
  ) {
    this.assertAdmin(req);
    return this.catalogue.setSupplierPublication(
      req.tenantContext,
      id,
      Boolean(body?.published),
      body?.verified === undefined ? undefined : Boolean(body.verified),
    );
  }

  @Patch('parts/:id/publication')
  setPartPublication(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { published?: unknown },
  ) {
    this.assertAdmin(req);
    return this.catalogue.setPartPublication(req.tenantContext, id, Boolean(body?.published));
  }
}

/**
 * The workshop's own public directory listing — Slice C.
 *
 * ⚠️ `TenantGuard`, because the predicate is the ORGANIZATION and the ROLE, and
 * both reach Postgres only through `withTenant`. On `UserGuard` these routes
 * would authenticate, return 200, and change nothing.
 *
 * ⚠️ THE WORKSHOP PUBLISHES ITSELF, unlike the parts catalogue where an
 * administrator approves. A directory entry is a workshop's own consented
 * description of itself — requiring approval to say "we are here, this is our
 * phone number" would make the directory unfillable. An administrator can still
 * withdraw an abusive listing through `admin_write`.
 */
@Controller('directory')
@UseGuards(TenantGuard)
export class DirectoryController {
  constructor(private readonly directory: DirectoryService) {}

  /** The listing plus the profile values a first-time form should offer. */
  @Get('listing')
  describe(@Req() req: AuthenticatedRequest) {
    return this.directory.describe(req.tenantContext);
  }

  /** Save the consented fields. Deliberately does NOT change publication. */
  @Patch('listing')
  save(@Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return this.directory.save(req.tenantContext, body ?? {});
  }

  @Patch('listing/publication')
  setPublication(
    @Req() req: AuthenticatedRequest,
    @Body() body: { published?: unknown },
  ) {
    return this.directory.setPublication(req.tenantContext, Boolean(body?.published));
  }
}
