# Container image for the NestJS API.
#
# SAME REASONING AS `apps/workshop-web/Dockerfile` (ADR-017): CI builds the
# image and Render pulls a prebuilt one, so Render's builder is never in the
# critical path. That decision was made because Render's builder failed
# `next build` with EMPTY stderr and six attempts could not read the cause.
#
# 🔴 WHY `pnpm deploy` AND NOT `COPY node_modules`. pnpm's `node_modules` is a
# tree of SYMLINKS into `.pnpm`, and the workspace packages this API imports
# (`@autoworkshop/*`) are symlinks to sibling directories. Copying that tree
# into a runtime stage produces dangling links and a container that dies at
# `require()` — the failure appears at RUN time, not build time, so the image
# looks fine until Render health-checks it. `pnpm deploy` resolves every link
# into a real directory and is the only supported way to get a runnable
# workspace app out of a pnpm monorepo.
#
# Pinned to the Node in package.json engines and the pnpm in `packageManager`,
# so the lockfile is read by the pnpm that wrote it.

# ─── build ────────────────────────────────────────────────────────────────────
FROM node:20.19.2-bookworm-slim AS builder

WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Manifests and the lockfile first, so the dependency layer survives a source
# change. `pnpm-workspace.yaml` is required for `--filter` to resolve
# `workspace:*` at all.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/ packages/

# Trailing dots: this app PLUS the workspace packages it depends on, and
# nothing else — no Next, no Playwright, no Storybook, none of which this image
# ever runs.
RUN pnpm install --frozen-lockfile --filter "@autoworkshop/api..."

COPY . .
RUN pnpm --filter @autoworkshop/api build

# A self-contained tree at /out: real directories, no symlinks, production
# dependencies only. `--legacy` because the workspace is not using pnpm's
# `inject-workspace-packages` layout.
RUN pnpm deploy --filter "@autoworkshop/api" --prod --legacy /out

# The build must actually have produced an entrypoint. Without this the image
# builds cleanly and fails at container start, which on Render surfaces as an
# unexplained failed health check rather than a build error.
RUN test -f /out/dist/main.js || (echo "dist/main.js missing after build" && exit 1)

# ─── runtime ──────────────────────────────────────────────────────────────────
FROM node:20.19.2-bookworm-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

# Do not run as root. `node` is uid 1000 in this image and already exists.
USER node
COPY --from=builder --chown=node:node /out ./

# Render assigns the port and routes to it; `main.ts` already reads PORT and
# falls back to 4000. A server on a hardcoded port fails every health check
# while its own logs look perfectly healthy.
ENV PORT=10000
EXPOSE 10000

# ⚠️ NO `pnpm start` HERE. pnpm is not installed in this stage, and an npm-style
# wrapper would also swallow SIGTERM, so Render's redeploy would kill the
# container rather than let Nest shut down cleanly.
CMD ["node", "dist/main.js"]
