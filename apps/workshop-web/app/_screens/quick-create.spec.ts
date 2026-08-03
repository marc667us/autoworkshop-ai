import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getWorkspace, visibleGroups, workspaceForRole } from '@autoworkshop/navigation';
import type { RoleId } from '@autoworkshop/navigation';

/**
 * 🔴 AN "ADD NEW …" BUTTON MUST NEVER POINT WHERE ITS OWNER WOULD BE REFUSED.
 *
 * `quickCreateHref` resolves the target out of the viewer's own visible
 * navigation, so by construction it cannot disagree with `requireNavRoute`.
 * This test guards the two things construction does NOT guarantee:
 *
 *   1. that the route it finds has a PAGE behind it — an href in the menu with
 *      no `page.tsx` lands in the "not built yet" catch-all, which is the exact
 *      dead-primary-action failure the job-card queues were fixed for;
 *   2. that a role with no such route resolves to NOTHING rather than to some
 *      other tree's path.
 *
 * It repeats `quickCreateHref`'s resolution rather than importing it, because
 * that module reads `next/headers` for the session and cannot load outside a
 * Next server runtime. The RESOLUTION is the part under test; the session is
 * not.
 */
describe('quick-create targets', () => {
  const workshop = getWorkspace('workshop');

  /** The same three functions `requireNavRoute` uses, in the same order. */
  function resolve(role: RoleId | undefined, slug: string, grants: string[] = []): string | null {
    const groups = visibleGroups(workspaceForRole(workshop!, role), grants as never);
    const suffix = `/${slug}`;
    for (const g of groups) for (const i of g.items) if (i.href.endsWith(suffix)) return i.href;
    return null;
  }

  const pageFor = (href: string) =>
    join(__dirname, '..', ...href.split('/').filter(Boolean), 'page.tsx');

  it('found the workspace to resolve against', () => {
    // Without this, every assertion below would run against an empty tree and
    // pass for the wrong reason.
    expect(workshop).toBeTruthy();
    expect(resolve('owner', 'register-customer')).toBeTruthy();
  });

  const CASES: Array<[RoleId | undefined, string, string | null]> = [
    ['owner', 'register-customer', '/customers-and-vehicles/register-customer'],
    ['owner', 'register-vehicle', '/customers-and-vehicles/register-vehicle'],
    ['manager', 'register-customer', '/requests-and-reception/register-customer'],
    ['manager', 'register-vehicle', '/requests-and-reception/register-vehicle'],
    ['reception', 'register-customer', '/customers/register-customer'],
    ['reception', 'register-vehicle', '/vehicles/register-vehicle'],
    // 🔴 THE TECHNICIAN HAS NEITHER, AND MUST GET NOTHING. §49 scopes them to
    // assigned work; they do not keep the customer book. A button here would be
    // a guaranteed 404 on a screen they can otherwise read.
    ['technician', 'register-customer', null],
    ['technician', 'register-vehicle', null],
  ];

  it.each(CASES)('%s + %s resolves to %s', (role, slug, expected) => {
    expect(resolve(role, slug)).toBe(expected);
  });

  it('every resolved target has a page on disk behind it', () => {
    for (const [role, slug] of CASES) {
      const href = resolve(role, slug);
      if (!href) continue;
      expect(existsSync(pageFor(href)), `${role}/${slug} -> ${href} has no page.tsx`).toBe(true);
    }
  });

  /**
   * 🔴 THE PERMISSION CASE, AND IT IS REAL RATHER THAN HYPOTHETICAL. On the §34
   * default tree `register-customer` carries `permission: 'organization.admin'`.
   * A viewer on that tree WITHOUT the grant must get no button — otherwise the
   * screen offers them an action that 404s.
   */
  it('the default tree hides the target from a viewer without organization.admin', () => {
    expect(resolve(undefined, 'register-customer', [])).toBeNull();
    expect(resolve(undefined, 'register-customer', ['organization.admin'])).toBe(
      '/customer-reception/register-customer',
    );
  });

  it('proves the resolver can return null at all', () => {
    // Injecting the failure: a slug nothing advertises must not resolve to
    // something merely because the loop fell through oddly.
    expect(resolve('owner', 'register-unicorn')).toBeNull();
  });
});
