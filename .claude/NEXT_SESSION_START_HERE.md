# ▶ START HERE — next session

```bash
bash scripts/start-session.sh
```

Then, in this order:

1. **`.claude/CURRENT_TASK.md`** — the resume pointer (written 2026-08-05 at close)
2. **`.claude/NEXT_SESSION_SCHEDULE.md`** — 🔴 **THE COMMENCEMENT TASK.** Part A is
   the open-issue register (8 items, ranked); Part B is the five slices. **Part A
   first** — every item in it is either a live risk or something that will
   silently corrupt a later measurement.
3. **`docs/00-project/COMPLETION_PLAN.md`** — the plan being executed

## 🔴 HARD POLICY — owner, 2026-08-05

**Five slices plus issue resolution every session. Never use the scheduler —
the owner runs their own schedule.**

## The one-line status

Nothing is blocked. Production works end to end: migrations 037+038+039 applied,
`verify-live-workshop-spine.mjs` **7/7** on `autoworkshop.aiappinvent.com`,
live stats `parts 18 · suppliers 5 · countries 3 · mechanics 1`.

Working screens: **workshop-web 100 · customer-web 14 = 114 of 242**.
Confirm with `node scripts/audit-menu-coverage.mjs --all` before trusting it.

## The two tracks

**Part A — issue resolution.** A1 is the sharpest: `realm-autoworkshop.json` has
DRIFTED from production, and re-importing it would break sign-in AND sign-up on
the apex. A2 is likely a free close (T-0044 measured 0px after the design pass).
Full ranked list in `NEXT_SESSION_SCHEDULE.md`.

**Part B — five slices.** 1 Evidence upload · 2 Reception · 3 Invoicing &
payments · 4 Parts & stock · 5 Warranty.

⚠️ Slice 2 is 5 screens lighter than the plan states — `create-job-card` shipped
on 2026-08-05. Correct the count when you start; do not count those five twice.

## Warm production before any live check

```bash
curl -s -o /dev/null -w '%{http_code} %{time_total}s\n' --max-time 300 \
  https://autoworkshop-keycloak.onrender.com/realms/autoworkshop/.well-known/openid-configuration
curl -s https://autoworkshop-api.onrender.com/api/v1/health
```

Keycloak's cold start is 115–147s and produces `error=Configuration`, which
reads as a broken site and is not.
