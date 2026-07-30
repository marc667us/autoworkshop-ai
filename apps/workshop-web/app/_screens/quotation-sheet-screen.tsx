import { Suspense } from 'react';
import Link from 'next/link';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { QuotationEditorForm } from './quotation-editor-form';
import { QuotationReviewForm } from './quotation-review-form';
import {
  LINE_KIND_LABEL,
  QUOTATION_STATUS_KIND,
  QUOTATION_STATUS_LABEL,
  formatMoney,
  formatQty,
} from './quotation-labels';

/**
 * One quotation — `07.txt` §4's document, §5's internal approval.
 *
 * Three states, genuinely different rather than one thing in three degrees of
 * disablement:
 *   1. DRAFT, and this viewer may price it — the editor.
 *   2. SUBMITTED, and this viewer may approve it — the document plus §5's decision.
 *      Offered only to somebody who did not submit it.
 *   3. SETTLED, or a viewer who may only read — the record of what was quoted.
 */

interface Line {
  id: string;
  position: number;
  lineKind: string;
  lineKindLabel: string;
  description: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  lineTotal: number;
  isOptional: boolean;
}

interface Quotation {
  id: string;
  jobNumber: string;
  registrationNumber: string;
  customerName: string;
  complaint: string;
  repairPlanAttemptNo: number;
  diagnosisSummary: string | null;
  attemptNo: number;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  currency: string;
  labourRate: number;
  taxName: string;
  taxRatePercent: number;
  discountAmount: number;
  discountReason: string | null;
  validUntil: string | null;
  warrantyTerms: string | null;
  completionConditions: string | null;
  recommendedRepair: string | null;
  alternativeOptions: string | null;
  preparedByName: string | null;
  submittedByName: string | null;
  reviewedByName: string | null;
  reviewNote: string | null;
  lines: Line[];
  subtotal: number;
  optionalTotal: number;
  taxAmount: number;
  total: number;
  editable: boolean;
  reviewable: boolean;
}

export async function QuotationSheetScreen({
  route,
  quotationId,
}: {
  route: string;
  quotationId: string;
}) {
  return (
    <Suspense fallback={<LoadingState label="Loading the quotation…" />}>
      <Sheet route={route} quotationId={quotationId} />
    </Suspense>
  );
}

