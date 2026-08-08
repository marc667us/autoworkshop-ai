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
import { navLabelFor } from './nav-label';
import { ProposalDecision } from './proposal-decision';

/**
 * LEADS — the potential customers the discovery agent found, and what a human
 * decided about them.
 *
 * ── 🔴 THIS SCREEN READS PROPOSALS, NOT LEADS, AND THAT IS A KNOWN GAP ─────
 *
 * `crm.leads` exists (migration 064) and `POST /agents/proposals/:id/apply-leads`
 * writes to it. There is NO read endpoint for it — no `GET /leads` — so this
 * screen lists the lead-discovery PROPOSALS and shows each one's candidates
 * from its stored payload.
 *
 * ⚠️ WHAT THAT COSTS, STATED PLAINLY SO NOBODY DISCOVERS IT BY SURPRISE:
 *   · A lead that has been APPLIED is shown as it was PROPOSED. If somebody
 *     later edits or works that lead, this screen will not know.
 *   · A lead added by any other route would not appear here at all.
 *   · There is no status, owner or follow-up on a lead — `crm.leads.status`
 *     defaults to 'new' and nothing here can read or change it.
 *
 * 🔴 A DEDICATED `GET /leads` IS STILL OWED, and this comment is the record of
 * that debt. When it lands, this screen changes from "proposals about leads" to
 * "leads, with the proposal that produced them" — the route, the nav entry and
 * the decision controls all stay.
 */
export const dynamic = 'force-dynamic';

export async function LeadsScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Leads');

  return (
    <>
      <PageHeader
        title={title}
        description="Potential customers the discovery agent found. Nothing is added to the workshop's records until somebody here approves it — and nobody is ever contacted automatically."
      />
      {/* §70 loading state. `Suspense` rather than a flag, so the page header
          and the navigation render immediately even when the API is cold —
          measured at 21.6s on a Render free-tier cold start. */}
      <Suspense fallback={<LoadingState label="Loading lead proposals…" />}>
        <LeadProposals />
      </Suspense>
    </>
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

  if (proposals.length === 0) {
    return (
      <EmptyState
        title="No lead proposals yet"
        description="Open Discovery, paste the address of a page listing businesses — a trade directory, an association's member list — and say what you are looking for. Candidates appear here for review."
      />
    );
  }

  return (
    <div style={{ display: 'grid', gap: primitive.space[5] }}>
      {proposals.map((p) => (
        <ProposalCard key={p.id} proposal={p} />
      ))}
    </div>
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
