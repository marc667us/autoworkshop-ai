import { describe, expect, it, vi } from 'vitest';
import { BranchService } from './branch.service';
import { MembershipService } from './membership.service';
import { UserService } from './user.service';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * Identity service rules — T-0003.
 *
 * These are UNIT tests over a fake client: they assert the rules the database
 * cannot express — who may perform an action, which role names exist, what gets
 * audited, and which table a query is allowed to start from.
 *
 * They deliberately do NOT re-test row-level security. RLS is proven against a
 * real cluster as a non-superuser in `database.integration.spec.ts` and
 * `tests/tenant-isolation/`; asserting it against a mock would prove only that
 * the mock was written to agree.
 */

const ctx = (over: Partial<TenantContext> = {}): TenantContext => ({
  tenantId: 'tenant-a',
  organizationId: 'org-1',
  branchId: null,
  userId: 'user-1',
  activeRole: 'workshop_owner',
  correlationId: 'corr-1',
  ...over,
});

/**
 * Captures the SQL a service issues, and replays canned rows back.
 *
 * `rowsFor` lets a test answer different queries differently — needed for the
 * ownership checks, where the lookup must return nothing while the insert
 * returns a row.
 */
function fakeDb(rows: unknown[] = [], rowsFor?: (text: string) => unknown[] | undefined) {
  const queries: Array<{ text: string; values?: unknown[] }> = [];
  const client = {
    query: vi.fn(async (text: string, values?: unknown[]) => {
      queries.push({ text, values });
      return { rows: rowsFor?.(text) ?? rows };
    }),
  };
  return {
    queries,
    client,
    db: {
      withTenant: vi.fn(async (_c: TenantContext, work: (c: unknown) => Promise<unknown>) =>
        work(client),
      ),
    } as never,
  };
}

const fakeAudit = () => ({ write: vi.fn(async () => undefined) }) as never;

const branchRow = {
  id: 'b1',
  organization_id: 'org-1',
  name: 'Accra Main',
  location: null,
  operating_hours: null,
  status: 'active',
  created_at: new Date('2026-07-27T00:00:00Z'),
};

const membershipRow = {
  id: 'm1',
  organization_id: 'org-1',
  branch_id: null,
  user_id: 'user-2',
  role_name: 'technician',
  status: 'active' as const,
  created_at: new Date('2026-07-27T00:00:00Z'),
};

describe('BranchService', () => {
  it('refuses to create a branch for a role without governance authority', async () => {
    const { db } = fakeDb();
    const svc = new BranchService(db, fakeAudit());
    // §50 gives the manager "daily operational control", not the authority to
    // create legal operating locations.
    await expect(
      svc.create(ctx({ activeRole: 'workshop_manager' }), { organizationId: 'org-1', name: 'X' }),
    ).rejects.toThrow(/may not create a branch/);
  });

  it('takes tenant_id from the resolved context, never from the caller', async () => {
    const { db, queries } = fakeDb([branchRow]);
    const svc = new BranchService(db, fakeAudit());
    await svc.create(ctx(), { organizationId: 'org-1', name: 'Accra Main' });

    const insert = queries.find((q) => /INSERT INTO identity\.branches/.test(q.text));
    expect(insert).toBeDefined();
    // First bound parameter is the context's tenant, not anything user-supplied.
    expect(insert!.values?.[0]).toBe('tenant-a');
  });

  it('audits the creation in the same transaction as the insert', async () => {
    const { db } = fakeDb([branchRow]);
    const audit = fakeAudit();
    const svc = new BranchService(db, audit);
    await svc.create(ctx(), { organizationId: 'org-1', name: 'Accra Main' });
    expect((audit as unknown as { write: ReturnType<typeof vi.fn> }).write).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: 'tenant-a' }),
      expect.objectContaining({ action: 'branch.created', resourceType: 'branch' }),
    );
  });

  it('refuses to create a branch under an organization from another tenant', async () => {
    // The FK references organizations(id) alone and RLS WITH CHECK validates
    // only the INSERTED tenant_id, so `tenant_id = A` + `organization_id = <org
    // in B>` satisfies both. The parent lookup is the only thing that closes
    // it: under FORCE RLS a foreign organization is invisible and returns no
    // row.
    const { db, queries } = fakeDb([], (text) =>
      /FROM identity\.organizations/.test(text) ? [] : [branchRow],
    );
    const svc = new BranchService(db, fakeAudit());
    await expect(
      svc.create(ctx(), { organizationId: 'org-in-another-tenant', name: 'X' }),
    ).rejects.toThrow(/organization not found/);
    // And it must not have reached the INSERT at all.
    expect(queries.some((q) => /INSERT INTO identity\.branches/.test(q.text))).toBe(false);
  });

  it('answers 404 rather than 403 for an invisible branch, to avoid an existence oracle', async () => {
    const { db } = fakeDb([]);
    const svc = new BranchService(db, fakeAudit());
    await expect(svc.findById(ctx(), 'b-other-tenant')).rejects.toThrow(/not found/);
  });
});

