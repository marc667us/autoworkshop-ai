import type { Meta, StoryObj } from '@storybook/react';
import { AiAssistantPanel, ASSISTANT_ACTIONS, assistantActionsFor } from '@autoworkshop/ui';

/**
 * AI assistant side panel (`02.txt` §8).
 *
 * §8 requires the assistant to disclose, before anything happens: the proposed
 * action, the data it will use, whether it only reads or changes data, whether
 * approval is required, and its sources. All five are structural props on
 * `AgentProposal`, not free text the model is trusted to include — a
 * disclosure the model can forget to write is not a disclosure.
 *
 * The panel is NOT connected to an agent yet (that is Phase 8) and says so
 * plainly, rather than presenting an input box that silently swallows
 * questions.
 */
const meta = {
  title: 'Shell/AiAssistantPanel',
  component: AiAssistantPanel,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof AiAssistantPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A read-only proposal: no approval needed, because nothing changes. */
const readOnlyProposal = {
  id: 'p1',
  action: 'Summarise job card JC-2291 for the customer',
  dataUsed: ['Job card JC-2291', 'Vehicle GR-4471-22 service history'],
  actionClass: 'read-only' as const,
  approvalRequired: false,
  status: 'complete' as const,
  result:
    'The vehicle came in for a brake noise. A worn front disc was found and replaced; the pads were within tolerance and were left in place.',
  sources: [
    { label: 'Job card JC-2291', href: '/job-cards/JC-2291' },
    { label: 'Service history GR-4471-22', href: '/vehicles/GR-4471-22/history' },
  ],
  confidence: 0.86,
};

/** A privileged proposal: changes data, so it is blocked pending approval. */
const privilegedProposal = {
  id: 'p2',
  action: 'Apply a 10% goodwill discount to invoice INV-8841',
  dataUsed: ['Invoice INV-8841', 'Customer account C-2210'],
  actionClass: 'privileged' as const,
  approvalRequired: true,
  approverRole: 'Workshop manager',
  status: 'awaiting-approval' as const,
  sources: [{ label: 'Invoice INV-8841', href: '/invoices/INV-8841' }],
  confidence: 0.61,
};

export const Default: Story = {
  args: { actions: ASSISTANT_ACTIONS, onRunAction: () => {} },
};

/** Nothing proposed yet — the panel explains what it can do. */
export const Idle: Story = {
  args: { actions: ASSISTANT_ACTIONS, proposals: [], onRunAction: () => {} },
};

/** Read-only result, with its sources listed so the answer can be checked. */
export const ReadOnlyResult: Story = {
  args: { actions: ASSISTANT_ACTIONS, proposals: [readOnlyProposal], onRunAction: () => {} },
};

/**
 * The approval gate. §8 and CLAUDE.md §14: the human approves before anything
 * that changes data. The server re-validates the approver — this control is
 * the affordance, never the enforcement.
 */
export const AwaitingApproval: Story = {
  args: {
    actions: ASSISTANT_ACTIONS,
    proposals: [privilegedProposal],
    onApprove: () => {},
    onReject: () => {},
  },
};

/** Actions are filtered by the viewer's grants before they are ever offered. */
export const RestrictedViewer: Story = {
  args: {
    actions: assistantActionsFor(ASSISTANT_ACTIONS, []),
    onRunAction: () => {},
  },
};

export const Busy: Story = {
  args: { actions: ASSISTANT_ACTIONS, busy: true, onRunAction: () => {} },
};

/**
 * Unavailable — names the reason. The zero-cost LLM runs locally, so "the
 * assistant is down" is a normal, recoverable state and the panel says which
 * part is down rather than failing silently.
 */
export const Unavailable: Story = {
  args: {
    actions: ASSISTANT_ACTIONS,
    unavailableReason: 'The local model host (Ollama) is not responding.',
  },
};

/** A failed run keeps the error attached to the proposal that produced it. */
export const Failed: Story = {
  args: {
    actions: ASSISTANT_ACTIONS,
    proposals: [
      {
        ...readOnlyProposal,
        id: 'p3',
        status: 'failed' as const,
        result: undefined,
        error: 'The model host timed out after 30 seconds.',
      },
    ],
  },
};

export const Mobile: Story = {
  args: { actions: ASSISTANT_ACTIONS, proposals: [readOnlyProposal], onRunAction: () => {} },
  parameters: { viewport: { defaultViewport: 'mobile' } },
};
