# Session handover

## ═══ 2026-08-10 — three reds that were not the product, and half a security fix ═══

**Tip `2a179dc`. 8 commits (`4188c2a` → `2a179dc`). Tree clean, all pushed.**
**PRODUCTION == BUILD**: migrations **IN REPO 76 / APPLIED 76 / PENDING 0**.
**Live suite 67/0/0 anonymous + 4/0/0 signed-in = 71/0/0**, still 71/0/0 after
migration 077 went live. Security CI **6/6** on a full-history dispatch.

**▶ NEXT SESSION STARTS AT `.claude/NEXT_SESSION_SCHEDULE.md`.**
**▶ FIRST TASK: finish the platform-admin API half (below). It is a CRITICAL and
it is live-unprotected right now.**

### The one thing you must not miss

🔴 **Migration 077 hardened the DATABASE and the API was NOT changed.**
`identity.is_platform_admin()` now requires an un-revoked row in
`identity.platform_administrators`. The API still derives `platform.admin` from
`ROLE_PERMISSIONS['platform_administrator']`, keyed on the membership
`role_name`. **So revoking a grant on production today removes DB reach and
leaves every API gate open** — and `security.controller.ts` reads `pg_catalog`,
so for that endpoint the application check IS the enforcement. Fix: resolve grant
state during `TenantContext` construction and gate `platform.admin` on it.

⚠️ The schedule's own item 3 asked for the FORBIDDEN shape (platform admin from
the Keycloak `realm_access.roles` claim). COMBINED_PLAN_v2 §4 and
PLAN_EXTENSION_v1 §2.1 both prohibit a claim conferring authority; §2.1 exists
*because Codex found that hole at plan stage*. **Read the plans before
implementing a note in a control file.**

### What shipped

1. **`/customer-reception/leads`** — the one live failure, and NOT a product
   defect. The owner tree has no `customer-reception` group; its leads item is
   `/workshop-operations/leads`. The TEST asserted another role's tree — the
   second instance in a file that documents the first in its own comments.
2. **Security CI had been red since 08-03 behind eight green push runs.**
   `gitleaks-action@v2` scans only pushed commits on `push`, the whole history on
   `schedule`. Both findings were one synthetic JWT and its echo in a review log.
   `.gitleaksignore` allowlists them BY FINGERPRINT, never a path rule.
3. **Journey seeder run on production** (owner-approved): 5 journeys to
   `completed`, 15 stage events each, ratings 5/5/4/2/1. Its read-back was
   invalid SQL and its verdict column called NULL "NOT happy"; both fixed, and
   `verify_only=true` added so the report re-runs without writing.
4. **Migration 077** — platform authority is a grant record. verify/077 **10/10**.
5. **customer-web 502** — see below.

### 🔴 Diagnoses I got WRONG, recorded so they are not repeated

- **"customer-web 502 is a cold start" — WRONG, twice.** The suite's OWN wake
  step recorded `customer-web -> 200` minutes before the suite read 502 from the
  same URL. It was awake. On demand: 200 fifteen times at ~1s, ten more with the
  suite's exact UA. It is Render's edge flap; `up()` was the last single-sample
  checker and now retries reporting attempt counts (`3616e61`).
- **My `/security-review` on migration 077 reported ZERO findings.** Codex then
  found two CRITICALs in it, one of which I had explicitly considered and
  dismissed by reasoning about who may WRITE the grant table — the escape
  (`app.current_role='admin'`, a GUC any role can set) never touches it.
- **A verify check passed for the wrong reason**: the half-revocation check ran
  after the revocation check, so it updated 0 rows whenever the revoked grant was
  the only active one. It passed only because that DB held a SECOND grant.

### ⚠️ Open, not blocked

- **Release needs a re-run** — failed on a **GHCR secondary rate limit** after
  the image built and passed its container smoke test. Six pushes in one day.
  The apex still serves the previous image.
- **Nine free Render services share one ~750h allowance sized for four.**
  `keep-warm.yml` pings Keycloak ONLY, deliberately — over-warming is how this
  account was SUSPENDED on 2026-07-28. **Do not add services to the warmer.**
  The only zero-cost lever is how many stay deployed; fleet-web (0/29 screens)
  and insurance-web (0/28) are the candidates. **Owner's scope decision.**
- **A local API is listening on port 4000** (PID 10932, started 05:10 on 08-10,
  origin unexplained — I did not start it). `start-session.sh` kills stale
  listeners, so it is covered; check it first if a local defect looks impossible.

### Commands this session actually used (copy these, do not re-derive)

```bash
bash scripts/start-session.sh                      # ALWAYS first
bash scripts/record-live-state.sh                  # what is really deployed
bash infrastructure/migrations/run.sh              # local migrations (checksummed)
docker exec -i aw-postgres psql -U autoworkshop -d autoworkshop <   infrastructure/migrations/verify/077_platform_administrator_grants.sql

# RLS is testable locally — this is Render's privilege shape
docker exec -i aw-postgres psql -U autoworkshop -d autoworkshop -c "SET ROLE autoworkshop_app; ..."

# gates
printf '%s' "$P" > /tmp/p.txt   # ⚠️ ALWAYS a FILE — backticks in a "..." string EXECUTE
C:/Users/USER/nodejs/codex.cmd exec --skip-git-repo-check -s read-only - < /tmp/p.txt
# Supervisor: /code-review , /security-review , /verify

# production
gh workflow run apply-migrations.yml -f confirm=APPLY
gh workflow run live-suite.yml            # READ BOTH JOBS: live + signed-in
gh workflow run security.yml              # dispatch = FULL HISTORY scan
gh workflow run seed-repair-journeys.yml -f verify_only=true   # re-read, writes nothing
gh run view <id> --log | grep "PASSED"    # READ THE COUNT, never the exit code
```

⚠️ `gh run view --log` returns **0 bytes and exit 0** for older/in-flight runs.
Use the run's artifact (SARIF etc.) or re-dispatch rather than concluding "no output".

---

## ═══ 2026-08-07 — slices 6-11, deployed, and three security findings ═══

**Tip `db5e525`. PRODUCTION == BUILD.** local = origin = Release headSha,
52 migrations applied on live, 0 pending, tree clean, no servers running.

**▶ NEXT SESSION STARTS AT `.claude/NEXT_SESSION_SCHEDULE.md` — LIST A, then LIST B.**

### What shipped

All six remaining slices, then re-mounts: **157 -> 215 of 242**.

| Slice | Routes | Total |
|---|---:|---:|
| 6 Settings & workshop admin | 10 | 153 |
| 7 Messaging (text + files) | 9 | 162 |
| 9 Customer self-service | 6 | 182 |
| 10 Knowledge, tools, learning | 6 | 188 |
| 8 Reports | 14 | 202 |
| 11 In-app voice + video | 6 | 208 |
| technician re-mounts | 7 | **215** |

Manager 100% · Owner 98% · Default 98% · Reception 97% · Technician 50%->67% ·
Customer 31%->60%. Migrations **045-052**, each with a verify.

