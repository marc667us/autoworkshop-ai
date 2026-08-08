import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import { DiagnosisService } from './diagnosis.service';
import { InspectionService } from './inspection.service';
import { JobCardService } from './job-card.service';
import { RepairPlanService } from './repair-plan.service';
import { QuotationService } from './quotation.service';
import { ProposalService } from './proposal.service';
import { ExecutionService } from './execution.service';
import { TestingService } from './testing.service';
import { PricingService } from './pricing.service';
import { QualityService } from './quality.service';
import { VariationService } from './variation.service';
import { validatedBody } from '../common/validation/validated-body';
import {
  AddFindingBody,
  AddQuotationLineBody,
  AddRepairTaskBody,
  AddResourceBody,
  ApproveCriticalOverrideBody,
  ChangeStageBody,
  ReassignJobCardBody,
  CompleteExecutionBody,
  CreateJobCardBody,
  DecisionBody,
  MoveTaskBody,
  OpenQualityInspectionBody,
  ProposalDecisionBody,
  CustomerProposalDecisionBody,
  RecordDiagnosisSummaryBody,
  RecordEvidenceBody,
  RecordInspectionItemsBody,
  RecordPartUsedBody,
  RecordProposalNarrativeBody,
  RecordQuotationDetailsBody,
  RecordReadinessBody,
  RecordRepairPlanDetailsBody,
  RecordRoadTestBody,
  RecordScanBody,
  RecordTestResultBody,
  ReviewVariationBody,
  SetTaskStatusBody,
  StartDiagnosisBody,
  StartExecutionBody,
  StartInspectionBody,
  StartRepairPlanBody,
  StartTimeEntryBody,
  UpdateFindingBody,
  UpdateQuotationLineBody,
  UpdateRepairTaskBody,
  UpdateResourceBody,
} from './repair.schemas';

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
    private readonly repairPlans: RepairPlanService,
    private readonly quotations: QuotationService,
    private readonly proposals: ProposalService,
    private readonly executions: ExecutionService,
    private readonly testing: TestingService,
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
  /**
   * `GET /job-cards/orchestration` — what needs doing next, ranked.
   *
   * ⚠️ DECLARED BEFORE `@Get(':id')`, like `board` and for the same reason: Nest
   * matches routes in declaration order, and `:id` would swallow this path and
   * then fail its UUID pipe on the word "orchestration".
   */
  @Get('orchestration')
  orchestration(@Req() req: AuthenticatedRequest) {
    return this.jobCards.orchestration(req.tenantContext);
  }

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
    @Body(validatedBody(CreateJobCardBody)) body: CreateJobCardBody,
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
    @Body(validatedBody(ChangeStageBody)) body: ChangeStageBody,
  ) {
    return this.jobCards.changeStage(req.tenantContext, id, body);
  }

  /**
   * Assign, reassign or unassign the technician on a job card.
   *
   * 🔴 THE ROUTE WHOSE ABSENCE MADE `assigned_technician_id` WRITE-ONCE.
   * Grepped 2026-08-08: every other reference to that column in the API is a
   * READ, and its only writer was the INSERT in `JobCardService.create`. So a
   * card opened or converted WITHOUT a technician — which is the DEFAULT, and a
   * state the product deliberately allows — could never be assigned to anybody
   * afterwards, and a technician who left could never be replaced.
   *
   * `PATCH` rather than `POST`: this edits one field of a card that already
   * exists. Separate from `:id/stage` because who does the work and how far
   * along it is are independent facts, changed by different people at different
   * times.
   */
  @Patch(':id/assignment')
  reassign(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(ReassignJobCardBody)) body: ReassignJobCardBody,
  ) {
    return this.jobCards.reassign(req.tenantContext, id, body.assignedTechnicianId);
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
  /**
   * `GET /job-cards/:id/inspection-report` — the vehicle OWNER's prepared
   * report (`2.txt` §557), as distinct from `:id/inspections`, which is the
   * technician's working sheet and which a customer may not read.
   */
  @Get(':id/inspection-report')
  inspectionReport(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inspections.customerReport(req.tenantContext, id);
  }

  @Post(':id/inspections')
  startInspection(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(StartInspectionBody)) body: StartInspectionBody,
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
    @Body(validatedBody(StartDiagnosisBody)) body: StartDiagnosisBody,
  ) {
    return this.diagnoses.start(req.tenantContext, id, body ?? {});
  }

  /**
   * The repair plans built against a job card — `07.txt` §22-§31 (slice 4).
   *
   * Nested under the card for the same reason the inspections and diagnoses are: a
   * plan has no meaning apart from one, and the card's own scoping is what decides
   * who may see it, so this path cannot become an existence oracle for cards a
   * technician cannot read.
   */
  @Get(':id/repair-plans')
  listRepairPlans(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.repairPlans.listForJobCard(req.tenantContext, id);
  }

  /**
   * §22-§26 — "The technician selects 'Plan Repair.'"
   *
   * The service refuses unless the card is at `solution_preparation` AND an approved
   * diagnosis with at least one confirmed fault exists — the plan is built from those
   * faults, so there is nothing to build without them.
   */
  @Post(':id/repair-plans')
  startRepairPlan(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(StartRepairPlanBody)) body: StartRepairPlanBody,
  ) {
    return this.repairPlans.start(req.tenantContext, id, body ?? {});
  }

  /** The quotations priced against a job card — `07.txt` §9-§16 (slice 5). */
  @Get(':id/quotations')
  listQuotations(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.quotations.listForJobCard(req.tenantContext, id);
  }

  /**
   * §10 + §3 — "the approved repair plan is sent to quotation preparation" and
   * "the system GENERATES a draft quotation".
   *
   * No body: the draft is generated FROM the approved plan, not typed in. A payload
   * here would invite a caller to supply figures that disagree with the plan they are
   * supposedly for.
   */
  @Post(':id/quotations')
  prepareQuotation(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.quotations.prepare(req.tenantContext, id);
  }

  /** The customer proposals for a job card — `1.txt` §396-§424 (slice 6). */
  @Get(':id/proposals')
  listProposals(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.proposals.listForJobCard(req.tenantContext, id);
  }

  /**
   * Draft a proposal from the approved quotation — or §424's NEW VERSION of it.
   *
   * No body: §410-§422's content is READ from the frozen records behind it, and the
   * narrative is recorded separately once the draft exists.
   */
  @Post(':id/proposals')
  prepareProposal(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.proposals.prepare(req.tenantContext, id);
  }

  /** The repairs carried out against a job card — `07.txt` §31-§33 (slice 7). */
  @Get(':id/executions')
  listExecutions(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.executions.listForJobCard(req.tenantContext, id);
  }

  /**
   * §3 — "The technician selects 'Start Repair.'"
   *
   * The service refuses unless an APPROVED customer proposal exists (§7: work shall
   * not start until the required approval is received) and creates one task row per
   * approved plan task — §5 has the technician follow the APPROVED procedure, so the
   * work list is not something a caller composes.
   */
  @Post(':id/executions')
  startExecution(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(StartExecutionBody)) body: StartExecutionBody,
  ) {
    return this.executions.start(req.tenantContext, id, body ?? {});
  }

  /** The test sessions on a job card — `07.txt` §34-§36 (slice 8). */
  @Get(':id/test-sessions')
  listTestSessions(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.testing.listForJobCard(req.tenantContext, id);
  }

  /**
   * §34 — begin recording test results.
   *
   * No body: the session is opened against the COMPLETED repair, which the service
   * finds and a trigger insists on. §34 opens "after completing the repair".
   */
  @Post(':id/test-sessions')
  startTestSession(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.testing.start(req.tenantContext, id);
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
    @Body(validatedBody(RecordInspectionItemsBody)) body: RecordInspectionItemsBody,
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
    @Body(validatedBody(AddFindingBody)) body: AddFindingBody,
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
    @Body(validatedBody(UpdateFindingBody)) body: UpdateFindingBody,
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
    @Body(validatedBody(RecordDiagnosisSummaryBody)) body: RecordDiagnosisSummaryBody,
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
    @Body(validatedBody(DecisionBody)) body: DecisionBody,
  ) {
    return this.diagnoses.review(req.tenantContext, id, body ?? {});
  }
}

