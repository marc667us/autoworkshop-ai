import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { assertAgentOperator } from './agent-operator-roles';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * THE PROPOSAL STORE — what an agent suggested, and what a human did about it.
 *
 * ── 🔴 AN AGENT PROPOSES; A HUMAN DECIDES ─────────────────────────────────
 *
 * Directive §14 requires human approval for sending email, deleting data,
 * awarding bids, updating supplier prices and modifying financial data.
 * `02.txt` §8 requires every proposal to disclose five things before anyone
 * acts on it. Migration 064 makes those five NOT NULL columns, so a proposal
 * that cannot say what it will touch cannot be stored.
 *
 * Nothing here executes anything. `decide()` moves a row to `approved` or
 * `rejected`; turning an approval into a business fact is the job of the
 * domain service that owns that fact — the catalogue service creates a
 * supplier, reception converts a request. That separation is what keeps the
 * agent out of the business rules (`CLAUDE.md` §3).
 */

export type ActionClass =
  | 'read-only'
  | 'draft'
  | 'business-committing'
  | 'privileged';

export interface RecordProposalInput {
  readonly agentName: string;
  readonly actionClass: ActionClass;
  readonly action: string;
  readonly dataUsed: readonly string[];
  readonly sources?: readonly { label: string; href?: string }[];
  readonly payload: unknown;
  readonly confidence?: number | null;
  readonly source: 'model' | 'rules';
  readonly resourceType?: string;
  readonly resourceId?: string;
  /**
   * The human who ASKED for this, when a human did.
   *
   * 🔴 NULL IS MEANINGFUL AND MUST STAY POSSIBLE. Triage is raised by a
   * background agent reacting to a customer's request — there is no member of
   * staff behind it, and stamping the customer as the proposal's author would
   * be an audit trail that invents a fact. Discovery is the opposite: a member
   * of staff typed a URL and pressed a button, and recording who is what makes
   * "the AI recommended this" auditable rather than anonymous (Codex,
   * 2026-08-08 — before this, every proposal had a NULL author).
   */
  readonly createdBy?: string | null;
}

export interface ProposalRow {
  id: string;
  agentName: string;
  actionClass: ActionClass;
  action: string;
  dataUsed: string[];
  sources: unknown;
  payload: unknown;
  confidence: number | null;
  source: 'model' | 'rules';
  resourceType: string | null;
  resourceId: string | null;
  status: string;
  approvalRequired: boolean;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
}

/**
 * ⚠️ APPROVAL IS DECIDED BY THE SERVER, FROM THE CLASS — never by the caller
 * and never by the agent.
 *
 * `AiAssistantPanel` renders `approvalRequired`, and its own header says what
 * it shows is "a mirror of the server's decision, never the decision itself".
 * If the agent supplied this field, an agent that wanted to skip review would
 * simply say `false`. Classes A and B produce nothing committed; C and D do.
 */
export function approvalRequiredFor(actionClass: ActionClass): boolean {
  return actionClass === 'business-committing' || actionClass === 'privileged';
}

const SELECT_COLUMNS = `
  p.id, p.agent_name, p.action_class, p.action, p.data_used, p.sources,
  p.payload, p.confidence, p.source, p.resource_type, p.resource_id,
  p.status, p.created_at, p.decided_at, p.decision_note`;

function toRow(r: Record<string, unknown>): ProposalRow {
  const actionClass = r.action_class as ActionClass;
  return {
    id: r.id as string,
    agentName: r.agent_name as string,
    actionClass,
    action: r.action as string,
    dataUsed: (r.data_used as string[]) ?? [],
    sources: r.sources ?? [],
    payload: r.payload ?? {},
    // `pg` returns NUMERIC as a string to avoid float precision loss. Coercing
    // here rather than at every read site — a confidence that arrives as "0.8"
    // renders as a string and sorts as one.
    confidence: r.confidence === null || r.confidence === undefined ? null : Number(r.confidence),
    source: r.source as 'model' | 'rules',
    resourceType: (r.resource_type as string) ?? null,
    resourceId: (r.resource_id as string) ?? null,
    status: r.status as string,
    approvalRequired: approvalRequiredFor(actionClass),
    createdAt: (r.created_at as Date)?.toISOString?.() ?? String(r.created_at),
    decidedAt: r.decided_at ? ((r.decided_at as Date)?.toISOString?.() ?? String(r.decided_at)) : null,
    decisionNote: (r.decision_note as string) ?? null,
  };
}

