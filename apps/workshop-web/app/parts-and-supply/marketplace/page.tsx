import { requireNavRoute } from '@autoworkshop/next-shell';
import { PartsMarketplaceScreen } from '../../_screens/parts-marketplace-screen';

/**
 * `/parts-and-supply/marketplace` — "Marketplace". Slice 4 of `COMPLETION_PLAN.md`.
 *
 * The public parts marketplace, reached from inside the workshop. It is the
 * SAME catalogue an anonymous visitor sees — a second, private one would
 * eventually disagree with it.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries no route check unless it makes one
 * (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/parts-and-supply/marketplace';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <PartsMarketplaceScreen route={ROUTE} />;
}
