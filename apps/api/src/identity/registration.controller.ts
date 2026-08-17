import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { UserGuard, type UserRequest } from '../auth/user.guard';
import { KeycloakJwtService } from '../auth/keycloak-jwt.service';
import { MembershipRepository } from './membership.repository';
import { CustomerEnrolmentService } from './customer-enrolment.service';
import { validatedBody } from '../common/validation/validated-body';

/**
 * ONBOARDING — the routes a signed-up person can reach before they belong
 * anywhere.
 *
 * ⚠️ ON `UserGuard`, NOT `TenantGuard`, AND THAT IS THE WHOLE REASON THIS
 * CONTROLLER IS SEPARATE. `TenantGuard` resolves exactly one organisation for
 * the request and refuses a caller with no membership — which is precisely the
 * person these routes exist for. Putting registration behind it would mean you
 * had to already belong to a workshop in order to create one.
 *
 * The safety argument is not that this guard is lenient. It is that a request
 * authenticated here never receives a tenant context, so `withTenant` is never
 * reachable from it and every tenant-owned table returns zero rows. The one
 * write below goes through a SECURITY DEFINER function that takes no tenant id
 * at all and refuses a caller who already has a membership.
 */

type RegisterWorkshopBody = z.infer<typeof RegisterWorkshopBody>;
const RegisterWorkshopBody = z.object({
  // §5's organisation name. Bounded because it becomes a tenant name, an
  // organisation name and the seed of a slug; unbounded text in all three is
  // how a display breaks in three places at once.
  workshopName: z.string().trim().min(2).max(120),
  branchName: z.string().trim().min(1).max(120).optional(),
});

/**
 * The body of `POST /registration/supplier`.
 *
 * ⚠️ TWO FIELDS, AND NO ROLE. Same rule as the customer body below: the role
 * (`supplier_owner`) and the organisation type (`parts_supplier`) are literals
 * inside migration 068. A `roleName` field accepted here would turn a
 * self-service sign-up route into privilege escalation as a REST call.
 */
type RegisterSupplierBody = z.infer<typeof RegisterSupplierBody>;
const RegisterSupplierBody = z.object({
  supplierName: z.string().trim().min(2).max(120),
  locationName: z.string().trim().min(1).max(120).optional(),
});

/**
 * The body of `POST /registration/fleet`.
 *
 * ⚠️ TWO FIELDS, AND NO ROLE. Same rule as the supplier body above: the role
 * (`fleet_administrator`) and the organisation type (`fleet_operator`) are
 * literals inside migration 075. A `roleName` field accepted here would turn a
 * self-service sign-up into privilege escalation as a REST call.
 */
// ⚠️ EXPORTED, UNLIKE ITS SIBLINGS, SO THE STRICTNESS CAN BE ASSERTED AGAINST
// THE REAL OBJECT. `fleet-registration.spec.ts` runs an attack body carrying
// `roleName` through `validatedBody(RegisterFleetBody)`. A test that rebuilt the
// schema locally would prove only that the copy is strict, and the copy is not
// what the route uses — the exact shape of "a check that walks through its own
// gap" this repository keeps finding.
type RegisterFleetBody = z.infer<typeof RegisterFleetBody>;
export const RegisterFleetBody = z.object({
  fleetName: z.string().trim().min(2).max(120),
  locationName: z.string().trim().min(1).max(120).optional(),
});

/**
 * The bodies of `POST /registration/insurance` and `/registration/towing`.
 *
 * ⚠️ TWO FIELDS, AND NO ROLE — the same rule as every sibling above. The roles
 * (`insurance_assessor`, `towing_operator`) and the organisation types
 * (`insurance_company`, `towing_company`) are literals inside migration 080. A
 * `roleName` field accepted here would turn a self-service sign-up into
 * privilege escalation as a REST call, and these two are the highest-value
 * targets for that: an `insurance_assessor` reads claim and repair data across
 * the workshops it assesses.
 */
type RegisterInsurerBody = z.infer<typeof RegisterInsurerBody>;
const RegisterInsurerBody = z.object({
  insurerName: z.string().trim().min(2).max(120),
  locationName: z.string().trim().min(1).max(120).optional(),
});

type RegisterTowingBody = z.infer<typeof RegisterTowingBody>;
const RegisterTowingBody = z.object({
  companyName: z.string().trim().min(2).max(120),
  locationName: z.string().trim().min(1).max(120).optional(),
});

