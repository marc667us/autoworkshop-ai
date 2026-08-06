import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';
import { assertWorkshopStaff } from '../authz/workshop-roles';
import {
  QualityInputError,
  mayInspect,
  parseQualityDecision,
  type QualityStatus,
} from './quality-rules';

export interface QualityInspection {
  id: string;
  jobCardId: string;
  jobNumber: string;
  testSessionId: string;
  attemptNo: number;
  status: QualityStatus;
  complaintAddressed: boolean | null;
  newDefectFound: boolean | null;
  newDefectDescription: string | null;
  notes: string | null;
  inspectorId: string;
  inspectorName: string | null;
  startedAt: string;
  decidedAt: string | null;
}

/**
 * The independent quality inspection — Phase 5 slice 9.
 *
 * `2.txt` §563: "Following repair, an INDEPENDENT quality-control inspection
 * should verify that the ORIGINAL COMPLAINT HAS BEEN ADDRESSED and that NO NEW
 * DEFECT WAS INTRODUCED."
 *
 * ── THE INDEPENDENCE RULE, IN TWO PARTS ────────────────────────────────────
 *
 * Both are needed and neither is sufficient — the same pairing the diagnosis
 * review documents, for the same reason:
 *
 *   · ROLE — `CAN_INSPECT` excludes `technician`, so no technician signs off
 *     any repair. §394 forbids a technician bypassing quality-control states.
 *   · IDENTITY — the inspector may not be anyone who DID THE WORK, so a
 *     supervisor who carried out the repair cannot also pass it.
 *
 * 🔴 AND THE IDENTITY HALF IS ENFORCED IN POSTGRES, not here.
 * `repair.user_worked_on_job_card()` + `trg_qc_independence` refuse a
 * self-inspection on INSERT **and** on UPDATE of `inspector_id`. The check in
 * this file exists so the inspector gets a sentence naming the reason instead
 * of a raw `insufficient_privilege`; it is the explanation, not the control.
 * `verify/030` proves the trigger against a real database from both sides —
 * somebody who did the work is refused, somebody who did not is accepted.
 *
 * ⚠️ `withTenant`, because the policies key on the tenant and the triggers read
 * the caller's context. Under `withUser` these statements would match no policy
 * and affect zero rows without raising.
 */
@Injectable()
export class QualityService {
  constructor(private readonly db: DatabaseService) {}

  private assertMayInspect(ctx: TenantContext): void {
    if (!mayInspect(ctx.activeRole)) {
      throw new ForbiddenException(
        'quality control is an independent check: a technician cannot pass their own work. ' +
          'A quality-control inspector, supervisor, manager or the owner carries it out.',
      );
    }
  }

