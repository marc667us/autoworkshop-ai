import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { mailTransportProvider } from './mail-transport';

/**
 * Notifications — migration 060.
 *
 * `IdentityModule` for `MembershipRepository`: `@UseGuards(TenantGuard)` names
 * the guard by CLASS, so Nest builds an instance in THIS module's injector even
 * though AuthModule is `@Global`. Without the import the container cannot
 * construct it and the application fails to BOOT — while typecheck, lint and
 * the unit suite all pass, because dependency injection resolves at runtime.
 * That is a recorded trap in this repository, not a hypothetical.
 *
 * `NotificationsService` is EXPORTED because the business modules that raise
 * notifications (reception today, repair and finance next) inject it and call
 * `enqueue` inside their own transaction.
 */
@Module({
  imports: [IdentityModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, mailTransportProvider],
  exports: [NotificationsService],
})
export class NotificationsModule {}
