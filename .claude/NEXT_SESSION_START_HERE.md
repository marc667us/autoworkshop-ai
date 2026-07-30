# ▶ START HERE — next session

```bash
cd /c/Users/USER/Documents/autoworkshop-ai && bash scripts/start-session.sh
```

**Run that first, before reading the rest of this file.** It is the start of the session:
it kills stale dev servers (`pkill` does NOT work on Windows — this is the single most
expensive trap in this repo), proves the ports are free, checks the Docker containers,
applies any pending migration, and prints what to run next. Read-mostly and idempotent;
it deliberately does NOT build or start anything, because a script that silently starts
servers is how you end up with two.

Then continue with this file, then `.claude/CURRENT_TASK.md`.

---

**Phase 5 slice 3b SHIPPED 2026-07-30 (`b243552`).** Diagnosis records: migration **013**,
§3026-§3046's fields, §1290's three standings, §1294 made structural, §1292's supervisor
review with BOTH the role rule and the reviewer-is-not-submitter rule, screens at all four
role-tree routes. `diagnosis_in_progress` has content behind it.

**Codex found 2 (one HIGH review-bypass), the Supervisor found 6 more it missed** — see
`reviews/phase5-slice3b-diagnosis-records.md`. Owner direction stands: **batch 3-4 slices
per session.** Slice 3b took a full session because seven of the eleven defects were in the
VERIFICATION HARNESSES, not the product. Section 5 is how not to re-pay that.

## 📍 STATE AT THE 2026-07-30 CLOSE — read this whole block first

**Tip `b243552` on `master`, pushed, tree clean. 3 commits:**
`a1527a2` slice · `b26058a` Codex fixes · `b243552` Supervisor fixes.
**CI ✅ + Security CI ✅ on `b243552` (the tip) and on `b26058a`.** Release is RED at the
Render deploy step only — the free-tier suspension, issue 2 below, not a defect.

**Dev servers are STOPPED** — killed at close deliberately, not left running. Three stale
servers cost an hour of this session (trap 1), and leaving mine up would have re-armed the
same trap for you. Section 1 brings them back.
Docker infra IS up and healthy: aw-keycloak, aw-postgres, aw-redis, aw-minio, aw-nats,
aw-coturn.

### ▶ THE FIRST THING TO DO

`bash infrastructure/migrations/run.sh` — 013 is applied locally, nothing pending. Then
start slice 4 (repair plan) from `.claude/CURRENT_TASK.md`. **Nothing is on fire.**

### ⚠️ OUTSTANDING ISSUES AND ERRORS — the complete list

| # | Item | State |
|---|---|---|
| 1 | **Migrations 008-013 applied to the LOCAL Postgres ONLY** | Must run wherever else the DB lives. `run.sh` is idempotent-by-tracking. |
| 2 | **Live site 503 until 1 August** — Render free-tier instance-hours, owner-confirmed | **No code change affects it.** Release is red for this reason alone; re-run it once the site serves. Two always-on free services cannot share one 750h allowance. |
| 3 | **`RENDER_API_KEY` unrotated** since the 2026-07-27 transcript leak | Treat as compromised. Rotate, then update the GitHub secret. Owner said "soon we rotate". |
| 4 | **T-0044 — document scrolls 51px sideways at 768px, on EVERY page** | Pre-existing shell defect. Measured identical on both new diagnosis pages, so NOT from 3a or 3b. 1280 and 390 are clean. |
| 5 | **`recorded_by` on a finding is re-stamped on every edit** | The ORIGINAL recorder is recoverable only from the audit trail (`diagnosis.finding_updated`). Migration 012 gave findings no `updated_by`. Low, and deliberate for now — flag it if slice 9's QC needs the original hand. |
| 6 | An attempted self-review (§563) throws before any audit write, so **permission denials are not audited** | Pre-existing convention across every service here, not new. CLAUDE.md §16 does list "permission denied" as an audit event — worth one dedicated pass across all services rather than one service at a time. |

### 🔴 TRAPS THAT COST TIME THIS SESSION — do not re-pay them

- **`pkill -f` FROM GIT BASH DOES NOT KILL WINDOWS PROCESSES.** Three servers from the
  previous day were still serving: `/api/v1/diagnoses` 404'd while `/api/v1/inspections`
  answered 401, and a finished page rendered the "not built yet" catch-all. Every one of
  those looks exactly like a product defect. Use
  `Get-NetTCPConnection -LocalPort N -State Listen` → `Stop-Process -Id <pid> -Force`, then
  CONFIRM the survivor's `StartTime` is your build.
- **A `waitFor` on a condition that is ALREADY TRUE is not a wait.** The browser harness
  pressed Start then waited for "a link" — one was already on the row, pointing at the
  previous attempt. It opened a read-only record and blamed the product. Wait for something
  that is FALSE until the action succeeds; here, the queue's verb (`Record` vs `View`).
- **A backtick in a SQL comment inside a template literal ends the string.** Landed again,
  in the very comment warning about it. `tsc` catches it as `TS1005 ',' expected`.
