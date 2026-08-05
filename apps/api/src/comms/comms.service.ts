import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * Messaging — slice 7 of `COMPLETION_PLAN.md`. Text and files; calls are 11.
 *
 * ── 🔴 MEMBERSHIP OF A THREAD IS THE ACCESS RULE ───────────────────────────
 *
 * A message is readable because you are a PARTICIPANT, never because of your
 * role. Deriving readership from role would mean every technician could read
 * every customer's private conversation with the workshop — and it would look
 * correct in a single-role test, which is how that defect survives.
 *
 * RLS gives organisation isolation (migration 046). It does NOT give
 * participant isolation, because two colleagues share an organisation. So every
 * read below carries an EXISTS on `comms.participants`, and `assertParticipant`
 * is the single place that rule lives.
 *
 * ── 🔴 UNREAD IS DERIVED, NEVER STORED ─────────────────────────────────────
 *
 * `unreadCount` counts messages in my threads that I did not send and hold no
 * receipt for. A `messages.is_read` boolean would let whoever opens a shared
 * inbox first mark everything read for everybody else — invisible with one
 * tester, obvious with two. verify/046 check 6 asserts the two-reader case.
 *
 * ── ⚠️ ATTACHMENTS ARE NOT BUILT HERE ──────────────────────────────────────
 *
 * `media.links` has carried a `message` owner type since migration 040 and
 * `MediaService` already maps it to `comms.messages`. Creating that table is
 * the whole of what slice 7 owed the attachment path. Adding a second one here
 * would duplicate a working mechanism.
 */

/**
 * Every workshop role may hold a conversation, and so may a CUSTOMER. Refusing
 * either pushes the conversation to WhatsApp, where the workshop loses the
 * record — which is the whole reason this slice exists.
 */
const MAY_START_THREAD = [
  'workshop_owner', 'workshop_manager', 'workshop_supervisor', 'reception_staff',
  'technician', 'storekeeper', 'cashier', 'quality_controller', 'platform_administrator',
  'customer',
] as const;

/**
 * 🔴 WHO RECEIVES A CUSTOMER'S MESSAGE.
 *
 * A thread is read by its PARTICIPANTS, which is right for staff-to-staff
 * conversations and would be a trap for a customer's: a customer does not know
 * who works at the workshop, so a thread they start would have exactly one
 * participant — themselves — and the workshop would never see it. A complete
 * feature with no reachable reader, which is a defect this repository has
 * recorded four times.
 *
 * So a customer-started thread is addressed to the workshop's front desk. These
 * are the roles whose job is to answer; a technician joins a specific
 * conversation when it is handed to them, rather than receiving every customer's
 * private thread by default.
 */
const CUSTOMER_THREAD_RECEIVERS = [
  'reception_staff', 'workshop_owner', 'workshop_manager',
] as const;

export interface ThreadRow {
  id: string;
  threadKind: string;
  subject: string;
  status: string;
  jobCardId: string | null;
  jobNumber: string | null;
  customerName: string | null;
  lastMessageAt: string;
  messageCount: number;
  unreadCount: number;
  participants: { userId: string; displayName: string; partyKind: string }[];
}

export interface MessageRow {
  id: string;
  body: string;
  senderUserId: string;
  senderName: string;
  sentAt: string;
  isMine: boolean;
  readByMe: boolean;
  attachmentCount: number;
}

export interface InboxItem {
  kind: string;
  title: string;
  detail: string;
  href: string;
  at: string | null;
  count: number;
}

