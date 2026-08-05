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
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import { validatedBody } from '../common/validation/validated-body';
import { FinanceService } from './finance.service';
import {
  AddInvoiceLineBody,
  ChangeInvoiceStatusBody,
  CreateInvoiceBody,
  CreditNoteBody,
  RecordPaymentBody,
  RefundBody,
} from './finance.schemas';

/**
 * Invoices — slice 3 of `COMPLETION_PLAN.md`.
 *
 * ⚠️ WHO MAY BILL IS DECIDED IN `FinanceService`, not here and not by the
 * screen. A controller route and a server action are both public HTTP
 * endpoints; the rule lives in one place so a new caller cannot arrive without
 * it (CLAUDE.md §8 — hidden is not secure).
 */
@Controller('invoices')
@UseGuards(TenantGuard)
export class InvoiceController {
  constructor(private readonly finance: FinanceService) {}

  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('jobCardId') jobCardId?: string,
    @Query('unpaidOnly') unpaidOnly?: string,
  ) {
    return this.finance.listInvoices(req.tenantContext, {
      status,
      jobCardId,
      unpaidOnly: unpaidOnly === 'true',
    });
  }

  @Get(':id')
  get(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.finance.getInvoice(req.tenantContext, id);
  }

  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(CreateInvoiceBody)) body: CreateInvoiceBody,
  ) {
    return this.finance.createInvoiceForJobCard(req.tenantContext, body);
  }

  @Post(':id/lines')
  addLine(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(AddInvoiceLineBody)) body: AddInvoiceLineBody,
  ) {
    return this.finance.addLine(req.tenantContext, id, body);
  }

  @Patch(':id/status')
  changeStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(ChangeInvoiceStatusBody)) body: ChangeInvoiceStatusBody,
  ) {
    return this.finance.changeInvoiceStatus(req.tenantContext, id, body);
  }

  /**
   * Record a payment. Its own sub-resource because the money identifies the
   * INVOICE, and because this is the one call that also mints a receipt — a
   * payment that produced no receipt would leave the desk with nothing to hand
   * over.
   */
  @Post(':id/payments')
  recordPayment(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(RecordPaymentBody)) body: RecordPaymentBody,
  ) {
    return this.finance.recordPayment(req.tenantContext, id, body);
  }

  /**
   * How a settled invoice is corrected — NEVER an edit.
   *
   * An invoice the customer has been shown is a record of what they were told;
   * changing it retrospectively means the receipt in their hand no longer
   * matches the system. Migration 042 enforces that in Postgres.
   */
  @Post(':id/credit-notes')
  creditNote(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(CreditNoteBody)) body: CreditNoteBody,
  ) {
    return this.finance.issueCreditNote(req.tenantContext, id, body);
  }
}

/** Payments and receipts, addressed directly — the collection desk's own list. */
@Controller('payments')
@UseGuards(TenantGuard)
export class PaymentController {
  constructor(private readonly finance: FinanceService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.finance.listPayments(req.tenantContext);
  }

  /**
   * Money going back OUT, against a payment that came in.
   *
   * ⚠️ A DIFFERENT RESOURCE FROM A CREDIT NOTE, deliberately. A credit note
   * reduces what is OWED; a refund returns what was PAID. Conflating them is how
   * a workshop's books stop balancing, so they are different routes on different
   * resources and neither can be reached by mistake while meaning the other.
   */
  @Post(':id/refunds')
  refund(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(RefundBody)) body: RefundBody,
  ) {
    return this.finance.issueRefund(req.tenantContext, id, body);
  }
}

/** Revenue actually received, net of refunds. See `revenueByMonth` for why. */
@Controller('finance')
@UseGuards(TenantGuard)
export class FinanceReportController {
  constructor(private readonly finance: FinanceService) {}

  @Get('revenue')
  revenue(@Req() req: AuthenticatedRequest, @Query('months') months?: string) {
    const n = Number(months);
    return this.finance.revenueByMonth(
      req.tenantContext,
      Number.isFinite(n) && n > 0 && n <= 60 ? Math.floor(n) : 12,
    );
  }
}