- **`count()` STILL does not auto-wait.** Third payment. `waitFor({state:'attached'})` first.
- **`StatusBadge` renders its own `role="status"`**, so "read the first non-empty live
  region" returns the word "In progress". Match the live region BY PATTERN.
- **A harness that measures its own residue.** Findings accumulate across runs, so
  `filter({hasText:'...'})` + `.first()` picked a row an earlier run had already edited, and
  reported two product defects. Tag everything a run creates.
- **`aria-label` means the accessible name is NOT the visible text** — `getByRole({name:
  /^Remove$/})` matched nothing.
- **A measurement that measures nothing still says OK.** The layout script followed any link,
  landed on a settled record, printed "0 hidden labels" and passed. It now CREATES the
  editable state and FAILS on zero.
- **`.gitignore` held one filename, not a pattern** — `git add -A` staged two captured
  sessions (an encrypted Auth.js cookie + a live Keycloak access token). Now a glob.
- **When you give a value a NEW meaning, re-check every path that could already produce it.**
  Making `null` mean "clear" turned a wrong TYPE from a harmless no-op into data loss.

### 🔁 RE-RUNNABLE PROOFS BUILT THIS SESSION — copy these for every later slice

```bash
# two sessions at once — needed for any rule about WHO, e.g. §563 independence
(cd apps/e2e && node verify/capture-session.mjs --url http://localhost:3001 \
     --user technician@autoworkshop.local --out .verify-tech-cookies.json)
(cd apps/e2e && node verify/capture-session.mjs --url http://localhost:3001 \
     --user supervisor@autoworkshop.local --out .verify-sup-cookies.json)

(cd packages/auth && node verify/probe-diagnosis.mjs --card JC-000003)   # 46/46
(cd apps/e2e && node verify/record-diagnosis-in-browser.mjs)             # 37/37
(cd apps/e2e && node verify/measure-diagnosis-layout.mjs)                # 15/15

# migration grants + triggers, as the app's own role, under RLS, rolled back
docker exec -i aw-postgres psql -v ON_ERROR_STOP=1 -U autoworkshop -d autoworkshop \
  < infrastructure/migrations/verify/013_finding_removal.sql              # 3/3

bash scripts/guardrails/check-page-gates.sh   # control-test it by deleting a gate
```

**A fourth dev identity now exists:** `supervisor@autoworkshop.local` (`workshop_supervisor`),
seeded via `DEV_USER_ROLE=workshop_supervisor DEV_USER_EMAIL=... bash scripts/seed-dev-identity.sh`.
⚠️ A `workshop_supervisor` uses the **§34 default tree** — `/repair-services/diagnosis`. The
`repair-control/*` routes belong to the §46 owner and §47 manager and 404 for a supervisor.
That is why every screen is built at all four routes and gated separately.

### 🗓 OWNER DIRECTION — standing

- **Batch 3-4 slices per session**, gates once per batch. Phase 5 is ~5 of 16 slices done.
- The 3D fault/repair simulation is Phase 10 + **Phase 12** (after 1.0); the libraries are
  Phase 9. Not skipped — sequenced. Full reasoning at the end of `CURRENT_TASK.md`.

---

## 1. Bring it up

```bash
cd /c/Users/USER/Documents/autoworkshop-ai
docker ps --format "{{.Names}}\t{{.Status}}"      # aw-keycloak must say (healthy)

# ⚠️ KILL STALE SERVERS FIRST — see trap 1. `pkill` will NOT do it.
powershell -NoProfile -Command "foreach (\$p in @(3000,3001,4000)) { Get-NetTCPConnection -LocalPort \$p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -ErrorAction SilentlyContinue } }"

# FOUR dev identities (idempotent). Password for all: Change_me_locally1!
bash scripts/seed-dev-identity.sh                                                            # technician
DEV_USER_ROLE=platform_administrator DEV_USER_EMAIL=admin@autoworkshop.local      bash scripts/seed-dev-identity.sh
DEV_USER_ROLE=reception_staff        DEV_USER_EMAIL=reception@autoworkshop.local   bash scripts/seed-dev-identity.sh
DEV_USER_ROLE=customer              DEV_USER_EMAIL=customer@autoworkshop.local    bash scripts/seed-dev-identity.sh
DEV_USER_ROLE=workshop_supervisor   DEV_USER_EMAIL=supervisor@autoworkshop.local  bash scripts/seed-dev-identity.sh
bash scripts/seed-dev-core.sh    # customers + vehicles in BOTH tenants

bash infrastructure/migrations/run.sh

cd apps/api && rm -rf dist && ./node_modules/.bin/nest build && cd ../..
set -a && . ./.env && set +a && (cd apps/api && node dist/main.js &)

cd apps/workshop-web && rm -rf .next && ./node_modules/.bin/next build
AUTH_SECRET='local_dev_only_2SbQ8vJmK4pR7wZxN1cT6yH9gL0aE3dU' AUTH_URL='http://localhost:3001' \
API_BASE_URL='http://localhost:4000' KEYCLOAK_URL='http://localhost:8080' \
KEYCLOAK_REALM='autoworkshop' ./node_modules/.bin/next start -p 3001
```

