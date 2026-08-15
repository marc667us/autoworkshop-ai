# Relationships — what references what, and why some things deliberately do not

Written 2026-08-09 with migration **073**. Owner instruction,
standing since 2026-07-27: *use relationships in the databases and schemas* —
real foreign keys and real joins.

---

## 1. The rule: every reference is organisation-scoped

A tenant in this database holds **more than one organisation** (migration 054
exists because of that). So a reference scoped to `tenant_id` alone is not
scoped at all in the way that matters, and a reference scoped to nothing is
worse.

Every cross-table reference in the application schemas therefore looks like
this:

```sql
FOREIGN KEY (job_card_id, tenant_id, organization_id)
     REFERENCES repair.job_cards (id, tenant_id, organization_id)
```

Not `REFERENCES repair.job_cards(id)`.

### Why the single-column form is not good enough

**Referential integrity checks bypass row level security.** PostgreSQL
documents this (CREATE POLICY → Notes) and `FORCE ROW LEVEL SECURITY` does not
change it. So a single-column key accepts another workshop's id and no policy
is ever consulted.

This was measured, not argued. On 2026-08-09, as `autoworkshop_app`
(`rolsuper = f`, `rolbypassrls = f` — Render's exact privilege shape), inside a
rolled-back transaction, with organisation A's session context:

| | |
|---|---|
| Can A read B's job card? | **0 rows** — RLS working correctly |
| A writes a warranty citing B's job card | **INSERT 0 1** — accepted |

The warranty was attached to a job the workshop cannot see, and every join that
would display it is filtered by the same RLS that allowed the write. It renders
blank for ever.

Two migration comments (`043_warranty.sql:49`, `044_parts_stock.sql:119`) had
asserted that "RLS already answers reachability" and left the keys out on that
basis. **RLS answers reachability for reads. It says nothing about
references.** Those comments were wrong and 073 replaced the behaviour.

### The parent side

A composite key needs a unique index over exactly its referenced columns. These
parents publish `(id, tenant_id, organization_id)`:

`repair.job_cards` · `repair.quotations` · `repair.repair_plans` (054) ·
`finance.invoices` · `repair.quotation_lines` · `parts.goods_receipts` ·
`parts.purchase_orders` (073)

### ⚠️ This rule is the target, not yet the reality — see §8

An earlier draft of this page said 073 made **every** reference in the schema
organisation-scoped. **That was false.** Sixteen two-column `(x, tenant_id)`
keys predate 073 and remain. §8 names them.

---

## 2. The job card is the spine

Thirteen tables reference `repair.job_cards`. Before 073 not one of those links
was declared.

| Child | Column | ON DELETE | Why |
|---|---|---|---|
| `finance.invoices` | `job_card_id` | NO ACTION | Invoiced work cannot vanish under its invoice |
| `parts.purchase_requisitions` | `job_card_id` | SET NULL *(col)* | The requisition outlives the job as a procurement record |
| `parts.reservations` | `job_card_id` | CASCADE | A stock hold exists only for its job card |
| `parts.resource_bookings` | `job_card_id` | CASCADE | A bay/lift booking exists only for its job card |
| `parts.stock_movements` | `job_card_id` | NO ACTION | Append-only ledger; the on-hand figure is the sum of these rows |
| `parts.supplier_requests` | `job_card_id` | SET NULL *(col)* | Nullable — a workshop also restocks without a job |
| `reception.appointments` | `converted_job_card_id` | NO ACTION | See §4 — the CHECK ties status to the link |
| `reception.customer_feedback` | `job_card_id` | NO ACTION | Append-only; a customer's verdict is not rewritten |
| `reception.service_requests` | `converted_job_card_id` | NO ACTION | See §4 |
| `reception.vehicle_intakes` | `job_card_id` | SET NULL *(col)* | Optional link, freely updatable |
| `reception.walk_ins` | `converted_job_card_id` | NO ACTION | See §4 |
| `warranty.claims` | `remedial_job_card_id` | SET NULL *(col)* | The rework a claim produced; the claim predates and survives it |
| `warranty.policies` | `job_card_id` | NO ACTION | A promise cannot outlive the record of what was promised |

Five more links complete the set: `finance.invoices.quotation_id` →
`repair.quotations` · `finance.invoice_lines.quotation_line_id` →
`repair.quotation_lines` · `parts.stock_movements.goods_receipt_id` →
`parts.goods_receipts` · `parts.supplier_requests.converted_purchase_order_id`
→ `parts.purchase_orders` · `warranty.policies.invoice_id` →
`finance.invoices`.

**Eighteen keys in total.**

---

## 3. 🔴 `ON DELETE SET NULL` on a composite key MUST name its column

Unqualified, `SET NULL` nulls **every** referencing column — including
`tenant_id` and `organization_id`, which are NOT NULL on all of these tables.
An earlier draft of 073 shipped nine unqualified ones, and every one was a
refusal wearing the wrong name:

```
DELETE FROM repair.job_cards WHERE id = ...;
ERROR 23502: null value in column "tenant_id" of relation "walk_ins"
             violates not-null constraint
```

The correct form (PostgreSQL 15+, this server is 16.14):

```sql
ON DELETE SET NULL (job_card_id)
```

Codex found this after the first `verify/073` reported **9 of 9 passing** — it
exercised CASCADE and RESTRICT and never once ran a delete through a SET NULL
key. `verify/073` now asserts every key's full definition (child, parent,
ordered columns both sides, delete action, `confdelsetcols`, `convalidated`)
and runs a real SET NULL delete.

