# ▶ START HERE — next session

**Phase 5 slice 3a shipped 2026-07-29 (`444c165`, CI green).** Inspection records:
migrations **010 + 011**, the 19 `07.txt` §2930-§2966 checkpoints, immutable once
submitted, a second look is a new attempt, screens at all four role-tree routes.
Codex found 2, the Supervisor found 2 more it missed — see
`reviews/phase5-slice3a-inspection-records.md`.

**Slice 3b (diagnosis) is PART-STARTED: migration `012` is applied and committed,
schema only — nothing uses it yet.** `.claude/CURRENT_TASK.md` lists the six
remaining steps in order. Owner direction: **batch 3-4 slices per session.**

## 📍 STATE AT THE 2026-07-29 pt2 CLOSE — read this whole block first

**Tip `efb2f79` on `master`. Tree clean, nothing unpushed. CI ✅ + Security CI ✅
on both of the day's commits** (`444c165` slice 3a · `efb2f79` migration 012).
Release is RED at the deploy step only — see issue 2 below, it is not a defect.

**Dev servers are STOPPED** (killed for the Playwright run, not restarted).
Docker infra IS up and healthy: aw-keycloak, aw-postgres, aw-redis, aw-minio,
aw-nats, aw-coturn. Section 1 below brings the apps back.

### ▶ THE FIRST THING TO DO

`bash infrastructure/migrations/run.sh` — then start slice 3b at step 1 of
`.claude/CURRENT_TASK.md`. **Nothing is on fire and nothing is blocked.**

### ⚠️ OUTSTANDING ISSUES AND ERRORS — the complete list

| # | Item | State |
|---|---|---|
| 1 | **Migrations 008-012 applied to the LOCAL Postgres ONLY** | Must run wherever else the DB lives before anything depends on them. `run.sh` is idempotent-by-tracking. |
| 2 | **Live site 503 until 1 August** — Render free-tier instance-hours, owner-confirmed | **No code change affects it.** The Release workflow is red for this reason alone; re-run it once the site serves. Two always-on free services cannot share one 750h allowance. |
| 3 | **`RENDER_API_KEY` unrotated** since the 2026-07-27 transcript leak | Treat as compromised. Rotate, then update the GitHub secret on this repo. Owner said "soon we rotate". |
| 4 | **T-0044 — document scrolls 51px sideways at a 768px viewport, on EVERY page** | Pre-existing shell defect. Measured identical on both new inspection pages, so it is NOT from slices 3a/3b. 1280 and 390 are clean. |
| 5 | **Slice 3b is part-started: schema `012` exists, nothing uses it** | Deliberate and documented, not a loose end. Six remaining steps in `CURRENT_TASK.md`. |
| 6 | Supervisor `/verify` on a running app was not re-run after the final rebuild | Everything else was: 268 unit tests, Playwright 138/2 skipped, API probe 39/39, browser 15/15, layout 14/14, RLS + triggers proven by effect. |

### 🔴 TRAPS THAT COST TIME THIS SESSION — do not re-pay them

- **A rule whose escape hatch is UNREACHABLE is a wall, not a rule.** Codex's P1:
  the API told technicians "start a new inspection to record a second look" and
  the UI had no way to do it. Whenever a refusal names an alternative, check the
  alternative is reachable from the product.
- **Read the COUNT, never the exit code.** 49 tests "passed" while an entire file
  failed to COMPILE (backticks in a SQL comment inside a template literal).
- **`visuallyHidden` is `position: absolute`** — with no positioned ancestor it
  escapes its scroll container and stretches `<html>`. Landed AGAIN this session
  (23px at 390px). Fix the ANCESTOR, never the label.
- **A `BEFORE DELETE` trigger must `RETURN OLD`.** Returning `NEW` (NULL on a
  delete) does not refuse loudly — it SKIPS the row silently and the caller sees
  success.
- **An unscoped `[role="alert"]`/`[role="status"]` matches the shell's own empty
  live region** and reads as a failure. Scope to `main` and filter by text.
- **`locator.count()` does NOT auto-wait** (unlike `click`/`selectOption`), so it
  reports 0 on a page that has not rendered. A harness that cries wolf costs as
  much as one that runs nothing.
- **`capture-session.mjs` needed `.first()`** — customer-web's signed-out page
  offers "Sign in" twice, which was a Playwright strict-mode violation that
  blocked ANY customer-web capture. Fixed.
- **A migration already applied is CHECKSUMMED — never edit it.** Fixes to 010
  went into 011.
- **`MSYS_NO_PATHCONV=1`** for leading-slash args to node scripts — but NOT for
  `pnpm` itself, which it breaks.

### 🔁 RE-RUNNABLE PROOFS BUILT THIS SESSION — copy these for every later slice

