## ✅ CAUSE CONFIRMED BY THE OWNER (2026-07-28)

**The free-tier limit of 750 instance-hours was reached. The service reactivates
on 1 August.** Nothing in the code caused it and nothing in the code fixes it.

This closes the question the rest of this document left open. The API could not
answer it — `GET /v1/owners/{id}` returns 200 with an empty object, so instance
hours were an INFERENCE that the note below was careful not to state as fact.
The owner has now confirmed it from the dashboard, which is the only place that
distinguishes an hours exhaustion from a payment problem.

Consequences worth carrying forward:

- Deleting staging was still the right call — it stops two services drawing on
  one 750-hour allowance — but it could not restore hours already consumed.
- Two always-on free services cannot both run a full month on one allowance.
  A month is ~730 hours, so ONE always-on service already sits at the limit.
  Any future second environment has to be part-time or the allowance is gone
  again. This is a design constraint, not a one-off.
- Re-run the Release workflow once the service is serving again; the deploy
  step failed only because its target was suspended.

---

# Live outage — 2026-07-28

`autoworkshop.aiappinvent.com` is **DOWN**. Every request returns 503.

## What is true, measured

| Fact | Evidence |
|---|---|
| Production suspended | `srv-d9ju49id0e5s7389fjlg` → `suspended: suspended`, **`suspenders: ['billing']`** |
| Staging was suspended too | `srv-d9jun8m417fc73dore50`, identical state |
| Not a cold start | 503 returned in **<0.5 s**, repeatedly. A sleeping free service hangs for ~50 s and then answers |
| Not lift-able from here | `POST /v1/services/{id}/resume` → **400** `{"message":"only services suspended by a user can be resumed"}` |
| Still down after 10 waits | 20 s apart, every attempt 503 |

**Render suspended these services. Only Render can un-suspend them.** The API
refuses on principle, not on permissions — a billing suspension is a different
class from a user suspension, and the endpoint says so.

## What this is NOT

- **Not caused by the code shipped on 2026-07-28.** On every one of those
  commits the `checks` job (typecheck, lint, 149 unit tests) and the `image` job
  (build the container, start it, call `/api/auth/*`, assert no token in the
  session document, publish to GHCR) both **passed**.
- **Not a build failure.** The image is published and pullable.
- **Not DNS or TLS.** The domain resolves and the certificate is intact; the
  503 comes from Render's edge, which means the routing works and the origin
  is gone.
- **Not the deploy pipeline being broken.** The Release run fails at the deploy
  step with Render returning 400 because *you cannot deploy to a suspended
  service*. That failure is a symptom. It will clear on its own once the service
  is back — it needs no code change.

## What was done

**The staging service was deleted** (owner decision, 2026-07-28). Two free web
services on one account draw on the same free instance-hour allowance;
production now carries it alone.

`render-drop-staging.yml`: dry-run first, then `confirm=APPLY` → `DELETE 204`,
and a follow-up `GET` returned **404**, so the effect was verified rather than
inferred from the 2xx. `https://autoworkshop-web-staging.onrender.com` now 404s
instead of 503.

**This did not bring production back, and was never going to on its own.**
Stopping future consumption is not the same as restoring a consumed allowance.
That is why the resume attempt above was made, and why its refusal is the
important result rather than a disappointment.

### What deleting staging cost us

The staging job was a real gate, not a copy of production kept for its own sake.
The `image` job starts the real container — but with **test** environment
variables, on the runner, with **no proxy in front**. Staging exercised the same
image on a real Render service, through Render's proxy, with real per-service
secrets. Those fail independently, which is the entire reason the gate existed.

Concretely, faults staging would have caught and the pipeline now cannot until
production is already serving: `AUTH_URL` pointing at the wrong host, a missing
per-service secret, a proxy-header problem. Recorded in `release.yml` beside the
`promote` job so it is read by whoever next changes that file.

## Zero-cost options remaining

Zero cost is a hard rule and **the spend decision is the owner's alone** — no
paid remedy is proposed here.

1. **Wait for the allowance to reset** with the billing cycle. Free, and needs
   nothing from anyone.
2. **Delete the retired node service** `srv-d9jsliu7r5hc73b1kncg` if it still
   exists. It never deployed successfully, never served traffic, and its domain
   is already detached. It is dead weight. *Not done — the owner authorised
   dropping staging specifically, and this is a different resource.*
3. **Owner checks the Render dashboard.** The API says only that the suspender
   is `billing`. The dashboard is the only place that states the actual reason
   and whether anything can be cleared without spending.

⚠️ **The free-instance-hours arithmetic is INFERENCE, not measurement.** Render's
API exposes no hour counter. What is measured is `suspenders: ['billing']` and
that three AutoWorkshop services existed on one account. A single free web
service that never sleeps consumes roughly a whole monthly allowance by itself,
which makes exhaustion the likely reading — but it is a reading.

## The owner decision required

**Can the suspension be cleared from the Render dashboard without spending
money — and if not, do we wait for the cycle to reset?**

Nothing in the codebase is blocked by the answer. The local stack is fully
working: the identity journey passes 2/2 against a real Keycloak, and Phase 4
can be built and tested entirely locally.

## How to verify recovery

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://autoworkshop.aiappinvent.com/home/dashboard
gh workflow run render-status.yml -f service=production   # expect suspended: None
```

Once it returns 200, re-run the Release workflow — no code change is needed; the
deploy step fails today only because the target is suspended.
