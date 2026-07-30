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
import { optionalInt, optionalText, requireOneOf, requireText, requireUuid } from '../core/validate';
import {
  CAN_APPROVE_CRITICAL_OVERRIDE,
  CAN_READ_TESTS,
  CAN_RECORD_TESTS,
  REQUIRED_EXECUTION_STATUS,
  ROAD_TEST_OUTCOMES,
  TEST_CATEGORIES,
  TEST_OUTCOMES,
  roadTestOutcomeLabel,
  testCategoryLabel,
  type RoadTestOutcome,
  type TestCategory,
  type TestOutcome,
  type TestSessionStatus,
} from './testing-rules';

export interface TestResult {
  id: string;
  position: number;
  testCategory: TestCategory | string;
  testCategoryLabel: string;
  testName: string;
  testProcedure: string | null;
  testEquipment: string | null;
  equipmentIdentifier: string | null;
  /** §34 names it explicitly — a reading from an uncalibrated gauge is not evidence. */
  calibrationStatus: string | null;
  expectedResult: string | null;
  actualResult: string | null;
  unitOfMeasurement: string | null;
  outcome: TestOutcome | string;
  evidenceId: string | null;
  comments: string | null;
  testedByName: string | null;
  testedAt: string;
}

export interface TestSession {
  id: string;
  jobCardId: string;
  jobNumber: string;
  registrationNumber: string;
  executionId: string;
  executionAttemptNo: number;
  attemptNo: number;
  status: TestSessionStatus;
  scanPerformed: boolean;
  preRepairFaultCodes: string | null;
  codesCleared: string | null;
  codesRemaining: string | null;
  newCodes: string | null;
  liveDataChecks: string | null;
  systemReadiness: string | null;
  warningLightStatus: string | null;
  criticalFaultsRemain: boolean;
  overrideApprovedByName: string | null;
  overrideApprovedAt: string | null;
  overrideReason: string | null;
  roadTestPerformed: boolean;
  roadTestDriver: string | null;
  roadTestStartMileage: number | null;
  roadTestEndMileage: number | null;
  roadTestRoute: string | null;
  roadTestWeather: string | null;
  roadTestRoadCondition: string | null;
  roadTestInitialSymptom: string | null;
  roadTestOutcome: RoadTestOutcome | string | null;
  roadTestOutcomeLabel: string | null;
  roadTestNotes: string | null;
  submittedByName: string | null;
  submittedAt: string | null;
  results: TestResult[];
  /** Derived, never stored. */
  passCount: number;
  failCount: number;
  /** §36 — how far the car actually went, when a road test was done. */
  roadTestDistance: number | null;
  editable: boolean;
  submittable: boolean;
}

/**
 * Post-repair testing — `07.txt` §34-§36.
 *
 * ── §35's SENTENCE IS THE SLICE ────────────────────────────────────────────
 *
 * "The repair shall not be marked technically complete where an unresolved critical
 * fault remains WITHOUT DOCUMENTED APPROVAL." The operative words are the last two, and
 * this service models the document rather than the prohibition: a session where critical
 * faults remain may be submitted, but only once somebody accountable has been named
 * against it with a reason — and that somebody may not be the technician.
 *
 * The easier reading — refuse outright — would be wrong. A car whose ABS light is still
 * on can legitimately go back to a customer who has been told and has agreed; a system
 * that forbids it teaches the workshop to record the fault as resolved, which is the one
 * outcome nobody wants.
 */
