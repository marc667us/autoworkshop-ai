import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../database/database.module';
import { IdentityModule } from '../identity/identity.module';
import { FleetController } from './fleet.controller';
import { FleetService } from './fleet.service';

/**
 * The fleet workspace — slice 19, migration 087, ADR-023.
 *
 * 🔴 `IdentityModule`, NOT `AuthModule`. `TenantGuard` needs
 * `MembershipRepository`, which lives in `IdentityModule`; wiring `AuthModule`
 * here makes the API refuse to BOOT with
 *
 *   Nest can't resolve dependencies of the TenantGuard (KeycloakJwtService, ?).
 *
 * That is not hypothetical — `InsuranceModule` shipped with exactly this fault
 * and it was found only by STARTING THE SERVER. `tsc`, `eslint`, 954 tests and
 * a clean `nest build` were all green over a container that could not come up,
 * because none of them instantiate the DI graph. `TowingModule` imports
 * `IdentityModule` for the same reason.
 */
@Module({
  imports: [DatabaseModule, AuditModule, IdentityModule],
  controllers: [FleetController],
  providers: [FleetService],
  exports: [FleetService],
})
export class FleetModule {}
