import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { EmptyState, PageHeader } from '@autoworkshop/ui';
import { navLabelFor } from './nav-label';
import { EvidencePanel } from './evidence-panel';
import { listEvidence, type EvidenceAsset } from './evidence-actions';

/**
 * CONDITION INSPECTION ON ARRIVAL — slice 1 of `COMPLETION_PLAN.md`.
 *
 * ── WHY THIS IS THE FIRST SCREEN EVIDENCE UPLOAD GETS ──────────────────────
 *
 * The state a vehicle arrived in is the single most disputed fact in a
 * workshop. A customer collects their car and points at a scratch; without a
 * photograph taken at the counter there is no answer, only two recollections.
 * Every other use of an attachment — a technician's photo of a worn part, a
 * supplier's PDF — is useful. This one settles arguments.
 *
 * ── ⚠️ THE PHOTOGRAPHS ATTACH TO THE JOB CARD, NOT TO AN INTAKE RECORD ─────
 *
 * `reception.vehicle_intakes` arrives in slice 2. Rather than hold this screen
 * back, or invent a table slice 2 would then have to reconcile with, the
 * evidence hangs off the JOB CARD — which already exists, is already the object
 * the whole application is built around, and is what a person would search for
 * anyway. When slice 2 lands, an intake becomes another owner type for the same
 * asset; `media.links` was designed so the same photograph can be attached to
 * both without re-uploading it.
 *
 * ── ⚠️ NO ROLE CHECK HERE, AND THAT IS DELIBERATE ──────────────────────────
 *
 * `requireNavRoute` in the page decides who reaches this screen at all, and
 * `MediaService` re-resolves the job card under the caller's own RLS context
 * before minting any URL. A viewer who can see a card can attach to it. Adding
 * a third opinion in this component would be a fourth place to keep in step
 * (CLAUDE.md §8 — hidden is not secure, and neither is duplicated).
 */

interface JobCardSummary {
  id: string;
  jobNumber: string;
  stage: string;
  registrationNumber: string | null;
  customerName: string | null;
  make: string | null;
  model: string | null;
  complaint: string | null;
  createdAt: string;
}

/**
 * Which cards are still at the point where an arrival photograph is meaningful.
 *
 * ⚠️ NOT A HARD FILTER. A card further along still renders — the panel is
 * read-only-ish rather than absent — because a workshop that forgot to
 * photograph on arrival needs to be able to do it late rather than not at all.
 * What the screen does is put the EARLY cards first, which is the actual job.
 */
const ARRIVAL_STAGES = new Set([
  'received',
  'intake',
  'awaiting_inspection',
  'inspection',
  'new',
  'open',
]);

export async function ConditionInspectionScreen({
  route,
  searchParams,
}: {
  route: string;
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const title = await navLabelFor('workshop', route, 'Condition Inspection');

  const header = (
    <PageHeader
      title={title}
      description="Photograph the vehicle as it arrives. Existing damage, mileage, fuel level, and anything left in the car — recorded before work starts, so it can be answered for at collection."
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
    // A dead end, named, with the step that fixes it — never a bare empty box.
    return (
      <>
        {header}
        <EmptyState
          title="No vehicle has been booked in yet"
          description="A condition inspection records the state of a vehicle on a job card. Open a job card first and this screen will list it."
        />
      </>
    );
  }

  const selectedRaw = searchParams?.jobCardId;
  const selectedId = Array.isArray(selectedRaw) ? selectedRaw[0] : selectedRaw;

  const ordered = [...cards.data].sort((a, b) => {
    const aEarly = ARRIVAL_STAGES.has(a.stage) ? 0 : 1;
    const bEarly = ARRIVAL_STAGES.has(b.stage) ? 0 : 1;
    if (aEarly !== bEarly) return aEarly - bEarly;
    return b.createdAt.localeCompare(a.createdAt);
  });

  const selected = ordered.find((c) => c.id === selectedId) ?? ordered[0]!;

  // ⚠️ A FAILURE TO LIST ATTACHMENTS MUST NOT BLANK THE SCREEN. The person can
  // still take the photographs; they simply cannot see the existing ones. An
  // empty array plus the panel's own error handling is a better outcome than an
  // error page that removes the capability entirely.
  const existing = await listEvidence('job_card', selected.id);
  const assets: EvidenceAsset[] = existing.ok ? existing.assets : [];

  return (
    <>
      {header}

      <nav aria-label="Vehicles awaiting condition inspection" style={{ marginBottom: '1rem' }}>
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
          {ordered.slice(0, 12).map((card) => {
            const isSelected = card.id === selected.id;
            return (
              <li key={card.id}>
                <a
                  href={`${route}?jobCardId=${card.id}`}
                  aria-current={isSelected ? 'true' : undefined}
                  style={{
                    display: 'inline-block',
                    padding: '0.375rem 0.75rem',
                    borderRadius: '999px',
                    fontSize: '0.8125rem',
                    border: '1px solid currentColor',
                    opacity: isSelected ? 1 : 0.65,
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  {card.registrationNumber ?? card.jobNumber}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))',
          gap: '0.75rem',
          margin: '0 0 1rem',
        }}
      >
        <div>
          <dt style={{ fontSize: '0.75rem', opacity: 0.7 }}>Job card</dt>
          <dd style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>{selected.jobNumber}</dd>
        </div>
        <div>
          <dt style={{ fontSize: '0.75rem', opacity: 0.7 }}>Vehicle</dt>
          <dd style={{ margin: 0 }}>
            {[selected.make, selected.model].filter(Boolean).join(' ') || '—'}
            {selected.registrationNumber ? ` · ${selected.registrationNumber}` : ''}
          </dd>
        </div>
        <div>
          <dt style={{ fontSize: '0.75rem', opacity: 0.7 }}>Customer</dt>
          <dd style={{ margin: 0 }}>{selected.customerName ?? '—'}</dd>
        </div>
        <div>
          <dt style={{ fontSize: '0.75rem', opacity: 0.7 }}>Reported complaint</dt>
          <dd style={{ margin: 0 }}>{selected.complaint ?? '—'}</dd>
        </div>
      </dl>

      <EvidencePanel
        ownerType="job_card"
        ownerId={selected.id}
        assets={assets}
        revalidate={route}
        heading="Condition on arrival"
        description="Walk around the vehicle and photograph each panel, the interior, the dashboard mileage, and any damage that is already there. These are what the customer is shown at collection."
      />
    </>
  );
}
