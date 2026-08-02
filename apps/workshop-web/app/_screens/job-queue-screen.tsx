import { Suspense } from 'react';
import Link from 'next/link';
import { ApiFailure, apiGet, viewerRole } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState, StatusBadge } from '@autoworkshop/ui';
import { navLabelFor } from './nav-label';
import { jobCardDetailHrefFor } from './job-card-detail-href';

/**
 * A job queue — the same job cards, narrowed to one point in the lifecycle.
 *
 * ⚠️ REAL DATA, FILTERED. NOT A NEW SCREEN PER ROUTE. `05.txt` §2 prohibits
 * "disconnected mock pages", and building eleven hand-written screens that each
 * re-fetch and re-render the same rows would be eleven places for the stage
 * vocabulary to drift. This is ONE component; a route supplies the stages it
 * cares about.
 *
 * ⚠️ AND THE FILTER IS NOT A PERMISSION. `JobCardService` already narrows a
 * technician to the cards assigned to them, server-side, before this ever sees
 * a row — so `/my-jobs/...` shows a technician THEIR cards at that stage and a
 * manager the WHOLE workshop's, from the identical request. Filtering here
 * changes what is DISPLAYED, never what is permitted. Anyone tempted to secure
 * something with this should read `JobCardService` instead.
 *
 * 🔴 THE STAGE KEYS ARE THE DATABASE'S. Migration 006's CHECK constraint is the
 * authority, transcribed in `job-card-stages.ts`. A typo here does not throw —
 * it silently matches nothing and renders "nothing at this stage", which reads
 * exactly like an empty workshop. `job-queue-stages.spec.ts` therefore checks
 * every stage named below against that file.
 */

interface JobCard {
  id: string;
  jobNumber: string;
  customerName: string;
  registrationNumber: string;
  vehicleDescription: string;
  complaint: string;
  stage: string;
  priority: string;
  assignedTechnicianName: string | null;
  expectedCompletionOn: string | null;
  openedAt: string;
}

export interface JobQueue {
  /** Stages this queue shows. Empty means "every active stage". */
  stages: readonly string[];
  /** What the queue is for, in the words the person reading it would use. */
  description: string;
  /** Shown when nothing matches — never a bare "no results". */
  emptyTitle: string;
  emptyBody: string;
}

const STAGE_LABEL: Record<string, string> = {
  complaint_received: 'Complaint received',
  appointment_confirmed: 'Appointment confirmed',
  vehicle_received: 'Vehicle received',
  initial_inspection: 'Initial inspection',
  diagnosis_in_progress: 'Diagnosis in progress',
  further_information_required: 'Further information required',
  solution_preparation: 'Solution preparation',
  quotation_preparation: 'Quotation preparation',
  awaiting_customer_approval: 'Awaiting customer approval',
  awaiting_deposit: 'Awaiting deposit',
  awaiting_parts: 'Awaiting parts',
  authorized_to_start: 'Authorized to start',
  repair_in_progress: 'Repair in progress',
  specialist_consultation: 'Specialist consultation',
  testing: 'Testing',
  quality_control: 'Quality control',
  ready_for_collection: 'Ready for collection',
  completed: 'Completed',
  warranty_follow_up: 'Warranty follow-up',
  on_hold: 'On hold',
};

/**
 * `blocked` is reserved for stages where the workshop is WAITING ON SOMEONE
 * ELSE. Colouring a stalled job the same as work-in-progress is how one sits
 * for a fortnight unnoticed. Colour is never the only signal — the stage is
 * written out beside it (§66).
 */
function toneFor(stage: string): 'draft' | 'active' | 'complete' | 'attention' | 'blocked' {
  if (stage === 'completed' || stage === 'ready_for_collection') return 'complete';
  if (stage === 'on_hold') return 'attention';
  if (stage.startsWith('awaiting_') || stage === 'further_information_required') return 'blocked';
  if (stage === 'complaint_received' || stage === 'appointment_confirmed') return 'draft';
  return 'active';
}

export async function JobQueueScreen({ route, queue }: { route: string; queue: JobQueue }) {
  const title = await navLabelFor('workshop', route, 'Job queue');
  return (
    <>
      <PageHeader title={title} description={queue.description} />
      <Suspense fallback={<LoadingState label="Loading jobs…" />}>
        <QueueTable queue={queue} />
      </Suspense>
    </>
  );
}

async function QueueTable({ queue }: { queue: JobQueue }) {
  /**
   * Resolved together: the rows and WHERE THIS VIEWER MAY OPEN ONE.
   *
   * 🔴 The detail route differs per role tree, and a hardcoded href would 404
   * the technician and the receptionist on the primary action of their own
   * queue — the trees put job cards in four different places and one of them
   * has no job-cards route at all. `jobCardDetailHrefFor` holds that map and a
   * drift test proves every entry is a route that role's tree really carries.
   * `viewerRole` is the same function `requireNavRoute` uses to pick the tree,
   * so the link and the gate cannot resolve differently.
   */
  const [result, role] = await Promise.all([
    apiGet<JobCard[]>('workshop', '/job-cards'),
    viewerRole('workshop'),
  ]);

  if (!result.ok) {
    // ⚠️ THE SHARED FAILURE COMPONENT, not a hand-written message. It already
    // distinguishes an expired session from a refusal from an outage, and says
    // each in the vocabulary every other screen uses. A local copy would drift
    // from that wording the first time one of them was improved.
    return <ApiFailure reason={result.reason} workspaceId="workshop" />;
  }

  const all = Array.isArray(result.data) ? result.data : [];
  const rows = queue.stages.length === 0 ? all : all.filter((c) => queue.stages.includes(c.stage));

  if (rows.length === 0) {
    // ⚠️ THE EMPTY STATE SAYS WHICH EMPTY IT IS. "No results" cannot be acted
    // on. Each queue supplies its own words, because "no cards are waiting for
    // inspection" and "you have no jobs assigned" call for different next steps.
    return <EmptyState title={queue.emptyTitle} description={queue.emptyBody} />;
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <caption style={{ captionSide: 'top', textAlign: 'left', paddingBottom: 8 }}>
        {rows.length} {rows.length === 1 ? 'job' : 'jobs'}
      </caption>
      <thead>
        <tr>
          <Th>Job</Th>
          <Th>Vehicle</Th>
          <Th>Customer</Th>
          <Th>Stage</Th>
          <Th>Assigned to</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id}>
            {/*
              THE PRIMARY ACTION OF THE SCREEN, and now a real one. It was
              plain text until the detail screen existed, because a link into
              the "not built yet" catch-all teaches people the queue is broken.
              The href is per-role — see `jobCardDetailHrefFor`.
            */}
            <Td>
              <Link href={jobCardDetailHrefFor(role, c.id)}>{c.jobNumber}</Link>
            </Td>
            <Td>
              {c.registrationNumber}
              {c.vehicleDescription ? ` — ${c.vehicleDescription}` : ''}
            </Td>
            <Td>{c.customerName}</Td>
            <Td>
              <StatusBadge kind={toneFor(c.stage)} label={STAGE_LABEL[c.stage] ?? c.stage} />
            </Td>
            {/* Not "Unassigned": a job nobody is on is a thing to act on. */}
            <Td>{c.assignedTechnicianName ?? 'Nobody yet'}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #d8dde4' }}>
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td style={{ padding: '8px 10px', borderBottom: '1px solid #eef1f5' }}>{children}</td>
  );
}
