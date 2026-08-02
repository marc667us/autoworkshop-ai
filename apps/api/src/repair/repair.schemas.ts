import { z } from 'zod';
import {
  clearableText,
  money,
  optionalText,
  requiredText,
  uuid,
  wholeNumber,
} from '../common/validation/validated-body';

/**
 * Request schemas for the repair controller — the largest write surface in the
 * API (fifty-odd endpoints across the job-card lifecycle).
 *
 * ── 🔴 WHAT THESE ENFORCE, AND WHAT THEY DELIBERATELY DO NOT ───────────────
 *
 * They enforce SHAPE, TYPE, BOUNDS and UNKNOWN KEYS. Before them, every body
 * here was a bare TypeScript annotation — erased at runtime — so `mileageReading`
 * accepted the string "banana", `quantity` accepted `Infinity`, and a note could
 * be a megabyte long.
 *
 * They do NOT enumerate the VALUE DOMAINS: `toStage`, `decision`, `outcome`,
 * `findingStatus`, `resourceKind` and friends are validated as bounded strings
 * here and checked against the real rules by the services, which own them. That
 * is a deliberate division, not laziness:
 *
 *   * The stage machine is stateful. `changeStage` is legal or not depending on
 *     the card's CURRENT stage, the actor's role and whether an override reason
 *     was given — `JobCardService.changeStage` resolves all of that. A flat
 *     enum here could only restate the alphabet of stages, never the rule, and
 *     would need editing every time the machine grew a state.
 *   * A list copied to a second place drifts. Where a vocabulary IS mirrored in
 *     this codebase it is drift-tested against its source (see
 *     `organization.schemas.spec.ts`, which reads the migration). Mirroring
 *     nine more vocabularies without that guard would create nine silent
 *     divergences.
 *
 * So: the boundary refuses what is structurally impossible, and the services
 * keep refusing what is contextually wrong. Both layers, per CLAUDE.md §7's
 * reasoning about app-layer and database checks.
 */

/** `YYYY-MM-DD`, optionally with a time part — the shape these services parse. */
const dateish = () =>
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}([T ].*)?$/, 'must be an ISO date (YYYY-MM-DD)');

/**
 * A decision plus a note — the shape of every submit/review endpoint across
 * diagnoses, repair plans, quotations and proposals. Written once so the four
 * cannot drift apart.
 */
export const DecisionBody = z.object({
  decision: optionalText(40),
  note: optionalText(4000),
});
export type DecisionBody = z.infer<typeof DecisionBody>;

// ── job cards ──────────────────────────────────────────────────────────────

export const CreateJobCardBody = z.object({
  vehicleId: uuid(),
  complaint: requiredText(4000),
  priority: optionalText(40),
  expectedCompletionOn: dateish().optional(),
  // A vehicle's odometer, not an arbitrary integer: the cap keeps a typo from
  // becoming a permanent record on the card.
  mileageAtIntake: wholeNumber(10_000_000).optional(),
  assignedTechnicianId: uuid().optional(),
});
export type CreateJobCardBody = z.infer<typeof CreateJobCardBody>;

export const ChangeStageBody = z.object({
  toStage: requiredText(60),
  note: optionalText(4000),
  overrideReason: optionalText(4000),
});
export type ChangeStageBody = z.infer<typeof ChangeStageBody>;

// ── inspections ────────────────────────────────────────────────────────────

export const StartInspectionBody = z.object({
  mileageReading: wholeNumber(10_000_000).optional(),
});
export type StartInspectionBody = z.infer<typeof StartInspectionBody>;

export const RecordInspectionItemsBody = z.object({
  items: z
    .array(
      z.object({
        checkpointCode: requiredText(120),
        result: requiredText(60),
        note: optionalText(2000),
      }),
    )
    // An unbounded array is the same unbounded-input problem as an unbounded
    // string, one level up: nothing stopped a caller posting a million items.
    .max(500, 'must be 500 items or fewer')
    .optional(),
  mileageReading: wholeNumber(10_000_000).optional(),
  summary: optionalText(4000),
});
export type RecordInspectionItemsBody = z.infer<typeof RecordInspectionItemsBody>;

// ── diagnoses ──────────────────────────────────────────────────────────────

export const StartDiagnosisBody = z.object({ summary: optionalText(4000) });
export type StartDiagnosisBody = z.infer<typeof StartDiagnosisBody>;

/** ⚠️ `null` CLEARS, `undefined` LEAVES ALONE — the services rely on the difference. */
export const RecordDiagnosisSummaryBody = z.object({ summary: clearableText(4000) });
export type RecordDiagnosisSummaryBody = z.infer<typeof RecordDiagnosisSummaryBody>;

export const AddFindingBody = z.object({
  faultCode: optionalText(60),
  faultDescription: optionalText(4000),
  affectedSystem: optionalText(200),
  observedSymptom: optionalText(4000),
  testPerformed: optionalText(4000),
  expectedResult: optionalText(4000),
  actualResult: optionalText(4000),
  interpretation: optionalText(4000),
  findingStatus: optionalText(40),
  additionalInspectionRequired: z.boolean().optional(),
});
export type AddFindingBody = z.infer<typeof AddFindingBody>;

