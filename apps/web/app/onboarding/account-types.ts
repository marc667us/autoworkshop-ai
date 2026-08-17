import { workspaces } from '@autoworkshop/navigation';

/**
 * THE WAYS INTO AUTOWORKSHOP A PERSON MAY TAKE FOR THEMSELVES, AND WHAT EACH
 * ONE ACTUALLY GETS.
 *
 * ── 🔴 THESE ARE NOT "ACCOUNT TYPES", AND THE DISTINCTION IS LOAD-BEARING ────
 *
 * `PLAN_EXTENSION_v1` §2.1 defines a four-value ACCOUNT TYPE model — Car Owner,
 * Owner-Driver, Organization Transport Manager, Fleet Manager — which is
 * single-valued, not self-mutable, changed only by an administrative action
 * with an audit record, and which shapes verification and provisioning.
 *
 * NONE OF THAT IS BUILT. There is no `account_type` column, nothing verifies
 * one, and nothing stores the choice made on this screen. What this file lists
 * is something different and smaller: the four SELF-SERVICE REGISTRATION DOORS
 * that exist today. Naming them "account types" would advertise a model the
 * product neither stores nor verifies, and the next reader would build on top
 * of a foundation that is not there. (Codex raised exactly this, 2026-08-14.)
 *
 * The gap between the two is recorded in `docs/01-product/IDENTITY_GAPS.md`.
 *
 * ── 🔴 WHY THIS FILE IS A LIST OF FOUR AND NOT A LIST OF THIRTEEN ────────────
 *
 * `MembershipService.GRANTABLE_ROLES` names thirteen roles, but a role being
 * grantable says only that an existing owner may confer it. The question this
 * screen answers is different and much narrower: *which roles does a production
 * path WRITE for somebody who belongs nowhere yet?*
 *
 * Measured, not assumed — every `INSERT INTO identity.memberships` across all
 * 79 migrations in `infrastructure/migrations/` writes exactly four role
 * literals:
 *
 *     workshop_owner (036/037/071/072) · supplier_owner (068/069/071/072)
 *     fleet_administrator (075/076)    · customer (061)
 *
 * So four is not an editorial choice about what to show. It is the complete set
 * of doors that exist. Offering a fifth would be offering a button that cannot
 * work — the defect this repository has now recorded four separate times, most
 * recently `fleet_administrator`, whose 29 screens were deployed while
 * `POST /registration/fleet` answered 404.
 *
 * ⚠️ ADDING AN ENTRY HERE IS NOT HOW A NEW SELF-SERVICE ROLE IS CREATED. The
 * migration that writes the membership comes first; this list is the last step,
 * not the first. `account-types.spec.ts` asserts every `href` below is a route
 * this artifact actually serves, so a premature entry fails the build rather
 * than shipping as a dead end.
 *
 * ── PLAN_EXTENSION_v1 §2.1, WHICH GOVERNS THIS SCREEN ────────────────────────
 *
 * "The account type a user *selects* is a **request**, never a grant." Nothing
 * here grants anything: each entry is a LINK to a door that already exists, and
 * every one of those doors is a SECURITY DEFINER function whose role literal is
 * inside the migration and cannot be influenced by any argument. This module
 * exports no role name to any request body, deliberately — a `roleName` field
 * travelling from this screen to the API would be privilege escalation as a
 * REST call, which is the exact thing the four registration bodies are
 * `.strict()` to prevent.
 *
 * §2.1 also splits the four types by whether they confer authority over
 * somebody else's data. Car Owner is self-service because it confers none.
 * Workshop, supplier and fleet each create a NEW organisation with the chooser
 * as its only member, so they confer authority over nothing that existed
 * before — and the two that could be commercially misrepresented (supplier,
 * fleet) are enqueued for platform verification by 069/075 and stay
 * unpublished until a human approves. That is the "subject to approval" half of
 * §2.1, and it is already built.
 */

