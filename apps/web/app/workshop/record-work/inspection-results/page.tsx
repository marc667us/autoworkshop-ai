import { requireNavRoute } from '@autoworkshop/next-shell';
import { InspectionQueueScreen } from '../../_screens/inspection-queue-screen';

/**
 * /record-work/inspection-results — the §49 TECHNICIAN tree.
 *
 * §49 puts this under "Record Work" and calls it "Inspection Results", which is
 * what a technician is doing here: recording what they found, and reading back
 * what they recorded.
 *
 * ⚠️ THE SCOPE IS THE SERVICE'S, NOT THIS PAGE'S. §50 gives a technician
 * "ASSIGNED-JOB inspection, diagnosis" — `InspectionService` narrows every read
 * to cards assigned to them, so this same screen shows a technician their own
 * work and a manager the whole organisation, from one implementation and one
 * query. The queue also keeps a card visible after it has moved on, so a
 * technician can still read a sheet they submitted.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/record-work/inspection-results');
  return <InspectionQueueScreen route="/record-work/inspection-results" />;
}
