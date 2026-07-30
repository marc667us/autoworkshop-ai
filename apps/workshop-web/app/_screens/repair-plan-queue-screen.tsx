import { Suspense } from 'react';
import Link from 'next/link';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState, StatusBadge, visuallyHidden } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { navLabelFor } from './nav-label';
import { STAGE_LABEL } from './staging-board-screen';
import { StartRepairPlanForm } from './start-repair-plan-form';
import { PLAN_STATUS_KIND, PLAN_STATUS_LABEL, formatHours } from './repair-plan-labels';

/**
 * The repair-planning queue — `07.txt` §22-§31, reached from THREE routes because
 * three role trees name it:
 *
 *   §34 default (incl. workshop_supervisor)  `/repair-services/repair-plans`  "Repair Plans"
 *   §46 owner AND §47 manager                `/repair-control/repair-plans`   "Repair Plans"
 *   §49 technician                           `/plan-work/repair-planning`     "Repair Planning"
 *
 * ⚠️ THREE, NOT FOUR — and the reflex from slices 3a and 3b is wrong here. Those each
 * needed four directories because the §47 manager tree gave the screen its own name
 * ("Diagnosis Queue"); for repair plans §46 and §47 both call it
 * `repair-control/repair-plans`. Checked against
 * `packages/navigation/src/workspaces.ts` rather than assumed — a fourth directory
 * would be a page no navigation points at.
 *
 * ONE implementation, three thin self-gating pages. A screen built at one path is
 * invisible to every role that uses another, and the nav has advertised all three
 * since Phase 3.
 *
 * The heading comes from `navLabelFor`, so each tree sees its OWN word for this screen
 * rather than one label chosen for all of them.
 *
 * ── AWAITING REVIEW IS THE COLUMN THIS QUEUE EXISTS FOR ────────────────────
 *
 * §30 puts a supervisor between a plan and the quotation priced from it, so
 * "submitted, nobody has answered it" is the state that must be impossible to miss —
 * an unreviewed plan is a car sitting in a bay and a customer waiting for a price.
 * Submitted records are ordered FIRST for that reason.
 *
 * ── TWO REQUESTS, NOT ONE PER CARD ─────────────────────────────────────────
 *
 * The cards and the plans are fetched separately and joined here. Asking
 * `/job-cards/:id/repair-plans` per row is the N+1 that is slowest exactly when the
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

interface RepairPlan {
  id: string;
  jobCardId: string;
  attemptNo: number;
  status: 'in_progress' | 'submitted' | 'approved' | 'rejected';
  tasks: unknown[];
  totalEstimatedLabourHours: number;
  unestimatedTaskCount: number;
  unaddressedFaultCount: number;
  partCount: number;
  equipmentCount: number;
  startedByName: string | null;
  submittedAt: string | null;
  reviewedByName: string | null;
  editable: boolean;
  reviewable: boolean;
}

/**
 * The stages at which a repair plan is the work in hand.
 *
 * `solution_preparation` is where a plan is built. `awaiting_customer_approval` is
 * here because the lifecycle's route BACK is
 * `awaiting_customer_approval → solution_preparation`, so a job whose customer asked
 * for changes belongs on this queue — but the service will refuse to START a plan
 * until the card is actually moved back, and the row says so rather than offering a
 * button that fails.
 */
const QUEUE_STAGES = ['solution_preparation', 'awaiting_customer_approval'];

export async function RepairPlanQueueScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Repair Plans');

  return (
    <>
      <PageHeader
        title={title}
        description="Vehicles at the planning stage, with the state of each plan. A plan is built from the confirmed faults of an approved diagnosis, and a submitted one waits on a supervisor who did not write it."
      />
      <Suspense fallback={<LoadingState label="Loading the repair-planning queue…" />}>
        <Queue route={route} />
      </Suspense>
    </>
  );
}

