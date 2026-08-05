import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import {
  EmptyState,
  Field,
  FormShell,
  PageHeader,
  Select,
  StatusBadge,
  SubmitButton,
  TextInput,
} from '@autoworkshop/ui';
import { themeVar } from '@autoworkshop/design-tokens';
import { navLabelFor } from './nav-label';
import { recordClaimAction } from './warranty-actions';
import { ClaimDecision } from './claim-decision';

/**
 * WARRANTY CLAIMS — "it has gone again". Slice 5,
 * `/finance-and-warranty/warranty-claims`.
 *
 * ── 🔴 EVERY DECISION IS AN EVENT, AND THE HISTORY IS SHOWN ────────────────
 *
 * `warranty.claim_events` is append-only on UPDATE **and** DELETE, and the
 * claim's `status` is a cache the trigger keeps in step. So this screen renders
 * the whole trail — submitted, assessing, approved or rejected, by whom and
 * when — rather than a single current state. A workshop that could rewrite a
 * rejection into an approval has a warranty record that means nothing, and a
 * screen that showed only the latest value would hide the difference.
 *
 * ── ⚠️ AN EXPIRED WARRANTY STILL ACCEPTS A CLAIM ───────────────────────────
 *
 * Whether cover had run out is the ASSESSMENT's job. Refusing at the counter
 * would leave a customer in dispute with no record that they ever asked;
 * recording it and rejecting it with a reason is honest, turning them away
 * silently is not. The form says so.
 */

interface ClaimRow {
  id: string;
  claimNumber: string;
  policyNumber: string;
  registrationNumber: string | null;
  customerName: string | null;
  reportedFault: string;
  reportedAt: string;
  odometerReading: number | null;
  status: string;
  events?: Array<{
    id: string;
    eventKind: string;
    reason: string | null;
    note: string | null;
    decidedByName: string | null;
    decidedAt: string;
  }>;
}

interface PolicyOption {
  id: string;
  policyNumber: string;
  registrationNumber: string | null;
  customerName: string | null;
  coverSummary: string;
  isCurrentlyInForce: boolean;
  status: string;
}

const TONE: Record<string, 'draft' | 'active' | 'complete' | 'attention' | 'blocked'> = {
  submitted: 'attention',
  assessing: 'active',
  approved: 'complete',
  completed: 'complete',
  rejected: 'blocked',
  withdrawn: 'draft',
  note: 'draft',
};

function when(iso: string): string {
  try {
    return new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export async function WarrantyClaimsScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Warranty Claims');

  const [claims, policies] = await Promise.all([
    apiGet<ClaimRow[]>('workshop', '/warranty-claims'),
    apiGet<PolicyOption[]>('workshop', '/warranty-policies'),
  ]);

  const header = (
    <PageHeader
      title={title}
      description="Repairs a customer says have failed again. Every assessment and decision is kept — none of them can be edited or removed afterwards."
    />
  );

  if (!claims.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={claims.reason} workspaceId="workshop" />
      </>
    );
  }

  const open = claims.data.filter((c) => c.status === 'submitted' || c.status === 'assessing');
  const claimable = policies.ok ? policies.data.filter((p) => p.status !== 'voided') : [];

  return (
    <>
      {header}

      <p style={{ fontSize: '0.9375rem' }}>
        {open.length === 0
          ? 'No claim is waiting on a decision.'
          : `${open.length} claim${open.length === 1 ? '' : 's'} waiting on a decision, of ${claims.data.length} in total.`}
      </p>

      {claims.data.length === 0 ? (
        <EmptyState
          title="No claims yet"
          description="A claim is made against a warranty. Create one on the Warranty Records screen, and anything a customer reports back appears here."
        />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
          {claims.data.map((claim) => (
            <li
              key={claim.id}
              style={{
                border: `1px solid ${themeVar.borderDefault}`,
                borderRadius: '0.5rem',
                padding: '0.875rem',
                display: 'grid',
                gap: '0.625rem',
              }}
            >
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
                <strong>{claim.claimNumber}</strong>
                <StatusBadge kind={TONE[claim.status] ?? 'draft'} label={claim.status} />
                <span style={{ fontSize: '0.8125rem', opacity: 0.85 }}>
                  on {claim.policyNumber}
                  {claim.registrationNumber ? ` · ${claim.registrationNumber}` : ''}
                  {claim.customerName ? ` · ${claim.customerName}` : ''}
                  {' · '}
                  {when(claim.reportedAt)}
                  {claim.odometerReading !== null
                    ? ` · ${claim.odometerReading.toLocaleString()} km`
                    : ''}
                </span>
              </div>

              <blockquote style={{ margin: 0, fontSize: '0.9375rem' }}>
                {claim.reportedFault}
              </blockquote>

              {/* THE WHOLE TRAIL, not just the current status. */}
              {claim.events && claim.events.length > 0 ? (
                <ol
                  style={{
                    listStyle: 'none',
                    margin: 0,
                    padding: 0,
                    display: 'grid',
                    gap: '0.25rem',
                    borderLeft: `3px solid ${themeVar.borderDefault}`,
                    paddingLeft: '0.75rem',
                  }}
                >
                  {claim.events.map((e) => (
                    <li key={e.id} style={{ fontSize: '0.8125rem' }}>
                      <strong>{e.eventKind}</strong>
                      {e.decidedByName ? ` · ${e.decidedByName}` : ''} · {when(e.decidedAt)}
                      {e.reason ? <> — {e.reason}</> : null}
                      {e.note ? <> — {e.note}</> : null}
                    </li>
                  ))}
                </ol>
              ) : null}

              {claim.status === 'completed' || claim.status === 'withdrawn' ? (
                <p style={{ margin: 0, fontSize: '0.8125rem', opacity: 0.8 }}>
                  This claim is closed. Its history cannot be changed — raise a new claim if
                  there is more to do.
                </p>
              ) : (
                <ClaimDecision claimId={claim.id} status={claim.status} revalidate={route} />
              )}
            </li>
          ))}
        </ul>
      )}

      <h2 style={{ fontSize: '1rem', marginTop: '2rem' }}>Record a claim</h2>
      {claimable.length === 0 ? (
        <EmptyState
          title="No warranty to claim against"
          description="A claim is made on a warranty. Create one on the Warranty Records screen first."
        />
      ) : (
        <>
          <p style={{ fontSize: '0.8125rem', opacity: 0.85, marginTop: 0 }}>
            Record the claim even if the warranty looks expired — whether cover had run out is
            for the assessment to decide, and a customer in dispute should have a record that
            they asked.
          </p>
          <FormShell action={recordClaimAction} successPrefix="Recorded claim">
            <Field label="Warranty" htmlFor="policyId">
              <Select
                id="policyId"
                name="policyId"
                required
                options={claimable.map((p) => ({
                  value: p.id,
                  label: `${p.policyNumber} — ${p.registrationNumber ?? 'no registration'}${p.isCurrentlyInForce ? '' : ' (date expired)'}`,
                }))}
              />
            </Field>
            <Field
              label="What the customer says has happened"
              hint="Their words, not a diagnosis."
              htmlFor="reportedFault"
            >
              <TextInput id="reportedFault" name="reportedFault" required maxLength={2000} />
            </Field>
            <Field
              label="Odometer now (km)"
              hint="What the mileage limit is judged against, so record it while the car is here."
              htmlFor="odometerReading"
            >
              <TextInput id="odometerReading" name="odometerReading" type="number" min={0} />
            </Field>
            <SubmitButton>Record the claim</SubmitButton>
          </FormShell>
        </>
      )}
    </>
  );
}