/**
 * The body of `POST /registration/customer`.
 *
 * ⚠️ ONE FIELD, AND `.strict()` VIA `validatedBody` REJECTS ANY OTHER. The
 * temptation is to accept a `roleName` "for later"; that field would be the
 * whole vulnerability. The role is a literal inside migration 061 and there is
 * no argument anywhere on this path that can change it.
 */
type EnrolAsCustomerBody = z.infer<typeof EnrolAsCustomerBody>;
const EnrolAsCustomerBody = z.object({
  organizationId: z.string().uuid(),
});

@Controller('registration')
@UseGuards(UserGuard)
export class RegistrationController {
  constructor(
    private readonly memberships: MembershipRepository,
    private readonly jwt: KeycloakJwtService,
    private readonly enrolment: CustomerEnrolmentService,
  ) {}

  /**
   * `GET /registration/status` — do I belong to a workshop yet?
   *
   * The question the shell cannot otherwise ask. `GET /me` is behind
   * `TenantGuard`, so for a user with no membership it 401s — indistinguishable
   * at the network layer from an expired session, which would send a
   * newly-signed-up person back to a login screen they had just come from.
   *
   * Deliberately returns 200 with `hasWorkshop: false` rather than an error: it
   * is not a failure to be new.
   */
  @Get('status')
  async status(@Req() req: UserRequest) {
    const subject = await this.subjectOf(req);
    const record = await this.memberships.findByKeycloakSubject(subject);
    const active = (record?.memberships ?? []).filter((m) => m.status === 'active');
    return {
      userId: req.appUserId,
      /**
       * ⚠️ THE DISPLAY NAME LIVES HERE BECAUSE `/me` CANNOT SUPPLY IT TO THIS
       * PERSON. `/me` is behind TenantGuard and 401s for anyone with no
       * membership — which for `customer-web` is not an edge case, it is the
       * ENTIRE AUDIENCE. A vehicle owner buying a filter never joins a
       * workshop, so without this the shell had no name for them and rendered
       * "Not signed in" beside a working "Sign out", permanently. Seen in a
       * screenshot of the VIN funnel, for the very people it converts.
       */
      displayName: record?.displayName,
      hasWorkshop: active.length > 0,
      // What they could act as, if anything. The shell uses it to decide
      // between "create your workshop" and "go to your dashboard".
      organizations: active.map((m) => ({
        organizationId: m.organizationId,
        roleName: m.roleName,
      })),
    };
  }