  /**
   * Repairs waiting for a quality inspection.
   *
   * ⚠️ EACH ROW CARRIES `mayInspect` FOR *THIS* VIEWER, and that is the whole
   * reason this endpoint is more than a list. §563's independence rule means the
   * queue is not the same for two people: a card you worked on is one you may
   * never sign off. Computing it here — with the same
   * `repair.user_worked_on_job_card()` the trigger uses — lets the screen say so
   * on the card itself, instead of letting an inspector open it, fill it in, and
   * only then be refused.
   *
   * ⚠️ IT IS NOT A SECURITY CONTROL. The flag decides what the screen ENABLES;
   * the trigger decides what the database ACCEPTS, and it would refuse a
   * self-inspection with this method deleted.
   *
   * ⚠️ THE COMPLAINT IS SELECTED DELIBERATELY. §563 asks the inspector to verify
   * "the ORIGINAL COMPLAINT has been addressed" — an inspector who cannot see
   * what the customer originally reported cannot answer the question they are
   * being asked, and would be reduced to guessing from the repair notes.
   */
  async queue(ctx: TenantContext) {
    // 🔴 STAFF ONLY (A5). `customer` is a real membership role in this same
    // organisation and the controller carries only TenantGuard. This returns
    // the WORKSHOP'S queue — added work, costs and internal review notes —
    // which is not a customer's to browse.
    assertWorkshopStaff(ctx, 'The workshop quality-control queue');
    return this.db.withTenant(ctx, async (client) => {
      const { rows } = await client.query(
        `SELECT s.id            AS test_session_id,
                j.id            AS job_card_id,
                j.job_number,
                j.complaint,
                j.stage,
                s.submitted_at,
                q.id            AS inspection_id,
                q.attempt_no,
                -- ⚠️ WHO HOLDS THE OPEN INSPECTION. decide() refuses anyone but
                -- the inspector who opened it — the signature is the entire value
                -- of an independent check — so without this the screen would show
                -- a second inspector a form that could only ever 403 on submit.
                q.inspector_id  AS inspection_inspector_id,
                iu.display_name AS inspection_inspector_name,
                -- Prior FAILED attempts, so the inspector knows this car has
                -- been round before and what for.
                (SELECT count(*) FROM repair.quality_inspections f
                  WHERE f.test_session_id = s.id AND f.status = 'failed') AS failed_attempts,
                repair.user_worked_on_job_card(j.id, $3) AS viewer_worked_on_it
           FROM repair.repair_test_sessions s
           JOIN repair.job_cards j
             ON j.id = s.job_card_id AND j.tenant_id = s.tenant_id
           -- The OPEN inspection, if there is one. A LEFT JOIN, because a repair
           -- with no inspection yet is exactly what this queue is for.
           LEFT JOIN repair.quality_inspections q
             ON q.test_session_id = s.id AND q.status = 'in_progress'
           -- Reached THROUGH the tenant-isolated inspection row, never selected
           -- directly: identity.users has no RLS of its own.
           LEFT JOIN identity.users iu ON iu.id = q.inspector_id
          WHERE s.tenant_id = $1 AND s.organization_id = $2
            AND s.status = 'submitted'
            -- ⚠️ ALREADY-PASSED REPAIRS ARE EXCLUDED, and a NOT EXISTS is used
            -- rather than a join condition: a LEFT JOIN does not filter, it only
            -- adds columns. This repository has already shipped a count that
            -- included rows it meant to exclude for exactly that reason.
            AND NOT EXISTS (
              SELECT 1 FROM repair.quality_inspections p
               WHERE p.test_session_id = s.id AND p.status = 'passed')
          ORDER BY s.submitted_at ASC NULLS LAST`,
        [ctx.tenantId, ctx.organizationId, ctx.userId],
      );

      return {
        mayInspectAtAll: mayInspect(ctx.activeRole),
        items: rows.map((r) => {
          const row = r as Record<string, unknown>;
          return {
            testSessionId: String(row['test_session_id']),
            jobCardId: String(row['job_card_id']),
            jobNumber: String(row['job_number']),
            complaint: (row['complaint'] as string | null) ?? null,
            stage: String(row['stage']),
            submittedAt: row['submitted_at'] === null ? null : String(row['submitted_at']),
            inspectionId: row['inspection_id'] === null ? null : String(row['inspection_id']),
            attemptNo: row['attempt_no'] === null ? null : Number(row['attempt_no']),
            // True only when the OPEN inspection is this viewer's own.
            inspectionIsMine: row['inspection_inspector_id'] === ctx.userId,
            inspectionInspectorName:
              (row['inspection_inspector_name'] as string | null) ?? null,
            failedAttempts: Number(row['failed_attempts'] ?? 0),
            // Both halves of §563, resolved per row for this viewer.
            mayInspect: mayInspect(ctx.activeRole) && row['viewer_worked_on_it'] !== true,
            viewerWorkedOnIt: row['viewer_worked_on_it'] === true,
          };
        }),
      };
    });
  }

  /** Inspections on a job card, newest attempt first. */
  async listForCard(ctx: TenantContext, jobCardId: string): Promise<QualityInspection[]> {
    // 🔴 STAFF ONLY (A5). `customer` is a real membership role in this same
    // organisation and the controller carries only TenantGuard. This returns
    // the WORKSHOP'S queue — added work, costs and internal review notes —
    // which is not a customer's to browse.
    assertWorkshopStaff(ctx, 'The quality inspections on this repair');
    return this.db.withTenant(ctx, async (client) => {
      const { rows } = await client.query(
        `SELECT q.id, q.job_card_id, j.job_number, q.test_session_id, q.attempt_no,
                q.status, q.complaint_addressed, q.new_defect_found,
                q.new_defect_description, q.notes, q.inspector_id,
                -- ⚠️ JOINED THROUGH A ROW RLS PROTECTS. identity.users has NO
                -- row-level security, so a bare select there returns every user
                -- on the platform. Reaching it from quality_inspections, which
                -- is tenant-isolated, is what scopes this name.
                u.display_name AS inspector_name,
                q.started_at, q.decided_at
           FROM repair.quality_inspections q
           JOIN repair.job_cards j
             ON j.id = q.job_card_id AND j.tenant_id = q.tenant_id
           LEFT JOIN identity.users u ON u.id = q.inspector_id
          WHERE q.job_card_id = $1 AND q.tenant_id = $2 AND q.organization_id = $3
          ORDER BY q.attempt_no DESC`,
        [jobCardId, ctx.tenantId, ctx.organizationId],
      );
      return rows.map((r) => QualityService.toInspection(r as Record<string, unknown>));
    });
  }

