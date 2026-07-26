# Supervisor adjudication — Phase 3 application shell (Release 0.2)

**Date:** 2026-07-26
**Change:** Phase 3 shell — navigation model, shared Next adapter, UI components, runtime theming,
responsive behaviour, AI assistant panel.
**Reviewer:** Codex CLI (two passes) · **Adjudicator:** Supervisor
**Owner direction in force:** Codex is the reviewer; the Supervisor adjudicates. Codex findings are
verified against source before acceptance — it is not infallible.

## Method

Every Codex finding was checked by opening the cited file and reading the surrounding code, then —
where the claim was about behaviour — by serving the production build and exercising it with `curl`.
Findings are not accepted on assertion. Fixes are not reported as done without a runtime check.

## Pass 1 — 3 findings, all accepted

| # | Codex severity | Verdict | Notes |
|---|---|---|---|
| 1 | High | **CONFIRMED — understated** | `renderModulePage` resolved against `workspace.groups`, not the grant-filtered tree, so any permission-gated module rendered by URL. Worse than reported: the placeholder **printed the required permission name**, publishing the authorization taxonomy, and the page text claimed "permissions for this screen are working" while checking none. |
| 2 | Medium | **ACCEPTED — not a code defect** | Staged/working tree divergence was an artefact of the Supervisor working in parallel with the review. Resolved by staging the full surface. |
| 3 | Medium | **CONFIRMED** | Every right-hand top-nav control was focusable and inert — `Create`, `Tasks`, `Messages`, `Notifications`, `Help` rendered live with count badges and no handler, and the `Selector` chips rendered as menu buttons with a caret and no menu. The TopNav docstring simultaneously claimed "none of them silently no-op without saying so". |

### Fixes and their verification

1. Resolves via `visibleGroups(workspace, grants)`; `grants` defaults to `[]` (fail closed); no
   permission names printed; copy corrected.
   **Verified live:** gated URL → 404, ungated → 200, nonsense → 404.
2. Full surface staged.
3. Actions without `onSelect` render `disabled` with ", not available yet" in the accessible name;
   the workspace/org/branch/user indicators render as plain text with no button role; the AI action
   is genuinely wired to a drawer.
   **Verified live:** 5 disabled controls present, AI action enabled, zero `aria-haspopup`.

## Found by the Supervisor, after Codex's pass — the reviewer missed these

| # | Severity | Finding |
|---|---|---|
| S1 | **High** | The navigation and the router disagreed about who the viewer is. The 7 `layout.tsx` files passed a hardcoded grants array while the catch-all passed none, so the workshop nav advertised `/finance-and-warranty/invoices` and that URL 404'd. **This was introduced by the fix for Codex finding 1** — fixing the route in isolation created a second source of truth. Both now read `viewerGrants()`. Locked by `packages/next-shell/src/viewer.test.ts`, which asserts the property (everything advertised resolves), not the symptom. |
| S2 | Medium | `ThemeToggle` declared `role="radiogroup"` over three `role="radio"` buttons with no roving tabindex and no arrow-key handling — three tab stops where the ARIA pattern promises one. Now a roving tabindex with Arrow/Home/End. **Verified live:** exactly one `tabindex="0"`, two `tabindex="-1"`. |

## Pass 2 — 3 findings, all accepted

Codex was given the fixes plus the new, previously unreviewed components (Tabs, Dialog, Drawer,
AiAssistantPanel, `useFocusTrap`, `useMediaQuery`).

| # | Codex severity | Verdict | Notes |
|---|---|---|---|
| 4 | P1 | **CONFIRMED** | The assistant `Drawer` was rendered as a sibling of the shell's flex row, not inside it. Its non-modal (desktop) form is a sticky `<aside>` intended as a flex child, so on desktop it fell **below** the page as a full-width block instead of sitting beside it — still visible, so it would survive a screenshot, but no longer a side panel, which is the one thing `02.txt` §8 specifies. Moved inside the row. |
| 5 | P2 | **CONFIRMED** | `useFocusTrap`'s effect depended on `onClose`, and every caller passes an inline arrow. Any parent re-render while a surface was open tore down and rebuilt the trap — and teardown restores focus to the opener, so focus jumped out of an open dialog mid-interaction. Fixed **in the hook** via a ref rather than by asking callers to memoize: a hook whose correctness depends on callers remembering to `useCallback` will be used wrongly. The same defect in `Drawer`'s non-modal Escape listener was fixed at the same time. |
| 6 | P2 | **CONFIRMED** | Only the selector cluster hid below 1024px; brand, search, six actions, the three-button theme control and the user chip stayed in a single non-wrapping header — roughly 30rem of content in a 22.5rem viewport. Added a phone treatment: secondary actions, theme control, user chip and wordmark step aside below 768px; search keeps a minimum width. **Stopgap, and recorded as one** — the correct answer is a "More" sheet, which cannot be built until the §9-§14 panels it would contain exist. |

## Gates at adjudication

| Gate | Result |
|---|---|
| `pnpm typecheck` | 13/13 |
| `pnpm lint` | 13/13 |
| `pnpm test` | **64 tests** (api 20 · navigation 27 · ui 12 · next-shell 5) |
| `pnpm build` | 9/9 — all 7 apps + API + Storybook compiled |
| Runtime | Production build served and exercised; routing, permission filtering, disabled-control semantics and roving tabindex all confirmed in rendered HTML |
| Paid dependency | None introduced. `vitest` added to two packages — FOSS, already in the workspace |

## The pattern worth carrying forward

Every defect in this change — the permission hole, the inert controls, the nav/router disagreement,
the drawer placement, the focus-trap thrash — passed typecheck, lint, the full unit suite and a
seven-app production build while broken. Two of them were introduced *by fixes for other findings*.

Gates prove the code compiles and that what is asserted holds. They do not prove the thing works.
Build it, run it, and look at it.

**SUPERVISOR VERDICT: PASS** — all six Codex findings and both Supervisor findings resolved and
verified. Remaining Phase 3 scope (Storybook stories, Playwright + axe-core, the §9-§14 panels and
the switchers) is tracked in `.claude/TASK_QUEUE.md`, not silently dropped.
