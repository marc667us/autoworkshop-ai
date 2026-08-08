import { Suspense } from 'react';
import Link from 'next/link';
import { ApiFailure, apiGet, quickCreateHref, viewerRole } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState, StatusBadge, DataTable } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { navLabelFor } from './nav-label';
import { QuickCreateButton } from './quick-create-button';
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
  // Resolved together: the heading, and where THIS viewer may open a new job
  // card. `create-job-card` sits under a different group in every role tree, so
  // the href is read out of the viewer's own visible navigation rather than
  // written down a second time — the same reasoning as `CustomersScreen`.
  const [title, addHref] = await Promise.all([
    navLabelFor('workshop', route, 'Job queue'),
    quickCreateHref('workshop', 'create-job-card'),
  ]);
  return (
    <>
      <PageHeader
        title={title}
        description={queue.description}
        /*
          Owner, 2026-08-09: *"in views do add addnew button so new entry can be
          created."* Opening a job card is the workshop's core action, and until
          now the only way to it was a menu whose wording AND path differ per
          role.

          ⚠️ RENDERS NOTHING when the viewer's tree has no such route —
          `quickCreateHref` resolves from the viewer's own visible navigation
          and returns null otherwise, so a technician is not handed a button
          that 404s. It is a convenience, never a control: the target page calls
          `requireNavRoute` itself and the API re-derives every rule
          (CLAUDE.md §8).
        */
        actions={<QuickCreateButton href={addHref} label="New job card" />}
      />
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
    <DataTable
      caption={`${queue.description} ${rows.length} shown.`}
      summary={`${rows.length} ${rows.length === 1 ? 'job card' : 'job cards'}`}
      rows={rows}
      rowKey={(c) => c.id}
      columns={[
        {
          key: 'job',
          header: 'Job',
          nowrap: true,
          /*
            THE PRIMARY ACTION OF THE SCREEN, and a real one. It was plain text
            until the detail screen existed, because a link into the "not built
            yet" catch-all teaches people the queue is broken. The href is
            per-role — see `jobCardDetailHrefFor`.
          */
          cell: (c) => (
            <Link
              href={jobCardDetailHrefFor(role, c.id)}
              style={{ fontFamily: primitive.fontFamily.mono, fontWeight: 600 }}
            >
              {c.jobNumber}
            </Link>
          ),
        },
        {
          key: 'vehicle',
          header: 'Vehicle',
          nowrap: true,
          cell: (c) => (
            <>
              <span style={{ fontFamily: primitive.fontFamily.mono, fontWeight: 600 }}>
                {c.registrationNumber}
              </span>
              {c.vehicleDescription ? (
                <div style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.xs }}>
                  {c.vehicleDescription}
                </div>
              ) : null}
            </>
          ),
        },
        { key: 'customer', header: 'Customer', cell: (c) => c.customerName },
        {
          key: 'stage',
          header: 'Stage',
          nowrap: true,
          cell: (c) => <StatusBadge kind={toneFor(c.stage)} label={STAGE_LABEL[c.stage] ?? c.stage} />,
        },
        {
          key: 'assigned',
          header: 'Assigned to',
          secondary: true,
          // Not "Unassigned": a job nobody is on is a thing to act on.
          cell: (c) => c.assignedTechnicianName ?? 'Nobody yet',
        },
      ]}
    />
  );
}

