import { cache } from 'react';
import type { PermissionKey, RoleId, WorkspaceId } from '@autoworkshop/navigation';
import { apiBaseUrl, workspaceAuth } from '@autoworkshop/auth';
import { grantsFor, navRoleFor, NO_GRANTS, type ViewerDescription } from './viewer-contract';

/**
 * WHO THE VIEWER IS — resolved from a validated Keycloak session (T-0005).
 *
 * This file is what the previous demo implementation promised would replace it:
 * "WHEN PHASE 2 LANDS, this is the one function to replace. Its body becomes a
 * read of the validated Keycloak claims and the viewer's membership records."
 * It now is. `viewerGrants()` no longer returns a fixed array to everybody, and
 * `viewerRole()` no longer hardcodes `technician` for the workshop app.
 *
 * SERVER ONLY. The access token is read from the encrypted session cookie and
 * used to call the API from the Next server. The browser never receives it, and
 * never receives the raw `/me` response either — only the shell rendered from
 * it. `1.txt` §9: the tenant identifier must never come from the client, and
 * here nothing does: the API derives tenant, organisation, branch, role and
 * permissions from the token subject plus membership records.
 *
 * STILL NOT A SECURITY CONTROL. These values decide which doors the UI admits
 * exist. Enforcement is the API's `TenantGuard` and Postgres RLS, which deny
 * independently of anything decided here. CLAUDE.md §8: "Hidden ≠ secure."
 */

/**
 * The `/me` call, deduplicated per request.
 *
 * `cache()` is React's per-request memo, not a time-based cache: a layout, a
 * page and a catch-all route all asking who the viewer is produce ONE HTTP call
 * per render, and the next request starts clean. Without it every navigation
 * would make three identical round trips to the API, and — worse — they could
 * disagree if a membership changed mid-render, which is precisely the nav/router
 * split that has already shipped once here.
 */
const fetchViewer = cache(async (workspaceId: string): Promise<ViewerDescription | null> => {
  const accessToken = await workspaceAuth(workspaceId).getAccessToken();
  // No session, or a session whose access token has expired without middleware
  // renewing it. Either way the viewer is unauthenticated for this render.
  if (!accessToken) return null;

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      // The viewer's role and permissions are per-request facts. Next caches
      // fetches by default; caching this one would serve one user's grants to
      // the next user who lands on the same rendered route.
      cache: 'no-store',
    });
  } catch {
    // The API being unreachable must degrade to "unauthenticated", never throw:
    // an exception here takes out the whole page, including the parts that need
    // no API at all. Fail closed and let the shell render its signed-out state.
    return null;
  }

  if (!response.ok) return null;

  try {
    return (await response.json()) as ViewerDescription;
  } catch {
    return null;
  }
});

/** The viewer, or `null` when nobody is signed in. */
export async function currentViewer(
  workspaceId: WorkspaceId | string,
): Promise<ViewerDescription | null> {
  return fetchViewer(workspaceId);
}

/**
 * The viewer's permission grants — THE single source, for both the navigation
 * and the route resolver.
 *
 * The reason it is one function has not changed since it held demo data: the
 * grants were briefly supplied in two places, the side nav advertised modules
 * that answered 404 when clicked, and two sources of truth for "what may this
 * user see" produced that bug immediately. Now that the value comes from a
 * session the risk is worse, not better — two call sites could resolve two
 * different identities.
 */
export async function viewerGrants(
  workspaceId: WorkspaceId | string,
): Promise<readonly PermissionKey[]> {
  return grantsFor(await fetchViewer(workspaceId));
}

/**
 * The viewer's ROLE within a workspace — `07.txt` part 2 §46-§49 (T-0027).
 *
 * The role decides WHICH navigation tree the viewer is on; the grants decide
 * which of its entries they may open. Both must come from the same resolved
 * viewer, which is why they share `fetchViewer` rather than each fetching.
 *
 * ROLE IS NOT AUTHORITY. Selecting a tree grants nothing: every item in it is
 * still permission-filtered, and the API plus RLS deny independently. §50's rule
 * — "No user shall receive functions outside the user's approved role and
 * branch" — is enforced there, not by which menu got rendered.
 *
 * An unauthenticated viewer has no role, so the workspace's own default tree is
 * shown. That is the honest rendering of "we do not know who you are"; it is
 * not a fallback to a privileged view, because the default tree is filtered by
 * `NO_GRANTS`.
 */
export async function viewerRole(
  workspaceId: WorkspaceId | string,
): Promise<RoleId | undefined> {
  const viewer = await fetchViewer(workspaceId);
  return navRoleFor(viewer?.activeRole);
}

export { grantsFor, navRoleFor, NO_GRANTS };
export type { ViewerDescription };
