import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isOpen,
  leadsIn,
  partsIn,
  suppliersIn,
  toPanelProposal,
  type ApiProposal,
} from './agent-proposals';

/**
 * 🔴 THE TWO THINGS THIS SCREEN COULD GET WRONG SILENTLY.
 *
 *  1. DROPPING `source`. The API records whether an answer came from the model
 *     or from the deterministic keyword rules it falls back to when the agent
 *     host is unreachable. If this mapping loses that field, a keyword match is
 *     presented to a member of staff as a machine's judgement, and there is
 *     nothing on screen to tell them otherwise. No typecheck catches it —
 *     `source` is optional on `AgentProposal` precisely so fixtures need not
 *     assert one.
 *
 *  2. RENDERING A CANDIDATE THE API WILL NOT WRITE. `applyApprovedLeads` skips
 *     any lead missing `organisationName` or `sourceUrl`. A screen that lists
 *     them anyway promises records that never appear, and "Apply" then reports
 *     a smaller number than the reviewer counted.
 *
 * The field names are checked against the API's own source rather than
 * restated, for the reason `staff-roles.spec.ts` gives: a hand-copied contract
 * drifts with the very edit that breaks it.
 */

const row = (over: Partial<ApiProposal> = {}): ApiProposal => ({
  id: '11111111-1111-4111-8111-111111111111',
  agentName: 'lead-discovery',
  actionClass: 'business-committing',
  action: 'Add 2 potential customer(s) found at example.com to the lead list',
  dataUsed: ['the public web page https://example.com'],
  sources: [{ label: 'Scraped page: example.com', href: 'https://example.com' }],
  payload: {},
  confidence: null,
  source: 'model',
  resourceType: null,
  resourceId: null,
  status: 'awaiting-approval',
  approvalRequired: true,
  createdAt: '2026-08-08T10:00:00.000Z',
  decidedAt: null,
  decisionNote: null,
  ...over,
});

describe('the API contract this screen is mapped from', () => {
  const source = readFileSync(
    join(__dirname, '../../../api/src/agents/agent-proposal.service.ts'),
    'utf8',
  );
  const block = /export interface ProposalRow \{([\s\S]*?)\n\}/.exec(source);

  it('found ProposalRow to compare against', () => {
    // Guards the regex. Without it every assertion below runs against an empty
    // string and passes while proving nothing — the check-that-walks-through-
    // its-own-gap failure this repository keeps recording.
    expect(block, 'could not find ProposalRow in agent-proposal.service.ts').toBeTruthy();
    expect(block?.[1]?.length ?? 0).toBeGreaterThan(100);
  });

  it.each([
    'agentName',
    'actionClass',
    'action',
    'dataUsed',
    'sources',
    'payload',
    'confidence',
    'source',
    'status',
    'approvalRequired',
    'decisionNote',
  ])('still declares %s', (field) => {
    expect(
      new RegExp(`\\b${field}\\??:`).test(block?.[1] ?? ''),
      `this screen reads "${field}" and ProposalRow no longer declares it`,
    ).toBe(true);
  });

  it("still types source as exactly 'model' | 'rules'", () => {
    // The panel's disclosure is written for these two values. A third would
    // render as no claim at all, which is the one outcome that must not pass
    // unnoticed.
    expect(/source:\s*'model'\s*\|\s*'rules'/.test(block?.[1] ?? '')).toBe(true);
  });
});

