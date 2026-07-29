'use server';

import { revalidatePath } from 'next/cache';
import { apiPatch, apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * Recording an initial inspection — `07.txt` §2920-§2978.
 *
 * IN ITS OWN `'use server'` MODULE, the same discipline as `stage-actions.ts`:
 * a module whose first line is `'use server'` cannot become a client module
 * without someone deleting that line on purpose, so the access-token handling
 * inside `apiPost`/`apiPatch` cannot drift into the browser.
 *
 * ⚠️ NOT THE AUTHORIZATION POINT. Next exposes one public HTTP endpoint per
 * server action, so anyone can call these directly with any payload. Every rule
 * lives in `InspectionService`: which roles may record (`07.txt` pt2 §50),
 * whether the card's vehicle is actually present, whether the sheet is still
 * open, and whether every checkpoint is answered. The screen only decides what
 * to OFFER.
 */

/**
 * The API's own sentence is passed through for `invalid` and `forbidden`, the
 * same judgement `stage-actions.ts` made and for the same reason: these refusals
 * are about the SHEET and the workshop's process, not about the viewer's
 * standing. "The inspection cannot be submitted with 2 checkpoint(s) unanswered:
 * Brakes, Tyres" is precisely what the technician needs, and it publishes nothing
 * — the checklist is on the wall.
 *
 * ⚠️ `conflict` IS NOT A REASON IN THIS CLIENT. `api.ts` maps 400, 409 AND 422
 * all to `invalid` and only those three carry the API's `message`. So the
 * service's 409s — a submitted sheet, a second open inspection — arrive here as
 * `invalid` WITH their sentence intact, which is what matters. Adding a
 * `conflict` case would be a branch that never runs.
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
      return 'That job card is no longer available to you. Reload the page.';
    default:
      return 'The service did not respond. Nothing was recorded — try again shortly.';
  }
}

/**
 * Every route that renders an inspection or a stage.
 *
 * All four trees, because the same sheet is reachable from the §34 default, the
 * §46 owner tree, the §47 manager tree and the §49 technician tree. Revalidating
 * only the route the user happened to be on is how two screens end up disagreeing
 * about whether an inspection is finished.
 */
const INSPECTION_ROUTES = [
  '/repair-services/inspection',
  '/repair-control/inspection',
  '/repair-control/inspection-queue',
  '/record-work/inspection-results',
  // The staging board and job card lists show the stage this work sits behind.
  '/workshop-floor/repair-staging',
  '/workshop-operations/repair-staging',
  '/workshop-floor/job-cards',
  '/workshop-operations/job-cards',
  '/home/my-assigned-work',
];

function revalidateAll(): void {
  for (const route of INSPECTION_ROUTES) revalidatePath(route);
}

/** §2924 — "The technician selects 'Start Inspection.'" */
export async function startInspectionAction(formData: FormData): Promise<ActionResult> {
  const jobCardId = String(formData.get('jobCardId') ?? '').trim();
  const mileage = String(formData.get('mileageReading') ?? '').trim();

  if (!jobCardId) {
    return { error: 'Choose a job card to inspect.' };
  }

  const result = await apiPost<{ id: string; jobNumber: string; attemptNo: number }>(
    'workshop',
    `/job-cards/${jobCardId}/inspections`,
    // Omitted rather than sent as an empty string or NaN: the service defaults it
    // to the mileage reception recorded at the door, and sending `0` would
    // silently overwrite that with a reading nobody took.
    mileage === '' ? {} : { mileageReading: Number(mileage) },
  );

  if (!result.ok) {
    return { error: explain(result.reason, result.message) };
  }

  revalidateAll();
  return { created: `Inspection started for ${result.data.jobNumber}` };
}

/**
 * §2968-§2978 — record results and notes against the checklist.
 *
 * Reads the answers out of the form by NAME rather than from a fixed list: the
 * checklist is rendered from the API's own sheet, so a checkpoint added to the
 * template appears here without this file changing. Anything unanswered is
 * omitted, so a partly-completed sheet saves what was done and leaves the rest
 * genuinely unanswered rather than defaulting it to a pass nobody recorded.
 */
export async function recordInspectionAction(formData: FormData): Promise<ActionResult> {
  const inspectionId = String(formData.get('inspectionId') ?? '').trim();
  if (!inspectionId) {
    return { error: 'That inspection could not be identified. Reload the page.' };
  }

  const items: Array<{ checkpointCode: string; result: string; note?: string }> = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('result:')) continue;
    const code = key.slice('result:'.length);
    const result = String(value).trim();
    // '' is the "not yet answered" option. Skipped, not sent — the API would
    // reject it, and more importantly an unanswered checkpoint must STAY
    // unanswered so submission can refuse the sheet.
    if (result === '') continue;
    const note = String(formData.get(`note:${code}`) ?? '').trim();
    items.push({ checkpointCode: code, result, note: note === '' ? undefined : note });
  }

  const summary = String(formData.get('summary') ?? '').trim();
  const mileage = String(formData.get('mileageReading') ?? '').trim();

  if (items.length === 0 && summary === '' && mileage === '') {
    return { error: 'Record at least one result before saving.' };
  }

  const result = await apiPatch<{ answeredCount: number; items: unknown[] }>(
    'workshop',
    `/inspections/${inspectionId}/items`,
    {
      items,
      summary: summary === '' ? undefined : summary,
      mileageReading: mileage === '' ? undefined : Number(mileage),
    },
  );

  if (!result.ok) {
    return { error: explain(result.reason, result.message) };
  }

  revalidateAll();
  return {
    created: `Saved — ${result.data.answeredCount} of ${result.data.items.length} checkpoints answered`,
  };
}

/** Submit — the sheet becomes the finding of record and stops being writable. */
export async function submitInspectionAction(formData: FormData): Promise<ActionResult> {
  const inspectionId = String(formData.get('inspectionId') ?? '').trim();
  if (!inspectionId) {
    return { error: 'That inspection could not be identified. Reload the page.' };
  }

  const result = await apiPost<{ jobNumber: string; findingCount: number }>(
    'workshop',
    `/inspections/${inspectionId}/submit`,
    {},
  );

  if (!result.ok) {
    return { error: explain(result.reason, result.message) };
  }

  revalidateAll();
  return {
    created:
      `Inspection submitted for ${result.data.jobNumber} — ` +
      `${result.data.findingCount} item(s) need attention`,
  };
}
