import { describe, it, expect, vi } from 'vitest';
import { MembershipRepository } from './membership.repository';
import { MeService } from './me.service';
import type { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * The API half of migration 077, at the two seams Codex found in review.
 *
 * 077 hardened the DATABASE and left the API deriving `platform.admin` from the
 * membership `role_name`. Migration 078 plus `resolveTenantContext` close that.
 * These two tests cover the parts NOT covered by `tenant-context.spec.ts`:
 * what happens when the database has not caught up, and what the switcher is
 * offered.
 */

describe('MembershipRepository.hasPlatformGrant', () => {
  /**
   * `queryWithoutTenant` is called up to twice: the lookup, then — only on a
   * 42883 — the `to_regprocedure` probe that decides whether the function is
   * genuinely absent or merely broken inside.
   */
  const repo = (lookup: () => Promise<unknown>, functionPresent = false) => {
    let call = 0;
    const query = async () => {
      call += 1;
      if (call === 1) return lookup();
      return [{ present: functionPresent }];
    };
    return new MembershipRepository({ queryWithoutTenant: query } as unknown as DatabaseService);
  };

  it('🔴 returns FALSE, not an outage, when migration 078 has not been applied', async () => {
    // ── THE DEPLOY-ORDERING DEFECT, AND THE FIRST VERSION HAD IT ───────────
    //
    // `TenantGuard` calls this on EVERY authenticated request. 078 creates
    // `identity.platform_grant_for_subject`; a production database still at 077
    // does not have it. Without this branch, an API image shipped ahead of the
    // migration raises `undefined_function` for every user of every role — a
    // near-total API outage from deploy ordering alone.
    //
    // The original code caught nothing and argued that the request already
    // hard-depends on `memberships_for_subject`, so nothing new could break.
    // That was WRONG: 039 created that function, so any database at 077 has it.
    // This one is new in 078. Codex found it.
    const err = Object.assign(new Error('function identity.platform_grant_for_subject does not exist'), {
      code: '42883',
    });
    const r = repo(() => Promise.reject(err));
    await expect(r.hasPlatformGrant('subject-1')).resolves.toBe(false);
  });

  it('🔴 RETHROWS every other database error — a transport failure is not an authorization fact', async () => {
    // Connection refused, permission denied, timeout: none of these means "no
    // grant". Turning them into a quiet `false` is the silent
    // fail-closed-for-everyone this repository has recorded three times, and it
    // would also mask a real outage as a permissions change.
    for (const code of ['08006', '42501', '57014', undefined]) {
      const err = Object.assign(new Error('nope'), code ? { code } : {});
      const r = repo(() => Promise.reject(err));
      await expect(
        r.hasPlatformGrant('subject-1'),
        `SQLSTATE ${code ?? '(none)'} must not be swallowed`,
      ).rejects.toThrow('nope');
    }
  });

  it('🔴 RETHROWS 42883 when the function IS installed — that is not deploy ordering', async () => {
    // Codex's second-pass finding. Matching the SQLSTATE alone also swallows a
    // 42883 raised from INSIDE an installed `platform_grant_for_subject` whose
    // own dependency is missing. Swallowing that strips authority from every
    // administrator for a reason that is not a deploy race, while logging a
    // confident explanation that is FALSE.
    //
    // Reverting the `to_regprocedure` probe makes this test fail: the old code
    // returned `false` here.
    const err = Object.assign(new Error('function identity.some_helper does not exist'), {
      code: '42883',
    });
    const r = repo(() => Promise.reject(err), /* functionPresent */ true);
    await expect(r.hasPlatformGrant('subject-1')).rejects.toThrow('some_helper');
  });

  it('CONTRACT, not proof: passes the answer through unchanged, both ways', async () => {
    // ⚠️ THIS TEST PASSES WITH OR WITHOUT THE 42883 CATCH, and saying so is the
    // point — Codex flagged the earlier version for reading like proof of a fix
    // it cannot see. It guards the OPPOSITE error: a future change that makes
    // the happy path stop returning the database's own answer.
    await expect(repo(async () => [{ granted: true }]).hasPlatformGrant('s')).resolves.toBe(true);
    await expect(repo(async () => [{ granted: false }]).hasPlatformGrant('s')).resolves.toBe(false);
    // An empty result is not "granted". It cannot happen — the function always
    // returns a row — but the fallback must point the safe way regardless.
    await expect(repo(async () => []).hasPlatformGrant('s')).resolves.toBe(false);
  });
});

describe('GET /me — the role switcher is not offered a role it cannot select', () => {
  const ctx = (hasPlatformGrant: boolean): TenantContext => ({
    tenantId: 't',
    organizationId: 'o',
    branchId: null,
    userId: 'u',
    activeRole: 'workshop_owner',
    hasPlatformGrant,
    correlationId: 'spec',
  });

  const rows = [
    { organization_id: 'o', organization_name: 'Alpha Motors', branch_id: null, branch_name: null, role_name: 'workshop_owner' },
    { organization_id: 'o', organization_name: 'Alpha Motors', branch_id: null, branch_name: null, role_name: 'platform_administrator' },
  ];

  const service = () => {
    const query = vi
      .fn()
      // profile, then memberships
      .mockResolvedValueOnce({ rows: [{ id: 'u', display_name: 'Owner', email: 'o@x' }] })
      .mockResolvedValueOnce({ rows });
    const db = {
      withTenant: async (_c: TenantContext, fn: (c: unknown) => unknown) => fn({ query }),
    } as unknown as DatabaseService;
    return new MeService(db);
  };

  it('🔴 hides platform_administrator when no grant backs it', async () => {
    // Found by Codex. `resolveTenantContext` refuses the selection, so listing
    // it put a role in the switcher that throws the instant it is chosen — an
    // option that exists only to be refused.
    const viewer = await service().describe(ctx(false));
    expect(viewer.memberships.map((m) => m.roleName)).toEqual(['workshop_owner']);
    expect(viewer.permissions).not.toContain('platform.admin');
  });

  it('🟢 GUARD, not proof: does not over-filter when the grant IS held', async () => {
    // ⚠️ THIS PASSES WITH OR WITHOUT THE FILTER — the unfiltered implementation
    // returned both memberships too. Codex flagged the earlier version for
    // reading like proof. It is here to catch the opposite mistake: a filter
    // that hides the role from a REAL administrator, which would take the
    // switcher away from the one person who needs it.
    const viewer = await service().describe(ctx(true));
    expect(viewer.memberships.map((m) => m.roleName)).toEqual([
      'workshop_owner',
      'platform_administrator',
    ]);
    // ⚠️ AND STILL NO `platform.admin`, because the ACTIVE role is
    // `workshop_owner`. Holding the grant is a fact about the person; the
    // permission also requires acting as the platform role. A granted
    // administrator who switches down genuinely switches down.
    expect(viewer.permissions).not.toContain('platform.admin');
  });
});
