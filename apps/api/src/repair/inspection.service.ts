import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';
import { optionalInt, optionalText, requireOneOf, requireUuid } from '../core/validate';
import {
  CAN_READ_INSPECTION,
  CAN_RECORD_INSPECTION,
  FINDING_RESULTS,
  INSPECTION_CHECKPOINTS,
  INSPECTION_RESULTS,
  INSPECTION_START_STAGE,
  checkpointLabel,
  isCheckpointCode,
  type InspectionResult,
} from './inspection-checklist';

export interface InspectionItem {
  id: string;
  checkpointCode: string;
  /** Resolved from the code, so a retired checkpoint still renders. */
  label: string;
  position: number;
  result: InspectionResult | null;
  note: string | null;
  recordedAt: string | null;
}

export interface Inspection {
  id: string;
  jobCardId: string;
  jobNumber: string;
  registrationNumber: string;
  attemptNo: number;
  status: 'in_progress' | 'submitted';
  mileageReading: number | null;
  summary: string | null;
  startedByName: string | null;
  startedAt: string;
  submittedByName: string | null;
  submittedAt: string | null;
  items: InspectionItem[];
  /**
   * Derived, never stored — a stored copy would be a second statement of the
   * same fact, free to drift the moment an item is answered.
   */
  answeredCount: number;
  findingCount: number;
  /**
   * Whether THIS viewer may still write to THIS inspection.
   *
   * ⚠️ A UI CONVENIENCE, NEVER A CONTROL — the same rule as `allowedStages` on a
   * job card. Every write re-derives the whole judgement server-side, because a
   * disabled button is a suggestion and anyone can call the API directly
   * (CLAUDE.md §8 — hidden is not secure).
   */
  editable: boolean;
}

/**
 * The inspection sheet as it is presented for a job card — `07.txt` §2920-§2978.
 *
 * The checklist is created WHOLE when the inspection starts (all 19 rows, no
 * result), so this service never has to reconcile a stored sheet against a
 * template that may have moved. See migration 010's header for why.
 */
