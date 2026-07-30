/**
 * Execution labels — shared by the server screens and the client forms.
 *
 * A SEPARATE, PURE MODULE, the discipline every slice here follows: a `'use client'`
 * form importing a constant out of a server screen would drag that module — and its API
 * client and token handling — into the browser bundle.
 */

export const EXECUTION_STATUS_LABEL: Record<string, string> = {
  in_progress: 'In progress',
  completed: 'Completed',
  abandoned: 'Abandoned',
};

export const EXECUTION_STATUS_KIND: Record<string, 'active' | 'attention' | 'blocked' | 'draft'> = {
  in_progress: 'attention',
  completed: 'active',
  abandoned: 'blocked',
};

/** §6's task states. */
export const TASK_STATUS_ORDER = [
  'pending',
  'in_progress',
  'completed',
  'blocked',
  'skipped',
] as const;

export const TASK_STATUS_LABEL: Record<string, string> = {
  pending: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  blocked: 'Blocked',
  skipped: 'Not required',
};

/**
 * `blocked` is the strongest signal — somebody outside the bench has to act on it.
 * `skipped` is muted: it is a legitimate outcome carrying a mandatory reason, and a
 * list where "not required" shouts as loudly as "blocked" is one nobody can scan.
 */
export const TASK_STATUS_KIND: Record<string, 'active' | 'attention' | 'blocked' | 'draft'> = {
  pending: 'draft',
  in_progress: 'attention',
  completed: 'active',
  blocked: 'blocked',
  skipped: 'draft',
};

/** §33's time categories, in the specification's order. */
export const TIME_KIND_ORDER = [
  'productive',
  'waiting_for_parts',
  'waiting_for_approval',
  'tool_delay',
  'additional_diagnosis',
  'other_non_productive',
] as const;

export const TIME_KIND_LABEL: Record<string, string> = {
  productive: 'Working',
  waiting_for_parts: 'Waiting for parts',
  waiting_for_approval: 'Waiting for approval',
  tool_delay: 'Tool or equipment delay',
  additional_diagnosis: 'Additional diagnosis',
  other_non_productive: 'Other non-productive time',
};

/** §8-§9's evidence kinds. */
export const EVIDENCE_KIND_ORDER = [
  'observation',
  'measurement',
  'photo',
  'video',
  'document',
] as const;

export const EVIDENCE_KIND_LABEL: Record<string, string> = {
  observation: 'Observation',
  measurement: 'Measurement',
  photo: 'Photograph',
  video: 'Video',
  document: 'Document',
};

/**
 * Hours, as a technician reads them.
 *
 * `1.50 h` rather than `1.5 h` — the trailing digit says the figure is precise to the
 * minute rather than rounded, which matters when it sits next to an estimate.
 */
export function formatHours(hours: number | null): string {
  if (hours === null) return 'running';
  return `${hours.toFixed(2)} h`;
}
