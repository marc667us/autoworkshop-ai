import type { WorkspaceId } from '@autoworkshop/navigation';

/**
 * Where Keycloak is, and which client each workspace authenticates as.
 *
 * Every value is read from the environment at CALL TIME, never captured at
 * module load. A module-scope read is evaluated when Next collects the route
 * during `next build`, so the build machine's environment gets baked into the
 * bundle and the deployed app authenticates against whatever realm the builder
 * happened to have configured. The same class of mistake as computing a
 * per-request value at module scope — see the dashboard page.
 */

/** Thrown when required configuration is absent, rather than defaulting. */
export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthConfigError';
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    // Naming the variable is safe; printing its value would not be. An absent
    // AUTH_SECRET must stop the app, not silently produce a session nobody
    // else can decrypt after the next restart.
    throw new AuthConfigError(`${name} is not set — authentication cannot start`);
  }
  return value;
}

/**
 * The realm's OIDC issuer.
 *
 * This exact string is also what the API's `KeycloakJwtService` validates the
 * `iss` claim against, so the two MUST be derived the same way from the same
 * two variables. If they drift, tokens this package mints are rejected by the
 * API with "token rejected: jwt issuer invalid" — an error that reads like a
 * signing problem and is a configuration one.
 */
export function keycloakIssuer(): string {
  const base = process.env['KEYCLOAK_URL'] ?? 'http://localhost:8080';
  const realm = process.env['KEYCLOAK_REALM'] ?? 'autoworkshop';
  return `${base.replace(/\/$/, '')}/realms/${realm}`;
}

/**
 * The Keycloak client id for a workspace.
 *
 * DERIVED, not configured per app. The realm defines exactly seven browser
 * clients and they are named `autoworkshop-<workspace>-web` without exception
 * (`infrastructure/keycloak/realm-autoworkshop.json`). Deriving the name removes
 * seven independent chances to typo it into a client that does not exist —
 * which fails at the Keycloak redirect with "Client not found", after the user
 * has already been sent away from the app.
 *
 * `.env` carried a `KEYCLOAK_CLIENT_ID=autoworkshop-web` that matches no client
 * in the realm; that variable is deliberately NOT read here.
 */
export function clientIdForWorkspace(workspaceId: WorkspaceId | string): string {
  return `autoworkshop-${workspaceId}-web`;
}

/** The session encryption key. Absent = hard failure, never a generated default. */
export function authSecret(): string {
  return required('AUTH_SECRET');
}

/**
 * Base URL of the NestJS API, for the server-side `/me` call.
 *
 * Defaults to the local API port because that is where `pnpm dev` puts it; a
 * deployment sets it explicitly.
 */
export function apiBaseUrl(): string {
  return (process.env['API_BASE_URL'] ?? 'http://localhost:4000').replace(/\/$/, '');
}
