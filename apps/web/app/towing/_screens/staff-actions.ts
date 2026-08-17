'use server';

import type { ActionResult } from '@autoworkshop/ui';
import { addOrgMember, withdrawOrgMember } from '../../_shared/org-staff/org-staff-core';

/**
 * The towing pack's entry points into the shared org-staff actions.
 *
 * ⚠️ THIN ON PURPOSE — see the insurance equivalent. What belongs here is the
 * pair of values that must NOT come from the client: the workspace id and the
 * paths to revalidate.
 */

/**
 * The towing tree has no separate "Users" entry — §52 gives it one `settings`
 * entry — so the people list lives on the settings page and that is the path
 * to revalidate. Adding a nav entry §52 does not define would be changing
 * approved navigation, which CLAUDE.md prohibits without review.
 */
const REVALIDATE = ['/towing/operations/settings'] as const;

export async function addTowingMemberAction(formData: FormData): Promise<ActionResult> {
  return addOrgMember('towing', REVALIDATE, formData);
}

export async function withdrawTowingMemberAction(formData: FormData): Promise<ActionResult> {
  return withdrawOrgMember('towing', REVALIDATE, formData);
}
