import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { MembershipRepository } from '../identity/membership.repository';
import { KeycloakJwtService } from './keycloak-jwt.service';

export interface UserRequest extends Request {
  /** The `identity.users.id` behind the validated token. Never client-supplied. */
  appUserId: string;
}

/**
 * Authentication WITHOUT tenancy — the gate for the marketplace.
 *
 * ⚠️ THIS IS NOT A RELAXED `TenantGuard`, AND IT MUST NOT BE USED FOR WORKSHOP
 * DATA. `TenantGuard` proves who you are AND which single organisation you are
 * acting in; every route it protects reads tenant-owned tables. This guard
 * proves only who you are, and the routes it protects read
 * `catalogue.orders`, whose RLS predicate is the USER, not the tenant.
 *
 * It exists because `TenantGuard` would reject exactly the people the
 * marketplace is for. A vehicle owner buying a filter holds no membership, so
 * `resolveTenantContext` has nothing to resolve and refuses the request. Using
 * `TenantGuard` here would 401 every private buyer; inventing a tenant for them
 * would put a fake organisation into the isolation model that everything else
 * depends on being true.
 *
 * The safety argument is NOT that this guard is careful. It is that a request
 * authenticated here never receives a tenant context, so `DatabaseService.withUser`
 * leaves `app.tenant_id` unset and every tenant-owned table returns zero rows.
 * If a route on this guard is ever pointed at a workshop table, the failure is
 * an empty response, not a leak.
 *
 * Both guards resolve the user the same way — verify the token signature,
 * issuer, audience, expiry and algorithm, then look the subject up in
 * `identity.users`. Neither ever reads an identity from the request body.
 */
@Injectable()
export class UserGuard implements CanActivate {
  constructor(
    private readonly jwtService: KeycloakJwtService,
    private readonly memberships: MembershipRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<UserRequest>();

    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing bearer token');
    }

    const verified = await this.jwtService.verify(header.slice(7));

    // `memberships_for_subject` LEFT JOINs memberships, so an active user with
    // NO membership still returns one row — which is precisely the buyer this
    // guard exists for. A null here means no active application user for a
    // valid token, which is refused: authentication is not authorization.
    const record = await this.memberships.findByKeycloakSubject(verified.subject);
    if (!record) {
      throw new UnauthorizedException('no application user for this identity');
    }

    req.appUserId = record.userId;
    return true;
  }
}
