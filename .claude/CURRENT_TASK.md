# Current task

**T-0009 / T-0010 — application shell: top navigation + collapsible grouped side navigation**
(Phase 3, Release 0.2)

Status: implemented and gated. Remaining Phase 3 scope listed below.

## Done in this task

- `packages/navigation` — the navigation model for all 7 workspaces, transcribed from
  `01 (1).txt` §34-§39 and `02.txt` §52/§58. 27 tests.
- `packages/next-shell` — ONE Next.js adapter (`WorkspaceShell`, `renderModulePage`,
  `viewerGrants`) consumed by all 7 apps, so the shell is not copy-pasted seven times.
- `packages/ui` — AppShell, TopNav, SideNav, Breadcrumbs, PageHeader, StatusBadge,
  ThemeProvider, **Tabs, Dialog, Drawer, AiAssistantPanel**, `useFocusTrap`, `useMediaQuery`.
- Runtime light/dark/system theming via CSS custom properties, with a no-flash boot script.
- Responsive: below 768px the side nav becomes a modal overlay drawer with a focus trap.
- AI assistant side panel per `02.txt` §8 — renders the proposed action, the data it will use,
  read-only vs changes-data, approval requirement and sources. Not connected to an agent yet
  (Phase 8); it says so rather than pretending.

## Still open in Phase 3 (Release 0.2)

- Storybook stories for the new components (`01 (1).txt` §71 requires one per component)
- Playwright journey + axe-core run against the shell
- Workspace / organisation / branch switchers — blocked on Phase 2 membership data (T-0003/T-0005).
  Until then those indicators render as plain text, deliberately, not as dead buttons.
- Quick-create, tasks, messages, notifications and help panels (§9-§14) — the top-nav buttons for
  these render `disabled` with ", not available yet" in the accessible name until their panels exist.

## Definition of complete (`05.txt` §6)

Migration runs · backend rule exists · API works · page renders with loading/empty/error/permission
states · permissions enforced · tests pass · lint + typecheck pass · Playwright journey passes ·
responsive checked · docs updated · **no paid dependency introduced** · committed.
