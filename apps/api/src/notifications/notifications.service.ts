import { Injectable, Logger } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { MailTransport } from './mail-transport';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * Notifications that are actually DELIVERED — migration 060.
 *
 * ── 🔴 WHAT WAS MISSING, AND FOR HOW LONG ─────────────────────────────────
 *
 * `core.notification_preferences` has existed since migration 045: a workshop
 * chooses which events it wants, on which channel, per user. The settings
 * screen reads and writes it. NOTHING HAS EVER CONSULTED IT TO SEND ANYTHING,
 * because no sender existed anywhere in the API — no mail client, no queue, no
 * outbox. The product offered a preference for a thing it could not do.
 *
 * ── 🔴 ENQUEUE IS NOT "SEND LATER", IT IS "OWE IT DURABLY" ────────────────
 *
 * `enqueue` writes a row and returns. It never sends inline, because the caller
 * is inside a business transaction — a customer filing a request, a repair
 * being authorised — and mail delivery is the least reliable thing in the
 * system. Sending inline would mean a dead SMTP relay could prevent a customer
 * filing a request. Delivery happens in `drain`, and a failure there updates
 * one row and nothing else.
 *
 * ── ⚠️ THE SUPPRESSION DECISION LIVES IN SQL, NOT HERE ────────────────────
 *
 * `comms.enqueue_notification` does the preference lookup, because it must be
 * atomic with the insert and because the "most specific preference wins,
 * silence means enabled" rule has to hold for every caller, including a future
 * one that forgets to ask. A copy of that rule in TypeScript is a second answer
 * to one question, and the two would drift.
 */

/** What a notification is about, in the vocabulary of the preferences table. */
export type NotificationEvent =
  | 'service_request.created'
  | 'service_request.decided';

export interface NotificationRow {
  id: string;
  event_key: string;
  channel: string;
  subject: string;
  body: string;
  status: string;
  read_at: string | null;
  created_at: string;
  resource_type: string | null;
  resource_id: string | null;
}

interface ClaimedRow {
  id: string;
  organization_id: string;
  recipient_id: string;
  channel: string;
  subject: string;
  body: string;
  to_address: string | null;
  attempts: number;
}

