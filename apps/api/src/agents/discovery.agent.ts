import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AgentHost } from './agent-host.client';
import { AgentProposalService } from './agent-proposal.service';
import { DatabaseService } from '../database/database.service';
import { assertAgentOperator } from './agent-operator-roles';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * THE TWO DISCOVERY AGENTS — suppliers and parts, and sales leads.
 *
 * Owner, 2026-08-08: an agent that uses a scraper to "search for products and
 * suppliers and register them", and another that uses it to "search leads and
 * potential customers from online and social media".
 *
 * ── 🔴 "REGISTER THEM" HAPPENS ON APPROVAL, NOT ON DISCOVERY ──────────────
 *
 * The owner's word is "register", and that is what this delivers — but it
 * delivers it through the review step the product already has, rather than by
 * writing straight into the catalogue. Three reasons, and none is squeamishness:
 *
 *   1. Directive §14 lists "updating supplier prices" among the actions that
 *      REQUIRE human approval. A scraped price written directly into
 *      `catalogue.parts` is exactly that action.
 *   2. The catalogue is PUBLIC (migration 021). `is_published` is "an explicit
 *      ACT" by design and migration 024 deliberately keeps publication with an
 *      administrator, because a garage's customers buy from it. An agent that
 *      could publish would route around a control that already exists.
 *   3. Scraped data is wrong often enough that this matters in practice. A
 *      mis-parsed price is a real quotation to a real customer.
 *
 * So: discovery writes PROPOSALS carrying candidates and their source URLs; a
 * member of workshop STAFF approves; and the existing catalogue write path
 * creates the records. The agent shortens the research, it does not sign
 * anything.
 *
 * ⚠️ STAFF, NOT "an administrator" — an earlier version of this comment said
 * administrator and the code has always said `assertWorkshopStaff`, which
 * admits reception, supervisors and technicians too (Codex, 2026-08-08). The
 * comment is corrected rather than the code tightened, deliberately: a
 * single-owner garage has no second administrator, and a gate only one person
 * in the building can pass is a gate that gets worked around. PUBLICATION to
 * the public catalogue remains administrator-only (migration 024) — that is
 * where the irreversible, customer-visible step actually is.
 *
 * ── 🔴 AND NOTHING HERE EVER CONTACTS A LEAD ──────────────────────────────
 *
 * `crm.leads` has no outbound path anywhere in this platform, deliberately (see
 * migration 064). An agent that both finds strangers and mails them is a spam
 * engine whatever its intent, and Directive §14 requires human approval to send
 * email regardless. A human reads the row and decides.
 */
@Injectable()
export class DiscoveryAgent {
  private readonly log = new Logger(DiscoveryAgent.name);

  constructor(
    private readonly host: AgentHost,
    private readonly proposals: AgentProposalService,
    private readonly db: DatabaseService,
  ) {}

