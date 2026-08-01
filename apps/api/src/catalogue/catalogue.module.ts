import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IdentityModule } from '../identity/identity.module';
import { AdminCatalogueController, SupplierCatalogueController } from './catalogue.controller';
import { SupplierCatalogueService } from './supplier-catalogue.service';

/**
 * Supplier + administrator catalogue management (migrations 024, 025, 026) —
 * Slice B.
 *
 * ⚠️ `IdentityModule` IS IMPORTED FOR THE GUARDS, NOT FOR THIS MODULE'S OWN
 * CODE, AND OMITTING IT BREAKS THE APPLICATION AT BOOT WHILE EVERY GATE STAYS
 * GREEN. `@UseGuards(UserGuard)` and `@UseGuards(TenantGuard)` name the guards
 * by class, so Nest constructs them in THIS module's injector; both need
 * `MembershipRepository`, which lives in `IdentityModule`. Without the import
 * the container cannot build them and the app fails to start — but typecheck,
 * lint and the unit suite all pass, because dependency injection resolves at
 * runtime. `MarketplaceModule`, `RepairModule` and `CoreModule` carry the same
 * note for the same reason.
 */
@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [SupplierCatalogueController, AdminCatalogueController],
  providers: [SupplierCatalogueService],
  exports: [SupplierCatalogueService],
})
export class CatalogueModule {}
