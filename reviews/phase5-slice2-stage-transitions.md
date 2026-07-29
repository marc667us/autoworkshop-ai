# Phase 5 slice 2 — stage transitions + Repair Staging Board

**Gate record.** Codex (reviewer) → Supervisor (adjudicator, run independently) → runtime proof.

Requirements implemented:

- `02.txt` §29 — the staging board, its columns, and *"Drag-and-drop movement shall
  not bypass business rules. **The backend shall validate every stage change.**"*
- `1.txt` §394 — *"The repair staging board shall enforce transition rules. A
  technician must not manually bypass required approval, payment, parts or
  quality-control states **without an authorized, logged override.**"*
- `07.txt` pt2 §50 — the role-based control summary.

---

## Gate 1 — Codex: 2 findings, both accepted and fixed

Codex executed commands (its sandbox was not blocked this run), so this was a
grounded review rather than diff-reading.

**HIGH — stage events were tenant-isolated but not organization-bound.**
`repair.job_card_stage_events` stored `organization_id` while its foreign key
referenced `repair.job_cards(id)` alone, and both resume lookups selected on
`job_card_id` only. Nothing in the schema required an event's organisation to be
its card's.

*Supervisor adjudication: real, but **severity lowered to MEDIUM — not reachable
today**.* `JobCardService` is the only writer and always inserts
`ctx.tenantId`/`ctx.organizationId` beside a card id it has just verified. Codex's
scenario needs a second writer that does not exist. Fixed anyway, because the
answer to "a foreign key cannot carry a tenant predicate" is to make the key
composite so that it can:

- migration **009** adds `UNIQUE (id, tenant_id, organization_id)` on
  `repair.job_cards` and a composite FK from the event table;
- both the LATERAL join and the write-path lookup now carry explicit
  `tenant_id`/`organization_id` predicates as well (app code first, constraint last).

**Proven by attempting the exact attack** — inserting an event for an Alpha Motors
card carrying the *real* Alpha Parts Supply organisation id, same tenant:

```
ERROR: insert or update on table "job_card_stage_events" violates foreign key
       constraint "fk_stage_events_card_scope"
```

**MEDIUM — the stage columns were unconstrained `TEXT`.** `permittedTargetsFrom`
spreads `STAGE_TRANSITIONS[resumeStage]`; one unrecognised value made that
`...undefined`, which throws — a 500 on the board for every viewer until the row
was found. Fixed twice over: migration 009 adds `CHECK` constraints mirroring
006's stage list, and the function now refuses an unknown stage (returning "no
targets") instead of crashing. Regression test added.

```
ERROR: new row ... violates check constraint "stage_events_to_stage_valid"
```

**Categories Codex explicitly cleared:** technician bypass by crafted body /
ordinary transition / `on_hold`; missing-reason overrides; the `FOR UPDATE OF j`
race; read-path leakage beyond the finding above.

## Gate 2 — Supervisor: 1 finding Codex missed

**MEDIUM — `completed → warranty_follow_up` erased the completion date.**
`closed_at` was written as `CASE WHEN $1 = 'completed' THEN now() ELSE NULL END`.
`warranty_follow_up` is the **only** stage reachable from `completed`, so the
normal next move cleared `closed_at` and returned a finished job to the open-work
set permanently. Now `completed` sets `COALESCE(closed_at, now())`,
`warranty_follow_up` preserves it, and everything else clears it — the last being
the genuine re-open, which only an authorized override can reach. Test added.

A security pass over the diff (injection, authz bypass, isolation, exposure,
tamper-resistance of the override log) produced **no findings at or above the
reporting bar**.

---

## Runtime proof — measured against the running API with real Keycloak tokens

Not inferred from the screen. `packages/auth/verify/call-api-as.mjs` was extended
with `--method`/`--body` so a **write** endpoint can be probed directly; a board
that declines to *offer* a move proves nothing (CLAUDE.md §8).

| Probe | Result |
|---|---|
| technician → `vehicle_received` | **403** `role 'technician' may not move a job card to 'vehicle_received'` |
| technician → `quality_control` (the §394 bypass) | **403** |
| technician → a card **not assigned to them** | **404** (not 403 — not an existence oracle) |
| technician → `on_hold` on their own card | **200** |
| technician → `testing` **from** `on_hold` | **403** `Permitted: complaint_received, appointment_confirmed, vehicle_received` |
| admin → illegal jump, no reason | **400** `...requires 'overrideReason'` |
| admin → same jump **with** a reason | **200**, row recorded `is_override = t` |
| repeat of the same move | **400** `already at 'ready_for_collection'` |
| `UPDATE` the override reason as `autoworkshop_app` | **permission denied** (append-only, proven by effect) |

The hold-resume refusal is the important one: it is the bypass the history table
exists to prevent — park a job at On Hold, resume it past quality control.

## Front-end defects found by running the page, not reviewing it

- **`className="sr-only"` is a trap in this repo — nothing defines that class.**
  Three hidden labels and the column counts rendered as visible body text
  ("11 job card"). Replaced with a `visuallyHidden` style now exported from
  `packages/ui` (`a11y.ts`), which also removes the inline copy `TopNav` carried.
  Re-measured: `1×1`, `clip: rect(0px, 0px, 0px, 0px)`, `position: absolute`.
- **Those absolutely-positioned labels had no positioned ancestor**, so they laid
  out against the initial containing block and stretched `<html>` to **4906px**
  against a 1280px viewport while `document.body.scrollWidth` stayed 1280 — the
  signature of an element escaping the flow rather than content being too wide.
  Fixed with `position: relative` on the column and the card. Now 1280/1280.

## Known, not introduced here

At a 768px viewport the document overflows by 51px (819 vs 768) on **every** page
measured — `/home/dashboard`, `/customers/customer-search`,
`/workshop-floor/job-cards` — as well as the new board. Pre-existing shell defect
at tablet width; logged, not fixed in this slice.

## Deliberately not built

`02.txt` §29 asks each card to show parts, payment and approval status. Those
records do not exist until Phases 6 and 7, so the board **names them as not built**
rather than rendering three empty badges that would read as "nothing outstanding"
(`05.txt` §2 forbids mock UI).

Drag-and-drop is not implemented. §29 *constrains* it ("shall not bypass business
rules"); it does not require it. A native `<select>` is keyboard- and
screen-reader-operable with no focus plumbing, and DnD can be layered later over
the same validated endpoint.
