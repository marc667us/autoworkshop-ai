import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { DataTable, EmptyState, PageHeader, StatusBadge } from '@autoworkshop/ui';
import { navLabelFor } from './nav-label';
import { InvoiceStatus, money, type InvoiceRow } from './finance-shared';

/**
 * READY FOR COLLECTION / VEHICLE RELEASE — slice 3.
 *
 * ONE screen at TWO routes (§48 `/collection-and-payment/ready-for-collection`
 * and `/collection-and-payment/vehicle-release`), because they are two names
 * for one question: which cars can go, and is anything still owed on them.
 *
 * ── 🔴 IT DOES NOT REFUSE TO RELEASE AN UNPAID VEHICLE ─────────────────────
 *
 * That was the first instinct and it is wrong. Workshops release cars on
 * account, on a manager's word, and for regulars they have known for twenty
 * years. A product that BLOCKED the counter would be routed around within a
 * week — the release would happen anyway and simply stop being recorded, which
 * is worse than recording it with a balance attached.
 *
 * So the balance is stated, unmissably, and the decision stays with the person.
 * A rule whose escape hatch is unreachable is a wall, not a rule, and that is
 * the most expensive defect class in this repository.
 *
 * ── ⚠️ NO WRITE HERE YET, AND IT SAYS SO ───────────────────────────────────
 *
 * There is no `released_at` column on a job card, so this screen cannot mark a
 * car as gone without inventing state that no other screen would honour. It
 * reports readiness and money, and says plainly that handing the keys over is
 * still recorded on the job card. Claiming a button that does nothing would be
 * the dead-end shape this repository keeps paying for.
 */

interface JobCardRow {
  id: string;
  jobNumber: string;
  stage: string;
  registrationNumber: string | null;
  customerName: string | null;
  make: string | null;
  model: string | null;
}

/** The stages at which the work is finished and the car can physically go. */
const COLLECTABLE = new Set([
  'qc_passed',
  'ready_for_collection',
  'completed',
  'closed',
]);

export async function VehicleReleaseScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Ready for Collection');

  const [jobCards, invoices] = await Promise.all([
    apiGet<JobCardRow[]>('workshop', '/job-cards'),
    apiGet<InvoiceRow[]>('workshop', '/invoices'),
  ]);

  const header = (
    <PageHeader
      title={title}
      description="Vehicles whose work is finished, with whatever is still owed on each one. Releasing a car with a balance is the workshop's decision — this screen makes sure nobody makes it by accident."
    />
  );

  if (!jobCards.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={jobCards.reason} workspaceId="workshop" />
      </>
    );
  }

  const ready = jobCards.data.filter((j) => COLLECTABLE.has(j.stage));

  if (ready.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="Nothing is ready to collect"
          description="A vehicle appears here once its repair has passed quality control. The staging board shows where everything currently is."
        />
      </>
    );
  }

  // ⚠️ A FAILED INVOICE READ MUST NOT HIDE THE CARS. Somebody at the counter
  // still needs to know which vehicles are finished; what they lose is the
  // balance, and the screen says which of the two it could not load rather than
  // silently showing zero owed.
  const invoiceByJob = new Map<string, InvoiceRow>();
  if (invoices.ok) {
    for (const inv of invoices.data) {
      if (inv.status !== 'void') invoiceByJob.set(inv.jobCardId, inv);
    }
  }

  const owing = ready.filter((j) => {
    const inv = invoiceByJob.get(j.id);
    return inv && Number(inv.balance) > 0;
  }).length;

  return (
    <>
      {header}

      {!invoices.ok ? (
        <p role="alert" style={{ fontSize: '0.875rem' }}>
          <strong>The billing service did not respond</strong>, so the amounts owed are not
          shown below. The vehicles listed are still correct — check the invoice before
          releasing anything.
        </p>
      ) : null}

      <DataTable
        caption="Ready for collection"
        summary={
          invoices.ok
            ? `${ready.length} ready · ${owing} with money still owed`
            : `${ready.length} ready · balances unavailable`
        }
        rowKey={(j) => j.id}
        rows={ready}
        columns={[
          { key: 'job', header: 'Job', nowrap: true, cell: (j) => j.jobNumber },
          {
            key: 'vehicle', header: 'Vehicle', nowrap: true,
            cell: (j) =>
              `${[j.make, j.model].filter(Boolean).join(' ') || 'vehicle'}${j.registrationNumber ? ` · ${j.registrationNumber}` : ''}`,
          },
          { key: 'customer', header: 'Customer', cell: (j) => j.customerName ?? '—' },
          {
            key: 'invoice', header: 'Invoice', nowrap: true,
            cell: (j) => {
              const inv = invoiceByJob.get(j.id);
              if (!invoices.ok) return '—';
              if (!inv) return <StatusBadge kind="attention" label="Not invoiced" />;
              return inv.invoiceNumber;
            },
          },
          {
            key: 'owed', header: 'Still owed', numeric: true, nowrap: true,
            cell: (j) => {
              const inv = invoiceByJob.get(j.id);
              if (!invoices.ok) return '—';
              if (!inv) {
                // Not invoiced is not the same as nothing owed, and showing a
                // reassuring 0.00 here would be the more dangerous lie.
                return <StatusBadge kind="attention" label="Unknown — no invoice" />;
              }
              const balance = Number(inv.balance);
              if (balance <= 0) return <StatusBadge kind="complete" label="Settled" />;
              return (
                <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {money(inv.balance, inv.currency)}
                </strong>
              );
            },
          },
          {
            key: 'status', header: 'Invoice status', secondary: true,
            cell: (j) => {
              const inv = invoiceByJob.get(j.id);
              return inv ? <InvoiceStatus status={inv.status} /> : '—';
            },
          },
        ]}
      />

      <p style={{ fontSize: '0.8125rem', opacity: 0.85 }}>
        Handing the keys over is recorded by moving the job card to its final stage on the job
        card itself — this screen does not do it, so that a release is never recorded here and
        missing there. Take any outstanding payment on the collection desk first.
      </p>
    </>
  );
}
