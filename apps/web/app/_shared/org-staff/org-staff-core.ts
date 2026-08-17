import { revalidatePath } from 'next/cache';
import { apiPatch, apiPost, currentViewer } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * Appointing and removing members of a NON-WORKSHOP organisation.
 *
 * ── 🔴 WHY THIS EXISTS ──────────────────────────────────────────────────────
 *
 * Migration 085 gave insurers and towing firms an org-admin role, because
 * neither had one: `insurance_assessor` and `towing_operator` are absent from
 * `CAN_GRANT_MEMBERSHIP`, so those two organisation types could hold exactly one
 * member — the founder — for ever.
 *
 * The Supervisor then found that 085 was only half the fix. **The grant
 * authority had no caller.** The only `POST /memberships` in the product was
 * `workshop/_screens/staff-actions.ts`, so an insurer's founder could hold the
 * permission and still have no screen to use it from — the navigation entry it
 * revealed fell through to the "not built yet" placeholder. A capability with no
 * way in is not a feature; this repository records that as "a route with no
 * caller is not shipped".
 *
 * ── WHY THE IMPLEMENTATION IS SHARED AND THE ACTIONS ARE NOT ────────────────
 *
 * The rules — organisation from the session, email not uuid, revoke not delete,
 * every refusal naming a way forward — are identical for every organisation
 * type, and CLAUDE.md §3 says extend rather than duplicate. So the behaviour
 * lives here once.
 *
 * The `'use server'` entry points stay per-pack because a server action is
 * identified by its module, and the workspace id decides which API credential
 * and which cookie scope the request uses. Passing it as a parameter from the
 * CLIENT would make the workspace attacker-controlled; binding it in a
 * per-pack server module keeps it a server-side constant.
 */

/** Read a trimmed field, or `undefined` when it is blank. */
function read(formData: FormData, key: string): string | undefined {
  const v = String(formData.get(key) ?? '').trim();
  return v === '' ? undefined : v;
}

/**
 * Appoint somebody to the caller's own organisation.
 *
 * ⚠️ THE ORGANISATION COMES FROM THE SESSION, NEVER FROM THE FORM — the same
 * rule the workshop version documents. A hidden field would let a caller
 * attempt a grant into another organisation whose id they happen to know. The
 * API re-checks it against the active tenant, but a form that offers the value
 * at all invites the attempt and fails confusingly.
 */
export async function addOrgMember(
  workspaceId: string,
  revalidate: readonly string[],
  formData: FormData,
): Promise<ActionResult> {
  const viewer = await currentViewer(workspaceId);
  if (!viewer) return { error: 'Your session has ended. Sign in again, then retry.' };

  const result = await apiPost(workspaceId, '/memberships', {
    userEmail: read(formData, 'userEmail'),
    organizationId: viewer.organizationId,
    roleName: read(formData, 'roleName'),
  });

  if (!result.ok) {
    // ⚠️ EVERY REFUSAL NAMES A REACHABLE ALTERNATIVE. A rule whose escape hatch
    // does not exist is a wall, and walls are the most expensive defect class
    // recorded in this repository. The API's own sentence is preferred wherever
    // it sends one, because it knows which rule refused.
    const error =
      result.reason === 'invalid'
        ? (result.message ?? 'Those details were not accepted. Check the email and the role.')
        : result.reason === 'forbidden'
          ? (result.message ??
            'Your role may not appoint people. Only the administrator who registered this organisation can.')
          : result.reason === 'unauthenticated'
            ? 'Your session has ended. Sign in again, then retry.'
            : result.reason === 'notFound'
              ? (result.message ??
                'No account with that email address. Ask them to sign up first, then add them here.')
              : 'The service did not respond. Nothing has been changed — try again shortly.';
    return { error };
  }

  for (const path of revalidate) revalidatePath(path);
  return { created: 'Added. They can sign in and will see this organisation immediately.' };
}

/**
 * Remove somebody's access.
 *
 * ⚠️ A STATUS CHANGE, NEVER A DELETE. `identity.memberships` keeps the row so
 * that "was this person ever granted access, and by whom?" stays answerable —
 * the API exposes `PATCH /:id/status` and no DELETE at all, deliberately.
 *
 * 🔴 THIS IS THE HALF THAT WAS UNREACHABLE. `withdraw()` needs a membership id,
 * and the only source of one is `GET /memberships` — which was gated on
 * `assertWorkshopStaff` and refused every partner role. So before this screen
 * existed, an appointment made through the API could never be reversed.
 */
export async function withdrawOrgMember(
  workspaceId: string,
  revalidate: readonly string[],
  formData: FormData,
): Promise<ActionResult> {
  const membershipId = String(formData.get('membershipId') ?? '').trim();
  if (!membershipId) return { error: 'Nothing was selected. Reload the page and try again.' };

  const result = await apiPatch(workspaceId, `/memberships/${membershipId}/status`, {
    // `revoked`, not `suspended`: this control is "remove". Suspension is a
    // different decision and deserves its own control rather than being what
    // "remove" quietly does.
    status: 'revoked',
  });

  if (!result.ok) {
    const error =
      result.reason === 'invalid'
        ? (result.message ?? 'That change was not accepted.')
        : result.reason === 'forbidden'
          ? (result.message ?? 'Your role may not change who has access.')
          : result.reason === 'unauthenticated'
            ? 'Your session has ended. Sign in again, then retry.'
            : result.reason === 'notFound'
              ? 'That membership no longer exists. Reload the page.'
              : 'The service did not respond. Nothing has been changed — try again shortly.';
    return { error };
  }

  for (const path of revalidate) revalidatePath(path);
  return { created: 'Removed. They can no longer see this organisation.' };
}