describe('toPanelProposal', () => {
  it('carries the rules fallback through, so the panel can disclose it', () => {
    expect(toPanelProposal(row({ source: 'rules' })).source).toBe('rules');
  });

  it('carries a model answer through as a model answer', () => {
    expect(toPanelProposal(row({ source: 'model' })).source).toBe('model');
  });

  it.each(['proposed', 'awaiting-approval', 'approved', 'applied', 'rejected'] as const)(
    'keeps the server status %s',
    (status) => {
      expect(toPanelProposal(row({ status })).status).toBe(status);
    },
  );

  it('shows an unrecognised status as proposed rather than inventing an outcome', () => {
    // A status this build does not know is a deployment skew. `complete` would
    // announce a result nobody produced; `failed` would report an error that has
    // not happened.
    expect(toPanelProposal(row({ status: 'superseded' })).status).toBe('proposed');
  });

  it('omits confidence when the API has none, rather than sending 0', () => {
    // 0 would render "Confidence 0% — a suggestion to check", which is a
    // statement about the answer's quality that nobody made.
    expect(toPanelProposal(row({ confidence: null })).confidence).toBeUndefined();
    expect(toPanelProposal(row({ confidence: 0.8 })).confidence).toBe(0.8);
  });

  it('never claims an approver role, because the API does not say who', () => {
    expect(toPanelProposal(row()).approverRole).toBeUndefined();
  });

  it('drops sources that carry no label, and keeps ones with no href', () => {
    const mapped = toPanelProposal(
      row({ sources: [{ href: 'https://x.test' }, { label: 'Ledger entry' }, 'nonsense'] }),
    );
    expect(mapped.sources).toEqual([{ label: 'Ledger entry' }]);
  });

  it('survives sources arriving as something other than an array', () => {
    expect(toPanelProposal(row({ sources: null })).sources).toEqual([]);
    expect(toPanelProposal(row({ sources: { label: 'x' } })).sources).toEqual([]);
  });
});

describe('leadsIn', () => {
  const good = { organisationName: 'Kofi Motors', sourceUrl: 'https://dir.test/kofi' };

  it('returns the candidates the API would actually write', () => {
    expect(leadsIn({ leads: [good] })).toEqual([good]);
  });

  it.each([
    ['no organisation name', { sourceUrl: 'https://dir.test/x' }],
    ['a blank organisation name', { organisationName: '  ', sourceUrl: 'https://dir.test/x' }],
    ['no source url', { organisationName: 'Kofi Motors' }],
    ['a blank source url', { organisationName: 'Kofi Motors', sourceUrl: '' }],
    ['not being an object at all', 'Kofi Motors'],
  ])('drops a candidate with %s — applyApprovedLeads would skip it', (_label, bad) => {
    expect(leadsIn({ leads: [bad, good] })).toEqual([good]);
  });

  it('omits empty optional fields instead of rendering an empty label', () => {
    const [lead] = leadsIn({ leads: [{ ...good, contactEmail: '', location: 'Tema' }] });
    expect(lead).toEqual({ ...good, location: 'Tema' });
    expect('contactEmail' in (lead ?? {})).toBe(false);
  });

  it.each([
    ['a payload that is not an object', 'leads'],
    ['a null payload', null],
    ['a payload with no leads key', { suppliers: [] }],
    ['leads that are not an array', { leads: { organisationName: 'x' } }],
  ])('returns nothing for %s, so the screen shows its empty state', (_label, payload) => {
    expect(leadsIn(payload)).toEqual([]);
  });
});

describe('suppliersIn and partsIn', () => {
  it('keep only entries with a name and a source', () => {
    const payload = {
      suppliers: [
        { name: 'Accra Parts', sourceUrl: 'https://s.test/1', city: 'Accra' },
        { name: 'No source' },
      ],
      parts: [
        { name: 'Brake pad', sourceUrl: 'https://s.test/2', priceMinor: 4500, currency: 'GHS' },
        { sourceUrl: 'https://s.test/3' },
      ],
    };
    expect(suppliersIn(payload)).toEqual([
      { name: 'Accra Parts', sourceUrl: 'https://s.test/1', city: 'Accra' },
    ]);
    expect(partsIn(payload)).toEqual([
      { name: 'Brake pad', sourceUrl: 'https://s.test/2', priceMinor: 4500, currency: 'GHS' },
    ]);
  });

  it('drops a price that is not a finite number rather than rendering NaN', () => {
    const [part] = partsIn({
      parts: [{ name: 'Filter', sourceUrl: 'https://s.test/4', priceMinor: 'about 30' }],
    });
    expect(part).toEqual({ name: 'Filter', sourceUrl: 'https://s.test/4' });
  });
});

describe('isOpen', () => {
  it.each([
    ['proposed', true],
    ['awaiting-approval', true],
    ['approved', false],
    ['applied', false],
    ['rejected', false],
  ])('%s → %s', (status, expected) => {
    expect(isOpen(row({ status }))).toBe(expected);
  });
});
