import { Suspense } from 'react';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState, StatusBadge, visuallyHidden } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { navLabelFor } from './nav-label';
import { StageMoveForm } from './stage-move-form';

/**
 * The Repair Staging Board — `02.txt` §29.
 *
 * "The Repair Staging Board shall use columns representing workflow stages."
 *
 * ── THE COLUMNS COME FROM THE API ──────────────────────────────────────────
 *
 * §29's column list is a business definition, and several stages share one
 * column, so the mapping lives in `job-card-stages.ts` beside the transition
 * rules and arrives with the data. A copy here would be a second statement of
 * the same rule, free to drift — and drifting invisibly, because a card whose
 * stage maps to no column silently vanishes from the board while remaining live
 * work.
 *
 * ── WHY NOT DRAG AND DROP ──────────────────────────────────────────────────
 *
 * §29 says "drag-and-drop movement shall not bypass business rules. The backend
 * shall validate every stage change." It constrains drag-and-drop; it does not
 * require it. What ships here is a native `<select>` and a submit button per
 * card, for the same reason the organisation switcher is a native `<select>`:
 * it is keyboard-accessible and screen-reader-addressable without focus
 * plumbing, and it works with JavaScript disabled. Drag-and-drop can be layered
 * on later over the identical validated endpoint — the rules are in
 * `JobCardService.changeStage`, so it would gain nothing by being dragged.
 *
 * ── WHAT §29 ASKS FOR THAT DOES NOT EXIST YET ──────────────────────────────
 *
 * §29 wants each card to show parts status, payment status and approval status.
 * There are no parts, payments or approvals in this build — those are Phases 6
 * and 7. `05.txt` §2 forbids disconnected mock pages, so this board does NOT
 * render three invented badges: it names them as not built, once, beneath the
 * board. An empty "Parts: —" on every card would read as "no parts needed".
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
  expectedCompletionOn: string | null;
  openedAt: string;
  stageChangedAt: string;
  allowedStages: string[];
}

interface BoardColumn {
  key: string;
  label: string;
  stages: string[];
}

interface Board {
  columns: BoardColumn[];
  cards: JobCard[];
  viewer: {
    /** `1.txt` §394 — whether this viewer may authorise a bypass at all. */
    canOverride: boolean;
    /** Every stage this viewer's ROLE may produce (07 pt2 §50). */
    roleStages: string[];
  };
}

/** Shared with the job cards list — the same stage, spelled the same way. */
export const STAGE_LABEL: Record<string, string> = {
  complaint_received: 'Complaint received',
  appointment_confirmed: 'Appointment confirmed',
  vehicle_received: 'Vehicle received',
  initial_inspection: 'Initial inspection',
  diagnosis_in_progress: 'Diagnosis in progress',
  further_information_required: 'Further information required',
  solution_preparation: 'Solution preparation',
  quotation_preparation: 'Quotation preparation',
  awaiting_customer_approval: 'Awaiting customer approval',
  awaiting_deposit: 'Awaiting deposit',
  awaiting_parts: 'Awaiting parts',
  authorized_to_start: 'Authorized to start',
  repair_in_progress: 'Repair in progress',
  specialist_consultation: 'Specialist consultation',
  testing: 'Testing',
  quality_control: 'Quality control',
  ready_for_collection: 'Ready for collection',
  completed: 'Completed',
  warranty_follow_up: 'Warranty follow-up',
  on_hold: 'On hold',
};

const PRIORITY_KIND: Record<string, 'active' | 'attention' | 'blocked' | 'draft'> = {
  low: 'draft',
  normal: 'active',
  high: 'attention',
  urgent: 'blocked',
};

/**
 * How long the card has sat in its current stage — §29's "Elapsed time".
 *
 * Measured from `stage_changed_at` (migration 007), never from `updated_at`,
 * which any edit resets. Rendered in whole days and hours because that is the
 * granularity the question is asked at: nobody looks at a staging board to
 * learn that a job moved 43 minutes ago.
 */
