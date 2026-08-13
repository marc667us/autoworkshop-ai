import { workspaceAuth, type WorkspaceAuth } from '@autoworkshop/auth';

/**
 * THE APPLICATION'S ONE Auth.js INSTANCE.
 *
 * Before ADR-021 there were seven of these, one per deployed web app, each
 * calling `workspaceAuth('<pack>')` and therefore each writing its own session
 * cookie — `authjs.session-token.customer`, `.workshop`, `.supplier` and so on.
 * That was CORRECT while the packs were seven services on seven hostnames: a
 * cookie ignores the port, so one shared name meant the apps overwrote each
 * other's sessions locally, and the per-workspace suffix is what fixed it
 * (2026-08-04).
 *
 * 🔴 THAT REASON IS NOW GONE, AND KEEPING THE SUFFIX WOULD BE ACTIVELY WRONG.
 * One artifact means one origin. Seven cookies on one origin does not isolate
 * anything — every pack is served by the same process, reachable by the same
 * visitor, and the browser sends all seven on every request. What it WOULD do
 * is make a person sign in again each time they move between packs, on a
 * product whose whole point is that a workshop owner also buys parts and a
 * customer also tracks a repair.
 *
 * Authority never came from which cookie was presented. It comes from the
 * membership and the grant resolved server-side in `resolveTenantContext`, and
 * from RLS beneath that. A pack a viewer may not use refuses them with a 404
 * from `requireWorkspaceAccess()` whether or not they hold a session for it.
 *
 * ⚠️ EVERY EXISTING SESSION IS INVALIDATED BY THIS. The cookie name changes, so
 * the old ones are simply not read; everybody signs in once more. That has
 * happened before here (the 2026-08-04 rename) and it reads to a user as being
 * signed out, not as a fault.
 *
 * ⚠️ THE EXPORTS ARE ANNOTATED ONE BY ONE RATHER THAN DESTRUCTURED, and that is
 * inherited deliberately from the seven files this replaces: destructuring
 * makes TypeScript want to WRITE the inferred type, which means naming
 * `next-auth`'s types from an app that does not depend on `next-auth`.
 * Annotating against `WorkspaceAuth` — a type this app can name — avoids adding
 * the provider library to the app's own dependencies.
 */
// 🔴 `'customer'`, NOT `'app'` — AND THIS IS A CORRECTION, MEASURED ON LIVE.
//
// The first version passed `'app'`, on the reasoning that one artifact deserves
// one neutral identifier. `clientIdForWorkspace` turns that into
// `autoworkshop-app-web`, and NO SUCH CLIENT EXISTS in the realm. Keycloak
// answered its auth endpoint with an error page instead of a login form, so the
// signed-in live job reached Keycloak and then timed out waiting for
// `#username` — a failure that looks nothing like "wrong client id".
//
// `customer` is chosen because it is the client the realm ALREADY authorises for
// this exact origin: its `redirectUris` carry `https://autoworkshop.aiappinvent
// .com/*`, which is the artifact. The name is now a misnomer for a client that
// serves all seven packs, and a misnomer is the right trade against editing the
// realm's client list to rename it — Keycloak's redirect allow-list is the thing
// actually constraining the callback, and it already says yes to this origin.
//
// ⚠️ RENAMING THIS LATER IS A REALM CHANGE, NOT A CODE CHANGE. Point it at a new
// client and sign-in breaks everywhere at once, exactly as it did here.
/**
 * 🔴 THE ID THE ARTIFACT AUTHENTICATES WITH — EXPORTED, BECAUSE SIGN-OUT MUST
 * USE THE SAME ONE AND A SECOND LITERAL IS HOW IT STOPPED DOING SO.
 *
 * Measured on live: sign-out navigated to Keycloak's logout endpoint AND STAYED
 * THERE. Keycloak had been handed an `id_token_hint` issued to
 * `autoworkshop-customer-web` (this instance) together with
 * `client_id=autoworkshop-workshop-web`, because each pack's `sign-out-action`
 * still named its own pack. A post-logout redirect that does not belong to the
 * presenting client is refused, so Keycloak ignored it and rendered its own
 * "you are logged out" page — the session really did end, and the person was
 * simply left on Keycloak.
 *
 * That is the "two literals in two files cannot be type-checked into agreement"
 * failure this repository has paid for repeatedly. There is now one literal.
 */
export const ARTIFACT_WORKSPACE = 'customer';

const instance: WorkspaceAuth = workspaceAuth(ARTIFACT_WORKSPACE);

export const handlers: WorkspaceAuth['handlers'] = instance.handlers;
export const auth: WorkspaceAuth['auth'] = instance.auth;
export const signIn: WorkspaceAuth['signIn'] = instance.signIn;
export const signOut: WorkspaceAuth['signOut'] = instance.signOut;
export const getAccessToken: WorkspaceAuth['getAccessToken'] = instance.getAccessToken;
