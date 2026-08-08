import { Suspense } from 'react';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import {
  EmptyState,
  Field,
  FormShell,
  LoadingState,
  PageHeader,
  Select,
  StatusBadge,
  SubmitButton,
  TextInput,
  visuallyHidden,
} from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { runDiscoveryAction } from './agent-actions';
import {
  LEAD_DISCOVERY,
  SUPPLIER_DISCOVERY,
  leadsIn,
  partsIn,
  suppliersIn,
  type ApiProposal,
} from './agent-proposals';
import { navLabelFor } from './nav-label';
import { ProposalDecision } from './proposal-decision';

/**
 * DISCOVERY — point the agent at a page and say what to look for.
 *
 * Owner, 2026-08-08: an agent that uses a scraper to "search for products and
 * suppliers and register them", and another to "search leads and potential
 * customers from online and social media". This is the screen that runs both.
 *
 * ── 🔴 WHAT PRESSING THE BUTTON DOES, AND WHAT IT DOES NOT ────────────────
 *
 * It creates a PROPOSAL. Nothing is registered, published or contacted. The
 * agent's own module says why: a scraped price written straight into
 * `catalogue.parts` is Directive §14's "updating supplier prices" without the
 * human approval that rule requires, the catalogue is PUBLIC, and scraped data
 * is wrong often enough for that to matter to a real customer holding a real
 * quotation. So the result of a run is something to read and decide on, and the
 * screen says so before the button is pressed rather than after.
 *
 * ── ⚠️ THE URL IS NOT VALIDATED HERE, AND MUST NOT APPEAR TO BE ───────────
 *
 * `type="url"` below is a keyboard and a hint, nothing more. The API rejects a
 * non-URL with zod, and the REAL guard — an allowlist, plus refusal of private
 * address ranges AFTER DNS resolution, which is what stops a public-looking
 * hostname resolving to 169.254.169.254 — lives in the agent host, the process
 * that actually fetches the page. Nothing on this screen protects anything
 * (CLAUDE.md §8).
 */
export const dynamic = 'force-dynamic';

export async function DiscoveryScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Discovery');

  return (
    <>
      <PageHeader
        title={title}
        description="Point the discovery agent at a public page. It reads the page and proposes what it found — nothing is added to this workshop's records, and nobody is contacted, until somebody here approves it."
      />

      <FormShell
        action={runDiscoveryAction}
        successPrefix="Created"
        // A PLAIN anchor to THIS route, deliberately. The server action
        // revalidates, but this form is a client component and Next will not
        // re-render the server list beneath it on its own; a full navigation is
        // the honest way to show the new proposal. It says "reload" rather than
        // pretending the list below has already changed.
        //
        // 🔴 `route`, NOT A LITERAL. This screen is mounted at three paths — one
        // per role tree — so a hardcoded href would send two of the three roles
        // to a page their own navigation does not carry, and `requireNavRoute`
        // answers 404 for exactly that. A link that 404s at the end of a
        // successful action reads as the action having failed.
        successHref={{ href: route, label: 'Reload to see it' }}
      >
        <Field
          label="What to look for"
          hint="Suppliers and parts go to the catalogue review; potential customers go to the lead list."
          htmlFor="kind"
        >
          <Select
            id="kind"
            name="kind"
            defaultValue="suppliers"
            options={[
              { value: 'suppliers', label: 'Suppliers and parts' },
              { value: 'leads', label: 'Potential customers (leads)' },
            ]}
          />
        </Field>

        <Field
          label="Page address"
          hint="A public page — a supplier's product listing, a trade directory, an association's member list."
          htmlFor="url"
        >
          <TextInput
            id="url"
            name="url"
            type="url"
            required
            maxLength={2000}
            placeholder="https://…"
            autoComplete="off"
          />
        </Field>

        <Field
          label="Brief"
          hint="What you are actually after — the agent uses it as context. e.g. “brake components for Toyota Hilux” or “fleet operators in Tema”."
          htmlFor="brief"
        >
          <TextInput id="brief" name="brief" required minLength={3} maxLength={500} autoComplete="off" />
        </Field>

        <SubmitButton>Run discovery</SubmitButton>
      </FormShell>

      <h2 style={{ margin: `${primitive.space[6]} 0 0`, fontSize: primitive.fontSize.lg }}>
        Recent discovery proposals
      </h2>
      {/* §70 loading state — the form above stays usable while this resolves,
          which matters on a cold API (21.6s measured). */}
      <Suspense fallback={<LoadingState label="Loading recent discovery proposals…" />}>
        <DiscoveryProposals />
      </Suspense>
    </>
  );
}

