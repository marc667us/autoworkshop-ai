# Supervisor adjudication — T-0005 finding 5 (sign-out revocation)

**Commits:** `32e5f50`, `39396ef` · **Date:** 2026-07-28
**Run independently of Codex**, per the 2026-07-25 precedent that Codex approved
something the Supervisor caught. It did so again: Codex raised two MEDIUMs, the
Supervisor raised **three more that Codex missed**, and one of them undoes the
entire point of the change.

## S1 (was Codex-missed) — sign-out could stop ending the Keycloak session

`keycloakSignOutUrl()` sent `id_token_hint` and **never `client_id`**. Keycloak
resolves which client's `post_logout_redirect_uri` allow-list to validate against
from `id_token_hint` **or** `client_id`; with neither it refuses the request and
**does not terminate the SSO session**.

The id token is not durable. `refreshAccessToken()` rebuilt the whole token set
and, unlike the refresh token, gave the id token no carry-forward:

```ts
refreshToken: payload.refresh_token ?? refreshToken,   // falls back
idToken: payload.id_token,                             // did NOT
```

So any refresh response omitting `id_token` stripped it permanently. From then
on sign-out cleared the local cookie, rendered the signed-out shell, reported
success — and left the Keycloak session alive. The next person at a shared
terminal clicks Sign in, completes silently, and lands in the previous
technician's account. **That is precisely the risk this change was written to
close, arriving minutes after login instead of never.**

Nothing would have caught it: `revokeRefreshToken()` returns `response.ok`, and
RFC 7009 mandates 200 even for an unrecognised token, so the one failure branch
that logs cannot see this.

**Fixed:** `client_id` is now always sent alongside `id_token_hint`, so logout is
self-validating regardless of id-token availability; and the id token is carried
forward across refreshes. Two tests pin each half.

## S2 — the `AUTH_URL` premise was false, and two comments asserted it

Both `origin.ts` and `isSecureRequest()` justified their behaviour with "`AUTH_URL`
is set per service". **`render.yaml` sets `NODE_VERSION`, `NODE_ENV`,
`SKIP_BUILD_CHECKS`, `AUTH_SECRET`, `AUTH_TRUST_HOST`, `KEYCLOAK_URL`,
`KEYCLOAK_REALM`, `API_BASE_URL` — and no `AUTH_URL`.** Verified directly.

That makes the header fallback a live code path rather than a corner. The code no
longer depends on the premise either way, and the comments no longer assert it.

**Fixed:** `postLogoutOrigin()` now parses the `Host` header with `new URL()` and
rejects anything carrying credentials, a path, a query or a fragment. `Host:
good.example.com:@evil.com` parses to authority `evil.com` while string-matching
a prefix check — the trick that turns "validated elsewhere" into an open redirect
off a post-authentication endpoint. Keycloak's allow-list remains the control;
this is the second one it should never have been without.

## S3 — the M1 fix was re-openable by a header

`isSecureRequest()` read `x-forwarded-proto.split(',')[0]` — the **client-most**
entry. That convention is right for `X-Forwarded-For` (you want the original
client IP) and inverts the trust model for a scheme used as a *trust* signal: the
value nearest the attacker wins. Behind any appending intermediary, a supplied
`X-Forwarded-Proto: http` yields `http, https`, the check returns false, and the
unprefixed cookie name is tried first on a genuine https deployment — reinstating
exactly the session fixation M1 removed.

**Fixed:** the **last** entry is read, and with no header at all the check now
**fails secure** — only a loopback host is assumed plain http. A missing or
manipulated header can now only make the check stricter.

## Deliberately NOT changed

- **`x-forwarded-proto` is still trusted when present.** With no configured
  origin there is no better signal, and the app cannot know its own proxy depth.
  Setting `AUTH_URL` on every service is the real fix — see follow-ups.
- **`console.warn` on a failed revocation, rather than failing the sign-out.**
  A user who cannot sign out because Keycloak is unreachable is left MORE exposed
  than one whose token outlives the session. Re-argue before changing.

## Confirmed clean by the Supervisor (recorded so it is not re-litigated)

- `redirect()` is not inside any `try/catch`; no path swallows `NEXT_REDIRECT`.
  `revokeRefreshToken` catches internally and returns `false`, so no exception
  skips revocation.
- The seven server actions hardcode their own workspace id, take no parameters,
  and `performSignOut` is not itself a `'use server'` export — the workspace id
  is not attacker-reachable.
- The `session` callback copies only `token.error`; no token reaches
  `/api/auth/session`. Asserted in the e2e spec.
- `keycloakSignOutUrl` builds via `new URL()` + `searchParams.set()` — no
  concatenation, no parameter injection.
- No `dangerouslySetInnerHTML` added; `userLabel` reaches only an `aria-label`.

## Follow-ups raised, NOT fixed here (recorded in TASK_QUEUE)

1. **`AUTH_URL` is absent from `render.yaml`.** Set it per service so neither the
   cookie-name decision nor the post-logout origin rests on a header.
2. **A realm/deployment mismatch to confirm:** `render.yaml` deploys
   `workshop-web` at `autoworkshop.aiappinvent.com`, while the
   `autoworkshop-workshop-web` client's `redirectUris` are `http://localhost:3001/*`
   and `https://workshop.autoworkshop.aiappinvent.com/*`. If that is what is live,
   the deployed origin is not in its own client's allow-list. Not exploitable
   today — no Keycloak is deployed, so production renders the signed-out shell —
   but sign-in and sign-out would both fail the moment identity goes live.
3. **No audit event on logout.** CLAUDE.md §9/§16 require one. This change made
   sign-out real and emits only a `console.warn` on the revocation-failure branch,
   so the one outcome that leaves a live credential behind exists in stdout alone.

## Verification after all fixes

- typecheck 15/15 · lint 15/15 · unit **144**
- identity journey **2/2** against a fresh build and a real Keycloak
- refresh-grant A/B: with sign-out → `HTTP 400 invalid_grant, Session not active`

**SUPERVISOR VERDICT: PASS** — with follow-ups 1–3 recorded and none of them
blocking, since production has no deployed identity yet.