**In-app WebRTC shipped** (owner asked for in-app phone/video/text). Signalling
rides our own API and Postgres; media flows browser-to-browser and never touches
the platform. My first analysis said this could not ship on the free tier — that
conflated signalling (a message channel, which we had), STUN (stateless, free)
and TURN (the only piece needing a UDP relay, and a fallback).

### 🔴 The three findings that matter most

1. **ELEVEN UNGATED READS, LIVE ON PRODUCTION.** A signed-in *customer* could
   read the workshop's whole invoice book, payment record, stock, supplier
   orders and warranty decisions. `customer` is a real membership role in the
   same organisation; RLS is org-scoped and cannot tell them apart; controllers
   carry only `TenantGuard`; there is **no global guard**. Shipped in slices
   3/4/5 in PREVIOUS sessions — newly found, now fixed and deployed
   (`authz/workshop-roles.ts`). **Writes were gated everywhere, reads nowhere.**

2. **TWO FEATURES HAD NEVER ONCE WORKED**, both found by the Supervisor, not by
   any gate. Slice 11's proxy omitted the API's `/api/v1` prefix so every
   signalling call 404'd and the client swallowed it; every slice-9 write
   committed and then threw 403. Typecheck, lint, build and their verifies were
   green throughout.

3. **THE LIVE REHEARSAL CAUGHT ITS FIRST PRE-PRODUCTION DEFECT.** 048 seeded
   `knowledge.fault_codes` *after* forcing RLS with only a SELECT policy — it
   passed locally because the local role is superuser+bypassrls, and failed on
   live. This is exactly what the workflow was built for after 036-039 cost
   three sessions.

### Also fixed
Codex: the signalling sequence gap (identity values are visible at COMMIT, not
INSERT — a poller could skip one for ever), `createCall`/`createThread`/
`raiseCase` all accepting ids they never validated. A credential blacklist that
let `key`, `access_key`, `passphrase`, `signing_key` and four more straight
through (inverted to an allow-list). Two workflow defects found by RUNNING them:
concurrent rehearsals clobber the database firewall, and a leftover ephemeral
entry would have become permanent.

**Part A closed: A1, A2, A3, A4, A5, A7, A8.** A4's T-0044 was measured at 0px
(the ticket claimed 51px). A5's Playwright re-run found 5 regressions from the
08-05/08-06 landing work — two `<main>` landmarks and 3.62:1 contrast — now 138
passing, the exact 07-29 baseline with ~90 more pages.

### Still open
**A6** (systematic tenant-isolation suite) and **A9** (`RENDER_API_KEY`,
unrotated since the 2026-07-27 leak, owner-only). Plus the customer-scoped reads
that the security fix now requires — LIST A item A1.

### Corrections to earlier claims
- **Solution Studio is BUILT.** I reported it mid-session as the outstanding
  Phase 5 item; it and its `[id]` route are working.
- **I am NOT classifier-blocked** on `apply-migrations.yml`, `deploy-api.yml` or
  `rehearse-migration.yml`. All three ran from here. Older notes saying only the
  owner can run them are stale.
- **Keycloak is not down.** Measured twice on owner report: 125-137s cold, then
  0.5-0.7s. The real Auth.js flow reaches the IdP with no `error=Configuration`.
  Render free-tier spin-down; `keep-warm.yml` cannot hold it because GitHub cron
  delivers ~0.6 runs/h whatever is asked.

---


## 2026-07-28 pt2 — PHASE 4 BUILT, PHASE 5 STARTED · 9 commits · tip `e4efc81`

**Read `.claude/NEXT_SESSION_START_HERE.md` FIRST** — it carries the start-up
commands, the sign-in steps, the acceptance checks and the next task.

Tree clean, pushed. typecheck 15/15 - lint 15/15 - 208 unit tests - page gates 23/23.

### The nine commits

| # | Commit | What |
|---|---|---|
| 1 | `53b2f05` | Phase 4 slice 1 - `core` schema (mig 004), customers + vehicles, first screens |
| 2 | `2dd628b` | The WRITE path - register customer / register vehicle, `apiPost` |
| 3 | `3f512e6` | Detail pages; a detail route gates on its PARENT list route |
| 4 | `dad5f8b` | The customer GARAGE - owner-scoping finally ran against real data |
| 5 | `3d850fa` | Add Vehicle (customer self-service); form controls moved to `packages/ui` |
| 6 | `00a022f` | T-0016 organisation switcher - and two latent lockouts it uncovered |
| 7 | `f187cfb` | Customer dashboard - real data, honest about what is not built |
| 8 | `188a314` | PHASE 5 BEGINS - job cards (mig 006) + customer complaint opens one |
| 9 | `e4efc81` | Fixed the "your session has ended" lie shown to first-time visitors (mig 007) |

### Six defects found by RUNNING things, not reviewing them

1. **The API handed a TECHNICIAN the whole customer book** - 200 with names,
   phones and locations - while the page 404'd them. Tenant isolation held;
   ROLE authorization did not exist. Found with a real token.
2. **`reception_staff` got a 404 on the screen built for them** - the four role
   trees route one concept to four different paths.
3. **The migration ledger blamed an edit nobody made** - CRLF vs LF. The
   anti-drift guard had CAUSED drift: mig 003 was applied by hand, unrecorded.
4. **Owner-scoping had NEVER executed** - every seeded `customers.user_id` was
   NULL, so a customer would have seen an empty garage that looked correct.
5. **TWO lockouts in tenant resolution** - multi-membership, and a stale org
   cookie. Both failed `/me`, so the shell could never render the switcher
   needed to recover.
6. **"Your session has ended" shown to people who never signed in** - reported
   by the owner trying the app. Fixed across all 11 screens.

### Gates

Codex ran on every slice and found **8 real defects**, including: reads scoped
to tenant when the records are organization-owned; POST body ids reaching SQL
as 500s; a job card assignable to a cashier who would never see it; `engineType`
sent with no field to enter it. The **Supervisor pass found one Codex missed** -
narrowing reads to the organisation while uniqueness stayed tenant-wide turned a
409 into a cross-organisation existence oracle (fixed by migration 005).

---

## 2026-07-28 — findings 5 + 4 closed and gated · THE FIRST DATA-BACKED SCREEN · production suspended

**Tip `9b29ebd` on `master`, pushed, tree clean.**
Read this, then `.claude/TASK_QUEUE.md`, then `docs/13-operations/LIVE-OUTAGE-2026-07-28.md`.

---

### ▶ YOU ARE HERE — the next session starts at this exact point

**T-0005 findings 5 and 4 are CLOSED and fully gated. The first screen that
reads real data has SHIPPED. The next task is PHASE 4 — Customer + Vehicle
(Release 0.3).** Nothing is blocked by the production outage: Phase 4 is built
and tested entirely against the local stack.

#### 1. Confirm where you are

```bash
cd /c/Users/USER/Documents/autoworkshop-ai
git log --oneline -3                            # expect 9b29ebd at the tip
docker ps --format "{{.Names}}\t{{.Status}}"    # aw-keycloak must say (healthy)
```

Keycloak hangs rather than exits when it dies, so `docker restart aw-keycloak`
IS the repair. If Postgres was restarted at any point, restart Keycloak after it.

#### 2. Bring the stack up and re-prove the screen that already works

