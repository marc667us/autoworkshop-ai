import { requireNavRoute } from '@autoworkshop/next-shell';
import { IntakeReceiptScreen } from '../../_screens/intake-receipt-screen';

/**
 * `/vehicle-intake/issue-intake-receipt` — slice 1 of `COMPLETION_PLAN.md`.
 *
 * The customer's written acknowledgement that the workshop has their vehicle,
 * and the natural pair to the condition inspection: one records the state, this
 * one hands it to the person who owns the car.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries no route check unless it makes one
 * (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/vehicle-intake/issue-intake-receipt';

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireNavRoute('workshop', ROUTE);
  return <IntakeReceiptScreen route={ROUTE} searchParams={await searchParams} />;
}
