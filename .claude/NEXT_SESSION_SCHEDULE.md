# Commencement task — the next session

**Written 2026-08-06 at session close.** Read `.claude/CURRENT_TASK.md` first.

## 🔴 THE POLICY THIS SCHEDULE SERVES

Owner: **five slices plus issue resolution every session. Never use the
scheduler — the owner runs their own. Codex and the Supervisor only; no Google
ADK, no Stitch.**

---

# ═══ LIST A IS CLOSED ═══

Every item is either fixed and deployed, or is an owner-only action.

| # | Item | State |
|---|---|---|
| A1 | RLS: no organisation predicate on 001–044 | ✅ **migration 054**, 49 tables, restrictive policy. Rehearsed on live, applied. |
| A2 | Systematic tenant/organisation isolation suite | ✅ `organisation-isolation.integration.spec.ts`, runs in `pnpm test`. Built to FAIL first — it did. |
| A3 | Prove the staff gate from OUTSIDE, as a customer | ✅ `customer-records.integration.spec.ts` 19/19, proven non-inert. |
| A4 | `security-posture` flake | ✅ Not seen again across many full runs this session. |
| A5 | Sweep every service for ungated reads | ✅ All 37 argued: 14 gated, the rest justified **in writing** in the commit. |
| A6 | "Recorded, not enforced" honesty debts | ✅ Repair approvals now ENFORCED; `isEnforced` is a per-scope lookup. |
| A7 | `RENDER_API_KEY` unrotated since 2026-07-27 | 🔴 **OWNER ONLY — the one thing left in LIST A.** |

### 🔴 A7 — the only open item, and only the owner can do it
Leaked in a transcript on 2026-07-27. Treat as compromised until rotated, then
update the GitHub secret on the repo.

### ⚠️ Still recorded-only, deliberately (not defects)
`quotation` and `purchase_order` approval scopes are stored but not applied —
the "Applied?" column on the limits screen says so per row, and the flag reads
from code (`ENFORCED_SCOPES`) rather than from a promise. Add to that set only
when the call site exists.

---

# ═══ LIST B — REMAINING FEATURE WORK ═══

**22 signposted routes. Measure first: `node scripts/audit-menu-coverage.mjs`.**

| Tree | Working | % |
|---|---|---|
| Manager §47 | 36/36 | **100%** |
| Owner §46 | 63/64 | 98% |
| Default §34 | 55/56 | 98% |
| Reception §48 | 28/29 | 97% |
| **Customer §33** | **27/35** | **77%** |
| Technician §49 | 28/42 | 67% |

### B1. Customer tail — 8 routes (only this moves customer-web)
`/home/my-tasks` · `/service-and-repairs/appointments` ·
`/parts-and-warranty/installed-parts` · `/parts-and-warranty/product-recommendations` ·
`/support/towing` · `/support/knowledge` · `/support/help-center` ·
`/settings/security`

🔴 **`/my/*` IS THE TEMPLATE FOR ALL OF THESE.** Slice 12 built the pattern:
`selfservice/customer-scope.ts` derives the customer from the SESSION, and the
route lives under `/my/*` so it can never be reached by loosening a filter on
the workshop's own endpoint. **Never relax a staff gate to serve a customer.**

Notes on specific ones:
- **appointments** — `reception.appointments` is now STAFF-GATED (A5). A
  customer view needs its own customer-predicated read, exactly like `/my/*`.
- **installed-parts** — `repair.execution_parts_used` exists; reach the customer
  through `repair.job_cards.customer_id`, as slice 12 does.
- **knowledge** — `knowledge.listArticles` already filters `is_published`, but
  is staff-gated. A customer view needs its own published subset.
- **towing** — 🔴 **there is NO towing backend at all.** `towing-web` is a
  workspace shell; no service, no table. This is a build, not a screen.
- **my-tasks** — `/self-service/notifications` already returns exactly this
  (real counts over real tables, zero-count categories omitted). Mostly a screen.

### B2. Technician planning — 5 routes
`/plan-work/find-parts` · `/plan-work/parts-compatibility` ·
`/plan-work/tool-reservation` · `/plan-work/equipment-reservation` ·
`/plan-work/request-specialist`
Backends largely exist: `parts.stock_on_hand`, `catalogue.part_fitments`,
`parts.tools`, `core.service_bays`, `comms.threads` (`specialist_support`).

### B3. `/home/calendar` — 1 route. The owner tree already has a working
calendar; check before rebuilding.

### B4. Technician learning — 3 routes
⚠️ `learning.courses` is a REGISTER, not a player. This platform hosts no
training media. Decide what these honestly are before building one.

### B5. Technical tools — 5 routes, NOT all Phase 5
`component-locations` · `diagnostic-trees` · `technical-service-information`
— Phase 9. `fault-simulation` · `repair-solution-simulation` — 🔴 **Phase 12**,
"a module the size of Phase 5" (`PLAN_EXTENSION_v1` §3.2). **Do not start those
as if they were screens.**

---

# EVERY SLICE MUST STILL DELIVER

`COMPLETION_PLAN.md` §4. The six most often skipped:

1. RLS `ENABLE` **and** `FORCE`, **both** a tenant and an organisation
   predicate. 🔴 **A new table gets this automatically checked now** — the
   isolation suite asks the question of EVERY table, so a new one missing the
   organisation predicate fails `pnpm test`. Add it to
   `NO_ORG_PREDICATE_EXPECTED` only with a written reason.
2. A tenant-isolation negative test.
3. A verify that builds its own tenant, asserts the EFFECT not the mechanism,
   and refuses to make an RLS claim under a bypassing role.
4. **Rehearse on live before applying.** One at a time.
5. The signpost **deleted**, `planned-workshop.spec.ts` still green.
6. Every new `list*`/`get*` gets `assertWorkshopStaff` **or** an explicit
   customer predicate. Never neither.

# THINGS THAT WILL COST A SESSION IF FORGOTTEN

1. **A GREEN BUILD PROVES THE CODE COMPILES, NOT THAT THE FEATURE RAN.**
   `/my/invoices` answering **401 and not 404** is what proved slice 12 live.
2. **POSTGRES OR-COMBINES PERMISSIVE POLICIES.** Adding an org-scoped permissive
   policy beside a tenant-only one enforces NOTHING and looks perfect in a diff.
   054 uses a RESTRICTIVE policy because those are AND-ed.
3. **A test needing infrastructure has THREE outcomes** — passed, failed,
   SKIPPED. Collapsing skip into either turned Release red this session. Use
   `ctx.skip()` and prove both directions.
4. **Local is superuser; Render is not.** `SET LOCAL ROLE autoworkshop_app` is
   how an RLS assertion is made to mean something.
5. **Runner saturation looks exactly like a broken workflow.** A queued run that
   never starts, plus `gh run cancel` returning HTTP 500, meant five workflows
   were dispatched at once — not a broken deploy.
6. **`gh workflow run` can return HTTP 500 AND START THE RUN.** Check the run
   list before re-dispatching.
7. **A customer is a car owner who brings a vehicle in — NEVER staff.**
8. **Grep the schema before believing a column or function exists.**
9. **Keycloak cold start is 125–137s**, then 0.5s. It is not down.
