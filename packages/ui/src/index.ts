export { visuallyHidden } from './a11y';
export { DataTable } from './DataTable';
export type { DataTableColumn, DataTableProps } from './DataTable';
export { StatusBadge } from './StatusBadge';
export type { StatusBadgeProps } from './StatusBadge';

export { AppShell } from './AppShell';
export type { AppShellProps } from './AppShell';

export { TopNav } from './TopNav';
export type { TopNavProps, TopNavAction } from './TopNav';

export { SideNav } from './SideNav';
export type { SideNavProps } from './SideNav';

export { Breadcrumbs } from './Breadcrumbs';
export type { BreadcrumbsProps } from './Breadcrumbs';

export { PageHeader, LoadingState, EmptyState, ErrorState } from './PageHeader';
export type { PageHeaderProps } from './PageHeader';

export { ThemeProvider, ThemeToggle, useTheme, themeBootScript } from './ThemeProvider';
export type { ThemePreference } from './ThemeProvider';

export { Tabs, nextTabId } from './Tabs';
export type { TabsProps, TabItem } from './Tabs';

export { Field, TextInput, Select, SubmitButton, FormShell } from './Form';

// MOVED here from workshop-web 2026-08-11. It was app-local while three
// workshop screens used it; customer-web and supplier-web need the same
// control, and Directive §3 says extend rather than duplicate — the shared
// form controls were moved for exactly this reason.
export { QuickCreateButton } from './QuickCreateButton';
export type { ActionResult } from './Form';

export { Dialog } from './Dialog';
export type { DialogProps } from './Dialog';

export { Drawer, overlayKeyframes } from './Drawer';
export type { DrawerProps } from './Drawer';

export {
  AiAssistantPanel,
  ASSISTANT_ACTIONS,
  assistantActionsFor,
  DEFAULT_ASSISTANT_UNAVAILABLE_REASON,
} from './AiAssistantPanel';
export type {
  AiAssistantPanelProps,
  AgentProposal,
  AssistantAction,
  ActionClass,
  ProposalSource,
  ProposalMechanism,
} from './AiAssistantPanel';

export { useFocusTrap, useScrollLock } from './useFocusTrap';
export { useMediaQuery, useIsMobile, useIsTabletOrBelow, usePrefersReducedMotion } from './useMediaQuery';
