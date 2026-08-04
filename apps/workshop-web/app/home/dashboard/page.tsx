import { apiGet, registrationStatus, needsWorkshop, viewerHasSession } from '@autoworkshop/next-shell';
import { CreateWorkshopScreen } from '../../_screens/create-workshop-screen';
import { PageHeader } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { currentViewer, grantsFor, navRoleFor, requireNavRoute } from '@autoworkshop/next-shell';
import { getWorkspace, visibleGroups, workspaceForRole } from '@autoworkshop/navigation';

/**
 * Everything this page says about the navigation is COMPUTED from the model it
 * is describing, never restated. Both facts below were previously written out
 * by hand and both went false the moment the model changed — the group/item
 * counts when T-0027 introduced per-role trees, and the granted-permission list
 * when the demo grants were narrowed. A page whose job is to explain the system
 * has to read the system.
 *
 * ⚠️ THIS RUNS PER REQUEST AND MUST NOT MOVE BACK TO MODULE SCOPE.
 *
 * Every value below used to be a module-level `const`. That worked only while
 * the viewer was a hardcoded demo: module scope is evaluated ONCE, when Next
 * first loads the route, so with a real session the first visitor's role and
 * grants would have been baked in and served to every subsequent visitor —
 * including a signed-out one, and including across users. A dashboard that
 * describes somebody else's permissions is worse than one that describes none.
 *
 * The `!` on `getWorkspace('workshop')` is safe for the same reason it always
 * was: this file only exists inside the workshop app.
 */
const THIS_ROUTE = '/home/dashboard';

async function describeNavigation() {
  const viewer = await currentViewer('workshop');
  const role = navRoleFor(viewer?.activeRole);
  const visible = visibleGroups(
    workspaceForRole(getWorkspace('workshop')!, role),
    grantsFor(viewer),
  );

  return {
    grants: grantsFor(viewer),
    /**
     * 🔴 WHETHER THERE IS A SESSION, read directly rather than INFERRED from an
     * empty grant list. The copy below used to reason "no grants, therefore
     * nobody is signed in" — and a signed-in TECHNICIAN holds no grants today
     * (viewerGrants() still carries its demo body, T-0003), so the dashboard
     * told a technician who had just signed in that nobody was signed in.
     *
     * Exactly the family of defect that produced "Not signed in" beside a
     * working "Sign out" twice already: a truth about A used as evidence for B.
     *
     * ⚠️ `viewerHasSession`, NOT `currentViewer() !== null`. The first fix used
     * the viewer, and `currentViewer()` returns null when `/me` FAILS — so an
     * API outage would have restored the exact same lie through a different
     * door. The session cookie is the thing being asserted, so read it.
     * (Codex, 2026-08-04.)
     */
    signedIn: await viewerHasSession('workshop'),
    groupCount: visible.length,
    itemCount: visible.reduce((n, g) => n + g.items.length, 0),
    roleLabel: role ? `${role} role` : 'workspace default',
    /**
     * This page's own title, taken from the navigation entry that points at it.
     *
     * A concrete `page.tsx` takes precedence over the catch-all, so this route
     * is the one place where the header text is written by hand instead of
     * being derived from the nav item — and it promptly disagreed with it: the
     * technician tree calls `/home/dashboard` "Technician Dashboard" while the
     * header said "Workshop Dashboard", so the menu, the breadcrumb and the
     * heading named the same screen three ways. Reading the label from the
     * model removes the second source rather than syncing it.
     */
    pageTitle:
      visible.flatMap((g) => g.items).find((i) => i.href === THIS_ROUTE)?.label ??
      'Workshop Dashboard',
  };
}

/**
 * Workshop dashboard — §18, the default landing page for the workspace.
 *
 * ⚠️ THE FIGURES WERE DEMO DATA UNTIL 2026-07-31 AND ARE NOW REAL, computed
 * from `GET /job-cards` — the same endpoint and therefore the same tenant
 * scoping the staging board uses. The old note said Phase 5 would replace them;
 * Phase 5 has landed, so it has.
 *
 * ⚠️ EVERY TILE IS DERIVED FROM A STAGE THAT ACTUALLY EXISTS in
 * `BOARD_COLUMNS`. Tiles whose data this product cannot yet answer were
 * REMOVED rather than left showing an invented number: "Reorder alerts" needed
 * stock levels and "Appointments today" needed a scheduling module, and neither
 * exists. A dashboard that keeps a fake tile beside five real ones is worse
 * than one that had six fakes, because nothing on it tells you which is which.
 *
 * The counts narrow with the viewer, because `list` does: staff see the
 * organisation, a technician sees only cards assigned to them. That is the
 * property worth having — no dashboard-only query that could drift from the
 * board's own scoping.
 */

