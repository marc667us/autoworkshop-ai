# ▶ START HERE — next session

```bash
cd /c/Users/USER/Documents/autoworkshop-ai && bash scripts/start-session.sh
```

**Run that first, before reading the rest of this file.** It kills stale dev servers
(`pkill` does NOT work on Windows — the single most expensive trap in this repo), proves
the ports are free, checks the Docker containers, applies any pending migration, and
prints what to run next. Read-mostly and idempotent; it deliberately does NOT build or
start anything, because a script that silently starts servers is how you end up with two.

Then continue with this file, then `.claude/CURRENT_TASK.md`.

---

**Phase 5 slice 3b SHIPPED 2026-07-30 (`b243552`)** — diagnosis records, migration 013.
**Public marketplace landing SHIPPED 2026-07-30 pt2 (`ef9d1c4`)** — migration 021, the
first public surface in the repository. Build + CI gating fixed in the same session.

## 📍 STATE AT THE 2026-07-30 pt2 CLOSE — read this whole block first

**`master`, tree clean.** Session pt2 commits: `ef9d1c4` (marketplace landing) and the
build/CI fix committed at close.

**Dev servers are STOPPED** — killed deliberately at close, not left running. Leaving
them up re-arms trap 1 for you, and a running dev server also locks `.next` and makes
`pnpm build` fail with `EPERM: .next\trace`.
Docker infra is up: aw-keycloak, aw-postgres, aw-redis, aw-minio, aw-nats, aw-coturn.

### 🔴 OWNER REPORTED AT CLOSE: "all pages don't show" — VERIFY FIRST, DO NOT ASSUME

Reported after the dev servers had been stopped at session close, so the likely
explanation is simply that nothing was listening. It is recorded here as
UNVERIFIED because it was never reproduced against a running stack.

Two things make it worth an explicit check rather than a shrug:

1. During the restart attempt, `:3001` answered 307 while `:3000` and `:4000`
   still answered 000 — they were mid-boot, not ready. Anyone testing in that
   window sees nothing on two of three ports and a redirect on the third.
2. The customer-web `.next` directory was deleted and rebuilt several times
   during the build investigation, and the app was last confirmed working in
   `next dev`, not `next start`.

**Check, in this order, before touching any code:**

```bash
# 1. is anything actually listening?
powershell.exe -NoProfile -Command "foreach(\$p in @(3000,3001,4000)){ \$c = Get-NetTCPConnection -LocalPort \$p -State Listen -ErrorAction SilentlyContinue; if(\$c){'LISTENING: '+\$p}else{'free: '+\$p} }"

# 2. bring the stack up (section 1), then WAIT — next dev takes ~15-25s to
#    compile a route on first hit. A curl during compilation returns 000.
for u in http://localhost:4000/api/v1/health http://localhost:3000/ http://localhost:3001/; do
  echo "$u -> $(curl -s -o /dev/null -w '%{http_code}' --max-time 90 $u)"
done
# expect 200 / 200 / 307

# 3. only if a page is genuinely blank/500, read the server log — do not guess
tail -40 /tmp/aw-customer.log
```

Last CONFIRMED-good state (2026-07-30 pt2, before the servers were stopped):
18/18 content checks against the rendered landing page, all four authenticated
routes 200, `/nonexistent-page` 404. Nothing was changed after that measurement.

### ▶ THE FIRST THING TO DO

Nothing is on fire. Bring the stack up (section 1), confirm the marketplace renders at
`http://localhost:3000/`, then start **Slice A — marketplace ordering** (section 3).

---

## 1. Bring the stack up

```bash
bash infrastructure/migrations/run.sh    # 021 applied locally; nothing pending

# API :4000
(cd apps/api && rm -rf dist && ./node_modules/.bin/nest build)
set -a && . ./.env && set +a && (cd apps/api && node dist/main.js &)

# Web
(cd apps/customer-web && ./node_modules/.bin/next dev -p 3000 &)   # public marketplace
(cd apps/workshop-web && ./node_modules/.bin/next dev -p 3001 &)
```

