import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

/**
 * Settings and workshop admin — slice 6 of `COMPLETION_PLAN.md`.
 *
 * `IdentityModule` for `MembershipRepository`: `@UseGuards(TenantGuard)` names
 * the guard by CLASS, so Nest builds an instance in THIS module's injector even
 * though AuthModule is `@Global`. Without this import the container cannot
 * construct it and the application fails to BOOT — while typecheck, lint and the
 * unit suite all pass, because dependency injection resolves at runtime. That
 * has cost this repository a deploy before; it is copied from PartsModule
 * deliberately rather than rediscovered.
 */
@Module({
  imports: [IdentityModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
