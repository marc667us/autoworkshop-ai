import { z } from 'zod';
import { optionalText, requiredText, uuid } from '../common/validation/validated-body';

/**
 * Request schemas for the reception controller — slice 2 of `COMPLETION_PLAN.md`.
 *
 * Same division as `repair.schemas.ts`: these refuse what is STRUCTURALLY
 * impossible, and `ReceptionService` + `reception-rules.ts` refuse what is
 * contextually wrong. The status vocabularies are deliberately NOT enumerated
 * here — `parseAppointmentTransition` owns them, because whether a move is legal
 * depends on the CURRENT status, which no flat enum can express.
 */

export const CreateBayBody = z
  .object({
    name: requiredText(120),
    bayType: optionalText(40),
    notes: optionalText(1000),
  })
  .strict();
export type CreateBayBody = z.infer<typeof CreateBayBody>;

export const RetireBayBody = z.object({ isActive: z.boolean() }).strict();
export type RetireBayBody = z.infer<typeof RetireBayBody>;

export const CreateAppointmentBody = z
  .object({
    customerId: uuid(),
    vehicleId: uuid().optional(),
    serviceSummary: requiredText(1000),
    /** ISO 8601. The service re-parses and refuses what `Date` cannot read. */
    scheduledFor: requiredText(40),
    // Bounded at one day. An appointment longer than that is a project, and an
    // unbounded integer here is how a calendar ends up drawing a single booking
    // across the next four years.
    durationMinutes: z.number().int().min(5).max(60 * 24).optional(),
    bayId: uuid().optional(),
    assignedTo: uuid().optional(),
    contactPhone: optionalText(40),
    notes: optionalText(2000),
  })
  .strict();
export type CreateAppointmentBody = z.infer<typeof CreateAppointmentBody>;

export const ChangeAppointmentStatusBody = z
  .object({
    status: requiredText(40),
    cancellationReason: optionalText(1000),
  })
  .strict();
export type ChangeAppointmentStatusBody = z.infer<typeof ChangeAppointmentStatusBody>;

export const CreateWalkInBody = z
  .object({
    contactName: requiredText(200),
    contactPhone: optionalText(40),
    // Free text on purpose: the whole point of a walk-in is that neither the
    // person nor the car is on file yet, and someone is standing at the counter.
    vehicleDescription: requiredText(500),
    registrationNumber: optionalText(40),
    complaint: requiredText(2000),
  })
  .strict();
export type CreateWalkInBody = z.infer<typeof CreateWalkInBody>;

export const CloseWalkInBody = z
  .object({
    status: requiredText(40),
    outcomeNote: optionalText(2000),
  })
  .strict();
export type CloseWalkInBody = z.infer<typeof CloseWalkInBody>;

export const RecordFeedbackBody = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: optionalText(4000),
    customerId: uuid().optional(),
    jobCardId: uuid().optional(),
  })
  .strict();
export type RecordFeedbackBody = z.infer<typeof RecordFeedbackBody>;

export const RespondToFeedbackBody = z
  .object({ response: requiredText(4000) })
  .strict();
export type RespondToFeedbackBody = z.infer<typeof RespondToFeedbackBody>;

/**
 * The customer's Request for Service — the owner's value chain, step 5.
 *
 * ⚠️ NO `requestedBy`, AND THAT IS THE POINT. The author is taken from the
 * validated token subject in the service. Accepting it here would let anyone
 * file a request in somebody else's name, and the workshop would ring the wrong
 * person about a car that is not theirs.
 *
 * `organizationId` IS accepted, because the customer is choosing a workshop from
 * a public directory — it is the one field that legitimately names something
 * outside the caller's own organisation. It is the deliberate exception, and the
 * migration's INSERT policy is written to permit exactly it.
 *
 * The vehicle is free text for the same reason a walk-in's is: at this moment
 * neither the person nor the car is on file at that workshop.
 */
export const CreateServiceRequestBody = z
  .object({
    organizationId: z.string().uuid(),
    vehicleId: z.string().uuid().optional(),
    vehicleDescription: requiredText(500),
    registrationNumber: optionalText(40),
    complaint: requiredText(2000),
    preferredContact: optionalText(200),
  })
  .strict();
export type CreateServiceRequestBody = z.infer<typeof CreateServiceRequestBody>;

/**
 * Reception's decision on an incoming request.
 *
 * `declineReason` is not optional when declining — the database refuses that
 * combination too (`ck_service_request_declined`). Both layers, because
 * "Declined" with no reason is the message the customer actually receives.
 */
export const DecideServiceRequestBody = z
  .object({
    status: z.enum(['accepted', 'declined']),
    declineReason: optionalText(1000),
  })
  .strict();
export type DecideServiceRequestBody = z.infer<typeof DecideServiceRequestBody>;
