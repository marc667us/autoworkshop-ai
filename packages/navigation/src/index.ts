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
  Workspace,
  WorkspaceId,
} from './types';

export { getWorkspace, pendingWorkspaces, workspaces } from './workspaces';

export {
  breadcrumbsFor,
  defaultExpanded,
  flattenItems,
  isActive,
  isGroupActive,
  searchItems,
  visibleGroups,
} from './resolve';
