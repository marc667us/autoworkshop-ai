import * as React from 'react';
import { OrganizationSwitcher } from './OrganizationSwitcher';
import { setActiveOrganizationAction } from './set-organization-action';
import { organizationsFromMemberships } from './viewer-contract';
import type { ViewerDescription } from './viewer-contract';

/**
 * The "WHERE am I" control — the organisation switcher, mounted once, used by
 * all seven apps.
 *
 * ⚠️ THE ROLE SWITCHER USED TO LIVE HERE AND DELIBERATELY NO LONGER DOES
 * (owner request 2026-08-03). This node is passed as `organizationSwitcher`,
 * which `TopNav` renders in the LEFT selector cluster — the one hidden below
 * 1024px — so the role was both in the wrong corner and invisible on a tablet.
 * It is now `ActingAsControl`, in the top-RIGHT cluster beside the User chip,
 * where a read-only chip stands in for it when the viewer holds a single role.
 *
 * WHY THIS COMPONENT EXISTS. The organization switcher (T-0016) and the role
 * switcher (owner request 2026-07-31) were each written inline in
 * `workshop-web/app/layout.tsx` — about thirty-five lines including an inline
 * `'use server'` closure. Rolling that out meant pasting it into six more
 * layouts, and a rule duplicated seven times is a rule that will disagree with
 * itself. It is one `<ViewerSwitchers viewer={viewer} />` in every layout now.
 *
 * ⚠️ A SERVER COMPONENT WITH NO `'use client'`, DELIBERATELY. It reads the
 * viewer the layout already resolved and renders two client components with
 * plain server actions — the normal direction across the boundary. The reverse
 * (a server caller reaching into a client module) is what crashed every page in
 * the app on 2026-07-31 while typecheck, lint and `next build` all passed; see
 * the header of `role-label.ts`. After changing this file, LOAD A PAGE.
 *
 * ⚠️ NOT AN AUTHORIZATION CONTROL. It lists only what `/me` reported as the
 * viewer's own memberships, and the API re-validates the choice against
 * memberships proved from the validated token — a request naming an
 * organization the viewer does not hold is REFUSED, never silently downgraded
 * to one they do. That refusal is the control; this is the convenience
 * (CLAUDE.md §8).
 *
 * Renders NOTHING when there is no viewer, and nothing below two organizations
 * — a `<select>` that cannot change anything invites the user to interact with
 * something inert. `TopNav` then falls back to its read-only Organization chip,
 * so the organisation is still stated; only the control disappears.
 */
export function ViewerSwitchers({ viewer }: { viewer: ViewerDescription | null }) {
  if (!viewer) return null;

  const organizations = organizationsFromMemberships(viewer.memberships);

  // Below the render threshold: emit nothing at all rather than an empty flex
  // wrapper. ⚠️ Returning `null` is what lets `TopNav` fall back to the chip —
  // `organizationSwitcher ?? <Selector …>` treats an empty wrapper as a supplied
  // control and would leave the organisation unnamed.
  if (organizations.length < 2) return null;

  return (
    <OrganizationSwitcher
      organizations={organizations}
      activeId={viewer.organizationId}
      action={setActiveOrganizationAction}
    />
  );
}
