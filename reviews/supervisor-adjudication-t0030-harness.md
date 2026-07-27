# Supervisor adjudication — T-0030 and the e2e harness

**Date:** 2026-07-27
**Adjudicates:** `codex-review-t0030-harness.md`
**Verdict:** **PASS WITH CORRECTIONS** — 1 Codex finding confirmed, 5 further defects found and fixed,
1 anomaly recorded unresolved.

---

## 1. The headline: T-0030 was not a defect

T-0030 was carried across a session boundary as a live 🔴 product defect: *"at 360px the side nav
renders INLINE instead of as an overlay; `main` is squeezed to 103px and the page scrolls
horizontally by 161px; `useIsMobile()` returns false in the built app."*

**It is a test-harness artefact. The shell's responsive behaviour was correct the whole time.**

This was established by controlled reproduction, not by argument:

| Condition | main | scrollWidth vs clientWidth | React hydrated | `matchMedia('(max-width: 767px)')` |
|---|---|---|---|---|
| Server started **before** the rebuild | **103px** | **521 vs 360 (=161px)** | **no** — `__react*` keys absent | **true** |
| Fresh server, same build | 360px | 360 vs 360 | yes | true |

Both numbers — 103px and 161px — reproduce the handover's figures exactly.

**Mechanism.** `next start` resolves its chunk manifest once, at boot. Seven servers were launched at
12:35; the apps were rebuilt at 14:38 underneath them; `reuseExistingServer: !CI` then handed those
stale servers to the suite. The servers kept emitting HTML referencing chunk hashes the rebuild had
deleted, every one 404'd, React never hydrated, and `useIsMobile()` never advanced past the `false`
it deliberately starts with for SSR safety.

