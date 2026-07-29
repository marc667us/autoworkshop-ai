# Current task

**▶ PHASE 5 slice 3 — inspection and diagnosis records.**

**Read `.claude/NEXT_SESSION_START_HERE.md` first** — start-up commands, sign-in
steps, acceptance checks, traps.

---

## Where the last session stopped

Phase 5 slice 2 is done. A job card can now **move**, and the Repair Staging
Board (`02.txt` §29) exists at both role-tree routes with the columns the spec
names, live time-in-stage, and a stalled marker.

The rule set is the deliverable, not the screen. `1.txt` §394 —*"a technician
must not manually bypass required approval, payment, parts or quality-control
states without an authorized, logged override"* — is enforced as **two
independent checks**:

1. **`ROLE_TARGET_STAGES`** — which stages a role may produce (`07.txt` pt2 §50).
2. **`STAGE_TRANSITIONS`** — where a card may go from where it is.

An override relaxes (2) and **never** (1), requires a reason, and is written to
the append-only `repair.job_card_stage_events`.

## The gap to close next

A card can move through the lifecycle but **records nothing about the work**.
`initial_inspection` and `diagnosis_in_progress` are stages with no content
behind them — no findings, no fault codes, no evidence.

`1.txt` §322-§360 and `07.txt` pt2 §50 give the technician "assigned-job
inspection, diagnosis". That is slice 3: inspection and diagnosis records
attached to a job card, written by the assigned technician only.

## Rules that keep applying

**Prove endpoints with `packages/auth/verify/call-api-as.mjs`, not with the
screen.** It now takes `--method` and `--body`, so writes can be probed too. A
board that declines to *offer* a move proves nothing about what the API accepts.

**Seed both sides of every boundary.** A screen showing one tenant's data proves
nothing unless another tenant's data exists to be excluded.

**Real relationships** — FKs, joins, normalised. And the qualifier that keeps
being earned: a foreign key cannot carry a tenant predicate. Where it must,
make it **composite** — migration 009 does exactly that.

## Definition of complete (`05.txt` §6)

Migration runs · backend rule exists · API works · page renders with
loading/empty/error/permission states · permissions enforced · tests pass ·
lint + typecheck pass · Playwright journey passes · responsive checked · docs
updated · **no paid dependency** · committed.
