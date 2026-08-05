import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { EmptyState, PageHeader, StatusBadge } from '@autoworkshop/ui';
import { navLabelFor } from './nav-label';
import { listEvidence, type EvidenceAsset } from './evidence-actions';

/**
 * THE INTAKE RECEIPT — what the customer is handed when they leave the car.
 *
 * Slice 1 of `COMPLETION_PLAN.md`, and the natural pair to the condition
 * inspection: one records the vehicle's state, this one ACKNOWLEDGES it in
 * writing to the person who owns it.
 *
 * ── ⚠️ IT IS A PRINTABLE PAGE, NOT A GENERATED PDF ─────────────────────────
 *
 * There is no PDF library in this repository and ADR-012 forbids buying a
 * service to make one. A browser prints HTML perfectly well, and `@media print`
 * is a stylesheet rather than a dependency — so the receipt is a real document
 * the customer can be handed today instead of a screen that says a document
 * feature is coming.
 *
 * The honest limit is stated on the screen rather than hidden: there is no
 * signature capture, so the customer signs the printed copy. Saying so is the
 * point — a receipt that implied a captured signature it does not have would be
 * worse than none.
 *
 * ── ⚠️ IT LISTS THE PHOTOGRAPHS BUT DOES NOT EMBED THEM ────────────────────
 *
 * The signed GET URLs expire in five minutes. Printing a page whose images had
 * already expired would produce a receipt full of broken frames, and printing
 * one whose URLs had NOT expired would put a bearer credential for a customer's
 * vehicle photographs onto a sheet of paper. So the receipt records HOW MANY
 * photographs were taken and when — which is the fact that matters in a dispute
 * — and the images stay in the application.
 */

interface JobCardSummary {
  id: string;
  jobNumber: string;
  stage: string;
  registrationNumber: string | null;
  customerName: string | null;
  customerPhone: string | null;
  make: string | null;
  model: string | null;
  modelYear: number | null;
  complaint: string | null;
  priority: string | null;
  createdAt: string;
}

function formatDate(value: string): string {
  // `sv-SE` gives YYYY-MM-DD HH:mm without a locale guess. A receipt is a
  // record, and an ambiguous 03/04/2026 on one is a genuine problem.
  try {
    return new Date(value).toLocaleString('sv-SE', { timeStyle: 'short', dateStyle: 'short' });
  } catch {
    return value;
  }
}

