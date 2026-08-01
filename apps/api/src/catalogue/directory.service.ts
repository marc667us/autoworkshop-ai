import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';
import { CatalogueInputError, optionalText, requiredText } from './catalogue-write-rules';

/**
 * The public mechanic directory — Slice C.
 *
 * ⚠️ A COPY OF CONSENTED FIELDS, NEVER A VIEW OVER `core.organization_profile`.
 * Migration 021's header sets out why and it has not changed: publication is an
 * explicit ACT that copies chosen fields into a public table, not a predicate
 * that exempts rows from tenant isolation. So `defaults()` READS the profile to
 * pre-fill a form, and `save()` writes the values it is given into
 * `catalogue.mechanic_directory` as separate data. Nothing here joins the two at
 * read time, and a later edit to the profile does not silently change what the
 * public sees.
 *
 * ⚠️ `withTenant`, BECAUSE THE PREDICATE IS THE ORGANIZATION AND THE ROLE. Both
 * arrive from `tenantSessionStatements` — `app.organization_ids` and
 * `app.current_role` — and neither is set by `withUser`. Under `withUser` every
 * statement here would match no policy and affect zero rows without raising,
 * which is the failure this codebase has now paid for twice.
 */
@Injectable()
export class DirectoryService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * ⚠️ THE ROLE IS CHECKED HERE AS WELL AS IN POSTGRES, and not because the
   * policy is insufficient. Without it a technician gets a silent zero-row
   * result that reads as "saving is broken" rather than "this is the owner's
   * decision". The policy is the enforcement; this is the explanation.
   */
  private assertGoverns(ctx: TenantContext): void {
    if (ctx.activeRole !== 'workshop_owner' && ctx.activeRole !== 'platform_administrator') {
      throw new ForbiddenException(
        'only the workshop owner can change the public directory listing. ' +
          'Ask an owner to publish or withdraw it.',
      );
    }
  }

  /**
   * The listing, plus the profile values a first-time form should offer.
   *
   * ⚠️ READABLE BY ANY MEMBER — AND THAT ONLY BECAME TRUE IN MIGRATION 028.
   * This comment asserted it from the start and 027's single `FOR ALL` policy
   * did not implement it: a manager or technician got NO row for their own
   * saved-but-unpublished listing, so the screen fell back to profile
   * suggestions and told them "Not listed" about a listing that existed.
   * Measured, not theorised — owner 1 row, manager 0, technician 0.
   *
   * The rule is right (knowing whether your own workshop is publicly listed is
   * not a governance secret, and a screen that hides it from the people who
   * must ask the owner to change it is useless), so 028 added `member_read_own`
   * rather than this comment being weakened to match.
   */
  async describe(ctx: TenantContext) {
    return this.db.withTenant(ctx, async (client) => {
      const listing = await client.query(
        `SELECT organization_id, trading_name, city, country, public_phone,
                services, specialisms, is_published, updated_at
           FROM catalogue.mechanic_directory
          WHERE organization_id = $1`,
        [ctx.organizationId],
      );

      // Pre-fill only. These are NOT the published values and are never
      // presented as such — the screen shows them as suggestions for a listing
      // that does not exist yet.
      const profile = await client.query(
        `SELECT trading_name, city, country, phone
           FROM core.organization_profile
          WHERE organization_id = $1`,
        [ctx.organizationId],
      );

      const row = listing.rows[0] as Record<string, unknown> | undefined;
      const p = profile.rows[0] as Record<string, unknown> | undefined;

      return {
        listing: row
          ? {
              tradingName: row['trading_name'],
              city: row['city'],
              country: row['country'],
              publicPhone: row['public_phone'],
              services: row['services'] ?? [],
              specialisms: row['specialisms'] ?? [],
              isPublished: row['is_published'],
              updatedAt: row['updated_at'],
            }
          : null,
        suggested: {
          tradingName: p?.['trading_name'] ?? null,
          city: p?.['city'] ?? null,
          country: p?.['country'] ?? null,
          // ⚠️ THE PROFILE PHONE IS OFFERED, NOT COPIED. It may be a private
          // office line. The owner has to accept it into a public field.
          publicPhone: p?.['phone'] ?? null,
        },
        mayEdit: ctx.activeRole === 'workshop_owner' || ctx.activeRole === 'platform_administrator',
      };
    });
  }

  /**
   * Create or update the listing's consented fields.
   *
   * ⚠️ SAVING DOES NOT PUBLISH. `is_published` is absent from this statement
   * entirely, so editing a live listing cannot accidentally withdraw it and
   * editing a draft cannot accidentally expose it. Publication is its own
   * deliberate action — the same separation 021 built the column for.
   */
  async save(ctx: TenantContext, raw: Record<string, unknown>) {
    this.assertGoverns(ctx);

    let fields: {
      tradingName: string;
      city: string;
      country: string;
      publicPhone: string | null;
      services: string[];
      specialisms: string[];
    };
    try {
      fields = {
        tradingName: requiredText(raw['tradingName'], 'trading name', 200),
        city: requiredText(raw['city'], 'town or city', 120),
        country: requiredText(raw['country'], 'country', 80),
        publicPhone: optionalText(raw['publicPhone'], 'public phone', 40),
        services: this.cleanList(raw['services'], 'services'),
        specialisms: this.cleanList(raw['specialisms'], 'specialisms'),
      };
    } catch (err) {
      if (err instanceof CatalogueInputError) throw new BadRequestException(err.message);
      throw err;
    }

    return this.db.withTenant(ctx, async (client) => {
      const { rows } = await client.query(
        `INSERT INTO catalogue.mechanic_directory
           (organization_id, trading_name, city, country, public_phone, services, specialisms)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (organization_id) DO UPDATE
           SET trading_name = EXCLUDED.trading_name,
               city         = EXCLUDED.city,
               country      = EXCLUDED.country,
               public_phone = EXCLUDED.public_phone,
               services     = EXCLUDED.services,
               specialisms  = EXCLUDED.specialisms,
               updated_at   = now()
         RETURNING is_published`,
        [
          ctx.organizationId,
          fields.tradingName,
          fields.city,
          fields.country,
          fields.publicPhone,
          fields.services,
          fields.specialisms,
        ],
      );
      // Zero rows means the policy refused it — reported rather than returned
      // as a cheerful success that changed nothing.
      if (rows.length === 0) throw new ForbiddenException('the listing could not be saved');
      return { saved: true, isPublished: rows[0]?.['is_published'] };
    });
  }

  /**
   * Publish or withdraw.
   *
   * ⚠️ REFUSES TO PUBLISH A LISTING THAT DOES NOT EXIST rather than creating an
   * empty one. A row with no trading name would appear in the public directory
   * as a blank card, and `NOT NULL` does not prevent it because the INSERT would
   * have to invent values to satisfy the constraint.
   */
  async setPublication(ctx: TenantContext, published: boolean) {
    this.assertGoverns(ctx);

    return this.db.withTenant(ctx, async (client) => {
      const { rows } = await client.query(
        `UPDATE catalogue.mechanic_directory
            SET is_published = $2, updated_at = now()
          WHERE organization_id = $1
          RETURNING is_published, trading_name`,
        [ctx.organizationId, published],
      );
      if (rows.length === 0) {
        throw new BadRequestException(
          'there is no listing to publish yet — save your details first, then publish',
        );
      }
      return {
        isPublished: rows[0]?.['is_published'],
        message: published
          ? 'Your workshop is now listed publicly.'
          : 'Your listing has been withdrawn and is no longer public.',
      };
    });
  }

  /**
   * A short list of free-text labels.
   *
   * `TEXT[]`, so each entry is bounded rather than the array as a whole — a
   * single 4KB "service" renders on a public card just as badly as a hundred
   * short ones.
   */
  private cleanList(value: unknown, field: string): string[] {
    if (value === undefined || value === null || value === '') return [];
    const raw = Array.isArray(value)
      ? value
      : // A comma-separated string is what a plain text input sends, and
        // rejecting it would mean the screen needs a tag widget before it can
        // save anything at all.
        String(value).split(',');
    const out = raw
      .map((v) => String(v).trim())
      .filter((v) => v !== '')
      .slice(0, 20);
    for (const entry of out) {
      if (entry.length > 60) {
        throw new CatalogueInputError(`each entry in ${field} must be 60 characters or fewer`);
      }
    }
    // Deduplicated: the same service listed twice is a card that looks careless.
    return [...new Set(out)];
  }
}
