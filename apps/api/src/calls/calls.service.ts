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
 * In-app voice and video — slice 11 of `COMPLETION_PLAN.md`.
 *
 * ── 🔴 THIS SERVICE IS THE SIGNALLING SERVER ───────────────────────────────
 *
 * The first design for this slice concluded WebRTC could not ship, because
 * coturn needs a UDP relay range Render's free tier does not expose. That
 * treated three separate things as one:
 *
 *   · SIGNALLING is a handful of small messages — one SDP offer, one answer, a
 *     few ICE candidates — over a few seconds. It needs a MESSAGE CHANNEL, and
 *     this platform already has one. `postSignal` and `pollSignals` below ARE
 *     the signalling server.
 *   · STUN answers "what is my public address?". Stateless, free, sees no
 *     media and no signalling content.
 *   · TURN relays media when no direct path exists. That is the only piece
 *     needing a UDP relay, and it is a FALLBACK, not a requirement.
 *
 * Once the peers have negotiated, **media flows browser to browser and never
 * touches this platform** — which is more private than routing a customer's
 * repair conversation through a third party would have been.
 *
 * ── 🔴 MEMBERSHIP OF THE CALL IS THE ACCESS RULE ───────────────────────────
 *
 * Signals carry SDP and ICE: the network addresses of two people's machines.
 * RLS gives organisation isolation (migration 049) and CANNOT give participant
 * isolation, because two colleagues share an organisation. So every read and
 * every write below goes through `assertParticipant`, exactly as `CommsService`
 * does for threads — a policy that cannot state the rule must not be trusted to
 * enforce it.
 *
 * ── ⚠️ POLLING, NOT SOCKETS, AND DELIBERATELY ──────────────────────────────
 *
 * A WebSocket would need a long-lived connection per participant on a free
 * instance that sleeps. Signalling is bounded — a few messages while the call
 * connects — so a short poll on `seq` is the right shape and needs no new
 * transport. `seq` is an identity column, so "everything after N" cannot miss a
 * candidate the way a timestamp cursor can.
 */

/** Every workshop role may hold a conversation; so may a customer. As slice 7. */
const MAY_START_CALL = [
  'workshop_owner', 'workshop_manager', 'workshop_supervisor', 'reception_staff',
  'technician', 'storekeeper', 'cashier', 'quality_controller', 'platform_administrator',
  'customer',
] as const;

/** Who a customer's call reaches when they cannot name anybody. As slice 7. */
const CUSTOMER_CALL_RECEIVERS = [
  'reception_staff', 'workshop_owner', 'workshop_manager',
] as const;

export interface CallRow {
  id: string;
  callKind: string;
  medium: string;
  subject: string;
  status: string;
  scheduledFor: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMinutes: number | null;
  outcome: string | null;
  jobCardId: string | null;
  jobNumber: string | null;
  threadId: string | null;
  participants: { userId: string; displayName: string; partyKind: string; joined: boolean }[];
  isMine: boolean;
}

export interface SignalRow {
  seq: string;
  fromUserId: string;
  signalKind: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class CallsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The one place call membership is checked. Returns the call so a caller
   * cannot check membership and then read the row by another path — a guard
   * whose result is discarded is a guard that gets skipped.
   */
  private async assertParticipant(
    client: import('pg').PoolClient,
    ctx: TenantContext,
    callId: string,
  ): Promise<{ id: string; status: string; medium: string; subject: string }> {
    const r = await client.query(
      `SELECT c.id, c.status, c.medium, c.subject
         FROM comms.calls c
        WHERE c.id = $1
          AND c.tenant_id = $2
          AND c.organization_id = $3
          AND EXISTS (SELECT 1 FROM comms.call_participants p
                       WHERE p.call_id = c.id AND p.user_id = $4)
        LIMIT 1`,
      [callId, ctx.tenantId, ctx.organizationId, ctx.userId],
    );
    if (!r.rowCount) {
      // The same answer for "no such call" and "not your call": distinguishing
      // them tells a prober which conversations exist.
      throw new NotFoundException(
        'That call is not one of yours. The calls page lists the ones you are on.',
      );
    }
    return r.rows[0] as { id: string; status: string; medium: string; subject: string };
  }

