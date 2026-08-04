import { BadRequestException, PipeTransform } from '@nestjs/common';
import { z, ZodTypeAny } from 'zod';

/**
 * Runtime validation of request bodies, at the boundary.
 *
 * ── 🔴 WHY THIS EXISTS ─────────────────────────────────────────────────────
 *
 * Every write endpoint in this API declared its body as a TypeScript type:
 *
 *     @Body() body: { mileageReading?: number }
 *
 * **TypeScript types are erased at runtime.** That annotation documents an
 * intention and enforces NOTHING — the handler accepts a string, an array, a
 * nested object, `null`, or a payload with a hundred unexpected keys, and hands
 * it straight to a service. Reading the controllers, it looks thoroughly typed.
 * Sixty-four write endpoints looked thoroughly typed.
 *
 * Some services then re-checked some fields (`diagnosis.service.ts` raises
 * "summary must be a string, or null to clear it"), which is why this was not
 * catastrophic — but the coverage was uneven, the checks lived AFTER the
 * boundary, and no two endpoints reported a problem the same way.
 *
 * ── WHY ZOD, AND WHY NOT A GLOBAL PIPE ─────────────────────────────────────
 *
 * Zod is the validation library this project's own stack table already names
 * (`CLAUDE.md`, Forms & Validation). It is MIT-licensed, so the zero-cost rule
 * holds.
 *
 * A NestJS `ValidationPipe` was the obvious alternative and is REJECTED here on
 * purpose: it validates by reading `class-validator` decorators off DTO
 * classes, so installing it globally over handlers that have no DTOs would
 * validate NOTHING while making every controller look guarded. That is this
 * repository's most expensive recurring defect — a mechanism that reads correct
 * and never runs — and it would have been introduced by the very change meant
 * to close the gap. A schema passed explicitly at the call site cannot be
 * silently absent: there is no schema, or there is one, and it is visible on
 * the line.
 *
 * ── EVERY PROBLEM AT ONCE ──────────────────────────────────────────────────
 *
 * `parsePricingInput` learned this the hard way (Codex, 2026-08-01): reporting
 * only the FIRST bad field makes a user fix a form one round-trip at a time.
 * Zod collects all issues by default and this pipe preserves every one of them.
 *
 * ── UNKNOWN KEYS ARE REJECTED ──────────────────────────────────────────────
 *
 * `.strict()` is applied to every object schema by `validatedBody` below, so a
 * body carrying a field the endpoint does not accept is REFUSED rather than
 * quietly ignored. Silently dropping an unexpected key is how a client believes
 * it set something it did not — and how a renamed field turns into data loss
 * that surfaces days later. It also stops a caller smuggling a field that some
 * downstream spread (`{...body}`) would pick up.
 */

/** The shape of a validation failure. Structured, per CLAUDE.md §15. */
export interface ValidationProblem {
  /** Dotted path to the offending field, or '(body)' for the root. */
  field: string;
  message: string;
}

/**
 * 🔴 MESSAGES ARE REBUILT FROM THE ISSUE CODE, NEVER TAKEN FROM ZOD VERBATIM.
 *
 * An earlier version of this function returned `issue.message` and a comment
 * here asserted that Zod never quotes the received value. THAT WAS WRONG, and
 * Codex caught it: `invalid_enum_value` renders as
 *
 *     Invalid enum value. Expected 'a' | 'b', received 'whatever-was-sent'
 *
 * so a body of `{"orgType": "<a token>"}` would have put that token into a 400
 * response and into every log that recorded it. `unrecognized_keys` likewise
 * echoes caller-supplied key names.
 *
 * A validation error must describe the EXPECTATION only. The two echoing codes
 * are therefore rewritten from metadata we own — the permitted options, and the
 * count of unknown keys — and everything else falls through to Zod's message,
 * which states types rather than values.
 */
function toProblems(error: z.ZodError): ValidationProblem[] {
  return error.issues.map((issue) => ({
    field: issue.path.length ? issue.path.join('.') : '(body)',
    message: safeMessage(issue),
  }));
}

function safeMessage(issue: z.ZodIssue): string {
  switch (issue.code) {
    case 'invalid_enum_value':
      // Our options, not their value.
      return `must be one of: ${issue.options.join(', ')}`;
    case 'unrecognized_keys':
      // The KEY NAMES are caller-supplied too, so only the count is reported.
      // The field path already tells an honest client where to look.
      return issue.keys.length === 1
        ? 'contains an unexpected field'
        : `contains ${issue.keys.length} unexpected fields`;
    default:
      return issue.message;
  }
}

class ZodBodyPipe implements PipeTransform {
  constructor(private readonly schema: ZodTypeAny) {}

  transform(value: unknown): unknown {
    // An absent body arrives as `{}` from Nest for JSON requests, but as
    // `undefined` when there is no content-type at all. Normalising to `{}`
    // means "no body" is judged by the SCHEMA — an endpoint whose fields are
    // all optional accepts it, one with a required field reports that field
    // rather than a confusing "expected object, received undefined".
    const candidate = value === undefined || value === null ? {} : value;

    const result = this.schema.safeParse(candidate);
    if (result.success) return result.data;

    throw new BadRequestException({
      error: 'VALIDATION_ERROR',
      message: 'The request body is not valid.',
      problems: toProblems(result.error),
    });
  }
}

