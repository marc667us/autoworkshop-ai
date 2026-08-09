# Next session — start here

**Rewritten 2026-08-09 (pt2) at session close. Tip `ef82dce` on `master`.**
Working tree clean. **4 commits, NONE PUSHED.**

▶ **FIRST TWO COMMANDS:**
```bash
bash scripts/start-session.sh          # kills stale servers, applies local migrations
bash scripts/record-live-state.sh      # photographs what is actually deployed
```

Owner policy: five slices + issue resolution every session. Never the scheduler.
**Codex and the Supervisor only — no Stitch, no Google ADK.**

---

# ═══ 🔴 READ THIS FIRST: NOTHING FROM TODAY IS ON PRODUCTION ═══

Four commits are local. Production is still `aaa15d4`, which is healthy and
unchanged — today's work has not touched it.

```bash
git push origin master                                  # triggers Release → apex
gh workflow run apply-migrations.yml  -f confirm=APPLY   # migrations 073, 074, 075
gh workflow run deploy-api.yml        -f confirm=APPLY   # the towing routes
gh workflow run live-suite.yml                           # THEN this. ALWAYS.
```

⚠️ Push and migrate in **one deliberate pass**. Pushing alone deploys the apex
and the API against a schema that does not yet have 073/074/075 — the
"migrations applied ≠ feature live" trap in its other direction.

---

# ═══ WHAT SHIPPED (local only) ═══

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

# ═══ STILL OPEN FROM 08-09 pt1 (unchanged) ═══

- **A1** `LIVE_OWNER_EMAIL` / `LIVE_OWNER_PASSWORD` unset → the signed-in half
  of the live suite SKIPS 4. **Owner-only.**
- **A2** Nobody has driven the supplier funnel end to end on live as a human.
- **A3** "Add new" on 2 of ~40 list screens. (Towing's 10 all have one.)
- **A4** A fifth Render service shares the free instance-hour pool.
- **B** MX record still blocks all email.
