import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import { JobCardService } from './job-card.service';

/**
 * Thin by design, like every controller here. The rules — who may read which
 * job cards, whose vehicle a card may be raised against — live in
 * `JobCardService`, so an MCP tool calling that service gets them too
 * (`0.txt` §13, §26).
 */
@Controller('job-cards')
@UseGuards(TenantGuard)
export class JobCardController {
  constructor(private readonly jobCards: JobCardService) {}

  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query('vehicleId', new ParseUUIDPipe({ optional: true })) vehicleId?: string,
  ) {
    return this.jobCards.list(req.tenantContext, { vehicleId });
  }

  @Get(':id')
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.jobCards.findById(req.tenantContext, id);
  }

  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      vehicleId: string;
      complaint: string;
      priority?: string;
      expectedCompletionOn?: string;
      mileageAtIntake?: number;
      assignedTechnicianId?: string;
    },
  ) {
    return this.jobCards.create(req.tenantContext, body);
  }
}
