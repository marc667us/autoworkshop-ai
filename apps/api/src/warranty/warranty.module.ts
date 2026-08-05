import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { WarrantyClaimController, WarrantyPolicyController } from './warranty.controller';
import { WarrantyService } from './warranty.service';

/**
 * The `warranty` domain — policies, claims and the decision history
 * (slice 5 of `COMPLETION_PLAN.md`).
 *
 * `IdentityModule` for `MembershipRepository`: `@UseGuards(TenantGuard)` names
 * the guard by class, so Nest builds an instance in THIS module's injector even
 * though AuthModule is `@Global`. Without the import the container cannot
 * construct it and the application fails to BOOT — while typecheck, lint and the
 * unit suite all pass, because dependency injection resolves at runtime.
 */
@Module({
  imports: [IdentityModule],
  controllers: [WarrantyPolicyController, WarrantyClaimController],
  providers: [WarrantyService],
  exports: [WarrantyService],
})
export class WarrantyModule {}
