# Next session — start here

**Updated 2026-08-10. Tip `3616e61` on `master` — PUSHED. Working tree clean.**

▶ **FIRST TWO COMMANDS:**
```bash
bash scripts/start-session.sh          # kills stale servers, applies local migrations
bash scripts/record-live-state.sh      # photographs what is actually deployed
```

Owner policy: five slices + issue resolution every session. Never the scheduler.
**Codex and the Supervisor only — no Stitch, no Google ADK.**

---

# ═══ 2026-08-10 — 71/0/0, AND THREE REDS THAT WERE NOT THE PRODUCT ═══

**Live suite 67/0/0 anonymous + 4/0/0 signed-in = 71 passed, 0 failed, 0 skipped
— the first fully clean run, and still 71/0/0 after migration 077 went live.**
Migrations **IN REPO 76 / APPLIED 76 / PENDING 0**. Security CI 6/6 on a
full-history dispatch. 8 commits: `4188c2a` → `3616e61`.

## 🔴 SLICE 5 — PLATFORM ADMIN. HALF DONE ON PURPOSE. FINISH IT FIRST.

**Migration 077 (`163dcc4`) — ✅ APPLIED TO PRODUCTION 2026-08-10 18:07.**
`077: 1 active platform administrator grant(s) now recorded` · **IN REPO 76 · APPLIED 76 · PENDING 0** · live suite **67/0/0 + 4/0/0**.
`identity.is_platform_admin()` no longer accepts a membership `role_name`;
authority is an un-revoked row in `identity.platform_administrators`
(append-only, no `tenant_id`, revocation immediate). verify/077 **10/10** as
`autoworkshop_app`.

⚠️ **THE SCHEDULE'S OWN ITEM 3 ASKED FOR THE FORBIDDEN SHAPE.** It proposed
matching `platform_administrator` from `realm_access.roles`. COMBINED_PLAN_v2 §4
and PLAN_EXTENSION_v1 §2.1 both prohibit a claim conferring authority — §2.1 is
an invariant added *because Codex found that hole at plan stage*. Owner chose the
grant table. **Read the plans before implementing a note in this file.**

🔴 **THE REMAINING HALF, AND IT IS A CRITICAL:** the API still derives
`platform.admin` from `ROLE_PERMISSIONS['platform_administrator']`, keyed on the
membership role. **Revoking a grant does not revoke API authority**, and an
endpoint whose application check IS the enforcement (`security.controller.ts`
reads `pg_catalog` and says so) still admits a membership with no grant. Needs
grant state resolved in `TenantContext` + regating every platform-admin endpoint.

✅ 077 is deployed; the signed-in live job passed **after** the predicate change,
which is the proof the production backfill landed and the owner kept authority.

⚠️ **Release failed on this push with a GHCR SECONDARY RATE LIMIT**, after the
image built and passed its container smoke test. Six pushes in one day. Re-run
`Release` when convenient; the apex still serves the previous image.

🔴 **THE customer-web 502 WAS NOT A COLD START — I MISDIAGNOSED IT TWICE.**
Fixed in `3616e61`. The suite's OWN wake step recorded `customer-web -> 200`
minutes before the suite read 502 from the same URL, so it was demonstrably
awake. On demand: 200 fifteen times at ~1s, then ten more with the suite's exact
`aw-live-suite` User-Agent (UA path ruled out). It is Render's edge flap that
`reachable()` already documents, now reaching a PRE-EXISTING service. `up()` was
the last single-sample checker and now retries 4× reporting the attempt count.

⚠️ **DO NOT "FIX" IT BY WARMING.** `keep-warm.yml` pings Keycloak ONLY, on
purpose — its header does the sum: free services share ONE ~750h monthly
allowance, Keycloak warm 24/7 consumes all of it, and over-warming is how this
account was SUSPENDED on 2026-07-28. That header assumes FOUR services; there
are now NINE. The only zero-cost lever is how many stay deployed — fleet-web
(0/29 screens) and insurance-web (0/28) are the candidates. **Owner's call.**

## ▶ NEXT, IN ORDER

0. 🔴 **Finish slice 5 above — the API half.**
1. ~~**The platform-admin realm-role path**~~ — **SUPERSEDED, and the realm-role
   shape is forbidden. Kept only for context:** `platform_administrator` is a Keycloak
   realm role, `KeycloakJwtService` parses `realm_access.roles` into `realmRoles`,
   and **nothing consumes it** — authorization reads the DB membership only.
   Solar's `platform_super_admin` (matched from the claim, no tenant) is the
   target shape. **Needs Codex + Supervisor**: it lets a token claim confer
   privilege without a tenant.