Seed the public catalogue if the marketplace looks empty:

```bash
bash scripts/seed-dev-catalogue.sh       # prints counts — READ THEM, not the exit code
```

### ⚠️ NEVER source `.env` before `next build`

`.env` sets `NODE_ENV=development`. `next build` emits a production bundle but does **not**
override an inherited `NODE_ENV`, so it loads the **development** React runtime into a
**production** build and dies during prerendering with a null `useContext`/`useState`
blaming an innocent component. Build with:

```bash
NODE_ENV=production pnpm build
```

`scripts/assert-build-env.mjs` (imported by all 7 `next.config.mjs`) now refuses the bad
combination in ~2 seconds with an explanation. **Do not delete it.** This cost ~40 minutes
of wrong hypotheses — duplicate React, React 18 vs Next 15, a barrel import, `next/link`.
Next 15.1.3's peer range **allows** React 18; that theory was wrong.

---

## 2. What exists now that did not before

**`http://localhost:3000/` — the public Abossey Okai Auto Parts Marketplace.** Free to
browse, no account. Signed in, `/` redirects to `/home/dashboard`.

- **Migration 021** — `catalogue.suppliers`, `part_categories`, `parts`, `part_fitments`,
  `mechanic_directory`. RLS **ENABLE + FORCE** on all five; `public_read` policies keyed on
  `is_published` rather than a tenant; `admin_write` gated on `app.current_role = 'admin'`.
  Verify: `infrastructure/migrations/verify/021_public_catalogue.sql` — **10/10**.
- **`apps/api/src/public/`** — the only business controller without `TenantGuard`. Safe
  because every query uses `queryWithoutTenant` (no tenant context ⇒ tenant tables return
  zero rows, fail-closed) and nothing writes. Endpoints: `/api/v1/public/parts`,
  `/parts/facets`, `/mechanics`, `/stats`.
- **Search** by car make / model / year **plus part manufacturer** as a separate optional
  filter (make = who built the CAR, manufacturer = who built the PART).
- **Route groups** — the app shell moved from the root layout into `(app)/`, so signed-out
  visitors get no app navigation. URLs are unchanged.
- **CI now actually builds.** `ci.yml` gained a `build` job; lint/typecheck/test no longer
  end in `|| echo "Phase 1 scaffolding"`, which had made all three incapable of failing.

### ⚠️ OUTSTANDING ISSUES AND ERRORS — the complete list

| # | Item | State |
|---|---|---|
| 1 | **Migrations 008-021 applied to the LOCAL Postgres ONLY** | Must run wherever else the DB lives. `run.sh` is idempotent-by-tracking. |
| 2 | **Live site 503 — Render free-tier hours. Owner: unsuspends 1 August** | **No code change affects it.** Release is red for this reason alone; re-run once the site serves. |
| 3 | **`RENDER_API_KEY` unrotated** since the 2026-07-27 transcript leak | Treat as compromised. Rotate, then update the GitHub secret. |
| 4 | **`catalogue.parts.currency` defaults to GBP** while the app prices in **GHS** | 021 is checksummed — fix in **022**. Seed sets currency explicitly, so nothing is wrong today. |
| 5 | **Nothing can publish a catalogue row except the seed script** | No supplier/admin UI yet. Slice B. |
| 6 | **T-0044 — document scrolls 51px sideways at 768px on every page** | Pre-existing shell defect, not from any recent slice. 1280 and 390 are clean. |
| 7 | **Permission denials are not audited** | Pre-existing across every service. CLAUDE.md §16 lists it as an audit event — worth one dedicated pass, not one service at a time. |
| 8 | **RLS is tenant-only, not org-scoped** | Repo-wide since migration 001; no `identity.current_organization_id()` helper exists. Needs a plan before code. |

---

## 3. WORK SCHEDULE FOR NEXT SESSION

Ordered. Finish and verify each slice before starting the next. Owner direction stands:
**batch 3-4 slices per session** where they are small.

