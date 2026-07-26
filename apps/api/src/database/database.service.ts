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
