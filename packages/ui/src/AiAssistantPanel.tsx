'use client';

import * as React from 'react';
import { themeVar, primitive } from '@autoworkshop/design-tokens';

/**
 * AI assistant side panel — `autoworkshop 02.txt` §8.
 *
 * The spec's first sentence is the design constraint: the assistant "shall be
 * available as a side panel rather than replacing ordinary application
 * navigation". So this is a panel rendered into the shell's drawer slot, never
 * a route, and the page stays visible and usable beside it.
 *
 * THIS COMPONENT IS PRESENTATION ONLY, AND THAT IS DELIBERATE.
 * It renders proposals and collects the user's decision. It does not call an
 * agent, does not hold a credential, and does not decide whether an action is
 * permitted. Per the plan's §5 chain —
 *   ADK agent → MCP client → MCP Gateway → MCP server → NestJS domain service
 * — the gateway and the domain service are what authorize and execute. A UI
 * that decided its own permissions would be exactly the "hidden ≠ secure"
 * failure the directive forbids: what this panel shows is a *mirror* of the
 * server's decision, never the decision itself.
 *
 * WHAT §8 REQUIRES THE PANEL TO DISPLAY, and why each is non-optional:
 *   - the action it proposes            → the user must know what will happen
 *   - the information it intends to use → tenant data leaving the tenant's view
 *                                          is a consent question, not a detail
 *   - read-only, or changes data        → the §5 Class A/B vs C/D distinction
 *   - whether approval is required      → Class C/D need a human before, not after
 *   - the resulting sources or records  → an unsourced AI claim about a repair
 *                                          is unsafe (plan risk #7)
 *
 * The `AgentProposal` type below makes all five REQUIRED fields. A proposal that
 * cannot say what it will touch cannot be rendered — that is the point. It is
 * far easier to omit a disclosure when it is optional than to notice it missing
 * in review six months later.
 */

/** The §5 human-in-the-loop classes, carried on every proposal. */
export type ActionClass =
  /** A — read-only, tenant-filtered, audited. Auto-executes. */
  | 'read-only'
  /** B — produces a draft the user reviews. Auto-executes, output is not committed. */
  | 'draft'
  /** C — business-committing. Needs an authenticated role approval. */
  | 'business-committing'
  /** D — safety, financial or privileged. Needs privileged approval, often dual control. */
  | 'privileged';

export interface ProposalSource {
  label: string;
  /** Link to the underlying business record, so a claim can always be checked. */
  href?: string;
}

/**
 * WHAT ACTUALLY PRODUCED THE ANSWER.
 *
 * 🔴 `'rules'` MEANS NO MODEL RAN. The API's agent host falls back to
 * deterministic keyword matching when the LLM is unreachable, and it records
 * which of the two answered on every proposal (`source` on `agents.proposals`).
 *
 * Rendering the two identically would present a keyword match as a machine's
 * judgement — the reader would extend it trust it has not earned, and would
 * have no way to tell that the thing they believe is reading the complaint is
 * in fact matching the word "brake". This repository's recorded failure class
 * is "a truth about A used as evidence for B"; this is that, with the reader's
 * confidence as the currency. So it is disclosed on the card, in words.
 */
export type ProposalMechanism = 'model' | 'rules';

export interface AgentProposal {
  id: string;
  /** "the action it proposes" (§8). */
  action: string;
  /** "the information it intends to use" (§8). */
  dataUsed: readonly string[];
  /** "whether the action is read-only or changes data" (§8). */
  actionClass: ActionClass;
  /** "whether approval is required" (§8) — as decided by the server, not here. */
  approvalRequired: boolean;
  /** Who must approve, when the server says approval is required. */
  approverRole?: string;
  /** "the resulting sources or business records" (§8). */
  sources?: readonly ProposalSource[];
  /** The assistant's answer, once it has one. */
  result?: string;
  /**
   * Model self-reported confidence. Rendered with an explicit caveat: the plan
   * requires AI output be surfaced as candidate leads, never as diagnosis.
   */
  confidence?: number;
  /**
   * Model, or deterministic fallback rules. Optional ONLY because a caller that
   * has no such fact (a fixture, Storybook, a future non-agent proposal) must
   * not be forced to assert one — an absent mechanism renders as no claim at
   * all, which is honest. Every proposal coming from `agents.proposals` carries
   * it, because the column is NOT NULL.
   */
  source?: ProposalMechanism;
  /**
   * ⚠️ `approved` AND `applied` ARE THE API'S OWN STATES, not UI inventions.
   * `agents.proposals.status` moves proposed → awaiting-approval → approved →
   * applied, and a lead proposal is only written to `crm.leads` at the LAST of
   * those. Collapsing `approved` into `complete` — which was the alternative —
   * would have told a reviewer their approval had already taken effect while
   * the leads were still unwritten, and the Apply button they still had to
   * press would have looked like a duplicate.
   *
   * `running`, `complete` and `failed` have no server counterpart today; they
   * belong to the interactive actions above, which no agent serves yet.
   */
  status:
    | 'proposed'
    | 'awaiting-approval'
    | 'running'
    | 'complete'
    | 'approved'
    | 'applied'
    | 'rejected'
    | 'failed';
  /** Populated when status is 'failed' — §70 requires the failure be visible. */
  error?: string;
  /**
   * Where the full record lives, when a screen shows more than this card can.
   * Rendered as a plain link — the panel cannot route, it has no router.
   */
  detailHref?: string;
}

