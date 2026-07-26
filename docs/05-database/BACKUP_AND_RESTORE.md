# Backup and restore

> **Why this document is strict.** The Solar app was destroyed on 2026-07-09 by an expiring free-tier
> database with **no backups**. AutoWorkshop self-hosts PostgreSQL, which removes the expiry vector
> entirely — but self-hosting replaces it with host-loss risk, so backups are mandatory from day one,
> not from a later hardening phase.

**Status: AS-BUILT.** Supervisor condition C3 is implemented and drilled. This document describes what
exists and has been run, not what is planned. Anything not yet built is marked **NOT YET**.

---

## The defect this work uncovered — read before trusting any dashboard

WAL archiving was configured on 2026-07-26 and recorded as "done and verified live". The verification
had read the settings back:

```
archive_mode = on · wal_level = replica · archive_timeout = 5min
```

All correct. All meaningless. `pg_stat_archiver` told the truth:

```
archived_count = 0 · failed_count = 864 · last_failed_wal = 000000010000000000000001
```

**Not one WAL segment had ever been archived.** Docker creates a named volume owned by `root:root`;
the postgres image chowns only its own PGDATA; `archive_command` runs as uid 999. Every attempt was
denied, and Postgres does what it is designed to do — logs it, retries the same segment forever, and
keeps serving traffic. There was no point-in-time recovery at all, behind a configuration that read
back perfect.

Fixed by the `postgres-init` service in `infrastructure/docker/docker-compose.yml`, which chowns the
WAL and backup volumes to uid 999 before Postgres starts.

**The rule that follows:** `SHOW archive_mode` proves someone typed a setting. Only a segment landing
in the archive proves recovery is possible. `./verify-archiving.sh` does the latter and is a
precondition of every backup run.

---

## What exists

All scripts live in `infrastructure/backup/`. Everything is FOSS and already in the stack —
`pg_basebackup`, `pg_dump`, `gzip`, `openssl`, MinIO. No paid dependency, nothing to purchase.

| Script | Does |
|---|---|
| `verify-archiving.sh` | Proves archiving works by forcing a segment switch and watching it arrive. Exits non-zero if not. |
| `backup.sh` | Physical base backup + logical dump + Keycloak realm export, encrypted, checksummed, manifested, copied off-host, pruned to retention. |
| `restore-drill.sh` | **Restores a backup into a throwaway cluster and measures RTO and RPO.** Non-destructive. |
| `lib.sh` | Shared helpers. Sourced, not executed. |

### Why both a physical and a logical backup

They fail differently, which is the entire point. A physical base backup plus archived WAL is the
only thing that gives point-in-time recovery (`1.txt` §29, RPO ≤ 5 min) — but it is version- and
platform-locked and worthless if the cluster's page format is corrupt. A logical dump restores into
any Postgres 16+, survives page corruption, and is the only way back if the base backup is bad.
Keeping one and calling it "the backup" is how a recovery fails on the day it matters.

## Layers (`1.txt` §30–§37)

| Layer | Mechanism | Status |
|---|---|---|
| Continuous | WAL archiving → PITR | **BUILT + DRILLED** — `archived_count` rising, `failed_count` 0 |
| Daily | Encrypted physical base backup | **BUILT** — `pg_basebackup -Ft -z`, encrypted in-stream |
| Daily | Logical export | **BUILT** — `pg_dump -Fc`, encrypted |
| Weekly | Full physical backup | **BUILT** (same artefact; scheduling is the open piece) |
| Off-host | Encrypted copy under separate credentials | **BUILT + VERIFIED** — MinIO bucket `aw-backups`, versioning on, dedicated `aw-backup-writer` identity |
| Immutable | Object-locked copy of the weekly | **NOT YET** — needs MinIO object-lock, which must be set at bucket creation |
| Versioning | Object-storage versioning + deletion protection | **BUILT** — versioning on; deletion protection NOT YET |
| Pre-migration | Verified backup before high-risk migration | **BUILT** — `./backup.sh --label pre-migration-NNN`; not yet wired into `run.sh` |
| Keycloak | Realm export daily and after any change | **BUILT** — 92 KB realm, encrypted, verified as realm `autoworkshop` |
| Object store | Inventory + integrity report daily | **NOT YET** |

**The plaintext never touches disk.** `pg_basebackup` writes to stdout, `openssl` encrypts the
stream, and only ciphertext is written. A backup that exists unencrypted even briefly on the host it
protects can be read by anything that compromised that host.

## Retention (§33)

WAL 7 days · daily 35 days · weekly 12 weeks · monthly 12 months. Pruning runs **last** in a backup
run, so a failure earlier in the run can never destroy an older good backup.

## Separate credentials for off-host storage (§34)

The off-host copy runs as `aw-backup-writer`, a MinIO identity created by
`offhost_setup()` with a policy scoped to the backup bucket alone. MinIO's root credential is used
once to provision that user and never for the copy itself.

This was a **false claim before it was a feature**: the code reused `S3_ACCESS_KEY`/`S3_SECRET_KEY` —
MinIO's root credentials, also used by the application for media — while the comment beside it said
"credentials that are NOT the application's". Codex caught it.

