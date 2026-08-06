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

**6 signposted routes, all technician §49, each argued. Measure first: `node scripts/audit-menu-coverage.mjs`.**

| Tree | Working | % |
|---|---|---|
| Manager §47 | 36/36 | **100%** |
| Owner §46 | 63/64 | 98% |
| Default §34 | 55/56 | 98% |
| Reception §48 | 28/29 | 97% |
| **Customer §33** | **35/35** | **100%** ✅ |
| **Technician §49** | **36/42** | **86%** — 6 left, all argued below |

### ✅ B1 — CUSTOMER TAIL: DONE (slice 13)
All 8 routes built. **CUSTOMER §33 is 35/35, 100%, 0 signposted.**
`/my/*` + `selfservice/customer-scope.ts` is the established pattern — copy it
for anything customer-facing, and never relax a staff gate to serve a customer.

### ✅ B2 / B3 / part of B5 — DONE (slices 14 + 15)
Technician §49 **28/42 → 36/42 (86%)**. Planning built (migration 056,
`parts.resource_bookings`); calendar, component-locations and
technical-service-information RE-MOUNTED onto screens that already existed.

### 🔴 THE SIX THAT REMAIN — AND WHY THEY ARE NOT SCREENS

**Do not "finish" these by mounting something plausible.** Each is signposted
because the thing behind it does not exist, and a re-mount would be a lie about
what the workshop has.

**`/technical-tools/diagnostic-trees` — the artefact does not exist.**
There is no `knowledge.diagnostic_trees` table and nothing shaped like a
decision tree. `knowledge.procedures` is a linear step list; `fault_codes` is
an index. Mounting either under this name would rename a thing rather than
build one. It is Phase 9 CONTENT work: design the artefact (nodes, branches,
outcomes), then a screen.

**`/learning/{assessments,audio-guides,technical-videos}` — no media is hosted.**
`learning.courses` is a REGISTER — title, provider, duration, whether it grants
a certification. There is no player, no upload, no asset link, and no
assessment concept anywhere in the schema. Three menu entries promising three
different media types cannot honestly be served by one register, and an empty
player is the disconnected mock page `05.txt` §2 forbids.
▶ **The real decision to make first:** is this platform hosting training media
(needs storage, an asset per course, a player), or is it RECORDING training done
elsewhere (needs a link and a completion date)? The second is a small honest
slice. The first is a module. Ask the owner which.

**`/technical-tools/fault-simulation` + `/repair-solution-simulation` —
🔴 PHASE 12.** `PLAN_EXTENSION_v1` §3.2 calls this "a module the size of Phase
5", sequenced after 1.0 because it consumes confirmed diagnostic data.
**Do not start these as if they were screens.**

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

0. 🔴 **THE DEPLOY CHAIN HAS *FOUR* LINKS, NOT THREE.** This cost most of a
   session's confidence on 2026-08-06:

   | What | How | Notes |
   |---|---|---|
   | migrations | `apply-migrations.yml -f confirm=APPLY` | rehearse first |
   | the API | `deploy-api.yml -f confirm=APPLY` | dispatch only |
   | the apex (**workshop-web**) | `Release`, on push to master | automatic |
   | **customer-web** | **`deploy-customer-web.yml -f confirm=APPLY`** | **DISPATCH ONLY — nothing triggers it** |

   **`Release` does NOT deploy customer-web.** It had not run since 2026-08-04,
   so slices 12 AND 13 had live API routes (401, correct) and **screens nobody
   could see**. Every probe was green and the feature was still not reachable.
   ⚠️ **If a slice touches `apps/customer-web`, dispatch that workflow.**
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
