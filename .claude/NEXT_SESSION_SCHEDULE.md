# Next session — ranked work schedule

**Written 2026-07-27 at session close. Git tip `0b678b5` on `master`, pushed, tree clean.**

Read `.claude/CURRENT_TASK.md` first, then this. Items are ordered so that each one
unblocks the next; do not reorder without a reason.

---

## The two open problems, stated plainly

| # | Problem | State |
|---|---|---|
| **A** | T-0005 is committed but **unreviewed** — Codex and Supervisor never ran | code complete, gates unmet |
| **B** | `autoworkshop.aiappinvent.com` is **not live** — `next build` fails silently on Render | DNS + service correct, build blocked |

They are independent. B is the owner's stated priority; A is the quality debt that must
not be built on.

---

## 1. ⚡ FIRST — find the real cause of the Render build failure (item B)

**Do not guess again.** Six attempts were made from the remote log and two of them were
fixes for wrong diagnoses. The next step is chosen specifically because it produces
evidence rather than another hypothesis.

**Run the identical build in GitHub Actions on `ubuntu-latest`.** Free for public repos,
Linux like Render, and Actions does not swallow stderr the way this build does.

```yaml
# .github/workflows/diagnose-next-build.yml — workflow_dispatch
- run: corepack enable && corepack prepare pnpm@9.15.4 --activate
- run: pnpm install --frozen-lockfile --filter '@autoworkshop/workshop-web...'
- run: cd apps/workshop-web && ./node_modules/.bin/next build
  env:
    SKIP_BUILD_CHECKS: '1'
```

Two outcomes, both useful:

- **It fails with a visible error** → that is the bug. Fix it, redeploy.
- **It succeeds** → the fault is specific to Render's builder. Switch strategy: build the
  image in Actions and have Render deploy a prebuilt container from GHCR. Both are free
  for a public repo, and it removes Render's builder from the critical path permanently.

### What is already known — do not re-derive any of it

| Ruled out | Evidence |
|---|---|
| Memory / OOM | builder reports **48 CPUs, 95 GB RAM, 8 GB cgroup**; exit code **1**, not 137 |
| Worker pool | `experimental.cpus: 1` + `workerThreads: false` changed nothing |
| Lint / type-check | skipping both moved the failure, did not fix it |
| `sharp` | `require('sharp')` tested directly on the builder |
| The code itself | fresh clone of `master` built cleanly with Render's exact commands |
| Stage label | `.next/diagnostics/build-diagnostics.json` says `"buildStage":"type-checking"`, but that label is set at stage ENTRY — the death is entering *Collecting page data* |

**Live service facts:**
- service id `srv-d9jsliu7r5hc73b1kncg`, name `autoworkshop`, owner `tea-d86fu8mk1jcs7397i70g`
- `RENDER_API_KEY` is a secret on **this** repo (deliberately not shared with Solar — ADR-011)
- `.github/workflows/provision-render-service.yml` recreates the service idempotently
- The build command on the service was left as a **diagnostic** during the session and has
  been **restored** to the real one. Verify before assuming.

### Clean-up owed once the cause is known

`experimental: { cpus: 1, workerThreads: false }` is still in **all seven**
`next.config.mjs`. It was added for a diagnosis that proved wrong. **Remove it.**
`SKIP_BUILD_CHECKS` may be legitimate to keep — the checks genuinely run in CI — but that
should be a decision, not a leftover.

---

## 2. Run the gates on T-0005 (item A) — before anything builds on it

`0b678b5` is committed with `GATES PENDING` stated in its own message. Close that.

1. **Codex** — `./scripts/quality-gate.sh`. Exclude `docs/*.md` and old logs by name;
   Codex drifts onto stale artifacts and will review last week's document instead of the
   diff. Demand per-claim evidence.
2. **Supervisor** — `/code-review`, `/security-review`. Run it **independently** of
   Codex's verdict; on 2026-07-25 Codex approved something the Supervisor caught.
