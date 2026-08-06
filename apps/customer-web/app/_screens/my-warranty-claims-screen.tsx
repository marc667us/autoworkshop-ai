import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import {
  DataTable,
  EmptyState,
  Field,
  FormShell,
  PageHeader,
  Select,
  StatusBadge,
  SubmitButton,
  TextInput,
} from '@autoworkshop/ui';
import { raiseWarrantyClaimAction } from './my-warranty-claims-actions';

/**
 * YOUR WARRANTY CLAIMS — slice 12.
 *
 * ⚠️ THE EVENTS ARE THE RECORD; `status` IS A CACHE OF THEM — migration 043's
 * own words, and the claim's status is moved only by a trigger from the latest
 * event. So this screen shows the DECISIONS, not just the current word. A
 * customer told "rejected" with no reason and no date makes a phone call; a
 * customer shown the assessment history does not.
 *
 * ⚠️ AN EXPIRED WARRANTY STILL ACCEPTS A CLAIM, deliberately. Whether cover had
 * run out is the ASSESSMENT's job — refusing at the form would leave someone in
 * dispute with no record that they ever asked. `WarrantyService.recordClaim`
 * made that decision for the workshop's own desk and this makes the same one,
 * rather than inventing a stricter rule for the customer, who has no counter to
 * argue at. Only a VOIDED warranty has nothing to claim on.
 */

interface ClaimEvent {
  at: string;
  kind: string;
  note: string | null;
}

interface MyClaimRow {
  id: string;
  claimNumber: string;
  policyNumber: string;
  jobNumber: string | null;
  registrationNumber: string | null;
  reportedFault: string;
  reportedAt: string;
  status: string;
  events: ClaimEvent[];
}

interface MyPolicyRow {
  id: string;
  policyNumber: string;
  registrationNumber: string | null;
  coverSummary: string;
  status: string;
}

function state(r: MyClaimRow) {
  switch (r.status) {
    case 'approved':
      return <StatusBadge kind="complete" label="Approved" />;
    case 'completed':
      return <StatusBadge kind="complete" label="Completed" />;
    case 'rejected':
      return <StatusBadge kind="blocked" label="Rejected" />;
    case 'withdrawn':
      return <StatusBadge kind="blocked" label="Withdrawn" />;
    case 'assessing':
      return <StatusBadge kind="active" label="Being assessed" />;
    default:
      return <StatusBadge kind="attention" label="Submitted" />;
  }
}

/** The workshop's last word, with its reason — the part a customer acts on. */
function latest(r: MyClaimRow): string {
  const last = r.events[r.events.length - 1];
  if (!last) return '—';
  const when = last.at.slice(0, 10);
  return last.note ? `${when}: ${last.note}` : `${when}: ${last.kind}`;
}

export async function MyWarrantyClaimsScreen() {
  const [claims, policies] = await Promise.all([
    apiGet<MyClaimRow[]>('customer', '/my/warranty-claims'),
    apiGet<MyPolicyRow[]>('customer', '/my/warranty'),
  ]);

  const header = (
    <PageHeader
      title="Warranty Claims"
      description="Claims you have raised on a warranty, and the workshop's response to each."
    />
  );

  if (!claims.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={claims.reason} workspaceId="customer" />
      </>
    );
  }

  // 🔴 THE FORM IS ONLY OFFERED WHEN A CLAIMABLE WARRANTY EXISTS. A select with
  // no options is a form that cannot be submitted, and the customer would have
  // no way to know why — the "wall with no escape hatch" this repository has
  // recorded as its most expensive defect class.
  const claimable = policies.ok ? policies.data.filter((p) => p.status !== 'voided') : [];

  const form =
    claimable.length === 0 ? (
      // `EmptyState`, not an invented notice component: this genuinely IS the
      // empty state of the form, and `@autoworkshop/ui` has no Callout.
      <EmptyState
        title="Nothing to claim on yet"
        description="A claim is raised against a warranty. None of your repairs currently carries one you can claim on — if something the workshop repaired has failed again, report it as a problem and they can look at the history."
      />
    ) : (
      <FormShell action={raiseWarrantyClaimAction} successPrefix="Raised">
        <Field label="Which warranty" htmlFor="policyId">
          <Select
            id="policyId"
            name="policyId"
            required
            options={claimable.map((p) => ({
              value: p.id,
              label: `${p.policyNumber} — ${p.registrationNumber ?? 'vehicle'} — ${p.coverSummary}`,
            }))}
          />
        </Field>
        <Field
          label="What has gone wrong"
          htmlFor="reportedFault"
          hint="Describe the fault in your own words, and say whether it is the same problem as before."
        >
          <TextInput id="reportedFault" name="reportedFault" required maxLength={10_000} />
        </Field>
        <Field label="Current mileage (km)" htmlFor="odometerReading" hint="Optional, but it helps the assessment.">
          <TextInput id="odometerReading" name="odometerReading" type="number" min={0} step={1} />
        </Field>
        <SubmitButton>Raise claim</SubmitButton>
      </FormShell>
    );

  if (claims.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="You have no claims"
          description="If a repair covered by warranty fails again, raise a claim here and the workshop will assess it."
        />
        {form}
      </>
    );
  }

  const open = claims.data.filter((c) => ['submitted', 'assessing'].includes(c.status)).length;

  return (
    <>
      {header}
      <DataTable
        caption={`${claims.data.length} claims · ${open} still open`}
        rows={claims.data}
        rowKey={(r) => r.id}
        columns={[
          { key: 'no', header: 'Claim', nowrap: true, cell: (r) => r.claimNumber },
          { key: 'pol', header: 'Warranty', nowrap: true, cell: (r) => r.policyNumber },
          { key: 'veh', header: 'Vehicle', nowrap: true, cell: (r) => r.registrationNumber ?? '—' },
          { key: 'fault', header: 'Reported', cell: (r) => r.reportedFault },
          { key: 'when', header: 'Raised', nowrap: true, cell: (r) => r.reportedAt.slice(0, 10) },
          { key: 'last', header: 'Latest response', cell: (r) => latest(r) },
          { key: 'state', header: 'Status', cell: (r) => state(r) },
        ]}
      />
      {form}
    </>
  );
}
