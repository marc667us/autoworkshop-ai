import { Module } from '@nestjs/common';
import { BranchService } from './branch.service';
import {
  BranchController,
  MeController,
  MembershipController,
  UserController,
} from './identity.controllers';
import { MembershipRepository } from './membership.repository';
import { CustomerEnrolmentService } from './customer-enrolment.service';
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
    // Self-service customer enrolment (migration 061). Without it the
    // `customer` role cannot exist outside the local seed script.
    CustomerEnrolmentService,
    OrganizationService,
    BranchService,
    UserService,
    MembershipService,
    MeService,
  ],
  exports: [
    MembershipRepository,
    CustomerEnrolmentService,
    OrganizationService,
    BranchService,
    UserService,
    MembershipService,
    MeService,
  ],
})
export class IdentityModule {}