```bash
# the API, with a REAL Keycloak token (39/39)
(cd apps/e2e && node verify/capture-session.mjs --url http://localhost:3001 \
     --user technician@autoworkshop.local)
(cd packages/auth && node verify/probe-inspection.mjs --card JC-000003)

# the SCREEN — catches a <select> whose name the server action does not read (15/15)
(cd apps/e2e && node verify/record-inspection-in-browser.mjs)

# layout — the visuallyHidden-escape signature at 1280/768/390 (14/14)
(cd apps/e2e && node verify/measure-inspection-layout.mjs)
```

`call-api-as.mjs` TRUNCATES bodies to 400 chars for review notes — do not parse
its output; that is why `probe-inspection.mjs` does its own fetch.

### 🗓 OWNER DIRECTION — standing

- **Batch 3-4 slices per session**, gates once per batch. One slice per session is
  too slow: we are at phase 5 of 11 (+12-14 from the extension) and Phase 5 is the
  largest phase — roughly **4 of 16 slices done**.
- The owner pressed on three gaps. **Two are scheduled, not skipped:** the 3D
  fault/repair simulation is Phase 10 (viewer, 0.9) + **new Phase 12 Simulation
  Intelligence (1.1, after 1.0)**; the libraries are Phase 9 (0.8). User flows are
  Phase 5 — i.e. now, which is the one the owner is right to press on. Full
  reasoning at the end of `CURRENT_TASK.md`.

---

**Previously — Phase 5 slice 2 shipped 2026-07-29** — job cards can now MOVE, and the Repair
Staging Board exists. typecheck 15/15 · lint 15/15 · **232 unit tests** ·
page gates **23/23**. Migrations **008 + 009** applied locally — run
`bash infrastructure/migrations/run.sh` before anything else.

**Next: Phase 5 slice 3 — inspection and diagnosis records.** See
`.claude/CURRENT_TASK.md`. The stages exist with no content behind them.

Read this, then `.claude/SESSION_HANDOVER.md` (2026-07-28 pt2 section), then
`.claude/TASK_QUEUE.md`.

---

## 1. Bring it up

```bash
cd /c/Users/USER/Documents/autoworkshop-ai
docker ps --format "{{.Names}}\t{{.Status}}"      # aw-keycloak must say (healthy)

# FOUR dev identities (idempotent). Password for all: Change_me_locally1!
bash scripts/seed-dev-identity.sh                                                            # technician
DEV_USER_ROLE=platform_administrator DEV_USER_EMAIL=admin@autoworkshop.local     bash scripts/seed-dev-identity.sh
DEV_USER_ROLE=reception_staff        DEV_USER_EMAIL=reception@autoworkshop.local bash scripts/seed-dev-identity.sh
DEV_USER_ROLE=customer               DEV_USER_EMAIL=customer@autoworkshop.local  bash scripts/seed-dev-identity.sh
bash scripts/seed-dev-core.sh    # customers + vehicles in BOTH tenants, insurance dates,
                                 # and the customer<->account link the garage depends on

cd apps/api && rm -rf dist && ./node_modules/.bin/nest build && cd ../..
set -a && . ./.env && set +a && (cd apps/api && node dist/main.js &)

cd apps/workshop-web && rm -rf .next && ./node_modules/.bin/next build
AUTH_SECRET='local_dev_only_2SbQ8vJmK4pR7wZxN1cT6yH9gL0aE3dU' AUTH_URL='http://localhost:3001' \
API_BASE_URL='http://localhost:4000' KEYCLOAK_URL='http://localhost:8080' \
KEYCLOAK_REALM='autoworkshop' ./node_modules/.bin/next start -p 3001
# customer-web is identical on port 3000 with AUTH_URL=http://localhost:3000
```

### Signing in by hand (this tripped the owner up)

Open **`http://localhost:3001`** — plain `http`, not `https` → **Sign in** →
**Keycloak** → username is the **FULL EMAIL** (`admin@autoworkshop.local`, not
`admin`) → `Change_me_locally1!`.

| Sign in as | Sees |
|---|---|
| `admin@autoworkshop.local` | everything in Alpha Motors |
| `reception@autoworkshop.local` | ⚠️ defaults to **Alpha Parts Supply** (1 customer, 0 vehicles). Not a bug — switch organisation in the top bar |
| `technician@autoworkshop.local` | ONLY their assigned job card; customers/vehicles are refused |
| `customer@autoworkshop.local` | (port 3000) only their own 2 vehicles |

## 2. Re-prove it BEFORE building — both directions

```bash
export MSYS_NO_PATHCONV=1     # else /customers becomes C:/Program Files/Git/customers
cd apps/e2e
node verify/read-page-signed-in.mjs --url http://localhost:3001/customers/customer-search \
  --user reception@autoworkshop.local --expect "Kwame Mensah" --reject "Yaw Darko"
node verify/read-page-signed-in.mjs --url http://localhost:3001/customers/customer-search \
  --user technician@autoworkshop.local --reject "Kwame Mensah"
node verify/read-page-signed-in.mjs --url http://localhost:3001/home/my-assigned-work \
  --user technician@autoworkshop.local --expect "JC-000003" --reject "JC-000004"
```