**Then PROVE the server is yours**, not yesterday's:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/v1/diagnoses   # 401, never 404
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3001 -State Listen | ForEach-Object { Get-Process -Id \$_.OwningProcess | Select-Object Id,StartTime }"
```

### Signing in by hand (this tripped the owner up)

**`http://localhost:3001`** — plain `http` → **Sign in** → **Keycloak** → username is the
**FULL EMAIL** → `Change_me_locally1!`.

| Sign in as | Sees |
|---|---|
| `admin@autoworkshop.local` | everything in Alpha Motors |
| `supervisor@autoworkshop.local` | the §34 default tree; **can review a diagnosis they did not submit** |
| `reception@autoworkshop.local` | ⚠️ defaults to **Alpha Parts Supply** — switch organisation in the top bar |
| `technician@autoworkshop.local` | ONLY their assigned job card; customers/vehicles refused |
| `customer@autoworkshop.local` | (port 3000) only their own 2 vehicles |

## 2. Re-prove isolation BEFORE building — both directions

```bash
export MSYS_NO_PATHCONV=1     # else /customers becomes C:/Program Files/Git/customers
cd apps/e2e
node verify/read-page-signed-in.mjs --url http://localhost:3001/customers/customer-search \
  --user reception@autoworkshop.local --expect "Kwame Mensah" --reject "Yaw Darko"
node verify/read-page-signed-in.mjs --url http://localhost:3001/home/my-assigned-work \
  --user technician@autoworkshop.local --expect "JC-000003" --reject "JC-000004"
```

`Yaw Darko` appearing = **Severity-1 tenant-isolation regression**.

## 3. Then build — Phase 5 slice 4

**Repair plan — tasks, tools, parts, labour** (`1.txt` §378-§384, `07.txt` §22-§26). It
consumes the CONFIRMED findings of an APPROVED diagnosis, which is why 3b had to land first.
Copy 3b's shape wholesale: header + child rows in one transaction, attempts not edits,
immutable on submission in the service AND by trigger, role rules in their own module with a
drift test against the migration, and a REACHABLE alternative for every refusal.

Remaining Phase 5 order is in `.claude/CURRENT_TASK.md`: 4 repair plan → 5 quotation →
6 Solution Studio → 7 execution → 8 testing → 9 QC → 10 release → 11 dashboards →
12 inboxes, then acceptance (`07.txt` pt2 §51-§52).

⚠️ **Do NOT build the BRANCH switcher.** Nothing scopes data by branch — no `core`/`repair`
table has a branch predicate and no query uses `app.branch_ids`. Add branch scoping to the
schema first or skip it.

## 4. Not blocking, not forgotten

- Production returns **1 August**; re-run the Release workflow once it serves.
- The workshop dashboard still shows demo tiles (labelled as such on screen).
- Phase 4 leftovers, each blocked on something ABSENT rather than on time: customer profile
  (**buildable now**), service history (needs completed job cards), vehicle documents (MinIO),
  maintenance schedule (service-interval rules), appointment request (appointments table),
  workshop search (public org directory).

## 5. Older traps, still live

- **READ THE COUNT, NEVER THE EXIT CODE.** `pnpm e2e` once exited 0 while running ZERO tests
  for two days. Current baseline: **138 passed / 2 skipped**. Unit: **344**.
- Playwright runs from `apps/e2e` via `./node_modules/.bin/playwright test` — there is no
  `pnpm e2e` script at the root.
- **`className="sr-only"` DOES NOTHING IN THIS REPO.** Use `visuallyHidden` from
  `@autoworkshop/ui` — and it is `position: absolute`, so it needs a POSITIONED ANCESTOR or
  it escapes the scroll container. Fix the ANCESTOR, never the label. Better still, prefer
  `aria-label` on a control: an attribute has no layout and cannot escape anything.
- **`overflow-x: auto` alone does not contain a wide child** in a flex/grid ancestor — it
  also needs `minWidth: 0`.
- **A `BEFORE DELETE` trigger must `RETURN OLD`.** Returning `NEW` (NULL on delete) SKIPS the
  row silently and the caller sees success.
- **A migration already applied is CHECKSUMMED — never edit it.** 011 fixed 010; 013 fixed 012.
- **Importing `@autoworkshop/next-shell` in a Node context pulls in `next-auth`** and dies on
  `next/server`. Import the pure module directly (`next-shell/src/viewer-contract`).
- A Nest module using `@UseGuards(TenantGuard)` must import `IdentityModule` — typecheck
  passes and the app fails to BOOT. Watch for `Mapped {...}` lines in the API log.
- **Keycloak login can exceed 30s here.** A timeout is NOT proof of a failed login — check
  the final URL and `/api/auth/session` first. Access tokens expire fast: capture a session
  immediately before the probe that uses it.
- **Do NOT kill `wslrelay.exe`** — it severs Docker's host port forwarding.
- **Codex's sandbox intermittently blocks command execution.** Its review is then
  diff-reading only — say so, never report it as a verified pass. It also needs the prompt on
  **stdin** (`printf '%s' "$P" | codex.cmd exec ... -`); passed as an argv string it received
  only the first line and answered "please send the rest of the task".
