import { API_BASE_URL } from '../auth/config';
import { currentAccessToken } from '../auth/session';

/**
 * The API client.
 *
 * ⚠️ FAILURES ARE RETURNED AS VALUES, NOT THROWN. The same choice `apiGet` makes
 * in `packages/next-shell`, for the same reason: a screen has to RENDER the
 * failure, and the three reasons need different words. "Sign in again", "you may
 * not see this" and "the workshop system is not answering" are different
 * problems with different remedies, and collapsing them into "something went
 * wrong" is how a session that simply expired gets reported as an outage.
 *
 * ⚠️ AND THE APP IS NEVER THE AUTHORIZATION DECISION. It sends a bearer token
 * and renders what comes back. Every rule about who may see what is enforced by
 * `TenantGuard` and then by row-level security, and would still hold if this
 * file were replaced by `curl`. Nothing here is a security control — which is
 * exactly why nothing here tries to be one.
 */

export type ApiFailure =
  | { kind: 'unauthenticated' }
  | { kind: 'forbidden' }
  | { kind: 'offline' }
  | { kind: 'server'; status: number };

export type ApiResult<T> = { ok: true; data: T } | { ok: false; reason: ApiFailure };

export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  const token = await currentAccessToken();
  if (!token) return { ok: false, reason: { kind: 'unauthenticated' } };

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
  } catch {
    // A phone in a workshop loses signal constantly. This is the ordinary case,
    // not an exceptional one, and it is reported as its own reason so the screen
    // can say "no connection" instead of "server error".
    return { ok: false, reason: { kind: 'offline' } };
  }

  if (res.status === 401) return { ok: false, reason: { kind: 'unauthenticated' } };
  if (res.status === 403) return { ok: false, reason: { kind: 'forbidden' } };
  if (!res.ok) return { ok: false, reason: { kind: 'server', status: res.status } };

  try {
    return { ok: true, data: (await res.json()) as T };
  } catch {
    // A 200 whose body is not JSON is a server fault, not a parse detail the
    // user can act on. Reported as one rather than crashing the screen.
    return { ok: false, reason: { kind: 'server', status: res.status } };
  }
}

/** Words for a failure, matching the web apps' vocabulary. */
export function describeFailure(reason: ApiFailure): { title: string; detail: string } {
  switch (reason.kind) {
    case 'unauthenticated':
      return {
        title: 'Please sign in again',
        detail: 'Your session has ended. Signing in again will bring your work back.',
      };
    case 'forbidden':
      return {
        title: 'Not available to your role',
        detail: 'Your account does not have access to this. Ask a workshop owner if you need it.',
      };
    case 'offline':
      return {
        title: 'No connection',
        detail: 'The app could not reach the workshop system. Check the connection and try again.',
      };
    default:
      return {
        title: 'The workshop system is not answering',
        detail: `The server responded with ${reason.status}. Try again shortly.`,
      };
  }
}
