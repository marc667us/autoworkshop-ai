import { notFound } from 'next/navigation';
import { PageHeader, EmptyState, StatusBadge } from '@autoworkshop/ui';
import { getWorkspace, visibleGroups, type PermissionKey } from '@autoworkshop/navigation';
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
 * §8: "Hidden ≠ secure". `grants` arrives from the caller, and until the Keycloak
 * session is wired into these apps (Phase 2, T-0005) that caller passes an empty
 * array — which is why the default is `[]` and not "everything". Real enforcement
 * is the API's tenant guard plus Postgres RLS; this filter only decides what the
 * UI admits exists. No screen may rely on it to protect data.
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
  const workspace = getWorkspace(workspaceId);
  if (!workspace) notFound();

  const pathname = '/' + (slug ?? []).join('/');
  // Resolve against the filtered tree, not `workspace.groups` — otherwise a
  // module hidden from the side nav is still reachable by typing its URL.
  const groups = visibleGroups(workspace, grants);
  const group = groups.find((g) => g.items.some((i) => i.href === pathname));
  const item = group?.items.find((i) => i.href === pathname);
  if (!group || !item) notFound();

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
