# Supervisor adjudication — T-0018 / T-0019 backup scheduling (retroactive)

**Date:** 2026-07-26
**Owner direction in force:** Codex is the reviewer; the Supervisor adjudicates and verifies every
finding against source before accepting it. Codex is not infallible — this session is the clearest
demonstration of that so far.

## Adjudication of Codex's findings

All 5 Codex findings verified against source and **accepted**; all 5 fixed. Detail in
`codex-review-t0018-scheduling.md`. None were code defects — the two "code" findings were a stale
comment and a missing file reference.

## Found by the Supervisor — the reviewer missed all of these

Codex was asked five specific code questions and answered none. A direct read of
`run-scheduled.sh` and `check-backup-health.sh` produced the following.

### S1 — 🔴 CRITICAL: the off-host check reports OK when there are zero off-host backups

`check-backup-health.sh`, the original line 117-120:

```bash
N="$(docker exec ... | grep -c 'base-.*\.tar\.gz\.enc$' || echo 0)"
if [ "${N:-0}" -eq 0 ]; then
```

With **zero matches** `grep -c` prints `0` *and exits 1*. The `|| echo 0` therefore fires as well,
so `N` becomes the two-line string `"0\n0"`. `[ "0\n0" -eq 0 ]` is not a valid integer comparison:
bash emits `integer expression expected`, the test evaluates false, and control falls to the
**else** branch — printing `OK — 0\n0 base backup(s) present off-host`.

**Empirically confirmed** before fixing, not merely reasoned:

```
N raw = [0
0]      byte-length = 3
/usr/bin/bash: [: 0\n0: integer expression expected
BRANCH: OK  <-- FALSE HEALTHY
```

**Why it matters:** the branch is correct on the healthy path — with 4 backups present `grep -c`
prints `4` and exits 0 — so every live run to date reported correctly. The defect is invisible
until the day every off-host copy is missing, which is the one day this check exists for. That is
precisely the shape of the WAL-archiving defect this whole subsystem was built in response to:
**a monitor that reads healthy while the thing it monitors is gone.** It is the 5th instance of
`feedback_config_reads_correct_mechanism_inert` on this project.

**Fixed:** capture the listing first, then count; strip to digits; and distinguish three states
rather than two — `UNCONFIRMED` (bucket unlistable) is now CRITICAL and separate from
`zero backups`, so a failure to list can no longer be silently read as either OK or a confirmed
absence. Re-verified: zero-match case now routes to CRITICAL; healthy path still reports 4.

### S2 — 🟠 HIGH: the lock was per-job, so daily and weekly could run concurrently

`LOCK_DIR="${HERE}/.lock-${JOB}"` gave every job its own lock, while the file's own header promised
"a slow run and the next scheduled run cannot overlap. Two concurrent pg_basebackups against one
cluster is how a backup window turns into an outage."

Daily fires 02:15, weekly 03:15, both call `backup.sh`. A daily run overrunning 60 minutes produces
exactly the two concurrent `pg_basebackup`s the comment rules out. Separately, `backup.sh` prunes
old artifacts last — pruning during a restore drill can delete the artifact being restored.

**This is the docstring-asserts-what-the-code-violates class that has now bitten this project three
times** (twice in the Phase 3 shell, once here). A comment is not a constraint.

**Fixed:** `daily`, `weekly` and `drill` share a `cluster` lock; read-only `health` keeps its own so
it can always run and report.

### S3 — 🟡 MEDIUM: a job skipped for the lock was indistinguishable from a job that succeeded

The skip path exited 0 and wrote **no** status file, leaving the previous run's success in place. A
job skipped on every single firing would have reported healthy indefinitely — the same
"absence looks like success" failure the wrapper was written to prevent.

**Fixed:** the skip path now writes `"outcome": "skipped"` with the blocking job named, and
`check-backup-health.sh` raises a WARNING on it instead of reading the `exit_code: 0` as success.

### S4 — 🟢 LOW: dead branch

`[ "$job" = "weekly" ] && warn_up "…never run" || warn_up "…never run"` — both branches identical,
an unfinished edit. Replaced with the single call.

## Not defects — checked and cleared

- **Exit-code propagation** in `run-scheduled.sh` is correct. `set -uo pipefail` deliberately omits
  `-e` so the wrapper always reaches its status-writing code, and `RC=$?` after the redirected
  `case` captures the real status. The comment explaining why is accurate.
- **Malformed/missing status files fail CLOSED** — `${RC:-1}` yields 1 → CRITICAL.
- **Unreadable backup timestamps fail CLOSED** — `date -r … || echo 0` yields epoch 0 → huge age →
  CRITICAL.
- **First-run `failed_count` baseline** seeds from the current value, so it cannot raise a spurious
  alert on a fresh install.
- **No secret leakage** found into logs, status files or the repo from these four files. MinIO
  credentials are passed to `mc` inside the container and are not echoed. (They do appear in the
  container's process table — pre-existing, out of scope for this change, noted for T-0021.)

## Residual risk accepted, not fixed

**The stale-lock threshold doubles as a concurrency timeout.** `STALE_LOCK_MINUTES=180` is measured
from the lock directory's mtime with no heartbeat, so a legitimate run exceeding 3 hours has its
lock broken and a second run starts alongside it. Today's backup and drill take minutes, so the
margin is ~100×. Revisit when the database is large enough to approach it; a heartbeat touch from
the running job is the fix. Recorded rather than silently carried.

## Gate record

The real finding of this adjudication is not any single defect — it is that **`71a17fd` reached
`master` without either gate**, and one CRITICAL plus one HIGH sat in a disaster-recovery
subsystem for the interval. The absent review and the stale control files were the same omission.

**SUPERVISOR VERDICT: PASS WITH CORRECTIONS** — 4 Supervisor findings (1 critical, 1 high, 1 medium,
1 low) and 5 Codex findings, all fixed and re-verified. Health check live: HEALTHY 7/7, WAL
`archived=50, failed=0`. Both scripts pass `bash -n`; the installer parses.
