import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { TenantContext } from '../tenancy/tenant-context';

export interface AuditEvent {
  action: string;
  resourceType?: string;
  resourceId?: string;
  actorKind?: 'user' | 'agent' | 'system';
  agentId?: string;
  approvalStatus?: string;
  result?: 'success' | 'denied' | 'error';
  detail?: Record<string, unknown>;
}

/**
 * Audit trail.
 *
 * `audit.events` is append-only, enforced in the database by DO INSTEAD NOTHING
 * rules on UPDATE and DELETE, and reinforced by withholding those grants from
 * the application role. An audit trail that can be edited is not an audit trail.
 *
 * `write` takes the SAME transaction client as the work it records, so the
 * business change and its audit row commit or roll back together. An audit
 * written on a separate connection could survive a rolled-back change and
 * describe something that never happened.
 */
@Injectable()
export class AuditService {
  async write(
    client: PoolClient,
    ctx: TenantContext,
    event: AuditEvent,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit.events
         (tenant_id, organization_id, actor_user_id, actor_agent_id, actor_kind,
          action, resource_type, resource_id, correlation_id, approval_status,
          result, detail)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        ctx.tenantId,
        ctx.organizationId,
        ctx.userId,
        event.agentId ?? null,
        event.actorKind ?? 'user',
        event.action,
        event.resourceType ?? null,
        event.resourceId ?? null,
        ctx.correlationId,
        event.approvalStatus ?? null,
        event.result ?? 'success',
        JSON.stringify(event.detail ?? {}),
      ],
    );
  }
}
