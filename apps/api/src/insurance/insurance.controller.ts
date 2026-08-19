import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import { validatedBody } from '../common/validation/validated-body';
import { InsuranceService } from './insurance.service';
import { PERMISSIONS, permissionsForContext } from '../authz/permission-matrix';

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
  // 🔴 `z.string().url()` IS NOT A SCHEME CHECK, AND THAT IS A REAL HOLE, NOT A
  // TIGHTENING. Zod delegates to `new URL()`, which happily parses
  // `javascript:alert(document.cookie)` and `data:text/html,<script>…`.
  // Measured 2026-08-19: both are ACCEPTED by `z.string().url()`.
  //
  // Until slice 17 that only reached an admin screen. It now reaches
  // `/cover/[id]`, which is ANONYMOUS — so an insurer could store a
  // `javascript:` URL, have the product verified (verification reviews the
  // COVER, not the URL scheme) and publish stored XSS to every visitor. React
  // does not block `javascript:` hrefs; it warns in development and renders
  // them in production.
  //
  // Refused here so it cannot be STORED, and refused again at render by
  // `safeExternalHref` — the value is already in the database for products
  // created before this check, so the boundary alone would not be enough.
  termsUrl: z
    .string()
    .url()
    .max(2000)
    .refine((u) => /^https?:$/.test(new URL(u).protocol), {
      message: 'The terms link must be an http:// or https:// address.',
    })
    .optional(),
});

type PublicationBody = z.infer<typeof PublicationBody>;
const PublicationBody = z.object({ isPublished: z.boolean() });

type VerificationBody = z.infer<typeof VerificationBody>;
const VerificationBody = z.object({ isVerified: z.boolean() });

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

const EnquiryStatusBody = z.object({
  status: z.enum(['new', 'contacted', 'closed']),
});
type EnquiryStatusBody = z.infer<typeof EnquiryStatusBody>;

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

  /**
   * `GET /insurance/enquiries` — the shopper's half, arriving.
   *
   * 🔴 THIS ROUTE IS WHAT MAKES THE PUBLIC ENQUIRY FORM MORE THAN A CONTROL
   * THAT DISCARDS ITS INPUT. Migration 086 was written only after asking which
   * production path WRITES an enquiry; this is the matching question for the
   * READ, and the repository has recorded five roles that shipped without one.
   */
  @Get('enquiries')
  listEnquiries(@Req() req: AuthenticatedRequest) {
    return this.insurance.listEnquiries(req.tenantContext);
  }

  /** Work the inbox: new -> contacted -> closed. Nothing else is editable. */
  @Patch('enquiries/:id/status')
  setEnquiryStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(EnquiryStatusBody)) body: EnquiryStatusBody,
  ) {
    return this.insurance.setEnquiryStatus(req.tenantContext, id, body.status);
  }
}

/**
 * The PLATFORM's side of the insurance marketplace.
 *
 * 🔴 A SEPARATE CONTROLLER, ON A SEPARATE PATH, AND THAT IS THE POINT. An
 * insurer that could verify its own product would defeat the gate entirely —
 * the defect Codex found in the workshop directory on 2026-08-09, where a
 * workshop could publish itself. Verification lives behind `platform.admin`
 * and nowhere near `/insurance/*`.
 *
 * ⚠️ THE GATE IS `permissionsForContext`, NOT A ROLE NAME. Since migration 078
 * `platform.admin` comes from a GRANT RECORD in
 * `identity.platform_administrators`, not from a membership `role_name` — so
 * revoking a grant closes this route, which was the whole point of 078. A role
 * check here would reintroduce the hole it removed.
 */
@Controller('admin/insurance')
@UseGuards(TenantGuard)
export class AdminInsuranceController {
  constructor(private readonly insurance: InsuranceService) {}

  private assertAdmin(req: AuthenticatedRequest): void {
    if (!permissionsForContext(req.tenantContext).includes(PERMISSIONS.platformAdmin)) {
      throw new ForbiddenException(
        'verifying an insurance product is a platform administrator decision',
      );
    }
  }

  /** Everything awaiting a decision. */
  @Get('review-queue')
  queue(@Req() req: AuthenticatedRequest) {
    this.assertAdmin(req);
    return this.insurance.reviewQueue(req.tenantContext);
  }

  /**
   * Verify or withdraw verification.
   *
   * ⚠️ WITHDRAWING ALSO UNLISTS — see the service. A product left published
   * after its verification was withdrawn would stay on sale after the platform
   * decided it should not be.
   */
  @Patch('products/:id/verification')
  setVerification(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(VerificationBody)) body: VerificationBody,
  ) {
    this.assertAdmin(req);
    return this.insurance.setProductVerification(req.tenantContext, id, body.isVerified);
  }
}
