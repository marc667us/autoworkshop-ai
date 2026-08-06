# The customer value chain — owner specification, 2026-08-06

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

The owner separately asked for: customers to log in to view and add complaints,
to add or register their own vehicles, and to have **views on each section or
card showing the STATUS of their vehicle's repair**.

---

## ⚠️ A governance conflict to resolve with the owner before building steps 8–9

Root `CLAUDE.md` **§0.1 is a HARD RULE**: Google ADK is the ONLY agent framework,
and orchestration-first (**§0.2**) requires a Root Orchestrator with department
Conductors. Steps 8 and 9 above are squarely agent work.

The owner also instructed, this session and standing in
`outstanding_work_schedule.md`: **"open and run CODEX and the SUPERVISOR only. Do
NOT open or run Google ADK or Stitch."**

These are not necessarily in conflict — "do not OPEN/RUN ADK as a session tool"
is not the same as "do not BUILD to the ADK architecture" — but the difference
decides how steps 8 and 9 get implemented, and it is the owner's call, not an
assumption to make silently. **Ask before building the agent layer.**