---

## 4. Where a CHECK constraint decides the delete action

`reception.appointments`, `reception.service_requests` and
`reception.walk_ins` each carry:

```sql
CHECK ((status = 'converted') = (converted_job_card_id IS NOT NULL))
```

Clearing the link while the row still says `converted` violates it, so SET NULL
fails no matter how it is written — and the constraint is right. Converting an
intake into a job card is a fact about what happened at the desk; the job card
is the *continuation* of that walk-in. **NO ACTION.**

Similarly, append-only children (`parts.stock_movements`,
`reception.customer_feedback`, `finance.invoices`, `finance.invoice_lines`)
reject the UPDATE that SET NULL performs, and would report an immutability
error in answer to a referential question. **NO ACTION.**

---

## 5. Deliberately NOT declared

Do not "fix" these in a future audit. `verify/073` checks 1 and 8 pin them.

| Column | Why not |
|---|---|
| `repair.repair_plan_tasks.assigned_technician_id` | 014: staff leave. RESTRICT blocks the leaver; CASCADE rewrites a settled plan. The service LEFT JOINs and tolerates an unresolvable id. |
| `repair.execution_time_entries.technician_id` | Same. Both are **historical records inside settled documents**. |
| `repair.job_cards.assigned_technician_id` | **Does** have a key, `ON DELETE SET NULL` — because it is a **live pointer** to who is on the job now. When they leave, the job should become unassigned. This is the distinction, not an inconsistency. |
| `agents.proposals.resource_id`, `comms.notifications.resource_id`, `media.links.owner_id`, `parts.resource_bookings.resource_id` | Polymorphic — the target table depends on a sibling discriminator. `resource_bookings` enforces its own with `assert_resource_exists`, which is stricter than a key (it pins the organisation). |
| `audit.events.*` | Append-only. An audit row must outlive what it describes. |

---

## 6. Indexes

An unindexed foreign key makes every parent delete a sequential scan of the
child table, while holding row locks — thirteen of them for one job card. It
also makes "show me everything attached to this job card", the workshop's main
question, thirteen sequential scans.

073 adds **twelve**. An earlier draft added seventeen; **five were duplicates**
of an existing index leading with `tenant_id` (or `organization_id`), which the
RI lookup matches by equality just as well. The audit that missed them only
inspected each index's *leading* column.

The twelve new indexes sit alongside the five pre-existing ones
(`idx_invoice_job_card`, `idx_reservation_job`, `idx_booking_org_job`,
`idx_movement_job`, `idx_intake_job_card`).

---

## 7. Checking it

```bash
bash infrastructure/migrations/run.sh                     # apply
docker exec -i aw-postgres psql -v ON_ERROR_STOP=1 -U autoworkshop -d autoworkshop \
  < infrastructure/migrations/verify/073_relationships.sql   # 8/8
```

To find relationship-shaped columns that have no relationship:

```sql
SELECT n.nspname||'.'||c.relname, a.attname
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid AND c.relkind = 'r'
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('agents','audit','catalogue','comms','core','crm','finance',
                    'identity','knowledge','learning','media','parts','reception',
                    'repair','support','warranty')
  AND a.attnum > 0 AND NOT a.attisdropped
  AND a.attname ~ '_id$' AND a.attname <> 'id'
  AND NOT EXISTS (SELECT 1 FROM pg_constraint k
                   WHERE k.conrelid = c.oid AND k.contype = 'f'
                     AND a.attnum = ANY (k.conkey))
ORDER BY 1, 2;
```

⚠️ `public` is **Keycloak's** schema in this database — exclude it, as above.
Everything it returns should appear in §5 or be a new gap.

---

## 8. ✅ CLOSED by migration 079 — the fourteen tenant-only keys

> **Status changed 2026-08-15.** This section was headed *"🔴 STILL OPEN"* from
> the day it was written until today, and it was **stale from 2026-08-11**, when
> `079_organisation_scoped_keys.sql` converted all fourteen. The staleness was
> not harmless: `.claude/CURRENT_PHASE.md` cited this section as outstanding
> work, so **the next session to trust the phase file would have rebuilt
> migration 079.** Directive §3 forbids restarting completed work, and a status
> heading that lags is how that rule gets broken. Re-measure before trusting any
> status line on this page.

