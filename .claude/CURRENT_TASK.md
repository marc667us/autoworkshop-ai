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

## 🔴 FIRST: FINISH THE DEPLOY — TWO MIGRATIONS AND THE API

**All code is committed and pushed (`bf71104`). Migrations 056 and 057 are NOT
applied to production, and the API carrying `/plan-work/*` and `/learning/*` is
NOT deployed.** Nothing is broken — this is unshipped, not failing.

GitHub Actions was badly degraded at session end: runs queued 40+ minutes, some
auto-cancelled, `gh workflow run` and `gh run cancel` intermittently HTTP 500.
Nothing was wrong with the workflows or the code.

**RUN THEM IN THIS ORDER.** 056 is already rehearsed (verify 6/6 on live); 057
was dispatched to rehearse at session close — check it finished before applying.

```bash
# 0. confirm the 057 rehearsal passed (verify/057 must read 8 of 8)
C:/Users/USER/bin/gh.exe run list --workflow=rehearse-migration.yml --limit 2 --repo marc667us/autoworkshop-ai
# 1. apply BOTH pending migrations (one run applies all pending)
C:/Users/USER/bin/gh.exe workflow run apply-migrations.yml -f confirm=APPLY --repo marc667us/autoworkshop-ai
# 2. the API
C:/Users/USER/bin/gh.exe workflow run deploy-api.yml -f confirm=APPLY --repo marc667us/autoworkshop-ai
# 3. THE PROOF — each must be 401, NOT 404:
for p in plan-work/find-parts learning/materials learning/diagnostic-trees; do
  curl -s -o /dev/null -w "$p %{http_code}
" https://autoworkshop-api.onrender.com/api/v1/$p
done
```

⚠️ **A QUEUED `apply-migrations` RUN CHECKS OUT MASTER AT RUN TIME, NOT AT
DISPATCH TIME.** A run dispatched when only 056 existed would have applied 057
too — unrehearsed. That run was cancelled at session close for exactly this
reason (it had not started, so nothing was applied). **If you dispatch an apply
and then land another migration, cancel and re-dispatch.**

⚠️ workshop-web rides `Release` (automatic on push). customer-web does NOT —
see the four-link table below. Slices 14–16 touched only workshop-web.

⚠️ **`gh workflow run` can return HTTP 500 and start the run anyway, or return
500 and do nothing.** Both happened today. Check the run list before
re-dispatching.

## ✅ LIST A IS CLOSED — every item fixed and deployed

A1 organisation RLS (migration 054, 49 tables) · A2 the isolation suite ·
A3 the staff gate proven from outside · A4 the flake · A5 all 37 ungated reads
argued · A6 approval limits ENFORCED.

**The one thing left is A7: `RENDER_API_KEY`, leaked 2026-07-27, OWNER ONLY.**

Production: 54 migrations, 0 pending. All six `/my/*` routes answer 401; the
A5-gated staff routes answer 401; a bogus path answers 404; apex 200.

🔴 **401, NOT 404, IS THE PROOF** that a route is really serving. Probe the
running thing after every deploy — a 404 with everything else green is the
exact shape of the slice-11 defect.

## ▶ THE FIRST THING TO DO

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
