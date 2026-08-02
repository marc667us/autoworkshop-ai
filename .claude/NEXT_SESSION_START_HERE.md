# ▶ START HERE — next session

```bash
cd /c/Users/USER/Documents/autoworkshop-ai && bash scripts/start-session.sh
```

**Run that first.** It kills stale dev servers (`pkill` does NOT work on Windows —
the single most expensive trap in this repo), proves the ports are free, checks
the Docker containers, **now probes every dependency FROM THE HOST** (new, see
below), applies pending migrations, and prints what to run next.

Then this file, then `.claude/CURRENT_TASK.md`.

**To bring the whole local stack up (one command):**

```bash
APPS="workshop:3001 supplier:3002 admin:3006" bash scripts/start-local.sh
# then, from apps/mobile:
MOBILE_HOST=<your LAN ip> npx expo start --lan
```

`start-local.sh` derives ONE canonical host, registers each app's Keycloak
redirect URI, REFUSES a stale `.next`, asserts the ports are really free, and
proves `/me` still rejects an anonymous and a foreign-issuer token before it
reports ready.

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

### ▶ NEXT PIECE OF WORK, in order

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
| I1 | **Live sign-in still impossible** — DB exists and is migrated, steps 3-6 remain | **OWNER-GATED**, below |
| I2 | No web job-card detail page; queue job numbers are plain text | open → item 1 |
| I3 | 127 menu entries still render "not built yet" | open → item 2 |
| I4 | Mobile has no offline queue / camera / push | open → item 3 |
| I5 | `RENDER_API_KEY` unrotated since the 07-27 transcript leak | treat as compromised |
| I6 | T-0044 — document scrolls 51px sideways at 768px, every page | open, pre-existing |
| I7 | `record-diagnosis-in-browser` and `plan-repair-in-browser` CONSUME their fixtures | seed first; diagnosis has NO seeder |
| I8 | `security-posture.integration.spec` flakes on pool contention in the full run | passes alone; uninvestigated |
| I9 | `next start` warns `output: standalone` is set but unused | cosmetic, unexamined |

**I1 — the one thing only the owner can do:**

```
gh secret set KC_BOOTSTRAP_ADMIN_PASSWORD --repo marc667us/autoworkshop-ai
```

Keycloak reads that variable **only on a FIRST boot** — once an admin exists it
is ignored and the instance must be recreated. Steps 4-6 (deploy the API
service, point the web service at it, seed accounts) follow after.

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
