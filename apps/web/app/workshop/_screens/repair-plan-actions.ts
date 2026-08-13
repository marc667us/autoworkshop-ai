'use server';

import { revalidatePath } from 'next/cache';
import { apiDelete, apiPatch, apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * Building and reviewing a repair plan — `07.txt` §22-§31, `1.txt` §378-§384.
 *
 * IN ITS OWN `'use server'` MODULE, the same discipline as `diagnosis-actions.ts`,
 * `inspection-actions.ts` and `stage-actions.ts`: a module whose first line is
 * `'use server'` cannot become a client module without someone deleting that line on
 * purpose, so the access-token handling inside `apiPost`/`apiPatch`/`apiDelete`
 * cannot drift into the browser.
 *
 * ⚠️ NOT THE AUTHORIZATION POINT. Next exposes one public HTTP endpoint per server
 * action, so anyone can call these directly with any payload. Every rule lives in
 * `RepairPlanService`: which roles may plan (`07.txt` pt2 §50), which may REVIEW
 * (§30-§31), that a reviewer is not the submitter (`2.txt` §563), whether the card
 * has reached `solution_preparation`, whether an APPROVED diagnosis with a confirmed
 * fault exists, whether the plan is still open, that a task addresses only a
 * confirmed fault of its own diagnosis, and that a submitted plan has tasks and every
 * task an estimate. The screen only decides what to OFFER.
 */

/**
 * The API's own sentence is passed through for `invalid` and `forbidden`.
 *
 * Same judgement as `diagnosis-actions.ts`, and it earns at least as much here. The
 * refusals in this slice are instructions: "a repair plan is built from the confirmed
 * faults of an APPROVED diagnosis, and this job card has none…", "every task needs an
 * estimated labour time before the plan can be submitted — the quotation is priced
 * from them. 2 still unestimated: 3. Bleed the brakes; 5. Road test", "you submitted
 * this repair plan and cannot also review it". Replacing any of those with "That was
 * not accepted" turns a solvable situation into a mystery.
 *
 * They publish nothing: the roles are on the org chart and the rules are workshop
 * process, not system internals.
 *
 * ⚠️ `conflict` IS NOT A REASON IN THIS CLIENT. `api.ts` maps 400, 409 AND 422 all to
 * `invalid` and only those three carry the API's `message`, so the service's 409s — a
 * submitted plan, a second open plan, a review that already happened — arrive here as
 * `invalid` WITH their sentence intact. A `conflict` case would be a branch that never
 * runs.
 */
function explain(
  reason: 'unauthenticated' | 'noMembership' | 'forbidden' | 'notFound' | 'invalid' | 'unavailable',
  message: string | undefined,
): string {
  switch (reason) {
    case 'invalid':
    case 'forbidden':
      return message ?? 'That was not accepted.';
    case 'noMembership':
      // 🔴 NOT "your session has ended". This viewer IS signed in; they belong
      // to no workshop. Saying otherwise sends them to sign in again, which
      // changes nothing, and they loop.
      return (
        'You are signed in, but your account does not belong to a workshop yet. ' +
        'Create one from the dashboard, or ask the workshop owner to add you.'
      );
    case 'unauthenticated':
      return 'Your session has ended. Sign in again, then retry.';
    case 'notFound':
      // Also what a technician gets for a card that is not theirs — the service
      // answers 404 rather than 403, so this is not an existence oracle.
      return 'That record is no longer available to you. Reload the page.';
    default:
      return 'The service did not respond. Nothing was recorded — try again shortly.';
  }
}

/**
 * Every route that renders a repair plan or the stage behind it.
 *
 * All THREE plan trees — §46 owner and §47 manager both call this screen
 * `repair-control/repair-plans`, unlike the diagnosis where the manager had a queue of
 * their own. Revalidating only the route the user happened to be on is how two screens
 * end up disagreeing about whether a plan has been approved.
 */
const REPAIR_PLAN_ROUTES = [
  '/repair-services/repair-plans',
  '/repair-control/repair-plans',
  '/plan-work/repair-planning',
  // The staging board and job-card lists show the stage this work sits behind.
  '/workshop-floor/repair-staging',
  '/workshop-operations/repair-staging',
  '/workshop-floor/job-cards',
  '/workshop-operations/job-cards',
  '/home/my-assigned-work',
];

function revalidateAll(): void {
  for (const route of REPAIR_PLAN_ROUTES) revalidatePath(route);
}

/** `null` for an emptied box, so the service reads it as CLEAR rather than "unchanged". */
function clearable(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? '').trim();
  return value === '' ? null : value;
}

