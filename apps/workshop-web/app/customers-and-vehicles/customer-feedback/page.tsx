import { requireNavRoute } from '@autoworkshop/next-shell';
import { CustomerFeedbackScreen } from '../../_screens/customer-feedback-screen';

/**
 * `/customers-and-vehicles/customer-feedback` — "Customer Feedback". Slice 2 of `COMPLETION_PLAN.md`.
 *
 * Reviews cannot be edited or deleted (`trg_feedback_rewrite` fires on UPDATE
 * *and* DELETE). The only later write is the workshop's single reply.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries no route check unless it makes one
 * (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/customers-and-vehicles/customer-feedback';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <CustomerFeedbackScreen route={ROUTE} />;
}
