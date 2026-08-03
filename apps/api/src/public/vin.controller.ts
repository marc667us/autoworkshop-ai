import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { UserGuard } from '../auth/user.guard';
import { decodeVin } from './vin';
import { VpicService } from './vpic.service';

/**
 * `GET /vin/:vin` — THE PAID-BY-SIGNING-UP HALF of the VIN lookup.
 *
 * The other end of the landing page's funnel: a visitor searches a VIN, sees
 * make/region/year for free, is told exactly what else exists, signs up through
 * Keycloak, comes back, and this is what they get.
 *
 * ⚠️ ON `UserGuard`, NOT `TenantGuard`, AND THAT MATTERS FOR THE FUNNEL. The
 * person arriving here has just signed up. They belong to no workshop and may
 * never belong to one — they are a vehicle owner who wants to know what is in
 * their car. `TenantGuard` would refuse exactly the audience this feature
 * exists to convert. `UserGuard` proves who they are and grants no tenancy, so
 * every tenant-owned table still returns zero rows for them.
 *
 * ⚠️ THE GATE IS THIS ENDPOINT EXISTING SEPARATELY, not a flag on the public
 * one. A single endpoint returning everything and a page rendering half is not
 * a gate: the data is already in the payload. See `public.controller.ts`, which
 * states the same rule about mechanics' contact details.
 *
 * The decode itself is IDENTICAL to the public one — same pure function, same
 * seventeen characters. What a session buys is the enrichment and the fields
 * the free answer withholds, not a different truth.
 */
@Controller('vin')
@UseGuards(UserGuard)
export class VinController {
  constructor(private readonly vpic: VpicService) {}

  @Get(':vin')
  async describe(@Param('vin') vin: string) {
    const d = decodeVin(vin);
    if (!d.valid) {
      return { vin: d.vin, valid: false, problem: d.problem };
    }

    // ⚠️ AWAITED, BUT IT CANNOT FAIL THE REQUEST. `enrich` swallows every
    // error and returns null on timeout, DNS failure, a non-200, or malformed
    // JSON. A signed-in user whose VIN vPIC has never heard of — which is
    // ordinary for a Japanese or German import — still gets the full offline
    // answer rather than an error page.
    const detail = await this.vpic.enrich(d.vin);

    return {
      vin: d.vin,
      valid: true,
      // The offline decode, in full — including the fields the public endpoint
      // deliberately withholds.
      manufacturer: d.manufacturer,
      region: d.region,
      country: d.country,
      modelYear: d.modelYear,
      plantCode: d.plantCode,
      serial: d.serial,
      checkDigitValid: d.checkDigitValid,
      /**
       * Null when vPIC could not answer. The client must render the offline
       * fields regardless — see the header of `vpic.service.ts` for why this is
       * a normal outcome and not a failure.
       */
      detail,
      /**
       * ⚠️ SAYS WHICH ANSWER CAME FROM WHERE. A workshop ordering a part on the
       * strength of an engine code needs to know whether that code was read off
       * the VIN (guaranteed by the standard) or supplied by an external service
       * whose coverage outside the US is patchy. Merging the two into one
       * undifferentiated block is how a confident wrong engine reaches a
       * mechanic.
       */
      sources: {
        offline: 'Decoded from the VIN itself (ISO 3779).',
        enrichment: detail
          ? 'NHTSA vPIC — coverage is strongest for vehicles sold in the US.'
          : 'No external detail available for this VIN.',
      },
    };
  }
}