2. **75 screens still say "not built yet"** — supplier 29, fleet 24, insurance 22.
   `bash scripts/live-screen-audit.sh` re-measures from the LIVE site. Start with
   supplier: 4 screens already work there.
3. **`insurance_assessor` has NO registration path** — the 4th instance of "which
   production path WRITES this role?". Ask it before building the 28 screens.
4. **14 two-column `(x, tenant_id)` FKs** still carry the cross-organisation hole
   073 closed for eighteen others. `RELATIONSHIPS.md` §8 names them.
5. **Port the 5 supplier-web deploy defects** listed further down — the fixed
   forms are already in `deploy-towing-web.yml`.

## ✅ CLOSED 2026-08-10

- **`/customer-reception/leads` was NOT a product defect.** The owner tree has no
  `customer-reception` group; its leads item is `/workshop-operations/leads`, and
  `requireNavRoute` correctly `notFound()`s a route the viewer's tree does not
  advertise. **The TEST asserted another role's tree** — the second instance in
  that same file, the first having been fixed on 08-09. Route is now derived
  from the tree.
- **Security CI had been red since 08-03 and every push run said green.**
  `gitleaks-action@v2` scans only the pushed commits on `push` but the WHOLE
  history on `schedule`. Both findings were one synthetic JWT and its echo in a
  review log. `.gitleaksignore` allowlists them **by fingerprint**, never a path
  rule. Proven green by dispatch.
- **The journey seeder ran** (owner approved): 5 journeys walked to `completed`,
  15 stage events each, ratings 5/5/4/2/1. Its read-back was invalid SQL and its
  verdict column called NULL "NOT happy"; both fixed, `verify_only=true` added so
  the report can be re-run without writing.

## ⚠️ CORRECTIONS TO EARLIER ENTRIES IN THIS FILE

- **Gap A1 is CLOSED.** `LIVE_OWNER_EMAIL`/`LIVE_OWNER_PASSWORD` exist (08-09
  23:11). The "still owner-only / skips 4" notes below are STALE.
- **`POST /registration/fleet` is no longer 404** — the door was opened 08-09.
- `signing out ends the session` was the mystery "1 skipped": serial mode skipped
  it because the leads test failed ahead of it. It passes now.

## 🔴 THE LESSON WORTH CARRYING

**Three of four defects were in the CHECKING MACHINERY, not the product** — a
test on the wrong role's tree, a scanner firing on a fake JWT, and a seeder whose
verification was invalid SQL while the write it verified had committed.
**Reproduce every red before changing anything.** And no single reviewer caught
everything: Codex found one, the Supervisor found two more it had missed, and
Codex's next pass caught a false claim inside the fix for the Supervisor's own
finding.

⚠️ **Put Codex prompts in a quoted heredoc FILE.** Backticks inside a
double-quoted shell string execute — one prompt became `f.rating: command not
found`, 52 bytes, **exit 0**.

---

# ═══ ✅ DEPLOYED 2026-08-09 18:38–18:50 UTC — `aaa15d4` → `d6b643d` ═══

The five stranded commits are on production. The pass, in order, and what each
one actually proved:

| Step | Run | Result |
|---|---|---|
| `git push origin master` | — | `aaa15d4..d6b643d` |
| Release (auto, on push) | `31329537341` | success — apex rebuilt |
| `apply-migrations -f confirm=APPLY` | `31329576051` | **3 applied, 71 skipped, 74 in repo** — 073, 074, 075 |
| Apply-migrations re-check (auto, post-Release) | `31329738077` | success — **PENDING 0** |
| `deploy-api -f confirm=APPLY` | `31329772251` | success — image built, pushed, Render deploy waited for and read back |
| Live suite | `31329916776` | **25 passed / 0 failed / 4 SKIPPED** |
| Release + live suite again (doc push `6d8da05`) | `31330153943` / `31330283008` | success — same **25 / 0 / 4** |
| **towing-web deploy** (`efa7a7b`) | | |
| `sync-keycloak-client-uris -f confirm=APPLY` | `31332267635` | **4 URIs applied** across 1 client |
| `deploy-towing-web` DRY RUN | `31332294300` | success — image built, container served 200 with sign-in |
| `deploy-towing-web -f confirm=APPLY` | `31332411581` | success — `autoworkshop-towing` created, `update_in_progress` → `live` |
| Live suite, with towing coverage (`20655d5`) | `31332651991` | **45 passed / 0 failed / 4 SKIPPED** (was 25) |

