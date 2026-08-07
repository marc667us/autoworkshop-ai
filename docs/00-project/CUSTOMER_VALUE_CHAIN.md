# The customer value chain — owner specification, 2026-08-06

## 🔴 THE VALUE PROPOSITION, IN THE OWNER'S WORDS (2026-08-07)

> *"a major object and value proposition of the app is connecting vehicle owners
> with need to repair with workshops and vehicle part suppliers, this is a win
> win for all."*

**THIS IS A THREE-SIDED MARKETPLACE, NOT A WORKSHOP TOOL WITH A CUSTOMER PORTAL
BOLTED ON.** Vehicle owners, workshops and parts suppliers, and the product's
job is the CONNECTION between them.

⚠️ READ THIS BEFORE PRIORITISING ANYTHING. It changes what "done" means:

- A feature that serves only ONE side is at best a third of a feature. The
  customer can now ask a workshop for help (steps 4-7) — the **supplier** side
  of the same idea does not exist yet. A workshop that needs a part has no
  equivalent of "Request for Service".
- The PUBLIC surface is not marketing, it is the product. The mechanic
  directory, the parts marketplace and the VIN search are how the three sides
  find each other; they are the funnel, not decoration around it.
- "Win win for all" is a design test to apply to each feature: name what each of
  the three sides gets. A feature only one side benefits from needs a reason.

## 💳 PAYMENTS — owner requirement, 2026-08-07

> *"supplier system must update the payment to include local mnt momo payment
> systems and local bank payment card, use paystack"*

**Paystack, covering MOBILE MONEY and local bank cards.** Ghana is a
mobile-money-first market — MTN MoMo, Vodafone Cash, AirtelTigo — and a
marketplace that can only take an international card excludes most of the people
it is for. Paystack carries both channels in one integration, which is why it is
the right single choice rather than two.

⚠️ SOLAR ALREADY INTEGRATES PAYSTACK and is the reference implementation
(ADR-011) — including a `/paystack/verify` callback with dedupe, and the
hard-won rule that the verify callback carries NO bot-defense honeypot because a
wrongful block means a real payment goes uncredited. Read Solar's implementation
before writing this one; do not re-derive it.

⚠️ ZERO-COST RULE (ADR-012): Paystack has no subscription — it takes a
transaction percentage, which is a cost of taking money at all rather than a
tool the project pays for. Solar's precedent stands. Do not introduce any paid
tool alongside it.

**Scope: the SUPPLIER side.** A workshop accepting a supplier's quote is the
moment money moves on the workshop→supplier edge, and that is what this covers.
NOT YET BUILT.

---

The chain below is the CUSTOMER→WORKSHOP edge. The WORKSHOP→SUPPLIER edge is the
same shape and is largely unbuilt — that asymmetry is the biggest gap in the
product against this stated proposition, and it is not a defect list item, it is
a strategy one.



**Captured verbatim in substance from the owner during the 2026-08-06 session.
Nothing here is inferred.** The owner's framing: *"customer is the initiator of
the value chain of this app in this case the auto repair business."*

This document exists because the whole flow was given verbally at the end of a
session and would otherwise have been lost.

---

## The flow, end to end

1. **The customer arrives on the landing page**, looking for a workshop or a
   mechanic to fix a car problem.
2. **They use the FREE feature on the landing page** to look for a workshop or a
   mechanic. (This is the existing public marketplace + mechanic directory + VIN
   search on the apex — it already exists and is public by design.)
3. **They choose their preferred workshop or mechanic, OR the system assigns
   one.** Both paths are required — customer choice and system assignment.
4. **They click the link of their preferred one, then "Request for Service".**
5. **A page opens** where they file:
   - their complaint,
   - their car details,
   - their problem(s),
   and submit.
6. 🔴 **THEY DO THIS AFTER LOGGING IN.** The owner was explicit. Browsing and
   searching are free and anonymous; SUBMITTING a service request is not.
7. **The submitted request is received at RECEPTION.**
8. **An AI agent uses the submitted form to:**
   - register the customer,
   - register the customer's vehicle(s),
   - and finally assign the request to a workshop or a mechanic.
9. **An orchestrated agent then takes over** and works with the other agents that
   run the workshop to get the car fixed.