/** A role-aware quick action from the §8 list. */
export interface AssistantAction {
  id: string;
  label: string;
  /** Hidden when the viewer lacks this grant. UX only — the server re-checks. */
  requiresGrant?: string;
}

/**
 * The §8 action list, verbatim. Exported so each workspace can filter it rather
 * than retype it — the fleet workspace has no use for "Recommend next task",
 * but it must not invent its own wording for the ones it does show.
 */
export const ASSISTANT_ACTIONS: readonly AssistantAction[] = [
  { id: 'explain-page', label: 'Explain this page' },
  { id: 'summarize-job', label: 'Summarize this job' },
  { id: 'search-procedures', label: 'Search repair procedures' },
  { id: 'customer-explanation', label: 'Prepare a customer explanation' },
  { id: 'find-parts', label: 'Find compatible parts' },
  { id: 'draft-quotation', label: 'Draft a quotation', requiresGrant: 'quotation.draft' },
  { id: 'pending-approvals', label: 'Identify pending approvals' },
  { id: 'next-task', label: 'Recommend next task' },
  { id: 'workshop-performance', label: 'Summarize workshop performance', requiresGrant: 'analytics.view' },
] as const;

const CLASS_LABEL: Record<ActionClass, { text: string; changesData: boolean }> = {
  'read-only': { text: 'Read-only', changesData: false },
  draft: { text: 'Creates a draft', changesData: false },
  'business-committing': { text: 'Changes data', changesData: true },
  privileged: { text: 'Changes data — privileged', changesData: true },
};

/**
 * The message shown by every workspace that has NOT been wired to an agent.
 *
 * ⚠️ IT IS STILL TRUE FOR SIX OF THE SEVEN APPS. `apps/api/src/agents` serves
 * the WORKSHOP workspace; customer, supplier, fleet, insurance, towing and
 * admin have no agent behind them, and this sentence is what an honest panel
 * says there. It is the DEFAULT rather than a hardcoded string precisely so
 * that wiring one app cannot silently make the other six claim a connection
 * they do not have — see `AppShell`'s `assistantUnavailableReason`.
 */
export const DEFAULT_ASSISTANT_UNAVAILABLE_REASON =
  'The assistant connects in Phase 8, once the agent host and MCP gateway are in place. ' +
  'Its actions are listed here so the panel it will fill is real, not a surprise.';

export interface AiAssistantPanelProps {
  /** Actions offered to this viewer. Filter with `assistantActionsFor`. */
  actions?: readonly AssistantAction[];
  proposals?: readonly AgentProposal[];
  onRunAction?: (actionId: string) => void;
  /** Approve a Class C/D proposal. The server re-validates the approver. */
  onApprove?: (proposalId: string) => void;
  onReject?: (proposalId: string) => void;
  /** True while a request is in flight — §70 loading state. */
  busy?: boolean;
  /**
   * Shown INSTEAD of the panel when there is no assistant to talk to.
   *
   * ⚠️ `null` MEANS "there IS one", and is the only way to say so. `undefined`
   * is not that statement — it is the absence of one — so it falls back to the
   * honest default above. A wired app passes `null` deliberately; an app that
   * forgets keeps the message that was already true for it.
   */
  unavailableReason?: string | null;
  /**
   * A failed decision, in the API's own words.
   *
   * §70 requires the failure be visible, and a decision is the one place in
   * this panel where silence is actively misleading: a reviewer who pressed
   * Approve and saw nothing move assumes it worked. "This proposal was already
   * approved" is a sentence they can act on, so it is shown verbatim.
   */
  error?: string | null;
  /** Rendered under the heading — the panel's own empty/loading nuance. */
  loading?: boolean;
}

/** Filter the §8 actions by the viewer's grants. Presentation only. */
export function assistantActionsFor(
  actions: readonly AssistantAction[],
  grants: readonly string[],
): AssistantAction[] {
  return actions.filter((a) => !a.requiresGrant || grants.includes(a.requiresGrant));
}

