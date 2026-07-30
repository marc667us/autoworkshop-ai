import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import {
  DiagnosisController,
  InspectionController,
  JobCardController,
  RepairPlanController,
  QuotationController,
} from './repair.controller';
import { DiagnosisService } from './diagnosis.service';
import { RepairPlanService } from './repair-plan.service';
import { QuotationService } from './quotation.service';
import { InspectionService } from './inspection.service';
import { JobCardService } from './job-card.service';

/**
 * The `repair` domain — job cards and the repair lifecycle (Phase 5).
 *
 * `IdentityModule` for `MembershipRepository`: `@UseGuards(TenantGuard)` names
 * the guard by class, so Nest builds an instance in THIS module's injector even
 * though AuthModule is `@Global`. Without the import the container cannot
 * construct it and the application fails to BOOT — typecheck, lint and the unit
 * suite all pass on the broken version, because dependency injection resolves at
 * runtime. CoreModule carries the same note for the same reason.
 */
@Module({
  imports: [IdentityModule],
  controllers: [
    JobCardController,
    InspectionController,
    DiagnosisController,
    RepairPlanController,
    QuotationController,
  ],
  providers: [
    JobCardService,
    InspectionService,
    DiagnosisService,
    RepairPlanService,
    QuotationService,
  ],
  exports: [
    JobCardService,
    InspectionService,
    DiagnosisService,
    RepairPlanService,
    QuotationService,
  ],
})
export class RepairModule {}