export const UpdateFindingBody = z.object({
  faultCode: clearableText(60),
  faultDescription: optionalText(4000),
  affectedSystem: optionalText(200),
  observedSymptom: clearableText(4000),
  testPerformed: clearableText(4000),
  expectedResult: clearableText(4000),
  actualResult: clearableText(4000),
  interpretation: clearableText(4000),
  findingStatus: optionalText(40),
  additionalInspectionRequired: z.boolean().optional(),
});
export type UpdateFindingBody = z.infer<typeof UpdateFindingBody>;

// ── repair plans ───────────────────────────────────────────────────────────

export const StartRepairPlanBody = z.object({
  repairProcedure: optionalText(8000),
  safetyPrecautions: optionalText(8000),
  postRepairTests: optionalText(8000),
  notes: optionalText(8000),
});
export type StartRepairPlanBody = z.infer<typeof StartRepairPlanBody>;

export const RecordRepairPlanDetailsBody = z.object({
  repairProcedure: clearableText(8000),
  safetyPrecautions: clearableText(8000),
  postRepairTests: clearableText(8000),
  notes: clearableText(8000),
});
export type RecordRepairPlanDetailsBody = z.infer<typeof RecordRepairPlanDetailsBody>;

export const AddRepairTaskBody = z.object({
  findingId: uuid().nullable().optional(),
  title: optionalText(300),
  description: optionalText(4000),
  requiredSkill: optionalText(200),
  serviceBay: optionalText(120),
  assignedTechnicianId: uuid().optional(),
  estimatedLabourHours: money(10_000).optional(),
});
export type AddRepairTaskBody = z.infer<typeof AddRepairTaskBody>;

export const UpdateRepairTaskBody = z.object({
  findingId: uuid().nullable().optional(),
  title: optionalText(300),
  description: clearableText(4000),
  requiredSkill: clearableText(200),
  serviceBay: clearableText(120),
  assignedTechnicianId: uuid().nullable().optional(),
  estimatedLabourHours: money(10_000).nullable().optional(),
});
export type UpdateRepairTaskBody = z.infer<typeof UpdateRepairTaskBody>;

export const MoveTaskBody = z.object({ direction: optionalText(20) });
export type MoveTaskBody = z.infer<typeof MoveTaskBody>;

export const AddResourceBody = z.object({
  taskId: uuid().optional(),
  resourceKind: optionalText(40),
  name: optionalText(300),
  reference: optionalText(200),
  quantity: money(1_000_000).optional(),
  unit: optionalText(40),
  note: optionalText(2000),
});
export type AddResourceBody = z.infer<typeof AddResourceBody>;

export const UpdateResourceBody = z.object({
  taskId: uuid().nullable().optional(),
  resourceKind: optionalText(40),
  name: optionalText(300),
  reference: clearableText(200),
  quantity: money(1_000_000).optional(),
  unit: clearableText(40),
  note: clearableText(2000),
});
export type UpdateResourceBody = z.infer<typeof UpdateResourceBody>;

// ── quotations ─────────────────────────────────────────────────────────────

export const RecordQuotationDetailsBody = z.object({
  discountAmount: money().optional(),
  discountReason: clearableText(2000),
  validUntil: dateish().nullable().optional(),
  warrantyTerms: clearableText(4000),
  completionConditions: clearableText(4000),
  recommendedRepair: clearableText(4000),
  alternativeOptions: clearableText(4000),
});
export type RecordQuotationDetailsBody = z.infer<typeof RecordQuotationDetailsBody>;

export const AddQuotationLineBody = z.object({
  lineKind: optionalText(40),
  description: optionalText(2000),
  quantity: money(1_000_000).optional(),
  unit: optionalText(40),
  unitPrice: money().optional(),
  isOptional: z.boolean().optional(),
});
export type AddQuotationLineBody = z.infer<typeof AddQuotationLineBody>;

export const UpdateQuotationLineBody = z.object({
  lineKind: optionalText(40),
  description: optionalText(2000),
  quantity: money(1_000_000).optional(),
  unit: clearableText(40),
  unitPrice: money().optional(),
  isOptional: z.boolean().optional(),
});
export type UpdateQuotationLineBody = z.infer<typeof UpdateQuotationLineBody>;

// ── proposals ──────────────────────────────────────────────────────────────

export const RecordProposalNarrativeBody = z.object({
  expectedResult: clearableText(8000),
  riskAndLimitations: clearableText(8000),
  uncertainties: clearableText(8000),
  presentationNote: clearableText(8000),
});
export type RecordProposalNarrativeBody = z.infer<typeof RecordProposalNarrativeBody>;

/**
 * The customer's decision on a proposal.
 * ⚠️ `decidedByName` and `decisionChannel` are the CONSENT RECORD — slice 7b
 * made them mandatory for chargeable work at the database level. Length limits
 * here, presence rules there.
 */
export const ProposalDecisionBody = z.object({
  decision: optionalText(40),
  approvedOption: optionalText(200),
  decidedByName: optionalText(200),
  decisionChannel: optionalText(60),
  note: optionalText(4000),
});
export type ProposalDecisionBody = z.infer<typeof ProposalDecisionBody>;

