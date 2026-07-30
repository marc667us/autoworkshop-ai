# Current task

**▶ PHASE 5 slice 4 — the repair plan.**

**Read `.claude/NEXT_SESSION_START_HERE.md` first** — start-up commands, sign-in steps,
the outstanding list, and the traps. Section 5 there is what makes slice 4 faster than 3b.

**Owner direction 2026-07-29, still standing: batch 3-4 slices per session** and run the
gates once per batch rather than once per slice. The order below is dependency order, not
preference — do not reorder it without a reason.

---

## Where the last session stopped

**Slice 3b is DONE (`b243552`).** A diagnosis can be started on a card at
`diagnosis_in_progress`, findings recorded against §3026-§3046's fields, each carrying
§1290's standing (confirmed / suspected / excluded) and §1294's source, submitted for
§1292's supervisor review, and approved or rejected with a reason by somebody who did not
submit it. Immutable once submitted; a further opinion is a new attempt. Migrations 012 + 013.

**The rules, not the screen, were the deliverable again — and the ones worth carrying:**

- **§1294 is structural, not displayed.** `source` is a SQL literal in the INSERT, never a
  parameter, so a caller cannot file a machine's guess as a technician's finding. A finding is
  `confirmed` only if a human is named against it — and the signature is CLEARED when the
  standing moves away from confirmed, because the CHECK constraint only constrains rows that
  ARE confirmed.
- **§1292's review needs TWO rules.** Role (no technician reviews a diagnosis) AND identity
  (the submitter may not review their own). Neither is sufficient: role alone lets two
  technicians sign each other's work, identity alone lets a technician sign a colleague's.
- **A new attempt is refused while the last one is SUBMITTED.** Codex found this as a HIGH:
  every read path orders by `attempt_no DESC`, so starting attempt 2 made the submitted
  attempt 1 stop being "the current record" and the awaiting-review count fell to zero with a
  diagnosis still unreviewed. **Worse than a lost row, because nothing looks wrong.**
- **Zero findings cannot be submitted**, and the refusal says a fault RULED OUT is a finding
  too — otherwise it reads as "you must find something wrong", which invents faults.

## ▶ SLICE 4 — the repair plan

`1.txt` §378-§384 and `07.txt` §22-§26. **It consumes the CONFIRMED findings of an APPROVED
diagnosis**, which is exactly why 3b had to land first — the plan is what a quotation is
priced from, so a plan built on a suspected fault is a customer charged for a guess.

Steps, in order:

1. **Migration 014** — `repair.repair_plans` + child rows for tasks, tools, parts and labour.
   Copy 012's shape: composite tenant-carrying FKs, RLS ENABLE **and** FORCE (measure `t|t`,
   never read it off the file), immutability triggers, DELETE withheld on the header and
   granted on the children **only while the plan is open** (013's reasoning — the trigger is
   the narrowing, the grant is the permission).
   ⚠️ **Decide up front what a plan LINKS TO.** A plan line should reference the
   `diagnostic_findings.id` it addresses, so slice 9's QC can ask "was the confirmed fault
   actually repaired". A plan that only names free text cannot answer that, and no later
   migration can reconstruct the link.
2. `apps/api/src/repair/repair-plan-rules.ts` — the field list, the statuses, role sets, the
   start stage. Copy `diagnosis-rules.ts` **including its drift test against the migration**
   (all four CHECK lists are compared to the SQL text).
3. `repair-plan.service.ts` — copy `diagnosis.service.ts`. It has the right shape already:
   `assertCardVisible` (404 not 403), `assertWritable` with `FOR UPDATE`, attempts not edits,
   the technician-assignment predicate on EVERY path including read-by-id, an assembled
   partial UPDATE where absent ≠ cleared, and the approval path with both independence rules.
   **Guard the empty-plan submission up front** — third slice running where that hole existed.
4. **§384's approval gate** if the specs require one at this stage; reuse 3b's review shape
   rather than inventing a second one.