Build on something proven, not assumed. **Rebuild both — a stale `dist` cost an
hour this session.**

```bash
# dev identities (idempotent; both already exist)
bash scripts/seed-dev-identity.sh                                   # technician
DEV_USER_ROLE=platform_administrator DEV_USER_EMAIL=admin@autoworkshop.local \
  bash scripts/seed-dev-identity.sh                                 # platform admin

# API
cd apps/api && rm -rf dist && ./node_modules/.bin/nest build && cd ../..
set -a && . ./.env && set +a && (cd apps/api && node dist/main.js &)

# admin-web
cd apps/admin-web && rm -rf .next && ./node_modules/.bin/next build
AUTH_SECRET='local_dev_only_2SbQ8vJmK4pR7wZxN1cT6yH9gL0aE3dU' \
AUTH_URL='http://localhost:3006' API_BASE_URL='http://localhost:4000' \
KEYCLOAK_URL='http://localhost:8080' KEYCLOAK_REALM='autoworkshop' \
  ./node_modules/.bin/next start -p 3006
```

Open `http://localhost:3006/directory/organizations`, sign in as
`admin@autoworkshop.local` / `Change_me_locally1!`.

**Expected: `Alpha Motors` ONLY, caption "1 organisation".** Postgres holds two
organisations; `Beta Auto` is Tenant B and must not appear. **If both appear,
tenant isolation has regressed — stop everything, that is Severity-1.**

#### 3. Then build Phase 4

Copy `apps/admin-web/app/directory/organizations/page.tsx` and
`packages/next-shell/src/api.ts`. The order that works:

1. **Migration first** — `infrastructure/migrations/004_*.sql`, customer + vehicle.
2. **Domain service** on the `OrganizationService` shape — rules in the service,
   never the controller, so an MCP tool gets the same rules.
3. **Controller** under `/api/v1`, thin, `@UseGuards(TenantGuard)`.
4. **Page** — `requireWorkspaceAccess()` as the FIRST statement, all four states.
5. **Verify by signing in and looking**, not by the unit suite alone.

##### 🔴 OWNER RULE, BINDING ON THIS SCHEMA (2026-07-27, restated 07-28)

**Use real relationships: foreign keys, joins, normalised tables.** With the
qualifier that matters — **a foreign key cannot carry a tenant predicate.**
Relationships give integrity, RLS gives isolation, **both are required**. So
every tenant-owned table still gets `tenant_id`, `ENABLE` + `FORCE ROW LEVEL
SECURITY`, an explicit `WHERE tenant_id = $1` in the query, and the tenant index
baseline. Migration 001 and `identity.organizations` are the worked examples.

---

### 🔴 Production is DOWN — owner action, not a code problem

| | |
|---|---|
| `autoworkshop.aiappinvent.com` | **503**, in <0.5 s — NOT a cold start |
| `srv-d9ju49id0e5s7389fjlg` | `suspended`, **`suspenders: ['billing']`** |
| Resume | `POST /resume` → **400** `"only services suspended by a user can be resumed"` |
| Staging `srv-d9jun8m417fc73dore50` | **DELETED** on owner approval — `DELETE 204`, `GET` after → 404 |

**A billing suspension cannot be lifted through the API.** Deleting staging
stopped future consumption of the free allowance; it cannot restore a consumed
one, and production stayed 503 across ten checks 20 s apart.

**The reason is UNKNOWN and I could not obtain it.** `GET /v1/owners/{id}`
returns **200 with an empty object** — the key reads services and exposes no
billing detail. ⚠️ **Do not state free-instance-hour exhaustion as fact.** That
is inference; the account also carries Solar's *paid* Postgres, so a payment
issue fits the same evidence. Only the Render dashboard distinguishes them.

**Not caused by any 07-28 commit** — `checks` and `image` pass on all of them.
The Release failure is the deploy step hitting a suspended target; it clears
itself with no code change. Re-run Release once production serves.

Offered but NOT done: delete the retired node service `srv-d9jsliu7r5hc73b1kncg`
— never deployed, never served, domain detached.

---

### The session, in order

| # | What happened | Commit |
|---|---|---|
| 1 | Read the resume pointer. Schedule: finding 5 → finding 4 → T-0016/17 → Phase 4 | — |
| 2 | **Finding 5** — `1d10bd5` left `revokeRefreshToken()` typechecking, untested, **called by nothing**. Wired `performSignOut()` (revoke → clear cookie → end SSO session; the ORDER is load-bearing), 7 per-app server actions, `AccountControl` in the top bar. Proved by A/B refresh grant: **200 without sign-out, 400 `invalid_grant` with** | `32e5f50` |
| 3 | Found while proving it: the session cookie name came from `NODE_ENV` but Auth.js picks it from the URL **scheme** — over http a signed-in user resolved to **nobody**, silently. And `viewerLabels(null).userLabel` was the string `Sign in`, so the control offered **Sign out to anonymous visitors** | — |
| 4 | **Codex gate** — 2 MEDIUM, both real: non-secure cookie name first = session fixation on https; sign-out must not depend on `/me` | `39396ef` |
| 5 | **Supervisor gate, run independently** — 3 MORE that Codex missed. Worst: logout sent no `client_id`, so after any refresh dropping the id token, sign-out clears the cookie, reports success and **leaves the Keycloak session alive** | `6725b14` |
| 6 | **Finding 4** — gated in the layout, then **probed my own fix and found it wrong**: signed out, the DOM showed only the denial but the page's server component **EXECUTED** and its output shipped in the **RSC flight payload**. So: layout gate for chrome/enumeration + `requireWorkspaceAccess()` per page for data + `check-page-gates.sh` as a build gate | `a7d2fa5` |
| 7 | **Codex on the guardrail** — it was satisfied by an *import line*. Made strict, 9/9 self-test | `9560c7a` |
| 8 | *"Run full test on the live site"* → production **and** staging 503. `render-status.yml` had been probing the **retired** service and reported healthy | `aba2f7b`, `44100e3` |
| 9 | Owner: *"yes drop"* → deleted staging behind a dry-run gate with a name assertion; removed the staging gate from `release.yml` and wrote down what protection that costs. Resume attempted; Render refused | `a22fd5f`, `cd3e610`, `f617d4d` |
| 10 | Owner: *"no front end to access the back end"* / *"no feature"* → measured: 8 endpoints, front end called **one**. Built `apiGet()` + the Organizations screen. Verified signed-in: **2 orgs in Postgres, 1 rendered** | `9b29ebd` |

Gates: `typecheck 15/15 · lint 15/15 · unit 149 · identity journey 2/2 · page-gate guardrail 9/9`.

---

### Traps this session paid for — do not relearn them

- **Stale build artifacts, three times.** `apps/api/dist` predating a security
  fix made `/me` 500 then 401 and read like an auth bug. `rm -rf` `.next`/`dist`
  and kill old servers **before** verifying anything.
- **Do NOT kill `wslrelay.exe`.** I did; it severed Docker's host port
  forwarding, so Keycloak and Postgres became unreachable from the host while
  perfectly healthy inside their containers. Repair is `docker restart` per
  container. A Postgres restart also kills Keycloak — restart it after.