  /**
   * Scrape a page for suppliers and parts, and propose them.
   *
   * ⚠️ THE URL COMES FROM A MEMBER OF STAFF AND IS STILL NOT TRUSTED. The agent
   * host enforces an allowlist and refuses private address ranges AFTER DNS
   * RESOLUTION — a hostname that merely looks public can resolve to
   * 169.254.169.254 and turn this into a cloud-metadata read. That guard lives
   * in the host because that is the process making the request; repeating a
   * weaker version here would invite someone to trust this one instead.
   */
  async discoverSuppliers(ctx: TenantContext, url: string, brief: string) {
    assertAgentOperator(ctx, 'Supplier discovery');
    this.assertHostAvailable();

    const found = await this.host.discoverSuppliers(url, brief);
    if (!found) {
      // A refusal with a REACHABLE alternative. "Every refusal must name a
      // reachable alternative" is this repo's most expensive recurring defect
      // class — a wall dressed as a rule.
      throw new BadRequestException(
        'The discovery agent could not read that page. Check the address is reachable and on the allowed list, or add the supplier by hand in Catalogue → Suppliers.',
      );
    }

    const suppliers = found.suppliers ?? [];
    const parts = found.parts ?? [];
    if (suppliers.length === 0 && parts.length === 0) {
      throw new BadRequestException(
        'Nothing recognisable as a supplier or part was found on that page. Try a product listing or a supplier profile page.',
      );
    }

    return this.db.withTenant(ctx, (client) =>
      this.proposals.record(client, ctx, {
        agentName: 'supplier-discovery',
        // Class C: approving it puts a supplier and priced parts into a PUBLIC
        // catalogue that customers buy from.
        actionClass: 'business-committing',
        action: `Register ${suppliers.length} supplier(s) and ${parts.length} part(s) found at ${hostOf(url)}`,
        dataUsed: [
          `the public web page ${url}`,
          'no customer, vehicle or financial data from this workshop',
        ],
        // ⚠️ EVERY CANDIDATE CARRIES ITS SOURCE, and the proposal repeats them
        // here so the reviewer can open the page before approving. An unsourced
        // claim about a price is worthless — §8 requires "the resulting sources
        // or business records" for exactly this reason.
        sources: [
          { label: `Scraped page: ${hostOf(url)}`, href: url },
          ...dedupeSources([...suppliers, ...parts].map((c) => c.sourceUrl)),
        ],
        payload: { suppliers, parts, brief, requestedUrl: url },
        confidence: null,
        source: 'model',
        // Who asked. Without this a discovery proposal is an anonymous claim
        // that "the AI found this", and the person who chose the page and
        // wrote the brief — the two inputs that shape the whole result — is
        // unrecoverable.
        createdBy: ctx.userId,
      }),
    );
  }

  /** Scrape a page for potential customers, and propose them as leads. */
  async discoverLeads(ctx: TenantContext, url: string, brief: string) {
    assertAgentOperator(ctx, 'Lead discovery');
    this.assertHostAvailable();

    const found = await this.host.discoverLeads(url, brief);
    if (!found) {
      throw new BadRequestException(
        'The discovery agent could not read that page. Check the address is reachable and on the allowed list, or add the lead by hand in Sales → Leads.',
      );
    }

    const leads = (found.leads ?? []).filter((l) => l.sourceUrl && l.organisationName);
    if (leads.length === 0) {
      throw new BadRequestException(
        'No organisations with a usable source were found on that page.',
      );
    }

    return this.db.withTenant(ctx, (client) =>
      this.proposals.record(client, ctx, {
        agentName: 'lead-discovery',
        // 🔴 CLASS C, NOT `draft`. Approving this stores contact details of
        // people and businesses who did not ask to be in this workshop's
        // database. That is a decision with a name on it, not a draft.
        actionClass: 'business-committing',
        action: `Add ${leads.length} potential customer(s) found at ${hostOf(url)} to the lead list`,
        dataUsed: [
          `the public web page ${url}`,
          'publicly listed business contact details only',
          'no customer, vehicle or financial data from this workshop',
        ],
        sources: [
          { label: `Scraped page: ${hostOf(url)}`, href: url },
          ...dedupeSources(leads.map((l) => l.sourceUrl)),
        ],
        payload: { leads, brief, requestedUrl: url },
        confidence: null,
        source: 'model',
        createdBy: ctx.userId,
      }),
    );
  }

