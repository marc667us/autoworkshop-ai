import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ORG_TYPES } from './organization.schemas';

/**
 * 🔴 A ROLE GRANTED INTO AN ORGANISATION IT DOES NOT BELONG IN.
 *
 * `MembershipService.grant()` checked who may grant, that the role is
 * grantable, that the organisation is in the caller's tenant, and that the
 * branch is in the organisation. It never checked that the ROLE SUITS THE
 * ORGANISATION, and a query of the development database found the consequence:
 *
 *     parts_supplier | reception_staff | 1
 *
 * A workshop reception role inside a parts supplier. Every gate passed it, and
 * RLS says nothing about the pairing — `WITH CHECK` validates the tenant of the
 * row being inserted, not whether the row makes sense.
 *
 * It fails in the quiet direction. `workspaceForRole` resolves the WORKSHOP
 * reception tree for that person, so they are shown Vehicle Intake and Customer
 * Complaints for an organisation that has neither, and `isForeignToWorkspace`
 * routes them to the workshop pack while every API call is scoped to a
 * supplier's tenant. Nothing throws.
 *
 * ⚠️ THESE ASSERTIONS READ THE SERVICE'S OWN SOURCE rather than importing it.
 * `membership.service.ts` pulls in Nest's DI decorators, `DatabaseService` and
 * `AuditService`; importing it from a unit test drags a container into a file
 * that only wants to read two constants — the collection failure that made
 * `staff-roles.ts` its own module. Same convention, same reason.
 */

const source = readFileSync(join(__dirname, 'membership.service.ts'), 'utf8');

/** The org-type keys of `ROLES_BY_ORG_TYPE`, read from the source. */
function orgTypeKeys(): string[] {
  const block = /const ROLES_BY_ORG_TYPE[\s\S]*?Object\.freeze\(\{([\s\S]*?)\n\}\);/.exec(source);
  expect(block, 'could not find ROLES_BY_ORG_TYPE in membership.service.ts').toBeTruthy();
  return [...(block?.[1] ?? '').matchAll(/^\s{2}([a-z_]+):/gm)]
    .map((m) => m[1])
    .filter((k): k is string => typeof k === 'string');
}

describe('role ↔ organisation-type fit', () => {
  it('found the map to check', () => {
    // 🔴 GUARDS THE GUARD. Without this, a regex that stopped matching would
    // make every assertion below run over an EMPTY list and pass while proving
    // nothing — the check-that-walks-through-its-own-gap failure this
    // repository keeps recording.
    const keys = orgTypeKeys();
    expect(keys.length).toBeGreaterThanOrEqual(8);
    expect(keys).toContain('parts_supplier');
    expect(keys).toContain('individual_workshop');
  });

  it('names only organisation types the DATABASE admits', () => {
    // `ORG_TYPES` mirrors the `organizations_org_type_check` CHECK constraint,
    // and `organization.schemas.spec.ts` already asserts that mirror against the
    // migration. So this transitively checks the map against the constraint: a
    // key the database would reject is a rule that can never fire, and a rule
    // that can never fire on the privilege-granting operation looks exactly
    // like a rule that is working.
    for (const key of orgTypeKeys()) {
      expect(
        (ORG_TYPES as readonly string[]).includes(key),
        `ROLES_BY_ORG_TYPE names "${key}", which organizations_org_type_check does not admit — the entry is dead`,
      ).toBe(true);
    }
  });

  it('the partner organisation types each admit exactly their own role', () => {
    // Read as literal text rather than evaluated, so this asserts what the file
    // SAYS. The four partner types are one-role each by design; widening one is
    // a decision that should fail a test rather than pass unnoticed.
    for (const [orgType, role] of [
      ['parts_supplier', 'supplier_owner'],
      ['fleet_operator', 'fleet_administrator'],
      ['insurance_company', 'insurance_assessor'],
      ['towing_company', 'towing_operator'],
    ] as const) {
      const line = new RegExp(`${orgType}:\\s*\\[([^\\]]*)\\]`).exec(source);
      expect(line, `${orgType} has no entry`).toBeTruthy();
      const roles = [...(line?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
      expect(roles, `${orgType} should admit exactly ${role}`).toEqual([role]);
    }
  });

  it('a workshop organisation still admits platform_administrator', () => {
    // 🔴 THE ONE PAIRING THAT LOOKS WRONG AND IS CORRECT. The owner holds
    // `platform_administrator` through a membership attached to their own
    // workshop — the compromise the tenancy model forces, and the reason
    // `individual_workshop | platform_administrator` appears twice in the
    // development database. Since migration 078 the AUTHORITY comes from a
    // grant record rather than this name, so admitting the name confers
    // nothing. Refusing it here would have broken the owner's own account.
    expect(source).toMatch(/'platform_administrator',?\s*\n?\];/);
    expect(source).toContain('WORKSHOP_ROLE_SET');
  });

  it('the fit check refuses an unknown organisation type rather than admitting it', () => {
    // Fail-closed, and specifically NOT via a prototype-chain lookup:
    // `ROLES_BY_ORG_TYPE['constructor']` on a bare index returns the Object
    // function, which is truthy, so `?? []` never fires and every role would be
    // admitted into an organisation type called `constructor`.
    expect(source).toContain('Object.hasOwn(ROLES_BY_ORG_TYPE, orgType)');
    expect(source).toMatch(/if \(!Object\.hasOwn\(ROLES_BY_ORG_TYPE, orgType\)\) return false;/);
  });

  it('grant() actually calls the check, and refuses before inserting', () => {
    // 🔴 THE ASSERTION THAT MATTERS MOST. A perfect map that nothing consults
    // is the "config reads correct while the mechanism is INERT" defect this
    // repository has recorded five or more times. The call must exist, and it
    // must sit BEFORE the INSERT.
    const callIndex = source.indexOf('roleSuitsOrganisation(input.roleName, orgType)');
    const insertIndex = source.indexOf('INSERT INTO identity.memberships');
    expect(callIndex, 'grant() never calls roleSuitsOrganisation').toBeGreaterThan(-1);
    expect(insertIndex).toBeGreaterThan(-1);
    expect(
      callIndex,
      'the fit check runs AFTER the insert, so it refuses nothing',
    ).toBeLessThan(insertIndex);
  });
});
