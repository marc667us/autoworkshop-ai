import { Suspense } from 'react';
import Link from 'next/link';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { ProposalNarrativeForm } from './proposal-narrative-form';
import { ProposalDecisionForm } from './proposal-decision-form';
import { ProposalDocument, type ProposalDocumentData } from './proposal-document';
import {
  PROPOSAL_OPTION_LABEL,
  PROPOSAL_STATUS_KIND,
  PROPOSAL_STATUS_LABEL,
  formatMoney,
} from './proposal-labels';

/**
 * One customer proposal — `1.txt` §410-§422's document, `07.txt` §7's decision.
 *
 * ── THIS PAGE IS WHAT THE CUSTOMER IS SHOWN ────────────────────────────────
 *
 * §410-§422 lists twelve things, and the order below is the specification's order
 * rather than a designer's: what was reported, what was inspected, what was confirmed,
 * WHAT REMAINS SUSPECTED, what work is proposed, what parts, what it should achieve,
 * what it will cost, how long, what warranty, what uncertainties remain.
 *
 * The fourth and the last are the ones a workshop is tempted to leave out, and they are
 * the two §416 and §422 name explicitly. A customer who is told only what is confirmed
 * reads the first unexpected extra as incompetence; a customer who was told what
 * remained suspected reads it as the thing they were warned about. They are rendered
 * with the same weight as the rest.
 */

interface Fault {
  id: string;
  faultDescription: string;
  faultCode: string | null;
}

interface Proposal {
  id: string;
  jobCardId: string;
  jobNumber: string;
  registrationNumber: string;
  customerName: string;
  quotationAttemptNo: number;
  versionNo: number;
  status: 'draft' | 'issued' | 'approved' | 'declined' | 'changes_requested' | 'superseded';
  expectedResult: string | null;
  riskAndLimitations: string | null;
  uncertainties: string | null;
  presentationNote: string | null;
  issuedByName: string | null;
  issuedAt: string | null;
  decision: string | null;
  approvedOption: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  decisionChannelLabel: string | null;
  decisionNote: string | null;
  recordedByName: string | null;
  agreedTotal: number | null;
  presentation: {
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
  editable: boolean;
  decidable: boolean;
}

export async function ProposalSheetScreen({
  route,
  proposalId,
}: {
  route: string;
  proposalId: string;
}) {
  return (
    <Suspense fallback={<LoadingState label="Loading the proposal…" />}>
      <Sheet route={route} proposalId={proposalId} />
    </Suspense>
  );
}

async function Sheet({ route, proposalId }: { route: string; proposalId: string }) {
  const result = await apiGet<Proposal>('workshop', `/proposals/${proposalId}`);
  if (!result.ok) return <ApiFailure reason={result.reason} workspaceId="workshop" />;
  const p = result.data;
  const v = p.presentation;

  return (
    <>
      <PageHeader title={`Proposal v${p.versionNo} — ${p.jobNumber}`} description={describe(p)} />

      <p style={{ margin: `0 0 ${primitive.space[3]} 0` }}>
        <Link href={route} style={{ color: primitive.color.blue[600] }}>
          Back to the proposal queue
        </Link>
      </p>

      {/* THE CUSTOMER'S ANSWER, FIRST — it is what everything downstream depends on,
          and §7 says work shall not start without it. */}
      {p.decision !== null ? (
        <div
          role={p.decision === 'approved' ? 'status' : 'alert'}
          style={{
            margin: `0 0 ${primitive.space[4]} 0`,
            padding: primitive.space[3],
            border: `1px solid ${
              p.decision === 'approved' ? themeVar.borderDefault : primitive.color.red[700]
            }`,
            borderRadius: primitive.radius.md,
            background: themeVar.surfaceRaised,
          }}
        >
          <h2
            style={{
              margin: `0 0 ${primitive.space[1]} 0`,
              fontSize: primitive.fontSize.base,
              color: p.decision === 'approved' ? themeVar.textPrimary : primitive.color.red[700],
            }}
          >
            {p.decision === 'approved'
              ? 'Approved by the customer'
              : p.decision === 'declined'
                ? 'Declined by the customer'
                : 'The customer asked for a change'}
          </h2>
          <p style={{ margin: 0, color: themeVar.textPrimary }}>
            {/* The attribution, in full — who, when, and through which channel. This is
                the sentence a disputed authorisation is settled by. */}
            {p.decidedByName ?? 'Unknown'}
            {p.decisionChannelLabel ? ` · ${p.decisionChannelLabel}` : ''}
            {p.decidedAt ? ` · ${new Date(p.decidedAt).toLocaleString()}` : ''}
            {p.recordedByName ? ` · recorded by ${p.recordedByName}` : ''}
          </p>
          {p.approvedOption ? (
            <p style={{ margin: `${primitive.space[1]} 0 0 0`, color: themeVar.textPrimary }}>
              {PROPOSAL_OPTION_LABEL[p.approvedOption] ?? p.approvedOption} —{' '}
              <strong>{formatMoney(p.agreedTotal ?? 0, v.currency)}</strong>
            </p>
          ) : null}
          {p.decisionNote ? (
            <p style={{ margin: `${primitive.space[2]} 0 0 0`, color: themeVar.textPrimary }}>
              {p.decisionNote}
            </p>
          ) : null}
          {p.decision !== 'approved' ? (
            <p
              style={{
                margin: `${primitive.space[2]} 0 0 0`,
                color: themeVar.textSecondary,
                fontSize: primitive.fontSize.sm,
              }}
            >
              {/* Names the route that exists — the queue offers exactly this. */}
              §424: this version is closed. Prepare a NEW VERSION from the queue to make a
              revised offer.
            </p>
          ) : null}
        </div>
      ) : null}

      {p.status === 'superseded' ? (
        <p
          role="status"
          style={{
            margin: `0 0 ${primitive.space[4]} 0`,
            color: themeVar.textSecondary,
            fontSize: primitive.fontSize.sm,
          }}
        >
          A later version replaced this one. It is kept because §424 makes the history of
          what was offered part of the record.
        </p>
      ) : null}

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
          gap: primitive.space[3],
          margin: `0 0 ${primitive.space[4]} 0`,
        }}
      >
        <Fact label="Customer" value={p.customerName} />
        <Fact label="Vehicle" value={p.registrationNumber} mono />
        <Fact
          label="Status"
          value={
            <StatusBadge
              kind={PROPOSAL_STATUS_KIND[p.status] ?? 'draft'}
              label={PROPOSAL_STATUS_LABEL[p.status] ?? p.status}
            />
          }
        />
        <Fact label="Version" value={String(p.versionNo)} />
        <Fact label="From quotation" value={`Attempt ${p.quotationAttemptNo}`} />
        {p.issuedByName ? <Fact label="Issued by" value={p.issuedByName} /> : null}
        <Fact label="Valid until" value={v.validUntil ?? 'Not set'} />
      </dl>

