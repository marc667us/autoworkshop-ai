import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import { requiredText, uuid, validatedBody } from '../common/validation/validated-body';
import { CustomerTailService } from './customer-tail.service';

/**
 * The customer tail — slice 13. Mounted under `/my/*` alongside slice 12, for
 * the same reason: these answer "what is MINE", and the workshop's own
 * equivalents live elsewhere behind `assertWorkshopStaff`. Two resources, two
 * paths, and neither reachable by loosening a filter on the other.
 */

const TowingBody = z
  .object({
    vehicleId: uuid().optional(),
    // Free text, deliberately: "the lay-by after the second Spintex light" is a
    // better location than any dropdown this product could offer, and the
    // recovery driver is a person.
    location: requiredText(500),
    contactPhone: requiredText(40),
    description: requiredText(2000),
  })
  .strict();

@Controller('my')
@UseGuards(TenantGuard)
export class CustomerTailController {
  constructor(private readonly tail: CustomerTailService) {}

  @Get('appointments')
  appointments(@Req() req: AuthenticatedRequest, @Query('customerId') customerId?: string) {
    return this.tail.listMyAppointments(req.tenantContext, customerId);
  }

  @Get('installed-parts')
  installedParts(@Req() req: AuthenticatedRequest, @Query('customerId') customerId?: string) {
    return this.tail.listMyInstalledParts(req.tenantContext, customerId);
  }

  @Get('recommendations')
  recommendations(@Req() req: AuthenticatedRequest, @Query('customerId') customerId?: string) {
    return this.tail.listMyRecommendations(req.tenantContext, customerId);
  }

  @Get('knowledge')
  knowledge(@Req() req: AuthenticatedRequest) {
    return this.tail.listMyKnowledge(req.tenantContext);
  }

  @Get('towing')
  towing(@Req() req: AuthenticatedRequest, @Query('customerId') customerId?: string) {
    return this.tail.listMyTowing(req.tenantContext, customerId);
  }

  @Post('towing')
  requestTowing(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(TowingBody)) body: z.infer<typeof TowingBody>,
  ) {
    return this.tail.requestTowing(req.tenantContext, body);
  }
}
