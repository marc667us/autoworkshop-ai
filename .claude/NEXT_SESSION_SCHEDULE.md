# Next session — start here

**Rewritten 2026-08-09 at session close. Tip `1576d62` on `master`, pushed.**
Working tree clean. 9 commits this session.

▶ **FIRST TWO COMMANDS:**
```bash
bash scripts/start-session.sh          # kills stale servers, applies local migrations
bash scripts/record-live-state.sh      # NEW — photographs what is actually deployed
```

Owner policy: five slices + issue resolution every session. Never the scheduler.
**Codex and the Supervisor only — no Stitch, no Google ADK.**

---

# ═══ EVERYTHING IS DEPLOYED AND VERIFIED ═══

Unusually for this repository, there is **nothing broken on production** at
close. Measured, not assumed:

| | |
|---|---|
| **Live suite** | **25 passed / 0 failed / 0 skipped** (anonymous) |
| | **0 / 0 / 4 SKIPPED** (signed-in — no credentials, see A1) |
| **Playwright** | **138 passed / 0 failed / 2 skipped** |
| **Unit** | 17/17 tasks, API 908 passed / 0 failed / 1 skipped |
| **Lint** | 16/16 · nav coverage 0 gaps |
| **Migrations** | **072 of 072 applied to production** (`6 applied, 65 skipped`) |
| **Services** | five, all answering: apex · customer · **supplier (NEW)** · api · keycloak |

Both of the owner's buttons are in the served apex HTML, and the supplier one
signs in at the supplier app's **own origin** with a path-only callback.

---

# ═══ WHAT SHIPPED 2026-08-09 ═══

## 🔴 The `supplier_owner` role could not exist in production

Before building the button, the 08-08 question was asked of the role: *which
production code path WRITES this membership?* **None.** `identity.memberships`
had exactly two writers — `register_workshop` (always `workshop_owner`) and the
admin-only `grant()`. The role was in `ROLE_PRECEDENCE`, the permission matrix,
the supplier nav tree and the whole `supplier-web` app, and nothing could
create one. Shipping the button first would have produced accounts that sign in
and are refused by every supplier route — **the customer-role defect of 08-08,
one week later** — and it would have passed every test, because
`seed-dev-identity.sh` writes that membership with raw SQL.

Migration **068** is the missing path. The button came second.

## Verification, not a free-for-all (069 · 070 · 071 · 072)

A registrant works inside their own organisation immediately and is **not** in
the public registries until a platform administrator approves. The registries
already default to invisible, so **approval is what publishes**. The alert is a
**trigger**, so it commits with the registration rather than in a second
autocommit statement a crash can lose. Admin queue at
`/directory/registrations`.

## Six HIGH defects, across two gates, neither sufficient alone

**Codex found 3** (fixed in 071) · **the Supervisor then found 3 more Codex
missed** (fixed in 072). The two worth carrying:

1. 🔴 **`SECURITY DEFINER` DOES NOT EXEMPT ANYTHING FROM FORCE RLS.** The admin
   alert was inert on Render. Measured: local owner (`rolbypassrls=t`) sees
   **2** administrators, a NOBYPASSRLS role sees **0**. My rehearsal ran as the
   bypassing owner so it could not have caught it — while quoting that exact
   scar in the migration's header.
2. 🔴 **A workshop could publish ITSELF**, bypassing the entire verification
   gate. `DirectoryService.setPublication` never consulted the queue.

## Also shipped
`GET /leads` (crm.leads had a writer and no reader since 064) · migration 067
(five more settings tables admitted a customer: **1/1/1/1 → 0/0/0/0**) ·
signed-in live-suite job · admin verification screen · `.dockerignore`
(verified: image builds, context 2.75 MB) · `New job card` quick-create.

---

# ═══ 🔴 FIVE TRAPS THIS SESSION ADDED TO THE RECORD ═══

1. **`it.runIf(x)` IS EVALUATED AT COLLECTION TIME**, before `beforeAll` — nine
   tests could never have run and reported "skipped" against a healthy
   database. Use a runtime `ctx.skip()`.
