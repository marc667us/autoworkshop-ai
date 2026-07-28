import { apiBaseUrl, workspaceAuth } from '@autoworkshop/auth';
import type { WorkspaceId } from '@autoworkshop/navigation';

/**
 * How a PAGE reads the API. The link that did not exist until now.
 *
 * Eight endpoints were built under `/api/v1` — organizations, branches, users,
 * memberships, me — and the entire front end called exactly ONE of them, `/me`,
 * and only to discover who the viewer was. No screen read any data. That is
 * what "no front end to access the back end" meant, and it was accurate.
 * `packages/api-client` existed as an empty directory.
 *
 * SERVER ONLY, and that is a security property rather than a convenience. The
 * access token lives in an encrypted httpOnly cookie and is read back here on
 * the server; it never reaches the browser, so a page renders data the viewer
 * is entitled to without the browser ever holding a credential it could leak.
 * The same reasoning as `viewer.ts`.
 *
 * IT NEVER THROWS. Every failure is a value. A page that throws on a failed
 * fetch takes out the whole route — including the shell, the navigation and the
 * sign-out control — and the user sees a Next error page instead of an
 * application. `05.txt` §2 requires loading, empty AND error states on every
 * screen; that is impossible if the data layer's failure mode is an exception.
 * So callers get a discriminated result and must render each case.
 *
 * FAILURES ARE DISTINGUISHED BECAUSE THE REMEDIES DIFFER. "Sign in again",
 * "you do not have access" and "the service is unreachable" are three different
 * messages, and collapsing them into "something went wrong" is how a session
 * problem gets reported as an outage.
 */

export type ApiResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      /**
       * `unauthenticated` — no session, or the access token expired.
       * `forbidden`       — a valid identity that may not have this.
       * `notFound`        — the record does not exist for this tenant.
       * `unavailable`     — the API is down, unreachable, or answered garbage.
       */
      reason: 'unauthenticated' | 'forbidden' | 'notFound' | 'unavailable';
      status?: number;
    };

/**
 * GET a resource as the current viewer.
 *
 * `cache: 'no-store'` is not optional. Next caches fetches by default, and a
 * cached tenant-scoped response is one tenant's data served to the next viewer
 * who lands on the same rendered route — the most expensive bug this codebase
 * could ship. `viewer.ts` carries the same note for the same reason.
 */
export async function apiGet<T>(
  workspaceId: WorkspaceId | string,
  path: string,
): Promise<ApiResult<T>> {
  const accessToken = await workspaceAuth(workspaceId).getAccessToken();
  // Null means no session or an expired token. Fail closed: never fall back to
  // an unauthenticated call, because these endpoints would then answer 401 and
  // the page would report "unavailable" for what is really "please sign in".
  if (!accessToken) return { ok: false, reason: 'unauthenticated' };

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
  } catch {
    // DNS failure, connection refused, TLS error. The API being down must
    // degrade to an error STATE, never to an exception that removes the page.
    return { ok: false, reason: 'unavailable' };
  }

  if (!response.ok) {
    switch (response.status) {
      case 401:
        return { ok: false, reason: 'unauthenticated', status: 401 };
      case 403:
        return { ok: false, reason: 'forbidden', status: 403 };
      case 404:
        return { ok: false, reason: 'notFound', status: 404 };
      default:
        return { ok: false, reason: 'unavailable', status: response.status };
    }
  }

  try {
    return { ok: true, data: (await response.json()) as T };
  } catch {
    // A 200 carrying HTML — a proxy error page, typically. Treating it as data
    // would put `[object Object]` on the screen instead of an error state.
    return { ok: false, reason: 'unavailable', status: response.status };
  }
}

/**
 * The human-readable half of a failure, kept beside the codes so the two cannot
 * drift, and deliberately vague about authorization.
 *
 * A `forbidden` message never names the permission that would have been
 * required: the viewer already failed the check, so telling them what would
 * have passed it publishes the authorization model to the one person who should
 * not have it. Same rule as `renderModulePage` and `WorkspaceAccessDenied`.
 */
export function describeApiFailure(reason: Exclude<ApiResult<unknown>, { ok: true }>['reason']): {
  title: string;
  description: string;
} {
  switch (reason) {
    case 'unauthenticated':
      return {
        title: 'Your session has ended',
        description: 'Sign in again to see this. Use the Sign in control in the top bar.',
      };
    case 'forbidden':
      return {
        title: 'You do not have access to this',
        description:
          'Your account does not hold the permission this screen requires. Ask an administrator to review your role and branch assignment.',
      };
    case 'notFound':
      return {
        title: 'Not found',
        description: 'This record does not exist, or it belongs to another organisation.',
      };
    case 'unavailable':
    default:
      return {
        title: 'This information is temporarily unavailable',
        description:
          'The service did not respond. Nothing has been changed — try again shortly.',
      };
  }
}