export interface AccountType {
  /** Stable id — used by the test and for analytics, never the label. */
  id: string;
  /** What the person calls themselves, not what the database calls them. */
  label: string;
  /** One line: is this me? */
  summary: string;
  /**
   * Where the door is. A route this artifact serves TODAY — asserted by
   * `account-types.spec.ts` against the real `app/` tree.
   */
  href: string;
  /** The call to action. */
  cta: string;
  /**
   * The role literal the migration writes, or `null` when the membership is
   * written later by a different act.
   *
   * ⚠️ DISPLAYED AND TESTED, NEVER SENT. It is here so the screen can be honest
   * about what the person becomes, and so `account-types.spec.ts` can assert
   * this list against the API's own allow-list. No request body carries it.
   */
  roleName: string | null;
  /**
   * The navigation groups this account type opens, read from the LIVE model.
   *
   * 🔴 DERIVED, NEVER TRANSCRIBED. A hand-written feature list is a second copy
   * of the navigation that drifts the first time a group is renamed, and the
   * person reading it is deciding what to become — being wrong here sends
   * somebody down the wrong door entirely. `packages/navigation` already holds
   * every group every workspace serves; this reads it.
   */
  features: readonly string[];
  /**
   * What happens after they choose, stated before they choose.
   *
   * A rule discovered by being refused reads as a bug — the reasoning already
   * written on `CreateWorkshopScreen`'s one-workshop notice.
   */
  caveat?: string;
}

/**
 * What a workspace visibly offers, in the order the sidebar shows it.
 *
 * Group labels normally — "My Vehicles · Service and Repairs · Payments" tells
 * somebody what the workspace is for at a glance.
 *
 * 🔴 EXCEPT WHEN THERE IS ONLY ONE GROUP, WHICH TOWING IS. `02.txt` §52 gives
 * towing a single `operations` group holding all ten of its screens, so the
 * group-label rule produced a one-word feature list reading "You get:
 * Operations" — technically derived from the model and useless to the person
 * deciding whether this is them. Caught by `account-types.spec.ts`, which
 * asserts a door lists more than two things; the assertion was arbitrary and
 * the failure was not.
 *
 * So a single-group workspace drops one level and lists its ITEMS instead. The
 * rule is "show the most specific level that has several entries", which is
 * true of any future tree without needing to know its shape.
 */
function groupsOf(workspaceId: keyof typeof workspaces): readonly string[] {
  const groups = workspaces[workspaceId].groups;
  if (groups.length === 1) {
    const only = groups[0];
    if (only) return only.items.map((i) => i.label);
  }
  return groups.map((g) => g.label);
}

/**
 * The workshop entry reads the OWNER's tree, not the workspace default.
 *
 * `workspaces.workshop.groups` is `01 (1).txt` §34, the tree shown to a member
 * whose role has not resolved yet. Somebody choosing "I run a workshop" becomes
 * `workshop_owner` specifically, and §46 is that role's own tree — which the
 * navigation model already holds under `roleGroups.owner`. Showing the default
 * would describe a workspace nobody who takes this door ends up in.
 */
function workshopOwnerGroupLabels(): readonly string[] {
  const owner = workspaces.workshop.roleGroups?.owner;
  // Falls back to the workspace default rather than to an empty list: an empty
  // feature list reads as "this account type does nothing", which is a worse
  // lie than a slightly less specific true one.
  return (owner ?? workspaces.workshop.groups).map((g) => g.label);
}

