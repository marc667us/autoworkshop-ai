import { Suspense } from 'react';
import { apiGet, describeApiFailure } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState, ErrorState, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { navLabelFor } from './nav-label';

/**
 * Job cards — `1.txt` §322, the record the whole repair lifecycle hangs off.
 *
 * ⚠️ ONE SCREEN, AND THE TECHNICIAN'S "MY ASSIGNED WORK" IS THE SAME SCREEN.
 * That is not a shortcut, it is the design: `JobCardService` narrows a
 * technician to the cards assigned to them, so the identical request returns
 * fewer rows for them than for a manager. There is no technician-only endpoint
 * that could drift from the staff one, and no filter in the UI that could be
 * removed by mistake.
 *
 * It is also where a promise made in Phase 4 is kept. `CAN_READ_VEHICLES`
 * excludes technicians — they cannot list the vehicle register — and the comment
 * there said they would get the customer and vehicle for the job they are
 * ASSIGNED, "with the job card that can express it". This is that card:
 * registration and customer name arrive through the join, scoped by assignment.
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

/** `1.txt` §322-§360 and `02.txt` §29, rendered as humans say them. */
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
 * Which badge a stage wears.
 *
 * `blocked` is reserved for stages where the workshop is WAITING ON SOMEONE
 * ELSE — a customer decision, a deposit, a part. Those are the cards a manager
 * needs to spot, and colouring them the same as work-in-progress is how a job
 * sits for a fortnight because nobody noticed it was stalled. Colour is never
 * the only signal: the stage name is written out beside it (§66).
 */
function stageKind(stage: string): 'active' | 'attention' | 'blocked' | 'complete' | 'draft' {
  if (stage === 'completed' || stage === 'ready_for_collection') return 'complete';
  if (stage === 'on_hold') return 'blocked';
  if (stage.startsWith('awaiting_') || stage === 'further_information_required') return 'blocked';
  if (stage === 'complaint_received' || stage === 'appointment_confirmed') return 'draft';
  return 'active';
}

const PRIORITY_KIND: Record<string, 'active' | 'attention' | 'blocked' | 'draft'> = {
  low: 'draft',
  normal: 'active',
  high: 'attention',
  urgent: 'blocked',
};

export async function JobCardsScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Job Cards');

  return (
    <>
      <PageHeader
        title={title}
        description="Every repair this workshop is handling, newest first. A technician sees only the jobs assigned to them."
      />
      <Suspense fallback={<LoadingState label="Loading job cards…" />}>
        <JobCardsTable />
      </Suspense>
    </>
  );
}

async function JobCardsTable() {
  const result = await apiGet<JobCard[]>('workshop', '/job-cards');

  if (!result.ok) {
    const { title, description } = describeApiFailure(result.reason);
    return <ErrorState title={title} message={description} />;
  }

  if (result.data.length === 0) {
    return (
      <EmptyState
        title="No job cards"
        description="A job card is opened when a vehicle is booked in or a customer reports a problem. None are open for you right now."
      />
    );
  }

  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${themeVar.borderDefault}`, borderRadius: primitive.radius.lg }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: primitive.fontSize.sm }}>
        <caption style={{ captionSide: 'bottom', padding: primitive.space[2], color: themeVar.textSecondary, textAlign: 'left' }}>
          {result.data.length} job card{result.data.length === 1 ? '' : 's'}
        </caption>
        <thead>
          <tr style={{ background: themeVar.backgroundSecondary }}>
            {['Job', 'Vehicle', 'Customer', 'Complaint', 'Stage', 'Priority', 'Technician'].map((h) => (
              <th
                key={h}
                scope="col"
                style={{
                  textAlign: 'left',
                  padding: primitive.space[3],
                  color: themeVar.textSecondary,
                  fontWeight: 600,
                  borderBottom: `1px solid ${themeVar.borderDefault}`,
                  whiteSpace: 'nowrap',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.data.map((j) => (
            <tr key={j.id} style={{ borderBottom: `1px solid ${themeVar.borderDefault}` }}>
              <th
                scope="row"
                style={{
                  textAlign: 'left',
                  padding: primitive.space[3],
                  fontWeight: 600,
                  color: themeVar.textPrimary,
                  // A job number is a technical identifier read aloud across a
                  // workshop floor — `01 (1).txt` §2845.
                  fontFamily: primitive.fontFamily.mono,
                  whiteSpace: 'nowrap',
                }}
              >
                {j.jobNumber}
              </th>
              <td style={{ padding: primitive.space[3], color: themeVar.textPrimary, whiteSpace: 'nowrap' }}>
                <span style={{ fontFamily: primitive.fontFamily.mono }}>{j.registrationNumber}</span>
                <br />
                <span style={{ color: themeVar.textSecondary }}>{j.vehicleDescription}</span>
              </td>
              <td style={{ padding: primitive.space[3], color: themeVar.textSecondary }}>{j.customerName}</td>
              <td style={{ padding: primitive.space[3], color: themeVar.textSecondary, maxWidth: '22rem' }}>
                {/* The customer's own words, not a summary. Truncating in CSS
                    rather than in the data keeps the full text available to a
                    screen reader and to copy-paste. */}
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {j.complaint}
                </span>
              </td>
              <td style={{ padding: primitive.space[3] }}>
                <StatusBadge kind={stageKind(j.stage)} label={STAGE_LABEL[j.stage] ?? j.stage} />
              </td>
              <td style={{ padding: primitive.space[3] }}>
                <StatusBadge kind={PRIORITY_KIND[j.priority] ?? 'draft'} label={j.priority} />
              </td>
              <td style={{ padding: primitive.space[3], color: themeVar.textSecondary, whiteSpace: 'nowrap' }}>
                {/* "Unassigned" rather than a dash: it is a state someone has to
                    act on, and a dash reads as missing data. */}
                {j.assignedTechnicianName ?? 'Unassigned'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
