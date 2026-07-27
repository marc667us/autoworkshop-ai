# Session handover

> Read this first, then `.claude/CURRENT_PHASE.md` and `.claude/TASK_QUEUE.md`.

## Where the project stands — 2026-07-26 (session 2, afternoon)

**Release 0.1 shipped and tagged `v0.1.0`.** **Phase 2 (identity) partially complete.**
**Phase 3 (application shell, Release 0.2) is the current work and is now gated green.**

Repo: https://github.com/marc667us/autoworkshop-ai — public, `master` + `develop`.
Approved plan: `C:\Users\USER\Documents\autoworkshop app\_plan\COMBINED_PLAN_v2.md`
(Codex `PASS WITH CORRECTIONS` 14/14 applied → Supervisor `PASS WITH CONDITIONS` 8/8 applied).

## This session — resumed a frozen session and finished its work

The previous session (transcript `f2cda62b-ed38-42fd-87de-540a2665efb4`) froze mid-command at
14:27 UTC, part-way through `pnpm typecheck && pnpm build` after fixing a circular-import crash.
Its process did not survive. This session read that transcript, resumed at exactly that point, and
completed the work.

**Gates, all green:** typecheck 13/13 · lint 13/13 · **tests 64** · build 9/9 (7 apps + API +
Storybook). Runtime verified by serving the production build, not just by building it.

### Shipped

- `packages/navigation` — navigation model for all 7 workspaces from `01 (1).txt` §34-§39 and
  `02.txt` §52/§58. 27 tests, including that all 25 platform-admin entries are present.
- `packages/next-shell` — ONE Next adapter (`WorkspaceShell`, `renderModulePage`, `viewerGrants`)
  for all 7 apps. The per-app shell copy that existed briefly was deleted.
- `packages/ui` — AppShell, TopNav, SideNav, Breadcrumbs, PageHeader, StatusBadge, ThemeProvider,
  **Tabs, Dialog, Drawer, AiAssistantPanel**, `useFocusTrap`, `useMediaQuery`.
- Runtime theming (light / dark / **system**) via CSS custom properties + no-flash boot script.
- Responsive shell: below 768px the side nav becomes a modal overlay drawer with a focus trap.
  `prefers-reduced-motion` is honoured by every animation.
- AI assistant panel per `02.txt` §8 — discloses the proposed action, the data it will use,
  read-only vs changes-data, the approval requirement and sources. Not wired to an agent (Phase 8),
  and it says so plainly rather than presenting an input box that swallows questions.
- `ai-coworkers/` + `reviews/` + `scripts/` pair-coding skeleton installed (was missing entirely,
  contrary to root CLAUDE.md). `./scripts/quality-gate.sh` now exists in this repo.

## Defects found by review — do NOT reintroduce

Codex reviewed the diff; each finding was verified against source before being accepted, and each
fix was verified at runtime afterwards. Reviews are saved under `reviews/`.

1. **The catch-all route ignored permissions entirely.** `renderModulePage` resolved against
   `workspace.groups`, not the grant-filtered tree, so any permission-gated module rendered by URL —
   and the placeholder page *printed the required permission name*, handing out a map of the
   authorization model. It also claimed "permissions for this screen are working" while checking
   none. Now resolves via `visibleGroups(workspace, grants)`, defaults to `[]` (fail closed), prints
   no permission names, and the copy is honest. **Verified live: gated URL 404s, ungated 200s.**
2. **Every right-hand top-nav button was focusable and inert.** Create / Tasks / Messages /
   Notifications / Help rendered as live buttons with count badges and no handler; the TopNav
   docstring simultaneously claimed "none of them silently no-op". An action with no `onSelect` now
   renders `disabled` with ", not available yet" in its accessible name. The workspace/org/branch/
   user indicators render as **plain text**, not buttons, until their switchers exist.
