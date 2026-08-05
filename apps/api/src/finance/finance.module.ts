import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import {
  FinanceReportController,
  InvoiceController,
  PaymentController,
} from './finance.controller';
import { FinanceService } from './finance.service';

/**
 * The `finance` domain — invoicing, payments, receipts, credit notes, refunds
 * (slice 3 of `COMPLETION_PLAN.md`).
 *
 * `IdentityModule` for `MembershipRepository`: `@UseGuards(TenantGuard)` names
 * the guard by class, so Nest builds an instance in THIS module's injector even
 * though AuthModule is `@Global`. Without the import the container cannot
 * construct it and the application fails to BOOT — while typecheck, lint and the
 * unit suite all pass, because dependency injection resolves at runtime.
 * RepairModule, CoreModule, MediaModule and ReceptionModule carry the same note.
 */
@Module({
  imports: [IdentityModule],
  controllers: [InvoiceController, PaymentController, FinanceReportController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
