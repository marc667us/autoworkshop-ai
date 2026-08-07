# Current task — resume here

**Written 2026-08-06 at session close. Tip `72bae51` on `master`, pushed, tree
clean.** (A later commit adds this file; the tip moves, master stays clean.)

## ▶ FIRST COMMAND OF THE SESSION

```bash
bash scripts/start-session.sh
```

### 🔴 HARD POLICY — owner
**Five slices plus issue resolution every session. Never use the scheduler.**
**Codex and the Supervisor only — NO Google ADK, NO Stitch.** The no-ADK rule
covers BUILDING, not just opening it as a tool; see
`docs/00-project/CUSTOMER_VALUE_CHAIN.md`.

---

## ▶ THE ONE THING TO DO FIRST — THE 45-SCREEN LEAK

🔴 **A signed-in `customer` on workshop-web sees 45 of 45 workshop staff
screens.** Measured 2026-08-06, not theorised. Permission filtering removes
NOTHING, because every item in the workshop default tree is ungated. The list
includes **Customers** (the whole customer book), **Vehicles**, Job Cards,
Technicians, Quotations, Customer Proposals, Parts Depot, Procurement,
Suppliers, Warranty Claims and four Reports screens.

**Everything you need is already scoped in
`docs/00-project/CUSTOMER_VALUE_CHAIN.md` — read it before touching code.** It
names the four call sites, the trap, and the proof.

Reproduce in four lines. It returns **45 today**, so it fails for the right
reason and cannot pass vacuously:

```ts
import { getWorkspace, visibleGroups, workspaceForRole } from '@autoworkshop/navigation';
const ws = workspaceForRole(getWorkspace('workshop')!, undefined);
let n = 0;
for (const g of visibleGroups(ws, [])) n += g.items.length;   // 45 before, 0 after
```
(Run it as a temporary `*.test.ts` inside `packages/navigation/src/` — imports
resolve there. A script at the repo root does NOT resolve `@autoworkshop/*`.)

### Why it is a slice and not a patch
`ROLE_TO_NAV` (`viewer-contract.ts:76`) maps only the **8 workshop staff roles**.
The other six — `customer`, `supplier_owner`, `fleet_administrator`,
`insurance_assessor`, `towing_operator`, `platform_administrator` — return
`undefined` from `navRoleFor()`, and `workspaceForRole(base, undefined)` returns
the DEFAULT staff tree.

There is no value of `role` meaning "this viewer has no business here":
- `undefined` already means "staff role not yet resolved" → default tree.
- a missing workspace already means "configuration error" and renders an error
  screen — wrong for a customer who is legitimately signed in.

So it needs a **third state**, in four places, landing together:
1. `packages/next-shell/src/viewer-contract.ts` — separate "not a workshop role"
   from "unresolved".
2. `packages/next-shell/src/WorkspaceShell.tsx:156-159` — a "signed in, but this
   workspace is not yours" state, distinct from the configuration-error screen.
   ⚠️ It is a CLIENT component and takes `role` as a prop.
3. `packages/next-shell/src/require-route.ts` — refuse, `notFound()`.
4. The app layout — send the customer somewhere useful, not into a wall.

⚠️ **BOTH HALVES SHIP TOGETHER.** Gate only → 45 menu entries that 404, the
signpost-that-404s failure this repo has paid for three times. Nav only → hidden
but not refused, which CLAUDE.md §8 forbids by name.

⚠️ **`platform_administrator` IS IN THE SAME UNMAPPED SET.** Sweeping all six
risks locking admins out; there is prior history of admins being unusable
without a membership. Decide that role separately.

⚠️ **THIS MEASURED THE NAVIGATION, NOT THE DATA.** Whether the API and RLS refuse
what is behind those 45 screens is UNCHECKED. It may be 45 empty screens rather
than 45 leaking ones — that changes the severity, not the need. Drive it in a
browser as a real customer.

---

## ▶ THEN: THE CUSTOMER VALUE CHAIN

