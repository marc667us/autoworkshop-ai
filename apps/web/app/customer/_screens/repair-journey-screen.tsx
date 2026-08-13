import { Suspense } from 'react';
import Link from 'next/link';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '@autoworkshop/ui';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import { customerStage, needsCustomer, type JourneyPhase } from './repair-journey';
import { ProposalDecisionForm } from './proposal-decision-form';

/**
 * The customer's repair journey — `01 (1).txt` §33's `service-and-repairs` group.
 *
 * ONE screen at FOUR routes, following `job-card-detail-screen.tsx`, which is
 * mounted at four role-tree routes for the same reason: the four differ only in
 * WHICH of the customer's cards they show and how the empty state reads. Four
 * near-identical files would be four places to fix the next bug in.
 *
 *   /service-and-repairs/service-requests    every request, newest first
 *   /service-and-repairs/repair-tracking     the ones still open
 *   /service-and-repairs/repair-proposals    the ones waiting on the customer
 *   /service-and-repairs/completed-repairs   the ones that are done
 *
 * ⚠️ THE FILTER HERE IS PRESENTATION, NOT ACCESS CONTROL. `JobCardService.list`
 * narrows a `customer` viewer to cards raised against their OWN vehicles — one
 * `c.user_id` predicate in the SQL — and Postgres RLS isolates the tenant
 * underneath that. Both hold whatever this file does. If this component were
 * deleted the data would still be correctly scoped; if the service's predicate
 * were deleted, no amount of filtering here would save it (CLAUDE.md §8).
 */

export const dynamic = 'force-dynamic';

/**
 * ⚠️ THESE NAMES ARE THE API'S, NOT PLAUSIBLE ONES.
 * `JobCard` in `apps/api/src/repair/job-card.service.ts` is the contract. The
 * mobile app once read `stageOptions` where the API returns `allowedStages`;
 * nothing threw, the list was empty, and every user — owners included — was told
 * "your role cannot move this job". A wrong field name here would render a blank
 * card rather than an error.
 */
interface JobCardRow {
  id: string;
  jobNumber: string;
  vehicleId: string;
  registrationNumber: string;
  vehicleDescription: string;
  complaint: string;
  stage: string;
  priority: string;
  assignedTechnicianName: string | null;
  expectedCompletionOn: string | null;
  openedAt: string;
  stageChangedAt: string;
  closedAt: string | null;
}

export type JourneyView = 'all' | 'open' | 'needs-you' | 'finished';

/**
 * The slice of RepairProposal these screens read.
 *
 * WARNING: NAMES TAKEN FROM apps/api/src/repair/proposal.service.ts, not
 * invented. `presentation` carries the disclosures of 410-422; only the money
 * and the two option totals are rendered here, with the narrative the workshop
 * wrote. `decidable` is the API's OWN judgement of whether an answer is still
 * possible - the form is shown on THAT, never on a status string this file
 * re-derives. A superseded version is therefore never offered.
 */
interface ProposalRow {
  id: string;
  jobCardId: string;
  jobNumber: string;
  versionNo: number;
  status: string;
  expectedResult: string | null;
  riskAndLimitations: string | null;
  uncertainties: string | null;
  decidable: boolean;
  decision: string | null;
  decidedAt: string | null;
  presentation: {
    currency: string;
    recommendedTotal: number;
    comprehensiveTotal: number;
    estimatedLabourHours: number;
    documentReference: string;
  };
}

const VIEWS: Record<
  JourneyView,
  {
    title: string;
    description: string;
    emptyTitle: string;
    emptyDescription: string;
    keep: (card: JobCardRow) => boolean;
  }
