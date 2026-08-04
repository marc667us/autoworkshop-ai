# > START HERE - next session

```bash
bash scripts/start-session.sh
```

---

## SESSION CLOSE 2026-08-04 — BOTH WORKFLOWS FINISHED

**Nine commits.** For the exact tip and worktree state run `git log -1 --oneline`
and `git status --short` — this file deliberately does NOT restate them, because
a hardcoded "tip X, tree clean" line goes stale the moment anything else lands
and the next session then starts from a false baseline. (Codex flagged exactly
that here.)

### ▶ THE ONE THING ONLY THE OWNER CAN DO

```
! C:\Users\USER\bin\gh.exe workflow run apply-migrations.yml -f confirm=APPLY --repo marc667us/autoworkshop-ai
```

Migration **037** is written, committed and verified **13/13** locally under
production privileges — and proven to FAIL with the exact live error before it.
Until it is applied, `POST /registration/workshop` still 500s and no workshop
can be created live. Detail in `.claude/CURRENT_TASK.md`.

### WHAT SHIPPED

- **Technician 21/21 screens (24/24 checks)** and **customer 11/11 screens
  (19/19 checks)**, both driven in a real browser as the role whose tree owns
  the routes. Screens and checks are different numbers — both are quoted.
- **A customer can approve their own repair** — new
  `POST /proposals/:id/customer-decision`, with the consent fields DERIVED
  rather than accepted.
- **Keycloak's `error=Configuration`** replaced by an honest "starting up"
  screen in all seven apps.
- **Landing cards on Solar's scale** (12px radius, 24px padding).
- **Staff management** — the owner can hire, remove and re-hire. `grant()` had
  had no reachable caller since Phase 2. 9/9 and 4/4 in a browser.

### ⚠️ RUNNING THE VERIFICATIONS

```bash
bash scripts/seed-customer-proposal-fixture.sh   # the customer run CONSUMES it
cd apps/e2e
node verify/verify-technician-workflow.mjs
node verify/verify-customer-workflow.mjs
```

The customer suite now **FAILS** rather than passing quietly when there is no
answerable proposal, because the whole approve path sits behind that condition.

### 🔴 THE LESSON OF THE DAY, IN ONE LINE

**Ask of any gate: would its not-running look different from its passing?**
Codex had never run on a real diff (prompt passed as argv → `Argument list too
long`) *and exited 0 when it failed*. Package vitest configs collected only
`*.test.ts` while `apps/api` uses `*.spec.ts`. Both fixed.

And its sibling: **hiding is not refusing.** `decidable` hid superseded
proposals from the screen while both write routes still accepted them by POST.

### Local stack at close

Everything on **plain `localhost`** — API 4000, workshop-web 3001,
customer-web 3000, Keycloak 8080. Sign in as
`technician@autoworkshop.local` / `customer@autoworkshop.local`,
password `Change_me_locally1!`.

⚠️ `scripts/start-local.sh` **HUNG at its `kcadm` step** this session. It was
bypassed by starting each process with `KEYCLOAK_URL=http://localhost:8080`,
which keeps the issuer matching `.env` and works because the realm's dev clients
already allow `http://localhost:<port>/*`. Worth fixing before relying on it.

✅ **NO APP SERVERS ARE RUNNING.** Ports 3000, 3001 and 4000 are FREE at close
— verified, not assumed. The Docker infrastructure IS up (postgres, keycloak,
redis, minio, nats).

⚠️ They were briefly left in the WORST possible state before this was cleaned:
the API process died while both web apps kept listening. Every screen renders
and every data call fails, which reads exactly like a product defect — the
inverse of the stale-server trap this repo already has a lesson for. If a
session ever finds pages loading but all data empty, **check port 4000 before
diagnosing anything else.**

---

## SESSION CLOSE 2026-08-03 - THE LIVE SITE CAN NOW BE SIGNED INTO

**Tip `386ac55`, pushed, tree clean.** Six commits.