@Injectable()
export class CommsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The one place thread membership is checked.
   *
   * ⚠️ RETURNS THE THREAD, so callers cannot accidentally check membership and
   * then read the row by a different path. A guard whose result is discarded is
   * a guard that gets skipped.
   */
  private async assertParticipant(
    client: import('pg').PoolClient,
    ctx: TenantContext,
    threadId: string,
  ): Promise<{ id: string; thread_kind: string; subject: string }> {
    const r = await client.query(
      `SELECT t.id, t.thread_kind, t.subject
         FROM comms.threads t
        WHERE t.id = $1
          AND t.tenant_id = $2
          AND t.organization_id = $3
          AND EXISTS (SELECT 1 FROM comms.participants p
                       WHERE p.thread_id = t.id AND p.user_id = $4)
        LIMIT 1`,
      [threadId, ctx.tenantId, ctx.organizationId, ctx.userId],
    );
    if (!r.rowCount) {
      // 🔴 THE SAME ANSWER FOR "no such thread" AND "not your thread".
      // Distinguishing them tells a prober which conversations exist, and this
      // product refuses that everywhere else too.
      throw new NotFoundException(
        'That conversation is not one of yours. You can see the ones you are part of on the messages page, ' +
          'or start a new one.',
      );
    }
    return r.rows[0] as { id: string; thread_kind: string; subject: string };
  }

  async listThreads(ctx: TenantContext, kind?: string): Promise<ThreadRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT t.id, t.thread_kind, t.subject, t.status, t.job_card_id,
                jc.job_number,
                COALESCE(NULLIF(btrim(c.display_name), ''), NULL) AS customer_name,
                t.last_message_at,
                (SELECT count(*) FROM comms.messages m WHERE m.thread_id = t.id) AS message_count,
                -- Unread FOR ME: not sent by me, no receipt of mine.
                (SELECT count(*) FROM comms.messages m
                  WHERE m.thread_id = t.id
                    AND m.sender_user_id <> $4
                    AND NOT EXISTS (SELECT 1 FROM comms.read_receipts rr
                                     WHERE rr.message_id = m.id AND rr.user_id = $4)
                ) AS unread_count
           FROM comms.threads t
           LEFT JOIN repair.job_cards jc ON jc.id = t.job_card_id
           LEFT JOIN core.customers   c  ON c.id  = t.customer_id
          WHERE t.tenant_id = $1
            AND t.organization_id = $2
            AND ($3::text IS NULL OR t.thread_kind = $3)
            -- Participation, not role. See the class comment.
            AND EXISTS (SELECT 1 FROM comms.participants p
                         WHERE p.thread_id = t.id AND p.user_id = $4)
          ORDER BY t.last_message_at DESC
          LIMIT 200`,
        [ctx.tenantId, ctx.organizationId, kind ?? null, ctx.userId],
      );

      const ids = r.rows.map((x) => x.id as string);
      const people = ids.length
        ? await client.query(
            `SELECT p.thread_id, p.user_id, p.party_kind,
                    COALESCE(NULLIF(btrim(u.display_name), ''), u.email) AS display_name
               FROM comms.participants p
               JOIN identity.users u ON u.id = p.user_id
              WHERE p.thread_id = ANY($1::uuid[])
              ORDER BY p.added_at`,
            [ids],
          )
        : { rows: [] as Record<string, unknown>[] };

      return r.rows.map((x) => ({
        id: x.id as string,
        threadKind: x.thread_kind as string,
        subject: x.subject as string,
        status: x.status as string,
        jobCardId: (x.job_card_id as string | null) ?? null,
        jobNumber: (x.job_number as string | null) ?? null,
        customerName: (x.customer_name as string | null) ?? null,
        lastMessageAt: (x.last_message_at as Date).toISOString(),
        messageCount: Number(x.message_count),
        unreadCount: Number(x.unread_count),
        participants: people.rows
          .filter((p) => p.thread_id === x.id)
          .map((p) => ({
            userId: p.user_id as string,
            displayName: p.display_name as string,
            partyKind: p.party_kind as string,
          })),
      }));
    });
  }

  async listMessages(ctx: TenantContext, threadId: string): Promise<MessageRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      await this.assertParticipant(client, ctx, threadId);
      const r = await client.query(
        `SELECT m.id, m.body, m.sender_user_id, m.sent_at,
                COALESCE(NULLIF(btrim(u.display_name), ''), u.email) AS sender_name,
                EXISTS (SELECT 1 FROM comms.read_receipts rr
                         WHERE rr.message_id = m.id AND rr.user_id = $2) AS read_by_me,
                (SELECT count(*) FROM media.links l
                  WHERE l.owner_type = 'message' AND l.owner_id = m.id) AS attachment_count
           FROM comms.messages m
           JOIN identity.users u ON u.id = m.sender_user_id
          WHERE m.thread_id = $1
          ORDER BY m.sent_at, m.id`,
        [threadId, ctx.userId],
      );
      return r.rows.map((x) => ({
        id: x.id as string,
        body: x.body as string,
        senderUserId: x.sender_user_id as string,
        senderName: x.sender_name as string,
        sentAt: (x.sent_at as Date).toISOString(),
        isMine: (x.sender_user_id as string) === ctx.userId,
        readByMe: x.read_by_me as boolean,
        attachmentCount: Number(x.attachment_count),
      }));
    });
  }

  async createThread(
    ctx: TenantContext,
    input: {
      threadKind: string;
      subject: string;
      body: string;
      jobCardId?: string;
      customerId?: string;
      participantUserIds?: string[];
    },
  ): Promise<{ threadId: string }> {
    if (!MAY_START_THREAD.includes(ctx.activeRole as (typeof MAY_START_THREAD)[number])) {
      throw new ForbiddenException(
        'Your role cannot start a conversation here. You can still reply to any conversation you are part of.',
      );
    }

    return this.db.withTenant(ctx, async (client) => {
      // The job card must be THIS workshop's. RLS is tenant+org scoped, and the
      // explicit predicate makes the refusal a clear message rather than a
      // foreign-key error.
      // 🔴 THE SAME DEFECT MIGRATION 050 FIXED FOR CASES AND CALLS, AND
      // THREADS WERE LEFT OUT OF BOTH. Found by the Supervisor.
      //
      // Organisation scope does not separate two CUSTOMERS. A customer holding
      // another's job-card uuid could open a thread against it, and
      // `listThreads` joins and echoes that job number back. `customerId` was
      // not validated at all, which echoed the other customer's display name.
      const isCustomer = ctx.activeRole === 'customer';

      if (input.jobCardId) {
        const jc = isCustomer
          ? await client.query(
              `SELECT 1
                 FROM repair.job_cards jc
                 JOIN core.customers c ON c.id = jc.customer_id
                WHERE jc.id = $1 AND jc.tenant_id = $2 AND jc.organization_id = $3
                  AND c.user_id = $4
                LIMIT 1`,
              [input.jobCardId, ctx.tenantId, ctx.organizationId, ctx.userId],
            )
          : await client.query(
              `SELECT 1 FROM repair.job_cards
                WHERE id = $1 AND tenant_id = $2 AND organization_id = $3 LIMIT 1`,
              [input.jobCardId, ctx.tenantId, ctx.organizationId],
            );
        if (!jc.rowCount) {
          throw new NotFoundException(
            isCustomer
              ? 'That repair is not one of yours. You can message about any repair in your history.'
              : 'That job card is not in this workshop.',
          );
        }
      }

      // A customer never names a customer: it is always themselves. Trusting
      // the body here is what echoed somebody else's name back.
      let customerId = input.customerId ?? null;
      if (isCustomer) {
        const mine = await client.query<{ id: string }>(
          `SELECT id FROM core.customers
            WHERE tenant_id = $1 AND organization_id = $2 AND user_id = $3 LIMIT 1`,
          [ctx.tenantId, ctx.organizationId, ctx.userId],
        );
        customerId = mine.rows[0]?.id ?? null;
      } else if (customerId) {
        const exists = await client.query(
          `SELECT 1 FROM core.customers
            WHERE id = $1 AND tenant_id = $2 AND organization_id = $3 LIMIT 1`,
          [customerId, ctx.tenantId, ctx.organizationId],
        );
        if (!exists.rowCount) {
          throw new NotFoundException('That customer is not in this workshop.');
        }
      }

      const created = await client.query<{ id: string }>(
        `INSERT INTO comms.threads
           (tenant_id, organization_id, thread_kind, subject, job_card_id, customer_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id`,
        [
          ctx.tenantId,
          ctx.organizationId,
          input.threadKind,
          input.subject.trim(),
          input.jobCardId ?? null,
          customerId,
          ctx.userId,
        ],
      );
      const threadId = created.rows[0]!.id;

      // 🔴 THE CREATOR IS ADDED FIRST AND UNCONDITIONALLY. A thread whose
      // author is not a participant is one they cannot read back — a control
      // with nowhere to go, which is the dead-end defect this repo has recorded
      // repeatedly.
      const invited = new Set<string>([ctx.userId, ...(input.participantUserIds ?? [])]);

      // …and a CUSTOMER's thread is addressed to the front desk, because a
      // customer cannot name the staff to invite. Without this a customer's
      // message would sit in a thread only they could read.
      if (ctx.activeRole === 'customer') {
        const desk = await client.query<{ user_id: string }>(
          `SELECT DISTINCT user_id
             FROM identity.memberships
            WHERE tenant_id = $1 AND organization_id = $2
              AND status = 'active'
              AND role_name = ANY($3::text[])`,
          [ctx.tenantId, ctx.organizationId, [...CUSTOMER_THREAD_RECEIVERS]],
        );
        for (const row of desk.rows) invited.add(row.user_id);

        // ⚠️ IF THE WORKSHOP HAS NOBODY ON THE FRONT DESK, SAY SO rather than
        // accepting a message into a void. A silent success here is the worst
        // outcome: the customer believes they have been in touch.
        if (desk.rowCount === 0) {
          throw new BadRequestException(
            'This workshop has nobody set up to receive messages yet, so your message would not reach anyone. ' +
              'Please call them instead — their number is on the workshop profile.',
          );
        }
      }
      for (const userId of invited) {
        await client.query(
          `INSERT INTO comms.participants
             (tenant_id, organization_id, thread_id, user_id, party_kind, added_by)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT ON CONSTRAINT uq_participant DO NOTHING`,
          [
            ctx.tenantId,
            ctx.organizationId,
            threadId,
            userId,
            // The stance each person takes in THIS conversation. When a
            // customer starts it they are the customer and everyone they reach
            // is the workshop; when the workshop starts it, the invitees on a
            // customer thread are the customers.
            ctx.activeRole === 'customer'
              ? userId === ctx.userId
                ? 'customer'
                : 'workshop'
              : input.threadKind === 'customer' && userId !== ctx.userId
                ? 'customer'
                : 'workshop',
            ctx.userId,
          ],
        );
      }

      await client.query(
        `INSERT INTO comms.messages
           (tenant_id, organization_id, thread_id, sender_user_id, body)
         VALUES ($1,$2,$3,$4,$5)`,
        [ctx.tenantId, ctx.organizationId, threadId, ctx.userId, input.body],
      );

      await this.audit.write(client, ctx, {
        action: 'comms.thread.created',
        resourceType: 'thread',
        resourceId: threadId,
        detail: { threadKind: input.threadKind, jobCardId: input.jobCardId ?? null },
      });

      return { threadId };
    });
  }

  async postMessage(
    ctx: TenantContext,
    threadId: string,
    body: string,
  ): Promise<{ messageId: string }> {
    return this.db.withTenant(ctx, async (client) => {
      const thread = await this.assertParticipant(client, ctx, threadId);

      const closed = await client.query(
        `SELECT 1 FROM comms.threads WHERE id = $1 AND status = 'closed' LIMIT 1`,
        [threadId],
      );
      if (closed.rowCount) {
        throw new BadRequestException(
          `"${thread.subject}" has been closed. Start a new conversation — a closed thread stays readable as the record of what was said.`,
        );
      }

      const created = await client.query<{ id: string }>(
        `INSERT INTO comms.messages
           (tenant_id, organization_id, thread_id, sender_user_id, body)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id`,
        [ctx.tenantId, ctx.organizationId, threadId, ctx.userId, body],
      );

      await this.audit.write(client, ctx, {
        action: 'comms.message.sent',
        resourceType: 'message',
        resourceId: created.rows[0]!.id,
        // The fact, never the words. An audit trail of message bodies is a
        // second copy of every private conversation.
        detail: { threadId, length: body.length },
      });

      return { messageId: created.rows[0]!.id };
    });
  }

  /** Idempotent: `ON CONFLICT DO NOTHING`, so a retry is not a second reading. */
  async markThreadRead(ctx: TenantContext, threadId: string): Promise<{ marked: number }> {
    return this.db.withTenant(ctx, async (client) => {
      await this.assertParticipant(client, ctx, threadId);
      const r = await client.query(
        `INSERT INTO comms.read_receipts (tenant_id, organization_id, message_id, user_id)
         SELECT $1, $2, m.id, $4
           FROM comms.messages m
          WHERE m.thread_id = $3
            AND m.sender_user_id <> $4
         ON CONFLICT ON CONSTRAINT uq_receipt DO NOTHING`,
        [ctx.tenantId, ctx.organizationId, threadId, ctx.userId],
      );
      return { marked: r.rowCount ?? 0 };
    });
  }

  /**
   * The number behind the layout's badge.
   *
   * 🔴 THIS REPLACES A HARDCODED `5` that sat in `layout.tsx` beside six other
   * invented figures. A fabricated counter on the first screen every user sees
   * is not a placeholder, it is the product telling them something untrue.
   */
  async unreadCount(ctx: TenantContext): Promise<number> {
    return this.db.withTenant(ctx, async (client) => {
      const r = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n
           FROM comms.messages m
           JOIN comms.participants p ON p.thread_id = m.thread_id AND p.user_id = $3
          WHERE m.tenant_id = $1
            AND m.organization_id = $2
            AND m.sender_user_id <> $3
            AND NOT EXISTS (SELECT 1 FROM comms.read_receipts rr
                             WHERE rr.message_id = m.id AND rr.user_id = $3)`,
        [ctx.tenantId, ctx.organizationId, ctx.userId],
      );
      return Number(r.rows[0]?.n ?? '0');
    });
  }

  /**
   * `/home/notification-inbox` — one place for everything waiting.
   *
   * ⚠️ EVERY ROW IS A REAL COUNT OVER A REAL TABLE, and every one carries a
   * `href` that leads somewhere that EXISTS. The signpost this replaces promised
   * "one place for every alert the workshop raises"; an inbox of invented alerts
   * pointing at unbuilt screens would be worse than the signpost was.
   *
   * Zero rows means nothing is waiting, and the screen says exactly that.
   */
  async inbox(ctx: TenantContext): Promise<InboxItem[]> {
    return this.db.withTenant(ctx, async (client) => {
      const items: InboxItem[] = [];

      const unread = await client.query<{ n: string; at: Date | null }>(
        `SELECT count(*)::text AS n, max(m.sent_at) AS at
           FROM comms.messages m
           JOIN comms.participants p ON p.thread_id = m.thread_id AND p.user_id = $3
          WHERE m.tenant_id = $1 AND m.organization_id = $2
            AND m.sender_user_id <> $3
            AND NOT EXISTS (SELECT 1 FROM comms.read_receipts rr
                             WHERE rr.message_id = m.id AND rr.user_id = $3)`,
        [ctx.tenantId, ctx.organizationId, ctx.userId],
      );
      if (Number(unread.rows[0]?.n ?? '0') > 0) {
        items.push({
          kind: 'messages',
          title: 'Unread messages',
          detail: 'Conversations you are part of with messages you have not read.',
          href: '/communication/messages',
          at: unread.rows[0]?.at ? unread.rows[0]!.at!.toISOString() : null,
          count: Number(unread.rows[0]!.n),
        });
      }

      // Stock at or below its reorder level. Read from the ledger view, so this
      // agrees with the parts screens rather than keeping its own count.
      const reorder = await client.query<{ n: string }>(
        // `needs_reorder` is a column OF the view, so this cannot disagree
        // with the parts screens — they read the same computed flag rather
        // than each re-deriving "at or below reorder level" their own way.
        `SELECT count(*)::text AS n
           FROM parts.stock_on_hand s
          WHERE s.tenant_id = $1 AND s.organization_id = $2
            AND s.is_active
            AND s.needs_reorder`,
        [ctx.tenantId, ctx.organizationId],
      );
      if (Number(reorder.rows[0]?.n ?? '0') > 0) {
        items.push({
          kind: 'stock',
          title: 'Parts at or below reorder level',
          detail: 'Stock that wants ordering before a job needs it.',
          href: '/parts-and-suppliers/inventory',
          at: null,
          count: Number(reorder.rows[0]!.n),
        });
      }

      const proposals = await client.query<{ n: string; at: Date | null }>(
        `SELECT count(*)::text AS n, max(created_at) AS at
           FROM repair.repair_proposals
          WHERE tenant_id = $1 AND organization_id = $2
            -- 🔴 'issued', NOT 'awaiting_decision'. There is no such status:
            -- the CHECK allows draft / issued / approved / declined /
            -- changes_requested / superseded, and 'issued' with a NULL
            -- decision IS the awaiting state. A guessed enum value would have
            -- counted zero for ever and read as nothing is waiting.
            AND status = 'issued'
            AND decision IS NULL`,
        [ctx.tenantId, ctx.organizationId],
      );
      if (Number(proposals.rows[0]?.n ?? '0') > 0) {
        items.push({
          kind: 'approvals',
          title: 'Repairs awaiting a decision',
          detail: 'Work proposed to a customer that has not been approved or declined.',
          href: '/home/tasks-and-approvals',
          at: proposals.rows[0]?.at ? proposals.rows[0]!.at!.toISOString() : null,
          count: Number(proposals.rows[0]!.n),
        });
      }

      return items;
    });
  }

  /**
   * Every file shared in a conversation this person is part of.
   *
   * ⚠️ A DIFFERENT VIEW OF `media.links`, NOT A SECOND STORE. Attachments have
   * lived there since migration 040 under `owner_type = 'message'`; this reads
   * them across every thread instead of one at a time. A separate "shared
   * files" table would have created two places a file could be and no rule for
   * which one to look in.
   *
   * ⚠️ THE PARTICIPATION JOIN IS THE ACCESS RULE, exactly as in `listMessages`.
   * `media.links` RLS is organisation-scoped, which does NOT keep one
   * colleague's private thread from another — so the EXISTS is what keeps this
   * honest, not the policy.
   *
   * ⚠️ `confirmed_at IS NOT NULL` — an asset whose upload was never confirmed
   * has a row and no bytes behind it. Listing it would offer a file that
   * cannot be opened.
   */
  async sharedFiles(ctx: TenantContext): Promise<{
    assetId: string; fileName: string; contentType: string; sizeBytes: number | null;
    sharedAt: string; threadSubject: string; senderName: string; jobNumber: string | null;
  }[]> {
    return this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT a.id AS asset_id, a.original_name, a.content_type, a.byte_size,
                l.created_at AS shared_at,
                t.subject AS thread_subject,
                jc.job_number,
                COALESCE(NULLIF(btrim(u.display_name), ''), u.email) AS sender_name
           FROM media.links l
           JOIN media.assets a  ON a.id = l.asset_id
           JOIN comms.messages m ON m.id = l.owner_id
           JOIN comms.threads  t ON t.id = m.thread_id
           JOIN identity.users u ON u.id = m.sender_user_id
           LEFT JOIN repair.job_cards jc ON jc.id = t.job_card_id
          WHERE l.owner_type = 'message'
            AND l.tenant_id = $1
            AND l.organization_id = $2
            AND a.confirmed_at IS NOT NULL
            AND EXISTS (SELECT 1 FROM comms.participants p
                         WHERE p.thread_id = t.id AND p.user_id = $3)
          ORDER BY l.created_at DESC
          LIMIT 200`,
        [ctx.tenantId, ctx.organizationId, ctx.userId],
      );
      return r.rows.map((x) => ({
        assetId: x.asset_id as string,
        fileName: (x.original_name as string | null) ?? 'file',
        contentType: (x.content_type as string | null) ?? 'application/octet-stream',
        sizeBytes: x.byte_size === null ? null : Number(x.byte_size),
        sharedAt: (x.shared_at as Date).toISOString(),
        threadSubject: x.thread_subject as string,
        senderName: x.sender_name as string,
        jobNumber: (x.job_number as string | null) ?? null,
      }));
    });
  }
}