`docs/00-project/CUSTOMER_VALUE_CHAIN.md` holds the owner's full journey, given
verbally on 2026-08-06: landing → free search for a workshop or mechanic →
choose or be assigned → **Request for Service** → file complaint + car details +
problem → **submit WHILE SIGNED IN** → lands at reception → an agent registers
the customer and their vehicles and assigns the work → an orchestrated agent runs
the repair with the workshop's other agents.

**Owner's framing:** *"customer is the initiator of the value chain of this app
in this case the auto repair business."* That is also the argument for the leak
fix — a customer is not a degraded staff role.

**The customer's own three requests** (all customer-web, NONE verified yet):
1. Sign in to **view AND add** complaints.
2. **Add / register their own vehicles** — self-service AND agent-driven, both.
3. **Repair status on every section and card**, not one status page.

⚠️ Customer §33 audits 35/35, but that is MENU COVERAGE — every entry has a
working page. It says nothing about whether these three exist. Check first.

🔴 **NO GOOGLE ADK.** Steps 8-9 are deterministic services. Copy Solar's
**ADR-0008 (AI-SOC)** and **ADR-0009 (Billing Agent)** — both shipped
deterministic and ADK-free. Write an ADR when the first lands, as a RECORD of the
owner's decision, not a gate to re-argue it through.

---

## WHAT SHIPPED 2026-08-06 (all live)

| Commit | |
|---|---|
| `b0ac564` | Keycloak prewarm — wake it during render, not on click |
| `578719e` | Landing sign-in decided by SESSION, not by `/me` (Solar's pattern) |
| `ae812a0` | 768px breakpoint — re-measured green on live |
| `9ea1cd0` | `set-keycloak-smtp.yml` — password reset |
| `1828bdc` `58fcbfe` `72bae51` | Customer value chain, no-ADK decision, leak scope |

**Phase 5 is FINISHED** — `node scripts/audit-menu-coverage.mjs --all`:
241/243 routes, **0 dead ends**, the 2 signposts are Phase 12 by design.
Owner 64/64 · Default 56/56 · Manager 36/36 · Reception 29/29 · Customer 35/35 ·
Technician 40/42.

## OPEN — needs the owner
- **SMTP secrets on THIS repo**: `SMTP_HOST/PORT/USER/PASS/FROM` (Brevo free, as
  Solar uses). Until then password reset is a dead end: the page renders and
  promises an email Keycloak cannot send. Then run **Set Keycloak SMTP** —
  dry-run first, it verifies both credentials without writing.
- `RENDER_API_KEY` still unrotated since 2026-07-27.

## OPEN — Claude can do
- **LIST 1 item 2** — the viewer contract cannot say `unknown`. Draft parked at
  `docs/00-project/DRAFT_ViewerUnavailableScreen.tsx.txt` (`.txt` so it cannot be
  imported). It was REVERTED from `packages/`, not shipped: it threw into an
  error boundary that does not exist. Codex flagged the live consequence — a
  session with no grants now sees a dashboard link, and `requireNavRoute` 404s on
  empty grants, so during a cold `/me` that button can 404.
- **Playwright has not run since 2026-07-29**; ~120 pages unmeasured.
- Honesty debts: `quotation` and `purchase_order` approval scopes are recorded,
  not enforced.
- Migration 057's tables (`knowledge.diagnostic_trees`, `learning.course_materials`)
  are EMPTY — they need an authoring screen or a seed. Ask the owner which.

## TRAPS CONFIRMED AGAIN THIS SESSION
1. 🔴 **GitHub created NO run for two pushes.** `Release`'s `headSha` lagged the
   tip. Assume this is normal: after every push, check, and
   `gh workflow run release.yml --ref master` if absent.
2. 🔴 **`Release` deploys workshop-web ONLY.** customer-web needs
   `deploy-customer-web.yml` dispatched separately.
3. Runner backlog reached **1h45m** tonight; it later cleared. Queued ≠ broken.
4. A dispatched run checks out master at RUN time, not dispatch time.
