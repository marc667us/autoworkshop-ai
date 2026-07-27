# ADR-017 — Production deploys run a prebuilt image, not a host build

**Status:** Accepted · 2026-07-27
**Supersedes:** the `runtime: node` half of the `render.yaml` blueprint (ADR-012 still governs cost)

## Context

`autoworkshop.aiappinvent.com` was not live. The blocker was not DNS, not the
custom domain and not the service definition — all three were correct and the
domain was already `verified`. The blocker was that **Render's builder cannot
build this repository**.

The failure signature is hostile to diagnosis: `next build` exits **1**
immediately after "Skipping linting", with **completely empty stderr**. A log
with no error in it is consistent with every hypothesis, which is exactly why
six fixes were attempted across two sessions and **two of them were fixes for
wrong diagnoses**.

What has been ruled out, each by measurement rather than argument:

| Hypothesis | How it was killed |
|---|---|
| Out of memory | builder reports 48 CPUs / 95 GB RAM, 8 GB cgroup; exit code **1**, not 137 |
| Build worker pool | `experimental.cpus: 1` + `workerThreads: false` changed nothing |
| Lint / type-check | skipping both moved the failure without fixing it |
| `sharp` native build | `require('sharp')` tested directly on the builder |
| The code itself | a clean checkout builds in ~25 s on `ubuntu-latest` |
| **V8 heap limit (448 MB)** | **reproduced deliberately at 496 MB in CI — the build still passed** |

The last row is the one that closed the argument. The 448 MB heap was the best
remaining explanation and it is *wrong*; had it been applied as a fix it would
have been the seventh attempt and the third wrong diagnosis.

At that point the useful question stopped being "why does Render's builder fail"
and became "why is Render's builder in the critical path at all".

## Decision

**CI builds a container image, proves it serves, publishes it to GHCR, and
Render runs that image. Render compiles nothing.**

- `apps/workshop-web/Dockerfile` — multi-stage, `output: 'standalone'`, pinned to
  the same Node and pnpm versions as CI.
- `.github/workflows/release.yml` — the production gate.
- A new **image-runtime** Render service. A service's runtime cannot be changed
  from `node` to `image` in place, which is why the existing
  `srv-d9jsliu7r5hc73b1kncg` is retired rather than repaired.

### The gate is "does it serve", not "does it compile"

This is the part that matters, and it is not a formality. **Twice** this repo has
shipped changes that were green on typecheck, lint, 122 unit tests and a
10-target build and were still broken the moment the app was started:

1. `UntrustedHost` — Auth.js v5 rejects an unrecognised Host and only
   auto-detects Vercel.
2. A Keycloak provider with **no `issuer`** — so no authorization, token or JWKS
   endpoint existed.

Both produced **500 on every `/api/auth/*` route while ordinary pages returned
200**. That asymmetry is invisible to any check that merely loads a page, which
is why `release.yml` starts the real container and calls
`/api/auth/providers` and `/api/auth/session` explicitly, and asserts the
session document contains no tokens before publishing.

## Consequences

**Good.** An unexplained third-party build host is permanently out of the
deploy path. The artifact that runs in production is byte-identical to the one
that was smoke-tested — the deploy pins the commit-sha tag, not `:latest`.
Deploys become an image pull, which is faster and cannot fail for build reasons.

**Costs and limits, stated rather than discovered:**

- **The GHCR package must be public.** Render pulls anonymously; a private
  package fails with `manifest unknown`, which does not look like a permissions
  error. The repository is already public, so this leaks nothing new.
- **`NEXT_PUBLIC_*` variables are baked in at build time.** Setting them on the
  Render service affects server-side reads only. Changing a client-visible one
  requires a rebuild, not a restart.
- **The root cause of the Render build failure is still unknown.** This decision
  routes around it; it does not explain it. That is an acceptable trade only
  because the build now happens somewhere its output can be read.
- The other six Next apps still have no deployment story. Only `workshop-web` is
  containerised.

## Not decided here

Postgres, Keycloak, Redis, NATS and the NestJS API remain undeployed, so the
live site renders its **signed-out** state. That is correct behaviour, not a
fault — see `render.yaml` and ADR-016. Sign-in going live is a separate decision
about where identity is hosted, and Render's free Postgres is ruled out by
COMBINED_PLAN_v2 §6 (30-day expiry — the exact failure that took Solar down on
2026-07-09).
