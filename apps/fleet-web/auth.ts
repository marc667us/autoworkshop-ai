import { workspaceAuth, type WorkspaceAuth } from '@autoworkshop/auth';

/**
 * This app's Auth.js instance — the fleet workspace.
 *
 * `workspaceAuth` memoises per workspace, so the route handler, the middleware
 * and `@autoworkshop/next-shell`'s viewer resolution all share ONE instance and
 * therefore one cookie name and one secret. Building a second instance would
 * produce a session this app could set and not read back.
 *
 * The Keycloak client is derived from the workspace id
 * (`autoworkshop-fleet-web`); there is nothing per-app to configure here.
 *
 * WHY EVERY EXPORT CARRIES AN EXPLICIT TYPE. Without them tsc fails with
 * TS2742: "the inferred type of 'auth' cannot be named without a reference to
 * '../../packages/auth/node_modules/next-auth/lib'". pnpm gives each package its
 * own isolated `node_modules`, so next-auth's internal types are reachable from
 * `@autoworkshop/auth` and not from here — and with `declaration: true` tsc has
 * to be able to WRITE the type, not merely know it. Annotating against
 * `WorkspaceAuth`, which this app can name, removes the need to reach through.
 * Re-exporting `next-auth` from the app's own dependencies would also silence
 * it, at the cost of seven packages pinning the provider library directly.
 */
const instance: WorkspaceAuth = workspaceAuth('fleet');

export const handlers: WorkspaceAuth['handlers'] = instance.handlers;
export const auth: WorkspaceAuth['auth'] = instance.auth;
export const signIn: WorkspaceAuth['signIn'] = instance.signIn;
export const signOut: WorkspaceAuth['signOut'] = instance.signOut;
export const getAccessToken: WorkspaceAuth['getAccessToken'] = instance.getAccessToken;
