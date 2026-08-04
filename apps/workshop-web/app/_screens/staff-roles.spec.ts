import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WORKSHOP_ROLES } from './staff-roles';

/**
 * 🔴 A ROLE NAME THIS FORM OFFERS BUT THE API REFUSES IS A DEAD CONTROL.
 *
 * `MembershipService.grant()` checks its own `GRANTABLE_ROLES` allow-list and
 * rejects anything outside it with a deliberately vague `unknown role` — it
 * will not enumerate the taxonomy, which is correct and which also means the
 * screen gets back a refusal that names nothing. An owner picks "Supervisor",
 * the grant fails, and there is no clue anywhere as to why.
 *
 * The same class as the mobile app reading `stageOptions` where the API returns
 * `allowedStages`, and a web queue keyed on `awaiting_internal_review`, which
 * is a board column and not a stage at all. Both were silent.
 *
 * The API's own source is the authority; this reads it rather than restating
 * the list, because a hand-copied list drifts with the same edit that breaks it.
 */
describe('the roles this form offers', () => {
  const source = readFileSync(
    join(__dirname, '../../../api/src/identity/membership.service.ts'),
    'utf8',
  );

  const block = /const GRANTABLE_ROLES = new Set\(\[([\s\S]*?)\]\)/.exec(source);
  // The predicate is spelled out rather than `.filter(Boolean)`:
  // `noUncheckedIndexedAccess` types a capture group as `string | undefined`,
  // and an undefined slipping into this set would silently shrink the very
  // comparison this file exists to make.
  const grantable = new Set<string>(
    [...(block?.[1] ?? '').matchAll(/'([a-z_]+)'/g)]
      .map((m) => m[1])
      .filter((r): r is string => typeof r === 'string'),
  );

  it('found the API allow-list to compare against', () => {
    // Guards the regex. Without this every assertion below would run against an
    // EMPTY set and pass while proving nothing — the check-that-walks-through-
    // its-own-gap failure this repo keeps recording.
    expect(block, 'could not find GRANTABLE_ROLES in membership.service.ts').toBeTruthy();
    expect(grantable.size).toBeGreaterThanOrEqual(8);
    expect(grantable.has('technician')).toBe(true);
  });

  it.each(WORKSHOP_ROLES.map((r) => r.value))('%s is one the API will accept', (value) => {
    expect(
      grantable.has(value),
      `the form offers "${value}" and MembershipService would refuse it with "unknown role"`,
    ).toBe(true);
  });

  it('offers every WORKSHOP role the API grants, so the list cannot silently shrink', () => {
    // The other direction. A role the API accepts but no screen offers is a
    // capability nobody can reach — which is the exact defect this whole screen
    // was built to fix, one role at a time.
    const workshopRoles = [...grantable].filter(
      (r) => r.startsWith('workshop_') || ['technician', 'reception_staff', 'storekeeper', 'cashier', 'quality_control_inspector'].includes(r),
    );
    const offered = new Set(WORKSHOP_ROLES.map((r) => r.value));
    const missing = workshopRoles.filter((r) => !offered.has(r));
    expect(missing, `grantable but unreachable from any screen: ${missing.join(', ')}`).toEqual([]);
  });

  it('gives every role a distinct human label and a hint', () => {
    // Raw snake_case in a dropdown asks the owner to know the platform's
    // internal vocabulary to hire somebody.
    for (const r of WORKSHOP_ROLES) {
      expect(r.label, `${r.value} has no label`).toBeTruthy();
      expect(r.label).not.toMatch(/_/);
      expect(r.hint, `${r.value} has no hint`).toBeTruthy();
    }
    expect(new Set(WORKSHOP_ROLES.map((r) => r.label)).size).toBe(WORKSHOP_ROLES.length);
  });
});
