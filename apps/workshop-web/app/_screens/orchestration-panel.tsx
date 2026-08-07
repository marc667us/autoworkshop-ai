import { Suspense } from 'react';
import { apiGet } from '@autoworkshop/next-shell';
import { LoadingState, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';

/**
 * WHAT NEEDS DOING NEXT — the owner's value chain, step 9.
 *
 * "an ochestrated agen the takes over and work with other gaents run with the
 * workshop to fix the car."
 *
 * Deterministic, not Google ADK — the owner's standing decision, following
 * Solar's ADR-0008 and ADR-0009 (see `ADR-018`). What it orchestrates is real:
 * every open repair, ranked by what the workshop can actually act on.
 *
 * ── WHY THIS IS NOT THE STAGING BOARD ──────────────────────────────────────
 *
 * The board shows WHERE each car is. This shows WHAT TO DO, and crucially WHO
 * IS BEING WAITED ON — a distinction the board cannot make, because a card
 * parked in `awaiting_customer_approval` and one parked in `repair_in_progress`
 * look equally busy sitting in their columns. One of them nobody in the
 * workshop can move by trying harder; the other is somebody's job today.
 */
interface OrchestrationRow {
  id: string;
  jobNumber: string;
  registrationNumber: string;
  customerName: string;
  stage: string;
  stalledDays: number;
  action: string;
  ownerRole: string;
  waitingOn: 'workshop' | 'customer' | 'supplier' | 'nobody';
}

const WAITING_LABEL: Record<string, { text: string; kind: 'active' | 'attention' | 'blocked' | 'draft' }> = {
  workshop: { text: 'Ours to do', kind: 'active' },
  customer: { text: 'Waiting on customer', kind: 'attention' },
  supplier: { text: 'Waiting on supplier', kind: 'blocked' },
  nobody: { text: 'Nothing outstanding', kind: 'draft' },
};

/** Humanised without a second role vocabulary: the API's role names are snake
 *  case, and this only reformats them rather than re-deciding what they mean. */
function role(name: string): string {
  const s = name.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function OrchestrationPanel() {
  return (
    <Suspense fallback={<LoadingState label="Working out what needs doing…" />}>
      <Panel />
    </Suspense>
  );
}

async function Panel() {
  const result = await apiGet<OrchestrationRow[]>('workshop', '/job-cards/orchestration');

  // Silent on failure or when there is nothing open. This renders ABOVE a report
  // that stands on its own, so an error block here would put a failure notice on
  // top of a working screen — and "no open repairs" is not news worth a panel.
  if (!result.ok || result.data.length === 0) return null;

  return (
    <section style={{ marginBottom: primitive.space[6] }}>
      <h2 style={{ margin: `0 0 ${primitive.space[1]} 0`, fontSize: primitive.fontSize.lg, color: themeVar.textPrimary }}>
        What needs doing next
      </h2>
      <p style={{ margin: `0 0 ${primitive.space[3]} 0`, color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
        Every open repair, with the work this workshop can act on first. Longest
        stalled at the top of each group.
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: primitive.space[3] }}>
        {result.data.map((r) => {
          const w = WAITING_LABEL[r.waitingOn] ?? WAITING_LABEL['workshop']!;
          return (
            <li
              key={r.id}
              style={{
                border: `1px solid ${themeVar.borderDefault}`,
                borderRadius: primitive.radius.lg,
                padding: primitive.space[4],
                background: themeVar.surfaceRaised,
              }}
            >
              <div style={{ display: 'flex', gap: primitive.space[3], alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: primitive.fontFamily.mono, fontWeight: 600, color: themeVar.textPrimary }}>
                  {r.registrationNumber}
                </span>
                <span style={{ color: themeVar.textSecondary }}>
                  {r.jobNumber} · {r.customerName}
                </span>
                <span style={{ marginLeft: 'auto' }}>
                  <StatusBadge kind={w.kind} label={w.text} />
                </span>
              </div>

              <p style={{ margin: `${primitive.space[2]} 0 0 0`, color: themeVar.textPrimary }}>
                {r.action}
              </p>

              <p style={{ margin: `${primitive.space[1]} 0 0 0`, color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
                {role(r.ownerRole)}
                {/* Days SINCE IT LAST MOVED, not since it opened — a three-week
                    repair that moved this morning is healthy, and a two-day one
                    that has not moved in two days is not. Hidden at 0 rather
                    than reading "0 days", which looks like a measurement failure. */}
                {r.stalledDays > 0
                  ? ` · no movement for ${r.stalledDays} day${r.stalledDays === 1 ? '' : 's'}`
                  : ''}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
