import { handlers } from '../../../../auth';

/**
 * Auth.js's own endpoints: sign-in, callback, sign-out, session, CSRF.
 *
 * The Keycloak redirect URI registered in the realm is `/api/auth/callback/
 * keycloak` under this app's origin, so this path is not free to move — the
 * realm's `redirectUris` would have to move with it.
 */
export const { GET, POST } = handlers;
