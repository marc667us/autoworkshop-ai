import { Module } from '@nestjs/common';
import { MembershipRepository } from './membership.repository';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';

@Module({
  controllers: [OrganizationController],
  providers: [MembershipRepository, OrganizationService],
  exports: [MembershipRepository, OrganizationService],
})
export class IdentityModule {}