@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly mail: MailTransport,
  ) {}

  /**
   * Tell ONE person — the customer whose request was decided.
   *
   * 🔴 THE ADDRESS IS RESOLVED IN THE DATABASE, exactly as for staff. The
   * decision is taken by STAFF and the person who must hear about it is the
   * CUSTOMER, so resolving the address here would work only because staff can
   * read users in their tenant — a privilege that must not quietly become a
   * dependency of the notification system.
   */
  async notifyUser(
    client: PoolClient,
    ctx: TenantContext,
    input: {
      recipientId: string;
      event: NotificationEvent;
      subject: string;
      body: string;
      resourceType: string;
      resourceId: string;
      dedupePrefix: string;
    },
  ): Promise<number> {
    const res = await client.query<{ n: number }>(
      `SELECT comms.notify_user(
         $1::uuid, $2::uuid, $3::uuid, $4::text, $5::text,
         $6::text, $7::text, $8::uuid, $9::text) AS n`,
      [
        ctx.tenantId,
        ctx.organizationId,
        input.recipientId,
        input.event,
        input.subject,
        input.body,
        input.resourceType,
        input.resourceId,
        input.dedupePrefix,
      ],
    );
    const n = Number(res.rows[0]?.n ?? 0);
    if (n > 0) {
      await this.audit.write(client, ctx, {
        action: `notification.${input.event}`,
        resourceType: 'notification',
        resourceId: input.resourceId,
        detail: { event: input.event, written: n, recipient: input.recipientId },
      });
    }
    return n;
  }

  /** The signed-in person's own notifications. RLS pins this to them. */
  async listMine(ctx: TenantContext, limit = 50): Promise<NotificationRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query<NotificationRow>(
        `SELECT id, event_key, channel, subject, body, status, read_at,
                created_at, resource_type, resource_id
           FROM comms.notifications
          WHERE channel = 'in_app'
          ORDER BY created_at DESC
          LIMIT $1`,
        [Math.min(Math.max(limit, 1), 200)],
      );
      return res.rows;
    });
  }

  /** Unread count for the bell. Derived, never stored. */
  async unreadCount(ctx: TenantContext): Promise<number> {
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM comms.notifications
          WHERE channel = 'in_app' AND read_at IS NULL`,
      );
      return Number(res.rows[0]?.n ?? 0);
    });
  }

  /**
   * Mark one as read. No ownership check here ON PURPOSE: the UPDATE policy
   * already restricts this to `recipient_id = current_user_id()`, so a
   * mismatched id updates zero rows. A second check in TypeScript would be a
   * duplicate of the rule that actually enforces it, and the two would drift.
   */
  async markRead(ctx: TenantContext, id: string): Promise<boolean> {
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `UPDATE comms.notifications
            SET read_at = now(), updated_at = now()
          WHERE id = $1::uuid AND read_at IS NULL`,
        [id],
      );
      return (res.rowCount ?? 0) > 0;
    });
  }

  /**
   * Send what is owed. Called by the drain endpoint.
   *
   * ⚠️ RUNS WITHOUT A USER CONTEXT, deliberately — there is no signed-in person
   * when a queue drains. It reaches the rows through
   * `comms.claim_pending_notifications`, a definer function whose entire
   * surface is "claim some work, record what happened". It cannot read a
   * notification it did not claim.
   */
  async drain(limit = 50): Promise<{
    configured: boolean;
    transport: string;
    claimed: number;
    sent: number;
    failed: number;
    abandoned: number;
  }> {
    const transport = this.mail.describe();

    // Asked BEFORE claiming. Claiming rows only to fail each one would count
    // five attempts against every message and burn the retry budget for an
    // outage that was never the provider's fault.
    if (!this.mail.isConfigured()) {
      this.log.warn(`drain skipped — ${transport}`);
      return { configured: false, transport, claimed: 0, sent: 0, failed: 0, abandoned: 0 };
    }

    const claimed = await this.db.queryWithoutTenant<ClaimedRow>(
      `SELECT * FROM comms.claim_pending_notifications($1::integer)`,
      [Math.min(Math.max(limit, 1), 200)],
    );

    let sent = 0;
    let failed = 0;
    // 🔴 STOP WELL INSIDE THE LEASE. The database reclaims a row 45 minutes
    // after it was claimed, so a batch that ran longer than that would have its
    // earliest rows reclaimed and RE-SENT by the next drain while this one was
    // still working through them. Ten minutes is far short of the lease and
    // still shorter than the workflow's own timeout, so whichever limit bites
    // first, no message is in flight twice (Supervisor, 2026-08-07).
    const deadline = Date.now() + 10 * 60 * 1000;
    let abandoned = 0;
    for (const row of claimed) {
      if (Date.now() > deadline) {
        // Left in `sending`; the lease returns them to the queue in due course.
        // Deliberately NOT recorded as failures — nothing was attempted, and
        // counting an attempt would spend a retry on work never begun.
        abandoned = claimed.length - sent - failed;
        this.log.warn(
          `drain hit its 10-minute deadline; ${abandoned} message(s) left for the next run`,
        );
        break;
      }
      // The SQL claim returns only `email` rows today. Asserted here anyway,
      // because "the query only returns X" is a contract in another file and
      // this loop's only behaviour is to SEND — a future channel appearing in
      // that result would be silently emailed (Codex, 2026-08-07).
      if (row.channel !== 'email') {
        await this.record(row.id, false, `cannot send channel ${row.channel} by mail`);
        failed += 1;
        continue;
      }
      // A row with no address cannot be delivered and must not be retried for
      // ever: it is recorded as a failure with a reason a human can act on.
      if (!row.to_address) {
        await this.record(row.id, false, 'no email address on file for this recipient');
        failed += 1;
        continue;
      }
      try {
        await this.mail.send({
          to: row.to_address,
          subject: row.subject,
          body: row.body,
        });
        await this.record(row.id, true, null);
        sent += 1;
      } catch (err) {
        await this.record(row.id, false, String(err).slice(0, 500));
        failed += 1;
      }
    }

    if (claimed.length > 0) {
      this.log.log(
        `drain: ${sent} sent, ${failed} failed, ${abandoned} deferred of ${claimed.length}`,
      );
    }
    return {
      configured: true,
      transport,
      claimed: claimed.length,
      sent,
      failed,
      // Reported rather than hidden: a run that keeps deferring is a signal the
      // batch size or the relay is wrong, and it is invisible from sent/failed.
      abandoned,
    };
  }

  /**
   * One call shape for the outcome, whichever way it went.
   *
   * ⚠️ `sent` IS A BOUND PARAMETER, not a literal spliced into the SQL. The
   * first version wrote `..., true, NULL)` for success and `..., false, $2)`
   * for failure — two different argument shapes for one function, so the same
   * position meant "was it sent" in one call and "what went wrong" in the
   * other. Nothing about that is visible at either call site, and the unit
   * tests caught it only because they had to guess which was which.
   */
  private async record(id: string, sent: boolean, error: string | null): Promise<void> {
    try {
      await this.db.queryWithoutTenant(
        `SELECT comms.record_notification_result($1::uuid, $2::boolean, $3::text)`,
        [id, sent, error],
      );
    } catch (err) {
      // 🔴 NEVER LET BOOKKEEPING ABORT THE BATCH. This used to be unguarded, so
      // one transient database error after a SUCCESSFUL send would throw out of
      // `drain` entirely: every remaining claimed row stayed `sending` until its
      // lease expired, and the message just delivered was never recorded as
      // sent — so it was delivered AGAIN (Supervisor, 2026-08-07).
      //
      // Logged at error level rather than swallowed: a row whose outcome could
      // not be written WILL be resent after the lease, and that is worth seeing.
      this.log.error(
        `could not record the outcome of ${id} (sent=${sent}) — it will be retried after the lease: ${String(err)}`,
      );
    }
  }

  /**
   * Everyone at a workshop who should hear about an intake, with the address to
   * reach them at.
   *
   * 🔴 A CUSTOMER IS NEVER A RECIPIENT OF THIS. `customer` is a real membership
   * role in the workshop's own organisation — the fact behind this repository's
   * ungated-read defects — so an "all members" query would email the workshop's
   * intake to the customers who filed them.
   */
  /**
   * Tell the workshop's staff. Returns how many notifications were written.
   *
   * 🔴 THE RECIPIENTS ARE RESOLVED IN THE DATABASE, not here.
   *
   * ⚠️ CORRECTED 2026-08-07: this comment used to claim `identity.memberships`
   * "restricts a caller to their own rows (migration 039)". IT DOES NOT. The
   * base policy is `tenant_isolation` from migration 001 — TENANT-scoped, not
   * user-scoped — and 039 added a NARROWER ADDITIONAL door for the subject
   * lookup without restricting it. The Supervisor caught the false premise, and
   * this repository has a standing lesson about a comment that asserts a rule
   * which does not exist.
   *
   * The design is still right, for the reason that survives: a customer's
   * request has no business loading the workshop's staff list AND THEIR EMAIL
   * ADDRESSES into application memory merely to send a notification. Resolving
   * it here means the request causes an address to be used and never sees one.
   *
   * So the addresses never enter the customer's request at all: it causes a row
   * to be written and never sees who it went to.
   */
  async notifyWorkshopStaff(
    client: PoolClient,
    ctx: TenantContext,
    input: {
      organizationId: string;
      event: NotificationEvent;
      subject: string;
      body: string;
      resourceType: string;
      resourceId: string;
      dedupePrefix: string;
    },
  ): Promise<number> {
    const res = await client.query<{ n: number }>(
      `SELECT comms.notify_workshop_staff(
         $1::uuid, $2::uuid, $3::text, $4::text, $5::text,
         $6::text, $7::uuid, $8::text) AS n`,
      [
        ctx.tenantId,
        input.organizationId,
        input.event,
        input.subject,
        input.body,
        input.resourceType,
        input.resourceId,
        input.dedupePrefix,
      ],
    );
    const n = Number(res.rows[0]?.n ?? 0);
    if (n > 0) {
      await this.audit.write(client, ctx, {
        action: `notification.${input.event}`,
        resourceType: 'notification',
        resourceId: input.resourceId,
        detail: { event: input.event, written: n, organizationId: input.organizationId },
      });
    }
    return n;
  }
}