export const ACCOUNT_TYPES: readonly AccountType[] = [
  {
    id: 'vehicle-owner',
    label: 'I own a vehicle',
    summary:
      'Book repairs, follow the work on your car, approve quotations and keep your service history.',
    // 🔴 THE MARKETPLACE, NOT `/customer/home/dashboard`. MEASURED, AND THE
    // OBVIOUS TARGET IS THE WRONG ONE.
    //
    // `/customer` redirects to `/customer/home/dashboard` (`customer/page.tsx:25`),
    // and that dashboard's FIRST act is `apiGet('/vehicles')`
    // (`dashboard-screen.tsx:84`), which needs a tenant context. A person with
    // no membership cannot obtain one, so the screen renders `ApiFailure`
    // (`dashboard-screen.tsx:87`) — an error panel, shown to somebody who has
    // done nothing wrong, on the first screen after signing up.
    //
    // `/customer/marketplace` renders `MarketplaceLanding` from the PUBLIC
    // endpoints only (`marketplace/page.tsx:1-3`, `fetchStats`/`fetchFacets`/
    // `fetchParts`/`fetchMechanics`), so it works with no membership at all —
    // and it is where the workshops are, which is what this person needs next:
    // the `customer` membership is written by the request-service funnel once
    // they choose one. (Codex found this, 2026-08-14. I had written the
    // dashboard link.)
    href: '/customer/marketplace',
    cta: 'Find a workshop',
    // 🔴 NULL, AND THAT IS THE HONEST ANSWER RATHER THAN A GAP.
    //
    // The other three doors write a membership the moment you use them. This
    // one does not, and cannot: `POST /registration/customer` takes the
    // `organizationId` of a PUBLISHED workshop, because a `customer` membership
    // is a relationship WITH a workshop and there is no such thing as a
    // customer of nobody. `apps/web/app/customer/(app)/layout.tsx` is built for
    // exactly this person — its gate is "holds no CUSTOMER membership", not
    // "holds no membership", precisely so a parts buyer with none is admitted.
    //
    // So a vehicle owner gets the workspace immediately and the membership on
    // their first service request, which `request-service-actions.ts` writes by
    // calling the enrolment route before the request itself.
    roleName: null,
    features: groupsOf('customer'),
    // ⚠️ SAYS "CHOOSE A WORKSHOP FIRST" RATHER THAN "YOUR GARAGE IS READY",
    // because the garage genuinely is not ready yet — see the `href` note
    // above. Promising a working dashboard and delivering an error panel is
    // the worst version of this screen.
    caveat:
      'Nothing to register. Choose a workshop and request service, and your garage fills in from there — the repair, the quotation to approve, and the history.',
  },
  {
    id: 'workshop',
    label: 'I run a workshop',
    summary:
      'Take in vehicles, run job cards and the repair floor, quote customers, invoice, and add your staff.',
    href: '/workshop/home/dashboard',
    cta: 'Create my workshop',
    roleName: 'workshop_owner',
    features: workshopOwnerGroupLabels(),
    caveat:
      'One workshop per account, and you become its owner. To join a workshop that already exists, ask its owner to add you instead — you keep this same sign-in.',
  },
  {
    id: 'parts-supplier',
    label: 'I sell parts',
    summary:
      'List your catalogue on the marketplace, hold stock, and take orders from workshops.',
    href: '/supplier/home/dashboard',
    cta: 'Register my business',
    roleName: 'supplier_owner',
    features: groupsOf('supplier'),
    // Stated here as well as in the API response, because this is the screen
    // where the expectation is formed. Migration 069 leaves
    // `catalogue.suppliers.is_published` FALSE until a platform administrator
    // approves — a sign-up that quietly does half of what somebody expects is
    // worse than one that explains itself.
    caveat:
      'Your account works immediately. Your public marketplace listing appears once a platform administrator has verified the business.',
  },
  {
    id: 'fleet-operator',
    label: 'I manage a fleet',
    summary:
      'Track many vehicles, plan their servicing, approve spend and compare workshops.',
    href: '/fleet/home/dashboard',
    cta: 'Register my fleet',
    roleName: 'fleet_administrator',
    features: groupsOf('fleet'),
    caveat:
      'Your account works immediately. The fleet is queued for platform verification in the same way a supplier is.',
  },
  {
    id: 'insurance-company',
    label: 'I assess insurance claims',
    summary:
      'Review claims on vehicles being repaired, assess damage, and authorise repair work.',
    href: '/insurance/home/dashboard',
    cta: 'Register my company',
    // 085 — the founder is the company's ADMINISTRATOR, not one of its
    // assessors. This field documents "the role literal the migration writes",
    // so it must track migration 085's `register_insurer`; a stale value here
    // tells the person signing up they will become something they will not.
    roleName: 'insurance_owner',
    features: groupsOf('insurance'),
    // 🔴 THE TENANCY GUARANTEE, STATED WHERE THE DECISION IS MADE. Migration
    // 080 gives the company its own tenant precisely because an insurer and the
    // workshop whose repairs it assesses sit on opposite sides of a claim.
    // Somebody choosing this door is entitled to know that before choosing it.
    caveat:
      'Your company gets its own workspace, separate from every workshop on the platform. Queued for platform verification like a supplier or a fleet.',
  },
  {
    id: 'towing-company',
    label: 'I recover and tow vehicles',
    summary:
      'Take recovery requests, run a dispatch board, and manage your drivers and recovery vehicles.',
    href: '/towing/operations/dashboard',
    cta: 'Register my company',
    // 085 — the founder is the firm's ADMINISTRATOR. Same reasoning as the
    // insurance door above.
    roleName: 'towing_owner',
    features: groupsOf('towing'),
    // ⚠️ THE ONLY DOOR WHOSE WORKSPACE IS ALREADY FINISHED. Migration 074 built
    // all ten towing screens on 2026-08-09; only the door was missing. Said
    // plainly because every other caveat on this screen warns the opposite.
    caveat:
      'The towing screens are already built — dispatch board, recoveries, drivers and vehicles. Queued for platform verification like the others.',
  },
];