> = {
  all: {
    title: 'My Service Requests',
    description:
      'Every repair you have asked this workshop for, newest first — including the ones already finished.',
    emptyTitle: 'You have not requested any repairs yet',
    emptyDescription:
      'Report a problem with one of your vehicles and the request will appear here, with its progress.',
    keep: () => true,
  },
  open: {
    title: 'Repair Tracking',
    description: 'Where each of your vehicles has got to. Updated as the workshop moves the job on.',
    emptyTitle: 'Nothing is in for repair',
    emptyDescription:
      'When you report a problem and the workshop takes the vehicle in, you can follow its progress here.',
    keep: (c) => phaseOf(c) !== 'finished',
  },
  'needs-you': {
    title: 'Repair Proposals and Approvals',
    description:
      'The repairs that cannot go any further until you do something — approve a quote, pay a deposit, answer a question or collect the vehicle.',
    emptyTitle: 'Nothing is waiting on you',
    emptyDescription:
      'When the workshop needs your approval, a deposit or an answer, it will appear here. Nothing starts on your vehicle without it.',
    keep: (c) => needsCustomer(c.stage),
  },
  finished: {
    title: 'Completed Repairs',
    description: 'Work this workshop has finished on your vehicles.',
    emptyTitle: 'No completed repairs yet',
    emptyDescription: 'Once a repair is finished and the vehicle handed back, it is recorded here.',
    keep: (c) => phaseOf(c) === 'finished',
  },
};

function phaseOf(card: JobCardRow): JourneyPhase {
  return customerStage(card.stage).phase;
}

function when(iso: string): string {
  // Fixed locale, not the server's. A date that renders differently on two
  // machines gets reported as a data bug.
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function RepairJourneyScreen({ view }: { view: JourneyView }) {
  const config = VIEWS[view];
  return (
    <>
      <PageHeader title={config.title} description={config.description} />
      <Suspense fallback={<LoadingState label="Loading your repairs…" />}>
        <JourneyList view={view} />
      </Suspense>
    </>
  );
}

async function JourneyList({ view }: { view: JourneyView }) {
  const config = VIEWS[view];
  const result = await apiGet<JobCardRow[]>('customer', '/job-cards');

  /*
    Proposals are read ONLY on the view that can act on them. The other three
    would pay for a second round trip to render nothing - and this endpoint was
    closed to customers entirely until 2026-08-04, so a failure here must not
    take the repair list down with it. Hence a separate, tolerated result.
  */
  const proposals =
    view === 'needs-you' ? await apiGet<ProposalRow[]>('customer', '/proposals') : null;

  if (!result.ok) {
    // Covers `unauthenticated` too, which is the normal state for a signed-out
    // visitor: `requireNavRoute` does not refuse them (see the page comment),
    // so this is where they are told to sign in.
    return <ApiFailure reason={result.reason} workspaceId="customer" />;
  }

  const cards = result.data.filter(config.keep);

  if (cards.length === 0) {
    return <EmptyState title={config.emptyTitle} description={config.emptyDescription} />;
  }

  // Newest first. The API orders for the workshop's purposes; a customer with
  // three cars wants the thing that happened most recently at the top.
  const ordered = [...cards].sort(
    (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime(),
  );

  const waiting = ordered.filter((c) => needsCustomer(c.stage)).length;

  return (
    <>
      {/*
        On every view EXCEPT the one that is already only these cards. Telling
        someone "2 need you" on the page listing exactly those two is noise.
      */}
      {view !== 'needs-you' && waiting > 0 ? (
        <p
          style={{
            margin: `0 0 ${primitive.space[4]}`,
            padding: primitive.space[3],
            borderRadius: primitive.radius.md,
            border: `1px solid ${themeVar.borderDefault}`,
            background: themeVar.surfaceRaised,
            fontSize: primitive.fontSize.sm,
          }}
        >
          <strong>{waiting}</strong>{' '}
          {waiting === 1 ? 'repair is waiting on you' : 'repairs are waiting on you'}.{' '}
          <Link href="/customer/service-and-repairs/repair-proposals">See what is needed</Link>
        </p>
      ) : null}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: primitive.space[4] }}>
        {ordered.map((card) => (
          <JourneyCard
            key={card.id}
            card={card}
            /*
              The proposal still OPEN on this card. `decidable` is the API's
              judgement, so an already-answered or superseded version is not
              offered and the customer cannot answer the same thing twice.
            */
            proposal={
              proposals?.ok
                ? proposals.data.find((p) => p.jobCardId === card.id && p.decidable)
                : undefined
            }
            /*
              The most recent proposal on this card that has ALREADY been
              answered. Needed because recording a decision does NOT move the
              job card - advancing the stage is the workshop's action, gated by
              role. So between the customer approving and staff picking the job
              up, the card still reads `awaiting_customer_approval` with no
              answerable proposal on it, and the screen told the customer to
              "contact the workshop to approve or decline" the very thing they
              had just approved.
            */
            answered={
              proposals?.ok
                ? proposals.data
                    .filter((p) => p.jobCardId === card.id && p.decision !== null)
                    .sort((a, b) => b.versionNo - a.versionNo)[0]
                : undefined
            }
          />
        ))}
      </ul>
    </>
  );
}

