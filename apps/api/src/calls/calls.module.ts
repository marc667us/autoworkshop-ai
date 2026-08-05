import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';

/**
 * In-app voice and video - slice 11 of `COMPLETION_PLAN.md`.
 *
 * `IdentityModule` for `MembershipRepository`: `@UseGuards(TenantGuard)` names
 * the guard by CLASS, so Nest builds an instance in THIS module's injector even
 * though AuthModule is `@Global`. Without the import the container cannot
 * construct it and the application fails to BOOT, while typecheck, lint and the
 * unit suite all pass.
 */
@Module({
  imports: [IdentityModule],
  controllers: [CallsController],
  providers: [CallsService],
  exports: [CallsService],
})
export class CallsModule {}
