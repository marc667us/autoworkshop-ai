'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACTIVE_ORG_COOKIE } from './active-organization';
import { ACTIVE_ROLE_COOKIE } from './active-role';

/**
 * Store which organization the viewer is working in — T-0016.
 *
 * ⚠️ IT VALIDATES NOTHING, ON PURPOSE, AND THAT IS SAFE FOR ONE REASON: the
 * value is not trusted anywhere. It is sent to the API as `x-organization-id`,
 * and `resolveTenantContext` uses it ONLY to select among memberships the
 * server has already proved the user holds — a value naming an organization
 * they do not hold is REFUSED outright, never silently downgraded.
 *
 * So the worst a tampered cookie achieves is that the viewer's own requests
 * start failing until they pick again. Re-checking membership here as well
 * would need a second round trip on every switch and would still not be the
 * control, because a server action is a public endpoint that anyone can call
 * directly. The check belongs where it cannot be skipped (CLAUDE.md §8).
 *
 * A malformed value is dropped rather than stored, which is not security —
 * it just stops a junk cookie making every subsequent request fail with a
 * confusing error instead of simply doing nothing.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setActiveOrganizationAction(formData: FormData): Promise<void> {
  const id = String(formData.get('organizationId') ?? '').trim();
  if (!UUID.test(id)) return;

  const store = await cookies();
  store.set(ACTIVE_ORG_COOKIE, id, {
    path: '/',
    // Readable by the client: the switcher shows which option is active, and
    // the value is the user's own choice, not a secret. See the note in
    // `active-organization.ts`.
    httpOnly: false,
    sameSite: 'lax',
    // Follows the deployment, not `NODE_ENV`. Hard-coding `secure` from the
    // build environment is exactly the defect that made the session cookie
    // name wrong under `next start` over http (2026-07-28) — the cookie was
    // set with a flag the URL scheme did not match, so nothing ever read it.
    secure: process.env['AUTH_URL']?.startsWith('https://') ?? false,
    maxAge: 60 * 60 * 24 * 365,
  });

  // ⚠️ CHANGING ORGANIZATION CLEARS THE STORED ROLE, and without this the pair
  // can be left half-changed. The two values travel together on every request
  // (`x-organization-id` + `x-role-name`) and `resolveTenantContext` requires a
  // membership matching BOTH — so keeping a role from the organization you just
  // LEFT makes every subsequent request refused, with a switcher that appears
  // to have worked.
  //
  // The mirror of the fix in `rolesFromMemberships`, which stops the role list
  // offering a role from another organization. That one guards the role change;
  // this one guards the organization change. Either alone leaves the other
  // direction broken.
  //
  // Clearing is not a downgrade: the API then takes its own deterministic
  // default in the new organization, which is the STRONGEST role held there
  // (`ROLE_PRECEDENCE`). The viewer picks again from a list that now describes
  // where they actually are.
  store.delete(ACTIVE_ROLE_COOKIE);

  // Every screen is scoped by organization, so all of them are now stale.
  revalidatePath('/', 'layout');

  // 🔴 AND NAVIGATE, FOR THE SAME REASON THE ROLE SWITCHER DOES.
  //
  // Found by Codex reviewing the role-switch fix: fixing that one alone left
  // this one broken in exactly the same way, which is why it is in the same
  // change. Changing organisation clears the role above, so the API then picks
  // the STRONGEST role held in the NEW organisation — and that role may belong
  // to a different pack. Switching organisation while on `/admin/...` into an
  // organisation whose default is `workshop_owner` strands the viewer on a pack
  // they can no longer enter: the identical ADR-021 failure.
  //
  // `/` RATHER THAN A COMPUTED PACK, deliberately. The new role is not known
  // here — it was just cleared, and only the API can resolve it. The front door
  // already does exactly this dispatch (`apps/web/app/page.tsx`), so sending
  // the viewer there resolves the new context once, in the one place that owns
  // the decision, instead of guessing it twice.
  //
  // ⚠️ `redirect()` THROWS by design (NEXT_REDIRECT). Keep it LAST and never
  // inside a try/catch.
  redirect('/');
}
