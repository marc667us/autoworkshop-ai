import { BadRequestException } from '@nestjs/common';

/**
 * Input validation for the core domain, in the SERVICE layer.
 *
 * WHY NOT A CONTROLLER DTO. `0.txt` §13/§26: a REST controller and an MCP tool
 * are both thin callers of the same service, so a rule enforced by a controller
 * pipe does not exist for an AI agent calling the service directly. Validation
 * that only some callers get is not validation.
 *
 * WHY IT EXISTS AT ALL (Codex review of this slice, P2 — accepted). Only the
 * `customerId` QUERY parameter carried `ParseUUIDPipe`; the ids in a POST BODY
 * did not. A malformed `customerId`, `makeId` or `modelId` therefore reached a
 * comparison against a `uuid` column and PostgreSQL raised `22P02
 * invalid_text_representation` — surfacing as a 500 that reads like an outage,
 * for what is simply a bad field. The same applied to the CHECK-constrained
 * columns: a bad `fuelType` became a raw constraint violation rather than a
 * message naming the field.
 */

// Canonical 8-4-4-4-12 hex form. Deliberately not a "looks roughly like a uuid"
// pattern: this value is about to be compared against a uuid column, and the
// only thing worth accepting is what that column can hold.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new BadRequestException(`${field} must be a UUID`);
  }
  return value;
}

/** Same, but `undefined`/`null` is allowed through as `null`. */
export function optionalUuid(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  return requireUuid(value, field);
}

/**
 * One of a fixed set, or a 400 naming the field.
 *
 * The allowed values are passed in by the caller rather than imported from the
 * migration, because they cannot be imported from it — which means these lists
 * and the SQL CHECK constraints are two statements of the same rule and can
 * drift. The constraint is the authority; this exists so the common case is a
 * clear 400 instead of a 500, NOT so the constraint can be removed.
 */
export function requireOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new BadRequestException(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

export function optionalOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T | null {
  if (value === undefined || value === null || value === '') return null;
  return requireOneOf(value, allowed, field);
}

/**
 * A whole number within bounds, or null.
 *
 * `Number.isInteger` rejects `NaN`, `Infinity` and `1.5` — all of which a JSON
 * body can carry and none of which an odometer reading or a model year is.
 */
export function optionalInt(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new BadRequestException(`${field} must be a whole number between ${min} and ${max}`);
  }
  return value;
}

/** `YYYY-MM-DD`, and a real date — `2026-02-31` parses but does not exist. */
export function optionalDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException(`${field} must be a date in YYYY-MM-DD form`);
  }
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`${field} is not a real date`);
  }
  return value;
}

/** Trimmed, non-empty, and within the column's practical limit. */
export function requireText(value: unknown, field: string, max = 200): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new BadRequestException(`${field} is required`);
  if (text.length > max) {
    throw new BadRequestException(`${field} must be ${max} characters or fewer`);
  }
  return text;
}

export function optionalText(value: unknown, field: string, max = 200): string | null {
  if (value === undefined || value === null) return null;
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  if (text.length > max) {
    throw new BadRequestException(`${field} must be ${max} characters or fewer`);
  }
  return text;
}

/**
 * An email address, or null.
 *
 * ⚠️ SERVER-SIDE ON PURPOSE, and it was missing (Codex review of slice 2, P2).
 * The form marks the field `type="email"`, but `FormShell` sets `noValidate` so
 * that its own submit handler controls the submission — which switched the
 * browser's native check off. Nothing on the server checked either, so
 * `not-an-email` was accepted and persisted. A client-side constraint is a
 * convenience for the user, never the rule: anything calling `POST /customers`
 * directly, including an MCP tool, bypasses it entirely.
 *
 * Deliberately PERMISSIVE — one `@`, a dot in the domain, no whitespace. Email
 * syntax is far broader than the patterns usually written for it, and a strict
 * regex here would reject valid addresses (`+` tags, long TLDs, unicode local
 * parts) which is a worse failure than accepting an odd one. Deliverability is
 * proven by sending mail, not by a regex.
 */
export function optionalEmail(value: unknown, field: string): string | null {
  const text = optionalText(value, field, 320);
  if (text === null) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    throw new BadRequestException(`${field} must be a valid email address`);
  }
  return text;
}

/** The CHECK-constrained vocabularies from migration 004. */
export const CUSTOMER_TYPES = ['individual', 'business'] as const;
export const CONTACT_METHODS = ['phone', 'email', 'sms', 'in_app'] as const;
export const TRANSMISSIONS = ['manual', 'automatic', 'cvt', 'dual_clutch', 'other'] as const;
export const FUEL_TYPES = ['petrol', 'diesel', 'hybrid', 'electric', 'lpg', 'cng', 'other'] as const;
