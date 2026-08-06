import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import { optionalText, uuid, validatedBody } from '../common/validation/validated-body';
import { PlanningService } from './planning.service';

/**
 * Technician planning — slice 14.
 *
 * ⚠️ THE GUARD HERE IS `TenantGuard` AND THAT IS NOT THE AUTHORIZATION. Every
 * method on `PlanningService` calls `assertWorkshopStaff` itself, because a
 * controller guard covers the routes that exist today and the rule has to cover
 * the caller that arrives tomorrow.
 *
 * ⚠️ NO ROUTE FOR "REQUEST A SPECIALIST". That is `POST /comms/threads` with
 * `threadKind: 'specialist_support'`, which has existed since slice 7 — a
 * second endpoint would be a second inbox and a second unread count.
 */

const ISO = z.string().datetime({ offset: true });

const BookBody = z
  .object({
    resourceKind: z.enum(['tool', 'bay']),
    resourceId: uuid(),
    jobCardId: uuid(),
    startsAt: ISO,
    endsAt: ISO,
  })
  .strict()
  // Stated here so the person typing gets a sentence rather than a constraint
  // name. The DATABASE enforces it too — this is the courtesy, that is the rule.
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
    message: 'The booking must end after it starts.',
  });

const ReleaseBody = z.object({ reason: optionalText(500) }).strict();

@Controller('plan-work')
@UseGuards(TenantGuard)
export class PlanningController {
  constructor(private readonly planning: PlanningService) {}

  @Get('find-parts')
  findParts(@Req() req: AuthenticatedRequest, @Query('q') q?: string) {
    return this.planning.findParts(req.tenantContext, q);
  }

  @Get('compatibility')
  compatibility(
    @Req() req: AuthenticatedRequest,
    @Query('make') make?: string,
    @Query('partNumber') partNumber?: string,
  ) {
    return this.planning.partsCompatibility(req.tenantContext, { make, partNumber });
  }

  @Get('tools')
  tools(@Req() req: AuthenticatedRequest) {
    return this.planning.listBookable(req.tenantContext, 'tool');
  }

  @Get('bays')
  bays(@Req() req: AuthenticatedRequest) {
    return this.planning.listBookable(req.tenantContext, 'bay');
  }

  @Get('bookings')
  bookings(@Req() req: AuthenticatedRequest, @Query('kind') kind?: string) {
    return this.planning.listBookings(
      req.tenantContext,
      kind === 'tool' || kind === 'bay' ? kind : undefined,
    );
  }

  @Post('bookings')
  book(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(BookBody)) body: z.infer<typeof BookBody>,
  ) {
    return this.planning.book(req.tenantContext, body);
  }

  @Post('bookings/:id/release')
  release(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(ReleaseBody)) body: z.infer<typeof ReleaseBody>,
  ) {
    return this.planning.release(req.tenantContext, id, body.reason);
  }
}
