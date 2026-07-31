import { Controller, Get, Query } from '@nestjs/common';
import { CatalogueService } from './catalogue.service';

/**
 * THE PUBLIC API. Read-only, unauthenticated, no tenant context.
 *
 * ⚠️ THE ABSENCE OF `@UseGuards(TenantGuard)` ON THIS CONTROLLER IS DELIBERATE
 * AND IS THE ONLY SUCH ABSENCE OUTSIDE `/health`. Do not "fix" it by adding the
 * guard — that would 401 every visitor and the landing page would be empty for
 * exactly the people it exists to serve.
 *
 * What makes that safe is not this comment. It is that:
 *
 *   1. Every query goes through `queryWithoutTenant`, which sets no tenant
 *      context, so RLS on every tenant-owned table returns ZERO rows. The
 *      failure mode of pointing one of these endpoints at a business table is
 *      an empty response, not a leak.
 *   2. The only tables that return anything are `catalogue.*`, whose rows exist
 *      solely because somebody set `is_published = true`.
 *   3. Nothing here writes. There is no POST, PUT, PATCH or DELETE, and
 *      migration 021's `admin_write` policy would refuse one anyway.
 *
 * If a future endpoint on this controller needs to read a tenant table, it does
 * not belong on this controller.
 *
 * ⚠️ AND WHAT IS NOT HERE: a mechanic's phone number, a workshop's address, its
 * legal name or its customers. The directory endpoint returns what may be
 * BROWSED. Making contact requires an account, and that gate is enforced by the
 * guarded endpoint that serves contact details — not by the page choosing not
 * to render a field it was already sent.
 */
@Controller('public')
export class PublicController {
  constructor(private readonly catalogue: CatalogueService) {}

  /** Search published parts. All filters optional; see catalogue-rules.ts. */
  @Get('parts')
  async parts(@Query() query: Record<string, unknown>) {
    return this.catalogue.searchParts(query);
  }

  /** The values the search controls may offer — categories, makes, models,
   *  years and part manufacturers, each derived from data that has results. */
  @Get('parts/facets')
  async facets() {
    return this.catalogue.facets();
  }

  /** Free mechanic search. Browsing only — no contact details in the response. */
  @Get('mechanics')
  async mechanics(@Query() query: Record<string, unknown>) {
    return this.catalogue.searchMechanics(query);
  }

  /** Counters for the landing page's KPI strip. */
  @Get('stats')
  async stats() {
    return this.catalogue.stats();
  }
}
