import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import {
  AppointmentController,
  CustomerFeedbackController,
  ServiceBayController,
  WalkInController,
} from './reception.controller';
import { ReceptionService } from './reception.service';

/**
 * The `reception` domain — the front of the workshop (slice 2).
 *
 * `IdentityModule` for `MembershipRepository`: `@UseGuards(TenantGuard)` names
 * the guard by class, so Nest builds an instance in THIS module's injector even
 * though AuthModule is `@Global`. Without the import the container cannot
 * construct it and the application fails to BOOT — while typecheck, lint and the
 * unit suite all pass, because dependency injection resolves at runtime.
 * RepairModule, CoreModule and MediaModule carry the same note.
 */
@Module({
  imports: [IdentityModule],
  controllers: [
    AppointmentController,
    WalkInController,
    ServiceBayController,
    CustomerFeedbackController,
  ],
  providers: [ReceptionService],
  exports: [ReceptionService],
})
export class ReceptionModule {}
