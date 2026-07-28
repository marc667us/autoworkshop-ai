import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import {
  CustomerController,
  VehicleController,
  VehicleMakeController,
} from './core.controllers';
import { CustomerService } from './customer.service';
import { VehicleService } from './vehicle.service';

/**
 * The `core` domain — customers and vehicles (Phase 4, Release 0.3).
 *
 * The subject records the rest of the platform points at. Phase 5's job cards,
 * Phase 6's parts compatibility and Phase 7's invoices all reference these, so
 * the services are EXPORTED: later modules depend on this one, never the
 * reverse, and no module reaches past a service into `core`'s tables.
 */
@Module({
  // IdentityModule for `MembershipRepository`, and it is NOT optional.
  //
  // `@UseGuards(TenantGuard)` names the guard by CLASS, so Nest constructs an
  // instance in the CONSUMING module's injector rather than reusing the one
  // AuthModule exports — even though AuthModule is `@Global`. TenantGuard
  // depends on MembershipRepository, so without this import the container
  // cannot build it and the whole application fails to boot:
  //
  //   Nest can't resolve dependencies of the TenantGuard (KeycloakJwtService,
  //   ?). Please make sure that the argument MembershipRepository at index [1]
  //   is available in the CoreModule context.
  //
  // Worth stating because typecheck, lint and the unit suite all pass on the
  // broken version — dependency injection is resolved at runtime, so only
  // STARTING the app finds it. That is the third defect in this project caught
  // by running the thing rather than reviewing it.
  imports: [IdentityModule],
  controllers: [CustomerController, VehicleController, VehicleMakeController],
  providers: [CustomerService, VehicleService],
  exports: [CustomerService, VehicleService],
})
export class CoreModule {}
