# Next session — start here

**Rewritten 2026-08-08 at session close. Tip `c2f7ec1` on `master`, pushed.**
**1,193 passed / 0 failed / 1 skipped** across the monorepo (17/17 test tasks,
17/17 typecheck). Nav audit **0 gaps**, menu audit **0 dead ends**.

Owner policy: **five slices + issue resolution every session. Never the
scheduler. Codex and the Supervisor only — no Stitch, no Google ADK.**

▶ **FIRST COMMAND:** `bash scripts/start-session.sh`

---

# ═══ 🔴 ONE OWNER-ONLY ACTION BLOCKS EVERYTHING BELOW ═══

Migrations **061, 062, 063, 064, 066 are LOCAL ONLY.** The assistant is
classifier-blocked on the apply dispatch and has been for several sessions —
this is not a thing to re-attempt, it is a thing to hand over.

```
! C:\Users\USER\bin\gh.exe workflow run apply-migrations.yml -f confirm=APPLY --repo marc667us/autoworkshop-ai
```

**Then, IN THIS ORDER** — and note `-f confirm=APPLY` on every one, or the
deploy steps skip and the run still reports SUCCESS:

```
! C:\Users\USER\bin\gh.exe workflow run deploy-api.yml -f confirm=APPLY --repo marc667us/autoworkshop-ai
! C:\Users\USER\bin\gh.exe workflow run deploy-customer-web.yml -f confirm=APPLY --repo marc667us/autoworkshop-ai
! C:\Users\USER\bin\gh.exe workflow run live-suite.yml --repo marc667us/autoworkshop-ai
```

`Release` (push to master) already deploys workshop-web. **Report the live
suite as three numbers — passed / failed / SKIPPED.**

⚠️ **DO NOT deploy the API before the migrations are applied.** The new routes
read `agents.proposals` and `crm.leads`; without 064 they 500.

---

# ═══ WHAT SHIPPED 2026-08-08 ═══

## 🔴 The customer role could not exist in production

`identity.memberships` had two writers — `register_workshop` (workshop_owner)
and the admin-only `grant()`. Neither produces a `customer`. Every customer
route is behind `TenantGuard`, which throws `user holds no active membership`.
A real Keycloak sign-up therefore succeeded and got **401 on everything**:
empty garage, request form posting into a wall. Reported by the owner as
"can't sign in / wrong page after login", which is what it looks like.

**It survived every test because `seed-dev-identity.sh` INSERTs that membership
with raw SQL.** The 2026-08-07 end-to-end proof ran against a fixture no
production code path can create. Ask of any green proof: *could the product
have produced this fixture?*

- **061** `identity.enrol_as_customer` + `POST /registration/customer`.
  Rehearsed **8/8 under Render's privilege shape** (`rehearse/061_*.sql`).
  🔴 That rehearsal caught two bugs a local test never would: the
  `RETURNS TABLE` names made `ON CONFLICT` ambiguous **at runtime** while
  `CREATE FUNCTION` reported success; and the first draft used the raw
  `app.bootstrap` setting instead of `in_registration_bootstrap()`, reopening
  the hole migration 038 exists to close.
- **063** one customer record per person per workshop.
- ⚠️ Enrolment does **not** claim an existing walk-in record by email —
  `verifyEmail` is off on the live realm, so email is not proof of ownership.
  Revisit when R1's MX record lands.

## 🔴 Six leaks closed, because "a customer" now means "any stranger"

Each verified red-without-fix: `finance/revenue` · `media` GET **and** DELETE
link · `supplier-requests` (059 had `<> 'customer'` on INSERT/UPDATE but not
SELECT) · `pricing` · `settings` service-categories + opening-hours (draft
catalogue **with indicative prices**) · `directory` (private office phone).

## 🔴 A phantom role, in seven lists

`quality_controller` does not exist — it is `quality_control_inspector`. It
failed CLOSED, so quality inspectors were silently refused everywhere and
nothing said so. `authz/role-vocabulary.spec.ts` now SCANS THE SOURCE, so the
next invented name fails instead of locking somebody out.

## The agent layer — 064, ADR-019, `services/agent-host`

Triage receives each service request and proposes priority, fault category, a
summary and a technician **with the reason**; two scraping agents propose
suppliers/parts and sales leads. **An agent proposes; a human decides.** Every
proposal is Class C, and **nothing contacts a lead, ever** — `crm.leads` has no
outbound path by design.

- **No Google ADK** (owner instruction + ADR-018). Skills are pure functions, so
  Phase 8 wraps them in `FunctionTool` rather than rewriting.
- Agent host holds **no DB credential** — asserted by a test that no driver is
  importable, not promised in prose.
