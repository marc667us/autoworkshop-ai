# Task queue

| ID | Task | Phase | Status |
|---|---|---|---|
| T-0001 | Release 0.1 foundation | 1 | **done** — tagged `v0.1.0` |
| T-0002 | Keycloak realm + client + docker wiring | 2 | **done** — realm as configuration-as-code |
| T-0003 | Users, organizations, branches, memberships | 2 | **done 2026-07-27** — `BranchService`, `UserService`, `MembershipService` + controllers on the `OrganizationService` pattern. 8 routes live under `/api/v1`, all 401 unauthenticated. Role gates, role allow-list, audit, one-way withdrawal. **`viewerGrants()`/`viewerRole()` still demo — replacing them is T-0005 (session wiring), not more services** |
| T-0004 | Roles, permissions, permission matrix | 2 | **partial 2026-07-27** — `apps/api/src/authz/permission-matrix.ts` maps all 13 grantable roles to the 3 permission keys the nav gates on, from 07 pt2 §50 + 01 §29/§32. Fails closed on an unknown role. Deliberately small: new keys arrive with the modules that gate on them |
| T-0005 | Tenant context resolution from validated claims | 2 | **finding 5 CLOSED + BOTH GATES PASSED 2026-07-28** (`6725b14`) — sign-out now revokes for real, proven by an A/B refresh grant (200 without sign-out, 400 `invalid_grant` with). Codex found 2 MEDIUM, Supervisor found 3 MORE that Codex missed — incl. logout sending no `client_id`, which would have left the SSO session alive after any refresh that dropped the id token. **Finding 4 (admin route protection) is still open.** Earlier: **code complete 2026-07-27** (`0b678b5`) — `packages/auth` (Auth.js v5 + Keycloak, one factory x7), session-backed `viewerGrants()`/`viewerRole()` via `GET /api/v1/me`, all 7 apps wired with async layouts + middleware + route handler. Codex and Supervisor have NOT reviewed. Playwright NOT re-run. Earlier API side: `KeycloakJwtService`, `TenantGuard`, and now **`GET /api/v1/me`** returning userId/tenant/org/branch/activeRole/permissions/memberships, all derived server-side. **REMAINING: the Next apps have no session at all** — no Auth.js, so `viewerGrants()`/`viewerRole()` are still demo data |
| T-0032 | Production + staging deployment of `workshop-web` | 3 | **done 2026-07-27** — `autoworkshop.aiappinvent.com` LIVE. Render's builder is out of the critical path: CI builds a container, starts it, smoke-tests `/api/auth/*`, publishes to GHCR; Render pulls a prebuilt image (ADR-017). Two free image services — staging `srv-d9jun8m417fc73dore50`, production `srv-d9ju49id0e5s7389fjlg`. Production is unreachable unless the identical digest-tagged image already serves on staging. `autoDeploy` off on both. The old node service `srv-d9jsliu7r5hc73b1kncg` never deployed successfully and is retired, domain detached. **The 448 MB heap theory was reproduced in CI and REFUTED; the underlying Render build fault is still unexplained** |
| T-0006 | RLS FORCE + tenant-isolation test suite | 2 | **partial** — RLS proven as non-superuser; full suite outstanding |
| T-0007 | Audit framework (append-only) | 2 | **done** — `AuditService`, same transaction as the work it records |
| T-0008 | WAL archiving + PITR + off-host backup + restore drill (Supervisor C3) | 2 | **done** — archiving fixed (had NEVER worked), drill passes 4/4, RTO 16-106s, RPO 0 |
| T-0009 | Top navigation bar | 3 | **done** |
| T-0010 | Collapsible grouped side navigation | 3 | **done** |
| T-0011 | Shell surfaces: tabs, dialogs, drawers, AI assistant panel | 3 | **done** |
| T-0012 | Runtime theming (light / dark / system) | 3 | **done** |
| T-0013 | Responsive shell — mobile overlay nav, tablet behaviour | 3 | **done** |
| T-0014 | Storybook stories for every shell component (`01 (1).txt` §71) | 3 | **done** — 10 story files, 77 stories, axe 84/84 |
| T-0015 | Playwright shell journey + axe-core accessibility gate | 3 | **done** — `apps/e2e`, 138 passing, harness defects fixed 2026-07-27 |
| T-0016 | Workspace / organisation / branch switchers | 3 | **unblocked on the data side** (T-0003 done); still needs T-0005 session wiring to know who the viewer is |
| T-0017 | Quick-create, tasks, messages, notifications, help panels (§9-§14) | 3 | queued |

| T-0018 | Schedule the backup + drill | 2 | **done** — 4 Windows tasks live + `autoworkshop-backup.cron` for production; all 4 proven by triggering, `LastResult 0x0` |
| T-0019 | Alert on backup age and on `pg_stat_archiver.failed_count` rising | 2 | **partial** — `check-backup-health.sh` detects and exits non-zero (live: HEALTHY 7/7); delivery is cron-mail only, nothing notifies on Windows |
| T-0020 | Drill a restore from the OFF-HOST copy alone | 2 | queued |
| T-0021 | MinIO object-lock / immutability (needs a bucket rebuild) | 2 | queued |
| T-0022 | Rebuild the local cluster with `--data-checksums` on | 2 | queued |

