import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * Settings and workshop admin — slice 6 of `COMPLETION_PLAN.md`.
 *
 * ── 🔴 THESE TABLES STATE POLICY; THEY DO NOT ENFORCE IT ───────────────────
 *
 * `core.approval_limits` and `core.workflow_rules` RECORD what a workshop has
 * decided. The approval path in `repair` and the stage machine are what apply
 * them. Writing that down matters because the failure mode of a limits table is
 * a reader concluding limits are enforced because a limits table exists — the
 * "comment claiming a guard that does not exist" defect, recorded four times in
 * this repository, in table form.
 *
 * `listApprovalLimits` therefore returns `isEnforced` on every row, and the
 * screen prints it. A workshop that sets a limit and believes it is being
 * applied when it is not is worse off than one with no limits screen at all.
 *
 * ── ⚠️ WHO MAY CHANGE SETTINGS ─────────────────────────────────────────────
 *
 * The whole `settings` nav group is `organization.admin` in every tree, so the
 * nav will not show these routes to anyone else. That is not the enforcement —
 * hiding is not refusing, and a page.tsx resolves ahead of the catch-all. The
 * refusals below are.
 *
 * READING is deliberately wider than WRITING: reception needs to know when the
 * workshop opens and which service categories exist to book anything at all.
 * Locking reads to owners would make the booking screens lie.
 */

/** Only these may CHANGE how the workshop is configured. */
const MAY_ADMINISTER = ['workshop_owner', 'workshop_manager', 'platform_administrator'] as const;

/**
 * Only the owner may change what MONEY people can approve, or which external
 * accounts are connected. A manager who can raise their own approval limit does
 * not have an approval limit.
 */
const MAY_GOVERN = ['workshop_owner', 'platform_administrator'] as const;

export interface OpeningHoursRow {
  id: string;
  weekday: number;
  isClosed: boolean;
  opensAt: string | null;
  closesAt: string | null;
  isPublished: boolean;
}

export interface ServiceCategoryRow {
  id: string;
  name: string;
  description: string | null;
  defaultDurationMinutes: number | null;
  indicativePrice: string | null;
  currency: string;
  isActive: boolean;
  isPublished: boolean;
  displayOrder: number;
}

export interface ApprovalLimitRow {
  id: string;
  roleName: string;
  scope: string;
  maxAmount: string;
  currency: string;
  /** See the class comment. Always false today, and printed on the screen. */
  isEnforced: boolean;
}

export interface TemplateRow {
  id: string;
  templateKey: string;
  channel: string;
  name: string;
  subject: string | null;
  body: string;
  isActive: boolean;
}

export interface NotificationPrefRow {
  id: string;
  eventKey: string;
  channel: string;
  isEnabled: boolean;
  userId: string | null;
}

export interface WorkflowRuleRow {
  id: string;
  name: string;
  triggerEvent: string;
  actionKind: string;
  executionOrder: number;
  isActive: boolean;
  /** As above: recorded, not running. */
  isEnforced: boolean;
}

export interface IntegrationRow {
  id: string;
  providerKind: string;
  providerName: string;
  status: string;
  config: Record<string, unknown>;
  hasSecret: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
}

export interface BranchRow {
  id: string;
  name: string;
  location: string | null;
  status: string;
  memberCount: number;
}

export interface SecurityPostureRow {
  administrators: { userId: string; displayName: string; roleName: string }[];
  recentDenials: {
    at: string;
    actor: string | null;
    route: string | null;
    reason: string | null;
  }[];
  forcedRlsTables: number;
  unforcedRlsTables: number;
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  private assertMayAdminister(ctx: TenantContext): void {
    if (!MAY_ADMINISTER.includes(ctx.activeRole as (typeof MAY_ADMINISTER)[number])) {
      // 🔴 EVERY REFUSAL NAMES A REACHABLE ALTERNATIVE. A rule whose escape
      // hatch does not exist is a wall, and walls are the most expensive defect
      // class recorded in this repository.
      throw new ForbiddenException(
        'Changing how the workshop is configured is the owner\'s or manager\'s. ' +
          'You can see the current settings on this page, and the workshop profile at ' +
          '/workshop-management/workshop-profile.',
      );
    }
  }

