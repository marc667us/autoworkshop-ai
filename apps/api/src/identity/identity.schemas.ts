import { z } from 'zod';
import { optionalText, requiredText, uuid } from '../common/validation/validated-body';

/**
 * Request schemas for branches and memberships.
 *
 * 🔴 THE MEMBERSHIP ENDPOINT IS THE SHARPEST ONE IN THE API. `grant` decides
 * WHO HOLDS WHICH ROLE, and `role_name` has no CHECK constraint in the database
 * — recorded on 2026-08-01, when the Supervisor confirmed that
 * `identity.memberships` constrains `status` and not `role_name`, so an
 * arbitrary role string is insertable. The authorization layer then maps an
 * unknown role to no permissions, which fails safe; but a typo'd role silently
 * grants nothing while looking granted, and there is no barrier at all against
 * junk accumulating in the column.
 *
 * `roleName` is therefore validated as a bounded, shaped string here. It is
 * deliberately NOT an enum of the eight known roles: `ROLE_TO_NAV` maps eight
 * while only four navigation trees exist, that mapping is still in flux, and a
 * ninth list to keep in step is how the last navigation defect was born. The
 * authoritative check stays where the permissions live.
 *
 * `status` IS enumerated, because the database enumerates it too and the pair
 * is small, closed and already stable.
 */

export const CreateBranchBody = z.object({
  organizationId: uuid(),
  name: requiredText(200),
  location: optionalText(300),
  operatingHours: optionalText(300),
});
export type CreateBranchBody = z.infer<typeof CreateBranchBody>;

/**
 * 🔴 `userEmail` EXISTS BECAUSE `userId` MADE THIS ROUTE UNREACHABLE.
 *
 * `grant` took a uuid, and the only way to discover one is `GET /users` — which
 * is driven FROM `identity.memberships`, so it lists people who are ALREADY
 * members. There was therefore no path, from any screen that could exist, to
 * add somebody new: the platform's privilege-granting operation had no
 * reachable caller. Exactly the shape that made Solar's third-level approval
 * unreachable, and the repo's own rule — a rule whose escape hatch is
 * unreachable is a wall, not a rule.
 *
 * ⚠️ AN EMAIL, NOT A SEARCH ENDPOINT, AND THAT IS THE SECURITY CHOICE. A
 * `GET /users?q=` lookup would be an enumeration oracle over every account on
 * the platform. Resolving the address inside `grant` means the only thing a
 * caller learns is whether ONE address they already typed has an account — and
 * only if they already hold a role permitted to grant memberships in this
 * tenant. No listing, no prefix matching, nothing to harvest.
 */
export const GrantMembershipBody = z.object({
  userId: uuid().optional(),
  userEmail: z.string().trim().email('must be an email address').optional(),
  organizationId: uuid(),
  // ⚠️ Nullable AND optional: absent means "no branch", and an explicit null
  // is how the UI clears one. Collapsing them would change the meaning of a
  // membership that is organization-wide.
  branchId: uuid().nullable().optional(),
  roleName: z
    .string()
    .trim()
    .min(1, 'is required')
    .max(60, 'must be 60 characters or fewer')
    // Lower snake case is what every role in this system is written as. This
    // rejects whitespace, punctuation and casing mistakes that would otherwise
    // become a permanent row granting nothing.
    .regex(/^[a-z][a-z0-9_]*$/, 'must be lower_snake_case'),
})
  // EXACTLY ONE of the two. Both optional individually would let a caller send
  // neither and reach the service with nothing to resolve; sending BOTH would
  // leave the service picking a winner, which is a silent disagreement about
  // WHO is being granted access on the platform's privilege-granting route.
  .refine((b) => Boolean(b.userId) !== Boolean(b.userEmail), {
    message: 'send exactly one of userId or userEmail',
    path: ['userEmail'],
  });
export type GrantMembershipBody = z.infer<typeof GrantMembershipBody>;

/**
 * Withdrawing a membership.
 *
 * Enumerated because the migration enumerates it: `identity.memberships.status`
 * carries a CHECK of active/suspended/revoked, and this endpoint may only move
 * a membership to the latter two. Sending 'active' here would be a
 * REINSTATEMENT dressed as a withdrawal, so it is refused by name.
 */
export const WithdrawMembershipBody = z.object({
  status: z.enum(['suspended', 'revoked']),
});
export type WithdrawMembershipBody = z.infer<typeof WithdrawMembershipBody>;
