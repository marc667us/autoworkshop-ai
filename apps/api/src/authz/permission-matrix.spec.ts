import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLE_PRECEDENCE,
  permissionsForRole,
  rolePrecedence,
} from './permission-matrix';

/**
 * Permission matrix (T-0004) — the mapping `viewerGrants()` will finally read.
 *
 * These assert the two properties that matter: it fails CLOSED, and it stays in
 * step with the roles that can actually be granted.
 */

describe('permissionsForRole', () => {
  it('gives an unknown role NOTHING, never a default set', () => {
    // A typo in a role name must remove access, not grant it. If this ever
    // returned a default, a misspelling would silently hand out permissions.
    expect(permissionsForRole('workshop_ownr')).toEqual([]);
    expect(permissionsForRole('')).toEqual([]);
    expect(permissionsForRole('__proto__')).toEqual([]);
    expect(permissionsForRole('constructor')).toEqual([]);
  });

  it('grants platform.admin to exactly one role', () => {
    // §32 — the administration surface is for authorised administrative users.
    // Any second holder of this key is a finding, not a convenience.
    const holders = Object.entries(ROLE_PERMISSIONS)
      .filter(([, perms]) => perms.includes(PERMISSIONS.platformAdmin))
      .map(([role]) => role);
    expect(holders).toEqual(['platform_administrator']);
  });

  it('withholds finance.read from every role §50 does not give financial access', () => {
    // §50 verbatim: manager = "daily operational control"; supervisor =
    // "technical review ... quality oversight"; technician = assigned-job work;
    // storekeeper = parts; QC = testing and quality. None is financial.
    for (const role of [
      'workshop_manager',
      'workshop_supervisor',
      'technician',
      'storekeeper',
      'quality_control_inspector',
      'towing_operator',
      'customer',
    ]) {
      expect(permissionsForRole(role), `${role} must not hold finance.read`).not.toContain(
        PERMISSIONS.financeRead,
      );
    }
  });

  it('grants finance.read to the roles §50 gives financial functions', () => {
    // owner "financial and reporting"; reception "invoice and release";
    // cashier "invoice review, payment collection and receipt generation".
    for (const role of ['workshop_owner', 'reception_staff', 'cashier']) {
      expect(permissionsForRole(role), `${role} needs finance.read`).toContain(
        PERMISSIONS.financeRead,
      );
    }
  });

  it('does not let an operational role administer the organisation', () => {
    for (const role of ['workshop_manager', 'technician', 'reception_staff', 'cashier']) {
      expect(permissionsForRole(role)).not.toContain(PERMISSIONS.organizationAdmin);
    }
  });

  it('returns a frozen table that a caller cannot widen at runtime', () => {
    expect(Object.isFrozen(ROLE_PERMISSIONS)).toBe(true);
  });
});

describe('the matrix and the grantable-role allow-list must stay in step', () => {
  /**
   * `MembershipService.GRANTABLE_ROLES` decides which roles may be assigned;
   * this matrix decides what each one may then see. A role that can be granted
   * but has no entry here receives NO permissions — which fails closed, so it
   * is safe, but presents as a user who logs in to an empty application and
   * looks like a bug at the screen rather than a gap in a table.
   *
   * The list is duplicated here deliberately rather than imported: importing it
   * would make the two agree by construction and prove nothing. This is the one
   * place the duplication is the point.
   */
  const GRANTABLE = [
    'workshop_owner',
    'workshop_manager',
    'reception_staff',
    'workshop_supervisor',
    'technician',
    'storekeeper',
    'quality_control_inspector',
    'cashier',
    'supplier_owner',
    'fleet_administrator',
    'insurance_assessor',
    'towing_operator',
    'customer',
  ];

  it('every grantable role has a matrix entry', () => {
    const missing = GRANTABLE.filter((r) => !(r in ROLE_PERMISSIONS));
    expect(missing, 'grantable roles with no permission-matrix entry').toEqual([]);
  });

  it('every role in the matrix is RANKED for the default tie-break', () => {
    // A role with no rank sorts LAST, which fails safe but is silent — and the
    // symptom at the screen is a user resolving as a weaker role than they
    // hold, with nothing to explain it. Two lists that must move together are
    // exactly the pair that drifts, so assert it rather than remember it.
    const unranked = Object.keys(ROLE_PERMISSIONS).filter((r) => !ROLE_PRECEDENCE.includes(r));
    expect(unranked, 'roles with a permission entry but no precedence rank').toEqual([]);
  });

  it('the precedence list ranks no role that does not exist', () => {
    // The other direction: a rank for a role nobody can hold reads as a
    // supported configuration and quietly outranks real ones if it is ever
    // seeded by hand.
    const phantom = ROLE_PRECEDENCE.filter((r) => !(r in ROLE_PERMISSIONS));
    expect(phantom, 'ranked roles with no permission-matrix entry').toEqual([]);
  });

  it('precedence puts governance above execution, not alphabetically', () => {
    // The ordering is the whole point — a list that happened to be alphabetical
    // would rank `cashier` above `workshop_owner`. Spot-check the pairs the
    // owner account actually depends on (`07.txt` pt2 §50).
    expect(rolePrecedence('platform_administrator')).toBeLessThan(rolePrecedence('workshop_owner'));
    expect(rolePrecedence('workshop_owner')).toBeLessThan(rolePrecedence('workshop_manager'));
    expect(rolePrecedence('workshop_manager')).toBeLessThan(rolePrecedence('technician'));
    expect(rolePrecedence('reception_staff')).toBeLessThan(rolePrecedence('technician'));
  });

  it('an unknown role ranks LAST, never first', () => {
    expect(rolePrecedence('not_a_role')).toBeGreaterThan(rolePrecedence('customer'));
  });

  it('every matrix entry is a role that can actually be granted', () => {
    // The other direction: an entry for a role nobody can hold is dead weight
    // that reads as a supported configuration.
    const grantable = new Set([...GRANTABLE, 'platform_administrator']);
    const orphans = Object.keys(ROLE_PERMISSIONS).filter((r) => !grantable.has(r));
    expect(orphans, 'permission entries for non-grantable roles').toEqual([]);
  });

  it('only permission keys the navigation actually gates on are granted', () => {
    // Guards against the matrix growing speculative keys no screen consumes,
    // which later get copied as though they were a decided taxonomy.
    const known = new Set<string>(Object.values(PERMISSIONS));
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      for (const p of perms) {
        expect(known.has(p), `${role} grants unknown permission '${p}'`).toBe(true);
      }
    }
  });
});