3. **Self-found, after Codex's pass: the nav and the router disagreed about who the viewer is.**
   The 7 `layout.tsx` files passed a hardcoded grants array while the catch-all passed none, so the
   workshop nav advertised `/finance-and-warranty/invoices` and that URL 404'd. Both now read
   `viewerGrants()` in `packages/next-shell/src/viewer.ts` — one function, one truth. Locked by
   `viewer.test.ts`, which asserts the *property* (everything advertised must resolve), not the
   symptom. **This is the bug class to watch for: two literals in two files cannot be type-checked
   into agreement.**
4. **`ThemeToggle` declared `role="radiogroup"` without the keyboard behaviour that promises.**
   Three tab stops, no arrow keys. Now a roving tabindex with arrow/Home/End, per the ARIA pattern.
5. **A circular import between `packages/design-tokens/src/themes.ts` and `index.ts`** put `primitive` in the
   temporal dead zone and crashed the production build while typecheck stayed green. Fixed by the
   previous session by extracting `primitive.ts`. **Watch for this class — a green typecheck does
   not prove a module graph initialises.**

## The rule this session kept learning

Everything in items 1, 2 and 3 passed typecheck, lint, 47-then-59 unit tests and a 7-app production
build while broken. **Build the thing, then run it and look.** Every real defect here was found by
either reading the code adversarially or by `curl`-ing the running app — none by a green gate.

## T-0008 (Supervisor C3) — DONE AND DRILLED

**WAL archiving had never once worked.** It was recorded last session as "done and VERIFIED live";
that verification had read the settings back. `pg_stat_archiver` said `archived_count=0`,
`failed_count=864`. `/wal_archive` was a root-owned Docker volume and `archive_command` runs as
uid 999 — every attempt denied, retried forever, nothing surfaced. **There was no point-in-time
recovery at all.** Fixed by the `postgres-init` service in the compose file.

Now in `infrastructure/backup/`: `verify-archiving.sh` (proves archiving by forcing a switch),
`backup.sh` (encrypted physical + logical + Keycloak realm, checksums, manifest, off-host copy,
retention) and `restore-drill.sh` (restores into a throwaway cluster and measures RTO/RPO).

**Drill passes 4/4 runs, 8/8 checks: RTO 16–106 s, RPO 0** — including all 10 transactions committed
*after* the backup, which is the actual proof of WAL replay. Reports in
`infrastructure/backup/drills/`. Full record in `reviews/supervisor-adjudication-c3-backup.md`.

Run it: `cd infrastructure/backup && ./restore-drill.sh` (~2 min, never touches the live cluster).


## Scheduling is LIVE (T-0018 / T-0019) — 2026-07-26

