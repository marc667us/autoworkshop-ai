import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import { validatedBody } from '../common/validation/validated-body';
import { DatabaseService } from '../database/database.service';

/**
 * THE SHOPPER'S HALF OF THE INSURANCE MARKETPLACE — anonymous, no tenant.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 WHY THIS IS A SEPARATE CONTROLLER FROM `PublicController`, AND NOT TWO
 * MORE METHODS ON IT.
 *
 * `PublicController`'s own header states an invariant in as many words:
 *
 *     "Nothing here writes. There is no POST, PUT, PATCH or DELETE, and
 *      migration 021's `admin_write` policy would refuse one anyway."
 *
 * That is one of three things it names as what makes an unguarded controller
 * safe. Adding the enquiry POST there would have falsified it silently — the
 * comment would have stayed, describing a controller that no longer existed.
 * This repository has recorded "a comment claiming a rule that does not exist"
 * as its own defect class, so the write got its own class with its own
 * reasoning rather than quietly invalidating somebody else's.
 *
 * ── WHAT MAKES AN UNGUARDED WRITE SAFE HERE ──────────────────────────────
 *
 * Not this comment. Three mechanisms, in the database, each independently
 * sufficient to stop the interesting attack:
 *
 *   1. The write goes through `insurance.submit_enquiry()`, which DERIVES the
 *      tenant, the organisation and the price snapshot from the product row.
 *      No caller-supplied field decides who receives an enquiry. Nothing in
 *      the body below names a tenant, an organisation or an amount.
 *   2. `enquiries_public_insert` adjudicates the row RELATIONALLY — the
 *      tenant and organisation must match a product that is published AND
 *      verified. It is deliberately not `WITH CHECK (true)`.
 *   3. Reading back is refused. There is no anonymous read path to
 *      `insurance.enquiries` at all: the only SELECT policy is org-scoped, so
 *      a stranger cannot enumerate what anyone else has asked.
 *
 * ⚠️ AND THE RESPONSE CARRIES NOTHING. Not the enquiry id, not the insurer,
 * not the tenant. An id would be a handle to somebody else's record for a
 * caller who by construction has no way to be authorised for it, and it would
 * be the only thing on this route that could ever leak. The shopper needs to
 * know it was received; that is what is returned.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ────────────────────────────────────────
 *
 * No rate limiting, because this repository has none — there is no throttler
 * in the API and inventing a bespoke one on a single route would be a second
 * implementation of a cross-cutting concern that belongs in front of every
 * public route or in none. Recorded as an open item rather than papered over
 * with something that looks like a control and is not.
 * ══════════════════════════════════════════════════════════════════════════
 */

const EnquiryBody = z.object({
  productId: z.string().uuid(),
  contactName: z.string().trim().min(1).max(120),
  // Validated for SHAPE, matching 086's CHECK constraint rather than
  // attempting RFC 5322. It is the only way the insurer can reply, so an
  // obviously-broken address is refused at the boundary; anything cleverer
  // rejects real addresses.
  contactEmail: z.string().trim().min(3).max(320).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
    message: 'Enter an e-mail address the insurer can reply to.',
  }),
  contactPhone: z.string().trim().max(40).optional(),
  vehicleRegistration: z.string().trim().max(40).optional(),
  message: z.string().trim().max(2000).optional(),
});
type EnquiryBody = z.infer<typeof EnquiryBody>;

interface PublicProduct {
  id: string;
  insurer: string;
  name: string;
  summary: string | null;
  coverType: string;
  premium: string;
  currency: string;
  termMonths: number;
  excess: string | null;
  termsUrl: string | null;
}

function toPublicProduct(r: Record<string, unknown>): PublicProduct {
  return {
    id: r['o_product_id'] as string,
    insurer: r['o_insurer'] as string,
    name: r['o_name'] as string,
    summary: (r['o_summary'] as string | null) ?? null,
    coverType: r['o_cover_type'] as string,
    // 🔴 A STRING, NOT A NUMBER. `numeric` arrives from node-pg as a string and
    // coercing it here would silently lose precision on a PREMIUM — the number
    // somebody is charged. Same choice the parts catalogue makes for `price`.
    premium: String(r['o_premium']),
    currency: r['o_currency'] as string,
    termMonths: Number(r['o_term_months']),
    excess: r['o_excess'] === null || r['o_excess'] === undefined ? null : String(r['o_excess']),
    termsUrl: (r['o_terms_url'] as string | null) ?? null,
  };
}

@Controller('public')
export class PublicInsuranceController {
  constructor(private readonly db: DatabaseService) {}

  /**
   * `GET /public/insurance-products/:id` — one product, for the detail page.
   *
   * The list has been anonymous since 082. A detail page that filtered the
   * whole list client-side would ship every product's fields to render one and
   * would answer 200 for an id that does not exist, so 086 added
   * `insurance.public_product()` beside the existing list function.
   *
   * ⚠️ `queryWithoutTenant`, like every other public read. The projection
   * itself is what withholds the draft: the function selects only published
   * AND verified rows, so an unpublished product is a 404 here rather than a
   * page that renders less.
   */
  @Get('insurance-products/:id')
  async insuranceProduct(@Param('id', new ParseUUIDPipe()) id: string): Promise<PublicProduct> {
    const rows = await this.db.queryWithoutTenant<Record<string, unknown>>(
      `SELECT o_product_id, o_insurer, o_name, o_summary, o_cover_type,
              o_premium, o_currency, o_term_months, o_excess, o_terms_url
         FROM insurance.public_product($1)`,
      [id],
    );
    const row = rows[0];
    // Not published, not verified, or not a product at all. ONE answer for all
    // three: distinguishing them would tell a stranger which ids exist.
    if (!row) throw new NotFoundException('That insurance product is not on the marketplace.');
    return toPublicProduct(row);
  }

  /**
   * `POST /public/insurance-enquiries` — a shopper asks an insurer about cover.
   *
   * Anonymous by design. `assertInsuranceOperator`'s refusal message already
   * promises this in production code — *"To buy cover, the published products
   * are on the public marketplace and need no account"* — and a write path
   * requiring a login would make that promise false.
   */
  @Post('insurance-enquiries')
  async submitEnquiry(
    @Body(validatedBody(EnquiryBody)) body: EnquiryBody,
  ): Promise<{ received: true }> {
    try {
      await this.db.queryWithoutTenant(
        `SELECT insurance.submit_enquiry($1, $2, $3, $4, $5, $6, NULL)`,
        [
          body.productId,
          body.contactName,
          body.contactEmail,
          body.contactPhone ?? null,
          body.vehicleRegistration ?? null,
          body.message ?? null,
        ],
      );
    } catch (err) {
      const code = (err as { code?: string })?.code;
      // `no_data_found` is what 086 raises for a product that is not on the
      // marketplace. Turning it into a 404 rather than letting it surface as a
      // 500 is the same treatment the registration routes give the database's
      // refusals — and the function's message names what the visitor CAN do.
      if (code === 'P0002') {
        const message = err instanceof Error ? err.message : String(err);
        throw new NotFoundException(message);
      }
      // A constraint the zod schema did not catch (the e-mail CHECK, a blank
      // name) is the caller's problem, not a server fault.
      if (code === '23514') {
        throw new BadRequestException(
          'That enquiry could not be accepted. Check the name and e-mail address and try again.',
        );
      }
      throw err;
    }
    // Deliberately no id. See the class header.
    return { received: true };
  }
}
