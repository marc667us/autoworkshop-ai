import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';
import { assertWorkshopStaff } from '../authz/workshop-roles';

export interface TenantUser {
  id: string;
  email: string;
  displayName: string;
  phone: string | null;
  preferredLocale: string;
  status: string;
  /** The roles this user holds IN THE ACTIVE TENANT — never across tenants. */
  roles: string[];
}

/**
 * User directory, scoped to the active tenant — T-0003.
 *
 * ⚠️ READ THIS BEFORE ADDING A QUERY TO THIS FILE. ⚠️
 *
 * `identity.users` is the ONE table in the identity schema that is deliberately
 * NOT tenant-scoped and has NO row-level security. Migration 001 says so
 * explicitly: one human may hold memberships in several tenants, so the user
 * row cannot belong to any single one of them.
 *
 * The consequence is sharp, and it is the opposite of everywhere else in this
 * codebase: **RLS will not save you here.** A plain
 * `SELECT * FROM identity.users` inside `withTenant` returns every user on the
 * platform, across every tenant, and no policy stops it. It will look correct
 * in review, pass typecheck, and leak the entire user base.
 *
 * Every query below therefore reaches users ONLY through
 * `identity.memberships`, which IS under `ENABLE` + `FORCE ROW LEVEL SECURITY`.
 * The join is what scopes the result: rows survive only for users who hold a
 * membership visible to the current tenant. `user_directory_is_scoped_by_
 * membership` in the spec file asserts this property, because a comment does
 * not stop anyone.
 *
 * This also matches the authority model in PLAN_EXTENSION_v1 §2.1 — authority
 * derives from membership, never from the user record itself.
 */
@Injectable()
export class UserService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Users who hold a membership in the active tenant.
   *
   * Aggregating roles rather than returning one row per membership: a user with
   * three roles is one person in the directory, and `07.txt` part 2 §46's Staff
   * screen lists people, not role assignments.
   */
  async list(ctx: TenantContext): Promise<TenantUser[]> {
    // 🔴 STAFF ONLY (A5). `customer` is a real membership role inside
    // this same organisation and the controller carries only TenantGuard —
    // who you are, not what you may do. See `authz/workshop-roles.ts`.
    assertWorkshopStaff(ctx, 'The workshop staff directory');
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `SELECT u.id,
                u.email,
                u.display_name,
                u.phone,
                u.preferred_locale,
                u.status,
                array_agg(m.role_name ORDER BY m.role_name) AS roles
           FROM identity.memberships m
           JOIN identity.users u ON u.id = m.user_id
          WHERE m.status = 'active'
            AND m.tenant_id = $1
          GROUP BY u.id, u.email, u.display_name, u.phone, u.preferred_locale, u.status
          ORDER BY u.display_name`,
        [ctx.tenantId],
      );
      return res.rows.map(this.toDomain);
    });
  }

  /**
   * One user, but only if they are a member of the active tenant.
   *
   * Driving from `memberships` rather than from `users` is what makes this
   * safe: an id belonging to a user in another tenant simply matches no
   * membership row and yields 404 — the same non-oracle behaviour as the other
   * services, arrived at through the join instead of through a policy.
   */
  async findById(ctx: TenantContext, id: string): Promise<TenantUser> {
    // 🔴 STAFF ONLY (A5). `customer` is a real membership role inside
    // this same organisation and the controller carries only TenantGuard —
    // who you are, not what you may do. See `authz/workshop-roles.ts`.
    assertWorkshopStaff(ctx, 'This staff record');
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `SELECT u.id,
                u.email,
                u.display_name,
                u.phone,
                u.preferred_locale,
                u.status,
                array_agg(m.role_name ORDER BY m.role_name) AS roles
           FROM identity.memberships m
           JOIN identity.users u ON u.id = m.user_id
          WHERE u.id = $1
            AND m.status = 'active'
            AND m.tenant_id = $2
          GROUP BY u.id, u.email, u.display_name, u.phone, u.preferred_locale, u.status`,
        [id, ctx.tenantId],
      );
      const row = res.rows[0];
      if (!row) throw new NotFoundException('user not found');
      return this.toDomain(row);
    });
  }

  private toDomain = (row: {
    id: string;
    email: string;
    display_name: string;
    phone: string | null;
    preferred_locale: string;
    status: string;
    roles: string[] | null;
  }): TenantUser => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    phone: row.phone,
    preferredLocale: row.preferred_locale,
    status: row.status,
    roles: row.roles ?? [],
  });
}