      {/* ── THE DOCUMENT ITSELF ─────────────────────────────────────────
          Rendered by its own component, because this is what the CUSTOMER sees and
          everything around it is the workshop's apparatus. Keeping that boundary
          visible in the file layout is what stops an internal note drifting into a
          document that goes out — and it is what lets the customer app and a future
          PDF renderer reuse it unchanged. */}
      <ProposalDocument data={p as unknown as ProposalDocumentData} />

      {p.editable ? (
        <ProposalNarrativeForm
          proposalId={p.id}
          jobNumber={p.jobNumber}
          expectedResult={p.expectedResult}
          riskAndLimitations={p.riskAndLimitations}
          uncertainties={p.uncertainties}
          presentationNote={p.presentationNote}
          suspectedCount={v.suspectedFaults.length}
        />
      ) : null}

      {p.decidable ? (
        <ProposalDecisionForm
          proposalId={p.id}
          jobNumber={p.jobNumber}
          customerName={p.customerName}
          currency={v.currency}
          recommendedTotal={v.recommendedTotal}
          comprehensiveTotal={v.comprehensiveTotal}
        />
      ) : null}

      {p.status === 'issued' && !p.decidable ? (
        <p
          style={{
            marginTop: primitive.space[4],
            color: themeVar.textSecondary,
            fontSize: primitive.fontSize.sm,
          }}
        >
          {/* Silence here reads as a broken page to whoever is waiting on the answer. */}
          This proposal is with the customer. Your role can read it but not record their
          decision — reception, a manager or the owner does that.
        </p>
      ) : null}
    </>
  );
}

function describe(p: Proposal): string {
  switch (p.status) {
    case 'draft':
      return p.editable
        ? 'Not yet shown to the customer. Write what the work should achieve, and what remains uncertain, then issue it. Once issued the wording is frozen.'
        : 'A draft proposal. Your role can read it but not change it.';
    case 'issued':
      return 'With the customer. §7: repair work shall not start until the required approval is received.';
    case 'approved':
      return 'Approved by the customer. §424 makes this immutable — a material change requires a new version and a new approval.';
    case 'declined':
      return 'Declined by the customer. Kept as the record of what was offered and refused.';
    case 'changes_requested':
      return 'The customer asked for a change. Prepare a new version with the revised offer.';
    default:
      return 'Replaced by a later version. Kept because the history of what was offered is part of the record.';
  }
}

function FaultList({
  title,
  faults,
  empty,
}: {
  title: string;
  faults: Fault[];
  empty: string;
}) {
  return (
    <Block title={title}>
      {faults.length === 0 ? (
        empty
      ) : (
        <ul style={{ margin: 0, paddingLeft: primitive.space[4] }}>
          {faults.map((f) => (
            <li key={f.id} style={{ color: themeVar.textPrimary }}>
              {f.faultDescription}
              {f.faultCode ? (
                <code
                  style={{
                    marginLeft: primitive.space[2],
                    fontFamily: primitive.fontFamily.mono,
                    fontSize: primitive.fontSize.sm,
                    color: themeVar.textSecondary,
                  }}
                >
                  {f.faultCode}
                </code>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Block>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h2 style={sectionHeading}>{title}</h2>
      <div style={{ margin: 0, color: themeVar.textPrimary }}>{children}</div>
    </>
  );
}

const sectionHeading = {
  fontSize: primitive.fontSize.base,
  color: themeVar.textPrimary,
  margin: `${primitive.space[4]} 0 ${primitive.space[1]} 0`,
};

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
