# Gate record — 2026-08-15 session plan and stale-artifact fixes

**Subject reviewed:** `.claude/TASK_LIST_2026-08-15.md` (the session plan) and
the working-tree diff that fixes the stale artifacts it uncovered.

**Order:** Claude implements → **Codex reviews** → **Supervisor adjudicates**.
Both gates ran. Neither was bypassed.

---

## Gate 1 — Codex CLI

`codex.cmd exec --skip-git-repo-check -s read-only` with the prompt on STDIN
from a file (a prompt passed as an argv string reads only its first line, and
backticks inside a double-quoted shell string EXECUTE — both recorded defects).

🔴 **MY OWN ERROR, RECORDED FIRST: I piped Codex's output through `tail -200`.**
`tail` keeps the LAST n lines, so **the head of the review was destroyed** —
the first finding's severity label and title are gone; only its body survived.
It also masks the exit code, which is a separately recorded defect in this
repository that I reintroduced. **Do not pipe a review to `tail`. Redirect to a
file and read the file.**

### Codex verdict: the plan was materially wrong in four places

| # | Severity | Finding |
|---|---|---|
| 1 | (label lost to truncation — body survived) | **Slice 19 must not create `fleet.vehicles`.** `core.vehicles` already IS the vehicle aggregate |
| 2 | HIGH | **Slice 19 omits the cross-tenant boundary.** A fleet has its own tenant; a triple FK cannot express a request to a foreign workshop |
| 3 | HIGH | **A6 must be first.** A4/A5/A7 all depend on evidence this defect corrupts |
| 4 | MEDIUM | **The proposed A6 fix is still race-prone** — Render's API PATCHes the whole list |
| 5 | MEDIUM | The `(x, tenant_id, organization_id)` rule was stated too broadly — it has three tiers |
| 6 | MEDIUM | Slice 19 must not create a second financial source of truth alongside `finance.invoices` |
| 7 | MEDIUM | `SET NULL (job_card_id)` names a column slice 19 does not have — state the rule generically |
| 8 | MEDIUM | 18 → 17 ordering is sound, but "no product can EVER be listed" is overstated |
| 9 | MEDIUM | Part C **over-reads** `types.ts` "ROLE IS NOT WORKSPACE" to excuse missing roles |
| 10 | MEDIUM | **`platform_administrator`'s ongoing production write path is UNVERIFIED** |
| 11 | MEDIUM | A5's external expiry/pricing claims are UNVERIFIED and unverifiable from the repo |
| 12 | LOW | **All seven of the plan's measured repository facts are CORRECT** |

---

## Gate 2 — Supervisor

Run **independently**, not as a rubber stamp on Codex. The recorded rule is that
neither reviewer alone has been sufficient for five sessions running, and that a
Codex finding must be checked against source before being accepted — two were
wrong on 08-11 and production said so.

### 2a. Findings the Supervisor produced BEFORE Codex reported

Found by measuring the repository directly; none came from Codex:

- **D1** — `RELATIONSHIPS.md §8` headed "🔴 STILL OPEN — fourteen tenant-only
  keys" while migration 079 closed all fourteen on 08-11. **Confirmed against a
  running database, not just the migration file:** two-column FKs in those ten
  schemas = **2**, three-column = **71**, and the two remaining are by name
  `core.organization_profile.fk_profile_org_scope` and
  `repair.organization_pricing.fk_pricing_org_scope` — exactly the pair the
  document itself calls *correctly* two-column.
  🔴 **It had already propagated into `CURRENT_PHASE.md` gap #3, so a session
  trusting the phase file would have rebuilt migration 079.**
- **D2/D3** — `account-types.ts` docstring asserted no migration writes
  `insurance_assessor`/`towing_operator` and "nobody can become one"; false since
  080, contradicted by live code 30 lines above and by its own sibling comment.
  It cited `docs/01-product/IDENTITY_GAPS.md`, which does not exist.
- **Ordering** — `insurance.reject_unverified_product_publication()`
  (`082:166`) forces slice 18 before slice 17.
- **Scoping** — the plan sized a new role at 3 files; `insurance_assessor`
  appears in **20 source files**. The 08-11 "4× under-scope" failure, repeated.
- **Phase call** — Phase 6 and 7 are both open and the plan sequences 6 first;
  raised as an owner decision rather than asserted.

### 2b. Adjudication of Codex's findings — verified against source

| Codex claim | Verdict | Evidence the Supervisor checked |
|---|---|---|
| `core.vehicles` already holds the vehicle identity | **CONFIRMED** | `004:140-176` — registration, VIN, make/model/variant/year, mileage, insurer, status. `customer_id` is **NOT NULL**, which is the real design constraint |
| Towing is not a counter-example | **CONFIRMED** | `074:68` `recovery_vehicles` are tow trucks; `074:145` requests reference `core.vehicles` |
| No production path writes `platform_administrators` | **CONFIRMED** | All ten API references are READS or comments (`tenant-context.ts:26`, `permission-matrix.ts`, two controllers). The only writer is `077:231`, a one-time backfill |
| The A6 fix is still race-prone | **CONFIRMED, AND WORSE** | `apply-migrations.yml:196-215` — the race is at **CAPTURE**: the snapshot filters out every `ephemeral:` entry, so run B deletes run A's entry *while A is connected*. Both add and restore PATCH the entire list |
| 18 → 17 sound but overstated | **ACCEPTED** | The endpoints exist; an admin can verify by hand. The correct ground is "no acceptable operating procedure", not impossibility |
| Part C over-reads `types.ts` | **ACCEPTED** | `types.ts:80-93` says only (a) §50 names eight roles and (b) do not fork the workspace per role. It says nothing about competencies. Downgraded to UNVERIFIED |

**No Codex finding was rejected. All twelve were accepted or accepted with a
correction.** That is unusual here and worth noting rather than glossing.

### 2c. Supervisor `/code-review` on the resulting diff

**Zero findings.** *"The only code-file change is a comment block correction in
`apps/web/app/onboarding/account-types.ts:284` — no runtime logic altered."*

### 2d. `/verify` — replaced by a manual read, per the root rule for doc changes

No running app is involved. Instead:
- `tsc --noEmit` on `apps/web` — **exit 0**
- `vitest run app/onboarding/account-types.spec.ts` — **23 passed / 0 failed / 0 skipped**
- `<details>`/`</details>` balance in `RELATIONSHIPS.md` — 1 / 1
- Diff read by hand: 3 modified files, 128 insertions, 36 deletions, no logic

---

## What the plan claimed that has been DEMOTED to UNVERIFIED

Recorded explicitly, because a confident wrong claim is the expensive kind:

1. "Every role in the code has a production write path" — **false**;
   `platform_administrator` has none. **Fifth role caught by that question.**
2. "Trade roles are competencies, not roles" — plausible, **unproven**.
3. "Teardown removing only this runner's entry is safe by construction" —
   **false**; the API has no atomic per-entry operation.
4. Backup artifact expiry, database expiry 2026-09-01, Neon-free suitability —
   **external facts, not checkable from this repository.**
5. "J1 deployed on production" — the CODE half is verified in source
   (`tenant-context.ts:177`); the DEPLOYED half remains recorded, not measured.

## Zero-cost

Nothing in the plan or the diff introduces a paid dependency, and no spend is
proposed anywhere. A5 explicitly restates that the destination must involve no
paid upgrade, no auto-billing trial, no metered storage and no payment method.
