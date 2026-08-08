import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { assertWorkshopStaff } from '../authz/workshop-roles';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';
import { PricingInputError, parsePricingInput } from './pricing-rules';
import { PRICING_DEFAULTS } from './quotation-rules';

/**
 * The workshop's pricing — Slice D.
 *
 * 🔴 THIS SCREEN IS WHY MIGRATION 029 EXISTS, AND THE ORDER MATTERS. 029's own
 * header says it: `repair.organization_pricing` had ONE `FOR ALL` policy testing
 * only the tenant, so every role could rewrite the labour rate. Measured against
 * the live database before the migration was written:
 *
 *     CONFIRMED: a TECHNICIAN rewrote the labour rate (1 rows, now 1.00)
 *
 * Nothing in the application offered that, because there was no pricing screen
 * at all — which is exactly why it went unnoticed. "No screen" is not a control,
 * and this slice adds the screen. The policy was fixed FIRST and proved by
 * `verify/029` (13 checks, every negative paired with a control) precisely so
 * that adding the screen is not what makes the defect reachable.
 *
 * ⚠️ 029'S *POLICY* READ IS TENANT-WIDE; WRITES ARE OWNER-ONLY AND
 * ORGANIZATION-SCOPED. That split is 029's, not this file's.
 * `quotation.service.ts` reads this row DIRECTLY (its own SELECT, ~line 236)
 * while building a quotation and runs as whichever role is preparing it —
 * reception, a manager, a technician — so narrowing the POLICY would break
 * quotation preparation for everybody, a far worse outcome than the defect
 * being fixed.
 *
 * 🔴 THAT IS NOT A REASON TO LEAVE `describe()` OPEN, AND IT WAS READ AS ONE.
 * The policy has to stay wide because quotation preparation depends on it; the
 * SCREEN does not. `describe()` was ungated while only `save()` checked a role,
 * so a signed-in `customer` — a real membership role in this same organisation,
 * which organisation-scoped RLS cannot tell apart from staff — could read the
 * workshop's labour rate, tax rate and standard warranty terms straight off
 * `GET .../pricing`. Those are the numbers a workshop quotes with.
 *
 * ⚠️ `withTenant`, BECAUSE THE PREDICATE IS THE ORGANIZATION AND THE ROLE. Both
 * reach Postgres only through `tenantSessionStatements`. Under `withUser` every
 * statement here would match no policy and affect zero rows WITHOUT RAISING —
 * the failure this codebase has now paid for three times.
 */
