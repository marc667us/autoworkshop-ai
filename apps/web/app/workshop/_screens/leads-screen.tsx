import { Suspense } from 'react';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import {
  DataTable,
  EmptyState,
  LoadingState,
  PageHeader,
  StatusBadge,
  visuallyHidden,
} from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { LEAD_DISCOVERY, leadsIn, type ApiProposal, type LeadCandidate } from './agent-proposals';
import { LeadStatusControl, type LeadStatus } from './lead-status';
import { navLabelFor } from './nav-label';
import { ProposalDecision } from './proposal-decision';

/**
 * LEADS — the workshop's lead pipeline, and the agent proposals feeding it.
 *
 * ── THE SCREEN IS IN TWO HALVES, AND THE ORDER IS THE POINT ───────────────
 *
 * 1. THE PIPELINE — real rows from `crm.leads`, read through `GET /leads`,
 *    each with the status a human can move. This is the workshop's own record.
 * 2. THE PROPOSALS — what the discovery agent has suggested and nobody has
 *    decided yet. These are candidates, not records; nothing in them is a fact
 *    about the workshop until somebody approves and applies them.
 *
 * 🔴 THIS SCREEN USED TO SHOW ONLY HALF 2, AND CALLED IT "leads". `crm.leads`
 * had existed since migration 064 with a writer and no reader, so a lead that
 * had been APPLIED was still displayed as it had been PROPOSED, `status` was
 * invisible and unchangeable, and a lead arriving by any other route did not
 * appear at all. The debt was recorded in this comment for a session; `GET
 * /leads` closes it.
 *
 * ⚠️ BOTH HALVES STAY. Deleting the proposals would remove the only place the
 * approve/apply decision can be taken, and deleting the pipeline was the bug.
 * They answer different questions: "who are we working?" and "what has the
 * agent found that nobody has looked at?".
 */
export const dynamic = 'force-dynamic';

export async function LeadsScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Leads');

  return (
    <>
      <PageHeader
        title={title}
        description="Potential customers, and what the workshop has done about each one. Nothing is added until somebody here approves it — and nobody is ever contacted automatically."
      />
      {/* §70 loading state. `Suspense` rather than a flag, so the page header
          and the navigation render immediately even when the API is cold —
          measured at 21.6s on a Render free-tier cold start.
          ⚠️ TWO BOUNDARIES, NOT ONE: the pipeline and the proposals are separate
          API calls, and a single boundary would hold both back for the slower. */}
      <Suspense fallback={<LoadingState label="Loading the lead pipeline…" />}>
        <LeadPipeline />
      </Suspense>
      <Suspense fallback={<LoadingState label="Loading lead proposals…" />}>
        <LeadProposals />
      </Suspense>
    </>
  );
}

/** One row of `crm.leads`, as `GET /leads` returns it. */
interface ApiLead {
  id: string;
  organisationName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  location: string | null;
  rationale: string | null;
  sourceUrl: string;
  status: LeadStatus;
  createdAt: string;
}

const LEAD_BADGE: Record<LeadStatus, 'draft' | 'active' | 'complete' | 'attention' | 'blocked'> = {
  new: 'draft',
  qualified: 'attention',
  contacted: 'active',
  converted: 'complete',
  rejected: 'blocked',
};

