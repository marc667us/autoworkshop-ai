import { requireNavRoute } from '@autoworkshop/next-shell';
import { ProposalQueueScreen } from '../../_screens/proposal-queue-screen';

/**
 * `/solution-and-approval/approvals` — the customer-proposal queue.
 *
 * SLICE 0 (2026-08-05) — A RE-MOUNT, NOT A NEW FEATURE. This route used to
 * render a signposted "what you can do instead" screen. Nothing new was built to
 * make it real: the screen, its API and its permissions already existed, and the
 * route was simply not mounted in the tree that advertises it. Sixteen routes
 * were in that state — one capability wearing four different names across §34,
 * §46, §47 and §48.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and carries no route check unless it makes one
 * (T-0005 finding 4). A role whose tree lacks this entry still gets a 404.
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/solution-and-approval/approvals';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <ProposalQueueScreen route={ROUTE} />;
}
