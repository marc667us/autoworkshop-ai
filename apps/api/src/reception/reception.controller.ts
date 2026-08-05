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
import { validatedBody } from '../common/validation/validated-body';
import { ReceptionService } from './reception.service';
import {
  ChangeAppointmentStatusBody,
  CloseWalkInBody,
  CreateAppointmentBody,
  CreateBayBody,
  CreateWalkInBody,
  RecordFeedbackBody,
  RespondToFeedbackBody,
  RetireBayBody,
} from './reception.schemas';

/**
 * The diary — `07.txt` pt2 §46-§48's appointment functions.
 *
 * ⚠️ WHO MAY BOOK IS DECIDED IN `ReceptionService`, not here and not by the
 * screen. A server action and a controller route are both public HTTP
 * endpoints; the rule lives in one place so a new caller cannot arrive without
 * it (CLAUDE.md §8 — hidden is not secure).
 */
@Controller('appointments')
@UseGuards(TenantGuard)
export class AppointmentController {
  constructor(private readonly reception: ReceptionService) {}

  /**
   * `from`/`to` bound the window the calendar draws. Passed straight through as
   * text and re-read by Postgres as `timestamptz` — a malformed value is a
   * clean 400 from the driver rather than a silently empty diary.
   */
  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
  ) {
    return this.reception.listAppointments(req.tenantContext, { from, to, status });
  }

  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(CreateAppointmentBody)) body: CreateAppointmentBody,
  ) {
    return this.reception.createAppointment(req.tenantContext, body);
  }

  @Patch(':id/status')
  changeStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(ChangeAppointmentStatusBody)) body: ChangeAppointmentStatusBody,
  ) {
    return this.reception.changeAppointmentStatus(req.tenantContext, id, body);
  }
}

/**
 * Walk-ins — somebody at the counter with no booking.
 *
 * A SEPARATE controller rather than an appointment with `scheduledFor = now()`,
 * because the record is genuinely different: free text for a person and a car
 * that are not on file yet. Forcing a customer record first is how a queue forms
 * at the desk.
 */
@Controller('walk-ins')
@UseGuards(TenantGuard)
export class WalkInController {
  constructor(private readonly reception: ReceptionService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query('status') status?: string) {
    return this.reception.listWalkIns(req.tenantContext, { status });
  }

  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(CreateWalkInBody)) body: CreateWalkInBody,
  ) {
    return this.reception.createWalkIn(req.tenantContext, body);
  }

  @Patch(':id/close')
  close(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(CloseWalkInBody)) body: CloseWalkInBody,
  ) {
    return this.reception.closeWalkIn(req.tenantContext, id, body);
  }
}

/** The physical bays a car goes into. */
@Controller('service-bays')
@UseGuards(TenantGuard)
export class ServiceBayController {
  constructor(private readonly reception: ReceptionService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query('includeRetired') includeRetired?: string) {
    return this.reception.listBays(req.tenantContext, {
      includeRetired: includeRetired === 'true',
    });
  }

  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(CreateBayBody)) body: CreateBayBody,
  ) {
    return this.reception.createBay(req.tenantContext, body);
  }

  /**
   * Retire or reinstate. NOT a delete — `core.service_bays` carries no DELETE
   * grant, because a closed bay still appears on every past appointment.
   */
  @Patch(':id/active')
  setActive(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(RetireBayBody)) body: RetireBayBody,
  ) {
    return this.reception.retireBay(req.tenantContext, id, body.isActive);
  }
}

/**
 * What the customer thought.
 *
 * ⚠️ THE CUSTOMER'S WORDS ARE APPEND-ONLY IN THE DATABASE
 * (`trg_feedback_rewrite` fires on UPDATE **and** DELETE). There is deliberately
 * no route that edits a rating or a comment: a workshop that can edit a one-star
 * review has a review system that means nothing. The only write after the fact
 * is the workshop's REPLY, and only once.
 */
@Controller('customer-feedback')
@UseGuards(TenantGuard)
export class CustomerFeedbackController {
  constructor(private readonly reception: ReceptionService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.reception.listFeedback(req.tenantContext);
  }

  @Post()
  record(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(RecordFeedbackBody)) body: RecordFeedbackBody,
  ) {
    return this.reception.recordFeedback(req.tenantContext, body);
  }

  @Post(':id/response')
  respond(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(RespondToFeedbackBody)) body: RespondToFeedbackBody,
  ) {
    return this.reception.respondToFeedback(req.tenantContext, id, body.response);
  }
}
