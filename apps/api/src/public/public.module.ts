import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CatalogueService } from './catalogue.service';
import { PublicController } from './public.controller';
import { VinController } from './vin.controller';
import { VpicService } from './vpic.service';
import { AuthModule } from '../auth/auth.module';
import { IdentityModule } from '../identity/identity.module';

/**
 * The public catalogue module — see public.controller.ts for why nothing here
 * is guarded, and what makes that safe.
 */
@Module({
  // AuthModule + IdentityModule are needed by `UserGuard` on VinController —
  // the SIGNED-IN half of the VIN lookup. PublicController itself stays
  // unguarded; see its header for why that is safe.
  imports: [DatabaseModule, AuthModule, IdentityModule],
  controllers: [PublicController, VinController],
  providers: [CatalogueService, VpicService],
  exports: [CatalogueService, VpicService],
})
export class PublicModule {}
