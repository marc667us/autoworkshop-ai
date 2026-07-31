import { apiGet } from '@autoworkshop/next-shell';
import { PageHeader, StatusBadge } from '@autoworkshop/ui';
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

function Tile({ label, value, kind, hint }: TileSpec) {
  return (
    <div
      style={{
        border: `1px solid ${themeVar.borderDefault}`,
        borderRadius: primitive.radius.lg,
        padding: primitive.space[4],
        background: themeVar.surfaceRaised,
        display: 'flex',
        flexDirection: 'column',
        gap: primitive.space[2],
      }}
    >
      <span style={{ fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>{label}</span>
      <span style={{ fontSize: primitive.fontSize['3xl'], fontWeight: 600, color: themeVar.textPrimary }}>{value}</span>
      {/* Colour is never the only signal (§66) — every tile carries a text label too. */}
      <StatusBadge kind={kind} label={hint} />
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

      <section
        aria-label="About this build"
        style={{
          border: `1px solid ${themeVar.borderDefault}`,
          borderRadius: primitive.radius.lg,
          padding: primitive.space[4],
          background: themeVar.backgroundSecondary,
        }}
      >
        <h2 style={{ margin: 0, fontSize: primitive.fontSize.lg, color: themeVar.textPrimary }}>
          What is real in this build
        </h2>
        <ul style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm, lineHeight: 1.7 }}>
          <li>
            {/* DERIVED for the same reason as the permissions line below: the
                counts used to be written out as "11 groups, 55 items" and went
                wrong the moment T-0027 gave this workspace a per-role tree. */}
            <strong>Navigation is real and complete.</strong> Every group and item is transcribed from the
            approved specification — <code>autoworkshop 01 (1).txt</code> §34 for the workspace, and{' '}
            <code>autoworkshop 07.txt</code> part 2 §46–§49 for the four workshop roles. You are seeing the{' '}
            <strong>{nav.roleLabel}</strong> navigation: {nav.groupCount} groups, {nav.itemCount} items.
            Expand, collapse, search the menu, and collapse the whole sidebar from the ☰ button.
          </li>
          <li>
            {/* DERIVED, never restated. This sentence used to name the granted
                permissions as literal text, and it went false the moment the
                demo grants changed — describing visible finance items that were
                by then correctly hidden. A page that explains the permission
                model must read the permission model, or it becomes confident
                misinformation. Same lesson as the nav/router grants split. */}
            <strong>Permission-aware visibility is real.</strong>{' '}
            {nav.grants.length === 0 ? (
              <>
                {/* The signed-out wording is not a nicety. The old sentence read
                    "This viewer holds , so only the groups those grants unlock
                    are listed" once the grants became genuinely empty — a
                    dangling clause that describes nothing. An empty grant list
                    is now the common case, not an edge one: it is what every
                    visitor sees before signing in. */}
                This viewer holds <strong>no permission grants</strong>, because nobody is signed in.
                Only ungated modules are listed; everything gated is absent from the menu
              </>
            ) : (
              <>
                This viewer holds{' '}
                {nav.grants.map((grant, i, all) => (
                  <span key={grant}>
                    <code>{grant}</code>
                    {i < all.length - 1 ? ' and ' : ''}
                  </span>
                ))}
                , so only the groups those grants unlock are listed. Modules gated behind any other
                permission — the finance items among them — are absent from the menu
              </>
            )}{' '}
            <em>and</em> answer 404 if their URL is typed directly.
          </li>
          <li>
            <strong>Counters and warning badges are real mechanics, fake numbers.</strong> They resolve through the
            same code path the API will use.
          </li>
          <li>
            <strong>Page content is not built yet.</strong> Every other route renders an honest “not built” page
            rather than a convincing mock — Phases 4–7 fill them in.
          </li>
        </ul>
      </section>
    </>
  );
}
