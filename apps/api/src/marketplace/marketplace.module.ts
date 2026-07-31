import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IdentityModule } from '../identity/identity.module';
import { MarketplaceController } from './marketplace.controller';
import { OrderService } from './order.service';

/**
 * Marketplace ordering (migrations 022 and 023) — Slice A.
 *
 * ⚠️ `IdentityModule` IS IMPORTED FOR THE GUARD, NOT FOR THIS MODULE'S OWN CODE,
 * AND OMITTING IT BREAKS THE APPLICATION AT BOOT WHILE EVERY GATE STAYS GREEN.
 * `@UseGuards(UserGuard)` names the guard by class, so Nest constructs an
 * instance in THIS module's injector; `UserGuard` needs `MembershipRepository`,
 * which lives in `IdentityModule`. Without this import the container cannot
 * build it and the app fails to start — but typecheck, lint and the unit suite
 * all pass, because dependency injection resolves at runtime. `RepairModule`
 * and `CoreModule` carry the same note for the same reason.
 */
@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [MarketplaceController],
  providers: [OrderService],
  exports: [OrderService],
})
export class MarketplaceModule {}
