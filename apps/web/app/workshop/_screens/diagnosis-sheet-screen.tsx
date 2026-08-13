import { Suspense } from 'react';
import Link from 'next/link';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { DiagnosisFindingsForm } from './diagnosis-findings-form';
import { DiagnosisReviewForm } from './diagnosis-review-form';
import {
  DIAGNOSIS_STATUS_KIND,
  DIAGNOSIS_STATUS_LABEL,
  FINDING_SOURCE_LABEL,
  FINDING_STATUS_KIND,
  FINDING_STATUS_LABEL,
} from './diagnosis-labels';

/**
 * One diagnosis record — `07.txt` §3026-§3046, `02.txt` §1260-§1294.
 *
 * Reached at `<queue route>/<diagnosis id>` in all four role trees. A detail route
 * GATES ON ITS PARENT LIST ROUTE (T-0037): no navigation advertises one entry per
 * diagnosis, so `check-page-gates.sh` strips the trailing dynamic segment and
 * requires the page to gate on the queue route it hangs from.
 *
 * ── THIS SCREEN RENDERS THREE GENUINELY DIFFERENT THINGS ────────────────────
 *
 * Not one thing in three states of disablement:
 *
 *   1. OPEN, and this viewer may record — the findings form.
 *   2. SUBMITTED, and this viewer may review it — the record, plus §1292's
 *      approve/reject. Offered only to somebody who did not submit it.
 *   3. SETTLED, or open to a viewer who may only read — the record of what was
 *      claimed and what the reviewer said.
 *
 * A disabled form says "you cannot do this right now", where the truth in case 3 is
 * "this diagnosis is finished and a further opinion is a new attempt".
 *
 * ── THE REJECTION REASON IS THE MOST IMPORTANT TEXT ON THE PAGE ─────────────
 *
 * It is the only thing a technician can act on after a rejection, so it is rendered
 * prominently and above the findings rather than at the foot of the record. §1292's
 * review is pointless if the reason is somewhere the person who has to fix it does
 * not look.
 */

interface DiagnosticFinding {
  id: string;
  position: number;
  faultCode: string | null;
  faultDescription: string;
  affectedSystem: string;
  affectedSystemLabel: string;
  observedSymptom: string | null;
  testPerformed: string | null;
  expectedResult: string | null;
  actualResult: string | null;
  interpretation: string | null;
  findingStatus: string;
  source: string;
  confirmedByName: string | null;
  confirmedAt: string | null;
  additionalInspectionRequired: boolean;
  recordedByName: string | null;
  recordedAt: string;
}

interface Diagnosis {
  id: string;
  jobCardId: string;
  jobNumber: string;
  registrationNumber: string;
  attemptNo: number;
  status: 'in_progress' | 'submitted' | 'approved' | 'rejected';
  summary: string | null;
  startedByName: string | null;
  startedAt: string;
  submittedByName: string | null;
  submittedAt: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  findings: DiagnosticFinding[];
  confirmedCount: number;
  suspectedCount: number;
  excludedCount: number;
  additionalInspectionCount: number;
  editable: boolean;
  reviewable: boolean;
}

export async function DiagnosisSheetScreen({
  route,
  diagnosisId,
}: {
  route: string;
  diagnosisId: string;
}) {
  return (
    <Suspense fallback={<LoadingState label="Loading the diagnosis…" />}>
      <Sheet route={route} diagnosisId={diagnosisId} />
    </Suspense>
  );
}

