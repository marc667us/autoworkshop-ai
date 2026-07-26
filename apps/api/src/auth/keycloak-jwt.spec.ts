import { describe, expect, it, beforeAll } from 'vitest';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { generateKeyPairSync } from 'node:crypto';
import { KeycloakJwtService } from './keycloak-jwt.service';

/**
 * Token verification security tests.
 *
 * Each case is an attack that must fail. These use a locally generated key pair
 * and stub the JWKS lookup, so they run without Keycloak and still exercise the
 * real `jsonwebtoken` verification path — the code that actually decides
 * whether a request is authenticated.
 */
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const ISSUER = 'http://localhost:8080/realms/autoworkshop';
const AUDIENCE = 'autoworkshop-api';

function makeService(): KeycloakJwtService {
  const config = new ConfigService({
    KEYCLOAK_URL: 'http://localhost:8080',
    KEYCLOAK_REALM: 'autoworkshop',
    KEYCLOAK_AUDIENCE: AUDIENCE,
  });
  const svc = new KeycloakJwtService(config);
  // Stub only the network lookup; all verification logic stays real.
  (svc as unknown as { jwks: unknown }).jwks = {
    getSigningKey: async () => ({ getPublicKey: () => publicKey }),
  };
  (svc as unknown as { issuer: string }).issuer = ISSUER;
  (svc as unknown as { audience: string }).audience = AUDIENCE;
  return svc;
}

const sign = (payload: object, opts: jwt.SignOptions = {}): string =>
  jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    keyid: 'test-key',
    expiresIn: '5m',
    issuer: ISSUER,
    audience: AUDIENCE,
    ...opts,
  });

let svc: KeycloakJwtService;
beforeAll(() => {
  svc = makeService();
});

describe('KeycloakJwtService', () => {
  it('accepts a correctly signed token', async () => {
    const token = sign({ sub: 'user-123', email: 'a@b.c', realm_access: { roles: ['mechanic'] } });
    const v = await svc.verify(token);
    expect(v.subject).toBe('user-123');
    expect(v.realmRoles).toContain('mechanic');
  });

  it('SECURITY: rejects a token signed by a different key', async () => {
    const { privateKey: attacker } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const forged = jwt.sign({ sub: 'attacker' }, attacker, {
      algorithm: 'RS256', keyid: 'test-key', expiresIn: '5m',
      issuer: ISSUER, audience: AUDIENCE,
    });
    await expect(svc.verify(forged)).rejects.toThrow(/token rejected/);
  });

  it('SECURITY: rejects alg=none (unsigned token)', async () => {
    // The classic JWT downgrade. If this ever passes, anyone can mint identity.
    const unsigned = jwt.sign({ sub: 'attacker', iss: ISSUER, aud: AUDIENCE }, '', {
      algorithm: 'none' as jwt.Algorithm,
      keyid: 'test-key',
    });
    await expect(svc.verify(unsigned)).rejects.toThrow();
  });

  it('SECURITY: rejects a token from a DIFFERENT realm', async () => {
    // A valid Solar token must not authenticate here. This is ADR-011
    // non-entanglement enforced at the token layer.
    const otherRealm = sign({ sub: 'user-123' }, { issuer: 'http://localhost:8080/realms/solar' });
    await expect(svc.verify(otherRealm)).rejects.toThrow(/token rejected/);
  });

  it('SECURITY: rejects a token minted for another audience', async () => {
    const wrongAud = sign({ sub: 'user-123' }, { audience: 'some-other-client' });
    await expect(svc.verify(wrongAud)).rejects.toThrow(/token rejected/);
  });

  it('SECURITY: rejects an expired token', async () => {
    const expired = sign({ sub: 'user-123' }, { expiresIn: '-1s' });
    await expect(svc.verify(expired)).rejects.toThrow(/token rejected/);
  });

  it('SECURITY: rejects a token with no subject', async () => {
    await expect(svc.verify(sign({ email: 'a@b.c' }))).rejects.toThrow(/no subject/);
  });

  it('rejects a malformed token', async () => {
    await expect(svc.verify('not-a-jwt')).rejects.toThrow(/malformed token/);
  });
});
