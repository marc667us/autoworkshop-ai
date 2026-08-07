import { describe, expect, it, beforeAll } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { SmtpMailTransport, UnconfiguredMailTransport } from './mail-transport';

/**
 * PROOF THAT A MESSAGE ACTUALLY LEAVES — asserted on what was RECEIVED.
 *
 * ── 🔴 WHY THIS EXISTS ────────────────────────────────────────────────────
 *
 * Migration 060 built an outbox, a claim/lease protocol and an SMTP transport.
 * Codex found a double-send in it; the Supervisor found a drain that could not
 * read a single row. Both were found by READING, because the delivery half had
 * never been executed by anything — exercising it needed a mail server, and the
 * only candidate was a live provider blocked on a DNS record. So the one
 * question nobody could answer was the simple one: if a message is handed to
 * this transport, does it arrive?
 *
 * ── ⚠️ WHY IT ASSERTS ON MAILPIT AND NOT ON THE CALL ──────────────────────
 *
 * `await transport.send(...)` not throwing proves that nodemailer accepted the
 * arguments. It does not prove a message was transmitted, that the FROM
 * survived, or that the body was not empty. This repository has a standing
 * lesson about configuration that reads correct while the mechanism is inert,
 * recorded five times — so the assertion is made against the RECEIVING END:
 * Mailpit's HTTP API, holding the message it actually accepted over SMTP.
 *
 * ── ⚠️ PASSED / FAILED / SKIPPED ARE THREE STATES ─────────────────────────
 *
 * If Mailpit is not running this SKIPS with a reason, and never throws. A
 * previous integration spec in this repository turned CI red for an
 * environmental reason (no Postgres) and cost a session, so the skip path is
 * written first and deliberately cannot raise: every network call is guarded.
 *
 *   docker compose --profile dev up -d mailpit
 */

/** Mailpit's HTTP API. SMTP is 1025; this is the inbox behind it. */
const MAILPIT_API = process.env.MAILPIT_API_URL ?? 'http://127.0.0.1:8025';
const SMTP_HOST = process.env.MAILPIT_SMTP_HOST ?? '127.0.0.1';
const SMTP_PORT = process.env.MAILPIT_SMTP_PORT ?? '1025';

interface MailpitMessage {
  ID: string;
  From: { Address: string } | null;
  To: Array<{ Address: string }> | null;
  Subject: string;
}

/**
 * 🔴 THE SWITCH THAT TURNS A CONVENIENCE INTO A GATE.
 *
 * Every skip below is deliberate: a developer without Docker running should not
 * get a red suite. But Codex was right that a skip which is ALWAYS allowed is
 * not a delivery gate at all — a release pipeline could report success having
 * never opened an SMTP connection, and "the mail tests pass" would mean nothing.
 *
 * With `REQUIRE_MAIL_DELIVERY=1` the same missing relay is a FAILURE with the
 * reason attached. Local runs stay forgiving; anywhere that must actually prove
 * delivery sets the variable and cannot be fooled by an absent sink.
 */
const REQUIRED = process.env.REQUIRE_MAIL_DELIVERY === '1';

/** Skip, or fail when this run was supposed to prove delivery. */
function unavailable(reason: string): void {
  if (REQUIRED) {
    throw new Error(
      `REQUIRE_MAIL_DELIVERY=1 but delivery could not be exercised: ${reason}`,
    );
  }
  console.warn(`[mail-delivery] SKIPPED — ${reason}`);
}

let reachable = false;
/** Unique per run, so a shared Mailpit never lets one run read another's mail. */
const marker = `awtest-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function mailpit<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${MAILPIT_API}${path}`, {
      ...init,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    // DELETE returns an empty body; asking for JSON would throw on success.
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    return null;
  }
}

beforeAll(async () => {
  const probe = await mailpit<{ messages: MailpitMessage[] }>('/api/v1/messages');
  if (probe === null) {
    // Named loudly. A silent skip is how a suite reports 0 failures while
    // testing nothing, which this repository has recorded for Playwright.
    unavailable(
      `no Mailpit at ${MAILPIT_API}. ` +
        `Start it: bash scripts/dev-mailpit-cert.sh && docker compose --profile dev up -d mailpit`,
    );
    return;
  }

  // 🔴 REACHABLE IS NOT ENOUGH — THE CA MUST BE TRUSTED, AND THIS GUARD IS THE
  // DIFFERENCE BETWEEN A SKIP AND A RED BUILD FOR AN ENVIRONMENTAL REASON.
  //
  // The sink speaks STARTTLS with a SELF-SIGNED certificate, because the
  // transport requires TLS and is deliberately not weakened for tests. Node
  // only trusts that certificate if NODE_EXTRA_CA_CERTS was set BEFORE the
  // process started — it cannot be set from inside this file. So a plain
  // `pnpm test` on a machine with Mailpit running would otherwise fail on a
  // certificate error and read as a broken mail transport.
  //
  // This repository has a recorded incident where exactly that happened: an
  // integration spec turned Release red for a missing local dependency. Passed,
  // failed and SKIPPED are three states, and this is the third.
  if (!process.env.NODE_EXTRA_CA_CERTS) {
    unavailable(
      'Mailpit is up but its self-signed CA is not trusted. ' +
        'Re-run with NODE_EXTRA_CA_CERTS=infrastructure/docker/mailpit-tls/cert.pem',
    );
    return;
  }

  reachable = true;
});

