# Commencement task — the next session

**Written 2026-08-07 at session close. Git tip `db5e525` on `master`, pushed,
tree clean. PRODUCTION == BUILD. Release / CI green. No dev servers running.**

Read `.claude/CURRENT_TASK.md` first, then this.

## 🔴 THE POLICY THIS SCHEDULE SERVES

Owner: **five slices plus issue resolution every session. Never use the
scheduler — the owner runs their own.** This document IS the schedule.

**Run LIST A first, in order. Then LIST B.** List B is deliberately second: it
is feature work, and List A contains a live authorization gap and two
verification holes that should not sit behind new features.

---

# WHERE THE PRODUCT IS

**215 of 242 working** — workshop-web 191, customer-web 24.
**27 routes remain signposted: 13 workshop (all technician §49), 14 customer.**

| Tree | Working | % |
|---|---|---|
| Manager §47 | 36/36 | **100%** |
| Owner §46 | 63/64 | 98% |
| Default §34 | 55/56 | 98% |
| Reception §48 | 28/29 | 97% |
| Technician §49 | 28/42 | **67%** |
| Customer §33 | 21/35 | **60%** |

⚠️ **RE-MEASURE BEFORE STARTING ANYTHING.** `node scripts/audit-menu-coverage.mjs`
is the authority. Every slice size in `COMPLETION_PLAN.md` has been wrong every
time it has been checked — the plan projected 242 after slice 11 and it landed
at 208 before re-mounts.

---

# ═══ LIST A — DO THIS FIRST ═══

Ranked by risk × cost. A1–A3 are the ones that should not wait.

### 🔴 A1. A customer cannot see their OWN invoices, payments or warranty
**This is the direct consequence of a security fix and is the highest-value item
in either list.**

On 2026-08-07 eleven read methods were found ungated: a signed-in CUSTOMER could
read the whole workshop's invoice book, payment record, stock, supplier orders
and warranty decisions. That is now closed (`authz/workshop-roles.ts`).

Closing the hole did **not** open the legitimate door. A customer still has no
way to see their own records, and four of the fourteen customer signposts
(`/payments/quotations|invoices|payments|receipts`) plus two warranty ones are
exactly that.

**Do:** add customer-scoped reads carrying a session-derived customer predicate —
`SelfServiceService.resolveCustomer` is the working pattern, and it already
refuses an explicit id from a customer. Then build the six screens.
**Never** relax `assertWorkshopStaff` to achieve it.

> **Check:** sign in as a customer and see only their own invoices; sign in as a
> second customer in the same organisation and see none of the first's.

### 🔴 A2. A platform administrator with no membership cannot use the app AT ALL
Reported 2026-08-07: `admin@` on production got *"your session has ended, you
were logged out"* on every screen. **The owner worked fine.**

Cause: `resolveTenantContext` requires an ACTIVE MEMBERSHIP, full stop. The
owner holds `workshop_owner`; `admin@` held none, so `TenantResolutionError` →
401 → and the product called a perfectly good session dead. `/me` itself uses
`TenantGuard`, so the whole shell read as signed out.

**The message is fixed and deployed** (`noMembership` is now distinct from
`unauthenticated`, names the real remedy, and deliberately offers NO sign-in
link — offering one is what created the loop).

**The DESIGN QUESTION is not fixed, deliberately.** `identity.is_platform_admin()`
is an escape hatch in every RLS policy in the schema, and the permission matrix
carries `platform_administrator` — yet a platform admin holding no per-org
membership cannot resolve a tenant context and so cannot use the application.
Either:
  · platform admins bypass membership in `resolveTenantContext` (a real
    authorization change — it would let one account reach every tenant, so it
    needs an explicit decision and a negative test), **or**
  · they are simply expected to hold a membership like anyone else, in which
    case the onboarding path must SAY so instead of leaving a signed-in account
    with nowhere to go.

**Immediate workaround that works today:** owner → `/workshop-management/staff`
→ add by email + role. Verified on production (200, email field, role field).
The account must have signed up first.

### 🔴 A3. Prove the staff gate from the OUTSIDE, as a customer
`workshop-roles.spec.ts` tests the predicate. Nothing yet drives the real API
with a customer bearer token against `/invoices`, `/stock`, `/purchase-orders`.

**This matters because the fix was reasoned, not exercised.** The live suites
drive staff paths only, so a workshop screen quietly relying on a customer-role
session would now refuse and nothing would have caught it. I found no such
caller; that is not the same as proving there is none.

### 🔴 A4. A6 — the systematic tenant-isolation suite (T-0006)
Each of migrations 045–052 carries its own org-isolation checks, but there is no
single suite over the whole schema. Five schemas landed in one session; the next
five will land the same way.

> **Build it to FAIL first** — inject a tenant-wide policy and watch it catch
> that, the way verify/045 was proven.

### A5. Audit every other service for the SAME ungated-read pattern
Three instances found in two passes: settings, knowledge, then finance/warranty/
parts. `repair/`, `reception/`, `operations/`, `catalogue/`, `identity/` and
`media/` have **not** been swept. Ask of every `list*`/`get*`: *who may call
this?*

### A6. The `security-posture.integration.spec.ts` flake
Failed once during a full `pnpm test`, passed on three subsequent runs including
the identical command. Nothing was changed, so nothing is claimed fixed. Run the
full suite a few times; if it recurs, it is real.

