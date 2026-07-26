import { Module } from '@nestjs/common';
import { MembershipRepository } from './membership.repository';
import { OrganizationService } from './organization.service';

@Module({
  providers: [MembershipRepository, OrganizationService],
  exports: [MembershipRepository, OrganizationService],
})
export class IdentityModule {}