  /**
   * `POST /registration/workshop` — create my workshop.
   *
   * Creates tenant + organisation + branch + an owner membership for the
   * CALLER, atomically, in the database.
   *
   * ⚠️ THE CALLER IS TAKEN FROM THE TOKEN SUBJECT, NEVER FROM THE BODY. The
   * body names the workshop and nothing else. A `userId` or `subject` field
   * here would let any authenticated person register a workshop in somebody
   * else's name and make themselves its owner.
   *
   * ⚠️ "Already belongs to an organisation" is enforced IN THE DATABASE, not
   * here. A double-submitted form races two requests past any check made in
   * application code, and the loser would create a second tenant that no screen
   * would ever show.
   */
  @Post('workshop')
  async registerWorkshop(
    @Req() req: UserRequest,
    // ⚠️ `validatedBody`, NOT a bare `.parse()` in the handler. The raw call
    // threw a ZodError that nothing mapped, so a one-character workshop name
    // returned `{"statusCode":500,"message":"Internal server error"}` — a
    // client mistake reported as a server fault. Measured over HTTP, not
    // reasoned about. The pipe is this repo's established boundary: it reports
    // EVERY problem at once and rejects unknown keys via `.strict()`.
    @Body(validatedBody(RegisterWorkshopBody)) parsed: RegisterWorkshopBody,
  ) {
    const subject = await this.subjectOf(req);
    try {
      const created = await this.memberships.registerWorkshop(
        subject,
        parsed.workshopName,
        parsed.branchName,
      );
      return { ...created, roleName: 'workshop_owner' };
    } catch (err) {
      // 🔴 THE DATABASE'S REFUSAL MUST REACH THE USER AS AN ANSWER, NOT A 500.
      //
      // Measured before this existed: a second POST — which is what a
      // double-submitted form IS — returned `{"statusCode":500,"message":
      // "Internal server error"}`. The guard worked perfectly and the person on
      // the other end was told the server was broken. They would retry, get 500
      // again, and reasonably conclude registration was unavailable while in
      // fact their workshop already existed and was waiting for them.
      //
      // §70's rule is that a user is never left uncertain whether an action
      // succeeded; "Internal server error" for an action that DID succeed a
      // moment ago is the worst version of that.
      //
      // Matched on the message the function raises. That is a coupling, so both
      // strings live in migration 036 and are quoted here — if either is
      // reworded, this falls back to a 500 and `verify-registration-flow.mjs`
      // fails on the status code rather than the wording drifting unnoticed.
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('already belongs to an organisation')) {
        throw new ConflictException(
          'This account already has a workshop. Sign in and open your dashboard.',
        );
      }
      if (message.includes('no active application user')) {
        // Reachable only if the account is suspended between the guard
        // resolving it and this statement — rare, but a 500 would be wrong.
        throw new BadRequestException('This account is not active.');
      }
      if (message.includes('a workshop needs a name')) {
        throw new BadRequestException('A workshop needs a name.');
      }
      throw err;
    }
  }

  /**
   * `POST /registration/supplier` — register my parts supplier.
   *
   * 🔴 THE ROUTE WITHOUT WHICH THE "Register as parts supplier" BUTTON WOULD BE
   * A 401. Nothing in the product could create a `supplier_owner` membership
   * before migration 068 — the same defect the customer role had on 2026-08-08,
   * caught this time BEFORE the button shipped rather than after.
   *
   * ⚠️ ON `UserGuard`, NECESSARILY — the caller has no membership yet, which is
   * the whole point. What makes that safe is in 068: the role and the org type
   * are literals, the caller is the token subject, an account that already
   * belongs anywhere is refused, and the RLS door pins every inserted row to
   * this user.
   *
   * ⚠️ THE SUPPLIER IS NOT PUBLISHED BY THIS CALL. Migration 069 queues it for
   * a platform administrator to verify; `catalogue.suppliers.is_published`
   * stays FALSE until somebody approves. The response says so, because a
   * sign-up that quietly does half of what the person expects is worse than one
   * that explains itself.
   */
  @Post('supplier')
  async registerSupplier(
    @Req() req: UserRequest,
    @Body(validatedBody(RegisterSupplierBody)) parsed: RegisterSupplierBody,
  ) {
    const subject = await this.subjectOf(req);
    try {
      const created = await this.memberships.registerSupplier(
        subject,
        parsed.supplierName,
        parsed.locationName,
      );
      return {
        ...created,
        roleName: 'supplier_owner',
        // 🔴 STATED IN THE RESPONSE, not left for the screen to guess. The
        // account works now; the public listing does not exist yet.
        verificationStatus: 'pending',
      };
    } catch (err) {
      // 🔴 THE DATABASE'S REFUSAL MUST REACH THE USER AS AN ANSWER, NOT A 500.
      // Same reasoning as `registerWorkshop` above, which shipped that exact
      // defect: a double-submitted form returned "Internal server error" for a
      // guard that had worked perfectly, and the person concluded registration
      // was broken when in fact it had already succeeded.
      //
      // Matched on the message 068 raises. That coupling is deliberate and
      // both strings are quoted in the migration — if either is reworded this
      // falls back to a 500 rather than the wording drifting unnoticed.
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('already belongs to an organisation')) {
        throw new ConflictException(
          'This account already belongs to an organisation. Sign in with a different account to register a supplier, or ask a platform administrator to add you to an existing one.',
        );
      }
      if (message.includes('no active application user')) {
        throw new BadRequestException('This account is not active.');
      }
      if (message.includes('a supplier needs a name')) {
        throw new BadRequestException('A supplier needs a name.');
      }
      throw err;
    }
  }

  /**
   * `POST /registration/fleet` — become a fleet operator.
   *
   * 🔴 THE HANDLE ON A DOOR THAT HAD NONE. Migration 075 created
   * `identity.register_fleet` on 2026-08-09 and nothing called it, so
   * `fleet_administrator` remained a role no production path could write —
   * while `fleet-web` was deployed the same day and rendered all 29 of its
   * routes to nobody. `POST /registration/fleet` answered 404. A caller with no
   * route is as unshipped as a route with no caller, and both go green.
   *
   * ⚠️ ON `UserGuard`, NECESSARILY — the same reasoning as the supplier and
   * customer routes below and above. The caller has no membership yet, which is
   * the entire point, so `TenantGuard` would refuse the exact person this route
   * exists for. What makes that safe is stated in migration 075: the role and
   * the organisation type are literals rather than parameters, an account that
   * already belongs to an organisation is refused by the DATABASE, and the
   * bootstrap RLS door pins every inserted row to this user.
   *
   * 🔴 THE CONCURRENCY HALF OF THAT CAME LATER, IN 076, AND THIS COMMENT
   * CLAIMED IT BEFORE IT WAS TRUE. 075's membership check took no lock, so two
   * simultaneous submits could each find no membership and create a tenant
   * apiece — and a fleet submit could race a workshop one, which holds a lock
   * 075 never joined. 076 takes the same per-identity advisory lock as 071/072.
   * Written down because the sentence read as a guarantee and was the reason
   * nobody looked.
   *
   * ⚠️ THE FLEET IS NOT VERIFIED BY THIS CALL. Migration 075 widened the
   * verification queue's `kind` to accept `'fleet'`, so registering enqueues the
   * organisation for a platform administrator exactly as a supplier does. The
   * response says so rather than leaving the screen to guess — a sign-up that
   * quietly does half of what the person expects is worse than one that explains
   * itself.
   */
  @Post('fleet')
  async registerFleet(
    @Req() req: UserRequest,
    @Body(validatedBody(RegisterFleetBody)) parsed: RegisterFleetBody,
  ) {
    const subject = await this.subjectOf(req);
    try {
      const created = await this.memberships.registerFleet(
        subject,
        parsed.fleetName,
        parsed.locationName,
      );
      return {
        ...created,
        roleName: 'fleet_administrator',
        verificationStatus: 'pending',
      };
    } catch (err) {
      // 🔴 THE DATABASE'S REFUSAL MUST REACH THE USER AS AN ANSWER, NOT A 500.
      // `registerWorkshop` shipped that exact defect: a double-submitted form
      // returned "Internal server error" for a guard that had worked perfectly,
      // and the person concluded registration was broken when it had already
      // succeeded.
      //
      // ⚠️ MATCHED ON THE MESSAGES MIGRATION 075 RAISES, and that coupling is
      // deliberate — the strings are quoted in the migration. If either is
      // reworded this falls back to a 500 rather than the wording drifting
      // unnoticed into a silently-wrong error page.
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('already belongs to an organisation')) {
        throw new ConflictException(
          'This account already belongs to an organisation. Sign in with a different account to register a fleet, or ask a platform administrator to add you to an existing fleet.',
        );
      }
      if (message.includes('no active application user')) {
        throw new BadRequestException('This account is not active.');
      }
      if (message.includes('a fleet needs a name')) {
        throw new BadRequestException('A fleet needs a name.');
      }
      throw err;
    }
  }

  /**
   * `POST /registration/insurance` — register my insurance company.
   *
   * 🔴 THE FOURTH ROLE THAT COULD NOT EXIST. `insurance_assessor` was in
   * `GRANTABLE_ROLES`, in the permission matrix and owned a 28-entry navigation
   * tree, and no production path could write it — nor could anything create an
   * INDEPENDENT `insurance_company`, because `POST /organizations` is behind
   * `TenantGuard` and would have filed the insurer inside the caller's own
   * tenant. See migration 080's header for why that is backwards.
   *
   * ⚠️ ON `UserGuard`, NECESSARILY — the caller has no membership yet, which is
   * the entire point. What makes it safe is in 080: the role and the org type
   * are literals, the caller is the token subject, an account that already
   * belongs anywhere is refused BY THE DATABASE under a per-identity advisory
   * lock, and the bootstrap RLS door pins every inserted row to this user.
   *
   * ⚠️ THE INSURER IS NOT VERIFIED BY THIS CALL. 080 widened the verification
   * queue's `kind` to accept `'insurance'`, so registering enqueues the company
   * for a platform administrator exactly as a supplier or fleet does.
   */
  @Post('insurance')
  async registerInsurer(
    @Req() req: UserRequest,
    @Body(validatedBody(RegisterInsurerBody)) parsed: RegisterInsurerBody,
  ) {
    const subject = await this.subjectOf(req);
    try {
      const created = await this.memberships.registerInsurer(
        subject,
        parsed.insurerName,
        parsed.locationName,
      );
      // 085 — mirrors migration 085's `register_insurer`, which now writes the
      // ORG ADMIN. This literal is a REPORT of what the database did, so it is
      // wrong the moment it disagrees with the function; `verify/085` asserts
      // the function's side and `registration.controller` carries this side.
      return { ...created, roleName: 'insurance_owner', verificationStatus: 'pending' };
    } catch (err) {
      // 🔴 THE DATABASE'S REFUSAL MUST REACH THE USER AS AN ANSWER, NOT A 500.
      // `registerWorkshop` shipped that exact defect: a double-submitted form
      // returned "Internal server error" for a guard that had worked perfectly,
      // and the person concluded registration was broken when it had already
      // succeeded. Matched on the messages 080 raises; both strings are quoted
      // in the migration, so a rewording falls back to a 500 rather than
      // drifting unnoticed into a silently-wrong error page.
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('already belongs to an organisation')) {
        throw new ConflictException(
          'This account already belongs to an organisation. Sign in with a different account to register an insurance company, or ask a platform administrator to add you to an existing one.',
        );
      }
      if (message.includes('no active application user')) {
        throw new BadRequestException('This account is not active.');
      }
      if (message.includes('an insurance company needs a name')) {
        throw new BadRequestException('An insurance company needs a name.');
      }
      throw err;
    }
  }

  /**
   * `POST /registration/towing` — register my towing company.
   *
   * 🔴 THE FIFTH ROLE THAT COULD NOT EXIST. Identical reasoning to the insurer
   * route above, and the towing pack is the sharper example: migration 074
   * built towing end to end and all 10 of its screens on 2026-08-09, and
   * `towing_operator` still had no production writer. Ten working screens for
   * a role nobody could hold.
   */
  @Post('towing')
  async registerTowingOperator(
    @Req() req: UserRequest,
    @Body(validatedBody(RegisterTowingBody)) parsed: RegisterTowingBody,
  ) {
    const subject = await this.subjectOf(req);
    try {
      const created = await this.memberships.registerTowingOperator(
        subject,
        parsed.companyName,
        parsed.locationName,
      );
      // 085 — see the insurance route above; the founder is the firm's admin.
      return { ...created, roleName: 'towing_owner', verificationStatus: 'pending' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('already belongs to an organisation')) {
        throw new ConflictException(
          'This account already belongs to an organisation. Sign in with a different account to register a towing company, or ask a platform administrator to add you to an existing one.',
        );
      }
      if (message.includes('no active application user')) {
        throw new BadRequestException('This account is not active.');
      }
      if (message.includes('a towing company needs a name')) {
        throw new BadRequestException('A towing company needs a name.');
      }
      throw err;
    }
  }

  /**
   * `POST /registration/customer` — become a customer of a workshop.
   *
   * 🔴 THE ROUTE THAT WAS MISSING, AND ITS ABSENCE MADE THE WHOLE CUSTOMER
   * VALUE CHAIN UNREACHABLE ON PRODUCTION. Before this, nothing in the product
   * could create a `customer` membership, so a signed-up person hit 401 on
   * every customer route. See `CustomerEnrolmentService` for the measurement.
   *
   * ⚠️ ON `UserGuard`, NECESSARILY. The caller has no membership yet — that is
   * the entire point — so `TenantGuard` would refuse the exact person this
   * route exists for. What makes that safe is stated in migration 061: the role
   * is a literal and not a parameter, the workshop must have published itself
   * in the mechanic directory, an account that already holds a role there is
   * returned unchanged or refused, and the RLS door pins the new row to the
   * caller's own user id.
   *
   * ⚠️ THE BODY NAMES A WORKSHOP AND NOTHING ELSE. No role, no user id, no
   * display name — all three come from the validated token or from the
   * database. A `roleName` field here would be privilege escalation as a REST
   * call.
   *
   * Idempotent: the funnel calls it on every visit to a workshop's Request for
   * Service page, and `created` says whether anything actually changed.
   */
  @Post('customer')
  async enrolAsCustomer(
    @Req() req: UserRequest,
    @Body(validatedBody(EnrolAsCustomerBody)) parsed: EnrolAsCustomerBody,
  ) {
    const header = req.headers.authorization ?? '';
    const verified = await this.jwt.verify(header.slice(7));
    return this.enrolment.enrol(
      verified.subject,
      parsed.organizationId,
      verified.name,
      verified.email,
    );
  }

  /**
   * The token subject for this request.
   *
   * `UserGuard` puts the resolved `appUserId` on the request but not the
   * subject, and the database functions key on the SUBJECT — deliberately, so
   * that no code path can pass a user id that did not come from a validated
   * signature. Re-verifying is a JWKS-cached signature check, not a round trip.
   */
  private async subjectOf(req: UserRequest): Promise<string> {
    const header = req.headers.authorization ?? '';
    const verified = await this.jwt.verify(header.slice(7));
    return verified.subject;
  }
}
