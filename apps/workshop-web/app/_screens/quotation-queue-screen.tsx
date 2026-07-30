import { Suspense } from 'react';
import Link from 'next/link';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState, StatusBadge, visuallyHidden } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { navLabelFor } from './nav-label';
import { STAGE_LABEL } from './staging-board-screen';
import { PrepareQuotationForm } from './prepare-quotation-form';
import { QUOTATION_STATUS_KIND, QUOTATION_STATUS_LABEL, formatMoney } from './quotation-labels';

/**
 * The quotation queue — `07.txt` §9-§16, reached from THREE workshop routes:
 *
 *   §34 default  `/solution-and-approval/quotations`  "Quotations"
 *   §46 owner    `/repair-control/quotations`         "Quotations"
 *   §47 manager  `/customer-approval/quotations`      "Quotations"
 *
 * ⚠️ THE §49 TECHNICIAN TREE HAS NO QUOTATIONS ITEM, checked against
 * `packages/navigation/src/workspaces.ts` rather than assumed — and that is the
 * navigation agreeing with §50, which gives the technician no pricing role. Building a
 * fourth page would have created a route no tree points at AND contradicted the role
 * model. A technician can still READ a quotation for their own card through the API;
 * they simply have no menu entry that lists them.
 *
 * The other two `quotations` items in `workspaces.ts` belong to the CUSTOMER and FLEET
 * workspaces — different apps, and slice 6's territory.
 */

interface JobCard {
  id: string;
  jobNumber: string;
  customerName: string;
  registrationNumber: string;
  vehicleDescription: string;
  stage: string;
}

interface Quotation {
  id: string;
  jobCardId: string;
  attemptNo: number;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  currency: string;
  lines: unknown[];
  subtotal: number;
  total: number;
  validUntil: string | null;
  reviewedByName: string | null;
  editable: boolean;
  reviewable: boolean;
}

/**
 * The stages at which a quotation is the work in hand.
 *
 * `awaiting_customer_approval` is included because the lifecycle's route back is
 * `awaiting_customer_approval → solution_preparation`, so a job whose price the
 * customer queried still belongs on this queue — but the service refuses to PREPARE
 * one until the card is actually at `quotation_preparation`, and the row says so
 * rather than offering a button that fails.
 */
const QUEUE_STAGES = ['quotation_preparation', 'awaiting_customer_approval'];

export async function QuotationQueueScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Quotations');
  return (
    <>
      <PageHeader
        title={title}
        description="Vehicles waiting on a price. A quotation is generated from the approved repair plan — labour at the workshop rate, plus the parts the plan requires — and a submitted one waits on a manager who did not prepare it."
      />
      <Suspense fallback={<LoadingState label="Loading the quotation queue…" />}>
        <Queue route={route} />
      </Suspense>
    </>
  );
}

