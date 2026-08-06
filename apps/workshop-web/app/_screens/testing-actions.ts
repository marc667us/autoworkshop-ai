'use server';

import { revalidatePath } from 'next/cache';
import { apiDelete, apiPatch, apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * Post-repair testing — `07.txt` §34-§36.
 *
 * IN ITS OWN `'use server'` MODULE, so the access-token handling inside `apiPost`
 * cannot drift into the browser.
 *
 * ⚠️ NOT THE AUTHORIZATION POINT. Every rule lives in `TestingService`: who may record
 * results, who may approve releasing a car with a live critical fault (a NARROWER set —
 * §35's approval cannot be your own), that a failure says something, and that a road
 * test recorded as performed is complete.
 */

function explain(
  reason: 'unauthenticated' | 'noMembership' | 'forbidden' | 'notFound' | 'invalid' | 'unavailable',
  message: string | undefined,
): string {
  switch (reason) {
    case 'invalid':
    case 'forbidden':
      // The API's own sentence — §35's refusal names the section and says the approval
      // cannot be your own, which is exactly what the technician needs to read.
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

const TESTING_ROUTES = [
  '/repair-services/testing',
  '/repair-control/testing',
  '/repair-control/testing-queue',
  '/testing/repair-test-results',
  '/testing/post-repair-scan',
  '/testing/road-test',
  '/testing/submit-to-quality-control',
  '/workshop-floor/repair-staging',
  '/workshop-operations/repair-staging',
];

function revalidateAll(): void {
  for (const r of TESTING_ROUTES) revalidatePath(r);
}

const text = (f: FormData, n: string): string | undefined => {
  const v = String(f.get(n) ?? '').trim();
  return v === '' ? undefined : v;
};
const clearable = (f: FormData, n: string): string | null => {
  const v = String(f.get(n) ?? '').trim();
  return v === '' ? null : v;
};

/** §34 — begin recording results, once the repair is complete. */
export async function startTestSessionAction(formData: FormData): Promise<ActionResult> {
  const jobCardId = String(formData.get('jobCardId') ?? '').trim();
  if (!jobCardId) return { error: 'Choose a job card.' };

  const result = await apiPost<{ id: string; jobNumber: string }>(
    'workshop',
    `/job-cards/${jobCardId}/test-sessions`,
    {},
  );
  if (!result.ok) return { error: explain(result.reason, result.message) };

  revalidateAll();
  return { created: `Testing started on ${result.data.jobNumber}` };
}

/** §34 — record one test result. */
export async function recordTestResultAction(formData: FormData): Promise<ActionResult> {
  const sessionId = String(formData.get('sessionId') ?? '').trim();
  if (!sessionId) return { error: 'That test session could not be identified. Reload the page.' };

  const testCategory = String(formData.get('testCategory') ?? '').trim();
  const testName = String(formData.get('testName') ?? '').trim();
  const outcome = String(formData.get('outcome') ?? '').trim();
  const actualResult = String(formData.get('actualResult') ?? '').trim();
  const comments = String(formData.get('comments') ?? '').trim();

  if (testCategory === '') return { error: 'Choose what kind of test this was.' };
  if (testName === '') return { error: 'Name the test.' };
  if (outcome !== 'pass' && outcome !== 'fail') return { error: 'Record whether it passed or failed.' };
  if (outcome === 'fail' && actualResult === '' && comments === '') {
    // Checked here so the technician gets an answer without a round trip. NOT a
    // substitute for the API's rule, which is what actually holds.
    return {
      error: 'Say what actually happened, or add a comment. Quality control cannot act on “fail” alone.',
    };
  }

  const result = await apiPost<{ results: unknown[] }>(
    'workshop',
    `/test-sessions/${sessionId}/results`,
    {
      testCategory,
      testName,
      outcome,
      actualResult: actualResult === '' ? undefined : actualResult,
      comments: comments === '' ? undefined : comments,
      testProcedure: text(formData, 'testProcedure'),
      testEquipment: text(formData, 'testEquipment'),
      equipmentIdentifier: text(formData, 'equipmentIdentifier'),
      calibrationStatus: text(formData, 'calibrationStatus'),
      expectedResult: text(formData, 'expectedResult'),
      unitOfMeasurement: text(formData, 'unitOfMeasurement'),
    },
  );
  if (!result.ok) return { error: explain(result.reason, result.message) };

  revalidateAll();
  return { created: `Result recorded — ${result.data.results.length} test(s) so far` };
}

/** Remove a result recorded in error, while the session is open. */
export async function removeTestResultAction(formData: FormData): Promise<ActionResult> {
  const sessionId = String(formData.get('sessionId') ?? '').trim();
  const resultId = String(formData.get('resultId') ?? '').trim();
  if (!sessionId || !resultId) return { error: 'That result could not be identified. Reload the page.' };

  const result = await apiDelete<{ results: unknown[] }>(
    'workshop',
    `/test-sessions/${sessionId}/results/${resultId}`,
  );
  if (!result.ok) return { error: explain(result.reason, result.message) };

  revalidateAll();
  return { created: 'Result removed' };
}

/** §35 — the post-repair diagnostic scan. */
export async function recordScanAction(formData: FormData): Promise<ActionResult> {
  const sessionId = String(formData.get('sessionId') ?? '').trim();
  if (!sessionId) return { error: 'That test session could not be identified. Reload the page.' };

  const result = await apiPatch<{ criticalFaultsRemain: boolean }>(
    'workshop',
    `/test-sessions/${sessionId}/scan`,
    {
      // Checkboxes are absent from the FormData when unticked.
      scanPerformed: formData.get('scanPerformed') !== null,
      criticalFaultsRemain: formData.get('criticalFaultsRemain') !== null,
      // An emptied box CLEARS the field — every one of these columns is nullable.
      preRepairFaultCodes: clearable(formData, 'preRepairFaultCodes'),
      codesCleared: clearable(formData, 'codesCleared'),
      codesRemaining: clearable(formData, 'codesRemaining'),
      newCodes: clearable(formData, 'newCodes'),
      liveDataChecks: clearable(formData, 'liveDataChecks'),
      systemReadiness: clearable(formData, 'systemReadiness'),
      warningLightStatus: clearable(formData, 'warningLightStatus'),
    },
  );
  if (!result.ok) return { error: explain(result.reason, result.message) };

  revalidateAll();
  return {
    created: result.data.criticalFaultsRemain
      ? 'Scan recorded — a critical fault remains, so the release needs documented approval'
      : 'Scan recorded',
  };
}

/** §36 — the road test. */
export async function recordRoadTestAction(formData: FormData): Promise<ActionResult> {
  const sessionId = String(formData.get('sessionId') ?? '').trim();
  if (!sessionId) return { error: 'That test session could not be identified. Reload the page.' };

  const num = (n: string): number | undefined => {
    const raw = String(formData.get(n) ?? '').trim();
    // `Number('')` is 0, not NaN — handled before the conversion so a blank odometer box
    // is "not recorded" rather than a car that has done zero miles.
    if (raw === '') return undefined;
    const v = Number(raw);
    return Number.isFinite(v) ? Math.trunc(v) : Number.NaN;
  };
  const start = num('roadTestStartMileage');
  const end = num('roadTestEndMileage');
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return { error: 'The mileage readings must be numbers.' };
  }

  const result = await apiPatch<{ roadTestDistance: number | null }>(
    'workshop',
    `/test-sessions/${sessionId}/road-test`,
    {
      roadTestPerformed: formData.get('roadTestPerformed') !== null,
      roadTestDriver: clearable(formData, 'roadTestDriver'),
      roadTestStartMileage: start,
      roadTestEndMileage: end,
      roadTestRoute: clearable(formData, 'roadTestRoute'),
      roadTestWeather: clearable(formData, 'roadTestWeather'),
      roadTestRoadCondition: clearable(formData, 'roadTestRoadCondition'),
      roadTestInitialSymptom: clearable(formData, 'roadTestInitialSymptom'),
      roadTestOutcome: clearable(formData, 'roadTestOutcome'),
      roadTestNotes: clearable(formData, 'roadTestNotes'),
    },
  );
  if (!result.ok) return { error: explain(result.reason, result.message) };

  revalidateAll();
  return {
    created:
      result.data.roadTestDistance !== null
        ? `Road test recorded — ${result.data.roadTestDistance} miles`
        : 'Road test recorded',
  };
}

/**
 * §35's DOCUMENTED APPROVAL — release a vehicle with an unresolved critical fault.
 *
 * ⚠️ THIS IS NOT A CHECKBOX. It is a decision with a name against it, held to a narrower
 * set of roles than testing itself, and the service refuses it from the technician who
 * recorded the fault.
 */
export async function approveCriticalOverrideAction(formData: FormData): Promise<ActionResult> {
  const sessionId = String(formData.get('sessionId') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim();
  if (!sessionId) return { error: 'That test session could not be identified. Reload the page.' };
  if (reason === '') {
    return {
      error: 'Say why the vehicle may be released with the fault still present. This is the record a safety review reads.',
    };
  }

  const result = await apiPost<{ overrideApprovedByName: string | null }>(
    'workshop',
    `/test-sessions/${sessionId}/critical-override`,
    { reason },
  );
  if (!result.ok) return { error: explain(result.reason, result.message) };

  revalidateAll();
  return { created: `Release approved by ${result.data.overrideApprovedByName ?? 'you'}` };
}

/** Submit for quality control — slice 9 answers it. */
export async function submitTestSessionAction(formData: FormData): Promise<ActionResult> {
  const sessionId = String(formData.get('sessionId') ?? '').trim();
  if (!sessionId) return { error: 'That test session could not be identified. Reload the page.' };

  const result = await apiPost<{ jobNumber: string; passCount: number; failCount: number }>(
    'workshop',
    `/test-sessions/${sessionId}/submit`,
    {},
  );
  if (!result.ok) return { error: explain(result.reason, result.message) };

  revalidateAll();
  return {
    created:
      `Submitted for quality control — ${result.data.jobNumber}, ` +
      `${result.data.passCount} passed, ${result.data.failCount} failed`,
  };
}
