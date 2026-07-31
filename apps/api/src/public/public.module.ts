import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CatalogueService } from './catalogue.service';
import { PublicController } from './public.controller';

/**
 * The public catalogue module — see public.controller.ts for why nothing here
 * is guarded, and what makes that safe.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [PublicController],
  providers: [CatalogueService],
  exports: [CatalogueService],
})
export class PublicModule {}
