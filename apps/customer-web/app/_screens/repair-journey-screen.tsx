import { Suspense } from 'react';
import Link from 'next/link';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '@autoworkshop/ui';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import { customerStage, needsCustomer, type JourneyPhase } from './repair-journey';

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
          <Link href="/service-and-repairs/repair-proposals">See what is needed</Link>
        </p>
      ) : null}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: primitive.space[4] }}>
        {ordered.map((card) => (
          <JourneyCard key={card.id} card={card} />
        ))}
      </ul>
    </>
  );
}

function JourneyCard({ card }: { card: JobCardRow }) {
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

      {yours ? (
        <p
          style={{
            margin: `${primitive.space[4]} 0 0`,
            fontSize: primitive.fontSize.sm,
            fontWeight: 600,
          }}
        >
          {/*
            🔴 AN HONEST NEXT STEP, NOT A BUTTON THAT DOES NOTHING.
            Approving a proposal in-app is `POST /proposals/:id/decision`, and
            that route is written for a staff member CAPTURING the customer's
            answer — `decidedByName` is the customer while the session is the
            workshop's. A self-service decision needs its own authenticated
            route; until it exists, offering a button here would be a control
            that silently fails, which this repo has now shipped once (a form
            with no submit button) and does not need again.
          */}
          Contact the workshop to {actionFor(card.stage)}.
        </p>
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
