# Container image for `towing-web` — WHERE A RECOVERY OPERATOR RUNS ITS DAY.
#
# Added 2026-08-09, at the owner's request ("yes deploy"), because the app had
# ten finished screens, a database schema, fourteen gated API routes — and no
# deploy path whatsoever. There was no workflow and no Render service, so the
# API answered 401 on /api/v1/towing/* while the screens in front of it were
# reachable by nobody at all. Built, gated, committed, and invisible.
#
# 🔴 THIS IS THE PLATFORM'S SIXTH RENDER SERVICE and they share ONE free
# instance-hour allowance, which was exhausted once already (2026-07-28) and
# suspended the whole platform. The fifth (supplier-web) was added the same day
# as this one. The owner authorised both explicitly. If services start
# suspending, these two are the newest consumers and the first place to look.
#
# WHY EVERY WEB APP HERE IS CONTAINERISED RATHER THAN BUILT BY RENDER
#
# Render's own builder fails `next build` for this repo with exit 1 and
# COMPLETELY EMPTY stderr. Six fixes were attempted against that log across two
# sessions and two of them were fixes for wrong diagnoses. The identical command
# succeeds on Linux in GitHub Actions in about 25 seconds, and it still succeeds
# when Render's 448 MB V8 heap limit is reproduced deliberately -- so the heap,
# the obvious suspect, is NOT the cause either. It was tested, not assumed.
#
# Rather than keep guessing at someone else's build host, the build moves to a
# machine whose output can be read. Render then runs a prebuilt image and never
# compiles anything.
#
# Both stages are pinned to the Node version in package.json engines
# (>=20.19.0 <21) and to the pnpm version in `packageManager`, so the lockfile is
# read by the pnpm that wrote it.

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
COPY apps/towing-web/package.json apps/towing-web/
COPY packages/ packages/

# `--filter @autoworkshop/towing-web...` (trailing dots) installs this app plus
# the workspace packages it depends on and nothing else -- not Playwright, not
# Storybook, not the NestJS toolchain, none of which this image ever runs.
RUN pnpm install --frozen-lockfile --filter "@autoworkshop/towing-web..."

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
RUN pnpm --filter @autoworkshop/towing-web build

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
# standalone/{apps/towing-web/server.js,node_modules,package.json}.
COPY --from=builder --chown=node:node /repo/apps/towing-web/.next/standalone ./
# Static assets are deliberately excluded from standalone and must be placed
# where the server expects them, or every page loads with no CSS or JS.
COPY --from=builder --chown=node:node /repo/apps/towing-web/.next/static ./apps/towing-web/.next/static

# Render assigns the port and routes to it. A server listening on a hardcoded
# port fails every health check while its own logs look completely healthy.
#
# ⚠️ PORT=3000, NOT 3005. `package.json` runs `next dev -p 3005` so seven apps
# can run side by side on one workstation, and the Keycloak client's localhost
# redirect URI is registered on 3005 for exactly that reason. Neither fact
# belongs in the container: here the app is alone, Render routes to whatever
# PORT says, and the deployed redirect URI is the .onrender.com origin.
#
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
ENV NODE_OPTIONS=--max-old-space-size=384
ENV PORT=3000 HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["node", "apps/towing-web/server.js"]
