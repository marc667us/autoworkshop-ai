import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { CustomerRecordsController } from './customer-records.controller';
import { CustomerRecordsService } from './customer-records.service';
import { CustomerTailController } from './customer-tail.controller';
import { CustomerTailService } from './customer-tail.service';
import { SelfServiceController } from './selfservice.controller';
import { SelfServiceService } from './selfservice.service';

/**
 * Customer self-service — slice 9 of `COMPLETION_PLAN.md`.
 *
 * `IdentityModule` for `MembershipRepository`: `@UseGuards(TenantGuard)` names
 * the guard by CLASS, so Nest builds an instance in THIS module's injector even
 * though AuthModule is `@Global`. Without the import the container cannot
 * construct it and the application fails to BOOT, while typecheck, lint and the
 * unit suite all pass.
 */
@Module({
  imports: [IdentityModule],
  controllers: [SelfServiceController, CustomerRecordsController, CustomerTailController],
  providers: [SelfServiceService, CustomerRecordsService, CustomerTailService],
  exports: [SelfServiceService, CustomerRecordsService, CustomerTailService],
})
export class SelfServiceModule {}
