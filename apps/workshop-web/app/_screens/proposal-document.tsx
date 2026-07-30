import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { PROPOSAL_OPTION_LABEL, formatMoney } from './proposal-labels';

/**
 * THE CUSTOMER-FACING DOCUMENT — `1.txt` §410-§422.
 *
 * ── THIS IS A BUSINESS DOCUMENT, NOT A SCREEN ──────────────────────────────
 *
 * It leaves the building. A customer reads it, decides on it, may print it, and may
 * later rely on it in a dispute — which is exactly why `1.txt` §424 makes an approved
 * one immutable. So it is laid out the way commercial correspondence is laid out, and
 * carries what such a document is expected to carry:
 *
 *   · A LETTERHEAD naming who is making the offer, with an address, a telephone
 *     number and the tax registrations. An offer from an unidentified party is not
 *     something a customer can accept.
 *   · A DOCUMENT REFERENCE, a date and a validity. "Which quotation?" must have an
 *     answer that both sides can say out loud — hence `PROP-JC-000003-V2`.
 *   · An ADDRESSEE block. A document addressed to nobody is a draft.
 *   · An ITEMISED body with a totals block, so the customer can see what each figure
 *     is for rather than being handed one number.
 *   · TERMS — warranty, conditions, validity.
 *   · An ACCEPTANCE block naming who accepted, when and by what means.
 *   · A FOOTER for the standing business wording.
 *
 * ── WHY IT IS ITS OWN COMPONENT ────────────────────────────────────────────
 *
 * Separated from the workshop's queue and controls on purpose. Everything in this file
 * is what the CUSTOMER sees; everything around it is the workshop's own apparatus.
 * Keeping the boundary visible in the file layout is what stops an internal note or a
 * staff-only figure drifting into a document that goes out — and it is what makes this
 * component reusable unchanged by the customer app and, later, by a PDF renderer.
 *
 * ⚠️ PRINT-AWARE. `@media print` rules are applied through inline styles where they
 * can be, and the layout deliberately avoids anything that breaks in a print context:
 * no horizontal scroll containers, no colour-only meaning, no fixed heights.
 */

interface Fault {
  id: string;
  faultDescription: string;
  faultCode: string | null;
}

export interface ProposalDocumentData {
  jobNumber: string;
  registrationNumber: string;
  versionNo: number;
  status: string;
  issuedAt: string | null;
  expectedResult: string | null;
  riskAndLimitations: string | null;
  uncertainties: string | null;
  presentationNote: string | null;
  decision: string | null;
  approvedOption: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  decisionChannelLabel: string | null;
  decisionNote: string | null;
  recordedByName: string | null;
  agreedTotal: number | null;
  presentation: {
    documentReference: string;
    vehicleDescription: string;
    issuer: {
      name: string;
      legalName: string | null;
      address: string | null;
      city: string | null;
      country: string | null;
      phone: string | null;
      email: string | null;
      website: string | null;
      taxIdentificationNumber: string | null;
      vatRegistrationNumber: string | null;
      documentFooter: string | null;
    };
    addressee: { name: string; email: string | null; phone: string | null; location: string | null };
    complaint: string;
    inspectionSummary: string | null;
    inspectionCheckedCount: number;
    confirmedFaults: Fault[];
    suspectedFaults: Fault[];
    proposedWork: Array<{ id: string; title: string; estimatedLabourHours: number | null }>;
    proposedParts: Array<{ id: string; description: string; quantity: number; unitPrice: number }>;
    estimatedLabourHours: number;
    currency: string;
    recommendedTotal: number;
    comprehensiveTotal: number;
    warrantyTerms: string | null;
    completionConditions: string | null;
    validUntil: string | null;
  };
}