---

## What this settles about the authorization defect found the same day

MEASURED 2026-08-06: a signed-in `customer` on `workshop-web` resolves to the
workshop DEFAULT tree and sees **45 of 45 staff items** — permission filtering is
inert for that tree. `ROLE_TO_NAV` maps only the eight workshop STAFF roles, so
`customer` (and supplier, fleet, insurance, towing, platform admin) fall through
`navRoleFor() -> undefined` to `workspaceForRole(base, undefined)`, which returns
the staff default.

`workspaces.ts:849` defends that default as "what a member whose role is not yet
resolved should see". That reasoning is sound for a STAFF member mid-resolution
and wrong for a customer, who is not staff and never becomes staff.

**This specification is the argument for the fix.** The customer is not a
degraded staff role to be filtered down — they are the START of the chain, with
their own surface. So:

- The fix is NOT to bolt permission keys onto 45 staff items.
- The fix is that a non-workshop role resolves to NO workshop tree at all.
- `navRoleFor()` returning `undefined` currently conflates "staff role not yet
  resolved" with "not a workshop role at all". Two different facts, one value —
  the same conflation as the viewer contract's `null`.

---

## What already exists, and what does not

**Exists** (audited 2026-08-06, `scripts/audit-menu-coverage.mjs --all`):
- The public landing, parts marketplace, mechanic directory and free VIN search
  on the apex — steps 1 and 2.
- Customer tree §33 in `customer-web`: **35/35 routes working, 0 dead ends.**

**NOT yet verified against this specification** — each needs checking before it
is claimed:
- Step 4: is there a "Request for Service" call to action on a chosen mechanic
  or workshop? `marketplace-landing.tsx` has "Sign in to contact", which is not
  obviously the same thing.
- Step 3: system-assigned workshop selection.
- Step 5: the combined complaint + car details + problem intake form.
- Step 7: does a submitted request actually land in a RECEPTION queue?
- Step 8: the AI agent that registers customer + vehicle from the form and
  assigns the work.
- Step 9: the orchestrated agent that runs the repair with the other agents.

## The customer's own screens — owner's additional requests, 2026-08-06

Asked for explicitly, alongside the flow above. These are `customer-web`, NOT
workshop-web:

1. **Sign in to VIEW and ADD complaints.** Viewing is not enough — the customer
   raises complaints themselves.
2. **Add / register their own vehicles.** The customer must be able to register a
   vehicle directly, not only have one created for them at reception by the
   agent in step 8. Both paths must exist: self-registration AND agent
   registration from a submitted request.
3. 🔴 **STATUS OF THEIR VEHICLE'S REPAIR, ON EVERY SECTION OR CARD.** The owner's
   words: *"they must have views on each section or card outputs on what the
   status on their vehicle repair"*. So repair status is not one status page — it
   is surfaced on the cards throughout the customer's screens. A customer should
   never have to hunt for where their car is up to.

⚠️ NONE OF THESE THREE HAS BEEN VERIFIED AGAINST WHAT EXISTS. Customer §33
audits 35/35 routes, but that measures MENU COVERAGE — every menu entry has a
working page — and says nothing about whether these three capabilities are among
them. Check before building, and check before claiming.

---

## 🔴 THE AUTHORIZATION FIX — measured, scoped, and NOT a patch

**Measured 2026-08-06**: a signed-in `customer` on `workshop-web` sees **45 of 45**
items in the workshop default tree. Permission filtering removes NOTHING, because
every item in that tree is ungated. The leaked list includes Customers (the whole
customer book), Vehicles, Job Cards, Technicians, Quotations, Customer Proposals,
Parts Depot, Procurement, Suppliers, Warranty Claims and four Reports screens.

**Why it is not a one-line change.** Both the navigation and the gate resolve
through the same two calls:

  * `WorkspaceShell.tsx:156-159` — `getWorkspace()` then `workspaceForRole(base, role)`
  * `require-route.ts` — the same pair, deliberately, so nav and router cannot drift