### LIVE CREDENTIALS - verified by real browser sign-in, both accounts

| | |
|---|---|
| **URL** | **https://autoworkshop.aiappinvent.com** |
| Owner | `marc667us@yahoo.com` / `Forest-prism-bramble-nomad7` |
| Admin | `admin@aiappinvent.com` / `Basalt-oyster-thistle-quill4` |
| Keycloak | https://autoworkshop-keycloak.onrender.com (realm `autoworkshop`) |

Also in `C:\Users\USER\autoworkshop-owner-login.txt`.
Keycloak master admin password lives in `C:\Users\USER\autoworkshop-keycloak-admin.txt`
- **the only readable copy**; Keycloak honours it on a FIRST boot only.

Realm password policy: `length(12) upperCase(1) lowerCase(1) digits(1)
specialChars(1) passwordHistory(3)` - a plain lowercase passphrase is REFUSED.

### WHAT THE OWNER WILL SEE, AND IT IS NOT AN AUTH BUG

Both accounts sign in. Then the dashboard reads **zero** and the header shows
**"Not signed in" beside "Sign out"**. Authentication genuinely succeeded - the
**API service is not deployed**, so nothing can answer `/me`, and Postgres holds
**no tenant, organisation or membership** for these users. Those are steps 1 and
2 in `.claude/CURRENT_TASK.md`.

**Do not chase this as the 08-02 issuer bug.** That one is fixed and verified in
both directions; this is missing infrastructure, and the screen says so itself.

### What went live

- **Keycloak deployed to Render** - it never existed before. Three bugs blocked
  it, each fatal: the JVM refused to start (two garbage collectors selected),
  the deploy's own password generator broke its pipe under `pipefail`, and
  `KeyError: 'ownerId'` from a Render response shape.
- **The web service now points at it** (`point-web-at-keycloak.yml` - a MERGE,
  because Render's env endpoint is a whole-set PUT that would otherwise delete
  `AUTH_SECRET`).
- **The production realm had ZERO users** by design; owner + admin created. The
  client also allowed only the `workshop.` subdomain while the app serves the
  apex - fixed.

### Product shipped

- **Web job-card detail screen**, one screen at FOUR role-tree routes; job
  numbers now link. 52/52 in a browser as four identities.
- **"Add customer" / "Register vehicle" buttons** on the list screens, href
  resolved from the viewer's own navigation. 11/11 across three roles.
- **"Add staff" NOT built** - there is no staff screen to link to. Own slice.

### Local stack at close

Servers were left RUNNING (API 4000, workshop-web 3001 bound to 192.168.0.124).
`AUTH_URL` is the LAN host, so **hitting `localhost:3001` gives `MissingCSRF`** -
use `http://192.168.0.124:3001`. Local login is `owner@autoworkshop.local` /
`Change_me_locally1!`. Cloudflared tunnels were used mid-session and stopped.

---

## 📍 SESSION CLOSE 2026-08-02 — READ THIS BLOCK FIRST

**Tip `217a648`, pushed, tree clean.** Owner's instruction mid-session:
*"i need only the web and mobile app"* — no deployment work after that point.

### Local URLs and the login

| | |
|---|---|
| Workshop web | `http://<LAN>:3001` |
| Supplier web | `http://<LAN>:3002` |
| Admin web | `http://<LAN>:3006` |
| Mobile | `exp://<LAN>:8081` (Expo Go) |

```
owner@autoworkshop.local / Change_me_locally1!     (FULL EMAIL, plain http)
```
Others, same password: `admin@`, `manager@`, `reception@`, `technician@`,
`supervisor@`, `customer@autoworkshop.local`.

⚠️ `owner@` defaults to **platform_administrator** by ROLE_PRECEDENCE and lands
on the DEFAULT tree. Owner-tree screens (Pricing, Repair Control, Workshop
Operations) need **Switch user → workshop_owner** first.