  async listCalls(ctx: TenantContext, kind?: string): Promise<CallRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT c.id, c.call_kind, c.medium, c.subject, c.status, c.scheduled_for,
                c.started_at, c.ended_at, c.outcome, c.job_card_id, c.thread_id,
                jc.job_number,
                CASE WHEN c.started_at IS NOT NULL AND c.ended_at IS NOT NULL
                     THEN round(EXTRACT(EPOCH FROM (c.ended_at - c.started_at)) / 60.0)
                     ELSE NULL END AS duration_minutes
           FROM comms.calls c
           LEFT JOIN repair.job_cards jc ON jc.id = c.job_card_id
          WHERE c.tenant_id = $1
            AND c.organization_id = $2
            AND ($3::text IS NULL OR c.call_kind = $3)
            -- Participation, not role.
            AND EXISTS (SELECT 1 FROM comms.call_participants p
                         WHERE p.call_id = c.id AND p.user_id = $4)
          ORDER BY COALESCE(c.started_at, c.scheduled_for, c.created_at) DESC
          LIMIT 200`,
        [ctx.tenantId, ctx.organizationId, kind ?? null, ctx.userId],
      );

      const ids = r.rows.map((x) => x.id as string);
      const people = ids.length
        ? await client.query(
            `SELECT p.call_id, p.user_id, p.party_kind, (p.joined_at IS NOT NULL) AS joined,
                    COALESCE(NULLIF(btrim(u.display_name), ''), u.email) AS display_name
               FROM comms.call_participants p
               JOIN identity.users u ON u.id = p.user_id
              WHERE p.call_id = ANY($1::uuid[])
              ORDER BY p.added_at`,
            [ids],
          )
        : { rows: [] as Record<string, unknown>[] };

      return r.rows.map((x) => ({
        id: x.id as string,
        callKind: x.call_kind as string,
        medium: x.medium as string,
        subject: x.subject as string,
        status: x.status as string,
        scheduledFor: x.scheduled_for ? (x.scheduled_for as Date).toISOString() : null,
        startedAt: x.started_at ? (x.started_at as Date).toISOString() : null,
        endedAt: x.ended_at ? (x.ended_at as Date).toISOString() : null,
        durationMinutes: x.duration_minutes === null ? null : Number(x.duration_minutes),
        outcome: (x.outcome as string | null) ?? null,
        jobCardId: (x.job_card_id as string | null) ?? null,
        jobNumber: (x.job_number as string | null) ?? null,
        threadId: (x.thread_id as string | null) ?? null,
        isMine: true,
        participants: people.rows
          .filter((p) => p.call_id === x.id)
          .map((p) => ({
            userId: p.user_id as string,
            displayName: p.display_name as string,
            partyKind: p.party_kind as string,
            joined: p.joined as boolean,
          })),
      }));
    });
  }

  async createCall(
    ctx: TenantContext,
    input: {
      callKind: string;
      medium: string;
      subject: string;
      scheduledFor?: string;
      jobCardId?: string;
      threadId?: string;
      participantUserIds?: string[];
    },
  ): Promise<{ callId: string }> {
    if (!MAY_START_CALL.includes(ctx.activeRole as (typeof MAY_START_CALL)[number])) {
      throw new ForbiddenException(
        'Your role cannot start a call. You can still join any call you are invited to, and message the workshop from the messages page.',
      );
    }

    return this.db.withTenant(ctx, async (client) => {
      if (input.jobCardId) {
        const jc = await client.query(
          `SELECT 1 FROM repair.job_cards
            WHERE id = $1 AND tenant_id = $2 AND organization_id = $3 LIMIT 1`,
          [input.jobCardId, ctx.tenantId, ctx.organizationId],
        );
        if (!jc.rowCount) throw new NotFoundException('That job card is not in this workshop.');
      }

      // 🔴 AN IN-APP CALL STARTS `ringing`, NOT `scheduled`. A scheduled call
      // needs a time (migration 049 refuses one without); a call you are
      // placing right now has no future time and must not be forced to invent
      // one. Getting this wrong would have made "call now" impossible.
      const immediate = !input.scheduledFor;
      const status = immediate ? 'ringing' : 'scheduled';

      const created = await client.query<{ id: string }>(
        `INSERT INTO comms.calls
           (tenant_id, organization_id, call_kind, medium, subject, status,
            scheduled_for, job_card_id, thread_id, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
         RETURNING id`,
        [
          ctx.tenantId, ctx.organizationId, input.callKind, input.medium,
          input.subject.trim(), status, input.scheduledFor ?? null,
          input.jobCardId ?? null, input.threadId ?? null, ctx.userId,
        ],
      );
      const callId = created.rows[0]!.id;

      // The caller is added first and unconditionally: a call its own author
      // cannot join is a control with nowhere to go.
      const invited = new Set<string>([ctx.userId, ...(input.participantUserIds ?? [])]);

      // A customer cannot name workshop staff, so their call reaches the front
      // desk — the same rule slice 7 applies to threads, and refusing loudly
      // when there is nobody to reach beats ringing into a void.
      if (ctx.activeRole === 'customer') {
        const desk = await client.query<{ user_id: string }>(
          `SELECT DISTINCT user_id FROM identity.memberships
            WHERE tenant_id = $1 AND organization_id = $2 AND status = 'active'
              AND role_name = ANY($3::text[])`,
          [ctx.tenantId, ctx.organizationId, [...CUSTOMER_CALL_RECEIVERS]],
        );
        for (const row of desk.rows) invited.add(row.user_id);
        if (desk.rowCount === 0) {
          throw new BadRequestException(
            'This workshop has nobody set up to take calls yet, so nobody would be rung. Please phone them instead — the number is on the workshop profile.',
          );
        }
      }

      if (invited.size < 2) {
        // A call with one participant can never connect. Refusing here is
        // kinder than a Join button that waits for a peer who was never asked.
        throw new BadRequestException(
          'A call needs somebody to call. Choose at least one other person.',
        );
      }

      for (const userId of invited) {
        await client.query(
          `INSERT INTO comms.call_participants
             (tenant_id, organization_id, call_id, user_id, party_kind, added_by)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT ON CONSTRAINT uq_call_participant DO NOTHING`,
          [
            ctx.tenantId, ctx.organizationId, callId, userId,
            ctx.activeRole === 'customer'
              ? userId === ctx.userId ? 'customer' : 'workshop'
              : input.callKind === 'customer' && userId !== ctx.userId ? 'customer' : 'workshop',
            ctx.userId,
          ],
        );
      }

      await client.query(
        `INSERT INTO comms.call_events
           (tenant_id, organization_id, call_id, event_kind, recorded_by)
         VALUES ($1,$2,$3,$4,$5)`,
        [ctx.tenantId, ctx.organizationId, callId, immediate ? 'ringing' : 'scheduled', ctx.userId],
      );

      await this.audit.write(client, ctx, {
        action: 'comms.call.created',
        resourceType: 'call',
        resourceId: callId,
        detail: { medium: input.medium, callKind: input.callKind },
      });

      return { callId };
    });
  }

  /**
   * This browser has attached to the media session.
   *
   * ⚠️ JOINING IS NOT THE SAME AS BEING INVITED, and the two are different
   * columns. "Did they actually pick up?" is the question a call log exists to
   * answer, and an invitation list cannot answer it.
   */
  async join(ctx: TenantContext, callId: string): Promise<{ status: string }> {
    return this.db.withTenant(ctx, async (client) => {
      const call = await this.assertParticipant(client, ctx, callId);
      if (call.status === 'completed' || call.status === 'cancelled') {
        throw new BadRequestException(
          `"${call.subject}" has already ended. Its outcome is on the call log; start a new call if there is more to discuss.`,
        );
      }

      await client.query(
        `UPDATE comms.call_participants
            SET joined_at = COALESCE(joined_at, now())
          WHERE call_id = $1 AND user_id = $2`,
        [callId, ctx.userId],
      );
      await client.query(
        `UPDATE comms.calls
            SET status = CASE WHEN status IN ('scheduled','ringing') THEN 'in_progress' ELSE status END,
                started_at = COALESCE(started_at, now()),
                updated_by = $2, updated_at = now()
          WHERE id = $1`,
        [callId, ctx.userId],
      );
      await client.query(
        `INSERT INTO comms.call_events
           (tenant_id, organization_id, call_id, event_kind, recorded_by)
         VALUES ($1,$2,$3,'joined',$4)`,
        [ctx.tenantId, ctx.organizationId, callId, ctx.userId],
      );
      return { status: 'in_progress' };
    });
  }

  /**
   * Write one signal for the other peer.
   *
   * ⚠️ THE PAYLOAD IS NOT INSPECTED, and must not be. It is opaque SDP or an
   * ICE candidate, produced by the browser's own WebRTC stack; parsing or
   * "validating" it here would break every codec negotiation this platform has
   * not heard of. What IS enforced is that the sender is on the call.
   */
  async postSignal(
    ctx: TenantContext,
    callId: string,
    input: { signalKind: string; payload: Record<string, unknown>; toUserId?: string },
  ): Promise<{ seq: string }> {
    return this.db.withTenant(ctx, async (client) => {
      await this.assertParticipant(client, ctx, callId);

      if (input.toUserId) {
        const peer = await client.query(
          `SELECT 1 FROM comms.call_participants
            WHERE call_id = $1 AND user_id = $2 LIMIT 1`,
          [callId, input.toUserId],
        );
        if (!peer.rowCount) {
          throw new NotFoundException('That person is not on this call.');
        }
      }

      const r = await client.query<{ seq: string }>(
        `INSERT INTO comms.call_signals
           (tenant_id, organization_id, call_id, from_user_id, to_user_id, signal_kind, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
         RETURNING seq::text AS seq`,
        [
          ctx.tenantId, ctx.organizationId, callId, ctx.userId,
          input.toUserId ?? null, input.signalKind, JSON.stringify(input.payload),
        ],
      );
      return { seq: r.rows[0]!.seq };
    });
  }

  /**
   * Everything on this call addressed to me, after `afterSeq`.
   *
   * ⚠️ `seq`, NOT A TIMESTAMP. Two ICE candidates written in the same
   * millisecond still have a defined order, and a cursor on an identity column
   * cannot skip one — a dropped candidate is a call that fails to connect for a
   * reason nobody can reproduce.
   *
   * ⚠️ AND NEVER MY OWN SIGNALS BACK. Feeding a peer its own offer would make
   * it set a remote description from itself, which fails in a way that reads
   * like a browser bug.
   */
  async pollSignals(
    ctx: TenantContext,
    callId: string,
    afterSeq: string,
  ): Promise<SignalRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      await this.assertParticipant(client, ctx, callId);
      const r = await client.query(
        `SELECT seq::text AS seq, from_user_id, signal_kind, payload
           FROM comms.call_signals
          WHERE call_id = $1
            AND seq > $2::bigint
            AND from_user_id <> $3
            AND (to_user_id IS NULL OR to_user_id = $3)
          ORDER BY seq
          LIMIT 200`,
        [callId, afterSeq || '0', ctx.userId],
      );
      return r.rows.map((x) => ({
        seq: x.seq as string,
        fromUserId: x.from_user_id as string,
        signalKind: x.signal_kind as string,
        payload: (x.payload as Record<string, unknown>) ?? {},
      }));
    });
  }

  /**
   * Record an event on the call — including, importantly, a failed connection.
   *
   * 🔴 `connection_failed` IS WHY THIS ENDPOINT EXISTS. When two peers cannot
   * find a path — symmetric NAT, a locked-down firewall — the browser knows and
   * the server does not. Without this the screen would spin for ever and the
   * log would say the call simply never happened. It is also the measurement
   * that would justify adding a TURN relay later, which is the honest way to
   * make that case rather than assuming it up front.
   */
  async recordEvent(
    ctx: TenantContext,
    callId: string,
    input: { eventKind: string; note?: string },
  ): Promise<{ recorded: true }> {
    return this.db.withTenant(ctx, async (client) => {
      await this.assertParticipant(client, ctx, callId);

      await client.query(
        `INSERT INTO comms.call_events
           (tenant_id, organization_id, call_id, event_kind, note, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [ctx.tenantId, ctx.organizationId, callId, input.eventKind, input.note ?? null, ctx.userId],
      );

      // A failed connection is a terminal state for the call, not a note beside
      // a call that is still notionally in progress.
      if (input.eventKind === 'connection_failed') {
        await client.query(
          `UPDATE comms.calls
              SET status = 'failed', ended_at = COALESCE(ended_at, now()),
                  updated_by = $2, updated_at = now()
            WHERE id = $1 AND status IN ('ringing', 'in_progress')`,
          [callId, ctx.userId],
        );
      }
      return { recorded: true };
    });
  }

  /**
   * End the call and say what came of it.
   *
   * ⚠️ THE OUTCOME IS REQUIRED BY THE DATABASE (migration 049), not merely by
   * this method. A call marked done with no outcome looks finished and nobody
   * can tell whether it was useful.
   */
  async complete(
    ctx: TenantContext,
    callId: string,
    outcome: string,
  ): Promise<{ completed: true }> {
    return this.db.withTenant(ctx, async (client) => {
      await this.assertParticipant(client, ctx, callId);
      const r = await client.query(
        `UPDATE comms.calls
            SET status = 'completed',
                started_at = COALESCE(started_at, now()),
                ended_at = COALESCE(ended_at, now()),
                outcome = $3,
                updated_by = $2, updated_at = now()
          WHERE id = $1 AND status <> 'completed'`,
        [callId, ctx.userId, outcome],
      );
      if (r.rowCount === 0) {
        throw new BadRequestException('That call has already been completed.');
      }
      await client.query(
        `INSERT INTO comms.call_events
           (tenant_id, organization_id, call_id, event_kind, recorded_by)
         VALUES ($1,$2,$3,'ended',$4)`,
        [ctx.tenantId, ctx.organizationId, callId, ctx.userId],
      );
      await this.audit.write(client, ctx, {
        action: 'comms.call.completed',
        resourceType: 'call',
        resourceId: callId,
      });
      return { completed: true };
    });
  }

  /**
   * The ICE servers a browser should use.
   *
   * ⚠️ STUN ONLY, AND SAID SO. A STUN server answers "what is my public
   * address?" and sees no media and no signalling content — a far smaller trust
   * surface than a relay would be. There is no TURN entry because this hosting
   * tier cannot run one; the client reports `connection_failed` when no direct
   * path exists rather than pretending otherwise.
   *
   * Served from the API rather than hardcoded in the browser bundle so that a
   * self-hosted coturn — already in `infrastructure/docker/docker-compose.yml`
   * for local development — can be added here the day this leaves the free
   * tier, without touching a single screen.
   */
  iceServers(): { urls: string[] }[] {
    const configured = process.env.WEBRTC_STUN_URLS;
    const urls = configured
      ? configured.split(',').map((u) => u.trim()).filter(Boolean)
      : ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'];
    return [{ urls }];
  }
}
