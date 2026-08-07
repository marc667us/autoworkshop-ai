import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import {
  GoodsReceiptController,
  PurchaseOrderController,
  RequisitionController,
  ReservationController,
  StockController,
  ToolController,
} from './parts.controller';
import { SupplierRequestController } from './supplier-request.controller';
import { SupplierRequestService } from './supplier-request.service';
import { PartsService } from './parts.service';
import { PlanningController } from './planning.controller';
import { PlanningService } from './planning.service';

/**
 * The `parts` domain — the workshop's own stock, reservations, requisitions,
 * purchase orders, goods receipts and tools (slice 4 of `COMPLETION_PLAN.md`).
 *
 * ⚠️ NOT `catalogue`. That schema is the PUBLIC MARKETPLACE — parts suppliers
 * list for sale. This one is the workshop's own shelf. Two different questions
 * with two different owners, and merging them would let a supplier's stock level
 * answer "can I fit this today?"
 *
 * `IdentityModule` for `MembershipRepository`: `@UseGuards(TenantGuard)` names
 * the guard by class, so Nest builds an instance in THIS module's injector even
 * though AuthModule is `@Global`. Without the import the container cannot
 * construct it and the application fails to BOOT — while typecheck, lint and the
 * unit suite all pass, because dependency injection resolves at runtime.
 */
@Module({
  imports: [IdentityModule],
  controllers: [
    StockController,
    ReservationController,
    RequisitionController,
    PurchaseOrderController,
    GoodsReceiptController,
    // The WORKSHOP -> SUPPLIER edge of the marketplace (059).
    SupplierRequestController,
    ToolController,
    PlanningController,
  ],
  providers: [PartsService, PlanningService, SupplierRequestService],
  exports: [PartsService, PlanningService, SupplierRequestService],
})
export class PartsModule {}
