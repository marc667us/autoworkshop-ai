# Next session — the to-do list

**Written 2026-08-06 at session close. Tip `f568c35`, tree clean, all pushed.**

Owner policy: **five slices + issue resolution every session. Never the
scheduler. Codex and the Supervisor only — no Google ADK, no Stitch.**

---

# ═══ 1. FIRST THING: FINISH THE DEPLOY ═══

**Migrations 056 + 057 and the API are BUILT, TESTED and PUSHED but NOT
DEPLOYED.** Nothing is broken — this is unshipped, not failing. GitHub Actions
was degraded at session close (40–55 min queues, intermittent HTTP 500).

A chained script was left running and may have completed it. **CHECK FIRST:**

```bash
# did it land?  each must be 401, NOT 404
for p in plan-work/find-parts learning/materials learning/diagnostic-trees; do
  curl -s -o /dev/null -w "$p %{http_code}\n" https://autoworkshop-api.onrender.com/api/v1/$p
done
```

If they 404, run this IN ORDER:

```bash
# 0. the 057 rehearsal must show "verify/057: 8 of 8" before applying
C:/Users/USER/bin/gh.exe run list --workflow=rehearse-migration.yml --limit 2 --repo marc667us/autoworkshop-ai
# 1. apply BOTH pending migrations (one run applies all pending)
C:/Users/USER/bin/gh.exe workflow run apply-migrations.yml -f confirm=APPLY --repo marc667us/autoworkshop-ai
# 2. the API
C:/Users/USER/bin/gh.exe workflow run deploy-api.yml -f confirm=APPLY --repo marc667us/autoworkshop-ai
```

⚠️ 056 is already rehearsed on live (verify 6/6). **057 must be rehearsed before
it is applied.**

---

# ═══ 2. THE PRODUCT IS AT 241 of 243 ═══

Re-measure first — `node scripts/audit-menu-coverage.mjs` is the authority.

| Tree | Working | |
|---|---|---|
| Manager §47 | 36/36 | 100% |
| **Customer §33** | **35/35** | **100%** |
| Owner §46 | 63/64 | 98% |
| Default §34 | 55/56 | 98% |
| Reception §48 | 28/29 | 97% |
| **Technician §49** | **40/42** | **95%** |

**ONLY TWO SIGNPOSTS REMAIN IN THE WHOLE PRODUCT**, and both are deliberate:
`/technical-tools/fault-simulation` and `/technical-tools/repair-solution-simulation`.

---

# ═══ 3. THE WORK ITSELF — RANKED ═══

### 🔴 A. `RENDER_API_KEY` — OWNER ONLY, still unrotated since 2026-07-27
Leaked in a transcript. Treat as compromised. Rotate, then update the GitHub
secret on the repo. **Nothing else in either list is blocked on the owner.**

### B. PHASE 12 — the two simulations (the only unbuilt routes)
`PLAN_EXTENSION_v1` §3.2: **"a module the size of Phase 5"**, sequenced after
1.0 because it consumes confirmed diagnostic data. **This is a phase, not a
slice — do not start it as two screens.**
▶ First step is a PLAN, not code: what does a fault simulation consume
(confirmed diagnoses? measurement data the product does not yet capture?), what
does it produce, and is the diagnostic data rich enough yet? Bring that to the
owner before building.

### C. THE HONESTY DEBTS THAT REMAIN — real work, real value
- `quotation` and `purchase_order` approval scopes are **recorded, not
  enforced**. `repair_approval` now IS enforced — copy that pattern:
  `authz/approval-limits.ts` + add the scope to `ENFORCED_SCOPES` **only when
  the call site exists**.
- Procedure **certification requirements** still render "recorded, not
  enforced": `knowledge.procedures.requires_certification` and
  `learning.certifications` both exist, so the join is there to make.
- **Workflow rules** render "recorded, not yet running".

### D. CONTENT, NOT CODE — the new tables are empty
057 built the artefacts; nobody has filled them.
- `knowledge.diagnostic_trees` — worth writing for faults that come back.
- `learning.course_materials` — the workshop's existing videos/assessments as links.
These need an AUTHORING screen (workshop-web, admin side) or a seed. Ask the
owner which they want first.

### E. The tail nobody has looked at
- Owner §46 63/64, Default §34 55/56, Reception §48 28/29 — one route each.
  Find them: `node scripts/audit-menu-coverage.mjs --all`.
- **Playwright has not been re-run since 2026-07-29** and ~120 pages have landed
  since. That is the largest unmeasured surface in the product.

---

# ═══ 4. TRAPS THAT WILL COST A SESSION ═══

1. **A GREEN BUILD PROVES THE CODE COMPILES, NOT THAT THE FEATURE RAN.**
   **401, not 404**, on the running API is the proof.
2. 🔴 **THE DEPLOY CHAIN HAS FOUR LINKS.** `Release` deploys the apex
   (workshop-web) ONLY. **customer-web is `deploy-customer-web.yml`, dispatch-
   only, nothing triggers it** — it had not run for two days while two slices
   sat live-on-the-API and invisible.
3. 🔴 **A QUEUED `apply-migrations` RUN CHECKS OUT MASTER AT RUN TIME.** Land a
   new migration after dispatching and it applies UNREHEARSED. Cancel and
   re-dispatch.
4. **POSTGRES OR-COMBINES PERMISSIVE POLICIES.** An org-scoped permissive policy
   beside a tenant-only one enforces NOTHING and looks perfect in review. 054
   uses RESTRICTIVE because those are AND-ed.
5. **A test needing infrastructure has THREE outcomes** — passed, failed,
   SKIPPED. Collapsing skip either way turned Release red this session.
6. **Local is superuser; Render is not.** `SET LOCAL ROLE autoworkshop_app`.
7. **`gh workflow run` can 500 AND START THE RUN, or 500 and do nothing.** Both
   happened. Check the run list before re-dispatching.
8. **A customer is a car owner who brings a vehicle in — NEVER staff.**
9. **Grep the schema before believing a column or function exists.** Four
   defects caught that way this session.
10. **Keycloak cold start is 125–137s**, then 0.5s. It is not down.

# ═══ 5. EVERY NEW SLICE STILL OWES ═══

RLS `ENABLE`+`FORCE`, **both** predicates (the whole-schema isolation suite now
checks this automatically) · a tenant-isolation negative test · a verify that
builds its own tenant and asserts the EFFECT under a non-bypassing role ·
**rehearse on live** · signpost deleted, `planned-workshop.spec` green · every
new `list*`/`get*` gets `assertWorkshopStaff` **or** a customer predicate,
never neither.
