# Commencement task — the next session

**Written 2026-08-06 at session close.** Read `.claude/CURRENT_TASK.md` first,
then this.

## 🔴 THE POLICY THIS SCHEDULE SERVES

Owner: **five slices plus issue resolution every session. Never use the
scheduler — the owner runs their own. Codex and the Supervisor only; no Google
ADK, no Stitch.** This document IS the schedule.

## ⚠️ HONEST REPORT OF THE LAST SESSION — ONE SLICE OF FIVE

**Slice 12 landed. Slices 13–16 did NOT.** The session went deep on LIST A
instead: A2 (the slice), A3 and A5 are closed, and a **severity-1 finding** was
turned up that is bigger than any single feature slice (see LIST A · A1 below).

`node scripts/audit-menu-coverage.mjs` — measured, not claimed:

| Tree | Working | % |
|---|---|---|
| Manager §47 | 36/36 | **100%** |
| Owner §46 | 63/64 | 98% |
| Default §34 | 55/56 | 98% |
| Reception §48 | 28/29 | 97% |
| **Customer §33** | **27/35** | **77%** (was 60%) |
| Technician §49 | 28/42 | 67% |

**221 of 242 working.** 22 signposted remain: 14 technician, 8 customer.
**RE-MEASURE BEFORE STARTING ANYTHING.**

---

# ═══ LIST A — DO THIS FIRST ═══

### 🔴 A1. RLS on migrations 001–044 has NO organisation predicate — SEVERITY 1
**Full write-up: `docs/11-devops/RLS_ORG_PREDICATE_GAP.md`. Read it before
touching this — the three things that will break are listed there.**

Measured: ~100 policies across 001–044 filter on `tenant_id` only. 045+ carry
both. A tenant here holds MORE THAN ONE organisation, so for the whole original
product — customers, vehicles, every `repair.*` table, finance, warranty, parts,
reception, media — the database's second line of defence stops at the tenant
boundary. Two workshops in one tenant are separated by the **application layer
alone**.

`COMPLETION_PLAN.md` §4 item 1 requires both, and says why: *tenant alone is not
isolation here.*

This is a **missing second line of defence, not an open door** (the app layer
does carry `AND organization_id = $2` nearly everywhere). Do not panic-apply it:
`current_organization_id()` is NULL under `withUser()` and
`queryWithoutTenant()`, so a blind retrofit breaks the marketplace buyer path,
the public catalogue and the registration bootstrap.

### 🔴 A2. The systematic tenant-isolation suite (was A4, T-0006)
**Do this FIRST, before A1** — it is the thing that would have caught A1, and it
gives A1 its proof. Build it to FAIL: inject a tenant-only policy and watch it
catch that.

`apps/api/src/selfservice/customer-records.integration.spec.ts` is the working
shape to copy — it builds its own tenant as the OWNER (migration 038 shut the
bootstrap door to the app role) and asserts under `SET LOCAL ROLE
autoworkshop_app`, because an RLS assertion made by a role that bypasses RLS
says nothing.

### A3. Finish the ungated-read sweep — 26 reads still unargued
The sweep counted **101 read methods, 37 with no gate**; 11 were fixed. The
remaining 26 are listed by running:

```bash
# the same sweep, re-runnable
cd apps/api/src && python - <<'PY'
import re, glob, io
GATES = re.compile(r"assertWorkshopStaff|assertMay\w+|isWorkshopStaff|resolveCustomerId|assertParticipant")
READ  = re.compile(r"^\s{2}(?:private |public )?async ((?:list|get|find|search|read|export)\w*)\s*\(", re.M)
ANY   = re.compile(r"^\s{2}(?:private |public )?async (\w+)\s*\(", re.M)
for f in sorted(glob.glob("*/*.service.ts")):
    src=io.open(f,encoding='utf-8').read(); starts={m.start() for m in READ.finditer(src)}
    allm=[(m.start(),m.group(1)) for m in ANY.finditer(src)]
    for i,(p,n) in enumerate(allm):
        if p in starts and not GATES.search(src[p:(allm[i+1][0] if i+1<len(allm) else len(src))]):
            print(f"{f}::{n}")
PY
```

**Several are CORRECT and must stay open** — `public/catalogue` is public by
design, published opening hours are deliberately anonymous (verify/045 check 9),
`/vehicles` and `/customers` are customer-scoped already. The job is to ARGUE
each one, not to gate them all. `calls.listCalls` and `comms.listThreads` are
the two most worth looking at first.

### A4. `security-posture.integration.spec.ts` flake — unchanged from last session
Failed once during a full `pnpm test`, passed on every subsequent run. Nothing
claimed fixed.