  /**
   * Open an inspection against a submitted test session.
   *
   * ⚠️ THE INSPECTOR IS `ctx.userId`, NEVER A FIELD. Accepting an inspector id
   * from the caller would let anyone record somebody else as having carried out
   * the check — which is the signature this whole slice exists to make
   * trustworthy. `1.txt` §9's rule about never trusting a client-supplied
   * identity applies to more than the tenant.
   */
  async open(ctx: TenantContext, testSessionId: string): Promise<QualityInspection> {
    this.assertMayInspect(ctx);

    return this.db.withTenant(ctx, async (client) => {
      const session = await client.query(
        `SELECT s.id, s.job_card_id, s.status
           FROM repair.repair_test_sessions s
          WHERE s.id = $1 AND s.tenant_id = $2 AND s.organization_id = $3`,
        [testSessionId, ctx.tenantId, ctx.organizationId],
      );
      const found = session.rows[0] as { job_card_id: string; status: string } | undefined;
      // 404 rather than 403 — the same non-oracle rule as every other read here.
      if (!found) throw new NotFoundException('test session not found');

      if (found.status !== 'submitted') {
        throw new ConflictException(
          'quality control follows testing: this test session has not been submitted yet',
        );
      }

      // ⚠️ CHECKED HERE FOR THE MESSAGE, ENFORCED BY THE TRIGGER. Without this
      // the inspector would get `insufficient_privilege` with no explanation of
      // which rule refused them or what to do about it.
      const worked = await client.query(
        `SELECT repair.user_worked_on_job_card($1, $2) AS worked`,
        [found.job_card_id, ctx.userId],
      );
      if (worked.rows[0]?.['worked'] === true) {
        throw new ForbiddenException(
          'you worked on this repair and cannot carry out its quality inspection. ' +
            '§563 requires an independent check — ask a colleague who did not do the work.',
        );
      }

      const open = await client.query(
        `SELECT id FROM repair.quality_inspections
          WHERE test_session_id = $1 AND tenant_id = $2 AND status = 'in_progress'`,
        [testSessionId, ctx.tenantId],
      );
      if (open.rows.length > 0) {
        throw new ConflictException(
          'an inspection is already open for this repair; complete it before starting another',
        );
      }

      // ⚠️ THE UNIQUE VIOLATION IS TRANSLATED, NOT LEAKED. Raised by Codex:
      // `open()` is check-then-insert, so two inspectors starting at the same
      // moment both read "no inspection open" and both compute the same
      // `attempt_no`. `uq_qc_session_attempt` correctly refuses the second — but
      // as a raw `23505`, which surfaces to the loser as a 500 rather than as
      // the conflict this method already knows how to describe.
      //
      // The constraint stays the arbiter; this only gives its refusal a sentence.
      let inserted;
      try {
        inserted = await client.query(
          `INSERT INTO repair.quality_inspections
             (tenant_id, organization_id, job_card_id, test_session_id, attempt_no,
              inspector_id, created_by, updated_by)
           SELECT $1, $2, $3, $4,
                  -- Re-inspection is a NEW attempt, never an edit: the failed
                  -- inspection is the record of why the car went back.
                  COALESCE(max(attempt_no), 0) + 1,
                  $5, $5, $5
             FROM repair.quality_inspections
            WHERE test_session_id = $4 AND tenant_id = $1
           RETURNING id`,
          [ctx.tenantId, ctx.organizationId, found.job_card_id, testSessionId, ctx.userId],
        );
      } catch (err) {
        if ((err as { code?: string }).code === '23505') {
          throw new ConflictException(
            'another inspector opened an inspection for this repair a moment ago; ' +
              'reload to see it',
          );
        }
        throw err;
      }

      const id = inserted.rows[0]?.['id'] as string | undefined;
      if (!id) throw new ForbiddenException('the inspection could not be opened');

      return QualityService.one(await this.readOne(client, ctx, id));
    });
  }

