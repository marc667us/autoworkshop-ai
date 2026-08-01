import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type Socket } from 'node:net';
import { DatabaseService } from '../database/database.service';

/**
 * The Operations Centre — every dependency, probed for real.
 *
 * Ported from Solar's `/admin/operations`, which is that project's
 * implementation of Project Execution Directive §17 ("Ping Frontend/Backend/DB/
 * Redis/Queue · Check RLS · View Logs · Run Backup…"). This is the same idea
 * applied to this stack's five dependencies: Postgres, Redis, NATS, object
 * storage and Keycloak.
 *
 * 🔴 THE ONE RULE THAT MAKES THIS WORTH BUILDING: **A PROBE MUST PROVE THE
 * SERVICE WORKS, NOT THAT A PORT IS OPEN.**
 *
 * This repository has paid for the difference twice. Keycloak answered
 * `/health/ready` with UP for THIRTY HOURS while its database was dead — the
 * container was healthy, the port was open, the endpoint returned 200, and
 * nobody could sign in. Docker still reports all five containers healthy today;
 * `start-session.sh` warns in as many words that a container reporting healthy
 * is not proof the service works.
 *
 * So every probe below completes a real protocol exchange and checks the ANSWER:
 *
 *   * Postgres  — runs a query through the connection pool the application uses
 *   * Redis     — sends `PING`, requires `+PONG`
 *   * NATS      — reads the `INFO` banner the server sends on connect
 *   * Storage   — MinIO's own liveness endpoint over HTTP
 *   * Keycloak  — fetches the realm's OIDC discovery document AND checks the
 *                 issuer inside it matches the realm being asked for
 *
 * ⚠️ AND NOTE WHAT `GET /api/v1/health` DOES TODAY. It returns
 * `{status:'ok'}` unconditionally, without touching anything — so it answers 200
 * with every dependency in this list dead. That is the same shape as the
 * Keycloak incident, in this codebase, right now. This service is the honest
 * answer; `health.controller.ts` carries a note pointing here.
 *
 * ⚠️ NO ACTIONS IN THIS SLICE. Solar's operations centre also carries buttons
 * that VACUUM, restart the queue worker, clear the cache and revoke every
 * session. Those are genuinely useful and they are deliberately not here yet:
 * each is a destructive operation that Directive §17 requires to be permission
 * controlled AND audit logged, and Solar's own AI-SOC shipped detection through
 * three slices before anything was allowed to act. Reading first is the same
 * order.
 */

export type ProbeStatus = 'up' | 'down' | 'degraded' | 'not_configured';

export interface Probe {
  id: string;
  name: string;
  status: ProbeStatus;
  /** Round-trip milliseconds for the real exchange, not for opening a socket. */
  latencyMs: number | null;
  /** What answered, or why nothing did. Never contains a credential. */
  detail: string;
  /** What this probe actually proved, so a green light is not over-read. */
  proves: string;
}

export interface OperationsReport {
  generatedAt: string;
  probes: Probe[];
  migrations: { applied: number; latest: string | null; detail: string };
  audit: { total: number; last24h: number; detail: string };
  counts: { up: number; down: number; degraded: number; notConfigured: number };
}

/** Nothing waits longer than this. A probe that hangs is a probe that is down. */
const TIMEOUT_MS = 4000;

@Injectable()
export class OperationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async report(): Promise<OperationsReport> {
    // Probed CONCURRENTLY. Five sequential four-second timeouts would make a
    // fully-dead stack take twenty seconds to report, and an operations page
    // that hangs when things are broken is useless exactly when it is needed.
    const probes = await Promise.all([
      this.probePostgres(),
      this.probeRedis(),
      this.probeNats(),
      this.probeStorage(),
      this.probeKeycloak(),
    ]);

    const [migrations, audit] = await Promise.all([this.migrationState(), this.auditState()]);

    const counts = { up: 0, down: 0, degraded: 0, notConfigured: 0 };
    for (const p of probes) {
      if (p.status === 'up') counts.up += 1;
      else if (p.status === 'down') counts.down += 1;
      else if (p.status === 'degraded') counts.degraded += 1;
      else counts.notConfigured += 1;
    }

