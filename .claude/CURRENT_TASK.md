# Current task

## ▶ NEXT: Slice D — remaining items

Slice 7b variation control · slice 9 QC (must be done by somebody who did not do
the work, `2.txt` §563) · MinIO evidence upload (**now unblocked** — MinIO was
unreachable from the host until `d9845c3`) · repo-wide RLS org-scoping
(outstanding issue 8).

⚠️ **Org-scoping now has a starting point.** Migration 027 introduced
`identity.current_organization_id()` for ONE table. The repo-wide change is
still open and still needs a plan before code — but the helper and its failure
modes are now proven: unset GUC returns NULL and matches nothing, a non-uuid
value RAISES rather than matching. Both fail closed.

## 🔴 OWNER DECISION NEEDED — pricing is invisible to the seeded owner identity

`pricing-rules` exists ONLY in the §46 owner tree
(`packages/navigation/src/workspaces.ts`). The §34 default tree's Settings group
has no pricing entry, and `WORKSHOP_ROLE_TREES` maps only `owner` to the tree
that has one.

**Measured consequence.** `owner@autoworkshop.local` holds THREE active
memberships — `platform_administrator`, `workshop_owner`, `technician` — and
`resolveTenantContext` defaults to the strongest by ROLE_PRECEDENCE, which is
`platform_administrator`. `navRoleFor` returns undefined for that, resolving to
the DEFAULT tree. **So the person most likely to set the labour rate opens the
app, finds no Pricing anywhere, and concludes the feature does not exist.** They
must switch role to `workshop_owner` first. `verify-pricing-screen.mjs` does
exactly that and records why.

Three options, none taken unilaterally because each is a change to APPROVED
navigation and `05.txt` §2 prohibits that without review:

1. Add `pricing` to the §34 default tree's Settings group (mirrors Slice C's
   two-route shape for Workshop Profile).
2. Leave it — owners use the role switcher, which now works.
3. Reconsider ROLE_PRECEDENCE so `workshop_owner` outranks
   `platform_administrator` for a user holding both. ⚠️ Wider blast radius: it
   changes the default role for every multi-role account, not just this screen.

## Slice D — pricing screen COMPLETE 2026-08-01 (`organization_pricing`)

`PricingController` + `PricingService` + `/workshop-management/pricing-rules`.
The screen migration 029's header said this slice would add.

- 🔴 **The point of the screen is the ZERO.** With no pricing row,
  `quotation.service.ts` falls back to `PRICING_DEFAULTS`, whose labour rate is
  **0** — so a workshop that never opened this page quoted labour at nothing on
  every job, silently. The screen renders a warning banner over the fallbacks
  rather than an empty state, because "empty" would imply nothing is happening.
- **Reads tenant-wide, writes owner-only**, which is 029's split, not this
  slice's: quotations are prepared by reception, managers and technicians, so
  narrowing the READ would break quotation preparation for everybody.
- ⚠️ **`Number('') === 0`.** A cleared field must never become a zero rate. The
  server action sends every numeric field as a RAW STRING (no `Number(...)`),
  and `requiredNumber` rejects the empty string before parsing.
- **`apiPut` added to `packages/next-shell`** — the pricing row is read as a UNIT
  by quotation building, so a partial write would leave a workshop quoting a new
  labour rate against an old tax rate.
- Proof: `pricing.spec.ts` **17/17** · `verify-pricing-screen.mjs` **17/17**,
  driving an owner AND a technician, and READING THE RATE BACK after a reload
  (a refused write matches zero rows and raises nothing, so "Saved" is not
  evidence).
- **Codex found 2, both fixed:** `parsePricingInput` threw on the FIRST bad field
  while its docstring promised whole-object validation — the repo's most-repeated
  defect, a comment claiming a rule that does not exist. Behaviour was fixed to
  match the promise (all problems reported at once). The spec's "every message"
  test covered 5 of 13 paths; now covers all 13.

## Slice C — COMPLETE 2026-08-01 (mechanic directory opt-in)

Migration **027** + `DirectoryController` + a settings screen at BOTH routes.
A workshop can now list itself publicly, and take itself back off.

- **The workshop publishes ITSELF here**, unlike parts. A directory entry is the
  workshop's own consented description of itself; requiring an administrator to
  approve "we are here, this is our phone number" would make the directory
  unfillable. `admin_write` still lets an administrator withdraw abuse.
- **Saving and publishing are separate actions.** `is_published` is absent from
  the save statement entirely, so editing a live listing cannot withdraw it by
  accident and editing a draft cannot expose it.
- ⚠️ **TWO ROUTES, BOTH REQUIRED.** §46's owner tree carries Workshop Profile
  under `/workshop-management/`; the §34 default tree under `/settings/`.
  `platform_administrator` may edit AND resolves to the DEFAULT tree, so
  building only the owner's path left the administrator on a blank page.
  Slice 4 wrote this trap down and it still caught me.
- 🔴 **028 — a comment described a rule the database did not implement.**
  `directory.service.ts` said the listing was readable by any member; 027's
  single `FOR ALL` policy restricted it to the owner. A manager or technician
  saw "Not listed" above a pre-filled form for a listing that existed. Found by
  Codex, reproduced (owner 1 row, manager 0, technician 0), fixed by adding
  `member_read_own` — the comment was right, the policy was wrong. **Second
  comment-claims-a-rule-that-does-not-exist defect in two days.**
- Proof: `verify/027` **12/12** · `verify/028` **6/6** ·
  `apps/e2e/verify/verify-directory-optin.mjs` **14/14**, driving an owner and a
  technician.

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