/**
 * Repair plans addressed directly, once one exists — `07.txt` §22-§31.
 *
 * A SEPARATE controller, the same judgement `InspectionController` and
 * `DiagnosisController` made: recording a task identifies the PLAN, not the card.
 * Routing a write through `/job-cards/:cardId/repair-plans/:id` would carry two ids
 * that must agree, and the only thing that could resolve a disagreement is a check
 * that the second belongs to the first — ceremony, since the plan already knows its
 * card.
 */
@Controller('repair-plans')
@UseGuards(TenantGuard)
export class RepairPlanController {
  constructor(private readonly repairPlans: RepairPlanService) {}

  /**
   * The organisation's repair plans — what the planning queue and §30's internal
   * technical review queue render.
   *
   * ⚠️ DECLARED BEFORE `@Get(':id')`, and it must stay there. Nest matches in
   * declaration order; the slice-2 board route, slice 3a and slice 3b have each paid
   * for this note already.
   */
  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.repairPlans.list(req.tenantContext);
  }

  @Get(':id')
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.repairPlans.findById(req.tenantContext, id);
  }

  /**
   * §26's repair procedure, §29's safety precautions and §29.9's post-repair tests.
   *
   * ⚠️ EVERY FIELD DECLARES `| null`, because on this route `null` MEANS CLEAR THIS
   * COLUMN and an absent key means leave it alone. Declaring them `string` only would
   * hide the distinction from the next person to touch this signature — see
   * `PlanDetailsInput` in the service for the whole contract.
   */
  @Patch(':id')
  recordDetails(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(RecordRepairPlanDetailsBody)) body: RecordRepairPlanDetailsBody,
  ) {
    return this.repairPlans.recordDetails(req.tenantContext, id, body ?? {});
  }

  /**
   * §27 — add a repair task.
   *
   * POST to a collection, one task per call. Like a diagnostic finding and unlike the
   * inspection's batched checklist: a task carries a description, a skill, a bay and
   * an estimate, and batching would mean losing several half-written ones together.
   */
  @Post(':id/tasks')
  addTask(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(AddRepairTaskBody)) body: AddRepairTaskBody,
  ) {
    return this.repairPlans.addTask(req.tenantContext, id, body ?? {});
  }

  /**
   * Correct a task, including DETACHING it from a fault with `findingId: null`.
   *
   * The nullable fields declare `| null` for the same reason the details route's do:
   * a technician who attached a task to the wrong finding must be able to correct it
   * without deleting the task and retyping its description.
   */
  @Patch(':id/tasks/:taskId')
  updateTask(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Body(validatedBody(UpdateRepairTaskBody)) body: UpdateRepairTaskBody,
  ) {
    return this.repairPlans.updateTask(req.tenantContext, id, taskId, body ?? {});
  }

  /**
   * §28 — "the technician defines the task sequence".
   *
   * Its own sub-resource rather than a `position` field on the PATCH above: a caller
   * assigning an absolute position has to know what every other task's position is,
   * and two callers assigning positions concurrently produce an order neither asked
   * for. A relative move is the operation, so it is the endpoint.
   */
  @Post(':id/tasks/:taskId/move')
  moveTask(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Body(validatedBody(MoveTaskBody)) body: MoveTaskBody,
  ) {
    return this.repairPlans.moveTask(req.tenantContext, id, taskId, body?.direction ?? '');
  }

  /**
   * Remove a task entered in error, while the plan is still open.
   *
   * A real DELETE rather than a soft flag, and narrowly permitted: migration 014's
   * trigger refuses it once the plan is submitted, and the grant exists so that
   * refusal is a rule rather than a wall.
   */
  @Delete(':id/tasks/:taskId')
  removeTask(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
  ) {
    return this.repairPlans.removeTask(req.tenantContext, id, taskId);
  }

  /** §29 — add a part, consumable, tool or piece of equipment. */
  @Post(':id/resources')
  addResource(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(AddResourceBody)) body: AddResourceBody,
  ) {
    return this.repairPlans.addResource(req.tenantContext, id, body ?? {});
  }

  /** Correct a resource; `taskId: null` makes it plan-wide rather than task-scoped. */
  @Patch(':id/resources/:resourceId')
  updateResource(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('resourceId', new ParseUUIDPipe()) resourceId: string,
    @Body(validatedBody(UpdateResourceBody)) body: UpdateResourceBody,
  ) {
    return this.repairPlans.updateResource(req.tenantContext, id, resourceId, body ?? {});
  }

  @Delete(':id/resources/:resourceId')
  removeResource(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('resourceId', new ParseUUIDPipe()) resourceId: string,
  ) {
    return this.repairPlans.removeResource(req.tenantContext, id, resourceId);
  }

  /**
   * §29.10 — submit the plan for supervisor review.
   *
   * POST to a sub-resource rather than a PATCH of `status`: this is a transition with
   * its own preconditions (at least one task, every task estimated), not a field a
   * caller assigns.
   */
  @Post(':id/submit')
  submit(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.repairPlans.submit(req.tenantContext, id);
  }

  /**
   * §30-§31's internal technical review — approve, or reject with a reason.
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
    @Body(validatedBody(DecisionBody)) body: DecisionBody,
  ) {
    return this.repairPlans.review(req.tenantContext, id, body ?? {});
  }
}


/**
 * Quotations addressed directly, once one exists — `07.txt` §9-§16.
 *
 * A SEPARATE controller, the judgement every sibling here made: pricing a line
 * identifies the QUOTATION, not the card.
 */
