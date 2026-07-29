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
    // No selection, several memberships: take a DETERMINISTIC default.
    //
    // ⚠️ THIS USED TO THROW, AND THAT WAS A LATENT LOCKOUT. Every request goes
    // through this function, `GET /me` included — so a user holding two
    // memberships and no stored selection could not load the shell that
    // contains the switcher they would have used to make one. The failure was
    // invisible only because every seeded identity happened to hold exactly one
    // membership; the first user granted a second would have been locked out of
    // the whole application.
    //
    // Defaulting is NOT the fallback this function refuses elsewhere. A
    // REQUESTED organization that is not among the user's memberships still
    // throws, because that is an authorization probe and silently downgrading
    // it would hide one. Here there is no request to contradict: every
    // candidate is a membership the server has already proved, so choosing one
    // grants nothing the user did not already hold.
    //
    // Sorted by organization id so the default is STABLE across requests.
    // Picking `active[0]` unsorted would depend on row order, and a viewer whose
    // tenant silently changed between two requests is far worse than an
    // arbitrary-but-fixed choice.
    selected = [...active].sort((a, b) =>
      a.organizationId.localeCompare(b.organizationId),
    )[0];
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
