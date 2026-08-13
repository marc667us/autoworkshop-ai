import { Suspense } from 'react';
import Link from 'next/link';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState, StatusBadge, visuallyHidden } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { navLabelFor } from './nav-label';
import { STAGE_LABEL } from './staging-board-screen';
import { StartInspectionForm } from './start-inspection-form';

/**
 * The inspection queue — `07.txt` §2920 (INITIAL INSPECTION FLOW), reached from
 * four different routes because four role trees name it differently:
 *
 *   §34 default   `/repair-services/inspection`        "Inspection"
 *   §46 owner     `/repair-control/inspection`         "Inspection"
 *   §47 manager   `/repair-control/inspection-queue`   "Inspection Queue"
 *   §49 technician`/record-work/inspection-results`    "Inspection Results"
 *
 * ONE implementation, four thin self-gating pages — the shape Phase 4 paid for
 * and slice 2 repeated. A screen built at one path is invisible to every role
 * that uses another, and the nav has advertised all four since Phase 3.
 *
 * The heading comes from `navLabelFor`, so each tree sees its OWN word for this
 * screen rather than one label chosen for all of them.
 *
 * ── TWO REQUESTS, NOT ONE PER CARD ─────────────────────────────────────────
 *
 * The cards and the inspections are fetched separately and joined here. The
 * alternative — asking `/job-cards/:id/inspections` per row — is the N+1 that is
 * slowest exactly when the queue is longest. The API's own scoping does the
 * security work in both calls, so a technician's queue is their assigned work in
 * both halves.
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
  mileageAtIntake: number | null;
  stageChangedAt: string;
}

interface Inspection {
  id: string;
  jobCardId: string;
  attemptNo: number;
  status: 'in_progress' | 'submitted';
  answeredCount: number;
  findingCount: number;
  items: unknown[];
  startedByName: string | null;
  submittedAt: string | null;
  editable: boolean;
}

/**
 * The stages at which an inspection is the work in hand.
 *
 * `further_information_required` is here because it is the lifecycle's route BACK
 * to `initial_inspection` (`STAGE_TRANSITIONS`), so a job waiting on a second
 * look belongs on this queue — but the service will refuse to START a sheet until
 * the card is actually moved back, and the row says so rather than offering a
 * button that fails.
 */
const QUEUE_STAGES = ['initial_inspection', 'further_information_required'];

export async function InspectionQueueScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Inspection');

  return (
    <>
      <PageHeader
        title={title}
        description="Vehicles at initial inspection, with the state of each checklist. A sheet can only be started once the vehicle has been received."
      />
      <Suspense fallback={<LoadingState label="Loading the inspection queue…" />}>
        <Queue route={route} />
      </Suspense>
    </>
  );
}

