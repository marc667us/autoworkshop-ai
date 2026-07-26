# Backup and restore

> **Why this document is strict.** The Solar app was destroyed on 2026-07-09 by an expiring free-tier
> database with **no backups**. AutoWorkshop self-hosts PostgreSQL, which removes the expiry vector
> entirely — but self-hosting introduces host-loss risk, so backups are mandatory from day one, not from
> a later hardening phase.

## Layers (`1.txt` §30–§37)

| Layer | Mechanism | Requirement met |
|---|---|---|
| Continuous | **WAL archiving -> PITR** (`pgBackRest` or `wal-g`, both FOSS) | §29 RPO ≤ 5 minutes |
| Daily | Encrypted physical base backup | §32 |
| Daily | Logical export of critical schemas | §32 |
| Weekly | Full physical backup | §32 |
| Off-host | Encrypted copy under **separate credentials** | §34, 3-2-1-1-0 |
| Immutable | Object-locked / offline-protected copy of the weekly | §31 |
| Versioning | Object-storage versioning + deletion protection | §30 |
| Pre-migration | Automatic verified backup before high-risk migration | §32 |
| Keycloak | Realm + config export daily and after any change | §32 |
| Object store | Inventory + integrity report daily | §30 |

## Retention (§33)

WAL / point-in-time: 7 days · daily: 35 days · weekly: 12 weeks · monthly: 12 months.
Repair, approval, invoice and warranty records carry longer business retention than application logs.

## Security (§34)

Encrypted in transit and at rest · separate credentials · protected from bulk deletion · monitored for
unexpected size change · access logged. **Backup encryption keys are held outside the host being backed
up** — a key that only exists inside the thing you are protecting is not a key.

## Restore validation (§36)

A restore is **not** successful merely because the database starts. Every restore verifies: backup
identity and timestamp · encryption key availability · checksum integrity · database consistency ·
migration compatibility · **tenant isolation** · object-storage references · search index rebuild ·
authentication · critical workflows · approval-record integrity · payment-record integrity · audit
continuity.

## Testing programme (§37)

**Monthly restore drill recording the actually achieved RPO and RTO.**
Quarterly point-in-time recovery · quarterly Keycloak restore · six-monthly full environment recovery ·
annual disaster-recovery exercise. Retested after every major architecture change.

**A backup that has not been restored is not a backup.**
