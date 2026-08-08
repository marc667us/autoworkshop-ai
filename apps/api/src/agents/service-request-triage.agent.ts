import { Injectable, Logger } from '@nestjs/common';
import { AgentHost } from './agent-host.client';
import { AgentProposalService } from './agent-proposal.service';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * THE TRIAGE AGENT — it receives the customer's request and tells reception
 * what it thinks, in the words reception uses.
 *
 * Owner, 2026-08-08: "AI agent must receive the request and used to on
 * interflow setup the customer request in the workshop and assign technicians
 * get job started."
 *
 * ── 🔴 WHAT IT DOES NOT DO, AND WHY ───────────────────────────────────────
 *
 * It does NOT assign a technician. It does NOT create a job card. It does NOT
 * start work. It writes a PROPOSAL — a priority, a fault category, a summary a
 * receptionist can read in three seconds, and a suggested technician WITH the
 * reason — and reception converts the request, which is where the assignment
 * actually happens and always has (`ServiceRequestService.convert` →
 * `JobCardService.create({ assignedTechnicianId })`).
 *
 * That is Directive §14 and `02.txt` §5's Class C: a business-committing action
 * needs an authenticated human before it, not after. It is also the honest
 * engineering answer — a language model reading a sentence like "makes a noise
 * sometimes" is a useful first opinion and a terrible last one. The whole value
 * is that the receptionist starts from a filled-in form instead of a blank one.
 *
 * ── 🔴 IT RUNS AFTER THE REQUEST COMMITS, NOT INSIDE ITS TRANSACTION ──────
 *
 * Migration 060's notification is written in the SAME transaction as the
 * request, because a request that fails to ring reception must not exist. The
 * triage proposal is the opposite case and gets the opposite treatment:
 *
 *   · A model generation on a local Ollama takes seconds. Holding the
 *     customer's INSERT transaction open for that long — with locks — while
 *     they watch a spinner is a bad trade for an opinion.
 *   · A proposal that never arrives costs reception a convenience. A request
 *     that never arrives costs the workshop a customer. Those must not share a
 *     failure mode.
 *
 * So the request commits, the customer gets their 201, and this runs after.
 * ⚠️ THE HONEST COST: if the process dies in that window the proposal is simply
 * absent. That is acceptable and recoverable — migration 064's partial unique
 * index means re-running triage for the same request is safe, and reception's
 * screen works perfectly well with no proposal on it.
 */
@Injectable()
export class ServiceRequestTriageAgent {
  private readonly log = new Logger(ServiceRequestTriageAgent.name);

  constructor(
    private readonly host: AgentHost,
    private readonly proposals: AgentProposalService,
    private readonly db: DatabaseService,
  ) {}

