import { Suspense } from 'react';
import Link from 'next/link';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { RepairPlanBuilderForm } from './repair-plan-builder-form';
import { RepairPlanReviewForm } from './repair-plan-review-form';
import {
  MATERIAL_KINDS,
  PLAN_STATUS_KIND,
  PLAN_STATUS_LABEL,
  formatHours,
  formatQuantity,
} from './repair-plan-labels';

/**
 * One repair plan — `07.txt` §22-§31, `1.txt` §378-§384.
 *
 * Reached at `<queue route>/<plan id>` in all three role trees. A detail route GATES
 * ON ITS PARENT LIST ROUTE (T-0037): no navigation advertises one entry per plan, so
 * `check-page-gates.sh` strips the trailing dynamic segment and requires the page to
 * gate on the queue route it hangs from.
 *
 * ── THIS SCREEN RENDERS THREE GENUINELY DIFFERENT THINGS ────────────────────
 *
 * Not one thing in three states of disablement:
 *
 *   1. OPEN, and this viewer may plan — the builder.
 *   2. SUBMITTED, and this viewer may review it — the record, plus §31's
 *      approve/reject. Offered only to somebody who did not submit it.
 *   3. SETTLED, or open to a viewer who may only read — the record of what was
 *      proposed and what the reviewer said.
 *
 * A disabled form says "you cannot do this right now", where the truth in case 3 is
 * "this plan is finished and a revised proposal is a new attempt".
 *
 * ── THE REJECTION REASON IS THE MOST IMPORTANT TEXT ON THE PAGE ─────────────
 *
 * It is the only thing a technician can act on after a rejection — and §31's "request
 * additional test" and "return to technician" ARE that sentence, so losing it loses
 * three of the five verbs the specification gives the supervisor. Rendered
 * prominently, above the plan rather than at the foot of it.
 */

interface ConfirmedFault {
  id: string;
  position: number;
  faultCode: string | null;
  faultDescription: string;
  affectedSystem: string;
  taskCount: number;
}

interface PlanTask {
  id: string;
  position: number;
  findingId: string | null;
  findingDescription: string | null;
  title: string;
  description: string | null;
  requiredSkill: string | null;
  serviceBay: string | null;
  assignedTechnicianName: string | null;
  estimatedLabourHours: number | null;
  recordedByName: string | null;
}

interface PlanResource {
  id: string;
  position: number;
  taskId: string | null;
  resourceKind: string;
  resourceKindLabel: string;
  name: string;
  reference: string | null;
  quantity: number;
  unit: string | null;
  note: string | null;
}

interface RepairPlan {
  id: string;
  jobCardId: string;
  jobNumber: string;
  registrationNumber: string;
  diagnosisId: string;
  diagnosisAttemptNo: number;
  attemptNo: number;
  status: 'in_progress' | 'submitted' | 'approved' | 'rejected';
  repairProcedure: string | null;
  safetyPrecautions: string | null;
  postRepairTests: string | null;
  notes: string | null;
  startedByName: string | null;
  startedAt: string;
  submittedByName: string | null;
  submittedAt: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  tasks: PlanTask[];
  resources: PlanResource[];
  confirmedFaults: ConfirmedFault[];
  totalEstimatedLabourHours: number;
  unestimatedTaskCount: number;
  unaddressedFaultCount: number;
  partCount: number;
  equipmentCount: number;
  editable: boolean;
  reviewable: boolean;
}

export async function RepairPlanSheetScreen({
  route,
  planId,
}: {
  route: string;
  planId: string;
}) {
  return (
    <Suspense fallback={<LoadingState label="Loading the repair plan…" />}>
      <Sheet route={route} planId={planId} />
    </Suspense>
  );
}

