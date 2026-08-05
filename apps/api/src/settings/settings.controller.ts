import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import {
  money,
  optionalText,
  requiredText,
  validatedBody,
} from '../common/validation/validated-body';
import { SettingsService } from './settings.service';

/**
 * Settings and workshop admin — slice 6 of `COMPLETION_PLAN.md`.
 *
 * ⚠️ WHO MAY DO WHAT IS DECIDED IN `SettingsService`, not here. A guard on the
 * controller would have to be repeated on every route added later; the service
 * is the one place every caller passes through.
 *
 * ⚠️ THE VOCABULARIES BELOW MIRROR MIGRATION 045'S CHECK CONSTRAINTS. They are
 * duplicated deliberately: the database is the authority and refuses anything
 * else, and this layer exists so the refusal reads as a validation message
 * rather than a 500. If 045's vocabulary changes, these change with it.
 */

const SCOPES = [
  'repair_approval', 'quotation', 'purchase_order', 'refund', 'credit_note', 'warranty_claim',
] as const;
const CHANNELS = ['document', 'email', 'sms', 'in_app'] as const;
const NOTIFY_CHANNELS = ['email', 'sms', 'in_app', 'push'] as const;
const ACTION_KINDS = [
  'notify', 'assign', 'require_approval', 'block_transition', 'set_priority',
] as const;
const PROVIDER_KINDS = ['sms', 'email', 'payment', 'accounting', 'obd', 'storage'] as const;
const INTEGRATION_STATUS = ['disconnected', 'configured', 'connected', 'failed'] as const;

/** `HH:MM` or `HH:MM:SS`. Anything else reaches Postgres as an invalid time. */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const OpeningHoursBody = z
  .object({
    // ISO-8601 weekday: 1 = Monday … 7 = Sunday, matching `extract(isodow)` and
    // the CHECK in 045. A 0-6 form here would need a translation, and the
    // translation is where the off-by-one lives.
    weekday: z.number().int().min(1).max(7),
    isClosed: z.boolean(),
    opensAt: z.string().regex(TIME_RE, 'use HH:MM').optional(),
    closesAt: z.string().regex(TIME_RE, 'use HH:MM').optional(),
    isPublished: z.boolean(),
  })
  .strict()
  // The same rule the database enforces, stated here so the person typing gets
  // a sentence rather than a constraint name.
  .refine((v) => v.isClosed || (v.opensAt && v.closesAt), {
    message: 'An open day needs both an opening and a closing time.',
  })
  .refine((v) => v.isClosed || !v.opensAt || !v.closesAt || v.closesAt > v.opensAt, {
    message: 'The closing time must be after the opening time. A shift that runs past midnight is recorded as two days.',
  });

const ServiceCategoryBody = z
  .object({
    name: requiredText(200),
    description: optionalText(2000),
    defaultDurationMinutes: z.number().int().positive().max(10_000).optional(),
    indicativePrice: money().optional(),
    isPublished: z.boolean().default(false),
  })
  .strict();

const ApprovalLimitBody = z
  .object({
    roleName: requiredText(80),
    scope: z.enum(SCOPES),
    // 0 is meaningful — "may approve nothing" is not the same as having no row.
    maxAmount: money(),
  })
  .strict();

const TemplateBody = z
  .object({
    templateKey: z.string().regex(/^[a-z][a-z0-9_]{2,60}$/, 'lower case, letters, digits and underscores'),
    channel: z.enum(CHANNELS),
    name: requiredText(200),
    subject: optionalText(300),
    body: requiredText(20_000),
  })
  .strict()
  .refine((v) => v.channel !== 'email' || !!v.subject, {
    message: 'An email template needs a subject line — without one it cannot be sent.',
  });

const NotificationPrefBody = z
  .object({
    eventKey: z.string().regex(/^[a-z][a-z0-9_.]{2,80}$/),
    channel: z.enum(NOTIFY_CHANNELS),
    isEnabled: z.boolean(),
  })
  .strict();

