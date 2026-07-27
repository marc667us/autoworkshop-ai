import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import { BranchService } from './branch.service';
import { MembershipService } from './membership.service';
import { UserService } from './user.service';

/**
 * Identity controllers — T-0003.
 *
 * Thin by design, exactly like `OrganizationController`: authenticate, resolve
 * tenant context via the guard, delegate. No business rule lives here, so an
 * MCP tool calling the same service gets identical behaviour — the property the
 * whole AI boundary rests on (`0.txt` §13, §26).
 *
 * Note what is NOT here: no endpoint accepts a `tenantId`. Tenant context comes
 * only from the validated token plus membership (`1.txt` §9), and adding such a
 * parameter would be the confused-deputy hole the design exists to prevent.
 */

@Controller('branches')
@UseGuards(TenantGuard)
export class BranchController {
  constructor(private readonly branches: BranchService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query('organizationId') organizationId?: string) {
    return this.branches.list(req.tenantContext, organizationId);
  }

  @Get(':id')
  findOne(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.branches.findById(req.tenantContext, id);
  }

  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body() body: { organizationId: string; name: string; location?: string; operatingHours?: string },
  ) {
    return this.branches.create(req.tenantContext, body);
  }
}

@Controller('users')
@UseGuards(TenantGuard)
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.users.list(req.tenantContext);
  }

  @Get(':id')
  findOne(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.users.findById(req.tenantContext, id);
  }
}

@Controller('memberships')
@UseGuards(TenantGuard)
export class MembershipController {
  constructor(private readonly memberships: MembershipService) {}

  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query('userId') userId?: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.memberships.list(req.tenantContext, { userId, organizationId });
  }

  @Post()
  grant(
    @Req() req: AuthenticatedRequest,
    @Body() body: { userId: string; organizationId: string; branchId?: string | null; roleName: string },
  ) {
    return this.memberships.grant(req.tenantContext, body);
  }

  /**
   * PATCH, not DELETE: a membership is never removed. Withdrawal is a status
   * transition that leaves the row and its audit trail intact, because
   * "was this person ever granted access?" must stay answerable.
   */
  @Patch(':id/status')
  withdraw(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { status: 'suspended' | 'revoked' },
  ) {
    return this.memberships.withdraw(req.tenantContext, id, body.status);
  }
}
