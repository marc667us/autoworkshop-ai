import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';
import { assertWithinApprovalLimit } from '../authz/approval-limits';
import { assertWorkshopStaff } from '../authz/workshop-roles';
import {
  CAN_RAISE_VARIATION,
  CAN_REVIEW_VARIATION,
  VariationInputError,
  parseDecision,
  parseVariationInput,
} from './variation-rules';

/**
 * The repair variation flow — Phase 5 slice 7b.
 *
 * `07.txt` §3766 step 12 is the rule the slice exists for:
 *
 *     "The technician PAUSES CHARGEABLE ADDITIONAL WORK UNTIL APPROVAL IS
 *      RECEIVED."
 *
 * A workshop that strips a gearbox "while it was open" and invoices for it has
 * broken something no refund fixes. So the flow is: the technician RAISES what
 * they found, somebody ELSE reviews it internally, the customer is asked, and
 * only an approval authorises the work.
 *
 * 🔴 EVERY STEP OF THAT IS ENFORCED IN POSTGRES, not here. Migration 032's
 * `ck_variation_authorization` refuses `work_authorized_at` on anything but an
 * approved variation; `trg_variation_status` refuses a lifecycle that skips
 * internal review; `trg_variation_settled` refuses an edit to an approved
 * variation's cost or scope. `verify/032` proves all fifteen against a real
 * database, each with a control. The checks in this file exist so a technician
 * gets a sentence naming the reason instead of a raw `23514`.
 *
 * ⚠️ `withTenant`, because the policy keys on the tenant and the triggers read
 * the caller's context. Under `withUser` these statements would match no policy
 * and affect zero rows without raising.
 */
@Injectable()
export class VariationService {
  constructor(private readonly db: DatabaseService) {}

  private assertMayRaise(ctx: TenantContext): void {
    if (!CAN_RAISE_VARIATION.has(ctx.activeRole)) {
      throw new ForbiddenException(
        'only the people working the repair can raise a variation for it',
      );
    }
  }

  /**
   * ⚠️ THE REVIEWER IS NOT THE RAISER, AND THAT IS THE CONTROL. §3792 requires a
   * variation to be "reviewed internally" before the customer sees it, and a
   * review the raiser performs on their own work is not a review. Same shape as
   * the diagnosis review and the QC inspection — checked by ROLE here and by
   * IDENTITY in `review()`.
   */
  private assertMayReview(ctx: TenantContext): void {
    if (!CAN_REVIEW_VARIATION.has(ctx.activeRole)) {
      throw new ForbiddenException(
        'a variation is reviewed by a supervisor, manager or the owner — not by the ' +
          'technician who raised it. Ask one of them to review it.',
      );
    }
  }

  /**
   * Variations on one job card, or the whole organisation's when no card is
   * named.
   *
   * ⚠️ THE UNFILTERED FORM IS THE QUEUE, and it is not a convenience: a
   * supervisor's job here is "what is waiting on me", which is a question about
   * the ORGANISATION, not about a job card they would have to already know. The
   * job-card form is what a job sheet uses.
   *
   * Both go through the same tenant policy, so the unfiltered form is scoped by
   * RLS exactly as the filtered one is — it returns more ROWS, never a wider
   * TENANT.
   */
  async list(ctx: TenantContext, jobCardId?: string) {
    // 🔴 STAFF ONLY (A5). `customer` is a real membership role in this same
    // organisation and the controller carries only TenantGuard. This returns
    // the WORKSHOP'S queue — added work, costs and internal review notes —
    // which is not a customer's to browse.
    assertWorkshopStaff(ctx, 'The workshop variations queue');
    return this.db.withTenant(ctx, async (client) => {
      const { rows } = await client.query(
        `SELECT v.*, j.job_number,
                rb.display_name AS raised_by_name,
                ir.display_name AS reviewed_by_name
           FROM repair.repair_variations v
           JOIN repair.job_cards j
             ON j.id = v.job_card_id AND j.tenant_id = v.tenant_id
           LEFT JOIN identity.users rb ON rb.id = v.created_by
           LEFT JOIN identity.users ir ON ir.id = v.internally_reviewed_by
          WHERE v.tenant_id = $1 AND v.organization_id = $2
            AND ($3::uuid IS NULL OR v.job_card_id = $3::uuid)
          -- Open ones first: a queue is ordered by what needs doing, and a
          -- decided variation is history the reader scrolls to, not acts on.
          ORDER BY (v.status IN ('draft','internally_reviewed','sent_to_customer')) DESC,
                   v.created_at DESC`,
        [ctx.tenantId, ctx.organizationId, jobCardId ?? null],
      );
      return rows.map((r) => VariationService.toVariation(r as Record<string, unknown>, ctx));
    });
  }

