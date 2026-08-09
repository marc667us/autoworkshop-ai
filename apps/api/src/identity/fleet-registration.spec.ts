import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { RegistrationController, RegisterFleetBody } from './registration.controller';
import { validatedBody } from '../common/validation/validated-body';

/**
 * `POST /registration/fleet` — the door that lets a `fleet_administrator` exist.
 *
 * 🔴 WHY THIS FILE EXISTS AT ALL. The supplier and workshop registration routes
 * shipped with no unit coverage of either of the two things below, and both are
 * the kind of defect that passes typecheck, lint and a green deploy:
 *
 *   · the body schema is the ONLY thing standing between a self-service sign-up
 *     and privilege escalation as a REST call, and
 *   · the database's refusals reach the user as 500s unless they are mapped,
 *     which `registerWorkshop` actually shipped — a double-submitted form
 *     returned "Internal server error" for a guard that had worked perfectly,
 *     and the person concluded registration was broken when it had succeeded.
 *
 * Matching the absence would have been the easy call. These assert the two
 * properties instead.
 */

/** A controller with every dependency stubbed — none of these tests touch a DB. */
function controllerWith(registerFleet: (...args: unknown[]) => Promise<unknown>) {
  const memberships = { registerFleet } as never;
  const jwt = { verify: vi.fn() } as never;
  const enrolment = { enrol: vi.fn() } as never;
  const controller = new RegistrationController(memberships, jwt, enrolment);
  // `subjectOf` reads the request's verified subject; the route under test only
  // passes it through, so a fixed value keeps these tests about the mapping.
  (controller as unknown as { subjectOf: () => Promise<string> }).subjectOf = async () =>
    'keycloak-subject-under-test';
  return controller;
}

const body = { fleetName: 'Accra Logistics Fleet Ltd' };

/**
 * 🔴 THE BODY SCHEMA IS THE WHOLE PRIVILEGE BOUNDARY OF THIS ROUTE.
 *
 * It sits on `UserGuard`, not `TenantGuard`, because the caller has no
 * membership yet — that is the entire situation it exists for. What makes that
 * safe is that nothing in the body can name a role, a user or an organisation.
 * A `roleName` field accepted "for later" would turn a self-service sign-up into
 * privilege escalation as a REST call.
 *
 * ⚠️ RUN AGAINST THE EXPORTED SCHEMA THE ROUTE ACTUALLY USES. Rebuilding an
 * equivalent object here would prove the copy is strict and say nothing about
 * the real one.
 */
describe('the fleet body cannot carry a role, a user, or anything else', () => {
  const pipe = validatedBody(RegisterFleetBody);
  // Nest's `PipeTransform` declares `transform(value, metadata)`. The concrete
  // pipe ignores the metadata, but the interface requires it at the call site —
  // and `pnpm typecheck` is a blocking gate, so omitting it fails the build
  // rather than being quietly tolerated.
  const BODY_META = { type: 'body' } as const;

  it('accepts the two legitimate fields', () => {
    expect(pipe.transform({ fleetName: 'Accra Logistics Fleet Ltd' }, BODY_META)).toMatchObject({
      fleetName: 'Accra Logistics Fleet Ltd',
    });
    expect(
      pipe.transform({ fleetName: 'Accra Logistics Fleet Ltd', locationName: 'Tema depot' }, BODY_META),
    ).toMatchObject({ locationName: 'Tema depot' });
  });

  it('REFUSES a body carrying roleName — the escalation this route would otherwise allow', () => {
    expect(() =>
      pipe.transform({ fleetName: 'Accra Logistics Fleet Ltd', roleName: 'platform_administrator' }, BODY_META),
    ).toThrow(BadRequestException);
  });

  it('REFUSES a body naming somebody else', () => {
    expect(() =>
      pipe.transform({ fleetName: 'Accra Logistics Fleet Ltd', userId: 'another-persons-id' }, BODY_META),
    ).toThrow(BadRequestException);
    expect(() =>
      pipe.transform({
        fleetName: 'Accra Logistics Fleet Ltd',
        organizationId: '11111111-1111-1111-1111-111111111111',
      }, BODY_META),
    ).toThrow(BadRequestException);
  });

  it('REFUSES a name too short to be one', () => {
    expect(() => pipe.transform({ fleetName: 'A' }, BODY_META)).toThrow(BadRequestException);
    expect(() => pipe.transform({}, BODY_META)).toThrow(BadRequestException);
  });
});

describe('POST /registration/fleet — the role is a literal, never an argument', () => {
  it('passes the token subject and the name through, and never a role', async () => {
    const registerFleet = vi.fn().mockResolvedValue({
      tenantId: 't', organizationId: 'o', branchId: 'b', membershipId: 'm',
    });
    const result = await controllerWith(registerFleet).registerFleet(
      {} as never,
      body as never,
    );

    // 🔴 THE SUBJECT COMES FROM THE VERIFIED TOKEN, NOT THE BODY. A user id
    // accepted here would let anyone register a fleet as somebody else.
    expect(registerFleet).toHaveBeenCalledWith(
      'keycloak-subject-under-test',
      'Accra Logistics Fleet Ltd',
      undefined,
    );

    // The role is asserted by the ROUTE, not chosen by the caller — migration
    // 075 hard-codes it and this response merely reports what was created.
    expect(result).toMatchObject({
      roleName: 'fleet_administrator',
      // ⚠️ AND THE WAIT IS STATED. 075 widened the verification queue to accept
      // a fleet; a sign-up that quietly does half of what the person expects is
      // worse than one that explains itself.
      verificationStatus: 'pending',
    });
  });

  /**
   * 🔴 THESE THREE ARE THE DATABASE'S OWN WORDS, and the coupling is deliberate
   * — the strings are quoted in migration 075. If the migration is reworded the
   * mapping silently falls back to a 500, and these tests are what turns that
   * from a live mystery into a red build.
   */
  it('turns "already belongs to an organisation" into a 409, not a 500', async () => {
    const controller = controllerWith(
      vi.fn().mockRejectedValue(
        new Error(
          'this account already belongs to an organisation. Sign in with a different account to register a fleet, or ask a platform administrator to add you to an existing fleet.',
        ),
      ),
    );
    await expect(controller.registerFleet({} as never, body as never)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('turns "no active application user" into a 400, not a 500', async () => {
    const controller = controllerWith(
      vi.fn().mockRejectedValue(new Error('no active application user for this identity')),
    );
    await expect(controller.registerFleet({} as never, body as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('turns "a fleet needs a name" into a 400, not a 500', async () => {
    const controller = controllerWith(
      vi.fn().mockRejectedValue(new Error('a fleet needs a name')),
    );
    await expect(controller.registerFleet({} as never, body as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  /**
   * ⚠️ AN UNRECOGNISED FAILURE MUST STAY A 500. Mapping everything to a 4xx
   * would tell a user their details were wrong when the database was down — and
   * would hide a real fault behind a message that invites them to retype a
   * perfectly good form.
   */
  it('lets an unrecognised error through as itself', async () => {
    const boom = new Error('connection terminated unexpectedly');
    const controller = controllerWith(vi.fn().mockRejectedValue(boom));
    await expect(controller.registerFleet({} as never, body as never)).rejects.toBe(boom);
  });
});
