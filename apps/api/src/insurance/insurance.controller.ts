import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import { validatedBody } from '../common/validation/validated-body';
import { InsuranceService } from './insurance.service';

/**
 * The insurer's own routes — migration 082.
 *
 * ⚠️ NOTHING HERE ACCEPTS A `tenantId`, AN `organizationId`, OR A LEVY. The
 * first two come from the resolved context (`1.txt` §9); the third is written
 * by a database trigger at the moment of sale and is not the application's to
 * state. A body field for any of them would be the confused-deputy hole the
 * tenancy design exists to prevent.
 *
 * ⚠️ AND NOTHING HERE VERIFIES A PRODUCT. Verification is a platform decision
 * on its own route; an insurer that could verify itself would defeat the gate
 * entirely — the defect Codex found in the workshop directory on 2026-08-09.
 */

const COVER_TYPES = [
  'third_party',
  'third_party_fire_theft',
  'comprehensive',
  'windscreen',
  'roadside_assistance',
  'other',
] as const;

type CreateProductBody = z.infer<typeof CreateProductBody>;
const CreateProductBody = z.object({
  name: z.string().trim().min(2).max(160),
  summary: z.string().trim().max(2000).optional(),
  coverType: z.enum(COVER_TYPES),
  // Money as a NUMBER at the boundary and `numeric` in the database. The zod
  // bound mirrors 082's CHECK rather than replacing it.
  premium: z.number().nonnegative().max(99999999),
  currency: z.string().regex(/^[A-Z]{3}$/),
  termMonths: z.number().int().positive().max(60),
  excess: z.number().nonnegative().max(99999999).optional(),
  termsUrl: z.string().url().max(2000).optional(),
});

type PublicationBody = z.infer<typeof PublicationBody>;
const PublicationBody = z.object({ isPublished: z.boolean() });

type RecordSaleBody = z.infer<typeof RecordSaleBody>;
const RecordSaleBody = z
  .object({
    productId: z.string().uuid(),
    policyNumber: z.string().trim().min(1).max(80),
    buyerUserId: z.string().uuid(),
    vehicleRegistration: z.string().trim().min(1).max(40).optional(),
    premium: z.number().nonnegative().max(99999999),
    currency: z.string().regex(/^[A-Z]{3}$/),
    coverStartsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    coverEndsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  // Checked here as well as by 082's CHECK constraint, because the database's
  // message names a constraint and this one names the field a person typed.
  .refine((b) => b.coverEndsOn > b.coverStartsOn, {
    message: 'Cover must end after it starts.',
    path: ['coverEndsOn'],
  });

@Controller('insurance')
@UseGuards(TenantGuard)
export class InsuranceController {
  constructor(private readonly insurance: InsuranceService) {}

  @Get('products')
  listProducts(@Req() req: AuthenticatedRequest) {
    return this.insurance.listProducts(req.tenantContext);
  }

  @Post('products')
  createProduct(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(CreateProductBody)) body: CreateProductBody,
  ) {
    return this.insurance.createProduct(req.tenantContext, body);
  }

  /** List or unlist. Publishing an unverified product is refused by 082. */
  @Patch('products/:id/publication')
  setPublication(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(PublicationBody)) body: PublicationBody,
  ) {
    return this.insurance.setProductPublication(req.tenantContext, id, body.isPublished);
  }

  @Get('policies')
  listPolicies(@Req() req: AuthenticatedRequest) {
    return this.insurance.listPolicies(req.tenantContext);
  }

  /**
   * Record a sale. The response carries the platform levy the DATABASE
   * accrued, so the insurer is told what they owe at the moment they sell
   * rather than discovering it in a statement later.
   */
  @Post('policies')
  recordSale(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(RecordSaleBody)) body: RecordSaleBody,
  ) {
    return this.insurance.recordSale(req.tenantContext, body);
  }

  @Get('levies')
  levies(@Req() req: AuthenticatedRequest) {
    return this.insurance.levySummary(req.tenantContext);
  }
}
