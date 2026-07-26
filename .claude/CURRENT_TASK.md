# Current task

**No feature work is in flight**, and all gates were green at the last feature commit (`3877835`).
The previous task (T-0009…T-0013, the application shell) is complete; the backup thread (T-0008,
T-0018) is complete and scheduled. Alert delivery remains outstanding. See T-0023.

**Next up: T-0014 and T-0015 — they close Release 0.2.**

## T-0014 — Storybook story per shell component (`01 (1).txt` §71)

Components needing a story, all in `packages/ui`: AppShell, TopNav, SideNav, Breadcrumbs,
PageHeader, StatusBadge, ThemeProvider/ThemeToggle, Tabs, Dialog, Drawer, AiAssistantPanel.
Storybook already builds in CI (it is 1 of the 9 build targets), so this adds stories, not tooling.

Cover the states the shell actually has and that a screenshot would otherwise miss: loading, empty,
error, permission-denied, light/dark/system, and the sub-768px overlay-drawer form.

## T-0015 — Playwright shell journey + axe-core gate

This one matters more than a checkbox. **Every one of the 7 defects found last session passed
typecheck, lint, the full unit suite and a 7-app production build while broken** — they were caught
by adversarially reading the code or by `curl`-ing the served build. The journey must assert
behaviour a green unit suite cannot see:

- A permission-gated URL entered directly still 404s (defect 1 — fail closed).
- Nothing focusable is inert: every enabled control has a handler (defect 2).
- Everything the nav advertises resolves, for the same viewer the router sees (defect 3 —
  `viewer.test.ts` asserts this at unit level; assert it again in a real browser).
- ThemeToggle is one tab stop with arrow-key roving (defect 4).
- The assistant drawer sits *beside* the page on desktop, not below it (defect 5).
- Focus stays trapped in an open dialog across a parent re-render (defect 6).
- The top bar does not overflow at 360 px (defect 7).

axe-core runs against each of the 7 workspaces' shell and fails the build on violations.

## Blocked / not now

- **T-0016** (workspace/org/branch switchers) — blocked on T-0003 membership data. Until then the
  indicators render as plain text, deliberately, not as dead buttons.
- **T-0017** (quick-create, tasks, messages, notifications, help panels, §9-§14) — the top-nav
  buttons render `disabled` with ", not available yet" in the accessible name until their panels
  exist.
- **T-0003 remainder** (users, branches, memberships) — unblocks T-0016 and replaces
  `viewerGrants()`'s demo body.
- **T-0023** — deliver the backup health alert somewhere a human sees it.

## Definition of complete (`05.txt` §6)

Migration runs · backend rule exists · API works · page renders with loading/empty/error/permission
states · permissions enforced · tests pass · lint + typecheck pass · Playwright journey passes ·
responsive checked · docs updated · **no paid dependency introduced** · committed.