    return {
      generatedAt: new Date().toISOString(),
      probes,
      migrations,
      audit,
      counts,
    };
  }

  /**
   * Postgres — through the pool the application actually uses.
   *
   * Deliberately not a fresh connection with a fresh connection string: a probe
   * that opens its own connection can succeed while the pool the application
   * uses is exhausted, misconfigured or pointed somewhere else.
   */
  private async probePostgres(): Promise<Probe> {
    const started = Date.now();
    try {
      const rows = await this.db.queryWithoutTenant<{ v: number }>('SELECT 1 AS v');
      const ok = rows[0]?.v === 1;
      return {
        id: 'postgres',
        name: 'PostgreSQL',
        status: ok ? 'up' : 'degraded',
        latencyMs: Date.now() - started,
        detail: ok ? 'answered SELECT 1' : 'connected but returned an unexpected result',
        proves: 'the application pool can reach the database and run a statement',
      };
    } catch (err) {
      return {
        id: 'postgres',
        name: 'PostgreSQL',
        status: 'down',
        latencyMs: Date.now() - started,
        detail: safeMessage(err),
        proves: 'nothing — the query did not complete',
      };
    }
  }

  /**
   * Redis — a real `PING`, requiring `+PONG` back.
   *
   * Written against a raw socket rather than by adding a Redis client. RESP's
   * inline command form is two lines, and Directive §18 asks whether a new
   * package is necessary before adding it: a dependency carried in production
   * to support a health check is not.
   */
  private async probeRedis(): Promise<Probe> {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) return notConfigured('redis', 'Redis', 'REDIS_URL');

    const { host, port } = parseHostPort(url, 6379);
    const started = Date.now();
    try {
      const reply = await speak(host, port, 'PING\r\n');
      const ok = reply.startsWith('+PONG');
      return {
        id: 'redis',
        name: 'Redis',
        status: ok ? 'up' : 'degraded',
        latencyMs: Date.now() - started,
        detail: ok ? 'answered +PONG' : `unexpected reply: ${reply.slice(0, 40)}`,
        proves: ok
          ? 'Redis is accepting commands, not merely accepting connections'
          : 'a socket opened but the server did not speak RESP',
      };
    } catch (err) {
      return probeDown('redis', 'Redis', started, err);
    }
  }

  /**
   * NATS — reads the `INFO` banner the server sends unprompted on connect.
   *
   * A NATS server greets every new connection with `INFO {json}`. Receiving it
   * proves a NATS server is on the other end; a plain TCP connect would be
   * satisfied by anything at all listening on 4222.
   */
  private async probeNats(): Promise<Probe> {
    const url = this.config.get<string>('NATS_URL');
    if (!url) return notConfigured('nats', 'NATS', 'NATS_URL');

    const { host, port } = parseHostPort(url, 4222);
    const started = Date.now();
    try {
      const banner = await speak(host, port, null);
      const ok = banner.startsWith('INFO ');
      return {
        id: 'nats',
        name: 'NATS (domain events)',
        status: ok ? 'up' : 'degraded',
        latencyMs: Date.now() - started,
        detail: ok ? 'sent its INFO banner' : `unexpected greeting: ${banner.slice(0, 40)}`,
        proves: ok
          ? 'a NATS server answered, not just any process on the port'
          : 'something is listening but it is not NATS',
      };
    } catch (err) {
      return probeDown('nats', 'NATS (domain events)', started, err);
    }
  }

  /** Object storage — MinIO's own liveness endpoint. */
  private async probeStorage(): Promise<Probe> {
    const endpoint = this.config.get<string>('S3_ENDPOINT');
    if (!endpoint) return notConfigured('storage', 'Object storage', 'S3_ENDPOINT');

    const started = Date.now();
    try {
      const res = await fetchWithTimeout(`${endpoint.replace(/\/$/, '')}/minio/health/live`);
      const ok = res.ok;
      return {
        id: 'storage',
        name: 'Object storage (MinIO)',
        status: ok ? 'up' : 'degraded',
        latencyMs: Date.now() - started,
        detail: `HTTP ${res.status}`,
        proves: ok
          ? 'the storage service is live — NOT that the bucket exists or is writable'
          : 'the endpoint answered but not with a healthy status',
      };
    } catch (err) {
      return probeDown('storage', 'Object storage (MinIO)', started, err);
    }
  }

  /**
   * Keycloak — the realm's discovery document, and the issuer inside it.
   *
   * 🔴 THE ISSUER CHECK IS THE POINT, and it is what a naive probe misses.
   * Keycloak answers `/health/ready` from the server, which stayed UP for thirty
   * hours here while the realm was unusable. Asking the REALM for its discovery
   * document requires Keycloak to read its database, and comparing the `issuer`
   * inside it against the realm being asked for catches a server that is running
   * but serving a different or missing realm — which is a dead sign-in, and the
   * exact state the live site is in today.
   */
  private async probeKeycloak(): Promise<Probe> {
    const base = this.config.get<string>('KEYCLOAK_URL');
    const realm = this.config.get<string>('KEYCLOAK_REALM');
    if (!base || !realm) return notConfigured('keycloak', 'Keycloak', 'KEYCLOAK_URL / KEYCLOAK_REALM');

    const issuer = `${base.replace(/\/$/, '')}/realms/${realm}`;
    const started = Date.now();
    try {
      const res = await fetchWithTimeout(`${issuer}/.well-known/openid-configuration`);
      if (!res.ok) {
        return {
          id: 'keycloak',
          name: 'Keycloak (identity)',
          status: 'down',
          latencyMs: Date.now() - started,
          detail: `HTTP ${res.status} from the realm discovery document`,
          proves: 'the server answered, but the realm did not — sign-in would fail',
        };
      }
      const doc = (await res.json()) as { issuer?: string; token_endpoint?: string };
      const matches = doc.issuer === issuer;
      return {
        id: 'keycloak',
        name: 'Keycloak (identity)',
        status: matches ? 'up' : 'degraded',
        latencyMs: Date.now() - started,
        detail: matches
          ? `realm "${realm}" served its discovery document`
          : `issuer mismatch: expected ${issuer}, got ${doc.issuer ?? '(absent)'}`,
        proves: matches
          ? 'Keycloak read its database and served THIS realm — a token can be validated'
          : 'a realm answered, but not the one this application authenticates against',
      };
    } catch (err) {
      return probeDown('keycloak', 'Keycloak (identity)', started, err);
    }
  }

  /**
   * The migration ledger.
   *
   * Included because "which migrations has this database actually had applied"
   * is the question that has cost the most time on this project: migrations
   * 008-013 sat applied to a local Postgres and nowhere else for days, and
   * migration 029 was committed but not applied. Reading the ledger is the only
   * answer that is not a guess.
   */
  private async migrationState(): Promise<OperationsReport['migrations']> {
    try {
      // ⚠️ `version`, NOT `filename`. The first draft of this query named a
      // column that does not exist; it threw, the catch below swallowed it, and
      // the page reported "ledger unreadable" — a plausible-looking wrong answer
      // rather than a visible error. Checked against \d public.schema_migrations.
      const rows = await this.db.queryWithoutTenant<{ count: string; latest: string | null }>(
        `SELECT count(*)::text AS count, max(version) AS latest FROM public.schema_migrations`,
      );
      const applied = Number(rows[0]?.count ?? 0);
      return {
        applied,
        latest: rows[0]?.latest ?? null,
        detail:
          applied === 0
            ? 'The ledger is EMPTY — this database has had no migration applied through it.'
            : `${applied} migrations applied through the ledger.`,
      };
    } catch (err) {
      // A missing ledger table is itself the answer, not an error to swallow.
      return { applied: 0, latest: null, detail: `ledger unreadable: ${safeMessage(err)}` };
    }
  }

  private async auditState(): Promise<OperationsReport['audit']> {
    try {
      const rows = await this.db.queryWithoutTenant<{ total: string; recent: string }>(
        `SELECT count(*)::text AS total,
                count(*) FILTER (WHERE occurred_at > now() - interval '24 hours')::text AS recent
           FROM audit.events`,
      );
      const total = Number(rows[0]?.total ?? 0);
      const last24h = Number(rows[0]?.recent ?? 0);
      return {
        total,
        last24h,
        detail:
          total === 0
            ? 'No audit events at all — either nothing auditable has happened, or audit writes are not landing.'
            : `${last24h} event(s) in the last 24 hours.`,
      };
    } catch (err) {
      return { total: 0, last24h: 0, detail: `audit log unreadable: ${safeMessage(err)}` };
    }
  }
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