async function Sheet({ route, planId }: { route: string; planId: string }) {
  const result = await apiGet<RepairPlan>('workshop', `/repair-plans/${planId}`);

  if (!result.ok) {
    return <ApiFailure reason={result.reason} workspaceId="workshop" />;
  }

  const plan = result.data;
  const settled = plan.status === 'approved' || plan.status === 'rejected';

  return (
    <>
      <PageHeader title={`Repair plan — ${plan.jobNumber}`} description={describe(plan)} />

      <p style={{ margin: `0 0 ${primitive.space[3]} 0` }}>
        <Link href={route} style={{ color: primitive.color.blue[600] }}>
          Back to the repair-planning queue
        </Link>
      </p>

      {/* THE REJECTION REASON, FIRST. See the header note — this is the only thing a
          technician can act on, so it is not buried at the foot of the record. */}
      {plan.status === 'rejected' && plan.reviewNote ? (
        <div
          role="alert"
          style={{
            margin: `0 0 ${primitive.space[4]} 0`,
            padding: primitive.space[3],
            border: `1px solid ${primitive.color.red[700]}`,
            borderRadius: primitive.radius.md,
            background: themeVar.surfaceRaised,
          }}
        >
          <h2
            style={{
              margin: `0 0 ${primitive.space[1]} 0`,
              fontSize: primitive.fontSize.base,
              color: primitive.color.red[700],
            }}
          >
            Returned by {plan.reviewedByName ?? 'a supervisor'}
          </h2>
          <p style={{ margin: 0, color: themeVar.textPrimary }}>{plan.reviewNote}</p>
          <p
            style={{
              margin: `${primitive.space[2]} 0 0 0`,
              color: themeVar.textSecondary,
              fontSize: primitive.fontSize.sm,
            }}
          >
            {/* Names the way forward. A refusal whose alternative is unreachable is a
                wall, and the queue offers exactly this action. */}
            This plan cannot be changed. Record a revised proposal as a new plan from the
            queue, while the card is at solution preparation.
          </p>
        </div>
      ) : null}

      {/* An approval is worth stating too — quietly. Without it an approved record is
          visually identical to one nobody has looked at. */}
      {plan.status === 'approved' ? (
        <p
          role="status"
          style={{
            margin: `0 0 ${primitive.space[4]} 0`,
            color: themeVar.textPrimary,
            fontSize: primitive.fontSize.sm,
          }}
        >
          Approved by {plan.reviewedByName ?? 'a supervisor'}
          {plan.reviewNote ? ` — ${plan.reviewNote}` : ''}. §30: the approved plan passes
          to quotation preparation, which is priced from the tasks and parts below.
        </p>
      ) : null}

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
          gap: primitive.space[3],
          margin: `0 0 ${primitive.space[4]} 0`,
        }}
      >
        <Fact label="Vehicle" value={plan.registrationNumber} mono />
        <Fact label="Attempt" value={String(plan.attemptNo)} />
        <Fact
          label="Status"
          value={
            <StatusBadge
              kind={PLAN_STATUS_KIND[plan.status] ?? 'draft'}
              label={PLAN_STATUS_LABEL[plan.status] ?? plan.status}
            />
          }
        />
        {/* WHICH diagnosis this plan was built from. Not decoration: a plan whose source
            is unknown cannot be checked against the faults it claims to address, and a
            card can carry several diagnosis attempts. */}
        <Fact label="From diagnosis" value={`Attempt ${plan.diagnosisAttemptNo}`} />
        <Fact label="Started by" value={plan.startedByName ?? 'Unknown'} />
        {plan.submittedByName ? <Fact label="Submitted by" value={plan.submittedByName} /> : null}
        {plan.reviewedByName ? <Fact label="Reviewed by" value={plan.reviewedByName} /> : null}
        <Fact
          label="Tasks"
          value={
            // Never a bare "0": mid-planning that means "not written yet", and after
            // submission it would mean a plan proposing nothing — two very different
            // statements that a zero would collapse into one.
            plan.tasks.length === 0 ? 'None yet' : String(plan.tasks.length)
          }
        />
        <Fact label="Estimated labour" value={formatHours(plan.totalEstimatedLabourHours)} />
        {plan.unaddressedFaultCount > 0 ? (
          <Fact
            label="Confirmed faults not addressed"
            value={String(plan.unaddressedFaultCount)}
          />
        ) : null}
      </dl>

      {plan.editable ? (
        <RepairPlanBuilderForm
          planId={plan.id}
          jobNumber={plan.jobNumber}
          confirmedFaults={plan.confirmedFaults}
          tasks={plan.tasks}
          resources={plan.resources}
          repairProcedure={plan.repairProcedure}
          safetyPrecautions={plan.safetyPrecautions}
          postRepairTests={plan.postRepairTests}
          notes={plan.notes}
          unestimatedTaskCount={plan.unestimatedTaskCount}
          totalEstimatedLabourHours={plan.totalEstimatedLabourHours}
        />
      ) : (
        <ReadOnlyPlan plan={plan} settled={settled} />
      )}

      {/* §30-§31's review, offered only to somebody who may give it AND did not submit
          it. `reviewable` already mirrors both rules, and the service re-checks them on
          the write — a button the API then refuses is worse than no button. */}
      {plan.reviewable ? (
        <RepairPlanReviewForm
          planId={plan.id}
          jobNumber={plan.jobNumber}
          submittedByName={plan.submittedByName}
          taskCount={plan.tasks.length}
          totalEstimatedLabourHours={plan.totalEstimatedLabourHours}
          unaddressedFaultCount={plan.unaddressedFaultCount}
          partCount={plan.partCount}
        />
      ) : null}

      {/* Why there is no review control, when the record is waiting for one. Silence
          here reads as a broken page to the person who submitted it. */}
      {plan.status === 'submitted' && !plan.reviewable ? (
        <p
          style={{
            marginTop: primitive.space[4],
            color: themeVar.textSecondary,
            fontSize: primitive.fontSize.sm,
          }}
        >
          Awaiting supervisor review. Whoever submitted a plan cannot also review it
          (§563), so this one needs another supervisor, manager or owner.
        </p>
      ) : null}
    </>
  );
}

