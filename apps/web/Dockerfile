# Container image for THE AUTOWORKSHOP APPLICATION (ADR-021).
#
# ONE IMAGE, SEVEN PACKS. This replaces seven near-identical Dockerfiles that
# each built one deployed application. What changed is only WHICH filter is
# passed to pnpm and which server.js is started; the reasoning below is
# inherited unchanged, because none of it was ever about how many apps there
# were.
#
# 🔴 THE HEAP CAP IS NOW THE NUMBER TO WATCH. `--max-old-space-size=384` was
# sized for a Next server rendering one pack's routes on a 512 MB free instance.
# This process now holds the route manifest and the compiled server components
# for all seven -- 341 pages instead of 42 or 263. Next loads route modules
# lazily, so the resident set should track the routes actually VISITED rather
# than the routes that exist, but that is a reasoned expectation and not yet a
# measurement. If this container dies at cold start on Render, look here first:
# an OOM kill and a free-tier suspension produce the same 503 from outside.

# ─── build ────────────────────────────────────────────────────────────────────
FROM node:20.19.2-bookworm-slim AS builder

# libvips is what `sharp` links against; without it sharp falls back to building
# from source, which needs a full toolchain and is far slower.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libvips-dev python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Manifests and the lockfile first, so the dependency layer is reused whenever
# only source changed. The workspace file is required for `--filter` to resolve
# `workspace:*` at all.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/ packages/

# `--filter @autoworkshop/web...` (trailing dots) installs this app plus
# the workspace packages it depends on and nothing else -- not Playwright, not
# Storybook, not the NestJS toolchain, none of which this image ever runs.
RUN pnpm install --frozen-lockfile --filter "@autoworkshop/web..."

COPY . .

# AUTH_SECRET is REQUIRED AT BUILD TIME, not merely at runtime: every app runs
# `auth` as middleware and Auth.js resolves its config while the route is built,
# so an absent value fails the build. This placeholder is compile-time only and
# is never present in the runtime stage -- Render injects the real one.
ENV SKIP_BUILD_CHECKS=1 \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    AUTH_SECRET=build-time-placeholder-replaced-at-runtime \
    AUTH_TRUST_HOST=true
RUN pnpm --filter @autoworkshop/web build

# ─── runtime ──────────────────────────────────────────────────────────────────
FROM node:20.19.2-bookworm-slim AS runner

# The runtime needs the shared library only, not the -dev headers.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libvips42 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

# Do not run as root. `node` is uid 1000 in this image and already exists.
USER node

# `output: 'standalone'` traced from the WORKSPACE root, so the tree is
# standalone/{apps/web/server.js,node_modules,package.json}.
COPY --from=builder --chown=node:node /repo/apps/web/.next/standalone ./
# Static assets are deliberately excluded from standalone and must be placed
# where the server expects them, or every page loads with no CSS or JS.
COPY --from=builder --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static

# Render assigns the port and routes to it. A server listening on a hardcoded
# port fails every health check while its own logs look completely healthy.
# 🔴 CAP THE HEAP, BECAUSE V8 DOES NOT KNOW HOW BIG THIS BOX IS.
#
# `autoworkshop-customer` was oomKilled at 512Mi on 2026-08-07. Uncapped, V8
# grows its old space toward whatever it believes is available and the KERNEL
# ends the process — the container just disappears, `reason: {oomKilled}` is the
# only evidence, and nothing is logged by the app itself. Capped, V8 collects
# harder as it approaches the ceiling and, if it genuinely cannot free enough,
# throws a JavaScript heap OOM WITH A STACK TRACE. That is the difference
# between a diagnosable failure and a vanished container.
#
# 384, not 512: the cap governs the JS heap only. Node's own baseline, the
# standalone server, and any native allocation (libvips is installed above) all
# live OUTSIDE it, so a cap equal to the container limit still gets killed.
#
# ⚠️ THIS IS NOT A LEAK FIX AND MUST NOT BE RECORDED AS ONE. Measured: ONE kill
# in 4 days 4 hours, with no traffic for the 12 minutes before it. That is not
# the shape of a leak. This makes the failure visible and less likely; if kills
# start recurring on a rhythm, `Diagnose Render memory` counts the intervals.
ENV NODE_OPTIONS=--max-old-space-size=384
ENV PORT=3000 HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
