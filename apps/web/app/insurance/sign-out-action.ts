'use server';

import { ARTIFACT_WORKSPACE } from '../../auth';
import { performSignOut } from '@autoworkshop/auth';

/**
 * Sign out of the insurance workspace — T-0005 finding 5.
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
  // 🔴 ADR-021: RETURN TO THE PACK, NOT TO THE ORIGIN ROOT.
  //
  // With no `returnTo`, `performSignOut` sends the browser to the bare origin.
  // That was right when each pack WAS the origin — signing out of workshop-web
  // landed on workshop-web's own `/`, which rendered the shell, so the person
  // could sign straight back in from the control they had just used.
  //
  // Under one artifact the origin root is the PUBLIC MARKETPLACE, which renders
  // no shell at all by deliberate design (a signed-out visitor must not be shown
  // the application's navigation). So signing out dropped a workshop user onto a
  // parts storefront with no way back into their workspace, and the live suite's
  // sign-out check failed looking for a "Sign in" control that no longer existed
  // on that page.
  //
  // `/insurance` redirects into this pack's dashboard, which for a signed-out viewer
  // renders the shell with Sign in — the pre-merge behaviour, at the new path.
  return performSignOut(ARTIFACT_WORKSPACE, { returnTo: '/insurance' });
}
