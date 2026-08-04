# My completion plan — customer, technician and workshop

**Author: Claude (assistant). Written 2026-08-05. This is the plan I am
accountable for.** Every row carries a command the owner can run to check
whether I did what I said. If the number in the "after" column is not what the
command prints, I did not deliver the slice — regardless of what I claimed.

Scope: `workshop-web` (technician §49 + owner §46 + manager §47 + reception §48
+ default §34) and `customer-web` (§33). The other four apps — supplier, fleet,
insurance, towing, admin — are **out of scope for this plan**.

---

## 1. The baseline I am measuring against

Run `node scripts/audit-menu-coverage.mjs --all`. On 2026-08-05 it printed:

| Tree | Menu entries | Working | Signposted | Working share |
|---|---:|---:|---:|---:|
| TECHNICIAN §49 | 42 | 21 | 21 | 50% |
| MANAGER §47 | 36 | 15 | 21 | 42% |
| DEFAULT §34 | 56 | 20 | 36 | 36% |
| OWNER §46 | 64 | 22 | 42 | 34% |
| CUSTOMER §33 | 35 | 11 | 24 | 31% |
| RECEPTION §48 | 29 | 8 | 21 | 28% |

Counting each screen once (the trees overlap):

| Area | Distinct signposted screens |
|---|---:|
| Workshop trees (owner + manager + reception + default) | 104 |
| Customer §33 | 24 |
| Technician §49 | 21 |
| **Total to make real** | **149** |

Working screens today: **93** of **242** routes.

---

## 2. The plan — 12 slices, 149 screens, every screen assigned exactly once

| # | Slice | Screens | Sessions | Working after | Depends on |
|---:|---|---:|---:|---:|---|
| 0 | **Re-mounts** — the backend already exists; the screen is only missing at that route | 16 | 1 | **109** | — |
| 1 | **Evidence upload** — MinIO, `media.assets`, signed URLs | 2 | 1 | **111** | — |
| 2 | **Reception: intake, appointments, requests, calendar** | 17 | 2 | **128** | 1 |
| 3 | **Invoicing & payments** | 16 | 3 | **144** | — |
| 4 | **Parts, stock & procurement** | 20 | 3 | **164** | — |
| 5 | **Warranty** | 5 | 1 | **169** | 3 |
| 6 | **Settings & workshop admin** | 15 | 2 | **184** | — |
| 7 | **Messaging (text + files)** | 11 | 2 | **195** | 1 |
| 8 | **Reports** | 13 | 2 | **208** | 2, 3, 4 |
| 9 | **Customer self-service tail** | 6 | 1 | **214** | 7 |
| 10 | **Knowledge, technical tools & learning** | 21 | 3 | **235** | — |
| 11 | **Voice, video & specialist consultations** | 7 | 3 | **242** | 7 |
| | **Total** | **149** | **24** | **242 / 242** | |

**242 of 242 is the finish line.** Every menu entry in all six trees is a real
screen with a real endpoint behind it.

---

## 3. What each slice actually builds, and how you check it

### Slice 0 — Re-mounts · 16 screens · 1 session

No new backend at all. These 16 routes signpost a screen that **already works**
at a different path, because the same capability sits under a different name in
each role tree.

| Signposted route | Already-working screen it becomes |
|---|---|
| `/requests/repair-request-inbox`, `/requests-and-reception/repair-request-inbox` | `/workshop-operations/repair-requests` |
| `/requests/customer-complaint-inbox`, `/requests-and-reception/customer-complaint-inbox`, `/customer-reception/new-complaints` | `/workshop-operations/customer-complaints` |
| `/home/approvals`, `/home/tasks-and-approvals`, `/solution-and-approval/approvals` | `/customer-approval/pending-approvals` |
| `/customer-approval/modification-requests` | `/repair-control/variations` |
| `/solution-and-approval/solution-studio` | `/solution-and-approval/customer-proposals` |
| `/customers-and-vehicles/repair-history`, `/vehicles/vehicle-history` | vehicle detail + `job_card_stage_events` |
| `/workshop-floor/technicians`, `/workshop-management/roles-and-permissions` | `/workshop-management/staff` |
| `/knowledge-and-staff/competencies`, `/knowledge-and-staff/technician-competencies` | `/workshop-management/staff` (role view) |

