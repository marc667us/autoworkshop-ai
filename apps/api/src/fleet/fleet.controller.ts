import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import { validatedBody } from '../common/validation/validated-body';
import { FleetService } from './fleet.service';

/**
 * The fleet workspace — slice 19, designed in ADR-023.
 *
 * ⚠️ NOTHING HERE ACCEPTS A `tenantId` OR AN `organizationId`. Both come from
 * the resolved context; a body field naming either would be the confused-deputy
 * hole the tenancy design exists to prevent.
 *
 * ⚠️ AND NOTHING HERE ACCEPTS A `workshopOrganizationId`. The caller names a
 * DIRECTORY row and migration 087's trigger derives the organisation from it —
 * that column is what the workshop-side RLS predicate reads, so letting a
 * caller set it would make the tenant boundary caller-controlled.
 *
 * 🔴 TWO AUDIENCES ON ONE CONTROLLER. `/fleet/*` is the fleet's own workspace;
 * `/fleet/incoming-requests` and the response route are the WORKSHOP's side of
 * the same table. They are gated by different helpers in the service, and that
 * difference is the slice.
 */

const DriverBody = z.object({
  fullName: z.string().trim().min(2).max(160),
  licenceNumber: z.string().trim().max(60).optional(),
  licenceExpiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(320).email().optional(),
});
type DriverBody = z.infer<typeof DriverBody>;

const ServiceRequestBody = z.object({
  vehicleId: z.string().uuid(),
  workshopDirectoryId: z.string().uuid(),
  requestType: z.enum([
    'service',
    'repair',
    'inspection',
    'diagnostic',
    'tyres',
    'bodywork',
    'other',
  ]),
  summary: z.string().trim().min(3).max(300),
  detail: z.string().trim().max(4000).optional(),
  priority: z.enum(['low', 'normal', 'high', 'vehicle_off_road']).optional(),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  odometerKm: z.number().int().nonnegative().max(9999999).optional(),
});
type ServiceRequestBody = z.infer<typeof ServiceRequestBody>;

const RespondBody = z
  .object({
    status: z.enum(['accepted', 'declined', 'in_progress', 'completed']),
    declineReason: z.string().trim().max(2000).optional(),
  })
  // Checked here as well as by 087's CHECK constraint and by the service,
  // because this one names the field a person left blank rather than a
  // constraint. A declined request the fleet cannot understand is a dead end.
  .refine((b) => b.status !== 'declined' || (b.declineReason ?? '').length > 0, {
    message: 'Say why you cannot take this work — the fleet sees only this.',
    path: ['declineReason'],
  });
type RespondBody = z.infer<typeof RespondBody>;

@Controller('fleet')
@UseGuards(TenantGuard)
export class FleetController {
  constructor(private readonly fleet: FleetService) {}

  // ── the fleet's own workspace ─────────────────────────────────────────
  @Get('vehicles')
  vehicles(@Req() req: AuthenticatedRequest) {
    return this.fleet.listVehicles(req.tenantContext);
  }

  @Get('drivers')
  drivers(@Req() req: AuthenticatedRequest) {
    return this.fleet.listDrivers(req.tenantContext);
  }

  @Post('drivers')
  addDriver(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(DriverBody)) body: DriverBody,
  ) {
    return this.fleet.createDriver(req.tenantContext, body);
  }

  /** The published workshops a fleet may address. */
  @Get('workshops')
  workshops(@Req() req: AuthenticatedRequest) {
    return this.fleet.listPublishedWorkshops(req.tenantContext);
  }

  @Get('service-requests')
  serviceRequests(@Req() req: AuthenticatedRequest) {
    return this.fleet.listServiceRequests(req.tenantContext);
  }

  @Post('service-requests')
  raiseServiceRequest(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(ServiceRequestBody)) body: ServiceRequestBody,
  ) {
    return this.fleet.createServiceRequest(req.tenantContext, body);
  }

  // ── the WORKSHOP's side of the same table ─────────────────────────────
  //
  // 🔴 THESE TWO ROUTES ARE WHAT MAKE THE CONTRACT TWO-SIDED. Without them a
  // fleet could raise requests into a void and no workshop would ever learn it
  // had been asked to do anything — the "write half without a read half" shape
  // this repository found four times in one day on 2026-08-17.
  @Get('incoming-requests')
  incoming(@Req() req: AuthenticatedRequest) {
    return this.fleet.listIncomingRequests(req.tenantContext);
  }

  @Patch('incoming-requests/:id')
  respond(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(RespondBody)) body: RespondBody,
  ) {
    return this.fleet.respondToRequest(req.tenantContext, id, body);
  }
}
