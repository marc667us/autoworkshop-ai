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

/** The group labels of a workspace, in the order the sidebar shows them. */
function groupsOf(workspaceId: keyof typeof workspaces): readonly string[] {
  return workspaces[workspaceId].groups.map((g) => g.label);
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
 * ⚠️ THE INSURANCE AND TOWING LINES ARE NOT "COMING SOON" COPY. Measured: no
 * migration writes `insurance_assessor` or `towing_operator`, and
 * `POST /organizations` (`organization.service.ts:16`) can only create an
 * `insurance_company` or `towing_company` INSIDE the caller's existing tenant.
 * There is therefore no path that creates an independent insurer or towing
 * firm at all — the packs are deployed and their navigation is transcribed,
 * but nobody can become one. That is a real gap in the product, recorded in
 * `docs/01-product/IDENTITY_GAPS.md`, not a flaw in this screen.
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
  {
    id: 'insurance-assessor',
    label: 'Insurance assessor',
    reason:
      'There is no sign-up for insurers yet. The screens exist but no way to create an insurance company does, so this cannot be offered honestly.',
  },
  {
    id: 'towing-operator',
    label: 'Towing operator',
    reason:
      'There is no sign-up for towing firms yet, for the same reason as insurance.',
  },
  {
    id: 'platform-administrator',
    label: 'Platform administrator',
    reason:
      'Never self-service, by design. It is granted from a record held by the platform, and there is deliberately no route that lets an account award it to itself.',
  },
];