3. **`/verify`** — non-skippable, and for this change it is the gate that matters most.
   Both defects this session survived typecheck, lint, 122 unit tests and a 10-target
   build, and were found by starting the app and calling `/api/auth/session`.

**Security questions worth asking explicitly**, because they are the ones a diff review
tends to skim:
- Does anything reach the browser at `/api/auth/session`? It must contain **no tokens**.
  Verified once by hand; make it an assertion.
- Is `trustHost: true` safe here? The argument is that Keycloak's `redirectUris`
  allow-list is the real control. **Check that allow-list is still tight** — widening it
  to a wildcard host removes the only thing making the setting safe.
- `getAccessToken()` fails closed on an expired token. Confirm no caller treats `null` as
  "allow".

---

## 3. Re-run Playwright — it has NOT run since T-0005

The last full run was 137 passed / 0 failed, **before** the viewer became async and
session-backed. `shell-journey.spec.ts` was rewritten to use `SUITE_VIEWER` (null) with
`grantsFor`/`navRoleFor`; `playwright.config.ts` now sets `AUTH_SECRET` on every web
server, without which every route 500s.

**Kill every stale `next start` first.** The build-freshness gate caught seven stale
servers during this session and was right to. A long-lived server is a lie generator —
that is what T-0030 turned out to be.

---

## 4. Then, in order

| # | Item | Why now |
|---|---|---|
| 4a | **T-0016 — workspace / org / branch switchers** | Both blockers are gone: T-0003 landed the data, T-0005 landed the session. `/me` already returns `memberships` with the names the switchers need. |
| 4b | **Signed-in browser journey** | The suite only exercises the signed-out shell. The §46–§49 role trees have unit coverage against fixtures but no browser coverage. Needs Keycloak + API + the dev seed running. |
| 4c | **Redirect-to-sign-in** | Deliberately deferred. The admin app renders a blank sidebar when signed out — correct, but it looks broken. Decide per app; it couples the e2e suite to live identity. |
| 4d | **T-0023** — deliver the backup health alert to a human | Detection done since T-0019; nothing routes it to a person on Windows. |
| 4e | **T-0017** — quick-create, tasks, messages, notifications, help panels | Last Release 0.2 item. |

---

## Startup commands

```bash
# 1. state
cd /c/Users/USER/Documents/autoworkshop-ai && git log --oneline -3 && git status --short

# 2. infra — check HEALTH, not "Up"
docker ps --format "table {{.Names}}\t{{.Status}}"   # aw-keycloak must say (healthy)
curl -sS -m 60 http://localhost:8080/realms/autoworkshop/.well-known/openid-configuration | head -c 120

# 3. if Keycloak is unhealthy: it hangs rather than exits, so restart is the repair
docker restart aw-keycloak     # ~50s normally, up to ~7min if it re-augments

# 4. the dev identity (idempotent — safe to re-run)
bash scripts/seed-dev-identity.sh    # technician@autoworkshop.local

# 5. is the deploy still failing?
curl -sS -o /dev/null -w "%{http_code}\n" https://autoworkshop.onrender.com
#   404 + x-render-routing: no-server  → no successful deploy yet
```

## Owner context carried forward

- **Zero cost is a hard rule**, including production. Never propose spending.
- **Relationships in databases and schemas** (2026-07-27, binding): real foreign keys and
  joins, normalised. But a foreign key cannot carry a tenant predicate — relationships
  give integrity, RLS gives isolation, and both are required.
- **`RENDER_API_KEY` was pasted into a chat transcript on 2026-07-27.** The owner said
  "soon we rotate". **Treat it as compromised until rotated**, then update the GitHub
  secret on this repo.
- The owner viewed the app and said "not functional, all features not built yet" —
  correct and expected. Release 0.2 is the shell; module screens are Phases 4–7 and render
  an honest "not built yet" page by design (`05.txt` §2 prohibits mock pages). Set that
  expectation explicitly before showing it again.
