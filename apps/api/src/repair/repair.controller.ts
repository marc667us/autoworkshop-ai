import {
  Body,
  Controller,
  Delete,
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
import { DiagnosisService } from './diagnosis.service';
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
    private readonly diagnoses: DiagnosisService,
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

  /**
   * The diagnoses recorded against a job card — `07.txt` §3026 (slice 3b).
   *
   * Nested under the card for the same reason the inspections are: a diagnosis has
   * no meaning apart from one, and the card's own scoping is what decides who may
   * see it, so this path cannot become an existence oracle for cards a technician
   * cannot read.
   */
  @Get(':id/diagnoses')
  listDiagnoses(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.diagnoses.listForJobCard(req.tenantContext, id);
  }

  /** §3020-§3024 — the technician begins diagnosing an assigned job. */
  @Post(':id/diagnoses')
  startDiagnosis(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { summary?: string },
  ) {
    return this.diagnoses.start(req.tenantContext, id, body ?? {});
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

/**
 * Diagnoses addressed directly, once one exists — `07.txt` §3026-§3046.
 *
 * A SEPARATE controller, the same judgement `InspectionController` made: recording
 * a finding identifies the DIAGNOSIS, not the card. Routing a write through
 * `/job-cards/:cardId/diagnoses/:id` would carry two ids that must agree, and the
 * only thing that could resolve a disagreement is a check that the second belongs
 * to the first — ceremony, since the diagnosis already knows its card.
 */
@Controller('diagnoses')
@UseGuards(TenantGuard)
export class DiagnosisController {
  constructor(private readonly diagnoses: DiagnosisService) {}

  /**
   * The organisation's diagnoses — what the diagnosis queue and the §47 review
   * queue render.
   *
   * ⚠️ DECLARED BEFORE `@Get(':id')`, and it must stay there. Nest matches in
   * declaration order; the slice-2 board route and slice 3a both paid for this note.
   */
  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.diagnoses.list(req.tenantContext);
  }

  @Get(':id')
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.diagnoses.findById(req.tenantContext, id);
  }

  /**
   * §3026-§3046 — record one finding.
   *
   * POST to a collection, one finding per call. Unlike the inspection's batched
   * checklist, a finding is a paragraph of reasoning written once; batching would
   * mean holding several half-written findings in the browser and losing them
   * together.
   */
  @Post(':id/findings')
  addFinding(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body()
    body: {
      faultCode?: string;
      faultDescription?: string;
      affectedSystem?: string;
      observedSymptom?: string;
      testPerformed?: string;
      expectedResult?: string;
      actualResult?: string;
      interpretation?: string;
      findingStatus?: string;
      additionalInspectionRequired?: boolean;
    },
  ) {
    return this.diagnoses.addFinding(req.tenantContext, id, body ?? {});
  }

  /** Correct a finding, or move it between §1290's three standings. */
  /**
   * ⚠️ THE NULLABLE FIELDS DECLARE `| null`, because on this route `null` MEANS CLEAR
   * THIS COLUMN and an absent key means leave it alone. Declaring them `string`
   * only would hide the distinction from the next person to touch this signature —
   * see `FindingInput` in the service for the whole contract.
   */
  @Patch(':id/findings/:findingId')
  updateFinding(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('findingId', new ParseUUIDPipe()) findingId: string,
    @Body()
    body: {
      faultCode?: string | null;
      faultDescription?: string;
      affectedSystem?: string;
      observedSymptom?: string | null;
      testPerformed?: string | null;
      expectedResult?: string | null;
      actualResult?: string | null;
      interpretation?: string | null;
      findingStatus?: string;
      additionalInspectionRequired?: boolean;
    },
  ) {
    return this.diagnoses.updateFinding(req.tenantContext, id, findingId, body ?? {});
  }

  /**
   * Remove a finding entered in error, while the diagnosis is still open.
   *
   * A real DELETE rather than a soft flag, and narrowly permitted: see migration
   * 013 for why the grant exists and what still refuses it.
   */
  @Delete(':id/findings/:findingId')
  removeFinding(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('findingId', new ParseUUIDPipe()) findingId: string,
  ) {
    return this.diagnoses.removeFinding(req.tenantContext, id, findingId);
  }

  /** §376's technician notes on the diagnosis as a whole. */
  @Patch(':id')
  recordSummary(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    // `null` clears the notes; an absent key is a 400. The column is nullable, so
    // refusing to clear it would be a rule the database does not have.
    @Body() body: { summary?: string | null },
  ) {
    return this.diagnoses.recordSummary(req.tenantContext, id, body ?? {});
  }

  /**
   * §1292 — submit for supervisor review.
   *
   * POST to a sub-resource rather than a PATCH of `status`: this is a transition
   * with its own precondition (at least one finding), not a field a caller assigns.
   */
  @Post(':id/submit')
  submit(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.diagnoses.submit(req.tenantContext, id);
  }

  /**
   * §1292's review — approve, or reject with a reason.
   *
   * Its own sub-resource for the same reason as `submit`, and because the rules that
   * refuse it are about WHO is asking (`2.txt` §563's independence) as much as about
   * the record's state. Both live in the service, so an MCP tool reviewing on an
   * agent's behalf is held to them unchanged.
   */
  @Post(':id/review')
  review(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { decision?: string; note?: string },
  ) {
    return this.diagnoses.review(req.tenantContext, id, body ?? {});
  }
}
