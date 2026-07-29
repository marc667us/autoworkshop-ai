import { cache } from 'react';
import type { PermissionKey, RoleId, WorkspaceId } from '@autoworkshop/navigation';
import { apiBaseUrl, workspaceAuth } from '@autoworkshop/auth';
import { grantsFor, navRoleFor, NO_GRANTS, type ViewerDescription } from './viewer-contract';
import { activeOrganizationId, rawOrganizationHeader } from './active-organization';

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

  // Two attempts: with the stored organization, then WITHOUT it.
  //
  // ⚠️ THE RETRY IS A LOCKOUT FIX, not belt and braces (Codex, HIGH). The API
  // THROWS when a requested organization is not among the viewer's active
  // memberships — correctly, since that is an authorization probe. But a
  // selection can go stale through no fault of the user: they pick org A, their
  // membership in A is later revoked, and they still belong to B. Every request
  // then carries a now-invalid id, `/me` fails, the shell cannot render, and the
  // switcher they would have used to choose B never appears. Retrying without
  // the header lets them back in on the API's own default.
  const attempt = async (withOrg: boolean): Promise<Response> =>
    fetch(`${apiBaseUrl()}/api/v1/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        // MUST carry the same organization header the pages send (T-0016).
        // Without it the shell resolves the API's DEFAULT organization while
        // every page resolves the SELECTED one — the top bar would name one
        // organisation while the table below listed another's customers. That
        // is the nav/router divergence this file already exists to prevent,
        // one layer down.
        ...(withOrg ? await rawOrganizationHeader() : {}),
      },
      // The viewer's role and permissions are per-request facts. Next caches
      // fetches by default; caching this one would serve one user's grants to
      // the next user who lands on the same rendered route.
      cache: 'no-store',
    });

  let response: Response;
  try {
    response = await attempt(true);
    // Only worth a second call if a selection was actually sent.
    if (!response.ok && (await activeOrganizationId())) {
      response = await attempt(false);
    }
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

/**
 * Is anyone signed in? Answered from the SESSION COOKIE, not from `/me`.
 *
 * Kept separate from `currentViewer()` on purpose (Codex finding M2). The
 * viewer is what the API says about a person; the session is whether there is a
 * person at all. When the API is unreachable `currentViewer()` correctly
 * degrades to null — but treating that as "signed out" removed the Sign out
 * button from someone holding a live Keycloak session, during exactly the
 * incident when ending a session matters most.
 *
 * Costs nothing extra: no network call, just the cookie already on the request.
 */
export async function viewerHasSession(workspaceId: WorkspaceId | string): Promise<boolean> {
  return workspaceAuth(workspaceId).hasSession();
}

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

/**
 * The organization header for ordinary API calls — VALIDATED.
 *
 * Drops a stored selection the viewer does not (or no longer) holds, so a stale
 * cookie degrades to the API's default instead of failing every request. The
 * check is a convenience, NOT the control: the API re-validates every
 * `x-organization-id` against the user's own memberships and refuses one that
 * is not theirs, whatever this sends.
 *
 * Lives here rather than in `active-organization.ts` because it needs the
 * viewer, and `active-organization.ts` is imported BY the viewer lookup —
 * putting it there would make the two modules import each other.
 */
export async function activeOrganizationHeader(
  workspaceId: WorkspaceId | string,
): Promise<Record<string, string>> {
  const id = await activeOrganizationId();
  if (!id) return {};
  const viewer = await fetchViewer(workspaceId);
  // No viewer means no session; the call will fail on the token regardless, and
  // sending the id changes nothing.
  if (!viewer) return {};
  const holds = viewer.memberships.some((m) => m.organizationId === id);
  return holds ? { 'x-organization-id': id } : {};
}
