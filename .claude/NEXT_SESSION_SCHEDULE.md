# Next session — start here

**Written 2026-08-06 at session close. Tip `47babf4`, tree clean, all pushed.**

Owner policy: **five slices + issue resolution every session. Never the
scheduler. Codex and the Supervisor only — no Google ADK, no Stitch.**

---

# ═══ LIST 1 — OUTSTANDING TASKS AND UNRESOLVED ISSUES ═══

## 🔴 1. THE DEPLOY MAY NOT HAVE LANDED — CHECK THIS FIRST

Three runs were force-dispatched at session close because **GitHub Actions
stopped registering push events entirely** — Release last shipped `6021037`
while the tip was `47babf4`, so three fixes sat committed and never built.

| Target | Run | Carries |
|---|---|---|
| Release (apex / workshop-web) | 31127206301 | cold-start retry, mobile layout |
| deploy-customer-web | 31127210632 | the same shared packages |
| deploy-api | 31127213778 | migrations 056+057, `/plan-work/*`, `/learning/*` |

```bash
C:/Users/USER/bin/gh.exe run list --limit 6 --repo marc667us/autoworkshop-ai
# PROOF - 401 not 404, and the pages 200:
curl -s -o /dev/null -w "api %{http_code}\n"  https://autoworkshop-api.onrender.com/api/v1/plan-work/find-parts
curl -s -o /dev/null -w "apex %{http_code}\n" https://autoworkshop.aiappinvent.com/
curl -s -o /dev/null -w "cust %{http_code}\n" https://autoworkshop-customer.onrender.com/payments/invoices
```

⚠️ If a run is missing or failed, **re-dispatch it** — the workflows are fine,
GitHub was degraded. `Release` accepts `workflow_dispatch`.

⚠️ **056 is rehearsed (6/6). 057 was NEVER rehearsed** — its rehearsal
(31126439386) was still queued at close. **Rehearse 057 before applying**, or if
`apply-migrations` already ran, confirm the log said `apply 057` and re-check
`verify/057` against live.

## 🔴 2. THE VIEWER CONTRACT CANNOT SAY "I DO NOT KNOW" — the real fix

All three owner reports on 2026-08-06 were ONE bug: a cold API makes
`currentViewer` return null, and three screens each drew a confident wrong
conclusion — *you hold no grants*, *this screen is not in your menu*, *you are
not signed in* (the landing rendered the SIGNED-OUT variant to a signed-in
owner, which is why there was no dashboard button).

**Fourth instance of "a truth about A used as evidence for B."** The retry
shipped in `14642ac` makes it RARE. It does not make the inference CORRECT.

▶ Give the viewer contract an explicit **`unknown`** state, distinct from
`null`. `grantsFor(null)` cannot tell "no grants" from "could not ask". The
shell should say *"we could not reach the workshop"* rather than silently
rendering the stranger's version of every page. **Worth a slice.**

## 🔴 3. THE MOBILE FIX IS REASONED, NOT MEASURED

`89ce7d2` makes the shell CSS-responsive so layout no longer waits for
hydration, and fixes a contextual panel that stole 320px of a 390px screen
**permanently** — it had no mobile branch at all.

▶ **MEASURE `main` width at 390px on the deployed site before closing this.**
This repo has a recorded defect for claiming a responsive fix without measuring
(T-0044 claimed 51px sideways at 768px; it later measured 0px). If the owner
still sees a cut-off page, get the SPECIFIC screen and phone.

## 4. `RENDER_API_KEY` — OWNER ONLY
Leaked in a transcript 2026-07-27, still unrotated. Treat as compromised.
**The only item in the whole backlog Claude cannot do.**

## 5. Cold start is an OUTAGE TO THE USER — accepted, not solved
Measured: API 21.6s cold / 0.91s warm; Keycloak 136s / 0.68s. Both answer 200.
Keep-warm runs 08:00–18:00 UTC weekdays only, because four free services share
one 750-hour allowance and over-running it suspended the account on 2026-07-28.
⚠️ **DO NOT propose more hours or any paid remedy.** Owner: *"i use the time for
other thing here not just kc."* The retry makes the cold path survivable; that
is the sanctioned lever.

## 6. Honesty debts still standing
- `quotation` and `purchase_order` approval scopes are **recorded, not
  enforced**. `repair_approval` now IS — copy `authz/approval-limits.ts`, and add
  a scope to `ENFORCED_SCOPES` **only when the call site exists**.
- Procedure **certification requirements** render "recorded, not enforced";
  `procedures.requires_certification` and `learning.certifications` both exist.
- **Workflow rules** render "recorded, not yet running".

