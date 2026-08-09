import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { getWorkspace, visibleGroups, workspaceForRole } from '@autoworkshop/navigation';
import { isForeignToWorkshop, isForeignToWorkspace, navRoleFor } from './viewer-contract';

/**
 * The regression guard for the 45-screen leak.
 *
 * ⚠️ IT ASSERTS THE LEAK IS STILL THERE WHEN THE GUARD IS BYPASSED. A test that
 * only checked the fixed path would pass just as happily against a tree that had
 * been quietly emptied for some other reason, and would never notice the guard
 * being deleted. Proving BOTH directions is what makes it a guard rather than a
 * green tick.
 */
function menuItemCountFor(activeRole: string | undefined, grants: string[] = []) {
  if (isForeignToWorkshop(activeRole)) return 0; // what the shell + gate now do
  const ws = workspaceForRole(getWorkspace('workshop')!, navRoleFor(activeRole));
  let n = 0;
  for (const g of visibleGroups(ws, grants as never)) n += g.items.length;
  return n;
}

describe('a non-workshop role gets no workshop navigation', () => {
  it.each(['customer', 'supplier_owner', 'fleet_administrator', 'insurance_assessor', 'towing_operator'])(
    '%s sees ZERO workshop menu items',
    (role) => {
      expect(menuItemCountFor(role)).toBe(0);
    },
  );

  it('THE DEFECT IS REAL: bypassing the guard still exposes the whole staff tree', () => {
    // Exactly what happened before the fix — the raw resolution a customer got.
    const ws = workspaceForRole(getWorkspace('workshop')!, navRoleFor('customer'));
    let n = 0;
    for (const g of visibleGroups(ws, [] as never)) n += g.items.length;

    // 🔴 A THRESHOLD, NOT THE EXACT COUNT, AND THAT IS A CORRECTION.
    //
    // This asserted `toBe(45)` — the figure measured on 2026-08-06. Adding ONE
    // ordinary nav entry (Service Requests) made it 46 and turned Release RED,
    // on a change that had nothing to do with authorization. A test that breaks
    // every time the menu grows is a test people learn to update without
    // reading, which is worse than no test.
    //
    // The property worth pinning is not the number. It is that the default
    // staff tree is ENTIRELY UNGATED — grant filtering removes nothing — so the
    // guard is the only thing standing between a customer and all of it. That
    // is what makes the `toBe(0)` assertions above meaningful rather than
    // vacuous, and it stays true whatever the menu's size.
    expect(n).toBeGreaterThan(40);
  });

  it('a real STAFF role is untouched — this must not lock the workshop out', () => {
    expect(menuItemCountFor('workshop_owner')).toBeGreaterThan(0);
    expect(menuItemCountFor('technician')).toBeGreaterThan(0);
  });

  it('platform_administrator is DELIBERATELY not swept in', () => {
    // Sweeping it would risk locking admins out; that decision is separate.
    expect(isForeignToWorkshop('platform_administrator')).toBe(false);
  });

  it('an ABSENT role is not treated as foreign — a cold /me must not lock a member out', () => {
    expect(isForeignToWorkshop(undefined)).toBe(false);
  });
});

/**
 * 🔴 THE CALL SITES, NOT JUST THE PREDICATE.
 *
 * Codex's finding on the first version of this fix: the tests above exercise
 * `isForeignToWorkshop` and the raw navigation tree, and NEITHER of the two
 * functions that actually gate a request. So they stayed green while
 * `renderModulePage` — the catch-all, which serves every route without a
 * concrete page, `/home/calendar` among them — still resolved the workshop
 * default tree for a customer. The concrete pages were fixed and the
 * placeholders were left wide open, and the suite reported success.
 *
 * A source-level assertion is a blunt instrument, and it is used deliberately:
 * both call sites are async server functions that need a Next request context
 * and a live `/me`, so unit-testing their behaviour here is not possible. What
 * IS possible is refusing to let the guard be deleted silently. This fails the
 * moment either call site drops the check — which is the regression that
 * actually happened.
 */
