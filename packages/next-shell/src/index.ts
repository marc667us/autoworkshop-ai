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
export { grantsFor, navRoleFor, viewerLabels, NO_GRANTS, organizationsFromMemberships } from './viewer-contract';
export { viewerHasSession } from './viewer';
export { hasWorkspaceAccess, WorkspaceAccessDenied } from './WorkspaceGate';
export { requireWorkspaceAccess } from './require-access';
export { requireNavRoute } from './require-route';
export { apiGet, apiPost, apiPatch, apiDelete, describeApiFailure } from './api';
export { ApiFailure } from './ApiFailure';
export { OrganizationSwitcher } from './OrganizationSwitcher';
export type { OrganizationOption } from './OrganizationSwitcher';
export { setActiveOrganizationAction } from './set-organization-action';
export { activeOrganizationId, ACTIVE_ORG_COOKIE } from './active-organization';
export type { ApiResult } from './api';
export type { ViewerDescription, ViewerLabels } from './viewer-contract';
