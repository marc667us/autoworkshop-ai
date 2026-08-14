# Next session — start here

**Written at the close of 2026-08-14. Tip is the commit after `717b830`,
tree clean, all pushed. 24 commits.**

```bash
bash scripts/start-session.sh        # ALWAYS first
```

---

## ▶ THE STATE, MEASURED AT CLOSE

| | |
|---|---|
| Migrations in repo / applied on PRODUCTION | **80 / 80 — in sync, PENDING 0** |
| `apply-migrations` | green again (081 reverted, 082 deployed) |
| **Live suite** | **70 passed / 0 failed / 1 skipped** (anon 66/0/1 + signed-in 4/0/0) |
| Screen coverage | **272 of 384 (71%)** — re-measurable again |
| Production backup | ✅ verified, 114/114 tables |
| UAT population | ✅ live, tagged `UAT-2026-08-14` |

**Deployed today:** migration 082 · API (insurance + admin verification) ·
web (four insurance screens + the sales nav group). `GET /public/insurance-products`
answers 200 on production.

---

## ▶ WHAT IS NOT FINISHED, IN ORDER

### 0. ✅ DONE — 083 and 084 are applied; the marketplace is live

Confirmed on production at the close of 2026-08-14:

```
apply 084_insurance_public_insurer_name
==> done: 1 applied, 81 skipped

GET /api/v1/public/insurance-products  ->  200
LIVE insurance products: 1
  -> UAT Assurance UAT-2026-08-14 | Comprehensive 12-month | GHS 1200.00 | 12 months
```

**The loop is closed end to end on live**: an insurer registered, the platform
verified it, the insurer listed it, it sold, the levy accrued by itself, and a
shopper can see it.

🔴 **KEEP THE THREE LESSONS — they cost most of the day and they will recur.**

1. **A permissive RLS policy on the table you are reading is not enough.** It
   must hold for EVERY table the query touches. `public_products()` joined
   `identity.organizations`, and the join returned FEWER ROWS rather than
   failing — an empty list behind a `200`, not an error. 083 fixed the products
   table and the listing was still empty; 084 removed the join.
2. **LOCAL IS SUPERUSER AND RENDER IS NOT.** Three separate green-local /
   red-production failures in one day: the backup's `pg_dump` refused by FORCE
   RLS, the public listing's join, and **084's own backfill** — the migration
   written to fix an RLS-join bug contained the same bug. Any migration or query
   reading a FORCE-RLS table with no tenant context needs
   `set_config('app.current_role','admin',true)`, and local will never tell you.
3. **Pushing triggers `apply-migrations` as a DRY RUN** via `workflow_run`.
   Twice I read that run's "success" and believed a migration had applied when
   it had not. **Capture your own dispatch's run id and watch that id** —
   `gh run list ... --json databaseId,event` distinguishes them.

---

### 1. The customer cannot BUY yet — the marketplace is half a marketplace

`GET /public/insurance-products` is live and anonymous, and **no screen renders
it**. A shopper cannot see what insurers are selling. That is the half that
makes this a marketplace rather than an insurer's private admin tool, and it is
the single highest-value thing left.

There is also no purchase flow: `POST /insurance/policies` is the INSURER
recording a sale. Nothing lets a customer initiate one. Decide whether buying
is self-service or an insurer-recorded act — the API currently assumes the
latter.

### 2. No admin SCREEN for verification

`PATCH /admin/insurance/products/:id/verification` and
`GET /admin/insurance/review-queue` exist and are gated, and the admin pack has
no screen for either. **Until one exists, no insurance product can ever be
listed** — an administrator would have to call the API by hand. The parts
equivalent lives under `admin/catalogue`; mirror it.

### 3. Separation of duties inside an insurer does not exist

`insurance_assessor` is the only insurance role, so whoever assesses claims can
also register products and record sales. `USER_ROLES.md` names Claims Approver;
the code has no such role. Recorded in `insurance-roles.ts`.

### 4. `register_workshop` drift — unchanged from this morning

`docs/05-database/DRIFT_2026-08-14_register_workshop.md`. Production's function
writes `mechanic_directory`; the repository's does not; checksums identical. The
other four registration functions are **unexamined, not innocent**.
`gh workflow run diagnose-directory-drift.yml` re-runs the evidence, read-only.

### 5. The backup has nowhere permanent to go

Verified and working, but the artifact expires in 90 days and **the database
expires 2026-09-01**. Plan D6 names **Neon free**; the account is an owner
action. **Never propose spending.**

