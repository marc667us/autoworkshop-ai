import { z } from 'zod';
import { requiredText } from '../common/validation/validated-body';

/**
 * Request schemas for the organization endpoints.
 *
 * ⚠️ `ORG_TYPES` MIRRORS A DATABASE CHECK CONSTRAINT
 * (`001_tenancy_foundation.sql`, `identity.organizations.org_type`). Two lists
 * that must agree are a drift risk, so `organization.schemas.spec.ts` reads the
 * migration and fails if they diverge — the same shape as the existing check
 * that `CAN_INSPECT` agrees with `ROLE_TARGET_STAGES`.
 *
 * Validating here as well as in the database is deliberate, not redundant. The
 * CHECK constraint rejects a bad value with a Postgres error that surfaces as a
 * 500 and names an internal constraint; this rejects it as a 400 that names the
 * field and lists what is allowed.
 */
export const ORG_TYPES = [
  'vehicle_owner',
  'individual_workshop',
  'multi_branch_workshop',
  'mobile_technician',
  'parts_supplier',
  'fleet_operator',
  'insurance_company',
  'towing_company',
  'training_institution',
  'platform_operator',
] as const;

export const CreateOrganizationBody = z.object({
  name: requiredText(200),
  orgType: z.enum(ORG_TYPES),
});

export type CreateOrganizationBody = z.infer<typeof CreateOrganizationBody>;