async function Queue({ route }: { route: string }) {
  // Both calls in parallel: they are independent, and serialising them would
  // double the time the technician waits on a workshop tablet.
  const [cardsResult, inspectionsResult] = await Promise.all([
    apiGet<JobCard[]>('workshop', '/job-cards'),
    apiGet<Inspection[]>('workshop', '/inspections'),
  ]);

  if (!cardsResult.ok) {
    return <ApiFailure reason={cardsResult.reason} workspaceId="workshop" />;
  }
  if (!inspectionsResult.ok) {
    return <ApiFailure reason={inspectionsResult.reason} workspaceId="workshop" />;
  }

  // Newest attempt per card. The API already orders by `attempt_no DESC`, so the
  // FIRST one seen for a card is its current sheet — relying on that rather than
  // re-sorting, because the ordering is the API's stated contract and a second
  // sort here could disagree with it.
  const currentByCard = new Map<string, Inspection>();
  const attemptsByCard = new Map<string, number>();
  for (const inspection of inspectionsResult.data) {
    attemptsByCard.set(inspection.jobCardId, (attemptsByCard.get(inspection.jobCardId) ?? 0) + 1);
    if (!currentByCard.has(inspection.jobCardId)) {
      currentByCard.set(inspection.jobCardId, inspection);
    }
  }

  // A card belongs on the queue if it is AT an inspection stage, or if it already
  // has a sheet. The second half matters for the §49 "Inspection Results" route:
  // a technician who has finished an inspection and moved the card on must still
  // be able to read what they recorded.
  const rows = cardsResult.data.filter(
    (card) => QUEUE_STAGES.includes(card.stage) || currentByCard.has(card.id),
  );

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing waiting on inspection"
        description="A vehicle appears here once its job card reaches initial inspection. Move a received vehicle to that stage on the Repair Staging board."
      />
    );
  }

  return (
    <>
      {/* Wide table in its own scroll container — never the page body. `minWidth:
          0` is the half that does the work inside a flex/grid ancestor; without
          it the container sizes to its content and the whole document scrolls
          sideways (measured on the staging board at 4906px). */}
      <div style={{ overflowX: 'auto', maxWidth: '100%', minWidth: 0 }}>
        <table
          style={{
            width: '100%',
            minWidth: '52rem',
            borderCollapse: 'collapse',
            fontSize: primitive.fontSize.sm,
          }}
        >
          <caption style={visuallyHidden}>
            Vehicles at initial inspection, with the progress of each checklist
          </caption>
          <thead>
            <tr>
              {['Job', 'Vehicle', 'Customer', 'Stage', 'Inspection', 'Action'].map((heading) => (
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
                          kind={current.status === 'submitted' ? 'active' : 'draft'}
                          label={current.status === 'submitted' ? 'Submitted' : 'In progress'}
                        />
                        <div style={{ color: themeVar.textSecondary, marginTop: primitive.space[1] }}>
                          {/* The denominator is the sheet's OWN length, not a
                              constant 19: a historical sheet keeps the questions
                              it actually asked. */}
                          Attempt {current.attemptNo} · {current.answeredCount} of{' '}
                          {current.items.length} answered
                          {current.status === 'submitted' && current.findingCount > 0 ? (
                            <>
                              {' · '}
                              <strong style={{ color: themeVar.textPrimary }}>
                                {current.findingCount} need attention
                              </strong>
                            </>
                          ) : null}
                          {attempts > 1 ? ` · ${attempts} attempts` : null}
                        </div>
                      </>
                    ) : (
                      <span style={{ color: themeVar.textSecondary }}>Not started</span>
                    )}
                  </td>
                  <td style={cell}>
                    {current ? (
                      <>
                        <Link
                          href={`${route}/${current.id}`}
                          style={{ color: primitive.color.blue[600], fontWeight: 600 }}
                        >
                          {/* The link text names the JOB, not "view": a screen
                              reader reading a column of identical "View" links
                              cannot tell them apart (§66). */}
                          {current.editable ? 'Record' : 'View'} inspection for {card.jobNumber}
                        </Link>
                        {/*
                          ⚠️ THE SECOND-ATTEMPT PATH (Codex P1, accepted).
                          Without this the screen was a DEAD END: once attempt 1
                          was submitted the row only ever offered "View", while
                          the API explicitly allows a new attempt and this
                          slice's whole immutability design DEPENDS on a second
                          look being reachable — "a submitted sheet cannot be
                          changed; record a new attempt instead" is the error the
                          API returns, and the product had nowhere to do that.
                          A rule whose only escape hatch is unreachable is not a
                          rule, it is a wall.

                          Offered only when the API would actually accept it:
                          nothing open (`current` is submitted), the vehicle is
                          at the inspection stage, and this viewer may record.
                        */}
                        {current.status === 'submitted' && card.stage === 'initial_inspection' ? (
                          <div style={{ marginTop: primitive.space[2] }}>
                            <StartInspectionForm
                              jobCardId={card.id}
                              jobNumber={card.jobNumber}
                              mileageAtIntake={card.mileageAtIntake}
                              label="Start a new inspection"
                            />
                          </div>
                        ) : null}
                      </>
                    ) : card.stage === 'initial_inspection' ? (
                      <StartInspectionForm
                        jobCardId={card.id}
                        jobNumber={card.jobNumber}
                        mileageAtIntake={card.mileageAtIntake}
                      />
                    ) : (
                      <span style={{ color: themeVar.textSecondary }}>
                        {/* Says WHY there is no button rather than rendering one
                            that the API will refuse. */}
                        Move the card to initial inspection first
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
        `05.txt` §2 forbids disconnected mock pages. §2978 asks for photographs
        and videos alongside the notes and measurements; there is no file storage
        in this build, so that is NAMED here rather than shown as a disabled
        camera button, which would imply the capability exists and is merely off.
      */}
      <p
        style={{
          marginTop: primitive.space[4],
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.sm,
        }}
      >
        Photographs, video and audio evidence (§2978) are not yet supported — object storage is not
        wired up. Notes, results and mileage are live data.
      </p>
    </>
  );
}

const cell = {
  padding: primitive.space[2],
  borderBottom: `1px solid ${themeVar.borderDefault}`,
  color: themeVar.textPrimary,
  verticalAlign: 'top' as const,
  // ⚠️ LOAD-BEARING. The Action cell holds `StartInspectionForm`, whose mileage
  // label is `visuallyHidden` and therefore `position: absolute`. Without a
  // positioned ancestor it escapes this table's scroll container and stretches
  // the document — measured on the sheet screen at 23px over a 390px viewport,
  // and at 4906px on the staging board in slice 2.
  //
  // Latent rather than observed here, because the queue only renders that form
  // for a card with NO inspection yet. Fixed anyway: a defect that appears only
  // when a workshop has an un-started inspection is worse than one that appears
  // always.
  position: 'relative' as const,
};