- Runs fine with **no agent host at all** (`UnconfiguredAgentHost`).

🔴 **LEAD DISCOVERY WAS INERT AND EVERY SUITE WAS GREEN.** Python returns
snake_case; the client declared camelCase *and fields the host never sends*.
Every lead was discarded and the route blamed the page. Supplier discovery was
quieter and worse — it succeeded while dropping every source link, so proposals
would have carried scraped prices with nothing to check them against. Found by
the **Supervisor**, not by either suite: each asserted its own convention
against itself and **nothing asserted the two ever met**.
▶ `agent-host.contract.spec.ts` pins the real wire shape.

## 🔴 Keycloak "still says server is starting" — 136.2s, measured

`keep-warm` ran `8-17 * * 1-5` — **weekdays only** — and the owner tested on a
**Saturday**. Last delivered run: Friday 18:32. Now all seven days:
**~304 h/month** of the shared 750, up from ~217.
⚠️ **If the account is ever hour-suspended again, put `1-5` back first** — a
one-character revert worth ~87 h.
⚠️ The `cancelled` runs in the history are NORMAL (one pending run per
concurrency group). Do not "fix" them with `cancel-in-progress: true`.

## Navigation

The agent screens went into **existing §34 groups** (`customer-reception/leads`,
`parts-and-supply/discovery`). A twelfth "Sales" group was tried first and the
spec test caught it; the allowlist that would have waived the rule was removed
rather than kept. The API gate was **narrowed** to owner/manager/admin instead
of widening five menus — `AGENT_OPERATOR_ROLES` throws at import if it ever
names a role that does not exist.

---

# ═══ OUTSTANDING ═══

## A. Claude can do these now
| # | Item |
|---|---|
| A1 | 🔴 **Playwright — STILL not run since 2026-07-29.** Deferred again. Largest unmeasured surface. Baseline 138 passed / 2 skipped; **read the COUNT, never the exit code**. |
| A2 | **`GET /leads` endpoint is owed.** The Leads screen reads lead candidates out of proposal payloads instead. Works, but the applied `crm.leads` rows have no list view. |
| A3 | **Drive the customer flow end to end on LIVE** once migrations land: enrol → request → triage proposal → convert → assign → start. Never done on live. |
| A4 | **I11** — 057's `knowledge.diagnostic_trees` + `learning.course_materials` applied and EMPTY. |
| A5 | Root **`.dockerignore`** — 3 Dockerfiles do `COPY . .`. |
| A6 | The other five 045 tables still have role-free `org_select` — defence-in-depth, own migration, own evidence. |
| A7 | Migration number **065 is unused** (skipped during parallel work). Harmless; do not renumber an applied file. |

## B. Blocked on R1 (the one MX record) — unchanged
`I1` 060 local-only · `I2` drain cron off · `I3` password reset dead end ·
`I4` email verification off · `I12` on live · Solar Brevo→Resend.

## C. Owner only
`C1` 🔴 **R1 — MX record**, host `send`, `feedback-smtp.us-east-1.amazonses.com`,
pri 10. **Note: the SPF TXT is now live; only the MX is missing.**
`C2` 🔴 live Keycloak password in PUBLIC git history — rotation is the only fix.
`C3` `RENDER_API_KEY` unrotated since 2026-07-27.
`C4` Resend keys in plain text in `Documents\autoworkshop app\send 33/44.txt`.
`C5` **ScrapeGraph API key** was pasted into a chat transcript 2026-08-08. Not in
git (`.env` is ignored, gitleaks scans history). Rotate when convenient.

---

# ═══ TRAPS ═══

1. 🔴 **A FIXTURE THE PRODUCT CANNOT PRODUCE PROVES NOTHING.** The whole customer
   funnel was "proven" against a seed script's raw INSERT.
2. 🔴 **TWO SERVICES CAN EACH BE GREEN AND STILL NOT MEET.** Contract-test the
   wire shape, not each side's own convention.
3. 🔴 **A LOCAL RLS TEST PROVES NOTHING** — the definer owner bypasses RLS here
   and does not on Render. Rehearse.
4. 🔴 **`-f confirm=APPLY`** or deploys skip every step and report SUCCESS.
5. 🔴 **Check Codex produced FINDINGS, not its exit code.** Its first run here hit
   sandbox blocks on 15 file reads and produced nothing. Inline the context.
6. 🔴 **A misspelled role name reads as a policy statement** and fails closed.
7. **The full API suite flakes under DB contention** (timeouts, ~20 skips) when
   something else is hitting Postgres. Re-run clean before believing a failure.
8. **`Release` deploys workshop-web ONLY.**
