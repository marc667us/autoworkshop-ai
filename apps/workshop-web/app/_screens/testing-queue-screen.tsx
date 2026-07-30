import { Suspense } from 'react';
import Link from 'next/link';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState, StatusBadge, visuallyHidden } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { navLabelFor } from './nav-label';
import { STAGE_LABEL } from './staging-board-screen';
import { StartTestSessionForm } from './start-test-session-form';
import { TEST_SESSION_STATUS_KIND, TEST_SESSION_STATUS_LABEL } from './testing-labels';

/**
 * Post-repair testing — `07.txt` §34-§36. Seven workshop routes:
 *
 *   §34 default  `/repair-services/testing`     · §46 owner `/repair-control/testing`
 *   §47 manager  `/repair-control/testing-queue`
 *   §49 technician `/testing/repair-test-results` · `/testing/post-repair-scan`
 *                  `/testing/road-test`           · `/testing/submit-to-quality-control`
 *
 * ⚠️ THE TECHNICIAN TREE SPLITS ONE SESSION INTO FOUR ENTRIES, and they are FACETS of
 * the same record. §35's scan and §36's road test are both part of the evidence one
 * quality-control inspector reads in one sitting — four disconnected pages would be
 * exactly what `05.txt` §2 forbids, and a "Submit to Quality Control" page that could
 * not show what is being submitted would be worse than none.
 */

interface JobCard {
  id: string;
  jobNumber: string;
  customerName: string;
  registrationNumber: string;
  vehicleDescription: string;
  stage: string;
}

interface Session {
  id: string;
  jobCardId: string;
  attemptNo: number;
  status: 'in_progress' | 'submitted';
  results: unknown[];
  passCount: number;
  failCount: number;
  scanPerformed: boolean;
  criticalFaultsRemain: boolean;
  overrideApprovedByName: string | null;
  roadTestPerformed: boolean;
  roadTestDistance: number | null;
  editable: boolean;
}

/** The stages at which a car is being tested. */
const QUEUE_STAGES = ['repair_in_progress', 'testing'];

export async function TestingQueueScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Testing');
  return (
    <>
      <PageHeader
        title={title}
        description="Vehicles being tested after repair. §35: a repair cannot go to quality control with an unresolved critical fault unless somebody accountable has approved the release and said why."
      />
      <Suspense fallback={<LoadingState label="Loading the testing queue…" />}>
        <Queue route={route} />
      </Suspense>
    </>
  );
}

