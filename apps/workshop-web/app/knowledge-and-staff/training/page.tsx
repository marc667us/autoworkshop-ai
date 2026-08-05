import { requireNavRoute } from '@autoworkshop/next-shell';
import { TrainingScreen } from '../../_screens/training-screen';

/**
 * `/knowledge-and-staff/training` - "Training". Slice 10 of `COMPLETION_PLAN.md`.
 *
 * The LIBRARY is built; the licensed corpus is what CLAUDE.md section 4 stages.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries NO route check unless it makes one
 * (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/knowledge-and-staff/training';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <TrainingScreen route={ROUTE} />;
}