### ▶ Slice A — Marketplace ordering · LARGE · start here
Owner's stated model: *"user deal direct with supplier and payment in app payment
process, delivery is by delivery systems of the supplier."*

1. **Migration 022** — `catalogue.orders`, `order_lines`, `order_events`, plus the
   GBP→GHS currency-default fix (issue 4).
   - Buyer is a signed-in customer (`identity.users`); seller is a `catalogue.suppliers`
     row. The order is **not** owned by a workshop tenant — decide and document the RLS
     predicate deliberately, it is not the usual tenant one.
   - **Snapshot** price, currency and supplier at order time. A later catalogue price
     change must never rewrite a placed order (same rule as `quotations`).
   - `order_events` append-only — add an explicit **REVOKE** if `ALTER DEFAULT PRIVILEGES`
     already granted UPDATE/DELETE.
2. **Delivery is the supplier's own system.** Model it as a status the supplier reports
   plus a free-text tracking reference. Do NOT build a courier integration and do NOT
   invent tracking states we cannot observe.
3. **⚠️ PAYMENT IS A BLOCKER — ASK THE OWNER, DO NOT DECIDE.** In-app payment needs a
   provider. `feedback_zero_cost_no_spend_decisions` is a HARD rule: never propose
   spending. Build the payment *record* and leave the provider as an interface with no
   default (ADR-015 bring-your-own-connection), then ask.
4. Guarded endpoints + screens: cart/checkout, my orders, and a supplier order inbox
   (`supplier-web` exists and is empty).

### ▶ Slice B — Supplier + admin catalogue management · MEDIUM
Supplier sign-up → `catalogue.suppliers` row, part CRUD, publish toggle behind
`admin_write`. Until this exists the marketplace cannot grow without a developer.

### ▶ Slice C — Mechanic directory opt-in screen · SMALL
A workshop needs a settings screen to publish/withdraw its listing and edit the consented
fields. Keep it a **copy**, never a view over `core.organization_profile` — see the header
of migration 021 for why that boundary matters.

### ▶ Slice D — Deferred from earlier slices
- Slice 7b variation control.
- Slice 9 quality control / independent inspection (`2.txt` §563) — must be carried out by
  somebody who did not do the work.
- MinIO file upload (evidence photos).
- `organization_pricing` settings screen ("Pricing Rules").
- Repo-wide RLS org-scoping (issue 8).

---

## 4. 🔴 TRAPS — do not re-pay these

- **`pkill -f` FROM GIT BASH DOES NOT KILL WINDOWS PROCESSES.** Stale servers look exactly
  like product defects. Use `Get-NetTCPConnection -LocalPort N -State Listen` →
  `Stop-Process -Id <pid> -Force`, then CONFIRM the survivor's `StartTime` is your build.
- **Read the count, never the exit code.** The catalogue seed rolled back silently —
  heredocs opened `BEGIN;` with no `COMMIT;`, psql discards at EOF. Zero rows, exit 0.
- **A LEFT JOIN does not filter.** Category chips counted `count(p.id)` and included a part
  whose supplier was unpublished: the chip said "Filters (4)", its own search returned 3.
  Found only by cross-checking two endpoints against each other.
- **Publishing a part does not publish its supplier.** The API's supplier join is what
  excludes the orphan; verify check 7 asserts the orphan IS readable at table level so the
  join has something real to exclude.
- **`EPERM: .next\trace`** under turbo means a dev server is still running on that port.
- **A backtick in a SQL comment inside a template literal ends the string.** Landed twice
  more this session. `tsc` reports it as `TS1005 ',' expected`.
- **Postgres will not guess types.** `generate_series(smallint, smallint)` is ambiguous
  (needs `::int`); a bare `NULL` in a `CASE` makes the other branch's parameter TEXT.
- **A `waitFor` on a condition that is ALREADY TRUE is not a wait.** Wait for something
  that is FALSE until the action succeeds.
- **`count()` does not auto-wait.** `waitFor({state:'attached'})` first.
