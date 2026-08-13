import { Suspense } from 'react';
import Link from 'next/link';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState, StatusBadge, visuallyHidden } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { navLabelFor } from './nav-label';
import { STAGE_LABEL } from './staging-board-screen';
import { StartRepairForm } from './start-repair-form';
import { EXECUTION_STATUS_KIND, EXECUTION_STATUS_LABEL, formatHours } from './execution-labels';

/**
 * Repairs under way — `07.txt` §31-§33. SIX workshop routes:
 *
 *   §34 default  `/repair-services/repairs-in-progress`  "Repairs in Progress"
 *   §46 owner    `/repair-control/repairs-in-progress`   "Repairs in Progress"
 *   §47 manager  `/repair-control/repair-progress`       "Repair Progress"
 *   §49 technician `/record-work/repair-tasks`           "Repair Tasks"
 *                  `/record-work/time-records`           "Time Records"
 *                  `/record-work/parts-used`             "Parts Used"
 *                  `/record-work/repair-evidence`        "Repair Evidence"
 *
 * ⚠️ THE TECHNICIAN TREE SPLITS ONE RECORD INTO FOUR ITEMS, and they are FACETS of the
 * same execution rather than four records. §33 links time to the job, the task, the
 * technician, the bay and the stage — so a "Time Records" screen that could not show
 * which task the time was against would be useless, and a "Parts Used" screen divorced
 * from the tasks could not say which one the part was for. One screen carrying all four
 * is what the specification actually describes; four disconnected pages would be the
 * "disconnected mock pages" `05.txt` §2 forbids.
 *
 * The heading comes from `navLabelFor`, so each entry keeps its own word for it.
 */

interface JobCard {
  id: string;
  jobNumber: string;
  customerName: string;
  registrationNumber: string;
  vehicleDescription: string;
  stage: string;
  assignedTechnicianName: string | null;
}

interface Execution {
  id: string;
  jobCardId: string;
  attemptNo: number;
  status: 'in_progress' | 'completed' | 'abandoned';
  serviceBay: string | null;
  tasks: unknown[];
  completedTaskCount: number;
  outstandingTaskCount: number;
  productiveHours: number;
  nonProductiveHours: number;
  estimatedHours: number;
  runningEntryCount: number;
  partsUsed: unknown[];
  evidence: unknown[];
  editable: boolean;
}

/** The stages at which a repair is being carried out. */
const QUEUE_STAGES = ['authorized_to_start', 'repair_in_progress'];

export async function ExecutionQueueScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Repairs in Progress');
  return (
    <>
      <PageHeader
        title={title}
        description="Vehicles being worked on. A repair cannot start until the customer has approved a proposal, and cannot be completed while an approved task is unfinished or somebody is still clocked on."
      />
      <Suspense fallback={<LoadingState label="Loading the repairs…" />}>
        <Queue route={route} />
      </Suspense>
    </>
  );
}

