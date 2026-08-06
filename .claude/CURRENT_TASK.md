# Current task

**Written 2026-08-06 at session close.**

## ▶ FIRST COMMAND OF THE SESSION — not a document, a script

```bash
bash scripts/start-session.sh
```

Then **`.claude/NEXT_SESSION_SCHEDULE.md`** — LIST A, then LIST B.
Measure with `node scripts/audit-menu-coverage.mjs` before trusting any number.

### 🔴 HARD POLICY — owner
**Five slices plus issue resolution every session. Never use the scheduler.**
**Codex and the Supervisor only — no Google ADK, no Stitch.**

---

## WHERE THINGS STAND

**221 of 242 working** — workshop-web 191, customer-web 27.
22 signposted: 14 technician, 8 customer.

**Customer §33 went 60% -> 77%** this session. Technician §49 unchanged at 67%.

## ⚠️ LAST SESSION DELIVERED ONE SLICE OF FIVE

Slice 12 landed; 13-16 did not. The session went deep on LIST A instead —
A2 (the slice itself), A3 and A5 are closed — and turned up a severity-1
finding. Said plainly rather than by redefining a slice as smaller.

## 🔴 THE VERY FIRST THING — THE API DEPLOY DID NOT LAND

Measured at session close on `https://autoworkshop-api.onrender.com/api/v1`:

    health         200
    invoices       401    (old build, staff gate present)
    my/invoices    404    <-- SLICE 12 IS NOT SERVING YET

`apply-migrations` SUCCEEDED — 053 is live, 53 applied / 0 pending — and the
code is on master. But **`Deploy API` sat QUEUED on a GitHub runner for 15+
minutes and never started**, so the running API is still the previous build.

```bash
C:/Users/USER/bin/gh.exe run list --workflow=deploy-api.yml --limit 3 --repo marc667us/autoworkshop-ai
# if it never ran:
C:/Users/USER/bin/gh.exe workflow run deploy-api.yml -f confirm=APPLY --repo marc667us/autoworkshop-ai
# the proof — must be 401, NOT 404:
curl -s -o /dev/null -w '%{http_code}
' https://autoworkshop-api.onrender.com/api/v1/my/invoices
```

⚠️ `gh workflow run deploy-api.yml` returned **HTTP 500 and the run started
anyway**. Check the run list before re-dispatching, or you deploy twice.

## ▶ THE FIRST THING TO DO AFTER THAT

**LIST A · A2 — the tenant-isolation suite.** It is listed second in the file
and should be done FIRST, because it is the thing that would have caught A1 and
it is what gives A1 its proof.

**Then A1: `docs/11-devops/RLS_ORG_PREDICATE_GAP.md`.** ~100 RLS policies
across migrations 001-044 carry a tenant predicate and NO organisation
predicate, while a tenant here holds more than one organisation. It is a
missing second line of defence, not an open door — the app layer does filter by
organisation nearly everywhere. **Do not apply it blind**; the three paths it
would break are named in that document.

## 🔴 THE LESSON THAT PAID FOR ITSELF THIS SESSION

**Read the schema before writing the query.** Three defects were caught before
they ever ran, by checking `information_schema` rather than trusting a
plausible name: `warranty.next_claim_number()` does not exist and would have
500'd on the first claim; `claim_events` has `decided_at`, not `created_at`.
And a fourth by reading an existing service: my draft refused a claim on an
expired warranty, contradicting a decision migration 043 had already made and
explained.

**And: a customer is a car owner who brings a vehicle in — never staff.**
The owner's own words this session. `assertWorkshopStaff` refuses them, `/my/*`
serves them their own rows, and a method needs exactly one of the two.
