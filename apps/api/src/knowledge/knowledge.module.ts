import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';

/**
 * Knowledge, technical tools and learning - slice 10 of `COMPLETION_PLAN.md`.
 *
 * `IdentityModule` for `MembershipRepository`: `@UseGuards(TenantGuard)` names
 * the guard by CLASS, so Nest builds an instance in THIS module's injector even
 * though AuthModule is `@Global`. Without the import the container cannot
 * construct it and the application fails to BOOT, while typecheck, lint and the
 * unit suite all pass.
 */
@Module({
  imports: [IdentityModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
