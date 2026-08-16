import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { assertInsuranceOperator } from './insurance-roles';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * The insurer's side of the marketplace — migration 082.
 *
 * Owner, 2026-08-14: *"insurance regist product online and sell but pays
 * plantform lever for selling on the platform"*.
 *
 * ── WHAT THIS SERVICE DELIBERATELY DOES NOT DO ────────────────────────────
 *
 * It never computes the levy. `insurance.accrue_platform_levy` is an AFTER
 * INSERT trigger on `insurance.policies`, so the platform's cut is taken by the
 * database at the moment of sale whatever route the sale arrives by — this
 * service, a future import, an agent, a fixture. A levy the application layer
 * has to remember is one that will eventually be forgotten, and the sale would
 * still succeed, so nothing would look wrong.
 *
 * It also never sets `is_verified`. An insurer publishing its own unverified
 * product is refused by a trigger, and verification is a platform-administrator
 * action on its own route.
 */

export interface ProductRow {
  id: string;
  name: string;
  summary: string | null;
  coverType: string;
  premium: string;
  currency: string;
  termMonths: number;
  excess: string | null;
  termsUrl: string | null;
  isPublished: boolean;
  isVerified: boolean;
  createdAt: string;
}

const PRODUCT_COLUMNS = `
  p.id, p.name, p.summary, p.cover_type, p.premium, p.currency, p.term_months,
  p.excess, p.terms_url, p.is_published, p.is_verified, p.created_at`;

function iso(v: unknown): string {
  return (v as Date)?.toISOString?.() ?? String(v);
}

/**
 * ⚠️ `numeric` COLUMNS ARE RETURNED AS STRINGS. node-pg hands them back as
 * strings and coercing to `number` here would silently lose precision on a
 * PREMIUM and on a LEVY — the two numbers in this module that are money. The
 * parts catalogue makes the same choice for `price`.
 */
function toProduct(r: Record<string, unknown>): ProductRow {
  return {
    id: r.id as string,
    name: r.name as string,
    summary: (r.summary as string) ?? null,
    coverType: r.cover_type as string,
    premium: String(r.premium),
    currency: r.currency as string,
    termMonths: Number(r.term_months),
    excess: r.excess === null || r.excess === undefined ? null : String(r.excess),
    termsUrl: (r.terms_url as string) ?? null,
    isPublished: Boolean(r.is_published),
    isVerified: Boolean(r.is_verified),
    createdAt: iso(r.created_at),
  };
}

