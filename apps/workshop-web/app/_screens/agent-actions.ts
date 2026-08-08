'use server';

import { revalidatePath } from 'next/cache';
import { apiPatch, apiPost, type ApiResult } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * The agent layer's write actions — decide, apply, discover.
 *
 * IN THEIR OWN `'use server'` MODULE for the reason `register-actions.ts` gives:
 * a server action defined in a component file is one `'use client'` line away
 * from running in the browser, and these read the access token from an httpOnly
 * session cookie.
 *
 * ⚠️ NONE OF THEM IS THE AUTHORIZATION POINT. A server action is a public HTTP
 * endpoint like any other. `AgentProposalService.decide` and
 * `DiscoveryAgent.*` each call `assertWorkshopStaff`, migration 064's RLS
 * policies carry the same `<> 'customer'` clause, and `decide` refuses a second
 * decision with a single conditional UPDATE. Nothing here may be relied on to
 * protect anything (CLAUDE.md §8).
 *
 * ⚠️ AND NONE OF THEM DECIDES WHETHER APPROVAL WAS NEEDED. `approvalRequiredFor`
 * on the server derives that from the action class. The screens mirror it.
 */

type Failure = Exclude<ApiResult<unknown>, { ok: true }>;

/**
 * One sentence the person can act on.
 *
 * `invalid` and `forbidden` carry the API's OWN message, because the agent
 * layer's refusals are written to name the way forward — "No discovery agent is
 * connected. Set AGENT_HOST_URL and AGENT_HOST_TOKEN, or add the record by
 * hand", "Only an approved proposal can be applied — this one is rejected",
 * "This proposal was already approved." Replacing those with "something went
 * wrong" would delete the only useful part.
 */
function explain(failure: Failure, fallback: string): string {
  switch (failure.reason) {
    case 'invalid':
    case 'forbidden':
      return failure.message ?? fallback;
    case 'notFound':
      return 'That proposal no longer exists, or it belongs to another workshop.';
    case 'noMembership':
      // 🔴 NOT "your session has ended". This viewer IS signed in; they belong
      // to no workshop. Saying otherwise sends them to sign in again, which
      // changes nothing, and they loop.
      return (
        'You are signed in, but your account does not belong to a workshop yet. ' +
        'Create one from the dashboard, or ask the workshop owner to add you.'
      );
    case 'unauthenticated':
      return 'Your session has ended. Sign in again, then retry.';
    default:
      return 'The agent service did not respond. Nothing has been changed.';
  }
}

/**
 * Every route the agent screens are mounted at.
 *
 * 🔴 REVALIDATED AS A SET, because ONE screen is mounted at ONE PATH PER ROLE
 * TREE — the §34/§46-§49 trees group the same work differently — and a decision
 * taken from the side panel can happen on ANY page in the app. Revalidating a
 * single path would leave the leads screen stale for the reader looking at it,
 * on four trees out of five.
 *
 * ⚠️ IT MUST MATCH `packages/navigation/src/workspaces.ts`. A path listed here
 * that no tree carries revalidates nothing and fails SILENTLY — `revalidatePath`
 * does not report an unknown route. The reverse (a mounted route missing from
 * this list) is the stale-screen bug. Both are invisible at build time, which is
 * why they are listed together with the tree that owns each one.
 */
const AGENT_ROUTES = [
  '/customer-reception/leads', // DEFAULT §34
  '/parts-and-supply/discovery', // DEFAULT §34
  '/workshop-operations/leads', // owner §46
  '/parts-and-suppliers/discovery', // owner §46
  '/requests-and-reception/leads', // manager §47
  '/parts/discovery', // manager §47
] as const;

function revalidateAgentViews(): void {
  for (const route of AGENT_ROUTES) revalidatePath(route);
  // The shell reads the proposals for the side panel, so the layout itself is
  // stale after any decision.
  revalidatePath('/', 'layout');
}

/**
 * Approve or reject a proposal.
 *
 * ⚠️ APPROVING IS NOT APPLYING, and this action deliberately does only the
 * first. `AgentsController` keeps them apart so that "what was approved" and
 * "what gets written" are the same stored bytes — see `applyApprovedLeads`,
 * which reads the payload from the row rather than from any request.
 *
 * Returns `{ ok }` rather than throwing: the caller is a client component that
 * must keep the page and show the refusal.
 */
export async function decideProposalAction(
  proposalId: string,
  decision: 'approved' | 'rejected',
  note?: string,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = note?.trim();
  const result = await apiPost<unknown>('workshop', `/agents/proposals/${proposalId}/decision`, {
    decision,
    // Omitted when empty: the API's zod schema takes an optional note and
    // rejects nothing for its absence, while `''` is a note that says nothing.
    ...(trimmed ? { note: trimmed } : {}),
  });
  if (!result.ok) return { ok: false, error: explain(result, 'The decision was not recorded.') };
  revalidateAgentViews();
  return { ok: true };
}

