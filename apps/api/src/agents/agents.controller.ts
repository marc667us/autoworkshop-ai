import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import { validatedBody } from '../common/validation/validated-body';
import { assertAgentOperator } from './agent-operator-roles';
import { AgentProposalService } from './agent-proposal.service';
import { DiscoveryAgent } from './discovery.agent';
import { ServiceRequestTriageAgent } from './service-request-triage.agent';

/**
 * THE AGENT SURFACE — everything a human does to an agent's output.
 *
 * ⚠️ THERE IS NO ROUTE THAT CREATES A PROPOSAL FROM A REQUEST BODY, and that
 * is deliberate. Proposals are written by the agents themselves, from data the
 * server assembled. A `POST /agents/proposals` taking a body would let any
 * member of staff forge "the AI recommended this" and hand it to a colleague
 * to approve — an authority-laundering path, not a feature.
 *
 * ⚠️ ON `TenantGuard`, AND EVERY ROUTE HERE IS STAFF-ONLY — but say exactly how,
 * because an earlier version of this comment claimed "every service below also
 * calls assertWorkshopStaff" and that was FALSE (Codex, 2026-08-08). The real
 * shape:
 *
 *   · `list` / `decide` → `AgentProposalService` calls `assertWorkshopStaff`.
 *   · `discover/*` / `apply-leads` → `DiscoveryAgent` calls it.
 *   · `triage/service-request/:id` → asserted IN THIS FILE, below. The triage
 *     agent itself deliberately does NOT assert, because its primary caller is
 *     the customer filing the request, acting as `customer`.
 *
 * ⚠️ AND THE RLS CLAUSES ARE ASYMMETRIC ON PURPOSE. Migration 064 puts
 * `<> 'customer'` on proposals SELECT and UPDATE but NOT on INSERT, because the
 * triage proposal is written while acting as the customer who just filed the
 * request. Measured 2026-08-08 as `autoworkshop_app` under a customer context:
 * the INSERT succeeds and a subsequent SELECT returns 0 rows. Write-only for
 * the customer, readable only by staff. Do not "tidy" that into symmetry —
 * adding the clause to INSERT makes triage silently produce nothing on its
 * primary path, and the failure is a logged warning nobody reads.
 *
 * Since migration 061 made the customer role self-service, "a customer" now
 * means "any signed-up stranger", so a missing read check here would publish a
 * workshop's AI-suggested pricing and its lead pipeline.
 */

const DiscoverBody = z.object({
  // A bounded URL. The real guard — an allowlist plus refusal of private
  // address ranges AFTER DNS resolution — lives in the agent host, which is the
  // process that actually makes the request. This only rejects what is not a
  // URL at all, so a caller gets a 400 rather than a timeout.
  url: z.string().url().max(2000),
  // What the operator is looking for, passed to the model as context.
  brief: z.string().trim().min(3).max(500),
});
type DiscoverBody = z.infer<typeof DiscoverBody>;

const DecisionBody = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: z.string().trim().max(1000).optional(),
});
type DecisionBody = z.infer<typeof DecisionBody>;

@Controller('agents')
@UseGuards(TenantGuard)
export class AgentsController {
  constructor(
    private readonly proposals: AgentProposalService,
    private readonly discovery: DiscoveryAgent,
    private readonly triage: ServiceRequestTriageAgent,
  ) {}

  /** The workshop's proposals — what the assistant panel renders. */
  @Get('proposals')
  async list(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('resourceType') resourceType?: string,
    @Query('resourceId') resourceId?: string,
  ) {
    return this.proposals.list(req.tenantContext, { status, resourceType, resourceId });
  }

  /** Approve or reject. Attributed to the caller, never to the agent. */
  @Post('proposals/:id/decision')
  async decide(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validatedBody(DecisionBody)) body: DecisionBody,
  ) {
    return this.proposals.decide(req.tenantContext, id, body.decision, body.note);
  }

  /**
   * Turn an approved lead proposal into lead records.
   *
   * ⚠️ A SEPARATE STEP FROM APPROVAL, on purpose. Approving records a human's
   * judgement; applying performs the write. Keeping them apart means an
   * approval that is later regretted has not already happened, and it is what
   * lets `applyApprovedLeads` read the payload from the STORED row rather than
   * from whatever the client sends.
   */
  @Post('proposals/:id/apply-leads')
  async applyLeads(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    const written = await this.discovery.applyApprovedLeads(req.tenantContext, id);
    return { leadsCreated: written };
  }

  @Post('discover/suppliers')
  async discoverSuppliers(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(DiscoverBody)) body: DiscoverBody,
  ) {
    const id = await this.discovery.discoverSuppliers(req.tenantContext, body.url, body.brief);
    return { proposalId: id };
  }

  @Post('discover/leads')
  async discoverLeads(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(DiscoverBody)) body: DiscoverBody,
  ) {
    const id = await this.discovery.discoverLeads(req.tenantContext, body.url, body.brief);
    return { proposalId: id };
  }

  /**
   * Re-run triage for a service request.
   *
   * Exists because triage runs after the request commits and is therefore
   * allowed to be absent — if the agent host was down at intake, reception
   * needs a way to ask again rather than being told to create a second request.
   * Safe to press twice: migration 064's partial unique index means one open
   * proposal per agent per resource.
   */
  @Post('triage/service-request/:id')
  async retriage(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    const ctx = req.tenantContext;

    // 🔴 ASSERTED HERE, EXPLICITLY, AND NOT INHERITED FROM THE NEXT LINE.
    //
    // The first version relied on `proposals.list()` below happening to call
    // `assertWorkshopStaff` first. That is INCIDENTAL COUPLING: reorder these
    // two statements, or make `list` cheaper by skipping the check, and this
    // route silently opens to any customer. `ServiceRequestTriageAgent` cannot
    // carry the assertion itself, because its primary caller IS a customer.
    // Codex, 2026-08-08.
    assertAgentOperator(ctx, 'Re-running triage');

    const existing = await this.proposals.list(ctx, {
      resourceType: 'service_request',
      resourceId: id,
    });
    // ⚠️ The request's text is READ FROM THE DATABASE, never from a body. The
    // complaint the agent reads must be the complaint the customer wrote —
    // accepting it from the caller would let a member of staff put words in a
    // customer's mouth and then act on the agent's reading of them.
    const proposalId = await this.triage.triageFromStoredRequest(ctx, id);
    return { existing: existing.length, proposalId };
  }
}