@Injectable()
export class TestingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async listForJobCard(ctx: TenantContext, jobCardId: string): Promise<TestSession[]> {
    this.assertMayRead(ctx);
    const cardId = requireUuid(jobCardId, 'jobCardId');
    return this.db.withTenant(ctx, async (client) => {
      // 404 for a card this viewer cannot see, BEFORE any session is read.
      await this.assertCardVisible(client, ctx, cardId);
      return this.readSessions(client, ctx, { jobCardId: cardId });
    });
  }

  async list(ctx: TenantContext): Promise<TestSession[]> {
    this.assertMayRead(ctx);
    return this.db.withTenant(ctx, (client) => this.readSessions(client, ctx, {}));
  }

  async findById(ctx: TenantContext, id: string): Promise<TestSession> {
    this.assertMayRead(ctx);
    const sessionId = requireUuid(id, 'id');
    return this.db.withTenant(ctx, async (client) => {
      const rows = await this.readSessions(client, ctx, { sessionId });
      return TestingService.one(rows);
    });
  }

  /** §34 — begin recording results, once the repair is complete. */
  async start(ctx: TenantContext, jobCardId: string): Promise<TestSession> {
    this.assertMayRecord(ctx);
    const cardId = requireUuid(jobCardId, 'jobCardId');

    return this.db.withTenant(ctx, async (client) => {
      const card = await this.assertCardVisible(client, ctx, cardId, { lock: true });

      const executionRow = await client.query(
        `SELECT id, attempt_no FROM repair.repair_executions
          WHERE job_card_id = $1 AND tenant_id = $2 AND organization_id = $3
            AND status = $4
          ORDER BY attempt_no DESC LIMIT 1`,
        [cardId, ctx.tenantId, ctx.organizationId, REQUIRED_EXECUTION_STATUS],
      );
      const execution = executionRow.rows[0] as { id: string; attempt_no: number } | undefined;
      if (!execution) {
        // The refusal names a route that exists: the repairs list is where a repair is
        // both recorded and completed.
        throw new ConflictException(
          'testing follows a COMPLETED repair, and this job card has none. Finish the ' +
            'repair on the Repairs in Progress screen first.',
        );
      }

      const open = await client.query(
        `SELECT id FROM repair.repair_test_sessions
          WHERE execution_id = $1 AND tenant_id = $2 AND status = 'in_progress'
          LIMIT 1`,
        [execution.id, ctx.tenantId],
      );
      if (open.rows.length > 0) {
        throw new ConflictException(
          'this repair already has a test session in progress; submit it before starting another',
        );
      }

      const next = await client.query(
        `SELECT COALESCE(max(attempt_no), 0) + 1 AS n
           FROM repair.repair_test_sessions WHERE execution_id = $1 AND tenant_id = $2`,
        [execution.id, ctx.tenantId],
      );
      const attemptNo = Number(next.rows[0].n);

      const inserted = await client.query(
        `INSERT INTO repair.repair_test_sessions
           (tenant_id, organization_id, job_card_id, execution_id, attempt_no,
            created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$6)
         RETURNING id`,
        [ctx.tenantId, ctx.organizationId, cardId, execution.id, attemptNo, ctx.userId],
      );
      const sessionId = inserted.rows[0].id as string;

      await this.audit.write(client, ctx, {
        action: 'repair_test.started',
        resourceType: 'repair_test',
        resourceId: sessionId,
        detail: {
          jobNumber: card.job_number,
          attemptNo,
          repairAttemptNo: execution.attempt_no,
        },
      });

      const rows = await this.readSessions(client, ctx, { sessionId });
      return TestingService.one(rows);
    });
  }

  /** §34 — record one test result. */
  async recordResult(
    ctx: TenantContext,
    sessionId: string,
    input: Record<string, unknown>,
  ): Promise<TestSession> {
    this.assertMayRecord(ctx);
    const id = requireUuid(sessionId, 'id');
    const testCategory: TestCategory = requireOneOf(
      input['testCategory'], TEST_CATEGORIES, 'testCategory',
    );
    const testName = requireText(input['testName'], 'testName', 300);
    const outcome: TestOutcome = requireOneOf(input['outcome'], TEST_OUTCOMES, 'outcome');
    const actualResult = optionalText(input['actualResult'], 'actualResult', 2000);
    const comments = optionalText(input['comments'], 'comments', 8000);

    // The migration's CHECK says the same thing; this is the clean 400 naming the field
    // rather than a constraint violation surfacing as a 500. A bare "fail" cannot be
    // acted on by the inspector who reads it next.
    if (outcome === 'fail' && actualResult === null && comments === null) {
      throw new BadRequestException(
        'a failed test must say what actually happened, or carry a comment; ' +
          'the quality-control inspector cannot act on "fail" alone',
      );
    }

    const evidenceId = input['evidenceId'] ? requireUuid(input['evidenceId'], 'evidenceId') : null;

    return this.db.withTenant(ctx, async (client) => {
      const session = await this.assertOpen(client, ctx, id);

      if (evidenceId !== null) {
        // §34's "supporting evidence" cites 019's evidence table. It must belong to the
        // SAME repair — a photograph of another car proves nothing about this one, and
        // the composite FK checks the tenant, which is not the same question.
        const owns = await client.query(
          `SELECT 1 FROM repair.execution_evidence
            WHERE id = $1 AND execution_id = $2 AND tenant_id = $3`,
          [evidenceId, session.execution_id, ctx.tenantId],
        );
        if (owns.rows.length === 0) {
          throw new NotFoundException('that evidence is not on the repair being tested');
        }
      }

      const next = await client.query(
        `SELECT COALESCE(max(position), 0) + 1 AS n
           FROM repair.repair_test_results WHERE session_id = $1 AND tenant_id = $2`,
        [id, ctx.tenantId],
      );

      await client.query(
        `INSERT INTO repair.repair_test_results
           (tenant_id, organization_id, session_id, position, test_category, test_name,
            test_procedure, test_equipment, equipment_identifier, calibration_status,
            expected_result, actual_result, unit_of_measurement, outcome, evidence_id,
            comments, tested_by, recorded_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17,$17)`,
        [
          ctx.tenantId, ctx.organizationId, id, Number(next.rows[0].n),
          testCategory, testName,
          optionalText(input['testProcedure'], 'testProcedure', 8000),
          optionalText(input['testEquipment'], 'testEquipment', 300),
          optionalText(input['equipmentIdentifier'], 'equipmentIdentifier', 200),
          optionalText(input['calibrationStatus'], 'calibrationStatus', 300),
          optionalText(input['expectedResult'], 'expectedResult', 2000),
          actualResult,
          optionalText(input['unitOfMeasurement'], 'unitOfMeasurement', 50),
          outcome, evidenceId, comments, ctx.userId,
        ],
      );

      await this.audit.write(client, ctx, {
        action: 'repair_test.result_recorded',
        resourceType: 'repair_test',
        resourceId: id,
        // The CATEGORY and the outcome — a fixed vocabulary, so no free text reaches
        // the trail.
        detail: { jobNumber: session.job_number, testCategory, outcome },
      });

      const rows = await this.readSessions(client, ctx, { sessionId: id });
      return TestingService.one(rows);
    });
  }

  /** Remove a result recorded in error, while the session is open. */
  async removeResult(
    ctx: TenantContext,
    sessionId: string,
    resultId: string,
  ): Promise<TestSession> {
    this.assertMayRecord(ctx);
    const id = requireUuid(sessionId, 'id');
    const targetId = requireUuid(resultId, 'resultId');

    return this.db.withTenant(ctx, async (client) => {
      const session = await this.assertOpen(client, ctx, id);
      const removed = await client.query(
        `DELETE FROM repair.repair_test_results
          WHERE id = $1 AND session_id = $2 AND tenant_id = $3`,
        [targetId, id, ctx.tenantId],
      );
      if (removed.rowCount === 0) {
        throw new NotFoundException('result not found on this test session');
      }
      await this.audit.write(client, ctx, {
        action: 'repair_test.result_removed',
        resourceType: 'repair_test',
        resourceId: id,
        // A row that is gone leaves no other trace.
        detail: { jobNumber: session.job_number, resultId: targetId },
      });
      const rows = await this.readSessions(client, ctx, { sessionId: id });
      return TestingService.one(rows);
    });
  }

  /** §35 — the post-repair diagnostic scan. */
  async recordScan(
    ctx: TenantContext,
    sessionId: string,
    input: Record<string, unknown>,
  ): Promise<TestSession> {
    this.assertMayRecord(ctx);
    const id = requireUuid(sessionId, 'id');

    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown): void => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    // Column names come from these literals and NEVER from the request.
    set('scan_performed', input['scanPerformed'] === true);
    for (const [key, column, max] of [
      ['preRepairFaultCodes', 'pre_repair_fault_codes', 2000],
      ['codesCleared', 'codes_cleared', 2000],
      ['codesRemaining', 'codes_remaining', 2000],
      ['newCodes', 'new_codes', 2000],
      ['liveDataChecks', 'live_data_checks', 8000],
      ['systemReadiness', 'system_readiness', 2000],
      ['warningLightStatus', 'warning_light_status', 2000],
    ] as Array<[string, string, number]>) {
      this.nullableText(set, column, input[key], key, max);
    }
    if (input['criticalFaultsRemain'] !== undefined) {
      set('critical_faults_remain', input['criticalFaultsRemain'] === true);
    }

    set('updated_by', ctx.userId);
    sets.push('updated_at = now()');
    values.push(id, ctx.tenantId);
    const sql = `UPDATE repair.repair_test_sessions SET ${sets.join(', ')}
                  WHERE id = $${values.length - 1} AND tenant_id = $${values.length}`;

    return this.db.withTenant(ctx, async (client) => {
      const session = await this.assertOpen(client, ctx, id);
      await client.query(sql, values);
      await this.audit.write(client, ctx, {
        action: 'repair_test.scan_recorded',
        resourceType: 'repair_test',
        resourceId: id,
        // Whether a critical fault remains is the one fact from this route that can
        // stop a car being released, so the trail records it.
        detail: {
          jobNumber: session.job_number,
          criticalFaultsRemain: input['criticalFaultsRemain'] === true,
        },
      });
      const rows = await this.readSessions(client, ctx, { sessionId: id });
      return TestingService.one(rows);
    });
  }

  /** §36 — the road test. */
  async recordRoadTest(
    ctx: TenantContext,
    sessionId: string,
    input: Record<string, unknown>,
  ): Promise<TestSession> {
    this.assertMayRecord(ctx);
    const id = requireUuid(sessionId, 'id');

    const performed = input['roadTestPerformed'] === true;
    const startMileage = optionalInt(input['roadTestStartMileage'], 'roadTestStartMileage', 0, 9999999);
    const endMileage = optionalInt(input['roadTestEndMileage'], 'roadTestEndMileage', 0, 9999999);
    const outcome =
      input['roadTestOutcome'] === undefined || input['roadTestOutcome'] === null || input['roadTestOutcome'] === ''
        ? null
        : requireOneOf(input['roadTestOutcome'], ROAD_TEST_OUTCOMES, 'roadTestOutcome');

    // A car cannot come back with fewer miles on it. The migration says the same; this
    // is the clean 400 rather than a constraint violation surfacing as a 500.
    if (startMileage !== null && endMileage !== null && endMileage < startMileage) {
      throw new BadRequestException(
        'the end mileage is lower than the start mileage; check the odometer readings',
      );
    }

    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown): void => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    set('road_test_performed', performed);
    set('road_test_start_mileage', startMileage);
    set('road_test_end_mileage', endMileage);
    set('road_test_outcome', outcome);
    for (const [key, column, max] of [
      ['roadTestDriver', 'road_test_driver', 300],
      ['roadTestRoute', 'road_test_route', 500],
      ['roadTestWeather', 'road_test_weather', 200],
      ['roadTestRoadCondition', 'road_test_road_condition', 200],
      ['roadTestInitialSymptom', 'road_test_initial_symptom', 2000],
      ['roadTestNotes', 'road_test_notes', 8000],
    ] as Array<[string, string, number]>) {
      this.nullableText(set, column, input[key], key, max);
    }

    set('updated_by', ctx.userId);
    sets.push('updated_at = now()');
    values.push(id, ctx.tenantId);
    const sql = `UPDATE repair.repair_test_sessions SET ${sets.join(', ')}
                  WHERE id = $${values.length - 1} AND tenant_id = $${values.length}`;

    return this.db.withTenant(ctx, async (client) => {
      const session = await this.assertOpen(client, ctx, id);
      await client.query(sql, values);
      await this.audit.write(client, ctx, {
        action: 'repair_test.road_test_recorded',
        resourceType: 'repair_test',
        resourceId: id,
        detail: { jobNumber: session.job_number, performed, outcome },
      });
      const rows = await this.readSessions(client, ctx, { sessionId: id });
      return TestingService.one(rows);
    });
  }

  /**
   * §35's DOCUMENTED APPROVAL — release a car with a critical fault still present.
   *
   * ⚠️ A SEPARATE OPERATION FROM RECORDING THE SCAN, and a narrower role set, because
   * that is what makes it an approval rather than a checkbox. The technician records
   * what they found; somebody accountable decides the car may go, and their name and
   * reason are written to the row the constraint checks.
   */
  async approveCriticalOverride(
    ctx: TenantContext,
    sessionId: string,
    input: { reason?: string },
  ): Promise<TestSession> {
    this.assertMayApproveOverride(ctx);
    const id = requireUuid(sessionId, 'id');
    const reason = requireText(input.reason, 'reason', 8000);

    return this.db.withTenant(ctx, async (client) => {
      const session = await this.assertOpen(client, ctx, id);

      const current = TestingService.one(await this.readSessions(client, ctx, { sessionId: id }));
      if (!current.criticalFaultsRemain) {
        // Refusing an approval nobody needs keeps the override list meaningful: a
        // safety audit reads it expecting every row to be a real decision.
        throw new ConflictException(
          'no critical fault is recorded as remaining on this session, so there is ' +
            'nothing to approve. Record the scan first if one does remain.',
        );
      }

      await client.query(
        `UPDATE repair.repair_test_sessions
            SET override_approved_by = $1, override_approved_at = now(),
                override_reason = $2, updated_by = $1, updated_at = now()
          WHERE id = $3 AND tenant_id = $4`,
        [ctx.userId, reason, id, ctx.tenantId],
      );

      await this.audit.write(client, ctx, {
        action: 'repair_test.critical_override_approved',
        resourceType: 'repair_test',
        resourceId: id,
        // ⚠️ THE ONE AUDIT ENTRY A SAFETY INVESTIGATION LOOKS FOR. Who decided a car
        // with a live fault could be released. The reason lives on the record itself.
        detail: { jobNumber: session.job_number },
      });

      const rows = await this.readSessions(client, ctx, { sessionId: id });
      return TestingService.one(rows);
    });
  }

  /**
   * Submit for quality control — slice 9 answers it.
   *
   * ── THE GATES ──────────────────────────────────────────────────────────────
   *
   * 1. AT LEAST ONE RESULT. A session submitted with nothing in it is an inspector
   *    asked to review silence — the same vacuous-truth hole slice 3a shipped and
   *    slices 3b, 4 and 5 have each guarded since.
   * 2. §35's DOCUMENTED APPROVAL. If a critical fault remains, somebody accountable
   *    must already have approved it by name. The CHECK constraint refuses it too, so
   *    this is the clean sentence rather than a 500.
   * 3. A ROAD TEST THAT WAS PERFORMED must be complete — driver, both mileages, and an
   *    outcome. Half a road test is not evidence the car was driven.
   */
  async submit(ctx: TenantContext, sessionId: string): Promise<TestSession> {
    this.assertMayRecord(ctx);
    const id = requireUuid(sessionId, 'id');

    return this.db.withTenant(ctx, async (client) => {
      const session = await this.assertOpen(client, ctx, id);
      const current = TestingService.one(await this.readSessions(client, ctx, { sessionId: id }));

      if (current.results.length === 0) {
        throw new BadRequestException(
          'a test session cannot be submitted with no results recorded; record at least ' +
            'one test — a test that FAILED is a result too',
        );
      }

      if (current.criticalFaultsRemain && current.overrideApprovedByName === null) {
        throw new BadRequestException(
          '§35: a repair with an unresolved critical fault cannot be submitted without ' +
            'documented approval. A supervisor, manager or the owner must approve the ' +
            'release and say why — you cannot approve your own.',
        );
      }

      if (current.roadTestPerformed) {
        const missing: string[] = [];
        if (current.roadTestDriver === null) missing.push('who drove it');
        if (current.roadTestStartMileage === null) missing.push('the start mileage');
        if (current.roadTestEndMileage === null) missing.push('the end mileage');
        if (current.roadTestOutcome === null) missing.push('what happened to the symptom');
        if (missing.length > 0) {
          throw new BadRequestException(
            `the road test is incomplete — record ${missing.join(', ')}. ` +
              'Half a road test is not evidence the car was driven.',
          );
        }
      }

      await client.query(
        `UPDATE repair.repair_test_sessions
            SET status = 'submitted', submitted_by = $1, submitted_at = now(),
                updated_by = $1, updated_at = now()
          WHERE id = $2 AND tenant_id = $3`,
        [ctx.userId, id, ctx.tenantId],
      );

      await this.audit.write(client, ctx, {
        action: 'repair_test.submitted',
        resourceType: 'repair_test',
        resourceId: id,
        detail: {
          jobNumber: session.job_number,
          attemptNo: session.attempt_no,
          tests: current.results.length,
          passed: current.passCount,
          failed: current.failCount,
          criticalFaultsRemain: current.criticalFaultsRemain,
          roadTestPerformed: current.roadTestPerformed,
        },
      });

      const rows = await this.readSessions(client, ctx, { sessionId: id });
      return TestingService.one(rows);
    });
  }

  // ── reads ────────────────────────────────────────────────────────────────

  private async readSessions(
    client: Client,
    ctx: TenantContext,
    filter: { jobCardId?: string; sessionId?: string },
  ): Promise<TestSession[]> {
    const headers = await client.query(
      `SELECT s.id, s.job_card_id, j.job_number, v.registration_number,
              s.execution_id, e.attempt_no AS execution_attempt_no,
              s.attempt_no, s.status,
              s.scan_performed, s.pre_repair_fault_codes, s.codes_cleared,
              s.codes_remaining, s.new_codes, s.live_data_checks,
              s.system_readiness, s.warning_light_status,
              s.critical_faults_remain, s.override_approved_at, s.override_reason,
              s.road_test_performed, s.road_test_driver, s.road_test_start_mileage,
              s.road_test_end_mileage, s.road_test_route, s.road_test_weather,
              s.road_test_road_condition, s.road_test_initial_symptom,
              s.road_test_outcome, s.road_test_notes,
              s.submitted_at,
              ob.display_name AS override_approved_by_name,
              sb.display_name AS submitted_by_name
         FROM repair.repair_test_sessions s
         JOIN repair.job_cards j ON j.id = s.job_card_id AND j.tenant_id = s.tenant_id
         JOIN core.vehicles v ON v.id = j.vehicle_id AND v.tenant_id = j.tenant_id
         JOIN repair.repair_executions e ON e.id = s.execution_id AND e.tenant_id = s.tenant_id
         LEFT JOIN identity.users ob ON ob.id = s.override_approved_by
         LEFT JOIN identity.users sb ON sb.id = s.submitted_by
        WHERE s.tenant_id = $1
          AND s.organization_id = $2
          AND ($3::uuid IS NULL OR s.job_card_id = $3::uuid)
          AND ($4::uuid IS NULL OR s.id = $4::uuid)
          -- The same narrowing the job card carries.
          AND ($5::uuid IS NULL OR j.assigned_technician_id = $5::uuid)
        ORDER BY s.attempt_no DESC`,
      [
        ctx.tenantId, ctx.organizationId,
        filter.jobCardId ?? null, filter.sessionId ?? null,
        ctx.activeRole === 'technician' ? ctx.userId : null,
      ],
    );

    const rows = headers.rows as HeaderRow[];
    if (rows.length === 0) return [];

    const results = await client.query(
      `SELECT r.id, r.session_id, r.position, r.test_category, r.test_name,
              r.test_procedure, r.test_equipment, r.equipment_identifier,
              r.calibration_status, r.expected_result, r.actual_result,
              r.unit_of_measurement, r.outcome, r.evidence_id, r.comments, r.tested_at,
              tb.display_name AS tested_by_name
         FROM repair.repair_test_results r
         LEFT JOIN identity.users tb ON tb.id = r.tested_by
        WHERE r.session_id = ANY($1::uuid[]) AND r.tenant_id = $2
        ORDER BY r.position`,
      [rows.map((r) => r.id), ctx.tenantId],
    );

    const bySession = new Map<string, TestResult[]>();
    for (const raw of results.rows as ResultRow[]) {
      const list = bySession.get(raw.session_id) ?? [];
      list.push({
        id: raw.id,
        position: raw.position,
        testCategory: raw.test_category,
        testCategoryLabel: testCategoryLabel(raw.test_category),
        testName: raw.test_name,
        testProcedure: raw.test_procedure,
        testEquipment: raw.test_equipment,
        equipmentIdentifier: raw.equipment_identifier,
        calibrationStatus: raw.calibration_status,
        expectedResult: raw.expected_result,
        actualResult: raw.actual_result,
        unitOfMeasurement: raw.unit_of_measurement,
        outcome: raw.outcome,
        evidenceId: raw.evidence_id,
        comments: raw.comments,
        testedByName: raw.tested_by_name,
        testedAt: raw.tested_at.toISOString(),
      });
      bySession.set(raw.session_id, list);
    }

    return rows.map((row) => {
      const list = bySession.get(row.id) ?? [];
      const open = row.status === 'in_progress';
      return {
        id: row.id,
        jobCardId: row.job_card_id,
        jobNumber: row.job_number,
        registrationNumber: row.registration_number,
        executionId: row.execution_id,
        executionAttemptNo: row.execution_attempt_no,
        attemptNo: row.attempt_no,
        status: row.status,
        scanPerformed: row.scan_performed,
        preRepairFaultCodes: row.pre_repair_fault_codes,
        codesCleared: row.codes_cleared,
        codesRemaining: row.codes_remaining,
        newCodes: row.new_codes,
        liveDataChecks: row.live_data_checks,
        systemReadiness: row.system_readiness,
        warningLightStatus: row.warning_light_status,
        criticalFaultsRemain: row.critical_faults_remain,
        overrideApprovedByName: row.override_approved_by_name,
        overrideApprovedAt: row.override_approved_at ? row.override_approved_at.toISOString() : null,
        overrideReason: row.override_reason,
        roadTestPerformed: row.road_test_performed,
        roadTestDriver: row.road_test_driver,
        roadTestStartMileage: row.road_test_start_mileage,
        roadTestEndMileage: row.road_test_end_mileage,
        roadTestRoute: row.road_test_route,
        roadTestWeather: row.road_test_weather,
        roadTestRoadCondition: row.road_test_road_condition,
        roadTestInitialSymptom: row.road_test_initial_symptom,
        roadTestOutcome: row.road_test_outcome,
        roadTestOutcomeLabel: row.road_test_outcome ? roadTestOutcomeLabel(row.road_test_outcome) : null,
        roadTestNotes: row.road_test_notes,
        submittedByName: row.submitted_by_name,
        submittedAt: row.submitted_at ? row.submitted_at.toISOString() : null,
        results: list,
        passCount: list.filter((r) => r.outcome === 'pass').length,
        failCount: list.filter((r) => r.outcome === 'fail').length,
        // Derived: what the odometer says the car actually did.
        roadTestDistance:
          row.road_test_start_mileage !== null && row.road_test_end_mileage !== null
            ? row.road_test_end_mileage - row.road_test_start_mileage
            : null,
        editable: open && CAN_RECORD_TESTS.has(ctx.activeRole),
        submittable: open && CAN_RECORD_TESTS.has(ctx.activeRole),
      };
    });
  }

  private async assertCardVisible(
    client: Client,
    ctx: TenantContext,
    cardId: string,
    opts: { lock?: boolean } = {},
  ): Promise<CardRow> {
    const found = await client.query(
      `SELECT j.id, j.job_number, j.stage
         FROM repair.job_cards j
         JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
        WHERE j.id = $1 AND j.tenant_id = $2 AND j.organization_id = $3
          AND ($4::uuid IS NULL OR j.assigned_technician_id = $4::uuid)
          AND ($5::uuid IS NULL OR c.user_id = $5::uuid)
        ${opts.lock ? 'FOR UPDATE OF j' : ''}`,
      [
        cardId, ctx.tenantId, ctx.organizationId,
        ctx.activeRole === 'technician' ? ctx.userId : null,
        ctx.activeRole === 'customer' ? ctx.userId : null,
      ],
    );
    const card = found.rows[0] as CardRow | undefined;
    // 404, not 403 — the non-oracle rule this codebase holds everywhere.
    if (!card) throw new NotFoundException('job card not found');
    return card;
  }

  private async assertOpen(
    client: Client,
    ctx: TenantContext,
    sessionId: string,
  ): Promise<{ job_number: string; attempt_no: number; execution_id: string }> {
    const found = await client.query(
      `SELECT s.id, s.status, s.attempt_no, s.execution_id, j.job_number
         FROM repair.repair_test_sessions s
         JOIN repair.job_cards j ON j.id = s.job_card_id AND j.tenant_id = s.tenant_id
        WHERE s.id = $1 AND s.tenant_id = $2 AND s.organization_id = $3
          AND ($4::uuid IS NULL OR j.assigned_technician_id = $4::uuid)
        FOR UPDATE OF s`,
      [
        sessionId, ctx.tenantId, ctx.organizationId,
        ctx.activeRole === 'technician' ? ctx.userId : null,
      ],
    );
    const row = found.rows[0] as
      | { id: string; status: TestSessionStatus; attempt_no: number; execution_id: string; job_number: string }
      | undefined;
    if (!row) throw new NotFoundException('test session not found');
    if (row.status !== 'in_progress') {
      throw new ConflictException(
        'this test session has been submitted for quality control and cannot be changed; ' +
          'record a new test session if the vehicle is retested',
      );
    }
    return { job_number: row.job_number, attempt_no: row.attempt_no, execution_id: row.execution_id };
  }

  /** Absent leaves it, null/'' clears it, a wrong type is a 400 — never a silent clear. */
  private nullableText(
    set: (column: string, value: unknown) => void,
    column: string,
    raw: unknown,
    field: string,
    max: number,
  ): void {
    if (raw === undefined) return;
    if (raw === null || raw === '') {
      set(column, null);
      return;
    }
    if (typeof raw !== 'string') {
      throw new BadRequestException(`${field} must be a string, or null to clear it`);
    }
    set(column, optionalText(raw, field, max));
  }

  private static one(rows: TestSession[]): TestSession {
    const first = rows[0];
    if (!first) throw new NotFoundException('test session not found');
    return first;
  }

  private assertMayRead(ctx: TenantContext): void {
    if (!CAN_READ_TESTS.has(ctx.activeRole)) {
      throw new ForbiddenException(`role '${ctx.activeRole}' may not read test results`);
    }
  }

  private assertMayRecord(ctx: TenantContext): void {
    if (!CAN_RECORD_TESTS.has(ctx.activeRole)) {
      throw new ForbiddenException(`role '${ctx.activeRole}' may not record test results`);
    }
  }

  private assertMayApproveOverride(ctx: TenantContext): void {
    if (!CAN_APPROVE_CRITICAL_OVERRIDE.has(ctx.activeRole)) {
      throw new ForbiddenException(
        `role '${ctx.activeRole}' may not approve releasing a vehicle with an unresolved critical fault`,
      );
    }
  }
}

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
}