async function Queue({ route }: { route: string }) {
  // Both calls in parallel: they are independent, and serialising them would double
  // the time the technician waits on a workshop tablet.
  const [cardsResult, plansResult] = await Promise.all([
    apiGet<JobCard[]>('workshop', '/job-cards'),
    apiGet<RepairPlan[]>('workshop', '/repair-plans'),
  ]);

  if (!cardsResult.ok) {
    return <ApiFailure reason={cardsResult.reason} workspaceId="workshop" />;
  }
  if (!plansResult.ok) {
    return <ApiFailure reason={plansResult.reason} workspaceId="workshop" />;
  }

  // Newest attempt per card. The API orders by `attempt_no DESC`, so the FIRST one seen
  // for a card is its current plan — relying on that rather than re-sorting, because
  // the ordering is the API's stated contract and a second sort here could disagree
  // with it.
  const currentByCard = new Map<string, RepairPlan>();
  const attemptsByCard = new Map<string, number>();
  for (const plan of plansResult.data) {
    attemptsByCard.set(plan.jobCardId, (attemptsByCard.get(plan.jobCardId) ?? 0) + 1);
    if (!currentByCard.has(plan.jobCardId)) {
      currentByCard.set(plan.jobCardId, plan);
    }
  }

  // A card belongs on the queue if it is AT a planning stage, or if it already has a
  // plan. The second half matters for the §49 "Repair Planning" route: a technician
  // whose plan has moved on must still be able to read what they proposed — and to read
  // a REJECTION, which is the whole point of §31 reaching them.
  const rows = cardsResult.data
    .filter((card) => QUEUE_STAGES.includes(card.stage) || currentByCard.has(card.id))
    // Awaiting review first. A supervisor opening this screen should not have to hunt
    // for the records waiting on them, and a technician should see a rejection before
    // work that is merely ongoing.
    .sort((a, b) => sortRank(currentByCard.get(a.id)) - sortRank(currentByCard.get(b.id)));

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing waiting on repair planning"
        description="A vehicle appears here once its job card reaches solution preparation — which follows an approved diagnosis. Move a card on from diagnosis on the Repair Staging board."
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
          {awaiting} repair plan(s) awaiting supervisor review.
        </p>
      ) : null}

      {/* Wide table in its own scroll container — never the page body. `minWidth: 0` is
          the half that does the work inside a flex/grid ancestor; without it the
          container sizes to its content and the whole document scrolls sideways
          (measured on the staging board at 4906px). */}
      <div style={{ overflowX: 'auto', maxWidth: '100%', minWidth: 0 }}>
        <table
          style={{
            width: '100%',
            minWidth: '58rem',
            borderCollapse: 'collapse',
            fontSize: primitive.fontSize.sm,
          }}
        >
          <caption style={visuallyHidden}>
            Vehicles at the planning stage, with the state of each repair plan, its
            tasks and its estimated labour
          </caption>
          <thead>
            <tr>
              {['Job', 'Vehicle', 'Customer', 'Stage', 'Plan', 'Content', 'Action'].map(
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
                          kind={PLAN_STATUS_KIND[current.status] ?? 'draft'}
                          label={PLAN_STATUS_LABEL[current.status] ?? current.status}
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
                      current.tasks.length === 0 ? (
                        // Said out loud, because an empty cell reads as "nothing to do"
                        // when it means "nobody has planned anything" — and submission
                        // is refused in this state.
                        <span style={{ color: themeVar.textSecondary }}>No tasks yet</span>
                      ) : (
                        <>
                          <div style={{ color: themeVar.textPrimary, fontWeight: 600 }}>
                            {current.tasks.length} task(s) ·{' '}
                            {formatHours(current.totalEstimatedLabourHours)}
                          </div>
                          {current.partCount > 0 || current.equipmentCount > 0 ? (
                            <div style={{ color: themeVar.textSecondary }}>
                              {current.partCount} part(s) · {current.equipmentCount} equipment
                            </div>
                          ) : null}
                          {/* The two things that stop a submission, named on the queue so
                              a technician sees them before opening the record. */}
                          {current.unestimatedTaskCount > 0 ? (
                            <div style={{ color: primitive.color.red[700] }}>
                              {current.unestimatedTaskCount} unestimated
                            </div>
                          ) : null}
                          {/* Not a blocker — see the service's `submit`. Shown because a
                              confirmed fault nobody planned for is the one thing a
                              reviewer must weigh, and it is invisible otherwise. */}
                          {current.unaddressedFaultCount > 0 ? (
                            <div style={{ color: themeVar.textSecondary }}>
                              {current.unaddressedFaultCount} confirmed fault(s) not addressed
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
                              reading a column of identical "View" links cannot tell them
                              apart (§66). The verb reflects what this viewer can
                              actually do with it. */}
                          {current.reviewable
                            ? 'Review'
                            : current.editable
                              ? 'Plan'
                              : 'View'}{' '}
                          repair plan for {card.jobNumber}
                        </Link>
                        {/*
                          ⚠️ THE SECOND-ATTEMPT PATH. The service refuses to change a
                          submitted or reviewed plan and its refusal says "start a new
                          repair plan to record a revised proposal" — so that has to be
                          reachable from the product, or the rule is a wall rather than a
                          rule.

                          Shown only when the API would actually accept it: the current
                          plan is SETTLED and the vehicle is back at the planning stage.

                          ⚠️ NOT WHILE THE PLAN IS `submitted`. Offering it there is the
                          review BYPASS Codex found on slice 3b: starting attempt 2 makes
                          it the newest, so the submitted attempt 1 stops being the
                          current record and the awaiting-review count above falls to
                          zero while nobody has reviewed anything. The service refuses it
                          as well — this is the button not being offered, not the rule.
                        */}
                        {(current.status === 'approved' || current.status === 'rejected') &&
                        card.stage === 'solution_preparation' ? (
                          <div style={{ marginTop: primitive.space[2] }}>
                            <StartRepairPlanForm
                              jobCardId={card.id}
                              jobNumber={card.jobNumber}
                              label="Start a revised plan"
                            />
                          </div>
                        ) : null}
                      </>
                    ) : card.stage === 'solution_preparation' ? (
                      <StartRepairPlanForm jobCardId={card.id} jobNumber={card.jobNumber} />
                    ) : (
                      <span style={{ color: themeVar.textSecondary }}>
                        {/* Says WHY there is no button rather than rendering one the API
                            will refuse. */}
                        Move the card to solution preparation first
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
        `05.txt` §2 forbids disconnected mock pages, so the capabilities this screen
        does NOT have are NAMED rather than shown as disabled controls, which would
        imply they exist and are merely switched off.
      */}
      <p
        style={{
          marginTop: primitive.space[4],
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.sm,
        }}
      >
        Parts search and reservation (§24), tool and service-bay booking, and §12’s
        conflict checks — technician unavailable, bay unavailable, part not in stock —
        need the inventory, bay and roster registries, which are later slices. Until
        then a plan records what is REQUIRED; nothing here claims it is available.
        Repair-procedure and diagnostic-tree libraries (§17) are Phase 9.
      </p>
    </>
  );
}

/**
 * Queue order: awaiting review, then rejected, then in progress, then settled.
 *
 * A plain number rather than a comparator chain so the intent is readable: the two
 * states that need a HUMAN TO ACT come first, and an approved plan — where nothing is
 * owed here — sorts last.
 */
function sortRank(plan: RepairPlan | undefined): number {
  switch (plan?.status) {
    case 'submitted':
      return 0;
    case 'rejected':
      return 1;
    case 'in_progress':
      return 2;
    case 'approved':
      return 4;
    // No plan at all sorts between "in progress" and "approved": starting one is work
    // that is owed, but less urgent than a rejection sitting unread.
    default:
      return 3;
  }
}

const cell = {
  padding: primitive.space[2],
  borderBottom: `1px solid ${themeVar.borderDefault}`,
  color: themeVar.textPrimary,
  verticalAlign: 'top' as const,
  // ⚠️ LOAD-BEARING. A positioned ancestor is what stops any absolutely-positioned
  // descendant escaping this table's scroll container and stretching the document —
  // measured at 23px on the inspection sheet and 4906px on the staging board.
  position: 'relative' as const,
};
