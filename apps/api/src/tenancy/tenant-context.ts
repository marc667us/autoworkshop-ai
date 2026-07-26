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

  // Narrowed explicitly rather than with a non-null assertion: `!` would
  // silence the compiler without proving anything, and this is the function
  // that decides which tenant's data a request may touch.
  if (!selected) {
    throw new TenantResolutionError('no membership selected');
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

/** A parameterised statement: SQL text plus bound values. */
export interface BoundStatement {
  readonly text: string;
  /** Mutable by design — `pg` accepts `any[]`, not a readonly array. */
  readonly values: string[];
}

/**
 * The statements that bind the resolved context to the database transaction,
 * so PostgreSQL RLS becomes the final backstop.
 *
 * Two deliberate choices:
 *
 * 1. `set_config(..., true)` rather than `SET LOCAL app.current_role = '...'`.
 *    `current_role` is a RESERVED KEYWORD in PostgreSQL and the SET LOCAL form
 *    is a syntax error — verified against a live database, which rejected it
 *    with: syntax error at or near "current_role".
 *
 * 2. Values are BOUND, never interpolated. Even though these values originate
 *    from validated membership rows rather than user input, building SQL by
 *    string concatenation is how injection defects are introduced later, when
 *    someone adds a field whose provenance is less certain. Binding removes the
 *    question entirely.
 *
 * The `true` third argument makes each setting transaction-local, so a pooled
 * connection cannot carry one tenant's context into the next request.
 */
export function tenantSessionStatements(ctx: TenantContext): BoundStatement[] {
  const set = (key: string, value: string): BoundStatement => ({
    text: 'SELECT set_config($1, $2, true)',
    values: [key, value],
  });

  return [
    set('app.tenant_id', ctx.tenantId),
    set('app.user_id', ctx.userId),
    set('app.current_role', ctx.activeRole),
    set('app.organization_ids', ctx.organizationId),
    set('app.branch_ids', ctx.branchId ?? ''),
  ];
}
