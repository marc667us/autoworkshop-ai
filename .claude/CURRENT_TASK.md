# Current task

**No feature work is in flight.** Working tree committed; all gates green.

Release 0.2 (Phase 3, the application shell) is **closed**. T-0014 and T-0015 shipped on 2026-07-26;
T-0030, the last thing holding the release open, was closed on 2026-07-27 — see below, because *how*
it closed matters more than that it did.

## T-0030 — closed, and it was never a product defect

Recorded as a live 🔴 defect: at 360px the side nav rendered inline, `main` was squeezed to 103px and
the page overflowed by 161px. **The shell was correct the entire time.**

Seven `next start` servers were running from an earlier build when the apps were rebuilt underneath
them. `next start` resolves its chunk manifest once at boot, so those servers kept emitting HTML
referencing chunk hashes the rebuild had deleted. Every chunk 404'd, React never hydrated, and
`useIsMobile()` never advanced past the `false` it deliberately starts with for SSR safety.
Playwright's `reuseExistingServer: !CI` handed those stale servers straight to the suite.

Reproduced under control — the stale server gives `main` 103px and 161px of overflow with no React
fibers on `<body>`; a fresh server on the same build gives 360px and none. Both numbers match the
original report exactly.

**Now gated:** `apps/e2e/tests/build-freshness.setup.ts` runs before every other project and fails the
run if any server references a `/_next/static` asset absent from that app's `.next`. Proven in both
directions — it names the exact missing chunk on a stale server and passes 7/7 on fresh ones.

Full record: `reviews/supervisor-adjudication-t0030-harness.md`.

## Next up, in priority order

1. **T-0031** — ThemeToggle arrow keys move focus but not selection. A `role="radiogroup"` requires
   automatic activation, so this is a genuine ARIA-pattern defect, unlike Tabs (which implements
   manual activation deliberately, and whose test was wrong). `packages/ui/src/ThemeProvider.tsx:125`.
2. **T-0027** — navigation model becomes **workspace × role** (`07.txt` part 2 §46–§50). **Blocks
   Phase 5.** Four distinct trees inside the single `workshop` workspace, resolved through the same
   grant filter the shell already uses — not a second mechanism.
3. **T-0003 remainder** — users, branches, memberships on the `OrganizationService` pattern. Unblocks
   T-0016 (the switchers) and replaces `viewerGrants()`'s demo body.
4. **T-0023** — deliver the backup health alert somewhere a human sees it. Detection is done; on
   Windows nothing routes it to a person.
5. T-0020…T-0022 — off-host-only restore drill, MinIO object-lock, cluster rebuild with
   `--data-checksums`.

## Carry forward — two things that are easy to get wrong here

- **`viewerGrants()` must never grant every gated permission.** The nav model gates on only
  `finance.read` and `organization.admin`; when the demo viewer held both, the fail-closed
  permission test skipped in all seven workspaces and had never once run. `at least one workspace
  must exercise permission gating` now fails if that recurs.
- **Never assert responsive behaviour without `waitForHydration()`.** The mobile/desktop switch is a
  hook, so the server always renders the desktop tree. A fixed sleep races the machine, not the app.

## Definition of complete (`05.txt` §6)

Migration runs · backend rule exists · API works · page renders with loading/empty/error/permission
states · permissions enforced · tests pass · lint + typecheck pass · Playwright journey passes ·
responsive checked · docs updated · **no paid dependency introduced** · committed.
