import { requireNavRoute } from '@autoworkshop/next-shell';
import { ProfileScreen } from '../../../_screens/profile-screen';

/**
 * /settings/profile — a REAL screen, not a planned one: `GET /me` already
 * returns the identity the API resolved from the validated token.
 *
 * Read-only on purpose — Keycloak is authoritative for name and email and
 * reconciles them on every sign-in, so an edit form here would be silently
 * overwritten. See `profile-screen.tsx`.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireNavRoute('customer', '/settings/profile');
  return <ProfileScreen />;
}
