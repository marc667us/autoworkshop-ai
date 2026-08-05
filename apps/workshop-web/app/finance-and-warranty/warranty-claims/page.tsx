import { requireNavRoute } from '@autoworkshop/next-shell';
import { WarrantyClaimsScreen } from '../../_screens/warranty-claims-screen';

/**
 * `/finance-and-warranty/warranty-claims` — "Warranty Claims". Slice 5 of `COMPLETION_PLAN.md`.
 *
 * "It has gone again." Every assessment and decision is an append-only EVENT
 * and the whole trail is shown — a screen showing only the latest status would
 * hide the difference between a decision and a rewrite.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries no route check unless it makes one
 * (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/finance-and-warranty/warranty-claims';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <WarrantyClaimsScreen route={ROUTE} />;
}