  /**
   * Raise a variation against a repair in progress.
   *
   * ⚠️ THE SNAPSHOTS ARE TAKEN HERE, once. §14 requires a variation to carry the
   * ORIGINAL COMPLAINT and the ORIGINAL APPROVED WORK, and reading them at
   * display time would mean a later edit to the job card silently rewrote what
   * the customer was shown. Same reasoning that makes a quotation store its
   * labour rate rather than look it up.
   */
  async raise(ctx: TenantContext, executionId: string, raw: Record<string, unknown>) {
    this.assertMayRaise(ctx);

    let input;
    try {
      input = parseVariationInput(raw ?? {});
    } catch (err) {
      if (err instanceof VariationInputError) throw new BadRequestException(err.message);
      throw err;
    }

    return this.db.withTenant(ctx, async (client) => {
      const found = await client.query(
        `SELECT e.id, e.job_card_id, e.status, j.complaint
           FROM repair.repair_executions e
           JOIN repair.job_cards j
             ON j.id = e.job_card_id AND j.tenant_id = e.tenant_id
          WHERE e.id = $1 AND e.tenant_id = $2 AND e.organization_id = $3`,
        [executionId, ctx.tenantId, ctx.organizationId],
      );
      const exec = found.rows[0] as
        | { job_card_id: string; status: string; complaint: string | null }
        | undefined;
      // 404 rather than 403 — the same non-oracle rule as every other read here.
      if (!exec) throw new NotFoundException('repair execution not found');

      // §3764 places the variation DURING the repair, between "records
      // unexpected findings" and "completes the authorized repair". Raising one
      // against a finished repair means the work is already done — which is the
      // very thing this flow exists to prevent.
      if (exec.status === 'completed') {
        throw new ConflictException(
          'this repair is already complete; additional work found now is a new job, not a ' +
            'variation of one that has finished',
        );
      }

      // The originally approved work, from the approved repair plan.
      const approved = await client.query(
        // ⚠️ `plan_id`, NOT `repair_plan_id`, and `title` alongside the
        // description. Both were assumed from the table's name and both were
        // wrong: the INSERT failed with "column t.repair_plan_id does not
        // exist" — a 500 on every attempt to raise a variation. Checked against
        // information_schema rather than inferred the second time.
        //
        // COALESCE because `description` is nullable while `title` is not; a
        // task with no description would otherwise blank the whole aggregate.
        `SELECT string_agg(COALESCE(t.description, t.title), '; ' ORDER BY t.position) AS work
           FROM repair.repair_plan_tasks t
           JOIN repair.repair_plans p ON p.id = t.plan_id
          WHERE p.job_card_id = $1 AND p.tenant_id = $2 AND p.status = 'approved'`,
        [exec.job_card_id, ctx.tenantId],
      );

      const { rows } = await client.query(
        `INSERT INTO repair.repair_variations
           (tenant_id, organization_id, job_card_id, execution_id, variation_no,
            original_complaint, original_approved_work, new_finding, additional_work,
            additional_parts, additional_labour_hours, additional_cost, currency,
            effect_on_completion, created_by, updated_by)
         SELECT $1, $2, $3, $4,
                COALESCE(max(variation_no), 0) + 1,
                $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14
           FROM repair.repair_variations
          WHERE execution_id = $4 AND tenant_id = $1
         RETURNING id`,
        [
          ctx.tenantId,
          ctx.organizationId,
          exec.job_card_id,
          executionId,
          // NOT NULL columns with a stated fallback: a job card with no recorded
          // complaint still needs a variation document that reads sensibly.
          exec.complaint ?? 'No complaint was recorded on this job card.',
          (approved.rows[0]?.['work'] as string | null) ??
            'No approved repair plan tasks were recorded.',
          input.newFinding,
          input.additionalWork,
          input.additionalParts,
          input.additionalLabourHours,
          input.additionalCost,
          input.currency,
          input.effectOnCompletion,
          ctx.userId,
        ],
      );

      const id = rows[0]?.['id'] as string | undefined;
      if (!id) throw new ForbiddenException('the variation could not be raised');
      return this.one(client, ctx, id);
    });
  }

