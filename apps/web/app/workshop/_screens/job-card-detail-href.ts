import { withPackBase } from '@autoworkshop/navigation';
import type { RoleId } from '@autoworkshop/navigation';

/**
 * WHERE A JOB NUMBER LINKS TO, FOR THE ROLE LOOKING AT IT.
 *
 * 🔴 THIS FILE EXISTS BECAUSE A SINGLE HREF WOULD REFUSE MOST OF THE WORKSHOP.
 *
 * The fourteen job queues are spread across five navigation trees, and the
 * trees do not agree on where job cards live: §46 puts them at
 * `/workshop-operations/job-cards`, §34 and §47 at `/workshop-floor/job-cards`,
 * §49 gives the technician `/home/my-assigned-work` and no job-cards route at
 * all, and §48 gives reception neither. Every page in this app opens with
 * `requireNavRoute`, which asks whether THIS VIEWER'S TREE carries the route —
 * so a queue that linked every job number to one hardcoded path would hand a
 * technician and a receptionist a refusal on the primary action of the screen
 * they were just looking at.
 *
 * ⚠️ AND THE REFUSAL WOULD LOOK LIKE A BUG, NOT A RULE. `requireNavRoute` is a
 * correct, fail-closed gate; a link built without asking whose tree it is in
 * simply walks into it. That is the exact shape of the verification that lied
 * on 2026-08-02 — thirteen CORRECT refusals read as thirteen broken screens
 * because every route was driven as a platform administrator.
 *
 * ── WHY KEYED ON THE ROLE AND NOT ON THE CURRENT ROUTE ─────────────────────
 *
 * `/home/my-tasks` is carried by BOTH the manager and reception trees, so the
 * route the viewer is standing on does not identify the tree they resolved to.
 * `viewerRole()` does, and it is the same function the shell and the catch-all
 * router already use to pick the tree — so the link and the gate are decided by
 * one fact, not two that can disagree. This repo has shipped that disagreement
 * before (the nav advertised routes the router 404'd), and the fix was the
 * same: resolve once.
 *
 * ── THE FALLBACK IS THE DEFAULT TREE, DELIBERATELY ─────────────────────────
 *
 * TWO DIFFERENT ROUTES END UP ON THE §34 DEFAULT TREE, and they are not the
 * same mechanism — an earlier version of this comment collapsed them and was
 * simply wrong about `viewerRole`, which is the defect class this repository
 * has recorded three times. Corrected after Codex read it:
 *
 *   · `viewerRole()` returns UNDEFINED only for a role `ROLE_TO_NAV` does not
 *     map — `platform_administrator`, `customer`, or anything unrecognised.
 *     `workspaceForRole(ws, undefined)` then returns the default tree.
 *   · `workshop_supervisor`, `storekeeper`, `quality_control_inspector` and
 *     `cashier` DO map, to real `RoleId`s. They reach the default tree by a
 *     different door: `07.txt` pt2 defines trees for only four roles, so
 *     `workspace.roleGroups` has no entry for these four and
 *     `workspaceForRole` falls back to `workspace.groups`.
 *
 * Either way the viewer is looking at the §34 tree, which carries
 * `/workshop-floor/job-cards` — so all five cases point there. The four mapped
 * roles are listed explicitly below rather than left to the `undefined`
 * fallback, so that giving one of them its own tree later is a compile-visible
 * decision instead of a silent inheritance.
 */
export const JOB_CARD_LIST_HREF: Readonly<Record<RoleId, string>> = Object.freeze({
  // §46 — the owner's tree files job cards under Workshop Operations.
  owner: '/workshop-operations/job-cards',
  // §47 — the manager's tree uses the Workshop Floor group, as §34 does.
  manager: '/workshop-floor/job-cards',
  /**
   * §48 — reception has NO job-card list route anywhere in its tree; its only
   * job-card-bearing entry is the `/home/my-tasks` queue. So that queue is the
   * parent, and the detail route hangs off it.
   *
   * ⚠️ NOT AN OVERSIGHT TO BE "FIXED" BY ADDING `/workshop-floor/job-cards` TO
   * §48. That would be a change to approved navigation, which `05.txt` §2
   * prohibits without review. Hanging a detail route off the entry the spec
   * DOES give reception keeps the menu exactly as approved.
   */
  reception: '/home/my-tasks',
  // §49 — the technician's list is "My Assigned Work"; the service narrows it
  // to their own cards, so it is the job-card list *for them*.
  technician: '/home/my-assigned-work',
  // The four roles below have no tree of their own and fall back to §34.
  supervisor: '/workshop-floor/job-cards',
  storekeeper: '/workshop-floor/job-cards',
  'quality-control': '/workshop-floor/job-cards',
  cashier: '/workshop-floor/job-cards',
});

/** The §34 default tree's job-card list — where every treeless role lands. */
export const DEFAULT_JOB_CARD_LIST_HREF = '/workshop-floor/job-cards';

/**
 * The list route this viewer may actually reach.
 *
 * `Object.hasOwn`, not `map[role] ?? default`: a string that is not a role
 * resolves up the prototype chain (`'constructor'` returns the `Object`
 * function, which is truthy, so `??` never fires). That precise bug shipped in
 * `permissionsForRole` and is written down in the handover; it is cheap to not
 * repeat it.
 */
export function jobCardListHrefFor(role: RoleId | undefined): string {
  // 🔴 ADR-021 — MOUNTED ON THE WAY OUT, AND THIS WAS A REAL DEFECT, NOT A TEST
  // EXPECTATION. The map above transcribes the spec's routes, exactly as
  // `workspaces.ts` does, and `jobCardDetailHref` builds `${list}/${id}` from
  // it. Unmounted, every job-card detail link in the workshop pack pointed at
  // `/workshop-floor/job-cards/<id>` — a path the artifact does not serve — so
  // opening a job card from any list would have 404'd for all nine roles.
  //
  // Typecheck, lint and the build were all green over it: a string is a string.
  // The spec caught it because it compares these against the viewer's ACTUAL
  // reachable hrefs rather than against another copy of the same literals.
  const href = !role
    ? DEFAULT_JOB_CARD_LIST_HREF
    : Object.hasOwn(JOB_CARD_LIST_HREF, role)
      ? JOB_CARD_LIST_HREF[role]
      : DEFAULT_JOB_CARD_LIST_HREF;
  return withPackBase('workshop', href);
}

/**
 * The detail route for one card, for this viewer.
 *
 * The id is encoded because it reaches the URL. It is a UUID from our own API
 * today and `ParseUUIDPipe` refuses anything else server-side, so this is belt
 * and braces rather than the control — but a link builder that trusts its input
 * is how the next id format quietly becomes an injection point.
 */
export function jobCardDetailHrefFor(role: RoleId | undefined, id: string): string {
  return `${jobCardListHrefFor(role)}/${encodeURIComponent(id)}`;
}
