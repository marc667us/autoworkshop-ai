# Current task

## ▶ NEXT: Slice B — supplier + admin catalogue management

Section 3 of `.claude/NEXT_SESSION_START_HERE.md`. Until it exists the marketplace
cannot grow without a developer: nothing but the seed script can publish a catalogue row.

**Run `bash scripts/start-session.sh` first.** It kills stale dev servers (`pkill` does
NOT work on Windows), proves the ports are free, checks Docker and applies pending
migrations. It deliberately starts nothing.

## Done 2026-08-01 — do not rebuild

- **Render production is BACK.** The free-tier hours reset; the Release workflow's only
  failure was Render's deploy API returning **400** on a suspended service. Re-ran the
  failed job alone — green. Live serves `/` 200, `/home/dashboard` 200 with real content,
  `/nonexistent-page` 404.
- **Role-switcher rollout COMPLETE** — both switchers extracted into one shared server
  component `packages/next-shell/src/ViewerSwitchers.tsx` and mounted in **all seven**
  apps. `workshop-web`'s inline `'use server'` closure is gone.

## Slice A (marketplace ordering) — SHIPPED 2026-07-31

Migrations 022 + 023, buyer basket/checkout/my-orders, supplier order inbox, role
switcher API + UI. See the 07-31 close block in `NEXT_SESSION_START_HERE.md`.

## Still open in Phase 5, in dependency order

Slice 7b (variation control) · slice 9 (QC — must be done by somebody who did not do the
work, `2.txt` §563) · slice 10 (vehicle release) · 11 (dashboards) · 12 (inboxes).
Then Phase 5 acceptance, `07.txt` pt2 §51-§52.

## Rules that keep applying

**A control file not updated in the SAME COMMIT as the work becomes an instruction to
redo it.** This file said "build migration 014" for five slices after 014 shipped.

**Every refusal must name a REACHABLE alternative.** The most expensive defect class here.

**Prove endpoints with real tokens and the screen with a browser**, and for any rule about
WHO, capture TWO sessions — a single-identity probe silently skips the check that matters.

**A migration already applied is CHECKSUMMED.** Fixes go in the next number.

**Definition of complete (`05.txt` §6):** migration runs · backend rule exists · API works ·
page renders with loading/empty/error/permission states · permissions enforced · tests pass ·
lint + typecheck pass · Playwright journey passes · responsive checked · docs updated ·
**no paid dependency** · committed.
