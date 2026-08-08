import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { assertAgentOperator } from '../agents/agent-operator-roles';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * THE LEAD STORE — the read model `crm.leads` never had.
 *
 * ── 🔴 WHY THIS EXISTS: A TABLE THAT COULD ONLY BE WRITTEN ────────────────
 *
 * Migration 064 created `crm.leads`, and `POST /agents/proposals/:id/apply-leads`
 * has written to it since. Nothing could READ it. The Leads screen listed the
 * lead-discovery PROPOSALS instead and rendered each one's candidates out of its
 * stored payload, which meant:
 *
 *   · a lead that had been applied was still shown as it was PROPOSED;
 *   · `crm.leads.status` — the whole point of the table — was invisible and
 *     unchangeable, so every lead sat at `new` for ever;
 *   · a lead reaching the table by any other route did not appear at all.
 *
 * That is this repository's recorded defect class stated in its other direction:
 * a WRITE with no reader is as inert as a route with no caller. The rows were
 * real, correct and unreachable.
 *
 * ── THE AUDIENCE IS THE AGENT OPERATORS, NOT "STAFF" ──────────────────────
 *
 * `assertAgentOperator`, not `assertWorkshopStaff`, and deliberately the SAME
 * audience that may run discovery and decide its proposals. Two reasons, and
 * the second is the one that matters:
 *
 *   · The three workshop trees carrying a `Leads` entry are exactly the trees
 *     those three roles reach. Widening the API here would recreate the gap
 *     `audit-nav-coverage.mjs` exists to catch — a role the API permits with no
 *     way to reach the screen by clicking.
 *   · This table holds contact details for businesses that never asked to be in
 *     it (see 064's own header). Whoever reads or moves a row is answerable for
 *     it. That is a management decision, as recorded in `agent-operator-roles`.
 *
 * Doubled in the database: 064's `lead_select` / `lead_update` policies carry
 * `current_role_name() <> 'customer'`. App layer first, RLS last (`CLAUDE.md`
 * §8) — and note the two are NOT the same width. RLS refuses only customers;
 * this refuses every non-management role as well. The narrower check has to be
 * here, because RLS cannot see the navigation tree.
 */

/** The five values migration 064's CHECK constraint permits. */
export const LEAD_STATUSES = [
  'new',
  'qualified',
  'contacted',
  'converted',
  'rejected',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface LeadRow {
  id: string;
  organisationName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  location: string | null;
  rationale: string | null;
  sourceUrl: string;
  status: LeadStatus;
  proposalId: string | null;
  createdAt: string;
  updatedAt: string | null;
}

const SELECT_COLUMNS = `
  l.id, l.organisation_name, l.contact_name, l.contact_email, l.contact_phone,
  l.website, l.location, l.rationale, l.source_url, l.status, l.proposal_id,
  l.created_at, l.updated_at`;

function iso(value: unknown): string {
  return (value as Date)?.toISOString?.() ?? String(value);
}

function toRow(r: Record<string, unknown>): LeadRow {
  return {
    id: r.id as string,
    organisationName: r.organisation_name as string,
    contactName: (r.contact_name as string) ?? null,
    contactEmail: (r.contact_email as string) ?? null,
    contactPhone: (r.contact_phone as string) ?? null,
    website: (r.website as string) ?? null,
    location: (r.location as string) ?? null,
    rationale: (r.rationale as string) ?? null,
    sourceUrl: r.source_url as string,
    status: r.status as LeadStatus,
    proposalId: (r.proposal_id as string) ?? null,
    createdAt: iso(r.created_at),
    updatedAt: r.updated_at ? iso(r.updated_at) : null,
  };
}

@Injectable()
export class LeadsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  /** The workshop's leads, newest first. */
  async list(ctx: TenantContext, opts: { status?: string } = {}): Promise<LeadRow[]> {
    assertAgentOperator(ctx, 'The lead pipeline');
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `SELECT ${SELECT_COLUMNS}
           FROM crm.leads l
          WHERE ($1::text IS NULL OR l.status = $1)
          ORDER BY l.created_at DESC
          LIMIT 200`,
        [opts.status ?? null],
      );
      return res.rows.map((r) => toRow(r as Record<string, unknown>));
    });
  }

  /**
   * Move a lead along the pipeline.
   *
   * ⚠️ EVERY TRANSITION IS ALLOWED, INCLUDING BACKWARDS, AND THAT IS A CHOICE.
   *
   * A forward-only pipeline turns a mis-click into a one-way door — which this
   * repository has already shipped once, in `assigned_technician_id` being
   * WRITE-ONCE so "leave unassigned" could never be undone. A salesperson who
   * marks the wrong row `rejected` must be able to put it back without a
   * database console. The audit row below is what makes that safe: the sequence
   * of states is recoverable even though the column only holds the latest.
   *
   * ⚠️ `contacted` is the one status that asserts something happened in the real
   * world. Nothing in this platform can set it — there is no outbound path from
   * `crm.leads` at all (064). Only a human who did the contacting can, which is
   * exactly why this route exists and no agent may call it.
   */
  async setStatus(ctx: TenantContext, id: string, status: LeadStatus): Promise<LeadRow> {
    assertAgentOperator(ctx, 'Updating a lead');
    return this.db.withTenant(ctx, async (client) => {
      // The previous value is read INSIDE the same transaction and returned by
      // the UPDATE itself, so the audit detail cannot describe a transition
      // that another writer interleaved.
      const res = await client.query(
        `UPDATE crm.leads l
            SET status = $2, updated_at = now(), updated_by = $3
           FROM (SELECT id, status FROM crm.leads WHERE id = $1 FOR UPDATE) prev
          WHERE l.id = prev.id
          RETURNING ${SELECT_COLUMNS}, prev.status AS previous_status`,
        [id, status, ctx.userId],
      );
      const row = res.rows[0] as Record<string, unknown> | undefined;
      // No row means the lead is not in this workshop — or does not exist. Both
      // answer the same way on purpose: telling a caller that an id exists but
      // belongs to somebody else is itself a disclosure.
      if (!row) throw new NotFoundException('That lead was not found.');

      await this.audit.write(client, ctx, {
        action: 'crm.lead.status_changed',
        resourceType: 'lead',
        resourceId: id,
        detail: { from: row.previous_status, to: status },
      });

      return toRow(row);
    });
  }
}
