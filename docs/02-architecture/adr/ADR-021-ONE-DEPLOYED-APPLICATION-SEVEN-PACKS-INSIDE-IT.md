# ADR-021 — One deployed application, the seven packs inside it

**Date:** 2026-08-13
**Status:** Accepted
**Supersedes (deployment only):** ADR-002, and adjudication row 2 of `COMBINED_PLAN_v2` §12
**Related:** ADR-011 (Solar non-entanglement), ADR-012/016 (zero cost), ADR-017 (prebuilt images)

## Context

`01 (1).txt` §86 lists seven web applications, and `COMBINED_PLAN_v2` §12 row 2
settled the question **7 apps or 1** in favour of seven — Codex having conceded
*"a shared shell should live in packages, not collapse the specified apps"*.
That decision was about **codebase structure**, and it was right. What followed
was not: each app also became its own **Render service**, and nothing in the
plan required that.

By 2026-08-13 the account carried **ten AutoWorkshop services**:

| Service | Plan reported | State |
|---|---|---|
| `autoworkshop-web` (workshop pack) | free | **suspended — `billing`** |
| `autoworkshop` (retired node service) | free | **suspended — `billing`** |
| `autoworkshop-api` | standard | running |
| `autoworkshop-keycloak` | standard | running |
| `autoworkshop-customer` · `-supplier` · `-towing` · `-admin` · `-fleet` · `-insurance` | standard | running |

Three measurements, not inferences, define the problem:

1. **The free allowance fits about ONE always-on service.** Render's free tier
   is ~750 instance-hours a month against a month of ~730 hours. Two free
   services running continuously exhaust it before the month ends, which is
   exactly what happened on 2026-07-28 and again on 2026-08-11.
2. **Eight services report `plan: standard`, though every provisioning workflow
   in this repository requests `"plan": "free"`.** `autoworkshop-fleet`,
   `-insurance` and `-towing` — services with almost no traffic — answered from
   cold in **0.7–1.5 s**, and `keep-warm.yml` pings Keycloak only. A free Render
   service spins down after ~15 minutes idle and has been measured here at
   126–137 s to wake. These do not spin down. Whatever the dashboard says, they
   are not behaving as free services.
3. **The reference implementation does not do this.** Solar — named in ADR-011
   as the pattern to copy — runs `solarpro-global` (one `gunicorn wsgi:app`
   process serving both its pages and its `/api/*` routes), `solarpro-keycloak`,
   and one database. Three things, for a product of comparable surface.

Owner direction, 2026-08-13: *"it must be for one app so only must be there all
rest must be in the app"*, *"only autoworkshop app and its databases must be
there"*, *"remove all rest"*, *"update app architecture to replicate this"*.

## Decision

**Seven packs, one deployed application, one `main` that calls them.**

Owner's framing, 2026-08-13: *"the packages for insurer, suppliers, customer
must be web app on their [own] but on the autoworkshop artifact that's called by
main"*. Three requirements, and they are separable:

1. **Each pack stays its own web application.** Its own directory, its own route
   tree, its own `_screens`, its own layout and metadata, its own navigation
   workspace. Nothing is flattened into a shared soup. This does not re-open the
   plan's structural decision, and `packages/navigation`, `packages/ui` and
   `packages/next-shell` keep doing exactly what they do.
2. **One artifact.** All seven are built into a single deployable image and
   served by **one Next.js process in one Render service** instead of seven.
3. **`main` calls them.** `apps/web/app/layout.tsx` and `app/page.tsx` are the
   entry point: the root resolves who the visitor is and dispatches into the
   right pack, and each pack is mounted beneath it at its own prefix. A pack is
   never the entry point; `main` is, and it routes.

This is the same relationship the API already has between its root module and
its thirteen domain modules, and the same one §0.2 requires of an orchestrator
and its conductors — one entry, many self-contained units beneath it.

Target shape, mirroring Solar:

