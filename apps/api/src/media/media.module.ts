import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { StorageService } from '../storage/storage.service';

/**
 * The `media` domain — attachments (slice 1 of `COMPLETION_PLAN.md`).
 *
 * `IdentityModule` for `MembershipRepository`: `@UseGuards(TenantGuard)` names
 * the guard by class, so Nest builds an instance in THIS module's injector even
 * though AuthModule is `@Global`. Without the import the container cannot
 * construct it and the application fails to BOOT — while typecheck, lint and the
 * unit suite all pass, because dependency injection resolves at runtime.
 * RepairModule and CoreModule carry the same note for the same reason.
 *
 * ⚠️ `StorageService` IS PROVIDED HERE, and its absence from every module is
 * exactly the defect this slice fixes. It was written, tested and imported by
 * nothing.
 */
@Module({
  imports: [IdentityModule],
  controllers: [MediaController],
  providers: [MediaService, StorageService],
  exports: [MediaService, StorageService],
})
export class MediaModule {}
