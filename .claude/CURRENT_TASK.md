# Current task

**Written 2026-08-06 at session close.**

## ▶ FIRST COMMAND OF THE SESSION — not a document, a script

```bash
bash scripts/start-session.sh
```

Then **`.claude/NEXT_SESSION_SCHEDULE.md`** — LIST A, then LIST B.
Measure with `node scripts/audit-menu-coverage.mjs` before trusting any number.

### 🔴 HARD POLICY — owner
**Five slices plus issue resolution every session. Never use the scheduler.**
**Codex and the Supervisor only — no Google ADK, no Stitch.**

---

## WHERE THINGS STAND

**221 of 242 working** — workshop-web 191, customer-web 27.
22 signposted: 14 technician, 8 customer.

**Customer §33 went 60% -> 77%** this session. Technician §49 unchanged at 67%.

## ⚠️ LAST SESSION DELIVERED ONE SLICE OF FIVE

Slice 12 landed; 13-16 did not. The session went deep on LIST A instead —
A2 (the slice itself), A3 and A5 are closed — and turned up a severity-1
finding. Said plainly rather than by redefining a slice as smaller.

## ✅ FULLY DEPLOYED AND VERIFIED ON PRODUCTION

All three links ran. Measured on `https://autoworkshop-api.onrender.com/api/v1`:

    my/invoices  my/payments  my/receipts
    my/quotations  my/warranty  my/warranty-claims     ALL 401   <- slice 12 IS SERVING
    users  memberships  appointments
    walk-ins  customer-feedback                        ALL 401   <- A5 gates live
    my/nope                                                 404   <- control

apex 200 · 53 migrations applied / 0 pending · Release green · `Deploy API`
green (`31110193262`).

🔴 **401, NOT 404, IS THE PROOF.** A route that 404s while typecheck, lint,
build and CI are all green is the exact shape of the slice-11 defect. Probe the
running thing after every deploy.

⚠️ **RUNNER SATURATION LOOKS LIKE A BROKEN WORKFLOW.** The first `Deploy API`
dispatch sat QUEUED for 15+ minutes and `gh run cancel` returned HTTP 500 on
every attempt. Nothing was wrong with the workflow — CI, Security CI, Release,
rehearse and apply-migrations had been dispatched at once and used up the
runner concurrency. A fresh dispatch once they drained picked up a runner in
21 seconds. **Run `31108990642` is still wedged in `queued` and can be ignored.**

⚠️ **`gh workflow run` returned HTTP 500 AND THE RUN STARTED ANYWAY.** Check
the run list before re-dispatching, or you deploy twice.

## ▶ THE FIRST THING TO DO

**LIST A · A2 — the tenant-isolation suite.** It is listed second in the file
and should be done FIRST, because it is the thing that would have caught A1 and
it is what gives A1 its proof.

**Then A1: `docs/11-devops/RLS_ORG_PREDICATE_GAP.md`.** ~100 RLS policies
across migrations 001-044 carry a tenant predicate and NO organisation
predicate, while a tenant here holds more than one organisation. It is a
missing second line of defence, not an open door — the app layer does filter by
organisation nearly everywhere. **Do not apply it blind**; the three paths it
would break are named in that document.

## 🔴 THE LESSON THAT PAID FOR ITSELF THIS SESSION

**Read the schema before writing the query.** Three defects were caught before
they ever ran, by checking `information_schema` rather than trusting a
plausible name: `warranty.next_claim_number()` does not exist and would have
500'd on the first claim; `claim_events` has `decided_at`, not `created_at`.
And a fourth by reading an existing service: my draft refused a claim on an
expired warranty, contradicting a decision migration 043 had already made and
explained.

**And: a customer is a car owner who brings a vehicle in — never staff.**
The owner's own words this session. `assertWorkshopStaff` refuses them, `/my/*`
serves them their own rows, and a method needs exactly one of the two.
