# Phase 5 slice 3a — inspection records · review record

**Date:** 2026-07-29
**Scope:** `07.txt` §2920-§2978 (INITIAL INSPECTION FLOW), `1.txt` §368 ("Inspections"),
`2.txt` §557, §563, `07.txt` pt2 §50.
**Verdict: PASS.** Codex 2 findings, Supervisor 2 more that Codex missed, all four fixed
and re-verified.

---

## Gate 1 — Codex CLI

Run directly rather than through `scripts/codex-review.sh`, because that script's
`gather_context` diffs `HEAD~1..HEAD` — it would have reviewed the PREVIOUS COMMIT, not
this uncommitted slice, and most of these files are untracked so `git diff` does not
show them at all. Codex was given the explicit file list and told to exclude
`docs/*.md`, older migrations and unrelated features (the standing
`feedback_codex_stale_artifact_distraction` rule) and to ground every claim in lines it
had read.

Codex executed read-only commands itself (`git status`, `Get-Content`, `rg`), so this was
a real code read and not diff-guessing.

The raw transcript (11k lines, almost all of it file dumps) is deliberately NOT committed:
`feedback_codex_stale_artifact_distraction` records that Codex drifts onto stale logs in
later runs, so leaving one in `reviews/` would degrade the next review. Both findings are
reproduced verbatim below.

### Codex P1 — no UI path to start a second attempt · ACCEPTED, FIXED

`inspection-queue-screen.tsx` rendered the sheet link whenever a current inspection
existed, and `StartInspectionForm` only when there was none. So once attempt 1 was
submitted the row offered nothing but "View inspection", while the API explicitly allows
a new attempt.

**Why this mattered more than it looks.** The whole immutability design of this slice
rests on a second look being reachable — the API's own refusal says *"this inspection is
submitted and cannot be changed; start a new inspection to record a second look"*. The
product had nowhere to do that. **A rule whose only escape hatch is unreachable is not a
rule, it is a wall**, and the technician's remaining options would have been to leave the
finding unrecorded or to talk somebody into editing the database.

Fixed: the row now also offers "Start a new inspection" when the newest attempt is
submitted, the card is at `initial_inspection`, and the viewer may record — exactly the
conditions under which the API would accept it. **Proven by USE, not by render:** the
browser script drove that branch, created attempt 3 and recorded into it.

### Codex P2 — a submitted inspection could omit `submitted_by` · ACCEPTED, FIXED

010's `submitted_has_when` required `submitted_at` for a submitted row but not
`submitted_by`. Not reachable through the API (the service always writes both), but the
app role holds UPDATE, so only application code stood between that row and the database —
and this repo's rule is that app code is the first line and the constraint is the last.

Fixed in **migration 011**, never as an edit to 010: 010 is applied and checksummed, and
editing it would trip the drift guard and block every later migration. 011 counts
offending rows and RAISEs before altering, so it refuses rather than silently tolerating
existing bad data. `started_by` deliberately left nullable — an inspection can outlive the
user record that opened it, which is why the read path LEFT JOINs `identity.users`.

**Proven by effect:** an unattributed submitted row is refused by the CHECK; the same row
with attribution is accepted.

---

## Gate 2 — Supervisor, run independently

Two findings Codex did not raise. (Also relevant: the security review found no HIGH or
MEDIUM exploitable vulnerability — the IDOR surface on the server actions is closed
because every write re-derives tenant, organization and technician assignment
server-side, and a technician probing an unassigned card gets **404, not 403**.)

### Supervisor 1 — an empty sheet would submit as complete · FIXED

The completeness gate asks "is any checkpoint unanswered". For a sheet with **no**
checkpoints that is false, so an empty inspection would submit cleanly and become a
finding of record stating a vehicle was inspected against nothing — **a vacuous truth in
the one gate this slice exists to provide.** Not reachable through `start`, which writes
all 19 rows in the same transaction; reachable by any future importer, fixture or manual
insert. Guarded with a count, and unit-tested.

### Supervisor 2 — a dead join in an authorization path · FIXED

`readInspections` joined `core.customers` and never referenced it in the `WHERE` clause.
Harmless in effect — `customer` is excluded from `CAN_READ_INSPECTION` — but it read as
though an ownership predicate were applied when none was. **That is the most dangerous
kind of dead code in an authorization path:** the next person adding an owner-scoped role
would see the join and assume the narrowing was already done. Removed, with a comment
saying where the predicate must go if such a role is ever added.

