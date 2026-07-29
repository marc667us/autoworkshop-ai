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

  /**
   * ⚠️ DECLARED BEFORE `@Get(':id')` AND IT MUST STAY THERE. Nest matches routes
   * in declaration order, so with these swapped `/job-cards/board` is captured
   * by the `:id` route, fails `ParseUUIDPipe`, and the staging board 400s with a
   * message about a malformed UUID.
   */
  @Get('board')
  board(@Req() req: AuthenticatedRequest) {
    return this.jobCards.board(req.tenantContext);
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

  /**
   * PATCH, not PUT: this replaces ONE field of the card, and the caller does not
   * hold the rest of it. A PUT would invite a client to send back a whole job
   * card it read a minute ago and silently undo somebody else's edit.
   *
   * The rules live in `JobCardService.changeStage` — `02.txt` §29 requires the
   * BACKEND to validate every stage change, and a board that drags cards around
   * is only one of the callers. An MCP tool moving a job on an agent's behalf
   * gets the identical checks because it calls the same service.
   */
  @Patch(':id/stage')
  changeStage(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { toStage: string; note?: string; overrideReason?: string },
  ) {
    return this.jobCards.changeStage(req.tenantContext, id, body);
  }
}
