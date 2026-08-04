# Current task

## ▶ START HERE — ONE BLOCKER, AND ONLY THE OWNER CAN CLEAR IT

Migration **037 is written, verified 13/13 and pushed**. Applying it to
production is classifier-blocked for the assistant, so the owner runs:

```
! C:\Users\USER\bin\gh.exe workflow run apply-migrations.yml -f confirm=APPLY --repo marc667us/autoworkshop-ai
```

Until then `POST /registration/workshop` still 500s live and **no workshop can
be created**. Afterwards: sign in at `autoworkshop.aiappinvent.com`, create the
workshop through the form (not by INSERT), then re-run `Seed live catalogue` so
the mechanic directory stops reading 0.

### WHY 037, IN ONE PARAGRAPH

`identity.register_workshop` is SECURITY DEFINER owned by `autoworkshop`.
Locally that user is a SUPERUSER and bypasses RLS; on Render it is merely the
table owner, and `FORCE ROW LEVEL SECURITY` applies to owners. Same function,
different role — which is why `verify/036` passed 9/9 against a defect that
existed only in production. 037 opens a narrow, auditable bootstrap door keyed
on two transaction-local settings and pinned to the registering user, and closes
it before returning. It also gives `identity.memberships` a narrow SELECT policy,
because the one-workshop-per-person guard was a SELECT on a FORCE-RLS table with
no tenant context and **had never been able to fire**.

`verify/037` re-owns the function to a non-superuser inside the transaction —
the only way this defect class is reproducible locally — and REFUSES to run if
the owner is still a superuser.

**Migration 038 goes with it.** 037's header claimed the bootstrap door was
"reachable only from inside this function"; it was not. `set_config` is not
privileged and the app role holds INSERT on every `identity` table, so it could
set the flag itself and write directly — measured, `INSERT 0 1`. 038 adds a
predicate the app role cannot satisfy: the effective user must be the function's
OWNER, looked up rather than hardcoded. `verify/038` creates a third role so the
owner and the caller differ as they do in production, and REFUSES to run if they
are the same. 5/5, with 037 still 13/13.

---

## ✅ DONE 2026-08-04

**Both workflows finished and driven in a browser as the right role:**

| suite | result |
|---|---|
| `verify-technician-workflow.mjs` | 21/21 screens · 24/24 checks |
| `verify-customer-workflow.mjs` | 11/11 screens · 19/19 checks, twice running |
| `verify-staff-screen.mjs` | 9/9 — add form, and the refusal names a way forward |
| `verify-staff-rehire.mjs` | 4/4 — remove then re-hire, against the real unique index |

Screens and checks are DIFFERENT numbers and both are quoted everywhere, because
mixing them is how skipped coverage hides.

⚠️ The customer suite **CONSUMES its fixture**. Run
`bash scripts/seed-customer-proposal-fixture.sh` before each verification, or
the approval path is skipped — and it now FAILS rather than passing quietly when
no answerable proposal exists (`ALLOW_EMPTY_CUSTOMER_PROPOSALS=1` to opt out).

**The customer can now approve their own repair.** `POST
/proposals/:id/customer-decision` — a separate route from the staff one, because
`decidedByName`, `decisionChannel` and `recorded_by` stop being inputs and are
derived. The role admits the read; a `c.user_id` predicate scopes it.

**A workshop owner can finally hire somebody.** `MembershipService.grant()` has
been complete since Phase 2 and had NO REACHABLE CALLER: it took a `userId`, and
the only source of one is `GET /users`, which lists people who are ALREADY
members. It accepts `userEmail` now — an email, NOT a search endpoint, because a
lookup route would be an enumeration oracle over every account on the platform.
Screen at `/workshop-management/staff` and `/settings/staff-and-roles`.

⚠️ There is no INVITE flow (T-0028). A colleague must sign up first, and the
screen says so up front rather than letting them discover it through a refusal.

**Keycloak's `error=Configuration`** is replaced by an honest "starting up"
screen with one bounded retry, at `/auth/error` in all seven apps.
⚠️ A 24/7 keep-warm was REJECTED on arithmetic: four free services share one
750-hour allowance and a month is ~730 hours. `keep-warm.yml` is windowed.

### 🔴 THE GATES THAT WERE NOT GATES

- **Codex had never run on a real diff** — prompt passed as argv,
  `Argument list too long` — **and the runner exited 0 when it failed.**
- **Package vitest configs collected only `*.test.ts`** while `apps/api` uses
  `*.spec.ts`; a misnamed file was silently never collected.
- **The customer verifier passed on an empty proposal table** — the whole
  approve path sat inside `if (offersAnswer)`. It now fails instead.