interface HeaderRow {
  id: string;
  job_card_id: string;
  job_number: string;
  registration_number: string;
  execution_id: string;
  execution_attempt_no: number;
  attempt_no: number;
  status: TestSessionStatus;
  scan_performed: boolean;
  pre_repair_fault_codes: string | null;
  codes_cleared: string | null;
  codes_remaining: string | null;
  new_codes: string | null;
  live_data_checks: string | null;
  system_readiness: string | null;
  warning_light_status: string | null;
  critical_faults_remain: boolean;
  override_approved_at: Date | null;
  override_reason: string | null;
  road_test_performed: boolean;
  road_test_driver: string | null;
  road_test_start_mileage: number | null;
  road_test_end_mileage: number | null;
  road_test_route: string | null;
  road_test_weather: string | null;
  road_test_road_condition: string | null;
  road_test_initial_symptom: string | null;
  road_test_outcome: RoadTestOutcome | null;
  road_test_notes: string | null;
  submitted_at: Date | null;
  override_approved_by_name: string | null;
  submitted_by_name: string | null;
}

interface ResultRow {
  id: string;
  session_id: string;
  position: number;
  test_category: TestCategory;
  test_name: string;
  test_procedure: string | null;
  test_equipment: string | null;
  equipment_identifier: string | null;
  calibration_status: string | null;
  expected_result: string | null;
  actual_result: string | null;
  unit_of_measurement: string | null;
  outcome: TestOutcome;
  evidence_id: string | null;
  comments: string | null;
  tested_at: Date;
  tested_by_name: string | null;
}