`Yaw Darko` appearing = **Severity-1 tenant-isolation regression**.
A technician seeing the customer list = **Severity-1 authorization regression**.

## 3. Then build — Phase 5 slice 2

**Repair Staging Board + stage transitions.** A job card can be opened but
cannot leave `complaint_received`. `02.txt` §29 gives the board columns and they
are already the CHECK constraint on `repair.job_cards.stage`; migration 007
added `stage_changed_at` so the board can show how long a card has sat.

Needs `PATCH /job-cards/:id/stage` with a role→allowed-stage matrix grounded in
`07.txt` pt2 §50 — a technician may reach inspection / diagnosis / testing, but
not quality control or release.

### Phase 4 leftovers — each blocked on something ABSENT, not on time

| Item | Blocked on |
|---|---|
| **Customer profile** | **nothing — small, buildable now** |
| Service history | completed job cards |
| Vehicle documents | file storage (MinIO wiring) |
| Maintenance schedule | service-interval rules |
| Appointment request | an appointments table |
| Workshop search | a public organisation directory |

⚠️ **Do NOT build the BRANCH switcher.** Nothing scopes data by branch — no
`core`/`repair` table has a branch predicate and no query uses `app.branch_ids`.
It would change a label and nothing else. Add branch scoping to the schema first
or skip it.

## 4. Not blocking, not forgotten

- **Production returns 1 August** — Render free-tier 750 instance-hours,
  confirmed by the owner. `autoworkshop.aiappinvent.com` returns 503 until then;
  no code change affects it. Re-run the Release workflow once it serves.
  **Two always-on free services cannot share one allowance** (a month is ~730h).
- `RENDER_API_KEY` unrotated since the 2026-07-27 transcript leak.
- Playwright's full suite has not been re-run since Phase 4 began.
- The workshop dashboard still shows demo tiles (labelled as such on screen).

## 5. Traps this session paid for

- **A GREEN GATE THAT RUNS NOTHING.** `pnpm e2e` exited **0 while executing ZERO
  tests** for two days: one spec failed to *collect* and Playwright still
  reported success. Always read the count, never the exit code. Fixed — the
  suite is now 138 passed / 2 skipped, and `pnpm e2e` is worth trusting again.
- **Importing `@autoworkshop/next-shell` in a Node context pulls in `next-auth`**
  and dies on `next/server`. From tests, import the pure module directly
  (`next-shell/src/viewer-contract`) — the barrel evaluates the server half.
- **Kill every app server before running the suite.** The build-guard failed
  first time on stale customer-web and admin-web servers; killing them turned
  2 failures into 91 passes. Nothing was wrong with the code.
- **`className="sr-only"` DOES NOTHING IN THIS REPO** — nothing defines that
  class, so the text renders visibly. Use `visuallyHidden` from
  `@autoworkshop/ui`. It cost three stray labels and counts reading "11 job card".
- **A `visuallyHidden` element needs a POSITIONED ancestor.** It is
  `position: absolute`; with none it lays out against the initial containing
  block and can escape an `overflow-x` container. Signature to look for:
  `documentElement.scrollWidth` huge while `body.scrollWidth` is normal.
- **`overflow-x: auto` alone does not contain a wide child** inside a flex/grid
  ancestor — it also needs `minWidth: 0`.
- **Codex reviews a diff; it will not see what the page DOES.** Both front-end
  defects above passed every gate and were found by measuring the rendered page.
- **`capture-session.mjs` can fail once on a cold server** and succeed
  immediately on retry. A first-run timeout is not proof of anything.
- **A migration already applied is CHECKSUMMED — never edit it.** Fixes to 008
  went into 009.
- **Git Bash mangles `/path` arguments** — `export MSYS_NO_PATHCONV=1`.
- **Keycloak login can exceed 30s here.** Verify scripts wait 90s and use
  `noWaitAfter` on the provider AND `#kc-login` clicks. **A timeout is not proof
  of a failed login** — check the final URL and `/api/auth/session` first.
- **Scope test assertions to the FORM.** An unscoped `[role="status"]` matches
  the shell's own empty live region and reported a working write as a failure.
- **Sign in on a landing page, never on the page under test** — a 404 target
  renders no sign-in link, so the harness silently tests an anonymous visitor.
- **`'ApiFailure' in 'describeApiFailure'` is true.** A substring check where a
  token check was needed made a fix script do nothing and report success.
- A Nest module using `@UseGuards(TenantGuard)` must import `IdentityModule` —
  typecheck passes and the app fails to BOOT.
- **Kill stale servers and `rm -rf .next`/`dist` before verifying.**
- **Do NOT kill `wslrelay.exe`** — it severs Docker's host port forwarding.
- **Codex's sandbox intermittently blocks command execution** ("rejected by
  policy"). Its review is then diff-reading only — say so, never report it as a
  verified pass.
