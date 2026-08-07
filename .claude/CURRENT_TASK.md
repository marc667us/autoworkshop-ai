# Current task — resume here

**Written 2026-08-07 (pt2), after the deploy chain was driven end to end.**

## ▶ FIRST COMMAND OF THE SESSION

```bash
bash scripts/start-session.sh
```

### 🔴 HARD POLICY — owner
**Five slices plus issue resolution every session. Never use the scheduler.**
**Codex and the Supervisor only — NO Stitch.** Google ADK is permitted for
Phase 8 only (owner, 2026-08-07 — see the amendment in ADR-018); it is NOT to
be used for the customer value chain, which is deterministic services.

---

## ✅ WHAT IS ACTUALLY LIVE NOW (measured, not assumed)

The whole chain built on 2026-08-06/07 is **deployed**:

| Link | State |
|---|---|
| `apply-migrations` | **056, 057, 058, 059 applied.** 59 total, 0 pending |
| `deploy-api` | deployed; every new endpoint family answers **401, not 404** |
| `deploy-customer-web` | deployed; `/service-and-repairs/request-service` → **200** |
| `Release` (apex) | deployed; the landing carries the owner's button |

⚠️ **FOUR migrations were pending, not two.** 056 and 057 were recorded as
dispatched on 2026-08-06 and had never been applied — so `/plan-work/*` and
`/learning/*` had been deployed against tables that did not exist. Check the
LEDGER (`apply-migrations` with no `confirm`), never the note that says a
workflow was dispatched.

---

## ✅ THE FUNNEL — CLOSED AND MEASURED ON LIVE

🔴 **The Supervisor found the funnel dropped people ANONYMOUS onto the form.**
The apex and customer-web are DIFFERENT HOSTS with separate session cookies
(each app runs its own Auth.js instance), so a visitor signed in on the apex
arrived signed OUT — and the form rendered for them anyway, because `/vehicles`
401s and is swallowed into an empty garage, which looks exactly like a customer
with no cars. They typed the fault, pressed Send, and got "Your session has
ended" **with everything they had typed gone.**

Fixed and verified on live, anonymously:
- The form now **refuses before it is filled in** — 0 `<form>` elements, 0
  inputs, one "Sign in and continue" button.
- `callbackUrl` **keeps the chosen workshop**: measured
  `callbackUrl=%2Fservice-and-repairs%2Frequest-service%3Fworkshop%3Dabc-123`.
- Both landing variants now point at the form (signed out no longer goes to
  `/api/auth/register`, where it was byte-identical to "Create a free account"
  beside it while being gated on a value its own href never read).

⚠️ **Registration is still one click INSIDE Keycloak's login page**, not a
direct link from the landing. That is the accepted shape: it is one press to
the right place and nothing typed can be lost. If the owner wants sign-up to be
the first thing a stranger sees, that is a deliberate change, not a bug.

---

## ▶ THEN: THE CUSTOMER'S OWN THREE REQUESTS — still NONE verified

From `docs/00-project/CUSTOMER_VALUE_CHAIN.md`:
1. Sign in to **view AND add** complaints.
2. **Add / register their own vehicles** — self-service AND agent-driven.
3. **Repair status on every section and card**, not one status page.

⚠️ Customer §33 audits 35/35, but that is MENU COVERAGE — every entry has a
working page. It says nothing about whether these three exist. Check first.

▶ **The next real slice starts here.** The chain is deployed and the funnel
reaches the form; what has NOT been done is **driving it once end to end as a
real customer** — sign in, send a request, watch it arrive at reception, convert
it to a job card. Everything above is measured at the HTTP layer, which proves
the routes exist and refuse correctly. It does not prove a request can be sent.

⚠️ The Request for Service form still does NOT register the vehicle: the
customer describes the car in free text and reception creates the record on
conversion, because `VehicleService.create` needs a structured make id.
Self-service vehicle registration needs a make picker — its own slice.

---

## 🔴 TRAPS CONFIRMED AGAIN 2026-08-07

1. **RENDER CAN FAIL A DEPLOY FOR NO FAULT OF THE BUILD.** `Release`
   31190439026 spent 18 minutes in `update_in_progress` and ended
   `update_failed`; the container had logged `▲ Next.js 15.1.3 / Ready in 791ms`
   on `0.0.0.0:10000` and Render still reported *"Port scan timeout reached, no
   open ports detected"*. The identical image redeployed clean minutes later.
   ▶ **`Diagnose Render deploy`** (new) is how you tell that apart from a real
   failure: it prints the deploy's DURATION, the service EVENTS and the
   container's own LOG LINES. A deploy that dies in seconds could not pull its
   image; one that dies after minutes started a container that never became
   healthy. Those share only the word "failed".
2. 🔴 **A GREEN DEPLOY IS NOT A VISIBLE FEATURE.** The owner's button passed
   typecheck, lint, unit tests, a container smoke test and a Render deploy, and
   could not render for anyone: the variable it reads was set on neither the
   service nor the build. ▶ **Grep the LIVE HTML for the feature's own text.**
3. **`NEXT_PUBLIC_` is a BUILD-time inline**, not a runtime read. A server
   component wanting a deploy-time value must use a plain name — `API_BASE_URL`
   and now `CUSTOMER_WEB_URL` are named on exactly that reasoning.
4. 🔴 **`Release` deploys workshop-web ONLY**; customer-web needs
   `deploy-customer-web.yml` dispatched separately. The form route 404'd on live
   for a day because of this, and the new guard in `point-web-at-keycloak.yml`
   is what caught it.
5. A queued `apply-migrations` checks out master at RUN time.

## OPEN — needs the owner
- 🔴 **The owner's live password was committed to a PUBLIC repo** (`a0022ff`
  removed it from the file; **git history still carries it**). **Rotate it in
  Keycloak.** Removing it stopped the spread; only rotation ends it.
- **SMTP secrets on THIS repo**: `SMTP_HOST/PORT/USER/PASS/FROM` (Brevo free).
  Until then password reset is a dead end. Then run **Set Keycloak SMTP**.
- `RENDER_API_KEY` still unrotated since 2026-07-27.

## OPEN — Claude can do
- **Playwright has not run since 2026-07-29** — the largest unmeasured surface.
- 059's supplier-visibility checks **SKIP on live**: no `supplier_users` row
  exists to act as. Seed one and re-run the rehearsal.
- Honesty debts: `quotation` and `purchase_order` approval scopes are recorded,
  not enforced.
- 057's tables (`knowledge.diagnostic_trees`, `learning.course_materials`) are
  applied and EMPTY — they need an authoring screen or a seed. Ask which.