⚠️ **RESTORING NEEDS `uuid-ossp`, `pg_trgm`, `btree_gist` CREATED FIRST.**
`pg_dump --schema=` does not dump extensions; without them only 21 of 114
tables restore.

### 6. ✅ DONE — the insurance UAT case ran on production

Ran on PRODUCTION at the close of 2026-08-14. The gate held there:
**"unverified listing correctly REFUSED"**, then a sale accrued
**GHS 120.00 at 10%** with no application code computing it. 24 of 24 UAT
measures now match, and `uat_verify.sql`'s "NO PRODUCTION PATH" row is
replaced by four real ones.

What remains of it is only the shopper's view — see task 0 and task 1.
The original steps, for reference:

1. Register an insurance company (`POST /registration/insurance`) tagged
   `UAT-2026-08-14`, so it sits with the rest of the UAT population.
2. Register a product through the screen.
3. Verify it as a platform administrator.
4. List it, and confirm it appears in `GET /public/insurance-products` on LIVE.
5. Record a sale and **confirm the levy accrued by itself** — that is the
   owner's actual requirement ("pays platform levy for selling on the
   platform"), and `verify/082` proves it locally but nothing has proved it on
   production.
6. Add the row to `infrastructure/seed/uat_verify.sql`, replacing the
   "NO PRODUCTION PATH" line with a real count.

⚠️ **DO NOT RUN TWO FIREWALL-OPENING WORKFLOWS AT ONCE.** Each restores the
ORIGINAL allow-list on teardown and deletes a concurrent run's entry — that is
what produced five identical "SSL connection has been closed unexpectedly"
failures today, and it is not the database.

---

## What shipped on 2026-08-14

1. **`/onboarding`** — signing up assigned no role and the front door could not
   see it. Four self-service doors, features read live from the navigation model.
2. **Migration 080** — `insurance_assessor` and `towing_operator` could not
   exist; both doors now open, plus a silent `ELSE` that told insurers they
   would be published to the *mechanic directory*.
3. **A 404 on the owner's own dashboard.** `/` dispatched to
   `/{pack}/home/dashboard`; **towing and admin do not serve that path**, so a
   platform administrator had been 404'd since the 08-13 consolidation.
   `landingPathFor()` asks the navigation model instead.
4. **Role ↔ organisation fit** — `grant()` never checked that a role suited the
   organisation. `parts_supplier | reception_staff` existed in the dev database.
5. **The UAT population** — 10 customers, 5 technicians, 10 full repair
   journeys, 10 paid invoices, 20 fleet vehicles, procurement and stock ledger.
6. **The production backup, working for the first time.**
7. **Migrations 081/082 + the insurance API.**

8. **The production backup, verified 114/114 — the first this project has had.**
9. **Migration 082 + the insurance marketplace**: products, policies, an
   append-only platform levy computed by a TRIGGER, admin verification, four
   screens and a public listing.
10. **081 reverted** — built for a shape the owner then clarified away.
11. **`audit-menu-coverage.mjs` fixed** — it had been scanning directories
    ADR-021 deleted, so the coverage figure everyone quoted was a stale reading
    from a dead instrument.

## 🔴 MY ERRORS TODAY — the part worth reading

- **I edited migration 080 AFTER it was applied.** Comment-only, but that is a
  judgement the checksum guard cannot make, which is why the rule has no
  exception. Repaired by re-executing, not by editing a checksum.
- **The API could not boot** — `InsuranceModule` imported `AuthModule` when
  `TenantGuard` needs `MembershipRepository` from `IdentityModule`. tsc, eslint,
  954 tests and a clean `nest build` were all green over it. **Second time this
  exact failure has been recorded.** Only starting the server found it.
- **My RLS policies were tenant-scoped only**, which the organisation-isolation
  suite caught — one root cause, seven failures across three suites.
- **I nearly overrode a deliberate decision.** I began adding `POST /leads`;
  the controller header says its absence is deliberate, citing Ghana's Data
  Protection Act 2012. Reverted. **Read the comment before filling the gap.**
- **I guessed four schema details** the database then refused: `o_`-prefixed
  columns on `register_workshop`, `tenant_id` on `mechanic_directory`, a
  `quantity` column on `stock_items`, `current_organization_ids()`.
- **A stale server nearly fooled me.** The first probe of the admin routes hit
  a leftover process — the log showed EADDRINUSE and the results meant nothing.
  Killed the port, PROVED it empty, restarted. Read the log before the result.
- **I enumerated a navigation tree from memory and was wrong** — `settings` is
  a multi-line `group(` call a single-line grep cannot see.
