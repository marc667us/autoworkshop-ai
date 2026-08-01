import * as SecureStore from 'expo-secure-store';

/**
 * Where tokens live on the device.
 *
 * 🔴 `expo-secure-store`, NEVER `AsyncStorage`. This is the single security
 * decision that matters most in the mobile app, and the wrong choice looks
 * identical in every test:
 *
 *   * `AsyncStorage` is an unencrypted SQLite file in the app's sandbox. On a
 *     rooted or compromised device — or through any backup that includes app
 *     data — a refresh token stored there is readable as plain text.
 *   * `SecureStore` puts the value in the Android Keystore, hardware-backed
 *     where the device provides it. The app can read it; a file copy cannot.
 *
 * A refresh token is a long-lived credential: whoever holds it can mint access
 * tokens until it is revoked. It is the one value in this application that most
 * deserves the stronger store, and both options have the same API shape, which
 * is exactly why the weaker one gets chosen by accident.
 */

const ACCESS = 'aw.access_token';
const REFRESH = 'aw.refresh_token';
const EXPIRY = 'aw.access_expires_at';

export interface StoredSession {
  accessToken: string;
  refreshToken: string | null;
  /** Epoch milliseconds. */
  expiresAt: number;
}

/**
 * ⚠️ EVERY READ IS GUARDED. `SecureStore.getItemAsync` throws rather than
 * returning null when the underlying keystore entry cannot be decrypted — which
 * really happens after an OS upgrade, a restore onto a different device, or a
 * keystore reset. An unguarded read turns that into a crash on launch, and the
 * user cannot even reach the sign-in button to recover. Treating it as "no
 * session" sends them to sign-in, which is the state they are actually in.
 */
async function read(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function saveSession(s: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(ACCESS, s.accessToken);
  await SecureStore.setItemAsync(EXPIRY, String(s.expiresAt));
  if (s.refreshToken) {
    await SecureStore.setItemAsync(REFRESH, s.refreshToken);
  } else {
    // A response without a refresh token must CLEAR the old one rather than
    // leave it. Keeping a stale refresh token alongside a new access token is
    // how a "signed out" app silently signs itself back in.
    await clearKey(REFRESH);
  }
}

export async function loadSession(): Promise<StoredSession | null> {
  const accessToken = await read(ACCESS);
  if (!accessToken) return null;
  const expiresAt = Number((await read(EXPIRY)) ?? 0);
  return {
    accessToken,
    refreshToken: await read(REFRESH),
    // A missing or unparseable expiry is treated as ALREADY EXPIRED, not as
    // "no expiry". Fail closed: the worst case is one unnecessary refresh.
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
  };
}

async function clearKey(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Already absent, which is the state being asked for.
  }
}

/**
 * Forget everything.
 *
 * ⚠️ THIS IS NOT SIGN-OUT ON ITS OWN. Clearing local tokens leaves the refresh
 * token VALID at Keycloak until it expires, and leaves the browser's Keycloak
 * session cookie intact — so "sign out" followed by "sign in" would silently
 * return the same session without a password prompt, on a device the user may
 * have just handed to somebody else. `signOut()` in `session.ts` revokes at the
 * server and ends the Keycloak session as well. CLAUDE.md §9: frontend token
 * deletion is not enough.
 */
export async function clearSession(): Promise<void> {
  await Promise.all([clearKey(ACCESS), clearKey(REFRESH), clearKey(EXPIRY)]);
}
