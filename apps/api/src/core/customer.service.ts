import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';
import {
  CONTACT_METHODS,
  CUSTOMER_TYPES,
  optionalEmail,
  optionalOneOf,
  optionalText,
  requireText,
} from './validate';

export interface Customer {
  id: string;
  organizationId: string;
  /** The platform account, when this customer has one. Null for a walk-in. */
  userId: string | null;
  customerType: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  preferredContact: string;
  location: string | null;
  status: string;
  /** Denormalised for display only — computed by a join, never stored. */
  vehicleCount: number;
  createdAt: string;
}

/**
 * Roles permitted to create a customer record.
 *
 * `07.txt` part 2 §50 gives reception staff "customer, vehicle, complaint,
 * appointment, intake, invoice and release functions" — reception IS the role
 * that books a customer in, so it leads this list. The owner and manager hold
 * governance and daily operational control respectively and both admit
 * customers in practice.
 *
 * A technician is deliberately absent: §50 scopes them to "assigned-job
 * inspection, diagnosis, repair planning, execution, testing". Creating customer
 * records is not a repair activity.
 */
const CAN_CREATE_CUSTOMER = new Set([
  'platform_administrator',
  'workshop_owner',
  'workshop_manager',
  'reception_staff',
]);

/**
 * Roles permitted to READ the organisation's customer book.
 *
 * ⚠️ THIS EXISTS BECAUSE THE ABSENCE OF IT WAS MEASURED, NOT IMAGINED. The
 * screen calls `requireNavRoute()` and a technician gets a 404 — but a page gate
 * is not a control, and on 2026-07-28 the API was asked the same question
 * directly, with a REAL technician access token captured from a real Keycloak
 * session (`packages/auth/verify/call-api-as.mjs`):
 *
 *     GET /api/v1/customers -> HTTP 200
 *     array of 3: Adjoa Boateng, Kwame Mensah, Sunrise Logistics Ltd
 *
 * Tenant isolation held — every row was the viewer's own tenant. ROLE
 * authorization did not exist: the whole customer book, with names, telephone
 * numbers and locations, to a role whose own navigation deliberately omits it.
 * That is exactly what CLAUDE.md §8 means by "Hidden ≠ secure", and it would
 * have shipped behind a screen that looked correctly locked.
 *
 * WHO IS ON THE LIST, AND WHY (`07.txt` pt2 §50 role summaries, cross-checked
 * against the §46-§49 navigation trees, which are the more specific authority):
 *
 *   · `workshop_owner`   — "full workshop governance"; §46 carries Customers
 *                          and Vehicles.
 *   · `reception_staff`  — "CUSTOMER, VEHICLE, complaint, appointment, intake";
 *                          §48 is built around exactly this.
 *   · `workshop_manager` — "daily operational control, assignment, workflow".
 *   · `cashier`          — "invoice review, payment collection and receipt
 *                          generation"; you cannot bill a customer you may not
 *                          identify.
 *   · `platform_administrator` — the cross-tenant support role.
 *   · `customer`         — permitted, but narrowed to their OWN record by
 *                          `scopeToSelf` below. Being on this list grants
 *                          reading; it does not grant reading everyone.
 *
 * DELIBERATELY ABSENT: `technician` (§49 omits it; §50 scopes them to assigned
 * jobs), `storekeeper` (parts and inventory), `quality_control_inspector`
 * ("independent testing, quality review") and `workshop_supervisor` ("technical
 * review, repair-plan approval, testing"). None of them needs the customer book
 * to do the work §50 describes. Phase 5 gives a technician the customer and
 * vehicle for the JOB THEY ARE ASSIGNED, which is a different question with a
 * different answer, and it arrives with the job card that can express it.
 */
const CAN_READ_CUSTOMERS = new Set([
  'platform_administrator',
  'workshop_owner',
  'workshop_manager',
  'reception_staff',
  'cashier',
  'customer',
]);

/**
 * Customer domain service — Phase 4, Release 0.3.
 *
 * Built on `OrganizationService` / `BranchService` exactly, and for the reason
 * stated there: a REST controller and an MCP tool are both thin callers of this
 * one service, so an AI agent gets the identical rules a human does
 * (`0.txt` §13, §26). Rules live here; the controller only routes.
 */
