# Current task

## ▶ START HERE — STILL ONE BLOCKER, AND ONLY THE OWNER CAN CLEAR IT

Migrations **037 + 038** are written, verified (13/13 and 5/5) and pushed.
Applying them to production is classifier-blocked for the assistant:

```
! C:\Users\USER\bin\gh.exe workflow run apply-migrations.yml -f confirm=APPLY --repo marc667us/autoworkshop-ai
```

Until it runs, `POST /registration/workshop` 500s and **no workshop exists on
live**. Visible consequence on the public landing right now: the mechanic
directory reads **0** ("No workshops match that search") while parts, suppliers
and the VIN check all work. Afterwards: create the workshop through the form
(not by INSERT), then re-run `Seed live catalogue`.

---

## ✅ DONE 2026-08-05 — deployed and verified live (`71f2cf5`)

`autoworkshop.aiappinvent.com`, `verify-live-site.mjs` **9/9**. Release, CI and
Security CI all green.

### The landing, rebuilt on Solar's grammar

Two earlier passes copied Solar's sizing, then its colours, and neither copied
its STRUCTURE. `packages/marketplace-ui/src/solar-theme.tsx` now carries the
whole marketing grammar and cites the Solar line number every value came from.

Measured on production, at light AND dark OS preference: body and top bar both
`#0a0a14`, **0px** horizontal overflow at 1280/768/390, **0 console errors**,
**all 18 part cards exactly 273×356**.

### Workshop trees: 104 dead ends → 0

`audit-menu-coverage.mjs` reports **0 dead ends on all six role trees**.
`verify-workshop-menu-reachable.mjs` signs in as five roles and drives every
entry: **216 routes, 357 checks, 0 failures**.

⚠️ Coverage is still **34–50% WORKING per role**. These are honest signposts,
not features, and the audit counts them separately on purpose.

### Three dead links on the live front door (found by Codex)

- `/api/auth/register` existed only in customer-web while **workshop-web owns the
  apex** — "Create a free account" was dead on the only address anybody has.
- The VIN funnel's `callbackUrl=/vehicle-lookup` resolved only in customer-web.
- The shared landing hard-coded `action="/"` while customer-web mounts it at
  `/marketplace`; every search there threw the customer onto their dashboard.

---

## Standing warnings

- **Cold starts are not outages.** Keycloak **115–147s**; the live API **502s
  while spinning up**, then answers in ~22s. The landing NAMES the failure
  rather than rendering an empty shop. Warm Keycloak before any live sign-in
  check or it reports `error=Configuration`.
- 🔴 **`realm-autoworkshop.json` HAS DRIFTED FROM PRODUCTION.** It registers the
  apex on the CUSTOMER client only; the live realm accepts it on the WORKSHOP
  client (proven by driving `/auth` and `/registrations`, both 302, and by the
  live sign-in URL). **Re-importing that file would break sign-in AND sign-up on
  the apex.** Bring it back in step.
- **Cookies ignore the PORT**, so `localhost:3000` and `:3001` share one jar. A
  wrong workspace id works locally and fails only in production. Third instance.
- `scripts/guardrails/check-page-gates.sh` is RED with 19 pre-existing FAILs.
- `RENDER_API_KEY` still unrotated since the 2026-07-27 leak.
- Deploy: apex via **`Release`** (push to master), customer via
  `deploy-customer-web.yml`. **NEVER `render-deploy.yml`.** Run `pnpm lint` first.
- **No mobile URL exists** — Expo only.

## ▶ NEXT, IN ORDER

1. **Migrations 037+038 to live** (above) — unblocks everything signed-in.
2. Bring `realm-autoworkshop.json` back in step with the live realm.
3. Turn signposted screens into real ones, highest-traffic first: repair-request
   inbox, complaint inbox, appointments, invoices.
4. Auto-initiate sign-in so the second app needs no click.