async function DiscoveryProposals() {
  const result = await apiGet<ApiProposal[]>('workshop', '/agents/proposals');

  // §70 error state, distinguishing "sign in again" from "not permitted" from
  // "unreachable" — the three have different remedies.
  if (!result.ok) return <ApiFailure reason={result.reason} workspaceId="workshop" />;

  // Both discovery agents, not triage: this screen is about what a person asked
  // the agent to go and read.
  const proposals = result.data.filter(
    (p) => p.agentName === SUPPLIER_DISCOVERY || p.agentName === LEAD_DISCOVERY,
  );

  if (proposals.length === 0) {
    return (
      <EmptyState
        title="Nothing has been discovered yet"
        description="Fill in the form above. The proposal it creates appears here, with every candidate's source link, for you to approve or reject."
      />
    );
  }

  return (
    <div style={{ display: 'grid', gap: primitive.space[5], marginTop: primitive.space[4] }}>
      {proposals.map((p) => (
        <DiscoveryCard key={p.id} proposal={p} />
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

function DiscoveryCard({ proposal }: { proposal: ApiProposal }) {
  const isLeads = proposal.agentName === LEAD_DISCOVERY;
  const leads = isLeads ? leadsIn(proposal.payload) : [];
  const suppliers = isLeads ? [] : suppliersIn(proposal.payload);
  const parts = isLeads ? [] : partsIn(proposal.payload);
  const total = leads.length + suppliers.length + parts.length;

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

      {/* 🔴 Model or fallback rules. Stated on every card, both ways — an
          unlabelled card would be ambiguous between "a model wrote this" and
          "this predates the field", and the reader would have to guess which. */}
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

      {proposal.dataUsed.length > 0 ? (
        <p style={{ margin: 0, fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
          Used: {proposal.dataUsed.join(' · ')}
        </p>
      ) : null}

      {total === 0 ? (
        // Per-card empty state. A proposal whose payload holds nothing with both
        // a name and a source is rare but real, and it is better said than left
        // as an empty box under a heading that promises candidates.
        <p style={{ margin: 0, fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
          This proposal carries no candidate with both a name and a source.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: primitive.space[3] }}>
          {leads.length > 0 ? (
            <CandidateList
              heading={`Potential customers (${leads.length})`}
              // The leads screen is the fuller view — table, contacts,
              // rationale. This is the summary beside the form that made it.
              items={leads.map((c) => ({
                key: `${c.organisationName}::${c.sourceUrl}`,
                primary: c.organisationName,
                secondary: [c.location, c.contactEmail, c.contactPhone].filter(Boolean).join(' · '),
                href: c.sourceUrl,
              }))}
            />
          ) : null}

          {suppliers.length > 0 ? (
            <CandidateList
              heading={`Suppliers (${suppliers.length})`}
              items={suppliers.map((c) => ({
                key: `${c.name}::${c.sourceUrl}`,
                primary: c.name,
                secondary: [c.city, c.country, c.contactEmail].filter(Boolean).join(' · '),
                href: c.sourceUrl,
              }))}
            />
          ) : null}

          {parts.length > 0 ? (
            <CandidateList
              heading={`Parts (${parts.length})`}
              items={parts.map((c) => ({
                key: `${c.name}::${c.sourceUrl}`,
                primary: c.name,
                // ⚠️ MINOR UNITS, PRINTED AS SUCH. Dividing by 100 here would
                // assume every currency has two decimal places, which is not
                // true, and this figure is SCRAPED — it is a candidate for a
                // human to check, not a price the product has adopted.
                secondary: [
                  c.partNumber,
                  c.supplierName,
                  c.priceMinor === undefined
                    ? undefined
                    : `${c.priceMinor} ${c.currency ?? 'minor units'} (as listed, unverified)`,
                ]
                  .filter(Boolean)
                  .join(' · '),
                href: c.sourceUrl,
              }))}
            />
          ) : null}
        </div>
      )}

      {proposal.decisionNote ? (
        <p style={{ margin: 0, fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
          Note: {proposal.decisionNote}
        </p>
      ) : null}

      <ProposalDecision
        proposalId={proposal.id}
        status={proposal.status}
        // 🔴 ONLY A LEAD PROPOSAL CAN BE APPLIED. `applyApprovedLeads` refuses
        // anything else outright ("That proposal is not a lead proposal"), so
        // offering the button on a supplier card would be a control that is
        // guaranteed to fail. The component says what happens instead.
        applicable={isLeads}
        label={proposal.action}
      />
    </article>
  );
}

/** A compact candidate list — name, a line of detail, and its source link. */
function CandidateList({
  heading,
  items,
}: {
  heading: string;
  items: Array<{ key: string; primary: string; secondary: string; href: string }>;
}) {
  return (
    <section>
      <h4
        style={{
          margin: `0 0 ${primitive.space[2]}`,
          fontSize: primitive.fontSize.xs,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: themeVar.textSecondary,
        }}
      >
        {heading}
      </h4>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: primitive.space[2] }}>
        {items.map((i) => (
          <li key={i.key} style={{ fontSize: primitive.fontSize.sm }}>
            <span style={{ fontWeight: 600 }}>{i.primary}</span>
            {i.secondary ? (
              <span style={{ color: themeVar.textSecondary }}> — {i.secondary}</span>
            ) : null}{' '}
            {/* Every candidate keeps its source. The reviewer is being asked to
                trust a scrape; the page it came from is the only way to check. */}
            <a href={i.href} target="_blank" rel="noreferrer noopener">
              source
              <span style={visuallyHidden}> for {i.primary}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
