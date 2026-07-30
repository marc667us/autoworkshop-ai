'use server';

import { revalidatePath } from 'next/cache';
import { apiDelete, apiPatch, apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * Recording and reviewing a diagnosis — `07.txt` §3026-§3046, `02.txt` §1260-§1294.
 *
 * IN ITS OWN `'use server'` MODULE, the same discipline as `inspection-actions.ts`
 * and `stage-actions.ts`: a module whose first line is `'use server'` cannot become
 * a client module without someone deleting that line on purpose, so the
 * access-token handling inside `apiPost`/`apiPatch`/`apiDelete` cannot drift into
 * the browser.
 *
 * ⚠️ NOT THE AUTHORIZATION POINT. Next exposes one public HTTP endpoint per server
 * action, so anyone can call these directly with any payload. Every rule lives in
 * `DiagnosisService`: which roles may record (`07.txt` pt2 §50), which may REVIEW
 * (§1292), that a reviewer is not the submitter (`2.txt` §563), whether the card
 * has reached diagnosis, whether the record is still open, and that a submitted
 * diagnosis says something. The screen only decides what to OFFER.
 */

/**
 * The API's own sentence is passed through for `invalid` and `forbidden`.
 *
 * Same judgement as `inspection-actions.ts`, and it earns more here: the two most
 * important refusals in this slice are sentences. "You submitted this diagnosis and
 * cannot also review it" (403) and "a diagnosis cannot be submitted with no
 * findings recorded; record at least one finding — a fault ruled out is a finding
 * too, recorded as 'excluded'" (400) both tell the reader exactly what to do.
 * Replacing either with "That was not accepted" would turn a solvable situation
 * into a mystery.
 *
 * They publish nothing: the roles are on the org chart and the rule is workshop
 * process, not system internals.
 *
 * ⚠️ `conflict` IS NOT A REASON IN THIS CLIENT. `api.ts` maps 400, 409 AND 422 all
 * to `invalid` and only those three carry the API's `message`, so the service's
 * 409s — a submitted record, a second open diagnosis, a review that already
 * happened — arrive here as `invalid` WITH their sentence intact. A `conflict` case
 * would be a branch that never runs.
 */
function explain(
  reason: 'unauthenticated' | 'forbidden' | 'notFound' | 'invalid' | 'unavailable',
  message: string | undefined,
): string {
  switch (reason) {
    case 'invalid':
    case 'forbidden':
      return message ?? 'That was not accepted.';
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
 * Every route that renders a diagnosis or the stage behind it.
 *
 * All four trees, because the same record is reachable from the §34 default, the
 * §46 owner tree, the §47 manager queue and the §49 technician tree. Revalidating
 * only the route the user happened to be on is how two screens end up disagreeing
 * about whether a diagnosis has been reviewed.
 */
const DIAGNOSIS_ROUTES = [
  '/repair-services/diagnosis',
  '/repair-control/diagnosis',
  '/repair-control/diagnosis-queue',
  '/record-work/diagnostic-results',
  // The staging board and job-card lists show the stage this work sits behind.
  '/workshop-floor/repair-staging',
  '/workshop-operations/repair-staging',
  '/workshop-floor/job-cards',
  '/workshop-operations/job-cards',
  '/home/my-assigned-work',
];

function revalidateAll(): void {
  for (const route of DIAGNOSIS_ROUTES) revalidatePath(route);
}

/** §3020-§3024 — the technician begins diagnosing an assigned job. */
export async function startDiagnosisAction(formData: FormData): Promise<ActionResult> {
  const jobCardId = String(formData.get('jobCardId') ?? '').trim();
  if (!jobCardId) {
    return { error: 'Choose a job card to diagnose.' };
  }

  const result = await apiPost<{ id: string; jobNumber: string; attemptNo: number }>(
    'workshop',
    `/job-cards/${jobCardId}/diagnoses`,
    {},
  );

  if (!result.ok) {
    return { error: explain(result.reason, result.message) };
  }

  revalidateAll();
  return { created: `Diagnosis started for ${result.data.jobNumber}` };
}

/**
 * §3026-§3046 — record one finding.
 *
 * `faultCode` is omitted rather than sent as an empty string when blank: plenty of
 * real faults set no diagnostic trouble code, and an empty string stored in that
 * column is a different thing from "there isn't one".
 */
export async function addFindingAction(formData: FormData): Promise<ActionResult> {
  const diagnosisId = String(formData.get('diagnosisId') ?? '').trim();
  if (!diagnosisId) {
    return { error: 'That diagnosis could not be identified. Reload the page.' };
  }

  const faultDescription = String(formData.get('faultDescription') ?? '').trim();
  const affectedSystem = String(formData.get('affectedSystem') ?? '').trim();

  // Checked here as well as server-side so the technician gets an answer without a
  // round trip. NOT a substitute for the API's rule — that is what actually holds.
  if (faultDescription === '') {
    return { error: 'Describe the fault. A finding with no description is not a finding.' };
  }
  if (affectedSystem === '') {
    return { error: 'Choose the affected system.' };
  }

  const text = (name: string): string | undefined => {
    const value = String(formData.get(name) ?? '').trim();
    return value === '' ? undefined : value;
  };

  const result = await apiPost<{ findings: unknown[] }>(
    'workshop',
    `/diagnoses/${diagnosisId}/findings`,
    {
      faultDescription,
      affectedSystem,
      faultCode: text('faultCode'),
      observedSymptom: text('observedSymptom'),
      testPerformed: text('testPerformed'),
      expectedResult: text('expectedResult'),
      actualResult: text('actualResult'),
      interpretation: text('interpretation'),
      // Defaults to `suspected` server-side if the form omits it — the honest
      // default for a diagnosis in progress.
      findingStatus: text('findingStatus'),
      // A checkbox is absent from the FormData when unticked, so this is `true`
      // only when it was actually ticked. Sending `false` explicitly rather than
      // omitting it keeps the update path's "omitted means unchanged" rule honest.
      additionalInspectionRequired: formData.get('additionalInspectionRequired') !== null,
    },
  );

  if (!result.ok) {
    return { error: explain(result.reason, result.message) };
  }

  revalidateAll();
  return { created: `Finding recorded — ${result.data.findings.length} on this diagnosis` };
}

/**
 * Move a finding between §1290's three standings.
 *
 * A narrow action on purpose: this is the one change a technician makes repeatedly
 * as testing progresses, and the confirmation signature §1294 requires is applied
 * server-side from the caller's own identity — the form cannot name a confirmer.
 */
export async function setFindingStatusAction(formData: FormData): Promise<ActionResult> {
  const diagnosisId = String(formData.get('diagnosisId') ?? '').trim();
  const findingId = String(formData.get('findingId') ?? '').trim();
  const findingStatus = String(formData.get('findingStatus') ?? '').trim();

  if (!diagnosisId || !findingId) {
    return { error: 'That finding could not be identified. Reload the page.' };
  }
  if (findingStatus === '') {
    return { error: 'Choose a standing for the finding.' };
  }

  const result = await apiPatch<{ findings: unknown[] }>(
    'workshop',
    `/diagnoses/${diagnosisId}/findings/${findingId}`,
    { findingStatus },
  );

  if (!result.ok) {
    return { error: explain(result.reason, result.message) };
  }

  revalidateAll();
  return { created: 'Finding updated' };
}

/**
 * Correct a finding's details — the fault code and the §3036-§3040 evidence.
 *
 * ⚠️ SENDS `null` FOR AN EMPTIED FIELD, DELIBERATELY. The service reads `null` as
 * "clear this column" and an ABSENT key as "leave it alone", and a technician who
 * blanks the fault-code box means the first. Without this the only way to remove a
 * wrong code was to delete the whole finding and retype the reasoning — destroying
 * the record around a field in order to fix that field.
 *
 * `faultDescription` and `affectedSystem` are sent as values, never as null: the
 * database declares them NOT NULL, and the service answers a clean 400 naming the
 * field if either arrives empty.
 */
export async function updateFindingDetailsAction(formData: FormData): Promise<ActionResult> {
  const diagnosisId = String(formData.get('diagnosisId') ?? '').trim();
  const findingId = String(formData.get('findingId') ?? '').trim();
  if (!diagnosisId || !findingId) {
    return { error: 'That finding could not be identified. Reload the page.' };
  }

  const faultDescription = String(formData.get('faultDescription') ?? '').trim();
  if (faultDescription === '') {
    return { error: 'A finding must keep a fault description.' };
  }

  // `null` rather than `undefined` for the clearable fields — see the note above.
  // `JSON.stringify` would DROP an undefined value, which is exactly what "leave it
  // alone" means and exactly not what an emptied input means.
  const clearable = (name: string): string | null => {
    const value = String(formData.get(name) ?? '').trim();
    return value === '' ? null : value;
  };

  const result = await apiPatch<{ findings: unknown[] }>(
    'workshop',
    `/diagnoses/${diagnosisId}/findings/${findingId}`,
    {
      faultDescription,
      affectedSystem: String(formData.get('affectedSystem') ?? '').trim(),
      faultCode: clearable('faultCode'),
      observedSymptom: clearable('observedSymptom'),
      testPerformed: clearable('testPerformed'),
      expectedResult: clearable('expectedResult'),
      actualResult: clearable('actualResult'),
      interpretation: clearable('interpretation'),
      additionalInspectionRequired: formData.get('additionalInspectionRequired') !== null,
    },
  );

  if (!result.ok) {
    return { error: explain(result.reason, result.message) };
  }

  revalidateAll();
  return { created: 'Finding corrected' };
}

/**
 * Remove a finding entered in error, while the diagnosis is still open.
 *
 * ⚠️ THE ESCAPE HATCH, and it is here because the alternatives are all worse:
 * `excluded` means "a fault I ruled out" and recording a typo as one puts a false
 * statement in the record; a second attempt cannot be started while this one is
 * open. Without it a wrong finding would stand for good — a rule refusing something
 * while naming an unreachable alternative, which is the trap slice 3a paid for.
 */
export async function removeFindingAction(formData: FormData): Promise<ActionResult> {
  const diagnosisId = String(formData.get('diagnosisId') ?? '').trim();
  const findingId = String(formData.get('findingId') ?? '').trim();
  if (!diagnosisId || !findingId) {
    return { error: 'That finding could not be identified. Reload the page.' };
  }

  const result = await apiDelete<{ findings: unknown[] }>(
    'workshop',
    `/diagnoses/${diagnosisId}/findings/${findingId}`,
  );

  if (!result.ok) {
    return { error: explain(result.reason, result.message) };
  }

  revalidateAll();
  return { created: 'Finding removed' };
}

/** §376's technician notes on the diagnosis as a whole. */
export async function recordDiagnosisSummaryAction(formData: FormData): Promise<ActionResult> {
  const diagnosisId = String(formData.get('diagnosisId') ?? '').trim();
  if (!diagnosisId) {
    return { error: 'That diagnosis could not be identified. Reload the page.' };
  }
  const summary = String(formData.get('summary') ?? '').trim();
  if (summary === '') {
    return { error: 'Write the notes before saving.' };
  }

  const result = await apiPatch<{ id: string }>('workshop', `/diagnoses/${diagnosisId}`, {
    summary,
  });

  if (!result.ok) {
    return { error: explain(result.reason, result.message) };
  }

  revalidateAll();
  return { created: 'Notes saved' };
}

/** §1292 — submit for supervisor review. */
export async function submitDiagnosisAction(formData: FormData): Promise<ActionResult> {
  const diagnosisId = String(formData.get('diagnosisId') ?? '').trim();
  if (!diagnosisId) {
    return { error: 'That diagnosis could not be identified. Reload the page.' };
  }

  const result = await apiPost<{ jobNumber: string; confirmedCount: number }>(
    'workshop',
    `/diagnoses/${diagnosisId}/submit`,
    {},
  );

  if (!result.ok) {
    return { error: explain(result.reason, result.message) };
  }

  revalidateAll();
  return {
    created:
      `Diagnosis submitted for review — ${result.data.jobNumber}, ` +
      `${result.data.confirmedCount} confirmed fault(s)`,
  };
}

/**
 * §1292's review — approve, or reject with a reason.
 *
 * The empty-note check is client-side convenience only for the rejection case; the
 * service enforces it, and the migration's CHECK constraint enforces it again.
 */
export async function reviewDiagnosisAction(formData: FormData): Promise<ActionResult> {
  const diagnosisId = String(formData.get('diagnosisId') ?? '').trim();
  const decision = String(formData.get('decision') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();

  if (!diagnosisId) {
    return { error: 'That diagnosis could not be identified. Reload the page.' };
  }
  if (decision !== 'approved' && decision !== 'rejected') {
    return { error: 'Choose whether to approve or reject the diagnosis.' };
  }
  if (decision === 'rejected' && note === '') {
    return {
      error:
        'A rejection must say why — the technician cannot act on “rejected” alone.',
    };
  }

  const result = await apiPost<{ jobNumber: string; status: string }>(
    'workshop',
    `/diagnoses/${diagnosisId}/review`,
    { decision, note: note === '' ? undefined : note },
  );

  if (!result.ok) {
    return { error: explain(result.reason, result.message) };
  }

  revalidateAll();
  return {
    created:
      result.data.status === 'approved'
        ? `Diagnosis approved for ${result.data.jobNumber}`
        : `Diagnosis rejected for ${result.data.jobNumber} — the technician has been given the reason`,
  };
}
