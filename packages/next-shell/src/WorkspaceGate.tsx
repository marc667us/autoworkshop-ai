import * as React from 'react';
import { PageHeader, EmptyState } from '@autoworkshop/ui';
import type { PermissionKey } from '@autoworkshop/navigation';
import type { ViewerDescription } from './viewer-contract';

/**
 * A workspace-wide access gate, applied in the LAYOUT — T-0005 finding 4.
 *
 * THE HOLE IT CLOSES. Before this, the only thing standing between a viewer and
 * a platform-administration screen was `renderModulePage()` resolving the route
 * against the grant-FILTERED navigation tree and calling `notFound()`. That works
 * for exactly as long as every route goes through the catch-all — and Next
 * resolves a concrete `app/<group>/<item>/page.tsx` AHEAD of `app/[...slug]`.
 * So the first real screen built in `admin-web` would have silently had no gate
 * at all, and `apps/admin-web/middleware.ts` says in its own comment that it
 * "does NOT gate access". The protection would have disappeared at precisely the
 * moment there was something worth protecting.
 *
 * WHY THE LAYOUT. It wraps every route in its segment, concrete and catch-all
 * alike, and no Next precedence rule lets a page escape it.
 *
 * ⚠️ BUT IT IS A DISPLAY GATE ONLY, AND THAT WAS MEASURED, NOT ASSUMED. An
 * earlier revision of this comment claimed the layout "prevents execution, not
 * merely display", reasoning that `children` is an unrendered element a layout
 * can decline to render. **That is false.** A probe page that logs when its
 * server component runs, requested by a signed-out visitor on a fresh build:
 *
 *   · rendered DOM        — only the denial below. Correct.
 *   · RSC flight payload  — CONTAINED THE PROBE PAGE'S RENDERED OUTPUT.
 *   · server console      — the probe's server component EXECUTED.
 *
 * Next renders the matched page segment regardless of whether the layout puts
 * `children` in its own output, and ships the result to the browser where the
 * DOM never shows it. A page that queried a database would have queried it.
 *
 * So this gate stops ENUMERATION and gives an honest message; it does not
 * protect a page's data or side effects. `requireWorkspaceAccess()` in
 * `require-access.ts` is what does, called by the page itself and enforced by
 * `scripts/guardrails/check-page-gates.mjs`. Both are kept: this one covers the
 * catch-all and the chrome, that one covers each concrete page.
 *
 * ⚠️ NEITHER IS THE CONTROL. CLAUDE.md §8: "Hidden ≠ secure." The API's
 * `TenantGuard` and Postgres RLS deny independently, and every screen must still
 * be safe if both of these were deleted.
 */

/**
 * Does the viewer hold the grant this workspace requires?
 *
 * PURE, and separated from the denial UI on purpose — the same split as
 * `viewer-contract.ts` (pure) beside `viewer.ts` (server). This is the security
 * decision, so it must be assertable without a React renderer, a DOM or a Next
 * runtime; a check that can only be exercised by rendering a page is a check
 * that stops being exercised.
 *
 * Fails closed on every uncertain input: no viewer, an empty grant list, or a
 * viewer whose grants do not include the key. There is deliberately no
 * "undefined means allow" branch — that shape is how a gate quietly becomes a
 * no-op during a refactor with no test noticing. Membership is exact-match:
 * `platform.admin.readonly` is NOT `platform.admin`, and substring matching here
 * would be an authorization bypass.
 */
export function hasWorkspaceAccess(
  viewer: ViewerDescription | null,
  requiredGrant: PermissionKey,
): boolean {
  return !!viewer && viewer.permissions.includes(requiredGrant);
}

/**
 * What to render in place of `children` when the gate refuses.
 *
 * The two denials are told apart because the remedies differ and one message
 * would be wrong for one of them: "sign in" to someone already signed in reads
 * as a broken app, and "you do not have access" to a signed-out visitor hides
 * the fact that signing in is the entire answer.
 */
export function WorkspaceAccessDenied({ signedIn }: { signedIn: boolean }) {
  return (
    <>
      {signedIn ? (
        <>
          <PageHeader
            title="You do not have access to this workspace"
            description="Your account does not hold the permission this area requires."
          />
          {/* Names no permission key and lists no screens. The viewer failed the
              check, so telling them what would have passed it publishes the
              authorization model to exactly the person who should not have it. */}
          <EmptyState
            title="Nothing here is available to your account"
            description="If you believe this is wrong, ask an administrator to review your role and branch assignment. Access is granted through membership, not by request to this page."
          />
        </>
      ) : (
        <>
          <PageHeader
            title="Sign in to continue"
            description="This workspace is only available to signed-in users."
          />
          <EmptyState
            title="You are not signed in"
            description="Use the Sign in control in the top bar. You will return here afterwards."
          />
        </>
      )}
    </>
  );
}
