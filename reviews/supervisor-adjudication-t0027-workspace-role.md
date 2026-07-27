# Supervisor adjudication — T-0027 workspace × role navigation

**Date:** 2026-07-27
**Adjudicates:** `codex-review-t0027-workspace-role.md`
**Verdict:** **PASS WITH CORRECTIONS** — 2 Codex findings confirmed and fixed, 1 further defect found
by this pass, 1 heuristic false positive correctly rejected.

---

## 1. What was built

`07.txt` **part 2** §46–§49 defines four distinct navigation trees inside the single `workshop`
workspace. §50 names eight roles but gives trees for only four.

- `Workspace.roleGroups` sits beside the existing `groups`, which stays the workspace default
  (`01 (1).txt` §34). The four §50 roles with no tree fall back to it — the honest behaviour for a
  role the spec has not detailed, rather than inventing navigation for them.
- `workspaceForRole()` returns a `Workspace` with the role's groups swapped in, so the shell,
  `breadcrumbsFor`, the catch-all router and the journey tests all keep taking the type they already
  took. Threading a `role` parameter through each instead would have created a second place where
  "which tree is this viewer on" gets decided — and this repo has already shipped that exact bug for
  grants, where the nav advertised routes the router 404'd.
- **`viewerRole()` is the single decision point**, called by both `WorkspaceShell` and
  `renderModulePage`.
- **Role selects the tree; permissions still filter it.** A role never bypasses a permission.

**Verified live, not merely built.** The workshop app renders §49 exactly — Home, My Jobs, Technical
Tools, Plan Work, Record Work, Testing, Learning. `/my-jobs/inspection-required` → 200;
`/technical-tools/fault-code-search` → 200; the §34-only `/workshop-floor/repair-staging` → **404**.
The menu and the router moved together, which is the whole property at stake.

## 2. Codex findings — both confirmed

**C1 (MEDIUM) non-idempotent `workspaceForRole`** and **C2 (MEDIUM) page header contradicting its own
nav label.** Both verified against source and fixed; see the Codex record for the trace and the
reasoning behind each fix.

## 3. Defect found by this pass, not by Codex

### S1 (MEDIUM) — a role tree could silently drop a permission during transcription

Codex was asked directly whether role selection could reveal something it should not, and did not
answer. The realistic failure is not in the resolver — it is in the transcription. `07.txt` prints
"Invoices" as plain text with no mention of permissions, and the four trees are transcribed by hand,
one role at a time. A single omission publishes a finance screen to a role §50 says must not have it,
and every existing test would stay green: the item is *supposed* to be in that tree.

Added `every financial item in every role tree is permission-gated`, plus a vacuity guard so deleting
all finance items cannot make it pass. Manual cross-check confirms the trees are correct as written —
owner and reception finance items carry `finance.read`; manager and technician have no finance items,
matching §47 and §49.

## 4. A finding I rejected — recorded because rejecting it was the judgement call

The new guard failed on its first run with exactly one hit:
`reception: /vehicle-intake/issue-intake-receipt (Issue Intake Receipt)`.

**It is a false positive, and complying with it would have caused a real regression.** §48's "Issue
Intake Receipt" is the document proving the workshop took custody of the vehicle — not a payment
receipt. Gating it on `finance.read` would have hidden a core reception function from reception
staff, in order to satisfy a regex.

Handled with a named exception carrying its reason, rather than by loosening the pattern, so the
guard still fires for a genuine payment receipt. A second test asserts the exception still refers to
a live item, so a stale waiver cannot silently cover a future href that reuses the path.

This is the same discipline as the previous session's Tabs finding: *a test asserting the wrong
property will push a regression into correct code*. The failing test was the thing that was wrong.

## 5. Answers to the two questions Codex skipped

**Q1 — can the nav and the router still diverge?** No, on the evidence. Audited every call site that
resolves a workspace tree. The only two in production are `WorkspaceShell.tsx:69` and
`ModulePage.tsx:60`, and both compose `workspaceForRole(base, viewerRole(workspaceId))` identically.
The e2e helper composes the same pair, so it tests the tree the app actually renders. Storybook uses
raw `getWorkspace` deliberately — it is a component catalogue showing the workspace default, not the
app. `viewer.test.ts` additionally asserts the negative: a router still reading the default tree
*would* break, so the wiring cannot be quietly reverted without a red test.

**Q2 — does role accidentally grant anything?** No. `workspaceForRole` only swaps the group array;
`visibleGroups` still filters afterwards, and the composition order is asserted by
`ROLE SELECTS THE TREE, PERMISSIONS STILL FILTER IT`, which checks that the *owner* — the most
privileged role in §50 — still cannot see a finance item without the finance grant. The residual risk
was transcription, now covered by S1.

## 6. Known limitations — stated, not hidden

1. **Four of §50's eight roles have no tree** (supervisor, storekeeper, quality-control, cashier) and
   fall back to the workspace default. That is what the spec provides; inventing trees would be worse.
   Tracked, not silently absorbed.
2. **The role trees have no Storybook stories**, so they get no axe coverage *from Storybook*. They
   are covered by `a11y-workspaces`, which runs axe against the live workshop app — now serving the
   technician tree — so the coverage exists, just not in the component catalogue.
3. **`workshop` no longer exercises the gated-URL test** (skips rose 2 → 3), because §49's technician
   tree legitimately contains no permission-gated item. Five other workspaces still exercise it and
   `at least one workspace must exercise permission gating` enforces that it never reaches zero.
4. **`viewerRole()` is demo data**, exactly like `viewerGrants()`, and is replaced by validated
   Keycloak claims in Phase 2 (T-0005). Both are the one function to change.

## 7. Gates

| Gate | Result |
|---|---|
| typecheck | 14/14 |
| lint | 14/14 |
| unit tests | **79** (navigation 38, api 20, ui 12, next-shell 9) |
| build | 10/10 targets |
| Playwright, full suite | see the run recorded in the session handover |
| Live route check | §49 routes 200 · §34-only routes 404 · nav renders the technician tree |

**VERDICT: PASS WITH CORRECTIONS.** All corrections applied and re-verified.
