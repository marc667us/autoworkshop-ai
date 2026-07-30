# Phase 5 slice 3b — diagnosis records

Reviewed 2026-07-30. Commits `a1527a2` (slice) + the fix commit that follows this file.

The raw Codex transcript is deliberately NOT committed — `feedback_codex_stale_artifact_distraction`:
committed review logs become the stale artefacts the next review drifts onto. The findings and
what was done about them are below; that is the durable part.

## Gate 1 — Codex CLI (reviewer)

`codex exec -s read-only`, gpt-5.5, prompted adversarially against the CODE ONLY (docs, `.claude/*`
and older logs explicitly excluded) with a demand for a concrete failure scenario per finding.

**Two findings. Both accepted and fixed. Both were real.**

### HIGH — §1292's review was bypassable without deleting anything

`start()` blocked a new attempt only when one was `in_progress`, so: submit attempt 1, immediately
start attempt 2. Every read path — the service, the queue, the review queue — orders by
`attempt_no DESC` and treats the newest as "the current record", so the in-progress attempt 2
became current and the SUBMITTED attempt 1 stopped being surfaced. The awaiting-review count fell
to zero with a diagnosis still unreviewed.

Worse than a lost row, because nothing looks wrong. The row was intact and the obligation to
review it was gone.

**Fixed** in three places, because one would have left a button the API refuses:
- `start()` refuses while any attempt is `in_progress` **or** `submitted`, with a DIFFERENT sentence
  for each — the caller's next action is not the same.
- the queue offers "Start a new diagnosis" only for `approved`/`rejected`.
- three unit tests plus an API-probe assertion (`§7`).

### MEDIUM — a nullable field could be overwritten but never cleared

`updateFinding` used `COALESCE($n, column)` throughout, which collapses "clear this" and "not
mentioned" into one request. A fault code typed against a fault that turns out to set no DTC could
be replaced with a different wrong code, never removed. The only way out was deleting the finding
and retyping the reasoning — destroying the record around a field in order to fix that field, and
the wrong audit semantics for a typo.

**Fixed.** The SET list is now assembled from the fields the caller actually mentioned (column
names from literals in the service; every value bound), giving three meanings: absent leaves,
`null`/`''` clears, a value sets. `fault_description`, `affected_system` and `finding_status` are
NOT clearable — 012 declares them NOT NULL, so an attempt is a 400 naming the field rather than a
23502 surfacing as a 500. `JSON.stringify` omits undefined properties, which is what makes
absent-versus-null distinguishable on the wire.

Also made REACHABLE, which the API fix alone did not: each finding gained a "Correct the details"
disclosure, because an API that can clear a column and a product that cannot is half a feature —
the same unreachable-alternative trap slice 3a paid for, in another costume.

### Codex found NO issue with

Tenant isolation, the technician read-by-id narrowing, the review path's dual role+identity check,
or the migration 013 DELETE grant. Stated here because "no findings at this severity" is a result.

## Gate 2 — Supervisor (independent)

Run against the source, not against Codex's list — last session the Supervisor found 2 defects
Codex missed, and `feedback_never_bypass_codex` is explicit that Codex is not infallible.

**Found before Codex ran, during implementation:**

1. **Migration 012 wrote a trigger branch that could never execute.** It revoked DELETE on
   `repair.diagnostic_findings` and *also* wrote `reject_settled_finding_change()` with a `TG_OP =
   'DELETE'` guard and a `RETURN OLD` — the whole narrowing existed except permission to reach it.
   A mis-entered finding therefore stood for good: `excluded` means "a fault I RULED OUT" so
   recording a typo as one puts a false statement in the record, and a second attempt cannot start
   while one is open. **Migration 013** grants DELETE on the child table only; the header keeps its
   revoke. This is the trap recorded as the lesson of 2026-07-29, re-created by the migration
   written the same day.
2. **The confirmation signature had to move in BOTH directions.** Setting `confirmed` stamps the
   confirmer (§1294). Setting anything else must CLEAR it — the CHECK constraint only constrains
   rows that ARE confirmed, so a finding downgraded to `suspected` while still naming a confirmer
   would read as though somebody had signed for a fault that is no longer established.