async function Sheet({ route, diagnosisId }: { route: string; diagnosisId: string }) {
  const result = await apiGet<Diagnosis>('workshop', `/diagnoses/${diagnosisId}`);

  if (!result.ok) {
    return <ApiFailure reason={result.reason} workspaceId="workshop" />;
  }

  const diagnosis = result.data;
  const settled = diagnosis.status === 'approved' || diagnosis.status === 'rejected';

  return (
    <>
      <PageHeader
        title={`Diagnosis — ${diagnosis.jobNumber}`}
        description={describe(diagnosis)}
      />

      <p style={{ margin: `0 0 ${primitive.space[3]} 0` }}>
        <Link href={route} style={{ color: primitive.color.blue[600] }}>
          Back to the diagnosis queue
        </Link>
      </p>

      {/* THE REJECTION REASON, FIRST. See the header note — this is the only thing a
          technician can act on, so it is not buried at the foot of the record. */}
      {diagnosis.status === 'rejected' && diagnosis.reviewNote ? (
        <div
          role="alert"
          style={{
            margin: `0 0 ${primitive.space[4]} 0`,
            padding: primitive.space[3],
            border: `1px solid ${primitive.color.red[700]}`,
            borderRadius: primitive.radius.md,
            background: themeVar.surfaceRaised,
          }}
        >
          <h2
            style={{
              margin: `0 0 ${primitive.space[1]} 0`,
              fontSize: primitive.fontSize.base,
              color: primitive.color.red[700],
            }}
          >
            Rejected by {diagnosis.reviewedByName ?? 'a supervisor'}
          </h2>
          <p style={{ margin: 0, color: themeVar.textPrimary }}>{diagnosis.reviewNote}</p>
          <p
            style={{
              margin: `${primitive.space[2]} 0 0 0`,
              color: themeVar.textSecondary,
              fontSize: primitive.fontSize.sm,
            }}
          >
            {/* Names the way forward. A refusal whose alternative is unreachable is a
                wall, and the queue offers exactly this action. */}
            This record cannot be changed. Record a further opinion as a new diagnosis from
            the queue, once the card is back at the diagnosis stage.
          </p>
        </div>
      ) : null}

      {/* An approval is worth stating too — quietly. Without it an approved record is
          visually identical to one nobody has looked at. */}
      {diagnosis.status === 'approved' ? (
        <p
          role="status"
          style={{
            margin: `0 0 ${primitive.space[4]} 0`,
            color: themeVar.textPrimary,
            fontSize: primitive.fontSize.sm,
          }}
        >
          Approved by {diagnosis.reviewedByName ?? 'a supervisor'}
          {diagnosis.reviewNote ? ` — ${diagnosis.reviewNote}` : ''}. The repair plan and
          quotation are built from the confirmed faults below.
        </p>
      ) : null}

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
          gap: primitive.space[3],
          margin: `0 0 ${primitive.space[4]} 0`,
        }}
      >
        <Fact label="Vehicle" value={diagnosis.registrationNumber} mono />
        <Fact label="Attempt" value={String(diagnosis.attemptNo)} />
        <Fact
          label="Status"
          value={
            <StatusBadge
              kind={DIAGNOSIS_STATUS_KIND[diagnosis.status] ?? 'draft'}
              label={DIAGNOSIS_STATUS_LABEL[diagnosis.status] ?? diagnosis.status}
            />
          }
        />
        <Fact label="Started by" value={diagnosis.startedByName ?? 'Unknown'} />
        {diagnosis.submittedByName ? (
          <Fact label="Submitted by" value={diagnosis.submittedByName} />
        ) : null}
        {diagnosis.reviewedByName ? (
          <Fact label="Reviewed by" value={diagnosis.reviewedByName} />
        ) : null}
        <Fact
          label="Confirmed faults"
          value={
            // Never a bare "0": mid-diagnosis that means "not yet established", and
            // after submission it means the technician confirmed nothing — two very
            // different statements that a zero would collapse into one.
            diagnosis.findings.length === 0
              ? 'None recorded'
              : `${diagnosis.confirmedCount} of ${diagnosis.findings.length}`
          }
        />
        {diagnosis.additionalInspectionCount > 0 ? (
          <Fact
            label="Need further inspection"
            value={String(diagnosis.additionalInspectionCount)}
          />
        ) : null}
      </dl>

      {diagnosis.editable ? (
        <DiagnosisFindingsForm
          diagnosisId={diagnosis.id}
          jobNumber={diagnosis.jobNumber}
          findings={diagnosis.findings}
          summary={diagnosis.summary}
        />
      ) : (
        <ReadOnlyRecord diagnosis={diagnosis} settled={settled} />
      )}

      {/* §1292's review, offered only to somebody who may give it AND did not submit
          it. `reviewable` already mirrors both rules, and the service re-checks them
          on the write — a button that the API then refuses is worse than no button. */}
      {diagnosis.reviewable ? (
        <DiagnosisReviewForm
          diagnosisId={diagnosis.id}
          jobNumber={diagnosis.jobNumber}
          submittedByName={diagnosis.submittedByName}
          confirmedCount={diagnosis.confirmedCount}
        />
      ) : null}

      {/* Why there is no review control, when the record is waiting for one. Silence
          here reads as a broken page to the person who submitted it. */}
      {diagnosis.status === 'submitted' && !diagnosis.reviewable ? (
        <p
          style={{
            marginTop: primitive.space[4],
            color: themeVar.textSecondary,
            fontSize: primitive.fontSize.sm,
          }}
        >
          Awaiting supervisor review. Whoever submitted a diagnosis cannot also review it
          (§563), so this one needs another supervisor, manager or owner.
        </p>
      ) : null}
    </>
  );
}

/** The one-line explanation under the title, matched to the record's real state. */
function describe(diagnosis: Diagnosis): string {
  switch (diagnosis.status) {
    case 'in_progress':
      return diagnosis.editable
        ? 'Record each fault you find, with the test that established it. A fault ruled out is a finding too — record it as excluded. Submitting sends the diagnosis for supervisor review and it cannot be changed afterwards.'
        : 'This diagnosis is still being recorded. Your role can read it but not add findings.';
    case 'submitted':
      return 'Submitted for supervisor review. The findings are frozen so the evidence cannot move underneath the reviewer.';
    case 'approved':
      return 'Approved. This is the diagnosis of record for this attempt; a further opinion is recorded as a new attempt.';
    default:
      return 'Rejected. This is the record of what was claimed and why it was refused — it is kept rather than reopened, so the disagreement is not erased.';
  }
}

