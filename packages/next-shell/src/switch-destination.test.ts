import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { homeWorkspaceFor } from './viewer-contract';

/**
 * WHERE A SWITCH SENDS YOU — the property, not the symptom.
 *
 * OWNER REPORT 2026-08-16: "it only sees admin which was nothing meaningful",
 * then "do not have access error message". Switching role set a cookie and
 * re-rendered the SAME URL, so a viewer who moved from
 * `platform_administrator` to `workshop_owner` stayed on `/admin/...` — a pack
 * they no longer hold `platform.admin` for — and the layout refused them.
 *
 * These tests assert the two things that make the fix correct, so neither can
 * regress silently:
 *   1. every role the API can select resolves to a pack that EXISTS on disk;
 *   2. a user-controlled role string cannot escape the intended path.
 *
 * ⚠️ THE FIRST TEST READS THE FILESYSTEM ON PURPOSE. `homeWorkspaceFor`
 * returning `'towing'` proves nothing if `apps/web/app/towing` does not exist —
 * that is the "two literals in two files cannot be type-checked into
 * agreement" bug class this repository keeps paying for. Only the directory is
 * evidence.
 */

// Mirrors `ROLE_PRECEDENCE` in `apps/api/src/authz/permission-matrix.ts`, which
// is what `resolveTenantContext` sorts by when it picks a default. Kept as an
// explicit list rather than imported because `packages/next-shell` must not
// depend on `apps/api` — the drift risk is real and is why the count is
// asserted below.
const SELECTABLE_ROLES = [
  'platform_administrator',
  'workshop_owner',
  'supplier_owner',
  'fleet_administrator',
  'workshop_manager',
  'workshop_supervisor',
  'quality_control_inspector',
  'insurance_assessor',
  'reception_staff',
  'cashier',
  'storekeeper',
  'technician',
  'towing_operator',
  'customer',
] as const;

const APP_DIR = join(__dirname, '..', '..', '..', 'apps', 'web', 'app');

describe('every selectable role lands on a pack that exists', () => {
  // A guard against the check passing vacuously. An empty list would make every
  // `it.each` below disappear and the suite would go green having asserted
  // nothing — which happened to this author's own throwaway version of this
  // check while writing it.
  it('has roles to test', () => {
    expect(SELECTABLE_ROLES.length).toBe(14);
  });

  it('can see the app directory it is asserting against', () => {
    expect(existsSync(APP_DIR)).toBe(true);
  });

  it.each(SELECTABLE_ROLES)('%s resolves to a real pack directory', (role) => {
    const pack = homeWorkspaceFor(role);
    expect(pack).toMatch(/^[a-z]+$/);
    expect(existsSync(join(APP_DIR, pack))).toBe(true);
  });
});

describe('a crafted role name cannot escape the path', () => {
  // `roleName` arrives from a form field the user controls. It is never
  // interpolated — it goes through `homeWorkspaceFor`, a fixed lookup — so
  // anything unrecognised must fall back to the workshop pack rather than
  // steering the redirect.
  it.each([
    '//evil.example',
    '../admin',
    '/../../etc/passwd',
    'http://evil.example',
    '%2f%2fevil.example',
    'admin?next=//evil.example',
    'admin#fragment',
    'platform_administrator ', // trailing space — not the mapped key
    'PLATFORM_ADMINISTRATOR',  // wrong case — not the mapped key
    'totally-unknown-role',
  ])('%j falls back to the workshop pack', (crafted) => {
    expect(homeWorkspaceFor(crafted)).toBe('workshop');
  });

  it('only ever returns one of the seven known packs', () => {
    const seen = new Set(
      [...SELECTABLE_ROLES, 'nonsense', '', '../x'].map((r) => homeWorkspaceFor(r)),
    );
    expect([...seen].sort()).toEqual(
      ['admin', 'customer', 'fleet', 'insurance', 'supplier', 'towing', 'workshop'],
    );
  });

  it('an undefined role is the workshop pack, matching the front door', () => {
    expect(homeWorkspaceFor(undefined)).toBe('workshop');
  });
});
