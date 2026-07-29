# Current task

**▶ PHASE 5 slice 2 — Repair Staging Board + stage transitions.**

**Read `.claude/NEXT_SESSION_START_HERE.md` first** — start-up commands, sign-in
steps, acceptance checks, traps.

Tip `e4efc81` on `master`, pushed, tree clean.

---

## Where the last session stopped

Phase 4 is largely built and Phase 5 has begun. Nine commits. The product now
has, all reading and writing real data and each proven by signing in and looking:

- customers and vehicles (list, detail, register) at every role tree's path
- the customer's garage, Add Vehicle, dashboard, and Report a Problem
- an organisation switcher in the top bar
- **job cards** - opened by reception or by a customer's complaint

## The gap to close

**A job card can be opened but cannot leave `complaint_received`.**

`02.txt` §29 gives the staging board's columns and they are already the CHECK
constraint on `repair.job_cards.stage`. Migration 007 added `stage_changed_at`
so the board can show how long a card has sat in a stage - the question a
manager actually asks looking at it.

Needs `PATCH /job-cards/:id/stage` with a role→allowed-stage matrix grounded in
`07.txt` pt2 §50: a technician may reach inspection / diagnosis / testing, but
not quality control or release.

## Rules that keep applying

**Real relationships** - FKs, joins, normalised. And the qualifier: a foreign key
cannot carry a tenant predicate. Relationships give integrity, RLS gives
isolation, both required.

**A page gate is not a control.** Prove every new endpoint with
`packages/auth/verify/call-api-as.mjs`, not by looking at the screen. That is how
the worst defect of the last session was found - the page 404'd a technician
while the API handed the same technician the entire customer book.

**Seed both sides of every boundary.** A screen showing only one tenant's data
proves nothing unless another tenant's data exists to be excluded.

## Definition of complete (`05.txt` §6)

Migration runs · backend rule exists · API works · page renders with
loading/empty/error/permission states · permissions enforced · tests pass ·
lint + typecheck pass · Playwright journey passes · responsive checked · docs
updated · **no paid dependency** · committed.
