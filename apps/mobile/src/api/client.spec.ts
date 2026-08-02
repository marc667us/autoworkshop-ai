import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `apiPatch`'s handling of a 400.
 *
 * This is the only part of the client with real logic in it, and it earns a
 * test because the failure mode is silent: every branch here produces a STRING
 * shown to a technician, so a wrong branch does not crash — it says something
 * unhelpful, or nothing at all, at the moment somebody needs an answer.
 */

vi.mock('../auth/session', () => ({
  currentAccessToken: async () => 'a-token',
}));
vi.mock('../auth/config', () => ({
  API_BASE_URL: 'http://example.invalid',
}));

const { apiPatch } = await import('./client');

function respondWith(body: unknown, status = 400) {
  vi.stubGlobal('fetch', async () =>
    ({
      status,
      ok: status >= 200 && status < 300,
      json: async () => body,
    }) as unknown as Response,
  );
}

async function refusalMessage(body: unknown): Promise<string> {
  respondWith(body);
  const result = await apiPatch('/anything', {});
  if (result.ok) throw new Error('expected a refusal');
  if (result.reason.kind !== 'refused') throw new Error(`expected refused, got ${result.reason.kind}`);
  return result.reason.message;
}

describe('apiPatch on a 400', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('reads the structured problems from validatedBody', async () => {
    const message = await refusalMessage({
      error: 'VALIDATION_ERROR',
      problems: [{ field: 'toStage', message: 'must not be empty' }],
    });
    expect(message).toBe('toStage must not be empty');
  });

  // Nest wraps a thrown exception body under `message`.
  it('finds problems nested under message', async () => {
    const message = await refusalMessage({
      message: { problems: [{ field: 'note', message: 'is too long' }] },
    });
    expect(message).toBe('note is too long');
  });

  it('joins every problem, so one fix per round trip is not required', async () => {
    const message = await refusalMessage({
      problems: [
        { field: 'a', message: 'is required' },
        { field: 'b', message: 'must be a number' },
      ],
    });
    expect(message.split('\n')).toHaveLength(2);
  });

  it('uses a plain string message from a service rule', async () => {
    const message = await refusalMessage({ message: 'A closed job cannot be moved.' });
    expect(message).toBe('A closed job cannot be moved.');
  });

  it("reads Nest's own message: string[] shape", async () => {
    const message = await refusalMessage({ message: ['first thing', 'second thing'] });
    expect(message).toContain('first thing');
    expect(message).toContain('second thing');
  });

  // 🔴 THE BUG CODEX FOUND. An unconditional assignment made this an EMPTY
  // string, so the notice appeared with no reason inside it.
  it('keeps the honest fallback when problems carry nothing usable', async () => {
    const message = await refusalMessage({ problems: [{}, {}] });
    expect(message.trim().length).toBeGreaterThan(0);
    expect(message).toContain('refused');
  });

  it('keeps the fallback when problems is not even an array', async () => {
    const message = await refusalMessage({ problems: 'not-a-list' });
    expect(message.trim().length).toBeGreaterThan(0);
  });

  it('survives a 400 whose body is not JSON at all', async () => {
    vi.stubGlobal('fetch', async () =>
      ({
        status: 400,
        ok: false,
        json: async () => {
          throw new Error('not json');
        },
      }) as unknown as Response,
    );
    const result = await apiPatch('/anything', {});
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason.kind === 'refused') {
      expect(result.reason.message.trim().length).toBeGreaterThan(0);
    }
  });

  // A 400 must NOT be reported as an outage: the remedy is different.
  it('is `refused`, never `server`', async () => {
    respondWith({ message: 'nope' });
    const result = await apiPatch('/anything', {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.kind).toBe('refused');
  });

  it('still reports a 500 as a server fault', async () => {
    respondWith({}, 500);
    const result = await apiPatch('/anything', {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.kind).toBe('server');
  });

  it('reports a lost connection as offline, not as a server fault', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('network down');
    });
    const result = await apiPatch('/anything', {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.kind).toBe('offline');
  });
});
