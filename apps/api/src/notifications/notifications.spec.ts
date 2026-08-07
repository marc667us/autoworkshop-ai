import { describe, expect, it, vi } from 'vitest';
import { NotificationsService } from './notifications.service';
import { MailTransport, UnconfiguredMailTransport } from './mail-transport';

/**
 * These assertions are about the DRAIN, because that is where this feature can
 * lie. Enqueue is proven in `verify/060` against a real database, where the
 * policies and the preference lookup actually run; asserting them here against
 * a stubbed client would only prove the stub.
 *
 * What is worth proving in TypeScript is the behaviour around delivery, and in
 * particular the two ways a mail queue silently rots:
 *   1. marking a message SENT when nothing sent it, and
 *   2. burning a message's retry budget on an outage that was never its fault.
 */

class ConfiguredStubTransport extends MailTransport {
  readonly sent: { to: string; subject: string }[] = [];
  constructor(private readonly failWith?: Error) {
    super();
  }
  isConfigured(): boolean {
    return true;
  }
  describe(): string {
    return 'stub';
  }
  async send(message: { to: string; subject: string; body: string }): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.sent.push({ to: message.to, subject: message.subject });
  }
}

/** Records every `record_notification_result` call so outcomes are assertable. */
function makeDb(claimRows: unknown[]) {
  const results: { id: string; sent: boolean; error: string | null }[] = [];
  const db = {
    queryWithoutTenant: vi.fn(async (text: string, values: unknown[] = []) => {
      if (text.includes('claim_pending_notifications')) return claimRows;
      if (text.includes('record_notification_result')) {
        results.push({
          id: values[0] as string,
          sent: values[1] as boolean,
          error: (values[2] as string | null) ?? null,
        });
      }
      return [];
    }),
  };
  return { db, results };
}

const audit = { write: vi.fn(async () => undefined) };

function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    organization_id: '22222222-2222-2222-2222-222222222222',
    recipient_id: '33333333-3333-3333-3333-333333333333',
    channel: 'email',
    subject: 'New service request',
    body: 'A customer has asked for service.',
    to_address: 'someone@example.test',
    attempts: 0,
    ...over,
  };
}

describe('NotificationsService.drain', () => {
  it('sends what is owed and records each as sent', async () => {
    const { db, results } = makeDb([row()]);
    const transport = new ConfiguredStubTransport();
    const svc = new NotificationsService(db as never, audit as never, transport);

    const out = await svc.drain();

    expect(transport.sent).toEqual([
      { to: 'someone@example.test', subject: 'New service request' },
    ]);
    expect(out).toMatchObject({ configured: true, claimed: 1, sent: 1, failed: 0 });
    expect(results).toEqual([
      { id: '11111111-1111-1111-1111-111111111111', sent: true, error: null },
    ]);
  });

  it('🔴 does NOT claim anything when no provider is configured', async () => {
    // Claiming rows only to fail every one of them would count an attempt
    // against each, and five such drains would exhaust the retry budget of
    // every queued message — for an outage that was never the provider's fault
    // and that ends the moment SMTP is configured. The queue must survive being
    // unconfigured for weeks, which is exactly the state the platform is in.
    const { db, results } = makeDb([row()]);
    const svc = new NotificationsService(
      db as never,
      audit as never,
      new UnconfiguredMailTransport(),
    );

    const out = await svc.drain();

    expect(out).toMatchObject({ configured: false, claimed: 0, sent: 0, failed: 0 });
    expect(results).toEqual([]);
    // The claim query must not have run at all.
    expect(
      db.queryWithoutTenant.mock.calls.some(([t]) =>
        String(t).includes('claim_pending_notifications'),
      ),
    ).toBe(false);
  });

  it('🔴 a send failure stays PENDING with a reason, never marked sent', async () => {
    const { db, results } = makeDb([row()]);
    const svc = new NotificationsService(
      db as never,
      audit as never,
      new ConfiguredStubTransport(new Error('535 authentication failed')),
    );

    const out = await svc.drain();

    expect(out).toMatchObject({ sent: 0, failed: 1 });
    expect(results).toHaveLength(1);
    expect(results[0]!.sent).toBe(false);
    expect(results[0]!.error).toContain('535 authentication failed');
  });

  it('🔴 a recipient with no address fails with a reason a human can act on', async () => {
    // Otherwise it is retried for ever and the drain reports a permanent
    // failure count with nothing explaining it.
    const { db, results } = makeDb([row({ to_address: null })]);
    const transport = new ConfiguredStubTransport();
    const svc = new NotificationsService(db as never, audit as never, transport);

    const out = await svc.drain();

    expect(transport.sent).toEqual([]);
    expect(out).toMatchObject({ sent: 0, failed: 1 });
    expect(results[0]!.error).toMatch(/no email address/i);
  });

  it('one failure does not stop the rest of the batch', async () => {
    // A single bad address must not hold up every other message behind it.
    const rows = [
      row({ id: 'aaaaaaaa-1111-1111-1111-111111111111', to_address: null }),
      row({ id: 'bbbbbbbb-2222-2222-2222-222222222222' }),
    ];
    const { db, results } = makeDb(rows);
    const transport = new ConfiguredStubTransport();
    const svc = new NotificationsService(db as never, audit as never, transport);

    const out = await svc.drain();

    expect(out).toMatchObject({ claimed: 2, sent: 1, failed: 1 });
    expect(results.map((r) => r.sent)).toEqual([false, true]);
  });
});

describe('UnconfiguredMailTransport', () => {
  it('🔴 REFUSES rather than silently succeeding', async () => {
    // A transport that quietly swallowed the message would let the outbox read
    // "delivered" for mail nobody received — "config reads correct while the
    // mechanism is inert", recorded five times in this project.
    const t = new UnconfiguredMailTransport();
    expect(t.isConfigured()).toBe(false);
    await expect(
      t.send({ to: 'a@b.test', subject: 's', body: 'b' }),
    ).rejects.toThrow(/no mail provider is configured/i);
  });
});
