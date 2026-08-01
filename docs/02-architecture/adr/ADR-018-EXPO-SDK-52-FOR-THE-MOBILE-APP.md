# ADR-018 — Expo SDK 52 for the mobile app, and a public OIDC client with PKCE

**Date:** 2026-08-01
**Status:** Accepted

## Context

`COMBINED_PLAN_v2.md` §157 fixes the mobile stack as **React Native + Expo,
Android first**, and §305 schedules it in Phase 10 (Release 0.9). The owner
brought it forward: web progress was judged too slow and the mobile app had
never been started — `apps/mobile/` existed as an **empty directory**.

Two decisions had to be made before any code could be written.

### 1. Which Expo SDK

The workspace is a single pnpm workspace with one lockfile, pinned to
**React 18.3.1** and **Node 20.19.2**. pnpm is held at 9.15.4 because 10+
requires Node ≥22.13. Seven Next.js apps share those resolutions.

Measured against the registry rather than assumed:

| Expo SDK | React Native | React peer |
|---|---|---|
| 52.0.46 | 0.76.9 | `^18.2.0` |
| 53+ | 0.79+ | **19.x** |

Adopting SDK 53 or later would pull React 19 into a workspace whose seven web
apps are on React 18.3.1. In a shared lockfile that is not a contained change.

### 2. How the app authenticates

Keycloak is mandatory (ADR-005) and the realm already exists as config-as-code.
The question was which OAuth client type a shipped Android binary should be.

## Decision

**Expo SDK 52.0.46 with React Native 0.76.9 and React 18.3.1**, matching the
workspace exactly.

**A public OIDC client (`autoworkshop-mobile`) with mandatory PKCE (S256)**, the
authorization code flow in the **system browser**, tokens held in
**`expo-secure-store`** (Android Keystore).

Added to `infrastructure/keycloak/realm-autoworkshop.json` as config-as-code,
like every other client. Redirect target is the custom scheme
`autoworkshop://auth`; `webOrigins` is empty because there is no web origin.

## Alternatives considered

**Expo SDK 54 (current).** Rejected: React 19 against a React 18.3.1 workspace.
Not a mobile-only change — it is a change to every app sharing the lockfile.
Revisit when the web apps move to React 19, which is its own decision.

**A confidential client with a secret.** Rejected, and this is the important
one: **a shipped binary cannot keep a secret.** Anyone may pull the APK and read
any string compiled into it. RFC 8252 is explicit that native apps are public
clients and that PKCE, not a credential, is the protection. Embedding a secret
would create a shared credential published with every install that cannot be
rotated without shipping a release — worse than no secret at all, because it
would *look* like a control.

**Resource Owner Password Credentials (a password form in the app).** Rejected.
The app would handle the user's password directly, which makes every future
compromise of the binary a credential compromise and forecloses MFA and any
policy Keycloak enforces at its own login screen. The realm sets
`directAccessGrantsEnabled: false` on every client, so this cannot be built by
accident — that was already the right call and is left unchanged.

**A WebView instead of the system browser.** Rejected per RFC 8252 §8.12: the
app controls a WebView, so the user cannot see the address bar and has no way to
distinguish a real Keycloak login from a drawn imitation.

**`AsyncStorage` for tokens.** Rejected. It is an unencrypted SQLite file in the
app sandbox, readable from any backup that includes app data and on any rooted
device. A refresh token is a long-lived credential. `SecureStore` and
`AsyncStorage` have near-identical APIs, which is exactly why the weaker one
gets chosen by accident — recorded here so it is not.

**React Native CLI without Expo.** Rejected: it needs a full Android Studio
toolchain per developer and gives up `expo-auth-session`, `expo-secure-store`
and EAS's free build tier. Expo is FOSS and adds no paid dependency (ADR-012).

## ⚠️ Before this realm is used in production

`autoworkshop-mobile`'s `redirectUris` currently include two **development-only**
entries so the app can run under Expo Go:

```
exp://localhost:8081/*
exp://127.0.0.1:8081/*
```

**Both must be removed from the production realm**, leaving only
`autoworkshop://auth`. They are not a concrete vulnerability today — PKCE means
an intercepted authorization code cannot be exchanged without the verifier,
which is the whole reason RFC 8252 requires it — but a redirect target that
serves no production purpose is attack surface that does not need to exist. JSON
carries no comments, so the requirement is recorded here.

Also note the production realm does not exist yet: the live deployment has no
Keycloak service (see `.claude/NEXT_SESSION_START_HERE.md`). This is a
prerequisite for that work, not an outstanding production defect.

## Consequences

- The mobile app is pinned behind the current Expo release. Upgrading past SDK
  52 is blocked on the workspace's React 19 migration and must be taken as one
  decision, not seven.
- `newArchEnabled: true` is set — the New Architecture is the default from 0.76
  and starting on it avoids a later migration.
- **Zero cost.** Expo, React Native and Keycloak are all open source. Publishing
  to Google Play would need a developer account (~$25 one-time), which is a
  **spend decision for the owner alone** and is not assumed here.
- The install added 535 packages. Verified afterwards that React resolves to
  18.3.1 in both `admin-web` and `mobile`, and that the API, `admin-web` and
  `workshop-web` all still build.

## What is deliberately NOT built yet

Offline-first sync (`packages/offline-sync` is still an empty directory), a
navigation stack, camera capture for inspection evidence, and push
notifications. Each is a slice of its own within Phase 10. `05.txt` §2 prohibits
disconnected mock pages, so the first screen shows real job cards from the real
API or an honest failure — not a convincing shell over fixtures.
