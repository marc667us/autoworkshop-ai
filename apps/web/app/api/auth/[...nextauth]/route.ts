import { handlers } from '../../../auth';

/**
 * Auth.js's own endpoints: sign-in, callback, sign-out, session, CSRF.
 *
 * The Keycloak redirect URI registered in the realm is `/api/auth/callback/
 * keycloak` under this app's origin, so this path is not free to move — the
 * realm's `redirectUris` would have to move with it.
 *
 * 🔴 ADR-021 — THERE IS ONE OF THESE NOW, AND IT LIVES AT THE ARTIFACT ROOT.
 * There used to be seven identical copies, one per deployed app. Mounting them
 * per pack would put the callback at `/customer/api/auth/callback/keycloak`,
 * which is not what any realm redirect URI says, so sign-in would fail for
 * every pack at once. This path belongs to the ARTIFACT, not to a pack.
 */
export const { GET, POST } = handlers;