### ▶ NEXT SESSION — JOB LIST, in order

**J0. Dry-run the Keycloak deploy.** It is built and NEVER RUN.
`gh workflow run deploy-keycloak.yml --repo marc667us/autoworkshop-ai`
(no `confirm=APPLY`). Read what it reports, THEN apply. This is the shortest
path to a live sign-in — everything under it is already done and verified.

**J1. Web job-card detail screen** — see item 1 below. Highest product value.

**J2. Steps 4-6 of the live deploy** — API service, point the web service at
Keycloak + the API, seed accounts. Only after J0 succeeds.

**J3. More menu entries → real screens** (127 left) — item 2 below.

**J4. Mobile: offline queue, then camera, then push** — item 3 below.

**J5. Evidence upload endpoint + UI** — item 4 below.

**J6. Repo-wide RLS org-scoping** — PLAN BEFORE CODE, item 5 below.

**J7. Rotate `RENDER_API_KEY`** — leaked in a transcript 2026-07-27, still live.

### ▶ DETAIL ON THE PRODUCT ITEMS, in order

1. **The web job-card DETAIL screen.** There is no
   `workshop-floor/job-cards/[id]` page, so the 14 new queue screens render the
   job number as PLAIN TEXT — a link would send the user's most obvious click
   into the "not built yet" catch-all. **Highest value next slice**: it unblocks
   the primary action on 14 screens. The MOBILE app already has a detail screen
   with stage transitions (`apps/mobile/src/screens/`) to follow.
2. **More menu entries → real screens.** 127 still hit the placeholder;
   `node scripts/audit-menu-coverage.mjs --all` lists every one. Buildable NOW
   are those whose API exists: catalogue/parts, customers, vehicles,
   memberships. The rest need their API first (finance, reports, communication,
   knowledge, learning, technical tools).
3. **Mobile: offline queue, camera capture, push.** All three empty;
   `packages/offline-sync` is an empty directory. A workshop phone loses signal
   constantly, so the offline queue changes how the app feels most.
4. **Evidence upload.** Storage layer done and proven against MinIO (`06ccf8d`);
   still needs `POST /evidence/upload-url`, `storage_key` wiring, and the UI.
5. **Repo-wide RLS org-scoping** — needs a PLAN before code. Migration 027's
   `identity.current_organization_id()` is the start; both failure modes fail
   closed (unset GUC → NULL matches nothing, non-uuid → RAISE).

### 🔴 ISSUE LOG

| # | Issue | State |
|---|---|---|
| I1 | **Live sign-in still impossible** — DB migrated AND `KC_BOOTSTRAP_ADMIN_PASSWORD` set 2026-08-02. Steps 3-6 remain. | **UNBLOCKED** — deploy Keycloak next |
| I2 | No web job-card detail page; queue job numbers are plain text | open → item 1 |
| I3 | 127 menu entries still render "not built yet" | open → item 2 |
| I4 | Mobile has no offline queue / camera / push | open → item 3 |
| I5 | `RENDER_API_KEY` unrotated since the 07-27 transcript leak | treat as compromised |
| I6 | T-0044 — document scrolls 51px sideways at 768px, every page | open, pre-existing |
| I7 | `record-diagnosis-in-browser` and `plan-repair-in-browser` CONSUME their fixtures | seed first; diagnosis has NO seeder |
| I8 | `security-posture.integration.spec` flakes on pool contention in the full run | passes alone; uninvestigated |
| I9 | `next start` warns `output: standalone` is set but unused | cosmetic, unexamined |

**I1 — no longer owner-gated.** `KC_BOOTSTRAP_ADMIN_PASSWORD` was generated and
set on the repo 2026-08-02.

🔴 **GITHUB SECRETS ARE WRITE-ONLY. The only readable copy of that password
is `C:\\Users\\USER\\autoworkshop-keycloak-admin.txt`** — outside the repo, never
printed to a transcript. Without it the Keycloak admin console is unreachable
and the instance would have to be recreated, because Keycloak reads that
variable ONLY on a FIRST boot.

