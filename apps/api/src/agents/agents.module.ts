import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentsController } from './agents.controller';
import { AgentProposalService } from './agent-proposal.service';
import { DiscoveryAgent } from './discovery.agent';
import { ServiceRequestTriageAgent } from './service-request-triage.agent';
import { AgentHost, HttpAgentHost, UnconfiguredAgentHost } from './agent-host.client';

/**
 * THE AGENT LAYER.
 *
 * ── WHY THERE IS NO GOOGLE ADK HERE ───────────────────────────────────────
 *
 * `CLAUDE.md` §0.1 makes ADK the only agent framework, and ADR-018 is the
 * approved exception: the repair orchestrator shipped as deterministic code
 * because the owner banned ADK for the value chain. Its 2026-08-07 amendment
 * permits ADK "for Phase 8 only, when the programme reaches Phase 8, not
 * before", and the owner repeated the instruction on 2026-08-08: Codex and the
 * Supervisor only, no ADK, no Stitch.
 *
 * So this layer is deliberately ADK-SHAPED WITHOUT ADK: every skill in
 * `services/agent-host` is a pure function over typed inputs, which is exactly
 * what an ADK `FunctionTool` wraps. Adopting ADK at Phase 8 is then a wrapper,
 * not a rewrite. That is recorded in ADR-019 rather than left as a silent
 * deviation — a governance rule broken without a note is how a codebase stops
 * meaning what its documentation says.
 *
 * ── THE PROVIDER SWAP IS THE WHOLE ADR-015 STORY ──────────────────────────
 *
 * `AgentHost` resolves to `UnconfiguredAgentHost` unless BOTH `AGENT_HOST_URL`
 * and `AGENT_HOST_TOKEN` are set. A deployment with no agent is a first-class
 * deployment: service requests are created, reception is notified, and no
 * proposal appears. Nothing anywhere needs to ask "is there an agent?" — the
 * unconfigured host answers `null` from every skill, which is the same thing a
 * configured-but-unreachable host answers, so there is ONE code path and every
 * test of the failure case is also a test of the no-agent case.
 */
@Module({
  controllers: [AgentsController],
  providers: [
    AgentProposalService,
    ServiceRequestTriageAgent,
    DiscoveryAgent,
    {
      provide: AgentHost,
      // ⚠️ DECIDED ONCE, AT WIRING TIME, from configuration — not per call.
      // A per-call check would let a half-configured deployment behave
      // differently between two requests, which is the hardest kind of bug to
      // be told about.
      useFactory: (config: ConfigService): AgentHost => {
        const host = new HttpAgentHost(config);
        return host.isConfigured() ? host : new UnconfiguredAgentHost();
      },
      inject: [ConfigService],
    },
  ],
  exports: [AgentProposalService, ServiceRequestTriageAgent, DiscoveryAgent, AgentHost],
})
export class AgentsModule {}
