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
const instance: WorkspaceAuth = workspaceAuth('app');

export const handlers: WorkspaceAuth['handlers'] = instance.handlers;
export const auth: WorkspaceAuth['auth'] = instance.auth;
export const signIn: WorkspaceAuth['signIn'] = instance.signIn;
export const signOut: WorkspaceAuth['signOut'] = instance.signOut;
export const getAccessToken: WorkspaceAuth['getAccessToken'] = instance.getAccessToken;