⚠️ **The 4 skips are the anonymous-vs-signed-in split.** The suite runs two jobs;
the anonymous job is 25/0/0 and the **signed-in job is 0 passed / 0 failed / 4
skipped** because `LIVE_OWNER_EMAIL` / `LIVE_OWNER_PASSWORD` are unset (gap A1,
owner-only). Reading only the anonymous job reports "0 skipped" and hides them —
it did exactly that once during this pass. **Always read both jobs.**

⚠️ The first Live suite (`31329738097`, auto-chained off Release) failed 2 —
customer-web 502. That was a **free-tier cold start**, not a defect: the same two
checks passed on the very next run four minutes later. Do not chase it.

**Verified by hand afterwards, because the live suite does not cover today's
work at all** — it has no towing and no fleet checks:

- All **8 towing route families answer 401** on `/api/v1/towing/*` (dashboard,
  requests, recoveries, drivers, vehicles, incidents, invoices, settings) —
  deployed and gated, not 404.
- ⚠️ **The API has a global prefix `api/v1`** (`apps/api/src/main.ts:10`). A probe
  without it returns 404 on every route and looks exactly like "not deployed".
  One route also returned curl `000` once and 401 on three retries — a transport
  failure is not an authorization fact.
- The **`unnamed` alert fix (075) is applied but not exercised** — proving it
  needs a real registration on live, which has not been run.

**Still-open live gaps this pass did NOT close** — see the section below.

---

# ═══ WHAT SHIPPED (now on production) ═══

| Commit | |
|---|---|
| `9a03e45` | 18 organisation-scoped foreign keys — migration 073 |
| `d79d07f` | Towing: 7 tables, 14 routes, 10 screens — migration 074 |
| `7cefd88` | Fleet registration door + a live "unnamed" defect — migration 075 |
| `ef82dce` | ADR-020 — how a fleet sees workshop data |

**Coverage moved 255 → 265 of 380 distinct screens (67% → 70%).**

## 🔴 The coverage audit had been measuring two apps out of seven

The owner said functionality was missing while `audit-menu-coverage.mjs` printed
`0 dead ends`. Both were true: it measured six role trees across workshop-web
and customer-web only, and `COMPLETION_PLAN.md` says the other five apps are
"out of scope for this plan". It now measures **11 trees across all 7 apps** and
prints a deduped headline. **113 dead ends remain.**

| App | Working |
|---|---|
| workshop-web | 213 · customer-web 40 · **towing-web 10/10 (NEW)** |
| supplier-web | **4 of 39** |
| admin-web | **5 of 26** |
| fleet-web | **0 of 29** |
| insurance-web | **0 of 28** |

---

# ═══ ▶ NEXT: FLEET, AND BOTH BLOCKERS ARE ALREADY CLEARED ═══

Build order is settled. Do NOT re-derive it.