async function LeadPipeline() {
  const result = await apiGet<ApiLead[]>('workshop', '/leads');
  if (!result.ok) return <ApiFailure reason={result.reason} workspaceId="workshop" />;

  if (result.data.length === 0) {
    return (
      <section style={{ marginBottom: primitive.space[6] }}>
        <h2 style={{ fontSize: primitive.fontSize.lg, color: themeVar.textPrimary }}>Lead pipeline</h2>
        <EmptyState
          title="No leads yet"
          description="Approve a lead proposal below and press Apply — the candidates in it become rows here, each with a status you can move."
        />
      </section>
    );
  }

  return (
    <section style={{ marginBottom: primitive.space[6] }}>
      <h2 style={{ fontSize: primitive.fontSize.lg, color: themeVar.textPrimary }}>Lead pipeline</h2>
      <DataTable<ApiLead>
        caption="Leads this workshop is working"
        summary={`${result.data.length} lead${result.data.length === 1 ? '' : 's'}`}
        rows={result.data}
        rowKey={(l) => l.id}
        columns={[
          {
            key: 'organisation',
            header: 'Organisation',
            cell: (l) => (
              <>
                <span style={{ fontWeight: 600 }}>{l.organisationName}</span>
                {l.website ? (
                  <>
                    {' '}
                    <a href={l.website} target="_blank" rel="noreferrer noopener">
                      website
                      <span style={visuallyHidden}> for {l.organisationName}</span>
                    </a>
                  </>
                ) : null}
              </>
            ),
          },
          {
            key: 'contact',
            header: 'Contact',
            cell: (l) => (
              <>
                {l.contactName ? <div>{l.contactName}</div> : null}
                {l.contactEmail ? <div>{l.contactEmail}</div> : null}
                {l.contactPhone ? <div>{l.contactPhone}</div> : null}
                {!l.contactName && !l.contactEmail && !l.contactPhone ? '—' : null}
              </>
            ),
          },
          { key: 'location', header: 'Location', cell: (l) => l.location ?? '—', secondary: true },
          {
            key: 'status',
            header: 'Status',
            cell: (l) => (
              <div style={{ display: 'grid', gap: primitive.space[1] }}>
                <StatusBadge kind={LEAD_BADGE[l.status] ?? 'draft'} label={l.status} />
                {/* The badge states the server's value; the control changes it.
                    Both, because a select alone does not read as a status at a
                    glance and a badge alone cannot be acted on. */}
                <LeadStatusControl leadId={l.id} status={l.status} label={l.organisationName} />
              </div>
            ),
          },
          {
            key: 'source',
            header: 'Source',
            nowrap: true,
            // 🔴 THE SOURCE LINK SURVIVES INTO THE PIPELINE, not just the
            // proposal. `source_url` is NOT NULL in migration 064 because a lead
            // whose origin cannot be produced cannot be defended to the business
            // it is about — and it is the row being WORKED that somebody will be
            // asked to justify, not the proposal it came from.
            cell: (l) => (
              <a href={l.sourceUrl} target="_blank" rel="noreferrer noopener">
                open
                <span style={visuallyHidden}> the page {l.organisationName} was found on</span>
              </a>
            ),
          },
        ]}
      />
    </section>
  );
}

async function LeadProposals() {
  const result = await apiGet<ApiProposal[]>('workshop', '/agents/proposals');

  // §70 error state. `ApiFailure` distinguishes "sign in again", "you do not
  // have access" and "the service is unreachable", because the remedies differ
  // and collapsing them reports a session problem as an outage.
  if (!result.ok) return <ApiFailure reason={result.reason} workspaceId="workshop" />;

  // Filtered CLIENT-side of the API call because `GET /agents/proposals` takes
  // `status`, `resourceType` and `resourceId` — not `agentName`. Filtering by a
  // parameter the endpoint ignores would have returned every proposal in the
  // workshop, including triage, and the screen would have looked correct while
  // showing the wrong rows.
  const proposals = result.data.filter((p) => p.agentName === LEAD_DISCOVERY);

  const heading = (
    <h2 style={{ fontSize: primitive.fontSize.lg, color: themeVar.textPrimary }}>
      Agent proposals
    </h2>
  );

  if (proposals.length === 0) {
    return (
      <section>
        {heading}
        <EmptyState
          title="No lead proposals yet"
          description="Open Discovery, paste the address of a page listing businesses — a trade directory, an association's member list — and say what you are looking for. Candidates appear here for review."
        />
      </section>
    );
  }

  return (
    <section>
      {heading}
      {/* ⚠️ DECIDED PROPOSALS ARE KEPT, not filtered out. An applied proposal is
          the audit trail for the pipeline rows above it — remove it and the
          question "who approved this stranger's details being stored?" has no
          answer on any screen. Each card states its own status. */}
      <div style={{ display: 'grid', gap: primitive.space[5] }}>
        {proposals.map((p) => (
          <ProposalCard key={p.id} proposal={p} />
        ))}
      </div>
    </section>
  );
}

const BADGE: Record<string, 'draft' | 'active' | 'complete' | 'attention' | 'blocked'> = {
  proposed: 'draft',
  'awaiting-approval': 'attention',
  approved: 'active',
  applied: 'complete',
  rejected: 'blocked',
};

