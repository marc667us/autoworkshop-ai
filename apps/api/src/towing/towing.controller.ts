import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import { validatedBody } from '../common/validation/validated-body';
import {
  INCIDENT_KINDS,
  REQUEST_PRIORITIES,
  REQUEST_STATUSES,
  RECOVERY_STATUSES,
  TowingService,
  VEHICLE_TYPES,
  type RequestStatus,
} from './towing.service';

/**
 * `/towing/*` — the ten screens of `02.txt` §52, behind one guard.
 *
 * ⚠️ EVERY QUERY PARAMETER IS VALIDATED, NEVER FORWARDED RAW. An unrecognised
 * status reaching a `$1::text` filter returns an EMPTY list, which on screen is
 * indistinguishable from "there is nothing here" — the Supervisor found exactly
 * that in `GET /leads` on 2026-08-09, where it could have hidden a workshop's
 * entire sales pipeline from it. A filter that silently matches nothing is the
 * quietest possible failure.
 *
 * ⚠️ THERE IS NO DELETE ROUTE ANYWHERE HERE, and migration 074 grants only
 * SELECT, INSERT and UPDATE to `autoworkshop_app`, so one could not work if it
 * were written. A recovery that did not happen is CANCELLED with a reason —
 * `ck_recovery_cancelled` requires the reason — and the record stays. An
 * incident log that can be deleted is not an incident log.
 */

const CreateRequestBody = z.object({
  contactName: z.string().trim().min(1).max(200),
  contactPhone: z.string().trim().min(3).max(40),
  vehicleDescription: z.string().trim().min(1).max(300),
  pickupLocation: z.string().trim().min(1).max(500),
  faultSummary: z.string().trim().min(1).max(2000),
  dropoffLocation: z.string().trim().max(500).optional(),
  priority: z.enum(REQUEST_PRIORITIES).optional(),
  customerId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
});
type CreateRequestBody = z.infer<typeof CreateRequestBody>;

const DispatchBody = z.object({
  requestId: z.string().uuid(),
  driverId: z.string().uuid(),
  vehicleId: z.string().uuid(),
});
type DispatchBody = z.infer<typeof DispatchBody>;

const RecoveryStatusBody = z.object({
  status: z.enum(RECOVERY_STATUSES),
  distanceKm: z.number().nonnegative().max(100000).optional(),
  cancelReason: z.string().trim().min(1).max(1000).optional(),
});
type RecoveryStatusBody = z.infer<typeof RecoveryStatusBody>;

