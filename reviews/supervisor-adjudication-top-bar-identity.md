# Supervisor adjudication — top-bar identity (user name + acting-as role)

**Date:** 2026-08-03
**Change:** the top bar names the right person and states the viewer's role.
**Reviewer:** Codex CLI (3 findings) · **Adjudicator:** Supervisor, independently.

Per `feedback_never_bypass_codex` and the owner's 2026-07-26 direction — *"Codex
is the reviewer, the Supervisor is the adjudicator"* — every finding was checked
against source and against the running app rather than accepted or dismissed.

---

## Codex finding 1 — HIGH: "single-role viewers still get no role shown"

**Verdict: REFUTED by measurement.** The reasoning is correct for plain React and
wrong for this codebase, and the distinction is worth writing down because it is
subtle enough to be re-derived incorrectly next time.

Codex's argument: `TopNav.tsx` chooses with `roleControl ?? <Selector …>`; the
layouts pass `roleControl={<ActingAsControl viewer={viewer} />}`; a JSX element
is a non-null object regardless of what the component returns; therefore `??`
never falls through, and `ActingAsControl` returning `null` below two roles
leaves the viewer with neither switcher nor chip.

Why it does not hold here:

- `packages/next-shell/src/ActingAsControl.tsx` has **no `'use client'`** — it is
  a **server** component.
- `apps/*/app/layout.tsx` are server components.
- `packages/next-shell/src/WorkspaceShell.tsx` **is** `'use client'`.

So the element crosses an RSC boundary: React renders `ActingAsControl` on the
server and serialises only its **output** to the client shell. `roleControl`
therefore arrives at `TopNav` as a genuine `null`, and `??` falls through as
intended.

**Evidence, not argument** — `manager@autoworkshop.local` holds exactly one
membership (one role, one organisation), which is precisely the account Codex
named as the failure case:

```
manager  ☰ | AutoWorkshop AI | Workshop | Alpha Motors | Alpha Accra | …
         | Dev Workshop Manager | Workshop manager | Sign out | Switch user
```

Both chips render. `verify/verify-top-bar-identity.mjs` asserts the role is
stated **exactly once** for each of six identities and passes 38/38, five of
them via the chip and `owner@` (three roles) via the switcher.

**The fragility Codex surfaced is real and has been recorded.** The fallback is
load-bearing on `ActingAsControl` remaining a server component; adding
`'use client'` to it would silently remove the role from the top bar for every
single-role viewer, breaking no test that does not load a page. That invariant
is now a comment in the file, naming the consequence.

## Codex finding 2 — MEDIUM: "the organization fallback is suppressed the same way"

**Verdict: REFUTED, same mechanism, and it is pre-existing shipped behaviour.**
`ViewerSwitchers` is likewise a server component and has returned `null` below
two organisations since T-0016. The screenshot above shows `Alpha Motors` for a
single-organisation viewer — the chip renders. Had this finding been true, the
organisation chip would have been missing from every screenshot taken since
T-0016 shipped.

## Codex finding 3 — LOW: "comments claim a fallback rule the code does not have"

**Verdict: REFUTED — it follows from findings 1 and 2.** The comments describe
the behaviour the app demonstrably has. Noted with more care than usual because
"a comment claiming a rule the code does not have" is this repo's most repeated
defect class (four instances); here the comments are accurate and it is the
finding that was wrong.

## Codex checks that CONFIRMED the change

- **(b)** the role comes from the resolved `activeRole`, not from the matched
  membership row — `viewer-contract.ts`. Independently re-read: correct, and it
  matters, because `owner@` holds three roles in one organisation.
- **(c)** no dangling import or export from moving `RoleSwitcher`.
- **(d)** `role_title()` uses `tr` + POSIX `awk`, no GNU-only `sed \u`; the
  Keycloak name reconcile is correct.
- **(e)** no new authorization decision and no leak. Independently confirmed:
  every value shown already came from `/me`, the switcher still posts to a
  server action, and `resolveTenantContext` still refuses a role the viewer does
  not hold. Nothing here is a control — `packages/ui` renders what it is given.

## Supervisor's own findings, beyond Codex's list

1. **The seeded name is a `Dev …` string on purpose.** These accounts carry a
   published password. A plausible human name in the strip a user reads to check
   whose session they are in would be the same class of lie the old `'Sign in'`
   `userLabel` was.
2. **The chips sit in `.aw-topnav-secondary`**, so both step aside together
   below 767px. A phone therefore shows neither, rather than a name with no
   role — checked against the existing §68 breakpoint rules, unchanged.
3. **One API test, `security-posture.integration.spec.ts`, failed in the full
   turbo run and passed in isolation and on a clean re-run (667/667).** It is
   order-dependent flake, NOT caused by this change — the diff touches no file
   under `apps/api`. Recorded rather than silently re-run into green.

## Verdict

**SUPERVISOR VERDICT: PASS** — with the invariant from finding 1 written into
the source, which is the durable half of what that review was worth.
