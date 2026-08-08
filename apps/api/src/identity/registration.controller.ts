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
