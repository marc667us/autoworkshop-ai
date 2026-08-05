import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import { optionalText, requiredText, uuid, validatedBody } from '../common/validation/validated-body';
import { SelfServiceService } from './selfservice.service';

/**
 * Customer self-service — slice 9 of `COMPLETION_PLAN.md`.
 *
 * ⚠️ `customerId` IS A QUERY PARAMETER, AND THE SERVICE REFUSES IT FROM A
 * CUSTOMER. It exists so reception can look at a customer's documents at the
 * desk. A customer who supplies one is refused outright rather than silently
 * given their own — a silent substitution would mask an authorization probe.
 */

const DOCUMENT_KINDS = [
  'insurance', 'roadworthiness', 'registration', 'warranty',
  'service_book', 'purchase_receipt', 'other',
] as const;
const CASE_CATEGORIES = ['billing', 'quality', 'delay', 'warranty', 'account', 'other'] as const;

/** `YYYY-MM-DD`. Anything else reaches Postgres as an invalid date. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const DocumentBody = z
  .object({
    vehicleId: uuid(),
    documentKind: z.enum(DOCUMENT_KINDS),
    title: requiredText(300),
    reference: optionalText(200),
    expiresOn: z.string().regex(DATE_RE, 'use YYYY-MM-DD').optional(),
  })
  .strict();

const MaintenanceBody = z
  .object({
    vehicleId: uuid(),
    item: requiredText(300),
    dueAtKm: z.number().int().positive().max(10_000_000).optional(),
    dueOn: z.string().regex(DATE_RE, 'use YYYY-MM-DD').optional(),
    notes: optionalText(2000),
  })
  .strict()
  // The same rule migration 047 enforces, stated here so the person typing gets
  // a sentence rather than a constraint name. A reminder that can never fire
  // looks like cover and is not.
  .refine((v) => v.dueAtKm !== undefined || v.dueOn !== undefined, {
    message: 'Say when it is due — at a mileage, on a date, or both. Neither means the reminder can never fire.',
  });

const DriverBody = z
  .object({
    fullName: requiredText(200),
    phone: optionalText(40),
    relationship: optionalText(120),
    vehicleId: uuid().optional(),
    mayDropOff: z.boolean().default(true),
    mayCollect: z.boolean().default(true),
    // Defaults to FALSE, deliberately. Someone trusted to collect a car is not
    // thereby trusted to approve a bill, and a permissive default is how that
    // distinction quietly disappears.
    mayApproveWork: z.boolean().default(false),
  })
  .strict();

const PreferenceBody = z
  .object({
    eventKey: z.string().regex(/^[a-z][a-z0-9_.]{2,80}$/),
    channel: z.enum(['email', 'sms', 'in_app', 'push']),
    isEnabled: z.boolean(),
  })
  .strict();

const CaseBody = z
  .object({
    subject: requiredText(300),
    description: requiredText(10_000),
    category: z.enum(CASE_CATEGORIES),
    jobCardId: uuid().optional(),
  })
  .strict();

@Controller('self-service')
@UseGuards(TenantGuard)
export class SelfServiceController {
  constructor(private readonly selfService: SelfServiceService) {}

  @Get('documents')
  listDocuments(@Req() req: AuthenticatedRequest, @Query('customerId') customerId?: string) {
    return this.selfService.listDocuments(req.tenantContext, customerId);
  }

  @Post('documents')
  addDocument(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(DocumentBody)) body: z.infer<typeof DocumentBody>,
  ) {
    return this.selfService.addDocument(req.tenantContext, body);
  }

  @Get('maintenance')
  listMaintenance(@Req() req: AuthenticatedRequest, @Query('customerId') customerId?: string) {
    return this.selfService.listMaintenance(req.tenantContext, customerId);
  }

  @Post('maintenance')
  addMaintenance(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(MaintenanceBody)) body: z.infer<typeof MaintenanceBody>,
  ) {
    return this.selfService.addMaintenance(req.tenantContext, body);
  }

  @Get('drivers')
  listDrivers(@Req() req: AuthenticatedRequest, @Query('customerId') customerId?: string) {
    return this.selfService.listDrivers(req.tenantContext, customerId);
  }

  @Post('drivers')
  addDriver(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(DriverBody)) body: z.infer<typeof DriverBody>,
  ) {
    return this.selfService.addDriver(req.tenantContext, body);
  }

  @Post('drivers/:id/withdraw')
  withdrawDriver(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.selfService.withdrawDriver(req.tenantContext, id);
  }

  @Get('cases')
  listCases(@Req() req: AuthenticatedRequest, @Query('customerId') customerId?: string) {
    return this.selfService.listCases(req.tenantContext, customerId);
  }

  @Post('cases')
  raiseCase(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(CaseBody)) body: z.infer<typeof CaseBody>,
  ) {
    return this.selfService.raiseCase(req.tenantContext, body);
  }

  @Get('notifications')
  notifications(@Req() req: AuthenticatedRequest) {
    return this.selfService.notifications(req.tenantContext);
  }

  @Get('preferences')
  listMyPreferences(@Req() req: AuthenticatedRequest) {
    return this.selfService.listMyPreferences(req.tenantContext);
  }

  @Post('preferences')
  setMyPreference(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(PreferenceBody)) body: z.infer<typeof PreferenceBody>,
  ) {
    return this.selfService.setMyPreference(req.tenantContext, body);
  }
}
