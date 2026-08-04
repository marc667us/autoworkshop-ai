# Review: codex-review

_Generated: 2026-08-04T05:45:43-07:00 · backend: codex · model: llama3.2_

## Prompt

> You are Codex acting as Independent Pair Programmer for this repository. Review the latest implementation against the stated requirement in README.md and (if present) docs/IMPLEMENTATION_LOG.md. Identify anything Claude Code missed, misunderstood, or only partially implemented. Return a checklist of defects with: severity (critical/high/medium/low), file:line, what's wrong, recommended fix, why it matters.

## Repository context

### Changed files (HEAD~1..HEAD)
```
 .github/workflows/keep-warm.yml                    | 140 +++++++++
 apps/admin-web/app/auth/error/page.tsx             |  24 ++
 .../app/(app)/my-vehicles/service-history/page.tsx |  17 ++
 .../service-and-repairs/completed-repairs/page.tsx |  22 ++
 .../service-and-repairs/repair-proposals/page.tsx  |  22 ++
 .../service-and-repairs/repair-tracking/page.tsx   |  22 ++
 .../service-and-repairs/service-requests/page.tsx  |  22 ++
 .../app/_screens/repair-journey-screen.tsx         | 326 +++++++++++++++++++++
 .../app/_screens/repair-journey.spec.ts            | 101 +++++++
 apps/customer-web/app/_screens/repair-journey.ts   | 213 ++++++++++++++
 .../app/_screens/service-history-screen.tsx        | 196 +++++++++++++
 apps/customer-web/app/auth/error/page.tsx          |  24 ++
 apps/customer-web/package.json                     |   5 +-
 apps/fleet-web/app/auth/error/page.tsx             |  24 ++
 apps/insurance-web/app/auth/error/page.tsx         |  24 ++
 apps/supplier-web/app/auth/error/page.tsx          |  24 ++
 apps/towing-web/app/auth/error/page.tsx            |  24 ++
 apps/workshop-web/app/auth/error/page.tsx          |  24 ++
 packages/auth/src/auth-error-route.test.ts         |  61 ++++
 packages/auth/src/workspace-auth.ts                |  27 +-
```

### Diff snippet (first 700 lines)
```diff
diff --git a/.github/workflows/keep-warm.yml b/.github/workflows/keep-warm.yml
new file mode 100644
index 0000000..c74bee1
--- /dev/null
+++ b/.github/workflows/keep-warm.yml
@@ -0,0 +1,140 @@
+# Keeps Keycloak awake during working hours so sign-in does not cold-start.
+#
+# ── THE PROBLEM ─────────────────────────────────────────────────────────────
+# Render's free tier powers a service down after 15 minutes of idle. Keycloak's
+# cold start was MEASURED at up to 136 seconds on 2026-08-03, and Auth.js
+# discovers its endpoints from `.well-known/openid-configuration` — so during
+# that wake, sign-in fails with `Configuration`, which reads to the visitor as
+# "this site is broken". The first visitor after any quiet period gets it.
+#
+# `packages/next-shell/src/AuthErrorScreen.tsx` fixes what they are TOLD. This
+# file reduces how often they are told it.
+#
+# ── 🔴 WHY THIS IS WINDOWED AND NOT 24/7 — READ BEFORE WIDENING IT ──────────
+#
+# FOUR free Render services share ONE 750-instance-hour monthly allowance:
+# autoworkshop-api, autoworkshop-keycloak, the workshop web service and
+# autoworkshop-customer. A calendar month is ~730 hours. So:
+#
+#     Keycloak warm 24/7   = ~730 h/month  = the ENTIRE allowance, alone
+#     Keycloak warm 10h×22 = ~220 h/month  = leaves ~530 h for the other three
+#
+# A round-the-clock warmer does not merely risk the budget, it consumes all of
+# it and starves the API and both web services — which is precisely how this
+# account was suspended with `suspenders: ['billing']` on 2026-07-28, and why
+# `autoworkshop-customer` 404'd for a stretch on 2026-08-03. Zero cost is a hard
+# rule (ADR-012) and NO PAID REMEDY IS TO BE PROPOSED, so the only lever is how
+# many hours to spend and when.
+#
+# The window below is therefore deliberately modest: weekdays, 08:00-18:00 UTC.
+# Ghana is UTC+0, so that is local working hours with no offset arithmetic.
+# WIDENING IT SPENDS HOURS THE OTHER THREE SERVICES NEED. Do the sum first.
+#
+# ── WHY ONE RUN LOOPS INSTEAD OF ASKING CRON FOR MORE FIRES ─────────────────
+#
+# Measured on the Solar repo across 8 workflows: GitHub delivers ~0.6 scheduled
+# runs/hour REGARDLESS of the requested rate — 12/h and 2/h both arrive at
+# ~0.6/h. Every gap exceeded Render's 15-minute idle timeout, so a 5-minute cron
+# kept nothing warm for weeks while reporting success on every run. You cannot
+# out-schedule a scheduler that is dropping you.
+#
+# So this does not depend on cron FREQUENCY, only on it eventually firing: each
+# delivered run becomes a loop that pings every 5 minutes until the window ends.
+# One landed fire covers the rest of the working day.
+#
+# `cancel-in-progress: false` is load-bearing. A landing fire is held PENDING
+# behind the live warmer rather than killing it; `true` was tried on Solar and is
+# worse, because it stops the running warmer before its replacement has a runner
+# and opens a coverage gap several times an hour.
+#
+# STAYING GREEN IS DELIBERATE. A warmer must never page anyone for a slow wake,
+# so ping failures are counted and summarised, never fatal.
+#
+# To stop entirely: disable in the Actions tab AND cancel the in-flight run, or
+# it keeps warming until the window closes.
+
+name: keep-warm
+
+on:
+  schedule:
+    # Asked often so that at least one lands inside the window; the delivered
+    # rate is ~0.6/h whatever this says. Offset minutes avoid the :00 high-load
+    # slot GitHub's own docs call the worst one. Do NOT tighten this to "fix"
+    # thin coverage — it has no measurable effect.
+    - cron: "3,18,33,48 8-17 * * 1-5"
+  workflow_dispatch: {}
+
+permissions:
+  contents: read
+
+concurrency:
+  group: keep-warm
+  cancel-in-progress: false
+
+jobs:
+  warm:
+    runs-on: ubuntu-latest
+    # The loop stops itself at the window's end; this is a backstop only.
+    timeout-minutes: 335
+    steps:
+      - name: Warm Keycloak until the window closes
+        run: |
+          # A failed ping must never kill the loop. A warmer that dies on the
+          # first slow cold wake is the exact bug that made Solar's
+          # keycloak-keepalive workflow useless.
+          set +e
+
+          # 18:00 UTC — the end of the window declared in the header. Computed
+          # from the clock rather than a fixed duration so a fire that lands at
+          # 16:40 warms for 80 minutes and stops, instead of running past the
+          # window and spending hours nobody is awake for.
+          WINDOW_END_HOUR=18
+          INTERVAL=300        # 5 min, comfortably inside Render's 15-min idle
+          # 150s, not 90s. A free-tier wake was measured at 136s on 2026-08-03,
+          # and a cap that expires MID-WAKE aborts the very wake it triggered —
+          # which is how a warmer ends up proving nothing. Do not lower this
+          # without a new measurement.
+          MAXTIME=150
+
+          # Only Keycloak. The API and the web services wake on real traffic and
+          # each one added here costs another ~220 h/month from a 750 h budget
+          # shared by four services. See the header before adding a URL.
+          URL="https://autoworkshop-keycloak.onrender.com/realms/autoworkshop/.well-known/openid-configuration"
+
+          START=$(date +%s); ROUNDS=0; FAILURES=0
+
+          summary() {
+            MINS=$(( ($(date +%s) - START) / 60 ))
+            echo "----------------------------------------"
+            echo "warmed ${MINS} min | ${ROUNDS} pings | ${FAILURES} failed"
+            if [ "$ROUNDS" -gt 0 ] && [ "$FAILURES" -eq "$ROUNDS" ]; then
+              # Every ping failed for the whole run. Warn so it is visible in the
+              # run summary, but do NOT fail: a warmer that pages people teaches
+              # them to ignore it, and this is not the outage detector.
+              echo "::warning::keep-warm: every ping failed (${FAILURES}/${ROUNDS}). Keycloak may be down."
+            fi
+          }
+          # The NORMAL way this run ends is the window closing or a newer fire
+          # superseding it — print the tally either way, or the common case
+          # leaves no record of what happened.
+          trap 'summary; exit 0' TERM INT
+
+          while [ "$(date -u +%H)" -lt "$WINDOW_END_HOUR" ]; do
+            ROUNDS=$((ROUNDS + 1))
+            # No -f: curl exits 0 for ANY HTTP response, including 5xx. Correct
+            # for a warmer — a 500 still proves the container answered, which is
+            # the only thing being measured. Judging health is not this job.
+            OUT=$(curl -sS --max-time "$MAXTIME" -o /dev/null -w "%{http_code} in %{time_total}s" "$URL" 2>&1)
+            if [ $? -ne 0 ]; then
+              FAILURES=$((FAILURES + 1))
+              echo "  WARN $(echo "$OUT" | tr '\n' ' ')"
+            else
+              echo "  ok   ${OUT}"
+            fi
+            # Re-check the hour BEFORE sleeping, so the last cycle of the day
+            # does not sleep five minutes past the window just to exit.
+            [ "$(date -u +%H)" -lt "$WINDOW_END_HOUR" ] || break
+            sleep "$INTERVAL"
+          done
+
+          summary
diff --git a/apps/admin-web/app/auth/error/page.tsx b/apps/admin-web/app/auth/error/page.tsx
new file mode 100644
index 0000000..33287ec
--- /dev/null
+++ b/apps/admin-web/app/auth/error/page.tsx
@@ -0,0 +1,24 @@
+import { AuthErrorScreen } from '@autoworkshop/next-shell';
+
+/**
+ * /auth/error — where `pages.error` sends a failed sign-in.
+ *
+ * ⚠️ THIS ROUTE MUST EXIST IN ALL SEVEN APPS. `workspace-auth.ts` sets
+ * `pages.error` for every workspace from one shared config, so an app without
+ * this file turns a recoverable Keycloak cold start into a 404 — strictly worse
+ * than the default screen it replaced. `auth-error-route.spec.ts` asserts all
+ * seven are present.
+ *
+ * Deliberately NOT gated: it is reached BY someone who could not sign in.
+ */
+export const dynamic = 'force-dynamic';
+
+export default async function Page({
+  searchParams,
+}: {
+  searchParams: Promise<{ error?: string }>;
+}) {
+  // Next 15: `searchParams` is a promise.
+  const { error } = await searchParams;
+  return <AuthErrorScreen error={error} />;
+}
diff --git a/apps/customer-web/app/(app)/my-vehicles/service-history/page.tsx b/apps/customer-web/app/(app)/my-vehicles/service-history/page.tsx
new file mode 100644
index 0000000..9b8fcae
--- /dev/null
+++ b/apps/customer-web/app/(app)/my-vehicles/service-history/page.tsx
@@ -0,0 +1,17 @@
+import { requireNavRoute } from '@autoworkshop/next-shell';
+import { ServiceHistoryScreen } from '../../../_screens/service-history-screen';
+
+/**
+ * /my-vehicles/service-history — `01 (1).txt` §33, the customer workspace.
+ *
+ * ⚠️ `requireNavRoute` resolves against the viewer's VISIBLE NAVIGATION and is
+ * not authentication — see `/my-vehicles/garage` for the full reasoning. The
+ * real scoping is `JobCardService.list`'s customer predicate plus RLS.
+ */
+export const dynamic = 'force-dynamic';
+
+export default async function Page() {
+  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
+  await requireNavRoute('customer', '/my-vehicles/service-history');
+  return <ServiceHistoryScreen />;
+}
diff --git a/apps/customer-web/app/(app)/service-and-repairs/completed-repairs/page.tsx b/apps/customer-web/app/(app)/service-and-repairs/completed-repairs/page.tsx
new file mode 100644
index 0000000..dfab865
--- /dev/null
+++ b/apps/customer-web/app/(app)/service-and-repairs/completed-repairs/page.tsx
@@ -0,0 +1,22 @@
+import { requireNavRoute } from '@autoworkshop/next-shell';
+import { RepairJourneyScreen } from '../../../_screens/repair-journey-screen';
+
+/**
+ * /service-and-repairs/completed-repairs — `01 (1).txt` §33, the customer workspace.
+ *
+ * ⚠️ `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION.
+ * It is not authentication: the §33 tree has no per-role variants and no
+ * permission on this item, so a signed-out visitor reaches the page, `apiGet`
+ * finds no token, and the screen renders its unauthenticated state. Same
+ * reasoning as `/my-vehicles/garage`, where Codex corrected the opposite claim.
+ *
+ * NOT the control either way. `JobCardService.list` narrows a `customer` viewer
+ * to cards against their OWN vehicles, and RLS isolates the tenant beneath that.
+ */
+export const dynamic = 'force-dynamic';
+
+export default async function Page() {
+  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
+  await requireNavRoute('customer', '/service-and-repairs/completed-repairs');
+  return <RepairJourneyScreen view="finished" />;
+}
diff --git a/apps/customer-web/app/(app)/service-and-repairs/repair-proposals/page.tsx b/apps/customer-web/app/(app)/service-and-repairs/repair-proposals/page.tsx
new file mode 100644
index 0000000..3e56a9c
--- /dev/null
+++ b/apps/customer-web/app/(app)/service-and-repairs/repair-proposals/page.tsx
@@ -0,0 +1,22 @@
+import { requireNavRoute } from '@autoworkshop/next-shell';
+import { RepairJourneyScreen } from '../../../_screens/repair-journey-screen';
+
+/**
+ * /service-and-repairs/repair-proposals — `01 (1).txt` §33, the customer workspace.
+ *
+ * ⚠️ `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION.
+ * It is not authentication: the §33 tree has no per-role variants and no
+ * permission on this item, so a signed-out visitor reaches the page, `apiGet`
+ * finds no token, and the screen renders its unauthenticated state. Same
+ * reasoning as `/my-vehicles/garage`, where Codex corrected the opposite claim.
+ *
+ * NOT the control either way. `JobCardService.list` narrows a `customer` viewer
+ * to cards against their OWN vehicles, and RLS isolates the tenant beneath that.
+ */
+export const dynamic = 'force-dynamic';
+
+export default async function Page() {
+  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
+  await requireNavRoute('customer', '/service-and-repairs/repair-proposals');
+  return <RepairJourneyScreen view="needs-you" />;
+}
diff --git a/apps/customer-web/app/(app)/service-and-repairs/repair-tracking/page.tsx b/apps/customer-web/app/(app)/service-and-repairs/repair-tracking/page.tsx
new file mode 100644
index 0000000..ef07c32
--- /dev/null
+++ b/apps/customer-web/app/(app)/service-and-repairs/repair-tracking/page.tsx
@@ -0,0 +1,22 @@
+import { requireNavRoute } from '@autoworkshop/next-shell';
+import { RepairJourneyScreen } from '../../../_screens/repair-journey-screen';
+
+/**
+ * /service-and-repairs/repair-tracking — `01 (1).txt` §33, the customer workspace.
+ *
+ * ⚠️ `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION.
+ * It is not authentication: the §33 tree has no per-role variants and no
+ * permission on this item, so a signed-out visitor reaches the page, `apiGet`
+ * finds no token, and the screen renders its unauthenticated state. Same
+ * reasoning as `/my-vehicles/garage`, where Codex corrected the opposite claim.
+ *
+ * NOT the control either way. `JobCardService.list` narrows a `customer` viewer
+ * to cards against their OWN vehicles, and RLS isolates the tenant beneath that.
+ */
+export const dynamic = 'force-dynamic';
+
+export default async function Page() {
+  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
+  await requireNavRoute('customer', '/service-and-repairs/repair-tracking');
+  return <RepairJourneyScreen view="open" />;
+}
diff --git a/apps/customer-web/app/(app)/service-and-repairs/service-requests/page.tsx b/apps/customer-web/app/(app)/service-and-repairs/service-requests/page.tsx
new file mode 100644
index 0000000..fe200fe
--- /dev/null
+++ b/apps/customer-web/app/(app)/service-and-repairs/service-requests/page.tsx
@@ -0,0 +1,22 @@
+import { requireNavRoute } from '@autoworkshop/next-shell';
+import { RepairJourneyScreen } from '../../../_screens/repair-journey-screen';
+
+/**
+ * /service-and-repairs/service-requests — `01 (1).txt` §33, the customer workspace.
+ *
+ * ⚠️ `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION.
+ * It is not authentication: the §33 tree has no per-role variants and no
+ * permission on this item, so a signed-out visitor reaches the page, `apiGet`
+ * finds no token, and the screen renders its unauthenticated state. Same
+ * reasoning as `/my-vehicles/garage`, where Codex corrected the opposite claim.
+ *
+ * NOT the control either way. `JobCardService.list` narrows a `customer` viewer
+ * to cards against their OWN vehicles, and RLS isolates the tenant beneath that.
+ */
+export const dynamic = 'force-dynamic';
+
+export default async function Page() {
+  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
+  await requireNavRoute('customer', '/service-and-repairs/service-requests');
+  return <RepairJourneyScreen view="all" />;
+}
diff --git a/apps/customer-web/app/_screens/repair-journey-screen.tsx b/apps/customer-web/app/_screens/repair-journey-screen.tsx
new file mode 100644
index 0000000..f7fc372
--- /dev/null
+++ b/apps/customer-web/app/_screens/repair-journey-screen.tsx
@@ -0,0 +1,326 @@
+import { Suspense } from 'react';
+import Link from 'next/link';
+import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
+import { EmptyState, LoadingState, PageHeader, StatusBadge } from '@autoworkshop/ui';
+import { primitive, themeVar } from '@autoworkshop/design-tokens';
+import { customerStage, needsCustomer, type JourneyPhase } from './repair-journey';
+
+/**
+ * The customer's repair journey — `01 (1).txt` §33's `service-and-repairs` group.
+ *
+ * ONE screen at FOUR routes, following `job-card-detail-screen.tsx`, which is
+ * mounted at four role-tree routes for the same reason: the four differ only in
+ * WHICH of the customer's cards they show and how the empty state reads. Four
+ * near-identical files would be four places to fix the next bug in.
+ *
+ *   /service-and-repairs/service-requests    every request, newest first
+ *   /service-and-repairs/repair-tracking     the ones still open
+ *   /service-and-repairs/repair-proposals    the ones waiting on the customer
+ *   /service-and-repairs/completed-repairs   the ones that are done
+ *
+ * ⚠️ THE FILTER HERE IS PRESENTATION, NOT ACCESS CONTROL. `JobCardService.list`
+ * narrows a `customer` viewer to cards raised against their OWN vehicles — one
+ * `c.user_id` predicate in the SQL — and Postgres RLS isolates the tenant
+ * underneath that. Both hold whatever this file does. If this component were
+ * deleted the data would still be correctly scoped; if the service's predicate
+ * were deleted, no amount of filtering here would save it (CLAUDE.md §8).
+ */
+
+export const dynamic = 'force-dynamic';
+
+/**
+ * ⚠️ THESE NAMES ARE THE API'S, NOT PLAUSIBLE ONES.
+ * `JobCard` in `apps/api/src/repair/job-card.service.ts` is the contract. The
+ * mobile app once read `stageOptions` where the API returns `allowedStages`;
+ * nothing threw, the list was empty, and every user — owners included — was told
+ * "your role cannot move this job". A wrong field name here would render a blank
+ * card rather than an error.
+ */
+interface JobCardRow {
+  id: string;
+  jobNumber: string;
+  vehicleId: string;
+  registrationNumber: string;
+  vehicleDescription: string;
+  complaint: string;
+  stage: string;
+  priority: string;
+  assignedTechnicianName: string | null;
+  expectedCompletionOn: string | null;
+  openedAt: string;
+  stageChangedAt: string;
+  closedAt: string | null;
+}
+
+export type JourneyView = 'all' | 'open' | 'needs-you' | 'finished';
+
+const VIEWS: Record<
+  JourneyView,
+  {
+    title: string;
+    description: string;
+    emptyTitle: string;
+    emptyDescription: string;
+    keep: (card: JobCardRow) => boolean;
+  }
+> = {
+  all: {
+    title: 'My Service Requests',
+    description:
+      'Every repair you have asked this workshop for, newest first — including the ones already finished.',
+    emptyTitle: 'You have not requested any repairs yet',
+    emptyDescription:
+      'Report a problem with one of your vehicles and the request will appear here, with its progress.',
+    keep: () => true,
+  },
+  open: {
+    title: 'Repair Tracking',
+    description: 'Where each of your vehicles has got to. Updated as the workshop moves the job on.',
+    emptyTitle: 'Nothing is in for repair',
+    emptyDescription:
+      'When you report a problem and the workshop takes the vehicle in, you can follow its progress here.',
+    keep: (c) => phaseOf(c) !== 'finished',
+  },
+  'needs-you': {
+    title: 'Repair Proposals and Approvals',
+    description:
+      'The repairs that cannot go any further until you do something — approve a quote, pay a deposit, answer a question or collect the vehicle.',
+    emptyTitle: 'Nothing is waiting on you',
+    emptyDescription:
+      'When the workshop needs your approval, a deposit or an answer, it will appear here. Nothing starts on your vehicle without it.',
+    keep: (c) => needsCustomer(c.stage),
+  },
+  finished: {
+    title: 'Completed Repairs',
+    description: 'Work this workshop has finished on your vehicles.',
+    emptyTitle: 'No completed repairs yet',
+    emptyDescription: 'Once a repair is finished and the vehicle handed back, it is recorded here.',
+    keep: (c) => phaseOf(c) === 'finished',
+  },
+};
+
+function phaseOf(card: JobCardRow): JourneyPhase {
+  return customerStage(card.stage).phase;
+}
+
+function when(iso: string): string {
+  // Fixed locale, not the server's. A date that renders differently on two
+  // machines gets reported as a data bug.
+  return new Date(iso).toLocaleDateString('en-GB', {
+    day: 'numeric',
+    month: 'short',
+    year: 'numeric',
+  });
+}
+
+export function RepairJourneyScreen({ view }: { view: JourneyView }) {
+  const config = VIEWS[view];
+  return (
+    <>
+      <PageHeader title={config.title} description={config.description} />
+      <Suspense fallback={<LoadingState label="Loading your repairs…" />}>
+        <JourneyList view={view} />
+      </Suspense>
+    </>
+  );
+}
+
+async function JourneyList({ view }: { view: JourneyView }) {
+  const config = VIEWS[view];
+  const result = await apiGet<JobCardRow[]>('customer', '/job-cards');
+
+  if (!result.ok) {
+    // Covers `unauthenticated` too, which is the normal state for a signed-out
+    // visitor: `requireNavRoute` does not refuse them (see the page comment),
+    // so this is where they are told to sign in.
+    return <ApiFailure reason={result.reason} workspaceId="customer" />;
+  }
+
+  const cards = result.data.filter(config.keep);
+
+  if (cards.length === 0) {
+    return <EmptyState title={config.emptyTitle} description={config.emptyDescription} />;
+  }
+
+  // Newest first. The API orders for the workshop's purposes; a customer with
+  // three cars wants the thing that happened most recently at the top.
+  const ordered = [...cards].sort(
+    (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime(),
+  );
+
+  const waiting = ordered.filter((c) => needsCustomer(c.stage)).length;
+
+  return (
+    <>
+      {/*
+        On every view EXCEPT the one that is already only these cards. Telling
+        someone "2 need you" on the page listing exactly those two is noise.
+      */}
+      {view !== 'needs-you' && waiting > 0 ? (
+        <p
+          style={{
+            margin: `0 0 ${primitive.space[4]}`,
+            padding: primitive.space[3],
+            borderRadius: primitive.radius.md,
+            border: `1px solid ${themeVar.borderDefault}`,
+            background: themeVar.surfaceRaised,
+            fontSize: primitive.fontSize.sm,
+          }}
+        >
+          <strong>{waiting}</strong>{' '}
+          {waiting === 1 ? 'repair is waiting on you' : 'repairs are waiting on you'}.{' '}
+          <Link href="/service-and-repairs/repair-proposals">See what is needed</Link>
+        </p>
+      ) : null}
+
+      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: primitive.space[4] }}>
+        {ordered.map((card) => (
+          <JourneyCard key={card.id} card={card} />
+        ))}
+      </ul>
+    </>
+  );
+}
+
+function JourneyCard({ card }: { card: JobCardRow }) {
+  const stage = customerStage(card.stage);
+  const yours = stage.phase === 'needs_you';
+
+  return (
+    <li
+      style={{
+        // A card the customer must act on is outlined in the attention colour.
+        // The badge alone was not enough at a glance on a phone, which is where
+        // most of these are read.
+        border: `1px solid ${yours ? themeVar.statusAttention : themeVar.borderDefault}`,
+        borderLeft: `4px solid ${yours ? themeVar.statusAttention : themeVar.borderDefault}`,
+        borderRadius: primitive.radius.lg,
+        padding: primitive.space[4],
+        background: themeVar.surfaceRaised,
+      }}
+    >
+      <div
+        style={{
+          display: 'flex',
+          flexWrap: 'wrap',
+          gap: primitive.space[3],
+          alignItems: 'baseline',
+          justifyContent: 'space-between',
+        }}
+      >
+        <div style={{ display: 'flex', flexWrap: 'wrap', gap: primitive.space[3], alignItems: 'baseline' }}>
+          <span
+            style={{
+              // A registration is read out over the phone character by
+              // character — same reasoning as the order number on §2845.
+              fontFamily: primitive.fontFamily.mono,
+              fontSize: primitive.fontSize.base,
+              fontWeight: 600,
+              letterSpacing: '0.04em',
+            }}
+          >
+            {card.registrationNumber}
+          </span>
+          <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
+            {card.vehicleDescription}
+          </span>
+        </div>
+        <StatusBadge kind={stage.badge} label={stage.label} />
+      </div>
+
+      <p style={{ margin: `${primitive.space[3]} 0 0`, fontSize: primitive.fontSize.sm }}>
+        {stage.detail}
+      </p>
+
+      <p
+        style={{
+          margin: `${primitive.space[2]} 0 0`,
+          color: themeVar.textSecondary,
+          fontSize: primitive.fontSize.sm,
+        }}
+      >
+        {/* What they reported, so the card is identifiable when they have several. */}
+        “{card.complaint}”
+      </p>
+
+      <dl
+        style={{
+          display: 'grid',
+          gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))',
+          gap: primitive.space[3],
+          margin: `${primitive.space[4]} 0 0`,
+          fontSize: primitive.fontSize.sm,
+        }}
+      >
+        <Fact label="Job number" value={card.jobNumber} mono />
+        <Fact label="Requested" value={when(card.openedAt)} />
+        <Fact
+          label="Expected back"
+          value={card.expectedCompletionOn ? when(card.expectedCompletionOn) : 'Not yet estimated'}
+        />
+        {/*
+          The technician's name only once there IS one. "Unassigned" reads as a
+          complaint about the workshop rather than as the normal state of a job
+          that arrived an hour ago.
+        */}
+        {card.assignedTechnicianName ? (
+          <Fact label="Technician" value={card.assignedTechnicianName} />
+        ) : null}
+      </dl>
+
+      {yours ? (
+        <p
+          style={{
+            margin: `${primitive.space[4]} 0 0`,
+            fontSize: primitive.fontSize.sm,
+            fontWeight: 600,
+          }}
+        >
+          {/*
+            🔴 AN HONEST NEXT STEP, NOT A BUTTON THAT DOES NOTHING.
+            Approving a proposal in-app is `POST /proposals/:id/decision`, and
+            that route is written for a staff member CAPTURING the customer's
+            answer — `decidedByName` is the customer while the session is the
+            workshop's. A self-service decision needs its own authenticated
+            route; until it exists, offering a button here would be a control
+            that silently fails, which this repo has now shipped once (a form
+            with no submit button) and does not need again.
+          */}
+          Contact the workshop to {actionFor(card.stage)}.
+        </p>
+      ) : null}
+    </li>
+  );
+}
+
+/** The verb for the one thing this customer has to do. */
+function actionFor(stage: string): string {
+  switch (stage) {
+    case 'awaiting_customer_approval':
+      return 'approve or decline the repair proposal';
+    case 'awaiting_deposit':
+      return 'pay the deposit so work can start';
+    case 'further_information_required':
+      return 'answer their question';
+    case 'ready_for_collection':
+      return 'arrange collection of your vehicle';
+    default:
+      return 'find out what is needed';
+  }
+}
+
+function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
+  return (
+    <div>
+      <dt style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.xs }}>{label}</dt>
+      <dd
+        style={{
+          margin: 0,
+          fontFamily: mono ? primitive.fontFamily.mono : undefined,
+        }}
+      >
+        {value}
+      </dd>
+    </div>
+  );
+}
diff --git a/apps/customer-web/app/_screens/repair-journey.spec.ts b/apps/customer-web/app/_screens/repair-journey.spec.ts
new file mode 100644
index 0000000..6e02dfd
--- /dev/null
+++ b/apps/customer-web/app/_screens/repair-journey.spec.ts
@@ -0,0 +1,101 @@
+import { readFileSync } from 'node:fs';
+import { join } from 'node:path';
+import { describe, expect, it } from 'vitest';
+import { CUSTOMER_STAGES, customerStage, needsCustomer } from './repair-journey';
+
+/**
+ * 🔴 A STAGE THIS FILE HAS NEVER HEARD OF HIDES SOMEBODY'S CAR.
+ *
+ * The customer's four screens are built by FILTERING on `JourneyPhase`. A stage
+ * missing from `CUSTOMER_STAGES` therefore does not throw, does not warn and
+ * does not render an error — the card falls into the fallback, and if the
+ * fallback ever changed it would fall out of every list and the owner would be
+ * told they have no repairs at all. That is indistinguishable from "you are not
+ * a customer here", and it is invisible in exactly the case where somebody is
+ * waiting for their vehicle.
+ *
+ * The identical class already bit this repo twice: the mobile detail screen read
+ * `stageOptions` when the API returns `allowedStages` (an empty list, rendered
+ * as "your role cannot move this job"), and a web queue keyed on
+ * `awaiting_internal_review`, which is a BOARD COLUMN and not a stage at all.
+ *
+ * The authority is migration 006's CHECK constraint, transcribed into
+ * `job-card-stages.ts`. This reads that file rather than restating the list,
+ * because a hand-copied list drifts with the same edit that breaks it.
+ */
+describe('customer stage vocabulary', () => {
+  const source = readFileSync(
+    join(__dirname, '../../../api/src/repair/job-card-stages.ts'),
+    'utf8',
+  );
+
+  const block = /export const STAGES = \[([\s\S]*?)\] as const;/.exec(source);
+  // `.filter(Boolean)` with the predicate spelled out: `noUncheckedIndexedAccess`
+  // types a capture group as `string | undefined`, and an `undefined` sliding
+  // into this list would silently shrink the coverage this file exists to prove.
+  const known: string[] = [...(block?.[1] ?? '').matchAll(/'([a-z_]+)'/g)]
+    .map((m) => m[1])
+    .filter((s): s is string => typeof s === 'string');
+
+  it('found the real stage list to compare against', () => {
+    // Guards the regex itself. Without this, every assertion below would run
+    // against an empty list and pass while proving nothing — the "check that
+    // walks through its own gap" failure this repo keeps paying for. A nav
+    // audit once reported 21 false gaps for exactly this reason.
+    expect(block, 'could not find STAGES in job-card-stages.ts').toBeTruthy();
+    expect(known.length).toBeGreaterThan(15);
+    expect(known).toContain('repair_in_progress');
+  });
+
+  it.each(known)('%s has customer-facing wording', (stage) => {
+    expect(
```

## Findings

Reviewed `HEAD~1..HEAD`. `docs/IMPLEMENTATION_LOG.md` is absent, so I checked against `README.md`, the phase docs, and existing API/navigation contracts. I could not run `pnpm` verification because the sandbox policy rejected those commands.

- [ ] **High** — `apps/customer-web/app/_screens/repair-journey-screen.tsx:130`, `:289`  
  **What’s wrong:** `repair-proposals` only fetches `/job-cards` and tells the customer to contact the workshop. It does not show the proposal/quotation details or allow approve/decline/request changes, despite the requirement for “quotation → approve/reject/modify” and README’s “approve the work” promise.  
  **Recommended fix:** Add a customer-scoped proposal read endpoint and customer-authenticated decision endpoint, then render proposal details and real decision controls.  
  **Why it matters:** Customer approval remains off-system/staff-captured, not authenticated, authorised, audited, or recoverable as promised.

- [ ] **High** — `packages/next-shell/src/AuthErrorScreen.tsx:84` in `HEAD`  
  **What’s wrong:** `const message = (error && MESSAGES[error]) ?? FALLBACK;` crashes for `/auth/error?error=` because `message` becomes `''`, then `message.title` is read.  
  **Recommended fix:** Use `(error ? MESSAGES[error] : undefined) ?? FALLBACK` and add a unit test for blank `error`.  
  **Why it matters:** The one page meant to recover failed sign-in can white-screen. Note: the dirty working tree appears to already patch this.

- [ ] **Medium** — `apps/customer-web/app/_screens/service-history-screen.tsx:57`, `:67`, `:170`  
  **What’s wrong:** The page claims “Everything this workshop has done,” but it only renders completed job cards with original complaint, job number, date, and intake mileage. It omits actual work performed, parts used, completion notes, warranty terms, invoice/approval context.  
  **Recommended fix:** Add or consume a customer service-history summary endpoint backed by execution/proposal/quotation/parts records.  
  **Why it matters:** A customer using this for resale or recurring-fault history gets an incomplete, potentially misleading record.

- [ ] **Medium** — `.github/workflows/keep-warm.yml:43`, `:78`, `:80`  
  **What’s wrong:** Comments/name say one run warms “until the window closes,” but `timeout-minutes: 335` is shorter than the 08:00-18:00 UTC window. A morning run can hit timeout before close, likely marking the workflow failed and creating a handoff gap.  
  **Recommended fix:** Split into explicit shorter green runs or have the loop exit before timeout and document the handoff model.  
  **Why it matters:** The warmer’s stated “staying green” and coverage assumptions are not true for normal morning starts.

- [ ] **Low** — `packages/next-shell/src/AuthErrorScreen.tsx:191-197` in `HEAD`  
  **What’s wrong:** After the first automatic retry, the second render still counts down with “retrying automatically,” but `sessionStorage` prevents the retry.  
  **Recommended fix:** Check `sessionStorage` before starting the countdown and show manual retry copy when already retried.  
  **Why it matters:** The error page says it will do something it will not do, which undermines the “honest cold start” goal.
shop-keycloak, the workshop web service and
+# autoworkshop-customer. A calendar month is ~730 hours. So:
+#
+#     Keycloak warm 24/7   = ~730 h/month  = the ENTIRE allowance, alone
+#     Keycloak warm 10h×22 = ~220 h/month  = leaves ~530 h for the other three
+#
+# A round-the-clock warmer does not merely risk the budget, it consumes all of
+# it and starves the API and both web services — which is precisely how this
+# account was suspended with `suspenders: ['billing']` on 2026-07-28, and why
+# `autoworkshop-customer` 404'd for a stretch on 2026-08-03. Zero cost is a hard
+# rule (ADR-012) and NO PAID REMEDY IS TO BE PROPOSED, so the only lever is how
+# many hours to spend and when.
+#
+# The window below is therefore deliberately modest: weekdays, 08:00-18:00 UTC.
+# Ghana is UTC+0, so that is local working hours with no offset arithmetic.
+# WIDENING IT SPENDS HOURS THE OTHER THREE SERVICES NEED. Do the sum first.
+#
+# ── WHY ONE RUN LOOPS INSTEAD OF ASKING CRON FOR MORE FIRES ─────────────────
+#
+# Measured on the Solar repo across 8 workflows: GitHub delivers ~0.6 scheduled
+# runs/hour REGARDLESS of the requested rate — 12/h and 2/h both arrive at
+# ~0.6/h. Every gap exceeded Render's 15-minute idle timeout, so a 5-minute cron
+# kept nothing warm for weeks while reporting success on every run. You cannot
+# out-schedule a scheduler that is dropping you.
+#
+# So this does not depend on cron FREQUENCY, only on it eventually firing: each
+# delivered run becomes a loop that pings every 5 minutes until the window ends.
+# One landed fire covers the rest of the working day.
+#
+# `cancel-in-progress: false` is load-bearing. A landing fire is held PENDING
+# behind the live warmer rather than killing it; `true` was tried on Solar and is
+# worse, because it stops the running warmer before its replacement has a runner
+# and opens a coverage gap several times an hour.
+#
+# STAYING GREEN IS DELIBERATE. A warmer must never page anyone for a slow wake,
+# so ping failures are counted and summarised, never fatal.
+#
+# To stop entirely: disable in the Actions tab AND cancel the in-flight run, or
+# it keeps warming until the window closes.
+
+name: keep-warm
+
+on:
+  schedule:
+    # Asked often so that at least one lands inside the window; the delivered
+    # rate is ~0.6/h whatever this says. Offset minutes avoid the :00 high-load
+    # slot GitHub's own docs call the worst one. Do NOT tighten this to "fix"
+    # thin coverage — it has no measurable effect.
+    - cron: "3,18,33,48 8-17 * * 1-5"
+  workflow_dispatch: {}
+
+permissions:
+  contents: read
+
+concurrency:
+  group: keep-warm
+  cancel-in-progress: false
+
+jobs:
+  warm:
+    runs-on: ubuntu-latest
+    # The loop stops itself at the window's end; this is a backstop only.
+    timeout-minutes: 335
+    steps:
+      - name: Warm Keycloak until the window closes
+        run: |
+          # A failed ping must never kill the loop. A warmer that dies on the
+          # first slow cold wake is the exact bug that made Solar's
+          # keycloak-keepalive workflow useless.
+          set +e
+
+          # 18:00 UTC — the end of the window declared in the header. Computed
+          # from the clock rather than a fixed duration so a fire that lands at
+          # 16:40 warms for 80 minutes and stops, instead of running past the
+          # window and spending hours nobody is awake for.
+          WINDOW_END_HOUR=18
+          INTERVAL=300        # 5 min, comfortably inside Render's 15-min idle
+          # 150s, not 90s. A free-tier wake was measured at 136s on 2026-08-03,
+          # and a cap that expires MID-WAKE aborts the very wake it triggered —
+          # which is how a warmer ends up proving nothing. Do not lower this
+          # without a new measurement.
+          MAXTIME=150
+
+          # Only Keycloak. The API and the web services wake on real traffic and
+          # each one added here costs another ~220 h/month from a 750 h budget
+          # shared by four services. See the header before adding a URL.
+          URL="https://autoworkshop-keycloak.onrender.com/realms/autoworkshop/.well-known/openid-configuration"
+
+          START=$(date +%s); ROUNDS=0; FAILURES=0
+
+          summary() {
+            MINS=$(( ($(date +%s) - START) / 60 ))
+            echo "----------------------------------------"
+            echo "warmed ${MINS} min | ${ROUNDS} pings | ${FAILURES} failed"
+            if [ "$ROUNDS" -gt 0 ] && [ "$FAILURES" -eq "$ROUNDS" ]; then
+              # Every ping failed for the whole run. Warn so it is visible in the
+              # run summary, but do NOT fail: a warmer that pages people teaches
+              # them to ignore it, and this is not the outage detector.
+              echo "::warning::keep-warm: every ping failed (${FAILURES}/${ROUNDS}). Keycloak may be down."
+            fi
+          }
+          # The NORMAL way this run ends is the window closing or a newer fire
+          # superseding it — print the tally either way, or the common case
+          # leaves no record of what happened.
+          trap 'summary; exit 0' TERM INT
+
+          while [ "$(date -u +%H)" -lt "$WINDOW_END_HOUR" ]; do
+            ROUNDS=$((ROUNDS + 1))
+            # No -f: curl exits 0 for ANY HTTP response, including 5xx. Correct
+            # for a warmer — a 500 still proves the container answered, which is
+            # the only thing being measured. Judging health is not this job.
+            OUT=$(curl -sS --max-time "$MAXTIME" -o /dev/null -w "%{http_code} in %{time_total}s" "$URL" 2>&1)
+            if [ $? -ne 0 ]; then
+              FAILURES=$((FAILURES + 1))
+              echo "  WARN $(echo "$OUT" | tr '\n' ' ')"
+            else
+              echo "  ok   ${OUT}"
+            fi
+            # Re-check the hour BEFORE sleeping, so the last cycle of the day
+            # does not sleep five minutes past the window just to exit.
+            [ "$(date -u +%H)" -lt "$WINDOW_END_HOUR" ] || break
+            sleep "$INTERVAL"
+          done
+
+          summary
diff --git a/apps/admin-web/app/auth/error/page.tsx b/apps/admin-web/app/auth/error/page.tsx
new file mode 100644
index 0000000..33287ec
--- /dev/null
+++ b/apps/admin-web/app/auth/error/page.tsx
@@ -0,0 +1,24 @@
+import { AuthErrorScreen } from '@autoworkshop/next-shell';
+
+/**
+ * /auth/error — where `pages.error` sends a failed sign-in.
+ *
+ * ⚠️ THIS ROUTE MUST EXIST IN ALL SEVEN APPS. `workspace-auth.ts` sets
+ * `pages.error` for every workspace from one shared config, so an app without
+ * this file turns a recoverable Keycloak cold start into a 404 — strictly worse
+ * than the default screen it replaced. `auth-error-route.spec.ts` asserts all
+ * seven are present.
+ *
+ * Deliberately NOT gated: it is reached BY someone who could not sign in.
+ */
+export const dynamic = 'force-dynamic';
+
+export default async function Page({
+  searchParams,
+}: {
+  searchParams: Promise<{ error?: string }>;
+}) {
+  // Next 15: `searchParams` is a promise.
+  const { error } = await searchParams;
+  return <AuthErrorScreen error={error} />;
+}
diff --git a/apps/customer-web/app/(app)/my-vehicles/service-history/page.tsx b/apps/customer-web/app/(app)/my-vehicles/service-history/page.tsx
new file mode 100644
index 0000000..9b8fcae
--- /dev/null
+++ b/apps/customer-web/app/(app)/my-vehicles/service-history/page.tsx
@@ -0,0 +1,17 @@
+import { requireNavRoute } from '@autoworkshop/next-shell';
+import { ServiceHistoryScreen } from '../../../_screens/service-history-screen';
+
+/**
+ * /my-vehicles/service-history — `01 (1).txt` §33, the customer workspace.
+ *
+ * ⚠️ `requireNavRoute` resolves against the viewer's VISIBLE NAVIGATION and is
+ * not authentication — see `/my-vehicles/garage` for the full reasoning. The
+ * real scoping is `JobCardService.list`'s customer predicate plus RLS.
+ */
+export const dynamic = 'force-dynamic';
+
+export default async function Page() {
+  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
+  await requireNavRoute('customer', '/my-vehicles/service-history');
+  return <ServiceHistoryScreen />;
+}
diff --git a/apps/customer-web/app/(app)/service-and-repairs/completed-repairs/page.tsx b/apps/customer-web/app/(app)/service-and-repairs/completed-repairs/page.tsx
new file mode 100644
index 0000000..dfab865
--- /dev/null
+++ b/apps/customer-web/app/(app)/service-and-repairs/completed-repairs/page.tsx
@@ -0,0 +1,22 @@
+import { requireNavRoute } from '@autoworkshop/next-shell';
+import { RepairJourneyScreen } from '../../../_screens/repair-journey-screen';
+
+/**
+ * /service-and-repairs/completed-repairs — `01 (1).txt` §33, the customer workspace.
+ *
+ * ⚠️ `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION.
+ * It is not authentication: the §33 tree has no per-role variants and no
+ * permission on this item, so a signed-out visitor reaches the page, `apiGet`
+ * finds no token, and the screen renders its unauthenticated state. Same
+ * reasoning as `/my-vehicles/garage`, where Codex corrected the opposite claim.
+ *
+ * NOT the control either way. `JobCardService.list` narrows a `customer` viewer
+ * to cards against their OWN vehicles, and RLS isolates the tenant beneath that.
+ */
+export const dynamic = 'force-dynamic';
+
+export default async function Page() {
+  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
+  await requireNavRoute('customer', '/service-and-repairs/completed-repairs');
+  return <RepairJourneyScreen view="finished" />;
+}
diff --git a/apps/customer-web/app/(app)/service-and-repairs/repair-proposals/page.tsx b/apps/customer-web/app/(app)/service-and-repairs/repair-proposals/page.tsx
new file mode 100644
index 0000000..3e56a9c
--- /dev/null
+++ b/apps/customer-web/app/(app)/service-and-repairs/repair-proposals/page.tsx
@@ -0,0 +1,22 @@
+import { requireNavRoute } from '@autoworkshop/next-shell';
+import { RepairJourneyScreen } from '../../../_screens/repair-journey-screen';
+
+/**
+ * /service-and-repairs/repair-proposals — `01 (1).txt` §33, the customer workspace.
+ *
+ * ⚠️ `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION.
+ * It is not authentication: the §33 tree has no per-role variants and no
+ * permission on this item, so a signed-out visitor reaches the page, `apiGet`
+ * finds no token, and the screen renders its unauthenticated state. Same
+ * reasoning as `/my-vehicles/garage`, where Codex corrected the opposite claim.
+ *
+ * NOT the control either way. `JobCardService.list` narrows a `customer` viewer
+ * to cards against their OWN vehicles, and RLS isolates the tenant beneath that.
+ */
+export const dynamic = 'force-dynamic';
+
+export default async function Page() {
+  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
+  await requireNavRoute('customer', '/service-and-repairs/repair-proposals');
+  return <RepairJourneyScreen view="needs-you" />;
+}
diff --git a/apps/customer-web/app/(app)/service-and-repairs/repair-tracking/page.tsx b/apps/customer-web/app/(app)/service-and-repairs/repair-tracking/page.tsx
new file mode 100644
index 0000000..ef07c32
--- /dev/null
+++ b/apps/customer-web/app/(app)/service-and-repairs/repair-tracking/page.tsx
@@ -0,0 +1,22 @@
+import { requireNavRoute } from '@autoworkshop/next-shell';
+import { RepairJourneyScreen } from '../../../_screens/repair-journey-screen';
+
+/**
+ * /service-and-repairs/repair-tracking — `01 (1).txt` §33, the customer workspace.
+ *
+ * ⚠️ `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION.
+ * It is not authentication: the §33 tree has no per-role variants and no
+ * permission on this item, so a signed-out visitor reaches the page, `apiGet`
+ * finds no token, and the screen renders its unauthenticated state. Same
+ * reasoning as `/my-vehicles/garage`, where Codex corrected the opposite claim.
+ *
+ * NOT the control either way. `JobCardService.list` narrows a `customer` viewer
+ * to cards against their OWN vehicles, and RLS isolates the tenant beneath that.
+ */
+export const dynamic = 'force-dynamic';
+
+export default async function Page() {
+  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
+  await requireNavRoute('customer', '/service-and-repairs/repair-tracking');
+  return <RepairJourneyScreen view="open" />;
+}
diff --git a/apps/customer-web/app/(app)/service-and-repairs/service-requests/page.tsx b/apps/customer-web/app/(app)/service-and-repairs/service-requests/page.tsx
new file mode 100644
index 0000000..fe200fe
--- /dev/null
+++ b/apps/customer-web/app/(app)/service-and-repairs/service-requests/page.tsx
@@ -0,0 +1,22 @@
+import { requireNavRoute } from '@autoworkshop/next-shell';
+import { RepairJourneyScreen } from '../../../_screens/repair-journey-screen';
+
+/**
+ * /service-and-repairs/service-requests — `01 (1).txt` §33, the customer workspace.
+ *
+ * ⚠️ `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION.
+ * It is not authentication: the §33 tree has no per-role variants and no
+ * permission on this item, so a signed-out visitor reaches the page, `apiGet`
+ * finds no token, and the screen renders its unauthenticated state. Same
+ * reasoning as `/my-vehicles/garage`, where Codex corrected the opposite claim.
+ *
+ * NOT the control either way. `JobCardService.list` narrows a `customer` viewer
+ * to cards against their OWN vehicles, and RLS isolates the tenant beneath that.
+ */
+export const dynamic = 'force-dynamic';
+
+export default async function Page() {
+  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
+  await requireNavRoute('customer', '/service-and-repairs/service-requests');
+  return <RepairJourneyScreen view="all" />;
+}
diff --git a/apps/customer-web/app/_screens/repair-journey-screen.tsx b/apps/customer-web/app/_screens/repair-journey-screen.tsx
new file mode 100644
index 0000000..f7fc372
--- /dev/null
+++ b/apps/customer-web/app/_screens/repair-journey-screen.tsx
@@ -0,0 +1,326 @@
+import { Suspense } from 'react';
+import Link from 'next/link';
+import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
+import { EmptyState, LoadingState, PageHeader, StatusBadge } from '@autoworkshop/ui';
+import { primitive, themeVar } from '@autoworkshop/design-tokens';
+import { customerStage, needsCustomer, type JourneyPhase } from './repair-journey';
+
+/**
+ * The customer's repair journey — `01 (1).txt` §33's `service-and-repairs` group.
+ *
+ * ONE screen at FOUR routes, following `job-card-detail-screen.tsx`, which is
+ * mounted at four role-tree routes for the same reason: the four differ only in
+ * WHICH of the customer's cards they show and how the empty state reads. Four
+ * near-identical files would be four places to fix the next bug in.
+ *
+ *   /service-and-repairs/service-requests    every request, newest first
+ *   /service-and-repairs/repair-tracking     the ones still open
+ *   /service-and-repairs/repair-proposals    the ones waiting on the customer
+ *   /service-and-repairs/completed-repairs   the ones that are done
+ *
+ * ⚠️ THE FILTER HERE IS PRESENTATION, NOT ACCESS CONTROL. `JobCardService.list`
+ * narrows a `customer` viewer to cards raised against their OWN vehicles — one
+ * `c.user_id` predicate in the SQL — and Postgres RLS isolates the tenant
+ * underneath that. Both hold whatever this file does. If this component were
+ * deleted the data would still be correctly scoped; if the service's predicate
+ * were deleted, no amount of filtering here would save it (CLAUDE.md §8).
+ */
+
+export const dynamic = 'force-dynamic';
+
+/**
+ * ⚠️ THESE NAMES ARE THE API'S, NOT PLAUSIBLE ONES.
+ * `JobCard` in `apps/api/src/repair/job-card.service.ts` is the contract. The
+ * mobile app once read `stageOptions` where the API returns `allowedStages`;
+ * nothing threw, the list was empty, and every user — owners included — was told
+ * "your role cannot move this job". A wrong field name here would render a blank
+ * card rather than an error.
+ */
+interface JobCardRow {
+  id: string;
+  jobNumber: string;
+  vehicleId: string;
+  registrationNumber: string;
+  vehicleDescription: string;
+  complaint: string;
+  stage: string;
+  priority: string;
+  assignedTechnicianName: string | null;
+  expectedCompletionOn: string | null;
+  openedAt: string;
+  stageChangedAt: string;
+  closedAt: string | null;
+}
+
+export type JourneyView = 'all' | 'open' | 'needs-you' | 'finished';
+
+const VIEWS: Record<
+  JourneyView,
+  {
+    title: string;
+    description: string;
+    emptyTitle: string;
+    emptyDescription: string;
+    keep: (card: JobCardRow) => boolean;
+  }
+> = {
+  all: {
+    title: 'My Service Requests',
+    description:
+      'Every repair you have asked this workshop for, newest first — including the ones already finished.',
+    emptyTitle: 'You have not requested any repairs yet',
+    emptyDescription:
+      'Report a problem with one of your vehicles and the request will appear here, with its progress.',
+    keep: () => true,
+  },
+  open: {
+    title: 'Repair Tracking',
+    description: 'Where each of your vehicles has got to. Updated as the workshop moves the job on.',
+    emptyTitle: 'Nothing is in for repair',
+    emptyDescription:
+      'When you report a problem and the workshop takes the vehicle in, you can follow its progress here.',
+    keep: (c) => phaseOf(c) !== 'finished',
+  },
+  'needs-you': {
+    title: 'Repair Proposals and Approvals',
+    description:
+      'The repairs that cannot go any further until you do something — approve a quote, pay a deposit, answer a question or collect the vehicle.',
+    emptyTitle: 'Nothing is waiting on you',
+    emptyDescription:
+      'When the workshop needs your approval, a deposit or an answer, it will appear here. Nothing starts on your vehicle without it.',
+    keep: (c) => needsCustomer(c.stage),
+  },
+  finished: {
+    title: 'Completed Repairs',
+    description: 'Work this workshop has finished on your vehicles.',
+    emptyTitle: 'No completed repairs yet',
+    emptyDescription: 'Once a repair is finished and the vehicle handed back, it is recorded here.',
+    keep: (c) => phaseOf(c) === 'finished',
+  },
+};
+
+function phaseOf(card: JobCardRow): JourneyPhase {
+  return customerStage(card.stage).phase;
+}
+
+function when(iso: string): string {
+  // Fixed locale, not the server's. A date that renders differently on two
+  // machines gets reported as a data bug.
+  return new Date(iso).toLocaleDateString('en-GB', {
+    day: 'numeric',
+    month: 'short',
+    year: 'numeric',
+  });
+}
+
+export function RepairJourneyScreen({ view }: { view: JourneyView }) {
+  const config = VIEWS[view];
+  return (
+    <>
+      <PageHeader title={config.title} description={config.description} />
+      <Suspense fallback={<LoadingState label="Loading your repairs…" />}>
+        <JourneyList view={view} />
+      </Suspense>
+    </>
+  );
+}
+
+async function JourneyList({ view }: { view: JourneyView }) {
+  const config = VIEWS[view];
+  const result = await apiGet<JobCardRow[]>('customer', '/job-cards');
+
+  if (!result.ok) {
+    // Covers `unauthenticated` too, which is the normal state for a signed-out
+    // visitor: `requireNavRoute` does not refuse them (see the page comment),
+    // so this is where they are told to sign in.
+    return <ApiFailure reason={result.reason} workspaceId="customer" />;
+  }
+
+  const cards = result.data.filter(config.keep);
+
+  if (cards.length === 0) {
+    return <EmptyState title={config.emptyTitle} description={config.emptyDescription} />;
+  }
+
+  // Newest first. The API orders for the workshop's purposes; a customer with
+  // three cars wants the thing that happened most recently at the top.
+  const ordered = [...cards].sort(
+    (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime(),
+  );
+
+  const waiting = ordered.filter((c) => needsCustomer(c.stage)).length;
+
+  return (
+    <>
+      {/*
+        On every view EXCEPT the one that is already only these cards. Telling
+        someone "2 need you" on the page listing exactly those two is noise.
+      */}
+      {view !== 'needs-you' && waiting > 0 ? (
+        <p
+          style={{
+            margin: `0 0 ${primitive.space[4]}`,
+            padding: primitive.space[3],
+            borderRadius: primitive.radius.md,
+            border: `1px solid ${themeVar.borderDefault}`,
+            background: themeVar.surfaceRaised,
+            fontSize: primitive.fontSize.sm,
+          }}
+        >
+          <strong>{waiting}</strong>{' '}
+          {waiting === 1 ? 'repair is waiting on you' : 'repairs are waiting on you'}.{' '}
+          <Link href="/service-and-repairs/repair-proposals">See what is needed</Link>
+        </p>
+      ) : null}
+
+      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: primitive.space[4] }}>
+        {ordered.map((card) => (
+          <JourneyCard key={card.id} card={card} />
+        ))}
+      </ul>
+    </>
+  );
+}
+
+function JourneyCard({ card }: { card: JobCardRow }) {
+  const stage = customerStage(card.stage);
+  const yours = stage.phase === 'needs_you';
+
+  return (
+    <li
+      style={{
+        // A card the customer must act on is outlined in the attention colour.
+        // The badge alone was not enough at a glance on a phone, which is where
+        // most of these are read.
+        border: `1px solid ${yours ? themeVar.statusAttention : themeVar.borderDefault}`,
+        borderLeft: `4px solid ${yours ? themeVar.statusAttention : themeVar.borderDefault}`,
+        borderRadius: primitive.radius.lg,
+        padding: primitive.space[4],
+        background: themeVar.surfaceRaised,
+      }}
+    >
+      <div
+        style={{
+          display: 'flex',
+          flexWrap: 'wrap',
+          gap: primitive.space[3],
+          alignItems: 'baseline',
+          justifyContent: 'space-between',
+        }}
+      >
+        <div style={{ display: 'flex', flexWrap: 'wrap', gap: primitive.space[3], alignItems: 'baseline' }}>
+          <span
+            style={{
+              // A registration is read out over the phone character by
+              // character — same reasoning as the order number on §2845.
+              fontFamily: primitive.fontFamily.mono,
+              fontSize: primitive.fontSize.base,
+              fontWeight: 600,
+              letterSpacing: '0.04em',
+            }}
+          >
+            {card.registrationNumber}
+          </span>
+          <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
+            {card.vehicleDescription}
+          </span>
+        </div>
+        <StatusBadge kind={stage.badge} label={stage.label} />
+      </div>
+
+      <p style={{ margin: `${primitive.space[3]} 0 0`, fontSize: primitive.fontSize.sm }}>
+        {stage.detail}
+      </p>
+
+      <p
+        style={{
+          margin: `${primitive.space[2]} 0 0`,
+          color: themeVar.textSecondary,
+          fontSize: primitive.fontSize.sm,
+        }}
+      >
+        {/* What they reported, so the card is identifiable when they have several. */}
+        “{card.complaint}”
+      </p>
+
+      <dl
+        style={{
+          display: 'grid',
+          gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))',
+          gap: primitive.space[3],
+          margin: `${primitive.space[4]} 0 0`,
+          fontSize: primitive.fontSize.sm,
+        }}
+      >
+        <Fact label="Job number" value={card.jobNumber} mono />
+        <Fact label="Requested" value={when(card.openedAt)} />
+        <Fact
+          label="Expected back"
+          value={card.expectedCompletionOn ? when(card.expectedCompletionOn) : 'Not yet estimated'}
+        />
+        {/*
+          The technician's name only once there IS one. "Unassigned" reads as a
+          complaint about the workshop rather than as the normal state of a job
+          that arrived an hour ago.
+        */}
+        {card.assignedTechnicianName ? (
+          <Fact label="Technician" value={card.assignedTechnicianName} />
+        ) : null}
+      </dl>
+
+      {yours ? (
+        <p
+          style={{
+            margin: `${primitive.space[4]} 0 0`,
+            fontSize: primitive.fontSize.sm,
+            fontWeight: 600,
+          }}
+        >
+          {/*
+            🔴 AN HONEST NEXT STEP, NOT A BUTTON THAT DOES NOTHING.
+            Approving a proposal in-app is `POST /proposals/:id/decision`, and
+            that route is written for a staff member CAPTURING the customer's
+            answer — `decidedByName` is the customer while the session is the
+            workshop's. A self-service decision needs its own authenticated
+            route; until it exists, offering a button here would be a control
+            that silently fails, which this repo has now shipped once (a form
+            with no submit button) and does not need again.
+          */}
+          Contact the workshop to {actionFor(card.stage)}.
+        </p>
+      ) : null}
+    </li>
+  );
+}
+
+/** The verb for the one thing this customer has to do. */
+function actionFor(stage: string): string {
+  switch (stage) {
+    case 'awaiting_customer_approval':
+      return 'approve or decline the repair proposal';
+    case 'awaiting_deposit':
+      return 'pay the deposit so work can start';
+    case 'further_information_required':
+      return 'answer their question';
+    case 'ready_for_collection':
+      return 'arrange collection of your vehicle';
+    default:
+      return 'find out what is needed';
+  }
+}
+
+function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
+  return (
+    <div>
+      <dt style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.xs }}>{label}</dt>
+      <dd
+        style={{
+          margin: 0,
+          fontFamily: mono ? primitive.fontFamily.mono : undefined,
+        }}
+      >
+        {value}
+      </dd>
+    </div>
+  );
+}
diff --git a/apps/customer-web/app/_screens/repair-journey.spec.ts b/apps/customer-web/app/_screens/repair-journey.spec.ts
new file mode 100644
index 0000000..6e02dfd
--- /dev/null
+++ b/apps/customer-web/app/_screens/repair-journey.spec.ts
@@ -0,0 +1,101 @@
+import { readFileSync } from 'node:fs';
+import { join } from 'node:path';
+import { describe, expect, it } from 'vitest';
+import { CUSTOMER_STAGES, customerStage, needsCustomer } from './repair-journey';
+
+/**
+ * 🔴 A STAGE THIS FILE HAS NEVER HEARD OF HIDES SOMEBODY'S CAR.
+ *
+ * The customer's four screens are built by FILTERING on `JourneyPhase`. A stage
+ * missing from `CUSTOMER_STAGES` therefore does not throw, does not warn and
+ * does not render an error — the card falls into the fallback, and if the
+ * fallback ever changed it would fall out of every list and the owner would be
+ * told they have no repairs at all. That is indistinguishable from "you are not
+ * a customer here", and it is invisible in exactly the case where somebody is
+ * waiting for their vehicle.
+ *
+ * The identical class already bit this repo twice: the mobile detail screen read
+ * `stageOptions` when the API returns `allowedStages` (an empty list, rendered
+ * as "your role cannot move this job"), and a web queue keyed on
+ * `awaiting_internal_review`, which is a BOARD COLUMN and not a stage at all.
+ *
+ * The authority is migration 006's CHECK constraint, transcribed into
+ * `job-card-stages.ts`. This reads that file rather than restating the list,
+ * because a hand-copied list drifts with the same edit that breaks it.
+ */
+describe('customer stage vocabulary', () => {
+  const source = readFileSync(
+    join(__dirname, '../../../api/src/repair/job-card-stages.ts'),
+    'utf8',
+  );
+
+  const block = /export const STAGES = \[([\s\S]*?)\] as const;/.exec(source);
+  // `.filter(Boolean)` with the predicate spelled out: `noUncheckedIndexedAccess`
+  // types a capture group as `string | undefined`, and an `undefined` sliding
+  // into this list would silently shrink the coverage this file exists to prove.
+  const known: string[] = [...(block?.[1] ?? '').matchAll(/'([a-z_]+)'/g)]
+    .map((m) => m[1])
+    .filter((s): s is string => typeof s === 'string');
+
+  it('found the real stage list to compare against', () => {
+    // Guards the regex itself. Without this, every assertion below would run
+    // against an empty list and pass while proving nothing — the "check that
+    // walks through its own gap" failure this repo keeps paying for. A nav
+    // audit once reported 21 false gaps for exactly this reason.
+    expect(block, 'could not find STAGES in job-card-stages.ts').toBeTruthy();
+    expect(known.length).toBeGreaterThan(15);
+    expect(known).toContain('repair_in_progress');
+  });
+
+  it.each(known)('%s has customer-facing wording', (stage) => {
+    expect(
```
codex
I’ll review this as a code-review pass against the repo’s stated requirements, focusing on defects and partial implementations rather than making changes. I’m going to read the README, implementation log, and the touched files around the new routes/screens/tests.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"service-and-repairs|my-vehicles|repair-proposals|completed-repairs|service-history|AuthErrorScreen|pages\\.error|keep-warm|JobCardService|customer\" README.md docs apps packages -g \"*.md\" -g \"*.ts\" -g \"*.tsx\" -g \"*.yml\"" in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-ChildItem -Force; if (Test-Path README.md) { Get-Content README.md -TotalCount 260 }; if (Test-Path docs/IMPLEMENTATION_LOG.md) { Get-Content docs/IMPLEMENTATION_LOG.md -TotalCount 260 }' in C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-ChildItem -Force; if (Test-Path README.md) { Get-Content README.md -TotalCount 260 }; if (Test-Path docs/IMPLEMENTATION_LOG.md) { Get-Content docs/IMPLEMENTATION_LOG.md -TotalCount 260 }'` rejected: blocked by policy
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git diff --stat HEAD~1..HEAD; git diff --name-only HEAD~1..HEAD' in C:\Users\USER\Documents\autoworkshop-ai
2026-08-04T12:48:45.802052Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-ChildItem -Force; if (Test-Path README.md) { Get-Content README.md -TotalCount 260 }; if (Test-Path docs/IMPLEMENTATION_LOG.md) { Get-Content docs/IMPLEMENTATION_LOG.md -TotalCount 260 }'` rejected: blocked by policy
 succeeded in 1270ms:
 .github/workflows/keep-warm.yml                    | 140 +++++++++
 apps/admin-web/app/auth/error/page.tsx             |  24 ++
 .../app/(app)/my-vehicles/service-history/page.tsx |  17 ++
 .../service-and-repairs/completed-repairs/page.tsx |  22 ++
 .../service-and-repairs/repair-proposals/page.tsx  |  22 ++
 .../service-and-repairs/repair-tracking/page.tsx   |  22 ++
 .../service-and-repairs/service-requests/page.tsx  |  22 ++
 .../app/_screens/repair-journey-screen.tsx         | 326 +++++++++++++++++++++
 .../app/_screens/repair-journey.spec.ts            | 101 +++++++
 apps/customer-web/app/_screens/repair-journey.ts   | 213 ++++++++++++++
 .../app/_screens/service-history-screen.tsx        | 196 +++++++++++++
 apps/customer-web/app/auth/error/page.tsx          |  24 ++
 apps/customer-web/package.json                     |   5 +-
 apps/fleet-web/app/auth/error/page.tsx             |  24 ++
 apps/insurance-web/app/auth/error/page.tsx         |  24 ++
 apps/supplier-web/app/auth/error/page.tsx          |  24 ++
 apps/towing-web/app/auth/error/page.tsx            |  24 ++
 apps/workshop-web/app/auth/error/page.tsx          |  24 ++
 packages/auth/src/auth-error-route.test.ts         |  61 ++++
 packages/auth/src/workspace-auth.ts                |  27 +-
 packages/auth/vitest.config.ts                     |   9 +-
 packages/design-tokens/src/primitive.ts            |  18 +-
 .../marketplace-ui/src/marketplace-landing.tsx     |  60 +++-
 packages/next-shell/src/AuthErrorScreen.tsx        | 204 +++++++++++++
 packages/next-shell/src/index.ts                   |   8 +
 packages/next-shell/vitest.config.ts               |   9 +-
 packages/ui/vitest.config.ts                       |   9 +-
 pnpm-lock.yaml                                     |   3 +
 scripts/audit-menu-coverage.mjs                    |  75 +++--
 29 files changed, 1695 insertions(+), 42 deletions(-)
.github/workflows/keep-warm.yml
apps/admin-web/app/auth/error/page.tsx
apps/customer-web/app/(app)/my-vehicles/service-history/page.tsx
apps/customer-web/app/(app)/service-and-repairs/completed-repairs/page.tsx
apps/customer-web/app/(app)/service-and-repairs/repair-proposals/page.tsx
apps/customer-web/app/(app)/service-and-repairs/repair-tracking/page.tsx
apps/customer-web/app/(app)/service-and-repairs/service-requests/page.tsx
apps/customer-web/app/_screens/repair-journey-screen.tsx
apps/customer-web/app/_screens/repair-journey.spec.ts
apps/customer-web/app/_screens/repair-journey.ts
apps/customer-web/app/_screens/service-history-screen.tsx
apps/customer-web/app/auth/error/page.tsx
apps/customer-web/package.json
apps/fleet-web/app/auth/error/page.tsx
apps/insurance-web/app/auth/error/page.tsx
apps/supplier-web/app/auth/error/page.tsx
apps/towing-web/app/auth/error/page.tsx
apps/workshop-web/app/auth/error/page.tsx
packages/auth/src/auth-error-route.test.ts
packages/auth/src/workspace-auth.ts
packages/auth/vitest.config.ts
packages/design-tokens/src/primitive.ts
packages/marketplace-ui/src/marketplace-landing.tsx
packages/next-shell/src/AuthErrorScreen.tsx
packages/next-shell/src/index.ts
packages/next-shell/vitest.config.ts
packages/ui/vitest.config.ts
pnpm-lock.yaml
scripts/audit-menu-coverage.mjs

 succeeded in 7712ms:
README.md:56:apps/        customer-web workshop-web supplier-web fleet-web insurance-web towing-web admin-web
packages\marketplace-ui\src\public-api.ts:14: * would be the first step toward "just read the customer's vehicles too".
packages\marketplace-ui\src\marketplace-landing.tsx:36: * looked at by customers. Its card scale, read from `templates/landing.html`:
packages\marketplace-ui\src\marketplace-landing.tsx:151:   * The basket is `customer-web`'s: it is a client component writing that app's
apps\workshop-web\app\_screens\vehicles-screen.tsx:11: * `customers-screen.tsx` for why that is necessary; the same role trees route
apps\workshop-web\app\_screens\vehicles-screen.tsx:14: *   · §34 default    `/customer-reception/vehicles`
apps\workshop-web\app\_screens\vehicles-screen.tsx:15: *   · §46 owner      `/customers-and-vehicles/vehicles`
apps\workshop-web\app\_screens\vehicles-screen.tsx:19: * not a plain vehicle attribute is a JOIN: the owner is `customer_id` →
apps\workshop-web\app\_screens\vehicles-screen.tsx:20: * `core.customers.display_name`, the make is `make_id` →
apps\workshop-web\app\_screens\vehicles-screen.tsx:22: * None of it is stored twice, so renaming a customer once corrects every row
apps\workshop-web\app\_screens\vehicles-screen.tsx:28:  customerName: string;
apps\workshop-web\app\_screens\vehicles-screen.tsx:47:  // As the customers screen: the add target differs per tree, so it comes from
apps\workshop-web\app\_screens\vehicles-screen.tsx:58:        description="Every vehicle registered to this workshop's customers, newest first."
apps\workshop-web\app\_screens\vehicles-screen.tsx:79:        description="Vehicles are registered against a customer at reception or vehicle intake. None have been recorded for this organisation."
apps\workshop-web\app\_screens\vehicles-screen.tsx:139:              <td style={{ padding: primitive.space[3], color: themeVar.textSecondary }}>{v.customerName}</td>
apps\workshop-web\app\_screens\vehicle-detail-screen.tsx:10: * The owner's name is a JOIN, and it is also a LINK to that customer, which is
apps\workshop-web\app\_screens\vehicle-detail-screen.tsx:12: * `customer_id` that guarantees integrity is what lets this page point at the
apps\workshop-web\app\_screens\vehicle-detail-screen.tsx:21:  customerId: string;
apps\workshop-web\app\_screens\vehicle-detail-screen.tsx:22:  customerName: string;
apps\workshop-web\app\_screens\vehicle-detail-screen.tsx:78:  customerHrefBase,
apps\workshop-web\app\_screens\vehicle-detail-screen.tsx:82:  /** Where this role reads customers, so the owner link lands somewhere they may go. */
apps\workshop-web\app\_screens\vehicle-detail-screen.tsx:83:  customerHrefBase: string;
apps\workshop-web\app\_screens\vehicle-detail-screen.tsx:111:          href={`${customerHrefBase}/${v.customerId}`}
apps\workshop-web\app\_screens\vehicle-detail-screen.tsx:114:          {v.customerName}
apps\workshop-web\app\_screens\variations-screen.tsx:66:  internally_reviewed: 'Reviewed — not yet sent to the customer',
apps\workshop-web\app\_screens\variations-screen.tsx:67:  sent_to_customer: 'With the customer',
apps\workshop-web\app\_screens\variations-screen.tsx:76:  if (status === 'sent_to_customer') return 'attention';
apps\workshop-web\app\_screens\variations-screen.tsx:87:        description="Additional work found during a repair. Chargeable work waits for the customer's approval — it is not authorised until they say yes."
apps\workshop-web\app\_screens\variations-screen.tsx:186:        customer approves.
apps\workshop-web\app\_screens\variations-screen.tsx:207:  const open = ['draft', 'internally_reviewed', 'sent_to_customer'].includes(v.status);
apps\workshop-web\app\_screens\variations-screen.tsx:269:            ? 'NOT AUTHORISED — do not start this work. It is chargeable and the customer has not approved it.'
apps\workshop-web\app\_screens\variations-screen.tsx:273:      <Detail label="The customer's original complaint" value={v.originalComplaint} />
apps\workshop-web\app\_screens\variations-screen.tsx:299:      {open && v.mayReview && v.status === 'sent_to_customer' && (
apps\workshop-web\app\_screens\variations-screen.tsx:317:              'internal review before the customer is asked.'
apps\workshop-web\app\_screens\variations-screen.tsx:318:            : 'A supervisor, manager or the owner reviews this and records the customer’s answer.'}
apps\workshop-web\app\_screens\variation-forms.tsx:17: * raises; somebody else reviews; a reviewer records the customer's answer. That
apps\workshop-web\app\_screens\variation-forms.tsx:59:        hint="The unexpected finding, in the words you would use to the customer."
apps\workshop-web\app\_screens\variation-forms.tsx:79:        hint="Enter 0 if there is no charge. A chargeable variation cannot start until the customer approves."
apps\workshop-web\app\_screens\variation-forms.tsx:124:            'customer, and approved before it is authorised.'
apps\workshop-web\app\_screens\variation-forms.tsx:125:          : 'No charge. It still needs internal review and the customer should be told, but no ' +
apps\workshop-web\app\_screens\variation-forms.tsx:147:        <SubmitButton>Review and send to the customer</SubmitButton>
apps\workshop-web\app\_screens\variation-forms.tsx:162: * Record what the customer said.
apps\workshop-web\app\_screens\variation-forms.tsx:189:      <Field label="What did the customer say?" htmlFor="decision">
apps\workshop-web\app\_screens\variation-forms.tsx:210:            hint="The customer's name. A chargeable approval needs a name against it."
apps\workshop-web\app\_screens\variation-forms.tsx:259:          changed afterwards — if the customer wants something different, choose
apps\workshop-web\app\_screens\variation-forms.tsx:265:        <SubmitButton>Record the customer&rsquo;s answer</SubmitButton>
apps\workshop-web\app\_screens\variation-actions.ts:17: * raised it, and any edit to the cost once the customer has been asked. These
apps\workshop-web\app\_screens\variation-actions.ts:67:      'Raised. It must be reviewed internally before the customer sees it, and no chargeable ' +
apps\workshop-web\app\_screens\variation-actions.ts:72:/** §3792 — reviewed internally, and optionally sent to the customer at once. */
apps\workshop-web\app\_screens\variation-actions.ts:87:      ? 'Reviewed and sent to the customer. Record their answer when you have it.'
apps\workshop-web\app\_screens\variation-actions.ts:88:      : 'Reviewed. Send it to the customer when you are ready.',
apps\workshop-web\app\_screens\variation-actions.ts:93: * Record the customer's answer.
apps\workshop-web\app\_screens\testing-queue-screen.tsx:29:  customerName: string;
apps\workshop-web\app\_screens\testing-queue-screen.tsx:168:                  <td style={cell}>{card.customerName}</td>
apps\workshop-web\app\_screens\staging-board-screen.tsx:31: * `JobCardService.changeStage`, so it would gain nothing by being dragged.
apps\workshop-web\app\_screens\staging-board-screen.tsx:45:  customerName: string;
apps\workshop-web\app\_screens\staging-board-screen.tsx:85:  awaiting_customer_approval: 'Awaiting customer approval',
apps\workshop-web\app\_screens\staging-board-screen.tsx:152:        description="A job card appears here as soon as a vehicle is booked in or a customer reports a problem."
apps\workshop-web\app\_screens\staging-board-screen.tsx:179:          // cards and customer pages stayed at 1280. A flex/grid ancestor sizes
apps\workshop-web\app\_screens\staging-board-screen.tsx:342:        {card.customerName}
apps\workshop-web\app\_screens\stage-actions.ts:20: * lives in `JobCardService.changeStage`: the role's permitted stages
apps\workshop-web\app\_screens\stage-actions.ts:30: * There, a refusal meant "your account cannot register customers" — the person
apps\workshop-web\app\_screens\repair-plan-review-form.tsx:150:          customer will take elsewhere — but nothing on the plan says so. Ask before
apps\workshop-web\app\_screens\repair-plan-queue-screen.tsx:37: * an unreviewed plan is a car sitting in a bay and a customer waiting for a price.
apps\workshop-web\app\_screens\repair-plan-queue-screen.tsx:51:  customerName: string;
apps\workshop-web\app\_screens\repair-plan-queue-screen.tsx:82: * `solution_preparation` is where a plan is built. `awaiting_customer_approval` is
apps\workshop-web\app\_screens\repair-plan-queue-screen.tsx:84: * `awaiting_customer_approval → solution_preparation`, so a job whose customer asked
apps\workshop-web\app\_screens\repair-plan-queue-screen.tsx:89:const QUEUE_STAGES = ['solution_preparation', 'awaiting_customer_approval'];
apps\workshop-web\app\_screens\repair-plan-queue-screen.tsx:231:                  <td style={cell}>{card.customerName}</td>
apps\workshop-web\app\_screens\register-vehicle-screen.tsx:24: * chosen from the real customer list and the make from the real taxonomy, so the
apps\workshop-web\app\_screens\register-vehicle-screen.tsx:25: * form submits `customerId` and `makeId` — foreign keys — not typed-in names.
apps\workshop-web\app\_screens\register-vehicle-screen.tsx:30: * the customer picker is already tenant- and organization-scoped by
apps\workshop-web\app\_screens\register-vehicle-screen.tsx:48:  const [customers, makes] = await Promise.all([
apps\workshop-web\app\_screens\register-vehicle-screen.tsx:49:    apiGet<CustomerOption[]>('workshop', '/customers'),
apps\workshop-web\app\_screens\register-vehicle-screen.tsx:56:      description="Register a vehicle against an existing customer. Registration number, owner and make are required."
apps\workshop-web\app\_screens\register-vehicle-screen.tsx:60:  if (!customers.ok || !makes.ok) {
apps\workshop-web\app\_screens\register-vehicle-screen.tsx:63:    const failed = !customers.ok ? customers : (makes as Extract<typeof makes, { ok: false }>);
apps\workshop-web\app\_screens\register-vehicle-screen.tsx:72:  // A vehicle cannot exist without an owner — `customer_id` is NOT NULL — so an
apps\workshop-web\app\_screens\register-vehicle-screen.tsx:73:  // empty customer list is a dead end, not an empty dropdown. Saying so, and
apps\workshop-web\app\_screens\register-vehicle-screen.tsx:75:  if (customers.data.length === 0) {
apps\workshop-web\app\_screens\register-vehicle-screen.tsx:80:          title="Register a customer first"
apps\workshop-web\app\_screens\register-vehicle-screen.tsx:81:          description="Every vehicle belongs to a customer, so there is nobody to register this vehicle to yet. Add the customer, then come back."
apps\workshop-web\app\_screens\register-vehicle-screen.tsx:114:          hint="The customer this vehicle belongs to. Only customers of this organisation are listed."
apps\workshop-web\app\_screens\register-vehicle-screen.tsx:115:          htmlFor="customerId"
apps\workshop-web\app\_screens\register-vehicle-screen.tsx:118:            id="customerId"
apps\workshop-web\app\_screens\register-vehicle-screen.tsx:119:            name="customerId"
apps\workshop-web\app\_screens\register-vehicle-screen.tsx:121:            options={customers.data.map((c) => ({ value: c.id, label: c.displayName }))}
apps\workshop-web\app\_screens\register-customer-screen.tsx:13: * Register a customer — the first screen in this product that WRITES.
apps\workshop-web\app\_screens\register-customer-screen.tsx:15: * `POST /api/v1/customers` existed, role-gated, validated and audited, and
apps\workshop-web\app\_screens\register-customer-screen.tsx:35:        description="Add someone to this workshop's customer book. Only a name is required — the rest can follow."
apps\workshop-web\app\_screens\register-customer-screen.tsx:40:        successHref={{ href: '/customers/customer-search', label: 'View the customer list' }}
apps\workshop-web\app\_screens\register-customer-screen.tsx:50:        <Field label="Customer type" htmlFor="customerType">
apps\workshop-web\app\_screens\register-customer-screen.tsx:52:            id="customerType"
apps\workshop-web\app\_screens\register-customer-screen.tsx:53:            name="customerType"
apps\workshop-web\app\_screens\register-customer-screen.tsx:74:          hint="How this customer prefers to be reached."
apps\workshop-web\app\_screens\register-customer-screen.tsx:94:        <SubmitButton>Register customer</SubmitButton>
apps\workshop-web\app\_screens\register-actions.ts:75:  const result = await apiPost<Created>('workshop', '/customers', {
apps\workshop-web\app\_screens\register-actions.ts:77:    customerType: text(formData, 'customerType'),
apps\workshop-web\app\_screens\register-actions.ts:85:    return { error: explain(result.reason, result.message, 'customers') };
apps\workshop-web\app\_screens\register-actions.ts:91:  revalidatePath('/customers/customer-search');
apps\workshop-web\app\_screens\register-actions.ts:92:  revalidatePath('/customer-reception/customers');
apps\workshop-web\app\_screens\register-actions.ts:93:  revalidatePath('/customers-and-vehicles/customers');
apps\workshop-web\app\_screens\register-actions.ts:95:  return { created: result.data.displayName ?? 'the customer' };
apps\workshop-web\app\_screens\register-actions.ts:100:    customerId: text(formData, 'customerId'),
apps\workshop-web\app\_screens\register-actions.ts:121:  revalidatePath('/customer-reception/vehicles');
apps\workshop-web\app\_screens\register-actions.ts:122:  revalidatePath('/customers-and-vehicles/vehicles');
apps\workshop-web\app\_screens\quotation-sheet-screen.tsx:44:  customerName: string;
apps\workshop-web\app\_screens\quotation-sheet-screen.tsx:150:          goes to the customer.
apps\workshop-web\app\_screens\quotation-sheet-screen.tsx:154:      {/* §4's document header — customer, vehicle, complaint, diagnosis summary. */}
apps\workshop-web\app\_screens\quotation-sheet-screen.tsx:163:        <Fact label="Customer" value={q.customerName} />
apps\workshop-web\app\_screens\quotation-sheet-screen.tsx:253:      return 'Approved. This is the price of record for this attempt, and what goes to the customer.';
apps\workshop-web\app\_screens\quotation-sheet-screen.tsx:267:        // they are NOT in the headline price, and a customer reading one list would
apps\workshop-web\app\_screens\quotation-review-form.tsx:99:          placeholder="What is wrong with the price, or what to re-check before it goes to the customer."
apps\workshop-web\app\_screens\quotation-queue-screen.tsx:16: *   §47 manager  `/customer-approval/quotations`      "Quotations"
apps\workshop-web\app\_screens\quotation-queue-screen.tsx:32:  customerName: string;
apps\workshop-web\app\_screens\quotation-queue-screen.tsx:56: * `awaiting_customer_approval` is included because the lifecycle's route back is
apps\workshop-web\app\_screens\quotation-queue-screen.tsx:57: * `awaiting_customer_approval → solution_preparation`, so a job whose price the
apps\workshop-web\app\_screens\quotation-queue-screen.tsx:58: * customer queried still belongs on this queue — but the service refuses to PREPARE
apps\workshop-web\app\_screens\quotation-queue-screen.tsx:62:const QUEUE_STAGES = ['quotation_preparation', 'awaiting_customer_approval'];
apps\workshop-web\app\_screens\quotation-queue-screen.tsx:179:                  <td style={cell}>{card.customerName}</td>
apps\workshop-web\app\_screens\quotation-queue-screen.tsx:256:        quotation to the customer, and their approve / decline / query response, is the
apps\workshop-web\app\_screens\quotation-editor-form.tsx:22: * fabricated figure in front of a customer. So the advisor's job here is to price
apps\workshop-web\app\_screens\quotation-editor-form.tsx:188:                so the customer is not quoted for something they may decline. */}
apps\workshop-web\app\_screens\quotation-editor-form.tsx:189:            An optional extra — shown to the customer but not in the total
apps\workshop-web\app\_screens\quotation-editor-form.tsx:275:                ? `${unpriced.length} line(s) are still priced at zero and would quote the customer nothing for them.`
apps\workshop-web\app\_screens\quotation-actions.ts:47:  '/customer-approval/quotations',
apps\workshop-web\app\_screens\quotation-actions.ts:128:  if (description === '') return { error: 'A line must keep a description — the customer reads it.' };
apps\workshop-web\app\_screens\quotation-actions.ts:245:        ? `Quotation approved for ${result.data.jobNumber} — it can now go to the customer`
apps\workshop-web\app\_screens\quick-create.spec.ts:43:    expect(resolve('owner', 'register-customer')).toBeTruthy();
apps\workshop-web\app\_screens\quick-create.spec.ts:47:    ['owner', 'register-customer', '/customers-and-vehicles/register-customer'],
apps\workshop-web\app\_screens\quick-create.spec.ts:48:    ['owner', 'register-vehicle', '/customers-and-vehicles/register-vehicle'],
apps\workshop-web\app\_screens\quick-create.spec.ts:49:    ['manager', 'register-customer', '/requests-and-reception/register-customer'],
apps\workshop-web\app\_screens\quick-create.spec.ts:51:    ['reception', 'register-customer', '/customers/register-customer'],
apps\workshop-web\app\_screens\quick-create.spec.ts:54:    // assigned work; they do not keep the customer book. A button here would be
apps\workshop-web\app\_screens\quick-create.spec.ts:56:    ['technician', 'register-customer', null],
apps\workshop-web\app\_screens\quick-create.spec.ts:74:   * default tree `register-customer` carries `permission: 'organization.admin'`.
apps\workshop-web\app\_screens\quick-create.spec.ts:79:    expect(resolve(undefined, 'register-customer', [])).toBeNull();
apps\workshop-web\app\_screens\quick-create.spec.ts:80:    expect(resolve(undefined, 'register-customer', ['organization.admin'])).toBe(
apps\workshop-web\app\_screens\quick-create.spec.ts:81:      '/customer-reception/register-customer',
apps\workshop-web\app\_screens\quick-create-button.tsx:23:  /** Written out in full — "Add customer", not "Add" or "+". */
apps\workshop-web\app\_screens\quality-queue-screen.tsx:171:          complaint was addressed — an inspector who cannot see what the customer
apps\workshop-web\app\_screens\quality-queue-screen.tsx:175:          The customer&rsquo;s original complaint
apps\workshop-web\app\_screens\proposal-sheet-screen.tsx:17: * One customer proposal — `1.txt` §410-§422's document, `07.txt` §7's decision.
apps\workshop-web\app\_screens\proposal-sheet-screen.tsx:27: * the two §416 and §422 name explicitly. A customer who is told only what is confirmed
apps\workshop-web\app\_screens\proposal-sheet-screen.tsx:28: * reads the first unexpected extra as incompetence; a customer who was told what
apps\workshop-web\app\_screens\proposal-sheet-screen.tsx:44:  customerName: string;
apps\workshop-web\app\_screens\proposal-sheet-screen.tsx:135:              ? 'Approved by the customer'
apps\workshop-web\app\_screens\proposal-sheet-screen.tsx:137:                ? 'Declined by the customer'
apps\workshop-web\app\_screens\proposal-sheet-screen.tsx:138:                : 'The customer asked for a change'}
apps\workshop-web\app\_screens\proposal-sheet-screen.tsx:197:        <Fact label="Customer" value={p.customerName} />
apps\workshop-web\app\_screens\proposal-sheet-screen.tsx:218:          document that goes out — and it is what lets the customer app and a future
apps\workshop-web\app\_screens\proposal-sheet-screen.tsx:238:          customerName={p.customerName}
apps\workshop-web\app\_screens\proposal-sheet-screen.tsx:254:          This proposal is with the customer. Your role can read it but not record their
apps\workshop-web\app\_screens\proposal-sheet-screen.tsx:266:        ? 'Not yet shown to the customer. Write what the work should achieve, and what remains uncertain, then issue it. Once issued the wording is frozen.'
apps\workshop-web\app\_screens\proposal-sheet-screen.tsx:269:      return 'With the customer. §7: repair work shall not start until the required approval is received.';
apps\workshop-web\app\_screens\proposal-sheet-screen.tsx:271:      return 'Approved by the customer. §424 makes this immutable — a material change requires a new version and a new approval.';
apps\workshop-web\app\_screens\proposal-sheet-screen.tsx:273:      return 'Declined by the customer. Kept as the record of what was offered and refused.';
apps\workshop-web\app\_screens\proposal-sheet-screen.tsx:275:      return 'The customer asked for a change. Prepare a new version with the revised offer.';
apps\workshop-web\app\_screens\proposal-queue-screen.tsx:12: * The customer-proposal queue — `1.txt` §396-§424, `07.txt` §7. Three workshop routes:
apps\workshop-web\app\_screens\proposal-queue-screen.tsx:14: *   §34 default  `/solution-and-approval/customer-proposals`  "Customer Proposals"
apps\workshop-web\app\_screens\proposal-queue-screen.tsx:15: *   §46 owner    `/repair-control/customer-approval`          "Customer Approval"
apps\workshop-web\app\_screens\proposal-queue-screen.tsx:16: *   §47 manager  `/customer-approval/pending-approvals`       "Pending Approvals"
apps\workshop-web\app\_screens\proposal-queue-screen.tsx:18: * The fourth `repair-proposals` item in `workspaces.ts` belongs to the CUSTOMER
apps\workshop-web\app\_screens\proposal-queue-screen.tsx:19: * workspace — a different app (`customer-web`), where the vehicle owner answers for
apps\workshop-web\app\_screens\proposal-queue-screen.tsx:35:  customerName: string;
apps\workshop-web\app\_screens\proposal-queue-screen.tsx:56:const QUEUE_STAGES = ['quotation_preparation', 'awaiting_customer_approval'];
apps\workshop-web\app\_screens\proposal-queue-screen.tsx:64:        description="What the customer has been shown, and what they said. A proposal presents an approved quotation; once the customer approves it, §424 makes it immutable and any material change needs a new version."
apps\workshop-web\app\_screens\proposal-queue-screen.tsx:96:        title="No customer proposals"
apps\workshop-web\app\_screens\proposal-queue-screen.tsx:122:          {waiting > 0 ? `${waiting} proposal(s) waiting on the customer. ` : ''}
apps\workshop-web\app\_screens\proposal-queue-screen.tsx:137:            Customer proposals, their version, what the customer decided and what they agreed to pay
apps\workshop-web\app\_screens\proposal-queue-screen.tsx:176:                  <td style={cell}>{card.customerName}</td>
apps\workshop-web\app\_screens\proposal-queue-screen.tsx:203:                              offered — those differ whenever the customer took the
apps\workshop-web\app\_screens\proposal-queue-screen.tsx:279:        The customer answers here through a member of staff — in person, by telephone or
apps\workshop-web\app\_screens\proposal-queue-screen.tsx:281:        approval in the customer app, the 3D before-and-after presentation, and recorded
apps\workshop-web\app\_screens\proposal-queue-screen.tsx:289:/** Waiting on the customer first, then what the workshop must answer, then settled. */
apps\workshop-web\app\_screens\proposal-narrative-form.tsx:24: * than after: once the proposal is with the customer, its content cannot change, and a
apps\workshop-web\app\_screens\proposal-narrative-form.tsx:92:        Write the parts addressed to the customer
apps\workshop-web\app\_screens\proposal-narrative-form.tsx:124:          note="Required before the proposal can be issued. In plain language: what will be different for the customer once the work is done."
apps\workshop-web\app\_screens\proposal-narrative-form.tsx:158:                // faults in their own section, so the information reaches the customer
apps\workshop-web\app\_screens\proposal-narrative-form.tsx:196:        Issue it to the customer
apps\workshop-web\app\_screens\proposal-narrative-form.tsx:200:        Once issued the wording is frozen — the customer is reading this exact document,
apps\workshop-web\app\_screens\proposal-narrative-form.tsx:222:          aria-label={`Issue the proposal for job card ${jobNumber} to the customer`}
apps\workshop-web\app\_screens\proposal-narrative-form.tsx:225:          {busy === 'issue' ? 'Issuing…' : 'Issue to customer'}
apps\workshop-web\app\_screens\proposal-labels.ts:13:  issued: 'With the customer',
apps\workshop-web\app\_screens\proposal-labels.ts:14:  approved: 'Approved by customer',
apps\workshop-web\app\_screens\proposal-labels.ts:41:  'customer_portal',
apps\workshop-web\app\_screens\proposal-labels.ts:49:  customer_portal: 'Customer portal',
apps\workshop-web\app\_screens\proposal-labels.ts:52:/** §398-§402's tiers, as the customer chooses between them. */
packages\marketplace-ui\src\index.ts:4: * WHY IT MOVED OUT OF `customer-web`. The landing page — the free parts
apps\workshop-web\app\_screens\proposal-document.tsx:9: * It leaves the building. A customer reads it, decides on it, may print it, and may
apps\workshop-web\app\_screens\proposal-document.tsx:16: *     something a customer can accept.
apps\workshop-web\app\_screens\proposal-document.tsx:20: *   · An ITEMISED body with a totals block, so the customer can see what each figure
apps\workshop-web\app\_screens\proposal-document.tsx:32: * component reusable unchanged by the customer app and, later, by a PDF renderer.
apps\workshop-web\app\_screens\proposal-document.tsx:148:            // customer's accountant will query.
apps\workshop-web\app\_screens\proposal-document.tsx:398:            // Kept separate from "By" on purpose: one is the customer, the other is the
apps\workshop-web\app\_screens\proposal-decision-form.tsx:15: * §7 — record what the customer said.
apps\workshop-web\app\_screens\proposal-decision-form.tsx:27: * authorised the customer's own repair, which is exactly the attribution error an
apps\workshop-web\app\_screens\proposal-decision-form.tsx:38:  customerName,
apps\workshop-web\app\_screens\proposal-decision-form.tsx:45:  customerName: string;
apps\workshop-web\app\_screens\proposal-decision-form.tsx:98:        Record the customer&rsquo;s decision
apps\workshop-web\app\_screens\proposal-decision-form.tsx:107:        Job {jobNumber} for {customerName}. Once recorded, §424 makes this proposal
apps\workshop-web\app\_screens\proposal-decision-form.tsx:116:            What did the customer decide?
apps\workshop-web\app\_screens\proposal-decision-form.tsx:180:              defaultValue={customerName}
apps\workshop-web\app\_screens\proposal-decision-form.tsx:181:              placeholder="The customer, or the person authorised to decide"
apps\workshop-web\app\_screens\proposal-decision-form.tsx:224:          above is the customer&rsquo;s.
apps\workshop-web\app\_screens\proposal-decision-form.tsx:236:          aria-label={`Record the customer decision for job card ${jobNumber}`}
apps\workshop-web\app\_screens\proposal-actions.ts:8: * Preparing, issuing and answering a customer proposal — `1.txt` §396-§424, `07.txt` §7.
apps\workshop-web\app\_screens\proposal-actions.ts:39:  '/solution-and-approval/customer-proposals',
apps\workshop-web\app\_screens\proposal-actions.ts:40:  '/repair-control/customer-approval',
apps\workshop-web\app\_screens\proposal-actions.ts:41:  '/customer-approval/pending-approvals',
apps\workshop-web\app\_screens\proposal-actions.ts:94:/** Put it in front of the customer. */
apps\workshop-web\app\_screens\proposal-actions.ts:108:    created: `Version ${result.data.versionNo} issued to the customer for ${result.data.jobNumber}`,
apps\workshop-web\app\_screens\proposal-actions.ts:113: * §7 — record the customer's answer.
apps\workshop-web\app\_screens\proposal-actions.ts:119: * customer says they never agreed.
apps\workshop-web\app\_screens\proposal-actions.ts:131:    return { error: 'Choose what the customer decided.' };
apps\workshop-web\app\_screens\proposal-actions.ts:137:    return { error: 'Record how the customer answered — in person, by telephone, and so on.' };
apps\workshop-web\app\_screens\proposal-actions.ts:140:    return { error: 'Record which option the customer approved.' };
apps\workshop-web\app\_screens\proposal-actions.ts:144:      error: 'Say what the customer asked for. Without it the workshop has nothing to act on.',
apps\workshop-web\app\_screens\prepare-quotation-form.tsx:13: * figures that disagree with the plan the customer is being charged for, which is the
apps\workshop-web\app\_screens\prepare-proposal-form.tsx:19: * version was APPROVED — replacing an agreement a customer has given is a commercial
packages\ui\src\TopNav.tsx:92:   * when logged in by clicking [the] autoworkshop logo". In `customer-web` the
packages\ui\src\TopNav.tsx:411:            Search vehicles, jobs, parts, customers
packages\ui\src\TopNav.tsx:417:            placeholder="Search vehicles, jobs, parts, customers…"
apps\workshop-web\app\_screens\nav-label.ts:15: * agree on where the customer list lives or what it is called:
apps\workshop-web\app\_screens\nav-label.ts:17: *   · §34 default   `/customer-reception/customers`  — "Customers"
apps\workshop-web\app\_screens\nav-label.ts:18: *   · §46 owner     `/customers-and-vehicles/customers` — "Customers"
apps\workshop-web\app\_screens\nav-label.ts:19: *   · §48 reception `/customers/customer-search`     — "Customer Search"
packages\auth\src\tokens.test.ts:147:    await revokeRefreshToken('autoworkshop-customer-web', 'the-refresh-token', impl);
packages\auth\src\tokens.test.ts:152:    expect(body.get('client_id')).toBe('autoworkshop-customer-web');
packages\auth\src\tokens.test.ts:242:    const url = new URL(keycloakSignOutUrl(undefined, 'http://localhost:3000', 'autoworkshop-customer-web'));
packages\auth\src\tokens.test.ts:243:    expect(url.searchParams.get('client_id')).toBe('autoworkshop-customer-web');
packages\ui\src\Tabs.test.ts:84:      'Prepare a customer explanation',
apps\workshop-web\app\_screens\job-queue-screen.tsx:17: * ⚠️ AND THE FILTER IS NOT A PERMISSION. `JobCardService` already narrows a
apps\workshop-web\app\_screens\job-queue-screen.tsx:22: * something with this should read `JobCardService` instead.
apps\workshop-web\app\_screens\job-queue-screen.tsx:34:  customerName: string;
apps\workshop-web\app\_screens\job-queue-screen.tsx:64:  awaiting_customer_approval: 'Awaiting customer approval',
apps\workshop-web\app\_screens\job-queue-screen.tsx:169:            <Td>{c.customerName}</Td>
apps\workshop-web\app\_screens\job-queue-definitions.ts:37:    description: 'Jobs the customer has approved and which are cleared to start.',
apps\workshop-web\app\_screens\job-queue-definitions.ts:72:  '/repair-control/customer-approvals': {
apps\workshop-web\app\_screens\job-queue-definitions.ts:73:    stages: ['awaiting_customer_approval', 'awaiting_deposit'],
apps\workshop-web\app\_screens\job-queue-definitions.ts:74:    description: 'Jobs waiting on the customer — an approval or a deposit.',
apps\workshop-web\app\_screens\job-queue-definitions.ts:75:    emptyTitle: 'Nothing waiting on a customer',
apps\workshop-web\app\_screens\job-queue-definitions.ts:76:    emptyBody: 'No job is held for a customer decision or deposit.',
apps\workshop-web\app\_screens\job-queue-definitions.ts:92:    description: 'Work referred for a second opinion before it reaches the customer.',
apps\workshop-web\app\_screens\job-queue-definitions.ts:123:  '/workshop-operations/customer-complaints': {
apps\workshop-web\app\_screens\job-queue-definitions.ts:127:    emptyBody: 'Nothing has been recorded yet. Reception records a complaint when a customer calls.',
docs\03-ui-ux\NAVIGATION-GAPS-PROPOSAL.md:25:reach it by clicking.** Three features are affected: creating a customer,
docs\03-ui-ux\NAVIGATION-GAPS-PROPOSAL.md:31:Slice D. Pricing, then quality control, then a question about adding customers.
docs\03-ui-ux\NAVIGATION-GAPS-PROPOSAL.md:89:- **Customers.** An owner or manager opens the app to add a walk-in customer and
docs\03-ui-ux\NAVIGATION-GAPS-PROPOSAL.md:105:Add `register-customer` and `register-vehicle` to the owner, manager and DEFAULT
docs\03-ui-ux\NAVIGATION-GAPS-PROPOSAL.md:117:Tell owners and managers to switch role to reception to add a customer.
docs\03-ui-ux\NAVIGATION-GAPS-PROPOSAL.md:121:  customer's phone number. It also does not help `platform_administrator`, which
docs\03-ui-ux\NAVIGATION-GAPS-PROPOSAL.md:133:  touch the customer or vehicle gaps. Recommended **against**.
apps\workshop-web\app\_screens\job-cards-screen.tsx:13: * That is not a shortcut, it is the design: `JobCardService` narrows a
apps\workshop-web\app\_screens\job-cards-screen.tsx:21: * there said they would get the customer and vehicle for the job they are
apps\workshop-web\app\_screens\job-cards-screen.tsx:23: * registration and customer name arrive through the join, scoped by assignment.
apps\workshop-web\app\_screens\job-cards-screen.tsx:29:  customerName: string;
apps\workshop-web\app\_screens\job-cards-screen.tsx:50:  awaiting_customer_approval: 'Awaiting customer approval',
apps\workshop-web\app\_screens\job-cards-screen.tsx:68: * ELSE — a customer decision, a deposit, a part. Those are the cards a manager
apps\workshop-web\app\_screens\job-cards-screen.tsx:121:        description="A job card is opened when a vehicle is booked in or a customer reports a problem. None are open for you right now."
apps\workshop-web\app\_screens\job-cards-screen.tsx:177:              <td style={{ padding: primitive.space[3], color: themeVar.textSecondary }}>{j.customerName}</td>
apps\workshop-web\app\_screens\job-cards-screen.tsx:179:                {/* The customer's own words, not a summary. Truncating in CSS
packages\ui\src\Form.tsx:9: * MOVED HERE FROM `workshop-web/app/_screens` when customer-web needed the same
packages\auth\src\auth-error-route.test.ts:6: * 🔴 `pages.error` IS SET ONCE AND HONOURED BY SEVEN APPS.
packages\auth\src\auth-error-route.test.ts:41:    expect(webApps).toContain('customer-web');
packages\auth\src\auth-error-route.test.ts:49:        'workspace-auth.ts sets pages.error = "/auth/error" for every workspace',
packages\auth\src\auth-error-route.test.ts:53:  it('still has pages.error pointing where these routes are', () => {
packages\ui\src\AiAssistantPanel.tsx:99:  { id: 'customer-explanation', label: 'Prepare a customer explanation' },
apps\workshop-web\app\vehicles\vehicle-search\[id]\page.tsx:24:  return <VehicleDetailScreen id={id} listHref="/vehicles/vehicle-search" customerHrefBase="/customers/customer-search" />;
apps\workshop-web\app\vehicles\register-vehicle\page.tsx:7: * See the register-customer page beside it. The screen loads the customer and
apps\workshop-web\app\vehicles\register-vehicle\page.tsx:9: * customers this viewer is entitled to see.
apps\workshop-web\app\solution-and-approval\customer-proposals\[id]\page.tsx:5: * /solution-and-approval/customer-proposals/<id> — one customer proposal. the §34 WORKSPACE DEFAULT tree.
apps\workshop-web\app\solution-and-approval\customer-proposals\[id]\page.tsx:18:  await requireNavRoute('workshop', '/solution-and-approval/customer-proposals');
apps\workshop-web\app\solution-and-approval\customer-proposals\[id]\page.tsx:20:  return <ProposalSheetScreen route="/solution-and-approval/customer-proposals" proposalId={id} />;
apps\workshop-web\app\solution-and-approval\customer-proposals\page.tsx:5: * /solution-and-approval/customer-proposals — the §34 WORKSPACE DEFAULT tree.
apps\workshop-web\app\solution-and-approval\customer-proposals\page.tsx:19:  await requireNavRoute('workshop', '/solution-and-approval/customer-proposals');
apps\workshop-web\app\solution-and-approval\customer-proposals\page.tsx:20:  return <ProposalQueueScreen route="/solution-and-approval/customer-proposals" />;
apps\workshop-web\app\_screens\job-card-detail-screen.tsx:43: * what is OFFERED; `JobCardService.changeStage` re-derives every rule when the
apps\workshop-web\app\_screens\job-card-detail-screen.tsx:52:  customerId: string;
apps\workshop-web\app\_screens\job-card-detail-screen.tsx:53:  customerName: string;
apps\workshop-web\app\_screens\job-card-detail-screen.tsx:149:        description={`${card.registrationNumber}${card.vehicleDescription ? ` — ${card.vehicleDescription}` : ''} · ${card.customerName}`}
apps\workshop-web\app\_screens\job-card-detail-screen.tsx:158:      {/* The customer's own words, in full and not truncated. The queue rows
apps\workshop-web\app\_screens\job-card-detail-screen.tsx:177:          <Detail_ label="Customer" value={card.customerName} />
apps\workshop-web\app\_screens\job-card-detail-href.ts:42: *     map — `platform_administrator`, `customer`, or anything unrecognised.
apps\workshop-web\app\requests-and-reception\register-vehicle\page.tsx:7: * The §47 MANAGER tree's route, matching its register-customer sibling.
apps\workshop-web\app\requests-and-reception\register-customer\page.tsx:2:import { RegisterCustomerScreen } from '../../_screens/register-customer-screen';
apps\workshop-web\app\requests-and-reception\register-customer\page.tsx:5: * /requests-and-reception/register-customer
apps\workshop-web\app\requests-and-reception\register-customer\page.tsx:21:const ROUTE = '/requests-and-reception/register-customer';
apps\workshop-web\app\repair-services\repairs-in-progress\page.tsx:12: * requires an APPROVED customer proposal before any work starts (§7), and Postgres RLS
apps\workshop-web\app\repair-control\repairs-in-progress\page.tsx:12: * requires an APPROVED customer proposal before any work starts (§7), and Postgres RLS
apps\workshop-web\app\repair-control\repair-progress\page.tsx:12: * requires an APPROVED customer proposal before any work starts (§7), and Postgres RLS
apps\workshop-web\app\_screens\inspection-queue-screen.tsx:38:  customerName: string;
apps\workshop-web\app\_screens\inspection-queue-screen.tsx:189:                  <td style={cell}>{card.customerName}</td>
apps\workshop-web\app\repair-control\customer-approvals\page.tsx:6: * /repair-control/customer-approvals — a real view of real job cards, narrowed to one point in the
apps\workshop-web\app\repair-control\customer-approvals\page.tsx:14:  await requireNavRoute('workshop', '/repair-control/customer-approvals');
apps\workshop-web\app\repair-control\customer-approvals\page.tsx:15:  return <JobQueueScreen route="/repair-control/customer-approvals" queue={JOB_QUEUES['/repair-control/customer-approvals']} />;
apps\workshop-web\app\repair-control\customer-approval\[id]\page.tsx:5: * /repair-control/customer-approval/<id> — one customer proposal. the §46 WORKSHOP OWNER tree.
apps\workshop-web\app\repair-control\customer-approval\[id]\page.tsx:18:  await requireNavRoute('workshop', '/repair-control/customer-approval');
apps\workshop-web\app\repair-control\customer-approval\[id]\page.tsx:20:  return <ProposalSheetScreen route="/repair-control/customer-approval" proposalId={id} />;
apps\workshop-web\app\repair-control\customer-approval\page.tsx:5: * /repair-control/customer-approval — the §46 WORKSHOP OWNER tree.
apps\workshop-web\app\repair-control\customer-approval\page.tsx:19:  await requireNavRoute('workshop', '/repair-control/customer-approval');
apps\workshop-web\app\repair-control\customer-approval\page.tsx:20:  return <ProposalQueueScreen route="/repair-control/customer-approval" />;
apps\workshop-web\app\record-work\time-records\page.tsx:12: * requires an APPROVED customer proposal before any work starts (§7), and Postgres RLS
apps\workshop-web\app\record-work\repair-tasks\page.tsx:12: * requires an APPROVED customer proposal before any work starts (§7), and Postgres RLS
apps\workshop-web\app\record-work\repair-evidence\page.tsx:12: * requires an APPROVED customer proposal before any work starts (§7), and Postgres RLS
apps\workshop-web\app\record-work\parts-used\page.tsx:12: * requires an APPROVED customer proposal before any work starts (§7), and Postgres RLS
apps\workshop-web\app\page.tsx:19: * in `customer-web`, deployed at a different hostname, and reaching them from
apps\workshop-web\app\page.tsx:43: * the marketplace unreachable to customers in the first place, and the owner
apps\workshop-web\app\page.tsx:53: * `renderAddToBasket` is omitted. The basket belongs to `customer-web`; a
apps\workshop-web\app\not-found.tsx:114:    customer: 'a customer',
apps\workshop-web\app\home\my-assigned-work\[id]\page.tsx:15: * `JobCardsScreen`, and `JobCardService` narrows a technician to the cards
apps\workshop-web\app\home\dashboard\page.tsx:86:  'awaiting_customer_approval', 'awaiting_deposit', 'awaiting_parts',
apps\workshop-web\app\home\dashboard\page.tsx:180:      label: 'Awaiting customer approval',
apps\workshop-web\app\home\dashboard\page.tsx:181:      value: count((c) => c.stage === 'awaiting_customer_approval'),
apps\workshop-web\app\customers-and-vehicles\vehicles\[id]\page.tsx:5: * /customers-and-vehicles/vehicles/<id> — detail, on the §46 owner tree.
apps\workshop-web\app\customers-and-vehicles\vehicles\[id]\page.tsx:8: * and no navigation advertises one entry per record, so "is `/customers-and-vehicles/vehicles/<id>`
apps\workshop-web\app\customers-and-vehicles\vehicles\[id]\page.tsx:22:  await requireNavRoute('workshop', '/customers-and-vehicles/vehicles');
apps\workshop-web\app\customers-and-vehicles\vehicles\[id]\page.tsx:24:  return <VehicleDetailScreen id={id} listHref="/customers-and-vehicles/vehicles" customerHrefBase="/customers-and-vehicles/customers" />;
apps\workshop-web\app\customers-and-vehicles\vehicles\page.tsx:5: * /customers-and-vehicles/vehicles — the workshop OWNER's route (07.txt pt2 §46)
apps\workshop-web\app\customers-and-vehicles\vehicles\page.tsx:18:  await requireNavRoute('workshop', '/customers-and-vehicles/vehicles');
apps\workshop-web\app\customers-and-vehicles\vehicles\page.tsx:19:  return <VehiclesScreen route="/customers-and-vehicles/vehicles" />;
apps\workshop-web\app\customers-and-vehicles\register-vehicle\page.tsx:5: * /customers-and-vehicles/register-vehicle
apps\workshop-web\app\customers-and-vehicles\register-vehicle\page.tsx:7: * The §46 OWNER tree's route, matching its register-customer sibling.
apps\workshop-web\app\customers-and-vehicles\register-vehicle\page.tsx:21:const ROUTE = '/customers-and-vehicles/register-vehicle';
packages\next-shell\src\viewer.ts:70:        // organisation while the table below listed another's customers. That
apps\workshop-web\app\customers-and-vehicles\register-customer\page.tsx:2:import { RegisterCustomerScreen } from '../../_screens/register-customer-screen';
apps\workshop-web\app\customers-and-vehicles\register-customer\page.tsx:5: * /customers-and-vehicles/register-customer
apps\workshop-web\app\customers-and-vehicles\register-customer\page.tsx:21:const ROUTE = '/customers-and-vehicles/register-customer';
apps\workshop-web\app\customers-and-vehicles\customers\[id]\page.tsx:2:import { CustomerDetailScreen } from '../../../_screens/customer-detail-screen';
apps\workshop-web\app\customers-and-vehicles\customers\[id]\page.tsx:5: * /customers-and-vehicles/customers/<id> — detail, on the §46 owner tree.
apps\workshop-web\app\customers-and-vehicles\customers\[id]\page.tsx:8: * and no navigation advertises one entry per record, so "is `/customers-and-vehicles/customers/<id>`
apps\workshop-web\app\customers-and-vehicles\customers\[id]\page.tsx:22:  await requireNavRoute('workshop', '/customers-and-vehicles/customers');
apps\workshop-web\app\customers-and-vehicles\customers\[id]\page.tsx:24:  return <CustomerDetailScreen id={id} listHref="/customers-and-vehicles/customers" />;
apps\workshop-web\app\customers-and-vehicles\customers\page.tsx:2:import { CustomersScreen } from '../../_screens/customers-screen';
apps\workshop-web\app\customers-and-vehicles\customers\page.tsx:5: * /customers-and-vehicles/customers — the workshop OWNER's route (07.txt pt2 §46)
apps\workshop-web\app\customers-and-vehicles\customers\page.tsx:18:  await requireNavRoute('workshop', '/customers-and-vehicles/customers');
apps\workshop-web\app\customers-and-vehicles\customers\page.tsx:19:  return <CustomersScreen route="/customers-and-vehicles/customers" />;
apps\workshop-web\app\customers\register-customer\page.tsx:2:import { RegisterCustomerScreen } from '../../_screens/register-customer-screen';
apps\workshop-web\app\customers\register-customer\page.tsx:5: * /customers/register-customer — RECEPTION's route (07.txt pt2 §48).
apps\workshop-web\app\customers\register-customer\page.tsx:20:  await requireNavRoute('workshop', '/customers/register-customer');
apps\workshop-web\app\customers\register-customer\page.tsx:21:  return <RegisterCustomerScreen route="/customers/register-customer" />;
apps\workshop-web\app\customers\customer-search\[id]\page.tsx:2:import { CustomerDetailScreen } from '../../../_screens/customer-detail-screen';
apps\workshop-web\app\customers\customer-search\[id]\page.tsx:5: * /customers/customer-search/<id> — detail, on the §48 reception tree.
apps\workshop-web\app\customers\customer-search\[id]\page.tsx:8: * and no navigation advertises one entry per record, so "is `/customers/customer-search/<id>`
apps\workshop-web\app\customers\customer-search\[id]\page.tsx:22:  await requireNavRoute('workshop', '/customers/customer-search');
apps\workshop-web\app\customers\customer-search\[id]\page.tsx:24:  return <CustomerDetailScreen id={id} listHref="/customers/customer-search" />;
apps\workshop-web\app\customers\customer-search\page.tsx:2:import { CustomersScreen } from '../../_screens/customers-screen';
apps\workshop-web\app\customers\customer-search\page.tsx:5: * /customers/customer-search — RECEPTION's route (07.txt pt2 §48), where it is called Customer Search
apps\workshop-web\app\customers\customer-search\page.tsx:18:  await requireNavRoute('workshop', '/customers/customer-search');
apps\workshop-web\app\customers\customer-search\page.tsx:19:  return <CustomersScreen route="/customers/customer-search" />;
apps\workshop-web\app\customer-reception\vehicles\[id]\page.tsx:5: * /customer-reception/vehicles/<id> — detail, on the §34 default tree.
apps\workshop-web\app\customer-reception\vehicles\[id]\page.tsx:8: * and no navigation advertises one entry per record, so "is `/customer-reception/vehicles/<id>`
apps\workshop-web\app\customer-reception\vehicles\[id]\page.tsx:22:  await requireNavRoute('workshop', '/customer-reception/vehicles');
apps\workshop-web\app\customer-reception\vehicles\[id]\page.tsx:24:  return <VehicleDetailScreen id={id} listHref="/customer-reception/vehicles" customerHrefBase="/customer-reception/customers" />;
apps\workshop-web\app\customer-reception\vehicles\page.tsx:5: * /customer-reception/vehicles — the §34 WORKSPACE DEFAULT route.
apps\workshop-web\app\customer-reception\vehicles\page.tsx:7: * See the customers page beside this one for the full reasoning. In short: the
apps\workshop-web\app\customer-reception\vehicles\page.tsx:18:  await requireNavRoute('workshop', '/customer-reception/vehicles');
apps\workshop-web\app\customer-reception\vehicles\page.tsx:19:  return <VehiclesScreen route="/customer-reception/vehicles" />;
apps\workshop-web\app\customer-reception\register-vehicle\page.tsx:5: * /customer-reception/register-vehicle
apps\workshop-web\app\customer-reception\register-vehicle\page.tsx:7: * The §34 DEFAULT tree's route, for the same roles as its sibling register-customer page.
apps\workshop-web\app\customer-reception\register-vehicle\page.tsx:21:const ROUTE = '/customer-reception/register-vehicle';
apps\workshop-web\app\customer-reception\register-customer\page.tsx:2:import { RegisterCustomerScreen } from '../../_screens/register-customer-screen';
apps\workshop-web\app\customer-reception\register-customer\page.tsx:5: * /customer-reception/register-customer
apps\workshop-web\app\customer-reception\register-customer\page.tsx:21:const ROUTE = '/customer-reception/register-customer';
apps\workshop-web\app\customer-reception\customers\[id]\page.tsx:2:import { CustomerDetailScreen } from '../../../_screens/customer-detail-screen';
apps\workshop-web\app\customer-reception\customers\[id]\page.tsx:5: * /customer-reception/customers/<id> — detail, on the §34 default tree.
apps\workshop-web\app\customer-reception\customers\[id]\page.tsx:8: * and no navigation advertises one entry per record, so "is `/customer-reception/customers/<id>`
apps\workshop-web\app\customer-reception\customers\[id]\page.tsx:22:  await requireNavRoute('workshop', '/customer-reception/customers');
apps\workshop-web\app\customer-reception\customers\[id]\page.tsx:24:  return <CustomerDetailScreen id={id} listHref="/customer-reception/customers" />;
apps\workshop-web\app\customer-reception\customers\page.tsx:2:import { CustomersScreen } from '../../_screens/customers-screen';
apps\workshop-web\app\customer-reception\customers\page.tsx:5: * /customer-reception/customers — the §34 WORKSPACE DEFAULT route.
apps\workshop-web\app\customer-reception\customers\page.tsx:13: * The screen lives in `app/_screens/customers-screen.tsx`, shared with those
apps\workshop-web\app\customer-reception\customers\page.tsx:18: * the customer book — measured with a real technician token, which the API
apps\workshop-web\app\customer-reception\customers\page.tsx:26:  await requireNavRoute('workshop', '/customer-reception/customers');
apps\workshop-web\app\customer-reception\customers\page.tsx:27:  return <CustomersScreen route="/customer-reception/customers" />;
apps\workshop-web\app\customer-approval\quotations\[id]\page.tsx:5: * /customer-approval/quotations/<id> — one quotation. the §47 WORKSHOP MANAGER tree — the role §5's internal approval is written for.
apps\workshop-web\app\customer-approval\quotations\[id]\page.tsx:19:  await requireNavRoute('workshop', '/customer-approval/quotations');
apps\workshop-web\app\customer-approval\quotations\[id]\page.tsx:21:  return <QuotationSheetScreen route="/customer-approval/quotations" quotationId={id} />;
apps\workshop-web\app\customer-approval\quotations\page.tsx:5: * /customer-approval/quotations — the §47 WORKSHOP MANAGER tree — the role §5's internal approval is written for.
apps\workshop-web\app\customer-approval\quotations\page.tsx:20:  await requireNavRoute('workshop', '/customer-approval/quotations');
apps\workshop-web\app\customer-approval\quotations\page.tsx:21:  return <QuotationQueueScreen route="/customer-approval/quotations" />;
apps\workshop-web\app\customer-approval\pending-approvals\[id]\page.tsx:5: * /customer-approval/pending-approvals/<id> — one customer proposal. the §47 WORKSHOP MANAGER tree — the role that chases an unanswered proposal.
apps\workshop-web\app\customer-approval\pending-approvals\[id]\page.tsx:18:  await requireNavRoute('workshop', '/customer-approval/pending-approvals');
apps\workshop-web\app\customer-approval\pending-approvals\[id]\page.tsx:20:  return <ProposalSheetScreen route="/customer-approval/pending-approvals" proposalId={id} />;
apps\workshop-web\app\customer-approval\pending-approvals\page.tsx:5: * /customer-approval/pending-approvals — the §47 WORKSHOP MANAGER tree — the role that chases an unanswered proposal.
apps\workshop-web\app\customer-approval\pending-approvals\page.tsx:19:  await requireNavRoute('workshop', '/customer-approval/pending-approvals');
apps\workshop-web\app\customer-approval\pending-approvals\page.tsx:20:  return <ProposalQueueScreen route="/customer-approval/pending-approvals" />;
packages\next-shell\src\viewer.test.ts:89:    expect(navRoleFor('customer')).toBeUndefined();
packages\next-shell\src\viewer.test.ts:204:      ['customer', 'fleet', 'insurance', 'supplier', 'towing', 'workshop'].sort(),
apps\workshop-web\app\auth\error\page.tsx:1:import { AuthErrorScreen } from '@autoworkshop/next-shell';
apps\workshop-web\app\auth\error\page.tsx:4: * /auth/error — where `pages.error` sends a failed sign-in.
apps\workshop-web\app\auth\error\page.tsx:7: * `pages.error` for every workspace from one shared config, so an app without
apps\workshop-web\app\auth\error\page.tsx:23:  return <AuthErrorScreen error={error} />;
apps\workshop-web\app\_screens\execution-work-form.tsx:70:    customerApprovalConfirmed: boolean;
apps\workshop-web\app\_screens\execution-work-form.tsx:218:          These are what the customer agreed to pay for. A task that turns out not to be
apps\workshop-web\app\_screens\execution-work-form.tsx:322:          customer&rsquo;s approval itself is enforced by the system and cannot be ticked
apps\workshop-web\app\_screens\execution-work-form.tsx:337:              ['customerApprovalConfirmed', 'Customer approval received', readiness.customerApprovalConfirmed],
apps\workshop-web\app\_screens\execution-sheet-screen.tsx:47:  customerApprovalConfirmed: boolean;
apps\workshop-web\app\_screens\execution-sheet-screen.tsx:164:        {/* Which customer approval authorised this — §7's requirement, made visible. */}
apps\workshop-web\app\_screens\execution-sheet-screen.tsx:192:            customerApprovalConfirmed: e.customerApprovalConfirmed,
apps\workshop-web\app\_screens\execution-queue-screen.tsx:36:  customerName: string;
apps\workshop-web\app\_screens\execution-queue-screen.tsx:70:        description="Vehicles being worked on. A repair cannot start until the customer has approved a proposal, and cannot be completed while an approved task is unfinished or somebody is still clocked on."
apps\workshop-web\app\_screens\execution-queue-screen.tsx:101:        description="A vehicle appears here once its job card is authorised to start, which follows the customer approving a proposal. Record a customer decision on the Customer Proposals screen first."
apps\workshop-web\app\_screens\execution-actions.ts:14: * out a repair, that an APPROVED customer proposal exists (§7), that a blocked task
apps\workshop-web\app\_screens\execution-actions.ts:86:    customerApprovalConfirmed: formData.get('customerApprovalConfirmed') !== null,
apps\workshop-web\app\_screens\execution-actions.ts:114:          : 'Say why it is not required. The customer approved it, so its absence needs an explanation.',
apps\workshop-web\app\_screens\directory-screen.tsx:51:        description="How your workshop appears to customers searching for a garage. Free to list, and you decide what is shown."
apps\workshop-web\app\_screens\directory-controls.tsx:81:      <Field label="Trading name" htmlFor="tradingName" hint="The name customers know you by">
packages\next-shell\src\require-route.ts:23: *   · §49 TECHNICIAN DOES NOT. A technician's navigation has no customers or
packages\next-shell\src\require-route.ts:33: * technician typing `/customer-reception/customers` gets a 404. The moment a
packages\next-shell\src\require-route.ts:34: * real `app/customer-reception/customers/page.tsx` lands, Next resolves it AHEAD
packages\next-shell\src\require-route.ts:36: * disappear at exactly the moment there is real customer data behind it.
packages\next-shell\src\require-route.ts:58:  /** The route's own path, e.g. `/customer-reception/customers`. */
apps\towing-web\app\auth\error\page.tsx:1:import { AuthErrorScreen } from '@autoworkshop/next-shell';
apps\towing-web\app\auth\error\page.tsx:4: * /auth/error — where `pages.error` sends a failed sign-in.
apps\towing-web\app\auth\error\page.tsx:7: * `pages.error` for every workspace from one shared config, so an app without
apps\towing-web\app\auth\error\page.tsx:23:  return <AuthErrorScreen error={error} />;
packages\next-shell\src\require-access.ts:25: * rendered a customer's name would have sent that name to someone not allowed
apps\workshop-web\app\_screens\diagnosis-queue-screen.tsx:45:  customerName: string;
apps\workshop-web\app\_screens\diagnosis-queue-screen.tsx:222:                  <td style={cell}>{card.customerName}</td>
packages\next-shell\src\registration.ts:30:   * The person's name — the ONLY way `customer-web` can learn it.
packages\next-shell\src\registration.ts:33:   * in customer-web that viewer is not an edge case: a vehicle owner buying a
apps\workshop-web\app\_screens\diagnosis-labels.ts:29: * what a repair plan and a customer charge are built from — it must not read as
apps\supplier-web\app\_screens\supplier-orders-screen.tsx:93:        description="When a customer orders one of your published parts from the marketplace, it appears here with their delivery details."
apps\supplier-web\app\_screens\supplier-orders-screen.tsx:111:            The customer can still cancel until you do.
apps\supplier-web\app\_screens\supplier-orders-screen.tsx:162:                provider is configured — the customer settles with you directly
apps\supplier-web\app\_screens\supplier-orders-screen.tsx:167:                : 'Not yet recorded as paid — the customer pays you directly.'}
apps\workshop-web\app\_screens\diagnosis-findings-form.tsx:639:          // established fault — and a confirmed fault is what a customer is charged
packages\next-shell\src\quick-create.ts:16: * `register-customer` is `/customers-and-vehicles/…` for the owner,
packages\next-shell\src\quick-create.ts:17: * `/customer-reception/…` on the §34 default tree, `/requests-and-reception/…`
packages\next-shell\src\quick-create.ts:18: * for the manager, `/customers/…` for reception — and the technician has no
packages\next-shell\src\quick-create.ts:32: * theoretical: on the §34 default tree `register-customer` carries
packages\next-shell\src\quick-create.ts:42: * @param slug the LAST path segment of the action, e.g. `register-customer`.
apps\supplier-web\app\_screens\supplier-orders-actions.ts:14: * ⚠️ THE WORKSPACE ID IS `'supplier'`, NOT `'customer'`, AND IT IS NOT
apps\supplier-web\app\_screens\supplier-orders-actions.ts:67: * lies is worse than a reference the customer can quote.
apps\supplier-web\app\_screens\order-controls.tsx:51:          ? 'This order is complete. If something was wrong with it, the customer raises a return — that keeps the record that it was delivered.'
apps\supplier-web\app\_screens\order-controls.tsx:106:                (`ck_order_cancelled_reason`), and the customer sees this. */}
apps\supplier-web\app\_screens\order-controls.tsx:107:            Why can you not supply this? The customer will see it.
apps\workshop-web\app\_screens\detail-parts.tsx:7: * Extracted because the customer and vehicle detail pages present the same
apps\workshop-web\app\_screens\customers-screen.tsx:10: * The customers screen — ONE implementation, mounted at several routes.
apps\workshop-web\app\_screens\customers-screen.tsx:17: *   · §34 default    `/customer-reception/customers`      (platform admin, and
apps\workshop-web\app\_screens\customers-screen.tsx:20: *   · §46 owner      `/customers-and-vehicles/customers`
apps\workshop-web\app\_screens\customers-screen.tsx:21: *   · §48 reception  `/customers/customer-search`
apps\workshop-web\app\_screens\customers-screen.tsx:22: *   · §47 manager    — no customer list at all —
apps\workshop-web\app\_screens\customers-screen.tsx:23: *   · §49 technician — no customer list at all —
apps\workshop-web\app\_screens\customers-screen.tsx:42:  customerType: string;
apps\workshop-web\app\_screens\customers-screen.tsx:52:  // Resolved together: the heading, and where THIS viewer may add a customer.
apps\workshop-web\app\_screens\customers-screen.tsx:53:  // `register-customer` sits under a different group in every tree and is
apps\workshop-web\app\_screens\customers-screen.tsx:58:    quickCreateHref('workshop', 'register-customer'),
apps\workshop-web\app\_screens\customers-screen.tsx:67:          The way IN to this screen's whole purpose. A customer book with no
apps\workshop-web\app\_screens\customers-screen.tsx:73:        actions={<QuickCreateButton href={addHref} label="Add customer" />}
apps\workshop-web\app\_screens\customers-screen.tsx:77:      <Suspense fallback={<LoadingState label="Loading customers…" />}>
apps\workshop-web\app\_screens\customers-screen.tsx:88:  const result = await apiGet<Customer[]>('workshop', '/customers');
apps\workshop-web\app\_screens\customers-screen.tsx:97:        title="No customers yet"
apps\workshop-web\app\_screens\customers-screen.tsx:108:          {result.data.length} customer{result.data.length === 1 ? '' : 's'}
apps\workshop-web\app\_screens\customers-screen.tsx:145:                {c.customerType === 'business' ? 'Business' : 'Individual'}
apps\workshop-web\app\_screens\customers-screen.tsx:150:                    screen is the workshop's own customer book, and the roles
apps\workshop-web\app\_screens\customers-screen.tsx:156:                {/* Counted by a LEFT JOIN in the service, so a customer with no
packages\next-shell\src\index.ts:75: * The page Auth.js sends a failed sign-in to — wired up by `pages.error` in
packages\next-shell\src\index.ts:79:export { AuthErrorScreen } from './AuthErrorScreen';
packages\next-shell\src\index.ts:80:export type { AuthErrorScreenProps } from './AuthErrorScreen';
apps\workshop-web\app\_screens\customer-detail-screen.tsx:7: * One customer, and the vehicles registered to them.
apps\workshop-web\app\_screens\customer-detail-screen.tsx:10: * column on the customer — they are `core.vehicles` rows found by
apps\workshop-web\app\_screens\customer-detail-screen.tsx:11: * `customer_id`, fetched through `GET /customers/:id/vehicles`, with the make
apps\workshop-web\app\_screens\customer-detail-screen.tsx:24:  customerType: string;
apps\workshop-web\app\_screens\customer-detail-screen.tsx:61:  // Fetched together: the vehicle list does not depend on the customer having
apps\workshop-web\app\_screens\customer-detail-screen.tsx:63:  const [customer, vehicles] = await Promise.all([
apps\workshop-web\app\_screens\customer-detail-screen.tsx:64:    apiGet<Customer>('workshop', `/customers/${id}`),
apps\workshop-web\app\_screens\customer-detail-screen.tsx:65:    apiGet<Vehicle[]>('workshop', `/customers/${id}/vehicles`),
apps\workshop-web\app\_screens\customer-detail-screen.tsx:68:  if (!customer.ok) {
apps\workshop-web\app\_screens\customer-detail-screen.tsx:69:    const __reason = customer.reason;
apps\workshop-web\app\_screens\customer-detail-screen.tsx:72:        <BackLink href={listHref} label="Back to the customer list" />
apps\workshop-web\app\_screens\customer-detail-screen.tsx:78:  const c = customer.data;
apps\workshop-web\app\_screens\customer-detail-screen.tsx:82:      <BackLink href={listHref} label="Back to the customer list" />
apps\workshop-web\app\_screens\customer-detail-screen.tsx:85:        description={c.customerType === 'business' ? 'Business customer' : 'Individual customer'}
apps\workshop-web\app\_screens\customer-detail-screen.tsx:110:          // The vehicle list failing must not take out the customer's contact
apps\workshop-web\app\_screens\customer-detail-screen.tsx:119:            description="This customer has no vehicle on file yet. Register one from the Vehicles section."
packages\next-shell\src\AuthErrorScreen.tsx:30: * `suspenders: ['billing']` on 2026-07-28. `keep-warm.yml` exists alongside this
packages\next-shell\src\AuthErrorScreen.tsx:47: * others are here because `pages.error` captures ALL of them, and falling
packages\next-shell\src\AuthErrorScreen.tsx:77:export interface AuthErrorScreenProps {
packages\next-shell\src\AuthErrorScreen.tsx:84:export function AuthErrorScreen({ error, signInHref = '/api/auth/signin' }: AuthErrorScreenProps) {
packages\next-shell\src\AuthErrorScreen.tsx:138:          The raw code, small and last. It is meaningless to a customer and it is
apps\workshop-web\app\_screens\create-workshop-screen.tsx:16: * It is mounted in workshop-web's layout ONLY. A customer with no workshop is
apps\workshop-web\app\_screens\create-workshop-screen.tsx:17: * not an incomplete workshop owner — they are a customer, and `customer-web`
apps\workshop-web\app\_screens\create-workshop-screen.tsx:54:        be its owner — job cards, staff, customers and vehicles all live inside
apps\workshop-web\app\_screens\create-workshop-screen.tsx:65:          hint="What your customers call you. You can change it later."
apps\workshop-web\app\workshop-operations\customer-complaints\page.tsx:6: * /workshop-operations/customer-complaints — a real view of real job cards, narrowed to one point in the
apps\workshop-web\app\workshop-operations\customer-complaints\page.tsx:14:  await requireNavRoute('workshop', '/workshop-operations/customer-complaints');
apps\workshop-web\app\workshop-operations\customer-complaints\page.tsx:15:  return <JobQueueScreen route="/workshop-operations/customer-complaints" queue={JOB_QUEUES['/workshop-operations/customer-complaints']} />;
packages\navigation\src\workspaces.ts:50:const customerGroups: NavGroup[] = [
packages\navigation\src\workspaces.ts:53:    ['my-tasks', 'My Tasks', { counterKey: 'customer.tasks.open' }],
packages\navigation\src\workspaces.ts:54:    ['notifications', 'Notifications', { counterKey: 'customer.notifications.unread' }],
packages\navigation\src\workspaces.ts:56:  group('my-vehicles', 'My Vehicles', 'car', [
packages\navigation\src\workspaces.ts:61:    ['service-history', 'Service History'],
packages\navigation\src\workspaces.ts:63:  group('service-and-repairs', 'Service and Repairs', 'wrench', [
packages\navigation\src\workspaces.ts:67:    ['repair-proposals', 'Repair Proposals', { counterKey: 'customer.proposals.pending' }],
packages\navigation\src\workspaces.ts:69:    ['completed-repairs', 'Completed Repairs'],
packages\navigation\src\workspaces.ts:81:    // existed, so it has no item for a customer's own parts orders. Without a
packages\navigation\src\workspaces.ts:96:    ['messages', 'Messages', { counterKey: 'customer.messages.unread' }],
packages\navigation\src\workspaces.ts:132:  group('customer-reception', 'Customer Reception', 'users', [
packages\navigation\src\workspaces.ts:133:    ['customers', 'Customers'],
packages\navigation\src\workspaces.ts:139:    // of them may create a customer.
packages\navigation\src\workspaces.ts:150:    ['register-customer', 'Register Customer', { permission: 'organization.admin' }],
packages\navigation\src\workspaces.ts:152:    // Same reasoning. `CAN_CREATE_VEHICLE` additionally includes `customer`,
packages\navigation\src\workspaces.ts:178:    ['customer-proposals', 'Customer Proposals'],
packages\navigation\src\workspaces.ts:216:    ['customer-service', 'Customer Service'],
packages\navigation\src\workspaces.ts:275:    ['customer-inquiries', 'Customer Inquiries', { counterKey: 'supplier.inquiries.open' }],
packages\navigation\src\workspaces.ts:324:    ['completed-repairs', 'Completed Repairs'],
packages\navigation\src\workspaces.ts:565:  group('customers-and-vehicles', 'Customers and Vehicles', 'users', [
packages\navigation\src\workspaces.ts:566:    ['customers', 'Customers'],
packages\navigation\src\workspaces.ts:567:    ['register-customer', 'Register Customer'],
packages\navigation\src\workspaces.ts:571:    ['customer-feedback', 'Customer Feedback'],
packages\navigation\src\workspaces.ts:575:    ['customer-complaints', 'Customer Complaints', { counterKey: 'workshop.complaints.new' }],
packages\navigation\src\workspaces.ts:586:    ['customer-approvals', 'Customer Approvals'],
packages\navigation\src\workspaces.ts:630:    ['customer-service', 'Customer Service'],
packages\navigation\src\workspaces.ts:660:    ['register-customer', 'Register Customer'],
packages\navigation\src\workspaces.ts:663:    ['customer-complaint-inbox', 'Customer Complaint Inbox', { counterKey: 'workshop.complaints.new' }],
packages\navigation\src\workspaces.ts:679:    ['customer-approval', 'Customer Approval', { counterKey: 'workshop.proposals.pendingApproval' }],
packages\navigation\src\workspaces.ts:694:    ['customer-messages', 'Customer Messages', { counterKey: 'workshop.messages.unread' }],
packages\navigation\src\workspaces.ts:707:/** §48 — Reception Staff: customer, vehicle, intake, invoice and release. */
packages\navigation\src\workspaces.ts:715:  group('customers', 'Customers', 'users', [
packages\navigation\src\workspaces.ts:716:    ['customer-search', 'Customer Search'],
packages\navigation\src\workspaces.ts:717:    ['register-customer', 'Register Customer'],
packages\navigation\src\workspaces.ts:718:    ['customer-messages', 'Customer Messages', { counterKey: 'workshop.messages.unread' }],
packages\navigation\src\workspaces.ts:727:    ['customer-complaint-inbox', 'Customer Complaint Inbox', { counterKey: 'workshop.complaints.new' }],
packages\navigation\src\workspaces.ts:737:  group('customer-approval', 'Customer Approval', 'sparkles', [
packages\navigation\src\workspaces.ts:833: * (`workspaces.customer`) possibly-undefined and forcing `!` at each call site.
packages\navigation\src\workspaces.ts:838:  customer: {
packages\navigation\src\workspaces.ts:839:    id: 'customer',
packages\navigation\src\workspaces.ts:842:    groups: customerGroups,
packages\navigation\src\workspaces.ts:890: *   `01 (1).txt` §33 customer · §34 workshop · §35 supplier · §36 fleet · §37 insurance
apps\workshop-web\app\workshop-floor\job-cards\[id]\page.tsx:14: * NOT the record-level check. `JobCardService.findById` re-verifies role, tenant
docs\01-product\BUSINESS_RULES.md:7:1. **No chargeable repair starts without recorded customer approval.** The only exception is an explicitly
docs\01-product\BUSINESS_RULES.md:26:12. The customer's original submission is preserved. AI summaries never replace the original text, audio,
docs\01-product\BUSINESS_RULES.md:28:13. The system always distinguishes: customer-reported symptom · AI hypothesis · technician observation ·
packages\navigation\src\types.ts:69:  | 'customer'
packages\navigation\src\resolve.test.ts:145:  it('customer has the 8 groups of §33', () => {
packages\navigation\src\resolve.test.ts:146:    expect(workspaces.customer.groups).toHaveLength(8);
packages\navigation\src\resolve.test.ts:191:      ['admin', 'customer', 'fleet', 'insurance', 'supplier', 'towing', 'workshop'].sort(),
packages\navigation\src\resolve.test.ts:266:    const customer = getWorkspace('customer')!;
packages\navigation\src\resolve.test.ts:267:    expect(workspaceForRole(customer, 'owner')).toBe(customer);
apps\supplier-web\app\auth\error\page.tsx:1:import { AuthErrorScreen } from '@autoworkshop/next-shell';
apps\supplier-web\app\auth\error\page.tsx:4: * /auth/error — where `pages.error` sends a failed sign-in.
apps\supplier-web\app\auth\error\page.tsx:7: * `pages.error` for every workspace from one shared config, so an app without
apps\supplier-web\app\auth\error\page.tsx:23:  return <AuthErrorScreen error={error} />;
apps\fleet-web\app\auth\error\page.tsx:1:import { AuthErrorScreen } from '@autoworkshop/next-shell';
apps\fleet-web\app\auth\error\page.tsx:4: * /auth/error — where `pages.error` sends a failed sign-in.
apps\fleet-web\app\auth\error\page.tsx:7: * `pages.error` for every workspace from one shared config, so an app without
apps\fleet-web\app\auth\error\page.tsx:23:  return <AuthErrorScreen error={error} />;
apps\storybook\stories\Tabs.stories.tsx:24:  { id: 'overview', label: 'Overview', content: <p>Vehicle, customer and complaint summary.</p> },
apps\storybook\stories\StatusBadge.stories.tsx:24:export const Attention: Story = { args: { kind: 'attention', label: 'Awaiting customer approval' } };
apps\storybook\stories\SideNav.stories.tsx:115:/** The customer workspace — a different, much shorter tree (§17). */
apps\storybook\stories\SideNav.stories.tsx:119:    groups: requireWorkspace('customer').groups,
apps\storybook\stories\SideNav.stories.tsx:121:    expanded: requireWorkspace('customer').groups.map((g) => g.id),
docs\00-project\RELEASE_PLAN.md:8:| **0.4** | Reception, intake, job cards, staging, diagnosis, quotation, customer approval, QC | Flag off; approval records are append-only and preserved |
docs\00-project\PLAN_EXTENSION_v1.md:130:The 7-workspace navigation model gains no new workspace: Car Owner and Owner-Driver are both the `customer`
docs\00-project\PLAN_EXTENSION_v1.md:160:| §27–§30 | **Internal technical review, specialist consultation**, quotation preparation, customer approval | Phase 5 |
docs\00-project\PLAN_EXTENSION_v1.md:192:(no private customer records, no unapproved repair documents, no personal contact details without consent, no
docs\00-project\PLAN_EXTENSION_v1.md:280:reviewer**. §9 forbids showing the customer unreviewed agent conclusions, raw manufacturer documents,
docs\00-project\PLAN_EXTENSION_v1.md:419:| Agent output treated as diagnosis | Confidence on every output; technician acceptance is the only path to a customer-facing document |
docs\00-project\PLAN_EXTENSION_v1.md:426:- **no agent output reaches a customer-facing surface without a recorded technician acceptance.**
docs\00-project\COMBINED_PLAN_v2.md:155:│   ├── customer-web/ workshop-web/ supplier-web/ fleet-web/
docs\00-project\COMBINED_PLAN_v2.md:193:customer-vehicle · complaint-appointment · workshop-technician · repair-job-diagnosis ·
docs\00-project\COMBINED_PLAN_v2.md:240:identity-access · customer-vehicle · complaint-appointment · workshop-technician · repair-diagnostic ·
docs\00-project\COMBINED_PLAN_v2.md:257:supplier descriptions, customer uploads, chat messages, search results — is tagged untrusted and passed as
docs\00-project\COMBINED_PLAN_v2.md:284:entries, customer explanations and audio guidance independently translatable**. Technical terms retain the
docs\00-project\COMBINED_PLAN_v2.md:522:| 7 | Unsafe AI repair instruction followed by a technician | Safety agent reviews high-risk output; RAG grounded on *approved* content only; technician approval before any customer-facing proposal; confidence + sources on every output |
docs\00-project\COMBINED_PLAN_v2.md:632:customer audio, images and video **by design** — the largest attack surface in the system.
apps\api\src\tenancy\tenant-context.spec.ts:206:        memberships: [membership({ roleName: 'customer' })],
apps\api\src\storage\storage.service.ts:17: *   · the API would then hold customer vehicle photographs in memory, which is
apps\api\src\storage\storage.integration.spec.ts:86:    // exposing customer vehicle photographs to the internet. The assertion was
apps\api\src\security\security.controller.ts:30: * What leaks if it fails is not customer data — it is a map of which tables are
apps\api\src\security\security.controller.spec.ts:69:    'customer',
apps\api\src\security\security-posture.spec.ts:192:    // The posture report must never become a way to read customer, vehicle or
apps\api\src\security\security-posture.service.ts:130:   * counts. No row of customer, vehicle or job data is read by this file.
apps\api\src\security\security-posture.service.ts:317:   * looks like another table's primary key. A `uuid` named `customer_id` with no
apps\api\src\repair\variation.spec.ts:49:  it('excludes reception, the customer and unknown roles from both', () => {
apps\api\src\repair\variation.spec.ts:50:    for (const role of ['reception_staff', 'customer', 'cashier', 'storekeeper', '']) {
apps\api\src\repair\variation.spec.ts:79:    // Discovering a loose clip that needs re-seating is a variation the customer
apps\api\src\repair\variation.spec.ts:115:describe('parseDecision — recording the customer answer', () => {
apps\api\src\repair\variation.spec.ts:118:   * only thing standing between the workshop and an invoice the customer
apps\api\src\repair\variation.spec.ts:154:  it('accepts "modified" — the customer wants it changed, not refused', () => {
apps\api\src\repair\variation.service.ts:28: * they found, somebody ELSE reviews it internally, the customer is asked, and
apps\api\src\repair\variation.service.ts:57:   * variation to be "reviewed internally" before the customer sees it, and a
apps\api\src\repair\variation.service.ts:99:          ORDER BY (v.status IN ('draft','internally_reviewed','sent_to_customer')) DESC,
apps\api\src\repair\variation.service.ts:113:   * the customer was shown. Same reasoning that makes a quotation store its
apps\api\src\repair\variation.service.ts:232:            'internal review by somebody else before the customer is asked',
apps\api\src\repair\variation.service.ts:255:              SET status='sent_to_customer', sent_at=now(), updated_at=now(), updated_by=$2
apps\api\src\repair\variation.service.ts:266:   * Record the customer's decision, and — only for an approval — authorise the
apps\api\src\repair\variation.service.ts:270:   * "approve, then authorise" leaves a window in which the customer has said yes
apps\api\src\repair\variation.service.ts:288:      if (row.status !== 'sent_to_customer') {
apps\api\src\repair\variation.service.ts:290:          `a decision can only be recorded once the variation has been sent to the customer; ` +
apps\api\src\repair\variation.service.ts:305:        // The customer wants it changed. Back to draft — the workshop rewrites
apps\api\src\repair\variation.service.ts:307:        // `sent_to_customer -> draft` and why this is a decision in its own
apps\api\src\repair\variation-rules.ts:26:  'sent_to_customer',
apps\api\src\repair\variation-rules.ts:51: * Who may REVIEW one internally, and who may record the customer's decision.
apps\api\src\repair\variation-rules.ts:54: * variation to be "reviewed internally" before it is sent to the customer — a
apps\api\src\repair\variation-rules.ts:194: * The customer's answer, as recorded by staff.
apps\api\src\repair\variation-rules.ts:198: * between the workshop and an invoice the customer disputes. Migration 032's
apps\api\src\repair\variation-rules.ts:212:      'the decision must be approved, rejected, or modified (the customer wants it changed)',
apps\api\src\repair\variation-rules.ts:234:  // A rejection the customer gave a reason for is worth far more to the next
apps\api\src\repair\testing.spec.ts:108:  card: /FROM repair\.job_cards j\s+JOIN core\.customers/,
apps\api\src\repair\testing.spec.ts:345:    // ABS light is on can legitimately go back to a customer who has been told.
apps\api\src\repair\testing.spec.ts:370:      ctx({ activeRole: 'workshop_supervisor' }), SESSION_ID, { reason: 'customer informed' },
apps\api\src\repair\testing.service.ts:105: * on can legitimately go back to a customer who has been told and has agreed; a system
apps\api\src\repair\testing.service.ts:727:         JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
apps\api\src\repair\testing.service.ts:735:        ctx.activeRole === 'customer' ? ctx.userId : null,
apps\api\src\repair\testing-rules.ts:146: * `customer` is ABSENT: the vehicle owner receives a completion report, not the raw
apps\api\src\repair\repair.spec.ts:2:import { JobCardService } from './job-card.service';
apps\api\src\repair\repair.spec.ts:54:  customer_id: 'c1',
apps\api\src\repair\repair.spec.ts:55:  customer_name: 'Kwame Mensah',
apps\api\src\repair\repair.spec.ts:73:describe('JobCardService — who sees which cards', () => {
apps\api\src\repair\repair.spec.ts:76:    const svc = new JobCardService(db, fakeAudit());
apps\api\src\repair\repair.spec.ts:86:    const svc = new JobCardService(db, fakeAudit());
apps\api\src\repair\repair.spec.ts:87:    await svc.list(ctx({ activeRole: 'customer', userId: 'cust-9' }));
apps\api\src\repair\repair.spec.ts:94:    const svc = new JobCardService(db, fakeAudit());
apps\api\src\repair\repair.spec.ts:102:    const svc = new JobCardService(db, fakeAudit());
apps\api\src\repair\repair.spec.ts:112:    const svc = new JobCardService(db, fakeAudit());
apps\api\src\repair\repair.spec.ts:120:      const svc = new JobCardService(db, fakeAudit());
apps\api\src\repair\repair.spec.ts:127:describe('JobCardService — opening a card', () => {
apps\api\src\repair\repair.spec.ts:130:    const svc = new JobCardService(db, fakeAudit());
apps\api\src\repair\repair.spec.ts:136:  it('refuses a customer opening a card against a vehicle that is not theirs', async () => {
apps\api\src\repair\repair.spec.ts:140:    const svc = new JobCardService(db, fakeAudit());
apps\api\src\repair\repair.spec.ts:142:      svc.create(ctx({ activeRole: 'customer', userId: 'cust-9' }), {
apps\api\src\repair\repair.spec.ts:150:  it('passes the viewer as the ownership predicate for a customer', async () => {
apps\api\src\repair\repair.spec.ts:152:      /FROM core\.vehicles/.test(t) ? [{ id: VEHICLE_ID, customer_id: 'c1', current_mileage_km: 100 }] : [jobRow],
apps\api\src\repair\repair.spec.ts:154:    const svc = new JobCardService(db, fakeAudit());
apps\api\src\repair\repair.spec.ts:155:    await svc.create(ctx({ activeRole: 'customer', userId: 'cust-9' }), {
apps\api\src\repair\repair.spec.ts:165:      /FROM core\.vehicles/.test(t) ? [{ id: VEHICLE_ID, customer_id: 'c1', current_mileage_km: 100 }] : [jobRow],
apps\api\src\repair\repair.spec.ts:167:    const svc = new JobCardService(db, fakeAudit());
apps\api\src\repair\repair.spec.ts:176:  it('refuses a customer trying to assign a technician', async () => {
apps\api\src\repair\repair.spec.ts:178:    const svc = new JobCardService(db, fakeAudit());
apps\api\src\repair\repair.spec.ts:180:      svc.create(ctx({ activeRole: 'customer' }), {
apps\api\src\repair\repair.spec.ts:196:      if (/FROM core\.vehicles/.test(t)) return [{ id: VEHICLE_ID, customer_id: 'c1', current_mileage_km: 1 }];
apps\api\src\repair\repair.spec.ts:200:    const svc = new JobCardService(db, fakeAudit());
apps\api\src\repair\repair.spec.ts:208:  it('derives the customer from the VEHICLE, never from the caller', async () => {
apps\api\src\repair\repair.spec.ts:211:        ? [{ id: VEHICLE_ID, customer_id: 'derived-customer', current_mileage_km: 4200 }]
apps\api\src\repair\repair.spec.ts:214:    const svc = new JobCardService(db, fakeAudit());
apps\api\src\repair\repair.spec.ts:217:    // Accepting a customer id from the caller would allow a card whose customer
apps\api\src\repair\repair.spec.ts:219:    expect(insert?.values).toContain('derived-customer');
apps\api\src\repair\repair.spec.ts:225:        ? [{ id: VEHICLE_ID, customer_id: 'c1', current_mileage_km: 84500 }]
apps\api\src\repair\repair.spec.ts:228:    const svc = new JobCardService(db, fakeAudit());
apps\api\src\repair\repair.spec.ts:236:      /FROM core\.vehicles/.test(t) ? [{ id: VEHICLE_ID, customer_id: 'c1', current_mileage_km: 1 }] : [jobRow],
apps\api\src\repair\repair.spec.ts:239:    const svc = new JobCardService(db, audit);
apps\api\src\repair\repair.spec.ts:244:    // A complaint is free text the customer typed and may contain anything;
apps\api\src\repair\repair.spec.ts:254:    const svc = new JobCardService(db, fakeAudit());
apps\api\src\repair\repair.spec.ts:262:    const svc = new JobCardService(db, fakeAudit());
apps\api\src\repair\repair.schemas.ts:29: *     was given — `JobCardService.changeStage` resolves all of that. A flat
apps\api\src\repair\repair.schemas.ts:253: * The customer's decision on a proposal.
apps\api\src\repair\repair.schemas.ts:276:  customerApprovalConfirmed: z.boolean().optional(),
apps\api\src\repair\repair.module.ts:26:import { JobCardService } from './job-card.service';
apps\api\src\repair\repair.module.ts:54:    JobCardService,
apps\api\src\repair\repair.module.ts:67:    JobCardService,
apps\api\src\repair\repair.controller.ts:18:import { JobCardService } from './job-card.service';
apps\api\src\repair\repair.controller.ts:68: * `JobCardService`, so an MCP tool calling that service gets them too
apps\api\src\repair\repair.controller.ts:75:    private readonly jobCards: JobCardService,
apps\api\src\repair\repair.controller.ts:125:   * The rules live in `JobCardService.changeStage` — `02.txt` §29 requires the
apps\api\src\repair\repair.controller.ts:249:  /** The customer proposals for a job card — `1.txt` §396-§424 (slice 6). */
apps\api\src\repair\repair.controller.ts:284:   * The service refuses unless an APPROVED customer proposal exists (§7: work shall
apps\api\src\repair\repair.controller.ts:839:   * Put the proposal in front of the customer.
apps\api\src\repair\repair.controller.ts:853:   * §7 — record the customer's answer.
apps\api\src\repair\repair.controller.ts:1161: * CUSTOMER. A customer is often not a system user at all — they answer the
apps\api\src\repair\repair.controller.ts:1188:  /** §3792 — reviewed internally, then optionally sent to the customer. */
apps\api\src\repair\repair.controller.ts:1198:  /** The customer's answer — and, for an approval, the authorisation with it. */
apps\api\src\repair\repair-plan.spec.ts:135:  /** The scoped job-card lookup — the only one that joins `core.customers`. */
apps\api\src\repair\repair-plan.spec.ts:136:  card: /FROM repair\.job_cards j\s+JOIN core\.customers/,
apps\api\src\repair\repair-plan.spec.ts:263:    await expect(service.list(ctx({ activeRole: 'customer' }))).rejects.toThrow(
apps\api\src\repair\repair-plan.spec.ts:323:    // is a customer charged for a technician's unchecked opinion.
apps\api\src\repair\repair-plan.spec.ts:420:    // customer charged for a guess.
apps\api\src\repair\repair-plan.spec.ts:701:    // A plan legitimately covers a SUBSET (a staged repair, a fault the customer will
apps\api\src\repair\repair-plan.service.ts:187: *     confirmed fault. Planning against a suspected fault is a customer charged for
apps\api\src\repair\repair-plan.service.ts:212:   * Reads the card through the SAME scoping predicates `JobCardService` uses, so the
apps\api\src\repair\repair-plan.service.ts:1003:   *    a staged repair, a fault the customer will take elsewhere, a fault whose part
apps\api\src\repair\repair-plan.service.ts:1225:         -- NO core.customers JOIN, DELIBERATELY, and for the reason slice 3b spelled
apps\api\src\repair\repair-plan.service.ts:1228:         -- kind of dead code in an authorization path. There is no customer scope to
apps\api\src\repair\repair-plan.service.ts:1229:         -- apply, because the customer role is absent from CAN_READ_REPAIR_PLAN
apps\api\src\repair\repair-plan.service.ts:1425:   * The job card, scoped exactly as `JobCardService` scopes it.
apps\api\src\repair\repair-plan.service.ts:1439:         JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
apps\api\src\repair\repair-plan.service.ts:1449:        ctx.activeRole === 'customer' ? ctx.userId : null,
apps\api\src\repair\repair-plan.service.ts:1535:          `'${row.finding_status}'. A plan built on a suspected fault is a customer ` +
apps\api\src\repair\repair-plan-rules.ts:11: * what a technician proposes, what a supervisor approves, and what a customer is
apps\api\src\repair\repair-plan-rules.ts:127: *   · `reception_staff` — §50 scopes them to the customer-facing half.
apps\api\src\repair\repair-plan-rules.ts:128: *   · `customer` — never a party to the technical record.
apps\api\src\repair\repair-plan-rules.ts:147: * `customer` is ABSENT for the reason `2.txt` §557 gives: the vehicle owner receives
apps\api\src\repair\repair-plan-rules.ts:197: * plan is what a customer quotation is priced from.
apps\api\src\repair\repair-plan-rules.ts:199: * A replan is not blocked. The lifecycle allows `awaiting_customer_approval →
apps\api\src\repair\repair-plan-rules.ts:200: * solution_preparation`, so revising a plan after the customer asks for changes
apps\api\src\repair\repair-plan-rules.ts:211: * built on an unreviewed diagnosis is a customer charged for a technician's
apps\api\src\repair\quotation.spec.ts:60:  customer_name: 'Kwame Mensah',
apps\api\src\repair\quotation.spec.ts:112:  card: /FROM repair\.job_cards j\s+JOIN core\.customers/,
apps\api\src\repair\quotation.spec.ts:187:    // ...but they may READ one: §31 has them confirm the customer approval before
apps\api\src\repair\quotation.spec.ts:281:    // quotation, including ones a customer has already approved.
apps\api\src\repair\quotation.spec.ts:302:    // that, so the fallback cannot quietly quote a customer nothing.
apps\api\src\repair\quotation.spec.ts:324:    // A lift is not a customer charge. Auto-pricing it would invent a fee nobody
apps\api\src\repair\quotation.spec.ts:344:    // A zero-hour labour line reads to a customer as "this work is free".
apps\api\src\repair\quotation.spec.ts:380:    // becomes "180.0050.00" — a wrong customer price no type error catches.
apps\api\src\repair\quotation.spec.ts:397:    // §4's "alternative options where applicable" are things the customer may decline.
apps\api\src\repair\quotation.spec.ts:437:    // without pricing them would send a customer a quotation offering free parts.
apps\api\src\repair\quotation.service.ts:49:  customerName: string;
apps\api\src\repair\quotation.service.ts:84:   * things the customer may decline, and adding them to the headline price would
apps\api\src\repair\quotation.service.ts:133: * single most likely source of a wrong customer charge.
apps\api\src\repair\quotation.service.ts:139: * customer charge can always answer "which task is this?".
apps\api\src\repair\quotation.service.ts:304:   * customer had already been shown.
apps\api\src\repair\quotation.service.ts:309:   * fabricated figure in front of a customer.
apps\api\src\repair\quotation.service.ts:435:        // route that changes what a customer pays.
apps\api\src\repair\quotation.service.ts:583:   *    pricing them would send a customer a quotation offering free parts — and
apps\api\src\repair\quotation.service.ts:610:          `${unpriced.length} line(s) are still priced at zero and would quote the customer ` +
apps\api\src\repair\quotation.service.ts:731:              c.display_name AS customer_name,
apps\api\src\repair\quotation.service.ts:745:         JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
apps\api\src\repair\quotation.service.ts:795:        // wrong customer price that no type error catches.
apps\api\src\repair\quotation.service.ts:810:      // a total comes to differ from the sum of the lines a customer can read.
apps\api\src\repair\quotation.service.ts:823:        customerName: row.customer_name,
apps\api\src\repair\quotation.service.ts:871:         JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
apps\api\src\repair\quotation.service.ts:879:        ctx.activeRole === 'customer' ? ctx.userId : null,
apps\api\src\repair\quotation.service.ts:942:   * advisor typed and the number the customer is charged must be the same number.
apps\api\src\repair\quotation.service.ts:1037:  customer_name: string;
apps\api\src\repair\quotation-rules.ts:12:/** §5's internal approval. `sent` is absent: issuing to a customer is slice 6. */
apps\api\src\repair\quotation-rules.ts:25: * discount cannot smuggle an unexplained increase past the customer.
apps\api\src\repair\quotation-rules.ts:71: * manager" is who holds it, plus reception, who is the customer-facing half (§50 gives
apps\api\src\repair\quotation-rules.ts:72: * them "customer, vehicle, complaint, appointment, intake, INVOICE and release").
apps\api\src\repair\quotation-rules.ts:85: * to do, and §31's execution flow has them confirm the customer approval before
apps\api\src\repair\quotation-rules.ts:88: * `customer` is ABSENT even though the quotation is ultimately FOR them: a DRAFT
apps\api\src\repair\quotation-rules.ts:91: * an unapproved price in front of a customer.
apps\api\src\repair\quotation-rules.ts:124: * awaiting_customer_approval`, so this is the one stage where a price is being made.
apps\storybook\stories\PageHeader.stories.tsx:103:      description="Booked in 14 March, awaiting customer approval for additional work."
apps\storybook\stories\PageHeader.stories.tsx:104:      actions={<StatusBadge kind="attention" label="Awaiting customer approval" />}
apps\api\src\repair\quality.spec.ts:46:  it('refuses reception, the customer, and an unknown role', () => {
apps\api\src\repair\quality.spec.ts:47:    for (const role of ['reception_staff', 'customer', 'storekeeper', 'cashier', '', 'admin']) {
apps\api\src\repair\quality.spec.ts:98:   * customer. Migration 030's `ck_qc_decision_consistent` refuses it in the
apps\api\src\repair\quality.service.ts:93:   * what the customer originally reported cannot answer the question they are
apps\api\src\repair\quality-rules.ts:91: * customer. Migration 030's `ck_qc_decision_consistent` refuses that pairing at
apps\api\src\repair\proposal.spec.ts:21: * offer to a customer, that the attribution of a decision is mandatory, and that §424's
apps\api\src\repair\proposal.spec.ts:58:  customer_name: 'Kwame Mensah',
apps\api\src\repair\proposal.spec.ts:59:  customer_email: 'kwame@example.com',
apps\api\src\repair\proposal.spec.ts:60:  customer_phone: '+233 24 000 0000',
apps\api\src\repair\proposal.spec.ts:61:  customer_location: 'Accra',
apps\api\src\repair\proposal.spec.ts:113:  card: /FROM repair\.job_cards j\s+JOIN core\.customers/,
apps\api\src\repair\proposal.spec.ts:177:      /may not prepare a customer proposal/,
apps\api\src\repair\proposal.spec.ts:180:    // §50's authority is technical review and stops at the customer's door.
apps\api\src\repair\proposal.spec.ts:183:    ).rejects.toThrow(/may not prepare a customer proposal/);
apps\api\src\repair\proposal.spec.ts:200:    // commonest real case: reception issues a proposal and the customer answers them
apps\api\src\repair\proposal.spec.ts:228:  it('refuses a second version while one is with the customer', async () => {
apps\api\src\repair\proposal.spec.ts:244:    // Replacing an agreement the customer has already given is a commercial act, not a
apps\api\src\repair\proposal.spec.ts:248:      /APPROVED by the customer/,
apps\api\src\repair\proposal.spec.ts:347:  it('requires the customer name and the channel', async () => {
apps\api\src\repair\proposal.spec.ts:368:    ).rejects.toThrow(/what the customer asked to change/);
apps\api\src\repair\proposal.spec.ts:379:  it('⚠️ records the customer as the decider and the staff member separately', async () => {
apps\api\src\repair\proposal.spec.ts:393:    // Position 3 is `decided_by_name` (the customer), position 6 is `recorded_by` (the
apps\api\src\repair\proposal.spec.ts:395:    // customer's own repair.
apps\api\src\repair\proposal.spec.ts:431:    ).rejects.toThrow(/with the customer and its content is frozen/);
apps\api\src\repair\proposal.spec.ts:498:    // a customer says they never agreed.
apps\api\src\repair\proposal.service.ts:29: * What §410-§422 says the customer must be shown, gathered from the records that
apps\api\src\repair\proposal.service.ts:78:   * The field most likely to be dropped and the one §416 names explicitly: a customer
apps\api\src\repair\proposal.service.ts:104:   * A commercial document a customer may quote back at the workshop needs an
apps\api\src\repair\proposal.service.ts:118:  customerName: string;
apps\api\src\repair\proposal.service.ts:139:  /** §7 — the total the customer actually agreed to, once they have. */
apps\api\src\repair\proposal.service.ts:154: * The customer proposal — `1.txt` §396-§424, `07.txt` §7.
apps\api\src\repair\proposal.service.ts:167: *   · An ISSUED proposal freezes too. A document that changes while the customer is
apps\api\src\repair\proposal.service.ts:172: * §410-§422 lists twelve things the customer must see, and ten already exist in
apps\api\src\repair\proposal.service.ts:240:            : `version ${open.version_no} is with the customer and has not been answered; ` +
apps\api\src\repair\proposal.service.ts:257:      // ⚠️ AN APPROVED PROPOSAL IS NOT SUPERSEDED SILENTLY. Once a customer has
apps\api\src\repair\proposal.service.ts:264:          `version ${previous.version_no} has been APPROVED by the customer. A material ` +
apps\api\src\repair\proposal.service.ts:373:   * Put the proposal in front of the customer.
apps\api\src\repair\proposal.service.ts:408:        // The money the customer is being shown, so the trail records the offer as
apps\api\src\repair\proposal.service.ts:426:   * §7 — record the customer's answer.
apps\api\src\repair\proposal.service.ts:433:   * agreed to this" when a customer later says they did not.
apps\api\src\repair\proposal.service.ts:465:          : 'say what the customer asked to change, or what they want explained; note is required',
apps\api\src\repair\proposal.service.ts:493:          'this proposal has not been issued to the customer yet, so there is no decision to record',
apps\api\src\repair\proposal.service.ts:516:            ? 'proposal.approved_by_customer'
apps\api\src\repair\proposal.service.ts:518:              ? 'proposal.declined_by_customer'
apps\api\src\repair\proposal.service.ts:522:        // The channel and the option, never the customer's free text. This is the
apps\api\src\repair\proposal.service.ts:552:              c.display_name AS customer_name,
apps\api\src\repair\proposal.service.ts:553:              c.email AS customer_email, c.phone AS customer_phone,
apps\api\src\repair\proposal.service.ts:554:              c.location AS customer_location,
apps\api\src\repair\proposal.service.ts:598:         JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
apps\api\src\repair\proposal.service.ts:691:      // lines a customer can read.
apps\api\src\repair\proposal.service.ts:705:        customerName: row.customer_name,
apps\api\src\repair\proposal.service.ts:755:            // The trading name is what a customer recognises; the legal name is who the
apps\api\src\repair\proposal.service.ts:771:            name: row.customer_name,
apps\api\src\repair\proposal.service.ts:772:            email: row.customer_email,
apps\api\src\repair\proposal.service.ts:773:            phone: row.customer_phone,
apps\api\src\repair\proposal.service.ts:774:            location: row.customer_location,
apps\api\src\repair\proposal.service.ts:783:        // What the customer actually agreed to — the figure an invoice is later checked
apps\api\src\repair\proposal.service.ts:807:         JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
apps\api\src\repair\proposal.service.ts:815:        ctx.activeRole === 'customer' ? ctx.userId : null,
apps\api\src\repair\proposal.service.ts:849:          ? `version ${row.version_no} is with the customer and its content is frozen; ` +
apps\api\src\repair\proposal.service.ts:896:      throw new ForbiddenException(`role '${ctx.activeRole}' may not prepare a customer proposal`);
apps\api\src\repair\proposal.service.ts:903:        `role '${ctx.activeRole}' may not record a customer decision`,
apps\api\src\repair\proposal.service.ts:953:  customer_name: string;
apps\api\src\repair\proposal.service.ts:984:  customer_email: string | null;
apps\api\src\repair\proposal.service.ts:985:  customer_phone: string | null;
apps\api\src\repair\proposal.service.ts:986:  customer_location: string | null;
apps\api\src\repair\proposal-rules.ts:13: * `superseded` is the one that is not a customer action: §424 says a material change
apps\api\src\repair\proposal-rules.ts:27: * §7 — what the customer may answer.
apps\api\src\repair\proposal-rules.ts:45: * which of those five the customer meant.
apps\api\src\repair\proposal-rules.ts:51: * §398-§402's repair options, as the customer's choice between them.
apps\api\src\repair\proposal-rules.ts:56: * it, and offering a customer a "minimum" figure the schema cannot compute is how a
apps\api\src\repair\proposal-rules.ts:65: * investigable — "the customer approved it" with no channel is an assertion, not a
apps\api\src\repair\proposal-rules.ts:73:  'customer_portal',
apps\api\src\repair\proposal-rules.ts:82:  customer_portal: 'Customer portal',
apps\api\src\repair\proposal-rules.ts:90: * Roles that may PREPARE and ISSUE a proposal to a customer.
apps\api\src\repair\proposal-rules.ts:92: * The same set that may prepare a quotation: this is the customer-facing half of the
apps\api\src\repair\proposal-rules.ts:94: * customer, complaint, appointment and intake functions, and they are who a customer
apps\api\src\repair\proposal-rules.ts:99: * approval, and it stops at the customer's door.
apps\api\src\repair\proposal-rules.ts:109: * Roles that may RECORD the customer's decision.
apps\api\src\repair\proposal-rules.ts:113: * `decided_by_name` names the customer while `recorded_by` names the scribe. Making
apps\api\src\repair\proposal-rules.ts:114: * this narrower would mean a customer standing at the desk could not be given an
apps\api\src\repair\proposal-rules.ts:120: * the customer, who is outside the system entirely — an independence check between
apps\api\src\repair\proposal-rules.ts:122: * real case: reception issues a proposal and the customer answers them on the spot.
apps\api\src\repair\proposal-rules.ts:123: * What protects this record instead is that the channel and the customer's name are
apps\api\src\repair\proposal-rules.ts:151: * when it goes to the customer, which is what `awaiting_customer_approval` means. Both
apps\api\src\repair\proposal-rules.ts:155:export const PROPOSAL_STAGES = ['quotation_preparation', 'awaiting_customer_approval'];
apps\api\src\repair\job-card.service.ts:33:  customerId: string;
apps\api\src\repair\job-card.service.ts:34:  customerName: string;
apps\api\src\repair\job-card.service.ts:79: *   · `customer`     — ONLY the cards raised against their own vehicles.
apps\api\src\repair\job-card.service.ts:82: * technicians, with a comment saying a technician gets the customer and vehicle
apps\api\src\repair\job-card.service.ts:84: * that can express it". This is that job card. A technician reads a customer
apps\api\src\repair\job-card.service.ts:98:  'customer',
apps\api\src\repair\job-card.service.ts:104: * `customer` is here because `2.txt` §537 has the vehicle owner reporting a
apps\api\src\repair\job-card.service.ts:106: * (`1.txt` §322: "Complaint received"). What a customer may raise one AGAINST
apps\api\src\repair\job-card.service.ts:117:  'customer',
apps\api\src\repair\job-card.service.ts:121:  SELECT j.id, j.job_number, j.customer_id, c.display_name AS customer_name,
apps\api\src\repair\job-card.service.ts:129:    JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
apps\api\src\repair\job-card.service.ts:165:export class JobCardService {
apps\api\src\repair\job-card.service.ts:180:            -- Customer: cards against a customer record linked to them.
apps\api\src\repair\job-card.service.ts:188:          ctx.activeRole === 'customer' ? ctx.userId : null,
apps\api\src\repair\job-card.service.ts:192:      return res.rows.map((row) => this.toDomain(ctx, row as Parameters<JobCardService['toDomain']>[1]));
apps\api\src\repair\job-card.service.ts:217:    // customer only their own. A separate query here would be a second place for
apps\api\src\repair\job-card.service.ts:256:          ctx.activeRole === 'customer' ? ctx.userId : null,
apps\api\src\repair\job-card.service.ts:270:   * received", which is what a customer reporting a problem produces.
apps\api\src\repair\job-card.service.ts:294:    // A customer may not hand a job to a technician; assignment is the
apps\api\src\repair\job-card.service.ts:296:    if (assignedTechnicianId && ctx.activeRole === 'customer') {
apps\api\src\repair\job-card.service.ts:297:      throw new ForbiddenException('a customer may not assign a technician');
apps\api\src\repair\job-card.service.ts:305:      // and nothing more, so without this lookup a customer could open a job
apps\api\src\repair\job-card.service.ts:310:      // The `c.user_id` clause is what confines a customer to their own
apps\api\src\repair\job-card.service.ts:313:        `SELECT v.id, v.customer_id, v.current_mileage_km
apps\api\src\repair\job-card.service.ts:315:           JOIN core.customers c ON c.id = v.customer_id AND c.tenant_id = v.tenant_id
apps\api\src\repair\job-card.service.ts:318:        [vehicleId, ctx.tenantId, ctx.organizationId, ctx.activeRole === 'customer' ? ctx.userId : null],
apps\api\src\repair\job-card.service.ts:322:      // The customer is DERIVED from the vehicle, never accepted from the
apps\api\src\repair\job-card.service.ts:323:      // caller. Taking both would allow a job card whose customer does not own
apps\api\src\repair\job-card.service.ts:326:      const customerId = vehicle.rows[0].customer_id;
apps\api\src\repair\job-card.service.ts:333:        // alone would let a card be assigned to a cashier or a customer. The
apps\api\src\repair\job-card.service.ts:358:           (tenant_id, organization_id, branch_id, job_number, customer_id, vehicle_id,
apps\api\src\repair\job-card.service.ts:368:          customerId,
apps\api\src\repair\job-card.service.ts:399:        // contain anything the customer typed, including personal detail, and
apps\api\src\repair\job-card.service.ts:442:    // A role with no entry may not change a stage at all. `customer` is the real
apps\api\src\repair\job-card.service.ts:461:           JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
apps\api\src\repair\job-card.service.ts:471:          ctx.activeRole === 'customer' ? ctx.userId : null,
apps\api\src\repair\job-card.service.ts:641:    return this.toDomain(ctx, res.rows[0] as Parameters<JobCardService['toDomain']>[1]);
apps\api\src\repair\job-card.service.ts:655:    customer_id: string;
apps\api\src\repair\job-card.service.ts:656:    customer_name: string;
apps\api\src\repair\job-card.service.ts:677:    customerId: row.customer_id,
apps\api\src\repair\job-card.service.ts:678:    customerName: row.customer_name,
apps\api\src\repair\job-card-stages.ts:39:  'awaiting_customer_approval',
apps\api\src\repair\job-card-stages.ts:64: *   · `quotation_preparation` leads ONLY to `awaiting_customer_approval`, so a
apps\api\src\repair\job-card-stages.ts:65: *     priced job cannot start without being put to the customer.
apps\api\src\repair\job-card-stages.ts:73: * a customer approving verbally — uses the override, which is authorized and
apps\api\src\repair\job-card-stages.ts:83:  // customer's own complaint.
apps\api\src\repair\job-card-stages.ts:111:  // THE APPROVAL GATE: the only way out is to ask the customer.
apps\api\src\repair\job-card-stages.ts:112:  quotation_preparation: ['awaiting_customer_approval', 'on_hold'],
apps\api\src\repair\job-card-stages.ts:113:  // The customer may approve (onward), or ask for changes (back to solution).
apps\api\src\repair\job-card-stages.ts:114:  awaiting_customer_approval: [
apps\api\src\repair\job-card-stages.ts:165: * the case for `customer`, who opens a complaint (`2.txt` §537) and does not
apps\api\src\repair\job-card-stages.ts:209:   * every one of them: no `awaiting_customer_approval`, no `awaiting_deposit`,
apps\api\src\repair\job-card-stages.ts:348:  { key: 'awaiting_customer_approval', label: 'Awaiting Customer Approval', stages: ['awaiting_customer_approval'] },
apps\api\src\repair\job-card-stages.spec.ts:4:import { JobCardService } from './job-card.service';
apps\api\src\repair\job-card-stages.spec.ts:51:  customer_id: 'c1',
apps\api\src\repair\job-card-stages.spec.ts:52:  customer_name: 'Kwame Mensah',
apps\api\src\repair\job-card-stages.spec.ts:116:    await new JobCardService(db, fakeAudit()).changeStage(ctx(), CARD_ID, {
apps\api\src\repair\job-card-stages.spec.ts:137:    await new JobCardService(db, fakeAudit()).changeStage(
apps\api\src\repair\job-card-stages.spec.ts:147:    await new JobCardService(db, fakeAudit()).changeStage(
apps\api\src\repair\job-card-stages.spec.ts:162:    await new JobCardService(db, fakeAudit()).changeStage(ctx(), CARD_ID, {
apps\api\src\repair\job-card-stages.spec.ts:173:    ['quotation_preparation', 'authorized_to_start', 'customer approval'],
apps\api\src\repair\job-card-stages.spec.ts:181:        new JobCardService(db, fakeAudit()).changeStage(
apps\api\src\repair\job-card-stages.spec.ts:197:      new JobCardService(db, fakeAudit()).changeStage(ctx({ activeRole: 'technician' }), CARD_ID, {
apps\api\src\repair\job-card-stages.spec.ts:208:      new JobCardService(db, fakeAudit()).changeStage(ctx(), CARD_ID, {
apps\api\src\repair\job-card-stages.spec.ts:218:    await new JobCardService(db, fakeAudit()).changeStage(
apps\api\src\repair\job-card-stages.spec.ts:234:      new JobCardService(db, fakeAudit()).changeStage(
apps\api\src\repair\job-card-stages.spec.ts:248:      new JobCardService(db, fakeAudit()).changeStage(
apps\api\src\repair\job-card-stages.spec.ts:262:      new JobCardService(db, fakeAudit()).changeStage(
apps\api\src\repair\job-card-stages.spec.ts:273:    await new JobCardService(db, audit).changeStage(ctx({ activeRole: 'workshop_owner' }), CARD_ID, {
apps\api\src\repair\job-card-stages.spec.ts:288:      new JobCardService(db, fakeAudit()).changeStage(
apps\api\src\repair\job-card-stages.spec.ts:289:        ctx({ activeRole: 'customer', userId: 'cust-9' }),
apps\api\src\repair\job-card-stages.spec.ts:312:      new JobCardService(db, fakeAudit()).changeStage(
apps\api\src\repair\job-card-stages.spec.ts:324:      new JobCardService(db, fakeAudit()).changeStage(ctx(), CARD_ID, { toStage: 'testing' }),
apps\api\src\repair\job-card-stages.spec.ts:334:      new JobCardService(db, fakeAudit()).changeStage(ctx(), CARD_ID, { toStage: 'road_tested' }),
apps\api\src\repair\job-card-stages.spec.ts:342:    await new JobCardService(db, fakeAudit()).changeStage(ctx(), CARD_ID, {
apps\api\src\repair\job-card-stages.spec.ts:353:    await new JobCardService(db, fakeAudit()).changeStage(ctx(), CARD_ID, {
apps\api\src\repair\job-card-stages.spec.ts:366:      new JobCardService(db, fakeAudit()).changeStage(
apps\api\src\repair\job-card-stages.spec.ts:386:      new JobCardService(db, fakeAudit()).changeStage(
apps\api\src\repair\job-card-stages.spec.ts:398:      new JobCardService(db, fakeAudit()).changeStage(
apps\api\src\repair\job-card-stages.spec.ts:479:      'awaiting_customer_approval',
apps\api\src\repair\inspection.spec.ts:79:  card: /FROM repair\.job_cards j\s+JOIN core\.customers/,
apps\api\src\repair\inspection.spec.ts:211:    await expect(svc.start(ctx({ activeRole: 'customer' }), CARD_ID)).rejects.toThrow(
apps\api\src\repair\inspection.spec.ts:215:      svc.listForJobCard(ctx({ activeRole: 'customer' }), CARD_ID),
apps\api\src\repair\inspection.spec.ts:259:    const { db, queries } = fakeDb([[/FROM repair\.job_cards j\s+JOIN core\.customers/, []]]);
apps\api\src\repair\inspection.spec.ts:300:    const cardRead = queries.find((q) => /FROM repair\.job_cards j\s+JOIN core\.customers/.test(q.text));
apps\api\src\repair\inspection.service.ts:83:   * Reads the card through the SAME scoping predicates `JobCardService` uses, so
apps\api\src\repair\inspection.service.ts:455:         -- ⚠️ NO core.customers JOIN HERE, DELIBERATELY (Supervisor pass on this
apps\api\src\repair\inspection.service.ts:463:         -- There is no customer scope to apply, because the customer role is
apps\api\src\repair\inspection.service.ts:546:   * The job card, scoped exactly as `JobCardService` scopes it.
apps\api\src\repair\inspection.service.ts:561:         JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
apps\api\src\repair\inspection.service.ts:571:        ctx.activeRole === 'customer' ? ctx.userId : null,
apps\api\src\repair\inspection-checklist.ts:8: * a technician signs their name to and what a customer is later shown.
apps\api\src\repair\inspection-checklist.ts:100: * reaches the job card through `JobCardService`'s scoping, which already narrows
apps\api\src\repair\inspection-checklist.ts:110: *   · `reception_staff` — §50 scopes them to "customer, vehicle, complaint,
apps\api\src\repair\inspection-checklist.ts:118: *   · `customer` — reports a complaint (`2.txt` §537) and is never a party to the
apps\api\src\repair\inspection-checklist.ts:137: * `customer` is ABSENT, and that is a decision rather than an omission. `2.txt`
apps\api\src\repair\inspection-checklist.ts:138: * §557 has inspection findings reaching the customer as a DIAGNOSTIC REPORT and
apps\api\src\repair\inspection-checklist.ts:142: * in front of a customer as though it were a finding. The customer's view
apps\api\src\repair\execution.spec.ts:73:  customer_approval_confirmed: false,
apps\api\src\repair\execution.spec.ts:122:  card: /FROM repair\.job_cards j\s+JOIN core\.customers/,
apps\api\src\repair\execution.spec.ts:211:    const { db } = fakeDb([[Q.card, [cardRow({ stage: 'awaiting_customer_approval' })]]]);
apps\api\src\repair\execution.spec.ts:217:  it('⚠️ refuses when the customer has approved nothing, naming a reachable route', async () => {
apps\api\src\repair\execution.spec.ts:225:      /customer has approved a proposal.*Customer\s+Proposals screen/s,
apps\api\src\repair\execution.spec.ts:229:  it('seeds one task per APPROVED plan task, from the plan the customer agreed to', async () => {
apps\api\src\repair\execution.spec.ts:267:    // somebody else's to fix, the other is work the customer paid for and is not
apps\api\src\repair\execution.spec.ts:271:    ).rejects.toThrow(/the customer approved it/);
apps\api\src\repair\execution.spec.ts:544:    expect(sql).toMatch(/rather than approved by the customer/);
apps\api\src\repair\execution.service.ts:97:  customerApprovalConfirmed: boolean;
apps\api\src\repair\execution.service.ts:189:   * compose, it is what the customer agreed to pay for.
apps\api\src\repair\execution.service.ts:226:      // from the plan the customer agreed to, reached through the quotation that
apps\api\src\repair\execution.service.ts:243:        // customer's decision is recorded.
apps\api\src\repair\execution.service.ts:245:          'repair work cannot start until the customer has approved a proposal, and this ' +
apps\api\src\repair\execution.service.ts:246:            'job card has none approved. Record the customer decision on the Customer ' +
apps\api\src\repair\execution.service.ts:370:          : 'say why this task is not required; the customer approved it, so its absence needs an explanation',
apps\api\src\repair\execution.service.ts:650:   *    mean work the customer paid for has not been done, and a repair completed over
apps\api\src\repair\execution.service.ts:736:              e.customer_approval_confirmed, e.parts_available_confirmed,
apps\api\src\repair\execution.service.ts:887:        customerApprovalConfirmed: row.customer_approval_confirmed,
apps\api\src\repair\execution.service.ts:951:         JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
apps\api\src\repair\execution.service.ts:959:        ctx.activeRole === 'customer' ? ctx.userId : null,
apps\api\src\repair\execution.service.ts:1087:  customer_approval_confirmed: boolean;
apps\api\src\repair\execution-rules.ts:110: *   · `reception_staff` — the customer-facing half. They record what a customer said,
apps\api\src\repair\execution-rules.ts:132: * `customer` is ABSENT: the vehicle owner receives a completion report, not the
apps\api\src\repair\execution-rules.ts:156:/** §7 — work shall not start until the customer's approval is received. */
apps\api\src\repair\execution-rules.ts:166:  { key: 'customerApprovalConfirmed', column: 'customer_approval_confirmed', label: 'Customer approval received' },
apps\api\src\repair\diagnosis.spec.ts:87:  /** The scoped job-card lookup — the only one that joins `core.customers`. */
apps\api\src\repair\diagnosis.spec.ts:88:  card: /FROM repair\.job_cards j\s+JOIN core\.customers/,
apps\api\src\repair\diagnosis.spec.ts:267:    await expect(svc.findById(ctx({ activeRole: 'customer' }), DIAGNOSIS_ID)).rejects.toThrow(
apps\api\src\repair\diagnosis.spec.ts:1000:  it('carries NO dead core.customers join in the read path', async () => {
apps\api\src\repair\diagnosis.spec.ts:1008:    expect(header?.text).not.toMatch(/JOIN core\.customers/);
apps\api\src\repair\diagnosis.service.ts:153:   * Reads the card through the SAME scoping predicates `JobCardService` uses, so
apps\api\src\repair\diagnosis.service.ts:881:         -- ⚠️ NO core.customers JOIN HERE, DELIBERATELY. Slice 3a shipped one that
apps\api\src\repair\diagnosis.service.ts:887:         -- There is no customer scope to apply, because the customer role is absent from
apps\api\src\repair\diagnosis.service.ts:999:   * The job card, scoped exactly as `JobCardService` scopes it.
apps\api\src\repair\diagnosis.service.ts:1013:         JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
apps\api\src\repair\diagnosis.service.ts:1023:        ctx.activeRole === 'customer' ? ctx.userId : null,
apps\api\src\repair\diagnosis-rules.ts:8: * reviews, and what a customer quotation is later built from.
apps\api\src\repair\diagnosis-rules.ts:121: *   · `reception_staff` — §50 scopes them to the customer-facing half. A complaint
apps\api\src\repair\diagnosis-rules.ts:122: *     is what the customer said; a diagnosis is what the workshop found.
apps\api\src\repair\diagnosis-rules.ts:123: *   · `customer` — never a party to the technical record.
apps\api\src\repair\diagnosis-rules.ts:141: * `customer` is ABSENT for the reason `2.txt` §557 gives: the vehicle owner
apps\api\src\repair\diagnosis-rules.ts:144: * front of a customer as though it were established.
apps\api\src\public\vpic.service.ts:79:      // verbatim would put "Not Applicable" in front of a customer as though it
apps\api\src\public\vin.spec.ts:114:   * screen a customer ever sees.
apps\api\src\public\public.controller.ts:28: * legal name or its customers. The directory endpoint returns what may be
apps\api\src\operations\operations.controller.spec.ts:64:    'customer',
apps\api\src\marketplace\order.service.ts:44: * transitions are legal, what a cart may contain, and what the customer is
apps\api\src\marketplace\order.service.ts:355:        'Give a tracking reference or a delivery note — whatever the customer ' +
apps\api\src\identity\registration.controller.ts:72:       * membership — which for `customer-web` is not an edge case, it is the
apps\api\src\identity\membership.service.ts:67:  'customer',
apps\api\src\identity\membership.repository.ts:38:     * TenantGuard — and for `customer-web` that viewer is the entire audience.
apps\api\src\core\vehicle.service.ts:32:  customerId: string;
apps\api\src\core\vehicle.service.ts:33:  /** Joined from core.customers — the relationship, resolved for display. */
apps\api\src\core\vehicle.service.ts:34:  customerName: string;
apps\api\src\core\vehicle.service.ts:56: * `07.txt` part 2 §50 — reception staff hold "customer, VEHICLE, complaint,
apps\api\src\core\vehicle.service.ts:58: * registering their own vehicles, which is why `customer` appears here; what a
apps\api\src\core\vehicle.service.ts:59: * customer may then attach it to is constrained in `create` below.
apps\api\src\core\vehicle.service.ts:66:  'customer',
apps\api\src\core\vehicle.service.ts:92:  'customer',
apps\api\src\core\vehicle.service.ts:98: * THE OWNER'S SCHEMA RULE IS VISIBLE HERE. A vehicle stores `customer_id`,
apps\api\src\core\vehicle.service.ts:99: * `make_id` and `model_id` — not a customer's name, not the text "Toyota" — and
apps\api\src\core\vehicle.service.ts:101: * normalised" buys: rename a customer once and every vehicle screen is correct,
apps\api\src\core\vehicle.service.ts:115:   *   · "Workshop staff shall see organizational customer records."
apps\api\src\core\vehicle.service.ts:119:   * So a viewer in the `customer` role is narrowed to vehicles belonging to the
apps\api\src\core\vehicle.service.ts:120:   * customer record linked to THEIR user account. RLS cannot make this
apps\api\src\core\vehicle.service.ts:121:   * distinction — it isolates tenants, and a customer is inside the tenant, not
apps\api\src\core\vehicle.service.ts:122:   * outside it. Without the predicate below a signed-in customer would see every
apps\api\src\core\vehicle.service.ts:125:   * `optionalCustomerId` is a display filter (the customer detail page), applied
apps\api\src\core\vehicle.service.ts:131:      const scopeToSelf = ctx.activeRole === 'customer';
apps\api\src\core\vehicle.service.ts:133:        `SELECT v.id, v.customer_id, c.display_name AS customer_name,
apps\api\src\core\vehicle.service.ts:141:           -- INNER join: customer_id is NOT NULL and ON DELETE RESTRICT, so a
apps\api\src\core\vehicle.service.ts:142:           -- vehicle without a customer cannot exist. If one ever did, dropping
apps\api\src\core\vehicle.service.ts:145:           JOIN core.customers c
apps\api\src\core\vehicle.service.ts:146:             ON c.id = v.customer_id
apps\api\src\core\vehicle.service.ts:154:            AND ($3::uuid IS NULL OR v.customer_id = $3::uuid)
apps\api\src\core\vehicle.service.ts:173:   * and a customer must be able to say what they drive.
apps\api\src\core\vehicle.service.ts:193:      const scopeToSelf = ctx.activeRole === 'customer';
apps\api\src\core\vehicle.service.ts:195:        `SELECT v.id, v.customer_id, c.display_name AS customer_name,
apps\api\src\core\vehicle.service.ts:203:           JOIN core.customers c
apps\api\src\core\vehicle.service.ts:204:             ON c.id = v.customer_id AND c.tenant_id = v.tenant_id
apps\api\src\core\vehicle.service.ts:215:        // codebase. A customer probing another customer's vehicle id gets the
apps\api\src\core\vehicle.service.ts:226:      customerId: string;
apps\api\src\core\vehicle.service.ts:253:    const customerId = requireUuid(input.customerId, 'customerId');
apps\api\src\core\vehicle.service.ts:275:      // A FOREIGN KEY CANNOT CARRY A TENANT PREDICATE. `customer_id` REFERENCES
apps\api\src\core\vehicle.service.ts:276:      // `core.customers(id)` and nothing else; RLS `WITH CHECK` validates the
apps\api\src\core\vehicle.service.ts:278:      // points at. So `tenant_id = <A>` with `customer_id = <a customer in
apps\api\src\core\vehicle.service.ts:281:      // customer. `BranchService.create` documents the identical trap.
apps\api\src\core\vehicle.service.ts:283:      // The lookup closes it precisely BECAUSE `core.customers` is under FORCE
apps\api\src\core\vehicle.service.ts:284:      // RLS: a customer in another tenant is invisible to this query, so it
apps\api\src\core\vehicle.service.ts:289:      // vehicle to a different customer's record inside their own tenant —
apps\api\src\core\vehicle.service.ts:291:      const scopeToSelf = ctx.activeRole === 'customer';
apps\api\src\core\vehicle.service.ts:293:        `SELECT 1 FROM core.customers
apps\api\src\core\vehicle.service.ts:296:        [customerId, ctx.tenantId, ctx.organizationId, scopeToSelf ? ctx.userId : null],
apps\api\src\core\vehicle.service.ts:299:        throw new NotFoundException('customer not found');
apps\api\src\core\vehicle.service.ts:331:             (tenant_id, organization_id, customer_id, registration_number, vin,
apps\api\src\core\vehicle.service.ts:340:            customerId,
apps\api\src\core\vehicle.service.ts:389:        detail: { registrationNumber: registration, customerId },
apps\api\src\core\vehicle.service.ts:394:      // customer name resolved exactly as the screen will show them — rather
apps\api\src\core\vehicle.service.ts:421:      `SELECT v.id, v.customer_id, c.display_name AS customer_name,
apps\api\src\core\vehicle.service.ts:429:         JOIN core.customers c
apps\api\src\core\vehicle.service.ts:430:           ON c.id = v.customer_id AND c.tenant_id = v.tenant_id
apps\api\src\core\vehicle.service.ts:443:    customer_id: string;
apps\api\src\core\vehicle.service.ts:444:    customer_name: string;
apps\api\src\core\vehicle.service.ts:462:    customerId: row.customer_id,
apps\api\src\core\vehicle.service.ts:463:    customerName: row.customer_name,
apps\api\src\core\validate.ts:12: * `customerId` QUERY parameter carried `ParseUUIDPipe`; the ids in a POST BODY
apps\api\src\core\validate.ts:13: * did not. A malformed `customerId`, `makeId` or `modelId` therefore reached a
apps\api\src\core\validate.ts:128: * convenience for the user, never the rule: anything calling `POST /customers`
apps\api\src\core\customer.service.ts:22:  /** The platform account, when this customer has one. Null for a walk-in. */
apps\api\src\core\customer.service.ts:24:  customerType: string;
apps\api\src\core\customer.service.ts:37: * Roles permitted to create a customer record.
apps\api\src\core\customer.service.ts:39: * `07.txt` part 2 §50 gives reception staff "customer, vehicle, complaint,
apps\api\src\core\customer.service.ts:41: * that books a customer in, so it leads this list. The owner and manager hold
apps\api\src\core\customer.service.ts:43: * customers in practice.
apps\api\src\core\customer.service.ts:46: * inspection, diagnosis, repair planning, execution, testing". Creating customer
apps\api\src\core\customer.service.ts:57: * Roles permitted to READ the organisation's customer book.
apps\api\src\core\customer.service.ts:65: *     GET /api/v1/customers -> HTTP 200
apps\api\src\core\customer.service.ts:69: * authorization did not exist: the whole customer book, with names, telephone
apps\api\src\core\customer.service.ts:83: *                          generation"; you cannot bill a customer you may not
apps\api\src\core\customer.service.ts:86: *   · `customer`         — permitted, but narrowed to their OWN record by
apps\api\src\core\customer.service.ts:93: * review, repair-plan approval, testing"). None of them needs the customer book
apps\api\src\core\customer.service.ts:94: * to do the work §50 describes. Phase 5 gives a technician the customer and
apps\api\src\core\customer.service.ts:104:  'customer',
apps\api\src\core\customer.service.ts:128:   *   · `01 (1).txt` §19 — "Workshop staff shall see organizational customer
apps\api\src\core\customer.service.ts:129:   *     records." Staff see the whole organisation's customers.
apps\api\src\core\customer.service.ts:131:   *     are authorized to manage." A viewer in the customer role is a member of
apps\api\src\core\customer.service.ts:133:   *     show them the tenant's entire customer list.
apps\api\src\core\customer.service.ts:144:      // query returns EVERY tenant's customers from an endpoint scoped to one.
apps\api\src\core\customer.service.ts:147:      const scopeToSelf = ctx.activeRole === 'customer';
apps\api\src\core\customer.service.ts:149:        `SELECT c.id, c.organization_id, c.user_id, c.customer_type, c.display_name,
apps\api\src\core\customer.service.ts:152:           FROM core.customers c
apps\api\src\core\customer.service.ts:153:           -- LEFT, not INNER: a customer with no vehicle yet is still a
apps\api\src\core\customer.service.ts:154:           -- customer, and an inner join would silently drop them from the list
apps\api\src\core\customer.service.ts:157:                  ON v.customer_id = c.id
apps\api\src\core\customer.service.ts:173:      const scopeToSelf = ctx.activeRole === 'customer';
apps\api\src\core\customer.service.ts:175:        `SELECT c.id, c.organization_id, c.user_id, c.customer_type, c.display_name,
apps\api\src\core\customer.service.ts:178:           FROM core.customers c
apps\api\src\core\customer.service.ts:180:                  ON v.customer_id = c.id
apps\api\src\core\customer.service.ts:190:        // 404 and not 403, deliberately: a customer in another tenant is
apps\api\src\core\customer.service.ts:193:        // is given to a customer asking about someone else's record, so the
apps\api\src\core\customer.service.ts:195:        throw new NotFoundException('customer not found');
apps\api\src\core\customer.service.ts:205:      customerType?: string;
apps\api\src\core\customer.service.ts:215:        `role '${ctx.activeRole}' may not create a customer`,
apps\api\src\core\customer.service.ts:221:      // A customer with no name is unusable to reception and unfindable later.
apps\api\src\core\customer.service.ts:236:    const customerType = optionalOneOf(input.customerType, CUSTOMER_TYPES, 'customerType') ?? 'individual';
apps\api\src\core\customer.service.ts:246:      // let a member of tenant A file a customer under another organisation.
apps\api\src\core\customer.service.ts:248:        `INSERT INTO core.customers
apps\api\src\core\customer.service.ts:249:           (tenant_id, organization_id, customer_type, display_name, email, phone,
apps\api\src\core\customer.service.ts:252:         RETURNING id, organization_id, user_id, customer_type, display_name, email,
apps\api\src\core\customer.service.ts:258:          customerType,
apps\api\src\core\customer.service.ts:272:      // rolled-back insert and describe a customer that does not exist.
apps\api\src\core\customer.service.ts:274:        action: 'customer.created',
apps\api\src\core\customer.service.ts:275:        resourceType: 'customer',
apps\api\src\core\customer.service.ts:282:        detail: { customerType },
apps\api\src\core\customer.service.ts:304:        `role '${ctx.activeRole}' may not read customer records`,
apps\api\src\core\customer.service.ts:313:    customer_type: string;
apps\api\src\core\customer.service.ts:326:    customerType: row.customer_type,
apps\api\src\core\core.spec.ts:2:import { CustomerService } from './customer.service';
apps\api\src\core\core.spec.ts:20: * `GET /api/v1/customers` answered **200 with the entire customer book** while
apps\api\src\core\core.spec.ts:62:const customerRow = {
apps\api\src\core\core.spec.ts:66:  customer_type: 'individual',
apps\api\src\core\core.spec.ts:79:  customer_id: 'c1',
apps\api\src\core\core.spec.ts:80:  customer_name: 'Kwame Mensah',
apps\api\src\core\core.spec.ts:100:    // Every role the navigation model puts in front of the customer book.
apps\api\src\core\core.spec.ts:108:      it(`allows ${role} to list customers`, async () => {
apps\api\src\core\core.spec.ts:109:        const { db } = fakeDb([customerRow]);
apps\api\src\core\core.spec.ts:115:    // §49 gives the technician no customer list, and §50 scopes them to
apps\api\src\core\core.spec.ts:124:        const { db, queries } = fakeDb([customerRow]);
apps\api\src\core\core.spec.ts:133:      const { db } = fakeDb([customerRow]);
apps\api\src\core\core.spec.ts:140:    it('narrows a customer-role viewer to their own record', async () => {
apps\api\src\core\core.spec.ts:141:      const { db, queries } = fakeDb([customerRow]);
apps\api\src\core\core.spec.ts:143:      await svc.list(ctx({ activeRole: 'customer', userId: 'user-9' }));
apps\api\src\core\core.spec.ts:145:      // cannot return another customer's row.
apps\api\src\core\core.spec.ts:150:      const { db, queries } = fakeDb([customerRow]);
apps\api\src\core\core.spec.ts:159:     * A customer record is ORGANIZATION-owned (`01 (1).txt` §19 — "Workshop
apps\api\src\core\core.spec.ts:160:     * staff shall see ORGANIZATIONAL customer records"), and migration 004
apps\api\src\core\core.spec.ts:164:     * other's customers. RLS does not catch it: both rows are in the same
apps\api\src\core\core.spec.ts:168:      const { db, queries } = fakeDb([customerRow]);
apps\api\src\core\core.spec.ts:176:      const { db, queries } = fakeDb([customerRow]);
apps\api\src\core\core.spec.ts:181:      // tenant's customers from an endpoint scoped to one.
apps\api\src\core\core.spec.ts:188:      const { db } = fakeDb([customerRow]);
apps\api\src\core\core.spec.ts:196:      const { db } = fakeDb([customerRow]);
apps\api\src\core\core.spec.ts:204:      const { db, queries } = fakeDb([customerRow]);
apps\api\src\core\core.spec.ts:207:      const insert = queries.find((q) => /INSERT INTO core\.customers/.test(q.text));
apps\api\src\core\core.spec.ts:222:      const { db, queries } = fakeDb([customerRow]);
apps\api\src\core\core.spec.ts:231:      const { db } = fakeDb([customerRow]);
apps\api\src\core\core.spec.ts:241:      const { db } = fakeDb([customerRow]);
apps\api\src\core\core.spec.ts:267:  it('narrows a customer-role viewer to vehicles of their own customer record', async () => {
apps\api\src\core\core.spec.ts:270:    await svc.list(ctx({ activeRole: 'customer', userId: 'user-9' }));
apps\api\src\core\core.spec.ts:271:    // Last parameter is the self-scope; without it a signed-in customer would
apps\api\src\core\core.spec.ts:276:  it('applies the self-scope even when filtering by a customer id', async () => {
apps\api\src\core\core.spec.ts:279:    await svc.list(ctx({ activeRole: 'customer', userId: 'user-9' }), 'c-other');
apps\api\src\core\core.spec.ts:280:    // The customer filter is applied ON TOP of the scope, never instead of it —
apps\api\src\core\core.spec.ts:285:  it('refuses to attach a vehicle to a customer outside the active tenant', async () => {
apps\api\src\core\core.spec.ts:286:    // The parent lookup returns nothing — which is what RLS does for a customer
apps\api\src\core\core.spec.ts:289:      /FROM core\.customers/.test(text) ? [] : [{ id: 'v1' }],
apps\api\src\core\core.spec.ts:294:        customerId: CUSTOMER_ID,
apps\api\src\core\core.spec.ts:298:    ).rejects.toThrow(/customer not found/);
apps\api\src\core\core.spec.ts:310:        customerId: CUSTOMER_ID,
apps\api\src\core\core.spec.ts:333:    ['customerId', { customerId: 'not-a-uuid', registrationNumber: 'GR 1', makeId: MAKE_ID }],
apps\api\src\core\core.spec.ts:334:    ['makeId', { customerId: CUSTOMER_ID, registrationNumber: 'GR 1', makeId: 'nope' }],
apps\api\src\core\core.spec.ts:335:    ['modelId', { customerId: CUSTOMER_ID, registrationNumber: 'GR 1', makeId: MAKE_ID, modelId: 'x' }],
apps\api\src\core\core.spec.ts:348:        customerId: CUSTOMER_ID,
apps\api\src\core\core.spec.ts:361:        customerId: CUSTOMER_ID,
apps\api\src\core\core.spec.ts:397:      svc.create(ctx(), { customerId: CUSTOMER_ID, registrationNumber: 'GR 1', makeId: MAKE_ID }),
apps\api\src\core\core.schemas.ts:10: * Request schemas for customers and vehicles.
apps\api\src\core\core.schemas.ts:31:  customerType: optionalText(40),
apps\api\src\core\core.schemas.ts:42:  customerId: uuid(),
apps\api\src\core\core.module.ts:8:import { CustomerService } from './customer.service';
apps\api\src\core\core.module.ts:12: * The `core` domain — customers and vehicles (Phase 4, Release 0.3).
apps\api\src\core\core.controllers.ts:13:import { CustomerService } from './customer.service';
apps\api\src\core\core.controllers.ts:29:@Controller('customers')
apps\api\src\core\core.controllers.ts:33:    private readonly customers: CustomerService,
apps\api\src\core\core.controllers.ts:39:    return this.customers.list(req.tenantContext);
apps\api\src\core\core.controllers.ts:47:    return this.customers.findById(req.tenantContext, id);
apps\api\src\core\core.controllers.ts:51:   * A customer's vehicles.
apps\api\src\core\core.controllers.ts:53:   * Nested under the customer because that is the relationship — and it is
apps\api\src\core\core.controllers.ts:55:   * here identically. A customer cannot read another customer's vehicles by
apps\api\src\core\core.controllers.ts:71:    return this.customers.create(req.tenantContext, body);
apps\api\src\core\core.controllers.ts:100:   * `customerId` is validated as a UUID before it reaches the service.
apps\api\src\core\core.controllers.ts:110:    @Query('customerId', new ParseUUIDPipe({ optional: true })) customerId?: string,
apps\api\src\core\core.controllers.ts:112:    return this.vehicles.list(req.tenantContext, customerId);
apps\storybook\stories\AppShell.stories.tsx:79:  args: { ...base, workspace: requireWorkspace('customer'), pathname: '/vehicles' },
apps\api\src\authz\permission-matrix.ts:86:  /** §33's customer tree has no gated entry — a customer's own invoices are
apps\api\src\authz\permission-matrix.ts:88:  customer: [],
apps\api\src\authz\permission-matrix.ts:190:  'customer',
apps\api\src\authz\permission-matrix.spec.ts:50:      'customer',
apps\api\src\authz\permission-matrix.spec.ts:104:    'customer',
apps\api\src\authz\permission-matrix.spec.ts:245:    expect(rolePrecedence('not_a_role')).toBeGreaterThan(rolePrecedence('customer'));
apps\storybook\stories\AiAssistantPanel.stories.tsx:30:  action: 'Summarise job card JC-2291 for the customer',
apps\e2e\playwright.identity.config.ts:26: *   (cd apps/customer-web && rm -rf .next && next build \
apps\e2e\playwright.config.ts:28:  { name: 'customer', port: 3000 },
apps\mobile\src\screens\stage-display.ts:20:  customerName: string;
apps\mobile\src\screens\JobCardDetailScreen.tsx:164:      <Field label="Customer" value={card.customerName} />
apps\customer-web\auth.ts:4: * This app's Auth.js instance — the customer workspace.
apps\customer-web\auth.ts:12: * (`autoworkshop-customer-web`); there is nothing per-app to configure here.
apps\customer-web\auth.ts:24:const instance: WorkspaceAuth = workspaceAuth('customer');
apps\customer-web\app\_screens\service-history-screen.tsx:5:import { customerStage } from './repair-journey';
apps\customer-web\app\_screens\service-history-screen.tsx:8: * /my-vehicles/service-history — `01 (1).txt` §33.
apps\customer-web\app\_screens\service-history-screen.tsx:10: * ── WHY THIS IS NOT JUST `completed-repairs` WITH A DIFFERENT TITLE ─────────
apps\customer-web\app\_screens\service-history-screen.tsx:12: * `completed-repairs` answers "what work has this workshop finished for me",
apps\customer-web\app\_screens\service-history-screen.tsx:21: * is buildable from the same `/job-cards` read every other customer screen uses.
apps\customer-web\app\_screens\service-history-screen.tsx:23: * ⚠️ SCOPING IS THE API'S, NOT THIS FILE'S. `JobCardService.list` narrows a
apps\customer-web\app\_screens\service-history-screen.tsx:24: * `customer` viewer to their own vehicles and RLS isolates the tenant. Grouping
apps\customer-web\app\_screens\service-history-screen.tsx:67:  const result = await apiGet<JobCardRow[]>('customer', '/job-cards');
apps\customer-web\app\_screens\service-history-screen.tsx:68:  if (!result.ok) return <ApiFailure reason={result.reason} workspaceId="customer" />;
apps\customer-web\app\_screens\service-history-screen.tsx:72:  const done = result.data.filter((c) => customerStage(c.stage).phase === 'finished');
apps\customer-web\app\_screens\report-problem-screen.tsx:14: * Report a Problem — `01 (1).txt` §33, and the customer's way into the repair
apps\customer-web\app\_screens\report-problem-screen.tsx:21: * The vehicle list comes from the customer's own garage — `GET /vehicles`
apps\customer-web\app\_screens\report-problem-screen.tsx:34:  const vehicles = await apiGet<Vehicle[]>('customer', '/vehicles');
apps\customer-web\app\_screens\report-problem-screen.tsx:48:        <ApiFailure reason={__reason} workspaceId="customer" />
apps\customer-web\app\_screens\report-problem-actions.ts:22: * The vehicle is chosen from the customer's OWN garage, and `JobCardService`
apps\customer-web\app\_screens\report-problem-actions.ts:23: * re-checks that the vehicle belongs to a customer record linked to this user —
apps\customer-web\app\_screens\report-problem-actions.ts:39:  const result = await apiPost<Created>('customer', '/job-cards', {
apps\e2e\tests\build-freshness.setup.ts:93:    // so this guard reported customer-web as serving a STALE BUILD, failed as a
apps\admin-web\app\auth\error\page.tsx:1:import { AuthErrorScreen } from '@autoworkshop/next-shell';
apps\admin-web\app\auth\error\page.tsx:4: * /auth/error — where `pages.error` sends a failed sign-in.
apps\admin-web\app\auth\error\page.tsx:7: * `pages.error` for every workspace from one shared config, so an app without
apps\admin-web\app\auth\error\page.tsx:23:  return <AuthErrorScreen error={error} />;
apps\customer-web\app\_screens\repair-journey.ts:12: * So this maps the workshop's vocabulary onto the four things a customer
apps\customer-web\app\_screens\repair-journey.ts:26: * the card out of every list and the customer would be told they have no
apps\customer-web\app\_screens\repair-journey.ts:32:/** The four buckets the customer's own screens divide their repairs into. */
apps\customer-web\app\_screens\repair-journey.ts:44:  /** What the customer reads. Plain language, no workshop jargon. */
apps\customer-web\app\_screens\repair-journey.ts:46:  /** One sentence of what is actually happening, in the customer's terms. */
apps\customer-web\app\_screens\repair-journey.ts:54: * The 20 lifecycle stages, in the customer's words.
apps\customer-web\app\_screens\repair-journey.ts:56: * ⚠️ `awaiting_customer_approval`, `awaiting_deposit` and
apps\customer-web\app\_screens\repair-journey.ts:63: * customer's problem to solve.
apps\customer-web\app\_screens\repair-journey.ts:114:  awaiting_customer_approval: {
apps\customer-web\app\_screens\repair-journey.ts:127:    // NOT `needs_you`: the workshop is chasing this, not the customer.
apps\customer-web\app\_screens\repair-journey.ts:193: * a customer's repair list — they would be told they have no vehicles in for
apps\customer-web\app\_screens\repair-journey.ts:199:export function customerStage(stage: string): CustomerStage {
apps\customer-web\app\_screens\repair-journey.ts:210:/** Is the customer the thing holding this job up? */
apps\customer-web\app\_screens\repair-journey.ts:212:  return customerStage(stage).phase === 'needs_you';
apps\customer-web\app\_screens\repair-journey.spec.ts:4:import { CUSTOMER_STAGES, customerStage, needsCustomer } from './repair-journey';
apps\customer-web\app\_screens\repair-journey.spec.ts:9: * The customer's four screens are built by FILTERING on `JourneyPhase`. A stage
apps\customer-web\app\_screens\repair-journey.spec.ts:14: * a customer here", and it is invisible in exactly the case where somebody is
apps\customer-web\app\_screens\repair-journey.spec.ts:26:describe('customer stage vocabulary', () => {
apps\customer-web\app\_screens\repair-journey.spec.ts:50:  it.each(known)('%s has customer-facing wording', (stage) => {
apps\customer-web\app\_screens\repair-journey.spec.ts:53:      `stage "${stage}" exists in the lifecycle but the customer screens cannot describe it`,
apps\customer-web\app\_screens\repair-journey.spec.ts:67:   * customer. Getting this set wrong is the expensive mistake in the file: too
apps\customer-web\app\_screens\repair-journey.spec.ts:71:  it('asks the customer to act on exactly the stages that need them', () => {
apps\customer-web\app\_screens\repair-journey.spec.ts:75:        'awaiting_customer_approval',
apps\customer-web\app\_screens\repair-journey.spec.ts:83:  it('does NOT ask the customer to chase parts', () => {
apps\customer-web\app\_screens\repair-journey.spec.ts:85:    // deliberately is NOT the customer's problem. Borrowing that helper wholesale
apps\customer-web\app\_screens\repair-journey.spec.ts:88:    expect(customerStage('awaiting_parts').phase).toBe('in_progress');
apps\customer-web\app\_screens\repair-journey.spec.ts:94:    const unknown = customerStage('teleportation_pending');
apps\customer-web\app\_screens\repair-journey.spec.ts:97:    // And it must never claim the customer has something to do — that would
apps\customer-web\app\_screens\repair-journey-screen.tsx:6:import { customerStage, needsCustomer, type JourneyPhase } from './repair-journey';
apps\customer-web\app\_screens\repair-journey-screen.tsx:9: * The customer's repair journey — `01 (1).txt` §33's `service-and-repairs` group.
apps\customer-web\app\_screens\repair-journey-screen.tsx:13: * WHICH of the customer's cards they show and how the empty state reads. Four
apps\customer-web\app\_screens\repair-journey-screen.tsx:16: *   /service-and-repairs/service-requests    every request, newest first
apps\customer-web\app\_screens\repair-journey-screen.tsx:17: *   /service-and-repairs/repair-tracking     the ones still open
apps\customer-web\app\_screens\repair-journey-screen.tsx:18: *   /service-and-repairs/repair-proposals    the ones waiting on the customer
apps\customer-web\app\_screens\repair-journey-screen.tsx:19: *   /service-and-repairs/completed-repairs   the ones that are done
apps\customer-web\app\_screens\repair-journey-screen.tsx:21: * ⚠️ THE FILTER HERE IS PRESENTATION, NOT ACCESS CONTROL. `JobCardService.list`
apps\customer-web\app\_screens\repair-journey-screen.tsx:22: * narrows a `customer` viewer to cards raised against their OWN vehicles — one
apps\customer-web\app\_screens\repair-journey-screen.tsx:103:  return customerStage(card.stage).phase;
apps\customer-web\app\_screens\repair-journey-screen.tsx:130:  const result = await apiGet<JobCardRow[]>('customer', '/job-cards');
apps\customer-web\app\_screens\repair-journey-screen.tsx:136:    return <ApiFailure reason={result.reason} workspaceId="customer" />;
apps\customer-web\app\_screens\repair-journey-screen.tsx:145:  // Newest first. The API orders for the workshop's purposes; a customer with
apps\customer-web\app\_screens\repair-journey-screen.tsx:172:          <Link href="/service-and-repairs/repair-proposals">See what is needed</Link>
apps\customer-web\app\_screens\repair-journey-screen.tsx:186:  const stage = customerStage(card.stage);
apps\customer-web\app\_screens\repair-journey-screen.tsx:192:        // A card the customer must act on is outlined in the attention colour.
apps\customer-web\app\_screens\repair-journey-screen.tsx:282:            that route is written for a staff member CAPTURING the customer's
apps\customer-web\app\_screens\repair-journey-screen.tsx:283:            answer — `decidedByName` is the customer while the session is the
apps\customer-web\app\_screens\repair-journey-screen.tsx:296:/** The verb for the one thing this customer has to do. */
apps\customer-web\app\_screens\repair-journey-screen.tsx:299:    case 'awaiting_customer_approval':
apps\customer-web\app\_screens\add-vehicle-actions.ts:8: * The customer's own "add a vehicle" write — `2.txt` §537.
apps\customer-web\app\_screens\add-vehicle-actions.ts:10: * ⚠️ THE `customerId` IS NOT A CHOICE, AND THAT IS THE POINT. On the workshop
apps\customer-web\app\_screens\add-vehicle-actions.ts:12: * resolves the viewer's OWN customer record and sends that id, because a
apps\customer-web\app\_screens\add-vehicle-actions.ts:13: * customer may only register vehicles to themselves.
apps\customer-web\app\_screens\add-vehicle-actions.ts:17: * viewer whose role is `customer` the parent lookup carries
apps\customer-web\app\_screens\add-vehicle-actions.ts:18: * `user_id = ctx.userId`, so an id belonging to anyone else returns "customer
apps\customer-web\app\_screens\add-vehicle-actions.ts:41:  const result = await apiPost<Created>('customer', '/vehicles', {
apps\customer-web\app\_screens\add-vehicle-actions.ts:42:    customerId: text(formData, 'customerId'),
apps\customer-web\app\_screens\add-vehicle-actions.ts:67:              // What this means HERE: the viewer has no customer record to own
apps\customer-web\app\_screens\add-vehicle-actions.ts:69:              ? 'Your account is not yet linked to a customer profile, so there is nobody to register this vehicle to. Contact your workshop.'
apps\customer-web\app\_screens\add-vehicle-actions.ts:74:  revalidatePath('/my-vehicles/garage');
apps\customer-web\app\_screens\parts-orders-screen.tsx:11: * other customer screen reads tenant-owned data through `TenantGuard`; these
apps\customer-web\app\_screens\parts-orders-screen.tsx:89:  const result = await apiGet<OrderRow[]>('customer', '/marketplace/orders');
apps\customer-web\app\_screens\parts-orders-screen.tsx:92:    return <ApiFailure reason={result.reason} workspaceId="customer" />;
apps\customer-web\app\_screens\parts-order-actions.ts:32:  const result = await apiPost<Placed>('customer', '/marketplace/orders', {
apps\customer-web\app\_screens\parts-order-actions.ts:76:    'customer',
apps\customer-web\app\_screens\parts-order-actions.ts:108:    'customer',
apps\customer-web\app\_screens\parts-order-actions.ts:154:    'customer',
apps\customer-web\app\sign-out-action.ts:6: * Sign out of the customer workspace — T-0005 finding 5.
apps\customer-web\app\sign-out-action.ts:18:  return performSignOut('customer');
apps\customer-web\app\auth\error\page.tsx:1:import { AuthErrorScreen } from '@autoworkshop/next-shell';
apps\customer-web\app\auth\error\page.tsx:4: * /auth/error — where `pages.error` sends a failed sign-in.
apps\customer-web\app\auth\error\page.tsx:7: * `pages.error` for every workspace from one shared config, so an app without
apps\customer-web\app\auth\error\page.tsx:23:  return <AuthErrorScreen error={error} />;
apps\customer-web\app\api\auth\register\route.ts:27:  const clientId = clientIdForWorkspace('customer');
apps\customer-web\app\(app)\[...slug]\page.tsx:13:  return renderModulePage('customer', slug, await viewerGrants('customer'));
apps\customer-web\app\_screens\garage-screen.tsx:13: * `customer` to vehicles whose customer record carries THEIR `user_id` — and
apps\customer-web\app\_screens\garage-screen.tsx:17: * RLS CANNOT DO THIS. A customer sits INSIDE the tenant, so the tenant policy is
apps\customer-web\app\_screens\garage-screen.tsx:19: * signed-in customer would see the workshop's entire vehicle register. The
apps\customer-web\app\_screens\garage-screen.tsx:25: * there is no customer-only endpoint that could drift from the staff one.
apps\customer-web\app\_screens\garage-screen.tsx:64:  const result = await apiGet<Vehicle[]>('customer', '/vehicles');
apps\customer-web\app\_screens\garage-screen.tsx:67:    return <ApiFailure reason={result.reason} workspaceId="customer" />;
apps\customer-web\app\(app)\vehicle-lookup\page.tsx:84:  const result = await apiGet<FullVin>('customer', `/vin/${encodeURIComponent(vin)}`);
apps\customer-web\app\_screens\dashboard-screen.tsx:7: * The customer's dashboard — `01 (1).txt` §18, the default landing page.
apps\customer-web\app\_screens\dashboard-screen.tsx:80:  const vehicles = await apiGet<Vehicle[]>('customer', '/vehicles');
apps\customer-web\app\_screens\dashboard-screen.tsx:87:        <ApiFailure reason={__reason} workspaceId="customer" />
apps\customer-web\app\_screens\dashboard-screen.tsx:98:   * because one of two panels errored tells the customer nothing about the
apps\customer-web\app\_screens\dashboard-screen.tsx:102:  const orders = await apiGet<OrderRow[]>('customer', '/marketplace/orders');
apps\customer-web\app\_screens\dashboard-screen.tsx:148:          <Link href="/my-vehicles/garage">Open your garage</Link>
apps\customer-web\app\_screens\dashboard-screen.tsx:182:                {/* Stated, not silently ignored: a customer seeing "in date"
apps\customer-web\app\_screens\dashboard-screen.tsx:248:            customer who is shown an empty "recent services" panel reasonably
apps\customer-web\app\page.tsx:21: * Branching on the viewer would drop a signed-in customer onto the public
apps\customer-web\app\page.tsx:42:  if (await viewerHasSession('customer')) {
apps\customer-web\app\page.tsx:116:      // customer-web's own client-side store; the shared landing must not know
apps\customer-web\app\(app)\service-and-repairs\service-requests\page.tsx:5: * /service-and-repairs/service-requests — `01 (1).txt` §33, the customer workspace.
apps\customer-web\app\(app)\service-and-repairs\service-requests\page.tsx:11: * reasoning as `/my-vehicles/garage`, where Codex corrected the opposite claim.
apps\customer-web\app\(app)\service-and-repairs\service-requests\page.tsx:13: * NOT the control either way. `JobCardService.list` narrows a `customer` viewer
apps\customer-web\app\(app)\service-and-repairs\service-requests\page.tsx:20:  await requireNavRoute('customer', '/service-and-repairs/service-requests');
apps\customer-web\app\(app)\service-and-repairs\report-a-problem\page.tsx:5: * /service-and-repairs/report-a-problem — `01 (1).txt` §33.
apps\customer-web\app\(app)\service-and-repairs\report-a-problem\page.tsx:7: * The customer's entry into the repair lifecycle: submitting this opens a job
apps\customer-web\app\(app)\service-and-repairs\report-a-problem\page.tsx:18:  await requireNavRoute('customer', '/service-and-repairs/report-a-problem');
apps\customer-web\app\(app)\service-and-repairs\repair-tracking\page.tsx:5: * /service-and-repairs/repair-tracking — `01 (1).txt` §33, the customer workspace.
apps\customer-web\app\(app)\service-and-repairs\repair-tracking\page.tsx:11: * reasoning as `/my-vehicles/garage`, where Codex corrected the opposite claim.
apps\customer-web\app\(app)\service-and-repairs\repair-tracking\page.tsx:13: * NOT the control either way. `JobCardService.list` narrows a `customer` viewer
apps\customer-web\app\(app)\service-and-repairs\repair-tracking\page.tsx:20:  await requireNavRoute('customer', '/service-and-repairs/repair-tracking');
apps\customer-web\app\(app)\service-and-repairs\repair-proposals\page.tsx:5: * /service-and-repairs/repair-proposals — `01 (1).txt` §33, the customer workspace.
apps\customer-web\app\(app)\service-and-repairs\repair-proposals\page.tsx:11: * reasoning as `/my-vehicles/garage`, where Codex corrected the opposite claim.
apps\customer-web\app\(app)\service-and-repairs\repair-proposals\page.tsx:13: * NOT the control either way. `JobCardService.list` narrows a `customer` viewer
apps\customer-web\app\(app)\service-and-repairs\repair-proposals\page.tsx:20:  await requireNavRoute('customer', '/service-and-repairs/repair-proposals');
apps\customer-web\app\_screens\add-vehicle-screen.tsx:20: * reception choose a customer. A customer may only register vehicles to
apps\customer-web\app\_screens\add-vehicle-screen.tsx:21: * THEMSELVES, so the owner is resolved rather than chosen: `GET /customers`
apps\customer-web\app\_screens\add-vehicle-screen.tsx:22: * already returns exactly one row for a `customer` viewer — their own — because
apps\customer-web\app\_screens\add-vehicle-screen.tsx:27: * `user_id = ctx.userId` for this role, so a tampered value returns "customer
apps\customer-web\app\_screens\add-vehicle-screen.tsx:44:    apiGet<MyCustomer[]>('customer', '/customers'),
apps\customer-web\app\_screens\add-vehicle-screen.tsx:45:    apiGet<MakeOption[]>('customer', '/vehicle-makes'),
apps\customer-web\app\_screens\add-vehicle-screen.tsx:61:        <ApiFailure reason={__reason} workspaceId="customer" />
apps\customer-web\app\_screens\add-vehicle-screen.tsx:66:  // A customer with no customer record cannot own a vehicle — `customer_id` is
apps\customer-web\app\_screens\add-vehicle-screen.tsx:76:          title="Your account is not linked to a customer profile yet"
apps\customer-web\app\_screens\add-vehicle-screen.tsx:89:        successHref={{ href: '/my-vehicles/garage', label: 'View your garage' }}
apps\customer-web\app\_screens\add-vehicle-screen.tsx:93:        <input type="hidden" name="customerId" value={mine.id} />
apps\customer-web\app\not-found.tsx:4: * 404 for the customer workspace.
apps\customer-web\app\(app)\service-and-repairs\completed-repairs\page.tsx:5: * /service-and-repairs/completed-repairs — `01 (1).txt` §33, the customer workspace.
apps\customer-web\app\(app)\service-and-repairs\completed-repairs\page.tsx:11: * reasoning as `/my-vehicles/garage`, where Codex corrected the opposite claim.
apps\customer-web\app\(app)\service-and-repairs\completed-repairs\page.tsx:13: * NOT the control either way. `JobCardService.list` narrows a `customer` viewer
apps\customer-web\app\(app)\service-and-repairs\completed-repairs\page.tsx:20:  await requireNavRoute('customer', '/service-and-repairs/completed-repairs');
apps\customer-web\app\(app)\parts-and-warranty\parts-orders\page.tsx:10: * §33 predates the public parts marketplace, so it has no item for a customer's
apps\customer-web\app\(app)\parts-and-warranty\parts-orders\page.tsx:18: * navigation. The customer tree has no permission on this item, so it is
apps\customer-web\app\(app)\parts-and-warranty\parts-orders\page.tsx:33:  await requireNavRoute('customer', '/parts-and-warranty/parts-orders');
apps\customer-web\app\(app)\my-vehicles\service-history\page.tsx:2:import { ServiceHistoryScreen } from '../../../_screens/service-history-screen';
apps\customer-web\app\(app)\my-vehicles\service-history\page.tsx:5: * /my-vehicles/service-history — `01 (1).txt` §33, the customer workspace.
apps\customer-web\app\(app)\my-vehicles\service-history\page.tsx:8: * not authentication — see `/my-vehicles/garage` for the full reasoning. The
apps\customer-web\app\(app)\my-vehicles\service-history\page.tsx:9: * real scoping is `JobCardService.list`'s customer predicate plus RLS.
apps\customer-web\app\(app)\my-vehicles\service-history\page.tsx:15:  await requireNavRoute('customer', '/my-vehicles/service-history');
apps\customer-web\app\(app)\my-vehicles\garage\page.tsx:5: * /my-vehicles/garage — `01 (1).txt` §33, the customer workspace.
apps\customer-web\app\(app)\my-vehicles\garage\page.tsx:10: * The §33 customer tree has no per-role variants and no permission on this item,
apps\customer-web\app\(app)\my-vehicles\garage\page.tsx:24: * NOT the control either way. `VehicleService` narrows a `customer` viewer to
apps\customer-web\app\(app)\my-vehicles\garage\page.tsx:32:  await requireNavRoute('customer', '/my-vehicles/garage');
apps\customer-web\app\(app)\my-vehicles\add-vehicle\page.tsx:5: * /my-vehicles/add-vehicle — `01 (1).txt` §33.
apps\customer-web\app\(app)\my-vehicles\add-vehicle\page.tsx:7: * The gate checks the viewer's visible navigation, which for the customer
apps\customer-web\app\(app)\my-vehicles\add-vehicle\page.tsx:18:  await requireNavRoute('customer', '/my-vehicles/add-vehicle');
apps\customer-web\app\(app)\home\dashboard\page.tsx:5: * /home/dashboard — `01 (1).txt` §18, the customer's landing page.
apps\customer-web\app\(app)\home\dashboard\page.tsx:8: * "not built yet" placeholder — so the FIRST screen a customer saw after signing
apps\customer-web\app\(app)\home\dashboard\page.tsx:20:  await requireNavRoute('customer', '/home/dashboard');
apps\customer-web\app\(app)\layout.tsx:39:    currentViewer('customer'),
apps\customer-web\app\(app)\layout.tsx:40:    viewerHasSession('customer'),
apps\customer-web\app\(app)\layout.tsx:44:    // every customer page renders inside.
apps\customer-web\app\(app)\layout.tsx:45:    registrationStatus('customer'),
apps\customer-web\app\(app)\layout.tsx:50:          workspaceId="customer"
apps\customer-web\app\(app)\layout.tsx:52:          // signed-in customer straight back to the dashboard they were trying
apps\customer-web\app\(app)\layout.tsx:63:          // signed-out labels to every customer, permanently, and the shell
apps\customer-web\app\(app)\layout.tsx:71:          // ABSENT rather than filled: a customer has no organisation, and
apps\insurance-web\app\auth\error\page.tsx:1:import { AuthErrorScreen } from '@autoworkshop/next-shell';
apps\insurance-web\app\auth\error\page.tsx:4: * /auth/error — where `pages.error` sends a failed sign-in.
apps\insurance-web\app\auth\error\page.tsx:7: * `pages.error` for every workspace from one shared config, so an app without
apps\insurance-web\app\auth\error\page.tsx:23:  return <AuthErrorScreen error={error} />;
apps\customer-web\app\(app)\marketplace\page.tsx:14: * customer arrives at a shop window instead of their own vehicles and orders.
apps\customer-web\app\(app)\marketplace\page.tsx:15: * But the parts marketplace is not marketing: it is the STORE, and a customer
apps\customer-web\app\(app)\marketplace\page.tsx:24: * ALL: a signed-in customer could reach the store and then had no wordmark, no
apps\customer-web\app\(app)\marketplace\page.tsx:119:      // customer-web's own client-side store; the shared landing must not know

codex
The first read command was blocked by the local policy because it combined several operations. I have the changed-file list, and I’m splitting the repository reads into simpler calls so the review stays read-only.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content README.md -TotalCount 320' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git show --stat --oneline HEAD' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content docs/IMPLEMENTATION_LOG.md -TotalCount 320' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 1205ms:
18e1ee4 feat(customer,auth,landing): the customer repair journey, an honest Keycloak error, Solar's card scale
 .github/workflows/keep-warm.yml                    | 140 +++++++++
 apps/admin-web/app/auth/error/page.tsx             |  24 ++
 .../app/(app)/my-vehicles/service-history/page.tsx |  17 ++
 .../service-and-repairs/completed-repairs/page.tsx |  22 ++
 .../service-and-repairs/repair-proposals/page.tsx  |  22 ++
 .../service-and-repairs/repair-tracking/page.tsx   |  22 ++
 .../service-and-repairs/service-requests/page.tsx  |  22 ++
 .../app/_screens/repair-journey-screen.tsx         | 326 +++++++++++++++++++++
 .../app/_screens/repair-journey.spec.ts            | 101 +++++++
 apps/customer-web/app/_screens/repair-journey.ts   | 213 ++++++++++++++
 .../app/_screens/service-history-screen.tsx        | 196 +++++++++++++
 apps/customer-web/app/auth/error/page.tsx          |  24 ++
 apps/customer-web/package.json                     |   5 +-
 apps/fleet-web/app/auth/error/page.tsx             |  24 ++
 apps/insurance-web/app/auth/error/page.tsx         |  24 ++
 apps/supplier-web/app/auth/error/page.tsx          |  24 ++
 apps/towing-web/app/auth/error/page.tsx            |  24 ++
 apps/workshop-web/app/auth/error/page.tsx          |  24 ++
 packages/auth/src/auth-error-route.test.ts         |  61 ++++
 packages/auth/src/workspace-auth.ts                |  27 +-
 packages/auth/vitest.config.ts                     |   9 +-
 packages/design-tokens/src/primitive.ts            |  18 +-
 .../marketplace-ui/src/marketplace-landing.tsx     |  60 +++-
 packages/next-shell/src/AuthErrorScreen.tsx        | 204 +++++++++++++
 packages/next-shell/src/index.ts                   |   8 +
 packages/next-shell/vitest.config.ts               |   9 +-
 packages/ui/vitest.config.ts                       |   9 +-
 pnpm-lock.yaml                                     |   3 +
 scripts/audit-menu-coverage.mjs                    |  75 +++--
 29 files changed, 1695 insertions(+), 42 deletions(-)

 succeeded in 1279ms:
# AutoWorkshop AI

**The Complete AI-Powered Automotive Service, Repair and Workshop Operating System.**

Live target: [`autoworkshop.aiappinvent.com`](https://autoworkshop.aiappinvent.com) Â· Status: **Phase 1 â€” Release 0.1 (foundation)**

One platform connecting vehicle owners, workshops, technicians, auto electricians, electronics
specialists, body repairers, spray painters, welders, vulcanizers, upholsterers, suppliers, fleet
operators, insurers and towing providers.

The promise, end to end: **report the problem â†’ diagnose the fault â†’ simulate the solution â†’ approve the
work â†’ verify the parts â†’ track the repair** â€” every step authenticated, authorised, audited and recoverable.

---

## Zero-cost policy (hard)

Per `autoworkshop 05.txt` Â§1, Â§2, Â§6, Â§8 and ADR-012, this project uses **only zero-cost and open-source
tools â€” including in production**. No paid tool, subscription or mandatory paid service may be introduced.
A task is not complete if it added a paid dependency.

Where a capability normally costs money, it is built as a **disabled adapter behind an interface**:

- **Bring-your-own-connection (D7)** â€” each tenant connects their *own* OBD device, payment merchant
  account, SMTP server or model API key if they want one. The application works fully with none configured.
- **Upgrade-ready (D8)** â€” everything is self-hosted FOSS with full infrastructure-as-code, so moving to
  commercial infrastructure later (only if the product goes commercial) is a *hosting* change, not a rewrite.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router) Â· React Â· TypeScript Â· Tailwind Â· shadcn/ui Â· Radix |
| Backend | NestJS Â· TypeScript â€” modular monolith, 13 bounded domains |
| Database | PostgreSQL + `pgvector` â€” row-level security (`FORCE`) on every tenant table |
| Cache / jobs | Redis + BullMQ Â· **NATS** for domain events |
| Identity | Keycloak â€” own realm, OAuth 2.1 + PKCE |
| Storage | MinIO (S3-compatible) |
| Realtime | WebRTC + self-hosted `coturn` |
| AI | **Google ADK** (Python) â†’ **MCP Gateway** â†’ 19 MCP servers â†’ NestJS domain services |
| LLM | Local Ollama (`llama3.2`, `llava`) via ADK `LiteLlm` |
| Design | **Penpot** Â· Storybook Â· Playwright (incl. visual regression) Â· axe-core Â· Vitest |
| Ops | Docker Â· Prometheus Â· Grafana Â· Loki |

**The AI never touches the database.** Agents hold no database, storage, payment or admin credentials;
they call the MCP Gateway, which calls authoritative NestJS domain services, which enforce every business
rule. Enforced in infrastructure and asserted by negative tests in CI â€” not by policy text.

---

## Repository layout

```
apps/        customer-web workshop-web supplier-web fleet-web insurance-web towing-web admin-web
             mobile (React Native/Expo, Android first) Â· api (NestJS) Â· mcp-gateway Â· mcp-servers
             agent-host (Python + ADK) Â· media-worker Â· storybook
packages/    design-tokens ui navigation forms tables charts workflow media offline-sync i18n
             ai-assistant mcp-ui accessibility auth api-client domain-contracts validation events â€¦
python-packages/  adk-core adk-agents mcp-client agent-evals
domains/     13 bounded contexts â€” pure business logic
infrastructure/   docker compose keycloak migrations policies
tests/       playwright visual a11y tenant-isolation offline mcp
docs/        00-project â€¦ 14-user-guides
```

## Branches & commits

`master` (production-ready) Â· `develop` (integration) Â· short-lived `feature/*` branches.
Conventional commits: `feat(scope):` Â· `fix(scope):` Â· `chore(scope):` Â· `docs(scope):`.

## Documentation

`ARCHITECTURE.md` Â· `SECURITY.md` Â· `ROADMAP.md` Â· `CLAUDE.md` Â· `docs/`
Approved plan: `Documents\autoworkshop app\_plan\COMBINED_PLAN_v2.md`
(passed Codex `PASS WITH CORRECTIONS` â†’ Supervisor `PASS WITH CONDITIONS`, all applied).

**Reference implementation: [`solar-pv-designer-lite`](https://github.com/marc667us/solar-pv-designer-lite)** â€”
patterns, CI shape and operational lessons are taken from it. The two applications are deliberately
**not** entangled: separate repo, database, Keycloak realm, deployment, secrets and CI. If Solar were
deleted tomorrow, this must still build, deploy and run.

 exited 1 in 1752ms:
Get-Content : Cannot find path 'C:\Users\USER\Documents\autoworkshop-ai\docs\IMPLEMENTATION_LOG.md' because it does 
not exist.
At line:2 char:1
+ Get-Content docs/IMPLEMENTATION_LOG.md -TotalCount 320
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : ObjectNotFound: (C:\Users\USER\D...ENTATION_LOG.md:String) [Get-Content], ItemNotFoundEx 
   ception
    + FullyQualifiedErrorId : PathNotFound,Microsoft.PowerShell.Commands.GetContentCommand
 

2026-08-04T12:49:13.908993Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 1.8 seconds
Output:
Get-Content : Cannot find path 'C:\Users\USER\Documents\autoworkshop-ai\docs\IMPLEMENTATION_LOG.md' because it does 
not exist.
At line:2 char:1
+ Get-Content docs/IMPLEMENTATION_LOG.md -TotalCount 320
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : ObjectNotFound: (C:\Users\USER\D...ENTATION_LOG.md:String) [Get-Content], ItemNotFoundEx 
   ception
    + FullyQualifiedErrorId : PathNotFound,Microsoft.PowerShell.Commands.GetContentCommand
 

codex
`docs/IMPLEMENTATION_LOG.md` is not present, so the review source of truth is README plus the existing code/contracts. I’m checking the new implementation against the API contracts, navigation, and auth wiring now.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content apps/customer-web/app/_screens/service-history-screen.tsx -TotalCount 260' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content packages/auth/src/workspace-auth.ts -TotalCount 260' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content apps/customer-web/app/_screens/repair-journey.ts -TotalCount 260' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content packages/next-shell/src/AuthErrorScreen.tsx -TotalCount 280' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 1592ms:
import { Suspense } from 'react';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { EmptyState, LoadingState, PageHeader } from '@autoworkshop/ui';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import { customerStage } from './repair-journey';

/**
 * /my-vehicles/service-history â€” `01 (1).txt` Â§33.
 *
 * â”€â”€ WHY THIS IS NOT JUST `completed-repairs` WITH A DIFFERENT TITLE â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 * `completed-repairs` answers "what work has this workshop finished for me",
 * newest first, across everything. This answers a different question â€” "what has
 * been done to THIS car" â€” and the grouping is the whole point: someone selling
 * a vehicle, or deciding whether a fault has recurred, is reading one car's
 * record, not a chronological feed of all of them.
 *
 * `CURRENT_PHASE.md` recorded service history as blocked on "needs completed
 * jobs". That was true when nothing could reach `completed`; the lifecycle and
 * the stage transitions have both shipped since, so the blocker is gone and this
 * is buildable from the same `/job-cards` read every other customer screen uses.
 *
 * âš ï¸ SCOPING IS THE API'S, NOT THIS FILE'S. `JobCardService.list` narrows a
 * `customer` viewer to their own vehicles and RLS isolates the tenant. Grouping
 * here is presentation (CLAUDE.md Â§8).
 */

export const dynamic = 'force-dynamic';

/** Field names taken from `JobCard` in the API â€” never guessed. */
interface JobCardRow {
  id: string;
  jobNumber: string;
  vehicleId: string;
  registrationNumber: string;
  vehicleDescription: string;
  complaint: string;
  stage: string;
  openedAt: string;
  closedAt: string | null;
  mileageAtIntake: number | null;
}

function when(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function ServiceHistoryScreen() {
  return (
    <>
      <PageHeader
        title="Service History"
        description="Everything this workshop has done to each of your vehicles, most recent first. Useful when a fault comes back â€” or when you sell the car."
      />
      <Suspense fallback={<LoadingState label="Loading your service historyâ€¦" />}>
        <History />
      </Suspense>
    </>
  );
}

async function History() {
  const result = await apiGet<JobCardRow[]>('customer', '/job-cards');
  if (!result.ok) return <ApiFailure reason={result.reason} workspaceId="customer" />;

  // Finished work only. An in-flight repair belongs on Repair Tracking; putting
  // it in a HISTORY would let someone quote an unfinished job as work done.
  const done = result.data.filter((c) => customerStage(c.stage).phase === 'finished');

  if (done.length === 0) {
    return (
      <EmptyState
        title="No completed work yet"
        description="Once this workshop finishes a repair on one of your vehicles, it is recorded here permanently."
      />
    );
  }

  // Group by vehicle, keeping the vehicle whose most recent work is newest at
  // the top â€” a Map preserves insertion order, so the sort has to happen first.
  const ordered = [...done].sort(
    (a, b) =>
      new Date(b.closedAt ?? b.openedAt).getTime() - new Date(a.closedAt ?? a.openedAt).getTime(),
  );

  const byVehicle = new Map<string, JobCardRow[]>();
  for (const card of ordered) {
    const list = byVehicle.get(card.vehicleId);
    if (list) list.push(card);
    else byVehicle.set(card.vehicleId, [card]);
  }

  return (
    <div style={{ display: 'grid', gap: primitive.space[8] }}>
      {[...byVehicle.values()].map((cards) => {
        const first = cards[0];
        // Cannot happen â€” a Map entry only exists because a card was pushed into
        // it â€” but `noUncheckedIndexedAccess` is right to insist, and returning
        // null degrades to one missing section rather than a crashed page.
        if (!first) return null;
        return (
          <section key={first.vehicleId}>
            <h2
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: primitive.space[3],
                alignItems: 'baseline',
                margin: `0 0 ${primitive.space[3]}`,
                fontSize: primitive.fontSize.lg,
              }}
            >
              <span
                style={{
                  // Â§2845 â€” read out character by character.
                  fontFamily: primitive.fontFamily.mono,
                  letterSpacing: '0.04em',
                }}
              >
                {first.registrationNumber}
              </span>
              <span
                style={{
                  color: themeVar.textSecondary,
                  fontSize: primitive.fontSize.sm,
                  fontWeight: 400,
                }}
              >
                {first.vehicleDescription} Â· {cards.length}{' '}
                {cards.length === 1 ? 'completed repair' : 'completed repairs'}
              </span>
            </h2>

            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: primitive.space[3] }}>
              {cards.map((c) => (
                <li
                  key={c.id}
                  style={{
                    border: `1px solid ${themeVar.borderDefault}`,
                    borderRadius: primitive.radius.lg,
                    padding: primitive.space[4],
                    background: themeVar.surfaceRaised,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: primitive.space[3],
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                    }}
                  >
                    <strong>{when(c.closedAt ?? c.openedAt)}</strong>
                    <span
                      style={{
                        fontFamily: primitive.fontFamily.mono,
                        fontSize: primitive.fontSize.sm,
                        color: themeVar.textSecondary,
                      }}
                    >
                      {c.jobNumber}
                    </span>
                  </div>
                  <p style={{ margin: `${primitive.space[2]} 0 0`, fontSize: primitive.fontSize.sm }}>
                    {c.complaint}
                  </p>
                  {/*
                    Mileage AT INTAKE, and labelled as such. An unlabelled number
                    beside a service record reads as the current odometer, which
                    is the sort of thing that ends up in a sale listing.
                  */}
                  {c.mileageAtIntake !== null ? (
                    <p
                      style={{
                        margin: `${primitive.space[2]} 0 0`,
                        color: themeVar.textSecondary,
                        fontSize: primitive.fontSize.xs,
                      }}
                    >
                      {c.mileageAtIntake.toLocaleString('en-GB')} km when the vehicle came in
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

 succeeded in 1626ms:
/**
 * What a CUSTOMER is told about where their repair has got to.
 *
 * â”€â”€ WHY THIS FILE EXISTS SEPARATELY FROM `job-card-stages.ts` â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 * The lifecycle has 20 stages (`1.txt` Â§322-Â§360) and they are named for the
 * WORKSHOP: `diagnosis_in_progress`, `specialist_consultation`,
 * `awaiting_deposit`. Rendering those to a vehicle owner would be honest and
 * useless â€” nobody outside a garage knows whether `solution_preparation` means
 * their car is being fixed or has not been looked at yet.
 *
 * So this maps the workshop's vocabulary onto the four things a customer
 * actually wants to know:
 *
 *     where is it Â· is anyone waiting on ME Â· when do I get it back Â· is it done
 *
 * ðŸ”´ THIS IS PRESENTATION, NOT AUTHORIZATION, AND NOT A SECOND LIFECYCLE.
 * It decides wording and which list a card appears in. It grants nothing, it
 * moves nothing, and it must never become the place a stage rule is expressed â€”
 * `job-card-stages.ts` on the API side is the authority and re-derives every
 * judgement server-side (CLAUDE.md Â§8: hidden is not secure).
 *
 * âš ï¸ EVERY STAGE IN THE API'S `STAGES` ARRAY MUST APPEAR IN `CUSTOMER_STAGES`.
 * A stage this file has never heard of falls through to a generic label, which
 * is survivable â€” but a stage missing from the PHASE map would silently drop
 * the card out of every list and the customer would be told they have no
 * repairs at all. `repair-journey.test.ts` asserts the two agree, so adding a
 * stage to the lifecycle without teaching this file fails the build rather than
 * hiding somebody's car.
 */

/** The four buckets the customer's own screens divide their repairs into. */
export type JourneyPhase =
  /** Logged, not yet being worked on. */
  | 'requested'
  /** The workshop is doing something. */
  | 'in_progress'
  /** The workshop is waiting on the CUSTOMER â€” the only phase that needs them. */
  | 'needs_you'
  /** Finished. */
  | 'finished';

export interface CustomerStage {
  /** What the customer reads. Plain language, no workshop jargon. */
  label: string;
  /** One sentence of what is actually happening, in the customer's terms. */
  detail: string;
  phase: JourneyPhase;
  /** `StatusBadge` has a FIXED set of kinds â€” an invented one renders nothing. */
  badge: 'draft' | 'active' | 'complete' | 'attention' | 'blocked';
}

/**
 * The 20 lifecycle stages, in the customer's words.
 *
 * âš ï¸ `awaiting_customer_approval`, `awaiting_deposit` and
 * `further_information_required` are the three that are `needs_you`. Getting
 * one of those wrong is the expensive mistake in this file: a car sits still
 * while its owner is never told they are the thing holding it up. That is
 * exactly the "waiting on someone outside the workshop" set the API already
 * names in `isWaitingStage()` â€” but NOT identical to it, because
 * `awaiting_parts` is also a waiting stage there and is emphatically not the
 * customer's problem to solve.
 */
export const CUSTOMER_STAGES: Record<string, CustomerStage> = {
  complaint_received: {
    label: 'Request received',
    detail: 'We have your report and will book the vehicle in.',
    phase: 'requested',
    badge: 'draft',
  },
  appointment_confirmed: {
    label: 'Appointment confirmed',
    detail: 'Your slot is booked. Bring the vehicle in at the agreed time.',
    phase: 'requested',
    badge: 'draft',
  },
  vehicle_received: {
    label: 'Vehicle received',
    detail: 'Your vehicle is with us and is queued for inspection.',
    phase: 'in_progress',
    badge: 'active',
  },
  initial_inspection: {
    label: 'Being inspected',
    detail: 'A technician is carrying out the first inspection.',
    phase: 'in_progress',
    badge: 'active',
  },
  diagnosis_in_progress: {
    label: 'Finding the fault',
    detail: 'A technician is diagnosing the cause of the problem you reported.',
    phase: 'in_progress',
    badge: 'active',
  },
  further_information_required: {
    label: 'We need something from you',
    detail: 'The workshop has asked you a question and cannot continue until you answer.',
    phase: 'needs_you',
    badge: 'attention',
  },
  solution_preparation: {
    label: 'Preparing your options',
    detail: 'We are working out how to fix it and what each option involves.',
    phase: 'in_progress',
    badge: 'active',
  },
  quotation_preparation: {
    label: 'Preparing your quote',
    detail: 'We are pricing the work. Your proposal will arrive shortly.',
    phase: 'in_progress',
    badge: 'active',
  },
  awaiting_customer_approval: {
    label: 'Waiting for your approval',
    detail: 'A repair proposal is waiting for your decision. Nothing starts until you approve it.',
    phase: 'needs_you',
    badge: 'attention',
  },
  awaiting_deposit: {
    label: 'Waiting for your deposit',
    detail: 'The work is approved and starts once the deposit is paid.',
    phase: 'needs_you',
    badge: 'attention',
  },
  awaiting_parts: {
    // NOT `needs_you`: the workshop is chasing this, not the customer.
    label: 'Waiting for parts',
    detail: 'The workshop is waiting on parts to arrive. Nothing is needed from you.',
    phase: 'in_progress',
    badge: 'blocked',
  },
  authorized_to_start: {
    label: 'Approved, starting soon',
    detail: 'Everything is agreed. Your repair is queued to begin.',
    phase: 'in_progress',
    badge: 'active',
  },
  repair_in_progress: {
    label: 'Being repaired',
    detail: 'A technician is working on your vehicle now.',
    phase: 'in_progress',
    badge: 'active',
  },
  specialist_consultation: {
    label: 'With a specialist',
    detail: 'A senior technician is reviewing the job before it goes further.',
    phase: 'in_progress',
    badge: 'active',
  },
  testing: {
    label: 'Being tested',
    detail: 'The repair is done and is being tested to confirm the fault is gone.',
    phase: 'in_progress',
    badge: 'active',
  },
  quality_control: {
    label: 'Final checks',
    detail: 'An inspector is checking the work before your vehicle is released.',
    phase: 'in_progress',
    badge: 'active',
  },
  ready_for_collection: {
    label: 'Ready to collect',
    detail: 'Your vehicle is finished and ready for you to pick up.',
    phase: 'needs_you',
    badge: 'complete',
  },
  completed: {
    label: 'Completed',
    detail: 'This repair is finished and the vehicle has been handed back.',
    phase: 'finished',
    badge: 'complete',
  },
  warranty_follow_up: {
    label: 'Completed â€” under warranty follow-up',
    detail: 'Finished. The workshop is following up on the warranty for this work.',
    phase: 'finished',
    badge: 'complete',
  },
  on_hold: {
    label: 'On hold',
    detail: 'This job is paused. Contact the workshop if you were not told why.',
    phase: 'in_progress',
    badge: 'blocked',
  },
};

/**
 * A stage this build has never heard of.
 *
 * âš ï¸ DELIBERATELY NOT A THROW. A newer API deploying a 21st stage must not blank
 * a customer's repair list â€” they would be told they have no vehicles in for
 * repair, which is a far worse failure than a vague label. It lands in
 * `in_progress` because "something is happening" is the honest reading of an
 * open card, and never in `needs_you`, which would tell someone to act on a
 * thing this build cannot describe.
 */
export function customerStage(stage: string): CustomerStage {
  return (
    CUSTOMER_STAGES[stage] ?? {
      label: 'In progress',
      detail: 'Your repair is with the workshop. Contact them for detail.',
      phase: 'in_progress',
      badge: 'active',
    }
  );
}

/** Is the customer the thing holding this job up? */
export function needsCustomer(stage: string): boolean {
  return customerStage(stage).phase === 'needs_you';
}

 succeeded in 1654ms:
import Link from 'next/link';
import { primitive, themeVar } from '@autoworkshop/design-tokens';

/**
 * What a visitor is told when `/api/auth/*` fails â€” `07.txt` Â§9.
 *
 * â”€â”€ ðŸ”´ THE DEFECT THIS EXISTS TO FIX â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 * Keycloak runs on Render's free tier and spins down after 15 minutes of idle.
 * Its cold start was MEASURED at up to 136 seconds on 2026-08-03. Auth.js
 * discovers every endpoint from `${issuer}/.well-known/openid-configuration`,
 * so during that window the discovery fetch fails and Auth.js reports:
 *
 *     Configuration â€” "There is a problem with the server configuration."
 *
 * That message is WRONG in the way that matters. Nothing is misconfigured. The
 * sign-in service is starting, and the visitor who triggered the wake is the one
 * person guaranteed to see a hard error â€” the first visitor after any quiet
 * period, which on a young product is very nearly every visitor. Told the server
 * is broken, they leave; had they been told to wait ninety seconds, they would
 * have signed in.
 *
 * â”€â”€ WHY THIS RATHER THAN A KEEP-WARM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 * A warmer was the obvious fix and the arithmetic refuses it. FOUR free Render
 * services share ONE 750-instance-hour monthly allowance, and a calendar month
 * is ~730 hours. Keeping Keycloak alive around the clock therefore consumes
 * essentially the ENTIRE allowance on its own and starves the API and both web
 * services â€” the same exhaustion that suspended this account with
 * `suspenders: ['billing']` on 2026-07-28. `keep-warm.yml` exists alongside this
 * file and is deliberately WINDOWED for that reason; read its header before
 * widening it. No paid remedy is to be proposed (ADR-012).
 *
 * So the cold start cannot be eliminated on this hosting, and the honest fix is
 * to stop lying about it. A slow sign-in that says it is slow is a far smaller
 * failure than a fast one that says the server is broken.
 *
 * âš ï¸ IT STILL DISTINGUISHES A REAL FAULT. `Configuration` after a wake has
 * completed IS a genuine misconfiguration, and this screen must not paper over
 * that â€” the retry is bounded, and once the countdown is spent the copy stops
 * promising a wake and says plainly that the service is not answering. A screen
 * that says "starting up" forever is the monitor that always reports healthy.
 */

/**
 * Auth.js's error codes. `Configuration` is the one this screen exists for; the
 * others are here because `pages.error` captures ALL of them, and falling
 * through to a blank page would be worse than the default screen it replaced.
 */
const MESSAGES: Record<string, { title: string; body: string; waking: boolean }> = {
  Configuration: {
    title: 'The sign-in service is starting up',
    body:
      'This site runs on free hosting that powers down when nobody is using it. Waking it takes up to two minutes, and you are the first visitor since it went quiet. Nothing is wrong â€” please wait, or try again in a moment.',
    waking: true,
  },
  AccessDenied: {
    title: 'That account cannot sign in here',
    body:
      'You signed in successfully, but this account is not permitted to use this workspace. If you believe it should be, ask an administrator of your workshop to check your access.',
    waking: false,
  },
  Verification: {
    title: 'That sign-in link has expired',
    body: 'Sign-in links can only be used once, and not long after they are sent. Please start again.',
    waking: false,
  },
};

const FALLBACK = {
  title: 'Sign-in did not complete',
  body:
    'Something interrupted the sign-in. Trying again usually works. If it keeps happening, the sign-in service may be unavailable.',
  waking: false,
};

export interface AuthErrorScreenProps {
  /** Auth.js's `?error=` code. Absent when somebody opens the page directly. */
  error?: string;
  /** Where "Try again" goes. Defaults to this app's sign-in route. */
  signInHref?: string;
}

export function AuthErrorScreen({ error, signInHref = '/api/auth/signin' }: AuthErrorScreenProps) {
  /**
   * âš ï¸ A TERNARY, NOT `(error && MESSAGES[error]) ?? FALLBACK`.
   *
   * That was the first version and it CRASHES on `/auth/error?error=`. With an
   * empty string, `error && â€¦` short-circuits to `''`, and `??` only replaces
   * `null`/`undefined` â€” so `message` becomes `''` and `message.title` throws.
   * An empty `?error=` is not hypothetical: it is what a hand-trimmed URL or a
   * provider that redirects with a blank code produces, and it would white-screen
   * the one page a visitor reaches only when something has ALREADY gone wrong.
   */
  const message = (error ? MESSAGES[error] : undefined) ?? FALLBACK;

  return (
    <main
      style={{
        maxWidth: '38rem',
        margin: '0 auto',
        padding: primitive.space[8],
        display: 'flex',
        flexDirection: 'column',
        gap: primitive.space[4],
      }}
    >
      <div
        style={{
          border: `1px solid ${themeVar.borderDefault}`,
          borderRadius: primitive.radius.xl,
          background: themeVar.surfaceRaised,
          padding: primitive.space[6],
          display: 'flex',
          flexDirection: 'column',
          gap: primitive.space[3],
        }}
      >
        <h1 style={{ margin: 0, fontSize: primitive.fontSize['2xl'] }}>{message.title}</h1>
        <p style={{ margin: 0, lineHeight: 1.7 }}>{message.body}</p>

        {message.waking ? (
          /*
            A live countdown, not a spinner. A spinner claims progress is being
            made and cannot say how much is left; a visitor watching one for 136
            seconds concludes it is stuck. The number is the honest measurement
            from 2026-08-03, and this is a CLIENT component purely because a
            countdown cannot be rendered on the server.
          */
          <WakeCountdown signInHref={signInHref} />
        ) : (
          <p style={{ margin: 0 }}>
            <Link href={signInHref}>Try signing in again</Link>
          </p>
        )}

        {/*
          The raw code, small and last. It is meaningless to a customer and it is
          the first thing anyone debugging this will ask for, so it is present
          without being the headline.
        */}
        {error ? (
          <p
            style={{
              margin: 0,
              color: themeVar.textSecondary,
              fontSize: primitive.fontSize.xs,
              fontFamily: primitive.fontFamily.mono,
            }}
          >
            {error}
          </p>
        ) : null}
      </div>

      <p style={{ margin: 0, fontSize: primitive.fontSize.sm }}>
        <Link href="/">Back to the home page</Link>
      </p>
    </main>
  );
}

/**
 * Counts the wake down and retries once, by itself.
 *
 * âš ï¸ ONE automatic retry, then it stops and hands over to the visitor. A page
 * that reloads forever against a service that is genuinely down is a page that
 * hammers a dead host and never tells anyone â€” and on metered free hosting it
 * would burn the very allowance that made the service sleep in the first place.
 */
function WakeCountdown({ signInHref }: { signInHref: string }) {
  return (
    <div
      // A `<noscript>`-safe fallback is the link itself, which is always
      // rendered. The script only upgrades it.
      style={{ display: 'flex', flexDirection: 'column', gap: primitive.space[2] }}
    >
      <p style={{ margin: 0 }}>
        <Link href={signInHref} id="aw-auth-retry">
          Try signing in again
        </Link>{' '}
        <span id="aw-auth-countdown" style={{ color: themeVar.textSecondary }} />
      </p>
      <script
        // eslint-disable-next-line react/no-danger -- a fixed literal, no interpolation
        dangerouslySetInnerHTML={{
          __html: `(function(){
  var el = document.getElementById('aw-auth-countdown');
  var link = document.getElementById('aw-auth-retry');
  if (!el || !link) return;
  // 140s: the 136s cold start measured on 2026-08-03, plus a little. Retrying
  // sooner than the wake takes just produces the same error page twice.
  var left = 140;
  var t = setInterval(function () {
    left -= 1;
    if (left <= 0) {
      clearInterval(t);
      el.textContent = '';
      // ONE automatic attempt. If it fails again the visitor sees this page
      // once more, with the countdown spent, and decides for themselves.
      if (!sessionStorage.getItem('aw-auth-retried')) {
        sessionStorage.setItem('aw-auth-retried', '1');
        window.location.href = link.getAttribute('href');
      }
      return;
    }
    el.textContent = 'â€” retrying automatically in ' + left + 's';
  }, 1000);
})();`,
        }}
      />
    </div>
  );
}

 succeeded in 1718ms:
import NextAuth, { type NextAuthResult } from 'next-auth';
import Keycloak from 'next-auth/providers/keycloak';
import { getToken } from 'next-auth/jwt';
import { headers } from 'next/headers';
import type { WorkspaceId } from '@autoworkshop/navigation';
import { apiBaseUrl, authSecret, clientIdForWorkspace, keycloakIssuer } from './config';
import { keycloakSignOutUrl } from './logout-url';
import {
  isExpired,
  refreshAccessToken,
  revokeRefreshToken,
  RefreshFailedError,
  type KeycloakTokenSet,
} from './tokens';

/**
 * ONE Auth.js configuration, consumed by all seven Next apps.
 *
 * WHY A FACTORY AND NOT SEVEN `auth.ts` FILES. The apps differ by exactly one
 * value â€” which Keycloak client they authenticate as â€” and that value is
 * derivable from the workspace id. Seven copies of a token-refresh callback is
 * seven chances for six of them to fall behind the seventh, which is the
 * duplication root CLAUDE.md Â§0.3 forbids and the same reasoning that put the
 * `next/link` adapter in `@autoworkshop/next-shell` instead of in every app.
 *
 * WHAT THE BROWSER GETS. The session cookie is an encrypted JWE, httpOnly, and
 * the Keycloak tokens live inside it. The browser therefore holds the tokens in
 * a form it cannot read â€” but that is not the whole story, because Auth.js
 * serves whatever the `session` callback returns as JSON at
 * `/api/auth/session`, to the browser, on request. **Anything placed on the
 * session object is public to the client.** The tokens are deliberately left in
 * the JWT and never copied onto the session; `getAccessToken()` below reads
 * them back server-side.
 *
 * WHAT THIS IS NOT. A session proves who the viewer is. It authorises nothing:
 * the API re-verifies the token's signature, issuer, audience and expiry on
 * every call and resolves the tenant from membership records, and Postgres RLS
 * denies underneath that. CLAUDE.md Â§5, Â§8.
 */

/** What the browser is allowed to know about its own session. */
declare module 'next-auth' {
  interface Session {
    /**
     * Set when the refresh token stopped working. The UI uses it to send the
     * viewer back through sign-in rather than rendering a shell whose every
     * API call is about to 401.
     */
    error?: 'RefreshFailed';
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    keycloak?: KeycloakTokenSet;
    error?: 'RefreshFailed';
  }
}

export interface WorkspaceAuth {
  /** Mount at `app/api/auth/[...nextauth]/route.ts`. */
  handlers: NextAuthResult['handlers'];
  /** Read the session in a server component, route handler or middleware. */
  auth: NextAuthResult['auth'];
  signIn: NextAuthResult['signIn'];
  signOut: NextAuthResult['signOut'];
  /** The Keycloak client this workspace authenticates as. */
  clientId: string;
  /**
   * The current Keycloak ACCESS TOKEN, server-side only.
   *
   * Returns `null` when there is no session, or when the stored token has
   * expired. **Expired means null, never a refresh** â€” see the note on
   * `createWorkspaceAuth` about why refreshing here would break the session.
   * Callers must treat `null` as "unauthenticated" and fail closed.
   */
  getAccessToken: () => Promise<string | null>;
  /**
   * Is there a decryptable session cookie for this workspace?
   *
   * Distinct from `getAccessToken()` in two ways that matter: it does NOT care
   * whether the access token has expired, and it makes no network call.
   *
   * It exists because "can this viewer sign out" and "can this viewer be
   * described" are different questions, and conflating them stranded users
   * (Codex finding M2). The shell's labels come from `GET /api/v1/me`; when the
   * API is down that returns nothing, the viewer resolves to null, and a viewer
   * with a perfectly live Keycloak session was shown a Sign IN button and no way
   * out. An API outage must not remove the ability to end a session â€” that is
   * exactly when someone is most likely to want to.
   */
  hasSession: () => Promise<boolean>;
  /**
   * End the session for real: revoke the refresh token at Keycloak, then
   * return the URL that ends the Keycloak SSO session.
   *
   * `signOut()` alone deletes this app's cookie and nothing else, so a refresh
   * token captured beforehand stays valid and rotatable. CLAUDE.md Â§9 requires
   * actual revocation, and on a shared workshop terminal that is the point of
   * signing out at all.
   *
   * Call this BEFORE `signOut()` â€” it needs the cookie in order to read the
   * refresh token out of it.
   */
  signOutCompletely: (postLogoutRedirect: string) => Promise<{
    keycloakSignOutUrl: string;
    refreshTokenRevoked: boolean;
  }>;
}

/**
 * Build the Auth.js instance for one workspace.
 *
 * TOKEN REFRESH HAS EXACTLY ONE OWNER: the `jwt` callback below. That is not
 * tidiness, it is forced by the realm â€” `revokeRefreshToken: true` with
 * `refreshTokenMaxReuse: 0` means using a refresh token revokes it, so a second
 * refresher would silently invalidate the session the first one just renewed.
 * The failure surfaces minutes later as a spontaneous sign-out.
 *
 * The refreshed cookie is persisted by MIDDLEWARE, which is the only place in
 * the App Router that both runs before a render and may set a cookie. A server
 * component can run the callback but cannot write the result, so an app that
 * skips the middleware will re-refresh on every render and persist none of it.
 * `createAuthMiddleware()` exists so that is one import rather than a thing to
 * remember.
 */
export function createWorkspaceAuth(workspaceId: WorkspaceId | string): WorkspaceAuth {
  const clientId = clientIdForWorkspace(workspaceId);

  const result = NextAuth(() => ({
    // The config is a FUNCTION so the environment is read per request rather
    // than when Next collects this route during `next build` â€” otherwise the
    // build machine's realm and secret are baked into the deployed bundle.
    secret: authSecret(),
    session: { strategy: 'jwt' as const },
    /**
     * Accept the request's Host header when building callback URLs.
     *
     * WITHOUT THIS EVERY AUTH ENDPOINT RETURNS 500. Auth.js v5 refuses an
     * unrecognised host by default â€” `UntrustedHost: Host must be trusted` â€”
     * and it only auto-detects Vercel. Behind Render, a Cloudflare tunnel, a
     * reverse proxy, or plain `next start` on any port but the one it guessed,
     * `/api/auth/signin` and `/api/auth/session` fail while ordinary pages keep
     * returning 200. That asymmetry is why typecheck, lint, the unit suite and
     * a ten-target build were all green with sign-in completely broken.
     *
     * WHY TRUSTING THE HOST IS SAFE HERE, AND WHERE THE REAL CONTROL IS. The
     * host decides which absolute URL is sent to Keycloak as `redirect_uri`, so
     * a forged Host header is an attempt to have the authorization code
     * delivered somewhere else. Keycloak refuses that: each client carries an
     * explicit `redirectUris` allow-list, and a `redirect_uri` outside it is
     * rejected before any code is issued â€” the browser never leaves the login
     * page. The allow-list in `realm-autoworkshop.json` is therefore the
     * control, and it is a server-side one that no header can influence.
     *
     * KEEP THAT ALLOW-LIST TIGHT. It is currently `http://localhost:<port>/*`
     * plus the production hostnames. Widening it to a wildcard host would
     * remove the only thing making this setting safe.
     */
    trustHost: true,
    /**
     * ðŸ”´ THE ERROR PAGE IS OVERRIDDEN; THE SIGN-IN PAGE IS NOT.
     *
     * Auth.js's default sign-in screen is fine â€” there is no branded one yet and
     * a half-styled one would be worse. Its default ERROR screen is not fine,
     * for one specific and measured reason:
     *
     * Keycloak sleeps on Render's free tier and its cold start reached 136
     * SECONDS on 2026-08-03. Auth.js discovers every endpoint from the realm's
     * `.well-known/openid-configuration`, so during that wake the discovery
     * fetch fails and Auth.js renders `Configuration` â€” "There is a problem with
     * the server configuration."
     *
     * Nothing is misconfigured. The service is starting. And the person shown
     * that message is always the FIRST visitor after a quiet period, which on a
     * product with little traffic is very nearly every visitor. Telling them the
     * server is broken loses them; telling them to wait ninety seconds does not.
     *
     * âš ï¸ EVERY APP MUST MOUNT `/auth/error`. This is set once here for all seven
     * workspaces, so an app missing that route turns a recoverable cold start
     * into a 404 â€” worse than the screen this replaces. `auth-error-route.spec.ts`
     * asserts all seven exist, and it is the only thing standing between a new
     * app and that regression.
     */
    pages: { error: '/auth/error' },
    providers: [
      Keycloak({
        clientId,
        /**
         * The realm. Auth.js discovers every endpoint from
         * `${issuer}/.well-known/openid-configuration`, so without it the
         * provider has no authorization, token or JWKS URL and every auth
         * route fails with `InvalidEndpoints: Provider "keycloak" is missing
         * both 'issuer' and 'authorization' endpoint config`.
         *
         * Ordinary pages keep returning 200 while this is wrong, because they
         * never touch the provider â€” only `/api/auth/*` and the middleware do.
         * That is the same asymmetry that hid the `trustHost` fault above, and
         * it is why this file is verified by starting the app and calling the
         * endpoints rather than by building it.
         *
         * Resolved per request from KEYCLOAK_URL + KEYCLOAK_REALM â€” the same
         * two variables, combined the same way, as the API's token validation.
         */
        issuer: keycloakIssuer(),
        // PUBLIC client with PKCE S256 â€” `realm-autoworkshop.json` defines all
        // seven browser clients that way, and the realm enforces the challenge
        // method through `pkce.code.challenge.method`. There is no secret to
        // send, so the token endpoint must not be given one; `none` says so
        // explicitly rather than letting Auth.js send an empty string, which
        // Keycloak rejects as a malformed client credential.
        //
        // A confidential client would authenticate the token exchange itself
        // and is the stronger option now that the exchange happens on the Next
        // server rather than in the browser. It is deliberately NOT changed
        // here: that is a realm change affecting seven clients plus seven
        // secrets, and it belongs in its own reviewed step, not folded into
        // the change that introduces sessions at all.
        client: { token_endpoint_auth_method: 'none' },
        checks: ['pkce', 'state'],
        /**
         * âš ï¸ NO `prompt` PARAMETER, AND THAT IS A MEASURED DECISION rather than an
         * omission.
         *
         * Keycloak honours a live SSO session, so pressing "Sign in" while somebody
         * else is still signed in returns THEIR identity without asking â€” reported as
         * "i logged in as admin but it show technician". The obvious fix is a prompt.
         * Both were tried against this realm and neither works:
         *
         *   Â· `prompt=select_account` â€” returns SILENTLY, exactly as with no parameter
         *     at all. Measured: it landed straight on the previous user's dashboard.
         *   Â· `prompt=login` â€” shows "Please re-authenticate to continue" PRE-FILLED
         *     with the previous user and only a password box. There is no link to
         *     choose another account in this theme, so it is strictly worse: it asks a
         *     question the person cannot answer and gives them no way out.
         *
         * The mechanism that does work is ending the SSO session, which is what
         * `performSignOut` already does correctly. So the fix is the "Switch user"
         * control in the shell, and this is left at the default deliberately â€”
         * shipping a parameter that measurably changes nothing, under a comment
         * claiming it does, is worse than shipping neither.
         */
      }),
    ],
    callbacks: {
      async jwt({ token, account }) {
        // First call after a successful sign-in: `account` carries the tokens.
        if (account) {
          token.keycloak = {
            accessToken: account.access_token as string,
            refreshToken: account.refresh_token as string | undefined,
            // `expires_at` is epoch SECONDS and may be absent; deriving it from
            // `expires_in` keeps the unit consistent either way.
            expiresAt:
              (account.expires_at as number | undefined) ??
              Math.floor(Date.now() / 1000) + ((account.expires_in as number | undefined) ?? 300),
            idToken: account.id_token as string | undefined,
          };
          delete token.error;
          return token;

codex
A few likely review targets are emerging: the new customer screens rely on `/job-cards`, the auth error route is shared across all workspaces, and the keep-warm action makes strong assumptions about GitHub scheduling. I’m drilling into the API and package boundaries before calling anything a defect.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"export interface JobCard|class JobCardService|async list|list\\(\" apps/api/src/repair packages -g \"*.ts\"" in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content apps/api/src/repair/job-card-stages.ts -TotalCount 220' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content packages/ui/src/StatusBadge.tsx -TotalCount 180' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content apps/api/src/repair/job-card.service.ts -TotalCount 360' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 1169ms:
apps/api/src/repair\variation.service.ts:84:  async list(ctx: TenantContext, jobCardId?: string) {
apps/api/src/repair\testing.spec.ts:188:    await new TestingService(db, fakeAudit()).list(ctx({ userId: 't9' }));
apps/api/src/repair\testing.spec.ts:273:    const s = only(await new TestingService(db, fakeAudit()).list(ctx()));
apps/api/src/repair\testing.spec.ts:306:    const s = only(await new TestingService(db, fakeAudit()).list(ctx()));
apps/api/src/repair\proposal.service.ts:184:  async listForJobCard(ctx: TenantContext, jobCardId: string): Promise<RepairProposal[]> {
apps/api/src/repair\proposal.service.ts:194:  async list(ctx: TenantContext): Promise<RepairProposal[]> {
apps/api/src/repair\diagnosis.spec.ts:278:    const seen = await svc.list(ctx({ activeRole: 'storekeeper' }));
apps/api/src/repair\diagnosis.service.ts:157:  async listForJobCard(ctx: TenantContext, jobCardId: string): Promise<Diagnosis[]> {
apps/api/src/repair\diagnosis.service.ts:177:  async list(ctx: TenantContext): Promise<Diagnosis[]> {
apps/api/src/repair\job-card.service.ts:30:export interface JobCard {
apps/api/src/repair\job-card.service.ts:165:export class JobCardService {
apps/api/src/repair\job-card.service.ts:171:  async list(ctx: TenantContext, filter?: { vehicleId?: string }): Promise<JobCard[]> {
apps/api/src/repair\job-card.service.ts:219:    const cards = await this.list(ctx);
apps/api/src/repair\execution.spec.ts:202:    await new ExecutionService(db, fakeAudit()).list(ctx({ userId: 't9' }));
apps/api/src/repair\execution.spec.ts:379:    const e = only(await new ExecutionService(db, fakeAudit()).list(ctx()));
apps/api/src/repair\execution.service.ts:160:  async listForJobCard(ctx: TenantContext, jobCardId: string): Promise<RepairExecution[]> {
apps/api/src/repair\execution.service.ts:170:  async list(ctx: TenantContext): Promise<RepairExecution[]> {
apps/api/src/repair\quality.service.ts:169:  async listForCard(ctx: TenantContext, jobCardId: string): Promise<QualityInspection[]> {
apps/api/src/repair\quotation.spec.ts:221:    await new QuotationService(db, fakeAudit()).list(ctx({ activeRole: 'technician', userId: 't9' }));
apps/api/src/repair\quotation.spec.ts:378:    const q = only(await new QuotationService(db, fakeAudit()).list(ctx()));
apps/api/src/repair\quotation.spec.ts:396:    const q = only(await new QuotationService(db, fakeAudit()).list(ctx()));
apps/api/src/repair\quotation.spec.ts:410:    const q = only(await new QuotationService(db, fakeAudit()).list(ctx()));
apps/api/src/repair\proposal.spec.ts:191:    await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'technician', userId: 't9' }));
apps/api/src/repair\proposal.spec.ts:275:    const p = only(await new ProposalService(db, fakeAudit()).list(ctx()));
apps/api/src/repair\proposal.spec.ts:291:    const p = only(await new ProposalService(db, fakeAudit()).list(ctx()));
apps/api/src/repair\proposal.spec.ts:300:    const p = only(await new ProposalService(db, fakeAudit()).list(ctx()));
apps/api/src/repair\proposal.spec.ts:311:    const p = only(await new ProposalService(db, fakeAudit()).list(ctx()));
apps/api/src/repair\proposal.spec.ts:317:    const p = only(await new ProposalService(db, fakeAudit()).list(ctx()));
apps/api/src/repair\proposal.spec.ts:332:    const p = only(await new ProposalService(db, fakeAudit()).list(ctx()));
apps/api/src/repair\quotation.service.ts:148:  async listForJobCard(ctx: TenantContext, jobCardId: string): Promise<Quotation[]> {
apps/api/src/repair\quotation.service.ts:158:  async list(ctx: TenantContext): Promise<Quotation[]> {
apps/api/src/repair\repair-plan.spec.ts:263:    await expect(service.list(ctx({ activeRole: 'customer' }))).rejects.toThrow(
apps/api/src/repair\repair-plan.spec.ts:294:    await service.list(ctx({ activeRole: 'technician', userId: 'tech-9' }));
apps/api/src/repair\repair-plan.spec.ts:303:    await new RepairPlanService(db2, fakeAudit()).list(
apps/api/src/repair\repair-plan.spec.ts:806:    const plan = only(await service.list(ctx({ activeRole: 'workshop_manager' })));
apps/api/src/repair\repair-plan.spec.ts:825:      await new RepairPlanService(fakeDb(submitted('user-1')).db, fakeAudit()).list(
apps/api/src/repair\repair-plan.spec.ts:833:      await new RepairPlanService(fakeDb(submitted(OTHER_USER)).db, fakeAudit()).list(
apps/api/src/repair\repair-plan.spec.ts:840:      await new RepairPlanService(fakeDb(submitted(OTHER_USER)).db, fakeAudit()).list(
apps/api/src/repair\repair-plan.spec.ts:852:      ).list(ctx()),
apps/api/src/repair\repair-plan.spec.ts:884:      ).list(ctx()),
apps/api/src/repair\repair.controller.ts:86:  list(
apps/api/src/repair\repair.controller.ts:90:    return this.jobCards.list(req.tenantContext, { vehicleId });
apps/api/src/repair\repair.controller.ts:344:  list(@Req() req: AuthenticatedRequest) {
apps/api/src/repair\repair.controller.ts:345:    return this.inspections.list(req.tenantContext);
apps/api/src/repair\repair.controller.ts:412:  list(@Req() req: AuthenticatedRequest) {
apps/api/src/repair\repair.controller.ts:413:    return this.diagnoses.list(req.tenantContext);
apps/api/src/repair\repair.controller.ts:541:  list(@Req() req: AuthenticatedRequest) {
apps/api/src/repair\repair.controller.ts:542:    return this.repairPlans.list(req.tenantContext);
apps/api/src/repair\repair.controller.ts:717:  list(@Req() req: AuthenticatedRequest) {
apps/api/src/repair\repair.controller.ts:718:    return this.quotations.list(req.tenantContext);
apps/api/src/repair\repair.controller.ts:811:  list(@Req() req: AuthenticatedRequest) {
apps/api/src/repair\repair.controller.ts:812:    return this.proposals.list(req.tenantContext);
apps/api/src/repair\repair.controller.ts:885:  list(@Req() req: AuthenticatedRequest) {
apps/api/src/repair\repair.controller.ts:886:    return this.executions.list(req.tenantContext);
apps/api/src/repair\repair.controller.ts:996:  list(@Req() req: AuthenticatedRequest) {
apps/api/src/repair\repair.controller.ts:997:    return this.testing.list(req.tenantContext);
apps/api/src/repair\repair.controller.ts:1172:  list(@Req() req: AuthenticatedRequest, @Query('jobCardId') jobCardId?: string) {
apps/api/src/repair\repair.controller.ts:1176:    return this.variations.list(req.tenantContext, jobCardId || undefined);
apps/api/src/repair\repair-plan.service.ts:216:  async listForJobCard(ctx: TenantContext, jobCardId: string): Promise<RepairPlan[]> {
apps/api/src/repair\repair-plan.service.ts:236:  async list(ctx: TenantContext): Promise<RepairPlan[]> {
apps/api/src/repair\repair.spec.ts:77:    await svc.list(ctx({ activeRole: 'technician', userId: 'tech-9' }));
apps/api/src/repair\repair.spec.ts:87:    await svc.list(ctx({ activeRole: 'customer', userId: 'cust-9' }));
apps/api/src/repair\repair.spec.ts:95:    await svc.list(ctx({ activeRole: 'workshop_manager' }));
apps/api/src/repair\repair.spec.ts:103:    await svc.list(ctx({ organizationId: 'org-7' }));
apps/api/src/repair\repair.spec.ts:121:      await expect(svc.list(ctx({ activeRole: role }))).rejects.toThrow(/may not read/);
apps/api/src/repair\testing.service.ts:116:  async listForJobCard(ctx: TenantContext, jobCardId: string): Promise<TestSession[]> {
apps/api/src/repair\testing.service.ts:126:  async list(ctx: TenantContext): Promise<TestSession[]> {
apps/api/src/repair\inspection.service.ts:88:  async listForJobCard(ctx: TenantContext, jobCardId: string): Promise<Inspection[]> {
apps/api/src/repair\inspection.service.ts:113:  async list(ctx: TenantContext): Promise<Inspection[]> {

 succeeded in 1088ms:
import * as React from 'react';
import { statusVar, type StatusKind } from '@autoworkshop/design-tokens';

export interface StatusBadgeProps {
  kind: StatusKind;
  /**
   * Required, not optional, and deliberately so.
   *
   * `autoworkshop 01 (1).txt` Â§66: "Colour shall never be the only method used
   * to communicate status. Every status shall also use text, icon, badge,
   * label." Making `label` mandatory means the type system enforces the
   * accessibility rule â€” a colour-only badge will not compile.
   */
  label: string;
  icon?: React.ReactNode;
}

export function StatusBadge({ kind, label, icon }: StatusBadgeProps) {
  return (
    <span
      role="status"
      data-status={kind}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
        padding: '0.125rem 0.5rem', borderRadius: '9999px',
        fontSize: '0.875rem', lineHeight: 1.5,
        color: statusVar[kind], border: `1px solid ${statusVar[kind]}`,
      }}
    >
      {icon}
      {label}
    </span>
  );
}

 succeeded in 1271ms:
/**
 * Job card stage transition rules â€” Phase 5, slice 2.
 *
 * `02.txt` Â§29: "Drag-and-drop movement shall not bypass business rules. THE
 * BACKEND SHALL VALIDATE EVERY STAGE CHANGE."
 * `1.txt` Â§394: "The repair staging board shall enforce transition rules. A
 * technician must not manually bypass required approval, payment, parts or
 * quality-control states without an authorized, logged override."
 *
 * Two INDEPENDENT rules, and they are independent on purpose:
 *
 *   1. WHERE may this card go next?  â†’ `STAGE_TRANSITIONS` (the lifecycle)
 *   2. WHO may put it there?         â†’ `ROLE_TARGET_STAGES` (07 pt2 Â§50)
 *
 * Collapsing them into one table would be smaller and wrong. A technician is
 * allowed to reach `testing`, but not from `complaint_received` â€” and a manager
 * may reach `quality_control`, but not from `vehicle_received`. Either rule
 * alone permits a bypass the other catches, so both are checked, and the tests
 * assert each one with the other satisfied.
 *
 * âš ï¸ THIS FILE IS NOT THE AUTHORITY ON WHICH STAGES EXIST. The CHECK constraint
 * in migration 006 is. `STAGES` below is a transcription of it, and
 * `stagesMatchDatabase` in the spec asserts they have not drifted.
 */

/**
 * The 19 stages of `1.txt` Â§322-Â§360 plus `on_hold` from `02.txt` Â§29's board,
 * in the order the specification lists them.
 */
export const STAGES = [
  'complaint_received',
  'appointment_confirmed',
  'vehicle_received',
  'initial_inspection',
  'diagnosis_in_progress',
  'further_information_required',
  'solution_preparation',
  'quotation_preparation',
  'awaiting_customer_approval',
  'awaiting_deposit',
  'awaiting_parts',
  'authorized_to_start',
  'repair_in_progress',
  'specialist_consultation',
  'testing',
  'quality_control',
  'ready_for_collection',
  'completed',
  'warranty_follow_up',
  'on_hold',
] as const;

export type Stage = (typeof STAGES)[number];

/**
 * The lifecycle, as an adjacency map: from a stage, which stages may follow.
 *
 * â”€â”€ HOW THE BYPASS IS PREVENTED â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 * Â§394 names four things that must not be skipped â€” approval, payment, parts,
 * quality control. This map is what makes skipping them structurally
 * impossible rather than a matter of policy:
 *
 *   Â· `quotation_preparation` leads ONLY to `awaiting_customer_approval`, so a
 *     priced job cannot start without being put to the customer.
 *   Â· nothing reaches `repair_in_progress` except `authorized_to_start`, and
 *     `authorized_to_start` is reachable only after approval / deposit / parts.
 *   Â· `testing` leads ONLY to `quality_control` (or back into repair), and
 *     `ready_for_collection` is reachable ONLY from `quality_control`. A car
 *     cannot be handed back without passing QC.
 *
 * A workshop that genuinely needs to skip one â€” a warranty job with no deposit,
 * a customer approving verbally â€” uses the override, which is authorized and
 * recorded. That is Â§394's own escape hatch, not a hole in this map.
 *
 * âš ï¸ `on_hold` is deliberately ABSENT as a source. A held card resumes to the
 * stage it was holding at, which is read from `repair.job_card_stage_events` â€”
 * see `resumeTargetFor` in the service. A static list here would have to allow
 * every stage, which is precisely the bypass this map exists to prevent.
 */
export const STAGE_TRANSITIONS: Record<Stage, readonly Stage[]> = {
  // Intake. `1.txt` Â§322 â€” the lifecycle opens here, from reception or from a
  // customer's own complaint.
  complaint_received: ['appointment_confirmed', 'vehicle_received', 'on_hold'],
  appointment_confirmed: ['vehicle_received', 'on_hold'],
  vehicle_received: ['initial_inspection', 'on_hold'],

  // Inspection and diagnosis.
  initial_inspection: [
    'diagnosis_in_progress',
    'further_information_required',
    'solution_preparation',
    'on_hold',
  ],
  diagnosis_in_progress: [
    'further_information_required',
    'specialist_consultation',
    'solution_preparation',
    'on_hold',
  ],
  // Back to the bench, or onward once the missing information arrives.
  further_information_required: [
    'initial_inspection',
    'diagnosis_in_progress',
    'solution_preparation',
    'on_hold',
  ],

  // Solution and price.
  solution_preparation: ['quotation_preparation', 'specialist_consultation', 'on_hold'],
  // THE APPROVAL GATE: the only way out is to ask the customer.
  quotation_preparation: ['awaiting_customer_approval', 'on_hold'],
  // The customer may approve (onward), or ask for changes (back to solution).
  awaiting_customer_approval: [
    'awaiting_deposit',
    'awaiting_parts',
    'authorized_to_start',
    'solution_preparation',
    'on_hold',
  ],
  awaiting_deposit: ['awaiting_parts', 'authorized_to_start', 'on_hold'],
  awaiting_parts: ['authorized_to_start', 'on_hold'],

  // Execution. `authorized_to_start` is the single door into repair work.
  authorized_to_start: ['repair_in_progress', 'on_hold'],
  repair_in_progress: [
    'testing',
    'specialist_consultation',
    // A part can fail mid-repair; that is a return to a waiting state, not a
    // bypass of one.
    'awaiting_parts',
    'on_hold',
  ],
  specialist_consultation: [
    'diagnosis_in_progress',
    'solution_preparation',
    'repair_in_progress',
    'on_hold',
  ],

  // THE QUALITY GATE.
  testing: ['quality_control', 'repair_in_progress', 'on_hold'],
  // Â§50 gives the QC inspector "rejection and approval": rejection sends the
  // job back to the bench or to re-test, approval releases it.
  quality_control: ['ready_for_collection', 'repair_in_progress', 'testing', 'on_hold'],

  ready_for_collection: ['completed', 'on_hold'],
  completed: ['warranty_follow_up'],
  // Terminal. A warranty claim on a closed job opens a NEW card â€” `1.txt`
  // Â§322's lifecycle is per-visit, and reopening this one would overwrite the
  // history of the original repair.
  warranty_follow_up: [],

  // See the note above: resolved from history, never from this list.
  on_hold: [],
};

/**
 * Which stages each role may move a card INTO â€” `07.txt` pt2 Â§50, the
 * "ROLE-BASED CONTROL SUMMARY", which closes with: "No user shall receive
 * functions outside the user's approved role and branch."
 *
 * Read as: the verbs Â§50 gives a role, expressed as the stages those verbs
 * produce. A role absent from this map may not change a stage at all â€” which is
 * the case for `customer`, who opens a complaint (`2.txt` Â§537) and does not
 * drive the workshop's internal workflow.
 */
export const ROLE_TARGET_STAGES: Record<string, readonly Stage[]> = {
  // "Full workshop governance" â€” and the role that carries the override.
  workshop_owner: STAGES,
  // "Daily operational control, assignment, workflow and performance access."
  workshop_manager: STAGES,
  // Present for the same reason it is present everywhere else: it is the role
  // the platform's own administrators hold, and every other service admits it.
  platform_administrator: STAGES,

  // "Customer, vehicle, complaint, appointment, intake, invoice and RELEASE
  // functions." Reception books the car in and hands it back; it does not
  // diagnose, price, or pass quality control.
  reception_staff: [
    'complaint_received',
    'appointment_confirmed',
    'vehicle_received',
    'completed',
    'on_hold',
  ],

  // "Technical review, repair-plan approval, testing and quality oversight."
  workshop_supervisor: [
    'initial_inspection',
    'diagnosis_in_progress',
    'further_information_required',
    'solution_preparation',
    'quotation_preparation',
    'specialist_consultation',
    'authorized_to_start',
    'repair_in_progress',
    'testing',
    'quality_control',
    'on_hold',
  ],

  /**
   * "ASSIGNED-JOB inspection, diagnosis, repair planning, execution and
   * testing."
   *
   * âš ï¸ THE ABSENCES ARE THE REQUIREMENT. Â§394 forbids a technician bypassing
   * "approval, payment, parts or quality-control states", so this list excludes
   * every one of them: no `awaiting_customer_approval`, no `awaiting_deposit`,
   * no `awaiting_parts`, no `authorized_to_start` (authorising their own work is
   * the bypass), no `quality_control`, no `ready_for_collection`, no
   * `completed`. A technician does the work and hands it on.
   *
   * "Assigned-job" is enforced separately and structurally: `findById` already
   * narrows a technician to cards assigned to them, so a technician cannot
   * even READ a card they are not on, let alone move it.
   */
  technician: [
    'initial_inspection',
    'diagnosis_in_progress',

 succeeded in 1471ms:
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';
import {
  optionalDate,
  optionalInt,
  optionalOneOf,
  optionalText,
  optionalUuid,
  requireOneOf,
  requireText,
  requireUuid,
} from '../core/validate';
import {
  BOARD_COLUMNS,
  CAN_OVERRIDE_STAGE,
  ROLE_TARGET_STAGES,
  STAGES,
  permittedTargetsFrom,
  stageOptionsFor,
  type Stage,
} from './job-card-stages';

export interface JobCard {
  id: string;
  jobNumber: string;
  customerId: string;
  customerName: string;
  vehicleId: string;
  registrationNumber: string;
  vehicleDescription: string;
  complaint: string;
  stage: string;
  priority: string;
  assignedTechnicianId: string | null;
  assignedTechnicianName: string | null;
  expectedCompletionOn: string | null;
  mileageAtIntake: number | null;
  openedAt: string;
  /**
   * When the card last CHANGED STAGE â€” migration 007. The staging board's
   * "elapsed time" (`02.txt` Â§29) is measured from here and not from
   * `updated_at`, which any edit would reset, hiding a stalled job behind a
   * corrected typo.
   */
  stageChangedAt: string;
  closedAt: string | null;
  /**
   * The stages THIS viewer may move THIS card to next â€” the lifecycle's options
   * narrowed to the ones their role may produce.
   *
   * âš ï¸ A UI CONVENIENCE, NEVER A CONTROL. It exists so the board offers only
   * moves that will succeed. `changeStage` re-derives the whole judgement
   * server-side on every call, because a `<select>` is a suggestion and anyone
   * can send whatever they like (CLAUDE.md Â§8 â€” hidden is not secure).
   */
  allowedStages: string[];
}

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

/**
 * Roles permitted to READ job cards â€” but read WHAT is the interesting part.
 *
 * Three different scopes live behind this one list, and collapsing them would
 * either hide a workshop's own workload or hand a technician the whole book:
 *
 *   Â· workshop staff â€” every job card in their organisation.
 *   Â· `technician`   â€” ONLY the cards assigned to them (`07.txt` pt2 Â§50:
 *                      "ASSIGNED-JOB inspection, diagnosis, repair planning,
 *                      execution, testing", and Â§49's navigation gives them
 *                      "My Assigned Work", not a job list).
 *   Â· `customer`     â€” ONLY the cards raised against their own vehicles.
 *
 * âš ï¸ THIS IS THE PROMISE PHASE 4 MADE. `CAN_READ_VEHICLES` deliberately excludes
 * technicians, with a comment saying a technician gets the customer and vehicle
 * for the JOB THEY ARE ASSIGNED, and that it would arrive "with the job card
 * that can express it". This is that job card. A technician reads a customer
 * name and a registration number through here â€” narrowed by assignment â€” and
 * still cannot list the vehicle register.
 */
const CAN_READ_JOBS = new Set([
  'platform_administrator',
  'workshop_owner',
  'workshop_manager',
  'reception_staff',
  'workshop_supervisor',
  'quality_control_inspector',
  'storekeeper',
  'cashier',
  'technician',
  'customer',
]);

/**
 * Roles permitted to OPEN a job card.
 *
 * `customer` is here because `2.txt` Â§537 has the vehicle owner reporting a
 * problem, and a complaint IS the first stage of the lifecycle
 * (`1.txt` Â§322: "Complaint received"). What a customer may raise one AGAINST
 * is constrained in `create` â€” their own vehicle, and nobody else's.
 *
 * A technician is absent: Â§50 scopes them to work on assigned jobs, not to
 * open them.
 */
const CAN_CREATE_JOB = new Set([
  'platform_administrator',
  'workshop_owner',
  'workshop_manager',
  'reception_staff',
  'customer',
]);

const SELECT_JOB = `
  SELECT j.id, j.job_number, j.customer_id, c.display_name AS customer_name,
         j.vehicle_id, v.registration_number,
         mk.name AS make, md.name AS model, v.model_year,
         j.complaint, j.stage, j.priority,
         j.assigned_technician_id, t.display_name AS technician_name,
         j.expected_completion_on, j.mileage_at_intake, j.opened_at,
         j.stage_changed_at, j.closed_at, prev.to_stage AS resume_stage
    FROM repair.job_cards j
    JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
    JOIN core.vehicles  v ON v.id = j.vehicle_id  AND v.tenant_id = j.tenant_id
    JOIN core.vehicle_makes mk ON mk.id = v.make_id
    LEFT JOIN core.vehicle_models md ON md.id = v.model_id
    -- LEFT: an unassigned card is the normal state at intake, and an inner join
    -- would hide exactly the cards a manager is looking for.
    LEFT JOIN identity.users t ON t.id = j.assigned_technician_id
    -- The stage a HELD card was at before the hold, so the board can offer the
    -- right resume options. A LATERAL rather than a lookup per card: the board
    -- renders every open job at once, and a query per row is the N+1 that makes
    -- a staging board slowest on the busiest day.
    LEFT JOIN LATERAL (
      SELECT e.to_stage
        FROM repair.job_card_stage_events e
       WHERE e.job_card_id = j.id
         -- EXPLICIT, even though migration 009's composite foreign key now makes
         -- a mismatch unstorable (Codex review of this slice). App code is the
         -- first line of defence and the constraint is the last; this repo
         -- requires both, and a predicate written down is what survives someone
         -- later dropping a constraint they think is redundant.
         AND e.tenant_id = j.tenant_id
         AND e.organization_id = j.organization_id
         AND e.to_stage <> 'on_hold'
       ORDER BY e.changed_at DESC
       LIMIT 1
    ) prev ON true`;

/**
 * Job card domain service â€” Phase 5, Release 0.4.
 *
 * `1.txt` Â§322: this domain controls the complete repair lifecycle. Everything
 * later in the phase â€” inspections, diagnoses, quotations, parts, invoices â€”
 * references a job card, so the rules about who may see one live here and are
 * inherited rather than restated.
 */
@Injectable()
export class JobCardService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: TenantContext, filter?: { vehicleId?: string }): Promise<JobCard[]> {
    this.assertMayRead(ctx);
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `${SELECT_JOB}
          WHERE j.tenant_id = $1
            AND j.organization_id = $2
            -- Technician: assigned cards only.
            AND ($3::uuid IS NULL OR j.assigned_technician_id = $3::uuid)
            -- Customer: cards against a customer record linked to them.
            AND ($4::uuid IS NULL OR c.user_id = $4::uuid)
            AND ($5::uuid IS NULL OR j.vehicle_id = $5::uuid)
          ORDER BY j.opened_at DESC`,
        [
          ctx.tenantId,
          ctx.organizationId,
          ctx.activeRole === 'technician' ? ctx.userId : null,
          ctx.activeRole === 'customer' ? ctx.userId : null,
          filter?.vehicleId ?? null,
        ],
      );
      return res.rows.map((row) => this.toDomain(ctx, row as Parameters<JobCardService['toDomain']>[1]));
    });
  }

  /**
   * The Repair Staging Board â€” `02.txt` Â§29.
   *
   * Returns the COLUMNS as well as the cards, deliberately. Â§29's column list is
   * a business definition ("Recommended columns are: Received. Initial
   * Inspection. ...") and several stages share one column, so a front end that
   * held its own copy would be a second statement of the same rule â€” free to
   * drift, and drifting silently, because a card mapped to a column that no
   * longer exists simply disappears from the board while remaining live work.
   *
   * One request rather than two: the board is the screen a manager leaves open
   * all day, and a column list that cannot change between renders should not
   * cost a second round trip.
   */
  async board(ctx: TenantContext): Promise<{
    columns: typeof BOARD_COLUMNS;
    cards: JobCard[];
    viewer: { canOverride: boolean; roleStages: string[] };
  }> {
    // Reuses `list`, so the board inherits the three scopes unchanged: staff see
    // the organisation, a technician sees only cards assigned to them, a
    // customer only their own. A separate query here would be a second place for
    // that narrowing to be forgotten.
    const cards = await this.list(ctx);

    // â”€â”€ why the viewer block exists â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    //
    // `allowedStages` on each card lists the ORDINARY moves. If the board
    // offered only those, `1.txt` Â§394's override would exist in the API and be
    // unreachable from the product â€” an owner could never actually authorise a
    // bypass, which is the one thing Â§394 explicitly provides for.
    //
    // So the board also needs to know whether THIS viewer holds the authority,
    // and which stages their role may produce at all. Both answers come from
    // here rather than from a copy of the role tables in the front end: a
    // second copy would drift, and the direction it drifts is a board offering
    // a move the service refuses.
    return {
      columns: BOARD_COLUMNS,
      cards,
      viewer: {
        canOverride: CAN_OVERRIDE_STAGE.has(ctx.activeRole),
        roleStages: [...(ROLE_TARGET_STAGES[ctx.activeRole] ?? [])],
      },
    };
  }

  async findById(ctx: TenantContext, id: string): Promise<JobCard> {
    this.assertMayRead(ctx);
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `${SELECT_JOB}
          WHERE j.id = $1 AND j.tenant_id = $2 AND j.organization_id = $3
            AND ($4::uuid IS NULL OR j.assigned_technician_id = $4::uuid)
            AND ($5::uuid IS NULL OR c.user_id = $5::uuid)`,
        [
          id,
          ctx.tenantId,
          ctx.organizationId,
          ctx.activeRole === 'technician' ? ctx.userId : null,
          ctx.activeRole === 'customer' ? ctx.userId : null,
        ],
      );
      const row = res.rows[0];
      // 404 rather than 403 â€” the same non-oracle reasoning as everywhere else.
      // A technician probing an unassigned card gets what they would get for an
      // id that does not exist.
      if (!row) throw new NotFoundException('job card not found');
      return this.toDomain(ctx, row);
    });
  }

  /**
   * Open a job card. `1.txt` Â§322 â€” the lifecycle starts at "complaint
   * received", which is what a customer reporting a problem produces.
   */
  async create(
    ctx: TenantContext,
    input: {
      vehicleId: string;
      complaint: string;
      priority?: string;
      expectedCompletionOn?: string;
      mileageAtIntake?: number;
      assignedTechnicianId?: string;
    },
  ): Promise<JobCard> {
    if (!CAN_CREATE_JOB.has(ctx.activeRole)) {
      throw new ForbiddenException(`role '${ctx.activeRole}' may not open a job card`);
    }

    const vehicleId = requireUuid(input.vehicleId, 'vehicleId');
    const complaint = requireText(input.complaint, 'complaint', 4000);
    const priority = optionalOneOf(input.priority, PRIORITIES, 'priority') ?? 'normal';
    const expectedCompletionOn = optionalDate(input.expectedCompletionOn, 'expectedCompletionOn');
    const mileageAtIntake = optionalInt(input.mileageAtIntake, 'mileageAtIntake', 0, 100_000_000);
    const assignedTechnicianId = optionalUuid(input.assignedTechnicianId, 'assignedTechnicianId');

    // A customer may not hand a job to a technician; assignment is the
    // workshop's decision (`07.txt` pt2 Â§47 puts it under the manager).
    if (assignedTechnicianId && ctx.activeRole === 'customer') {
      throw new ForbiddenException('a customer may not assign a technician');
    }

    return this.db.withTenant(ctx, async (client) => {
      // â”€â”€ the vehicle must be one this caller may raise a job against â”€â”€â”€â”€â”€â”€
      //
      // A FOREIGN KEY CANNOT CARRY A TENANT PREDICATE, and it carries no
      // ownership predicate either. `vehicle_id` REFERENCES `core.vehicles(id)`
      // and nothing more, so without this lookup a customer could open a job
      // card against SOMEONE ELSE'S CAR â€” the row would satisfy the FK and the
      // RLS `WITH CHECK`, because both are about the tenant of the row being
      // inserted, not the vehicle it points at.
      //
      // The `c.user_id` clause is what confines a customer to their own
      // vehicles. Staff are not narrowed, only scoped to the organisation.
      const vehicle = await client.query(
        `SELECT v.id, v.customer_id, v.current_mileage_km
           FROM core.vehicles v
           JOIN core.customers c ON c.id = v.customer_id AND c.tenant_id = v.tenant_id
          WHERE v.id = $1 AND v.tenant_id = $2 AND v.organization_id = $3
            AND ($4::uuid IS NULL OR c.user_id = $4::uuid)`,
        [vehicleId, ctx.tenantId, ctx.organizationId, ctx.activeRole === 'customer' ? ctx.userId : null],
      );
      if (vehicle.rows.length === 0) throw new NotFoundException('vehicle not found');

      // The customer is DERIVED from the vehicle, never accepted from the
      // caller. Taking both would allow a job card whose customer does not own
      // its vehicle â€” internally inconsistent in a way no constraint catches,
      // because both ids are individually valid.
      const customerId = vehicle.rows[0].customer_id;

      if (assignedTechnicianId) {
        // The assignee must be an active member of THIS organisation AND hold
        // the technician role.
        //
        // âš ï¸ THE ROLE CHECK IS NOT DECORATION (Codex P2, accepted). Membership
        // alone would let a card be assigned to a cashier or a customer. The
        // column is `assigned_technician_id` and `My Assigned Work` is scoped by
        // it for technicians ONLY â€” so a card assigned to anyone else appears on
        // no technician's list, and the person it was given to has no screen
        // that says it is theirs. The job does not fail loudly; it simply never
        // gets picked up.
        const member = await client.query(
          `SELECT 1 FROM identity.memberships
            WHERE user_id = $1 AND organization_id = $2
              AND status = 'active' AND role_name = 'technician'`,
          [assignedTechnicianId, ctx.organizationId],
        );
        if (member.rows.length === 0) {
          throw new BadRequestException(
            'the assigned user is not an active technician in this organisation',
          );
        }
      }

      const jobNumber = await client.query(`SELECT repair.next_job_number($1) AS n`, [
        ctx.organizationId,
      ]);

      const inserted = await client.query(
        `INSERT INTO repair.job_cards
           (tenant_id, organization_id, branch_id, job_number, customer_id, vehicle_id,
            complaint, priority, assigned_technician_id, expected_completion_on,
            mileage_at_intake, created_by)

codex
The API contract confirms `/job-cards` returns the fields these screens are using, including mileage and stage timestamps. Next I’m checking whether the new pages are reachable through the navigation and whether the test/package setup actually runs the new assertions.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "service-history|service-requests|repair-tracking|repair-proposals|completed-repairs|report-a-problem|my-vehicles" packages apps/customer-web -g "*.ts" -g "*.tsx" -g "*.json"' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content scripts/audit-menu-coverage.mjs -TotalCount 220' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content apps/customer-web/package.json -TotalCount 160' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content packages/auth/src/auth-error-route.test.ts -TotalCount 160' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 1721ms:
{
  "name": "@autoworkshop/customer-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "lint": "next lint --max-warnings 0",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@autoworkshop/auth": "workspace:*",
    "@autoworkshop/design-tokens": "workspace:*",
    "@autoworkshop/navigation": "workspace:*",
    "@autoworkshop/next-shell": "workspace:*",
    "@autoworkshop/ui": "workspace:*",
    "next": "15.1.3",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "@autoworkshop/marketplace-ui": "workspace:*"
  },
  "devDependencies": {
    "@types/react": "^18.3.17",
    "@types/react-dom": "^18.3.5",
    "typescript": "^5.7.2",
    "eslint": "^8.57.1",
    "eslint-config-next": "15.1.3",
    "vitest": "^2.1.9"
  }
}

 succeeded in 1886ms:
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ðŸ”´ `pages.error` IS SET ONCE AND HONOURED BY SEVEN APPS.
 *
 * `workspace-auth.ts` points every workspace's failed sign-in at `/auth/error`.
 * That is a promise made on behalf of apps this file cannot see. An app without
 * the route does not warn, does not fail to build and does not fail to start â€”
 * it 404s the one visitor who already could not sign in, which is strictly worse
 * than the default Auth.js screen the override replaced.
 *
 * The failure is invisible from inside `packages/auth`, invisible to typecheck,
 * and only reachable by a real cold start against a sleeping Keycloak. So it is
 * asserted here, structurally, against the filesystem.
 *
 * âš ï¸ THE APP LIST IS DISCOVERED, NOT LISTED. A hardcoded list of seven would
 * pass forever after somebody adds an eighth app â€” the exact shape of "a check
 * that walks through its own gap" this repo keeps paying for. `apps/` is read at
 * test time, so a new web app is in scope the moment it exists.
 */
describe('the auth error route Auth.js is configured to redirect to', () => {
  const appsDir = join(__dirname, '../../../apps');

  /**
   * A "web app" here means a Next app with an `app/` directory. That excludes
   * `api` (NestJS), `mobile` (Expo), `e2e` (Playwright) and `storybook`, none of
   * which serve `/api/auth/*` and none of which can receive this redirect.
   */
  const webApps = readdirSync(appsDir).filter((name) => {
    const appRouter = join(appsDir, name, 'app');
    return existsSync(appRouter) && statSync(appRouter).isDirectory();
  });

  it('found the web apps to check', () => {
    // Guards the discovery itself. Without this, a wrong path would produce an
    // EMPTY list and every assertion below would pass while proving nothing.
    expect(webApps.length, 'no Next apps found under apps/').toBeGreaterThanOrEqual(7);
    expect(webApps).toContain('workshop-web');
    expect(webApps).toContain('customer-web');
  });

  it.each(webApps)('%s mounts /auth/error', (app) => {
    const page = join(appsDir, app, 'app/auth/error/page.tsx');
    expect(
      existsSync(page),
      `${app} has no app/auth/error/page.tsx â€” a failed sign-in there 404s, because ` +
        'workspace-auth.ts sets pages.error = "/auth/error" for every workspace',
    ).toBe(true);
  });

  it('still has pages.error pointing where these routes are', () => {
    // The other direction: if somebody removes or renames the override, these
    // seven pages become dead code and this suite would happily keep passing.
    const config = readdirSync(__dirname).includes('workspace-auth.ts')
      ? require('node:fs').readFileSync(join(__dirname, 'workspace-auth.ts'), 'utf8')
      : '';
    expect(config).toContain("pages: { error: '/auth/error' }");
  });
});

 succeeded in 1943ms:
/**
 * Menu coverage â€” how much of what a role SEES actually has a page behind it?
 *
 * ðŸ”´ WHY THIS EXISTS. A progress report claimed "99 screens in workshop-web".
 * The owner's reply was that they do not see them at the front end, and they
 * were right: 99 counted every `page.tsx` FILE, including `[id]` detail variants
 * and one screen mounted at several role-tree routes. The honest figure is 61
 * distinct built routes â€” and even that is not what anyone experiences, because
 * the navigation was written from the FULL 11-phase spec while pages are built
 * phase by phase.
 *
 * Measured 2026-08-01: an OWNER sees 64 menu entries and 17 work. Roughly three
 * of every four things they click render a placeholder.
 *
 * âš ï¸ THIS IS NOT THE SAME AS `audit-nav-coverage.mjs`. That one asks "can every
 * role REACH what the API permits" â€” an authorization question, and it exits 1
 * when the answer is no. This one asks "how much of the menu is real" â€” a
 * PROGRESS question with no correct answer, so it never fails a build. Reporting
 * only, deliberately.
 *
 *   node scripts/audit-menu-coverage.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Resolved from this file, not hardcoded â€” Â§0.3.
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const ws = readFileSync(`${ROOT}/packages/navigation/src/workspaces.ts`, 'utf8');

function block(name) {
  const decl = `const ${name}: NavGroup[] = [`;
  const start = ws.indexOf(decl);
  if (start < 0) throw new Error(`not found: ${name}`);
  let i = start + decl.length - 1;
  let depth = 0;
  for (let j = i; j < ws.length; j++) {
    if (ws[j] === '[') depth++;
    else if (ws[j] === ']') {
      depth--;
      if (depth === 0) return ws.slice(i, j + 1);
    }
  }
  return '';
}

function routesIn(src) {
  const out = [];
  const groups = [...src.matchAll(/group\(\s*'([a-z0-9-]+)'/g)].map((m) => ({
    slug: m[1],
    at: m.index,
  }));
  for (let g = 0; g < groups.length; g++) {
    const body = src.slice(groups[g].at, g + 1 < groups.length ? groups[g + 1].at : src.length);
    for (const m of body.matchAll(/\[\s*'([a-z0-9-]+)'\s*,\s*'[^']*'/g)) {
      out.push(`/${groups[g].slug}/${m[1]}`);
    }
  }
  return out;
}

// Every real page route in an app.
//
// ðŸ”´ `(app)` AND FRIENDS ARE ROUTE GROUPS, NOT PATH SEGMENTS. Next.js strips a
// parenthesised directory from the URL â€” `app/(app)/home/dashboard/page.tsx`
// serves `/home/dashboard`, not `/(app)/home/dashboard`. Counting them as
// segments makes every route in an app that uses them look unbuilt, which is
// how customer-web measured 0 of 35 while six of those screens were shipped and
// working. `check-page-gates.sh` mis-reads the same directories (issue D4).
function walkApp(appDir) {
  const pages = new Set();
  (function walk(dir, prefix = '') {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) {
        if (e.startsWith('[') || e.startsWith('_')) continue;
        if (e.startsWith('(') && e.endsWith(')')) {
          walk(p, prefix); // route group: contributes no path segment
          continue;
        }
        walk(p, `${prefix}/${e}`);
      } else if (e === 'page.tsx' && prefix) {
        pages.add(prefix);
      }
    }
  })(appDir);
  return pages;
}

// âš ï¸ THE APP MATTERS. A role's tree is served by ONE app, and looking a
// customer route up in workshop-web's page list answers a question nobody
// asked. Until this was split, only workshop-web was measured at all, so the
// customer workspace â€” a whole seventh of the product â€” had never appeared in
// a coverage number.
const TREES = {
  'DEFAULT Â§34 (supervisor, QC, storekeeper, cashier, platform admin)': ['workshopGroups', 'workshop-web'],
  'OWNER Â§46': ['workshopOwnerGroups', 'workshop-web'],
  'MANAGER Â§47': ['workshopManagerGroups', 'workshop-web'],
  'RECEPTION Â§48': ['workshopReceptionGroups', 'workshop-web'],
  'TECHNICIAN Â§49': ['workshopTechnicianGroups', 'workshop-web'],
  'CUSTOMER Â§33': ['customerGroups', 'customer-web'],
};

const pagesByApp = new Map();
function pagesFor(app) {
  if (!pagesByApp.has(app)) pagesByApp.set(app, walkApp(join(ROOT, `apps/${app}/app`)));
  return pagesByApp.get(app);
}

console.log('WHAT EACH ROLE SEES IN ITS MENU vs WHAT HAS A PAGE BEHIND IT\n');

let totalAdvertised = 0;
const deadEverywhere = new Map();

for (const [label, [blockName, app]] of Object.entries(TREES)) {
  const pages = pagesFor(app);
  const routes = routesIn(block(blockName));
  const built = routes.filter((r) => pages.has(r));
  const dead = routes.filter((r) => !pages.has(r));
  totalAdvertised += routes.length;
  // Keyed by app as well as route: `/home/dashboard` exists in both apps and is
  // a different screen in each. Merging them would hide one behind the other.
  for (const d of dead) {
    const k = `${app}${d}`;
    deadEverywhere.set(k, (deadEverywhere.get(k) ?? 0) + 1);
  }
  const pct = Math.round((built.length / routes.length) * 100);
  console.log(
    `  ${label}  (${app})\n     ${routes.length} menu entries Â· ${built.length} built (${pct}%) Â· ${dead.length} land on "not built yet"\n`,
  );
}

for (const [app, pages] of pagesByApp) console.log(`  ${app} has ${pages.size} real page routes`);
console.log();

console.log(`\nDistinct menu entries with NO page anywhere: ${deadEverywhere.size}`);
// `--all` prints every one. A 12-line sample is fine for a progress read, but
// BUILDING them needs the whole list â€” and re-deriving it by hand is exactly
// how a sweep misses the entries nobody happened to paste into a chat.
const showAll = process.argv.includes('--all');
console.log(showAll ? '\nEvery one of them:' : '\nA few of them:');
const dead = [...deadEverywhere.keys()];
(showAll ? dead : dead.slice(0, 12)).forEach((d) => console.log(`  ${d}`));

// Reporting only: menu coverage is a progress measure, not a correctness one.
// A build must never fail because a later phase has not been written yet.
process.exit(0);

 succeeded in 2019ms:
apps/customer-web\app\_screens\service-history-screen.tsx:8: * /my-vehicles/service-history — `01 (1).txt` §33.
apps/customer-web\app\_screens\service-history-screen.tsx:10: * ── WHY THIS IS NOT JUST `completed-repairs` WITH A DIFFERENT TITLE ─────────
apps/customer-web\app\_screens\service-history-screen.tsx:12: * `completed-repairs` answers "what work has this workshop finished for me",
apps/customer-web\app\_screens\add-vehicle-screen.tsx:89:        successHref={{ href: '/my-vehicles/garage', label: 'View your garage' }}
apps/customer-web\app\_screens\add-vehicle-actions.ts:74:  revalidatePath('/my-vehicles/garage');
apps/customer-web\app\_screens\repair-journey-screen.tsx:16: *   /service-and-repairs/service-requests    every request, newest first
apps/customer-web\app\_screens\repair-journey-screen.tsx:17: *   /service-and-repairs/repair-tracking     the ones still open
apps/customer-web\app\_screens\repair-journey-screen.tsx:18: *   /service-and-repairs/repair-proposals    the ones waiting on the customer
apps/customer-web\app\_screens\repair-journey-screen.tsx:19: *   /service-and-repairs/completed-repairs   the ones that are done
apps/customer-web\app\_screens\repair-journey-screen.tsx:172:          <Link href="/service-and-repairs/repair-proposals">See what is needed</Link>
apps/customer-web\app\_screens\dashboard-screen.tsx:148:          <Link href="/my-vehicles/garage">Open your garage</Link>
apps/customer-web\app\(app)\service-and-repairs\service-requests\page.tsx:5: * /service-and-repairs/service-requests — `01 (1).txt` §33, the customer workspace.
apps/customer-web\app\(app)\service-and-repairs\service-requests\page.tsx:11: * reasoning as `/my-vehicles/garage`, where Codex corrected the opposite claim.
apps/customer-web\app\(app)\service-and-repairs\service-requests\page.tsx:20:  await requireNavRoute('customer', '/service-and-repairs/service-requests');
apps/customer-web\app\(app)\service-and-repairs\report-a-problem\page.tsx:5: * /service-and-repairs/report-a-problem — `01 (1).txt` §33.
apps/customer-web\app\(app)\service-and-repairs\report-a-problem\page.tsx:18:  await requireNavRoute('customer', '/service-and-repairs/report-a-problem');
apps/customer-web\app\(app)\service-and-repairs\repair-tracking\page.tsx:5: * /service-and-repairs/repair-tracking — `01 (1).txt` §33, the customer workspace.
apps/customer-web\app\(app)\service-and-repairs\repair-tracking\page.tsx:11: * reasoning as `/my-vehicles/garage`, where Codex corrected the opposite claim.
apps/customer-web\app\(app)\service-and-repairs\repair-tracking\page.tsx:20:  await requireNavRoute('customer', '/service-and-repairs/repair-tracking');
apps/customer-web\app\(app)\service-and-repairs\repair-proposals\page.tsx:5: * /service-and-repairs/repair-proposals — `01 (1).txt` §33, the customer workspace.
apps/customer-web\app\(app)\service-and-repairs\repair-proposals\page.tsx:11: * reasoning as `/my-vehicles/garage`, where Codex corrected the opposite claim.
apps/customer-web\app\(app)\service-and-repairs\repair-proposals\page.tsx:20:  await requireNavRoute('customer', '/service-and-repairs/repair-proposals');
apps/customer-web\app\(app)\service-and-repairs\completed-repairs\page.tsx:5: * /service-and-repairs/completed-repairs — `01 (1).txt` §33, the customer workspace.
apps/customer-web\app\(app)\service-and-repairs\completed-repairs\page.tsx:11: * reasoning as `/my-vehicles/garage`, where Codex corrected the opposite claim.
apps/customer-web\app\(app)\service-and-repairs\completed-repairs\page.tsx:20:  await requireNavRoute('customer', '/service-and-repairs/completed-repairs');
apps/customer-web\app\(app)\my-vehicles\service-history\page.tsx:2:import { ServiceHistoryScreen } from '../../../_screens/service-history-screen';
apps/customer-web\app\(app)\my-vehicles\service-history\page.tsx:5: * /my-vehicles/service-history — `01 (1).txt` §33, the customer workspace.
apps/customer-web\app\(app)\my-vehicles\service-history\page.tsx:8: * not authentication — see `/my-vehicles/garage` for the full reasoning. The
apps/customer-web\app\(app)\my-vehicles\service-history\page.tsx:15:  await requireNavRoute('customer', '/my-vehicles/service-history');
apps/customer-web\app\(app)\my-vehicles\garage\page.tsx:5: * /my-vehicles/garage — `01 (1).txt` §33, the customer workspace.
apps/customer-web\app\(app)\my-vehicles\garage\page.tsx:32:  await requireNavRoute('customer', '/my-vehicles/garage');
apps/customer-web\app\(app)\my-vehicles\add-vehicle\page.tsx:5: * /my-vehicles/add-vehicle — `01 (1).txt` §33.
apps/customer-web\app\(app)\my-vehicles\add-vehicle\page.tsx:18:  await requireNavRoute('customer', '/my-vehicles/add-vehicle');
packages\navigation\src\workspaces.ts:56:  group('my-vehicles', 'My Vehicles', 'car', [
packages\navigation\src\workspaces.ts:61:    ['service-history', 'Service History'],
packages\navigation\src\workspaces.ts:64:    ['report-a-problem', 'Report a Problem'],
packages\navigation\src\workspaces.ts:65:    ['service-requests', 'Service Requests'],
packages\navigation\src\workspaces.ts:67:    ['repair-proposals', 'Repair Proposals', { counterKey: 'customer.proposals.pending' }],
packages\navigation\src\workspaces.ts:68:    ['repair-tracking', 'Repair Tracking'],
packages\navigation\src\workspaces.ts:69:    ['completed-repairs', 'Completed Repairs'],
packages\navigation\src\workspaces.ts:321:    ['service-requests', 'Service Requests'],
packages\navigation\src\workspaces.ts:324:    ['completed-repairs', 'Completed Repairs'],

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content pnpm-workspace.yaml -TotalCount 120' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content package.json -TotalCount 220' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "StatusKind|statusVar|attention|blocked|complete|draft|active" packages/design-tokens/src -g "*.ts"' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content packages/navigation/src/workspaces.ts -TotalCount 100' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 828ms:
# Workspace layout per COMBINED_PLAN_v2 Â§3.
# python-packages/ is deliberately NOT here â€” it is a pip workspace (Â§0.3),
# and MCP is the only boundary between the TypeScript and Python halves.
packages:
  - "apps/*"
  - "apps/mcp-servers/*"
  - "packages/*"

 succeeded in 970ms:
packages/design-tokens/src\themes.ts:119: * Lets StatusBadge stay driven by `StatusKind` while following the active
packages/design-tokens/src\themes.ts:122:export const statusVar = {
packages/design-tokens/src\themes.ts:123:  draft: 'var(--aw-status-draft)',
packages/design-tokens/src\themes.ts:124:  active: 'var(--aw-status-active)',
packages/design-tokens/src\themes.ts:125:  complete: 'var(--aw-status-complete)',
packages/design-tokens/src\themes.ts:126:  attention: 'var(--aw-status-attention)',
packages/design-tokens/src\themes.ts:127:  blocked: 'var(--aw-status-blocked)',
packages/design-tokens/src\index.ts:41:  draft:     primitive.color.grey[500],   // draft, disabled, archived, unavailable
packages/design-tokens/src\index.ts:42:  active:    primitive.color.blue[600],   // normal action, active navigation
packages/design-tokens/src\index.ts:43:  complete:  primitive.color.green[600],  // completed, verified, paid, passed
packages/design-tokens/src\index.ts:44:  attention: primitive.color.amber[600],  // attention required, pending, conditional
packages/design-tokens/src\index.ts:45:  blocked:   primitive.color.red[600],    // failed, blocked, unsafe, overdue, critical
packages/design-tokens/src\index.ts:48:export type StatusKind = keyof typeof statusColor;
packages/design-tokens/src\index.ts:67:  statusVar,

 succeeded in 1055ms:
/**
 * Per-workspace side-navigation trees.
 *
 * TRANSCRIBED, NOT DESIGNED. Every group and every item below comes from
 * `autoworkshop 01 (1).txt`:
 *   Â§33 Customer Â· Â§34 Workshop Â· Â§35 Supplier
 * Labels are the spec's labels. Order is the spec's order. If you think an
 * item is missing, check the spec before adding it â€” and if the spec really is
 * missing something, change the spec first. The owner rejected all scope cuts
 * (CLAUDE.md Â§4), so items are never dropped here for convenience.
 *
 * `href`s follow one rule: `/<group-id>/<item-id>`, with the group's first item
 * doubling as the group landing page. That keeps route files mechanically
 * derivable from this tree instead of hand-maintained in parallel.
 */

import type { NavGroup, RoleId, Workspace } from './types';

/** Build an item whose href follows the `/group/item` convention. */
function item(
  groupId: string,
  id: string,
  label: string,
  extra: { permission?: string; counterKey?: string; warningKey?: string } = {},
): NavGroup['items'][number] {
  return { id, label, href: `/${groupId}/${id}`, ...extra };
}

/** Build a group, wiring each item's href to the group id. */
function group(
  id: string,
  label: string,
  icon: string,
  items: Array<[string, string] | [string, string, { permission?: string; counterKey?: string; warningKey?: string }]>,
  permission?: string,
): NavGroup {
  return {
    id,
    label,
    icon,
    permission,
    items: items.map(([itemId, itemLabel, extra]) => item(id, itemId, itemLabel, extra ?? {})),
  };
}

/* ------------------------------------------------------------------ *
 * Â§33 â€” CUSTOMER WORKSPACE
 * ------------------------------------------------------------------ */

const customerGroups: NavGroup[] = [
  group('home', 'Home', 'home', [
    ['dashboard', 'Dashboard'],
    ['my-tasks', 'My Tasks', { counterKey: 'customer.tasks.open' }],
    ['notifications', 'Notifications', { counterKey: 'customer.notifications.unread' }],
  ]),
  group('my-vehicles', 'My Vehicles', 'car', [
    ['garage', 'Vehicle Garage'],
    ['add-vehicle', 'Add Vehicle'],
    ['documents', 'Vehicle Documents'],
    ['maintenance-schedule', 'Maintenance Schedule'],
    ['service-history', 'Service History'],
  ]),
  group('service-and-repairs', 'Service and Repairs', 'wrench', [
    ['report-a-problem', 'Report a Problem'],
    ['service-requests', 'Service Requests'],
    ['appointments', 'Appointments'],
    ['repair-proposals', 'Repair Proposals', { counterKey: 'customer.proposals.pending' }],
    ['repair-tracking', 'Repair Tracking'],
    ['completed-repairs', 'Completed Repairs'],
  ]),
  group('parts-and-warranty', 'Parts and Warranty', 'cog', [
    ['installed-parts', 'Installed Parts'],
    // âš ï¸ NOT IN Â§33 â€” ADDED 2026-07-31 FOR THE MARKETPLACE (migrations 022/023).
    // âœ… **OWNER-APPROVED 2026-07-31.** CLAUDE.md's prohibited list includes
    // "changing approved navigation without review"; this was raised for that
    // review and the owner approved it. The note stays because the REASON is
    // what a future reader needs â€” a bare approval with no rationale is how the
    // next person justifies the next unreviewed addition.
    //
    // The justification: Â§33 was written before the public parts marketplace
    // existed, so it has no item for a customer's own parts orders. Without a
    // nav entry the screen is unreachable â€” `requireNavRoute` resolves a path
    // against the viewer's VISIBLE navigation, so a page no tree points at is a
    // page nobody can open. The alternative considered and rejected was
    // overloading `installed-parts`, which means something else entirely: parts
    // fitted to your vehicle by a workshop, not parts you bought yourself.
    //
    // Placed in this group rather than a new one, so the change is one ITEM and
    // not a new top-level shape.
    ['parts-orders', 'My Parts Orders'],
    ['product-recommendations', 'Product Recommendations'],
    ['warranty', 'Warranty'],
    ['warranty-claims', 'Warranty Claims'],
  ]),
  group('communication', 'Communication', 'chat', [
    ['messages', 'Messages', { counterKey: 'customer.messages.unread' }],
    ['voice-calls', 'Voice Calls'],
    ['video-consultations', 'Video Consultations'],
    ['shared-files', 'Shared Files'],
  ]),

 succeeded in 1072ms:
{
  "name": "autoworkshop-ai",
  "version": "0.1.0",
  "private": true,
  "description": "AutoWorkshop AI \u2014 AI-powered automotive service, repair and workshop operating system",
  "packageManager": "pnpm@9.15.4",
  "engines": {
    "node": ">=20.19.0 <21",
    "pnpm": ">=9 <10"
  },
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "clean": "turbo run clean && rm -rf node_modules",
    "infra:up": "docker compose -f infrastructure/docker/docker-compose.yml up -d",
    "infra:down": "docker compose -f infrastructure/docker/docker-compose.yml down",
    "infra:logs": "docker compose -f infrastructure/docker/docker-compose.yml logs -f"
  },
  "devDependencies": {
    "turbo": "^2.3.3",
    "typescript": "^5.7.2",
    "@types/node": "^20.17.10",
    "prettier": "^3.4.2"
  }
}

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content packages/next-shell/vitest.config.ts -TotalCount 120' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content packages/ui/vitest.config.ts -TotalCount 120' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "vitest.config|test:" apps packages -g "package.json" -g "vitest.config.ts"' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content packages/auth/vitest.config.ts -TotalCount 120' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 1022ms:
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // BOTH suffixes, deliberately. The packages settled on `.test.ts` and
    // `apps/api` on `.spec.ts`, and NOTHING enforced which one you were in â€” a
    // file named with the other convention was silently never collected, and a
    // suite that runs zero tests still exits 0. This repo lost two days to
    // exactly that (`pnpm e2e` green while collecting nothing), so the include
    // accepts either rather than depending on everyone remembering which
    // directory they are in.
    include: ['src/**/*.{test,spec}.ts'],
    environment: 'node',
    // Same Windows workaround as apps/api: the default worker-thread pool
    // produces "Timeout calling resolveSnapshotPath" and multi-minute runs on
    // this platform. Forks are stable and finish in seconds.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 10_000,
    hookTimeout: 10_000,
    reporters: ['default'],
  },
});

 succeeded in 1038ms:
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // BOTH suffixes, deliberately. The packages settled on `.test.ts` and
    // `apps/api` on `.spec.ts`, and NOTHING enforced which one you were in â€” a
    // file named with the other convention was silently never collected, and a
    // suite that runs zero tests still exits 0. This repo lost two days to
    // exactly that (`pnpm e2e` green while collecting nothing), so the include
    // accepts either rather than depending on everyone remembering which
    // directory they are in.
    include: ['src/**/*.{test,spec}.ts'],
    environment: 'node',
    // Same Windows workaround as apps/api: the default worker-thread pool
    // produces "Timeout calling resolveSnapshotPath" and multi-minute runs on
    // this platform. Forks are stable and finish in seconds.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 10_000,
    hookTimeout: 10_000,
    reporters: ['default'],
  },
});

 succeeded in 1037ms:
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // BOTH suffixes, deliberately. The packages settled on `.test.ts` and
    // `apps/api` on `.spec.ts`, and NOTHING enforced which one you were in â€” a
    // file named with the other convention was silently never collected, and a
    // suite that runs zero tests still exits 0. This repo lost two days to
    // exactly that (`pnpm e2e` green while collecting nothing), so the include
    // accepts either rather than depending on everyone remembering which
    // directory they are in.
    include: ['src/**/*.{test,spec}.ts'],
    environment: 'node',
    // Same Windows workaround as apps/api and packages/next-shell: the default
    // worker-thread pool produces "Timeout calling resolveSnapshotPath" and
    // multi-minute runs on this platform. Forks are stable and finish in seconds.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 10_000,
    hookTimeout: 10_000,
    reporters: ['default'],
  },
});

 succeeded in 1047ms:
packages\ui\vitest.config.ts:1:import { defineConfig } from 'vitest/config';
packages\ui\vitest.config.ts:4:  test: {
packages\next-shell\vitest.config.ts:1:import { defineConfig } from 'vitest/config';
packages\next-shell\vitest.config.ts:4:  test: {
packages\auth\vitest.config.ts:1:import { defineConfig } from 'vitest/config';
packages\auth\vitest.config.ts:4:  test: {
apps\api\vitest.config.ts:1:import { defineConfig } from 'vitest/config';
apps\api\vitest.config.ts:4:  test: {

codex
Navigation does include the new customer routes, so the route gates are at least pointing at real menu entries. One issue I’m checking now is whether the auth error screen is valid under Next’s server/client component rules, because that file uses browser APIs inside a component exported from a shared package.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content packages/next-shell/package.json -TotalCount 180' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"use client|dangerouslySetInnerHTML|sessionStorage|window\\.location|AuthErrorScreen\" packages/next-shell apps -g \"*.tsx\" -g \"*.ts\"" in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "serverExternalPackages|transpilePackages|@autoworkshop/next-shell" apps/*/next.config.* apps/*/package.json' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content packages/next-shell/src/index.ts -TotalCount 120' in C:\Users\USER\Documents\autoworkshop-ai
 exited 1 in 1193ms:
rg: apps/*/next.config.*: The filename, directory name, or volume label syntax is incorrect. (os error 123)
rg: apps/*/package.json: The filename, directory name, or volume label syntax is incorrect. (os error 123)

2026-08-04T12:51:03.766179Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 1.2 seconds
Output:
rg: apps/*/next.config.*: The filename, directory name, or volume label syntax is incorrect. (os error 123)
rg: apps/*/package.json: The filename, directory name, or volume label syntax is incorrect. (os error 123)

 succeeded in 1402ms:
packages/next-shell\src\WorkspaceShell.tsx:1:'use client';
apps\fleet-web\app\layout.tsx:49:        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
packages/next-shell\src\ViewerSwitchers.tsx:25: * ⚠️ A SERVER COMPONENT WITH NO `'use client'`, DELIBERATELY. It reads the
apps\fleet-web\app\auth\error\page.tsx:1:import { AuthErrorScreen } from '@autoworkshop/next-shell';
apps\fleet-web\app\auth\error\page.tsx:23:  return <AuthErrorScreen error={error} />;
packages/next-shell\src\viewer-contract.ts:4:// for what happened the last time a pure function lived in a `'use client'`
packages/next-shell\src\RoleSwitcher.tsx:1:'use client';
packages/next-shell\src\role-label.ts:4: * ⚠️ IN ITS OWN MODULE, WITH NO `'use client'`, AND THAT IS THE ENTIRE REASON
packages/next-shell\src\OrganizationSwitcher.tsx:1:'use client';
packages/next-shell\src\index.ts:46:// 'use client' module — see role-label.ts.
packages/next-shell\src\index.ts:79:export { AuthErrorScreen } from './AuthErrorScreen';
packages/next-shell\src\index.ts:80:export type { AuthErrorScreenProps } from './AuthErrorScreen';
packages/next-shell\src\AuthErrorScreen.tsx:77:export interface AuthErrorScreenProps {
packages/next-shell\src\AuthErrorScreen.tsx:84:export function AuthErrorScreen({ error, signInHref = '/api/auth/signin' }: AuthErrorScreenProps) {
packages/next-shell\src\AuthErrorScreen.tsx:186:        dangerouslySetInnerHTML={{
packages/next-shell\src\AuthErrorScreen.tsx:201:      if (!sessionStorage.getItem('aw-auth-retried')) {
packages/next-shell\src\AuthErrorScreen.tsx:202:        sessionStorage.setItem('aw-auth-retried', '1');
packages/next-shell\src\AuthErrorScreen.tsx:203:        window.location.href = link.getAttribute('href');
packages/next-shell\src\ActingAsControl.tsx:31: * ⚠️ A SERVER COMPONENT WITH NO `'use client'`, like `ViewerSwitchers`. It
packages/next-shell\src\ActingAsControl.tsx:52: * **Adding `'use client'` to this file would silently remove the role from the
packages/next-shell\src\AccountControl.tsx:1:'use client';
apps\customer-web\app\_screens\basket-panel.tsx:1:'use client';
apps\admin-web\app\_screens\catalogue-review-controls.tsx:1:'use client';
apps\customer-web\app\_public\add-to-basket.tsx:1:'use client';
apps\customer-web\app\layout.tsx:48:        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
apps\customer-web\app\auth\error\page.tsx:1:import { AuthErrorScreen } from '@autoworkshop/next-shell';
apps\customer-web\app\auth\error\page.tsx:23:  return <AuthErrorScreen error={error} />;
apps\admin-web\app\layout.tsx:64:        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
apps\insurance-web\app\layout.tsx:49:        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
apps\insurance-web\app\auth\error\page.tsx:1:import { AuthErrorScreen } from '@autoworkshop/next-shell';
apps\insurance-web\app\auth\error\page.tsx:23:  return <AuthErrorScreen error={error} />;
apps\workshop-web\app\_screens\variation-forms.tsx:1:'use client';
apps\workshop-web\app\_screens\testing-record-form.tsx:1:'use client';
apps\workshop-web\app\_screens\testing-labels.ts:4: * A SEPARATE, PURE MODULE, the discipline every slice here follows: a `'use client'`
apps\workshop-web\app\_screens\start-test-session-form.tsx:1:'use client';
apps\workshop-web\app\_screens\start-repair-plan-form.tsx:1:'use client';
apps\workshop-web\app\_screens\start-repair-form.tsx:1:'use client';
apps\workshop-web\app\_screens\start-inspection-form.tsx:1:'use client';
apps\workshop-web\app\_screens\start-diagnosis-form.tsx:1:'use client';
apps\workshop-web\app\_screens\stage-move-form.tsx:1:'use client';
apps\workshop-web\app\_screens\repair-plan-review-form.tsx:1:'use client';
apps\workshop-web\app\_screens\repair-plan-labels.ts:6: * is an async server component; a `'use client'` form importing a constant out of it
apps\workshop-web\app\_screens\repair-plan-builder-form.tsx:1:'use client';
apps\workshop-web\app\_screens\register-actions.ts:12: * gains `'use client'`, at which point the credential handling below would run
apps\workshop-web\app\_screens\quotation-review-form.tsx:1:'use client';
apps\workshop-web\app\_screens\quotation-labels.ts:6: * `repair-plan-labels.ts`: a `'use client'` form importing a constant out of a server
apps\workshop-web\app\_screens\quotation-editor-form.tsx:1:'use client';
apps\admin-web\app\auth\error\page.tsx:1:import { AuthErrorScreen } from '@autoworkshop/next-shell';
apps\admin-web\app\auth\error\page.tsx:23:  return <AuthErrorScreen error={error} />;
apps\workshop-web\app\layout.tsx:69:        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
apps\workshop-web\app\_screens\quality-form.tsx:1:'use client';
apps\workshop-web\app\_screens\proposal-narrative-form.tsx:1:'use client';
apps\workshop-web\app\_screens\proposal-labels.ts:4: * A SEPARATE, PURE MODULE, the discipline every slice here follows: a `'use client'`
apps\workshop-web\app\_screens\proposal-decision-form.tsx:1:'use client';
apps\workshop-web\app\_screens\pricing-form.tsx:1:'use client';
apps\workshop-web\app\_screens\prepare-quotation-form.tsx:1:'use client';
apps\workshop-web\app\_screens\prepare-proposal-form.tsx:1:'use client';
apps\workshop-web\app\_screens\inspection-sheet-form.tsx:1:'use client';
apps\workshop-web\app\_screens\inspection-labels.ts:5: * async server component; a `'use client'` form importing a constant from it
apps\workshop-web\app\_screens\execution-work-form.tsx:1:'use client';
apps\workshop-web\app\_screens\execution-labels.ts:4: * A SEPARATE, PURE MODULE, the discipline every slice here follows: a `'use client'`
apps\workshop-web\app\_screens\directory-controls.tsx:1:'use client';
apps\workshop-web\app\_screens\diagnosis-review-form.tsx:1:'use client';
apps\workshop-web\app\_screens\diagnosis-labels.ts:6: * component; a `'use client'` form importing a constant out of it would drag that
apps\workshop-web\app\_screens\diagnosis-findings-form.tsx:1:'use client';
apps\towing-web\app\layout.tsx:49:        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
apps\towing-web\app\auth\error\page.tsx:1:import { AuthErrorScreen } from '@autoworkshop/next-shell';
apps\towing-web\app\auth\error\page.tsx:23:  return <AuthErrorScreen error={error} />;
apps\workshop-web\app\auth\error\page.tsx:1:import { AuthErrorScreen } from '@autoworkshop/next-shell';
apps\workshop-web\app\auth\error\page.tsx:23:  return <AuthErrorScreen error={error} />;
apps\supplier-web\app\_screens\order-controls.tsx:1:'use client';
apps\supplier-web\app\_screens\catalogue-controls.tsx:1:'use client';
apps\supplier-web\app\layout.tsx:49:        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
apps\supplier-web\app\auth\error\page.tsx:1:import { AuthErrorScreen } from '@autoworkshop/next-shell';
apps\supplier-web\app\auth\error\page.tsx:23:  return <AuthErrorScreen error={error} />;

 succeeded in 1492ms:
{
  "name": "@autoworkshop/next-shell",
  "version": "0.1.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "@autoworkshop/auth": "workspace:*",
    "@autoworkshop/design-tokens": "workspace:*",
    "@autoworkshop/navigation": "workspace:*",
    "@autoworkshop/ui": "workspace:*"
  },
  "peerDependencies": {
    "next": "^15.1.3",
    "react": "^18.3.1"
  },
  "scripts": {
    "lint": "eslint src --ext .ts,.tsx --max-warnings 0",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests"
  },
  "devDependencies": {
    "@autoworkshop/config": "workspace:*",
    "@types/react": "^18.3.17",
    "@typescript-eslint/eslint-plugin": "^8.18.1",
    "@typescript-eslint/parser": "^8.18.1",
    "eslint": "^8.57.1",
    "next": "15.1.3",
    "react": "18.3.1",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}

 succeeded in 1561ms:
export { AccountControl } from './AccountControl';
export type { AccountControlProps } from './AccountControl';
export { WorkspaceShell } from './WorkspaceShell';
export type { WorkspaceShellProps } from './WorkspaceShell';
export { renderModulePage } from './ModulePage';
export { currentViewer, viewerGrants, viewerRole } from './viewer';

/**
 * The PURE half of the viewer contract, re-exported so consumers that cannot
 * run in a Next server runtime â€” the Playwright journey, Storybook, unit tests â€”
 * can reason about a viewer without importing `next/headers`. Importing
 * `./viewer` from those contexts fails at module load, and the usual repair is
 * to hardcode the expected values, at which point the test stops testing the
 * model it is meant to guard.
 */
export {
  grantsFor,
  navRoleFor,
  viewerLabels,
  NO_GRANTS,
  organizationsFromMemberships,
  rolesFromMemberships,
  holdsRoleInActiveOrganization,
} from './viewer-contract';
export { viewerHasSession } from './viewer';
export { hasWorkspaceAccess, WorkspaceAccessDenied } from './WorkspaceGate';
export { requireWorkspaceAccess } from './require-access';
export { requireNavRoute } from './require-route';
/**
 * Resolves an "Add new â€¦" target out of the viewer's OWN visible navigation,
 * so a create button can never point somewhere its owner would be refused.
 */
export { quickCreateHref } from './quick-create';
export { apiGet, apiPost, apiPut, apiPatch, apiDelete, describeApiFailure } from './api';
export { ApiFailure } from './ApiFailure';
export { OrganizationSwitcher } from './OrganizationSwitcher';
export type { OrganizationOption } from './OrganizationSwitcher';
export { setActiveOrganizationAction } from './set-organization-action';
export { activeOrganizationId, ACTIVE_ORG_COOKIE } from './active-organization';
export type { ApiResult } from './api';
export type { ViewerDescription, ViewerLabels } from './viewer-contract';

// Role switcher â€” one login acting as any role it holds, without signing out.
export { RoleSwitcher } from './RoleSwitcher';
// Server-safe: a pure string helper the app LAYOUT calls. Must not live in a
// 'use client' module â€” see role-label.ts.
export { roleLabel } from './role-label';
export type { RoleOption } from './RoleSwitcher';
export { setActiveRoleAction, setActiveRoleFromFormAction } from './set-role-action';
/**
 * The organisation switcher as a server component, so all seven app layouts
 * mount the identical control instead of each keeping its own copy.
 */
export { ViewerSwitchers } from './ViewerSwitchers';
/**
 * The role control for the top-RIGHT cluster â€” the switcher when the viewer
 * holds several roles, and `null` when they hold one so `TopNav` shows its
 * read-only "Acting as" chip instead. Owner request 2026-08-03: the role must
 * be visible to every signed-in user, not only to the few holding two.
 */
export { ActingAsControl } from './ActingAsControl';
export { activeRoleName, ACTIVE_ROLE_COOKIE } from './active-role';
export { activeRoleHeader } from './viewer';

/**
 * "Do I belong to a workshop yet?" â€” answerable for a user `/me` cannot
 * describe, because `/me` is behind TenantGuard and 401s for somebody who has
 * signed up but joined nothing. See registration.ts for why that distinction
 * matters more than it looks.
 */
export { registrationStatus, needsWorkshop } from './registration';
export type { RegistrationStatus } from './registration';

/**
 * The page Auth.js sends a failed sign-in to â€” wired up by `pages.error` in
 * `workspace-auth.ts`. Every app must mount it at `/auth/error`, or that
 * redirect 404s and the visitor is worse off than with Auth.js's default.
 */
export { AuthErrorScreen } from './AuthErrorScreen';
export type { AuthErrorScreenProps } from './AuthErrorScreen';

codex
That auth screen is server-rendered but the browser-only calls are inside a literal `<script>`, so that part is not automatically a Next component violation. I’m now looking for more concrete breakage: TypeScript type errors, package dependencies, and tests that may have been placed where the runner will not collect them.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content packages/design-tokens/src/primitive.ts -TotalCount 220' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git diff HEAD~1..HEAD -- packages/design-tokens/src/primitive.ts packages/marketplace-ui/src/marketplace-landing.tsx apps/customer-web/package.json' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content apps/customer-web/tsconfig.json -TotalCount 220' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-ChildItem apps -Directory | ForEach-Object { Get-ChildItem $_.FullName -Filter next.config.* -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName } }' in C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-ChildItem apps -Directory | ForEach-Object { Get-ChildItem $_.FullName -Filter next.config.* -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName } }'` rejected: blocked by policy
2026-08-04T12:51:22.002763Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-ChildItem apps -Directory | ForEach-Object { Get-ChildItem $_.FullName -Filter next.config.* -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName } }'` rejected: blocked by policy
 succeeded in 781ms:
diff --git a/apps/customer-web/package.json b/apps/customer-web/package.json
index aaf3237..2e8ed65 100644
--- a/apps/customer-web/package.json
+++ b/apps/customer-web/package.json
@@ -8,7 +8,7 @@
     "start": "next start -p 3000",
     "lint": "next lint --max-warnings 0",
     "typecheck": "tsc --noEmit",
-    "test": "echo 'no tests yet'"
+    "test": "vitest run"
   },
   "dependencies": {
     "@autoworkshop/auth": "workspace:*",
@@ -26,6 +26,7 @@
     "@types/react-dom": "^18.3.5",
     "typescript": "^5.7.2",
     "eslint": "^8.57.1",
-    "eslint-config-next": "15.1.3"
+    "eslint-config-next": "15.1.3",
+    "vitest": "^2.1.9"
   }
 }
diff --git a/packages/design-tokens/src/primitive.ts b/packages/design-tokens/src/primitive.ts
index c27f8d0..1cbac1f 100644
--- a/packages/design-tokens/src/primitive.ts
+++ b/packages/design-tokens/src/primitive.ts
@@ -20,9 +20,21 @@ export const primitive = {
               400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 700: '#374151',
               800: '#1f2937', 900: '#111827' },
   },
-  space: { 0: '0', 1: '0.25rem', 2: '0.5rem', 3: '0.75rem', 4: '1rem',
-           6: '1.5rem', 8: '2rem', 12: '3rem', 16: '4rem' },
-  radius: { none: '0', sm: '0.25rem', md: '0.375rem', lg: '0.5rem', full: '9999px' },
+  space: { 0: '0', 1: '0.25rem', 2: '0.5rem', 3: '0.75rem', 4: '1rem', 5: '1.25rem',
+           6: '1.5rem', 7: '1.75rem', 8: '2rem', 12: '3rem', 16: '4rem' },
+  /**
+   * `xl` and `2xl` exist for CARDS specifically.
+   *
+   * The scale stopped at `lg` (8px), which is right for a control — an input, a
+   * button, a badge — and reads as cramped on a marketing surface. Solar's
+   * landing, the reference implementation for this product's public pages, uses
+   * 12px on its smaller cards and 16px on its larger ones, and the AutoWorkshop
+   * landing looked tighter than it beside them for exactly this reason.
+   * Added to the scale rather than hardcoded at the call site, so the two pages
+   * cannot drift apart again one literal at a time.
+   */
+  radius: { none: '0', sm: '0.25rem', md: '0.375rem', lg: '0.5rem',
+            xl: '0.75rem', '2xl': '1rem', full: '9999px' },
   fontSize: { xs: '0.75rem', sm: '0.875rem', base: '1rem', lg: '1.125rem',
               xl: '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem' },
   /**
diff --git a/packages/marketplace-ui/src/marketplace-landing.tsx b/packages/marketplace-ui/src/marketplace-landing.tsx
index 5ef911b..4715887 100644
--- a/packages/marketplace-ui/src/marketplace-landing.tsx
+++ b/packages/marketplace-ui/src/marketplace-landing.tsx
@@ -28,20 +28,58 @@ import { VinSearch } from './vin-search';
  * been bitten by that distinction before.
  */
 
+/**
+ * ── CARD SIZING FOLLOWS SOLAR'S LANDING PAGE ────────────────────────────────
+ *
+ * Solar PV Designer Lite is this account's reference implementation (ADR-011),
+ * and its landing page is the one public surface here that has actually been
+ * looked at by customers. Its card scale, read from `templates/landing.html`:
+ *
+ *   .use-case-card     radius 12px · padding 20px · height 100%
+ *   .workflow-step     radius 16px · padding 24px · min 220px / max 280px
+ *   .testimonial-card  radius 16px · padding 24px · height 100%
+ *   .plan-card-land    radius 16px · padding 28px
+ *   prose columns      max-width 620-780px
+ *
+ * This page was built on the CONTROL scale — 8px radius, 16px padding — which
+ * is correct for an input or a badge inside an application shell and reads as
+ * cramped on a shop front. Matching Solar's card scale is the whole change:
+ * 12px radius, 24px padding, and grid tracks inside Solar's 220-280px band so
+ * a row of cards has the same rhythm on both products.
+ *
+ * ⚠️ SIZE ONLY. Solar's landing is a dark, gold-accented Bootstrap page and
+ * this one is theme-aware and token-driven; copying its COLOURS would break
+ * light mode and duplicate a palette the design system already owns. Read for
+ * proportion, never for paint — and never opened or run (owner instruction,
+ * 2026-07-26).
+ */
 const CARD: React.CSSProperties = {
   border: `1px solid ${themeVar.borderDefault}`,
-  borderRadius: primitive.radius.lg,
+  borderRadius: primitive.radius.xl,
   background: themeVar.backgroundPrimary,
-  padding: primitive.space[4],
+  padding: primitive.space[6],
   display: 'flex',
   flexDirection: 'column',
-  gap: primitive.space[2],
+  gap: primitive.space[3],
   height: '100%',
   // LOAD-BEARING: a positioned ancestor keeps any absolutely-positioned
   // descendant from escaping the card and stretching the document.
   position: 'relative',
 };
 
+/**
+ * Solar's `.workflow-step` band — `min-width:220px; max-width:280px`.
+ *
+ * Expressed as a grid track rather than a flex item because these grids already
+ * use `auto-fit`/`auto-fill`, and `minmax(13.75rem, 1fr)` gives the same
+ * behaviour: never narrower than 220px, wrapping rather than squashing.
+ *
+ * ⚠️ In `rem`, not `px`. A viewer who has raised their browser's base font size
+ * needs the track to grow with the text inside it, or the card gets tighter for
+ * exactly the person who asked for more room.
+ */
+const CARD_TRACK_MIN = '13.75rem';
+
 const FIELD: React.CSSProperties = {
   width: '100%',
   padding: `${primitive.space[2]} ${primitive.space[3]}`,
@@ -169,8 +207,8 @@ export function MarketplaceLanding({
       <header
         style={{
           border: `1px solid ${themeVar.borderDefault}`,
-          borderRadius: primitive.radius.lg,
-          padding: primitive.space[6],
+          borderRadius: primitive.radius['2xl'],
+          padding: primitive.space[7],
           display: 'flex',
           flexWrap: 'wrap',
           gap: primitive.space[4],
@@ -264,8 +302,8 @@ export function MarketplaceLanding({
           aria-label="Marketplace at a glance"
           style={{
             display: 'grid',
-            gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))',
-            gap: primitive.space[3],
+            gridTemplateColumns: `repeat(auto-fit, minmax(${CARD_TRACK_MIN}, 1fr))`,
+            gap: primitive.space[4],
           }}
         >
           {[
@@ -314,8 +352,8 @@ export function MarketplaceLanding({
           style={{
             ...CARD,
             display: 'grid',
-            gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
-            gap: primitive.space[3],
+            gridTemplateColumns: `repeat(auto-fit, minmax(${CARD_TRACK_MIN}, 1fr))`,
+            gap: primitive.space[4],
             alignItems: 'end',
           }}
         >
@@ -471,7 +509,7 @@ export function MarketplaceLanding({
               style={{
                 display: 'grid',
                 gridTemplateColumns: 'repeat(auto-fill, minmax(17rem, 1fr))',
-                gap: primitive.space[3],
+                gap: primitive.space[4],
               }}
             >
               {group.items.map((part) => (
@@ -528,7 +566,7 @@ export function MarketplaceLanding({
           style={{
             display: 'grid',
             gridTemplateColumns: 'repeat(auto-fill, minmax(17rem, 1fr))',
-            gap: primitive.space[3],
+            gap: primitive.space[4],
             marginTop: primitive.space[3],
           }}
         >

 succeeded in 817ms:
/**
 * Primitive tokens â€” raw values, the base of the token hierarchy
 * (`autoworkshop 01 (1).txt` Â§64: primitive -> semantic -> component).
 *
 * IN ITS OWN MODULE ON PURPOSE. Both `index.ts` (for `semantic`) and
 * `themes.ts` (for the light/dark palettes) need these. If `themes.ts` imported
 * them from `index.ts` â€” which re-exports `themes.ts` â€” the cycle puts
 * `primitive` in the temporal dead zone and the app dies at module init with
 * "Cannot access 'a' before initialization". A leaf module has no such cycle.
 */

/** Primitive tokens â€” raw values. Never referenced directly by components. */
export const primitive = {
  color: {
    blue:   { 50: '#eff6ff', 100: '#dbeafe', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 900: '#1e3a8a' },
    green:  { 50: '#f0fdf4', 500: '#22c55e', 600: '#16a34a', 700: '#15803d' },
    amber:  { 50: '#fffbeb', 500: '#f59e0b', 600: '#d97706', 700: '#b45309' },
    red:    { 50: '#fef2f2', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c' },
    grey:   { 0: '#ffffff', 50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 300: '#d1d5db',
              400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 700: '#374151',
              800: '#1f2937', 900: '#111827' },
  },
  space: { 0: '0', 1: '0.25rem', 2: '0.5rem', 3: '0.75rem', 4: '1rem', 5: '1.25rem',
           6: '1.5rem', 7: '1.75rem', 8: '2rem', 12: '3rem', 16: '4rem' },
  /**
   * `xl` and `2xl` exist for CARDS specifically.
   *
   * The scale stopped at `lg` (8px), which is right for a control â€” an input, a
   * button, a badge â€” and reads as cramped on a marketing surface. Solar's
   * landing, the reference implementation for this product's public pages, uses
   * 12px on its smaller cards and 16px on its larger ones, and the AutoWorkshop
   * landing looked tighter than it beside them for exactly this reason.
   * Added to the scale rather than hardcoded at the call site, so the two pages
   * cannot drift apart again one literal at a time.
   */
  radius: { none: '0', sm: '0.25rem', md: '0.375rem', lg: '0.5rem',
            xl: '0.75rem', '2xl': '1rem', full: '9999px' },
  fontSize: { xs: '0.75rem', sm: '0.875rem', base: '1rem', lg: '1.125rem',
              xl: '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem' },
  /**
   * `01 (1).txt` Â§2845: "One optional monospaced font for VINs, part numbers,
   * fault codes and technical identifiers."
   *
   * Not decoration. These are values a human reads character by character off a
   * number plate, a parts invoice or a scan tool, and in a proportional face
   * `0`/`O` and `1`/`I`/`l` are genuinely ambiguous â€” a misread VIN orders the
   * wrong part. The stack is system fonts only, so it costs no download and no
   * paid licence (ADR-012).
   *
   * SYSTEM STACKS, no webfont: `sans` is here so the mono choice is not the only
   * typographic value in the system and the pair stays visible together.
   */
  fontFamily: {
    sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  },
} as const;

 succeeded in 835ms:
{
  "extends": "../../packages/config/tsconfig.next.json",
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": [
    "node_modules"
  ]
}

codex
The customer route implementation mostly lines up with the API’s `customer` scoping and the navigation tree. I’ve found one definite UX/logic issue in the auth error retry script and one operational mismatch in the warmer comments/timeout; I’m checking whether there are stronger defects in the new tests/build wiring before finalizing the checklist.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "timeout-minutes|One landed fire|window closes|WINDOW_END_HOUR|retrying automatically|sessionStorage|getItem|setItem|window.location" .github/workflows/keep-warm.yml packages/next-shell/src/AuthErrorScreen.tsx' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'pnpm --filter @autoworkshop/customer-web typecheck' in C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'pnpm --filter @autoworkshop/customer-web typecheck'` rejected: blocked by policy
2026-08-04T12:51:50.748993Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'pnpm --filter @autoworkshop/customer-web typecheck'` rejected: blocked by policy
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'pnpm --filter @autoworkshop/customer-web test' in C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'pnpm --filter @autoworkshop/customer-web test'` rejected: blocked by policy
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'pnpm --filter @autoworkshop/auth test' in C:\Users\USER\Documents\autoworkshop-ai
2026-08-04T12:51:50.759194Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'pnpm --filter @autoworkshop/customer-web test'` rejected: blocked by policy
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'pnpm --filter @autoworkshop/auth test'` rejected: blocked by policy
2026-08-04T12:51:50.764519Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'pnpm --filter @autoworkshop/auth test'` rejected: blocked by policy
 succeeded in 519ms:
packages/next-shell/src/AuthErrorScreen.tsx:201:      if (!sessionStorage.getItem('aw-auth-retried')) {
packages/next-shell/src/AuthErrorScreen.tsx:202:        sessionStorage.setItem('aw-auth-retried', '1');
packages/next-shell/src/AuthErrorScreen.tsx:203:        window.location.href = link.getAttribute('href');
packages/next-shell/src/AuthErrorScreen.tsx:207:    el.textContent = '— retrying automatically in ' + left + 's';
.github/workflows/keep-warm.yml:43:# One landed fire covers the rest of the working day.
.github/workflows/keep-warm.yml:54:# it keeps warming until the window closes.
.github/workflows/keep-warm.yml:78:    timeout-minutes: 335
.github/workflows/keep-warm.yml:80:      - name: Warm Keycloak until the window closes
.github/workflows/keep-warm.yml:91:          WINDOW_END_HOUR=18
.github/workflows/keep-warm.yml:122:          while [ "$(date -u +%H)" -lt "$WINDOW_END_HOUR" ]; do
.github/workflows/keep-warm.yml:136:            [ "$(date -u +%H)" -lt "$WINDOW_END_HOUR" ] || break

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content packages/config/tsconfig.base.json -TotalCount 180' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content packages/config/tsconfig.next.json -TotalCount 180' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content packages/next-shell/src/ApiFailure.tsx -TotalCount 180' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content packages/next-shell/src/api.ts -TotalCount 260' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 938ms:
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": [
      "DOM",
      "DOM.Iterable",
      "ES2022"
    ],
    "jsx": "preserve",
    "allowJs": true,
    "noEmit": true,
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "module": "ESNext",
    "moduleResolution": "Bundler"
  }
}

 succeeded in 1023ms:
import { ErrorState } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import type { WorkspaceId } from '@autoworkshop/navigation';
import type { ApiResult } from './api';
import { viewerHasSession } from './viewer';

/**
 * What a screen shows when the API could not answer it.
 *
 * âš ï¸ THIS EXISTS BECAUSE THE OLD MESSAGE LIED TO NEW VISITORS, and a person
 * trying the application reported it: opening any data screen without signing in
 * produced
 *
 *     "Your session has ended â€” Sign in again to see this."
 *
 * Both halves are false for someone who has never signed in. Their session did
 * not end; they never had one. "Sign in AGAIN" tells them they did something
 * they did not. And it pointed at "the Sign in control in the top bar" instead
 * of offering one, so the first thing the product ever said to them was a
 * confusing accusation with no way forward. Their words: "it's not giving me a
 * chance to try the app."
 *
 * THE API CANNOT TELL THESE APART â€” `apiGet` returns `unauthenticated` both when
 * there is no token and when one expired, and it should, because the remedy is
 * the same request. The difference is knowable only here, from the SESSION
 * COOKIE, which is why this is a component and not another string in
 * `describeApiFailure`.
 *
 * It also renders a real sign-in link rather than describing where one lives.
 * A person who cannot find the control is not helped by a sentence about it.
 */
export async function ApiFailure({
  reason,
  workspaceId,
}: {
  reason: Exclude<ApiResult<unknown>, { ok: true }>['reason'];
  workspaceId: WorkspaceId | string;
}) {
  if (reason !== 'unauthenticated') {
    // Indexed by the discriminated union, so a new reason added to `ApiResult`
    // is a COMPILE error here rather than a screen rendering nothing.
    return <ErrorState {...OTHER[reason]} />;
  }

  // Cookie only â€” no network call, and it stays honest when the API is the
  // thing that is down.
  const signedIn = await viewerHasSession(workspaceId);

  return (
    <>
      <ErrorState
        title={signedIn ? 'Your session has ended' : 'Sign in to see this'}
        message={
          signedIn
            ? 'You were signed in, but the session has since expired. Signing in again will bring you straight back here.'
            : 'This page shows information about your own vehicles and repairs, so it is only available once you are signed in.'
        }
      />
      {/* A real link, not a button with a handler: it is a navigation, and it
          must work before any JavaScript has run â€” which on a first visit to a
          slow connection is exactly when someone gives up. */}
      <p style={{ marginTop: primitive.space[4] }}>
        <a
          href="/api/auth/signin"
          style={{
            display: 'inline-block',
            padding: `${primitive.space[3]} ${primitive.space[6]}`,
            borderRadius: primitive.radius.md,
            background: primitive.color.blue[600],
            color: primitive.color.grey[0],
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          {signedIn ? 'Sign in again' : 'Sign in'}
        </a>
      </p>
      {!signedIn && (
        <p style={{ marginTop: primitive.space[3], color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
          Signing in uses your workshop account. If you do not have one yet, the workshop that
          services your vehicle creates it when you first book in.
        </p>
      )}
    </>
  );
}

/**
 * The non-authentication failures, unchanged in meaning from
 * `describeApiFailure` â€” kept beside it deliberately so the two cannot drift.
 *
 * `forbidden` still names no permission: the viewer already failed the check,
 * so telling them what would have passed it publishes the authorization model
 * to exactly the person who should not have it.
 */
const OTHER: Record<
  Exclude<Exclude<ApiResult<unknown>, { ok: true }>['reason'], 'unauthenticated'>,
  { title: string; message: string }
> = {
  forbidden: {
    title: 'You do not have access to this',
    message:
      'Your account does not hold the permission this screen requires. Ask an administrator to review your role and branch assignment.',
  },
  notFound: {
    title: 'Not found',
    message: 'This record does not exist, or it belongs to another organisation.',
  },
  invalid: {
    title: 'That could not be loaded',
    message: 'The request was not accepted. Reload the page and try again.',
  },
  unavailable: {
    title: 'This information is temporarily unavailable',
    message: 'The service did not respond. Nothing has been changed â€” try again shortly.',
  },
};

 exited 1 in 1077ms:
Get-Content : Cannot find path 'C:\Users\USER\Documents\autoworkshop-ai\packages\config\tsconfig.base.json' because it 
does not exist.
At line:2 char:1
+ Get-Content packages/config/tsconfig.base.json -TotalCount 180
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : ObjectNotFound: (C:\Users\USER\D...onfig.base.json:String) [Get-Content], ItemNotFoundEx 
   ception
    + FullyQualifiedErrorId : PathNotFound,Microsoft.PowerShell.Commands.GetContentCommand
 

 succeeded in 1081ms:
import { apiBaseUrl, workspaceAuth } from '@autoworkshop/auth';
import type { WorkspaceId } from '@autoworkshop/navigation';
import { activeOrganizationHeader, activeRoleHeader } from './viewer';

/**
 * How a PAGE reads the API. The link that did not exist until now.
 *
 * Eight endpoints were built under `/api/v1` â€” organizations, branches, users,
 * memberships, me â€” and the entire front end called exactly ONE of them, `/me`,
 * and only to discover who the viewer was. No screen read any data. That is
 * what "no front end to access the back end" meant, and it was accurate.
 * `packages/api-client` existed as an empty directory.
 *
 * SERVER ONLY, and that is a security property rather than a convenience. The
 * access token lives in an encrypted httpOnly cookie and is read back here on
 * the server; it never reaches the browser, so a page renders data the viewer
 * is entitled to without the browser ever holding a credential it could leak.
 * The same reasoning as `viewer.ts`.
 *
 * IT NEVER THROWS. Every failure is a value. A page that throws on a failed
 * fetch takes out the whole route â€” including the shell, the navigation and the
 * sign-out control â€” and the user sees a Next error page instead of an
 * application. `05.txt` Â§2 requires loading, empty AND error states on every
 * screen; that is impossible if the data layer's failure mode is an exception.
 * So callers get a discriminated result and must render each case.
 *
 * FAILURES ARE DISTINGUISHED BECAUSE THE REMEDIES DIFFER. "Sign in again",
 * "you do not have access" and "the service is unreachable" are three different
 * messages, and collapsing them into "something went wrong" is how a session
 * problem gets reported as an outage.
 */

export type ApiResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      /**
       * `unauthenticated` â€” no session, or the access token expired.
       * `forbidden`       â€” a valid identity that may not have this.
       * `notFound`        â€” the record does not exist for this tenant.
       * `invalid`         â€” the request was rejected on its CONTENT (400/409).
       *                     Writes only, and it is the one failure the USER can
       *                     fix, so it carries the API's own message: "a vehicle
       *                     with this registration already exists" tells them
       *                     what to change, and "something went wrong" does not.
       * `unavailable`     â€” the API is down, unreachable, or answered garbage.
       */
      reason: 'unauthenticated' | 'forbidden' | 'notFound' | 'invalid' | 'unavailable';
      status?: number;
      /**
       * Set for `invalid`, and for `forbidden` ON WRITES. Safe to show: these
       * messages describe the INPUT or the RULE, never the system.
       *
       * `forbidden` carries it because a refusal that names no alternative reads
       * as a broken screen â€” see the note at the 403 branch in `apiWrite`.
       */
      message?: string;
    };

/**
 * GET a resource as the current viewer.
 *
 * `cache: 'no-store'` is not optional. Next caches fetches by default, and a
 * cached tenant-scoped response is one tenant's data served to the next viewer
 * who lands on the same rendered route â€” the most expensive bug this codebase
 * could ship. `viewer.ts` carries the same note for the same reason.
 */
export async function apiGet<T>(
  workspaceId: WorkspaceId | string,
  path: string,
): Promise<ApiResult<T>> {
  const accessToken = await workspaceAuth(workspaceId).getAccessToken();
  // Null means no session or an expired token. Fail closed: never fall back to
  // an unauthenticated call, because these endpoints would then answer 401 and
  // the page would report "unavailable" for what is really "please sign in".
  if (!accessToken) return { ok: false, reason: 'unauthenticated' };

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1${path}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        // The viewer's chosen organization (T-0016). Absent until they pick
        // one, in which case the API takes its own deterministic default.
        ...(await activeOrganizationHeader(workspaceId)),
        // The viewer's chosen ROLE. Absent until they pick one, in which case
        // the API takes its own deterministic default. Validated again there â€”
        // a role the viewer does not hold is REFUSED, never downgraded.
        ...(await activeRoleHeader(workspaceId)),
      },
      cache: 'no-store',
    });
  } catch {
    // DNS failure, connection refused, TLS error. The API being down must
    // degrade to an error STATE, never to an exception that removes the page.
    return { ok: false, reason: 'unavailable' };
  }

  if (!response.ok) {
    switch (response.status) {
      case 401:
        return { ok: false, reason: 'unauthenticated', status: 401 };
      case 403:
        return { ok: false, reason: 'forbidden', status: 403 };
      case 404:
        return { ok: false, reason: 'notFound', status: 404 };
      default:
        return { ok: false, reason: 'unavailable', status: response.status };
    }
  }

  try {
    return { ok: true, data: (await response.json()) as T };
  } catch {
    // A 200 carrying HTML â€” a proxy error page, typically. Treating it as data
    // would put `[object Object]` on the screen instead of an error state.
    return { ok: false, reason: 'unavailable', status: response.status };
  }
}

/**
 * POST a resource as the current viewer.
 *
 * Same discipline as `apiGet` and for the same reasons â€” server only, so the
 * access token never reaches the browser, and IT NEVER THROWS, because a form
 * that throws on a rejected submission destroys the page the user was filling
 * in along with everything they typed.
 *
 * The one difference is `invalid`. A write can fail on its CONTENT â€” a duplicate
 * registration number, a malformed field â€” and that is the only failure the
 * person at the keyboard can actually do something about, so the API's message
 * is carried back rather than replaced with a generic apology. Those messages
 * are written to describe the INPUT ("a vehicle with this registration number or
 * VIN already exists"), never the system, so passing them through leaks nothing.
 *
 * `cache` is not set: Next does not cache POSTs. `no-store` is on `apiGet`
 * because a cached tenant-scoped GET is one tenant's data served to the next
 * viewer; that hazard does not exist here.
 */
export async function apiPost<T>(
  workspaceId: WorkspaceId | string,
  path: string,
  body: unknown,
): Promise<ApiResult<T>> {
  return apiWrite<T>('POST', workspaceId, path, body);
}

/**
 * PUT a complete resource as the current viewer.
 *
 * âš ï¸ `PUT` RATHER THAN `PATCH`, AND THE DIFFERENCE IS LOAD-BEARING FOR ITS FIRST
 * CALLER. `apiPatch` means "change these fields"; this means "replace the whole
 * set". The workshop's pricing row is read as a UNIT by `quotation.service.ts`
 * when a quotation is built, so a partial write would leave a workshop quoting
 * with a new labour rate against an old tax rate â€” a combination nobody chose
 * and nobody can see on screen. The API's `parsePricingInput` requires every
 * field for the same reason, so a partial body is refused rather than merged.
 *
 * Shares `apiWrite` with the others: same auth, same never-throws contract, same
 * `invalid` pass-through so a screen can render the API's own sentence.
 */
export async function apiPut<T>(
  workspaceId: WorkspaceId | string,
  path: string,
  body: unknown,
): Promise<ApiResult<T>> {
  return apiWrite<T>('PUT', workspaceId, path, body);
}

/**
 * PATCH a resource as the current viewer.
 *
 * Identical handling to `apiPost` â€” same auth, same never-throws contract, same
 * `invalid` pass-through â€” and shares its implementation rather than copying it
 * (Directive Â§3). The distinction is only the verb: a PATCH sends the fields
 * being changed, so the caller does not have to hold a whole record it never
 * read and cannot accidentally write back a stale copy of the rest of it.
 *
 * `1.txt` Â§394's refusals arrive here as `invalid` (a 400 â€” "requires
 * overrideReason") or `forbidden` (a 403 â€” "role may not move a job card to
 * ..."), and the board shows the API's own sentence for the first because it
 * describes what the person can actually do about it.
 */
export async function apiPatch<T>(
  workspaceId: WorkspaceId | string,
  path: string,
  body: unknown,
): Promise<ApiResult<T>> {
  return apiWrite<T>('PATCH', workspaceId, path, body);
}

/**
 * DELETE a resource as the current viewer.
 *
 * Shares `apiWrite` for the same reasons `apiPatch` does â€” same auth, same
 * never-throws contract, same `invalid` pass-through.
 *
 * âš ï¸ NO BODY IS SENT, and that is why this is a separate export rather than
 * `apiWrite('DELETE', ..., {})`. An empty object would still set
 * `Content-Type: application/json` and a `{}` payload on a request whose meaning
 * is entirely in its URL â€” harmless today, and exactly the kind of thing a strict
 * gateway or a future body-schema validator rejects with a message about JSON when
 * the caller sent no data at all.
 *
 * Added for slice 3b's `removeFinding` (`DELETE /diagnoses/:id/findings/:id`),
 * which exists so a finding entered in error can be taken back while the diagnosis
 * is still open. Nothing else uses DELETE yet: the platform's records are
 * append-only by default and this one is narrowly granted (migration 013).
 */
export async function apiDelete<T>(
  workspaceId: WorkspaceId | string,
  path: string,
): Promise<ApiResult<T>> {
  return apiWrite<T>('DELETE', workspaceId, path, undefined);
}

async function apiWrite<T>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  workspaceId: WorkspaceId | string,
  path: string,
  body: unknown,
): Promise<ApiResult<T>> {
  const accessToken = await workspaceAuth(workspaceId).getAccessToken();
  if (!accessToken) return { ok: false, reason: 'unauthenticated' };

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        // âš ï¸ ONLY WHEN THERE IS A BODY. `apiDelete` passes `undefined`, and
        // declaring a JSON content type on a request that carries no bytes is what
        // makes a strict gateway or a body-schema validator complain about
        // malformed JSON when nothing was sent at all.
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(await activeOrganizationHeader(workspaceId)),
        // The viewer's chosen ROLE. Absent until they pick one, in which case
        // the API takes its own deterministic default. Validated again there â€”
        // a role the viewer does not hold is REFUSED, never downgraded.
        ...(await activeRoleHeader(workspaceId)),
      },
      // `JSON.stringify(undefined)` is `undefined`, which fetch treats as no body â€”
      // relied on deliberately rather than left to chance, hence the explicit
      // branch above.
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, reason: 'unavailable' };
  }

  if (!response.ok) {
    // Read the body BEFORE branching: a 400 carries the reason the form needs,
    // and the response can only be consumed once.
    const detail = await response
      .json()
      .then((b: { message?: string | string[] }) =>
        Array.isArray(b?.message) ? b.message.join('; ') : b?.message,
      )
      .catch(() => undefined);

2026-08-04T12:52:08.345424Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 1.1 seconds
Output:
Get-Content : Cannot find path 'C:\Users\USER\Documents\autoworkshop-ai\packages\config\tsconfig.base.json' because it 
does not exist.
At line:2 char:1
+ Get-Content packages/config/tsconfig.base.json -TotalCount 180
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : ObjectNotFound: (C:\Users\USER\D...onfig.base.json:String) [Get-Content], ItemNotFoundEx 
   ception
    + FullyQualifiedErrorId : PathNotFound,Microsoft.PowerShell.Commands.GetContentCommand
 

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"toDomain\\(|closed_at|mileage_at_intake|expected_completion_on\" apps/api/src/repair/job-card.service.ts" in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"closedAt|closed_at|stage === 'completed'|completed\" apps/api/src/repair/job-card.service.ts apps/api/src/repair -g \"*.ts\"" in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content tsconfig.base.json -TotalCount 220' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 928ms:
126:         j.expected_completion_on, j.mileage_at_intake, j.opened_at,
127:         j.stage_changed_at, j.closed_at, prev.to_stage AS resume_stage
192:      return res.rows.map((row) => this.toDomain(ctx, row as Parameters<JobCardService['toDomain']>[1]));
264:      return this.toDomain(ctx, row);
359:            complaint, priority, assigned_technician_id, expected_completion_on,
360:            mileage_at_intake, created_by)
526:                -- closed_at for every stage except 'completed' — including
537:                closed_at = CASE
538:                              WHEN $1 = 'completed'          THEN COALESCE(closed_at, now())
539:                              WHEN $1 = 'warranty_follow_up' THEN closed_at
641:    return this.toDomain(ctx, res.rows[0] as Parameters<JobCardService['toDomain']>[1]);
667:    expected_completion_on: Date | null;
668:    mileage_at_intake: number | null;
671:    closed_at: Date | null;
689:    expectedCompletionOn: row.expected_completion_on
690:      ? row.expected_completion_on.toISOString().slice(0, 10)
692:    mileageAtIntake: row.mileage_at_intake,
695:    closedAt: row.closed_at ? row.closed_at.toISOString() : null,

 succeeded in 973ms:
apps/api/src/repair/job-card.service.ts:53:  closedAt: string | null;
apps/api/src/repair/job-card.service.ts:127:         j.stage_changed_at, j.closed_at, prev.to_stage AS resume_stage
apps/api/src/repair/job-card.service.ts:526:                -- closed_at for every stage except 'completed' — including
apps/api/src/repair/job-card.service.ts:528:                -- completed. So the normal, expected next move silently wiped
apps/api/src/repair/job-card.service.ts:533:                -- COALESCE so a re-completed card keeps the date it was first
apps/api/src/repair/job-card.service.ts:537:                closed_at = CASE
apps/api/src/repair/job-card.service.ts:538:                              WHEN $1 = 'completed'          THEN COALESCE(closed_at, now())
apps/api/src/repair/job-card.service.ts:539:                              WHEN $1 = 'warranty_follow_up' THEN closed_at
apps/api/src/repair/job-card.service.ts:671:    closed_at: Date | null;
apps/api/src/repair/job-card.service.ts:695:    closedAt: row.closed_at ? row.closed_at.toISOString() : null,
apps/api/src/repair\execution-rules.ts:12:export const EXECUTION_STATUSES = ['in_progress', 'completed', 'abandoned'] as const;
apps/api/src/repair\execution-rules.ts:26:  'completed',
apps/api/src/repair\execution-rules.ts:35:  completed: 'Completed',
apps/api/src/repair\execution.service.ts:41:  completedByName: string | null;
apps/api/src/repair\execution.service.ts:42:  completedAt: string | null;
apps/api/src/repair\execution.service.ts:106:  completedByName: string | null;
apps/api/src/repair\execution.service.ts:107:  completedAt: string | null;
apps/api/src/repair\execution.service.ts:126:  completedTaskCount: number;
apps/api/src/repair\execution.service.ts:374:    const completing = status === 'completed';
apps/api/src/repair\execution.service.ts:389:                -- settles on TEXT — so this assignment failed with "column completed_by
apps/api/src/repair\execution.service.ts:398:                completed_by = CASE WHEN $3 THEN $4::uuid ELSE NULL END,
apps/api/src/repair\execution.service.ts:399:                completed_at = CASE WHEN $3 THEN now() ELSE NULL END,
apps/api/src/repair\execution.service.ts:650:   *    mean work the customer paid for has not been done, and a repair completed over
apps/api/src/repair\execution.service.ts:695:            SET status = 'completed', completed_by = $1, completed_at = now(),
apps/api/src/repair\execution.service.ts:703:        action: 'repair_execution.completed',
apps/api/src/repair\execution.service.ts:709:          tasksCompleted: current.completedTaskCount,
apps/api/src/repair\execution.service.ts:739:              e.started_at, e.completed_at, e.completion_note, e.unexpected_findings,
apps/api/src/repair\execution.service.ts:741:              cb.display_name AS completed_by_name
apps/api/src/repair\execution.service.ts:747:         LEFT JOIN identity.users cb ON cb.id = e.completed_by
apps/api/src/repair\execution.service.ts:769:                et.status_note, et.completed_at,
apps/api/src/repair\execution.service.ts:772:                cb.display_name AS completed_by_name,
apps/api/src/repair\execution.service.ts:786:           LEFT JOIN identity.users cb ON cb.id = et.completed_by
apps/api/src/repair\execution.service.ts:850:        completedByName: t.completed_by_name,
apps/api/src/repair\execution.service.ts:851:        completedAt: t.completed_at ? t.completed_at.toISOString() : null,
apps/api/src/repair\execution.service.ts:896:        completedByName: row.completed_by_name,
apps/api/src/repair\execution.service.ts:897:        completedAt: row.completed_at ? row.completed_at.toISOString() : null,
apps/api/src/repair\execution.service.ts:931:        completedTaskCount: taskList.filter((t) => t.status === 'completed').length,
apps/api/src/repair\execution.service.ts:1095:  completed_at: Date | null;
apps/api/src/repair\execution.service.ts:1099:  completed_by_name: string | null;
apps/api/src/repair\execution.service.ts:1109:  completed_at: Date | null;
apps/api/src/repair\execution.service.ts:1113:  completed_by_name: string | null;
apps/api/src/repair\job-card-stages.spec.ts:67:  closed_at: null,
apps/api/src/repair\job-card-stages.spec.ts:145:  it('closes the card when it reaches completed, and clears it otherwise', async () => {
apps/api/src/repair\job-card-stages.spec.ts:150:      { toStage: 'completed' },
apps/api/src/repair\job-card-stages.spec.ts:153:    expect(update?.text).toMatch(/WHEN \$1 = 'completed'\s+THEN COALESCE\(closed_at, now\(\)\)/);
apps/api/src/repair\job-card-stages.spec.ts:158:    // reachable from `completed`, so an `ELSE NULL` branch meant the normal next
apps/api/src/repair\job-card-stages.spec.ts:161:    const { db, queries } = stageDb('completed');
apps/api/src/repair\job-card-stages.spec.ts:166:    expect(update?.text).toMatch(/WHEN \$1 = 'warranty_follow_up' THEN closed_at/);
apps/api/src/repair\job-card-stages.spec.ts:237:        { toStage: 'completed' },
apps/api/src/repair\job-card-stages.spec.ts:274:      toStage: 'completed',
apps/api/src/repair\job-card-stages.spec.ts:485:      'completed',
apps/api/src/repair\job-card.service.ts:53:  closedAt: string | null;
apps/api/src/repair\job-card.service.ts:127:         j.stage_changed_at, j.closed_at, prev.to_stage AS resume_stage
apps/api/src/repair\job-card.service.ts:526:                -- closed_at for every stage except 'completed' — including
apps/api/src/repair\job-card.service.ts:528:                -- completed. So the normal, expected next move silently wiped
apps/api/src/repair\job-card.service.ts:533:                -- COALESCE so a re-completed card keeps the date it was first
apps/api/src/repair\job-card.service.ts:537:                closed_at = CASE
apps/api/src/repair\job-card.service.ts:538:                              WHEN $1 = 'completed'          THEN COALESCE(closed_at, now())
apps/api/src/repair\job-card.service.ts:539:                              WHEN $1 = 'warranty_follow_up' THEN closed_at
apps/api/src/repair\job-card.service.ts:671:    closed_at: Date | null;
apps/api/src/repair\job-card.service.ts:695:    closedAt: row.closed_at ? row.closed_at.toISOString() : null,
apps/api/src/repair\execution.spec.ts:81:  completed_at: null,
apps/api/src/repair\execution.spec.ts:85:  completed_by_name: null,
apps/api/src/repair\execution.spec.ts:96:  completed_at: null,
apps/api/src/repair\execution.spec.ts:101:  completed_by_name: null,
apps/api/src/repair\execution.spec.ts:124:  header: /LEFT JOIN identity\.users cb ON cb\.id = e\.completed_by/,
apps/api/src/repair\execution.spec.ts:281:      status: 'completed',
apps/api/src/repair\execution.spec.ts:288:    expect(sql).toMatch(/completed_by = CASE WHEN \$3 THEN \$4::uuid ELSE NULL END/);
apps/api/src/repair\execution.spec.ts:298:        status: 'completed',
apps/api/src/repair\execution.spec.ts:304:    const { db } = fakeDb([[Q.open, [openRow({ status: 'completed' })]]]);
apps/api/src/repair\execution.spec.ts:307:        status: 'completed',
apps/api/src/repair\execution.spec.ts:309:    ).rejects.toThrow(/is completed and its record cannot be changed/);
apps/api/src/repair\execution.spec.ts:417:        tasks: [taskRow({ status: 'completed' })],
apps/api/src/repair\execution.spec.ts:435:        tasks: [taskRow({ status: 'completed', worked_seconds: '600' })],
apps/api/src/repair\job-card-stages.ts:48:  'completed',
apps/api/src/repair\job-card-stages.ts:147:  ready_for_collection: ['completed', 'on_hold'],
apps/api/src/repair\job-card-stages.ts:148:  completed: ['warranty_follow_up'],
apps/api/src/repair\job-card-stages.ts:184:    'completed',
apps/api/src/repair\job-card-stages.ts:212:   * `completed`. A technician does the work and hands it on.
apps/api/src/repair\job-card-stages.ts:356:  { key: 'completed', label: 'Completed', stages: ['completed', 'warranty_follow_up'] },
apps/api/src/repair\proposal.spec.ts:107:  inspection_summary: 'All checkpoints completed',
apps/api/src/repair\repair-plan-rules.ts:6: * begins from a completed diagnosis, loads its CONFIRMED faults, and ends at a
apps/api/src/repair\testing-rules.ts:162:export const REQUIRED_EXECUTION_STATUS = 'completed';
apps/api/src/repair\repair.spec.ts:70:  closed_at: null,
apps/api/src/repair\testing.spec.ts:112:  completedExec: /FROM repair\.repair_executions\s+WHERE job_card_id/,
apps/api/src/repair\testing.spec.ts:195:describe('start — §34 follows a completed repair', () => {
apps/api/src/repair\testing.spec.ts:196:  it('refuses when no repair has been completed, naming a reachable route', async () => {
apps/api/src/repair\testing.spec.ts:197:    const { db } = fakeDb([[Q.card, [cardRow()]], [Q.completedExec, []]]);
apps/api/src/repair\testing.spec.ts:206:      [Q.completedExec, [{ id: EXEC_ID, attempt_no: 1 }]],
apps/api/src/repair\testing.spec.ts:480:    expect(sql).toMatch(/assert_testing_follows_completed_repair/);
apps/api/src/repair\testing.spec.ts:481:    expect(sql).toMatch(/rather than completed/);
apps/api/src/repair\testing.service.ts:158:        // both recorded and completed.
apps/api/src/repair\variation.service.ts:146:      if (exec.status === 'completed') {

 succeeded in 1077ms:
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "lib": [
      "ES2022"
    ],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "isolatedModules": true
  },
  "exclude": [
    "node_modules",
    "dist",
    ".next"
  ]
}

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content turbo.json -TotalCount 220' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content packages/navigation/src/types.ts -TotalCount 160' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "counterKey|customer.proposals.pending|notifications|counter" packages apps -g "*.ts" -g "*.tsx"' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 844ms:
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": [
        "^build"
      ],
      "outputs": [
        ".next/**",
        "!.next/cache/**",
        "dist/**"
      ]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": [
        "^build"
      ]
    },
    "typecheck": {
      "dependsOn": [
        "^build"
      ]
    },
    "test": {
      "dependsOn": [
        "^build"
      ],
      "outputs": [
        "coverage/**"
      ]
    },
    "clean": {
      "cache": false
    }
  }
}

 succeeded in 943ms:
packages\ui\src\TopNav.tsx:36:  /** Unread/pending count. §10-§12 require counters on these controls. */
packages\ui\src\TopNav.tsx:63:const MOBILE_PRIMARY_ACTIONS = new Set(['ai', 'notifications']);
packages\ui\src\TopNav.tsx:160:  notifications: '⌾',
packages\ui\src\SideNav.tsx:15: * §16 requires: expandable groups · collapsed icon mode · unread counters ·
packages\ui\src\SideNav.tsx:33:  counters?: Record<string, number>;
packages\ui\src\SideNav.tsx:97:  counters = {},
packages\ui\src\SideNav.tsx:172:          const groupCount = g.items.reduce((n, i) => n + (i.counterKey ? counters[i.counterKey] ?? 0 : 0), 0);
packages\ui\src\SideNav.tsx:235:                    const count = i.counterKey ? counters[i.counterKey] ?? 0 : 0;
apps\admin-web\app\layout.tsx:94:            { id: 'notifications', label: 'Notifications', icon: 'notifications' },
apps\workshop-web\app\_screens\vehicle-detail-screen.tsx:16: * is a date and "expired" is the fact reception actually needs at the counter.
packages\ui\src\AppShell.tsx:58:   * counters that count nothing.
packages\ui\src\AppShell.tsx:68:  counters?: Record<string, number>;
packages\ui\src\AppShell.tsx:102:  counters,
packages\ui\src\AppShell.tsx:182:      counters={counters}
apps\workshop-web\app\_screens\register-customer-screen.tsx:64:              tablet, which is what reception works from at the counter. */}
packages\next-shell\src\WorkspaceShell.tsx:84:  counters?: Record<string, number>;
packages\next-shell\src\WorkspaceShell.tsx:105:   * navigation and no counters.
packages\next-shell\src\WorkspaceShell.tsx:141:  counters,
packages\next-shell\src\WorkspaceShell.tsx:190:      // side-nav badges were already gone. Emptying `counters` does not touch
packages\next-shell\src\WorkspaceShell.tsx:203:      counters={bare ? {} : counters}
packages\next-shell\src\viewer.test.ts:194:    // The counterpart to the admin case: if every workspace went blank for a
packages\navigation\src\workspaces.ts:24:  extra: { permission?: string; counterKey?: string; warningKey?: string } = {},
packages\navigation\src\workspaces.ts:34:  items: Array<[string, string] | [string, string, { permission?: string; counterKey?: string; warningKey?: string }]>,
packages\navigation\src\workspaces.ts:53:    ['my-tasks', 'My Tasks', { counterKey: 'customer.tasks.open' }],
packages\navigation\src\workspaces.ts:54:    ['notifications', 'Notifications', { counterKey: 'customer.notifications.unread' }],
packages\navigation\src\workspaces.ts:67:    ['repair-proposals', 'Repair Proposals', { counterKey: 'customer.proposals.pending' }],
packages\navigation\src\workspaces.ts:96:    ['messages', 'Messages', { counterKey: 'customer.messages.unread' }],
packages\navigation\src\workspaces.ts:128:    ['tasks', 'Tasks', { counterKey: 'workshop.tasks.open' }],
packages\navigation\src\workspaces.ts:129:    ['approvals', 'Approvals', { counterKey: 'workshop.approvals.pending' }],
packages\navigation\src\workspaces.ts:155:    ['new-complaints', 'New Complaints', { counterKey: 'workshop.complaints.new' }],
packages\navigation\src\workspaces.ts:156:    ['appointments', 'Appointments', { counterKey: 'workshop.appointments.today' }],
packages\navigation\src\workspaces.ts:161:    ['repair-staging', 'Repair Staging', { counterKey: 'workshop.jobs.active' }],
packages\navigation\src\workspaces.ts:180:    ['approvals', 'Approvals', { counterKey: 'workshop.proposals.pendingApproval' }],
packages\navigation\src\workspaces.ts:193:    ['messages', 'Messages', { counterKey: 'workshop.messages.unread' }],
packages\navigation\src\workspaces.ts:242:    ['tasks', 'Tasks', { counterKey: 'supplier.tasks.open' }],
packages\navigation\src\workspaces.ts:243:    ['notifications', 'Notifications', { counterKey: 'supplier.notifications.unread' }],
packages\navigation\src\workspaces.ts:256:    ['verification-tasks', 'Verification Tasks', { counterKey: 'supplier.verification.pending' }],
packages\navigation\src\workspaces.ts:266:    ['new-orders', 'New Orders', { counterKey: 'supplier.orders.new' }],
packages\navigation\src\workspaces.ts:275:    ['customer-inquiries', 'Customer Inquiries', { counterKey: 'supplier.inquiries.open' }],
packages\navigation\src\workspaces.ts:280:    ['messages', 'Messages', { counterKey: 'supplier.messages.unread' }],
packages\navigation\src\workspaces.ts:311:    ['tasks', 'Tasks', { counterKey: 'fleet.tasks.open' }],
packages\navigation\src\workspaces.ts:312:    ['approvals', 'Approvals', { counterKey: 'fleet.approvals.pending' }],
packages\navigation\src\workspaces.ts:328:    ['pending-approvals', 'Pending Approvals', { counterKey: 'fleet.approvals.pending' }],
packages\navigation\src\workspaces.ts:344:    ['messages', 'Messages', { counterKey: 'fleet.messages.unread' }],
packages\navigation\src\workspaces.ts:369:    ['tasks', 'Tasks', { counterKey: 'insurance.tasks.open' }],
packages\navigation\src\workspaces.ts:370:    ['approvals', 'Approvals', { counterKey: 'insurance.approvals.pending' }],
packages\navigation\src\workspaces.ts:373:    ['new-claims', 'New Claims', { counterKey: 'insurance.claims.new' }],
packages\navigation\src\workspaces.ts:385:    ['pending-approvals', 'Pending Approvals', { counterKey: 'insurance.authorizations.pending' }],
packages\navigation\src\workspaces.ts:401:    ['messages', 'Messages', { counterKey: 'insurance.messages.unread' }],
packages\navigation\src\workspaces.ts:432:    ['new-requests', 'New Requests', { counterKey: 'towing.requests.new' }],
packages\navigation\src\workspaces.ts:433:    ['dispatch-board', 'Dispatch Board', { counterKey: 'towing.dispatch.active' }],
packages\navigation\src\workspaces.ts:436:    ['active-recoveries', 'Active Recoveries', { counterKey: 'towing.recoveries.active' }],
packages\navigation\src\workspaces.ts:550:    ['tasks-and-approvals', 'Tasks and Approvals', { counterKey: 'workshop.approvals.pending' }],
packages\navigation\src\workspaces.ts:551:    ['notification-inbox', 'Notification Inbox', { counterKey: 'workshop.notifications.unread' }],
packages\navigation\src\workspaces.ts:575:    ['customer-complaints', 'Customer Complaints', { counterKey: 'workshop.complaints.new' }],
packages\navigation\src\workspaces.ts:576:    ['appointments', 'Appointments', { counterKey: 'workshop.appointments.today' }],
packages\navigation\src\workspaces.ts:578:    ['repair-staging', 'Repair Staging', { counterKey: 'workshop.jobs.active' }],
packages\navigation\src\workspaces.ts:643:      ['notifications', 'Notifications'],
packages\navigation\src\workspaces.ts:655:    ['my-tasks', 'My Tasks', { counterKey: 'workshop.tasks.open' }],
packages\navigation\src\workspaces.ts:656:    ['notification-inbox', 'Notification Inbox', { counterKey: 'workshop.notifications.unread' }],
packages\navigation\src\workspaces.ts:663:    ['customer-complaint-inbox', 'Customer Complaint Inbox', { counterKey: 'workshop.complaints.new' }],
packages\navigation\src\workspaces.ts:664:    ['appointments', 'Appointments', { counterKey: 'workshop.appointments.today' }],
packages\navigation\src\workspaces.ts:668:    ['repair-staging', 'Repair Staging', { counterKey: 'workshop.jobs.active' }],
packages\navigation\src\workspaces.ts:679:    ['customer-approval', 'Customer Approval', { counterKey: 'workshop.proposals.pendingApproval' }],
packages\navigation\src\workspaces.ts:694:    ['customer-messages', 'Customer Messages', { counterKey: 'workshop.messages.unread' }],
packages\navigation\src\workspaces.ts:711:    ['my-tasks', 'My Tasks', { counterKey: 'workshop.tasks.open' }],
packages\navigation\src\workspaces.ts:712:    ['notification-inbox', 'Notification Inbox', { counterKey: 'workshop.notifications.unread' }],
packages\navigation\src\workspaces.ts:718:    ['customer-messages', 'Customer Messages', { counterKey: 'workshop.messages.unread' }],
packages\navigation\src\workspaces.ts:727:    ['customer-complaint-inbox', 'Customer Complaint Inbox', { counterKey: 'workshop.complaints.new' }],
packages\navigation\src\workspaces.ts:728:    ['appointments', 'Appointments', { counterKey: 'workshop.appointments.today' }],
packages\navigation\src\workspaces.ts:739:    ['pending-approvals', 'Pending Approvals', { counterKey: 'workshop.proposals.pendingApproval' }],
packages\navigation\src\workspaces.ts:760:    ['my-assigned-work', 'My Assigned Work', { counterKey: 'workshop.tasks.open' }],
packages\navigation\src\workspaces.ts:761:    ['notifications', 'Notifications', { counterKey: 'workshop.notifications.unread' }],
packages\navigation\src\workspaces.ts:769:    ['repair-in-progress', 'Repair in Progress', { counterKey: 'workshop.jobs.active' }],
packages\navigation\src\types.ts:22: * `01 (1).txt` §16 requires unread counters and warning badges on side-nav
packages\navigation\src\types.ts:39:  counterKey?: string;
packages\navigation\src\types.ts:48: * status counter and an optional warning badge.
apps\supplier-web\app\layout.tsx:79:            { id: 'notifications', label: 'Notifications', icon: 'notifications' },
apps\storybook\stories\TopNav.stories.tsx:49:      { id: 'notifications', label: 'Notifications', icon: 'notifications', count: 7, onSelect: () => {} },
apps\storybook\stories\TopNav.stories.tsx:67:      { id: 'notifications', label: 'Notifications', icon: 'notifications' },
apps\storybook\stories\TopNav.stories.tsx:114:      { id: 'notifications', label: 'Notifications', icon: 'notifications', count: 7, onSelect: () => {} },
apps\storybook\stories\SideNav.stories.tsx:9: * counter and an optional warning badge, and are permission-aware.
apps\storybook\stories\SideNav.stories.tsx:92: * Counters and warnings (§16, §21-§24). A counter is workload; a warning is
apps\storybook\stories\SideNav.stories.tsx:100:    counters: { jobCards: 12, appointments: 5, invoices: 3 },
apps\storybook\stories\AppShell.stories.tsx:100:    counters: { jobCards: 12, appointments: 5 },
apps\insurance-web\app\layout.tsx:79:            { id: 'notifications', label: 'Notifications', icon: 'notifications' },
apps\customer-web\app\_screens\parts-order-actions.ts:98: * There is no "pay now" counterpart, and that is the design: no payment provider
apps\fleet-web\app\layout.tsx:79:            { id: 'notifications', label: 'Notifications', icon: 'notifications' },
apps\towing-web\app\layout.tsx:79:            { id: 'notifications', label: 'Notifications', icon: 'notifications' },
apps\customer-web\app\(app)\layout.tsx:98:            { id: 'notifications', label: 'Notifications', icon: 'notifications' },
apps\workshop-web\app\layout.tsx:123:          counters={onboarding ? {} : {
apps\workshop-web\app\layout.tsx:137:            { id: 'notifications', label: 'Notifications', icon: 'notifications', count: 3 },

 succeeded in 988ms:
/**
 * Navigation model types.
 *
 * This package is deliberately FRAMEWORK-FREE â€” no React, no Next.js. The
 * navigation tree is data, and every one of the 7 apps plus Storybook, the
 * Playwright journeys and the permission tests need to read that data without
 * dragging a renderer in with it. `packages/ui` renders it; this package
 * defines it.
 *
 * Source of truth: `autoworkshop 01 (1).txt` â€” the whole file is the approved
 * navigation plan. Â§16-17 define the side-nav architecture and the full group
 * list; Â§33-39 define the per-workspace groups. Nothing here is invented; if a
 * label is not in that spec it does not belong in this file.
 */

/** Permission key, e.g. `job_card.read`. Resolved against the user's grants. */
export type PermissionKey = string;

/**
 * A leaf navigation entry â€” something you can actually navigate to.
 *
 * `01 (1).txt` Â§16 requires unread counters and warning badges on side-nav
 * items, so those are part of the model rather than a rendering afterthought.
 */
export interface NavItem {
  /** Stable id. Used for pinning, favourites and analytics â€” never the label. */
  id: string;
  label: string;
  href: string;
  /**
   * Permission required to SEE this item. Â§16: "Permission-aware visibility."
   * Undefined means every authenticated member of the workspace may see it.
   *
   * Hiding is a usability affordance, NOT a security control â€” the route and
   * the API must independently deny. See CLAUDE.md Â§8 "Hidden is not secure".
   */
  permission?: PermissionKey;
  /** Counter key resolved at runtime, e.g. open job cards. Â§21, Â§22, Â§23. */
  counterKey?: string;
  /** Warning-badge key, e.g. reorder alerts and quarantine in Â§24. */
  warningKey?: string;
}

/**
 * A side-navigation group â€” the "major menu button" of Â§16.
 *
 * Â§16: each group has an icon, a title, an expand/collapse arrow, an optional
 * status counter and an optional warning badge.
 */
export interface NavGroup {
  id: string;
  label: string;
  /**
   * Icon NAME, not an icon component â€” keeping this package renderer-free
   * means it cannot hold JSX. `packages/ui` maps the name to a glyph.
   */
  icon: string;
  items: NavItem[];
  /** Group is hidden wholesale unless the user holds this permission. */
  permission?: PermissionKey;
}

/**
 * A workspace is one of the 7 apps (Â§86). The active workspace decides which
 * groups appear â€” Â§17: "The exact groups displayed shall depend on the active
 * workspace."
 */
export type WorkspaceId =
  | 'customer'
  | 'workshop'
  | 'supplier'
  | 'fleet'
  | 'insurance'
  | 'towing'
  | 'admin';

/**
 * A role WITHIN a workspace â€” `autoworkshop 07.txt` part 2 Â§50.
 *
 * âš ï¸ `07.txt` is TWO documents in one file. Part 2 begins at line 1798 and
 * restarts its own numbering at Â§1; these roles are part 2's Â§50, not part 1's.
 *
 * Â§50 names eight workshop roles. Four of them (Â§46-Â§49) are given a complete,
 * distinct navigation tree; the other four are given a control summary but no
 * tree, so they fall back to the workspace default until the spec defines one.
 * They are listed here anyway, because a role that exists in the authority
 * table but not in the type is a role nobody can grant.
 *
 * ROLE IS NOT WORKSPACE, and conflating them would fork the workspace tree
 * eight ways for no benefit. All eight live inside the single `workshop`
 * workspace; the workspace decides which app you are in, the role decides which
 * navigation that app shows you.
 */
export type WorkshopRoleId =
  | 'owner'
  | 'manager'
  | 'reception'
  | 'supervisor'
  | 'technician'
  | 'storekeeper'
  | 'quality-control'
  | 'cashier';

/** Any role id. Only `workshop` has role-specific trees today (07 pt2 Â§46-Â§49). */
export type RoleId = WorkshopRoleId;

export interface Workspace {
  id: WorkspaceId;
  /** Shown in the top-nav workspace switcher (Â§5). */
  label: string;
  /** One-line description of who this workspace is for. */
  audience: string;
  /**
   * The workspace-level navigation â€” `01 (1).txt` Â§33-Â§39.
   *
   * This is the DEFAULT tree, used when the viewer's role is unknown or when
   * that role has no tree of its own. It is not a superset of the role trees
   * and must not be treated as one: Â§46-Â§49 group and label the same work
   * differently per role ("Repair Requests" for the owner is "Repair Request
   * Inbox" for the manager), so they are distinct trees, not filtered views.
   */
  groups: NavGroup[];
  /**
   * Role-specific navigation â€” `07.txt` part 2 Â§46-Â§49.
   *
   * Present only where the spec actually defines a tree for that role. A role
   * absent from this map is not an error; it falls back to `groups`, which is
   * the honest behaviour for a role the spec has not yet detailed.
   */
  roleGroups?: Partial<Record<RoleId, NavGroup[]>>;
}

/** A single breadcrumb hop. */
export interface Crumb {
  label: string;
  /** Absent on the final crumb â€” the current page is not a link. */
  href?: string;
}

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content apps/customer-web/app/(app)/layout.tsx -TotalCount 170' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "service-and-repairs|repair|service history|Keycloak|Configuration|warm|Solar|card" docs README.md CLAUDE.md ROADMAP.md SECURITY.md ARCHITECTURE.md -g "*.md"' in C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content apps/customer-web/app/(app)/layout.tsx -TotalCount 170'` rejected: blocked by policy
2026-08-04T12:53:01.452505Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content apps/customer-web/app/(app)/layout.tsx -TotalCount 170'` rejected: blocked by policy
 succeeded in 529ms:
README.md:8:specialists, body repairers, spray painters, welders, vulcanizers, upholsterers, suppliers, fleet
README.md:12:work → verify the parts → track the repair** — every step authenticated, authorised, audited and recoverable.
README.md:39:| Identity | Keycloak — own realm, OAuth 2.1 + PKCE |
README.md:81:**not** entangled: separate repo, database, Keycloak realm, deployment, secrets and CI. If Solar were
CLAUDE.md:24:### 2. Solar non-entanglement (ADR-011)
CLAUDE.md:25:Solar PV Designer Lite is the **reference implementation** — always refer to it for patterns, CI shape and
CLAUDE.md:27:separate repository, database, Keycloak **realm**, deployment, secrets and CI. **Never edit Solar's
CLAUDE.md:29:**Acceptance test: if Solar were deleted tomorrow, would this still build, deploy and run?**
CLAUDE.md:43:**only** from validated Keycloak claims and membership — never from a client-supplied id. Isolation tests are
CLAUDE.md:68:## Schema rules (learned from Solar — do not relearn these the hard way)
CLAUDE.md:70:- **No `VARCHAR(n)` on free-text or generated columns** — use `TEXT`. Solar's truncation incident came from
CLAUDE.md:77:- Keycloak heap must be capped — Solar's Keycloak OOM'd on a constrained host.
CLAUDE.md:244:**Every agent, conductor, tool, schema, and utility in every app MUST be importable from another app's codebase, unchanged.** The factory only works if a Solar Design Agent built for `solar-pv-designer-lite` can be imported and used by `pvsolar1` or `ai-app-invent-sales-platform` without copying source. No exceptions.
CLAUDE.md:256:   from .solar_design_agent import SolarDesignAgent
CLAUDE.md:258:   __all__ = ["SolarDesignAgent", "ElectricalDesignAgent"]
CLAUDE.md:271:     then `from app.agents.engineering import SolarDesignAgent`.
CLAUDE.md:279:   SolarDesignAgent = PvDesignAgent  # deprecated alias, remove in v2
CLAUDE.md:292:- App-local `from .config import THIS_APP_ONLY_FLAG` reads inside an agent. Configuration is injected.
CLAUDE.md:849:| Authentication | Keycloak, Auth.js, JWT |
docs\13-operations\LIVE-OUTAGE-2026-07-28.md:114:working: the identity journey passes 2/2 against a real Keycloak, and Phase 4
docs\11-devops\ENVIRONMENTS.md:52:startup: `UntrustedHost`, and a Keycloak provider with no `issuer`. Both returned
docs\11-devops\ENVIRONMENTS.md:66:  to prebuilt images required a new service; it could not be a repair.
docs\11-devops\ENVIRONMENTS.md:78:Postgres, Keycloak, Redis, NATS, MinIO and the NestJS API. Both environments
docs\11-devops\ENVIRONMENTS.md:82:ruled out by COMBINED_PLAN_v2 §6 (30-day expiry — the failure that took Solar
docs\10-testing\TEST_STRATEGY.md:8:| Integration | Vitest + testcontainers | API ↔ Postgres, Redis, NATS, MinIO, Keycloak |
docs\05-database\DATABASE_MIGRATIONS.md:7:   drifts from the migration history — a defect Solar hit and paid for.
docs\05-database\DATABASE_MIGRATIONS.md:11:   AI-generated content caused a live truncation defect in Solar.
docs\05-database\BACKUP_AND_RESTORE.md:3:> **Why this document is strict.** The Solar app was destroyed on 2026-07-09 by an expiring free-tier
docs\05-database\BACKUP_AND_RESTORE.md:51:| `backup.sh` | Physical base backup + logical dump + Keycloak realm export, encrypted, checksummed, manifested, copied off-host, pruned to retention. |
docs\05-database\BACKUP_AND_RESTORE.md:75:| Keycloak | Realm export daily and after any change | **BUILT** — 92 KB realm, encrypted, verified as realm `autoworkshop` |
docs\05-database\BACKUP_AND_RESTORE.md:168:Keycloak restore · six-monthly full environment recovery · annual DR exercise. Retested after every
docs\05-database\BACKUP_AND_RESTORE.md:200:5. **Keycloak realm restore has never been drilled** — only its export is verified.
docs\04-security\TENANT_ISOLATION.md:11:| 1 | Request context | NestJS request-scoped tenant context from **validated Keycloak claims + membership records only** |
docs\04-security\TENANT_ISOLATION.md:57:`set_config('app.current_role','admin',true)` — or inserts fail silently under RLS. This cost Solar real
docs\04-security\RBAC.md:10:Keycloak is the identity provider (ADR-005 — mandatory, no alternative auth product). Authorization Code
docs\04-security\RBAC.md:27:example, starting a repair on a job whose proposal is not approved.
docs\02-architecture\adr\ADR-018-EXPO-SDK-52-FOR-THE-MOBILE-APP.md:33:Keycloak is mandatory (ADR-005) and the realm already exists as config-as-code.
docs\02-architecture\adr\ADR-018-EXPO-SDK-52-FOR-THE-MOBILE-APP.md:66:policy Keycloak enforces at its own login screen. The realm sets
docs\02-architecture\adr\ADR-018-EXPO-SDK-52-FOR-THE-MOBILE-APP.md:72:distinguish a real Keycloak login from a drawn imitation.
docs\02-architecture\adr\ADR-018-EXPO-SDK-52-FOR-THE-MOBILE-APP.md:102:Keycloak service (see `.claude/NEXT_SESSION_START_HERE.md`). This is a
docs\02-architecture\adr\ADR-018-EXPO-SDK-52-FOR-THE-MOBILE-APP.md:112:- **Zero cost.** Expo, React Native and Keycloak are all open source. Publishing
docs\02-architecture\adr\ADR-018-EXPO-SDK-52-FOR-THE-MOBILE-APP.md:124:disconnected mock pages, so the first screen shows real job cards from the real
docs\02-architecture\adr\ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md:47:  `srv-d9jsliu7r5hc73b1kncg` is retired rather than repaired.
docs\02-architecture\adr\ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md:57:2. A Keycloak provider with **no `issuer`** — so no authorization, token or JWKS
docs\02-architecture\adr\ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md:89:Postgres, Keycloak, Redis, NATS and the NestJS API remain undeployed, so the
docs\02-architecture\adr\ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md:93:COMBINED_PLAN_v2 §6 (30-day expiry — the exact failure that took Solar down on
docs\02-architecture\adr\ADR-015-BRING-YOUR-OWN-CONNECTION-FOR-EXTERNAL-PROVIDERS.md:7:`1.txt` §12 requires payment adapters and `2.txt` requires card/mobile-money support — paid services that collide with the zero-cost rule. The owner directed: allow users to decide how they connect.
docs\02-architecture\adr\ADR-012-ZERO-COST-TOOLING.md:11:Every component is FOSS and self-hosted: PostgreSQL, Redis, NATS, MinIO, Keycloak, coturn, Prometheus, Grafana, Loki, Ollama. No paid tool, subscription or mandatory paid service. A task is not complete if it introduced a paid dependency.
docs\02-architecture\adr\ADR-011-MULTI-TENANCY-AND-THE-SOLAR-BOUNDARY.md:1:# ADR-011 — Multi-tenancy and the Solar boundary
docs\02-architecture\adr\ADR-011-MULTI-TENANCY-AND-THE-SOLAR-BOUNDARY.md:7:The owner directed: reuse Solar components but do not mix things up. Shared identity data would entangle two products that must be able to fail independently.
docs\02-architecture\adr\ADR-011-MULTI-TENANCY-AND-THE-SOLAR-BOUNDARY.md:11:Shared cluster, logical isolation, RLS. Separate repository, database, Keycloak realm, deployment, secrets and CI from Solar. Patterns are copied; code and runtime are not shared.
docs\02-architecture\adr\ADR-011-MULTI-TENANCY-AND-THE-SOLAR-BOUNDARY.md:15:Acceptance test: if Solar were deleted tomorrow, AutoWorkshop must still build, deploy and run. CI fails the build if any code references the Solar repository.
docs\02-architecture\adr\ADR-005-KEYCLOAK-IS-MANDATORY.md:1:# ADR-005 — Keycloak is mandatory
docs\02-architecture\adr\ADR-005-KEYCLOAK-IS-MANDATORY.md:7:`05.txt` §1 and §3 and `1.txt` §11 make Keycloak the authentication architecture. An earlier plan draft proposed a NestJS-native JWT fallback; Codex rejected it and was right.
docs\02-architecture\adr\ADR-005-KEYCLOAK-IS-MANDATORY.md:11:Keycloak, own realm, OAuth 2.1 + PKCE, short-lived tokens, rotating refresh tokens. No alternative auth product is implemented.
docs\02-architecture\adr\ADR-005-KEYCLOAK-IS-MANDATORY.md:15:Hosting Keycloak is a real operational cost in effort — solved with hosting (heap-capped container), not by weakening the architecture. A separate realm from Solar is mandatory (ADR-011).
docs\02-architecture\adr\ADR-004-POSTGRESQL-WITH-ROW-LEVEL-SECURITY.md:15:Isolation survives an application bug. Costs: every query needs tenant context set, and seeding needs `set_config('app.current_role','admin',true)` — a Solar lesson.
docs\01-product\PERMISSION_MATRIX.md:12:| `assigned` | Records the user is assigned to (e.g. their job cards) |
docs\01-product\BUSINESS_RULES.md:7:1. **No chargeable repair starts without recorded customer approval.** The only exception is an explicitly
docs\01-product\BUSINESS_RULES.md:29:    confirmed diagnosis · approved repair action.
docs\00-project\RELEASE_PLAN.md:8:| **0.4** | Reception, intake, job cards, staging, diagnosis, quotation, customer approval, QC | Flag off; approval records are append-only and preserved |
docs\00-project\PROJECT_SCOPE.md:7:voice/video, computer-vision inspection, engine-sound analysis, the 3D repair viewer, OBD integration,
docs\00-project\PROJECT_SCOPE.md:17:| OEM wiring diagrams, manufacturer repair data | **Licensing** — `2.txt`/`3.txt` both say "where licensing permits" | Library, schema, viewer and test-point tooling all ship; copyrighted content does not |
docs\00-project\PROJECT_SCOPE.md:29:- Any change to the Solar application (ADR-011)
docs\00-project\PROJECT_SCOPE.md:34:Solar · agents never reach the database · tenant isolation is Severity-1.
docs\00-project\PLAN_EXTENSION_v1.md:33:| `autoworkshop 07.txt` **part 2** (lines 1798–5069, §1–52) | **A second, separate document: the entire workshop-side user model** — workshop sign-up, staff invitation, Owner / Manager / Reception / Technician scenarios, inboxes, the complete repair flow through QC, release, invoicing, warranty, and per-role workspace navigation |
docs\00-project\PLAN_EXTENSION_v1.md:38:07 → Phases 4 and 7 · 08 → Phase 10's "3D repair viewer" · 09 → Phases 8 and 9. The extension's job is to
docs\00-project\PLAN_EXTENSION_v1.md:46:| **D2 stack** (Next + NestJS + Postgres + Redis + Keycloak) | Unchanged. 3D uses Three.js, already named in v2 §2. |
docs\00-project\PLAN_EXTENSION_v1.md:48:| **D5 Keycloak mandatory** | Unchanged. 07's four account types are Keycloak roles + memberships, not a parallel auth path. |
docs\00-project\PLAN_EXTENSION_v1.md:61:`repair-library` and `external-research` are capabilities of the knowledge server; `simulation` is a capability
docs\00-project\PLAN_EXTENSION_v1.md:94:  live tracking, and conversion of a towing record into a repair request.
docs\00-project\PLAN_EXTENSION_v1.md:119:| `My Workspace` resolver + Home Page card | **3** (shell) — extends the shell already built | 0.2.x |
docs\00-project\PLAN_EXTENSION_v1.md:145:reception, intake, complaint inbox, job cards, repair staging board, technician/bay assignment, inspection,
docs\00-project\PLAN_EXTENSION_v1.md:146:diagnosis, repair plan, quotation, Solution Studio, execution, testing, QC, release". 07 part 2 does not add
docs\00-project\PLAN_EXTENSION_v1.md:158:| §18–§21 | Repair procedures library, DTC search, **fault simulation and repair-solution simulation entry points** | Phase 9 / 12 (the tools themselves), Phase 5 (the entry point) |
docs\00-project\PLAN_EXTENSION_v1.md:161:| §31–§39 | Repair execution, **variation flow**, technician time recording, test results, post-repair scan, road test, QC, vehicle release | Phase 5 |
docs\00-project\PLAN_EXTENSION_v1.md:164:| §51, §52 | Complete workshop repair flow + acceptance criteria | Phase 5 acceptance |
docs\00-project\PLAN_EXTENSION_v1.md:192:(no private customer records, no unapproved repair documents, no personal contact details without consent, no
docs\00-project\PLAN_EXTENSION_v1.md:193:misleading technical instructions, no unsafe repair practices, no confidential fleet information).
docs\00-project\PLAN_EXTENSION_v1.md:195:**Placed last, not cut.** They depend on identity, workshops, repair history and the knowledge library all
docs\00-project\PLAN_EXTENSION_v1.md:200:## 3. Spec 08 — 3D fault and repair simulation. Extends Phase 10.
docs\00-project\PLAN_EXTENSION_v1.md:215:   repair/replace, reassembly, configuration/calibration, testing/QC.
docs\00-project\PLAN_EXTENSION_v1.md:216:5. **Alternative solution comparison** (§19) — e.g. repair harness vs replace sub-harness vs replace
docs\00-project\PLAN_EXTENSION_v1.md:234:repair-solution flow depends on the Phase 9 library and the Phase 8 approval gate. Building it earlier means
docs\00-project\PLAN_EXTENSION_v1.md:250:## 4. Spec 09 — technical repair library and research agent. Extends Phases 8 and 9.
docs\00-project\PLAN_EXTENSION_v1.md:259:Vehicle catalogue · vehicle-systems catalogue · fault/symptom records · diagnostic procedures · repair
docs\00-project\PLAN_EXTENSION_v1.md:340:`diagnostic_procedures` · `repair_procedures` · `tools_equipment` · `diagrams` · `external_sources` ·
docs\00-project\PLAN_EXTENSION_v1.md:343:`repair_alternatives`.
docs\00-project\PLAN_EXTENSION_v1.md:373:| 3 Shell | 0.2.x | **+** My Workspace resolver + Home Page card, **navigation model becomes workspace × role** (07 pt2 §46–§50) |
docs\00-project\PLAN_EXTENSION_v1.md:374:| 4 Customer + Vehicle | 0.3 | **+** personal vehicle workspace, My Repair Dashboard, service request, approve/reject/modify, search technician/workshop, repair work history |
docs\00-project\PLAN_EXTENSION_v1.md:383:| **14 Community** *(new)* | **1.3** | auto-repair news feed, social app, workshop knowledge contribution, moderation and abuse reporting (07 pt1 §18–§19, pt2 §45) |
docs\00-project\PLAN_EXTENSION_v1.md:407:   Postgres + Keycloak + Redis + MinIO + coturn + observability "comfortable". That is an untested assertion,
docs\00-project\IMPLEMENTATION_PROGRAMME.md:10:| 2 | — | Identity — Keycloak, users, orgs, branches, roles, permissions, tenant context, RLS, audit, backups |
docs\00-project\IMPLEMENTATION_PROGRAMME.md:13:| 5 | 0.4 | Workshop + repair — reception, job cards, staging board, diagnosis, Solution Studio, approval, QC |
docs\00-project\COMBINED_PLAN_v2.md:5:**Owner directions incorporated:** name locked · stop cutting · reuse Solar but don't mix things up
docs\00-project\COMBINED_PLAN_v2.md:17:Built from 10 unique spec files (~548 KB) in `Documents\autoworkshop app\`; two duplicate pairs discarded
docs\00-project\COMBINED_PLAN_v2.md:33:NestJS · TypeScript — backend. PostgreSQL · Redis · Keycloak. Python + Google ADK — agent layer.
docs\00-project\COMBINED_PLAN_v2.md:34:`autoworkshop 2.txt`'s "reuse the Solar stack" is overruled: it openly admits it was guessing at Solar's
docs\00-project\COMBINED_PLAN_v2.md:35:configuration, and Solar is a Flask single-file app that memory forbids editing. `1.txt` §5–6 and `05.txt` §1
docs\00-project\COMBINED_PLAN_v2.md:38:### D2a — Solar reuse boundary — ✅ OWNER-DIRECTED, tightened per Codex correction #9/#10
docs\00-project\COMBINED_PLAN_v2.md:48:| Keycloak config | Realm/client setup patterns, theme approach, cutover runbook |
docs\00-project\COMBINED_PLAN_v2.md:51:| Hard-won gotchas | Render ignores the Procfile · auto-deploy flaky · Keycloak OOMs on Render free · `CREATE-IF-NOT-EXISTS` schema drift · RLS seeding needs `set_config('app.current_role','admin',true)` · widen narrow `VARCHAR`→`TEXT` · PowerShell pipes inject a BOM into secrets |
docs\00-project\COMBINED_PLAN_v2.md:56:1. **Separate repository** — `Documents\autoworkshop-ai\`. Not a folder in Solar, not a branch of it.
docs\00-project\COMBINED_PLAN_v2.md:57:2. **Never edit Solar to serve AutoWorkshop.** `web_app.py`, `wsgi.py`, Solar templates stay untouched.
docs\00-project\COMBINED_PLAN_v2.md:58:3. **Separate database** — own instance, own schemas. No shared tables, no cross-app FKs, no reading Solar's data.
docs\00-project\COMBINED_PLAN_v2.md:59:4. **Separate Keycloak *realm*** — not merely a separate client *(Codex correction #9: a shared realm risks identity-data entanglement)*.
docs\00-project\COMBINED_PLAN_v2.md:60:5. **Separate deployment, domain, secrets and CI environments.** A Solar deploy must never be able to break AutoWorkshop, or the reverse.
docs\00-project\COMBINED_PLAN_v2.md:61:6. **No stack bleed.** Solar is Flask/Python. Copying Solar's Flask code here is prohibited — reuse the *pattern*, re-implement in TypeScript.
docs\00-project\COMBINED_PLAN_v2.md:63:8. **No runtime dependency on any Solar service.**
docs\00-project\COMBINED_PLAN_v2.md:65:**Acceptance test:** *if Solar were deleted tomorrow, would AutoWorkshop still build, deploy and run?*
docs\00-project\COMBINED_PLAN_v2.md:94:### D5 — Keycloak is mandatory  *(Codex correction #8 — Codex won this)*
docs\00-project\COMBINED_PLAN_v2.md:95:`05.txt` §1 and §3, and `1.txt` §11, make Keycloak the authentication architecture. **The NestJS-native JWT
docs\00-project\COMBINED_PLAN_v2.md:96:fallback from Claude v1 is removed.** Keycloak ships in Phase 2. Its hosting difficulty is a *deployment*
docs\00-project\COMBINED_PLAN_v2.md:121:| **3D repair viewer** | Three.js: rotate/zoom/hide/isolate, exploded views, component metadata, assembly order, animated overlays (current, fluid, combustion, transmission), generic + CC0 geometry | *Vehicle-specific* OEM geometry | **Licensing** |
docs\00-project\COMBINED_PLAN_v2.md:128:1. **OEM wiring diagrams and manufacturer repair data are not preloaded.** `2.txt`/`3.txt` both say "where
docs\00-project\COMBINED_PLAN_v2.md:134:3. **Sequencing is not scope.** Fleet approval cannot precede the job card it approves. Everything lands, in
docs\00-project\COMBINED_PLAN_v2.md:193:customer-vehicle · complaint-appointment · workshop-technician · repair-job-diagnosis ·
docs\00-project\COMBINED_PLAN_v2.md:202:request resolves exactly one active tenant context, derived solely from validated Keycloak claims and
docs\00-project\COMBINED_PLAN_v2.md:214:**Hard schema rules** (Solar lessons):
docs\00-project\COMBINED_PLAN_v2.md:215:- **No `VARCHAR(n)` on free-text or generated columns** — `TEXT`. Solar's truncation incident came from narrow
docs\00-project\COMBINED_PLAN_v2.md:240:identity-access · customer-vehicle · complaint-appointment · workshop-technician · repair-diagnostic ·
docs\00-project\COMBINED_PLAN_v2.md:256:**Prompt-injection defence** is testable, not aspirational. All retrieved content — repair documents,
docs\00-project\COMBINED_PLAN_v2.md:272:(mobile); cached assigned jobs, vehicle details, downloaded repair procedures, dictionary entries, inspection
docs\00-project\COMBINED_PLAN_v2.md:297:| 2 Identity | — | **Keycloak (mandatory)** realm + clients, login/logout/session, users, orgs, branches, roles, permissions, workspace/org/branch switching, tenant-context resolution, RLS, audit framework |
docs\00-project\COMBINED_PLAN_v2.md:299:| 4 Customer + Vehicle | **0.3** | Registration, profile, vehicle garage, documents, service history, maintenance schedule, complaint submission (text/audio/image/video), appointment request, workshop search, dashboard |
docs\00-project\COMBINED_PLAN_v2.md:300:| 5 Workshop + Repair | **0.4** | Workshop dashboard, reception, intake, complaint inbox, job cards, repair staging board, technician/bay assignment, inspection, diagnosis, repair plan, quotation, **Solution Studio** proposal + versioning + variation + e-approval, execution, testing, QC, release |
docs\00-project\COMBINED_PLAN_v2.md:302:| 7 Finance + Partners | **0.6** | Invoices, payments, receipts, balances, warranty records + claims, fleet vehicles/requests/approvals, insurance claims + repair authorisation, towing requests + dispatch |
docs\00-project\COMBINED_PLAN_v2.md:305:| 10 Multimedia + Intelligence | **0.9** | **Computer-vision inspection · engine-sound analysis · 3D repair viewer · OBD integration · offline-first sync · mobile app (Android) · multilingual** |
docs\00-project\COMBINED_PLAN_v2.md:308:**Critical path:** Phase 2 (identity + tenancy) → Phase 3 (shell) → Phase 5 (repair job). Everything branches
docs\00-project\COMBINED_PLAN_v2.md:323:(testcontainers: Postgres, Redis, MinIO, Keycloak) → **DB validation** (migration lint, forward, rollback,
docs\00-project\COMBINED_PLAN_v2.md:353:| **Payments** | Cash · bank transfer · manually-recorded mobile money · **their own** mobile-money merchant account · **their own** card-provider account | **£0** — tenant's own account, tenant's own fees, entirely their decision |
docs\00-project\COMBINED_PLAN_v2.md:394:| **Everything self-hosted FOSS, nothing proprietary-managed** | Postgres, Redis, Keycloak, MinIO, NATS, coturn all move to bigger hardware unchanged — the *same software*, more resources |
docs\00-project\COMBINED_PLAN_v2.md:430:PostgreSQL, Redis, Keycloak, Storybook, Playwright, Vitest, axe-core, Penpot, **Docker**. The spec approves
docs\00-project\COMBINED_PLAN_v2.md:439:Caddy), the same mechanism already proven on Solar since 2026-06-09.
docs\00-project\COMBINED_PLAN_v2.md:446:| **PostgreSQL** | **Self-hosted Postgres 16 + `pgvector` in Docker.** No expiry, no suspension, no tier games — the failure mode that destroyed Solar cannot occur | £0 |
docs\00-project\COMBINED_PLAN_v2.md:448:| **Keycloak** | Self-hosted, **own realm** (D2a) | £0 |
docs\00-project\COMBINED_PLAN_v2.md:452:| **Observability** | Prometheus + Grafana + Loki, self-hosted (Solar's SOC-2 stack) | £0 |
docs\00-project\COMBINED_PLAN_v2.md:457:| **Backups** | **Continuous WAL archiving → PITR**, encrypted physical (`pg_basebackup`) + logical (`pg_dump -Fc`) + Keycloak realm, checksummed, **encrypted off-host copy under separate bucket-scoped credentials**, retention, scheduled restore drill | £0 |
docs\00-project\COMBINED_PLAN_v2.md:485:**Signup assumption:** the always-free tier requires one-time account creation with card verification
docs\00-project\COMBINED_PLAN_v2.md:491:1. Always-free tiers require card verification (not charged) and can reclaim idle instances → keep-alive
docs\00-project\COMBINED_PLAN_v2.md:495:3. Resource ceiling. Postgres + Keycloak + Redis + MinIO + coturn + observability on one host is comfortable
docs\00-project\COMBINED_PLAN_v2.md:507:while every setting read back correct. Solar's 2026-07-09 destruction by an expiring free Postgres with no
docs\00-project\COMBINED_PLAN_v2.md:517:| 2 | Free-tier data loss (already killed Solar once) | **Self-hosted Postgres — no expiry/suspension vector at all**; off-VM nightly dump from day 1; monthly restore drill; alert on backup age |
docs\00-project\COMBINED_PLAN_v2.md:518:| 3 | Keycloak hosting/complexity | Mandatory; self-hosted in Docker on always-free compute with its **own realm**; simple realm/client/role model; realm exports reviewed in CI |
docs\00-project\COMBINED_PLAN_v2.md:522:| 7 | Unsafe AI repair instruction followed by a technician | Safety agent reviews high-risk output; RAG grounded on *approved* content only; technician approval before any customer-facing proposal; confidence + sources on every output |
docs\00-project\COMBINED_PLAN_v2.md:526:| 11 | Accidental Solar entanglement | D2a boundaries + the deletion test enforced in review |
docs\00-project\COMBINED_PLAN_v2.md:555:| 4 | Keycloak vs JWT fallback | **Codex — Keycloak mandatory** | `05.txt` §1, §3; `1.txt` §11 |
docs\00-project\COMBINED_PLAN_v2.md:556:| 5 | Solar boundary | **Claude, tightened** | Owner direction; separate *realm* not client |
docs\00-project\COMBINED_PLAN_v2.md:577:   (a) an always-free cloud VM (signup requires card *verification*, never a charge — flagged because it is
docs\00-project\COMBINED_PLAN_v2.md:609:| Keycloak | Realm + config export daily and after any change | §32 |
docs\00-project\COMBINED_PLAN_v2.md:646:`1.txt` §12 requires payment-provider adapters and `2.txt` requires card/mobile-money support — both paid
docs\00-project\COMBINED_PLAN_v2.md:694:1. Codex — Keycloak is mandatory; my JWT fallback was wrong (`05.txt` §1/§3, `1.txt` §11)
docs\00-project\COMBINED_PLAN_v2.md:697:4. Codex — Render free Postgres is unfit for persistence (the Solar failure vector)
docs\00-project\COMBINED_PLAN_v2.md:706:a purchase, a subscription, or a paid dependency. Where the spec references a paid capability (card payments,
ROADMAP.md:9:| 2 Identity | — | Keycloak, users, orgs, branches, roles, permissions, tenant context, RLS, audit, backups | queued |
ROADMAP.md:12:| 5 Workshop + repair | **0.4** | Reception, intake, job cards, staging board, inspection, diagnosis, Solution Studio, approval, QC | queued |
ROADMAP.md:20:**Critical path:** Phase 2 (identity + tenancy) -> Phase 3 (shell) -> Phase 5 (repair job).
SECURITY.md:22:1. NestJS request-scoped tenant context, derived **only** from validated Keycloak claims and membership
SECURITY.md:66:> Solar leaked secrets for 35 days (2026-07-10) because committed ciphertext met a leaked key. Both are
SECURITY.md:73:and deletion protection · automatic verified backup before high-risk migrations · daily Keycloak realm
SECURITY.md:79:> Solar was destroyed on 2026-07-09 by an expiring free-tier database with no backups. This project
ARCHITECTURE.md:45:NestJS tenant context (from validated Keycloak claims + membership only) -> repository filter ->

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content docs/00-project/COMBINED_PLAN_v2.md -TotalCount 330' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content docs/00-project/PLAN_EXTENSION_v1.md -TotalCount 420' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content -LiteralPath 'apps/customer-web/app/(app)/layout.tsx' -TotalCount 170" in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 1244ms:
# AutoWorkshop AI â€” COMBINED IMPLEMENTATION PLAN (v2)

**Authors:** Claude (plan v1) + Codex Reviewer (independent plan v1 + adjudication)
**Codex verdict on v1:** `PASS WITH CORRECTIONS` â€” all 14 corrections applied below
**Owner directions incorporated:** name locked Â· stop cutting Â· reuse Solar but don't mix things up
**Status:** âœ… **APPROVED â€” all gates complete.** Codex `PASS WITH CORRECTIONS` (14 applied) â†’
Supervisor `PASS WITH CONDITIONS` (8 applied, Â§14). See Â§15 and Â§16.
*(Corrected 2026-07-26: this line read "awaiting Supervisor adjudication" while Â§15 and Â§16 recorded the
Supervisor pass and declared all gates complete. One document cannot hold two release states â€” a stale
header on an approved plan is how work gets re-run or, worse, started under the belief it was never gated.)*
**Date:** 2026-07-25 Â· header corrected 2026-07-26

---

## 0. Provenance

Built from 10 unique spec files (~548 KB) in `Documents\autoworkshop app\`; two duplicate pairs discarded
(`0 (1).txt` â‰¡ `0.txt`, `04.txt` â‰¡ `03.txt`). Claude and Codex each read all 10 independently and drafted a
plan without seeing the other's. Codex then adjudicated. Where they disagreed, the winner and the governing
spec citation are recorded in Â§12.

---

## 1. Locked decisions

### D1 â€” Product identity â€” âœ… OWNER-LOCKED
**AutoWorkshop AI**, at **`autoworkshop.aiappinvent.com`**. Closed by owner instruction 2026-07-25.
"GarageOS AI" is dropped entirely â€” not a fallback. Module sub-brands (Studio, Doctor, Connect, Parts,
Knowledge, Fleet, Claims, Analytics) survive only as UI section names.

### D2 â€” Stack
Next.js (App Router) Â· React Â· TypeScript Â· Tailwind Â· shadcn/ui Â· Radix â€” frontend.
NestJS Â· TypeScript â€” backend. PostgreSQL Â· Redis Â· Keycloak. Python + Google ADK â€” agent layer.
`autoworkshop 2.txt`'s "reuse the Solar stack" is overruled: it openly admits it was guessing at Solar's
configuration, and Solar is a Flask single-file app that memory forbids editing. `1.txt` Â§5â€“6 and `05.txt` Â§1
both mandate the stack above.

### D2a â€” Solar reuse boundary â€” âœ… OWNER-DIRECTED, tightened per Codex correction #9/#10

Reuse is encouraged. Entanglement is prohibited.

**âœ… REUSE â€” patterns and sanitised config, copied into this repo**

| What | How |
|---|---|
| Deploy patterns | `render.yaml` shape, health-check/start-command conventions, the manual `Force Render Deploy` workflow with its `inputs.confirm` dry-run gate |
| Postgres discipline | Migration structure, the 48 proven RLS policy patterns, backup + restore-drill scripts, `RETURNING id` |
| Keycloak config | Realm/client setup patterns, theme approach, cutover runbook |
| CI/CD shape | Workflow layout, gating structure, quality-gate script conventions |
| Observability | Prometheus + Loki + Grafana config from the SOC-2 sprint |
| Hard-won gotchas | Render ignores the Procfile Â· auto-deploy flaky Â· Keycloak OOMs on Render free Â· `CREATE-IF-NOT-EXISTS` schema drift Â· RLS seeding needs `set_config('app.current_role','admin',true)` Â· widen narrow `VARCHAR`â†’`TEXT` Â· PowerShell pipes inject a BOM into secrets |
| Governance | Project OS directive, Agentic ADK Extension, four-gate quality bar |

**âŒ DO NOT MIX â€” hard boundaries**

1. **Separate repository** â€” `Documents\autoworkshop-ai\`. Not a folder in Solar, not a branch of it.
2. **Never edit Solar to serve AutoWorkshop.** `web_app.py`, `wsgi.py`, Solar templates stay untouched.
3. **Separate database** â€” own instance, own schemas. No shared tables, no cross-app FKs, no reading Solar's data.
4. **Separate Keycloak *realm*** â€” not merely a separate client *(Codex correction #9: a shared realm risks identity-data entanglement)*.
5. **Separate deployment, domain, secrets and CI environments.** A Solar deploy must never be able to break AutoWorkshop, or the reverse.
6. **No stack bleed.** Solar is Flask/Python. Copying Solar's Flask code here is prohibited â€” reuse the *pattern*, re-implement in TypeScript.
7. **Copy patterns, not files.** No relative imports into `../solar-pv-designer-lite`, no shared database queries, no shared deployment units. Genuinely shared logic becomes a versioned package per Â§0.3.
8. **No runtime dependency on any Solar service.**

**Acceptance test:** *if Solar were deleted tomorrow, would AutoWorkshop still build, deploy and run?*
If no, the coupling is wrong and gets removed.

### D3 â€” Design toolchain: Penpot, not Figma
`01 (1).txt` Â§61/Â§89 mandates Figma + Dev Mode + Chromatic; `05.txt` Â§1 mandates zero-cost/open-source only
and names Penpot; `06.txt`'s DECISION_LOG records "Penpot selected instead of Figma". Figma Dev Mode and
Chromatic are paid at team scale. **Penpot** for design, **Storybook OSS** as component catalogue,
**Playwright `toHaveScreenshot()`** for visual regression, **axe-core** for accessibility, **Vitest** for unit
tests. Everything else in `01 (1).txt` Â§64â€“Â§87 â€” token hierarchy, colour semantics, component catalogue,
component states, quality gates â€” is kept verbatim. Only the vendor changes.

### D4 â€” Agent framework: Google ADK over MCP  *(ADR-013)*
Platform governance Â§0.1 permits only Google ADK; the specs mandate an "AI Host + Agent Orchestrator + MCP
clients". Same shape, different words.

```
Tier 6  apps/agent-host      Python 3.14 + google-adk 2.2.0
          orchestrators/root_orchestrator.py
          conductors/  intake Â· diagnostic Â· solution Â· parts Â· finance Â· knowledge
          specialists/ ~20 LlmAgents
          MCP clients (ADK MCPToolset) â”€â”€â”€â”€â”€â”€â”
                                              â”‚  MCP over HTTP, via the Gateway
Tier 7  apps/mcp-gateway + apps/mcp-servers/* â”˜  TypeScript, @modelcontextprotocol/sdk
Tier 4  apps/api  NestJS domain services â€” the only place business rules live
```

MCP is the **sole** cross-language boundary. NestJS never imports Python; ADK never imports TypeScript;
neither ever holds a database credential on an agent's behalf.

### D5 â€” Keycloak is mandatory  *(Codex correction #8 â€” Codex won this)*
`05.txt` Â§1 and Â§3, and `1.txt` Â§11, make Keycloak the authentication architecture. **The NestJS-native JWT
fallback from Claude v1 is removed.** Keycloak ships in Phase 2. Its hosting difficulty is a *deployment*
risk to be solved with hosting (Â§9), not licence to implement a second auth product.

---

## 2. Scope: build everything â€” stage content, not features

**Owner direction: stop cutting.** Claude v1 deferred six areas on the strength of `05.txt`'s "16 weeks";
Codex v1 additionally cut fleet, insurance, towing, marketplace depth, offline sync and mobile. **Both
positions are withdrawn.** Codex's adjudication concedes this: *"Claude's revised Section 2 wins. The owner
overruled both cuts, and the specs support full structural scope."*

**Principle: every feature gets built structurally. What stages is (a) content we must license or collect,
and (b) two external dependencies â€” relay bandwidth and OBD hardware.**

The specs already anticipate this. `2.txt` says the 3D module "should be introduced progressively because
high-quality vehicle-specific models require licensed data"; it requires CV results to be "reviewable by a
qualified technician" and sound results to be "diagnostic leads rather than final conclusions". A working
baseline with honest confidence labelling and a human gate **satisfies** the spec.

| Area | Built in full | Genuinely staged | Blocker type |
|---|---|---|---|
| **Voice/video/screen-share** | WebRTC signaling, room lifecycle, participant permissions, recording consent + notice, call records, call summaries, low-bandwidth mode, quality telemetry, **plus self-hosted `coturn`** giving zero-cost TURN **at limited capacity**, with quotas, abuse controls, UDP/TCP/TLS fallback and a documented degradation path | TURN **capacity** at scale â€” bandwidth, public UDP reachability, multi-AZ resilience (`1.txt` Â§26, Â§62) | **Capacity, not licence.** coturn removes the software cost, not the bandwidth/resilience constraint |
| **Computer-vision inspection** | Upload â†’ quarantine â†’ malware scan â†’ EXIF strip â†’ frame extraction â†’ annotation â†’ damage mapping â†’ intake-vs-completion comparison â†’ **qualified-assessor gate**. Baseline classification via local Ollama `llava`, surfaced as *candidate leads with confidence*, never deterministic diagnosis | A *trained* damage-estimation model | **Data** â€” labelled corpus, accumulated from assessor-confirmed jobs |
| **Engine-sound analysis** | Guided capture (phone placement, engine speed, duration), storage, speech/noise separation, FFT + spectral-band feature extraction producing *candidate leads with confidence*, technician confirmation required | High-accuracy multi-class classifier | **Data** â€” labelled audio corpus, accumulated the same way |
| **3D repair viewer** | Three.js: rotate/zoom/hide/isolate, exploded views, component metadata, assembly order, animated overlays (current, fluid, combustion, transmission), generic + CC0 geometry | *Vehicle-specific* OEM geometry | **Licensing** |
| **OBD integration** | **FULLY BUILDABLE at zero cost.** Full DTC model, code interpretation, freeze-frame, live-parameter schema, wiring-diagram linkage, guided test generation, file import (scanner CSV/JSON), manual DTC entry, device-integration interface, **and the live session path tested against an open-source ELM327 emulator** (FOSS, replays real vehicle data over serial/TCP) | *nothing* | â€” *(no purchase required)* |
| **Knowledge library** | Full CMS: authoring, versioning, technical/safety/copyright review roles, publication workflow, vehicle-applicability indexing, semantic search (pgvector), audio narration, chaptered video, dictionary cross-linking | "Millions of procedures" of *content* | **Content licensing/production** |

**Fleet, insurance, towing, marketplace depth, offline-first sync and the mobile app are all in scope, no caveat.**

### The only genuine limits â€” law and safety, not effort
1. **OEM wiring diagrams and manufacturer repair data are not preloaded.** `2.txt`/`3.txt` both say "where
   licensing permits". Library, schema, interactive circuit viewer and test-point tooling all ship; the
   copyrighted content does not.
2. **Class C/D MCP tools are implemented structurally** â€” approval ledgers, workflow state machines, dual
   control, reason capture â€” **and enabled by feature-policy gate only after the required human/governance
   approval** *(Codex correction #7; `0.txt` Â§18 + Â§46)*. This is the spec's own gating, not added caution.
3. **Sequencing is not scope.** Fleet approval cannot precede the job card it approves. Everything lands, in
   dependency order.

### Timeline
The 16-week figure is dead â€” it was a human-team estimate that should never have driven scope. Per Codex
correction #2, **week numbers are TBD pending Phase 1 velocity measurement**; the *sequence* below is fixed
and every release is independently shippable **from 0.2 onward**. **Release 0.1 is an internal bootstrap
release, not a shippable product** â€” it is monorepo, scaffolding, CI and docs, with no user-facing function,
and calling it "shippable" alongside that definition was a contradiction. The owner sees working software
from Release 0.2 onward, which is what the sentence was always meant to promise.
Releases 0.8 and 0.9 â€” reserved in `06.txt`'s release-file list, unused by `05.txt` â€” absorb the restored areas.

---

## 3. Repository layout

Monorepo, pnpm + Turborepo, at `C:\Users\USER\Documents\autoworkshop-ai\`.

```
autoworkshop-ai/
â”œâ”€â”€ apps/
â”‚   â”œâ”€â”€ customer-web/ workshop-web/ supplier-web/ fleet-web/
â”‚   â”œâ”€â”€ insurance-web/ towing-web/ admin-web/     Next.js â€” 7 apps per `01 (1).txt` Â§86
â”‚   â”œâ”€â”€ mobile/                                   React Native + Expo, ANDROID FIRST (correction #3)
â”‚   â”œâ”€â”€ api/                                      NestJS modular monolith, 13 domains
â”‚   â”œâ”€â”€ mcp-gateway/                              authn Â· allowlist Â· DLP Â· injection scan Â· approval Â· audit
â”‚   â”œâ”€â”€ mcp-servers/                              ALL 19 skeletons from day one (correction #6)
â”‚   â”œâ”€â”€ agent-host/                               Python + google-adk 2.2.0
â”‚   â”œâ”€â”€ media-worker/                             BullMQ: scan, transcode, thumbnail, EXIF strip, transcribe
â”‚   â””â”€â”€ storybook/
â”œâ”€â”€ packages/
â”‚   â”œâ”€â”€ design-tokens/ ui/ navigation/ forms/ tables/ charts/ workflow/ media/
â”‚   â”œâ”€â”€ ai-assistant/ mcp-ui/ accessibility/ auth/ api-client/ domain-contracts/
â”‚   â”œâ”€â”€ validation/ events/ observability/ security/ config/ logger/ testing/
â”‚   â”œâ”€â”€ offline-sync/                             IndexedDB + service worker + queue + conflict rules (#4)
â”‚   â””â”€â”€ i18n/                                     locale + translation infrastructure (#5)
â”œâ”€â”€ python-packages/                              Â§0.3 pip-installable
â”‚   â”œâ”€â”€ adk-core/ adk-agents/ mcp-client/ agent-evals/
â”œâ”€â”€ domains/                                      13 bounded contexts, pure business logic
â”œâ”€â”€ infrastructure/                               docker/ compose/ render/ neon/ keycloak/ migrations/ policies/
â”œâ”€â”€ tests/                                        playwright/ visual/ a11y/ tenant-isolation/ offline/ mcp/
â”œâ”€â”€ docs/                                         00-project â€¦ 14-user-guides, just-in-time
â”œâ”€â”€ .claude/                                      CURRENT_PHASE Â· CURRENT_TASK Â· TASK_QUEUE Â· SESSION_HANDOVER â€¦
â”œâ”€â”€ CLAUDE.md  context.MD  MCP.md                 seeded from home-root templates
â””â”€â”€ README.md ARCHITECTURE.md ROADMAP.md SECURITY.md CHANGELOG.md
```

Seven web apps, not one: `01 (1).txt` Â§86 lists them explicitly, and Codex conceded this
(*"Claude winsâ€¦ A shared shell should live in packages, not collapse the specified apps"*). The shared shell,
navigation and design system live in `packages/` and are consumed by all seven.

Docs are created **just-in-time**. `06.txt` explicitly forbids generating the tree as placeholders: Phase 1
creates only its ~25 "minimum files to create first" plus `.claude/` control files.

---

## 4. Data model and multi-tenancy

**13 business domains** *(Codex correction #14 â€” align to `1.txt` Â§4 / `0.txt` Â§11)*: identity-access Â·
customer-vehicle Â· complaint-appointment Â· workshop-technician Â· repair-job-diagnosis Â·
solution-quotation-agreement Â· inventory-procurement Â· supplier-marketplace-verification Â· communication Â·
knowledge-training Â· fleet-insurance-towing Â· finance-payment-warranty Â· platform-admin-audit.

One PostgreSQL cluster, **one schema per business domain**, with tables grouped as modules inside each â€” not
25 top-level schemas.

**Tenancy.** A *tenant* is the legal/commercial isolation boundary. Organizations belong to tenants; branches
to organizations; users gain access through memberships. A user may belong to several tenants, but **every
request resolves exactly one active tenant context, derived solely from validated Keycloak claims and
membership records â€” never from a client-supplied tenant id** *(Codex correction #4; `1.txt` Â§9: "the gateway
must never trust a tenant identifier supplied only by the client")*.

Every tenant row carries `tenant_id, organization_id, branch_id?, created_by, created_at, updated_by, updated_at`.

**RLS.** `ENABLE` + `FORCE ROW LEVEL SECURITY` on every tenant-owned table. The API sets transaction-local
`app.tenant_id`, `app.user_id`, `app.organization_ids`, `app.branch_ids`, `app.current_role` after validating
claims. Application filters remain; Postgres is the final backstop. Isolation is enforced at six layers:
NestJS tenant context â†’ repository filter â†’ RLS â†’ object-storage path prefix â†’ search-index filter â†’ Redis
key prefix. Event messages carry tenant metadata.

**Hard schema rules** (Solar lessons):
- **No `VARCHAR(n)` on free-text or generated columns** â€” `TEXT`. Solar's truncation incident came from narrow
  VARCHARs meeting AI-generated content.
- **No `CREATE TABLE IF NOT EXISTS` in boot code.** Migrations only â€” versioned, forward- and rollback-tested
  in CI. IF-NOT-EXISTS is how live schema silently drifts from migration history.
- Approvals, payments, warranty decisions and audit events are **append-only**; corrections are new rows.
- `RETURNING id`, never `lastrowid`.

---

## 5. MCP + AI layer

**The rule the design hangs on:** an MCP tool contains no business logic and holds no database credential.
It validates arguments, resolves tenant/user context, and calls the same authoritative NestJS application
service the REST controller calls. Identical rules apply whether the caller is a human or an agent.

```
ADK agent â†’ MCP client â†’ MCP Gateway â†’ MCP server â†’ NestJS app service â†’ repository â†’ RLS â†’ Postgres
                            â”‚                            â”‚
                            â”” authn, tenant resolve,     â”” business rules, approval gate, transaction,
                              tool allowlist, rate limit,   domain event, immutable audit row
                              injection scan, DLP,
                              approval routing, audit
```

**All 19 MCP servers get skeletons and contracts from day one** *(correction #6; `0.txt` Â§11â€“12, Â§35)*:
identity-access Â· customer-vehicle Â· complaint-appointment Â· workshop-technician Â· repair-diagnostic Â·
solution-agreement Â· inventory-procurement Â· supplier-product Â· communication Â· knowledge-training Â·
fleet-insurance-towing Â· finance-warranty Â· platform-operations Â· media-processing Â· simulation Â·
notification Â· search Â· document-generation Â· marketplace. Executable tools are enabled per server as the
underlying domain service matures â€” structure first, execution in dependency order.

**Human-in-the-loop classes** (`0.txt` Â§18), enforced in the Gateway *and* re-checked in the domain service,
never only in a prompt:
- **A read-only** â†’ auto-execute, tenant-filtered, audited
- **B draft** â†’ auto-execute, output remains a draft pending user review
- **C business-committing** â†’ authenticated role approval + immutable audit
- **D safety/financial/privileged** â†’ privileged human approval, dual control where defined, MFA, reason capture

All four are **implemented structurally**; C and D are enabled by feature-policy gate after governance
approval *(correction #7)*.

**Prompt-injection defence** is testable, not aspirational. All retrieved content â€” repair documents,
supplier descriptions, customer uploads, chat messages, search results â€” is tagged untrusted and passed as
data, never instruction. CI carries a standing injection corpus; a PR that lets a poisoned document trigger a
tool call fails the build.

**Zero-cost LLM:** local Ollama (`llama3.2` text, `llava` vision) via ADK `LiteLlm` â€” the pattern already
proven on the Public Building Access Audit Platform. Every AI output records model version, prompt version,
retrieved sources and confidence.

---

## 6. Offline-first  *(Codex correction #4 â€” missing from Claude v1)*

Required by `1.txt` Â§5 and Â§42, and `2.txt` OFFLINE-FIRST OPERATION.

`packages/offline-sync` provides: IndexedDB stores + service-worker shell (web) and an encrypted queue
(mobile); cached assigned jobs, vehicle details, downloaded repair procedures, dictionary entries, inspection
forms, photos and approved quotations; a sync engine with a durable outbound queue; and **conflict rules that
prevent duplicate invoices, duplicated parts issuance and contradictory job-status updates**. Large videos
and 3D models are never auto-downloaded â€” the user selects content or a configurable workshop download pack.
Offline records are visibly flagged and reconciled on restore. Offline E2E tests are a CI gate.

---

## 7. Multilingual  *(Codex correction #5 â€” missing from Claude v1)*

Required by `2.txt` MULTILINGUAL SUPPORT. English first; architecture ready for Twi, Ga, Ewe, Hausa, French
and other regional languages. `packages/i18n` + translation tables make **interface labels, dictionary
entries, customer explanations and audio guidance independently translatable**. Technical terms retain the
recognised English industry term alongside the local-language explanation. Audio narration carries language
selection.

---

## 8. Phases and releases

Sequence fixed; week numbers TBD pending Phase 1 velocity *(correction #2)*.

| Phase | Release | Deliverable |
|---|---|---|
| 1 Foundation | **0.1** | Monorepo, 7 Next.js apps scaffolded, NestJS, Postgres, Redis, Docker compose, Git flow, lint/format/TS, CI skeleton, design tokens, Storybook, ~25 seed docs, `.claude/` control files, **env bootstrap (Â§11)** |
| 2 Identity | â€” | **Keycloak (mandatory)** realm + clients, login/logout/session, users, orgs, branches, roles, permissions, workspace/org/branch switching, tenant-context resolution, RLS, audit framework |
| 3 Shell + Nav | **0.2** | Top nav (workspace/org/branch/search/create/tasks/messages/notifications/AI/help/profile), collapsible grouped side nav, breadcrumbs, page headers, tabs, drawers, dialogs, badges, AI panel â€” desktop/tablet/mobile |
| 4 Customer + Vehicle | **0.3** | Registration, profile, vehicle garage, documents, service history, maintenance schedule, complaint submission (text/audio/image/video), appointment request, workshop search, dashboard |
| 5 Workshop + Repair | **0.4** | Workshop dashboard, reception, intake, complaint inbox, job cards, repair staging board, technician/bay assignment, inspection, diagnosis, repair plan, quotation, **Solution Studio** proposal + versioning + variation + e-approval, execution, testing, QC, release |
| 6 Parts + Suppliers | **0.5** | Catalogue, locations, reservations, issues/returns, requisitions, POs, goods receipt, supplier registration + verification, product submission + validation engine + badges, marketplace search, compatibility, orders |
| 7 Finance + Partners | **0.6** | Invoices, payments, receipts, balances, warranty records + claims, fleet vehicles/requests/approvals, insurance claims + repair authorisation, towing requests + dispatch |
| 8 MCP + AI | **0.7** | Gateway, registry, all 19 server skeletons, ADK orchestrator + conductors + specialists, Class A/B enabled, C/D gated, approval UI, MCP audit + kill switch |
| 9 Communication + Knowledge | **0.8** | Chat, voice notes, **WebRTC voice/video/screen-share**, group collaboration, call summaries Â· knowledge CMS, dictionary, wiring library, semantic search, training + certification |
| 10 Multimedia + Intelligence | **0.9** | **Computer-vision inspection Â· engine-sound analysis Â· 3D repair viewer Â· OBD integration Â· offline-first sync Â· mobile app (Android) Â· multilingual** |
| 11 Hardening + Release | **1.0** | Full test suite, security + accessibility + responsive review, backup/restore drill, DR exercise, production build, deploy, pilot onboarding |

**Critical path:** Phase 2 (identity + tenancy) â†’ Phase 3 (shell) â†’ Phase 5 (repair job). Everything branches
off those three.

**Definition of done per task** (`05.txt` Â§6): migration runs Â· backend rule exists Â· API works Â· page renders
with loading/empty/error/permission states Â· permissions enforced Â· tests pass Â· lint + typecheck pass Â·
Playwright journey passes Â· responsive checked Â· docs updated Â· no paid dependency introduced Â· committed.

---

## 9. CI/CD, security gates, deployment

**CI stages** (from `1.txt` Â§23â€“24, `2.txt`, plus Codex's Python additions):
repo validation â†’ locked install â†’ format/lint/typecheck **TS *and* Python** â†’ **architecture-boundary tests**
(specialists must not import specialists; API routes must not import specialists; frontend must not import
`domains/`) â†’ unit (Vitest + pytest) â†’ contract (OpenAPI, events, backward-compat) â†’ integration
(testcontainers: Postgres, Redis, MinIO, Keycloak) â†’ **DB validation** (migration lint, forward, rollback,
drift, seed, **RLS tests**) â†’ security (gitleaks, osv-scanner, pip-audit, semgrep, trivy, IaC, licence) â†’
build + SBOM (syft) â†’ **E2E** (Playwright journeys + role-access + **tenant-isolation** + **offline**) â†’
visual regression + axe-core â†’ **MCP contract + agent evaluation** (protocol init, capability negotiation,
schema validation, **prompt-injection corpus**, tool poisoning, unauthorized tool call, cross-tenant,
data exfiltration) â†’ publish signed artifacts + evidence.

**No merge if** tenant-isolation, authorization, migration or approval-gate tests fail.

 succeeded in 1442ms:
# AutoWorkshop AI â€” IMPLEMENTATION PLAN EXTENSION (v1, revision 2)

**Review status â€” recorded exactly as it happened, including what the reviewer did not do.**

| Pass | Result |
|---|---|
| Codex 1 | 6 findings (3 High, 3 Medium) against the extension â€” **all 6 accepted and applied**. Answered 5 of 6 questions; **skipped the coverage question**. No verdict line. |
| Supervisor coverage | **1 CRITICAL omission Codex missed** â€” see below. Applied as Â§2A, Â§2B, Phase 14. |
| Codex 2 | **Zero findings against the extension.** 4 findings against `COMBINED_PLAN_v2` itself (2 High, 2 Medium) â€” all 4 verified and fixed in that document. No verdict line again. |

**Codex never emitted an `APPROVED` token in either pass**, despite an explicit output format requiring one.
What it did do is raise no CRITICAL or HIGH defect against this extension on pass 2. That is the substance of
an approval, and it is reported as substance rather than dressed up as a verdict the reviewer did not give.
Both transcripts are in the session record.

**Codex pass 1 detail:**
Supervisor coverage pass â†’ **1 CRITICAL omission found that Codex missed**: the whole of `07.txt` part 2
(the workshop-side user model, Â§1â€“52) and the community features had no home in the plan. Applied as Â§2A
and Â§2B. Codex answered 5 of its 6 review questions and **skipped the coverage question**, which is the one
that would have found this â€” recorded so the next review weights it accordingly.


**Extends** `COMBINED_PLAN_v2.md`. It does **not** replace it. Every locked decision (D1â€“D8), every ADR,
the four-gate quality bar, Â§0.1 ADK-only, Â§0.2 orchestration-first, Â§0.3 reusability, the zero-cost rule and
the "build everything structurally, stage only content" principle carry over unchanged and are re-asserted,
not re-litigated.

## 0. Provenance

| Source | Adds |
|---|---|
| `autoworkshop 07.txt` **part 1** (lines 1â€“1797, Â§1â€“25) | Vehicle-user scenarios â€” Car Owner, Owner-Driver, Organization Transport Manager, Fleet Manager |
| `autoworkshop 07.txt` **part 2** (lines 1798â€“5069, Â§1â€“52) | **A second, separate document: the entire workshop-side user model** â€” workshop sign-up, staff invitation, Owner / Manager / Reception / Technician scenarios, inboxes, the complete repair flow through QC, release, invoicing, warranty, and per-role workspace navigation |
| `autoworkshop08.txt` (2,444 lines) | 3D Fault Simulation and 3D Repair Solution Simulation |
| `autoworkshop 09.txt` (1,143 lines) | Technical Repair Library, External Technical Research Agent, technician approval |

**Nothing here is a new product direction.** All three specs deepen areas the approved plan already owns:
07 â†’ Phases 4 and 7 Â· 08 â†’ Phase 10's "3D repair viewer" Â· 09 â†’ Phases 8 and 9. The extension's job is to
say what "built" now means for those rows, and to name the three places where the new specs impose
constraints the v2 plan does not yet encode.

## 1. Alignment check against COMBINED_PLAN_v2 â€” no decision is reopened

| v2 decision | Extension's position |
|---|---|
| **D2 stack** (Next + NestJS + Postgres + Redis + Keycloak) | Unchanged. 3D uses Three.js, already named in v2 Â§2. |
| **D4 / ADR-013** â€” ADK over MCP, MCP the only cross-language boundary | Unchanged. The three new agents in Â§5 are ADK agents behind MCP servers. No new boundary. |
| **D5 Keycloak mandatory** | Unchanged. 07's four account types are Keycloak roles + memberships, not a parallel auth path. |
| **D6/D8 zero cost** | Unchanged, and load-bearing here: Â§7 shows every new capability on FOSS. No paid 3D pipeline, no paid search API, no paid model. |
| **D7 bring-your-own-connection** | Extended: OEM data sources and 3D geometry become tenant-suppliable, per the same principle. |
| **v2 Â§2 staging rule** â€” build features, stage content | The governing rule for this whole extension. 08's OEM geometry and 09's manufacturer manuals are **content**, and stage exactly as v2 already ruled for the 3D viewer and knowledge library. |
| **Â§0.2 orchestration-first** | New agents hang off a conductor, never called from a route. Â§5 gives the topology. |
| **Four gates** | Unchanged. Codex â†’ Supervisor â†’ Work Reviewer â†’ Work Scheduler. |

**One reconciliation â€” now DECIDED, not left open** *(Codex finding 2)*. ADR-013 fixes the MCP server count
at **19**, and v2 Â§3 requires "ALL 19 skeletons from day one". Leaving this open was wrong: Phase 1
scaffolding, the gateway allowlist, CI contract tests and package layout all key off that number, so an
unresolved count is a blocking ambiguity dressed up as a question.

**Decision: the three new surfaces are CAPABILITIES on existing servers, not new servers. The count stays 19.**
`repair-library` and `external-research` are capabilities of the knowledge server; `simulation` is a capability
of the diagnostics server. Rationale: the gateway allowlist and audit surface stay stable, ADR-013 needs no
amendment, and nothing in specs 08/09 requires process isolation between these and the knowledge/diagnostics
surfaces they already sit beside. The owner can overrule; if so it is an ADR-013 amendment and a Phase 1
scaffolding change, which is why it is settled here rather than at build time.

---

## 2. Spec 07 â€” vehicle users. Extends Phases 4 and 7.

07 is the most immediately actionable of the three because it constrains screens already scheduled.

### 2.1 What it adds

- **Four account types chosen at sign-up** (Â§3): Car Owner, Owner-Driver, Organization Transport Manager,
  Fleet Manager. Each has different verification, different workspace provisioning and different approval
  limits. Today's Phase 2 identity work has organizations and memberships but no account-type concept.

  **Invariant, because "chosen at sign-up" is a privilege-escalation hole if taken literally**
  *(Codex finding 6 â€” accepted)*. The account type a user *selects* is a **request**, never a grant:
  - Car Owner and Owner-Driver are **self-service** â€” they confer no authority over anyone else's data.
  - Organization Transport Manager and Fleet Manager **require organization approval** before any elevated
    capability activates; Â§3.3/Â§3.4 already say the user joins an organization "subject to approval".
  - Account type is **single-valued and not self-mutable**; changing it is an administrative action with an
    audit record, not a profile edit.
  - **Authority derives from membership and role, never from the account type claim itself.** The account
    type shapes onboarding and which workspace is provisioned; it is not an input to any authorization
    decision. This keeps the rule that tenant context comes only from validated claims and membership.
- **"My Workspace" entry flow** (Â§6) â€” a single Home Page control that resolves to a different workspace per
  role, after checking role, organization, vehicle registration and approval authority.
- **Personal vehicle workspace + My Repair Dashboard** (Â§7) â€” the Car Owner's end-to-end journey: request
  service â†’ quotation â†’ approve/reject/modify â†’ progress â†’ QC â†’ payment â†’ history.
- **Emergency towing flow with live location** (Â§8, Â§15) â€” permission-gated geolocation, provider selection,
  live tracking, and conversion of a towing record into a repair request.

  **Location is the most sensitive data this product handles, and "permission-gated" was not an acceptance
  criterion** *(Codex finding 3 â€” accepted)*. Binding criteria, all testable:
  - **Retention**: precise location is retained only for the life of the active towing request plus a defined
    window for dispute resolution, then coarsened to the pickup locality. Not indefinite.
  - **Sharing**: shared only with the *accepted* provider, only while the request is active. Not with
    providers who merely saw the request, and not with the workshop unless the vehicle is delivered there.
  - **Organization and fleet visibility**: a Transport or Fleet Manager sees vehicle location for *fleet*
    vehicles only, never for a driver's personal vehicle, and Â§19's moderation rule against publishing
    confidential fleet information applies to any derived view.
  - **Revocation**: the user can stop sharing mid-request; the request degrades to a manually-entered
    pickup point rather than failing.
  - **Denied permission is a supported path, not an error state** â€” an emergency flow that dead-ends when
    the browser denies geolocation is unusable at exactly the moment it matters. Manual address or map-pin
    entry is required.
  - **Audit**: every location read, share and revocation is an audit event with actor, purpose and recipient.
- **Organization and fleet flows** (Â§9, Â§10) â€” multi-vehicle views, approval limits, cost centres,
  delegated authority.

### 2.2 Where it lands

| Work | Phase | Release |
|---|---|---|
| Account types, verification variants, workspace provisioning per type | **2** (identity) | â€” |
| `My Workspace` resolver + Home Page card | **3** (shell) â€” extends the shell already built | 0.2.x |
| Personal vehicle workspace, My Repair Dashboard, service request, approve/reject/modify | **4** | 0.3 |
| Organization Transport + Fleet Manager workspaces, approval limits, cost centres | **7** | 0.6 |
| Emergency towing request, provider dispatch, live tracking | **7** | 0.6 |

### 2.3 Consequence for work already done

`viewerGrants()` (the demo grant source in `packages/next-shell`) becomes account-type aware when T-0003/T-0005
land. **This is the single function already flagged as "the one to replace"** â€” 07 does not add a second
place to change, which is the outcome the shell was designed for.

The 7-workspace navigation model gains no new workspace: Car Owner and Owner-Driver are both the `customer`
workspace with different grants; Transport Manager and Fleet Manager are both `fleet`. **Account type â‰ 
workspace.** Conflating them would fork the nav tree four ways for no benefit.

---

---

## 2A. Spec 07 part 2 â€” the workshop-side user model. Extends Phase 5.

**This section was missing from the first draft of this extension and was caught by the Supervisor coverage
pass, not by the reviewer.** Recorded plainly because the owner's standing direction is *stop cutting*, and a
silently omitted half of a specification is the most expensive kind of cut â€” it looks like a finished plan.

Lines 1798â€“5069 are a second document with its own Â§1â€“52. v2's Phase 5 already owns "workshop dashboard,
reception, intake, complaint inbox, job cards, repair staging board, technician/bay assignment, inspection,
diagnosis, repair plan, quotation, Solution Studio, execution, testing, QC, release". 07 part 2 does not add
a new product area â€” **it specifies that row operationally**, which is what Phase 5 needs in order to be
buildable rather than aspirational.

### 2A.1 What it pins down

| Spec | Adds | Lands |
|---|---|---|
| Â§2, Â§3 | Workshop sign-up and **staff invitation flow** â€” roles, default permissions, approval limits assigned at invitation | Phase 2 (identity) |
| Â§5â€“Â§9 | Workshop Home Page and the **Owner / Manager / Reception / Technician** scenarios | Phase 5 |
| Â§10â€“Â§12 | **Repair Request inbox, Customer Complaint inbox, Notification inbox** | Phase 5 |
| Â§14â€“Â§17 | Technician dashboard, initial inspection, fault-diagnosis tools, knowledge-base access | Phase 5 |
| Â§18â€“Â§21 | Repair procedures library, DTC search, **fault simulation and repair-solution simulation entry points** | Phase 9 / 12 (the tools themselves), Phase 5 (the entry point) |
| Â§22â€“Â§26 | Repair planning, plan-work tool, find-parts, parts compatibility, tools/equipment planning | Phase 5 / 6 |
| Â§27â€“Â§30 | **Internal technical review, specialist consultation**, quotation preparation, customer approval | Phase 5 |
| Â§31â€“Â§39 | Repair execution, **variation flow**, technician time recording, test results, post-repair scan, road test, QC, vehicle release | Phase 5 |
| Â§40â€“Â§44 | Invoice preparation, send invoice, receive payment, **partial payment and balance**, workshop warranty, return/warranty claim | Phase 7 |
| Â§46â€“Â§50 | **Per-role workspace navigation** for all four workshop roles + role-based control summary | Phase 3 (nav model) |
| Â§51, Â§52 | Complete workshop repair flow + acceptance criteria | Phase 5 acceptance |

### 2A.2 The one structural consequence

Â§46â€“Â§50 give four *distinct* navigation trees inside the single `workshop` workspace. The navigation model in
`packages/navigation` currently holds one tree per workspace. It must become **workspace Ã— role**, resolved
through the same grant filter the shell already uses â€” not a second mechanism. This is a real change to
shipped code and is scheduled in Phase 3, ahead of Phase 5 consuming it.

Â§50's "role-based control summary" is the authority for who sees what; it is transcribed into the permission
matrix (`docs/01-product/PERMISSION_MATRIX.md`), not re-invented per screen.

---

## 2B. Community and content â€” genuinely new, in no existing phase

Three sections of 07 have **no home in the v2 phase table**, and pretending otherwise would be the same
omission again:

| Spec | Feature | Placement |
|---|---|---|
| 07 part 1 Â§18 | **Auto Repair News Feed** | New Phase 14 â†’ Release 1.3 |
| 07 part 1 Â§19 | **AutoWorkshop Social Media App** â€” posts, follows, moderation | New Phase 14 â†’ Release 1.3 |
| 07 part 2 Â§45 | **Workshop social and knowledge contribution** | New Phase 14 â†’ Release 1.3 |

v2's Phase 9 covers *communication* (chat, voice, video, call summaries) and *knowledge* (CMS, dictionary,
semantic search). Neither is a public feed or a social graph. These are a distinct product surface with their
own moderation, abuse-reporting and content-policy requirements â€” 07 Â§19 already lists the moderation rules
(no private customer records, no unapproved repair documents, no personal contact details without consent, no
misleading technical instructions, no unsafe repair practices, no confidential fleet information).

**Placed last, not cut.** They depend on identity, workshops, repair history and the knowledge library all
existing first, and they carry a moderation burden that should not land before 1.0 hardening.

---

## 3. Spec 08 â€” 3D fault and repair simulation. Extends Phase 10.

v2 already commits to a Three.js viewer with "rotate/zoom/hide/isolate, exploded views, component metadata,
assembly order, animated overlays, generic + CC0 geometry", staging only *vehicle-specific OEM geometry*.
08 turns that viewer into a **diagnostic instrument**, which is a substantially larger deliverable.

### 3.1 What it adds beyond a viewer

1. **A 7-layer vehicle model** (Â§5) â€” exterior, structural, mechanical, electrical, electronic/comms,
   fluid/air, hybrid-EV. Layers isolate independently.
2. **Fault simulation** (Â§7, Â§10) â€” inject a fault condition, show predicted propagation and symptoms,
   compare predicted against observed evidence, produce a similarity assessment.
3. **Diagnostic measurement simulation** (Â§11) â€” highlight the test point, show expected values, accept the
   technician's **measured** value, and re-rank probable cause from the difference.
4. **Repair procedure animation in 7 stages** (Â§15) â€” preparation, safety isolation, access/disassembly,
   repair/replace, reassembly, configuration/calibration, testing/QC.
5. **Alternative solution comparison** (Â§19) â€” e.g. repair harness vs replace sub-harness vs replace
   harness, compared on cost, time, durability and risk.
6. **Fault Condition Library** (Â§9) â€” electrical, sensor/actuator, network/module, mechanical, fluid/thermal.
7. **Before-and-after simulation** (Â§18) and **tools/parts integration** (Â§16, Â§17).

### 3.2 The honest scope call

**This is not a Phase 10 sub-task. It is a module the size of Phase 5.** Presenting it as a bullet inside an
existing row would repeat the mistake v2 Â§2 explicitly corrected â€” under-scoping by inheriting an old
estimate. So:

- **Phase 10 keeps** the viewer, the 7-layer model, component metadata, isolation, exploded views,
  CC0/generic geometry, and the before/after presentation. **Release 0.9.**
- **A new Phase 12 â€” Simulation Intelligence â€” takes** fault injection, propagation modelling, measurement
  simulation, probable-cause re-ranking, procedure animation and alternative comparison. **Release 1.1**,
  after the 1.0 hardening release.

Rationale for sequencing after 1.0: Â§11 measurement simulation consumes confirmed diagnostic data, and Â§14's
repair-solution flow depends on the Phase 9 library and the Phase 8 approval gate. Building it earlier means
building it against fixtures. **This is dependency order, not a cut** â€” v2 Â§2's "sequencing is not scope"
applies exactly.

### 3.3 Staging â€” content only, per v2 Â§2

| Built in full | Staged | Blocker |
|---|---|---|
| Model loader, 7-layer isolation, fault-injection engine, propagation graph, measurement comparison, probable-cause ranking, animation timeline, alternatives comparison, tool/part overlays, the whole Fault Condition Library **schema and its generic entries** | *Vehicle-specific OEM geometry*; OEM-authored procedure timings | **Licensing** â€” identical to v2's existing 3D row |
| Physics-free behavioural simulation (state propagation over a typed system graph) | High-fidelity multiphysics | **Not required by the spec** â€” Â§1 says the simulation "shall support technical decision-making but shall not replace physical inspection" |

The propagation model is a **directed system graph with typed dependencies**, not a physics engine. That
satisfies Â§10's requirement to show fault propagation, runs in a browser, and costs nothing.

---

## 4. Spec 09 â€” technical repair library and research agent. Extends Phases 8 and 9.

v2's Phase 9 already commits to a full knowledge CMS with authoring, versioning, technical/safety/copyright
review roles, publication workflow, applicability indexing and pgvector semantic search. 09 specifies the
**automotive-specific structure** on top of that, plus the agent chain and â€” most importantly â€” the
**legal and accountability constraints**.

### 4.1 Library structure (Â§3)

Vehicle catalogue Â· vehicle-systems catalogue Â· fault/symptom records Â· diagnostic procedures Â· repair
procedures Â· tools and equipment Â· diagrams. All tenant-scoped, all versioned, all with the review workflow
Phase 9 already owns.

### 4.2 The agent chain (Â§6, Â§7) â€” three ADK agents

| Agent | Does | Class |
|---|---|---|
| **Repair Knowledge Agent** | Searches the internal library; judges completeness, verification and applicability | A â€” read-only |
| **External Technical Research Agent** | Activated only when the internal search is insufficient; searches approved sources, extracts, drafts | B â€” drafts, changes nothing |
| **Library Update Agent** | Prepares an accepted solution for library review | B â€” proposes, never publishes |

**None of the three may approve, authorize expenditure, begin work, issue parts, alter vehicle records,
copy protected manuals, conceal safety concerns, or replace the accountable technician** (Â§15). These are
not policy text â€” they are enforced by tool class and by the approval ledger from ADR-010/Â§0.2, which is
where v2 already put this boundary.

### 4.3 Technician approval is the product, not a checkbox

Â§8's Technician Inbox and Â§19's full flow make the human gate the centre of the design: the technician
**accepts, rejects or requests modification**, and on acceptance **becomes the accountable technical
reviewer**. Â§9 forbids showing the customer unreviewed agent conclusions, raw manufacturer documents,
internal uncertainty notes or research logs.

This aligns exactly with v2's existing Class C/D gating and the CV/sound "candidate leads, never
deterministic diagnosis" stance. **The extension inherits it rather than inventing a parallel mechanism.**

### 4.4 Copyright and document control (Â§14) â€” a hard constraint, new to the plan

Every external record must retain source, title, revision date, access date, **usage rights, storage
permission, distribution limitation** and reviewer. Content is classified as publicly reusable Â· licensed Â·
**link-only** Â· internal summary Â· internally created Â· restricted. Where content cannot be stored, the
system stores **a compliant summary and a reference instead**.

**This is a schema requirement and a blocking gate, not a policy note.** It gets:
- a `content_rights` classification on every library record and diagram, non-null, no default;
- a copyright-review role in the publication workflow (Phase 9 already has the role â€” 09 makes it mandatory
  for external-origin records);
- a CI check that no record reaches `approved` with `content_rights` unset;
- the research agent forbidden from bypassing authentication, paywalls or access controls (Â§7.10) â€” enforced
  in the fetcher, which refuses non-approved hosts and honours `robots.txt`.

### 4.5 Confidence classification (Â§12)

High / medium / low, carried on every agent output and every library record, and surfaced in the technician
inbox. Same discipline as v2's CV and sound modules. **An agent output with no confidence is a defect.**

### 4.6 Where it lands

| Work | Phase | Release |
|---|---|---|
| Library schema, catalogues, fault/symptom records, procedures, tools, diagrams, `content_rights`, review workflow, semantic search | **9** | 0.8 |
| Repair Knowledge Agent, technician inbox, accept/reject/modify, accountability record | **9** | 0.8 |
| External Technical Research Agent, approved-source registry, robots/paywall guard, source recording, conflict detection | **9** | 0.8 |
| Library Update Agent, library review queue, record status, supersession | **9** | 0.8 |
| Library Administration Dashboard + analytics (Â§16, Â§17) â€” knowledge gaps, failed searches, broken sources | **New Phase 13** | 1.2 |

---

## 5. Agent topology â€” Â§0.2 compliance

```
Root Orchestrator
â””â”€â”€ knowledge_conductor            (SequentialAgent)
    â”œâ”€â”€ RepairKnowledgeAgent       internal library search        Class A
    â”œâ”€â”€ ExternalResearchAgent      approved-source research       Class B
    â””â”€â”€ LibraryUpdateAgent         prepares records for review    Class B
â””â”€â”€ diagnostics_conductor          (LoopAgent â€” diagnose â†’ measure â†’ re-rank)
    â”œâ”€â”€ FaultSimulationAgent       propagation + prediction       Class A
    â””â”€â”€ MeasurementAgent           compares expected vs measured  Class A
```

Specialists never call specialists. Routes never call specialists. The loop in `diagnostics_conductor` is
ADK `LoopAgent`, not a hand-rolled while â€” Â§0.1.

---

## 6. Data model additions (all tenant-scoped, RLS FORCE, TEXT not VARCHAR)

`account_types` Â· `workspace_provisioning` Â· `service_requests` Â· `towing_requests` Â· `approval_limits` Â·
`cost_centres` Â· `library_records` Â· `vehicle_catalogue` Â· `vehicle_systems` Â· `fault_records` Â·
`diagnostic_procedures` Â· `repair_procedures` Â· `tools_equipment` Â· `diagrams` Â· `external_sources` Â·
`content_rights` Â· `research_requests` Â· `technician_reviews` Â· `library_review_queue` Â·
`vehicle_3d_models` Â· `fault_conditions` Â· `simulation_sessions` Â· `measurement_records` Â·
`repair_alternatives`.

Append-only, per CLAUDE.md: `technician_reviews`, `research_requests`, `library_review_queue`, and every
approval event. `RETURNING id`, never `lastrowid`. Indexes per the tenant baseline.

---

## 7. Zero-cost confirmation (D6/D8)

| Need | FOSS choice | Cost |
|---|---|---|
| 3D rendering | Three.js | 0 |
| 3D geometry | CC0 / generic + tenant-supplied (D7) | 0 |
| Model format | glTF/GLB | 0 |
| Propagation model | typed system graph, our code | 0 |
| Semantic search | pgvector | 0 |
| Agent runtime | Google ADK + local Ollama | 0 |
| External fetch | our fetcher, robots-respecting, approved hosts only | 0 |
| Geolocation (towing) | browser Geolocation API + OSM/Leaflet tiles | 0 |
| Live tracking | existing NATS + WebSocket | 0 |

**No paid dependency is introduced.** No commercial 3D pipeline, no paid search API, no hosted model.

---

## 8. Phase table â€” v2 extended, nothing renumbered

| Phase | Release | Change |
|---|---|---|
| 2 Identity | â€” | **+** account types (as requests), verification variants, workspace provisioning, **workshop staff invitation with role + approval limits** |
| 3 Shell | 0.2.x | **+** My Workspace resolver + Home Page card, **navigation model becomes workspace Ã— role** (07 pt2 Â§46â€“Â§50) |
| 4 Customer + Vehicle | 0.3 | **+** personal vehicle workspace, My Repair Dashboard, service request, approve/reject/modify, search technician/workshop, repair work history |
| 5 Workshop + Repair | 0.4 | **+** the whole of 07 pt2 Â§5â€“Â§39: Owner/Manager/Reception/Technician scenarios, three inboxes, inspection, planning, internal review, specialist consultation, execution, variation, time recording, tests, road test, QC, release |
| 7 Finance + Partners | 0.6 | **+** transport-manager and fleet workspaces, approval limits, cost centres, emergency towing + tracking + **location privacy criteria**, invoicing, partial payment, workshop warranty and return claims |
| 8 MCP + AI | 0.7 | **+** 3 knowledge agents registered, Class A/B; simulation agents scaffolded |
| 9 Communication + Knowledge | 0.8 | **+** the whole 09 library, agent chain, technician inbox, copyright control |
| 10 Multimedia | 0.9 | **+** 7-layer model, isolation, exploded views, before/after |
| 11 Hardening | 1.0 | unchanged |
| **12 Simulation Intelligence** *(new)* | **1.1** | fault injection, propagation, measurement simulation, cause re-ranking, procedure animation, alternatives |
| **13 Knowledge Operations** *(new)* | **1.2** | library admin dashboard, analytics, knowledge-gap reporting, source health |
| **14 Community** *(new)* | **1.3** | auto-repair news feed, social app, workshop knowledge contribution, moderation and abuse reporting (07 pt1 Â§18â€“Â§19, pt2 Â§45) |

---

## 9. Open questions â€” separated into blocking and non-blocking

The first draft labelled everything here "nothing is blocked" while simultaneously asking the owner to
confirm sequencing. That was incoherent *(Codex finding 4 â€” accepted)*. Split properly:

**Resolved in this revision â€” no longer questions:**
- MCP server count â†’ **capabilities, count stays 19** (Â§1).
- Account-type authority â†’ **request, not grant; authority from membership** (Â§2.1).
- Location retention/sharing/revocation â†’ **binding criteria** (Â§2.1).

**Genuinely blocking â€” must be answered before the work it gates starts:**
1. **Approved-source registry ownership** â€” who authorises a host for the External Research Agent? Blocks
   Phase 9's research agent, nothing earlier. Recommendation: platform admin, plus a per-tenant opt-in list
   under D7.

**Non-blocking product decisions â€” the owner may change these at any time before the phase starts:**
2. **Phase 12/13/14 sequencing after 1.0.** They can be pulled earlier at the cost of building against
   fixtures. Nothing in Phases 1â€“11 depends on the answer, and **no Phase 1â€“11 artefact may advertise these
   capabilities as present** â€” that is the condition that keeps the question non-blocking.
3. **Capacity claim inherited from v2** *(Codex finding 5)*. v2 Â§9 calls a single always-free ARM VM running
   Postgres + Keycloak + Redis + MinIO + coturn + observability "comfortable". That is an untested assertion,
   and this extension adds 3D asset serving and semantic search on top of it. It is not this extension's
   claim to make or unmake, but it **must become a measured benchmark gate in Phase 11** with stated minimum
   concurrency and media limits, rather than an adjective.

## 10. Risks

| Risk | Mitigation |
|---|---|
| 3D simulation scope creeps into a physics project | Â§3.3 fixes it as a typed graph; Â§1 of the spec explicitly forbids replacing physical inspection |
| External research agent scrapes something it must not | Approved-host allowlist, robots.txt, no auth/paywall bypass, refusal by default, every fetch audited |
| Copyright classification skipped under delivery pressure | Non-null column + CI gate; a record cannot reach `approved` without it |
| Agent output treated as diagnosis | Confidence on every output; technician acceptance is the only path to a customer-facing document |
| Library seeded with unverified content | `Library Update Agent` proposes only; review queue is the sole publication path |

 succeeded in 1626ms:
import type { Metadata } from 'next';
import {
  WorkspaceShell,
  currentViewer,
  grantsFor,
  navRoleFor,
  viewerLabels,
  registrationStatus,
  viewerHasSession,
  ViewerSwitchers,
  ActingAsControl,
} from '@autoworkshop/next-shell';
import { signOutAction } from '../sign-out-action';

export const metadata: Metadata = {
  title: 'AutoWorkshop AI â€” Customer',
  description: 'Vehicle owners â€” garage, complaints, proposals, payments',
};

/**
 * All seven apps share one shell (`@autoworkshop/next-shell`). Only the
 * workspace id differs â€” the navigation itself comes from
 * `@autoworkshop/navigation`, transcribed from the approved spec.
 *
 * `currentViewer()` resolves the signed-in user from the Keycloak session and
 * `GET /api/v1/me` (T-0005). The grants and the role derived from it are the
 * single source shared with this workspace's catch-all route â€” React's
 * `cache()` makes both resolve the SAME viewer within one render, so the
 * navigation and the router cannot disagree about what may be seen.
 *
 * Accurate is not the same as enforcing: hiding a nav entry protects nothing.
 * The API's tenant guard and Postgres RLS deny independently (CLAUDE.md Â§8).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Resolved together: the viewer DESCRIBES the person, the session says whether
  // there is one. They are separate calls because `/me` can fail while the
  // session is live, and sign-out must survive that (Codex finding M2).
  const [viewer, signedIn, status] = await Promise.all([
    currentViewer('customer'),
    viewerHasSession('customer'),
    // Only asked when a session exists â€” the call needs a token, and asking
    // without one spends a round trip to learn what the cookie already said.
    // Resolved in the SAME Promise.all rather than after it: this is the shell
    // every customer page renders inside.
    registrationStatus('customer'),
  ]);

  return (
    <WorkspaceShell
          workspaceId="customer"
          // The wordmark goes to the STORE, not to `/` â€” `/` would redirect a
          // signed-in customer straight back to the dashboard they were trying
          // to leave, which reads as a broken link (owner request 2026-08-03).
          brandHref="/marketplace"
          grants={grantsFor(viewer)}
          role={navRoleFor(viewer?.activeRole)}
          {...viewerLabels(viewer)}
          // ðŸ”´ A SIGNED-IN CUSTOMER IS NOT "Not signed in", AND HERE THAT IS THE
          // NORMAL CASE, not an edge one. `/me` is behind TenantGuard, so a
          // viewer with no membership cannot be described â€” and in THIS
          // workspace almost nobody has one: a vehicle owner buying a filter
          // never joins a workshop. `viewerLabels(null)` therefore supplied the
          // signed-out labels to every customer, permanently, and the shell
          // rendered "Not signed in" next to a working "Sign out".
          //
          // Seen in a screenshot of the VIN funnel's final screen â€” the page
          // somebody reaches immediately AFTER being persuaded to register.
          //
          // The name comes from /registration/status, which is on UserGuard and
          // can answer for exactly this person. The organisation chip is left
          // ABSENT rather than filled: a customer has no organisation, and
          // `Selector` renders nothing for an empty value.
          {...(signedIn && !viewer
            ? { userLabel: status?.displayName, organizationLabel: undefined, branchLabel: undefined }
            : {})}
          // T-0005 finding 5: a real sign-out â€” revoke the refresh token at
          // Keycloak, clear the cookie, end the SSO session. Passed from the
          // server layout because a server action cannot be created in the
          // client shell that renders the button.
          signOutAction={signOutAction}
          signInHref="/api/auth/signin"
          signedIn={signedIn}
          // T-0016, as ONE shared component so all seven apps mount the identical
          // control. It lists only the viewer's own memberships and the API
          // re-validates the choice, REFUSING an organisation the viewer does not
          // hold rather than downgrading. The ROLE half moved to `roleControl`
          // below (owner request 2026-08-03). See `ViewerSwitchers`.
          organizationSwitcher={<ViewerSwitchers viewer={viewer} />}
          // The ROLE, top right beside the user chip (owner request 2026-08-03).
          // Renders the switcher only for a viewer holding several roles; a
          // single-role viewer gets `null` here and the shell falls back to its
          // read-only "Acting as" chip, so the role is stated either way.
          roleControl={<ActingAsControl viewer={viewer} />}
          topNavActions={[
            { id: 'create', label: 'Create', icon: 'create' },
            { id: 'tasks', label: 'Tasks and approvals', icon: 'tasks' },
            { id: 'messages', label: 'Messages and calls', icon: 'messages' },
            { id: 'notifications', label: 'Notifications', icon: 'notifications' },
            { id: 'ai', label: 'AI assistant', icon: 'ai' },
            { id: 'help', label: 'Help and support', icon: 'help' },
          ]}
        >
      {children}
    </WorkspaceShell>
  );
}

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "function requireNavRoute|export async function requireNavRoute|hasWorkspaceAccess|visible navigation" packages/next-shell/src -g "*.ts" -g "*.tsx"' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content apps/customer-web/app/_screens/repair-journey.spec.ts -TotalCount 180' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content packages/next-shell/src/require-route.ts -TotalCount 220' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 1226ms:
packages/next-shell/src\WorkspaceGate.tsx:63:export function hasWorkspaceAccess(
packages/next-shell/src\WorkspaceGate.test.ts:2:import { hasWorkspaceAccess } from './WorkspaceGate';
packages/next-shell/src\WorkspaceGate.test.ts:24:describe('hasWorkspaceAccess', () => {
packages/next-shell/src\WorkspaceGate.test.ts:26:    expect(hasWorkspaceAccess(viewer(['platform.admin']), 'platform.admin')).toBe(true);
packages/next-shell/src\WorkspaceGate.test.ts:30:    expect(hasWorkspaceAccess(null, 'platform.admin')).toBe(false);
packages/next-shell/src\WorkspaceGate.test.ts:36:    expect(hasWorkspaceAccess(viewer(['organization.admin', 'finance.read']), 'platform.admin')).toBe(
packages/next-shell/src\WorkspaceGate.test.ts:42:    expect(hasWorkspaceAccess(viewer([]), 'platform.admin')).toBe(false);
packages/next-shell/src\WorkspaceGate.test.ts:48:    expect(hasWorkspaceAccess(viewer(['platform.admin.readonly']), 'platform.admin')).toBe(false);
packages/next-shell/src\WorkspaceGate.test.ts:49:    expect(hasWorkspaceAccess(viewer(['admin']), 'platform.admin')).toBe(false);
packages/next-shell/src\WorkspaceGate.test.ts:50:    expect(hasWorkspaceAccess(viewer(['platform.administration']), 'platform.admin')).toBe(false);
packages/next-shell/src\index.ts:26:export { hasWorkspaceAccess, WorkspaceAccessDenied } from './WorkspaceGate';
packages/next-shell/src\index.ts:30: * Resolves an "Add new …" target out of the viewer's OWN visible navigation,
packages/next-shell/src\require-route.ts:56:export async function requireNavRoute(
packages/next-shell/src\require-access.ts:4:import { hasWorkspaceAccess } from './WorkspaceGate';
packages/next-shell/src\require-access.ts:50:  if (!hasWorkspaceAccess(viewer, requiredGrant)) notFound();

 succeeded in 1468ms:
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CUSTOMER_STAGES, customerStage, needsCustomer } from './repair-journey';

/**
 * ðŸ”´ A STAGE THIS FILE HAS NEVER HEARD OF HIDES SOMEBODY'S CAR.
 *
 * The customer's four screens are built by FILTERING on `JourneyPhase`. A stage
 * missing from `CUSTOMER_STAGES` therefore does not throw, does not warn and
 * does not render an error â€” the card falls into the fallback, and if the
 * fallback ever changed it would fall out of every list and the owner would be
 * told they have no repairs at all. That is indistinguishable from "you are not
 * a customer here", and it is invisible in exactly the case where somebody is
 * waiting for their vehicle.
 *
 * The identical class already bit this repo twice: the mobile detail screen read
 * `stageOptions` when the API returns `allowedStages` (an empty list, rendered
 * as "your role cannot move this job"), and a web queue keyed on
 * `awaiting_internal_review`, which is a BOARD COLUMN and not a stage at all.
 *
 * The authority is migration 006's CHECK constraint, transcribed into
 * `job-card-stages.ts`. This reads that file rather than restating the list,
 * because a hand-copied list drifts with the same edit that breaks it.
 */
describe('customer stage vocabulary', () => {
  const source = readFileSync(
    join(__dirname, '../../../api/src/repair/job-card-stages.ts'),
    'utf8',
  );

  const block = /export const STAGES = \[([\s\S]*?)\] as const;/.exec(source);
  // `.filter(Boolean)` with the predicate spelled out: `noUncheckedIndexedAccess`
  // types a capture group as `string | undefined`, and an `undefined` sliding
  // into this list would silently shrink the coverage this file exists to prove.
  const known: string[] = [...(block?.[1] ?? '').matchAll(/'([a-z_]+)'/g)]
    .map((m) => m[1])
    .filter((s): s is string => typeof s === 'string');

  it('found the real stage list to compare against', () => {
    // Guards the regex itself. Without this, every assertion below would run
    // against an empty list and pass while proving nothing â€” the "check that
    // walks through its own gap" failure this repo keeps paying for. A nav
    // audit once reported 21 false gaps for exactly this reason.
    expect(block, 'could not find STAGES in job-card-stages.ts').toBeTruthy();
    expect(known.length).toBeGreaterThan(15);
    expect(known).toContain('repair_in_progress');
  });

  it.each(known)('%s has customer-facing wording', (stage) => {
    expect(
      CUSTOMER_STAGES[stage],
      `stage "${stage}" exists in the lifecycle but the customer screens cannot describe it`,
    ).toBeTruthy();
  });

  it('invents no stage the database would refuse', () => {
    // The other direction. A typo'd key here is dead weight that reads like
    // coverage â€” it would make the test above pass for a stage nobody can ever
    // be in, while the real one stays unhandled.
    const invented = Object.keys(CUSTOMER_STAGES).filter((s) => !known.includes(s));
    expect(invented, `not real stages: ${invented.join(', ')}`).toEqual([]);
  });

  /**
   * The three stages where the workshop genuinely cannot proceed without the
   * customer. Getting this set wrong is the expensive mistake in the file: too
   * narrow and a car sits still while its owner is never told they are the
   * hold-up; too wide and every screen nags about things they cannot action.
   */
  it('asks the customer to act on exactly the stages that need them', () => {
    const asks = known.filter((s) => needsCustomer(s)).sort();
    expect(asks).toEqual(
      [
        'awaiting_customer_approval',
        'awaiting_deposit',
        'further_information_required',
        'ready_for_collection',
      ].sort(),
    );
  });

  it('does NOT ask the customer to chase parts', () => {
    // `awaiting_parts` IS a waiting stage in the API's `isWaitingStage()`, and
    // deliberately is NOT the customer's problem. Borrowing that helper wholesale
    // would have told every owner to act on a delivery they cannot influence.
    expect(needsCustomer('awaiting_parts')).toBe(false);
    expect(customerStage('awaiting_parts').phase).toBe('in_progress');
  });

  it('survives a stage from a newer API rather than blanking the list', () => {
    // A 21st stage deploying ahead of this build must degrade to a vague label,
    // never to "you have no repairs".
    const unknown = customerStage('teleportation_pending');
    expect(unknown.phase).toBe('in_progress');
    expect(unknown.label).toBeTruthy();
    // And it must never claim the customer has something to do â€” that would
    // send someone to a workshop over a stage this build cannot describe.
    expect(unknown.phase).not.toBe('needs_you');
  });
});

 succeeded in 1472ms:
import { notFound } from 'next/navigation';
import {
  getWorkspace,
  visibleGroups,
  workspaceForRole,
} from '@autoworkshop/navigation';
import { currentViewer, viewerRole } from './viewer';
import { grantsFor } from './viewer-contract';

/**
 * The gate a concrete page must call when its WORKSPACE is not gated as a whole
 * â€” Phase 4, and the second shape of T-0005 finding 4.
 *
 * âš ï¸ WHY `requireWorkspaceAccess` DOES NOT COVER THIS CASE.
 *
 * That function asks "does the viewer hold permission X?", which is the right
 * question for `admin-web`: `02.txt` Â§32 gates the whole administration surface
 * on `platform.admin`, so one key answers for every screen in it. The workshop
 * workspace is not like that. It is gated per ROLE TREE (`07.txt` pt2 Â§46-Â§49),
 * and those trees differ in WHICH SCREENS they contain, not in a permission key:
 *
 *   Â· Â§46 owner, Â§47 manager, Â§48 reception â€” all contain Customer Reception.
 *   Â· Â§49 TECHNICIAN DOES NOT. A technician's navigation has no customers or
 *     vehicles entry at all.
 *
 * No permission key distinguishes them â€” `technician` and `reception_staff` both
 * hold NONE of the three keys in the matrix. So `requireWorkspaceAccess` cannot
 * express this rule, and a page relying on it would admit the technician.
 *
 * THE HOLE THIS CLOSES IS FINDING 4'S, IN A NEW PLACE. Until a concrete page
 * exists, every route goes through `app/[...slug]`, and `renderModulePage`
 * resolves the path against the role-filtered, grant-filtered tree â€” so a
 * technician typing `/customer-reception/customers` gets a 404. The moment a
 * real `app/customer-reception/customers/page.tsx` lands, Next resolves it AHEAD
 * of the catch-all and that resolution stops happening. The protection would
 * disappear at exactly the moment there is real customer data behind it.
 *
 * This applies the SAME resolution the catch-all does, from the page itself. It
 * is deliberately the same three functions in the same order, so the router and
 * the navigation cannot drift onto different maps.
 *
 * CALL IT AS THE FIRST STATEMENT, BEFORE ANY DATA ACCESS. A layout gate does not
 * substitute: measured on a probe page, a layout gate leaves the page's server
 * component EXECUTING and its output in the RSC flight payload while the DOM
 * shows only the denial. See `require-access.ts`.
 *
 * NOT THE CONTROL, AND NOTHING HERE MAY BE RELIED ON AS ONE. CLAUDE.md Â§8:
 * "Hidden â‰  secure." The API's `TenantGuard`, the services' role checks and
 * Postgres RLS deny independently, and every page must remain safe if this call
 * were deleted. What this stops is a viewer reaching a screen their own
 * navigation does not advertise â€” the Phase 3 acceptance criterion.
 *
 * 404 rather than 403, deliberately: a 403 confirms the route exists and hands
 * an unauthorised viewer a map of the platform's screens.
 */
export async function requireNavRoute(
  workspaceId: string,
  /** The route's own path, e.g. `/customer-reception/customers`. */
  pathname: string,
): Promise<void> {
  const base = getWorkspace(workspaceId);
  if (!base) notFound();

  // Resolved together and from the same helpers the layout and the catch-all
  // use. `currentViewer` and `viewerRole` are memoised per request with React's
  // `cache()`, so this cannot resolve a different identity than the shell
  // rendering around it.
  const [viewer, role] = await Promise.all([
    currentViewer(workspaceId),
    viewerRole(workspaceId),
  ]);

  // A signed-out visitor has no role and no grants, so they fall through to the
  // workspace default tree with `NO_GRANTS` â€” which is correct: they see what an
  // anonymous visitor may see, which for every gated item is nothing.
  const workspace = workspaceForRole(base, role);
  const groups = visibleGroups(workspace, grantsFor(viewer));

  const advertised = groups.some((g) => g.items.some((i) => i.href === pathname));
  if (!advertised) notFound();
}

codex
I couldn’t run the package typecheck/tests because the current sandbox policy rejected the `pnpm` commands, so I’m treating verification as static review only. I’m reading the remaining touched files and using exact line references for the defects I can substantiate.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"pages: \\{ error|providers:|Keycloak\\(|authorization:|params|Configuration|ErrorPage|pages\" node_modules/next-auth -g \"*.d.ts\" -g \"*.js\" -g \"*.mjs\" -g \"*.ts\"" in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git diff HEAD~1..HEAD -- packages/next-shell/src/AuthErrorScreen.tsx packages/auth/src/workspace-auth.ts packages/auth/src/auth-error-route.test.ts .github/workflows/keep-warm.yml' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "searchParams: Promise|auth/error|AuthErrorScreen" apps packages -g "*.tsx" -g "*.ts"' in C:\Users\USER\Documents\autoworkshop-ai
 exited 1 in 1518ms:
rg: node_modules/next-auth: IO error for operation on node_modules/next-auth: The system cannot find the file specified. (os error 2)

2026-08-04T12:54:01.851517Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 1.5 seconds
Output:
rg: node_modules/next-auth: IO error for operation on node_modules/next-auth: The system cannot find the file specified. (os error 2)

 succeeded in 2119ms:
packages\auth\src\workspace-auth.ts:179:     * ⚠️ EVERY APP MUST MOUNT `/auth/error`. This is set once here for all seven
packages\auth\src\workspace-auth.ts:185:    pages: { error: '/auth/error' },
packages\auth\src\auth-error-route.test.ts:8: * `workspace-auth.ts` points every workspace's failed sign-in at `/auth/error`.
packages\auth\src\auth-error-route.test.ts:44:  it.each(webApps)('%s mounts /auth/error', (app) => {
packages\auth\src\auth-error-route.test.ts:45:    const page = join(appsDir, app, 'app/auth/error/page.tsx');
packages\auth\src\auth-error-route.test.ts:48:      `${app} has no app/auth/error/page.tsx — a failed sign-in there 404s, because ` +
packages\auth\src\auth-error-route.test.ts:49:        'workspace-auth.ts sets pages.error = "/auth/error" for every workspace',
packages\auth\src\auth-error-route.test.ts:59:    expect(config).toContain("pages: { error: '/auth/error' }");
apps\towing-web\app\auth\error\page.tsx:1:import { AuthErrorScreen } from '@autoworkshop/next-shell';
apps\towing-web\app\auth\error\page.tsx:4: * /auth/error — where `pages.error` sends a failed sign-in.
apps\towing-web\app\auth\error\page.tsx:19:  searchParams: Promise<{ error?: string }>;
apps\towing-web\app\auth\error\page.tsx:23:  return <AuthErrorScreen error={error} />;
packages\next-shell\src\index.ts:76: * `workspace-auth.ts`. Every app must mount it at `/auth/error`, or that
packages\next-shell\src\index.ts:79:export { AuthErrorScreen } from './AuthErrorScreen';
packages\next-shell\src\index.ts:80:export type { AuthErrorScreenProps } from './AuthErrorScreen';
packages\next-shell\src\AuthErrorScreen.tsx:77:export interface AuthErrorScreenProps {
packages\next-shell\src\AuthErrorScreen.tsx:84:export function AuthErrorScreen({ error, signInHref = '/api/auth/signin' }: AuthErrorScreenProps) {
packages\next-shell\src\AuthErrorScreen.tsx:88:   * That was the first version and it CRASHES on `/auth/error?error=`. With an
apps\supplier-web\app\auth\error\page.tsx:1:import { AuthErrorScreen } from '@autoworkshop/next-shell';
apps\supplier-web\app\auth\error\page.tsx:4: * /auth/error — where `pages.error` sends a failed sign-in.
apps\supplier-web\app\auth\error\page.tsx:19:  searchParams: Promise<{ error?: string }>;
apps\supplier-web\app\auth\error\page.tsx:23:  return <AuthErrorScreen error={error} />;
apps\customer-web\app\auth\error\page.tsx:1:import { AuthErrorScreen } from '@autoworkshop/next-shell';
apps\customer-web\app\auth\error\page.tsx:4: * /auth/error — where `pages.error` sends a failed sign-in.
apps\customer-web\app\auth\error\page.tsx:19:  searchParams: Promise<{ error?: string }>;
apps\customer-web\app\auth\error\page.tsx:23:  return <AuthErrorScreen error={error} />;
apps\insurance-web\app\auth\error\page.tsx:1:import { AuthErrorScreen } from '@autoworkshop/next-shell';
apps\insurance-web\app\auth\error\page.tsx:4: * /auth/error — where `pages.error` sends a failed sign-in.
apps\insurance-web\app\auth\error\page.tsx:19:  searchParams: Promise<{ error?: string }>;
apps\insurance-web\app\auth\error\page.tsx:23:  return <AuthErrorScreen error={error} />;
apps\admin-web\app\auth\error\page.tsx:1:import { AuthErrorScreen } from '@autoworkshop/next-shell';
apps\admin-web\app\auth\error\page.tsx:4: * /auth/error — where `pages.error` sends a failed sign-in.
apps\admin-web\app\auth\error\page.tsx:19:  searchParams: Promise<{ error?: string }>;
apps\admin-web\app\auth\error\page.tsx:23:  return <AuthErrorScreen error={error} />;
apps\fleet-web\app\auth\error\page.tsx:1:import { AuthErrorScreen } from '@autoworkshop/next-shell';
apps\fleet-web\app\auth\error\page.tsx:4: * /auth/error — where `pages.error` sends a failed sign-in.
apps\fleet-web\app\auth\error\page.tsx:19:  searchParams: Promise<{ error?: string }>;
apps\fleet-web\app\auth\error\page.tsx:23:  return <AuthErrorScreen error={error} />;
apps\workshop-web\app\auth\error\page.tsx:1:import { AuthErrorScreen } from '@autoworkshop/next-shell';
apps\workshop-web\app\auth\error\page.tsx:4: * /auth/error — where `pages.error` sends a failed sign-in.
apps\workshop-web\app\auth\error\page.tsx:19:  searchParams: Promise<{ error?: string }>;
apps\workshop-web\app\auth\error\page.tsx:23:  return <AuthErrorScreen error={error} />;

 succeeded in 2392ms:
diff --git a/.github/workflows/keep-warm.yml b/.github/workflows/keep-warm.yml
new file mode 100644
index 0000000..c74bee1
--- /dev/null
+++ b/.github/workflows/keep-warm.yml
@@ -0,0 +1,140 @@
+# Keeps Keycloak awake during working hours so sign-in does not cold-start.
+#
+# ── THE PROBLEM ─────────────────────────────────────────────────────────────
+# Render's free tier powers a service down after 15 minutes of idle. Keycloak's
+# cold start was MEASURED at up to 136 seconds on 2026-08-03, and Auth.js
+# discovers its endpoints from `.well-known/openid-configuration` — so during
+# that wake, sign-in fails with `Configuration`, which reads to the visitor as
+# "this site is broken". The first visitor after any quiet period gets it.
+#
+# `packages/next-shell/src/AuthErrorScreen.tsx` fixes what they are TOLD. This
+# file reduces how often they are told it.
+#
+# ── 🔴 WHY THIS IS WINDOWED AND NOT 24/7 — READ BEFORE WIDENING IT ──────────
+#
+# FOUR free Render services share ONE 750-instance-hour monthly allowance:
+# autoworkshop-api, autoworkshop-keycloak, the workshop web service and
+# autoworkshop-customer. A calendar month is ~730 hours. So:
+#
+#     Keycloak warm 24/7   = ~730 h/month  = the ENTIRE allowance, alone
+#     Keycloak warm 10h×22 = ~220 h/month  = leaves ~530 h for the other three
+#
+# A round-the-clock warmer does not merely risk the budget, it consumes all of
+# it and starves the API and both web services — which is precisely how this
+# account was suspended with `suspenders: ['billing']` on 2026-07-28, and why
+# `autoworkshop-customer` 404'd for a stretch on 2026-08-03. Zero cost is a hard
+# rule (ADR-012) and NO PAID REMEDY IS TO BE PROPOSED, so the only lever is how
+# many hours to spend and when.
+#
+# The window below is therefore deliberately modest: weekdays, 08:00-18:00 UTC.
+# Ghana is UTC+0, so that is local working hours with no offset arithmetic.
+# WIDENING IT SPENDS HOURS THE OTHER THREE SERVICES NEED. Do the sum first.
+#
+# ── WHY ONE RUN LOOPS INSTEAD OF ASKING CRON FOR MORE FIRES ─────────────────
+#
+# Measured on the Solar repo across 8 workflows: GitHub delivers ~0.6 scheduled
+# runs/hour REGARDLESS of the requested rate — 12/h and 2/h both arrive at
+# ~0.6/h. Every gap exceeded Render's 15-minute idle timeout, so a 5-minute cron
+# kept nothing warm for weeks while reporting success on every run. You cannot
+# out-schedule a scheduler that is dropping you.
+#
+# So this does not depend on cron FREQUENCY, only on it eventually firing: each
+# delivered run becomes a loop that pings every 5 minutes until the window ends.
+# One landed fire covers the rest of the working day.
+#
+# `cancel-in-progress: false` is load-bearing. A landing fire is held PENDING
+# behind the live warmer rather than killing it; `true` was tried on Solar and is
+# worse, because it stops the running warmer before its replacement has a runner
+# and opens a coverage gap several times an hour.
+#
+# STAYING GREEN IS DELIBERATE. A warmer must never page anyone for a slow wake,
+# so ping failures are counted and summarised, never fatal.
+#
+# To stop entirely: disable in the Actions tab AND cancel the in-flight run, or
+# it keeps warming until the window closes.
+
+name: keep-warm
+
+on:
+  schedule:
+    # Asked often so that at least one lands inside the window; the delivered
+    # rate is ~0.6/h whatever this says. Offset minutes avoid the :00 high-load
+    # slot GitHub's own docs call the worst one. Do NOT tighten this to "fix"
+    # thin coverage — it has no measurable effect.
+    - cron: "3,18,33,48 8-17 * * 1-5"
+  workflow_dispatch: {}
+
+permissions:
+  contents: read
+
+concurrency:
+  group: keep-warm
+  cancel-in-progress: false
+
+jobs:
+  warm:
+    runs-on: ubuntu-latest
+    # The loop stops itself at the window's end; this is a backstop only.
+    timeout-minutes: 335
+    steps:
+      - name: Warm Keycloak until the window closes
+        run: |
+          # A failed ping must never kill the loop. A warmer that dies on the
+          # first slow cold wake is the exact bug that made Solar's
+          # keycloak-keepalive workflow useless.
+          set +e
+
+          # 18:00 UTC — the end of the window declared in the header. Computed
+          # from the clock rather than a fixed duration so a fire that lands at
+          # 16:40 warms for 80 minutes and stops, instead of running past the
+          # window and spending hours nobody is awake for.
+          WINDOW_END_HOUR=18
+          INTERVAL=300        # 5 min, comfortably inside Render's 15-min idle
+          # 150s, not 90s. A free-tier wake was measured at 136s on 2026-08-03,
+          # and a cap that expires MID-WAKE aborts the very wake it triggered —
+          # which is how a warmer ends up proving nothing. Do not lower this
+          # without a new measurement.
+          MAXTIME=150
+
+          # Only Keycloak. The API and the web services wake on real traffic and
+          # each one added here costs another ~220 h/month from a 750 h budget
+          # shared by four services. See the header before adding a URL.
+          URL="https://autoworkshop-keycloak.onrender.com/realms/autoworkshop/.well-known/openid-configuration"
+
+          START=$(date +%s); ROUNDS=0; FAILURES=0
+
+          summary() {
+            MINS=$(( ($(date +%s) - START) / 60 ))
+            echo "----------------------------------------"
+            echo "warmed ${MINS} min | ${ROUNDS} pings | ${FAILURES} failed"
+            if [ "$ROUNDS" -gt 0 ] && [ "$FAILURES" -eq "$ROUNDS" ]; then
+              # Every ping failed for the whole run. Warn so it is visible in the
+              # run summary, but do NOT fail: a warmer that pages people teaches
+              # them to ignore it, and this is not the outage detector.
+              echo "::warning::keep-warm: every ping failed (${FAILURES}/${ROUNDS}). Keycloak may be down."
+            fi
+          }
+          # The NORMAL way this run ends is the window closing or a newer fire
+          # superseding it — print the tally either way, or the common case
+          # leaves no record of what happened.
+          trap 'summary; exit 0' TERM INT
+
+          while [ "$(date -u +%H)" -lt "$WINDOW_END_HOUR" ]; do
+            ROUNDS=$((ROUNDS + 1))
+            # No -f: curl exits 0 for ANY HTTP response, including 5xx. Correct
+            # for a warmer — a 500 still proves the container answered, which is
+            # the only thing being measured. Judging health is not this job.
+            OUT=$(curl -sS --max-time "$MAXTIME" -o /dev/null -w "%{http_code} in %{time_total}s" "$URL" 2>&1)
+            if [ $? -ne 0 ]; then
+              FAILURES=$((FAILURES + 1))
+              echo "  WARN $(echo "$OUT" | tr '\n' ' ')"
+            else
+              echo "  ok   ${OUT}"
+            fi
+            # Re-check the hour BEFORE sleeping, so the last cycle of the day
+            # does not sleep five minutes past the window just to exit.
+            [ "$(date -u +%H)" -lt "$WINDOW_END_HOUR" ] || break
+            sleep "$INTERVAL"
+          done
+
+          summary
diff --git a/packages/auth/src/auth-error-route.test.ts b/packages/auth/src/auth-error-route.test.ts
new file mode 100644
index 0000000..88004fa
--- /dev/null
+++ b/packages/auth/src/auth-error-route.test.ts
@@ -0,0 +1,61 @@
+import { existsSync, readdirSync, statSync } from 'node:fs';
+import { join } from 'node:path';
+import { describe, expect, it } from 'vitest';
+
+/**
+ * 🔴 `pages.error` IS SET ONCE AND HONOURED BY SEVEN APPS.
+ *
+ * `workspace-auth.ts` points every workspace's failed sign-in at `/auth/error`.
+ * That is a promise made on behalf of apps this file cannot see. An app without
+ * the route does not warn, does not fail to build and does not fail to start —
+ * it 404s the one visitor who already could not sign in, which is strictly worse
+ * than the default Auth.js screen the override replaced.
+ *
+ * The failure is invisible from inside `packages/auth`, invisible to typecheck,
+ * and only reachable by a real cold start against a sleeping Keycloak. So it is
+ * asserted here, structurally, against the filesystem.
+ *
+ * ⚠️ THE APP LIST IS DISCOVERED, NOT LISTED. A hardcoded list of seven would
+ * pass forever after somebody adds an eighth app — the exact shape of "a check
+ * that walks through its own gap" this repo keeps paying for. `apps/` is read at
+ * test time, so a new web app is in scope the moment it exists.
+ */
+describe('the auth error route Auth.js is configured to redirect to', () => {
+  const appsDir = join(__dirname, '../../../apps');
+
+  /**
+   * A "web app" here means a Next app with an `app/` directory. That excludes
+   * `api` (NestJS), `mobile` (Expo), `e2e` (Playwright) and `storybook`, none of
+   * which serve `/api/auth/*` and none of which can receive this redirect.
+   */
+  const webApps = readdirSync(appsDir).filter((name) => {
+    const appRouter = join(appsDir, name, 'app');
+    return existsSync(appRouter) && statSync(appRouter).isDirectory();
+  });
+
+  it('found the web apps to check', () => {
+    // Guards the discovery itself. Without this, a wrong path would produce an
+    // EMPTY list and every assertion below would pass while proving nothing.
+    expect(webApps.length, 'no Next apps found under apps/').toBeGreaterThanOrEqual(7);
+    expect(webApps).toContain('workshop-web');
+    expect(webApps).toContain('customer-web');
+  });
+
+  it.each(webApps)('%s mounts /auth/error', (app) => {
+    const page = join(appsDir, app, 'app/auth/error/page.tsx');
+    expect(
+      existsSync(page),
+      `${app} has no app/auth/error/page.tsx — a failed sign-in there 404s, because ` +
+        'workspace-auth.ts sets pages.error = "/auth/error" for every workspace',
+    ).toBe(true);
+  });
+
+  it('still has pages.error pointing where these routes are', () => {
+    // The other direction: if somebody removes or renames the override, these
+    // seven pages become dead code and this suite would happily keep passing.
+    const config = readdirSync(__dirname).includes('workspace-auth.ts')
+      ? require('node:fs').readFileSync(join(__dirname, 'workspace-auth.ts'), 'utf8')
+      : '';
+    expect(config).toContain("pages: { error: '/auth/error' }");
+  });
+});
diff --git a/packages/auth/src/workspace-auth.ts b/packages/auth/src/workspace-auth.ts
index 3ddfff5..1057e8a 100644
--- a/packages/auth/src/workspace-auth.ts
+++ b/packages/auth/src/workspace-auth.ts
@@ -158,8 +158,31 @@ export function createWorkspaceAuth(workspaceId: WorkspaceId | string): Workspac
      * remove the only thing making this setting safe.
      */
     trustHost: true,
-    // Auth.js's own pages are fine; there is no branded sign-in screen yet and
-    // a half-styled one would be worse than the default.
+    /**
+     * 🔴 THE ERROR PAGE IS OVERRIDDEN; THE SIGN-IN PAGE IS NOT.
+     *
+     * Auth.js's default sign-in screen is fine — there is no branded one yet and
+     * a half-styled one would be worse. Its default ERROR screen is not fine,
+     * for one specific and measured reason:
+     *
+     * Keycloak sleeps on Render's free tier and its cold start reached 136
+     * SECONDS on 2026-08-03. Auth.js discovers every endpoint from the realm's
+     * `.well-known/openid-configuration`, so during that wake the discovery
+     * fetch fails and Auth.js renders `Configuration` — "There is a problem with
+     * the server configuration."
+     *
+     * Nothing is misconfigured. The service is starting. And the person shown
+     * that message is always the FIRST visitor after a quiet period, which on a
+     * product with little traffic is very nearly every visitor. Telling them the
+     * server is broken loses them; telling them to wait ninety seconds does not.
+     *
+     * ⚠️ EVERY APP MUST MOUNT `/auth/error`. This is set once here for all seven
+     * workspaces, so an app missing that route turns a recoverable cold start
+     * into a 404 — worse than the screen this replaces. `auth-error-route.spec.ts`
+     * asserts all seven exist, and it is the only thing standing between a new
+     * app and that regression.
+     */
+    pages: { error: '/auth/error' },
     providers: [
       Keycloak({
         clientId,
diff --git a/packages/next-shell/src/AuthErrorScreen.tsx b/packages/next-shell/src/AuthErrorScreen.tsx
new file mode 100644
index 0000000..cb3c917
--- /dev/null
+++ b/packages/next-shell/src/AuthErrorScreen.tsx
@@ -0,0 +1,204 @@
+import Link from 'next/link';
+import { primitive, themeVar } from '@autoworkshop/design-tokens';
+
+/**
+ * What a visitor is told when `/api/auth/*` fails — `07.txt` §9.
+ *
+ * ── 🔴 THE DEFECT THIS EXISTS TO FIX ────────────────────────────────────────
+ *
+ * Keycloak runs on Render's free tier and spins down after 15 minutes of idle.
+ * Its cold start was MEASURED at up to 136 seconds on 2026-08-03. Auth.js
+ * discovers every endpoint from `${issuer}/.well-known/openid-configuration`,
+ * so during that window the discovery fetch fails and Auth.js reports:
+ *
+ *     Configuration — "There is a problem with the server configuration."
+ *
+ * That message is WRONG in the way that matters. Nothing is misconfigured. The
+ * sign-in service is starting, and the visitor who triggered the wake is the one
+ * person guaranteed to see a hard error — the first visitor after any quiet
+ * period, which on a young product is very nearly every visitor. Told the server
+ * is broken, they leave; had they been told to wait ninety seconds, they would
+ * have signed in.
+ *
+ * ── WHY THIS RATHER THAN A KEEP-WARM ────────────────────────────────────────
+ *
+ * A warmer was the obvious fix and the arithmetic refuses it. FOUR free Render
+ * services share ONE 750-instance-hour monthly allowance, and a calendar month
+ * is ~730 hours. Keeping Keycloak alive around the clock therefore consumes
+ * essentially the ENTIRE allowance on its own and starves the API and both web
+ * services — the same exhaustion that suspended this account with
+ * `suspenders: ['billing']` on 2026-07-28. `keep-warm.yml` exists alongside this
+ * file and is deliberately WINDOWED for that reason; read its header before
+ * widening it. No paid remedy is to be proposed (ADR-012).
+ *
+ * So the cold start cannot be eliminated on this hosting, and the honest fix is
+ * to stop lying about it. A slow sign-in that says it is slow is a far smaller
+ * failure than a fast one that says the server is broken.
+ *
+ * ⚠️ IT STILL DISTINGUISHES A REAL FAULT. `Configuration` after a wake has
+ * completed IS a genuine misconfiguration, and this screen must not paper over
+ * that — the retry is bounded, and once the countdown is spent the copy stops
+ * promising a wake and says plainly that the service is not answering. A screen
+ * that says "starting up" forever is the monitor that always reports healthy.
+ */
+
+/**
+ * Auth.js's error codes. `Configuration` is the one this screen exists for; the
+ * others are here because `pages.error` captures ALL of them, and falling
+ * through to a blank page would be worse than the default screen it replaced.
+ */
+const MESSAGES: Record<string, { title: string; body: string; waking: boolean }> = {
+  Configuration: {
+    title: 'The sign-in service is starting up',
+    body:
+      'This site runs on free hosting that powers down when nobody is using it. Waking it takes up to two minutes, and you are the first visitor since it went quiet. Nothing is wrong — please wait, or try again in a moment.',
+    waking: true,
+  },
+  AccessDenied: {
+    title: 'That account cannot sign in here',
+    body:
+      'You signed in successfully, but this account is not permitted to use this workspace. If you believe it should be, ask an administrator of your workshop to check your access.',
+    waking: false,
+  },
+  Verification: {
+    title: 'That sign-in link has expired',
+    body: 'Sign-in links can only be used once, and not long after they are sent. Please start again.',
+    waking: false,
+  },
+};
+
+const FALLBACK = {
+  title: 'Sign-in did not complete',
+  body:
+    'Something interrupted the sign-in. Trying again usually works. If it keeps happening, the sign-in service may be unavailable.',
+  waking: false,
+};
+
+export interface AuthErrorScreenProps {
+  /** Auth.js's `?error=` code. Absent when somebody opens the page directly. */
+  error?: string;
+  /** Where "Try again" goes. Defaults to this app's sign-in route. */
+  signInHref?: string;
+}
+
+export function AuthErrorScreen({ error, signInHref = '/api/auth/signin' }: AuthErrorScreenProps) {
+  const message = (error && MESSAGES[error]) ?? FALLBACK;
+
+  return (
+    <main
+      style={{
+        maxWidth: '38rem',
+        margin: '0 auto',
+        padding: primitive.space[8],
+        display: 'flex',
+        flexDirection: 'column',
+        gap: primitive.space[4],
+      }}
+    >
+      <div
+        style={{
+          border: `1px solid ${themeVar.borderDefault}`,
+          borderRadius: primitive.radius.xl,
+          background: themeVar.surfaceRaised,
+          padding: primitive.space[6],
+          display: 'flex',
+          flexDirection: 'column',
+          gap: primitive.space[3],
+        }}
+      >
+        <h1 style={{ margin: 0, fontSize: primitive.fontSize['2xl'] }}>{message.title}</h1>
+        <p style={{ margin: 0, lineHeight: 1.7 }}>{message.body}</p>
+
+        {message.waking ? (
+          /*
+            A live countdown, not a spinner. A spinner claims progress is being
+            made and cannot say how much is left; a visitor watching one for 136
+            seconds concludes it is stuck. The number is the honest measurement
+            from 2026-08-03, and this is a CLIENT component purely because a
+            countdown cannot be rendered on the server.
+          */
+          <WakeCountdown signInHref={signInHref} />
+        ) : (
+          <p style={{ margin: 0 }}>
+            <Link href={signInHref}>Try signing in again</Link>
+          </p>
+        )}
+
+        {/*
+          The raw code, small and last. It is meaningless to a customer and it is
+          the first thing anyone debugging this will ask for, so it is present
+          without being the headline.
+        */}
+        {error ? (
+          <p
+            style={{
+              margin: 0,
+              color: themeVar.textSecondary,
+              fontSize: primitive.fontSize.xs,
+              fontFamily: primitive.fontFamily.mono,
+            }}
+          >
+            {error}
+          </p>
+        ) : null}
+      </div>
+
+      <p style={{ margin: 0, fontSize: primitive.fontSize.sm }}>
+        <Link href="/">Back to the home page</Link>
+      </p>
+    </main>
+  );
+}
+
+/**
+ * Counts the wake down and retries once, by itself.
+ *
+ * ⚠️ ONE automatic retry, then it stops and hands over to the visitor. A page
+ * that reloads forever against a service that is genuinely down is a page that
+ * hammers a dead host and never tells anyone — and on metered free hosting it
+ * would burn the very allowance that made the service sleep in the first place.
+ */
+function WakeCountdown({ signInHref }: { signInHref: string }) {
+  return (
+    <div
+      // A `<noscript>`-safe fallback is the link itself, which is always
+      // rendered. The script only upgrades it.
+      style={{ display: 'flex', flexDirection: 'column', gap: primitive.space[2] }}
+    >
+      <p style={{ margin: 0 }}>
+        <Link href={signInHref} id="aw-auth-retry">
+          Try signing in again
+        </Link>{' '}
+        <span id="aw-auth-countdown" style={{ color: themeVar.textSecondary }} />
+      </p>
+      <script
+        // eslint-disable-next-line react/no-danger -- a fixed literal, no interpolation
+        dangerouslySetInnerHTML={{
+          __html: `(function(){
+  var el = document.getElementById('aw-auth-countdown');
+  var link = document.getElementById('aw-auth-retry');
+  if (!el || !link) return;
+  // 140s: the 136s cold start measured on 2026-08-03, plus a little. Retrying
+  // sooner than the wake takes just produces the same error page twice.
+  var left = 140;
+  var t = setInterval(function () {
+    left -= 1;
+    if (left <= 0) {
+      clearInterval(t);
+      el.textContent = '';
+      // ONE automatic attempt. If it fails again the visitor sees this page
+      // once more, with the countdown spent, and decides for themselves.
+      if (!sessionStorage.getItem('aw-auth-retried')) {
+        sessionStorage.setItem('aw-auth-retried', '1');
+        window.location.href = link.getAttribute('href');
+      }
+      return;
+    }
+    el.textContent = '— retrying automatically in ' + left + 's';
+  }, 1000);
+})();`,
+        }}
+      />
+    </div>
+  );
+}

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git diff -- packages/next-shell/src/AuthErrorScreen.tsx' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git show HEAD:.github/workflows/keep-warm.yml | Select-String -Pattern "One landed fire|timeout-minutes|until the window closes|WINDOW_END_HOUR"' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git status --short' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git show HEAD:packages/next-shell/src/AuthErrorScreen.tsx | Select-String -Pattern "const message|retrying automatically|sessionStorage|window.location"' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 969ms:
diff --git a/packages/next-shell/src/AuthErrorScreen.tsx b/packages/next-shell/src/AuthErrorScreen.tsx
index cb3c917..96e8f84 100644
--- a/packages/next-shell/src/AuthErrorScreen.tsx
+++ b/packages/next-shell/src/AuthErrorScreen.tsx
@@ -82,7 +82,17 @@ export interface AuthErrorScreenProps {
 }
 
 export function AuthErrorScreen({ error, signInHref = '/api/auth/signin' }: AuthErrorScreenProps) {
-  const message = (error && MESSAGES[error]) ?? FALLBACK;
+  /**
+   * ⚠️ A TERNARY, NOT `(error && MESSAGES[error]) ?? FALLBACK`.
+   *
+   * That was the first version and it CRASHES on `/auth/error?error=`. With an
+   * empty string, `error && …` short-circuits to `''`, and `??` only replaces
+   * `null`/`undefined` — so `message` becomes `''` and `message.title` throws.
+   * An empty `?error=` is not hypothetical: it is what a hand-trimmed URL or a
+   * provider that redirects with a blank code produces, and it would white-screen
+   * the one page a visitor reaches only when something has ALREADY gone wrong.
+   */
+  const message = (error ? MESSAGES[error] : undefined) ?? FALLBACK;
 
   return (
     <main
warning: in the working copy of 'packages/next-shell/src/AuthErrorScreen.tsx', LF will be replaced by CRLF the next time Git touches it

 succeeded in 1136ms:
 M packages/next-shell/src/AuthErrorScreen.tsx
 M reviews/codex-review.md
 M scripts/_codex-runner.sh

 succeeded in 3107ms:

# One landed fire covers the rest of the working day.
# it keeps warming until the window closes.
    timeout-minutes: 335
      - name: Warm Keycloak until the window closes
          WINDOW_END_HOUR=18
          while [ "$(date -u +%H)" -lt "$WINDOW_END_HOUR" ]; do
            [ "$(date -u +%H)" -lt "$WINDOW_END_HOUR" ] || break



 succeeded in 3233ms:

const MESSAGES: Record<string, { title: string; body: string; waking: boolean }> = {
  const message = (error && MESSAGES[error]) ?? FALLBACK;
      if (!sessionStorage.getItem('aw-auth-retried')) {
        sessionStorage.setItem('aw-auth-retried', '1');
        window.location.href = link.getAttribute('href');
    el.textContent = '— retrying automatically in ' + left + 's';



codex
There are uncommitted local edits in `packages/next-shell/src/AuthErrorScreen.tsx` that already fix one HEAD defect. Since your context is explicitly `HEAD~1..HEAD`, I’m reviewing the committed implementation, and I’ll note when a finding appears already fixed in the dirty working tree.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content reviews/codex-review.md -TotalCount 260' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git show HEAD:.github/workflows/keep-warm.yml | Select-String -Pattern "''^" | Select-Object -First 150' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git show HEAD:packages/next-shell/src/AuthErrorScreen.tsx | Select-String -Pattern "''^" | Select-Object -First 230' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 1313ms:

# Keeps Keycloak awake during working hours so sign-in does not cold-start.
#
# ── THE PROBLEM ─────────────────────────────────────────────────────────────
# Render's free tier powers a service down after 15 minutes of idle. Keycloak's
# cold start was MEASURED at up to 136 seconds on 2026-08-03, and Auth.js
# discovers its endpoints from `.well-known/openid-configuration` — so during
# that wake, sign-in fails with `Configuration`, which reads to the visitor as
# "this site is broken". The first visitor after any quiet period gets it.
#
# `packages/next-shell/src/AuthErrorScreen.tsx` fixes what they are TOLD. This
# file reduces how often they are told it.
#
# ── 🔴 WHY THIS IS WINDOWED AND NOT 24/7 — READ BEFORE WIDENING IT ──────────
#
# FOUR free Render services share ONE 750-instance-hour monthly allowance:
# autoworkshop-api, autoworkshop-keycloak, the workshop web service and
# autoworkshop-customer. A calendar month is ~730 hours. So:
#
#     Keycloak warm 24/7   = ~730 h/month  = the ENTIRE allowance, alone
#     Keycloak warm 10h×22 = ~220 h/month  = leaves ~530 h for the other three
#
# A round-the-clock warmer does not merely risk the budget, it consumes all of
# it and starves the API and both web services — which is precisely how this
# account was suspended with `suspenders: ['billing']` on 2026-07-28, and why
# `autoworkshop-customer` 404'd for a stretch on 2026-08-03. Zero cost is a hard
# rule (ADR-012) and NO PAID REMEDY IS TO BE PROPOSED, so the only lever is how
# many hours to spend and when.
#
# The window below is therefore deliberately modest: weekdays, 08:00-18:00 UTC.
# Ghana is UTC+0, so that is local working hours with no offset arithmetic.
# WIDENING IT SPENDS HOURS THE OTHER THREE SERVICES NEED. Do the sum first.
#
# ── WHY ONE RUN LOOPS INSTEAD OF ASKING CRON FOR MORE FIRES ─────────────────
#
# Measured on the Solar repo across 8 workflows: GitHub delivers ~0.6 scheduled
# runs/hour REGARDLESS of the requested rate — 12/h and 2/h both arrive at
# ~0.6/h. Every gap exceeded Render's 15-minute idle timeout, so a 5-minute cron
# kept nothing warm for weeks while reporting success on every run. You cannot
# out-schedule a scheduler that is dropping you.
#
# So this does not depend on cron FREQUENCY, only on it eventually firing: each
# delivered run becomes a loop that pings every 5 minutes until the window ends.
# One landed fire covers the rest of the working day.
#
# `cancel-in-progress: false` is load-bearing. A landing fire is held PENDING
# behind the live warmer rather than killing it; `true` was tried on Solar and is
# worse, because it stops the running warmer before its replacement has a runner
# and opens a coverage gap several times an hour.
#
# STAYING GREEN IS DELIBERATE. A warmer must never page anyone for a slow wake,
# so ping failures are counted and summarised, never fatal.
#
# To stop entirely: disable in the Actions tab AND cancel the in-flight run, or
# it keeps warming until the window closes.

name: keep-warm

on:
  schedule:
    # Asked often so that at least one lands inside the window; the delivered
    # rate is ~0.6/h whatever this says. Offset minutes avoid the :00 high-load
    # slot GitHub's own docs call the worst one. Do NOT tighten this to "fix"
    # thin coverage — it has no measurable effect.
    - cron: "3,18,33,48 8-17 * * 1-5"
  workflow_dispatch: {}

permissions:
  contents: read

concurrency:
  group: keep-warm
  cancel-in-progress: false

jobs:
  warm:
    runs-on: ubuntu-latest
    # The loop stops itself at the window's end; this is a backstop only.
    timeout-minutes: 335
    steps:
      - name: Warm Keycloak until the window closes
        run: |
          # A failed ping must never kill the loop. A warmer that dies on the
          # first slow cold wake is the exact bug that made Solar's
          # keycloak-keepalive workflow useless.
          set +e

          # 18:00 UTC — the end of the window declared in the header. Computed
          # from the clock rather than a fixed duration so a fire that lands at
          # 16:40 warms for 80 minutes and stops, instead of running past the
          # window and spending hours nobody is awake for.
          WINDOW_END_HOUR=18
          INTERVAL=300        # 5 min, comfortably inside Render's 15-min idle
          # 150s, not 90s. A free-tier wake was measured at 136s on 2026-08-03,
          # and a cap that expires MID-WAKE aborts the very wake it triggered —
          # which is how a warmer ends up proving nothing. Do not lower this
          # without a new measurement.
          MAXTIME=150

          # Only Keycloak. The API and the web services wake on real traffic and
          # each one added here costs another ~220 h/month from a 750 h budget
          # shared by four services. See the header before adding a URL.
          URL="https://autoworkshop-keycloak.onrender.com/realms/autoworkshop/.well-known/openid-configuration"

          START=$(date +%s); ROUNDS=0; FAILURES=0

          summary() {
            MINS=$(( ($(date +%s) - START) / 60 ))
            echo "----------------------------------------"
            echo "warmed ${MINS} min | ${ROUNDS} pings | ${FAILURES} failed"
            if [ "$ROUNDS" -gt 0 ] && [ "$FAILURES" -eq "$ROUNDS" ]; then
              # Every ping failed for the whole run. Warn so it is visible in the
              # run summary, but do NOT fail: a warmer that pages people teaches
              # them to ignore it, and this is not the outage detector.
              echo "::warning::keep-warm: every ping failed (${FAILURES}/${ROUNDS}). Keycloak may be down."
            fi
          }
          # The NORMAL way this run ends is the window closing or a newer fire
          # superseding it — print the tally either way, or the common case
          # leaves no record of what happened.
          trap 'summary; exit 0' TERM INT

          while [ "$(date -u +%H)" -lt "$WINDOW_END_HOUR" ]; do
            ROUNDS=$((ROUNDS + 1))
            # No -f: curl exits 0 for ANY HTTP response, including 5xx. Correct
            # for a warmer — a 500 still proves the container answered, which is
            # the only thing being measured. Judging health is not this job.
            OUT=$(curl -sS --max-time "$MAXTIME" -o /dev/null -w "%{http_code} in %{time_total}s" "$URL" 2>&1)
            if [ $? -ne 0 ]; then
              FAILURES=$((FAILURES + 1))
              echo "  WARN $(echo "$OUT" | tr '\n' ' ')"
            else
              echo "  ok   ${OUT}"
            fi
            # Re-check the hour BEFORE sleeping, so the last cycle of the day
            # does not sleep five minutes past the window just to exit.
            [ "$(date -u +%H)" -lt "$WINDOW_END_HOUR" ] || break
            sleep "$INTERVAL"
          done

          summary



 succeeded in 1363ms:

import Link from 'next/link';
import { primitive, themeVar } from '@autoworkshop/design-tokens';

/**
 * What a visitor is told when `/api/auth/*` fails — `07.txt` §9.
 *
 * ── 🔴 THE DEFECT THIS EXISTS TO FIX ────────────────────────────────────────
 *
 * Keycloak runs on Render's free tier and spins down after 15 minutes of idle.
 * Its cold start was MEASURED at up to 136 seconds on 2026-08-03. Auth.js
 * discovers every endpoint from `${issuer}/.well-known/openid-configuration`,
 * so during that window the discovery fetch fails and Auth.js reports:
 *
 *     Configuration — "There is a problem with the server configuration."
 *
 * That message is WRONG in the way that matters. Nothing is misconfigured. The
 * sign-in service is starting, and the visitor who triggered the wake is the one
 * person guaranteed to see a hard error — the first visitor after any quiet
 * period, which on a young product is very nearly every visitor. Told the server
 * is broken, they leave; had they been told to wait ninety seconds, they would
 * have signed in.
 *
 * ── WHY THIS RATHER THAN A KEEP-WARM ────────────────────────────────────────
 *
 * A warmer was the obvious fix and the arithmetic refuses it. FOUR free Render
 * services share ONE 750-instance-hour monthly allowance, and a calendar month
 * is ~730 hours. Keeping Keycloak alive around the clock therefore consumes
 * essentially the ENTIRE allowance on its own and starves the API and both web
 * services — the same exhaustion that suspended this account with
 * `suspenders: ['billing']` on 2026-07-28. `keep-warm.yml` exists alongside this
 * file and is deliberately WINDOWED for that reason; read its header before
 * widening it. No paid remedy is to be proposed (ADR-012).
 *
 * So the cold start cannot be eliminated on this hosting, and the honest fix is
 * to stop lying about it. A slow sign-in that says it is slow is a far smaller
 * failure than a fast one that says the server is broken.
 *
 * ⚠️ IT STILL DISTINGUISHES A REAL FAULT. `Configuration` after a wake has
 * completed IS a genuine misconfiguration, and this screen must not paper over
 * that — the retry is bounded, and once the countdown is spent the copy stops
 * promising a wake and says plainly that the service is not answering. A screen
 * that says "starting up" forever is the monitor that always reports healthy.
 */

/**
 * Auth.js's error codes. `Configuration` is the one this screen exists for; the
 * others are here because `pages.error` captures ALL of them, and falling
 * through to a blank page would be worse than the default screen it replaced.
 */
const MESSAGES: Record<string, { title: string; body: string; waking: boolean }> = {
  Configuration: {
    title: 'The sign-in service is starting up',
    body:
      'This site runs on free hosting that powers down when nobody is using it. Waking it takes up to two minutes, and 
you are the first visitor since it went quiet. Nothing is wrong — please wait, or try again in a moment.',
    waking: true,
  },
  AccessDenied: {
    title: 'That account cannot sign in here',
    body:
      'You signed in successfully, but this account is not permitted to use this workspace. If you believe it should 
be, ask an administrator of your workshop to check your access.',
    waking: false,
  },
  Verification: {
    title: 'That sign-in link has expired',
    body: 'Sign-in links can only be used once, and not long after they are sent. Please start again.',
    waking: false,
  },
};

const FALLBACK = {
  title: 'Sign-in did not complete',
  body:
    'Something interrupted the sign-in. Trying again usually works. If it keeps happening, the sign-in service may be 
unavailable.',
  waking: false,
};

export interface AuthErrorScreenProps {
  /** Auth.js's `?error=` code. Absent when somebody opens the page directly. */
  error?: string;
  /** Where "Try again" goes. Defaults to this app's sign-in route. */
  signInHref?: string;
}

export function AuthErrorScreen({ error, signInHref = '/api/auth/signin' }: AuthErrorScreenProps) {
  const message = (error && MESSAGES[error]) ?? FALLBACK;

  return (
    <main
      style={{
        maxWidth: '38rem',
        margin: '0 auto',
        padding: primitive.space[8],
        display: 'flex',
        flexDirection: 'column',
        gap: primitive.space[4],
      }}
    >
      <div
        style={{
          border: `1px solid ${themeVar.borderDefault}`,
          borderRadius: primitive.radius.xl,
          background: themeVar.surfaceRaised,
          padding: primitive.space[6],
          display: 'flex',
          flexDirection: 'column',
          gap: primitive.space[3],
        }}
      >
        <h1 style={{ margin: 0, fontSize: primitive.fontSize['2xl'] }}>{message.title}</h1>
        <p style={{ margin: 0, lineHeight: 1.7 }}>{message.body}</p>

        {message.waking ? (
          /*
            A live countdown, not a spinner. A spinner claims progress is being
            made and cannot say how much is left; a visitor watching one for 136
            seconds concludes it is stuck. The number is the honest measurement
            from 2026-08-03, and this is a CLIENT component purely because a
            countdown cannot be rendered on the server.
          */
          <WakeCountdown signInHref={signInHref} />
        ) : (
          <p style={{ margin: 0 }}>
            <Link href={signInHref}>Try signing in again</Link>
          </p>
        )}

        {/*
          The raw code, small and last. It is meaningless to a customer and it is
          the first thing anyone debugging this will ask for, so it is present
          without being the headline.
        */}
        {error ? (
          <p
            style={{
              margin: 0,
              color: themeVar.textSecondary,
              fontSize: primitive.fontSize.xs,
              fontFamily: primitive.fontFamily.mono,
            }}
          >
            {error}
          </p>
        ) : null}
      </div>

      <p style={{ margin: 0, fontSize: primitive.fontSize.sm }}>
        <Link href="/">Back to the home page</Link>
      </p>
    </main>
  );
}

/**
 * Counts the wake down and retries once, by itself.
 *
 * ⚠️ ONE automatic retry, then it stops and hands over to the visitor. A page
 * that reloads forever against a service that is genuinely down is a page that
 * hammers a dead host and never tells anyone — and on metered free hosting it
 * would burn the very allowance that made the service sleep in the first place.
 */
function WakeCountdown({ signInHref }: { signInHref: string }) {
  return (
    <div
      // A `<noscript>`-safe fallback is the link itself, which is always
      // rendered. The script only upgrades it.
      style={{ display: 'flex', flexDirection: 'column', gap: primitive.space[2] }}
    >
      <p style={{ margin: 0 }}>
        <Link href={signInHref} id="aw-auth-retry">
          Try signing in again
        </Link>{' '}
        <span id="aw-auth-countdown" style={{ color: themeVar.textSecondary }} />
      </p>
      <script
        // eslint-disable-next-line react/no-danger -- a fixed literal, no interpolation
        dangerouslySetInnerHTML={{
          __html: `(function(){
  var el = document.getElementById('aw-auth-countdown');
  var link = document.getElementById('aw-auth-retry');
  if (!el || !link) return;
  // 140s: the 136s cold start measured on 2026-08-03, plus a little. Retrying
  // sooner than the wake takes just produces the same error page twice.
  var left = 140;
  var t = setInterval(function () {
    left -= 1;
    if (left <= 0) {
      clearInterval(t);
      el.textContent = '';
      // ONE automatic attempt. If it fails again the visitor sees this page
      // once more, with the countdown spent, and decides for themselves.
      if (!sessionStorage.getItem('aw-auth-retried')) {
        sessionStorage.setItem('aw-auth-retried', '1');
        window.location.href = link.getAttribute('href');
      }
      return;
    }
    el.textContent = '— retrying automatically in ' + left + 's';
  }, 1000);
})();`,
        }}
      />
    </div>
  );
}



 succeeded in 1423ms:
# Review: codex-review

_Generated: 2026-08-04T05:45:43-07:00 Â· backend: codex Â· model: llama3.2_

## Prompt

> You are Codex acting as Independent Pair Programmer for this repository. Review the latest implementation against the stated requirement in README.md and (if present) docs/IMPLEMENTATION_LOG.md. Identify anything Claude Code missed, misunderstood, or only partially implemented. Return a checklist of defects with: severity (critical/high/medium/low), file:line, what's wrong, recommended fix, why it matters.

## Repository context

### Changed files (HEAD~1..HEAD)
```
 .github/workflows/keep-warm.yml                    | 140 +++++++++
 apps/admin-web/app/auth/error/page.tsx             |  24 ++
 .../app/(app)/my-vehicles/service-history/page.tsx |  17 ++
 .../service-and-repairs/completed-repairs/page.tsx |  22 ++
 .../service-and-repairs/repair-proposals/page.tsx  |  22 ++
 .../service-and-repairs/repair-tracking/page.tsx   |  22 ++
 .../service-and-repairs/service-requests/page.tsx  |  22 ++
 .../app/_screens/repair-journey-screen.tsx         | 326 +++++++++++++++++++++
 .../app/_screens/repair-journey.spec.ts            | 101 +++++++
 apps/customer-web/app/_screens/repair-journey.ts   | 213 ++++++++++++++
 .../app/_screens/service-history-screen.tsx        | 196 +++++++++++++
 apps/customer-web/app/auth/error/page.tsx          |  24 ++
 apps/customer-web/package.json                     |   5 +-
 apps/fleet-web/app/auth/error/page.tsx             |  24 ++
 apps/insurance-web/app/auth/error/page.tsx         |  24 ++
 apps/supplier-web/app/auth/error/page.tsx          |  24 ++
 apps/towing-web/app/auth/error/page.tsx            |  24 ++
 apps/workshop-web/app/auth/error/page.tsx          |  24 ++
 packages/auth/src/auth-error-route.test.ts         |  61 ++++
 packages/auth/src/workspace-auth.ts                |  27 +-
```

### Diff snippet (first 700 lines)
```diff
diff --git a/.github/workflows/keep-warm.yml b/.github/workflows/keep-warm.yml
new file mode 100644
index 0000000..c74bee1
--- /dev/null
+++ b/.github/workflows/keep-warm.yml
@@ -0,0 +1,140 @@
+# Keeps Keycloak awake during working hours so sign-in does not cold-start.
+#
+# â”€â”€ THE PROBLEM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
+# Render's free tier powers a service down after 15 minutes of idle. Keycloak's
+# cold start was MEASURED at up to 136 seconds on 2026-08-03, and Auth.js
+# discovers its endpoints from `.well-known/openid-configuration` â€” so during
+# that wake, sign-in fails with `Configuration`, which reads to the visitor as
+# "this site is broken". The first visitor after any quiet period gets it.
+#
+# `packages/next-shell/src/AuthErrorScreen.tsx` fixes what they are TOLD. This
+# file reduces how often they are told it.
+#
+# â”€â”€ ðŸ”´ WHY THIS IS WINDOWED AND NOT 24/7 â€” READ BEFORE WIDENING IT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
+#
+# FOUR free Render services share ONE 750-instance-hour monthly allowance:
+# autoworkshop-api, autoworkshop-keycloak, the workshop web service and
+# autoworkshop-customer. A calendar month is ~730 hours. So:
+#
+#     Keycloak warm 24/7   = ~730 h/month  = the ENTIRE allowance, alone
+#     Keycloak warm 10hÃ—22 = ~220 h/month  = leaves ~530 h for the other three
+#
+# A round-the-clock warmer does not merely risk the budget, it consumes all of
+# it and starves the API and both web services â€” which is precisely how this
+# account was suspended with `suspenders: ['billing']` on 2026-07-28, and why
+# `autoworkshop-customer` 404'd for a stretch on 2026-08-03. Zero cost is a hard
+# rule (ADR-012) and NO PAID REMEDY IS TO BE PROPOSED, so the only lever is how
+# many hours to spend and when.
+#
+# The window below is therefore deliberately modest: weekdays, 08:00-18:00 UTC.
+# Ghana is UTC+0, so that is local working hours with no offset arithmetic.
+# WIDENING IT SPENDS HOURS THE OTHER THREE SERVICES NEED. Do the sum first.
+#
+# â”€â”€ WHY ONE RUN LOOPS INSTEAD OF ASKING CRON FOR MORE FIRES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
+#
+# Measured on the Solar repo across 8 workflows: GitHub delivers ~0.6 scheduled
+# runs/hour REGARDLESS of the requested rate â€” 12/h and 2/h both arrive at
+# ~0.6/h. Every gap exceeded Render's 15-minute idle timeout, so a 5-minute cron
+# kept nothing warm for weeks while reporting success on every run. You cannot
+# out-schedule a scheduler that is dropping you.
+#
+# So this does not depend on cron FREQUENCY, only on it eventually firing: each
+# delivered run becomes a loop that pings every 5 minutes until the window ends.
+# One landed fire covers the rest of the working day.
+#
+# `cancel-in-progress: false` is load-bearing. A landing fire is held PENDING
+# behind the live warmer rather than killing it; `true` was tried on Solar and is
+# worse, because it stops the running warmer before its replacement has a runner
+# and opens a coverage gap several times an hour.
+#
+# STAYING GREEN IS DELIBERATE. A warmer must never page anyone for a slow wake,
+# so ping failures are counted and summarised, never fatal.
+#
+# To stop entirely: disable in the Actions tab AND cancel the in-flight run, or
+# it keeps warming until the window closes.
+
+name: keep-warm
+
+on:
+  schedule:
+    # Asked often so that at least one lands inside the window; the delivered
+    # rate is ~0.6/h whatever this says. Offset minutes avoid the :00 high-load
+    # slot GitHub's own docs call the worst one. Do NOT tighten this to "fix"
+    # thin coverage â€” it has no measurable effect.
+    - cron: "3,18,33,48 8-17 * * 1-5"
+  workflow_dispatch: {}
+
+permissions:
+  contents: read
+
+concurrency:
+  group: keep-warm
+  cancel-in-progress: false
+
+jobs:
+  warm:
+    runs-on: ubuntu-latest
+    # The loop stops itself at the window's end; this is a backstop only.
+    timeout-minutes: 335
+    steps:
+      - name: Warm Keycloak until the window closes
+        run: |
+          # A failed ping must never kill the loop. A warmer that dies on the
+          # first slow cold wake is the exact bug that made Solar's
+          # keycloak-keepalive workflow useless.
+          set +e
+
+          # 18:00 UTC â€” the end of the window declared in the header. Computed
+          # from the clock rather than a fixed duration so a fire that lands at
+          # 16:40 warms for 80 minutes and stops, instead of running past the
+          # window and spending hours nobody is awake for.
+          WINDOW_END_HOUR=18
+          INTERVAL=300        # 5 min, comfortably inside Render's 15-min idle
+          # 150s, not 90s. A free-tier wake was measured at 136s on 2026-08-03,
+          # and a cap that expires MID-WAKE aborts the very wake it triggered â€”
+          # which is how a warmer ends up proving nothing. Do not lower this
+          # without a new measurement.
+          MAXTIME=150
+
+          # Only Keycloak. The API and the web services wake on real traffic and
+          # each one added here costs another ~220 h/month from a 750 h budget
+          # shared by four services. See the header before adding a URL.
+          URL="https://autoworkshop-keycloak.onrender.com/realms/autoworkshop/.well-known/openid-configuration"
+
+          START=$(date +%s); ROUNDS=0; FAILURES=0
+
+          summary() {
+            MINS=$(( ($(date +%s) - START) / 60 ))
+            echo "----------------------------------------"
+            echo "warmed ${MINS} min | ${ROUNDS} pings | ${FAILURES} failed"
+            if [ "$ROUNDS" -gt 0 ] && [ "$FAILURES" -eq "$ROUNDS" ]; then
+              # Every ping failed for the whole run. Warn so it is visible in the
+              # run summary, but do NOT fail: a warmer that pages people teaches
+              # them to ignore it, and this is not the outage detector.
+              echo "::warning::keep-warm: every ping failed (${FAILURES}/${ROUNDS}). Keycloak may be down."
+            fi
+          }
+          # The NORMAL way this run ends is the window closing or a newer fire
+          # superseding it â€” print the tally either way, or the common case
+          # leaves no record of what happened.
+          trap 'summary; exit 0' TERM INT
+
+          while [ "$(date -u +%H)" -lt "$WINDOW_END_HOUR" ]; do
+            ROUNDS=$((ROUNDS + 1))
+            # No -f: curl exits 0 for ANY HTTP response, including 5xx. Correct
+            # for a warmer â€” a 500 still proves the container answered, which is
+            # the only thing being measured. Judging health is not this job.
+            OUT=$(curl -sS --max-time "$MAXTIME" -o /dev/null -w "%{http_code} in %{time_total}s" "$URL" 2>&1)
+            if [ $? -ne 0 ]; then
+              FAILURES=$((FAILURES + 1))
+              echo "  WARN $(echo "$OUT" | tr '\n' ' ')"
+            else
+              echo "  ok   ${OUT}"
+            fi
+            # Re-check the hour BEFORE sleeping, so the last cycle of the day
+            # does not sleep five minutes past the window just to exit.
+            [ "$(date -u +%H)" -lt "$WINDOW_END_HOUR" ] || break
+            sleep "$INTERVAL"
+          done
+
+          summary
diff --git a/apps/admin-web/app/auth/error/page.tsx b/apps/admin-web/app/auth/error/page.tsx
new file mode 100644
index 0000000..33287ec
--- /dev/null
+++ b/apps/admin-web/app/auth/error/page.tsx
@@ -0,0 +1,24 @@
+import { AuthErrorScreen } from '@autoworkshop/next-shell';
+
+/**
+ * /auth/error â€” where `pages.error` sends a failed sign-in.
+ *
+ * âš ï¸ THIS ROUTE MUST EXIST IN ALL SEVEN APPS. `workspace-auth.ts` sets
+ * `pages.error` for every workspace from one shared config, so an app without
+ * this file turns a recoverable Keycloak cold start into a 404 â€” strictly worse
+ * than the default screen it replaced. `auth-error-route.spec.ts` asserts all
+ * seven are present.
+ *
+ * Deliberately NOT gated: it is reached BY someone who could not sign in.
+ */
+export const dynamic = 'force-dynamic';
+
+export default async function Page({
+  searchParams,
+}: {
+  searchParams: Promise<{ error?: string }>;
+}) {
+  // Next 15: `searchParams` is a promise.
+  const { error } = await searchParams;
+  return <AuthErrorScreen error={error} />;
+}
diff --git a/apps/customer-web/app/(app)/my-vehicles/service-history/page.tsx b/apps/customer-web/app/(app)/my-vehicles/service-history/page.tsx
new file mode 100644
index 0000000..9b8fcae
--- /dev/null
+++ b/apps/customer-web/app/(app)/my-vehicles/service-history/page.tsx
@@ -0,0 +1,17 @@
+import { requireNavRoute } from '@autoworkshop/next-shell';
+import { ServiceHistoryScreen } from '../../../_screens/service-history-screen';
+
+/**
+ * /my-vehicles/service-history â€” `01 (1).txt` Â§33, the customer workspace.
+ *
+ * âš ï¸ `requireNavRoute` resolves against the viewer's VISIBLE NAVIGATION and is
+ * not authentication â€” see `/my-vehicles/garage` for the full reasoning. The
+ * real scoping is `JobCardService.list`'s customer predicate plus RLS.
+ */
+export const dynamic = 'force-dynamic';
+
+export default async function Page() {
+  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
+  await requireNavRoute('customer', '/my-vehicles/service-history');
+  return <ServiceHistoryScreen />;
+}
diff --git a/apps/customer-web/app/(app)/service-and-repairs/completed-repairs/page.tsx b/apps/customer-web/app/(app)/service-and-repairs/completed-repairs/page.tsx
new file mode 100644
index 0000000..dfab865
--- /dev/null
+++ b/apps/customer-web/app/(app)/service-and-repairs/completed-repairs/page.tsx
@@ -0,0 +1,22 @@
+import { requireNavRoute } from '@autoworkshop/next-shell';
+import { RepairJourneyScreen } from '../../../_screens/repair-journey-screen';
+
+/**
+ * /service-and-repairs/completed-repairs â€” `01 (1).txt` Â§33, the customer workspace.
+ *
+ * âš ï¸ `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION.
+ * It is not authentication: the Â§33 tree has no per-role variants and no
+ * permission on this item, so a signed-out visitor reaches the page, `apiGet`
+ * finds no token, and the screen renders its unauthenticated state. Same
+ * reasoning as `/my-vehicles/garage`, where Codex corrected the opposite claim.
+ *
+ * NOT the control either way. `JobCardService.list` narrows a `customer` viewer
+ * to cards against their OWN vehicles, and RLS isolates the tenant beneath that.
+ */
+export const dynamic = 'force-dynamic';
+
+export default async function Page() {
+  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git show HEAD:packages/next-shell/src/AuthErrorScreen.tsx | Select-String -Pattern "const message|sessionStorage|getItem|setItem|window.location|retrying automatically" | Format-Table LineNumber,Line -AutoSize' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git show HEAD:apps/customer-web/app/_screens/repair-journey-screen.tsx | Select-String -Pattern "apiGet|filter|sort|openedAt|closedAt|ready_for_collection|Contact the workshop" | Format-Table LineNumber,Line -AutoSize' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git show HEAD:.github/workflows/keep-warm.yml | Select-String -Pattern "One landed fire|timeout-minutes|until the window closes|18:00 UTC" | Format-Table LineNumber,Line -AutoSize' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git show HEAD:apps/customer-web/app/_screens/service-history-screen.tsx | Select-String -Pattern "apiGet|done|closedAt|mileageAtIntake|customerStage" | Format-Table LineNumber,Line -AutoSize' in C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git show HEAD:packages/next-shell/src/AuthErrorScreen.tsx | Select-String -Pattern "const message|sessionStorage|getItem|setItem|window.location|retrying automatically" | Format-Table LineNumber,Line -AutoSize'` rejected: blocked by policy
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git show HEAD:apps/customer-web/app/_screens/repair-journey-screen.tsx | Select-String -Pattern "apiGet|filter|sort|openedAt|closedAt|ready_for_collection|Contact the workshop" | Format-Table LineNumber,Line -AutoSize'` rejected: blocked by policy
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git show HEAD:.github/workflows/keep-warm.yml | Select-String -Pattern "One landed fire|timeout-minutes|until the window closes|18:00 UTC" | Format-Table LineNumber,Line -AutoSize'` rejected: blocked by policy
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git show HEAD:apps/customer-web/app/_screens/service-history-screen.tsx | Select-String -Pattern "apiGet|done|closedAt|mileageAtIntake|customerStage" | Format-Table LineNumber,Line -AutoSize'` rejected: blocked by policy
2026-08-04T12:55:06.469523Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git show HEAD:packages/next-shell/src/AuthErrorScreen.tsx | Select-String -Pattern "const message|sessionStorage|getItem|setItem|window.location|retrying automatically" | Format-Table LineNumber,Line -AutoSize'` rejected: blocked by policy
2026-08-04T12:55:06.795946Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git show HEAD:apps/customer-web/app/_screens/repair-journey-screen.tsx | Select-String -Pattern "apiGet|filter|sort|openedAt|closedAt|ready_for_collection|Contact the workshop" | Format-Table LineNumber,Line -AutoSize'` rejected: blocked by policy
2026-08-04T12:55:06.795956Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git show HEAD:.github/workflows/keep-warm.yml | Select-String -Pattern "One landed fire|timeout-minutes|until the window closes|18:00 UTC" | Format-Table LineNumber,Line -AutoSize'` rejected: blocked by policy
2026-08-04T12:55:06.795958Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git show HEAD:apps/customer-web/app/_screens/service-history-screen.tsx | Select-String -Pattern "apiGet|done|closedAt|mileageAtIntake|customerStage" | Format-Table LineNumber,Line -AutoSize'` rejected: blocked by policy
codex
The local shell policy is also rejecting some piped formatting commands, so I’m using the line numbers from the file snapshots already read plus targeted `rg -n` output where available. The final checklist will stay tied to specific committed lines.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "One landed fire|timeout-minutes|until the window closes|WINDOW_END_HOUR|cron" .github/workflows/keep-warm.yml' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "const message|sessionStorage|getItem|setItem|window.location|retrying automatically" packages/next-shell/src/AuthErrorScreen.tsx' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "apiGet|filter|sort|openedAt|closedAt|Contact the workshop|ready_for_collection|needsCustomer" apps/customer-web/app/_screens/repair-journey-screen.tsx apps/customer-web/app/_screens/service-history-screen.tsx apps/customer-web/app/_screens/repair-journey.ts' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 737ms:
37:# ~0.6/h. Every gap exceeded Render's 15-minute idle timeout, so a 5-minute cron
41:# So this does not depend on cron FREQUENCY, only on it eventually firing: each
43:# One landed fire covers the rest of the working day.
54:# it keeps warming until the window closes.
64:    - cron: "3,18,33,48 8-17 * * 1-5"
78:    timeout-minutes: 335
80:      - name: Warm Keycloak until the window closes
91:          WINDOW_END_HOUR=18
122:          while [ "$(date -u +%H)" -lt "$WINDOW_END_HOUR" ]; do
136:            [ "$(date -u +%H)" -lt "$WINDOW_END_HOUR" ] || break

 succeeded in 745ms:
95:  const message = (error ? MESSAGES[error] : undefined) ?? FALLBACK;
201:      if (!sessionStorage.getItem('aw-auth-retried')) {
202:        sessionStorage.setItem('aw-auth-retried', '1');
203:        window.location.href = link.getAttribute('href');
207:    el.textContent = '— retrying automatically in ' + left + 's';

 succeeded in 750ms:
apps/customer-web/app/_screens/repair-journey.ts:163:  ready_for_collection: {
apps/customer-web/app/_screens/repair-journey.ts:183:    detail: 'This job is paused. Contact the workshop if you were not told why.',
apps/customer-web/app/_screens/repair-journey.ts:211:export function needsCustomer(stage: string): boolean {
apps/customer-web/app/_screens/service-history-screen.tsx:2:import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
apps/customer-web/app/_screens/service-history-screen.tsx:39:  openedAt: string;
apps/customer-web/app/_screens/service-history-screen.tsx:40:  closedAt: string | null;
apps/customer-web/app/_screens/service-history-screen.tsx:67:  const result = await apiGet<JobCardRow[]>('customer', '/job-cards');
apps/customer-web/app/_screens/service-history-screen.tsx:72:  const done = result.data.filter((c) => customerStage(c.stage).phase === 'finished');
apps/customer-web/app/_screens/service-history-screen.tsx:84:  // the top — a Map preserves insertion order, so the sort has to happen first.
apps/customer-web/app/_screens/service-history-screen.tsx:85:  const ordered = [...done].sort(
apps/customer-web/app/_screens/service-history-screen.tsx:87:      new Date(b.closedAt ?? b.openedAt).getTime() - new Date(a.closedAt ?? a.openedAt).getTime(),
apps/customer-web/app/_screens/service-history-screen.tsx:158:                    <strong>{when(c.closedAt ?? c.openedAt)}</strong>
apps/customer-web/app/_screens/service-history-screen.tsx:175:                    is the sort of thing that ends up in a sale listing.
apps/customer-web/app/_screens/repair-journey-screen.tsx:3:import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
apps/customer-web/app/_screens/repair-journey-screen.tsx:6:import { customerStage, needsCustomer, type JourneyPhase } from './repair-journey';
apps/customer-web/app/_screens/repair-journey-screen.tsx:26: * were deleted, no amount of filtering here would save it (CLAUDE.md §8).
apps/customer-web/app/_screens/repair-journey-screen.tsx:50:  openedAt: string;
apps/customer-web/app/_screens/repair-journey-screen.tsx:52:  closedAt: string | null;
apps/customer-web/app/_screens/repair-journey-screen.tsx:91:    keep: (c) => needsCustomer(c.stage),
apps/customer-web/app/_screens/repair-journey-screen.tsx:130:  const result = await apiGet<JobCardRow[]>('customer', '/job-cards');
apps/customer-web/app/_screens/repair-journey-screen.tsx:139:  const cards = result.data.filter(config.keep);
apps/customer-web/app/_screens/repair-journey-screen.tsx:147:  const ordered = [...cards].sort(
apps/customer-web/app/_screens/repair-journey-screen.tsx:148:    (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime(),
apps/customer-web/app/_screens/repair-journey-screen.tsx:151:  const waiting = ordered.filter((c) => needsCustomer(c.stage)).length;
apps/customer-web/app/_screens/repair-journey-screen.tsx:256:        <Fact label="Requested" value={when(card.openedAt)} />
apps/customer-web/app/_screens/repair-journey-screen.tsx:289:          Contact the workshop to {actionFor(card.stage)}.
apps/customer-web/app/_screens/repair-journey-screen.tsx:305:    case 'ready_for_collection':

codex
The broader product requirement includes “approve the work” and the extension’s customer workspace calls out approve/reject/modify. The new `repair-proposals` page deliberately punts that to “contact the workshop,” so I’m treating that as a partial implementation rather than a code bug.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "decision|decidedByName|approve|decline|modif|customer" apps/api/src/repair/proposal.service.ts apps/api/src/repair/repair.controller.ts apps/workshop-web/app/_screens/proposal* apps/customer-web/app/_screens/repair-journey-screen.tsx' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "approve/reject/modify|approve the work|authenticated, authorised, audited|Personal vehicle workspace|My Repair Dashboard" README.md docs/00-project/PLAN_EXTENSION_v1.md docs/00-project/COMBINED_PLAN_v2.md' in C:\Users\USER\Documents\autoworkshop-ai
 exited 1 in 567ms:
apps/customer-web/app/_screens/repair-journey-screen.tsx:6:import { customerStage, needsCustomer, type JourneyPhase } from './repair-journey';
apps/customer-web/app/_screens/repair-journey-screen.tsx:9: * The customer's repair journey — `01 (1).txt` §33's `service-and-repairs` group.
apps/customer-web/app/_screens/repair-journey-screen.tsx:13: * WHICH of the customer's cards they show and how the empty state reads. Four
apps/customer-web/app/_screens/repair-journey-screen.tsx:18: *   /service-and-repairs/repair-proposals    the ones waiting on the customer
apps/customer-web/app/_screens/repair-journey-screen.tsx:22: * narrows a `customer` viewer to cards raised against their OWN vehicles — one
apps/customer-web/app/_screens/repair-journey-screen.tsx:87:      'The repairs that cannot go any further until you do something — approve a quote, pay a deposit, answer a question or collect the vehicle.',
apps/customer-web/app/_screens/repair-journey-screen.tsx:103:  return customerStage(card.stage).phase;
apps/customer-web/app/_screens/repair-journey-screen.tsx:130:  const result = await apiGet<JobCardRow[]>('customer', '/job-cards');
apps/customer-web/app/_screens/repair-journey-screen.tsx:136:    return <ApiFailure reason={result.reason} workspaceId="customer" />;
apps/customer-web/app/_screens/repair-journey-screen.tsx:145:  // Newest first. The API orders for the workshop's purposes; a customer with
apps/customer-web/app/_screens/repair-journey-screen.tsx:186:  const stage = customerStage(card.stage);
apps/customer-web/app/_screens/repair-journey-screen.tsx:192:        // A card the customer must act on is outlined in the attention colour.
apps/customer-web/app/_screens/repair-journey-screen.tsx:281:            Approving a proposal in-app is `POST /proposals/:id/decision`, and
apps/customer-web/app/_screens/repair-journey-screen.tsx:282:            that route is written for a staff member CAPTURING the customer's
apps/customer-web/app/_screens/repair-journey-screen.tsx:283:            answer — `decidedByName` is the customer while the session is the
apps/customer-web/app/_screens/repair-journey-screen.tsx:284:            workshop's. A self-service decision needs its own authenticated
apps/customer-web/app/_screens/repair-journey-screen.tsx:296:/** The verb for the one thing this customer has to do. */
apps/customer-web/app/_screens/repair-journey-screen.tsx:299:    case 'awaiting_customer_approval':
apps/customer-web/app/_screens/repair-journey-screen.tsx:300:      return 'approve or decline the repair proposal';
apps/api/src/repair/proposal.service.ts:21:  decisionChannelLabel,
apps/api/src/repair/proposal.service.ts:29: * What §410-§422 says the customer must be shown, gathered from the records that
apps/api/src/repair/proposal.service.ts:33: * time a proposal can exist — a submitted inspection (010), an approved diagnosis
apps/api/src/repair/proposal.service.ts:34: * (012), an approved plan (014), an approved quotation (016). Snapshotting them onto
apps/api/src/repair/proposal.service.ts:78:   * The field most likely to be dropped and the one §416 names explicitly: a customer
apps/api/src/repair/proposal.service.ts:83:  /** §418's proposed work — the approved plan's tasks. */
apps/api/src/repair/proposal.service.ts:104:   * A commercial document a customer may quote back at the workshop needs an
apps/api/src/repair/proposal.service.ts:118:  customerName: string;
apps/api/src/repair/proposal.service.ts:129:  decision: ProposalDecision | null;
apps/api/src/repair/proposal.service.ts:130:  approvedOption: ProposalOption | null;
apps/api/src/repair/proposal.service.ts:132:  decidedByName: string | null;
apps/api/src/repair/proposal.service.ts:133:  decisionChannel: DecisionChannel | string | null;
apps/api/src/repair/proposal.service.ts:134:  decisionChannelLabel: string | null;
apps/api/src/repair/proposal.service.ts:135:  decisionNote: string | null;
apps/api/src/repair/proposal.service.ts:139:  /** §7 — the total the customer actually agreed to, once they have. */
apps/api/src/repair/proposal.service.ts:154: * The customer proposal — `1.txt` §396-§424, `07.txt` §7.
apps/api/src/repair/proposal.service.ts:167: *   · An ISSUED proposal freezes too. A document that changes while the customer is
apps/api/src/repair/proposal.service.ts:172: * §410-§422 lists twelve things the customer must see, and ten already exist in
apps/api/src/repair/proposal.service.ts:209:   * Draft a proposal from the approved quotation — or, when the last one has been
apps/api/src/repair/proposal.service.ts:240:            : `version ${open.version_no} is with the customer and has not been answered; ` +
apps/api/src/repair/proposal.service.ts:241:              'record their decision before issuing a new version',
apps/api/src/repair/proposal.service.ts:257:      // ⚠️ AN APPROVED PROPOSAL IS NOT SUPERSEDED SILENTLY. Once a customer has
apps/api/src/repair/proposal.service.ts:262:      if (previous?.status === 'approved') {
apps/api/src/repair/proposal.service.ts:264:          `version ${previous.version_no} has been APPROVED by the customer. A material ` +
apps/api/src/repair/proposal.service.ts:280:        // is both prepared and internally approved.
apps/api/src/repair/proposal.service.ts:283:            'Prepare a quotation and have a manager approve it on the Quotations screen first.',
apps/api/src/repair/proposal.service.ts:373:   * Put the proposal in front of the customer.
apps/api/src/repair/proposal.service.ts:408:        // The money the customer is being shown, so the trail records the offer as
apps/api/src/repair/proposal.service.ts:426:   * §7 — record the customer's answer.
apps/api/src/repair/proposal.service.ts:430:   * `decidedByName` is the CUSTOMER and is mandatory; `recorded_by` is the staff
apps/api/src/repair/proposal.service.ts:433:   * agreed to this" when a customer later says they did not.
apps/api/src/repair/proposal.service.ts:436:   * decision frequently arrives off-system — and "approved" with no channel is an
apps/api/src/repair/proposal.service.ts:443:      decision?: string;
apps/api/src/repair/proposal.service.ts:444:      approvedOption?: string;
apps/api/src/repair/proposal.service.ts:445:      decidedByName?: string;
apps/api/src/repair/proposal.service.ts:446:      decisionChannel?: string;
apps/api/src/repair/proposal.service.ts:452:    const decision: ProposalDecision = requireOneOf(input.decision, PROPOSAL_DECISIONS, 'decision');
apps/api/src/repair/proposal.service.ts:454:      input.decisionChannel, DECISION_CHANNELS, 'decisionChannel',
apps/api/src/repair/proposal.service.ts:456:    const decidedByName = requireText(input.decidedByName, 'decidedByName', 300);
apps/api/src/repair/proposal.service.ts:460:    // what says which. A decline with no reason leaves the workshop nothing to act on.
apps/api/src/repair/proposal.service.ts:461:    if (decision !== 'approved' && note === null) {
apps/api/src/repair/proposal.service.ts:463:        decision === 'declined'
apps/api/src/repair/proposal.service.ts:464:          ? 'a declined proposal must record why; note is required'
apps/api/src/repair/proposal.service.ts:465:          : 'say what the customer asked to change, or what they want explained; note is required',
apps/api/src/repair/proposal.service.ts:469:    const approvedOption: ProposalOption | null =
apps/api/src/repair/proposal.service.ts:470:      decision === 'approved'
apps/api/src/repair/proposal.service.ts:471:        ? requireOneOf(input.approvedOption, PROPOSAL_OPTIONS, 'approvedOption')
apps/api/src/repair/proposal.service.ts:493:          'this proposal has not been issued to the customer yet, so there is no decision to record',
apps/api/src/repair/proposal.service.ts:505:            SET status = $1, decision = $1, approved_option = $2,
apps/api/src/repair/proposal.service.ts:506:                decided_at = now(), decided_by_name = $3, decision_channel = $4,
apps/api/src/repair/proposal.service.ts:507:                decision_note = $5, recorded_by = $6,
apps/api/src/repair/proposal.service.ts:510:        [decision, approvedOption, decidedByName, channel, note, ctx.userId, id, ctx.tenantId],
apps/api/src/repair/proposal.service.ts:515:          decision === 'approved'
apps/api/src/repair/proposal.service.ts:516:            ? 'proposal.approved_by_customer'
apps/api/src/repair/proposal.service.ts:517:            : decision === 'declined'
apps/api/src/repair/proposal.service.ts:518:              ? 'proposal.declined_by_customer'
apps/api/src/repair/proposal.service.ts:522:        // The channel and the option, never the customer's free text. This is the
apps/api/src/repair/proposal.service.ts:527:          decision,
apps/api/src/repair/proposal.service.ts:528:          approvedOption,
apps/api/src/repair/proposal.service.ts:552:              c.display_name AS customer_name,
apps/api/src/repair/proposal.service.ts:553:              c.email AS customer_email, c.phone AS customer_phone,
apps/api/src/repair/proposal.service.ts:554:              c.location AS customer_location,
apps/api/src/repair/proposal.service.ts:567:              p.issued_at, p.decision, p.approved_option, p.decided_at,
apps/api/src/repair/proposal.service.ts:568:              p.decided_by_name, p.decision_channel, p.decision_note, p.superseded_by,
apps/api/src/repair/proposal.service.ts:598:         JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
apps/api/src/repair/proposal.service.ts:691:      // lines a customer can read.
apps/api/src/repair/proposal.service.ts:705:        customerName: row.customer_name,
apps/api/src/repair/proposal.service.ts:716:        decision: row.decision,
apps/api/src/repair/proposal.service.ts:717:        approvedOption: row.approved_option,
apps/api/src/repair/proposal.service.ts:719:        decidedByName: row.decided_by_name,
apps/api/src/repair/proposal.service.ts:720:        decisionChannel: row.decision_channel,
apps/api/src/repair/proposal.service.ts:721:        decisionChannelLabel: row.decision_channel ? decisionChannelLabel(row.decision_channel) : null,
apps/api/src/repair/proposal.service.ts:722:        decisionNote: row.decision_note,
apps/api/src/repair/proposal.service.ts:755:            // The trading name is what a customer recognises; the legal name is who the
apps/api/src/repair/proposal.service.ts:771:            name: row.customer_name,
apps/api/src/repair/proposal.service.ts:772:            email: row.customer_email,
apps/api/src/repair/proposal.service.ts:773:            phone: row.customer_phone,
apps/api/src/repair/proposal.service.ts:774:            location: row.customer_location,
apps/api/src/repair/proposal.service.ts:783:        // What the customer actually agreed to — the figure an invoice is later checked
apps/api/src/repair/proposal.service.ts:784:        // against, and the reason `approved_option` is stored rather than inferred.
apps/api/src/repair/proposal.service.ts:786:          row.approved_option === 'comprehensive'
apps/api/src/repair/proposal.service.ts:788:            : row.approved_option === 'recommended'
apps/api/src/repair/proposal.service.ts:807:         JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
apps/api/src/repair/proposal.service.ts:815:        ctx.activeRole === 'customer' ? ctx.userId : null,
apps/api/src/repair/proposal.service.ts:849:          ? `version ${row.version_no} is with the customer and its content is frozen; ` +
apps/api/src/repair/proposal.service.ts:850:            'record their decision, then prepare a new version'
apps/api/src/repair/proposal.service.ts:851:          : `version ${row.version_no} is ${row.status}. §424: an approved proposal is ` +
apps/api/src/repair/proposal.service.ts:896:      throw new ForbiddenException(`role '${ctx.activeRole}' may not prepare a customer proposal`);
apps/api/src/repair/proposal.service.ts:903:        `role '${ctx.activeRole}' may not record a customer decision`,
apps/api/src/repair/proposal.service.ts:953:  customer_name: string;
apps/api/src/repair/proposal.service.ts:968:  decision: ProposalDecision | null;
apps/api/src/repair/proposal.service.ts:969:  approved_option: ProposalOption | null;
apps/api/src/repair/proposal.service.ts:972:  decision_channel: DecisionChannel | null;
apps/api/src/repair/proposal.service.ts:973:  decision_note: string | null;
apps/api/src/repair/proposal.service.ts:984:  customer_email: string | null;
apps/api/src/repair/proposal.service.ts:985:  customer_phone: string | null;
apps/api/src/repair/proposal.service.ts:986:  customer_location: string | null;
apps/api/src/repair/repair.controller.ts:211:   * The service refuses unless the card is at `solution_preparation` AND an approved
apps/api/src/repair/repair.controller.ts:234:   * §10 + §3 — "the approved repair plan is sent to quotation preparation" and
apps/api/src/repair/repair.controller.ts:237:   * No body: the draft is generated FROM the approved plan, not typed in. A payload
apps/api/src/repair/repair.controller.ts:249:  /** The customer proposals for a job card — `1.txt` §396-§424 (slice 6). */
apps/api/src/repair/repair.controller.ts:259:   * Draft a proposal from the approved quotation — or §424's NEW VERSION of it.
apps/api/src/repair/repair.controller.ts:284:   * The service refuses unless an APPROVED customer proposal exists (§7: work shall
apps/api/src/repair/repair.controller.ts:286:   * approved plan task — §5 has the technician follow the APPROVED procedure, so the
apps/api/src/repair/repair.controller.ts:500:   * §1292's review — approve, or reject with a reason.
apps/api/src/repair/repair.controller.ts:683:   * §30-§31's internal technical review — approve, or reject with a reason.
apps/api/src/repair/repair.controller.ts:783:  /** §5's internal approval — approve, or reject with a reason. */
apps/api/src/repair/repair.controller.ts:798: * A SEPARATE controller, the judgement every sibling here made: recording a decision
apps/api/src/repair/repair.controller.ts:839:   * Put the proposal in front of the customer.
apps/api/src/repair/repair.controller.ts:853:   * §7 — record the customer's answer.
apps/api/src/repair/repair.controller.ts:855:   * `decidedByName` is the CUSTOMER and is required; the staff member who captured it
apps/api/src/repair/repair.controller.ts:858:  @Post(':id/decision')
apps/api/src/repair/repair.controller.ts:1051:   * themselves is not an approval, and §35 exists precisely so that decision has a name
apps/api/src/repair/repair.controller.ts:1055:  approveCriticalOverride(
apps/api/src/repair/repair.controller.ts:1060:    return this.testing.approveCriticalOverride(req.tenantContext, id, body ?? {});
apps/api/src/repair/repair.controller.ts:1161: * CUSTOMER. A customer is often not a system user at all — they answer the
apps/api/src/repair/repair.controller.ts:1162: * phone. So `decidedByName` and `decisionChannel` are what carry the consent,
apps/api/src/repair/repair.controller.ts:1188:  /** §3792 — reviewed internally, then optionally sent to the customer. */
apps/api/src/repair/repair.controller.ts:1198:  /** The customer's answer — and, for an approval, the authorisation with it. */
apps/api/src/repair/repair.controller.ts:1199:  @Patch(':id/decision')
rg: apps/workshop-web/app/_screens/proposal*: The filename, directory name, or volume label syntax is incorrect. (os error 123)

2026-08-04T12:55:59.592107Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 0.6 seconds
Output:
apps/customer-web/app/_screens/repair-journey-screen.tsx:6:import { customerStage, needsCustomer, type JourneyPhase } from './repair-journey';
apps/customer-web/app/_screens/repair-journey-screen.tsx:9: * The customer's repair journey — `01 (1).txt` §33's `service-and-repairs` group.
apps/customer-web/app/_screens/repair-journey-screen.tsx:13: * WHICH of the customer's cards they show and how the empty state reads. Four
apps/customer-web/app/_screens/repair-journey-screen.tsx:18: *   /service-and-repairs/repair-proposals    the ones waiting on the customer
apps/customer-web/app/_screens/repair-journey-screen.tsx:22: * narrows a `customer` viewer to cards raised against their OWN vehicles — one
apps/customer-web/app/_screens/repair-journey-screen.tsx:87:      'The repairs that cannot go any further until you do something — approve a quote, pay a deposit, answer a question or collect the vehicle.',
apps/customer-web/app/_screens/repair-journey-screen.tsx:103:  return customerStage(card.stage).phase;
apps/customer-web/app/_screens/repair-journey-screen.tsx:130:  const result = await apiGet<JobCardRow[]>('customer', '/job-cards');
apps/customer-web/app/_screens/repair-journey-screen.tsx:136:    return <ApiFailure reason={result.reason} workspaceId="customer" />;
apps/customer-web/app/_screens/repair-journey-screen.tsx:145:  // Newest first. The API orders for the workshop's purposes; a customer with
apps/customer-web/app/_screens/repair-journey-screen.tsx:186:  const stage = customerStage(card.stage);
apps/customer-web/app/_screens/repair-journey-screen.tsx:192:        // A card the customer must act on is outlined in the attention colour.
apps/customer-web/app/_screens/repair-journey-screen.tsx:281:            Approving a proposal in-app is `POST /proposals/:id/decision`, and
apps/customer-web/app/_screens/repair-journey-screen.tsx:282:            that route is written for a staff member CAPTURING the customer's
apps/customer-web/app/_screens/repair-journey-screen.tsx:283:            answer — `decidedByName` is the customer while the session is the
apps/customer-web/app/_screens/repair-journey-screen.tsx:284:            workshop's. A self-service decision needs its own authenticated
apps/customer-web/app/_screens/repair-journey-screen.tsx:296:/** The verb for the one thing this customer has to do. */
apps/customer-web/app/_screens/repair-journey-screen.tsx:299:    case 'awaiting_customer_approval':
apps/customer-web/app/_screens/repair-journey-screen.tsx:300:      return 'approve or decline the repair proposal';
apps/api/src/repair/proposal.service.ts:21:  decisionChannelLabel,
apps/api/src/repair/proposal.service.ts:29: * What §410-§422 says the customer must be shown, gathered from the records that
apps/api/src/repair/proposal.service.ts:33: * time a proposal can exist — a submitted inspection (010), an approved diagnosis
apps/api/src/repair/proposal.service.ts:34: * (012), an approved plan (014), an approved quotation (016). Snapshotting them onto
apps/api/src/repair/proposal.service.ts:78:   * The field most likely to be dropped and the one §416 names explicitly: a customer
apps/api/src/repair/proposal.service.ts:83:  /** §418's proposed work — the approved plan's tasks. */
apps/api/src/repair/proposal.service.ts:104:   * A commercial document a customer may quote back at the workshop needs an
apps/api/src/repair/proposal.service.ts:118:  customerName: string;
apps/api/src/repair/proposal.service.ts:129:  decision: ProposalDecision | null;
apps/api/src/repair/proposal.service.ts:130:  approvedOption: ProposalOption | null;
apps/api/src/repair/proposal.service.ts:132:  decidedByName: string | null;
apps/api/src/repair/proposal.service.ts:133:  decisionChannel: DecisionChannel | string | null;
apps/api/src/repair/proposal.service.ts:134:  decisionChannelLabel: string | null;
apps/api/src/repair/proposal.service.ts:135:  decisionNote: string | null;
apps/api/src/repair/proposal.service.ts:139:  /** §7 — the total the customer actually agreed to, once they have. */
apps/api/src/repair/proposal.service.ts:154: * The customer proposal — `1.txt` §396-§424, `07.txt` §7.
apps/api/src/repair/proposal.service.ts:167: *   · An ISSUED proposal freezes too. A document that changes while the customer is
apps/api/src/repair/proposal.service.ts:172: * §410-§422 lists twelve things the customer must see, and ten already exist in
apps/api/src/repair/proposal.service.ts:209:   * Draft a proposal from the approved quotation — or, when the last one has been
apps/api/src/repair/proposal.service.ts:240:            : `version ${open.version_no} is with the customer and has not been answered; ` +
apps/api/src/repair/proposal.service.ts:241:              'record their decision before issuing a new version',
apps/api/src/repair/proposal.service.ts:257:      // ⚠️ AN APPROVED PROPOSAL IS NOT SUPERSEDED SILENTLY. Once a customer has
apps/api/src/repair/proposal.service.ts:262:      if (previous?.status === 'approved') {
apps/api/src/repair/proposal.service.ts:264:          `version ${previous.version_no} has been APPROVED by the customer. A material ` +
apps/api/src/repair/proposal.service.ts:280:        // is both prepared and internally approved.
apps/api/src/repair/proposal.service.ts:283:            'Prepare a quotation and have a manager approve it on the Quotations screen first.',
apps/api/src/repair/proposal.service.ts:373:   * Put the proposal in front of the customer.
apps/api/src/repair/proposal.service.ts:408:        // The money the customer is being shown, so the trail records the offer as
apps/api/src/repair/proposal.service.ts:426:   * §7 — record the customer's answer.
apps/api/src/repair/proposal.service.ts:430:   * `decidedByName` is the CUSTOMER and is mandatory; `recorded_by` is the staff
apps/api/src/repair/proposal.service.ts:433:   * agreed to this" when a customer later says they did not.
apps/api/src/repair/proposal.service.ts:436:   * decision frequently arrives off-system — and "approved" with no channel is an
apps/api/src/repair/proposal.service.ts:443:      decision?: string;
apps/api/src/repair/proposal.service.ts:444:      approvedOption?: string;
apps/api/src/repair/proposal.service.ts:445:      decidedByName?: string;
apps/api/src/repair/proposal.service.ts:446:      decisionChannel?: string;
apps/api/src/repair/proposal.service.ts:452:    const decision: ProposalDecision = requireOneOf(input.decision, PROPOSAL_DECISIONS, 'decision');
apps/api/src/repair/proposal.service.ts:454:      input.decisionChannel, DECISION_CHANNELS, 'decisionChannel',
apps/api/src/repair/proposal.service.ts:456:    const decidedByName = requireText(input.decidedByName, 'decidedByName', 300);
apps/api/src/repair/proposal.service.ts:460:    // what says which. A decline with no reason leaves the workshop nothing to act on.
apps/api/src/repair/proposal.service.ts:461:    if (decision !== 'approved' && note === null) {
apps/api/src/repair/proposal.service.ts:463:        decision === 'declined'
apps/api/src/repair/proposal.service.ts:464:          ? 'a declined proposal must record why; note is required'
apps/api/src/repair/proposal.service.ts:465:          : 'say what the customer asked to change, or what they want explained; note is required',
apps/api/src/repair/proposal.service.ts:469:    const approvedOption: ProposalOption | null =
apps/api/src/repair/proposal.service.ts:470:      decision === 'approved'
apps/api/src/repair/proposal.service.ts:471:        ? requireOneOf(input.approvedOption, PROPOSAL_OPTIONS, 'approvedOption')
apps/api/src/repair/proposal.service.ts:493:          'this proposal has not been issued to the customer yet, so there is no decision to record',
apps/api/src/repair/proposal.service.ts:505:            SET status = $1, decision = $1, approved_option = $2,
apps/api/src/repair/proposal.service.ts:506:                decided_at = now(), decided_by_name = $3, decision_channel = $4,
apps/api/src/repair/proposal.service.ts:507:                decision_note = $5, recorded_by = $6,
apps/api/src/repair/proposal.service.ts:510:        [decision, approvedOption, decidedByName, channel, note, ctx.userId, id, ctx.tenantId],
apps/api/src/repair/proposal.service.ts:515:          decision === 'approved'
apps/api/src/repair/proposal.service.ts:516:            ? 'proposal.approved_by_customer'
apps/api/src/repair/proposal.service.ts:517:            : decision === 'declined'
apps/api/src/repair/proposal.service.ts:518:              ? 'proposal.declined_by_customer'
apps/api/src/repair/proposal.service.ts:522:        // The channel and the option, never the customer's free text. This is the
apps/api/src/repair/proposal.service.ts:527:          decision,
apps/api/src/repair/proposal.service.ts:528:          approvedOption,
apps/api/src/repair/proposal.service.ts:552:              c.display_name AS customer_name,
apps/api/src/repair/proposal.service.ts:553:              c.email AS customer_email, c.phone AS customer_phone,
apps/api/src/repair/proposal.service.ts:554:              c.location AS customer_location,
apps/api/src/repair/proposal.service.ts:567:              p.issued_at, p.decision, p.approved_option, p.decided_at,
apps/api/src/repair/proposal.service.ts:568:              p.decided_by_name, p.decision_channel, p.decision_note, p.superseded_by,
apps/api/src/repair/proposal.service.ts:598:         JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
apps/api/src/repair/proposal.service.ts:691:      // lines a customer can read.
apps/api/src/repair/proposal.service.ts:705:        customerName: row.customer_name,
apps/api/src/repair/proposal.service.ts:716:        decision: row.decision,
apps/api/src/repair/proposal.service.ts:717:        approvedOption: row.approved_option,
apps/api/src/repair/proposal.service.ts:719:        decidedByName: row.decided_by_name,
apps/api/src/repair/proposal.service.ts:720:        decisionChannel: row.decision_channel,
apps/api/src/repair/proposal.service.ts:721:        decisionChannelLabel: row.decision_channel ? decisionChannelLabel(row.decision_channel) : null,
apps/api/src/repair/proposal.service.ts:722:        decisionNote: row.decision_note,
apps/api/src/repair/proposal.service.ts:755:            // The trading name is what a customer recognises; the legal name is who the
apps/api/src/repair/proposal.service.ts:771:            name: row.customer_name,
apps/api/src/repair/proposal.service.ts:772:            email: row.customer_email,
apps/api/src/repair/proposal.service.ts:773:            phone: row.customer_phone,
apps/api/src/repair/proposal.service.ts:774:            location: row.customer_location,
apps/api/src/repair/proposal.service.ts:783:        // What the customer actually agreed to — the figure an invoice is later checked
apps/api/src/repair/proposal.service.ts:784:        // against, and the reason `approved_option` is stored rather than inferred.
apps/api/src/repair/proposal.service.ts:786:          row.approved_option === 'comprehensive'
apps/api/src/repair/proposal.service.ts:788:            : row.approved_option === 'recommended'
apps/api/src/repair/proposal.service.ts:807:         JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
apps/api/src/repair/proposal.service.ts:815:        ctx.activeRole === 'customer' ? ctx.userId : null,
apps/api/src/repair/proposal.service.ts:849:          ? `version ${row.version_no} is with the customer and its content is frozen; ` +
apps/api/src/repair/proposal.service.ts:850:            'record their decision, then prepare a new version'
apps/api/src/repair/proposal.service.ts:851:          : `version ${row.version_no} is ${row.status}. §424: an approved proposal is ` +
apps/api/src/repair/proposal.service.ts:896:      throw new ForbiddenException(`role '${ctx.activeRole}' may not prepare a customer proposal`);
apps/api/src/repair/proposal.service.ts:903:        `role '${ctx.activeRole}' may not record a customer decision`,
apps/api/src/repair/proposal.service.ts:953:  customer_name: string;
apps/api/src/repair/proposal.service.ts:968:  decision: ProposalDecision | null;
apps/api/src/repair/proposal.service.ts:969:  approved_option: ProposalOption | null;
apps/api/src/repair/proposal.service.ts:972:  decision_channel: DecisionChannel | null;
apps/api/src/repair/proposal.service.ts:973:  decision_note: string | null;
apps/api/src/repair/proposal.service.ts:984:  customer_email: string | null;
apps/api/src/repair/proposal.service.ts:985:  customer_phone: string | null;
apps/api/src/repair/proposal.service.ts:986:  customer_location: string | null;
apps/api/src/repair/repair.controller.ts:211:   * The service refuses unless the card is at `solution_preparation` AND an approved
apps/api/src/repair/repair.controller.ts:234:   * §10 + §3 — "the approved repair plan is sent to quotation preparation" and
apps/api/src/repair/repair.controller.ts:237:   * No body: the draft is generated FROM the approved plan, not typed in. A payload
apps/api/src/repair/repair.controller.ts:249:  /** The customer proposals for a job card — `1.txt` §396-§424 (slice 6). */
apps/api/src/repair/repair.controller.ts:259:   * Draft a proposal from the approved quotation — or §424's NEW VERSION of it.
apps/api/src/repair/repair.controller.ts:284:   * The service refuses unless an APPROVED customer proposal exists (§7: work shall
apps/api/src/repair/repair.controller.ts:286:   * approved plan task — §5 has the technician follow the APPROVED procedure, so the
apps/api/src/repair/repair.controller.ts:500:   * §1292's review — approve, or reject with a reason.
apps/api/src/repair/repair.controller.ts:683:   * §30-§31's internal technical review — approve, or reject with a reason.
apps/api/src/repair/repair.controller.ts:783:  /** §5's internal approval — approve, or reject with a reason. */
apps/api/src/repair/repair.controller.ts:798: * A SEPARATE controller, the judgement every sibling here made: recording a decision
apps/api/src/repair/repair.controller.ts:839:   * Put the proposal in front of the customer.
apps/api/src/repair/repair.controller.ts:853:   * §7 — record the customer's answer.
apps/api/src/repair/repair.controller.ts:855:   * `decidedByName` is the CUSTOMER and is required; the staff member who captured it
apps/api/src/repair/repair.controller.ts:858:  @Post(':id/decision')
apps/api/src/repair/repair.controller.ts:1051:   * themselves is not an approval, and §35 exists precisely so that decision has a name
apps/api/src/repair/repair.controller.ts:1055:  approveCriticalOverride(
apps/api/src/repair/repair.controller.ts:1060:    return this.testing.approveCriticalOverride(req.tenantContext, id, body ?? {});
apps/api/src/repair/repair.controller.ts:1161: * CUSTOMER. A customer is often not a system user at all — they answer the
apps/api/src/repair/repair.controller.ts:1162: * phone. So `decidedByName` and `decisionChannel` are what carry the consent,
apps/api/src/repair/repair.controller.ts:1188:  /** §3792 — reviewed internally, then optionally sent to the customer. */
apps/api/src/repair/repair.controller.ts:1198:  /** The customer's answer — and, for an approval, the authorisation with it. */
apps/api/src/repair/repair.controller.ts:1199:  @Patch(':id/decision')
rg: apps/workshop-web/app/_screens/proposal*: The filename, directory name, or volume label syntax is incorrect. (os error 123)

 succeeded in 569ms:
docs/00-project/PLAN_EXTENSION_v1.md:91:- **Personal vehicle workspace + My Repair Dashboard** (§7) — the Car Owner's end-to-end journey: request
docs/00-project/PLAN_EXTENSION_v1.md:92:  service → quotation → approve/reject/modify → progress → QC → payment → history.
docs/00-project/PLAN_EXTENSION_v1.md:120:| Personal vehicle workspace, My Repair Dashboard, service request, approve/reject/modify | **4** | 0.3 |
docs/00-project/PLAN_EXTENSION_v1.md:374:| 4 Customer + Vehicle | 0.3 | **+** personal vehicle workspace, My Repair Dashboard, service request, approve/reject/modify, search technician/workshop, repair work history |
README.md:12:work → verify the parts → track the repair** — every step authenticated, authorised, audited and recoverable.

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "CAN_RECORD_DECISION|record a customer decision|recordDecision|activeRole|customer" apps/api/src/repair/proposal.service.ts' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"@Post\\(':id/decision'\\)|record their decision|captured|decision\" apps/api/src/repair/repair.controller.ts" in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "Contact the workshop|self-service decision|approve or decline|repairs that cannot go" apps/customer-web/app/_screens/repair-journey-screen.tsx' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 704ms:
15:  CAN_RECORD_DECISION,
29: * What §410-§422 says the customer must be shown, gathered from the records that
78:   * The field most likely to be dropped and the one §416 names explicitly: a customer
104:   * A commercial document a customer may quote back at the workshop needs an
118:  customerName: string;
139:  /** §7 — the total the customer actually agreed to, once they have. */
154: * The customer proposal — `1.txt` §396-§424, `07.txt` §7.
167: *   · An ISSUED proposal freezes too. A document that changes while the customer is
172: * §410-§422 lists twelve things the customer must see, and ten already exist in
240:            : `version ${open.version_no} is with the customer and has not been answered; ` +
257:      // ⚠️ AN APPROVED PROPOSAL IS NOT SUPERSEDED SILENTLY. Once a customer has
264:          `version ${previous.version_no} has been APPROVED by the customer. A material ` +
373:   * Put the proposal in front of the customer.
408:        // The money the customer is being shown, so the trail records the offer as
426:   * §7 — record the customer's answer.
433:   * agreed to this" when a customer later says they did not.
439:  async recordDecision(
465:          : 'say what the customer asked to change, or what they want explained; note is required',
493:          'this proposal has not been issued to the customer yet, so there is no decision to record',
516:            ? 'proposal.approved_by_customer'
518:              ? 'proposal.declined_by_customer'
522:        // The channel and the option, never the customer's free text. This is the
552:              c.display_name AS customer_name,
553:              c.email AS customer_email, c.phone AS customer_phone,
554:              c.location AS customer_location,
598:         JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
617:        ctx.activeRole === 'technician' ? ctx.userId : null,
691:      // lines a customer can read.
705:        customerName: row.customer_name,
755:            // The trading name is what a customer recognises; the legal name is who the
771:            name: row.customer_name,
772:            email: row.customer_email,
773:            phone: row.customer_phone,
774:            location: row.customer_location,
783:        // What the customer actually agreed to — the figure an invoice is later checked
791:        editable: status === 'draft' && CAN_PREPARE_PROPOSAL.has(ctx.activeRole),
792:        issuable: status === 'draft' && CAN_PREPARE_PROPOSAL.has(ctx.activeRole),
793:        decidable: status === 'issued' && CAN_RECORD_DECISION.has(ctx.activeRole),
807:         JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
814:        ctx.activeRole === 'technician' ? ctx.userId : null,
815:        ctx.activeRole === 'customer' ? ctx.userId : null,
849:          ? `version ${row.version_no} is with the customer and its content is frozen; ` +
889:    if (!CAN_READ_PROPOSAL.has(ctx.activeRole)) {
890:      throw new ForbiddenException(`role '${ctx.activeRole}' may not read proposals`);
895:    if (!CAN_PREPARE_PROPOSAL.has(ctx.activeRole)) {
896:      throw new ForbiddenException(`role '${ctx.activeRole}' may not prepare a customer proposal`);
901:    if (!CAN_RECORD_DECISION.has(ctx.activeRole)) {
903:        `role '${ctx.activeRole}' may not record a customer decision`,
953:  customer_name: string;
984:  customer_email: string | null;
985:  customer_phone: string | null;
986:  customer_location: string | null;

 succeeded in 781ms:
95:   * in declaration order, so with these swapped `/job-cards/board` is captured
798: * A SEPARATE controller, the judgement every sibling here made: recording a decision
855:   * `decidedByName` is the CUSTOMER and is required; the staff member who captured it
858:  @Post(':id/decision')
1051:   * themselves is not an approval, and §35 exists precisely so that decision has a name
1162: * phone. So `decidedByName` and `decisionChannel` are what carry the consent,
1199:  @Patch(':id/decision')

 succeeded in 677ms:
87:      'The repairs that cannot go any further until you do something — approve a quote, pay a deposit, answer a question or collect the vehicle.',
284:            workshop's. A self-service decision needs its own authenticated
289:          Contact the workshop to {actionFor(card.stage)}.
300:      return 'approve or decline the repair proposal';

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content apps/api/src/repair/proposal-rules.ts -TotalCount 140' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "CAN_RECORD_DECISION|CAN_READ_PROPOSAL" apps/api/src/repair/proposal-rules.ts' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 527ms:
126:export const CAN_RECORD_DECISION = CAN_PREPARE_PROPOSAL;
135:export const CAN_READ_PROPOSAL = new Set([

 succeeded in 567ms:
/**
 * Repair proposal rules â€” Phase 5, slice 6 (the Solution Studio).
 *
 * `1.txt` Â§396-Â§424 is DOMAIN 6 and `07.txt` Â§7 is the CUSTOMER APPROVAL FLOW.
 *
 * âš ï¸ MIGRATION 017 IS THE AUTHORITY ON EVERY LIST BELOW â€” each restates a SQL CHECK,
 * and `proposal.spec.ts` compares them against the migration text.
 */

/**
 * The proposal lifecycle â€” Â§7's outcomes plus Â§424's versioning.
 *
 * `superseded` is the one that is not a customer action: Â§424 says a material change
 * creates a NEW VERSION, and the row it replaced has to say so rather than vanish.
 */
export const PROPOSAL_STATUSES = [
  'draft',
  'issued',
  'approved',
  'declined',
  'changes_requested',
  'superseded',
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/**
 * Â§7 â€” what the customer may answer.
 *
 * Â§7 lists eight actions. Three are DECISIONS and five are requests that resolve to
 * one of them, which is why modelling all eight as statuses would put five values in
 * the record that nothing downstream could interpret:
 *
 *   Â· "Approve Full Quotation"      â†’ `approved`, option `comprehensive`
 *   Â· "Approve Selected Items"      â†’ `approved`, option `recommended`
 *     (slice 5 already models the split: optional lines are excluded from the
 *      headline total, so "selected items" IS the non-optional set)
 *   Â· "Reject Quotation"            â†’ `declined`
 *   Â· "Request Modification"        â†’ `changes_requested`, the note says what
 *   Â· "Request Explanation"         â†’ `changes_requested`, ditto
 *   Â· "Request Alternative Parts"   â†’ `changes_requested`, ditto
 *   Â· "Request Voice Consultation"  â†’ `changes_requested` + a channel
 *   Â· "Request Video Consultation"  â†’ `changes_requested` + a channel
 *
 * The note is MANDATORY for the two negative outcomes precisely because it carries
 * which of those five the customer meant.
 */
export const PROPOSAL_DECISIONS = ['approved', 'declined', 'changes_requested'] as const;
export type ProposalDecision = (typeof PROPOSAL_DECISIONS)[number];

/**
 * Â§398-Â§402's repair options, as the customer's choice between them.
 *
 * `minimum` is deliberately ABSENT. Slice 5 models a quotation as chargeable lines
 * plus optional extras, which gives exactly two prices â€” the recommended repair and
 * the comprehensive one. A third tier would need a third price with nothing behind
 * it, and offering a customer a "minimum" figure the schema cannot compute is how a
 * quotation and an invoice come to disagree. When a minimum tier is genuinely priced,
 * it becomes a third value here and a third total there, together.
 */
export const PROPOSAL_OPTIONS = ['recommended', 'comprehensive'] as const;
export type ProposalOption = (typeof PROPOSAL_OPTIONS)[number];

/**
 * Â§7's channels. Recording HOW a decision arrived is what makes a disputed approval
 * investigable â€” "the customer approved it" with no channel is an assertion, not a
 * record.
 */
export const DECISION_CHANNELS = [
  'in_person',
  'telephone',
  'email',
  'sms',
  'customer_portal',
] as const;
export type DecisionChannel = (typeof DECISION_CHANNELS)[number];

export const DECISION_CHANNEL_LABEL: Record<string, string> = {
  in_person: 'In person',
  telephone: 'Telephone',
  email: 'Email',
  sms: 'SMS',
  customer_portal: 'Customer portal',
};

export function decisionChannelLabel(value: string): string {
  return DECISION_CHANNEL_LABEL[value] ?? value;
}

/**
 * Roles that may PREPARE and ISSUE a proposal to a customer.
 *
 * The same set that may prepare a quotation: this is the customer-facing half of the
 * workshop. `reception_staff` is central rather than incidental â€” Â§50 gives them the
 * customer, complaint, appointment and intake functions, and they are who a customer
 * actually speaks to.
 *
 * âš ï¸ `technician` and `workshop_supervisor` ARE ABSENT. A proposal is a commercial
 * offer; the supervisor's authority under Â§50 is technical review and repair-plan
 * approval, and it stops at the customer's door.
 */
export const CAN_PREPARE_PROPOSAL = new Set([
  'platform_administrator',
  'workshop_owner',
  'workshop_manager',
  'reception_staff',
]);

/**
 * Roles that may RECORD the customer's decision.
 *
 * Identical to the set that may issue, and deliberately so â€” this is not a second
 * approval gate. The decision is the CUSTOMER'S; the staff member is a scribe, and
 * `decided_by_name` names the customer while `recorded_by` names the scribe. Making
 * this narrower would mean a customer standing at the desk could not be given an
 * answer by the person they are speaking to.
 *
 * âš ï¸ THERE IS NO reviewer-is-not-the-submitter RULE HERE, and its absence is a
 * decision rather than an omission. Everywhere else in Phase 5 the two parties are
 * both workshop staff, so independence has to be enforced. Here the deciding party is
 * the customer, who is outside the system entirely â€” an independence check between
 * the issuer and the recorder would be theatre, and would block the single commonest
 * real case: reception issues a proposal and the customer answers them on the spot.
 * What protects this record instead is that the channel and the customer's name are
 * MANDATORY, and that the whole row freezes the moment it is decided (Â§424).
 */
export const CAN_RECORD_DECISION = CAN_PREPARE_PROPOSAL;

/**
 * Roles that may READ a proposal.
 *
 * The technician is here because Â§32-Â§33 has them CONFIRM THE CUSTOMER APPROVAL
 * before starting work â€” "repair work shall not start until the required approval is
 * received" (Â§7). A technician who cannot see the approval cannot check it.
 */
export const CAN_READ_PROPOSAL = new Set([
  'platform_administrator',
  'workshop_owner',
  'workshop_manager',
  'workshop_supervisor',
  'reception_staff',

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content apps/api/src/repair/proposal-rules.ts -Tail 40' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 425ms:
 * both workshop staff, so independence has to be enforced. Here the deciding party is
 * the customer, who is outside the system entirely â€” an independence check between
 * the issuer and the recorder would be theatre, and would block the single commonest
 * real case: reception issues a proposal and the customer answers them on the spot.
 * What protects this record instead is that the channel and the customer's name are
 * MANDATORY, and that the whole row freezes the moment it is decided (Â§424).
 */
export const CAN_RECORD_DECISION = CAN_PREPARE_PROPOSAL;

/**
 * Roles that may READ a proposal.
 *
 * The technician is here because Â§32-Â§33 has them CONFIRM THE CUSTOMER APPROVAL
 * before starting work â€” "repair work shall not start until the required approval is
 * received" (Â§7). A technician who cannot see the approval cannot check it.
 */
export const CAN_READ_PROPOSAL = new Set([
  'platform_administrator',
  'workshop_owner',
  'workshop_manager',
  'workshop_supervisor',
  'reception_staff',
  'cashier',
  'storekeeper',
  'technician',
  'quality_control_inspector',
]);

/**
 * The stages at which a proposal is the work in hand.
 *
 * A proposal is DRAFTED once the price exists (`quotation_preparation`) and ISSUED
 * when it goes to the customer, which is what `awaiting_customer_approval` means. Both
 * are permitted because a workshop legitimately writes the covering narrative before
 * moving the card.
 */
export const PROPOSAL_STAGES = ['quotation_preparation', 'awaiting_customer_approval'];

/** The state the source quotation must be in â€” Â§5's internal approval must precede Â§7's. */
export const REQUIRED_QUOTATION_STATUS = 'approved';

codex
One more partial implementation is clear: service history says it records “everything this workshop has done,” but it only renders the original complaint/job card metadata. I’m going to keep the checklist focused on issues with user-visible impact or requirement mismatch, not style.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "Service History|repair work history|history" README.md docs/00-project/PLAN_EXTENSION_v1.md docs/00-project/COMBINED_PLAN_v2.md' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "interface RepairExecution|tasks:|parts|completedTaskCount|work_summary|completion" apps/api/src/repair/execution.service.ts apps/api/src/repair/proposal.service.ts apps/api/src/repair/quotation.service.ts' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "Everything this workshop has done|completed work|complaint|mileageAtIntake|Fact|jobNumber" apps/customer-web/app/_screens/service-history-screen.tsx' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 596ms:
33:  jobNumber: string;
37:  complaint: string;
41:  mileageAtIntake: number | null;
57:        description="Everything this workshop has done to each of your vehicles, most recent first. Useful when a fault comes back — or when you sell the car."
77:        title="No completed work yet"
166:                      {c.jobNumber}
170:                    {c.complaint}
177:                  {c.mileageAtIntake !== null ? (
185:                      {c.mileageAtIntake.toLocaleString('en-GB')} km when the vehicle came in

 succeeded in 655ms:
apps/api/src/repair/proposal.service.ts:85:  /** §418's proposed parts. */
apps/api/src/repair/proposal.service.ts:95:  completionConditions: string | null;
apps/api/src/repair/proposal.service.ts:563:              q.currency, q.warranty_terms, q.completion_conditions, q.valid_until,
apps/api/src/repair/proposal.service.ts:628:    const [faults, tasks, parts] = await Promise.all([
apps/api/src/repair/proposal.service.ts:669:    const partsByQuotation = new Map<string, PartRow[]>();
apps/api/src/repair/proposal.service.ts:670:    for (const r of parts.rows as PartRow[]) {
apps/api/src/repair/proposal.service.ts:671:      const l = partsByQuotation.get(r.quotation_id) ?? [];
apps/api/src/repair/proposal.service.ts:673:      partsByQuotation.set(r.quotation_id, l);
apps/api/src/repair/proposal.service.ts:679:      const quotationParts = partsByQuotation.get(row.quotation_id) ?? [];
apps/api/src/repair/proposal.service.ts:752:          completionConditions: row.completion_conditions,
apps/api/src/repair/proposal.service.ts:958:  completion_conditions: string | null;
apps/api/src/repair/quotation.service.ts:65:  completionConditions: string | null;
apps/api/src/repair/quotation.service.ts:118:  completionConditions?: string | null;
apps/api/src/repair/quotation.service.ts:306:   * Parts get a unit price of ZERO, not a guess. There is no parts catalogue in this
apps/api/src/repair/quotation.service.ts:415:    this.nullableText(set, 'completion_conditions', input.completionConditions, 'completionConditions', 8000);
apps/api/src/repair/quotation.service.ts:583:   *    pricing them would send a customer a quotation offering free parts — and
apps/api/src/repair/quotation.service.ts:736:              q.valid_until, q.warranty_terms, q.completion_conditions,
apps/api/src/repair/quotation.service.ts:838:        completionConditions: row.completion_conditions,
apps/api/src/repair/quotation.service.ts:1051:  completion_conditions: string | null;
apps/api/src/repair/execution.service.ts:88:export interface RepairExecution {
apps/api/src/repair/execution.service.ts:98:  partsAvailableConfirmed: boolean;
apps/api/src/repair/execution.service.ts:108:  completionNote: string | null;
apps/api/src/repair/execution.service.ts:110:  tasks: ExecutionTask[];
apps/api/src/repair/execution.service.ts:112:  partsUsed: PartUsed[];
apps/api/src/repair/execution.service.ts:126:  completedTaskCount: number;
apps/api/src/repair/execution.service.ts:350:  /** §6 — record task completion, or that a task is blocked. */
apps/api/src/repair/execution.service.ts:425:   * parts" while the productive clock runs must not book the same minutes twice, and a
apps/api/src/repair/execution.service.ts:559:           FROM repair.execution_parts_used WHERE execution_id = $1 AND tenant_id = $2`,
apps/api/src/repair/execution.service.ts:563:        `INSERT INTO repair.execution_parts_used
apps/api/src/repair/execution.service.ts:664:    input: { completionNote?: string; unexpectedFindings?: string },
apps/api/src/repair/execution.service.ts:668:    const completionNote = optionalText(input.completionNote, 'completionNote', 8000);
apps/api/src/repair/execution.service.ts:696:                completion_note = $2, unexpected_findings = $3,
apps/api/src/repair/execution.service.ts:699:        [ctx.userId, completionNote, unexpectedFindings, id, ctx.tenantId],
apps/api/src/repair/execution.service.ts:709:          tasksCompleted: current.completedTaskCount,
apps/api/src/repair/execution.service.ts:712:          partsUsed: current.partsUsed.length,
apps/api/src/repair/execution.service.ts:736:              e.customer_approval_confirmed, e.parts_available_confirmed,
apps/api/src/repair/execution.service.ts:739:              e.started_at, e.completed_at, e.completion_note, e.unexpected_findings,
apps/api/src/repair/execution.service.ts:766:    const [tasks, times, parts, evidence] = await Promise.all([
apps/api/src/repair/execution.service.ts:806:           FROM repair.execution_parts_used p
apps/api/src/repair/execution.service.ts:836:    const partsBy = group(parts.rows as PartRow[]);
apps/api/src/repair/execution.service.ts:888:        partsAvailableConfirmed: row.parts_available_confirmed,
apps/api/src/repair/execution.service.ts:898:        completionNote: row.completion_note,
apps/api/src/repair/execution.service.ts:900:        tasks: taskList,
apps/api/src/repair/execution.service.ts:902:        partsUsed: (partsBy.get(row.id) ?? []).map((p) => ({
apps/api/src/repair/execution.service.ts:931:        completedTaskCount: taskList.filter((t) => t.status === 'completed').length,
apps/api/src/repair/execution.service.ts:1088:  parts_available_confirmed: boolean;
apps/api/src/repair/execution.service.ts:1096:  completion_note: string | null;

 succeeded in 665ms:
docs/00-project/COMBINED_PLAN_v2.md:218:  in CI. IF-NOT-EXISTS is how live schema silently drifts from migration history.
docs/00-project/COMBINED_PLAN_v2.md:299:| 4 Customer + Vehicle | **0.3** | Registration, profile, vehicle garage, documents, service history, maintenance schedule, complaint submission (text/audio/image/video), appointment request, workshop search, dashboard |
docs/00-project/PLAN_EXTENSION_v1.md:92:  service → quotation → approve/reject/modify → progress → QC → payment → history.
docs/00-project/PLAN_EXTENSION_v1.md:195:**Placed last, not cut.** They depend on identity, workshops, repair history and the knowledge library all
docs/00-project/PLAN_EXTENSION_v1.md:374:| 4 Customer + Vehicle | 0.3 | **+** personal vehicle workspace, My Repair Dashboard, service request, approve/reject/modify, search technician/workshop, repair work history |

codex
Reviewed `HEAD~1..HEAD`. `docs/IMPLEMENTATION_LOG.md` is absent, so I checked against `README.md`, the phase docs, and existing API/navigation contracts. I could not run `pnpm` verification because the sandbox policy rejected those commands.

- [ ] **High** — `apps/customer-web/app/_screens/repair-journey-screen.tsx:130`, `:289`  
  **What’s wrong:** `repair-proposals` only fetches `/job-cards` and tells the customer to contact the workshop. It does not show the proposal/quotation details or allow approve/decline/request changes, despite the requirement for “quotation → approve/reject/modify” and README’s “approve the work” promise.  
  **Recommended fix:** Add a customer-scoped proposal read endpoint and customer-authenticated decision endpoint, then render proposal details and real decision controls.  
  **Why it matters:** Customer approval remains off-system/staff-captured, not authenticated, authorised, audited, or recoverable as promised.

- [ ] **High** — `packages/next-shell/src/AuthErrorScreen.tsx:84` in `HEAD`  
  **What’s wrong:** `const message = (error && MESSAGES[error]) ?? FALLBACK;` crashes for `/auth/error?error=` because `message` becomes `''`, then `message.title` is read.  
  **Recommended fix:** Use `(error ? MESSAGES[error] : undefined) ?? FALLBACK` and add a unit test for blank `error`.  
  **Why it matters:** The one page meant to recover failed sign-in can white-screen. Note: the dirty working tree appears to already patch this.

- [ ] **Medium** — `apps/customer-web/app/_screens/service-history-screen.tsx:57`, `:67`, `:170`  
  **What’s wrong:** The page claims “Everything this workshop has done,” but it only renders completed job cards with original complaint, job number, date, and intake mileage. It omits actual work performed, parts used, completion notes, warranty terms, invoice/approval context.  
  **Recommended fix:** Add or consume a customer service-history summary endpoint backed by execution/proposal/quotation/parts records.  
  **Why it matters:** A customer using this for resale or recurring-fault history gets an incomplete, potentially misleading record.

- [ ] **Medium** — `.github/workflows/keep-warm.yml:43`, `:78`, `:80`  
  **What’s wrong:** Comments/name say one run warms “until the window closes,” but `timeout-minutes: 335` is shorter than the 08:00-18:00 UTC window. A morning run can hit timeout before close, likely marking the workflow failed and creating a handoff gap.  
  **Recommended fix:** Split into explicit shorter green runs or have the loop exit before timeout and document the handoff model.  
  **Why it matters:** The warmer’s stated “staying green” and coverage assumptions are not true for normal morning starts.

- [ ] **Low** — `packages/next-shell/src/AuthErrorScreen.tsx:191-197` in `HEAD`  
  **What’s wrong:** After the first automatic retry, the second render still counts down with “retrying automatically,” but `sessionStorage` prevents the retry.  
  **Recommended fix:** Check `sessionStorage` before starting the countdown and show manual retry copy when already retried.  
  **Why it matters:** The error page says it will do something it will not do, which undermines the “honest cold start” goal.
tokens used
176,925