5. Controller routes + `RepairModule` wiring (it already imports `IdentityModule`).
6. Screens at every route the nav already advertises. **Checked against
   `packages/navigation/src/workspaces.ts` at close — there are THREE distinct paths, not
   four**, because §46 (owner) and §47 (manager) both name this screen
   `repair-control/repair-plans`:

   | Tree | Path |
   |---|---|
   | §34 default (incl. `workshop_supervisor`) | `/repair-services/repair-plans` |
   | §46 owner **and** §47 manager | `/repair-control/repair-plans` |
   | §49 technician | `/plan-work/repair-planning` |

   Slices 3a and 3b each needed four directories, so the reflex is wrong here — creating a
   fourth would be a page no nav tree points at. **Re-check the file anyway** rather than
   trusting this table; and remember a `workshop_supervisor` reads the §34 default tree, which
   is where any approval control has to be reachable.
7. Copy the three proofs and point them at the plan: `probe-diagnosis.mjs`,
   `record-diagnosis-in-browser.mjs`, `measure-diagnosis-layout.mjs`.

## Then, in order (the rest of Phase 5)

| # | Slice | Spec anchor |
|---|---|---|
| ~~3b~~ | ~~Diagnosis records~~ | ✅ `b243552` |
| 4 | Repair plan — tasks, tools, parts, labour | `1.txt` §378-§384, `07.txt` §22-§26 |
| 5 | Quotation preparation | `1.txt` §340, `07.txt` §29 |
| 6 | Solution Studio — proposal, versioning, variation, e-approval | `1.txt` §396-§424, spec 08 §14 |
| 7 | Execution — time recording, parts used, evidence | `1.txt` §386, `07.txt` §31-§34 |
| 8 | Testing + post-repair scan + road test | `1.txt` §388, `07.txt` §35-§37 |
| 9 | Quality control — INDEPENDENT of the work | `1.txt` §390, `2.txt` §563, `07.txt` §38 |
| 10 | Vehicle release | `07.txt` §39 |
| 11 | Reception / manager / owner dashboards reading real data | `07.txt` pt2 §5-§9 |
| 12 | Repair-request + complaint + notification inboxes | `07.txt` pt2 §10-§12 |

Then Phase 5 acceptance is `07.txt` pt2 §51-§52 — the complete workshop repair flow end to end.

**Not in Phase 5, and the owner has asked about both:** the 3D fault and repair-solution
simulation is Phase 10 (viewer, Release 0.9) plus the new Phase 12 Simulation Intelligence
(Release 1.1); the libraries — repair procedures, fault-code search, diagnostic trees, wiring
diagrams, knowledge base — are Phase 9 (Release 0.8). `PLAN_EXTENSION_v1` §3.2 calls the
simulation "a module the size of Phase 5" and sequences it after 1.0 for dependency reasons:
measurement simulation consumes confirmed diagnostic data, and the repair-solution flow needs
the Phase 9 library and the Phase 8 approval gate. Building either now means building against
fixtures.

## Rules that keep applying

**Every refusal must name a REACHABLE alternative.** Three slices running, this has been the
most expensive class of defect: 3a's API said "start a new inspection" with no way to;
3b's migration wrote a DELETE trigger branch and revoked the privilege that would reach it;
3b's first `updateFinding` could overwrite a wrong fault code but never clear it. When you
write a refusal, open the screen and do the thing it suggests.

**Prove endpoints with real tokens and the screen with a browser** — and for any rule about
WHO, capture TWO sessions (`capture-session.mjs --out`). A single-identity probe asserts the
role check and silently skips the identity check.

**Measure the layout**, and make the measurement fail when it measures nothing. The
`visuallyHidden` escape has landed twice; the population of hidden elements grows with the
DATA, so measure a page that HAS data.

**A migration already applied is CHECKSUMMED.** Fixes go in the next number.

**Definition of complete (`05.txt` §6):** migration runs · backend rule exists · API works ·
page renders with loading/empty/error/permission states · permissions enforced · tests pass ·
lint + typecheck pass · Playwright journey passes · responsive checked · docs updated ·
**no paid dependency** · committed.