Four Windows Task Scheduler tasks under `\AutoWorkshop\`, all proven by triggering them:
health (every 6h) · daily 02:15 · weekly Sun 03:15 · **restore drill Sat 04:15**.
Production equivalent: `infrastructure/backup/schedule/autoworkshop-backup.cron`.
`./check-backup-health.sh` reports HEALTHY (7/7). Re-install: `schedule/install-windows.ps1`.

Two defects the scheduler found that manual runs never would:
1. `pg_switch_wal()` is a NO-OP with no WAL activity, so the pre-backup archiving gate blocked
   backups entirely on an **idle** database. Fixed with a heartbeat write before the switch.
2. The health check ran `grep` inside the minio container (minimal image, no grep) -> false
   CRITICAL "no off-host backup" while four sat in the bucket.

Caveat: Windows tasks run as the interactive user, so they need you logged in. The first scheduled
weekly returned 0xC000013A (terminated) mid-run; clean on every retry, root cause unconfirmed —
glance at the first real Sunday 03:15 run.

**Re-verified 2026-07-26T19:47Z:** all four tasks `Ready`, `LastResult 0x0`, next runs scheduled
(daily 07-27 02:15 · weekly 08-02 03:15 · drill 08-01 04:15 · health 6-hourly). Health check live:
**HEALTHY 7/7**, WAL `archived=50, failed=0`, newest backup 1 h old, 4 base backups off-host.

**Cosmetic, not urgent:** the *registered* task descriptions in Task Scheduler are still the old
text and show mojibake (`Monthly restore drill â€” …`) because the installer used non-ASCII dashes.
The source is fixed; the live descriptions refresh on the next `install-windows.ps1` run. Triggers
and behaviour are correct now — the tasks were left running rather than re-registered for a string.

**T-0019 is partial, not done.** `check-backup-health.sh` *detects* (age, job freshness,
`failed_count`, drill age) and exits non-zero, but delivery is cron-mail only — **on Windows
nothing notifies anyone**; it writes `status/health.json` and waits to be read. Closing that is
T-0023.

⚠️ **`71a17fd` shipped without either review gate** — no `reviews/` record, and it updated no
control file, which is why this handover and `TASK_QUEUE.md` both went stale. Retro-reviewed
2026-07-26 (Codex + Supervisor); records in `reviews/`.

**That retro-review found a CRITICAL and a HIGH, both now fixed.** The off-host-copy check reported
`OK` when there were **zero** off-host backups — right on the healthy path, wrong on the only day it
matters — and the per-job lock allowed two concurrent `pg_basebackup`s the file's own header said
were impossible. **Codex found neither**; it drifted onto the Markdown files on both attempts
despite an explicit four-file allow-list. Every code defect here came from the Supervisor pass.
Treat a green Codex verdict on infrastructure shell as unproven until someone reads the code.

## Viewing the app locally

`pnpm build` then, per app, `cd apps/<name>-web && npx next start -p <port>`:
customer 3000 · workshop 3001 · supplier 3002 · fleet 3003 · insurance 3004 · towing 3005 · admin 3006.
**`npx next start` without `-p` ignores the package.json port and every app fights over 3000.**
Stop them before rebuilding — a running server locks `.next` on Windows.
Nothing is deployed to autoworkshop.aiappinvent.com yet.

## SESSION 2026-07-26 pt3 — close. Tip `bdfe65c`, pushed, tree clean.

Seven commits. Release 0.2 is **one defect away** from closing.

**T-0014 done** — 77 stories, every component in `packages/ui`.
**T-0015 done and PROVEN** — Storybook axe **84/84 green**; journey **37 passed / 4 failed**, and the four
are left failing on purpose because they are real.

🔴 **START HERE NEXT SESSION — T-0030.** At 360px the side nav renders **inline instead of as an overlay**:
`main` is squeezed to **103px** and the page scrolls horizontally by **161px**. `useIsMobile()` is returning
false in the built app while TopNav's CSS-driven mobile filtering still works, which is what hides it.
Confirmed *after* waiting for hydration, so it is not a test race. **This is Phase-3 defect 7, still live**,
underneath a green typecheck, green lint, 37 unit tests and a 9-target build.
Start at `packages/ui/src/AppShell.tsx:89` (`const isMobile = useIsMobile()`) and
`packages/ui/src/useMediaQuery.ts:26`. Reproduce with:
`cd apps/e2e && npx playwright test --project=shell-journey -g "overflow at 360px"`

Also fixed today: dangling `aria-controls` (axe CRITICAL) in **two** places — every *collapsed* SideNav group,
and TopNav's hardcoded `app-side-nav` while the mobile Drawer is unmounted. TopNav now takes `sideNavId`.

**Two of the four failures were the TESTS being wrong, not the code** — worth knowing before "fixing" them:
Tabs implements **manual activation deliberately** (arrows move focus, Enter selects; each panel costs a
fetch), and the modal-drawer focus test slept 200ms and raced the focus-trap effect.

**Guardrails shipped** (`scripts/guardrails/`, Stage 0 of `quality-gate.sh`): BM25 RAG grounding,
claim verification, scoped review with drift audit, shell-idiom lint. See `scripts/guardrails/README.md`.

**Plan extended** for specs 07/08/09 → `docs/00-project/PLAN_EXTENSION_v1.md`. New Phases 12 (simulation
intelligence), 13 (knowledge ops), 14 (community). ⚠️ `autoworkshop 07.txt` is **two documents** — lines
1798–5069 are a separate workshop-side spec (§1–52) that the first draft missed entirely.

**Beware the pipe trap.** `cmd | tail` reports *tail's* exit status. It made `playwright | tail` look like
exit 0 over 9 failures, and let a commit through while both guardrails were failing. Capture `$?` before any
pipe.

## SESSION 2026-07-27 — T-0030 CLOSED. It was never a product defect.

**Start here: T-0031, then T-0027.** Release 0.2 is closed.

### T-0030 was a stale server, not a responsive bug

Carried in as a live red defect: at 360px the side nav rendered inline, `main` squeezed to 103px,
161px of horizontal overflow, `useIsMobile()` false in the built app. **The shell was correct all
along.**

Seven `next start` servers were launched at 12:35 and the apps were rebuilt at 14:38 underneath them.
`next start` resolves its chunk manifest once at boot, so those servers kept serving HTML that
referenced chunk hashes the rebuild had deleted. Every chunk 404'd, React never hydrated, and
`useIsMobile()` never advanced past the `false` it deliberately starts with for SSR safety.
`reuseExistingServer: !CI` handed those stale servers straight to Playwright.

Reproduced under control rather than argued: stale server -> `main` 103px, scrollWidth 521 vs
clientWidth 360, no `__react*` keys on `<body>`. Fresh server, same build -> 360px, no overflow,
hydrated. Both numbers match the original report exactly.

**Why it fooled a careful reader.** The server still answers 200, the SSR markup is correct, and
TopNav's mobile rules are plain CSS *inside that markup* so they keep working. The previous session
cited that asymmetry as proof the bug was real. It is actually the signature of a page whose
JavaScript never ran. Waiting longer for hydration cannot fix a chunk that 404s — which is why "I
waited for hydration, so it is not a race" ruled out the wrong hypothesis.

### Now gated

`apps/e2e/tests/build-freshness.setup.ts` runs as a Playwright dependency project before every other
project and fails the run if any server references a `/_next/static` asset that is not on disk in
that app's `.next`. Proven both directions: it names the exact missing chunk on a stale server, and
passes 7/7 on fresh ones. "Stop the servers before rebuilding" was already written in THIS FILE when
the incident happened — documentation did not prevent it, so it is a gate now.

### Four more defects found, none of them by Codex

1. **The only security-relevant test in the suite had never once executed.** `"<workspace>: a gated
   URL 404s when typed directly"` — the regression test for the permission-BYPASS defect —
   `test.skip`ped in **all seven** workspaces, silently, every run. The nav model gates on just two
   permission keys and the demo viewer held both, so `gatedHref()` found nothing gated anywhere.
   Fixed: `DEMO_DEFAULT` no longer holds `finance.read`, and a new test fails if no workspace
   exercises gating. **When it was made to run, fail-closed held** — real 404s. It just had no proof.