@Injectable()
export class CustomerService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Customers visible to this viewer.
   *
   * TWO different scopes, because the specification states two different rules
   * and collapsing them would either hide a workshop's own book or expose it:
   *
   *   · `01 (1).txt` §19 — "Workshop staff shall see organizational customer
   *     records." Staff see the whole organisation's customers.
   *   · The same section — "Vehicle owners shall see only vehicles they own or
   *     are authorized to manage." A viewer in the customer role is a member of
   *     the public and sees only their own record, even though RLS would happily
   *     show them the tenant's entire customer list.
   *
   * RLS is the tenant backstop and it is doing its job; it has no opinion about
   * WHICH member of a tenant is asking. That distinction can only be made here.
   */
  async list(ctx: TenantContext): Promise<Customer[]> {
    this.assertMayRead(ctx);
    return this.db.withTenant(ctx, async (client) => {
      // The explicit `tenant_id` predicate is required by CLAUDE.md §6 and is
      // not redundant with RLS: the policy reads `is_platform_admin() OR
      // tenant_id = current_tenant_id()`, so for a platform administrator a bare
      // query returns EVERY tenant's customers from an endpoint scoped to one.
      // The predicate is what makes this endpoint mean the same thing for every
      // role. Same reasoning as `OrganizationService.list`.
      const scopeToSelf = ctx.activeRole === 'customer';
      const res = await client.query(
        `SELECT c.id, c.organization_id, c.user_id, c.customer_type, c.display_name,
                c.email, c.phone, c.preferred_contact, c.location, c.status, c.created_at,
                count(v.id)::int AS vehicle_count
           FROM core.customers c
           -- LEFT, not INNER: a customer with no vehicle yet is still a
           -- customer, and an inner join would silently drop them from the list
           -- reception uses to find people.
           LEFT JOIN core.vehicles v
                  ON v.customer_id = c.id
                 AND v.tenant_id   = c.tenant_id
          WHERE c.tenant_id = $1
            AND c.organization_id = $2
            AND ($3::uuid IS NULL OR c.user_id = $3::uuid)
          GROUP BY c.id
          ORDER BY c.display_name`,
        [ctx.tenantId, ctx.organizationId, scopeToSelf ? ctx.userId : null],
      );
      return res.rows.map(this.toDomain);
    });
  }

  async findById(ctx: TenantContext, id: string): Promise<Customer> {
    this.assertMayRead(ctx);
    return this.db.withTenant(ctx, async (client) => {
      const scopeToSelf = ctx.activeRole === 'customer';
      const res = await client.query(
        `SELECT c.id, c.organization_id, c.user_id, c.customer_type, c.display_name,
                c.email, c.phone, c.preferred_contact, c.location, c.status, c.created_at,
                count(v.id)::int AS vehicle_count
           FROM core.customers c
           LEFT JOIN core.vehicles v
                  ON v.customer_id = c.id
                 AND v.tenant_id   = c.tenant_id
          WHERE c.id = $1 AND c.tenant_id = $2
            AND c.organization_id = $3
            AND ($4::uuid IS NULL OR c.user_id = $4::uuid)
          GROUP BY c.id`,
        [id, ctx.tenantId, ctx.organizationId, scopeToSelf ? ctx.userId : null],
      );
      const row = res.rows[0];
      if (!row) {
        // 404 and not 403, deliberately: a customer in another tenant is
        // invisible under RLS, and a 403 would confirm the id exists — turning
        // the status code into a cross-tenant existence oracle. The same answer
        // is given to a customer asking about someone else's record, so the
        // scoping above cannot be probed either.
        throw new NotFoundException('customer not found');
      }
      return this.toDomain(row);
    });
  }

  async create(
    ctx: TenantContext,
    input: {
      displayName: string;
      customerType?: string;
      email?: string;
      phone?: string;
      preferredContact?: string;
      location?: string;
      notes?: string;
    },
  ): Promise<Customer> {
    if (!CAN_CREATE_CUSTOMER.has(ctx.activeRole)) {
      throw new ForbiddenException(
        `role '${ctx.activeRole}' may not create a customer`,
      );
    }

    const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
    if (!displayName) {
      // A customer with no name is unusable to reception and unfindable later.
      // Rejected here rather than by a NOT NULL constraint so the caller gets a
      // 400 naming the field, not a 500 from a constraint violation.
      //
      // BadRequest, not Forbidden: the caller's ROLE was fine, their INPUT was
      // not. Answering 403 to a malformed body tells a permitted user they lack
      // permission, and sends them to an administrator instead of to the form.
      throw new BadRequestException('displayName is required');
    }

    // Validated before any SQL, in the service so an MCP tool gets the same
    // checks (Codex P2). These mirror migration 004's CHECK constraints, which
    // remain the authority — this makes the common case a 400 naming the field
    // instead of a raw constraint violation surfacing as a 500.
    const name = requireText(displayName, 'displayName', 200);
    const customerType = optionalOneOf(input.customerType, CUSTOMER_TYPES, 'customerType') ?? 'individual';
    const preferredContact = optionalOneOf(input.preferredContact, CONTACT_METHODS, 'preferredContact') ?? 'phone';
    const email = optionalEmail(input.email, 'email');
    const phone = optionalText(input.phone, 'phone', 40);
    const location = optionalText(input.location, 'location', 200);
    const notes = optionalText(input.notes, 'notes', 4000);

    return this.db.withTenant(ctx, async (client) => {
      // `tenant_id` and `organization_id` come from the RESOLVED context, never
      // from the request body — `1.txt` §9. A client-supplied organization would
      // let a member of tenant A file a customer under another organisation.
      const res = await client.query(
        `INSERT INTO core.customers
           (tenant_id, organization_id, customer_type, display_name, email, phone,
            preferred_contact, location, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id, organization_id, user_id, customer_type, display_name, email,
                   phone, preferred_contact, location, status, created_at,
                   0::int AS vehicle_count`,
        [
          ctx.tenantId,
          ctx.organizationId,
          customerType,
          name,
          email,
          phone,
          preferredContact,
          location,
          notes,
          ctx.userId,
        ],
      );
      const row = res.rows[0];

      // Same transaction as the insert: the change and its audit row commit or
      // roll back together. An audit row on its own connection could survive a
      // rolled-back insert and describe a customer that does not exist.
      await this.audit.write(client, ctx, {
        action: 'customer.created',
        resourceType: 'customer',
        resourceId: row.id,
        // Deliberately NOT the email, phone or location. `1.txt` §1646:
        // "Telephone numbers and personal contact details should not be exposed
        // unless the user intentionally shares them." An audit trail is read by
        // administrators and exported; it records that the act happened and by
        // whom, not a second copy of the personal data.
        detail: { customerType },
      });

      return this.toDomain(row);
    });
  }

  /**
   * 403 and not 404 here, which is the opposite of the choice made for a
   * MISSING record — and the difference is deliberate.
   *
   * A 404 on `findById` avoids confirming that some id exists, because that
   * would be a cross-tenant existence oracle. This check leaks nothing of the
   * kind: it depends only on the caller's OWN role, which they already know, and
   * the endpoint's existence is not a secret. Answering 404 here would instead
   * tell a legitimately-configured user that the feature is missing when the
   * real answer is that their role is wrong — sending them to a bug report
   * rather than to an administrator.
   */
  private assertMayRead(ctx: TenantContext): void {
    if (!CAN_READ_CUSTOMERS.has(ctx.activeRole)) {
      throw new ForbiddenException(
        `role '${ctx.activeRole}' may not read customer records`,
      );
    }
  }

  private toDomain = (row: {
    id: string;
    organization_id: string;
    user_id: string | null;
    customer_type: string;
    display_name: string;
    email: string | null;
    phone: string | null;
    preferred_contact: string;
    location: string | null;
    status: string;
    vehicle_count: number;
    created_at: Date;
  }): Customer => ({
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    customerType: row.customer_type,
    displayName: row.display_name,
    email: row.email,
    phone: row.phone,
    preferredContact: row.preferred_contact,
    location: row.location,
    status: row.status,
    vehicleCount: row.vehicle_count,
    createdAt: row.created_at.toISOString(),
  });
}
