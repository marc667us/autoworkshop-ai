import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CoreModule } from './core/core.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { IdentityModule } from './identity/identity.module';
import { PublicModule } from './public/public.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { CatalogueModule } from './catalogue/catalogue.module';
import { RepairModule } from './repair/repair.module';
import { MediaModule } from './media/media.module';
import { ReceptionModule } from './reception/reception.module';
import { FinanceModule } from './finance/finance.module';
import { WarrantyModule } from './warranty/warranty.module';
import { PartsModule } from './parts/parts.module';
import { CommsModule } from './comms/comms.module';
import { SelfServiceModule } from './selfservice/selfservice.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { ReportsModule } from './reports/reports.module';
import { SettingsModule } from './settings/settings.module';
import { SecurityModule } from './security/security.module';
import { OperationsModule } from './operations/operations.module';

/**
 * Modular monolith root.
 *
 * The 13 bounded domains (`autoworkshop 1.txt` §4) are registered here as they
 * land, each owning its own schema, rules and authorization policy. Business
 * rules live ONLY in domain services — MCP tools and REST controllers are both
 * thin callers of the same application service (`autoworkshop 0.txt` §13).
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuditModule,
    IdentityModule,
    AuthModule,
    CoreModule,
    PublicModule,
    MarketplaceModule,
    CatalogueModule,
    RepairModule,
    MediaModule,
    ReceptionModule,
    FinanceModule,
    WarrantyModule,
    PartsModule,
    SettingsModule,
    CommsModule,
    SelfServiceModule,
    KnowledgeModule,
    ReportsModule,
    SecurityModule,
    OperationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