@Controller('quotations')
@UseGuards(TenantGuard)
export class QuotationController {
  constructor(private readonly quotations: QuotationService) {}

  /**
   * ⚠️ DECLARED BEFORE `@Get(':id')`, and it must stay there. Nest matches in
   * declaration order; four slices have now paid for this note.
   */
  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.quotations.list(req.tenantContext);
  }

  @Get(':id')
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.quotations.findById(req.tenantContext, id);
  }

  /**
   * §11's taxes and discounts, §4's validity, warranty and conditions.
   *
   * The nullable fields declare `| null` because on this route `null` MEANS CLEAR THIS
   * COLUMN and an absent key means leave it alone.
   */
  @Patch(':id')
  recordDetails(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(RecordQuotationDetailsBody)) body: RecordQuotationDetailsBody,
  ) {
    return this.quotations.recordDetails(req.tenantContext, id, body ?? {});
  }

  /** §11's external services and §4's other charges — a line the plan did not produce. */
  @Post(':id/lines')
  addLine(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(AddQuotationLineBody)) body: AddQuotationLineBody,
  ) {
    return this.quotations.addLine(req.tenantContext, id, body ?? {});
  }

  /** Price a generated line, or correct one. */
  @Patch(':id/lines/:lineId')
  updateLine(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('lineId', new ParseUUIDPipe()) lineId: string,
    @Body(validatedBody(UpdateQuotationLineBody)) body: UpdateQuotationLineBody,
  ) {
    return this.quotations.updateLine(req.tenantContext, id, lineId, body ?? {});
  }

  @Delete(':id/lines/:lineId')
  removeLine(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('lineId', new ParseUUIDPipe()) lineId: string,
  ) {
    return this.quotations.removeLine(req.tenantContext, id, lineId);
  }

  /** §5 — submit for internal approval. */
  @Post(':id/submit')
  submit(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.quotations.submit(req.tenantContext, id);
  }

  /** §5's internal approval — approve, or reject with a reason. */
  @Post(':id/review')
  review(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(DecisionBody)) body: DecisionBody,
  ) {
    return this.quotations.review(req.tenantContext, id, body ?? {});
  }
}