  /**
   * Record the verdict.
   *
   * 🔴 THE STATUS IS DERIVED FROM §563'S TWO ANSWERS, never supplied. See
   * `parseQualityDecision`. Migration 030's `ck_qc_decision_consistent` makes
   * the contradictory pairing unreachable in the database as well.
   */
  async decide(
    ctx: TenantContext,
    inspectionId: string,
    raw: Record<string, unknown>,
  ): Promise<QualityInspection> {
    this.assertMayInspect(ctx);

    let input;
    try {
      input = parseQualityDecision(raw ?? {});
    } catch (err) {
      if (err instanceof QualityInputError) throw new BadRequestException(err.message);
      throw err;
    }

    return this.db.withTenant(ctx, async (client) => {
      const current = await client.query(
        `SELECT id, status, inspector_id FROM repair.quality_inspections
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3
          -- Serialises two inspectors answering the same row, so the second
          -- reads the status the first committed rather than both passing the
          -- check and one landing on a decided row as a 500.
          FOR UPDATE`,
        [inspectionId, ctx.tenantId, ctx.organizationId],
      );
      const row = current.rows[0] as { status: string; inspector_id: string } | undefined;
      if (!row) throw new NotFoundException('inspection not found');

      if (row.status !== 'in_progress') {
        throw new ConflictException(
          `this inspection was already ${row.status} and cannot be changed; ` +
            're-inspection is recorded as a new attempt',
        );
      }

      // ⚠️ THE PERSON WHO OPENED IT IS THE PERSON WHO SIGNS IT. Anything else
      // would put one inspector's name against another's judgement — the
      // signature is the entire value of an independent check.
      if (row.inspector_id !== ctx.userId) {
        throw new ForbiddenException(
          'this inspection was opened by somebody else; only the inspector who ' +
            'carried it out may record its result',
        );
      }

      await client.query(
        `UPDATE repair.quality_inspections
            SET status = $2,
                complaint_addressed = $3,
                new_defect_found = $4,
                new_defect_description = $5,
                notes = $6,
                decided_at = now(),
                updated_at = now(),
                updated_by = $7
          WHERE id = $1`,
        [
          inspectionId,
          input.status,
          input.complaintAddressed,
          input.newDefectFound,
          input.newDefectDescription,
          input.notes,
          ctx.userId,
        ],
      );

      return QualityService.one(await this.readOne(client, ctx, inspectionId));
    });
  }

  private async readOne(
    client: { query: (t: string, v: unknown[]) => Promise<{ rows: unknown[] }> },
    ctx: TenantContext,
    id: string,
  ): Promise<QualityInspection[]> {
    const { rows } = await client.query(
      `SELECT q.id, q.job_card_id, j.job_number, q.test_session_id, q.attempt_no,
              q.status, q.complaint_addressed, q.new_defect_found,
              q.new_defect_description, q.notes, q.inspector_id,
              u.display_name AS inspector_name, q.started_at, q.decided_at
         FROM repair.quality_inspections q
         JOIN repair.job_cards j
           ON j.id = q.job_card_id AND j.tenant_id = q.tenant_id
         LEFT JOIN identity.users u ON u.id = q.inspector_id
        WHERE q.id = $1 AND q.tenant_id = $2 AND q.organization_id = $3`,
      [id, ctx.tenantId, ctx.organizationId],
    );
    return rows.map((r) => QualityService.toInspection(r as Record<string, unknown>));
  }

  private static one(rows: QualityInspection[]): QualityInspection {
    const row = rows[0];
    if (!row) throw new NotFoundException('inspection not found');
    return row;
  }

  private static toInspection(r: Record<string, unknown>): QualityInspection {
    return {
      id: String(r['id']),
      jobCardId: String(r['job_card_id']),
      jobNumber: String(r['job_number']),
      testSessionId: String(r['test_session_id']),
      attemptNo: Number(r['attempt_no']),
      status: r['status'] as QualityStatus,
      complaintAddressed: r['complaint_addressed'] as boolean | null,
      newDefectFound: r['new_defect_found'] as boolean | null,
      newDefectDescription: (r['new_defect_description'] as string | null) ?? null,
      notes: (r['notes'] as string | null) ?? null,
      inspectorId: String(r['inspector_id']),
      inspectorName: (r['inspector_name'] as string | null) ?? null,
      startedAt: String(r['started_at']),
      decidedAt: r['decided_at'] === null ? null : String(r['decided_at']),
    };
  }
}
