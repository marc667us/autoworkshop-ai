import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * THE ONLY DOOR BETWEEN THIS APPLICATION AND AN AI AGENT.
 *
 * ── 🔴 THE AGENT HOST HOLDS NO CREDENTIAL AND CANNOT REACH THE DATABASE ───
 *
 * `CLAUDE.md` §3 / ADR-010: the chain is
 *   agent → (this client) → NestJS domain service → repository → RLS → Postgres
 * and the agent host sits OUTSIDE it. It receives the data this client hands it
 * as JSON and returns proposals as JSON. It has no connection string, no
 * storage key, no admin token. `services/agent-host` asserts that with a test
 * that no database driver is even importable from its package — the boundary is
 * measured there rather than promised here.
 *
 * Everything an agent is allowed to know about a tenant, this client passes in
 * explicitly. That is deliberately laborious: it means a reader can see the
 * whole of what leaves the tenant by reading the call site, which is what
 * `02.txt` §8's "the information it intends to use" disclosure is derived from.
 *
 * ── 🔴 A DEAD AGENT MUST NEVER BREAK THE WORKSHOP ─────────────────────────
 *
 * ADR-015 (bring-your-own-connection), and here it is the state the product is
 * in today: most deployments will run with no agent host at all. So
 * `UnconfiguredAgentHost` is a first-class implementation, exactly like
 * `UnconfiguredMailTransport` — with nothing configured, a service request is
 * still created, reception is still notified, and no proposal is written.
 * Nothing is lost and nothing is falsified.
 *
 * Every method here therefore returns `null` on ANY failure — unreachable,
 * timeout, non-200, malformed body — and never throws. A caller that would
 * abort a customer's intake because a language model was slow has the priority
 * backwards.
 */

export interface TriageTechnician {
  readonly id: string;
  readonly displayName: string;
  readonly specialisms: readonly string[];
  readonly openJobs: number;
}

export interface TriageInput {
  readonly complaint: string;
  readonly vehicleDescription: string;
  readonly registrationNumber?: string;
  readonly technicians: readonly TriageTechnician[];
}

/**
 * ⚠️ THESE FIELD NAMES ARE THE HOST'S, CAMELISED — NOT NAMES I CHOSE.
 *
 * The first version of this file invented plausible ones (`suggestedTechnicianReason`,
 * `contactEmail`, `priceMinor`, `supplierName`) that `services/agent-host`
 * never sends. Camelising `snake_case` fixes only half of such a mismatch; the
 * other half is fields that simply do not exist, which arrive as `undefined`
 * and read as "the agent found nothing" rather than as an error.
 *
 * Every name below is checked against `services/agent-host/app/schemas.py` and
 * pinned by `agent-host.contract.spec.ts`, which parses a literal copy of a
 * real host response. If the two drift again, that test fails instead of the
 * feature silently emptying.
 */
export interface TriageResult {
  readonly priority: 'low' | 'normal' | 'high' | 'urgent';
  readonly faultCategory: string;
  readonly summary: string;
  readonly suggestedTechnicianId: string | null;
  /** The host's `technician_reason` — always populated, including when no
   *  technician was suggested, because "why not" is as useful as "why". */
  readonly technicianReason: string;
  readonly confidence: number | null;
  /** What drove a RULES answer. Makes a wrong one diagnosable. */
  readonly signals?: readonly string[];
  /**
   * 🔴 `rules` MEANS NO MODEL WAS INVOLVED. The host falls back to
   * deterministic keyword rules when Ollama is unreachable, which is correct.
   * Presenting that as a model's judgement would let a reader credit it with
   * reasoning it does not have, so the distinction is carried all the way to
   * the screen and into `agents.proposals.source`.
   */
  readonly source: 'model' | 'rules';
}

export interface SupplierCandidate {
  readonly name: string;
  readonly country?: string;
  readonly city?: string;
  readonly website?: string;
  /** One free-text contact as the page stated it — the host does not classify
   *  it into email/phone, and neither should this. */
  readonly contact?: string;
  readonly sourceUrl: string;
}

export interface PartCandidate {
  readonly name: string;
  readonly partNumber?: string;
  readonly category?: string;
  /** ⚠️ A MAJOR-UNIT FLOAT, as the page stated it — NOT minor units. The host
   *  reports the number it read and never converts, because a scraped price
   *  with an assumed currency scale is worse than no price. Anything that
   *  turns this into money must decide the scale explicitly. */
  readonly price?: number;
  readonly currency?: string;
  readonly sourceUrl: string;
}

export interface LeadCandidate {
  readonly organisationName: string;
  readonly leadType?: 'fleet' | 'garage' | 'taxi_or_rideshare' | 'dealership' | 'other';
  /** One free-text contact, exactly as the page stated it. The host sends a
   *  single field; `DiscoveryAgent` decides which column it belongs in. */
  readonly contact?: string;
  readonly location?: string;
  readonly rationale?: string;
  readonly sourceUrl: string;
}