function elapsed(since: string, now: number): { label: string; days: number } {
  const ms = Math.max(0, now - new Date(since).getTime());
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days >= 1) return { label: `${days}d ${hours % 24}h in stage`, days };
  if (hours >= 1) return { label: `${hours}h in stage`, days };
  return { label: 'moved just now', days };
}

export async function StagingBoardScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Repair Staging');

  return (
    <>
      <PageHeader
        title={title}
        description="Every open repair by workflow stage. A card shows how long it has waited where it is; the moves offered are the ones your role may actually make."
      />
      <Suspense fallback={<LoadingState label="Loading the staging board…" />}>
        <Board />
      </Suspense>
    </>
  );
}

async function Board() {
  const result = await apiGet<Board>('workshop', '/job-cards/board');

  if (!result.ok) {
    return <ApiFailure reason={result.reason} workspaceId="workshop" />;
  }

  const { columns, cards, viewer } = result.data;

  if (cards.length === 0) {
    return (
      <EmptyState
        title="No job cards on the board"
        description="A job card appears here as soon as a vehicle is booked in or a customer reports a problem."
      />
    );
  }

  // Read the clock ONCE for the whole render. Calling it per card would make
  // two cards that entered a stage at the same moment show different ages.
  const now = Date.now();

  const byColumn = columns.map((column) => ({
    ...column,
    cards: cards.filter((c) => column.stages.includes(c.stage)),
  }));

  return (
    <>
      {/*
        Horizontal scroll on the BOARD, never on the page body. A staging board
        is wider than any screen by nature — 15 columns — and letting that push
        the document sideways breaks every other element on the page.
      */}
      <div
        style={{
          overflowX: 'auto',
          paddingBottom: primitive.space[3],
          // ⚠️ `overflowX: auto` ALONE DOES NOT CONTAIN THIS. Measured: the
          // document scrolled to 4906px against a 1280px viewport while the job
          // cards and customer pages stayed at 1280. A flex/grid ancestor sizes
          // this box to its CONTENT unless it is told not to, so the scroll
          // container itself grew and the whole page scrolled sideways instead
          // of the board. `minWidth: 0` is the half that actually does the work
          // — it lets the box shrink below its content's intrinsic width.
          maxWidth: '100%',
          minWidth: 0,
        }}
      >
        <ul
          style={{
            display: 'flex',
            gap: primitive.space[3],
            alignItems: 'flex-start',
            listStyle: 'none',
            margin: 0,
            padding: 0,
            minWidth: 'min-content',
          }}
        >
          {byColumn.map((column) => (
            <li
              key={column.key}
              style={{
                flex: '0 0 17rem',
                background: themeVar.backgroundSecondary,
                border: `1px solid ${themeVar.borderDefault}`,
                borderRadius: primitive.radius.lg,
                padding: primitive.space[3],
                // Same reason as the card below: the column heading carries a
                // `visuallyHidden` count, and an absolutely positioned child
                // with no positioned ancestor escapes the scroll container.
                position: 'relative',
              }}
            >
              <h2
                style={{
                  fontSize: primitive.fontSize.sm,
                  fontWeight: 600,
                  color: themeVar.textPrimary,
                  margin: `0 0 ${primitive.space[2]} 0`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: primitive.space[2],
                }}
              >
                {column.label}
                {/* The count is written out for a screen reader rather than left
                    as a bare number beside a heading. */}
                <span style={{ color: themeVar.textSecondary, fontWeight: 400 }}>
                  <span aria-hidden="true">{column.cards.length}</span>
                  {/* `visuallyHidden`, NOT `className="sr-only"` — nothing in
                      this repo defines that class, so it rendered the count
                      twice on screen as "11 job card". */}
                  <span style={visuallyHidden}>
                    {column.cards.length} job card{column.cards.length === 1 ? '' : 's'}
                  </span>
                </span>
              </h2>

              {column.cards.length === 0 ? (
                <p style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm, margin: 0 }}>
                  Nothing here.
                </p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: primitive.space[2] }}>
                  {column.cards.map((card) => (
                    <li key={card.id}>
                      <Card card={card} now={now} viewer={viewer} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/*
        `05.txt` §2 forbids mock UI. §29 asks for parts, payment and approval
        status on every card; none of those records exist in this build, so they
        are NAMED here rather than rendered as empty badges that would read as
        "nothing outstanding".
      */}
      <p
        style={{
          marginTop: primitive.space[4],
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.sm,
        }}
      >
        Parts, payment and approval status are not shown: those records are not built yet (Phases 6
        and 7). Every other field on a card is live data.
      </p>
    </>
  );
}

function Card({
  card,
  now,
  viewer,
}: {
  card: JobCard;
  now: number;
  viewer: Board['viewer'];
}) {
  /**
   * The override menu: stages this role may produce that are NOT a legal next
   * step from where the card is, minus the stage it is already at.
   *
   * Derived rather than sent per card because it is pure set arithmetic over
   * two lists the API already supplied — and both of those come FROM the rule
   * tables, so nothing here restates a rule. If `canOverride` is false the list
   * is empty and the group never renders.
   */
  const overrideStages = viewer.canOverride
    ? viewer.roleStages.filter((s) => s !== card.stage && !card.allowedStages.includes(s))
    : [];

  const age = elapsed(card.stageChangedAt, now);
  // A week in one stage is the thing a manager is scanning for. §29 asks for
  // "warning indicators"; this is the one the data can honestly support today.
  const stalled = age.days >= 7;

  return (
    <article
      style={{
        background: themeVar.backgroundPrimary,
        // The only border token in the palette is `borderDefault`; a stalled
        // card is marked with a primitive red instead of an invented semantic
        // token. Never the ONLY signal — the words "Stalled" carry it (§66).
        border: stalled
          ? `2px solid ${primitive.color.red[500]}`
          : `1px solid ${themeVar.borderDefault}`,
        borderRadius: primitive.radius.md,
        padding: primitive.space[3],
        display: 'grid',
        gap: primitive.space[2],
        // ⚠️ LOAD-BEARING, not cosmetic. The card holds `visuallyHidden`
        // labels, which are `position: absolute`. With no positioned ancestor
        // they resolve against the INITIAL CONTAINING BLOCK — so a hidden label
        // on a card 4000px along the board was laid out 4000px from the
        // viewport's left edge, escaping the scroll container and stretching
        // <html> to 4906px. Measured: `document.body.scrollWidth` stayed 1280
        // while `documentElement.scrollWidth` was 4906, which is the signature
        // of an element escaping the flow rather than content being too wide.
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: primitive.space[2] }}>
        <span style={{ fontFamily: primitive.fontFamily.mono, fontWeight: 600, color: themeVar.textPrimary }}>
          {card.jobNumber}
        </span>
        <StatusBadge kind={PRIORITY_KIND[card.priority] ?? 'draft'} label={card.priority} />
      </div>

      <div style={{ fontSize: primitive.fontSize.sm, color: themeVar.textPrimary }}>
        <span style={{ fontFamily: primitive.fontFamily.mono }}>{card.registrationNumber}</span>{' '}
        <span style={{ color: themeVar.textSecondary }}>{card.vehicleDescription}</span>
      </div>

      <div style={{ fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
        {card.customerName}
      </div>

      <div style={{ fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
        {/* "Unassigned" rather than a dash: it is a state someone must act on. */}
        {card.assignedTechnicianName ?? 'Unassigned'}
      </div>

      <div style={{ fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
        {/* Colour is never the only signal (§66) — the warning is words. */}
        {stalled ? <strong style={{ color: themeVar.textPrimary }}>Stalled — {age.label}</strong> : age.label}
      </div>

      <StageMoveForm
        jobCardId={card.id}
        jobNumber={card.jobNumber}
        currentStage={card.stage}
        allowedStages={card.allowedStages}
        overrideStages={overrideStages}
        stageLabels={STAGE_LABEL}
      />
    </article>
  );
}