2. **PIPING TO `tail` MASKS THE REAL EXIT CODE.** Bit three times in one day:
   a Docker build reported "exit 0" having produced no image; `pnpm build` and
   Playwright the same. **Capture `$?` separately, and read the COUNT.**
3. **THE DRIFT CHECK I BUILT TO CATCH SILENT FAILURES WAS SILENTLY FAILING.**
   It printed `PENDING 0 — production matches` four lines below the runner's own
   `6 pending`, because it grepped for `apply` and a dry run prints `PENDING`.
   **And I "verified it against real output" — locally, where nothing was
   pending, so 0 was right for the wrong reason.** Testing a detector only
   against the negative case proves nothing.
4. **MIGRATIONS APPLIED ≠ FEATURE LIVE.** Production got the schema and the API
   was not redeployed; four new routes 404'd. Found only because the new
   route checks were added. **Deploying the DB and the code are two acts.**
5. **A GREEN SUITE MEASURED AGAINST AN EMPTY SHOP.** Playwright's 138/2 baseline
   was taken while the marketplace had no stock, hiding a *serious*
   colour-contrast violation on a button that only renders when there is stock,
   and a nav test that could never have caught the defect it is named for.

---

# ═══ OPEN WORK, RANKED ═══

| # | Item |
|---|---|
| **A1** | 🔴 **`LIVE_OWNER_EMAIL` / `LIVE_OWNER_PASSWORD` are not set**, so the signed-in half of the live suite SKIPS 4 and **nothing verifies what a real owner sees on production** — the gap that cost four misdiagnoses on 08-08. `gh secret set LIVE_OWNER_EMAIL` / `LIVE_OWNER_PASSWORD`. Owner-only (real credentials). |
| **A2** | **Nobody has driven the supplier funnel end to end on live.** Everything is deployed and probed anonymously; no human has actually registered a supplier through the button. That is the first thing to do next session. |
| **A3** | **"Add new" buttons: 2 of ~40 list screens have one.** `New job card` was added, but it renders for **reception only** — `create-job-card` is in one nav tree, so the OWNER who asked for it cannot see it. Widening is a navigation change and needs review (`CLAUDE.md` forbids changing approved navigation silently). Pinned in `quick-create.spec.ts`. **The real gap is that most entities have no create screen at all.** |
| **A4** | **A fifth Render service now shares the free instance-hour pool.** It ran out once (2026-07-28) and suspended everything. If services start suspending, `autoworkshop-supplier` is the newest consumer. |
| **A5** | 057's `knowledge.diagnostic_trees` + `learning.course_materials` applied and EMPTY. |
| **A6** | Migration **065 unused** (harmless, do not renumber). |
| **B** | **Blocked on the MX record:** email delivery, password reset, email verification. **SPF TXT is live; only the MX is missing.** |
| **C** | **Owner only:** the A1 secrets · KC password in PUBLIC git history · `RENDER_API_KEY` unrotated · ScrapeGraph key pasted into a transcript 2026-08-08. |

---

# ═══ DEPLOY CHAIN — FIVE LINKS NOW ═══

```bash
# 🔴 EVERY ONE NEEDS -f confirm=APPLY OR IT DOES NOTHING AND GOES GREEN.
gh workflow run apply-migrations.yml    -f confirm=APPLY   # database
gh workflow run deploy-api.yml          -f confirm=APPLY   # API
gh workflow run deploy-customer-web.yml -f confirm=APPLY   # customer
gh workflow run deploy-supplier-web.yml -f confirm=APPLY   # supplier (NEW)
#   apex (workshop-web) deploys on push to master, via Release
gh workflow run point-web-at-keycloak.yml -f confirm=APPLY # apex env: it OWNS
                                                           # the whole set
gh workflow run live-suite.yml                             # THEN THIS. ALWAYS.
```

⚠️ **`apply-migrations.yml` now also runs itself after every Release** as an
inspection, reporting IN REPO / APPLIED / PENDING and going **red** when
production is behind. It cannot apply on that path (`inputs` is null on a
`workflow_run`, so confirm falls back to empty).

⚠️ **Render drops the first connection after a firewall change** —
`SSL connection has been closed unexpectedly` is not a TLS fault, it is the
allow-list not having propagated. **Retry once** before diagnosing.
