import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from './audit/audit.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { IdentityModule } from './identity/identity.module';

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
  ],
  controllers: [HealthController],
})
export class AppModule {}
