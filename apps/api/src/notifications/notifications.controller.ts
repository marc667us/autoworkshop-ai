import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import { NotificationsService } from './notifications.service';

/**
 * The signed-in person's own notifications, and the drain.
 *
 * ⚠️ `TenantGuard` answers WHO YOU ARE, not what you may do — so it is not the
 * authorization for these routes. It does not need to be: every read is pinned
 * by RLS to `recipient_id = current_user_id()`, so there is no role that can
 * see somebody else's mail and no role check that would add anything. This is
 * deliberately unlike the settings and parts controllers, where reads WERE
 * ungated and a customer could read the whole workshop — the difference is that
 * those rows belong to the organisation and these belong to a person.
 */
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @UseGuards(TenantGuard)
  list(@Req() req: AuthenticatedRequest, @Query('limit') limit?: string) {
    const n = Number.parseInt(limit ?? '50', 10);
    return this.notifications.listMine(
      req.tenantContext,
      Number.isFinite(n) ? n : 50,
    );
  }

  @Get('unread-count')
  @UseGuards(TenantGuard)
  async unread(@Req() req: AuthenticatedRequest) {
    return { count: await this.notifications.unreadCount(req.tenantContext) };
  }

  @Post(':id/read')
  @UseGuards(TenantGuard)
  async read(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    // `false` means the row was already read OR is not this person's. The two
    // are deliberately not distinguished: telling a caller "that notification
    // exists but is not yours" confirms the existence of somebody else's mail.
    return { updated: await this.notifications.markRead(req.tenantContext, id) };
  }

  /**
   * Send what is owed.
   *
   * 🔴 NOT BEHIND `TenantGuard`. A queue drain has NO SIGNED-IN USER — that is
   * what makes it a drain — so a guard that resolves a person could never let
   * it through. It is authorised by a shared secret instead, the same shape
   * Solar uses for its GitHub-cron job drains.
   *
   * ⚠️ WHEN THE SECRET IS UNSET THE ROUTE IS REFUSED, not opened. A missing
   * configuration must never be a public endpoint that empties a mail queue,
   * and "fails closed" is the only default that survives somebody forgetting.
   *
   * ⚠️ `timingSafeEqual`, and a LENGTH CHECK FIRST because it throws on
   * mismatched lengths — a comparison that throws on the common case is not a
   * comparison. Solar has a recorded defect for exactly this
   * (`compare_digest` on a `str`, four remotely-triggerable 500s).
   */
  @Post('drain')
  async drain(
    @Headers('x-drain-token') token: string | undefined,
    @Query('limit') limit?: string,
  ) {
    const expected = this.config.get<string>('NOTIFICATIONS_DRAIN_TOKEN', '');
    if (!expected) {
      throw new ForbiddenException('the drain is not configured');
    }
    const given = Buffer.from(token ?? '', 'utf8');
    const want = Buffer.from(expected, 'utf8');
    if (given.length !== want.length || !timingSafeEqual(given, want)) {
      throw new ForbiddenException('bad drain token');
    }
    const n = Number.parseInt(limit ?? '50', 10);
    return this.notifications.drain(Number.isFinite(n) ? n : 50);
  }
}
