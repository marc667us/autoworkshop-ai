# Current task

**Written 2026-08-07 at session close. Git tip `db5e525` on `master`, pushed,
tree clean. PRODUCTION == BUILD. No dev servers running.**

## ▶ FIRST COMMAND OF THE SESSION — not a document, a script

```bash
bash scripts/start-session.sh
```

Then **`.claude/NEXT_SESSION_SCHEDULE.md`**, which holds the two ordered lists:
**LIST A (issues — do first)**, then **LIST B (remaining features)**.

Measure with `node scripts/audit-menu-coverage.mjs` before trusting any number.

### 🔴 HARD POLICY — owner
**Five slices plus issue resolution every session. Never use the scheduler.**
**Codex and the Supervisor only — no Google ADK, no Stitch.**

---

## WHERE THINGS STAND

**215 of 242 working** — workshop-web 191, customer-web 24.
27 signposted: 13 workshop (all technician §49), 14 customer.

Manager 100% · Owner 98% · Default 98% · Reception 97% ·
**Technician 67%** · **Customer 60%**

**Production == build** at `db5e525`: local = origin = Release headSha,
52 migrations applied, 0 pending.

Suites at close: live site **9/9**, live spine **7/7**, Playwright
**138 passed / 2 skipped / 0 failed**, API unit **730 passed**, lint clean,
`check-page-gates` OK, `planned-workshop.spec` 4/4.

---

## ▶ THE FIRST THING TO DO

**LIST A, item A1**: a customer still cannot see their own invoices, payments
or warranty claims.

Eleven read methods were found ungated on 2026-08-07 — a signed-in customer
could read the workshop's whole invoice book, payment record, stock, supplier
orders and warranty decisions. That is closed. Closing it did **not** open the
legitimate door, and six of the fourteen customer signposts are exactly that
door.

Add customer-scoped reads with a session-derived customer predicate
(`SelfServiceService.resolveCustomer` is the pattern). **Never** relax
`assertWorkshopStaff` to achieve it.

---

## ⚠️ A CORRECTION TO CARRY FORWARD

Mid-session I reported **Solution Studio** as the outstanding Phase 5 item.
**That was wrong.** `/solution-and-approval/solution-studio` and its `[id]`
route are built and working, and every named Phase 5 subject — reception, job
cards, staging board, diagnosis, Solution Studio, approval, QC — has working
screens.

The remaining work is not a missing Phase 5 module. It is the technician's own
tree (§49 names things no other tree has), the customer tail, and two routes
that belong to **Phase 12**, not Phase 5 — `fault-simulation` and
`repair-solution-simulation`, which `PLAN_EXTENSION_v1` §3.2 calls "a module the
size of Phase 5". Do not start those as if they were screens.

---

## 🔴 THE TWO LESSONS THAT COST THE MOST THIS SESSION

1. **A green build proves the code compiles, not that the feature ran.** Slice
   11's signalling proxy omitted the API's `/api/v1` prefix, so every call 404'd
   — and the client swallowed it (`if (!res.ok) return`), leaving the UI at
   "Connecting" for ever. Every slice-9 write committed and then threw 403.
   Both passed typecheck, lint, build and their own verifies. Found only by
   driving the running API.

2. **Writes were gated everywhere; reads were gated nowhere.** Three instances
   in two passes — settings, knowledge, then finance/warranty/parts. Ask of
   every `list*`/`get*`: *who may call this?*
