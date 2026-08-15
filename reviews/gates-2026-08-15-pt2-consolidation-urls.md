# Gate record — 2026-08-15 pt2: pre-consolidation URLs and the invisible funnel

**Subject:** the working-tree diff fixing (a) ADR-021 stale URLs across four
workflows and (b) an acquisition funnel that rendered for nobody.

**Origin:** the owner asked *"make sure the local deployment align with that of
the web app."* Both defects were found by taking that question literally and
comparing what the repository builds against what production actually serves.

---

## What the alignment check answered

**Migration ledger — production, local and repo AGREE.** The push of `56a7dca`
triggered `apply-migrations` as a `workflow_run` dry run (run `31887694256`):

```
==> dry run: 0 pending, 82 already applied. Nothing was written.
    MIGRATIONS   IN REPO 82   APPLIED 82   PENDING 0
```

⚠️ Ledger agreement is **not** schema agreement — A4's `register_workshop`
drift has an identical checksum, so this cannot detect it.

**Live suite after the deploy, BOTH jobs read:** `PASSED 66 FAILED 0 SKIPPED 1`
(anonymous) + `PASSED 4 FAILED 0 SKIPPED 0` (signed-in) = **70 / 0 / 1**.

---

## Gate 1 — Codex

`codex.cmd exec --skip-git-repo-check -s read-only` with the prompt on STDIN
from a file, **output redirected to a file, not piped to `tail`** — the previous
round lost the head of the review to exactly that mistake.

### Findings ACCEPTED and fixed

| Severity | Finding | Action |
|---|---|---|
| **HIGH** | `/` alone WEAKENS the gate — `middleware.ts` exempts `/` from auth and it is the public landing, so a deploy where every `/workshop/*` 404s would pass | Now `/` **plus all seven pack roots**, reusing `deploy-web.yml`'s accepted set `200/307/308/401/403` |
| **HIGH** | `render-resume-production.yml:61,110` still probes apex `/home/dashboard`; only `= "200"` succeeds | Fixed to `/` |
| **HIGH** | `provision-web-service.yml:156` + `provision-render-service.yml:120` set `healthCheckPath: /home/dashboard`, contradicting `render.yaml:64` | Both `/`; the second also marked ADR-021-obsolete |
| **LOW** | The recorded `000000` defect is LIVE at `_deploy-render.yml:114,122` | Replaced with `code="$(curl …)" \|\| code=""` |
| **MEDIUM** | *Refutes my claim* that `point-web-at-keycloak.yml` "could never set `SUPPLIER_WEB_URL` again" — it accepts 3xx (`:246`), so the apex redirect satisfies it | Comment corrected in `page.tsx` and the task list |
| **LOW** | *Refutes my count* — "six consecutive failures" while listing seven hashes | Corrected to seven, with the evidence source named |
| **MEDIUM** | `middleware.ts:86` comment calls `/onboarding` "for signed-in people"; the page renders a signed-out state | Recorded as open, not silently edited |
| **MEDIUM** | `scripts/live-soak.sh` and `record-live-state.sh` still default to deleted per-pack hosts | Recorded as open |
| **LOW** | Two audience-labelled buttons with one destination is mildly misleading | Kept deliberately, with the reasoning written down |

### Finding REJECTED after verification

🔴 **Codex listed `live-suite.yml` as retaining separate-pack topology. It does
not.** `live-suite.yml:125-126` defaults `FLEET` to
`https://autoworkshop.aiappinvent.com/fleet`, so `${FLEET}/home/dashboard`
resolves to `/fleet/home/dashboard`. **The base URL carries the prefix and the
suite is correct** — which is also why it is green at 70/0/1.

I nearly recorded a working gate as broken on a reviewer's say-so. The standing
rule is that reviewers are not oracles and two of their findings were wrong on
08-11; this is the instance that rule exists for.

### Confirmed correct by Codex
No other `MarketplaceLanding` caller passes either prop · `/onboarding` is
anonymously renderable · the prop additions are type-correct · **no data-loss
path, no paid dependency, no spend implication.**

---

## Gate 2 — Supervisor

### 2a. Found independently, BEFORE Codex reported
- The whole ADR-021 URL sweep (`grep` across `.github/workflows` and `scripts`
  for per-pack hostnames and unprefixed paths) — which produced the
  `provision-*` and `render-resume` findings Codex then confirmed.
- That `record-live-state.sh` has the **same `|| echo 0` defect** in `grep -c`
  form, emitting `[: integer expression expected` on every run.
- That `/onboarding` is anonymously reachable **and serves every door** —
  checked against production *before* pointing two public buttons at it, since
  a sign-in wall would have made the fix worse than the defect.

### 2b. `/verify` — the part that actually mattered
A green build has never proved a button renders in this repository. So:

1. `rm -rf .next` (a stale artifact has faked a defect here three times)
2. clean `next build` — **exit 0, 341 pages**
3. served on :3100 and fetched `/`
4. grepped the served HTML:

```
"Run a workshop, or sell parts"   -> 1
"Set up your workshop"            -> 1
"Register as parts supplier"      -> 1
href="/onboarding"                -> 2
```

**Production serves zero of those.** That is the proof the fix works, and it is
the only step in this gate that could have produced it.

### 2c. Static gates
- 5 workflow files parsed as YAML — all OK, jobs enumerated
- `tsc --noEmit` on `apps/web` — **exit 0**
- `marketplace-ui` — **16 passed / 0 failed / 0 skipped**
- `account-types.spec.ts` — **23 passed / 0 failed / 0 skipped**
- No executable `/home/dashboard` probe remains outside `live-suite.yml` (correct)
  and `point-web-at-keycloak.yml` (lenient, accepts 3xx, cannot false-red)

---

## The lesson worth carrying

**I fixed a false red by creating a false green, and only the review caught it.**
Replacing the probe with `/` made Release pass — while removing the only
assertion that any pack still mounts. A gate that cannot fail is worse than a
gate that fails wrongly, because nobody investigates it.

And the deeper one: **ADR-021 updated the code and left the operational
scaffolding pointing at the old world.** Seven red Releases, a resume workflow
that would declare a recovered site dead, and two provisioning workflows that
would create a service Render could never mark healthy. None of it was visible
from the application, and all of it was one `grep` away.