| Render service | Contents |
|---|---|
| `autoworkshop` | Next.js serving all seven packs |
| `autoworkshop-keycloak` | Keycloak — as `solarpro-keycloak` is for Solar |
| `autoworkshop-postgres` | the database |

The NestJS API stays a separate service **for now** and is the next candidate to
fold in; Solar's equivalent is not separate because Flask serves its own API
from the same process, and matching that is a second step with its own risks.

Packs are addressed by **path prefix** — `/workshop/...`, `/customer/...`,
`/supplier/...`, `/fleet/...`, `/insurance/...`, `/towing/...`, `/admin/...` —
with the public marketplace and VIN search staying at the root, because they are
the product's front door for people who have no account.

## Alternatives considered

**Seven Next servers in one container behind a reverse proxy, using Next's
`basePath`.** Far cheaper — `basePath` rewrites every `next/link` and asset URL
for free, and no route file moves at all. **Rejected on memory.** A Next server
is roughly 80–150 MB resident; seven of them plus Nest does not fit a 512 MB
free instance, and an OOM at cold start is the worst possible failure mode
because it looks exactly like a suspension. One process is the only shape that
fits the tier this product is required to run on.

**Host-based routing (`customer.autoworkshop.aiappinvent.com` …) with one
service.** Preserves every existing URL byte-for-byte, which is genuinely
attractive: 341 pages and 405 navigation entries would not change at all. Also
lets one cookie on `.autoworkshop.aiappinvent.com` serve every pack, which would
retire the *separate hosts = separate sessions* problem. **Not chosen**, because
the owner asked for one app at one address and no per-pack subdomain exists
today — all six non-apex packs are reachable only at `*.onrender.com`. Keeping
it recorded: if per-pack hostnames are ever wanted, the middleware written for
this ADR maps host → prefix in one function, so it is an additive change.

**Leave ten services and cut usage instead.** This was effectively the standing
position, and it failed twice. The exhaustion is arithmetic, not behaviour: ten
services against a one-service allowance cannot be fixed by dispatching fewer
live-suite runs, though dispatching three in one session certainly hastened it.

## Consequences

**Cost.** Nine free-tier services stop consuming a shared allowance sized for
one. If the `standard` plans are real, this is also the end of an unapproved
recurring spend — the owner's decision to confirm, not this ADR's to make.

**URLs change for six of the seven packs.** The workshop pack keeps its paths at
the apex; the rest gain a prefix. Mitigated by `packages/navigation` generating
every one of its 405 entries from a single expression in `workspaces.ts:26`, so
the navigation model is a threaded parameter rather than 405 edits. The
hardcoded absolute paths outside it were counted before committing to this:
**33 across 25 files.**

**One process is one blast radius.** A crash in the admin pack now takes the
customer marketplace with it, where before it did not. This is accepted
deliberately and it is the same trade Solar makes; the mitigation is that all
seven packs already share `packages/next-shell`, so they largely fail together
anyway.

**Sign-in becomes simpler, not harder.** One origin means one session cookie,
which removes the per-workspace cookie scoping added on 2026-08-04 and the
Keycloak redirect-URI matrix that goes with it.

**A deploy is now all-or-nothing.** Seven `deploy-*-web.yml` workflows collapse
to one. Shipping a supplier change redeploys the customer marketplace. Given
that a single `Release` already rebuilds every shared package, this is a smaller
change in practice than it reads.

## The thing this ADR does not fix

`autoworkshop-postgres` is **`plan: free` with `expiresAt: 2026-09-01`**.
`COMBINED_PLAN_v2` §6 and adjudication row 6 ruled out Render free Postgres by
name, because it expires at thirty days — the exact failure that took Solar down
on 2026-07-09. The handover records this database as "a separate paid service
and was unaffected"; that is wrong. Consolidating the web tier does nothing
about it, and every migration and every seeded row goes with it on 1 September.
That needs its own decision and its own ADR.
