import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import { ReportsService } from './reports.service';

/**
 * Reports - slice 8 of `COMPLETION_PLAN.md`.
 *
 * ONE endpoint taking a report key, not fourteen endpoints. Fourteen routes map
 * onto nine distinct questions - sections 46 and 47 each name several of the
 * same ones - and fourteen endpoints would have been fourteen places for the
 * same arithmetic to drift.
 *
 * An unknown key is a 400 naming the menu, never an empty result: an empty
 * result would read as "this report has no data" when the truth is "there is no
 * such report".
 */
@Controller('reports')
@UseGuards(TenantGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get(':key')
  run(@Req() req: AuthenticatedRequest, @Param('key') key: string) {
    return this.reports.run(req.tenantContext, key);
  }
}
