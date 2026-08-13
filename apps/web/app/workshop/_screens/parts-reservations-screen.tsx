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
import { reserveStockAction } from './parts-actions';
import { SettleReservation } from './settle-reservation';

/**
 * PARTS RESERVATIONS — stock held for a job. Slice 4.
 *
 * ── 🔴 A RESERVATION IS NOT A MOVEMENT ─────────────────────────────────────
 *
 * Holding an alternator for tomorrow does not take it off the shelf; it makes it
 * unavailable to anyone else. So on-hand is unchanged and AVAILABLE falls.
 * Modelling a reservation as a negative movement would make the shelf count
 * wrong — the system would say three when four are sitting there — and would
 * lose the ability to release it.
 *
 * ⚠️ ISSUING converts the hold into a real movement in the SAME transaction, so
 * a reservation marked issued can never exist without the stock actually having
 * left. RELEASING requires a reason: somebody held that part because a job
 * needed it.
 */

interface ReservationRow {
  id: string;
  stock_item_id: string;
  part_number: string;
  name: string;
  unit: string;
  job_number: string | null;
  job_card_id: string;
  quantity: string;
  status: string;
  release_reason: string | null;
  reserved_by_name: string | null;
  reserved_at: string;
}

interface StockOption {
  stockItemId: string;
  partNumber: string;
  name: string;
  unit: string;
  available: string;
}

interface JobOption { id: string; jobNumber: string; registrationNumber: string | null }

const TONE: Record<string, 'draft' | 'active' | 'complete' | 'attention' | 'blocked'> = {
  held: 'attention',
  issued: 'complete',
  released: 'draft',
  expired: 'blocked',
};

function when(iso: string): string {
  try {
    return new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export async function PartsReservationsScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Parts Reservations');

  const [reservations, stock, jobs] = await Promise.all([
    apiGet<ReservationRow[]>('workshop', '/stock-reservations'),
    apiGet<StockOption[]>('workshop', '/stock'),
    apiGet<JobOption[]>('workshop', '/job-cards'),
  ]);

  const header = (
    <PageHeader
      title={title}
      description="Stock held for a job. A reservation does not take the part off the shelf — it stops anyone else being promised it."
    />
  );

  if (!reservations.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={reservations.reason} workspaceId="workshop" />
      </>
    );
  }

  const held = reservations.data.filter((r) => r.status === 'held');
  // Only stock with something free can be reserved. Offering the rest invites a
  // refusal the storekeeper could have been spared.
  const reservable = stock.ok ? stock.data.filter((s) => Number(s.available) > 0) : [];

  return (
    <>
      {header}

      {reservations.data.length === 0 ? (
        <EmptyState
          title="Nothing is reserved"
          description="Hold a part for a job and it appears here until it is issued or released."
        />
      ) : (
        <>
          <DataTable
            caption="Reservations"
            summary={`${held.length} still held · ${reservations.data.length} in total`}
            rowKey={(r) => r.id}
            rows={reservations.data}
            columns={[
              { key: 'part', header: 'Part', nowrap: true, cell: (r) => r.part_number },
              { key: 'name', header: 'Description', cell: (r) => r.name },
              { key: 'qty', header: 'Held', numeric: true, nowrap: true,
                cell: (r) => `${r.quantity} ${r.unit}` },
              { key: 'job', header: 'For job', nowrap: true, cell: (r) => r.job_number ?? '—' },
              { key: 'by', header: 'Held by', secondary: true,
                cell: (r) => r.reserved_by_name ?? '—' },
              { key: 'since', header: 'Since', numeric: true, secondary: true, nowrap: true,
                cell: (r) => when(r.reserved_at) },
              {
                key: 'status', header: 'Status',
                cell: (r) => (
                  <StatusBadge kind={TONE[r.status] ?? 'draft'} label={r.status} />
                ),
              },
            ]}
          />

          {held.length > 0 ? (
            <>
              <h2 style={{ fontSize: '1rem', marginTop: '2rem' }}>Settle a reservation</h2>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
                {held.map((r) => (
                  <li key={r.id}>
                    <SettleReservation
                      reservationId={r.id}
                      revalidate={route}
                      summary={`${r.part_number} — ${r.quantity} ${r.unit} for ${r.job_number ?? 'a job'}`}
                    />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}

      <h2 style={{ fontSize: '1rem', marginTop: '2rem' }}>Hold stock for a job</h2>
      {reservable.length === 0 ? (
        <EmptyState
          title="Nothing is free to reserve"
          description="Every stock line is either empty or already fully held. Book a delivery in, or release a reservation that is no longer needed."
        />
      ) : (
        <FormShell action={reserveStockAction} successPrefix="Held">
          <Field label="Part" hint="Only lines with stock free to hold are listed." htmlFor="stockItemId">
            <Select
              id="stockItemId"
              name="stockItemId"
              required
              options={reservable.map((s) => ({
                value: s.stockItemId,
                label: `${s.partNumber} — ${s.name} (${s.available} ${s.unit} free)`,
              }))}
            />
          </Field>
          <Field label="For job" htmlFor="jobCardId">
            <Select
              id="jobCardId"
              name="jobCardId"
              required
              options={
                jobs.ok
                  ? jobs.data.map((j) => ({
                      value: j.id,
                      label: `${j.jobNumber}${j.registrationNumber ? ` — ${j.registrationNumber}` : ''}`,
                    }))
                  : []
              }
            />
          </Field>
          <Field label="How many" htmlFor="quantity">
            <TextInput id="quantity" name="quantity" type="number" min={1} step="0.001" required />
          </Field>
          <SubmitButton>Hold the stock</SubmitButton>
        </FormShell>
      )}
    </>
  );
}
