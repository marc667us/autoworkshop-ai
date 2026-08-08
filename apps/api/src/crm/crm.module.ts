import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

/**
 * CRM — today, the lead pipeline and nothing else.
 *
 * 🔴 `IdentityModule` IS NOT OPTIONAL. `LeadsController` is
 * `@UseGuards(TenantGuard)`, and Nest constructs a guard in the CONSUMING
 * module's injector, so `TenantGuard`'s own dependency `MembershipRepository`
 * has to be resolvable from here. Omitting this import does not break one route
 * — it stops the whole application booting, and neither `tsc`, nor the unit
 * suite, nor lint, nor the nav audits will say so, because none of them start
 * the DI container. `AgentsModule` shipped that exact defect on 2026-08-08.
 */
@Module({
  imports: [IdentityModule],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class CrmModule {}