const CreateDriverBody = z.object({
  fullName: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(3).max(40),
  licenceNumber: z.string().trim().max(80).optional(),
  // A date, not a datetime: a licence expires on a day, in a place with its own
  // timezone. Storing an instant would move the expiry by hours for no reason.
  licenceExpires: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
type CreateDriverBody = z.infer<typeof CreateDriverBody>;

const CreateVehicleBody = z.object({
  registration: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(120),
  vehicleType: z.enum(VEHICLE_TYPES).optional(),
  capacityKg: z.number().int().positive().max(200000).optional(),
});
type CreateVehicleBody = z.infer<typeof CreateVehicleBody>;

const CreateIncidentBody = z.object({
  recoveryId: z.string().uuid(),
  kind: z.enum(INCIDENT_KINDS),
  severity: z.enum(['low', 'medium', 'high']).optional(),
  summary: z.string().trim().min(1).max(4000),
});
type CreateIncidentBody = z.infer<typeof CreateIncidentBody>;

const CreateInvoiceBody = z.object({
  recoveryId: z.string().uuid(),
  otherCharges: z.number().nonnegative().max(10_000_000).optional(),
});
type CreateInvoiceBody = z.infer<typeof CreateInvoiceBody>;

const SettingsBody = z.object({
  currency: z.string().trim().length(3).optional(),
  calloutFee: z.number().nonnegative().max(10_000_000).optional(),
  ratePerKm: z.number().nonnegative().max(100_000).optional(),
  serviceRadiusKm: z.number().int().positive().max(5000).nullable().optional(),
  operates24h: z.boolean().optional(),
  dispatchNotes: z.string().trim().max(4000).nullable().optional(),
});
type SettingsBody = z.infer<typeof SettingsBody>;

@Controller('towing')
@UseGuards(TenantGuard)
export class TowingController {
  constructor(private readonly towing: TowingService) {}

  @Get('dashboard')
  async dashboard(@Req() req: AuthenticatedRequest) {
    return this.towing.dashboard(req.tenantContext);
  }

  @Get('requests')
  async listRequests(@Req() req: AuthenticatedRequest, @Query('status') status?: string) {
    if (status !== undefined && !(REQUEST_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequestException(
        `Unknown request status "${String(status)}". Use one of: ${REQUEST_STATUSES.join(', ')}.`,
      );
    }
    return this.towing.listRequests(req.tenantContext, { status: status as RequestStatus });
  }

  @Post('requests')
  async createRequest(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(CreateRequestBody)) body: CreateRequestBody,
  ) {
    return this.towing.createRequest(req.tenantContext, body);
  }

  @Post('recoveries')
  async dispatch(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(DispatchBody)) body: DispatchBody,
  ) {
    return this.towing.dispatch(req.tenantContext, body);
  }

  /**
   * ⚠️ `scope` IS A CLOSED VOCABULARY, not a status passthrough. The two
   * screens that call this are "Active recoveries" and "Completed recoveries",
   * and which statuses count as active is a decision that belongs beside the
   * dashboard's own definition of it — not to whatever a client sends.
   */
  @Get('recoveries')
  async listRecoveries(@Req() req: AuthenticatedRequest, @Query('scope') scope?: string) {
    const resolved = scope ?? 'active';
    if (resolved !== 'active' && resolved !== 'completed') {
      throw new BadRequestException(`Unknown scope "${resolved}". Use "active" or "completed".`);
    }
    return this.towing.listRecoveries(req.tenantContext, resolved);
  }

  @Patch('recoveries/:id')
  async setRecoveryStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validatedBody(RecoveryStatusBody)) body: RecoveryStatusBody,
  ) {
    return this.towing.setRecoveryStatus(req.tenantContext, id, body.status, {
      distanceKm: body.distanceKm,
      cancelReason: body.cancelReason,
    });
  }

  @Get('drivers')
  async listDrivers(@Req() req: AuthenticatedRequest) {
    return this.towing.listDrivers(req.tenantContext);
  }

  @Post('drivers')
  async createDriver(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(CreateDriverBody)) body: CreateDriverBody,
  ) {
    return this.towing.createDriver(req.tenantContext, body);
  }

  @Get('vehicles')
  async listVehicles(@Req() req: AuthenticatedRequest) {
    return this.towing.listVehicles(req.tenantContext);
  }

  @Post('vehicles')
  async createVehicle(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(CreateVehicleBody)) body: CreateVehicleBody,
  ) {
    return this.towing.createVehicle(req.tenantContext, body);
  }

  @Get('incidents')
  async listIncidents(@Req() req: AuthenticatedRequest) {
    return this.towing.listIncidents(req.tenantContext);
  }

  @Post('incidents')
  async createIncident(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(CreateIncidentBody)) body: CreateIncidentBody,
  ) {
    return this.towing.createIncident(req.tenantContext, body);
  }

  @Get('invoices')
  async listInvoices(@Req() req: AuthenticatedRequest) {
    return this.towing.listInvoices(req.tenantContext);
  }

  @Post('invoices')
  async createInvoice(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(CreateInvoiceBody)) body: CreateInvoiceBody,
  ) {
    return this.towing.createInvoice(req.tenantContext, body);
  }

  @Get('settings')
  async getSettings(@Req() req: AuthenticatedRequest) {
    return this.towing.getSettings(req.tenantContext);
  }

  @Put('settings')
  async updateSettings(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(SettingsBody)) body: SettingsBody,
  ) {
    return this.towing.updateSettings(req.tenantContext, body);
  }
}