- **An indented heredoc terminator inside a YAML `run:` block never closes.**
  The step printed nothing and read like an empty API response.
- **`trap ... EXIT` fires inside a process-substitution subshell** — it deleted a
  fixture directory mid-run and surfaced as "No such file or directory" pointing
  at a line that was correct.
- **`packages/ui` is framework-free on purpose.** Anything needing `next/*`,
  `react-dom` or a server action belongs in `packages/next-shell`.
- **React is pinned to 18.3.1 with Next 15** — a form action works at runtime but
  has no React 18 type. The cast in `AccountControl.tsx` is deliberate; delete it
  if React goes to 19.
- **Vitest cannot resolve `next/server`** in `packages/auth`, so anything
  importing `next-auth` cannot be imported from `tokens.test.ts`. That is why
  `origin.ts` and `logout-url.ts` are separate modules.

### Also open

- **T-0016** switchers, **T-0017** panels — both visible to the owner.
- **T-0033** — `AUTH_URL` absent from `render.yaml`; a probable `workshop-web`
  realm/origin mismatch (`render.yaml` deploys it at
  `autoworkshop.aiappinvent.com` while that client's allow-list has
  `workshop.autoworkshop.aiappinvent.com`); no audit event on logout, which
  CLAUDE.md §9/§16 require.
- **`RENDER_API_KEY` still unrotated** from the transcript leak.
- **Playwright full suite not re-run** since these changes — only the identity
  journey (2/2). The other six apps have stale `.next` builds on disk.

---

## 2026-07-27 (pt2) — T-0005 sessions + Render deploy blocked

**Tip `0b678b5` on `master`, pushed, tree clean.** Read `.claude/NEXT_SESSION_SCHEDULE.md`
for the ranked plan, then `.claude/CURRENT_TASK.md`.

### Commits

| Commit | What |
|---|---|
| `dc0ab95` | Render blueprint + provisioning workflow |
| `71d7d8a` | deploy build skips the checks CI already runs |
| `379bc41` | single in-process build worker on the deploy builder |
| `0b678b5` | **T-0005 — Keycloak session in all 7 Next apps. GATES PENDING.** |

### Headline 1 — Keycloak had been dead for ~30 hours and nothing noticed

Postgres restarted underneath it at `12:25:24` on 07-26. Keycloak's first Agroal failure
was `12:25:54` — thirty seconds later — and the pool never recovered. `docker ps` reported
**"Up 41 hours"** throughout. It spanned three prior sessions. Nothing noticed because
nothing exercised Keycloak: the shell had no session, which is precisely what T-0005 was
about.

`restart: unless-stopped` did not help — the process never exited, it hung. And
`KC_HEALTH_ENABLED: "true"` was set with **no healthcheck reading it**. Compose now probes
the **realm discovery document**, deliberately not `/health/ready`: Keycloak ships with the
Quarkus datasource health check disabled, so that endpoint answers
`{"status":"UP","checks":[]}` without touching the database and would have said UP for all
thirty hours. Proven to discriminate in both directions before shipping.

### Headline 2 — two auth defects survived every gate

Found by **starting the app**, after typecheck 15/15, lint 15/15, 122 unit tests and a
10-target build were all green:

1. `UntrustedHost` — Auth.js v5 rejects an unrecognised Host and only auto-detects Vercel.
2. The Keycloak provider had **no `issuer`**, so it had no endpoints at all.

Both made every `/api/auth/*` route return **500 while ordinary pages returned 200**. That
asymmetry is the reason a build-green check cannot see them. Verify auth by calling
`/api/auth/session` and `/api/auth/providers`.

### Headline 3 — the Render build fails silently, and six attempts did not find it

`autoworkshop.aiappinvent.com` is **not live**. DNS is correct, the service exists with the
right config, the custom domain is attached. `next build` exits **1** immediately after
"Skipping linting" with **completely empty stderr**.

