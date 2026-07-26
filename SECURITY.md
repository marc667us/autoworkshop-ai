# Security Policy — AutoWorkshop AI

## Reporting a vulnerability

Report privately to the maintainer. Do not open a public issue for a security defect.

## Security principles

1. **Zero trust.** Every request is authenticated, authorised, validated and logged. Internal network
   position grants no trust.
2. **Tenant isolation is the highest-severity concern.** Cross-tenant exposure is a Severity-1 incident.
3. **The AI never holds privileged credentials.** Agents cannot reach the database, object storage,
   payment providers or admin APIs — enforced in infrastructure, asserted by negative tests in CI.
4. **All retrieved content is untrusted.** Repair documents, supplier descriptions, customer uploads,
   chat messages and search results are data, never instructions.
5. **Recoverability is a design requirement**, not an operational afterthought.

## Tenant isolation

Enforced at six layers — no single control is relied upon:

1. NestJS request-scoped tenant context, derived **only** from validated Keycloak claims and membership
   records. A client-supplied tenant identifier is never trusted (`autoworkshop 1.txt` §9).
2. Repository-level tenant filter.
3. PostgreSQL **row-level security with `FORCE`** on every tenant-owned table.
4. Object-storage path prefixing.
5. Search-index tenant filtering.
6. Redis key prefixing.

Every request resolves **exactly one** active tenant context. Cross-tenant isolation tests are a blocking
CI gate — a failure blocks merge.

## AI and MCP security

- Agents call the **MCP Gateway** only. MCP servers call authoritative NestJS domain services. Domain
  services enforce every business rule, permission check, approval gate, transaction and audit record.
- No production MCP server exposes generic SQL execution, shell access or unrestricted file reads.
- **Human-in-the-loop classes:** A read-only (auto) · B draft (auto, stays a draft) · C business-committing
  (explicit approval) · D safety/financial/privileged (authorised human approval, dual control where
  defined). Enforced at the Gateway **and** re-checked in the domain service.
- **Prompt-injection defence** is testable: a standing injection corpus runs in CI. A change that lets a
  poisoned document trigger a tool call fails the build.
- Agent containers have restricted egress — MCP Gateway and the local LLM endpoint only.

## Media security

This platform ingests untrusted customer audio, images and video **by design**, making it the largest
attack surface. Every upload passes, without exception:

quarantine bucket → authenticated + tenant-assigned → extension allowlist → **MIME/magic-byte sniffing**
(the declared type is never trusted) → decompression and size limits (archive-bomb defence) → malware scan
→ **EXIF/metadata stripping** → transcode in a sandboxed worker (no egress, no credentials, resource-capped)
→ integrity hash → private bucket → **short-lived signed URLs only**.

**Raw untrusted media never becomes agent-readable context.** Files failing validation stay quarantined and
are never served.

## Secrets

Never in source, images, CI logs or frontend bundles. Injected at runtime, rotated, audited, excluded from
logs and from model context. Backup encryption keys are held **outside** the host being backed up.

Per-tenant provider credentials (bring-your-own-connection) are encrypted at rest in tenant settings —
never in the platform's own secret store, never in git.

> Solar leaked secrets for 35 days (2026-07-10) because committed ciphertext met a leaked key. Both are
> kept out of git here, and `ci.yml` fails the build if key material or a `.env` is committed.

## Backups and recovery

Continuous WAL archiving → PITR (RPO ≤ 5 minutes) · daily encrypted base backup · weekly full · encrypted
off-host copy under separate credentials · one immutable/offline-protected copy · object-storage versioning
and deletion protection · automatic verified backup before high-risk migrations · daily Keycloak realm
export.

**A backup that has not been restored is not a backup.** A monthly restore drill records the *actually
achieved* RPO and RTO.

> Solar was destroyed on 2026-07-09 by an expiring free-tier database with no backups. This project
> self-hosts PostgreSQL — removing the expiry vector entirely — and treats restore evidence as mandatory.

## Supported versions

Pre-1.0. Security fixes land on `master`.
