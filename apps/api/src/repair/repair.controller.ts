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
import { InspectionService } from './inspection.service';
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
  constructor(
    private readonly jobCards: JobCardService,
    private readonly inspections: InspectionService,
  ) {}

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

  /**
   * The inspections recorded against a job card — `07.txt` §2920 (slice 3a).
   *
   * Nested under the card because an inspection has no meaning apart from one,
   * and because the card's own scoping is what decides who may see it: the
   * service reaches the card first and 404s a technician who is not assigned to
   * it, so this path cannot become an existence oracle for cards they cannot
   * read.
   */
  @Get(':id/inspections')
  listInspections(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.inspections.listForJobCard(req.tenantContext, id);
  }

  /** §2924 — "The technician selects 'Start Inspection.'" */
  @Post(':id/inspections')
  startInspection(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { mileageReading?: number },
  ) {
    return this.inspections.start(req.tenantContext, id, body ?? {});
  }
}

/**
 * Inspections addressed directly, once one exists.
 *
 * A SEPARATE controller rather than more paths under `job-cards`: recording a
 * result identifies the SHEET, not the card. Routing a write through
 * `/job-cards/:cardId/inspections/:id` would carry two ids that must agree, and
 * the only thing that could resolve a disagreement is a check that the second
 * belongs to the first — a check whose absence is a bug and whose presence is
 * pure ceremony, since the sheet already knows its card.
 */
@Controller('inspections')
@UseGuards(TenantGuard)
export class InspectionController {
  constructor(private readonly inspections: InspectionService) {}

  /**
   * The organisation's inspections — what the inspection queue renders.
   *
   * ⚠️ DECLARED BEFORE `@Get(':id')`, and it must stay there. Nest matches in
   * declaration order; the slice-2 board route paid for this note already.
   */
  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.inspections.list(req.tenantContext);
  }

  @Get(':id')
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.inspections.findById(req.tenantContext, id);
  }

  /**
   * §2968-§2978 — record results, notes, mileage.
   *
   * PATCH and a BATCH of items: a technician works down the sheet, and this is
   * one field of one record at a time from the API's point of view. The rules —
   * which roles may record, whether the sheet is still open — live in the
   * service, so an MCP tool recording on an agent's behalf gets them unchanged.
   */
  @Patch(':id/items')
  recordItems(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body()
    body: {
      items?: Array<{ checkpointCode: string; result: string; note?: string }>;
      mileageReading?: number;
      summary?: string;
    },
  ) {
    return this.inspections.recordItems(req.tenantContext, id, body ?? {});
  }

  /**
   * Submit — the sheet becomes the finding of record and stops being writable.
   *
   * POST to a sub-resource rather than a PATCH of `status`: this is a transition
   * with its own preconditions (every checkpoint answered), not a field a caller
   * assigns. A PATCH would invite `{"status":"in_progress"}` and the question of
   * whether a submitted inspection can be reopened, which it cannot.
   */
  @Post(':id/submit')
  submit(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.inspections.submit(req.tenantContext, id);
  }
}
