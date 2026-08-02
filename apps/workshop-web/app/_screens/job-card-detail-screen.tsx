import { Suspense } from 'react';
import Link from 'next/link';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { StageMoveForm } from './stage-move-form';
import { STAGE_LABEL } from './staging-board-screen';

/**
 * ONE JOB CARD — the screen the fourteen queues and both job-card lists point at.
 *
 * `1.txt` §322: the job card is the record the whole repair lifecycle hangs off.
 * Until this existed, every queue rendered the job number as PLAIN TEXT, because
 * linking it would have sent the user's most obvious click into the "not built
 * yet" catch-all — a dead primary action teaches people the screen is broken.
 *
 * ── WHAT THIS SCREEN IS FOR ────────────────────────────────────────────────
 *
 * Reading one card, and moving it on. Recording inspections, diagnoses, repair
 * plans, quotations and executions each already has its own screen reached from
 * its own queue, and those screens carry rules this one does not restate. This
 * one deliberately does NOT invent a tabbed shell around them: `05.txt` §2
 * forbids disconnected pages, and a tab strip promising five sections that
 * navigate nowhere is exactly that. What it does instead is tell the reader
 * plainly, once, that those records live on their own screens.
 *
 * ── THE MOBILE APP IS THE MODEL, NOT THE SOURCE ────────────────────────────
 *
 * `apps/mobile/src/screens/JobCardDetailScreen.tsx` shipped first and this
 * follows its shape: read the card, render the fields, offer `allowedStages`,
 * and RE-READ after a move rather than painting the new stage optimistically.
 * It is not shared code — a React Native screen and a React server component
 * have no common rendering surface — and the two are kept honest by both
 * reading the same API, not by one importing the other.
 *
 * ⚠️ THE FIELD IS `allowedStages`. The mobile screen was first written against
 * `stageOptions`, a name the API has never returned. Nothing throws: the list
 * is empty, and the screen tells the viewer "your role cannot move this job" —
 * a fluent falsehood, shown to workshop owners too. The web move control takes
 * the list as a prop, so the name is checked here, once, at the call site.
 *
 * ⚠️ NOTHING ON THIS SCREEN IS A PERMISSION CONTROL. `allowedStages` narrows
 * what is OFFERED; `JobCardService.changeStage` re-derives every rule when the
 * move is submitted, and `findById` answers 404 for a card outside the viewer's
 * tenant, organisation or assignment. Guessing an id in the URL yields nothing
 * (CLAUDE.md §8).
 */

interface JobCardDetail {
  id: string;
  jobNumber: string;
  customerId: string;
  customerName: string;
  vehicleId: string;
  registrationNumber: string;
  vehicleDescription: string;
  complaint: string;
  stage: string;
  priority: string;
  assignedTechnicianId: string | null;
  assignedTechnicianName: string | null;
  expectedCompletionOn: string | null;
  mileageAtIntake: number | null;
  openedAt: string;
  stageChangedAt: string;
  closedAt: string | null;
  allowedStages: string[];
}

/** Same mapping as the job-card list and the staging board — see `stageKind`. */
function stageKind(stage: string): 'active' | 'attention' | 'blocked' | 'complete' | 'draft' {
  if (stage === 'completed' || stage === 'ready_for_collection') return 'complete';
  if (stage === 'on_hold') return 'blocked';
  if (stage.startsWith('awaiting_') || stage === 'further_information_required') return 'blocked';
  if (stage === 'complaint_received' || stage === 'appointment_confirmed') return 'draft';
  return 'active';
}

const PRIORITY_KIND: Record<string, 'active' | 'attention' | 'blocked' | 'draft'> = {
  low: 'draft',
  normal: 'active',
  high: 'attention',
  urgent: 'blocked',
};

/**
 * A date the way the workshop says it, from a value that is a DATE and not an
 * instant. `expectedCompletionOn` is a `date` column rendered by the API as
 * `YYYY-MM-DD`; putting it through `new Date()` would attach this machine's
 * timezone to a value that never had one and can shift the day shown.
 */
function plainDate(value: string | null): string {
  return value ?? 'Not set';
}

