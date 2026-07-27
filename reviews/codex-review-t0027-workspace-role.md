# Codex review — T-0027 workspace × role navigation

**Date:** 2026-07-27
**Reviewed:** `packages/navigation/src/{types,workspaces,resolve,index,resolve.test}.ts`,
`packages/next-shell/src/{viewer,viewer.test,WorkspaceShell,ModulePage}.*`,
`apps/e2e/tests/shell-journey.spec.ts`, `apps/workshop-web/app/home/dashboard/page.tsx`
**Exit:** 0

## Findings as returned

> **Medium:** `resolve.ts:41` — `workspaceForRole()` returns a shallow-copied workspace with `groups`
> replaced but leaves `roleGroups` attached. That makes the helper non-idempotent:
> `workspaceForRole(workspaceForRole(workshop, 'technician'), 'supervisor')` falls back to the
> technician tree, not the workspace default. The function's stated fallback contract is therefore
> only true when callers pass the original workspace object.
>
> **Medium:** `page.tsx:64` — the role-specific nav can advertise `/home/dashboard` as "Technician
> Dashboard", but the concrete route still renders a generic "Workshop Dashboard" page. Because this
> route bypasses the catch-all, the new role tree label and the page header/content diverge for the
> demo technician role selected in `viewer.ts:88`.

## Adjudication — both CONFIRMED, both fixed

**C1 — non-idempotent `workspaceForRole`. CONFIRMED.** Traced by hand: the inner call returns
`{...workspace, groups: technicianGroups, roleGroups: {…}}`; the outer call then evaluates
`roleGroups['supervisor'] ?? groups`, and since supervisor has no tree it falls back to `groups`,
which is by then the *technician* tree. So a supervisor would have been shown the technician's
navigation under their own role's name. Nothing double-applies today, so this was latent — but the
docstring claimed a fallback to "the workspace default" that was only true on first application, and
a comment that is true only sometimes is worse than none.

Fixed by **dropping `roleGroups` from the resolved workspace** rather than by documenting the
constraint. The returned object is a resolved view for one role, and a resolved view has no business
carrying the menu of alternatives it was chosen from — anything holding it could re-derive a
different role and reintroduce precisely the nav/router divergence this design exists to prevent.
Second application is now a no-op instead of a surprise. Locked by
`is idempotent, and a resolved view cannot be re-resolved to another role`.

**C2 — page header contradicts its own nav label. CONFIRMED.** Verified in source: the technician
tree names `/home/dashboard` "Technician Dashboard" (`workspaces.ts:708`) while the concrete route
hardcoded `title="Workshop Dashboard"`. A concrete `page.tsx` takes precedence over the catch-all, so
this route was the one place the heading was written by hand — and the menu, the breadcrumb and the
heading named the same screen two different ways.

Fixed by deriving the title from the nav item that points at the route, which removes the second
source instead of synchronising it. This is the third instance in two days of hand-written copy going
false when the model beneath it moved; the other two were on this same page.

**Credit where due:** both findings are real, and C1 in particular is a latent-bug catch that no test
in the suite would have surfaced, because nothing currently double-applies the helper.

## What Codex did not do — third consecutive pass

1. **It did not answer question 1** (can the nav and router still diverge?) explicitly, though the
   prompt said it must.
2. **It did not answer question 2** (does role accidentally grant anything?) explicitly, though the
   prompt said it must. The Supervisor pass answered both and found a third defect there.
3. **It emitted no `VERDICT:` line**, required verbatim. Third review running.
4. It reported nothing on transcription fidelity (question 3), test quality (question 5) or the
   module-scope evaluation question (question 4), and did not say it had checked them — so those
   sections are "not checked", not "clean".
