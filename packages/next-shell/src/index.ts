export { AccountControl } from './AccountControl';
export type { AccountControlProps } from './AccountControl';
export { WorkspaceShell } from './WorkspaceShell';
export type { WorkspaceShellProps } from './WorkspaceShell';
export { renderModulePage } from './ModulePage';
export { currentViewer, viewerGrants, viewerRole } from './viewer';

/**
 * The PURE half of the viewer contract, re-exported so consumers that cannot
 * run in a Next server runtime — the Playwright journey, Storybook, unit tests —
 * can reason about a viewer without importing `next/headers`. Importing
 * `./viewer` from those contexts fails at module load, and the usual repair is
 * to hardcode the expected values, at which point the test stops testing the
 * model it is meant to guard.
 */
export {
  grantsFor,
  navRoleFor,
  viewerLabels,
  NO_GRANTS,
  organizationsFromMemberships,
  rolesFromMemberships,
  holdsRoleInActiveOrganization,
} from './viewer-contract';
export { viewerHasSession } from './viewer';
export { hasWorkspaceAccess, WorkspaceAccessDenied } from './WorkspaceGate';
export { requireWorkspaceAccess } from './require-access';
export { requireNavRoute } from './require-route';
/**
 * Resolves an "Add new …" target out of the viewer's OWN visible navigation,
 * so a create button can never point somewhere its owner would be refused.
 */
export { quickCreateHref } from './quick-create';
export { apiGet, apiPost, apiPut, apiPatch, apiDelete, describeApiFailure } from './api';
export { ApiFailure } from './ApiFailure';
export { OrganizationSwitcher } from './OrganizationSwitcher';
export type { OrganizationOption } from './OrganizationSwitcher';
export { setActiveOrganizationAction } from './set-organization-action';
export { activeOrganizationId, ACTIVE_ORG_COOKIE } from './active-organization';
export type { ApiResult } from './api';
export type { ViewerDescription, ViewerLabels } from './viewer-contract';

// Role switcher — one login acting as any role it holds, without signing out.
export { RoleSwitcher } from './RoleSwitcher';
// Server-safe: a pure string helper the app LAYOUT calls. Must not live in a
// 'use client' module — see role-label.ts.
export { roleLabel } from './role-label';
export type { RoleOption } from './RoleSwitcher';
export { setActiveRoleAction, setActiveRoleFromFormAction } from './set-role-action';
/**
 * The organisation switcher as a server component, so all seven app layouts
 * mount the identical control instead of each keeping its own copy.
 */
export { ViewerSwitchers } from './ViewerSwitchers';
/**
 * The role control for the top-RIGHT cluster — the switcher when the viewer
 * holds several roles, and `null` when they hold one so `TopNav` shows its
 * read-only "Acting as" chip instead. Owner request 2026-08-03: the role must
 * be visible to every signed-in user, not only to the few holding two.
 */
export { ActingAsControl } from './ActingAsControl';
export { activeRoleName, ACTIVE_ROLE_COOKIE } from './active-role';
export { activeRoleHeader } from './viewer';
// Exported for the slice-11 signalling proxy, which must send the SAME
// organisation header every server-side read sends — a call negotiated in
// one organisation and read in another would be a real isolation hole.
export { activeOrganizationHeader } from './viewer';

/**
 * "Do I belong to a workshop yet?" — answerable for a user `/me` cannot
 * describe, because `/me` is behind TenantGuard and 401s for somebody who has
 * signed up but joined nothing. See registration.ts for why that distinction
 * matters more than it looks.
 */
export { registrationStatus, needsWorkshop } from './registration';
export type { RegistrationStatus } from './registration';

/**
 * The page Auth.js sends a failed sign-in to — wired up by `pages.error` in
 * `workspace-auth.ts`. Every app must mount it at `/auth/error`, or that
 * redirect 404s and the visitor is worse off than with Auth.js's default.
 */
export { AuthErrorScreen } from './AuthErrorScreen';
export type { AuthErrorScreenProps } from './AuthErrorScreen';
