import { describe, expect, it } from 'vitest';
import { safeMessage } from './operations.service';

/**
 * The redactor in `operations.service.ts`, exercised against the shapes that
 * really leak.
 *
 * 🔴 THE REDACTOR SHIPPED INCOMPLETE AND CODEX CAUGHT IT. The first version
 * handled only URL userinfo (`postgres://user:pass@host`) and passed
 * `?token=…`, `?password=…` and `X-Amz-Signature=…` straight through to the
 * administrator's screen. S3-compatible storage signs requests in the QUERY
 * STRING, so that was the likeliest shape in this very module, not a
 * hypothetical one.
 *
 * ⚠️ EVERY CASE ASSERTS THE SECRET IS ABSENT, NOT MERELY THAT SOMETHING WAS
 * REPLACED. Asserting `contains('[redacted]')` would pass while the secret sat
 * next to the marker — a check that measures the replacement instead of the leak.
 *
 * ⚠️ `safeMessage` IS EXPORTED FOR THIS. The first version of this file tried to
 * keep it module-private and load it from the source text with `new Function`,
 * which cannot parse TypeScript: the suite collected ZERO tests while the run
 * still reported "42 passed" from the other files. Read the count, never the
 * exit code — exporting a pure helper is the honest way to test it.
 */
describe('safeMessage', () => {
  const secret = 'hunter2SuperSecret';

  it('redacts credentials in a connection string', () => {
    const out = safeMessage(new Error(`connect ECONNREFUSED postgres://appuser:${secret}@db:5432/aw`));
    expect(out).not.toContain(secret);
    expect(out).toContain('[redacted]@');
  });

  for (const key of [
    'token',
    'password',
    'secret',
    'api_key',
    'apikey',
    'access-key',
    'signature',
    'authorization',
  ]) {
    it(`redacts a ${key}= parameter`, () => {
      const out = safeMessage(new Error(`fetch failed: http://minio:9000/b?${key}=${secret}&x=1`));
      expect(out, `"${key}" leaked`).not.toContain(secret);
    });
  }

  it('redacts an AWS SigV4 signature, the shape S3 storage actually uses', () => {
    const out = safeMessage(
      new Error(`GET /bucket?X-Amz-Signature=${secret}&X-Amz-Credential=AKIA123%2Fus-east-1`),
    );
    expect(out).not.toContain(secret);
  });

  it('redacts a bare JWT', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.QWxpY2VTaWduYXR1cmU';
    const out = safeMessage(new Error(`upstream rejected ${jwt}`));
    expect(out).not.toContain(jwt);
    expect(out).toContain('[redacted-jwt]');
  });

  it('truncates AFTER redacting, so a long secret cannot survive by being cut in half', () => {
    // 🔴 The ordering bug this guards against: truncate-then-redact leaves the
    // first 200 characters of the secret on screen.
    const long = 'A'.repeat(400);
    const out = safeMessage(new Error(`fetch failed: http://s?token=${long}`));
    expect(out).not.toContain('AAAAAAAAAA');
    expect(out.length).toBeLessThanOrEqual(200);
  });

  it('leaves an ordinary message readable — redaction must not destroy the diagnosis', () => {
    const out = safeMessage(new Error('connect ECONNREFUSED 127.0.0.1:6379'));
    expect(out).toBe('connect ECONNREFUSED 127.0.0.1:6379');
  });

  it('handles a non-Error throw without crashing the whole report', () => {
    expect(safeMessage('plain string')).toBe('plain string');
    expect(() => safeMessage(undefined)).not.toThrow();
  });
});