---

## What was verified, and how

| Check | Result |
|---|---|
| typecheck · lint | 15/15 · 15/15 |
| unit tests | **268** total (API 174; was 139 before this slice) |
| page-gate guard | OK · self-test 23/23 · **proven to see the new pages** by removing a gate and watching it fail |
| Playwright | **138 passed / 2 skipped / 0 failed** |
| API probe, real Keycloak tokens | 39/39 from clean state; 33/33 on re-run (adopts an open sheet and says so) |
| browser form drive | 15/15, including the second-attempt path |
| layout measurement | 14/14 at 1280 / 768 / 390 |
| RLS | `relrowsecurity = t, relforcerowsecurity = t` on both tables, measured — not read off the migration |
| immutability trigger | UPDATE and DELETE on a submitted sheet refused; in-progress still writable (`DELETE 1`) |

**Cross-role refusals, all with real tokens:** technician on an unassigned card → **404**;
reception → 200 read but **403** on both write paths; customer → **403** on all four read
and write paths, including on their own car's job card (`2.txt` §557 gives the owner a
prepared report, not the working sheet); admin in Alpha Motors sees both attempts, which
is what confirms reception's empty read was organisation scoping and not a broken query.

---

## Defects of my own, found by running rather than reasoning

1. **`visuallyHidden` note labels with no positioned ancestor** stretched the document
   23px at a 390px viewport. Identical shape to slice 2's 4906px staging-board defect,
   two days later, in code written by someone who had just read that note. Fixed on the
   ancestor (`position: relative` on the cell), not on the label. The queue's Action cell
   had the same latent bug and was fixed with it.
2. **A `BEFORE DELETE` trigger returning `NEW`** (NULL on delete) would have **silently
   skipped** the delete rather than refusing it — a successful statement that deletes
   nothing. Caught before applying; the control test now proves `DELETE 1`.
3. **Backticks in a SQL comment inside a template literal** ended the string. Cost one
   failed transform — and note the shape of the failure: **49 tests "passed" while an
   entire file failed to compile.** Reading the FILE count caught it, exactly as slice 2's
   lesson says.

## Harness defects fixed along the way

- **`capture-session.mjs` could not sign in to customer-web at all** — the signed-out
  landing page offers "Sign in" twice (global actions + main content), a Playwright
  strict-mode violation that reads as "capture is broken". Pre-existing, blocking ANY
  customer-web session capture. `.first()`.
- My own probe harness twice reported defects that did not exist: colliding SQL regexes
  fed rows of the wrong shape to the wrong query, and `locator.count()` (which does not
  auto-wait) measured the page before it rendered. Both noted in the scripts, because a
  harness that cries wolf is as costly as one that runs nothing.
- An unscoped `[role="alert"]` matched the **shell's own empty live region** — the trap
  already recorded for `[role="status"]`, tripped again by its sibling.

## Deliberately not built

- **§2978 photographs, video, audio evidence** — needs object storage. MinIO is in the
  compose stack but nothing is wired to it. The screen NAMES the gap rather than showing a
  disabled camera button, the same judgement T-0042 made about §537's voice notes.
- **`2.txt` §555 configurable per-organisation checklists** — needs a template table, an
  editor, and a rule for inspections already in progress when a template changes. The
  schema is ready: items store the checkpoint code AND its position as asked, so a future
  template cannot rewrite the meaning of a historical sheet.
- **Submitting an inspection does not move the job card.** Stage transitions are slice 2's
  domain and stay there; the technician moves the card on the staging board.

## New re-runnable verification

- `packages/auth/verify/probe-inspection.mjs` — drives the whole §2920-§2978 flow with a
  real access token. Lives in `packages/auth` because `next-auth/jwt` only resolves there
  under pnpm's store, and because `call-api-as.mjs` truncates bodies to 400 characters for
  review notes and so cannot be parsed.
- `apps/e2e/verify/record-inspection-in-browser.mjs` — records through the SCREEN. The API
  probe cannot catch a `<select>` whose `name` does not match what the server action reads.
- `apps/e2e/verify/measure-inspection-layout.mjs` — the escape signature
  (`documentElement.scrollWidth` ≫ `body.scrollWidth`) and "hidden text is really hidden",
  at three viewports.
