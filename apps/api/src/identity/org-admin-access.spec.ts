import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ORGANISATION_ADMIN_ROLES,
  isOrganisationAdmin,
  isWorkshopStaff,
} from '../authz/workshop-roles';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * 🔴 THE REGRESSION NET FOR "the write half opened and the read half did not".
 *
 * This file exists because that defect happened THREE TIMES in one change, each
 * time caught by a different reviewer rather than by a test:
 *
 *   1. Migration 085 made `insurance_owner` able to GRANT a membership, while
 *      `MembershipService.list()` still refused them — so the roster that a
 *      withdrawal needs the id from was unreadable, and every appointment was
 *      irreversible. (Supervisor.)
 *   2. `CAN_CREATE_BRANCH` admitted the new roles while `BranchService.list()`
 *      did not — create a depot, then cannot see it. (Supervisor.)
 *   3. `MembershipService.list()` was then widened and `UserService.list()` was
 *      NOT, so the staff screen failed on its first read and rendered a failure
 *      above its own add form. (Codex.)
 *
 * The pattern is always the same shape, so the test is about the SHAPE: any
 * service an organisation admin may WRITE through must also be one they may
 * READ through. Asserted by reading the source text, because these gates are
 * scattered across services and importing each one would need a database.
 */

const IDENTITY_DIR = __dirname;

function source(file: string): string {
  return readFileSync(join(IDENTITY_DIR, file), 'utf8');
}

function ctx(activeRole: string): TenantContext {
  return {
    tenantId: '00000000-0000-0000-0000-000000000001',
    organizationId: '00000000-0000-0000-0000-000000000002',
    userId: '00000000-0000-0000-0000-000000000003',
    activeRole,
    hasPlatformGrant: false,
  } as unknown as TenantContext;
}

