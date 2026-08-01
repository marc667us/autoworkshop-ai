# Current task

## ▶ NEXT: Slice C — mechanic directory opt-in screen · SMALL

Section 3 of `.claude/NEXT_SESSION_START_HERE.md`. A workshop needs a settings
screen to publish/withdraw its directory listing and edit the consented fields.
Keep it a COPY, never a view over `core.organization_profile` — the header of
migration 021 explains why that boundary matters.

Then Slice D (deferred items): slice 7b variation control · slice 9 QC · MinIO
evidence upload · `organization_pricing` screen · repo-wide RLS org-scoping.

## Slice B — COMPLETE 2026-08-01 (schema + API + screens)

**A part can now reach the public marketplace without a developer.** Proven end
to end: supplier adds a draft on screen -> it appears in the admin queue ->
admin publishes -> an anonymous buyer sees it on `/api/v1/public/parts`.

- API: `apps/api/src/catalogue/` — supplier routes on `UserGuard` + `withUser`,
  admin routes on `TenantGuard` + `withTenant`.
  ⚠️ **The guard choice is load-bearing, not stylistic.** `withTenant` is the
  ONLY path that sets `app.current_role`. An admin route on `UserGuard` would
  return 200 and change nothing — migration 025's defect, one layer up.
- Screens: supplier `/products/product-catalogue`, admin
  `/catalogue-and-content/products`. Neither needed a navigation change; the
  approved trees already carried both routes.
- Proofs: `packages/auth/verify/probe-catalogue.mjs` **33/33** ·
  `apps/e2e/verify/verify-catalogue-screens.mjs` **14/14**.

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