/**
 * The roles this screen deliberately does NOT offer, and the true reason for
 * each.
 *
 * 🔴 SHOWN TO THE USER RATHER THAN OMITTED. Somebody who came here to sign up
 * as an assessor and finds four unrelated choices concludes the product does
 * not serve them and leaves. Naming the route that DOES exist — "your workshop
 * owner adds you" — turns a dead end into an instruction, which is this
 * repository's standing rule about refusals.
 *
 * ⚠️ THIS COMMENT USED TO SAY THE OPPOSITE, AND IT WAS STALE FOR A DAY.
 * Corrected 2026-08-15. It read: "Measured: no migration writes
 * `insurance_assessor` or `towing_operator` ... nobody can become one", and
 * cited `docs/01-product/IDENTITY_GAPS.md`. Both statements are now false:
 * migration 080 built the insurance and towing registration functions on
 * 2026-08-14, an insurer was registered through this door on PRODUCTION during
 * the UAT the same day, and that document does not exist in the tree.
 *
 * 🔴 WHY THIS MATTERED ENOUGH TO WRITE DOWN. The standing rule in this
 * repository is "read the comment before filling the gap" — a comment that
 * documents a deliberate absence outranks a reader's instinct to close it. A
 * comment that is stale in THIS direction turns that rule into a weapon: the
 * next reader would have believed insurance registration was impossible and
 * might have "restored" these two entries to `NOT_SELF_SERVICE`, breaking a
 * door that works. The file also contradicted itself, because the note below
 * `NOT_SELF_SERVICE` recorded the move correctly the whole time.
 *
 * WHAT IS TRUE NOW: all four doors above are live and self-service. The list
 * below is only for roles that genuinely have no self-service path.
 */
export interface UnofferedRole {
  id: string;
  label: string;
  reason: string;
}

export const NOT_SELF_SERVICE: readonly UnofferedRole[] = [
  {
    id: 'workshop-staff',
    label: 'Workshop staff — technician, reception, supervisor, storekeeper, cashier, quality control, manager',
    reason:
      'Your workshop owner adds you from Settings → Staff and roles. Sign up here first with the email address they will use, then tell them it is ready.',
  },
  // ⚠️ `insurance_assessor` AND `towing_operator` USED TO BE LISTED HERE, with
  // the true reason that no path could create either. Migration 080 built both
  // doors, so they moved UP into `ACCOUNT_TYPES` above. Recorded rather than
  // silently deleted, because "which roles are not self-service, and why" is the
  // question this list exists to answer and its answer just changed.
  {
    id: 'platform-administrator',
    label: 'Platform administrator',
    reason:
      'Never self-service, by design. It is granted from a record held by the platform, and there is deliberately no route that lets an account award it to itself.',
  },
];
