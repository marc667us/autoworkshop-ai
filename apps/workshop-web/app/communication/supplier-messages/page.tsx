import { requireNavRoute } from '@autoworkshop/next-shell';
import { MessagesScreen } from '../../_screens/messages-screen';

/**
 * `/communication/supplier-messages` — "Supplier Messages". Slice 7 of `COMPLETION_PLAN.md`.
 *
 * ONE screen, filtered by `thread_kind`. `07.txt` gives each role its own tree
 * and they disagree about where messages live; six separate screens would have
 * meant six places for the same defect.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries NO route check unless it makes one
 * (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/communication/supplier-messages';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <MessagesScreen route={ROUTE} kind="supplier" />;
}
