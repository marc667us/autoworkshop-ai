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
import { validatedBody } from '../common/validation/validated-body';
import { CreateCustomerBody, CreateVehicleBody } from './core.schemas';

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
    @Body(validatedBody(CreateCustomerBody)) body: CreateCustomerBody,
  ) {
    return this.customers.create(req.tenantContext, body);
  }
}

/**
 * The shared make taxonomy — its own controller because it is NOT a vehicle.
 *
 * `core.vehicle_makes` has no tenant dimension and is not owned by anyone; the
 * register-a-vehicle form needs it to offer a picker. Nesting it under
 * `/vehicles` would have implied it is scoped the way vehicles are, which is the
 * kind of small mislabelling that later gets read as a guarantee.
 */
@Controller('vehicle-makes')
@UseGuards(TenantGuard)
export class VehicleMakeController {
  constructor(private readonly vehicles: VehicleService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.vehicles.listMakes(req.tenantContext);
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
    @Body(validatedBody(CreateVehicleBody)) body: CreateVehicleBody,
  ) {
    return this.vehicles.create(req.tenantContext, body);
  }
}
