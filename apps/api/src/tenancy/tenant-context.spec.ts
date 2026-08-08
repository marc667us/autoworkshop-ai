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

  it('🔴 a CUSTOMER membership at another workshop does not become the default', () => {
    // ── THE DEFECT THE OWNER REPORTED, 2026-08-07 ──────────────────────────
    //
    //   "still customer page showup for every role user login"
    //
    // Every other test in this block uses memberships in ONE organisation, so
    // they proved role precedence and never touched the case that was broken.
    // The comparator sorted on `organizationId` FIRST, so role authority could
    // only choose between roles inside a single organisation — and the default
    // was really decided by whichever organisation's id sorted lowest.
    //
    // Registering as a customer at any workshop whose id sorted before your own
    // therefore demoted you on every login, silently, for ever. Reproduced
    // against the real database before this was changed: an account holding
    // platform_administrator + workshop_owner + technician resolved to
    // `customer` because that membership's organisation id began with `1f`.
    //
    // `org-0` sorts BEFORE `org-1`, so under the old comparator this returns
    // `customer` — which is precisely what the owner saw.
    const ctx = resolveTenantContext({
      userId: 'owner',
      memberships: [
        membership({ organizationId: 'org-0', roleName: 'customer' }),
        ...owner,
      ],
      correlationId: 'c',
    });

    expect(ctx.activeRole).toBe('platform_administrator');
    // And the ORGANISATION follows the role, not the other way round — landing
    // in the right role but the wrong workshop would be the same bug wearing a
    // different hat.
    expect(ctx.organizationId).toBe('org-1');
  });

  it('the strongest role wins even when it arrives last and its org sorts last', () => {
    // Both keys pushed the wrong way at once, because `sort` is stable and a
    // fixture that happens to be in a helpful order proves nothing.
    const ctx = resolveTenantContext({
      userId: 'owner',
      memberships: [
        membership({ organizationId: 'org-0', roleName: 'customer' }),
        membership({ organizationId: 'org-1', roleName: 'technician' }),
        membership({ organizationId: 'org-9', roleName: 'workshop_owner' }),
      ],
      correlationId: 'c',
    });
    expect(ctx.activeRole).toBe('workshop_owner');
    expect(ctx.organizationId).toBe('org-9');
  });

  it('organisation still breaks the tie when ONE role is held at several workshops', () => {
    // The demoted key must still be doing its job: without it, two identical
    // roles at different workshops compare equal and the winner is row order,
    // so a viewer's workshop could change between two requests.
    const ctx = resolveTenantContext({
      userId: 'owner',
      memberships: [
        membership({ organizationId: 'org-9', roleName: 'workshop_manager' }),
        membership({ organizationId: 'org-2', roleName: 'workshop_manager' }),
      ],
      correlationId: 'c',
    });
    expect(ctx.organizationId).toBe('org-2');
    const reversed = resolveTenantContext({
      userId: 'owner',
      memberships: [
        membership({ organizationId: 'org-2', roleName: 'workshop_manager' }),
        membership({ organizationId: 'org-9', roleName: 'workshop_manager' }),
      ],
      correlationId: 'c',
    });
    expect(reversed.organizationId).toBe('org-2');
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

  it('the default DOES open the strongest workspace, even in another tenant', () => {
    // ⚠️ THIS TEST ASSERTED THE OPPOSITE UNTIL 2026-08-07, DELIBERATELY. The
    // reversal is a decision, not a slip, so the old reasoning is kept here
    // rather than deleted.
    //
    // IT SAID: organisation must stay the PRIMARY key, because "a stronger role
    // in a different organisation must not drag the request into that tenant —
    // the caller would silently read another organisation's data."
    //
    // 🔴 THAT FRAMING WAS OVERSTATED, and the overstatement cost the owner a
    // working product. Every candidate here is a membership ALREADY PROVED from
    // the validated token subject. Opening as `platform_administrator` of
    // tenant-b is not reading "another organisation's data" — it is reading
    // the caller's OWN workspace, one they hold an administrator role in. No
    // authorization boundary is involved; the question is only which of the
    // user's own workspaces opens first.
    //
    // WHAT THE OLD ORDER ACTUALLY COST: because organisation sorted first, the
    // default was decided by a UUID. Owner, 2026-08-07: *"still customer page
    // showup for every role user login"* — an account holding
    // platform_administrator, workshop_owner and technician was pinned to
    // `customer` because it had also registered as a customer at a workshop
    // whose id sorted lower. Silently, on every login, with the switcher the
    // only escape and no clue that it was needed.
    //
    // Weighed plainly: the old order risks OPENING A DIFFERENT WORKSPACE THAN
    // LAST TIME (deterministic, visible, one click to change). The new order
    // risks nothing an attacker can use and fixes a silent, total demotion.
    //
    // ⚠️ THE PROPERTY THAT ACTUALLY MATTERED IS UNTOUCHED: a REQUESTED
    // organisation the user does not hold still THROWS — see the tests above.
    // Nothing here can reach a membership the server has not proved.
    const ctx = resolveTenantContext({
      userId: 'owner',
      memberships: [
        membership({ tenantId: 'tenant-b', organizationId: 'org-2', roleName: 'platform_administrator' }),
        membership({ tenantId: 'tenant-a', organizationId: 'org-1', roleName: 'technician' }),
      ],
      correlationId: 'c',
    });
    expect(ctx.organizationId).toBe('org-2');
    expect(ctx.tenantId).toBe('tenant-b');
    expect(ctx.activeRole).toBe('platform_administrator');
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
