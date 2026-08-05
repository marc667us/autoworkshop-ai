'use server';

import { revalidatePath } from 'next/cache';
import { apiPatch, apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * Slice 6 write actions — opening hours, service categories, approval limits,
 * templates, notification preferences, workflow rules, integrations, branches.
 *
 * IN THEIR OWN `'use server'` MODULE, for the reason `register-actions.ts`
 * gives. NOT the authorization point: `SettingsService` decides who may change
 * configuration, and — separately — who may change MONEY limits and connected
 * accounts, which is the owner alone (CLAUDE.md §8: hidden is not secure).
 */

function explain(
  reason: 'unauthenticated' | 'forbidden' | 'notFound' | 'invalid' | 'unavailable',
  message: string | undefined,
  fallback: string,
): string {
  switch (reason) {
    case 'invalid':
    case 'forbidden':
      // The API's own sentence. Every refusal it makes names a reachable
      // alternative, and that is the only part the reader can act on.
      return message ?? fallback;
    case 'notFound':
      return 'That setting no longer exists.';
    case 'unauthenticated':
      return 'Your session has ended. Sign in again.';
    default:
      return 'The settings service did not respond. Nothing was saved.';
  }
}

/** Every settings write changes what other screens render, so revalidate wide. */
function refresh(): void {
  revalidatePath('/', 'layout');
}

export async function setOpeningHoursAction(formData: FormData): Promise<ActionResult> {
  const isClosed = String(formData.get('isClosed') ?? '') === 'on';
  const body: Record<string, unknown> = {
    weekday: Number(formData.get('weekday')),
    isClosed,
    isPublished: String(formData.get('isPublished') ?? '') === 'on',
  };
  // Only send times for an open day. Sending them alongside `isClosed` would be
  // refused by the CHECK in migration 045, which is the correct place for the
  // rule — this just avoids asking the database to reject something obvious.
  if (!isClosed) {
    body.opensAt = String(formData.get('opensAt') ?? '');
    body.closesAt = String(formData.get('closesAt') ?? '');
  }

  const result = await apiPost('workshop', '/settings/opening-hours', body);
  if (!result.ok) {
    return { error: explain(result.reason, result.message, 'The opening hours were not saved.') };
  }
  refresh();
  return { created: 'Opening hours saved.' };
}

export async function createServiceCategoryAction(formData: FormData): Promise<ActionResult> {
  const body: Record<string, unknown> = {
    name: String(formData.get('name') ?? ''),
    isPublished: String(formData.get('isPublished') ?? '') === 'on',
  };
  const description = String(formData.get('description') ?? '').trim();
  if (description) body.description = description;
  for (const key of ['defaultDurationMinutes', 'indicativePrice'] as const) {
    const raw = String(formData.get(key) ?? '').trim();
    if (raw === '') continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) continue;
    body[key] = key === 'indicativePrice' ? n : Math.floor(n);
  }

  const result = await apiPost('workshop', '/settings/service-categories', body);
  if (!result.ok) {
    return { error: explain(result.reason, result.message, 'The service category was not added.') };
  }
  refresh();
  return { created: 'Service category added.' };
}

export async function setServiceCategoryActiveAction(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get('id') ?? '');
  const isActive = String(formData.get('isActive') ?? '') === 'true';
  const result = await apiPatch('workshop', `/settings/service-categories/${id}`, { isActive });
  if (!result.ok) {
    return { error: explain(result.reason, result.message, 'The service category was not changed.') };
  }
  refresh();
  return { created: isActive ? 'Service category reactivated.' : 'Service category deactivated.' };
}

