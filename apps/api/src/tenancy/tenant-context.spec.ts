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

/**
 * The ROLE switcher — one login acting as any role it actually holds, without
 * signing out (owner request 2026-07-31).
 *
 * The whole risk sits in one sentence: the client names a PREFERENCE, never a
 * grant. These tests exist to make a regression toward "helpfully" honouring an
 * unheld role fail loudly.
 */
describe('resolveTenantContext — requestedRoleName', () => {
  const owner = [
    membership({ organizationId: 'org-1', roleName: 'technician' }),
    membership({ organizationId: 'org-1', roleName: 'workshop_supervisor' }),
    membership({ organizationId: 'org-1', roleName: 'platform_administrator' }),
  ];

  it('acts as a role the user holds', () => {
    const ctx = resolveTenantContext({
      userId: 'owner',
      memberships: owner,
      requestedRoleName: 'workshop_supervisor',
      correlationId: 'c',
    });
    expect(ctx.activeRole).toBe('workshop_supervisor');
  });

  it('switches again without any sign-out — the point of the feature', () => {
    for (const role of ['technician', 'workshop_supervisor', 'platform_administrator']) {
      const ctx = resolveTenantContext({
        userId: 'owner',
        memberships: owner,
        requestedRoleName: role,
        correlationId: 'c',
      });
      expect(ctx.activeRole).toBe(role);
    }
  });

  /**
   * 🔴 PRIVILEGE ESCALATION BY HEADER. A user holding only `technician` asks to
   * be `platform_administrator`. It must THROW — never fall back to the role
   * they do hold, because a silent downgrade hides an authorization probe, and
   * never honour it, because that is the confused-deputy attack `1.txt` §9
   * forbids.
   */
  it('REFUSES a role the user does not hold, rather than downgrading', () => {
    expect(() =>
      resolveTenantContext({
        userId: 'tech',
        memberships: [membership({ roleName: 'technician' })],
        requestedRoleName: 'platform_administrator',
        correlationId: 'c',
      }),
    ).toThrow(TenantResolutionError);
  });

  it('refuses an unheld role even when the user holds exactly one membership', () => {
    // Guards the `active.length === 1` fast path: filtering AFTER it would let
    // the shortcut return a membership contradicting the request.
    expect(() =>
      resolveTenantContext({
        userId: 'solo',
        memberships: [membership({ roleName: 'customer' })],
        requestedRoleName: 'platform_administrator',
        correlationId: 'c',
      }),
    ).toThrow(/requested role is not among/i);
  });

  it('refuses a role held only through a REVOKED membership', () => {
    // Status is checked before the role filter, so revocation is immediate.
    expect(() =>
      resolveTenantContext({
        userId: 'ex',
        memberships: [
          membership({ roleName: 'technician' }),
          membership({ roleName: 'platform_administrator', status: 'revoked' }),
        ],
        requestedRoleName: 'platform_administrator',
        correlationId: 'c',
      }),
    ).toThrow(TenantResolutionError);
  });

  it('still honours the organisation switcher alongside the role', () => {
    const ctx = resolveTenantContext({
      userId: 'owner',
      memberships: [
        membership({ organizationId: 'org-1', roleName: 'technician' }),
        membership({ organizationId: 'org-2', roleName: 'technician' }),
        membership({ organizationId: 'org-2', roleName: 'workshop_manager' }),
      ],
      requestedOrganizationId: 'org-2',
      requestedRoleName: 'workshop_manager',
      correlationId: 'c',
    });
    expect(ctx.organizationId).toBe('org-2');
    expect(ctx.activeRole).toBe('workshop_manager');
  });

  it('refuses a role the user holds only in a DIFFERENT organisation', () => {
    // Holding `workshop_manager` in org-2 must not make you one in org-1.
    expect(() =>
      resolveTenantContext({
        userId: 'owner',
        memberships: [
          membership({ organizationId: 'org-1', roleName: 'technician' }),
          membership({ organizationId: 'org-2', roleName: 'workshop_manager' }),
        ],
        requestedOrganizationId: 'org-1',
        requestedRoleName: 'workshop_manager',
        correlationId: 'c',
      }),
    ).toThrow(TenantResolutionError);
  });

  it('without a request, the default is the STRONGEST role held', () => {
    const ctx = resolveTenantContext({
      userId: 'owner',
      memberships: owner,
      correlationId: 'c',
    });
    // ⚠️ THIS ASSERTION USED TO BE `toContain(...)`, and the weakness was the
    // point: same-organisation candidates compared EQUAL under a sort keyed on
    // organisation alone, so the winner was database row order and no exact
    // value could honestly be pinned. `rolePrecedence` is the second sort key
    // that makes it answerable — the owner resolves as the administrator, not
    // as the technician they also happen to be.
    expect(ctx.activeRole).toBe('platform_administrator');
  });

  it('the default is stable however the rows arrive', () => {
    // The defect this closes is invisible in a fixed fixture: `sort` is stable,
    // so equal keys preserve input order and only a REORDERED input exposes it.
    // Reversed, the old comparator returned `technician`.
    const ctx = resolveTenantContext({
      userId: 'owner',
      memberships: [...owner].reverse(),
      correlationId: 'c',
    });
    expect(ctx.activeRole).toBe('platform_administrator');
  });

  it('an UNRANKED role sorts last — it never outranks a governance role', () => {
    // A role added to `identity.memberships` before it is added to
    // `ROLE_PRECEDENCE` must fail the SAFE way. Ranking it first would let a
    // new, unreviewed role name become the default for everyone holding it.
    const ctx = resolveTenantContext({
      userId: 'owner',
      memberships: [
        membership({ organizationId: 'org-1', roleName: 'brand_new_role' }),
        membership({ organizationId: 'org-1', roleName: 'workshop_owner' }),
      ],
      correlationId: 'c',
    });
    expect(ctx.activeRole).toBe('workshop_owner');
  });

  it('the role tie-break NEVER moves the request to another organisation', () => {
    // The property that makes the second sort key safe: organisation stays the
    // PRIMARY key. A stronger role in a different organisation must not drag
    // the request into that tenant — the caller would silently read another
    // organisation's data. org-1 sorts first, so org-1's technician wins over
    // org-2's administrator.
    const ctx = resolveTenantContext({
      userId: 'owner',
      memberships: [
        membership({ tenantId: 'tenant-b', organizationId: 'org-2', roleName: 'platform_administrator' }),
        membership({ tenantId: 'tenant-a', organizationId: 'org-1', roleName: 'technician' }),
      ],
      correlationId: 'c',
    });
    expect(ctx.organizationId).toBe('org-1');
    expect(ctx.tenantId).toBe('tenant-a');
    expect(ctx.activeRole).toBe('technician');
  });

  it('SECURITY: the default still cannot reach a role the user does not hold', () => {
    // Precedence RANKS candidates; it never adds one. A user holding only
    // `technician` resolves as `technician`, however high `workshop_owner`
    // sits in the list.
    const ctx = resolveTenantContext({
      userId: 'tech',
      memberships: [
        membership({ organizationId: 'org-1', roleName: 'technician' }),
        membership({ organizationId: 'org-1', roleName: 'workshop_owner', status: 'revoked' }),
      ],
      correlationId: 'c',
    });
    expect(ctx.activeRole).toBe('technician');
  });
});
