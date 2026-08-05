# Commencement task — slices 6 to 11

**Written 2026-08-06 at session close. Git tip `b00d90c` on `master`, pushed,
tree clean. Release / CI / Security CI green. No dev servers running.**

Read `.claude/CURRENT_TASK.md` first, then this.

## 🔴 THE POLICY THIS SCHEDULE SERVES

Owner: **five slices plus issue resolution every session. Never use the
scheduler — the owner runs their own.** This document IS the schedule; nothing
is queued anywhere.

Owner, 2026-08-06: **slices 6 to 11 are the next session.**

---

# WHERE THE PRODUCT IS

**157 of 242 working** — workshop-web 143, customer-web 14. Slices 1–5 done and
on production; migrations 040–044 applied live.

**65 signposted routes remain: 41 in workshop-web, 24 in customer-web.**

⚠️ **RE-MEASURE BEFORE STARTING ANY SLICE.** Every slice size in
`COMPLETION_PLAN.md` was wrong when checked this session — 17→9, 16→12, 20→17,
5→2. The counts below were measured on 2026-08-06 with
`audit-menu-coverage.mjs`; re-run it, because slice work shifts the boundaries.

---

# PART A — ISSUE RESOLUTION (first, as always)

Ranked by risk × cost. A1–A3 are cheap and de-risk the slices after them.

| # | Issue | Why now | Size |
|---|---|---|---|
| **A1** | **Codex: the rehearsal's dollar-quote tracker can be fooled.** A migration containing `-- $$` in a comment, then `COMMIT;`, then `-- $$` leaves the COMMIT unstripped and the survivor scan ignores it — it could commit to production. | The rehearsal is now the gate every migration passes through. A hole in it is a hole in everything after it. | SMALL |
| **A2** | **Codex: "left no trace" reads only `schema_migrations`.** If a COMMIT escapes before any ledger row, schema changes persist and the check still passes. | Same reason. The proof is weaker than it reads. | SMALL |
| **A3** | **Codex: sequences are not rolled back.** Any rehearsal calling `nextval()` advances a live sequence despite the ROLLBACK. | Harmless today (no migration uses one) — document it or refuse them. | SMALL |
| **A4** | **T-0044 — never measured this session.** The ticket records 51px of horizontal scroll at 768px; a 2026-08-05 sweep measured 0px after the shell design pass. | A stale 🔴 trains people to skip the register. Measure `/home/dashboard`, `/customers/customer-search`, `/workshop-floor/job-cards` — **wait past hydration** before believing the number. | SMALL |
| **A5** | **Playwright baseline not re-run since 2026-07-29** (138 passed / 2 skipped). **~60 pages have landed since.** | **Read the COUNT, never the exit code** — this suite silently ran ZERO tests for two days. | SMALL |
| **A6** | **T-0006 tenant-isolation suite.** RLS is proven as a non-superuser only inside `verify/037-044`. | Five new schemas landed this session, all under FORCE RLS. Nothing tests isolation systematically. | MED |
| **A7** | **D5 — a finding's `recorded_by` is re-stamped on edit.** | Correctness; touches diagnosis records. | SMALL |
| **A8** | **D6 — permission denials are not audited**, though CLAUDE.md §16 lists them. | Every slice below adds denial paths. Fix the mechanism before multiplying the gaps. | SMALL |
| **A9** | `RENDER_API_KEY` unrotated since the 2026-07-27 leak. | Owner-only. | owner |

---

# PART B — SLICES 6 TO 11

Order is dependency-driven, not preference.

| # | Slice | Routes | Depends on | Working after |
|---|---|---:|---|---:|
| 6 | **Settings & workshop admin** | ~10 | — | ~167 |
| 7 | **Messaging (text + files)** | ~10 | slice 1 ✅ | ~177 |
| 9 | **Customer self-service tail** | 6 | slice 7 | ~183 |
| 10 | **Knowledge, tools & learning** | ~6 | — | ~189 |
| 8 | **Reports** | ~14 | slices 2,3,4 ✅ | ~203 |
| 11 | **Voice, video & consultations** | ~7 | slice 7 | ~210 |

⚠️ **8 IS SEQUENCED AFTER 6/7/9/10, NOT IN NUMBER ORDER.** Reports are read-only
aggregates over other slices' data, and `05.txt` §2 forbids "disconnected mock
pages". Slices 2–4 have only just filled those tables; building the reports last
means they report on something.

