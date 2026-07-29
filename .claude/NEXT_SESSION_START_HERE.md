# ▶ START HERE — next session

**Phase 5 slice 2 shipped 2026-07-29** — job cards can now MOVE, and the Repair
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