  /**
   * Review it internally — §3792's first step.
   *
   * 🔴 THE IDENTITY CHECK. The ROLE check stops a technician reviewing anything;
   * this stops a supervisor who RAISED it reviewing their own. Both are needed
   * and neither is sufficient, exactly as the diagnosis review documents.
   */
  async review(ctx: TenantContext, variationId: string, send: boolean) {
    this.assertMayReview(ctx);

    return this.db.withTenant(ctx, async (client) => {
      const current = await client.query(
        `SELECT id, status, created_by, additional_cost FROM repair.repair_variations
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3
          FOR UPDATE`,
        [variationId, ctx.tenantId, ctx.organizationId],
      );
      const row = current.rows[0] as
        | { status: string; created_by: string | null; additional_cost: string }
        | undefined;
      if (!row) throw new NotFoundException('variation not found');

      if (row.created_by !== null && row.created_by === ctx.userId) {
        throw new ForbiddenException(
          'you raised this variation and cannot also review it — §3792 requires an ' +
            'internal review by somebody else before the customer is asked',
        );
      }

      // 🔴 THE APPROVAL LIMIT, ENFORCED (A6). This is the moment a workshop
      // role commits money on a customer's behalf, and `core.approval_limits`
      // has named a ceiling for it since migration 045 while nothing checked it.
      // Checked BEFORE the status guard so the answer to "may I approve this?"
      // does not depend on what state the row happens to be in.
      await assertWithinApprovalLimit(client, ctx, {
        amount: Number(row.additional_cost),
        what: 'This variation',
      });

      if (row.status !== 'draft' && !(send && row.status === 'internally_reviewed')) {
        throw new ConflictException(
          `this variation is ${row.status} and cannot be reviewed again`,
        );
      }

      if (row.status === 'draft') {
        await client.query(
          `UPDATE repair.repair_variations
              SET status='internally_reviewed', internally_reviewed_by=$2,
                  internally_reviewed_at=now(), updated_at=now(), updated_by=$2
            WHERE id = $1`,
          [variationId, ctx.userId],
        );
      }

      if (send) {
        await client.query(
          `UPDATE repair.repair_variations
              SET status='sent_to_customer', sent_at=now(), updated_at=now(), updated_by=$2
            WHERE id = $1`,
          [variationId, ctx.userId],
        );
      }

      return this.one(client, ctx, variationId);
    });
  }

  /**
   * Record the customer's decision, and — only for an approval — authorise the
   * work in the same transaction.
   *
   * 🔴 THE AUTHORISATION IS NOT A SEPARATE CALL, DELIBERATELY. A two-step
   * "approve, then authorise" leaves a window in which the customer has said yes
   * and the technician still cannot start, which is the exact friction that
   * makes people work around the flow. It is one atomic act, and the database
   * refuses the authorisation if the approval did not land.
   */
  async decide(ctx: TenantContext, variationId: string, raw: Record<string, unknown>) {
    this.assertMayReview(ctx);

    return this.db.withTenant(ctx, async (client) => {
      const current = await client.query(
        `SELECT id, status, additional_cost FROM repair.repair_variations
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3
          FOR UPDATE`,
        [variationId, ctx.tenantId, ctx.organizationId],
      );
      const row = current.rows[0] as { status: string; additional_cost: string } | undefined;
      if (!row) throw new NotFoundException('variation not found');

      if (row.status !== 'sent_to_customer') {
        throw new ConflictException(
          `a decision can only be recorded once the variation has been sent to the customer; ` +
            `this one is ${row.status}`,
        );
      }

      const chargeable = Number(row.additional_cost) > 0;
      let input;
      try {
        input = parseDecision(raw ?? {}, chargeable);
      } catch (err) {
        if (err instanceof VariationInputError) throw new BadRequestException(err.message);
        throw err;
      }

      if (input.decision === 'modified') {
        // The customer wants it changed. Back to draft — the workshop rewrites
        // it and the sequence starts again, which is why 032's trigger allows
        // `sent_to_customer -> draft` and why this is a decision in its own
        // right rather than a flavour of rejection.
        await client.query(
          `UPDATE repair.repair_variations
              SET status='draft', decision_note=$2, recorded_by=$3,
                  updated_at=now(), updated_by=$3
            WHERE id = $1`,
          [variationId, input.decisionNote, ctx.userId],
        );
        return this.one(client, ctx, variationId);
      }

      const approved = input.decision === 'approved';
      await client.query(
        `UPDATE repair.repair_variations
            SET status = $2,
                decision = $2,
                decided_at = now(),
                decided_by_name = $3,
                decision_channel = $4,
                decision_note = $5,
                recorded_by = $6,
                -- 🔴 AUTHORISED IN THE SAME STATEMENT AS THE APPROVAL, and NULL
                -- on any other outcome. ck_variation_authorization refuses a
                -- non-approved row carrying it, so a bug here is a failed
                -- write rather than unauthorised work.
                work_authorized_at = CASE WHEN $2 = 'approved' THEN now() ELSE NULL END,
                work_authorized_by = CASE WHEN $2 = 'approved' THEN $6 ELSE NULL END,
                updated_at = now(),
                updated_by = $6
          WHERE id = $1`,
        [
          variationId,
          approved ? 'approved' : 'rejected',
          input.decidedByName,
          input.decisionChannel,
          input.decisionNote,
          ctx.userId,
        ],
      );

      return this.one(client, ctx, variationId);
    });
  }

