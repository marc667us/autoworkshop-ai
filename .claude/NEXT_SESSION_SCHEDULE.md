# Commencement task — next session

**Written 2026-08-05 at session close. Git tip `fbdb5fc` on `master`, pushed,
tree clean. Release / CI / Security CI green. No dev servers running.**

Read `.claude/CURRENT_TASK.md` first, then this.

## 🔴 THE POLICY THIS SCHEDULE SERVES

Owner, 2026-08-05: **five slices plus issue resolution every session. Never use
the scheduler — the owner runs their own schedule.**

So a session is **two tracks, not one**. Part A clears open issues, Part B
delivers five slices. Part A first: every item in it is either a live risk or
something that will silently corrupt a later measurement.

---

# PART A — ISSUE RESOLUTION (do these first)

Ranked by risk × cost. A1–A3 are cheap and de-risk everything after them.

| # | Issue | Why now | Size |
|---|---|---|---|
| **A1** | 🔴 **`realm-autoworkshop.json` has DRIFTED from production.** The committed file registers the apex on the **customer** client; the live realm has it on the **workshop** client. Proven 2026-08-05 by driving `/protocol/openid-connect/auth` and `/registrations` (both 302) and by the live sign-in URL carrying `client_id=autoworkshop-workshop-web`. **Re-importing that file breaks sign-in AND sign-up on the apex.** | A loaded gun in the repo. Anybody re-provisioning Keycloak from source takes production down and nothing warns them. | SMALL |
| **A2** | **T-0044 may already be FIXED — verify and close it, or re-open with evidence.** It records 51px of horizontal scroll at 768px on every page. On 2026-08-05 a sweep measured **0px at 1440/1280/1024/768/390** on `/home/dashboard` after the shell design pass. | A stale 🔴 trains people to skip the register. Measure the three routes the ticket named — `/home/dashboard`, `/customers/customer-search`, `/workshop-floor/job-cards` — and **wait past hydration** before believing the number. | SMALL |
| **A3** | **D4 — `check-page-gates.sh` is RED with 19 pre-existing FALSE failures** (a `const ROUTE` indirection, and customer-web's `(app)` route groups read as path segments). | A Stage-0 guardrail that cries wolf 19 times is one nobody reads, and 121 new pages have landed since it last told the truth. **Fix it or delete it** — leaving it in between is the one option the plan forbids. | SMALL |
| **A4** | **T-0006 — the full tenant-isolation suite.** RLS is proven as a non-superuser only inside `verify/037-039`. | **Now urgent, and 039 is the argument.** Production RLS has diverged from local twice, and nothing tests that systematically. Every Part B slice adds tables under FORCE RLS. | MED |
| **A5** | **`RENDER_API_KEY` unrotated** since the 2026-07-27 transcript leak. | Treat as compromised. It is the key every migration and diagnostic workflow uses. | SMALL (owner) |
| **A6** | **Playwright baseline not re-run since 2026-07-29** (138 passed / 2 skipped). 121 pages have landed since. | **Read the COUNT, never the exit code** — this suite silently ran ZERO tests for two days. | SMALL |
| **A7** | **D5 — a finding's `recorded_by` is re-stamped on edit**, so the original recorder survives only in the audit trail. | Correctness, and it touches the diagnosis records slice 2 builds on. | SMALL |
| **A8** | **D6 — permission denials are not audited anywhere**, though CLAUDE.md §16 lists them as an audit event. | Every Part B slice adds new denial paths. Fix the mechanism before multiplying the gaps. | SMALL |

## ⚠️ Correct the plan before starting Part B

`docs/00-project/COMPLETION_PLAN.md` says **slice 2 = 17 screens**. Five of them
(`create-job-card`, `receive-vehicle`, and the three `vehicle-intake` routes)
shipped on 2026-08-05, because the workshop had no way to open a job card at all.

**Slice 2 is 12 screens.** Edit the plan's table when you start; do not carry the
old number and do not count those five twice.

---

# PART B — FIVE SLICES

From `COMPLETION_PLAN.md` §2. Order is dependency-driven, not preference.

| # | Slice | Screens | Depends on | Working after |
|---|---|---:|---|---:|
| 1 | **Evidence upload** — `media.assets`, `media.links`, MinIO signed URLs | 2 | — | 116 |
| 2 | **Reception** — appointments, intake checks, walk-ins, calendar, service bays | 12 | 1 | 128 |
| 3 | **Invoicing & payments** — `finance.invoices/payments/receipts/refunds` | 16 | — | 144 |
| 4 | **Parts, stock & procurement** — `parts.stock_items/movements/reservations/POs` | 20 | — | 164 |
| 5 | **Warranty** — `warranty.policies/claims/claim_events` | 5 | 3 | 169 |

Baseline today: **114 of 242** (workshop-web 100, customer-web 14).
Confirm with `node scripts/audit-menu-coverage.mjs --all` **before** starting —
do not trust that number, verify it.

### Sequencing notes

- **Slice 1 is tiny and goes first anyway.** Slices 2 and 7 both need it, and
  doing it late means retrofitting evidence into screens already shipped.
- **Slices 3 and 4 do not depend on 1 or 2**, so if slice 2 runs long they are
  not blocked behind it.
- **Slice 5 needs slice 3.** A warranty claim with no invoice to claim against is
  a form with nowhere to write.

### Every slice must deliver

`COMPLETION_PLAN.md` §4, 14 items. The four most often skipped:

1. RLS `ENABLE` **and** `FORCE`, policies **per command** — not `FOR ALL` with a
   bare `USING`.
2. A **tenant-isolation negative test** (a second tenant is refused).
3. A browser check in `apps/e2e/verify/` driven **as the role that owns the
   screen**, not as whichever account is convenient.
4. The signpost entry **deleted** from `planned-workshop.ts`, with
   `planned-workshop.spec.ts` still green.

---

# HOW TO REPORT AT CLOSE

State, for each of the five slices, whether it **landed** — and if one did not,
say so and say why. Do not redefine a slice as smaller so the count comes out at
five. The plan's item 12 makes that mechanically detectable, and it is the
failure mode the whole plan exists to prevent.

Report the `audit-menu-coverage.mjs` figure, never a claim about it.

---

# THINGS THAT WILL COST A SESSION IF FORGOTTEN

1. **SECURITY DEFINER is not an RLS exemption.** The owner is not a superuser on
   Render and FORCE RLS binds owners. Migration 039 exists because 037 and 038
   both shipped green while the read path stayed broken.
2. **A LEFT JOIN turns "refused by RLS" into "has none"** — a permissions fault
   rendered as a fact about the user.
3. **Verify under production privileges or the verify is theatre.** Re-own the
   function to a THIRD non-superuser role, and refuse to run if the owner is a
   superuser or if owner and caller are the same role.
4. **Prove a guard by injecting the failure.** `planned-workshop.spec.ts` passed
   4/4 with the real defect re-injected.
5. **Route lists are PER-ROLE** (`jobCardListHrefFor`). Two checks reported
   product defects that were wrong-route-for-the-role.
6. **Wait past hydration before believing a layout number.**
7. **Check the command shape before concluding you are blocked** — `cd … && cmd`
   does not match a prefix permission rule.
8. **Warm Keycloak (115–147s) before any live check**, or it reports
   `error=Configuration` and reads as an outage.
9. **Cookies ignore the PORT** — a wrong workspace id works locally and fails
   only in production.
10. **Deploy via `Release`. NEVER `render-deploy.yml`.** Run `pnpm lint` first.