## 7. The tables built this session are EMPTY
057 created `knowledge.diagnostic_trees` + nodes and `learning.course_materials`
+ `completions`. All empty. They need an authoring screen (workshop admin) or a
seed. **Ask the owner which they want first.**

## 8. Unmeasured surface
**Playwright has not run since 2026-07-29**; ~120 pages have landed since.
The largest unmeasured area in the product.

## 9. The tail
Owner §46 63/64 · Default §34 55/56 · Reception §48 28/29 — one route each.
`node scripts/audit-menu-coverage.mjs --all` names them.

---

# ═══ LIST 2 — THE NEXT PHASE, NOW THAT PHASE 5 IS DONE ═══

**Phase 5 is complete.** Every named subject — reception, job cards, staging
board, diagnosis, repair plan, quotation, Solution Studio, approval, execution,
testing, QC — has working screens, and the trees that consume them are at
**customer 100%** and **technician 95%**.

**241 of 243 routes work. The only two signposted routes left are Phase 12.**

⚠️ **READ `docs/00-project/PLAN_EXTENSION_v1.md` BEFORE PLANNING.** It is the
authority on what moved where, and it explicitly renumbered work out of Phase 10
into a new Phase 12. The slices below are drawn from it — confirm against it
rather than trusting this summary.

### A. Phase 7 — money, end to end (mostly BUILT, needs completion)
§40–§44: invoice preparation, sending, receipt of payment, **partial payment and
balance**, workshop warranty, return/warranty claim. Slices 3 and 12 built most
of it. ▶ Audit §40–§44 against what exists and close the gaps — the shortest
path to a complete revenue loop.

### B. Phase 9 — knowledge and communication (PARTLY built)
Chat, voice and video shipped in slices 7 and 11. The knowledge CMS did not:
authoring, versioning, technical/safety/copyright review, and a publication
workflow with a copyright-review role. 057 added diagnostic trees with no
authoring screen. ▶ **The authoring surface is the gap** — and it is also what
LIST 1 item 7 needs.

### C. Phase 8 — the approval gate
Approval limits are enforced for `repair_approval` only. The gate itself and the
other scopes are Phase 8 work. Ties directly to LIST 1 item 6.

### D. Phase 10 — the 3D viewer
The viewer, 7-layer model, component metadata, isolation, exploded views.
`knowledge.diagrams` already holds `exploded_view` and `routing` kinds.

### E. Phase 12 — Simulation Intelligence (AFTER 1.0)
🔴 The two remaining signposts: `/technical-tools/fault-simulation` and
`/technical-tools/repair-solution-simulation`. `PLAN_EXTENSION_v1` §3.2 calls
this **"a module the size of Phase 5"**, not a Phase 10 sub-task. It consumes
confirmed diagnostic data and depends on the Phase 9 library and the Phase 8
approval gate, which is why it is sequenced last.
▶ **First deliverable is a PLAN, not code.** What does it consume, is the
diagnostic data rich enough yet, what does it produce? Bring that to the owner
before building anything.

---

# ═══ TRAPS THAT WILL COST A SESSION ═══

1. **A GREEN BUILD PROVES THE CODE COMPILES, NOT THAT THE FEATURE RAN.**
   401-not-404 on the running API is the proof.
2. 🔴 **THE DEPLOY CHAIN HAS FOUR LINKS**: `apply-migrations`, `deploy-api`,
   `Release` (apex / workshop-web **only**), and **`deploy-customer-web` —
   dispatch-only, nothing triggers it.**
3. 🔴 **GITHUB CAN STOP CREATING RUNS FOR PUSHES ENTIRELY.** Check Release's
   `headSha` against your tip. It shipped `6021037` while the tip was `47babf4`.
4. 🔴 **A QUEUED `apply-migrations` CHECKS OUT MASTER AT RUN TIME** — land a
   migration after dispatching and it applies UNREHEARSED.
5. **`gh workflow run` can 500 AND START THE RUN, or 500 and do nothing.**
6. **POSTGRES OR-COMBINES PERMISSIVE POLICIES** — 054 uses RESTRICTIVE for that
   reason; a permissive retrofit enforces nothing and looks perfect in review.
7. **Three test outcomes: passed, failed, SKIPPED.** Collapsing skip either way
   turned Release red this session.
8. **Local is superuser; Render is not** — `SET LOCAL ROLE autoworkshop_app`.
9. **A customer is a car owner who brings a vehicle in — NEVER staff.**
10. **Grep the schema before believing a column or function exists** — four
    defects caught that way this session.
11. **A transport failure is not an authorization fact.** See LIST 1 item 2.
