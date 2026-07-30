import { Suspense } from 'react';
import Link from 'next/link';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState, StatusBadge, visuallyHidden } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { navLabelFor } from './nav-label';
import { STAGE_LABEL } from './staging-board-screen';
import { PrepareProposalForm } from './prepare-proposal-form';
import { PROPOSAL_STATUS_KIND, PROPOSAL_STATUS_LABEL, formatMoney } from './proposal-labels';

/**
 * The customer-proposal queue — `1.txt` §396-§424, `07.txt` §7. Three workshop routes:
 *
 *   §34 default  `/solution-and-approval/customer-proposals`  "Customer Proposals"
 *   §46 owner    `/repair-control/customer-approval`          "Customer Approval"
 *   §47 manager  `/customer-approval/pending-approvals`       "Pending Approvals"
 *
 * The fourth `repair-proposals` item in `workspaces.ts` belongs to the CUSTOMER
 * workspace — a different app (`customer-web`), where the vehicle owner answers for
 * themselves. This slice gives the workshop the record and lets reception capture a
 * decision taken by telephone or in person, which §7 requires in any case since it
 * offers voice and video channels.
 *
 * ── "WITH THE CUSTOMER" IS THE COLUMN THIS QUEUE EXISTS FOR ────────────────
 *
 * §7 says repair work shall not start until the required approval is received, so a
 * proposal sitting unanswered is a car sitting in a bay. And unlike every other queue
 * in Phase 5, nobody INSIDE the workshop is chasing it — which is exactly why it needs
 * to be impossible to miss. Issued proposals sort first.
 */

interface JobCard {
  id: string;
  jobNumber: string;
  customerName: string;
  registrationNumber: string;
  vehicleDescription: string;
  stage: string;
}

interface Proposal {
  id: string;
  jobCardId: string;
  versionNo: number;
  status: 'draft' | 'issued' | 'approved' | 'declined' | 'changes_requested' | 'superseded';
  issuedAt: string | null;
  decidedByName: string | null;
  decisionChannelLabel: string | null;
  agreedTotal: number | null;
  presentation: { currency: string; recommendedTotal: number; comprehensiveTotal: number };
  editable: boolean;
  decidable: boolean;
}

/** The stages at which a proposal is the work in hand. */
const QUEUE_STAGES = ['quotation_preparation', 'awaiting_customer_approval'];

export async function ProposalQueueScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Customer Proposals');
  return (
    <>
      <PageHeader
        title={title}
        description="What the customer has been shown, and what they said. A proposal presents an approved quotation; once the customer approves it, §424 makes it immutable and any material change needs a new version."
      />
      <Suspense fallback={<LoadingState label="Loading the proposal queue…" />}>
        <Queue route={route} />
      </Suspense>
    </>
  );
}