### A5. `RENDER_API_KEY` — owner only, still unrotated since 2026-07-27.

### A6. Two deliberate honesty debts — unchanged
Approval limits, workflow rules and procedure certification requirements all
render **"recorded, not enforced"**. Honest, not finished.

---

# ═══ LIST B — REMAINING FEATURE WORK ═══

**22 signposted routes. This is where slices 13–16 go.**

### B1. Customer tail — 8 routes (customer-web is 77%; only this moves it)
`/home/my-tasks` · `/service-and-repairs/appointments` ·
`/parts-and-warranty/installed-parts` · `/parts-and-warranty/product-recommendations` ·
`/support/towing` · `/support/knowledge` · `/support/help-center` ·
`/settings/security`

APIs that already exist: appointments (`reception.appointments`, but it is now
**staff-gated** by A5 — a customer view needs its own customer-predicated read,
exactly like slice 12's `/my/*`), installed parts
(`repair.execution_parts_used`), knowledge (slice 10, staff-gated, needs a
published subset).

⚠️ **The slice-12 pattern is the template for all of these**:
`selfservice/customer-scope.ts` + a `/my/*` route. Never relax a staff gate.

### B2. Technician planning — 5 routes
`/plan-work/find-parts` · `/plan-work/parts-compatibility` ·
`/plan-work/tool-reservation` · `/plan-work/equipment-reservation` ·
`/plan-work/request-specialist`
Backends largely exist: `parts.stock_on_hand`, `catalogue.part_fitments`,
`parts.tools`, `core.service_bays`, `comms.threads` (`specialist_support` kind).

### B3. `/home/calendar` — 1 route. The owner tree already has a working
calendar; check before rebuilding.

### B4. Technician learning — 3 routes
`/learning/assessments` · `/learning/audio-guides` · `/learning/technical-videos`
⚠️ `learning.courses` is a REGISTER, not a player. This platform hosts no
training media. Decide what these honestly are before building.

### B5. Technical tools — 5 routes, NOT all Phase 5
`/technical-tools/component-locations` · `/diagnostic-trees` ·
`/technical-tools/technical-service-information` — Phase 9.
`/technical-tools/fault-simulation` · `/repair-solution-simulation` —
🔴 **Phase 12**, "a module the size of Phase 5" (`PLAN_EXTENSION_v1` §3.2).
**Do not start these as if they were screens.**

---

# EVERY SLICE MUST STILL DELIVER

`COMPLETION_PLAN.md` §4, 14 items. The six most often skipped:

1. RLS `ENABLE` **and** `FORCE`, policies **per command**, and **both** a tenant
   and an organisation predicate. See A1 — this has been skipped ~100 times.
2. A tenant-isolation negative test.
3. A verify that **builds its own tenant**, asserts the **EFFECT not the
   mechanism**, and **refuses to make an RLS claim under a bypassing role**.
4. **Rehearse on live before applying** — `rehearse-migration.yml`.
5. The signpost **deleted**, `planned-workshop.spec.ts` still green.
6. Every new `list*`/`get*` gets `assertWorkshopStaff` **or** an explicit
   customer predicate. Never neither.

# THINGS THAT WILL COST A SESSION IF FORGOTTEN

1. **A GREEN BUILD PROVES THE CODE COMPILES, NOT THAT THE FEATURE RAN.** Drive
   the running thing. Slice 12's routes were probed on the live API (401, not
   404) *before* screens were written on top of them.
2. **THE DEPLOY CHAIN HAS THREE LINKS**: `apply-migrations.yml`,
   `deploy-api.yml`, `Release`. Green CI proves none of them. You are NOT
   classifier-blocked — all three ran on 2026-08-06.
3. **Rehearse on live before applying.** One rehearsal at a time (concurrent
   runs clobber the database firewall).
4. **Local is superuser; Render is not.** A verify that passes locally can be
   proving nothing. `SET LOCAL ROLE autoworkshop_app` is how you make it mean
   something.
5. **A customer is a car owner who brings a vehicle in — NEVER staff.** Owner's
   own words, 2026-08-06. `assertWorkshopStaff` refuses them; `/my/*` serves
   them their own rows. A method needs exactly one of the two.
6. **Grep the schema before believing a column or function exists.**
   `warranty.next_claim_number()` does not; `claim_events` has `decided_at`, not
   `created_at`. Both caught by reading `information_schema` first.
7. **Keycloak cold start is 125–137s**, then 0.5s. It is not down.
8. **Check what a commit CONTAINED**, not that it exited 0.
