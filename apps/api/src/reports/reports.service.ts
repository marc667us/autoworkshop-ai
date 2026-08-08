import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * Reports — slice 8 of `COMPLETION_PLAN.md`.
 *
 * ── 🔴 SEQUENCED LAST ON PURPOSE, AND NOT BY PREFERENCE ────────────────────
 *
 * A report is a read-only aggregate over other slices' data. Built before those
 * slices filled their tables, every report on this list would have rendered
 * zeroes — the "disconnected mock page" `05.txt` §2 forbids, with the extra
 * harm that a manager might have believed the zeroes. Slices 2, 3 and 4 have
 * only just put rows in `repair`, `finance` and `parts`.
 *
 * ── 🔴 NO NEW DOMAIN TABLES. NONE. ────────────────────────────────────────
 *
 * Every figure below is computed from the operational tables at read time.
 * There is deliberately no `reports.daily_totals` to be refreshed: a stored
 * aggregate is a second copy of the truth, and the first time a job is
 * back-dated or a payment reversed it disagrees with the screen that owns the
 * number. Slices 3 and 4 refused stored totals for the same reason — a paid
 * total on an invoice, a quantity on hand — and a report is the weakest place
 * to break that rule, because nobody edits a report to notice it is wrong.
 *
 * ── 🔴 THE FINANCE REPORT DOES NOT RE-DERIVE REVENUE ───────────────────────
 *
 * `/finance/workshop-revenue` shipped in slice 3 and counts payments RECEIVED
 * net of refunds — never invoices issued. Writing a second revenue query here
 * would produce two numbers on two screens with no rule for which is right.
 * `revenueByMonth` below is the SAME SQL shape, and the screen states the
 * basis out loud so nobody reads it as "billed".
 *
 * ── ⚠️ WHO MAY READ WHAT ───────────────────────────────────────────────────
 *
 * Financial reports carry the `finance.read` permission in every nav tree, and
 * the nav will not show them otherwise. That is not the enforcement — hiding is
 * not refusing — so the money reports are refused here by role as well.
 */

/** Reports that expose money. Refused to anyone else, not merely hidden. */
const MAY_READ_MONEY = [
  'workshop_owner', 'workshop_manager', 'cashier', 'platform_administrator',
] as const;

/** Everyone else may read the operational reports — they describe their own work. */
const MAY_READ_OPERATIONS = [
  'workshop_owner', 'workshop_manager', 'workshop_supervisor', 'reception_staff',
  'technician', 'storekeeper', 'cashier', 'quality_control_inspector', 'platform_administrator',
] as const;

export interface ReportColumn {
  key: string;
  header: string;
  numeric?: boolean;
}

export interface ReportResult {
  key: string;
  title: string;
  /** What the number MEANS. Rendered on the screen, never only in a comment. */
  basis: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  /** Empty is a real answer; the screen distinguishes it from a failure. */
  generatedAt: string;
}

@Injectable()
export class ReportsService {
  constructor(private readonly db: DatabaseService) {}

  private assertMayRead(ctx: TenantContext, money: boolean): void {
    // `readonly string[]` rather than the narrow tuple type: the two lists have
    // different members, so a cast to either one is wrong for the other. Widening
    // here is honest; casting the role to whichever list happens to be first
    // would compile and mean nothing.
    const allowed: readonly string[] = money ? MAY_READ_MONEY : MAY_READ_OPERATIONS;
    if (!allowed.includes(ctx.activeRole)) {
      throw new ForbiddenException(
        money
          ? 'Financial reports are the owner\'s, the manager\'s and the cashier\'s. The operational reports — job progress, delayed jobs, technician workload — are open to you.'
          : 'Your role cannot read this report. The dashboard shows the live counts for the work you are part of.',
      );
    }
  }

  /**
   * Every report this product has, in one place.
   *
   * ⚠️ ONE SERVICE METHOD PER REPORT, NOT ONE PER ROUTE. Fourteen routes map
   * onto nine distinct questions — §46 and §47 each name several of the same
   * ones. Building fourteen would have meant fourteen places for the same
   * arithmetic to drift.
   */
  async run(ctx: TenantContext, key: string): Promise<ReportResult> {
    switch (key) {
      case 'job-progress':
        return this.jobProgress(ctx);
      case 'delayed-jobs':
        return this.delayedJobs(ctx);
      case 'technician-workload':
        return this.technicianWorkload(ctx);
      case 'technician-productivity':
        return this.technicianProductivity(ctx);
      case 'service-bay-utilization':
        return this.serviceBayUtilization(ctx);
      case 'inventory':
        return this.inventory(ctx);
      case 'finance':
        return this.finance(ctx);
      case 'warranty':
        return this.warranty(ctx);
      case 'customer-service':
        return this.customerService(ctx);
      default:
        throw new BadRequestException(
          `There is no report called "${key}". The reports menu lists the ones that exist.`,
        );
    }
  }