/**
 * Proposals addressed directly, once one exists — `1.txt` §396-§424, `07.txt` §7.
 *
 * A SEPARATE controller, the judgement every sibling here made: recording a decision
 * identifies the PROPOSAL, not the card.
 */
@Controller('proposals')
@UseGuards(TenantGuard)
export class ProposalController {
  constructor(private readonly proposals: ProposalService) {}

  /**
   * ⚠️ DECLARED BEFORE `@Get(':id')`, and it must stay there. Nest matches in
   * declaration order; five slices have now paid for this note.
   */
  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.proposals.list(req.tenantContext);
  }

  @Get(':id')
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.proposals.findById(req.tenantContext, id);
  }

  /**
   * §418's expected result, §422's risks and uncertainties.
   *
   * Every field declares `| null` because on this route `null` MEANS CLEAR THIS COLUMN
   * and an absent key means leave it alone.
   */
  @Patch(':id')
  recordNarrative(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(RecordProposalNarrativeBody)) body: RecordProposalNarrativeBody,
  ) {
    return this.proposals.recordNarrative(req.tenantContext, id, body ?? {});
  }

  /**
   * Put the proposal in front of the customer.
   *
   * POST to a sub-resource rather than a PATCH of `status`: this is a transition with
   * its own precondition (§418's expected result), not a field a caller assigns.
   */
  @Post(':id/issue')
  issue(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.proposals.issue(req.tenantContext, id);
  }

  /**
   * §7 — record the customer's answer.
   *
   * `decidedByName` is the CUSTOMER and is required; the staff member who captured it
   * comes from the session and is never accepted from the request.
   */
  @Post(':id/decision')
  recordDecision(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(ProposalDecisionBody)) body: ProposalDecisionBody,
  ) {
    return this.proposals.recordDecision(req.tenantContext, id, body ?? {});
  }

  /**
   * §7 — the customer answers for THEMSELVES, from the customer workspace.
   *
   * A SEPARATE ROUTE from `:id/decision`, and the body is the reason: this one
   * accepts only the decision, the option and a note. `decidedByName`,
   * `decisionChannel` and `recorded_by` are DERIVED from the session and the
   * customer record, because on this route they are not the caller's to state —
   * accepting `decidedByName` here would let a customer approve under another
   * person's name, and accepting `decisionChannel` would let a portal approval
   * be filed as a telephone call nobody can check.
   *
   * A flag on the staff route would have left all three settable and relied on
   * callers passing the right combination.
   */
  @Post(':id/customer-decision')
  recordCustomerDecision(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(CustomerProposalDecisionBody)) body: CustomerProposalDecisionBody,
  ) {
    return this.proposals.recordCustomerDecision(req.tenantContext, id, body ?? {});
  }
}