/**
 * 🔴 THE TWO SERVICES DISAGREED ABOUT NAMING, AND IT MADE LEAD DISCOVERY INERT.
 *
 * Found by the Supervisor, 2026-08-08, and it is the exact defect class this
 * repository has recorded most often: *config reads correct while the mechanism
 * is dead.*
 *
 * `services/agent-host` is Python and returns idiomatic `snake_case`
 * (`organisation_name`, `source_url`). This client declared idiomatic
 * TypeScript `camelCase` and did nothing to bridge them — so
 * `DiscoveryAgent.discoverLeads`, which filters on
 * `l.sourceUrl && l.organisationName`, saw `undefined` for BOTH on every
 * candidate, discarded all of them, and threw *"No organisations with a usable
 * source were found on that page"* every single time.
 *
 * ⚠️ IT WOULD HAVE LOOKED LIKE A SCRAPING PROBLEM, NOT A BUG. The message is
 * plausible, the HTTP call really did succeed, both test suites were green —
 * the Python side asserted snake_case, the TypeScript side asserted camelCase,
 * and NOTHING asserted they met. Supplier discovery was quieter and worse: it
 * survived, silently losing every per-candidate source link, so proposals would
 * have shipped with unverifiable prices.
 *
 * Converted HERE rather than by changing either service, because this class IS
 * the boundary adapter: both sides stay idiomatic and the impedance mismatch
 * lives in one tested place. `agent-host.contract.spec.ts` pins it against a
 * literal copy of a real host response — a shape test, not a mock of my own
 * assumptions, since a mock that agrees with me is what let this through.
 */
function camelize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelize);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [
      // Only `_x` → `X`. A key that is already camelCase passes through
      // unchanged, so this is safe to run over a response from a future host
      // that has been taught to speak camelCase.
      k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase()),
      camelize(v),
    ]),
  );
}

export abstract class AgentHost {
  abstract isConfigured(): boolean;
  abstract describe(): string;
  abstract triage(input: TriageInput): Promise<TriageResult | null>;
  abstract discoverSuppliers(
    url: string,
    brief: string,
  ): Promise<{ suppliers: SupplierCandidate[]; parts: PartCandidate[] } | null>;
  abstract discoverLeads(
    url: string,
    brief: string,
  ): Promise<{ leads: LeadCandidate[] } | null>;
}

@Injectable()
export class HttpAgentHost extends AgentHost {
  private readonly log = new Logger(HttpAgentHost.name);
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    super();
    this.baseUrl = (config.get<string>('AGENT_HOST_URL') ?? '').replace(/\/+$/, '');
    this.token = config.get<string>('AGENT_HOST_TOKEN') ?? '';
    // 20s. Long enough for a local Ollama generation on CPU, short enough that
    // a customer pressing Send is never left waiting on it — the caller writes
    // the request first and treats the proposal as an extra.
    this.timeoutMs = Number(config.get<string>('AGENT_HOST_TIMEOUT_MS') ?? '20000');
  }

  /**
   * ⚠️ BOTH, NOT EITHER. A base URL with no token would send tenant data to an
   * endpoint that cannot authenticate us — and the host itself fails closed
   * without one, so the call could only ever be refused. Treating that as
   * "unconfigured" is honest; treating it as configured produces a stream of
   * 401s in the log that look like an outage.
   */
  isConfigured(): boolean {
    return this.baseUrl.length > 0 && this.token.length > 0;
  }

  describe(): string {
    return this.isConfigured()
      ? `agent host at ${this.baseUrl}`
      : 'agent host not configured (AGENT_HOST_URL / AGENT_HOST_TOKEN)';
  }

  async triage(input: TriageInput): Promise<TriageResult | null> {
    const raw = await this.post<Record<string, unknown>>('/triage', input);
    return raw ? (camelize(raw) as unknown as TriageResult) : null;
  }

  async discoverSuppliers(url: string, brief: string) {
    const raw = await this.post<Record<string, unknown>>('/discover/suppliers', {
      url,
      brief,
    });
    return raw
      ? (camelize(raw) as unknown as {
          suppliers: SupplierCandidate[];
          parts: PartCandidate[];
        })
      : null;
  }

  async discoverLeads(url: string, brief: string) {
    const raw = await this.post<Record<string, unknown>>('/discover/leads', {
      url,
      brief,
    });
    return raw ? (camelize(raw) as unknown as { leads: LeadCandidate[] }) : null;
  }

  /**
   * One place where every failure becomes `null`.
   *
   * ⚠️ `AbortSignal.timeout` rather than a race against a timer: an un-aborted
   * fetch keeps the socket and the event-loop handle alive after we have
   * stopped caring, and under load that is a leak rather than a slow request.
   * Same shape as `public/vpic.service.ts`, which is this repo's existing
   * outbound-HTTP precedent.
   */
  private async post<T>(path: string, body: unknown): Promise<T | null> {
    if (!this.isConfigured()) return null;
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) {
        // Logged at WARN, not ERROR: an agent that cannot answer is a degraded
        // convenience, not an incident. The status is logged; the BODY is not,
        // because a host's error body may echo the payload we sent it and this
        // log is not a place for tenant data.
        this.log.warn(`agent host ${path} answered ${res.status}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (err) {
      this.log.warn(
        `agent host ${path} unreachable: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
}

/**
 * The no-agent deployment, as a real implementation rather than a stub.
 *
 * Returns `null` from every skill, which every caller already handles because
 * `HttpAgentHost` returns `null` on failure too. There is deliberately no
 * second code path for "no agent configured" — one path means the unconfigured
 * case is exercised by every test that exercises a failure.
 */
@Injectable()
export class UnconfiguredAgentHost extends AgentHost {
  isConfigured(): boolean {
    return false;
  }
  describe(): string {
    return 'no agent host configured — proposals are not produced';
  }
  async triage(): Promise<null> {
    return null;
  }
  async discoverSuppliers(): Promise<null> {
    return null;
  }
  async discoverLeads(): Promise<null> {
    return null;
  }
}