export function ProposalDocument({ data }: { data: ProposalDocumentData }) {
  const v = data.presentation;
  const issuer = v.issuer;
  const to = v.addressee;
  const hasExtras = v.comprehensiveTotal > v.recommendedTotal;

  return (
    <article
      style={{
        maxWidth: '52rem',
        margin: 0,
        padding: primitive.space[6],
        border: `1px solid ${themeVar.borderDefault}`,
        borderRadius: primitive.radius.md,
        background: themeVar.surfaceRaised,
        color: themeVar.textPrimary,
        // A positioned containing block, for the reason every container in these slices
        // has one.
        position: 'relative',
      }}
    >
      {/* ── LETTERHEAD ──────────────────────────────────────────────────── */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: primitive.space[4],
          flexWrap: 'wrap',
          paddingBottom: primitive.space[3],
          borderBottom: `2px solid ${themeVar.textPrimary}`,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: primitive.fontSize.lg, color: themeVar.textPrimary }}>
            {issuer.name}
          </h1>
          {/* Each line is omitted rather than rendered blank when the workshop has not
              configured it — an empty letterhead line looks like a fault. */}
          {issuer.legalName && issuer.legalName !== issuer.name ? (
            <Line>{issuer.legalName}</Line>
          ) : null}
          {issuer.address ? <Line>{issuer.address}</Line> : null}
          {issuer.city || issuer.country ? (
            <Line>{[issuer.city, issuer.country].filter(Boolean).join(', ')}</Line>
          ) : null}
          {issuer.phone ? <Line>Tel {issuer.phone}</Line> : null}
          {issuer.email ? <Line>{issuer.email}</Line> : null}
          {issuer.website ? <Line>{issuer.website}</Line> : null}
          {issuer.taxIdentificationNumber ? <Line>TIN {issuer.taxIdentificationNumber}</Line> : null}
          {issuer.vatRegistrationNumber ? (
            // A document showing a tax line and no registration number is one a
            // customer's accountant will query.
            <Line>VAT {issuer.vatRegistrationNumber}</Line>
          ) : null}
        </div>

        <div style={{ textAlign: 'right', minWidth: 0 }}>
          <h2
            style={{
              margin: 0,
              fontSize: primitive.fontSize.base,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: themeVar.textPrimary,
            }}
          >
            Repair Proposal
          </h2>
          <Line mono>{v.documentReference}</Line>
          <Line>
            Date{' '}
            {data.issuedAt
              ? new Date(data.issuedAt).toLocaleDateString()
              : // A draft has no issue date, and saying so is more honest than printing
                // today's — the document is not yet dated because it has not been sent.
                'not yet issued'}
          </Line>
          {v.validUntil ? <Line>Valid until {v.validUntil}</Line> : null}
          <Line>Version {data.versionNo}</Line>
        </div>
      </header>

      {/* ── ADDRESSEE AND SUBJECT ───────────────────────────────────────── */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(16rem, 100%), 1fr))',
          gap: primitive.space[4],
          margin: `${primitive.space[4]} 0`,
        }}
      >
        <div>
          <Caption>To</Caption>
          <p style={{ margin: 0 }}>
            <strong>{to.name}</strong>
          </p>
          {to.location ? <Line>{to.location}</Line> : null}
          {to.phone ? <Line>{to.phone}</Line> : null}
          {to.email ? <Line>{to.email}</Line> : null}
        </div>
        <div>
          <Caption>Vehicle</Caption>
          <p style={{ margin: 0, fontFamily: primitive.fontFamily.mono }}>
            <strong>{data.registrationNumber}</strong>
          </p>
          {v.vehicleDescription ? <Line>{v.vehicleDescription}</Line> : null}
          <Line>Job {data.jobNumber}</Line>
        </div>
      </section>

      {/* ── THE BODY, in §410-§422's order ──────────────────────────────── */}
      <Para title="1. What you reported">{v.complaint}</Para>

      <Para title="2. What we inspected">
        {v.inspectionSummary ??
          (v.inspectionCheckedCount > 0
            ? `${v.inspectionCheckedCount} checkpoints were checked during our inspection.`
            : 'No inspection has been recorded against this job.')}
      </Para>

      <Faults title="3. What we confirmed" faults={v.confirmedFaults} empty="No fault has been confirmed." />

      {/* §416 — the section a workshop is tempted to leave out, and the one that stops
          the first unexpected extra reading as incompetence. */}
      <Faults
        title="4. What we still suspect but have not confirmed"
        faults={v.suspectedFaults}
        empty="Nothing remains suspected. Everything we found is confirmed above."
      />

      <Para title="5. What we propose to do">
        {v.proposedWork.length === 0 ? (
          'No work is currently planned.'
        ) : (
          <ol style={{ margin: 0, paddingLeft: '1.25rem' }}>
            {v.proposedWork.map((t) => (
              <li key={t.id}>
                {t.title}
                {t.estimatedLabourHours !== null ? (
                  <span style={{ color: themeVar.textSecondary }}>
                    {' '}
                    ({t.estimatedLabourHours.toFixed(2)} hours)
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </Para>

      {/* ── ITEMISED PARTS ──────────────────────────────────────────────── */}
      <h3 style={heading}>6. Parts we propose to fit</h3>
      {v.proposedParts.length === 0 ? (
        <p style={{ margin: 0 }}>No parts are required for this work.</p>
      ) : (
        // No `overflow-x` container: this is a document that may be printed, and a
        // scrollable region prints truncated. The columns are few and narrow enough to
        // wrap instead.
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: primitive.fontSize.sm }}>
          <thead>
            <tr>
              {['Description', 'Qty', 'Unit price', 'Amount'].map((h, i) => (
                <th
                  key={h}
                  scope="col"
                  style={{
                    textAlign: i === 0 ? 'left' : 'right',
                    padding: primitive.space[1],
                    borderBottom: `1px solid ${themeVar.textPrimary}`,
                    color: themeVar.textPrimary,
                    fontWeight: 600,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {v.proposedParts.map((p) => (
              <tr key={p.id}>
                <td style={docCell}>{p.description}</td>
                <td style={{ ...docCell, textAlign: 'right' }}>{p.quantity}</td>
                <td style={{ ...docCell, textAlign: 'right', fontFamily: primitive.fontFamily.mono }}>
                  {formatMoney(p.unitPrice, v.currency)}
                </td>
                <td style={{ ...docCell, textAlign: 'right', fontFamily: primitive.fontFamily.mono }}>
                  {formatMoney(Math.round(p.quantity * p.unitPrice * 100) / 100, v.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Para title="7. What this should achieve">
        {data.expectedResult ?? (
          <em style={{ color: themeVar.textSecondary }}>
            Not yet written. This proposal cannot be issued until it is.
          </em>
        )}
      </Para>

      {/* ── THE PRICE ───────────────────────────────────────────────────── */}
      <h3 style={heading}>8. What it will cost</h3>
      <table style={{ width: '100%', maxWidth: '30rem', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={totalLabel}>{PROPOSAL_OPTION_LABEL['recommended']}</td>
            <td style={totalValue}>{formatMoney(v.recommendedTotal, v.currency)}</td>
          </tr>
          {hasExtras ? (
            <tr>
              <td style={totalLabel}>{PROPOSAL_OPTION_LABEL['comprehensive']}</td>
              <td style={totalValue}>{formatMoney(v.comprehensiveTotal, v.currency)}</td>
            </tr>
          ) : null}
          <tr>
            <td style={totalLabel}>Estimated working time</td>
            <td style={totalValue}>{v.estimatedLabourHours.toFixed(2)} hours</td>
          </tr>
        </tbody>
      </table>
      <p style={{ margin: `${primitive.space[2]} 0 0 0`, color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
        All amounts are in {v.currency} and include any tax shown on the underlying
        quotation.
      </p>

      {/* ── TERMS ───────────────────────────────────────────────────────── */}
      <h3 style={heading}>9. Terms</h3>
      <dl style={{ margin: 0, display: 'grid', gap: primitive.space[2] }}>
        <Term label="Warranty">{v.warrantyTerms ?? 'No warranty terms have been recorded.'}</Term>
        <Term label="Conditions">
          {v.completionConditions ?? 'No completion conditions have been recorded.'}
        </Term>
        <Term label="Validity">
          {v.validUntil
            ? `This proposal is open for acceptance until ${v.validUntil}.`
            : 'No validity period has been set for this proposal.'}
        </Term>
        <Term label="Risks and limitations">{data.riskAndLimitations ?? 'None recorded.'}</Term>
        {/* §422, kept distinct from the risks: a risk is what might go wrong, an
            uncertainty is what we do not yet know. */}
        <Term label="What remains uncertain">{data.uncertainties ?? 'None recorded.'}</Term>
        {data.presentationNote ? <Term label="Also discussed">{data.presentationNote}</Term> : null}
      </dl>

      {/* ── ACCEPTANCE ──────────────────────────────────────────────────── */}
      <h3 style={heading}>10. Acceptance</h3>
      {data.decision === null ? (
        <>
          <p style={{ margin: 0 }}>
            Work will not begin until this proposal is accepted. Please confirm which
            option you would like us to carry out.
          </p>
          {/* A signature block, so a printed copy is a usable acceptance form. Ruled
              lines rather than inputs: on paper it is signed, and on screen the
              workshop records the decision through the form below the document. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(14rem, 100%), 1fr))',
              gap: primitive.space[4],
              marginTop: primitive.space[4],
            }}
          >
            {['Signed', 'Name in full', 'Date'].map((label) => (
              <div key={label}>
                <div style={{ borderBottom: `1px solid ${themeVar.textPrimary}`, height: '2rem' }} />
                <Caption>{label}</Caption>
              </div>
            ))}
          </div>
        </>
      ) : (
        // Once decided, the acceptance block becomes the RECORD of the acceptance —
        // who, when, by what means, and for which option. This is the passage a
        // disputed authorisation is settled from.
        <dl style={{ margin: 0, display: 'grid', gap: primitive.space[1] }}>
          <Term label="Decision">
            {data.decision === 'approved'
              ? 'Accepted'
              : data.decision === 'declined'
                ? 'Declined'
                : 'Changes requested'}
          </Term>
          <Term label="By">{data.decidedByName ?? 'Unknown'}</Term>
          {data.decisionChannelLabel ? <Term label="Given">{data.decisionChannelLabel}</Term> : null}
          {data.decidedAt ? (
            <Term label="On">{new Date(data.decidedAt).toLocaleString()}</Term>
          ) : null}
          {data.approvedOption ? (
            <Term label="Option accepted">
              {PROPOSAL_OPTION_LABEL[data.approvedOption] ?? data.approvedOption}
              {data.agreedTotal !== null
                ? ` — ${formatMoney(data.agreedTotal, v.currency)}`
                : ''}
            </Term>
          ) : null}
          {data.decisionNote ? <Term label="Noted">{data.decisionNote}</Term> : null}
          {data.recordedByName ? (
            // Kept separate from "By" on purpose: one is the customer, the other is the
            // member of staff who wrote it down.
            <Term label="Recorded by">{data.recordedByName}</Term>
          ) : null}
        </dl>
      )}

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer
        style={{
          marginTop: primitive.space[6],
          paddingTop: primitive.space[3],
          borderTop: `1px solid ${themeVar.borderDefault}`,
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.sm,
        }}
      >
        {issuer.documentFooter ? (
          <p style={{ margin: `0 0 ${primitive.space[1]} 0`, whiteSpace: 'pre-line' }}>
            {issuer.documentFooter}
          </p>
        ) : null}
        <p style={{ margin: 0 }}>
          {v.documentReference} · {issuer.name}
          {issuer.legalName && issuer.legalName !== issuer.name ? ` (${issuer.legalName})` : ''}
        </p>
      </footer>
    </article>
  );
}

function Line({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <p
      style={{
        margin: 0,
        color: themeVar.textSecondary,
        fontSize: primitive.fontSize.sm,
        fontFamily: mono ? primitive.fontFamily.mono : 'inherit',
        whiteSpace: 'pre-line',
      }}
    >
      {children}
    </p>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        margin: 0,
        color: themeVar.textSecondary,
        fontSize: primitive.fontSize.sm,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}
    >
      {children}
    </p>
  );
}

function Para({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h3 style={heading}>{title}</h3>
      <div style={{ margin: 0 }}>{children}</div>
    </>
  );
}

function Faults({ title, faults, empty }: { title: string; faults: Fault[]; empty: string }) {
  return (
    <Para title={title}>
      {faults.length === 0 ? (
        empty
      ) : (
        <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
          {faults.map((f) => (
            <li key={f.id}>
              {f.faultDescription}
              {f.faultCode ? (
                <span style={{ color: themeVar.textSecondary, fontFamily: primitive.fontFamily.mono }}>
                  {' '}
                  ({f.faultCode})
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Para>
  );
}

function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>{label}</dt>
      <dd style={{ margin: 0, color: themeVar.textPrimary }}>{children}</dd>
    </div>
  );
}

const heading = {
  fontSize: primitive.fontSize.base,
  color: themeVar.textPrimary,
  margin: `${primitive.space[4]} 0 ${primitive.space[1]} 0`,
};

const docCell = {
  padding: primitive.space[1],
  borderBottom: `1px solid ${themeVar.borderDefault}`,
  color: themeVar.textPrimary,
  verticalAlign: 'top' as const,
};

const totalLabel = {
  padding: primitive.space[1],
  borderBottom: `1px solid ${themeVar.borderDefault}`,
  color: themeVar.textPrimary,
};

const totalValue = {
  padding: primitive.space[1],
  borderBottom: `1px solid ${themeVar.borderDefault}`,
  color: themeVar.textPrimary,
  fontFamily: primitive.fontFamily.mono,
  fontWeight: 600,
  textAlign: 'right' as const,
  whiteSpace: 'nowrap' as const,
};