describe('organisation admins', () => {
  it('includes every org-admin role, and no operational one', () => {
    // The two 085 roles are the point of this list; the other four were already
    // org admins and are named so a future edit cannot quietly drop one.
    expect([...ORGANISATION_ADMIN_ROLES].sort()).toEqual(
      [
        'fleet_administrator',
        'insurance_owner',
        'platform_administrator',
        'supplier_owner',
        'towing_owner',
        'workshop_owner',
      ].sort(),
    );

    // 🔴 THE OPERATIONAL ROLES MUST NOT BE HERE. Adding `insurance_assessor`
    // would hand the person who assesses a claim the authority to appoint the
    // person who approves it — the exact separation of duty 085 exists to
    // create, and the cheap wrong fix that was rejected when it was designed.
    for (const role of [
      'insurance_assessor',
      'towing_operator',
      'technician',
      'customer',
      'reception_staff',
    ]) {
      expect(isOrganisationAdmin(ctx(role)), `${role} must not be an org admin`).toBe(false);
    }
  });

  it('does NOT make partner admins into workshop staff', () => {
    // Two separate questions. `isWorkshopStaff` answers "does this person work
    // in the workshop"; `isOrganisationAdmin` answers "may this person
    // administer their own organisation". Conflating them would give an
    // insurer's administrator a workshop's staff surfaces.
    for (const role of ['insurance_owner', 'towing_owner', 'supplier_owner', 'fleet_administrator']) {
      expect(isWorkshopStaff(ctx(role)), `${role} must not be workshop staff`).toBe(false);
      expect(isOrganisationAdmin(ctx(role)), `${role} must be an org admin`).toBe(true);
    }
  });

  /**
   * 🔴 THE ONE THAT WOULD HAVE CAUGHT ALL THREE DEFECTS.
   *
   * Every read an org admin depends on must admit them. Asserted against the
   * source text: a gate written as a bare `assertWorkshopStaff(...)` refuses
   * them, whereas the widened form tests `isOrganisationAdmin` first.
   */
  it.each([
    ['membership.service.ts', 'the roster a withdrawal needs the id from'],
    ['branch.service.ts', 'the branches they may create'],
    ['user.service.ts', 'the names the roster is displayed with'],
  ])('%s admits an organisation admin to its reads (%s)', (file) => {
    const text = source(file);

    // The widened guard must be present at all.
    expect(
      text.includes('isOrganisationAdmin'),
      `${file} never consults isOrganisationAdmin — an org admin cannot read ${file}`,
    ).toBe(true);

    // And no read may be left behind a BARE assertion. A bare call is one that
    // is not preceded on the same line by the `if (!isWorkshopStaff` guard, so
    // count statements that begin a line.
    const bare = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('assertWorkshopStaff(') && !l.startsWith('//'));

    // Every remaining bare call must sit INSIDE the widened guard, which means
    // the line before it opens that guard.
    const lines = text.split('\n');
    for (const [i, line] of lines.entries()) {
      if (!line.trim().startsWith('assertWorkshopStaff(')) continue;
      const previous = lines
        .slice(Math.max(0, i - 3), i)
        .map((l) => l.trim())
        .join(' ');
      expect(
        previous.includes('isOrganisationAdmin'),
        `${file}:${i + 1} refuses organisation admins outright — ` +
          'a role that may WRITE here must be able to READ here',
      ).toBe(true);
    }
    expect(bare.length).toBeGreaterThan(0); // the guards still exist for customers
  });

  /**
   * 🔴 WITHDRAWAL MUST BE ORGANISATION-SCOPED, NOT ONLY TENANT-SCOPED.
   *
   * `membershipId` arrives from the client as a hidden form field. The UPDATE
   * used to filter on `id + active + tenant_id` only, so an administrator could
   * revoke an active membership in a SIBLING organisation of the same tenant by
   * substituting its uuid — and RLS cannot stop that, because the row genuinely
   * is in this tenant. Codex found it on the staff screens, whose hidden field
   * is exactly the forgeable input.
   */
  it('scopes withdrawal to the caller organisation unless they act as platform admin', () => {
    const text = source('membership.service.ts');

    // 🔴 ANCHORED ON `async withdraw(`, NOT ON THE FIRST `UPDATE`.
    //
    // The first version sliced from `indexOf('UPDATE identity.memberships')`,
    // which finds the REINSTATE update inside `grant()` — a different statement
    // entirely — and ran to end of file. So it would have passed if the
    // organisation predicate were moved to `grant()` and DELETED from
    // `withdraw()`: a regression net that did not cover the statement it names.
    // My own test had the defect it was written to catch. (Supervisor.)
    const start = text.indexOf('async withdraw(');
    expect(start, 'withdraw() not found — this test is anchored on it').toBeGreaterThan(-1);
    const withdrawBody = text.slice(start);

    expect(
      withdrawBody.includes('organization_id = $5::uuid'),
      'withdrawal is not organisation-scoped — a sibling organisation is reachable',
    ).toBe(true);
    expect(
      withdrawBody.includes('user_id <> $6::uuid'),
      'withdrawal permits self-revocation — for a sole org admin that is an ' +
        'unrecoverable lockout of the whole organisation',
    ).toBe(true);
  });

  /**
   * 🔴 BOTH HALVES OF ONE PERMISSION MUST ASK THE SAME QUESTION.
   *
   * Scoping only the withdrawal produced memberships the granting admin could
   * not revoke: `grant()` validated the organisation against the TENANT while
   * `withdraw()` required the caller's own ORGANISATION.
   */
  it('scopes granting to the caller organisation too, not merely the tenant', () => {
    const text = source('membership.service.ts');
    const start = text.indexOf('async grant(');
    expect(start, 'grant() not found').toBeGreaterThan(-1);
    const grantBody = text.slice(start, text.indexOf('async withdraw('));
    expect(
      grantBody.includes('($3::uuid IS NULL OR id = $3::uuid)'),
      'grant() is only tenant-scoped — an admin can appoint into a sibling ' +
        'organisation they cannot then withdraw from',
    ).toBe(true);
  });

  /**
   * The platform exemption needs the GRANT and the ACTIVE ROLE.
   *
   * The role name alone is what 078 made inert; the grant alone is what
   * `tenant-context.ts:310` forbids, because it would follow the person across
   * a deliberate downgrade and make the role switcher decorative.
   */
  it('exempts the platform administrator on the grant AND the active role', () => {
    const text = source('membership.service.ts');
    expect(
      /ctx\.hasPlatformGrant\s*&&\s*ctx\.activeRole === PLATFORM_ADMIN_ROLE_NAME/.test(text),
      'the platform exemption must require BOTH the grant and the active role',
    ).toBe(true);
    // And it must be used, not merely defined.
    expect(text.includes('isActingAsPlatformAdmin(ctx)')).toBe(true);
  });
});