/** Omitted entirely when blank — for CREATE, where there is nothing to clear. */
function optional(formData: FormData, name: string): string | undefined {
  const value = String(formData.get(name) ?? '').trim();
  return value === '' ? undefined : value;
}

/**
 * A number from a form field, or undefined.
 *
 * ⚠️ `Number('')` IS 0, NOT NaN — which is why the empty case is handled before the
 * conversion. An estimate silently becoming zero would be refused by the service
 * ("must be greater than zero"), so this is not a correctness hole; it is the
 * difference between a clear "fill this in" and a baffling "must be greater than
 * zero" on a field the technician left alone on purpose.
 */
function numberOrUndefined(formData: FormData, name: string): number | undefined {
  const raw = String(formData.get(name) ?? '').trim();
  if (raw === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : Number.NaN;
}

/** §22-§26 — "The technician selects 'Plan Repair.'" */
export async function startRepairPlanAction(formData: FormData): Promise<ActionResult> {
  const jobCardId = String(formData.get('jobCardId') ?? '').trim();
  if (!jobCardId) {
    return { error: 'Choose a job card to plan.' };
  }

  const result = await apiPost<{ id: string; jobNumber: string; attemptNo: number }>(
    'workshop',
    `/job-cards/${jobCardId}/repair-plans`,
    {},
  );

  if (!result.ok) {
    return { error: explain(result.reason, result.message) };
  }

  revalidateAll();
  return { created: `Repair plan started for ${result.data.jobNumber}` };
}

/**
 * §26's repair procedure, §29's safety precautions, §29.9's post-repair tests and the
 * plan notes.
 *
 * ⚠️ AN EMPTY BOX CLEARS THE FIELD, it is not an error. Every one of these columns is
 * nullable, so refusing to empty one would be a rule the database does not have — the
 * asymmetry the Supervisor caught in slice 3b's `recordSummary`, avoided here from the
 * start. `null` is sent explicitly, because the service reads an ABSENT key as "you
 * meant nothing by this request" and refuses it.
 */
export async function recordPlanDetailsAction(formData: FormData): Promise<ActionResult> {
  const planId = String(formData.get('planId') ?? '').trim();
  if (!planId) {
    return { error: 'That repair plan could not be identified. Reload the page.' };
  }

  const result = await apiPatch<{ id: string }>('workshop', `/repair-plans/${planId}`, {
    repairProcedure: clearable(formData, 'repairProcedure'),
    safetyPrecautions: clearable(formData, 'safetyPrecautions'),
    postRepairTests: clearable(formData, 'postRepairTests'),
    notes: clearable(formData, 'notes'),
  });

  if (!result.ok) {
    return { error: explain(result.reason, result.message) };
  }

  revalidateAll();
  return { created: 'Plan details saved' };
}

/** §27 — add a repair task. */
export async function addPlanTaskAction(formData: FormData): Promise<ActionResult> {
  const planId = String(formData.get('planId') ?? '').trim();
  if (!planId) {
    return { error: 'That repair plan could not be identified. Reload the page.' };
  }

  const title = String(formData.get('title') ?? '').trim();
  // Checked here as well as server-side so the technician gets an answer without a
  // round trip. NOT a substitute for the API's rule — that is what actually holds.
  if (title === '') {
    return { error: 'Describe the task. A task with no description is not a task.' };
  }

  const hours = numberOrUndefined(formData, 'estimatedLabourHours');
  if (hours !== undefined && Number.isNaN(hours)) {
    return { error: 'The estimated labour time must be a number of hours, for example 1.50.' };
  }

  const result = await apiPost<{ tasks: unknown[] }>(
    'workshop',
    `/repair-plans/${planId}/tasks`,
    {
      title,
      // Omitted rather than sent as an empty string: on CREATE there is nothing to
      // clear, and an empty string stored in a nullable column is a different thing
      // from "there isn't one".
      findingId: optional(formData, 'findingId'),
      description: optional(formData, 'description'),
      requiredSkill: optional(formData, 'requiredSkill'),
      serviceBay: optional(formData, 'serviceBay'),
      estimatedLabourHours: hours,
    },
  );

  if (!result.ok) {
    return { error: explain(result.reason, result.message) };
  }

  revalidateAll();
  return { created: `Task added — ${result.data.tasks.length} on this plan` };
}

/**
 * Correct a task, including DETACHING it from its fault.
 *
 * ⚠️ SENDS `null` FOR AN EMPTIED FIELD, DELIBERATELY, including `findingId`. The
 * service reads `null` as "clear this column" and an ABSENT key as "leave it alone",
 * and a technician who blanks the fault selector means the first. Without it the only
 * way to correct a task attached to the wrong finding would be to delete the task and
 * retype its description — destroying the record around a field in order to fix that
 * field.
 */
export async function updatePlanTaskAction(formData: FormData): Promise<ActionResult> {
  const planId = String(formData.get('planId') ?? '').trim();
  const taskId = String(formData.get('taskId') ?? '').trim();
  if (!planId || !taskId) {
    return { error: 'That task could not be identified. Reload the page.' };
  }

  const title = String(formData.get('title') ?? '').trim();
  if (title === '') {
    return { error: 'A task must keep a description.' };
  }

  const raw = String(formData.get('estimatedLabourHours') ?? '').trim();
  const hours = raw === '' ? null : Number(raw);
  if (hours !== null && !Number.isFinite(hours)) {
    return { error: 'The estimated labour time must be a number of hours, for example 1.50.' };
  }

  const result = await apiPatch<{ tasks: unknown[] }>(
    'workshop',
    `/repair-plans/${planId}/tasks/${taskId}`,
    {
      title,
      findingId: clearable(formData, 'findingId'),
      description: clearable(formData, 'description'),
      requiredSkill: clearable(formData, 'requiredSkill'),
      serviceBay: clearable(formData, 'serviceBay'),
      // `null` clears the estimate. Submission is what refuses an unestimated task, so
      // clearing one is never a silent way past the gate.
      estimatedLabourHours: hours,
    },
  );

  if (!result.ok) {
    return { error: explain(result.reason, result.message) };
  }

  revalidateAll();
  return { created: 'Task corrected' };
}

/**
 * §28 — move a task up or down the sequence.
 *
 * The sequence is the plan's content: bleeding the brakes before refitting the caliper
 * is a different plan from the reverse. Without this a technician who realises step
 * four must come first has to delete three tasks and retype them.
 */
export async function movePlanTaskAction(formData: FormData): Promise<ActionResult> {
  const planId = String(formData.get('planId') ?? '').trim();
  const taskId = String(formData.get('taskId') ?? '').trim();
  const direction = String(formData.get('direction') ?? '').trim();
  if (!planId || !taskId) {
    return { error: 'That task could not be identified. Reload the page.' };
  }
  if (direction !== 'up' && direction !== 'down') {
    return { error: 'Choose whether to move the task up or down.' };
  }

  const result = await apiPost<{ tasks: unknown[] }>(
    'workshop',
    `/repair-plans/${planId}/tasks/${taskId}/move`,
    { direction },
  );

  if (!result.ok) {
    return { error: explain(result.reason, result.message) };
  }

  revalidateAll();
  return { created: `Task moved ${direction}` };
}

/** Remove a task entered in error, while the plan is still open. */
export async function removePlanTaskAction(formData: FormData): Promise<ActionResult> {
  const planId = String(formData.get('planId') ?? '').trim();
  const taskId = String(formData.get('taskId') ?? '').trim();
  if (!planId || !taskId) {
    return { error: 'That task could not be identified. Reload the page.' };
  }

  const result = await apiDelete<{ tasks: unknown[] }>(
    'workshop',
    `/repair-plans/${planId}/tasks/${taskId}`,
  );

  if (!result.ok) {
    return { error: explain(result.reason, result.message) };
  }

  revalidateAll();
  return { created: 'Task removed' };
}

/** §29 — add a part, consumable, tool or piece of equipment. */
export async function addPlanResourceAction(formData: FormData): Promise<ActionResult> {
  const planId = String(formData.get('planId') ?? '').trim();
  if (!planId) {
    return { error: 'That repair plan could not be identified. Reload the page.' };
  }

  const name = String(formData.get('name') ?? '').trim();
  const resourceKind = String(formData.get('resourceKind') ?? '').trim();
  if (name === '') {
    return { error: 'Name the part, tool or equipment.' };
  }
  if (resourceKind === '') {
    return { error: 'Choose what kind of resource this is.' };
  }

  const quantity = numberOrUndefined(formData, 'quantity');
  if (quantity === undefined || Number.isNaN(quantity)) {
    // Never defaulted to 1 — see the service. This is a number that ends up on a parts
    // order, and guessing it is how the wrong quantity gets bought.
    return { error: 'Enter how many are needed.' };
  }

  const result = await apiPost<{ resources: unknown[] }>(
    'workshop',
    `/repair-plans/${planId}/resources`,
    {
      resourceKind,
      name,
      quantity,
      reference: optional(formData, 'reference'),
      unit: optional(formData, 'unit'),
      note: optional(formData, 'note'),
      taskId: optional(formData, 'taskId'),
    },
  );

  if (!result.ok) {
    return { error: explain(result.reason, result.message) };
  }

  revalidateAll();
  return { created: `Added — ${result.data.resources.length} resource(s) on this plan` };
}

/** Remove a resource entered in error, while the plan is still open. */
export async function removePlanResourceAction(formData: FormData): Promise<ActionResult> {
  const planId = String(formData.get('planId') ?? '').trim();
  const resourceId = String(formData.get('resourceId') ?? '').trim();
  if (!planId || !resourceId) {
    return { error: 'That resource could not be identified. Reload the page.' };
  }

  const result = await apiDelete<{ resources: unknown[] }>(
    'workshop',
    `/repair-plans/${planId}/resources/${resourceId}`,
  );

  if (!result.ok) {
    return { error: explain(result.reason, result.message) };
  }

  revalidateAll();
  return { created: 'Resource removed' };
}

/** §29.10 — submit the plan for supervisor review. */
export async function submitRepairPlanAction(formData: FormData): Promise<ActionResult> {
  const planId = String(formData.get('planId') ?? '').trim();
  if (!planId) {
    return { error: 'That repair plan could not be identified. Reload the page.' };
  }

  const result = await apiPost<{
    jobNumber: string;
    tasks: unknown[];
    totalEstimatedLabourHours: number;
  }>('workshop', `/repair-plans/${planId}/submit`, {});

  if (!result.ok) {
    return { error: explain(result.reason, result.message) };
  }

  revalidateAll();
  return {
    created:
      `Repair plan submitted for review — ${result.data.jobNumber}, ` +
      `${result.data.tasks.length} task(s), ${result.data.totalEstimatedLabourHours} h estimated`,
  };
}

/**
 * §30-§31's internal technical review — approve, or reject with a reason.
 *
 * The empty-note check is client-side convenience only for the rejection case; the
 * service enforces it, and migration 014's CHECK constraint enforces it again.
 */
export async function reviewRepairPlanAction(formData: FormData): Promise<ActionResult> {
  const planId = String(formData.get('planId') ?? '').trim();
  const decision = String(formData.get('decision') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();

  if (!planId) {
    return { error: 'That repair plan could not be identified. Reload the page.' };
  }
  if (decision !== 'approved' && decision !== 'rejected') {
    return { error: 'Choose whether to approve or reject the plan.' };
  }
  if (decision === 'rejected' && note === '') {
    return {
      error:
        'A rejection must say why — “return to technician” and “request additional test” ARE the reason, and the technician cannot act on “rejected” alone.',
    };
  }

  const result = await apiPost<{ jobNumber: string; status: string }>(
    'workshop',
    `/repair-plans/${planId}/review`,
    { decision, note: note === '' ? undefined : note },
  );

  if (!result.ok) {
    return { error: explain(result.reason, result.message) };
  }

  revalidateAll();
  return {
    created:
      result.data.status === 'approved'
        ? `Repair plan approved for ${result.data.jobNumber} — it can now be quoted`
        : `Repair plan rejected for ${result.data.jobNumber} — the technician has been given the reason`,
  };
}
