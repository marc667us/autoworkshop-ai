import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import { validatedBody, optionalText, requiredText } from '../common/validation/validated-body';
import { SupplierRequestService } from './supplier-request.service';

/**
 * `/supplier-requests` — the WORKSHOP → SUPPLIER edge of the marketplace.
 *
 * Three audiences on one resource, and they are separated by PATH rather than by
 * a query flag: `/` is the asking workshop's own list, `/inbox` is the
 * supplier's. A caller that forgets a parameter must not silently get the other
 * side's view — that failure would be invisible and would leak.
 */

const CreateSupplierRequest = z
  .object({
    supplierId: z.string().uuid(),
    partId: z.string().uuid().optional(),
    partDescription: requiredText(500),
    // A whole number of things. `int()` matters: 2.5 wheel bearings is a typo
    // that would otherwise reach the database and round somewhere later.
    quantity: z.number().int().positive().max(100_000),
    neededBy: z.string().date().optional(),
    notes: optionalText(2000),
    jobCardId: z.string().uuid().optional(),
  })
  .strict();

const RespondToSupplierRequest = z
  .object({
    // Minor units, integer. A price in floating point reconciles to the wrong
    // number eventually, and this one becomes a purchase order.
    quoteMinor: z.number().int().nonnegative().optional(),
    quoteCurrency: z.string().regex(/^[A-Z]{3}$/).optional(),
    quoteLeadDays: z.number().int().nonnegative().max(365).optional(),
    declineReason: optionalText(1000),
  })
  .strict();

const DecideSupplierRequest = z
  .object({ decision: z.enum(['accepted', 'cancelled']) })
  .strict();

@Controller('supplier-requests')
@UseGuards(TenantGuard)
export class SupplierRequestController {
  constructor(private readonly requests: SupplierRequestService) {}

  /** The asking workshop's own requests. */
  @Get()
  mine(@Req() req: AuthenticatedRequest) {
    return this.requests.listForWorkshop(req.tenantContext);
  }

  /** The supplier's inbox — narrowed to their own suppliers by RLS. */
  @Get('inbox')
  inbox(@Req() req: AuthenticatedRequest, @Query('status') status?: string) {
    return this.requests.listForSupplier(req.tenantContext, status);
  }

  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(CreateSupplierRequest)) body: z.infer<typeof CreateSupplierRequest>,
  ) {
    return this.requests.create(req.tenantContext, body);
  }

  /** The SUPPLIER answers: quote or decline. */
  @Patch(':id/response')
  respond(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validatedBody(RespondToSupplierRequest)) body: z.infer<typeof RespondToSupplierRequest>,
  ) {
    return this.requests.respond(req.tenantContext, id, body);
  }

  /** The WORKSHOP accepts a quote, or cancels its own request. */
  @Patch(':id/decision')
  decide(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validatedBody(DecideSupplierRequest)) body: z.infer<typeof DecideSupplierRequest>,
  ) {
    return this.requests.decide(req.tenantContext, id, body);
  }
}
