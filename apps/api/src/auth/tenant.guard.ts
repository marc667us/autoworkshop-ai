import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { MembershipRepository } from '../identity/membership.repository';
import {
  resolveTenantContext,
  TenantResolutionError,
  type TenantContext,
} from '../tenancy/tenant-context';
import { KeycloakJwtService } from './keycloak-jwt.service';

export interface AuthenticatedRequest extends Request {
  tenantContext: TenantContext;
}

/**
 * The single gate between an HTTP request and tenant data.
 *
 * Order matters and is deliberate:
 *
 *   1. verify the token signature, issuer, audience, expiry and algorithm
 *   2. look up memberships by the token SUBJECT
 *   3. resolve exactly one active tenant context from those memberships
 *
 * Step 3 never reads a tenant id from the request. The client may name an
 * ORGANIZATION it wants to act in (the workspace switcher), and that value is
 * used only to select among memberships the server has already proved the user
 * holds. Naming an organization the user is not a member of is refused, not
 * silently downgraded to a default — a silent fallback would mask an
 * authorization probe (`1.txt` §9).
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly jwtService: KeycloakJwtService,
    private readonly memberships: MembershipRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing bearer token');
    }

    const verified = await this.jwtService.verify(header.slice(7));

    let record = await this.memberships.findByKeycloakSubject(verified.subject);
    if (!record) {
      // 🔴 SIGN-UP, AND THIS GUARD STILL REFUSES THEM AFTERWARDS — deliberately.
      //
      // A valid Keycloak token whose subject has no application user. Since
      // 2026-08-03 the user is CREATED here (owner: "users must sign up via
      // kc") rather than rejected, because rejecting made a Keycloak sign-up
      // produce an account that could not use the application at all.
      //
      // ⚠️ Creating the user does NOT let this request through. It grants no
      // membership, so `resolveTenantContext` below finds nothing to resolve and
      // throws "user holds no active membership" — which is the correct answer
      // for someone who has signed up but does not yet belong to a workshop, and
      // a far more actionable one than "no application user for this identity".
      // Authentication is still not authorization; what changed is that the
      // person now EXISTS, so they can register a workshop through the routes on
      // `UserGuard` and come back holding a membership.
      await this.memberships.provisionUser(
        verified.subject,
        verified.email,
        verified.name,
      );
      record = await this.memberships.findByKeycloakSubject(verified.subject);
      if (!record) {
        // Provisioned and still unresolvable = a SUSPENDED account.
        // `provision_user_from_subject` never reactivates, and
        // `memberships_for_subject` filters on `status = 'active'`.
        throw new UnauthorizedException('this account is not active');
      }
    }

    // Correlation id ties the HTTP request, the database transaction and the
    // audit row together (`1.txt` §28).
    const correlationId =
      (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID();

    const requestedOrganizationId =
      (req.headers['x-organization-id'] as string | undefined) ?? undefined;

    // The ROLE switcher — one login acting as any role it actually holds,
    // without signing out. Read exactly like the organisation above, and
    // trusted exactly as little: `resolveTenantContext` uses it only to select
    // among memberships already proved from the token subject, and REFUSES a
    // role the user does not hold rather than downgrading to one they do.
    const requestedRoleName =
      (req.headers['x-role-name'] as string | undefined)?.trim() || undefined;

    try {
      req.tenantContext = resolveTenantContext({
        userId: record.userId,
        memberships: record.memberships,
        requestedOrganizationId,
        requestedRoleName,
        correlationId,
      });
    } catch (err) {
      if (err instanceof TenantResolutionError) {
        throw new UnauthorizedException(err.message);
      }
      throw err;
    }

    return true;
  }
}
