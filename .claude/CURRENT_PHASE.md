# Current phase

**Phase 3 — Application shell and navigation** · Release **0.2** · 🔵 IN PROGRESS
(Phase 1 / Release 0.1 ✅ complete and tagged `v0.1.0`; Phase 2 identity partially complete —
see `TASK_QUEUE.md` for exactly which parts.)

Phases 2 and 3 are deliberately interleaved: the owner needed something to look at, and the shell
does not depend on the remainder of identity. Where it would have, it reads `viewerGrants()` — one
function to replace when the Keycloak session lands.

## Objective

`01 (1).txt` §2: top navigation bar, collapsible grouped side navigation, breadcrumbs, page headers,
tabs, drawers, dialogs, badges and the AI panel — working on desktop, tablet and mobile, across all
seven workspaces, from one shared shell.

## Deliverables

- [x] `packages/navigation` — all 7 workspaces' navigation, from the spec (27 tests)
- [x] `packages/next-shell` — one Next adapter for all 7 apps (no per-app copies)
- [x] Top navigation bar (§3-§15)
- [x] Collapsible grouped side navigation with counters, warnings and search (§16)
- [x] Breadcrumbs and page headers, with loading / empty / error states
- [x] Tabs, Dialog, Drawer (modal and non-modal), StatusBadge
- [x] AI assistant side panel (`02.txt` §8) — discloses action, data used, read-only vs
      changes-data, approval requirement, sources
- [x] Runtime theming: light / dark / system, no flash of wrong theme
- [x] Responsive — mobile overlay nav drawer with focus trap; `prefers-reduced-motion` honoured
- [x] Permission-aware visibility, with the router resolving from the same grants as the nav
- [ ] Storybook story per component (`01 (1).txt` §71)
- [ ] Playwright shell journey + axe-core gate
- [ ] Workspace / org / branch switchers (blocked on Phase 2 membership data)
- [ ] Quick-create, tasks, messages, notifications, help panels (§9-§14)

## Acceptance criteria

`pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build` all green · every workspace renders its
own navigation · no route reachable that the navigation does not advertise to that viewer · no paid
dependency.

**Status against those:** typecheck 13/13, lint 13/13, tests 64, build 9/9 — all green. Route/nav
agreement verified live and locked by a regression test in `packages/next-shell/src/viewer.test.ts`.

## Next phase

Phase 4 — Customer and Vehicle (Release 0.3): registration, profile, vehicle garage, documents,
service history, complaint submission, appointment request, workshop search, dashboard.

**Do not start Phase 4 before** T-0008's restore drill: the backup work is the oldest outstanding
Supervisor condition, and it addresses the exact failure that destroyed the Solar database on
2026-07-09.
