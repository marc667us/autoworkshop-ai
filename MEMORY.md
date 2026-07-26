# MEMORY.md — AutoWorkshop AI project memory

Durable facts for this repository. Update when project state changes.

## Status

**Release 0.1 (foundation) — in progress.** Build started 2026-07-25 after the plan passed
Codex (`PASS WITH CORRECTIONS`, 14 applied) and the Supervisor (`PASS WITH CONDITIONS`, 8 applied).

## Owner directions — binding, do not re-litigate

| # | Direction |
|---|---|
| 1 | Name is fixed: **AutoWorkshop AI** at `autoworkshop.aiappinvent.com`. "GarageOS AI" is dropped. |
| 2 | **Stop cutting scope.** All deferrals by both planners rejected. Build everything structurally. |
| 3 | **Reuse Solar components but don't mix things up.** Patterns yes; entanglement no. |
| 4 | DNS is **Namecheap**, same zone as `solarpro`, pointing at separate infrastructure. |
| 5 | **Zero-cost policy applies here too — including production.** |
| 6 | **Never decide to spend.** Proposing an OBD dongle purchase was a breach. |
| 7 | **Let users decide how they connect** — bring-your-own-connection (ADR-015). |
| 8 | Zero-cost now; **commercial infrastructure later** only if going commercial (ADR-016). |
| 9 | **Solar is the reference — always refer to it.** |

## Environment (verified 2026-07-25)

Node 20.19.2 · pnpm 9.15.4 (via corepack; **pnpm 10+/11 require Node >=22.13 — do not upgrade**) ·
Python 3.14.4 · google-adk 2.2.0 (imports cleanly on 3.14.4) · Docker 29.4.3 · Ollama 0.24.0 · Git 2.53.0 ·
gh CLI at `%USERPROFILE%\bin\gh.exe`.

## CI defects already found and fixed (do not reintroduce)

1. **Zero-cost gate false positive** — `xargs -r` exits 0 on empty input and `if <exit 0>` is true. Test
   captured output, not pipeline status.
2. **pnpm/Node mismatch** — `pnpm@latest` is v11 and needs Node >=22.13; Node 20 is pinned to match the dev
   machine. pnpm is pinned to 9.
3. **`google/osv-scanner-action@v1` does not resolve** — install via `go install` instead.

## Solar lessons applied here

- Free-tier Postgres **expired and destroyed Solar on 2026-07-09** with no backups -> Postgres is
  **self-hosted** here (no expiry vector) with WAL/PITR + off-host backups.
- Secrets leaked for 35 days (2026-07-10) -> `.env` and key material are blocked by a CI gate.
- Keycloak **OOM'd** on a constrained host -> heap capped at 512MB in compose.
- Narrow `VARCHAR` truncated AI-generated content -> `TEXT` for all free-text columns.
- Render **ignores the Procfile**; auto-deploy is flaky.
