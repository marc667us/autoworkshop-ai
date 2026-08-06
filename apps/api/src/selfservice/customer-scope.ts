import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { isWorkshopStaff } from '../authz/workshop-roles';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * WHICH CUSTOMER'S RECORDS A REQUEST MAY SEE.
 *
 * ── 🔴 WHY THIS IS ITS OWN MODULE ──────────────────────────────────────────
 *
 * `SelfServiceService` invented this rule for slice 9 and kept it private,
 * along with a SECOND hand-written copy of the workshop-role list. Slice 12
 * needs the identical rule for invoices, payments, receipts, quotations and
 * warranty — five more services — and a rule that has to be re-typed per
 * service is a rule that will be typed differently in one of them.
 *
 * The role list in particular was already duplicated: `authz/workshop-roles.ts`
 * holds the canonical `WORKSHOP_STAFF_ROLES`, and `selfservice.service.ts` held
 * a private `WORKSHOP_ROLES` with the same nine names. Two lists that must stay
 * equal and are not checked against each other is a defect waiting for the next
 * role to be added to one of them.
 *
 * ── ⚠️ RLS CANNOT EXPRESS THIS RULE, SO IT LIVES HERE ──────────────────────
 *
 * Row-level security is ORGANISATION-scoped. Two customers of the same workshop
 * are in the same organisation, so no policy can keep customer X out of
 * customer Y's rows. There is no `app.customer_id` setting and inventing one
 * would let a client name it. The predicate is therefore applied by the SERVICE,
 * on every single read, derived from the signed-in user.
 *
 * ⚠️ THIS IS A PREDICATE, NOT A GATE. `assertWorkshopStaff` refuses a customer
 * outright — correct for the workshop's own books. This does the opposite job:
 * it lets a customer in, narrowed to their own rows. A screen needs exactly one
 * of the two, and `authz/workshop-roles.ts` says which.
 */

/**
 * The caller's own customer record, or null when they are not a customer here.
 *
 * 🔴 DERIVED FROM THE SESSION, NEVER ACCEPTED FROM THE CALLER. A customer id in
 * a request is a customer id an attacker can change; `core.customers.user_id` is
 * the server's own link between the signed-in person and their record.
 */
export async function myCustomerId(
  client: PoolClient,
  ctx: TenantContext,
): Promise<string | null> {
  const r = await client.query<{ id: string }>(
    `SELECT id FROM core.customers
      WHERE tenant_id = $1 AND organization_id = $2 AND user_id = $3
      LIMIT 1`,
    [ctx.tenantId, ctx.organizationId, ctx.userId],
  );
  return r.rows[0]?.id ?? null;
}

/**
 * Resolve the customer whose records this request may read.
 *
 * ⚠️ A WORKSHOP ROLE MAY NAME ONE; A CUSTOMER MAY NOT. Passing a customer id as
 * a customer is REFUSED rather than ignored — silently substituting their own id
 * would mask an authorization probe (`1.txt` §9, the same reasoning `TenantGuard`
 * uses for organisations).
 *
 * 🔴 NEVER PASS THE RESULT OF THIS BACK INTO IT. A write that resolved a
 * customer id and then handed that id to its own read-back made this function
 * refuse a customer their own row — every slice-9 write COMMITTED and then threw
 * 403. A customer's read-back must pass `undefined` so the id is re-derived.
 * `staffEcho` below exists so that is hard to get wrong.
 */
export async function resolveCustomerId(
  client: PoolClient,
  ctx: TenantContext,
  requested?: string,
): Promise<string> {
  const staff = isWorkshopStaff(ctx);

  if (requested) {
    if (!staff) {
      throw new ForbiddenException(
        'You can only see your own records. Leave the customer out of the request and you will get yours.',
      );
    }
    const exists = await client.query(
      `SELECT 1 FROM core.customers
        WHERE id = $1 AND tenant_id = $2 AND organization_id = $3 LIMIT 1`,
      [requested, ctx.tenantId, ctx.organizationId],
    );
    if (!exists.rowCount) throw new NotFoundException('That customer is not in this workshop.');
    return requested;
  }

  const mine = await myCustomerId(client, ctx);
  if (!mine) {
    throw new NotFoundException(
      staff
        ? 'You are staff here, not a customer, so there are no records of your own to show. Open a customer from the customer list to see theirs.'
        : 'This workshop has no customer record for your account yet. Reception can create one when you next bring a vehicle in.',
    );
  }
  return mine;
}

/**
 * What a write should pass to its own read-back.
 *
 * Staff named a customer and may name them again; a customer must pass
 * `undefined` so the list re-derives from their session. Returning
 * `resolvedCustomerId` unconditionally is the exact bug described above, so the
 * branch is written once, here, rather than at each of the nine call sites that
 * previously repeated it.
 */
export function staffEcho(ctx: TenantContext, resolvedCustomerId: string): string | undefined {
  return isWorkshopStaff(ctx) ? resolvedCustomerId : undefined;
}
