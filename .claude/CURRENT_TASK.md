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

**LIST A, item A1 — the owner is blocked on this right now.**

`admin@` on production gets *"your session has ended, you were logged out"* on
every screen. **The owner account works fine.** The account holds NO active
membership, `resolveTenantContext` requires one, and `TenantGuard` answers 401 —
the same status as an expired token. `/me` sits behind that guard too, so the
whole shell reads as signed out.

The MESSAGE is fixed and deployed (`noMembership` is now distinct and offers no
sign-in link, because offering one created the loop). **The design question is
NOT settled:** `identity.is_platform_admin()` is an RLS escape hatch throughout
the schema, yet a platform admin without a per-org membership cannot use the
application at all. Settle it explicitly — bypassing membership would let one
account reach every tenant, so it needs a decision and a negative test.

> **Workaround that works today, verified on production:** sign in as the owner
> → `/workshop-management/staff` → add by email + role. The account must have
> signed up first.

**Then A2**: closing the eleven ungated reads did not open the legitimate door —
a customer still cannot see their own invoices, payments or warranty claims, and
six of the fourteen customer signposts are exactly that door.

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
