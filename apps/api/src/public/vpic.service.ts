import { Injectable, Logger } from '@nestjs/common';

/**
 * ENRICHMENT from NHTSA vPIC — engine, model, body and fuel.
 *
 * Free, keyless, no registration, run by the US Department of Transportation.
 * That is what makes it admissible under CLAUDE.md §1 (zero cost, including
 * production) and ADR-015 (never mandate a provider): nothing here is required
 * for the feature to work.
 *
 * ── IT ENRICHES, IT NEVER DECIDES ──────────────────────────────────────────
 *
 * `vin.ts` answers from the seventeen characters alone, always, instantly. This
 * adds detail WHEN IT CAN. Every failure path below returns `null`, and the
 * caller renders the offline answer — because this runs on the front door of the
 * product, for people who are not signed in, and a landing page that is as
 * reliable as somebody else's uptime is not a landing page.
 *
 * ── THE TIMEOUT IS THE WHOLE DESIGN ────────────────────────────────────────
 *
 * A slow dependency is worse than an absent one: absent fails instantly and
 * visibly, slow holds the request open and looks like the product is broken.
 * `AbortSignal.timeout` bounds it hard. Solar learned this the expensive way —
 * a live suite read-timing-out at 90s on a cold dependency.
 *
 * ⚠️ COVERAGE IS STRONGEST FOR VEHICLES SOLD IN THE US. A Ghanaian import from
 * Japan or Germany may return little or nothing, and that is a normal outcome
 * here, not an error — which is exactly why the offline decode is the primary.
 */

export interface VpicDetail {
  make?: string;
  model?: string;
  modelYear?: number;
  bodyClass?: string;
  vehicleType?: string;
  engineModel?: string;
  engineCylinders?: number;
  displacementL?: number;
  fuelType?: string;
  driveType?: string;
  transmission?: string;
  manufacturer?: string;
  plantCountry?: string;
}

const ENDPOINT = 'https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues';

@Injectable()
export class VpicService {
  private readonly log = new Logger(VpicService.name);

  /**
   * Never throws, never rejects. `null` means "no extra detail", which the
   * caller renders as the offline answer.
   */
  async enrich(vin: string, timeoutMs = 4000): Promise<VpicDetail | null> {
    // Refuse to put anything but a well-formed VIN in a URL. The caller has
    // already validated, but this function is public and a future caller may
    // not have — and the value is interpolated into a path.
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return null;

    try {
      const response = await fetch(`${ENDPOINT}/${vin}?format=json`, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        this.log.debug(`vPIC returned ${response.status} for a VIN lookup`);
        return null;
      }

      const body = (await response.json()) as { Results?: Array<Record<string, unknown>> };
      const row = body.Results?.[0];
      if (!row) return null;

      // vPIC returns EVERY field for every VIN, filling the unknown ones with
      // '' or 'Not Applicable' rather than omitting them. Rendering those
      // verbatim would put "Not Applicable" in front of a customer as though it
      // were an answer.
      const text = (key: string): string | undefined => {
        const v = row[key];
        if (typeof v !== 'string') return undefined;
        const t = v.trim();
        if (!t || /^not applicable$/i.test(t) || /^n\/?a$/i.test(t)) return undefined;
        return t;
      };
      const num = (key: string): number | undefined => {
        const t = text(key);
        if (t === undefined) return undefined;
        const n = Number(t);
        return Number.isFinite(n) ? n : undefined;
      };

      const detail: VpicDetail = {
        make: text('Make'),
        model: text('Model'),
        modelYear: num('ModelYear'),
        bodyClass: text('BodyClass'),
        vehicleType: text('VehicleType'),
        engineModel: text('EngineModel'),
        engineCylinders: num('EngineCylinders'),
        displacementL: num('DisplacementL'),
        fuelType: text('FuelTypePrimary'),
        driveType: text('DriveType'),
        transmission: text('TransmissionStyle'),
        manufacturer: text('Manufacturer'),
        plantCountry: text('PlantCountry'),
      };

      // Every field empty is the same as no answer. Returning an object of
      // undefineds would make the caller render an "engine" section with
      // nothing in it, which reads as a fault rather than as absent data.
      return Object.values(detail).some((v) => v !== undefined) ? detail : null;
    } catch (err) {
      // Timeout, DNS, TLS, offline, malformed JSON — all the same outcome. The
      // landing page still answers from the VIN itself.
      this.log.debug(`vPIC enrichment unavailable: ${(err as Error).message}`);
      return null;
    }
  }
}