3. **The zero-findings submission gate.** Slice 3a shipped the mirror image ("is any checkpoint
   unanswered" is vacuously false for zero checkpoints) and only the Supervisor caught it. Here the
   hole is WIDER, because a diagnosis legitimately starts empty — there is no template written with
   the header. Guarded up front, and the refusal names §1290's `excluded` so it does not read as
   "you must find something wrong", which invents faults.

**Found in the harnesses, which is where the rest of the session's cost went:**

4. **Three stale servers were serving the build from 2026-07-29.** `pkill -f` from Git Bash does
   not kill Windows processes, so `/api/v1/diagnoses` 404'd while `/api/v1/inspections` answered
   401, and a page rendered the "not built yet" catch-all. Use `Get-NetTCPConnection -LocalPort N`
   → `Stop-Process`. Third instance of this trap in the repo's notes.
5. **A `waitFor` on a condition already true is not a wait.** The browser harness pressed Start
   then waited for "a link" — which was already on the row, pointing at the previous approved
   attempt. It opened the read-only record and reported the missing form as a product defect. The
   queue's VERB (`Record` vs `View`) is the only reliable signal.
6. **`count()` still does not auto-wait** — the setup phase reported "cleared 0 pending review(s)"
   on a page that had not rendered. Recorded once per role already; third payment.
7. **`StatusBadge` renders its own `role="status"`**, so an announcement helper returning the first
   non-empty live region returned the word "In progress". Two live-region traps in this repo now,
   both about matching too loosely.
8. **A harness that measures its own residue.** Findings accumulate across runs, so
   `filter({ hasText: 'Browser-recorded coil fault' })` matched several rows and `.first()` picked
   one whose code an earlier run had already cleared — reported as two product defects. Every record
   the script creates now carries a per-run tag.
9. **The accessible name is not the visible text.** The Remove button reads "Remove" and carries an
   `aria-label` naming the finding, so `getByRole({ name: /^Remove$/ })` matched nothing.
10. **A measurement that measured nothing and still said OK.** The layout script followed any link
    and landed on a SETTLED record — read-only, zero `visuallyHidden` labels — printing
    "0 measured" and passing. The hazard lives specifically on the EDITABLE record, where each
    finding adds another absolutely positioned label; it now creates that state and FAILS if zero
    labels were measured.
11. **`.gitignore` covered one filename, not the pattern.** `capture-session.mjs --out` writes
    arbitrary names, and `git add -A` staged `.verify-tech-cookies.json` +
    `.verify-sup-cookies.json` — an encrypted Auth.js session and a live Keycloak access token.
    Caught before commit; the ignore is now a glob.

**Security review:** no HIGH/MEDIUM. The IDOR surface on the Next server actions is closed because
every write re-derives tenant, organisation and technician assignment server-side and answers 404
(not 403) outside them. `source` is a SQL literal, never a parameter, so §1294's distinction cannot
be set by a caller. The assembled UPDATE takes column names from service literals only — asserted
by a test that sends `P0301'; DROP TABLE repair.diagnoses; --` and checks it reaches `values`, not
the SQL text. `apiDelete` sends no body and no `Content-Type`.

**`/verify` (runtime, on a running app)** — run, not skipped:

| Proof | Result |
|---|---|
| API boots, all 8 diagnosis routes mapped | `RouterExplorer` log + 401 (not 404) on each |
| `packages/auth/verify/probe-diagnosis.mjs` — real Keycloak tokens, TWO identities | **46/46** |
| `apps/e2e/verify/record-diagnosis-in-browser.mjs` — through the screen, both identities | **37/37** |
| `apps/e2e/verify/measure-diagnosis-layout.mjs` — 1280/768/390 | **15/15** |
| `infrastructure/migrations/verify/013_finding_removal.sql` — as `autoworkshop_app`, under RLS | **3/3** |
| `scripts/guardrails/check-page-gates.sh` | OK — and **control-tested** by removing a gate and confirming it FAILS |
| unit | **338** (API 244, incl. 70 for this slice) |
| typecheck · lint | 15/15 · 15/15 |
| Playwright | **138 passed / 2 skipped** — the COUNT, never the exit code |

T-0044 (51px sideways scroll at 768px) measured identical on both new pages and on the pre-existing
shell, so it is not from this slice.

**SUPERVISOR VERDICT: PASS.**