**Step 3 is BUILT BUT NEVER RUN.** `.github/workflows/deploy-keycloak.yml`,
`infrastructure/keycloak/render/{Dockerfile,build-prod-realm.mjs}` and migration
035 (Keycloak schema + role, applied locally AND on Render) are all in place.

⚠️ The workflow has NOT been executed, not even a dry run. Its YAML parses; that
is all that is verified. **Run it without `confirm=APPLY` first.**

```
gh workflow run deploy-keycloak.yml --repo marc667us/autoworkshop-ai
```

Verified separately: the realm builder strips all 9 dev redirect URIs and
refuses a wildcard or a baked-in user (control passes); `keycloak_app` is denied
on identity/core/repair/audit and can only use its own schema.

Then steps 4-6: deploy the API service, point the web service at it, seed accounts.

✅ Done this session: database **created**, and migrations **001-034 APPLIED to
Render** (run `30761632886`, 44 tables). `apply-migrations.yml` dry-runs by
default and CALLS `infrastructure/migrations/run.sh` rather than reimplementing
the ledger.

### WHAT CHANGED — the load-bearing parts

**The mobile app had never actually run.** Three defects stopped it booting and
no test caught any of them: `vitest` exercises modules, and `expo start` prints
"Waiting on :8081" without building anything. **Requesting the bundle found all
three.** Its Keycloak client also existed in the committed realm and NOT in the
running one — a realm imports ONCE, on first boot.

⚠️ The Metro config deliberately does NOT set `disableHierarchicalLookup`,
contrary to Expo's monorepo guide: that guide assumes npm/yarn hoisting, and
pnpm needs the walk-up lookup to resolve a package's own dependencies.

**The auth failure that shows two contradictory things at once.** Keycloak
derives a token's `iss` from the request Host; the API validates
`jwt.verify({issuer})` against its own KEYCLOAK_URL. A LAN sign-in against an
API expecting localhost rejected every token — while the session cookie stayed
valid, so the page rendered **"Sign out" AND "Not signed in" together**.

**`.gitignore` had no env rule at all.** `.env` holds `POSTGRES_PASSWORD`,
`DATABASE_URL` and `AUTH_SECRET`, kept out of the repo by discipline alone.

**Input validation was never enforced** — every write body was a TypeScript
type, erased at runtime. 43 endpoints now validated with Zod at the boundary.
A global `ValidationPipe` was REJECTED: without DTOs it validates nothing while
making every controller look guarded.

### TRAPS THAT BIT THIS SESSION

- 🔴 **A field name that would have lied to every user.** The mobile detail
  screen was written against `stageOptions`; the API returns `allowedStages`.
  Nothing throws — the list is empty and the screen says *"your role cannot move
  this job"*, shown to owners included.
- 🔴 **Same class in the web queues:** `awaiting_internal_review` is a BOARD
  COLUMN key, not a stage. The drift test caught it on its first run.
- 🔴 **My own verification lied twice.** The queue check reported 1/14 (thirteen
  CORRECT `requireNavRoute` refusals — it drove every route as a platform
  administrator), then 0/14 from a corrupted regex while all fourteen worked.
  **Drive each route as the role whose tree owns it.**
- 🔴 **`Boolean('false')` is `true`** — found in `inStock` AFTER fixing the same
  bug on the three publication routes. Enumerate accepted values, never coerce.
- ⚠️ **`|| true` on a `find` is load-bearing** in `start-local.sh`: not every app
  has `src/`, and under `set -euo pipefail` a missing path killed the script
  SILENTLY after the API had already started.
- ⚠️ **`MSYS_NO_PATHCONV=1`** before any node script taking `/routes` as argv.
- ⚠️ **The Bash tool's cwd persists between calls** — several commands failed on
  a leftover `cd apps/x`.