1. **Fleet domain schema** — vehicles, drivers, maintenance plans, downtime,
   cost centres, approval limits, service policies. Org-scoped to the
   `fleet_operator` org, composite keys from the first line (copy 074's shape).
2. **Fleet API** — including the membership aggregation ADR-020 describes.
3. **The 29 screens.**

**Blocker 1, CLEARED by 075:** nothing could create a `fleet_administrator` at
all. `identity.register_fleet` is the missing door.

**Blocker 2, CLEARED by ADR-020:** a third of the 29 screens are rows in the
WORKSHOP's organisation. Owner chose the membership route — the fleet's user
holds an ordinary `customer` membership at each workshop, resolved by
`memberships_for_subject`, and the API reuses `SelfServiceService` with a
`TenantContext` per workshop. **No policy is widened.** Proven, not inferred:
one account held **2 active memberships** and the lookup saw both.

⚠️ ADR-020's consequence for the build: an empty Repairs screen must say *"you
have not added a workshop yet"* and link to enrolment — never render blank.

---

# ═══ 🔴 DEFECTS FOUND TODAY THAT ARE STILL LIVE ON PRODUCTION ═══

**Every registration admin alert says "unnamed".** Since migration 070, for
WORKSHOP and SUPPLIER registrations too — not just fleet. The trigger reads the
organisation name before opening any door; `identity.organizations` has only
`tenant_isolation` (no tenant context during registration), an INSERT-only
bootstrap policy, and `enrolment_bootstrap_select` gated on `app.bootstrap_org`,
**which no registration function ever set**. Invisible locally because the
definer's owner is a superuser. **Fixed in 075 — but not deployed.**

**14 two-column `(x, tenant_id)` foreign keys remain**, each with the same
cross-organisation hole 073 closed for eighteen others. `fk_line_invoice_scope`,
`fk_claim_policy_scope` and twelve more, all named in
`docs/05-database/RELATIONSHIPS.md` §8. That is a migration of its own.
(Two more are correctly 2-column — their parent IS `identity.organizations`.)

---

# ═══ LESSONS THIS SESSION ADDED ═══

1. 🔴 **RLS ANSWERS REACHABILITY FOR READS, NOT REFERENCES.** RI checks bypass
   RLS even under FORCE. Measured: org A could not read org B's job card
   (0 rows) and could still write a warranty citing it (`INSERT 0 1`).
2. 🔴 **A COMPOSITE `ON DELETE SET NULL` NULLS EVERY KEY COLUMN**, including
   NOT NULL `tenant_id`. Name the column: `SET NULL (job_card_id)` (PG15+).
3. 🔴 **`NO ACTION`, NOT `RESTRICT`,** when the child is also org-CASCADEd —
   RESTRICT is checked immediately and offboarding an organisation can abort on
   trigger firing order.
4. 🔴 **A MIGRATION'S OWN ORPHAN CHECK WAS INERT UNDER FORCE RLS.** 6 rows as
   owner, 0 as the Render role. Set `app.current_role='admin'` **and assert the
   escape is live** rather than assuming it.
5. 🟢 **RLS IS TESTABLE LOCALLY: `SET ROLE autoworkshop_app`** (NOBYPASSRLS =
   Render's shape). verify/074 does it. **Stop writing "only meaningful under
   rehearsal".**
6. 🔴 **MY OWN DETECTOR WAS WRONG TWICE BEFORE THE BUG WAS REAL** — wrong
   `event_key`, then wrong `resource_id`; both reported "no admin alert"
   against an alert that fired. Use a **before/after delta**, never a guessed
   column filter.
7. 🔴 **THIRD ROLE THAT COULD NOT EXIST** (`customer` → `supplier_owner` →
   `fleet_administrator`). **Ask it of every role before building its screens.**
8. 🔴 **`pnpm typecheck | tail` REPORTED EXIT 0 WHILE TYPECHECK FAILED** —
   fourth instance. Capture `$?` separately.

---

# ═══ GATES AT CLOSE (all local) ═══

migrations **75/75** · verify/073 **8/8** · verify/074 **7/7** · verify/075
**5/5** · rehearse/075 green under NOBYPASSRLS · API **924 passed / 0 failed /
1 skipped** · lint **16/16** · typecheck **17/17** · nav coverage **0 gaps** ·
towing-web builds all 10 routes · API boots, all towing routes **401 not 404**.

**Nothing has been run against production this session.** The last live
measurement was at 12:50 UTC: five services up, 18 parts, 1 mechanic, all three
owner buttons present.

---

# ═══ 🔴 NINE RENDER SERVICES, AND THE THREE NEWEST FLAP ═══

**Owner said "deploy all" (2026-08-09 pt3). All seven web apps now have a deploy
path.** New this pass: `autoworkshop-{admin,fleet,insurance}`, plus customer-web
redeployed (it was stale since 08-08 — `marketplace-ui` and `navigation` had
changed under it).

| Service | State |
|---|---|
| apex, api, customer, supplier, towing, keycloak | healthy — **5 of 5** back-to-back |
| **admin, fleet, insurance** | **intermittent** — see below |

🔴 **MEASURED MINUTES AFTER CREATION: the same URL, back-to-back, answered
200, 200, 404, 200, 404, 404.** Every 404 is a **10-byte `Not Found` from
Render's edge carrying `x-render-routing: no-server`, returned in ~0.6s** — far
too fast to be a cold start, which was measured at **136s** on this account. The
router intermittently has no instance for a service that is otherwise up.

**It is NOT a platform outage.** The six pre-existing services answered 5/5 at
that same moment. It is the three newest on a free allowance now asked to hold
**nine**, which the repo has warned about since the fifth.

**The live suite records it rather than hiding or crying wolf:** each of the
three retries up to four times and reports the attempt count. Latest run
(`31336053124`) — **48 passed / 0 failed / 4 skipped**, with
`fleet-web is reachable — took 3 attempts ([404, 404, 200])` and
`insurance-web — took 2 attempts ([404, 200])` in the output. **A rising attempt
count is the early warning; if these start failing outright, the free pool is
the first suspect and these three are the newest consumers.**

⚠️ **AND TWO OF THE THREE HAVE NOTHING TO SHOW.** fleet-web is **0 of 29** built
screens and insurance-web **0 of 28** — every route renders the honest
not-built-yet placeholder. admin-web is **5 of 26**. Deploying them made the
SHELL reachable, not features. Neither can be signed into at all:
`POST /registration/fleet` is 404, and `insurance_assessor` has no registration
path whatsoever.

---

# ═══ 🔴 NEW GAPS FOUND WHILE VERIFYING THE DEPLOY ═══

**C1 — towing-web had no deploy path. ✅ CLOSED 2026-08-09 pt3, owner said
"yes deploy".** Live at **https://autoworkshop-towing.onrender.com** — the
**SIXTH** Render service on the shared free allowance (A4). Ten screens, eight
rendering anonymously and two correctly 404 (below). Shipped: `deploy-towing-web.yml`,
`apps/towing-web/Dockerfile`, `output: 'standalone'`, the origin on the Keycloak
client, and **20 new live-suite checks**. Keycloak sync applied 4 URIs.

⚠️ **`/operations/invoices` and `/operations/settings` return 404 anonymously and
that is CORRECT.** `requireNavRoute` calls `notFound()` for a route the viewer's
nav tree does not advertise, and those two carry `finance.read` /
`organization.admin`. The live suite asserts the 404 **as a security assertion** —
a 200 there would mean a permission-gated screen had started rendering for the
public. Nobody has yet proved they render for a *permitted* user; that needs
live credentials (gap A1).

⚠️ **The live realm carries a URI the committed file does not:**
`https://towing.autoworkshop.aiappinvent.com/*` was already on the towing client.
The committed realm is stale relative to live, and the add-only sync will never
reveal that direction of drift.

**C2 — `POST /api/v1/registration/fleet` returns 404.** Migration 075 created
`identity.register_fleet` in the database, but no controller calls it —
`apps/api/src/identity/registration.controller.ts` has `workshop`, `supplier`
and `customer` only. The door exists in the schema and nothing opens it. This is
the *inverse* of "a route with no caller": a **caller with no route**. It is
step 2 of the fleet build below, not a regression — but until it lands, a
`fleet_administrator` still cannot be created through the product.

---

# ═══ 🔴 supplier-web SHARES FIVE OF THE DEFECTS FOUND IN REVIEW ═══

`deploy-towing-web.yml` was modelled on `deploy-supplier-web.yml`, so the review
of the copy is a review of the original. **These are live in supplier-web today
and were NOT touched** — changing a working deploy path was out of scope:

1. **The deploy poll falls through.** After 60 × 20s the loop just ends and the
   step continues to the read-back. On an update the PREVIOUS image still serves
   200 with a sign-in link, so the run goes **green for a deploy still stuck in
   `update_in_progress`.**
2. **The new deploy's id is discarded** (`POST /deploys >/dev/null`) and the poll
   reads `deploys?limit=1` — a race where "latest" is the previous, already-live
   deploy, so the read-back verifies the **OLD build**.
3. **`curl … || echo 000` yields `000000`**, not `000` — measured, length 6. Any
   comparison against `"000"` is false.
4. **The cold-start retries have no `sleep`** — six instant 502s in under a
   second, calling a spun-down service dead 30s before it wakes.
5. **`len(merged) < len(cur)` cannot fire** — a dict that starts as `cur` and is
   `update()`d can never be shorter. The guard asserts nothing.
6. `NEXT_PUBLIC_APP_URL` is set as a Render **runtime** var; it is a **build-time
   inline**, so it is inert while reading as configured.

The fixed forms are all in `deploy-towing-web.yml`. Porting them back is a small,
self-contained slice.

---

# ═══ STILL OPEN FROM 08-09 pt1 (unchanged) ═══

- **A1** `LIVE_OWNER_EMAIL` / `LIVE_OWNER_PASSWORD` unset → the signed-in half
  of the live suite SKIPS 4. **Owner-only.**
- **A2** Nobody has driven the supplier funnel end to end on live as a human.
- **A3** "Add new" on 2 of ~40 list screens. (Towing's 10 all have one.)
- **A4** A fifth Render service shares the free instance-hour pool.
- **B** MX record still blocks all email.
