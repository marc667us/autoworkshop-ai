import { BadRequestException, PipeTransform } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  clearableText,
  money,
  optionalText,
  requiredText,
  uuid,
  validatedBody,
  wholeNumber,
} from './validated-body';

/**
 * The pipe is proven by feeding it the payloads it exists to REFUSE, and by a
 * control that a legitimate payload still passes. A suite of rejections alone
 * would pass just as happily against a pipe that refused everything.
 */

function run(pipe: PipeTransform, value: unknown) {
  return pipe.transform(value, { type: 'body' });
}

function problemsFrom(fn: () => unknown): Array<{ field: string; message: string }> {
  try {
    fn();
  } catch (err) {
    if (err instanceof BadRequestException) {
      const body = err.getResponse() as { problems?: Array<{ field: string; message: string }> };
      return body.problems ?? [];
    }
    throw err;
  }
  throw new Error('expected the pipe to reject, but it accepted the value');
}

describe('validatedBody', () => {
  const schema = z.object({
    note: requiredText(50),
    mileage: wholeNumber().optional(),
  });

  it('accepts a valid body and returns the parsed value', () => {
    const pipe = validatedBody(schema);
    expect(run(pipe, { note: 'ok', mileage: 12 })).toEqual({ note: 'ok', mileage: 12 });
  });

  it('trims a string rather than storing the padding', () => {
    const pipe = validatedBody(schema);
    expect(run(pipe, { note: '  spaced  ' })).toEqual({ note: 'spaced' });
  });

  // 🔴 THE DEFECT THIS WHOLE MODULE EXISTS FOR. A TypeScript annotation is
  // erased at runtime, so before this pipe a handler typed
  // `{ mileageReading?: number }` accepted a string without complaint.
  it('rejects a value of the wrong TYPE, which a TS annotation never did', () => {
    const pipe = validatedBody(schema);
    const problems = problemsFrom(() => run(pipe, { note: 'ok', mileage: 'not-a-number' }));
    expect(problems).toHaveLength(1);
    expect(problems[0]?.field).toBe('mileage');
  });

  it('reports EVERY problem, not just the first', () => {
    const pipe = validatedBody(
      z.object({ a: requiredText(), b: requiredText(), c: wholeNumber() }),
    );
    const problems = problemsFrom(() => run(pipe, { a: '', b: '', c: 'x' }));
    expect(problems.map((p) => p.field).sort()).toEqual(['a', 'b', 'c']);
  });

  it('rejects an unknown key instead of silently dropping it', () => {
    const pipe = validatedBody(schema);
    const problems = problemsFrom(() => run(pipe, { note: 'ok', isAdmin: true }));
    expect(problems).toHaveLength(1);
  });

  it('rejects a non-object body', () => {
    const pipe = validatedBody(schema);
    expect(() => run(pipe, 'a bare string')).toThrow(BadRequestException);
    expect(() => run(pipe, [1, 2, 3])).toThrow(BadRequestException);
  });

  it('treats an absent body as {} so the SCHEMA decides', () => {
    const allOptional = validatedBody(z.object({ note: optionalText() }));
    expect(run(allOptional, undefined)).toEqual({});

    // ...and a required field is reported by NAME rather than as
    // "expected object, received undefined".
    const problems = problemsFrom(() => run(validatedBody(schema), undefined));
    expect(problems[0]?.field).toBe('note');
  });

  // ⚠️ A body can hold a token, a password or personal data, and error
  // responses get logged. The message must describe the EXPECTATION only.
  it('never echoes the submitted value back in the message', () => {
    const pipe = validatedBody(z.object({ password: requiredText() }));
    const problems = problemsFrom(() => run(pipe, { password: 12345 }));
    expect(JSON.stringify(problems)).not.toContain('12345');
  });
});

