# Current task

## ▶ NEXT: Slice B — the API layer and the screens

**The SCHEMA half is done and committed** (migrations 024, 025, 026 — see below).
What remains is everything above the database:

1. `apps/api/src/catalogue/` — a supplier-catalogue module on `UserGuard` +
   `withUser` (copy `apps/api/src/marketplace/`, which is the worked example of a
   NOT-tenant-scoped module). Endpoints: apply to list a supplier · my suppliers ·
   part CRUD · fitment CRUD · admin publish/unpublish/verify.
   ⚠️ The admin routes must set `app.current_role`; they work at the database
   level now, but only because 025 taught the policies the app's role name.
2. `apps/supplier-web` — a catalogue screen. The app has exactly ONE real screen
   today (`/orders-and-delivery/new-orders`); everything else is the placeholder.
3. `apps/admin-web` — the publish queue: applications and draft parts awaiting a
   decision, with approve/withdraw.
4. ⚠️ **A supplier cannot edit fitments on a PUBLISHED part** (026). The screen
   must say so and offer the reachable path — request withdrawal — or the rule
   becomes a wall. `verify/026` check 6 walks that path; the UI has to expose it.

**Run `bash scripts/start-session.sh` first.** It kills stale dev servers (`pkill` does
NOT work on Windows), proves the ports are free, checks Docker and applies pending
migrations. It deliberately starts nothing.

## Slice B schema — SHIPPED 2026-08-01, do not rebuild

- **024** — a supplier may write its own catalogue but NOT publish it. Policies
  key on `catalogue.current_user_supplies`; the column rules are triggers,
  because RLS selects rows and not columns. Applying to list a supplier is just
  an unpublished `catalogue.suppliers` row — approval IS publication, so there is
  no `supplier_applications` table. `created_by` exists for a SECURITY reason:
  without it, "you may own a supplier that has no members yet" would let any
  signed-in stranger claim an administrator-seeded supplier.
- **025** — 🔴 **every admin policy in 021–024 was UNREACHABLE from the app.**
  All 21 predicates tested `current_role_name() = 'admin'`; the app sets
  `platform_administrator` from the membership row. Nine policies and three
  triggers were inert and the failure mode was `UPDATE 0` — no error. An admin
  publish endpoint would have returned 200 and changed nothing.
- **026** — 🔴 a supplier could publish new PUBLIC fitment claims on its own
  already-published part; fitments inherit visibility from the part and 024 put
  no guard on them. Found by Codex, reproduced before fixing. Worst field for it
  to happen in: a fitment is "this part fits that car".

**72 verify checks across six scripts, zero failures.** Re-run any with:
`docker exec -i aw-postgres psql -U autoworkshop -d autoworkshop -v ON_ERROR_STOP=1 -f - < infrastructure/migrations/verify/NNN_*.sql`

⚠️ **Migrations 008–026 are LOCAL ONLY.**

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
