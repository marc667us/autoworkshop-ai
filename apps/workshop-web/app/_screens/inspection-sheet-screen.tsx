import { Suspense } from 'react';
import Link from 'next/link';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { InspectionSheetForm } from './inspection-sheet-form';
import { RESULT_KIND, RESULT_LABEL } from './inspection-labels';

/**
 * One inspection sheet — `07.txt` §2926-§2978.
 *
 * Reached at `<queue route>/<inspection id>` in all four role trees. A detail
 * route GATES ON ITS PARENT LIST ROUTE (T-0037): no navigation advertises one
 * entry per inspection, so `check-page-gates.sh` strips the trailing dynamic
 * segment and requires the page to gate on the queue route it hangs from.
 *
 * ── READ-ONLY IS A FIRST-CLASS STATE HERE, NOT A DEGRADED ONE ───────────────
 *
 * A submitted sheet is immutable — in the service, and in the database by
 * trigger. So this screen renders two genuinely different things: an editable
 * checklist, or the finding of record. It does NOT render the form disabled: a
 * disabled form says "you cannot do this right now", where the truth is "this
 * inspection is finished and a second look is a new attempt".
 */

interface InspectionItem {
  id: string;
  checkpointCode: string;
  label: string;
  position: number;
  result: 'pass' | 'fail' | 'requires_testing' | 'not_applicable' | null;
  note: string | null;
  recordedAt: string | null;
}

interface Inspection {
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
  answeredCount: number;
  findingCount: number;
  editable: boolean;
}

export async function InspectionSheetScreen({
  route,
  inspectionId,
}: {
  route: string;
  inspectionId: string;
}) {
  return (
    <Suspense fallback={<LoadingState label="Loading the inspection sheet…" />}>
      <Sheet route={route} inspectionId={inspectionId} />
    </Suspense>
  );
}

async function Sheet({ route, inspectionId }: { route: string; inspectionId: string }) {
  const result = await apiGet<Inspection>('workshop', `/inspections/${inspectionId}`);

  if (!result.ok) {
    return <ApiFailure reason={result.reason} workspaceId="workshop" />;
  }

  const sheet = result.data;
  const submitted = sheet.status === 'submitted';

  return (
    <>
      <PageHeader
        title={`Inspection — ${sheet.jobNumber}`}
        description={
          submitted
            ? 'Submitted. This sheet is the finding of record and cannot be changed; a second look is recorded as a new attempt.'
            : 'Record a result for every checkpoint. Anything that does not apply must be marked “not applicable” — the sheet cannot be submitted with a checkpoint left unanswered.'
        }
      />

      <p style={{ margin: `0 0 ${primitive.space[3]} 0` }}>
        <Link href={route} style={{ color: primitive.color.blue[600] }}>
          Back to the inspection queue
        </Link>
      </p>

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
          gap: primitive.space[3],
          margin: `0 0 ${primitive.space[4]} 0`,
        }}
      >
        <Fact label="Vehicle" value={sheet.registrationNumber} mono />
        <Fact label="Attempt" value={String(sheet.attemptNo)} />
        <Fact
          label="Status"
          value={
            <StatusBadge
              kind={submitted ? 'active' : 'draft'}
              label={submitted ? 'Submitted' : 'In progress'}
            />
          }
        />
        <Fact
          label="Mileage recorded"
          value={
            sheet.mileageReading === null
              ? // Stated, not left blank: a missing odometer reading is a gap
                // someone must close, and an empty cell reads as a zero.
                'Not recorded'
              : `${sheet.mileageReading.toLocaleString('en-GB')} km`
          }
        />
        <Fact label="Started by" value={sheet.startedByName ?? 'Unknown'} />
        {submitted ? (
          <Fact label="Submitted by" value={sheet.submittedByName ?? 'Unknown'} />
        ) : null}
        <Fact
          label="Answered"
          value={`${sheet.answeredCount} of ${sheet.items.length}`}
        />
        <Fact
          label="Needing attention"
          value={
            // Both `fail` and `requires_testing`, which is what §557's diagnostic
            // report and preliminary quotation are built from.
            sheet.findingCount === 0 && sheet.answeredCount < sheet.items.length
              ? 'Not yet known'
              : String(sheet.findingCount)
          }
        />
      </dl>

      {sheet.editable ? (
        <InspectionSheetForm
          inspectionId={sheet.id}
          jobNumber={sheet.jobNumber}
          items={sheet.items}
          summary={sheet.summary}
          mileageReading={sheet.mileageReading}
          answeredCount={sheet.answeredCount}
        />
      ) : (
        <ReadOnlySheet sheet={sheet} submitted={submitted} />
      )}
    </>
  );
}

function ReadOnlySheet({ sheet, submitted }: { sheet: Inspection; submitted: boolean }) {
  return (
    <>
      {!submitted ? (
        // An open sheet a viewer may not write to — a storekeeper or cashier
        // reading what the inspection found. Said out loud, because otherwise the
        // absence of a form looks like a broken page.
        <p
          style={{
            margin: `0 0 ${primitive.space[3]} 0`,
            color: themeVar.textSecondary,
            fontSize: primitive.fontSize.sm,
          }}
        >
          This inspection is still in progress. Your role can read it but not record results.
        </p>
      ) : null}

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: primitive.fontSize.sm,
        }}
      >
        <caption
          style={{
            textAlign: 'left',
            color: themeVar.textSecondary,
            paddingBottom: primitive.space[2],
          }}
        >
          The checklist as it was asked — {sheet.items.length} checkpoints
        </caption>
        <thead>
          <tr>
            {['Checkpoint', 'Result', 'Note'].map((heading) => (
              <th
                key={heading}
                scope="col"
                style={{
                  textAlign: 'left',
                  padding: primitive.space[2],
                  borderBottom: `1px solid ${themeVar.borderDefault}`,
                  color: themeVar.textSecondary,
                  fontWeight: 600,
                }}
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.items.map((item) => (
            <tr key={item.id}>
              <th
                scope="row"
                style={{
                  textAlign: 'left',
                  padding: primitive.space[2],
                  borderBottom: `1px solid ${themeVar.borderDefault}`,
                  color: themeVar.textPrimary,
                  fontWeight: 400,
                }}
              >
                {item.label}
              </th>
              <td style={roCell}>
                {item.result ? (
                  <StatusBadge
                    kind={RESULT_KIND[item.result] ?? 'draft'}
                    // Falls back to the raw value rather than rendering an empty
                    // badge: a result the label map does not know is still a
                    // recorded answer, and an unlabelled badge would read as
                    // "not answered".
                    label={RESULT_LABEL[item.result] ?? item.result}
                  />
                ) : (
                  // Never blank: an unanswered checkpoint must be visibly
                  // different from one that passed.
                  <span style={{ color: themeVar.textSecondary }}>Not answered</span>
                )}
              </td>
              <td style={roCell}>
                {item.note ?? <span style={{ color: themeVar.textSecondary }}>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2
        style={{
          fontSize: primitive.fontSize.base,
          color: themeVar.textPrimary,
          margin: `${primitive.space[4]} 0 ${primitive.space[2]} 0`,
        }}
      >
        Technician notes
      </h2>
      <p style={{ margin: 0, color: sheet.summary ? themeVar.textPrimary : themeVar.textSecondary }}>
        {sheet.summary ?? 'No notes were recorded.'}
      </p>
    </>
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

const roCell = {
  padding: primitive.space[2],
  borderBottom: `1px solid ${themeVar.borderDefault}`,
  color: themeVar.textPrimary,
  verticalAlign: 'top' as const,
};
