# Supervisor adjudication — T-0003 users, branches, memberships

**Date:** 2026-07-27
**Adjudicates:** `codex-review-t0003-identity.md`
**Verdict:** **PASS WITH CORRECTIONS** — 3 Codex findings confirmed and fixed (2 of them found
independently here first), 1 further instance found in a file Codex did not review.

---

## 1. What was built

The schema already existed (migration 001). T-0003's remainder was the **services**: `BranchService`,
`UserService`, `MembershipService`, their controllers, and the module wiring — all on the
`OrganizationService` pattern, so a REST controller and an MCP tool are thin callers of one service
and get identical rules.

Eight routes registered live under `/api/v1`: branches (GET/GET :id/POST), users (GET/GET :id),
memberships (GET/POST/PATCH :id/status). All verified returning **401** unauthenticated, including on
a forged bearer token and on the privilege-granting POST.

## 2. The defect class this task is really about

`identity.users` is the one table in the identity schema with **no `tenant_id` and no row-level
security** — deliberately, because one human may hold memberships in several tenants. The
consequence is the opposite of everywhere else in this codebase: **RLS will not save you.** A plain
`SELECT * FROM identity.users` inside `withTenant` returns every user on the platform, across every
tenant, and no policy stops it. It type-checks, it reads naturally, and it leaks the entire user base.

Every query in `UserService` therefore starts `FROM identity.memberships` — which IS under FORCE RLS
— and joins outward. The join is the security control. `identity.spec.ts` asserts the query *shape*
for exactly that reason: a comment does not stop anyone, and this is a property no downstream test
would notice was violated.

Codex verified this independently and found it correct.

## 3. Findings

### H1/H2 (HIGH) — a foreign key cannot carry a tenant predicate

Found by this pass and by Codex, independently and in agreement.

The FKs reference `identity.organizations(id)` and `identity.branches(id)` by id alone, and every
`tenant_isolation` policy's `WITH CHECK` constrains `tenant_id = identity.current_tenant_id()` on the
**inserted** row only — never the tenant of the row it points at. So `tenant_id = A` with
`organization_id = <org in tenant B>` satisfies both the FK and the policy. On the platform's
privilege-granting operation, that is a membership filed under one tenant pointing into another's
organization.

Fixed by looking the parent up through the RLS-protected table before inserting. A foreign
organization is invisible to that query, so the check *is* the isolation rather than a comparison
that could be written wrong. The branch check additionally requires `organization_id` to match, since
a sibling branch in the same tenant would pass a bare existence check while scoping the membership to
the wrong site — which §50's "approved role and branch" rule forbids.

### S1 — the same defect in `BranchService`, which Codex did not review

`BranchService.create` took `organizationId` from the body with the identical hole. Codex's scope was
the membership file, so it never saw it. Found and fixed here by asking "where else does this shape
appear?" rather than fixing only what was reported — the difference between closing a bug and closing
a bug class.

### H3 (MEDIUM) — runtime validation. **This pass missed it; Codex found it.**

`withdraw`'s `status` parameter is a TypeScript union, erased at compile time, and the controller
forwards `body.status` verbatim. `'active'` is a value the DB CHECK accepts, so a withdrawal became a
silent no-op that still wrote an audit row reading `membership.active` — an action this service never
performs. Any other string produced a constraint violation and a 500 where a 400 was owed.

Fixed **in the service rather than the controller**, which is the half that matters: an MCP tool calls
the service directly and never passes through a controller, so a rule enforced only at the HTTP edge
does not bind agents at all. Codex's suggested placement was the controller; the finding was right and
the placement needed correcting.

Recorded plainly because the Supervisor pass is supposed to catch what the reviewer misses, and here
the reverse happened. A type is not a validator, and I read past it.

## 4. Rules enforced here that the database cannot express

- **Who may act.** Branch creation and membership grant/withdraw are restricted to governance roles.
  §50 gives the manager "daily operational control", which is not authority over staff or legal
  operating locations, so the manager is deliberately excluded.
- **Which roles exist.** `role_name` is plain `TEXT` with no CHECK constraint, so without an
  allow-list the grant endpoint would accept any string — including one a future authorization rule
  happens to treat as privileged. The eight workshop roles are `07.txt` pt2 §50 verbatim, and a test
  asserts all eight remain grantable so the list cannot silently shrink.
- **No taxonomy disclosure.** An unknown role is rejected with `unknown role`, not with the valid set
  — the same reasoning that removed permission names from the catch-all's 404 page.
- **Withdrawal is one-way.** `WHERE status = 'active'` means a revoked membership cannot be
  reactivated by a second call; re-granting is a new grant with its own audit row, because
  "was this person ever revoked?" must stay answerable.
- **Conflicts are reported.** `ON CONFLICT DO NOTHING` returns no row; that is raised rather than
  reported as success, so an invitation that changed nothing cannot read like one that did.

## 5. An operational note worth carrying

The API on port 4000 had been running since **2026-07-26 05:09** and was serving a build that
predated every controller in this change — the same stale-server condition that produced the T-0030
phantom this morning, in a service the build-freshness gate does not cover (that gate watches the
seven Next apps). It was restarted, and restarted again after the fixes. **A long-lived `node
dist/main.js` is exactly as dangerous as a long-lived `next start`.**

## 6. Gates

| Gate | Result |
|---|---|
| typecheck | 14/14 |
| lint | 14/14 |
| unit tests | **98** (api **39**, navigation 38, ui 12, next-shell 9) |
| API build | `nest build` clean |
| Live | 8 routes registered under `/api/v1`; **401** on every endpoint unauthenticated, on a forged token, and on the privilege-granting POST |
| RLS | proven against a real cluster as a non-superuser (`database.integration.spec.ts`, unchanged and still passing) |

**Not done, and not claimed:** the web apps are still not session-wired, so `viewerGrants()` and
`viewerRole()` keep their demo bodies. Replacing them needs T-0005 (tenant context from the Keycloak
session in Next), not more identity services. T-0016's switchers are now unblocked on the data side.

**VERDICT: PASS WITH CORRECTIONS.** All corrections applied and re-verified.
