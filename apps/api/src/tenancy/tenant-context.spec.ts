import { describe, expect, it } from 'vitest';
import {
  resolveTenantContext,
  tenantSessionStatements,
  TenantResolutionError,
  type ValidatedMembership,
} from './tenant-context';

const membership = (over: Partial<ValidatedMembership> = {}): ValidatedMembership => ({
  tenantId: 'tenant-a',
  organizationId: 'org-1',
  branchId: null,
  roleName: 'mechanic',
  status: 'active',
  ...over,
});

describe('resolveTenantContext', () => {
  it('resolves a single active membership', () => {
    const ctx = resolveTenantContext({
      userId: 'user-1',
      memberships: [membership()],
      correlationId: 'corr-1',
    });
    expect(ctx.tenantId).toBe('tenant-a');
    expect(ctx.activeRole).toBe('mechanic');
  });

  it('refuses when the user holds no active membership', () => {
    expect(() =>
      resolveTenantContext({
        userId: 'user-1',
        memberships: [membership({ status: 'revoked' })],
        correlationId: 'c',
      }),
    ).toThrow(TenantResolutionError);
  });

  /**
   * CHANGED 2026-07-28 (T-0016). This previously asserted a THROW, and the
   * throw was a latent lockout: every request resolves context, `GET /me`
   * included, so a user holding two memberships and no stored selection could
   * not load the shell containing the switcher they needed to make one. It was
   * invisible only because every seeded identity held exactly one membership.
   *
   * Defaulting grants nothing: each candidate is a membership the server has
   * already proved. The confused-deputy case — a REQUESTED organization the
   * user does not hold — still throws, and is asserted immediately below.
   */
  it('takes a deterministic default when several memberships exist and none was selected', () => {
    const ctx = resolveTenantContext({
      userId: 'user-1',
      memberships: [membership({ organizationId: 'org-9' }), membership({ organizationId: 'org-2' })],
      correlationId: 'c',
    });
    expect(ctx.organizationId).toBe('org-2');
  });

  it('the default is STABLE regardless of the order memberships arrive in', () => {
    // Row order is not a contract. If the default tracked it, a viewer's tenant
    // could change between two identical requests — far worse than an
    // arbitrary-but-fixed choice.
    const forwards = resolveTenantContext({
      userId: 'user-1',
      memberships: [membership({ organizationId: 'org-2' }), membership({ organizationId: 'org-9' })],
      correlationId: 'c',
    });
    const backwards = resolveTenantContext({
      userId: 'user-1',
      memberships: [membership({ organizationId: 'org-9' }), membership({ organizationId: 'org-2' })],
      correlationId: 'c',
    });
    expect(forwards.organizationId).toBe(backwards.organizationId);
  });

  it('still prefers an EXPLICIT selection over the default', () => {
    const ctx = resolveTenantContext({
      userId: 'user-1',
      memberships: [membership({ organizationId: 'org-2' }), membership({ organizationId: 'org-9' })],
      requestedOrganizationId: 'org-9',
      correlationId: 'c',
    });
    expect(ctx.organizationId).toBe('org-9');
  });

  it('SECURITY: refuses an organization the user is not a member of', () => {
    // The confused-deputy case. A client asking for someone else's org must be
    // refused outright, never silently downgraded to a default membership.
    expect(() =>
      resolveTenantContext({
        userId: 'user-1',
        memberships: [membership()],
        requestedOrganizationId: 'org-belonging-to-someone-else',
        correlationId: 'c',
      }),
    ).toThrow(/not among the user active memberships/);
  });

  it('SECURITY: a client-supplied org can only select among proven memberships', () => {
    const ctx = resolveTenantContext({
      userId: 'user-1',
      memberships: [
        membership(),
        membership({ tenantId: 'tenant-b', organizationId: 'org-2', roleName: 'workshop_owner' }),
      ],
      requestedOrganizationId: 'org-2',
      correlationId: 'c',
    });
    expect(ctx.tenantId).toBe('tenant-b');
    expect(ctx.activeRole).toBe('workshop_owner');
  });

  it('binds context transaction-locally so pooled connections cannot leak it', () => {
    const stmts = tenantSessionStatements(
      resolveTenantContext({
        userId: 'user-1',
        memberships: [membership()],
        correlationId: 'c',
      }),
    );
    // Every statement must be transaction-local (the `true` third argument),
    // or a pooled connection would carry one tenant's context into the next.
    expect(stmts.every((s) => s.text === 'SELECT set_config($1, $2, true)')).toBe(true);
    expect(stmts.map((s) => s.values[0])).toContain('app.current_role');

    // SECURITY: values are BOUND, never interpolated into the SQL text.
    // A crafted role or tenant string must reach PostgreSQL as data.
    const evil = tenantSessionStatements({
      tenantId: "'; DROP TABLE identity.tenants; --",
      organizationId: 'org-1',
      branchId: null,
      userId: 'user-1',
      activeRole: 'mechanic',
      correlationId: 'c',
    });
    expect(evil.every((s) => !s.text.includes('DROP TABLE'))).toBe(true);
    expect(evil[0]?.values[1]).toBe("'; DROP TABLE identity.tenants; --");

    // `current_role` is reserved in PostgreSQL — the SET LOCAL form is a
    // syntax error, so it must never come back.
    expect(stmts.some((s) => s.text.startsWith('SET LOCAL'))).toBe(false);
  });
});