  private assertMayGovern(ctx: TenantContext): void {
    if (!MAY_GOVERN.includes(ctx.activeRole as (typeof MAY_GOVERN)[number])) {
      throw new ForbiddenException(
        'Approval limits and connected accounts are the workshop owner\'s alone — ' +
          'a manager who can raise their own limit does not have one. ' +
          'Ask the owner, or see the limits as they stand on this page.',
      );
    }
  }

  // ── opening hours ─────────────────────────────────────────────────────────

  async listOpeningHours(ctx: TenantContext): Promise<OpeningHoursRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT id, weekday, is_closed, opens_at::text, closes_at::text, is_published
           FROM core.opening_hours
          WHERE tenant_id = $1 AND organization_id = $2
          ORDER BY weekday`,
        [ctx.tenantId, ctx.organizationId],
      );
      return r.rows.map((x) => ({
        id: x.id as string,
        weekday: Number(x.weekday),
        isClosed: x.is_closed as boolean,
        opensAt: (x.opens_at as string | null) ?? null,
        closesAt: (x.closes_at as string | null) ?? null,
        isPublished: x.is_published as boolean,
      }));
    });
  }

  /**
   * Upsert one weekday.
   *
   * ⚠️ ON CONFLICT names the constraint rather than the columns, because the
   * constraint is `NULLS NOT DISTINCT` and an inferred column list would not
   * match it — the insert would then succeed as a SECOND Monday and the public
   * profile would render two contradictory answers.
   */
  async setOpeningHours(
    ctx: TenantContext,
    input: {
      weekday: number;
      isClosed: boolean;
      opensAt?: string;
      closesAt?: string;
      isPublished: boolean;
    },
  ): Promise<OpeningHoursRow[]> {
    this.assertMayAdminister(ctx);
    await this.db.withTenant(ctx, async (client) => {
      await client.query(
        `INSERT INTO core.opening_hours
           (tenant_id, organization_id, weekday, is_closed, opens_at, closes_at,
            is_published, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5::time,$6::time,$7,$8,$8)
         ON CONFLICT ON CONSTRAINT uq_hours_day DO UPDATE
            SET is_closed = EXCLUDED.is_closed,
                opens_at = EXCLUDED.opens_at,
                closes_at = EXCLUDED.closes_at,
                is_published = EXCLUDED.is_published,
                updated_by = EXCLUDED.updated_by,
                updated_at = now()`,
        [
          ctx.tenantId,
          ctx.organizationId,
          input.weekday,
          input.isClosed,
          input.isClosed ? null : (input.opensAt ?? null),
          input.isClosed ? null : (input.closesAt ?? null),
          input.isPublished,
          ctx.userId,
        ],
      );
      await this.audit.write(client, ctx, {
        action: 'settings.opening_hours.changed',
        resourceType: 'opening_hours',
        resourceId: String(input.weekday),
        detail: { ...input },
      });
    });
    return this.listOpeningHours(ctx);
  }

  // ── service categories ────────────────────────────────────────────────────

  async listServiceCategories(ctx: TenantContext): Promise<ServiceCategoryRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT id, name, description, default_duration_minutes, indicative_price,
                currency, is_active, is_published, display_order
           FROM core.service_categories
          WHERE tenant_id = $1 AND organization_id = $2
          ORDER BY display_order, name`,
        [ctx.tenantId, ctx.organizationId],
      );
      return r.rows.map((x) => ({
        id: x.id as string,
        name: x.name as string,
        description: (x.description as string | null) ?? null,
        defaultDurationMinutes:
          x.default_duration_minutes === null ? null : Number(x.default_duration_minutes),
        indicativePrice: x.indicative_price === null ? null : String(x.indicative_price),
        currency: x.currency as string,
        isActive: x.is_active as boolean,
        isPublished: x.is_published as boolean,
        displayOrder: Number(x.display_order),
      }));
    });
  }

  async createServiceCategory(
    ctx: TenantContext,
    input: {
      name: string;
      description?: string;
      defaultDurationMinutes?: number;
      indicativePrice?: number;
      isPublished: boolean;
    },
  ): Promise<ServiceCategoryRow[]> {
    this.assertMayAdminister(ctx);
    await this.db.withTenant(ctx, async (client) => {
      try {
        await client.query(
          `INSERT INTO core.service_categories
             (tenant_id, organization_id, name, description, default_duration_minutes,
              indicative_price, is_published, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
          [
            ctx.tenantId,
            ctx.organizationId,
            input.name.trim(),
            input.description ?? null,
            input.defaultDurationMinutes ?? null,
            input.indicativePrice ?? null,
            input.isPublished,
            ctx.userId,
          ],
        );
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new ConflictException(
            `This workshop already offers a service category called "${input.name.trim()}". ` +
              'Edit that one rather than adding a second with the same name.',
          );
        }
        throw error;
      }
      await this.audit.write(client, ctx, {
        action: 'settings.service_category.created',
        resourceType: 'service_category',
        detail: { name: input.name.trim() },
      });
    });
    return this.listServiceCategories(ctx);
  }

  /**
   * Deactivate, never delete. A category that priced past jobs must stay
   * readable or those jobs stop explaining themselves — which is why the
   * migration withholds DELETE from the application role rather than trusting
   * this method to be the only path.
   */
  async setServiceCategoryActive(
    ctx: TenantContext,
    id: string,
    isActive: boolean,
  ): Promise<ServiceCategoryRow[]> {
    this.assertMayAdminister(ctx);
    await this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `UPDATE core.service_categories
            SET is_active = $4, updated_by = $5, updated_at = now()
          WHERE id = $1 AND tenant_id = $2 AND organization_id = $3`,
        [id, ctx.tenantId, ctx.organizationId, isActive, ctx.userId],
      );
      if (r.rowCount === 0) {
        throw new NotFoundException('That service category is not in this workshop.');
      }
      await this.audit.write(client, ctx, {
        action: isActive
          ? 'settings.service_category.reactivated'
          : 'settings.service_category.deactivated',
        resourceType: 'service_category',
        resourceId: id,
      });
    });
    return this.listServiceCategories(ctx);
  }

  // ── approval limits ───────────────────────────────────────────────────────

  async listApprovalLimits(ctx: TenantContext): Promise<ApprovalLimitRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT id, role_name, scope, max_amount, currency
           FROM core.approval_limits
          WHERE tenant_id = $1 AND organization_id = $2
          ORDER BY scope, role_name`,
        [ctx.tenantId, ctx.organizationId],
      );
      return r.rows.map((x) => ({
        id: x.id as string,
        roleName: x.role_name as string,
        scope: x.scope as string,
        maxAmount: String(x.max_amount),
        currency: x.currency as string,
        // 🔴 HONEST, NOT ASPIRATIONAL. Nothing reads these rows yet. The day the
        // approval path does, this becomes a lookup — and until then the screen
        // says so in as many words.
        isEnforced: false,
      }));
    });
  }

  async setApprovalLimit(
    ctx: TenantContext,
    input: { roleName: string; scope: string; maxAmount: number },
  ): Promise<ApprovalLimitRow[]> {
    this.assertMayGovern(ctx);
    await this.db.withTenant(ctx, async (client) => {
      await client.query(
        `INSERT INTO core.approval_limits
           (tenant_id, organization_id, role_name, scope, max_amount, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$6)
         ON CONFLICT ON CONSTRAINT uq_approval_limit DO UPDATE
            SET max_amount = EXCLUDED.max_amount,
                updated_by = EXCLUDED.updated_by,
                updated_at = now()`,
        [ctx.tenantId, ctx.organizationId, input.roleName, input.scope, input.maxAmount, ctx.userId],
      );
      await this.audit.write(client, ctx, {
        action: 'settings.approval_limit.changed',
        resourceType: 'approval_limit',
        resourceId: `${input.roleName}:${input.scope}`,
        detail: { maxAmount: input.maxAmount },
      });
    });
    return this.listApprovalLimits(ctx);
  }

  // ── templates ─────────────────────────────────────────────────────────────

  async listTemplates(ctx: TenantContext): Promise<TemplateRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT id, template_key, channel, name, subject, body, is_active
           FROM core.document_templates
          WHERE tenant_id = $1 AND organization_id = $2
          ORDER BY channel, name`,
        [ctx.tenantId, ctx.organizationId],
      );
      return r.rows.map((x) => ({
        id: x.id as string,
        templateKey: x.template_key as string,
        channel: x.channel as string,
        name: x.name as string,
        subject: (x.subject as string | null) ?? null,
        body: x.body as string,
        isActive: x.is_active as boolean,
      }));
    });
  }

  async saveTemplate(
    ctx: TenantContext,
    input: {
      templateKey: string;
      channel: string;
      name: string;
      subject?: string;
      body: string;
    },
  ): Promise<TemplateRow[]> {
    this.assertMayAdminister(ctx);
    await this.db.withTenant(ctx, async (client) => {
      await client.query(
        `INSERT INTO core.document_templates
           (tenant_id, organization_id, template_key, channel, name, subject, body,
            created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
         ON CONFLICT ON CONSTRAINT uq_template_key DO UPDATE
            SET channel = EXCLUDED.channel,
                name = EXCLUDED.name,
                subject = EXCLUDED.subject,
                body = EXCLUDED.body,
                updated_by = EXCLUDED.updated_by,
                updated_at = now()`,
        [
          ctx.tenantId,
          ctx.organizationId,
          input.templateKey,
          input.channel,
          input.name.trim(),
          input.subject ?? null,
          input.body,
          ctx.userId,
        ],
      );
      await this.audit.write(client, ctx, {
        action: 'settings.template.saved',
        resourceType: 'document_template',
        resourceId: input.templateKey,
      });
    });
    return this.listTemplates(ctx);
  }

  // ── notification preferences ──────────────────────────────────────────────

  async listNotificationPrefs(ctx: TenantContext): Promise<NotificationPrefRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT id, event_key, channel, is_enabled, user_id
           FROM core.notification_preferences
          WHERE tenant_id = $1 AND organization_id = $2
          ORDER BY event_key, channel`,
        [ctx.tenantId, ctx.organizationId],
      );
      return r.rows.map((x) => ({
        id: x.id as string,
        eventKey: x.event_key as string,
        channel: x.channel as string,
        isEnabled: x.is_enabled as boolean,
        userId: (x.user_id as string | null) ?? null,
      }));
    });
  }

  async setNotificationPref(
    ctx: TenantContext,
    input: { eventKey: string; channel: string; isEnabled: boolean },
  ): Promise<NotificationPrefRow[]> {
    this.assertMayAdminister(ctx);
    await this.db.withTenant(ctx, async (client) => {
      await client.query(
        `INSERT INTO core.notification_preferences
           (tenant_id, organization_id, user_id, event_key, channel, is_enabled,
            created_by, updated_by)
         VALUES ($1,$2,NULL,$3,$4,$5,$6,$6)
         ON CONFLICT ON CONSTRAINT uq_notification_pref DO UPDATE
            SET is_enabled = EXCLUDED.is_enabled,
                updated_by = EXCLUDED.updated_by,
                updated_at = now()`,
        [ctx.tenantId, ctx.organizationId, input.eventKey, input.channel, input.isEnabled, ctx.userId],
      );
      await this.audit.write(client, ctx, {
        action: 'settings.notification_pref.changed',
        resourceType: 'notification_preference',
        resourceId: `${input.eventKey}:${input.channel}`,
        detail: { isEnabled: input.isEnabled },
      });
    });
    return this.listNotificationPrefs(ctx);
  }

  // ── workflow rules ────────────────────────────────────────────────────────

  async listWorkflowRules(ctx: TenantContext): Promise<WorkflowRuleRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT id, name, trigger_event, action_kind, execution_order, is_active
           FROM core.workflow_rules
          WHERE tenant_id = $1 AND organization_id = $2
          ORDER BY trigger_event, execution_order, created_at`,
        [ctx.tenantId, ctx.organizationId],
      );
      return r.rows.map((x) => ({
        id: x.id as string,
        name: x.name as string,
        triggerEvent: x.trigger_event as string,
        actionKind: x.action_kind as string,
        executionOrder: Number(x.execution_order),
        isActive: x.is_active as boolean,
        isEnforced: false,
      }));
    });
  }

  async createWorkflowRule(
    ctx: TenantContext,
    input: {
      name: string;
      triggerEvent: string;
      actionKind: string;
      executionOrder?: number;
    },
  ): Promise<WorkflowRuleRow[]> {
    this.assertMayAdminister(ctx);
    await this.db.withTenant(ctx, async (client) => {
      try {
        await client.query(
          `INSERT INTO core.workflow_rules
             (tenant_id, organization_id, name, trigger_event, action_kind,
              execution_order, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,COALESCE($6,100),$7,$7)`,
          [
            ctx.tenantId,
            ctx.organizationId,
            input.name.trim(),
            input.triggerEvent,
            input.actionKind,
            input.executionOrder ?? null,
            ctx.userId,
          ],
        );
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new ConflictException(
            `This workshop already has a rule called "${input.name.trim()}".`,
          );
        }
        throw error;
      }
      await this.audit.write(client, ctx, {
        action: 'settings.workflow_rule.created',
        resourceType: 'workflow_rule',
        detail: { name: input.name.trim(), triggerEvent: input.triggerEvent },
      });
    });
    return this.listWorkflowRules(ctx);
  }

  // ── integrations (D7 / ADR-015) ───────────────────────────────────────────

  /**
   * ⚠️ `config` IS RETURNED, `secret_ref` IS NOT — only whether one exists.
   * The reference is a lookup key into the platform secret store, and echoing
   * it back to a browser turns a stored secret into a named one. The trigger in
   * migration 045 already refuses credentials inside `config`, so what is
   * returned here is settings, not keys.
   */
  async listIntegrations(ctx: TenantContext): Promise<IntegrationRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT id, provider_kind, provider_name, status, config,
                (secret_ref IS NOT NULL) AS has_secret, last_checked_at, last_error
           FROM core.integrations
          WHERE tenant_id = $1 AND organization_id = $2
          ORDER BY provider_kind, provider_name`,
        [ctx.tenantId, ctx.organizationId],
      );
      return r.rows.map((x) => ({
        id: x.id as string,
        providerKind: x.provider_kind as string,
        providerName: x.provider_name as string,
        status: x.status as string,
        config: (x.config as Record<string, unknown>) ?? {},
        hasSecret: x.has_secret as boolean,
        lastCheckedAt: x.last_checked_at ? (x.last_checked_at as Date).toISOString() : null,
        lastError: (x.last_error as string | null) ?? null,
      }));
    });
  }

  async saveIntegration(
    ctx: TenantContext,
    input: {
      providerKind: string;
      providerName: string;
      config: Record<string, unknown>;
      status: string;
    },
  ): Promise<IntegrationRow[]> {
    this.assertMayGovern(ctx);
    await this.db.withTenant(ctx, async (client) => {
      try {
        await client.query(
          `INSERT INTO core.integrations
             (tenant_id, organization_id, provider_kind, provider_name, status, config,
              created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$7)
           ON CONFLICT ON CONSTRAINT uq_integration DO UPDATE
              SET status = EXCLUDED.status,
                  config = EXCLUDED.config,
                  updated_by = EXCLUDED.updated_by,
                  updated_at = now()`,
          [
            ctx.tenantId,
            ctx.organizationId,
            input.providerKind,
            input.providerName.trim(),
            input.status,
            JSON.stringify(input.config),
            ctx.userId,
          ],
        );
      } catch (error) {
        // The database refuses credentials in `config`. Translate its message
        // into one the person typing can act on, rather than leaking raw SQL.
        if ((error as { code?: string }).code === '23514') {
          throw new ConflictException(
            'That setting looks like a credential (a key, token, password or secret). ' +
              'Credentials are never stored in the connection settings — put the ' +
              'non-secret details here and the workshop owner installs the secret separately.',
          );
        }
        throw error;
      }
      await this.audit.write(client, ctx, {
        action: 'settings.integration.saved',
        resourceType: 'integration',
        resourceId: `${input.providerKind}:${input.providerName.trim()}`,
        // The config keys, never their values. An audit trail that records what
        // was configured must not become the place the values end up.
        detail: { providerKind: input.providerKind, configKeys: Object.keys(input.config) },
      });
    });
    return this.listIntegrations(ctx);
  }

  // ── branches ──────────────────────────────────────────────────────────────

  /**
   * `identity.branches` already existed (migration 002). This slice gives it a
   * screen rather than a second table — the "search for an existing equivalent
   * before creating one" rule in the Project Execution Directive §3.
   */
  async listBranches(ctx: TenantContext): Promise<BranchRow[]> {
    return this.db.withTenant(ctx, async (client) => {
      const r = await client.query(
        `SELECT b.id, b.name, b.location, b.status,
                count(m.id) FILTER (WHERE m.status = 'active') AS member_count
           FROM identity.branches b
           LEFT JOIN identity.memberships m ON m.branch_id = b.id
          WHERE b.tenant_id = $1 AND b.organization_id = $2
          GROUP BY b.id, b.name, b.location, b.status
          ORDER BY b.name`,
        [ctx.tenantId, ctx.organizationId],
      );
      return r.rows.map((x) => ({
        id: x.id as string,
        name: x.name as string,
        location: (x.location as string | null) ?? null,
        status: x.status as string,
        memberCount: Number(x.member_count),
      }));
    });
  }

  async createBranch(
    ctx: TenantContext,
    input: { name: string; location?: string },
  ): Promise<BranchRow[]> {
    this.assertMayAdminister(ctx);
    await this.db.withTenant(ctx, async (client) => {
      await client.query(
        `INSERT INTO identity.branches
           (tenant_id, organization_id, name, location, created_by)
         VALUES ($1,$2,$3,$4,$5)`,
        [ctx.tenantId, ctx.organizationId, input.name.trim(), input.location ?? null, ctx.userId],
      );
      await this.audit.write(client, ctx, {
        action: 'settings.branch.created',
        resourceType: 'branch',
        detail: { name: input.name.trim() },
      });
    });
    return this.listBranches(ctx);
  }

  // ── security posture ──────────────────────────────────────────────────────

  /**
   * `/settings/security` — a READ of the real posture, with no table of its own.
   *
   * 🔴 THIS PAGE ONLY EXISTS BECAUSE A8 WAS FIXED FIRST. Before
   * `PermissionDenialAuditFilter`, `audit.events` contained no denial rows at
   * all, so a security screen would have shown a permanently empty table for a
   * reason no reader could guess — the `SuppliersScreen` defect of slice 4,
   * which called an endpoint that did not exist.
   *
   * The RLS counts are read from `pg_class`, not from a list maintained by hand:
   * a hand-maintained list is the thing that says "enabled" while the mechanism
   * is inert, recorded five or more times across these two projects.
   */
  async securityPosture(ctx: TenantContext): Promise<SecurityPostureRow> {
    return this.db.withTenant(ctx, async (client) => {
      const admins = await client.query(
        `SELECT u.id, COALESCE(NULLIF(btrim(u.display_name), ''), u.email) AS display_name,
                m.role_name
           FROM identity.memberships m
           JOIN identity.users u ON u.id = m.user_id
          WHERE m.tenant_id = $1 AND m.organization_id = $2
            AND m.status = 'active'
            AND m.role_name IN ('workshop_owner', 'workshop_manager', 'platform_administrator')
          ORDER BY m.role_name, display_name`,
        [ctx.tenantId, ctx.organizationId],
      );

      const denials = await client.query(
        // `occurred_at`, not `created_at`. The column is named for the moment
        // the event happened rather than the moment the row was written, and
        // guessing the conventional name here would have been a 500 on a
        // security page — the same class as mobile reading `stageOptions` when
        // the API returns `allowedStages`.
        `SELECT occurred_at, actor_user_id, resource_id, detail
           FROM audit.events
          WHERE tenant_id = $1 AND organization_id = $2
            AND action = 'permission.denied'
          ORDER BY occurred_at DESC
          LIMIT 25`,
        [ctx.tenantId, ctx.organizationId],
      );

      // Measured from the catalogue, so this cannot drift from reality.
      const rls = await client.query(
        `SELECT count(*) FILTER (WHERE relforcerowsecurity) AS forced,
                count(*) FILTER (WHERE relrowsecurity AND NOT relforcerowsecurity) AS unforced
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind = 'r'
            AND n.nspname NOT IN ('pg_catalog', 'information_schema')`,
      );

      return {
        administrators: admins.rows.map((x) => ({
          userId: x.id as string,
          displayName: x.display_name as string,
          roleName: x.role_name as string,
        })),
        recentDenials: denials.rows.map((x) => {
          const detail = (x.detail as Record<string, unknown> | null) ?? {};
          return {
            at: (x.occurred_at as Date).toISOString(),
            actor: (x.actor_user_id as string | null) ?? null,
            route: (x.resource_id as string | null) ?? null,
            reason: typeof detail.reason === 'string' ? detail.reason : null,
          };
        }),
        forcedRlsTables: Number(rls.rows[0]!.forced),
        unforcedRlsTables: Number(rls.rows[0]!.unforced),
      };
    });
  }
}
