# Codex review — T-0018 / T-0019 backup scheduling (retroactive)

**Date:** 2026-07-26
**Reviewer:** Codex CLI v0.137.0 (`gpt-5.5`, ChatGPT Plus auth, read-only sandbox)
**Subject:** commit `71a17fd` — `run-scheduled.sh`, `check-backup-health.sh`,
`schedule/install-windows.ps1`, `schedule/autoworkshop-backup.cron`, `lib.sh`
**Why retroactive:** `71a17fd` shipped to `master` with **no review record and no control-file
update**. This review was run after the fact, during the 2026-07-26 staleness fix.

## Passes run

| # | Scope | Result |
|---|---|---|
| 1 | Doc-accuracy review of the staleness diff | 4 findings |
| 2 | Code review of the four scheduling files | 2 findings, **both documentation-level** |

## Findings — pass 1 (staleness diff)

| # | Severity | Finding | Verified? | Outcome |
|---|---|---|---|---|
| 1 | High | `SESSION_HANDOVER.md` said "T-0019 is partial, not done" in one place and "T-0018 and T-0019 are NOT open" in another | **TRUE** — genuine self-contradiction, introduced by this session | **FIXED** |
| 2 | Medium | Docs quoted "restore drill Sat 04:15" for production, but `autoworkshop-backup.cron:35` is `15 4 1 * *` — monthly on the 1st | **TRUE** — verified against the cron file | **FIXED** — replaced with a two-row table separating production from local Windows |
| 3 | Medium | `TASK_QUEUE.md:40` cited `reviews/*-t0018-scheduling.md`, which did not exist | **TRUE** | **FIXED** — this file and the adjudication now exist |
| 4 | Low | Control files claimed "working tree clean at `3877835`" while five files were modified | **TRUE** | **FIXED** — reworded to "no feature work in flight … at the last feature commit" |

## Findings — pass 2 (code)

| # | Severity | Finding | Verified? | Outcome |
|---|---|---|---|---|
| 5 | Low | `install-windows.ps1:22` header says the drill runs "04:15 on the 1st of the month"; the actual trigger at line 75 is `-Weekly -DaysOfWeek Saturday -At '04:15'` | **TRUE** | **FIXED** |

## Reviewer performance — recorded honestly

**Codex did not review the code it was asked to review.** Across two attempts it was given the
diff path on disk, an explicit four-file allow-list, and an instruction not to open any `.md` file.
Both times it drifted onto the Markdown control files and reported documentation drift.

It therefore contributed **nothing** on the five code questions it was asked:
exit-code propagation, lock/concurrency, fail-open vs fail-closed, threshold arithmetic, secret
leakage. **Every code defect of consequence in this change was found by the Supervisor pass, not by
Codex** — including a CRITICAL false-healthy. See `supervisor-adjudication-t0018-scheduling.md`.

This is the third recorded instance of the drift documented in memory
`feedback_codex_stale_artifact_distraction`. Naming the files to exclude was **not** sufficient this
time; only an allow-list plus a refusal to read `.md` would be, and even that failed here.

**Operating notes reconfirmed:**
- `codex exec` hangs on stdin — `< /dev/null` is mandatory.
- A multi-line prompt passed as a shell argument arrives truncated. Write the prompt to a file and
  pass `"$(cat promptfile)"`.
- Telling it "do not run any command, read files only" is self-defeating: it reads files *by*
  running commands, and simply refuses the task.
- Its sandbox blocks PowerShell line-numbering helpers and `pnpm`; it cannot run tests.

**VERDICT: PASS WITH CORRECTIONS** — 5 findings, all fixed. Verdict covers documentation only;
the code verdict comes from the Supervisor pass, which is the one that actually read the code.