2. **The suite served every app with the wrong Next major.** `npx next start ../<app>` ran from
   `apps/e2e`, which pinned `next@14.2.21`, against apps built with `15.1.3`. Next 14 dies on a
   missing `font-manifest.json`. Latent since T-0015 was written and masked entirely by the stale
   server reuse — removing one bug exposed the other. Fixed with per-app `cwd` + version alignment.
3. **The overlay test was a sleep-race** and would have stayed red on a correct app: it never waited
   for hydration. The overflow tests waited with `waitForTimeout(400)` — a race with the machine, not
   the app. All now use `waitForHydration()`, which waits for React's `__reactFiber$` keys, not a
   duration. `readyState === 'complete'` is NOT sufficient: it is equally true of a page whose JS 404'd.
4. **The disclosure assertion could not pass on correct code** — it matched the viewer's own grants in
   the RSC flight payload. Tightened to the gated module's specific required permission.

Codex found one real defect (stale copy on the workshop dashboard naming `finance.read`), which was
outside the changed files — a good catch. It also skipped both questions it was explicitly told to
answer and emitted no `VERDICT` line, for the third review running.

### T-0031 was the same phantom

Closed the same day. "Arrows move focus but not selection" is exactly how a correct radiogroup
behaves when its JavaScript never loaded: `setPreference` cannot run, so `aria-checked` never
changes. The roving tabindex and arrow/Home/End handling had already shipped with the defect-4 fix.
Both radiogroup tests pass on a fresh build, verified twice.

