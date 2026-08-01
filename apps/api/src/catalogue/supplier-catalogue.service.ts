import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';
import {
  CatalogueInputError,
  parsePart,
  parsePartPatch,
  parseSupplierApplication,
  parseSupplierPatch,
  cleanYearRange,
  requiredText,
  slugify,
} from './catalogue-write-rules';

/**
 * Supplier catalogue management — Slice B.
 *
 * ⚠️ SUPPLIER ROUTES RUN THROUGH `withUser`, ADMIN ROUTES THROUGH `withTenant`,
 * AND THE DIFFERENCE IS LOAD-BEARING RATHER THAN STYLISTIC.
 *
 * A supplier's authority comes from `catalogue.supplier_users`, which is keyed
 * on the USER. `withUser` sets `app.user_id` and leaves both `app.tenant_id` and
 * `app.current_role` unset, so the membership policies answer and every
 * tenant-owned table stays empty.
 *
 * An administrator's authority comes from their ROLE, and the only code path
 * that sets `app.current_role` is `tenantSessionStatements`, reached through
 * `withTenant`. Calling an admin operation through `withUser` would leave the
 * role unset and every write would affect ZERO ROWS WITHOUT RAISING — which is
 * exactly the defect migration 025 exists to fix, reproduced one layer up. If an
 * admin method here is ever moved onto `withUser`, publishing silently stops
 * working and nothing reports it.
 *
 * ⚠️ THE DATABASE IS THE ENFORCEMENT POINT, NOT THIS FILE. Every rule below is
 * also a policy or a trigger. What the service adds is a sentence a human can
 * act on: `insufficient_privilege` from a trigger is correct and unreadable.
 */
@Injectable()
export class SupplierCatalogueService {
  constructor(private readonly db: DatabaseService) {}

  // ── suppliers ────────────────────────────────────────────────────────────

  /**
   * Apply to be listed. Creates the supplier row AND the owner membership.
   *
   * ⚠️ BOTH OR NEITHER. `withUser` wraps the whole call in one transaction, and
   * that matters more than usual here: the supplier row alone is an orphan
   * nobody can administer, and migration 024's `founder_insert` policy only
   * admits the membership while `created_by` matches the caller — so a failure
   * between the two statements would leave a row that its creator can see and
   * can never staff.
   */
  async apply(userId: string, raw: Record<string, unknown>) {
    const input = this.guardInput(() => parseSupplierApplication(raw));

    return this.db.withUser(userId, async (client) => {
      const { supplierId, slug } = await this.insertWithFreeSlug(client, userId, input);

      await client.query(
        `INSERT INTO catalogue.supplier_users (supplier_id, user_id, member_role, status)
         VALUES ($1, $2, 'owner', 'active')`,
        [supplierId, userId],
      );

      return {
        id: supplierId,
        slug,
        status: 'awaiting_review' as const,
        message:
          'Your listing has been created and is awaiting review. ' +
          'You can add parts to it now; they become visible when an administrator publishes them.',
      };
    });
  }