/**
 * Make every object in a schema tree reject unknown keys — including objects
 * nested inside arrays and optional/nullable wrappers.
 *
 * 🔴 THIS USED TO BE ONE `.strict()` ON THE TOP LEVEL, and the comment above it
 * claimed unknown keys were refused. They were refused at the root and ACCEPTED
 * one level down: `RecordInspectionItemsBody.items[]` would take an extra field
 * per item, drop it, and answer 200 — so a client that renamed an item field
 * would be told every checkpoint was recorded while the value went nowhere.
 * Found by Codex, and it is the same shape of defect as the message above: a
 * comment describing the behaviour the code did not have.
 */
function deepStrict(schema: ZodTypeAny): ZodTypeAny {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as z.ZodRawShape;
    const rebuilt: z.ZodRawShape = {};
    for (const [key, value] of Object.entries(shape)) {
      rebuilt[key] = deepStrict(value as ZodTypeAny);
    }
    return z.object(rebuilt).strict();
  }
  if (schema instanceof z.ZodArray) {
    // ⚠️ THE LENGTH BOUNDS MUST BE CARRIED OVER. Rebuilding the array as a
    // plain `z.array(inner)` would have DISCARDED the `.max(500)` on
    // `RecordInspectionItemsBody.items` — a strictness pass that quietly
    // deleted a different guard while adding its own.
    const def = schema._def as {
      minLength: { value: number; message?: string } | null;
      maxLength: { value: number; message?: string } | null;
      exactLength: { value: number; message?: string } | null;
    };
    let rebuilt = z.array(deepStrict(schema.element as ZodTypeAny));
    if (def.exactLength) rebuilt = rebuilt.length(def.exactLength.value, def.exactLength.message);
    if (def.minLength) rebuilt = rebuilt.min(def.minLength.value, def.minLength.message);
    if (def.maxLength) rebuilt = rebuilt.max(def.maxLength.value, def.maxLength.message);
    return rebuilt;
  }
  if (schema instanceof z.ZodOptional) {
    return deepStrict(schema.unwrap() as ZodTypeAny).optional();
  }
  if (schema instanceof z.ZodNullable) {
    return deepStrict(schema.unwrap() as ZodTypeAny).nullable();
  }
  // 🔴 A REFINED SCHEMA IS A WRAPPER, AND WITHOUT THIS IT ESCAPES STRICTNESS.
  //
  // `.refine()` / `.superRefine()` return a `ZodEffects` around the object, not
  // an object. Falling through to `return schema` would preserve the refinement
  // and SILENTLY DROP the strict rebuild — so the moment any body gained a
  // cross-field rule, that same body would start accepting unknown keys.
  //
  // It was `GrantMembershipBody` that would have gone first, which is the
  // platform's privilege-granting route. Exactly the failure the ZodArray
  // branch above already records: a strictness pass that quietly deletes a
  // different guard while adding its own.
  //
  // The inner type is rebuilt strict and the effect re-applied over it, so both
  // survive.
  if (schema instanceof z.ZodEffects) {
    return new z.ZodEffects({
      ...schema._def,
      schema: deepStrict(schema.innerType() as ZodTypeAny),
    });
  }
  return schema;
}

/**
 * Attach a schema to a handler's `@Body()`.
 *
 *     @Body(validatedBody(StartInspectionBody)) body: StartInspection
 *
 * Strictness is applied HERE rather than at each definition, so an unknown key
 * cannot be accepted just because one schema author forgot.
 */
export function validatedBody(schema: ZodTypeAny): PipeTransform {
  return new ZodBodyPipe(deepStrict(schema));
}

// ── shared primitives ──────────────────────────────────────────────────────
//
// Defined once so that "a note" means the same thing on every endpoint. Each
// carries a bound: an unbounded string is a free upload into a TEXT column, and
// the schema rules in CLAUDE.md require TEXT precisely so that content is never
// truncated — which makes the LENGTH LIMIT the only thing standing between a
// form field and a multi-megabyte row.

/** Trimmed, non-empty, bounded. The default for a required free-text field. */
export const requiredText = (max = 2000) =>
  z.string().trim().min(1, 'must not be empty').max(max, `must be ${max} characters or fewer`);

/** Optional free text. Absent and empty are different; both are allowed. */
export const optionalText = (max = 2000) => z.string().trim().max(max).optional();

/**
 * Optional text that may be explicitly CLEARED with null.
 * ⚠️ `null` and `undefined` mean different things to these services — one
 * clears a stored value, the other leaves it alone — so they stay distinct.
 */
export const clearableText = (max = 2000) => z.string().trim().max(max).nullable().optional();

/** A UUID, matching the `ParseUUIDPipe` already used on route params. */
export const uuid = () => z.string().uuid('must be a UUID');

/**
 * A money or rate value. Rejects NaN/Infinity, which `z.number()` alone
 * permits, and refuses negatives — a negative labour rate is not a discount,
 * it is a mistake that would invoice backwards.
 */
export const money = (max = 1_000_000) =>
  z.number().finite('must be a number').nonnegative('must not be negative').max(max);

/** A non-negative whole number, for counts, mileage and quantities. */
export const wholeNumber = (max = 10_000_000) =>
  z.number().int('must be a whole number').nonnegative('must not be negative').max(max);
