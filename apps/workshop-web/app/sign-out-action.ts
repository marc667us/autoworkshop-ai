'use server';

import { performSignOut } from '@autoworkshop/auth';

/**
 * Sign out of the workshop workspace — T-0005 finding 5.
 *
 * A three-line delegate on purpose. The whole sequence (revoke the refresh
 * token at Keycloak, clear this app's cookie, end the Keycloak SSO session, in
 * that order) lives once in `@autoworkshop/auth`; the workspace id is the only
 * genuinely per-app value, exactly as in this app's `auth.ts`.
 *
 * It is a SERVER ACTION rather than a route handler so that Next's own
 * Origin-vs-Host check is the CSRF control. See `packages/auth/src/sign-out.ts`
 * for why sign-out CSRF is worth defending against here.
 */
export async function signOutAction(): Promise<never> {
  return performSignOut('workshop');
}

/**
 * Sign out and land on the sign-in page — "switch user".
 *
 * The same three-step sequence, with one difference in where Keycloak returns the
 * browser. It exists because pressing "Sign in" while another account still holds a
 * Keycloak SSO session silently returns THAT account: the workshop terminal in
 * `07.txt` pt2 §9 is shared, and the menu quietly being the wrong one is the only
 * evidence. Ending the SSO session first is the only thing that reliably works —
 * `prompt=login` and `prompt=select_account` were both measured against this realm and
 * neither does.
 */
export async function switchUserAction(): Promise<never> {
  return performSignOut('workshop', { returnTo: '/api/auth/signin' });
}
