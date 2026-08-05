# Current task

**Written 2026-08-06 at session close. Git tip `c541958` on `master`, pushed,
tree clean. Release / CI / Security CI all green. No dev servers running —
3000, 3001, 3002 and 4000 verified free.**

## ▶ FIRST COMMAND OF THE SESSION — not a document, a script

```bash
bash scripts/start-session.sh
```

Then `docs/00-project/COMPLETION_PLAN.md`, measured by
`node scripts/audit-menu-coverage.mjs --all`.

### 🔴 HARD POLICY — owner, 2026-08-05

**Five slices plus issue resolution every session. Never use the scheduler.**

---

## ✅ SLICES 1–5 ARE DONE AND ON PRODUCTION

| Slice | Screens | Working after |
|---|---:|---:|
| 1 Evidence upload | 2 | 102 |
| 2 Reception | 9 | 111 |
| *(owner request: signed-in landing + shopping cart)* | 1 | 112 |
| 3 Invoicing & payments | 12 | 124 |
| 5 Warranty | 2 | 126 |
| 4 Parts, stock & procurement | 17 | **143** |

**157 of 242** — workshop-web 143, customer-web 14. Migrations **040–044** all
applied live; every new endpoint answers **401**, not 404.

---

## ▶ NEXT SESSION — SLICES 6 TO 11 (owner, 2026-08-06)

**41 signposted routes remain in workshop-web and 24 in customer-web.** Measured
just now, not estimated:

| # | Slice | Routes left | Notes |
|---|---|---:|---|
| 6 | **Settings & workshop admin** | ~10 | `core.opening_hours`, approval limits, templates, branches, workflow rules. Independent of everything. |
| 7 | **Messaging (text + files)** | ~10 | `comms.threads/messages/participants`. **`media.links` already carries a `message` owner type** — slice 1 built for this. |
| 8 | **Reports** | ~14 | 🔴 **DELIBERATELY LAST-ISH.** No new tables — read-only aggregates over slices 2/3/4. A report over empty tables is the "disconnected mock page" `05.txt` §2 forbids, and slices 2–4 have only just filled those tables. |
| 9 | **Customer self-service tail** | 6 | The only slice that moves **customer-web**, which is stuck at 14/38 and is the weakest tree at 31%. |
| 10 | **Knowledge & learning** | ~6 | Licensed content (OEM diagrams) stays staged per CLAUDE.md §4 — the LIBRARY is built, the corpus accumulates. |
| 11 | **Voice/video consultations** | ~7 | Largest, least certain. ⚠️ The one slice that may need another Render service — see the budget note below. |

⚠️ **RE-MEASURE EVERY COUNT BEFORE STARTING.** Every single one of the plan's
slice sizes was wrong this session: slice 2 was 9 not 17, slice 3 was 12 not 16,
slice 5 was 2 not 5, slice 4 was 17 not 20. `audit-menu-coverage.mjs` is the
authority; `COMPLETION_PLAN.md` is an estimate nobody has re-checked.

---

## 🔴 THE DEPLOY CHAIN HAS THREE LINKS AND GREEN CI PROVES NONE OF THEM

1. **Schema** — `apply-migrations.yml -f confirm=APPLY`
2. **API** — `deploy-api.yml -f confirm=APPLY`  ← **`Release` DOES NOT DO THIS**
3. **Web** — `Release`, on push to master. **NEVER `render-deploy.yml`.**

Slice 2 shipped green and every new endpoint 404'd on production for an hour
because only the apex had been deployed. Run `pnpm lint` before claiming
anything is deployable.

## 🔴 REHEARSE EVERY MIGRATION BEFORE APPLYING IT

```bash
gh workflow run rehearse-migration.yml -f migration=045_whatever
```

Applies the migration AND its verify against the **real production database as
the real non-superuser role**, inside a transaction, and rolls back. It refused
042 five times and **every refusal was a real defect**. It also detects an
already-applied migration and rehearses the verify alone.

⚠️ A verify must **build its own tenant** through the registration bootstrap
door — `identity.tenants` is `USING (id = current_tenant_id())`, so a fixture
cannot discover one. Copy `verify/042` or `verify/044`.

⚠️ **ASSERT THE EFFECT, NOT THE MECHANISM.** A forbidden DELETE *raises* locally
(superuser reaches the row, trigger fires) and *silently matches zero rows* live
(no DELETE policy under FORCE RLS). Assert that the row survived, not that an
exception was thrown.

---

## ⚠️ STILL OPEN

- **Codex's 3 unactioned findings** — the rehearsal's dollar-quote tracker can be
  fooled by `-- $$` in a comment; "left no trace" reads only the migration
  ledger; **sequences are not rolled back**. All real, none reachable by any
  migration in this repo today.
- **Part A leftovers**: A2 (T-0044 never measured this session), A4
  (tenant-isolation suite), A6 (Playwright baseline — not re-run since 07-29,
  and ~60 pages have landed since), A7 (`recorded_by` re-stamped on edit),
  A8 (permission denials not audited).
- The **signed-in landing** branch is verified by build and typecheck only — a
  live signed-in eyeball is still owed.
- Four free Render services share one 750h/month allowance. **No paid remedy is
  to be proposed** (ADR-012). Slice 11 may need a service; if it cannot fit, it
  stays local-only and that gets said, not quietly skipped.
- `RENDER_API_KEY` unrotated since the 2026-07-27 leak.
- **No mobile URL exists** — Expo only.

## Live credentials

`marc667us@yahoo.com` / `Forest-prism-bramble-nomad7`. ⚠️ Warm Keycloak first —
cold start is 115–147s and produces `error=Configuration`, which reads as a
broken site and is not.
