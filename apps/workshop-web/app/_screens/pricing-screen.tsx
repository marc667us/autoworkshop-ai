import { Suspense } from 'react';
import { apiGet, describeApiFailure } from '@autoworkshop/next-shell';
import { ErrorState, LoadingState, PageHeader, StatusBadge } from '@autoworkshop/ui';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import { PricingForm } from './pricing-form';

/**
 * The workshop's pricing — Slice D.
 *
 * 🔴 THE POINT OF THIS SCREEN IS THE ZERO. When no pricing row exists,
 * `quotation.service.ts` falls back to `PRICING_DEFAULTS`, whose labour rate is
 * **0** — so a workshop that has never opened this page quotes labour at
 * nothing, silently, on every job. Nothing surfaced that before, because there
 * was no pricing screen at all.
 *
 * That is also why migration 029 exists. The table had ONE `FOR ALL` policy
 * testing only the tenant, so ANY role could rewrite the labour rate; a
 * TECHNICIAN was measured doing it. The policy was fixed and proved by
 * `verify/029` BEFORE this screen was built, deliberately — so that adding the
 * screen is not what makes the defect reachable.
 *
 * ⚠️ ONE ROUTE, NOT TWO, AND THAT IS A DEPARTURE FROM SLICE C — see
 * `/workshop-management/pricing-rules/page.tsx` for the reasoning and the gap it
 * leaves.
 */

export const dynamic = 'force-dynamic';

interface PricingResponse {
  configured: boolean;
  pricing: {
    currency: string;
    defaultLabourRate: number;
    taxName: string;
    taxRatePercent: number;
    defaultValidityDays: number;
    defaultWarrantyTerms: string;
    updatedAt: string | null;
  };
  mayEdit: boolean;
}

export function PricingScreen() {
  return (
    <>
      <PageHeader
        title="Pricing"
        description="The rates every new quotation is built from — labour, tax, how long a quotation stays valid."
      />
      <Suspense fallback={<LoadingState label="Loading your pricing…" />}>
        <Body />
      </Suspense>
    </>
  );
}

async function Body() {
  const result = await apiGet<PricingResponse>('workshop', '/pricing');

  if (!result.ok) {
    const { title, description } = describeApiFailure(result.reason);
    // ErrorState, not a thrown error: the shell, the navigation and the sign-out
    // control must survive an API having a bad day.
    return <ErrorState title={title} message={description} />;
  }

  const { configured, pricing, mayEdit } = result.data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: primitive.space[6] }}>
      {/* 🔴 THE WARNING IS THE FEATURE. There is deliberately no "empty state"
          here — an empty state would imply nothing is happening, and something
          very much is: quotations are being priced at zero. The form renders
          with the fallbacks filled in AND this banner above it. */}
      {!configured && (
        <div
          role="alert"
          style={{
            border: `1px solid ${themeVar.borderDefault}`,
            borderLeft: `4px solid ${themeVar.statusWarning}`,
            borderRadius: primitive.radius.lg,
            padding: primitive.space[4],
            background: themeVar.backgroundSecondary,
          }}
        >
          <strong style={{ color: themeVar.textPrimary }}>
            This workshop has no pricing set.
          </strong>
          <p style={{ margin: `${primitive.space[2]} 0 0`, color: themeVar.textSecondary }}>
            Until it is set, every new quotation prices labour at{' '}
            <strong>zero</strong> and applies no tax. The values below are the
            fallbacks currently in use, not saved settings —{' '}
            {mayEdit
              ? 'change them and save to start quoting properly.'
              : 'ask a workshop owner to set them.'}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: primitive.space[3], alignItems: 'center', flexWrap: 'wrap' }}>
        <StatusBadge
          kind={configured ? 'complete' : 'attention'}
          label={configured ? 'Pricing set' : 'Not set — using fallbacks'}
        />
        {pricing.updatedAt && (
          <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
            Last changed{' '}
            {new Date(pricing.updatedAt).toLocaleString('en-GB', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </span>
        )}
      </div>

      <PricingForm
        configured={configured}
        mayEdit={mayEdit}
        values={{
          currency: pricing.currency,
          // Rendered as strings because the inputs are text — and because
          // `String(0)` is "0" while a numeric input given 0 can render empty in
          // some browsers, which would look like an unset field that is in fact
          // the zero this screen exists to warn about.
          defaultLabourRate: String(pricing.defaultLabourRate),
          taxName: pricing.taxName,
          taxRatePercent: String(pricing.taxRatePercent),
          defaultValidityDays: String(pricing.defaultValidityDays),
          defaultWarrantyTerms: pricing.defaultWarrantyTerms ?? '',
        }}
      />
    </div>
  );
}
