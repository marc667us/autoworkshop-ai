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
import { NotificationsModule } from './notifications/notifications.module';
import { SelfServiceModule } from './selfservice/selfservice.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { ReportsModule } from './reports/reports.module';
import { CallsModule } from './calls/calls.module';
import { SettingsModule } from './settings/settings.module';
import { SecurityModule } from './security/security.module';
import { AgentsModule } from './agents/agents.module';
import { CrmModule } from './crm/crm.module';
import { OperationsModule } from './operations/operations.module';
import { TowingModule } from './towing/towing.module';
import { FleetModule } from './fleet/fleet.module';
import { InsuranceModule } from './insurance/insurance.module';

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
    NotificationsModule,
    SelfServiceModule,
    KnowledgeModule,
    ReportsModule,
    CallsModule,
    SecurityModule,
    OperationsModule,
    TowingModule,
    FleetModule,
    InsuranceModule,
    // The agent layer: triage, supplier discovery, lead discovery.
    // Runs with no agent host configured — see AgentsModule's header.
    AgentsModule,
    // The lead pipeline. Reads what the discovery agent's approved proposals
    // wrote into `crm.leads` — a table that until now could only be written.
    CrmModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
