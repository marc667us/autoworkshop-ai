import { notFound } from 'next/navigation';
import { PageHeader, EmptyState, StatusBadge } from '@autoworkshop/ui';
import {
  getWorkspace,
  visibleGroups,
  withPackBase,
  workspaceForRole,
  type PermissionKey,
} from '@autoworkshop/navigation';
import { viewerRole, currentViewer } from './viewer';
import { isForeignToWorkspace } from './viewer-contract';
import { themeVar, primitive } from '@autoworkshop/design-tokens';

/**
 * The shared "screen not built yet" page behind each workspace's catch-all
 * route.
 *
 * WHY IT IS HONEST RATHER THAN A MOCK. `05.txt` §2 explicitly prohibits
 * "disconnected mock pages". A convincing fake screen gets demoed, believed,
 * and then discovered to be empty at the worst possible moment. This page says
 * what is true: the navigation, routing and breadcrumbs around this screen
 * work; the screen's own content is scheduled.
 *
 * The nav tree doubles as the route allow-list — a path that is not in it
 * returns a real 404, so a typo in a link cannot be masked by a friendly
 * placeholder.
 *
 * PERMISSIONS — READ THIS BEFORE WIRING A REAL SCREEN.
 * The catch-all resolves against the grant-FILTERED tree, so a module the
 * viewer cannot see returns 404 rather than a placeholder naming it. That
 * closes the enumeration hole where hiding a nav entry was the only thing
 * standing between a user and the knowledge that a module exists.
 *
 * It is NOT, and must never be mistaken for, an authorization control. Directive
 * §8: "Hidden ≠ secure". Since T-0005 `grants` originate in a validated Keycloak
 * session rather than a demo array, which makes them ACCURATE — it does not make
 * them enforcing. Real enforcement is the API's tenant guard plus Postgres RLS,
 * which deny independently; this filter only decides what the UI admits exists.
 * No screen may rely on it to protect data.
 *
 * The default remains `[]` and not "everything": a caller that forgets to pass
 * grants must show the ungated modules only. Widening that default is a security
 * change, not a convenience.
 *
 * As each screen is genuinely built it gets `app/<group>/<item>/page.tsx`,
 * which Next resolves ahead of the catch-all. No migration, no cleanup.
 */

