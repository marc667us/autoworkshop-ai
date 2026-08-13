import { requireNavRoute } from '@autoworkshop/next-shell';
import { LearningMaterialsScreen } from '../../_screens/learning-materials-screen';

/**
 * /learning/assessments — the technician's tree (`07.txt` pt2 §49).
 *
 * Slice 16. A signpost until migration 057 built the thing behind it — see
 * that migration's header for the decision it records.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and carries no route check unless it makes one
 * (T-0005 finding 4). The authorization is `assertWorkshopStaff`, on the
 * service.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireNavRoute('workshop', '/learning/assessments');
  return <LearningMaterialsScreen kind="assessment" />;
}
