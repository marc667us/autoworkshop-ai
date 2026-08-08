import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import { validatedBody } from '../common/validation/validated-body';
import { OrganizationRegistrationService } from './organization-registration.service';

/**
 * `/registrations` — the verification queue, and a registrant's own status.
 *
 * ⚠️ SEPARATE FROM `RegistrationController`, which is on `UserGuard` because
 * its callers belong nowhere yet. Everything here is the opposite: the queue is
 * read by a platform administrator acting in an organisation, and `mine` is
 * read by a registrant acting in the organisation they just created. Both need
 * a tenant context, so both are on `TenantGuard`.
 *
 * ⚠️ THERE IS NO ROUTE THAT CREATES A REGISTRATION. Rows are written only by
 * `identity.register_workshop` / `register_supplier`, and migration 069's
 * INSERT policy admits nothing else — it is keyed on
 * `in_registration_bootstrap()`, which is only true inside those functions. A
 * create route here would let somebody file a registration for a sign-up that
 * never happened.
 */

const DecisionBody = z.object({
  decision: z.enum(['approved', 'rejected']),
  // Optional in the schema, REQUIRED for a rejection in the service. The rule
  // lives there because it is conditional on another field, and expressing it
  // here would split one rule across two files.
  note: z.string().trim().max(1000).optional(),
});
type DecisionBody = z.infer<typeof DecisionBody>;

@Controller('registrations')
@UseGuards(TenantGuard)
export class OrganizationRegistrationController {
  constructor(private readonly registrations: OrganizationRegistrationService) {}

  /** The queue. Platform administrator only — asserted in the service. */
  @Get()
  async list(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('kind') kind?: string,
  ) {
    return this.registrations.list(req.tenantContext, { status, kind });
  }

  /**
   * The caller's OWN registration, so a waiting business can be told where it
   * stands rather than wondering why it is not on the map.
   *
   * ⚠️ MOUNTED BEFORE ANY `:id` ROUTE WOULD BE. Nest matches in declaration
   * order, so a `@Get(':id')` declared above this would swallow `/mine` and
   * `ParseUUIDPipe` would answer 400 for a path that is not a UUID. There is no
   * `:id` GET today; this note is here so adding one does not break it.
   */
  @Get('mine')
  async mine(@Req() req: AuthenticatedRequest) {
    return this.registrations.mine(req.tenantContext);
  }

  /** Approve or reject. Attributed to the caller, and it publishes. */
  @Post(':id/decision')
  async decide(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validatedBody(DecisionBody)) body: DecisionBody,
  ) {
    return this.registrations.decide(req.tenantContext, id, body.decision, body.note);
  }
}
