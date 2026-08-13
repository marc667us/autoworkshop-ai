# Next session — start here

**Written at the close of 2026-08-13. Tip `062876c` on `master`, tree clean, all pushed.**

---

## What today was

**Ten Render services became one artifact with seven packs inside it (ADR-021),
and it is live.** Owner direction: *"only autoworkshop app and its databases must
be there"*, *"remove all rest"*, *"the packages for insurer, suppliers, customer
must be web app on their [own] but on the autoworkshop artifact that's called by
main"*.

| Render | Before | After |
|---|---|---|
| Web services | 7 (two suspended for `billing`) | **1** — all seven packs |
| API | `autoworkshop-api` | unchanged |
| Identity | `autoworkshop-keycloak` | unchanged |
| Database | `autoworkshop-postgres` | unchanged |

That is Solar's shape, which ADR-011 names as the reference: `solarpro-global` +
`solarpro-keycloak` + a database.

**Live suite: 70 passed / 0 failed / 1 skipped** (66 anonymous + 4 signed-in).
341 pages, 340 routes, one Next.js process.

---

## 🔴 START HERE — THREE THINGS, IN THIS ORDER

### 1. The database expires **2026-09-01** and has never been backed up

`autoworkshop-postgres` — `plan=free`, `expiresAt=2026-09-01T14:52:53Z`,
confirmed from the Render API on every run of `backup-production-db.yml`.

🔴 **`infrastructure/backup/` BACKS UP THE WRONG DATABASE.** Encrypted physical
and logical backups, checksums, manifests, off-host copies, retention rotation,
`restore-drill.sh` at **RPO 0 across 4/4 drills**, four Windows scheduled tasks,
`check-backup-health.sh` reporting **HEALTHY 7/7** — every one of those numbers
is about the **local Docker container** `aw-postgres`. Not one file under
`infrastructure/backup/` mentions `onrender`, `RENDER` or `DATABASE_URL`.

**`backup-production-db.yml` is written and nearly working.** What works:
the firewall open/restore pair (single /32, `PATCH 200`, entry removed and
verified on read-back), schema discovery (prints all 18), the probe, and a
restore-and-compare verification that has not yet had a dump to check.

**▶ THE ONE REMAINING FIX.** The last run still failed on
`ERROR: permission denied for table databasechangeloglock`. That table is in
**`public`**, not in `keycloak` — Keycloak's Liquibase bookkeeping sits in
`public` alongside ours and we cannot read it. Add to the `pg_dump` invocation:

```
--exclude-table='public.databasechangelog*'
```

A patch attempting exactly this failed to apply on a whitespace mismatch at
session close and was deliberately NOT force-fitted. Apply it by hand, then:

```bash
gh workflow run backup-production-db.yml
```

**Then the destination.** `COMBINED_PLAN_v2` decision D6 says **not Render
free** — it expires at 30 days, the exact failure that took Solar down on
2026-07-09. The plan names **Neon free** (no expiry) and lists
`infrastructure/neon/` in its tree; that directory has never been created.
Creating a Neon account is an **owner action**. **Never propose spending.**

### 2. "Access is denied to users" — reported, unverified

Owner reported this at session close. **The leading hypothesis is the session
cookie rename**: everyone signed in before 2026-08-13 holds
`authjs.session-token.<workspace>`, and the artifact now reads
`authjs.session-token`, so they read as signed out and must sign in once.

**That is a HYPOTHESIS. It has not been measured.** Reproduce it before fixing
it — five confident diagnoses were wrong today, and every one of them cost a
deploy cycle.

### 3. New requirement from the owner — user roles, signup and login

**SCOPED 2026-08-13 at close. Measured, not assumed — but only partly: the
registration controllers were read, the Keycloak realm's role list was not.**

#### What exists today

**Four registration doors** (`apps/api/src/identity/registration.controller.ts`):
`POST /registration/workshop` · `/supplier` · `/fleet` · `/customer`.

