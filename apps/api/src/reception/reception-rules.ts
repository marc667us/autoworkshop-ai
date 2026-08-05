/**
 * Who may do what at the front desk — slice 2 of `COMPLETION_PLAN.md`.
 *
 * ⚠️ SEPARATE FROM THE SERVICE, like `quality-rules.ts` and `variation-rules.ts`
 * before it. Rules that live in their own module can be unit-tested without a
 * database, and — more usefully — they can be READ without reading a service.
 *
 * ⚠️ THESE ARE ROLE RULES, NOT THE PERMISSION MATRIX. `permission-matrix.ts`
 * carries the three keys the NAVIGATION gates on (`finance.read`,
 * `organization.admin`, `platform.admin`). Booking an appointment is not any of
 * those: §48 gives reception "appointment, intake" functions and §47 gives the
 * manager the same group, while a technician's tree contains neither. There is
 * no permission key that separates them, which is exactly why the workshop
 * workspace is route-gated rather than permission-gated (see
 * `check-page-gates.sh`'s ROUTE_GATED_APPS note).
 */

/** `07.txt` pt2 §46-§48 — the three roles that run the front of the workshop. */
const FRONT_DESK = ['workshop_owner', 'workshop_manager', 'reception_staff'] as const;

/**
 * Who may take a booking, record a walk-in, or receive a vehicle.
 *
 * A technician is deliberately absent: §49's tree has no reception group at all,
 * and a technician booking work for themselves is how a workshop's schedule
 * stops meaning anything.
 */
export function mayTakeBookings(role: string | null | undefined): boolean {
  return FRONT_DESK.includes((role ?? '') as (typeof FRONT_DESK)[number]);
}

/**
 * Who may configure the bays.
 *
 * ⚠️ NARROWER THAN BOOKING, and that is the point. Reception assigns a car to a
 * bay every day; deciding that the workshop HAS a paint booth is a change to the
 * business, which §46 gives the owner and §47 the manager. `core.service_bays`
 * is workshop configuration (slice 6 territory) that landed early because an
 * appointment cannot be scheduled against nothing.
 */
export function mayConfigureBays(role: string | null | undefined): boolean {
  return role === 'workshop_owner' || role === 'workshop_manager';
}

/**
 * Who may publish the workshop's reply to a customer's feedback.
 *
 * The customer's own words are append-only in the database
 * (`trg_feedback_rewrite`); this decides who speaks for the workshop, which is
 * not everyone who can read the review.
 */
export function mayRespondToFeedback(role: string | null | undefined): boolean {
  return role === 'workshop_owner' || role === 'workshop_manager';
}

/** The statuses an appointment may be moved to, from where. */
export const APPOINTMENT_TRANSITIONS: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    booked: ['confirmed', 'arrived', 'cancelled', 'no_show'],
    confirmed: ['arrived', 'cancelled', 'no_show'],
    // `converted` is NOT reachable by a status change. It is set only by the
    // act of opening a job card from the appointment, together with the card's
    // id, because `chk_appt_converted` requires both — a status that could be
    // set on its own would be a claim the database refuses.
    arrived: ['cancelled', 'no_show'],
    no_show: ['booked'],
    // Terminal. Re-booking is a new appointment: the record that somebody
    // cancelled, and why, is worth keeping.
    cancelled: [],
    converted: [],
  });

export class ReceptionInputError extends Error {}

/**
 * Validate a status move and say why when it is refused.
 *
 * ⚠️ EVERY REFUSAL NAMES WHAT IS POSSIBLE INSTEAD. "A rule whose escape hatch is
 * unreachable is a wall, not a rule" is the most expensive defect class recorded
 * in this repository, and a bare "invalid transition" is exactly that shape.
 */
export function parseAppointmentTransition(from: string, to: string): string {
  const allowed = APPOINTMENT_TRANSITIONS[from];
  if (!allowed) {
    throw new ReceptionInputError(`'${from}' is not an appointment status this workshop uses.`);
  }
  if (from === to) {
    throw new ReceptionInputError(`This appointment is already ${from.replace('_', ' ')}.`);
  }
  if (!allowed.includes(to)) {
    if (allowed.length === 0) {
      throw new ReceptionInputError(
        `A ${from.replace('_', ' ')} appointment cannot be changed. ` +
          'Book a new appointment instead — the record of this one is kept deliberately.',
      );
    }
    throw new ReceptionInputError(
      `A ${from.replace('_', ' ')} appointment cannot become ${to.replace('_', ' ')}. ` +
        `It can be marked: ${allowed.map((s) => s.replace('_', ' ')).join(', ')}.`,
    );
  }
  return to;
}
