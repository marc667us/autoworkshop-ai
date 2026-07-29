# Current task

**▶ PHASE 5 slice 3b — diagnosis records.**

**Read `.claude/NEXT_SESSION_START_HERE.md` first** — start-up commands, sign-in
steps, acceptance checks, traps.

**Owner direction 2026-07-29: batch 3-4 slices per session** and run the gates
once per batch rather than once per slice. Phase 5 has ~12 slices left before
Release 0.4 and one-slice-per-session is too slow for a 14-phase programme. The
order below is dependency order, not preference — do not reorder it without a
reason.

---

## Where the last session stopped

Slice 3a is done: an inspection can be started, recorded against the 19
`07.txt` §2930-§2966 checkpoints, and submitted — after which it is immutable and
a second look is a new attempt. Migrations 010 + 011.

The rules, not the screen, were the deliverable again:
- the vehicle must be PRESENT (card at `initial_inspection`) before a sheet exists
- every checkpoint must be answered before submission, `not_applicable` included
- a submitted sheet is immutable in the service AND by database trigger
- `technician` is limited to ASSIGNED cards on every path, including reading a
  sheet by its own id

## The gap to close next — slice 3b

`initial_inspection` now has content behind it. **`diagnosis_in_progress` still
does not.** A card can move there and record nothing.

Ground it in the specs, transcribed not paraphrased:

- **`07.txt` §3026-§3046** gives the recordable fields of a diagnostic finding:
  fault code · fault description · affected system · observed symptom · test
  performed · expected result · actual result · interpretation · confirmed fault ·
  additional inspection required.
- **`02.txt` §1290** — "identify **confirmed, suspected and excluded** faults".
  That is a status on each finding, not a boolean.
- **`02.txt` §1294** — "the system shall preserve the distinction between **AI
  suggestions** and **technician-confirmed findings**." So a finding carries its
  SOURCE, and nothing may promote an AI suggestion to a confirmed fault silently.
  There is no AI in this build yet; the column and the rule land now so that when
  Phase 8 arrives it cannot be retrofitted wrongly.
- **`02.txt` §1276-§1282** — record observations, record measurements, enter fault
  codes. `08.txt` §352-§356 lists the measurement types (voltage, current,
  resistance, pressure, temperature); §3036-§3040's test/expected/actual IS the
  measurement record for this slice.
- **`02.txt` §1292** — "submit diagnosis for supervisor review where required."

Copy slice 3a's shape wholesale: header + child rows, created in one transaction,
immutable on submission, attempts rather than edits, role rules in their own
module with a drift test against the migration.

## Then, in order (the rest of Phase 5)

| # | Slice | Spec anchor |
|---|---|---|
| 3b | Diagnosis records | `07.txt` §3026-§3046, `02.txt` §1260-§1294 |
| 4 | Repair plan — tasks, tools, parts, labour | `1.txt` §378-§384, `07.txt` §22-§26 |
| 5 | Quotation preparation | `1.txt` §340, `07.txt` §29 |
| 6 | Solution Studio — proposal, versioning, variation, e-approval | `1.txt` §396-§424, spec 08 §14 |
| 7 | Execution — time recording, parts used, evidence | `1.txt` §386, `07.txt` §31-§34 |
| 8 | Testing + post-repair scan + road test | `1.txt` §388, `07.txt` §35-§37 |
| 9 | Quality control — INDEPENDENT of the work | `1.txt` §390, `2.txt` §563, `07.txt` §38 |
| 10 | Vehicle release | `07.txt` §39 |
| 11 | Reception / manager / owner dashboards reading real data | `07.txt` pt2 §5-§9 |
| 12 | Repair-request + complaint + notification inboxes | `07.txt` pt2 §10-§12 |

Then Phase 5 acceptance is `07.txt` pt2 §51-§52 — the complete workshop repair
flow end to end.

**Not in Phase 5, and the owner has asked about both:** the 3D fault and
repair-solution simulation is Phase 10 (viewer, Release 0.9) plus the new Phase 12
Simulation Intelligence (Release 1.1); the libraries — repair procedures, fault-code
search, diagnostic trees, wiring diagrams, knowledge base — are Phase 9
(Release 0.8). `PLAN_EXTENSION_v1` §3.2 calls the simulation "a module the size of
Phase 5" and sequences it after 1.0 for dependency reasons: measurement simulation
consumes confirmed diagnostic data, and the repair-solution flow needs the Phase 9
library and the Phase 8 approval gate. Building either now means building against
fixtures.

## Rules that keep applying

**Prove endpoints with real tokens, and the screen with a browser.** Slice 3a
added two re-runnable proofs — `packages/auth/verify/probe-inspection.mjs` (the
API) and `apps/e2e/verify/record-inspection-in-browser.mjs` (the form). Copy both
shapes. The API probe cannot catch a `<select>` whose `name` the server action does
not read, and the browser cannot prove what the API accepts when nothing is
offered.

**Measure the layout.** `apps/e2e/verify/measure-inspection-layout.mjs` catches
the `visuallyHidden`-escapes-its-container defect that has now landed twice.

**A migration already applied is CHECKSUMMED.** Fixes go in the next number.

**Definition of complete (`05.txt` §6):** migration runs · backend rule exists ·
API works · page renders with loading/empty/error/permission states · permissions
enforced · tests pass · lint + typecheck pass · Playwright journey passes ·
responsive checked · docs updated · **no paid dependency** · committed.
