# Current task — resume here

**Written 2026-08-06 at session close. Tip `47babf4` on `master`, pushed, tree
clean.**

## ▶ FIRST COMMAND OF THE SESSION — a script, not a document

```bash
bash scripts/start-session.sh
```

Then **`.claude/NEXT_SESSION_SCHEDULE.md`**, which holds TWO ORDERED LISTS:

- **LIST 1 — outstanding tasks and unresolved issues.** Item 1 is a deploy that
  may not have landed; do it before anything else.
- **LIST 2 — the next phase.** Phase 5 is DONE; the candidate slices are drawn
  from `docs/00-project/PLAN_EXTENSION_v1.md`.

### 🔴 HARD POLICY — owner
**Five slices plus issue resolution every session. Never use the scheduler.**
**Codex and the Supervisor only — no Google ADK, no Stitch.**

---

## ▶ THE FIRST THING TO DO

**Confirm the deploy landed.** GitHub Actions stopped creating runs for pushes
at session close — Release last shipped `6021037` while the tip was `47babf4`,
so three fixes were committed and never built. Three runs were force-dispatched;
they may or may not have completed.

```bash
curl -s -o /dev/null -w "api %{http_code}\n"  https://autoworkshop-api.onrender.com/api/v1/plan-work/find-parts
curl -s -o /dev/null -w "apex %{http_code}\n" https://autoworkshop.aiappinvent.com/
curl -s -o /dev/null -w "cust %{http_code}\n" https://autoworkshop-customer.onrender.com/payments/invoices
```

**401 on the API route means it landed. 404 means re-dispatch** — LIST 1 item 1
has the run ids and the commands.

⚠️ **Migration 057 was never rehearsed on live.** Rehearse it before applying,
or verify it was applied and re-run `verify/057` against production.

---

## WHERE THE PRODUCT IS

**241 of 243 routes work.** Only two signposts remain in the entire product, and
both are Phase 12 by design.

| Tree | Working | |
|---|---|---|
| Manager §47 | 36/36 | 100% |
| **Customer §33** | **35/35** | **100%** |
| Owner §46 | 63/64 | 98% |
| Default §34 | 55/56 | 98% |
| Reception §48 | 28/29 | 97% |
| **Technician §49** | **40/42** | **95%** |

Migrations **053–057**. API suite **761 passed**, lint clean, page-gates OK.
`node scripts/audit-menu-coverage.mjs` is the authority — re-measure, never
trust this table.

---

## 🔴 THE LESSON THAT MATTERED MOST THIS SESSION

**All three things the owner reported were ONE bug**, and none was a permissions
or layout fault at heart:

- "information is temporarily unavailable"
- "screen not in your menu" on **every** route
- "no button to go to the dashboard"

A cold API made `currentViewer` return null, and three different screens each
turned that single transport failure into a confident, wrong, user-facing claim.

**A transport failure is not an authorization fact.** The retry shipped in
`14642ac` makes it rare; LIST 1 item 2 is the fix that makes it correct.

And the owner's framing, which is right and should be kept:
**if it does not work for the user, it is down to the user.** "It is only a cold
start" is an explanation, not a defence.