/** An instant, which genuinely is one. */
function instant(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function JobCardDetailScreen({ id, listHref }: { id: string; listHref: string }) {
  return (
    <>
      {/* Above the header and rendered before the fetch: the way back must not
          depend on the card loading. A viewer who hits a 404 or an outage still
          needs to get off this page. */}
      <p style={{ margin: `0 0 ${primitive.space[3]}` }}>
        <Link href={listHref} style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
          ‹ Back to job cards
        </Link>
      </p>
      <Suspense fallback={<LoadingState label="Opening the job card…" />}>
        <Detail id={id} listHref={listHref} />
      </Suspense>
    </>
  );
}

async function Detail({ id, listHref }: { id: string; listHref: string }) {
  const result = await apiGet<JobCardDetail>('workshop', `/job-cards/${encodeURIComponent(id)}`);

  if (!result.ok) {
    // The shared failure component: it already tells an expired session apart
    // from a refusal from an outage, and says each in the words every other
    // screen uses. `notFound` here also covers a technician opening a card that
    // is not assigned to them — the service answers 404 rather than 403 so this
    // is not an existence oracle.
    return (
      <>
        <PageHeader title="Job card" />
        <ApiFailure reason={result.reason} workspaceId="workshop" />
      </>
    );
  }

  const card = result.data;
  const closed = card.closedAt !== null;

  return (
    <>
      <PageHeader
        title={card.jobNumber}
        description={`${card.registrationNumber}${card.vehicleDescription ? ` — ${card.vehicleDescription}` : ''} · ${card.customerName}`}
        actions={
          <>
            <StatusBadge kind={stageKind(card.stage)} label={STAGE_LABEL[card.stage] ?? card.stage} />
            <StatusBadge kind={PRIORITY_KIND[card.priority] ?? 'draft'} label={card.priority} />
          </>
        }
      />

      {/* The customer's own words, in full and not truncated. The queue rows
          clip the complaint to keep the table readable; this is the screen
          where somebody actually reads it. */}
      <section style={{ marginTop: primitive.space[6] }}>
        <H2>Complaint</H2>
        <p style={{ margin: 0, color: themeVar.textPrimary, whiteSpace: 'pre-wrap' }}>{card.complaint}</p>
      </section>

      <section style={{ marginTop: primitive.space[6] }}>
        <H2>Details</H2>
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))',
            gap: primitive.space[4],
            margin: 0,
          }}
        >
          <Detail_ label="Vehicle" value={`${card.registrationNumber}${card.vehicleDescription ? ` — ${card.vehicleDescription}` : ''}`} />
          <Detail_ label="Customer" value={card.customerName} />
          {/* "Nobody yet", not "Unassigned" or a dash: a job nobody is on is a
              thing somebody has to act on, and a dash reads as missing data. */}
          <Detail_ label="Assigned to" value={card.assignedTechnicianName ?? 'Nobody yet'} />
          <Detail_
            label="Mileage at intake"
            value={card.mileageAtIntake === null ? 'Not recorded' : card.mileageAtIntake.toLocaleString('en-GB')}
          />
          <Detail_ label="Expected completion" value={plainDate(card.expectedCompletionOn)} />
          <Detail_ label="Opened" value={instant(card.openedAt)} />
          <Detail_ label="In this stage since" value={instant(card.stageChangedAt)} />
          {closed ? <Detail_ label="Closed" value={instant(card.closedAt!)} /> : null}
        </dl>
      </section>

      <section style={{ marginTop: primitive.space[6] }}>
        <H2>Move this job on</H2>
        {/*
          🔴 THE BRANCH IS ON THE DATA, NOT ON `closed`. Found by Codex, and it
          was reachable rather than theoretical: `closed_at` is stamped the
          moment a card reaches `completed`, and the lifecycle permits
          `completed → warranty_follow_up`. So a CLOSED card can legitimately
          carry a move. An earlier version of this screen tested `closed` first
          and told the viewer "this job is closed, so it has no next stage"
          while the API was offering warranty follow-up — a false statement
          that also HID a real action. `closed` now only chooses the WORDS for
          a card that genuinely has no move.
        */}
        {card.allowedStages.length === 0 ? (
          closed ? (
            // Every refusal names a reachable alternative (`05.txt` §2) — the
            // most expensive rule in this repo to get wrong.
            <Muted>
              This job is closed and has no further stage. A warranty claim on a closed job opens
              a NEW job card rather than reopening this one.
            </Muted>
          ) : (
            <Muted>
              There is no move available to your role from{' '}
              {STAGE_LABEL[card.stage] ?? card.stage}. A workshop manager or supervisor can move
              it on from the Repair Staging board.
            </Muted>
          )
        ) : (
          /**
           * ⚠️ NO OVERRIDE OPTION HERE, DELIBERATELY. `1.txt` §394's
           * authorised-and-logged bypass needs `viewer.canOverride` and
           * `viewer.roleStages`, which only `GET /job-cards/board` returns —
           * `findById` returns neither. Passing an empty `overrideStages` is
           * therefore honest rather than lossy: this screen offers the ordinary
           * moves, and the board remains the place an override is authorised.
           * Inventing the list client-side would offer moves the API would then
           * refuse.
           */
          <StageMoveForm
            jobCardId={card.id}
            jobNumber={card.jobNumber}
            currentStage={card.stage}
            allowedStages={card.allowedStages}
            stageLabels={STAGE_LABEL}
          />
        )}
      </section>

      <section style={{ marginTop: primitive.space[6] }}>
        <H2>Records against this job</H2>
        {/*
          NAMED, NOT LINKED, AND NOT FAKED. Inspections, diagnoses, repair
          plans, quotations and executions all exist and all have their own
          screens reached from their own queues — but each of those screens is
          entered with a queue's context, and `05.txt` §2 forbids rendering
          five section headings with nothing behind them. Saying where the work
          lives is true and useful; five dead tabs would be neither.
        */}
        <Muted>
          Inspections, diagnoses, repair plans, quotations and execution records are recorded on
          their own screens, reached from the matching queue in the menu. They are not shown here
          yet.
        </Muted>
      </section>

      <p style={{ marginTop: primitive.space[8] }}>
        <Link href={listHref} style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
          ‹ Back to job cards
        </Link>
      </p>
    </>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: primitive.fontSize.lg,
        margin: `0 0 ${primitive.space[3]}`,
        color: themeVar.textPrimary,
      }}
    >
      {children}
    </h2>
  );
}

/** Trailing underscore: `Detail` is already the data component above. */
function Detail_({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>{label}</dt>
      <dd style={{ margin: `${primitive.space[1]} 0 0`, color: themeVar.textPrimary }}>{value}</dd>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: 0, color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
      {children}
    </p>
  );
}
