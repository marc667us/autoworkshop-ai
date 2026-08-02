# Proposal — the navigation trees and the API disagree about who does what

**Date:** 2026-08-01
**Status:** ✅ **APPLIED** — Option A, owner-approved 2026-08-01. All seven gaps
closed; the audit script is now ENFORCING (exit 1 on any gap).

⚠️ **The first attempt introduced the mirror defect and Codex caught it.** The
two DEFAULT-tree entries were added UNGATED, but that tree is the fallback for
five roles and only `platform_administrator` among them holds
`CAN_CREATE_CUSTOMER` — so supervisors, storekeepers, QC inspectors and cashiers
were offered a menu item that could only ever be refused. That falsified the
"grants nothing new" claim this proposal was approved on. Both entries are now
gated on `organization.admin`, which among those five roles exactly one holds.
The audit was extended to catch the same class in future, and
`verify-nav-gaps-closed.mjs` asserts both directions: the blocked roles can now
reach each screen, and a supervisor is offered none of them.
**Audit script:** `scripts/audit-nav-coverage.mjs` (re-run it; do not trust this
document's numbers on their own)

---

## The one-line summary

**Seven times, a role is permitted by the API to do something and has no way to
reach it by clicking.** Three features are affected: creating a customer,
creating a vehicle, and setting pricing.

## How this was found

Not by design review — by tripping over it three times in one day while building
Slice D. Pricing, then quality control, then a question about adding customers.
Three accidents in a row is a pattern, so the third one was audited properly
instead of patched.

⚠️ **The first version of that audit was wrong and reported 21 gaps.** Its parser
matched the `[]` in `NavGroup[]` rather than the array literal, so every tree
measured as **zero routes** and every feature looked missing everywhere. The
corrected run reads 53 / 61 / 33 / 29 / 42 routes per tree. The number below is
from the corrected run, and the script is committed so it can be re-run rather
than believed.

## Root cause

Two facts combine:

**1. Four roles are mapped to a navigation tree that does not exist.**
`ROLE_TO_NAV` (`packages/next-shell/src/viewer-contract.ts`) maps eight roles to
nav ids, but `workshopRoleGroups` (`packages/navigation/src/workspaces.ts`)
defines only **four** trees — owner, manager, reception, technician. So:

| role | maps to nav id | tree that exists? | lands on |
|---|---|---|---|
| `workshop_supervisor` | `supervisor` | ✗ | DEFAULT §34 |
| `storekeeper` | `storekeeper` | ✗ | DEFAULT §34 |
| `quality_control_inspector` | `quality-control` | ✗ | DEFAULT §34 |
| `cashier` | `cashier` | ✗ | DEFAULT §34 |

That fallback is deliberate and documented ("Roles from §50 with no tree of their
own are deliberately absent"). It is not a bug. But it means **the DEFAULT tree
has to carry a route for everything those four roles may do**, and nothing
checks that it does.

**2. `platform_administrator` is not in `ROLE_TO_NAV` at all**, so it also lands
on the DEFAULT tree — and it is in the permitted set of almost every capability.

**Consequence:** every one of the **21 write capabilities** in the API spans
**2–5 different trees**. Not one is confined to a single tree. Every one of them
is therefore an opportunity for this mismatch, and there is no test that would
notice.

## The seven gaps

| Capability | Roles blocked | Missing from |
|---|---|---|
| `CAN_CREATE_CUSTOMER` | `workshop_owner`, `workshop_manager`, `platform_administrator` | owner §46, manager §47, DEFAULT §34 |
| `CAN_CREATE_VEHICLE` | `workshop_owner`, `workshop_manager`, `platform_administrator` | owner §46, manager §47, DEFAULT §34 |
| pricing (migration 029) | `platform_administrator` | DEFAULT §34 |

Everything else audited — `CAN_CREATE_JOB`, `CAN_GRANT_MEMBERSHIP`,
`CAN_CREATE_BRANCH`, `CAN_INSPECT` — has a route for every holder.

⚠️ **Quality control reads clean only because it was fixed today.** It was a
fourth gap this morning; all three of its routes were built in `037c548`. Left
alone it would have shipped with the dedicated QC inspector unable to reach the
one screen that is their entire job.

### What each gap looks like to a real person

- **Customers.** An owner or manager opens the app to add a walk-in customer and
  finds no "Register Customer" anywhere. It exists only in reception's tree. The
  API would accept them; the menu never offers it.
- **Vehicles.** Identical, for the same three roles.
- **Pricing.** Worse than it looks, because of a second interaction:
  `owner@autoworkshop.local` holds three memberships and
  `resolveTenantContext` defaults to the **strongest** by `ROLE_PRECEDENCE`,
  which is `platform_administrator` → the DEFAULT tree → no pricing entry. So the
  person most likely to set the labour rate sees no Pricing at all until they
  switch role. Meanwhile an unset labour rate means **quotations price labour at
  zero**.

## Options

### Option A — add the missing entries to the trees that need them (RECOMMENDED)

Add `register-customer` and `register-vehicle` to the owner, manager and DEFAULT
trees, and `pricing` to the DEFAULT tree. Seven entries; no code changes beyond
the route pages, which mount screens that already exist.

- **For:** smallest change; each addition is justified by an API permission that
  already exists, so it grants nothing new. Matches the shape Slice C used for
  Workshop Profile (one screen, several tree routes).
- **Against:** the trees grow. Each is a deliberate §46–§49 design, and this
  edits four of them.

### Option B — leave the trees; rely on the role switcher

Tell owners and managers to switch role to reception to add a customer.

- **For:** no navigation change at all.
- **Against:** asks a workshop owner to pretend to be reception to type in a
  customer's phone number. It also does not help `platform_administrator`, which
  holds no second role to switch to. This is the status quo, and the status quo
  is what produced three separate confusions in one day.

### Option C — change `ROLE_PRECEDENCE` so `workshop_owner` outranks `platform_administrator`

Fixes the pricing symptom for `owner@` specifically.

- **For:** one line.
- **Against:** **much wider blast radius than the problem.** It changes the
  default role for every multi-role account in the system, not just this screen,
  and `platform_administrator` leads that list deliberately. It also does not
  touch the customer or vehicle gaps. Recommended **against**.

### Option D — give `supervisor`, `storekeeper`, `quality-control` and `cashier` their own trees

The most complete answer to the root cause.

- **For:** removes the silent fallback entirely; each role gets a tree matching
  §50's description of its job.
- **Against:** four new trees is a significant navigation design exercise, and
  §46–§49 are the only ones the spec actually defines. Worth doing eventually;
  too large to fold into a bug fix.

**Recommendation: Option A now, Option D as its own piece of work later.**

## The durable half, whichever option is chosen

`scripts/audit-nav-coverage.mjs` is committed and can run in CI. It fails when a
role holds a write capability and its tree carries no route for it. Without it,
the next capability added reintroduces this silently — which is how all four
instances arrived.

Its feature→route mapping is hand-maintained (a capability name cannot be derived
from a URL slug), so the script is a guard against regression, **not** a complete
model. That limitation is stated in the script itself rather than left implied.

## What is NOT proposed

- No permission changes. Every gap is fixed by making reachable what the API
  already allows. Nobody gains an ability they did not have.
- No change to `05.txt` §2. This document exists precisely because that rule
  says the owner decides.