- ⚠️ **`cmd | head -N && echo ok`** reports `head`'s exit code, not `cmd`'s.

---

## 📍 SESSION CLOSE 2026-08-01 pt2 — READ THIS BLOCK FIRST

**Tip `06ccf8d`, tree clean, pushed.** 634 API tests / 29 files · nav audit
exits 0 · every browser verify green.

### ▶ THE FIRST THING TO DO — still the owner's, still one command

The live site cannot be signed into. It needs a database, and the assistant is
**classifier-blocked** from creating one:

```
! C:\Users\USER\bin\gh.exe workflow run provision-database.yml -f confirm=CREATE --repo marc667us/autoworkshop-ai
```

If it fails on the PLAN, Render no longer offers free Postgres → that is a SPEND
decision, the owner's alone. Unchanged from the previous session.

### 🔴 OWNER DECISION WAITING — the menu promises 3x what it delivers

**Raised by the owner 2026-08-01: "all these pages and dont see all at the front
end." They were right, and the progress figure I gave was misleading.**

Re-measure any time: `node scripts/audit-menu-coverage.mjs`

| Role | Menu entries | Built | Placeholder |
|---|---|---|---|
| Owner §46 | 64 | **17 (27%)** | 47 |
| Default §34 (supervisor, QC, storekeeper, cashier, platform admin) | 56 | **18 (32%)** | 38 |
| Technician §49 | 42 | **14 (33%)** | 28 |
| Manager §47 | 36 | **13 (36%)** | 23 |
| Reception §48 | 29 | **7 (24%)** | 22 |

**141 distinct menu entries have no page anywhere.** An owner signing in finds
roughly three of every four clicks render *"the screen's own content is scheduled
for a later phase."*

⚠️ **CORRECTION TO THE PROGRESS REPORT.** I said "99 screens in workshop-web" /
"115 total". That counted every `page.tsx` FILE — including `[id]` detail
variants and one screen mounted at several role-tree routes. **The honest figure
is 61 distinct built routes in workshop-web, ~30% menu coverage, Phase 5 of 11.**

**WHY:** the navigation trees were written from the FULL 11-phase spec up front;
pages are built phase by phase. Much of the emptiness is correct — parts depot,
finance, AI, knowledge are Phases 6-9. But entries like appointments, vehicle
intake, technicians, service bays, calendar and tasks sit beside finished Phase 5
work and read as broken.

**TWO OPTIONS — the owner's call, because it is a navigation change (`05.txt` §2):**
1. **Hide unbuilt entries.** The app feels complete at every stage. Cost: the
   visible roadmap goes, and the trees stop matching the approved spec docs.
2. **Keep them, MARK them** — a visible "Phase 6" style marker in the menu, so
   nothing surprises anyone after they click. **← recommended:** honest, keeps
   the approved navigation intact, stops the app reading as broken.

Nothing applied. No navigation was changed for this.

### ▶ NEXT PIECE OF WORK — finish the evidence upload

`06ccf8d` shipped the STORAGE LAYER only, proven against real MinIO (presigned
PUT accepted, expiry enforced, bucket private). What remains:

1. **The endpoint that mints a URL.** `POST /evidence/upload-url` — resolve the
   execution FIRST (so the caller is already permitted to write it), then
   `StorageService.presignPut`. The service is deliberately NOT an authorization
   control; see its header.
2. **Record the key.** `execution_evidence.storage_key` already exists; wire the
   returned key into the existing evidence-recording path.
3. **The upload UI**, on the execution sheet.

⚠️ Reading an object back needs its own presigned GET, which is NOT built — the
bucket is private and that is correct.

### ▶ THEN — the last Slice D item

**Repo-wide RLS org-scoping (outstanding issue 8).** Explicitly NEEDS A PLAN
BEFORE CODE and has not been started. Starting point: migration 027 introduced
`identity.current_organization_id()` for ONE table, and its failure modes are
proven — an unset GUC returns NULL and matches nothing; a non-uuid RAISES. Both
fail closed.

