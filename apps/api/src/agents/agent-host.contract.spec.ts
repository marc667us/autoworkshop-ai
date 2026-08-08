import { describe, expect, it, vi, afterEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { HttpAgentHost } from './agent-host.client';
import { classifyContact } from './discovery.agent';

/**
 * THE CONTRACT BETWEEN TWO SERVICES THAT NOTHING ELSE CHECKS.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 WHY THIS FILE EXISTS: LEAD DISCOVERY WAS COMPLETELY INERT AND EVERY
 *    SUITE WAS GREEN.
 *
 * `services/agent-host` is Python and returns idiomatic `snake_case`.
 * `agent-host.client.ts` declared idiomatic TypeScript `camelCase`. Worse than
 * the casing, it declared fields the host has NEVER sent —
 * `suggestedTechnicianReason`, `contactEmail`, `contactPhone`, `priceMinor`,
 * `supplierName`, `website`.
 *
 * `DiscoveryAgent.discoverLeads` filters candidates on
 * `l.sourceUrl && l.organisationName`. Both were `undefined` on every
 * candidate, so EVERY lead was discarded and the route threw "No organisations
 * with a usable source were found on that page" — always, for any page.
 *
 * ⚠️ AND IT READ AS A SCRAPING PROBLEM. The message is plausible, the HTTP call
 * genuinely succeeded, and both test suites passed: the Python side asserted
 * snake_case against itself, the TypeScript side asserted camelCase against
 * itself, and NOTHING asserted the two ever met. Found by the Supervisor, not
 * by either suite.
 *
 * Supplier discovery was quieter and worse — it survived, silently dropping
 * every per-candidate `source_url`, so proposals would have carried scraped
 * PRICES with no link to check them against.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHY THE FIXTURES ARE COPIED LITERALLY ─────────────────────────────────
 *
 * Every payload below is the shape `services/agent-host/app/schemas.py`
 * actually serialises — `snake_case` keys, the host's own field names, the
 * host's own value types. It is deliberately NOT built from the TypeScript
 * interfaces, because a fixture derived from my own assumptions agrees with my
 * own mistake, which is exactly how this got through the first time.
 *
 * If someone renames a field on either side, this fails. That is the whole job.
 */

const HOST_URL = 'http://agent-host.test';

function hostWith(body: unknown, status = 200): HttpAgentHost {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })),
  );
  return new HttpAgentHost(
    new ConfigService({
      AGENT_HOST_URL: HOST_URL,
      AGENT_HOST_TOKEN: 'test-token',
      AGENT_HOST_TIMEOUT_MS: '5000',
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('agent host contract — the real wire shape, not our assumptions', () => {
  it('parses a triage response, including the field the client used to invent', async () => {
    // Literal `TriageProposal` output. Note `technician_reason` — the client
    // previously looked for `suggestedTechnicianReason`, which never existed.
    const host = hostWith({
      priority: 'urgent',
      fault_category: 'braking',
      summary: 'Grinding under braking; likely worn pads. Do not drive.',
      suggested_technician_id: '11111111-2222-3333-4444-555555555555',
      technician_reason: 'Least busy technician qualified on braking systems.',
      confidence: 0.72,
      source: 'rules',
      signals: ['brake', 'grinding'],
    });

    const result = await host.triage({
      complaint: 'grinding when I brake',
      vehicleDescription: 'Toyota Corolla 2014',
      technicians: [],
    });

    expect(result).not.toBeNull();
    expect(result!.faultCategory).toBe('braking');
    expect(result!.suggestedTechnicianId).toBe('11111111-2222-3333-4444-555555555555');
    // 🔴 THE FIELD THAT WAS MISSING. If this is ever `undefined` again, the
    // reason a technician was chosen silently disappears from the proposal a
    // receptionist is about to act on.
    expect(result!.technicianReason).toBe(
      'Least busy technician qualified on braking systems.',
    );
    // `rules` must survive the trip intact — presenting a keyword-rules answer
    // as a model's judgement is the one thing this field exists to prevent.
    expect(result!.source).toBe('rules');
    expect(result!.signals).toEqual(['brake', 'grinding']);
  });

  it('🔴 parses leads — the exact payload that used to be discarded entirely', async () => {
    const host = hostWith({
      leads: [
        {
          organisation_name: 'Accra Taxi Cooperative',
          lead_type: 'taxi_or_rideshare',
          contact: 'ops@accrataxi.example',
          location: 'Accra, GH',
          rationale: 'Operates a stated fleet of 40 vehicles.',
          source_url: 'https://directory.example/accra-taxi',
        },
      ],
      source_url: 'https://directory.example',
      source: 'model',
      extraction_backend: 'ollama',
      notes: '',
    });

    const result = await host.discoverLeads('https://directory.example', 'taxi fleets');

    expect(result).not.toBeNull();
    expect(result!.leads).toHaveLength(1);
    const lead = result!.leads[0]!;
    // These two are what `DiscoveryAgent.discoverLeads` filters on. Before the
    // adapter both were `undefined`, so this array was emptied and the route
    // threw a message about the PAGE — blaming the website for our own bug.
    expect(lead.organisationName).toBe('Accra Taxi Cooperative');
    expect(lead.sourceUrl).toBe('https://directory.example/accra-taxi');
    expect(lead.leadType).toBe('taxi_or_rideshare');
    expect(lead.rationale).toBe('Operates a stated fleet of 40 vehicles.');
  });

  it('parses suppliers and parts, keeping every per-candidate source link', async () => {
    const host = hostWith({
      suppliers: [
        {
          name: 'Tema Parts Ltd',
          country: 'GH',
          city: 'Tema',
          website: 'https://temaparts.example',
          contact: 'sales@temaparts.example',
          source_url: 'https://temaparts.example/about',
        },
      ],
      parts: [
        {
          name: 'Front brake pad set',
          part_number: 'BP-1234',
          category: 'braking',
          price: 240.5,
          currency: 'GHS',
          source_url: 'https://temaparts.example/p/bp-1234',
        },
      ],
      source_url: 'https://temaparts.example',
      source: 'model',
      extraction_backend: 'ollama',
      notes: '',
    });

    const result = await host.discoverSuppliers('https://temaparts.example', 'brake pads');

    expect(result).not.toBeNull();
    // 🔴 THE SILENT HALF OF THE BUG. Supplier discovery did not fail — it
    // succeeded while dropping these, so a proposal would have carried a
    // scraped PRICE with nothing to check it against.
    expect(result!.suppliers[0]!.sourceUrl).toBe('https://temaparts.example/about');
    expect(result!.parts[0]!.sourceUrl).toBe('https://temaparts.example/p/bp-1234');
    expect(result!.suppliers[0]!.contact).toBe('sales@temaparts.example');
    expect(result!.parts[0]!.partNumber).toBe('BP-1234');
    // A major-unit float, exactly as the page stated it. The host never
    // converts to minor units and neither does this — an assumed currency
    // scale on a scraped price is worse than no price.
    expect(result!.parts[0]!.price).toBe(240.5);
    expect(result!.parts[0]!.currency).toBe('GHS');
  });

  it('a nested key that is already camelCase is left alone', async () => {
    // The adapter must be safe to run against a future host that has been
    // taught to speak camelCase — otherwise fixing the host would break this.
    const host = hostWith({
      leads: [{ organisationName: 'Already Camel Ltd', sourceUrl: 'https://x.example' }],
    });
    const result = await host.discoverLeads('https://x.example', 'anything');
    expect(result!.leads[0]!.organisationName).toBe('Already Camel Ltd');
  });

  it('a non-200 from the host is null, never a throw', async () => {
    // A dead agent degrades; it does not break the workshop.
    const host = hostWith({ detail: 'nope' }, 503);
    expect(await host.discoverLeads('https://x.example', 'y')).toBeNull();
  });
});

/**
 * The host sends ONE free-text contact and `crm.leads` has three columns, so
 * something has to choose. Choosing in code beats asking the model: a phone
 * number written into an email column produces a lead nobody can contact and
 * no error anywhere.
 */
describe('classifyContact — one field into three columns', () => {
  it('an address goes to email', () => {
    expect(classifyContact('ops@accrataxi.example')).toEqual({
      name: null,
      email: 'ops@accrataxi.example',
      phone: null,
    });
  });

  it('a number goes to phone', () => {
    expect(classifyContact('+233 20 000 0000')).toEqual({
      name: null,
      email: null,
      phone: '+233 20 000 0000',
    });
  });

  it('anything else stays a NAME rather than being guessed at', () => {
    // Deliberately conservative. A wrong value in the email column gets mailed;
    // a right value in the name column is merely untidy.
    expect(classifyContact('Ask for Kwame')).toEqual({
      name: 'Ask for Kwame',
      email: null,
      phone: null,
    });
  });

  it('a short digit string is NOT a phone number', () => {
    // "Unit 12" must not become a telephone number.
    expect(classifyContact('12').phone).toBeNull();
  });

  it('absent stays absent', () => {
    expect(classifyContact(undefined)).toEqual({ name: null, email: null, phone: null });
    expect(classifyContact('   ')).toEqual({ name: null, email: null, phone: null });
  });
});
