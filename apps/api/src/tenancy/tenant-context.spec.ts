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

  it('refuses to guess when several memberships exist and none was selected', () => {
    expect(() =>
      resolveTenantContext({
        userId: 'user-1',
        memberships: [membership(), membership({ organizationId: 'org-2' })],
        correlationId: 'c',
      }),
    ).toThrow(/multiple memberships/);
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
    expect(stmts.every((s) => s.startsWith('SELECT set_config('))).toBe(true);
    expect(stmts.every((s) => s.endsWith(', true)'))).toBe(true);
    expect(stmts.some((s) => s.includes('app.current_role'))).toBe(true);
    // `current_role` is reserved in PostgreSQL — the SET LOCAL form is a
    // syntax error, so it must never come back.
    expect(stmts.some((s) => s.startsWith('SET LOCAL'))).toBe(false);
  });
});