async function Sheet({ route, quotationId }: { route: string; quotationId: string }) {
  const result = await apiGet<Quotation>('workshop', `/quotations/${quotationId}`);
  if (!result.ok) return <ApiFailure reason={result.reason} workspaceId="workshop" />;
  const q = result.data;

  return (
    <>
      <PageHeader title={`Quotation — ${q.jobNumber}`} description={describe(q)} />

      <p style={{ margin: `0 0 ${primitive.space[3]} 0` }}>
        <Link href={route} style={{ color: primitive.color.blue[600] }}>
          Back to the quotation queue
        </Link>
      </p>

      {/* THE REJECTION REASON, FIRST — the only thing the preparer can act on. */}
      {q.status === 'rejected' && q.reviewNote ? (
        <div
          role="alert"
          style={{
            margin: `0 0 ${primitive.space[4]} 0`,
            padding: primitive.space[3],
            border: `1px solid ${primitive.color.red[700]}`,
            borderRadius: primitive.radius.md,
            background: themeVar.surfaceRaised,
          }}
        >
          <h2
            style={{
              margin: `0 0 ${primitive.space[1]} 0`,
              fontSize: primitive.fontSize.base,
              color: primitive.color.red[700],
            }}
          >
            Rejected by {q.reviewedByName ?? 'a manager'}
          </h2>
          <p style={{ margin: 0, color: themeVar.textPrimary }}>{q.reviewNote}</p>
          <p
            style={{
              margin: `${primitive.space[2]} 0 0 0`,
              color: themeVar.textSecondary,
              fontSize: primitive.fontSize.sm,
            }}
          >
            {/* Names a route that exists — the queue offers exactly this. */}
            This quotation cannot be changed. Prepare a new one from the queue to record a
            revised price.
          </p>
        </div>
      ) : null}

      {q.status === 'approved' ? (
        <p
          role="status"
          style={{
            margin: `0 0 ${primitive.space[4]} 0`,
            color: themeVar.textPrimary,
            fontSize: primitive.fontSize.sm,
          }}
        >
          Approved by {q.reviewedByName ?? 'a manager'}
          {q.reviewNote ? ` — ${q.reviewNote}` : ''}. §6: the approved quotation is what
          goes to the customer.
        </p>
      ) : null}

      {/* §4's document header — customer, vehicle, complaint, diagnosis summary. */}
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
          gap: primitive.space[3],
          margin: `0 0 ${primitive.space[4]} 0`,
        }}
      >
        <Fact label="Customer" value={q.customerName} />
        <Fact label="Vehicle" value={q.registrationNumber} mono />
        <Fact
          label="Status"
          value={
            <StatusBadge
              kind={QUOTATION_STATUS_KIND[q.status] ?? 'draft'}
              label={QUOTATION_STATUS_LABEL[q.status] ?? q.status}
            />
          }
        />
        <Fact label="Attempt" value={String(q.attemptNo)} />
        <Fact label="From repair plan" value={`Attempt ${q.repairPlanAttemptNo}`} />
        <Fact
          label="Labour rate"
          value={`${formatMoney(q.labourRate, q.currency)} / hour`}
        />
        <Fact label="Prepared by" value={q.preparedByName ?? 'Unknown'} />
        {q.submittedByName ? <Fact label="Submitted by" value={q.submittedByName} /> : null}
        <Fact label="Valid until" value={q.validUntil ?? 'Not set'} />
      </dl>

      <Section title="Complaint">{q.complaint}</Section>
      <Section title="Diagnosis summary">
        {/* Read LIVE from the approved diagnosis, never copied — 012 froze it. */}
        {q.diagnosisSummary ?? 'No summary was recorded on the diagnosis.'}
      </Section>

      {q.editable ? (
        <QuotationEditorForm
          quotationId={q.id}
          jobNumber={q.jobNumber}
          currency={q.currency}
          lines={q.lines}
          subtotal={q.subtotal}
          discountAmount={q.discountAmount}
          discountReason={q.discountReason}
          taxName={q.taxName}
          taxRatePercent={q.taxRatePercent}
          taxAmount={q.taxAmount}
          total={q.total}
          optionalTotal={q.optionalTotal}
          validUntil={q.validUntil}
          warrantyTerms={q.warrantyTerms}
          completionConditions={q.completionConditions}
          recommendedRepair={q.recommendedRepair}
          alternativeOptions={q.alternativeOptions}
        />
      ) : (
        <ReadOnlyQuotation q={q} />
      )}

      {q.reviewable ? (
        <QuotationReviewForm
          quotationId={q.id}
          jobNumber={q.jobNumber}
          submittedByName={q.submittedByName}
          currency={q.currency}
          total={q.total}
          lineCount={q.lines.length}
        />
      ) : null}

      {q.status === 'submitted' && !q.reviewable ? (
        <p
          style={{
            marginTop: primitive.space[4],
            color: themeVar.textSecondary,
            fontSize: primitive.fontSize.sm,
          }}
        >
          {/* Silence here reads as a broken page to whoever submitted it. */}
          Awaiting internal approval. Whoever submitted a quotation cannot also approve it
          (§563), and approval is held to a narrower set of roles than preparation — so
          this one needs another manager or the workshop owner.
        </p>
      ) : null}
    </>
  );
}

function describe(q: Quotation): string {
  switch (q.status) {
    case 'draft':
      return q.editable
        ? 'Priced from the approved repair plan. Parts arrive with no price — there is no parts catalogue yet — so price every line before submitting. Submitting sends it for internal approval and it cannot be changed afterwards.'
        : 'This quotation is still being priced. Your role can read it but not change it.';
    case 'submitted':
      return 'Submitted for internal approval. The lines are frozen so the price cannot move underneath the approver.';
    case 'approved':
      return 'Approved. This is the price of record for this attempt, and what goes to the customer.';
    default:
      return 'Rejected. This is the record of what was quoted and why it was refused — it is kept rather than reopened, so the disagreement is not erased.';
  }
}

