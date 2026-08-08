import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import { validatedBody } from '../common/validation/validated-body';
import { LEAD_STATUSES, LeadsService } from './leads.service';

/**
 * `GET /leads` — the read endpoint `crm.leads` was missing.
 *
 * ⚠️ THERE IS NO `POST /leads`, AND THAT IS DELIBERATE. A lead is created by
 * applying an APPROVED lead proposal (`POST /agents/proposals/:id/apply-leads`),
 * which reads the candidates from the stored proposal rather than from a request
 * body. A create route taking a body would let anybody file a lead with no
 * traceable origin, and `source_url` being NOT NULL is precisely the constraint
 * that keeps this table defensible to the businesses it describes.
 *
 * ⚠️ AND THERE IS NO DELETE. `crm.leads` grants only SELECT, INSERT and UPDATE
 * to `autoworkshop_app` (064), so a delete route could not work even if it were
 * written. 064's header flags a deletion path as a legal decision — Ghana's Data
 * Protection Act 2012 applies to this market — and it stays flagged, not built.
 * Rejecting a lead is the reachable alternative and it is one PATCH away.
 */

const StatusBody = z.object({
  status: z.enum(LEAD_STATUSES),
});
type StatusBody = z.infer<typeof StatusBody>;

@Controller('leads')
@UseGuards(TenantGuard)
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  /**
   * ⚠️ `status` IS VALIDATED, NOT FORWARDED RAW. It used to go straight to the
   * service, which meant an unrecognised value returned an EMPTY pipeline —
   * indistinguishable on screen from "this workshop has no leads" — and
   * `?status[]=a&status[]=b` handed node-pg an array for a `$1::text`
   * parameter. Supervisor, 2026-08-09. A filter that silently matches nothing
   * is the quietest way to hide a workshop's whole sales pipeline from it.
   */
  @Get()
  async list(@Req() req: AuthenticatedRequest, @Query('status') status?: string) {
    if (status !== undefined && !(LEAD_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequestException(
        `Unknown lead status "${String(status)}". Use one of: ${LEAD_STATUSES.join(', ')}.`,
      );
    }
    return this.leads.list(req.tenantContext, { status });
  }

  @Patch(':id')
  async setStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validatedBody(StatusBody)) body: StatusBody,
  ) {
    return this.leads.setStatus(req.tenantContext, id, body.status);
  }
}
