# Business rules

Authoritative rules live in NestJS domain services. MCP tools and REST controllers are both thin callers
of the same application service — so the rules apply identically to a human and to an AI agent.

## Repair authorisation
1. **No chargeable repair starts without recorded customer approval.** The only exception is an explicitly
   agreed emergency or inspection-only authorisation.
2. A job cannot enter *authorised to start* without an approved proposal, a satisfied deposit requirement
   and available parts.
3. Any technician override is logged with the authorising user and a reason.

## Proposals and variation
4. Approved proposals are **immutable**. A material change creates a new version requiring new approval.
5. A previously granted approval never applies to a materially changed solution.
6. Work discovered after commencement stops the affected task and creates a variation proposal.
7. Unaffected approved work may continue while a variation is pending, only if technically safe.

## Parts
8. A part cannot be reserved or issued without a valid job and user authorisation.
9. Part-to-vehicle compatibility is validated before reservation or issue.
10. Incompatible or unverified parts require an authorised override with a documented reason.
11. Safety-critical products require an authorised technical reviewer — the AI may only recommend.

## Evidence and truth
12. The customer's original submission is preserved. AI summaries never replace the original text, audio,
    photographs or video.
13. The system always distinguishes: customer-reported symptom · AI hypothesis · technician observation ·
    confirmed diagnosis · approved repair action.
14. A product is never described as original, genuine or fully compatible unless verification evidence
    supports it.
15. Generated images and animations are always labelled as simulations.

## Money
16. Invoices are generated only from approved job items and verified parts usage.
17. Refunds, credits and warranty decisions above defined limits require authorised approval.
18. **AI agents can never approve a financial transaction.**

## Tenancy
19. Tenant data never crosses organization boundaries.
20. Tenant context is derived from validated claims and membership — never from client input.
