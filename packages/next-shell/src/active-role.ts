import { cookies } from 'next/headers';

/**
 * Which ROLE the viewer is currently acting as — the role switcher.
 *
 * Owner request 2026-07-31: one login that can play every role it holds,
 * without signing out.
 *
 * ⚠️ THIS COOKIE IS A PREFERENCE, NOT A CREDENTIAL, exactly like
 * `ACTIVE_ORG_COOKIE`, and the distinction is the whole security story. The
 * browser can read and write it, so it is treated as a REQUEST rather than a
 * fact: the API's `resolveTenantContext` uses it only to SELECT among
 * memberships it has already proved from the validated token subject, and
 * THROWS if the value names a role the user does not hold.
 *
 * Editing this cookie therefore cannot grant a role. The worst a tampered value
 * achieves is a rejected request — never a quiet downgrade to a role you do
 * hold, because a silent downgrade hides an authorization probe.
 *
 * Read SERVER-SIDE only. Sent to the API as `x-role-name`.
 */

/**
 * Not `httpOnly`, for the same reason as the organization cookie: the switcher
 * needs to show which option is active, and the value is not secret — the user
 * picked it and can see it in their own navigation. Marking it httpOnly would
 * imply a confidentiality it does not have and cannot need.
 *
 * `sameSite: 'lax'` so a cross-site request cannot silently change which role a
 * signed-in user is acting in — which on a page that WRITES would be a
 * genuinely dangerous surprise, not merely a confusing one.
 */
// 🔴 RE-EXPORTED, NOT REDEFINED. The name used to be declared here, while the
// code that must DELETE it on sign-out lives in `@autoworkshop/auth` — two
// declarations of one string, in packages that cannot import each other's
// version. On 2026-08-07 sign-out did not clear this cookie at all and the next
// person to sign in inherited the previous person's role; a second copy of the
// name is how that stays possible after it is fixed. The definition now lives
// beside the code that ends the session, and this import path is unchanged so
// nothing that already reads it had to move.
export { ACTIVE_ROLE_COOKIE } from '@autoworkshop/auth';
import { ACTIVE_ROLE_COOKIE } from '@autoworkshop/auth';

/** The stored selection, or `undefined` when the viewer has not chosen. */
export async function activeRoleName(): Promise<string | undefined> {
  const store = await cookies();
  const value = store.get(ACTIVE_ROLE_COOKIE)?.value?.trim();
  return value ? value : undefined;
}

/**
 * The header WITHOUT the membership check — for the `/me` call itself.
 *
 * ⚠️ THE UNCHECKED VARIANT EXISTS BECAUSE THE CHECK NEEDS `/me`. `activeRoleHeader`
 * in `viewer.ts` drops a role the viewer no longer holds, and to know that it
 * must first fetch the viewer — so `/me` cannot use it without calling itself.
 * Exactly the same reasoning, and the same pair of functions, as
 * `rawOrganizationHeader`.
 *
 * Sending an unchecked value is safe: the API validates `x-role-name` against
 * memberships proved from the token subject and REFUSES one the user does not
 * hold. `fetchViewer` retries without the selection when that happens, so a
 * stale cookie degrades to the API's own default rather than locking the viewer
 * out of the shell that contains the switcher.
 */
export async function rawRoleHeader(): Promise<Record<string, string>> {
  const role = await activeRoleName();
  return role ? { 'x-role-name': role } : {};
}