const WorkflowRuleBody = z
  .object({
    name: requiredText(200),
    triggerEvent: z.string().regex(/^[a-z][a-z0-9_.]{2,80}$/),
    actionKind: z.enum(ACTION_KINDS),
    executionOrder: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

const IntegrationBody = z
  .object({
    providerKind: z.enum(PROVIDER_KINDS),
    providerName: requiredText(200),
    status: z.enum(INTEGRATION_STATUS).default('configured'),
    // Non-secret settings only. The database refuses credential-shaped keys and
    // the service translates that refusal; this cap only stops an unbounded blob.
    config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  })
  .strict();

const BranchBody = z
  .object({ name: requiredText(200), location: optionalText(500) })
  .strict();

const ActiveBody = z.object({ isActive: z.boolean() }).strict();

@Controller('settings')
@UseGuards(TenantGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('opening-hours')
  listOpeningHours(@Req() req: AuthenticatedRequest) {
    return this.settings.listOpeningHours(req.tenantContext);
  }

  @Post('opening-hours')
  setOpeningHours(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(OpeningHoursBody)) body: z.infer<typeof OpeningHoursBody>,
  ) {
    return this.settings.setOpeningHours(req.tenantContext, body);
  }

  @Get('service-categories')
  listServiceCategories(@Req() req: AuthenticatedRequest) {
    return this.settings.listServiceCategories(req.tenantContext);
  }

  @Post('service-categories')
  createServiceCategory(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(ServiceCategoryBody)) body: z.infer<typeof ServiceCategoryBody>,
  ) {
    return this.settings.createServiceCategory(
      req.tenantContext,
      body,
    );
  }

  @Patch('service-categories/:id')
  setServiceCategoryActive(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validatedBody(ActiveBody)) body: z.infer<typeof ActiveBody>,
  ) {
    return this.settings.setServiceCategoryActive(req.tenantContext, id, body.isActive);
  }

  @Get('approval-limits')
  listApprovalLimits(@Req() req: AuthenticatedRequest) {
    return this.settings.listApprovalLimits(req.tenantContext);
  }

  @Post('approval-limits')
  setApprovalLimit(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(ApprovalLimitBody)) body: z.infer<typeof ApprovalLimitBody>,
  ) {
    return this.settings.setApprovalLimit(req.tenantContext, body);
  }

  @Get('templates')
  listTemplates(@Req() req: AuthenticatedRequest) {
    return this.settings.listTemplates(req.tenantContext);
  }

  @Post('templates')
  saveTemplate(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(TemplateBody)) body: z.infer<typeof TemplateBody>,
  ) {
    return this.settings.saveTemplate(req.tenantContext, body);
  }

  @Get('notification-preferences')
  listNotificationPrefs(@Req() req: AuthenticatedRequest) {
    return this.settings.listNotificationPrefs(req.tenantContext);
  }

  @Post('notification-preferences')
  setNotificationPref(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(NotificationPrefBody)) body: z.infer<typeof NotificationPrefBody>,
  ) {
    return this.settings.setNotificationPref(
      req.tenantContext,
      body,
    );
  }

  @Get('workflow-rules')
  listWorkflowRules(@Req() req: AuthenticatedRequest) {
    return this.settings.listWorkflowRules(req.tenantContext);
  }

  @Post('workflow-rules')
  createWorkflowRule(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(WorkflowRuleBody)) body: z.infer<typeof WorkflowRuleBody>,
  ) {
    return this.settings.createWorkflowRule(req.tenantContext, body);
  }

  @Get('integrations')
  listIntegrations(@Req() req: AuthenticatedRequest) {
    return this.settings.listIntegrations(req.tenantContext);
  }

  @Post('integrations')
  saveIntegration(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(IntegrationBody)) body: z.infer<typeof IntegrationBody>,
  ) {
    return this.settings.saveIntegration(req.tenantContext, body);
  }

  @Get('branches')
  listBranches(@Req() req: AuthenticatedRequest) {
    return this.settings.listBranches(req.tenantContext);
  }

  @Post('branches')
  createBranch(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(BranchBody)) body: z.infer<typeof BranchBody>,
  ) {
    return this.settings.createBranch(req.tenantContext, body);
  }

  @Get('security-posture')
  securityPosture(@Req() req: AuthenticatedRequest) {
    return this.settings.securityPosture(req.tenantContext);
  }
}
