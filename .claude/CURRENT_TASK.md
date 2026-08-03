# Current task

## ▶ START HERE — ONE BLOCKER, AND IT IS UNDERSTOOD

`POST /api/v1/registration/workshop` returns **500** on production. Everything
either side of it works. Diagnosed to the exact line by
`.github/workflows/diagnose-registration-500.yml` (run it again any time — it
rehearses against the live database inside a transaction that ROLLS BACK, so it
creates nothing):

```
Render log : new row violates row-level security policy for table "tenants"
rehearsal  : permission denied to set role "autoworkshop_app"
```

### 🔴 THE CAUSE, AND WHY NO LOCAL TEST COULD EVER HAVE SEEN IT

**Render's `autoworkshop` database user is NOT a superuser. Locally it is.**

`identity.register_workshop` is `SECURITY DEFINER` and owned by `autoworkshop`.
A superuser bypasses row-level security entirely, so locally the function's four
INSERTs sail through. On Render the same user is merely the table owner, and
`FORCE ROW LEVEL SECURITY` applies to owners — so the first INSERT is refused.

The function is byte-identical in both places. **The ROLE is not.** `verify/036`
passed 9 of 9 locally against a defect that exists only in production, which is
why this file says: for anything touching RLS, **rehearse ON LIVE**.

### THE FIX — MIGRATION 037, NOT AN EDIT TO 036

036 is applied and checksummed in both databases. Fixes go in the next number.

**Preferred shape** — a controlled, auditable bypass scoped to this one
function:

1. `register_workshop` does `SET LOCAL app.bootstrap = 'on'` as its first
   statement.
2. Migration 037 adds a permissive **INSERT** policy to `identity.tenants`,
   `identity.organizations`, `identity.branches` and `identity.memberships`:
   `WITH CHECK (current_setting('app.bootstrap', true) = 'on')`.

⚠️ **Do NOT weaken the existing policies generally.** The bypass must be
reachable only from inside this function, and only for INSERT. Registration is
the one operation that legitimately has no tenant context — it is what CREATES
the tenant.

⚠️ **Rejected alternative:** a `BYPASSRLS` role to own the function. Creating
one needs privileges Render's user probably lacks, and it would move the bypass
somewhere far less visible than a policy named in a migration.

**Verify with:** `Diagnose registration 500` (must show the four ids returned,
then roll back), then `apply-migrations.yml` with `confirm=APPLY`, then the real
thing — sign in at `autoworkshop.aiappinvent.com` and create the workshop.

### THEN: FINISH THE SEED

The owner's application user EXISTS on live (`marc667us@yahoo.com`, provisioned
2026-08-03) and holds **no membership**. Once 037 is applied, signing in and
using the "create your workshop" form on `/home/dashboard` completes it. Nothing
needs to be inserted by hand.

---

## ✅ DONE 2026-08-03 pt3

### The public landing is live on the apex, with NO DNS change

Learned by reading Solar: **one service, 421 routes, 88 public**, and `/` renders
the landing for everyone — signed in or not, no redirect. No second service means
nothing for a CNAME to point at differently, which is why Solar never needed a
Namecheap change.

The seven-app decision stands, so the public surface became
**`packages/marketplace-ui`** and `workshop-web` — which already owns the apex —
mounts it at `/`. `AddToBasket` is a render prop, so the package depends on no
app.

### 🔴 The audience defect: every authenticated call was refused

```
aud: account
"token rejected: jwt audience invalid. expected: autoworkshop-api"
```

**No audience mapper existed anywhere in the realm.** The API refused every
authenticated request from every web app while public routes worked — so the
site looked alive and said "Not signed in" beside a working "Sign out". That
symptom was misread three times across two sessions.

Fixed on 7 clients in `realm-autoworkshop.json` **and applied to the live realm
directly**, because `deploy-keycloak.yml` imports the realm on FIRST BOOT ONLY.

### VIN funnel

Offline ISO 3779 decode is the primary (no key, no cost, instant); NHTSA vPIC
enriches when reachable. `/public/vin/:vin` is free, `/vin/:vin` needs a session.
**The gate is the API sending less, never the page hiding fields** — and the
deploy asserts it: if the public endpoint ever returns `detail`, `plantCode` or
`serial`, the deploy fails.

### Defects only a browser found

A form with **no submit button** (three green gates missed it) · "Not signed in"
beside "Sign out" in customer-web, permanently, for every customer · onboarding
replacing the **public** landing · a middleware fix that passed typecheck, lint
and build then crashed the edge runtime with `Cannot redefine property:
__import_unsupported` · a leak check that reported two **false** leaks by
searching the whole page instead of the VIN section.

---

## Standing warnings

- **Keycloak cold start is up to 136 seconds** and produces
  `error=Configuration` on sign-in, not a wait. The first visitor after an idle
  period gets a hard error.
- **Four free Render services now share one instance-hour allowance.** This
  account was suspended with `suspenders: ['billing']` on 2026-07-28, and
  `autoworkshop-customer` 404'd for a stretch on 2026-08-03. **No paid remedy is
  to be proposed** — zero cost is a hard rule.
- `scripts/guardrails/check-page-gates.sh` is RED with **19 pre-existing** FAILs,
  all apparently false. Verified identical before and after this session's work.
- `RENDER_API_KEY` still unrotated since the 2026-07-27 leak.