  /**
   * Turn an APPROVED lead-discovery proposal into `crm.leads` rows.
   *
   * ⚠️ READS THE PAYLOAD FROM THE STORED PROPOSAL, NEVER FROM THE REQUEST. If
   * this accepted the candidate list from the client, the approval step would
   * guard nothing: a caller could approve a proposal for three harmless leads
   * and post three hundred different ones. What was approved and what is
   * written must be the same bytes.
   */
  async applyApprovedLeads(ctx: TenantContext, proposalId: string): Promise<number> {
    assertAgentOperator(ctx, 'Applying an approved lead proposal');
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query<{ payload: { leads?: unknown[] }; status: string; agent_name: string }>(
        `SELECT payload, status, agent_name FROM agents.proposals WHERE id = $1`,
        [proposalId],
      );
      const row = res.rows[0];
      if (!row) throw new BadRequestException('That proposal was not found.');
      if (row.agent_name !== 'lead-discovery') {
        throw new BadRequestException('That proposal is not a lead proposal.');
      }
      if (row.status !== 'approved') {
        throw new BadRequestException(
          `Only an approved proposal can be applied — this one is ${row.status}.`,
        );
      }

      const leads = (row.payload?.leads ?? []) as Array<Record<string, string | undefined>>;
      let written = 0;
      for (const lead of leads) {
        if (!lead.organisationName || !lead.sourceUrl) continue;
        const ins = await client.query(
          `INSERT INTO crm.leads
             (tenant_id, organization_id, organisation_name, contact_name,
              contact_email, contact_phone, website, location, rationale,
              source_url, status, proposal_id, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'new',$11,$12)
           -- The same organisation is not a lead twice for one workshop
           -- (migration 064). A re-applied proposal is a no-op, not a
           -- duplicate — and re-applying is what a double-clicked button is.
           ON CONFLICT (organization_id, organisation_name) DO NOTHING`,
          [
            ctx.tenantId,
            ctx.organizationId,
            lead.organisationName,
            // 🔴 THE HOST SENDS ONE FREE-TEXT `contact`, and `crm.leads` has
            // three columns. Classified here, in ONE place, rather than asking
            // a language model to decide which column its own output belongs
            // in — a model that mislabels a phone number as an email produces a
            // row that silently never reaches anybody.
            // Deliberately conservative: anything that is not clearly an
            // address or a number is kept as a NAME, because a wrong email in
            // an email column is worse than a right string in the wrong one.
            classifyContact(lead.contact).name,
            classifyContact(lead.contact).email,
            classifyContact(lead.contact).phone,
            // The host does not return a website field at all; the source URL
            // is the only link it can vouch for. Inventing one from the
            // organisation name would be a fabricated business record.
            null,
            lead.location ?? null,
            lead.rationale ?? null,
            lead.sourceUrl,
            proposalId,
            ctx.userId,
          ],
        );
        written += ins.rowCount ?? 0;
      }

      await client.query(
        `UPDATE agents.proposals SET status = 'applied' WHERE id = $1`,
        [proposalId],
      );
      this.log.log(`applied lead proposal ${proposalId}: ${written} new lead(s)`);
      return written;
    });
  }

  private assertHostAvailable(): void {
    if (!this.host.isConfigured()) {
      // Names the remedy rather than stating a fact about the server. Somebody
      // reading this in the UI can act on it.
      throw new BadRequestException(
        'No discovery agent is connected. Set AGENT_HOST_URL and AGENT_HOST_TOKEN, or add the record by hand.',
      );
    }
  }
}

/**
 * Put one free-text contact string into the right column.
 *
 * `services/agent-host` returns a single `contact` because that is what a web
 * page states — "sales@x.com", "+233 20 000 0000", or "Ask for Kwame". Three
 * columns exist here, so SOMETHING must choose, and choosing in code beats
 * asking the model: a mislabelled phone number in an email column produces a
 * lead nobody can contact and no error anywhere.
 */
export function classifyContact(contact: string | undefined): {
  name: string | null;
  email: string | null;
  phone: string | null;
} {
  const v = contact?.trim();
  if (!v) return { name: null, email: null, phone: null };
  // An `@` with something either side. Not a full RFC check — this decides a
  // COLUMN, it does not certify deliverability.
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return { name: null, email: v, phone: null };
  // Digits, spaces and the usual punctuation, with enough digits to be a real
  // number. `+233 20 000 0000` qualifies; `Ask for Kwame` does not.
  const digits = v.replace(/\D/g, '');
  if (digits.length >= 7 && /^[+()\-\s\d.]+$/.test(v)) {
    return { name: null, email: null, phone: v };
  }
  return { name: v, email: null, phone: null };
}

/** The host, for a label. Falls back to the raw string on an unparseable URL. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Distinct source links, bounded — a proposal listing 400 identical URLs helps nobody. */
function dedupeSources(urls: readonly string[]) {
  return [...new Set(urls.filter(Boolean))]
    .slice(0, 20)
    .map((href) => ({ label: hostOf(href), href }));
}