Why it matters beyond tidiness: one credential able to reach both live media and backups is one
compromise away from losing both. That is the shape of most ransomware losses — the backups are
deleted with the same key that encrypted the data.

Verified by attempting each operation:

| Attempt | Result |
|---|---|
| Write to `aw-backups` | allowed |
| List the application's `aw-media` bucket | **Access Denied** |
| Delete an object in `aw-backups` | **Access Denied** |

The policy deliberately omits `s3:DeleteObject`: a writer that cannot delete cannot be used to
destroy backup history. Retention pruning is therefore an administrative action, not something the
backup job can do to its own archive.

The writer's secret lives in `infrastructure/backup/.backup-s3-secret`, generated on first run and
`git`-ignored.

## Encryption key (§34)

`infrastructure/backup/.backup-key`, generated on first run, `git`-ignored.

> ⚠️ **Where this key lives is a production decision, not a detail.** §34 requires it to be held
> outside the host being backed up — a key that only exists inside the thing you are protecting is
> not a key, it is a formality. Locally the "host" is the postgres container and the key sits on the
> workstation outside it, which is an honest approximation and nothing more. **In production the key
> belongs in a different trust domain, and it must be backed up separately: an encrypted backup whose
> key was lost with the server is indistinguishable from no backup.**

Note `.backup-key` does **not** match the `*.key` gitignore rule — it is ignored by an explicit entry.

## Restore validation (§36)

A restore is **not** successful because the database started. The drill asserts:

| Check | Why |
|---|---|
| Pre-backup rows recovered | The backup contains what it claimed |
| **Post-backup rows recovered** | **WAL replay works — this is the difference between a nightly dump and a 5-minute RPO** |
| Tenants / migrations / audit counts match | Schema and history survived, not just bytes |
| RLS still `FORCE`d | A restore that loses policies has restored a data breach |
| App role still `NOSUPERUSER`/`NOBYPASSRLS` | Otherwise RLS is inert — the 2026-07-25 defect |
| Cross-tenant read denied | Isolation re-proven on the restored cluster, not assumed |

## Drill results

Reports are written to `infrastructure/backup/drills/` and committed as evidence.

| Date | RTO | RPO | Result |
|---|---|---|---|
| 2026-07-26 (run 1) | 29 s | 0 — every committed transaction recovered | **PASS**, 8/8 |
| 2026-07-26 (run 2) | 16 s | 0 | **PASS**, 8/8 |
| 2026-07-26 (run 3) | 106 s | 0 | **PASS**, 8/8 |
| 2026-07-26 (run 4, post-review) | 24 s | 0 | **PASS**, 8/8 |

Every run recovered 5 pre-backup rows *and all 10 transactions committed after the backup was taken*,
proving WAL replay end to end.

**On the RTO spread (16 s – 106 s):** the same backup, on the same machine, on the same day. The
variance is host load, not the backup. Quote the **worst** figure when planning, never the best —
a recovery happens on the day everything else is also going wrong, which is exactly when the machine
is least idle.

**RPO caveat, stated honestly:** the drill forces a WAL switch before the simulated failure. A real
crash does not. Between segment switches the exposure is bounded by `archive_timeout` (5 minutes) —
that is the true worst case, and it meets §29 by design rather than by measurement.

## Testing programme (§37)

Monthly restore drill recording achieved RPO/RTO · quarterly PITR to a chosen timestamp · quarterly
Keycloak restore · six-monthly full environment recovery · annual DR exercise. Retested after every
major architecture change.

**Currently run manually.** Scheduling is the open piece — see the caveats below.

## Known gaps — not hidden

1. **Nothing is scheduled yet.** Every script is run by hand. A backup regime nobody runs is a
   document, not a backup.
2. **Data checksums are off** on the local cluster: `--data-checksums` is in `POSTGRES_INITDB_ARGS`
   but the `pgdata` volume predated it and `initdb` never re-ran. It cannot be enabled on an existing
   cluster without a dump/restore rebuild. **The production cluster must be initialised fresh with
   checksums on.** Silent page corruption in a backup is worse than no backup.
3. **The drill reads the local WAL archive**, not the off-host copy. Off-host restorability is
   verified separately (the logical dump and realm were both pulled back from MinIO, decrypted and
   validated) but a full restore *from off-host alone* has not been drilled.
4. **Object-lock / immutability and deletion protection are not configured.** MinIO object-lock must
   be enabled at bucket creation, so this needs a bucket rebuild.
5. **No alert on backup age or on `failed_count` rising.** The archiving defect ran for five hours
   unnoticed; monitoring is what would have caught it.
6. **Keycloak realm restore has never been drilled** — only its export is verified.

## Running it

```bash
cd infrastructure/backup

./verify-archiving.sh                    # prove archiving works (fast)
./backup.sh                              # full backup + off-host copy
./backup.sh --label pre-migration-039    # before a risky migration
./restore-drill.sh                       # THE DRILL — takes ~2 min, non-destructive
```

The drill never stops, writes to, or restores into the live container. It creates a throwaway
container and volume, mounts the WAL archive **read-only**, and removes both on exit.

**A backup that has not been restored is not a backup.**
