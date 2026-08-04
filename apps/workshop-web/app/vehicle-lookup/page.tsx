import Link from 'next/link';
import { apiGet } from '@autoworkshop/next-shell';
import { themeVar, primitive } from '@autoworkshop/design-tokens';

/**
 * `/vehicle-lookup` — WHERE THE FUNNEL ENDS.
 *
 * A visitor checks a VIN on the public landing page, sees make/region/year, is
 * told exactly what else exists, signs up through Keycloak — and Auth.js
 * returns them HERE, to `?vin=…`, holding the VIN they started with.
 *
 * ⚠️ THE VIN SURVIVES THE ROUND TRIP, AND THAT IS THE WHOLE POINT. The landing
 * page's call to action carries `callbackUrl=/vehicle-lookup?vin=…`. Landing a
 * newly-registered person on an empty form and asking them to retype seventeen
 * characters is how a funnel loses somebody at the last step, having already
 * done the hard part of getting them to register.
 *
 * ⚠️ IT CALLS THE GUARDED ENDPOINT. `apiGet` attaches the session's access
 * token; `GET /vin/:vin` is on `UserGuard` and returns the full decode plus
 * whatever NHTSA vPIC knows. The public endpoint would answer the same VIN with
 * less — which is the gate, and it lives at the API, not on this page.
 *
 * ⚠️ NO `requireNavRoute` GATE. This route is deliberately outside the §33
 * navigation tree: it is a destination people ARRIVE at from an external link,
 * not an item they browse to. Gating it on the nav tree would 404 the very
 * people the landing page just converted.
 */

export const dynamic = 'force-dynamic';

interface VpicDetail {
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
  plantCountry?: string;
}

interface FullVin {
  vin: string;
  valid: boolean;
  problem?: string;
  manufacturer?: string;
  region?: string;
  country?: string;
  modelYear?: number;
  plantCode?: string;
  serial?: string;
  checkDigitValid?: boolean;
  detail: VpicDetail | null;
  sources: { offline: string; enrichment: string };
}

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const raw = params.vin;
  const vin = (Array.isArray(raw) ? raw[0] : raw)?.trim().toUpperCase() ?? '';

  if (!vin) {
    return (
      <Shell title="Vehicle lookup">
        <p style={TEXT}>
          Add a VIN to the address, or search one from the{' '}
          <Link href="/" style={{ color: themeVar.actionPrimary }}>
            marketplace home page
          </Link>
          .
        </p>
      </Shell>
    );
  }

  // 🔴 `'workshop'`, NOT `'customer'`. This file was copied from customer-web and
  // the workspace id came with it. Session cookies are scoped PER WORKSPACE
  // (`authjs.session-token.<workspace>`) and cookies are host-only here — no
  // `Domain` attribute is set — so on the workshop host the customer cookie
  // cannot exist and every lookup rendered "your session has ended".
  //
  // ⚠️ AND LOCAL TESTING WOULD NEVER HAVE CAUGHT IT: `localhost:3000` and
  // `localhost:3001` share one cookie jar, because COOKIES IGNORE THE PORT —
  // the same fact that caused the accidental cross-app session on 2026-08-04.
  // So the wrong workspace id works locally and fails only in production.
  // Found by the security review, 2026-08-05.
  const result = await apiGet<FullVin>('workshop', `/vin/${encodeURIComponent(vin)}`);

  if (!result.ok) {
    return (
      <Shell title="Vehicle lookup">
        <p style={TEXT}>
          {result.reason === 'unauthenticated'
            ? 'Your session has ended. Sign in again and this vehicle will load.'
            : 'The lookup service did not answer. Try again shortly.'}
        </p>
      </Shell>
    );
  }

  const d = result.data;
  if (!d.valid) {
    return (
      <Shell title="Vehicle lookup">
        <p style={TEXT}>{d.problem ?? 'That does not look like a VIN.'}</p>
      </Shell>
    );
  }

  const fromVin: Array<[string, string | undefined]> = [
    ['Manufacturer', d.manufacturer],
    ['Model year', d.modelYear ? String(d.modelYear) : undefined],
    ['Built in', d.country ?? d.region],
    ['Assembly plant code', d.plantCode],
    ['Serial', d.serial],
  ];

  const e = d.detail;
  const fromService: Array<[string, string | undefined]> = [
    ['Make', e?.make],
    ['Model', e?.model],
    ['Body', e?.bodyClass],
    ['Vehicle type', e?.vehicleType],
    ['Engine', e?.engineModel],
    ['Cylinders', e?.engineCylinders ? String(e.engineCylinders) : undefined],
    // Rounded: vPIC returns 2.998832712, which is a measurement artefact and
    // not something anybody wants to read on a spec sheet.
    ['Displacement', e?.displacementL ? `${e.displacementL.toFixed(1)} L` : undefined],
    ['Fuel', e?.fuelType],
    ['Transmission', e?.transmission],
    ['Drive', e?.driveType],
  ];

  return (
    <Shell title={d.manufacturer ? `${d.manufacturer} — ${d.vin}` : d.vin}>
      <Facts heading="From the VIN itself" note={d.sources.offline} facts={fromVin} />
      {/* ⚠️ TWO SECTIONS, LABELLED BY SOURCE — never one merged block. A
          mechanic ordering a part on the strength of an engine code needs to
          know whether it was read off the VIN (guaranteed by ISO 3779) or
          supplied by a service whose coverage outside the US is patchy. */}
      {e ? (
        <Facts heading="Vehicle detail" note={d.sources.enrichment} facts={fromService} />
      ) : (
        <section style={{ marginTop: primitive.space[6] }}>
          <h2 style={HEADING}>Vehicle detail</h2>
          <p style={TEXT}>
            {d.sources.enrichment} This is common for vehicles imported from
            Japan or Europe — everything above still comes from the VIN itself.
          </p>
        </section>
      )}
    </Shell>
  );
}

function Facts({
  heading,
  note,
  facts,
}: {
  heading: string;
  note: string;
  facts: Array<[string, string | undefined]>;
}) {
  // A section whose every value is absent is noise. Rendering the heading over
  // five "unknown"s tells the reader nothing and looks like a fault.
  const known = facts.filter(([, v]) => v !== undefined);
  if (known.length === 0) return null;

  return (
    <section style={{ marginTop: primitive.space[6] }}>
      <h2 style={HEADING}>{heading}</h2>
      <p style={{ ...TEXT, fontSize: primitive.fontSize.xs }}>{note}</p>
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
          gap: primitive.space[4],
          margin: `${primitive.space[3]} 0 0`,
        }}
      >
        {known.map(([label, value]) => (
          <div key={label}>
            <dt style={{ fontSize: primitive.fontSize.xs, color: themeVar.textSecondary }}>
              {label}
            </dt>
            <dd
              style={{
                margin: 0,
                fontSize: primitive.fontSize.base,
                fontWeight: 600,
                color: themeVar.textPrimary,
              }}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main style={{ maxWidth: '60rem', margin: '0 auto', padding: primitive.space[6] }}>
      <h1 style={{ margin: 0, fontSize: primitive.fontSize.xl, color: themeVar.textPrimary }}>
        {title}
      </h1>
      {children}
    </main>
  );
}

const HEADING: React.CSSProperties = {
  margin: 0,
  fontSize: primitive.fontSize.lg,
  color: themeVar.textPrimary,
};
const TEXT: React.CSSProperties = {
  color: themeVar.textSecondary,
  fontSize: primitive.fontSize.sm,
  lineHeight: 1.6,
  margin: `${primitive.space[2]} 0 0`,
};
