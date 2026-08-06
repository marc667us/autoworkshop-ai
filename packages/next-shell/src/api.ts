import { apiBaseUrl, workspaceAuth } from '@autoworkshop/auth';
import type { WorkspaceId } from '@autoworkshop/navigation';
import { activeOrganizationHeader, activeRoleHeader, currentViewer } from './viewer';

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
       * `noMembership`     — 🔴 A VALID, SIGNED-IN IDENTITY THAT BELONGS TO NO
       *                     WORKSHOP. `TenantGuard` answers 401 for this, the
       *                     same status as an expired token, and collapsing the
       *                     two told a signed-in admin "your session has ended,
       *                     you were logged out" — which is FALSE, and sends
       *                     them to sign in again, which cannot possibly help.
       *                     They loop.
       *
       *                     Reported 2026-08-07 for `admin@` on production.
       *                     Third instance of "a truth about A used as evidence
       *                     for B" in this repository.
       * `forbidden`       — a valid identity that may not have this.
       * `notFound`        — the record does not exist for this tenant.
       * `invalid`         — the request was rejected on its CONTENT (400/409).
       *                     Writes only, and it is the one failure the USER can
       *                     fix, so it carries the API's own message: "a vehicle
       *                     with this registration already exists" tells them
       *                     what to change, and "something went wrong" does not.
       * `unavailable`     — the API is down, unreachable, or answered garbage.
       */
      reason:
        | 'unauthenticated'
        | 'noMembership'
        | 'forbidden'
        | 'notFound'
        | 'invalid'
        | 'unavailable';
      status?: number;
      /**
       * Set for `invalid`, and for `forbidden` ON WRITES. Safe to show: these
       * messages describe the INPUT or the RULE, never the system.
       *
       * `forbidden` carries it because a refusal that names no alternative reads
       * as a broken screen — see the note at the 403 branch in `apiWrite`.
       */
      message?: string;
    };

/**
 * GET a resource as the current viewer.
 *
 * `cache: 'no-store'` is not optional. Next caches fetches by default, and a
 * cached tenant-scoped response is one tenant's data served to the next viewer
 * who lands on the same rendered route — the most expensive bug this codebase
 * could ship. `viewer.ts` carries the same note for the same reason.
 */

/**
 * 🔴 THE CUSTOMER WORKSPACE MAY ONLY BE READ BY A CUSTOMER.
 *
 * MEASURED 2026-08-04: a workshop manager opened the customer app and its
 * dashboard showed "Your vehicles (3)" — one belonging to Adjoa Boateng and two
 * to Kwame Mensah. The API narrows to a person's OWN vehicles only when
 * `activeRole === 'customer'`; for a `workshop_manager` it correctly returns
 * the organisation's, which is right for the workshop app and a confidentiality
 * breach on a page headed "Your vehicles".
 *
 * ⚠️ IT LIVES HERE, IN THE DATA CALL, AND NOT ONLY IN THE LAYOUT. A layout gate
 * was tried first and was NOT enough: the refusal rendered while all three
 * registrations were still present in the document, because a layout does not
 * stop the page beneath it executing and its output still ships in the RSC
 * payload. This repository has recorded that exact lesson once already. Hiding
 * is not refusing; the request must not be made.
 *
 * ⚠️ A VIEWER WITH NO MEMBERSHIPS IS NOT REFUSED. A parts buyer with no
 * workshop affiliation is a REAL and intended user of this app — `/me` is
 * behind TenantGuard so they resolve to no viewer at all, and the marketplace
 * and basket are built for exactly that person. The refusal is narrow: a viewer
 * who resolved, holds memberships, and none of them is `customer`.
 *
 * ⚠️ AND IT IS STILL NOT THE CONTROL. The API scopes and RLS isolates,
 * independently (CLAUDE.md §8). This closes a workspace the caller should never
 * have been reading; it does not replace either layer beneath it.
 */
async function refusedForWorkspace(
  workspaceId: WorkspaceId | string,
): Promise<ApiResult<never> | null> {
  if (workspaceId !== 'customer') return null;
  const viewer = await currentViewer(workspaceId);
  if (!viewer || viewer.memberships.length === 0) return null;
  const isCustomer = viewer.memberships.some((m) => m.roleName === 'customer');
  return isCustomer ? null : { ok: false, reason: 'forbidden', status: 403 };
}