**Why it read as a product bug.** The server still answers 200. The server-rendered markup is
correct. TopNav's mobile rules are plain CSS *inside that markup*, so they keep working — which is
precisely the detail the previous session cited as evidence the bug was real ("`useIsMobile()` is
false while TopNav's CSS-driven filtering still works"). That asymmetry is not a symptom of a broken
hook. It is the signature of a page whose JavaScript never ran.

**The lesson that failed.** "Stop the servers before rebuilding" was already written in
`SESSION_HANDOVER.md` before this happened. A documented instruction did not prevent it, which is why
the fix is a gate and not another sentence.

**A note on the diagnosis that was recorded.** The previous session explicitly considered and
rejected the race hypothesis — "Confirmed after waiting for hydration, so it is NOT a test race." The
reasoning was sound and the rejection was still wrong, because it tested the wrong hypothesis:
waiting longer cannot fix a chunk that returns 404. Ruling out one cause is not the same as finding
the cause.

---

## 2. Codex finding — confirmed

**C1 (MEDIUM) — stale permission copy on the workshop dashboard.** CONFIRMED against source and
fixed by deriving from `viewerGrants()` rather than restating the grants. See the Codex record.

---

## 3. Defects Codex did not find

### S1 (HIGH) — the freshness guard had a false-pass path

Codex was asked directly whether the guard could report a stale build as fresh, and did not answer.
It could. The asset scan matched only `/_next/static/…`, but Next also names chunks in the RSC flight
payload **without** that prefix (`\"static/chunks/772-….js\"`). A route whose stale chunk appeared
only in the payload would have been reported fresh.

A guard that can pass over the condition it exists to catch is worse than no guard, because it will
be trusted. Fixed: both forms are now harvested, normalised and de-duplicated. Re-verified green on
all 7 apps with no false positive.

### S2 (HIGH) — the only security-relevant test in the suite had never once executed

`"<workspace>: a gated URL 404s when typed directly"` is the regression test for defect 1, the
permission-**bypass** defect. It `test.skip`ped in **all seven workspaces**, every run, silently.

Cause: the nav model gates on exactly two permission keys (`finance.read`, 9 items;
`organization.admin`, 1), and the demo viewer held **both**. So `gatedHref()` found no gated module
anywhere and every instance skipped itself. The suite reported green while proving nothing whatsoever
about permission gating.

This is the "green over zero items" class. The same suite already guards it in two other places —
`a11y-storybook` refuses to pass over an empty story index, and the nav test asserts
`hrefs.length > 0` — so the hole was an omission, not a policy.

Fixed in two parts: `DEMO_DEFAULT` no longer holds `finance.read`, so gating is genuinely exercised
in 5 of 7 workspaces; and a new test, `at least one workspace must exercise permission gating`, fails
if this ever drifts back. The remaining 2 skips are legitimate and load-bearing: `admin` holds every
grant by design, and `customer` has no gated item in its tree.

**When the test was made to run, the fail-closed behaviour held** — every gated URL returned a real
404 (`NEXT_HTTP_ERROR_FALLBACK;404`). Defect 1's fix is sound. It simply had no proof until now.

### S3 (MEDIUM) — the disclosure assertion could not pass on correct code

The second half of that test asserted the 404 body must not match
`/\b(platform|organization|finance)\.[a-z]+\b/`. Next serialises client-component props into the RSC
flight payload inside `<script>` tags in `<body>`, and `page.textContent('body')` reads script text —
so it matched `"grants":["organization.admin"]`, **the viewer's own grants**.

That is a different fact from the one the test was written to protect. The hole is disclosing *the
permission that gates the page* (which tells a visitor what to acquire); the viewer's own grants are
documented in `viewer.ts` as client-visible and not a security control, and a client component that
renders permission-aware navigation must receive them.

Tightened to assert the absence of that module's *specific* required permission. Verified: the
required permission is genuinely absent from the 404 body.

### S4 (MEDIUM) — the overlay test was a sleep-race and would have stayed red on a correct app

`"below 768px the side nav is an overlay"` navigated with `waitUntil: 'domcontentloaded'` and never
waited for hydration, so it measured the server-rendered desktop tree. It failed even after the real
cause of T-0030 was fixed.

The two overflow tests did wait — but with `waitForTimeout(400)`, a race with the *machine* rather
than the app. On a box running seven Next servers and a nine-target build, which is exactly the state
this repo was in on 2026-07-26, 400ms is not dependably enough. The same suite had already produced
one false failure from a fixed sleep (the modal-drawer focus trap).

Replaced with `waitForHydration()`, which waits for the condition: `readyState === 'complete'` **and**
React's `__reactFiber$…` expando keys present on `<body>`. The second clause matters — `readyState`
is equally true of a page whose JavaScript 404'd, which is the exact state that caused T-0030.

### S5 (MEDIUM) — the e2e suite served every app with the wrong Next major

`webServer.command` was `npx next start ../<app>-web` with the default cwd of `apps/e2e`, so npx
resolved `next` from **that** package — which pinned `14.2.21` — and used it to serve apps built with
`15.1.3`. Next 14 cannot read a Next 15 build; it dies on a missing `font-manifest.json`, a file Next
15 no longer emits.

This had been latent since T-0015 was written, masked entirely by the stale-server reuse: the suite
never started its own servers, so it never used its own Next. Removing one bug exposed the other.

Fixed by running each server from the app's own directory (`cwd`), so an app is always served by the
Next it was built with, and by aligning the `apps/e2e` pin to `15.1.3`.

---

## 4. Known limitation — stated, not hidden

The freshness guard checks each app's **entry route only**. A server could, in principle, be stale
for a route-specific chunk not referenced from `/`. In practice the entry document references the
shared runtime (`webpack`, `main-app`, the vendor chunks), which change on essentially any source
edit — that is what caught the reproduction — so coverage is high but not total. Extending it to a
sample of routes is cheap and is left as a follow-up rather than claimed as done.

## 5. Unresolved anomaly — recorded rather than buried

During verification, one guard run **passed against a server that was demonstrably stale**. The same
command, on the same state, failed correctly on the next two runs and named the exact missing chunk;
a direct replication of the guard's logic against that server also correctly reported the chunk
missing. I could not reproduce the passing run and I do not have an explanation for it.

The direction matters: a guard that occasionally passes when it should fail is the failure mode that
guards are supposed to eliminate. It is recorded here as open rather than dismissed because the
alternative — inventing a plausible cause — is exactly how T-0030 came to be believed in the first
place.

---

## 6. Gate results

| Gate | Result |
|---|---|
| typecheck | 14/14 |
| lint | 14/14 |
| unit tests | 64 |
| build | 10/10 targets |
| Playwright, full suite | **138 passed, 0 failed, 2 legitimate skips** |
| build-guard, stale server | fails, names the exact missing chunk |
| build-guard, fresh servers | 7/7 pass, no false positive |

The three tests left deliberately red at the end of the previous session — 360px overflow, 480px
overflow, and the overlay assertion — are green, and none of them was weakened to get there. Two
passed once the harness stopped lying; the third needed its missing hydration wait.

**VERDICT: PASS WITH CORRECTIONS.** All corrections applied and re-verified.
