'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ACTIVE_ROLE_COOKIE } from './active-role';
import { homeWorkspaceFor } from './viewer-contract';

/**
 * Store which role the viewer is acting as.
 *
 * ⚠️ THIS DELIBERATELY DOES NOT VALIDATE, AND THAT IS NOT AN OVERSIGHT.
 * Validating here would put a SECOND authority on what a role means, and two
 * authorities drift. The single authority is `resolveTenantContext` in the API,
 * which checks `x-role-name` against memberships proved from the validated
 * token subject and REFUSES a role the user does not hold.
 *
 * Writing a role you cannot use therefore achieves nothing: every subsequent
 * request is rejected until you pick one you hold. That is the correct failure
 * — loud and immediate — rather than a client-side check that could be bypassed
 * anyway by writing the cookie directly, which the browser can already do.
 *
 * The control that calls this only OFFERS roles the viewer holds, which is a
 * usability property, not a security one. `05.txt`'s "hidden is not secure"
 * rule applies to both halves.
 */
export async function setActiveRoleAction(roleName: string): Promise<void> {
  const store = await cookies();
  const value = roleName.trim();

  if (value === '') {
    // Clearing is a real choice: it returns the viewer to the API's own
    // deterministic default rather than pinning them to a role forever.
    store.delete(ACTIVE_ROLE_COOKIE);
  } else {
    store.set(ACTIVE_ROLE_COOKIE, value, {
      path: '/',
      sameSite: 'lax',
      // Not httpOnly — see active-role.ts. The switcher must render the current
      // selection, and the value is the user's own choice, not a secret.
      httpOnly: false,
    });
  }

  // ⚠️ REVALIDATE EVERYTHING, NOT JUST THIS PAGE. The role changes what the
  // NAVIGATION contains as well as what each page returns, so a partial
  // revalidation would leave the shell advertising the old role's menu around
  // the new role's content — the nav/router divergence this codebase works hard
  // to prevent.
  revalidatePath('/', 'layout');

  // ⚠️ THIS SETTER MUTATES AND REVALIDATES. IT DELIBERATELY DOES NOT NAVIGATE.
  // It is re-exported from `index.ts` as the reusable string-shaped helper, and
  // a mutation primitive that always throws NEXT_REDIRECT is an API trap for the
  // next caller. The navigation belongs to the SWITCHER, and lives in the form
  // action below. (Codex, this diff.)
}

/**
 * The same action in the shape a `<form action={...}>` needs.
 *
 * WHY IT LIVES HERE RATHER THAN IN EACH APP'S LAYOUT. `RoleSwitcher` posts a
 * form, so it needs `(formData) => …`; `setActiveRoleAction` takes a string
 * because that is the useful signature for any other caller. The gap was
 * previously closed by an inline `'use server'` closure written out in
 * `workshop-web`'s layout — which is exactly the thing that does not survive
 * being copied into six more layouts, because a rule that exists in seven
 * places drifts in six of them.
 *
 * `setActiveOrganizationAction` already has this shape, so both switchers now
 * take a plain exported action and the app layouts declare no actions at all.
 */
export async function setActiveRoleFromFormAction(formData: FormData): Promise<void> {
  const roleName = String(formData.get('roleName') ?? '');
  await setActiveRoleAction(roleName);

  // 🔴 THEN GO WHERE THAT ROLE LIVES. Revalidating in place was right until
  // ADR-021 and is wrong now.
  //
  // OWNER REPORT 2026-08-16: "it only sees admin which was nothing meaningful",
  // then "do not have access error message". Switching from
  // `platform_administrator` to `workshop_owner` while on `/admin/...` left the
  // viewer there — a pack they no longer hold `platform.admin` for — so the
  // layout refused them and the switch looked like it only broke the page.
  //
  // When each pack was its own deployed host there was nowhere to send anyone.
  // One artifact with seven path-prefixed packs makes a role change usually a
  // PACK change, and `homeWorkspaceFor` already encodes which pack a role
  // belongs to — `/` dispatches with it (viewer-contract.ts:225). This was the
  // other caller that needed it and never got it.
  //
  // The pack ROOT, not a manufactured `/home/dashboard`: each root already
  // knows its own real landing route. Clearing the role goes to `/`, which
  // re-dispatches on the API's deterministic default.
  //
  // ⚠️ NOT AN OPEN REDIRECT even though `roleName` is user-controlled: it is
  // never interpolated. `homeWorkspaceFor` is a fixed lookup returning one of
  // seven literals, so `//evil.com` or `../admin` simply miss the map and
  // become `workshop`.
  //
  // ⚠️ `redirect()` THROWS by design (NEXT_REDIRECT). It stays LAST and must
  // never be wrapped in try/catch, or the navigation is swallowed and this
  // regresses to the in-place behaviour it fixes.
  redirect(roleName.trim() === '' ? '/' : `/${homeWorkspaceFor(roleName.trim())}`);
}