`workspaceForRole(base, undefined)` returns the DEFAULT staff tree, and
`navRoleFor()` returns `undefined` for every non-workshop role. There is no value
of `role` that means "this viewer has no business in this workspace":

  * `undefined` already means "staff role not yet resolved" → default tree.
  * `!workspace` already means "configuration error" and renders an error screen,
    which is wrong for a customer who is legitimately signed in.

So the fix needs a THIRD state, and it must land in all four places at once:

  1. `viewer-contract.ts` — distinguish "not a workshop role" from "unresolved".
  2. `WorkspaceShell.tsx` — a "you are signed in, but this workspace is not yours"
     state, distinct from the configuration-error screen.
  3. `require-route.ts` — refuse, `notFound()`.
  4. The layout — send the customer somewhere useful rather than a wall.

⚠️ **BOTH HALVES MUST SHIP TOGETHER.** Gate only → 45 menu entries that 404, which
is the "signpost target that 404s" failure this repo has already paid for three
times. Nav only → hidden but not refused, which CLAUDE.md §8 forbids by name:
*hidden ≠ secure*.

⚠️ **`platform_administrator` IS IN THE SAME UNMAPPED SET.** Excluding all six
non-workshop roles in one sweep risks locking platform admins out of the app —
there is a known prior issue about admins being unusable without a membership.
Decide that role separately and deliberately.

**How to prove the fix.** This returns 45 today, so it fails for the right reason
and cannot pass vacuously:

```ts
import { getWorkspace, visibleGroups, workspaceForRole } from '@autoworkshop/navigation';
const ws = workspaceForRole(getWorkspace('workshop')!, undefined);
let n = 0;
for (const g of visibleGroups(ws, [])) n += g.items.length;   // 45 before the fix, 0 after
```

⚠️ **THIS MEASURES THE NAVIGATION ONLY.** Whether the API and Postgres RLS refuse
the DATA behind those 45 screens has NOT been checked. It may be "45 screens
render empty" rather than "45 screens leak data" — that difference needs driving
in a real browser as a real customer, and it does not change that the fix is
required.

---

## ⚠️ AMENDED 2026-08-07 — ADK IS ALLOWED FOR PHASE 8 ONLY

The owner has permitted Google ADK **for Phase 8 (MCP + AI)**, to be built *"when
you get there"*. That does NOT reopen the sections below: steps 8-9 of this chain
are Phase 5/7 work, they shipped deterministic, and they stay that way. See
`ADR-018`'s amendment. Phase 8's own deliverables are built on ADK per §0.1.

## Steps 8–9 are built WITHOUT Google ADK — decided by the owner

**The owner's instruction is standing and settled: do not use Google ADK.** It
applies to BUILDING, not merely to opening ADK as a session tool. Asked to
confirm, the owner restated it. This section previously framed that as an open
governance question needing a decision; it is not one, and re-raising a settled
instruction is itself the error.

So steps 8 and 9 — the reception agent that registers the customer and their
vehicles from the submitted form and assigns the work, and the orchestrated agent
that runs the repair — are **deterministic services**, not ADK agents.

🔴 **THERE IS ESTABLISHED PRECEDENT IN THIS ACCOUNT, AND IT IS THE PATTERN TO
COPY.** Solar shipped two agents this exact way, each with an ADR recording the
exemption:

  * **ADR-0008 — AI-SOC**
  * **ADR-0009 — Billing Agent**

Both are deterministic, both ship in production, neither uses ADK. Solar is this
project's reference implementation (ADR-011), so this is the house style for
agent work, not a workaround.

⚠️ **LOG AN ADR WHEN THE FIRST ONE IS BUILT.** Root `CLAUDE.md` §0.1 names ADK as
the default agent framework and requires any departure to be recorded in an ADR
in `docs/ARCHITECTURE_DECISIONS.md` plus `docs/IMPLEMENTATION_LOG.md`. That
mechanism exists precisely for this case. The ADR is the record of a decision
already made — it is NOT a gate to re-litigate the decision through, and nobody
should read it as one.

**Practically, "deterministic" here means:** the reception step is a service that
parses the submitted request, creates the customer and vehicle records through
the existing NestJS domain services, and assigns the job — with explicit rules
and an audit trail, not a model deciding. Any model use stays a one-shot utility
inside a tool (e.g. summarising a free-text complaint), never a reasoning loop
that drives the workflow.
