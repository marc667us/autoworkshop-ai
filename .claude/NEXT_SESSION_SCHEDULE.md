# Next session — start here

**Rewritten 2026-08-08 at session close. Tip `c586e38` on `master`, pushed.**
All four services deployed on it. **Live suite 21 passed / 0 failed / 0 skipped.**
CI + Security CI + Release green. Migrations **6 applied / 59 skipped** on live.

Owner policy: five slices + issue resolution every session. Never the scheduler.
**Codex and the Supervisor only — no Stitch, no Google ADK.**

▶ **FIRST COMMAND:** `bash scripts/start-session.sh`

---

# ═══ 🔴 THE ONE THING STILL BROKEN — START HERE ═══

## The owner signs in and gets a customer page. Reported FOUR times.

**I diagnosed it wrong three times. Do not guess a fourth.**

▶ **ASK FOR THE URL BAR FIRST.** What the address bar says at the moment the
wrong page appears is the single fact that settles it, and I never got it. Three
rounds were spent on theories the data later refuted.

### Measured — do NOT re-derive
- `Diagnose identity RLS` (live, run twice): `marc667us@yahoo.com` holds
  **exactly ONE membership — `workshop_owner`** — and resolves through the same
  function `/me` calls. **Nothing is mis-resolving.** A stale cookie asking for
  `customer` would 401, because the account holds no customer membership.
- The apex IS workshop-web (serves `/customer-reception/service-requests`, does
  NOT serve `/marketplace`).
- **`/home/dashboard` on the apex renders the CORRECT workshop tree** — read
  from the live HTML. The dashboard is not the problem.
- The deployed apex carries exactly two sign-in links, both now correct:
  `/api/auth/signin?callbackUrl=%2Fhome%2Fdashboard`, and the customer funnel's
  one pointing at customer-web's OWN origin.

### The three wrong diagnoses (all real bugs; none was the symptom)
1. Role precedence by UUID (fixed 08-07)
2. `aw.activeRole` surviving sign-in (fixed, proven red/green with Playwright)
3. Sign-in returning to the landing (fixed)

### ⚠️ CHECK THIS BEFORE CHANGING ANYTHING
A mechanic card's **"Sign in to request service" goes to the customer app BY
DESIGN** — it is the customer funnel and its label says so. If that is what the
owner is clicking, there is no bug. The owner's way in is the **top-right Sign
in**.

### Next diagnostic step if it persists
Drive a real signed-in session against LIVE with Playwright. The identity config
(`apps/e2e/playwright.identity.config.ts`) already does a genuine Keycloak
login; point it at production with owner credentials in a GH secret. That is the
only thing left that observes what the owner actually sees.

---

# ═══ WHAT SHIPPED 2026-08-08 ═══

## 🔴 The `customer` role could not exist in production
Only `register_workshop` (workshop_owner) and the admin-only `grant()` ever
wrote memberships. Every customer route is behind `TenantGuard`, so a real
sign-up got 401 on everything.
🔴 **It survived every test because `seed-dev-identity.sh` INSERTs that
membership with raw SQL.** Ask of any green proof: *could the PRODUCT have
produced this fixture?*

- **061** `enrol_as_customer` + `POST /registration/customer` — rehearsed **8/8
  under Render's privilege shape**; that rehearsal caught a runtime-only
  `ON CONFLICT` ambiguity and a raw-`app.bootstrap` door that reopened
  migration 038's hole.
- **063** one customer record per person per workshop.
- 🔴 **The route had NO CALLER for hours** — deployed, gated, tested, 401ing on
  live, called by nothing. Now wired into `request-service-actions.ts` **on
  submit, not on render**.

## Six leaks closed (each red-without-fix)
`finance/revenue` · `media` GET **and DELETE link** · `supplier-requests`
(059 had the clause on INSERT/UPDATE, not SELECT) · `pricing` · `settings`
(draft catalogue **with prices**) · `directory` (private phone).

## A phantom role in seven lists
`quality_controller` does not exist — it is `quality_control_inspector`. Failed
CLOSED. `authz/role-vocabulary.spec.ts` now scans the source.

## The agent layer — 064, ADR-019, `services/agent-host`
Triage proposes priority/category/summary/technician; two scrapers propose
suppliers-parts and leads. **An agent proposes; a human decides.** No ADK. The
host holds no DB credential (asserted). Runs with no host configured at all.
`scrapegraph-ai` 2.1.6, **101/101** host tests.
⚠️ Ollama here is ~95–150s/generation, so triage falls back to `rules` locally.
🔴 **Lead discovery was INERT** — snake_case vs camelCase, both suites green.
`agent-host.contract.spec.ts` pins the wire shape now.

## Technician assignment — both halves
`convert()` dropped the technician; and `assigned_technician_id` was
**WRITE-ONCE** (no assign route existed at all). Added
`PATCH /job-cards/:id/assignment`.

## Proof that now exists
- `customer-value-chain.integration.spec.ts` — **35 passed**, real Postgres, two
  customers, every assertion as `autoworkshop_app`.
- **Playwright 138 passed / 2 skipped** + **identity journey 3 passed** (the
  identity config had NEVER run — `testIgnore` in the main config).
- Monorepo ~**1,193 passed / 0 failed / 1 skipped**.

---

# ═══ OUTSTANDING ═══

| # | Item |
|---|---|
| A1 | 🔴 **The sign-in symptom above.** |
| A2 | **`GET /leads` endpoint is owed** — the Leads screen reads candidates out of proposal payloads. |
| A3 | **Live checks are all ANONYMOUS.** 401 proves a route is deployed, not that the schema landed or that a signed-in user sees the right thing. A token-holding live check is the real gap. |
| A4 | **I11** — 057's `knowledge.diagnostic_trees` + `learning.course_materials` applied and EMPTY. |
| A5 | Root **`.dockerignore`**; migration **065 unused** (harmless, do not renumber). |
| A6 | The other five 045 tables still have role-free `org_select`. |
| B | **Blocked on R1 (the MX record):** I1 060-on-live, I2 drain cron, I3 password reset, I4 email verification, Solar Brevo→Resend. **SPF TXT is live; only the MX is missing.** |
| C | **Owner only:** R1 MX · KC password in PUBLIC git history · `RENDER_API_KEY` unrotated · Resend keys in plain text · **ScrapeGraph key pasted into a transcript 2026-08-08** (not in git; rotate when convenient). |

---

# ═══ TRAPS ═══

1. 🔴 **A FIXTURE THE PRODUCT CANNOT PRODUCE PROVES NOTHING.**
2. 🔴 **A ROUTE WITH NO CALLER IS NOT SHIPPED** — grep for the caller.
3. 🔴 **THE API COULD NOT BOOT** while tsc, 855 tests, lint and both nav audits
   were green — none start the DI container. Run the server.
4. 🔴 **TWO SERVICES CAN EACH BE GREEN AND NEVER MEET** — contract-test the wire.
5. 🔴 **A LOCAL RLS TEST PROVES NOTHING** — rehearse under Render's privileges.
6. 🔴 **AN ANONYMOUS PROBE OF ROLE-GATED ROUTES 404s BY DESIGN.** I wrote one
   that reported 60 false failures and deleted it.
7. 🔴 **NO DATABASE MUST BE A SKIP, NEVER A FAILURE** — my spec turned Release
   red for having no Postgres. Second instance.
8. 🔴 **Codex can produce ZERO findings and exit 0** — inline the context.
9. **`-f confirm=APPLY`** or deploys skip everything and report SUCCESS.
10. **`Release` deploys workshop-web ONLY.**
