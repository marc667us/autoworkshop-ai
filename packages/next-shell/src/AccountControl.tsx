'use client';

import * as React from 'react';
import { themeVar, primitive } from '@autoworkshop/design-tokens';

/**
 * Sign in / sign out — the top bar's account control (§15), and the caller that
 * T-0005 finding 5 was missing.
 *
 * WHY IT LIVES IN `next-shell` AND NOT IN `ui`. `@autoworkshop/ui` is
 * deliberately framework-free so Storybook and the Playwright journeys can
 * render the shell with no Next runtime. Signing out cannot be: it revokes a
 * token at Keycloak and clears an httpOnly cookie, so it is a SERVER action, and
 * a server action is a Next concept. `ui` takes `accountControl` as a plain
 * node; this is what fills it. Same split, and the same reason, as `renderLink`.
 *
 * WHY A `<form>` AND NOT AN `onClick`. Next verifies Origin against Host for
 * server actions, so the CSRF control is the framework's rather than something
 * hand-written here and later trusted without being re-read. Sign-out CSRF is
 * real: an attacker cannot steal the session but can repeatedly end it, which
 * on a job card halfway through a repair is a denial of service with data loss.
 *
 * It also keeps working when JavaScript does not — which is not a stylistic
 * point. This is the control that ends a session on a shared workshop terminal,
 * and it is the last one that should depend on hydration having succeeded.
 * T-0030 was three days spent on a shell that looked correct and had never
 * hydrated; a plain form submit survives exactly that failure.
 *
 * ⚠️ THE `action` CAST IS LOAD-BEARING AND IS NOT A TYPE-SAFETY SHORTCUT.
 * This workspace pins **React 18.3.1** while running Next 15. Next's App Router
 * bundles its own React build, in which `<form action={fn}>` works at runtime,
 * but `@types/react@18` still types `action` as `string` — the DOM attribute.
 * There is no React 18 type that expresses a function here, so the alternatives
 * were a cast or dropping the no-JS guarantee above. The cast is narrow, sits on
 * one attribute, and the behaviour it asserts is verified by starting the app
 * and signing out, not by tsc. If React is upgraded to 19, delete it — the real
 * types will accept the function directly.
 */

export interface AccountControlProps {
  /** The signed-in user's display name. Absent means nobody is signed in. */
  userLabel?: string;
  /**
   * Server action that revokes the refresh token, clears the cookie and ends
   * the Keycloak SSO session, in that order. Supplied per app because the
   * workspace decides which Keycloak client the token is revoked at.
   */
  signOutAction?: () => Promise<void>;
  /** Where an unauthenticated viewer goes to sign in, e.g. `/api/auth/signin`. */
  signInHref?: string;
}

const CONTROL_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '2.25rem',
  padding: `0 ${primitive.space[3]}`,
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.md,
  background: themeVar.backgroundPrimary,
  color: themeVar.textPrimary,
  fontSize: primitive.fontSize.sm,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
};

export function AccountControl({ userLabel, signOutAction, signInHref }: AccountControlProps) {
  // Sign-out is a redirect chain through Keycloak, so it is slow enough to be
  // double-clicked. A second submit would post after the cookie is already
  // gone, find no refresh token, and log "not revoked" for a failure that did
  // not happen — which would make that warning untrustworthy exactly when it
  // matters. `useFormStatus` would be the React 19 way; this is the React 18 one.
  const [submitting, setSubmitting] = React.useState(false);

  if (userLabel && signOutAction) {
    return (
      <form
        // See the header note on why this cast exists and when to remove it.
        action={signOutAction as unknown as string}
        onSubmit={() => setSubmitting(true)}
        style={{ display: 'inline-flex', margin: 0 }}
      >
        <button
          type="submit"
          disabled={submitting}
          // The accessible name says WHO is being signed out. On a shared
          // workshop terminal the whole risk is signing out of the wrong
          // session, and the user chip that would otherwise say so is hidden
          // below 768px.
          aria-label={`Sign out of ${userLabel}`}
          style={{
            ...CONTROL_STYLE,
            opacity: submitting ? 0.6 : 1,
            cursor: submitting ? 'progress' : 'pointer',
          }}
        >
          {submitting ? 'Signing out…' : 'Sign out'}
        </button>
      </form>
    );
  }

  // No `userLabel` means no session. A sign-in link is rendered only when the
  // caller says where to go — the shell must not invent an auth route, and an
  // unfinished control is rendered as nothing rather than as a dead button
  // (TopNav's rule).
  if (!userLabel && signInHref) {
    return (
      <a href={signInHref} style={CONTROL_STYLE}>
        Sign in
      </a>
    );
  }

  return null;
}
