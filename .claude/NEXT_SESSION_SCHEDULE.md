# Next session — start here

**Updated 2026-08-09 (pt3). Tip `d6b643d` on `master` — PUSHED AND DEPLOYED.**
Working tree clean.

▶ **FIRST TWO COMMANDS:**
```bash
bash scripts/start-session.sh          # kills stale servers, applies local migrations
bash scripts/record-live-state.sh      # photographs what is actually deployed
```

Owner policy: five slices + issue resolution every session. Never the scheduler.
**Codex and the Supervisor only — no Stitch, no Google ADK.**

---

# ═══ ✅ DEPLOYED 2026-08-09 18:38–18:50 UTC — `aaa15d4` → `d6b643d` ═══

The five stranded commits are on production. The pass, in order, and what each
one actually proved:

| Step | Run | Result |
|---|---|---|
| `git push origin master` | — | `aaa15d4..d6b643d` |
| Release (auto, on push) | `31329537341` | success — apex rebuilt |
| `apply-migrations -f confirm=APPLY` | `31329576051` | **3 applied, 71 skipped, 74 in repo** — 073, 074, 075 |
| Apply-migrations re-check (auto, post-Release) | `31329738077` | success — **PENDING 0** |
| `deploy-api -f confirm=APPLY` | `31329772251` | success — image built, pushed, Render deploy waited for and read back |
| Live suite | `31329916776` | **25 passed / 0 failed / 0 skipped** |

⚠️ The first Live suite (`31329738097`, auto-chained off Release) failed 2 —
customer-web 502. That was a **free-tier cold start**, not a defect: the same two
checks passed on the very next run four minutes later. Do not chase it.

**Verified by hand afterwards, because the live suite does not cover today's
work at all** — it has no towing and no fleet checks:

- All **8 towing route families answer 401** on `/api/v1/towing/*` (dashboard,
  requests, recoveries, drivers, vehicles, incidents, invoices, settings) —
  deployed and gated, not 404.
- ⚠️ **The API has a global prefix `api/v1`** (`apps/api/src/main.ts:10`). A probe
  without it returns 404 on every route and looks exactly like "not deployed".
  One route also returned curl `000` once and 401 on three retries — a transport
  failure is not an authorization fact.
- The **`unnamed` alert fix (075) is applied but not exercised** — proving it
  needs a real registration on live, which has not been run.

**Still-open live gaps this pass did NOT close** — see the section below.

---

# ═══ WHAT SHIPPED (now on production) ═══

| Commit | |
|---|---|
| `9a03e45` | 18 organisation-scoped foreign keys — migration 073 |
| `d79d07f` | Towing: 7 tables, 14 routes, 10 screens — migration 074 |
| `7cefd88` | Fleet registration door + a live "unnamed" defect — migration 075 |
| `ef82dce` | ADR-020 — how a fleet sees workshop data |

**Coverage moved 255 → 265 of 380 distinct screens (67% → 70%).**

## 🔴 The coverage audit had been measuring two apps out of seven

The owner said functionality was missing while `audit-menu-coverage.mjs` printed
`0 dead ends`. Both were true: it measured six role trees across workshop-web
and customer-web only, and `COMPLETION_PLAN.md` says the other five apps are
"out of scope for this plan". It now measures **11 trees across all 7 apps** and
prints a deduped headline. **113 dead ends remain.**

| App | Working |
|---|---|
| workshop-web | 213 · customer-web 40 · **towing-web 10/10 (NEW)** |
| supplier-web | **4 of 39** |
| admin-web | **5 of 26** |
| fleet-web | **0 of 29** |
| insurance-web | **0 of 28** |

---

# ═══ ▶ NEXT: FLEET, AND BOTH BLOCKERS ARE ALREADY CLEARED ═══

Build order is settled. Do NOT re-derive it.

