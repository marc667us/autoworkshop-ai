import { ErrorState } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import type { WorkspaceId } from '@autoworkshop/navigation';
import type { ApiResult } from './api';
import { viewerHasSession } from './viewer';

/**
 * What a screen shows when the API could not answer it.
 *
 * ⚠️ THIS EXISTS BECAUSE THE OLD MESSAGE LIED TO NEW VISITORS, and a person
 * trying the application reported it: opening any data screen without signing in
 * produced
 *
 *     "Your session has ended — Sign in again to see this."
 *
 * Both halves are false for someone who has never signed in. Their session did
 * not end; they never had one. "Sign in AGAIN" tells them they did something
 * they did not. And it pointed at "the Sign in control in the top bar" instead
 * of offering one, so the first thing the product ever said to them was a
 * confusing accusation with no way forward. Their words: "it's not giving me a
 * chance to try the app."
 *
 * THE API CANNOT TELL THESE APART — `apiGet` returns `unauthenticated` both when
 * there is no token and when one expired, and it should, because the remedy is
 * the same request. The difference is knowable only here, from the SESSION
 * COOKIE, which is why this is a component and not another string in
 * `describeApiFailure`.
 *
 * It also renders a real sign-in link rather than describing where one lives.
 * A person who cannot find the control is not helped by a sentence about it.
 */
export async function ApiFailure({
  reason,
  workspaceId,
}: {
  reason: Exclude<ApiResult<unknown>, { ok: true }>['reason'];
  workspaceId: WorkspaceId | string;
}) {
  if (reason !== 'unauthenticated') {
    // Indexed by the discriminated union, so a new reason added to `ApiResult`
    // is a COMPILE error here rather than a screen rendering nothing.
    return <ErrorState {...OTHER[reason]} />;
  }

  // Cookie only — no network call, and it stays honest when the API is the
  // thing that is down.
  const signedIn = await viewerHasSession(workspaceId);

  return (
    <>
      <ErrorState
        title={signedIn ? 'Your session has ended' : 'Sign in to see this'}
        message={
          signedIn
            ? 'You were signed in, but the session has since expired. Signing in again will bring you straight back here.'
            : 'This page shows information about your own vehicles and repairs, so it is only available once you are signed in.'
        }
      />
      {/* A real link, not a button with a handler: it is a navigation, and it
          must work before any JavaScript has run — which on a first visit to a
          slow connection is exactly when someone gives up. */}
      <p style={{ marginTop: primitive.space[4] }}>
        <a
          href="/api/auth/signin"
          style={{
            display: 'inline-block',
            padding: `${primitive.space[3]} ${primitive.space[6]}`,
            borderRadius: primitive.radius.md,
            background: primitive.color.blue[600],
            color: primitive.color.grey[0],
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          {signedIn ? 'Sign in again' : 'Sign in'}
        </a>
      </p>
      {!signedIn && (
        <p style={{ marginTop: primitive.space[3], color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
          Signing in uses your workshop account. If you do not have one yet, the workshop that
          services your vehicle creates it when you first book in.
        </p>
      )}
    </>
  );
}

/**
 * The non-authentication failures, unchanged in meaning from
 * `describeApiFailure` — kept beside it deliberately so the two cannot drift.
 *
 * `forbidden` still names no permission: the viewer already failed the check,
 * so telling them what would have passed it publishes the authorization model
 * to exactly the person who should not have it.
 */
const OTHER: Record<
  Exclude<Exclude<ApiResult<unknown>, { ok: true }>['reason'], 'unauthenticated'>,
  { title: string; message: string }
> = {
  /**
   * 🔴 A SIGNED-IN IDENTITY THAT BELONGS TO NO WORKSHOP.
   *
   * `TenantGuard` answers 401 for this, the SAME status as an expired token,
   * and the shell used to render "Your session has ended — signing in again
   * will bring you straight back here". For this viewer that is false twice
   * over: the session is fine, and signing in again brings them straight back
   * to the same message. Reported for `admin@` on production, 2026-08-07.
   *
   * The remedy is not authentication, so this deliberately does NOT offer a
   * sign-in link — offering one is what created the loop.
   */
  noMembership: {
    title: 'Your account is not part of a workshop yet',
    message:
      'You are signed in — this is not a session problem, and signing in again will not change it. ' +
      'Your account holds no active membership of any workshop, so there is no data for it to show. ' +
      'Create a workshop from the dashboard, or ask an owner to add you to theirs.',
  },
  forbidden: {
    title: 'You do not have access to this',
    message:
      'Your account does not hold the permission this screen requires. Ask an administrator to review your role and branch assignment.',
  },
  notFound: {
    title: 'Not found',
    message: 'This record does not exist, or it belongs to another organisation.',
  },
  invalid: {
    title: 'That could not be loaded',
    message: 'The request was not accepted. Reload the page and try again.',
  },
  unavailable: {
    title: 'This information is temporarily unavailable',
    message: 'The service did not respond. Nothing has been changed — try again shortly.',
  },
};
