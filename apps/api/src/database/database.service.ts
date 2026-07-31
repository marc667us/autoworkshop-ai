import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type PoolClient } from 'pg';
import {
  tenantSessionStatements,
  type TenantContext,
} from '../tenancy/tenant-context';

/**
 * Database access.
 *
 * The application connects as `autoworkshop_app` — a NOSUPERUSER, NOBYPASSRLS
 * role created by migration 002. This is not a preference: **a superuser
 * bypasses row-level security entirely, even with FORCE**, so connecting as the
 * bootstrap role would leave every RLS policy present and none of them applied.
 * That was observed against a live database before this code existed.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const url = this.config.get<string>('DATABASE_URL');
    if (!url) {
      throw new Error('DATABASE_URL is not configured');
    }
    if (/:\/\/autoworkshop:/.test(url)) {
      // Fail loudly at boot rather than silently running without isolation.
      throw new Error(
        'DATABASE_URL uses the bootstrap superuser. The application must ' +
          'connect as autoworkshop_app (NOSUPERUSER, NOBYPASSRLS) or row-level ' +
          'security is bypassed and tenant isolation does not apply.',
      );
    }
    this.pool = new Pool({ connectionString: url, max: 10 });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  /**
   * Run work inside a transaction bound to one tenant context.
   *
   * This is the ONLY sanctioned way to reach tenant data. The context settings
   * are transaction-local (`set_config(..., true)`), so when the connection
   * returns to the pool it carries nothing: the next request that borrows it
   * cannot inherit the previous tenant's context.
   *
   * Parameters are bound, never interpolated — the context values reach
   * PostgreSQL as data, so a crafted role or tenant string cannot alter the
   * statement.
   */
  async withTenant<T>(
    ctx: TenantContext,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const stmt of tenantSessionStatements(ctx)) {
        await client.query(stmt.text, stmt.values);
      }
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Run work as a signed-in USER who may belong to no tenant at all.
   *
   * ⚠️ THIS IS NOT A WEAKER `withTenant`, IT IS A DIFFERENT SUBJECT, and it
   * exists because migration 022 introduced the first rows this application
   * owns that are scoped to a PERSON rather than to an organisation. A
   * marketplace buyer is a vehicle owner with no workshop: they hold no
   * membership, so `resolveTenantContext` has nothing to resolve and
   * `withTenant` cannot represent them. Forcing one would mean inventing a
   * tenant for every private buyer.
   *
   * Only `app.user_id` is set. `app.tenant_id` is deliberately left UNSET, so
   * every tenant-owned table still returns zero rows inside this transaction —
   * the same fail-closed default `queryWithoutTenant` relies on. Reaching a
   * workshop table from here is an empty result, not a leak.
   *
   * `app.current_role` is left unset too, so `identity.current_role_name()`
   * answers 'none' and the `admin_all` policies do not match. A buyer must not
   * acquire admin reach by virtue of not having a tenant.
   *
   * Transaction-local (`set_config(..., true)`) and bound as a PARAMETER, for
   * the same two reasons as `withTenant`: the setting dies with the
   * transaction so a pooled connection carries nothing to the next request,
   * and a crafted user id reaches Postgres as data rather than as SQL.
   */
  async withUser<T>(
    userId: string,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', [
        'app.user_id',
        userId,
      ]);
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Escape hatch for genuinely tenant-less work — health checks, migrations
   * ledger reads. RLS still applies; with no tenant context set, policies
   * return zero rows rather than everything (fail closed).
   */
  async queryWithoutTenant<T = unknown>(
    text: string,
    values: unknown[] = [],
  ): Promise<T[]> {
    const res = await this.pool.query(text, values);
    return res.rows as T[];
  }
}
