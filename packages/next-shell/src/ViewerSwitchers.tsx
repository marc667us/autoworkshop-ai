import * as React from 'react';
import { OrganizationSwitcher } from './OrganizationSwitcher';
import { RoleSwitcher } from './RoleSwitcher';
import { setActiveOrganizationAction } from './set-organization-action';
import { setActiveRoleFromFormAction } from './set-role-action';
import { organizationsFromMemberships, rolesFromMemberships } from './viewer-contract';
import type { ViewerDescription } from './viewer-contract';

/**
 * The "who am I acting as, and where" control group — BOTH switchers, mounted
 * once, used by all seven apps.
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
 * ⚠️ NEITHER SWITCHER IS AN AUTHORIZATION CONTROL. Both list only what `/me`
 * reported as the viewer's own memberships, and the API re-validates each
 * choice against memberships proved from the validated token — a request naming
 * an organization or role the viewer does not hold is REFUSED, never silently
 * downgraded to one they do. That refusal is the control; this is the
 * convenience (CLAUDE.md §8).
 *
 * Renders NOTHING when there is no viewer, and each switcher independently
 * renders nothing below two options — so a viewer with one role and one
 * organization sees no inert controls, which is most viewers today.
 */
export function ViewerSwitchers({ viewer }: { viewer: ViewerDescription | null }) {
  if (!viewer) return null;

  const organizations = organizationsFromMemberships(viewer.memberships);
  // ⚠️ SCOPED TO THE ACTIVE ORGANIZATION. Every request sends both headers and
  // the API requires a membership matching BOTH, so a role held only in another
  // organization is not a choice that can be honoured from here — see
  // `rolesFromMemberships`. Switching organization clears the stored role, so
  // the pair can never be left half-changed.
  const roles = rolesFromMemberships(viewer.memberships, viewer.organizationId);

  // Both switchers are below their own render threshold: emit nothing at all
  // rather than an empty flex wrapper that still occupies the top bar's gap.
  if (organizations.length < 2 && roles.length < 2) return null;

  return (
    <span style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
      <OrganizationSwitcher
        organizations={organizations}
        activeId={viewer.organizationId}
        action={setActiveOrganizationAction}
      />
      <RoleSwitcher roles={roles} activeRole={viewer.activeRole} action={setActiveRoleFromFormAction} />
    </span>
  );
}
