# Contributing — AutoWorkshop AI

## Branches

`master` production-ready · `develop` integration · `feature/*` short-lived.
Never commit directly to `master`.

## Commits

Conventional commits: `feat(scope):` `fix(scope):` `chore(scope):` `docs(scope):` `test(scope):`
`refactor(scope):`. Explain **why**, not just what.

## Pull requests

Required before merge: automated tests pass · code review · security checks pass · build succeeds.

## Definition of complete (`05.txt` §6)

A task is not complete until: the page renders · the API works · permissions are enforced · the migration
runs · tests pass · lint and typecheck pass · the Playwright journey passes · responsive behaviour is
checked · docs are updated · **no paid dependency was introduced** · it is committed.

## Hard rules

1. **Never introduce a paid dependency** (ADR-012). CI fails the build.
2. **Never reference or import from the Solar app** (ADR-011). CI fails the build.
3. **Never give an agent a privileged credential** (ADR-010). CI fails the build.
4. **Never trust a client-supplied tenant id.** Derive it from validated claims.
5. **No `VARCHAR(n)` on free text; no `CREATE TABLE IF NOT EXISTS` in boot code.**

## Review chain

Claude implements -> Codex reviews -> Supervisor audits -> Scheduler queues follow-ups.
A feature is not complete until all four gates pass.
