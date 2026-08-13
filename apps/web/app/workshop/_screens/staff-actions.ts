'use server';

import { revalidatePath } from 'next/cache';
import { apiPatch, apiPost, currentViewer } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * Adding and removing workshop staff — `07.txt` pt2 §50.
 *
 * ── 🔴 WHY THIS EXISTS AT ALL ───────────────────────────────────────────────
 *
 * `MembershipService.grant()` has been complete since Phase 2 — role gate,
 * tenant check, branch check, audit — and until now it had **no reachable
 * caller**. It took a `userId`, and the only source of one is `GET /users`,
 * which is driven FROM `identity.memberships` and therefore lists people who
 * are ALREADY members. So there was no path, from any screen that could exist,
 * to add a colleague. A workshop owner could not hire anybody.
 *
 * The same shape as Solar's `link_sponsor_user()`, which also had no caller
 * outside its tests and made third-level approval unreachable. A capability
 * with no way in is not a feature, it is a wall.
 *
 * The API now accepts `userEmail` and resolves it server-side, which is why
 * this action sends an address and never a uuid.
 */

/** Add a colleague to this workshop. */
export async function addStaffAction(formData: FormData): Promise<ActionResult> {
  const read = (k: string) => {
    const v = String(formData.get(k) ?? '').trim();
    return v === '' ? undefined : v;
  };

  // ⚠️ THE ORGANISATION COMES FROM THE SESSION, NEVER FROM THE FORM. A hidden
  // field would let a caller grant a membership into another organisation they
  // happen to know the id of — and `grant()` does re-check it against the
  // active tenant, but a form that offers the value at all invites the attempt
  // and would 404 confusingly when it failed.
  const viewer = await currentViewer('workshop');
  if (!viewer) return { error: 'Your session has ended. Sign in again, then retry.' };

  const result = await apiPost('workshop', '/memberships', {
    userEmail: read('userEmail'),
    organizationId: viewer.organizationId,
    roleName: read('roleName'),
  });

  if (!result.ok) {
    const error =
      result.reason === 'invalid'
        ? (result.message ?? 'Those details were not accepted. Check the email and role.')
        : result.reason === 'forbidden'
          ? (result.message ?? 'Your role may not add staff. Only a workshop owner can.')
          : result.reason === 'unauthenticated'
            ? 'Your session has ended. Sign in again, then retry.'
            : result.reason === 'notFound'
              ? // The API's own sentence names the way forward — "ask them to
                // sign up first" — and inventing a vaguer one here would turn a
                // solvable refusal into a dead end.
                (result.message ??
                'No account with that email address. Ask them to sign up first.')
              : 'The service did not respond. Nothing has been changed — try again shortly.';
    return { error };
  }

  for (const path of ['/workshop-management/staff', '/settings/staff-and-roles']) {
    revalidatePath(path);
  }
  return { created: 'Added. They can sign in and will see this workshop immediately.' };
}

/**
 * Remove someone's access.
 *
 * ⚠️ A STATUS CHANGE, NEVER A DELETE. `identity.memberships` keeps the row so
 * that "was this person ever granted access, and by whom?" stays answerable —
 * the API exposes `PATCH /:id/status` and no DELETE at all, deliberately.
 */
export async function withdrawStaffAction(formData: FormData): Promise<ActionResult> {
  const membershipId = String(formData.get('membershipId') ?? '').trim();
  if (!membershipId) return { error: 'Nothing was selected. Reload the page and try again.' };

  const result = await apiPatch('workshop', `/memberships/${membershipId}/status`, {
    // `revoked`, not `suspended`: this button is "remove", and suspension is a
    // different decision that deserves its own control rather than being what
    // "remove" quietly does.
    status: 'revoked',
  });

  if (!result.ok) {
    const error =
      result.reason === 'invalid'
        ? (result.message ?? 'That change was not accepted.')
        : result.reason === 'forbidden'
          ? (result.message ?? 'Your role may not change staff access.')
          : result.reason === 'unauthenticated'
            ? 'Your session has ended. Sign in again, then retry.'
            : result.reason === 'notFound'
              ? 'That membership no longer exists. Reload the page.'
              : 'The service did not respond. Nothing has been changed — try again shortly.';
    return { error };
  }

  for (const path of ['/workshop-management/staff', '/settings/staff-and-roles']) {
    revalidatePath(path);
  }
  return { created: 'Removed. They can no longer see this workshop.' };
}