@Injectable()
export class InsuranceService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  /** This insurer's own products, published or not. */
  async listProducts(ctx: TenantContext): Promise<ProductRow[]> {
    assertInsuranceOperator(ctx, 'The insurance product list');
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `SELECT ${PRODUCT_COLUMNS} FROM insurance.products p
          ORDER BY p.created_at DESC LIMIT 200`,
      );
      return res.rows.map((r) => toProduct(r as Record<string, unknown>));
    });
  }

  async createProduct(
    ctx: TenantContext,
    input: {
      name: string;
      summary?: string;
      coverType: string;
      premium: number;
      currency: string;
      termMonths: number;
      excess?: number;
      termsUrl?: string;
    },
  ): Promise<ProductRow> {
    assertInsuranceOperator(ctx, 'Registering an insurance product');
    return this.db.withTenant(ctx, async (client) => {
      // 🔴 `tenant_id` AND `organization_id` COME FROM THE RESOLVED CONTEXT.
      // A body field naming either would be the confused-deputy hole the whole
      // tenancy design exists to prevent, and 082's trigger would still refuse
      // a non-insurer — both layers, by design.
      const res = await client.query(
        `INSERT INTO insurance.products
           (tenant_id, organization_id, name, summary, cover_type, premium,
            currency, term_months, excess, terms_url, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING ${PRODUCT_COLUMNS}`,
        [
          ctx.tenantId,
          ctx.organizationId,
          input.name,
          input.summary ?? null,
          input.coverType,
          input.premium,
          input.currency,
          input.termMonths,
          input.excess ?? null,
          input.termsUrl ?? null,
          ctx.userId,
        ],
      );
      const row = res.rows[0] as Record<string, unknown>;
      await this.audit.write(client, ctx, {
        action: 'insurance.product.registered',
        resourceType: 'insurance_product',
        resourceId: row.id as string,
        detail: { name: input.name, coverType: input.coverType, premium: input.premium },
      });
      return toProduct(row);
    });
  }

  /**
   * List or unlist a product.
   *
   * ⚠️ THIS CANNOT VERIFY. `is_verified` is untouched here, and 082's
   * `reject_unverified_product_publication` refuses publication without it —
   * so an insurer calling this on an unverified product gets the trigger's own
   * sentence, which explains the wait, rather than a generic 400.
   */
  async setProductPublication(
    ctx: TenantContext,
    id: string,
    isPublished: boolean,
  ): Promise<ProductRow> {
    assertInsuranceOperator(ctx, 'Listing an insurance product');
    return this.db.withTenant(ctx, async (client) => {
      let res;
      try {
        res = await client.query(
          `UPDATE insurance.products p
              SET is_published = $2, updated_at = now(), updated_by = $3
            WHERE p.id = $1
        RETURNING ${PRODUCT_COLUMNS}`,
          [id, isPublished, ctx.userId],
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // The trigger's wording reaches the user as an answer rather than a
        // 500 — the same treatment the registration routes give the database's
        // refusals.
        if (message.includes('has not been verified')) {
          throw new BadRequestException(message);
        }
        throw err;
      }
      const row = res.rows[0] as Record<string, unknown> | undefined;
      // Not in this organisation, or does not exist. One answer for both:
      // telling a caller an id exists but belongs elsewhere is a disclosure.
      if (!row) throw new NotFoundException('That product was not found.');

      await this.audit.write(client, ctx, {
        action: isPublished ? 'insurance.product.listed' : 'insurance.product.unlisted',
        resourceType: 'insurance_product',
        resourceId: id,
        detail: { isPublished },
      });
      return toProduct(row);
    });
  }

  /**
   * Record a sale.
   *
   * 🔴 THE LEVY IS NOT COMPUTED HERE AND MUST NOT BE. 082's AFTER INSERT
   * trigger writes `insurance.platform_levies` from the rate in force. This
   * method does not read the rate, does not multiply anything, and does not
   * insert into that table — so it cannot disagree with the database about what
   * the platform is owed.
   */
  async recordSale(
    ctx: TenantContext,
    input: {
      productId: string;
      policyNumber: string;
      buyerUserId: string;
      vehicleRegistration?: string;
      premium: number;
      currency: string;
      coverStartsOn: string;
      coverEndsOn: string;
    },
  ) {
    assertInsuranceOperator(ctx, 'Recording an insurance sale');
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `INSERT INTO insurance.policies
           (tenant_id, organization_id, product_id, policy_number, buyer_user_id,
            vehicle_registration, premium, currency, cover_starts_on,
            cover_ends_on, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id, policy_number, premium, currency, cover_starts_on,
                   cover_ends_on, status, sold_at`,
        [
          ctx.tenantId,
          ctx.organizationId,
          input.productId,
          input.policyNumber,
          input.buyerUserId,
          input.vehicleRegistration ?? null,
          input.premium,
          input.currency,
          input.coverStartsOn,
          input.coverEndsOn,
          ctx.userId,
        ],
      );
      const row = res.rows[0] as Record<string, unknown>;

      // Read the levy the TRIGGER wrote, and return it. The insurer is told
      // what they owe at the moment they sell, rather than discovering it in an
      // invoice later — which is the difference between a levy and a surprise.
      const levy = await client.query(
        `SELECT amount, percent, currency FROM insurance.platform_levies
          WHERE policy_id = $1`,
        [row.id],
      );
      const l = levy.rows[0] as Record<string, unknown> | undefined;

      await this.audit.write(client, ctx, {
        action: 'insurance.policy.sold',
        resourceType: 'insurance_policy',
        resourceId: row.id as string,
        detail: {
          policyNumber: input.policyNumber,
          premium: input.premium,
          levyAmount: l ? String(l.amount) : null,
        },
      });

      return {
        id: row.id as string,
        policyNumber: row.policy_number as string,
        premium: String(row.premium),
        currency: row.currency as string,
        status: row.status as string,
        soldAt: iso(row.sold_at),
        platformLevy: l
          ? { amount: String(l.amount), percent: String(l.percent), currency: l.currency as string }
          : null,
      };
    });
  }

  /** Policies this insurer has sold. */
  async listPolicies(ctx: TenantContext) {
    assertInsuranceOperator(ctx, 'The policy register');
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `SELECT po.id, po.policy_number, po.premium, po.currency, po.status,
                po.cover_starts_on, po.cover_ends_on, po.sold_at,
                po.vehicle_registration, pr.name AS product_name,
                lv.amount AS levy_amount, lv.percent AS levy_percent,
                lv.settlement_status
           FROM insurance.policies po
           JOIN insurance.products pr ON pr.id = po.product_id
           -- LEFT JOIN: a policy whose levy row is somehow absent must still
           -- appear, loudly, rather than vanishing from the register. An INNER
           -- JOIN here would hide exactly the case worth seeing.
           LEFT JOIN insurance.platform_levies lv ON lv.policy_id = po.id
          ORDER BY po.sold_at DESC LIMIT 200`,
      );
      return res.rows.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        policyNumber: r.policy_number as string,
        productName: r.product_name as string,
        premium: String(r.premium),
        currency: r.currency as string,
        status: r.status as string,
        coverStartsOn: String(r.cover_starts_on).slice(0, 10),
        coverEndsOn: String(r.cover_ends_on).slice(0, 10),
        vehicleRegistration: (r.vehicle_registration as string) ?? null,
        soldAt: iso(r.sold_at),
        levyAmount: r.levy_amount === null || r.levy_amount === undefined ? null : String(r.levy_amount),
        levyPercent: r.levy_percent === null || r.levy_percent === undefined ? null : String(r.levy_percent),
        levySettlement: (r.settlement_status as string) ?? null,
      }));
    });
  }

  /**
   * PLATFORM ONLY — verify or un-verify a product.
   *
   * 🔴 WITHOUT THIS ROUTE NO INSURANCE PRODUCT COULD EVER BE LISTED. 082
   * refuses publication while `is_verified` is false and nothing else can set
   * it, so the entire marketplace dead-ended one step from working. That is the
   * "capability with no way in" shape this repository has recorded repeatedly —
   * a wall, not a rule — and it would have looked like a working feature until
   * the first insurer tried to sell something.
   *
   * ⚠️ NO ROLE CHECK HERE, DELIBERATELY. The caller is gated by the controller
   * on `PERMISSIONS.platformAdmin`, which since migration 078 comes from a
   * GRANT RECORD and not from a membership `role_name`. Repeating a role test
   * in the service would reintroduce exactly the name-based check 078 removed.
   *
   * ⚠️ IT USES `withoutTenant`-STYLE ACCESS VIA THE PLATFORM RLS ESCAPE. A
   * platform administrator is not in the insurer's tenant, so an ordinary
   * `withTenant` read would find nothing — `is_platform_admin()` in 082's
   * policy is what admits them, and it is keyed on the grant, not on this code.
   */
  async setProductVerification(
    ctx: TenantContext,
    id: string,
    isVerified: boolean,
  ): Promise<ProductRow> {
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `UPDATE insurance.products p
            SET is_verified = $2,
                -- 🔴 UN-VERIFYING ALSO UNLISTS. Leaving a product published
                -- while withdrawing its verification would keep it on sale
                -- after the platform decided it should not be — the decision
                -- and its effect must not be separable.
                is_published = CASE WHEN $2 THEN p.is_published ELSE false END,
                updated_at = now(), updated_by = $3
          WHERE p.id = $1
      RETURNING ${PRODUCT_COLUMNS}`,
        [id, isVerified, ctx.userId],
      );
      const row = res.rows[0] as Record<string, unknown> | undefined;
      if (!row) throw new NotFoundException('That product was not found.');

      await this.audit.write(client, ctx, {
        action: isVerified ? 'insurance.product.verified' : 'insurance.product.unverified',
        resourceType: 'insurance_product',
        resourceId: id,
        detail: { isVerified },
      });
      return toProduct(row);
    });
  }

  /**
   * PLATFORM ONLY — every product still awaiting a decision.
   *
   * The insurer's own name is joined in, because "Comprehensive 12-month" tells
   * an administrator nothing about WHOSE it is, and approving the wrong
   * company's product is the mistake this screen exists to prevent.
   */
  async reviewQueue(ctx: TenantContext) {
    return this.db.withTenant(ctx, async (client) => {
      // 🔴 BOTH HALVES, BECAUSE WITHDRAWAL NEEDS A CALLER TOO.
      //
      // This returned only the UNVERIFIED products. But
      // `setProductVerification` also WITHDRAWS — and a verified product
      // disappears from an unverified-only queue, so there was no screen from
      // which withdrawal could ever be invoked. "A route with no caller is not
      // shipped" is a recorded rule here, and an administrator who can approve
      // but not reverse the approval is the "rule whose escape hatch is
      // unreachable" defect wearing its other face.
      //
      // Composite response, mirroring `supplier-catalogue.service.ts`'s own
      // review queue (`{ suppliers, parts }`) rather than inventing a second
      // shape. Nothing consumed this endpoint yet — measured, no web caller and
      // no spec — so widening it breaks nothing.
      //
      // ⚠️ THE JOIN IS THE RISK, NOT THE TABLE. A permissive policy on
      // `insurance.products` is not enough: `identity.organizations` is
      // tenant-scoped too, and a join returns FEWER ROWS rather than failing,
      // which is an empty list behind a 200. It holds here because
      // `is_platform_admin()` satisfies `tenant_isolation` on both — which is
      // exactly why this endpoint requires the GRANT and not a role name.
      // 🔴 ONE QUERY, NOT TWO — one snapshot and one RLS evaluation.
      // `withTenant` runs READ COMMITTED, so two SELECTs get two statement
      // snapshots: a verification committing between them could show the same
      // product in BOTH halves or NEITHER. Codex found that; splitting in
      // application code removes the window entirely.
      const LIMIT = 400;
      const res = await client.query(
        `SELECT ${PRODUCT_COLUMNS}, o.name AS insurer_name
           FROM insurance.products p
           JOIN identity.organizations o ON o.id = p.organization_id
          ORDER BY p.created_at ASC
          LIMIT ${LIMIT}`,
      );
      const all = res.rows.map((r: Record<string, unknown>) => ({
        ...toProduct(r),
        insurerName: r.insurer_name as string,
      }));

      return {
        // Pending oldest-first — the longest wait is the most urgent decision.
        pending: all.filter((p) => !p.isVerified),
        // Verified newest-first: a withdrawal is nearly always of something
        // approved recently, usually in error.
        verified: all.filter((p) => p.isVerified).reverse(),
        // 🔴 SAY WHEN THE LIST IS CUT. A silent cap is how withdrawal becomes
        // unreachable for anything older than the newest N — the screen would
        // simply not show the product and nothing would explain why. The UI
        // renders this; a proper search/pagination is the real answer and is
        // not built yet, so the honest move is to admit the boundary rather
        // than hide it.
        truncated: all.length === LIMIT,
      };
    });
  }

  /** What this insurer owes the platform, and what is already settled. */
  async levySummary(ctx: TenantContext) {
    assertInsuranceOperator(ctx, 'The platform levy statement');
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `SELECT settlement_status, currency,
                count(*)::int AS policies, sum(amount) AS total
           FROM insurance.platform_levies
          GROUP BY settlement_status, currency
          ORDER BY settlement_status`,
      );
      return res.rows.map((r: Record<string, unknown>) => ({
        settlementStatus: r.settlement_status as string,
        currency: r.currency as string,
        policies: Number(r.policies),
        total: String(r.total),
      }));
    });
  }
}
