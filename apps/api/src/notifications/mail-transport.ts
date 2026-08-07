import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

/**
 * HOW A NOTIFICATION LEAVES THE BUILDING.
 *
 * ── 🔴 THE APP MUST WORK WITH NO MAIL PROVIDER AT ALL ─────────────────────
 *
 * ADR-015 (bring-your-own-connection) is not a nicety here — it is the state
 * the product is in TODAY. On 2026-08-07 the platform had no SMTP credentials
 * of any kind, and Keycloak was demanding an email verification it could not
 * send, which blocked sign-up entirely. A mailer that throws when unconfigured
 * would spread that same failure into every business action that notifies
 * somebody.
 *
 * So `UnconfiguredMailTransport` is a first-class implementation, not a stub:
 * with nothing configured the notification is still RECORDED, the in-app
 * channel still works, and the row stays `pending` until a provider exists. The
 * backlog then drains on its own. Nothing is lost and nothing is falsified.
 *
 * ── ⚠️ THE PORT IS THE TRAP ────────────────────────────────────────────────
 *
 * Render's free tier BLOCKS outbound SMTP on 25, 465 and 587. A provider's
 * documented port will therefore usually be the one that cannot work from here.
 * Brevo offers 2525 and Resend offers 2587, both STARTTLS. `SMTP_PORT` is
 * explicit and defaults to 2525 for that reason — inheriting a provider's
 * default is how this costs a session.
 *
 * ── ⚠️ STARTTLS AND IMPLICIT SSL ARE DIFFERENT THINGS ─────────────────────
 *
 * `secure: true` means implicit TLS from the first byte (port 465). On 2525 and
 * 2587 the session starts in plaintext and UPGRADES. Setting both is a
 * configuration that never connects, which is why `secure` is derived from the
 * port rather than offered as a second knob somebody can contradict.
 */

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
}

export abstract class MailTransport {
  /** Whether this transport can actually deliver. */
  abstract isConfigured(): boolean;
  /** Deliver, or throw. A throw leaves the notification pending for a retry. */
  abstract send(message: MailMessage): Promise<void>;
  /** For diagnostics — never includes the password. */
  abstract describe(): string;
}

@Injectable()
export class SmtpMailTransport extends MailTransport {
  private readonly log = new Logger(SmtpMailTransport.name);
  private transporter: Transporter | null = null;

  private readonly host: string;
  private readonly port: number;
  private readonly user: string;
  private readonly pass: string;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    super();
    this.host = this.config.get<string>('SMTP_HOST', '');
    // 2525, not 587 — see the header. An unparseable value becomes 0, which is
    // treated as unconfigured rather than silently becoming a default that
    // hides a typo.
    this.port = Number.parseInt(this.config.get<string>('SMTP_PORT', '2525'), 10) || 0;
    this.user = this.config.get<string>('SMTP_USER', '');
    this.pass = this.config.get<string>('SMTP_PASS', '');
    this.from = this.config.get<string>('SMTP_FROM', '');
  }

  isConfigured(): boolean {
    // Every part, not "a host was set". A host with no credentials produces an
    // authentication failure on every single send, which reads as a broken
    // provider rather than an incomplete configuration.
    return Boolean(this.host && this.port && this.user && this.pass && this.from);
  }

  describe(): string {
    return this.isConfigured()
      ? `smtp ${this.host}:${this.port} as ${this.user}`
      : 'smtp NOT CONFIGURED';
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('SMTP is not configured');
    }
    if (!this.transporter) {
      this.transporter = createTransport({
        host: this.host,
        port: this.port,
        // Implicit TLS on 465 only; everything else upgrades via STARTTLS.
        secure: this.port === 465,
        requireTLS: this.port !== 465,
        auth: { user: this.user, pass: this.pass },
        // A hung connection must not hold a drain open for ever.
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 20_000,
      });
    }
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.body,
    });
    this.log.log(`sent "${message.subject}" to ${message.to}`);
  }
}

/**
 * The transport used when nothing is configured. It REFUSES rather than
 * pretending: the notification stays pending and is delivered later, instead of
 * being marked sent to a provider that does not exist.
 *
 * ⚠️ Deliberately NOT a silent success. A transport that swallowed the message
 * would make the outbox read "delivered" for mail nobody received, which is the
 * "config reads correct while the mechanism is inert" failure this repository
 * has recorded five times.
 */
@Injectable()
export class UnconfiguredMailTransport extends MailTransport {
  isConfigured(): boolean {
    return false;
  }
  describe(): string {
    return 'no mail provider configured';
  }
  // The parameter is declared even though it is unused: without it the concrete
  // type has an arity of zero, and every caller holding an
  // `UnconfiguredMailTransport` rather than a `MailTransport` fails to compile.
  async send(_message: MailMessage): Promise<void> {
    throw new Error(
      'no mail provider is configured — set SMTP_HOST/PORT/USER/PASS/FROM',
    );
  }
}

/**
 * Chooses at boot. A single provider token, so nothing downstream has to ask
 * which transport it has.
 */
export const mailTransportProvider = {
  provide: MailTransport,
  inject: [ConfigService],
  useFactory: (config: ConfigService): MailTransport => {
    const smtp = new SmtpMailTransport(config);
    return smtp.isConfigured() ? smtp : new UnconfiguredMailTransport();
  },
};