export async function setApprovalLimitAction(formData: FormData): Promise<ActionResult> {
  const result = await apiPost('workshop', '/settings/approval-limits', {
    roleName: String(formData.get('roleName') ?? ''),
    scope: String(formData.get('scope') ?? ''),
    // 0 is a real answer — "may approve nothing" — so this is not guarded by a
    // falsy check the way an optional number would be.
    maxAmount: Number(formData.get('maxAmount')),
  });
  if (!result.ok) {
    return { error: explain(result.reason, result.message, 'The approval limit was not saved.') };
  }
  refresh();
  return { created: 'Approval limit saved.' };
}

export async function saveTemplateAction(formData: FormData): Promise<ActionResult> {
  const body: Record<string, unknown> = {
    templateKey: String(formData.get('templateKey') ?? ''),
    channel: String(formData.get('channel') ?? ''),
    name: String(formData.get('name') ?? ''),
    body: String(formData.get('body') ?? ''),
  };
  const subject = String(formData.get('subject') ?? '').trim();
  if (subject) body.subject = subject;

  const result = await apiPost('workshop', '/settings/templates', body);
  if (!result.ok) {
    return { error: explain(result.reason, result.message, 'The template was not saved.') };
  }
  refresh();
  return { created: 'Template saved.' };
}

export async function setNotificationPrefAction(formData: FormData): Promise<ActionResult> {
  const result = await apiPost('workshop', '/settings/notification-preferences', {
    eventKey: String(formData.get('eventKey') ?? ''),
    channel: String(formData.get('channel') ?? ''),
    isEnabled: String(formData.get('isEnabled') ?? '') === 'on',
  });
  if (!result.ok) {
    return { error: explain(result.reason, result.message, 'The preference was not saved.') };
  }
  refresh();
  return { created: 'Notification preference saved.' };
}

export async function createWorkflowRuleAction(formData: FormData): Promise<ActionResult> {
  const body: Record<string, unknown> = {
    name: String(formData.get('name') ?? ''),
    triggerEvent: String(formData.get('triggerEvent') ?? ''),
    actionKind: String(formData.get('actionKind') ?? ''),
  };
  const order = String(formData.get('executionOrder') ?? '').trim();
  if (order !== '' && Number.isFinite(Number(order))) {
    body.executionOrder = Math.floor(Number(order));
  }

  const result = await apiPost('workshop', '/settings/workflow-rules', body);
  if (!result.ok) {
    return { error: explain(result.reason, result.message, 'The rule was not added.') };
  }
  refresh();
  return { created: 'Rule added.' };
}

export async function saveIntegrationAction(formData: FormData): Promise<ActionResult> {
  // 🔴 THE CONFIG IS BUILT FROM NAMED FIELDS, NEVER FROM THE WHOLE FORM.
  // Sweeping every FormData entry into `config` would forward whatever the page
  // happened to contain — including a field somebody adds later called
  // `api_key`. The database refuses credential-shaped keys and the service
  // translates that refusal into a sentence, but relying on that as the FIRST
  // line rather than the last is how a secret reaches a database row.
  const config: Record<string, string> = {};
  for (const key of ['accountLabel', 'senderId', 'region', 'endpoint'] as const) {
    const v = String(formData.get(key) ?? '').trim();
    if (v) config[key] = v;
  }

  const result = await apiPost('workshop', '/settings/integrations', {
    providerKind: String(formData.get('providerKind') ?? ''),
    providerName: String(formData.get('providerName') ?? ''),
    status: String(formData.get('status') ?? 'configured'),
    config,
  });
  if (!result.ok) {
    return { error: explain(result.reason, result.message, 'The connection was not saved.') };
  }
  refresh();
  return { created: 'Connection settings saved.' };
}

export async function createBranchAction(formData: FormData): Promise<ActionResult> {
  const body: Record<string, unknown> = { name: String(formData.get('name') ?? '') };
  const location = String(formData.get('location') ?? '').trim();
  if (location) body.location = location;

  const result = await apiPost('workshop', '/settings/branches', body);
  if (!result.ok) {
    return { error: explain(result.reason, result.message, 'The branch was not added.') };
  }
  refresh();
  return { created: 'Branch added.' };
}
