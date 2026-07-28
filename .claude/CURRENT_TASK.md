# Current task

**▶ PHASE 4 — Customer + Vehicle (Release 0.3). Not started.**

Tip `9b29ebd` on `master`, pushed, tree clean. Read
`.claude/SESSION_HANDOVER.md` (2026-07-28 section) for the full picture and the
exact start-up commands; this file is the short version.

---

## Where the previous session stopped

Everything on the schedule ahead of Phase 4 is done:

| | |
|---|---|
| T-0005 finding 5 — sign-out revocation | ✅ closed, Codex + Supervisor passed |
| T-0005 finding 4 — admin route protection | ✅ closed, Codex passed, build-gated |
| First screen that reads real data | ✅ shipped and verified signed-in |

**The last thing built** was `apps/admin-web/app/directory/organizations/page.tsx`
— the first screen in this product that reads the database. Before it, eight
endpoints existed under `/api/v1` and the front end called exactly one (`/me`),
only to work out who the viewer was. The owner's words were *"no front end to
access the back end"* and *"no feature"*, and both were accurate.

## Start by re-proving that screen

Do not begin Phase 4 on an unverified base. Bring the stack up per the handover,
then open `http://localhost:3006/directory/organizations` signed in as
`admin@autoworkshop.local` / `Change_me_locally1!`.

**Expected: `Alpha Motors` only, caption "1 organisation".** Postgres holds two
organisations; `Beta Auto` belongs to Tenant B. **If both appear, tenant
isolation has regressed — stop and fix that before anything else.**

## Then Phase 4

`COMBINED_PLAN_v2.md` line 299 and `PLAN_EXTENSION_v1.md` §2:

> Registration, profile, vehicle garage, documents, service history, maintenance
> schedule, complaint submission, appointment request, workshop search, dashboard
> — plus the personal vehicle workspace, My Repair Dashboard, service request and
> approve/reject/modify from `07.txt` part 1.

Build it as vertical slices, each complete before the next. The order that works,
and the pattern to copy from the organizations screen:

1. **Migration** — `infrastructure/migrations/004_*.sql`.
2. **Domain service** on the `OrganizationService` shape. Rules live in the
   service, never the controller, so an MCP tool gets the same rules.
3. **Controller** under `/api/v1`, thin, `@UseGuards(TenantGuard)`.
4. **Page** — `requireWorkspaceAccess()` as the FIRST statement (the build gate
   enforces it), then `apiGet()`, then all four states.
5. **Verify by signing in and looking.** Every serious defect this project has
   had was green on typecheck, lint and the unit suite first.

### 🔴 The owner's schema rule is binding here

**Real relationships — foreign keys, joins, normalised tables.** And the
qualifier that matters: **a foreign key cannot carry a tenant predicate.**
Relationships give integrity; RLS gives isolation; **both are required.** Every
tenant-owned table still gets `tenant_id`, `ENABLE` + `FORCE ROW LEVEL
SECURITY`, an explicit `WHERE tenant_id = $1`, and the tenant index baseline.
`infrastructure/migrations/001_tenancy_foundation.sql` is the worked example.

### Definition of complete (`05.txt` §6)

Migration runs · backend rule exists · API works · page renders with
loading/empty/error/permission states · permissions enforced · tests pass ·
lint + typecheck pass · Playwright journey passes · responsive checked · docs
updated · **no paid dependency** · committed.

---

## Two things that are NOT blockers but must not be forgotten

**Production is down** — Render suspended it, `suspenders: ['billing']`, and it
cannot be resumed through the API. Owner action. Phase 4 does not need it: the
whole stack runs locally. Detail in `docs/13-operations/LIVE-OUTAGE-2026-07-28.md`.

**Playwright's full suite has not run** since these changes — only the identity
journey (2/2). The other six apps have stale `.next` builds on disk, so rebuild
before trusting any run of it.
