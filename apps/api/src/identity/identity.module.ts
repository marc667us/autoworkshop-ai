import { Module } from '@nestjs/common';
import { BranchService } from './branch.service';
import { BranchController, MembershipController, UserController } from './identity.controllers';
import { MembershipRepository } from './membership.repository';
import { MembershipService } from './membership.service';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { UserService } from './user.service';

@Module({
  controllers: [OrganizationController, BranchController, UserController, MembershipController],
  providers: [
    MembershipRepository,
    OrganizationService,
    BranchService,
    UserService,
    MembershipService,
  ],
  exports: [
    MembershipRepository,
    OrganizationService,
    BranchService,
    UserService,
    MembershipService,
  ],
})
export class IdentityModule {}
