# Current task

**▶ PHASE 4 slice 2 — customer + vehicle detail pages and the register forms.**

Slice 1 is done, gated and proven live. Read `.claude/SESSION_HANDOVER.md`
(2026-07-28 pt2) for the full picture; this file is the short version.

---

## What slice 1 shipped

| | |
|---|---|
| Migration 004 | `core` schema: customers, vehicles, normalised makes/models. Real FKs, joins, `tenant_id` + ENABLE **and FORCE** RLS, tenant index baseline |
| Migration 005 | vehicle uniqueness moved to ORGANIZATION scope — closes a cross-org existence oracle the Supervisor found |
| API | `CustomerService`, `VehicleService`, 6 routes under `/api/v1`, role gates on read AND write |
| Screens | Customers + Vehicles, live at all three role-tree paths, one implementation in `app/_screens/` |

**Proven signed in through real Keycloak, in both directions** — that is the part
that matters, not the green suite:

- `reception_staff` sees Alpha Motors' 3 customers and 3 vehicles; Tenant B's
  `Yaw Darko` / `AS 3312-20` never appear.
- `technician` gets **404 on the page AND 403 from the API**.

## Start by re-proving it

```bash
docker ps --format "{{.Names}}\t{{.Status}}"      # aw-keycloak must say (healthy)
bash scripts/seed-dev-identity.sh                 # technician
DEV_USER_ROLE=platform_administrator DEV_USER_EMAIL=admin@autoworkshop.local bash scripts/seed-dev-identity.sh
DEV_USER_ROLE=reception_staff DEV_USER_EMAIL=reception@autoworkshop.local bash scripts/seed-dev-identity.sh
bash scripts/seed-dev-core.sh                     # customers + vehicles in BOTH tenants

cd apps/api && rm -rf dist && ./node_modules/.bin/nest build && cd ../..
set -a && . ./.env && set +a && (cd apps/api && node dist/main.js &)

cd apps/workshop-web && rm -rf .next && ./node_modules/.bin/next build
AUTH_SECRET='local_dev_only_2SbQ8vJmK4pR7wZxN1cT6yH9gL0aE3dU' AUTH_URL='http://localhost:3001' \
API_BASE_URL='http://localhost:4000' KEYCLOAK_URL='http://localhost:8080' \
KEYCLOAK_REALM='autoworkshop' ./node_modules/.bin/next start -p 3001

# the acceptance check — BOTH directions
cd apps/e2e
node verify/read-page-signed-in.mjs --url http://localhost:3001/customers/customer-search \
  --user reception@autoworkshop.local --expect "Kwame Mensah" --reject "Yaw Darko"
node verify/read-page-signed-in.mjs --url http://localhost:3001/customers/customer-search \
  --user technician@autoworkshop.local --reject "Kwame Mensah"
```

`Yaw Darko` appearing is a **Severity-1 tenant-isolation regression** — he is
Tenant B. A technician seeing customer data is a Severity-1 authorization
regression.

## Then slice 2

1. **Detail pages** — `/…/customers/<id>` and `/…/vehicles/<id>`. `findById` and
   `GET /customers/:id/vehicles` already exist, gated and org-scoped; nothing
   calls them.
2. **Register forms** — the nav advertises `Register Customer` and
   `Register Vehicle` (§48). `POST /customers` and `POST /vehicles` exist,
   role-gated and fully validated, and **no screen calls either**. That is the
   same "endpoints with no front end" gap the owner objected to, one level down.
3. **The customer-workspace garage** (`/my-vehicles/garage`, customer-web:3000).
   This is where the `customer` role's self-scoping finally gets exercised on a
   screen — the service enforces it and no screen has ever hit that path.

### 🔴 Two rules that are binding here

**Real relationships** — FKs, joins, normalised. And the qualifier: **a foreign
key cannot carry a tenant predicate.** Relationships give integrity, RLS gives
isolation, both required. Migration 004 is the worked example.

**A page gate is not a control.** Prove every new endpoint with
`packages/auth/verify/call-api-as.mjs`, not by looking at the screen. That is how
slice 1's worst defect was found — the page 404'd a technician while the API
handed the same technician the entire customer book.

## Not blockers, not forgotten

- **Production is still DOWN** — Render `suspenders: ['billing']`, not resumable
  via the API. Owner action. Phase 4 does not need it.
- `RENDER_API_KEY` still unrotated from the 2026-07-27 transcript leak.
- Playwright's full suite has not been re-run since these changes; the other five
  apps have stale `.next` builds on disk.