  /**
   * Fire triage for a request that has just been created.
   *
   * ⚠️ NEVER THROWS, AND NEVER RETURNS A PROMISE THE CALLER MUST AWAIT for
   * correctness. The caller has already answered the customer; this is an
   * afterthought by design. Every failure is swallowed into a WARN, because
   * there is no failure here that a customer should ever be told about.
   */
  triageInBackground(ctx: TenantContext, requestId: string, input: {
    complaint: string;
    vehicleDescription: string;
    registrationNumber?: string | null;
  }): void {
    if (!this.host.isConfigured()) return;
    void this.triage(ctx, requestId, input).catch((err: unknown) => {
      this.log.warn(
        `triage failed for service request ${requestId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  /**
   * Triage a request that already exists, reading its text from the database.
   *
   * ⚠️ THE COMPLAINT IS READ, NEVER ACCEPTED FROM A CALLER. Reception can ask
   * for a re-run — the agent host may have been down at intake — but the words
   * the agent reads must be the customer's own. Taking them from the request
   * body would let a member of staff put words in a customer's mouth and then
   * act on the agent's reading of them.
   *
   * The read is tenant-scoped, so a request from another workshop is simply not
   * found rather than refused with a different message.
   */
  async triageFromStoredRequest(
    ctx: TenantContext,
    requestId: string,
  ): Promise<string | null> {
    const stored = await this.db.withTenant(ctx, async (client) => {
      const res = await client.query<{
        complaint: string;
        vehicle_description: string;
        registration_number: string | null;
      }>(
        `SELECT complaint, vehicle_description, registration_number
           FROM reception.service_requests
          WHERE id = $1`,
        [requestId],
      );
      return res.rows[0] ?? null;
    });
    if (!stored) return null;
    return this.triage(ctx, requestId, {
      complaint: stored.complaint,
      vehicleDescription: stored.vehicle_description,
      registrationNumber: stored.registration_number,
    });
  }

  /** The awaitable form — used by tests and by an explicit re-run. */
  async triage(
    ctx: TenantContext,
    requestId: string,
    input: {
      complaint: string;
      vehicleDescription: string;
      registrationNumber?: string | null;
    },
  ): Promise<string | null> {
    const technicians = await this.technicians(ctx);

    const result = await this.host.triage({
      complaint: input.complaint,
      vehicleDescription: input.vehicleDescription,
      registrationNumber: input.registrationNumber ?? undefined,
      technicians,
    });
    if (!result) return null;

    // ⚠️ THE SUGGESTED TECHNICIAN IS VALIDATED AGAINST THE LIST WE SENT.
    // A model asked to pick from a list will sometimes return a plausible id
    // that is not in it, or one copied from its own prompt. Writing that
    // through unchecked would put a stranger's uuid — possibly from another
    // organisation — into a field a receptionist is about to press Accept on.
    // An id we did not offer is dropped, and the proposal still ships with its
    // priority and summary, which are the parts that do not depend on it.
    const suggested =
      result.suggestedTechnicianId &&
      technicians.some((t) => t.id === result.suggestedTechnicianId)
        ? result.suggestedTechnicianId
        : null;

    if (result.suggestedTechnicianId && !suggested) {
      this.log.warn(
        `triage suggested technician ${result.suggestedTechnicianId}, which is not among the ${technicians.length} offered — dropped`,
      );
    }

    return this.db.withTenant(ctx, (client) =>
      this.proposals.record(client, ctx, {
        agentName: 'service-request-triage',
        // Class C: acting on it assigns a person to a job and starts billable
        // work. `approvalRequiredFor` turns this into `awaiting-approval`, and
        // the server decides that — not the agent, not the client.
        actionClass: 'business-committing',
        action: `Triage: ${result.faultCategory} — suggested priority ${result.priority}`,
        // "the information it intends to use" (§8), enumerated rather than
        // summarised. This is the list a customer would be shown if they asked
        // what the assistant read about them.
        dataUsed: [
          'the complaint text on this service request',
          'the vehicle description and registration',
          `the names, specialisms and open job counts of ${technicians.length} technician(s) at this workshop`,
        ],
        sources: [
          { label: 'Service request', href: `/reception/service-requests/${requestId}` },
        ],
        payload: {
          priority: result.priority,
          faultCategory: result.faultCategory,
          summary: result.summary,
          suggestedTechnicianId: suggested,
          // The host always populates this, including when it suggested nobody —
          // "why not" is as useful to reception as "why".
          technicianReason: result.technicianReason,
          // Kept even when dropped, so a reviewer can see the agent named
          // something we refused rather than silently getting a blank field.
          rejectedTechnicianSuggestion:
            result.suggestedTechnicianId && !suggested ? result.suggestedTechnicianId : null,
        },
        confidence: result.confidence,
        // Carried all the way from the host. `rules` means Ollama was
        // unreachable and deterministic keyword rules answered instead — a
        // useful answer, but not a model's judgement, and never displayed as one.
        source: result.source,
        resourceType: 'service_request',
        resourceId: requestId,
      }),
    );
  }

  /**
   * The workshop's technicians, with how busy each one is.
   *
   * ⚠️ THIS IS THE ENTIRE SET OF TENANT DATA THAT LEAVES FOR THE AGENT, and it
   * is deliberately narrow: an id, a display name, specialisms, and a count.
   * No emails, no phone numbers, no employment details, no customer data beyond
   * the complaint the caller passes separately. `data_used` above enumerates it
   * so the disclosure and the code cannot drift apart.
   *
   * Open jobs are counted from `repair.job_cards` in a non-terminal stage, so
   * "who is free" reflects real load rather than headcount.
   */
  private async technicians(ctx: TenantContext) {
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query<{
        id: string;
        display_name: string;
        specialisms: string[] | null;
        open_jobs: string;
      }>(
        `SELECT u.id,
                u.display_name,
                NULL::text[] AS specialisms,
                COALESCE(j.open_jobs, 0) AS open_jobs
           FROM identity.memberships m
           JOIN identity.users u ON u.id = m.user_id
           LEFT JOIN (
             SELECT assigned_technician_id, count(*) AS open_jobs
               FROM repair.job_cards
              -- The stage names are read from job-card-stages.ts, not guessed.
              -- There is no 'released' or 'cancelled' stage in this product:
              -- the 20 stages end at 'completed', with 'warranty_follow_up'
              -- after it. A plausible-looking name matching nothing would make
              -- this filter a no-op and every technician read as equally busy.
                WHERE organization_id = $1
                AND stage NOT IN ('completed', 'warranty_follow_up')
              GROUP BY assigned_technician_id
           ) j ON j.assigned_technician_id = u.id
          WHERE m.organization_id = $1
            AND m.status = 'active'
            -- 'technician' is the only technician role in ROLE_PRECEDENCE.
            -- There is no 'senior_technician'; naming one would match nobody.
            AND m.role_name = 'technician'
            AND u.status = 'active'
          ORDER BY u.display_name
          LIMIT 50`,
        [ctx.organizationId],
      );
      return res.rows.map((r) => ({
        id: r.id,
        displayName: r.display_name,
        // ⚠️ SPECIALISMS ARE NOT MODELLED ON A USER YET, and this says so with
        // an empty array rather than inventing a source. `catalogue.
        // mechanic_directory.specialisms` is the WORKSHOP's, not a person's.
        // The agent is told the truth — that it is choosing on name and load —
        // instead of being handed a field that silently means nothing.
        specialisms: r.specialisms ?? [],
        openJobs: Number(r.open_jobs),
      }));
    });
  }
}