function JourneyCard({
  card,
  proposal,
  answered,
}: {
  card: JobCardRow;
  proposal?: ProposalRow;
  answered?: ProposalRow;
}) {
  const stage = customerStage(card.stage);
  const yours = stage.phase === 'needs_you';

  return (
    <li
      style={{
        // A card the customer must act on is outlined in the attention colour.
        // The badge alone was not enough at a glance on a phone, which is where
        // most of these are read.
        border: `1px solid ${yours ? themeVar.statusAttention : themeVar.borderDefault}`,
        borderLeft: `4px solid ${yours ? themeVar.statusAttention : themeVar.borderDefault}`,
        borderRadius: primitive.radius.lg,
        padding: primitive.space[4],
        background: themeVar.surfaceRaised,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: primitive.space[3],
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: primitive.space[3], alignItems: 'baseline' }}>
          <span
            style={{
              // A registration is read out over the phone character by
              // character — same reasoning as the order number on §2845.
              fontFamily: primitive.fontFamily.mono,
              fontSize: primitive.fontSize.base,
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}
          >
            {card.registrationNumber}
          </span>
          <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
            {card.vehicleDescription}
          </span>
        </div>
        <StatusBadge kind={stage.badge} label={stage.label} />
      </div>

      <p style={{ margin: `${primitive.space[3]} 0 0`, fontSize: primitive.fontSize.sm }}>
        {stage.detail}
      </p>

      <p
        style={{
          margin: `${primitive.space[2]} 0 0`,
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.sm,
        }}
      >
        {/* What they reported, so the card is identifiable when they have several. */}
        “{card.complaint}”
      </p>

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))',
          gap: primitive.space[3],
          margin: `${primitive.space[4]} 0 0`,
          fontSize: primitive.fontSize.sm,
        }}
      >
        <Fact label="Job number" value={card.jobNumber} mono />
        <Fact label="Requested" value={when(card.openedAt)} />
        <Fact
          label="Expected back"
          value={card.expectedCompletionOn ? when(card.expectedCompletionOn) : 'Not yet estimated'}
        />
        {/*
          The technician's name only once there IS one. "Unassigned" reads as a
          complaint about the workshop rather than as the normal state of a job
          that arrived an hour ago.
        */}
        {card.assignedTechnicianName ? (
          <Fact label="Technician" value={card.assignedTechnicianName} />
        ) : null}
      </dl>

      {/*
        🔴 THE EVIDENCE BEHIND THE PRICE. Owner, 2026-08-07: the inspection must
        be included. Reaching it from the card is the point — a report the
        customer has to know exists and navigate to is one they will not read,
        and this is the screen where they are asked to approve a quotation.

        Always offered rather than shown only when a report exists: knowing
        whether one has been submitted would need a second request per card
        (the N+1 this file already avoids elsewhere), and the report page
        already answers honestly with "no inspection yet". A link that
        sometimes says "nothing here" is a smaller cost than a request per card
        on every render.
      */}
      <p style={{ margin: `${primitive.space[3]} 0 0 0`, fontSize: primitive.fontSize.sm }}>
        <Link href={`/service-and-repairs/inspection-report?job=${encodeURIComponent(card.id)}`}>
          What the workshop found
        </Link>
      </p>

      {yours ? (
        <div style={{ marginTop: primitive.space[4] }}>
          {proposal ? (
            <>
              {/*
                THE PROPOSAL ITSELF, then the controls. Until 2026-08-04 this
                said "contact the workshop": the screen could tell a customer
                their approval was the hold-up and gave them no way to give it,
                so every approval happened by telephone and was typed in by a
                staff member. The customer role is now in CAN_READ_PROPOSAL,
                scoped by a c.user_id predicate inside the query itself.
              */}
              <p style={{ margin: 0, fontSize: primitive.fontSize.sm, fontWeight: 600 }}>
                Repair proposal {proposal.presentation.documentReference} is waiting for your answer.
              </p>
              {proposal.expectedResult ? (
                <p style={{ margin: `${primitive.space[2]} 0 0`, fontSize: primitive.fontSize.sm }}>
                  {proposal.expectedResult}
                </p>
              ) : null}
              {/*
                The risks, and what remains SUSPECTED rather than confirmed.
                These are the fields most likely to be dropped and the ones a
                customer agreeing to a repair is entitled to read: without them
                the first unexpected extra reads as incompetence rather than as
                a stated unknown.
              */}
              {proposal.riskAndLimitations ? (
                <p
                  style={{
                    margin: `${primitive.space[2]} 0 0`,
                    fontSize: primitive.fontSize.sm,
                    color: themeVar.textSecondary,
                  }}
                >
                  <strong>Risks and limitations:</strong> {proposal.riskAndLimitations}
                </p>
              ) : null}
              {proposal.uncertainties ? (
                <p
                  style={{
                    margin: `${primitive.space[2]} 0 0`,
                    fontSize: primitive.fontSize.sm,
                    color: themeVar.textSecondary,
                  }}
                >
                  <strong>Still to be confirmed:</strong> {proposal.uncertainties}
                </p>
              ) : null}
              <ProposalDecisionForm
                proposalId={proposal.id}
                recommendedTotal={proposal.presentation.recommendedTotal}
                comprehensiveTotal={proposal.presentation.comprehensiveTotal}
                currency={proposal.presentation.currency}
              />
            </>
          ) : answered ? (
            /*
              They have ALREADY answered and the workshop has not moved the job
              on yet. Telling them to go and approve it would be the screen
              contradicting the decision it recorded a moment earlier.
            */
            <p style={{ margin: 0, fontSize: primitive.fontSize.sm, fontWeight: 600 }}>
              You {answered.decision === 'approved' ? 'approved' : 'answered'} proposal{' '}
              {answered.presentation.documentReference}
              {answered.decidedAt ? ` on ${when(answered.decidedAt)}` : ''}. The workshop has been
              told and will move the job on.
            </p>
          ) : (
            /*
              No proposal on this card at all. The customer is still the hold-up
              - a deposit, a question, or a vehicle to collect - and none of
              those is answerable in this build, so it says what to do rather
              than offering a control that would silently fail.
            */
            <p style={{ margin: 0, fontSize: primitive.fontSize.sm, fontWeight: 600 }}>
              Contact the workshop to {actionFor(card.stage)}.
            </p>
          )}
        </div>
      ) : null}
    </li>
  );
}

/** The verb for the one thing this customer has to do. */
function actionFor(stage: string): string {
  switch (stage) {
    case 'awaiting_customer_approval':
      return 'approve or decline the repair proposal';
    case 'awaiting_deposit':
      return 'pay the deposit so work can start';
    case 'further_information_required':
      return 'answer their question';
    case 'ready_for_collection':
      return 'arrange collection of your vehicle';
    default:
      return 'find out what is needed';
  }
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.xs }}>{label}</dt>
      <dd
        style={{
          margin: 0,
          fontFamily: mono ? primitive.fontFamily.mono : undefined,
        }}
      >
        {value}
      </dd>
    </div>
  );
}
