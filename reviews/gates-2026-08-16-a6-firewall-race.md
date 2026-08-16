# Gates — 2026-08-16 · A6 database-firewall race, and three lying instruments

## What was changed

1. **A6** — one shared `concurrency: production-db-firewall`
   (`cancel-in-progress: false`) across **fifteen** workflows that PATCH the
   production Postgres `ipAllowList`, plus `timeout-minutes` on the three that
   had none.
2. **`scripts/record-live-state.sh`** — three defects, all "instruments that lie".
3. **`scripts/live-screen-audit.sh`** — a live `curl … || echo 000`.
4. **`scripts/guardrails/lint-shell-idioms.sh`** — new rule 4, closing the gap
   that let #3 survive.

---

## Gate 1 — Codex

Two passes were run. Prompts on **stdin from a file**, output **redirected to a
file** — never `| tail`, which destroyed the head of a review on 08-15.

### Pass A — the n8n proposal · `VERDICT: BLOCK-PENDING-ADR`

Superseded by the owner's own decision to drop n8n on cost grounds; recorded in
`docs/02-architecture/adr/ADR-022-N8N-AS-AN-AGENT-CREATION-SURFACE.md` (Status:
**Rejected**). Codex's substantive point — that n8n is zero *licence* cost but
non-OSI, and that the real cost is operational — is preserved there.

**Codex corrected me, and it mattered:** I had asserted "the ADK/MCP agent tier
does not exist in this repo", from an `apps/` listing alone. False.
`services/agent-host/` exists, `apps/api/src/agents/` holds seven files, and
`CURRENT_PHASE.md` records Phase 8 as *"Started, and off-plan"*.

### Pass B — the A6 diff · `VERDICT: CHANGES-REQUIRED`

**All four findings accepted and applied.**

| # | Finding | Response |
|---|---|---|
| 1 | **"Exactly two race mechanisms" is wrong — there are at least three.** The missed one: two unfiltered runs both GET the same original list, then both PATCH `original + mine`; the second add deletes the first's entry *before* either restore. Plus mixed-order *resurrection* of a stale entry. | Comment rewritten in all 15 to describe three mechanisms and the resurrection case. |
| 2 | **The one-pending-slot cost was understated.** A concurrency group is a mutex with a **one-element replacement waiting room**, not a 15-deep FIFO. A pending deploy/APPLY/seed/backup can be silently discarded by a newer arrival — and `apply-migrations` fires automatically after *every* Release, so automatic inspections compete with deliberate requests. Codex: "a substantive regression". | Accepted as the honest cost. Comment now carries it under a 🔴 heading with the operator instruction: capture the run id and confirm it **started**; a `cancelled` run you did not cancel is an evicted request. |
| 3 | **My comment overstated `cancel-in-progress: false`.** It does not close every cancellation path — job timeout, manual/API cancel and runner loss can still kill a run between its add PATCH and its restore, and `if: always()` is not a reliable finally block. | Comment corrected to state exactly what it does and does not guarantee. |
| 4 | Q1 **confirmed the set of fifteen** is correct and complete, and that excluding `provision-database.yml` is right (it never touches `ipAllowList`). | No change needed. |

---

## Gate 2 — Supervisor (run independently, not on Codex's say-so)

Findings **Codex did not reach**:

1. **The §0.1 exception has precedent** — `ADR-018-REPAIR-ORCHESTRATOR-NO-ADK`
   and `ADR-019-AGENT-HOST-WITHOUT-ADK` already took it with owner approval.
   Codex cited ADR-021 but neither of these.
2. **A seam already exists** for a non-ADK agent runtime:
   `AGENT_HOST_URL` / `AGENT_HOST_TOKEN` (`agent-host.client.ts:186-187`).
3. **Five of the fifteen already had a `concurrency:` block — each with its own
   per-workflow group.** That reads as protection and is none: a per-workflow
   group cannot prevent a race *between* workflows. Two literals in two files,
   in a new costume.
4. **Head-of-line blocking, introduced by this very fix.** Three workflows had
   no `timeout-minutes`, so GitHub's 360-minute default applied. **Not
   hypothetical: `rehearse-migration` run `31126439386` ran for 205 MINUTES.**
   Bounded from *measured* durations, not guesses: apply-migrations 30m
   (measured 1–2m), backup 45m (measured 1m, most generous because its runtime
   grows with the database), rehearse 30m (measured 0–2m).
5. **No deadlock** — verified no workflow in the group dispatches or waits on
   another in the group.
6. **A pre-existing ADR number collision**: two files numbered 018. Not
   introduced here; recorded rather than silently renumbered.

---

## The instruments, and a check that walked through its own gap

`scripts/record-live-state.sh` carried **three** defects, not the two the 08-15
notes recorded:

| Defect | Effect |
|---|---|
| `CUSTOMER`/`SUPPLIER` defaulted to `autoworkshop-{customer,supplier}.onrender.com` | ADR-021 **deleted** those services. The script printed `customer-web 404 · supplier-web 404` every run. Those 404s were **correct** and were reported as failures. |
| `curl … \|\| echo 000` | Yields `000000`. curl prints its code *and* exits non-zero, so the fallback fires too. |
| `grep -c … \|\| echo 0` | Yields `"0\n0"` → `[: integer expression expected` on every clean run. |

Also fixed: the cross-host supplier sign-in assertion **inverted** when ADR-021
landed. Absence is now the correct state; the row read like a failure. It now
says so.

🔴 **`scripts/guardrails/lint-shell-idioms.sh` had a rule for `grep -c … || echo`
and NO rule for the curl sibling** — so `live-screen-audit.sh:54` still carried
a live instance long after the class was "known". A check that catches one
member of a defect family and not its sibling reads as coverage and is not.
**Rule 4 added**, and **proven to discriminate in both directions**: a planted
offender makes it `RESULT: FAIL` exit 1; removing it returns `RESULT: PASS`
exit 0.

⚠️ **My first attempt at that proof was invalid** — the probe was untracked and
`TARGETS` is `git ls-files`, so it was never scanned and the rule "passed" a
file it had not read. Re-run with `git add -N`, it failed correctly. *A test
that cannot see its subject is not a passing test.*

---

## Runtime verification

- **All 40 workflow files parse** (`yaml.safe_load`, `jobs` key asserted) after
  every edit round.
- **15/15** carry `group: production-db-firewall` + `cancel-in-progress: false`;
  no sixteenth workflow was swept in.
- The excluded 25 were checked: **none** touches `ipAllowList` or connects to
  the production database.
- `scripts/guardrails/lint-shell-idioms.sh` → **RESULT: PASS**.
- **`record-live-state.sh` was RUN, not merely edited** — clean output, no shell
  errors, and it independently re-confirmed production health: apex, customer
  pack, supplier pack, api and keycloak all 200; 26 parts; 2 mechanics; and all
  three of last session's acquisition-funnel buttons present in the served HTML.

## Not done, and why

**No workflow was dispatched to test the mutex on real infrastructure.** Proving
eviction behaviour would mean deliberately racing two firewall-opening runs
against the production database, which is the exact hazard this change exists to
remove. The behaviour is GitHub's documented concurrency semantics, and the
change is inert until two of the fifteen actually overlap. **First real evidence
will be the next time two are dispatched close together — watch for a queued
rather than a failed run.**