function ReadOnlyRecord({
  diagnosis,
  settled,
}: {
  diagnosis: Diagnosis;
  settled: boolean;
}) {
  return (
    <>
      {!settled && diagnosis.status === 'in_progress' ? (
        // An open record a viewer may not write to — a storekeeper or cashier reading
        // what the diagnosis found. Said out loud, because otherwise the absence of a
        // form looks like a broken page.
        <p
          style={{
            margin: `0 0 ${primitive.space[3]} 0`,
            color: themeVar.textSecondary,
            fontSize: primitive.fontSize.sm,
          }}
        >
          This diagnosis is still in progress. Your role can read it but not record findings.
        </p>
      ) : null}

      {diagnosis.findings.length === 0 ? (
        <p style={{ color: themeVar.textSecondary }}>
          {/* Never blank. An empty findings list on a submitted record is a real and
              alarming state — it should read as one, not as a loading glitch. */}
          No findings were recorded on this diagnosis.
        </p>
      ) : (
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: primitive.space[3] }}>
          {diagnosis.findings.map((finding) => (
            <li key={finding.id}>
              <FindingCard finding={finding} />
            </li>
          ))}
        </ol>
      )}

      <h2
        style={{
          fontSize: primitive.fontSize.base,
          color: themeVar.textPrimary,
          margin: `${primitive.space[4]} 0 ${primitive.space[2]} 0`,
        }}
      >
        Technician notes
      </h2>
      <p
        style={{
          margin: 0,
          color: diagnosis.summary ? themeVar.textPrimary : themeVar.textSecondary,
        }}
      >
        {diagnosis.summary ?? 'No notes were recorded.'}
      </p>
    </>
  );
}

/**
 * One finding, as a labelled block rather than a table row.
 *
 * §3036-§3040's test / expected / actual is a piece of REASONING — three sentences
 * that only mean something together — and a ten-column table would either truncate
 * them or force horizontal scrolling through the evidence a supervisor is meant to
 * weigh. The queue is the place for a scannable table; this is the place for a
 * readable record.
 */
export function FindingCard({ finding }: { finding: DiagnosticFinding }) {
  return (
    <div
      style={{
        padding: primitive.space[3],
        border: `1px solid ${themeVar.borderDefault}`,
        borderRadius: primitive.radius.md,
        background: themeVar.surfaceRaised,
        // A positioned containing block for anything absolutely positioned that ends
        // up inside — the escape defect measured twice already.
        position: 'relative',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: primitive.space[2],
          alignItems: 'baseline',
          marginBottom: primitive.space[2],
        }}
      >
        <StatusBadge
          kind={FINDING_STATUS_KIND[finding.findingStatus] ?? 'draft'}
          // Falls back to the raw value rather than rendering an empty badge: a
          // standing the label map does not know is still a recorded answer, and an
          // unlabelled badge would read as "not assessed".
          label={FINDING_STATUS_LABEL[finding.findingStatus] ?? finding.findingStatus}
        />
        <strong style={{ color: themeVar.textPrimary }}>{finding.faultDescription}</strong>
        {finding.faultCode ? (
          <code
            style={{
              fontFamily: primitive.fontFamily.mono,
              color: themeVar.textSecondary,
              fontSize: primitive.fontSize.sm,
            }}
          >
            {finding.faultCode}
          </code>
        ) : null}
        {/* §1294 — only an AI suggestion is labelled. Marking every technician
            finding "Technician" is noise that trains readers to ignore the field,
            which is the opposite of preserving the distinction. */}
        {FINDING_SOURCE_LABEL[finding.source] ? (
          <StatusBadge kind="attention" label={FINDING_SOURCE_LABEL[finding.source] as string} />
        ) : null}
        {finding.additionalInspectionRequired ? (
          <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
            · needs further inspection
          </span>
        ) : null}
      </div>

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))',
          gap: primitive.space[2],
          margin: 0,
        }}
      >
        <Fact label="Affected system" value={finding.affectedSystemLabel} />
        {finding.observedSymptom ? (
          <Fact label="Observed symptom" value={finding.observedSymptom} />
        ) : null}
        {finding.testPerformed ? <Fact label="Test performed" value={finding.testPerformed} /> : null}
        {finding.expectedResult ? <Fact label="Expected" value={finding.expectedResult} /> : null}
        {finding.actualResult ? <Fact label="Actual" value={finding.actualResult} /> : null}
        {finding.interpretation ? (
          <Fact label="Interpretation" value={finding.interpretation} />
        ) : null}
        {/* §1294 made visible: a confirmed fault can always answer "who says so". */}
        {finding.confirmedByName ? (
          <Fact label="Confirmed by" value={finding.confirmedByName} />
        ) : null}
        <Fact label="Recorded by" value={finding.recordedByName ?? 'Unknown'} />
      </dl>
    </div>
  );
}

function Fact({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>{label}</dt>
      <dd
        style={{
          margin: 0,
          color: themeVar.textPrimary,
          fontFamily: mono ? primitive.fontFamily.mono : 'inherit',
        }}
      >
        {value}
      </dd>
    </div>
  );
}
