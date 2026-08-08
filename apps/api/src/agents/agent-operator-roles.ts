import { ForbiddenException } from '@nestjs/common';
import { ROLE_PRECEDENCE } from '../authz/permission-matrix';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * WHO MAY OPERATE THE AGENTS — narrower than "workshop staff", deliberately.
 *
 * ── WHY NOT `assertWorkshopStaff` ─────────────────────────────────────────
 *
 * The first version of the agent surface used it, which admits all nine staff
 * roles. `scripts/audit-nav-coverage.mjs` then correctly reported five gaps:
 * roles permitted by the API with no way to reach the screen by clicking. The
 * repo's own rule for that situation is to fix it in ONE of two places — add
 * the menu entry, or narrow the API — and adding it was the wrong half:
 *
 *   · Discovery SPENDS. It runs a scraper and, if a hosted extraction key is
 *     configured, bills credits per call. That is not a technician's decision.
 *   · Lead discovery STORES PERSONAL DATA about people who did not ask to be
 *     in this workshop's database (`crm.leads`). Whoever presses that button
 *     is answerable for it.
 *   · Deciding a proposal is BUSINESS-COMMITTING by construction — every
 *     proposal this system writes is Class C. Directive §14 wants a human with
 *     authority in front of those, not merely a human.
 *
 * So the audience is management, and the menus already match: the three
 * workshop trees these roles reach carry `Leads` and `Discovery`, and the trees
 * that do not are exactly the trees whose roles are refused here.
 *
 * ⚠️ THIS IS THE ONE PLACE THE AUDIENCE IS DEFINED. `audit-nav-coverage.mjs`
 * lists the same three roles for the two agent features; if this set changes,
 * that list and the navigation trees must change WITH it, or the audit starts
 * measuring a policy nobody holds.
 */
export const AGENT_OPERATOR_ROLES = [
  'platform_administrator',
  'workshop_owner',
  'workshop_manager',
] as const;

/**
 * 🔴 EVERY NAME ABOVE IS CHECKED AGAINST `ROLE_PRECEDENCE` AT MODULE LOAD.
 *
 * `WORKSHOP_STAFF_ROLES` carried `'quality_controller'` for months — a role
 * that does not exist; the real one is `quality_control_inspector`. It failed
 * CLOSED, so a quality inspector was silently refused by six services and
 * nothing ever said so. A misspelled role name reads as a policy statement and
 * behaves as a lockout.
 *
 * Throwing at import time rather than asserting in a test means a typo cannot
 * reach a running server even if somebody skips the suite.
 */
for (const role of AGENT_OPERATOR_ROLES) {
  if (!ROLE_PRECEDENCE.includes(role)) {
    throw new Error(
      `AGENT_OPERATOR_ROLES names "${role}", which is not a role in ROLE_PRECEDENCE. ` +
        `A role name that does not exist fails closed and locks somebody out silently.`,
    );
  }
}

export function isAgentOperator(ctx: TenantContext): boolean {
  return (AGENT_OPERATOR_ROLES as readonly string[]).includes(ctx.activeRole);
}

/**
 * Refuse anyone else.
 *
 * ⚠️ THE MESSAGE NAMES A REACHABLE ALTERNATIVE. "Every refusal must name a
 * reachable alternative" is this repository's most expensive recurring defect —
 * a rule with no way past it is a wall, and the person in front of it files a
 * bug instead of asking their manager.
 */
export function assertAgentOperator(ctx: TenantContext, what: string): void {
  if (!isAgentOperator(ctx)) {
    throw new ForbiddenException(
      `${what} is available to the workshop owner, a manager or a platform administrator. Ask one of them to run it for you.`,
    );
  }
}
