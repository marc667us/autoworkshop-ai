import { BadRequestException, PipeTransform } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validatedBody } from '../common/validation/validated-body';
import { SetPublicationBody, SetSupplierPublicationBody } from './catalogue.schemas';

/**
 * These endpoints decide what becomes PUBLIC, so the test is written around the
 * value that used to do the wrong thing rather than around the happy path.
 */

function run(pipe: PipeTransform, value: unknown) {
  return pipe.transform(value, { type: 'body' });
}

describe('publication flags', () => {
  const pipe = validatedBody(SetPublicationBody);

  // 🔴 THE ACTUAL BUG. `Boolean('false') === true`, so this exact body — the
  // one a form post or a loosely-typed client sends to UNPUBLISH — published.
  it("refuses the string 'false' instead of publishing", () => {
    expect(() => run(pipe, { published: 'false' })).toThrow(BadRequestException);
  });

  it.each([['0'], ['true'], [''], [0], [1], [{}], [[]], [null]])(
    'refuses %p, which Boolean() would have silently reinterpreted',
    (value) => {
      expect(() => run(pipe, { published: value })).toThrow(BadRequestException);
    },
  );

  it('requires the flag rather than defaulting a missing one to false', () => {
    // `Boolean(undefined)` was `false`, so an empty body silently UNPUBLISHED.
    expect(() => run(pipe, {})).toThrow(BadRequestException);
  });

  // The control: real booleans still work, in both directions. Without this,
  // every assertion above would pass against a schema that refused everything.
  it('accepts real booleans, both true and false', () => {
    expect(run(pipe, { published: true })).toEqual({ published: true });
    expect(run(pipe, { published: false })).toEqual({ published: false });
  });
});

describe('supplier publication', () => {
  const pipe = validatedBody(SetSupplierPublicationBody);

  // ⚠️ THE TRI-STATE. Absent means "leave verification alone"; `false` means
  // "withdraw it". Collapsing them would un-verify every supplier whose
  // publication was toggled.
  it('keeps absent and false distinct for verified', () => {
    expect(run(pipe, { published: true })).toEqual({ published: true });
    expect(run(pipe, { published: true, verified: false })).toEqual({
      published: true,
      verified: false,
    });
  });

  it("refuses a string 'true' for verified", () => {
    expect(() => run(pipe, { published: true, verified: 'true' })).toThrow(BadRequestException);
  });
});
