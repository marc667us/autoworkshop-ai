# Current task

**Written 2026-08-05 at session close. Git tip `c243d0a` on `master`, pushed,
tree clean. Release / CI / Security CI all green. No dev servers left running —
3000, 3001, 3002 and 4000 verified free.**

## ▶ FIRST COMMAND OF THE SESSION — not a document, a script

```bash
bash scripts/start-session.sh
```

It kills stale dev servers (**`pkill` does NOT work on Windows**), proves the
ports are free, checks the Docker containers, applies pending migrations and
prints what to run next. Read-mostly, idempotent, starts nothing.

Then read **`docs/00-project/COMPLETION_PLAN.md`** — that is the plan being
executed, and it is measured by `node scripts/audit-menu-coverage.mjs --all`.

### 🔴 HARD POLICY — owner, 2026-08-05

**Five slices plus issue resolution EVERY session. Never use the scheduler; the
owner runs their own schedule.**

⚠️ `COMPLETION_PLAN.md` estimates 1–3 sessions per slice. Work to the policy, but
do **not** meet the number by lowering the bar. Item 12 of the plan's checklist
is the anti-cheat rule — a slice is not done while its screen still shows a
"what you can do instead" panel — and `planned-workshop.spec.ts` enforces it
mechanically. Report the audit figure, never a claim, and say plainly which
slices did NOT land.

---

## ✅ NOTHING IS BLOCKED. Production works end to end.

The three-session migration blocker is **gone**.

| Proof | Result |
|---|---|
| Migrations 037 + 038 + 039 on production | applied |
| `verify-live-workshop-spine.mjs` | **7/7** — sign in → customer → vehicle → job card → board → dashboard |
| Live public stats | `parts 18 · suppliers 5 · countries 3 · mechanics 1` |
| Live dashboard | **1 active job card · 1 new complaint** (was six zeroes) |

**Live credentials:** `marc667us@yahoo.com` / `Forest-prism-bramble-nomad7`.

⚠️ **Warm Keycloak FIRST.** Cold start is 115–147s and produces
`error=Configuration`, which reads as a broken site and is not:

```bash
curl -s -o /dev/null -w '%{http_code} %{time_total}s\n' --max-time 300 \
  https://autoworkshop-keycloak.onrender.com/realms/autoworkshop/.well-known/openid-configuration
curl -s https://autoworkshop-api.onrender.com/api/v1/health
```

---

## ▶ NEXT SESSION STARTS HERE — slices 1 to 5

| # | Slice | Screens | Depends on |
|---|---|---:|---|
| 1 | **Evidence upload** — `media.assets`, MinIO signed URLs | 2 | — |
| 2 | **Reception** — appointments, intake checks, walk-ins, calendar | 12 | 1 |
| 3 | **Invoicing & payments** — `finance.*`, built on `repair.quotations` | 16 | — |
| 4 | **Parts, stock & procurement** — `parts.*` | 20 | — |
| 5 | **Warranty** — `warranty.*` | 5 | 3 |

⚠️ **Slice 2 is 5 screens lighter than the plan says.** Its `create-job-card`
half shipped on 2026-08-05 — one screen at five intake routes — because the
workshop had **no way to open a job card at all**. Correct the plan's count when
you start; do not silently carry the old number.

**Working screens now: `workshop-web` 100 · `customer-web` 14 = 114 of 242.**

### Every slice must deliver

Section 4 of `COMPLETION_PLAN.md`, 14 items. The ones most often skipped: RLS
`ENABLE` **and** `FORCE` with per-command policies · a tenant-isolation negative
test · a browser check driven **as the role that owns the screen** · the
signpost entry **deleted** from `planned-workshop.ts`.

---

## 🔴 LESSONS FROM 2026-08-05 — read before writing a migration or a test

1. **SECURITY DEFINER IS NOT AN RLS EXEMPTION.** The owner is not a superuser on
   Render and FORCE RLS binds owners. 039 exists because 037 and 038 both
   shipped green while the READ path stayed broken.
2. **A LEFT JOIN turns "refused by RLS" into "has none"** — a permissions fault
   rendered as a fact about the user, and the app cannot tell them apart.
3. **Verify under production privileges or the verify is theatre.** `verify/039`
   re-owns the function to a THIRD non-superuser role and refuses to run if the
   owner is a superuser, or if owner and caller are the same role.
4. **Prove a guard by injecting the failure.** `planned-workshop.spec.ts` passed
   4/4 with the real defect re-injected — its regex missed a comment line.
5. **The job-card list route is PER-ROLE** (`jobCardListHrefFor`). Two of my own
   checks reported product defects that were wrong-route-for-the-role.
6. **Wait past hydration before believing a layout measurement.** A sweep
   reported 131px of overflow that did not exist.
7. **Check the command shape before concluding you are blocked.** Four sessions
   of "classifier-blocked" was `cd … && gh …` failing to match a prefix rule that
   had been allow-listed all along. Bare command with `--repo` ran first time.

---

## Standing warnings

- Deploy: apex via **`Release`** (push to master), customer via
  `deploy-customer-web.yml`. **NEVER `render-deploy.yml`.** `pnpm lint` first.
- 🔴 **`realm-autoworkshop.json` HAS DRIFTED FROM PRODUCTION** — it registers the
  apex on the CUSTOMER client; production has it on the WORKSHOP client.
  Re-importing would break sign-in AND sign-up on the apex. **Not yet fixed.**
- **Cookies ignore the PORT**, so `localhost:3000` and `:3001` share one jar. A
  wrong workspace id works locally and fails only in production.
- Four free Render services share one 750h/month allowance. **No paid remedy is
  to be proposed** (ADR-012). Slices 1–10 add no service; slice 11 may.
- `check-page-gates.sh` is RED with 19 pre-existing false FAILs (D4).
- `RENDER_API_KEY` unrotated since the 2026-07-27 leak.
- **No mobile URL exists** — Expo only.
