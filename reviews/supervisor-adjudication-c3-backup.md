# Supervisor adjudication — C3 backup, PITR and restore drill

**Date:** 2026-07-26
**Change:** Supervisor condition C3 — WAL archiving fix, encrypted physical + logical backup,
Keycloak realm export, off-host copy, and a restore drill that measures RTO and RPO.
**Reviewer:** Codex CLI · **Adjudicator:** Supervisor
**Owner direction in force:** Codex reviews; the Supervisor adjudicates and verifies each finding
against source before accepting it.

## The defect that started this task

C3 was recorded as "done and VERIFIED live" by an earlier session. The verification had read the
settings back — `archive_mode=on`, `wal_level=replica`, `archive_timeout=5min` — all correct.

`pg_stat_archiver` disagreed:

```
archived_count = 0 · failed_count = 864 · last_failed_wal = 000000010000000000000001
```

**No WAL segment had ever been archived.** `/wal_archive` was a Docker named volume owned by
`root:root`; `archive_command` runs as uid 999; every attempt was denied. Postgres logs an archive
failure and retries the same segment forever, serving traffic the whole time. There was no
point-in-time recovery whatsoever behind a configuration that read back perfect.

Fixed by a `postgres-init` service that chowns the WAL and backup volumes before Postgres starts.
Verified by forcing a segment switch and watching `archived_count` advance — the only proof that
counts.

**This is the third time on this project that configuration read back correct while the mechanism
was inert** (RLS bypassed by a superuser; Keycloak client scopes replaced by a JSON array; now
this). It is the dominant defect class here.

## Codex findings — 4, all accepted

| # | Severity | Verdict | Detail |
|---|---|---|---|
| 1 | High | **CONFIRMED** | A failed off-host copy only warned. The run then reported success and **pruned older backups** — leaving potentially one copy, on the host being protected against, while deleting the previous good ones. Now fatal, and pruning is skipped on failure so prior backups survive. |
| 2 | High | **CONFIRMED** | The "separate credentials" guarantee was **a comment, not a fact**: the code used `S3_ACCESS_KEY`/`S3_SECRET_KEY` — MinIO's root credentials, shared with the application — while the line above claimed "credentials that are NOT the application's". Now a dedicated `aw-backup-writer` identity with a bucket-scoped policy. |
| 3 | Medium | **CONFIRMED** | The pre-backup archiving gate read only historical counters, so it would pass on a cluster whose archiving broke minutes ago but had not yet retried. For a script set whose entire purpose is preventing silent archiving failure, a gate satisfiable by stale history is the wrong gate. Now forces a WAL switch and requires the count to advance. |
| 4 | Low | **CONFIRMED** | The manifest emitted `"realm": "null"` — the string, which a consumer would read as a filename — and interpolated the operator-supplied `--label` unescaped. Both fixed; manifest now parses and yields a bare `null`. |

## Found by the Supervisor

| # | Severity | Finding |
|---|---|---|
| S1 | **High** | `.backup-key` does **not** match the existing `*.key` gitignore rule — it ends in `-key`, not `.key` — and `artifacts/` was not ignored either. The backup encryption key and every backup artefact were one `git add -A` from being committed to a public repository. Solar leaked secrets for 35 days in July 2026; this was the same class of mistake, one commit away. Explicit ignore entries added and verified with `git check-ignore`. The same trap applied to the new `.backup-s3-secret`, which was ignored the moment it was created. |
| S2 | Medium | `[ -s file ]` is not a sufficient artefact check: `openssl enc` fed an empty stream still emits a 16-byte salt header, so a wholly failed backup produces a non-empty file that passes "is it there?". Replaced with `assert_plausible`, a size floor per artefact type. |
| S3 | Low | WAL retention (7 d) is shorter than base-backup retention (35 d), which looks like a bug and is not — `pg_basebackup -Xfetch` bundles the WAL needed for consistency into the backup, so older base backups remain restorable standalone. Documented in `lib.sh`, because changing `-Xfetch` to `-Xnone` would silently make every backup older than the WAL horizon unrestorable. |

## Verification performed

Not assertions — each was executed and observed.

| Claim | How it was verified |
|---|---|
| WAL archiving works | Forced a segment switch; `archived_count` 2 → 3 → …, `failed_count` 0, real segments on disk |
| The backup restores | Restore drill run **4 times**, 8/8 checks each |
| WAL replay recovers post-backup commits | 10 transactions committed *after* the backup, all 10 recovered |
| RLS survives the restore | `relforcerowsecurity` count matches; cross-tenant read returns 0 rows on the restored cluster |
| The app role is still safe | `NOSUPERUSER`/`NOBYPASSRLS` asserted on the restored cluster — without it RLS is inert |
| Off-host copies are real and readable | Logical dump pulled **back out of MinIO**, decrypted, and `pg_restore --list` showed 95 tables incl. `identity.*` and `audit.events` |
| The realm export is the right realm | Pulled from MinIO, decrypted, `"realm": "autoworkshop"` |
| The backup credential is scoped | Write to `aw-backups` allowed; list `aw-media` **Access Denied**; delete **Access Denied** |
| The drill is non-destructive | Live cluster unchanged (tenants=2, accepting connections); throwaway container and volume removed; WAL archive mounted read-only |
| Secrets are not committed | `git check-ignore` on both secret files; `git status` clean of artefacts |

## Measured results

| Measure | Value |
|---|---|
| RTO | 16 s / 24 s / 29 s / 106 s across four runs — **quote 106 s**, not 16 s |
| RPO | 0 in every run; every committed transaction recovered |
| Worst-case RPO by design | 5 minutes (`archive_timeout`), meeting `1.txt` §29 |

**The RPO caveat is in the drill report itself, not just here:** the drill forces a WAL switch before
simulating failure; a real crash does not. The honest worst case is bounded by `archive_timeout`, and
that is a design property, not something this drill measured.

## Gaps, stated rather than buried

1. **Nothing is scheduled.** Every script runs by hand. A backup regime nobody runs is a document.
2. **Data checksums are off** on the local cluster — the volume predated `--data-checksums`. Cannot
   be enabled without a dump/restore rebuild. **Production must be initialised fresh with them on.**
3. **The drill reads the local WAL archive**, not the off-host copy. Off-host restorability is
   verified for the logical dump and realm; a full restore *from off-host alone* is not yet drilled.
4. **No object-lock/immutability**, which MinIO requires at bucket creation.
5. **No alert on backup age or on `failed_count` rising** — the archiving defect ran five hours
   unnoticed, and monitoring is what would have caught it.
6. **Keycloak realm restore has never been drilled**, only its export verified.

These are recorded in `docs/05-database/BACKUP_AND_RESTORE.md` under "Known gaps" and belong in the
task queue, not in a footnote.

**SUPERVISOR VERDICT: PASS** — the backup is restorable, and that is a measured fact rather than a
configuration claim. All four Codex findings and all three Supervisor findings are resolved and
re-verified. The drill passed on all four runs, including the final run after every fix.

**A backup that has not been restored is not a backup. This one has been, four times.**