/**
 * Repairs addressed directly, once one is under way — `07.txt` §31-§33.
 *
 * A SEPARATE controller, the judgement every sibling here made: booking time
 * identifies the REPAIR, not the card.
 */
@Controller('repair-executions')
@UseGuards(TenantGuard)
export class ExecutionController {
  constructor(private readonly executions: ExecutionService) {}

  /**
   * ⚠️ DECLARED BEFORE `@Get(':id')`, and it must stay there. Nest matches in
   * declaration order; six slices have now paid for this note.
   */
  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.executions.list(req.tenantContext);
  }

  @Get(':id')
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.executions.findById(req.tenantContext, id);
  }

  /** §32's five pre-start confirmations, and the bay. */
  @Patch(':id')
  recordReadiness(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(RecordReadinessBody)) body: RecordReadinessBody,
  ) {
    return this.executions.recordReadiness(req.tenantContext, id, body ?? {});
  }

  /** §6 — record task completion, or that a task is blocked or not required. */
  @Patch(':id/tasks/:taskId')
  setTaskStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Body(validatedBody(SetTaskStatusBody)) body: SetTaskStatusBody,
  ) {
    return this.executions.setTaskStatus(req.tenantContext, id, taskId, body ?? {});
  }

  /**
   * §33's Start Work / Resume Work, and the start of any non-productive spell.
   *
   * POST to a sub-resource rather than a PATCH of a `paused` field: Pause and Resume
   * close one interval and open another, so both produce a row of the same shape and
   * both are auditable.
   */
  @Post(':id/time-entries')
  startTimeEntry(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(StartTimeEntryBody)) body: StartTimeEntryBody,
  ) {
    return this.executions.startTimeEntry(req.tenantContext, id, body ?? {});
  }

  /** §33's Pause Work / Complete Task — close this technician's running entry. */
  @Post(':id/time-entries/stop')
  stopTimeEntry(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.executions.stopTimeEntry(req.tenantContext, id);
  }

  /** §7 — a part actually fitted, which is not the same as a part planned. */
  @Post(':id/parts-used')
  recordPartUsed(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(RecordPartUsedBody)) body: RecordPartUsedBody,
  ) {
    return this.executions.recordPartUsed(req.tenantContext, id, body ?? {});
  }

  /** §8-§9 — a measurement, a photograph, an observation. */
  @Post(':id/evidence')
  recordEvidence(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(RecordEvidenceBody)) body: RecordEvidenceBody,
  ) {
    return this.executions.recordEvidence(req.tenantContext, id, body ?? {});
  }

  /**
   * §13 — complete the authorised repair.
   *
   * Its own sub-resource, with preconditions the caller does not assign: no task may
   * still be outstanding, and nothing may still be clocked on.
   */
  @Post(':id/complete')
  complete(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(CompleteExecutionBody)) body: CompleteExecutionBody,
  ) {
    return this.executions.complete(req.tenantContext, id, body ?? {});
  }
}