async function Queue({ route }: { route: string }) {
  const [cardsResult, execResult] = await Promise.all([
    apiGet<JobCard[]>('workshop', '/job-cards'),
    apiGet<Execution[]>('workshop', '/repair-executions'),
  ]);
  if (!cardsResult.ok) return <ApiFailure reason={cardsResult.reason} workspaceId="workshop" />;
  if (!execResult.ok) return <ApiFailure reason={execResult.reason} workspaceId="workshop" />;

  // Newest attempt per card — the API orders by `attempt_no DESC`, its stated contract.
  const currentByCard = new Map<string, Execution>();
  for (const e of execResult.data) {
    if (!currentByCard.has(e.jobCardId)) currentByCard.set(e.jobCardId, e);
  }

  const rows = cardsResult.data
    .filter((c) => QUEUE_STAGES.includes(c.stage) || currentByCard.has(c.id))
    .sort((a, b) => rank(currentByCard.get(a.id)) - rank(currentByCard.get(b.id)));

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No repairs under way"
        description="A vehicle appears here once its job card is authorised to start, which follows the customer approving a proposal. Record a customer decision on the Customer Proposals screen first."
      />
    );
  }

  const running = rows.reduce((n, c) => n + (currentByCard.get(c.id)?.runningEntryCount ?? 0), 0);
  const blocked = rows.filter((c) => {
    const e = currentByCard.get(c.id);
    return e?.status === 'in_progress' && e.outstandingTaskCount > 0 && e.runningEntryCount === 0;
  }).length;

  return (
    <>
      {running > 0 || blocked > 0 ? (
        <p
          role="status"
          style={{
            margin: `0 0 ${primitive.space[3]} 0`,
            color: themeVar.textPrimary,
            fontSize: primitive.fontSize.sm,
            fontWeight: 600,
          }}
        >
          {/* Both numbers, in words — they need different people. A running clock at the
              end of a shift is money; a stalled job is a car nobody is touching. */}
          {running > 0 ? `${running} clock(s) currently running. ` : ''}
          {blocked > 0 ? `${blocked} repair(s) with work outstanding and nobody clocked on.` : ''}
        </p>
      ) : null}

      <div style={{ overflowX: 'auto', maxWidth: '100%', minWidth: 0 }}>
        <table
          style={{
            width: '100%',
            minWidth: '58rem',
            borderCollapse: 'collapse',
            fontSize: primitive.fontSize.sm,
          }}
        >
          <caption style={visuallyHidden}>
            Repairs under way, with tasks done, time booked, parts fitted and evidence recorded
          </caption>
          <thead>
            <tr>
              {['Job', 'Vehicle', 'Technician', 'Stage', 'Repair', 'Progress', 'Time', 'Action'].map(
                (h) => (
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
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((card) => {
              const e = currentByCard.get(card.id);
              return (
                <tr key={card.id}>
                  <td style={cell}>
                    <span style={{ fontFamily: primitive.fontFamily.mono, fontWeight: 600 }}>
                      {card.jobNumber}
                    </span>
                  </td>
                  <td style={cell}>
                    <span style={{ fontFamily: primitive.fontFamily.mono }}>
                      {card.registrationNumber}
                    </span>
                    <br />
                    <span style={{ color: themeVar.textSecondary }}>{card.vehicleDescription}</span>
                  </td>
                  <td style={cell}>{card.assignedTechnicianName ?? '—'}</td>
                  <td style={cell}>{STAGE_LABEL[card.stage] ?? card.stage}</td>
                  <td style={cell}>
                    {e ? (
                      <>
                        <StatusBadge
                          kind={EXECUTION_STATUS_KIND[e.status] ?? 'draft'}
                          label={EXECUTION_STATUS_LABEL[e.status] ?? e.status}
                        />
                        <div style={{ color: themeVar.textSecondary, marginTop: primitive.space[1] }}>
                          Attempt {e.attemptNo}
                          {e.serviceBay ? ` · ${e.serviceBay}` : null}
                        </div>
                      </>
                    ) : (
                      <span style={{ color: themeVar.textSecondary }}>Not started</span>
                    )}
                  </td>
                  <td style={cell}>
                    {e ? (
                      <>
                        <div style={{ color: themeVar.textPrimary, fontWeight: 600 }}>
                          {e.completedTaskCount} of {e.tasks.length} task(s)
                        </div>
                        {e.outstandingTaskCount > 0 && e.status === 'in_progress' ? (
                          <div style={{ color: themeVar.textSecondary }}>
                            {e.outstandingTaskCount} outstanding
                          </div>
                        ) : null}
                        {e.partsUsed.length > 0 || e.evidence.length > 0 ? (
                          <div style={{ color: themeVar.textSecondary }}>
                            {e.partsUsed.length} part(s) · {e.evidence.length} evidence
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <span style={{ color: themeVar.textSecondary }}>—</span>
                    )}
                  </td>
                  <td style={cell}>
                    {e ? (
                      <>
                        <span style={{ fontFamily: primitive.fontFamily.mono }}>
                          {formatHours(e.productiveHours)}
                        </span>
                        {/* The estimate beside the actual, because that comparison is
                            the whole reason a workshop books time — but §33 forbids
                            DEPENDING on it, so nothing here gates on the difference. */}
                        {e.estimatedHours > 0 ? (
                          <div style={{ color: themeVar.textSecondary }}>
                            of {formatHours(e.estimatedHours)} planned
                          </div>
                        ) : null}
                        {e.nonProductiveHours > 0 ? (
                          <div style={{ color: themeVar.textSecondary }}>
                            + {formatHours(e.nonProductiveHours)} lost
                          </div>
                        ) : null}
                        {e.runningEntryCount > 0 ? (
                          // Not colour alone (§66) — the word carries it.
                          <div style={{ color: primitive.color.red[700], fontWeight: 600 }}>
                            clock running
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <span style={{ color: themeVar.textSecondary }}>—</span>
                    )}
                  </td>
                  <td style={cell}>
                    {e ? (
                      <Link
                        href={`${route}/${e.id}`}
                        style={{ color: primitive.color.blue[600], fontWeight: 600 }}
                      >
                        {/* The verb reflects what this viewer can do; the job number
                            makes a column of links distinguishable to a screen reader. */}
                        {e.editable ? 'Record work on' : 'View'} repair for {card.jobNumber}
                      </Link>
                    ) : QUEUE_STAGES.includes(card.stage) ? (
                      <StartRepairForm jobCardId={card.id} jobNumber={card.jobNumber} />
                    ) : (
                      <span style={{ color: themeVar.textSecondary }}>
                        Awaiting authorisation to start
                      </span>
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
        {/* `05.txt` §2 forbids disconnected mock pages, so the absent capabilities are
            NAMED rather than shown as disabled controls. */}
        Photographs and video are recorded here by description and reference — file upload
        needs the MinIO path, which is a later slice. Chargeable additional work found
        during a repair must be raised as a VARIATION (a new quotation and a new proposal
        version) rather than simply carried out; the variation link itself is slice 7b.
        Post-repair testing is slice 8 and quality control is slice 9.
      </p>
    </>
  );
}

/** Clock running first — it costs money. Then stalled work, then not started. */
function rank(e: Execution | undefined): number {
  if (e?.status === 'in_progress' && e.runningEntryCount > 0) return 0;
  if (e?.status === 'in_progress' && e.outstandingTaskCount > 0) return 1;
  if (e?.status === 'in_progress') return 2;
  if (!e) return 3;
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
