'use server';

import type { ActionResult } from '@autoworkshop/ui';
import { addOrgMember, withdrawOrgMember } from '../../_shared/org-staff/org-staff-core';

/**
 * The insurance pack's entry points into the shared org-staff actions.
 *
 * ⚠️ THIN ON PURPOSE. The rules live once in `org-staff-core.ts`; what belongs
 * here is the pair of values that must NOT come from the client: the workspace
 * id (which decides the API credential and cookie scope) and the paths to
 * revalidate. Binding them in a `'use server'` module makes them server-side
 * constants rather than form fields.
 */

/** Every route that renders this organisation's people. */
const REVALIDATE = ['/insurance/settings/users'] as const;

export async function addInsuranceMemberAction(formData: FormData): Promise<ActionResult> {
  return addOrgMember('insurance', REVALIDATE, formData);
}

export async function withdrawInsuranceMemberAction(formData: FormData): Promise<ActionResult> {
  return withdrawOrgMember('insurance', REVALIDATE, formData);
}
