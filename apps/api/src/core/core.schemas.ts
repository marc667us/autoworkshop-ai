import { z } from 'zod';
import {
  optionalText,
  requiredText,
  uuid,
  wholeNumber,
} from '../common/validation/validated-body';

/**
 * Request schemas for customers and vehicles.
 *
 * ⚠️ THIS FILE EXISTS BECAUSE A SURVEY MISSED THE CONTROLLER. The sweep that
 * found the unvalidated write endpoints globbed `*.controller.ts`, and both
 * this module and `identity` name their file `*.controllers.ts` — plural. Two
 * whole controllers were therefore reported as "no writes" and the endpoint
 * count given to the owner was short. Codex caught the identity one; this was
 * found by re-listing the directory instead of trusting the same pattern twice.
 *
 * The lesson is the measurement, not the schemas: a glob is a guess about
 * naming, and a survey built on one silently under-reports.
 */

const dateish = () =>
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}([T ].*)?$/, 'must be an ISO date (YYYY-MM-DD)');

export const CreateCustomerBody = z.object({
  displayName: requiredText(200),
  customerType: optionalText(40),
  // Bounded, and shaped: an address that is not one is a bounced invoice.
  email: z.string().trim().email('must be an email address').max(320).optional(),
  phone: optionalText(40),
  preferredContact: optionalText(40),
  location: optionalText(300),
  notes: optionalText(4000),
});
export type CreateCustomerBody = z.infer<typeof CreateCustomerBody>;

export const CreateVehicleBody = z.object({
  customerId: uuid(),
  registrationNumber: requiredText(40),
  makeId: uuid(),
  modelId: uuid().optional(),
  // A VIN is 17 characters by ISO 3779. Left as a bounded string rather than a
  // strict pattern because older and rebuilt vehicles legitimately carry
  // shorter or non-conforming numbers, and refusing those would block intake.
  vin: optionalText(40),
  variant: optionalText(120),
  modelYear: wholeNumber(2200).optional(),
  engineType: optionalText(80),
  transmissionType: optionalText(80),
  fuelType: optionalText(60),
  currentMileageKm: wholeNumber(10_000_000).optional(),
  colour: optionalText(60),
  insurerName: optionalText(200),
  insurancePolicyNo: optionalText(120),
  insuranceExpiresOn: dateish().optional(),
});
export type CreateVehicleBody = z.infer<typeof CreateVehicleBody>;
