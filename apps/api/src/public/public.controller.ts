import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { CatalogueService } from './catalogue.service';
import { decodeVin } from './vin';

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

  /**
   * `GET /public/vin/:vin` — THE FREE HALF of the VIN lookup.
   *
   * Owner request 2026-08-03: anyone may search vehicle information by VIN on
   * the landing page, see part of the answer, and be asked to sign up for the
   * rest.
   *
   * 🔴 THE GATE IS THIS ENDPOINT RETURNING LESS, NOT THE PAGE RENDERING LESS.
   * That is the rule this controller's own header states about mechanics'
   * contact details, and it applies identically here: a page that receives the
   * full decode and chooses to hide half of it has no gate at all — the data is
   * in the HTML, in the network tab, and in any script that asks. The detail
   * lives behind `GET /vin/:vin`, which requires a session.
   *
   * Free: is it a real VIN, who made it, where, and what year. Enough to prove
   * the tool works on YOUR car, which is what earns the sign-up.
   * Withheld: plant, serial, and everything vPIC adds — engine, model, body,
   * fuel, transmission.
   *
   * No enrichment call here on purpose: this is unauthenticated and uncached,
   * so an external lookup would let any visitor drive traffic to a third party
   * at our name, and would put someone else's latency on the front door.
   */
  @Get('vin/:vin')
  vin(@Param('vin') vin: string) {
    const d = decodeVin(vin);
    if (!d.valid) {
      // An invalid VIN is an ANSWER, with a problem a person can act on —
      // never a 4xx. `decodeVin` never throws for the same reason.
      return { vin: d.vin, valid: false, problem: d.problem };
    }
    return {
      vin: d.vin,
      valid: true,
      manufacturer: d.manufacturer,
      region: d.region,
      country: d.country,
      modelYear: d.modelYear,
      /**
       * What signing up actually buys, named field by field. "See more" with no
       * indication of what "more" is asks somebody to register on faith.
       */
      moreAvailable: [
        'engine model, cylinders and displacement',
        'fuel type and transmission',
        'body class and vehicle type',
        'assembly plant and serial',
        'matching parts in the marketplace',
      ],
    };
  }

  /** Search published parts. All filters optional; see catalogue-rules.ts. */
  @Get('parts')
  async parts(@Query() query: Record<string, unknown>) {
    return this.catalogue.searchParts(query);
  }

  /**
   * Resolve a specific set of part ids — what the BASKET renders from.
   *
   * Public for the same reason the search is: the basket is filled before
   * anyone signs in, and every field returned is already on the search
   * response. Ids for unpublished parts simply come back missing, which is what
   * lets the basket say "no longer available" rather than silently dropping a
   * line the buyer thought they were ordering.
   *
   * ⚠️ MUST BE DECLARED ABOVE `parts/:id`-style routes if one is ever added —
   * Nest matches in declaration order and a parameterised route would swallow
   * `by-ids` as an id.
   */
  @Get('parts/by-ids')
  async partsByIds(@Query('ids') ids: unknown) {
    return this.catalogue.partsByIds(ids);
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

  /**
   * The published supplier directory — the supply side of the marketplace, and
   * what a workshop picks from when raising a parts request (059).
   */
  @Get('suppliers')
  async suppliers() {
    return this.catalogue.suppliers();
  }

  /**
   * `GET /public/insurance-products` — what insurers are selling.
   *
   * Anonymous, like every other route on this controller: a shopper compares
   * cover before they have an account, exactly as they browse parts before
   * they have one.
   */
  @Get('insurance-products')
  async insuranceProducts() {
    return this.catalogue.insuranceProducts();
  }

  /** Counters for the landing page's KPI strip. */
  @Get('stats')
  async stats() {
    return this.catalogue.stats();
  }

  /**
   * A workshop's public profile: when it opens and what it offers. Slice 6.
   * Unauthenticated by design — this is what a stranger sees before deciding to
   * book. Only PUBLISHED rows come back, and that is decided by RLS, not here.
   */
  @Get('workshops/:organizationId/profile')
  async workshopProfile(@Param('organizationId', ParseUUIDPipe) organizationId: string) {
    return this.catalogue.workshopProfile(organizationId);
  }
}
