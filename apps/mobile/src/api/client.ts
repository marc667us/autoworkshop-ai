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
  /**
   * The server REFUSED the request and said why — a 400 carrying either the
   * structured `problems` list from `validatedBody`, or a plain message from a
   * service rule (a stage move the lifecycle does not allow, for example).
   *
   * 🔴 KEPT SEPARATE FROM `server`. A 400 is not an outage: it is the system
   * working correctly and telling the user something about THIS request. Folding
   * it into "the workshop system is not answering" would tell a technician to
   * try again later when the real answer is "that move is not allowed from this
   * stage" — advice that is not merely useless but wrong.
   */
  | { kind: 'refused'; message: string }
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

/**
 * A write. Same failure vocabulary as `apiGet`, plus `refused`.
 *
 * ⚠️ `PATCH`, and the body is sent as JSON with no client-side coercion. The API
 * now validates every field's TYPE, so sending `'12'` where a number is expected
 * is refused rather than silently accepted — which is the point of that
 * validation and would be undone by a client that "helpfully" stringified.
 */
export async function apiPatch<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  const token = await currentAccessToken();
  if (!token) return { ok: false, reason: { kind: 'unauthenticated' } };

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, reason: { kind: 'offline' } };
  }

  if (res.status === 401) return { ok: false, reason: { kind: 'unauthenticated' } };
  if (res.status === 403) return { ok: false, reason: { kind: 'forbidden' } };

  if (res.status === 400) {
    // The server explained itself. Read the explanation rather than replacing
    // it with a generic one — Nest wraps a BadRequestException as
    // `{ message: ... }`, and `validatedBody` puts a `problems` array inside it.
    // ⚠️ THE DEFAULT IS REPLACED ONLY BY SOMETHING NON-EMPTY. Raised by Codex:
    // the first version assigned the joined problem list unconditionally, so a
    // `problems` array whose entries carried neither a field nor a message
    // produced an EMPTY string — replacing an honest fallback with silence, and
    // rendering a refusal notice containing no reason at all.
    let message = 'The workshop system refused that change.';
    try {
      const body = (await res.json()) as { message?: unknown; problems?: unknown };

      // Nest wraps a thrown exception body under `message`, so the structured
      // list can arrive at either depth. Both are read; neither is assumed, and
      // `Array.isArray` is checked before anything is mapped.
      const nested =
        typeof body.message === 'object' && body.message !== null
          ? (body.message as { problems?: unknown; message?: unknown })
          : undefined;
      const raw = Array.isArray(body.problems) ? body.problems : nested?.problems;
      const problems = Array.isArray(raw)
        ? (raw as Array<{ field?: string; message?: string }>)
        : [];

      const joined = problems
        .map((p) => {
          if (typeof p?.message === 'string' && p.message.trim()) {
            return p.field ? `${p.field} ${p.message}` : p.message;
          }
          return typeof p?.field === 'string' && p.field.trim() ? `${p.field} is not valid` : '';
        })
        .filter((line) => line.trim().length > 0)
        .join('\n');

      if (joined.trim().length > 0) {
        message = joined;
      } else if (typeof body.message === 'string' && body.message.trim()) {
        message = body.message;
      } else if (Array.isArray(body.message)) {
        // Nest's own ValidationPipe reports `message: string[]`.
        const lines = body.message.filter(
          (m): m is string => typeof m === 'string' && m.trim().length > 0,
        );
        if (lines.length) message = lines.join('\n');
      } else if (typeof nested?.message === 'string' && nested.message.trim()) {
        message = nested.message;
      }
    } catch {
      // A 400 with an unreadable body still gets the honest default above.
    }
    return { ok: false, reason: { kind: 'refused', message } };
  }

  if (!res.ok) return { ok: false, reason: { kind: 'server', status: res.status } };

  try {
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, reason: { kind: 'server', status: res.status } };
  }
}

/** Words for a failure, matching the web apps' vocabulary. */
export function describeFailure(reason: ApiFailure): { title: string; detail: string } {
  switch (reason.kind) {
    case 'refused':
      // The server's own words. It knows why; this does not.
      return { title: 'That change was not accepted', detail: reason.message };
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
