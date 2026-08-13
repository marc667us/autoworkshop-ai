import { apiGet } from '@autoworkshop/next-shell';
import type { AgentProposal } from '@autoworkshop/ui';
import { toPanelProposal, type ApiProposal } from './agent-proposals';

/**
 * WHAT THE ASSISTANT PANEL SHOWS, READ ON THE SERVER — the wiring that makes
 * `apps/api/src/agents` visible to a human being.
 *
 * ── 🔴 WHY THE SHELL AND NOT A SCREEN ──────────────────────────────────────
 *
 * `02.txt` §8's first sentence is the constraint: the assistant "shall be
 * available as a side panel rather than replacing ordinary application
 * navigation". The panel is rendered by `AppShell` on every page, so its data
 * has to be resolved by the thing that renders every page — this app's root
 * layout. There is no route to put it on.
 *
 * ── ⚠️ IT NEVER BREAKS THE SHELL, AND IT NEVER LIES EITHER ─────────────────
 *
 * Same rule as `live-counters.ts`: this decorates the frame around every page,
 * so a failure must not take the navigation down with it. But silence is the
 * wrong fallback HERE, and that is the difference between the two. A missing
 * badge says nothing; an empty assistant panel says "the assistant has proposed
 * nothing", which is a claim — and if the agent service is simply unreachable,
 * it is a false one. So a failure returns a REASON, which the panel renders in
 * place of the list. §70 and `05.txt` §2 both want the error state visible.
 */

/** How many proposals the side panel carries. */
const PANEL_LIMIT = 8;

export interface AssistantPanelData {
  proposals: AgentProposal[];
  /**
   * `null` — there IS an assistant and it answered.
   * a string — what to tell the reader instead.
   * `undefined` — no claim from here; `AppShell` renders its own honest default
   * (the six apps with no agent host keep exactly that message).
   */
  unavailableReason: string | null | undefined;
}

/** No claim, no proposals — for a viewer this app cannot ask on behalf of. */
const NO_CLAIM: AssistantPanelData = { proposals: [], unavailableReason: undefined };

export async function assistantPanelData(signedIn: boolean): Promise<AssistantPanelData> {
  // A signed-out visitor has no workshop to have proposals in, and asking would
  // be a guaranteed 401 on every public page load — the apex landing is public
  // and is the busiest route in this app.
  if (!signedIn) return NO_CLAIM;

  // Unfiltered, then trimmed here. The endpoint takes `?status=` and returning
  // only the open ones was the alternative — rejected because a reviewer who
  // has just approved something would watch it vanish with no confirmation that
  // anything happened, and the panel is where they pressed the button.
  const result = await apiGet<ApiProposal[]>('workshop', '/agents/proposals');

  if (!result.ok) {
    switch (result.reason) {
      case 'forbidden':
        // 🔴 EXPECTED, NOT AN ERROR. `AgentProposalService.list` calls
        // `assertWorkshopStaff`, and since migration 061 made the customer role
        // self-service, "a customer" is any signed-up stranger. They can hold a
        // membership of this workshop's organisation and still — correctly —
        // not be staff. Telling them the service is broken would be false.
        return {
          proposals: [],
          unavailableReason:
            'The assistant works on behalf of workshop staff. Your account is not staff of this workshop.',
        };
      case 'unauthenticated':
      case 'noMembership':
        // Both are answered as 401 by TenantGuard and mean different things, but
        // the panel's advice is the same for either: this is not the place to
        // fix it. The account controls in the top bar and the dashboard's
        // onboarding screen say the specific thing.
        return { proposals: [], unavailableReason: 'Sign in to a workshop to use the assistant.' };
      default:
        return {
          proposals: [],
          unavailableReason:
            'The assistant could not be reached just now. Nothing is lost — every task here can still be completed manually, and proposals already made are still waiting.',
        };
    }
  }

  return {
    // Newest first is the API's own order (`ORDER BY created_at DESC`), so the
    // slice keeps the most recent rather than an arbitrary set.
    proposals: result.data.slice(0, PANEL_LIMIT).map(toPanelProposal),
    // 🔴 `null`, EXPLICITLY. `undefined` would mean "no claim" and the shell
    // would render its Phase-8 message over a list of real proposals. The
    // distinction is the whole contract of that prop.
    unavailableReason: null,
  };
}
