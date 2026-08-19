'use server';

import type { ActionResult } from '@autoworkshop/ui';
import { addOrgMember, withdrawOrgMember } from '../../_shared/org-staff/org-staff-core';

/**
 * The fleet pack's entry points into the shared org-staff actions.
 *
 * ⚠️ THIN ON PURPOSE. The rules live once in `org-staff-core.ts`; what belongs
 * here is the pair of values that must NOT come from the client — the workspace
 * id, which decides the API credential and cookie scope, and the paths to
 * revalidate. Binding them in a `'use server'` module makes them server-side
 * constants rather than form fields.
 */

const REVALIDATE = ['/fleet/settings/users'] as const;

export async function addFleetMemberAction(formData: FormData): Promise<ActionResult> {
  return addOrgMember('fleet', REVALIDATE, formData);
}

export async function withdrawFleetMemberAction(formData: FormData): Promise<ActionResult> {
  return withdrawOrgMember('fleet', REVALIDATE, formData);
}
