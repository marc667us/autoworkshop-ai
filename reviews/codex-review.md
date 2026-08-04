# Review: codex-review

_Generated: 2026-08-04T06:59:05-07:00 · backend: codex · model: llama3.2_

## Prompt

> You are Codex acting as Independent Pair Programmer for this repository. Review the latest implementation against the stated requirement in README.md and (if present) docs/IMPLEMENTATION_LOG.md. Identify anything Claude Code missed, misunderstood, or only partially implemented. Return a checklist of defects with: severity (critical/high/medium/low), file:line, what's wrong, recommended fix, why it matters.

## Repository context

### Changed files (HEAD~1..HEAD)
```
 apps/api/src/repair/proposal.service.ts        |   7 +
 apps/e2e/verify/verify-customer-workflow.mjs   | 239 +++++++++++++++++++++++++
 apps/e2e/verify/verify-technician-workflow.mjs |  18 +-
 apps/workshop-web/app/home/dashboard/page.tsx  |  16 +-
 scripts/seed-customer-proposal-fixture.sh      | 172 ++++++++++++++++++
 5 files changed, 447 insertions(+), 5 deletions(-)
```

### Diff snippet (first 600 lines)
```diff
diff --git a/apps/api/src/repair/proposal.service.ts b/apps/api/src/repair/proposal.service.ts
index b301deb..10c35fe 100644
--- a/apps/api/src/repair/proposal.service.ts
+++ b/apps/api/src/repair/proposal.service.ts
@@ -960,6 +960,13 @@ export class ProposalService {
          */
         decidable:
           status === 'issued' &&
+          // A SUPERSEDED version is never answerable, even if its status still
+          // reads `issued`. The real flow cannot produce that pair — prepare()
+          // refuses a new version while one is with the customer — but the flag
+          // costs nothing and offering somebody a decision on a document the
+          // workshop has since replaced is the worst kind of control to get
+          // wrong. Found while a fixture manufactured exactly that state.
+          row.superseded_by === null &&
           (CAN_RECORD_DECISION.has(ctx.activeRole) || CAN_DECIDE_AS_CUSTOMER.has(ctx.activeRole)),
       };
     });
diff --git a/apps/e2e/verify/verify-customer-workflow.mjs b/apps/e2e/verify/verify-customer-workflow.mjs
new file mode 100644
index 0000000..26e72b0
--- /dev/null
+++ b/apps/e2e/verify/verify-customer-workflow.mjs
@@ -0,0 +1,239 @@
+/**
+ * THE CUSTOMER'S WHOLE WORKFLOW, THROUGH THE BROWSER, AS THE CUSTOMER.
+ *
+ * The vehicle owner's path, end to end:
+ *
+ *   garage -> add a vehicle -> report a problem -> see the request ->
+ *   track it -> answer what needs answering -> collect -> read the history
+ *
+ * ── WHY EVERY CHECK ASSERTS CONTENT ────────────────────────────────────────
+ *
+ * The §33 customer tree advertises 35 entries and the catch-all renders an
+ * honest "not built yet" page for the ones with no screen — HTTP 200, full
+ * shell, plausible-looking. A check that only asserts the page loaded therefore
+ * passes on every unbuilt screen in the workspace. This repo has already paid
+ * for that exact shape at larger scale: 24 of 24 live checks passed against a
+ * catalogue containing nothing, because every one of them confirmed the SECTION
+ * rendered and none asked whether anything was in it.
+ *
+ * So each route below carries a phrase the placeholder could never contain, and
+ * a SENTINEL check proves the placeholder is still detectable before any route
+ * is judged — otherwise a copy change would silently turn this into a script
+ * that reports the whole workspace as built.
+ *
+ * ⚠️ `requireNavRoute` DOES NOT REFUSE A SIGNED-OUT VISITOR on this tree (see
+ * the comment on `/my-vehicles/garage`), so a run that quietly lost its session
+ * would still get HTTP 200 from every route and report a working product while
+ * measuring the signed-out state. The validity checks below abort on that.
+ *
+ *   node verify/verify-customer-workflow.mjs
+ *
+ * DEV ONLY — localhost/LAN, real Keycloak sign-in.
+ */
+import { chromium } from '@playwright/test';
+
+const CUSTOMER = process.env['CUSTOMER_WEB_URL'] ?? 'http://localhost:3000';
+const USER = process.env['DEV_CUSTOMER_EMAIL'] ?? 'customer@autoworkshop.local';
+const PASSWORD = process.env['DEV_USER_PASSWORD'] ?? 'Change_me_locally1!';
+
+let failures = 0;
+let checks = 0;
+function check(label, ok, detail) {
+  checks += 1;
+  if (ok) console.log(`  PASS  ${label}`);
+  else {
+    failures += 1;
+    console.log(`  FAIL  ${label}`);
+    if (detail !== undefined) console.log(`        ${String(detail).slice(0, 300)}`);
+  }
+}
+
+/** The journey, in the order a vehicle owner actually travels it. */
+const WORKFLOW = [
+  ['/home/dashboard', /dashboard|welcome|vehicle/i, 'lands somewhere real'],
+  ['/my-vehicles/garage', /garage|vehicle/i, 'sees their garage'],
+  ['/my-vehicles/add-vehicle', /vehicle|registration/i, 'adds a vehicle'],
+  ['/service-and-repairs/report-a-problem', /problem|report/i, 'reports a problem'],
+  ['/service-and-repairs/service-requests', /request/i, 'sees every request they made'],
+  ['/service-and-repairs/repair-tracking', /track|repair/i, 'tracks a live repair'],
+  ['/service-and-repairs/repair-proposals', /proposal|approval|waiting/i, 'answers what needs them'],
+  ['/service-and-repairs/completed-repairs', /complet/i, 'sees finished work'],
+  ['/my-vehicles/service-history', /history|record/i, 'reads the service history'],
+  ['/parts-and-warranty/parts-orders', /order|part/i, 'sees their parts orders'],
+  ['/vehicle-lookup', /vin|lookup|vehicle/i, 'looks a VIN up'],
+];
+
+/**
+ * What the catch-all renders for an unbuilt route. Matching this is a FAILURE:
+ * the page loaded, the shell rendered, and the screen does not exist.
+ *
+ * 🔴 THE SENTENCE, NOT THE PHRASE. This regex also carried `not built yet` on
+ * its first run and produced a FALSE FAILURE on the technician dashboard —
+ * a screen that is entirely real, and whose own explanatory copy says "Page
+ * content is not built yet" about OTHER routes. The check reported the first
+ * screen a technician ever sees as unbuilt.
+ *
+ * That is this repo's most-repeated defect wearing the reviewer's hat: a
+ * measurement that walks through its own gap. A detector keyed on a phrase that
+ * appears in ordinary prose will keep finding it in prose.
+ *
+ * `scheduled for a later phase` is the exact sentence `ModulePage.tsx` renders
+ * and nothing else in the product says it. If that copy changes, the SENTINEL
+ * check below fails loudly rather than letting every route pass.
+ */
+const PLACEHOLDER = /scheduled for a later phase/i;
+
+const browser = await chromium.launch();
+const consoleErrors = [];
+
+const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
+const page = await ctx.newPage();
+page.on('console', (m) => {
+  if (m.type() !== 'error') return;
+  if (/Failed to load resource.*40[134]/i.test(m.text())) return;
+  consoleErrors.push(m.text());
+});
+page.on('pageerror', (e) => consoleErrors.push(String(e)));
+
+console.log(`\nCUSTOMER WORKFLOW — ${CUSTOMER}, as ${USER}\n`);
+
+await page.goto(`${CUSTOMER}/home/dashboard`);
+await page.getByRole('link', { name: 'Sign in' }).first().click();
+const provider = page.getByRole('button', { name: /Keycloak/i });
+await provider.waitFor({ state: 'visible', timeout: 30000 });
+await provider.click({ noWaitAfter: true });
+await page.waitForURL(/openid-connect\/auth/, { timeout: 90000 });
+await page.fill('#username', USER);
+await page.fill('#password', PASSWORD);
+await page.click('#kc-login', { noWaitAfter: true });
+await page.waitForURL((u) => !/openid-connect/.test(u.toString()), { timeout: 90000 });
+await page.goto(`${CUSTOMER}/home/dashboard`, { waitUntil: 'load' });
+
+// ── 🔴 IS THIS MEASUREMENT VALID? ──────────────────────────────────────────
+// A signed-out run reaches all eleven routes and reports them working, because
+// this tree does not refuse anonymous visitors. Nothing below means anything
+// unless there is a real session.
+const shell = await page.content();
+const signedIn = !/Not signed in/i.test(shell) && /Sign out/i.test(shell);
+check('MEASUREMENT VALID: signed in', signedIn, 'every route answers 200 signed out too');
+if (!signedIn) {
+  console.log('\nABORTING — a signed-out run would report a working product.\n');
+  await browser.close();
+  process.exit(1);
+}
+
+// ── 🔴 SENTINEL: can an unbuilt screen still be recognised? ────────────────
+await page.goto(`${CUSTOMER}/payments/invoices`, { waitUntil: 'load' });
+const sentinel = await page.content();
+check(
+  'SENTINEL: the placeholder is still detectable',
+  PLACEHOLDER.test(sentinel),
+  'PLACEHOLDER no longer matches — every route below would pass regardless',
+);
+if (!PLACEHOLDER.test(sentinel)) {
+  console.log('\nABORTING — the detector is broken.\n');
+  await browser.close();
+  process.exit(1);
+}
+
+console.log('\n  the journey, in order:\n');
+
+let built = 0;
+for (const [route, needs, what] of WORKFLOW) {
+  const response = await page.goto(`${CUSTOMER}${route}`, { waitUntil: 'load' }).catch(() => null);
+  const status = response?.status() ?? 0;
+  const html = await page.content().catch(() => '');
+  // Strip the shell: the side navigation carries every route's LABEL, so the
+  // word "proposal" appears on a page rendering nothing of the sort. Without
+  // this the content assertion passes on the placeholder itself.
+  const main = (/<main[\s\S]*?<\/main>/i.exec(html) ?? [html])[0];
+
+  const ok200 = status === 200;
+  const notPlaceholder = !PLACEHOLDER.test(main);
+  const hasContent = needs.test(main);
+  if (ok200 && notPlaceholder && hasContent) built += 1;
+
+  check(
+    `${what.padEnd(30)} ${route}`,
+    ok200 && notPlaceholder && hasContent,
+    !ok200
+      ? `HTTP ${status}`
+      : !notPlaceholder
+        ? 'renders the "not built yet" placeholder'
+        : `rendered but does not mention ${needs}`,
+  );
+}
+
+// ── the one screen whose STATE matters, not just its existence ─────────────
+// `repair-proposals` is the decision point. Either it offers an answer, or it
+// says nothing is waiting — and BOTH are correct. What would be wrong is the
+// old "contact the workshop" text appearing beside a proposal that is in fact
+// answerable in-app, which is what `decidable` returning false for every
+// customer produced.
+await page.goto(`${CUSTOMER}/service-and-repairs/repair-proposals`, { waitUntil: 'load' });
+const proposals = await page.content();
+const offersAnswer = /Approve this repair|Send my answer/i.test(proposals);
+const nothingWaiting = /Nothing is waiting on you/i.test(proposals);
+check(
+  'the approval screen is in a coherent state',
+  offersAnswer || nothingWaiting,
+  'neither an answerable proposal nor an honest empty state — check `decidable`',
+);
+if (offersAnswer) {
+  check(
+    'an answerable proposal offers a SUBMIT control, not just prose',
+    /<button[^>]*type="submit"/i.test(proposals),
+    'a form with no submit button shipped here once before',
+  );
+}
+
+// ── 🔴 AND FINALLY: DOES APPROVING ACTUALLY DO ANYTHING? ──────────────────
+// Everything above proves screens RENDER. This is the only check that proves
+// the feature WORKS — it fills the form in, submits it, and reads the result
+// back. Without it the suite would be satisfied by a form that posts into the
+// void, which is a shape this repo has shipped: a form with no submit button
+// passed typecheck, lint and next build, and was found only in a browser.
+//
+// ⚠️ THIS CONSUMES THE FIXTURE. An answered proposal is no longer `issued` and
+// correctly leaves the screen, so re-run scripts/seed-customer-proposal-fixture.sh
+// before the next verification. Two runs in this repo have already reported a
+// clean pass while testing the residue of their own previous run.
+if (offersAnswer) {
+  await page.selectOption('#decision', 'approved').catch(() => {});
+  await page.selectOption('#approvedOption', 'recommended').catch(() => {});
+  await page.getByRole('button', { name: /Approve this repair/i }).click({ noWaitAfter: true });
+  // The server action revalidates four paths; wait for the outcome to render
+  // rather than for a fixed delay.
+  await page
+    .waitForFunction(() => /Approved\.|error|not accepted|did not respond/i.test(document.body.innerText), {
+      timeout: 30000,
+    })
+    .catch(() => {});
+  const after = await page.content();
+  check(
+    'approving actually records the decision',
+    /Approved\. The workshop has been told/i.test(after),
+    (/<p[^>]*>([^<]*(error|not accepted|did not respond|session has ended)[^<]*)<\/p>/i.exec(after) ?? [
+      , 'no confirmation and no error — the submit went nowhere',
+    ])[1],
+  );
+
+  // Read it back from the OTHER screen, not from the one that wrote it. A page
+  // echoing its own success message proves the browser ran, not that anything
+  // was stored.
+  await page.goto(`${CUSTOMER}/service-and-repairs/repair-proposals`, { waitUntil: 'load' });
+  const reread = await page.content();
+  check(
+    'and the proposal is gone from the waiting list afterwards',
+    /Nothing is waiting on you/i.test(reread) || !/Approve this repair/i.test(reread),
+    'the answered proposal is still being offered for an answer',
+  );
+}
+
+check('no console errors across the whole journey', consoleErrors.length === 0, consoleErrors.join(' | '));
+
+await browser.close();
+
+console.log(`\n${built}/${WORKFLOW.length} customer journey screens are real and reachable AS A CUSTOMER`);
+console.log(`${checks - failures}/${checks} checks passed\n`);
+process.exit(failures === 0 ? 0 : 1);
diff --git a/apps/e2e/verify/verify-technician-workflow.mjs b/apps/e2e/verify/verify-technician-workflow.mjs
index a166b3c..aafc415 100644
--- a/apps/e2e/verify/verify-technician-workflow.mjs
+++ b/apps/e2e/verify/verify-technician-workflow.mjs
@@ -91,11 +91,21 @@ const WORKFLOW = [
  * What the catch-all renders for an unbuilt route. Matching this is a FAILURE:
  * the page loaded, the shell rendered, and the screen does not exist.
  *
- * Taken from the real placeholder copy — if that wording ever changes this
- * script starts passing everything, so the sentinel check below asserts the
- * placeholder is still detectable before any route is judged.
+ * 🔴 THE SENTENCE, NOT THE PHRASE. This regex also carried `not built yet` on
+ * its first run and produced a FALSE FAILURE on the technician dashboard —
+ * a screen that is entirely real, and whose own explanatory copy says "Page
+ * content is not built yet" about OTHER routes. The check reported the first
+ * screen a technician ever sees as unbuilt.
+ *
+ * That is this repo's most-repeated defect wearing the reviewer's hat: a
+ * measurement that walks through its own gap. A detector keyed on a phrase that
+ * appears in ordinary prose will keep finding it in prose.
+ *
+ * `scheduled for a later phase` is the exact sentence `ModulePage.tsx` renders
+ * and nothing else in the product says it. If that copy changes, the SENTINEL
+ * check below fails loudly rather than letting every route pass.
  */
-const PLACEHOLDER = /scheduled for a later phase|not built yet/i;
+const PLACEHOLDER = /scheduled for a later phase/i;
 
 const browser = await chromium.launch();
 const consoleErrors = [];
diff --git a/apps/workshop-web/app/home/dashboard/page.tsx b/apps/workshop-web/app/home/dashboard/page.tsx
index 0606397..c8706ac 100644
--- a/apps/workshop-web/app/home/dashboard/page.tsx
+++ b/apps/workshop-web/app/home/dashboard/page.tsx
@@ -37,6 +37,17 @@ async function describeNavigation() {
 
   return {
     grants: grantsFor(viewer),
+    /**
+     * 🔴 WHETHER THERE IS A SESSION, read directly rather than INFERRED from an
+     * empty grant list. The copy below used to reason "no grants, therefore
+     * nobody is signed in" — and a signed-in TECHNICIAN holds no grants today
+     * (viewerGrants() still carries its demo body, T-0003), so the dashboard
+     * told a technician who had just signed in that nobody was signed in.
+     *
+     * Exactly the family of defect that produced "Not signed in" beside a
+     * working "Sign out" twice already: a truth about A used as evidence for B.
+     */
+    signedIn: viewer !== null && viewer !== undefined,
     groupCount: visible.length,
     itemCount: visible.reduce((n, g) => n + g.items.length, 0),
     roleLabel: role ? `${role} role` : 'workspace default',
@@ -292,7 +303,10 @@ export default async function Dashboard() {
                     dangling clause that describes nothing. An empty grant list
                     is now the common case, not an edge one: it is what every
                     visitor sees before signing in. */}
-                This viewer holds <strong>no permission grants</strong>, because nobody is signed in.
+                This viewer holds <strong>no permission grants</strong>
+                {nav.signedIn
+                  ? ' — this role has none assigned yet.'
+                  : ', because nobody is signed in.'}{' '}
                 Only ungated modules are listed; everything gated is absent from the menu
               </>
             ) : (
diff --git a/scripts/seed-customer-proposal-fixture.sh b/scripts/seed-customer-proposal-fixture.sh
new file mode 100644
index 0000000..4463c9a
--- /dev/null
+++ b/scripts/seed-customer-proposal-fixture.sh
@@ -0,0 +1,172 @@
+#!/usr/bin/env bash
+#
+# Seeds ONE proposal ISSUED to the dev customer, so the customer approval screen
+# has something to answer.
+#
+# 🔴 WHY THIS EXISTS. `verify-customer-workflow.mjs` asserts the approval screen
+# is in a coherent state — either it offers an answer, or it honestly says
+# nothing is waiting. With no issued proposal in the database it passes on the
+# SECOND branch every time, and the submit control is never exercised at all.
+#
+# That is precisely the failure this repository keeps paying for: 24 of 24 live
+# checks passed against a catalogue containing nothing, because each confirmed
+# that a section RENDERED and none asked whether anything was in it. A green
+# customer-workflow run against an empty proposal table proves the page loads
+# and proves nothing about the feature.
+#
+# So this puts a real, answerable proposal in front of the dev customer, and the
+# verify script's `offersAnswer` branch — including the "has a submit button"
+# assertion — actually runs.
+#
+# ⚠️ THE VERIFY RUN CONSUMES THIS FIXTURE if it submits an answer: an answered
+# proposal is no longer `issued` and leaves the screen by design. Re-run this
+# before each verification rather than assuming yesterday's row survived. Same
+# lesson as `seed-qc-fixture.sh`, which exists for exactly this reason.
+#
+# Idempotent in the safe direction: it supersedes whatever the latest version on
+# that card is and adds the NEXT version, so running it twice leaves one
+# answerable proposal rather than corrupting one.
+#
+#   bash scripts/seed-customer-proposal-fixture.sh
+#
+# DEV ONLY. Writes to the local Docker Postgres.
+set -euo pipefail
+
+CONTAINER="${AW_PG_CONTAINER:-aw-postgres}"
+CUSTOMER_EMAIL="${DEV_CUSTOMER_EMAIL:-customer@autoworkshop.local}"
+
+docker exec -i -e CUSTOMER_EMAIL="$CUSTOMER_EMAIL" "$CONTAINER" \
+  psql -U autoworkshop -d autoworkshop -v ON_ERROR_STOP=1 \
+  -v customer_email="'${CUSTOMER_EMAIL}'" <<'SQL'
+BEGIN;
+
+-- Superuser context so the seed is not itself subject to the policies under
+-- test. Same reason `seed-qc-fixture.sh` does it.
+SELECT set_config('app.current_role', 'admin', true);
+
+-- The email reaches the DO block through a GUC, not through string
+-- interpolation: `:customer_email` is expanded by psql as a properly quoted
+-- literal here, once, rather than being pasted into the body of a $$-quoted
+-- function where quoting rules differ and a stray apostrophe would end the block.
+SELECT set_config('aw.customer_email', :customer_email, true);
+
+DO $$
+DECLARE
+  card     UUID;
+  quote    UUID;
+  ten      UUID;
+  org      UUID;
+  latest   INTEGER;
+  staff    UUID;
+  new_id   UUID;
+BEGIN
+  -- A job card belonging to THE DEV CUSTOMER, chosen from real data rather than
+  -- invented, so the fixture cannot drift from what the app actually produces.
+  -- It must be that customer's own card or the screen will never show it: the
+  -- API narrows a customer viewer with a `c.user_id` predicate.
+  SELECT j.id, j.tenant_id, j.organization_id
+    INTO card, ten, org
+    FROM repair.job_cards j
+    JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
+    JOIN identity.users  u ON u.id = c.user_id
+   WHERE u.email = current_setting('aw.customer_email', true)
+     AND EXISTS (SELECT 1 FROM repair.quotations q WHERE q.job_card_id = j.id)
+   ORDER BY j.opened_at DESC
+   LIMIT 1;
+
+  IF card IS NULL THEN
+    -- Refuse loudly rather than seeding nothing and letting the verify run
+    -- report a clean pass on its empty branch — which is the whole failure this
+    -- file exists to prevent.
+    RAISE EXCEPTION
+      'no job card with a quotation belongs to %. Run seed-dev-core.sh first.',
+      current_setting('aw.customer_email', true);
+  END IF;
+
+  -- The quotation the proposal is made FROM. A proposal reads its money from
+  -- exactly this row, so an invented one would render a document with no prices.
+  SELECT id INTO quote
+    FROM repair.quotations
+   WHERE job_card_id = card AND tenant_id = ten
+   ORDER BY attempt_no DESC
+   LIMIT 1;
+
+  -- 🔴 IF ONE IS ALREADY WAITING, REUSE IT. DO NOT ADD ANOTHER.
+  --
+  -- The first version of this script always inserted the next version and only
+  -- set `superseded_by` on the previous one — leaving the previous row at
+  -- status `issued`. Two runs therefore produced TWO answerable proposals on
+  -- one card, which the real flow cannot produce at all: `prepare()` refuses a
+  -- new version while one is still with the customer ("version N is with the
+  -- customer and has not been answered").
+  --
+  -- So the fixture was manufacturing a state the product forbids, and then the
+  -- verify run failed on it — a harness defect wearing a product defect's
+  -- clothes, which is 7 of the 11 "defects" one day in this repo turned out to
+  -- be. Seeding must reproduce reality, not merely populate a table.
+  -- ⚠️ `superseded_by IS NULL` TOO — the same definition of "answerable" the
+  -- API uses for `decidable`. Testing only on status found a SUPERSEDED row
+  -- still marked `issued`, declared the card already covered, and seeded
+  -- nothing — so the verify run fell back to its "nothing is waiting" branch
+  -- and passed without ever exercising the form. A fixture whose idea of
+  -- "ready" differs from the product's is how a suite goes green on an empty
+  -- shop.
+  IF EXISTS (SELECT 1 FROM repair.repair_proposals
+              WHERE job_card_id = card AND tenant_id = ten
+                AND status = 'issued' AND superseded_by IS NULL) THEN
+    UPDATE repair.job_cards
+       SET stage = 'awaiting_customer_approval', stage_changed_at = now()
+     WHERE id = card AND tenant_id = ten;
+    RAISE NOTICE 'a proposal is already awaiting an answer on card % — reused, none added', card;
+    RETURN;
+  END IF;
+
+  SELECT COALESCE(max(version_no), 0) INTO latest
+    FROM repair.repair_proposals
+   WHERE job_card_id = card AND tenant_id = ten;
+
+  -- Somebody to have issued it. A proposal with no issuer cannot be acted on.
+  SELECT m.user_id INTO staff
+    FROM identity.memberships m
+   WHERE m.tenant_id = ten AND m.status = 'active'
+     AND m.role_name IN ('workshop_owner', 'workshop_manager', 'reception_staff')
+   LIMIT 1;
+
+  new_id := gen_random_uuid();
+
+  INSERT INTO repair.repair_proposals (
+    id, tenant_id, organization_id, job_card_id, quotation_id,
+    version_no, status,
+    expected_result, risk_and_limitations, uncertainties,
+    issued_by, issued_at, created_by
+  ) VALUES (
+    new_id, ten, org, card, quote,
+    latest + 1, 'issued',
+    'The rough idle is corrected and the vehicle idles within specification.',
+    'Fixture data. If further wear is found once the manifold is off, the extra work is quoted separately before it is done.',
+    'Whether the idle control valve also needs replacing cannot be confirmed until the manifold is removed.',
+    staff, now(), staff
+  );
+
+  -- §424: the previous version points at its replacement rather than being
+  -- edited or deleted. Only `superseded_by` is writable on a decided proposal,
+  -- and that is deliberate — see migration 017.
+  IF latest > 0 THEN
+    UPDATE repair.repair_proposals
+       SET superseded_by = new_id
+     WHERE job_card_id = card AND tenant_id = ten AND version_no = latest;
+  END IF;
+
+  -- The card has to be at the stage that MEANS "with the customer", or the
+  -- customer screen files it under "in progress" and never asks for an answer.
+  UPDATE repair.job_cards
+     SET stage = 'awaiting_customer_approval', stage_changed_at = now()
+   WHERE id = card AND tenant_id = ten;
+
+  RAISE NOTICE 'issued proposal v% on card % for %',
+    latest + 1, card, current_setting('aw.customer_email', true);
+END;
+$$;
+
+COMMIT;
+SQL
```

## Findings

No `docs/IMPLEMENTATION_LOG.md` is present, so this is reviewed against `README.md` plus the changed implementation.

- [ ] **critical** [apps/api/src/repair/proposal.service.ts](C:/Users/USER/Documents/autoworkshop-ai/apps/api/src/repair/proposal.service.ts:627) and [line 497](C:/Users/USER/Documents/autoworkshop-ai/apps/api/src/repair/proposal.service.ts:497)  
  **What’s wrong:** Both customer and staff decision paths accept any proposal whose `status === 'issued'`; they do not check `superseded_by`. The new UI flag hides superseded issued rows, but the write endpoint can still approve one by direct POST.  
  **Recommended fix:** Include `p.superseded_by` in both decision lookups and reject when non-null. Add unit tests for `recordDecision` and `recordCustomerDecision` with `status: 'issued', superseded_by: <id>`.  
  **Why it matters:** A customer or staff member can record approval on a replaced commercial offer. That breaks §424 version integrity and can authorize work against the wrong document.

- [ ] **high** [scripts/seed-customer-proposal-fixture.sh](C:/Users/USER/Documents/autoworkshop-ai/scripts/seed-customer-proposal-fixture.sh:156)  
  **What’s wrong:** The seed marks the previous proposal with `superseded_by = new_id` but does not also set `status = 'superseded'`. That manufactures the exact impossible state the service comment says should never exist: `status = 'issued'` plus `superseded_by IS NOT NULL`.  
  **Recommended fix:** Update the previous row with `SET superseded_by = new_id, status = 'superseded'`, matching `ProposalService.prepare()` at `proposal.service.ts:306`.  
  **Why it matters:** The fixture corrupts the domain model and can mask or trigger false failures in the customer approval flow.

- [ ] **high** [apps/e2e/verify/verify-customer-workflow.mjs](C:/Users/USER/Documents/autoworkshop-ai/apps/e2e/verify/verify-customer-workflow.mjs:175)  
  **What’s wrong:** The verifier still passes the approval screen when it sees `Nothing is waiting on you`, and the actual approval submission only runs inside `if (offersAnswer)` at line 201. The added seed is not invoked or enforced.  
  **Recommended fix:** Make the approval fixture mandatory for this verifier by default, or fail unless an answerable proposal exists. Allow the empty branch only under an explicit opt-out such as `ALLOW_EMPTY_CUSTOMER_PROPOSALS=1`.  
  **Why it matters:** The suite can still go green without testing “approve the work,” which is one of README’s end-to-end promises.

- [ ] **medium** [scripts/seed-customer-proposal-fixture.sh](C:/Users/USER/Documents/autoworkshop-ai/scripts/seed-customer-proposal-fixture.sh:73) and [line 88](C:/Users/USER/Documents/autoworkshop-ai/scripts/seed-customer-proposal-fixture.sh:88)  
  **What’s wrong:** The seed chooses a card with any quotation and then selects the latest quotation regardless of status. The database trigger requires an approved quotation, and `ProposalService.prepare()` also filters to approved quotations.  
  **Recommended fix:** Filter both the `EXISTS` check and `SELECT id INTO quote` with `status = 'approved'`; raise a clear exception if none exists.  
  **Why it matters:** The fixture can fail on valid dev data where the latest quote is draft/rejected, or diverge from the real product rule.

- [ ] **medium** [apps/workshop-web/app/home/dashboard/page.tsx](C:/Users/USER/Documents/autoworkshop-ai/apps/workshop-web/app/home/dashboard/page.tsx:50)  
  **What’s wrong:** `signedIn` is inferred from `currentViewer()`, even though the comment says it is read directly. `currentViewer()` returns `null` when `/me` or the API fails, which is not the same as having no session.  
  **Recommended fix:** Use `await viewerHasSession('workshop')` for this value. The module already imports `viewerHasSession`.  
  **Why it matters:** During an API outage or `/me` failure, the dashboard can again tell a signed-in user that nobody is signed in, which is the class of defect this change was meant to close.

+ * DEV ONLY — localhost/LAN, real Keycloak sign-in.
+ */
+import { chromium } from '@playwright/test';
+
+const CUSTOMER = process.env['CUSTOMER_WEB_URL'] ?? 'http://localhost:3000';
+const USER = process.env['DEV_CUSTOMER_EMAIL'] ?? 'customer@autoworkshop.local';
+const PASSWORD = process.env['DEV_USER_PASSWORD'] ?? 'Change_me_locally1!';
+
+let failures = 0;
+let checks = 0;
+function check(label, ok, detail) {
+  checks += 1;
+  if (ok) console.log(`  PASS  ${label}`);
+  else {
+    failures += 1;
+    console.log(`  FAIL  ${label}`);
+    if (detail !== undefined) console.log(`        ${String(detail).slice(0, 300)}`);
+  }
+}
+
+/** The journey, in the order a vehicle owner actually travels it. */
+const WORKFLOW = [
+  ['/home/dashboard', /dashboard|welcome|vehicle/i, 'lands somewhere real'],
+  ['/my-vehicles/garage', /garage|vehicle/i, 'sees their garage'],
+  ['/my-vehicles/add-vehicle', /vehicle|registration/i, 'adds a vehicle'],
+  ['/service-and-repairs/report-a-problem', /problem|report/i, 'reports a problem'],
+  ['/service-and-repairs/service-requests', /request/i, 'sees every request they made'],
+  ['/service-and-repairs/repair-tracking', /track|repair/i, 'tracks a live repair'],
+  ['/service-and-repairs/repair-proposals', /proposal|approval|waiting/i, 'answers what needs them'],
+  ['/service-and-repairs/completed-repairs', /complet/i, 'sees finished work'],
+  ['/my-vehicles/service-history', /history|record/i, 'reads the service history'],
+  ['/parts-and-warranty/parts-orders', /order|part/i, 'sees their parts orders'],
+  ['/vehicle-lookup', /vin|lookup|vehicle/i, 'looks a VIN up'],
+];
+
+/**
+ * What the catch-all renders for an unbuilt route. Matching this is a FAILURE:
+ * the page loaded, the shell rendered, and the screen does not exist.
+ *
+ * 🔴 THE SENTENCE, NOT THE PHRASE. This regex also carried `not built yet` on
+ * its first run and produced a FALSE FAILURE on the technician dashboard —
+ * a screen that is entirely real, and whose own explanatory copy says "Page
+ * content is not built yet" about OTHER routes. The check reported the first
+ * screen a technician ever sees as unbuilt.
+ *
+ * That is this repo's most-repeated defect wearing the reviewer's hat: a
+ * measurement that walks through its own gap. A detector keyed on a phrase that
+ * appears in ordinary prose will keep finding it in prose.
+ *
+ * `scheduled for a later phase` is the exact sentence `ModulePage.tsx` renders
+ * and nothing else in the product says it. If that copy changes, the SENTINEL
+ * check below fails loudly rather than letting every route pass.
+ */
+const PLACEHOLDER = /scheduled for a later phase/i;
+
+const browser = await chromium.launch();
+const consoleErrors = [];
+
+const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
+const page = await ctx.newPage();
+page.on('console', (m) => {
+  if (m.type() !== 'error') return;
+  if (/Failed to load resource.*40[134]/i.test(m.text())) return;
+  consoleErrors.push(m.text());
+});
+page.on('pageerror', (e) => consoleErrors.push(String(e)));
+
+console.log(`\nCUSTOMER WORKFLOW — ${CUSTOMER}, as ${USER}\n`);
+
+await page.goto(`${CUSTOMER}/home/dashboard`);
+await page.getByRole('link', { name: 'Sign in' }).first().click();
+const provider = page.getByRole('button', { name: /Keycloak/i });
+await provider.waitFor({ state: 'visible', timeout: 30000 });
+await provider.click({ noWaitAfter: true });
+await page.waitForURL(/openid-connect\/auth/, { timeout: 90000 });
+await page.fill('#username', USER);
+await page.fill('#password', PASSWORD);
+await page.click('#kc-login', { noWaitAfter: true });
+await page.waitForURL((u) => !/openid-connect/.test(u.toString()), { timeout: 90000 });
+await page.goto(`${CUSTOMER}/home/dashboard`, { waitUntil: 'load' });
+
+// ── 🔴 IS THIS MEASUREMENT VALID? ──────────────────────────────────────────
+// A signed-out run reaches all eleven routes and reports them working, because
+// this tree does not refuse anonymous visitors. Nothing below means anything
+// unless there is a real session.
+const shell = await page.content();
+const signedIn = !/Not signed in/i.test(shell) && /Sign out/i.test(shell);
+check('MEASUREMENT VALID: signed in', signedIn, 'every route answers 200 signed out too');
+if (!signedIn) {
+  console.log('\nABORTING — a signed-out run would report a working product.\n');
+  await browser.close();
+  process.exit(1);
+}
+
+// ── 🔴 SENTINEL: can an unbuilt screen still be recognised? ────────────────
+await page.goto(`${CUSTOMER}/payments/invoices`, { waitUntil: 'load' });
+const sentinel = await page.content();
+check(
+  'SENTINEL: the placeholder is still detectable',
+  PLACEHOLDER.test(sentinel),
+  'PLACEHOLDER no longer matches — every route below would pass regardless',
+);
+if (!PLACEHOLDER.test(sentinel)) {
+  console.log('\nABORTING — the detector is broken.\n');
+  await browser.close();
+  process.exit(1);
+}
+
+console.log('\n  the journey, in order:\n');
+
+let built = 0;
+for (const [route, needs, what] of WORKFLOW) {
+  const response = await page.goto(`${CUSTOMER}${route}`, { waitUntil: 'load' }).catch(() => null);
+  const status = response?.status() ?? 0;
+  const html = await page.content().catch(() => '');
+  // Strip the shell: the side navigation carries every route's LABEL, so the
+  // word "proposal" appears on a page rendering nothing of the sort. Without
+  // this the content assertion passes on the placeholder itself.
+  const main = (/<main[\s\S]*?<\/main>/i.exec(html) ?? [html])[0];
+
+  const ok200 = status === 200;
+  const notPlaceholder = !PLACEHOLDER.test(main);
+  const hasContent = needs.test(main);
+  if (ok200 && notPlaceholder && hasContent) built += 1;
+
+  check(
+    `${what.padEnd(30)} ${route}`,
+    ok200 && notPlaceholder && hasContent,
+    !ok200
+      ? `HTTP ${status}`
+      : !notPlaceholder
+        ? 'renders the "not built yet" placeholder'
+        : `rendered but does not mention ${needs}`,
+  );
+}
+
+// ── the one screen whose STATE matters, not just its existence ─────────────
+// `repair-proposals` is the decision point. Either it offers an answer, or it
+// says nothing is waiting — and BOTH are correct. What would be wrong is the
+// old "contact the workshop" text appearing beside a proposal that is in fact
+// answerable in-app, which is what `decidable` returning false for every
+// customer produced.
+await page.goto(`${CUSTOMER}/service-and-repairs/repair-proposals`, { waitUntil: 'load' });
+const proposals = await page.content();
+const offersAnswer = /Approve this repair|Send my answer/i.test(proposals);
+const nothingWaiting = /Nothing is waiting on you/i.test(proposals);
+check(
+  'the approval screen is in a coherent state',
+  offersAnswer || nothingWaiting,
+  'neither an answerable proposal nor an honest empty state — check `decidable`',
+);
+if (offersAnswer) {
+  check(
+    'an answerable proposal offers a SUBMIT control, not just prose',
+    /<button[^>]*type="submit"/i.test(proposals),
+    'a form with no submit button shipped here once before',
+  );
+}
+
+// ── 🔴 AND FINALLY: DOES APPROVING ACTUALLY DO ANYTHING? ──────────────────
+// Everything above proves screens RENDER. This is the only check that proves
+// the feature WORKS — it fills the form in, submits it, and reads the result
+// back. Without it the suite would be satisfied by a form that posts into the
+// void, which is a shape this repo has shipped: a form with no submit button
+// passed typecheck, lint and next build, and was found only in a browser.
+//
+// ⚠️ THIS CONSUMES THE FIXTURE. An answered proposal is no longer `issued` and
+// correctly leaves the screen, so re-run scripts/seed-customer-proposal-fixture.sh
+// before the next verification. Two runs in this repo have already reported a
+// clean pass while testing the residue of their own previous run.
+if (offersAnswer) {
+  await page.selectOption('#decision', 'approved').catch(() => {});
+  await page.selectOption('#approvedOption', 'recommended').catch(() => {});
+  await page.getByRole('button', { name: /Approve this repair/i }).click({ noWaitAfter: true });
+  // The server action revalidates four paths; wait for the outcome to render
+  // rather than for a fixed delay.
+  await page
+    .waitForFunction(() => /Approved\.|error|not accepted|did not respond/i.test(document.body.innerText), {
+      timeout: 30000,
+    })
+    .catch(() => {});
+  const after = await page.content();
+  check(
+    'approving actually records the decision',
+    /Approved\. The workshop has been told/i.test(after),
+    (/<p[^>]*>([^<]*(error|not accepted|did not respond|session has ended)[^<]*)<\/p>/i.exec(after) ?? [
+      , 'no confirmation and no error — the submit went nowhere',
+    ])[1],
+  );
+
+  // Read it back from the OTHER screen, not from the one that wrote it. A page
+  // echoing its own success message proves the browser ran, not that anything
+  // was stored.
+  await page.goto(`${CUSTOMER}/service-and-repairs/repair-proposals`, { waitUntil: 'load' });
+  const reread = await page.content();
+  check(
+    'and the proposal is gone from the waiting list afterwards',
+    /Nothing is waiting on you/i.test(reread) || !/Approve this repair/i.test(reread),
+    'the answered proposal is still being offered for an answer',
+  );
+}
+
+check('no console errors across the whole journey', consoleErrors.length === 0, consoleErrors.join(' | '));
+
+await browser.close();
+
+console.log(`\n${built}/${WORKFLOW.length} customer journey screens are real and reachable AS A CUSTOMER`);
+console.log(`${checks - failures}/${checks} checks passed\n`);
+process.exit(failures === 0 ? 0 : 1);
diff --git a/apps/e2e/verify/verify-technician-workflow.mjs b/apps/e2e/verify/verify-technician-workflow.mjs
index a166b3c..aafc415 100644
--- a/apps/e2e/verify/verify-technician-workflow.mjs
+++ b/apps/e2e/verify/verify-technician-workflow.mjs
@@ -91,11 +91,21 @@ const WORKFLOW = [
  * What the catch-all renders for an unbuilt route. Matching this is a FAILURE:
  * the page loaded, the shell rendered, and the screen does not exist.
  *
- * Taken from the real placeholder copy — if that wording ever changes this
- * script starts passing everything, so the sentinel check below asserts the
- * placeholder is still detectable before any route is judged.
+ * 🔴 THE SENTENCE, NOT THE PHRASE. This regex also carried `not built yet` on
+ * its first run and produced a FALSE FAILURE on the technician dashboard —
+ * a screen that is entirely real, and whose own explanatory copy says "Page
+ * content is not built yet" about OTHER routes. The check reported the first
+ * screen a technician ever sees as unbuilt.
+ *
+ * That is this repo's most-repeated defect wearing the reviewer's hat: a
+ * measurement that walks through its own gap. A detector keyed on a phrase that
+ * appears in ordinary prose will keep finding it in prose.
+ *
+ * `scheduled for a later phase` is the exact sentence `ModulePage.tsx` renders
+ * and nothing else in the product says it. If that copy changes, the SENTINEL
+ * check below fails loudly rather than letting every route pass.
  */
-const PLACEHOLDER = /scheduled for a later phase|not built yet/i;
+const PLACEHOLDER = /scheduled for a later phase/i;
 
 const browser = await chromium.launch();
 const consoleErrors = [];
diff --git a/apps/workshop-web/app/home/dashboard/page.tsx b/apps/workshop-web/app/home/dashboard/page.tsx
index 0606397..c8706ac 100644
--- a/apps/workshop-web/app/home/dashboard/page.tsx
+++ b/apps/workshop-web/app/home/dashboard/page.tsx
@@ -37,6 +37,17 @@ async function describeNavigation() {
 
   return {
     grants: grantsFor(viewer),
+    /**
+     * 🔴 WHETHER THERE IS A SESSION, read directly rather than INFERRED from an
+     * empty grant list. The copy below used to reason "no grants, therefore
+     * nobody is signed in" — and a signed-in TECHNICIAN holds no grants today
+     * (viewerGrants() still carries its demo body, T-0003), so the dashboard
+     * told a technician who had just signed in that nobody was signed in.
+     *
+     * Exactly the family of defect that produced "Not signed in" beside a
+     * working "Sign out" twice already: a truth about A used as evidence for B.
+     */
+    signedIn: viewer !== null && viewer !== undefined,
     groupCount: visible.length,
     itemCount: visible.reduce((n, g) => n + g.items.length, 0),
     roleLabel: role ? `${role} role` : 'workspace default',
@@ -292,7 +303,10 @@ export default async function Dashboard() {
                     dangling clause that describes nothing. An empty grant list
                     is now the common case, not an edge one: it is what every
                     visitor sees before signing in. */}
-                This viewer holds <strong>no permission grants</strong>, because nobody is signed in.
+                This viewer holds <strong>no permission grants</strong>
+                {nav.signedIn
+                  ? ' — this role has none assigned yet.'
+                  : ', because nobody is signed in.'}{' '}
                 Only ungated modules are listed; everything gated is absent from the menu
               </>
             ) : (
diff --git a/scripts/seed-customer-proposal-fixture.sh b/scripts/seed-customer-proposal-fixture.sh
new file mode 100644
index 0000000..4463c9a
--- /dev/null
+++ b/scripts/seed-customer-proposal-fixture.sh
@@ -0,0 +1,172 @@
+#!/usr/bin/env bash
+#
+# Seeds ONE proposal ISSUED to the dev customer, so the customer approval screen
+# has something to answer.
+#
+# 🔴 WHY THIS EXISTS. `verify-customer-workflow.mjs` asserts the approval screen
+# is in a coherent state — either it offers an answer, or it honestly says
+# nothing is waiting. With no issued proposal in the database it passes on the
+# SECOND branch every time, and the submit control is never exercised at all.
+#
+# That is precisely the failure this repository keeps paying for: 24 of 24 live
+# checks passed against a catalogue containing nothing, because each confirmed
+# that a section RENDERED and none asked whether anything was in it. A green
+# customer-workflow run against an empty proposal table proves the page loads
+# and proves nothing about the feature.
+#
+# So this puts a real, answerable proposal in front of the dev customer, and the
+# verify script's `offersAnswer` branch — including the "has a submit button"
+# assertion — actually runs.
+#
+# ⚠️ THE VERIFY RUN CONSUMES THIS FIXTURE if it submits an answer: an answered
+# proposal is no longer `issued` and leaves the screen by design. Re-run this
+# before each verification rather than assuming yesterday's row survived. Same
+# lesson as `seed-qc-fixture.sh`, which exists for exactly this reason.
+#
+# Idempotent in the safe direction: it supersedes whatever the latest version on
+# that card is and adds the NEXT version, so running it twice leaves one
+# answerable proposal rather than corrupting one.
+#
+#   bash scripts/seed-customer-proposal-fixture.sh
+#
+# DEV ONLY. Writes to the local Docker Postgres.
+set -euo pipefail
+
+CONTAINER="${AW_PG_CONTAINER:-aw-postgres}"
+CUSTOMER_EMAIL="${DEV_CUSTOMER_EMAIL:-customer@autoworkshop.local}"
+
+docker exec -i -e CUSTOMER_EMAIL="$CUSTOMER_EMAIL" "$CONTAINER" \
+  psql -U autoworkshop -d autoworkshop -v ON_ERROR_STOP=1 \
+  -v customer_email="'${CUSTOMER_EMAIL}'" <<'SQL'
+BEGIN;
+
+-- Superuser context so the seed is not itself subject to the policies under
+-- test. Same reason `seed-qc-fixture.sh` does it.
+SELECT set_config('app.current_role', 'admin', true);
+
+-- The email reaches the DO block through a GUC, not through string
+-- interpolation: `:customer_email` is expanded by psql as a properly quoted
+-- literal here, once, rather than being pasted into the body of a $$-quoted
+-- function where quoting rules differ and a stray apostrophe would end the block.
+SELECT set_config('aw.customer_email', :customer_email, true);
+
+DO $$
+DECLARE
+  card     UUID;
+  quote    UUID;
+  ten      UUID;
+  org      UUID;
+  latest   INTEGER;
+  staff    UUID;
+  new_id   UUID;
+BEGIN
+  -- A job card belonging to THE DEV CUSTOMER, chosen from real data rather than
+  -- invented, so the fixture cannot drift from what the app actually produces.
+  -- It must be that customer's own card or the screen will never show it: the
+  -- API narrows a customer viewer with a `c.user_id` predicate.
+  SELECT j.id, j.tenant_id, j.organization_id
+    INTO card, ten, org
+    FROM repair.job_cards j
+    JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
+    JOIN identity.users  u ON u.id = c.user_id
+   WHERE u.email = current_setting('aw.customer_email', true)
+     AND EXISTS (SELECT 1 FROM repair.quotations q WHERE q.job_card_id = j.id)
+   ORDER BY j.opened_at DESC
+   LIMIT 1;
+
+  IF card IS NULL THEN
+    -- Refuse loudly rather than seeding nothing and letting the verify run
+    -- report a clean pass on its empty branch — which is the whole failure this
+    -- file exists to prevent.
+    RAISE EXCEPTION
+      'no job card with a quotation belongs to %. Run seed-dev-core.sh first.',
+      current_setting('aw.customer_email', true);
+  END IF;
+
+  -- The quotation the proposal is made FROM. A proposal reads its money from
+  -- exactly this row, so an invented one would render a document with no prices.
+  SELECT id INTO quote
+    FROM repair.quotations
+   WHERE job_card_id = card AND tenant_id = ten
+   ORDER BY attempt_no DESC
+   LIMIT 1;
+
+  -- 🔴 IF ONE IS ALREADY WAITING, REUSE IT. DO NOT ADD ANOTHER.
+  --
+  -- The first version of this script always inserted the next version and only
+  -- set `superseded_by` on the previous one — leaving the previous row at
+  -- status `issued`. Two runs therefore produced TWO answerable proposals on
+  -- one card, which the real flow cannot produce at all: `prepare()` refuses a
+  -- new version while one is still with the customer ("version N is with the
+  -- customer and has not been answered").
+  --
+  -- So the fixture was manufacturing a state the product forbids, and then the
+  -- verify run failed on it — a harness defect wearing a product defect's
+  -- clothes, which is 7 of the 11 "defects" one day in this repo turned out to
+  -- be. Seeding must reproduce reality, not merely populate a table.
+  -- ⚠️ `superseded_by IS NULL` TOO — the same definition of "answerable" the
+  -- API uses for `decidable`. Testing only on status found a SUPERSEDED row
+  -- still marked `issued`, declared the card already covered, and seeded
+  -- nothing — so the verify run fell back to its "nothing is waiting" branch
+  -- and passed without ever exercising the form. A fixture whose idea of
+  -- "ready" differs from the product's is how a suite goes green on an empty
+  -- shop.
+  IF EXISTS (SELECT 1 FROM repair.repair_proposals
+              WHERE job_card_id = card AND tenant_id = ten
+                AND status = 'issued' AND superseded_by IS NULL) THEN
+    UPDATE repair.job_cards
+       SET stage = 'awaiting_customer_approval', stage_changed_at = now()
+     WHERE id = card AND tenant_id = ten;
+    RAISE NOTICE 'a proposal is already awaiting an answer on card % — reused, none added', card;
+    RETURN;
+  END IF;
+
+  SELECT COALESCE(max(version_no), 0) INTO latest
+    FROM repair.repair_proposals
+   WHERE job_card_id = card AND tenant_id = ten;
+
+  -- Somebody to have issued it. A proposal with no issuer cannot be acted on.
+  SELECT m.user_id INTO staff
+    FROM identity.memberships m
+   WHERE m.tenant_id = ten AND m.status = 'active'
+     AND m.role_name IN ('workshop_owner', 'workshop_manager', 'reception_staff')
+   LIMIT 1;
+
+  new_id := gen_random_uuid();
+
+  INSERT INTO repair.repair_proposals (
+    id, tenant_id, organization_id, job_card_id, quotation_id,
+    version_no, status,
+    expected_result, risk_and_limitations, uncertainties,
+    issued_by, issued_at, created_by
+  ) VALUES (
+    new_id, ten, org, card, quote,
+    latest + 1, 'issued',
+    'The rough idle is corrected and the vehicle idles within specification.',
+    'Fixture data. If further wear is found once the manifold is off, the extra work is quoted separately before it is done.',
+    'Whether the idle control valve also needs replacing cannot be confirmed until the manifold is removed.',
+    staff, now(), staff
+  );
+
+  -- §424: the previous version points at its replacement rather than being
+  -- edited or deleted. Only `superseded_by` is writable on a decided proposal,
+  -- and that is deliberate — see migration 017.
+  IF latest > 0 THEN
+    UPDATE repair.repair_proposals
+       SET superseded_by = new_id
+     WHERE job_card_id = card AND tenant_id = ten AND version_no = latest;
+  END IF;
+
+  -- The card has to be at the stage that MEANS "with the customer", or the
+  -- customer screen files it under "in progress" and never asks for an answer.
+  UPDATE repair.job_cards
+     SET stage = 'awaiting_customer_approval', stage_changed_at = now()
+   WHERE id = card AND tenant_id = ten;
+
+  RAISE NOTICE 'issued proposal v% on card % for %',
+    latest + 1, card, current_setting('aw.customer_email', true);
+END;
+$$;
+
+COMMIT;
+SQL
```
codex
I’ll review this as a code review against the repo’s stated requirements, starting with README and the implementation log, then I’ll inspect the changed files with line numbers and relevant surrounding code.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git diff --stat HEAD~1..HEAD; git diff --name-only HEAD~1..HEAD' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path README.md' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'if (Test-Path docs/IMPLEMENTATION_LOG.md) { Get-Content -Path docs/IMPLEMENTATION_LOG.md }' in C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'if (Test-Path docs/IMPLEMENTATION_LOG.md) { Get-Content -Path docs/IMPLEMENTATION_LOG.md }'` rejected: blocked by policy
2026-08-04T14:00:26.442335Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'if (Test-Path docs/IMPLEMENTATION_LOG.md) { Get-Content -Path docs/IMPLEMENTATION_LOG.md }'` rejected: blocked by policy
 succeeded in 721ms:
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

 succeeded in 721ms:
 apps/api/src/repair/proposal.service.ts        |   7 +
 apps/e2e/verify/verify-customer-workflow.mjs   | 239 +++++++++++++++++++++++++
 apps/e2e/verify/verify-technician-workflow.mjs |  18 +-
 apps/workshop-web/app/home/dashboard/page.tsx  |  16 +-
 scripts/seed-customer-proposal-fixture.sh      | 172 ++++++++++++++++++
 5 files changed, 447 insertions(+), 5 deletions(-)
apps/api/src/repair/proposal.service.ts
apps/e2e/verify/verify-customer-workflow.mjs
apps/e2e/verify/verify-technician-workflow.mjs
apps/workshop-web/app/home/dashboard/page.tsx
scripts/seed-customer-proposal-fixture.sh

codex
The README is high-level, so I’m checking the implementation log and the touched code for the concrete acceptance criteria. One shell read using an inline conditional was blocked by policy, so I’m switching to direct file discovery/read commands.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-ChildItem -Path docs -Filter IMPLEMENTATION_LOG.md -File' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content -Path apps/e2e/verify/verify-customer-workflow.mjs | ForEach-Object { $i++; '"'{0,5}: {1}' -f "'$i, $_ }' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content -Path apps/api/src/repair/proposal.service.ts | ForEach-Object { $i++; if ($i -ge 930 -and $i -le 980) { '"'{0,5}: {1}' -f "'$i, $_ } }' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content -Path apps/workshop-web/app/home/dashboard/page.tsx | ForEach-Object { $i++; if (($i -ge 1 -and $i -le 80) -or ($i -ge 270 -and $i -le 315)) { '"'{0,5}: {1}' -f "'$i, $_ } }' in C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content -Path apps/api/src/repair/proposal.service.ts | ForEach-Object { $i++; if ($i -ge 930 -and $i -le 980) { '"'{0,5}: {1}' -f "'$i, $_ } }'` rejected: blocked by policy
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content -Path apps/e2e/verify/verify-customer-workflow.mjs | ForEach-Object { $i++; '"'{0,5}: {1}' -f "'$i, $_ }'` rejected: blocked by policy
2026-08-04T14:00:46.947879Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content -Path apps/api/src/repair/proposal.service.ts | ForEach-Object { $i++; if ($i -ge 930 -and $i -le 980) { '"'{0,5}: {1}' -f "'$i, $_ } }'` rejected: blocked by policy
2026-08-04T14:00:46.948336Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content -Path apps/e2e/verify/verify-customer-workflow.mjs | ForEach-Object { $i++; '"'{0,5}: {1}' -f "'$i, $_ }'` rejected: blocked by policy
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content -Path apps/workshop-web/app/home/dashboard/page.tsx | ForEach-Object { $i++; if (($i -ge 1 -and $i -le 80) -or ($i -ge 270 -and $i -le 315)) { '"'{0,5}: {1}' -f "'$i, $_ } }'` rejected: blocked by policy
2026-08-04T14:00:46.949424Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content -Path apps/workshop-web/app/home/dashboard/page.tsx | ForEach-Object { $i++; if (($i -ge 1 -and $i -le 80) -or ($i -ge 270 -and $i -le 315)) { '"'{0,5}: {1}' -f "'$i, $_ } }'` rejected: blocked by policy
 succeeded in 527ms:
codex
The sandbox policy is rejecting PowerShell script blocks, but plain search commands are available. I’ll use `rg -n` and small direct reads instead of formatted line-number loops.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "PLACEHOLDER|payments/invoices|SENTINEL|WORKFLOW|not built yet|scheduled for a later phase" apps/e2e/verify/verify-technician-workflow.mjs' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "signedIn|no permission grants|viewerGrants|grantsFor|Not signed in|Sign out" apps/workshop-web/app/home/dashboard/page.tsx' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "CUSTOMER|WORKFLOW|PLACEHOLDER|signed in|payments/invoices|Approve this repair|decision|approvedOption|button.*submit|Nothing is waiting|process.exit|consoleErrors" apps/e2e/verify/verify-customer-workflow.mjs' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "decidable|superseded_by|CAN_RECORD_DECISION|CAN_DECIDE_AS_CUSTOMER" apps/api/src/repair/proposal.service.ts' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 2342ms:
5:import { currentViewer, grantsFor, navRoleFor, requireNavRoute } from '@autoworkshop/next-shell';
35:    grantsFor(viewer),
39:    grants: grantsFor(viewer),
44:     * (viewerGrants() still carries its demo body, T-0003), so the dashboard
47:     * Exactly the family of defect that produced "Not signed in" beside a
48:     * working "Sign out" twice already: a truth about A used as evidence for B.
50:    signedIn: viewer !== null && viewer !== undefined,
306:                This viewer holds <strong>no permission grants</strong>
307:                {nav.signedIn

 succeeded in 2352ms:
14:  CAN_DECIDE_AS_CUSTOMER,
16:  CAN_RECORD_DECISION,
144:  decidable: boolean;
163: *     writable field left on it is `superseded_by`, because recording the
306:              SET superseded_by = $1, status = 'superseded', updated_at = now(), updated_by = $2
565:   * ⚠️ THE ROLE CHECK IS NOT THE SCOPE CHECK. `CAN_DECIDE_AS_CUSTOMER` says a
575:    if (!CAN_DECIDE_AS_CUSTOMER.has(ctx.activeRole)) {
702:              p.decided_by_name, p.decision_channel, p.decision_note, p.superseded_by,
870:        supersededBy: row.superseded_by,
942:         * `CAN_RECORD_DECISION` is the STAFF set. When `customer` was added to
944:         * `decidable` evaluated FALSE for every customer — and the customer
945:         * screen shows its approval form only on `decidable`. The whole
958:         * `CAN_DECIDE_AS_CUSTOMER` plus the `c.user_id` predicate for the
961:        decidable:
969:          row.superseded_by === null &&
970:          (CAN_RECORD_DECISION.has(ctx.activeRole) || CAN_DECIDE_AS_CUSTOMER.has(ctx.activeRole)),
1078:    if (!CAN_RECORD_DECISION.has(ctx.activeRole)) {
1151:  superseded_by: string | null;

 succeeded in 2372ms:
2: * THE TECHNICIAN'S WHOLE WORKFLOW, THROUGH THE BROWSER, AS THE TECHNICIAN.
24: * 2. THE PLACEHOLDER IS THE FAILURE. 127 menu entries render an honest "not
58: * claims to be" — deliberately something the PLACEHOLDER could never contain.
60:const WORKFLOW = [
94: * 🔴 THE SENTENCE, NOT THE PHRASE. This regex also carried `not built yet` on
97: * content is not built yet" about OTHER routes. The check reported the first
104: * `scheduled for a later phase` is the exact sentence `ModulePage.tsx` renders
105: * and nothing else in the product says it. If that copy changes, the SENTINEL
108:const PLACEHOLDER = /scheduled for a later phase/i;
122:console.log(`\nTECHNICIAN WORKFLOW — ${WORKSHOP}, as ${USER}\n`);
172:// ── 🔴 SENTINEL: can this script still RECOGNISE an unbuilt screen? ────────
173:// Every judgement below depends on `PLACEHOLDER` matching the catch-all. If the
176:// route from the technician's own tree that is genuinely not built yet.
180:  'SENTINEL: the placeholder is still detectable',
181:  PLACEHOLDER.test(sentinel),
182:  'PLACEHOLDER no longer matches the catch-all — every route below would pass regardless',
184:if (!PLACEHOLDER.test(sentinel)) {
194:for (const [route, needs, what] of WORKFLOW) {
204:  const notPlaceholder = !PLACEHOLDER.test(main);
215:        ? 'renders the "not built yet" placeholder'
225:  `\n${built}/${WORKFLOW.length} technician workflow screens are real and reachable AS A TECHNICIAN`,

 succeeded in 2386ms:
2: * THE CUSTOMER'S WHOLE WORKFLOW, THROUGH THE BROWSER, AS THE CUSTOMER.
35:const CUSTOMER = process.env['CUSTOMER_WEB_URL'] ?? 'http://localhost:3000';
36:const USER = process.env['DEV_CUSTOMER_EMAIL'] ?? 'customer@autoworkshop.local';
52:const WORKFLOW = [
84:const PLACEHOLDER = /scheduled for a later phase/i;
87:const consoleErrors = [];
94:  consoleErrors.push(m.text());
96:page.on('pageerror', (e) => consoleErrors.push(String(e)));
98:console.log(`\nCUSTOMER WORKFLOW — ${CUSTOMER}, as ${USER}\n`);
100:await page.goto(`${CUSTOMER}/home/dashboard`);
110:await page.goto(`${CUSTOMER}/home/dashboard`, { waitUntil: 'load' });
117:const signedIn = !/Not signed in/i.test(shell) && /Sign out/i.test(shell);
118:check('MEASUREMENT VALID: signed in', signedIn, 'every route answers 200 signed out too');
122:  process.exit(1);
126:await page.goto(`${CUSTOMER}/payments/invoices`, { waitUntil: 'load' });
130:  PLACEHOLDER.test(sentinel),
131:  'PLACEHOLDER no longer matches — every route below would pass regardless',
133:if (!PLACEHOLDER.test(sentinel)) {
136:  process.exit(1);
142:for (const [route, needs, what] of WORKFLOW) {
143:  const response = await page.goto(`${CUSTOMER}${route}`, { waitUntil: 'load' }).catch(() => null);
152:  const notPlaceholder = !PLACEHOLDER.test(main);
168:// `repair-proposals` is the decision point. Either it offers an answer, or it
173:await page.goto(`${CUSTOMER}/service-and-repairs/repair-proposals`, { waitUntil: 'load' });
175:const offersAnswer = /Approve this repair|Send my answer/i.test(proposals);
176:const nothingWaiting = /Nothing is waiting on you/i.test(proposals);
185:    /<button[^>]*type="submit"/i.test(proposals),
202:  await page.selectOption('#decision', 'approved').catch(() => {});
203:  await page.selectOption('#approvedOption', 'recommended').catch(() => {});
204:  await page.getByRole('button', { name: /Approve this repair/i }).click({ noWaitAfter: true });
214:    'approving actually records the decision',
224:  await page.goto(`${CUSTOMER}/service-and-repairs/repair-proposals`, { waitUntil: 'load' });
228:    /Nothing is waiting on you/i.test(reread) || !/Approve this repair/i.test(reread),
233:check('no console errors across the whole journey', consoleErrors.length === 0, consoleErrors.join(' | '));
237:console.log(`\n${built}/${WORKFLOW.length} customer journey screens are real and reachable AS A CUSTOMER`);
239:process.exit(failures === 0 ? 0 : 1);

codex
I’ve got the key line anchors now. Next I’m reading the surrounding modules that define auth/session and proposal decision behavior, because several changed assertions depend on exact page copy and role predicates.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path apps/e2e/verify/verify-customer-workflow.mjs' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path apps/workshop-web/app/home/dashboard/page.tsx -TotalCount 330' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path apps/api/src/repair/proposal.service.ts -TotalCount 1165' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path scripts/seed-customer-proposal-fixture.sh' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 1132ms:
#!/usr/bin/env bash
#
# Seeds ONE proposal ISSUED to the dev customer, so the customer approval screen
# has something to answer.
#
# ðŸ”´ WHY THIS EXISTS. `verify-customer-workflow.mjs` asserts the approval screen
# is in a coherent state â€” either it offers an answer, or it honestly says
# nothing is waiting. With no issued proposal in the database it passes on the
# SECOND branch every time, and the submit control is never exercised at all.
#
# That is precisely the failure this repository keeps paying for: 24 of 24 live
# checks passed against a catalogue containing nothing, because each confirmed
# that a section RENDERED and none asked whether anything was in it. A green
# customer-workflow run against an empty proposal table proves the page loads
# and proves nothing about the feature.
#
# So this puts a real, answerable proposal in front of the dev customer, and the
# verify script's `offersAnswer` branch â€” including the "has a submit button"
# assertion â€” actually runs.
#
# âš ï¸ THE VERIFY RUN CONSUMES THIS FIXTURE if it submits an answer: an answered
# proposal is no longer `issued` and leaves the screen by design. Re-run this
# before each verification rather than assuming yesterday's row survived. Same
# lesson as `seed-qc-fixture.sh`, which exists for exactly this reason.
#
# Idempotent in the safe direction: it supersedes whatever the latest version on
# that card is and adds the NEXT version, so running it twice leaves one
# answerable proposal rather than corrupting one.
#
#   bash scripts/seed-customer-proposal-fixture.sh
#
# DEV ONLY. Writes to the local Docker Postgres.
set -euo pipefail

CONTAINER="${AW_PG_CONTAINER:-aw-postgres}"
CUSTOMER_EMAIL="${DEV_CUSTOMER_EMAIL:-customer@autoworkshop.local}"

docker exec -i -e CUSTOMER_EMAIL="$CUSTOMER_EMAIL" "$CONTAINER" \
  psql -U autoworkshop -d autoworkshop -v ON_ERROR_STOP=1 \
  -v customer_email="'${CUSTOMER_EMAIL}'" <<'SQL'
BEGIN;

-- Superuser context so the seed is not itself subject to the policies under
-- test. Same reason `seed-qc-fixture.sh` does it.
SELECT set_config('app.current_role', 'admin', true);

-- The email reaches the DO block through a GUC, not through string
-- interpolation: `:customer_email` is expanded by psql as a properly quoted
-- literal here, once, rather than being pasted into the body of a $$-quoted
-- function where quoting rules differ and a stray apostrophe would end the block.
SELECT set_config('aw.customer_email', :customer_email, true);

DO $$
DECLARE
  card     UUID;
  quote    UUID;
  ten      UUID;
  org      UUID;
  latest   INTEGER;
  staff    UUID;
  new_id   UUID;
BEGIN
  -- A job card belonging to THE DEV CUSTOMER, chosen from real data rather than
  -- invented, so the fixture cannot drift from what the app actually produces.
  -- It must be that customer's own card or the screen will never show it: the
  -- API narrows a customer viewer with a `c.user_id` predicate.
  SELECT j.id, j.tenant_id, j.organization_id
    INTO card, ten, org
    FROM repair.job_cards j
    JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
    JOIN identity.users  u ON u.id = c.user_id
   WHERE u.email = current_setting('aw.customer_email', true)
     AND EXISTS (SELECT 1 FROM repair.quotations q WHERE q.job_card_id = j.id)
   ORDER BY j.opened_at DESC
   LIMIT 1;

  IF card IS NULL THEN
    -- Refuse loudly rather than seeding nothing and letting the verify run
    -- report a clean pass on its empty branch â€” which is the whole failure this
    -- file exists to prevent.
    RAISE EXCEPTION
      'no job card with a quotation belongs to %. Run seed-dev-core.sh first.',
      current_setting('aw.customer_email', true);
  END IF;

  -- The quotation the proposal is made FROM. A proposal reads its money from
  -- exactly this row, so an invented one would render a document with no prices.
  SELECT id INTO quote
    FROM repair.quotations
   WHERE job_card_id = card AND tenant_id = ten
   ORDER BY attempt_no DESC
   LIMIT 1;

  -- ðŸ”´ IF ONE IS ALREADY WAITING, REUSE IT. DO NOT ADD ANOTHER.
  --
  -- The first version of this script always inserted the next version and only
  -- set `superseded_by` on the previous one â€” leaving the previous row at
  -- status `issued`. Two runs therefore produced TWO answerable proposals on
  -- one card, which the real flow cannot produce at all: `prepare()` refuses a
  -- new version while one is still with the customer ("version N is with the
  -- customer and has not been answered").
  --
  -- So the fixture was manufacturing a state the product forbids, and then the
  -- verify run failed on it â€” a harness defect wearing a product defect's
  -- clothes, which is 7 of the 11 "defects" one day in this repo turned out to
  -- be. Seeding must reproduce reality, not merely populate a table.
  -- âš ï¸ `superseded_by IS NULL` TOO â€” the same definition of "answerable" the
  -- API uses for `decidable`. Testing only on status found a SUPERSEDED row
  -- still marked `issued`, declared the card already covered, and seeded
  -- nothing â€” so the verify run fell back to its "nothing is waiting" branch
  -- and passed without ever exercising the form. A fixture whose idea of
  -- "ready" differs from the product's is how a suite goes green on an empty
  -- shop.
  IF EXISTS (SELECT 1 FROM repair.repair_proposals
              WHERE job_card_id = card AND tenant_id = ten
                AND status = 'issued' AND superseded_by IS NULL) THEN
    UPDATE repair.job_cards
       SET stage = 'awaiting_customer_approval', stage_changed_at = now()
     WHERE id = card AND tenant_id = ten;
    RAISE NOTICE 'a proposal is already awaiting an answer on card % â€” reused, none added', card;
    RETURN;
  END IF;

  SELECT COALESCE(max(version_no), 0) INTO latest
    FROM repair.repair_proposals
   WHERE job_card_id = card AND tenant_id = ten;

  -- Somebody to have issued it. A proposal with no issuer cannot be acted on.
  SELECT m.user_id INTO staff
    FROM identity.memberships m
   WHERE m.tenant_id = ten AND m.status = 'active'
     AND m.role_name IN ('workshop_owner', 'workshop_manager', 'reception_staff')
   LIMIT 1;

  new_id := gen_random_uuid();

  INSERT INTO repair.repair_proposals (
    id, tenant_id, organization_id, job_card_id, quotation_id,
    version_no, status,
    expected_result, risk_and_limitations, uncertainties,
    issued_by, issued_at, created_by
  ) VALUES (
    new_id, ten, org, card, quote,
    latest + 1, 'issued',
    'The rough idle is corrected and the vehicle idles within specification.',
    'Fixture data. If further wear is found once the manifold is off, the extra work is quoted separately before it is done.',
    'Whether the idle control valve also needs replacing cannot be confirmed until the manifold is removed.',
    staff, now(), staff
  );

  -- Â§424: the previous version points at its replacement rather than being
  -- edited or deleted. Only `superseded_by` is writable on a decided proposal,
  -- and that is deliberate â€” see migration 017.
  IF latest > 0 THEN
    UPDATE repair.repair_proposals
       SET superseded_by = new_id
     WHERE job_card_id = card AND tenant_id = ten AND version_no = latest;
  END IF;

  -- The card has to be at the stage that MEANS "with the customer", or the
  -- customer screen files it under "in progress" and never asks for an answer.
  UPDATE repair.job_cards
     SET stage = 'awaiting_customer_approval', stage_changed_at = now()
   WHERE id = card AND tenant_id = ten;

  RAISE NOTICE 'issued proposal v% on card % for %',
    latest + 1, card, current_setting('aw.customer_email', true);
END;
$$;

COMMIT;
SQL

 succeeded in 1217ms:
/**
 * THE CUSTOMER'S WHOLE WORKFLOW, THROUGH THE BROWSER, AS THE CUSTOMER.
 *
 * The vehicle owner's path, end to end:
 *
 *   garage -> add a vehicle -> report a problem -> see the request ->
 *   track it -> answer what needs answering -> collect -> read the history
 *
 * â”€â”€ WHY EVERY CHECK ASSERTS CONTENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 * The Â§33 customer tree advertises 35 entries and the catch-all renders an
 * honest "not built yet" page for the ones with no screen â€” HTTP 200, full
 * shell, plausible-looking. A check that only asserts the page loaded therefore
 * passes on every unbuilt screen in the workspace. This repo has already paid
 * for that exact shape at larger scale: 24 of 24 live checks passed against a
 * catalogue containing nothing, because every one of them confirmed the SECTION
 * rendered and none asked whether anything was in it.
 *
 * So each route below carries a phrase the placeholder could never contain, and
 * a SENTINEL check proves the placeholder is still detectable before any route
 * is judged â€” otherwise a copy change would silently turn this into a script
 * that reports the whole workspace as built.
 *
 * âš ï¸ `requireNavRoute` DOES NOT REFUSE A SIGNED-OUT VISITOR on this tree (see
 * the comment on `/my-vehicles/garage`), so a run that quietly lost its session
 * would still get HTTP 200 from every route and report a working product while
 * measuring the signed-out state. The validity checks below abort on that.
 *
 *   node verify/verify-customer-workflow.mjs
 *
 * DEV ONLY â€” localhost/LAN, real Keycloak sign-in.
 */
import { chromium } from '@playwright/test';

const CUSTOMER = process.env['CUSTOMER_WEB_URL'] ?? 'http://localhost:3000';
const USER = process.env['DEV_CUSTOMER_EMAIL'] ?? 'customer@autoworkshop.local';
const PASSWORD = process.env['DEV_USER_PASSWORD'] ?? 'Change_me_locally1!';

let failures = 0;
let checks = 0;
function check(label, ok, detail) {
  checks += 1;
  if (ok) console.log(`  PASS  ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${String(detail).slice(0, 300)}`);
  }
}

/** The journey, in the order a vehicle owner actually travels it. */
const WORKFLOW = [
  ['/home/dashboard', /dashboard|welcome|vehicle/i, 'lands somewhere real'],
  ['/my-vehicles/garage', /garage|vehicle/i, 'sees their garage'],
  ['/my-vehicles/add-vehicle', /vehicle|registration/i, 'adds a vehicle'],
  ['/service-and-repairs/report-a-problem', /problem|report/i, 'reports a problem'],
  ['/service-and-repairs/service-requests', /request/i, 'sees every request they made'],
  ['/service-and-repairs/repair-tracking', /track|repair/i, 'tracks a live repair'],
  ['/service-and-repairs/repair-proposals', /proposal|approval|waiting/i, 'answers what needs them'],
  ['/service-and-repairs/completed-repairs', /complet/i, 'sees finished work'],
  ['/my-vehicles/service-history', /history|record/i, 'reads the service history'],
  ['/parts-and-warranty/parts-orders', /order|part/i, 'sees their parts orders'],
  ['/vehicle-lookup', /vin|lookup|vehicle/i, 'looks a VIN up'],
];

/**
 * What the catch-all renders for an unbuilt route. Matching this is a FAILURE:
 * the page loaded, the shell rendered, and the screen does not exist.
 *
 * ðŸ”´ THE SENTENCE, NOT THE PHRASE. This regex also carried `not built yet` on
 * its first run and produced a FALSE FAILURE on the technician dashboard â€”
 * a screen that is entirely real, and whose own explanatory copy says "Page
 * content is not built yet" about OTHER routes. The check reported the first
 * screen a technician ever sees as unbuilt.
 *
 * That is this repo's most-repeated defect wearing the reviewer's hat: a
 * measurement that walks through its own gap. A detector keyed on a phrase that
 * appears in ordinary prose will keep finding it in prose.
 *
 * `scheduled for a later phase` is the exact sentence `ModulePage.tsx` renders
 * and nothing else in the product says it. If that copy changes, the SENTINEL
 * check below fails loudly rather than letting every route pass.
 */
const PLACEHOLDER = /scheduled for a later phase/i;

const browser = await chromium.launch();
const consoleErrors = [];

const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (/Failed to load resource.*40[134]/i.test(m.text())) return;
  consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));

console.log(`\nCUSTOMER WORKFLOW â€” ${CUSTOMER}, as ${USER}\n`);

await page.goto(`${CUSTOMER}/home/dashboard`);
await page.getByRole('link', { name: 'Sign in' }).first().click();
const provider = page.getByRole('button', { name: /Keycloak/i });
await provider.waitFor({ state: 'visible', timeout: 30000 });
await provider.click({ noWaitAfter: true });
await page.waitForURL(/openid-connect\/auth/, { timeout: 90000 });
await page.fill('#username', USER);
await page.fill('#password', PASSWORD);
await page.click('#kc-login', { noWaitAfter: true });
await page.waitForURL((u) => !/openid-connect/.test(u.toString()), { timeout: 90000 });
await page.goto(`${CUSTOMER}/home/dashboard`, { waitUntil: 'load' });

// â”€â”€ ðŸ”´ IS THIS MEASUREMENT VALID? â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// A signed-out run reaches all eleven routes and reports them working, because
// this tree does not refuse anonymous visitors. Nothing below means anything
// unless there is a real session.
const shell = await page.content();
const signedIn = !/Not signed in/i.test(shell) && /Sign out/i.test(shell);
check('MEASUREMENT VALID: signed in', signedIn, 'every route answers 200 signed out too');
if (!signedIn) {
  console.log('\nABORTING â€” a signed-out run would report a working product.\n');
  await browser.close();
  process.exit(1);
}

// â”€â”€ ðŸ”´ SENTINEL: can an unbuilt screen still be recognised? â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
await page.goto(`${CUSTOMER}/payments/invoices`, { waitUntil: 'load' });
const sentinel = await page.content();
check(
  'SENTINEL: the placeholder is still detectable',
  PLACEHOLDER.test(sentinel),
  'PLACEHOLDER no longer matches â€” every route below would pass regardless',
);
if (!PLACEHOLDER.test(sentinel)) {
  console.log('\nABORTING â€” the detector is broken.\n');
  await browser.close();
  process.exit(1);
}

console.log('\n  the journey, in order:\n');

let built = 0;
for (const [route, needs, what] of WORKFLOW) {
  const response = await page.goto(`${CUSTOMER}${route}`, { waitUntil: 'load' }).catch(() => null);
  const status = response?.status() ?? 0;
  const html = await page.content().catch(() => '');
  // Strip the shell: the side navigation carries every route's LABEL, so the
  // word "proposal" appears on a page rendering nothing of the sort. Without
  // this the content assertion passes on the placeholder itself.
  const main = (/<main[\s\S]*?<\/main>/i.exec(html) ?? [html])[0];

  const ok200 = status === 200;
  const notPlaceholder = !PLACEHOLDER.test(main);
  const hasContent = needs.test(main);
  if (ok200 && notPlaceholder && hasContent) built += 1;

  check(
    `${what.padEnd(30)} ${route}`,
    ok200 && notPlaceholder && hasContent,
    !ok200
      ? `HTTP ${status}`
      : !notPlaceholder
        ? 'renders the "not built yet" placeholder'
        : `rendered but does not mention ${needs}`,
  );
}

// â”€â”€ the one screen whose STATE matters, not just its existence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// `repair-proposals` is the decision point. Either it offers an answer, or it
// says nothing is waiting â€” and BOTH are correct. What would be wrong is the
// old "contact the workshop" text appearing beside a proposal that is in fact
// answerable in-app, which is what `decidable` returning false for every
// customer produced.
await page.goto(`${CUSTOMER}/service-and-repairs/repair-proposals`, { waitUntil: 'load' });
const proposals = await page.content();
const offersAnswer = /Approve this repair|Send my answer/i.test(proposals);
const nothingWaiting = /Nothing is waiting on you/i.test(proposals);
check(
  'the approval screen is in a coherent state',
  offersAnswer || nothingWaiting,
  'neither an answerable proposal nor an honest empty state â€” check `decidable`',
);
if (offersAnswer) {
  check(
    'an answerable proposal offers a SUBMIT control, not just prose',
    /<button[^>]*type="submit"/i.test(proposals),
    'a form with no submit button shipped here once before',
  );
}

// â”€â”€ ðŸ”´ AND FINALLY: DOES APPROVING ACTUALLY DO ANYTHING? â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Everything above proves screens RENDER. This is the only check that proves
// the feature WORKS â€” it fills the form in, submits it, and reads the result
// back. Without it the suite would be satisfied by a form that posts into the
// void, which is a shape this repo has shipped: a form with no submit button
// passed typecheck, lint and next build, and was found only in a browser.
//
// âš ï¸ THIS CONSUMES THE FIXTURE. An answered proposal is no longer `issued` and
// correctly leaves the screen, so re-run scripts/seed-customer-proposal-fixture.sh
// before the next verification. Two runs in this repo have already reported a
// clean pass while testing the residue of their own previous run.
if (offersAnswer) {
  await page.selectOption('#decision', 'approved').catch(() => {});
  await page.selectOption('#approvedOption', 'recommended').catch(() => {});
  await page.getByRole('button', { name: /Approve this repair/i }).click({ noWaitAfter: true });
  // The server action revalidates four paths; wait for the outcome to render
  // rather than for a fixed delay.
  await page
    .waitForFunction(() => /Approved\.|error|not accepted|did not respond/i.test(document.body.innerText), {
      timeout: 30000,
    })
    .catch(() => {});
  const after = await page.content();
  check(
    'approving actually records the decision',
    /Approved\. The workshop has been told/i.test(after),
    (/<p[^>]*>([^<]*(error|not accepted|did not respond|session has ended)[^<]*)<\/p>/i.exec(after) ?? [
      , 'no confirmation and no error â€” the submit went nowhere',
    ])[1],
  );

  // Read it back from the OTHER screen, not from the one that wrote it. A page
  // echoing its own success message proves the browser ran, not that anything
  // was stored.
  await page.goto(`${CUSTOMER}/service-and-repairs/repair-proposals`, { waitUntil: 'load' });
  const reread = await page.content();
  check(
    'and the proposal is gone from the waiting list afterwards',
    /Nothing is waiting on you/i.test(reread) || !/Approve this repair/i.test(reread),
    'the answered proposal is still being offered for an answer',
  );
}

check('no console errors across the whole journey', consoleErrors.length === 0, consoleErrors.join(' | '));

await browser.close();

console.log(`\n${built}/${WORKFLOW.length} customer journey screens are real and reachable AS A CUSTOMER`);
console.log(`${checks - failures}/${checks} checks passed\n`);
process.exit(failures === 0 ? 0 : 1);

 succeeded in 1222ms:
import { apiGet, registrationStatus, needsWorkshop, viewerHasSession } from '@autoworkshop/next-shell';
import { CreateWorkshopScreen } from '../../_screens/create-workshop-screen';
import { PageHeader, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { currentViewer, grantsFor, navRoleFor, requireNavRoute } from '@autoworkshop/next-shell';
import { getWorkspace, visibleGroups, workspaceForRole } from '@autoworkshop/navigation';

/**
 * Everything this page says about the navigation is COMPUTED from the model it
 * is describing, never restated. Both facts below were previously written out
 * by hand and both went false the moment the model changed â€” the group/item
 * counts when T-0027 introduced per-role trees, and the granted-permission list
 * when the demo grants were narrowed. A page whose job is to explain the system
 * has to read the system.
 *
 * âš ï¸ THIS RUNS PER REQUEST AND MUST NOT MOVE BACK TO MODULE SCOPE.
 *
 * Every value below used to be a module-level `const`. That worked only while
 * the viewer was a hardcoded demo: module scope is evaluated ONCE, when Next
 * first loads the route, so with a real session the first visitor's role and
 * grants would have been baked in and served to every subsequent visitor â€”
 * including a signed-out one, and including across users. A dashboard that
 * describes somebody else's permissions is worse than one that describes none.
 *
 * The `!` on `getWorkspace('workshop')` is safe for the same reason it always
 * was: this file only exists inside the workshop app.
 */
const THIS_ROUTE = '/home/dashboard';

async function describeNavigation() {
  const viewer = await currentViewer('workshop');
  const role = navRoleFor(viewer?.activeRole);
  const visible = visibleGroups(
    workspaceForRole(getWorkspace('workshop')!, role),
    grantsFor(viewer),
  );

  return {
    grants: grantsFor(viewer),
    /**
     * ðŸ”´ WHETHER THERE IS A SESSION, read directly rather than INFERRED from an
     * empty grant list. The copy below used to reason "no grants, therefore
     * nobody is signed in" â€” and a signed-in TECHNICIAN holds no grants today
     * (viewerGrants() still carries its demo body, T-0003), so the dashboard
     * told a technician who had just signed in that nobody was signed in.
     *
     * Exactly the family of defect that produced "Not signed in" beside a
     * working "Sign out" twice already: a truth about A used as evidence for B.
     */
    signedIn: viewer !== null && viewer !== undefined,
    groupCount: visible.length,
    itemCount: visible.reduce((n, g) => n + g.items.length, 0),
    roleLabel: role ? `${role} role` : 'workspace default',
    /**
     * This page's own title, taken from the navigation entry that points at it.
     *
     * A concrete `page.tsx` takes precedence over the catch-all, so this route
     * is the one place where the header text is written by hand instead of
     * being derived from the nav item â€” and it promptly disagreed with it: the
     * technician tree calls `/home/dashboard` "Technician Dashboard" while the
     * header said "Workshop Dashboard", so the menu, the breadcrumb and the
     * heading named the same screen three ways. Reading the label from the
     * model removes the second source rather than syncing it.
     */
    pageTitle:
      visible.flatMap((g) => g.items).find((i) => i.href === THIS_ROUTE)?.label ??
      'Workshop Dashboard',
  };
}

/**
 * Workshop dashboard â€” Â§18, the default landing page for the workspace.
 *
 * âš ï¸ THE FIGURES WERE DEMO DATA UNTIL 2026-07-31 AND ARE NOW REAL, computed
 * from `GET /job-cards` â€” the same endpoint and therefore the same tenant
 * scoping the staging board uses. The old note said Phase 5 would replace them;
 * Phase 5 has landed, so it has.
 *
 * âš ï¸ EVERY TILE IS DERIVED FROM A STAGE THAT ACTUALLY EXISTS in
 * `BOARD_COLUMNS`. Tiles whose data this product cannot yet answer were
 * REMOVED rather than left showing an invented number: "Reorder alerts" needed
 * stock levels and "Appointments today" needed a scheduling module, and neither
 * exists. A dashboard that keeps a fake tile beside five real ones is worse
 * than one that had six fakes, because nothing on it tells you which is which.
 *
 * The counts narrow with the viewer, because `list` does: staff see the
 * organisation, a technician sees only cards assigned to them. That is the
 * property worth having â€” no dashboard-only query that could drift from the
 * board's own scoping.
 */

/** Stages that mean a job is live work rather than finished or parked. */
const OPEN_STAGES = new Set([
  'complaint_received', 'appointment_confirmed', 'vehicle_received',
  'initial_inspection', 'diagnosis_in_progress', 'further_information_required',
  'solution_preparation', 'quotation_preparation', 'specialist_consultation',
  'awaiting_customer_approval', 'awaiting_deposit', 'awaiting_parts',
  'authorized_to_start', 'repair_in_progress', 'testing', 'quality_control',
]);

interface JobCardRow {
  id: string;
  stage: string;
}

type TileSpec = {
  label: string;
  value: number;
  kind: 'active' | 'attention' | 'complete' | 'blocked';
  hint: string;
};

function Tile({ label, value, kind, hint }: TileSpec) {
  return (
    <div
      style={{
        border: `1px solid ${themeVar.borderDefault}`,
        borderRadius: primitive.radius.lg,
        padding: primitive.space[4],
        background: themeVar.surfaceRaised,
        display: 'flex',
        flexDirection: 'column',
        gap: primitive.space[2],
      }}
    >
      <span style={{ fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>{label}</span>
      <span style={{ fontSize: primitive.fontSize['3xl'], fontWeight: 600, color: themeVar.textPrimary }}>{value}</span>
      {/* Colour is never the only signal (Â§66) â€” every tile carries a text label too. */}
      <StatusBadge kind={kind} label={hint} />
    </div>
  );
}

export default async function Dashboard() {

  // FIRST STATEMENT. Behaviour-neutral TODAY â€” `/home/dashboard` appears in the
  // workspace default tree and in all four role trees, so nobody who can reach
  // this app is refused by it. It is here because this is a CONCRETE page, which
  // Next resolves ahead of the catch-all, so it carries no route check of its
  // own unless it makes one (T-0005 finding 4). The day a role tree drops the
  // dashboard, this page would otherwise stay reachable by URL and nothing would
  // have said so.
  //
  // The route is written as a LITERAL rather than `THIS_ROUTE`, which is less
  // DRY on purpose: `check-page-gates.sh` derives the expected path from the
  // file's own location and matches it in the source, so that a page copied into
  // a new folder cannot keep the old gate. A constant would be opaque to that
  // check and would quietly turn the guardrail into a no-op for this file.
  await requireNavRoute('workshop', '/home/dashboard');

  // âš ï¸ AFTER `requireNavRoute`, DELIBERATELY. The nav gate is documented as the
  // first statement before any data access, and onboarding is data access: it
  // asks the API who the caller is. A page that answered "create your
  // workshop" to somebody whose role tree does not contain this route would be
  // rendering content behind a gate it never opened.
  // THE ONBOARDING SCREEN LIVES HERE, NOT IN THE LAYOUT.
  //
  // It belongs on the page whose emptiness it explains. In the layout it
  // replaced EVERY page â€” including `/`, which is the public parts marketplace
  // and the free VIN search â€” so a signed-in account with no workshop asked for
  // the landing and was handed a form instead. A public front door that
  // disappears once you have an account is not a front door.
  //
  // Rendered IN PLACE rather than as a redirect: a redirect needs a second
  // condition on the onboarding route to send finished users back, and two
  // conditions are free to disagree. That is a redirect loop on the first
  // screen a new user reaches, escapable only by clearing cookies.
  if (await viewerHasSession('workshop')) {
    const registration = await registrationStatus('workshop');
    if (needsWorkshop(registration)) {
      return <CreateWorkshopScreen displayName={registration?.displayName} />;
    }
  }

  const nav = await describeNavigation();

  // REAL FIGURES. Same endpoint the staging board reads, so the counts inherit
  // its tenant and role scoping rather than re-deriving it here.
  const jobCards = await apiGet<JobCardRow[]>('workshop', '/job-cards');
  const cards = jobCards.ok ? jobCards.data : [];
  const count = (pred: (c: JobCardRow) => boolean) => cards.filter(pred).length;

  const tiles: TileSpec[] = [
    {
      label: 'Active job cards',
      value: count((c) => OPEN_STAGES.has(c.stage)),
      kind: 'active',
      hint: 'Live work on the board',
    },
    {
      label: 'Awaiting customer approval',
      value: count((c) => c.stage === 'awaiting_customer_approval'),
      kind: 'attention',
      hint: 'Quotation sent, no answer yet',
    },
    {
      label: 'New complaints',
      value: count((c) => c.stage === 'complaint_received'),
      kind: 'attention',
      // NOT "today" â€” the stage says a complaint is unprocessed, not when it
      // arrived, and claiming a timeframe the data does not carry is the same
      // defect as an invented number.
      hint: 'Received and not yet started',
    },
    {
      label: 'Ready for collection',
      value: count((c) => c.stage === 'ready_for_collection'),
      kind: 'complete',
      hint: 'Passed quality control',
    },
    {
      label: 'On hold',
      value: count((c) => c.stage === 'on_hold'),
      kind: 'blocked',
      hint: 'Parked â€” needs a decision',
    },
    {
      label: 'In quality control',
      value: count((c) => c.stage === 'quality_control'),
      kind: 'active',
      hint: 'Being checked before release',
    },
  ];

  return (
    <>
      <PageHeader
        title={nav.pageTitle}
        description="Live figures from the job-card board."
      />

      {/*
        âš ï¸ SAYS SO WHEN IT COULD NOT ASK, rather than rendering six zeroes.
        Six zeroes is a claim â€” "you have no work" â€” and it is the wrong one
        when the truth is that the request failed. A quiet zero on a dashboard
        is how a workshop misses a job that is waiting.
      */}
      {!jobCards.ok && (
        <p
          role="alert"
          style={{
            border: `1px solid ${themeVar.borderDefault}`,
            borderRadius: primitive.radius.lg,
            padding: primitive.space[3],
            marginBottom: primitive.space[4],
            color: themeVar.textSecondary,
          }}
        >
          These figures could not be loaded, so every count below reads zero. That is a
          connection problem, not an empty workshop â€” open the job cards board to check.
        </p>
      )}

      <section
        aria-label="Key figures"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(15rem, 1fr))',
          gap: primitive.space[4],
        }}
      >
        {tiles.map((t) => (
          <Tile key={t.label} {...t} />
        ))}
      </section>

      <section
        aria-label="About this build"
        style={{
          border: `1px solid ${themeVar.borderDefault}`,
          borderRadius: primitive.radius.lg,
          padding: primitive.space[4],
          background: themeVar.backgroundSecondary,
        }}
      >
        <h2 style={{ margin: 0, fontSize: primitive.fontSize.lg, color: themeVar.textPrimary }}>
          What is real in this build
        </h2>
        <ul style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm, lineHeight: 1.7 }}>
          <li>
            {/* DERIVED for the same reason as the permissions line below: the
                counts used to be written out as "11 groups, 55 items" and went
                wrong the moment T-0027 gave this workspace a per-role tree. */}
            <strong>Navigation is real and complete.</strong> Every group and item is transcribed from the
            approved specification â€” <code>autoworkshop 01 (1).txt</code> Â§34 for the workspace, and{' '}
            <code>autoworkshop 07.txt</code> part 2 Â§46â€“Â§49 for the four workshop roles. You are seeing the{' '}
            <strong>{nav.roleLabel}</strong> navigation: {nav.groupCount} groups, {nav.itemCount} items.
            Expand, collapse, search the menu, and collapse the whole sidebar from the â˜° button.
          </li>
          <li>
            {/* DERIVED, never restated. This sentence used to name the granted
                permissions as literal text, and it went false the moment the
                demo grants changed â€” describing visible finance items that were
                by then correctly hidden. A page that explains the permission
                model must read the permission model, or it becomes confident
                misinformation. Same lesson as the nav/router grants split. */}
            <strong>Permission-aware visibility is real.</strong>{' '}
            {nav.grants.length === 0 ? (
              <>
                {/* The signed-out wording is not a nicety. The old sentence read
                    "This viewer holds , so only the groups those grants unlock
                    are listed" once the grants became genuinely empty â€” a
                    dangling clause that describes nothing. An empty grant list
                    is now the common case, not an edge one: it is what every
                    visitor sees before signing in. */}
                This viewer holds <strong>no permission grants</strong>
                {nav.signedIn
                  ? ' â€” this role has none assigned yet.'
                  : ', because nobody is signed in.'}{' '}
                Only ungated modules are listed; everything gated is absent from the menu
              </>
            ) : (
              <>
                This viewer holds{' '}
                {nav.grants.map((grant, i, all) => (
                  <span key={grant}>
                    <code>{grant}</code>
                    {i < all.length - 1 ? ' and ' : ''}
                  </span>
                ))}
                , so only the groups those grants unlock are listed. Modules gated behind any other
                permission â€” the finance items among them â€” are absent from the menu
              </>
            )}{' '}
            <em>and</em> answer 404 if their URL is typed directly.
          </li>
          <li>
            <strong>Counters and warning badges are real mechanics, fake numbers.</strong> They resolve through the
            same code path the API will use.
          </li>

 succeeded in 1608ms:
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';
import { optionalText, requireOneOf, requireText, requireUuid } from '../core/validate';
import {
  CAN_PREPARE_PROPOSAL,
  CAN_DECIDE_AS_CUSTOMER,
  CAN_READ_PROPOSAL,
  CAN_RECORD_DECISION,
  DECISION_CHANNELS,
  PROPOSAL_DECISIONS,
  PROPOSAL_OPTIONS,
  PROPOSAL_STAGES,
  REQUIRED_QUOTATION_STATUS,
  decisionChannelLabel,
  type DecisionChannel,
  type ProposalDecision,
  type ProposalOption,
  type ProposalStatus,
} from './proposal-rules';

/**
 * What Â§410-Â§422 says the customer must be shown, gathered from the records that
 * already hold it.
 *
 * âš ï¸ EVERY FIELD HERE IS READ, NEVER COPIED. Each source is already immutable by the
 * time a proposal can exist â€” a submitted inspection (010), an approved diagnosis
 * (012), an approved plan (014), an approved quotation (016). Snapshotting them onto
 * the proposal would create a second version of a fact that can never change, and a
 * second thing to keep in step.
 */
/**
 * The workshop's own identity, as it appears at the head of a document it issues.
 *
 * Every field is optional â€” a workshop that has configured nothing still gets a usable
 * document, and the renderer omits the lines it has nothing for rather than printing
 * blanks. `name` always resolves, falling back to the platform's record.
 */
export interface IssuerIdentity {
  name: string;
  legalName: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  taxIdentificationNumber: string | null;
  vatRegistrationNumber: string | null;
  documentFooter: string | null;
}

/** Who the document is addressed to. */
export interface AddresseeIdentity {
  name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
}

export interface ProposalPresentation {
  /** Â§410 â€” what was reported. */
  complaint: string;
  /** Â§412 â€” what was inspected. */
  inspectionSummary: string | null;
  inspectionCheckedCount: number;
  /** Â§414 â€” what was confirmed. */
  confirmedFaults: Array<{ id: string; faultDescription: string; faultCode: string | null }>;
  /**
   * Â§416 â€” WHAT REMAINS SUSPECTED.
   *
   * The field most likely to be dropped and the one Â§416 names explicitly: a customer
   * agreeing to a repair is entitled to know what the workshop has NOT established, or
   * the first unexpected extra reads as incompetence rather than as a stated unknown.
   */
  suspectedFaults: Array<{ id: string; faultDescription: string; faultCode: string | null }>;
  /** Â§418's proposed work â€” the approved plan's tasks. */
  proposedWork: Array<{ id: string; title: string; estimatedLabourHours: number | null }>;
  /** Â§418's proposed parts. */
  proposedParts: Array<{ id: string; description: string; quantity: number; unitPrice: number }>;
  /** Â§420 â€” how long it should take, summed from the plan. */
  estimatedLabourHours: number;
  /** Â§420 â€” what it will cost. */
  currency: string;
  recommendedTotal: number;
  comprehensiveTotal: number;
  /** Â§422 â€” what warranty applies. */
  warrantyTerms: string | null;
  completionConditions: string | null;
  validUntil: string | null;
  /** The letterhead â€” who is making this offer. */
  issuer: IssuerIdentity;
  /** The addressee â€” who it is made to. */
  addressee: AddresseeIdentity;
  /**
   * The document's own reference.
   *
   * A commercial document a customer may quote back at the workshop needs an
   * identifier that is short, human-readable and stable. Derived from the job number
   * and the version rather than stored, because both are already immutable and a
   * stored copy could only drift from them.
   */
  documentReference: string;
  vehicleDescription: string;
}

export interface RepairProposal {
  id: string;
  jobCardId: string;
  jobNumber: string;
  registrationNumber: string;
  customerName: string;
  quotationId: string;
  quotationAttemptNo: number;
  versionNo: number;
  status: ProposalStatus;
  expectedResult: string | null;
  riskAndLimitations: string | null;
  uncertainties: string | null;
  presentationNote: string | null;
  issuedByName: string | null;
  issuedAt: string | null;
  decision: ProposalDecision | null;
  approvedOption: ProposalOption | null;
  decidedAt: string | null;
  decidedByName: string | null;
  decisionChannel: DecisionChannel | string | null;
  decisionChannelLabel: string | null;
  decisionNote: string | null;
  recordedByName: string | null;
  supersededBy: string | null;
  presentation: ProposalPresentation;
  /** Â§7 â€” the total the customer actually agreed to, once they have. */
  agreedTotal: number | null;
  editable: boolean;
  issuable: boolean;
  decidable: boolean;
}

interface NarrativeInput {
  expectedResult?: string | null;
  riskAndLimitations?: string | null;
  uncertainties?: string | null;
  presentationNote?: string | null;
}

/**
 * The customer proposal â€” `1.txt` Â§396-Â§424, `07.txt` Â§7.
 *
 * â”€â”€ Â§424 IS THE WHOLE SLICE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 * "Approved proposals shall be immutable. A material change shall create a new
 * version requiring new approval." Everything here follows from that sentence:
 *
 *   Â· A decided proposal cannot be edited â€” in the service AND by trigger. The only
 *     writable field left on it is `superseded_by`, because recording the
 *     supersession would otherwise require breaking the immutability that makes
 *     versioning necessary in the first place.
 *   Â· `prepare()` on a card whose latest proposal is already decided creates
 *     VERSION n+1 and links the old row to it, rather than reopening anything.
 *   Â· An ISSUED proposal freezes too. A document that changes while the customer is
 *     reading it is a different offer from the one they say yes to.
 *
 * â”€â”€ WHY THE PRESENTATION IS ASSEMBLED, NOT STORED â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 * Â§410-Â§422 lists twelve things the customer must see, and ten already exist in
 * records that are frozen before a proposal can be created. They are read at display
 * time from the exact quotation, plan, diagnosis and inspection the proposal names â€”
 * so the document is reproducible forever without a single copied field.
 */
@Injectable()
export class ProposalService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async listForJobCard(ctx: TenantContext, jobCardId: string): Promise<RepairProposal[]> {
    this.assertMayRead(ctx);
    const cardId = requireUuid(jobCardId, 'jobCardId');
    return this.db.withTenant(ctx, async (client) => {
      // 404 for a card this viewer cannot see, BEFORE any proposal is read.
      await this.assertCardVisible(client, ctx, cardId);
      return this.readProposals(client, ctx, { jobCardId: cardId });
    });
  }

  async list(ctx: TenantContext): Promise<RepairProposal[]> {
    this.assertMayRead(ctx);
    return this.db.withTenant(ctx, (client) => this.readProposals(client, ctx, {}));
  }

  async findById(ctx: TenantContext, id: string): Promise<RepairProposal> {
    this.assertMayRead(ctx);
    const proposalId = requireUuid(id, 'id');
    return this.db.withTenant(ctx, async (client) => {
      const rows = await this.readProposals(client, ctx, { proposalId });
      return ProposalService.one(rows);
    });
  }

  /**
   * Draft a proposal from the approved quotation â€” or, when the last one has been
   * decided, Â§424's NEW VERSION of it.
   */
  async prepare(ctx: TenantContext, jobCardId: string): Promise<RepairProposal> {
    this.assertMayPrepare(ctx);
    const cardId = requireUuid(jobCardId, 'jobCardId');

    return this.db.withTenant(ctx, async (client) => {
      const card = await this.assertCardVisible(client, ctx, cardId, { lock: true });

      if (!PROPOSAL_STAGES.includes(card.stage)) {
        throw new BadRequestException(
          `a proposal may only be prepared while the job card is at ` +
            `${PROPOSAL_STAGES.map((s) => `'${s}'`).join(' or ')}; this card is at ` +
            `'${card.stage}'. Move the card to '${PROPOSAL_STAGES[0]}' first.`,
        );
      }

      // â”€â”€ one UNDECIDED proposal at a time â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const openRow = await client.query(
        `SELECT id, status, version_no FROM repair.repair_proposals
          WHERE job_card_id = $1 AND tenant_id = $2
            AND status IN ('draft', 'issued')
          ORDER BY version_no DESC LIMIT 1`,
        [cardId, ctx.tenantId],
      );
      const open = openRow.rows[0] as { id: string; status: string; version_no: number } | undefined;
      if (open) {
        throw new ConflictException(
          open.status === 'draft'
            ? `version ${open.version_no} of this proposal is still a draft; issue it or finish it before starting another`
            : `version ${open.version_no} is with the customer and has not been answered; ` +
              'record their decision before issuing a new version',
        );
      }

      // The version this one replaces, if any. Â§424: a material change creates a NEW
      // version, so the previous decided row is marked superseded rather than edited.
      const previousRow = await client.query(
        `SELECT id, version_no, status FROM repair.repair_proposals
          WHERE job_card_id = $1 AND tenant_id = $2
          ORDER BY version_no DESC LIMIT 1`,
        [cardId, ctx.tenantId],
      );
      const previous = previousRow.rows[0] as
        | { id: string; version_no: number; status: string }
        | undefined;

      // âš ï¸ AN APPROVED PROPOSAL IS NOT SUPERSEDED SILENTLY. Once a customer has
      // agreed, replacing that agreement is a commercial act, and Â§7 says repair work
      // shall not start until the required approval is received â€” so a new version
      // must be a deliberate re-quote, not a side effect of pressing a button on a
      // job that is already authorised.
      if (previous?.status === 'approved') {
        throw new ConflictException(
          `version ${previous.version_no} has been APPROVED by the customer. A material ` +
            'change needs a new quotation first, which is then proposed as a new version â€” ' +
            'prepare a fresh quotation on the Quotations screen.',
        );
      }

      const quotationRow = await client.query(
        `SELECT id, attempt_no FROM repair.quotations
          WHERE job_card_id = $1 AND tenant_id = $2 AND organization_id = $3
            AND status = $4
          ORDER BY attempt_no DESC LIMIT 1`,
        [cardId, ctx.tenantId, ctx.organizationId, REQUIRED_QUOTATION_STATUS],
      );
      const quotation = quotationRow.rows[0] as { id: string; attempt_no: number } | undefined;
      if (!quotation) {
        // The refusal names a route that exists: the quotation queue is where a price
        // is both prepared and internally approved.
        throw new ConflictException(
          'a proposal presents an APPROVED quotation, and this job card has none. ' +
            'Prepare a quotation and have a manager approve it on the Quotations screen first.',
        );
      }

      const nextVersion = (previous?.version_no ?? 0) + 1;

      const inserted = await client.query(
        `INSERT INTO repair.repair_proposals
           (tenant_id, organization_id, job_card_id, quotation_id, version_no,
            created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$6)
         RETURNING id`,
        [ctx.tenantId, ctx.organizationId, cardId, quotation.id, nextVersion, ctx.userId],
      );
      const proposalId = inserted.rows[0].id as string;

      // Link the version it replaces. Done AFTER the insert because the new id is what
      // the old row points at, and the trigger permits exactly this one write on a
      // decided row.
      if (previous && previous.status !== 'superseded') {
        await client.query(
          `UPDATE repair.repair_proposals
              SET superseded_by = $1, status = 'superseded', updated_at = now(), updated_by = $2
            WHERE id = $3 AND tenant_id = $4`,
          [proposalId, ctx.userId, previous.id, ctx.tenantId],
        );
      }

      await this.audit.write(client, ctx, {
        action: 'proposal.prepared',
        resourceType: 'proposal',
        resourceId: proposalId,
        detail: {
          jobNumber: card.job_number,
          versionNo: nextVersion,
          quotationAttemptNo: quotation.attempt_no,
          supersedes: previous?.version_no ?? null,
        },
      });

      const rows = await this.readProposals(client, ctx, { proposalId });
      return ProposalService.one(rows);
    });
  }

  /** Â§418's expected result, Â§422's risks and uncertainties. */
  async recordNarrative(
    ctx: TenantContext,
    proposalId: string,
    input: NarrativeInput,
  ): Promise<RepairProposal> {
    this.assertMayPrepare(ctx);
    const id = requireUuid(proposalId, 'id');

    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown): void => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    // Column names come from these literals and NEVER from the request.
    this.nullableText(set, 'expected_result', input.expectedResult, 'expectedResult', 8000);
    this.nullableText(set, 'risk_and_limitations', input.riskAndLimitations, 'riskAndLimitations', 8000);
    this.nullableText(set, 'uncertainties', input.uncertainties, 'uncertainties', 8000);
    this.nullableText(set, 'presentation_note', input.presentationNote, 'presentationNote', 8000);

    if (sets.length === 0) throw new BadRequestException('nothing to update');
    set('updated_by', ctx.userId);
    sets.push('updated_at = now()');

    values.push(id, ctx.tenantId);
    const sql = `UPDATE repair.repair_proposals SET ${sets.join(', ')}
                  WHERE id = $${values.length - 1} AND tenant_id = $${values.length}`;

    return this.db.withTenant(ctx, async (client) => {
      const proposal = await this.assertDraft(client, ctx, id);
      await client.query(sql, values);
      await this.audit.write(client, ctx, {
        action: 'proposal.narrative_recorded',
        resourceType: 'proposal',
        resourceId: id,
        detail: { jobNumber: proposal.job_number, versionNo: proposal.version_no },
      });
      const rows = await this.readProposals(client, ctx, { proposalId: id });
      return ProposalService.one(rows);
    });
  }

  /**
   * Put the proposal in front of the customer.
   *
   * âš ï¸ THE GATE IS Â§418, NOT A FORMALITY. A proposal that does not say what the work
   * should ACHIEVE is a price with no promise attached, and it is the one thing on
   * Â§410-Â§422's list that no other record can supply â€” the complaint, the findings,
   * the tasks and the totals are all read from frozen sources, but "what this will fix
   * for you" exists nowhere until somebody writes it.
   */
  async issue(ctx: TenantContext, proposalId: string): Promise<RepairProposal> {
    this.assertMayPrepare(ctx);
    const id = requireUuid(proposalId, 'id');

    return this.db.withTenant(ctx, async (client) => {
      const proposal = await this.assertDraft(client, ctx, id);

      const current = ProposalService.one(await this.readProposals(client, ctx, { proposalId: id }));
      if (current.expectedResult === null) {
        throw new BadRequestException(
          'a proposal cannot be issued without saying what the work should achieve (Â§418). ' +
            'Record the expected result first.',
        );
      }

      await client.query(
        `UPDATE repair.repair_proposals
            SET status = 'issued', issued_by = $1, issued_at = now(),
                updated_at = now(), updated_by = $1
          WHERE id = $2 AND tenant_id = $3`,
        [ctx.userId, id, ctx.tenantId],
      );

      await this.audit.write(client, ctx, {
        action: 'proposal.issued',
        resourceType: 'proposal',
        resourceId: id,
        // The money the customer is being shown, so the trail records the offer as
        // made rather than only that an offer happened.
        detail: {
          jobNumber: proposal.job_number,
          versionNo: proposal.version_no,
          currency: current.presentation.currency,
          recommendedTotal: current.presentation.recommendedTotal,
          comprehensiveTotal: current.presentation.comprehensiveTotal,
          suspectedFaultsDisclosed: current.presentation.suspectedFaults.length,
        },
      });

      const rows = await this.readProposals(client, ctx, { proposalId: id });
      return ProposalService.one(rows);
    });
  }

  /**
   * Â§7 â€” record the customer's answer.
   *
   * â”€â”€ THE ATTRIBUTION IS THE RECORD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   *
   * `decidedByName` is the CUSTOMER and is mandatory; `recorded_by` is the staff
   * member who captured it, taken from the session and never from the request. Those
   * are two different facts, and an approval that conflates them cannot answer "who
   * agreed to this" when a customer later says they did not.
   *
   * The channel is mandatory too. Â§7 offers telephone and video consultation, so a
   * decision frequently arrives off-system â€” and "approved" with no channel is an
   * assertion rather than a record.
   */
  async recordDecision(
    ctx: TenantContext,
    proposalId: string,
    input: {
      decision?: string;
      approvedOption?: string;
      decidedByName?: string;
      decisionChannel?: string;
      note?: string;
    },
  ): Promise<RepairProposal> {
    this.assertMayRecordDecision(ctx);
    const id = requireUuid(proposalId, 'id');
    const decision: ProposalDecision = requireOneOf(input.decision, PROPOSAL_DECISIONS, 'decision');
    const channel: DecisionChannel = requireOneOf(
      input.decisionChannel, DECISION_CHANNELS, 'decisionChannel',
    );
    const decidedByName = requireText(input.decidedByName, 'decidedByName', 300);
    const note = optionalText(input.note, 'note', 8000);

    // Â§7's five "request" actions all arrive as `changes_requested`, and the note is
    // what says which. A decline with no reason leaves the workshop nothing to act on.
    if (decision !== 'approved' && note === null) {
      throw new BadRequestException(
        decision === 'declined'
          ? 'a declined proposal must record why; note is required'
          : 'say what the customer asked to change, or what they want explained; note is required',
      );
    }

    const approvedOption: ProposalOption | null =
      decision === 'approved'
        ? requireOneOf(input.approvedOption, PROPOSAL_OPTIONS, 'approvedOption')
        : null;

    return this.db.withTenant(ctx, async (client) => {
      const found = await client.query(
        `SELECT p.id, p.status, p.version_no, j.job_number
           FROM repair.repair_proposals p
           JOIN repair.job_cards j ON j.id = p.job_card_id AND j.tenant_id = p.tenant_id
          WHERE p.id = $1 AND p.tenant_id = $2 AND p.organization_id = $3
          -- Serialises two people recording an answer to the same proposal, so the
          -- second reads the status the first committed.
          FOR UPDATE OF p`,
        [id, ctx.tenantId, ctx.organizationId],
      );
      const row = found.rows[0] as
        | { id: string; status: ProposalStatus; version_no: number; job_number: string }
        | undefined;
      // 404, not 403 â€” the non-oracle rule this codebase holds everywhere.
      if (!row) throw new NotFoundException('proposal not found');

      if (row.status === 'draft') {
        throw new ConflictException(
          'this proposal has not been issued to the customer yet, so there is no decision to record',
        );
      }
      if (row.status !== 'issued') {
        throw new ConflictException(
          `version ${row.version_no} was already ${row.status}; Â§424 requires a new version ` +
            'for a material change, and a further answer belongs to that version',
        );
      }

      await client.query(
        `UPDATE repair.repair_proposals
            SET status = $1, decision = $1, approved_option = $2,
                decided_at = now(), decided_by_name = $3, decision_channel = $4,
                decision_note = $5, recorded_by = $6,
                updated_at = now(), updated_by = $6
          WHERE id = $7 AND tenant_id = $8`,
        [decision, approvedOption, decidedByName, channel, note, ctx.userId, id, ctx.tenantId],
      );

      await this.audit.write(client, ctx, {
        action:
          decision === 'approved'
            ? 'proposal.approved_by_customer'
            : decision === 'declined'
              ? 'proposal.declined_by_customer'
              : 'proposal.changes_requested',
        resourceType: 'proposal',
        resourceId: id,
        // The channel and the option, never the customer's free text. This is the
        // entry a dispute over authorisation is settled from.
        detail: {
          jobNumber: row.job_number,
          versionNo: row.version_no,
          decision,
          approvedOption,
          channel,
        },
      });

      const rows = await this.readProposals(client, ctx, { proposalId: id });
      return ProposalService.one(rows);
    });
  }


  /**
   * Â§7 â€” the customer records their OWN answer, from the customer workspace.
   *
   * â”€â”€ WHY THIS IS A SEPARATE ROUTE AND NOT A FLAG ON `recordDecision` â”€â”€â”€â”€â”€â”€â”€â”€
   *
   * `recordDecision` is written for STAFF CAPTURE: a customer answers by phone,
   * a staff member types it in, and the record keeps those two people apart â€”
   * `decided_by_name` is the customer, `recorded_by` is whoever took the call.
   * That separation is the entire evidential value of the row.
   *
   * When the customer decides in the portal there is no intermediary, and three
   * of that method's inputs stop being inputs at all:
   *
   *   Â· `decidedByName`   â€” IS the session. Accepting it from the body would let
   *                         a customer approve under somebody else's name, which
   *                         is the confused-deputy shape `1.txt` Â§9 forbids.
   *   Â· `decisionChannel` â€” is `customer_portal` by construction. Taking it from
   *                         the request would let the strongest form of approval
   *                         be filed as a phone call nobody can check.
   *   Â· `recorded_by`     â€” is the customer themselves.
   *
   * A boolean on the existing method would have left all three settable and
   * relied on a caller passing the right combination. These are DERIVED here,
   * so there is no combination to get wrong.
   *
   * âš ï¸ THE ROLE CHECK IS NOT THE SCOPE CHECK. `CAN_DECIDE_AS_CUSTOMER` says a
   * customer may use this route; `assertCardVisible` with the `c.user_id`
   * predicate is what stops them deciding on somebody else's proposal. Both are
   * required, and RLS is under both.
   */
  async recordCustomerDecision(
    ctx: TenantContext,
    proposalId: string,
    input: { decision?: string; approvedOption?: string; note?: string },
  ): Promise<RepairProposal> {
    if (!CAN_DECIDE_AS_CUSTOMER.has(ctx.activeRole)) {
      throw new ForbiddenException(
        `role '${ctx.activeRole}' may not decide as the customer; staff use POST /proposals/:id/decision`,
      );
    }
    const id = requireUuid(proposalId, 'id');
    const decision: ProposalDecision = requireOneOf(input.decision, PROPOSAL_DECISIONS, 'decision');
    const note = optionalText(input.note, 'note', 8000);

    // Identical rule to the staff route, deliberately restated rather than
    // relaxed: a refusal with no reason leaves the workshop nothing to act on,
    // and it is no less true because the customer typed it themselves.
    if (decision !== 'approved' && note === null) {
      throw new BadRequestException(
        decision === 'declined'
          ? 'a declined proposal must record why; note is required'
          : 'say what you would like changed or explained; note is required',
      );
    }

    const approvedOption: ProposalOption | null =
      decision === 'approved'
        ? requireOneOf(input.approvedOption, PROPOSAL_OPTIONS, 'approvedOption')
        : null;

    return this.db.withTenant(ctx, async (client) => {
      // The proposal, its card, and the customer's OWN name â€” all in one read,
      // and all constrained to a card this customer owns. `c.user_id` is the
      // scope; `c.display_name` is the attribution, taken from the customer
      // record rather than from the request.
      const found = await client.query(
        `SELECT p.id, p.status, p.version_no, j.job_number, c.display_name
           FROM repair.repair_proposals p
           JOIN repair.job_cards j ON j.id = p.job_card_id AND j.tenant_id = p.tenant_id
           JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
          WHERE p.id = $1 AND p.tenant_id = $2 AND p.organization_id = $3
            AND c.user_id = $4
          FOR UPDATE OF p`,
        [id, ctx.tenantId, ctx.organizationId, ctx.userId],
      );
      const row = found.rows[0] as
        | { id: string; status: ProposalStatus; version_no: number; job_number: string; display_name: string }
        | undefined;
      // 404, not 403 â€” the non-oracle rule this codebase holds everywhere. A
      // customer must not be able to learn that somebody else's proposal exists.
      if (!row) throw new NotFoundException('proposal not found');

      if (row.status === 'draft') {
        throw new ConflictException(
          'this proposal has not been sent to you yet, so there is nothing to answer',
        );
      }
      if (row.status !== 'issued') {
        throw new ConflictException(
          `you already answered version ${row.version_no} (${row.status}). If something has ` +
            'changed, ask the workshop to send a revised proposal',
        );
      }

      await client.query(
        `UPDATE repair.repair_proposals
            SET status = $1, decision = $1, approved_option = $2,
                decided_at = now(), decided_by_name = $3, decision_channel = 'customer_portal',
                decision_note = $4, recorded_by = $5,
                updated_at = now(), updated_by = $5
          WHERE id = $6 AND tenant_id = $7`,
        [decision, approvedOption, row.display_name, note, ctx.userId, id, ctx.tenantId],
      );

      await this.audit.write(client, ctx, {
        action:
          decision === 'approved'
            ? 'proposal.approved_by_customer'
            : decision === 'declined'
              ? 'proposal.declined_by_customer'
              : 'proposal.changes_requested',
        resourceType: 'proposal',
        resourceId: id,
        // `selfService: true` is the fact that distinguishes this entry from the
        // staff-captured one. Same actions, so existing queries keep working;
        // one extra key, so a dispute can tell a portal approval from a phone
        // call written down afterwards.
        detail: {
          jobNumber: row.job_number,
          versionNo: row.version_no,
          decision,
          approvedOption,
          channel: 'customer_portal',
          selfService: true,
        },
      });

      const rows = await this.readProposals(client, ctx, { proposalId: id });
      return ProposalService.one(rows);
    });
  }

  // â”€â”€ reads â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Assembles Â§410-Â§422's document from the frozen records behind it.
   *
   * Five queries for any number of proposals, never one per row.
   */
  private async readProposals(
    client: Client,
    ctx: TenantContext,
    filter: { jobCardId?: string; proposalId?: string },
  ): Promise<RepairProposal[]> {
    const headers = await client.query(
      `SELECT p.id, p.job_card_id, j.job_number, j.complaint, v.registration_number,
              c.display_name AS customer_name,
              c.email AS customer_email, c.phone AS customer_phone,
              c.location AS customer_location,
              o.name AS org_name,
              op.legal_name, op.trading_name, op.address AS org_address,
              op.city AS org_city, op.country AS org_country,
              op.phone AS org_phone, op.email AS org_email, op.website AS org_website,
              op.tax_identification_number, op.vat_registration_number,
              op.document_footer,
              mk.name AS make_name, md.name AS model_name, v.model_year,
              p.quotation_id, q.attempt_no AS quotation_attempt_no,
              q.currency, q.warranty_terms, q.completion_conditions, q.valid_until,
              q.repair_plan_id,
              p.version_no, p.status, p.expected_result, p.risk_and_limitations,
              p.uncertainties, p.presentation_note,
              p.issued_at, p.decision, p.approved_option, p.decided_at,
              p.decided_by_name, p.decision_channel, p.decision_note, p.superseded_by,
              ib.display_name AS issued_by_name,
              rb.display_name AS recorded_by_name,
              -- The money, read from the exact quotation this proposal names.
              (SELECT COALESCE(sum(l.line_total), 0) FROM repair.quotation_lines l
                WHERE l.quotation_id = q.id AND l.tenant_id = q.tenant_id
                  AND l.is_optional = false) AS chargeable_total,
              (SELECT COALESCE(sum(l.line_total), 0) FROM repair.quotation_lines l
                WHERE l.quotation_id = q.id AND l.tenant_id = q.tenant_id
                  AND l.is_optional = true) AS optional_total,
              q.discount_amount, q.tax_rate_percent,
              -- Â§420 â€” how long it should take.
              (SELECT COALESCE(sum(t.estimated_labour_hours), 0) FROM repair.repair_plan_tasks t
                WHERE t.plan_id = q.repair_plan_id AND t.tenant_id = q.tenant_id) AS plan_hours,
              -- Â§412 â€” what was inspected. The latest submitted sheet on this card.
              (SELECT i.summary FROM repair.inspections i
                WHERE i.job_card_id = j.id AND i.tenant_id = j.tenant_id
                  AND i.status <> 'in_progress'
                ORDER BY i.attempt_no DESC LIMIT 1) AS inspection_summary,
              (SELECT count(*)::int FROM repair.inspection_items ii
                JOIN repair.inspections i2 ON i2.id = ii.inspection_id AND i2.tenant_id = ii.tenant_id
               WHERE i2.job_card_id = j.id AND i2.tenant_id = j.tenant_id
                 AND i2.status <> 'in_progress' AND ii.result IS NOT NULL) AS inspection_checked
         FROM repair.repair_proposals p
         JOIN repair.job_cards j ON j.id = p.job_card_id AND j.tenant_id = p.tenant_id
         JOIN core.vehicles v ON v.id = j.vehicle_id AND v.tenant_id = j.tenant_id
         -- The make and model are reference tables, not columns. LEFT on the model
         -- because 004 allows a vehicle whose exact model is unknown.
         LEFT JOIN core.vehicle_makes mk ON mk.id = v.make_id
         LEFT JOIN core.vehicle_models md ON md.id = v.model_id
         JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
         JOIN identity.organizations o ON o.id = p.organization_id
         -- LEFT: a workshop that has configured no letterhead still gets a document.
         LEFT JOIN core.organization_profile op
           ON op.organization_id = p.organization_id AND op.tenant_id = p.tenant_id
         JOIN repair.quotations q ON q.id = p.quotation_id AND q.tenant_id = p.tenant_id
         LEFT JOIN identity.users ib ON ib.id = p.issued_by
         LEFT JOIN identity.users rb ON rb.id = p.recorded_by
        WHERE p.tenant_id = $1
          AND p.organization_id = $2
          AND ($3::uuid IS NULL OR p.job_card_id = $3::uuid)
          AND ($4::uuid IS NULL OR p.id = $4::uuid)
          -- The same narrowing the job card carries: a technician sees the approval
          -- only for a card assigned to them.
          AND ($5::uuid IS NULL OR j.assigned_technician_id = $5::uuid)
          -- ðŸ”´ AND THE CUSTOMER SEES ONLY THEIR OWN. The customer role was added
          -- to CAN_READ_PROPOSAL on 2026-08-04; the role admits the read and
          -- THIS LINE is what scopes it. Without it a customer would receive
          -- every proposal in the organisation â€” prices, contact details and
          -- all â€” because the role check alone says nothing about whose card it
          -- is. Same predicate assertCardVisible already uses.
          --
          -- NO BACKTICKS IN THIS COMMENT. It sits inside a TS template literal,
          -- so a backtick TERMINATES THE STRING and the file stops parsing with
          -- a misleading "',' expected". Four times now.
          AND ($6::uuid IS NULL OR c.user_id = $6::uuid)
        ORDER BY p.version_no DESC`,
      [
        ctx.tenantId, ctx.organizationId,
        filter.jobCardId ?? null, filter.proposalId ?? null,
        ctx.activeRole === 'technician' ? ctx.userId : null,
        ctx.activeRole === 'customer' ? ctx.userId : null,
      ],
    );

    const rows = headers.rows as HeaderRow[];
    if (rows.length === 0) return [];

    const planIds = [...new Set(rows.map((r) => r.repair_plan_id))];
    const quotationIds = [...new Set(rows.map((r) => r.quotation_id))];
    const cardIds = [...new Set(rows.map((r) => r.job_card_id))];

    const [faults, tasks, parts] = await Promise.all([
      // Â§414 and Â§416 â€” confirmed AND suspected, from the diagnosis behind the plan.
      client.query(
        `SELECT p.id AS plan_id, f.id, f.fault_description, f.fault_code, f.finding_status
           FROM repair.repair_plans p
           JOIN repair.diagnostic_findings f
             ON f.diagnosis_id = p.diagnosis_id AND f.tenant_id = p.tenant_id
          WHERE p.id = ANY($1::uuid[]) AND p.tenant_id = $2
            AND f.finding_status IN ('confirmed', 'suspected')
          ORDER BY f.position`,
        [planIds, ctx.tenantId],
      ),
      client.query(
        `SELECT plan_id, id, title, estimated_labour_hours
           FROM repair.repair_plan_tasks
          WHERE plan_id = ANY($1::uuid[]) AND tenant_id = $2
          ORDER BY position`,
        [planIds, ctx.tenantId],
      ),
      client.query(
        `SELECT quotation_id, id, description, quantity, unit_price
           FROM repair.quotation_lines
          WHERE quotation_id = ANY($1::uuid[]) AND tenant_id = $2
            AND line_kind IN ('part', 'consumable')
          ORDER BY position`,
        [quotationIds, ctx.tenantId],
      ),
    ]);
    void cardIds;

    const byPlan = <T>(list: Array<T & { plan_id: string }>): Map<string, T[]> => {
      const m = new Map<string, T[]>();
      for (const r of list) {
        const l = m.get(r.plan_id) ?? [];
        l.push(r);
        m.set(r.plan_id, l);
      }
      return m;
    };
    const faultsByPlan = byPlan(faults.rows as Array<FaultRow & { plan_id: string }>);
    const tasksByPlan = byPlan(tasks.rows as Array<TaskRow & { plan_id: string }>);
    const partsByQuotation = new Map<string, PartRow[]>();
    for (const r of parts.rows as PartRow[]) {
      const l = partsByQuotation.get(r.quotation_id) ?? [];
      l.push(r);
      partsByQuotation.set(r.quotation_id, l);
    }

    return rows.map((row) => {
      const planFaults = faultsByPlan.get(row.repair_plan_id) ?? [];
      const planTasks = tasksByPlan.get(row.repair_plan_id) ?? [];
      const quotationParts = partsByQuotation.get(row.quotation_id) ?? [];

      // âš ï¸ EVERY `numeric` ARRIVES AS A STRING FROM `pg`. Converted at the boundary â€”
      // left alone, the totals below would be string concatenation, which is a wrong
      // price no type error catches.
      const chargeable = Number(row.chargeable_total);
      const optional = Number(row.optional_total);
      const discount = Number(row.discount_amount);
      const taxRate = Number(row.tax_rate_percent);

      // The same arithmetic slice 5 uses, applied to two tiers. Rounded at each step in
      // the currency's minor unit so a displayed total always equals the sum of the
      // lines a customer can read.
      const withTax = (net: number): number => {
        const taxable = Math.max(0, round2(net - discount));
        return round2(taxable + round2((taxable * taxRate) / 100));
      };
      const recommendedTotal = withTax(chargeable);
      const comprehensiveTotal = withTax(round2(chargeable + optional));

      const status = row.status;
      return {
        id: row.id,
        jobCardId: row.job_card_id,
        jobNumber: row.job_number,
        registrationNumber: row.registration_number,
        customerName: row.customer_name,
        quotationId: row.quotation_id,
        quotationAttemptNo: row.quotation_attempt_no,
        versionNo: row.version_no,
        status,
        expectedResult: row.expected_result,
        riskAndLimitations: row.risk_and_limitations,
        uncertainties: row.uncertainties,
        presentationNote: row.presentation_note,
        issuedByName: row.issued_by_name,
        issuedAt: row.issued_at ? row.issued_at.toISOString() : null,
        decision: row.decision,
        approvedOption: row.approved_option,
        decidedAt: row.decided_at ? row.decided_at.toISOString() : null,
        decidedByName: row.decided_by_name,
        decisionChannel: row.decision_channel,
        decisionChannelLabel: row.decision_channel ? decisionChannelLabel(row.decision_channel) : null,
        decisionNote: row.decision_note,
        recordedByName: row.recorded_by_name,
        supersededBy: row.superseded_by,
        presentation: {
          complaint: row.complaint,
          inspectionSummary: row.inspection_summary,
          inspectionCheckedCount: Number(row.inspection_checked ?? 0),
          confirmedFaults: planFaults
            .filter((f) => f.finding_status === 'confirmed')
            .map((f) => ({ id: f.id, faultDescription: f.fault_description, faultCode: f.fault_code })),
          suspectedFaults: planFaults
            .filter((f) => f.finding_status === 'suspected')
            .map((f) => ({ id: f.id, faultDescription: f.fault_description, faultCode: f.fault_code })),
          proposedWork: planTasks.map((t) => ({
            id: t.id,
            title: t.title,
            estimatedLabourHours:
              t.estimated_labour_hours === null ? null : Number(t.estimated_labour_hours),
          })),
          proposedParts: quotationParts.map((p) => ({
            id: p.id,
            description: p.description,
            quantity: Number(p.quantity),
            unitPrice: Number(p.unit_price),
          })),
          estimatedLabourHours: round2(Number(row.plan_hours)),
          currency: row.currency,
          recommendedTotal,
          comprehensiveTotal,
          warrantyTerms: row.warranty_terms,
          completionConditions: row.completion_conditions,
          validUntil: row.valid_until ? row.valid_until.toISOString().slice(0, 10) : null,
          issuer: {
            // The trading name is what a customer recognises; the legal name is who the
            // contract is with. Falls back to the platform's record so the letterhead is
            // never blank.
            name: row.trading_name ?? row.legal_name ?? row.org_name,
            legalName: row.legal_name,
            address: row.org_address,
            city: row.org_city,
            country: row.org_country,
            phone: row.org_phone,
            email: row.org_email,
            website: row.org_website,
            taxIdentificationNumber: row.tax_identification_number,
            vatRegistrationNumber: row.vat_registration_number,
            documentFooter: row.document_footer,
          },
          addressee: {
            name: row.customer_name,
            email: row.customer_email,
            phone: row.customer_phone,
            location: row.customer_location,
          },
          // e.g. PROP-JC-000003-V2 â€” short, human-readable, and derivable forever from
          // two values that can never change.
          documentReference: `PROP-${row.job_number}-V${row.version_no}`,
          vehicleDescription: [row.model_year, row.make_name, row.model_name]
            .filter(Boolean)
            .join(' '),
        },
        // What the customer actually agreed to â€” the figure an invoice is later checked
        // against, and the reason `approved_option` is stored rather than inferred.
        agreedTotal:
          row.approved_option === 'comprehensive'
            ? comprehensiveTotal
            : row.approved_option === 'recommended'
              ? recommendedTotal
              : null,
        editable: status === 'draft' && CAN_PREPARE_PROPOSAL.has(ctx.activeRole),
        issuable: status === 'draft' && CAN_PREPARE_PROPOSAL.has(ctx.activeRole),
        /**
         * ðŸ”´ BOTH ROLE SETS, AND THE SECOND ONE WAS MISSED.
         *
         * `CAN_RECORD_DECISION` is the STAFF set. When `customer` was added to
         * `CAN_READ_PROPOSAL` (2026-08-04) this line was not revisited, so
         * `decidable` evaluated FALSE for every customer â€” and the customer
         * screen shows its approval form only on `decidable`. The whole
         * self-service approval therefore rendered nothing at all, while the
         * service behind it worked and its ten tests passed.
         *
         * Nothing threw. No error appeared. The customer simply saw the old
         * "contact the workshop" fallback, which is exactly what the feature was
         * built to replace â€” a flag reading correct while the mechanism it gates
         * is inert. Found by the security review reading this line, not by any
         * test, because every test exercised the SERVICE and none asked what the
         * viewer was told they could do.
         *
         * âš ï¸ THIS IS A UI AFFORDANCE, NEVER A CONTROL. Both routes re-derive the
         * whole judgement server-side â€” `assertMayRecordDecision` for staff,
         * `CAN_DECIDE_AS_CUSTOMER` plus the `c.user_id` predicate for the
         * customer. Widening this flag grants nobody anything (CLAUDE.md Â§8).
         */
        decidable:
          status === 'issued' &&
          // A SUPERSEDED version is never answerable, even if its status still
          // reads `issued`. The real flow cannot produce that pair â€” prepare()
          // refuses a new version while one is with the customer â€” but the flag
          // costs nothing and offering somebody a decision on a document the
          // workshop has since replaced is the worst kind of control to get
          // wrong. Found while a fixture manufactured exactly that state.
          row.superseded_by === null &&
          (CAN_RECORD_DECISION.has(ctx.activeRole) || CAN_DECIDE_AS_CUSTOMER.has(ctx.activeRole)),
      };
    });
  }

  private async assertCardVisible(
    client: Client,
    ctx: TenantContext,
    cardId: string,
    opts: { lock?: boolean } = {},
  ): Promise<CardRow> {
    const found = await client.query(
      `SELECT j.id, j.job_number, j.stage
         FROM repair.job_cards j
         JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
        WHERE j.id = $1 AND j.tenant_id = $2 AND j.organization_id = $3
          AND ($4::uuid IS NULL OR j.assigned_technician_id = $4::uuid)
          AND ($5::uuid IS NULL OR c.user_id = $5::uuid)
        ${opts.lock ? 'FOR UPDATE OF j' : ''}`,
      [
        cardId, ctx.tenantId, ctx.organizationId,
        ctx.activeRole === 'technician' ? ctx.userId : null,
        ctx.activeRole === 'customer' ? ctx.userId : null,
      ],
    );
    const card = found.rows[0] as CardRow | undefined;
    if (!card) throw new NotFoundException('job card not found');
    return card;
  }

  /**
   * The proposal exists, this viewer may reach it, and it is still a DRAFT.
   *
   * The message names Â§424 by name, because "cannot be changed" without the reason
   * reads as a bug to somebody who has not read the specification.
   */
  private async assertDraft(
    client: Client,
    ctx: TenantContext,
    proposalId: string,
  ): Promise<{ job_number: string; version_no: number }> {
    const found = await client.query(
      `SELECT p.id, p.status, p.version_no, j.job_number
         FROM repair.repair_proposals p
         JOIN repair.job_cards j ON j.id = p.job_card_id AND j.tenant_id = p.tenant_id
        WHERE p.id = $1 AND p.tenant_id = $2 AND p.organization_id = $3
        FOR UPDATE OF p`,
      [proposalId, ctx.tenantId, ctx.organizationId],
    );
    const row = found.rows[0] as
      | { id: string; status: ProposalStatus; version_no: number; job_number: string }
      | undefined;
    if (!row) throw new NotFoundException('proposal not found');
    if (row.status !== 'draft') {
      throw new ConflictException(
        row.status === 'issued'
          ? `version ${row.version_no} is with the customer and its content is frozen; ` +
            'record their decision, then prepare a new version'
          : `version ${row.version_no} is ${row.status}. Â§424: an approved proposal is ` +
            'immutable and a material change requires a NEW VERSION â€” prepare one instead',
      );
    }
    return { job_number: row.job_number, version_no: row.version_no };
  }

  /**
   * Absent leaves it, null/'' clears it, a string sets it.
   *
   * âš ï¸ A NON-STRING IS A 400, NOT A SILENT CLEAR â€” the data-loss regression the
   * Supervisor caught on slice 3b's clear-semantics commit, avoided here by default.
   */
  private nullableText(
    set: (column: string, value: unknown) => void,
    column: string,
    raw: unknown,
    field: string,
    max: number,
  ): void {
    if (raw === undefined) return;
    if (raw === null || raw === '') {
      set(column, null);
      return;
    }
    if (typeof raw !== 'string') {
      throw new BadRequestException(`${field} must be a string, or null to clear it`);
    }
    set(column, optionalText(raw, field, max));
  }

  private static one(rows: RepairProposal[]): RepairProposal {
    const first = rows[0];
    if (!first) throw new NotFoundException('proposal not found');
    return first;
  }

  private assertMayRead(ctx: TenantContext): void {
    if (!CAN_READ_PROPOSAL.has(ctx.activeRole)) {
      throw new ForbiddenException(`role '${ctx.activeRole}' may not read proposals`);
    }
  }

  private assertMayPrepare(ctx: TenantContext): void {
    if (!CAN_PREPARE_PROPOSAL.has(ctx.activeRole)) {
      throw new ForbiddenException(`role '${ctx.activeRole}' may not prepare a customer proposal`);
    }
  }

  private assertMayRecordDecision(ctx: TenantContext): void {
    if (!CAN_RECORD_DECISION.has(ctx.activeRole)) {
      throw new ForbiddenException(
        `role '${ctx.activeRole}' may not record a customer decision`,
      );
    }
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface Client {
  query: (
    text: string,
    values: unknown[],
  ) => Promise<{ rows: unknown[]; rowCount: number | null }>;
}

interface CardRow {
  id: string;
  job_number: string;
  stage: string;
}

interface FaultRow {
  id: string;
  fault_description: string;
  fault_code: string | null;
  finding_status: string;
}

interface TaskRow {
  id: string;
  title: string;
  estimated_labour_hours: string | null;
}

interface PartRow {
  quotation_id: string;
  id: string;
  description: string;
  quantity: string;
  unit_price: string;
}

interface HeaderRow {
  id: string;
  job_card_id: string;
  job_number: string;
  complaint: string;
  registration_number: string;
  customer_name: string;
  quotation_id: string;
  quotation_attempt_no: number;
  currency: string;
  warranty_terms: string | null;
  completion_conditions: string | null;
  valid_until: Date | null;
  repair_plan_id: string;
  version_no: number;
  status: ProposalStatus;
  expected_result: string | null;
  risk_and_limitations: string | null;
  uncertainties: string | null;
  presentation_note: string | null;
  issued_at: Date | null;
  decision: ProposalDecision | null;
  approved_option: ProposalOption | null;
  decided_at: Date | null;
  decided_by_name: string | null;
  decision_channel: DecisionChannel | null;
  decision_note: string | null;
  superseded_by: string | null;
  issued_by_name: string | null;
  recorded_by_name: string | null;
  chargeable_total: string;
  optional_total: string;
  discount_amount: string;
  tax_rate_percent: string;
  plan_hours: string;
  inspection_summary: string | null;
  inspection_checked: number;
  customer_email: string | null;
  customer_phone: string | null;
  customer_location: string | null;
  org_name: string;
  legal_name: string | null;

codex
The implementation log file is not present under `docs`, so I’m using README plus the changed diff and local code behavior. I’m now checking whether the new customer verifier actually targets the customer app and whether the proposal fixture matches the domain constraints.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "repair-proposals|Approve this repair|Send my answer|Nothing is waiting|approvedOption|decisionChannel|recordDecision|proposal" apps/customer-web apps/workshop-web apps/api/src -g "*.tsx" -g "*.ts"' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "CUSTOMER_WEB_URL|WORKSHOP_WEB_URL|customer-web|workshop-web|localhost:3000|3001|3002|PORT" -S docker-compose*.yml apps scripts package.json README.md' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "repair_proposals|CREATE TABLE.*repair_proposals|issued_by|created_by|updated_by|superseded_by|status.*issued|trigger|immutable" infrastructure apps/api -g "*.sql" -g "*.ts"' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "payments/invoices|ModulePage|scheduled for a later phase|not built yet|my-vehicles/garage|requireNavRoute" apps/customer-web apps/workshop-web packages -g "*.tsx" -g "*.ts"' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 2893ms:
apps/api/src\repair\variation.spec.ts:129:      { decision: 'approved', decidedByName: 'Mr Mensah', decisionChannel: 'phone' },
apps/api/src\repair\variation.spec.ts:163:        { decision: 'approved', decidedByName: 'X', decisionChannel: 'carrier_pigeon' },
apps/api/src\repair\variation.service.ts:342:          input.decisionChannel,
apps/api/src\repair\variation.service.ts:398:      decisionChannel: (r['decision_channel'] as string | null) ?? null,
apps/api/src\repair\variation-rules.ts:189:  decisionChannel: string | null;
apps/api/src\repair\variation-rules.ts:218:  const decisionChannel = String(raw['decisionChannel'] ?? '').trim() || null;
apps/api/src\repair\variation-rules.ts:221:  if (decisionChannel !== null && !(DECISION_CHANNELS as readonly string[]).includes(decisionChannel)) {
apps/api/src\repair\variation-rules.ts:229:    if (!decisionChannel) {
apps/api/src\repair\variation-rules.ts:246:  return { decision, decidedByName, decisionChannel, decisionNote };
apps/workshop-web\app\_screens\variations-screen.tsx:57:  decisionChannel: string | null;
apps/workshop-web\app\_screens\variations-screen.tsx:289:        {v.decisionChannel ? ` (${v.decisionChannel.replace('_', ' ')})` : ''}
apps/workshop-web\app\_screens\variation-forms.tsx:214:          <Field label="How did they approve it?" htmlFor="decisionChannel">
apps/workshop-web\app\_screens\variation-forms.tsx:216:              id="decisionChannel"
apps/workshop-web\app\_screens\variation-forms.tsx:217:              name="decisionChannel"
apps/workshop-web\app\_screens\variation-actions.ts:111:      decisionChannel: String(form.get('decisionChannel') ?? ''),
apps/api/src\repair\repair.schemas.ts:52: * diagnoses, repair plans, quotations and proposals. Written once so the four
apps/api/src\repair\repair.schemas.ts:242:// ── proposals ──────────────────────────────────────────────────────────────
apps/api/src\repair\repair.schemas.ts:253: * The customer's decision on a proposal.
apps/api/src\repair\repair.schemas.ts:254: * ⚠️ `decidedByName` and `decisionChannel` are the CONSENT RECORD — slice 7b
apps/api/src\repair\repair.schemas.ts:260:  approvedOption: optionalText(200),
apps/api/src\repair\repair.schemas.ts:262:  decisionChannel: optionalText(60),
apps/api/src\repair\repair.schemas.ts:270: * 🔴 THE ABSENCE OF `decidedByName` AND `decisionChannel` IS THE SECURITY
apps/api/src\repair\repair.schemas.ts:273: * the name from the customer record the proposal hangs off, the channel from
apps/api/src\repair\repair.schemas.ts:288:  approvedOption: optionalText(200),
apps/api/src\repair\repair.module.ts:19:import { ProposalService } from './proposal.service';
apps/api/src\repair\repair.controller.ts:21:import { ProposalService } from './proposal.service';
apps/api/src\repair\repair.controller.ts:81:    private readonly proposals: ProposalService,
apps/api/src\repair\repair.controller.ts:250:  /** The customer proposals for a job card — `1.txt` §396-§424 (slice 6). */
apps/api/src\repair\repair.controller.ts:251:  @Get(':id/proposals')
apps/api/src\repair\repair.controller.ts:256:    return this.proposals.listForJobCard(req.tenantContext, id);
apps/api/src\repair\repair.controller.ts:260:   * Draft a proposal from the approved quotation — or §424's NEW VERSION of it.
apps/api/src\repair\repair.controller.ts:265:  @Post(':id/proposals')
apps/api/src\repair\repair.controller.ts:270:    return this.proposals.prepare(req.tenantContext, id);
apps/api/src\repair\repair.controller.ts:285:   * The service refuses unless an APPROVED customer proposal exists (§7: work shall
apps/api/src\repair\repair.controller.ts:802:@Controller('proposals')
apps/api/src\repair\repair.controller.ts:805:  constructor(private readonly proposals: ProposalService) {}
apps/api/src\repair\repair.controller.ts:813:    return this.proposals.list(req.tenantContext);
apps/api/src\repair\repair.controller.ts:821:    return this.proposals.findById(req.tenantContext, id);
apps/api/src\repair\repair.controller.ts:836:    return this.proposals.recordNarrative(req.tenantContext, id, body ?? {});
apps/api/src\repair\repair.controller.ts:840:   * Put the proposal in front of the customer.
apps/api/src\repair\repair.controller.ts:850:    return this.proposals.issue(req.tenantContext, id);
apps/api/src\repair\repair.controller.ts:860:  recordDecision(
apps/api/src\repair\repair.controller.ts:865:    return this.proposals.recordDecision(req.tenantContext, id, body ?? {});
apps/api/src\repair\repair.controller.ts:873:   * `decisionChannel` and `recorded_by` are DERIVED from the session and the
apps/api/src\repair\repair.controller.ts:876:   * person's name, and accepting `decisionChannel` would let a portal approval
apps/api/src\repair\repair.controller.ts:888:    return this.proposals.recordCustomerDecision(req.tenantContext, id, body ?? {});
apps/api/src\repair\repair.controller.ts:1186: * phone. So `decidedByName` and `decisionChannel` are what carry the consent,
apps/api/src\repair\repair-plan.service.ts:986:   * It stops being writable and becomes the proposal the reviewer answers.
apps/api/src\repair\repair-plan.service.ts:1494:          'start a new repair plan to record a revised proposal',
apps/api/src\repair\repair-plan-rules.ts:28: * about it, and the next proposal is a NEW ATTEMPT. Reopening it would erase the
apps/workshop-web\app\_screens\repair-plan-sheet-screen.tsx:35: * "this plan is finished and a revised proposal is a new attempt".
apps/workshop-web\app\_screens\repair-plan-sheet-screen.tsx:179:            This plan cannot be changed. Record a revised proposal as a new plan from the
apps/workshop-web\app\_screens\repair-plan-sheet-screen.tsx:307:      return 'Approved. This is the plan of record for this attempt, and what the quotation is priced from; a revised proposal is a new attempt.';
apps/workshop-web\app\_screens\repair-plan-review-form.tsx:186:          disagreement rather than reopened, and a revised proposal is a new attempt.
apps/workshop-web\app\_screens\repair-plan-queue-screen.tsx:312:                          repair plan to record a revised proposal" — so that has to be
apps/api/src\repair\proposal.spec.ts:4:import { ProposalService } from './proposal.service';
apps/api/src\repair\proposal.spec.ts:13:  decisionChannelLabel,
apps/api/src\repair\proposal.spec.ts:14:} from './proposal-rules';
apps/api/src\repair\proposal.spec.ts:18: * Customer proposals — Phase 5, slice 6.
apps/api/src\repair\proposal.spec.ts:25: * rule; and by trigger in migration 017, proven by `verify/017_repair_proposals.sql` and
apps/api/src\repair\proposal.spec.ts:26: * end-to-end by `probe-proposal.mjs`. A fake client cannot enforce a constraint, so a
apps/api/src\repair\proposal.spec.ts:123:  insert: /INSERT INTO repair\.repair_proposals/,
apps/api/src\repair\proposal.spec.ts:124:  update: /UPDATE repair\.repair_proposals/,
apps/api/src\repair\proposal.spec.ts:173:describe('proposal roles — a commercial offer, not a technical one', () => {
apps/api/src\repair\proposal.spec.ts:177:      /may not prepare a customer proposal/,
apps/api/src\repair\proposal.spec.ts:183:    ).rejects.toThrow(/may not prepare a customer proposal/);
apps/api/src\repair\proposal.spec.ts:200:    // commonest real case: reception issues a proposal and the customer answers them
apps/api/src\repair\proposal.spec.ts:238:  it('⚠️ refuses to supersede an APPROVED proposal without a fresh quotation', async () => {
apps/api/src\repair\proposal.spec.ts:341:describe('recordDecision — §7 and the attribution', () => {
apps/api/src\repair\proposal.spec.ts:350:      service().recordDecision(ctx(), PROPOSAL_ID, {
apps/api/src\repair\proposal.spec.ts:351:        decision: 'approved', approvedOption: 'recommended', decisionChannel: 'telephone',
apps/api/src\repair\proposal.spec.ts:355:      service().recordDecision(ctx(), PROPOSAL_ID, {
apps/api/src\repair\proposal.spec.ts:356:        decision: 'approved', approvedOption: 'recommended', decidedByName: 'Kwame',
apps/api/src\repair\proposal.spec.ts:358:    ).rejects.toThrow(/decisionChannel/);
apps/api/src\repair\proposal.spec.ts:365:      new ProposalService(fakeDb([issued]).db, fakeAudit()).recordDecision(ctx(), PROPOSAL_ID, {
apps/api/src\repair\proposal.spec.ts:366:        decision: 'changes_requested', decidedByName: 'Kwame', decisionChannel: 'telephone',
apps/api/src\repair\proposal.spec.ts:373:      new ProposalService(fakeDb([issued]).db, fakeAudit()).recordDecision(ctx(), PROPOSAL_ID, {
apps/api/src\repair\proposal.spec.ts:374:        decision: 'approved', decidedByName: 'Kwame', decisionChannel: 'in_person',
apps/api/src\repair\proposal.spec.ts:376:    ).rejects.toThrow(/approvedOption/);
apps/api/src\repair\proposal.spec.ts:382:    await new ProposalService(db, audit as never).recordDecision(
apps/api/src\repair\proposal.spec.ts:387:        approvedOption: 'comprehensive',
apps/api/src\repair\proposal.spec.ts:389:        decisionChannel: 'telephone',
apps/api/src\repair\proposal.spec.ts:401:      approvedOption: 'comprehensive',
apps/api/src\repair\proposal.spec.ts:408:      new ProposalService(fakeDb([draft]).db, fakeAudit()).recordDecision(ctx(), PROPOSAL_ID, {
apps/api/src\repair\proposal.spec.ts:409:        decision: 'approved', approvedOption: 'recommended', decidedByName: 'K', decisionChannel: 'sms',
apps/api/src\repair\proposal.spec.ts:415:      new ProposalService(fakeDb([done]).db, fakeAudit()).recordDecision(ctx(), PROPOSAL_ID, {
apps/api/src\repair\proposal.spec.ts:416:        decision: 'declined', decidedByName: 'K', decisionChannel: 'sms', note: 'no',
apps/api/src\repair\proposal.spec.ts:443:          { decision: 'approved', approvedOption: 'recommended' },
apps/api/src\repair\proposal.spec.ts:455:      customerCtx(), PROPOSAL_ID, { decision: 'approved', approvedOption: 'recommended' },
apps/api/src\repair\proposal.spec.ts:474:        approvedOption: 'recommended',
apps/api/src\repair\proposal.spec.ts:476:        decisionChannel: 'telephone',
apps/api/src\repair\proposal.spec.ts:491:      customerCtx(), PROPOSAL_ID, { decision: 'approved', approvedOption: 'recommended' },
apps/api/src\repair\proposal.spec.ts:515:    ).rejects.toThrow(/approvedOption/);
apps/api/src\repair\proposal.spec.ts:518:  it('404s rather than 403s when the proposal is not theirs', async () => {
apps/api/src\repair\proposal.spec.ts:520:    // else's proposal exists by the shape of the refusal.
apps/api/src\repair\proposal.spec.ts:523:        customerCtx(), PROPOSAL_ID, { decision: 'approved', approvedOption: 'recommended' },
apps/api/src\repair\proposal.spec.ts:525:    ).rejects.toThrow(/proposal not found/);
apps/api/src\repair\proposal.spec.ts:528:  it('refuses to answer a proposal that was never sent, or was already answered', async () => {
apps/api/src\repair\proposal.spec.ts:535:        customerCtx(), PROPOSAL_ID, { decision: 'approved', approvedOption: 'recommended' },
apps/api/src\repair\proposal.spec.ts:551:describe('a customer reading proposals', () => {
apps/api/src\repair\proposal.spec.ts:554:    // this predicate a customer receives every proposal in the organisation —
apps/api/src\repair\proposal.spec.ts:563:    // would empty every workshop screen that reads proposals.
apps/api/src\repair\proposal.spec.ts:586:  it('🔴 a customer may decide an ISSUED proposal', async () => {
apps/api/src\repair\proposal.spec.ts:633:  it('refuses to edit an issued or decided proposal, naming the rule', async () => {
apps/api/src\repair\proposal.spec.ts:655:    // attached is not a proposal.
apps/api/src\repair\proposal.spec.ts:664:describe('proposal-rules matches what migration 017 applied', () => {
apps/api/src\repair\proposal.spec.ts:676:  const SQL = () => migration('017_repair_proposals.sql');
apps/api/src\repair\proposal.spec.ts:684:  it('carries exactly the six proposal statuses', () => {
apps/api/src\repair\proposal.spec.ts:699:      expect({ c, label: decisionChannelLabel(c) }).not.toEqual({ c, label: c });
apps/api/src\repair\proposal.spec.ts:708:    expect(sql).toMatch(/CONSTRAINT proposal_decision_attributed CHECK/);
apps/api/src\repair\proposal.spec.ts:714:    expect(SQL()).toMatch(/CONSTRAINT proposal_status_matches_decision CHECK/);
apps/api/src\repair\proposal.spec.ts:717:  it('⚠️ refuses to edit a decided proposal, and permits ONLY the supersession', () => {
apps/api/src\repair\proposal.spec.ts:726:  it('withholds DELETE entirely — a proposal is superseded, never erased', () => {
apps/api/src\repair\proposal.spec.ts:728:    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE ON repair\.repair_proposals/);
apps/api/src\repair\proposal.spec.ts:729:    expect(sql).toMatch(/REVOKE DELETE ON repair\.repair_proposals/);
apps/api/src\repair\proposal.spec.ts:730:    expect(sql).not.toMatch(/GRANT[^;]*DELETE[^;]*ON repair\.repair_proposals/);
apps/api/src\repair\proposal.spec.ts:735:    expect(sql).toMatch(/ALTER TABLE repair\.repair_proposals ENABLE ROW LEVEL SECURITY/);
apps/api/src\repair\proposal.spec.ts:736:    expect(sql).toMatch(/ALTER TABLE repair\.repair_proposals FORCE\s+ROW LEVEL SECURITY/);
apps/workshop-web\app\_screens\repair-plan-builder-form.tsx:529:          so it must not move underneath them — and a revised proposal is a new attempt.
apps/api/src\repair\proposal.service.ts:22:  decisionChannelLabel,
apps/api/src\repair\proposal.service.ts:27:} from './proposal-rules';
apps/api/src\repair\proposal.service.ts:34: * time a proposal can exist — a submitted inspection (010), an approved diagnosis
apps/api/src\repair\proposal.service.ts:36: * the proposal would create a second version of a fact that can never change, and a
apps/api/src\repair\proposal.service.ts:131:  approvedOption: ProposalOption | null;
apps/api/src\repair\proposal.service.ts:134:  decisionChannel: DecisionChannel | string | null;
apps/api/src\repair\proposal.service.ts:135:  decisionChannelLabel: string | null;
apps/api/src\repair\proposal.service.ts:155: * The customer proposal — `1.txt` §396-§424, `07.txt` §7.
apps/api/src\repair\proposal.service.ts:159: * "Approved proposals shall be immutable. A material change shall create a new
apps/api/src\repair\proposal.service.ts:162: *   · A decided proposal cannot be edited — in the service AND by trigger. The only
apps/api/src\repair\proposal.service.ts:166: *   · `prepare()` on a card whose latest proposal is already decided creates
apps/api/src\repair\proposal.service.ts:168: *   · An ISSUED proposal freezes too. A document that changes while the customer is
apps/api/src\repair\proposal.service.ts:174: * records that are frozen before a proposal can be created. They are read at display
apps/api/src\repair\proposal.service.ts:175: * time from the exact quotation, plan, diagnosis and inspection the proposal names —
apps/api/src\repair\proposal.service.ts:189:      // 404 for a card this viewer cannot see, BEFORE any proposal is read.
apps/api/src\repair\proposal.service.ts:202:    const proposalId = requireUuid(id, 'id');
apps/api/src\repair\proposal.service.ts:204:      const rows = await this.readProposals(client, ctx, { proposalId });
apps/api/src\repair\proposal.service.ts:210:   * Draft a proposal from the approved quotation — or, when the last one has been
apps/api/src\repair\proposal.service.ts:222:          `a proposal may only be prepared while the job card is at ` +
apps/api/src\repair\proposal.service.ts:228:      // ── one UNDECIDED proposal at a time ─────────────────────────────────
apps/api/src\repair\proposal.service.ts:230:        `SELECT id, status, version_no FROM repair.repair_proposals
apps/api/src\repair\proposal.service.ts:240:            ? `version ${open.version_no} of this proposal is still a draft; issue it or finish it before starting another`
apps/api/src\repair\proposal.service.ts:249:        `SELECT id, version_no, status FROM repair.repair_proposals
apps/api/src\repair\proposal.service.ts:283:          'a proposal presents an APPROVED quotation, and this job card has none. ' +
apps/api/src\repair\proposal.service.ts:291:        `INSERT INTO repair.repair_proposals
apps/api/src\repair\proposal.service.ts:298:      const proposalId = inserted.rows[0].id as string;
apps/api/src\repair\proposal.service.ts:305:          `UPDATE repair.repair_proposals
apps/api/src\repair\proposal.service.ts:308:          [proposalId, ctx.userId, previous.id, ctx.tenantId],
apps/api/src\repair\proposal.service.ts:313:        action: 'proposal.prepared',
apps/api/src\repair\proposal.service.ts:314:        resourceType: 'proposal',
apps/api/src\repair\proposal.service.ts:315:        resourceId: proposalId,
apps/api/src\repair\proposal.service.ts:324:      const rows = await this.readProposals(client, ctx, { proposalId });
apps/api/src\repair\proposal.service.ts:332:    proposalId: string,
apps/api/src\repair\proposal.service.ts:336:    const id = requireUuid(proposalId, 'id');
apps/api/src\repair\proposal.service.ts:356:    const sql = `UPDATE repair.repair_proposals SET ${sets.join(', ')}
apps/api/src\repair\proposal.service.ts:360:      const proposal = await this.assertDraft(client, ctx, id);
apps/api/src\repair\proposal.service.ts:363:        action: 'proposal.narrative_recorded',
apps/api/src\repair\proposal.service.ts:364:        resourceType: 'proposal',
apps/api/src\repair\proposal.service.ts:366:        detail: { jobNumber: proposal.job_number, versionNo: proposal.version_no },
apps/api/src\repair\proposal.service.ts:368:      const rows = await this.readProposals(client, ctx, { proposalId: id });
apps/api/src\repair\proposal.service.ts:374:   * Put the proposal in front of the customer.
apps/api/src\repair\proposal.service.ts:376:   * ⚠️ THE GATE IS §418, NOT A FORMALITY. A proposal that does not say what the work
apps/api/src\repair\proposal.service.ts:382:  async issue(ctx: TenantContext, proposalId: string): Promise<RepairProposal> {
apps/api/src\repair\proposal.service.ts:384:    const id = requireUuid(proposalId, 'id');
apps/api/src\repair\proposal.service.ts:387:      const proposal = await this.assertDraft(client, ctx, id);
apps/api/src\repair\proposal.service.ts:389:      const current = ProposalService.one(await this.readProposals(client, ctx, { proposalId: id }));
apps/api/src\repair\proposal.service.ts:392:          'a proposal cannot be issued without saying what the work should achieve (§418). ' +
apps/api/src\repair\proposal.service.ts:398:        `UPDATE repair.repair_proposals
apps/api/src\repair\proposal.service.ts:406:        action: 'proposal.issued',
apps/api/src\repair\proposal.service.ts:407:        resourceType: 'proposal',
apps/api/src\repair\proposal.service.ts:412:          jobNumber: proposal.job_number,
apps/api/src\repair\proposal.service.ts:413:          versionNo: proposal.version_no,
apps/api/src\repair\proposal.service.ts:421:      const rows = await this.readProposals(client, ctx, { proposalId: id });
apps/api/src\repair\proposal.service.ts:440:  async recordDecision(
apps/api/src\repair\proposal.service.ts:442:    proposalId: string,
apps/api/src\repair\proposal.service.ts:445:      approvedOption?: string;
apps/api/src\repair\proposal.service.ts:447:      decisionChannel?: string;
apps/api/src\repair\proposal.service.ts:452:    const id = requireUuid(proposalId, 'id');
apps/api/src\repair\proposal.service.ts:455:      input.decisionChannel, DECISION_CHANNELS, 'decisionChannel',
apps/api/src\repair\proposal.service.ts:465:          ? 'a declined proposal must record why; note is required'
apps/api/src\repair\proposal.service.ts:470:    const approvedOption: ProposalOption | null =
apps/api/src\repair\proposal.service.ts:472:        ? requireOneOf(input.approvedOption, PROPOSAL_OPTIONS, 'approvedOption')
apps/api/src\repair\proposal.service.ts:478:           FROM repair.repair_proposals p
apps/api/src\repair\proposal.service.ts:481:          -- Serialises two people recording an answer to the same proposal, so the
apps/api/src\repair\proposal.service.ts:490:      if (!row) throw new NotFoundException('proposal not found');
apps/api/src\repair\proposal.service.ts:494:          'this proposal has not been issued to the customer yet, so there is no decision to record',
apps/api/src\repair\proposal.service.ts:505:        `UPDATE repair.repair_proposals
apps/api/src\repair\proposal.service.ts:511:        [decision, approvedOption, decidedByName, channel, note, ctx.userId, id, ctx.tenantId],
apps/api/src\repair\proposal.service.ts:517:            ? 'proposal.approved_by_customer'
apps/api/src\repair\proposal.service.ts:519:              ? 'proposal.declined_by_customer'
apps/api/src\repair\proposal.service.ts:520:              : 'proposal.changes_requested',
apps/api/src\repair\proposal.service.ts:521:        resourceType: 'proposal',
apps/api/src\repair\proposal.service.ts:529:          approvedOption,
apps/api/src\repair\proposal.service.ts:534:      const rows = await this.readProposals(client, ctx, { proposalId: id });
apps/api/src\repair\proposal.service.ts:543:   * ── WHY THIS IS A SEPARATE ROUTE AND NOT A FLAG ON `recordDecision` ────────
apps/api/src\repair\proposal.service.ts:545:   * `recordDecision` is written for STAFF CAPTURE: a customer answers by phone,
apps/api/src\repair\proposal.service.ts:556:   *   · `decisionChannel` — is `customer_portal` by construction. Taking it from
apps/api/src\repair\proposal.service.ts:567:   * predicate is what stops them deciding on somebody else's proposal. Both are
apps/api/src\repair\proposal.service.ts:572:    proposalId: string,
apps/api/src\repair\proposal.service.ts:573:    input: { decision?: string; approvedOption?: string; note?: string },
apps/api/src\repair\proposal.service.ts:577:        `role '${ctx.activeRole}' may not decide as the customer; staff use POST /proposals/:id/decision`,
apps/api/src\repair\proposal.service.ts:580:    const id = requireUuid(proposalId, 'id');
apps/api/src\repair\proposal.service.ts:590:          ? 'a declined proposal must record why; note is required'
apps/api/src\repair\proposal.service.ts:595:    const approvedOption: ProposalOption | null =
apps/api/src\repair\proposal.service.ts:597:        ? requireOneOf(input.approvedOption, PROPOSAL_OPTIONS, 'approvedOption')
apps/api/src\repair\proposal.service.ts:601:      // The proposal, its card, and the customer's OWN name — all in one read,
apps/api/src\repair\proposal.service.ts:607:           FROM repair.repair_proposals p
apps/api/src\repair\proposal.service.ts:619:      // customer must not be able to learn that somebody else's proposal exists.
apps/api/src\repair\proposal.service.ts:620:      if (!row) throw new NotFoundException('proposal not found');
apps/api/src\repair\proposal.service.ts:624:          'this proposal has not been sent to you yet, so there is nothing to answer',
apps/api/src\repair\proposal.service.ts:630:            'changed, ask the workshop to send a revised proposal',
apps/api/src\repair\proposal.service.ts:635:        `UPDATE repair.repair_proposals
apps/api/src\repair\proposal.service.ts:641:        [decision, approvedOption, row.display_name, note, ctx.userId, id, ctx.tenantId],
apps/api/src\repair\proposal.service.ts:647:            ? 'proposal.approved_by_customer'
apps/api/src\repair\proposal.service.ts:649:              ? 'proposal.declined_by_customer'
apps/api/src\repair\proposal.service.ts:650:              : 'proposal.changes_requested',
apps/api/src\repair\proposal.service.ts:651:        resourceType: 'proposal',
apps/api/src\repair\proposal.service.ts:661:          approvedOption,
apps/api/src\repair\proposal.service.ts:667:      const rows = await this.readProposals(client, ctx, { proposalId: id });
apps/api/src\repair\proposal.service.ts:677:   * Five queries for any number of proposals, never one per row.
apps/api/src\repair\proposal.service.ts:682:    filter: { jobCardId?: string; proposalId?: string },
apps/api/src\repair\proposal.service.ts:705:              -- The money, read from the exact quotation this proposal names.
apps/api/src\repair\proposal.service.ts:725:         FROM repair.repair_proposals p
apps/api/src\repair\proposal.service.ts:750:          -- every proposal in the organisation — prices, contact details and
apps/api/src\repair\proposal.service.ts:761:        filter.jobCardId ?? null, filter.proposalId ?? null,
apps/api/src\repair\proposal.service.ts:863:        approvedOption: row.approved_option,
apps/api/src\repair\proposal.service.ts:866:        decisionChannel: row.decision_channel,
apps/api/src\repair\proposal.service.ts:867:        decisionChannelLabel: row.decision_channel ? decisionChannelLabel(row.decision_channel) : null,
apps/api/src\repair\proposal.service.ts:1001:   * The proposal exists, this viewer may reach it, and it is still a DRAFT.
apps/api/src\repair\proposal.service.ts:1009:    proposalId: string,
apps/api/src\repair\proposal.service.ts:1013:         FROM repair.repair_proposals p
apps/api/src\repair\proposal.service.ts:1017:      [proposalId, ctx.tenantId, ctx.organizationId],
apps/api/src\repair\proposal.service.ts:1022:    if (!row) throw new NotFoundException('proposal not found');
apps/api/src\repair\proposal.service.ts:1028:          : `version ${row.version_no} is ${row.status}. §424: an approved proposal is ` +
apps/api/src\repair\proposal.service.ts:1061:    if (!first) throw new NotFoundException('proposal not found');
apps/api/src\repair\proposal.service.ts:1067:      throw new ForbiddenException(`role '${ctx.activeRole}' may not read proposals`);
apps/api/src\repair\proposal.service.ts:1073:      throw new ForbiddenException(`role '${ctx.activeRole}' may not prepare a customer proposal`);
apps/api/src\repair\proposal-rules.ts:2: * Repair proposal rules — Phase 5, slice 6 (the Solution Studio).
apps/api/src\repair\proposal-rules.ts:7: * and `proposal.spec.ts` compares them against the migration text.
apps/api/src\repair\proposal-rules.ts:11: * The proposal lifecycle — §7's outcomes plus §424's versioning.
apps/api/src\repair\proposal-rules.ts:85:export function decisionChannelLabel(value: string): string {
apps/api/src\repair\proposal-rules.ts:90: * Roles that may PREPARE and ISSUE a proposal to a customer.
apps/api/src\repair\proposal-rules.ts:97: * ⚠️ `technician` and `workshop_supervisor` ARE ABSENT. A proposal is a commercial
apps/api/src\repair\proposal-rules.ts:122: * real case: reception issues a proposal and the customer answers them on the spot.
apps/api/src\repair\proposal-rules.ts:129: * Roles that may READ a proposal.
apps/api/src\repair\proposal-rules.ts:155:   * `customer` viewer to proposals on job cards raised against their own
apps/api/src\repair\proposal-rules.ts:159:   * proposals, prices and customer contact details.
apps/api/src\repair\proposal-rules.ts:181: * The stages at which a proposal is the work in hand.
apps/api/src\repair\proposal-rules.ts:183: * A proposal is DRAFTED once the price exists (`quotation_preparation`) and ISSUED
apps/workshop-web\app\_screens\quality-queue-screen.tsx:86:        title="Nothing is waiting for inspection"
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:6:import { ProposalNarrativeForm } from './proposal-narrative-form';
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:7:import { ProposalDecisionForm } from './proposal-decision-form';
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:8:import { ProposalDocument, type ProposalDocumentData } from './proposal-document';
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:14:} from './proposal-labels';
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:17: * One customer proposal — `1.txt` §410-§422's document, `07.txt` §7's decision.
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:55:  approvedOption: string | null;
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:58:  decisionChannelLabel: string | null;
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:84:  proposalId,
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:87:  proposalId: string;
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:90:    <Suspense fallback={<LoadingState label="Loading the proposal…" />}>
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:91:      <Sheet route={route} proposalId={proposalId} />
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:96:async function Sheet({ route, proposalId }: { route: string; proposalId: string }) {
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:97:  const result = await apiGet<Proposal>('workshop', `/proposals/${proposalId}`);
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:108:          Back to the proposal queue
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:144:            {p.decisionChannelLabel ? ` · ${p.decisionChannelLabel}` : ''}
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:148:          {p.approvedOption ? (
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:150:              {PROPOSAL_OPTION_LABEL[p.approvedOption] ?? p.approvedOption} —{' '}
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:224:          proposalId={p.id}
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:236:          proposalId={p.id}
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:254:          This proposal is with the customer. Your role can read it but not record their
apps/workshop-web\app\_screens\proposal-sheet-screen.tsx:267:        : 'A draft proposal. Your role can read it but not change it.';
apps/api/src\repair\execution.spec.ts:69:  proposal_id: PROPOSAL_ID,
apps/api/src\repair\execution.spec.ts:70:  proposal_version_no: 1,
apps/api/src\repair\execution.spec.ts:130:  approvedProposal: /FROM repair\.repair_proposals pr/,
apps/api/src\repair\execution.spec.ts:225:      /customer has approved a proposal.*Customer\s+Proposals screen/s,
apps/api/src\repair\execution.spec.ts:542:    expect(sql).toMatch(/proposal_id\s+uuid NOT NULL/);
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:8:import { PrepareProposalForm } from './prepare-proposal-form';
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:9:import { PROPOSAL_STATUS_KIND, PROPOSAL_STATUS_LABEL, formatMoney } from './proposal-labels';
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:12: * The customer-proposal queue — `1.txt` §396-§424, `07.txt` §7. Three workshop routes:
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:14: *   §34 default  `/solution-and-approval/customer-proposals`  "Customer Proposals"
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:18: * The fourth `repair-proposals` item in `workspaces.ts` belongs to the CUSTOMER
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:27: * proposal sitting unanswered is a car sitting in a bay. And unlike every other queue
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:29: * to be impossible to miss. Issued proposals sort first.
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:48:  decisionChannelLabel: string | null;
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:55:/** The stages at which a proposal is the work in hand. */
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:64:        description="What the customer has been shown, and what they said. A proposal presents an approved quotation; once the customer approves it, §424 makes it immutable and any material change needs a new version."
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:66:      <Suspense fallback={<LoadingState label="Loading the proposal queue…" />}>
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:74:  const [cardsResult, proposalsResult] = await Promise.all([
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:76:    apiGet<Proposal[]>('workshop', '/proposals'),
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:79:  if (!proposalsResult.ok) return <ApiFailure reason={proposalsResult.reason} workspaceId="workshop" />;
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:84:  for (const p of proposalsResult.data) {
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:96:        title="No customer proposals"
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:122:          {waiting > 0 ? `${waiting} proposal(s) waiting on the customer. ` : ''}
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:137:            Customer proposals, their version, what the customer decided and what they agreed to pay
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:191:                          {p.decisionChannelLabel ? ` (${p.decisionChannelLabel})` : null}
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:237:                          proposal for {card.jobNumber}
apps/workshop-web\app\_screens\proposal-queue-screen.tsx:243:                            answered proposal says to prepare a new version. */}
apps/api/src\repair\execution.service.ts:93:  proposalId: string;
apps/api/src\repair\execution.service.ts:94:  proposalVersionNo: number;
apps/api/src\repair\execution.service.ts:140: * foreign key to an APPROVED proposal plus a trigger, not a checkbox. §32's five
apps/api/src\repair\execution.service.ts:225:      // The newest APPROVED proposal, and the plan behind it — the work list comes
apps/api/src\repair\execution.service.ts:229:      const proposalRow = await client.query(
apps/api/src\repair\execution.service.ts:231:           FROM repair.repair_proposals pr
apps/api/src\repair\execution.service.ts:238:      const proposal = proposalRow.rows[0] as
apps/api/src\repair\execution.service.ts:241:      if (!proposal) {
apps/api/src\repair\execution.service.ts:242:        // The refusal names a route that exists — the proposal queue is where a
apps/api/src\repair\execution.service.ts:245:          'repair work cannot start until the customer has approved a proposal, and this ' +
apps/api/src\repair\execution.service.ts:260:           (tenant_id, organization_id, job_card_id, proposal_id, attempt_no,
apps/api/src\repair\execution.service.ts:265:          ctx.tenantId, ctx.organizationId, cardId, proposal.id, attemptNo,
apps/api/src\repair\execution.service.ts:281:        [ctx.tenantId, ctx.organizationId, executionId, ctx.userId, proposal.repair_plan_id],
apps/api/src\repair\execution.service.ts:291:          proposalVersionNo: proposal.version_no,
apps/api/src\repair\execution.service.ts:734:              e.proposal_id, pr.version_no AS proposal_version_no,
apps/api/src\repair\execution.service.ts:745:         JOIN repair.repair_proposals pr ON pr.id = e.proposal_id AND pr.tenant_id = e.tenant_id
apps/api/src\repair\execution.service.ts:883:        proposalId: row.proposal_id,
apps/api/src\repair\execution.service.ts:884:        proposalVersionNo: row.proposal_version_no,
apps/api/src\repair\execution.service.ts:1083:  proposal_id: string;
apps/api/src\repair\execution.service.ts:1084:  proposal_version_no: number;
apps/workshop-web\app\_screens\proposal-narrative-form.tsx:6:import { issueProposalAction, recordProposalNarrativeAction } from './proposal-actions';
apps/workshop-web\app\_screens\proposal-narrative-form.tsx:9: * The three things a person writes on a proposal — §418's expected result and §422's
apps/workshop-web\app\_screens\proposal-narrative-form.tsx:24: * than after: once the proposal is with the customer, its content cannot change, and a
apps/workshop-web\app\_screens\proposal-narrative-form.tsx:28:  proposalId,
apps/workshop-web\app\_screens\proposal-narrative-form.tsx:36:  proposalId: string;
apps/workshop-web\app\_screens\proposal-narrative-form.tsx:116:          data.set('proposalId', proposalId);
apps/workshop-web\app\_screens\proposal-narrative-form.tsx:124:          note="Required before the proposal can be issued. In plain language: what will be different for the customer once the work is done."
apps/workshop-web\app\_screens\proposal-narrative-form.tsx:207:          promise attached is not a proposal.
apps/workshop-web\app\_screens\proposal-narrative-form.tsx:215:          data.set('proposalId', proposalId);
apps/workshop-web\app\_screens\proposal-narrative-form.tsx:222:          aria-label={`Issue the proposal for job card ${jobNumber} to the customer`}
apps/workshop-web\app\_screens\proposal-labels.ts:58:/** Money in the proposal's own currency — never defaulted, see the quotation labels. */
apps/workshop-web\app\_screens\proposal-document.tsx:2:import { PROPOSAL_OPTION_LABEL, formatMoney } from './proposal-labels';
apps/workshop-web\app\_screens\proposal-document.tsx:56:  approvedOption: string | null;
apps/workshop-web\app\_screens\proposal-document.tsx:59:  decisionChannelLabel: string | null;
apps/workshop-web\app\_screens\proposal-document.tsx:295:            Not yet written. This proposal cannot be issued until it is.
apps/workshop-web\app\_screens\proposal-document.tsx:334:            ? `This proposal is open for acceptance until ${v.validUntil}.`
apps/workshop-web\app\_screens\proposal-document.tsx:335:            : 'No validity period has been set for this proposal.'}
apps/workshop-web\app\_screens\proposal-document.tsx:349:            Work will not begin until this proposal is accepted. Please confirm which
apps/workshop-web\app\_screens\proposal-document.tsx:384:          {data.decisionChannelLabel ? <Term label="Given">{data.decisionChannelLabel}</Term> : null}
apps/workshop-web\app\_screens\proposal-document.tsx:388:          {data.approvedOption ? (
apps/workshop-web\app\_screens\proposal-document.tsx:390:              {PROPOSAL_OPTION_LABEL[data.approvedOption] ?? data.approvedOption}
apps/workshop-web\app\_screens\proposal-decision-form.tsx:6:import { recordProposalDecisionAction } from './proposal-actions';
apps/workshop-web\app\_screens\proposal-decision-form.tsx:12:} from './proposal-labels';
apps/workshop-web\app\_screens\proposal-decision-form.tsx:36:  proposalId,
apps/workshop-web\app\_screens\proposal-decision-form.tsx:43:  proposalId: string;
apps/workshop-web\app\_screens\proposal-decision-form.tsx:69:      // The whole page changes — the proposal becomes immutable and this form
apps/workshop-web\app\_screens\proposal-decision-form.tsx:107:        Job {jobNumber} for {customerName}. Once recorded, §424 makes this proposal
apps/workshop-web\app\_screens\proposal-decision-form.tsx:112:        <input type="hidden" name="proposalId" value={proposalId} />
apps/workshop-web\app\_screens\proposal-decision-form.tsx:150:              <input type="radio" name="approvedOption" value="recommended" defaultChecked />
apps/workshop-web\app\_screens\proposal-decision-form.tsx:157:                name="approvedOption"
apps/workshop-web\app\_screens\proposal-decision-form.tsx:189:            <select id="decision-channel" name="decisionChannel" defaultValue="in_person" style={input}>
apps/workshop-web\app\_screens\proposal-actions.ts:8: * Preparing, issuing and answering a customer proposal — `1.txt` §396-§424, `07.txt` §7.
apps/workshop-web\app\_screens\proposal-actions.ts:14: * a proposal, who may record a decision, that the quotation behind it is APPROVED, and
apps/workshop-web\app\_screens\proposal-actions.ts:15: * §424's immutability — an approved proposal cannot be edited, only superseded by a new
apps/workshop-web\app\_screens\proposal-actions.ts:39:  '/solution-and-approval/customer-proposals',
apps/workshop-web\app\_screens\proposal-actions.ts:57:/** Draft a proposal, or §424's new VERSION of one. */
apps/workshop-web\app\_screens\proposal-actions.ts:64:    `/job-cards/${jobCardId}/proposals`,
apps/workshop-web\app\_screens\proposal-actions.ts:77:  const proposalId = String(formData.get('proposalId') ?? '').trim();
apps/workshop-web\app\_screens\proposal-actions.ts:78:  if (!proposalId) return { error: 'That proposal could not be identified. Reload the page.' };
apps/workshop-web\app\_screens\proposal-actions.ts:80:  const result = await apiPatch<{ id: string }>('workshop', `/proposals/${proposalId}`, {
apps/workshop-web\app\_screens\proposal-actions.ts:96:  const proposalId = String(formData.get('proposalId') ?? '').trim();
apps/workshop-web\app\_screens\proposal-actions.ts:97:  if (!proposalId) return { error: 'That proposal could not be identified. Reload the page.' };
apps/workshop-web\app\_screens\proposal-actions.ts:101:    `/proposals/${proposalId}/issue`,
apps/workshop-web\app\_screens\proposal-actions.ts:122:  const proposalId = String(formData.get('proposalId') ?? '').trim();
apps/workshop-web\app\_screens\proposal-actions.ts:125:  const decisionChannel = String(formData.get('decisionChannel') ?? '').trim();
apps/workshop-web\app\_screens\proposal-actions.ts:127:  const approvedOption = String(formData.get('approvedOption') ?? '').trim();
apps/workshop-web\app\_screens\proposal-actions.ts:129:  if (!proposalId) return { error: 'That proposal could not be identified. Reload the page.' };
apps/workshop-web\app\_screens\proposal-actions.ts:136:  if (decisionChannel === '') {
apps/workshop-web\app\_screens\proposal-actions.ts:139:  if (decision === 'approved' && approvedOption === '') {
apps/workshop-web\app\_screens\proposal-actions.ts:150:    `/proposals/${proposalId}/decision`,
apps/workshop-web\app\_screens\proposal-actions.ts:154:      decisionChannel,
apps/workshop-web\app\_screens\proposal-actions.ts:155:      approvedOption: decision === 'approved' ? approvedOption : undefined,
apps/workshop-web\app\_screens\prepare-proposal-form.tsx:6:import { prepareProposalAction } from './proposal-actions';
apps/workshop-web\app\_screens\prepare-proposal-form.tsx:9: * "Prepare proposal" — and, on an answered proposal, §424's NEW VERSION.
apps/workshop-web\app\_screens\prepare-proposal-form.tsx:17: * proposal stage, the viewer may prepare one, no undecided version is outstanding, and
apps/workshop-web\app\_screens\prepare-proposal-form.tsx:25:  label = 'Prepare proposal',
apps/workshop-web\app\_screens\prepare-proposal-form.tsx:47:      setError('The request could not be completed. No proposal was prepared.');
apps/workshop-web\app\_screens\job-queue-definitions.ts:39:    emptyBody: 'No job is authorised to start. Approval happens on the proposal, after a quotation.',
apps/workshop-web\app\_screens\job-queue-definitions.ts:63:    emptyTitle: 'Nothing is waiting on parts',
apps/workshop-web\app\_screens\execution-work-form.tsx:37: * `editable`. Every rule is in `ExecutionService`: the approved-proposal requirement,
apps/workshop-web\app\_screens\execution-work-form.tsx:390:            note="⚠️ If it is CHARGEABLE, it must be raised as a variation — a new quotation and a new proposal version — not simply carried out. Record it here so it is not lost."
apps/workshop-web\app\_screens\execution-sheet-screen.tsx:44:  proposalVersionNo: number;
apps/workshop-web\app\_screens\execution-sheet-screen.tsx:165:        <Fact label="Authorised by" value={`Proposal v${e.proposalVersionNo}`} />
apps/workshop-web\app\_screens\execution-queue-screen.tsx:70:        description="Vehicles being worked on. A repair cannot start until the customer has approved a proposal, and cannot be completed while an approved task is unfinished or somebody is still clocked on."
apps/workshop-web\app\_screens\execution-queue-screen.tsx:101:        description="A vehicle appears here once its job card is authorised to start, which follows the customer approving a proposal. Record a customer decision on the Customer Proposals screen first."
apps/workshop-web\app\_screens\execution-queue-screen.tsx:286:        during a repair must be raised as a VARIATION (a new quotation and a new proposal
apps/workshop-web\app\_screens\execution-actions.ts:14: * out a repair, that an APPROVED customer proposal exists (§7), that a blocked task
apps/customer-web\app\_screens\repair-journey.ts:110:    detail: 'We are pricing the work. Your proposal will arrive shortly.',
apps/customer-web\app\_screens\repair-journey.ts:116:    detail: 'A repair proposal is waiting for your decision. Nothing starts until you approve it.',
apps/customer-web\app\_screens\repair-journey-screen.tsx:7:import { ProposalDecisionForm } from './proposal-decision-form';
apps/customer-web\app\_screens\repair-journey-screen.tsx:19: *   /service-and-repairs/repair-proposals    the ones waiting on the customer
apps/customer-web\app\_screens\repair-journey-screen.tsx:61: * WARNING: NAMES TAKEN FROM apps/api/src/repair/proposal.service.ts, not
apps/customer-web\app\_screens\repair-journey-screen.tsx:118:    emptyTitle: 'Nothing is waiting on you',
apps/customer-web\app\_screens\repair-journey-screen.tsx:168:  const proposals =
apps/customer-web\app\_screens\repair-journey-screen.tsx:169:    view === 'needs-you' ? await apiGet<ProposalRow[]>('customer', '/proposals') : null;
apps/customer-web\app\_screens\repair-journey-screen.tsx:211:          <Link href="/service-and-repairs/repair-proposals">See what is needed</Link>
apps/customer-web\app\_screens\repair-journey-screen.tsx:221:              The proposal still OPEN on this card. `decidable` is the API's
apps/customer-web\app\_screens\repair-journey-screen.tsx:225:            proposal={
apps/customer-web\app\_screens\repair-journey-screen.tsx:226:              proposals?.ok
apps/customer-web\app\_screens\repair-journey-screen.tsx:227:                ? proposals.data.find((p) => p.jobCardId === card.id && p.decidable)
apps/customer-web\app\_screens\repair-journey-screen.tsx:237:function JourneyCard({ card, proposal }: { card: JobCardRow; proposal?: ProposalRow }) {
apps/customer-web\app\_screens\repair-journey-screen.tsx:325:          {proposal ? (
apps/customer-web\app\_screens\repair-journey-screen.tsx:336:                Repair proposal {proposal.presentation.documentReference} is waiting for your answer.
apps/customer-web\app\_screens\repair-journey-screen.tsx:338:              {proposal.expectedResult ? (
apps/customer-web\app\_screens\repair-journey-screen.tsx:340:                  {proposal.expectedResult}
apps/customer-web\app\_screens\repair-journey-screen.tsx:350:              {proposal.riskAndLimitations ? (
apps/customer-web\app\_screens\repair-journey-screen.tsx:358:                  <strong>Risks and limitations:</strong> {proposal.riskAndLimitations}
apps/customer-web\app\_screens\repair-journey-screen.tsx:361:              {proposal.uncertainties ? (
apps/customer-web\app\_screens\repair-journey-screen.tsx:369:                  <strong>Still to be confirmed:</strong> {proposal.uncertainties}
apps/customer-web\app\_screens\repair-journey-screen.tsx:373:                proposalId={proposal.id}
apps/customer-web\app\_screens\repair-journey-screen.tsx:374:                recommendedTotal={proposal.presentation.recommendedTotal}
apps/customer-web\app\_screens\repair-journey-screen.tsx:375:                comprehensiveTotal={proposal.presentation.comprehensiveTotal}
apps/customer-web\app\_screens\repair-journey-screen.tsx:376:                currency={proposal.presentation.currency}
apps/customer-web\app\_screens\repair-journey-screen.tsx:381:              No open proposal on this card. The customer is still the hold-up -
apps/customer-web\app\_screens\repair-journey-screen.tsx:400:      return 'approve or decline the repair proposal';
apps/customer-web\app\_screens\proposal-decision-form.tsx:6:import { decideProposalAction } from './proposal-decision-actions';
apps/customer-web\app\_screens\proposal-decision-form.tsx:9: * §7 — the customer's answer to a repair proposal, made by the customer.
apps/customer-web\app\_screens\proposal-decision-form.tsx:21: * `proposal-decision-actions.ts`.
apps/customer-web\app\_screens\proposal-decision-form.tsx:24:  proposalId,
apps/customer-web\app\_screens\proposal-decision-form.tsx:29:  proposalId: string;
apps/customer-web\app\_screens\proposal-decision-form.tsx:49:        <input type="hidden" name="proposalId" value={proposalId} />
apps/customer-web\app\_screens\proposal-decision-form.tsx:72:          <Field label="Which option are you approving?" htmlFor="approvedOption">
apps/customer-web\app\_screens\proposal-decision-form.tsx:74:              id="approvedOption"
apps/customer-web\app\_screens\proposal-decision-form.tsx:75:              name="approvedOption"
apps/customer-web\app\_screens\proposal-decision-form.tsx:103:        <SubmitButton>{approving ? 'Approve this repair' : 'Send my answer'}</SubmitButton>
apps/customer-web\app\_screens\proposal-decision-actions.ts:8: * §7 — the customer approves, declines or questions a repair proposal, themselves.
apps/customer-web\app\_screens\proposal-decision-actions.ts:12: * Not `decidedByName`, and not `decisionChannel`. Both are DERIVED by the API:
apps/customer-web\app\_screens\proposal-decision-actions.ts:13: * the name from the customer record the proposal hangs off, the channel from
apps/customer-web\app\_screens\proposal-decision-actions.ts:22: * ⚠️ The screen never sends a proposal id the viewer did not receive from their
apps/customer-web\app\_screens\proposal-decision-actions.ts:32:  const proposalId = read('proposalId');
apps/customer-web\app\_screens\proposal-decision-actions.ts:33:  if (!proposalId) return { error: 'Nothing was selected to answer. Reload the page and try again.' };
apps/customer-web\app\_screens\proposal-decision-actions.ts:37:  const result = await apiPost(`customer`, `/proposals/${proposalId}/customer-decision`, {
apps/customer-web\app\_screens\proposal-decision-actions.ts:41:    approvedOption: decision === 'approved' ? read('approvedOption') : undefined,
apps/customer-web\app\_screens\proposal-decision-actions.ts:50:        "this proposal has not been sent to you yet" and "you already answered
apps/customer-web\app\_screens\proposal-decision-actions.ts:63:          ? (result.message ?? 'Your account may not answer this proposal.')
apps/customer-web\app\_screens\proposal-decision-actions.ts:67:              ? 'That proposal is no longer available. Reload the page.'
apps/customer-web\app\_screens\proposal-decision-actions.ts:73:  // moves the job card as well as the proposal. Revalidating only this page
apps/customer-web\app\_screens\proposal-decision-actions.ts:76:    '/service-and-repairs/repair-proposals',
apps/workshop-web\app\solution-and-approval\customer-proposals\[id]\page.tsx:2:import { ProposalSheetScreen } from '../../../_screens/proposal-sheet-screen';
apps/workshop-web\app\solution-and-approval\customer-proposals\[id]\page.tsx:5: * /solution-and-approval/customer-proposals/<id> — one customer proposal. the §34 WORKSPACE DEFAULT tree.
apps/workshop-web\app\solution-and-approval\customer-proposals\[id]\page.tsx:8: * navigation advertises one entry per proposal. `check-page-gates.sh` strips trailing
apps/workshop-web\app\solution-and-approval\customer-proposals\[id]\page.tsx:18:  await requireNavRoute('workshop', '/solution-and-approval/customer-proposals');
apps/workshop-web\app\solution-and-approval\customer-proposals\[id]\page.tsx:20:  return <ProposalSheetScreen route="/solution-and-approval/customer-proposals" proposalId={id} />;
apps/workshop-web\app\solution-and-approval\customer-proposals\page.tsx:2:import { ProposalQueueScreen } from '../../_screens/proposal-queue-screen';
apps/workshop-web\app\solution-and-approval\customer-proposals\page.tsx:5: * /solution-and-approval/customer-proposals — the §34 WORKSPACE DEFAULT tree.
apps/workshop-web\app\solution-and-approval\customer-proposals\page.tsx:19:  await requireNavRoute('workshop', '/solution-and-approval/customer-proposals');
apps/workshop-web\app\solution-and-approval\customer-proposals\page.tsx:20:  return <ProposalQueueScreen route="/solution-and-approval/customer-proposals" />;
apps/workshop-web\app\settings\pricing\page.tsx:7: * Added by the navigation-gap proposal (`docs/03-ui-ux/NAVIGATION-GAPS-PROPOSAL.md`,
apps/workshop-web\app\requests-and-reception\register-vehicle\page.tsx:9: * Added by the navigation-gap proposal (`docs/03-ui-ux/NAVIGATION-GAPS-PROPOSAL.md`,
apps/workshop-web\app\requests-and-reception\register-customer\page.tsx:9: * Added by the navigation-gap proposal (`docs/03-ui-ux/NAVIGATION-GAPS-PROPOSAL.md`,
apps/workshop-web\app\layout.tsx:129:            'workshop.proposals.pendingApproval': 2,
apps/workshop-web\app\repair-services\repairs-in-progress\page.tsx:12: * requires an APPROVED customer proposal before any work starts (§7), and Postgres RLS
apps/workshop-web\app\customers-and-vehicles\register-vehicle\page.tsx:9: * Added by the navigation-gap proposal (`docs/03-ui-ux/NAVIGATION-GAPS-PROPOSAL.md`,
apps/workshop-web\app\customers-and-vehicles\register-customer\page.tsx:9: * Added by the navigation-gap proposal (`docs/03-ui-ux/NAVIGATION-GAPS-PROPOSAL.md`,
apps/workshop-web\app\repair-control\repairs-in-progress\page.tsx:12: * requires an APPROVED customer proposal before any work starts (§7), and Postgres RLS
apps/workshop-web\app\customer-reception\register-vehicle\page.tsx:9: * Added by the navigation-gap proposal (`docs/03-ui-ux/NAVIGATION-GAPS-PROPOSAL.md`,
apps/workshop-web\app\repair-control\repair-progress\page.tsx:12: * requires an APPROVED customer proposal before any work starts (§7), and Postgres RLS
apps/workshop-web\app\customer-reception\register-customer\page.tsx:9: * Added by the navigation-gap proposal (`docs/03-ui-ux/NAVIGATION-GAPS-PROPOSAL.md`,
apps/workshop-web\app\customer-approval\pending-approvals\[id]\page.tsx:2:import { ProposalSheetScreen } from '../../../_screens/proposal-sheet-screen';
apps/workshop-web\app\customer-approval\pending-approvals\[id]\page.tsx:5: * /customer-approval/pending-approvals/<id> — one customer proposal. the §47 WORKSHOP MANAGER tree — the role that chases an unanswered proposal.
apps/workshop-web\app\customer-approval\pending-approvals\[id]\page.tsx:8: * navigation advertises one entry per proposal. `check-page-gates.sh` strips trailing
apps/workshop-web\app\customer-approval\pending-approvals\[id]\page.tsx:20:  return <ProposalSheetScreen route="/customer-approval/pending-approvals" proposalId={id} />;
apps/workshop-web\app\customer-approval\pending-approvals\page.tsx:2:import { ProposalQueueScreen } from '../../_screens/proposal-queue-screen';
apps/workshop-web\app\customer-approval\pending-approvals\page.tsx:5: * /customer-approval/pending-approvals — the §47 WORKSHOP MANAGER tree — the role that chases an unanswered proposal.
apps/workshop-web\app\repair-control\customer-approval\[id]\page.tsx:2:import { ProposalSheetScreen } from '../../../_screens/proposal-sheet-screen';
apps/workshop-web\app\repair-control\customer-approval\[id]\page.tsx:5: * /repair-control/customer-approval/<id> — one customer proposal. the §46 WORKSHOP OWNER tree.
apps/workshop-web\app\repair-control\customer-approval\[id]\page.tsx:8: * navigation advertises one entry per proposal. `check-page-gates.sh` strips trailing
apps/workshop-web\app\repair-control\customer-approval\[id]\page.tsx:20:  return <ProposalSheetScreen route="/repair-control/customer-approval" proposalId={id} />;
apps/workshop-web\app\repair-control\customer-approval\page.tsx:2:import { ProposalQueueScreen } from '../../_screens/proposal-queue-screen';
apps/workshop-web\app\record-work\time-records\page.tsx:12: * requires an APPROVED customer proposal before any work starts (§7), and Postgres RLS
apps/workshop-web\app\record-work\repair-tasks\page.tsx:12: * requires an APPROVED customer proposal before any work starts (§7), and Postgres RLS
apps/workshop-web\app\record-work\repair-evidence\page.tsx:12: * requires an APPROVED customer proposal before any work starts (§7), and Postgres RLS
apps/workshop-web\app\record-work\parts-used\page.tsx:12: * requires an APPROVED customer proposal before any work starts (§7), and Postgres RLS
apps/customer-web\app\(app)\service-and-repairs\repair-proposals\page.tsx:5: * /service-and-repairs/repair-proposals — `01 (1).txt` §33, the customer workspace.
apps/customer-web\app\(app)\service-and-repairs\repair-proposals\page.tsx:20:  await requireNavRoute('customer', '/service-and-repairs/repair-proposals');
apps/customer-web\app\(app)\layout.tsx:17:  description: 'Vehicle owners — garage, complaints, proposals, payments',

 succeeded in 3663ms:
apps/customer-web\app\_screens\repair-journey-screen.tsx:173:    // visitor: `requireNavRoute` does not refuse them (see the page comment),
apps/customer-web\app\_screens\dashboard-screen.tsx:148:          <Link href="/my-vehicles/garage">Open your garage</Link>
apps/customer-web\app\_screens\add-vehicle-screen.tsx:89:        successHref={{ href: '/my-vehicles/garage', label: 'View your garage' }}
apps/customer-web\app\_screens\add-vehicle-actions.ts:74:  revalidatePath('/my-vehicles/garage');
apps/workshop-web\app\_screens\staging-board-screen.tsx:270:        Parts, payment and approval status are not shown: those records are not built yet (Phases 6
apps/workshop-web\app\_screens\quick-create.spec.ts:11: * navigation, so by construction it cannot disagree with `requireNavRoute`.
apps/workshop-web\app\_screens\quick-create.spec.ts:15: *      no `page.tsx` lands in the "not built yet" catch-all, which is the exact
apps/workshop-web\app\_screens\quick-create.spec.ts:28:  /** The same three functions `requireNavRoute` uses, in the same order. */
apps/workshop-web\app\_screens\quick-create-button.tsx:15: * route's own `requireNavRoute` gate are two expressions of one fact rather
apps/workshop-web\app\_screens\nav-label.ts:26: * which should be impossible after `requireNavRoute`, and is still not worth
apps/workshop-web\app\_screens\job-queue-screen.tsx:113:   * `viewerRole` is the same function `requireNavRoute` uses to pick the tree,
apps/workshop-web\app\_screens\job-queue-screen.tsx:159:              the "not built yet" catch-all teaches people the queue is broken.
apps/workshop-web\app\_screens\job-card-detail-href.ts:13: * `requireNavRoute`, which asks whether THIS VIEWER'S TREE carries the route —
apps/workshop-web\app\_screens\job-card-detail-href.ts:18: * ⚠️ AND THE REFUSAL WOULD LOOK LIKE A BUG, NOT A RULE. `requireNavRoute` is a
apps/workshop-web\app\_screens\job-card-detail-href.spec.ts:17: * `requireNavRoute` calls `notFound()`, so the user clicks the job number on a
apps/workshop-web\app\_screens\job-card-detail-href.spec.ts:24: * SAME three functions `requireNavRoute` resolves, in the same order, against
apps/workshop-web\app\_screens\job-card-detail-href.spec.ts:27: * lands in the "not built yet" catch-all, which is the thing this slice exists
apps/workshop-web\app\[...slug]\page.tsx:1:import { renderModulePage, viewerGrants } from '@autoworkshop/next-shell';
apps/workshop-web\app\[...slug]\page.tsx:13:  return renderModulePage('workshop', slug, await viewerGrants('workshop'));
apps/workshop-web\app\workshop-operations\repair-staging\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\workshop-operations\repair-staging\page.tsx:15:  await requireNavRoute('workshop', '/workshop-operations/repair-staging');
apps/workshop-web\app\workshop-operations\repair-requests\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\workshop-operations\repair-requests\page.tsx:14:  await requireNavRoute('workshop', '/workshop-operations/repair-requests');
apps/workshop-web\app\workshop-operations\job-cards\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\workshop-operations\job-cards\[id]\page.tsx:18:  await requireNavRoute('workshop', '/workshop-operations/job-cards');
apps/workshop-web\app\workshop-operations\job-cards\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\workshop-operations\job-cards\page.tsx:15:  await requireNavRoute('workshop', '/workshop-operations/job-cards');
apps/workshop-web\app\workshop-operations\customer-complaints\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\workshop-operations\customer-complaints\page.tsx:14:  await requireNavRoute('workshop', '/workshop-operations/customer-complaints');
apps/workshop-web\app\workshop-management\workshop-profile\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\workshop-management\workshop-profile\page.tsx:17: * NOT the control. `requireNavRoute` decides whether this ROUTE is offered;
apps/workshop-web\app\workshop-management\workshop-profile\page.tsx:25:  await requireNavRoute('workshop', '/workshop-management/workshop-profile');
apps/workshop-web\app\workshop-management\pricing-rules\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\workshop-management\pricing-rules\page.tsx:52:  await requireNavRoute('workshop', '/workshop-management/pricing-rules');
apps/workshop-web\app\workshop-floor\repair-staging\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\workshop-floor\repair-staging\page.tsx:18:  await requireNavRoute('workshop', '/workshop-floor/repair-staging');
apps/workshop-web\app\workshop-floor\job-cards\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\workshop-floor\job-cards\[id]\page.tsx:22:  await requireNavRoute('workshop', '/workshop-floor/job-cards');
apps/workshop-web\app\workshop-floor\job-cards\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\workshop-floor\job-cards\page.tsx:15:  await requireNavRoute('workshop', '/workshop-floor/job-cards');
apps/workshop-web\app\vehicles\vehicle-search\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\vehicles\vehicle-search\[id]\page.tsx:22:  await requireNavRoute('workshop', '/vehicles/vehicle-search');
apps/workshop-web\app\vehicles\vehicle-search\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\vehicles\vehicle-search\page.tsx:18:  await requireNavRoute('workshop', '/vehicles/vehicle-search');
apps/workshop-web\app\vehicles\register-vehicle\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\vehicles\register-vehicle\page.tsx:15:  await requireNavRoute('workshop', '/vehicles/register-vehicle');
apps/customer-web\app\(app)\[...slug]\page.tsx:1:import { renderModulePage, viewerGrants } from '@autoworkshop/next-shell';
apps/customer-web\app\(app)\[...slug]\page.tsx:13:  return renderModulePage('customer', slug, await viewerGrants('customer'));
apps/customer-web\app\(app)\vehicle-lookup\page.tsx:23: * ⚠️ NO `requireNavRoute` GATE. This route is deliberately outside the §33
apps/customer-web\app\(app)\service-and-repairs\service-requests\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/customer-web\app\(app)\service-and-repairs\service-requests\page.tsx:7: * ⚠️ `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION.
apps/customer-web\app\(app)\service-and-repairs\service-requests\page.tsx:11: * reasoning as `/my-vehicles/garage`, where Codex corrected the opposite claim.
apps/customer-web\app\(app)\service-and-repairs\service-requests\page.tsx:20:  await requireNavRoute('customer', '/service-and-repairs/service-requests');
apps/workshop-web\app\testing\submit-to-quality-control\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\testing\submit-to-quality-control\[id]\page.tsx:18:  await requireNavRoute('workshop', '/testing/submit-to-quality-control');
apps/customer-web\app\(app)\service-and-repairs\report-a-problem\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/customer-web\app\(app)\service-and-repairs\report-a-problem\page.tsx:18:  await requireNavRoute('customer', '/service-and-repairs/report-a-problem');
apps/workshop-web\app\testing\submit-to-quality-control\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\testing\submit-to-quality-control\page.tsx:18:  await requireNavRoute('workshop', '/testing/submit-to-quality-control');
apps/customer-web\app\(app)\service-and-repairs\repair-tracking\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/customer-web\app\(app)\service-and-repairs\repair-tracking\page.tsx:7: * ⚠️ `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION.
apps/customer-web\app\(app)\service-and-repairs\repair-tracking\page.tsx:11: * reasoning as `/my-vehicles/garage`, where Codex corrected the opposite claim.
apps/customer-web\app\(app)\service-and-repairs\repair-tracking\page.tsx:20:  await requireNavRoute('customer', '/service-and-repairs/repair-tracking');
apps/customer-web\app\(app)\service-and-repairs\repair-proposals\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/customer-web\app\(app)\service-and-repairs\repair-proposals\page.tsx:7: * ⚠️ `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION.
apps/customer-web\app\(app)\service-and-repairs\repair-proposals\page.tsx:11: * reasoning as `/my-vehicles/garage`, where Codex corrected the opposite claim.
apps/customer-web\app\(app)\service-and-repairs\repair-proposals\page.tsx:20:  await requireNavRoute('customer', '/service-and-repairs/repair-proposals');
apps/customer-web\app\(app)\service-and-repairs\completed-repairs\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/customer-web\app\(app)\service-and-repairs\completed-repairs\page.tsx:7: * ⚠️ `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION.
apps/customer-web\app\(app)\service-and-repairs\completed-repairs\page.tsx:11: * reasoning as `/my-vehicles/garage`, where Codex corrected the opposite claim.
apps/customer-web\app\(app)\service-and-repairs\completed-repairs\page.tsx:20:  await requireNavRoute('customer', '/service-and-repairs/completed-repairs');
apps/customer-web\app\(app)\parts-and-warranty\parts-orders\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/customer-web\app\(app)\parts-and-warranty\parts-orders\page.tsx:11: * own orders, and `requireNavRoute` refuses a path the viewer's tree does not
apps/customer-web\app\(app)\parts-and-warranty\parts-orders\page.tsx:17: * page. `requireNavRoute` resolves the path against the viewer's VISIBLE
apps/customer-web\app\(app)\parts-and-warranty\parts-orders\page.tsx:33:  await requireNavRoute('customer', '/parts-and-warranty/parts-orders');
apps/workshop-web\app\testing\road-test\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\testing\road-test\[id]\page.tsx:18:  await requireNavRoute('workshop', '/testing/road-test');
apps/workshop-web\app\testing\road-test\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\testing\road-test\page.tsx:18:  await requireNavRoute('workshop', '/testing/road-test');
apps/customer-web\app\(app)\my-vehicles\service-history\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/customer-web\app\(app)\my-vehicles\service-history\page.tsx:7: * ⚠️ `requireNavRoute` resolves against the viewer's VISIBLE NAVIGATION and is
apps/customer-web\app\(app)\my-vehicles\service-history\page.tsx:8: * not authentication — see `/my-vehicles/garage` for the full reasoning. The
apps/customer-web\app\(app)\my-vehicles\service-history\page.tsx:15:  await requireNavRoute('customer', '/my-vehicles/service-history');
apps/customer-web\app\(app)\my-vehicles\garage\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/customer-web\app\(app)\my-vehicles\garage\page.tsx:5: * /my-vehicles/garage — `01 (1).txt` §33, the customer workspace.
apps/customer-web\app\(app)\my-vehicles\garage\page.tsx:9: * `requireNavRoute` resolves the path against the viewer's VISIBLE NAVIGATION.
apps/customer-web\app\(app)\my-vehicles\garage\page.tsx:32:  await requireNavRoute('customer', '/my-vehicles/garage');
apps/workshop-web\app\testing\repair-test-results\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\testing\repair-test-results\[id]\page.tsx:18:  await requireNavRoute('workshop', '/testing/repair-test-results');
apps/workshop-web\app\testing\repair-test-results\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\testing\repair-test-results\page.tsx:18:  await requireNavRoute('workshop', '/testing/repair-test-results');
apps/workshop-web\app\testing\post-repair-scan\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\testing\post-repair-scan\[id]\page.tsx:18:  await requireNavRoute('workshop', '/testing/post-repair-scan');
apps/workshop-web\app\testing\post-repair-scan\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\testing\post-repair-scan\page.tsx:18:  await requireNavRoute('workshop', '/testing/post-repair-scan');
apps/workshop-web\app\solution-and-approval\variations\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\solution-and-approval\variations\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps/workshop-web\app\solution-and-approval\quotations\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\solution-and-approval\quotations\[id]\page.tsx:19:  await requireNavRoute('workshop', '/solution-and-approval/quotations');
apps/workshop-web\app\solution-and-approval\quotations\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\solution-and-approval\quotations\page.tsx:20:  await requireNavRoute('workshop', '/solution-and-approval/quotations');
apps/workshop-web\app\solution-and-approval\customer-proposals\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\solution-and-approval\customer-proposals\[id]\page.tsx:18:  await requireNavRoute('workshop', '/solution-and-approval/customer-proposals');
apps/workshop-web\app\solution-and-approval\customer-proposals\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\solution-and-approval\customer-proposals\page.tsx:19:  await requireNavRoute('workshop', '/solution-and-approval/customer-proposals');
apps/workshop-web\app\settings\workshop-profile\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\settings\workshop-profile\page.tsx:26:  await requireNavRoute('workshop', '/settings/workshop-profile');
apps/workshop-web\app\settings\pricing\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\settings\pricing\page.tsx:28:  await requireNavRoute('workshop', '/settings/pricing');
apps/workshop-web\app\requests-and-reception\register-vehicle\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\requests-and-reception\register-vehicle\page.tsx:25:  await requireNavRoute('workshop', ROUTE);
apps/workshop-web\app\requests-and-reception\register-customer\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\requests-and-reception\register-customer\page.tsx:25:  await requireNavRoute('workshop', ROUTE);
apps/workshop-web\app\repair-services\testing\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-services\testing\[id]\page.tsx:18:  await requireNavRoute('workshop', '/repair-services/testing');
apps/workshop-web\app\repair-services\testing\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-services\testing\page.tsx:18:  await requireNavRoute('workshop', '/repair-services/testing');
apps/workshop-web\app\repair-services\repairs-in-progress\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-services\repairs-in-progress\[id]\page.tsx:18:  await requireNavRoute('workshop', '/repair-services/repairs-in-progress');
apps/workshop-web\app\repair-services\repairs-in-progress\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-services\repairs-in-progress\page.tsx:19:  await requireNavRoute('workshop', '/repair-services/repairs-in-progress');
apps/workshop-web\app\repair-services\repair-plans\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-services\repair-plans\[id]\page.tsx:21:  await requireNavRoute('workshop', '/repair-services/repair-plans');
apps/workshop-web\app\repair-services\repair-plans\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-services\repair-plans\page.tsx:20:  await requireNavRoute('workshop', '/repair-services/repair-plans');
apps/workshop-web\app\repair-services\quality-control\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-services\quality-control\page.tsx:23:  await requireNavRoute('workshop', ROUTE);
apps/workshop-web\app\repair-services\inspection\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-services\inspection\[id]\page.tsx:22:  await requireNavRoute('workshop', '/repair-services/inspection');
apps/workshop-web\app\repair-services\inspection\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-services\inspection\page.tsx:25:  await requireNavRoute('workshop', '/repair-services/inspection');
apps/workshop-web\app\repair-services\diagnosis\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-services\diagnosis\[id]\page.tsx:21:  await requireNavRoute('workshop', '/repair-services/diagnosis');
apps/workshop-web\app\repair-services\diagnosis\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-services\diagnosis\page.tsx:20:  await requireNavRoute('workshop', '/repair-services/diagnosis');
apps/workshop-web\app\repair-control\variations\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-control\variations\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps/workshop-web\app\repair-control\testing-queue\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-control\testing-queue\[id]\page.tsx:18:  await requireNavRoute('workshop', '/repair-control/testing-queue');
apps/workshop-web\app\repair-control\testing-queue\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-control\testing-queue\page.tsx:18:  await requireNavRoute('workshop', '/repair-control/testing-queue');
apps/workshop-web\app\repair-control\testing\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-control\testing\[id]\page.tsx:18:  await requireNavRoute('workshop', '/repair-control/testing');
apps/workshop-web\app\repair-control\testing\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-control\testing\page.tsx:18:  await requireNavRoute('workshop', '/repair-control/testing');
apps/workshop-web\app\repair-control\repairs-in-progress\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-control\repairs-in-progress\[id]\page.tsx:18:  await requireNavRoute('workshop', '/repair-control/repairs-in-progress');
apps/workshop-web\app\repair-control\repairs-in-progress\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-control\repairs-in-progress\page.tsx:19:  await requireNavRoute('workshop', '/repair-control/repairs-in-progress');
apps/workshop-web\app\repair-control\repair-progress\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-control\repair-progress\[id]\page.tsx:18:  await requireNavRoute('workshop', '/repair-control/repair-progress');
apps/workshop-web\app\repair-control\repair-progress\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-control\repair-progress\page.tsx:19:  await requireNavRoute('workshop', '/repair-control/repair-progress');
apps/workshop-web\app\repair-control\repair-plans\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-control\repair-plans\[id]\page.tsx:21:  await requireNavRoute('workshop', '/repair-control/repair-plans');
apps/workshop-web\app\repair-control\repair-plans\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-control\repair-plans\page.tsx:20:  await requireNavRoute('workshop', '/repair-control/repair-plans');
apps/workshop-web\app\repair-control\ready-for-collection\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-control\ready-for-collection\page.tsx:14:  await requireNavRoute('workshop', '/repair-control/ready-for-collection');
apps/workshop-web\app\repair-control\quotations\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-control\quotations\[id]\page.tsx:19:  await requireNavRoute('workshop', '/repair-control/quotations');
apps/workshop-web\app\repair-control\quotations\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-control\quotations\page.tsx:20:  await requireNavRoute('workshop', '/repair-control/quotations');
apps/workshop-web\app\repair-control\quality-control-queue\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-control\quality-control-queue\page.tsx:18:  await requireNavRoute('workshop', ROUTE);
apps/workshop-web\app\repair-control\quality-control\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-control\quality-control\page.tsx:16:  await requireNavRoute('workshop', ROUTE);
apps/workshop-web\app\repair-control\internal-review\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-control\internal-review\page.tsx:14:  await requireNavRoute('workshop', '/repair-control/internal-review');
apps/workshop-web\app\repair-control\inspection-queue\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-control\inspection-queue\[id]\page.tsx:13:  await requireNavRoute('workshop', '/repair-control/inspection-queue');
apps/workshop-web\app\repair-control\inspection-queue\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-control\inspection-queue\page.tsx:15:  await requireNavRoute('workshop', '/repair-control/inspection-queue');
apps/workshop-web\app\repair-control\inspection\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-control\inspection\[id]\page.tsx:15:  await requireNavRoute('workshop', '/repair-control/inspection');
apps/workshop-web\app\repair-control\inspection\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-control\inspection\page.tsx:17:  await requireNavRoute('workshop', '/repair-control/inspection');
apps/workshop-web\app\repair-control\diagnosis-queue\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-control\diagnosis-queue\[id]\page.tsx:21:  await requireNavRoute('workshop', '/repair-control/diagnosis-queue');
apps/workshop-web\app\repair-control\diagnosis-queue\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-control\diagnosis-queue\page.tsx:20:  await requireNavRoute('workshop', '/repair-control/diagnosis-queue');
apps/workshop-web\app\repair-control\diagnosis\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-control\diagnosis\[id]\page.tsx:21:  await requireNavRoute('workshop', '/repair-control/diagnosis');
apps/workshop-web\app\repair-control\diagnosis\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-control\diagnosis\page.tsx:20:  await requireNavRoute('workshop', '/repair-control/diagnosis');
apps/workshop-web\app\repair-control\customer-approvals\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-control\customer-approvals\page.tsx:14:  await requireNavRoute('workshop', '/repair-control/customer-approvals');
apps/workshop-web\app\repair-control\customer-approval\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-control\customer-approval\[id]\page.tsx:18:  await requireNavRoute('workshop', '/repair-control/customer-approval');
apps/customer-web\app\(app)\my-vehicles\add-vehicle\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/customer-web\app\(app)\my-vehicles\add-vehicle\page.tsx:9: * this item, so `requireNavRoute` does not refuse them. See the garage page for
apps/customer-web\app\(app)\my-vehicles\add-vehicle\page.tsx:18:  await requireNavRoute('customer', '/my-vehicles/add-vehicle');
apps/workshop-web\app\repair-control\customer-approval\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\repair-control\customer-approval\page.tsx:19:  await requireNavRoute('workshop', '/repair-control/customer-approval');
apps/customer-web\app\(app)\home\dashboard\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/customer-web\app\(app)\home\dashboard\page.tsx:8: * "not built yet" placeholder — so the FIRST screen a customer saw after signing
apps/customer-web\app\(app)\home\dashboard\page.tsx:20:  await requireNavRoute('customer', '/home/dashboard');
apps/workshop-web\app\record-work\variation-requests\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\record-work\variation-requests\page.tsx:20:  await requireNavRoute('workshop', ROUTE);
apps/workshop-web\app\record-work\time-records\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\record-work\time-records\[id]\page.tsx:18:  await requireNavRoute('workshop', '/record-work/time-records');
apps/workshop-web\app\record-work\time-records\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\record-work\time-records\page.tsx:19:  await requireNavRoute('workshop', '/record-work/time-records');
apps/workshop-web\app\record-work\repair-tasks\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\record-work\repair-tasks\[id]\page.tsx:18:  await requireNavRoute('workshop', '/record-work/repair-tasks');
apps/workshop-web\app\record-work\repair-tasks\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\record-work\repair-tasks\page.tsx:19:  await requireNavRoute('workshop', '/record-work/repair-tasks');
apps/workshop-web\app\record-work\repair-evidence\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\record-work\repair-evidence\[id]\page.tsx:18:  await requireNavRoute('workshop', '/record-work/repair-evidence');
apps/workshop-web\app\record-work\repair-evidence\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\record-work\repair-evidence\page.tsx:19:  await requireNavRoute('workshop', '/record-work/repair-evidence');
apps/workshop-web\app\record-work\parts-used\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\record-work\parts-used\[id]\page.tsx:18:  await requireNavRoute('workshop', '/record-work/parts-used');
apps/workshop-web\app\record-work\parts-used\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\record-work\parts-used\page.tsx:19:  await requireNavRoute('workshop', '/record-work/parts-used');
apps/workshop-web\app\record-work\inspection-results\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\record-work\inspection-results\[id]\page.tsx:15:  await requireNavRoute('workshop', '/record-work/inspection-results');
apps/workshop-web\app\record-work\inspection-results\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\record-work\inspection-results\page.tsx:22:  await requireNavRoute('workshop', '/record-work/inspection-results');
apps/workshop-web\app\record-work\diagnostic-results\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\record-work\diagnostic-results\[id]\page.tsx:21:  await requireNavRoute('workshop', '/record-work/diagnostic-results');
apps/workshop-web\app\record-work\diagnostic-results\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\record-work\diagnostic-results\page.tsx:20:  await requireNavRoute('workshop', '/record-work/diagnostic-results');
apps/workshop-web\app\plan-work\repair-planning\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\plan-work\repair-planning\[id]\page.tsx:21:  await requireNavRoute('workshop', '/plan-work/repair-planning');
apps/workshop-web\app\plan-work\repair-planning\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\plan-work\repair-planning\page.tsx:20:  await requireNavRoute('workshop', '/plan-work/repair-planning');
apps/workshop-web\app\not-found.tsx:11: * `requireNavRoute` answers `notFound()` for a route that is not in THIS VIEWER'S
apps/workshop-web\app\my-jobs\testing-required\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\my-jobs\testing-required\page.tsx:14:  await requireNavRoute('workshop', '/my-jobs/testing-required');
apps/workshop-web\app\my-jobs\repair-in-progress\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\my-jobs\repair-in-progress\page.tsx:14:  await requireNavRoute('workshop', '/my-jobs/repair-in-progress');
apps/workshop-web\app\my-jobs\repair-approved\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\my-jobs\repair-approved\page.tsx:14:  await requireNavRoute('workshop', '/my-jobs/repair-approved');
apps/workshop-web\app\my-jobs\quality-control-returns\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\my-jobs\quality-control-returns\page.tsx:14:  await requireNavRoute('workshop', '/my-jobs/quality-control-returns');
apps/workshop-web\app\my-jobs\inspection-required\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\my-jobs\inspection-required\page.tsx:14:  await requireNavRoute('workshop', '/my-jobs/inspection-required');
apps/workshop-web\app\my-jobs\diagnosis-required\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\my-jobs\diagnosis-required\page.tsx:14:  await requireNavRoute('workshop', '/my-jobs/diagnosis-required');
apps/workshop-web\app\my-jobs\awaiting-parts\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\my-jobs\awaiting-parts\page.tsx:14:  await requireNavRoute('workshop', '/my-jobs/awaiting-parts');
apps/workshop-web\app\home\tasks\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\home\tasks\page.tsx:14:  await requireNavRoute('workshop', '/home/tasks');
apps/workshop-web\app\home\my-tasks\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\home\my-tasks\[id]\page.tsx:24:  await requireNavRoute('workshop', '/home/my-tasks');
apps/workshop-web\app\home\my-tasks\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\home\my-tasks\page.tsx:14:  await requireNavRoute('workshop', '/home/my-tasks');
apps/workshop-web\app\home\my-assigned-work\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\home\my-assigned-work\[id]\page.tsx:26:  await requireNavRoute('workshop', '/home/my-assigned-work');
apps/workshop-web\app\home\my-assigned-work\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\home\my-assigned-work\page.tsx:15:  await requireNavRoute('workshop', '/home/my-assigned-work');
apps/workshop-web\app\home\dashboard\page.tsx:5:import { currentViewer, grantsFor, navRoleFor, requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\home\dashboard\page.tsx:149:  await requireNavRoute('workshop', '/home/dashboard');
apps/workshop-web\app\home\dashboard\page.tsx:151:  // ⚠️ AFTER `requireNavRoute`, DELIBERATELY. The nav gate is documented as the
apps/workshop-web\app\home\dashboard\page.tsx:332:            <strong>Page content is not built yet.</strong> Every other route renders an honest “not built” page
apps/workshop-web\app\customers-and-vehicles\vehicles\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\customers-and-vehicles\vehicles\[id]\page.tsx:22:  await requireNavRoute('workshop', '/customers-and-vehicles/vehicles');
apps/workshop-web\app\customers-and-vehicles\vehicles\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\customers-and-vehicles\vehicles\page.tsx:18:  await requireNavRoute('workshop', '/customers-and-vehicles/vehicles');
apps/workshop-web\app\customers-and-vehicles\register-vehicle\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\customers-and-vehicles\register-vehicle\page.tsx:25:  await requireNavRoute('workshop', ROUTE);
apps/workshop-web\app\customers-and-vehicles\register-customer\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\customers-and-vehicles\register-customer\page.tsx:25:  await requireNavRoute('workshop', ROUTE);
apps/workshop-web\app\customers-and-vehicles\customers\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\customers-and-vehicles\customers\[id]\page.tsx:22:  await requireNavRoute('workshop', '/customers-and-vehicles/customers');
apps/workshop-web\app\customers-and-vehicles\customers\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\customers-and-vehicles\customers\page.tsx:18:  await requireNavRoute('workshop', '/customers-and-vehicles/customers');
apps/workshop-web\app\customers\register-customer\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\customers\register-customer\page.tsx:20:  await requireNavRoute('workshop', '/customers/register-customer');
apps/workshop-web\app\customers\customer-search\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\customers\customer-search\[id]\page.tsx:22:  await requireNavRoute('workshop', '/customers/customer-search');
apps/workshop-web\app\customers\customer-search\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\customers\customer-search\page.tsx:18:  await requireNavRoute('workshop', '/customers/customer-search');
apps/workshop-web\app\customer-reception\vehicles\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\customer-reception\vehicles\[id]\page.tsx:22:  await requireNavRoute('workshop', '/customer-reception/vehicles');
apps/workshop-web\app\customer-reception\vehicles\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\customer-reception\vehicles\page.tsx:18:  await requireNavRoute('workshop', '/customer-reception/vehicles');
apps/workshop-web\app\customer-reception\register-vehicle\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\customer-reception\register-vehicle\page.tsx:25:  await requireNavRoute('workshop', ROUTE);
apps/workshop-web\app\customer-reception\register-customer\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\customer-reception\register-customer\page.tsx:25:  await requireNavRoute('workshop', ROUTE);
apps/workshop-web\app\customer-reception\customers\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\customer-reception\customers\[id]\page.tsx:22:  await requireNavRoute('workshop', '/customer-reception/customers');
apps/workshop-web\app\customer-reception\customers\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\customer-reception\customers\page.tsx:26:  await requireNavRoute('workshop', '/customer-reception/customers');
apps/workshop-web\app\customer-approval\quotations\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\customer-approval\quotations\[id]\page.tsx:19:  await requireNavRoute('workshop', '/customer-approval/quotations');
apps/workshop-web\app\customer-approval\quotations\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\customer-approval\quotations\page.tsx:20:  await requireNavRoute('workshop', '/customer-approval/quotations');
apps/workshop-web\app\customer-approval\pending-approvals\[id]\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\customer-approval\pending-approvals\[id]\page.tsx:18:  await requireNavRoute('workshop', '/customer-approval/pending-approvals');
apps/workshop-web\app\customer-approval\pending-approvals\page.tsx:1:import { requireNavRoute } from '@autoworkshop/next-shell';
apps/workshop-web\app\customer-approval\pending-approvals\page.tsx:19:  await requireNavRoute('workshop', '/customer-approval/pending-approvals');
packages\marketplace-ui\src\marketplace-landing.tsx:597:            CAPABILITY. It previously said ordering "is not built yet" while an
packages\next-shell\src\quick-create.ts:25: * the same three functions in the same order as `requireNavRoute`. The button
packages\next-shell\src\quick-create.ts:38: * the target page calls `requireNavRoute` itself, and the API re-derives every
packages\next-shell\src\quick-create.ts:53:  // Memoised per request by React's `cache()`, exactly as `requireNavRoute`
packages\next-shell\src\ModulePage.tsx:13: * The shared "screen not built yet" page behind each workspace's catch-all
packages\next-shell\src\ModulePage.tsx:47:export async function renderModulePage(
packages\next-shell\src\ModulePage.tsx:95:        description="The navigation, routing and breadcrumbs for this screen are working — the screen's own content is scheduled for a later phase. Access control arrives with this module's own API, which enforces it server-side."
packages\next-shell\src\index.ts:5:export { renderModulePage } from './ModulePage';
packages\next-shell\src\index.ts:28:export { requireNavRoute } from './require-route';
packages\next-shell\src\api.ts:306: * not have it. Same rule as `renderModulePage` and `WorkspaceAccessDenied`.
packages\next-shell\src\require-route.ts:31: * exists, every route goes through `app/[...slug]`, and `renderModulePage`
packages\next-shell\src\require-route.ts:56:export async function requireNavRoute(
packages\next-shell\src\require-access.ts:43: * `renderModulePage` already uses for hidden modules.
packages\next-shell\src\viewer.test.ts:143:        // Exactly the composition `renderModulePage` performs. Computed
packages\next-shell\src\viewer.test.ts:285:    // The regression this guards. If `renderModulePage` ever drops
packages\navigation\src\workspaces.ts:82:    // nav entry the screen is unreachable — `requireNavRoute` resolves a path
packages\navigation\src\workspaces.ts:776:  // catch-all renders an honest "not built yet" page for every unbuilt route.
packages\next-shell\src\WorkspaceShell.tsx:57:   * renders this component and by `renderModulePage` for the same request.
packages\next-shell\src\WorkspaceGate.test.ts:7: * `renderModulePage` protected the admin workspace only for as long as every
packages\next-shell\src\WorkspaceGate.tsx:10: * a platform-administration screen was `renderModulePage()` resolving the route

 succeeded in 7635ms:
infrastructure\migrations\001_tenancy_foundation.sql:67:    created_by   uuid,
infrastructure\migrations\001_tenancy_foundation.sql:69:    updated_by   uuid
infrastructure\migrations\001_tenancy_foundation.sql:88:    created_by   uuid,
infrastructure\migrations\001_tenancy_foundation.sql:90:    updated_by   uuid
infrastructure\migrations\001_tenancy_foundation.sql:107:    created_by      uuid,
infrastructure\migrations\001_tenancy_foundation.sql:109:    updated_by      uuid
infrastructure\migrations\001_tenancy_foundation.sql:130:    created_by        uuid,
infrastructure\migrations\001_tenancy_foundation.sql:132:    updated_by        uuid
infrastructure\migrations\001_tenancy_foundation.sql:151:    created_by      uuid,
infrastructure\migrations\001_tenancy_foundation.sql:153:    updated_by      uuid,
apps/api\src\identity\organization.service.ts:85:        `INSERT INTO identity.organizations (tenant_id, name, org_type, created_by)
apps/api\src\identity\membership.service.ts:178:           (tenant_id, organization_id, branch_id, user_id, role_name, created_by)
apps/api\src\identity\membership.service.ts:256:            SET status = $2, updated_at = now(), updated_by = $3
apps/api\src\identity\branch.service.ts:135:           (tenant_id, organization_id, name, location, operating_hours, created_by)
apps/api\src\repair\variation.spec.ts:14: * ⚠️ THESE ARE NOT THE CONTROL. Migration 032's constraints and triggers refuse
apps/api\src\repair\variation.service.ts:39: * ⚠️ `withTenant`, because the policy keys on the tenant and the triggers read
apps/api\src\repair\variation.service.ts:93:           LEFT JOIN identity.users rb ON rb.id = v.created_by
apps/api\src\repair\variation.service.ts:175:            effect_on_completion, created_by, updated_by)
apps/api\src\repair\variation.service.ts:221:        `SELECT id, status, created_by FROM repair.repair_variations
apps/api\src\repair\variation.service.ts:226:      const row = current.rows[0] as { status: string; created_by: string | null } | undefined;
apps/api\src\repair\variation.service.ts:229:      if (row.created_by !== null && row.created_by === ctx.userId) {
apps/api\src\repair\variation.service.ts:246:                  internally_reviewed_at=now(), updated_at=now(), updated_by=$2
apps/api\src\repair\variation.service.ts:255:              SET status='sent_to_customer', sent_at=now(), updated_at=now(), updated_by=$2
apps/api\src\repair\variation.service.ts:306:        // it and the sequence starts again, which is why 032's trigger allows
apps/api\src\repair\variation.service.ts:312:                  updated_at=now(), updated_by=$3
apps/api\src\repair\variation.service.ts:336:                updated_by = $6
apps/api\src\repair\variation.service.ts:364:         LEFT JOIN identity.users rb ON rb.id = v.created_by
apps/api\src\repair\variation.service.ts:406:        CAN_REVIEW_VARIATION.has(ctx.activeRole) && r['created_by'] !== ctx.userId,
apps/api\src\repair\variation.service.ts:407:      raisedByViewer: r['created_by'] === ctx.userId,
apps/api\src\repair\testing.service.ts:187:            created_by, updated_by)
apps/api\src\repair\testing.service.ts:266:            comments, tested_by, recorded_by, updated_by)
apps/api\src\repair\testing.service.ts:361:    set('updated_by', ctx.userId);
apps/api\src\repair\testing.service.ts:433:    set('updated_by', ctx.userId);
apps/api\src\repair\testing.service.ts:486:                override_reason = $2, updated_by = $1, updated_at = now()
apps/api\src\repair\testing.service.ts:559:                updated_by = $1, updated_at = now()
apps/api\src\repair\repair.controller.ts:312:   * finds and a trigger insists on. §34 opens "after completing the repair".
apps/api\src\repair\repair.controller.ts:626:   * trigger refuses it once the plan is submitted, and the grant exists so that
apps/api\src\repair\repair.controller.ts:1132: * ⚠️ `TenantGuard`, because the independence trigger and the tenant policy both
apps/api\src\repair\repair.controller.ts:1180: * ⚠️ `TenantGuard`, because migration 032's policy and triggers read the context
apps/api\src\repair\repair-plan.spec.ts:26: * ⚠️ The triggers, the RLS and the DELETE grants are proven separately against real
apps/api\src\repair\repair-plan.spec.ts:972:    // row, and 014's trigger only refused writes once the plan was SETTLED — so while a
apps/api\src\repair\repair-plan.spec.ts:978:    // afterwards by verify/015_plan_identity_immutable.sql.
apps/api\src\repair\repair-plan.spec.ts:984:    const sql = migration('015_repair_plan_identity_immutable.sql');
apps/api\src\repair\repair-plan.service.ts:189: *   · A task may name the finding it addresses, and 014's trigger refuses any
apps/api\src\repair\repair-plan.service.ts:198: * rather than edits, immutable on submission in the service AND by trigger, role
apps/api\src\repair\repair-plan.service.ts:368:            started_by, created_by, updated_by)
apps/api\src\repair\repair-plan.service.ts:445:    set('updated_by', ctx.userId);
apps/api\src\repair\repair-plan.service.ts:497:      // 014's trigger enforces this too, and deliberately so — that layer holds for
apps/api\src\repair\repair-plan.service.ts:520:            recorded_by, updated_by)
apps/api\src\repair\repair-plan.service.ts:619:    // `updated_by` records the last, so both questions have an answer on the row
apps/api\src\repair\repair-plan.service.ts:621:    set('updated_by', ctx.userId);
apps/api\src\repair\repair-plan.service.ts:721:            SET position = $1, updated_by = $2, updated_at = now()
apps/api\src\repair\repair-plan.service.ts:727:            SET position = $1, updated_by = $2, updated_at = now()
apps/api\src\repair\repair-plan.service.ts:756:   * Refused once the plan is submitted, by `assertWritable` here AND by trigger.
apps/api\src\repair\repair-plan.service.ts:834:            recorded_by, updated_by)
apps/api\src\repair\repair-plan.service.ts:908:    set('updated_by', ctx.userId);
apps/api\src\repair\repair-plan.service.ts:1057:                updated_at = now(), updated_by = $1
apps/api\src\repair\repair-plan.service.ts:1142:          -- trigger, but as a 500.
apps/api\src\repair\repair-plan.service.ts:1174:                updated_at = now(), updated_by = $2
apps/api\src\repair\repair-plan.service.ts:1503:   * 014's trigger enforces the same rule and is the layer that holds for any future
apps/api\src\repair\repair-plan-rules.ts:30: * trigger in 014, not only here.
apps/api\src\repair\quotation.spec.ts:590:    // to remove it, and the trigger — not the missing grant — is the narrowing.
apps/api\src\repair\quotation.service.ts:79:   * Never stored. Every input is immutable once the quotation leaves `draft`, so a
apps/api\src\repair\quotation.service.ts:257:            valid_until, warranty_terms, prepared_by, created_by, updated_by)
apps/api\src\repair\quotation.service.ts:351:            repair_plan_task_id, description, quantity, unit, unit_price, recorded_by, updated_by)
apps/api\src\repair\quotation.service.ts:376:            repair_plan_resource_id, description, quantity, unit, unit_price, recorded_by, updated_by)
apps/api\src\repair\quotation.service.ts:420:    set('updated_by', ctx.userId);
apps/api\src\repair\quotation.service.ts:463:            description, quantity, unit, unit_price, is_optional, recorded_by, updated_by)
apps/api\src\repair\quotation.service.ts:513:    set('updated_by', ctx.userId);
apps/api\src\repair\quotation.service.ts:625:                updated_at = now(), updated_by = $1
apps/api\src\repair\quotation.service.ts:705:                updated_at = now(), updated_by = $2
apps/api\src\repair\quality.spec.ts:15: * `repair.user_worked_on_job_card()` and the `trg_qc_independence` trigger, and
apps/api\src\repair\quality.spec.ts:18: * prove a trigger fires.
apps/api\src\repair\quality.service.ts:56: * `verify/030` proves the trigger against a real database from both sides —
apps/api\src\repair\quality.service.ts:59: * ⚠️ `withTenant`, because the policies key on the tenant and the triggers read
apps/api\src\repair\quality.service.ts:83:   * `repair.user_worked_on_job_card()` the trigger uses — lets the screen say so
apps/api\src\repair\quality.service.ts:88:   * the trigger decides what the database ACCEPTS, and it would refuse a
apps/api\src\repair\quality.service.ts:260:              inspector_id, created_by, updated_by)
apps/api\src\repair\quality.service.ts:349:                updated_by = $7
apps/api\src\repair\quality-rules.ts:16: * `repair.user_worked_on_job_card()` plus the `trg_qc_independence` trigger,
apps/api\src\repair\proposal.spec.ts:22: * immutability is enforced in the service as well as by trigger.
apps/api\src\repair\proposal.spec.ts:25: * rule; and by trigger in migration 017, proven by `verify/017_repair_proposals.sql` and
apps/api\src\repair\proposal.spec.ts:97:  superseded_by: null,
apps/api\src\repair\proposal.spec.ts:98:  issued_by_name: null,
apps/api\src\repair\proposal.spec.ts:120:  openCheck: /status IN \('draft', 'issued'\)/,
apps/api\src\repair\proposal.spec.ts:123:  insert: /INSERT INTO repair\.repair_proposals/,
apps/api\src\repair\proposal.spec.ts:124:  update: /UPDATE repair\.repair_proposals/,
apps/api\src\repair\proposal.spec.ts:231:      [Q.openCheck, [{ id: PROPOSAL_ID, status: 'issued', version_no: 1 }]],
apps/api\src\repair\proposal.spec.ts:265:    const supersede = queries.find((q) => Q.update.test(q.text) && /superseded_by/.test(q.text));
apps/api\src\repair\proposal.spec.ts:344:    [{ id: PROPOSAL_ID, status: 'issued', version_no: 1, job_number: 'JC-1' }],
apps/api\src\repair\proposal.spec.ts:430:    [{ id: PROPOSAL_ID, status: 'issued', version_no: 1, job_number: 'JC-1', display_name: 'Kwame Mensah' }],
apps/api\src\repair\proposal.spec.ts:584:    readHandlers({ header: [headerRow({ status: 'issued', issued_at: new Date('2026-08-01T00:00:00Z'), ...over })] });
apps/api\src\repair\proposal.spec.ts:634:    const issuedRow = [Q.draft, [{ id: PROPOSAL_ID, status: 'issued', version_no: 1, job_number: 'JC-1' }]] as [RegExp, unknown[]];
apps/api\src\repair\proposal.spec.ts:676:  const SQL = () => migration('017_repair_proposals.sql');
apps/api\src\repair\proposal.spec.ts:728:    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE ON repair\.repair_proposals/);
apps/api\src\repair\proposal.spec.ts:729:    expect(sql).toMatch(/REVOKE DELETE ON repair\.repair_proposals/);
apps/api\src\repair\proposal.spec.ts:730:    expect(sql).not.toMatch(/GRANT[^;]*DELETE[^;]*ON repair\.repair_proposals/);
apps/api\src\repair\proposal.spec.ts:735:    expect(sql).toMatch(/ALTER TABLE repair\.repair_proposals ENABLE ROW LEVEL SECURITY/);
apps/api\src\repair\proposal.spec.ts:736:    expect(sql).toMatch(/ALTER TABLE repair\.repair_proposals FORCE\s+ROW LEVEL SECURITY/);
apps/api\src\repair\proposal.service.ts:33: * ⚠️ EVERY FIELD HERE IS READ, NEVER COPIED. Each source is already immutable by the
apps/api\src\repair\proposal.service.ts:107:   * and the version rather than stored, because both are already immutable and a
apps/api\src\repair\proposal.service.ts:159: * "Approved proposals shall be immutable. A material change shall create a new
apps/api\src\repair\proposal.service.ts:162: *   · A decided proposal cannot be edited — in the service AND by trigger. The only
apps/api\src\repair\proposal.service.ts:163: *     writable field left on it is `superseded_by`, because recording the
apps/api\src\repair\proposal.service.ts:230:        `SELECT id, status, version_no FROM repair.repair_proposals
apps/api\src\repair\proposal.service.ts:232:            AND status IN ('draft', 'issued')
apps/api\src\repair\proposal.service.ts:249:        `SELECT id, version_no, status FROM repair.repair_proposals
apps/api\src\repair\proposal.service.ts:291:        `INSERT INTO repair.repair_proposals
apps/api\src\repair\proposal.service.ts:293:            created_by, updated_by)
apps/api\src\repair\proposal.service.ts:301:      // the old row points at, and the trigger permits exactly this one write on a
apps/api\src\repair\proposal.service.ts:305:          `UPDATE repair.repair_proposals
apps/api\src\repair\proposal.service.ts:306:              SET superseded_by = $1, status = 'superseded', updated_at = now(), updated_by = $2
apps/api\src\repair\proposal.service.ts:352:    set('updated_by', ctx.userId);
apps/api\src\repair\proposal.service.ts:356:    const sql = `UPDATE repair.repair_proposals SET ${sets.join(', ')}
apps/api\src\repair\proposal.service.ts:398:        `UPDATE repair.repair_proposals
apps/api\src\repair\proposal.service.ts:399:            SET status = 'issued', issued_by = $1, issued_at = now(),
apps/api\src\repair\proposal.service.ts:400:                updated_at = now(), updated_by = $1
apps/api\src\repair\proposal.service.ts:478:           FROM repair.repair_proposals p
apps/api\src\repair\proposal.service.ts:497:      if (row.status !== 'issued') {
apps/api\src\repair\proposal.service.ts:505:        `UPDATE repair.repair_proposals
apps/api\src\repair\proposal.service.ts:509:                updated_at = now(), updated_by = $6
apps/api\src\repair\proposal.service.ts:607:           FROM repair.repair_proposals p
apps/api\src\repair\proposal.service.ts:627:      if (row.status !== 'issued') {
apps/api\src\repair\proposal.service.ts:635:        `UPDATE repair.repair_proposals
apps/api\src\repair\proposal.service.ts:639:                updated_at = now(), updated_by = $5
apps/api\src\repair\proposal.service.ts:702:              p.decided_by_name, p.decision_channel, p.decision_note, p.superseded_by,
apps/api\src\repair\proposal.service.ts:703:              ib.display_name AS issued_by_name,
apps/api\src\repair\proposal.service.ts:725:         FROM repair.repair_proposals p
apps/api\src\repair\proposal.service.ts:738:         LEFT JOIN identity.users ib ON ib.id = p.issued_by
apps/api\src\repair\proposal.service.ts:860:        issuedByName: row.issued_by_name,
apps/api\src\repair\proposal.service.ts:870:        supersededBy: row.superseded_by,
apps/api\src\repair\proposal.service.ts:962:          status === 'issued' &&
apps/api\src\repair\proposal.service.ts:969:          row.superseded_by === null &&
apps/api\src\repair\proposal.service.ts:1013:         FROM repair.repair_proposals p
apps/api\src\repair\proposal.service.ts:1025:        row.status === 'issued'
apps/api\src\repair\proposal.service.ts:1029:            'immutable and a material change requires a NEW VERSION — prepare one instead',
apps/api\src\repair\proposal.service.ts:1151:  superseded_by: string | null;
apps/api\src\repair\proposal.service.ts:1152:  issued_by_name: string | null;
apps/api\src\repair\pricing.service.ts:142:            created_by, updated_by)
apps/api\src\repair\pricing.service.ts:151:               updated_by             = EXCLUDED.updated_by,
apps/api\src\repair\job-card.service.ts:360:            mileage_at_intake, created_by)
apps/api\src\repair\job-card.service.ts:543:                updated_by = $2
apps/api\src\repair\inspection.spec.ts:21: * refused BEFORE the trigger has to refuse it.
apps/api\src\repair\inspection.spec.ts:23: * ⚠️ The trigger is proven separately, against real Postgres, by attempting a
apps/api\src\repair\inspection.service.ts:187:            started_by, created_by, updated_by)
apps/api\src\repair\inspection.service.ts:320:                  updated_at = now(), updated_by = $3
apps/api\src\repair\inspection.service.ts:402:                updated_at = now(), updated_by = $1
apps/api\src\repair\inspection.service.ts:602:        -- inspection — refused by the trigger, but as a 500.
apps/api\src\repair\execution.spec.ts:130:  approvedProposal: /FROM repair\.repair_proposals pr/,
apps/api\src\repair\execution.spec.ts:539:    // §7 as a foreign key plus a trigger. The five confirmations are recorded as well,
apps/api\src\repair\execution.service.ts:34:  /** Read from the immutable plan, never copied. */
apps/api\src\repair\execution.service.ts:140: * foreign key to an APPROVED proposal plus a trigger, not a checkbox. §32's five
apps/api\src\repair\execution.service.ts:227:      // priced it. One query rather than three, because all three are immutable by
apps/api\src\repair\execution.service.ts:231:           FROM repair.repair_proposals pr
apps/api\src\repair\execution.service.ts:261:            service_bay, readiness_note, started_by, created_by, updated_by)
apps/api\src\repair\execution.service.ts:275:            created_by, updated_by)
apps/api\src\repair\execution.service.ts:330:    set('updated_by', ctx.userId);
apps/api\src\repair\execution.service.ts:391:                -- change 500d. The same parameter in updated_by below is fine,
apps/api\src\repair\execution.service.ts:400:                updated_by = $4, updated_at = now()
apps/api\src\repair\execution.service.ts:463:            SET ended_at = now(), updated_by = $1, updated_at = now()
apps/api\src\repair\execution.service.ts:472:            technician_id, service_bay, repair_stage, note, created_by, updated_by)
apps/api\src\repair\execution.service.ts:506:            SET ended_at = now(), updated_by = $1, updated_at = now()
apps/api\src\repair\execution.service.ts:566:            note, recorded_by, updated_by)
apps/api\src\repair\execution.service.ts:697:                updated_by = $1, updated_at = now()
apps/api\src\repair\execution.service.ts:745:         JOIN repair.repair_proposals pr ON pr.id = e.proposal_id AND pr.tenant_id = e.tenant_id
apps/api\src\repair\diagnosis.spec.ts:26: * ⚠️ The triggers, the RLS and the DELETE grant are proven separately against real
apps/api\src\repair\diagnosis.spec.ts:599:  it('refuses to add a finding to a SUBMITTED diagnosis, before the trigger has to', async () => {
apps/api\src\repair\diagnosis.spec.ts:1139:    // 012 revoked both. 013 grants the child back, narrowly, because the trigger
apps/api\src\repair\diagnosis.service.ts:140: * rather than edits, immutable on submission in the service AND by trigger, role
apps/api\src\repair\diagnosis.service.ts:276:            started_by, created_by, updated_by)
apps/api\src\repair\diagnosis.service.ts:597:   * trigger in the database. See migration 013.
apps/api\src\repair\diagnosis.service.ts:669:            SET summary = $1, updated_at = now(), updated_by = $2
apps/api\src\repair\diagnosis.service.ts:727:                updated_at = now(), updated_by = $1
apps/api\src\repair\diagnosis.service.ts:803:          -- the trigger, but as a 500.
apps/api\src\repair\diagnosis.service.ts:835:                updated_at = now(), updated_by = $2
apps/api\src\repair\diagnosis-rules.ts:27: * it is enforced by trigger in 012, not only here.
apps/api\src\core\vehicle.service.ts:334:              insurance_expires_on, created_by)
apps/api\src\core\customer.service.ts:250:            preferred_contact, location, notes, created_by)
apps/api\src\marketplace\order.service.ts:334:   * simply does not offer the other columns. If it tried, the trigger would
apps/api\src\marketplace\order.service.ts:335:   * raise `insufficient_privilege`. RLS picks the ROW, the trigger picks the
apps/api\src\catalogue\catalogue-write-rules.ts:18: * RLS and the column-guard triggers, which deny independently of anything this
apps/api\src\catalogue\catalogue-write-rules.ts:272: * `is_published`, `is_verified`, `created_by` and `id` are frozen there and are
apps/api\src\catalogue\catalogue-write-rules.spec.ts:175:    // Publication is an administrator decision (024). Even if the trigger were
apps/api\src\catalogue\catalogue-write-rules.spec.ts:258:    // The trigger is the guard; `parseSupplierPatch` simply never offers these.
apps/api\src\catalogue\catalogue-write-rules.spec.ts:259:    // If a column is added to the trigger later, this test says so.
apps/api\src\catalogue\catalogue-write-rules.spec.ts:261:    for (const frozen of ['is_published', 'is_verified', 'slug', 'created_by']) {
apps/api\src\catalogue\supplier-catalogue.service.ts:41: * also a policy or a trigger. What the service adds is a sentence a human can
apps/api\src\catalogue\supplier-catalogue.service.ts:42: * act on: `insufficient_privilege` from a trigger is correct and unreadable.
apps/api\src\catalogue\supplier-catalogue.service.ts:56:   * admits the membership while `created_by` matches the caller — so a failure
apps/api\src\catalogue\supplier-catalogue.service.ts:127:          `INSERT INTO catalogue.suppliers (slug, name, country, city, website, created_by)
apps/api\src\authz\permission-matrix.ts:123: * `platform_administrator`. Nine policies and three triggers were therefore
infrastructure\migrations\004_core_customers_and_vehicles.sql:59:-- protecting a list of car manufacturers. `created_by_tenant_id` records who
infrastructure\migrations\004_core_customers_and_vehicles.sql:68:    created_by_tenant_id  uuid REFERENCES identity.tenants(id) ON DELETE SET NULL,
infrastructure\migrations\004_core_customers_and_vehicles.sql:70:    created_by            uuid,
infrastructure\migrations\004_core_customers_and_vehicles.sql:72:    updated_by            uuid
infrastructure\migrations\004_core_customers_and_vehicles.sql:83:    created_by_tenant_id  uuid REFERENCES identity.tenants(id) ON DELETE SET NULL,
infrastructure\migrations\004_core_customers_and_vehicles.sql:85:    created_by            uuid,
infrastructure\migrations\004_core_customers_and_vehicles.sql:87:    updated_by            uuid
infrastructure\migrations\004_core_customers_and_vehicles.sql:127:    created_by       uuid,
infrastructure\migrations\004_core_customers_and_vehicles.sql:129:    updated_by       uuid
infrastructure\migrations\004_core_customers_and_vehicles.sql:178:    created_by           uuid,
infrastructure\migrations\004_core_customers_and_vehicles.sql:180:    updated_by           uuid
infrastructure\migrations\006_repair_job_cards.sql:127:    created_by       uuid,
infrastructure\migrations\006_repair_job_cards.sql:129:    updated_by       uuid
infrastructure\migrations\008_job_card_stage_events.sql:128:SELECT j.tenant_id, j.organization_id, j.id, NULL, j.stage, j.created_by, j.opened_at
infrastructure\migrations\010_repair_inspections.sql:45:-- A submitted inspection is immutable, and a re-inspection is a NEW row with the
infrastructure\migrations\010_repair_inspections.sql:102:    created_by       uuid,
infrastructure\migrations\010_repair_inspections.sql:104:    updated_by       uuid,
infrastructure\migrations\010_repair_inspections.sql:211:-- ── a submitted inspection is immutable ─────────────────────────────────────
infrastructure\migrations\010_repair_inspections.sql:225:RETURNS trigger
infrastructure\migrations\010_repair_inspections.sql:241:DROP TRIGGER IF EXISTS trg_inspections_immutable ON repair.inspections;
infrastructure\migrations\010_repair_inspections.sql:242:CREATE TRIGGER trg_inspections_immutable
infrastructure\migrations\010_repair_inspections.sql:248:RETURNS trigger
infrastructure\migrations\010_repair_inspections.sql:261:    -- `NEW.inspection_id` on a DELETE trigger is an error, not a NULL.
infrastructure\migrations\010_repair_inspections.sql:289:DROP TRIGGER IF EXISTS trg_inspection_items_immutable ON repair.inspection_items;
infrastructure\migrations\010_repair_inspections.sql:290:CREATE TRIGGER trg_inspection_items_immutable
infrastructure\migrations\010_repair_inspections.sql:318:-- inspection is worked on over a shift. The trigger above is what stops the
infrastructure\migrations\018_organization_profile.sql:7:-- it in a dispute. `1.txt` §424 makes an approved one immutable precisely because
infrastructure\migrations\018_organization_profile.sql:73:    created_by       uuid,
infrastructure\migrations\018_organization_profile.sql:75:    updated_by       uuid,
infrastructure\migrations\017_repair_proposals.sql:25:-- recorded, and every one of them is already immutable at the point a proposal is
infrastructure\migrations\017_repair_proposals.sql:76:CREATE TABLE IF NOT EXISTS repair.repair_proposals (
infrastructure\migrations\017_repair_proposals.sql:97:                     CHECK (status IN ('draft', 'issued', 'approved', 'declined',
infrastructure\migrations\017_repair_proposals.sql:111:    issued_by        uuid,
infrastructure\migrations\017_repair_proposals.sql:139:    superseded_by    uuid,
infrastructure\migrations\017_repair_proposals.sql:141:    created_by       uuid,
infrastructure\migrations\017_repair_proposals.sql:143:    updated_by       uuid,
infrastructure\migrations\017_repair_proposals.sql:148:        status = 'draft' OR (issued_at IS NOT NULL AND issued_by IS NOT NULL)
infrastructure\migrations\017_repair_proposals.sql:154:        status IN ('draft', 'issued', 'superseded')
infrastructure\migrations\017_repair_proposals.sql:167:        OR (status IN ('draft', 'issued', 'superseded') AND decision IS NULL)
infrastructure\migrations\017_repair_proposals.sql:196:ALTER TABLE repair.repair_proposals
infrastructure\migrations\017_repair_proposals.sql:197:    DROP CONSTRAINT IF EXISTS uq_repair_proposals_id_tenant_org;
infrastructure\migrations\017_repair_proposals.sql:198:ALTER TABLE repair.repair_proposals
infrastructure\migrations\017_repair_proposals.sql:199:    ADD CONSTRAINT uq_repair_proposals_id_tenant_org UNIQUE (id, tenant_id, organization_id);
infrastructure\migrations\017_repair_proposals.sql:202:ALTER TABLE repair.repair_proposals
infrastructure\migrations\017_repair_proposals.sql:203:    DROP CONSTRAINT IF EXISTS fk_proposal_superseded_by;
infrastructure\migrations\017_repair_proposals.sql:204:ALTER TABLE repair.repair_proposals
infrastructure\migrations\017_repair_proposals.sql:205:    ADD CONSTRAINT fk_proposal_superseded_by
infrastructure\migrations\017_repair_proposals.sql:206:        FOREIGN KEY (superseded_by, tenant_id, organization_id)
infrastructure\migrations\017_repair_proposals.sql:207:        REFERENCES repair.repair_proposals (id, tenant_id, organization_id)
infrastructure\migrations\017_repair_proposals.sql:211:    ON repair.repair_proposals (job_card_id, version_no DESC);
infrastructure\migrations\017_repair_proposals.sql:213:    ON repair.repair_proposals (tenant_id);
infrastructure\migrations\017_repair_proposals.sql:215:    ON repair.repair_proposals (quotation_id);
infrastructure\migrations\017_repair_proposals.sql:219:    ON repair.repair_proposals (organization_id, issued_at DESC)
infrastructure\migrations\017_repair_proposals.sql:220:    WHERE status = 'issued';
infrastructure\migrations\017_repair_proposals.sql:230:-- ⚠️ ONE FIELD REMAINS WRITABLE ON A DECIDED PROPOSAL: `superseded_by`. §424 says
infrastructure\migrations\017_repair_proposals.sql:236:RETURNS trigger
infrastructure\migrations\017_repair_proposals.sql:273:    IF OLD.status = 'issued' THEN
infrastructure\migrations\017_repair_proposals.sql:305:DROP TRIGGER IF EXISTS trg_proposals_immutable ON repair.repair_proposals;
infrastructure\migrations\017_repair_proposals.sql:306:CREATE TRIGGER trg_proposals_immutable
infrastructure\migrations\017_repair_proposals.sql:307:    BEFORE UPDATE ON repair.repair_proposals
infrastructure\migrations\017_repair_proposals.sql:318:RETURNS trigger
infrastructure\migrations\017_repair_proposals.sql:338:DROP TRIGGER IF EXISTS trg_proposal_quotation_approved ON repair.repair_proposals;
infrastructure\migrations\017_repair_proposals.sql:340:    BEFORE INSERT ON repair.repair_proposals
infrastructure\migrations\017_repair_proposals.sql:348:ALTER TABLE repair.repair_proposals ENABLE ROW LEVEL SECURITY;
infrastructure\migrations\017_repair_proposals.sql:349:ALTER TABLE repair.repair_proposals FORCE  ROW LEVEL SECURITY;
infrastructure\migrations\017_repair_proposals.sql:351:DROP POLICY IF EXISTS tenant_isolation ON repair.repair_proposals;
infrastructure\migrations\017_repair_proposals.sql:352:CREATE POLICY tenant_isolation ON repair.repair_proposals
infrastructure\migrations\017_repair_proposals.sql:363:GRANT SELECT, INSERT, UPDATE ON repair.repair_proposals TO autoworkshop_app;
infrastructure\migrations\017_repair_proposals.sql:364:REVOKE DELETE ON repair.repair_proposals FROM autoworkshop_app;
infrastructure\migrations\014_repair_plans.sql:33:-- trigger that keeps it honest.
infrastructure\migrations\014_repair_plans.sql:35:-- The trigger enforces what a foreign key cannot: that the finding belongs to
infrastructure\migrations\014_repair_plans.sql:70:-- in one transaction, attempts rather than edits, immutable on submission in the
infrastructure\migrations\014_repair_plans.sql:71:-- service AND by trigger, composite foreign keys carrying the tenant predicate a
infrastructure\migrations\014_repair_plans.sql:139:    created_by       uuid,
infrastructure\migrations\014_repair_plans.sql:141:    updated_by       uuid,
infrastructure\migrations\014_repair_plans.sql:216:    -- What IS enforced (by trigger below, because no FK can express it): if a
infrastructure\migrations\014_repair_plans.sql:255:    updated_by       uuid,
infrastructure\migrations\014_repair_plans.sql:272:        -- are already frozen by 012's trigger, so this can never actually fire —
infrastructure\migrations\014_repair_plans.sql:339:    updated_by       uuid,
infrastructure\migrations\014_repair_plans.sql:372:-- ⚠️ THE RULE A FOREIGN KEY CANNOT EXPRESS, so it is a trigger rather than a
infrastructure\migrations\014_repair_plans.sql:387:RETURNS trigger
infrastructure\migrations\014_repair_plans.sql:432:-- ⚠️ The header trigger must ALLOW the review transition — `submitted` →
infrastructure\migrations\014_repair_plans.sql:437:RETURNS trigger
infrastructure\migrations\014_repair_plans.sql:457:DROP TRIGGER IF EXISTS trg_repair_plans_immutable ON repair.repair_plans;
infrastructure\migrations\014_repair_plans.sql:458:CREATE TRIGGER trg_repair_plans_immutable
infrastructure\migrations\014_repair_plans.sql:468: * plan, and both call it `plan_id` — so a single function serves both triggers
infrastructure\migrations\014_repair_plans.sql:476:RETURNS trigger
infrastructure\migrations\014_repair_plans.sql:507:DROP TRIGGER IF EXISTS trg_plan_tasks_immutable ON repair.repair_plan_tasks;
infrastructure\migrations\014_repair_plans.sql:508:CREATE TRIGGER trg_plan_tasks_immutable
infrastructure\migrations\014_repair_plans.sql:513:DROP TRIGGER IF EXISTS trg_plan_resources_immutable ON repair.repair_plan_resources;
infrastructure\migrations\014_repair_plans.sql:514:CREATE TRIGGER trg_plan_resources_immutable
infrastructure\migrations\014_repair_plans.sql:555:-- to reach it. Writing the trigger and withholding the privilege is the
infrastructure\migrations\013_diagnostic_finding_removal.sql:10:--     any part of it afterwards would change what was approved. 012's trigger
infrastructure\migrations\013_diagnostic_finding_removal.sql:31:-- exists except permission to reach it — 012 wrote the trigger's DELETE branch
infrastructure\migrations\012_repair_diagnoses.sql:42:-- transaction, attempts rather than edits, immutable once submitted, composite
infrastructure\migrations\012_repair_diagnoses.sql:80:    created_by       uuid,
infrastructure\migrations\012_repair_diagnoses.sql:82:    updated_by       uuid,
infrastructure\migrations\012_repair_diagnoses.sql:217:-- ⚠️ The header trigger must ALLOW the review transition — `submitted` →
infrastructure\migrations\012_repair_diagnoses.sql:224:RETURNS trigger
infrastructure\migrations\012_repair_diagnoses.sql:248:DROP TRIGGER IF EXISTS trg_diagnoses_immutable ON repair.diagnoses;
infrastructure\migrations\012_repair_diagnoses.sql:249:CREATE TRIGGER trg_diagnoses_immutable
infrastructure\migrations\012_repair_diagnoses.sql:255:RETURNS trigger
infrastructure\migrations\012_repair_diagnoses.sql:294:DROP TRIGGER IF EXISTS trg_findings_immutable ON repair.diagnostic_findings;
infrastructure\migrations\012_repair_diagnoses.sql:295:CREATE TRIGGER trg_findings_immutable
infrastructure\migrations\012_repair_diagnoses.sql:322:-- the triggers above are what stop the write once it is settled. DELETE withheld
infrastructure\migrations\015_repair_plan_identity_immutable.sql:5:-- 014 wrote a trigger that refuses changes once a plan is SETTLED, and a second
infrastructure\migrations\015_repair_plan_identity_immutable.sql:6:-- trigger that refuses a task addressing anything but a CONFIRMED finding of the
infrastructure\migrations\015_repair_plan_identity_immutable.sql:24:-- `assert_task_finding_is_confirmed()` is a trigger on the TASK table, so it never
infrastructure\migrations\015_repair_plan_identity_immutable.sql:55:RETURNS trigger
infrastructure\migrations\015_repair_plan_identity_immutable.sql:115:-- The trigger itself is unchanged — 014 already attached it BEFORE UPDATE on
infrastructure\migrations\015_repair_plan_identity_immutable.sql:117:-- here so a future reader is not left checking whether the trigger exists.
infrastructure\migrations\015_repair_plan_identity_immutable.sql:118:DROP TRIGGER IF EXISTS trg_repair_plans_immutable ON repair.repair_plans;
infrastructure\migrations\015_repair_plan_identity_immutable.sql:119:CREATE TRIGGER trg_repair_plans_immutable
infrastructure\migrations\020_repair_testing.sql:73:    -- test session has no meaning without one — and a trigger below refuses an
infrastructure\migrations\020_repair_testing.sql:126:    created_by       uuid,
infrastructure\migrations\020_repair_testing.sql:128:    updated_by       uuid,
infrastructure\migrations\020_repair_testing.sql:267:    updated_by       uuid,
infrastructure\migrations\020_repair_testing.sql:306:RETURNS trigger
infrastructure\migrations\020_repair_testing.sql:340:RETURNS trigger
infrastructure\migrations\020_repair_testing.sql:365:DROP TRIGGER IF EXISTS trg_test_sessions_immutable ON repair.repair_test_sessions;
infrastructure\migrations\020_repair_testing.sql:366:CREATE TRIGGER trg_test_sessions_immutable
infrastructure\migrations\020_repair_testing.sql:372:RETURNS trigger
infrastructure\migrations\020_repair_testing.sql:403:DROP TRIGGER IF EXISTS trg_test_results_immutable ON repair.repair_test_results;
infrastructure\migrations\020_repair_testing.sql:404:CREATE TRIGGER trg_test_results_immutable
infrastructure\migrations\020_repair_testing.sql:432:-- it while the session is open; the trigger withdraws that the moment it is
infrastructure\migrations\019_repair_execution.sql:29:--   · `proposal_id` NOT NULL is the AUTHORISATION. A trigger refuses any
infrastructure\migrations\019_repair_execution.sql:43:-- else: no trigger compares them to the plan's estimate, no status is derived
infrastructure\migrations\019_repair_execution.sql:75:    -- ⚠️ THE AUTHORISATION. See the header note: NOT NULL, and a trigger below
infrastructure\migrations\019_repair_execution.sql:107:    created_by       uuid,
infrastructure\migrations\019_repair_execution.sql:109:    updated_by       uuid,
infrastructure\migrations\019_repair_execution.sql:131:        REFERENCES repair.repair_proposals (id, tenant_id, organization_id)
infrastructure\migrations\019_repair_execution.sql:155:-- the bay and the estimate all stay on `repair_plan_tasks`, which is immutable, so
infrastructure\migrations\019_repair_execution.sql:181:    created_by       uuid,
infrastructure\migrations\019_repair_execution.sql:183:    updated_by       uuid,
infrastructure\migrations\019_repair_execution.sql:266:    created_by       uuid,
infrastructure\migrations\019_repair_execution.sql:268:    updated_by       uuid,
infrastructure\migrations\019_repair_execution.sql:308:-- A partial unique index rather than a trigger: it is declarative, it is atomic
infrastructure\migrations\019_repair_execution.sql:345:    updated_by       uuid,
infrastructure\migrations\019_repair_execution.sql:423:RETURNS trigger
infrastructure\migrations\019_repair_execution.sql:430:      FROM repair.repair_proposals
infrastructure\migrations\019_repair_execution.sql:457:RETURNS trigger
infrastructure\migrations\019_repair_execution.sql:484:DROP TRIGGER IF EXISTS trg_executions_immutable ON repair.repair_executions;
infrastructure\migrations\019_repair_execution.sql:485:CREATE TRIGGER trg_executions_immutable
infrastructure\migrations\019_repair_execution.sql:496:RETURNS trigger
infrastructure\migrations\019_repair_execution.sql:527:DROP TRIGGER IF EXISTS trg_exec_tasks_immutable ON repair.execution_tasks;
infrastructure\migrations\019_repair_execution.sql:528:CREATE TRIGGER trg_exec_tasks_immutable
infrastructure\migrations\019_repair_execution.sql:532:DROP TRIGGER IF EXISTS trg_time_entries_immutable ON repair.execution_time_entries;
infrastructure\migrations\019_repair_execution.sql:533:CREATE TRIGGER trg_time_entries_immutable
infrastructure\migrations\019_repair_execution.sql:537:DROP TRIGGER IF EXISTS trg_parts_used_immutable ON repair.execution_parts_used;
infrastructure\migrations\019_repair_execution.sql:538:CREATE TRIGGER trg_parts_used_immutable
infrastructure\migrations\019_repair_execution.sql:542:DROP TRIGGER IF EXISTS trg_evidence_immutable ON repair.execution_evidence;
infrastructure\migrations\019_repair_execution.sql:543:CREATE TRIGGER trg_evidence_immutable
infrastructure\migrations\019_repair_execution.sql:592:-- open; the triggers above are what withdraw that once it is finished.
infrastructure\migrations\016_quotations.sql:51:-- is already immutable by 012's trigger, so reading it live gives the same answer
infrastructure\migrations\016_quotations.sql:67:-- Header totals are NOT stored. They are sums of immutable lines, so a stored
infrastructure\migrations\016_quotations.sql:125:    created_by       uuid,
infrastructure\migrations\016_quotations.sql:127:    updated_by       uuid,
infrastructure\migrations\016_quotations.sql:193:    created_by       uuid,
infrastructure\migrations\016_quotations.sql:195:    updated_by       uuid,
infrastructure\migrations\016_quotations.sql:275:    -- time: the plan is immutable once approved, but this text is the wording the
infrastructure\migrations\016_quotations.sql:298:    updated_by       uuid,
infrastructure\migrations\016_quotations.sql:334:RETURNS trigger
infrastructure\migrations\016_quotations.sql:380:DROP TRIGGER IF EXISTS trg_quotations_immutable ON repair.quotations;
infrastructure\migrations\016_quotations.sql:381:CREATE TRIGGER trg_quotations_immutable
infrastructure\migrations\016_quotations.sql:387:RETURNS trigger
infrastructure\migrations\016_quotations.sql:418:DROP TRIGGER IF EXISTS trg_quotation_lines_immutable ON repair.quotation_lines;
infrastructure\migrations\016_quotations.sql:419:CREATE TRIGGER trg_quotation_lines_immutable
infrastructure\migrations\016_quotations.sql:427:-- finding trigger. The composite FKs check the tenant and organisation, which is
infrastructure\migrations\016_quotations.sql:431:RETURNS trigger
infrastructure\migrations\016_quotations.sql:514:-- cannot be started while one is open. The trigger above is the narrowing; the
infrastructure\migrations\024_supplier_catalogue.sql:21:-- trigger comparing OLD to NEW, exactly as 023 does for orders and 015 for
infrastructure\migrations\024_supplier_catalogue.sql:22:-- settled repair plans. The policy decides WHICH rows; the trigger decides WHAT
infrastructure\migrations\024_supplier_catalogue.sql:32:-- ⚠️ `created_by` IS ADDED FOR A SECURITY REASON, NOT FOR AUDIT. The obvious
infrastructure\migrations\024_supplier_catalogue.sql:46:-- predicate: `created_by = identity.current_user_id()` is NULL-safe only
infrastructure\migrations\024_supplier_catalogue.sql:50:  ADD COLUMN created_by UUID REFERENCES identity.users(id) ON DELETE SET NULL;
infrastructure\migrations\024_supplier_catalogue.sql:52:COMMENT ON COLUMN catalogue.suppliers.created_by IS
infrastructure\migrations\024_supplier_catalogue.sql:56:CREATE INDEX idx_suppliers_created_by ON catalogue.suppliers (created_by);
infrastructure\migrations\024_supplier_catalogue.sql:67:RETURNS trigger
infrastructure\migrations\024_supplier_catalogue.sql:109:  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
infrastructure\migrations\024_supplier_catalogue.sql:110:    RAISE EXCEPTION 'created_by is immutable'
infrastructure\migrations\024_supplier_catalogue.sql:114:    RAISE EXCEPTION 'id is immutable' USING ERRCODE = 'insufficient_privilege';
infrastructure\migrations\024_supplier_catalogue.sql:130:RETURNS trigger
infrastructure\migrations\024_supplier_catalogue.sql:188:-- waiting to have approved. The `created_by` arm covers the window between
infrastructure\migrations\024_supplier_catalogue.sql:192:    catalogue.current_user_supplies(id) OR created_by = identity.current_user_id()
infrastructure\migrations\024_supplier_catalogue.sql:198:-- well as in the trigger.
infrastructure\migrations\024_supplier_catalogue.sql:202:    AND created_by = identity.current_user_id()
infrastructure\migrations\024_supplier_catalogue.sql:258:         AND s.created_by = identity.current_user_id()
infrastructure\migrations\023_supplier_accounts.sql:29:-- rule is a BEFORE UPDATE trigger comparing OLD to NEW, the same mechanism 015
infrastructure\migrations\023_supplier_accounts.sql:107:-- function rather than inlined so the trigger and any future test assert the
infrastructure\migrations\023_supplier_accounts.sql:110:RETURNS trigger
infrastructure\migrations\023_supplier_accounts.sql:120:  -- Not a supplier member for this order => this trigger has no opinion. The
infrastructure\migrations\023_supplier_accounts.sql:208:-- WHICH orders, the trigger decides WHAT may change.
infrastructure\migrations\025_platform_admin_role_name.sql:4:-- UNREACHABLE FROM THE APPLICATION. Nine policies and three triggers, across
infrastructure\migrations\025_platform_admin_role_name.sql:135:-- The three column-guard triggers.
infrastructure\migrations\025_platform_admin_role_name.sql:146:RETURNS trigger
infrastructure\migrations\025_platform_admin_role_name.sql:156:  -- Not a supplier member for this order => this trigger has no opinion. The
infrastructure\migrations\025_platform_admin_role_name.sql:204:RETURNS trigger
infrastructure\migrations\025_platform_admin_role_name.sql:236:  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
infrastructure\migrations\025_platform_admin_role_name.sql:237:    RAISE EXCEPTION 'created_by is immutable'
infrastructure\migrations\025_platform_admin_role_name.sql:241:    RAISE EXCEPTION 'id is immutable' USING ERRCODE = 'insufficient_privilege';
infrastructure\migrations\025_platform_admin_role_name.sql:249:RETURNS trigger
infrastructure\migrations\026_fitment_publication_guard.sql:36:RETURNS trigger
infrastructure\migrations\026_fitment_publication_guard.sql:70:    -- No parent visible => this trigger has no opinion. The FK and the row
infrastructure\migrations\027_mechanic_directory_optin.sql:100:-- `parts.supplier_id`, which needed a trigger because the column had to stay
infrastructure\migrations\030_quality_control.sql:13:--      by a trigger, using `repair.user_worked_on_job_card()` below. This is the
infrastructure\migrations\030_quality_control.sql:47:-- SECURITY DEFINER so the trigger can see the rows regardless of the caller's
infrastructure\migrations\030_quality_control.sql:91:    -- session would be inspecting a car still being worked on. A trigger below
infrastructure\migrations\030_quality_control.sql:116:    created_by       uuid,
infrastructure\migrations\030_quality_control.sql:118:    updated_by       uuid,
infrastructure\migrations\030_quality_control.sql:176:-- ── the independence trigger ────────────────────────────────────────────────
infrastructure\migrations\030_quality_control.sql:183:RETURNS trigger
infrastructure\migrations\030_quality_control.sql:208:RETURNS trigger
infrastructure\migrations\030_quality_control.sql:245:RETURNS trigger
infrastructure\migrations\031_quality_control_hardening.sql:17:--      independence trigger — which reads `NEW.job_card_id` — would then check
infrastructure\migrations\031_quality_control_hardening.sql:44:RETURNS trigger
infrastructure\migrations\031_quality_control_hardening.sql:70:  -- and the independence trigger can be pointed at a car the inspector never
infrastructure\migrations\031_quality_control_hardening.sql:92:-- The independence trigger gains `test_session_id` for the same reason: moving
infrastructure\migrations\031_quality_control_hardening.sql:104:-- point, so the trigger works for any tenant. It also means an unrestricted
infrastructure\migrations\032_repair_variations.sql:15:--     a trigger refuses it otherwise.
infrastructure\migrations\032_repair_variations.sql:80:    -- `repair_proposals`, for the same reason.
infrastructure\migrations\032_repair_variations.sql:90:    -- substitute for it, and the trigger below is what makes it trustworthy.
infrastructure\migrations\032_repair_variations.sql:94:    created_by  uuid,
infrastructure\migrations\032_repair_variations.sql:96:    updated_by  uuid,
infrastructure\migrations\032_repair_variations.sql:161:RETURNS trigger
infrastructure\migrations\032_repair_variations.sql:204:RETURNS trigger
infrastructure\migrations\033_variation_hardening.sql:15:--      `created_by`, or to belong to a role permitted to review. §3792's
infrastructure\migrations\033_variation_hardening.sql:93:RETURNS trigger
infrastructure\migrations\033_variation_hardening.sql:148:    IF NEW.internally_reviewed_by = NEW.created_by THEN
infrastructure\migrations\033_variation_hardening.sql:185:RETURNS trigger
infrastructure\migrations\034_variation_authorization_fill.sql:40:RETURNS trigger
infrastructure\migrations\036_signup_and_workshop_registration.sql:186:    INSERT INTO identity.tenants (name, slug, status, created_by)
infrastructure\migrations\036_signup_and_workshop_registration.sql:196:    INSERT INTO identity.organizations (tenant_id, name, org_type, status, created_by)
infrastructure\migrations\036_signup_and_workshop_registration.sql:203:    INSERT INTO identity.branches (tenant_id, organization_id, name, status, created_by)
infrastructure\migrations\036_signup_and_workshop_registration.sql:214:        (tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure\migrations\037_registration_rls_bootstrap.sql:53:-- also pins `created_by` (or `user_id`) to `app.bootstrap_user`, so even with
infrastructure\migrations\037_registration_rls_bootstrap.sql:93:        AND created_by::text = current_setting('app.bootstrap_user', true)
infrastructure\migrations\037_registration_rls_bootstrap.sql:101:        AND created_by::text = current_setting('app.bootstrap_user', true)
infrastructure\migrations\037_registration_rls_bootstrap.sql:109:        AND created_by::text = current_setting('app.bootstrap_user', true)
infrastructure\migrations\037_registration_rls_bootstrap.sql:114:-- AND be about the registering user. `created_by` alone would let a future
infrastructure\migrations\037_registration_rls_bootstrap.sql:121:        AND created_by::text = current_setting('app.bootstrap_user', true)
infrastructure\migrations\037_registration_rls_bootstrap.sql:229:    INSERT INTO identity.tenants (id, name, slug, status, created_by)
infrastructure\migrations\037_registration_rls_bootstrap.sql:238:    INSERT INTO identity.organizations (id, tenant_id, name, org_type, status, created_by)
infrastructure\migrations\037_registration_rls_bootstrap.sql:244:    INSERT INTO identity.branches (id, tenant_id, organization_id, name, status, created_by)
infrastructure\migrations\037_registration_rls_bootstrap.sql:254:        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure\migrations\verify\013_finding_removal.sql:11:-- would pass identically if the trigger had been dropped — which is the failure
infrastructure\migrations\verify\013_finding_removal.sql:12:-- 012's own comment warns about (a BEFORE DELETE trigger returning NEW SKIPS the
infrastructure\migrations\verify\013_finding_removal.sql:98:        -- the trigger returned NEW and skipped the row silently, which is the bug
infrastructure\migrations\verify\014_repair_plans.sql:13:-- identically with the trigger dropped — that is how 012 shipped a DELETE branch
infrastructure\migrations\verify\014_repair_plans.sql:14:-- nothing could reach, and how a BEFORE DELETE trigger returning NEW looks like
infrastructure\migrations\verify\014_repair_plans.sql:110:    -- The control for check 1. Without the trigger this INSERT succeeds and a
infrastructure\migrations\verify\014_repair_plans.sql:128:    -- foreign key checks is satisfied. Only the trigger refuses it.
infrastructure\migrations\verify\014_repair_plans.sql:166:    -- BEFORE DELETE trigger returning NEW skips the row and reports success.
infrastructure\migrations\verify\015_plan_identity_immutable.sql:11:-- a trigger that refused every update would pass checks 1-4 and silently break
infrastructure\migrations\verify\015_plan_identity_immutable.sql:15:--     -d autoworkshop < infrastructure/migrations/verify/015_plan_identity_immutable.sql
infrastructure\migrations\verify\015_plan_identity_immutable.sql:117:    -- Without this a trigger refusing EVERY update would pass 1-4 and make the plan
infrastructure\migrations\verify\016_quotations.sql:8:-- ⚠️ EVERY REFUSAL IS PAIRED WITH A CONTROL. A trigger that refused everything would
infrastructure\migrations\verify\016_quotations.sql:111:    -- checks is satisfied. Only the trigger refuses it.
infrastructure\migrations\verify\016_quotations.sql:146:        -- BEFORE DELETE trigger returned NEW and skipped the row silently.
infrastructure\migrations\verify\023_supplier_accounts.sql:8:-- (b) is enforced by a trigger rather than a policy, because RLS selects rows
infrastructure\migrations\verify\023_supplier_accounts.sql:9:-- and not columns. A trigger that never fires looks exactly like a trigger that
infrastructure\migrations\verify\023_supplier_accounts.sql:101:  --    if the trigger refused everything they would both pass while the feature
infrastructure\migrations\verify\024_supplier_catalogue.sql:21:-- triggers refuse a non-admin INSERT that arrives pre-published, and these
infrastructure\migrations\verify\024_supplier_catalogue.sql:52:-- ⚠️ SEEDED WITH created_by NULL ON PURPOSE. These are the "administrator
infrastructure\migrations\verify\024_supplier_catalogue.sql:82:  -- every trigger below would take its admin early-return and all eleven
infrastructure\migrations\verify\024_supplier_catalogue.sql:198:  INSERT INTO catalogue.suppliers (slug, name, country, created_by)
infrastructure\migrations\verify\024_supplier_catalogue.sql:221:    INSERT INTO catalogue.suppliers (slug, name, country, created_by, is_published)
infrastructure\migrations\verify\024_supplier_catalogue.sql:231:  --     by hand, which is what `created_by IS NULL` represents. A "first member
infrastructure\migrations\verify\030_quality_control.sql:135:    RAISE NOTICE 'check 3 OK: self-inspection refused by the trigger';
infrastructure\migrations\verify\030_quality_control.sql:151:  -- The trigger fires on UPDATE too. Enforced at the door and nowhere else is
infrastructure\migrations\verify\031_quality_control_hardening.sql:11:--   · `UPDATE job_card_id` was never tested, though the trigger names it;
infrastructure\migrations\verify\031_quality_control_hardening.sql:108:  -- independence trigger checks the inspector against a car they never touched.
infrastructure\migrations\verify\031_quality_control_hardening.sql:132:  -- `verify/030` never tested this, though 030's trigger named the column.
infrastructure\migrations\verify\031_quality_control_hardening.sql:140:      RAISE NOTICE 'check 3 OK: refused by the independence trigger';
infrastructure\migrations\verify\031_quality_control_hardening.sql:178:  -- 6. CONTROL. The application role still can, or the trigger's own helper
infrastructure\migrations\verify\032_repair_variations.sql:70:     additional_cost, currency, created_by)
infrastructure\migrations\verify\032_repair_variations.sql:180:       additional_cost, created_by)
infrastructure\migrations\verify\032_repair_variations.sql:216:       additional_cost, created_by)
infrastructure\migrations\verify\033_variation_hardening.sql:72:       additional_cost, created_by, status, decision, decided_at,
infrastructure\migrations\verify\033_variation_hardening.sql:86:       additional_cost, created_by, work_authorized_at, work_authorized_by)
infrastructure\migrations\verify\033_variation_hardening.sql:97:     additional_cost, currency, created_by)
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql:148:    INSERT INTO identity.tenants (name, slug, status, created_by)
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql:167:    INSERT INTO identity.tenants (name, slug, status, created_by)
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql:179:  -- The membership policy pins created_by AND user_id, because created_by alone
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql:183:      (tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql:204:    INSERT INTO identity.tenants (name, slug, status, created_by)

 exited 1 in 7721ms:
README.md:56:apps/        customer-web workshop-web supplier-web fleet-web insurance-web towing-web admin-web
scripts\audit-menu-coverage.mjs:4: * 🔴 WHY THIS EXISTS. A progress report claimed "99 screens in workshop-web".
scripts\audit-menu-coverage.mjs:67:// how customer-web measured 0 of 35 while six of those screens were shipped and
scripts\audit-menu-coverage.mjs:90:// customer route up in workshop-web's page list answers a question nobody
scripts\audit-menu-coverage.mjs:91:// asked. Until this was split, only workshop-web was measured at all, so the
scripts\audit-menu-coverage.mjs:95:  'DEFAULT §34 (supervisor, QC, storekeeper, cashier, platform admin)': ['workshopGroups', 'workshop-web'],
scripts\audit-menu-coverage.mjs:96:  'OWNER §46': ['workshopOwnerGroups', 'workshop-web'],
scripts\audit-menu-coverage.mjs:97:  'MANAGER §47': ['workshopManagerGroups', 'workshop-web'],
scripts\audit-menu-coverage.mjs:98:  'RECEPTION §48': ['workshopReceptionGroups', 'workshop-web'],
scripts\audit-menu-coverage.mjs:99:  'TECHNICIAN §49': ['workshopTechnicianGroups', 'workshop-web'],
scripts\audit-menu-coverage.mjs:100:  'CUSTOMER §33': ['customerGroups', 'customer-web'],
apps\workshop-web\package.json:2:  "name": "@autoworkshop/workshop-web",
apps\workshop-web\package.json:6:    "dev": "next dev -p 3001",
apps\workshop-web\package.json:8:    "start": "next start -p 3001",
apps\workshop-web\Dockerfile:1:# Container image for `workshop-web`.
apps\workshop-web\Dockerfile:37:COPY apps/workshop-web/package.json apps/workshop-web/
apps\workshop-web\Dockerfile:40:# `--filter @autoworkshop/workshop-web...` (trailing dots) installs this app plus
apps\workshop-web\Dockerfile:43:RUN pnpm install --frozen-lockfile --filter "@autoworkshop/workshop-web..."
apps\workshop-web\Dockerfile:56:RUN pnpm --filter @autoworkshop/workshop-web build
apps\workshop-web\Dockerfile:74:# standalone/{apps/workshop-web/server.js,node_modules,package.json}.
apps\workshop-web\Dockerfile:75:COPY --from=builder --chown=node:node /repo/apps/workshop-web/.next/standalone ./
apps\workshop-web\Dockerfile:78:COPY --from=builder --chown=node:node /repo/apps/workshop-web/.next/static ./apps/workshop-web/.next/static
apps\workshop-web\Dockerfile:82:ENV PORT=3000 HOSTNAME=0.0.0.0
apps\workshop-web\Dockerfile:85:CMD ["node", "apps/workshop-web/server.js"]
apps\workshop-web\auth.ts:12: * (`autoworkshop-workshop-web`); there is nothing per-app to configure here.
apps\workshop-web\auth.ts:14: * WHY EVERY EXPORT CARRIES AN EXPLICIT TYPE. Without them tsc fails with
apps\api\src\security\security.module.ts:15: * ⚠️ `IdentityModule` IS IMPORTED FOR THE GUARD, NOT FOR THIS MODULE'S OWN CODE.
apps\api\src\security\security-posture.service.ts:206:   * 🔴 THE SINGLE MOST IMPORTANT CHECK IN THIS FILE. PostgreSQL exempts a
apps\api\src\repair\repair-plan.spec.ts:700:    // ⚠️ REPORTED, NOT REFUSED — and this is the design decision, so it is asserted.
apps\api\src\repair\repair-plan.service.ts:125:   * ⚠️ REPORTED, NOT REFUSED — see `submit`. Surfaced here because the whole point
apps\api\src\repair\repair-plan.service.ts:1007:   *    to satisfy a rule. So it is REPORTED — `unaddressedFaultCount` on the record
apps\api\src\repair\job-card.service.ts:443:    // case: `2.txt` §537 lets them REPORT a problem, which opens a card — it does
apps\api\src\repair\inspection-checklist.ts:138: * §557 has inspection findings reaching the customer as a DIAGNOSTIC REPORT and
apps\api\src\operations\redaction.spec.ts:19: * ⚠️ `safeMessage` IS EXPORTED FOR THIS. The first version of this file tried to
apps\api\src\operations\operations.service.ts:16: * SERVICE WORKS, NOT THAT A PORT IS OPEN.**
apps\workshop-web\app\_screens\repair-plan-sheet-screen.tsx:37: * ── THE REJECTION REASON IS THE MOST IMPORTANT TEXT ON THE PAGE ─────────────
apps\api\src\operations\operations.module.ts:16: * ⚠️ `IdentityModule` IS IMPORTED FOR THE GUARD, NOT FOR THIS MODULE'S CODE.
apps\workshop-web\app\_screens\repair-plan-review-form.tsx:131:      {/* ⚠️ THE ONE THING A REVIEWER MUST NOT MISS. The service REPORTS unaddressed
apps\api\src\marketplace\marketplace.module.ts:10: * ⚠️ `IdentityModule` IS IMPORTED FOR THE GUARD, NOT FOR THIS MODULE'S OWN CODE,
apps\api\src\main.ts:13:  const port = process.env.PORT ?? 4000;
apps\workshop-web\app\_screens\proposal-queue-screen.tsx:19: * workspace — a different app (`customer-web`), where the vehicle owner answers for
apps\api\src\identity\registration.controller.ts:72:       * membership — which for `customer-web` is not an edge case, it is the
apps\api\src\identity\membership.repository.ts:38:     * TenantGuard — and for `customer-web` that viewer is the entire audience.
apps\api\src\core\core.module.ts:16: * the services are EXPORTED: later modules depend on this one, never the
apps\workshop-web\app\_screens\diagnosis-sheet-screen.tsx:37: * ── THE REJECTION REASON IS THE MOST IMPORTANT TEXT ON THE PAGE ─────────────
apps\workshop-web\app\_screens\create-workshop-screen.tsx:16: * It is mounted in workshop-web's layout ONLY. A customer with no workshop is
apps\workshop-web\app\_screens\create-workshop-screen.tsx:17: * not an incomplete workshop owner — they are a customer, and `customer-web`
apps\api\src\catalogue\catalogue.module.ts:16: * ⚠️ `IdentityModule` IS IMPORTED FOR THE GUARDS, NOT FOR THIS MODULE'S OWN
apps\api\Dockerfile:3:# SAME REASONING AS `apps/workshop-web/Dockerfile` (ADR-017): CI builds the
apps\api\Dockerfile:78:# Render assigns the port and routes to it; `main.ts` already reads PORT and
apps\api\Dockerfile:81:ENV PORT=10000
apps\workshop-web\app\repair-services\quality-control\page.tsx:7: * 🔴 THE MOST IMPORTANT OF THE THREE, AND THE EASIEST TO OVERLOOK. This is where
apps\workshop-web\app\page.tsx:19: * in `customer-web`, deployed at a different hostname, and reaching them from
apps\workshop-web\app\page.tsx:53: * `renderAddToBasket` is omitted. The basket belongs to `customer-web`; a
apps\admin-web\auth.ts:14: * WHY EVERY EXPORT CARRIES AN EXPLICIT TYPE. Without them tsc fails with
apps\towing-web\auth.ts:14: * WHY EVERY EXPORT CARRIES AN EXPLICIT TYPE. Without them tsc fails with
apps\supplier-web\package.json:6:    "dev": "next dev -p 3002",
apps\supplier-web\package.json:8:    "start": "next start -p 3002",
apps\e2e\playwright.config.ts:29:  { name: 'workshop', port: 3001 },
apps\e2e\playwright.config.ts:30:  { name: 'supplier', port: 3002 },
apps\e2e\playwright.config.ts:38:export const STORYBOOK_PORT = 6100;
apps\e2e\playwright.config.ts:97:      use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${STORYBOOK_PORT}` },
apps\e2e\playwright.config.ts:113:      command: `npx http-server ../storybook/storybook-static -p ${STORYBOOK_PORT} --silent`,
apps\e2e\playwright.config.ts:114:      url: `http://127.0.0.1:${STORYBOOK_PORT}`,
apps\supplier-web\auth.ts:14: * WHY EVERY EXPORT CARRIES AN EXPLICIT TYPE. Without them tsc fails with
apps\customer-web\package.json:2:  "name": "@autoworkshop/customer-web",
apps\customer-web\next.config.mjs:33:   * `node apps/customer-web/server.js` finds nothing. On Render that surfaces
apps\customer-web\Dockerfile:1:# Container image for `customer-web` — THE PUBLIC LANDING PAGE.
apps\customer-web\Dockerfile:6:# the apex served `workshop-web`, so the magnet existed only in the repository.
apps\customer-web\Dockerfile:42:COPY apps/customer-web/package.json apps/customer-web/
apps\customer-web\Dockerfile:45:# `--filter @autoworkshop/customer-web...` (trailing dots) installs this app plus
apps\customer-web\Dockerfile:48:RUN pnpm install --frozen-lockfile --filter "@autoworkshop/customer-web..."
apps\customer-web\Dockerfile:61:RUN pnpm --filter @autoworkshop/customer-web build
apps\customer-web\Dockerfile:79:# standalone/{apps/customer-web/server.js,node_modules,package.json}.
apps\customer-web\Dockerfile:80:COPY --from=builder --chown=node:node /repo/apps/customer-web/.next/standalone ./
apps\customer-web\Dockerfile:83:COPY --from=builder --chown=node:node /repo/apps/customer-web/.next/static ./apps/customer-web/.next/static
apps\customer-web\Dockerfile:87:ENV PORT=3000 HOSTNAME=0.0.0.0
apps\customer-web\Dockerfile:90:CMD ["node", "apps/customer-web/server.js"]
apps\customer-web\auth.ts:12: * (`autoworkshop-customer-web`); there is nothing per-app to configure here.
apps\customer-web\auth.ts:14: * WHY EVERY EXPORT CARRIES AN EXPLICIT TYPE. Without them tsc fails with
apps\customer-web\app\page.tsx:116:      // customer-web's own client-side store; the shared landing must not know
apps\customer-web\app\(app)\marketplace\page.tsx:119:      // customer-web's own client-side store; the shared landing must not know
scripts\sync-mobile-client.sh:46:METRO_PORT="${METRO_PORT:-8081}"
scripts\sync-mobile-client.sh:169:}))' "$CLIENT_ID" "$HOST_IP" "$METRO_PORT")"
scripts\sync-mobile-client.sh:204:want = 'exp://${HOST_IP}:${METRO_PORT}/*'
scripts\start-session.sh:11:#      from a PREVIOUS DAY keeps serving port 3001/4000. The symptoms look
scripts\start-session.sh:49:# 🔴 THE PORT LIST IS DERIVED, NOT TYPED. It used to be the literal
scripts\start-session.sh:50:# `3000,3001,3002,4000`, which covered three of the SEVEN web apps. A stale
scripts\start-session.sh:62:# matching the exact form `next start -p <port>` — so `--port`, `PORT=… next
scripts\start-session.sh:67:PORT_SCAN="$(python - <<'PY'
scripts\start-session.sh:90:    # -p 3001 | --port 3001 | --port=3001 | PORT=3001
scripts\start-session.sh:92:        re.search(r'\bPORT=(\d{2,5})\b', start)
scripts\start-session.sh:103:DEV_PORTS="$(printf '%s' "$PORT_SCAN" | head -1)"
scripts\start-session.sh:105:printf '%s\n' "$PORT_SCAN" | grep '^UNPARSED ' | while read -r _ app rest; do
scripts\start-session.sh:111:    \$ports = @(${DEV_PORTS})
scripts\start-session.sh:128:  ok "ports ${DEV_PORTS} free (anything still listening is printed above)"
scripts\start-session.sh:251:  (cd apps/workshop-web && rm -rf .next && ./node_modules/.bin/next build)
scripts\start-session.sh:252:  # then next start -p 3001 with AUTH_SECRET/AUTH_URL/API_BASE_URL/KEYCLOAK_* set
scripts\start-session.sh:256:  powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort 3001 -State Listen | ForEach-Object { Get-Process -Id \$_.OwningProcess | Select-Object Id,StartTime }"
scripts\start-local.sh:41:#   APPS="workshop:3001 supplier:3002 admin:3006" bash scripts/start-local.sh
scripts\start-local.sh:51:API_PORT=4000
scripts\start-local.sh:52:KC_PORT=8080
scripts\start-local.sh:63:APPS="${APPS:-workshop:3001}"
scripts\start-local.sh:118:CANONICAL_KC="http://${HOST_IP}:${KC_PORT}"
scripts\start-local.sh:132:  _ "http://localhost:${KC_PORT}" "$KC_ADMIN" >/dev/null
scripts\start-local.sh:191:APP_PORT_LIST="$API_PORT"
scripts\start-local.sh:192:for entry in $APPS; do APP_PORT_LIST="${APP_PORT_LIST},${entry##*:}"; done
scripts\start-local.sh:193:echo "==> freeing ports ${APP_PORT_LIST}"
scripts\start-local.sh:195:  foreach (\$p in @(${APP_PORT_LIST})) {
scripts\start-local.sh:201:# 🔴 ASSERT THE PORTS ARE ACTUALLY FREE. Raised by Codex, and it is the defect
scripts\start-local.sh:208:  @(${APP_PORT_LIST}) | ForEach-Object {
scripts\start-local.sh:230:echo "==> starting API on ${API_PORT}"
scripts\start-local.sh:284:URL_LIST="http://localhost:${API_PORT}/api/v1/health"
scripts\start-local.sh:346:const api = 'http://localhost:${API_PORT}/api/v1';
scripts\start-local.sh:370:#   (cd apps/e2e && WORKSHOP_WEB_URL=http://${HOST_IP}:3001 \
apps\e2e\tests\sign-out-revocation.spec.ts:33:const CUSTOMER_WEB = process.env['CUSTOMER_WEB_URL'] ?? 'http://localhost:3000';
apps\e2e\tests\shell-journey.spec.ts:8:// ⚠️ IMPORTED FROM THE MODULE, NOT FROM THE PACKAGE BARREL — AND IT MATTERS.
apps\e2e\tests\build-freshness.setup.ts:93:    // so this guard reported customer-web as serving a STALE BUILD, failed as a
apps\e2e\tests\a11y-workspaces.spec.ts:18:const VIEWPORTS = [
apps\e2e\tests\a11y-workspaces.spec.ts:24:  for (const vp of VIEWPORTS) {
apps\e2e\playwright.identity.config.ts:26: *   (cd apps/customer-web && rm -rf .next && next build \
apps\e2e\playwright.identity.config.ts:45:    baseURL: process.env['CUSTOMER_WEB_URL'] ?? 'http://localhost:3000',
apps\e2e\verify\check-identity-switch.mjs:10:const BASE = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\capture-session.mjs:47:// to prove what the API hands a TECHNICIAN, which needs a workshop-web session
apps\e2e\verify\capture-session.mjs:48:// rather than a customer-web one. Defaults unchanged, so the finding-5
apps\e2e\verify\capture-session.mjs:50:const APP = arg('url', process.env['CUSTOMER_WEB_URL'] ?? 'http://localhost:3000');
apps\e2e\verify\capture-session.mjs:64:// customer-web 2026-07-29 while proving the inspection refusals; both links go
apps\e2e\verify\check-routes-signed-in.mjs:2:const BASE='http://localhost:3001';
apps\e2e\verify\check-switch-user.mjs:10:const BASE = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001', PASSWORD = 'Change_me_locally1!';
apps\e2e\verify\check-switch-user.mjs:45:await p.waitForURL(/\/api\/auth\/signin|openid-connect|localhost:3001/, { timeout: 90000 }).catch(() => {});
apps\fleet-web\auth.ts:14: * WHY EVERY EXPORT CARRIES AN EXPLICIT TYPE. Without them tsc fails with
scripts\guardrails\check-page-gates.sh:24:# the IMPORT LINE. A page could import the function and never call it, call it
scripts\guardrails\check-page-gates.sh:63:ROUTE_GATED_APPS=("workshop-web:workshop" "customer-web:customer")
scripts\guardrails\check-page-gates.sh:76:# component — `workshop-web/app/home/dashboard/page.tsx` declares
scripts\guardrails\check-page-gates.sh:137:  # apps/workshop-web/app/customer-reception/customers/page.tsx
scripts\guardrails\check-page-gates.sh:307:  # ---- the ROUTE-gated form (workshop-web) --------------------------------
scripts\guardrails\check-page-gates.sh:314:    mkdir -p "$tmp/apps/workshop-web/app/customer-reception/customers"
scripts\guardrails\check-page-gates.sh:315:    cat > "$tmp/apps/workshop-web/app/customer-reception/customers/page.tsx"
scripts\guardrails\check-page-gates.sh:380:    mkdir -p "$tmp/apps/workshop-web/app/customers/customer-search/[id]"
scripts\guardrails\check-page-gates.sh:381:    cat > "$tmp/apps/workshop-web/app/customers/customer-search/[id]/page.tsx"
apps\insurance-web\auth.ts:14: * WHY EVERY EXPORT CARRIES AN EXPLICIT TYPE. Without them tsc fails with
apps\e2e\verify\measure-repair-plan-layout.mjs:36:const BASE = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\measure-repair-plan-layout.mjs:43:const VIEWPORTS = [
apps\e2e\verify\measure-repair-plan-layout.mjs:155:for (const viewport of VIEWPORTS) {
apps\e2e\verify\measure-inspection-layout.mjs:23:const BASE = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\measure-diagnosis-layout.mjs:28:const BASE = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\plan-repair-in-browser.mjs:32:const BASE = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\peek-reauth.mjs:2:const BASE='http://localhost:3001', PASSWORD='Change_me_locally1!';
apps\e2e\verify\record-diagnosis-in-browser.mjs:27:const BASE = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\record-inspection-in-browser.mjs:20:const BASE = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\submit-form-signed-in.mjs:10: *     --url http://localhost:3001/customers/register-customer \
apps\e2e\verify\verify-catalogue-screens.mjs:22:const SUPPLIER_WEB = process.env['SUPPLIER_WEB_URL'] ?? 'http://localhost:3002';
apps\e2e\verify\verify-catalogue-screens.mjs:83:  console.log('\n1. supplier-web :3002 /products/product-catalogue');
apps\e2e\verify\verify-customer-workflow.mjs:35:const CUSTOMER = process.env['CUSTOMER_WEB_URL'] ?? 'http://localhost:3000';
apps\e2e\verify\verify-directory-optin.mjs:20:const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\verify-job-card-detail.mjs:29:const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\mobile\src\auth\session.ts:194:  // ⚠️ THE OUTCOME IS REPORTED, NOT ASSUMED. Raised by Codex: this used to
apps\e2e\verify\verify-job-queues.mjs:25:// ⚠️ THE DEFINITIONS ARE READ AS SOURCE, NOT IMPORTED. They live in a
apps\e2e\verify\verify-job-queues.mjs:30:  join(dirname(fileURLToPath(import.meta.url)), '../../workshop-web/app/_screens/job-queue-definitions.ts'),
apps\e2e\verify\verify-job-queues.mjs:58:const BASE = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\verify-nav-gaps-closed.mjs:24:const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\verify-pricing-screen.mjs:21:const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\verify-quality-control.mjs:34:const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\verify-quick-create-buttons.mjs:15:const WEB = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\verify-role-switcher.mjs:32: * Runs against workshop-web AND supplier-web, because the whole point of the
apps\e2e\verify\verify-role-switcher.mjs:34: * workshop-web alone would prove the thing that already worked.
apps\e2e\verify\verify-role-switcher.mjs:42:const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\verify-role-switcher.mjs:43:const SUPPLIER = 'http://localhost:3002';
apps\e2e\verify\verify-role-switcher.mjs:143:  // ═══ 1. workshop-web — the owner, who now holds three roles ══════════════
apps\e2e\verify\verify-role-switcher.mjs:144:  console.log('\n1. workshop-web :3001 — owner@ (platform_administrator + workshop_owner + technician)');
apps\e2e\verify\verify-role-switcher.mjs:201:  // The rollout's actual claim. workshop-web already worked on 2026-07-31.
apps\e2e\verify\verify-role-switcher.mjs:202:  console.log('\n2. supplier-web :3002 — the same account, in an app that never had a switcher');
apps\e2e\verify\verify-role-switcher.mjs:220:  console.log('\n3. workshop-web :3001 — reception@ (one role, TWO organisations)');
apps\e2e\verify\verify-security-hub.mjs:18: * ⚠️ IT ASSERTS THE REPORT IS NON-VACUOUS. A posture report that renders
apps\e2e\verify\verify-security-hub.mjs:32: * ⚠️ 3006, NOT 3002. The port is not free choice: the realm pins
apps\e2e\verify\verify-security-hub.mjs:214:    'A TECHNICIAN READ THE SECURITY POSTURE REPORT',
apps\e2e\verify\verify-technician-workflow.mjs:37:const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\verify-top-bar-identity.mjs:39:const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://192.168.0.124:3001';
apps\e2e\verify\verify-variation-screen.mjs:20:const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\verify-vin-funnel.mjs:41:const BASE = process.env['CUSTOMER_WEB_URL'] ?? 'http://192.168.0.124:3005';
apps\e2e\verify\verify-workshop-onboarding.mjs:45:const BASE = process.env['WORKSHOP_WEB_URL'] ?? 'http://192.168.0.124:3001';
rg: docker-compose*.yml: The filename, directory name, or volume label syntax is incorrect. (os error 123)

2026-08-04T14:01:51.541540Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 7.7 seconds
Output:
README.md:56:apps/        customer-web workshop-web supplier-web fleet-web insurance-web towing-web admin-web
scripts\audit-menu-coverage.mjs:4: * 🔴 WHY THIS EXISTS. A progress report claimed "99 screens in workshop-web".
scripts\audit-menu-coverage.mjs:67:// how customer-web measured 0 of 35 while six of those screens were shipped and
scripts\audit-menu-coverage.mjs:90:// customer route up in workshop-web's page list answers a question nobody
scripts\audit-menu-coverage.mjs:91:// asked. Until this was split, only workshop-web was measured at all, so the
scripts\audit-menu-coverage.mjs:95:  'DEFAULT §34 (supervisor, QC, storekeeper, cashier, platform admin)': ['workshopGroups', 'workshop-web'],
scripts\audit-menu-coverage.mjs:96:  'OWNER §46': ['workshopOwnerGroups', 'workshop-web'],
scripts\audit-menu-coverage.mjs:97:  'MANAGER §47': ['workshopManagerGroups', 'workshop-web'],
scripts\audit-menu-coverage.mjs:98:  'RECEPTION §48': ['workshopReceptionGroups', 'workshop-web'],
scripts\audit-menu-coverage.mjs:99:  'TECHNICIAN §49': ['workshopTechnicianGroups', 'workshop-web'],
scripts\audit-menu-coverage.mjs:100:  'CUSTOMER §33': ['customerGroups', 'customer-web'],
apps\workshop-web\package.json:2:  "name": "@autoworkshop/workshop-web",
apps\workshop-web\package.json:6:    "dev": "next dev -p 3001",
apps\workshop-web\package.json:8:    "start": "next start -p 3001",
apps\workshop-web\Dockerfile:1:# Container image for `workshop-web`.
apps\workshop-web\Dockerfile:37:COPY apps/workshop-web/package.json apps/workshop-web/
apps\workshop-web\Dockerfile:40:# `--filter @autoworkshop/workshop-web...` (trailing dots) installs this app plus
apps\workshop-web\Dockerfile:43:RUN pnpm install --frozen-lockfile --filter "@autoworkshop/workshop-web..."
apps\workshop-web\Dockerfile:56:RUN pnpm --filter @autoworkshop/workshop-web build
apps\workshop-web\Dockerfile:74:# standalone/{apps/workshop-web/server.js,node_modules,package.json}.
apps\workshop-web\Dockerfile:75:COPY --from=builder --chown=node:node /repo/apps/workshop-web/.next/standalone ./
apps\workshop-web\Dockerfile:78:COPY --from=builder --chown=node:node /repo/apps/workshop-web/.next/static ./apps/workshop-web/.next/static
apps\workshop-web\Dockerfile:82:ENV PORT=3000 HOSTNAME=0.0.0.0
apps\workshop-web\Dockerfile:85:CMD ["node", "apps/workshop-web/server.js"]
apps\workshop-web\auth.ts:12: * (`autoworkshop-workshop-web`); there is nothing per-app to configure here.
apps\workshop-web\auth.ts:14: * WHY EVERY EXPORT CARRIES AN EXPLICIT TYPE. Without them tsc fails with
apps\api\src\security\security.module.ts:15: * ⚠️ `IdentityModule` IS IMPORTED FOR THE GUARD, NOT FOR THIS MODULE'S OWN CODE.
apps\api\src\security\security-posture.service.ts:206:   * 🔴 THE SINGLE MOST IMPORTANT CHECK IN THIS FILE. PostgreSQL exempts a
apps\api\src\repair\repair-plan.spec.ts:700:    // ⚠️ REPORTED, NOT REFUSED — and this is the design decision, so it is asserted.
apps\api\src\repair\repair-plan.service.ts:125:   * ⚠️ REPORTED, NOT REFUSED — see `submit`. Surfaced here because the whole point
apps\api\src\repair\repair-plan.service.ts:1007:   *    to satisfy a rule. So it is REPORTED — `unaddressedFaultCount` on the record
apps\api\src\repair\job-card.service.ts:443:    // case: `2.txt` §537 lets them REPORT a problem, which opens a card — it does
apps\api\src\repair\inspection-checklist.ts:138: * §557 has inspection findings reaching the customer as a DIAGNOSTIC REPORT and
apps\api\src\operations\redaction.spec.ts:19: * ⚠️ `safeMessage` IS EXPORTED FOR THIS. The first version of this file tried to
apps\api\src\operations\operations.service.ts:16: * SERVICE WORKS, NOT THAT A PORT IS OPEN.**
apps\workshop-web\app\_screens\repair-plan-sheet-screen.tsx:37: * ── THE REJECTION REASON IS THE MOST IMPORTANT TEXT ON THE PAGE ─────────────
apps\api\src\operations\operations.module.ts:16: * ⚠️ `IdentityModule` IS IMPORTED FOR THE GUARD, NOT FOR THIS MODULE'S CODE.
apps\workshop-web\app\_screens\repair-plan-review-form.tsx:131:      {/* ⚠️ THE ONE THING A REVIEWER MUST NOT MISS. The service REPORTS unaddressed
apps\api\src\marketplace\marketplace.module.ts:10: * ⚠️ `IdentityModule` IS IMPORTED FOR THE GUARD, NOT FOR THIS MODULE'S OWN CODE,
apps\api\src\main.ts:13:  const port = process.env.PORT ?? 4000;
apps\workshop-web\app\_screens\proposal-queue-screen.tsx:19: * workspace — a different app (`customer-web`), where the vehicle owner answers for
apps\api\src\identity\registration.controller.ts:72:       * membership — which for `customer-web` is not an edge case, it is the
apps\api\src\identity\membership.repository.ts:38:     * TenantGuard — and for `customer-web` that viewer is the entire audience.
apps\api\src\core\core.module.ts:16: * the services are EXPORTED: later modules depend on this one, never the
apps\workshop-web\app\_screens\diagnosis-sheet-screen.tsx:37: * ── THE REJECTION REASON IS THE MOST IMPORTANT TEXT ON THE PAGE ─────────────
apps\workshop-web\app\_screens\create-workshop-screen.tsx:16: * It is mounted in workshop-web's layout ONLY. A customer with no workshop is
apps\workshop-web\app\_screens\create-workshop-screen.tsx:17: * not an incomplete workshop owner — they are a customer, and `customer-web`
apps\api\src\catalogue\catalogue.module.ts:16: * ⚠️ `IdentityModule` IS IMPORTED FOR THE GUARDS, NOT FOR THIS MODULE'S OWN
apps\api\Dockerfile:3:# SAME REASONING AS `apps/workshop-web/Dockerfile` (ADR-017): CI builds the
apps\api\Dockerfile:78:# Render assigns the port and routes to it; `main.ts` already reads PORT and
apps\api\Dockerfile:81:ENV PORT=10000
apps\workshop-web\app\repair-services\quality-control\page.tsx:7: * 🔴 THE MOST IMPORTANT OF THE THREE, AND THE EASIEST TO OVERLOOK. This is where
apps\workshop-web\app\page.tsx:19: * in `customer-web`, deployed at a different hostname, and reaching them from
apps\workshop-web\app\page.tsx:53: * `renderAddToBasket` is omitted. The basket belongs to `customer-web`; a
apps\admin-web\auth.ts:14: * WHY EVERY EXPORT CARRIES AN EXPLICIT TYPE. Without them tsc fails with
apps\towing-web\auth.ts:14: * WHY EVERY EXPORT CARRIES AN EXPLICIT TYPE. Without them tsc fails with
apps\supplier-web\package.json:6:    "dev": "next dev -p 3002",
apps\supplier-web\package.json:8:    "start": "next start -p 3002",
apps\e2e\playwright.config.ts:29:  { name: 'workshop', port: 3001 },
apps\e2e\playwright.config.ts:30:  { name: 'supplier', port: 3002 },
apps\e2e\playwright.config.ts:38:export const STORYBOOK_PORT = 6100;
apps\e2e\playwright.config.ts:97:      use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${STORYBOOK_PORT}` },
apps\e2e\playwright.config.ts:113:      command: `npx http-server ../storybook/storybook-static -p ${STORYBOOK_PORT} --silent`,
apps\e2e\playwright.config.ts:114:      url: `http://127.0.0.1:${STORYBOOK_PORT}`,
apps\supplier-web\auth.ts:14: * WHY EVERY EXPORT CARRIES AN EXPLICIT TYPE. Without them tsc fails with
apps\customer-web\package.json:2:  "name": "@autoworkshop/customer-web",
apps\customer-web\next.config.mjs:33:   * `node apps/customer-web/server.js` finds nothing. On Render that surfaces
apps\customer-web\Dockerfile:1:# Container image for `customer-web` — THE PUBLIC LANDING PAGE.
apps\customer-web\Dockerfile:6:# the apex served `workshop-web`, so the magnet existed only in the repository.
apps\customer-web\Dockerfile:42:COPY apps/customer-web/package.json apps/customer-web/
apps\customer-web\Dockerfile:45:# `--filter @autoworkshop/customer-web...` (trailing dots) installs this app plus
apps\customer-web\Dockerfile:48:RUN pnpm install --frozen-lockfile --filter "@autoworkshop/customer-web..."
apps\customer-web\Dockerfile:61:RUN pnpm --filter @autoworkshop/customer-web build
apps\customer-web\Dockerfile:79:# standalone/{apps/customer-web/server.js,node_modules,package.json}.
apps\customer-web\Dockerfile:80:COPY --from=builder --chown=node:node /repo/apps/customer-web/.next/standalone ./
apps\customer-web\Dockerfile:83:COPY --from=builder --chown=node:node /repo/apps/customer-web/.next/static ./apps/customer-web/.next/static
apps\customer-web\Dockerfile:87:ENV PORT=3000 HOSTNAME=0.0.0.0
apps\customer-web\Dockerfile:90:CMD ["node", "apps/customer-web/server.js"]
apps\customer-web\auth.ts:12: * (`autoworkshop-customer-web`); there is nothing per-app to configure here.
apps\customer-web\auth.ts:14: * WHY EVERY EXPORT CARRIES AN EXPLICIT TYPE. Without them tsc fails with
apps\customer-web\app\page.tsx:116:      // customer-web's own client-side store; the shared landing must not know
apps\customer-web\app\(app)\marketplace\page.tsx:119:      // customer-web's own client-side store; the shared landing must not know
scripts\sync-mobile-client.sh:46:METRO_PORT="${METRO_PORT:-8081}"
scripts\sync-mobile-client.sh:169:}))' "$CLIENT_ID" "$HOST_IP" "$METRO_PORT")"
scripts\sync-mobile-client.sh:204:want = 'exp://${HOST_IP}:${METRO_PORT}/*'
scripts\start-session.sh:11:#      from a PREVIOUS DAY keeps serving port 3001/4000. The symptoms look
scripts\start-session.sh:49:# 🔴 THE PORT LIST IS DERIVED, NOT TYPED. It used to be the literal
scripts\start-session.sh:50:# `3000,3001,3002,4000`, which covered three of the SEVEN web apps. A stale
scripts\start-session.sh:62:# matching the exact form `next start -p <port>` — so `--port`, `PORT=… next
scripts\start-session.sh:67:PORT_SCAN="$(python - <<'PY'
scripts\start-session.sh:90:    # -p 3001 | --port 3001 | --port=3001 | PORT=3001
scripts\start-session.sh:92:        re.search(r'\bPORT=(\d{2,5})\b', start)
scripts\start-session.sh:103:DEV_PORTS="$(printf '%s' "$PORT_SCAN" | head -1)"
scripts\start-session.sh:105:printf '%s\n' "$PORT_SCAN" | grep '^UNPARSED ' | while read -r _ app rest; do
scripts\start-session.sh:111:    \$ports = @(${DEV_PORTS})
scripts\start-session.sh:128:  ok "ports ${DEV_PORTS} free (anything still listening is printed above)"
scripts\start-session.sh:251:  (cd apps/workshop-web && rm -rf .next && ./node_modules/.bin/next build)
scripts\start-session.sh:252:  # then next start -p 3001 with AUTH_SECRET/AUTH_URL/API_BASE_URL/KEYCLOAK_* set
scripts\start-session.sh:256:  powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort 3001 -State Listen | ForEach-Object { Get-Process -Id \$_.OwningProcess | Select-Object Id,StartTime }"
scripts\start-local.sh:41:#   APPS="workshop:3001 supplier:3002 admin:3006" bash scripts/start-local.sh
scripts\start-local.sh:51:API_PORT=4000
scripts\start-local.sh:52:KC_PORT=8080
scripts\start-local.sh:63:APPS="${APPS:-workshop:3001}"
scripts\start-local.sh:118:CANONICAL_KC="http://${HOST_IP}:${KC_PORT}"
scripts\start-local.sh:132:  _ "http://localhost:${KC_PORT}" "$KC_ADMIN" >/dev/null
scripts\start-local.sh:191:APP_PORT_LIST="$API_PORT"
scripts\start-local.sh:192:for entry in $APPS; do APP_PORT_LIST="${APP_PORT_LIST},${entry##*:}"; done
scripts\start-local.sh:193:echo "==> freeing ports ${APP_PORT_LIST}"
scripts\start-local.sh:195:  foreach (\$p in @(${APP_PORT_LIST})) {
scripts\start-local.sh:201:# 🔴 ASSERT THE PORTS ARE ACTUALLY FREE. Raised by Codex, and it is the defect
scripts\start-local.sh:208:  @(${APP_PORT_LIST}) | ForEach-Object {
scripts\start-local.sh:230:echo "==> starting API on ${API_PORT}"
scripts\start-local.sh:284:URL_LIST="http://localhost:${API_PORT}/api/v1/health"
scripts\start-local.sh:346:const api = 'http://localhost:${API_PORT}/api/v1';
scripts\start-local.sh:370:#   (cd apps/e2e && WORKSHOP_WEB_URL=http://${HOST_IP}:3001 \
apps\e2e\tests\sign-out-revocation.spec.ts:33:const CUSTOMER_WEB = process.env['CUSTOMER_WEB_URL'] ?? 'http://localhost:3000';
apps\e2e\tests\shell-journey.spec.ts:8:// ⚠️ IMPORTED FROM THE MODULE, NOT FROM THE PACKAGE BARREL — AND IT MATTERS.
apps\e2e\tests\build-freshness.setup.ts:93:    // so this guard reported customer-web as serving a STALE BUILD, failed as a
apps\e2e\tests\a11y-workspaces.spec.ts:18:const VIEWPORTS = [
apps\e2e\tests\a11y-workspaces.spec.ts:24:  for (const vp of VIEWPORTS) {
apps\e2e\playwright.identity.config.ts:26: *   (cd apps/customer-web && rm -rf .next && next build \
apps\e2e\playwright.identity.config.ts:45:    baseURL: process.env['CUSTOMER_WEB_URL'] ?? 'http://localhost:3000',
apps\e2e\verify\check-identity-switch.mjs:10:const BASE = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\capture-session.mjs:47:// to prove what the API hands a TECHNICIAN, which needs a workshop-web session
apps\e2e\verify\capture-session.mjs:48:// rather than a customer-web one. Defaults unchanged, so the finding-5
apps\e2e\verify\capture-session.mjs:50:const APP = arg('url', process.env['CUSTOMER_WEB_URL'] ?? 'http://localhost:3000');
apps\e2e\verify\capture-session.mjs:64:// customer-web 2026-07-29 while proving the inspection refusals; both links go
apps\e2e\verify\check-routes-signed-in.mjs:2:const BASE='http://localhost:3001';
apps\e2e\verify\check-switch-user.mjs:10:const BASE = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001', PASSWORD = 'Change_me_locally1!';
apps\e2e\verify\check-switch-user.mjs:45:await p.waitForURL(/\/api\/auth\/signin|openid-connect|localhost:3001/, { timeout: 90000 }).catch(() => {});
apps\fleet-web\auth.ts:14: * WHY EVERY EXPORT CARRIES AN EXPLICIT TYPE. Without them tsc fails with
scripts\guardrails\check-page-gates.sh:24:# the IMPORT LINE. A page could import the function and never call it, call it
scripts\guardrails\check-page-gates.sh:63:ROUTE_GATED_APPS=("workshop-web:workshop" "customer-web:customer")
scripts\guardrails\check-page-gates.sh:76:# component — `workshop-web/app/home/dashboard/page.tsx` declares
scripts\guardrails\check-page-gates.sh:137:  # apps/workshop-web/app/customer-reception/customers/page.tsx
scripts\guardrails\check-page-gates.sh:307:  # ---- the ROUTE-gated form (workshop-web) --------------------------------
scripts\guardrails\check-page-gates.sh:314:    mkdir -p "$tmp/apps/workshop-web/app/customer-reception/customers"
scripts\guardrails\check-page-gates.sh:315:    cat > "$tmp/apps/workshop-web/app/customer-reception/customers/page.tsx"
scripts\guardrails\check-page-gates.sh:380:    mkdir -p "$tmp/apps/workshop-web/app/customers/customer-search/[id]"
scripts\guardrails\check-page-gates.sh:381:    cat > "$tmp/apps/workshop-web/app/customers/customer-search/[id]/page.tsx"
apps\insurance-web\auth.ts:14: * WHY EVERY EXPORT CARRIES AN EXPLICIT TYPE. Without them tsc fails with
apps\e2e\verify\measure-repair-plan-layout.mjs:36:const BASE = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\measure-repair-plan-layout.mjs:43:const VIEWPORTS = [
apps\e2e\verify\measure-repair-plan-layout.mjs:155:for (const viewport of VIEWPORTS) {
apps\e2e\verify\measure-inspection-layout.mjs:23:const BASE = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\measure-diagnosis-layout.mjs:28:const BASE = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\plan-repair-in-browser.mjs:32:const BASE = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\peek-reauth.mjs:2:const BASE='http://localhost:3001', PASSWORD='Change_me_locally1!';
apps\e2e\verify\record-diagnosis-in-browser.mjs:27:const BASE = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\record-inspection-in-browser.mjs:20:const BASE = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\submit-form-signed-in.mjs:10: *     --url http://localhost:3001/customers/register-customer \
apps\e2e\verify\verify-catalogue-screens.mjs:22:const SUPPLIER_WEB = process.env['SUPPLIER_WEB_URL'] ?? 'http://localhost:3002';
apps\e2e\verify\verify-catalogue-screens.mjs:83:  console.log('\n1. supplier-web :3002 /products/product-catalogue');
apps\e2e\verify\verify-customer-workflow.mjs:35:const CUSTOMER = process.env['CUSTOMER_WEB_URL'] ?? 'http://localhost:3000';
apps\e2e\verify\verify-directory-optin.mjs:20:const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\verify-job-card-detail.mjs:29:const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\mobile\src\auth\session.ts:194:  // ⚠️ THE OUTCOME IS REPORTED, NOT ASSUMED. Raised by Codex: this used to
apps\e2e\verify\verify-job-queues.mjs:25:// ⚠️ THE DEFINITIONS ARE READ AS SOURCE, NOT IMPORTED. They live in a
apps\e2e\verify\verify-job-queues.mjs:30:  join(dirname(fileURLToPath(import.meta.url)), '../../workshop-web/app/_screens/job-queue-definitions.ts'),
apps\e2e\verify\verify-job-queues.mjs:58:const BASE = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\verify-nav-gaps-closed.mjs:24:const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\verify-pricing-screen.mjs:21:const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\verify-quality-control.mjs:34:const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\verify-quick-create-buttons.mjs:15:const WEB = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\verify-role-switcher.mjs:32: * Runs against workshop-web AND supplier-web, because the whole point of the
apps\e2e\verify\verify-role-switcher.mjs:34: * workshop-web alone would prove the thing that already worked.
apps\e2e\verify\verify-role-switcher.mjs:42:const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\verify-role-switcher.mjs:43:const SUPPLIER = 'http://localhost:3002';
apps\e2e\verify\verify-role-switcher.mjs:143:  // ═══ 1. workshop-web — the owner, who now holds three roles ══════════════
apps\e2e\verify\verify-role-switcher.mjs:144:  console.log('\n1. workshop-web :3001 — owner@ (platform_administrator + workshop_owner + technician)');
apps\e2e\verify\verify-role-switcher.mjs:201:  // The rollout's actual claim. workshop-web already worked on 2026-07-31.
apps\e2e\verify\verify-role-switcher.mjs:202:  console.log('\n2. supplier-web :3002 — the same account, in an app that never had a switcher');
apps\e2e\verify\verify-role-switcher.mjs:220:  console.log('\n3. workshop-web :3001 — reception@ (one role, TWO organisations)');
apps\e2e\verify\verify-security-hub.mjs:18: * ⚠️ IT ASSERTS THE REPORT IS NON-VACUOUS. A posture report that renders
apps\e2e\verify\verify-security-hub.mjs:32: * ⚠️ 3006, NOT 3002. The port is not free choice: the realm pins
apps\e2e\verify\verify-security-hub.mjs:214:    'A TECHNICIAN READ THE SECURITY POSTURE REPORT',
apps\e2e\verify\verify-technician-workflow.mjs:37:const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\verify-top-bar-identity.mjs:39:const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://192.168.0.124:3001';
apps\e2e\verify\verify-variation-screen.mjs:20:const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
apps\e2e\verify\verify-vin-funnel.mjs:41:const BASE = process.env['CUSTOMER_WEB_URL'] ?? 'http://192.168.0.124:3005';
apps\e2e\verify\verify-workshop-onboarding.mjs:45:const BASE = process.env['WORKSHOP_WEB_URL'] ?? 'http://192.168.0.124:3001';
rg: docker-compose*.yml: The filename, directory name, or volume label syntax is incorrect. (os error 123)

codex
A likely review angle is emerging: the customer verifier is more fragile than the product code it is meant to prove. I’m checking the form markup and action payload now so any findings are tied to exact selectors and behavior rather than just style preferences.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path apps/customer-web/app/_screens/proposal-decision-actions.ts' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path apps/customer-web/app/_screens/proposal-decision-form.tsx' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path apps/customer-web/app/_screens/repair-journey-screen.tsx' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path apps/api/src/repair/proposal.service.ts | Select-Object -Skip 430 -First 240' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 1451ms:
'use server';

import { revalidatePath } from 'next/cache';
import { apiPost } from '@autoworkshop/next-shell';
import type { ActionResult } from '@autoworkshop/ui';

/**
 * Â§7 â€” the customer approves, declines or questions a repair proposal, themselves.
 *
 * â”€â”€ WHAT THIS DELIBERATELY DOES NOT SEND â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 * Not `decidedByName`, and not `decisionChannel`. Both are DERIVED by the API:
 * the name from the customer record the proposal hangs off, the channel from
 * the route (`customer_portal`). `CustomerProposalDecisionBody` does not admit
 * either, so Zod strips them if they ever appear.
 *
 * That is not tidiness. `decided_by_name` and `decision_channel` are the consent
 * record a disputed authorisation is settled from â€” sending them from the
 * browser would let a customer approve chargeable work under somebody else's
 * name, or file a portal approval as a telephone call no recording exists for.
 *
 * âš ï¸ The screen never sends a proposal id the viewer did not receive from their
 * own list, and the API re-checks ownership anyway with a `c.user_id` predicate
 * inside the same statement that locks the row. The form is not the control.
 */
export async function decideProposalAction(formData: FormData): Promise<ActionResult> {
  const read = (k: string) => {
    const v = String(formData.get(k) ?? '').trim();
    return v === '' ? undefined : v;
  };

  const proposalId = read('proposalId');
  if (!proposalId) return { error: 'Nothing was selected to answer. Reload the page and try again.' };

  const decision = read('decision');

  const result = await apiPost(`customer`, `/proposals/${proposalId}/customer-decision`, {
    decision,
    // Only when approving. Sending an option alongside a decline would be
    // recording a choice the customer did not make.
    approvedOption: decision === 'approved' ? read('approvedOption') : undefined,
    note: read('note'),
  });

  if (!result.ok) {
    const error =
      /*
        âš ï¸ `invalid` COVERS 409 AS WELL AS 400 â€” see `ApiResult`. That matters
        here because the two most likely refusals on this route are conflicts:
        "this proposal has not been sent to you yet" and "you already answered
        version 2". Both arrive as `invalid` CARRYING THE API'S OWN SENTENCE,
        which is far more use than anything invented in the browser.

        A `result.reason === 'conflict'` branch was written first and DELETED:
        no such reason exists, so it could never have run, and a real 409 would
        have fallen through to "the service did not respond" â€” telling the
        customer the system was broken when it had in fact answered clearly.
      */
      result.reason === 'invalid'
        ? (result.message ??
          'That answer was not accepted. If you are declining or asking for changes, please say why.')
        : result.reason === 'forbidden'
          ? (result.message ?? 'Your account may not answer this proposal.')
          : result.reason === 'unauthenticated'
            ? 'Your session has ended. Sign in again, then retry.'
            : result.reason === 'notFound'
              ? 'That proposal is no longer available. Reload the page.'
              : 'The service did not respond. Nothing has been sent â€” try again shortly.';
    return { error };
  }

  // Every customer screen that shows the state of a repair, because a decision
  // moves the job card as well as the proposal. Revalidating only this page
  // would leave the dashboard and the tracking list showing the old stage.
  for (const path of [
    '/service-and-repairs/repair-proposals',
    '/service-and-repairs/repair-tracking',
    '/service-and-repairs/service-requests',
    '/home/dashboard',
  ]) {
    revalidatePath(path);
  }

  return {
    created:
      decision === 'approved'
        ? 'Approved. The workshop has been told and will start the work.'
        : decision === 'declined'
          ? 'Declined. The workshop has been told.'
          : 'Sent. The workshop will come back to you.',
  };
}

 succeeded in 1478ms:
'use client';

import * as React from 'react';
import { Field, FormShell, Select, SubmitButton, TextInput } from '@autoworkshop/ui';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import { decideProposalAction } from './proposal-decision-actions';

/**
 * Â§7 â€” the customer's answer to a repair proposal, made by the customer.
 *
 * âš ï¸ THIS FORM HAS A SUBMIT BUTTON, AND THAT SENTENCE IS HERE ON PURPOSE.
 * `FormShell` renders whatever children it is given and adds nothing; a form
 * shipped without one passed typecheck, lint AND `next build` in this repo on
 * 2026-08-03 and was found only by opening it in a browser.
 *
 * â”€â”€ WHAT IS SENT, AND WHAT IS NOT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 * Sent: the decision, the option (only when approving) and a note. NOT the
 * customer's name and NOT the channel â€” the API derives both, because on this
 * route they are the consent record rather than the caller's input. See
 * `proposal-decision-actions.ts`.
 */
export function ProposalDecisionForm({
  proposalId,
  recommendedTotal,
  comprehensiveTotal,
  currency,
}: {
  proposalId: string;
  recommendedTotal: number;
  comprehensiveTotal: number;
  currency: string;
}) {
  const [decision, setDecision] = React.useState('approved');
  const approving = decision === 'approved';

  const money = (n: number) =>
    `${currency} ${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div
      style={{
        marginTop: primitive.space[4],
        paddingTop: primitive.space[4],
        borderTop: `1px solid ${themeVar.borderDefault}`,
      }}
    >
      <FormShell action={decideProposalAction} successPrefix="">
        <input type="hidden" name="proposalId" value={proposalId} />

        <Field label="Your answer" htmlFor="decision">
          <Select
            id="decision"
            name="decision"
            value={decision}
            onChange={(e) => setDecision(e.currentTarget.value)}
            options={[
              { value: 'approved', label: 'Approve â€” go ahead with the work' },
              { value: 'changes_requested', label: 'Ask a question or request a change' },
              { value: 'declined', label: 'Decline â€” do not do the work' },
            ]}
          />
        </Field>

        {/*
          The option ONLY when approving. Rendering it beside a decline would
          invite the customer to pick a repair they are refusing, and the action
          drops it in that case anyway â€” but a control that is ignored is a
          control that lies.
        */}
        {approving ? (
          <Field label="Which option are you approving?" htmlFor="approvedOption">
            <Select
              id="approvedOption"
              name="approvedOption"
              defaultValue="recommended"
              options={[
                { value: 'recommended', label: `Recommended repair â€” ${money(recommendedTotal)}` },
                { value: 'comprehensive', label: `Comprehensive repair â€” ${money(comprehensiveTotal)}` },
              ]}
            />
          </Field>
        ) : null}

        <Field
          label={approving ? 'Anything to add (optional)' : 'Please say why â€” required'}
          htmlFor="note"
        >
          <TextInput
            id="note"
            name="note"
            // The API requires a note for anything that is not an approval, and
            // refusing server-side without saying so here would read as a bug.
            required={!approving}
            placeholder={
              approving
                ? 'Any instructions for the workshop'
                : 'What would you like changed, or why are you declining?'
            }
          />
        </Field>

        <SubmitButton>{approving ? 'Approve this repair' : 'Send my answer'}</SubmitButton>
      </FormShell>

      <p
        style={{
          margin: `${primitive.space[3]} 0 0`,
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.xs,
        }}
      >
        {/*
          The customer is told this is recorded against their name. An approval
          for chargeable work should not feel like an anonymous click.
        */}
        Your answer is recorded against your account, with the date and time, and
        the workshop can see it immediately.
      </p>
    </div>
  );
}

 succeeded in 1604ms:
import { Suspense } from 'react';
import Link from 'next/link';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '@autoworkshop/ui';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import { customerStage, needsCustomer, type JourneyPhase } from './repair-journey';
import { ProposalDecisionForm } from './proposal-decision-form';

/**
 * The customer's repair journey â€” `01 (1).txt` Â§33's `service-and-repairs` group.
 *
 * ONE screen at FOUR routes, following `job-card-detail-screen.tsx`, which is
 * mounted at four role-tree routes for the same reason: the four differ only in
 * WHICH of the customer's cards they show and how the empty state reads. Four
 * near-identical files would be four places to fix the next bug in.
 *
 *   /service-and-repairs/service-requests    every request, newest first
 *   /service-and-repairs/repair-tracking     the ones still open
 *   /service-and-repairs/repair-proposals    the ones waiting on the customer
 *   /service-and-repairs/completed-repairs   the ones that are done
 *
 * âš ï¸ THE FILTER HERE IS PRESENTATION, NOT ACCESS CONTROL. `JobCardService.list`
 * narrows a `customer` viewer to cards raised against their OWN vehicles â€” one
 * `c.user_id` predicate in the SQL â€” and Postgres RLS isolates the tenant
 * underneath that. Both hold whatever this file does. If this component were
 * deleted the data would still be correctly scoped; if the service's predicate
 * were deleted, no amount of filtering here would save it (CLAUDE.md Â§8).
 */

export const dynamic = 'force-dynamic';

/**
 * âš ï¸ THESE NAMES ARE THE API'S, NOT PLAUSIBLE ONES.
 * `JobCard` in `apps/api/src/repair/job-card.service.ts` is the contract. The
 * mobile app once read `stageOptions` where the API returns `allowedStages`;
 * nothing threw, the list was empty, and every user â€” owners included â€” was told
 * "your role cannot move this job". A wrong field name here would render a blank
 * card rather than an error.
 */
interface JobCardRow {
  id: string;
  jobNumber: string;
  vehicleId: string;
  registrationNumber: string;
  vehicleDescription: string;
  complaint: string;
  stage: string;
  priority: string;
  assignedTechnicianName: string | null;
  expectedCompletionOn: string | null;
  openedAt: string;
  stageChangedAt: string;
  closedAt: string | null;
}

export type JourneyView = 'all' | 'open' | 'needs-you' | 'finished';

/**
 * The slice of RepairProposal these screens read.
 *
 * WARNING: NAMES TAKEN FROM apps/api/src/repair/proposal.service.ts, not
 * invented. `presentation` carries the disclosures of 410-422; only the money
 * and the two option totals are rendered here, with the narrative the workshop
 * wrote. `decidable` is the API's OWN judgement of whether an answer is still
 * possible - the form is shown on THAT, never on a status string this file
 * re-derives. A superseded version is therefore never offered.
 */
interface ProposalRow {
  id: string;
  jobCardId: string;
  jobNumber: string;
  versionNo: number;
  status: string;
  expectedResult: string | null;
  riskAndLimitations: string | null;
  uncertainties: string | null;
  decidable: boolean;
  presentation: {
    currency: string;
    recommendedTotal: number;
    comprehensiveTotal: number;
    estimatedLabourHours: number;
    documentReference: string;
  };
}

const VIEWS: Record<
  JourneyView,
  {
    title: string;
    description: string;
    emptyTitle: string;
    emptyDescription: string;
    keep: (card: JobCardRow) => boolean;
  }
> = {
  all: {
    title: 'My Service Requests',
    description:
      'Every repair you have asked this workshop for, newest first â€” including the ones already finished.',
    emptyTitle: 'You have not requested any repairs yet',
    emptyDescription:
      'Report a problem with one of your vehicles and the request will appear here, with its progress.',
    keep: () => true,
  },
  open: {
    title: 'Repair Tracking',
    description: 'Where each of your vehicles has got to. Updated as the workshop moves the job on.',
    emptyTitle: 'Nothing is in for repair',
    emptyDescription:
      'When you report a problem and the workshop takes the vehicle in, you can follow its progress here.',
    keep: (c) => phaseOf(c) !== 'finished',
  },
  'needs-you': {
    title: 'Repair Proposals and Approvals',
    description:
      'The repairs that cannot go any further until you do something â€” approve a quote, pay a deposit, answer a question or collect the vehicle.',
    emptyTitle: 'Nothing is waiting on you',
    emptyDescription:
      'When the workshop needs your approval, a deposit or an answer, it will appear here. Nothing starts on your vehicle without it.',
    keep: (c) => needsCustomer(c.stage),
  },
  finished: {
    title: 'Completed Repairs',
    description: 'Work this workshop has finished on your vehicles.',
    emptyTitle: 'No completed repairs yet',
    emptyDescription: 'Once a repair is finished and the vehicle handed back, it is recorded here.',
    keep: (c) => phaseOf(c) === 'finished',
  },
};

function phaseOf(card: JobCardRow): JourneyPhase {
  return customerStage(card.stage).phase;
}

function when(iso: string): string {
  // Fixed locale, not the server's. A date that renders differently on two
  // machines gets reported as a data bug.
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function RepairJourneyScreen({ view }: { view: JourneyView }) {
  const config = VIEWS[view];
  return (
    <>
      <PageHeader title={config.title} description={config.description} />
      <Suspense fallback={<LoadingState label="Loading your repairsâ€¦" />}>
        <JourneyList view={view} />
      </Suspense>
    </>
  );
}

async function JourneyList({ view }: { view: JourneyView }) {
  const config = VIEWS[view];
  const result = await apiGet<JobCardRow[]>('customer', '/job-cards');

  /*
    Proposals are read ONLY on the view that can act on them. The other three
    would pay for a second round trip to render nothing - and this endpoint was
    closed to customers entirely until 2026-08-04, so a failure here must not
    take the repair list down with it. Hence a separate, tolerated result.
  */
  const proposals =
    view === 'needs-you' ? await apiGet<ProposalRow[]>('customer', '/proposals') : null;

  if (!result.ok) {
    // Covers `unauthenticated` too, which is the normal state for a signed-out
    // visitor: `requireNavRoute` does not refuse them (see the page comment),
    // so this is where they are told to sign in.
    return <ApiFailure reason={result.reason} workspaceId="customer" />;
  }

  const cards = result.data.filter(config.keep);

  if (cards.length === 0) {
    return <EmptyState title={config.emptyTitle} description={config.emptyDescription} />;
  }

  // Newest first. The API orders for the workshop's purposes; a customer with
  // three cars wants the thing that happened most recently at the top.
  const ordered = [...cards].sort(
    (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime(),
  );

  const waiting = ordered.filter((c) => needsCustomer(c.stage)).length;

  return (
    <>
      {/*
        On every view EXCEPT the one that is already only these cards. Telling
        someone "2 need you" on the page listing exactly those two is noise.
      */}
      {view !== 'needs-you' && waiting > 0 ? (
        <p
          style={{
            margin: `0 0 ${primitive.space[4]}`,
            padding: primitive.space[3],
            borderRadius: primitive.radius.md,
            border: `1px solid ${themeVar.borderDefault}`,
            background: themeVar.surfaceRaised,
            fontSize: primitive.fontSize.sm,
          }}
        >
          <strong>{waiting}</strong>{' '}
          {waiting === 1 ? 'repair is waiting on you' : 'repairs are waiting on you'}.{' '}
          <Link href="/service-and-repairs/repair-proposals">See what is needed</Link>
        </p>
      ) : null}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: primitive.space[4] }}>
        {ordered.map((card) => (
          <JourneyCard
            key={card.id}
            card={card}
            /*
              The proposal still OPEN on this card. `decidable` is the API's
              judgement, so an already-answered or superseded version is not
              offered and the customer cannot answer the same thing twice.
            */
            proposal={
              proposals?.ok
                ? proposals.data.find((p) => p.jobCardId === card.id && p.decidable)
                : undefined
            }
          />
        ))}
      </ul>
    </>
  );
}

function JourneyCard({ card, proposal }: { card: JobCardRow; proposal?: ProposalRow }) {
  const stage = customerStage(card.stage);
  const yours = stage.phase === 'needs_you';

  return (
    <li
      style={{
        // A card the customer must act on is outlined in the attention colour.
        // The badge alone was not enough at a glance on a phone, which is where
        // most of these are read.
        border: `1px solid ${yours ? themeVar.statusAttention : themeVar.borderDefault}`,
        borderLeft: `4px solid ${yours ? themeVar.statusAttention : themeVar.borderDefault}`,
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
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: primitive.space[3], alignItems: 'baseline' }}>
          <span
            style={{
              // A registration is read out over the phone character by
              // character â€” same reasoning as the order number on Â§2845.
              fontFamily: primitive.fontFamily.mono,
              fontSize: primitive.fontSize.base,
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}
          >
            {card.registrationNumber}
          </span>
          <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
            {card.vehicleDescription}
          </span>
        </div>
        <StatusBadge kind={stage.badge} label={stage.label} />
      </div>

      <p style={{ margin: `${primitive.space[3]} 0 0`, fontSize: primitive.fontSize.sm }}>
        {stage.detail}
      </p>

      <p
        style={{
          margin: `${primitive.space[2]} 0 0`,
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.sm,
        }}
      >
        {/* What they reported, so the card is identifiable when they have several. */}
        â€œ{card.complaint}â€
      </p>

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))',
          gap: primitive.space[3],
          margin: `${primitive.space[4]} 0 0`,
          fontSize: primitive.fontSize.sm,
        }}
      >
        <Fact label="Job number" value={card.jobNumber} mono />
        <Fact label="Requested" value={when(card.openedAt)} />
        <Fact
          label="Expected back"
          value={card.expectedCompletionOn ? when(card.expectedCompletionOn) : 'Not yet estimated'}
        />
        {/*
          The technician's name only once there IS one. "Unassigned" reads as a
          complaint about the workshop rather than as the normal state of a job
          that arrived an hour ago.
        */}
        {card.assignedTechnicianName ? (
          <Fact label="Technician" value={card.assignedTechnicianName} />
        ) : null}
      </dl>

      {yours ? (
        <div style={{ marginTop: primitive.space[4] }}>
          {proposal ? (
            <>
              {/*
                THE PROPOSAL ITSELF, then the controls. Until 2026-08-04 this
                said "contact the workshop": the screen could tell a customer
                their approval was the hold-up and gave them no way to give it,
                so every approval happened by telephone and was typed in by a
                staff member. The customer role is now in CAN_READ_PROPOSAL,
                scoped by a c.user_id predicate inside the query itself.
              */}
              <p style={{ margin: 0, fontSize: primitive.fontSize.sm, fontWeight: 600 }}>
                Repair proposal {proposal.presentation.documentReference} is waiting for your answer.
              </p>
              {proposal.expectedResult ? (
                <p style={{ margin: `${primitive.space[2]} 0 0`, fontSize: primitive.fontSize.sm }}>
                  {proposal.expectedResult}
                </p>
              ) : null}
              {/*
                The risks, and what remains SUSPECTED rather than confirmed.
                These are the fields most likely to be dropped and the ones a
                customer agreeing to a repair is entitled to read: without them
                the first unexpected extra reads as incompetence rather than as
                a stated unknown.
              */}
              {proposal.riskAndLimitations ? (
                <p
                  style={{
                    margin: `${primitive.space[2]} 0 0`,
                    fontSize: primitive.fontSize.sm,
                    color: themeVar.textSecondary,
                  }}
                >
                  <strong>Risks and limitations:</strong> {proposal.riskAndLimitations}
                </p>
              ) : null}
              {proposal.uncertainties ? (
                <p
                  style={{
                    margin: `${primitive.space[2]} 0 0`,
                    fontSize: primitive.fontSize.sm,
                    color: themeVar.textSecondary,
                  }}
                >
                  <strong>Still to be confirmed:</strong> {proposal.uncertainties}
                </p>
              ) : null}
              <ProposalDecisionForm
                proposalId={proposal.id}
                recommendedTotal={proposal.presentation.recommendedTotal}
                comprehensiveTotal={proposal.presentation.comprehensiveTotal}
                currency={proposal.presentation.currency}
              />
            </>
          ) : (
            /*
              No open proposal on this card. The customer is still the hold-up -
              a deposit, a question, or a vehicle to collect - and none of those
              is answerable in this build, so it says what to do rather than
              offering a control that would silently fail.
            */
            <p style={{ margin: 0, fontSize: primitive.fontSize.sm, fontWeight: 600 }}>
              Contact the workshop to {actionFor(card.stage)}.
            </p>
          )}
        </div>
      ) : null}
    </li>
  );
}

/** The verb for the one thing this customer has to do. */
function actionFor(stage: string): string {
  switch (stage) {
    case 'awaiting_customer_approval':
      return 'approve or decline the repair proposal';
    case 'awaiting_deposit':
      return 'pay the deposit so work can start';
    case 'further_information_required':
      return 'answer their question';
    case 'ready_for_collection':
      return 'arrange collection of your vehicle';
    default:
      return 'find out what is needed';
  }
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.xs }}>{label}</dt>
      <dd
        style={{
          margin: 0,
          fontFamily: mono ? primitive.fontFamily.mono : undefined,
        }}
      >
        {value}
      </dd>
    </div>
  );
}

 succeeded in 1994ms:
   * `decidedByName` is the CUSTOMER and is mandatory; `recorded_by` is the staff
   * member who captured it, taken from the session and never from the request. Those
   * are two different facts, and an approval that conflates them cannot answer "who
   * agreed to this" when a customer later says they did not.
   *
   * The channel is mandatory too. Â§7 offers telephone and video consultation, so a
   * decision frequently arrives off-system â€” and "approved" with no channel is an
   * assertion rather than a record.
   */
  async recordDecision(
    ctx: TenantContext,
    proposalId: string,
    input: {
      decision?: string;
      approvedOption?: string;
      decidedByName?: string;
      decisionChannel?: string;
      note?: string;
    },
  ): Promise<RepairProposal> {
    this.assertMayRecordDecision(ctx);
    const id = requireUuid(proposalId, 'id');
    const decision: ProposalDecision = requireOneOf(input.decision, PROPOSAL_DECISIONS, 'decision');
    const channel: DecisionChannel = requireOneOf(
      input.decisionChannel, DECISION_CHANNELS, 'decisionChannel',
    );
    const decidedByName = requireText(input.decidedByName, 'decidedByName', 300);
    const note = optionalText(input.note, 'note', 8000);

    // Â§7's five "request" actions all arrive as `changes_requested`, and the note is
    // what says which. A decline with no reason leaves the workshop nothing to act on.
    if (decision !== 'approved' && note === null) {
      throw new BadRequestException(
        decision === 'declined'
          ? 'a declined proposal must record why; note is required'
          : 'say what the customer asked to change, or what they want explained; note is required',
      );
    }

    const approvedOption: ProposalOption | null =
      decision === 'approved'
        ? requireOneOf(input.approvedOption, PROPOSAL_OPTIONS, 'approvedOption')
        : null;

    return this.db.withTenant(ctx, async (client) => {
      const found = await client.query(
        `SELECT p.id, p.status, p.version_no, j.job_number
           FROM repair.repair_proposals p
           JOIN repair.job_cards j ON j.id = p.job_card_id AND j.tenant_id = p.tenant_id
          WHERE p.id = $1 AND p.tenant_id = $2 AND p.organization_id = $3
          -- Serialises two people recording an answer to the same proposal, so the
          -- second reads the status the first committed.
          FOR UPDATE OF p`,
        [id, ctx.tenantId, ctx.organizationId],
      );
      const row = found.rows[0] as
        | { id: string; status: ProposalStatus; version_no: number; job_number: string }
        | undefined;
      // 404, not 403 â€” the non-oracle rule this codebase holds everywhere.
      if (!row) throw new NotFoundException('proposal not found');

      if (row.status === 'draft') {
        throw new ConflictException(
          'this proposal has not been issued to the customer yet, so there is no decision to record',
        );
      }
      if (row.status !== 'issued') {
        throw new ConflictException(
          `version ${row.version_no} was already ${row.status}; Â§424 requires a new version ` +
            'for a material change, and a further answer belongs to that version',
        );
      }

      await client.query(
        `UPDATE repair.repair_proposals
            SET status = $1, decision = $1, approved_option = $2,
                decided_at = now(), decided_by_name = $3, decision_channel = $4,
                decision_note = $5, recorded_by = $6,
                updated_at = now(), updated_by = $6
          WHERE id = $7 AND tenant_id = $8`,
        [decision, approvedOption, decidedByName, channel, note, ctx.userId, id, ctx.tenantId],
      );

      await this.audit.write(client, ctx, {
        action:
          decision === 'approved'
            ? 'proposal.approved_by_customer'
            : decision === 'declined'
              ? 'proposal.declined_by_customer'
              : 'proposal.changes_requested',
        resourceType: 'proposal',
        resourceId: id,
        // The channel and the option, never the customer's free text. This is the
        // entry a dispute over authorisation is settled from.
        detail: {
          jobNumber: row.job_number,
          versionNo: row.version_no,
          decision,
          approvedOption,
          channel,
        },
      });

      const rows = await this.readProposals(client, ctx, { proposalId: id });
      return ProposalService.one(rows);
    });
  }


  /**
   * Â§7 â€” the customer records their OWN answer, from the customer workspace.
   *
   * â”€â”€ WHY THIS IS A SEPARATE ROUTE AND NOT A FLAG ON `recordDecision` â”€â”€â”€â”€â”€â”€â”€â”€
   *
   * `recordDecision` is written for STAFF CAPTURE: a customer answers by phone,
   * a staff member types it in, and the record keeps those two people apart â€”
   * `decided_by_name` is the customer, `recorded_by` is whoever took the call.
   * That separation is the entire evidential value of the row.
   *
   * When the customer decides in the portal there is no intermediary, and three
   * of that method's inputs stop being inputs at all:
   *
   *   Â· `decidedByName`   â€” IS the session. Accepting it from the body would let
   *                         a customer approve under somebody else's name, which
   *                         is the confused-deputy shape `1.txt` Â§9 forbids.
   *   Â· `decisionChannel` â€” is `customer_portal` by construction. Taking it from
   *                         the request would let the strongest form of approval
   *                         be filed as a phone call nobody can check.
   *   Â· `recorded_by`     â€” is the customer themselves.
   *
   * A boolean on the existing method would have left all three settable and
   * relied on a caller passing the right combination. These are DERIVED here,
   * so there is no combination to get wrong.
   *
   * âš ï¸ THE ROLE CHECK IS NOT THE SCOPE CHECK. `CAN_DECIDE_AS_CUSTOMER` says a
   * customer may use this route; `assertCardVisible` with the `c.user_id`
   * predicate is what stops them deciding on somebody else's proposal. Both are
   * required, and RLS is under both.
   */
  async recordCustomerDecision(
    ctx: TenantContext,
    proposalId: string,
    input: { decision?: string; approvedOption?: string; note?: string },
  ): Promise<RepairProposal> {
    if (!CAN_DECIDE_AS_CUSTOMER.has(ctx.activeRole)) {
      throw new ForbiddenException(
        `role '${ctx.activeRole}' may not decide as the customer; staff use POST /proposals/:id/decision`,
      );
    }
    const id = requireUuid(proposalId, 'id');
    const decision: ProposalDecision = requireOneOf(input.decision, PROPOSAL_DECISIONS, 'decision');
    const note = optionalText(input.note, 'note', 8000);

    // Identical rule to the staff route, deliberately restated rather than
    // relaxed: a refusal with no reason leaves the workshop nothing to act on,
    // and it is no less true because the customer typed it themselves.
    if (decision !== 'approved' && note === null) {
      throw new BadRequestException(
        decision === 'declined'
          ? 'a declined proposal must record why; note is required'
          : 'say what you would like changed or explained; note is required',
      );
    }

    const approvedOption: ProposalOption | null =
      decision === 'approved'
        ? requireOneOf(input.approvedOption, PROPOSAL_OPTIONS, 'approvedOption')
        : null;

    return this.db.withTenant(ctx, async (client) => {
      // The proposal, its card, and the customer's OWN name â€” all in one read,
      // and all constrained to a card this customer owns. `c.user_id` is the
      // scope; `c.display_name` is the attribution, taken from the customer
      // record rather than from the request.
      const found = await client.query(
        `SELECT p.id, p.status, p.version_no, j.job_number, c.display_name
           FROM repair.repair_proposals p
           JOIN repair.job_cards j ON j.id = p.job_card_id AND j.tenant_id = p.tenant_id
           JOIN core.customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
          WHERE p.id = $1 AND p.tenant_id = $2 AND p.organization_id = $3
            AND c.user_id = $4
          FOR UPDATE OF p`,
        [id, ctx.tenantId, ctx.organizationId, ctx.userId],
      );
      const row = found.rows[0] as
        | { id: string; status: ProposalStatus; version_no: number; job_number: string; display_name: string }
        | undefined;
      // 404, not 403 â€” the non-oracle rule this codebase holds everywhere. A
      // customer must not be able to learn that somebody else's proposal exists.
      if (!row) throw new NotFoundException('proposal not found');

      if (row.status === 'draft') {
        throw new ConflictException(
          'this proposal has not been sent to you yet, so there is nothing to answer',
        );
      }
      if (row.status !== 'issued') {
        throw new ConflictException(
          `you already answered version ${row.version_no} (${row.status}). If something has ` +
            'changed, ask the workshop to send a revised proposal',
        );
      }

      await client.query(
        `UPDATE repair.repair_proposals
            SET status = $1, decision = $1, approved_option = $2,
                decided_at = now(), decided_by_name = $3, decision_channel = 'customer_portal',
                decision_note = $4, recorded_by = $5,
                updated_at = now(), updated_by = $5
          WHERE id = $6 AND tenant_id = $7`,
        [decision, approvedOption, row.display_name, note, ctx.userId, id, ctx.tenantId],
      );

      await this.audit.write(client, ctx, {
        action:
          decision === 'approved'
            ? 'proposal.approved_by_customer'
            : decision === 'declined'
              ? 'proposal.declined_by_customer'
              : 'proposal.changes_requested',
        resourceType: 'proposal',
        resourceId: id,
        // `selfService: true` is the fact that distinguishes this entry from the
        // staff-captured one. Same actions, so existing queries keep working;
        // one extra key, so a dispute can tell a portal approval from a phone
        // call written down afterwards.
        detail: {
          jobNumber: row.job_number,
          versionNo: row.version_no,
          decision,
          approvedOption,
          channel: 'customer_portal',
          selfService: true,
        },
      });

      const rows = await this.readProposals(client, ctx, { proposalId: id });
      return ProposalService.one(rows);
    });
  }

codex
The product form uses custom `Select` components and a server action, so selector details matter. I’m checking the navigation definitions next because the sentinel route and workflow routes only make sense if they are actually in the customer tree.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "customerGroups|payments|invoices|repair-proposals|parts-orders|vehicle-lookup|my-vehicles|service-and-repairs" packages/navigation/src/workspaces.ts' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "export function Select|function Select|const Select|type Select" packages apps -g "*.tsx" -g "*.ts"' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"function SubmitButton|export function SubmitButton|type=\\\"submit\\\"|pending\" packages/ui apps -g \"*.tsx\" -g \"*.ts\"" in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"CREATE TABLE repair\\.repair_proposals|repair_proposals \\(|issued_by|updated_by|proposal_status|status_matches|immutable|superseded_by\" infrastructure/migrations/017_repair_proposals.sql" in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 1577ms:
25:-- recorded, and every one of them is already immutable at the point a proposal is
76:CREATE TABLE IF NOT EXISTS repair.repair_proposals (
111:    issued_by        uuid,
139:    superseded_by    uuid,
143:    updated_by       uuid,
148:        status = 'draft' OR (issued_at IS NOT NULL AND issued_by IS NOT NULL)
163:    CONSTRAINT proposal_status_matches_decision CHECK (
203:    DROP CONSTRAINT IF EXISTS fk_proposal_superseded_by;
205:    ADD CONSTRAINT fk_proposal_superseded_by
206:        FOREIGN KEY (superseded_by, tenant_id, organization_id)
207:        REFERENCES repair.repair_proposals (id, tenant_id, organization_id)
211:    ON repair.repair_proposals (job_card_id, version_no DESC);
213:    ON repair.repair_proposals (tenant_id);
215:    ON repair.repair_proposals (quotation_id);
219:    ON repair.repair_proposals (organization_id, issued_at DESC)
230:-- ⚠️ ONE FIELD REMAINS WRITABLE ON A DECIDED PROPOSAL: `superseded_by`. §424 says
305:DROP TRIGGER IF EXISTS trg_proposals_immutable ON repair.repair_proposals;
306:CREATE TRIGGER trg_proposals_immutable

 succeeded in 1844ms:
50:const customerGroups: NavGroup[] = [
56:  group('my-vehicles', 'My Vehicles', 'car', [
63:  group('service-and-repairs', 'Service and Repairs', 'wrench', [
67:    ['repair-proposals', 'Repair Proposals', { counterKey: 'customer.proposals.pending' }],
90:    ['parts-orders', 'My Parts Orders'],
101:  group('payments', 'Payments', 'card', [
103:    ['invoices', 'Invoices'],
104:    ['payments', 'Payments'],
206:    ['invoices', 'Invoices', { permission: 'finance.read' }],
207:    ['payments', 'Payments', { permission: 'finance.read' }],
285:    ['invoices', 'Invoices', { permission: 'finance.read' }],
340:    ['invoices', 'Invoices', { permission: 'finance.read' }],
396:    ['payments', 'Payments', { permission: 'finance.read' }],
438:    ['invoices', 'Invoices', { permission: 'finance.read' }],
611:      ['invoices', 'Invoices', { permission: 'finance.read' }],
612:      ['payments', 'Payments', { permission: 'finance.read' }],
744:    ['invoices', 'Invoices', { permission: 'finance.read' }],
841:    audience: 'Vehicle owners — garage, complaints, proposals, payments',
842:    groups: customerGroups,

 succeeded in 9129ms:
packages\ui\src\TopNav.tsx:216:function Selector({
packages\ui\src\Form.tsx:99:export function Select({

 succeeded in 9306ms:
packages\ui\src\Form.tsx:116:export function SubmitButton({ children }: { children: React.ReactNode }) {
reviews\codex-review.md:5773:"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"function SubmitButton|export function SubmitButton|type=\\\"submit\\\"|pending\" packages/ui apps -g \"*.tsx\" -g \"*.ts\"" in C:\Users\USER\Documents\autoworkshop-ai

codex
The sentinel route is in the customer nav, so that part is coherent. I’m checking whether the fixture can insert a valid issued proposal under the migration constraints; that’s where a few subtle review issues usually hide.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path packages/ui/src/Form.tsx' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path packages/navigation/src/workspaces.ts | Select-Object -First 115' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path apps/customer-web/package.json' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path infrastructure/migrations/017_repair_proposals.sql | Select-Object -Skip 70 -First 260' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 1063ms:
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

 succeeded in 1365ms:
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
  group('payments', 'Payments', 'card', [
    ['quotations', 'Quotations'],
    ['invoices', 'Invoices'],
    ['payments', 'Payments'],
    ['receipts', 'Receipts'],
  ]),
  group('support', 'Support', 'lifebuoy', [
    ['towing', 'Towing and Roadside Support'],
    ['knowledge', 'Knowledge and Maintenance Tips'],
    ['help-center', 'Help Center'],
    ['support-cases', 'Support Cases'],
  ]),
  group('settings', 'Settings', 'settings', [
    ['profile', 'Profile'],
    ['authorized-drivers', 'Authorized Drivers'],

 succeeded in 1408ms:
'use client';

import * as React from 'react';
import { themeVar, primitive } from '@autoworkshop/design-tokens';

/**
 * Form controls â€” shared by every app that writes.
 *
 * MOVED HERE FROM `workshop-web/app/_screens` when customer-web needed the same
 * controls (Directive Â§3: extend, never duplicate). Two copies of a submit
 * handler is how one of them quietly stops preserving typed values, or stops
 * calling `checkValidity`, and nothing says so.
 *
 * âš ï¸ WHY THIS IS HAND-ROLLED STATE AND NOT `useFormState`. This workspace runs
 * **React 18.3.1** (checked, not assumed â€” `apps/workshop-web/node_modules/react`)
 * while Next is 15.1.3. `useFormState` / `useActionState` are React 19 APIs; on
 * 18.3 they are not part of the stable `react-dom` surface, so a form built on
 * them typechecks against the wrong assumption and fails at runtime.
 *
 * A server action can still be CALLED as a plain async function from a client
 * component, which is all this needs. That has a second benefit worth having on
 * purpose: the inputs stay UNCONTROLLED and the page never re-renders from the
 * server on failure, so whatever the user typed is simply still there â€”
 * `01 (1).txt` Â§3553, "Forms shall preserve entered information after
 * recoverable errors", satisfied by construction rather than by re-populating
 * `defaultValue`s and hoping none were missed.
 */

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: primitive.fontSize.sm,
  fontWeight: 600,
  color: themeVar.textPrimary,
  marginBottom: primitive.space[1],
};

const controlStyle: React.CSSProperties = {
  width: '100%',
  padding: primitive.space[3],
  fontSize: primitive.fontSize.base,
  color: themeVar.textPrimary,
  background: themeVar.surfaceRaised,
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.md,
  // Inputs do not inherit the page font by default; without this the form
  // renders in the browser's default serif and looks like a different app.
  fontFamily: 'inherit',
};

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  return (
    <div style={{ marginBottom: primitive.space[4] }}>
      {/* A real <label for>, not a styled div: it is what lets a screen reader
          announce the field, and what makes the label a click target. */}
      <label htmlFor={htmlFor} style={labelStyle}>
        {label}
      </label>
      {hint ? (
        <p
          id={hintId}
          style={{
            margin: `0 0 ${primitive.space[2]} 0`,
            fontSize: primitive.fontSize.sm,
            color: themeVar.textSecondary,
          }}
        >
          {hint}
        </p>
      ) : null}
      {/* `aria-describedby` wires the hint to the control so it is read out with
          the field rather than orphaned above it. */}
      {React.isValidElement(children) && hintId
        ? React.cloneElement(children as React.ReactElement<{ 'aria-describedby'?: string }>, {
            'aria-describedby': hintId,
          })
        : children}
    </div>
  );
}

export const TextInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function TextInput(props, ref) {
  return <input ref={ref} {...props} style={{ ...controlStyle, ...props.style }} />;
});

export function Select({
  options,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select {...props} style={{ ...controlStyle, ...props.style }}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatusShim();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        padding: `${primitive.space[3]} ${primitive.space[6]}`,
        fontSize: primitive.fontSize.base,
        fontWeight: 600,
        fontFamily: 'inherit',
        color: primitive.color.grey[0],
        background: pending ? primitive.color.grey[400] : primitive.color.blue[600],
        border: 'none',
        borderRadius: primitive.radius.md,
        cursor: pending ? 'progress' : 'pointer',
      }}
    >
      {/* The label changes rather than only the colour: Â§66 forbids colour as
          the only signal, and a disabled button with identical text reads as a
          broken button rather than a busy one. */}
      {pending ? 'Savingâ€¦' : children}
    </button>
  );
}

/** Shared pending flag, so `SubmitButton` needs no props from its parent. */
const PendingContext = React.createContext(false);
function useFormStatusShim() {
  return { pending: React.useContext(PendingContext) };
}

export interface ActionResult {
  error?: string;
  created?: string;
}

/**
 * Wraps a form, calls the server action, and renders the outcome.
 *
 * The action is invoked directly rather than through the form's `action`
 * attribute, so its RETURN VALUE is available here â€” that is what carries the
 * API's rejection message back to the person who can fix it.
 */
export function FormShell({
  action,
  children,
  successPrefix,
  successHref,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  successPrefix: string;
  successHref?: { href: string; label: string };
}) {
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<ActionResult | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // `noValidate` below turns off the browser's AUTOMATIC blocking so this
    // handler owns submission â€” but it also turned off the native `required`
    // and `type="email"` checks, and an invalid address was then accepted all
    // the way into the database (Codex review of this slice, P2). Asking for
    // validity explicitly restores the immediate, per-field browser message
    // without giving up control of the submit.
    //
    // âš ï¸ THIS IS NOT THE VALIDATION. It is feedback. The rules live in the
    // domain services, where an MCP tool calling the same service gets them too;
    // anything relying on this is relying on the client (CLAUDE.md Â§8).
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    setPending(true);
    setResult(null);
    try {
      const outcome = await action(new FormData(event.currentTarget));
      setResult(outcome);
      // Cleared only on SUCCESS, so a rejected submission keeps every value.
      if (outcome.created) formRef.current?.reset();
    } catch {
      // The action itself failing (a network drop mid-call) must not leave the
      // button stuck on "Savingâ€¦" with no explanation.
      setResult({ error: 'The request could not be completed. Nothing has been saved.' });
    } finally {
      setPending(false);
    }
  }

  return (
    <PendingContext.Provider value={pending}>
      <form
        ref={formRef}
        onSubmit={onSubmit}
        noValidate
        style={{
          maxWidth: '42rem',
          border: `1px solid ${themeVar.borderDefault}`,
          borderRadius: primitive.radius.lg,
          padding: primitive.space[6],
          background: themeVar.backgroundSecondary,
        }}
      >
        {/* `role="status"` / `role="alert"` so the outcome is ANNOUNCED. A
            visually-obvious banner that a screen reader never mentions leaves a
            blind user unsure whether the button worked. */}
        {result?.created ? (
          <p
            role="status"
            style={{
              margin: `0 0 ${primitive.space[4]} 0`,
              padding: primitive.space[3],
              borderRadius: primitive.radius.md,
              background: primitive.color.green[50],
              color: primitive.color.green[700],
              border: `1px solid ${primitive.color.green[500]}`,
            }}
          >
            {successPrefix} <strong>{result.created}</strong>.{' '}
            {successHref ? <a href={successHref.href}>{successHref.label}</a> : null}
          </p>
        ) : null}

        {result?.error ? (
          <p
            role="alert"
            style={{
              margin: `0 0 ${primitive.space[4]} 0`,
              padding: primitive.space[3],
              borderRadius: primitive.radius.md,
              background: primitive.color.red[50],
              color: primitive.color.red[700],
              border: `1px solid ${primitive.color.red[500]}`,
            }}
          >
            {result.error}
          </p>
        ) : null}

        {children}
      </form>
    </PendingContext.Provider>
  );
}

 succeeded in 1483ms:
--     service.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS repair.repair_proposals (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    job_card_id      uuid NOT NULL,
    -- The approved quotation this proposal presents. NOT NULL and frozen â€” see the
    -- header note: it is what makes "what it will cost" answerable forever.
    quotation_id     uuid NOT NULL,

    -- Â§424's VERSION. Not `attempt_no` like its siblings, because the specification
    -- uses the word "version" and means something slightly different: an attempt is
    -- another try at the same question, a version is a REVISED OFFER after the
    -- customer has seen the last one.
    version_no       integer NOT NULL DEFAULT 1 CHECK (version_no >= 1),

    -- `draft`   â€” being written, not yet shown to anybody
    -- `issued`  â€” presented to the customer; Â§7's decision is now awaited
    -- `approved` / `declined` / `changes_requested` â€” Â§7's outcomes
    -- `superseded` â€” a later version replaced this one (Â§424's material change)
    status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'issued', 'approved', 'declined',
                                       'changes_requested', 'superseded')),

    -- Â§418 â€” "what the work should achieve".
    expected_result  TEXT,
    -- Â§422 â€” "what uncertainties remain". A SEPARATE column from the risks, because
    -- they are different statements: a risk is what might go wrong with the work, an
    -- uncertainty is what the workshop does not yet know. Collapsing them lets the
    -- second quietly disappear, and Â§422 names it explicitly.
    risk_and_limitations TEXT,
    uncertainties    TEXT,
    -- Anything else the customer is told. Free text by design.
    presentation_note TEXT,

    issued_by        uuid,
    issued_at        timestamptz,

    -- â”€â”€ Â§7's DECISION, and the electronic approval record â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    --
    -- âš ï¸ `decided_by_name` IS TEXT, NOT A USER ID, AND THAT IS THE POINT. The
    -- person approving is the CUSTOMER, who in this build has no account of their
    -- own on the workshop side â€” and Â§7 offers voice and video channels, so the
    -- decision frequently arrives by telephone. A foreign key to `identity.users`
    -- would force reception to record their own id as the approver, which is
    -- exactly the attribution error an approval record exists to prevent.
    -- `recorded_by` below is the staff member who CAPTURED it; the two are
    -- different facts and both are kept.
    decision         TEXT CHECK (decision IN ('approved', 'declined', 'changes_requested')),
    -- Which of Â§398-Â§402's tiers was agreed. NULL unless approved.
    approved_option  TEXT CHECK (approved_option IN ('recommended', 'comprehensive')),
    decided_at       timestamptz,
    decided_by_name  TEXT,
    -- How the decision reached the workshop. Â§7 lists the channels; recording it is
    -- what makes a disputed approval investigable.
    decision_channel TEXT CHECK (decision_channel IN (
        'in_person', 'telephone', 'email', 'sms', 'customer_portal')),
    decision_note    TEXT,
    -- The staff member who captured a decision taken off-system. NULL when the
    -- customer approved through the portal themselves.
    recorded_by      uuid,

    -- Â§424 â€” the version that replaced this one.
    superseded_by    uuid,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    -- An issued proposal names who issued it and when.
    CONSTRAINT proposal_issued_attributed CHECK (
        status = 'draft' OR (issued_at IS NOT NULL AND issued_by IS NOT NULL)
    ),
    -- âš ï¸ A DECIDED PROPOSAL MUST NAME THE PERSON, THE TIME AND THE CHANNEL. An
    -- approval with nobody behind it is not an approval â€” and this is the record a
    -- workshop relies on when a customer says "I never agreed to that".
    CONSTRAINT proposal_decision_attributed CHECK (
        status IN ('draft', 'issued', 'superseded')
        OR (decision IS NOT NULL
            AND decided_at IS NOT NULL
            AND decision_channel IS NOT NULL
            AND decided_by_name IS NOT NULL
            AND length(btrim(decided_by_name)) > 0)
    ),
    -- The status and the decision cannot disagree. Two columns saying one thing is
    -- two places for them to drift, so the constraint pins them together.
    CONSTRAINT proposal_status_matches_decision CHECK (
        (status = 'approved'          AND decision = 'approved')
        OR (status = 'declined'          AND decision = 'declined')
        OR (status = 'changes_requested' AND decision = 'changes_requested')
        OR (status IN ('draft', 'issued', 'superseded') AND decision IS NULL)
    ),
    -- An option is agreed only when something was approved.
    CONSTRAINT proposal_option_only_when_approved CHECK (
        approved_option IS NULL OR status = 'approved'
    ),
    -- A declined proposal or one sent back must say why: Â§7's "request
    -- modification" and "request explanation" ARE that sentence, and without it the
    -- workshop has nothing to act on.
    CONSTRAINT proposal_negative_has_reason CHECK (
        status NOT IN ('declined', 'changes_requested')
        OR (decision_note IS NOT NULL AND length(btrim(decision_note)) > 0)
    ),

    CONSTRAINT uq_proposal_version UNIQUE (job_card_id, version_no),

    CONSTRAINT fk_proposal_card_scope
        FOREIGN KEY (job_card_id, tenant_id, organization_id)
        REFERENCES repair.job_cards (id, tenant_id, organization_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_proposal_quotation_scope
        FOREIGN KEY (quotation_id, tenant_id, organization_id)
        REFERENCES repair.quotations (id, tenant_id, organization_id)
        -- RESTRICT: a quotation cannot be deleted anyway (016 revoked DELETE), and
        -- if that changed, taking the proposal with it would erase the record of
        -- what a customer agreed to.
        ON DELETE RESTRICT
);

ALTER TABLE repair.repair_proposals
    DROP CONSTRAINT IF EXISTS uq_repair_proposals_id_tenant_org;
ALTER TABLE repair.repair_proposals
    ADD CONSTRAINT uq_repair_proposals_id_tenant_org UNIQUE (id, tenant_id, organization_id);

-- Declared after the unique key it cites â€” a self-referencing FK is still a FK.
ALTER TABLE repair.repair_proposals
    DROP CONSTRAINT IF EXISTS fk_proposal_superseded_by;
ALTER TABLE repair.repair_proposals
    ADD CONSTRAINT fk_proposal_superseded_by
        FOREIGN KEY (superseded_by, tenant_id, organization_id)
        REFERENCES repair.repair_proposals (id, tenant_id, organization_id)
        ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_proposals_card
    ON repair.repair_proposals (job_card_id, version_no DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_tenant
    ON repair.repair_proposals (tenant_id);
CREATE INDEX IF NOT EXISTS idx_proposals_quotation
    ON repair.repair_proposals (quotation_id);
-- The "waiting on the customer" queue â€” Â§7's whole point, and what the workshop
-- dashboard's `workshop.proposals.pendingApproval` counter reads.
CREATE INDEX IF NOT EXISTS idx_proposals_awaiting_customer
    ON repair.repair_proposals (organization_id, issued_at DESC)
    WHERE status = 'issued';

-- â”€â”€ Â§424: an approved proposal is IMMUTABLE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
--
-- The strongest immutability rule in this codebase so far, and the specification
-- states it in as many words. Its siblings freeze at SUBMISSION because an
-- internal reviewer must see a stable record; this freezes at DECISION because a
-- CUSTOMER acted on it, and changing what they agreed to after the fact is the
-- thing Â§424 exists to forbid.
--
-- âš ï¸ ONE FIELD REMAINS WRITABLE ON A DECIDED PROPOSAL: `superseded_by`. Â§424 says
-- a material change creates a NEW VERSION, and the old row has to be able to point
-- at it â€” otherwise recording the supersession would require breaking the very
-- immutability that makes versioning necessary. Everything else is refused.

CREATE OR REPLACE FUNCTION repair.reject_decided_proposal_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status IN ('approved', 'declined', 'changes_requested', 'superseded') THEN
        -- The narrow, deliberate exception. Compared field by field rather than by
        -- trusting the caller to touch only this one.
        IF NEW.status IS DISTINCT FROM OLD.status
           AND NOT (OLD.status <> 'superseded' AND NEW.status = 'superseded') THEN
            RAISE EXCEPTION
                'proposal % has been decided and cannot be changed; Â§424 requires a new VERSION for a material change', OLD.id
                USING ERRCODE = 'restrict_violation';
        END IF;

        IF NEW.quotation_id      IS DISTINCT FROM OLD.quotation_id
           OR NEW.job_card_id    IS DISTINCT FROM OLD.job_card_id
           OR NEW.version_no     IS DISTINCT FROM OLD.version_no
           OR NEW.decision       IS DISTINCT FROM OLD.decision
           OR NEW.approved_option IS DISTINCT FROM OLD.approved_option
           OR NEW.decided_at     IS DISTINCT FROM OLD.decided_at
           OR NEW.decided_by_name IS DISTINCT FROM OLD.decided_by_name
           OR NEW.decision_channel IS DISTINCT FROM OLD.decision_channel
           OR NEW.decision_note  IS DISTINCT FROM OLD.decision_note
           OR NEW.expected_result IS DISTINCT FROM OLD.expected_result
           OR NEW.risk_and_limitations IS DISTINCT FROM OLD.risk_and_limitations
           OR NEW.uncertainties  IS DISTINCT FROM OLD.uncertainties
           OR NEW.presentation_note IS DISTINCT FROM OLD.presentation_note THEN
            RAISE EXCEPTION
                'proposal % has been decided; what the customer agreed to cannot be edited (Â§424)', OLD.id
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
    END IF;

    -- An ISSUED proposal is in front of the customer. Its content freezes there too
    -- â€” a proposal that changes while somebody is reading it is a different offer
    -- from the one they will say yes to.
    IF OLD.status = 'issued' THEN
        IF NEW.expected_result IS DISTINCT FROM OLD.expected_result
           OR NEW.risk_and_limitations IS DISTINCT FROM OLD.risk_and_limitations
           OR NEW.uncertainties IS DISTINCT FROM OLD.uncertainties
           OR NEW.presentation_note IS DISTINCT FROM OLD.presentation_note
           OR NEW.quotation_id IS DISTINCT FROM OLD.quotation_id THEN
            RAISE EXCEPTION
                'proposal % has been issued to the customer and its content cannot be changed; issue a new version', OLD.id
                USING ERRCODE = 'restrict_violation';
        END IF;
        IF NEW.status = 'draft' THEN
            RAISE EXCEPTION
                'proposal % cannot return to draft once issued', OLD.id
                USING ERRCODE = 'restrict_violation';
        END IF;
    END IF;

    -- The identity columns are write-once at every status â€” 015's lesson, applied
    -- in the migration that creates the table rather than in a fix-up the next day.
    IF NEW.job_card_id IS DISTINCT FROM OLD.job_card_id
       OR NEW.version_no IS DISTINCT FROM OLD.version_no
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
        RAISE EXCEPTION
            'proposal % cannot change its identity columns', OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proposals_immutable ON repair.repair_proposals;
CREATE TRIGGER trg_proposals_immutable
    BEFORE UPDATE ON repair.repair_proposals
    FOR EACH ROW
    EXECUTE FUNCTION repair.reject_decided_proposal_change();

-- â”€â”€ a proposal may only present an APPROVED quotation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
--
-- The rule a foreign key cannot express. Presenting a DRAFT price to a customer is
-- showing them a figure the workshop has not agreed internally (Â§5), and presenting
-- a REJECTED one is showing a price a manager refused. Enforced in the service too;
-- this is the layer that holds for any future caller.
CREATE OR REPLACE FUNCTION repair.assert_proposal_quotation_approved()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_status text;
BEGIN
    SELECT status INTO v_status
      FROM repair.quotations
     WHERE id = NEW.quotation_id AND tenant_id = NEW.tenant_id;

    IF v_status IS DISTINCT FROM 'approved' THEN
        RAISE EXCEPTION
            'proposal % cannot present quotation %: it is % rather than approved',

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path infrastructure/migrations/017_repair_proposals.sql | Select-Object -Skip 320 -First 180' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"INSERT INTO repair\\.repair_proposals|UPDATE repair\\.repair_proposals|status = 'issued'|superseded_by = new_id|created_by, updated_by|issued_by, issued_at, created_by\" scripts/seed-customer-proposal-fixture.sh" in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "recordCustomerDecision|status !== '"'issued'|superseded_by|SELECT p\\.id, p\\.status\" apps/api/src/repair/proposal.service.ts" in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "decidable|superseded_by|headerRow|customer may decide|superseded" apps/api/src/repair/proposal.spec.ts' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 1050ms:
116:                AND status = 'issued' AND superseded_by IS NULL) THEN
137:  INSERT INTO repair.repair_proposals (
141:    issued_by, issued_at, created_by
155:    UPDATE repair.repair_proposals
156:       SET superseded_by = new_id

 succeeded in 1053ms:
163: *     writable field left on it is `superseded_by`, because recording the
306:              SET superseded_by = $1, status = 'superseded', updated_at = now(), updated_by = $2
477:        `SELECT p.id, p.status, p.version_no, j.job_number
497:      if (row.status !== 'issued') {
570:  async recordCustomerDecision(
606:        `SELECT p.id, p.status, p.version_no, j.job_number, c.display_name
627:      if (row.status !== 'issued') {
702:              p.decided_by_name, p.decision_channel, p.decision_note, p.superseded_by,
870:        supersededBy: row.superseded_by,
969:          row.superseded_by === null &&
1012:      `SELECT p.id, p.status, p.version_no, j.job_number
1151:  superseded_by: string | null;

 succeeded in 1051ms:
52:const headerRow = (over: Record<string, unknown> = {}) => ({
97:  superseded_by: null,
159:  [Q.header, over.header ?? [headerRow()]],
252:  it('creates version n+1 and marks the one it replaces superseded', async () => {
260:      ...readHandlers({ header: [headerRow({ version_no: 3 })] }),
265:    const supersede = queries.find((q) => Q.update.test(q.text) && /superseded_by/.test(q.text));
288:        header: [headerRow({ trading_name: null, legal_name: null, org_address: null })],
308:        header: [headerRow({ discount_amount: '5000.00', tax_rate_percent: '15.000' })],
328:          headerRow({ status: 'approved', decision: 'approved', approved_option: 'recommended' }),
573:   * WHY THIS BLOCK EXISTS. `decidable` was left computing from the STAFF role
576:   * form only on `decidable`. The self-service approval was completely inert
584:    readHandlers({ header: [headerRow({ status: 'issued', issued_at: new Date('2026-08-01T00:00:00Z'), ...over })] });
586:  it('🔴 a customer may decide an ISSUED proposal', async () => {
589:    expect(p.decidable, 'the approval form renders on this flag and on nothing else').toBe(true);
595:    expect(p.decidable).toBe(true);
605:    expect(p.decidable).toBe(false);
609:    const { db } = fakeDb(readHandlers({ header: [headerRow({ status: 'draft' })] }));
611:    expect(p.decidable).toBe(false);
617:    const { db } = fakeDb(readHandlers({ header: [headerRow({ status: 'approved' })] }));
619:    expect(p.decidable).toBe(false);
624:    // `decidable` — the same oversight in the other direction.
625:    const { db } = fakeDb(readHandlers({ header: [headerRow({ status: 'draft' })] }));
723:    expect(sql).toMatch(/NEW\.status = 'superseded'/);
726:  it('withholds DELETE entirely — a proposal is superseded, never erased', () => {

 succeeded in 1363ms:
DECLARE
    v_status text;
BEGIN
    SELECT status INTO v_status
      FROM repair.quotations
     WHERE id = NEW.quotation_id AND tenant_id = NEW.tenant_id;

    IF v_status IS DISTINCT FROM 'approved' THEN
        RAISE EXCEPTION
            'proposal % cannot present quotation %: it is % rather than approved',
            NEW.id, NEW.quotation_id, COALESCE(v_status, 'missing')
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proposal_quotation_approved ON repair.repair_proposals;
CREATE TRIGGER trg_proposal_quotation_approved
    BEFORE INSERT ON repair.repair_proposals
    FOR EACH ROW
    EXECUTE FUNCTION repair.assert_proposal_quotation_approved();

-- â”€â”€ row-level security â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- ENABLE *and* FORCE. Enable alone exempts the table owner, which is the role the
-- app connects as â€” isolation present and inert.

ALTER TABLE repair.repair_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair.repair_proposals FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON repair.repair_proposals;
CREATE POLICY tenant_isolation ON repair.repair_proposals
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

-- â”€â”€ grants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
--
-- DELETE withheld entirely, and unlike its siblings there is no child table to
-- grant it on. A proposal is an OFFER MADE TO A CUSTOMER; even an unissued draft is
-- a fact about what the workshop was about to say. Â§424's answer to a wrong
-- proposal is a new version, not an erasure â€” and a version number that silently
-- disappears is how version 3 comes to follow version 1.
GRANT SELECT, INSERT, UPDATE ON repair.repair_proposals TO autoworkshop_app;
REVOKE DELETE ON repair.repair_proposals FROM autoworkshop_app;

COMMIT;

codex
I found one product-side authorization gap rather than just verifier fragility: `decidable` was tightened, but the write endpoints still only check `status`. I’m checking whether tests cover that direct-post path before I finalize severity.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path apps/api/src/repair/proposal.spec.ts | Select-Object -Skip 560 -First 80' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"recordDecision\\(|recordCustomerDecision\\(|superseded_by\" apps/api/src/repair/proposal.spec.ts" in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"superseded_by IS NULL|status='superseded'|status = 'superseded'|superseded_by = new_id|quotation.*approved|status = 'approved'\" scripts/seed-customer-proposal-fixture.sh apps/api/src/repair/proposal.service.ts apps/api/src/repair/proposal.spec.ts" in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path apps/api/src/repair/proposal.spec.ts | Select-Object -Skip 420 -First 130' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 866ms:
97:  superseded_by: null,
265:    const supersede = queries.find((q) => Q.update.test(q.text) && /superseded_by/.test(q.text));
350:      service().recordDecision(ctx(), PROPOSAL_ID, {
355:      service().recordDecision(ctx(), PROPOSAL_ID, {
365:      new ProposalService(fakeDb([issued]).db, fakeAudit()).recordDecision(ctx(), PROPOSAL_ID, {
373:      new ProposalService(fakeDb([issued]).db, fakeAudit()).recordDecision(ctx(), PROPOSAL_ID, {
382:    await new ProposalService(db, audit as never).recordDecision(
408:      new ProposalService(fakeDb([draft]).db, fakeAudit()).recordDecision(ctx(), PROPOSAL_ID, {
415:      new ProposalService(fakeDb([done]).db, fakeAudit()).recordDecision(ctx(), PROPOSAL_ID, {
440:        new ProposalService(fakeDb([mine]).db, fakeAudit()).recordCustomerDecision(
454:    await new ProposalService(db, fakeAudit()).recordCustomerDecision(
467:    await new ProposalService(db, fakeAudit()).recordCustomerDecision(
490:    await new ProposalService(db, audit as never).recordCustomerDecision(
504:      new ProposalService(fakeDb([mine]).db, fakeAudit()).recordCustomerDecision(
512:      new ProposalService(fakeDb([mine]).db, fakeAudit()).recordCustomerDecision(
522:      new ProposalService(fakeDb([[Q.decisionLookup, []]]).db, fakeAudit()).recordCustomerDecision(
534:      new ProposalService(fakeDb([draft]).db, fakeAudit()).recordCustomerDecision(
544:      new ProposalService(fakeDb([answered]).db, fakeAudit()).recordCustomerDecision(

 succeeded in 902ms:
apps/api/src/repair/proposal.spec.ts:723:    expect(sql).toMatch(/NEW\.status = 'superseded'/);
scripts/seed-customer-proposal-fixture.sh:107:  -- ⚠️ `superseded_by IS NULL` TOO — the same definition of "answerable" the
scripts/seed-customer-proposal-fixture.sh:116:                AND status = 'issued' AND superseded_by IS NULL) THEN
scripts/seed-customer-proposal-fixture.sh:156:       SET superseded_by = new_id
apps/api/src/repair/proposal.service.ts:306:              SET superseded_by = $1, status = 'superseded', updated_at = now(), updated_by = $2

 succeeded in 1096ms:
  it('does NOT narrow a staff viewer by customer', async () => {
    // The predicate must bind to the CUSTOMER role only. Applied to staff it
    // would empty every workshop screen that reads proposals.
    const { db, queries } = fakeDb(readHandlers());
    await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'workshop_owner' }));
    expect(queries.find((q) => Q.header.test(q.text))?.values?.[5]).toBeNull();
  });
});


describe('the affordance flags â€” what the VIEWER is told they may do', () => {
  /**
   * WHY THIS BLOCK EXISTS. `decidable` was left computing from the STAFF role
   * set when the customer role was added to CAN_READ_PROPOSAL, so it evaluated
   * false for every customer â€” and the customer screen renders its approval
   * form only on `decidable`. The self-service approval was completely inert
   * while the service behind it worked and its ten tests passed.
   *
   * Nothing threw and nothing logged. Every existing test drove the SERVICE;
   * none asked what the viewer had been TOLD they could do. That gap is the bug,
   * so these assert the flags directly.
   */
  const issuedHeader = (over: Record<string, unknown> = {}) =>
    readHandlers({ header: [headerRow({ status: 'issued', issued_at: new Date('2026-08-01T00:00:00Z'), ...over })] });

  it('ðŸ”´ a customer may decide an ISSUED proposal', async () => {
    const { db } = fakeDb(issuedHeader());
    const p = only(await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'customer', userId: 'cust-1' })));
    expect(p.decidable, 'the approval form renders on this flag and on nothing else').toBe(true);
  });

  it('staff may still decide one â€” the customer did not displace them', async () => {
    const { db } = fakeDb(issuedHeader());
    const p = only(await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'reception_staff' })));
    expect(p.decidable).toBe(true);
  });

  it('a role that may read but not answer is NOT offered the choice', async () => {
    // A technician reads the approval to confirm it before starting work; they
    // do not make it. Offering them the control would be a button that 403s.
    const { db } = fakeDb(issuedHeader());
    const p = only(
      await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'technician', userId: 't1' })),
    );
    expect(p.decidable).toBe(false);
  });

  it('nobody may decide a DRAFT â€” it has not been sent yet', async () => {
    const { db } = fakeDb(readHandlers({ header: [headerRow({ status: 'draft' })] }));
    const p = only(await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'customer', userId: 'c1' })));
    expect(p.decidable).toBe(false);
  });

  it('nobody may decide one that was already answered', async () => {
    // Otherwise the customer is offered a second answer to a settled document
    // and the API refuses it â€” a control that fails, which reads as a bug.
    const { db } = fakeDb(readHandlers({ header: [headerRow({ status: 'approved' })] }));
    const p = only(await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'customer', userId: 'c1' })));
    expect(p.decidable).toBe(false);
  });

  it('a customer is never offered the EDIT or ISSUE controls', async () => {
    // Those belong to the workshop. `editable`/`issuable` must not widen with
    // `decidable` â€” the same oversight in the other direction.
    const { db } = fakeDb(readHandlers({ header: [headerRow({ status: 'draft' })] }));
    const p = only(await new ProposalService(db, fakeAudit()).list(ctx({ activeRole: 'customer', userId: 'c1' })));
    expect(p.editable).toBe(false);
    expect(p.issuable).toBe(false);
  });
});

describe('Â§424 â€” immutability', () => {
  it('refuses to edit an issued or decided proposal, naming the rule', async () => {
    const issuedRow = [Q.draft, [{ id: PROPOSAL_ID, status: 'issued', version_no: 1, job_number: 'JC-1' }]] as [RegExp, unknown[]];
    await expect(
      new ProposalService(fakeDb([issuedRow]).db, fakeAudit()).recordNarrative(ctx(), PROPOSAL_ID, {
        expectedResult: 'changed',
      }),
    ).rejects.toThrow(/with the customer and its content is frozen/);


 succeeded in 1129ms:

// â”€â”€ Â§424 in the service â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


describe('recordCustomerDecision â€” the customer answers for themselves', () => {
  // The lookup this route uses is the decision lookup PLUS the customer's own
  // name, and it is constrained to a card that customer owns.
  const mine = [
    Q.decisionLookup,
    [{ id: PROPOSAL_ID, status: 'issued', version_no: 1, job_number: 'JC-1', display_name: 'Kwame Mensah' }],
  ] as [RegExp, unknown[]];

  const customerCtx = () => ctx({ activeRole: 'customer', userId: 'cust-1' });

  it('ðŸ”´ refuses any role that is not the customer', async () => {
    // Staff have their own route, where the two attributions stay separate.
    // Letting reception in here would file THEIR name as the decider.
    for (const role of ['reception_staff', 'workshop_owner', 'technician']) {
      await expect(
        new ProposalService(fakeDb([mine]).db, fakeAudit()).recordCustomerDecision(
          ctx({ activeRole: role, userId: 'staff-1' }),
          PROPOSAL_ID,
          { decision: 'approved', approvedOption: 'recommended' },
        ),
      ).rejects.toThrow(/may not decide as the customer/);
    }
  });

  it('ðŸ”´ scopes the lookup to the calling customer, not just to the tenant', async () => {
    // THE CONTROL. The role check says a customer may use this route; THIS is
    // what stops them approving somebody else's repair. Position 4 is
    // `c.user_id`, and it must be the session's user â€” never a request value.
    const { db, queries } = fakeDb([mine, [Q.update, []], ...readHandlers()]);
    await new ProposalService(db, fakeAudit()).recordCustomerDecision(
      customerCtx(), PROPOSAL_ID, { decision: 'approved', approvedOption: 'recommended' },
    );
    const lookup = queries.find((q) => Q.decisionLookup.test(q.text));
    expect(lookup?.values?.[3]).toBe('cust-1');
    expect(lookup?.text).toMatch(/c\.user_id = \$4/);
  });

  it('ðŸ”´ derives the decider and the channel â€” a request cannot set either', async () => {
    // The whole reason this is a separate route. `decidedByName` comes from the
    // CUSTOMER RECORD and the channel from the route, so a customer cannot
    // approve under another name or file a portal approval as a phone call.
    const { db, queries } = fakeDb([mine, [Q.update, []], ...readHandlers()]);
    await new ProposalService(db, fakeAudit()).recordCustomerDecision(
      customerCtx(),
      PROPOSAL_ID,
      // Deliberately smuggling both fields in. The type does not admit them and
      // Zod strips them; this asserts the SERVICE ignores them even so.
      {
        decision: 'approved',
        approvedOption: 'recommended',
        decidedByName: 'Somebody Else',
        decisionChannel: 'telephone',
      } as never,
    );
    const update = queries.find((q) => Q.update.test(q.text));
    expect(update?.values?.[2]).toBe('Kwame Mensah');
    expect(update?.text).toMatch(/decision_channel = 'customer_portal'/);
    // And the customer is BOTH decider and recorder here â€” one person, which is
    // the strongest form of the record.
    expect(update?.values?.[4]).toBe('cust-1');
  });

  it('marks the audit entry as self-service so a dispute can tell the two apart', async () => {
    const audit = spyAudit();
    const { db } = fakeDb([mine, [Q.update, []], ...readHandlers()]);
    await new ProposalService(db, audit as never).recordCustomerDecision(
      customerCtx(), PROPOSAL_ID, { decision: 'approved', approvedOption: 'recommended' },
    );
    expect(audit.write.mock.calls[0]?.[2]?.detail).toMatchObject({
      decision: 'approved',
      channel: 'customer_portal',
      selfService: true,
    });
  });

  it('still requires a reason for anything that is not an approval', async () => {
    // Not relaxed just because the customer typed it themselves â€” a refusal with
    // no reason leaves the workshop nothing to act on either way.
    await expect(
      new ProposalService(fakeDb([mine]).db, fakeAudit()).recordCustomerDecision(
        customerCtx(), PROPOSAL_ID, { decision: 'declined' },
      ),
    ).rejects.toThrow(/must record why/);
  });

  it('still requires an option when approving', async () => {
    await expect(
      new ProposalService(fakeDb([mine]).db, fakeAudit()).recordCustomerDecision(
        customerCtx(), PROPOSAL_ID, { decision: 'approved' },
      ),
    ).rejects.toThrow(/approvedOption/);
  });

  it('404s rather than 403s when the proposal is not theirs', async () => {
    // The non-oracle rule: a customer must not be able to learn that somebody
    // else's proposal exists by the shape of the refusal.
    await expect(
      new ProposalService(fakeDb([[Q.decisionLookup, []]]).db, fakeAudit()).recordCustomerDecision(
        customerCtx(), PROPOSAL_ID, { decision: 'approved', approvedOption: 'recommended' },
      ),
    ).rejects.toThrow(/proposal not found/);
  });

  it('refuses to answer a proposal that was never sent, or was already answered', async () => {
    const draft = [
      Q.decisionLookup,
      [{ id: PROPOSAL_ID, status: 'draft', version_no: 1, job_number: 'JC-1', display_name: 'K' }],
    ] as [RegExp, unknown[]];
    await expect(
      new ProposalService(fakeDb([draft]).db, fakeAudit()).recordCustomerDecision(
        customerCtx(), PROPOSAL_ID, { decision: 'approved', approvedOption: 'recommended' },
      ),
    ).rejects.toThrow(/not been sent to you yet/);

    const answered = [
      Q.decisionLookup,
      [{ id: PROPOSAL_ID, status: 'approved', version_no: 2, job_number: 'JC-1', display_name: 'K' }],
    ] as [RegExp, unknown[]];
    await expect(
      new ProposalService(fakeDb([answered]).db, fakeAudit()).recordCustomerDecision(
        customerCtx(), PROPOSAL_ID, { decision: 'declined', note: 'changed my mind' },
      ),
    ).rejects.toThrow(/already answered version 2/);
  });
});


exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"if \\(offersAnswer\\)|selectOption\\('#decision'|selectOption\\('#approvedOption'|getByRole\\('button'|approved.*records|Nothing is waiting on you|offersAnswer|nothingWaiting\" apps/e2e/verify/verify-customer-workflow.mjs" in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"EXISTS \\(SELECT 1 FROM repair\\.quotations|SELECT id INTO quote|FROM repair\\.quotations|ORDER BY attempt_no DESC|INSERT INTO repair\\.repair_proposals|SET superseded_by = new_id|SET stage = 'awaiting_customer_approval'\" scripts/seed-customer-proposal-fixture.sh" in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"await page.goto\\("'`'"\\"'$'"\\{CUSTOMER\\}/home/dashboard|Sign in|Keycloak|waitForURL|signedIn|Sign out|Not signed in\" apps/e2e/verify/verify-customer-workflow.mjs" in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "customer_web|CUSTOMER_WEB|customer:3000|APPS=.*customer|start-local|start-session|node verify/verify-customer" scripts apps/e2e README.md' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 999ms:
73:     AND EXISTS (SELECT 1 FROM repair.quotations q WHERE q.job_card_id = j.id)
88:  SELECT id INTO quote
89:    FROM repair.quotations
91:   ORDER BY attempt_no DESC
118:       SET stage = 'awaiting_customer_approval', stage_changed_at = now()
137:  INSERT INTO repair.repair_proposals (
156:       SET superseded_by = new_id
163:     SET stage = 'awaiting_customer_approval', stage_changed_at = now()

 succeeded in 1068ms:
102:const provider = page.getByRole('button', { name: /Keycloak/i });
175:const offersAnswer = /Approve this repair|Send my answer/i.test(proposals);
176:const nothingWaiting = /Nothing is waiting on you/i.test(proposals);
179:  offersAnswer || nothingWaiting,
182:if (offersAnswer) {
201:if (offersAnswer) {
202:  await page.selectOption('#decision', 'approved').catch(() => {});
203:  await page.selectOption('#approvedOption', 'recommended').catch(() => {});
204:  await page.getByRole('button', { name: /Approve this repair/i }).click({ noWaitAfter: true });
228:    /Nothing is waiting on you/i.test(reread) || !/Approve this repair/i.test(reread),

 succeeded in 1068ms:
31: * DEV ONLY — localhost/LAN, real Keycloak sign-in.
101:await page.getByRole('link', { name: 'Sign in' }).first().click();
102:const provider = page.getByRole('button', { name: /Keycloak/i });
105:await page.waitForURL(/openid-connect\/auth/, { timeout: 90000 });
109:await page.waitForURL((u) => !/openid-connect/.test(u.toString()), { timeout: 90000 });
117:const signedIn = !/Not signed in/i.test(shell) && /Sign out/i.test(shell);
118:check('MEASUREMENT VALID: signed in', signedIn, 'every route answers 200 signed out too');
119:if (!signedIn) {

 succeeded in 1072ms:
apps/e2e\playwright.identity.config.ts:45:    baseURL: process.env['CUSTOMER_WEB_URL'] ?? 'http://localhost:3000',
scripts\start-session.sh:5:#   bash scripts/start-session.sh
apps/e2e\tests\sign-out-revocation.spec.ts:33:const CUSTOMER_WEB = process.env['CUSTOMER_WEB_URL'] ?? 'http://localhost:3000';
apps/e2e\tests\sign-out-revocation.spec.ts:53:    await page.goto(`${CUSTOMER_WEB}/home/dashboard`);
apps/e2e\tests\sign-out-revocation.spec.ts:62:    await page.goto(`${CUSTOMER_WEB}/home/dashboard`);
apps/e2e\tests\sign-out-revocation.spec.ts:77:    await page.waitForURL(new RegExp(CUSTOMER_WEB.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), {
apps/e2e\tests\sign-out-revocation.spec.ts:86:    const session = await (await page.request.get(`${CUSTOMER_WEB}/api/auth/session`)).json();
apps/e2e\tests\sign-out-revocation.spec.ts:93:    const after = await (await page.request.get(`${CUSTOMER_WEB}/api/auth/session`)).json();
scripts\start-local.sh:40:#   bash scripts/start-local.sh                        # workshop only
scripts\start-local.sh:41:#   APPS="workshop:3001 supplier:3002 admin:3006" bash scripts/start-local.sh
scripts\start-local.sh:42:#   MOBILE_HOST=192.168.0.124 bash scripts/start-local.sh
scripts\start-local.sh:73:  echo "REFUSING: start-local.sh only drives the local dev container." >&2
scripts\start-local.sh:102:  echo "  MOBILE_HOST=192.168.0.10 bash scripts/start-local.sh" >&2
scripts\start-local.sh:113:  echo "  Pass your wifi address: MOBILE_HOST=192.168.0.10 bash scripts/start-local.sh" >&2
apps/e2e\verify\capture-session.mjs:50:const APP = arg('url', process.env['CUSTOMER_WEB_URL'] ?? 'http://localhost:3000');
scripts\seed-dev-identity.sh:47:# multi-identity seed command — `start-session.sh` §5 and section 1 of
apps/e2e\verify\verify-customer-workflow.mjs:29: *   node verify/verify-customer-workflow.mjs
apps/e2e\verify\verify-customer-workflow.mjs:35:const CUSTOMER = process.env['CUSTOMER_WEB_URL'] ?? 'http://localhost:3000';
apps/e2e\verify\verify-vin-funnel.mjs:41:const BASE = process.env['CUSTOMER_WEB_URL'] ?? 'http://192.168.0.124:3005';
apps/e2e\verify\verify-top-bar-identity.mjs:35: * `MissingCSRF` because `AUTH_URL` is the LAN host (start-local.sh).
scripts\guardrails\check-page-gates.sh:63:ROUTE_GATED_APPS=("workshop-web:workshop" "customer-web:customer")

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path packages/next-shell/src/WorkspaceShell.tsx | Select-Object -Skip 1 -First 160' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path packages/next-shell/src/viewer.ts' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "export async function currentViewer|function currentViewer|viewerHasSession|async function viewerHasSession|Not signed in|Sign out" packages/next-shell/src -g "*.ts" -g "*.tsx"' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 920ms:
packages/next-shell/src\AccountControl.tsx:42:   * Whether a SESSION exists — the only input that decides Sign in vs Sign out.
packages/next-shell/src\AccountControl.tsx:65:   * Sign out AND land on the sign-in page.
packages/next-shell/src\AccountControl.tsx:67:   * Offered beside Sign out because they are different intentions with different
packages/next-shell/src\AccountControl.tsx:115:          // "Sign out" when `/me` is unreachable rather than inventing a name.
packages/next-shell/src\AccountControl.tsx:116:          aria-label={userLabel ? `Sign out of ${userLabel}` : 'Sign out'}
packages/next-shell/src\AccountControl.tsx:123:          {submitting ? 'Signing out…' : 'Sign out'}
packages/next-shell/src\AccountControl.tsx:152:                : 'Sign out and sign in as somebody else'
packages/next-shell/src\ApiFailure.tsx:5:import { viewerHasSession } from './viewer';
packages/next-shell/src\ApiFailure.tsx:47:  const signedIn = await viewerHasSession(workspaceId);
packages/next-shell/src\WorkspaceShell.tsx:100:   * `viewerHasSession()`, NOT inferred from `userLabel` — see AccountControl.
packages/next-shell/src\WorkspaceShell.tsx:196:      // "Not signed in | —", which is true and useless to a stranger looking
packages/next-shell/src\viewer.ts:130: * degrades to null — but treating that as "signed out" removed the Sign out
packages/next-shell/src\viewer.ts:136:export async function viewerHasSession(workspaceId: WorkspaceId | string): Promise<boolean> {
packages/next-shell/src\viewer.ts:141:export async function currentViewer(
packages/next-shell/src\registration.ts:35:   * and rendered "Not signed in" beside a working "Sign out", permanently, to
packages/next-shell/src\viewer.test.ts:325: * control started deciding Sign in vs Sign out from it.
packages/next-shell/src\viewer.test.ts:340:    expect(viewerLabels(null).organizationLabel).toBe('Not signed in');
packages/next-shell/src\viewer-contract.ts:116:   * and offered Sign out to an anonymous visitor. A display label must never
packages/next-shell/src\viewer-contract.ts:144: * The signed-out labels say "Not signed in" rather than falling back to the old
packages/next-shell/src\viewer-contract.ts:153:      organizationLabel: 'Not signed in',
packages/next-shell/src\index.ts:25:export { viewerHasSession } from './viewer';

 succeeded in 1260ms:

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppShell, ThemeProvider, type TopNavAction } from '@autoworkshop/ui';
import {
  getWorkspace,
  workspaceForRole,
  type PermissionKey,
  type RoleId,
} from '@autoworkshop/navigation';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { AccountControl } from './AccountControl';

/**
 * The Next.js binding for the shared application shell.
 *
 * WHY THIS PACKAGE EXISTS. `@autoworkshop/ui` is deliberately framework-free â€”
 * it takes `renderLink` as a prop so Storybook and the Playwright journeys can
 * render the shell without a Next runtime. But all seven apps DO run on Next,
 * and each of them needs the identical `next/link` + `usePathname` adapter.
 * Copying that adapter into seven `app/` folders is exactly the duplication the
 * reusability rule forbids (root CLAUDE.md Â§0.3: "Copy-pasting an agent from
 * one app into another" â€” the same reasoning applies to components). One
 * adapter, imported seven times.
 *
 * An app's layout therefore reduces to:
 *
 *   <WorkspaceShell workspaceId="workshop">{children}</WorkspaceShell>
 */

export interface WorkspaceShellProps {
  /** Which workspace's navigation to render, e.g. `workshop`. */
  workspaceId: string;
  children: React.ReactNode;

  /**
   * The viewer's permission grants.
   *
   * âš ï¸ Phase 2 supplies these from VALIDATED KEYCLOAK CLAIMS. They must never
   * be derived from anything the client sends, and hiding a nav item is not
   * what protects the page â€” the route guard, the API and RLS deny
   * independently (CLAUDE.md Â§5, Â§8).
   */
  grants?: readonly PermissionKey[];

  /**
   * The viewer's role, which selects the navigation tree (`07.txt` pt2 Â§46-Â§49).
   *
   * PASSED IN, not resolved here, and that is forced rather than preferred:
   * this is a CLIENT component, and since T-0005 the role comes from a Keycloak
   * session read on the server. A client component cannot await it.
   *
   * The single-decision-point rule still holds â€” `viewerRole()` remains the only
   * place the role is decided, it is simply called by the async layout that
   * renders this component and by `renderModulePage` for the same request.
   * React's `cache()` makes those the same resolution, so the menu and the
   * router cannot end up on different trees. Threading the value is not a
   * second source of truth; recomputing it here would be.
   *
   * Undefined means "no role" â€” an unauthenticated viewer, or a role with no
   * tree of its own â€” and yields the workspace default tree.
   */
  role?: RoleId;

  organizationLabel?: string;
  branchLabel?: string;
  userLabel?: string;
  /** Where the wordmark links. Omit and it stays plain text. */
  brandHref?: string;
  /**
   * The role the viewer is acting as, humanised â€” supplied by `viewerLabels()`
   * along with the other three, so a layout spreading `{...viewerLabels(viewer)}`
   * gets it with no extra wiring.
   */
  roleLabel?: string;
  /**
   * The role SWITCHER, for a viewer holding more than one role. Supplied as a
   * node because it needs a server action; when it is absent (or renders null,
   * which is every single-role viewer) the chip above stands in.
   */
  roleControl?: React.ReactNode;
  counters?: Record<string, number>;
  warnings?: Record<string, number>;
  topNavActions?: TopNavAction[];
  /** Â§5 organization switcher (T-0016), rendered in the top bar. */
  organizationSwitcher?: React.ReactNode;
  /**
   * Sign-out server action, supplied by the app (T-0005 finding 5). It is
   * per-app because the workspace decides which Keycloak client the refresh
   * token is revoked at; the sequence itself lives once in `@autoworkshop/auth`.
   */
  signOutAction?: () => Promise<void>;
  switchUserAction?: () => Promise<void>;
  /** Where a signed-out viewer goes to sign in. */
  signInHref?: string;
  /**
   * Whether a session cookie exists. Supplied by the layout from
   * `viewerHasSession()`, NOT inferred from `userLabel` â€” see AccountControl.
   */
  signedIn?: boolean;
  /**
   * Routes that are PUBLIC, and on which a SIGNED-OUT visitor gets no side
   * navigation and no counters.
   *
   * ðŸ”´ THE DEFECT THIS CLOSES. The apex landing â€” the product's shop front â€”
   * showed anonymous visitors the entire workshop menu (Workshop Floor, Finance
   * and Warranty, Reports) with badges reading 10, 12, 5 and 2. Not a leak:
   * every route behind those items is gated server-side and the API and RLS
   * deny independently. But nothing there was reachable and none of the numbers
   * were real, so the first thing a stranger saw was a menu of doors that do
   * not open, counting work that does not exist.
   *
   * âš ï¸ SIGNED-OUT ONLY, DELIBERATELY. A signed-in visitor keeps the shell on
   * the same page, because the landing is reachable from their wordmark and
   * taking their navigation away would leave them somewhere with no way back â€”
   * a defect this session already fixed once.
   *
   * âš ï¸ DECIDED HERE RATHER THAN IN THE LAYOUT because a server layout cannot
   * read its own pathname. The previous attempt stamped it via middleware and
   * crashed the edge runtime with `Cannot redefine property:
   * __import_unsupported` â€” green typecheck, green lint, green build. This
   * component is already a client component and already calls `usePathname`.
   */
  publicPaths?: readonly string[];
  drawer?: React.ReactNode;
}

export function WorkspaceShell({
  workspaceId,
  children,
  grants = [],
  role,
  organizationLabel,
  branchLabel,
  userLabel,
  brandHref,
  roleLabel,
  roleControl,
  counters,
  warnings,
  topNavActions,
  organizationSwitcher,
  signOutAction,
  switchUserAction,
  signInHref,
  signedIn,
  publicPaths,
  drawer,
}: WorkspaceShellProps) {
  const pathname = usePathname() || '/';
  // Public page + nobody signed in = the shop front, not the application.
  const bare = !signedIn && (publicPaths ?? []).includes(pathname);

  const base = getWorkspace(workspaceId);
  // T-0027: the role selects the tree (`07.txt` pt2 Â§46-Â§49). The value comes
  // from the caller because this is a client component â€” see the `role` prop.
  const workspace = base ? workspaceForRole(base, role) : undefined;

  // A workspace with no navigation is a configuration error, and it must LOOK

 succeeded in 1286ms:
import { cache } from 'react';
import type { PermissionKey, RoleId, WorkspaceId } from '@autoworkshop/navigation';
import { apiBaseUrl, workspaceAuth } from '@autoworkshop/auth';
import {
  grantsFor,
  holdsRoleInActiveOrganization,
  navRoleFor,
  NO_GRANTS,
  type ViewerDescription,
} from './viewer-contract';
import { activeOrganizationId, rawOrganizationHeader } from './active-organization';
import { activeRoleName, rawRoleHeader } from './active-role';

/**
 * WHO THE VIEWER IS â€” resolved from a validated Keycloak session (T-0005).
 *
 * This file is what the previous demo implementation promised would replace it:
 * "WHEN PHASE 2 LANDS, this is the one function to replace. Its body becomes a
 * read of the validated Keycloak claims and the viewer's membership records."
 * It now is. `viewerGrants()` no longer returns a fixed array to everybody, and
 * `viewerRole()` no longer hardcodes `technician` for the workshop app.
 *
 * SERVER ONLY. The access token is read from the encrypted session cookie and
 * used to call the API from the Next server. The browser never receives it, and
 * never receives the raw `/me` response either â€” only the shell rendered from
 * it. `1.txt` Â§9: the tenant identifier must never come from the client, and
 * here nothing does: the API derives tenant, organisation, branch, role and
 * permissions from the token subject plus membership records.
 *
 * STILL NOT A SECURITY CONTROL. These values decide which doors the UI admits
 * exist. Enforcement is the API's `TenantGuard` and Postgres RLS, which deny
 * independently of anything decided here. CLAUDE.md Â§8: "Hidden â‰  secure."
 */

/**
 * The `/me` call, deduplicated per request.
 *
 * `cache()` is React's per-request memo, not a time-based cache: a layout, a
 * page and a catch-all route all asking who the viewer is produce ONE HTTP call
 * per render, and the next request starts clean. Without it every navigation
 * would make three identical round trips to the API, and â€” worse â€” they could
 * disagree if a membership changed mid-render, which is precisely the nav/router
 * split that has already shipped once here.
 */
const fetchViewer = cache(async (workspaceId: string): Promise<ViewerDescription | null> => {
  const accessToken = await workspaceAuth(workspaceId).getAccessToken();
  // No session, or a session whose access token has expired without middleware
  // renewing it. Either way the viewer is unauthenticated for this render.
  if (!accessToken) return null;

  // Two attempts: with the stored SELECTION, then WITHOUT it.
  //
  // âš ï¸ THE RETRY IS A LOCKOUT FIX, not belt and braces (Codex, HIGH). The API
  // THROWS when a requested organization is not among the viewer's active
  // memberships â€” correctly, since that is an authorization probe. But a
  // selection can go stale through no fault of the user: they pick org A, their
  // membership in A is later revoked, and they still belong to B. Every request
  // then carries a now-invalid id, `/me` fails, the shell cannot render, and the
  // switcher they would have used to choose B never appears. Retrying without
  // the header lets them back in on the API's own default. The role selection
  // can go stale the same way â€” a role revoked mid-session â€” so it is dropped
  // by the same retry.
  const attempt = async (withSelection: boolean): Promise<Response> =>
    fetch(`${apiBaseUrl()}/api/v1/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        // MUST carry the same organization header the pages send (T-0016).
        // Without it the shell resolves the API's DEFAULT organization while
        // every page resolves the SELECTED one â€” the top bar would name one
        // organisation while the table below listed another's customers. That
        // is the nav/router divergence this file already exists to prevent,
        // one layer down.
        ...(withSelection ? await rawOrganizationHeader() : {}),
        // âš ï¸ AND THE ROLE, FOR EXACTLY THE SAME REASON â€” this was MISSING, and
        // its absence made the role switcher INERT in the shell.
        //
        // Measured in a browser 2026-08-01, not inferred: selecting a role wrote
        // `aw.activeRole` and `apiGet` duly sent `x-role-name` on every PAGE
        // request, but `/me` did not â€” so `viewer.activeRole` was always the
        // API's default. The switcher therefore re-rendered showing the OLD
        // role, `navRoleFor(viewer.activeRole)` kept building the OLD role's
        // navigation, and the whole control changed nothing visible.
        //
        // Worse than inert: the pages resolved as the CHOSEN role while the
        // navigation resolved as the default one â€” the precise nav/router
        // divergence the organization header above was added to prevent.
        //
        // It survived a full session because no account held two roles: the
        // switcher renders nothing below two options, so it was never exercised.
        ...(withSelection ? await rawRoleHeader() : {}),
      },
      // The viewer's role and permissions are per-request facts. Next caches
      // fetches by default; caching this one would serve one user's grants to
      // the next user who lands on the same rendered route.
      cache: 'no-store',
    });

  let response: Response;
  try {
    response = await attempt(true);
    // Only worth a second call if a selection was actually sent â€” EITHER of
    // them. Checking the organization alone left a stale ROLE cookie with no
    // way back: `/me` would fail on every render and the shell containing the
    // switcher could never appear.
    if (!response.ok && ((await activeOrganizationId()) || (await activeRoleName()))) {
      response = await attempt(false);
    }
  } catch {
    // The API being unreachable must degrade to "unauthenticated", never throw:
    // an exception here takes out the whole page, including the parts that need
    // no API at all. Fail closed and let the shell render its signed-out state.
    return null;
  }

  if (!response.ok) return null;

  try {
    return (await response.json()) as ViewerDescription;
  } catch {
    return null;
  }
});

/**
 * Is anyone signed in? Answered from the SESSION COOKIE, not from `/me`.
 *
 * Kept separate from `currentViewer()` on purpose (Codex finding M2). The
 * viewer is what the API says about a person; the session is whether there is a
 * person at all. When the API is unreachable `currentViewer()` correctly
 * degrades to null â€” but treating that as "signed out" removed the Sign out
 * button from someone holding a live Keycloak session, during exactly the
 * incident when ending a session matters most.
 *
 * Costs nothing extra: no network call, just the cookie already on the request.
 */
export async function viewerHasSession(workspaceId: WorkspaceId | string): Promise<boolean> {
  return workspaceAuth(workspaceId).hasSession();
}

/** The viewer, or `null` when nobody is signed in. */
export async function currentViewer(
  workspaceId: WorkspaceId | string,
): Promise<ViewerDescription | null> {
  return fetchViewer(workspaceId);
}

/**
 * The viewer's permission grants â€” THE single source, for both the navigation
 * and the route resolver.
 *
 * The reason it is one function has not changed since it held demo data: the
 * grants were briefly supplied in two places, the side nav advertised modules
 * that answered 404 when clicked, and two sources of truth for "what may this
 * user see" produced that bug immediately. Now that the value comes from a
 * session the risk is worse, not better â€” two call sites could resolve two
 * different identities.
 */
export async function viewerGrants(
  workspaceId: WorkspaceId | string,
): Promise<readonly PermissionKey[]> {
  return grantsFor(await fetchViewer(workspaceId));
}

/**
 * The viewer's ROLE within a workspace â€” `07.txt` part 2 Â§46-Â§49 (T-0027).
 *
 * The role decides WHICH navigation tree the viewer is on; the grants decide
 * which of its entries they may open. Both must come from the same resolved
 * viewer, which is why they share `fetchViewer` rather than each fetching.
 *
 * ROLE IS NOT AUTHORITY. Selecting a tree grants nothing: every item in it is
 * still permission-filtered, and the API plus RLS deny independently. Â§50's rule
 * â€” "No user shall receive functions outside the user's approved role and
 * branch" â€” is enforced there, not by which menu got rendered.
 *
 * An unauthenticated viewer has no role, so the workspace's own default tree is
 * shown. That is the honest rendering of "we do not know who you are"; it is
 * not a fallback to a privileged view, because the default tree is filtered by
 * `NO_GRANTS`.
 */
export async function viewerRole(
  workspaceId: WorkspaceId | string,
): Promise<RoleId | undefined> {
  const viewer = await fetchViewer(workspaceId);
  return navRoleFor(viewer?.activeRole);
}

export { grantsFor, navRoleFor, NO_GRANTS };
export type { ViewerDescription };

/**
 * The organization header for ordinary API calls â€” VALIDATED.
 *
 * Drops a stored selection the viewer does not (or no longer) holds, so a stale
 * cookie degrades to the API's default instead of failing every request. The
 * check is a convenience, NOT the control: the API re-validates every
 * `x-organization-id` against the user's own memberships and refuses one that
 * is not theirs, whatever this sends.
 *
 * Lives here rather than in `active-organization.ts` because it needs the
 * viewer, and `active-organization.ts` is imported BY the viewer lookup â€”
 * putting it there would make the two modules import each other.
 */
export async function activeOrganizationHeader(
  workspaceId: WorkspaceId | string,
): Promise<Record<string, string>> {
  const id = await activeOrganizationId();
  if (!id) return {};
  const viewer = await fetchViewer(workspaceId);
  // No viewer means no session; the call will fail on the token regardless, and
  // sending the id changes nothing.
  if (!viewer) return {};
  const holds = viewer.memberships.some((m) => m.organizationId === id);
  return holds ? { 'x-organization-id': id } : {};
}

/**
 * The viewer's chosen ROLE as a header, dropped when they no longer hold it.
 *
 * âš ï¸ THIS FILTER IS A COURTESY, NOT THE CONTROL. `resolveTenantContext`
 * re-checks `x-role-name` against the user's own memberships and REFUSES one
 * that is not theirs, whatever this sends. What dropping it here buys is that a
 * stale cookie â€” a role revoked while the user was signed in â€” degrades to the
 * API's own default instead of failing every request until they clear it.
 *
 * Mirrors `activeOrganizationHeader` deliberately, including living here rather
 * than in `active-role.ts`: it needs the viewer, and `active-role.ts` is
 * imported BY the viewer lookup, so putting it there would make the two modules
 * import each other.
 */
export async function activeRoleHeader(
  workspaceId: WorkspaceId | string,
): Promise<Record<string, string>> {
  const role = await activeRoleName();
  if (!role) return {};
  const viewer = await fetchViewer(workspaceId);
  // No viewer means no session; the call fails on the token regardless.
  if (!viewer) return {};
  // âš ï¸ CHECKED AS A PAIR, against the organization the API actually resolved â€”
  // NOT against any membership anywhere. Validating the two headers
  // independently let both pass while the combination existed nowhere, so a
  // membership revoked mid-session left the shell rendering happily while every
  // page's data call was refused. See `holdsRoleInActiveOrganization`.
  return holdsRoleInActiveOrganization(viewer, role) ? { 'x-role-name': role } : {};
}

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path apps/customer-web/app/(app)/layout.tsx' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path apps/customer-web/app/_screens/dashboard-screen.tsx' in C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path apps/customer-web/app/(app)/layout.tsx'` rejected: blocked by policy
2026-08-04T14:05:31.750977Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path apps/customer-web/app/(app)/layout.tsx'` rejected: blocked by policy
 succeeded in 748ms:
import Link from 'next/link';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, EmptyState, ErrorState, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';

/**
 * The customer's dashboard â€” `01 (1).txt` Â§18, the default landing page.
 *
 * âš ï¸ EVERY FIGURE HERE IS REAL. The workshop dashboard still shows demo tiles
 * and says so on screen; this one does not have that licence, because it is the
 * first thing a CUSTOMER sees and an invented number about their own vehicle is
 * not a placeholder, it is misinformation. `05.txt` Â§2 prohibits "disconnected
 * mock pages" and this is where that rule earns its keep.
 *
 * So the page shows only what the platform can currently answer truthfully:
 * the vehicles registered to them, whether any insurance has lapsed, and their
 * open marketplace orders â€” that last card added 2026-07-31 and NOT BEFORE,
 * because migrations 022/023 are what made it a real answer rather than a mock
 * panel. Service history, appointments and maintenance schedules are genuinely
 * not built â€”
 * they arrive with Phase 5's job cards â€” and the page says that plainly instead
 * of rendering a convincing empty chart.
 *
 * The insurance panel is the one piece of ANALYSIS rather than display, and it
 * is the reason this screen is worth building now: a lapsed policy is the fact a
 * vehicle owner most needs surfacing, it is computable from data already held,
 * and nothing else in the product tells them.
 */

interface OrderRow {
  id: string;
  order_number: string;
  supplier_name: string;
  status: string;
  currency: string;
  total: string;
  payment_status: string;
}

interface Vehicle {
  id: string;
  registrationNumber: string;
  make: string;
  model: string | null;
  insuranceExpiresOn: string | null;
  currentMileageKm: number | null;
}

/** Whole days from today (UTC) until the date; negative once it has passed. */
function daysUntil(iso: string): number {
  const then = new Date(`${iso}T00:00:00Z`).getTime();
  const now = new Date();
  // Date-only on both sides, so a policy does not read as expired for part of
  // the day depending on the server's timezone.
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((then - today) / 86_400_000);
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      aria-label={title}
      style={{
        border: `1px solid ${themeVar.borderDefault}`,
        borderRadius: primitive.radius.lg,
        padding: primitive.space[4],
        background: themeVar.backgroundSecondary,
        marginBottom: primitive.space[4],
      }}
    >
      <h2 style={{ margin: `0 0 ${primitive.space[3]} 0`, fontSize: primitive.fontSize.lg, color: themeVar.textPrimary }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export async function CustomerDashboardScreen() {
  const vehicles = await apiGet<Vehicle[]>('customer', '/vehicles');

  if (!vehicles.ok) {
    const __reason = vehicles.reason;
    return (
      <>
        <PageHeader title="Dashboard" description="Your vehicles and anything needing attention." />
        <ApiFailure reason={__reason} workspaceId="customer" />
      </>
    );
  }

  const all = vehicles.data;

  /**
   * Marketplace orders â€” REAL, and newly answerable as of migrations 022/023.
   *
   * âš ï¸ FETCHED SEPARATELY AND ALLOWED TO FAIL ALONE. A dashboard that dies
   * because one of two panels errored tells the customer nothing about the
   * vehicle data that loaded perfectly well. The orders card degrades to a
   * single honest line; the rest of the page is unaffected.
   */
  const orders = await apiGet<OrderRow[]>('customer', '/marketplace/orders');
  const openOrders = orders.ok
    ? orders.data.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled')
    : [];

  // Only vehicles with a RECORDED expiry can be assessed. A vehicle with no
  // insurance date is not "expired" â€” it is unknown, and saying otherwise would
  // send someone to renew a policy that is perfectly valid.
  const dated = all
    .filter((v) => v.insuranceExpiresOn)
    .map((v) => ({ v, days: daysUntil(v.insuranceExpiresOn as string) }));
  const lapsed = dated.filter((d) => d.days < 0);
  const soon = dated.filter((d) => d.days >= 0 && d.days <= 30);
  const unknown = all.filter((v) => !v.insuranceExpiresOn);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your vehicles and anything needing attention."
      />

      <Card title={`Your vehicles (${all.length})`}>
        {all.length === 0 ? (
          <EmptyState
            title="No vehicles yet"
            description="Add one from Add Vehicle, or a workshop will register it for you when you first book in."
          />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: primitive.space[2] }}>
            {all.map((v) => (
              <li key={v.id} style={{ display: 'flex', gap: primitive.space[3], alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: primitive.fontFamily.mono, fontWeight: 600, color: themeVar.textPrimary }}>
                  {v.registrationNumber}
                </span>
                <span style={{ color: themeVar.textSecondary }}>
                  {v.make}
                  {v.model ? ` ${v.model}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p style={{ marginBottom: 0, marginTop: primitive.space[3] }}>
          {/* `next/link`, not `<a>`: an internal navigation should be client-side,
              and the project lints for it. */}
          <Link href="/my-vehicles/garage">Open your garage</Link>
        </p>
      </Card>

      <Card title="Insurance">
        {dated.length === 0 && unknown.length === 0 ? (
          <p style={{ margin: 0, color: themeVar.textSecondary }}>
            Nothing to check yet â€” add a vehicle first.
          </p>
        ) : (
          <>
            {lapsed.length > 0 && (
              // `role="alert"` because this is the one thing on the page a
              // person may need to act on today.
              <p role="alert" style={{ margin: `0 0 ${primitive.space[3]} 0` }}>
                <StatusBadge kind="blocked" label="Expired" />{' '}
                {lapsed.map((d) => d.v.registrationNumber).join(', ')} â€” insurance has lapsed.
              </p>
            )}
            {soon.length > 0 && (
              <p style={{ margin: `0 0 ${primitive.space[3]} 0` }}>
                <StatusBadge kind="attention" label="Due soon" />{' '}
                {soon
                  .map((d) => `${d.v.registrationNumber} (${d.days === 0 ? 'today' : `${d.days} days`})`)
                  .join(', ')}
              </p>
            )}
            {lapsed.length === 0 && soon.length === 0 && dated.length > 0 && (
              <p style={{ margin: 0, color: themeVar.textSecondary }}>
                <StatusBadge kind="complete" label="In date" /> No policy expires in the next 30 days.
              </p>
            )}
            {unknown.length > 0 && (
              <p style={{ margin: `${primitive.space[3]} 0 0 0`, color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
                {/* Stated, not silently ignored: a customer seeing "in date"
                    while two vehicles were never assessed would be misled by
                    omission. */}
                No expiry recorded for {unknown.map((v) => v.registrationNumber).join(', ')}, so
                they have not been checked.
              </p>
            )}
          </>
        )}
      </Card>

      {/*
        Parts orders. Shown ONLY because the data is real â€” this card could not
        have existed before migrations 022/023, and inventing it earlier would
        have been exactly the mock panel the block below refuses to render.
      */}
      <Card title={`Parts orders${openOrders.length > 0 ? ` (${openOrders.length} open)` : ''}`}>
        {!orders.ok ? (
          // Named, not silently empty. "You have no orders" would be a LIE when
          // the truth is that we could not ask.
          <p style={{ margin: 0, color: themeVar.textSecondary }}>
            Your orders could not be loaded just now. Nothing is wrong with them â€” try the
            orders page in a moment.
          </p>
        ) : openOrders.length === 0 ? (
          <p style={{ margin: 0, color: themeVar.textSecondary }}>
            No orders in progress. Browse the parts marketplace to order directly from a
            supplier â€” you pay them yourself and record the payment against the order.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: primitive.space[2] }}>
            {openOrders.map((o) => (
              <li
                key={o.id}
                style={{ display: 'flex', gap: primitive.space[3], alignItems: 'baseline', flexWrap: 'wrap' }}
              >
                <span style={{ fontFamily: primitive.fontFamily.mono, fontWeight: 600, color: themeVar.textPrimary }}>
                  {o.order_number}
                </span>
                <span style={{ color: themeVar.textSecondary }}>{o.supplier_name}</span>
                <span style={{ color: themeVar.textPrimary }}>
                  {o.currency} {o.total}
                </span>
                <StatusBadge
                  kind={o.status === 'placed' ? 'draft' : 'active'}
                  label={o.status}
                />
                {/* Payment is a RECORD, not something this app takes â€” no
                    provider is configured. Saying "not yet paid" is therefore a
                    fact about the record, not a demand. */}
                {o.payment_status !== 'paid' && (
                  <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
                    not yet recorded as paid
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p style={{ marginBottom: 0, marginTop: primitive.space[3] }}>
          <Link href="/parts-and-warranty/parts-orders">Open your parts orders</Link>
        </p>
      </Card>

      <Card title="Not built yet">
        {/* Honest rather than decorative. `05.txt` Â§2 forbids mock pages, and a
            customer who is shown an empty "recent services" panel reasonably
            concludes the workshop has no record of their repairs. */}
        <p style={{ margin: 0, color: themeVar.textSecondary }}>
          Service history, appointments and maintenance reminders are not available yet â€” they
          arrive with the repair modules. Nothing is missing from your record; those screens simply
          do not exist in this build.
        </p>
      </Card>
    </>
  );
}

codex
No `docs/IMPLEMENTATION_LOG.md` is present, so this is reviewed against `README.md` plus the changed implementation.

- [ ] **critical** [apps/api/src/repair/proposal.service.ts](C:/Users/USER/Documents/autoworkshop-ai/apps/api/src/repair/proposal.service.ts:627) and [line 497](C:/Users/USER/Documents/autoworkshop-ai/apps/api/src/repair/proposal.service.ts:497)  
  **What’s wrong:** Both customer and staff decision paths accept any proposal whose `status === 'issued'`; they do not check `superseded_by`. The new UI flag hides superseded issued rows, but the write endpoint can still approve one by direct POST.  
  **Recommended fix:** Include `p.superseded_by` in both decision lookups and reject when non-null. Add unit tests for `recordDecision` and `recordCustomerDecision` with `status: 'issued', superseded_by: <id>`.  
  **Why it matters:** A customer or staff member can record approval on a replaced commercial offer. That breaks §424 version integrity and can authorize work against the wrong document.

- [ ] **high** [scripts/seed-customer-proposal-fixture.sh](C:/Users/USER/Documents/autoworkshop-ai/scripts/seed-customer-proposal-fixture.sh:156)  
  **What’s wrong:** The seed marks the previous proposal with `superseded_by = new_id` but does not also set `status = 'superseded'`. That manufactures the exact impossible state the service comment says should never exist: `status = 'issued'` plus `superseded_by IS NOT NULL`.  
  **Recommended fix:** Update the previous row with `SET superseded_by = new_id, status = 'superseded'`, matching `ProposalService.prepare()` at `proposal.service.ts:306`.  
  **Why it matters:** The fixture corrupts the domain model and can mask or trigger false failures in the customer approval flow.

- [ ] **high** [apps/e2e/verify/verify-customer-workflow.mjs](C:/Users/USER/Documents/autoworkshop-ai/apps/e2e/verify/verify-customer-workflow.mjs:175)  
  **What’s wrong:** The verifier still passes the approval screen when it sees `Nothing is waiting on you`, and the actual approval submission only runs inside `if (offersAnswer)` at line 201. The added seed is not invoked or enforced.  
  **Recommended fix:** Make the approval fixture mandatory for this verifier by default, or fail unless an answerable proposal exists. Allow the empty branch only under an explicit opt-out such as `ALLOW_EMPTY_CUSTOMER_PROPOSALS=1`.  
  **Why it matters:** The suite can still go green without testing “approve the work,” which is one of README’s end-to-end promises.

- [ ] **medium** [scripts/seed-customer-proposal-fixture.sh](C:/Users/USER/Documents/autoworkshop-ai/scripts/seed-customer-proposal-fixture.sh:73) and [line 88](C:/Users/USER/Documents/autoworkshop-ai/scripts/seed-customer-proposal-fixture.sh:88)  
  **What’s wrong:** The seed chooses a card with any quotation and then selects the latest quotation regardless of status. The database trigger requires an approved quotation, and `ProposalService.prepare()` also filters to approved quotations.  
  **Recommended fix:** Filter both the `EXISTS` check and `SELECT id INTO quote` with `status = 'approved'`; raise a clear exception if none exists.  
  **Why it matters:** The fixture can fail on valid dev data where the latest quote is draft/rejected, or diverge from the real product rule.

- [ ] **medium** [apps/workshop-web/app/home/dashboard/page.tsx](C:/Users/USER/Documents/autoworkshop-ai/apps/workshop-web/app/home/dashboard/page.tsx:50)  
  **What’s wrong:** `signedIn` is inferred from `currentViewer()`, even though the comment says it is read directly. `currentViewer()` returns `null` when `/me` or the API fails, which is not the same as having no session.  
  **Recommended fix:** Use `await viewerHasSession('workshop')` for this value. The module already imports `viewerHasSession`.  
  **Why it matters:** During an API outage or `/me` failure, the dashboard can again tell a signed-in user that nobody is signed in, which is the class of defect this change was meant to close.
tokens used
149,198