export async function renderModulePage(
  workspaceId: string,
  slug: string[] | undefined,
  /**
   * The viewer's grants. Defaults to none: an unauthenticated render must see
   * the ungated modules only, never the full tree. Widening this default is a
   * security change, not a convenience.
   */
  grants: readonly PermissionKey[] = [],
) {
  const base = getWorkspace(workspaceId);
  if (!base) notFound();

  // Resolve the ROLE tree from the same function the shell's layout uses
  // (T-0027). Reading `base.groups` here while the shell rendered a role tree
  // would put the menu and the router back on different maps — defect 3, one
  // layer up: every route the technician's menu advertises would 404.
  //
  // Since T-0005 this is a session read, so it is awaited. It resolves to the
  // SAME viewer the layout saw: `viewerRole` is memoised per request with
  // React's `cache()`, which is what keeps one render from resolving two
  // identities.
  // 🔴 A ROLE FROM ANOTHER WORKSPACE IS REFUSED BEFORE THE TREE IS CONSULTED —
  // THE SAME CHECK, AND FOR THE SAME REASON, AS `requireNavRoute`.
  //
  // This is the CATCH-ALL, and it was the half of the 45-screen leak that the
  // first fix missed. Concrete pages call `requireNavRoute`; every route with no
  // concrete page — `/home/calendar` among them — falls through to here
  // instead, and here `viewerRole()` returns `undefined` for a customer, so
  // `workspaceForRole` handed back the workshop DEFAULT staff tree exactly as
  // before. Gating only the concrete pages fixed the routes that HAVE a page and
  // left the placeholders wide open.
  //
  // Caught by Codex, and worth recording precisely because my own regression
  // test would have stayed green through it: the test exercised the predicate
  // and the raw tree, never this function. A check that walks past the gap it
  // was written for is the recurring failure in this repository, and this is
  // another instance.
  // ⚠️ SCOPED TO THE WORKSPACE BEING RENDERED — see `isForeignToWorkspace`.
  // Unscoped, this refused every non-workshop role on its OWN app, which for
  // fleet-web meant the dashboard 404'd the instant registration succeeded.
  if (isForeignToWorkspace(workspaceId, (await currentViewer(workspaceId))?.activeRole))
    notFound();

  const workspace = workspaceForRole(base, await viewerRole(workspaceId));

  // ADR-021: `params.slug` holds the segments AFTER the pack's mount point, so
  // Next hands this an UNMOUNTED path while `visibleGroups` returns mounted
  // hrefs. Same symmetry as `requireNavRoute`, same silent failure if dropped —
  // nothing would resolve and every catch-all route would render the not-found
  // branch.
  const pathname = withPackBase(workspaceId, '/' + (slug ?? []).join('/'));
  // Resolve against the filtered tree, not `workspace.groups` — otherwise a
  // module hidden from the side nav is still reachable by typing its URL.
  const groups = visibleGroups(workspace, grants);
  const group = groups.find((g) => g.items.some((i) => i.href === pathname));
  const item = group?.items.find((i) => i.href === pathname);
  if (!group || !item) notFound();

  // Everything else in this group the viewer may see. Taken from the FILTERED
  // tree, so a module hidden from this viewer cannot be named here — the same
  // rule that makes an unpermitted route 404 rather than render a placeholder
  // that reveals it exists.
  const siblings = group.items.filter((i) => i.href !== pathname);

  return (
    <>
      <PageHeader
        title={item.label}
        description={`${group.label} · ${workspace.label} workspace`}
        actions={<StatusBadge kind="draft" label="Not built yet" />}
      />

      <EmptyState
        title={`${item.label} has not been built yet`}
        description="The navigation, routing and breadcrumbs for this screen are working — the screen's own content is scheduled for a later phase. Access control arrives with this module's own API, which enforces it server-side."
      />

      {/*
        ⚠️ THE SIBLINGS ARE REAL DATA, NOT DECORATION, AND NOT A MOCK.
        `05.txt` §2 prohibits disconnected mock pages, so nothing invented may
        appear here. Every entry below comes from the SAME grant-filtered tree
        that decided this page may be shown at all — so it can never advertise a
        module the viewer is not permitted to see, and every link resolves
        (either to a built screen or to this same honest placeholder).

        It exists because the page was previously a DEAD END: the one thing a
        person reliably wants on reaching an unbuilt screen is the nearest thing
        that does work, and the side nav is the only route to it. On a phone
        that nav is behind a menu button.
      */}
      {siblings.length > 0 && (
        <nav
          aria-labelledby="aw-module-siblings"
          style={{
            border: `1px solid ${themeVar.borderDefault}`,
            borderRadius: primitive.radius.lg,
            padding: primitive.space[4],
            background: themeVar.backgroundSecondary,
            marginBottom: primitive.space[4],
          }}
        >
          <h2
            id="aw-module-siblings"
            style={{
              margin: `0 0 ${primitive.space[2]} 0`,
              fontSize: primitive.fontSize.base,
              color: themeVar.textPrimary,
            }}
          >
            Elsewhere in {group.label}
          </h2>
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(14rem, 1fr))',
              gap: primitive.space[2],
            }}
          >
            {siblings.map((s) => (
              <li key={s.href}>
                {/* A plain anchor, not next/link: these are cross-module
                    navigations out of a page that renders nothing, so there is
                    no client state worth preserving and a full document load is
                    the more predictable behaviour. */}
                <a
                  href={s.href}
                  style={{
                    display: 'block',
                    padding: primitive.space[2],
                    borderRadius: primitive.radius.md,
                    border: `1px solid ${themeVar.borderDefault}`,
                    color: themeVar.textPrimary,
                    textDecoration: 'none',
                    fontSize: primitive.fontSize.sm,
                  }}
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <section
        style={{
          border: `1px solid ${themeVar.borderDefault}`,
          borderRadius: primitive.radius.lg,
          padding: primitive.space[4],
          background: themeVar.backgroundSecondary,
          fontSize: primitive.fontSize.sm,
          color: themeVar.textSecondary,
        }}
      >
        {/* Route and group ids only. The required permission name is
            deliberately NOT printed: the viewer already passed the filter to
            reach this page, so it tells them nothing they need, and publishing
            the permission taxonomy hands an attacker a map of the authorization
            model for free. */}
        <p style={{ margin: 0 }}>
          Route <code>{pathname}</code> · group <code>{group.id}</code> · item <code>{item.id}</code>
        </p>
      </section>
    </>
  );
}