**So all four tests left red at the previous close were one environmental fault** — three T-0030,
one T-0031 — and no shell code was wrong in any of them.

### Open, recorded honestly

- **One unexplained anomaly:** a single build-guard run passed against a demonstrably stale server.
  Two later runs on the same state failed correctly and named the chunk, and a direct replication of
  the guard's logic also reported it missing. Not reproducible, no explanation. Recorded rather than
  rationalised — the direction (passing when it should fail) is the one that matters.
- **Guard covers each app's entry route only.** The shared runtime chunks it does check change on
  essentially any edit, so coverage is high but not total. Extending to a sample of routes is a cheap
  follow-up.

### Gates, 2026-07-27

typecheck 14/14 · lint 14/14 · unit 64 · build 10/10 · **Playwright 138 passed, 0 failed, 2
legitimate skips** (admin holds every grant; customer has no gated item). The three tests left
deliberately red last session are green and **none was weakened** to get there.

## T-0027 DONE — navigation is now workspace x role. Phase 5 unblocked.

`07.txt` **part 2** §46-§49 gives four DISTINCT navigation trees inside the single `workshop`
workspace. They are not filtered views of §34: the spec groups and labels the same work differently
per role (the owner's "Repair Requests" is the manager's "Repair Request Inbox"; "MY JOBS" and
"TECHNICAL TOOLS" exist for the technician alone). §50 names EIGHT roles but gives trees for four —
supervisor, storekeeper, quality-control and cashier fall back to the workspace default, which is what
the spec provides.

**Design, and why:** `workspaceForRole()` returns a `Workspace` with the role's groups swapped in, so
the shell, `breadcrumbsFor`, the catch-all router and the journey tests all keep taking the type they
already took. Threading a `role` parameter through each would have created a SECOND place where "which
tree is this viewer on" gets decided — and this repo already shipped that bug for grants, where the nav
advertised routes the router 404'd. **`viewerRole()` is the single decision point**, called by both
`WorkspaceShell` and `renderModulePage`. Role selects the tree; permissions still filter it.

**Verified live, not just built:** the workshop app renders §49 exactly (Home · My Jobs · Technical
Tools · Plan Work · Record Work · Testing · Learning). `/my-jobs/inspection-required` -> 200,
`/technical-tools/fault-code-search` -> 200, and the §34-only `/workshop-floor/repair-staging` -> **404**.
The menu and the router moved together, which is the entire property at stake.

**Codex found two real defects, both confirmed and fixed:**
1. `workspaceForRole` kept `roleGroups` on its result, so re-applying it with a different role fell
   back to the FIRST role's tree — a supervisor would have got the technician's navigation under their
   own name. Fixed by dropping the field: a resolved view has no business carrying the menu of
   alternatives it was chosen from.
2. `/home/dashboard` is a concrete route that bypasses the catch-all, and its header still said
   "Workshop Dashboard" while the technician nav called it "Technician Dashboard". Now derived.

**The Supervisor pass found a third**, in the area Codex was asked about and skipped: a role tree could
silently drop a permission during transcription — `07.txt` prints "Invoices" as plain text, the trees
are hand-transcribed per role, and every existing test would stay green because the item is *supposed*
to be there. Guard added.

**One finding was correctly REJECTED.** That guard's first run flagged
`reception: /vehicle-intake/issue-intake-receipt`. §48's "Issue Intake Receipt" is proof the workshop
took custody of the vehicle, not a payment receipt — gating it would have hidden a core reception
function from reception staff to satisfy a regex. Handled as a named exception with its reason, plus a
test that the exception still refers to a live item.

**Skips rose 2 -> 3:** `workshop` no longer exercises the gated-URL test, because §49's technician tree
legitimately has no permission-gated item. Five workspaces still do, and
`at least one workspace must exercise permission gating` enforces it never reaches zero.

