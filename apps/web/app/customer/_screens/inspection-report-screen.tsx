import { Suspense } from 'react';
import { apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';

/**
 * What the workshop FOUND — the vehicle owner's inspection report.
 *
 * ── 🔴 THE GAP THIS CLOSES ─────────────────────────────────────────────────
 *
 * The customer had NO inspection visibility anywhere: no menu entry, no screen.
 * So they were asked to approve a quotation with no sight of the findings behind
 * it — the evidence for the price, withheld from the person paying it.
 *
 * ⚠️ A PREPARED REPORT, NOT THE TECHNICIAN'S SHEET. `2.txt` §557 draws that
 * line, and `customer` is deliberately absent from `CAN_READ_INSPECTION` because
 * of it. `GET /job-cards/:id/inspection-report` returns the OUTCOME only — what
 * was checked and how it came out. No recorder names, no internal notes, and
 * nothing at all until the inspection has been SUBMITTED, because a half-filled
 * sheet is working state and reading "brakes: fail" before anyone has decided it
 * is true would frighten somebody for no reason.
 */
export const dynamic = 'force-dynamic';

interface Report {
  submittedAt: string;
  items: { checkpoint: string; result: string }[];
}

/** The workshop's result vocabulary, in the owner's words. An unknown value
 *  renders as itself rather than vanishing — a checkpoint silently dropped from
 *  a report is worse than one labelled oddly. */
const RESULT: Record<string, { label: string; kind: 'complete' | 'attention' | 'blocked' | 'draft' }> = {
  pass: { label: 'Fine', kind: 'complete' },
  ok: { label: 'Fine', kind: 'complete' },
  advisory: { label: 'Worth watching', kind: 'attention' },
  attention: { label: 'Needs attention', kind: 'attention' },
  fail: { label: 'Needs work', kind: 'blocked' },
  not_applicable: { label: 'Not applicable', kind: 'draft' },
};

export function InspectionReportScreen({ jobCardId }: { jobCardId?: string }) {
  return (
    <>
      <PageHeader
        title="Inspection Report"
        description="What the workshop checked on your vehicle, and what they found."
      />
      <Suspense fallback={<LoadingState label="Loading the report…" />}>
        <Body jobCardId={jobCardId} />
      </Suspense>
    </>
  );
}

async function Body({ jobCardId }: { jobCardId?: string }) {
  if (!jobCardId) {
    // Not an error: somebody reached the page without choosing a repair. Point
    // at the screen that lists them rather than reporting a failure.
    return (
      <EmptyState
        title="Choose a repair"
        description="Open a repair from Repair Tracking to see what the workshop found on your vehicle."
      />
    );
  }

  const result = await apiGet<Report[]>('customer', `/job-cards/${jobCardId}/inspection-report`);

  if (!result.ok || result.data.length === 0) {
    return (
      <EmptyState
        title="No inspection yet"
        description="When the workshop has inspected your vehicle and submitted their findings, they appear here."
      />
    );
  }

  return (
    <div style={{ display: 'grid', gap: primitive.space[5] }}>
      {result.data.map((report) => (
        <section
          key={report.submittedAt}
          style={{
            border: `1px solid ${themeVar.borderDefault}`,
            borderRadius: primitive.radius.lg,
            padding: primitive.space[4],
            background: themeVar.surfaceRaised,
          }}
        >
          <h2 style={{ margin: `0 0 ${primitive.space[3]} 0`, fontSize: primitive.fontSize.base, color: themeVar.textSecondary }}>
            Inspected {new Date(report.submittedAt).toLocaleDateString('en-GB')}
          </h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: primitive.space[2] }}>
            {report.items.map((item, i) => {
              const r = RESULT[item.result] ?? { label: item.result, kind: 'draft' as const };
              return (
                <li
                  key={`${item.checkpoint}-${i}`}
                  style={{ display: 'flex', gap: primitive.space[3], alignItems: 'baseline', flexWrap: 'wrap' }}
                >
                  <span style={{ color: themeVar.textPrimary }}>{item.checkpoint}</span>
                  <span style={{ marginLeft: 'auto' }}>
                    <StatusBadge kind={r.kind} label={r.label} />
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
