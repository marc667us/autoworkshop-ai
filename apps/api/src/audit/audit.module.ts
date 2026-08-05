import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuditService } from './audit.service';
import { PermissionDenialAuditFilter } from './permission-denial.filter';

/**
 * The audit lane.
 *
 * `PermissionDenialAuditFilter` is registered through the `APP_FILTER` token
 * rather than `app.useGlobalFilters()` in `main.ts`, because only the token form
 * is CONSTRUCTED BY THE DI CONTAINER — which is the only way it can receive
 * `DatabaseService` and `AuditService`. Registered in `main.ts` it would have to
 * be `new`-ed by hand with its dependencies threaded in, and a filter whose
 * dependencies are wired by hand is one that goes stale the moment either
 * changes (A8, 2026-08-06).
 */
@Global()
@Module({
  providers: [
    AuditService,
    { provide: APP_FILTER, useClass: PermissionDenialAuditFilter },
  ],
  exports: [AuditService],
})
export class AuditModule {}
