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
  status: 'proposed' | 'awaiting-approval' | 'running' | 'complete' | 'rejected' | 'failed';
  /** Populated when status is 'failed' — §70 requires the failure be visible. */
  error?: string;
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
  /** Shown when the assistant is unavailable, e.g. the local LLM is down. */
  unavailableReason?: string;
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
  unavailableReason,
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

        {proposals.length === 0 ? (
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