---

## 🔴 WHAT CHANGED THIS SESSION — the load-bearing parts

### Infrastructure was lying, for five days
Redis, NATS and MinIO were **unreachable from the host** while `docker ps`
reported all five containers healthy. MinIO answered HTTP 200 *inside* its
container and HTTP 000 from outside. Cause: stale Docker port-forward wiring —
the two containers restarted on 07-28 worked, the three from 07-27 did not.
Fixed with `docker restart` (`d9845c3`).

**`start-session.sh` section 3b is the durable half.** It used to PRINT
"a container reporting healthy is not proof the service works" and then read
container health anyway. It now completes a real protocol exchange from the host
— Redis must answer `+PONG`, NATS must send its `INFO` banner, Keycloak's realm
must serve its discovery document. Proven to FAIL with a container stopped.

### The navigation and the API disagreed about who does what
`docs/03-ui-ux/NAVIGATION-GAPS-PROPOSAL.md` — 7 gaps found and closed
(`6c3e534`, owner-approved Option A). Root cause is structural: `ROLE_TO_NAV`
maps 8 roles but only 4 trees exist, so supervisor, storekeeper, QC inspector
and cashier all fall back to the DEFAULT tree, as does platform_administrator.
**All 21 write capabilities span 2-5 trees.**

`scripts/audit-nav-coverage.mjs` is now ENFORCING (exit 1). It caught the
owner/manager variation gap before anyone tripped over it — the first time.

### ⚠️ TWO E2E RUNS CONSUME THEIR OWN FIXTURE
Seed first or they report a clean pass while testing nothing:
```bash
bash scripts/seed-qc-fixture.sh          # before verify-quality-control.mjs
bash scripts/seed-variation-fixture.sh   # before verify-variation-screen.mjs
```
Both were added because the run reported green while the main path never ran.

---

## 🔴 TRAPS — the ones that cost time THIS session

- **A trigger enforcing a rule on UPDATE and nowhere else.** Hit TWICE in one
  session — QC (030→031) and variations (032→033). A direct INSERT bypassed
  both. **Ask every trigger which statements it fires on.**
- **A verify script that walks through the gap it guards.** `verify/032`
  performed the internal review as the technician who raised the variation —
  exactly what §3792 forbids — and reported 15/15. Migration 033 made it fail;
  that is the only reason it surfaced.
- **A predicate that can never match.** `polwithcheck IS NULL` returned 0 rows
  against 39 matching policies (Postgres stores a COPY of USING). The nav audit
  did the same thing differently — `indexOf('[')` matched the `[]` in
  `NavGroup[]`, every tree parsed as 0 routes, 21 false gaps reported
  confidently.
- **Backticks inside a SQL `--` comment inside a TS template literal.** Three
  times. It terminates the string.
- **`Boolean('false')` is TRUE and `Number('')` is 0.** Both would have written
  the dangerous value silently — a QC pass, a free variation, a zero labour rate.
- **Stale `next start` on a port `start-session.sh` does not clear** (3006, 4000)
  served 200 with none of the new build. Check `StartTime`.
- **`next build` after sourcing `.env`** is refused by `assert-build-env.mjs` —
  NODE_ENV=development loads the DEV React runtime. Use `unset NODE_ENV`.
- **admin-web is :3006, customer-web :3000, workshop-web :3001** — pinned by the
  realm's redirect URIs, not free choice.

---

## Ports / state at close

| | |
|---|---|
| API | :4000 |
| workshop-web | :3001 |
| admin-web | :3006 |
| customer-web | :3000 — the **Abossey Okai marketplace landing** (signed out) |

⚠️ Servers were left RUNNING.
✅ Migrations **001-034 are now on RENDER** as well as locally (2026-08-02).
`apply-migrations.yml` is the workflow; it dry-runs by default and calls
`infrastructure/migrations/run.sh` rather than reimplementing the ledger.