function notConfigured(id: string, name: string, envVar: string): Probe {
  return {
    id,
    name,
    status: 'not_configured',
    latencyMs: null,
    detail: `${envVar} is not set`,
    // Reported as its own status rather than as "down". A dependency nobody has
    // configured is a different problem from one that is configured and dead,
    // and merging them sends somebody to restart a service that does not exist.
    proves: 'nothing — this dependency has not been configured for this deployment',
  };
}

function probeDown(id: string, name: string, started: number, err: unknown): Probe {
  return {
    id,
    name,
    status: 'down',
    latencyMs: Date.now() - started,
    detail: safeMessage(err),
    proves: 'nothing — the exchange did not complete',
  };
}

/**
 * A message safe to show an administrator.
 *
 * ⚠️ CONNECTION ERRORS CAN CARRY THE URL, AND A URL CAN CARRY A PASSWORD. `pg`
 * and `fetch` both include the target in some failures, and `DATABASE_URL`
 * embeds credentials. Anything resembling `scheme://user:pass@host` is stripped
 * before the string leaves this file.
 */
export function safeMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return (
    raw
      // 1. Userinfo in a URL: `postgres://user:pass@host`. `DATABASE_URL` has
      //    this shape and `pg` includes the target in some failures.
      .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s/@]*@/gi, '[redacted]@')
      // 2. ⚠️ QUERY-STRING AND HEADER-STYLE SECRETS. Raised by Codex, and the
      //    gap was real: rule 1 alone passes `?token=…` and `X-Amz-Signature=…`
      //    straight through to the administrator's screen. S3-compatible
      //    endpoints sign requests in the query string, so this is the likely
      //    shape here rather than a hypothetical one.
      .replace(
        /\b(token|password|passwd|secret|api[-_]?key|access[-_]?key|signature|credential|authorization|sig)\b\s*[=:]\s*[^\s&"',;]+/gi,
        '$1=[redacted]',
      )
      // 3. A bare JWT, which can appear in a body a provider echoes back.
      .replace(/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]*/g, '[redacted-jwt]')
      // Truncated LAST. Truncating first could cut a secret in half and leave
      // the first 200 characters of it on screen.
      .slice(0, 200)
  );
}

