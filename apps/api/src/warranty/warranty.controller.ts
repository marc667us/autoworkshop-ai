import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import {
  optionalText,
  requiredText,
  uuid,
  validatedBody,
} from '../common/validation/validated-body';
import { WarrantyService } from './warranty.service';

/**
 * Warranty — slice 5 of `COMPLETION_PLAN.md`.
 *
 * ⚠️ WHO MAY DECIDE A CLAIM IS SETTLED IN `WarrantyService`, not here. Recording
 * a claim is a front-desk act; approving one commits the workshop to free work
 * and is the supervisor's, manager's or owner's. Both rules live in one place so
 * a new caller cannot arrive without them (CLAUDE.md §8).
 */

const CreatePolicyBody = z
  .object({
    jobCardId: uuid(),
    coverSummary: requiredText(2000),
    /** ISO date. At least one limit is required — the service says which. */
    expiresOn: optionalText(20),
    expiresAtOdometer: z.number().int().positive().max(10_000_000).optional(),
  })
  .strict();

const RecordClaimBody = z
  .object({
    policyId: uuid(),
    reportedFault: requiredText(2000),
    odometerReading: z.number().int().nonnegative().max(10_000_000).optional(),
  })
  .strict();

/** Mirrors migration 043's CHECK. `submitted` is not decidable — it is the opening event. */
const DecideBody = z
  .object({
    eventKind: z.enum(['assessing', 'approved', 'rejected', 'withdrawn', 'completed', 'note']),
    reason: optionalText(2000),
    note: optionalText(2000),
  })
  .strict();

@Controller('warranty-policies')
@UseGuards(TenantGuard)
export class WarrantyPolicyController {
  constructor(private readonly warranty: WarrantyService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.warranty.listPolicies(req.tenantContext);
  }

  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(CreatePolicyBody)) body: z.infer<typeof CreatePolicyBody>,
  ) {
    return this.warranty.createPolicy(req.tenantContext, body);
  }
}

@Controller('warranty-claims')
@UseGuards(TenantGuard)
export class WarrantyClaimController {
  constructor(private readonly warranty: WarrantyService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query('status') status?: string) {
    return this.warranty.listClaims(req.tenantContext, { status });
  }

  @Post()
  record(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(RecordClaimBody)) body: z.infer<typeof RecordClaimBody>,
  ) {
    return this.warranty.recordClaim(req.tenantContext, body);
  }

  /**
   * Record a decision — an EVENT, never an overwrite.
   *
   * `warranty.claim_events` is append-only on UPDATE and DELETE, and the claim's
   * `status` is a cache the trigger keeps in step. There is deliberately no
   * route that edits a past decision: a workshop that could rewrite a rejection
   * into an approval has a warranty record that means nothing.
   */
  @Post(':id/events')
  decide(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(DecideBody)) body: z.infer<typeof DecideBody>,
  ) {
    return this.warranty.decide(req.tenantContext, id, body);
  }
}
