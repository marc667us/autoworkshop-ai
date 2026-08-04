# Current phase

**▶ PHASE 5 — Workshop + Repair · Release 0.4 · IN PROGRESS.**

**2026-08-04:** the TECHNICIAN chain is structurally COMPLETE — 21/21 screens
verified reachable in a browser as a technician, from "assigned to me" through
inspection, diagnosis, planning, execution and testing to quality control. The
21 §49 entries still on the placeholder are Phase 9 knowledge libraries and
Phase 6 parts depot; none blocks a job reaching QC.

The CUSTOMER journey is complete end to end and its decision point now works:
report a problem → track it → **approve the proposal in-app** → collect → read
the service history. 19/19 in a browser. Customer menu coverage 5/35 → 10/35.

Slice 1 shipped: `repair.job_cards` (migration 006), the 19 stages of
`1.txt` §322-§360 plus `on_hold`, per-organization job numbers, and three access
scopes from one query - staff see the organisation, a technician sees only cards
assigned to them, a customer only cards against their own vehicles.

**Next: the Repair Staging Board and stage transitions.** A card cannot yet
leave `complaint_received`.

## Phase 4 - Customer + Vehicle · Release 0.3 · LARGELY COMPLETE

Built: registration (customer + vehicle), vehicle garage, customer dashboard,
detail pages, complaint submission, and the organisation switcher.

Outstanding, each blocked on something ABSENT rather than on time: service
history (needs completed jobs), vehicle documents (file storage), maintenance
schedule (service-interval rules), appointment request (an appointments table),
workshop search (a public organisation directory). **Customer profile is small
and buildable now.**

---

**▶ PHASE 4 — Customer + Vehicle · Release 0.3 · STARTING (not yet begun)**
as of 2026-07-28. Phase 3 closed; T-0005 findings 5 and 4 are shut and gated,
and the first screen that reads real data shipped
() — copy that pattern.
Read  first.

---

## Previous — Phase 3 — Application shell and navigation · Release **0.2** · ✅ COMPLETE (2026-07-27)
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
- [x] Storybook story per component (`01 (1).txt` §71) — 77 stories, axe 84/84
- [x] Playwright shell journey + axe-core gate — `apps/e2e`, 138 passing
- [ ] Workspace / org / branch switchers (blocked on Phase 2 membership data)
- [ ] Quick-create, tasks, messages, notifications, help panels (§9-§14)

## Acceptance criteria

`pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build` all green · every workspace renders its
own navigation · no route reachable that the navigation does not advertise to that viewer · no paid
dependency.

**Status against those (2026-07-27):** typecheck 14/14, lint 14/14, unit tests 64, build 10/10,
Playwright 138 passed / 0 failed / 2 legitimate skips. Route/nav agreement verified live and locked by
`packages/next-shell/src/viewer.test.ts`; permission gating is now genuinely exercised in 5 of the 7
workspaces, having previously skipped in all 7 without anyone noticing.

## Next phase

Phase 4 — Customer and Vehicle (Release 0.3): registration, profile, vehicle garage, documents,
service history, complaint submission, appointment request, workshop search, dashboard.

**The gate that used to block Phase 4 is now clear.** T-0008's restore drill was the oldest
outstanding Supervisor condition; it is done, drilled 4/4 (RTO 16–106 s, RPO 0) and scheduled
(T-0018). Phase 4 is blocked only by the remaining Release 0.2 items below.

**Release 0.2 is closed.** T-0014 and T-0015 shipped 2026-07-26; T-0030 — the last item holding it
open — closed 2026-07-27 and turned out not to be a product defect at all, but a stale `next start`
server feeding the test suite a build that no longer existed on disk. A build-freshness gate now
fails the run when that recurs. See `reviews/supervisor-adjudication-t0030-harness.md`.

**Still open, and correctly NOT blocking 0.2:** T-0031 (ThemeToggle radiogroup activation), T-0016
(switchers, blocked on T-0003 membership data) and T-0017 (quick-create / tasks / messages /
notifications / help panels). T-0027 — the navigation model becoming workspace × role per `07.txt`
part 2 §46–§50 — lands in Phase 3's scope but blocks Phase 5, so it is the next structural item.