  private async one(
    client: { query: (t: string, v: unknown[]) => Promise<{ rows: unknown[] }> },
    ctx: TenantContext,
    id: string,
  ) {
    const { rows } = await client.query(
      `SELECT v.*, j.job_number,
              rb.display_name AS raised_by_name,
              ir.display_name AS reviewed_by_name
         FROM repair.repair_variations v
         JOIN repair.job_cards j
           ON j.id = v.job_card_id AND j.tenant_id = v.tenant_id
         LEFT JOIN identity.users rb ON rb.id = v.created_by
         LEFT JOIN identity.users ir ON ir.id = v.internally_reviewed_by
        WHERE v.id = $1 AND v.tenant_id = $2 AND v.organization_id = $3`,
      [id, ctx.tenantId, ctx.organizationId],
    );
    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new NotFoundException('variation not found');
    return VariationService.toVariation(row, ctx);
  }

  private static toVariation(r: Record<string, unknown>, ctx: TenantContext) {
    const cost = Number(r['additional_cost']);
    return {
      id: String(r['id']),
      jobCardId: String(r['job_card_id']),
      jobNumber: String(r['job_number']),
      executionId: String(r['execution_id']),
      variationNo: Number(r['variation_no']),
      status: String(r['status']),
      originalComplaint: String(r['original_complaint']),
      originalApprovedWork: String(r['original_approved_work']),
      newFinding: String(r['new_finding']),
      additionalWork: String(r['additional_work']),
      additionalParts: (r['additional_parts'] as string | null) ?? null,
      additionalLabourHours:
        r['additional_labour_hours'] === null ? null : Number(r['additional_labour_hours']),
      additionalCost: cost,
      currency: String(r['currency']),
      chargeable: cost > 0,
      effectOnCompletion: (r['effect_on_completion'] as string | null) ?? null,
      raisedByName: (r['raised_by_name'] as string | null) ?? null,
      reviewedByName: (r['reviewed_by_name'] as string | null) ?? null,
      decision: (r['decision'] as string | null) ?? null,
      decidedByName: (r['decided_by_name'] as string | null) ?? null,
      decisionChannel: (r['decision_channel'] as string | null) ?? null,
      decisionNote: (r['decision_note'] as string | null) ?? null,
      // 🔴 THE ONE FIELD EXECUTION CODE SHOULD CONSULT before booking chargeable
      // additional work. Nothing else in this object is a substitute for it.
      workAuthorized: r['work_authorized_at'] !== null,
      workAuthorizedAt: r['work_authorized_at'] === null ? null : String(r['work_authorized_at']),
      // Resolved per viewer: the raiser may not review their own.
      mayReview:
        CAN_REVIEW_VARIATION.has(ctx.activeRole) && r['created_by'] !== ctx.userId,
      raisedByViewer: r['created_by'] === ctx.userId,
    };
  }
}