### A7. `RENDER_API_KEY` — owner only
Leaked in a transcript 2026-07-27, still unrotated. Treat as compromised.

### A8. Two deliberate honesty debts
Approval limits, workflow rules and procedure certification requirements all
render **"recorded, not enforced"**. That is honest, not finished. Wiring any of
them into the path that would apply it is real work with real value.

---

# ═══ LIST B — REMAINING FEATURE WORK (after List A) ═══

## ⚠️ FIRST, A CORRECTION TO CARRY FORWARD

I reported mid-session that **Solution Studio was the outstanding Phase 5 item.
That was wrong** — `/solution-and-approval/solution-studio` and its `[id]` route
are built and working. Every named Phase 5 subject (reception, job cards,
staging board, diagnosis, Solution Studio, approval, QC) has working screens.

**So "the rest of Phase 5" is not a missing module.** It is the technician's own
tree — §49 names things the other trees do not have at all — plus the customer
tail. Those are listed below by what they actually are.

### B1. Customer tail — 8 routes (after A1 delivers the API work)
`/home/my-tasks` · `/service-and-repairs/appointments` ·
`/parts-and-warranty/installed-parts` · `/parts-and-warranty/product-recommendations` ·
`/support/towing` · `/support/knowledge` · `/support/help-center` ·
`/settings/security`

🔴 **customer-web is the weakest tree at 60%** and only customer work moves it.
Several have working APIs already: appointments (reception, slice 2), installed
parts (`repair.execution_parts_used`, slice 4), knowledge (slice 10 — but it is
STAFF-gated, so a customer-facing view needs its own published subset).

### B2. Technician planning — 5 routes, Phase 5 surface
`/plan-work/find-parts` · `/plan-work/parts-compatibility` ·
`/plan-work/tool-reservation` · `/plan-work/equipment-reservation` ·
`/plan-work/request-specialist`

Backends largely exist: `parts.stock_on_hand`, `catalogue.part_fitments`,
`parts.tools`, `core.service_bays`, and `comms.threads` with a
`specialist_support` kind (slice 7). Mostly screens over live data.

### B3. `/home/calendar` — 1 route
`reception.appointments` and `job_cards.expected_completion_on` both exist. The
owner tree already has a working calendar; check before rebuilding.

### B4. Technician learning — 3 routes
`/learning/assessments` · `/learning/audio-guides` · `/learning/technical-videos`
⚠️ `learning.courses` exists as a REGISTER, not a player. This platform hosts no
training media, and shipping an empty player is the "disconnected mock page"
`05.txt` §2 forbids. Decide what these honestly are before building.

### B5. Technical tools — 5 routes, and NOT all Phase 5
`/technical-tools/component-locations` · `/diagnostic-trees` ·
`/technical-tools/technical-service-information` — Phase 9 (knowledge ops).
`/technical-tools/fault-simulation` · `/repair-solution-simulation` —
🔴 **Phase 12 in `PLAN_EXTENSION_v1` §3.2, described there as "a module the size
of Phase 5"**, sequenced after 1.0 because it consumes confirmed diagnostic data.
**Do not start these as if they were screens.** Signpost them honestly or raise
the sequencing with the owner.

---

# EVERY SLICE MUST STILL DELIVER

`COMPLETION_PLAN.md` §4, 14 items. The five most often skipped:

1. RLS `ENABLE` **and** `FORCE`, policies **per command**, and **both** a tenant
   and an organisation predicate — tenant alone is not isolation here.
2. A tenant-isolation negative test.
3. A verify that **builds its own tenant** and asserts the **EFFECT, not the
   mechanism** — and that **refuses to make an RLS claim under a bypassing
   role** (copy verify/045's `SET LOCAL ROLE` guard).
4. **Rehearse on live before applying** — `rehearse-migration.yml`.
5. The signpost **deleted**, `planned-workshop.spec.ts` still green.

**And now a sixth:** every new `list*`/`get*` gets `assertWorkshopStaff` or an
explicit customer predicate. Never neither.

# HOW TO REPORT AT CLOSE

State for each item whether it **landed**, and if not, say so and why. Report the
`audit-menu-coverage.mjs` figure, never a claim about it.

# THINGS THAT WILL COST A SESSION IF FORGOTTEN

1. **A GREEN BUILD PROVES THE CODE COMPILES, NOT THAT THE FEATURE RAN.** Slice
   11 shipped 404ing on every call and the client swallowed it; every slice-9
   write committed then threw 403. Both passed typecheck, lint, build and their
   verifies. **Drive the running thing.**
2. **THE DEPLOY CHAIN HAS THREE LINKS**: `apply-migrations.yml`,
   `deploy-api.yml`, `Release`. Green CI proves none of them.
   ⚠️ **You are NOT classifier-blocked on these — all three ran on 2026-08-07.**
3. **Rehearse on live before applying.** It caught its first pre-production
   defect on 2026-08-07 (048 seeded a table after forcing RLS — passed locally
   because the local role is superuser).
4. **One rehearsal at a time** — concurrent runs clobber the database firewall.
5. **Local is superuser; Render is not.** A verify that passes locally can be
   proving nothing.
6. **404 from a page is often the nav gate, not a missing screen.** Drive each
   route AS THE ROLE that owns it.
7. **Grep the controller before believing an endpoint exists** (`/members` does
   not; it is `/memberships`).
8. **Keycloak cold start is 125–137s**, then 0.5s. Warm it before any live
   sign-in check. It is not down.
