# Codex review — T-0030 diagnosis and e2e harness fixes

**Date:** 2026-07-27
**Reviewed:** `apps/e2e/playwright.config.ts`, `apps/e2e/tests/build-freshness.setup.ts` (new),
`apps/e2e/tests/shell-journey.spec.ts`, `packages/next-shell/src/viewer.ts`, `apps/e2e/package.json`
**Invocation:** `codex exec --skip-git-repo-check "$(cat reviews/_t0030_codex_prompt.txt)" < /dev/null`
**Exit:** 0

## Findings as returned

> **Medium** `apps/workshop-web/app/home/dashboard/page.tsx:85` still states the demo viewer holds
> `finance.read`, but this diff removes that grant from `DEMO_DEFAULT`. The Workshop dashboard is
> visible to the default viewer, so the app now displays false permission information and claims
> finance items appear when they are intentionally hidden. Update this copy or make it derive from
> `viewerGrants('workshop')`.
>
> No other defects found in the reviewed diff.

## Adjudication

**Finding 1 — CONFIRMED, accepted, fixed.** Verified against source before accepting. The line read
"Finance items and the Settings group only appear because the demo viewer holds `finance.read` and
`organization.admin`", which became false the moment `finance.read` left `DEMO_DEFAULT`. It is a
genuine defect and Codex found it in a file *outside* the changed set, which is the harder catch —
credit where due, and exactly the blast-radius reasoning a reviewer is for.

Fixed by taking Codex's second option rather than its first: the copy now **derives** from
`viewerGrants('workshop')` instead of restating the grants as literal text. Editing the sentence
would have left the same defect class in place — a literal in one file that no type-checker can hold
in agreement with a literal in another. That is the same failure mode as defect 3 of the Phase 3 set.

## What Codex did not do — recorded, per the standing note on this reviewer

1. **It did not answer question 1** (can the guard produce a false PASS?), despite the prompt saying
   it must be answered explicitly. That question mattered: the Supervisor pass found a real
   false-pass path in the guard. See `supervisor-adjudication-t0030-harness.md` S1.
2. **It did not answer question 3** (does `dependencies: ['build-guard']` guarantee ordering, and are
   the web servers up when the guard runs?).
3. **It emitted no `VERDICT:` line**, though the prompt required one verbatim. This is now the third
   consecutive plan/code review in which Codex has omitted the verdict token.
4. It reported "No other defects found in the reviewed diff" — a clean bill on four of the five files.
   The Supervisor pass subsequently found four further defects in exactly those files.

**Standing conclusion, reaffirmed:** a clean Codex verdict is not evidence of correctness. It is one
reader's opinion, useful for blast radius, unreliable for coverage. Treat "no other defects found" as
"not checked" unless something else checked it.
