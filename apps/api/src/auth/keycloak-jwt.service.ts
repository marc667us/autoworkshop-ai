import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';

export interface VerifiedToken {
  /** Keycloak subject — the ONLY identity input we trust from the token. */
  subject: string;
  email?: string;
  /**
   * The display name, from the `name` claim (Keycloak's `profile` scope).
   *
   * Read ONLY to populate `identity.users.display_name` on first sign-in
   * (migration 036). It is a LABEL, never an identity: the row is keyed on
   * `subject`, and two people may legitimately share a name. Optional because a
   * client can be configured without the `profile` scope, in which case the
   * database falls back rather than refusing the sign-in.
   */
  name?: string;
  realmRoles: string[];
}

/**
 * Keycloak access-token verification.
 *
 * Every check below has a specific attack it prevents, so none of them are
 * optional:
 *
 *   signature  — a token minted by anyone else
 *   issuer     — a valid token from a DIFFERENT realm (Solar's, for instance),
 *                which is precisely the entanglement ADR-011 forbids
 *   audience   — a token minted for another client being replayed at this API
 *                (`0.txt` §16 audience-restricted tokens)
 *   expiry     — replay of an old token
 *   algorithm  — the `alg: none` and HS/RS confusion attacks; only RS256 is
 *                accepted, so an attacker cannot downgrade to a symmetric
 *                algorithm and sign with the public key
 */
@Injectable()
export class KeycloakJwtService {
  private jwks!: JwksClient;
  private issuer!: string;
  private audience!: string;

  constructor(private readonly config: ConfigService) {}

  private init(): void {
    if (this.jwks) return;
    const base = this.config.get<string>('KEYCLOAK_URL') ?? 'http://localhost:8080';
    const realm = this.config.get<string>('KEYCLOAK_REALM') ?? 'autoworkshop';
    this.issuer = `${base.replace(/\/$/, '')}/realms/${realm}`;
    this.audience = this.config.get<string>('KEYCLOAK_AUDIENCE') ?? 'autoworkshop-api';
    this.jwks = new JwksClient({
      jwksUri: `${this.issuer}/protocol/openid-connect/certs`,
      cache: true,
      cacheMaxAge: 600_000,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
  }

  async verify(token: string): Promise<VerifiedToken> {
    this.init();

    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
      throw new UnauthorizedException('malformed token');
    }

    let key: string;
    try {
      const signingKey = await this.jwks.getSigningKey(decoded.header.kid);
      key = signingKey.getPublicKey();
    } catch {
      throw new UnauthorizedException('unknown signing key');
    }

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, key, {
        algorithms: ['RS256'], // never 'none', never HS*
        issuer: this.issuer,
        audience: this.audience,
      }) as jwt.JwtPayload;
    } catch (err) {
      throw new UnauthorizedException(
        `token rejected: ${(err as Error).message}`,
      );
    }

    if (!payload.sub) {
      throw new UnauthorizedException('token has no subject');
    }

    // Roles are read for observability and coarse checks only. Authorization
    // uses the ACTIVE role from the membership record, not this list — a token
    // role set can be stale relative to a membership that was just revoked.
    const realmRoles: string[] =
      (payload['realm_access'] as { roles?: string[] } | undefined)?.roles ?? [];

    return {
      subject: payload.sub,
      email: typeof payload['email'] === 'string' ? payload['email'] : undefined,
      // `name` when the profile scope is present; otherwise the username, which
      // this realm sets to the email (`registrationEmailAsUsername`). Both are
      // labels only — see the interface.
      name:
        typeof payload['name'] === 'string'
          ? payload['name']
          : typeof payload['preferred_username'] === 'string'
            ? payload['preferred_username']
            : undefined,
      realmRoles,
    };
  }
}