function ProposalCard({ proposal }: { proposal: ApiProposal }) {
  const candidates = leadsIn(proposal.payload);

  return (
    <article
      style={{
        border: `1px solid ${themeVar.borderDefault}`,
        borderRadius: primitive.radius.lg,
        padding: primitive.space[4],
        background: themeVar.surfaceRaised,
        display: 'grid',
        gap: primitive.space[3],
      }}
    >
      <header style={{ display: 'flex', gap: primitive.space[3], alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: primitive.fontSize.base, color: themeVar.textPrimary }}>
          {proposal.action}
        </h3>
        <span style={{ marginLeft: 'auto' }}>
          <StatusBadge kind={BADGE[proposal.status] ?? 'draft'} label={proposal.status} />
        </span>
      </header>

      {/* 🔴 WHICH MECHANISM ANSWERED. `rules` means the agent host's model was
          unreachable and deterministic keyword matching produced this. Reading
          a keyword match as a model's judgement is a mistake the reader cannot
          make if the screen simply says which one it was. */}
      <p
        style={{
          margin: 0,
          fontSize: primitive.fontSize.sm,
          color: proposal.source === 'rules' ? themeVar.statusAttention : themeVar.textSecondary,
        }}
      >
        {proposal.source === 'rules'
          ? 'Produced by fixed keyword rules — the AI model was not reachable. Check each candidate before approving.'
          : 'Produced by the AI model.'}
        {' · '}
        {new Date(proposal.createdAt).toLocaleString()}
      </p>

      {/* §8: the information the agent intended to use. Kept on the screen and
          not only in the side panel — this is where the decision is taken. */}
      {proposal.dataUsed.length > 0 ? (
        <p style={{ margin: 0, fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
          Used: {proposal.dataUsed.join(' · ')}
        </p>
      ) : null}

      {candidates.length === 0 ? (
        // The per-card empty state, which is NOT the same as the screen's. A
        // proposal whose payload holds nothing renderable is a real (if rare)
        // outcome — a model returned entries with no organisation name, and the
        // API would skip every one of them at INSERT time. Saying so beats an
        // Apply button that reports "0 leads added" with no explanation.
        <p style={{ margin: 0, fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
          This proposal carries no candidate with both a name and a source, so there is nothing
          here that could be written to the lead list.
        </p>
      ) : (
        <DataTable<LeadCandidate>
          caption="Potential customers in this proposal"
          summary={`${candidates.length} candidate${candidates.length === 1 ? '' : 's'}`}
          rows={candidates}
          rowKey={(c) => `${c.organisationName}::${c.sourceUrl}`}
          columns={[
            {
              key: 'organisation',
              header: 'Organisation',
              cell: (c) => (
                <>
                  <span style={{ fontWeight: 600 }}>{c.organisationName}</span>
                  {c.website ? (
                    <>
                      {' '}
                      <a href={c.website} target="_blank" rel="noreferrer noopener">
                        website
                        <span style={visuallyHidden}> for {c.organisationName}</span>
                      </a>
                    </>
                  ) : null}
                </>
              ),
            },
            {
              key: 'contact',
              header: 'Contact',
              cell: (c) => (
                <>
                  {c.contactName ? <div>{c.contactName}</div> : null}
                  {c.contactEmail ? <div>{c.contactEmail}</div> : null}
                  {c.contactPhone ? <div>{c.contactPhone}</div> : null}
                  {/* An em dash rather than an empty cell: "nothing was found"
                      and "the column failed to render" look identical
                      otherwise. */}
                  {!c.contactName && !c.contactEmail && !c.contactPhone ? '—' : null}
                </>
              ),
            },
            { key: 'location', header: 'Location', cell: (c) => c.location ?? '—', secondary: true },
            {
              key: 'why',
              header: 'Why the agent suggested it',
              cell: (c) => c.rationale ?? '—',
              secondary: true,
            },
            {
              key: 'source',
              header: 'Source',
              nowrap: true,
              // 🔴 EVERY CANDIDATE KEEPS ITS SOURCE LINK. An unsourced claim
              // about a stranger's business is not checkable, and the reviewer
              // is being asked to store their contact details.
              cell: (c) => (
                <a href={c.sourceUrl} target="_blank" rel="noreferrer noopener">
                  open
                  <span style={visuallyHidden}> the page {c.organisationName} was found on</span>
                </a>
              ),
            },
          ]}
        />
      )}

      {proposal.decisionNote ? (
        <p style={{ margin: 0, fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
          Note: {proposal.decisionNote}
        </p>
      ) : null}

      <ProposalDecision
        proposalId={proposal.id}
        status={proposal.status}
        // Only a lead proposal can be applied; the API refuses anything else
        // with "That proposal is not a lead proposal." Every card on THIS
        // screen is one, and the flag is passed explicitly rather than assumed
        // so the component can be reused on the discovery screen unchanged.
        applicable
        label={proposal.action}
      />
    </article>
  );
}