function transportFor(overrides: Record<string, string> = {}): SmtpMailTransport {
  return new SmtpMailTransport(
    new ConfigService({
      SMTP_HOST,
      SMTP_PORT,
      SMTP_USER: 'dev',
      // Deliberately NOT the same string as the user: `describe()` is expected
      // to name the user and expected never to leak the password, and two
      // identical values make that assertion unable to tell them apart.
      SMTP_PASS: 'pw-must-never-be-printed',
      SMTP_FROM: 'noreply@autoworkshop.local',
      ...overrides,
    }),
  );
}

describe('SMTP delivery (migration 060) — proven against a real relay', () => {
  it('delivers a message, and the RECEIVED copy carries the right envelope', async (ctx) => {
    // 🔴 `ctx.skip()`, NOT `return`. An early return reports the test as
    // PASSED, so a suite with no relay would print "3 passed" while the only
    // check that touches a mail server never ran — this repository's
    // "a green gate that runs NOTHING", where Playwright exited 0 having
    // collected zero tests for two days. Skipping makes the count say so.
    if (!reachable) ctx.skip();

    const subject = `${marker} service request received`;
    const body = 'A customer has filed a service request.\nMarker: ' + marker;
    const to = 'reception@autoworkshop.local';

    await transportFor().send({ to, subject, body });

    const inbox = await mailpit<{ messages: MailpitMessage[] }>(
      `/api/v1/search?query=${encodeURIComponent(marker)}`,
    );
    expect(inbox, 'Mailpit stopped answering mid-test').not.toBeNull();

    const found = inbox!.messages?.filter((m) => m.Subject === subject) ?? [];
    // EXACTLY ONE. A transport that delivered twice would satisfy "at least
    // one", and a double-send is the precise defect Codex found in the drain
    // that feeds this transport — so the count is the assertion, not a detail.
    expect(found).toHaveLength(1);

    // `toHaveLength` is a runtime assertion and narrows nothing for the type
    // checker, so the element is pulled out and checked once rather than
    // silenced with `!` at three call sites.
    const message = found[0];
    if (!message) throw new Error('unreachable: length was asserted above');

    expect(message.From?.Address).toBe('noreply@autoworkshop.local');
    expect(message.To?.map((t) => t.Address)).toContain(to);

    // The BODY, fetched separately — a message can arrive with a correct
    // envelope and no content, and an empty notification is a delivered
    // nothing, which is worse than a failure because it looks like success.
    const full = await mailpit<{ Text: string }>(`/api/v1/message/${message.ID}`);
    expect(full, 'Mailpit stopped answering mid-test').not.toBeNull();
    expect(full!.Text).toContain(marker);
  });

  it('reports itself unconfigured when any one part is missing, and refuses to send', async () => {
    // Not gated on Mailpit: this is about the CONFIGURATION DECISION, and it
    // must hold on a machine with no relay at all.
    //
    // 🔴 THE REFUSALS ARE THE POINT. A happy-path-only test would have passed
    // on the day the landing button could not render, and that lesson is
    // recorded. Each of these is a real deployment state: a variable added to
    // Render with no value comes back as an EMPTY STRING, not as absent.
    for (const missing of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']) {
      const t = transportFor({ [missing]: '' });
      expect(t.isConfigured(), `${missing} empty must read as unconfigured`).toBe(false);
      await expect(t.send({ to: 'a@b.test', subject: 's', body: 'b' })).rejects.toThrow();
    }

    // A port that does not parse becomes 0 and must read as unconfigured rather
    // than silently falling back to a default that hides the typo.
    const badPort = transportFor({ SMTP_PORT: 'not-a-port' });
    expect(badPort.isConfigured()).toBe(false);

    // And the describe() string must never carry the password — it is returned
    // in the drain endpoint's RESPONSE BODY and printed by the diagnostic
    // workflows, so a leak here ends up in GitHub Actions logs.
    const configured = transportFor();
    expect(configured.isConfigured()).toBe(true);
    expect(configured.describe()).not.toContain('pw-must-never-be-printed');
    // Naming the user and the relay IS wanted — that is what makes the
    // diagnostic useful — so this asserts the line is informative, not blank.
    expect(configured.describe()).toContain('dev');
  });

  it('the unconfigured transport refuses rather than pretending to send', async () => {
    const t = new UnconfiguredMailTransport();
    expect(t.isConfigured()).toBe(false);
    // 🔴 A SILENT SUCCESS HERE WOULD MARK THE OUTBOX ROW `sent` FOR MAIL
    // NOBODY RECEIVED. The throw is what keeps the row pending until a relay
    // exists, so the backlog drains instead of being falsified.
    await expect(t.send({ to: 'a@b.test', subject: 's', body: 'b' })).rejects.toThrow();
  });
});
