# ▶▶ NEXT SESSION BEGINS HERE ◀◀
# Task list — written at the close of 2026-08-19 (pt5)

**Tip `0be23f1`, tree clean, four commits, PUSHED.
CI + Security CI GREEN. Production migrations 85/85.
Live suite **73 passed / 0 failed / 6 SKIPPED** (run 32299154508).**

```bash
bash scripts/start-session.sh          # ALWAYS first
```

**Read in this order:** this file → `.claude/SESSION_HANDOVER.md` (top entry) →
`.claude/TASK_LIST_2026-08-19.md` (still the authority on the carried issues
I14–I19) → `.claude/TASK_LIST_2026-08-17.md` (N4–N8).

---

## 0. STATE AS MEASURED AT CLOSE — not quoted

| Fact | Value | Measured how |
|---|---|---|
| Tip | `0be23f1` | `git log --oneline -1` |
| Pushed? | **YES** — 0 ahead / 0 behind | `git status -sb` |
| Migrations on PRODUCTION | **85 / 85** | unchanged this session — no migration added |
| **Live suite** | 🔴 **73 passed · 0 failed · 6 SKIPPED** | run **32299154508** (`live` 69/0/1 + `signed-in` 4/0/5) |
| CI · Security CI | ✅ GREEN on `d73d38c` | `gh run list` |
| Grant workflow | ✅ **run 32299005872 — 3 granted, gate passed, 4 orgs** | its own job log |
| Diagnostic | ✅ run **32293446882** — read-only, answered A3's question | its own job log |
| typecheck (e2e) · eslint | **0** · **0** | `npx tsc --noEmit -p apps/e2e/tsconfig.json`, `npx eslint` |
| SQL rehearsal | **4 of 4 scenarios** behaved correctly | local `aw-postgres`, fixture removed |

⚠️ **THE SKIP COUNT WENT UP (5 → 6) AND THAT IS THE CORRECT RESULT.** A fifth
A3 check (towing) was added, and all five skip. A skip is not a pass.

---

## 1. 🔴 WHY A3 DID NOT CLOSE — read before planning anything

The pt4 pointer prescribed: *grant the CI identity `[AUDIT]` memberships,
re-run the suite, target 73/0/1.* That was done. It did not work, for a reason
that only became visible after the write.

**THREE CONTROLS, THREE DIFFERENT SCOPES:**

| Control | Scoped to | Source |
|---|---|---|
| `RoleSwitcher` | the active **ORGANISATION** | `viewer-contract.ts:470` |
| `OrganizationSwitcher` (via `/me`) | the active **TENANT** | **`apps/api/src/identity/me.service.ts:81`** |

`me.service.ts` says so deliberately:

> *"a user's memberships in other tenants are deliberately not listed here,
> because switching tenant is a re-authentication concern, not a dropdown."*

The `[AUDIT]` orgs are in the OPERATOR's tenant `7adce423-…`. The live-suite
account is in its own. **No switcher in the product will ever offer them to
that account.** The organisation switcher never rendered → all five A3 checks
skipped, loudly and correctly.

### ⚠️ AND THE GRANTS ARE NOT INERT

`TenantGuard` → `identity.memberships_for_subject` is **not** tenant-filtered,
and neither is its policy `membership_lookup_select`. So a client sending
`x-organization-id` for an `[AUDIT]` org **resolves that tenant and acts
there**. Only the `/me` *listing* is scoped.

`insurance_owner` and `towing_owner` each carry `organizationAdmin` +
`financeRead` (`permission-matrix.ts:121,125`). **A CI secret account now holds
member-appointment and invoice authority inside organisations the operator
uses.** The Supervisor raised this before the run; it was deferred, not
resolved.

---

## ▶ THE NEXT SESSION, IN ORDER

| # | Do this | Why first |
|---|---|---|
| **B1** | **ASK THE OWNER ONE QUESTION, then build the fixture.** | Both routes close A3 *and* the blast-radius finding. They converge. |
| **B2** | **Revoke the three cross-tenant grants** once B1's replacement exists. | Live authority in the operator's tenant, serving nothing the product can surface. |
| **B3** | **Re-run `live-suite.yml`.** Target **78/0/1**. | 69 anonymous + 4 owner + 5 A3 = 78 passed, 1 anonymous skip, 79 checks. |

### B1 — the two routes

**▶ Route (b), RECOMMENDED — one identity per role.**
`live-fleet@` and `live-supplier@` already exist, each in its OWN tenant, and
`provision-live-suite-account.yml` already carries a `kind` input
(`workshop|supplier|fleet`) that creates tenant + org + branch + membership.

1. Add `insurance` and `towing` to the `kind` choice list and to the
   secret-selection `case` (it already reads `LIVE_SUPPLIER_*` / `LIVE_FLEET_*`
   the same way — see `:163-174`).
2. Set `LIVE_INSURANCE_EMAIL/PASSWORD` and `LIVE_TOWING_EMAIL/PASSWORD`.
   ⚠️ **Realm policy: length ≥ 12, upper + lower + digit + SPECIAL, must not
   contain the username/email, no reuse of the last 3.**
3. Change the A3 checks to sign in as the right identity per screen and drop
   `actInOrganization` entirely — no organisation switching, no tenant problem.

**Route (a) — dedicated `[LIVE SUITE]` partner orgs in the live-suite account's
own tenant.** Same-tenant, so the switcher works and the harness stays as
written. Needs three orgs + three memberships in the existing live-suite
tenant.

**⚠️ The owner question is only this:** route (b) needs two new secret pairs.
Set them, or approve generating them?

---

## 2. RECORDED SCRIPTS — every command that ran against production