  private stamp(
    key: string,
    title: string,
    basis: string,
    columns: ReportColumn[],
    rows: Record<string, unknown>[],
  ): ReportResult {
    return { key, title, basis, columns, rows, generatedAt: new Date().toISOString() };
  }

  /**
   * 🔴 THE ACCEPTANCE CHECK FOR THIS SLICE: this must agree with the staging
   * board for the same day. It therefore counts `repair.job_cards.stage`
   * DIRECTLY — the same column the board reads — rather than replaying
   * `job_card_stage_events`. Two ways of computing "what stage is this job at"
   * is exactly how a report and a board come to disagree.
   */
  private async jobProgress(ctx: TenantContext): Promise<ReportResult> {
    this.assertMayRead(ctx, false);
    const rows = await this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT stage,
                count(*)::int AS jobs,
                count(*) FILTER (WHERE closed_at IS NULL)::int AS still_open,
                count(*) FILTER (WHERE expected_completion_on IS NOT NULL
                                   AND expected_completion_on < current_date
                                   AND closed_at IS NULL)::int AS overdue
           FROM repair.job_cards
          WHERE tenant_id = $1 AND organization_id = $2
          GROUP BY stage
          ORDER BY jobs DESC`,
        [ctx.tenantId, ctx.organizationId],
      );
      return r.rows as Record<string, unknown>[];
    });
    return this.stamp(
      'job-progress',
      'Job progress',
      'Counted from each job card\'s current stage — the same column the staging board reads, so the two cannot disagree.',
      [
        { key: 'stage', header: 'Stage' },
        { key: 'jobs', header: 'Jobs', numeric: true },
        { key: 'still_open', header: 'Still open', numeric: true },
        { key: 'overdue', header: 'Past expected date', numeric: true },
      ],
      rows,
    );
  }

  private async delayedJobs(ctx: TenantContext): Promise<ReportResult> {
    this.assertMayRead(ctx, false);
    const rows = await this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT jc.job_number, jc.stage, v.registration_number,
                jc.expected_completion_on::text AS expected_on,
                (current_date - jc.expected_completion_on)::int AS days_late,
                (now() - jc.stage_changed_at)::text AS in_stage_for
           FROM repair.job_cards jc
           LEFT JOIN core.vehicles v ON v.id = jc.vehicle_id
          WHERE jc.tenant_id = $1 AND jc.organization_id = $2
            AND jc.closed_at IS NULL
            AND jc.expected_completion_on IS NOT NULL
            AND jc.expected_completion_on < current_date
          ORDER BY days_late DESC`,
        [ctx.tenantId, ctx.organizationId],
      );
      return r.rows as Record<string, unknown>[];
    });
    return this.stamp(
      'delayed-jobs',
      'Delayed jobs',
      'Open jobs whose expected completion date has passed. A job with no expected date cannot be late and is not counted — that is an absence of a promise, not a missed one.',
      [
        { key: 'job_number', header: 'Job' },
        { key: 'registration_number', header: 'Vehicle' },
        { key: 'stage', header: 'Stage' },
        { key: 'expected_on', header: 'Expected' },
        { key: 'days_late', header: 'Days late', numeric: true },
      ],
      rows,
    );
  }

  private async technicianWorkload(ctx: TenantContext): Promise<ReportResult> {
    this.assertMayRead(ctx, false);
    const rows = await this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT COALESCE(NULLIF(btrim(u.display_name), ''), u.email, 'Unassigned') AS technician,
                count(*)::int AS assigned,
                count(*) FILTER (WHERE jc.closed_at IS NULL)::int AS open_now,
                count(*) FILTER (WHERE jc.priority = 'urgent' AND jc.closed_at IS NULL)::int AS urgent_open
           FROM repair.job_cards jc
           LEFT JOIN identity.users u ON u.id = jc.assigned_technician_id
          WHERE jc.tenant_id = $1 AND jc.organization_id = $2
          GROUP BY technician
          ORDER BY open_now DESC, assigned DESC`,
        [ctx.tenantId, ctx.organizationId],
      );
      return r.rows as Record<string, unknown>[];
    });
    return this.stamp(
      'technician-workload',
      'Technician workload',
      'Job cards by the technician they are assigned to. Jobs with nobody assigned are grouped as Unassigned rather than dropped — an unassigned job is the one most worth seeing.',
      [
        { key: 'technician', header: 'Technician' },
        { key: 'assigned', header: 'Jobs ever', numeric: true },
        { key: 'open_now', header: 'Open now', numeric: true },
        { key: 'urgent_open', header: 'Urgent open', numeric: true },
      ],
      rows,
    );
  }

  /**
   * ⚠️ HOURS COME FROM THE TIME LEDGER, and an entry that has not ENDED
   * contributes nothing. Counting a running entry as if it had finished would
   * make today's figures climb by themselves and disagree with tomorrow's
   * reading of the same day.
   */
  private async technicianProductivity(ctx: TenantContext): Promise<ReportResult> {
    this.assertMayRead(ctx, false);
    const rows = await this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT COALESCE(NULLIF(btrim(u.display_name), ''), u.email, 'Unknown') AS technician,
                count(*)::int AS entries,
                round(sum(EXTRACT(EPOCH FROM (t.ended_at - t.started_at))) / 3600.0, 2) AS hours_recorded
           -- No still_running column: the WHERE clause below already excludes
           -- unfinished entries, so such a count would be zero on every row
           -- for ever. A field that can only ever say one thing is a claim, not
           -- a measurement.
           FROM repair.execution_time_entries t
           LEFT JOIN identity.users u ON u.id = t.technician_id
          WHERE t.tenant_id = $1 AND t.organization_id = $2
            AND t.ended_at IS NOT NULL
          GROUP BY technician
          ORDER BY hours_recorded DESC NULLS LAST`,
        [ctx.tenantId, ctx.organizationId],
      );
      return r.rows as Record<string, unknown>[];
    });
    return this.stamp(
      'technician-productivity',
      'Technician productivity',
      'Hours from completed time entries only. A clock that is still running contributes nothing, so this figure does not climb while you read it.',
      [
        { key: 'technician', header: 'Technician' },
        { key: 'entries', header: 'Completed entries', numeric: true },
        { key: 'hours_recorded', header: 'Hours', numeric: true },
      ],
      rows,
    );
  }

  private async serviceBayUtilization(ctx: TenantContext): Promise<ReportResult> {
    this.assertMayRead(ctx, false);
    const rows = await this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT b.name AS bay, b.bay_type, b.is_active,
                count(t.id)::int AS sessions,
                COALESCE(round(sum(EXTRACT(EPOCH FROM (t.ended_at - t.started_at))) / 3600.0, 2), 0)
                  AS hours_used
           FROM core.service_bays b
           LEFT JOIN repair.execution_time_entries t
             ON t.service_bay = b.name
            AND t.tenant_id = b.tenant_id
            AND t.organization_id = b.organization_id
            AND t.ended_at IS NOT NULL
          WHERE b.tenant_id = $1 AND b.organization_id = $2
          GROUP BY b.name, b.bay_type, b.is_active
          ORDER BY hours_used DESC`,
        [ctx.tenantId, ctx.organizationId],
      );
      return r.rows as Record<string, unknown>[];
    });
    return this.stamp(
      'service-bay-utilization',
      'Service bay utilisation',
      'Hours of completed work recorded against each bay. A bay with no hours is shown rather than omitted — an idle bay is the point of the report.',
      [
        { key: 'bay', header: 'Bay' },
        { key: 'bay_type', header: 'Type' },
        { key: 'sessions', header: 'Sessions', numeric: true },
        { key: 'hours_used', header: 'Hours used', numeric: true },
      ],
      rows,
    );
  }

  /**
   * ⚠️ READ FROM `parts.stock_on_hand`, the VIEW, not from a recomputation. The
   * view derives on-hand from the movement ledger; a second derivation here
   * would be a second answer to "how many alternators are there".
   */
  private async inventory(ctx: TenantContext): Promise<ReportResult> {
    this.assertMayRead(ctx, false);
    const rows = await this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT part_number, name, unit, on_hand, reserved, available,
                reorder_level, needs_reorder
           FROM parts.stock_on_hand
          WHERE tenant_id = $1 AND organization_id = $2 AND is_active
          ORDER BY needs_reorder DESC, name`,
        [ctx.tenantId, ctx.organizationId],
      );
      return r.rows as Record<string, unknown>[];
    });
    return this.stamp(
      'inventory',
      'Inventory',
      'On-hand is the sum of the movement ledger, read through the same view the parts screens use. Available is on-hand minus what is reserved; a reservation does not take a part off the shelf.',
      [
        { key: 'part_number', header: 'Part number' },
        { key: 'name', header: 'Part' },
        { key: 'on_hand', header: 'On hand', numeric: true },
        { key: 'reserved', header: 'Reserved', numeric: true },
        { key: 'available', header: 'Available', numeric: true },
        { key: 'reorder_level', header: 'Reorder at', numeric: true },
      ],
      rows,
    );
  }

  /**
   * 🔴 THE SAME BASIS AS `/finance/workshop-revenue`: payments RECEIVED net of
   * refunds, never invoices issued. Two revenue numbers on two screens with no
   * rule for which is right is the defect this deliberately does not create.
   */
  private async finance(ctx: TenantContext): Promise<ReportResult> {
    this.assertMayRead(ctx, true);
    const rows = await this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `WITH received AS (
           SELECT date_trunc('month', received_at) AS month,
                  currency, sum(amount) AS taken
             FROM finance.payments
            WHERE tenant_id = $1 AND organization_id = $2
            GROUP BY 1, 2
         ), given_back AS (
           SELECT date_trunc('month', issued_at) AS month,
                  currency, sum(amount) AS returned
             FROM finance.refunds
            WHERE tenant_id = $1 AND organization_id = $2
            GROUP BY 1, 2
         )
         SELECT to_char(COALESCE(rc.month, gb.month), 'YYYY-MM') AS month,
                COALESCE(rc.currency, gb.currency) AS currency,
                COALESCE(rc.taken, 0) AS received,
                COALESCE(gb.returned, 0) AS refunded,
                COALESCE(rc.taken, 0) - COALESCE(gb.returned, 0) AS net
           FROM received rc
           FULL OUTER JOIN given_back gb
             ON gb.month = rc.month AND gb.currency = rc.currency
          ORDER BY month DESC`,
        [ctx.tenantId, ctx.organizationId],
      );
      return r.rows as Record<string, unknown>[];
    });
    return this.stamp(
      'finance',
      'Finance',
      'Money RECEIVED, net of refunds — not money billed. This is the same basis as the workshop revenue screen, so the two agree. An unpaid invoice appears in neither.',
      [
        { key: 'month', header: 'Month' },
        { key: 'currency', header: 'Currency' },
        { key: 'received', header: 'Received', numeric: true },
        { key: 'refunded', header: 'Refunded', numeric: true },
        { key: 'net', header: 'Net', numeric: true },
      ],
      rows,
    );
  }

  private async warranty(ctx: TenantContext): Promise<ReportResult> {
    this.assertMayRead(ctx, false);
    const rows = await this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT status,
                count(*)::int AS claims,
                count(*) FILTER (WHERE remedial_job_card_id IS NOT NULL)::int AS with_remedial_job,
                min(reported_at)::date::text AS earliest,
                max(reported_at)::date::text AS latest
           FROM warranty.claims
          WHERE tenant_id = $1 AND organization_id = $2
          GROUP BY status
          ORDER BY claims DESC`,
        [ctx.tenantId, ctx.organizationId],
      );
      return r.rows as Record<string, unknown>[];
    });
    return this.stamp(
      'warranty',
      'Warranty',
      'Claims by status, counted from the claims themselves. Warranty decisions are append-only, so this is a count of what was decided, not of what is currently believed.',
      [
        { key: 'status', header: 'Status' },
        { key: 'claims', header: 'Claims', numeric: true },
        { key: 'with_remedial_job', header: 'With remedial job', numeric: true },
        { key: 'earliest', header: 'Earliest' },
        { key: 'latest', header: 'Latest' },
      ],
      rows,
    );
  }

  private async customerService(ctx: TenantContext): Promise<ReportResult> {
    this.assertMayRead(ctx, false);
    const rows = await this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT category,
                count(*)::int AS cases,
                count(*) FILTER (WHERE status IN ('open', 'in_progress'))::int AS still_open,
                count(*) FILTER (WHERE status IN ('resolved', 'closed'))::int AS settled,
                round(avg(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 86400.0)
                      FILTER (WHERE resolved_at IS NOT NULL), 1) AS avg_days_to_resolve
           FROM support.cases
          WHERE tenant_id = $1 AND organization_id = $2
          GROUP BY category
          ORDER BY cases DESC`,
        [ctx.tenantId, ctx.organizationId],
      );
      return r.rows as Record<string, unknown>[];
    });
    return this.stamp(
      'customer-service',
      'Customer service',
      'Support cases by what they were about. Time to resolve counts only cases that were actually resolved — averaging in the unresolved ones as if they took zero days would flatter the figure.',
      [
        { key: 'category', header: 'About' },
        { key: 'cases', header: 'Cases', numeric: true },
        { key: 'still_open', header: 'Still open', numeric: true },
        { key: 'settled', header: 'Settled', numeric: true },
        { key: 'avg_days_to_resolve', header: 'Avg days to resolve', numeric: true },
      ],
      rows,
    );
  }
}