describe('UserService — the directory must be scoped by MEMBERSHIP, not by RLS', () => {
  /**
   * THE defect this file exists to prevent.
   *
   * `identity.users` has no `tenant_id` and no row-level security — migration
   * 001 says so explicitly, because one human may belong to several tenants. So
   * unlike every other table in this schema, a query starting `FROM
   * identity.users` inside `withTenant` is NOT protected by anything: it
   * returns every user on the platform. It type-checks, it reads naturally, and
   * it leaks the entire user base.
   *
   * The only thing that scopes these queries is starting from
   * `identity.memberships`, which IS under FORCE RLS, and joining outward.
   * These tests assert the shape of the query itself, because that shape is the
   * security control.
   */
  it('every user query starts FROM identity.memberships and joins to users', async () => {
    const { db, queries } = fakeDb([]);
    const svc = new UserService(db);
    await svc.list(ctx());
    await svc.findById(ctx(), 'user-2').catch(() => undefined);

    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) {
      expect(
        /FROM\s+identity\.memberships\s+m/i.test(q.text),
        `a user query did not start from memberships and is therefore unscoped:\n${q.text}`,
      ).toBe(true);
      expect(
        /FROM\s+identity\.users/i.test(q.text),
        `a user query selected directly FROM identity.users, which has NO RLS:\n${q.text}`,
      ).toBe(false);
    }
  });

  it('returns 404 for a user with no membership in the active tenant', async () => {
    const { db } = fakeDb([]);
    const svc = new UserService(db);
    await expect(svc.findById(ctx(), 'user-elsewhere')).rejects.toThrow(/not found/);
  });
});