| T-0023 | Deliver the health-check alert somewhere a human sees it (closes T-0019) | 2 | queued |
| T-0025 | ~~axe `color-contrast`~~ | 3 | **withdrawn** — the 10 hits came from stories rendering Storybook's error page, not from the palette |
| T-0026 | Dangling `aria-controls` (nav toggle + every collapsed SideNav group) | 3 | **done** — both were real; axe rated them CRITICAL |
| T-0027 | Navigation model becomes **workspace x role** (07 pt2 §46-§50) | 3 | **done 2026-07-27** — 4 role trees (§46-§49) beside the §34 workspace default; `viewerRole()` is the single decision point for BOTH the shell and the catch-all router. Verified live: §49 routes 200, §34-only routes 404. **Phase 5 unblocked** |
| T-0028 | Account types as *requests*, workshop staff invitation, approval limits | 2 | queued |
| T-0029 | Plan extension v1 r2 — specs 07/08/09 folded into the phase plan | — | **done** — `docs/00-project/PLAN_EXTENSION_v1.md` |
| T-0030 | ~~Side nav renders INLINE at 360px~~ | 3 | **closed 2026-07-27 — NOT A PRODUCT DEFECT.** A stale `next start` server was serving chunk hashes a later rebuild had deleted; every chunk 404'd, React never hydrated, so `useIsMobile()` never left its SSR default. Reproduced under control (main 103px, overflow 161px, `__react*` absent) and fixed with a build-freshness gate |
| T-0031 | ~~ThemeToggle radiogroup: arrows move focus but not selection~~ | 3 | **closed 2026-07-27 — NOT A DEFECT.** Same stale-server cause as T-0030: with no hydration `setPreference` never ran, so `aria-checked` never changed. The roving tabindex and arrow handling were already correct (shipped in the defect-4 fix). Both tests pass on a fresh build |
| T-0024 | Review guardrails: RAG grounding, claim verification, scoped review, idiom lint | 2 | **done** — 4 layers in `scripts/guardrails/`, wired as Stage 0 of the quality gate |

**Next up:** T-0005 finding 4 (admin route protection), then T-0016 switchers, then **PHASE 4 —
Customer + Vehicle**, which is the owner's stated priority and the first phase with real screens.

**T-0033 — three follow-ups from the 2026-07-28 Supervisor pass** (none blocking; production has
no deployed identity yet, so it renders the signed-out shell):
1. `AUTH_URL` is **absent from `render.yaml`**. Set it per service so neither the session-cookie
   name nor the post-logout origin rests on a request header.
2. **Confirm a realm/deployment origin mismatch:** `render.yaml` deploys `workshop-web` at
   `autoworkshop.aiappinvent.com`, but `autoworkshop-workshop-web`'s `redirectUris` are
   `http://localhost:3001/*` and `https://workshop.autoworkshop.aiappinvent.com/*`. If that is
   what is live, the deployed origin is not in its own client's allow-list — sign-in AND sign-out
   both fail the moment identity goes live.
3. **No audit event on logout**, which CLAUDE.md §9/§16 require. The one outcome that leaves a
   live credential behind currently exists in stdout only.

**A defect worth remembering, found by running the app rather than reviewing it:** the session
cookie NAME was chosen from `NODE_ENV` while Auth.js chooses it from the URL scheme. On the live
https site the two coincide, so it works; under `next start` over http a genuinely signed-in user
resolved to nobody — `/api/auth/session` named them while the server-side shell rendered "Not
signed in" and `viewerGrants()` returned none. No local production build had ever resolved a
viewer. Nothing logged an error.

**Superseded:** T-0005 — tenant context from the Keycloak session inside the Next apps. It is now the single blocker for T-0016 (switchers) and is what actually replaces the demo bodies of `viewerGrants()` and `viewerRole()`. Then T-0023, then T-0017.

**Phase 5 is unblocked.** T-0027 landed the workspace × role navigation it was waiting on.

**All four tests left red at the 2026-07-26 close were one environmental fault.** Three were T-0030 and one was T-0031; none was a defect in the shell. The cause was a `next start` server serving a build that had been deleted underneath it.

**The Phase 2 backup thread is now closed except for delivery.** T-0008 is done and drilled (RTO
16–106 s, RPO 0, 4/4 runs); T-0018 is done and every job has actually fired; T-0019 detects but does
not deliver, which is T-0023. Live health as of 2026-07-26T19:47Z: **HEALTHY 7/7**, WAL
`archived=50, failed=0`.

⚠️ **T-0018/T-0019 shipped without a review gate.** Commit `71a17fd` left no record in `reviews/`
and did not update this file — the two facts are related. Retro-reviewed 2026-07-26.

**The retro-review was not a formality — it found a CRITICAL and a HIGH sitting in the DR
subsystem:** the off-host-copy check reported `OK` when there were **zero** off-host backups
(`grep -c` prints `0` and exits 1, so `|| echo 0` made `N` the string `"0\n0"` and the integer test
fell through to the healthy branch — correct on the healthy path, wrong on the only day it matters),
and the lock was per-job, so daily 02:15 overrunning into weekly 03:15 gave two concurrent
`pg_basebackup`s that the file's own header promised were impossible. Both fixed and re-verified.
See `reviews/codex-review-t0018-scheduling.md` and
`reviews/supervisor-adjudication-t0018-scheduling.md`.