**Four grantable roles** (`membership.service.ts`): `platform_administrator` ·
`workshop_owner` · `supplier_owner` · `fleet_administrator`.

🔴 **THE TWO LISTS DO NOT MATCH, AND THE GAP IS THE WORK.**

| Role | Self-service door | Grantable by an admin |
|---|---|---|
| `workshop_owner` | ✅ `/registration/workshop` | ✅ |
| `supplier_owner` | ✅ `/registration/supplier` | ✅ |
| `fleet_administrator` | ✅ `/registration/fleet` | ✅ |
| `customer` | ✅ `/registration/customer` | ❌ **not in the grantable list** |
| `platform_administrator` | ❌ none, correctly | ✅ (gated on a grant record, migration 078) |
| `insurance_assessor` | ❌ **none** | ✅ |
| `towing_operator` | ❌ **none** | ❓ not in the list read |
| workshop staff (manager, technician, reception, cashier, storekeeper, QC, supervisor) | ❌ none | ❓ not in the list read — presumably invited by an owner, **VERIFY** |

#### The work, in dependency order

1. **Answer the role question for every role in the product**, not just the ones
   with screens. *Which production path WRITES this role?* It has caught four
   roles that could not exist — `customer` (08-08), `supplier_owner` (08-09),
   `fleet_administrator` (08-09), and `insurance_assessor`, which is grantable
   but has no door. **Do this before building any screen.**
2. **`insurance_assessor` and `towing_operator` have no registration path.**
   Both packs are deployed and reachable. Insurance is 0 of 28 screens and fleet
   1 of 29 — deploying them made the SHELL reachable, not the features.
3. **Staff invitation.** "Add staff" has never had a screen (open since 07-28).
   A workshop owner cannot create a technician, so seven of the nine workshop
   roles have no production path at all. This is probably the largest single
   gap in the identity model.
4. **Sign-up.** One route at the artifact root, `/api/auth/register`. Before the
   merge there were two, because two apps registered two Keycloak clients.
   Decide what a stranger signing up BECOMES — today the marketplace's
   "Create a free account" leads to a Keycloak registration that creates an
   application user with **no membership**, and a user with no membership has no
   workspace.
5. **Sign-in.** Works, and the constraints are recorded above: one client,
   `ARTIFACT_WORKSPACE` in `apps/web/auth.ts`, renaming is a realm change.

#### Constraints that bind this work

- `COMBINED_PLAN_v2` §4 and `PLAN_EXTENSION_v1` §2.1 — **authority comes from
  membership and grant records, never from a token claim.** §2.1 exists BECAUSE
  Codex found that hole at plan stage, and a `NEXT_SESSION_SCHEDULE` note once
  asked for the forbidden shape.
- 🔴 **ASK OF EVERY ROLE: WHICH PRODUCTION PATH *WRITES* IT?** This has caught
  four roles that could not exist in production — `customer` (08-08),
  `supplier_owner` (08-09), `fleet_administrator` (08-09), and
  `insurance_assessor`, which IS grantable (`membership.service.ts:37`) but has
  **no self-service registration door**.
- The artifact authenticates as **one Keycloak client**, `autoworkshop-customer-web`
  (`apps/web/auth.ts`, exported as `ARTIFACT_WORKSPACE`). The name is a misnomer
  for a client serving seven packs. **Renaming it is a REALM change, not a code
  change** — point it at a client the realm does not authorise and sign-in breaks
  everywhere at once, which happened today.
- Sign-up currently goes through `/api/auth/register`, one route at the artifact
  root. Before the merge there were two, because two apps registered two clients.

---

## What shipped today

1. **ADR-021** — one artifact, seven packs, `main` calls them. Supersedes only
   the *deployment* half of `COMBINED_PLAN_v2` §12 row 2; that row settled
   "7 apps or 1" for **codebase structure** and was right. Nothing in the plan
   ever asked for seven Render services.
