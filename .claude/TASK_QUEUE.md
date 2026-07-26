# Task queue

| ID | Task | Phase | Status |
|---|---|---|---|
| T-0001 | Release 0.1 foundation | 1 | **done** — tagged `v0.1.0` |
| T-0002 | Keycloak realm + client + docker wiring | 2 | **done** — realm as configuration-as-code |
| T-0003 | Users, organizations, branches, memberships | 2 | **partial** — organizations + tenant DB layer + audit done; users/branches/memberships services outstanding |
| T-0004 | Roles, permissions, permission matrix | 2 | queued |
| T-0005 | Tenant context resolution from validated claims | 2 | **partial** — `KeycloakJwtService` + `TenantGuard` done; web apps not yet session-wired (see `viewerGrants`) |
| T-0006 | RLS FORCE + tenant-isolation test suite | 2 | **partial** — RLS proven as non-superuser; full suite outstanding |
| T-0007 | Audit framework (append-only) | 2 | **done** — `AuditService`, same transaction as the work it records |
| T-0008 | WAL archiving + PITR + off-host backup + restore drill (Supervisor C3) | 2 | **done** — archiving fixed (had NEVER worked), drill passes 4/4, RTO 16-106s, RPO 0 |
| T-0009 | Top navigation bar | 3 | **done** |
| T-0010 | Collapsible grouped side navigation | 3 | **done** |
| T-0011 | Shell surfaces: tabs, dialogs, drawers, AI assistant panel | 3 | **done** |
| T-0012 | Runtime theming (light / dark / system) | 3 | **done** |
| T-0013 | Responsive shell — mobile overlay nav, tablet behaviour | 3 | **done** |
| T-0014 | Storybook stories for every shell component (`01 (1).txt` §71) | 3 | queued |
| T-0015 | Playwright shell journey + axe-core accessibility gate | 3 | queued |
| T-0016 | Workspace / organisation / branch switchers | 3 | **blocked** on T-0003 membership data |
| T-0017 | Quick-create, tasks, messages, notifications, help panels (§9-§14) | 3 | queued |

| T-0018 | Schedule the backup + drill | 2 | **done** — 4 Windows tasks live + `autoworkshop-backup.cron` for production; all 4 proven by triggering, `LastResult 0x0` |
| T-0019 | Alert on backup age and on `pg_stat_archiver.failed_count` rising | 2 | **partial** — `check-backup-health.sh` detects and exits non-zero (live: HEALTHY 7/7); delivery is cron-mail only, nothing notifies on Windows |
| T-0020 | Drill a restore from the OFF-HOST copy alone | 2 | queued |
| T-0021 | MinIO object-lock / immutability (needs a bucket rebuild) | 2 | queued |
| T-0022 | Rebuild the local cluster with `--data-checksums` on | 2 | queued |

| T-0023 | Deliver the health-check alert somewhere a human sees it (closes T-0019) | 2 | queued |
| T-0024 | Review guardrails: RAG grounding, claim verification, scoped review, idiom lint | 2 | **done** — 4 layers in `scripts/guardrails/`, wired as Stage 0 of the quality gate |

**Next up:** T-0014 and T-0015 close Release 0.2.

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