export async function apiGet<T>(
  workspaceId: WorkspaceId | string,
  path: string,
): Promise<ApiResult<T>> {
  // BEFORE the token is even fetched: a caller who may not read this workspace
  // must not reach the API at all.
  const refused = await refusedForWorkspace(workspaceId);
  if (refused) return refused;

  const accessToken = await workspaceAuth(workspaceId).getAccessToken();
  // Null means no session or an expired token. Fail closed: never fall back to
  // an unauthenticated call, because these endpoints would then answer 401 and
  // the page would report "unavailable" for what is really "please sign in".
  if (!accessToken) return { ok: false, reason: 'unauthenticated' };

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1${path}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        // The viewer's chosen organization (T-0016). Absent until they pick
        // one, in which case the API takes its own deterministic default.
        ...(await activeOrganizationHeader(workspaceId)),
        // The viewer's chosen ROLE. Absent until they pick one, in which case
        // the API takes its own deterministic default. Validated again there —
        // a role the viewer does not hold is REFUSED, never downgraded.
        ...(await activeRoleHeader(workspaceId)),
      },
      cache: 'no-store',
    });
  } catch {
    // DNS failure, connection refused, TLS error. The API being down must
    // degrade to an error STATE, never to an exception that removes the page.
    return { ok: false, reason: 'unavailable' };
  }

  if (!response.ok) {
    switch (response.status) {
      case 401: {
        // 🔴 TWO DIFFERENT FACTS SHARE THIS STATUS CODE. `TenantGuard` throws
        // 401 both for "no bearer token / expired" and for
        // `TenantResolutionError` — of which the common case is
        // "user holds no active membership", i.e. somebody perfectly signed in
        // who simply belongs to no workshop yet.
        //
        // The remedies are opposite: one is "sign in again", the other is
        // "create or join a workshop". Telling the second group the first thing
        // is how an account gets stuck in a sign-in loop it cannot escape.
        //
        // Read from the API's OWN message rather than guessing, and fall back
        // to `unauthenticated` when it says nothing — the safer of the two.
        const said = await response
          .clone()
          .json()
          .then((b: { message?: string }) => String(b?.message ?? ''))
          .catch(() => '');
        if (/membership|no membership selected|not among the user/i.test(said)) {
          return { ok: false, reason: 'noMembership', status: 401, message: said };
        }
        return { ok: false, reason: 'unauthenticated', status: 401 };
      }
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
 * POST a resource as the current viewer.
 *
 * Same discipline as `apiGet` and for the same reasons — server only, so the
 * access token never reaches the browser, and IT NEVER THROWS, because a form
 * that throws on a rejected submission destroys the page the user was filling
 * in along with everything they typed.
 *
 * The one difference is `invalid`. A write can fail on its CONTENT — a duplicate
 * registration number, a malformed field — and that is the only failure the
 * person at the keyboard can actually do something about, so the API's message
 * is carried back rather than replaced with a generic apology. Those messages
 * are written to describe the INPUT ("a vehicle with this registration number or
 * VIN already exists"), never the system, so passing them through leaks nothing.
 *
 * `cache` is not set: Next does not cache POSTs. `no-store` is on `apiGet`
 * because a cached tenant-scoped GET is one tenant's data served to the next
 * viewer; that hazard does not exist here.
 */
export async function apiPost<T>(
  workspaceId: WorkspaceId | string,
  path: string,
  body: unknown,
): Promise<ApiResult<T>> {
  return apiWrite<T>('POST', workspaceId, path, body);
}

/**
 * PUT a complete resource as the current viewer.
 *
 * ⚠️ `PUT` RATHER THAN `PATCH`, AND THE DIFFERENCE IS LOAD-BEARING FOR ITS FIRST
 * CALLER. `apiPatch` means "change these fields"; this means "replace the whole
 * set". The workshop's pricing row is read as a UNIT by `quotation.service.ts`
 * when a quotation is built, so a partial write would leave a workshop quoting
 * with a new labour rate against an old tax rate — a combination nobody chose
 * and nobody can see on screen. The API's `parsePricingInput` requires every
 * field for the same reason, so a partial body is refused rather than merged.
 *
 * Shares `apiWrite` with the others: same auth, same never-throws contract, same
 * `invalid` pass-through so a screen can render the API's own sentence.
 */
export async function apiPut<T>(
  workspaceId: WorkspaceId | string,
  path: string,
  body: unknown,
): Promise<ApiResult<T>> {
  return apiWrite<T>('PUT', workspaceId, path, body);
}

/**
 * PATCH a resource as the current viewer.
 *
 * Identical handling to `apiPost` — same auth, same never-throws contract, same
 * `invalid` pass-through — and shares its implementation rather than copying it
 * (Directive §3). The distinction is only the verb: a PATCH sends the fields
 * being changed, so the caller does not have to hold a whole record it never
 * read and cannot accidentally write back a stale copy of the rest of it.
 *
 * `1.txt` §394's refusals arrive here as `invalid` (a 400 — "requires
 * overrideReason") or `forbidden` (a 403 — "role may not move a job card to
 * ..."), and the board shows the API's own sentence for the first because it
 * describes what the person can actually do about it.
 */
export async function apiPatch<T>(
  workspaceId: WorkspaceId | string,
  path: string,
  body: unknown,
): Promise<ApiResult<T>> {
  return apiWrite<T>('PATCH', workspaceId, path, body);
}

/**
 * DELETE a resource as the current viewer.
 *
 * Shares `apiWrite` for the same reasons `apiPatch` does — same auth, same
 * never-throws contract, same `invalid` pass-through.
 *
 * ⚠️ NO BODY IS SENT, and that is why this is a separate export rather than
 * `apiWrite('DELETE', ..., {})`. An empty object would still set
 * `Content-Type: application/json` and a `{}` payload on a request whose meaning
 * is entirely in its URL — harmless today, and exactly the kind of thing a strict
 * gateway or a future body-schema validator rejects with a message about JSON when
 * the caller sent no data at all.
 *
 * Added for slice 3b's `removeFinding` (`DELETE /diagnoses/:id/findings/:id`),
 * which exists so a finding entered in error can be taken back while the diagnosis
 * is still open. Nothing else uses DELETE yet: the platform's records are
 * append-only by default and this one is narrowly granted (migration 013).
 */
export async function apiDelete<T>(
  workspaceId: WorkspaceId | string,
  path: string,
): Promise<ApiResult<T>> {
  return apiWrite<T>('DELETE', workspaceId, path, undefined);
}

async function apiWrite<T>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  workspaceId: WorkspaceId | string,
  path: string,
  body: unknown,
): Promise<ApiResult<T>> {
  const accessToken = await workspaceAuth(workspaceId).getAccessToken();
  if (!accessToken) return { ok: false, reason: 'unauthenticated' };

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        // ⚠️ ONLY WHEN THERE IS A BODY. `apiDelete` passes `undefined`, and
        // declaring a JSON content type on a request that carries no bytes is what
        // makes a strict gateway or a body-schema validator complain about
        // malformed JSON when nothing was sent at all.
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(await activeOrganizationHeader(workspaceId)),
        // The viewer's chosen ROLE. Absent until they pick one, in which case
        // the API takes its own deterministic default. Validated again there —
        // a role the viewer does not hold is REFUSED, never downgraded.
        ...(await activeRoleHeader(workspaceId)),
      },
      // `JSON.stringify(undefined)` is `undefined`, which fetch treats as no body —
      // relied on deliberately rather than left to chance, hence the explicit
      // branch above.
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, reason: 'unavailable' };
  }

  if (!response.ok) {
    // Read the body BEFORE branching: a 400 carries the reason the form needs,
    // and the response can only be consumed once.
    const detail = await response
      .json()
      .then((b: { message?: string | string[] }) =>
        Array.isArray(b?.message) ? b.message.join('; ') : b?.message,
      )
      .catch(() => undefined);

    switch (response.status) {
      case 401:
        return { ok: false, reason: 'unauthenticated', status: 401 };
      case 403:
        // ⚠️ THE MESSAGE IS CARRIED ON A WRITE-403 TOO, and this was a real gap.
        // Slice B's most useful refusals are 403s from a column guard, and they
        // are written to name the way forward — "this part is published, so its
        // fitments are public and only an administrator may change them. Ask an
        // administrator to withdraw the part…". Dropping the body turned that
        // into "you do not have access to this", which states the problem and
        // hides the solution. A rule whose escape hatch is invisible is a wall,
        // which is the most expensive defect class in this repository.
        //
        // It does NOT loosen the deliberate vagueness of `describeApiFailure`,
        // which still says nothing specific by default. This only makes the
        // API's own sentence AVAILABLE to a caller that knows its 403s explain
        // rules rather than reveal existence — and in this API they cannot
        // reveal existence, because a row the caller may not see answers 404.
        return { ok: false, reason: 'forbidden', status: 403, message: detail };
      case 404:
        return { ok: false, reason: 'notFound', status: 404 };
      case 400:
      case 409:
      case 422:
        return { ok: false, reason: 'invalid', status: response.status, message: detail };
      default:
        return { ok: false, reason: 'unavailable', status: response.status };
    }
  }

  try {
    return { ok: true, data: (await response.json()) as T };
  } catch {
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
    case 'noMembership':
      // 🔴 NOT "your session has ended". This viewer IS signed in; they hold no
      // membership of any workshop. `TenantGuard` answers 401 for both, and
      // collapsing them told a signed-in admin to sign in again — which cannot
      // help, so they loop. Reported for `admin@` on production 2026-08-07.
      return {
        title: 'Your account is not part of a workshop yet',
        description:
          'You are signed in — signing in again will not change this. Create a workshop ' +
          'from the dashboard, or ask an owner to add you to theirs.',
      };
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
    case 'invalid':
      return {
        title: 'That could not be saved',
        description:
          'Some of the details were not accepted. Check the highlighted fields and try again.',
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