async function Queue({ route }: { route: string }) {
  // Independent calls in parallel — serialising them doubles the wait on a workshop
  // tablet, and the API's own scoping does the security work in both.
  const [cardsResult, quotesResult] = await Promise.all([
    apiGet<JobCard[]>('workshop', '/job-cards'),
    apiGet<Quotation[]>('workshop', '/quotations'),
  ]);

  if (!cardsResult.ok) return <ApiFailure reason={cardsResult.reason} workspaceId="workshop" />;
  if (!quotesResult.ok) return <ApiFailure reason={quotesResult.reason} workspaceId="workshop" />;

  // Newest attempt per card — the API orders by `attempt_no DESC`, which is its stated
  // contract, so the first seen is the current record.
  const currentByCard = new Map<string, Quotation>();
  for (const q of quotesResult.data) {
    if (!currentByCard.has(q.jobCardId)) currentByCard.set(q.jobCardId, q);
  }

  const rows = cardsResult.data
    .filter((c) => QUEUE_STAGES.includes(c.stage) || currentByCard.has(c.id))
    .sort((a, b) => rank(currentByCard.get(a.id)) - rank(currentByCard.get(b.id)));

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing waiting on a quotation"
        description="A vehicle appears here once its job card reaches quotation preparation, which follows an approved repair plan. Move a card on from solution preparation on the Repair Staging board."
      />
    );
  }

  const awaiting = rows.filter((c) => currentByCard.get(c.id)?.status === 'submitted').length;

  return (
    <>
      {awaiting > 0 ? (
        // Named in words, not implied by badge colour alone (§66).
        <p
          role="status"
          style={{
            margin: `0 0 ${primitive.space[3]} 0`,
            color: themeVar.textPrimary,
            fontSize: primitive.fontSize.sm,
            fontWeight: 600,
          }}
        >
          {awaiting} quotation(s) awaiting internal approval.
        </p>
      ) : null}

      {/* Wide table in its own scroll container — never the page body. `minWidth: 0` is
          the half that does the work inside a flex/grid ancestor. */}
      <div style={{ overflowX: 'auto', maxWidth: '100%', minWidth: 0 }}>
        <table
          style={{
            width: '100%',
            minWidth: '54rem',
            borderCollapse: 'collapse',
            fontSize: primitive.fontSize.sm,
          }}
        >
          <caption style={visuallyHidden}>
            Vehicles waiting on a price, with the state and total of each quotation
          </caption>
          <thead>
            <tr>
              {['Job', 'Vehicle', 'Customer', 'Stage', 'Quotation', 'Total', 'Action'].map((h) => (
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
              const q = currentByCard.get(card.id);
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
                    {q ? (
                      <>
                        <StatusBadge
                          kind={QUOTATION_STATUS_KIND[q.status] ?? 'draft'}
                          label={QUOTATION_STATUS_LABEL[q.status] ?? q.status}
                        />
                        <div style={{ color: themeVar.textSecondary, marginTop: primitive.space[1] }}>
                          Attempt {q.attemptNo} · {q.lines.length} line(s)
                          {q.reviewedByName ? ` · by ${q.reviewedByName}` : null}
                        </div>
                      </>
                    ) : (
                      <span style={{ color: themeVar.textSecondary }}>Not started</span>
                    )}
                  </td>
                  <td style={cell}>
                    {q ? (
                      <>
                        <strong style={{ fontFamily: primitive.fontFamily.mono }}>
                          {formatMoney(q.total, q.currency)}
                        </strong>
                        {q.validUntil ? (
                          <div style={{ color: themeVar.textSecondary }}>
                            {/* §4's validity period. A price with no expiry is a price
                                the workshop is held to forever. */}
                            valid to {q.validUntil}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <span style={{ color: themeVar.textSecondary }}>—</span>
                    )}
                  </td>
                  <td style={cell}>
                    {q ? (
                      <Link
                        href={`${route}/${q.id}`}
                        style={{ color: primitive.color.blue[600], fontWeight: 600 }}
                      >
                        {/* The link text names the JOB — a column of identical "View"
                            links is indistinguishable to a screen reader (§66) — and the
                            verb reflects what this viewer can actually do. */}
                        {q.reviewable ? 'Approve' : q.editable ? 'Price' : 'View'} quotation for{' '}
                        {card.jobNumber}
                      </Link>
                    ) : card.stage === 'quotation_preparation' ? (
                      <PrepareQuotationForm jobCardId={card.id} jobNumber={card.jobNumber} />
                    ) : (
                      <span style={{ color: themeVar.textSecondary }}>
                        {/* Says WHY there is no button rather than offering one the API
                            will refuse. */}
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
        {/* `05.txt` §2 forbids disconnected mock pages, so what is NOT here is named
            rather than shown as a disabled control. */}
        Parts are generated from the approved plan with NO price — there is no parts
        catalogue in this build — the Find Parts screen of §24 is a later slice — so an advisor prices
        them and submission refuses any line still at zero. Sending the approved
        quotation to the customer, and their approve / decline / query response, is the
        Solution Studio slice.
      </p>
    </>
  );
}

/** Awaiting approval first, then rejected, then draft; approved sorts last. */
function rank(q: Quotation | undefined): number {
  switch (q?.status) {
    case 'submitted':
      return 0;
    case 'rejected':
      return 1;
    case 'draft':
      return 2;
    case 'approved':
      return 4;
    default:
      return 3;
  }
}

const cell = {
  padding: primitive.space[2],
  borderBottom: `1px solid ${themeVar.borderDefault}`,
  color: themeVar.textPrimary,
  verticalAlign: 'top' as const,
  // LOAD-BEARING: a positioned ancestor is what stops an absolutely-positioned
  // descendant escaping this scroll container and stretching the document.
  position: 'relative' as const,
};
