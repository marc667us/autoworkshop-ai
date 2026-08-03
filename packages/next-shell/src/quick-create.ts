import {
  getWorkspace,
  visibleGroups,
  workspaceForRole,
} from '@autoworkshop/navigation';
import { currentViewer, viewerRole } from './viewer';
import { grantsFor } from './viewer-contract';

/**
 * WHERE AN "ADD NEW …" BUTTON SHOULD POINT, FOR THE VIEWER LOOKING AT IT —
 * or `null`, meaning do not render the button at all.
 *
 * ── WHY THIS IS NOT A LOOKUP TABLE ─────────────────────────────────────────
 *
 * The five navigation trees put the same action in five different places:
 * `register-customer` is `/customers-and-vehicles/…` for the owner,
 * `/customer-reception/…` on the §34 default tree, `/requests-and-reception/…`
 * for the manager, `/customers/…` for reception — and the technician has no
 * such route at all. A hardcoded map of that is a SECOND statement of the
 * navigation model, free to drift from the first, and this repository has
 * already shipped exactly that bug: the nav advertised routes the router 404'd
 * because grants were decided in two places.
 *
 * So this resolves the href out of the viewer's OWN VISIBLE NAVIGATION, using
 * the same three functions in the same order as `requireNavRoute`. The button
 * and the gate therefore cannot disagree by construction — if the route is not
 * advertised to this viewer, there is no href, and the button does not render.
 *
 * ── AND IT RESPECTS PERMISSIONS, NOT ONLY ROLE ─────────────────────────────
 *
 * `visibleGroups` filters by grants, which matters here rather than being
 * theoretical: on the §34 default tree `register-customer` carries
 * `permission: 'organization.admin'`. A viewer on that tree WITHOUT the grant
 * would have been handed a button leading straight to a 404 — a dead primary
 * action, which is the precise failure the job-card queues were fixed for.
 *
 * ⚠️ THIS IS A UI CONVENIENCE, NEVER A CONTROL. Hiding a button hides nothing:
 * the target page calls `requireNavRoute` itself, and the API re-derives every
 * rule (CLAUDE.md §8 — hidden is not secure). What this prevents is offering an
 * action that cannot work, not an action that must not happen.
 *
 * @param slug the LAST path segment of the action, e.g. `register-customer`.
 *             Matched on the segment rather than the whole path precisely
 *             because the prefix is what differs per tree.
 */
export async function quickCreateHref(
  workspaceId: string,
  slug: string,
): Promise<string | null> {
  const base = getWorkspace(workspaceId);
  if (!base) return null;

  // Memoised per request by React's `cache()`, exactly as `requireNavRoute`
  // relies on — so this cannot resolve a different identity than the shell
  // rendering around it.
  const [viewer, role] = await Promise.all([
    currentViewer(workspaceId),
    viewerRole(workspaceId),
  ]);

  const groups = visibleGroups(workspaceForRole(base, role), grantsFor(viewer));

  const suffix = `/${slug}`;
  for (const group of groups) {
    for (const item of group.items) {
      if (item.href.endsWith(suffix)) return item.href;
    }
  }
  return null;
}
