import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { CommsController } from './comms.controller';
import { CommsService } from './comms.service';

/**
 * Messaging — slice 7 of `COMPLETION_PLAN.md`.
 *
 * `IdentityModule` for `MembershipRepository`: `@UseGuards(TenantGuard)` names
 * the guard by CLASS, so Nest builds an instance in THIS module's injector even
 * though AuthModule is `@Global`. Without the import the container cannot
 * construct it and the application fails to BOOT — while typecheck, lint and the
 * unit suite all pass, because dependency injection resolves at runtime.
 */
@Module({
  imports: [IdentityModule],
  controllers: [CommsController],
  providers: [CommsService],
  exports: [CommsService],
})
export class CommsModule {}