All read the same `RENDER_API_KEY`, all share the `production-db-firewall`
concurrency group, all restore the firewall in an `if: always()` step.

```bash
GH=~/bin/gh.exe                      # gh is NOT on PATH

# 1. READ-ONLY. Answered A3's blocking question.  → run 32293446882
"$GH" workflow run diagnose-live-identity-roles.yml

# 2. THE PRODUCTION WRITE. 3 memberships.        → run 32299005872
"$GH" workflow run grant-live-suite-partner-memberships.yml -f confirm=APPLY

# 3. THE LIVE SUITE.                              → run 32299154508
"$GH" workflow run live-suite.yml

# ▶ ALWAYS confirm a dispatch actually STARTED — the concurrency waiting room
#   holds ONE and silently evicts. A 'cancelled' run you did not cancel is an
#   evicted request; re-dispatch it.
"$GH" run list --workflow=<wf>.yml -L 3 --json databaseId,status,conclusion

# ▶ Read a job log. `gh run view --log` returns 0 bytes and exit 0 — do not use it.
JOB=$("$GH" api repos/marc667us/autoworkshop-ai/actions/runs/<RUN>/jobs --jq '.jobs[0].id')
"$GH" api repos/marc667us/autoworkshop-ai/actions/jobs/$JOB/logs > /tmp/log.txt
```

### The SQL rehearsal — how the seed script was proven before production

Local `aw-postgres` (container is up; `-U autoworkshop -d autoworkshop`). The
fixture recreates the three `[AUDIT]` orgs **by their measured production ids**
so the script meets the exact shape it will meet on Render.

```bash
# fixture up: tenant 7adce423… + the 3 [AUDIT] orgs + a throwaway user
docker exec -i aw-postgres psql -v ON_ERROR_STOP=1 -U autoworkshop -d autoworkshop -f - < fixture_up.sql

# the script under test
docker exec -i aw-postgres psql -v ON_ERROR_STOP=1 -U autoworkshop -d autoworkshop \
  -v live_email="rehearsal-live-owner@example.invalid" \
  -f - < infrastructure/seed/grant_live_suite_partner_memberships.sql
```

**Four scenarios, all verified, fixture then deleted:**

| Scenario | Expected | Got |
|---|---|---|
| First run | 3 granted, gate passes | ✅ |
| Re-run | **0 granted**, gate passes (idempotent) | ✅ |
| A membership set to `revoked` | **1 REACTIVATED** (proves `DO UPDATE` over `DO NOTHING`) | ✅ |
| Target org suspended + role held in ANOTHER org | **gate REFUSES, names the org id, rolls back** | ✅ exit 3 |

### Local gates

```bash
export PATH="/c/Users/USER/nodejs:$PATH"
npx tsc --noEmit -p apps/e2e/tsconfig.json > /tmp/tsc.txt 2>&1; echo $?   # NOT piped — a pipe masks the exit code
npx eslint apps/e2e/tests/live-signed-in.spec.ts
cd apps/e2e && ./node_modules/.bin/playwright test --list --config playwright.live.config.ts
#   ⚠️ `npx playwright` at the repo root resolves to the WRONG package → "unknown command 'test'"

# Review gates
CONTEXT_DIFF_LINES=700 bash scripts/codex-review.sh     # ⚠️ diffs HEAD~1..HEAD — COMMIT FIRST
# Supervisor: the /code-review skill, run independently of Codex
```

---

## 3. 🔧 ISSUES

| # | Issue | State |
|---|---|---|
| **A3** | Partner screens unverified by a signed-in viewer | 🔴 **STILL OPEN.** Cause now known and written down (§1). Five checks skip. |
| **I20** | 🔴 **NEW — a CI account holds org-admin authority in the operator's `[AUDIT]` orgs** | **OPEN.** Not inert (§1). Revoke at B2. |
| **I21** | 🔴 **NEW — `scripts/codex-review.sh` never reviews the working tree** | **OPEN.** `gather_context` diffs `HEAD~1..HEAD` whenever `HEAD~1` exists. The mechanical cause of "Codex drifts onto stale artifacts". Also mislabels the model as `llama3.2` while running the codex backend. |
| **I22** | 🔴 **NEW — three files claim a `ROLE_PRECEDENCE` re-default that does not happen** | **PARTLY FIXED.** Corrected in the spec and the seed SQL; `set-organization-action.ts:64,77` still carries it. |
| **I23** | 🔴 **NEW — the model workflows label their firewall entry `'demo seeding'`** | **OPEN for the others.** That matches the `ephemeral:` reaping filter NOWHERE, so a killed run leaves the runner's /32 on the production allow-list unreapable — while the header comment claims cleanup exists. Fixed in the new workflow only. |
| **I24** | 🔴 **NEW — `${{ inputs.confirm }}` is interpolated into `run:` bodies** | **OPEN for the others.** Shell injection in jobs holding `RENDER_API_KEY`. Fixed in the new workflow only (`env:`). |
| I14–I19 | carried | see `.claude/TASK_LIST_2026-08-19.md` |

---

## 4. What shipped this session

| Commit | What |
|---|---|
| `f298773` | The two-part fix: the guarded grant workflow + SQL, and `actAs` → `actInOrganization` |
| `d73d38c` | Codex's five findings fixed; rehearsal proved three of them |
| `21f6ff4` | Run-summary arithmetic corrected (78/0/1, not 73/0/1) |
| `0be23f1` | The Supervisor's eight findings — including its falsification of my own fix |

**13 review findings fixed across both gates.** The single most useful one: the
Supervisor showed that my fix to Codex's race was a check that **could not
fail** — `toHaveValue()` on an uncontrolled `<select>` whose value
`selectOption` had already set client-side.
