import { Suspense } from 'react';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { EmptyState, LoadingState, PageHeader } from '@autoworkshop/ui';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import { customerStage } from './repair-journey';

/**
 * /my-vehicles/service-history — `01 (1).txt` §33.
 *
 * ── WHY THIS IS NOT JUST `completed-repairs` WITH A DIFFERENT TITLE ─────────
 *
 * `completed-repairs` answers "what work has this workshop finished for me",
 * newest first, across everything. This answers a different question — "what has
 * been done to THIS car" — and the grouping is the whole point: someone selling
 * a vehicle, or deciding whether a fault has recurred, is reading one car's
 * record, not a chronological feed of all of them.
 *
 * `CURRENT_PHASE.md` recorded service history as blocked on "needs completed
 * jobs". That was true when nothing could reach `completed`; the lifecycle and
 * the stage transitions have both shipped since, so the blocker is gone and this
 * is buildable from the same `/job-cards` read every other customer screen uses.
 *
 * ⚠️ SCOPING IS THE API'S, NOT THIS FILE'S. `JobCardService.list` narrows a
 * `customer` viewer to their own vehicles and RLS isolates the tenant. Grouping
 * here is presentation (CLAUDE.md §8).
 */

export const dynamic = 'force-dynamic';

/** Field names taken from `JobCard` in the API — never guessed. */
interface JobCardRow {
  id: string;
  jobNumber: string;
  vehicleId: string;
  registrationNumber: string;
  vehicleDescription: string;
  complaint: string;
  stage: string;
  openedAt: string;
  closedAt: string | null;
  mileageAtIntake: number | null;
}

function when(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function ServiceHistoryScreen() {
  return (
    <>
      <PageHeader
        title="Service History"
        /*
          ⚠️ THE COPY NAMES EXACTLY WHAT IS ON THE PAGE. It used to say
          "everything this workshop has done", and the page renders the
          complaint, job number, date and intake mileage — NOT the work carried
          out, the parts fitted or the warranty terms, none of which this
          endpoint returns. Someone reading it for a resale or a recurring fault
          would have taken an incomplete record as a complete one. Widening the
          data is its own slice (it needs an execution/parts summary endpoint);
          overclaiming in the meantime is the defect. (Codex, 2026-08-04.)
        */
        description="A dated record of the repairs this workshop has completed on each of your vehicles, newest first. Ask the workshop for the full job detail — parts fitted, work carried out and warranty terms."
      />
      <Suspense fallback={<LoadingState label="Loading your service history…" />}>
        <History />
      </Suspense>
    </>
  );
}

async function History() {
  const result = await apiGet<JobCardRow[]>('customer', '/job-cards');
  if (!result.ok) return <ApiFailure reason={result.reason} workspaceId="customer" />;

  // Finished work only. An in-flight repair belongs on Repair Tracking; putting
  // it in a HISTORY would let someone quote an unfinished job as work done.
  const done = result.data.filter((c) => customerStage(c.stage).phase === 'finished');

  if (done.length === 0) {
    return (
      <EmptyState
        title="No completed work yet"
        description="Once this workshop finishes a repair on one of your vehicles, it is recorded here permanently."
      />
    );
  }

  // Group by vehicle, keeping the vehicle whose most recent work is newest at
  // the top — a Map preserves insertion order, so the sort has to happen first.
  const ordered = [...done].sort(
    (a, b) =>
      new Date(b.closedAt ?? b.openedAt).getTime() - new Date(a.closedAt ?? a.openedAt).getTime(),
  );

  const byVehicle = new Map<string, JobCardRow[]>();
  for (const card of ordered) {
    const list = byVehicle.get(card.vehicleId);
    if (list) list.push(card);
    else byVehicle.set(card.vehicleId, [card]);
  }

  return (
    <div style={{ display: 'grid', gap: primitive.space[8] }}>
      {[...byVehicle.values()].map((cards) => {
        const first = cards[0];
        // Cannot happen — a Map entry only exists because a card was pushed into
        // it — but `noUncheckedIndexedAccess` is right to insist, and returning
        // null degrades to one missing section rather than a crashed page.
        if (!first) return null;
        return (
          <section key={first.vehicleId}>
            <h2
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: primitive.space[3],
                alignItems: 'baseline',
                margin: `0 0 ${primitive.space[3]}`,
                fontSize: primitive.fontSize.lg,
              }}
            >
              <span
                style={{
                  // §2845 — read out character by character.
                  fontFamily: primitive.fontFamily.mono,
                  letterSpacing: '0.04em',
                }}
              >
                {first.registrationNumber}
              </span>
              <span
                style={{
                  color: themeVar.textSecondary,
                  fontSize: primitive.fontSize.sm,
                  fontWeight: 400,
                }}
              >
                {first.vehicleDescription} · {cards.length}{' '}
                {cards.length === 1 ? 'completed repair' : 'completed repairs'}
              </span>
            </h2>

            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: primitive.space[3] }}>
              {cards.map((c) => (
                <li
                  key={c.id}
                  style={{
                    border: `1px solid ${themeVar.borderDefault}`,
                    borderRadius: primitive.radius.lg,
                    padding: primitive.space[4],
                    background: themeVar.surfaceRaised,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: primitive.space[3],
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                    }}
                  >
                    <strong>{when(c.closedAt ?? c.openedAt)}</strong>
                    <span
                      style={{
                        fontFamily: primitive.fontFamily.mono,
                        fontSize: primitive.fontSize.sm,
                        color: themeVar.textSecondary,
                      }}
                    >
                      {c.jobNumber}
                    </span>
                  </div>
                  <p style={{ margin: `${primitive.space[2]} 0 0`, fontSize: primitive.fontSize.sm }}>
                    {c.complaint}
                  </p>
                  {/*
                    Mileage AT INTAKE, and labelled as such. An unlabelled number
                    beside a service record reads as the current odometer, which
                    is the sort of thing that ends up in a sale listing.
                  */}
                  {c.mileageAtIntake !== null ? (
                    <p
                      style={{
                        margin: `${primitive.space[2]} 0 0`,
                        color: themeVar.textSecondary,
                        fontSize: primitive.fontSize.xs,
                      }}
                    >
                      {c.mileageAtIntake.toLocaleString('en-GB')} km when the vehicle came in
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