Records: `reviews/supervisor-adjudication-t0027-workspace-role.md`.

**Gates:** typecheck 14/14 · lint 14/14 · **unit 79** · build 10/10 · **Playwright 137 passed, 0
failed, 3 legitimate skips**.

## IN FLIGHT — pick up here

**No feature work is in flight.** See `.claude/CURRENT_TASK.md`.

1. **T-0003 remainder** — users, branches, memberships. Unblocks T-0016 and replaces the demo bodies
   of BOTH `viewerGrants()` and `viewerRole()`. These are the two functions Phase 2 must land on.
2. **T-0023** — deliver the backup health alert to a human. Detection done; Windows routes it nowhere.
3. **T-0017** — quick-create / tasks / messages / notifications / help panels (§9-§14).
4. T-0020…T-0022 — off-host-only restore drill, MinIO object-lock, `--data-checksums` rebuild.

## Environment

Node 20.19.2 · pnpm 9.15.4 (**do not upgrade — pnpm 10+/11 require Node ≥22.13**) · Python 3.14.4 ·
google-adk 2.2.0 · Docker 29.4.3 · Ollama 0.24.0 · gh CLI at `%USERPROFILE%\bin\gh.exe`.

Local infra: `pnpm infra:up`.
API: `cd apps/api && npx nest build && node dist/main.js` with
`DATABASE_URL=postgresql://autoworkshop_app:change_me_locally@localhost:5432/autoworkshop`.
**Never point the app at the `autoworkshop` superuser** — the boot guard refuses it, by design.

Serve a built app to check it: `cd apps/workshop-web && npx next start -p 3001`.
**Stop it before rebuilding** — a running Next server holds a lock on `.next` and the build fails on
Windows with a file-lock error that looks like a code error and is not.

Windows: `kcadm` runs in-container, so `MSYS_NO_PATHCONV=1 docker exec …` is required or Git Bash
rewrites `/opt/keycloak/...` into `C:/Program Files/Git/opt/...`. The local side of `docker cp`
needs the opposite treatment — `cygpath -w`.

Codex CLI: `codex exec` **blocks waiting on stdin** unless you redirect `< /dev/null`, and it will
answer a briefing-shaped prompt by acknowledging the role instead of doing the work. Give it an
imperative first line, a diff already written to disk, and closed stdin. Its sandbox rejects
`pnpm`/PowerShell, so it cannot run the tests — it reads only.

## Owner directions — binding

1. Name fixed: **AutoWorkshop AI** at `autoworkshop.aiappinvent.com` (Namecheap DNS)
2. **Stop cutting scope** — build everything structurally; only licensed content and labelled ML
   corpora stage
3. **Reuse Solar patterns, never entangle** — separate repo, DB, Keycloak realm, deploy, secrets, CI.
   **Do not open or run the Solar app.** Patterns are reused from memory and documentation, not by
   launching it.
4. **Zero cost including production** — never propose spending; that decision is the owner's alone
5. **Bring-your-own-connection** — tenants connect their own device/provider/credentials
6. Zero cost now; commercial infrastructure later, only if going commercial
7. **Solar is the reference — always refer to it**
8. **Codex is the reviewer; the Supervisor is the adjudicator.** Codex's findings are verified
   against source before being accepted — it is not infallible, and this session's third defect was
   one it missed.
9. **Do not run Google ADK or Stitch without the owner's approval.**

## Open owner decision (nothing to buy)

Where the self-hosted Docker stack should run: an always-free cloud VM, a machine already owned, or
local-only. It runs locally today, so nothing is blocked.

## Machine state

Sleep, hibernate and monitor timeouts are currently **disabled** (owner asked for uninterrupted
running). To restore: `powercfg /change standby-timeout-ac 30`, `hibernate-timeout-ac 180`,
`monitor-timeout-ac 10`.

A NestJS API process from the frozen session (`node dist/main.js`, started 05:09) was left running
deliberately — it is a working service and nothing required restarting it.
