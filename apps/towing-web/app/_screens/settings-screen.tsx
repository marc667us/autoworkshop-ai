import { Suspense } from 'react';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { card, grid } from './shared';
import { saveSettingsAction } from './towing-actions';

export const dynamic = 'force-dynamic';

interface TowingSettings {
  currency: string;
  calloutFee: string | null;
  ratePerKm: string | null;
  serviceRadiusKm: number | null;
  operates24h: boolean;
  dispatchNotes: string | null;
  updatedAt: string | null;
  configured: boolean;
}

/**
 * `/operations/settings` — the rates every invoice is priced from.
 *
 * ⚠️ A WORKSHOP THAT HAS NEVER OPENED THIS SCREEN HAS NO ROW, AND THAT IS NOT
 * AN ERROR. The API returns the defaults with `configured: false` rather than
 * null, so a first visit renders the form instead of an error state. Returning
 * null and letting the screen decide is how "you have not set this up" becomes
 * "something went wrong" — a transport failure is not an authorization fact,
 * and an absent row is not a failure either.
 *
 * ⚠️ GATED ON `organization.admin` IN THE NAVIGATION (§52). The nav hides it,
 * `requireNavRoute` refuses the route, and the API's own `assertTowingStaff`
 * plus RLS refuse independently. Hidden is not secure; all three are required.
 */
export function SettingsScreen() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Call-out fee, per-kilometre rate and cover. Every towing invoice is priced from these."
      />
      <Suspense fallback={<LoadingState label="Loading settings…" />}>
        <Form />
      </Suspense>
    </>
  );
}

async function Form() {
  const result = await apiGet<TowingSettings>('towing', '/towing/settings');
  if (!result.ok) return <ApiFailure reason={result.reason} workspaceId="towing" />;
  const s = result.data;

  return (
    <div style={grid}>
      {!s.configured ? (
        <p
          style={{
            ...card,
            margin: 0,
            color: themeVar.textPrimary,
            fontSize: primitive.fontSize.sm,
          }}
        >
          Nothing is set up yet, so every recovery invoice would total zero. Set the
          call-out fee and the per-kilometre rate below before raising the first one.
        </p>
      ) : null}

      <form action={saveSettingsAction} style={{ ...card, display: 'grid', gap: primitive.space[3] }}>
        <div style={{ display: 'flex', gap: primitive.space[3], flexWrap: 'wrap', alignItems: 'end' }}>
          <Labelled label="Currency" hint="Three-letter code">
            <input name="currency" defaultValue={s.currency} maxLength={3} minLength={3} required style={{ ...control, width: '6rem' }} />
          </Labelled>
          <Labelled label="Call-out fee" hint="Charged on every recovery">
            <input name="calloutFee" type="number" min={0} step="0.01" defaultValue={s.calloutFee ?? ''} style={control} />
          </Labelled>
          <Labelled label="Rate per km" hint="Multiplied by the distance recorded">
            <input name="ratePerKm" type="number" min={0} step="0.01" defaultValue={s.ratePerKm ?? ''} style={control} />
          </Labelled>
          <Labelled label="Service radius (km)" hint="Blank means no limit">
            <input name="serviceRadiusKm" type="number" min={1} step={1} defaultValue={s.serviceRadiusKm ?? ''} style={control} />
          </Labelled>
        </div>

        <label style={{ display: 'flex', gap: primitive.space[2], alignItems: 'center' }}>
          <input type="checkbox" name="operates24h" defaultChecked={s.operates24h} />
          <span style={{ color: themeVar.textPrimary }}>We recover 24 hours a day</span>
        </label>

        <Labelled label="Dispatch notes" hint="Shown to whoever is on the board">
          <textarea
            name="dispatchNotes"
            defaultValue={s.dispatchNotes ?? ''}
            maxLength={4000}
            rows={3}
            style={{ ...control, height: 'auto', padding: primitive.space[2], minWidth: '20rem' }}
          />
        </Labelled>

        <div style={{ display: 'flex', gap: primitive.space[3], alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="submit" style={submit}>
            Save settings
          </button>
          {s.updatedAt ? (
            <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
              Last changed {s.updatedAt.slice(0, 10)}
            </span>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function Labelled({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'grid', gap: primitive.space[1] }}>
      <span style={{ fontSize: primitive.fontSize.sm, color: themeVar.textPrimary, fontWeight: 600 }}>
        {label}
      </span>
      {children}
      {hint ? (
        <span style={{ fontSize: primitive.fontSize.xs, color: themeVar.textSecondary }}>{hint}</span>
      ) : null}
    </label>
  );
}

const control: React.CSSProperties = {
  height: '2.25rem',
  padding: `0 ${primitive.space[2]}`,
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.md,
  background: themeVar.backgroundPrimary,
  color: themeVar.textPrimary,
};
const submit: React.CSSProperties = {
  ...control,
  cursor: 'pointer',
  fontWeight: 600,
  borderColor: themeVar.textPrimary,
};
