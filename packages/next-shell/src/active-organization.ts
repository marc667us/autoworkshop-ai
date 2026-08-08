import { cookies } from 'next/headers';

/**
 * Which organization the viewer is currently working in — T-0016.
 *
 * ⚠️ THIS COOKIE IS A PREFERENCE, NOT A CREDENTIAL, and the distinction is the
 * whole security story. It is readable and writable by the browser, so it is
 * treated as a request rather than a fact: the API's `resolveTenantContext`
 * uses it only to SELECT among memberships it has already proved the user holds,
 * and throws outright if the value names an organization they do not.
 *
 * Editing this cookie therefore cannot reach another tenant's data. The worst a
 * tampered value achieves is a rejected request — which is exactly the
 * confused-deputy defence `1.txt` §9 asks for: "the gateway must never trust a
 * tenant identifier supplied only by the client."
 *
 * Read SERVER-SIDE only. It is sent to the API as `x-organization-id`, a header
 * the `TenantGuard` already understood before any of this existed.
 */

/**
 * Not `httpOnly`. A switcher rendered in a client component needs to know the
 * current value to show which option is active, and the value is not secret —
 * the user picked it, and they can see it in their own navigation. Marking it
 * httpOnly would imply a confidentiality it does not have and cannot need.
 *
 * `sameSite: 'lax'` so a cross-site request cannot silently change which
 * organization a logged-in user is acting in, which would be a confusing (if
 * not dangerous) surprise on a page that writes.
 */
// Re-exported rather than redefined — see the note in `active-role.ts`. One
// definition, beside the sign-out code that has to clear it.
export { ACTIVE_ORG_COOKIE } from '@autoworkshop/auth';
import { ACTIVE_ORG_COOKIE } from '@autoworkshop/auth';

/** The stored selection, or `undefined` when the viewer has not chosen. */
export async function activeOrganizationId(): Promise<string | undefined> {
  const store = await cookies();
  const value = store.get(ACTIVE_ORG_COOKIE)?.value?.trim();
  return value ? value : undefined;
}

/**
 * The stored selection as a header, UNVALIDATED.
 *
 * ⚠️ Use `activeOrganizationHeader()` from `viewer.ts` for ordinary API calls —
 * it drops a selection the viewer no longer holds. This raw form exists only
 * for the `/me` lookup itself, which cannot validate against a viewer it has
 * not fetched yet, and which retries without it on failure.
 *
 * Returns an object so callers can spread it: an ABSENT header and an empty
 * one mean different things to the guard, and sending `x-organization-id: ''`
 * would be a request for an organization named "", not an absence of one.
 */
export async function rawOrganizationHeader(): Promise<Record<string, string>> {
  const id = await activeOrganizationId();
  return id ? { 'x-organization-id': id } : {};
}
