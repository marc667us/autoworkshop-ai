import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IdentityModule } from '../identity/identity.module';
import { SecurityController } from './security.controller';
import { SecurityPostureService } from './security-posture.service';

/**
 * The Security Hub.
 *
 * Read-only by construction: the module exposes one GET route and its service
 * issues only SELECTs against `pg_catalog`. There is deliberately no remediation
 * endpoint — Solar's AI-SOC shipped detection before any agent could act, and
 * every fix for a finding here is a migration, reviewed like any other.
 *
 * ⚠️ `IdentityModule` IS IMPORTED FOR THE GUARD, NOT FOR THIS MODULE'S OWN CODE.
 * `@UseGuards(TenantGuard)` names the guard by class, so Nest constructs it in
 * THIS module's injector, and it needs `MembershipRepository` from
 * `IdentityModule`. `CatalogueModule` carries the same note and this module was
 * still written without it — the application failed to boot with
 * "Nest can't resolve dependencies of the TenantGuard" while `nest build`,
 * `tsc --noEmit` and seventeen unit tests all passed, because dependency
 * injection resolves at RUNTIME. It was found by starting the app, which is the
 * only thing that could have found it.
 */
@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [SecurityController],
  providers: [SecurityPostureService],
  exports: [SecurityPostureService],
})
export class SecurityModule {}
