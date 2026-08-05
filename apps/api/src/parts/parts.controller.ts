import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import {
  money,
  optionalText,
  requiredText,
  uuid,
  validatedBody,
} from '../common/validation/validated-body';
import { PartsService } from './parts.service';

/**
 * Parts, stock and procurement — slice 4 of `COMPLETION_PLAN.md`.
 *
 * ⚠️ WHO MAY MOVE STOCK IS DECIDED IN `PartsService`. Raising a requisition is
 * deliberately wide (a technician who cannot ask writes it on paper and the
 * workshop loses the record); moving stock and approving a requisition are the
 * storekeeper's, manager's or owner's.
 */

/** Mirrors migration 044's CHECK. */
const MOVEMENT_KINDS = [
  'goods_receipt', 'issue_to_job', 'return_from_job', 'stock_take',
  'write_off', 'transfer_in', 'transfer_out', 'opening_balance',
] as const;

const CreateStockItemBody = z
  .object({
    partNumber: requiredText(120),
    name: requiredText(300),
    brand: optionalText(120),
    unit: optionalText(40),
    unitCost: money().optional(),
    reorderLevel: z.number().int().nonnegative().max(1_000_000).optional(),
    shelfLocation: optionalText(120),
    openingQuantity: z.number().positive().max(1_000_000).optional(),
  })
  .strict();

const MovementBody = z
  .object({
    stockItemId: uuid(),
    // Signed: receipts positive, issues negative. A separate direction field
    // would let a row say `issue` with a positive quantity.
    quantity: z.number().refine((n) => n !== 0, 'a movement of zero records nothing'),
    movementKind: z.enum(MOVEMENT_KINDS),
    jobCardId: uuid().optional(),
    reason: optionalText(1000),
  })
  .strict();

const ReserveBody = z
  .object({ stockItemId: uuid(), jobCardId: uuid(), quantity: z.number().positive() })
  .strict();

const SettleReservationBody = z
  .object({ status: z.enum(['issued', 'released']), releaseReason: optionalText(1000) })
  .strict();

const RaiseRequisitionBody = z
  .object({
    description: requiredText(1000),
    quantity: z.number().positive(),
    stockItemId: uuid().optional(),
    jobCardId: uuid().optional(),
    neededBy: optionalText(20),
  })
  .strict();

const DecideRequisitionBody = z
  .object({
    status: z.enum(['approved', 'rejected', 'cancelled']),
    reason: optionalText(1000),
  })
  .strict();

const ReceiveGoodsBody = z
  .object({
    purchaseOrderId: uuid().optional(),
    deliveryNoteReference: optionalText(200),
    notes: optionalText(2000),
    lines: z
      .array(z.object({ stockItemId: uuid(), quantity: z.number().positive() }).strict())
      .min(1)
      .max(200),
  })
  .strict();

const CreateToolBody = z
  .object({
    assetTag: requiredText(60),
    name: requiredText(300),
    toolType: z
      .enum(['hand_tool', 'power_tool', 'diagnostic', 'lifting', 'measurement', 'specialist', 'other'])
      .optional(),
    location: optionalText(120),
    calibrationDueOn: optionalText(20),
  })
  .strict();

@Controller('stock')
@UseGuards(TenantGuard)
export class StockController {
  constructor(private readonly parts: PartsService) {}

  /**
   * What is on the shelf. Reads `parts.stock_on_hand`, which SUMS the movement
   * ledger — there is no stored on-hand column, deliberately.
   */
  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query('needsReorderOnly') needsReorderOnly?: string,
    @Query('q') q?: string,
  ) {
    return this.parts.listStock(req.tenantContext, {
      needsReorderOnly: needsReorderOnly === 'true',
      q,
    });
  }

  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(CreateStockItemBody)) body: z.infer<typeof CreateStockItemBody>,
  ) {
    return this.parts.createStockItem(req.tenantContext, body);
  }

  @Post('movements')
  move(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(MovementBody)) body: z.infer<typeof MovementBody>,
  ) {
    return this.parts.recordMovement(req.tenantContext, body);
  }
}

@Controller('stock-reservations')
@UseGuards(TenantGuard)
export class ReservationController {
  constructor(private readonly parts: PartsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.parts.listReservations(req.tenantContext);
  }

  @Post()
  reserve(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(ReserveBody)) body: z.infer<typeof ReserveBody>,
  ) {
    return this.parts.reserve(req.tenantContext, body);
  }

  /** `issued` converts the hold into a real movement in the same transaction. */
  @Patch(':id/settle')
  settle(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(SettleReservationBody)) body: z.infer<typeof SettleReservationBody>,
  ) {
    return this.parts.settleReservation(req.tenantContext, id, body);
  }
}

@Controller('requisitions')
@UseGuards(TenantGuard)
export class RequisitionController {
  constructor(private readonly parts: PartsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.parts.listRequisitions(req.tenantContext);
  }

  @Post()
  raise(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(RaiseRequisitionBody)) body: z.infer<typeof RaiseRequisitionBody>,
  ) {
    return this.parts.raiseRequisition(req.tenantContext, body);
  }

  @Patch(':id/decision')
  decide(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(DecideRequisitionBody)) body: z.infer<typeof DecideRequisitionBody>,
  ) {
    return this.parts.decideRequisition(req.tenantContext, id, body);
  }
}

@Controller('purchase-orders')
@UseGuards(TenantGuard)
export class PurchaseOrderController {
  constructor(private readonly parts: PartsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.parts.listPurchaseOrders(req.tenantContext);
  }
}

@Controller('goods-receipts')
@UseGuards(TenantGuard)
export class GoodsReceiptController {
  constructor(private readonly parts: PartsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.parts.listGoodsReceipts(req.tenantContext);
  }

  /**
   * Book a delivery in.
   *
   * ⚠️ THE RECEIPT AND THE STOCK MOVEMENTS ARE ONE TRANSACTION. A receipt with
   * no movements behind it is the most confusing state a store can be in: the
   * paperwork says it arrived and the shelf says it did not.
   */
  @Post()
  receive(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(ReceiveGoodsBody)) body: z.infer<typeof ReceiveGoodsBody>,
  ) {
    return this.parts.receiveGoods(req.tenantContext, body);
  }
}

@Controller('tools')
@UseGuards(TenantGuard)
export class ToolController {
  constructor(private readonly parts: PartsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.parts.listTools(req.tenantContext);
  }

  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(CreateToolBody)) body: z.infer<typeof CreateToolBody>,
  ) {
    return this.parts.createTool(req.tenantContext, body);
  }
}
