import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * The mobile app's OIDC configuration.
 *
 * 🔴 THIS FILE EXISTS BECAUSE THE PACKAGE HAD A `test` SCRIPT AND NO TESTS, AND
 * THAT TURNED CI RED. `vitest run` exits 1 when it finds no test files, so
 * declaring the script without writing any broke the workspace-wide `pnpm test`
 * — which is what the Release workflow runs. I had only ever run the API's
 * suite, so I reported the session green while Release was failing on my change.
 *
 * ⚠️ THE FIX IS NOT `--passWithNoTests`. That would make the suite permanently
 * unable to fail, which is this repository's most expensive recorded defect
 * class — a Playwright suite once exited 0 while running zero tests for two
 * days. A package that claims to be tested has to be tested.
 *
 * What is worth testing here is the DERIVATION. A wrong issuer does not fail
 * loudly at build time; it fails at the Keycloak redirect, after the user has
 * already been sent away from the app, with an error that names neither the app
 * nor the realm.
 */

const mockExtra = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('expo-constants', () => ({
  default: {
    get expoConfig() {
      return { extra: mockExtra.value };
    },
  },
}));

async function loadConfig() {
  vi.resetModules();
  return import('./config');
}

beforeEach(() => {
  mockExtra.value = {};
});

describe('the OIDC issuer is DERIVED, never configured twice', () => {
  it('builds the issuer from the base URL and realm', async () => {
    mockExtra.value = { keycloakUrl: 'https://auth.example.com', keycloakRealm: 'autoworkshop' };
    const { ISSUER } = await loadConfig();
    expect(ISSUER).toBe('https://auth.example.com/realms/autoworkshop');
  });

  it('tolerates a trailing slash on the base URL', async () => {
    // A trailing slash is the single most likely way for someone to mistype
    // this, and `//realms/` is a 404 at Keycloak rather than an obvious error.
    mockExtra.value = { keycloakUrl: 'https://auth.example.com/', keycloakRealm: 'autoworkshop' };
    const { ISSUER } = await loadConfig();
    expect(ISSUER).toBe('https://auth.example.com/realms/autoworkshop');
  });

  it('points every endpoint at the SAME issuer', async () => {
    // Five endpoints derived from one value, so they cannot disagree. Hand-listing
    // them is how a token endpoint ends up on a different realm from the
    // authorization endpoint, which fails only at exchange time.
    mockExtra.value = { keycloakUrl: 'https://auth.example.com', keycloakRealm: 'r1' };
    const { DISCOVERY, ISSUER } = await loadConfig();
    for (const url of Object.values(DISCOVERY)) {
      expect(url.startsWith(`${ISSUER}/protocol/openid-connect/`), url).toBe(true);
    }
  });
});

describe('the development defaults', () => {
  /**
   * ⚠️ `10.0.2.2`, NOT `localhost`. Inside the Android emulator `localhost` is
   * the EMULATED DEVICE, so every request resolves to a port nothing is
   * listening on and the app reports a network failure that has nothing to do
   * with the server. This is the single most common way a working backend looks
   * broken from a phone.
   */
  it('defaults to the emulator host alias, not localhost', async () => {
    const { KEYCLOAK_URL, API_BASE_URL } = await loadConfig();
    expect(KEYCLOAK_URL).toContain('10.0.2.2');
    expect(API_BASE_URL).toContain('10.0.2.2');
    expect(KEYCLOAK_URL).not.toContain('localhost');
  });

  it('lets app.json override the defaults', async () => {
    mockExtra.value = { apiBaseUrl: 'https://api.example.com' };
    const { API_BASE_URL } = await loadConfig();
    expect(API_BASE_URL).toBe('https://api.example.com');
  });

  it('ignores an empty or non-string override rather than adopting it', async () => {
    // An empty string in `extra` is what a half-finished config looks like, and
    // adopting it would produce requests to `/realms/...` with no host.
    mockExtra.value = { apiBaseUrl: '', keycloakRealm: 42 };
    const { API_BASE_URL, ISSUER } = await loadConfig();
    expect(API_BASE_URL).toContain('10.0.2.2');
    expect(ISSUER).toContain('/realms/autoworkshop');
  });
});

describe('the client is public with no secret — RFC 8252', () => {
  it('names the realm client that exists', async () => {
    // `autoworkshop-mobile` is declared in realm-autoworkshop.json. A client id
    // that matches no client fails at the redirect with "Client not found",
    // after the user has already left the app.
    const { CLIENT_ID } = await loadConfig();
    expect(CLIENT_ID).toBe('autoworkshop-mobile');
  });

  it('exports no client secret — a shipped binary cannot keep one', async () => {
    const mod = await loadConfig();
    const names = Object.keys(mod).join(' ').toLowerCase();
    expect(names).not.toContain('secret');
  });

  it('requests offline_access so a technician is not re-prompted all day', async () => {
    const { SCOPES } = await loadConfig();
    expect(SCOPES).toContain('openid');
    expect(SCOPES).toContain('offline_access');
  });
});
