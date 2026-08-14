import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../database/database.module';
import { IdentityModule } from '../identity/identity.module';
import { AdminInsuranceController, InsuranceController } from './insurance.controller';
import { InsuranceService } from './insurance.service';

/**
 * The insurance marketplace — migration 082.
 *
 * 🔴 `IdentityModule`, NOT `AuthModule`, AND I GOT THAT WRONG FIRST. The
 * comment here originally claimed `AuthModule` provides `TenantGuard`. It does
 * not provide everything the guard NEEDS: the API refused to boot with
 *
 *   Nest can't resolve dependencies of the TenantGuard (KeycloakJwtService, ?).
 *   Please make sure that the argument MembershipRepository at index [1] is
 *   available in the InsuranceModule context.
 *
 * `MembershipRepository` lives in `IdentityModule`, which is what
 * `TowingModule` imports for exactly this reason.
 *
 * ⚠️ AND IT WAS FOUND ONLY BY STARTING THE SERVER. `tsc`, `eslint`, 954 tests
 * and a clean `nest build` were all green over a container that could not come
 * up — none of them instantiate the DI graph. This repository has recorded that
 * precise failure once already. A comment claiming a module is correct is not
 * evidence; a process listening on a port is.
 */
@Module({
  imports: [DatabaseModule, AuditModule, IdentityModule],
  controllers: [InsuranceController, AdminInsuranceController],
  providers: [InsuranceService],
  exports: [InsuranceService],
})
export class InsuranceModule {}