/**
 * Test sessions addressed directly — `07.txt` §34-§36.
 *
 * A SEPARATE controller, the judgement every sibling here made: recording a result
 * identifies the SESSION, not the card.
 */
@Controller('test-sessions')
@UseGuards(TenantGuard)
export class TestingController {
  constructor(private readonly testing: TestingService) {}

  /**
   * ⚠️ DECLARED BEFORE `@Get(':id')`, and it must stay there. Nest matches in
   * declaration order; seven slices have now paid for this note.
   */
  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.testing.list(req.tenantContext);
  }

  @Get(':id')
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.testing.findById(req.tenantContext, id);
  }

  /** §34 — record one test result, with its fourteen fields. */
  @Post(':id/results')
  recordResult(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(RecordTestResultBody)) body: RecordTestResultBody,
  ) {
    return this.testing.recordResult(req.tenantContext, id, body ?? {});
  }

  @Delete(':id/results/:resultId')
  removeResult(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('resultId', new ParseUUIDPipe()) resultId: string,
  ) {
    return this.testing.removeResult(req.tenantContext, id, resultId);
  }

  /** §35 — the post-repair diagnostic scan. */
  @Patch(':id/scan')
  recordScan(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(RecordScanBody)) body: RecordScanBody,
  ) {
    return this.testing.recordScan(req.tenantContext, id, body ?? {});
  }

  /** §36 — the road test. */
  @Patch(':id/road-test')
  recordRoadTest(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(RecordRoadTestBody)) body: RecordRoadTestBody,
  ) {
    return this.testing.recordRoadTest(req.tenantContext, id, body ?? {});
  }

  /**
   * §35's DOCUMENTED APPROVAL — release a vehicle with an unresolved critical fault.
   *
   * Its own route with its own, NARROWER role set. An approval the technician can give
   * themselves is not an approval, and §35 exists precisely so that decision has a name
   * against it.
   */
  @Post(':id/critical-override')
  approveCriticalOverride(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(ApproveCriticalOverrideBody)) body: ApproveCriticalOverrideBody,
  ) {
    return this.testing.approveCriticalOverride(req.tenantContext, id, body ?? {});
  }

  /** Submit for quality control — slice 9 answers it. */
  @Post(':id/submit')
  submit(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.testing.submit(req.tenantContext, id);
  }
}

/**
 * The workshop's PRICING — Slice D.
 *
 * ⚠️ NOT UNDER `job-cards`, and that is a boundary rather than a filing
 * preference. Every other controller in this file operates on ONE job card and
 * takes its id in the path. Pricing is organisation SETTINGS: one row per
 * workshop, read by `quotation.service.ts` while building any quotation. Nesting
 * it under a job card would imply a per-job rate, which is precisely what this
 * table is not.
 *
 * ⚠️ `TenantGuard`, because migration 029's policies key on the ORGANIZATION and
 * the ROLE together, and `withTenant` is the only path that sets either. On
 * `UserGuard` these routes would authenticate, return 200, and change nothing.
 */
