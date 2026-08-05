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
import { navLabelFor } from './nav-label';
import { createPolicyAction } from './warranty-actions';

/**
 * WARRANTY RECORDS — what this workshop has guaranteed. Slice 5,
 * `/finance-and-warranty/warranty-records`.
 *
 * ── ⚠️ THIS IS NOT AN INSURANCE PRODUCT ────────────────────────────────────
 *
 * A workshop warrants ITS OWN WORK — "twelve months or twenty thousand
 * kilometres on this repair" — so a policy is created from a completed job card
 * and inherits its vehicle. Modelling it as something a customer buys would need
 * a price, a term sheet and a seller, none of which exist here.
 *
 * ── ⚠️ "IN FORCE" IS COMPUTED, NEVER STORED ────────────────────────────────
 *
 * A stored `expired` flag is wrong the moment the clock passes midnight and
 * stays wrong until something writes to the row — so a warranty would read as
 * valid for as long as nobody touched it. `status` records what a PERSON did
 * (voided it); expiry is arithmetic, done at read time.
 *
 * Only the DATE limit can be evaluated here. The mileage limit depends on what
 * the odometer says TODAY, which the workshop only learns when the car comes
 * back — so the claim carries a reading and the assessor compares it. The screen
 * shows both limits and says which one it can and cannot check.
 */

interface PolicyRow {
  id: string;
  policyNumber: string;
  jobNumber: string | null;
  registrationNumber: string | null;
  customerName: string | null;
  coverSummary: string;
  startsOn: string;
  expiresOn: string | null;
  expiresAtOdometer: number | null;
  status: string;
  isCurrentlyInForce: boolean;
  claimCount: number;
}

interface JobCardOption {
  id: string;
  jobNumber: string;
  stage: string;
  registrationNumber: string | null;
  customerName: string | null;
}

/** Work is warranted once it is finished, not while it is in progress. */
const WARRANTABLE = new Set(['qc_passed', 'ready_for_collection', 'completed', 'closed']);

function day(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('sv-SE');
  } catch {
    return iso;
  }
}

export async function WarrantyRecordsScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Warranty Records');

  const [policies, jobCards] = await Promise.all([
    apiGet<PolicyRow[]>('workshop', '/warranty-policies'),
    apiGet<JobCardOption[]>('workshop', '/job-cards'),
  ]);

  const header = (
    <PageHeader
      title={title}
      description="Repairs this workshop has guaranteed, and for how long. A warranty runs out on whichever comes first — the date or the mileage."
    />
  );

  if (!policies.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={policies.reason} workspaceId="workshop" />
      </>
    );
  }

  // Finished work first — the rest is listed but not promoted, because a
  // workshop occasionally warrants something early and a filter that HID the
  // others would be a wall.
  const warrantable = jobCards.ok
    ? [...jobCards.data].sort(
        (a, b) => (WARRANTABLE.has(a.stage) ? 0 : 1) - (WARRANTABLE.has(b.stage) ? 0 : 1),
      )
    : [];

  const inForce = policies.data.filter((p) => p.isCurrentlyInForce).length;

  return (
    <>
      {header}

      {policies.data.length === 0 ? (
        <EmptyState
          title="Nothing is under warranty yet"
          description="Create a warranty against a finished job card. It is what a claim is made on, so nothing can be claimed until one exists."
        />
      ) : (
        <DataTable
          caption="Warranties"
          summary={`${inForce} in force · ${policies.data.length} on record`}
          rowKey={(p) => p.id}
          rows={policies.data}
          columns={[
            { key: 'number', header: 'Warranty', nowrap: true, cell: (p) => p.policyNumber },
            { key: 'job', header: 'Job', nowrap: true, secondary: true,
              cell: (p) => p.jobNumber ?? '—' },
            { key: 'vehicle', header: 'Vehicle', nowrap: true,
              cell: (p) => p.registrationNumber ?? '—' },
            { key: 'customer', header: 'Customer', cell: (p) => p.customerName ?? '—' },
            { key: 'cover', header: 'Covers', cell: (p) => p.coverSummary },
            {
              key: 'until', header: 'Until', nowrap: true,
              cell: (p) =>
                [
                  p.expiresOn ? day(p.expiresOn) : null,
                  // The mileage limit is stated but explicitly NOT checked here.
                  p.expiresAtOdometer ? `${p.expiresAtOdometer.toLocaleString()} km` : null,
                ]
                  .filter(Boolean)
                  .join(' or '),
            },
            { key: 'claims', header: 'Claims', numeric: true, secondary: true,
              cell: (p) => (p.claimCount === 0 ? '—' : String(p.claimCount)) },
            {
              key: 'status', header: 'Status',
              cell: (p) =>
                p.status === 'voided' ? (
                  <StatusBadge kind="blocked" label="Voided" />
                ) : p.isCurrentlyInForce ? (
                  <StatusBadge kind="complete" label="In force" />
                ) : (
                  // Date has passed. The mileage limit is unknown until the car
                  // returns, so this never claims more than it knows.
                  <StatusBadge kind="draft" label="Date expired" />
                ),
            },
          ]}
        />
      )}

      <h2 style={{ fontSize: '1rem', marginTop: '2rem' }}>Warrant a repair</h2>
      {warrantable.length === 0 ? (
        <EmptyState
          title="No job cards to warrant"
          description="A warranty is created against the job card whose work it guarantees. Finish a repair first."
        />
      ) : (
        <FormShell action={createPolicyAction} successPrefix="Created warranty">
          <Field label="Job card" hint="Finished work is listed first." htmlFor="jobCardId">
            <Select
              id="jobCardId"
              name="jobCardId"
              required
              options={warrantable.map((j) => ({
                value: j.id,
                label: `${j.jobNumber} — ${j.registrationNumber ?? 'no registration'}${WARRANTABLE.has(j.stage) ? '' : ' (still in progress)'}`,
              }))}
            />
          </Field>
          <Field
            label="What is covered"
            hint="In your own words — this is what a claim is judged against."
            htmlFor="coverSummary"
          >
            <TextInput id="coverSummary" name="coverSummary" required maxLength={2000} />
          </Field>
          <Field label="Expires on" hint="Leave blank if the limit is mileage only." htmlFor="expiresOn">
            <TextInput id="expiresOn" name="expiresOn" type="date" />
          </Field>
          <Field
            label="Or at odometer (km)"
            hint="Leave blank if the limit is time only. At least one of the two is required."
            htmlFor="expiresAtOdometer"
          >
            <TextInput id="expiresAtOdometer" name="expiresAtOdometer" type="number" min={1} />
          </Field>
          <SubmitButton>Create the warranty</SubmitButton>
        </FormShell>
      )}
    </>
  );
}
