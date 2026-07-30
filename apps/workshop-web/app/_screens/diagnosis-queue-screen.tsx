import { Suspense } from 'react';
import Link from 'next/link';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState, StatusBadge, visuallyHidden } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { navLabelFor } from './nav-label';
import { STAGE_LABEL } from './staging-board-screen';
import { StartDiagnosisForm } from './start-diagnosis-form';
import { DIAGNOSIS_STATUS_KIND, DIAGNOSIS_STATUS_LABEL } from './diagnosis-labels';

/**
 * The diagnosis queue — `07.txt` §3026 (DIAGNOSIS FLOW), reached from four routes
 * because four role trees name it differently:
 *
 *   §34 default    `/repair-services/diagnosis`          "Diagnosis"
 *   §46 owner      `/repair-control/diagnosis`           "Diagnosis"
 *   §47 manager    `/repair-control/diagnosis-queue`     "Diagnosis Queue"
 *   §49 technician `/record-work/diagnostic-results`     "Diagnostic Results"
 *
 * ONE implementation, four thin self-gating pages — the shape Phase 4 paid for and
 * slices 2 and 3a repeated. A screen built at one path is invisible to every role
 * that uses another, and the nav has advertised all four since Phase 3.
 *
 * The heading comes from `navLabelFor`, so each tree sees its OWN word for this
 * screen rather than one label chosen for all of them.
 *
 * ── AWAITING REVIEW IS THE COLUMN THIS QUEUE EXISTS FOR ────────────────────
 *
 * §1292 puts a supervisor between a diagnosis and the quotation built from it, so
 * "submitted, nobody has answered it" is the state that must be impossible to miss
 * — a diagnosis sitting unreviewed is a car sitting in a bay. Submitted records are
 * ordered FIRST for that reason, ahead of work still in progress.
 *
 * ── TWO REQUESTS, NOT ONE PER CARD ─────────────────────────────────────────
 *
 * The cards and the diagnoses are fetched separately and joined here. Asking
 * `/job-cards/:id/diagnoses` per row is the N+1 that is slowest exactly when the
 * queue is longest. The API's own scoping does the security work in both calls, so a
 * technician's queue is their assigned work in both halves.
 */

interface JobCard {
  id: string;
  jobNumber: string;
  customerName: string;
  registrationNumber: string;
  vehicleDescription: string;
  complaint: string;
  stage: string;
  priority: string;
  assignedTechnicianName: string | null;
  stageChangedAt: string;
}

interface Diagnosis {
  id: string;
  jobCardId: string;
  attemptNo: number;
  status: 'in_progress' | 'submitted' | 'approved' | 'rejected';
  findings: unknown[];
  confirmedCount: number;
  suspectedCount: number;
  excludedCount: number;
  additionalInspectionCount: number;
  startedByName: string | null;
  submittedAt: string | null;
  reviewedByName: string | null;
  editable: boolean;
  reviewable: boolean;
}

/**
 * The stages at which a diagnosis is the work in hand.
 *
 * `further_information_required` is here because it is the lifecycle's route BACK to
 * `diagnosis_in_progress`, so a job waiting on further testing belongs on this queue
 * — but the service will refuse to START a record until the card is actually moved
 * back, and the row says so rather than offering a button that fails.
 */
const QUEUE_STAGES = ['diagnosis_in_progress', 'further_information_required'];

export async function DiagnosisQueueScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Diagnosis');

  return (
    <>
      <PageHeader
        title={title}
        description="Vehicles under diagnosis, with the state of each record. A diagnosis can only be started once the vehicle has reached the diagnosis stage, and a submitted one waits on a supervisor who did not write it."
      />
      <Suspense fallback={<LoadingState label="Loading the diagnosis queue…" />}>
        <Queue route={route} />
      </Suspense>
    </>
  );
}