### Slice 6 — Settings & workshop admin (~10)
`core.opening_hours`, `service_categories`, `approval_limits`, `templates`,
`notification_prefs`, `workflow_rules`, plus branches. Independent of
everything — this is what lets an owner configure the workshop instead of living
with defaults.
> **Check:** change opening hours; they appear on the public landing's workshop
> profile.

### Slice 7 — Messaging (~10)
`comms.threads`, `messages`, `participants`, `read_receipts`. Text and files
only; calls are slice 11.
> 🔴 **`media.links` ALREADY CARRIES A `message` OWNER TYPE** — migration 040 was
> written for this. Attachments need no new mechanism, and `MediaService`
> currently answers *"attaching files to a message is not built yet"*, which is
> the thing this slice makes untrue.
> **Check:** a customer messages the workshop about their job; it lands on the
> workshop side against the same job card, and the unread badge stops being the
> hardcoded counter in the layout.

### Slice 9 — Customer self-service tail (6)
`core.vehicle_documents`, `maintenance_schedules`, `authorized_drivers`,
`support.cases`.
> 🔴 **THE ONLY SLICE THAT MOVES customer-web**, which has been stuck at **14 of
> 38** all session and is the weakest tree in the product at 31%. Every other
> slice this session moved workshop-web only.

### Slice 10 — Knowledge, technical tools & learning (~6)
`knowledge.articles`, `fault_codes`, `procedures`, `diagrams`,
`learning.courses`, `certifications`.
> ⚠️ Licensed content (OEM wiring diagrams, vehicle-specific 3D) stays STAGED per
> CLAUDE.md §4. The **library** is built; the corpus accumulates from real jobs.

### Slice 8 — Reports (~14)
No new domain tables — read-only aggregates over slices 2/3/4 plus
`reports.saved_views`.
> **Check:** the job-progress report agrees with the staging board for the same
> day. If they disagree, the report is wrong.
> ⚠️ `/finance/workshop-revenue` already exists (slice 3) and counts payments
> RECEIVED net of refunds, never invoices issued. Any financial report added here
> must agree with it or explain why.

### Slice 11 — Voice, video & consultations (~7)
`comms.calls`, `call_events`, WebRTC over the coturn already in the compose file.
> ⚠️ **THE ONE SLICE THAT MAY NEED ANOTHER RENDER SERVICE.** Four free services
> already share one 750h/month allowance. **No paid remedy is to be proposed**
> (ADR-012). If it cannot fit, it stays local-only and that gets SAID — not
> quietly skipped.

---

# EVERY SLICE MUST DELIVER

`COMPLETION_PLAN.md` §4, 14 items. The five most often skipped:

1. RLS `ENABLE` **and** `FORCE`, policies **per command**.
2. A **tenant-isolation negative test**.
3. A verify that **builds its own tenant** (copy `verify/042` or `verify/044`) and
   **asserts the EFFECT, not the mechanism**.
4. **Rehearse on live before applying** — `rehearse-migration.yml`.
5. The signpost **deleted** from `planned-workshop.ts`, `planned-workshop.spec.ts`
   still green.

# HOW TO REPORT AT CLOSE

State for each slice whether it **landed**, and if one did not, say so and why.
Report the `audit-menu-coverage.mjs` figure, never a claim about it. Do not
redefine a slice as smaller so the count comes out right — the plan's item 12
makes that mechanically detectable.

# THINGS THAT WILL COST A SESSION IF FORGOTTEN

1. **THE DEPLOY CHAIN HAS THREE LINKS**: schema (`apply-migrations.yml`), API
   (`deploy-api.yml`), web (`Release`). **Green CI proves none of them.** Slice 2
   shipped green and every endpoint 404'd for an hour.
2. **A fixture cannot discover a tenant** — `identity.tenants` is
   `USING (id = current_tenant_id())`.
3. **Assert the effect, not the mechanism** — a forbidden DELETE raises locally
   and silently matches zero rows live.
4. **Check what a commit CONTAINED**, not that it exited 0. An unanchored
   `media/` in `.gitignore` ate a whole NestJS module.
5. **Check the working directory** — a `cd` from an earlier command wrote 12
   pages into `apps/api/apps/workshop-web/`.
6. **Grep the controller before believing an endpoint exists.**
7. **Warm Keycloak (115–147s)** before any live sign-in check.
8. **Cookies ignore the PORT** — a wrong workspace id works locally, fails live.
9. **Codex needs its prompt on STDIN** and dumps ~160KB of a model-list decode
   error to stderr before answering. Filter; do not read silence as failure.
