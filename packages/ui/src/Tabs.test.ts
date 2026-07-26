import { describe, it, expect } from 'vitest';
import { nextTabId } from './Tabs';
import { assistantActionsFor, ASSISTANT_ACTIONS } from './AiAssistantPanel';

/**
 * Keyboard and permission contracts for the shell components.
 *
 * These assert behaviour that typecheck and the production build both pass
 * happily while it is broken: arrow-key order, wrapping, and which assistant
 * actions a viewer is offered.
 */

describe('nextTabId — WAI-ARIA tab strip keyboard contract', () => {
  const order = ['intake', 'diagnosis', 'quotation', 'execution'];

  it('ArrowRight and ArrowDown both move forward', () => {
    expect(nextTabId(order, 'intake', 'ArrowRight')).toBe('diagnosis');
    expect(nextTabId(order, 'intake', 'ArrowDown')).toBe('diagnosis');
  });

  it('ArrowLeft and ArrowUp both move back', () => {
    expect(nextTabId(order, 'quotation', 'ArrowLeft')).toBe('diagnosis');
    expect(nextTabId(order, 'quotation', 'ArrowUp')).toBe('diagnosis');
  });

  it('wraps forward past the last tab', () => {
    expect(nextTabId(order, 'execution', 'ArrowRight')).toBe('intake');
  });

  it('wraps backward past the first tab', () => {
    expect(nextTabId(order, 'intake', 'ArrowLeft')).toBe('execution');
  });

  it('Home and End jump to the ends', () => {
    expect(nextTabId(order, 'quotation', 'Home')).toBe('intake');
    expect(nextTabId(order, 'diagnosis', 'End')).toBe('execution');
  });

  it('ignores keys the pattern does not own, so typing is not hijacked', () => {
    for (const key of ['a', 'Enter', ' ', 'Tab', 'Escape', 'PageDown']) {
      expect(nextTabId(order, 'intake', key)).toBeUndefined();
    }
  });

  it('returns undefined for an unknown current tab rather than guessing', () => {
    expect(nextTabId(order, 'not-a-tab', 'ArrowRight')).toBeUndefined();
  });

  it('handles a single-tab strip without wrapping onto nothing', () => {
    expect(nextTabId(['only'], 'only', 'ArrowRight')).toBe('only');
    expect(nextTabId(['only'], 'only', 'ArrowLeft')).toBe('only');
  });

  it('is safe on an empty strip', () => {
    expect(nextTabId([], 'anything', 'ArrowRight')).toBeUndefined();
  });
});

describe('assistantActionsFor — §8 actions are permission-filtered for display', () => {
  it('offers ungated actions to a viewer with no grants at all', () => {
    const visible = assistantActionsFor(ASSISTANT_ACTIONS, []);
    expect(visible.map((a) => a.id)).toContain('explain-page');
    expect(visible.map((a) => a.id)).toContain('summarize-job');
  });

  it('hides gated actions until the grant is present', () => {
    const withoutGrants = assistantActionsFor(ASSISTANT_ACTIONS, []).map((a) => a.id);
    expect(withoutGrants).not.toContain('draft-quotation');
    expect(withoutGrants).not.toContain('workshop-performance');

    const withGrant = assistantActionsFor(ASSISTANT_ACTIONS, ['quotation.draft']).map((a) => a.id);
    expect(withGrant).toContain('draft-quotation');
    // One grant must not unlock a different gated action.
    expect(withGrant).not.toContain('workshop-performance');
  });

  it('carries every action named in the 02.txt §8 list', () => {
    // The spec enumerates nine. If someone quietly drops one, this fails.
    expect(ASSISTANT_ACTIONS).toHaveLength(9);
    expect(ASSISTANT_ACTIONS.map((a) => a.label)).toEqual([
      'Explain this page',
      'Summarize this job',
      'Search repair procedures',
      'Prepare a customer explanation',
      'Find compatible parts',
      'Draft a quotation',
      'Identify pending approvals',
      'Recommend next task',
      'Summarize workshop performance',
    ]);
  });
});