Ask of any gate: *would its not-running look different from its passing?*

⚠️ NOT the same "four gates" as CLAUDE.md §14 (Codex → Supervisor → Work
Reviewer → Work Scheduler). Those are the PROCESS gates; these three were
mechanical faults in the tooling. Of the four process gates this session: Codex
RAN (twice, 10 findings, all fixed), the Supervisor security review RAN, and the
two ADK governance agents were NOT run — the owner's standing instruction is not
to open ADK without approval.

### 🔴 AND THINGS THAT LOOKED FINE AND WERE NOT

- `decidable` was still computed from the STAFF role set, so the customer
  approval form **rendered nothing** while the service and all ten of its tests
  passed. Test what the VIEWER is told they may do, not only what the service does.
- Both decision routes accepted a **superseded** proposal by direct POST.
  `decidable` hides it; hiding is not refusing.
- The technician dashboard told a signed-in technician **nobody was signed in**,
  then my first fix read `currentViewer() !== null`, which is null when `/me`
  FAILS. It reads `viewerHasSession` now.
- After approving, the screen still said "contact the workshop to approve" —
  recording a decision does not move the job card; that is staff's action.

---

## Standing warnings

- **Keycloak cold start is up to 136 seconds** and produces
  `error=Configuration` on sign-in, not a wait. The first visitor after an idle
  period gets a hard error.
- **Four free Render services now share one instance-hour allowance.** This
  account was suspended with `suspenders: ['billing']` on 2026-07-28, and
  `autoworkshop-customer` 404'd for a stretch on 2026-08-03. **No paid remedy is
  to be proposed** — zero cost is a hard rule.
- `scripts/guardrails/check-page-gates.sh` is RED with **19 pre-existing** FAILs,
  all apparently false. Verified identical before and after this session's work.
- `RENDER_API_KEY` still unrotated since the 2026-07-27 leak.

---

## 📋 THE COMPLETE OUTSTANDING REGISTER — everything still open

Consolidated at the 2026-08-03 pt3 close. Ordered by what unblocks the most.

### A. BLOCKING — do first

| # | Item | Where |
|---|---|---|
| A1 | **Migration 037 — the RLS bootstrap fix.** Detailed at the top of this file. Without it no workshop can be created in production. | `infrastructure/migrations/037_*.sql` |
| A2 | **Finish seeding the owner's workshop.** The user row exists live and holds no membership; A1 is the only thing in the way. Use the form, not an INSERT. | `autoworkshop.aiappinvent.com` |

### B. PRODUCTION RISKS — none is a code bug, all can bite a real user

