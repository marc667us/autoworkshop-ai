# Keycloak — AutoWorkshop realm

Identity is Keycloak (ADR-005 — mandatory; there is no alternative auth product).
The realm is **configuration as code**: reproducible, reviewable in a diff, and restorable after loss.

**Own realm, never Solar's** (ADR-011 / D2a). A shared realm would entangle identity data between two
applications that must be able to fail independently.

```bash
KEYCLOAK_ADMIN=admin KEYCLOAK_ADMIN_PASSWORD=... bash infrastructure/keycloak/import-realm.sh
```

Idempotent: creates the realm if absent, updates in place if present. For a clean rebuild,
`kcadm delete realms/autoworkshop` first — note that *update* does not remove roles or clients that were
deleted from the JSON.

## Files

| File | Purpose |
|---|---|
| `realm-autoworkshop.json` | Realm, 30 roles, 8 clients |
| `client-scope-audience.json` | The audience scope — **must stay out of the realm JSON**, see below |
| `import-realm.sh` | Import + post-import scope wiring |

## Two traps that cost real debugging time

**1. A `clientScopes` array in the realm JSON REPLACES Keycloak's built-in scopes.**
Declaring the audience scope inline left the realm with only 2 scopes — no `profile`, `email`, `roles`,
`web-origins`, `acr` or `basic`. Tokens then carried **no `realm_access.roles` claim**, so the API could
not have authorized anything. It looked fine in the config; it was broken in the token.
The audience scope is therefore created *after* import, from its own file, and standard scopes are
attached per client by the script.

**2. `defaultDefaultClientScopes` has the same replacement problem.**
At realm-creation time the built-in scopes do not exist yet, so an explicit list replaces the defaults
with only whatever already exists. Removed; Keycloak seeds its own.

Both were found by **listing the realm's actual scopes and decoding a real token** — not by reading the
configuration back, which reported success either way.

## Security settings (verified against a live realm)

| Setting | Value | Source |
|---|---|---|
| Access token lifetime | 300 s | `1.txt` §11 short-lived tokens |
| Refresh token rotation | `revokeRefreshToken`, `refreshTokenMaxReuse: 0` | §11 reuse detection |
| Brute force | on, 5 failures, 15 min max wait | `1.txt` §13 |
| Password policy | 12 chars, upper/lower/digit/special, history 3 | §13 |
| PKCE | `S256` on all 7 public clients | §11 — a browser cannot keep a secret |
| API client | `bearerOnly` — validates tokens, never initiates login | it is an audience, not a client |
| Audience | tokens carry `aud: autoworkshop-api` | `0.txt` §16 audience-restricted tokens |
| Events | login, logout, register, password, token errors; 30-day retention | `1.txt` §55 |

## There is deliberately NO tenant claim in the token

Tenant context is resolved **server-side from membership records** (`1.txt` §9: *"never trust a tenant
identifier supplied only by the client"*). A `tenant_id` baked into a token becomes a stale, client-carried
value the moment memberships change — and it would move the isolation boundary into a bearer token.
See `apps/api/src/tenancy/tenant-context.ts` and `docs/04-security/TENANT_ISOLATION.md`.

## Verified end to end

A real token was minted and decoded (test user and the temporary password grant both removed afterwards):

```
aud          : ['autoworkshop-api', 'account']
realm roles  : ['mechanic']
email        : claims.test@example.com
scope        : email profile autoworkshop-audience
tenant claim : ABSENT  ← correct
lifetime     : 300 seconds
```

The password-history policy also proved itself by refusing to re-set the same password.

## Windows note

`kcadm` runs inside the container, so Git Bash must not rewrite container paths:
`MSYS_NO_PATHCONV=1 docker exec …`. Without it, MSYS turns `/opt/keycloak/bin/kcadm.sh` into
`C:/Program Files/Git/opt/keycloak/bin/kcadm.sh`. The *local* side of `docker cp` needs the opposite
treatment — `cygpath -w`.

## Backup

`1.txt` §32 requires a realm export daily and after any material change. The canonical source is this
directory in git; runtime exports are an operational backup, not the source of truth.