/** Stages that mean a job is live work rather than finished or parked. */
const OPEN_STAGES = new Set([
  'complaint_received', 'appointment_confirmed', 'vehicle_received',
  'initial_inspection', 'diagnosis_in_progress', 'further_information_required',
  'solution_preparation', 'quotation_preparation', 'specialist_consultation',
  'awaiting_customer_approval', 'awaiting_deposit', 'awaiting_parts',
  'authorized_to_start', 'repair_in_progress', 'testing', 'quality_control',
]);

interface JobCardRow {
  id: string;
  stage: string;
}

type TileSpec = {
  label: string;
  value: number;
  kind: 'active' | 'attention' | 'complete' | 'blocked';
  hint: string;
};

/**
 * A KPI tile.
 *
 * ── WHAT WAS WRONG WITH THE OLD ONE ─────────────────────────────────────────
 *
 * It ended in a `StatusBadge`, which is an OUTLINED PILL stretched to the width
 * of the card. Screenshotted at 1440px it read as a disabled text input sitting
 * under the number — six of them down the dashboard, each looking like a form
 * field nobody could type in. A badge is right for a status inside a table row,
 * where it is one short word among others; as the caption of a headline figure
 * it is the loudest thing on the card and says the least.
 *
 * The caption is now a caption: a small coloured dot carrying the §66 status
 * hue, then the sentence in secondary text. Colour is still never the only
 * signal — the words are the signal, and the dot only tints them.
 *
 * ── THE ACCENT BAR ──────────────────────────────────────────────────────────
 *
 * A 3px rule down the left edge in the status colour. It gives the row of tiles
 * a rhythm and lets somebody scan for the red one without reading six labels —
 * the thing a workshop owner actually does with a dashboard.
 */
const KIND_VAR: Record<TileSpec['kind'], string> = {
  active: 'var(--aw-status-active)',
  complete: 'var(--aw-status-complete)',
  attention: 'var(--aw-status-attention)',
  blocked: 'var(--aw-status-blocked)',
};

