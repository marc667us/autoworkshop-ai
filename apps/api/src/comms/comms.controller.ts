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
import { requiredText, uuid, validatedBody } from '../common/validation/validated-body';
import { CommsService } from './comms.service';

/**
 * Messaging — slice 7 of `COMPLETION_PLAN.md`.
 *
 * ⚠️ WHO MAY READ A THREAD IS DECIDED IN `CommsService`, by PARTICIPATION rather
 * than by role. A controller-level role guard would be the wrong shape entirely:
 * two colleagues share a role and must not share a customer's private thread.
 */

const THREAD_KINDS = ['customer', 'technician', 'supplier', 'internal', 'specialist_support'] as const;

const CreateThreadBody = z
  .object({
    threadKind: z.enum(THREAD_KINDS),
    subject: requiredText(300),
    // The opening message. A thread with no message is an empty room nobody
    // can tell the purpose of, and the list would show it with a blank preview.
    body: requiredText(20_000),
    jobCardId: uuid().optional(),
    customerId: uuid().optional(),
    // Bounded: a thread is a conversation, not a broadcast list.
    participantUserIds: z.array(uuid()).max(50).optional(),
  })
  .strict();

const PostMessageBody = z.object({ body: requiredText(20_000) }).strict();

@Controller('comms')
@UseGuards(TenantGuard)
export class CommsController {
  constructor(private readonly comms: CommsService) {}

  @Get('threads')
  listThreads(@Req() req: AuthenticatedRequest, @Query('kind') kind?: string) {
    // An unknown kind is treated as no filter rather than as an error: the
    // screens pass a fixed value, and a 400 here would turn a typo in a link
    // into a broken page.
    const valid = THREAD_KINDS.includes(kind as (typeof THREAD_KINDS)[number]);
    return this.comms.listThreads(req.tenantContext, valid ? kind : undefined);
  }

  @Post('threads')
  createThread(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(CreateThreadBody)) body: z.infer<typeof CreateThreadBody>,
  ) {
    return this.comms.createThread(req.tenantContext, body);
  }

  @Get('threads/:id/messages')
  listMessages(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.comms.listMessages(req.tenantContext, id);
  }

  @Post('threads/:id/messages')
  postMessage(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validatedBody(PostMessageBody)) body: z.infer<typeof PostMessageBody>,
  ) {
    return this.comms.postMessage(req.tenantContext, id, body.body);
  }

  @Post('threads/:id/read')
  markRead(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.comms.markThreadRead(req.tenantContext, id);
  }

  /** The number behind the layout's badge. Replaces a hardcoded 5. */
  @Get('unread-count')
  async unreadCount(@Req() req: AuthenticatedRequest) {
    return { unread: await this.comms.unreadCount(req.tenantContext) };
  }

  @Get('inbox')
  inbox(@Req() req: AuthenticatedRequest) {
    return this.comms.inbox(req.tenantContext);
  }

  /** Every attachment across the caller's conversations. Slice 7. */
  @Get('shared-files')
  sharedFiles(@Req() req: AuthenticatedRequest) {
    return this.comms.sharedFiles(req.tenantContext);
  }
}