async function Queue({ route }: { route: string }) {
  const [cardsResult, sessionsResult] = await Promise.all([
    apiGet<JobCard[]>('workshop', '/job-cards'),
    apiGet<Session[]>('workshop', '/test-sessions'),
  ]);
  if (!cardsResult.ok) return <ApiFailure reason={cardsResult.reason} workspaceId="workshop" />;
  if (!sessionsResult.ok) return <ApiFailure reason={sessionsResult.reason} workspaceId="workshop" />;

  // Newest attempt per card — the API orders by `attempt_no DESC`, its stated contract.
  const currentByCard = new Map<string, Session>();
  for (const s of sessionsResult.data) {
    if (!currentByCard.has(s.jobCardId)) currentByCard.set(s.jobCardId, s);
  }

  const rows = cardsResult.data
    .filter((c) => QUEUE_STAGES.includes(c.stage) || currentByCard.has(c.id))
    .sort((a, b) => rank(currentByCard.get(a.id)) - rank(currentByCard.get(b.id)));

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing waiting on testing"
        description="A vehicle appears here once its repair is completed. Finish a repair on the Repairs in Progress screen first."
      />
    );
  }

  const blocked = rows.filter((c) => {
    const s = currentByCard.get(c.id);
    return s?.status === 'in_progress' && s.criticalFaultsRemain && s.overrideApprovedByName === null;
  }).length;
  const failing = rows.filter((c) => (currentByCard.get(c.id)?.failCount ?? 0) > 0).length;

  return (
    <>
      {blocked > 0 || failing > 0 ? (
        <p
          role="status"
          style={{
            margin: `0 0 ${primitive.space[3]} 0`,
            color: themeVar.textPrimary,
            fontSize: primitive.fontSize.sm,
            fontWeight: 600,
          }}
        >
          {/* Both numbers, in words (§66) — they need different people. */}
          {blocked > 0
            ? `${blocked} vehicle(s) have an unresolved critical fault awaiting a documented release approval. `
            : ''}
          {failing > 0 ? `${failing} have at least one failed test.` : ''}
        </p>
      ) : null}

      <div style={{ overflowX: 'auto', maxWidth: '100%', minWidth: 0 }}>
        <table
          style={{
            width: '100%',
            minWidth: '56rem',
            borderCollapse: 'collapse',
            fontSize: primitive.fontSize.sm,
          }}
        >
          <caption style={visuallyHidden}>
            Vehicles being tested after repair, with results, the post-repair scan and the road test
          </caption>
          <thead>
            <tr>
              {['Job', 'Vehicle', 'Customer', 'Stage', 'Session', 'Results', 'Scan', 'Action'].map((h) => (
                <th
                  key={h}
                  scope="col"
                  style={{
                    textAlign: 'left',
                    padding: primitive.space[2],
                    borderBottom: `1px solid ${themeVar.borderDefault}`,
                    color: themeVar.textSecondary,
                    fontWeight: 600,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((card) => {
              const s = currentByCard.get(card.id);
              return (
                <tr key={card.id}>
                  <td style={cell}>
                    <span style={{ fontFamily: primitive.fontFamily.mono, fontWeight: 600 }}>
                      {card.jobNumber}
                    </span>
                  </td>
                  <td style={cell}>
                    <span style={{ fontFamily: primitive.fontFamily.mono }}>{card.registrationNumber}</span>
                    <br />
                    <span style={{ color: themeVar.textSecondary }}>{card.vehicleDescription}</span>
                  </td>
                  <td style={cell}>{card.customerName}</td>
                  <td style={cell}>{STAGE_LABEL[card.stage] ?? card.stage}</td>
                  <td style={cell}>
                    {s ? (
                      <>
                        <StatusBadge
                          kind={TEST_SESSION_STATUS_KIND[s.status] ?? 'draft'}
                          label={TEST_SESSION_STATUS_LABEL[s.status] ?? s.status}
                        />
                        <div style={{ color: themeVar.textSecondary, marginTop: primitive.space[1] }}>
                          Attempt {s.attemptNo}
                          {s.roadTestPerformed && s.roadTestDistance !== null
                            ? ` · road test ${s.roadTestDistance} mi`
                            : null}
                        </div>
                      </>
                    ) : (
                      <span style={{ color: themeVar.textSecondary }}>Not started</span>
                    )}
                  </td>
                  <td style={cell}>
                    {s ? (
                      s.results.length === 0 ? (
                        // Said out loud: an empty cell reads as "all fine" when it means
                        // nothing has been tested, and submission is refused in this state.
                        <span style={{ color: themeVar.textSecondary }}>None recorded yet</span>
                      ) : (
                        <>
                          <div style={{ color: themeVar.textPrimary }}>{s.passCount} passed</div>
                          {s.failCount > 0 ? (
                            // Not colour alone (§66) — the word carries it.
                            <div style={{ color: primitive.color.red[700], fontWeight: 600 }}>
                              {s.failCount} failed
                            </div>
                          ) : null}
                        </>
                      )
                    ) : (
                      <span style={{ color: themeVar.textSecondary }}>—</span>
                    )}
                  </td>
                  <td style={cell}>
                    {s ? (
                      s.criticalFaultsRemain ? (
                        <>
                          <div style={{ color: primitive.color.red[700], fontWeight: 600 }}>
                            Critical fault remains
                          </div>
                          <div style={{ color: themeVar.textSecondary }}>
                            {/* §35 in one line: either it is approved by somebody, or it
                                is blocking. */}
                            {s.overrideApprovedByName
                              ? `release approved by ${s.overrideApprovedByName}`
                              : 'needs a documented approval'}
                          </div>
                        </>
                      ) : s.scanPerformed ? (
                        <span style={{ color: themeVar.textSecondary }}>Clear</span>
                      ) : (
                        <span style={{ color: themeVar.textSecondary }}>Not scanned</span>
                      )
                    ) : (
                      <span style={{ color: themeVar.textSecondary }}>—</span>
                    )}
                  </td>
                  <td style={cell}>
                    {s ? (
                      <Link
                        href={`${route}/${s.id}`}
                        style={{ color: primitive.color.blue[600], fontWeight: 600 }}
                      >
                        {s.editable ? 'Record tests for' : 'View tests for'} {card.jobNumber}
                      </Link>
                    ) : QUEUE_STAGES.includes(card.stage) ? (
                      <StartTestSessionForm jobCardId={card.id} jobNumber={card.jobNumber} />
                    ) : (
                      <span style={{ color: themeVar.textSecondary }}>Finish the repair first</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p
        style={{
          marginTop: primitive.space[4],
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.sm,
        }}
      >
        {/* `05.txt` §2 forbids disconnected mock pages, so what is absent is NAMED. */}
        Fault codes are typed here rather than read from a scan tool — OBD integration and
        the fault-code library are Phase 9. The independent quality-control inspection
        that answers a submitted session is slice 9, and `2.txt` §563 requires it to be
        carried out by somebody who did not do the work.
      </p>
    </>
  );
}

/** Blocked by §35 first — it is the only state that stops a car being released. */
function rank(s: Session | undefined): number {
  if (s?.status === 'in_progress' && s.criticalFaultsRemain && s.overrideApprovedByName === null) return 0;
  if (s?.status === 'in_progress' && s.failCount > 0) return 1;
  if (s?.status === 'in_progress') return 2;
  if (!s) return 3;
  return 4;
}

const cell = {
  padding: primitive.space[2],
  borderBottom: `1px solid ${themeVar.borderDefault}`,
  color: themeVar.textPrimary,
  verticalAlign: 'top' as const,
  // LOAD-BEARING: a positioned ancestor stops an absolutely-positioned descendant
  // escaping this scroll container and stretching the document.
  position: 'relative' as const,
};
