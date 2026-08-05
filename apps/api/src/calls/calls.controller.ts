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
import { z } from 'zod';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import { optionalText, requiredText, uuid, validatedBody } from '../common/validation/validated-body';
import { CallsService } from './calls.service';

/**
 * In-app voice and video — slice 11 of `COMPLETION_PLAN.md`.
 *
 * ⚠️ WHO MAY JOIN A CALL IS DECIDED IN `CallsService`, by PARTICIPATION rather
 * than role. Two colleagues share a role and must not share a customer's
 * private consultation — a controller-level role guard would be the wrong shape
 * entirely.
 */

const CALL_KINDS = ['customer', 'technician', 'supplier', 'specialist_consultation'] as const;
const MEDIA = ['voice', 'video', 'phone', 'in_person'] as const;
const SIGNAL_KINDS = ['offer', 'answer', 'ice', 'bye'] as const;
const EVENT_KINDS = [
  'ringing', 'joined', 'connected', 'left', 'ended', 'no_answer',
  'connection_failed', 'cancelled', 'rescheduled',
] as const;

const CreateCallBody = z
  .object({
    callKind: z.enum(CALL_KINDS),
    medium: z.enum(MEDIA),
    subject: requiredText(300),
    // Absent means "call now". The service turns that into `ringing`; a
    // scheduled call without a time is refused by migration 049.
    scheduledFor: z.string().datetime().optional(),
    jobCardId: uuid().optional(),
    threadId: uuid().optional(),
    participantUserIds: z.array(uuid()).max(20).optional(),
  })
  .strict();

const SignalBody = z
  .object({
    signalKind: z.enum(SIGNAL_KINDS),
    // 🔴 PASSED THROUGH UNINSPECTED. This is opaque SDP or an ICE candidate
    // produced by the browser's own WebRTC stack. Validating its shape here
    // would break every codec negotiation this platform has not heard of; the
    // 64KB bound is the only thing asserted, because an SDP is a few kilobytes
    // and anything larger is not one.
    payload: z.record(z.string(), z.unknown()).refine(
      (p) => JSON.stringify(p).length <= 65_536,
      'a signalling payload should be a few kilobytes, not this',
    ),
    toUserId: uuid().optional(),
  })
  .strict();

const EventBody = z
  .object({ eventKind: z.enum(EVENT_KINDS), note: optionalText(2000) })
  .strict();

const CompleteBody = z
  .object({
    // Required, matching the CHECK in migration 049. A call marked done with no
    // outcome looks finished and nobody can tell whether it was useful.
    outcome: requiredText(5000),
  })
  .strict();

@Controller('calls')
@UseGuards(TenantGuard)
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query('kind') kind?: string) {
    const valid = CALL_KINDS.includes(kind as (typeof CALL_KINDS)[number]);
    return this.calls.listCalls(req.tenantContext, valid ? kind : undefined);
  }

  /**
   * The ICE servers this browser should use. Served from the API rather than
   * hardcoded in the bundle so a self-hosted coturn can be added the day this
   * leaves the free tier, without touching a screen.
   */
  @Get('ice-servers')
  iceServers() {
    return { iceServers: this.calls.iceServers() };
  }

  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(CreateCallBody)) body: z.infer<typeof CreateCallBody>,
  ) {
    return this.calls.createCall(req.tenantContext, body);
  }

  @Post(':id/join')
  join(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.calls.join(req.tenantContext, id);
  }

  @Post(':id/signals')
  postSignal(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validatedBody(SignalBody)) body: z.infer<typeof SignalBody>,
  ) {
    return this.calls.postSignal(req.tenantContext, id, body);
  }

  /** `after` is a `seq`, never a timestamp — see `CallsService.pollSignals`. */
  @Get(':id/signals')
  pollSignals(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('after') after?: string,
  ) {
    return this.calls.pollSignals(req.tenantContext, id, after ?? '0');
  }

  @Post(':id/events')
  recordEvent(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validatedBody(EventBody)) body: z.infer<typeof EventBody>,
  ) {
    return this.calls.recordEvent(req.tenantContext, id, body);
  }

  @Post(':id/complete')
  complete(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validatedBody(CompleteBody)) body: z.infer<typeof CompleteBody>,
  ) {
    return this.calls.complete(req.tenantContext, id, body.outcome);
  }
}
