import { requireNavRoute } from '@autoworkshop/next-shell';
import { DiagnosisQueueScreen } from '../../_screens/diagnosis-queue-screen';

/**
 * /record-work/diagnostic-results — the §49 TECHNICIAN tree — their own assigned work, including any rejection they must act on.
 *
 * The screen is shared across all four role trees; the GATE is not. Each page names
 * its own path so `check-page-gates.sh` can verify the gate belongs to the page it
 * sits in.
 *
 * NOT A SECURITY CONTROL. `DiagnosisService` refuses the roles that may not read or
 * record a diagnosis (`07.txt` pt2 §50), narrows a technician to their assigned
 * cards, enforces §1292's reviewer independence, and Postgres RLS denies cross-tenant
 * access independently (CLAUDE.md §8).
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/record-work/diagnostic-results');
  return <DiagnosisQueueScreen route="/record-work/diagnostic-results" />;
}
