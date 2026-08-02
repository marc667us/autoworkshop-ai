import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import { validatedBody } from '../common/validation/validated-body';
import { OrganizationService } from './organization.service';
import { CreateOrganizationBody } from './organization.schemas';

/**
 * Thin by design.
 *
 * The controller authenticates, resolves tenant context (via the guard) and
 * delegates. Every business rule lives in OrganizationService, so an MCP tool
 * calling the same service gets the same rules — the property the whole AI
 * boundary depends on (`0.txt` §13, §26).
 */
@Controller('organizations')
@UseGuards(TenantGuard)
export class OrganizationController {
  constructor(private readonly organizations: OrganizationService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.organizations.list(req.tenantContext);
  }

  @Get(':id')
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.organizations.findById(req.tenantContext, id);
  }

  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(CreateOrganizationBody)) body: CreateOrganizationBody,
  ) {
    return this.organizations.create(req.tenantContext, body);
  }
}
