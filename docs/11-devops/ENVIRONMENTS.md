# Deployment environments

Two Render services, one pipeline, zero cost. Both run the **same container
image**; nothing is rebuilt between them.

| | Staging | Production |
|---|---|---|
| Service | `autoworkshop-web-staging` | `autoworkshop-web` |
| Service id | `srv-d9jun8m417fc73dore50` | `srv-d9ju49id0e5s7389fjlg` |
| URL | `https://autoworkshop-web-staging.onrender.com` | `https://autoworkshop.aiappinvent.com` |
| Repo variable | `RENDER_STAGING_SERVICE_ID` | `RENDER_WEB_SERVICE_ID` |
| Plan / region | free / oregon | free / oregon |
| Runtime | image (no build on Render) | image (no build on Render) |
| Deployed by | `release.yml` → `staging` | `release.yml` → `promote` |
| `autoDeploy` | off | off |

`autoDeploy` is **off on both**. Render deploying on its own would bypass every
gate below, which is the exact thing the pipeline exists to prevent.

## The pipeline

```
push to master
  │
  ├─ 1. checks     typecheck · lint · unit tests
  │
  ├─ 2. image      build the container
  │                START IT and call /home/dashboard, /api/auth/providers,
  │                /api/auth/session; assert the session document has no tokens
  │                → publish to GHCR as :<sha> and :latest  (only if it served)
  │
  ├─ 3. staging    deploy :<sha> to the staging service, verify the same three
  │                routes against the real host
  │
  └─ 4. promote    deploy THE SAME :<sha> to production, verify again
```

**Production is unreachable unless the identical image is already serving on
staging.** That is what "only tested builds go to the live domain" reduces to
mechanically. The deploy pins the commit-sha tag, never `:latest`, so no rebuild
can slip between the environment that was tested and the one that runs.

### Why staging is a real gate and not ceremony

Step 2 starts a local container with test environment variables. Step 3 runs the
same image **on Render, behind Render's proxy, with its own generated
`AUTH_SECRET`**. Those differ enough to fail independently — which is the only
thing that justifies the extra wall-clock.

The routes checked are not arbitrary. Twice this repo shipped changes that were
green on typecheck, lint, 122 unit tests and a 10-target build and broke on
startup: `UntrustedHost`, and a Keycloak provider with no `issuer`. Both returned
**500 on `/api/auth/*` while ordinary pages returned 200**. A check that only
loads a page cannot see that asymmetry, so the auth routes are asserted
explicitly and separately.

## Things that will bite you

- **A free service sleeps after ~15 minutes idle** and takes roughly 50 seconds
  to wake. The first request after a quiet period is slow *by design*. The
  verify step retries for this; do not "fix" it by shortening the timeout.
- **Repository variables are snapshotted when a run is QUEUED.** Setting one
  does not reach a run already in flight. A deploy job that reports "no service
  id" right after you set the variable is not a workflow bug — re-run it.
- **A service's runtime cannot change from `node` to `image` in place.** Moving
  to prebuilt images required a new service; it could not be a repair.
- **The GHCR package must stay public.** Render pulls anonymously, and a private
  package fails with `manifest unknown`, which does not read like a permissions
  error.
- **`AUTH_URL` must match the host the browser uses.** Pointing staging at the
  production domain sends staging's sign-in callbacks to production, and presents
  as "staging auth is broken" rather than as a misconfiguration.
- **`NEXT_PUBLIC_*` is baked in at build time.** Changing one on the service
  affects server-side reads only; the client bundle needs a rebuild.

## What is NOT deployed

Postgres, Keycloak, Redis, NATS, MinIO and the NestJS API. Both environments
therefore render the **signed-out** state, which is correct and complete — no
grants, no role, the workspace's default navigation. Sign-in going live is a
separate decision about where identity is hosted; Render's free Postgres is
ruled out by COMBINED_PLAN_v2 §6 (30-day expiry — the failure that took Solar
down on 2026-07-09).

Only `workshop-web` is containerised. The other six Next apps have no deployment
story yet.

See ADR-017 for why Render's builder is out of the critical path.