Ruled out by measurement: memory (builder has 48 CPUs / 95 GB / 8 GB cgroup, exit 1 not
137), worker pool (`cpus: 1` changed nothing), lint and type-checking (skipping moved the
failure), `sharp` (tested directly), and the code itself (a fresh clone of `master` built
cleanly with Render's exact commands).

**Two of the six attempts were fixes for wrong diagnoses.** The heap cap was removed;
`experimental.cpus: 1` is still in all seven `next.config.mjs` and **should come out**.

**Next move: run the same build in GitHub Actions on Ubuntu** — Linux like Render, and it
does not swallow stderr.

### Traps worth carrying forward

1. **Search before adding.** The audience mapper I was about to add already existed as the
   `autoworkshop-audience` client scope. Verified against a real token
   (`aud: ["autoworkshop-api","account"]`) instead of assumed.
2. **A stale server lies.** The build-freshness gate caught seven `next start` servers from
   before the rebuild, and caught my own on port 3100 mid-verification.
3. **Idempotence is not obvious.** `seed-dev-identity.sh` failed on its second run — the
   realm's `passwordHistory(3)` rejects re-setting the same password, so it now sets one
   only when no credential exists. A script that ran once looked idempotent and was not.
4. **`getAccessToken()` must not demand the secret before checking for a session.** It
   runs on every render; requiring `AUTH_SECRET` up front would 500 every page for
   visitors who have no session and need none.

### Owner direction

- **`RENDER_API_KEY` was pasted into the chat transcript.** Owner: "soon we rotate".
  Treat as compromised until rotated, then update the GitHub secret on this repo.
- Service naming settled: **one service, `autoworkshop`**, matching the Solar pattern
  (`solarpro-global` serves `solarpro.aiappinvent.com` — name and subdomain need not match).

---

# Session handover

> Read this first, then `.claude/CURRENT_PHASE.md` and `.claude/TASK_QUEUE.md`.

## Where the project stands — 2026-07-26 (session 2, afternoon)

**Release 0.1 shipped and tagged `v0.1.0`.** **Phase 2 (identity) partially complete.**
**Phase 3 (application shell, Release 0.2) is the current work and is now gated green.**

Repo: https://github.com/marc667us/autoworkshop-ai — public, `master` + `develop`.
Approved plan: `C:\Users\USER\Documents\autoworkshop app\_plan\COMBINED_PLAN_v2.md`
(Codex `PASS WITH CORRECTIONS` 14/14 applied → Supervisor `PASS WITH CONDITIONS` 8/8 applied).

## This session — resumed a frozen session and finished its work

The previous session (transcript `f2cda62b-ed38-42fd-87de-540a2665efb4`) froze mid-command at
14:27 UTC, part-way through `pnpm typecheck && pnpm build` after fixing a circular-import crash.
Its process did not survive. This session read that transcript, resumed at exactly that point, and
completed the work.

**Gates, all green:** typecheck 13/13 · lint 13/13 · **tests 64** · build 9/9 (7 apps + API +
Storybook). Runtime verified by serving the production build, not just by building it.

### Shipped

- `packages/navigation` — navigation model for all 7 workspaces from `01 (1).txt` §34-§39 and
  `02.txt` §52/§58. 27 tests, including that all 25 platform-admin entries are present.
- `packages/next-shell` — ONE Next adapter (`WorkspaceShell`, `renderModulePage`, `viewerGrants`)
  for all 7 apps. The per-app shell copy that existed briefly was deleted.
- `packages/ui` — AppShell, TopNav, SideNav, Breadcrumbs, PageHeader, StatusBadge, ThemeProvider,
  **Tabs, Dialog, Drawer, AiAssistantPanel**, `useFocusTrap`, `useMediaQuery`.
- Runtime theming (light / dark / **system**) via CSS custom properties + no-flash boot script.
- Responsive shell: below 768px the side nav becomes a modal overlay drawer with a focus trap.
  `prefers-reduced-motion` is honoured by every animation.
- AI assistant panel per `02.txt` §8 — discloses the proposed action, the data it will use,
  read-only vs changes-data, the approval requirement and sources. Not wired to an agent (Phase 8),
  and it says so plainly rather than presenting an input box that swallows questions.
- `ai-coworkers/` + `reviews/` + `scripts/` pair-coding skeleton installed (was missing entirely,
  contrary to root CLAUDE.md). `./scripts/quality-gate.sh` now exists in this repo.

## Defects found by review — do NOT reintroduce

Codex reviewed the diff; each finding was verified against source before being accepted, and each
fix was verified at runtime afterwards. Reviews are saved under `reviews/`.

1. **The catch-all route ignored permissions entirely.** `renderModulePage` resolved against
   `workspace.groups`, not the grant-filtered tree, so any permission-gated module rendered by URL —
   and the placeholder page *printed the required permission name*, handing out a map of the
   authorization model. It also claimed "permissions for this screen are working" while checking
   none. Now resolves via `visibleGroups(workspace, grants)`, defaults to `[]` (fail closed), prints
   no permission names, and the copy is honest. **Verified live: gated URL 404s, ungated 200s.**
2. **Every right-hand top-nav button was focusable and inert.** Create / Tasks / Messages /
   Notifications / Help rendered as live buttons with count badges and no handler; the TopNav
   docstring simultaneously claimed "none of them silently no-op". An action with no `onSelect` now
   renders `disabled` with ", not available yet" in its accessible name. The workspace/org/branch/
   user indicators render as **plain text**, not buttons, until their switchers exist.
3. **Self-found, after Codex's pass: the nav and the router disagreed about who the viewer is.**
   The 7 `layout.tsx` files passed a hardcoded grants array while the catch-all passed none, so the
   workshop nav advertised `/finance-and-warranty/invoices` and that URL 404'd. Both now read
   `viewerGrants()` in `packages/next-shell/src/viewer.ts` — one function, one truth. Locked by
   `viewer.test.ts`, which asserts the *property* (everything advertised must resolve), not the
   symptom. **This is the bug class to watch for: two literals in two files cannot be type-checked
   into agreement.**
4. **`ThemeToggle` declared `role="radiogroup"` without the keyboard behaviour that promises.**
   Three tab stops, no arrow keys. Now a roving tabindex with arrow/Home/End, per the ARIA pattern.
5. **A circular import between `packages/design-tokens/src/themes.ts` and `index.ts`** put `primitive` in the
   temporal dead zone and crashed the production build while typecheck stayed green. Fixed by the
   previous session by extracting `primitive.ts`. **Watch for this class — a green typecheck does
   not prove a module graph initialises.**

## The rule this session kept learning

Everything in items 1, 2 and 3 passed typecheck, lint, 47-then-59 unit tests and a 7-app production
build while broken. **Build the thing, then run it and look.** Every real defect here was found by
either reading the code adversarially or by `curl`-ing the running app — none by a green gate.

## T-0008 (Supervisor C3) — DONE AND DRILLED

**WAL archiving had never once worked.** It was recorded last session as "done and VERIFIED live";
that verification had read the settings back. `pg_stat_archiver` said `archived_count=0`,
`failed_count=864`. `/wal_archive` was a root-owned Docker volume and `archive_command` runs as
uid 999 — every attempt denied, retried forever, nothing surfaced. **There was no point-in-time
recovery at all.** Fixed by the `postgres-init` service in the compose file.

Now in `infrastructure/backup/`: `verify-archiving.sh` (proves archiving by forcing a switch),
`backup.sh` (encrypted physical + logical + Keycloak realm, checksums, manifest, off-host copy,
retention) and `restore-drill.sh` (restores into a throwaway cluster and measures RTO/RPO).

**Drill passes 4/4 runs, 8/8 checks: RTO 16–106 s, RPO 0** — including all 10 transactions committed
*after* the backup, which is the actual proof of WAL replay. Reports in
`infrastructure/backup/drills/`. Full record in `reviews/supervisor-adjudication-c3-backup.md`.

Run it: `cd infrastructure/backup && ./restore-drill.sh` (~2 min, never touches the live cluster).


## Scheduling is LIVE (T-0018 / T-0019) — 2026-07-26

Four Windows Task Scheduler tasks under `\AutoWorkshop\`, all proven by triggering them:
health (every 6h) · daily 02:15 · weekly Sun 03:15 · **restore drill Sat 04:15**.
Production equivalent: `infrastructure/backup/schedule/autoworkshop-backup.cron`.
`./check-backup-health.sh` reports HEALTHY (7/7). Re-install: `schedule/install-windows.ps1`.

Two defects the scheduler found that manual runs never would:
1. `pg_switch_wal()` is a NO-OP with no WAL activity, so the pre-backup archiving gate blocked
   backups entirely on an **idle** database. Fixed with a heartbeat write before the switch.
2. The health check ran `grep` inside the minio container (minimal image, no grep) -> false
   CRITICAL "no off-host backup" while four sat in the bucket.

Caveat: Windows tasks run as the interactive user, so they need you logged in. The first scheduled
weekly returned 0xC000013A (terminated) mid-run; clean on every retry, root cause unconfirmed —
glance at the first real Sunday 03:15 run.

**Re-verified 2026-07-26T19:47Z:** all four tasks `Ready`, `LastResult 0x0`, next runs scheduled
(daily 07-27 02:15 · weekly 08-02 03:15 · drill 08-01 04:15 · health 6-hourly). Health check live:
**HEALTHY 7/7**, WAL `archived=50, failed=0`, newest backup 1 h old, 4 base backups off-host.

**Cosmetic, not urgent:** the *registered* task descriptions in Task Scheduler are still the old
text and show mojibake (`Monthly restore drill â€” …`) because the installer used non-ASCII dashes.
The source is fixed; the live descriptions refresh on the next `install-windows.ps1` run. Triggers
and behaviour are correct now — the tasks were left running rather than re-registered for a string.

**T-0019 is partial, not done.** `check-backup-health.sh` *detects* (age, job freshness,
`failed_count`, drill age) and exits non-zero, but delivery is cron-mail only — **on Windows
nothing notifies anyone**; it writes `status/health.json` and waits to be read. Closing that is
T-0023.

⚠️ **`71a17fd` shipped without either review gate** — no `reviews/` record, and it updated no
control file, which is why this handover and `TASK_QUEUE.md` both went stale. Retro-reviewed
2026-07-26 (Codex + Supervisor); records in `reviews/`.

**That retro-review found a CRITICAL and a HIGH, both now fixed.** The off-host-copy check reported
`OK` when there were **zero** off-host backups — right on the healthy path, wrong on the only day it
matters — and the per-job lock allowed two concurrent `pg_basebackup`s the file's own header said
were impossible. **Codex found neither**; it drifted onto the Markdown files on both attempts
despite an explicit four-file allow-list. Every code defect here came from the Supervisor pass.
Treat a green Codex verdict on infrastructure shell as unproven until someone reads the code.

## Viewing the app locally

`pnpm build` then, per app, `cd apps/<name>-web && npx next start -p <port>`:
customer 3000 · workshop 3001 · supplier 3002 · fleet 3003 · insurance 3004 · towing 3005 · admin 3006.
**`npx next start` without `-p` ignores the package.json port and every app fights over 3000.**
Stop them before rebuilding — a running server locks `.next` on Windows.
Nothing is deployed to autoworkshop.aiappinvent.com yet.

## SESSION 2026-07-26 pt3 — close. Tip `bdfe65c`, pushed, tree clean.

Seven commits. Release 0.2 is **one defect away** from closing.

**T-0014 done** — 77 stories, every component in `packages/ui`.
**T-0015 done and PROVEN** — Storybook axe **84/84 green**; journey **37 passed / 4 failed**, and the four
are left failing on purpose because they are real.

🔴 **START HERE NEXT SESSION — T-0030.** At 360px the side nav renders **inline instead of as an overlay**:
`main` is squeezed to **103px** and the page scrolls horizontally by **161px**. `useIsMobile()` is returning
false in the built app while TopNav's CSS-driven mobile filtering still works, which is what hides it.
Confirmed *after* waiting for hydration, so it is not a test race. **This is Phase-3 defect 7, still live**,
underneath a green typecheck, green lint, 37 unit tests and a 9-target build.
Start at `packages/ui/src/AppShell.tsx:89` (`const isMobile = useIsMobile()`) and
`packages/ui/src/useMediaQuery.ts:26`. Reproduce with:
`cd apps/e2e && npx playwright test --project=shell-journey -g "overflow at 360px"`

Also fixed today: dangling `aria-controls` (axe CRITICAL) in **two** places — every *collapsed* SideNav group,
and TopNav's hardcoded `app-side-nav` while the mobile Drawer is unmounted. TopNav now takes `sideNavId`.

**Two of the four failures were the TESTS being wrong, not the code** — worth knowing before "fixing" them:
Tabs implements **manual activation deliberately** (arrows move focus, Enter selects; each panel costs a
fetch), and the modal-drawer focus test slept 200ms and raced the focus-trap effect.

**Guardrails shipped** (`scripts/guardrails/`, Stage 0 of `quality-gate.sh`): BM25 RAG grounding,
claim verification, scoped review with drift audit, shell-idiom lint. See `scripts/guardrails/README.md`.

**Plan extended** for specs 07/08/09 → `docs/00-project/PLAN_EXTENSION_v1.md`. New Phases 12 (simulation
intelligence), 13 (knowledge ops), 14 (community). ⚠️ `autoworkshop 07.txt` is **two documents** — lines
1798–5069 are a separate workshop-side spec (§1–52) that the first draft missed entirely.

**Beware the pipe trap.** `cmd | tail` reports *tail's* exit status. It made `playwright | tail` look like
exit 0 over 9 failures, and let a commit through while both guardrails were failing. Capture `$?` before any
pipe.

## SESSION 2026-07-27 — T-0030 CLOSED. It was never a product defect.

**Start here: T-0031, then T-0027.** Release 0.2 is closed.

### T-0030 was a stale server, not a responsive bug

Carried in as a live red defect: at 360px the side nav rendered inline, `main` squeezed to 103px,
161px of horizontal overflow, `useIsMobile()` false in the built app. **The shell was correct all
along.**

Seven `next start` servers were launched at 12:35 and the apps were rebuilt at 14:38 underneath them.
`next start` resolves its chunk manifest once at boot, so those servers kept serving HTML that
referenced chunk hashes the rebuild had deleted. Every chunk 404'd, React never hydrated, and
`useIsMobile()` never advanced past the `false` it deliberately starts with for SSR safety.
`reuseExistingServer: !CI` handed those stale servers straight to Playwright.

Reproduced under control rather than argued: stale server -> `main` 103px, scrollWidth 521 vs
clientWidth 360, no `__react*` keys on `<body>`. Fresh server, same build -> 360px, no overflow,
hydrated. Both numbers match the original report exactly.

**Why it fooled a careful reader.** The server still answers 200, the SSR markup is correct, and
TopNav's mobile rules are plain CSS *inside that markup* so they keep working. The previous session
cited that asymmetry as proof the bug was real. It is actually the signature of a page whose
JavaScript never ran. Waiting longer for hydration cannot fix a chunk that 404s — which is why "I
waited for hydration, so it is not a race" ruled out the wrong hypothesis.

### Now gated

`apps/e2e/tests/build-freshness.setup.ts` runs as a Playwright dependency project before every other
project and fails the run if any server references a `/_next/static` asset that is not on disk in
that app's `.next`. Proven both directions: it names the exact missing chunk on a stale server, and
passes 7/7 on fresh ones. "Stop the servers before rebuilding" was already written in THIS FILE when
the incident happened — documentation did not prevent it, so it is a gate now.

### Four more defects found, none of them by Codex

1. **The only security-relevant test in the suite had never once executed.** `"<workspace>: a gated
   URL 404s when typed directly"` — the regression test for the permission-BYPASS defect —
   `test.skip`ped in **all seven** workspaces, silently, every run. The nav model gates on just two
   permission keys and the demo viewer held both, so `gatedHref()` found nothing gated anywhere.
   Fixed: `DEMO_DEFAULT` no longer holds `finance.read`, and a new test fails if no workspace
   exercises gating. **When it was made to run, fail-closed held** — real 404s. It just had no proof.
2. **The suite served every app with the wrong Next major.** `npx next start ../<app>` ran from
   `apps/e2e`, which pinned `next@14.2.21`, against apps built with `15.1.3`. Next 14 dies on a
   missing `font-manifest.json`. Latent since T-0015 was written and masked entirely by the stale
   server reuse — removing one bug exposed the other. Fixed with per-app `cwd` + version alignment.
3. **The overlay test was a sleep-race** and would have stayed red on a correct app: it never waited
   for hydration. The overflow tests waited with `waitForTimeout(400)` — a race with the machine, not
   the app. All now use `waitForHydration()`, which waits for React's `__reactFiber$` keys, not a
   duration. `readyState === 'complete'` is NOT sufficient: it is equally true of a page whose JS 404'd.
4. **The disclosure assertion could not pass on correct code** — it matched the viewer's own grants in
   the RSC flight payload. Tightened to the gated module's specific required permission.

Codex found one real defect (stale copy on the workshop dashboard naming `finance.read`), which was
outside the changed files — a good catch. It also skipped both questions it was explicitly told to
answer and emitted no `VERDICT` line, for the third review running.

### T-0031 was the same phantom

Closed the same day. "Arrows move focus but not selection" is exactly how a correct radiogroup
behaves when its JavaScript never loaded: `setPreference` cannot run, so `aria-checked` never
changes. The roving tabindex and arrow/Home/End handling had already shipped with the defect-4 fix.
Both radiogroup tests pass on a fresh build, verified twice.

**So all four tests left red at the previous close were one environmental fault** — three T-0030,
one T-0031 — and no shell code was wrong in any of them.

### Open, recorded honestly

- **One unexplained anomaly:** a single build-guard run passed against a demonstrably stale server.
  Two later runs on the same state failed correctly and named the chunk, and a direct replication of
  the guard's logic also reported it missing. Not reproducible, no explanation. Recorded rather than
  rationalised — the direction (passing when it should fail) is the one that matters.
- **Guard covers each app's entry route only.** The shared runtime chunks it does check change on
  essentially any edit, so coverage is high but not total. Extending to a sample of routes is a cheap
  follow-up.

### Gates, 2026-07-27

typecheck 14/14 · lint 14/14 · unit 64 · build 10/10 · **Playwright 138 passed, 0 failed, 2
legitimate skips** (admin holds every grant; customer has no gated item). The three tests left
deliberately red last session are green and **none was weakened** to get there.

## T-0027 DONE — navigation is now workspace x role. Phase 5 unblocked.

`07.txt` **part 2** §46-§49 gives four DISTINCT navigation trees inside the single `workshop`
workspace. They are not filtered views of §34: the spec groups and labels the same work differently
per role (the owner's "Repair Requests" is the manager's "Repair Request Inbox"; "MY JOBS" and
"TECHNICAL TOOLS" exist for the technician alone). §50 names EIGHT roles but gives trees for four —
supervisor, storekeeper, quality-control and cashier fall back to the workspace default, which is what
the spec provides.

**Design, and why:** `workspaceForRole()` returns a `Workspace` with the role's groups swapped in, so
the shell, `breadcrumbsFor`, the catch-all router and the journey tests all keep taking the type they
already took. Threading a `role` parameter through each would have created a SECOND place where "which
tree is this viewer on" gets decided — and this repo already shipped that bug for grants, where the nav
advertised routes the router 404'd. **`viewerRole()` is the single decision point**, called by both
`WorkspaceShell` and `renderModulePage`. Role selects the tree; permissions still filter it.

**Verified live, not just built:** the workshop app renders §49 exactly (Home · My Jobs · Technical
Tools · Plan Work · Record Work · Testing · Learning). `/my-jobs/inspection-required` -> 200,
`/technical-tools/fault-code-search` -> 200, and the §34-only `/workshop-floor/repair-staging` -> **404**.
The menu and the router moved together, which is the entire property at stake.

**Codex found two real defects, both confirmed and fixed:**
1. `workspaceForRole` kept `roleGroups` on its result, so re-applying it with a different role fell
   back to the FIRST role's tree — a supervisor would have got the technician's navigation under their
   own name. Fixed by dropping the field: a resolved view has no business carrying the menu of
   alternatives it was chosen from.
2. `/home/dashboard` is a concrete route that bypasses the catch-all, and its header still said
   "Workshop Dashboard" while the technician nav called it "Technician Dashboard". Now derived.

**The Supervisor pass found a third**, in the area Codex was asked about and skipped: a role tree could
silently drop a permission during transcription — `07.txt` prints "Invoices" as plain text, the trees
are hand-transcribed per role, and every existing test would stay green because the item is *supposed*
to be there. Guard added.

**One finding was correctly REJECTED.** That guard's first run flagged
`reception: /vehicle-intake/issue-intake-receipt`. §48's "Issue Intake Receipt" is proof the workshop
took custody of the vehicle, not a payment receipt — gating it would have hidden a core reception
function from reception staff to satisfy a regex. Handled as a named exception with its reason, plus a
test that the exception still refers to a live item.

**Skips rose 2 -> 3:** `workshop` no longer exercises the gated-URL test, because §49's technician tree
legitimately has no permission-gated item. Five workspaces still do, and
`at least one workspace must exercise permission gating` enforces it never reaches zero.

Records: `reviews/supervisor-adjudication-t0027-workspace-role.md`.

**Gates:** typecheck 14/14 · lint 14/14 · **unit 79** · build 10/10 · **Playwright 137 passed, 0
failed, 3 legitimate skips**.

## T-0003 DONE — identity services. Next blocker is T-0005, not more services.

The tables already existed (migration 001). This was the SERVICES: `BranchService`, `UserService`,
`MembershipService` + controllers, on the `OrganizationService` pattern so a REST controller and an
MCP tool are thin callers of one service. Eight routes live under `/api/v1`; every one returns **401**
unauthenticated, on a forged token, and on the privilege-granting POST.

### The defect class this task is really about

**`identity.users` has NO `tenant_id` and NO row-level security** — deliberately, because one human
may hold memberships in several tenants. So unlike everywhere else in this schema, **RLS will not
save you here**: a plain `SELECT * FROM identity.users` inside `withTenant` returns every user on the
platform and no policy stops it. It type-checks and reads naturally.

Every `UserService` query therefore starts `FROM identity.memberships` (which IS under FORCE RLS) and
joins outward. **The join is the security control**, and `identity.spec.ts` asserts the query SHAPE
because nothing downstream would notice the property being violated.

### Three defects found, all fixed

1. **HIGH — a foreign key cannot carry a tenant predicate.** The FKs reference
   `organizations(id)`/`branches(id)` by id alone, and RLS `WITH CHECK` validates the tenant of the
   INSERTED row, never the tenant of the row it points at. So `tenant_id = A` +
   `organization_id = <org in tenant B>` satisfied both. On the privilege-granting operation. Fixed by
   looking the parent up through the RLS-protected table first: a foreign organization is invisible
   there, so the check IS the isolation. Branch-belongs-to-organization checked too.
2. **The same hole in `BranchService`**, which Codex never saw because it was outside the file it
   focused on. Found by asking "where else does this shape appear?".
3. **MEDIUM — `withdraw`'s status was never validated at runtime.** The union type is erased and the
   controller forwards the body verbatim, so `{"status":"active"}` passed the DB CHECK: a withdrawal
   that changed nothing but still audited `membership.active`. **Fixed in the SERVICE, not the
   controller** — an MCP tool calls the service directly, so a rule at the HTTP edge does not bind
   agents.

### Reviewer note — Codex's best pass yet

First time it answered every question it was asked AND emitted the required `VERDICT` line
(`CHANGES REQUIRED`). Two of its three findings this pass had already been found independently by the
Supervisor; **the third had not, and would have shipped.** The standing rule to run the Supervisor
independently still holds — it now cuts both ways.

### Operational warning

The API on :4000 had been running since **2026-07-26 05:09**, serving a build older than every
controller in this change — the same stale-server condition that produced the T-0030 phantom, in a
service the build-freshness gate does NOT cover (it watches the seven Next apps only). **A long-lived
`node dist/main.js` is exactly as dangerous as a long-lived `next start`.** Restart it after every
`nest build`.

**Gates:** typecheck 14/14 · lint 14/14 · **unit 98** (api 39) · `nest build` clean · 8 routes live,
all failing closed.

**NOT done, and not claimed:** the web apps are still not session-wired, so `viewerGrants()` and
`viewerRole()` keep their demo bodies. Replacing them is **T-0005**, not more identity services.

## T-0005 STARTED — API side done, Next side NOT. Resume exactly here.

`viewerGrants()`/`viewerRole()` cannot stop being demo data until something can
answer "what may this viewer see?" from a real role. **Nothing could**: the navigation gates on
`finance.read`, `organization.admin` and `platform.admin`, and no code anywhere mapped a role to any
of them. So T-0004's matrix was built first, because T-0005 is blocked on it in practice.

**Landed:**
- `apps/api/src/authz/permission-matrix.ts` — all 13 grantable roles → the 3 keys the nav gates on,
  each entry traced to `07.txt` pt2 §50, `01 (1).txt` §29 or §32. Deliberately small; new keys arrive
  with the modules that gate on them.
- **`GET /api/v1/me`** — userId, displayName, tenantId, organizationId, branchId, activeRole,
  `permissions[]`, and `memberships[]` (org + branch names, for T-0016's switchers). Every field
  derived server-side from the validated token plus membership; no request field can influence the
  role or the permission list.

**A real defect the tests caught:** `permissionsForRole('constructor')` returned the `Object`
function, because `ROLE_PERMISSIONS[roleName] ?? []` resolves up the **prototype chain** — truthy, so
`??` never fired. `Object.freeze` does not help; it seals own properties and says nothing about
inherited ones. Now `Object.hasOwn`. Same trap applies to any string-keyed lookup in this codebase.

### ▶ NEXT SLICE — the actual remaining work of T-0005

**The seven Next apps have NO session at all.** There is no Auth.js/next-auth dependency anywhere;
`packages/auth` exists but is an EMPTY directory. So:

1. Add Auth.js (next-auth v5) with the **Keycloak provider** into `packages/auth` — FOSS, zero cost,
   and named in the approved stack (`05.txt` §1 "Keycloak, Auth.js, JWT").
2. Server-side session → access token → call `GET /api/v1/me` → that becomes the body of
   `viewerGrants()` and `viewerRole()`.
3. **The refactor that will bite:** both are SYNC today and `viewerRole()` also feeds
   `workspaceForRole()`. They must become async server-side reads. Known call sites:
   the 7 `layout.tsx`, `renderModulePage`, and — watch this one —
   `apps/workshop-web/app/home/dashboard/page.tsx` computes `VISIBLE` / `NAV_GROUP_COUNT` /
   `PAGE_TITLE` **at MODULE SCOPE**. Module scope cannot await a per-request session; those must move
   into the component body.
4. `apps/e2e/tests/shell-journey.spec.ts` imports both functions to derive what the nav should
   advertise. Once they need a session, the suite needs a fixture identity — do not let this silently
   become untestable.

## IN FLIGHT — pick up here

**No feature work is in flight.** See `.claude/CURRENT_TASK.md`.

1. **T-0005 remainder** — Auth.js + Keycloak session in the 7 Next apps, then point
   `viewerGrants()`/`viewerRole()` at `GET /api/v1/me`. See the slice notes above, especially the
   sync→async refactor and the module-scope constants. Still the only thing holding T-0016.
2. **T-0023** — deliver the backup health alert to a human. Detection done; Windows routes it nowhere.
3. **T-0017** — quick-create / tasks / messages / notifications / help panels (§9-§14).
4. T-0020…T-0022 — off-host-only restore drill, MinIO object-lock, `--data-checksums` rebuild.

## Environment

Node 20.19.2 · pnpm 9.15.4 (**do not upgrade — pnpm 10+/11 require Node ≥22.13**) · Python 3.14.4 ·
google-adk 2.2.0 · Docker 29.4.3 · Ollama 0.24.0 · gh CLI at `%USERPROFILE%\bin\gh.exe`.

Local infra: `pnpm infra:up`.
API: `cd apps/api && npx nest build && node dist/main.js` with
`DATABASE_URL=postgresql://autoworkshop_app:change_me_locally@localhost:5432/autoworkshop`.
**Never point the app at the `autoworkshop` superuser** — the boot guard refuses it, by design.

Serve a built app to check it: `cd apps/workshop-web && npx next start -p 3001`.
**Stop it before rebuilding** — a running Next server holds a lock on `.next` and the build fails on
Windows with a file-lock error that looks like a code error and is not.

Windows: `kcadm` runs in-container, so `MSYS_NO_PATHCONV=1 docker exec …` is required or Git Bash
rewrites `/opt/keycloak/...` into `C:/Program Files/Git/opt/...`. The local side of `docker cp`
needs the opposite treatment — `cygpath -w`.

Codex CLI: `codex exec` **blocks waiting on stdin** unless you redirect `< /dev/null`, and it will
answer a briefing-shaped prompt by acknowledging the role instead of doing the work. Give it an
imperative first line, a diff already written to disk, and closed stdin. Its sandbox rejects
`pnpm`/PowerShell, so it cannot run the tests — it reads only.

## Owner directions — binding

10. **Use RELATIONSHIPS in databases and schemas** (2026-07-27). Model with real foreign keys and
    joins — normalised, referential, no duplicated columns standing in for a relation and no
    denormalised blobs where a table belongs. Already the shape of the identity schema
    (`tenants → organizations → branches → memberships → users`, with `/me` joining across them for
    organisation and branch names rather than copying them). It is binding for every table added from
    here: parts, job cards, quotations, invoices, warranty, fleet, claims, library records.
    ⚠️ **A foreign key still cannot carry a tenant predicate** — see the T-0003 finding. Relationships
    give integrity, RLS gives isolation, and you need both.

1. Name fixed: **AutoWorkshop AI** at `autoworkshop.aiappinvent.com` (Namecheap DNS)
2. **Stop cutting scope** — build everything structurally; only licensed content and labelled ML
   corpora stage
3. **Reuse Solar patterns, never entangle** — separate repo, DB, Keycloak realm, deploy, secrets, CI.
   **Do not open or run the Solar app.** Patterns are reused from memory and documentation, not by
   launching it.
4. **Zero cost including production** — never propose spending; that decision is the owner's alone
5. **Bring-your-own-connection** — tenants connect their own device/provider/credentials
6. Zero cost now; commercial infrastructure later, only if going commercial
7. **Solar is the reference — always refer to it**
8. **Codex is the reviewer; the Supervisor is the adjudicator.** Codex's findings are verified
   against source before being accepted — it is not infallible, and this session's third defect was
   one it missed.
9. **Do not run Google ADK or Stitch without the owner's approval.**

## Open owner decision (nothing to buy)

Where the self-hosted Docker stack should run: an always-free cloud VM, a machine already owned, or
local-only. It runs locally today, so nothing is blocked.

## Machine state

Sleep, hibernate and monitor timeouts are currently **disabled** (owner asked for uninterrupted
running). To restore: `powercfg /change standby-timeout-ac 30`, `hibernate-timeout-ac 180`,
`monitor-timeout-ac 10`.

A NestJS API process from the frozen session (`node dist/main.js`, started 05:09) was left running
deliberately — it is a working service and nothing required restarting it.
