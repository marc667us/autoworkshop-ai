'use server';

import { performSignOut } from '@autoworkshop/auth';

/**
 * Sign out of the towing workspace — T-0005 finding 5.
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
  return performSignOut('towing');
}
