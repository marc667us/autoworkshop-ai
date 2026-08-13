import { requireNavRoute } from '@autoworkshop/next-shell';
import { SecuritySettingsScreen } from '../../_screens/security-settings-screen';

/**
 * `/settings/security` — "Security". Slice 6 of `COMPLETION_PLAN.md`.
 *
 * Administrative access, recent refusals, and whether the database's own isolation is forced.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries NO route check unless it makes one
 * (T-0005 finding 4). Without this line, giving a route a real screen would
 * quietly make it reachable by a role whose tree does not contain it.
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/settings/security';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <SecuritySettingsScreen route={ROUTE} />;
}
