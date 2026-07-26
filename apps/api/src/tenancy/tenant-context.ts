/**
 * Tenant context.
 *
 * The single most important rule in the platform (`autoworkshop 1.txt` §9):
 *
 *   "The gateway must never trust a tenant identifier supplied only by the
 *    client. Tenant context shall be derived from the validated identity and
 *    membership claims."
 *
 * Every request resolves EXACTLY ONE active tenant context, server-side, from
 * a validated Keycloak token plus a membership lookup. There is deliberately
 * no constructor path that accepts a client-supplied tenant id.
 */
export interface TenantContext {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly branchId: string | null;
  readonly userId: string;
  /** The ONE active role for this request, not the user's full role set. */
  readonly activeRole: string;
  readonly correlationId: string;
}

/** Raised when a request cannot resolve exactly one tenant context. */
export class TenantResolutionError extends Error {
  constructor(reason: string) {
    super(`tenant context could not be resolved: ${reason}`);
    this.name = 'TenantResolutionError';
  }
}

/**
 * A validated membership record, as loaded from the database after the token
 * signature and claims have been verified.
 */
export interface ValidatedMembership {
  tenantId: string;
  organizationId: string;
  branchId: string | null;
  roleName: string;
  status: 'active' | 'suspended' | 'revoked';
}

/**
 * Resolve the active tenant context.
 *
 * `requestedOrganizationId` may come from the client (the org switcher), but it
 * is only ever used to SELECT among memberships the server already proved the
 * user holds. It can never introduce a tenant the user has no membership in —
 * which is the confused-deputy attack this design exists to prevent.
 */
export function resolveTenantContext(params: {
  userId: string;
  memberships: readonly ValidatedMembership[];
  requestedOrganizationId?: string;
  correlationId: string;
}): TenantContext {
  const { userId, memberships, requestedOrganizationId, correlationId } = params;

  const active = memberships.filter((m) => m.status === 'active');
  if (active.length === 0) {
    throw new TenantResolutionError('user holds no active membership');
  }

  let selected: ValidatedMembership | undefined;

  if (requestedOrganizationId) {
    selected = active.find((m) => m.organizationId === requestedOrganizationId);
    if (!selected) {
      // The user asked for an organization they are not a member of. This is
      // refused, not silently downgraded to a default — a silent fallback would
      // hide an authorization probe.
      throw new TenantResolutionError(
        'requested organization is not among the user active memberships',
      );
    }
  } else if (active.length === 1) {
    selected = active[0];
  } else {
    throw new TenantResolutionError(
      'user holds multiple memberships and no organization was selected',
    );
  }

  return {
    tenantId: selected.tenantId,
    organizationId: selected.organizationId,
    branchId: selected.branchId,
    userId,
    activeRole: selected.roleName,
    correlationId,
  };
}

/**
 * The `SET LOCAL` statements that bind the resolved context to the database
 * transaction, so PostgreSQL RLS becomes the final backstop.
 *
 * `SET LOCAL` (not `SET`) is deliberate: the settings die with the transaction,
 * so a pooled connection can never leak one tenant's context into the next
 * request that borrows it.
 */
export function tenantSessionStatements(ctx: TenantContext): string[] {
  return [
    `SET LOCAL app.tenant_id = '${ctx.tenantId}'`,
    `SET LOCAL app.user_id = '${ctx.userId}'`,
    `SET LOCAL app.current_role = '${ctx.activeRole}'`,
    `SET LOCAL app.organization_ids = '${ctx.organizationId}'`,
    `SET LOCAL app.branch_ids = '${ctx.branchId ?? ''}'`,
  ];
}