  /**
   * INSERT the supplier, letting the DATABASE choose when the slug is free.
   *
   * 🔴 THE OBVIOUS VERSION OF THIS IS BROKEN, AND IT SHIPPED HERE FIRST: read
   * the table for a free slug, then insert it. The reader is the CALLER, and a
   * caller cannot see other people's unpublished suppliers — that is what
   * migration 024's `supplier_read_own` policy says. So the pre-check reports
   * "free" for a slug that is taken by a draft it cannot see, the INSERT hits
   * `uq_supplier_slug`, and the request 500s.
   *
   * MEASURED, not theorised (Codex found it, this reproduced it):
   *
   *     first applicant : HTTP 201  {"slug":"collide-parts-msap43u4",...}
   *     second applicant: HTTP 500  {"statusCode":500,...}
   *
   * The comment that used to sit here claimed the collision was "handled by the
   * caller's error mapping" — and `apply()` had no such mapping. A comment
   * asserting a safety net that does not exist is worse than no comment: it
   * stops the next reader looking.
   *
   * ⚠️ SO THE UNIQUE INDEX IS THE ARBITER, which is the only component that can
   * see every row. Each attempt runs inside a SAVEPOINT because a failed
   * statement poisons the whole transaction in Postgres — without one, the
   * retry and the membership INSERT that follows would both fail with
   * `25P02 in_failed_sql_transaction`, turning a recoverable collision into an
   * unrecoverable one.
   *
   * A collision is NOT reported to the user. The slug is DERIVED from the name
   * and they cannot edit it (024 freezes it), so "that name is taken" would be
   * a refusal with no action behind it — and two real companies may legitimately
   * share a trading name.
   */
  private async insertWithFreeSlug(
    client: PoolClient,
    userId: string,
    input: { name: string; country: string; city: string | null; website: string | null },
  ): Promise<{ supplierId: string; slug: string }> {
    const base = slugify(input.name) || 'supplier';

    for (let attempt = 0; attempt < 25; attempt += 1) {
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
      await client.query('SAVEPOINT slug_attempt');
      try {
        const created = await client.query<{ id: string }>(
          `INSERT INTO catalogue.suppliers (slug, name, country, city, website, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [slug, input.name, input.country, input.city, input.website, userId],
        );
        const supplierId = created.rows[0]?.id;
        // ⚠️ ZERO ROWS IS A POLICY REFUSAL, NOT A COLLISION, and retrying it
        // would spin 25 times and then report the wrong reason. `RETURNING`
        // yields nothing when `applicant_insert`'s WITH CHECK rejects the row.
        if (!supplierId) {
          await client.query('ROLLBACK TO SAVEPOINT slug_attempt');
          throw new ForbiddenException('the application was refused');
        }
        await client.query('RELEASE SAVEPOINT slug_attempt');
        return { supplierId, slug };
      } catch (err) {
        if (err instanceof ForbiddenException) throw err;
        await client.query('ROLLBACK TO SAVEPOINT slug_attempt').catch(() => undefined);
        if ((err as { code?: string }).code === '23505') continue;
        throw err;
      }
    }

    // 25 suppliers share this name. Vanishingly unlikely, and still not the
    // applicant's fault — so it is a server-side condition, not a validation
    // message telling them to rename their company.
    throw new BadRequestException(
      'this listing could not be created just now — please try again',
    );
  }

  /** The suppliers this user may act for. */
  async mySuppliers(userId: string) {
    return this.db.withUser(userId, async (client) => {
      const { rows } = await client.query(
        `SELECT s.id, s.slug, s.name, s.country, s.city, s.website,
                s.is_published, s.is_verified, su.member_role,
                (SELECT count(*) FROM catalogue.parts p WHERE p.supplier_id = s.id) AS part_count,
                (SELECT count(*) FROM catalogue.parts p
                  WHERE p.supplier_id = s.id AND p.is_published) AS published_part_count
           FROM catalogue.suppliers s
           JOIN catalogue.supplier_users su ON su.supplier_id = s.id
          WHERE su.user_id = $1 AND su.status = 'active'
          ORDER BY s.name`,
        [userId],
      );
      return rows.map((r) => this.describeSupplier(r));
    });
  }

  async updateSupplier(userId: string, supplierId: string, raw: Record<string, unknown>) {
    const patch = this.guardInput(() => parseSupplierPatch(raw));
    const keys = Object.keys(patch);
    if (keys.length === 0) throw new BadRequestException('nothing to update');

    return this.db.withUser(userId, async (client) => {
      const sets = keys.map((k, i) => `${k} = $${i + 2}`);
      const { rows } = await client.query(
        `UPDATE catalogue.suppliers
            SET ${sets.join(', ')}, updated_at = now()
          WHERE id = $1
          RETURNING id, slug, name, country, city, website, is_published, is_verified`,
        [supplierId, ...keys.map((k) => patch[k] ?? null)],
      );
      // Zero rows means the row-level policy refused it — not a member, or no
      // such supplier. 404 rather than 403 for the same reason the rest of this
      // API does it: telling a stranger a row EXISTS but is not theirs is itself
      // a disclosure.
      if (rows.length === 0) throw new NotFoundException('supplier not found');
      return this.describeSupplier(rows[0] as Record<string, unknown>);
    });
  }

  // ── parts ────────────────────────────────────────────────────────────────

  async listParts(userId: string, supplierId: string) {
    return this.db.withUser(userId, async (client) => {
      await this.assertMember(client, supplierId);
      const { rows } = await client.query(
        `SELECT p.id, p.part_number, p.name, p.brand, p.description, p.price,
                p.currency, p.in_stock, p.is_published, p.category_id,
                c.name AS category_name,
                (SELECT count(*) FROM catalogue.part_fitments f WHERE f.part_id = p.id) AS fitment_count
           FROM catalogue.parts p
           JOIN catalogue.part_categories c ON c.id = p.category_id
          WHERE p.supplier_id = $1
          ORDER BY p.is_published, p.name`,
        [supplierId],
      );
      return rows.map((r) => this.describePart(r));
    });
  }

  async createPart(userId: string, supplierId: string, raw: Record<string, unknown>) {
    const input = this.guardInput(() => parsePart(raw));
    const categoryId = requiredText(raw['categoryId'], 'category', 64);

    return this.db.withUser(userId, async (client) => {
      await this.assertMember(client, supplierId);
      return this.mapWriteErrors(async () => {
        const { rows } = await client.query(
          `INSERT INTO catalogue.parts
             (supplier_id, category_id, part_number, name, brand, description,
              price, currency, in_stock)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id, part_number, name, brand, description, price, currency,
                     in_stock, is_published, category_id`,
          [
            supplierId,
            categoryId,
            input.partNumber,
            input.name,
            input.brand,
            input.description,
            input.price,
            input.currency,
            input.inStock,
          ],
        );
        return this.describePart(rows[0] as Record<string, unknown>);
      });
    });
  }

  async updatePart(userId: string, partId: string, raw: Record<string, unknown>) {
    const patch = this.guardInput(() => parsePartPatch(raw));
    const keys = Object.keys(patch);
    if (keys.length === 0) throw new BadRequestException('nothing to update');

    const column: Record<string, string> = {
      partNumber: 'part_number',
      name: 'name',
      brand: 'brand',
      description: 'description',
      price: 'price',
      currency: 'currency',
      inStock: 'in_stock',
    };

    return this.db.withUser(userId, async (client) => {
      return this.mapWriteErrors(async () => {
        const sets = keys.map((k, i) => `${column[k]} = $${i + 2}`);
        const { rows } = await client.query(
          `UPDATE catalogue.parts
              SET ${sets.join(', ')}, updated_at = now()
            WHERE id = $1
            RETURNING id, part_number, name, brand, description, price, currency,
                      in_stock, is_published, category_id`,
          [partId, ...keys.map((k) => (patch as Record<string, unknown>)[k] ?? null)],
        );
        if (rows.length === 0) throw new NotFoundException('part not found');
        return this.describePart(rows[0] as Record<string, unknown>);
      });
    });
  }

  async deletePart(userId: string, partId: string) {
    return this.db.withUser(userId, async (client) => {
      return this.mapWriteErrors(async () => {
        const { rowCount } = await client.query(
          `DELETE FROM catalogue.parts WHERE id = $1`,
          [partId],
        );
        if (rowCount === 0) throw new NotFoundException('part not found');
        return { deleted: true };
      });
    });
  }

  // ── fitments ─────────────────────────────────────────────────────────────

  async listFitments(userId: string, partId: string) {
    return this.db.withUser(userId, async (client) => {
      const { rows } = await client.query(
        `SELECT f.id, f.make, f.model, f.year_from, f.year_to
           FROM catalogue.part_fitments f
          WHERE f.part_id = $1
          ORDER BY f.make, f.model, f.year_from`,
        [partId],
      );
      return rows;
    });
  }

  async addFitment(userId: string, partId: string, raw: Record<string, unknown>) {
    const make = this.guardInput(() => requiredText(raw['make'], 'vehicle make', 80));
    const model = this.guardInput(() => requiredText(raw['model'], 'vehicle model', 80));
    const years = this.guardInput(() => cleanYearRange(raw['yearFrom'], raw['yearTo']));

    return this.db.withUser(userId, async (client) => {
      return this.mapWriteErrors(async () => {
        const { rows } = await client.query(
          `INSERT INTO catalogue.part_fitments (part_id, make, model, year_from, year_to)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, make, model, year_from, year_to`,
          [partId, make, model, years.from, years.to],
        );
        return rows[0];
      });
    });
  }

  async removeFitment(userId: string, fitmentId: string) {
    return this.db.withUser(userId, async (client) => {
      return this.mapWriteErrors(async () => {
        const { rowCount } = await client.query(
          `DELETE FROM catalogue.part_fitments WHERE id = $1`,
          [fitmentId],
        );
        if (rowCount === 0) throw new NotFoundException('fitment not found');
        return { deleted: true };
      });
    });
  }

  /** Categories, for the part form. Readable by anyone (021). */
  async categories(userId: string) {
    return this.db.withUser(userId, async (client) => {
      const { rows } = await client.query(
        `SELECT id, slug, name FROM catalogue.part_categories ORDER BY display_order, name`,
      );
      return rows;
    });
  }

  // ── administrator ────────────────────────────────────────────────────────

  /**
   * Everything awaiting a decision.
   *
   * ⚠️ `withTenant`, so `app.current_role` is set. Under `withUser` this returns
   * an EMPTY LIST rather than an error, because an administrator with no role
   * set is simply not matched by `admin_write` — the same silent-nothing failure
   * that migration 025 fixed at the policy level.
   */
  async reviewQueue(ctx: TenantContext) {
    return this.db.withTenant(ctx, async (client) => {
      const suppliers = await client.query(
        `SELECT id, slug, name, country, city, website, is_published, is_verified, created_at
           FROM catalogue.suppliers
          WHERE NOT is_published
          ORDER BY created_at`,
      );
      const parts = await client.query(
        `SELECT p.id, p.part_number, p.name, p.brand, p.price, p.currency,
                p.is_published, s.name AS supplier_name, s.is_published AS supplier_published
           FROM catalogue.parts p
           JOIN catalogue.suppliers s ON s.id = p.supplier_id
          WHERE NOT p.is_published
          ORDER BY p.created_at`,
      );
      return {
        suppliers: suppliers.rows.map((r) => this.describeSupplier(r)),
        parts: parts.rows.map((r) => this.describePart(r)),
      };
    });
  }

  async setSupplierPublication(
    ctx: TenantContext,
    supplierId: string,
    published: boolean,
    verified?: boolean,
  ) {
    return this.db.withTenant(ctx, async (client) => {
      const sets = ['is_published = $2', 'updated_at = now()'];
      const values: unknown[] = [supplierId, published];
      if (verified !== undefined) {
        sets.push(`is_verified = $${values.length + 1}`);
        values.push(verified);
      }
      const { rows } = await client.query(
        `UPDATE catalogue.suppliers SET ${sets.join(', ')} WHERE id = $1
         RETURNING id, slug, name, country, city, website, is_published, is_verified`,
        values,
      );
      // ⚠️ ZERO ROWS HERE MEANS THE ROLE IS NOT RECOGNISED, not that the row is
      // missing — the exact failure that made this whole surface dead before
      // migration 025, and it raised nothing. Reported loudly rather than
      // returning a cheerful 200 with no effect.
      if (rows.length === 0) throw new NotFoundException('supplier not found, or not permitted');
      return this.describeSupplier(rows[0] as Record<string, unknown>);
    });
  }

  async setPartPublication(ctx: TenantContext, partId: string, published: boolean) {
    return this.db.withTenant(ctx, async (client) => {
      const { rows } = await client.query(
        `UPDATE catalogue.parts SET is_published = $2, updated_at = now()
          WHERE id = $1
          RETURNING id, part_number, name, brand, description, price, currency,
                    in_stock, is_published, category_id`,
        [partId, published],
      );
      if (rows.length === 0) throw new NotFoundException('part not found, or not permitted');
      return this.describePart(rows[0] as Record<string, unknown>);
    });
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  /**
   * Membership, checked explicitly so the caller gets 404 rather than an empty
   * list. RLS already returns nothing for a non-member; this only decides which
   * answer the human sees.
   */
  private async assertMember(client: PoolClient, supplierId: string): Promise<void> {
    const { rowCount } = await client.query(
      `SELECT 1 FROM catalogue.supplier_users
        WHERE supplier_id = $1 AND user_id = identity.current_user_id() AND status = 'active'`,
      [supplierId],
    );
    if (rowCount === 0) throw new NotFoundException('supplier not found');
  }

  private guardInput<T>(fn: () => T): T {
    try {
      return fn();
    } catch (err) {
      if (err instanceof CatalogueInputError) throw new BadRequestException(err.message);
      throw err;
    }
  }

  /**
   * Turn the database's refusals into sentences, and — where the rule has one —
   * name the way forward.
   *
   * ⚠️ EVERY REFUSAL MUST NAME A REACHABLE ALTERNATIVE. That has been the most
   * expensive defect class in this repository across four slices: an API that
   * says no without saying what to do instead reads as a broken screen. The
   * publication messages below therefore describe the withdraw → edit →
   * republish path, which `verify/026` check 6 proves is genuinely walkable.
   */
  private async mapWriteErrors<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const code = (err as { code?: string }).code;
      const message = (err as { message?: string }).message ?? '';

      if (code === '23505') {
        throw new BadRequestException(
          'you already list a part with that part number — edit the existing one instead',
        );
      }
      if (code === '23503') {
        // FK. On DELETE this is `order_lines.part_id ON DELETE RESTRICT`, which
        // is protecting a placed order rather than misbehaving.
        throw new BadRequestException(
          'this part appears on a placed order and cannot be deleted. ' +
            'Mark it out of stock instead, so the order history stays intact.',
        );
      }
      if (code === '23514') {
        throw new BadRequestException('that value is outside the range this field accepts');
      }
      if (code === '42501') {
        // insufficient_privilege — one of the column guards. Distinguish them,
        // because "no" without a next step is the failure mode named above.
        if (message.includes('fitments are public')) {
          throw new ForbiddenException(
            'this part is published, so its fitments are public and only an administrator ' +
              'may change them. Ask an administrator to withdraw the part; you can then edit ' +
              'it freely and have it republished.',
          );
        }
        if (message.includes('publish')) {
          throw new ForbiddenException(
            'publishing is an administrator decision. Your draft is saved and appears in ' +
              'the review queue.',
          );
        }
        if (message.includes('another supplier')) {
          throw new ForbiddenException('a part cannot be moved to another supplier');
        }
        throw new ForbiddenException(message || 'that change is not permitted');
      }
      throw err;
    }
  }

  private describeSupplier(r: Record<string, unknown>) {
    return {
      id: r['id'],
      slug: r['slug'],
      name: r['name'],
      country: r['country'],
      city: r['city'],
      website: r['website'],
      isPublished: r['is_published'],
      isVerified: r['is_verified'],
      memberRole: r['member_role'],
      partCount: r['part_count'] === undefined ? undefined : Number(r['part_count']),
      publishedPartCount:
        r['published_part_count'] === undefined ? undefined : Number(r['published_part_count']),
      createdAt: r['created_at'],
    };
  }

  private describePart(r: Record<string, unknown>) {
    return {
      id: r['id'],
      partNumber: r['part_number'],
      name: r['name'],
      brand: r['brand'],
      description: r['description'],
      // NUMERIC arrives from `pg` as a STRING, deliberately — it does not fit a
      // JS number safely. Converted at the edge, once, rather than in each
      // screen: a price that becomes a float in three different components is
      // three chances to render 10.00 as 10.
      price: r['price'] === null || r['price'] === undefined ? null : Number(r['price']),
      currency: r['currency'],
      inStock: r['in_stock'],
      isPublished: r['is_published'],
      categoryId: r['category_id'],
      categoryName: r['category_name'],
      supplierName: r['supplier_name'],
      supplierPublished: r['supplier_published'],
      fitmentCount: r['fitment_count'] === undefined ? undefined : Number(r['fitment_count']),
    };
  }
}