| # | Item | Note |
|---|---|---|
| B1 | **Keycloak cold start reached 136s** and throws `error=Configuration` at whoever signs in first after idle — a hard error, not a wait. Needs either a keep-warm (Solar's `keep-warm.yml` is the worked pattern: ONE delivered cron fire drives a 5h30m loop) or a friendlier failure. | — |
| B2 | **Four free Render services share one 750h allowance.** A month is ~730h. T-0034 records the 2026-07-28 billing suspension from exactly this. `autoworkshop-customer` 404'd for a stretch on 08-03. **No paid remedy is to be proposed.** Consider retiring `autoworkshop-customer` — the apex now serves the same landing from `workshop-web`, so it is largely redundant. | T-0034 |
| B3 | **`RENDER_API_KEY` unrotated** since the 2026-07-27 transcript leak. Treat as compromised. | — |
| B4 | **The four gates were not run on most of this session's 17 commits.** Codex ran once early, `/security-review` once. CLAUDE.md requires Codex → Supervisor → Work Reviewer → Work Scheduler per feature. | `scripts/quality-gate.sh` |

### C. PRODUCT — the owner's stated priority is what a user can SEE

| # | Item | Size |
|---|---|---|
| C1 | **Menu coverage is 28-50% per role** — measured today: owner 19/56, manager 21/64, reception 15/36, technician 8/29, default 21/42. Everything else lands on "not built yet". `node scripts/audit-menu-coverage.mjs --all` names each one. | LARGE, slice it |
| C2 | **"Add staff" has no screen.** The nav advertises `staff` and `technicians`, the `MembershipService` API exists, no page. Own slice: a list plus an add-member form. | MED |
| C3 | **Customer workspace has 6 real screens.** Dashboard, garage, add vehicle, parts orders, report a problem, vehicle lookup. The rest of §33 is nav without pages. | LARGE |
| C4 | **Evidence upload** — `POST /evidence/upload-url` + `storage_key` wiring + UI. Photos/voice/video/OBD are in §537 and the report-a-problem screen says so honestly. | MED |
| C5 | **T-0017** — quick-create, tasks, messages, notifications, help panels (§9-§14). The top-bar buttons render disabled until these land. | MED |
| C6 | **Mobile**: offline queue, camera capture, push — all still empty. | LARGE |
| C7 | **T-0028** — account types as requests, workshop staff invitation, approval limits. Pairs naturally with C2. | MED |

### D. CORRECTNESS AND HYGIENE

| # | Item |
|---|---|
| D1 | **T-0006** — full tenant-isolation suite. RLS is proven as a non-superuser; the suite is not written. A1 makes this urgent: production RLS behaves differently from local, and nothing tests that. |
| D2 | **Repo-wide RLS org-scoping** — plan before code. |
| D3 | **T-0044** — the document scrolls 51px sideways at a 768px viewport on EVERY page. Pre-existing shell defect; 1280 and 390 are clean. |
| D4 | **`check-page-gates.sh` is RED with 19 pre-existing FAILs**, all apparently false (a `const ROUTE` indirection, and customer-web's `(app)` route groups). A Stage-0 guardrail that cries wolf 19 times is one nobody reads — either fix the script or delete it. |
| D5 | A finding's `recorded_by` is **re-stamped on edit**, so the original recorder survives only in the audit trail. |
| D6 | **Permission denials are not audited anywhere**, though CLAUDE.md §16 lists them as an audit event. |
| D7 | **T-0019/T-0023** — backup health detection works; delivery to a human does not. |
| D8 | **T-0020/T-0021/T-0022** — restore drill from the off-host copy, MinIO object-lock, cluster rebuild with `--data-checksums`. |
| D9 | The new browser checks (`verify-vin-funnel`, `verify-workshop-onboarding`, `verify-top-bar-identity`) are **not wired into CI**. They need a running stack, so they are manual today. |
| D10 | Playwright baseline is **138 passed / 2 skipped** and was NOT re-run this session. **Read the COUNT, never the exit code** — this suite silently ran zero tests for two days. |

### F. FROM TESTING THE LIVE LANDING — 2026-08-03

| # | Item | Status |
|---|---|---|
| F1 | **Seed the live catalogue.** The apex landing went live reporting `parts 0 · suppliers 0 · countries 0 · mechanics 0` — a shop with nothing in it. | ✅ **DONE** — `Seed live catalogue` workflow; now **18 parts · 5 suppliers · 3 countries** across 8 categories, GHS priced, unpublished rows correctly withheld. |
| F2 | **Mechanics directory is still 0.** It is copied from workshops that actually exist, and none do. | ⏳ **BLOCKED BY A1** — it fills once migration 037 unblocks workshop registration. Re-run the seed afterwards. |
| F3 | **The live checks assert STRUCTURE, NOT CONTENT.** 24/24 passed against a completely empty shop: they confirm the catalogue section renders, never that anything is in it. `verify-live-site.mjs` and `verify-vin-funnel.mjs` both need a non-empty assertion. `seed-live-catalogue.yml`'s read-back is written correctly and can be copied. | OPEN |

### E. DECISIONS WAITING ON THE OWNER

| # | Item |
|---|---|
| E1 | **Retire `autoworkshop-customer`?** It duplicates the apex landing and consumes free instance-hours. Keeping it costs hours; removing it loses the consumer basket flow until that moves too. |
| E2 | **Workshop staff vs consumer front door.** The apex now shows a parts marketplace to everyone, including workshop staff arriving to work. Watch whether that reads well in practice; the wordmark and nav both reach the dashboard. |

---

## ✅ LIVE SUITE AT CLOSE — 2026-08-03, 24/24 against production

| suite | result |
|---|---|
| `verify-live-site.mjs` (existing) | **9/9** — serves, shell renders, sign-in reaches Keycloak, unknown route 404s, no console errors |
| `verify-vin-funnel.mjs` against the APEX | **9/9** — VIN decodes signed out, gate holds, CTA carries the VIN through sign-up |
| signed-in identity, live | **6/6** — real session, no "Not signed in", the AUTHENTICATED API answers |

**⚠️ ONE MEASUREMENT CHANGED MEANING, AND IT IS NOT A FIX.** The suite reports
**0px horizontal overflow at 768px**, where T-0044 recorded 51px. That is
because `/` is now the public landing rather than a redirect into the shell —
**a different page is being measured.** T-0044 is a SHELL defect and remains
open; re-measure it on `/home/dashboard` and `/workshop-floor/job-cards` before
believing it is gone.

The signed-in run also asserts the known blocker as a KNOWN state: if
"still no workshop" ever FAILS, A1 and A2 are done and this file needs updating.