/**
 * Write an APPROVED lead proposal's candidates into `crm.leads`.
 *
 * ⚠️ THE CANDIDATE LIST IS NOT SENT. The API reads it from the stored proposal.
 * If this posted the leads the screen is showing, the approval step would guard
 * nothing — a caller could approve three harmless leads and post three hundred
 * others. What was approved and what is written must be the same bytes.
 *
 * ⚠️ SAFE TO PRESS TWICE, and not because of anything here: `crm.leads` has a
 * unique constraint on (organization_id, organisation_name) with ON CONFLICT DO
 * NOTHING, and the proposal moves to `applied`, after which the API refuses
 * (`Only an approved proposal can be applied`). The count returned can
 * therefore legitimately be smaller than the number of candidates on screen —
 * which is why the caller reports the API's number and not its own.
 */
export async function applyLeadsAction(
  proposalId: string,
): Promise<{ ok: true; leadsCreated: number } | { ok: false; error: string }> {
  const result = await apiPost<{ leadsCreated: number }>(
    'workshop',
    `/agents/proposals/${proposalId}/apply-leads`,
    {},
  );
  if (!result.ok) return { ok: false, error: explain(result, 'The leads were not written.') };
  revalidateAgentViews();
  return { ok: true, leadsCreated: result.data.leadsCreated };
}

/**
 * Move a lead along the pipeline — `new` → `qualified` → `contacted` →
 * `converted`, or `rejected`.
 *
 * ⚠️ IN THIS FILE, THOUGH A LEAD IS NOT A PROPOSAL, because `AGENT_ROUTES` above
 * is the single list of the paths this screen is mounted at and it must not be
 * duplicated. A second copy in a `leads-actions.ts` would go stale the first
 * time a role tree moved the entry, and `revalidatePath` DOES NOT REPORT AN
 * UNKNOWN ROUTE — the failure is a stale screen with no error anywhere.
 *
 * ⚠️ NOTHING HERE CONTACTS ANYBODY. Setting `contacted` records that a human
 * did; it does not send anything. `crm.leads` has no outbound path at all, by
 * design (migration 064), and this action does not add one.
 */
export async function setLeadStatusAction(
  leadId: string,
  status: 'new' | 'qualified' | 'contacted' | 'converted' | 'rejected',
): Promise<{ ok: boolean; error?: string }> {
  const result = await apiPatch<unknown>('workshop', `/leads/${leadId}`, { status });
  if (!result.ok) {
    return {
      ok: false,
      // `explain`'s notFound sentence names a proposal, which would be the
      // wrong noun here and sends the reader looking in the wrong place.
      error:
        result.reason === 'notFound'
          ? 'That lead no longer exists, or it belongs to another workshop.'
          : explain(result, 'The lead was not updated.'),
    };
  }
  revalidateAgentViews();
  return { ok: true };
}

/**
 * Run supplier or lead discovery against a page a member of staff pasted.
 *
 * ⚠️ THE URL IS NOT VALIDATED HERE BEYOND BEING NON-EMPTY, and that is not
 * laziness. The API's zod schema rejects anything that is not a URL, and the
 * REAL guard — an allowlist plus refusal of private address ranges AFTER DNS
 * resolution — lives in the agent host, which is the process that actually
 * makes the request. A weaker copy here would invite the next reader to trust
 * this one. What this does do is fail fast on an empty field so the person is
 * not waiting on a round trip to be told they typed nothing.
 */
export async function runDiscoveryAction(formData: FormData): Promise<ActionResult> {
  const kind = String(formData.get('kind') ?? '');
  const url = String(formData.get('url') ?? '').trim();
  const brief = String(formData.get('brief') ?? '').trim();

  if (kind !== 'suppliers' && kind !== 'leads') {
    return { error: 'Choose whether to look for suppliers and parts, or for potential customers.' };
  }
  if (!url) return { error: 'Paste the address of the page to read.' };
  if (brief.length < 3) {
    return { error: 'Say what to look for — three characters or more. The agent uses it as context.' };
  }

  const result = await apiPost<{ proposalId: string | null }>(
    'workshop',
    `/agents/discover/${kind}`,
    { url, brief },
  );
  if (!result.ok) {
    return { error: explain(result, 'Discovery did not run. Nothing has been changed.') };
  }

  revalidateAgentViews();

  // 🔴 `proposalId` CAN BE NULL ON SUCCESS, and reporting that as a failure
  // would be wrong. `AgentProposalService.record` returns null when migration
  // 064's partial unique index finds an OPEN proposal from the same agent for
  // the same resource and does nothing — the earlier one is still waiting for a
  // decision. Discovery proposals carry no resource id today, so this branch is
  // not expected to fire; it is handled because a silent "created" for a row
  // that was not created is the harder failure to find later.
  return {
    created:
      result.data.proposalId === null
        ? 'nothing new — an earlier proposal from this agent is still waiting for a decision'
        : kind === 'leads'
          ? 'a lead proposal. Reload to review the candidates below'
          : 'a supplier proposal. Reload to review the candidates below',
  };
}
