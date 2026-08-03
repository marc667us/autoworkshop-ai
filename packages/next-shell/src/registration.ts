import { cache } from 'react';
import { apiGet } from './api';

/**
 * DO I BELONG TO A WORKSHOP YET?
 *
 * ⚠️ THIS EXISTS BECAUSE `/me` CANNOT ANSWER IT. `/me` is behind `TenantGuard`,
 * which resolves exactly one organisation and refuses a caller with no
 * membership — so for somebody who has just signed up through Keycloak it 401s.
 * At the network layer that is indistinguishable from an expired session, and
 * the shell's honest reaction to an expired session is to offer Sign in. A
 * person who signed up thirty seconds ago would be sent back to the login page
 * they had just come from, forever.
 *
 * `/registration/status` is on `UserGuard`, which proves who you are without
 * resolving a tenant, and returns 200 with `hasWorkshop: false`. It is not a
 * failure to be new.
 *
 * ── WHAT THIS IS NOT ───────────────────────────────────────────────────────
 *
 * NOT a security control, like everything else in this package. It decides
 * which door the UI admits exists. The API and RLS deny independently:
 * `register_workshop` refuses a caller who already belongs to an organisation
 * whatever this returns, and every workshop route still needs a membership.
 */

export interface RegistrationStatus {
  userId: string;
  /**
   * The person's name — the ONLY way `customer-web` can learn it.
   *
   * `/me` is behind TenantGuard and 401s for a viewer with no membership, and
   * in customer-web that viewer is not an edge case: a vehicle owner buying a
   * filter never joins a workshop. Without this the shell had no name for them
   * and rendered "Not signed in" beside a working "Sign out", permanently, to
   * exactly the people the VIN funnel converts.
   */
  displayName?: string;
  hasWorkshop: boolean;
  organizations: Array<{ organizationId: string; roleName: string }>;
}

/**
 * Deduplicated per request, for the same reason `fetchViewer` is: a layout and
 * a page both asking would otherwise make two round trips that could disagree
 * — and disagreeing here means the shell renders onboarding around a real
 * dashboard, or the reverse.
 */
const fetchStatus = cache(
  async (workspaceId: string): Promise<RegistrationStatus | null> => {
    const result = await apiGet<RegistrationStatus>(workspaceId, '/registration/status');
    return result.ok ? result.data : null;
  },
);

/**
 * `null` when the question could not be answered — no session, or the API is
 * unreachable.
 *
 * ⚠️ NULL IS NOT "NO WORKSHOP", and callers must not collapse the two. An API
 * outage would otherwise show every existing workshop owner an invitation to
 * create the workshop they already have — and if they accepted it, the API
 * would correctly refuse with a 409 they did nothing to deserve. Fail to
 * "unknown", never to "new".
 */
export async function registrationStatus(
  workspaceId: string,
): Promise<RegistrationStatus | null> {
  return fetchStatus(workspaceId);
}

/**
 * Should this viewer be shown the "create your workshop" flow?
 *
 * True ONLY when we positively know they hold no workshop. Both other states —
 * they have one, or we could not tell — render the application as usual, so an
 * unreachable API degrades to the existing "figures could not be loaded"
 * behaviour rather than to an onboarding wall.
 */
export function needsWorkshop(status: RegistrationStatus | null): boolean {
  return status !== null && status.hasWorkshop === false;
}