export function AiAssistantPanel({
  actions = ASSISTANT_ACTIONS,
  proposals = [],
  onRunAction,
  onApprove,
  onReject,
  busy = false,
  // ⚠️ NO DEFAULT HERE, DELIBERATELY. The default belongs to `AppShell`, which
  // is what every app actually renders. Defaulting it in this component would
  // mean `<AiAssistantPanel proposals={…} />` — the Storybook and test usage —
  // silently rendered "unavailable" over a list of real proposals.
  unavailableReason,
  error,
  loading = false,
}: AiAssistantPanelProps) {
  if (unavailableReason) {
    return (
      <div role="status" style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
        <p style={{ margin: 0 }}>The assistant is unavailable.</p>
        <p style={{ margin: `${primitive.space[2]} 0 0` }}>{unavailableReason}</p>
        <p style={{ margin: `${primitive.space[3]} 0 0` }}>
          Every task here can still be completed manually — the assistant is an aid, never a
          dependency.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: primitive.space[4] }}>
      <section aria-labelledby="aw-assistant-actions">
        <h3
          id="aw-assistant-actions"
          style={{
            margin: 0,
            fontSize: primitive.fontSize.xs,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: themeVar.textSecondary,
          }}
        >
          Suggested actions
        </h3>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: primitive.space[2],
            marginTop: primitive.space[3],
          }}
        >
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onRunAction?.(a.id)}
              disabled={busy}
              style={{
                padding: `${primitive.space[2]} ${primitive.space[3]}`,
                borderRadius: primitive.radius.full,
                border: `1px solid ${themeVar.borderDefault}`,
                background: 'transparent',
                color: themeVar.textPrimary,
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.6 : 1,
                fontSize: primitive.fontSize.sm,
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="aw-assistant-proposals">
        <h3
          id="aw-assistant-proposals"
          style={{
            margin: 0,
            fontSize: primitive.fontSize.xs,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: themeVar.textSecondary,
          }}
        >
          Assistant activity
        </h3>

        {/* §70/`05.txt` §2 — a failed decision must be VISIBLE. `role="alert"`
            so it is announced: the reviewer's eyes are on the button they just
            pressed, not on the top of the panel. */}
        {error ? (
          <p
            role="alert"
            style={{
              margin: `${primitive.space[3]} 0 0`,
              color: themeVar.statusBlocked,
              fontSize: primitive.fontSize.sm,
            }}
          >
            {error}
          </p>
        ) : null}

        {loading ? (
          <p
            role="status"
            style={{
              margin: `${primitive.space[3]} 0 0`,
              color: themeVar.textSecondary,
              fontSize: primitive.fontSize.sm,
            }}
          >
            Loading what the assistant has proposed…
          </p>
        ) : proposals.length === 0 ? (
          <p
            style={{
              margin: `${primitive.space[3]} 0 0`,
              color: themeVar.textSecondary,
              fontSize: primitive.fontSize.sm,
            }}
          >
            Nothing yet. Pick an action above — the assistant will tell you what it plans to do and
            what it will look at before it does anything.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: `${primitive.space[3]} 0 0`, padding: 0 }}>
            {proposals.map((p) => (
              <li key={p.id} style={{ marginBottom: primitive.space[3] }}>
                <ProposalCard
                  proposal={p}
                  onApprove={onApprove ? () => onApprove(p.id) : undefined}
                  onReject={onReject ? () => onReject(p.id) : undefined}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ProposalCard({
  proposal,
  onApprove,
  onReject,
}: {
  proposal: AgentProposal;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  const classInfo = CLASS_LABEL[proposal.actionClass];
  const needsDecision = proposal.status === 'awaiting-approval' && proposal.approvalRequired;

  return (
    <article
      style={{
        border: `1px solid ${needsDecision ? themeVar.statusAttention : themeVar.borderDefault}`,
        borderRadius: primitive.radius.md,
        padding: primitive.space[3],
        display: 'flex',
        flexDirection: 'column',
        gap: primitive.space[2],
        fontSize: primitive.fontSize.sm,
      }}
    >
      <p style={{ margin: 0, fontWeight: 600 }}>{proposal.action}</p>

      {/* §8: read-only vs changes data. Shown as text, not only as a colour —
          "changes data" is too important to encode in a hue. */}
      <p style={{ margin: 0, color: classInfo.changesData ? themeVar.statusAttention : themeVar.textSecondary }}>
        {classInfo.text}
        {proposal.approvalRequired
          ? ` · approval required${proposal.approverRole ? ` (${proposal.approverRole})` : ''}`
          : ''}
      </p>

      {/* §8: the information it intends to use. */}
      {proposal.dataUsed.length > 0 ? (
        <div style={{ color: themeVar.textSecondary }}>
          <span>Will use: </span>
          <span>{proposal.dataUsed.join(', ')}</span>
        </div>
      ) : null}

      {/* 🔴 WHICH MECHANISM ANSWERED. Never a colour or an icon alone: "a model
          read this" and "a keyword list matched this" are different claims
          about how much the reader should trust it, and §66 forbids colour as
          the only signal anyway.

          The `model` line is stated too, rather than left implicit. If only the
          fallback were labelled, an unlabelled card would be ambiguous between
          "a model wrote it" and "this proposal predates the field" — and the
          reader would have to know which to assume. */}
      {proposal.source === 'rules' ? (
        <p style={{ margin: 0, color: themeVar.statusAttention }}>
          Produced by fixed keyword rules — the AI model was not reachable. Read it as a checklist,
          not as a judgement.
        </p>
      ) : proposal.source === 'model' ? (
        <p style={{ margin: 0, color: themeVar.textSecondary }}>Produced by the AI model.</p>
      ) : null}

      {proposal.status === 'running' ? (
        <p role="status" style={{ margin: 0, color: themeVar.textSecondary }}>
          Working…
        </p>
      ) : null}

      {proposal.status === 'failed' && proposal.error ? (
        <p role="alert" style={{ margin: 0, color: themeVar.statusBlocked }}>
          {proposal.error}
        </p>
      ) : null}

      {proposal.status === 'rejected' ? (
        <p style={{ margin: 0, color: themeVar.textSecondary }}>Rejected — nothing was changed.</p>
      ) : null}

      {/* ⚠️ APPROVED IS NOT DONE, and saying otherwise would be the expensive
          half of this distinction. `AgentProposal.status`'s own note explains
          why the two states are kept apart; this is where a reader learns that
          there is still something to press.
          ⚠️ THE NEXT STEP IS NAMED BUT NOT ROUTED, deliberately. This package
          has no router and each of the seven workspaces — and, in the workshop,
          each of the five ROLE TREES — reaches the Leads screen by a different
          path. A hardcoded "Sales → Leads" was written here first and was
          already wrong by the time the nav entry settled into Customer
          Reception. A menu path stated in a component that cannot see the menu
          is a claim nothing keeps true. */}
      {proposal.status === 'approved' ? (
        <p style={{ margin: 0, color: themeVar.statusAttention }}>
          Approved — not applied yet. Open the Leads screen to write the approved records.
        </p>
      ) : null}

      {proposal.status === 'applied' ? (
        <p style={{ margin: 0, color: themeVar.textSecondary }}>Approved and applied.</p>
      ) : null}

      {proposal.result ? <p style={{ margin: 0 }}>{proposal.result}</p> : null}

      {typeof proposal.confidence === 'number' ? (
        // Confidence is always paired with the caveat. The plan is explicit
        // that AI output is a candidate lead requiring technician confirmation,
        // and a bare percentage reads as certainty.
        <p style={{ margin: 0, color: themeVar.textSecondary, fontSize: primitive.fontSize.xs }}>
          Confidence {Math.round(proposal.confidence * 100)}% — a suggestion to check, not a
          diagnosis. A qualified technician confirms before this is acted on.
        </p>
      ) : null}

      {/* §8: the resulting sources or business records. */}
      {proposal.sources && proposal.sources.length > 0 ? (
        <div>
          <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.xs }}>Sources: </span>
          {proposal.sources.map((s, i) => (
            <React.Fragment key={`${s.label}-${i}`}>
              {i > 0 ? ', ' : ''}
              {s.href ? (
                <a href={s.href} style={{ color: themeVar.actionPrimary }}>
                  {s.label}
                </a>
              ) : (
                <span>{s.label}</span>
              )}
            </React.Fragment>
          ))}
        </div>
      ) : null}

      {needsDecision ? (
        <div style={{ display: 'flex', gap: primitive.space[2] }}>
          <button
            type="button"
            onClick={onApprove}
            style={{
              padding: `${primitive.space[1]} ${primitive.space[3]}`,
              borderRadius: primitive.radius.md,
              border: 'none',
              background: themeVar.actionPrimary,
              color: primitive.color.grey[0],
              cursor: 'pointer',
              fontSize: primitive.fontSize.sm,
            }}
          >
            Approve
          </button>
          <button
            type="button"
            onClick={onReject}
            style={{
              padding: `${primitive.space[1]} ${primitive.space[3]}`,
              borderRadius: primitive.radius.md,
              border: `1px solid ${themeVar.borderDefault}`,
              background: 'transparent',
              color: themeVar.textPrimary,
              cursor: 'pointer',
              fontSize: primitive.fontSize.sm,
            }}
          >
            Reject
          </button>
        </div>
      ) : null}
    </article>
  );
}