async function Queue({ route }: { route: string }) {
  const [cardsResult, proposalsResult] = await Promise.all([
    apiGet<JobCard[]>('workshop', '/job-cards'),
    apiGet<Proposal[]>('workshop', '/proposals'),
  ]);
  if (!cardsResult.ok) return <ApiFailure reason={cardsResult.reason} workspaceId="workshop" />;
  if (!proposalsResult.ok) return <ApiFailure reason={proposalsResult.reason} workspaceId="workshop" />;

  // Newest VERSION per card — the API orders by `version_no DESC`, its stated contract.
  const currentByCard = new Map<string, Proposal>();
  const versionsByCard = new Map<string, number>();
  for (const p of proposalsResult.data) {
    versionsByCard.set(p.jobCardId, (versionsByCard.get(p.jobCardId) ?? 0) + 1);
    if (!currentByCard.has(p.jobCardId)) currentByCard.set(p.jobCardId, p);
  }

  const rows = cardsResult.data
    .filter((c) => QUEUE_STAGES.includes(c.stage) || currentByCard.has(c.id))
    .sort((a, b) => rank(currentByCard.get(a.id)) - rank(currentByCard.get(b.id)));

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No customer proposals"
        description="A vehicle appears here once its job card reaches quotation preparation and a quotation has been approved internally. Approve a quotation on the Quotations screen first."
      />
    );
  }

  const waiting = rows.filter((c) => currentByCard.get(c.id)?.status === 'issued').length;
  const needsAction = rows.filter((c) => {
    const s = currentByCard.get(c.id)?.status;
    return s === 'declined' || s === 'changes_requested';
  }).length;

  return (
    <>
      {waiting > 0 || needsAction > 0 ? (
        <p
          role="status"
          style={{
            margin: `0 0 ${primitive.space[3]} 0`,
            color: themeVar.textPrimary,
            fontSize: primitive.fontSize.sm,
            fontWeight: 600,
          }}
        >
          {/* Named in words, not implied by badge colour (§66) — and both numbers,
              because they need different people to act. */}
          {waiting > 0 ? `${waiting} proposal(s) waiting on the customer. ` : ''}
          {needsAction > 0 ? `${needsAction} need the workshop to respond.` : ''}
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
            Customer proposals, their version, what the customer decided and what they agreed to pay
          </caption>
          <thead>
            <tr>
              {['Job', 'Vehicle', 'Customer', 'Stage', 'Proposal', 'Price', 'Action'].map((h) => (
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
              const p = currentByCard.get(card.id);
              const versions = versionsByCard.get(card.id) ?? 0;
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
                  <td style={cell}>{card.customerName}</td>
                  <td style={cell}>{STAGE_LABEL[card.stage] ?? card.stage}</td>
                  <td style={cell}>
                    {p ? (
                      <>
                        <StatusBadge
                          kind={PROPOSAL_STATUS_KIND[p.status] ?? 'draft'}
                          label={PROPOSAL_STATUS_LABEL[p.status] ?? p.status}
                        />
                        <div style={{ color: themeVar.textSecondary, marginTop: primitive.space[1] }}>
                          {/* §424's version history, stated. "Version 3" with no "of 3"
                              hides that two earlier offers were made and answered. */}
                          Version {p.versionNo}
                          {versions > 1 ? ` of ${versions}` : null}
                          {p.decidedByName ? ` · ${p.decidedByName}` : null}
                          {p.decisionChannelLabel ? ` (${p.decisionChannelLabel})` : null}
                        </div>
                      </>
                    ) : (
                      <span style={{ color: themeVar.textSecondary }}>Not started</span>
                    )}
                  </td>
                  <td style={cell}>
                    {p ? (
                      <>
                        <strong style={{ fontFamily: primitive.fontFamily.mono }}>
                          {/* Once decided, show what they AGREED to, not what was
                              offered — those differ whenever the customer took the
                              recommended tier over the comprehensive one. */}
                          {formatMoney(
                            p.agreedTotal ?? p.presentation.recommendedTotal,
                            p.presentation.currency,
                          )}
                        </strong>
                        {p.agreedTotal === null &&
                        p.presentation.comprehensiveTotal > p.presentation.recommendedTotal ? (
                          <div style={{ color: themeVar.textSecondary }}>
                            up to{' '}
                            {formatMoney(p.presentation.comprehensiveTotal, p.presentation.currency)}{' '}
                            with extras
                          </div>
                        ) : null}
                        {p.agreedTotal !== null ? (
                          <div style={{ color: themeVar.textSecondary }}>agreed</div>
                        ) : null}
                      </>
                    ) : (
                      <span style={{ color: themeVar.textSecondary }}>—</span>
                    )}
                  </td>
                  <td style={cell}>
                    {p ? (
                      <>
                        <Link
                          href={`${route}/${p.id}`}
                          style={{ color: primitive.color.blue[600], fontWeight: 600 }}
                        >
                          {/* The link names the JOB and the verb reflects what this
                              viewer can do — a column of identical "View" links is
                              indistinguishable to a screen reader (§66). */}
                          {p.decidable ? 'Record decision on' : p.editable ? 'Write' : 'View'}{' '}
                          proposal for {card.jobNumber}
                        </Link>
                        {/* The route to §424's new version, offered only where the API
                            would accept it: the current version has been ANSWERED and
                            was not an approval. A wall here would be the
                            unreachable-alternative trap, since the refusal on an
                            answered proposal says to prepare a new version. */}
                        {(p.status === 'declined' || p.status === 'changes_requested') &&
                        QUEUE_STAGES.includes(card.stage) ? (
                          <div style={{ marginTop: primitive.space[2] }}>
                            <PrepareProposalForm
                              jobCardId={card.id}
                              jobNumber={card.jobNumber}
                              label="Prepare a new version"
                            />
                          </div>
                        ) : null}
                      </>
                    ) : QUEUE_STAGES.includes(card.stage) ? (
                      <PrepareProposalForm jobCardId={card.id} jobNumber={card.jobNumber} />
                    ) : (
                      <span style={{ color: themeVar.textSecondary }}>
                        Move the card to quotation preparation first
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
        The customer answers here through a member of staff — in person, by telephone or
        by email — and the channel is recorded against the decision. Self-service
        approval in the customer app, the 3D before-and-after presentation, and recorded
        audio or video explanations are later phases; the record they will write is this
        same one.
      </p>
    </>
  );
}

/** Waiting on the customer first, then what the workshop must answer, then settled. */
function rank(p: Proposal | undefined): number {
  switch (p?.status) {
    case 'issued':
      return 0;
    case 'changes_requested':
      return 1;
    case 'declined':
      return 2;
    case 'draft':
      return 3;
    case 'approved':
      return 5;
    default:
      return 4;
  }
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