export async function IntakeReceiptScreen({
  route,
  searchParams,
}: {
  route: string;
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const title = await navLabelFor('workshop', route, 'Issue Intake Receipt');

  const header = (
    <PageHeader
      title={title}
      description="The written acknowledgement that this workshop has taken the vehicle: what arrived, what the customer reported, and how many condition photographs were taken."
    />
  );

  const cards = await apiGet<JobCardSummary[]>('workshop', '/job-cards');
  if (!cards.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={cards.reason} workspaceId="workshop" />
      </>
    );
  }

  if (cards.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="Nothing has been booked in yet"
          description="A receipt acknowledges a vehicle this workshop has taken in. Open a job card first and it will be listed here."
        />
      </>
    );
  }

  const selectedRaw = searchParams?.jobCardId;
  const selectedId = Array.isArray(selectedRaw) ? selectedRaw[0] : selectedRaw;
  const ordered = [...cards.data].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const selected = ordered.find((c) => c.id === selectedId) ?? ordered[0]!;

  const existing = await listEvidence('job_card', selected.id);
  const assets: EvidenceAsset[] = existing.ok ? existing.assets : [];
  const photos = assets.filter((a) => a.contentType.startsWith('image/'));

  return (
    <>
      <div data-print-hide>
        {header}

        <nav aria-label="Choose a job card" style={{ marginBottom: '1rem' }}>
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              gap: '0.5rem',
              flexWrap: 'wrap',
            }}
          >
            {ordered.slice(0, 12).map((card) => (
              <li key={card.id}>
                <a
                  href={`${route}?jobCardId=${card.id}`}
                  aria-current={card.id === selected.id ? 'true' : undefined}
                  style={{
                    display: 'inline-block',
                    padding: '0.375rem 0.75rem',
                    borderRadius: '999px',
                    fontSize: '0.8125rem',
                    border: '1px solid currentColor',
                    opacity: card.id === selected.id ? 1 : 0.65,
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  {card.registrationNumber ?? card.jobNumber}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <p style={{ fontSize: '0.875rem', opacity: 0.8 }}>
          Use your browser&rsquo;s print command to produce the customer&rsquo;s copy.{' '}
          <strong>There is no signature capture</strong> — the customer signs the printed
          sheet, and that signed copy is the record.
        </p>

        {photos.length === 0 ? (
          <p style={{ fontSize: '0.875rem' }}>
            <strong>No condition photographs have been taken.</strong> Issuing a receipt
            without them leaves nothing to answer a damage claim with — take them on the
            Condition Inspection screen first.
          </p>
        ) : null}
      </div>

      <article
        style={{
          border: '1px solid currentColor',
          borderRadius: '0.5rem',
          padding: '1.5rem',
          display: 'grid',
          gap: '1rem',
          maxWidth: '48rem',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.125rem' }}>Vehicle intake receipt</h2>

        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
            gap: '0.75rem',
            margin: 0,
          }}
        >
          <div>
            <dt style={{ fontSize: '0.75rem', opacity: 0.7 }}>Job card</dt>
            <dd style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>{selected.jobNumber}</dd>
          </div>
          <div>
            <dt style={{ fontSize: '0.75rem', opacity: 0.7 }}>Received</dt>
            <dd style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>
              {formatDate(selected.createdAt)}
            </dd>
          </div>
          <div>
            <dt style={{ fontSize: '0.75rem', opacity: 0.7 }}>Vehicle</dt>
            <dd style={{ margin: 0 }}>
              {[selected.modelYear, selected.make, selected.model].filter(Boolean).join(' ') || '—'}
            </dd>
          </div>
          <div>
            <dt style={{ fontSize: '0.75rem', opacity: 0.7 }}>Registration</dt>
            <dd style={{ margin: 0 }}>{selected.registrationNumber ?? '—'}</dd>
          </div>
          <div>
            <dt style={{ fontSize: '0.75rem', opacity: 0.7 }}>Customer</dt>
            <dd style={{ margin: 0 }}>{selected.customerName ?? '—'}</dd>
          </div>
          <div>
            <dt style={{ fontSize: '0.75rem', opacity: 0.7 }}>Contact</dt>
            <dd style={{ margin: 0 }}>{selected.customerPhone ?? '—'}</dd>
          </div>
        </dl>

        <div>
          <h3 style={{ margin: '0 0 0.25rem', fontSize: '0.875rem' }}>Reported complaint</h3>
          <p style={{ margin: 0 }}>{selected.complaint ?? '—'}</p>
        </div>

        <div>
          <h3 style={{ margin: '0 0 0.25rem', fontSize: '0.875rem' }}>Condition record</h3>
          <p style={{ margin: 0 }}>
            {photos.length === 0 ? (
              <StatusBadge kind="attention" label="No photographs taken" />
            ) : (
              <>
                {photos.length} photograph{photos.length === 1 ? '' : 's'} taken on arrival,
                held against this job card. The earliest was recorded{' '}
                {formatDate(photos[0]!.confirmedAt ?? photos[0]!.createdAt)}.
              </>
            )}
          </p>
        </div>

        <div>
          <h3 style={{ margin: '0 0 0.25rem', fontSize: '0.875rem' }}>Customer signature</h3>
          <p style={{ margin: '0 0 2.5rem', fontSize: '0.8125rem', opacity: 0.8 }}>
            I confirm the vehicle described above was left with this workshop and that the
            condition record was taken in my presence.
          </p>
          <div style={{ borderTop: '1px solid currentColor', width: '18rem' }} />
        </div>
      </article>
    </>
  );
}