@Controller('pricing')
@UseGuards(TenantGuard)
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  /** Tenant-wide read: everyone who prepares a quotation may see the rates. */
  @Get()
  describe(@Req() req: AuthenticatedRequest) {
    return this.pricing.describe(req.tenantContext);
  }

  /** Owner-only write. The refusal is migration 029's; this route explains it. */
  @Put()
  save(@Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return this.pricing.save(req.tenantContext, body ?? {});
  }
}

/**
 * The independent quality inspection — Phase 5 slice 9 (`2.txt` §563).
 *
 * ⚠️ `TenantGuard`, because the independence trigger and the tenant policy both
 * read the context `withTenant` sets. On `UserGuard` these routes would
 * authenticate, return 200, and change nothing.
 *
 * ⚠️ THE INSPECTOR IS NEVER A REQUEST FIELD. It is `ctx.userId`, resolved from a
 * validated token — accepting one would let anybody record a colleague as having
 * carried out the check, which is the signature this slice exists to make worth
 * something.
 */
@Controller('quality-inspections')
@UseGuards(TenantGuard)
export class QualityController {
  constructor(private readonly quality: QualityService) {}

  /**
   * Repairs waiting for a quality inspection, each flagged with whether THIS
   * viewer may inspect it.
   *
   * ⚠️ DECLARED BEFORE ANY `:id` ROUTE AND IT MUST STAY THERE. Nest matches in
   * declaration order, so a `@Get(':id')` added above this would swallow
   * `/queue` as an id and answer 400 on a UUID pipe. `JobCardController` carries
   * the same note for the same reason.
   */
  @Get('queue')
  queue(@Req() req: AuthenticatedRequest) {
    return this.quality.queue(req.tenantContext);
  }

  /** Open an inspection against a SUBMITTED test session. */
  @Post()
  open(@Req() req: AuthenticatedRequest, @Body(validatedBody(OpenQualityInspectionBody)) body: OpenQualityInspectionBody,) {
    return this.quality.open(req.tenantContext, String(body?.testSessionId ?? ''));
  }

  /** Record the verdict. The status is DERIVED from §563's two answers. */
  @Patch(':id')
  decide(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.quality.decide(req.tenantContext, id, body ?? {});
  }
}

/**
 * The repair variation flow — Phase 5 slice 7b (`07.txt` §14, §3766 step 12).
 *
 * ⚠️ `TenantGuard`, because migration 032's policy and triggers read the context
 * `withTenant` sets. On `UserGuard` these routes would authenticate, return 200,
 * and change nothing.
 *
 * ⚠️ THE CUSTOMER'S DECISION IS RECORDED BY STAFF, NOT SUBMITTED BY THE
 * CUSTOMER. A customer is often not a system user at all — they answer the
 * phone. So `decidedByName` and `decisionChannel` are what carry the consent,
 * and a chargeable approval is refused without them.
 */
@Controller('variations')
@UseGuards(TenantGuard)
export class VariationController {
  constructor(private readonly variations: VariationService) {}

  /** The organisation's variations, or one job card's when named. */
  @Get()
  list(@Req() req: AuthenticatedRequest, @Query('jobCardId') jobCardId?: string) {
    // An empty string is what an absent query parameter looks like on some
    // paths; normalised to undefined so it means "the whole queue" rather than
    // becoming a uuid cast of ''.
    return this.variations.list(req.tenantContext, jobCardId || undefined);
  }

  /** §3764 step 11 — the technician found more work. */
  @Post()
  raise(
    @Req() req: AuthenticatedRequest,
    @Body() body: { executionId?: string } & Record<string, unknown>,
  ) {
    return this.variations.raise(req.tenantContext, String(body?.executionId ?? ''), body ?? {});
  }

  /** §3792 — reviewed internally, then optionally sent to the customer. */
  @Patch(':id/review')
  review(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(ReviewVariationBody)) body: ReviewVariationBody,
  ) {
    return this.variations.review(req.tenantContext, id, Boolean(body?.send));
  }

  /** The customer's answer — and, for an approval, the authorisation with it. */
  @Patch(':id/decision')
  decide(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.variations.decide(req.tenantContext, id, body ?? {});
  }
}
