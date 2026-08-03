import { Module } from '@nestjs/common';
import { BranchService } from './branch.service';
import {
  BranchController,
  MeController,
  MembershipController,
  UserController,
} from './identity.controllers';
import { MembershipRepository } from './membership.repository';
import { MeService } from './me.service';
import { MembershipService } from './membership.service';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { RegistrationController } from './registration.controller';
import { UserService } from './user.service';

@Module({
  controllers: [
    OrganizationController,
    BranchController,
    UserController,
    MembershipController,
    MeController,
    // Onboarding: reachable BEFORE the caller belongs to any organisation.
    // On UserGuard, not TenantGuard — see the controller header.
    RegistrationController,
  ],
  providers: [
    MembershipRepository,
    OrganizationService,
    BranchService,
    UserService,
    MembershipService,
    MeService,
  ],
  exports: [
    MembershipRepository,
    OrganizationService,
    BranchService,
    UserService,
    MembershipService,
    MeService,
  ],
})
export class IdentityModule {}
