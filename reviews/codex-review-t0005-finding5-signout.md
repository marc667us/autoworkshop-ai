# Codex security review — T-0005 finding 5 (sign-out revocation)

**Commit reviewed:** `32e5f50` against parent `1d10bd5`
**Date:** 2026-07-28 · **Backend:** Codex CLI 0.137.0, `-s read-only`, scoped to the diff

## Verdict

Codex emitted **no CRITICAL and no HIGH**. It raised **two MEDIUM** findings and,
as in the plan reviews, **did not emit the requested `VERDICT:` line** — recorded
as substance rather than dressed up as an approval it did not give.

Both findings were accepted and fixed in `HEAD`. Neither was cosmetic; the first
is a real attack.

## M1 — an https session could be shadowed by the non-secure cookie name

`readSessionToken()` tried `secureCookie: false` first and accepted whichever
name decrypted. My own comment argued this was safe because "the cookie name is
the decryption salt, so a wrong name yields nothing rather than the wrong
identity". **That argument is incomplete and the conclusion was wrong.**

It answers "can a garbage cookie be misread" (no) and not "can an attacker plant
a VALID one" (yes). The `__Secure-` prefix exists precisely because a plain-http
origin — a sibling subdomain, a hostile network on first contact — can write a
cookie that an https origin will subsequently send. Preferring the unprefixed
name on https lets an attacker plant *their own* valid session under
`authjs.session-token`; the victim's browser adopts it and never sees a login
screen. That is session fixation.

**Fixed:** the cookie name is now chosen from the request SCHEME (`AUTH_URL`,
else `x-forwarded-proto`) — the same signal Auth.js itself uses. On https the
prefixed cookie is the **only** one honoured, with no fallback. The fallback
survives on plain http alone, where no `__Secure-` cookie can exist and the
prefix guarantees nothing anyway.

Note the fallback could not simply be "try the primary, then the other": on https
a victim with no session would still adopt a planted one. Non-negotiable: on
https, one name.

## M2 — Sign out vanished when `/me` failed, while the session was still live

`AccountControl` decided Sign in vs Sign out from `userLabel`, which comes from
`GET /api/v1/me`. `viewer.ts` correctly degrades to `null` when the API is
unreachable — but that was being read as "signed out", so a viewer holding a
perfectly valid Keycloak session was shown **Sign in** and had no way to end it.
An API outage is exactly when someone most wants to end a session.

**Fixed:** `hasSession()` on `WorkspaceAuth`, surfaced as `viewerHasSession()`,
reads the session cookie with no network call and no expiry check (an expired
access token still has a refresh token to revoke and an SSO session to end). The
seven layouts resolve viewer and session in parallel and pass `signedIn`
explicitly. `userLabel` is now used only for the accessible name.

This is the same defect class I had already fixed once in this commit —
`viewerLabels(null).userLabel` being the string `'Sign in'` — and I did not
generalise it. Codex did.

## What Codex did not do

- It did not run the tests (read-only sandbox, and the identity journey needs a
  live Keycloak + API). Verification is mine.
- It did not answer questions 1, 4, 5, 6 or 7 explicitly. Of those, 5 (the React
  18 `action` cast) is the one worth an independent look, and it was settled by
  measurement instead: the built page emits `$ACTION_ID_…`, so the server action
  serialises and the cast is a types gap, not a runtime one.

## Verification after the fixes

- typecheck 15/15 · lint 15/15 · unit **140**
- identity journey **2/2** against a fresh build + real Keycloak
- refresh-grant A/B re-run: with sign-out → `HTTP 400 invalid_grant, Session not active`