1. **Fleet domain schema** — vehicles, drivers, maintenance plans, downtime,
   cost centres, approval limits, service policies. Org-scoped to the
   `fleet_operator` org, composite keys from the first line (copy 074's shape).
2. **Fleet API** — including the membership aggregation ADR-020 describes.
3. **The 29 screens.**

**Blocker 1, CLEARED by 075:** nothing could create a `fleet_administrator` at
all. `identity.register_fleet` is the missing door.

**Blocker 2, CLEARED by ADR-020:** a third of the 29 screens are rows in the
WORKSHOP's organisation. Owner chose the membership route — the fleet's user
holds an ordinary `customer` membership at each workshop, resolved by
`memberships_for_subject`, and the API reuses `SelfServiceService` with a
`TenantContext` per workshop. **No policy is widened.** Proven, not inferred:
one account held **2 active memberships** and the lookup saw both.

⚠️ ADR-020's consequence for the build: an empty Repairs screen must say *"you
have not added a workshop yet"* and link to enrolment — never render blank.

---

# ═══ 🔴 DEFECTS FOUND TODAY THAT ARE STILL LIVE ON PRODUCTION ═══

**Every registration admin alert says "unnamed".** Since migration 070, for
WORKSHOP and SUPPLIER registrations too — not just fleet. The trigger reads the
organisation name before opening any door; `identity.organizations` has only
`tenant_isolation` (no tenant context during registration), an INSERT-only
bootstrap policy, and `enrolment_bootstrap_select` gated on `app.bootstrap_org`,
**which no registration function ever set**. Invisible locally because the
definer's owner is a superuser. **Fixed in 075 — but not deployed.**

**14 two-column `(x, tenant_id)` foreign keys remain**, each with the same
cross-organisation hole 073 closed for eighteen others. `fk_line_invoice_scope`,
`fk_claim_policy_scope` and twelve more, all named in
`docs/05-database/RELATIONSHIPS.md` §8. That is a migration of its own.
(Two more are correctly 2-column — their parent IS `identity.organizations`.)

---

# ═══ LESSONS THIS SESSION ADDED ═══

1. 🔴 **RLS ANSWERS REACHABILITY FOR READS, NOT REFERENCES.** RI checks bypass
   RLS even under FORCE. Measured: org A could not read org B's job card
   (0 rows) and could still write a warranty citing it (`INSERT 0 1`).
2. 🔴 **A COMPOSITE `ON DELETE SET NULL` NULLS EVERY KEY COLUMN**, including
   NOT NULL `tenant_id`. Name the column: `SET NULL (job_card_id)` (PG15+).
3. 🔴 **`NO ACTION`, NOT `RESTRICT`,** when the child is also org-CASCADEd —
   RESTRICT is checked immediately and offboarding an organisation can abort on
   trigger firing order.
4. 🔴 **A MIGRATION'S OWN ORPHAN CHECK WAS INERT UNDER FORCE RLS.** 6 rows as
   owner, 0 as the Render role. Set `app.current_role='admin'` **and assert the
   escape is live** rather than assuming it.
5. 🟢 **RLS IS TESTABLE LOCALLY: `SET ROLE autoworkshop_app`** (NOBYPASSRLS =
   Render's shape). verify/074 does it. **Stop writing "only meaningful under
   rehearsal".**
6. 🔴 **MY OWN DETECTOR WAS WRONG TWICE BEFORE THE BUG WAS REAL** — wrong
   `event_key`, then wrong `resource_id`; both reported "no admin alert"
   against an alert that fired. Use a **before/after delta**, never a guessed
   column filter.
7. 🔴 **THIRD ROLE THAT COULD NOT EXIST** (`customer` → `supplier_owner` →
   `fleet_administrator`). **Ask it of every role before building its screens.**
8. 🔴 **`pnpm typecheck | tail` REPORTED EXIT 0 WHILE TYPECHECK FAILED** —
   fourth instance. Capture `$?` separately.

---

# ═══ GATES AT CLOSE (all local) ═══

migrations **75/75** · verify/073 **8/8** · verify/074 **7/7** · verify/075
**5/5** · rehearse/075 green under NOBYPASSRLS · API **924 passed / 0 failed /
1 skipped** · lint **16/16** · typecheck **17/17** · nav coverage **0 gaps** ·
towing-web builds all 10 routes · API boots, all towing routes **401 not 404**.

**Nothing has been run against production this session.** The last live
measurement was at 12:50 UTC: five services up, 18 parts, 1 mechanic, all three
owner buttons present.

---

# ═══ 🔴 NEW GAPS FOUND WHILE VERIFYING THE DEPLOY ═══

**C1 — towing-web has NO deploy path at all.** Ten screens exist in the repo and
**no user can reach any of them.** There is no `deploy-towing-web.yml` and no
`autoworkshop-towing` Render service; the only deploy workflows name
`autoworkshop-{web,api,customer-web,supplier-web,keycloak,postgres}`. The API
behind those screens IS live. **Provisioning a sixth Render service is an owner
decision** — A4 already flags that a fifth service shares the free instance-hour
pool. Ask before provisioning.

**C2 — `POST /api/v1/registration/fleet` returns 404.** Migration 075 created
`identity.register_fleet` in the database, but no controller calls it —
`apps/api/src/identity/registration.controller.ts` has `workshop`, `supplier`
and `customer` only. The door exists in the schema and nothing opens it. This is
the *inverse* of "a route with no caller": a **caller with no route**. It is
step 2 of the fleet build below, not a regression — but until it lands, a
`fleet_administrator` still cannot be created through the product.

---

# ═══ STILL OPEN FROM 08-09 pt1 (unchanged) ═══

- **A1** `LIVE_OWNER_EMAIL` / `LIVE_OWNER_PASSWORD` unset → the signed-in half
  of the live suite SKIPS 4. **Owner-only.**
- **A2** Nobody has driven the supplier funnel end to end on live as a human.
- **A3** "Add new" on 2 of ~40 list screens. (Towing's 10 all have one.)
- **A4** A fifth Render service shares the free instance-hour pool.
- **B** MX record still blocks all email.