describe('both gates call the guard — not just the predicate', () => {
  /**
   * 🔴 IMPORT LINES ARE STRIPPED, AND THAT IS THE WHOLE POINT.
   *
   * The first version of this helper matched the bare identifier, so
   * `import { isForeignToWorkshop } ...` satisfied it. The guard was then
   * DELETED from `ModulePage` and all twelve tests still passed — a test about
   * inert guards that was itself inert. Verified by injecting exactly that
   * deletion, which is the only way this was ever going to surface.
   *
   * Matching `isForeignToWorkshop(` after removing imports asserts a CALL.
   */
  const read = (f: string) =>
    // Import statements are STRIPPED, and that is the whole point. The first
    // version matched the bare identifier, so `import { isForeignToWorkshop }`
    // satisfied it — the guard was then DELETED from ModulePage and all twelve
    // tests still passed. A test about inert guards that was itself inert,
    // found only by injecting that deletion. Matching a CALL after removing
    // imports is what makes this bite.
    readFileSync(new URL(f, import.meta.url), 'utf8').replace(/^\s*import[^;]*;/gm, '');

  // ⚠️ THE GUARD IS NOW WORKSPACE-SCOPED, so the call to pin is
  // `isForeignToWorkspace(`. The old name asked "foreign to the WORKSHOP",
  // which both guards asked in every app — refusing four apps' own users.
  const CALL = 'isForeignToWorkspace(';

  it('requireNavRoute refuses a foreign role', () => {
    expect(read('./require-route.ts')).toContain(CALL);
  });

  it('renderModulePage (the CATCH-ALL) refuses a foreign role', () => {
    // This one was missing. Every route with no concrete page falls through
    // here, so a gate on the concrete pages alone protects almost nothing.
    expect(read('./ModulePage.tsx')).toContain(CALL);
  });

  it('both refuse BEFORE resolving the tree, or the refusal is decorative', () => {
    for (const f of ['./require-route.ts', './ModulePage.tsx']) {
      const src = read(f);
      expect(
        src.indexOf(CALL),
        `${f}: the guard must precede workspaceForRole`,
      ).toBeLessThan(src.indexOf('const workspace = workspaceForRole('));
      // Anchored on the STATEMENT, not the identifier: require-route.ts's own
      // comment explains the defect using the words `workspaceForRole(base,
      // undefined)`, and the first version of this check compared against that
      // prose instead of the code.
    }
  });
});

/**
 * 🔴 THE HALF THE ORIGINAL FIX GOT WRONG, AND THE TESTS ABOVE COULD NOT SEE.
 *
 * Every assertion above is about the WORKSHOP tree, so all twelve stayed green
 * while both route guards refused a customer on customer-web, a supplier on
 * supplier-web, a towing operator on towing-web and a fleet administrator on
 * fleet-web — the four apps those roles exist for. The guards were handed a
 * `workspaceId` and asked a question that ignored it.
 *
 * It survived because the live suite's signed-in job has been SKIPPED since it
 * was written (no `LIVE_OWNER_EMAIL`), and because three of these four roles
 * could not be created in production at all until 2026-08-08/09. Anonymous
 * visitors have no role, and `undefined` is foreign to nothing.
 */
describe('a role is refused ELSEWHERE and admitted at HOME', () => {
  const HOME: ReadonlyArray<readonly [string, string]> = [
    ['customer', 'customer'],
    ['supplier_owner', 'supplier'],
    ['fleet_administrator', 'fleet'],
    ['insurance_assessor', 'insurance'],
    ['towing_operator', 'towing'],
  ];

  it.each(HOME)('%s is NOT foreign to its own workspace (%s)', (role, home) => {
    expect(isForeignToWorkspace(home, role)).toBe(false);
  });

  it.each(HOME)('%s IS still foreign to the workshop', (role) => {
    // The original leak fix, unchanged: this is what stops a customer reaching
    // the 45-item workshop staff tree.
    expect(isForeignToWorkspace('workshop', role)).toBe(true);
    expect(isForeignToWorkshop(role)).toBe(true);
  });

  it('a role is foreign to every workspace that is not its own', () => {
    for (const [role, home] of HOME) {
      for (const [, other] of HOME) {
        if (other === home) continue;
        expect(isForeignToWorkspace(other, role)).toBe(true);
      }
    }
  });

  it('workshop staff and an unresolved role are admitted to the workshop', () => {
    // `undefined` means "not yet resolved" — the staff-mid-render case the
    // default tree exists for, and the signed-out visitor. Unchanged.
    expect(isForeignToWorkspace('workshop', undefined)).toBe(false);
    expect(isForeignToWorkspace('workshop', 'technician')).toBe(false);
    expect(isForeignToWorkspace('workshop', 'workshop_owner')).toBe(false);
  });

  /**
   * 🔴 THE OWNER'S REPORT: "log in as the owner, sign out, log in as admin, I
   * still see owner page features."
   *
   * `platform_administrator` was absent from `ROLE_TO_NAV`, so `navRoleFor()`
   * returned `undefined` and `workspaceForRole(base, undefined)` handed back the
   * workshop's DEFAULT STAFF TREE — the owner-looking menu, shown to an
   * administrator. Sign-out was never the fault: it already clears the switcher
   * cookies.
   *
   * ⚠️ THIS TEST PREVIOUSLY ASSERTED THE OPPOSITE, and it caught this change
   * rather than sleeping through it — which is what it is for. The old
   * assertion was correct while an administrator had nowhere else to go;
   * admin-web now exists and is deployed, so naming their home is no longer the
   * lockout the code warned about.
   */
  it('a platform administrator belongs to admin-web, NOT the workshop menu', () => {
    expect(isForeignToWorkspace('admin', 'platform_administrator')).toBe(false);
    expect(isForeignToWorkspace('workshop', 'platform_administrator')).toBe(true);
    // And still not swept in with the customer: `isForeignToWorkshop` is what
    // workshop-web's layout renders the foreign-workspace state from, so this is
    // the same answer by a second route.
    expect(isForeignToWorkshop('platform_administrator')).toBe(false);
  });
});
