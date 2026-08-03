import * as React from 'react';
import { RoleSwitcher } from './RoleSwitcher';
import { setActiveRoleFromFormAction } from './set-role-action';
import { rolesFromMemberships } from './viewer-contract';
import type { ViewerDescription } from './viewer-contract';

/**
 * "Acting as …" — the ROLE half of the identity strip, in the top-RIGHT cluster.
 *
 * OWNER REQUEST 2026-08-03: "check that login user is the role that [must] show
 * at the top right". It did not. The active role was rendered in exactly one
 * place — the `<option>` text inside `RoleSwitcher` — and that control returns
 * `null` below two options, which is the state of every single-role account.
 * Six of the eight seeded identities hold one role, so six of eight had no way
 * to see what they were acting as, on any screen.
 *
 * ⚠️ THIS COMPONENT RENDERS THE SWITCHER **OR NOTHING**, and the "nothing" case
 * is deliberate rather than an omission: `TopNav` falls back to a read-only
 * `Role` chip built from `roleLabel`. That split mirrors the organisation
 * control exactly (`TopNav.tsx`: "the switcher REPLACES the chip when one is
 * supplied, rather than sitting beside it — two controls naming the same
 * organisation is how a user ends up unsure which one is authoritative"). The
 * role is therefore stated for EVERY signed-in viewer, and stated ONCE.
 *
 * ⚠️ NOT AN AUTHORIZATION CONTROL. Same rule as every other switcher here: the
 * options come only from memberships `/me` reported, and `resolveTenantContext`
 * re-validates the choice against memberships proved from the validated token,
 * REFUSING a role the viewer does not hold rather than downgrading to one they
 * do. Rendering fewer options protects nothing (CLAUDE.md §8).
 *
 * ⚠️ A SERVER COMPONENT WITH NO `'use client'`, like `ViewerSwitchers`. It
 * reads the viewer the layout already resolved and hands a server action to a
 * client component — the normal direction across the boundary. The reverse is
 * what returned "a server-side exception occurred" on every page in the app on
 * 2026-07-31 while typecheck, lint and `next build` were all green. After
 * changing this file, LOAD A PAGE.
 *
 * 🔴 **THAT IS NOT A STYLE CHOICE — THE CHIP FALLBACK DEPENDS ON IT.** Codex
 * raised this as a HIGH on 2026-08-03 and the reasoning is worth keeping even
 * though the finding was refuted by measurement: `TopNav` chooses with
 * `roleControl ?? <Selector …>`, and in PLAIN React a `<ActingAsControl />` JSX
 * element is a non-null object whatever the component returns — so `??` would
 * never fall through and a single-role viewer would see no role at all.
 *
 * It works because this is a SERVER component passed from a server layout to
 * the CLIENT `WorkspaceShell`: React renders it on the server and only its
 * OUTPUT crosses the boundary, so `roleControl` genuinely arrives as `null`.
 * Verified in a browser as six identities — `manager@`, holding exactly one
 * role and one organisation, renders both the "Acting as" chip and the
 * organisation chip (`verify-top-bar-identity.mjs`, 38/38).
 *
 * **Adding `'use client'` to this file would silently remove the role from the
 * top bar for every single-role viewer** — the exact defect this component was
 * built to fix, reintroduced by a one-line edit that breaks no test that does
 * not load a page. `verify-top-bar-identity.mjs`'s "stated EXACTLY ONCE" check
 * is what catches it. The same invariant governs `ViewerSwitchers`.
 */
export function ActingAsControl({ viewer }: { viewer: ViewerDescription | null }) {
  if (!viewer) return null;

  // ⚠️ SCOPED TO THE ACTIVE ORGANISATION. Every request sends `x-organization-id`
  // and `x-role-name` together and the API requires ONE membership matching
  // both, so a role held only in a different organisation is not a choice that
  // can be honoured — offering it would produce a pair the API refuses. See
  // `rolesFromMemberships`.
  const roles = rolesFromMemberships(viewer.memberships, viewer.organizationId);

  // One role is not a choice — fall through to the chip. Returning an empty
  // wrapper instead would still occupy the gap in the top bar AND suppress the
  // chip, which is how this whole defect looked like a styling problem.
  if (roles.length < 2) return null;

  return (
    <RoleSwitcher
      roles={roles}
      activeRole={viewer.activeRole}
      action={setActiveRoleFromFormAction}
    />
  );
}