function Tile({ label, value, kind, hint }: TileSpec) {
  const accent = KIND_VAR[kind];
  return (
    <div
      style={{
        position: 'relative',
        border: `1px solid ${themeVar.borderDefault}`,
        borderRadius: primitive.radius.xl,
        // The accent rule, drawn as a thick left border so it follows the
        // card's own radius instead of needing a pseudo-element.
        borderLeft: `3px solid ${accent}`,
        padding: `${primitive.space[4]} ${primitive.space[5]}`,
        background: themeVar.surfaceRaised,
        display: 'flex',
        flexDirection: 'column',
        gap: primitive.space[1],
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
        minHeight: '7.5rem',
      }}
    >
      <span
        style={{
          fontSize: primitive.fontSize.xs,
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: themeVar.textSecondary,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: '2.25rem',
          fontWeight: 700,
          lineHeight: 1.1,
          color: themeVar.textPrimary,
          // Tabular figures so a column of counts lines up digit for digit
          // instead of shuffling as the numbers change.
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
      {/* §66 still holds: the hue is carried by a dot, and the WORDS carry the
          meaning. A reader who cannot distinguish the colours loses nothing. */}
      <span
        style={{
          marginTop: 'auto',
          display: 'inline-flex',
          alignItems: 'center',
          gap: primitive.space[2],
          fontSize: primitive.fontSize.sm,
          color: themeVar.textSecondary,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: '0.5rem',
            height: '0.5rem',
            borderRadius: '999px',
            background: accent,
            flexShrink: 0,
          }}
        />
        {hint}
      </span>
    </div>
  );
}

export default async function Dashboard() {

  // FIRST STATEMENT. Behaviour-neutral TODAY — `/home/dashboard` appears in the
  // workspace default tree and in all four role trees, so nobody who can reach
  // this app is refused by it. It is here because this is a CONCRETE page, which
  // Next resolves ahead of the catch-all, so it carries no route check of its
  // own unless it makes one (T-0005 finding 4). The day a role tree drops the
  // dashboard, this page would otherwise stay reachable by URL and nothing would
  // have said so.
  //
  // The route is written as a LITERAL rather than `THIS_ROUTE`, which is less
  // DRY on purpose: `check-page-gates.sh` derives the expected path from the
  // file's own location and matches it in the source, so that a page copied into
  // a new folder cannot keep the old gate. A constant would be opaque to that
  // check and would quietly turn the guardrail into a no-op for this file.
  await requireNavRoute('workshop', '/home/dashboard');

  // ⚠️ AFTER `requireNavRoute`, DELIBERATELY. The nav gate is documented as the
  // first statement before any data access, and onboarding is data access: it
  // asks the API who the caller is. A page that answered "create your
  // workshop" to somebody whose role tree does not contain this route would be
  // rendering content behind a gate it never opened.
  // THE ONBOARDING SCREEN LIVES HERE, NOT IN THE LAYOUT.
  //
  // It belongs on the page whose emptiness it explains. In the layout it
  // replaced EVERY page — including `/`, which is the public parts marketplace
  // and the free VIN search — so a signed-in account with no workshop asked for
  // the landing and was handed a form instead. A public front door that
  // disappears once you have an account is not a front door.
  //
  // Rendered IN PLACE rather than as a redirect: a redirect needs a second
  // condition on the onboarding route to send finished users back, and two
  // conditions are free to disagree. That is a redirect loop on the first
  // screen a new user reaches, escapable only by clearing cookies.
  if (await viewerHasSession('workshop')) {
    const registration = await registrationStatus('workshop');
    if (needsWorkshop(registration)) {
      return <CreateWorkshopScreen displayName={registration?.displayName} />;
    }
  }

  const nav = await describeNavigation();

  // REAL FIGURES. Same endpoint the staging board reads, so the counts inherit
  // its tenant and role scoping rather than re-deriving it here.
  const jobCards = await apiGet<JobCardRow[]>('workshop', '/job-cards');
  const cards = jobCards.ok ? jobCards.data : [];
  const count = (pred: (c: JobCardRow) => boolean) => cards.filter(pred).length;

  const tiles: TileSpec[] = [
    {
      label: 'Active job cards',
      value: count((c) => OPEN_STAGES.has(c.stage)),
      kind: 'active',
      hint: 'Live work on the board',
    },
    {
      label: 'Awaiting customer approval',
      value: count((c) => c.stage === 'awaiting_customer_approval'),
      kind: 'attention',
      hint: 'Quotation sent, no answer yet',
    },
    {
      label: 'New complaints',
      value: count((c) => c.stage === 'complaint_received'),
      kind: 'attention',
      // NOT "today" — the stage says a complaint is unprocessed, not when it
      // arrived, and claiming a timeframe the data does not carry is the same
      // defect as an invented number.
      hint: 'Received and not yet started',
    },
    {
      label: 'Ready for collection',
      value: count((c) => c.stage === 'ready_for_collection'),
      kind: 'complete',
      hint: 'Passed quality control',
    },
    {
      label: 'On hold',
      value: count((c) => c.stage === 'on_hold'),
      kind: 'blocked',
      hint: 'Parked — needs a decision',
    },
    {
      label: 'In quality control',
      value: count((c) => c.stage === 'quality_control'),
      kind: 'active',
      hint: 'Being checked before release',
    },
  ];

  return (
    <>
      <PageHeader
        title={nav.pageTitle}
        description="Live figures from the job-card board."
      />

      {/*
        ⚠️ SAYS SO WHEN IT COULD NOT ASK, rather than rendering six zeroes.
        Six zeroes is a claim — "you have no work" — and it is the wrong one
        when the truth is that the request failed. A quiet zero on a dashboard
        is how a workshop misses a job that is waiting.
      */}
      {!jobCards.ok && (
        <p
          role="alert"
          style={{
            border: `1px solid ${themeVar.borderDefault}`,
            borderRadius: primitive.radius.lg,
            padding: primitive.space[3],
            marginBottom: primitive.space[4],
            color: themeVar.textSecondary,
          }}
        >
          These figures could not be loaded, so every count below reads zero. That is a
          connection problem, not an empty workshop — open the job cards board to check.
        </p>
      )}

      <section
        aria-label="Key figures"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(15rem, 1fr))',
          gap: primitive.space[4],
        }}
      >
        {tiles.map((t) => (
          <Tile key={t.label} {...t} />
        ))}
      </section>

      {/*
        THE "What is real in this build" PANEL WAS REMOVED HERE (2026-08-05).
        It explained the navigation model, the permission grants and which
        counters were placeholders — genuinely useful to the people building
        this, and the first thing a workshop owner saw on their own dashboard.
        A build note is not product. What it documented lives in
        `docs/00-project/` and in this file's own comments, which is where a
        reader who needs it will look.
      */}
    </>
  );
}