> **Check:** `node scripts/audit-menu-coverage.mjs --all` → workshop-web working
> rises 79 → 95. And `node apps/e2e/verify/verify-workshop-menu-reachable.mjs`
> stays 0 failures.

### Slice 1 — Evidence upload · 2 screens · 1 session

`media.assets` + `media.links`, `POST /evidence/upload-url` (pre-signed MinIO
PUT), virus-scan hook stubbed, `storage_key` wired into `execution_evidence`.
Small in screens, but slices 2 and 7 both need it — that is why it is second.

> **Check:** upload a photo on `/vehicle-intake/condition-inspection`, reload,
> see it. `select count(*) from media.assets;` > 0.

### Slice 2 — Reception · 17 screens · 2 sessions

New: `reception.appointments`, `vehicle_intakes`, `intake_checks`, `walk_ins`.
Completes the **front** of the workflow — today a job card cannot be opened by
the person who actually greets the customer.

Covers vehicle intake ×4, appointments ×4, workshop calendar, `/home/calendar`,
service bays ×2, customer feedback, `/requests/walk-in-requests`,
`/workshop-operations/vehicle-intake`, `/customer-reception/*`.

> **Check:** `node apps/e2e/verify/verify-reception-workflow.mjs` — book an
> appointment, receive the vehicle, raise the job card, all as `reception_staff`.

### Slice 3 — Invoicing & payments · 16 screens · 3 sessions

New: `finance.invoices`, `invoice_lines`, `payments`, `receipts`, `refunds`,
`credit_notes`. **Append-only** (CLAUDE.md). Built on `repair.quotations`.

Completes the **back** of the workflow. Today a job reaches QC and stops: there
is no invoice, so no job can be closed for money. This is the highest business
value in the plan.

Still **no in-app card payment** — payment is recorded, not taken (ADR-012, zero
cost). That stays true and the screens keep saying so.

> **Check:** `node apps/e2e/verify/verify-invoice-lifecycle.mjs` — quotation →
> invoice → payment → receipt, and an attempt to edit a settled invoice is
> refused.

### Slice 4 — Parts, stock & procurement · 20 screens · 3 sessions

New: `parts.stock_items`, `stock_movements`, `reservations`,
`purchase_requisitions`, `purchase_orders`, `goods_receipts`. Built on
`catalogue.*` and `execution_parts_used`.

Biggest single slice by screens. Also unblocks the technician's `plan-work`
screens — find parts, parts compatibility, tool and equipment reservation.

> **Check:** `node apps/e2e/verify/verify-parts-lifecycle.mjs` — reserve stock
> against a job, consume it, watch the on-hand figure fall, receive a PO.

### Slice 5 — Warranty · 5 screens · 1 session

`warranty.policies`, `claims`, `claim_events`. Small once invoices exist.

> **Check:** raise a claim against a completed job; it appears for both the
> workshop and the customer.

### Slice 6 — Settings & workshop admin · 15 screens · 2 sessions

`core.service_bays`, `service_categories`, `opening_hours`, `approval_limits`,
`templates`, `notification_prefs`, `workflow_rules`, plus branches.
Independent of everything else — this is what lets an owner configure the
workshop instead of living with defaults.

> **Check:** change opening hours; they appear on the public landing's workshop
> profile.

### Slice 7 — Messaging · 11 screens · 2 sessions

`comms.threads`, `messages`, `participants`, `read_receipts`, with attachments
from slice 1. Text and files only — calls are slice 11.

> **Check:** a customer messages the workshop about their job; it lands on the
> workshop side against the same job card, and the unread badge is real rather
> than the hardcoded counter in the layout today.

### Slice 8 — Reports · 13 screens · 2 sessions

No new domain tables — read-only aggregates over slices 2, 3, 4 and the repair
spine, plus `reports.saved_views`.

**Deliberately after the data exists.** A report over empty tables is exactly
the "disconnected mock page" `05.txt` §2 forbids.

> **Check:** the job-progress report agrees with the staging board for the same
> day. If the two disagree, the report is wrong.

### Slice 9 — Customer self-service tail · 6 screens · 1 session

`core.vehicle_documents`, `maintenance_schedules`, `authorized_drivers`,
`support.cases`. Raises customer §33 from 31% to near-complete.

> **Check:** customer-web working rises to 32 of 35.