@Injectable()
export class AgentProposalService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Write a proposal on a client the CALLER already owns.
   *
   * ⚠️ TAKES A `PoolClient` RATHER THAN OPENING ITS OWN so the caller decides
   * the transaction boundary. It does NOT mean every proposal is atomic with
   * whatever it is about — and an earlier version of this comment claimed
   * exactly that, which was false for the only caller that matters:
   *
   *   · TRIAGE opens its OWN short transaction AFTER the service request has
   *     committed (`ServiceRequestTriageAgent`). Deliberately: a model
   *     generation takes seconds and must not hold the customer's INSERT
   *     transaction open. A proposal that never arrives costs reception a
   *     convenience; a request that never arrives costs a customer.
   *   · DISCOVERY opens its own too — there is no surrounding business write.
   *
   * Found by Codex, 2026-08-08. Recorded here rather than quietly deleted
   * because a confident comment describing a rule the code does not implement
   * is this repository's most expensive recurring defect, and this is the
   * fourth instance.
   */
  async record(
    client: PoolClient,
    ctx: TenantContext,
    input: RecordProposalInput,
  ): Promise<string | null> {
    const rows = await client.query<{ id: string }>(
      `INSERT INTO agents.proposals
         (tenant_id, organization_id, agent_name, action_class, action,
          data_used, sources, payload, confidence, source,
          resource_type, resource_id, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (agent_name, resource_type, resource_id)
         WHERE status IN ('proposed','awaiting-approval') AND resource_id IS NOT NULL
         DO NOTHING
       RETURNING id`,
      [
        ctx.tenantId,
        ctx.organizationId,
        input.agentName,
        input.actionClass,
        input.action,
        input.dataUsed,
        JSON.stringify(input.sources ?? []),
        JSON.stringify(input.payload ?? {}),
        input.confidence ?? null,
        input.source,
        input.resourceType ?? null,
        input.resourceId ?? null,
        approvalRequiredFor(input.actionClass) ? 'awaiting-approval' : 'proposed',
        input.createdBy ?? null,
      ],
    );
    // `null` on conflict is the SUCCESS path, not a failure: migration 064's
    // partial unique index means one open proposal per agent per resource, so a
    // retried intake finds the first one still waiting. The caller must not
    // treat this as an error — stacking duplicates in reception's queue until
    // nobody reads any of them is the outcome that index prevents.
    return rows.rows[0]?.id ?? null;
  }

  /** The workshop's open and recent proposals. Staff only. */
  async list(
    ctx: TenantContext,
    opts: { status?: string; resourceType?: string; resourceId?: string } = {},
  ): Promise<ProposalRow[]> {
    // 🔴 STAFF ONLY, AND ON THE READ. Migration 064's SELECT policy carries the
    // same clause, deliberately doubled: `CLAUDE.md` §8 wants app-layer and RLS
    // both, and migration 059 is this repo's worked example of what happens when
    // only the writes carry it.
    assertAgentOperator(ctx, 'Agent proposals');
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `SELECT ${SELECT_COLUMNS}
           FROM agents.proposals p
          WHERE ($1::text IS NULL OR p.status = $1)
            AND ($2::text IS NULL OR p.resource_type = $2)
            AND ($3::uuid IS NULL OR p.resource_id = $3)
          ORDER BY p.created_at DESC
          LIMIT 200`,
        [opts.status ?? null, opts.resourceType ?? null, opts.resourceId ?? null],
      );
      return res.rows.map((r) => toRow(r as Record<string, unknown>));
    });
  }

  /**
   * Approve or reject. Staff only, and attributed.
   *
   * ⚠️ A SINGLE CONDITIONAL UPDATE, not read-then-write. Two reviewers pressing
   * Approve and Reject at the same moment must produce one decision, not a
   * last-writer-wins race — the same shape `ServiceRequestService.decide` uses.
   */
  async decide(
    ctx: TenantContext,
    id: string,
    decision: 'approved' | 'rejected',
    note: string | undefined,
  ): Promise<ProposalRow> {
    assertAgentOperator(ctx, 'Deciding an agent proposal');
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `UPDATE agents.proposals p
            SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4
          WHERE p.id = $1
            AND p.status IN ('proposed','awaiting-approval')
          RETURNING ${SELECT_COLUMNS}`,
        [id, decision, ctx.userId, note ?? null],
      );
      const row = res.rows[0];
      if (!row) {
        // Either it does not exist in this workshop, or it was already decided.
        // Told apart with a second read so the message is actionable — "not
        // found" for a proposal a colleague approved a second earlier is the
        // kind of answer that sends somebody hunting for a bug.
        const existing = await client.query<{ status: string }>(
          `SELECT status FROM agents.proposals WHERE id = $1`,
          [id],
        );
        if (existing.rows[0]) {
          throw new BadRequestException(
            `This proposal was already ${existing.rows[0].status}.`,
          );
        }
        throw new NotFoundException('That proposal was not found.');
      }
      return toRow(row as Record<string, unknown>);
    });
  }
}
