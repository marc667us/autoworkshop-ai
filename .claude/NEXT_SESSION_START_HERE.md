# ▶ START HERE — next session

```bash
bash scripts/start-session.sh
```

Then read **`.claude/CURRENT_TASK.md`** (resume pointer, written 2026-08-05 at
close) and **`docs/00-project/COMPLETION_PLAN.md`** (the plan being executed).

## 🔴 HARD POLICY — owner, 2026-08-05

**Five slices plus issue resolution every session. Never use the scheduler —
the owner runs their own schedule.**

## The one-line status

Nothing is blocked. Production works end to end: migrations 037+038+039 applied,
`verify-live-workshop-spine.mjs` **7/7** on `autoworkshop.aiappinvent.com`,
live stats `parts 18 · suppliers 5 · countries 3 · mechanics 1`.

Working screens: **workshop-web 100 · customer-web 14 = 114 of 242**.
Confirm with `node scripts/audit-menu-coverage.mjs --all` before trusting it.

## Next five slices

1. Evidence upload · 2. Reception · 3. Invoicing & payments · 4. Parts & stock ·
5. Warranty. Sizes and dependencies in `COMPLETION_PLAN.md` §2.

⚠️ Slice 2 is 5 screens lighter than the plan states — `create-job-card` shipped
on 2026-08-05. Correct the count when you start.

## Warm production before any live check

```bash
curl -s -o /dev/null -w '%{http_code} %{time_total}s\n' --max-time 300 \
  https://autoworkshop-keycloak.onrender.com/realms/autoworkshop/.well-known/openid-configuration
curl -s https://autoworkshop-api.onrender.com/api/v1/health
```

Keycloak's cold start is 115–147s and produces `error=Configuration`, which
reads as a broken site and is not.