function ReadOnlyQuotation({ q }: { q: Quotation }) {
  const chargeable = q.lines.filter((l) => !l.isOptional);
  const optional = q.lines.filter((l) => l.isOptional);
  return (
    <>
      <LineTable title="Quoted" lines={chargeable} currency={q.currency} />
      {optional.length > 0 ? (
        // §4's "alternative options where applicable" — kept visually separate because
        // they are NOT in the headline price, and a customer reading one list would
        // reasonably assume they were.
        <LineTable title="Optional extras (not included in the total)" lines={optional} currency={q.currency} />
      ) : null}

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
          gap: primitive.space[3],
          margin: `${primitive.space[4]} 0`,
        }}
      >
        <Fact label="Subtotal" value={formatMoney(q.subtotal, q.currency)} mono />
        {q.discountAmount > 0 ? (
          <Fact
            label={q.discountReason ? `Discount — ${q.discountReason}` : 'Discount'}
            value={`- ${formatMoney(q.discountAmount, q.currency)}`}
            mono
          />
        ) : null}
        <Fact
          label={`${q.taxName} at ${q.taxRatePercent}%`}
          value={formatMoney(q.taxAmount, q.currency)}
          mono
        />
        <Fact label="Total" value={formatMoney(q.total, q.currency)} mono />
      </dl>

      <Section title="Recommended repair">{q.recommendedRepair ?? 'Not recorded.'}</Section>
      <Section title="Alternative options">{q.alternativeOptions ?? 'None offered.'}</Section>
      <Section title="Expected completion conditions">
        {q.completionConditions ?? 'Not recorded.'}
      </Section>
      <Section title="Warranty">{q.warrantyTerms ?? 'Not recorded.'}</Section>
    </>
  );
}

function LineTable({
  title,
  lines,
  currency,
}: {
  title: string;
  lines: Line[];
  currency: string;
}) {
  return (
    <>
      <h2
        style={{
          fontSize: primitive.fontSize.base,
          color: themeVar.textPrimary,
          margin: `${primitive.space[4]} 0 ${primitive.space[2]} 0`,
        }}
      >
        {title}
      </h2>
      {lines.length === 0 ? (
        // Never blank: an empty line list on a submitted quotation is a real and
        // alarming state and should read as one.
        <p style={{ margin: 0, color: themeVar.textSecondary }}>No lines.</p>
      ) : (
        <div style={{ overflowX: 'auto', maxWidth: '100%', minWidth: 0 }}>
          <table
            style={{
              width: '100%',
              minWidth: '38rem',
              borderCollapse: 'collapse',
              fontSize: primitive.fontSize.sm,
            }}
          >
            <thead>
              <tr>
                {['#', 'Description', 'Kind', 'Qty', 'Unit price', 'Total'].map((h) => (
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
              {lines.map((l) => (
                <tr key={l.id}>
                  <td style={lineCell}>{l.position}</td>
                  <td style={lineCell}>{l.description}</td>
                  <td style={lineCell}>{LINE_KIND_LABEL[l.lineKind] ?? l.lineKindLabel}</td>
                  <td style={lineCell}>{formatQty(l.quantity, l.unit)}</td>
                  <td style={{ ...lineCell, fontFamily: primitive.fontFamily.mono }}>
                    {formatMoney(l.unitPrice, currency)}
                  </td>
                  <td
                    style={{
                      ...lineCell,
                      fontFamily: primitive.fontFamily.mono,
                      fontWeight: 600,
                    }}
                  >
                    {formatMoney(l.lineTotal, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h2
        style={{
          fontSize: primitive.fontSize.base,
          color: themeVar.textPrimary,
          margin: `${primitive.space[4]} 0 ${primitive.space[1]} 0`,
        }}
      >
        {title}
      </h2>
      <p style={{ margin: 0, color: themeVar.textPrimary }}>{children}</p>
    </>
  );
}

function Fact({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>{label}</dt>
      <dd
        style={{
          margin: 0,
          color: themeVar.textPrimary,
          fontFamily: mono ? primitive.fontFamily.mono : 'inherit',
        }}
      >
        {value}
      </dd>
    </div>
  );
}

const lineCell = {
  padding: primitive.space[2],
  borderBottom: `1px solid ${themeVar.borderDefault}`,
  color: themeVar.textPrimary,
  verticalAlign: 'top' as const,
  position: 'relative' as const,
};
