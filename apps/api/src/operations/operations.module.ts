import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IdentityModule } from '../identity/identity.module';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

/**
 * The Operations Centre.
 *
 * Read-only in this slice: it probes dependencies and reports. The destructive
 * half of Solar's operations centre (vacuum, clear cache, restart the queue
 * worker, revoke every session) is a separate slice, because Directive §17
 * requires every admin action to be permission-controlled AND audit-logged, and
 * neither is worth retrofitting onto buttons added in a hurry.
 *
 * ⚠️ `IdentityModule` IS IMPORTED FOR THE GUARD, NOT FOR THIS MODULE'S CODE.
 * `@UseGuards(TenantGuard)` makes Nest construct the guard in THIS injector, and
 * it needs `MembershipRepository`. Omitting it fails at BOOT while typecheck,
 * lint and the whole unit suite stay green — which is exactly what happened to
 * `SecurityModule` earlier in this same session.
 */
@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [OperationsController],
  providers: [OperationsService],
  exports: [OperationsService],
})
export class OperationsModule {}