**What was wrong.** 073 declared eighteen relationships that did not exist. It
did **not** convert the keys that already existed, and sixteen of those were
two-column `(x, tenant_id)`. Fourteen carried a cross-organisation hole:
**organisation A could attach a row to organisation B's parent inside the same
tenant**, and no policy was consulted, because RI bypasses RLS — even under
FORCE.

**What closed it.** `infrastructure/migrations/079_organisation_scoped_keys.sql`
(applied 2026-08-11) rebuilt all fourteen as three-column
`(x, tenant_id, organization_id)`. It also fixed a second defect found while
measuring: three of them were `ON DELETE SET NULL` on a composite key, which
nulls **every** key column including the NOT NULL `tenant_id`, so those deletes
RAISED instead of nulling. See §3 — a composite `SET NULL` must name its column.
`verify/079_organisation_scoped_keys.sql` passes 6/6, and its check 3 is a real
cross-organisation WRITE that must be refused, not a catalogue inspection.

### Verified, not assumed

A migration file proves intent, not state — 2026-08-14 produced a live case
where production's `register_workshop` differed from the repository's with
identical checksums. So §8's own diagnostic below was **run against a database**
on 2026-08-15:

```
two-column   FKs in these ten schemas ->  2
three-column FKs in these ten schemas -> 71
```

and the two that remain are named individually:

| Child | Constraint |
|---|---|
| `core.organization_profile` | `fk_profile_org_scope` |
| `repair.organization_pricing` | `fk_pricing_org_scope` |

which are exactly the pair recorded below as **correctly** two-column.

⚠️ **That reading is the LOCAL cluster.** Re-run the query against production
before treating "closed" as true everywhere — and run it inside another task's
database-firewall window, never as its own concurrent workflow.

<details>
<summary>The fourteen, as they were — kept for history</summary>

```sql
SELECT c.relnamespace::regnamespace||'.'||c.relname, k.conname,
       pg_get_constraintdef(k.oid)
FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
WHERE k.contype = 'f' AND array_length(k.conkey, 1) = 2
  AND c.relnamespace::regnamespace::text IN
      ('finance','parts','reception','repair','warranty','core','crm','comms','media','catalogue')
ORDER BY 1;
```

| Child | Constraint | Parent |
|---|---|---|
| `finance.credit_notes` | `fk_credit_invoice_scope` | `finance.invoices` |
| `finance.invoice_lines` | `fk_line_invoice_scope` | `finance.invoices` |
| `finance.payments` | `fk_payment_invoice_scope` | `finance.invoices` |
| `finance.receipts` | `fk_receipt_payment_scope` | `finance.payments` |
| `finance.refunds` | `fk_refund_payment_scope` | `finance.payments` |
| `media.links` | `fk_link_asset_scope` | `media.assets` |
| `parts.goods_receipts` | `fk_receipt_po_scope` | `parts.purchase_orders` |
| `parts.purchase_order_lines` | `fk_po_line_scope` | `parts.purchase_orders` |
| `parts.purchase_order_lines` | `fk_po_line_item_scope` | `parts.stock_items` |
| `parts.purchase_requisitions` | `fk_requisition_item_scope` | `parts.stock_items` |
| `parts.reservations` | `fk_reservation_item_scope` | `parts.stock_items` |
| `parts.stock_movements` | `fk_movement_item_scope` | `parts.stock_items` |
| `warranty.claim_events` | `fk_event_claim_scope` | `warranty.claims` |
| `warranty.claims` | `fk_claim_policy_scope` | `warranty.policies` |

</details>

**Two of the sixteen are correctly two-column and must not be "fixed":**
`core.organization_profile.fk_profile_org_scope` and
`repair.organization_pricing.fk_pricing_org_scope` reference
`identity.organizations(id, tenant_id)` — the parent *is* the organisation, so
there is no third column to add.

Upgrading the fourteen needed, per parent: a `(id, tenant_id, organization_id)`
unique index (`finance.invoices` and `parts.purchase_orders` already gained one
in 073), an orphan pre-check with the platform-admin escape from §7, and the
same delete-action review §3 and §4 describe. **079 did all three.**

⚠️ **The orphan pre-check is the part that repays re-reading.** A migration's own
orphan check was once inert under FORCE RLS — it saw 6 rows as the owner and 0
as the Render role, so it "passed" by reading nothing. Any such check needs
`set_config('app.current_role','admin',true)` **and** an assertion that the
escape is actually live. Local is superuser; Render is not, and local will never
tell you.

⚠️ Do not let the *existence* of this section stand in for the work. It was
written because 073's header claimed the job was finished when it was not, and
a reviewer caught it. It then spent four days claiming the opposite — that the
job was unfinished when it was done. **A status heading on this page has now
been wrong in both directions; verify against a database, not against the
heading.**