// ── executions ─────────────────────────────────────────────────────────────

export const StartExecutionBody = z.object({
  serviceBay: optionalText(120),
  readinessNote: optionalText(4000),
});
export type StartExecutionBody = z.infer<typeof StartExecutionBody>;

export const RecordReadinessBody = z.object({
  customerApprovalConfirmed: z.boolean().optional(),
  partsAvailableConfirmed: z.boolean().optional(),
  toolsAvailableConfirmed: z.boolean().optional(),
  bayAvailableConfirmed: z.boolean().optional(),
  safetyConfirmed: z.boolean().optional(),
  serviceBay: clearableText(120),
  readinessNote: clearableText(4000),
});
export type RecordReadinessBody = z.infer<typeof RecordReadinessBody>;

/**
 * ⚠️ THESE BOOLEANS ARE `z.boolean()`, NEVER A COERCION. `Boolean('false')` is
 * `true` — the trap recorded against slice 9's quality-control gate, where a
 * coercing parse would have turned "the complaint was NOT addressed" into a
 * pass. A caller sending the string "false" is refused here rather than
 * silently reinterpreted.
 */
export const SetTaskStatusBody = z.object({
  status: optionalText(40),
  statusNote: optionalText(2000),
});
export type SetTaskStatusBody = z.infer<typeof SetTaskStatusBody>;

export const StartTimeEntryBody = z.object({
  entryKind: optionalText(40),
  executionTaskId: uuid().optional(),
  serviceBay: optionalText(120),
  note: optionalText(2000),
});
export type StartTimeEntryBody = z.infer<typeof StartTimeEntryBody>;

export const RecordPartUsedBody = z.object({
  description: optionalText(2000),
  partNumber: optionalText(120),
  quantity: money(1_000_000).optional(),
  unit: optionalText(40),
  note: optionalText(2000),
  executionTaskId: uuid().optional(),
  repairPlanResourceId: uuid().optional(),
});
export type RecordPartUsedBody = z.infer<typeof RecordPartUsedBody>;

export const RecordEvidenceBody = z.object({
  evidenceKind: optionalText(40),
  description: optionalText(2000),
  recordedValue: optionalText(2000),
  externalReference: optionalText(500),
  executionTaskId: uuid().optional(),
});
export type RecordEvidenceBody = z.infer<typeof RecordEvidenceBody>;

export const CompleteExecutionBody = z.object({
  completionNote: optionalText(4000),
  unexpectedFindings: optionalText(4000),
});
export type CompleteExecutionBody = z.infer<typeof CompleteExecutionBody>;

// ── testing ────────────────────────────────────────────────────────────────

export const RecordTestResultBody = z.object({
  testCategory: optionalText(60),
  testName: optionalText(300),
  testProcedure: optionalText(4000),
  testEquipment: optionalText(300),
  equipmentIdentifier: optionalText(200),
  calibrationStatus: optionalText(60),
  expectedResult: optionalText(4000),
  actualResult: optionalText(4000),
  unitOfMeasurement: optionalText(40),
  outcome: optionalText(40),
  evidenceId: uuid().optional(),
  comments: optionalText(4000),
});
export type RecordTestResultBody = z.infer<typeof RecordTestResultBody>;

export const RecordScanBody = z.object({
  scanPerformed: z.boolean().optional(),
  preRepairFaultCodes: clearableText(4000),
  codesCleared: clearableText(4000),
  codesRemaining: clearableText(4000),
  newCodes: clearableText(4000),
  liveDataChecks: clearableText(4000),
  systemReadiness: clearableText(2000),
  warningLightStatus: clearableText(2000),
  criticalFaultsRemain: z.boolean().optional(),
});
export type RecordScanBody = z.infer<typeof RecordScanBody>;

export const RecordRoadTestBody = z.object({
  roadTestPerformed: z.boolean().optional(),
  roadTestDriver: clearableText(200),
  roadTestStartMileage: wholeNumber(10_000_000).optional(),
  roadTestEndMileage: wholeNumber(10_000_000).optional(),
  roadTestRoute: clearableText(2000),
  roadTestWeather: clearableText(200),
  roadTestRoadCondition: clearableText(200),
  roadTestInitialSymptom: clearableText(2000),
  roadTestOutcome: clearableText(2000),
  roadTestNotes: clearableText(4000),
});
export type RecordRoadTestBody = z.infer<typeof RecordRoadTestBody>;

export const ApproveCriticalOverrideBody = z.object({ reason: optionalText(4000) });
export type ApproveCriticalOverrideBody = z.infer<typeof ApproveCriticalOverrideBody>;

// ── quality control ────────────────────────────────────────────────────────

export const OpenQualityInspectionBody = z.object({ testSessionId: uuid().optional() });
export type OpenQualityInspectionBody = z.infer<typeof OpenQualityInspectionBody>;

// ── variations ─────────────────────────────────────────────────────────────

export const ReviewVariationBody = z.object({ send: z.boolean().optional() });
export type ReviewVariationBody = z.infer<typeof ReviewVariationBody>;
