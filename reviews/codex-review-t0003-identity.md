# Codex review — T-0003 users, branches, memberships

**Date:** 2026-07-27
**Reviewed:** `apps/api/src/identity/{branch,user,membership}.service.ts`,
`identity.controllers.ts`, `identity.spec.ts`, `identity.module.ts`
**Exit:** 0 · **`VERDICT: CHANGES REQUIRED`**

## Findings as returned

1. **HIGH** — `membership.service.ts` `grant()` trusts `organizationId` from the request body without
   proving that organization is visible in the active tenant. The inserted row's `tenant_id` comes
   from `ctx.tenantId`, so RLS `WITH CHECK` validates only the new membership row, not the tenant of
   the referenced organization. *Scenario:* a caller in tenant A posts an `organizationId` belonging
   to tenant B and creates a tenant-A membership pointing at tenant B's organization.
2. **HIGH** — `grant()` accepts any existing `branchId` and never checks it belongs to
   `input.organizationId`. The FK proves the branch exists, not that it belongs to the membership's
   organization. *Scenario:* a membership whose approved organization and branch disagree.
3. **MEDIUM** — `identity.controllers.ts` `status` is only TypeScript-typed, never validated at
   runtime. `{"status":"active"}` passes the DB CHECK, turning withdrawal into a no-op that still
   audits `membership.active`; any other string yields a database error instead of a controlled 400.

It also explicitly answered all four questions and confirmed as correct: `UserService`'s
membership-scoping (Q1), the role allow-list, `ON CONFLICT` behaviour and the non-reactivating
`withdraw` (Q2), and it flagged a test-coverage gap (Q4).

## Adjudication — all three CONFIRMED and fixed

**H1 and H2 — confirmed, and independently found by the Supervisor pass before this review returned.**
Verified in the migration: the FKs reference `identity.organizations(id)` and `identity.branches(id)`
by id alone — a foreign key cannot carry a tenant predicate — and every `tenant_isolation` policy's
`WITH CHECK` constrains `tenant_id = identity.current_tenant_id()` on the inserted row only. So
`tenant_id = A` with `organization_id = <org in B>` satisfies the FK and the policy simultaneously.

Fixed by looking the parent up through the RLS-protected table before inserting: an organization in
another tenant is invisible to that query and yields no row, so the check *is* the isolation rather
than a comparison that could be written wrong. The same defect existed in `BranchService.create` —
Codex did not mention it, because branches were outside the file it focused on, but it is the same
hole and is fixed the same way. Branch-belongs-to-organization is checked too.

**H3 — confirmed, and this one the Supervisor pass MISSED.** The union type is erased at compile
time, the controller forwards `body.status` verbatim, and `'active'` is a value the DB CHECK accepts.
The result was a withdrawal that changed nothing while writing an audit row for an action this
service never performs.

Fixed **in the service, not the controller**, which is the more important half: an MCP tool calls the
service directly and never passes through a controller, so a rule enforced only at the HTTP edge is
not enforced for agents. That is the entire premise of the AI boundary (`0.txt` §13, §26). Codex's
own suggestion pointed at the controller; the finding was right and the placement needed correcting.

**Q4 coverage gap — accepted.** Tests added for all three: cross-tenant organization grant,
mismatched branch grant, and runtime status validation, each asserting the operation never reaches
its `INSERT`/`UPDATE`.

## Reviewer performance — a marked improvement, recorded

This is the first review in this repo's history where Codex **answered every question it was asked
and emitted the required `VERDICT` line**. The three prior passes did neither. It also correctly
distinguished "checked and correct" from "not checked", which is what makes a clean verdict worth
anything.

Two of its three findings were found independently by the Supervisor pass; the third was not, and it
is a real defect that would have shipped. The standing instruction to run the Supervisor
independently rather than trusting a clean Codex verdict remains right — but it now cuts both ways.
