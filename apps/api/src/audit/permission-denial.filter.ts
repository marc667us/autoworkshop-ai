import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';
import { AuditService } from './audit.service';

/**
 * A8 — PERMISSION DENIALS ARE AUDITED, AND AS A MECHANISM RATHER THAN A HABIT.
 *
 * `CLAUDE.md` §16 lists "permission denied" and "tenant violation attempt" among
 * the events this platform must audit. Neither was ever written. There are 90
 * `ForbiddenException` throw sites in `apps/api/src`, so the version of this fix
 * that adds an audit call beside each one is the version that is 89/90 complete
 * six months from now and silently wrong about the one that matters. Worse,
 * every slice after this one adds more denial paths — which is the argument for
 * fixing the mechanism BEFORE multiplying the gaps, not after.
 *
 * So: one filter, at the edge, catching the exception every refusal already
 * throws. A new refusal is audited because it is a refusal, not because
 * somebody remembered.
 *
 * ── 🔴 WHY THIS WRITES ON A SEPARATE CONNECTION, AGAINST `AuditService`'S OWN
 * DOCUMENTED RULE ───────────────────────────────────────────────────────────
 *
 * `AuditService.write` takes the caller's transaction client on purpose, so a
 * business change and its audit row commit or roll back together. Here that
 * rule inverts: the request transaction has ALREADY rolled back by the time an
 * exception reaches a filter, so an audit row written on that client would roll
 * back with it and the denial would leave no trace — which is the exact defect
 * being fixed. There is no business change to stay consistent with; the denial
 * IS the event. A fresh connection is therefore correct here and nowhere else,
 * and that is why it is written down rather than left to be re-derived.
 *
 * ── ⚠️ A FAILED AUDIT MUST NOT CONVERT A 403 INTO A 500 ─────────────────────
 *
 * The user is being refused either way. Turning a clean refusal into a server
 * error because the audit insert failed would hand an attacker a way to tell
 * "denied" from "denied and unlogged", and would break a working refusal on a
 * database hiccup. The write is best-effort and its failure is LOGGED loudly —
 * silence there would be the third instance in this repo of a monitor that is
 * itself the dead thing.
 *
 * ── ⚠️ AND IT MUST NOT AUDIT WHAT IT CANNOT ATTRIBUTE ───────────────────────
 *
 * `audit.events` carries a NOT NULL `tenant_id`. A refusal thrown before
 * `TenantGuard` resolved a context (an unauthenticated probe, a marketplace
 * buyer with no membership) has no tenant to attribute it to, so it is counted
 * in the log and not inserted. Inventing a tenant id to satisfy a column is how
 * an audit trail starts describing things that did not happen.
 */
@Catch(ForbiddenException)
export class PermissionDenialAuditFilter implements ExceptionFilter {
  private readonly logger = new Logger(PermissionDenialAuditFilter.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async catch(exception: ForbiddenException, host: ArgumentsHost): Promise<void> {
    const http = host.switchToHttp();
    const req = http.getRequest<Request & { tenantContext?: TenantContext }>();
    const res = http.getResponse<Response>();

    const ctx = req.tenantContext;
    if (ctx) {
      try {
        await this.db.withTenant(ctx, async (client) => {
          await this.audit.write(client, ctx, {
            action: 'permission.denied',
            // The route, not the record. A refusal usually means the caller
            // never got far enough to name a resource, and a resource id
            // guessed here would be fiction in an append-only table.
            resourceType: 'route',
            resourceId: `${req.method} ${req.path}`.slice(0, 300),
            result: 'denied',
            detail: {
              // The refusal's own words. Every refusal in this codebase is
              // required to name a reachable alternative, so this text is the
              // most useful thing an auditor can read.
              reason: exception.message,
              // `activeRole`, not `roleName`. The field is named for the fact
              // that a request carries ONE role, not the user's whole set —
              // and a wrong field name here would have logged `null` for every
              // denial while typechecking cleanly under `?? null`.
              role: ctx.activeRole,
            },
          });
        });
      } catch (err) {
        this.logger.error(
          `permission denial for ${req.method} ${req.path} was NOT audited: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    } else {
      this.logger.warn(
        `permission denial for ${req.method} ${req.path} has no tenant context — ` +
          'not attributable, so not inserted',
      );
    }

    // Re-send the refusal EXACTLY as Nest would have. Auditing must not change
    // what the caller sees.
    const body = exception.getResponse();
    res.status(exception.getStatus()).json(body);
  }
}
