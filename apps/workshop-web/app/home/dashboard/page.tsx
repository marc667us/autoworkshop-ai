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
 * The figures below are DEMO DATA and are labelled as such on screen. Phase 5
 * replaces them with real job-card and staging-board queries. Labelling fake
 * numbers is not decoration: an unlabelled demo dashboard is indistinguishable
 * from a real one that is silently returning wrong figures.
 */

const tiles = [
  { label: 'Active job cards', value: 12, kind: 'active' as const, hint: 'On the staging board now' },
  { label: 'Awaiting approval', value: 2, kind: 'attention' as const, hint: 'Customer proposals pending' },
  { label: 'New complaints', value: 4, kind: 'attention' as const, hint: 'Received today' },
  { label: 'Ready for collection', value: 3, kind: 'complete' as const, hint: 'Passed quality control' },
  { label: 'Reorder alerts', value: 2, kind: 'blocked' as const, hint: 'Parts below minimum stock' },
  { label: 'Appointments today', value: 6, kind: 'active' as const, hint: 'Across 4 service bays' },
];

function Tile({ label, value, kind, hint }: (typeof tiles)[number]) {
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

  return (
    <>
      <PageHeader
        title={nav.pageTitle}
        description="Today at Demo Motors Ltd — Accra Main"
        actions={<StatusBadge kind="draft" label="Demo data — not yet wired to the API" />}
      />

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