/** Host and port out of a URL, without requiring the scheme to be http. */
function parseHostPort(url: string, fallbackPort: number): { host: string; port: number } {
  try {
    const u = new URL(url);
    return { host: u.hostname || '127.0.0.1', port: u.port ? Number(u.port) : fallbackPort };
  } catch {
    return { host: '127.0.0.1', port: fallbackPort };
  }
}

/**
 * Open a socket, optionally send something, and resolve with the first reply.
 *
 * ⚠️ THE SOCKET IS DESTROYED ON EVERY PATH, including timeout and error. A probe
 * that leaks a socket per call turns an operations page — the thing an
 * administrator refreshes when worried — into a slow file-descriptor leak.
 */
function speak(host: string, port: number, send: string | null): Promise<string> {
  return new Promise((resolve, reject) => {
    let socket: Socket | undefined;
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      socket?.destroy();
      fn();
    };

    const timer = setTimeout(
      () => finish(() => reject(new Error(`no reply within ${TIMEOUT_MS}ms`))),
      TIMEOUT_MS,
    );

    try {
      socket = connect({ host, port }, () => {
        if (send) socket?.write(send);
      });
    } catch (err) {
      clearTimeout(timer);
      finish(() => reject(err instanceof Error ? err : new Error(String(err))));
      return;
    }

    socket.once('data', (buf: Buffer) => {
      clearTimeout(timer);
      finish(() => resolve(buf.toString('utf8')));
    });
    socket.once('error', (err: Error) => {
      clearTimeout(timer);
      finish(() => reject(err));
    });
    socket.once('close', () => {
      clearTimeout(timer);
      finish(() => reject(new Error('the connection closed before any reply')));
    });
  });
}

/** `fetch` with a deadline — an operations page must never hang on a probe. */
async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