@Injectable()
export class PricingService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * ⚠️ CHECKED HERE AS WELL AS IN POSTGRES, and not because the policy is
   * insufficient. Without it a manager gets a silent zero-row result that reads
   * as "saving is broken" rather than "this is the owner's decision". The policy
   * is the enforcement; this is the explanation.
   *
   * The role list mirrors `identity.current_user_governs_organization()`, which
   * is `is_platform_admin() OR current_role_name() = 'workshop_owner'` — read
   * from the live function rather than assumed.
   */
  private assertGoverns(ctx: TenantContext): void {
    if (ctx.activeRole !== 'workshop_owner' && ctx.activeRole !== 'platform_administrator') {
      throw new ForbiddenException(
        'only the workshop owner can change pricing. A quotation is built from these ' +
          'rates, so they are the owner’s decision — ask an owner to change them.',
      );
    }
  }

  /**
   * The organisation's rates, plus what a first-time form should show.
   *
   * 🔴 `configured` IS THE FIELD THAT MATTERS AND IT IS NOT COSMETIC. When no
   * row exists, `quotation.service.ts` falls back to `PRICING_DEFAULTS`, whose
   * labour rate is **ZERO** — so a workshop that has never opened this screen
   * quotes labour at nothing, silently, on every job. Returning the fallbacks
   * without saying they ARE fallbacks would render a form that looks configured
   * and is not, which is how the zero survives. The screen says so plainly.
   */
  async describe(ctx: TenantContext) {
    // 🔴 STAFF-WIDE, NOT OWNER-ONLY — AND THE CHOICE IS DELIBERATE.
    //
    // `assertGoverns` (owner + platform admin) is the WRITE rule and reusing it
    // here would break the read for everybody who legitimately needs the rates
    // on screen: reception quoting at the counter, a manager checking a tax
    // rate, a supervisor explaining a line to a customer. Migration 029's whole
    // point is that the read is wider than the write, and `mayEdit` below is
    // what tells an ordinary staff member the form is read-only for them —
    // gating the read to the owner would make that field unreachable rather
    // than merely false.
    //
    // What must be refused is the caller RLS cannot see as separate: a
    // `customer` inside this same organisation. `assertWorkshopStaff` is that
    // line and nothing narrower belongs here.
    assertWorkshopStaff(ctx, 'The workshop pricing screen');
    return this.db.withTenant(ctx, async (client) => {
      const { rows } = await client.query(
        `SELECT currency, default_labour_rate, tax_name, tax_rate_percent,
                default_validity_days, default_warranty_terms, updated_at
           FROM repair.organization_pricing
          WHERE organization_id = $1 AND tenant_id = $2`,
        [ctx.organizationId, ctx.tenantId],
      );

      const row = rows[0] as Record<string, unknown> | undefined;

      return {
        configured: row !== undefined,
        pricing: row
          ? {
              currency: row['currency'],
              // `numeric` arrives from `pg` as a STRING, deliberately — it does
              // not fit a JS number safely in general. Converted here so the
              // screen renders a number rather than "120.00" in a numeric input
              // that would reject it.
              defaultLabourRate: Number(row['default_labour_rate']),
              taxName: row['tax_name'],
              taxRatePercent: Number(row['tax_rate_percent']),
              defaultValidityDays: row['default_validity_days'],
              defaultWarrantyTerms: row['default_warranty_terms'] ?? '',
              updatedAt: row['updated_at'],
            }
          : {
              // The SAME constants `quotation.service.ts` falls back to, imported
              // rather than restated — a second copy here could drift, and the
              // screen would then promise a rate quotations do not use.
              currency: PRICING_DEFAULTS.currency,
              defaultLabourRate: PRICING_DEFAULTS.labourRate,
              taxName: PRICING_DEFAULTS.taxName,
              taxRatePercent: PRICING_DEFAULTS.taxRatePercent,
              defaultValidityDays: PRICING_DEFAULTS.validityDays,
              defaultWarrantyTerms: '',
              updatedAt: null,
            },
        mayEdit:
          ctx.activeRole === 'workshop_owner' || ctx.activeRole === 'platform_administrator',
      };
    });
  }

  /**
   * Create or replace the organisation's pricing.
   *
   * ⚠️ AN UPSERT, BECAUSE THE FIRST SAVE AND EVERY LATER ONE ARE THE SAME ACT to
   * the owner. It exercises BOTH of 029's write policies: `owner_write`
   * (`FOR INSERT WITH CHECK`) on the first save and `owner_update` on the rest.
   * `verify/029` checks 5-10 cover both paths against the real database.
   *
   * ⚠️ NO DELETE, EVER. 016 withheld the DELETE grant and 029 adds no DELETE
   * policy, because pricing is SUPERSEDED by an edit and never removed: a
   * missing row silently returns the column defaults, and the default labour
   * rate is zero. A quotation already issued must stay explicable.
   */
  async save(ctx: TenantContext, raw: Record<string, unknown>) {
    this.assertGoverns(ctx);

    let input;
    try {
      input = parsePricingInput(raw ?? {});
    } catch (err) {
      if (err instanceof PricingInputError) throw new BadRequestException(err.message);
      throw err;
    }

    return this.db.withTenant(ctx, async (client) => {
      const { rows } = await client.query(
        `INSERT INTO repair.organization_pricing
           (organization_id, tenant_id, currency, default_labour_rate, tax_name,
            tax_rate_percent, default_validity_days, default_warranty_terms,
            created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
         ON CONFLICT (organization_id) DO UPDATE
           SET currency               = EXCLUDED.currency,
               default_labour_rate    = EXCLUDED.default_labour_rate,
               tax_name               = EXCLUDED.tax_name,
               tax_rate_percent       = EXCLUDED.tax_rate_percent,
               default_validity_days  = EXCLUDED.default_validity_days,
               default_warranty_terms = EXCLUDED.default_warranty_terms,
               updated_by             = EXCLUDED.updated_by,
               updated_at             = now()
         RETURNING currency, default_labour_rate, updated_at`,
        [
          ctx.organizationId,
          ctx.tenantId,
          input.currency,
          input.defaultLabourRate,
          input.taxName,
          input.taxRatePercent,
          input.defaultValidityDays,
          input.defaultWarrantyTerms,
          ctx.userId,
        ],
      );

      // Zero rows means a policy refused it. Reported rather than returned as a
      // cheerful success that changed nothing — the exact failure mode migration
      // 025 was written to fix, one layer up.
      if (rows.length === 0) {
        throw new ForbiddenException('the pricing could not be saved');
      }

      return {
        saved: true,
        currency: rows[0]?.['currency'],
        defaultLabourRate: Number(rows[0]?.['default_labour_rate']),
        updatedAt: rows[0]?.['updated_at'],
        message:
          'Saved. New quotations will use these rates; quotations already issued keep the ' +
          'rates they were built with.',
      };
    });
  }
}