2. **341 pages moved** by `git mv` of whole `app/` directories as units, so every
   relative import kept resolving. Only **7 files** imported out past `app/`.
3. **One Auth.js instance, one session cookie, one `/api/auth/*`, one
   `/auth/error`** at the artifact root.
4. **`render-inventory.yml`** (read-only) and **`render-consolidate.yml`**
   (four-guard delete). Seven services deleted, verified three ways each.
5. **`deploy-web.yml`** — replaces six deploy workflows, with all five defects
   from the 08-10 supplier-web review fixed rather than copied.
6. **Legacy-link redirects** — every pre-consolidation URL now resolves.

---

## Defects the gates caught that three green checks did not

- **Every job-card detail link would have 404'd for all nine roles.**
  `jobCardListHrefFor` returned unmounted hrefs and detail links are built from
  them. Typecheck, lint and a 340-route build were green over it — a string is a
  string.
- **`/auth/error` did not exist.** All seven copies moved with their packs while
  Auth.js still pointed at the artifact path. A failed sign-in would have hit a
  bare 404 — at exactly the moment people meet it, since Keycloak is 126–137s
  from cold.
- **`/workshop` was a second copy of the public storefront**, and `/customer`
  404'd. Only running the app found either.
- **Six post-sign-in destinations pointed at moved paths** — the marketplace
  sign-in, the request-service funnel, the VIN funnel, the workshop shell's own
  link, plus two of mine.

---

## 🔴 MY ERRORS TODAY — read these, they are the expensive part

1. **Five wrong diagnoses on one database connection**, each asserted as
   measured: TLS · the Render firewall · client/server version · backticks in a
   SQL comment · a bash parse error. The error text said
   `SSL connection has been closed unexpectedly` and actually meant
   `permission denied`. **The side-by-side psql/pg_dump probe found it in one
   run, and I ran it fourth instead of first.**
2. **"Match the server version" was the wrong rule.** Server is 16.14; pinning
   client 16 broke `psql` too. Only 17 has ever connected.
3. **I pushed three times having run only some of eleven test targets.** CI
   caught `packages/auth`, then `apps/web` twice. Once I ran tests and lint but
   not a build, and shipped an import above a `'use server'` directive — a
   directive's *position* is not a type error and not a lint rule.
4. **I reintroduced a recorded defect inside a comment explaining a different
   defect** — backticks in a double-quoted shell string execute.
5. **I broke every existing URL and did not notice.** The live suite passed
   70/0/1 throughout, including a run dispatched while the owner was looking at
   the 404s. It only requests paths the *new* topology advertises. **After a URL
   migration, test the OLD urls.**
6. **I guessed a failure destination twice** when the Playwright trace had
   printed `navigated to …/openid-connect/logout` and stayed there. **Read the
   trace's navigation line before theorising.**

---

## Commands

```bash
bash scripts/start-session.sh                 # ALWAYS first
bash scripts/record-live-state.sh             # what is really deployed

gh workflow run render-inventory.yml          # read-only: services, plans, domains, DBs
gh workflow run backup-production-db.yml      # ⚠️ still failing — see item 1
gh workflow run deploy-web.yml -f confirm=APPLY
gh workflow run live-suite.yml                # READ BOTH JOBS

# ⚠️ Run the WHOLE workspace, not the packages you touched. Eleven targets.
pnpm -r --filter '!@autoworkshop/api' --filter '!@autoworkshop/e2e' \
        --filter '!@autoworkshop/mobile' test
cd apps/web && ./node_modules/.bin/next build     # a build catches what tsc and lint do not

printf '%s' "$P" > /tmp/p.txt   # ALWAYS a FILE — backticks in "..." EXECUTE
C:/Users/USER/nodejs/codex.cmd exec --skip-git-repo-check -s read-only - < /tmp/p.txt
```

⚠️ **A live-suite run dispatched DURING a deploy fails against a half-deployed
site.** Run `31741567179` failed; `31741791077` three minutes later was green on
the same commit. Do not read the first as a regression.