describe('shared primitives', () => {
  it('requiredText refuses empty and whitespace-only', () => {
    const pipe = validatedBody(z.object({ v: requiredText() }));
    expect(() => run(pipe, { v: '' })).toThrow(BadRequestException);
    expect(() => run(pipe, { v: '   ' })).toThrow(BadRequestException);
  });

  it('requiredText enforces its maximum — an unbounded field is an upload', () => {
    const pipe = validatedBody(z.object({ v: requiredText(10) }));
    expect(() => run(pipe, { v: 'x'.repeat(11) })).toThrow(BadRequestException);
    expect(run(pipe, { v: 'x'.repeat(10) })).toEqual({ v: 'x'.repeat(10) });
  });

  // `null` clears a stored value; `undefined` leaves it alone. Collapsing them
  // would make "clear this note" indistinguishable from "do not touch it".
  it('clearableText keeps null and undefined distinct', () => {
    const pipe = validatedBody(z.object({ v: clearableText() }));
    expect(run(pipe, { v: null })).toEqual({ v: null });
    expect(run(pipe, {})).toEqual({});
    expect(() => run(validatedBody(z.object({ v: optionalText() })), { v: null })).toThrow();
  });

  // z.number() alone accepts NaN and Infinity, both of which reach SQL.
  it('money rejects NaN, Infinity and negatives', () => {
    const pipe = validatedBody(z.object({ v: money() }));
    expect(() => run(pipe, { v: Number.NaN })).toThrow(BadRequestException);
    expect(() => run(pipe, { v: Number.POSITIVE_INFINITY })).toThrow(BadRequestException);
    expect(() => run(pipe, { v: -1 })).toThrow(BadRequestException);
    expect(run(pipe, { v: 0 })).toEqual({ v: 0 });
  });

  it('wholeNumber rejects fractions', () => {
    const pipe = validatedBody(z.object({ v: wholeNumber() }));
    expect(() => run(pipe, { v: 1.5 })).toThrow(BadRequestException);
  });

  it('uuid rejects a non-uuid string', () => {
    const pipe = validatedBody(z.object({ v: uuid() }));
    expect(() => run(pipe, { v: 'nope' })).toThrow(BadRequestException);
    expect(run(pipe, { v: '00000000-0000-4000-8000-000000000000' })).toEqual({
      v: '00000000-0000-4000-8000-000000000000',
    });
  });
});

describe('deep strictness and message safety (Codex findings)', () => {
  // 🔴 The top-level `.strict()` did not reach inside arrays, so an extra field
  // per inspection item was accepted and dropped — a 200 for a value that went
  // nowhere.
  it('rejects an unknown key NESTED inside an array', () => {
    const pipe = validatedBody(
      z.object({
        items: z.array(z.object({ code: requiredText(20) })).max(500),
      }),
    );
    expect(() => run(pipe, { items: [{ code: 'a', clientRowId: 7 }] })).toThrow(
      BadRequestException,
    );
    expect(run(pipe, { items: [{ code: 'a' }] })).toEqual({ items: [{ code: 'a' }] });
  });

  it('rejects an unknown key nested in a plain object', () => {
    const pipe = validatedBody(z.object({ inner: z.object({ a: requiredText(10) }) }));
    expect(() => run(pipe, { inner: { a: 'x', b: 1 } })).toThrow(BadRequestException);
  });

  // ⚠️ The strictness pass rebuilds arrays; it must not discard their bounds.
  it('preserves an array max() through the strictness rebuild', () => {
    const pipe = validatedBody(z.object({ items: z.array(z.object({})).max(2) }));
    expect(() => run(pipe, { items: [{}, {}, {}] })).toThrow(BadRequestException);
    expect(run(pipe, { items: [{}, {}] })).toEqual({ items: [{}, {}] });
  });

  // 🔴 Zod's invalid_enum_value message ECHOES the submitted value, so a body
  // of {"orgType": "<a token>"} would have put it in a 400 and every log.
  it('never echoes a rejected enum value, but does list the options', () => {
    const pipe = validatedBody(z.object({ kind: z.enum(['alpha', 'beta']) })); 
    const problems = problemsFrom(() => run(pipe, { kind: 'sk-live-SECRETVALUE' }));
    const text = JSON.stringify(problems);
    expect(text).not.toContain('SECRETVALUE');
    expect(text).toContain('alpha');
  });

  it('never echoes an unexpected KEY name either', () => {
    const pipe = validatedBody(z.object({ a: requiredText(10) }));
    const problems = problemsFrom(() => run(pipe, { a: 'x', bearer_token_abc: 1 }));
    expect(JSON.stringify(problems)).not.toContain('bearer_token_abc');
  });
});
