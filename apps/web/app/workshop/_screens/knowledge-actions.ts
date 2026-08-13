'use server';

import { revalidatePath } from 'next/cache';
import { apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * Slice 10 write actions — articles, procedures, diagrams, courses,
 * certifications.
 *
 * NOT the authorization point: `KnowledgeService` decides who may add to the
 * library, and it deliberately lets every workshop role READ it.
 */

function explain(
  reason: 'unauthenticated' | 'noMembership' | 'forbidden' | 'notFound' | 'invalid' | 'unavailable',
  message: string | undefined,
  fallback: string,
): string {
  switch (reason) {
    case 'invalid':
    case 'forbidden':
    case 'notFound':
      // The API's own sentence — its refusals name what the reader can still
      // do ("everything here stays readable to you", "add them under Staff and
      // Roles first"), and that is the only actionable part.
      return message ?? fallback;
    case 'noMembership':
      // 🔴 NOT "your session has ended". This viewer IS signed in; they belong
      // to no workshop. Saying otherwise sends them to sign in again, which
      // changes nothing, and they loop.
      return (
        'You are signed in, but your account does not belong to a workshop yet. ' +
        'Create one from the dashboard, or ask the workshop owner to add you.'
      );
    case 'unauthenticated':
      return 'Your session has ended. Sign in again.';
    default:
      return 'The knowledge service did not respond. Nothing was saved.';
  }
}

function put(formData: FormData, keys: readonly string[], body: Record<string, unknown>): void {
  for (const key of keys) {
    const v = String(formData.get(key) ?? '').trim();
    if (v) body[key] = v;
  }
}

function putNumber(formData: FormData, key: string, body: Record<string, unknown>): void {
  const raw = String(formData.get(key) ?? '').trim();
  if (raw === '') return;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) body[key] = Math.floor(n);
}

export async function createArticleAction(formData: FormData): Promise<ActionResult> {
  const body: Record<string, unknown> = {
    title: String(formData.get('title') ?? ''),
    body: String(formData.get('body') ?? ''),
    category: String(formData.get('category') ?? 'general'),
  };
  put(formData, ['faultCode'], body);

  const result = await apiPost('workshop', '/knowledge/articles', body);
  if (!result.ok) return { error: explain(result.reason, result.message, 'The note was not saved.') };
  revalidatePath('/', 'layout');
  return { created: 'Note saved to the knowledge base.' };
}

export async function createProcedureAction(formData: FormData): Promise<ActionResult> {
  const body: Record<string, unknown> = {
    title: String(formData.get('title') ?? ''),
    steps: String(formData.get('steps') ?? ''),
  };
  put(formData, ['appliesTo', 'safetyNotes', 'requiresCertification'], body);
  putNumber(formData, 'estimatedMinutes', body);

  const result = await apiPost('workshop', '/knowledge/procedures', body);
  if (!result.ok) return { error: explain(result.reason, result.message, 'The procedure was not saved.') };
  revalidatePath('/', 'layout');
  return { created: 'Procedure saved.' };
}

export async function createDiagramAction(formData: FormData): Promise<ActionResult> {
  const body: Record<string, unknown> = {
    title: String(formData.get('title') ?? ''),
    diagramKind: String(formData.get('diagramKind') ?? 'wiring'),
    // Defaults to `own`. Never defaulted to `licensed` — that would let
    // somebody assert a licence by not choosing, on the one field here with
    // legal weight.
    source: String(formData.get('source') ?? 'own'),
  };
  put(formData, ['appliesTo', 'licenceNote'], body);

  const result = await apiPost('workshop', '/knowledge/diagrams', body);
  if (!result.ok) return { error: explain(result.reason, result.message, 'The diagram was not saved.') };
  revalidatePath('/', 'layout');
  return { created: 'Diagram recorded.' };
}

export async function createCourseAction(formData: FormData): Promise<ActionResult> {
  const body: Record<string, unknown> = { title: String(formData.get('title') ?? '') };
  put(formData, ['description', 'provider', 'grantsCertification'], body);
  putNumber(formData, 'durationMinutes', body);

  const result = await apiPost('workshop', '/knowledge/courses', body);
  if (!result.ok) return { error: explain(result.reason, result.message, 'The course was not saved.') };
  revalidatePath('/', 'layout');
  return { created: 'Course saved.' };
}

export async function recordCertificationAction(formData: FormData): Promise<ActionResult> {
  const body: Record<string, unknown> = {
    userId: String(formData.get('userId') ?? ''),
    name: String(formData.get('name') ?? ''),
    awardedOn: String(formData.get('awardedOn') ?? ''),
  };
  put(formData, ['expiresOn', 'reference', 'courseId'], body);

  const result = await apiPost('workshop', '/knowledge/certifications', body);
  if (!result.ok) {
    return { error: explain(result.reason, result.message, 'The certification was not recorded.') };
  }
  revalidatePath('/', 'layout');
  return { created: 'Certification recorded.' };
}
