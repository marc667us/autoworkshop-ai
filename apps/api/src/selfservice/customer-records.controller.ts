import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import { requiredText, uuid, validatedBody } from '../common/validation/validated-body';
import { CustomerRecordsService } from './customer-records.service';

/**
 * A customer's own money and warranty — slice 12.
 *
 * ⚠️ `/my/*`, NOT `/invoices`. The workshop's invoice book is `/invoices` and is
 * refused to a customer by `assertWorkshopStaff`. These are a different
 * resource answering a different question, so they get a different path — one
 * that cannot be reached by loosening a filter on the other.
 *
 * ⚠️ `customerId` IS A QUERY PARAMETER AND THE SERVICE REFUSES IT FROM A
 * CUSTOMER. It exists so a cashier can answer "what does this customer still
 * owe?" from the same code. A customer who supplies one is refused outright
 * rather than silently given their own — a silent substitution would mask an
 * authorization probe.
 */

const ClaimBody = z
  .object({
    policyId: uuid(),
    reportedFault: requiredText(10_000),
    odometerReading: z.number().int().nonnegative().max(10_000_000).optional(),
  })
  .strict();

@Controller('my')
@UseGuards(TenantGuard)
export class CustomerRecordsController {
  constructor(private readonly records: CustomerRecordsService) {}

  @Get('invoices')
  listInvoices(@Req() req: AuthenticatedRequest, @Query('customerId') customerId?: string) {
    return this.records.listMyInvoices(req.tenantContext, customerId);
  }

  @Get('invoices/:id')
  getInvoice(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.records.getMyInvoice(req.tenantContext, id, customerId);
  }

  @Get('payments')
  listPayments(@Req() req: AuthenticatedRequest, @Query('customerId') customerId?: string) {
    return this.records.listMyPayments(req.tenantContext, customerId);
  }

  @Get('receipts')
  listReceipts(@Req() req: AuthenticatedRequest, @Query('customerId') customerId?: string) {
    return this.records.listMyReceipts(req.tenantContext, customerId);
  }

  @Get('quotations')
  listQuotations(@Req() req: AuthenticatedRequest, @Query('customerId') customerId?: string) {
    return this.records.listMyQuotations(req.tenantContext, customerId);
  }

  @Get('warranty')
  listWarranty(@Req() req: AuthenticatedRequest, @Query('customerId') customerId?: string) {
    return this.records.listMyWarrantyPolicies(req.tenantContext, customerId);
  }

  @Get('warranty-claims')
  listClaims(@Req() req: AuthenticatedRequest, @Query('customerId') customerId?: string) {
    return this.records.listMyWarrantyClaims(req.tenantContext, customerId);
  }

  @Post('warranty-claims')
  raiseClaim(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(ClaimBody)) body: z.infer<typeof ClaimBody>,
  ) {
    return this.records.raiseWarrantyClaim(req.tenantContext, body);
  }
}
