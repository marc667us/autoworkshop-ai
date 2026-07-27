# Current task

Two threads are open. **Read both before starting** — the second one is the reason the
first is unreviewed.

---

## 1. T-0005 — Keycloak session in the 7 Next apps · CODE DONE, GATES PENDING

Committed as `0b678b5`. **The four-gate bar is UNMET**: Codex and the Supervisor have not
run on this diff. Green so far: typecheck 15/15 · lint 15/15 · unit **122** · build 10/10.
Playwright has **not** been re-run since the change.

**Do this before building anything on top of it.**

### What landed

`packages/auth` (was an empty directory) — one Auth.js v5 factory consumed by all seven
apps. Keycloak provider, public client + PKCE, JWT session, refresh owned by the `jwt`
callback alone, `getAccessToken()` server-side only.

`viewerGrants()` / `viewerRole()` no longer return hardcoded arrays. They resolve from
`GET /api/v1/me` using the session's access token, memoised per request with React
`cache()` so the shell and the catch-all router cannot land on different identities.

The viewer is split in two on purpose:
- `packages/next-shell/src/viewer-contract.ts` — PURE. Role and permission mapping.
  Importable by Playwright, Storybook and unit tests.
- `packages/next-shell/src/viewer.ts` — SERVER. Needs `next/headers`.

Merging them breaks the e2e suite at module load, and the usual repair is to hardcode
the expected values, at which point the test stops testing the model.

### Three environment faults fixed on the way, each load-bearing for T-0005

1. **Keycloak had been dead for ~30 hours.** Postgres restarted underneath it at
   12:25:24 on 07-26; the Agroal pool's first failure was 12:25:54, thirty seconds
   later, and it never recovered. `docker ps` said "Up 41 hours" the whole time.
   Compose now probes the realm discovery document. **Not** `/health/ready` — Keycloak
   ships with the datasource health check disabled, so that endpoint answers
   `{"status":"UP","checks":[]}` with a dead database and would have reported healthy
   throughout. `restart: unless-stopped` did not help either: the process never exited,
   it hung. The healthcheck makes the failure VISIBLE; it does not self-heal.
2. **Nobody could sign in.** The realm had zero users and `identity.users` zero rows.
   `scripts/seed-dev-identity.sh` creates both halves, which must agree on the Keycloak
   subject — hence one script rather than a realm fixture plus a SQL seed.
3. **`.env.example` was wrong twice.** `DATABASE_URL` named the bootstrap superuser,
   which `DatabaseService` refuses to boot with by design; `KEYCLOAK_CLIENT_ID` named a
   client that does not exist in the realm.

### The lesson worth carrying

**Two real defects survived every gate and were found by starting the app:**
`UntrustedHost` (Auth.js v5 rejects an unrecognised Host, auto-detecting Vercel only) and
a Keycloak provider with **no `issuer`**, so it had no endpoints at all. Both made every
`/api/auth/*` route return 500 **while ordinary pages returned 200**. A check that only
loads a page cannot see either. Verify auth by calling `/api/auth/session` and
`/api/auth/providers`, not by building.

Also: the audience mapper I was about to add **already existed** as the
`autoworkshop-audience` client scope, attached to all seven web clients. Verified against
a real token (`aud: ["autoworkshop-api","account"]`) rather than assumed. Search before
adding — the reverted commit is not in history because the check happened first.

### What T-0005 deliberately did NOT do

- **No redirect-to-sign-in.** Unauthenticated visitors get the signed-out shell: no
  grants, no role, the workspace default tree. Forcing auth would couple all 137
  Playwright tests to a running Keycloak, API and seeded database — a separate,
  reviewable change.
- **No signed-in browser journey.** `SUITE_VIEWER` in `shell-journey.spec.ts` is `null`,
  which is what the suite's browser actually has. The §46–§49 role trees are covered by
  unit tests against fixture viewers, but no browser test drives a real session yet.

### A consequence you will see immediately

**The admin app renders a blank sidebar when signed out.** Every group in that tree is
gated behind `platform.admin`, so an unauthenticated viewer correctly sees nothing. This
was invisible before, because the demo viewer held that grant. It is correct — nothing
leaks — but it looks broken, and it is the strongest argument for redirect-to-sign-in on
that app specifically. Pinned by `a signed-out viewer is shown NOTHING in the
platform-admin workspace`.

---

## 2. Render deploy — BLOCKED on a silent `next build` failure

`autoworkshop.aiappinvent.com` is **not live**. See `.claude/SESSION_HANDOVER.md` for the
full diagnostic trail and the ranked plan. Short version:

Everything except the build works. DNS is correct, the service exists with the right
config, the custom domain is attached. **Six deploys failed identically**: `next build`
exits **1** immediately after "Skipping linting", with **completely empty stderr**.

Ruled out by measurement, not by guesswork:
- **Not memory** — the builder reports 48 CPUs, 95 GB RAM, an 8 GB cgroup limit, and the
  exit code is 1, not 137.
- **Not the worker pool** — `experimental.cpus: 1` changed nothing.
- **Not lint or type-checking** — skipping both moved the failure without fixing it.
- **Not sharp** — `require('sharp')` was tested directly on the builder.
- **Not the code** — a fresh clone of `master` built cleanly with Render's exact install
  and build commands.

Two of those six attempts were fixes for wrong diagnoses. The heap cap was removed;
`experimental.cpus: 1` is **still in all seven `next.config.mjs` and should come out**
once the real cause is known.

**Next move: run the identical build in GitHub Actions on Ubuntu.** Free for public
repos, Linux like Render, and Actions does not swallow stderr. It either succeeds —
proving the fault is Render-specific — or finally prints the error.

## Definition of complete (`05.txt` §6)

Migration runs · backend rule exists · API works · page renders with loading/empty/error/
permission states · permissions enforced · tests pass · lint + typecheck pass · Playwright
journey passes · responsive checked · docs updated · **no paid dependency introduced** ·
committed.
