export { createWorkspaceAuth, workspaceAuth, keycloakSignOutUrl } from './workspace-auth';
export type { WorkspaceAuth } from './workspace-auth';
export { apiBaseUrl, clientIdForWorkspace, keycloakIssuer, AuthConfigError } from './config';
export {
  isExpired,
  refreshAccessToken,
  revokeRefreshToken,
  RefreshFailedError,
  REFRESH_SKEW_SECONDS,
} from './tokens';
export type { KeycloakTokenSet } from './tokens';
export { performSignOut } from './sign-out';
export { postLogoutOrigin } from './origin';

/**
 * Which requests the auth middleware must see.
 *
 * MIDDLEWARE IS NOT OPTIONAL and this matcher is why. The `jwt` callback
 * refreshes the Keycloak access token, but only middleware may write the
 * resulting cookie — a server component can compute a refreshed token and has
 * no way to persist it, so an app without this runs the refresh on every render
 * and keeps none of it. With a 300-second access-token lifespan that means
 * `getAccessToken()` starts returning null a few minutes into any session.
 *
 * `api/auth` is excluded because Auth.js's own routes manage the cookie
 * themselves; static assets are excluded because running a session decrypt for
 * every image is pure cost.
 */
export const AUTH_MIDDLEWARE_MATCHER = [
  '/((?!api/auth|_next/static|_next/image|favicon.ico).*)',
];
