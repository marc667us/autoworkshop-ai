import { requireNavRoute } from '@autoworkshop/next-shell';
import { KnowledgeBaseScreen } from '../../_screens/knowledge-base-screen';

/**
 * `/knowledge-and-staff/repair-knowledge` - "Repair Knowledge". Slice 10 of `COMPLETION_PLAN.md`.
 *
 * The LIBRARY is built; the licensed corpus is what CLAUDE.md section 4 stages.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries NO route check unless it makes one
 * (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/knowledge-and-staff/repair-knowledge';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <KnowledgeBaseScreen route={ROUTE} />;
}
