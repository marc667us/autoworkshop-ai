import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import { validatedBody } from '../common/validation/validated-body';
import { ServiceRequestService } from './service-request.service';
import {
  ConvertServiceRequestBody,
  CreateServiceRequestBody,
  DecideServiceRequestBody,
} from './reception.schemas';

/**
 * `POST /service-requests` — the owner's value chain, step 5, and the first
 * write in this API a customer makes at a workshop they do not belong to.
 *
 * ⚠️ EVERY RULE LIVES IN `ServiceRequestService`, not here. A controller route
 * and a Next server action are both public HTTP endpoints, so a rule written in
 * the screen protects nothing (CLAUDE.md §8). What is enforced there is
 * enforced again by RLS in `058_service_requests.sql`.
 */
@Controller('service-requests')
@UseGuards(TenantGuard)
export class ServiceRequestController {
  constructor(private readonly requests: ServiceRequestService) {}

  /**
   * The caller's OWN requests. Deliberately the default listing: this endpoint
   * is reached by customers far more often than by staff, and a default that
   * returned the workshop's inbox would be the dangerous way round.
   */
  @Get()
  listMine(@Req() req: AuthenticatedRequest) {
    return this.requests.listMine(req.tenantContext);
  }

  /**
   * Reception's inbox. A SEPARATE PATH rather than a query flag on the listing
   * above, so "my requests" and "requests sent to my workshop" can never be
   * confused by a caller that forgot a parameter — the failure would be silent
   * and would leak.
   */
  @Get('inbox')
  inbox(@Req() req: AuthenticatedRequest, @Query('status') status?: string) {
    return this.requests.listForWorkshop(req.tenantContext, status);
  }

  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    // A PIPE, not a call on the body — `validatedBody` returns a Nest
    // PipeTransform, so it belongs inside `@Body(...)`. Passing the body to it
    // typechecks as a function call and validates NOTHING at runtime.
    @Body(validatedBody(CreateServiceRequestBody)) body: CreateServiceRequestBody,
  ) {
    return this.requests.create(req.tenantContext, body);
  }

  @Patch(':id/decision')
  decide(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validatedBody(DecideServiceRequestBody)) body: DecideServiceRequestBody,
  ) {
    return this.requests.decide(req.tenantContext, id, body);
  }

  /**
   * Turn an accepted request into a job card — value chain step 8.
   *
   * A SEPARATE route from `/decision`, not another status on it, because this
   * one has a side effect outside the request: it opens real work. Folding it
   * into the decision endpoint would make a triage click and a job-card creation
   * indistinguishable in the audit trail.
   */
  @Post(':id/convert')
  convert(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validatedBody(ConvertServiceRequestBody)) body: ConvertServiceRequestBody,
  ) {
    return this.requests.convert(req.tenantContext, id, body);
  }
}