### Slice 10 — Knowledge, technical tools & learning · 21 screens · 3 sessions

`knowledge.articles`, `fault_codes`, `procedures`, `diagrams`,
`learning.courses`, `certifications`. Fed by `repair.diagnoses`, so it gets
better the later it is built — which is why it is late rather than dropped.

⚠️ Licensed content (OEM wiring diagrams, vehicle-specific 3D) stays staged per
CLAUDE.md §4. The **library** is built; the licensed corpus accumulates.

> **Check:** a confirmed diagnosis recorded in slice 2–4 appears in the fault
> knowledge base search.

### Slice 11 — Voice, video & specialist consultations · 7 screens · 3 sessions

`comms.calls`, `call_events`, WebRTC over the coturn already in the compose
file. Largest, least certain, lowest value per screen. Last on purpose.

⚠️ This is the one slice that may need another Render service — see risk 3.

---

## 4. What I will deliver on every slice, without exception

If any row is missing, the slice is not done and I should say so rather than
report a screen count.

| # | Item |
|---|---|
| 1 | Migration, forward **and** rollback tested; `TEXT` not `VARCHAR(n)`; payments/warranty/approvals append-only |
| 2 | RLS `ENABLE` **and** `FORCE`, policies **per command** — not `FOR ALL` with a bare `USING` |
| 3 | Indexes on `(tenant_id)`, `(tenant_id, status)`, `(tenant_id, created_at DESC)` |
| 4 | Repository → Service → Controller. No business logic in a route handler |
| 5 | Role entries in `apps/api/src/authz/permission-matrix.ts` |
| 6 | Request/response validation at the boundary |
| 7 | Audit rows in `audit.events` for every write |
| 8 | Loading, empty, error **and** responsive states on every screen |
| 9 | Unit + integration + a **tenant-isolation negative test** (a second tenant is refused) |
| 10 | A browser check in `apps/e2e/verify/`, driven **as the role that owns the screen** |
| 11 | The route flips signposted → working in `audit-menu-coverage.mjs` |
| 12 | Its entry **deleted** from `planned-workshop.ts`, and `planned-workshop.spec.ts` still green |
| 13 | Codex, then Supervisor `/code-review` `/security-review` `/verify` |
| 14 | `IMPLEMENTATION_LOG.md`, `API_SPECIFICATION.md`, `DATABASE_DESIGN.md` updated |

**Item 12 is the anti-cheat rule.** A slice is not finished while its screen
still shows a "what you can do instead" panel. I cannot inflate the working
count without deleting the signpost, and the guard test fails if what remains
points anywhere unreachable.

---

## 5. What can stop me, and whose call it is

| # | Risk | Owner | Effect if unresolved |
|---|---|---|---|
| 1 | **Migrations 037 + 038 not applied to production** | **owner only** — `gh workflow run apply-migrations.yml -f confirm=APPLY` | I can build and prove every slice **locally**, and prove **none** of them on production. There is no workshop on live to attach a job card to. This blocks proof, not progress. |
| 2 | `realm-autoworkshop.json` has drifted from the live realm | me | Committed file puts the apex on the CUSTOMER client; production has it on the WORKSHOP client. Re-importing breaks sign-in and sign-up on the apex. I fix this in slice 0. |
| 3 | Four free Render services share one 750 h/month allowance | owner decision | Slices 0–10 add no service. **Slice 11 (WebRTC) probably needs one.** No paid remedy will be proposed (ADR-012); if it cannot fit, slice 11 stays local-only and I will say so rather than quietly skip it. |
| 4 | Keycloak cold start 115–147 s | — | Not an outage. Warm before any live check. |
| 5 | `RENDER_API_KEY` unrotated since the 2026-07-27 leak | owner | Treat as compromised. |
| 6 | Repo-wide RLS org-scoping incomplete (D2) | me | Every new table above ships `FORCE` in its first migration. I will not retrofit. |

---

## 6. What this plan will not quietly do

- **No paid dependency.** Every capability has a FOSS path already running in
  the compose file: Postgres, MinIO, Redis, NATS, coturn.
- **No scope cuts.** Slice 11 is sequenced last, not dropped.
- **No mock pages.** Slice 8 is deliberately late so reports have real data.
- **No counting signposts as progress.** This plan is measured only by the
  **working** column of `audit-menu-coverage.mjs`.
