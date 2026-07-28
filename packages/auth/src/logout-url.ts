import { keycloakIssuer } from './config';

/**
 * Kept out of `workspace-auth.ts` for the same reason as `origin.ts`: that file
 * imports `next-auth`, which imports `next/server`, which vitest cannot resolve
 * in this package's isolated pnpm store. Importing this function from there
 * meant the whole unit suite failed at module load — including the tests that
 * had been passing for weeks. This function needs only the issuer, so it has no
 * business sitting behind that dependency.
 */

/**
 * The URL that ends the KEYCLOAK session, not just the local cookie.
 *
 * `signOut()` clears this app's cookie and nothing else. The Keycloak SSO
 * session outlives it, so the next sign-in completes silently and the viewer
 * appears never to have been signed out — which on a shared workshop terminal
 * is the whole point of signing out.
 *
 * `id_token_hint` is what lets Keycloak end the session without an interstitial
 * "do you want to log out?" confirmation.
 */
export function keycloakSignOutUrl(
  idToken: string | undefined,
  postLogoutRedirect: string,
  clientId?: string,
): string {
  const url = new URL(`${keycloakIssuer()}/protocol/openid-connect/logout`);
  if (idToken) url.searchParams.set('id_token_hint', idToken);
  // ⚠️ ALWAYS SENT, and not merely as a nicety. Keycloak validates
  // `post_logout_redirect_uri` against a CLIENT's allow-list, and it resolves
  // which client from `id_token_hint` OR `client_id`. With neither it refuses
  // the request outright — showing an error page and, critically, NOT ending the
  // session. Since the id token can go missing across a refresh, `client_id` is
  // the parameter that keeps logout self-validating; sending both means no
  // single missing value can turn sign-out into a no-op that still looks
  // successful. (Supervisor review, 2026-07-28.)
  if (clientId) url.searchParams.set('client_id', clientId);
  url.searchParams.set('post_logout_redirect_uri', postLogoutRedirect);
  return url.toString();
}
