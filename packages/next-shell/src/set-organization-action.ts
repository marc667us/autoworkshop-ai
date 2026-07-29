'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACTIVE_ORG_COOKIE } from './active-organization';

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

  // Every screen is scoped by organization, so all of them are now stale.
  revalidatePath('/', 'layout');
}