async function Queue({ route }: { route: string }) {
  // Both calls in parallel: they are independent, and serialising them would double
  // the time the technician waits on a workshop tablet.
  const [cardsResult, diagnosesResult] = await Promise.all([
    apiGet<JobCard[]>('workshop', '/job-cards'),
    apiGet<Diagnosis[]>('workshop', '/diagnoses'),
  ]);

  if (!cardsResult.ok) {
    return <ApiFailure reason={cardsResult.reason} workspaceId="workshop" />;
  }
  if (!diagnosesResult.ok) {
    return <ApiFailure reason={diagnosesResult.reason} workspaceId="workshop" />;
  }

  // Newest attempt per card. The API orders by `attempt_no DESC`, so the FIRST one
  // seen for a card is its current record — relying on that rather than re-sorting,
  // because the ordering is the API's stated contract and a second sort here could
  // disagree with it.
  const currentByCard = new Map<string, Diagnosis>();
  const attemptsByCard = new Map<string, number>();
  for (const diagnosis of diagnosesResult.data) {
    attemptsByCard.set(diagnosis.jobCardId, (attemptsByCard.get(diagnosis.jobCardId) ?? 0) + 1);
    if (!currentByCard.has(diagnosis.jobCardId)) {
      currentByCard.set(diagnosis.jobCardId, diagnosis);
    }
  }

  // A card belongs on the queue if it is AT a diagnosis stage, or if it already has
  // a record. The second half matters for the §49 "Diagnostic Results" route: a
  // technician who has finished a diagnosis and moved the card on must still be able
  // to read what they recorded — and to read a REJECTION, which is the whole point
  // of §1292 reaching them.
  const rows = cardsResult.data
    .filter((card) => QUEUE_STAGES.includes(card.stage) || currentByCard.has(card.id))
    // Awaiting review first. A supervisor opening this screen should not have to
    // hunt for the records that are waiting on them, and a technician should see a
    // rejection before work that is merely ongoing.
    .sort((a, b) => sortRank(currentByCard.get(a.id)) - sortRank(currentByCard.get(b.id)));

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing waiting on diagnosis"
        description="A vehicle appears here once its job card reaches diagnosis. Move a card on from initial inspection on the Repair Staging board."
      />
    );
  }

  const awaiting = rows.filter((c) => currentByCard.get(c.id)?.status === 'submitted').length;

  return (
    <>
      {awaiting > 0 ? (
        // Named in text, not only implied by badge colour (§66) — and it is the one
        // number a manager opening this screen wants before reading any row.
        <p
          role="status"
          style={{
            margin: `0 0 ${primitive.space[3]} 0`,
            color: themeVar.textPrimary,
            fontSize: primitive.fontSize.sm,
            fontWeight: 600,
          }}
        >
          {awaiting} diagnosis(es) awaiting supervisor review.
        </p>
      ) : null}

      {/* Wide table in its own scroll container — never the page body. `minWidth: 0`
          is the half that does the work inside a flex/grid ancestor; without it the
          container sizes to its content and the whole document scrolls sideways
          (measured on the staging board at 4906px). */}
      <div style={{ overflowX: 'auto', maxWidth: '100%', minWidth: 0 }}>
        <table
          style={{
            width: '100%',
            minWidth: '56rem',
            borderCollapse: 'collapse',
            fontSize: primitive.fontSize.sm,
          }}
        >
          <caption style={visuallyHidden}>
            Vehicles under diagnosis, with the state of each record and its findings
          </caption>
          <thead>
            <tr>
              {['Job', 'Vehicle', 'Customer', 'Stage', 'Diagnosis', 'Findings', 'Action'].map(
                (heading) => (
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
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((card) => {
              const current = currentByCard.get(card.id);
              const attempts = attemptsByCard.get(card.id) ?? 0;
              return (
                <tr key={card.id}>
                  <td style={cell}>
                    <span style={{ fontFamily: primitive.fontFamily.mono, fontWeight: 600 }}>
                      {card.jobNumber}
                    </span>
                  </td>
                  <td style={cell}>
                    <span style={{ fontFamily: primitive.fontFamily.mono }}>
                      {card.registrationNumber}
                    </span>
                    <br />
                    <span style={{ color: themeVar.textSecondary }}>{card.vehicleDescription}</span>
                  </td>
                  <td style={cell}>{card.customerName}</td>
                  <td style={cell}>{STAGE_LABEL[card.stage] ?? card.stage}</td>
                  <td style={cell}>
                    {current ? (
                      <>
                        <StatusBadge
                          kind={DIAGNOSIS_STATUS_KIND[current.status] ?? 'draft'}
                          label={DIAGNOSIS_STATUS_LABEL[current.status] ?? current.status}
                        />
                        <div
                          style={{ color: themeVar.textSecondary, marginTop: primitive.space[1] }}
                        >
                          Attempt {current.attemptNo}
                          {attempts > 1 ? ` of ${attempts}` : null}
                          {current.reviewedByName ? ` · reviewed by ${current.reviewedByName}` : null}
                        </div>
                      </>
                    ) : (
                      <span style={{ color: themeVar.textSecondary }}>Not started</span>
                    )}
                  </td>
                  <td style={cell}>
                    {current ? (
                      current.findings.length === 0 ? (
                        // Said out loud, because an empty cell reads as "nothing
                        // wrong" when it means "nobody has recorded anything" — and
                        // submission is refused in this state.
                        <span style={{ color: themeVar.textSecondary }}>None recorded yet</span>
                      ) : (
                        <>
                          {/* §1290's three standings, each named. A single total
                              would hide the distinction the specification exists to
                              draw. Zero counts are omitted rather than shown as
                              "0 confirmed", which reads as a finding of its own. */}
                          {current.confirmedCount > 0 ? (
                            <div style={{ color: themeVar.textPrimary, fontWeight: 600 }}>
                              {current.confirmedCount} confirmed
                            </div>
                          ) : null}
                          {current.suspectedCount > 0 ? (
                            <div style={{ color: themeVar.textSecondary }}>
                              {current.suspectedCount} suspected
                            </div>
                          ) : null}
                          {current.excludedCount > 0 ? (
                            <div style={{ color: themeVar.textSecondary }}>
                              {current.excludedCount} excluded
                            </div>
                          ) : null}
                          {current.additionalInspectionCount > 0 ? (
                            <div style={{ color: themeVar.textSecondary }}>
                              {/* §3046 — the reason a card goes to
                                  `further_information_required`. */}
                              {current.additionalInspectionCount} need further inspection
                            </div>
                          ) : null}
                        </>
                      )
                    ) : (
                      <span style={{ color: themeVar.textSecondary }}>—</span>
                    )}
                  </td>
                  <td style={cell}>
                    {current ? (
                      <>
                        <Link
                          href={`${route}/${current.id}`}
                          style={{ color: primitive.color.blue[600], fontWeight: 600 }}
                        >
                          {/* The link text names the JOB, not "view": a screen reader
                              reading a column of identical "View" links cannot tell
                              them apart (§66). The verb reflects what this viewer can
                              actually do with it. */}
                          {current.reviewable
                            ? 'Review'
                            : current.editable
                              ? 'Record'
                              : 'View'}{' '}
                          diagnosis for {card.jobNumber}
                        </Link>
                        {/*
                          ⚠️ THE SECOND-ATTEMPT PATH. The service refuses to change a
                          submitted or reviewed diagnosis and its refusal says "start a
                          new diagnosis to record a further opinion" — so that has to be
                          reachable from the product, or the rule is a wall rather than a
                          rule. Slice 3a shipped exactly this defect and Codex caught it;
                          it is offered here from the start.

                          Shown only when the API would actually accept it: nothing open
                          (the current record is settled) and the vehicle is back at the
                          diagnosis stage.
                        */}
                        {current.status !== 'in_progress' &&
                        card.stage === 'diagnosis_in_progress' ? (
                          <div style={{ marginTop: primitive.space[2] }}>
                            <StartDiagnosisForm
                              jobCardId={card.id}
                              jobNumber={card.jobNumber}
                              label="Start a new diagnosis"
                            />
                          </div>
                        ) : null}
                      </>
                    ) : card.stage === 'diagnosis_in_progress' ? (
                      <StartDiagnosisForm jobCardId={card.id} jobNumber={card.jobNumber} />
                    ) : (
                      <span style={{ color: themeVar.textSecondary }}>
                        {/* Says WHY there is no button rather than rendering one the
                            API will refuse. */}
                        Move the card to diagnosis first
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/*
        `05.txt` §2 forbids disconnected mock pages, so the two capabilities this
        screen does NOT have are NAMED rather than shown as disabled controls, which
        would imply they exist and are merely switched off.
      */}
      <p
        style={{
          marginTop: primitive.space[4],
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.sm,
        }}
      >
        Live fault-code lookup and diagnostic trees (§17) are Phase 9, and AI fault
        suggestions (§1294) are Phase 8 — every finding here is recorded by a named
        technician. Measurement capture beyond test/expected/actual awaits OBD integration.
      </p>
    </>
  );
}

/**
 * Queue order: awaiting review, then rejected, then in progress, then settled.
 *
 * A plain number rather than a comparator chain so the intent is readable: the two
 * states that need a HUMAN TO ACT come first, and an approved diagnosis — where
 * nothing is owed — sorts last.
 */
function sortRank(diagnosis: Diagnosis | undefined): number {
  switch (diagnosis?.status) {
    case 'submitted':
      return 0;
    case 'rejected':
      return 1;
    case 'in_progress':
      return 2;
    case 'approved':
      return 4;
    // No record at all sorts between "in progress" and "approved": starting one is
    // work that is owed, but less urgent than a rejection sitting unread.
    default:
      return 3;
  }
}

const cell = {
  padding: primitive.space[2],
  borderBottom: `1px solid ${themeVar.borderDefault}`,
  color: themeVar.textPrimary,
  verticalAlign: 'top' as const,
  // ⚠️ LOAD-BEARING, kept even though `StartDiagnosisForm` has no hidden label of
  // its own. A positioned ancestor is what stops any absolutely-positioned
  // descendant escaping this table's scroll container and stretching the document —
  // measured at 23px on the inspection sheet and 4906px on the staging board. The
  // next control dropped into this cell should not have to rediscover that.
  position: 'relative' as const,
};