describe('MembershipService — the privilege-granting surface', () => {
  it('refuses to grant for a role without governance authority', async () => {
    const { db } = fakeDb();
    const svc = new MembershipService(db, fakeAudit());
    for (const role of ['workshop_manager', 'technician', 'reception_staff', 'cashier']) {
      await expect(
        svc.grant(ctx({ activeRole: role }), {
          userId: 'user-2',
          organizationId: 'org-1',
          roleName: 'technician',
        }),
      ).rejects.toThrow(/may not grant a membership/);
    }
  });

  it('rejects a role name outside the allow-list', async () => {
    const { db } = fakeDb();
    const svc = new MembershipService(db, fakeAudit());
    // `role_name` is plain TEXT with no database CHECK, so without the
    // allow-list any string would be accepted — including one a future
    // authorization rule treats as privileged.
    await expect(
      svc.grant(ctx(), { userId: 'user-2', organizationId: 'org-1', roleName: 'superuser' }),
    ).rejects.toThrow(/unknown role/);
  });

  it('does not disclose the set of valid roles in the rejection', async () => {
    const { db } = fakeDb();
    const svc = new MembershipService(db, fakeAudit());
    const err = await svc
      .grant(ctx(), { userId: 'u', organizationId: 'o', roleName: 'nope' })
      .catch((e: Error) => e);
    // Enumerating grantable roles would hand back the authorization taxonomy —
    // the same disclosure the catch-all route was already fixed to avoid.
    expect((err as Error).message).not.toMatch(/workshop_owner|technician|cashier/);
  });

  it('accepts every role §50 names, so the allow-list cannot silently shrink', async () => {
    const spec = [
      'workshop_owner',
      'workshop_manager',
      'reception_staff',
      'workshop_supervisor',
      'technician',
      'storekeeper',
      'quality_control_inspector',
      'cashier',
    ];
    for (const roleName of spec) {
      const { db } = fakeDb([{ ...membershipRow, role_name: roleName }]);
      const svc = new MembershipService(db, fakeAudit());
      await expect(
        svc.grant(ctx(), { userId: 'user-2', organizationId: 'org-1', roleName }),
      ).resolves.toMatchObject({ roleName });
    }
  });

  it('refuses to grant into an organization from another tenant', async () => {
    const { db, queries } = fakeDb([], (text) =>
      /FROM identity\.organizations/.test(text) ? [] : [membershipRow],
    );
    const svc = new MembershipService(db, fakeAudit());
    await expect(
      svc.grant(ctx(), {
        userId: 'user-2',
        organizationId: 'org-in-another-tenant',
        roleName: 'technician',
      }),
    ).rejects.toThrow(/organization not found/);
    expect(queries.some((q) => /INSERT INTO identity\.memberships/.test(q.text))).toBe(false);
  });

  it('refuses to scope a grant to a branch of a DIFFERENT organization', async () => {
    // A branch in the same tenant but a sibling organization would pass a bare
    // existence check while scoping the membership to the wrong site - which
    // §50's "approved role and branch" rule forbids.
    const { db, queries } = fakeDb([], (text) => {
      if (/FROM identity\.organizations/.test(text)) return [{ '?column?': 1 }];
      if (/FROM identity\.branches/.test(text)) return [];
      return [membershipRow];
    });
    const svc = new MembershipService(db, fakeAudit());
    await expect(
      svc.grant(ctx(), {
        userId: 'user-2',
        organizationId: 'org-1',
        branchId: 'branch-of-another-org',
        roleName: 'technician',
      }),
    ).rejects.toThrow(/branch not found/);
    expect(queries.some((q) => /INSERT INTO identity\.memberships/.test(q.text))).toBe(false);
  });

  it('reports an already-existing grant as a conflict rather than a silent success', async () => {
    // ON CONFLICT DO NOTHING returns no row. Reporting success would make an
    // invitation that changed nothing read exactly like one that did.
    //
    // The organization lookup must still succeed here, or this would assert the
    // ownership check rather than the conflict path.
    const { db } = fakeDb([], (text) =>
      /INSERT INTO identity\.memberships/.test(text) ? [] : [{ '?column?': 1 }],
    );
    const svc = new MembershipService(db, fakeAudit());
    await expect(
      svc.grant(ctx(), { userId: 'user-2', organizationId: 'org-1', roleName: 'technician' }),
    ).rejects.toThrow(/already exists/);
  });

  it('audits a grant with the role and user it conferred', async () => {
    const { db } = fakeDb([membershipRow]);
    const audit = fakeAudit();
    const svc = new MembershipService(db, audit);
    await svc.grant(ctx(), { userId: 'user-2', organizationId: 'org-1', roleName: 'technician' });
    expect((audit as unknown as { write: ReturnType<typeof vi.fn> }).write).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        action: 'membership.granted',
        detail: expect.objectContaining({ roleName: 'technician', userId: 'user-2' }),
      }),
    );
  });

  it('withdrawal only ever moves an ACTIVE membership, and audits the transition', async () => {
    const { db, queries } = fakeDb([{ ...membershipRow, status: 'revoked' }]);
    const audit = fakeAudit();
    const svc = new MembershipService(db, audit);
    await svc.withdraw(ctx(), 'm1', 'revoked');

    const update = queries.find((q) => /UPDATE identity\.memberships/.test(q.text));
    expect(update).toBeDefined();
    // Guards against a revoked membership being silently reactivated by a
    // second call — re-granting must be a new grant with its own audit row.
    expect(update!.text).toMatch(/status\s*=\s*'active'/);
    expect((audit as unknown as { write: ReturnType<typeof vi.fn> }).write).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ action: 'membership.revoked' }),
    );
  });

  it('rejects a withdrawal status outside suspended/revoked, at RUNTIME', async () => {
    // The union type is erased at compile time and the controller forwards the
    // request body verbatim, so `"active"` arrived here as a string the DB
    // CHECK accepts — a no-op withdrawal that still audited `membership.active`.
    const { db, queries } = fakeDb([membershipRow]);
    const svc = new MembershipService(db, fakeAudit());
    for (const bad of ['active', 'deleted', '']) {
      await expect(
        svc.withdraw(ctx(), 'm1', bad as 'suspended' | 'revoked'),
      ).rejects.toThrow(/status must be suspended or revoked/);
    }
    // And it must never reach the UPDATE.
    expect(queries.some((q) => /UPDATE identity\.memberships/.test(q.text))).toBe(false);
  });

  it('validates in the SERVICE, so an MCP tool bypassing the controller is still bound', async () => {
    // The rule is enforced below the HTTP edge on purpose: agents call the
    // service directly, and a check that lives only in a controller does not
    // apply to them.
    const { db } = fakeDb([membershipRow]);
    const svc = new MembershipService(db, fakeAudit());
    await expect(svc.withdraw(ctx(), 'm1', 'active' as 'suspended')).rejects.toThrow(
      /status must be suspended or revoked/,
    );
  });

  it('refuses withdrawal for a role without governance authority', async () => {
    const { db } = fakeDb();
    const svc = new MembershipService(db, fakeAudit());
    await expect(
      svc.withdraw(ctx({ activeRole: 'technician' }), 'm1', 'suspended'),
    ).rejects.toThrow(/may not withdraw a membership/);
  });
});
