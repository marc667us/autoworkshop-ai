# Container image for `insurance-web`.
#
# Added 2026-08-09 at the owner's instruction ("deploy all"). Until now this app
# had never been containerised or deployed: it existed only in the repository,
# exactly as towing-web did that morning — built, gated, and reachable by nobody.
#
# 🔴 THIS SHARES ONE FREE INSTANCE-HOUR ALLOWANCE WITH EVERY OTHER SERVICE, and
# that pool was exhausted once (2026-07-28) and suspended the whole platform.
# Six services existed before this batch. The owner authorised the batch
# explicitly after being told. If services start suspending, this is among the
# newest consumers and one of the first places to look.
#
# ⚠️ WHAT THIS APP ACTUALLY SERVES TODAY: NO built screens at all. Every route resolves to the honest
# "not built yet" placeholder with working sibling navigation. Deploying this
# makes the SHELL reachable, not features — that is the whole of the claim.
#
# WHY THIS IS CONTAINERISED RATHER THAN BUILT BY RENDER
#
# Render's own builder fails `next build` for this repo with exit 1 and
# COMPLETELY EMPTY stderr. The identical command succeeds on Linux in GitHub
# Actions in about 25 seconds, and still succeeds when Render's 448 MB V8 heap
# limit is reproduced deliberately — so the heap, the obvious suspect, is not the
# cause either. The build moves to a machine whose output can be read; Render
# runs a prebuilt image and never compiles anything.

# ─── build ────────────────────────────────────────────────────────────────────
FROM node:20.19.2-bookworm-slim AS builder

# libvips is what `sharp` links against; without it sharp builds from source.
RUN apt-get update && apt-get install -y --no-install-recommends       libvips-dev python3 make g++ ca-certificates     && rm -rf /var/lib/apt/lists/*

WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Manifests and the lockfile first, so the dependency layer is reused whenever
# only source changed.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/insurance-web/package.json apps/insurance-web/
COPY packages/ packages/

RUN pnpm install --frozen-lockfile --filter "@autoworkshop/insurance-web..."

COPY . .

# AUTH_SECRET is REQUIRED AT BUILD TIME, not merely at runtime: every app runs
# `auth` as middleware and Auth.js resolves its config while the route is built,
# so an absent value fails the build. Compile-time only; Render injects the real
# one and it is never present in the runtime stage.
ENV SKIP_BUILD_CHECKS=1     NODE_ENV=production     NEXT_TELEMETRY_DISABLED=1     AUTH_SECRET=build-time-placeholder-replaced-at-runtime     AUTH_TRUST_HOST=true
RUN pnpm --filter @autoworkshop/insurance-web build

# ─── runtime ──────────────────────────────────────────────────────────────────
FROM node:20.19.2-bookworm-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends       libvips42 ca-certificates     && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production     NEXT_TELEMETRY_DISABLED=1

# Do not run as root. `node` is uid 1000 in this image and already exists.
USER node

# `output: 'standalone'` traced from the WORKSPACE root, so the tree is
# standalone/{apps/insurance-web/server.js,node_modules,package.json}.
COPY --from=builder --chown=node:node /repo/apps/insurance-web/.next/standalone ./
# Static assets are deliberately excluded from standalone and must be placed
# where the server expects them, or every page loads with no CSS or JS.
COPY --from=builder --chown=node:node /repo/apps/insurance-web/.next/static ./apps/insurance-web/.next/static

# ⚠️ PORT=3000, NOT 3004. `package.json` runs `next dev -p 3004` so seven apps
# can run side by side on one workstation, and the Keycloak client's localhost
# redirect URI is registered on 3004 for that reason. Neither fact belongs in the
# container: here the app is alone and Render routes to whatever PORT says.
#
# 🔴 CAP THE HEAP. `autoworkshop-customer` was oomKilled at 512Mi on 2026-08-07.
# Uncapped, V8 grows toward whatever it believes is available and the KERNEL ends
# the process — the container just disappears with `reason: {oomKilled}` and the
# app logs nothing. Capped, V8 collects harder and, if it truly cannot free
# enough, throws a JS heap OOM WITH A STACK TRACE. 384, not 512: the cap governs
# the JS heap only; Node's baseline and native allocation live outside it.
ENV NODE_OPTIONS=--max-old-space-size=384
ENV PORT=3000 HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["node", "apps/insurance-web/server.js"]