@Injectable()
export class InspectionService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Every inspection recorded against a job card, newest attempt first.
   *
   * Reads the card through the SAME scoping predicates `JobCardService` uses, so
   * the three scopes are inherited rather than restated: staff see their
   * organisation, a technician only cards assigned to them. A separate rule here
   * is a second place for the narrowing to be forgotten.
   */
  async listForJobCard(ctx: TenantContext, jobCardId: string): Promise<Inspection[]> {
    this.assertMayRead(ctx);
    const cardId = requireUuid(jobCardId, 'jobCardId');

    return this.db.withTenant(ctx, async (client) => {
      // 404 for a card this viewer cannot see, BEFORE any inspection is read —
      // otherwise an empty list would mean both "no inspections yet" and "not
      // your card", and the endpoint would confirm which cards exist.
      await this.assertCardVisible(client, ctx, cardId);
      const rows = await this.readInspections(client, ctx, { jobCardId: cardId });
      return rows;
    });
  }

  /**
   * Every inspection in the organisation, newest attempt first.
   *
   * Exists so the inspection queue can show one row per job card WITH the state
   * of its sheet in two requests rather than one per card. The alternative — the
   * screen asking `/job-cards/:id/inspections` per card — is the N+1 that is
   * slowest exactly when the queue is longest.
   *
   * Inherits the technician narrowing from `readInspections`, so a technician's
   * queue is their own assigned work and nobody else's.
   */
  async list(ctx: TenantContext): Promise<Inspection[]> {
    this.assertMayRead(ctx);
    return this.db.withTenant(ctx, (client) => this.readInspections(client, ctx, {}));
  }

  async findById(ctx: TenantContext, id: string): Promise<Inspection> {
    this.assertMayRead(ctx);
    const inspectionId = requireUuid(id, 'id');

    return this.db.withTenant(ctx, async (client) => {
      const rows = await this.readInspections(client, ctx, { inspectionId });
      return InspectionService.one(rows);
    });
  }

  /**
   * §2924 — "The technician selects 'Start Inspection.'"
   *
   * Creates the header AND the 19 checklist rows in one transaction. A sheet that
   * exists without its questions would be an inspection nobody can complete, and
   * the two halves are one fact.
   */
  async start(
    ctx: TenantContext,
    jobCardId: string,
    input: { mileageReading?: number } = {},
  ): Promise<Inspection> {
    this.assertMayRecord(ctx);
    const cardId = requireUuid(jobCardId, 'jobCardId');
    const mileageReading = optionalInt(input.mileageReading, 'mileageReading', 0, 100_000_000);

    return this.db.withTenant(ctx, async (client) => {
      // FOR UPDATE on the card: two technicians pressing Start at the same moment
      // would otherwise both read "highest attempt = 1" and both try to write
      // attempt 2. The unique constraint would catch the second, but as a 500
      // about a constraint name; locking the card turns it into a clean sequence.
      const card = await this.assertCardVisible(client, ctx, cardId, { lock: true });

      // ── the vehicle must actually be here ────────────────────────────────
      // See INSPECTION_START_STAGE: an inspection recorded against a card at
      // `complaint_received` is a signed statement about a car nobody has seen.
      if (card.stage !== INSPECTION_START_STAGE) {
        throw new BadRequestException(
          `an inspection may only be started while the job card is at ` +
            `'${INSPECTION_START_STAGE}'; this card is at '${card.stage}'. ` +
            `Move the card to '${INSPECTION_START_STAGE}' first.`,
        );
      }

      // One open inspection at a time. Two in-progress sheets for one card is not
      // a second look — it is two people recording half an inspection each, and
      // nothing says which one the quotation should be built from.
      const open = await client.query(
        `SELECT id FROM repair.inspections
          WHERE job_card_id = $1 AND tenant_id = $2 AND status = 'in_progress'`,
        [cardId, ctx.tenantId],
      );
      if (open.rows.length > 0) {
        throw new ConflictException(
          'this job card already has an inspection in progress; submit it before starting another',
        );
      }

      const next = await client.query(
        `SELECT COALESCE(max(attempt_no), 0) + 1 AS n
           FROM repair.inspections
          WHERE job_card_id = $1 AND tenant_id = $2`,
        [cardId, ctx.tenantId],
      );
      const attemptNo = Number(next.rows[0].n);

      const inserted = await client.query(
        `INSERT INTO repair.inspections
           (tenant_id, organization_id, job_card_id, attempt_no, mileage_reading,
            started_by, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$6,$6)
         RETURNING id`,
        [
          ctx.tenantId,
          ctx.organizationId,
          cardId,
          attemptNo,
          // Defaults to what reception recorded at the door, which is the figure
          // the technician would otherwise re-key off the same screen. They can
          // correct it — that correction IS a finding.
          mileageReading ?? card.mileage_at_intake ?? null,
          ctx.userId,
        ],
      );
      const inspectionId = inserted.rows[0].id as string;

      // The whole sheet, in one statement rather than 19 round trips. `position`
      // is stored as asked so the historical order survives a template edit.
      await client.query(
        `INSERT INTO repair.inspection_items
           (tenant_id, organization_id, inspection_id, checkpoint_code, position)
         SELECT $1, $2, $3, code, position
           FROM unnest($4::text[], $5::int[]) AS t(code, position)`,
        [
          ctx.tenantId,
          ctx.organizationId,
          inspectionId,
          INSPECTION_CHECKPOINTS.map((c) => c.code),
          INSPECTION_CHECKPOINTS.map((_, i) => i + 1),
        ],
      );

      await this.audit.write(client, ctx, {
        action: 'inspection.started',
        resourceType: 'inspection',
        resourceId: inspectionId,
        // The job number and attempt, never the notes: a technician's working
        // note can contain anything, and the audit trail is read by people who
        // need to know an inspection happened (`1.txt` §1646).
        detail: { jobNumber: card.job_number, attemptNo },
      });

      const rows = await this.readInspections(client, ctx, { inspectionId });
      return InspectionService.one(rows);
    });
  }

  /**
   * §2968-§2978 — record results and notes against the checklist.
   *
   * Takes a BATCH: a technician works down the sheet and a request per checkpoint
   * would be 19 round trips from a workshop tablet on workshop wifi. One
   * transaction also means a partly-saved sheet cannot exist.
   */
  async recordItems(
    ctx: TenantContext,
    inspectionId: string,
    input: {
      items?: Array<{ checkpointCode: string; result: string; note?: string }>;
      mileageReading?: number;
      summary?: string;
    },
  ): Promise<Inspection> {
    this.assertMayRecord(ctx);
    const id = requireUuid(inspectionId, 'id');

    const items = input.items ?? [];
    if (!Array.isArray(items)) {
      throw new BadRequestException('items must be an array');
    }

    // Validate EVERYTHING before writing anything. A half-applied sheet would
    // leave the technician guessing which of their answers landed.
    const validated = items.map((item, index) => {
      const code = String(item?.checkpointCode ?? '');
      if (!isCheckpointCode(code)) {
        throw new BadRequestException(
          `items[${index}].checkpointCode '${code}' is not a checkpoint on this checklist`,
        );
      }
      return {
        code,
        result: requireOneOf(item?.result, INSPECTION_RESULTS, `items[${index}].result`),
        note: optionalText(item?.note, `items[${index}].note`, 2000),
      };
    });

    // A checkpoint answered twice in one request has no defined winner. Rejecting
    // is the honest response; picking the last would silently discard an answer
    // the caller believed they had recorded.
    const seen = new Set<string>();
    for (const item of validated) {
      if (seen.has(item.code)) {
        throw new BadRequestException(`checkpoint '${item.code}' appears more than once`);
      }
      seen.add(item.code);
    }

    const mileageReading = optionalInt(input.mileageReading, 'mileageReading', 0, 100_000_000);
    const summary = optionalText(input.summary, 'summary', 8000);

    if (validated.length === 0 && mileageReading === null && summary === null) {
      throw new BadRequestException('nothing to record');
    }

    return this.db.withTenant(ctx, async (client) => {
      const inspection = await this.assertWritable(client, ctx, id);

      for (const item of validated) {
        const updated = await client.query(
          // 🔴 `recorded_by` IS THE LAST EDITOR; `first_recorded_by` IS WHO
          // FOUND IT. This UPDATE used to overwrite the only record of the
          // second, so the technician who actually looked at the brake was
          // replaced by whoever last touched the sheet — and "who found this?"
          // is the first question asked when a finding turns out to be wrong.
          //
          // COALESCE, so the first recording sets it and no later edit can.
          // Migration 052 enforces that with a trigger too, because this
          // service is one caller and the next one will not remember.
          `UPDATE repair.inspection_items
              SET result = $1, note = $2, recorded_by = $3, recorded_at = now(),
                  first_recorded_by = COALESCE(first_recorded_by, $3),
                  first_recorded_at = COALESCE(first_recorded_at, now())
            WHERE inspection_id = $4 AND checkpoint_code = $5 AND tenant_id = $6`,
          [item.result, item.note, ctx.userId, id, item.code, ctx.tenantId],
        );
        // The row is created when the inspection starts, so a miss means the
        // sheet is not the one this code belongs to. Reported rather than
        // silently skipped — `rowCount` 0 on an UPDATE is the quiet no-op that
        // makes a write look successful (the `'ApiFailure' in 'describeApiFailure'`
        // lesson, in SQL form).
        if (updated.rowCount === 0) {
          throw new NotFoundException(
            `checkpoint '${item.code}' is not on this inspection sheet`,
          );
        }
      }

      if (mileageReading !== null || summary !== null) {
        await client.query(
          `UPDATE repair.inspections
              SET mileage_reading = COALESCE($1, mileage_reading),
                  summary         = COALESCE($2, summary),
                  updated_at = now(), updated_by = $3
            WHERE id = $4 AND tenant_id = $5`,
          [mileageReading, summary, ctx.userId, id, ctx.tenantId],
        );
      }

      await this.audit.write(client, ctx, {
        action: 'inspection.items_recorded',
        resourceType: 'inspection',
        resourceId: id,
        // WHICH checkpoints, and how many — not the notes. The codes are a fixed
        // vocabulary from the specification, so they carry no free text.
        detail: {
          jobNumber: inspection.job_number,
          checkpoints: validated.map((i) => i.code),
        },
      });

      const rows = await this.readInspections(client, ctx, { inspectionId: id });
      return InspectionService.one(rows);
    });
  }

  /**
   * Submit the inspection — it becomes the finding of record and stops being
   * writable.
   *
   * The completeness check is the point of this method. §2926's checklist is only
   * a checklist if going past it requires an answer to every question; a sheet
   * that can be submitted with fourteen of nineteen answered is a sheet where the
   * five nobody looked at are indistinguishable from the ones that passed.
   */
  async submit(ctx: TenantContext, inspectionId: string): Promise<Inspection> {
    this.assertMayRecord(ctx);
    const id = requireUuid(inspectionId, 'id');

    return this.db.withTenant(ctx, async (client) => {
      const inspection = await this.assertWritable(client, ctx, id);

      // ⚠️ THE EMPTY SHEET (Supervisor pass on this slice; Codex did not flag it).
      //
      // The completeness gate below asks "is any checkpoint unanswered". For a
      // sheet with NO checkpoints the answer is no — so an empty inspection would
      // submit cleanly and become a finding of record stating that a vehicle was
      // inspected against nothing. A vacuous truth in the one gate this slice
      // exists to provide.
      //
      // Not reachable through `start`, which writes all 19 rows in the same
      // transaction as the header. Reachable by anything else that ever creates
      // an inspection — a future importer, a fixture, a manual insert — and the
      // cost of ruling it out is one count.
      const total = await client.query(
        `SELECT count(*)::int AS n
           FROM repair.inspection_items
          WHERE inspection_id = $1 AND tenant_id = $2`,
        [id, ctx.tenantId],
      );
      if (Number(total.rows[0].n) === 0) {
        throw new BadRequestException(
          'this inspection has no checklist and cannot be submitted; start a new inspection',
        );
      }

      const unanswered = await client.query(
        `SELECT checkpoint_code
           FROM repair.inspection_items
          WHERE inspection_id = $1 AND tenant_id = $2 AND result IS NULL
          ORDER BY position`,
        [id, ctx.tenantId],
      );
      if (unanswered.rows.length > 0) {
        const names = (unanswered.rows as Array<{ checkpoint_code: string }>)
          .map((r) => checkpointLabel(r.checkpoint_code));
        throw new BadRequestException(
          `the inspection cannot be submitted with ${names.length} checkpoint(s) unanswered: ` +
            `${names.join(', ')}. Record 'not applicable' for any that do not apply.`,
        );
      }

      await client.query(
        `UPDATE repair.inspections
            SET status = 'submitted', submitted_by = $1, submitted_at = now(),
                updated_at = now(), updated_by = $1
          WHERE id = $2 AND tenant_id = $3`,
        [ctx.userId, id, ctx.tenantId],
      );

      const findings = await client.query(
        `SELECT count(*)::int AS n
           FROM repair.inspection_items
          WHERE inspection_id = $1 AND tenant_id = $2 AND result = ANY($3::text[])`,
        [id, ctx.tenantId, [...FINDING_RESULTS]],
      );

      await this.audit.write(client, ctx, {
        action: 'inspection.submitted',
        resourceType: 'inspection',
        resourceId: id,
        detail: {
          jobNumber: inspection.job_number,
          attemptNo: inspection.attempt_no,
          findingCount: findings.rows[0].n as number,
        },
      });

      const rows = await this.readInspections(client, ctx, { inspectionId: id });
      return InspectionService.one(rows);
    });
  }

  // ── reads ────────────────────────────────────────────────────────────────

  /**
   * One query for the headers, one for the items — not one per inspection.
   *
   * A card with three attempts would otherwise cost four round trips, and the
   * technician's screen renders the whole history. Same reasoning as the LATERAL
   * join on the staging board: the N+1 shows up on the busiest day.
   */
  private async readInspections(
    client: Client,
    ctx: TenantContext,
    filter: { jobCardId?: string; inspectionId?: string },
  ): Promise<Inspection[]> {
    const headers = await client.query(
      `SELECT i.id, i.job_card_id, j.job_number, v.registration_number,
              i.attempt_no, i.status, i.mileage_reading, i.summary,
              i.started_at, i.submitted_at,
              sb.display_name AS started_by_name,
              su.display_name AS submitted_by_name
         FROM repair.inspections i
         JOIN repair.job_cards j
           ON j.id = i.job_card_id AND j.tenant_id = i.tenant_id
         JOIN core.vehicles v
           ON v.id = j.vehicle_id AND v.tenant_id = j.tenant_id
         -- ⚠️ NO core.customers JOIN HERE, DELIBERATELY (Supervisor pass on this
         -- slice). An earlier version joined it and never referenced it in the
         -- WHERE clause — harmless in effect, but it read as though an OWNERSHIP
         -- predicate were being applied when none was, which is the most
         -- dangerous kind of dead code in an authorization path: the next person
         -- to add an owner-scoped role here would see the join and assume the
         -- narrowing was already done.
         --
         -- There is no customer scope to apply, because the customer role is
         -- absent from CAN_READ_INSPECTION — 2.txt S557 gives the vehicle owner a
         -- prepared diagnostic report, not the technician's working sheet. If a
         -- role that must be owner-scoped is ever added to that set, the predicate
         -- has to be added HERE, consciously, and the join comes back with it.
         --
         -- (No backticks in this comment: it lives inside a template literal, and
         -- a stray one ends the SQL string. Cost one failed transform to learn.)
         --
         -- LEFT: a user record can be withdrawn while the inspection they
         -- recorded remains the finding of record. An inner join would delete
         -- the inspection from view along with the leaver.
         LEFT JOIN identity.users sb ON sb.id = i.started_by
         LEFT JOIN identity.users su ON su.id = i.submitted_by
        WHERE i.tenant_id = $1
          AND i.organization_id = $2
          AND ($3::uuid IS NULL OR i.job_card_id = $3::uuid)
          AND ($4::uuid IS NULL OR i.id = $4::uuid)
          -- THE SAME NARROWING THE JOB CARD ITSELF CARRIES. Without it, an
          -- inspection id would read out a card a technician is not assigned to
          -- — the card would be unreachable and its inspection sheet would not.
          AND ($5::uuid IS NULL OR j.assigned_technician_id = $5::uuid)
        ORDER BY i.attempt_no DESC`,
      [
        ctx.tenantId,
        ctx.organizationId,
        filter.jobCardId ?? null,
        filter.inspectionId ?? null,
        ctx.activeRole === 'technician' ? ctx.userId : null,
      ],
    );

    const rows = headers.rows as HeaderRow[];
    if (rows.length === 0) return [];

    const items = await client.query(
      `SELECT id, inspection_id, checkpoint_code, position, result, note, recorded_at
         FROM repair.inspection_items
        WHERE inspection_id = ANY($1::uuid[]) AND tenant_id = $2
        ORDER BY position`,
      [rows.map((r) => r.id), ctx.tenantId],
    );

    const byInspection = new Map<string, InspectionItem[]>();
    for (const raw of items.rows as ItemRow[]) {
      const list = byInspection.get(raw.inspection_id) ?? [];
      list.push({
        id: raw.id,
        checkpointCode: raw.checkpoint_code,
        label: checkpointLabel(raw.checkpoint_code),
        position: raw.position,
        result: raw.result,
        note: raw.note,
        recordedAt: raw.recorded_at ? raw.recorded_at.toISOString() : null,
      });
      byInspection.set(raw.inspection_id, list);
    }

    return rows.map((row) => {
      const sheet = byInspection.get(row.id) ?? [];
      return {
        id: row.id,
        jobCardId: row.job_card_id,
        jobNumber: row.job_number,
        registrationNumber: row.registration_number,
        attemptNo: row.attempt_no,
        status: row.status,
        mileageReading: row.mileage_reading,
        summary: row.summary,
        startedByName: row.started_by_name,
        startedAt: row.started_at.toISOString(),
        submittedByName: row.submitted_by_name,
        submittedAt: row.submitted_at ? row.submitted_at.toISOString() : null,
        items: sheet,
        answeredCount: sheet.filter((i) => i.result !== null).length,
        findingCount: sheet.filter((i) => i.result !== null && FINDING_RESULTS.includes(i.result))
          .length,
        editable: row.status === 'in_progress' && CAN_RECORD_INSPECTION.has(ctx.activeRole),
      };
    });
  }

  /**
   * The job card, scoped exactly as `JobCardService` scopes it.
   *
   * ⚠️ 404, NOT 403 — the same non-oracle rule as every other read here. A
   * technician probing a card they are not assigned to gets what they would get
   * for an id that does not exist.
   */
  private async assertCardVisible(
    client: Client,
    ctx: TenantContext,
    cardId: string,
    opts: { lock?: boolean } = {},
  ): Promise<CardRow> {
    const found = await client.query(
      `SELECT j.id, j.job_number, j.stage, j.mileage_at_intake
         FROM repair.job_cards j
         JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
        WHERE j.id = $1 AND j.tenant_id = $2 AND j.organization_id = $3
          AND ($4::uuid IS NULL OR j.assigned_technician_id = $4::uuid)
          AND ($5::uuid IS NULL OR c.user_id = $5::uuid)
        ${opts.lock ? 'FOR UPDATE OF j' : ''}`,
      [
        cardId,
        ctx.tenantId,
        ctx.organizationId,
        ctx.activeRole === 'technician' ? ctx.userId : null,
        ctx.activeRole === 'customer' ? ctx.userId : null,
      ],
    );
    const card = found.rows[0] as CardRow | undefined;
    if (!card) throw new NotFoundException('job card not found');
    return card;
  }

  /**
   * The inspection exists, this viewer may reach it, and it is still open.
   *
   * The submitted case is a 409 rather than a 403: the caller holds the right to
   * write inspections, and what refuses them is the state of this one. Telling
   * them "forbidden" would send them looking for a permission problem that does
   * not exist.
   */
  private async assertWritable(
    client: Client,
    ctx: TenantContext,
    inspectionId: string,
  ): Promise<{ job_number: string; attempt_no: number }> {
    const found = await client.query(
      `SELECT i.id, i.status, i.attempt_no, j.job_number
         FROM repair.inspections i
         JOIN repair.job_cards j
           ON j.id = i.job_card_id AND j.tenant_id = i.tenant_id
        WHERE i.id = $1 AND i.tenant_id = $2 AND i.organization_id = $3
          AND ($4::uuid IS NULL OR j.assigned_technician_id = $4::uuid)
        -- The row lock serialises two technicians recording the same sheet, so
        -- the second reads the status the first committed. Without it both could
        -- pass the submitted check and one write would land on a submitted
        -- inspection — refused by the trigger, but as a 500.
        FOR UPDATE OF i`,
      [
        inspectionId,
        ctx.tenantId,
        ctx.organizationId,
        ctx.activeRole === 'technician' ? ctx.userId : null,
      ],
    );
    const row = found.rows[0] as
      | { id: string; status: string; attempt_no: number; job_number: string }
      | undefined;
    if (!row) throw new NotFoundException('inspection not found');
    if (row.status === 'submitted') {
      throw new ConflictException(
        'this inspection is submitted and cannot be changed; start a new inspection to record a second look',
      );
    }
    return { job_number: row.job_number, attempt_no: row.attempt_no };
  }

  /**
   * The one sheet a read was for.
   *
   * `readInspections` returns an array because it serves the list too, so every
   * single-sheet caller has to narrow it. A shared helper rather than a
   * non-null assertion at four call sites: after `start` the row certainly
   * exists, but "certainly" is what an assertion asserts and a 404 is what the
   * caller should see if a scoping predicate ever makes it disappear.
   */
  private static one(rows: Inspection[]): Inspection {
    const first = rows[0];
    if (!first) throw new NotFoundException('inspection not found');
    return first;
  }

  private assertMayRead(ctx: TenantContext): void {
    if (!CAN_READ_INSPECTION.has(ctx.activeRole)) {
      throw new ForbiddenException(`role '${ctx.activeRole}' may not read inspections`);
    }
  }

  private assertMayRecord(ctx: TenantContext): void {
    if (!CAN_RECORD_INSPECTION.has(ctx.activeRole)) {
      throw new ForbiddenException(`role '${ctx.activeRole}' may not record an inspection`);
    }
  }
}

/**
 * The narrow slice of `pg`'s client this service uses, inside `withTenant`.
 *
 * `rowCount` is `number | null` because that is what `pg` declares — narrowing it
 * to `number` here would make a real `PoolClient` fail to satisfy this interface,
 * and the fix would be a cast that hides the difference rather than respects it.
 */
interface Client {
  query: (
    text: string,
    values: unknown[],
  ) => Promise<{ rows: unknown[]; rowCount: number | null }>;
}

interface CardRow {
  id: string;
  job_number: string;
  stage: string;
  mileage_at_intake: number | null;
}

interface HeaderRow {
  id: string;
  job_card_id: string;
  job_number: string;
  registration_number: string;
  attempt_no: number;
  status: 'in_progress' | 'submitted';
  mileage_reading: number | null;
  summary: string | null;
  started_at: Date;
  submitted_at: Date | null;
  started_by_name: string | null;
  submitted_by_name: string | null;
}

interface ItemRow {
  id: string;
  inspection_id: string;
  checkpoint_code: string;
  position: number;
  result: InspectionResult | null;
  note: string | null;
  recorded_at: Date | null;
}
