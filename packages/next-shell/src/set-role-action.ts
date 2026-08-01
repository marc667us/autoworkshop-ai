'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { ACTIVE_ROLE_COOKIE } from './active-role';

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
  await setActiveRoleAction(String(formData.get('roleName') ?? ''));
}
