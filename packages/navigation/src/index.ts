/**
 * @autoworkshop/navigation — the navigation model for every workspace.
 *
 * Public API. Per the reusability rule (root CLAUDE.md §0.3), anything not
 * exported here is not part of the contract and other packages must not reach
 * past it into `./src/*`.
 */

export type {
  Crumb,
  NavGroup,
  NavItem,
  PermissionKey,
  RoleId,
  Workspace,
  WorkspaceId,
  WorkshopRoleId,
} from './types';

export { getWorkspace, pendingWorkspaces, workspaces } from './workspaces';

export { packBase, withPackBase, withoutPackBase } from './pack-base';

export {
  breadcrumbsFor,
  defaultExpanded,
  flattenItems,
  groupsForRole,
  isActive,
  isGroupActive,
  searchItems,
  visibleGroups,
  workspaceForRole,
} from './resolve';
