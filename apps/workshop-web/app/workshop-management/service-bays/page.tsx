import { requireNavRoute } from '@autoworkshop/next-shell';
import { ServiceBaysScreen } from '../../_screens/service-bays-screen';

/**
 * `/workshop-management/service-bays` — "Service Bays". Slice 2 of `COMPLETION_PLAN.md`.
 *
 * ONE screen at two routes. A bay is RETIRED, never deleted — past
 * appointments still refer to it and `core.service_bays` has no DELETE grant.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries no route check unless it makes one
 * (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/workshop-management/service-bays';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <ServiceBaysScreen route={ROUTE} />;
}
