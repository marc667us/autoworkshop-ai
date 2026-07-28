import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import { CustomerService } from './customer.service';
import { VehicleService } from './vehicle.service';

/**
 * Thin by design, exactly like `OrganizationController`.
 *
 * These controllers authenticate, resolve tenant context (via `TenantGuard`)
 * and delegate. Every business rule — who may create, who may see whose
 * vehicles, which parent records must be in the active tenant — lives in the
 * services, so an MCP tool calling those same services gets the same rules. That
 * property is what the entire AI boundary rests on (`0.txt` §13, §26): agents
 * never reach the database, they call the service layer that humans call.
 */

@Controller('customers')
@UseGuards(TenantGuard)
export class CustomerController {
  constructor(
    private readonly customers: CustomerService,
    private readonly vehicles: VehicleService,
  ) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.customers.list(req.tenantContext);
  }

  @Get(':id')
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.customers.findById(req.tenantContext, id);
  }

  /**
   * A customer's vehicles.
   *
   * Nested under the customer because that is the relationship — and it is
   * still the VehicleService that answers, so the owner-scoping rule applies
   * here identically. A customer cannot read another customer's vehicles by
   * addressing them through this path instead of `/vehicles`.
   */
  @Get(':id/vehicles')
  vehiclesFor(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.vehicles.list(req.tenantContext, id);
  }

  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      displayName: string;
      customerType?: string;
      email?: string;
      phone?: string;
      preferredContact?: string;
      location?: string;
      notes?: string;
    },
  ) {
    return this.customers.create(req.tenantContext, body);
  }
}

@Controller('vehicles')
@UseGuards(TenantGuard)
export class VehicleController {
  constructor(private readonly vehicles: VehicleService) {}

  /**
   * `customerId` is validated as a UUID before it reaches the service.
   *
   * Not for injection safety — the query binds its parameters — but because an
   * unparseable value would otherwise reach PostgreSQL as a `::uuid` cast and
   * fail with a 500 that reads like an outage instead of a 400 that reads like
   * a bad link.
   */
  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query('customerId', new ParseUUIDPipe({ optional: true })) customerId?: string,
  ) {
    return this.vehicles.list(req.tenantContext, customerId);
  }

  @Get(':id')
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.vehicles.findById(req.tenantContext, id);
  }

  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      customerId: string;
      registrationNumber: string;
      makeId: string;
      modelId?: string;
      vin?: string;
      variant?: string;
      modelYear?: number;
      engineType?: string;
      transmissionType?: string;
      fuelType?: string;
      currentMileageKm?: number;
      colour?: string;
      insurerName?: string;
      insurancePolicyNo?: string;
      insuranceExpiresOn?: string;
    },
  ) {
    return this.vehicles.create(req.tenantContext, body);
  }
}