/** The one-line explanation under the title, matched to the record's real state. */
function describe(plan: RepairPlan): string {
  switch (plan.status) {
    case 'in_progress':
      return plan.editable
        ? 'Plan the repair against the confirmed faults of the approved diagnosis. Every task needs an estimated labour time — the quotation is priced from them. Submitting sends the plan for supervisor review and it cannot be changed afterwards.'
        : 'This plan is still being written. Your role can read it but not change it.';
    case 'submitted':
      return 'Submitted for internal technical review. The plan is frozen so it cannot move underneath the reviewer.';
    case 'approved':
      return 'Approved. This is the plan of record for this attempt, and what the quotation is priced from; a revised proposal is a new attempt.';
    default:
      return 'Returned by the supervisor. This is the record of what was proposed and why it was refused — it is kept rather than reopened, so the disagreement is not erased.';
  }
}

function ReadOnlyPlan({ plan, settled }: { plan: RepairPlan; settled: boolean }) {
  const materials = plan.resources.filter((r) => MATERIAL_KINDS.includes(r.resourceKind));
  const equipment = plan.resources.filter((r) => !MATERIAL_KINDS.includes(r.resourceKind));

  return (
    <>
      {!settled && plan.status === 'in_progress' ? (
        // An open record a viewer may not write to — a storekeeper reading which parts
        // to order. Said out loud, because otherwise the absence of a form looks like a
        // broken page.
        <p style={{ margin: `0 0 ${primitive.space[3]} 0`, color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
          This plan is still being written. Your role can read it but not change it.
        </p>
      ) : null}

      <h2 style={sectionHeading}>Repair tasks, in sequence</h2>
      {plan.tasks.length === 0 ? (
        <p style={{ color: themeVar.textSecondary }}>
          {/* Never blank. An empty task list on a submitted record is a real and alarming
              state — it should read as one, not as a loading glitch. */}
          No tasks were recorded on this plan.
        </p>
      ) : (
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: primitive.space[3] }}>
          {plan.tasks.map((task) => (
            <li key={task.id}>
              <div
                style={{
                  padding: primitive.space[3],
                  border: `1px solid ${themeVar.borderDefault}`,
                  borderRadius: primitive.radius.md,
                  background: themeVar.surfaceRaised,
                  // A positioned containing block for anything absolutely positioned that
                  // ends up inside — the escape defect measured twice already.
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', gap: primitive.space[2], alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: primitive.fontFamily.mono, fontWeight: 600, color: themeVar.textSecondary }}>
                    {task.position}.
                  </span>
                  <strong style={{ color: themeVar.textPrimary }}>{task.title}</strong>
                  <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
                    {formatHours(task.estimatedLabourHours)}
                  </span>
                </div>
                <dl
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))',
                    gap: primitive.space[2],
                    margin: `${primitive.space[2]} 0 0 0`,
                  }}
                >
                  {/* The fault link, rendered as the fault's own words. This is the field
                      slice 9's quality control reads — "was the confirmed fault actually
                      repaired" — so it is shown rather than left implicit. */}
                  <Fact
                    label="Addresses"
                    value={task.findingDescription ?? 'No single fault (general work)'}
                  />
                  {task.description ? <Fact label="Detail" value={task.description} /> : null}
                  {task.requiredSkill ? <Fact label="Skill" value={task.requiredSkill} /> : null}
                  {task.serviceBay ? <Fact label="Service bay" value={task.serviceBay} /> : null}
                  {task.assignedTechnicianName ? (
                    <Fact label="Assigned to" value={task.assignedTechnicianName} />
                  ) : null}
                  <Fact label="Planned by" value={task.recordedByName ?? 'Unknown'} />
                </dl>
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* Materials and equipment split, because they are two different people's jobs:
          one list is bought, the other is booked out. §9 of the quotation flow prices
          only the first. */}
      <ResourceList title="Parts and consumables to be supplied" items={materials} />
      <ResourceList title="Tools and equipment to be reserved" items={equipment} />

      <h2 style={sectionHeading}>Procedure, safety and testing</h2>
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
          gap: primitive.space[3],
          margin: 0,
        }}
      >
        <Fact label="Repair procedure" value={plan.repairProcedure ?? 'Not recorded'} />
        <Fact label="Safety precautions" value={plan.safetyPrecautions ?? 'Not recorded'} />
        <Fact label="Tests required after repair" value={plan.postRepairTests ?? 'Not recorded'} />
        <Fact label="Notes" value={plan.notes ?? 'None'} />
      </dl>
    </>
  );
}

function ResourceList({ title, items }: { title: string; items: PlanResource[] }) {
  return (
    <>
      <h2 style={sectionHeading}>{title}</h2>
      {items.length === 0 ? (
        <p style={{ margin: 0, color: themeVar.textSecondary }}>None recorded.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: primitive.space[1] }}>
          {items.map((item) => (
            <li key={item.id} style={{ color: themeVar.textPrimary }}>
              <strong>{item.name}</strong>{' '}
              <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
                — {item.resourceKindLabel} · {formatQuantity(item.quantity, item.unit)}
                {item.reference ? ` · ${item.reference}` : ''}
                {item.note ? ` · ${item.note}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const sectionHeading = {
  fontSize: primitive.fontSize.base,
  color: themeVar.textPrimary,
  margin: `${primitive.space[4]} 0 ${primitive.space[2]} 0`,
};

function Fact({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>{label}</dt>
      <dd
        style={{
          margin: 0,
          color: themeVar.textPrimary,
          fontFamily: mono ? primitive.fontFamily.mono : 'inherit',
        }}
      >
        {value}
      </dd>
    </div>
  );
}
