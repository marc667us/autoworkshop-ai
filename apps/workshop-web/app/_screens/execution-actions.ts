'use server';

import { revalidatePath } from 'next/cache';
import { apiPatch, apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * Carrying out the authorised repair — `07.txt` §31-§33.
 *
 * IN ITS OWN `'use server'` MODULE, so the access-token handling inside `apiPost`
 * cannot drift into the browser.
 *
 * ⚠️ NOT THE AUTHORIZATION POINT. Every rule lives in `ExecutionService`: who may carry
 * out a repair, that an APPROVED customer proposal exists (§7), that a blocked task
 * says why, that nothing is still clocked on before completion, and that a finished
 * record freezes.
 */

function explain(
  reason: 'unauthenticated' | 'noMembership' | 'forbidden' | 'notFound' | 'invalid' | 'unavailable',
  message: string | undefined,
): string {
  switch (reason) {
    case 'invalid':
    case 'forbidden':
      // The API's own sentence — these refusals name the unfinished tasks and the
      // running clocks, which is what the technician needs.
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
      return 'That record is no longer available to you. Reload the page.';
    default:
      return 'The service did not respond. Nothing was recorded — try again shortly.';
  }
}

const EXECUTION_ROUTES = [
  '/repair-services/repairs-in-progress',
  '/repair-control/repairs-in-progress',
  '/repair-control/repair-progress',
  '/record-work/repair-tasks',
  '/record-work/time-records',
  '/record-work/parts-used',
  '/record-work/repair-evidence',
  '/workshop-floor/repair-staging',
  '/workshop-operations/repair-staging',
  '/home/my-assigned-work',
];

function revalidateAll(): void {
  for (const r of EXECUTION_ROUTES) revalidatePath(r);
}

const text = (f: FormData, n: string): string | undefined => {
  const v = String(f.get(n) ?? '').trim();
  return v === '' ? undefined : v;
};

/** §3 — "The technician selects 'Start Repair.'" */
export async function startRepairAction(formData: FormData): Promise<ActionResult> {
  const jobCardId = String(formData.get('jobCardId') ?? '').trim();
  if (!jobCardId) return { error: 'Choose a job card.' };

  const result = await apiPost<{ id: string; jobNumber: string; tasks: unknown[] }>(
    'workshop',
    `/job-cards/${jobCardId}/executions`,
    { serviceBay: text(formData, 'serviceBay') },
  );
  if (!result.ok) return { error: explain(result.reason, result.message) };

  revalidateAll();
  return {
    created: `Repair started on ${result.data.jobNumber} — ${result.data.tasks.length} approved task(s) to do`,
  };
}

/** §32's five pre-start confirmations. */
export async function recordReadinessAction(formData: FormData): Promise<ActionResult> {
  const executionId = String(formData.get('executionId') ?? '').trim();
  if (!executionId) return { error: 'That repair could not be identified. Reload the page.' };

  const result = await apiPatch<{ id: string }>('workshop', `/repair-executions/${executionId}`, {
    // A checkbox is absent from the FormData when unticked, so each of these is `true`
    // only when actually ticked.
    customerApprovalConfirmed: formData.get('customerApprovalConfirmed') !== null,
    partsAvailableConfirmed: formData.get('partsAvailableConfirmed') !== null,
    toolsAvailableConfirmed: formData.get('toolsAvailableConfirmed') !== null,
    bayAvailableConfirmed: formData.get('bayAvailableConfirmed') !== null,
    safetyConfirmed: formData.get('safetyConfirmed') !== null,
    serviceBay: String(formData.get('serviceBay') ?? '').trim() || null,
    readinessNote: String(formData.get('readinessNote') ?? '').trim() || null,
  });
  if (!result.ok) return { error: explain(result.reason, result.message) };

  revalidateAll();
  return { created: 'Checks recorded' };
}

/** §6 — record task completion, or that a task is blocked or not required. */
export async function setTaskStatusAction(formData: FormData): Promise<ActionResult> {
  const executionId = String(formData.get('executionId') ?? '').trim();
  const taskId = String(formData.get('taskId') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim();
  const statusNote = String(formData.get('statusNote') ?? '').trim();

  if (!executionId || !taskId) return { error: 'That task could not be identified. Reload the page.' };
  if (status === '') return { error: 'Choose a status for the task.' };
  if ((status === 'blocked' || status === 'skipped') && statusNote === '') {
    return {
      error:
        status === 'blocked'
          ? 'Say what is blocking it — nobody else can unblock a task with no reason.'
          : 'Say why it is not required. The customer approved it, so its absence needs an explanation.',
    };
  }

  const result = await apiPatch<{ tasks: unknown[] }>(
    'workshop',
    `/repair-executions/${executionId}/tasks/${taskId}`,
    { status, statusNote: statusNote === '' ? undefined : statusNote },
  );
  if (!result.ok) return { error: explain(result.reason, result.message) };

  revalidateAll();
  return { created: 'Task updated' };
}

/** §33's Start Work / Resume Work, or the start of a non-productive spell. */
export async function startTimeAction(formData: FormData): Promise<ActionResult> {
  const executionId = String(formData.get('executionId') ?? '').trim();
  const entryKind = String(formData.get('entryKind') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();

  if (!executionId) return { error: 'That repair could not be identified. Reload the page.' };
  if (entryKind === '') return { error: 'Choose what you are recording time against.' };
  if (entryKind !== 'productive' && note === '') {
    return { error: 'Say what the delay is — non-productive time with no note cannot be chased.' };
  }

  const result = await apiPost<{ runningEntryCount: number }>(
    'workshop',
    `/repair-executions/${executionId}/time-entries`,
    {
      entryKind,
      executionTaskId: text(formData, 'executionTaskId'),
      serviceBay: text(formData, 'serviceBay'),
      note: note === '' ? undefined : note,
    },
  );
  if (!result.ok) return { error: explain(result.reason, result.message) };

  revalidateAll();
  return { created: entryKind === 'productive' ? 'Clock started' : 'Delay recorded' };
}

/** §33's Pause Work — close this technician's running entry. */
export async function stopTimeAction(formData: FormData): Promise<ActionResult> {
  const executionId = String(formData.get('executionId') ?? '').trim();
  if (!executionId) return { error: 'That repair could not be identified. Reload the page.' };

  const result = await apiPost<{ productiveHours: number }>(
    'workshop',
    `/repair-executions/${executionId}/time-entries/stop`,
    {},
  );
  if (!result.ok) return { error: explain(result.reason, result.message) };

  revalidateAll();
  return { created: `Clock stopped — ${result.data.productiveHours} h worked` };
}

/** §7 — a part actually fitted, which is not the same as a part planned. */
export async function recordPartUsedAction(formData: FormData): Promise<ActionResult> {
  const executionId = String(formData.get('executionId') ?? '').trim();
  if (!executionId) return { error: 'That repair could not be identified. Reload the page.' };

  const description = String(formData.get('description') ?? '').trim();
  if (description === '') return { error: 'Name the part you fitted.' };

  const raw = String(formData.get('quantity') ?? '').trim();
  // `Number('')` is 0, not NaN — handled before the conversion so a blank box is
  // "tell me" rather than a silent zero.
  if (raw === '') return { error: 'Enter how many you used.' };
  const quantity = Number(raw);
  if (!Number.isFinite(quantity)) return { error: 'The quantity must be a number.' };

  const result = await apiPost<{ partsUsed: unknown[] }>(
    'workshop',
    `/repair-executions/${executionId}/parts-used`,
    {
      description,
      quantity,
      partNumber: text(formData, 'partNumber'),
      unit: text(formData, 'unit'),
      note: text(formData, 'note'),
      executionTaskId: text(formData, 'executionTaskId'),
      repairPlanResourceId: text(formData, 'repairPlanResourceId'),
    },
  );
  if (!result.ok) return { error: explain(result.reason, result.message) };

  revalidateAll();
  return { created: `Part recorded — ${result.data.partsUsed.length} fitted so far` };
}

/** §8-§9 — a measurement, a photograph, an observation. */
export async function recordEvidenceAction(formData: FormData): Promise<ActionResult> {
  const executionId = String(formData.get('executionId') ?? '').trim();
  if (!executionId) return { error: 'That repair could not be identified. Reload the page.' };

  const evidenceKind = String(formData.get('evidenceKind') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const recordedValue = String(formData.get('recordedValue') ?? '').trim();

  if (evidenceKind === '') return { error: 'Choose what kind of evidence this is.' };
  if (description === '') return { error: 'Describe what you observed.' };
  if (evidenceKind === 'measurement' && recordedValue === '') {
    return { error: 'Record the reading you took. A measurement with no value is an observation.' };
  }

  const result = await apiPost<{ evidence: unknown[] }>(
    'workshop',
    `/repair-executions/${executionId}/evidence`,
    {
      evidenceKind,
      description,
      recordedValue: recordedValue === '' ? undefined : recordedValue,
      externalReference: text(formData, 'externalReference'),
      executionTaskId: text(formData, 'executionTaskId'),
    },
  );
  if (!result.ok) return { error: explain(result.reason, result.message) };

  revalidateAll();
  return { created: `Evidence recorded — ${result.data.evidence.length} item(s)` };
}

/** §13 — complete the authorised repair. */
export async function completeRepairAction(formData: FormData): Promise<ActionResult> {
  const executionId = String(formData.get('executionId') ?? '').trim();
  if (!executionId) return { error: 'That repair could not be identified. Reload the page.' };

  const result = await apiPost<{ jobNumber: string; productiveHours: number }>(
    'workshop',
    `/repair-executions/${executionId}/complete`,
    {
      completionNote: text(formData, 'completionNote'),
      // §10 — anything CHARGEABLE recorded here must become a variation rather than
      // simply being done, and the screen says so beside the box.
      unexpectedFindings: text(formData, 'unexpectedFindings'),
    },
  );
  if (!result.ok) return { error: explain(result.reason, result.message) };

  revalidateAll();
  return {
    created: `Repair completed on ${result.data.jobNumber} — ${result.data.productiveHours} h worked`,
  };
}
