# Review: codex-review

_Generated: 2026-08-19T13:02:57-07:00 · backend: codex · model: llama3.2_

## Prompt

> You are Codex acting as Independent Pair Programmer for this repository. Review the latest implementation against the stated requirement in README.md and (if present) docs/IMPLEMENTATION_LOG.md. Identify anything Claude Code missed, misunderstood, or only partially implemented. Return a checklist of defects with: severity (critical/high/medium/low), file:line, what's wrong, recommended fix, why it matters.

## Repository context

### Changed files (HEAD~1..HEAD)
```
 .github/workflows/diagnose-live-identity-roles.yml |    20 +-
 .../grant-live-suite-partner-memberships.yml       |   235 +
 apps/e2e/tests/live-signed-in.spec.ts              |   129 +-
 .../seed/grant_live_suite_partner_memberships.sql  |   258 +
 reviews/codex-review.md                            | 12008 ++++---------------
 5 files changed, 3101 insertions(+), 9549 deletions(-)
```

### Diff snippet (first 700 lines)
```diff
diff --git a/.github/workflows/diagnose-live-identity-roles.yml b/.github/workflows/diagnose-live-identity-roles.yml
index 9dd727d..6cdc6a0 100644
--- a/.github/workflows/diagnose-live-identity-roles.yml
+++ b/.github/workflows/diagnose-live-identity-roles.yml
@@ -146,13 +146,21 @@ jobs:
           {
             echo "## Live-suite identity roles — production"
             echo ""
-            echo "Read section 2. A membership with **is_earliest = t** and"
-            echo "**is_self_created = f** means the organisation's FIRST member was"
-            echo "created by somebody else, so 085 correctly refuses to promote a"
-            echo "later self-created assessor into an administrator."
+            echo "⚠️ This prose used to describe **is_earliest** and **is_self_created**,"
+            echo "columns this workflow's SQL has never emitted — it was copied from"
+            echo "\`repair-audit-org-founders.yml\` along with the firewall boilerplate."
+            echo "A summary naming columns that are not in the output below is the same"
+            echo "stale-artifact failure recorded on 08-19 for I7."
             echo ""
-            echo "Section 3 separates a real registration from a hand-seeded fixture:"
-            echo "a fixture can be corrected or removed, a real customer cannot."
+            echo "**Section 1 is the answer.** \`active_roles\` per candidate: 1 means that"
+            echo "account cannot verify a partner screen, because \`RoleSwitcher\` renders"
+            echo "nothing below two roles."
+            echo ""
+            echo "**Section 2** lists the \`[AUDIT]\` partner organisations and their members —"
+            echo "the memberships a CI identity would need for the A3 checks to assert."
+            echo ""
+            echo "**Section 3**: if \`fleet_orgs = 0\`, slice 20's nine screens are unreachable"
+            echo "by any signed-in viewer, which is a larger finding than the switcher one."
             echo ""
             echo '```'
             cat /tmp/identity.txt 2>/dev/null || echo "nothing was read"
diff --git a/.github/workflows/grant-live-suite-partner-memberships.yml b/.github/workflows/grant-live-suite-partner-memberships.yml
new file mode 100644
index 0000000..9828f01
--- /dev/null
+++ b/.github/workflows/grant-live-suite-partner-memberships.yml
@@ -0,0 +1,235 @@
+# Grant the live-suite identity its partner-workspace memberships — CLOSING A3.
+#
+# ══════════════════════════════════════════════════════════════════════════
+# 🔴 WHAT THIS IS FOR. `diagnose-live-identity-roles.yml` run 32293446882 asked
+# production instead of inferring, and confirmed the inference: the account the
+# live suite signs in as holds ONE active role (`workshop_owner`). So four A3
+# checks SKIP, and four screens shipped in slices 17 and 20 are unverified by
+# any signed-in viewer.
+#
+# This grants that account `insurance_owner`, `towing_owner` and
+# `fleet_administrator` in the three `[AUDIT]` organisations the operator
+# already uses. The ids were MEASURED, not inferred, and every write is guarded
+# by the full shape that was measured.
+#
+# ⚠️ IT IS ONLY HALF THE FIX, AND THE SQL SAYS SO AT LENGTH. Roles are scoped to
+# the ACTIVE ORGANISATION (`rolesFromMemberships`), so these memberships are
+# reachable through the ORGANISATION switcher and never through the role
+# switcher. The harness half is in `apps/e2e/tests/live-signed-in.spec.ts`.
+# Running this workflow alone changes nothing any test can observe.
+#
+# ⚠️ THIS WRITES REAL PRODUCTION DATA — three membership rows on a live
+# database. It is idempotent through the natural key, so a re-run grants zero
+# and that is success, and the transaction ROLLS BACK unless the end state it
+# exists to produce is actually true.
+#
+# ⚠️ THE ACCOUNT IS NEVER NAMED HERE. It comes from `LIVE_OWNER_EMAIL`, the same
+# repository secret the live suite signs in with, so the account granted and the
+# account tested cannot drift apart.
+#
+# 🔴 `-f confirm=APPLY` OR THIS ONLY REPORTS. The firewall handling and the
+# shared concurrency group are copied verbatim from the workflows that already
+# open the production database — see the A6 note below.
+# ══════════════════════════════════════════════════════════════════════════
+
+name: Grant live-suite partner memberships
+
+on:
+  workflow_dispatch:
+    inputs:
+      confirm:
+        description: 'Type APPLY to grant the three memberships. Anything else reports and stops.'
+        required: false
+        default: ''
+
+permissions:
+  contents: read
+
+concurrency:
+  # A6 — ALL of these open the production database firewall by PATCHing the
+  # WHOLE ipAllowList, so they must never overlap. Render has no atomic
+  # per-entry operation, so every capture/add/restore is a read-modify-write on
+  # one shared resource. It races at least THREE ways:
+  #   1. FILTERED CAPTURE (apply-migrations, backup-production-db,
+  #      rehearse-migration) drops every entry containing 'ephemeral:' when
+  #      building its snapshot. It cannot tell a dead run's entry from a LIVE
+  #      one's, so it deletes a running job's entry the moment it starts.
+  #   2. UNFILTERED RESTORE (the other twelve) restores a snapshot taken before
+  #      another run added its entry, deleting it on the way out.
+  #   3. CONCURRENT ADD (any two unfiltered runs) — both GET the same original
+  #      list, then both PATCH 'original + mine'. The second add deletes the
+  #      first run's entry before either restore happens.
+  #   (and mixed order can RESURRECT a stale entry: an unfiltered run snapshots
+  #    a foreign ephemeral entry and restores it after its owner removed it.)
+  # The victim fails with 'SSL connection has been closed unexpectedly', which
+  # is a LIE about the cause and reads as a database outage. At least six failed
+  # runs on 2026-08-14 were this.
+  #
+  # ⚠️ A RETRY IS NOT A FIX — five retries failed identically, because the entry
+  # stays deleted. And "remove only MY entry" is still racy: the API takes the
+  # whole list.
+  #
+  # 🔴 THE COST OF THIS MUTEX, STATED PLAINLY — GITHUB'S WAITING ROOM HOLDS ONE.
+  # A concurrency group is NOT a fifteen-deep FIFO queue. GitHub keeps at most
+  # ONE pending run per group and REPLACES it when a newer one arrives, with no
+  # ordering guarantee. So a pending deploy-api, migration APPLY, seed or backup
+  # can be silently discarded by a newer arrival — and apply-migrations runs
+  # automatically after EVERY Release, so automatic inspections compete with
+  # deliberate operator requests. A cancelled PENDING run is firewall-safe (it
+  # never opened anything) but the REQUEST IS LOST, not merely delayed.
+  # ▶ THEREFORE: after dispatching any of these, capture the run id and confirm
+  #   it actually STARTED. `gh run list --workflow=<wf> -L 3 --json databaseId,status`
+  #   A 'cancelled' run you did not cancel is an evicted request — re-dispatch it.
+  #
+  # ⚠️ cancel-in-progress MUST stay false: cancelling a run mid-window would
+  # leave its ephemeral entry live on the production firewall. But it does NOT
+  # close every such path — a job timeout, a manual/API cancellation or runner
+  # loss can still kill a run between its add PATCH and its restore step, and an
+  # `if: always()` restore is not a reliable finally block against those. The
+  # filtered-capture workflows clean up a stale entry on their next run; until
+  # then the exposure is real.
+  group: production-db-firewall
+  cancel-in-progress: false
+
+jobs:
+  grant:
+    runs-on: ubuntu-latest
+    timeout-minutes: 15
+    env:
+      RENDER_API_KEY: ${{ secrets.RENDER_API_KEY }}
+      DB_NAME: autoworkshop-postgres
+      # The SAME secret the live suite signs in with. Reading it here is what
+      # stops the account granted and the account tested drifting apart.
+      LIVE_OWNER_EMAIL: ${{ secrets.LIVE_OWNER_EMAIL }}
+    steps:
+      - uses: actions/checkout@v4
+
+      # 🔴 THE GATE IS FIRST, AND IT EXITS RATHER THAN SKIPPING LATER STEPS.
+      # A workflow that opens the production firewall and only then decides it
+      # is not going to write has taken the risk for nothing.
+      - name: Refuse without an explicit APPLY
+        if: inputs.confirm != 'APPLY'
+        run: |
+          echo "::notice::confirm was '${{ inputs.confirm }}', not APPLY — nothing will be written."
+          echo "Re-run with -f confirm=APPLY to grant the three named memberships."
+          exit 1
+
+      - name: Refuse without a key
+        run: |
+          set -euo pipefail
+          [ -n "${RENDER_API_KEY:-}" ] || { echo "::error::RENDER_API_KEY is not set"; exit 1; }
+
+      # ⚠️ CHECKED BEFORE THE FIREWALL OPENS. An unset secret then costs nothing
+      # at all — no exposure window, no write. The SQL refuses a second time on
+      # its own, because this check is skippable by editing the workflow and
+      # that one is not.
+      - name: Refuse without the live-suite account
+        run: |
+          set -euo pipefail
+          [ -n "${LIVE_OWNER_EMAIL:-}" ] || {
+            echo "::error::LIVE_OWNER_EMAIL is not set. This workflow grants memberships to the account the live suite signs in as; without the secret it does not know which account that is, and it will not guess."
+            exit 1; }
+
+      - name: Find the database and open the firewall for this runner
+        run: |
+          set -euo pipefail
+          sudo apt-get update -qq && sudo apt-get install -y -qq postgresql-client >/dev/null
+          curl -fsS -H "Authorization: Bearer ${RENDER_API_KEY}" -H 'Accept: application/json' \
+            "https://api.render.com/v1/postgres?name=${DB_NAME}&limit=20" > /tmp/pg_list.json || true
+          DB_ID="$(python3 -c "
+          import json, os
+          try:
+              rows = json.load(open('/tmp/pg_list.json'))
+          except Exception:
+              rows = None
+          if isinstance(rows, dict):
+              rows = rows.get('postgres') or rows.get('items') or []
+          for r in (rows or []):
+              d = r.get('postgres', r) if isinstance(r, dict) else {}
+              if d.get('name') == os.environ['DB_NAME']:
+                  print(d.get('id','')); break
+          ")"
+          [ -n "$DB_ID" ] || {
+            echo "::group::what /v1/postgres returned"; head -c 500 /tmp/pg_list.json; echo "::endgroup::"
+            echo "::error::could not find ${DB_NAME}"; exit 1; }
+          echo "$DB_ID" > /tmp/db_id
+
+          curl -fsS -H "Authorization: Bearer ${RENDER_API_KEY}" -H 'Accept: application/json' \
+            "https://api.render.com/v1/postgres/${DB_ID}" \
+            | python3 -c "
+          import sys, json
+          d = json.load(sys.stdin)
+          # \`or []\`: Render returns the key PRESENT and null when the list is
+          # empty, so a dict default would never fire.
+          print(json.dumps(d.get('ipAllowList') or []))" > /tmp/ip_allow_original.json
+
+          RUNNER_IP="$(curl -fsS --max-time 30 https://api.ipify.org)"
+          python3 - "$RUNNER_IP" > /tmp/allow.json <<'PY'
+          import json, sys
+          cur = json.load(open('/tmp/ip_allow_original.json')) or []
+          cur = [e for e in cur if e.get('cidrBlock') != f'{sys.argv[1]}/32']
+          cur.append({'cidrBlock': f'{sys.argv[1]}/32', 'description': 'demo seeding'})
+          print(json.dumps({'ipAllowList': cur}))
+          PY
+          curl -fsS -X PATCH -H "Authorization: Bearer ${RENDER_API_KEY}" \
+            -H 'Content-Type: application/json' --data @/tmp/allow.json \
+            "https://api.render.com/v1/postgres/${DB_ID}" >/dev/null
+
+          CONN="$(curl -fsS -H "Authorization: Bearer ${RENDER_API_KEY}" -H 'Accept: application/json' \
+            "https://api.render.com/v1/postgres/${DB_ID}/connection-info" \
+            | python3 -c "import sys,json;print(json.load(sys.stdin)['externalConnectionString'])")"
+          echo "::add-mask::$CONN"
+          printf '%s' "$CONN" > /tmp/dburl
+          echo "firewall open"
+
+      - name: Grant the three named partner memberships
+        run: |
+          set -euo pipefail
+          export DATABASE_URL="$(cat /tmp/dburl)"
+          PSQL="$(ls /usr/lib/postgresql/*/bin/psql | head -1)"
+          # -v, not shell interpolation into the SQL text: psql quotes the value
+          # where the script writes :'live_email', so an address containing a
+          # quote cannot alter the statement.
+          "$PSQL" -v ON_ERROR_STOP=1 "$DATABASE_URL" \
+            -v live_email="${LIVE_OWNER_EMAIL}" \
+            -f infrastructure/seed/grant_live_suite_partner_memberships.sql | tee /tmp/grant.txt
+
+      - name: Put it in the run summary
+        if: always()
+        run: |
+          {
+            echo "## Grant live-suite partner memberships — production"
+            echo ""
+            echo "Compare **BEFORE** and **AFTER**. AFTER must list four organisations:"
+            echo "the account's own workshop plus the three \`[AUDIT]\` partner ones."
+            echo ""
+            echo "\`0 granted\` with a passing gate is SUCCESS on a re-run — the writes"
+            echo "are idempotent through \`(organization_id, user_id, role_name)\`."
+            echo ""
+            echo "⚠️ This is half the fix. Roles are scoped to the ACTIVE organisation,"
+            echo "so these are reachable through the ORGANISATION switcher only. The"
+            echo "live suite must be re-run to turn the four A3 skips into passes."
+            echo ""
+            echo '```'
+            cat /tmp/grant.txt 2>/dev/null || echo "nothing was written"
+            echo '```'
+          } >> "$GITHUB_STEP_SUMMARY"
+
+      - name: Always restore the database firewall
+        if: always()
+        run: |
+          set -euo pipefail
+          [ -f /tmp/db_id ] && [ -f /tmp/ip_allow_original.json ] || { echo "nothing to restore"; exit 0; }
+          ID="$(cat /tmp/db_id)"
+          python3 -c "
+          import json
+          json.dump({'ipAllowList': json.load(open('/tmp/ip_allow_original.json')) or []},
+                    open('/tmp/restore.json','w'))"
+          curl -fsS -X PATCH -H "Authorization: Bearer ${RENDER_API_KEY}" \
+            -H 'Content-Type: application/json' --data @/tmp/restore.json \
+            "https://api.render.com/v1/postgres/${ID}" >/dev/null
+          echo "firewall restored"
+
+      - name: Always remove the credentials from the runner
+        if: always()
+        run: rm -f /tmp/dburl || true
diff --git a/apps/e2e/tests/live-signed-in.spec.ts b/apps/e2e/tests/live-signed-in.spec.ts
index ae43c9d..fe18eab 100644
--- a/apps/e2e/tests/live-signed-in.spec.ts
+++ b/apps/e2e/tests/live-signed-in.spec.ts
@@ -396,7 +396,7 @@ test.describe('the live site, signed in as the workshop owner', () => {
  * is not a defect.
  * ══════════════════════════════════════════════════════════════════════════
  */
-test.describe('the live site, signed in and acting in another role', () => {
+test.describe('the live site, signed in and acting in another organisation', () => {
   test.beforeAll(() => {
     test.skip(
       !OWNER_EMAIL || !OWNER_PASSWORD,
@@ -412,30 +412,42 @@ test.describe('the live site, signed in and acting in another role', () => {
    * locator timeout.
    */
   /**
-   * 🔴 THIS CHECK ANSWERED A3, AND THE ANSWER WAS NOT THE ONE EXPECTED.
+   * 🔴 THIS CHECK ANSWERED A3 — AND THEN THE ANSWER TURNED OUT TO BE ABOUT THE
+   * WRONG CONTROL.
    *
    * Run 32290511884: `getByLabel('Acting as role')` — ELEMENT NOT FOUND.
    * `RoleSwitcher` returns `null` when the viewer holds fewer than two roles
-   * ("one role is not a choice"), so the control is absent, not broken.
+   * ("one role is not a choice"), so the control was absent, not broken. The
+   * conclusion drawn was that the CI identity holds one role, and
+   * `diagnose-live-identity-roles.yml` run 32293446882 asked production and
+   * CONFIRMED it: one active membership, `workshop_owner`.
    *
-   * ▶ THE CI IDENTITY HOLDS ONE ROLE. `LIVE_OWNER_EMAIL` is a dedicated test
-   *   account, not the operator's own `marc667us@yahoo.com`, which holds seven
-   *   roles in one tenant. **So the signed-in half of this suite STRUCTURALLY
-   *   CANNOT verify any partner-role screen** — insurance, towing or fleet — no
-   *   matter how many times it runs. A3 was not merely unmet; it was
-   *   unmeetable by this harness.
+   * ▶ BUT THE PRESCRIBED FIX — "give the CI identity memberships in the
+   *   `[AUDIT]` organisations" — WOULD HAVE LEFT THIS CHECK SKIPPING ANYWAY,
+   *   and that is the thing worth remembering:
    *
-   * ⚠️ THAT IS A FIXTURE GAP, NOT A PRODUCT DEFECT, so this is a SKIP and not a
-   * failure — and a LOUD one. A red would say something is broken when nothing
-   * is; a silent skip would hide that four screens are unverified. Passed,
-   * failed and SKIPPED are three states here, and a skip must be said out loud.
+   *     viewer-contract.ts:470   if (m.organizationId !== organizationId) continue;
    *
-   * ▶ WHAT WOULD CLOSE IT: give the CI identity memberships in the `[AUDIT]`
-   *   insurance, towing and fleet organisations — the same organisations the
-   *   operator already uses to reach those trees. Then this check and the three
-   *   below start asserting instead of skipping.
+   *   `rolesFromMemberships` is SCOPED TO THE ACTIVE ORGANISATION, on purpose.
+   *   Every request carries `x-organization-id` AND `x-role-name` and
+   *   `resolveTenantContext` requires ONE membership matching BOTH, so a role
+   *   held in a DIFFERENT organisation is never offered here — offering it
+   *   would offer a pair the API refuses. The `[AUDIT]` organisations are in
+   *   the operator's tenant; the live-suite account is in its own. So the role
+   *   switcher can never be the control that reaches them.
+   *
+   * ▶ THE CONTROL THAT CROSSES ORGANISATIONS IS THE ORGANISATION SWITCHER.
+   *   `organizationsFromMemberships` does NOT filter by tenant, and
+   *   `setActiveOrganizationAction` CLEARS the stored role on the way out so
+   *   the API re-defaults to the strongest role held in the organisation just
+   *   entered. That is why this check now drives that control instead.
+   *
+   * ⚠️ IT STILL SKIPS RATHER THAN FAILS WHEN THE MEMBERSHIPS ARE ABSENT. That
+   * is a fixture gap, not a product defect — a red would say something is
+   * broken when nothing is, and a silent skip would hide that four screens are
+   * unverified. Passed, failed and SKIPPED are three states here.
    */
-  test('the role switcher offers the partner roles', async ({ page }) => {
+  test('the organisation switcher offers the partner organisations', async ({ page }) => {
     await signIn(page);
 
     // Asserted first and separately: the shell DID resolve a viewer. Without
@@ -445,53 +457,65 @@ test.describe('the live site, signed in and acting in another role', () => {
       timeout: 60_000,
     });
 
-    const switcher = page.getByLabel('Acting as role');
+    // ⚠️ `Active organization` — the LABEL's spelling, which is American while
+    // the prose here is not. Matching the prose would silently find nothing.
+    const switcher = page.getByLabel('Active organization');
     const hasSwitcher = (await switcher.count()) > 0;
 
     test.skip(
       !hasSwitcher,
-      'A3 UNANSWERED: this CI identity holds ONE role, so the role switcher is ' +
-        'not rendered and the insurance, towing and fleet screens CANNOT be ' +
-        'verified by a signed-in viewer here. Not a product defect and not a ' +
-        'pass. Fix: give LIVE_OWNER_EMAIL memberships in the [AUDIT] partner ' +
-        'organisations.',
+      'A3 UNANSWERED: this CI identity belongs to ONE organisation, so the ' +
+        'organisation switcher is not rendered and the insurance, towing and ' +
+        'fleet screens CANNOT be reached by a signed-in viewer here. Not a ' +
+        'product defect and not a pass. Fix: run ' +
+        'grant-live-suite-partner-memberships.yml -f confirm=APPLY.',
     );
 
-    const roles = await switcher.locator('option').allTextContents();
+    const orgs = await switcher.locator('option').allTextContents();
     // Printed, not just asserted — the run log is where the next reader learns
     // what this account actually holds, and the live-suite job reads its logs.
     // An annotation would land in the HTML report, which nothing in CI opens.
     // eslint-disable-next-line no-console -- the OUTPUT is this check's deliverable
-    console.log(`A3: the owner can act as: ${roles.join(', ')}`);
+    console.log(`A3: the account belongs to: ${orgs.join(', ')}`);
 
-    expect(roles.join(' ').toLowerCase()).toContain('insurance');
+    expect(orgs.join(' ').toLowerCase()).toContain('insurance');
   });
 
   /**
-   * ⚠️ SWITCHING ROLE ALSO NAVIGATES. `setActiveRoleAction` used to revalidate
-   * IN PLACE, which stranded the owner on a pack they no longer held the
-   * permission for — ADR-021's third instance, fixed on 2026-08-16 by routing
-   * through `homeWorkspaceFor()`. So after choosing a role the test waits for
-   * the destination rather than assuming the current page re-rendered.
+   * Enter a partner workspace by switching ORGANISATION, and say whether it
+   * was possible.
+   *
+   * 🔴 WHY ORGANISATION AND NOT ROLE. `rolesFromMemberships` filters to the
+   * ACTIVE organisation, so a role held only in another organisation is never
+   * in the role switcher — the earlier `actAs` could not have reached the
+   * `[AUDIT]` organisations however many memberships were granted. The
+   * organisation switcher is unfiltered by tenant, and
+   * `setActiveOrganizationAction` deletes the stored role cookie before
+   * redirecting to `/`, so the API re-resolves the STRONGEST role held in the
+   * organisation just entered (`ROLE_PRECEDENCE`). Switching organisation is
+   * therefore sufficient on its own, and switching role afterwards would be
+   * both unnecessary and — inside a single-role organisation, where the
+   * switcher is absent — impossible.
+   *
+   * ⚠️ SWITCHING ALSO NAVIGATES, to `/`, which dispatches to the new role's
+   * home pack. The caller's own `page.goto` follows, so this only has to wait
+   * for the switch to settle rather than assert where it landed.
+   *
+   * 🔴 COUNT, DO NOT WAIT — kept from the fix on 2026-08-19. The first version
+   * of this helper called `waitFor({ state: 'visible' })` on a control whose
+   * ABSENCE is the expected case, which THROWS after 60s, so it could never
+   * return `false` and the callers' skip branch was unreachable. The suite went
+   * red twice for a fixture gap the checks were written to skip on. Absence
+   * must be a value this returns, never an exception it raises.
    */
-  async function actAs(page: import('@playwright/test').Page, match: RegExp) {
-    const switcher = page.getByLabel('Acting as role');
-    // 🔴 COUNT, DO NOT WAIT. The first version called
-    // `waitFor({ state: 'visible' })`, which THROWS after 60s when the control
-    // is absent — so this helper could never return `false`, and the callers'
-    // "skip when the role is missing" branch was unreachable. The suite went
-    // red for a fixture gap the checks were written to skip on.
-    //
-    // Absence is the EXPECTED case for a single-role identity (`RoleSwitcher`
-    // renders nothing below two roles), so it must be a value this function can
-    // return, not an exception it raises.
+  async function actInOrganization(page: import('@playwright/test').Page, match: RegExp) {
+    const switcher = page.getByLabel('Active organization');
     if ((await switcher.count()) === 0) return false;
     const options = await switcher.locator('option').all();
     for (const o of options) {
       const label = (await o.textContent()) ?? '';
       if (match.test(label)) {
         await switcher.selectOption({ label });
-        // The switch navigates to that role's home workspace.
         await page.waitForLoadState('networkidle', { timeout: 120_000 });
         return true;
       }
@@ -501,12 +525,12 @@ test.describe('the live site, signed in and acting in another role', () => {
 
   test('an insurance owner reaches their own users screen', async ({ page }) => {
     await signIn(page);
-    const switched = await actAs(page, /insurance/i);
+    const switched = await actInOrganization(page, /insurance/i);
     // Same fixture gap as the switcher check above — skipped loudly, never
     // silently, because "unverified" and "verified" must not look alike.
     test.skip(
       !switched,
-      'A3 UNANSWERED: this CI identity cannot act as an insurance owner, so ' +
+      'A3 UNANSWERED: this CI identity belongs to no insurance organisation, so ' +
         '/insurance/settings/users is UNVERIFIED by a signed-in viewer.',
     );
 
@@ -527,11 +551,11 @@ test.describe('the live site, signed in and acting in another role', () => {
     page,
   }) => {
     await signIn(page);
-    const switched = await actAs(page, /insurance/i);
+    const switched = await actInOrganization(page, /insurance/i);
     test.skip(
       !switched,
-      'A3 UNANSWERED: this CI identity cannot act as an insurance owner, so the ' +
-        'enquiry inbox on My Products is UNVERIFIED by a signed-in viewer.',
+      'A3 UNANSWERED: this CI identity belongs to no insurance organisation, so ' +
+        'the enquiry inbox on My Products is UNVERIFIED by a signed-in viewer.',
     );
 
     await page.goto(`${APEX}/insurance/sales/my-products`, { timeout: 120_000 });
@@ -554,11 +578,12 @@ test.describe('the live site, signed in and acting in another role', () => {
    */
   test('a fleet administrator reaches the fleet screens built in slice 20', async ({ page }) => {
     await signIn(page);
-    const switched = await actAs(page, /fleet/i);
+    const switched = await actInOrganization(page, /fleet/i);
     test.skip(
       !switched,
-      'this account holds no fleet role, so slice 20 is UNSEEN by a signed-in ' +
-        'viewer. Not a pass — the screens are proven only by build and unit tests.',
+      'this account belongs to no fleet organisation, so slice 20 is UNSEEN by a ' +
+        'signed-in viewer. Not a pass — the screens are proven only by build and ' +
+        'unit tests.',
     );
 
     await page.goto(`${APEX}/fleet/fleet-assets/vehicles`, { timeout: 120_000 });
diff --git a/infrastructure/seed/grant_live_suite_partner_memberships.sql b/infrastructure/seed/grant_live_suite_partner_memberships.sql
new file mode 100644
index 0000000..28d996a
--- /dev/null
+++ b/infrastructure/seed/grant_live_suite_partner_memberships.sql
@@ -0,0 +1,258 @@
+-- One-off: let the live-suite identity REACH the partner workspaces.
+--
+-- ══════════════════════════════════════════════════════════════════════════
+-- 🔴 WHAT THIS CLOSES — A3, AND ONLY HALF OF IT.
+--
+-- `diagnose-live-identity-roles.yml` run 32293446882 asked production rather
+-- than inferring, and the inference held:
+--
+--   live-owner@aiappinvent.com   1 active membership   1 active role
+--                                roles: workshop_owner
+--   marc667us@yahoo.com          7 active memberships  7 active roles
+--
+-- So the signed-in half of the live suite holds ONE role and `RoleSwitcher`
+-- renders nothing below two. Four A3 checks skip, and four screens built in
+-- slices 17 and 20 are unverified by any signed-in viewer.
+--
+-- The three `[AUDIT]` partner organisations are the ones the operator already
+-- uses, and each has exactly one member — the operator:
+--
+--   [AUDIT] Insurance Company  d7d30afd-…  insurance_company  insurance_owner
+--   [AUDIT] Towing Company     c5c43056-…  towing_company     towing_owner
+--   [AUDIT] Fleet Operator     f9dc95da-…  fleet_operator     fleet_administrator
+--
+-- All three live in tenant 7adce423-8a76-49f0-8174-7b40b66ef8c5. The live-suite
+-- account lives in its OWN tenant, so these memberships are deliberately
+-- CROSS-TENANT — which `identity.memberships` represents natively (`users` is
+-- not tenant-scoped, by the comment in migration 001) and which the operator's
+-- own account does not exercise, because all seven of its roles sit in one
+-- tenant.
+--
+-- ── 🔴 WHY GRANTING THE MEMBERSHIPS IS NOT, BY ITSELF, THE FIX ────────────
+--
+-- The resume pointer prescribed exactly this write and stopped there. Read
+-- against source, that would have been INERT:
+--
+--   viewer-contract.ts:470   if (m.organizationId !== organizationId) continue;
+--
+-- `rolesFromMemberships` is SCOPED TO THE ACTIVE ORGANISATION, deliberately —
+-- every request sends `x-organization-id` AND `x-role-name` together and
+-- `resolveTenantContext` requires ONE membership matching BOTH, so offering a
+-- role held only elsewhere would offer a pair the API refuses. A role held in
+-- another organisation therefore NEVER appears in the role switcher, no matter
+-- how many memberships this script writes.
+--
+-- ▶ The control that crosses organisations is the ORGANISATION switcher, and
+--   changing organisation CLEARS the stored role (`set-organization-action.ts`)
+--   so the API re-defaults to the strongest role held in the new organisation.
+--   The harness change is in `apps/e2e/tests/live-signed-in.spec.ts`, and
+--   WITHOUT IT this script changes nothing a test can observe.
+--
+-- ── ⚠️ WHY THE DEFAULT LANDING DOES NOT MOVE ─────────────────────────────
+--
+-- `resolveTenantContext` defaults by ROLE AUTHORITY first, organisation id only
+-- as a tie-break. In `ROLE_PRECEDENCE`, `workshop_owner` is index 1 and outranks
+-- `supplier_owner`(2), `fleet_administrator`(3), `insurance_owner`(4) and
+-- `towing_owner`(5); only `platform_administrator`(0) beats it. So after this
+-- runs, the live-suite account still signs in to its own workshop, and the four
+-- currently-passing signed-in checks keep passing. That was checked BEFORE
+-- writing, because adding memberships to the account the suite signs in as is
+-- exactly the kind of change that turns a green suite red for a reason nobody
+-- expects.
+--
+-- ── ⚠️ THE E-MAIL IS NOT HARDCODED HERE ──────────────────────────────────
+--
+-- `LIVE_OWNER_EMAIL` is a repository secret. This script takes it as
+-- `:live_email` from the workflow, which reads the SAME secret the live suite
+-- signs in with — so the account provisioned, the account granted and the
+-- account tested cannot drift apart. A literal in this file could.
+--
+-- ⚠️ AND IT IS RE-EXPORTED AS A GUC IMMEDIATELY BELOW, WHICH IS NOT
+-- REDUNDANT. psql substitutes `:'live_email'` in ordinary statement text but
+-- NOT inside dollar-quoted bodies, so a `:'live_email'` written inside the
+-- `DO $grant$ … $grant$` block below would be sent to the server verbatim and
+-- fail to parse. The blocks read `current_setting('live.email')` instead.
+--
+-- 🔴 EVERY WRITE IS GUARDED BY THE FULL SHAPE THAT WAS MEASURED — organisation
+-- id, tenant id, org_type, active status — and is idempotent through the
+-- natural key. If production has moved since the diagnostic, nothing is written
+-- and the gate says so rather than reporting success.
+-- ══════════════════════════════════════════════════════════════════════════
+
+\pset pager off
+\set ON_ERROR_STOP on
+
+BEGIN;
+
+-- Transaction-local: this IS one transaction, so `true` is correct. The
+-- diagnostic needed `false` because each of its statements was its own
+-- transaction; copying that here would leak the setting past COMMIT.
+SELECT set_config('app.current_role', 'admin', true) AS platform_context;
+
+-- The e-mail, carried across the dollar-quoting boundary. `true` again: it must
+-- not outlive this transaction.
+SELECT set_config('live.email', :'live_email', true) AS live_email;
+
+\echo ''
+\echo '=== BEFORE — what the live-suite identity holds ==='
+SELECT u.email, o.name AS organization, o.org_type, m.role_name, m.status
+  FROM identity.users u
+  LEFT JOIN identity.memberships m   ON m.user_id = u.id
+  LEFT JOIN identity.organizations o ON o.id = m.organization_id
+ WHERE u.email = :'live_email'
+ ORDER BY o.name;
+
+DO $grant$
+DECLARE
+    -- Measured 2026-08-19 by diagnose-live-identity-roles.yml run 32293446882.
+    v_tenant    uuid := '7adce423-8a76-49f0-8174-7b40b66ef8c5';
+    v_ins_org   uuid := 'd7d30afd-a615-4c0b-a8d2-fa61c44570bb';
+    v_tow_org   uuid := 'c5c43056-8920-47c9-8735-2d52e8ee3115';
+    v_fleet_org uuid := 'f9dc95da-d225-49b2-a4ed-adae414e2b2d';
+    v_email     text := current_setting('live.email', true);
+    v_user      uuid;
+    v_changed   int;
+    v_total     int := 0;
+BEGIN
+    IF v_email IS NULL OR v_email = '' THEN
+        RAISE EXCEPTION 'live.email is not set — the workflow did not pass '
+                        '-v live_email, so this script does not know which account '
+                        'to grant. Refusing rather than guessing.';
+    END IF;
+
+    -- ── resolve the account, and REFUSE on anything but exactly one ───────
+    -- A LIKE or a "first match" here could grant partner authority to the
+    -- wrong person. `identity.users` is not tenant-scoped, so an e-mail is the
+    -- only handle — it must therefore resolve to exactly one active row or
+    -- this stops.
+    SELECT id INTO v_user
+      FROM identity.users
+     WHERE email = v_email AND status = 'active';
+
+    IF v_user IS NULL THEN
+        RAISE EXCEPTION 'no ACTIVE identity.users row with e-mail %. LIVE_OWNER_EMAIL '
+                        'names an account that does not exist on production — run '
+                        'provision-live-suite-account.yml first, or the secret is wrong.',
+                        v_email;
+    END IF;
+
+    RAISE NOTICE 'granting partner memberships to % (%)', v_email, v_user;
+
+    -- ── the three grants ─────────────────────────────────────────────────
+    -- One statement per organisation rather than a loop over a VALUES list:
+    -- each names its own org_type, so a mistyped pairing (a towing role into
+    -- the insurance organisation) cannot insert anything. A loop would make
+    -- all three share one predicate and lose exactly that check.
+    --
+    -- `ON CONFLICT` on the natural key `(organization_id, user_id, role_name)`
+    -- makes a re-run a no-op, so `0 granted` on the second run is SUCCESS.
+    --
+    -- `created_by` is left NULL, deliberately. Naming a grantor would write a
+    -- claim about history this script cannot establish — the same reasoning
+    -- that made repair_audit_org_founders.sql set the role rather than
+    -- backfill `created_by`. The existing [AUDIT] rows are NULL too.
+    --
+    -- `tenant_id` comes from the ORGANISATION ROW, never from a literal or from
+    -- the user's own tenant. A membership whose tenant disagrees with its
+    -- organisation is the shape RLS cannot express and every join would then
+    -- silently drop.
+    INSERT INTO identity.memberships (tenant_id, organization_id, user_id, role_name, status)
+    SELECT o.tenant_id, o.id, v_user, 'insurance_owner', 'active'
+      FROM identity.organizations o
+     WHERE o.id        = v_ins_org
+       AND o.tenant_id = v_tenant
+       AND o.org_type  = 'insurance_company'
+       AND o.status    = 'active'
+    ON CONFLICT (organization_id, user_id, role_name) DO NOTHING;
+    GET DIAGNOSTICS v_changed = ROW_COUNT;
+    RAISE NOTICE 'insurance: % membership(s) granted', v_changed;
+    v_total := v_total + v_changed;
+
+    INSERT INTO identity.memberships (tenant_id, organization_id, user_id, role_name, status)
+    SELECT o.tenant_id, o.id, v_user, 'towing_owner', 'active'
+      FROM identity.organizations o
+     WHERE o.id        = v_tow_org
+       AND o.tenant_id = v_tenant
+       AND o.org_type  = 'towing_company'
+       AND o.status    = 'active'
+    ON CONFLICT (organization_id, user_id, role_name) DO NOTHING;
+    GET DIAGNOSTICS v_changed = ROW_COUNT;
+    RAISE NOTICE 'towing: % membership(s) granted', v_changed;
+    v_total := v_total + v_changed;
+
+    INSERT INTO identity.memberships (tenant_id, organization_id, user_id, role_name, status)
+    SELECT o.tenant_id, o.id, v_user, 'fleet_administrator', 'active'
+      FROM identity.organizations o
+     WHERE o.id        = v_fleet_org
+       AND o.tenant_id = v_tenant
+       AND o.org_type  = 'fleet_operator'
+       AND o.status    = 'active'
+    ON CONFLICT (organization_id, user_id, role_name) DO NOTHING;
+    GET DIAGNOSTICS v_changed = ROW_COUNT;
+    RAISE NOTICE 'fleet: % membership(s) granted', v_changed;
+    v_total := v_total + v_changed;
+
+    RAISE NOTICE 'total granted this run: % (0 on a re-run is expected)', v_total;
+END;
+$grant$;
+
+-- ── THE GATE: assert the END STATE, not the row count ─────────────────────
+--
+-- 🔴 THIS IS WHAT MAKES THE WRITE MEANINGFUL. Inserting rows is not the goal;
+-- the goal is that a signed-in viewer can REACH the insurance, towing and fleet
+-- workspaces. So the end state is asserted here and the transaction ROLLS BACK
+-- if it is not true — rather than reporting success and leaving the live suite
+-- to skip again twenty minutes later.
+--
+-- It asserts the ORGANISATION count as well as the roles, because the
+-- organisation switcher is the control the harness actually drives and it too
+-- renders nothing below two options.
+DO $gate$
```

## Findings

I found five actionable defects. `docs/IMPLEMENTATION_LOG.md` is absent; README.md provides only repository-wide security/operational requirements, not a specific A3 acceptance statement.

- [ ] **Critical** — [grant_live_suite_partner_memberships.sql:128](C:/Users/USER/Documents/autoworkshop-ai/infrastructure/seed/grant_live_suite_partner_memberships.sql:128)  
  **What’s wrong:** The comment promises to refuse unless the email resolves to exactly one account, but `SELECT id INTO v_user` without `STRICT` silently chooses one row. `identity.users.email` is not unique. Duplicate active emails could therefore grant production partner authority to an arbitrary account.  
  **Recommended fix:** Resolve by immutable unique `keycloak_subject`, or use `SELECT ... INTO STRICT` and explicitly handle `NO_DATA_FOUND` and `TOO_MANY_ROWS`. If email remains the identifier, first assert `count(*) = 1`.  
  **Why it matters:** This is a real production authorization grant and contradicts the fail-closed authentication/authorization promise in README.md.

- [ ] **High** — [grant_live_suite_partner_memberships.sql:166](C:/Users/USER/Documents/autoworkshop-ai/infrastructure/seed/grant_live_suite_partner_memberships.sql:166)  
  **What’s wrong:** All three inserts use `ON CONFLICT ... DO NOTHING`. If a matching membership already exists with `status = 'suspended'` or `revoked`, no active membership is created and the workflow can never achieve its stated end state. The same defect occurs at lines 178 and 190.  
  **Recommended fix:** Decide explicitly whether this operator action may reactivate memberships. If so, use a guarded `DO UPDATE SET status = 'active', updated_at = now()`; otherwise detect the inactive conflict and emit a precise refusal explaining the required remediation.  
  **Why it matters:** The advertised idempotent repair fails permanently on a valid schema state and produces a misleading “grants did not take” diagnosis.

- [ ] **High** — [grant_live_suite_partner_memberships.sql:221](C:/Users/USER/Documents/autoworkshop-ai/infrastructure/seed/grant_live_suite_partner_memberships.sql:221)  
  **What’s wrong:** The transaction gate aggregates roles across every organization and merely checks that the user has at least two organizations. It does not verify the three exact `(organization_id, tenant_id, role_name, status)` memberships the workflow claims to create. A matching role held elsewhere can mask a failed target grant, allowing the transaction to commit while one named `[AUDIT]` organization remains unreachable.  
  **Recommended fix:** Gate with three explicit `EXISTS` checks joining each measured organization and requiring the expected tenant, type, active organization, active membership, user, and role. Assert all three target organization IDs, not global role names/counts.  
  **Why it matters:** The workflow can report success without producing the fixture that the tests and run summary promise.

- [ ] **High** — [live-signed-in.spec.ts:519](C:/Users/USER/Documents/autoworkshop-ai/apps/e2e/tests/live-signed-in.spec.ts:519)  
  **What’s wrong:** `selectOption()` is followed by `waitForLoadState('networkidle')`. Because the current page may already be idle, this can resolve before the server-action navigation begins. The subsequent `page.goto()` can then race the cookie-setting action or its redirect.  
  **Recommended fix:** Synchronize against the navigation initiated by the selection, for example with `Promise.all([page.waitForURL(...), switcher.selectOption(...)])`, or wait for an observable post-switch state such as the selected organization/viewer context. Avoid `networkidle` as the sole synchronization signal.  
  **Why it matters:** The new organization-switching path can be flaky or test the old organization, undermining the live verification it was added to provide.

- [ ] **Medium** — [live-signed-in.spec.ts:526](C:/Users/USER/Documents/autoworkshop-ai/apps/e2e/tests/live-signed-in.spec.ts:526)  
  **What’s wrong:** The production workflow grants insurance, towing, and fleet memberships, and the switcher test claims all three partner areas become verifiable, but the suite only enters insurance and fleet organizations. There is no signed-in towing workspace assertion.  
  **Recommended fix:** Add a towing-owner reachability test for at least one concrete towing route and its distinctive content, including the existing “not built yet” exclusion. Alternatively, stop granting towing and narrow all A3 claims if towing is intentionally out of scope.  
  **Why it matters:** One third of the production fixture mutation remains unused and towing can regress while the advertised A3 verification stays green.
The harness half is in `apps/e2e/tests/live-signed-in.spec.ts`.
+# Running this workflow alone changes nothing any test can observe.
+#
+# ⚠️ THIS WRITES REAL PRODUCTION DATA — three membership rows on a live
+# database. It is idempotent through the natural key, so a re-run grants zero
+# and that is success, and the transaction ROLLS BACK unless the end state it
+# exists to produce is actually true.
+#
+# ⚠️ THE ACCOUNT IS NEVER NAMED HERE. It comes from `LIVE_OWNER_EMAIL`, the same
+# repository secret the live suite signs in with, so the account granted and the
+# account tested cannot drift apart.
+#
+# 🔴 `-f confirm=APPLY` OR THIS ONLY REPORTS. The firewall handling and the
+# shared concurrency group are copied verbatim from the workflows that already
+# open the production database — see the A6 note below.
+# ══════════════════════════════════════════════════════════════════════════
+
+name: Grant live-suite partner memberships
+
+on:
+  workflow_dispatch:
+    inputs:
+      confirm:
+        description: 'Type APPLY to grant the three memberships. Anything else reports and stops.'
+        required: false
+        default: ''
+
+permissions:
+  contents: read
+
+concurrency:
+  # A6 — ALL of these open the production database firewall by PATCHing the
+  # WHOLE ipAllowList, so they must never overlap. Render has no atomic
+  # per-entry operation, so every capture/add/restore is a read-modify-write on
+  # one shared resource. It races at least THREE ways:
+  #   1. FILTERED CAPTURE (apply-migrations, backup-production-db,
+  #      rehearse-migration) drops every entry containing 'ephemeral:' when
+  #      building its snapshot. It cannot tell a dead run's entry from a LIVE
+  #      one's, so it deletes a running job's entry the moment it starts.
+  #   2. UNFILTERED RESTORE (the other twelve) restores a snapshot taken before
+  #      another run added its entry, deleting it on the way out.
+  #   3. CONCURRENT ADD (any two unfiltered runs) — both GET the same original
+  #      list, then both PATCH 'original + mine'. The second add deletes the
+  #      first run's entry before either restore happens.
+  #   (and mixed order can RESURRECT a stale entry: an unfiltered run snapshots
+  #    a foreign ephemeral entry and restores it after its owner removed it.)
+  # The victim fails with 'SSL connection has been closed unexpectedly', which
+  # is a LIE about the cause and reads as a database outage. At least six failed
+  # runs on 2026-08-14 were this.
+  #
+  # ⚠️ A RETRY IS NOT A FIX — five retries failed identically, because the entry
+  # stays deleted. And "remove only MY entry" is still racy: the API takes the
+  # whole list.
+  #
+  # 🔴 THE COST OF THIS MUTEX, STATED PLAINLY — GITHUB'S WAITING ROOM HOLDS ONE.
+  # A concurrency group is NOT a fifteen-deep FIFO queue. GitHub keeps at most
+  # ONE pending run per group and REPLACES it when a newer one arrives, with no
+  # ordering guarantee. So a pending deploy-api, migration APPLY, seed or backup
+  # can be silently discarded by a newer arrival — and apply-migrations runs
+  # automatically after EVERY Release, so automatic inspections compete with
+  # deliberate operator requests. A cancelled PENDING run is firewall-safe (it
+  # never opened anything) but the REQUEST IS LOST, not merely delayed.
+  # ▶ THEREFORE: after dispatching any of these, capture the run id and confirm
+  #   it actually STARTED. `gh run list --workflow=<wf> -L 3 --json databaseId,status`
+  #   A 'cancelled' run you did not cancel is an evicted request — re-dispatch it.
+  #
+  # ⚠️ cancel-in-progress MUST stay false: cancelling a run mid-window would
+  # leave its ephemeral entry live on the production firewall. But it does NOT
+  # close every such path — a job timeout, a manual/API cancellation or runner
+  # loss can still kill a run between its add PATCH and its restore step, and an
+  # `if: always()` restore is not a reliable finally block against those. The
+  # filtered-capture workflows clean up a stale entry on their next run; until
+  # then the exposure is real.
+  group: production-db-firewall
+  cancel-in-progress: false
+
+jobs:
+  grant:
+    runs-on: ubuntu-latest
+    timeout-minutes: 15
+    env:
+      RENDER_API_KEY: ${{ secrets.RENDER_API_KEY }}
+      DB_NAME: autoworkshop-postgres
+      # The SAME secret the live suite signs in with. Reading it here is what
+      # stops the account granted and the account tested drifting apart.
+      LIVE_OWNER_EMAIL: ${{ secrets.LIVE_OWNER_EMAIL }}
+    steps:
+      - uses: actions/checkout@v4
+
+      # 🔴 THE GATE IS FIRST, AND IT EXITS RATHER THAN SKIPPING LATER STEPS.
+      # A workflow that opens the production firewall and only then decides it
+      # is not going to write has taken the risk for nothing.
+      - name: Refuse without an explicit APPLY
+        if: inputs.confirm != 'APPLY'
+        run: |
+          echo "::notice::confirm was '${{ inputs.confirm }}', not APPLY — nothing will be written."
+          echo "Re-run with -f confirm=APPLY to grant the three named memberships."
+          exit 1
+
+      - name: Refuse without a key
+        run: |
+          set -euo pipefail
+          [ -n "${RENDER_API_KEY:-}" ] || { echo "::error::RENDER_API_KEY is not set"; exit 1; }
+
+      # ⚠️ CHECKED BEFORE THE FIREWALL OPENS. An unset secret then costs nothing
+      # at all — no exposure window, no write. The SQL refuses a second time on
+      # its own, because this check is skippable by editing the workflow and
+      # that one is not.
+      - name: Refuse without the live-suite account
+        run: |
+          set -euo pipefail
+          [ -n "${LIVE_OWNER_EMAIL:-}" ] || {
+            echo "::error::LIVE_OWNER_EMAIL is not set. This workflow grants memberships to the account the live suite signs in as; without the secret it does not know which account that is, and it will not guess."
+            exit 1; }
+
+      - name: Find the database and open the firewall for this runner
+        run: |
+          set -euo pipefail
+          sudo apt-get update -qq && sudo apt-get install -y -qq postgresql-client >/dev/null
+          curl -fsS -H "Authorization: Bearer ${RENDER_API_KEY}" -H 'Accept: application/json' \
+            "https://api.render.com/v1/postgres?name=${DB_NAME}&limit=20" > /tmp/pg_list.json || true
+          DB_ID="$(python3 -c "
+          import json, os
+          try:
+              rows = json.load(open('/tmp/pg_list.json'))
+          except Exception:
+              rows = None
+          if isinstance(rows, dict):
+              rows = rows.get('postgres') or rows.get('items') or []
+          for r in (rows or []):
+              d = r.get('postgres', r) if isinstance(r, dict) else {}
+              if d.get('name') == os.environ['DB_NAME']:
+                  print(d.get('id','')); break
+          ")"
+          [ -n "$DB_ID" ] || {
+            echo "::group::what /v1/postgres returned"; head -c 500 /tmp/pg_list.json; echo "::endgroup::"
+            echo "::error::could not find ${DB_NAME}"; exit 1; }
+          echo "$DB_ID" > /tmp/db_id
+
+          curl -fsS -H "Authorization: Bearer ${RENDER_API_KEY}" -H 'Accept: application/json' \
+            "https://api.render.com/v1/postgres/${DB_ID}" \
+            | python3 -c "
+          import sys, json
+          d = json.load(sys.stdin)
+          # \`or []\`: Render returns the key PRESENT and null when the list is
+          # empty, so a dict default would never fire.
+          print(json.dumps(d.get('ipAllowList') or []))" > /tmp/ip_allow_original.json
+
+          RUNNER_IP="$(curl -fsS --max-time 30 https://api.ipify.org)"
+          python3 - "$RUNNER_IP" > /tmp/allow.json <<'PY'
+          import json, sys
+          cur = json.load(open('/tmp/ip_allow_original.json')) or []
+          cur = [e for e in cur if e.get('cidrBlock') != f'{sys.argv[1]}/32']
+          cur.append({'cidrBlock': f'{sys.argv[1]}/32', 'description': 'demo seeding'})
+          print(json.dumps({'ipAllowList': cur}))
+          PY
+          curl -fsS -X PATCH -H "Authorization: Bearer ${RENDER_API_KEY}" \
+            -H 'Content-Type: application/json' --data @/tmp/allow.json \
+            "https://api.render.com/v1/postgres/${DB_ID}" >/dev/null
+
+          CONN="$(curl -fsS -H "Authorization: Bearer ${RENDER_API_KEY}" -H 'Accept: application/json' \
+            "https://api.render.com/v1/postgres/${DB_ID}/connection-info" \
+            | python3 -c "import sys,json;print(json.load(sys.stdin)['externalConnectionString'])")"
+          echo "::add-mask::$CONN"
+          printf '%s' "$CONN" > /tmp/dburl
+          echo "firewall open"
+
+      - name: Grant the three named partner memberships
+        run: |
+          set -euo pipefail
+          export DATABASE_URL="$(cat /tmp/dburl)"
+          PSQL="$(ls /usr/lib/postgresql/*/bin/psql | head -1)"
+          # -v, not shell interpolation into the SQL text: psql quotes the value
+          # where the script writes :'live_email', so an address containing a
+          # quote cannot alter the statement.
+          "$PSQL" -v ON_ERROR_STOP=1 "$DATABASE_URL" \
+            -v live_email="${LIVE_OWNER_EMAIL}" \
+            -f infrastructure/seed/grant_live_suite_partner_memberships.sql | tee /tmp/grant.txt
+
+      - name: Put it in the run summary
+        if: always()
+        run: |
+          {
+            echo "## Grant live-suite partner memberships — production"
+            echo ""
+            echo "Compare **BEFORE** and **AFTER**. AFTER must list four organisations:"
+            echo "the account's own workshop plus the three \`[AUDIT]\` partner ones."
+            echo ""
+            echo "\`0 granted\` with a passing gate is SUCCESS on a re-run — the writes"
+            echo "are idempotent through \`(organization_id, user_id, role_name)\`."
+            echo ""
+            echo "⚠️ This is half the fix. Roles are scoped to the ACTIVE organisation,"
+            echo "so these are reachable through the ORGANISATION switcher only. The"
+            echo "live suite must be re-run to turn the four A3 skips into passes."
+            echo ""
+            echo '```'
+            cat /tmp/grant.txt 2>/dev/null || echo "nothing was written"
+            echo '```'
+          } >> "$GITHUB_STEP_SUMMARY"
+
+      - name: Always restore the database firewall
+        if: always()
+        run: |
+          set -euo pipefail
+          [ -f /tmp/db_id ] && [ -f /tmp/ip_allow_original.json ] || { echo "nothing to restore"; exit 0; }
+          ID="$(cat /tmp/db_id)"
+          python3 -c "
+          import json
+          json.dump({'ipAllowList': json.load(open('/tmp/ip_allow_original.json')) or []},
+                    open('/tmp/restore.json','w'))"
+          curl -fsS -X PATCH -H "Authorization: Bearer ${RENDER_API_KEY}" \
+            -H 'Content-Type: application/json' --data @/tmp/restore.json \
+            "https://api.render.com/v1/postgres/${ID}" >/dev/null
+          echo "firewall restored"
+
+      - name: Always remove the credentials from the runner
+        if: always()
+        run: rm -f /tmp/dburl || true
diff --git a/apps/e2e/tests/live-signed-in.spec.ts b/apps/e2e/tests/live-signed-in.spec.ts
index ae43c9d..fe18eab 100644
--- a/apps/e2e/tests/live-signed-in.spec.ts
+++ b/apps/e2e/tests/live-signed-in.spec.ts
@@ -396,7 +396,7 @@ test.describe('the live site, signed in as the workshop owner', () => {
  * is not a defect.
  * ══════════════════════════════════════════════════════════════════════════
  */
-test.describe('the live site, signed in and acting in another role', () => {
+test.describe('the live site, signed in and acting in another organisation', () => {
   test.beforeAll(() => {
     test.skip(
       !OWNER_EMAIL || !OWNER_PASSWORD,
@@ -412,30 +412,42 @@ test.describe('the live site, signed in and acting in another role', () => {
    * locator timeout.
    */
   /**
-   * 🔴 THIS CHECK ANSWERED A3, AND THE ANSWER WAS NOT THE ONE EXPECTED.
+   * 🔴 THIS CHECK ANSWERED A3 — AND THEN THE ANSWER TURNED OUT TO BE ABOUT THE
+   * WRONG CONTROL.
    *
    * Run 32290511884: `getByLabel('Acting as role')` — ELEMENT NOT FOUND.
    * `RoleSwitcher` returns `null` when the viewer holds fewer than two roles
-   * ("one role is not a choice"), so the control is absent, not broken.
+   * ("one role is not a choice"), so the control was absent, not broken. The
+   * conclusion drawn was that the CI identity holds one role, and
+   * `diagnose-live-identity-roles.yml` run 32293446882 asked production and
+   * CONFIRMED it: one active membership, `workshop_owner`.
    *
-   * ▶ THE CI IDENTITY HOLDS ONE ROLE. `LIVE_OWNER_EMAIL` is a dedicated test
-   *   account, not the operator's own `marc667us@yahoo.com`, which holds seven
-   *   roles in one tenant. **So the signed-in half of this suite STRUCTURALLY
-   *   CANNOT verify any partner-role screen** — insurance, towing or fleet — no
-   *   matter how many times it runs. A3 was not merely unmet; it was
-   *   unmeetable by this harness.
+   * ▶ BUT THE PRESCRIBED FIX — "give the CI identity memberships in the
+   *   `[AUDIT]` organisations" — WOULD HAVE LEFT THIS CHECK SKIPPING ANYWAY,
+   *   and that is the thing worth remembering:
    *
-   * ⚠️ THAT IS A FIXTURE GAP, NOT A PRODUCT DEFECT, so this is a SKIP and not a
-   * failure — and a LOUD one. A red would say something is broken when nothing
-   * is; a silent skip would hide that four screens are unverified. Passed,
-   * failed and SKIPPED are three states here, and a skip must be said out loud.
+   *     viewer-contract.ts:470   if (m.organizationId !== organizationId) continue;
    *
-   * ▶ WHAT WOULD CLOSE IT: give the CI identity memberships in the `[AUDIT]`
-   *   insurance, towing and fleet organisations — the same organisations the
-   *   operator already uses to reach those trees. Then this check and the three
-   *   below start asserting instead of skipping.
+   *   `rolesFromMemberships` is SCOPED TO THE ACTIVE ORGANISATION, on purpose.
+   *   Every request carries `x-organization-id` AND `x-role-name` and
+   *   `resolveTenantContext` requires ONE membership matching BOTH, so a role
+   *   held in a DIFFERENT organisation is never offered here — offering it
+   *   would offer a pair the API refuses. The `[AUDIT]` organisations are in
+   *   the operator's tenant; the live-suite account is in its own. So the role
+   *   switcher can never be the control that reaches them.
+   *
+   * ▶ THE CONTROL THAT CROSSES ORGANISATIONS IS THE ORGANISATION SWITCHER.
+   *   `organizationsFromMemberships` does NOT filter by tenant, and
+   *   `setActiveOrganizationAction` CLEARS the stored role on the way out so
+   *   the API re-defaults to the strongest role held in the organisation just
+   *   entered. That is why this check now drives that control instead.
+   *
+   * ⚠️ IT STILL SKIPS RATHER THAN FAILS WHEN THE MEMBERSHIPS ARE ABSENT. That
+   * is a fixture gap, not a product defect — a red would say something is
+   * broken when nothing is, and a silent skip would hide that four screens are
+   * unverified. Passed, failed and SKIPPED are three states here.
    */
-  test('the role switcher offers the partner roles', async ({ page }) => {
+  test('the organisation switcher offers the partner organisations', async ({ page }) => {
     await signIn(page);
 
     // Asserted first and separately: the shell DID resolve a viewer. Without
@@ -445,53 +457,65 @@ test.describe('the live site, signed in and acting in another role', () => {
       timeout: 60_000,
     });
 
-    const switcher = page.getByLabel('Acting as role');
+    // ⚠️ `Active organization` — the LABEL's spelling, which is American while
+    // the prose here is not. Matching the prose would silently find nothing.
+    const switcher = page.getByLabel('Active organization');
     const hasSwitcher = (await switcher.count()) > 0;
 
     test.skip(
       !hasSwitcher,
-      'A3 UNANSWERED: this CI identity holds ONE role, so the role switcher is ' +
-        'not rendered and the insurance, towing and fleet screens CANNOT be ' +
-        'verified by a signed-in viewer here. Not a product defect and not a ' +
-        'pass. Fix: give LIVE_OWNER_EMAIL memberships in the [AUDIT] partner ' +
-        'organisations.',
+      'A3 UNANSWERED: this CI identity belongs to ONE organisation, so the ' +
+        'organisation switcher is not rendered and the insurance, towing and ' +
+        'fleet screens CANNOT be reached by a signed-in viewer here. Not a ' +
+        'product defect and not a pass. Fix: run ' +
+        'grant-live-suite-partner-memberships.yml -f confirm=APPLY.',
     );
 
-    const roles = await switcher.locator('option').allTextContents();
+    const orgs = await switcher.locator('option').allTextContents();
     // Printed, not just asserted — the run log is where the next reader learns
     // what this account actually holds, and the live-suite job reads its logs.
     // An annotation would land in the HTML report, which nothing in CI opens.
     // eslint-disable-next-line no-console -- the OUTPUT is this check's deliverable
-    console.log(`A3: the owner can act as: ${roles.join(', ')}`);
+    console.log(`A3: the account belongs to: ${orgs.join(', ')}`);
 
-    expect(roles.join(' ').toLowerCase()).toContain('insurance');
+    expect(orgs.join(' ').toLowerCase()).toContain('insurance');
   });
 
   /**
-   * ⚠️ SWITCHING ROLE ALSO NAVIGATES. `setActiveRoleAction` used to revalidate
-   * IN PLACE, which stranded the owner on a pack they no longer held the
-   * permission for — ADR-021's third instance, fixed on 2026-08-16 by routing
-   * through `homeWorkspaceFor()`. So after choosing a role the test waits for
-   * the destination rather than assuming the current page re-rendered.
+   * Enter a partner workspace by switching ORGANISATION, and say whether it
+   * was possible.
+   *
+   * 🔴 WHY ORGANISATION AND NOT ROLE. `rolesFromMemberships` filters to the
+   * ACTIVE organisation, so a role held only in another organisation is never
+   * in the role switcher — the earlier `actAs` could not have reached the
+   * `[AUDIT]` organisations however many memberships were granted. The
+   * organisation switcher is unfiltered by tenant, and
+   * `setActiveOrganizationAction` deletes the stored role cookie before
+   * redirecting to `/`, so the API re-resolves the STRONGEST role held in the
+   * organisation just entered (`ROLE_PRECEDENCE`). Switching organisation is
+   * therefore sufficient on its own, and switching role afterwards would be
+   * both unnecessary and — inside a single-role organisation, where the
+   * switcher is absent — impossible.
+   *
+   * ⚠️ SWITCHING ALSO NAVIGATES, to `/`, which dispatches to the new role's
+   * home pack. The caller's own `page.goto` follows, so this only has to wait
+   * for the switch to settle rather than assert where it landed.
+   *
+   * 🔴 COUNT, DO NOT WAIT — kept from the fix on 2026-08-19. The first version
+   * of this helper called `waitFor({ state: 'visible' })` on a control whose
+   * ABSENCE is the expected case, which THROWS after 60s, so it could never
+   * return `false` and the callers' skip branch was unreachable. The suite went
+   * red twice for a fixture gap the checks were written to skip on. Absence
+   * must be a value this returns, never an exception it raises.
    */
-  async function actAs(page: import('@playwright/test').Page, match: RegExp) {
-    const switcher = page.getByLabel('Acting as role');
-    // 🔴 COUNT, DO NOT WAIT. The first version called
-    // `waitFor({ state: 'visible' })`, which THROWS after 60s when the control
-    // is absent — so this helper could never return `false`, and the callers'
-    // "skip when the role is missing" branch was unreachable. The suite went
-    // red for a fixture gap the checks were written to skip on.
-    //
-    // Absence is the EXPECTED case for a single-role identity (`RoleSwitcher`
-    // renders nothing below two roles), so it must be a value this function can
-    // return, not an exception it raises.
+  async function actInOrganization(page: import('@playwright/test').Page, match: RegExp) {
+    const switcher = page.getByLabel('Active organization');
     if ((await switcher.count()) === 0) return false;
     const options = await switcher.locator('option').all();
     for (const o of options) {
       const label = (await o.textContent()) ?? '';
       if (match.test(label)) {
         await switcher.selectOption({ label });
-        // The switch navigates to that role's home workspace.
         await page.waitForLoadState('networkidle', { timeout: 120_000 });
         return true;
       }
@@ -501,12 +525,12 @@ test.describe('the live site, signed in and acting in another role', () => {
 
   test('an insurance owner reaches their own users screen', async ({ page }) => {
     await signIn(page);
-    const switched = await actAs(page, /insurance/i);
+    const switched = await actInOrganization(page, /insurance/i);
     // Same fixture gap as the switcher check above — skipped loudly, never
     // silently, because "unverified" and "verified" must not look alike.
     test.skip(
       !switched,
-      'A3 UNANSWERED: this CI identity cannot act as an insurance owner, so ' +
+      'A3 UNANSWERED: this CI identity belongs to no insurance organisation, so ' +
         '/insurance/settings/users is UNVERIFIED by a signed-in viewer.',
     );
 
@@ -527,11 +551,11 @@ test.describe('the live site, signed in and acting in another role', () => {
     page,
   }) => {
     await signIn(page);
-    const switched = await actAs(page, /insurance/i);
+    const switched = await actInOrganization(page, /insurance/i);
     test.skip(
       !switched,
-      'A3 UNANSWERED: this CI identity cannot act as an insurance owner, so the ' +
-        'enquiry inbox on My Products is UNVERIFIED by a signed-in viewer.',
+      'A3 UNANSWERED: this CI identity belongs to no insurance organisation, so ' +
+        'the enquiry inbox on My Products is UNVERIFIED by a signed-in viewer.',
     );
 
     await page.goto(`${APEX}/insurance/sales/my-products`, { timeout: 120_000 });
@@ -554,11 +578,12 @@ test.describe('the live site, signed in and acting in another role', () => {
    */
   test('a fleet administrator reaches the fleet screens built in slice 20', async ({ page }) => {
     await signIn(page);
-    const switched = await actAs(page, /fleet/i);
+    const switched = await actInOrganization(page, /fleet/i);
     test.skip(
       !switched,
-      'this account holds no fleet role, so slice 20 is UNSEEN by a signed-in ' +
-        'viewer. Not a pass — the screens are proven only by build and unit tests.',
+      'this account belongs to no fleet organisation, so slice 20 is UNSEEN by a ' +
+        'signed-in viewer. Not a pass — the screens are proven only by build and ' +
+        'unit tests.',
     );
 
     await page.goto(`${APEX}/fleet/fleet-assets/vehicles`, { timeout: 120_000 });
diff --git a/infrastructure/seed/grant_live_suite_partner_memberships.sql b/infrastructure/seed/grant_live_suite_partner_memberships.sql
new file mode 100644
index 0000000..28d996a
--- /dev/null
+++ b/infrastructure/seed/grant_live_suite_partner_memberships.sql
@@ -0,0 +1,258 @@
+-- One-off: let the live-suite identity REACH the partner workspaces.
+--
+-- ══════════════════════════════════════════════════════════════════════════
+-- 🔴 WHAT THIS CLOSES — A3, AND ONLY HALF OF IT.
+--
+-- `diagnose-live-identity-roles.yml` run 32293446882 asked production rather
+-- than inferring, and the inference held:
+--
+--   live-owner@aiappinvent.com   1 active membership   1 active role
+--                                roles: workshop_owner
+--   marc667us@yahoo.com          7 active memberships  7 active roles
+--
+-- So the signed-in half of the live suite holds ONE role and `RoleSwitcher`
+-- renders nothing below two. Four A3 checks skip, and four screens built in
+-- slices 17 and 20 are unverified by any signed-in viewer.
+--
+-- The three `[AUDIT]` partner organisations are the ones the operator already
+-- uses, and each has exactly one member — the operator:
+--
+--   [AUDIT] Insurance Company  d7d30afd-…  insurance_company  insurance_owner
+--   [AUDIT] Towing Company     c5c43056-…  towing_company     towing_owner
+--   [AUDIT] Fleet Operator     f9dc95da-…  fleet_operator     fleet_administrator
+--
+-- All three live in tenant 7adce423-8a76-49f0-8174-7b40b66ef8c5. The live-suite
+-- account lives in its OWN tenant, so these memberships are deliberately
+-- CROSS-TENANT — which `identity.memberships` represents natively (`users` is
+-- not tenant-scoped, by the comment in migration 001) and which the operator's
+-- own account does not exercise, because all seven of its roles sit in one
+-- tenant.
+--
+-- ── 🔴 WHY GRANTING THE MEMBERSHIPS IS NOT, BY ITSELF, THE FIX ────────────
+--
+-- The resume pointer prescribed exactly this write and stopped there. Read
+-- against source, that would have been INERT:
+--
+--   viewer-contract.ts:470   if (m.organizationId !== organizationId) continue;
+--
+-- `rolesFromMemberships` is SCOPED TO THE ACTIVE ORGANISATION, deliberately —
+-- every request sends `x-organization-id` AND `x-role-name` together and
+-- `resolveTenantContext` requires ONE membership matching BOTH, so offering a
+-- role held only elsewhere would offer a pair the API refuses. A role held in
+-- another organisation therefore NEVER appears in the role switcher, no matter
+-- how many memberships this script writes.
+--
+-- ▶ The control that crosses organisations is the ORGANISATION switcher, and
+--   changing organisation CLEARS the stored role (`set-organization-action.ts`)
+--   so the API re-defaults to the strongest role held in the new organisation.
+--   The harness change is in `apps/e2e/tests/live-signed-in.spec.ts`, and
+--   WITHOUT IT this script changes nothing a test can observe.
+--
+-- ── ⚠️ WHY THE DEFAULT LANDING DOES NOT MOVE ─────────────────────────────
+--
+-- `resolveTenantContext` defaults by ROLE AUTHORITY first, organisation id only
+-- as a tie-break. In `ROLE_PRECEDENCE`, `workshop_owner` is index 1 and outranks
+-- `supplier_owner`(2), `fleet_administrator`(3), `insurance_owner`(4) and
+-- `towing_owner`(5); only `platform_administrator`(0) beats it. So after this
+-- runs, the live-suite account still signs in to its own workshop, and the four
+-- currently-passing signed-in checks keep passing. That was checked BEFORE
+-- writing, because adding memberships to the account the suite signs in as is
+-- exactly the kind of change that turns a green suite red for a reason nobody
+-- expects.
+--
+-- ── ⚠️ THE E-MAIL IS NOT HARDCODED HERE ──────────────────────────────────
+--
+-- `LIVE_OWNER_EMAIL` is a repository secret. This script takes it as
+-- `:live_email` from the workflow, which reads the SAME secret the live suite
+-- signs in with — so the account provisioned, the account granted and the
+-- account tested cannot drift apart. A literal in this file could.
+--
+-- ⚠️ AND IT IS RE-EXPORTED AS A GUC IMMEDIATELY BELOW, WHICH IS NOT
+-- REDUNDANT. psql substitutes `:'live_email'` in ordinary statement text but
+-- NOT inside dollar-quoted bodies, so a `:'live_email'` written inside the
+-- `DO $grant$ … $grant$` block below would be sent to the server verbatim and
+-- fail to parse. The blocks read `current_setting('live.email')` instead.
+--
+-- 🔴 EVERY WRITE IS GUARDED BY THE FULL SHAPE THAT WAS MEASURED — organisation
+-- id, tenant id, org_type, active status — and is idempotent through the
+-- natural key. If production has moved since the diagnostic, nothing is written
+-- and the gate says so rather than reporting success.
+-- ══════════════════════════════════════════════════════════════════════════
+
+\pset pager off
+\set ON_ERROR_STOP on
+
+BEGIN;
+
+-- Transaction-local: this IS one transaction, so `true` is correct. The
+-- diagnostic needed `false` because each of its statements was its own
+-- transaction; copying that here would leak the setting past COMMIT.
+SELECT set_config('app.current_role', 'admin', true) AS platform_context;
+
+-- The e-mail, carried across the dollar-quoting boundary. `true` again: it must
+-- not outlive this transaction.
+SELECT set_config('live.email', :'live_email', true) AS live_email;
+
+\echo ''
+\echo '=== BEFORE — what the live-suite identity holds ==='
+SELECT u.email, o.name AS organization, o.org_type, m.role_name, m.status
+  FROM identity.users u
+  LEFT JOIN identity.memberships m   ON m.user_id = u.id
+  LEFT JOIN identity.organizations o ON o.id = m.organization_id
+ WHERE u.email = :'live_email'
+ ORDER BY o.name;
+
+DO $grant$
+DECLARE
+    -- Measured 2026-08-19 by diagnose-live-identity-roles.yml run 32293446882.
+    v_tenant    uuid := '7adce423-8a76-49f0-8174-7b40b66ef8c5';
+    v_ins_org   uuid := 'd7d30afd-a615-4c0b-a8d2-fa61c44570bb';
+    v_tow_org   uuid := 'c5c43056-8920-47c9-8735-2d52e8ee3115';
+    v_fleet_org uuid := 'f9dc95da-d225-49b2-a4ed-adae414e2b2d';
+    v_email     text := current_setting('live.email', true);
+    v_user      uuid;
+    v_changed   int;
+    v_total     int := 0;
+BEGIN
+    IF v_email IS NULL OR v_email = '' THEN
+        RAISE EXCEPTION 'live.email is not set — the workflow did not pass '
+                        '-v live_email, so this script does not know which account '
+                        'to grant. Refusing rather than guessing.';
+    END IF;
+
+    -- ── resolve the account, and REFUSE on anything but exactly one ───────
+    -- A LIKE or a "first match" here could grant partner authority to the
+    -- wrong person. `identity.users` is not tenant-scoped, so an e-mail is the
+    -- only handle — it must therefore resolve to exactly one active row or
+    -- this stops.
+    SELECT id INTO v_user
+      FROM identity.users
+     WHERE email = v_email AND status = 'active';
+
+    IF v_user IS NULL THEN
+        RAISE EXCEPTION 'no ACTIVE identity.users row with e-mail %. LIVE_OWNER_EMAIL '
+                        'names an account that does not exist on production — run '
+                        'provision-live-suite-account.yml first, or the secret is wrong.',
+                        v_email;
+    END IF;
+
+    RAISE NOTICE 'granting partner memberships to % (%)', v_email, v_user;
+
+    -- ── the three grants ─────────────────────────────────────────────────
+    -- One statement per organisation rather than a loop over a VALUES list:
+    -- each names its own org_type, so a mistyped pairing (a towing role into
+    -- the insurance organisation) cannot insert anything. A loop would make
+    -- all three share one predicate and lose exactly that check.
+    --
+    -- `ON CONFLICT` on the natural key `(organization_id, user_id, role_name)`
+    -- makes a re-run a no-op, so `0 granted` on the second run is SUCCESS.
+    --
+    -- `created_by` is left NULL, deliberately. Naming a grantor would write a
+    -- claim about history this script cannot establish — the same reasoning
+    -- that made repair_audit_org_founders.sql set the role rather than
+    -- backfill `created_by`. The existing [AUDIT] rows are NULL too.
+    --
+    -- `tenant_id` comes from the ORGANISATION ROW, never from a literal or from
+    -- the user's own tenant. A membership whose tenant disagrees with its
+    -- organisation is the shape RLS cannot express and every join would then
+    -- silently drop.
+    INSERT INTO identity.memberships (tenant_id, organization_id, user_id, role_name, status)
+    SELECT o.tenant_id, o.id, v_user, 'insurance_owner', 'active'
+      FROM identity.organizations o
+     WHERE o.id        = v_ins_org
+       AND o.tenant_id = v_tenant
+       AND o.org_type  = 'insurance_company'
+       AND o.status    = 'active'
+    ON CONFLICT (organization_id, user_id, role_name) DO NOTHING;
+    GET DIAGNOSTICS v_changed = ROW_COUNT;
+    RAISE NOTICE 'insurance: % membership(s) granted', v_changed;
+    v_total := v_total + v_changed;
+
+    INSERT INTO identity.memberships (tenant_id, organization_id, user_id, role_name, status)
+    SELECT o.tenant_id, o.id, v_user, 'towing_owner', 'active'
+      FROM identity.organizations o
+     WHERE o.id        = v_tow_org
+       AND o.tenant_id = v_tenant
+       AND o.org_type  = 'towing_company'
+       AND o.status    = 'active'
+    ON CONFLICT (organization_id, user_id, role_name) DO NOTHING;
+    GET DIAGNOSTICS v_changed = ROW_COUNT;
+    RAISE NOTICE 'towing: % membership(s) granted', v_changed;
+    v_total := v_total + v_changed;
+
+    INSERT INTO identity.memberships (tenant_id, organization_id, user_id, role_name, status)
+    SELECT o.tenant_id, o.id, v_user, 'fleet_administrator', 'active'
+      FROM identity.organizations o
+     WHERE o.id        = v_fleet_org
+       AND o.tenant_id = v_tenant
+       AND o.org_type  = 'fleet_operator'
+       AND o.status    = 'active'
+    ON CONFLICT (organization_id, user_id, role_name) DO NOTHING;
+    GET DIAGNOSTICS v_changed = ROW_COUNT;
+    RAISE NOTICE 'fleet: % membership(s) granted', v_changed;
+    v_total := v_total + v_changed;
+
+    RAISE NOTICE 'total granted this run: % (0 on a re-run is expected)', v_total;
+END;
+$grant$;
+
+-- ── THE GATE: assert the END STATE, not the row count ─────────────────────
+--
+-- 🔴 THIS IS WHAT MAKES THE WRITE MEANINGFUL. Inserting rows is not the goal;
+-- the goal is that a signed-in viewer can REACH the insurance, towing and fleet
+-- workspaces. So the end state is asserted here and the transaction ROLLS BACK
+-- if it is not true — rather than reporting success and leaving the live suite
+-- to skip again twenty minutes later.
+--
+-- It asserts the ORGANISATION count as well as the roles, because the
+-- organisation switcher is the control the harness actually drives and it too
+-- renders nothing below two options.
+DO $gate$
```
codex
I’ll inspect the requirement, implementation log, full commit diff, and the surrounding product/test code. I’ll keep this review read-only and report only actionable defects with precise locations.
2026-08-19T20:03:15.501915Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content README.md; if (Test-Path docs/IMPLEMENTATION_LOG.md) { Get-Content docs/IMPLEMENTATION_LOG.md }; git diff --unified=80 HEAD~1..HEAD -- .github/workflows/diagnose-live-identity-roles.yml .github/workflows/grant-live-suite-partner-memberships.yml apps/e2e/tests/live-signed-in.spec.ts infrastructure/seed/grant_live_suite_partner_memberships.sql; rg -n \"Active organization|setActiveOrganizationAction|organizationsFromMemberships|rolesFromMemberships|identity.memberships|CREATE TABLE.*memberships|UNIQUE.*organization_id|live-signed-in|A3|grant-live-suite\" . --glob '"'!reviews/codex-review.md'"'"` rejected: blocked by policy
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content README.md; if (Test-Path docs/IMPLEMENTATION_LOG.md) { Get-Content docs/IMPLEMENTATION_LOG.md }; git diff --unified=80 HEAD~1..HEAD -- .github/workflows/diagnose-live-identity-roles.yml .github/workflows/grant-live-suite-partner-memberships.yml apps/e2e/tests/live-signed-in.spec.ts infrastructure/seed/grant_live_suite_partner_memberships.sql; rg -n \"Active organization|setActiveOrganizationAction|organizationsFromMemberships|rolesFromMemberships|identity.memberships|CREATE TABLE.*memberships|UNIQUE.*organization_id|live-signed-in|A3|grant-live-suite\" . --glob '"'!reviews/codex-review.md'"'" in C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content README.md; if (Test-Path docs/IMPLEMENTATION_LOG.md) { Get-Content docs/IMPLEMENTATION_LOG.md }; git diff --unified=80 HEAD~1..HEAD -- .github/workflows/diagnose-live-identity-roles.yml .github/workflows/grant-live-suite-partner-memberships.yml apps/e2e/tests/live-signed-in.spec.ts infrastructure/seed/grant_live_suite_partner_memberships.sql; rg -n \"Active organization|setActiveOrganizationAction|organizationsFromMemberships|rolesFromMemberships|identity.memberships|CREATE TABLE.*memberships|UNIQUE.*organization_id|live-signed-in|A3|grant-live-suite\" . --glob '"'!reviews/codex-review.md'"'"` rejected: blocked by policy
codex
The combined read was rejected by the workspace policy, so I’m splitting it into narrower read-only inspections. No repository changes are being made.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content README.md' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 615ms:
# AutoWorkshop AI

**The Complete AI-Powered Automotive Service, Repair and Workshop Operating System.**

Live target: [`autoworkshop.aiappinvent.com`](https://autoworkshop.aiappinvent.com) Â· Status: **Phase 5 â€” Release 0.4 (workshop + repair), in progress**

> âš ï¸ **`master` IS NOT DEPLOYABLE AS IT STANDS.** Workshop registration returns
> 500 in production until migration **037** is applied â€” `register_workshop`
> runs as a non-superuser there, where `FORCE ROW LEVEL SECURITY` applies to
> table owners. The fix is committed and verified; applying it is one workflow
> run, recorded in `.claude/CURRENT_TASK.md`. Everything else on `master` is
> green. This banner comes down when that workflow has run.
>
> `.claude/CURRENT_PHASE.md` carries the detailed phase state; this line is the
> release-level summary and the two must agree.

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

2026-08-19T20:03:21.742976Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "if (Test-Path docs/IMPLEMENTATION_LOG.md) { Get-Content docs/IMPLEMENTATION_LOG.md } else { Write-Output 'NO_IMPLEMENTATION_LOG' }"` rejected: blocked by policy
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "if (Test-Path docs/IMPLEMENTATION_LOG.md) { Get-Content docs/IMPLEMENTATION_LOG.md } else { Write-Output 'NO_IMPLEMENTATION_LOG' }" in C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "if (Test-Path docs/IMPLEMENTATION_LOG.md) { Get-Content docs/IMPLEMENTATION_LOG.md } else { Write-Output 'NO_IMPLEMENTATION_LOG' }"` rejected: blocked by policy
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -LiteralPath README.md' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 529ms:
# AutoWorkshop AI

**The Complete AI-Powered Automotive Service, Repair and Workshop Operating System.**

Live target: [`autoworkshop.aiappinvent.com`](https://autoworkshop.aiappinvent.com) Â· Status: **Phase 5 â€” Release 0.4 (workshop + repair), in progress**

> âš ï¸ **`master` IS NOT DEPLOYABLE AS IT STANDS.** Workshop registration returns
> 500 in production until migration **037** is applied â€” `register_workshop`
> runs as a non-superuser there, where `FORCE ROW LEVEL SECURITY` applies to
> table owners. The fix is committed and verified; applying it is one workflow
> run, recorded in `.claude/CURRENT_TASK.md`. Everything else on `master` is
> green. This banner comes down when that workflow has run.
>
> `.claude/CURRENT_PHASE.md` carries the detailed phase state; this line is the
> release-level summary and the two must agree.

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

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -LiteralPath docs/IMPLEMENTATION_LOG.md' in C:\Users\USER\Documents\autoworkshop-ai
2026-08-19T20:03:29.808194Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 1.6 seconds
Output:
Get-Content : Cannot find path 'docs/IMPLEMENTATION_LOG.md' because it does not exist.
At line:2 char:1
+ Get-Content -LiteralPath docs/IMPLEMENTATION_LOG.md
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : ObjectNotFound: (docs/IMPLEMENTATION_LOG.md:String) [Get-Content], ItemNotFoundException
    + FullyQualifiedErrorId : PathNotFound,Microsoft.PowerShell.Commands.GetContentCommand
 

 exited 1 in 1634ms:
Get-Content : Cannot find path 'docs/IMPLEMENTATION_LOG.md' because it does not exist.
At line:2 char:1
+ Get-Content -LiteralPath docs/IMPLEMENTATION_LOG.md
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : ObjectNotFound: (docs/IMPLEMENTATION_LOG.md:String) [Get-Content], ItemNotFoundException
    + FullyQualifiedErrorId : PathNotFound,Microsoft.PowerShell.Commands.GetContentCommand
 

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git diff --unified=25 HEAD~1..HEAD -- apps/e2e/tests/live-signed-in.spec.ts infrastructure/seed/grant_live_suite_partner_memberships.sql .github/workflows/grant-live-suite-partner-memberships.yml .github/workflows/diagnose-live-identity-roles.yml' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 503ms:
diff --git a/.github/workflows/diagnose-live-identity-roles.yml b/.github/workflows/diagnose-live-identity-roles.yml
index 9dd727d..6cdc6a0 100644
--- a/.github/workflows/diagnose-live-identity-roles.yml
+++ b/.github/workflows/diagnose-live-identity-roles.yml
@@ -124,56 +124,64 @@ jobs:
           PY
           curl -fsS -X PATCH -H "Authorization: Bearer ${RENDER_API_KEY}" \
             -H 'Content-Type: application/json' --data @/tmp/allow.json \
             "https://api.render.com/v1/postgres/${DB_ID}" >/dev/null
 
           CONN="$(curl -fsS -H "Authorization: Bearer ${RENDER_API_KEY}" -H 'Accept: application/json' \
             "https://api.render.com/v1/postgres/${DB_ID}/connection-info" \
             | python3 -c "import sys,json;print(json.load(sys.stdin)['externalConnectionString'])")"
           echo "::add-mask::$CONN"
           printf '%s' "$CONN" > /tmp/dburl
           echo "firewall open"
 
       - name: Ask production what the live-suite identity can act as
         run: |
           set -euo pipefail
           export DATABASE_URL="$(cat /tmp/dburl)"
           PSQL="$(ls /usr/lib/postgresql/*/bin/psql | head -1)"
           "$PSQL" -v ON_ERROR_STOP=1 "$DATABASE_URL"             -f infrastructure/seed/diagnose_live_identity_roles.sql | tee /tmp/identity.txt
 
       - name: Put it in the run summary
         if: always()
         run: |
           {
             echo "## Live-suite identity roles — production"
             echo ""
-            echo "Read section 2. A membership with **is_earliest = t** and"
-            echo "**is_self_created = f** means the organisation's FIRST member was"
-            echo "created by somebody else, so 085 correctly refuses to promote a"
-            echo "later self-created assessor into an administrator."
+            echo "⚠️ This prose used to describe **is_earliest** and **is_self_created**,"
+            echo "columns this workflow's SQL has never emitted — it was copied from"
+            echo "\`repair-audit-org-founders.yml\` along with the firewall boilerplate."
+            echo "A summary naming columns that are not in the output below is the same"
+            echo "stale-artifact failure recorded on 08-19 for I7."
             echo ""
-            echo "Section 3 separates a real registration from a hand-seeded fixture:"
-            echo "a fixture can be corrected or removed, a real customer cannot."
+            echo "**Section 1 is the answer.** \`active_roles\` per candidate: 1 means that"
+            echo "account cannot verify a partner screen, because \`RoleSwitcher\` renders"
+            echo "nothing below two roles."
+            echo ""
+            echo "**Section 2** lists the \`[AUDIT]\` partner organisations and their members —"
+            echo "the memberships a CI identity would need for the A3 checks to assert."
+            echo ""
+            echo "**Section 3**: if \`fleet_orgs = 0\`, slice 20's nine screens are unreachable"
+            echo "by any signed-in viewer, which is a larger finding than the switcher one."
             echo ""
             echo '```'
             cat /tmp/identity.txt 2>/dev/null || echo "nothing was read"
             echo '```'
           } >> "$GITHUB_STEP_SUMMARY"
 
       - name: Always restore the database firewall
         if: always()
         run: |
           set -euo pipefail
           [ -f /tmp/db_id ] && [ -f /tmp/ip_allow_original.json ] || { echo "nothing to restore"; exit 0; }
           ID="$(cat /tmp/db_id)"
           python3 -c "
           import json
           json.dump({'ipAllowList': json.load(open('/tmp/ip_allow_original.json')) or []},
                     open('/tmp/restore.json','w'))"
           curl -fsS -X PATCH -H "Authorization: Bearer ${RENDER_API_KEY}" \
             -H 'Content-Type: application/json' --data @/tmp/restore.json \
             "https://api.render.com/v1/postgres/${ID}" >/dev/null
           echo "firewall restored"
 
       - name: Always remove the credentials from the runner
         if: always()
         run: rm -f /tmp/dburl || true
diff --git a/.github/workflows/grant-live-suite-partner-memberships.yml b/.github/workflows/grant-live-suite-partner-memberships.yml
new file mode 100644
index 0000000..9828f01
--- /dev/null
+++ b/.github/workflows/grant-live-suite-partner-memberships.yml
@@ -0,0 +1,235 @@
+# Grant the live-suite identity its partner-workspace memberships — CLOSING A3.
+#
+# ══════════════════════════════════════════════════════════════════════════
+# 🔴 WHAT THIS IS FOR. `diagnose-live-identity-roles.yml` run 32293446882 asked
+# production instead of inferring, and confirmed the inference: the account the
+# live suite signs in as holds ONE active role (`workshop_owner`). So four A3
+# checks SKIP, and four screens shipped in slices 17 and 20 are unverified by
+# any signed-in viewer.
+#
+# This grants that account `insurance_owner`, `towing_owner` and
+# `fleet_administrator` in the three `[AUDIT]` organisations the operator
+# already uses. The ids were MEASURED, not inferred, and every write is guarded
+# by the full shape that was measured.
+#
+# ⚠️ IT IS ONLY HALF THE FIX, AND THE SQL SAYS SO AT LENGTH. Roles are scoped to
+# the ACTIVE ORGANISATION (`rolesFromMemberships`), so these memberships are
+# reachable through the ORGANISATION switcher and never through the role
+# switcher. The harness half is in `apps/e2e/tests/live-signed-in.spec.ts`.
+# Running this workflow alone changes nothing any test can observe.
+#
+# ⚠️ THIS WRITES REAL PRODUCTION DATA — three membership rows on a live
+# database. It is idempotent through the natural key, so a re-run grants zero
+# and that is success, and the transaction ROLLS BACK unless the end state it
+# exists to produce is actually true.
+#
+# ⚠️ THE ACCOUNT IS NEVER NAMED HERE. It comes from `LIVE_OWNER_EMAIL`, the same
+# repository secret the live suite signs in with, so the account granted and the
+# account tested cannot drift apart.
+#
+# 🔴 `-f confirm=APPLY` OR THIS ONLY REPORTS. The firewall handling and the
+# shared concurrency group are copied verbatim from the workflows that already
+# open the production database — see the A6 note below.
+# ══════════════════════════════════════════════════════════════════════════
+
+name: Grant live-suite partner memberships
+
+on:
+  workflow_dispatch:
+    inputs:
+      confirm:
+        description: 'Type APPLY to grant the three memberships. Anything else reports and stops.'
+        required: false
+        default: ''
+
+permissions:
+  contents: read
+
+concurrency:
+  # A6 — ALL of these open the production database firewall by PATCHing the
+  # WHOLE ipAllowList, so they must never overlap. Render has no atomic
+  # per-entry operation, so every capture/add/restore is a read-modify-write on
+  # one shared resource. It races at least THREE ways:
+  #   1. FILTERED CAPTURE (apply-migrations, backup-production-db,
+  #      rehearse-migration) drops every entry containing 'ephemeral:' when
+  #      building its snapshot. It cannot tell a dead run's entry from a LIVE
+  #      one's, so it deletes a running job's entry the moment it starts.
+  #   2. UNFILTERED RESTORE (the other twelve) restores a snapshot taken before
+  #      another run added its entry, deleting it on the way out.
+  #   3. CONCURRENT ADD (any two unfiltered runs) — both GET the same original
+  #      list, then both PATCH 'original + mine'. The second add deletes the
+  #      first run's entry before either restore happens.
+  #   (and mixed order can RESURRECT a stale entry: an unfiltered run snapshots
+  #    a foreign ephemeral entry and restores it after its owner removed it.)
+  # The victim fails with 'SSL connection has been closed unexpectedly', which
+  # is a LIE about the cause and reads as a database outage. At least six failed
+  # runs on 2026-08-14 were this.
+  #
+  # ⚠️ A RETRY IS NOT A FIX — five retries failed identically, because the entry
+  # stays deleted. And "remove only MY entry" is still racy: the API takes the
+  # whole list.
+  #
+  # 🔴 THE COST OF THIS MUTEX, STATED PLAINLY — GITHUB'S WAITING ROOM HOLDS ONE.
+  # A concurrency group is NOT a fifteen-deep FIFO queue. GitHub keeps at most
+  # ONE pending run per group and REPLACES it when a newer one arrives, with no
+  # ordering guarantee. So a pending deploy-api, migration APPLY, seed or backup
+  # can be silently discarded by a newer arrival — and apply-migrations runs
+  # automatically after EVERY Release, so automatic inspections compete with
+  # deliberate operator requests. A cancelled PENDING run is firewall-safe (it
+  # never opened anything) but the REQUEST IS LOST, not merely delayed.
+  # ▶ THEREFORE: after dispatching any of these, capture the run id and confirm
+  #   it actually STARTED. `gh run list --workflow=<wf> -L 3 --json databaseId,status`
+  #   A 'cancelled' run you did not cancel is an evicted request — re-dispatch it.
+  #
+  # ⚠️ cancel-in-progress MUST stay false: cancelling a run mid-window would
+  # leave its ephemeral entry live on the production firewall. But it does NOT
+  # close every such path — a job timeout, a manual/API cancellation or runner
+  # loss can still kill a run between its add PATCH and its restore step, and an
+  # `if: always()` restore is not a reliable finally block against those. The
+  # filtered-capture workflows clean up a stale entry on their next run; until
+  # then the exposure is real.
+  group: production-db-firewall
+  cancel-in-progress: false
+
+jobs:
+  grant:
+    runs-on: ubuntu-latest
+    timeout-minutes: 15
+    env:
+      RENDER_API_KEY: ${{ secrets.RENDER_API_KEY }}
+      DB_NAME: autoworkshop-postgres
+      # The SAME secret the live suite signs in with. Reading it here is what
+      # stops the account granted and the account tested drifting apart.
+      LIVE_OWNER_EMAIL: ${{ secrets.LIVE_OWNER_EMAIL }}
+    steps:
+      - uses: actions/checkout@v4
+
+      # 🔴 THE GATE IS FIRST, AND IT EXITS RATHER THAN SKIPPING LATER STEPS.
+      # A workflow that opens the production firewall and only then decides it
+      # is not going to write has taken the risk for nothing.
+      - name: Refuse without an explicit APPLY
+        if: inputs.confirm != 'APPLY'
+        run: |
+          echo "::notice::confirm was '${{ inputs.confirm }}', not APPLY — nothing will be written."
+          echo "Re-run with -f confirm=APPLY to grant the three named memberships."
+          exit 1
+
+      - name: Refuse without a key
+        run: |
+          set -euo pipefail
+          [ -n "${RENDER_API_KEY:-}" ] || { echo "::error::RENDER_API_KEY is not set"; exit 1; }
+
+      # ⚠️ CHECKED BEFORE THE FIREWALL OPENS. An unset secret then costs nothing
+      # at all — no exposure window, no write. The SQL refuses a second time on
+      # its own, because this check is skippable by editing the workflow and
+      # that one is not.
+      - name: Refuse without the live-suite account
+        run: |
+          set -euo pipefail
+          [ -n "${LIVE_OWNER_EMAIL:-}" ] || {
+            echo "::error::LIVE_OWNER_EMAIL is not set. This workflow grants memberships to the account the live suite signs in as; without the secret it does not know which account that is, and it will not guess."
+            exit 1; }
+
+      - name: Find the database and open the firewall for this runner
+        run: |
+          set -euo pipefail
+          sudo apt-get update -qq && sudo apt-get install -y -qq postgresql-client >/dev/null
+          curl -fsS -H "Authorization: Bearer ${RENDER_API_KEY}" -H 'Accept: application/json' \
+            "https://api.render.com/v1/postgres?name=${DB_NAME}&limit=20" > /tmp/pg_list.json || true
+          DB_ID="$(python3 -c "
+          import json, os
+          try:
+              rows = json.load(open('/tmp/pg_list.json'))
+          except Exception:
+              rows = None
+          if isinstance(rows, dict):
+              rows = rows.get('postgres') or rows.get('items') or []
+          for r in (rows or []):
+              d = r.get('postgres', r) if isinstance(r, dict) else {}
+              if d.get('name') == os.environ['DB_NAME']:
+                  print(d.get('id','')); break
+          ")"
+          [ -n "$DB_ID" ] || {
+            echo "::group::what /v1/postgres returned"; head -c 500 /tmp/pg_list.json; echo "::endgroup::"
+            echo "::error::could not find ${DB_NAME}"; exit 1; }
+          echo "$DB_ID" > /tmp/db_id
+
+          curl -fsS -H "Authorization: Bearer ${RENDER_API_KEY}" -H 'Accept: application/json' \
+            "https://api.render.com/v1/postgres/${DB_ID}" \
+            | python3 -c "
+          import sys, json
+          d = json.load(sys.stdin)
+          # \`or []\`: Render returns the key PRESENT and null when the list is
+          # empty, so a dict default would never fire.
+          print(json.dumps(d.get('ipAllowList') or []))" > /tmp/ip_allow_original.json
+
+          RUNNER_IP="$(curl -fsS --max-time 30 https://api.ipify.org)"
+          python3 - "$RUNNER_IP" > /tmp/allow.json <<'PY'
+          import json, sys
+          cur = json.load(open('/tmp/ip_allow_original.json')) or []
+          cur = [e for e in cur if e.get('cidrBlock') != f'{sys.argv[1]}/32']
+          cur.append({'cidrBlock': f'{sys.argv[1]}/32', 'description': 'demo seeding'})
+          print(json.dumps({'ipAllowList': cur}))
+          PY
+          curl -fsS -X PATCH -H "Authorization: Bearer ${RENDER_API_KEY}" \
+            -H 'Content-Type: application/json' --data @/tmp/allow.json \
+            "https://api.render.com/v1/postgres/${DB_ID}" >/dev/null
+
+          CONN="$(curl -fsS -H "Authorization: Bearer ${RENDER_API_KEY}" -H 'Accept: application/json' \
+            "https://api.render.com/v1/postgres/${DB_ID}/connection-info" \
+            | python3 -c "import sys,json;print(json.load(sys.stdin)['externalConnectionString'])")"
+          echo "::add-mask::$CONN"
+          printf '%s' "$CONN" > /tmp/dburl
+          echo "firewall open"
+
+      - name: Grant the three named partner memberships
+        run: |
+          set -euo pipefail
+          export DATABASE_URL="$(cat /tmp/dburl)"
+          PSQL="$(ls /usr/lib/postgresql/*/bin/psql | head -1)"
+          # -v, not shell interpolation into the SQL text: psql quotes the value
+          # where the script writes :'live_email', so an address containing a
+          # quote cannot alter the statement.
+          "$PSQL" -v ON_ERROR_STOP=1 "$DATABASE_URL" \
+            -v live_email="${LIVE_OWNER_EMAIL}" \
+            -f infrastructure/seed/grant_live_suite_partner_memberships.sql | tee /tmp/grant.txt
+
+      - name: Put it in the run summary
+        if: always()
+        run: |
+          {
+            echo "## Grant live-suite partner memberships — production"
+            echo ""
+            echo "Compare **BEFORE** and **AFTER**. AFTER must list four organisations:"
+            echo "the account's own workshop plus the three \`[AUDIT]\` partner ones."
+            echo ""
+            echo "\`0 granted\` with a passing gate is SUCCESS on a re-run — the writes"
+            echo "are idempotent through \`(organization_id, user_id, role_name)\`."
+            echo ""
+            echo "⚠️ This is half the fix. Roles are scoped to the ACTIVE organisation,"
+            echo "so these are reachable through the ORGANISATION switcher only. The"
+            echo "live suite must be re-run to turn the four A3 skips into passes."
+            echo ""
+            echo '```'
+            cat /tmp/grant.txt 2>/dev/null || echo "nothing was written"
+            echo '```'
+          } >> "$GITHUB_STEP_SUMMARY"
+
+      - name: Always restore the database firewall
+        if: always()
+        run: |
+          set -euo pipefail
+          [ -f /tmp/db_id ] && [ -f /tmp/ip_allow_original.json ] || { echo "nothing to restore"; exit 0; }
+          ID="$(cat /tmp/db_id)"
+          python3 -c "
+          import json
+          json.dump({'ipAllowList': json.load(open('/tmp/ip_allow_original.json')) or []},
+                    open('/tmp/restore.json','w'))"
+          curl -fsS -X PATCH -H "Authorization: Bearer ${RENDER_API_KEY}" \
+            -H 'Content-Type: application/json' --data @/tmp/restore.json \
+            "https://api.render.com/v1/postgres/${ID}" >/dev/null
+          echo "firewall restored"
+
+      - name: Always remove the credentials from the runner
+        if: always()
+        run: rm -f /tmp/dburl || true
diff --git a/apps/e2e/tests/live-signed-in.spec.ts b/apps/e2e/tests/live-signed-in.spec.ts
index ae43c9d..fe18eab 100644
--- a/apps/e2e/tests/live-signed-in.spec.ts
+++ b/apps/e2e/tests/live-signed-in.spec.ts
@@ -374,203 +374,228 @@ test.describe('the live site, signed in as the workshop owner', () => {
  * ══════════════════════════════════════════════════════════════════════════
  * A3 — "SIGN IN AS AN `insurance_owner` AND LOOK", TURNED INTO A CHECK.
  *
  * This has been the oldest open item since 2026-08-17. Migration 085 gave
  * insurance and towing an org-admin role, T1a built the screens, slice 17 built
  * the enquiry inbox, and every layer underneath is proven — by `verify/085`,
  * `verify/086`, integration specs and a green live suite. NOBODY HAD LOOKED.
  *
  * 🔴 AND THIS REPOSITORY HAS SHIPPED TWO FEATURES THAT NEVER ONCE WORKED UNDER
  * GREEN GATES. "A green build is not a working feature" is its most expensive
  * recorded lesson. A one-off manual glance would have closed the item without
  * closing the gap: a check nobody can re-run is not a gate, and the next
  * regression would be found the same way — by the owner.
  *
  * ── WHAT THESE ASSERT, AND WHAT THEY DELIBERATELY DO NOT ─────────────────
  *
  * They assert that a signed-in owner can REACH these screens and that each
  * renders its own content rather than the "not built yet" catch-all. They do
  * NOT assert that the screens contain business data: the `[AUDIT]` insurance
  * and towing organisations were created on 2026-08-16 so the owner could reach
  * those trees at all, and they hold no products, policies or enquiries.
  * Reachable is not populated, and asserting rows would fail for a reason that
  * is not a defect.
  * ══════════════════════════════════════════════════════════════════════════
  */
-test.describe('the live site, signed in and acting in another role', () => {
+test.describe('the live site, signed in and acting in another organisation', () => {
   test.beforeAll(() => {
     test.skip(
       !OWNER_EMAIL || !OWNER_PASSWORD,
       'LIVE_OWNER_EMAIL / LIVE_OWNER_PASSWORD are not set — A3 did NOT run, so ' +
         'whether an insurance owner can reach their own screens is still UNPROVEN.',
     );
   });
 
   /**
    * The switcher is the mechanism A3 depends on, so it is asserted first and
    * its options are PRINTED. If a later check fails because a role is missing,
    * this line is what says so — rather than leaving a reader to infer it from a
    * locator timeout.
    */
   /**
-   * 🔴 THIS CHECK ANSWERED A3, AND THE ANSWER WAS NOT THE ONE EXPECTED.
+   * 🔴 THIS CHECK ANSWERED A3 — AND THEN THE ANSWER TURNED OUT TO BE ABOUT THE
+   * WRONG CONTROL.
    *
    * Run 32290511884: `getByLabel('Acting as role')` — ELEMENT NOT FOUND.
    * `RoleSwitcher` returns `null` when the viewer holds fewer than two roles
-   * ("one role is not a choice"), so the control is absent, not broken.
+   * ("one role is not a choice"), so the control was absent, not broken. The
+   * conclusion drawn was that the CI identity holds one role, and
+   * `diagnose-live-identity-roles.yml` run 32293446882 asked production and
+   * CONFIRMED it: one active membership, `workshop_owner`.
    *
-   * ▶ THE CI IDENTITY HOLDS ONE ROLE. `LIVE_OWNER_EMAIL` is a dedicated test
-   *   account, not the operator's own `marc667us@yahoo.com`, which holds seven
-   *   roles in one tenant. **So the signed-in half of this suite STRUCTURALLY
-   *   CANNOT verify any partner-role screen** — insurance, towing or fleet — no
-   *   matter how many times it runs. A3 was not merely unmet; it was
-   *   unmeetable by this harness.
+   * ▶ BUT THE PRESCRIBED FIX — "give the CI identity memberships in the
+   *   `[AUDIT]` organisations" — WOULD HAVE LEFT THIS CHECK SKIPPING ANYWAY,
+   *   and that is the thing worth remembering:
    *
-   * ⚠️ THAT IS A FIXTURE GAP, NOT A PRODUCT DEFECT, so this is a SKIP and not a
-   * failure — and a LOUD one. A red would say something is broken when nothing
-   * is; a silent skip would hide that four screens are unverified. Passed,
-   * failed and SKIPPED are three states here, and a skip must be said out loud.
+   *     viewer-contract.ts:470   if (m.organizationId !== organizationId) continue;
    *
-   * ▶ WHAT WOULD CLOSE IT: give the CI identity memberships in the `[AUDIT]`
-   *   insurance, towing and fleet organisations — the same organisations the
-   *   operator already uses to reach those trees. Then this check and the three
-   *   below start asserting instead of skipping.
+   *   `rolesFromMemberships` is SCOPED TO THE ACTIVE ORGANISATION, on purpose.
+   *   Every request carries `x-organization-id` AND `x-role-name` and
+   *   `resolveTenantContext` requires ONE membership matching BOTH, so a role
+   *   held in a DIFFERENT organisation is never offered here — offering it
+   *   would offer a pair the API refuses. The `[AUDIT]` organisations are in
+   *   the operator's tenant; the live-suite account is in its own. So the role
+   *   switcher can never be the control that reaches them.
+   *
+   * ▶ THE CONTROL THAT CROSSES ORGANISATIONS IS THE ORGANISATION SWITCHER.
+   *   `organizationsFromMemberships` does NOT filter by tenant, and
+   *   `setActiveOrganizationAction` CLEARS the stored role on the way out so
+   *   the API re-defaults to the strongest role held in the organisation just
+   *   entered. That is why this check now drives that control instead.
+   *
+   * ⚠️ IT STILL SKIPS RATHER THAN FAILS WHEN THE MEMBERSHIPS ARE ABSENT. That
+   * is a fixture gap, not a product defect — a red would say something is
+   * broken when nothing is, and a silent skip would hide that four screens are
+   * unverified. Passed, failed and SKIPPED are three states here.
    */
-  test('the role switcher offers the partner roles', async ({ page }) => {
+  test('the organisation switcher offers the partner organisations', async ({ page }) => {
     await signIn(page);
 
     // Asserted first and separately: the shell DID resolve a viewer. Without
     // this, "no switcher" and "no shell" would look identical, and the second
     // is a real defect.
     await expect(page.getByRole('button', { name: /Sign out/ }).first()).toBeVisible({
       timeout: 60_000,
     });
 
-    const switcher = page.getByLabel('Acting as role');
+    // ⚠️ `Active organization` — the LABEL's spelling, which is American while
+    // the prose here is not. Matching the prose would silently find nothing.
+    const switcher = page.getByLabel('Active organization');
     const hasSwitcher = (await switcher.count()) > 0;
 
     test.skip(
       !hasSwitcher,
-      'A3 UNANSWERED: this CI identity holds ONE role, so the role switcher is ' +
-        'not rendered and the insurance, towing and fleet screens CANNOT be ' +
-        'verified by a signed-in viewer here. Not a product defect and not a ' +
-        'pass. Fix: give LIVE_OWNER_EMAIL memberships in the [AUDIT] partner ' +
-        'organisations.',
+      'A3 UNANSWERED: this CI identity belongs to ONE organisation, so the ' +
+        'organisation switcher is not rendered and the insurance, towing and ' +
+        'fleet screens CANNOT be reached by a signed-in viewer here. Not a ' +
+        'product defect and not a pass. Fix: run ' +
+        'grant-live-suite-partner-memberships.yml -f confirm=APPLY.',
     );
 
-    const roles = await switcher.locator('option').allTextContents();
+    const orgs = await switcher.locator('option').allTextContents();
     // Printed, not just asserted — the run log is where the next reader learns
     // what this account actually holds, and the live-suite job reads its logs.
     // An annotation would land in the HTML report, which nothing in CI opens.
     // eslint-disable-next-line no-console -- the OUTPUT is this check's deliverable
-    console.log(`A3: the owner can act as: ${roles.join(', ')}`);
+    console.log(`A3: the account belongs to: ${orgs.join(', ')}`);
 
-    expect(roles.join(' ').toLowerCase()).toContain('insurance');
+    expect(orgs.join(' ').toLowerCase()).toContain('insurance');
   });
 
   /**
-   * ⚠️ SWITCHING ROLE ALSO NAVIGATES. `setActiveRoleAction` used to revalidate
-   * IN PLACE, which stranded the owner on a pack they no longer held the
-   * permission for — ADR-021's third instance, fixed on 2026-08-16 by routing
-   * through `homeWorkspaceFor()`. So after choosing a role the test waits for
-   * the destination rather than assuming the current page re-rendered.
+   * Enter a partner workspace by switching ORGANISATION, and say whether it
+   * was possible.
+   *
+   * 🔴 WHY ORGANISATION AND NOT ROLE. `rolesFromMemberships` filters to the
+   * ACTIVE organisation, so a role held only in another organisation is never
+   * in the role switcher — the earlier `actAs` could not have reached the
+   * `[AUDIT]` organisations however many memberships were granted. The
+   * organisation switcher is unfiltered by tenant, and
+   * `setActiveOrganizationAction` deletes the stored role cookie before
+   * redirecting to `/`, so the API re-resolves the STRONGEST role held in the
+   * organisation just entered (`ROLE_PRECEDENCE`). Switching organisation is
+   * therefore sufficient on its own, and switching role afterwards would be
+   * both unnecessary and — inside a single-role organisation, where the
+   * switcher is absent — impossible.
+   *
+   * ⚠️ SWITCHING ALSO NAVIGATES, to `/`, which dispatches to the new role's
+   * home pack. The caller's own `page.goto` follows, so this only has to wait
+   * for the switch to settle rather than assert where it landed.
+   *
+   * 🔴 COUNT, DO NOT WAIT — kept from the fix on 2026-08-19. The first version
+   * of this helper called `waitFor({ state: 'visible' })` on a control whose
+   * ABSENCE is the expected case, which THROWS after 60s, so it could never
+   * return `false` and the callers' skip branch was unreachable. The suite went
+   * red twice for a fixture gap the checks were written to skip on. Absence
+   * must be a value this returns, never an exception it raises.
    */
-  async function actAs(page: import('@playwright/test').Page, match: RegExp) {
-    const switcher = page.getByLabel('Acting as role');
-    // 🔴 COUNT, DO NOT WAIT. The first version called
-    // `waitFor({ state: 'visible' })`, which THROWS after 60s when the control
-    // is absent — so this helper could never return `false`, and the callers'
-    // "skip when the role is missing" branch was unreachable. The suite went
-    // red for a fixture gap the checks were written to skip on.
-    //
-    // Absence is the EXPECTED case for a single-role identity (`RoleSwitcher`
-    // renders nothing below two roles), so it must be a value this function can
-    // return, not an exception it raises.
+  async function actInOrganization(page: import('@playwright/test').Page, match: RegExp) {
+    const switcher = page.getByLabel('Active organization');
     if ((await switcher.count()) === 0) return false;
     const options = await switcher.locator('option').all();
     for (const o of options) {
       const label = (await o.textContent()) ?? '';
       if (match.test(label)) {
         await switcher.selectOption({ label });
-        // The switch navigates to that role's home workspace.
         await page.waitForLoadState('networkidle', { timeout: 120_000 });
         return true;
       }
     }
     return false;
   }
 
   test('an insurance owner reaches their own users screen', async ({ page }) => {
     await signIn(page);
-    const switched = await actAs(page, /insurance/i);
+    const switched = await actInOrganization(page, /insurance/i);
     // Same fixture gap as the switcher check above — skipped loudly, never
     // silently, because "unverified" and "verified" must not look alike.
     test.skip(
       !switched,
-      'A3 UNANSWERED: this CI identity cannot act as an insurance owner, so ' +
+      'A3 UNANSWERED: this CI identity belongs to no insurance organisation, so ' +
         '/insurance/settings/users is UNVERIFIED by a signed-in viewer.',
     );
 
     await page.goto(`${APEX}/insurance/settings/users`, { timeout: 120_000 });
 
     // 🔴 THE CATCH-ALL IS THE FAILURE MODE. An unbuilt route falls through to
     // `[...slug]/page.tsx`, which renders a "not built yet" panel WITH A 200.
     // Asserting the status code would pass over exactly the thing A3 exists to
     // catch, so this asserts the screen's own heading and the absence of the
     // placeholder.
     await expect(page.getByRole('heading', { name: /Users/i }).first()).toBeVisible({
       timeout: 60_000,
     });
     await expect(page.getByText(/not built yet/i)).toHaveCount(0);
   });
 
   test('an insurance owner reaches My Products, with the enquiry inbox on it', async ({
     page,
   }) => {
     await signIn(page);
-    const switched = await actAs(page, /insurance/i);
+    const switched = await actInOrganization(page, /insurance/i);
     test.skip(
       !switched,
-      'A3 UNANSWERED: this CI identity cannot act as an insurance owner, so the ' +
-        'enquiry inbox on My Products is UNVERIFIED by a signed-in viewer.',
+      'A3 UNANSWERED: this CI identity belongs to no insurance organisation, so ' +
+        'the enquiry inbox on My Products is UNVERIFIED by a signed-in viewer.',
     );
 
     await page.goto(`${APEX}/insurance/sales/my-products`, { timeout: 120_000 });
 
     await expect(page.getByRole('heading', { name: /My Products/i }).first()).toBeVisible({
       timeout: 60_000,
     });
     // Slice 17's read half. Without this section the public enquiry form is a
     // control that discards what a person types into it.
     await expect(page.getByRole('heading', { name: /Enquiries/i }).first()).toBeVisible({
       timeout: 60_000,
     });
     await expect(page.getByText(/not built yet/i)).toHaveCount(0);
   });
 
   /**
    * Slice 20, seen the same way. Conditional on the role existing, and it says
    * so out loud when it is absent — a skip that looks like a pass is the thing
    * this suite exists to prevent.
    */
   test('a fleet administrator reaches the fleet screens built in slice 20', async ({ page }) => {
     await signIn(page);
-    const switched = await actAs(page, /fleet/i);
+    const switched = await actInOrganization(page, /fleet/i);
     test.skip(
       !switched,
-      'this account holds no fleet role, so slice 20 is UNSEEN by a signed-in ' +
-        'viewer. Not a pass — the screens are proven only by build and unit tests.',
+      'this account belongs to no fleet organisation, so slice 20 is UNSEEN by a ' +
+        'signed-in viewer. Not a pass — the screens are proven only by build and ' +
+        'unit tests.',
     );
 
     await page.goto(`${APEX}/fleet/fleet-assets/vehicles`, { timeout: 120_000 });
     await expect(page.getByRole('heading', { name: /Vehicles/i }).first()).toBeVisible({
       timeout: 60_000,
     });
     await expect(page.getByText(/not built yet/i)).toHaveCount(0);
 
     await page.goto(`${APEX}/fleet/service-management/service-requests`, { timeout: 120_000 });
     await expect(page.getByRole('heading', { name: /Service Requests/i }).first()).toBeVisible({
       timeout: 60_000,
     });
     await expect(page.getByText(/not built yet/i)).toHaveCount(0);
   });
 });
diff --git a/infrastructure/seed/grant_live_suite_partner_memberships.sql b/infrastructure/seed/grant_live_suite_partner_memberships.sql
new file mode 100644
index 0000000..28d996a
--- /dev/null
+++ b/infrastructure/seed/grant_live_suite_partner_memberships.sql
@@ -0,0 +1,258 @@
+-- One-off: let the live-suite identity REACH the partner workspaces.
+--
+-- ══════════════════════════════════════════════════════════════════════════
+-- 🔴 WHAT THIS CLOSES — A3, AND ONLY HALF OF IT.
+--
+-- `diagnose-live-identity-roles.yml` run 32293446882 asked production rather
+-- than inferring, and the inference held:
+--
+--   live-owner@aiappinvent.com   1 active membership   1 active role
+--                                roles: workshop_owner
+--   marc667us@yahoo.com          7 active memberships  7 active roles
+--
+-- So the signed-in half of the live suite holds ONE role and `RoleSwitcher`
+-- renders nothing below two. Four A3 checks skip, and four screens built in
+-- slices 17 and 20 are unverified by any signed-in viewer.
+--
+-- The three `[AUDIT]` partner organisations are the ones the operator already
+-- uses, and each has exactly one member — the operator:
+--
+--   [AUDIT] Insurance Company  d7d30afd-…  insurance_company  insurance_owner
+--   [AUDIT] Towing Company     c5c43056-…  towing_company     towing_owner
+--   [AUDIT] Fleet Operator     f9dc95da-…  fleet_operator     fleet_administrator
+--
+-- All three live in tenant 7adce423-8a76-49f0-8174-7b40b66ef8c5. The live-suite
+-- account lives in its OWN tenant, so these memberships are deliberately
+-- CROSS-TENANT — which `identity.memberships` represents natively (`users` is
+-- not tenant-scoped, by the comment in migration 001) and which the operator's
+-- own account does not exercise, because all seven of its roles sit in one
+-- tenant.
+--
+-- ── 🔴 WHY GRANTING THE MEMBERSHIPS IS NOT, BY ITSELF, THE FIX ────────────
+--
+-- The resume pointer prescribed exactly this write and stopped there. Read
+-- against source, that would have been INERT:
+--
+--   viewer-contract.ts:470   if (m.organizationId !== organizationId) continue;
+--
+-- `rolesFromMemberships` is SCOPED TO THE ACTIVE ORGANISATION, deliberately —
+-- every request sends `x-organization-id` AND `x-role-name` together and
+-- `resolveTenantContext` requires ONE membership matching BOTH, so offering a
+-- role held only elsewhere would offer a pair the API refuses. A role held in
+-- another organisation therefore NEVER appears in the role switcher, no matter
+-- how many memberships this script writes.
+--
+-- ▶ The control that crosses organisations is the ORGANISATION switcher, and
+--   changing organisation CLEARS the stored role (`set-organization-action.ts`)
+--   so the API re-defaults to the strongest role held in the new organisation.
+--   The harness change is in `apps/e2e/tests/live-signed-in.spec.ts`, and
+--   WITHOUT IT this script changes nothing a test can observe.
+--
+-- ── ⚠️ WHY THE DEFAULT LANDING DOES NOT MOVE ─────────────────────────────
+--
+-- `resolveTenantContext` defaults by ROLE AUTHORITY first, organisation id only
+-- as a tie-break. In `ROLE_PRECEDENCE`, `workshop_owner` is index 1 and outranks
+-- `supplier_owner`(2), `fleet_administrator`(3), `insurance_owner`(4) and
+-- `towing_owner`(5); only `platform_administrator`(0) beats it. So after this
+-- runs, the live-suite account still signs in to its own workshop, and the four
+-- currently-passing signed-in checks keep passing. That was checked BEFORE
+-- writing, because adding memberships to the account the suite signs in as is
+-- exactly the kind of change that turns a green suite red for a reason nobody
+-- expects.
+--
+-- ── ⚠️ THE E-MAIL IS NOT HARDCODED HERE ──────────────────────────────────
+--
+-- `LIVE_OWNER_EMAIL` is a repository secret. This script takes it as
+-- `:live_email` from the workflow, which reads the SAME secret the live suite
+-- signs in with — so the account provisioned, the account granted and the
+-- account tested cannot drift apart. A literal in this file could.
+--
+-- ⚠️ AND IT IS RE-EXPORTED AS A GUC IMMEDIATELY BELOW, WHICH IS NOT
+-- REDUNDANT. psql substitutes `:'live_email'` in ordinary statement text but
+-- NOT inside dollar-quoted bodies, so a `:'live_email'` written inside the
+-- `DO $grant$ … $grant$` block below would be sent to the server verbatim and
+-- fail to parse. The blocks read `current_setting('live.email')` instead.
+--
+-- 🔴 EVERY WRITE IS GUARDED BY THE FULL SHAPE THAT WAS MEASURED — organisation
+-- id, tenant id, org_type, active status — and is idempotent through the
+-- natural key. If production has moved since the diagnostic, nothing is written
+-- and the gate says so rather than reporting success.
+-- ══════════════════════════════════════════════════════════════════════════
+
+\pset pager off
+\set ON_ERROR_STOP on
+
+BEGIN;
+
+-- Transaction-local: this IS one transaction, so `true` is correct. The
+-- diagnostic needed `false` because each of its statements was its own
+-- transaction; copying that here would leak the setting past COMMIT.
+SELECT set_config('app.current_role', 'admin', true) AS platform_context;
+
+-- The e-mail, carried across the dollar-quoting boundary. `true` again: it must
+-- not outlive this transaction.
+SELECT set_config('live.email', :'live_email', true) AS live_email;
+
+\echo ''
+\echo '=== BEFORE — what the live-suite identity holds ==='
+SELECT u.email, o.name AS organization, o.org_type, m.role_name, m.status
+  FROM identity.users u
+  LEFT JOIN identity.memberships m   ON m.user_id = u.id
+  LEFT JOIN identity.organizations o ON o.id = m.organization_id
+ WHERE u.email = :'live_email'
+ ORDER BY o.name;
+
+DO $grant$
+DECLARE
+    -- Measured 2026-08-19 by diagnose-live-identity-roles.yml run 32293446882.
+    v_tenant    uuid := '7adce423-8a76-49f0-8174-7b40b66ef8c5';
+    v_ins_org   uuid := 'd7d30afd-a615-4c0b-a8d2-fa61c44570bb';
+    v_tow_org   uuid := 'c5c43056-8920-47c9-8735-2d52e8ee3115';
+    v_fleet_org uuid := 'f9dc95da-d225-49b2-a4ed-adae414e2b2d';
+    v_email     text := current_setting('live.email', true);
+    v_user      uuid;
+    v_changed   int;
+    v_total     int := 0;
+BEGIN
+    IF v_email IS NULL OR v_email = '' THEN
+        RAISE EXCEPTION 'live.email is not set — the workflow did not pass '
+                        '-v live_email, so this script does not know which account '
+                        'to grant. Refusing rather than guessing.';
+    END IF;
+
+    -- ── resolve the account, and REFUSE on anything but exactly one ───────
+    -- A LIKE or a "first match" here could grant partner authority to the
+    -- wrong person. `identity.users` is not tenant-scoped, so an e-mail is the
+    -- only handle — it must therefore resolve to exactly one active row or
+    -- this stops.
+    SELECT id INTO v_user
+      FROM identity.users
+     WHERE email = v_email AND status = 'active';
+
+    IF v_user IS NULL THEN
+        RAISE EXCEPTION 'no ACTIVE identity.users row with e-mail %. LIVE_OWNER_EMAIL '
+                        'names an account that does not exist on production — run '
+                        'provision-live-suite-account.yml first, or the secret is wrong.',
+                        v_email;
+    END IF;
+
+    RAISE NOTICE 'granting partner memberships to % (%)', v_email, v_user;
+
+    -- ── the three grants ─────────────────────────────────────────────────
+    -- One statement per organisation rather than a loop over a VALUES list:
+    -- each names its own org_type, so a mistyped pairing (a towing role into
+    -- the insurance organisation) cannot insert anything. A loop would make
+    -- all three share one predicate and lose exactly that check.
+    --
+    -- `ON CONFLICT` on the natural key `(organization_id, user_id, role_name)`
+    -- makes a re-run a no-op, so `0 granted` on the second run is SUCCESS.
+    --
+    -- `created_by` is left NULL, deliberately. Naming a grantor would write a
+    -- claim about history this script cannot establish — the same reasoning
+    -- that made repair_audit_org_founders.sql set the role rather than
+    -- backfill `created_by`. The existing [AUDIT] rows are NULL too.
+    --
+    -- `tenant_id` comes from the ORGANISATION ROW, never from a literal or from
+    -- the user's own tenant. A membership whose tenant disagrees with its
+    -- organisation is the shape RLS cannot express and every join would then
+    -- silently drop.
+    INSERT INTO identity.memberships (tenant_id, organization_id, user_id, role_name, status)
+    SELECT o.tenant_id, o.id, v_user, 'insurance_owner', 'active'
+      FROM identity.organizations o
+     WHERE o.id        = v_ins_org
+       AND o.tenant_id = v_tenant
+       AND o.org_type  = 'insurance_company'
+       AND o.status    = 'active'
+    ON CONFLICT (organization_id, user_id, role_name) DO NOTHING;
+    GET DIAGNOSTICS v_changed = ROW_COUNT;
+    RAISE NOTICE 'insurance: % membership(s) granted', v_changed;
+    v_total := v_total + v_changed;
+
+    INSERT INTO identity.memberships (tenant_id, organization_id, user_id, role_name, status)
+    SELECT o.tenant_id, o.id, v_user, 'towing_owner', 'active'
+      FROM identity.organizations o
+     WHERE o.id        = v_tow_org
+       AND o.tenant_id = v_tenant
+       AND o.org_type  = 'towing_company'
+       AND o.status    = 'active'
+    ON CONFLICT (organization_id, user_id, role_name) DO NOTHING;
+    GET DIAGNOSTICS v_changed = ROW_COUNT;
+    RAISE NOTICE 'towing: % membership(s) granted', v_changed;
+    v_total := v_total + v_changed;
+
+    INSERT INTO identity.memberships (tenant_id, organization_id, user_id, role_name, status)
+    SELECT o.tenant_id, o.id, v_user, 'fleet_administrator', 'active'
+      FROM identity.organizations o
+     WHERE o.id        = v_fleet_org
+       AND o.tenant_id = v_tenant
+       AND o.org_type  = 'fleet_operator'
+       AND o.status    = 'active'
+    ON CONFLICT (organization_id, user_id, role_name) DO NOTHING;
+    GET DIAGNOSTICS v_changed = ROW_COUNT;
+    RAISE NOTICE 'fleet: % membership(s) granted', v_changed;
+    v_total := v_total + v_changed;
+
+    RAISE NOTICE 'total granted this run: % (0 on a re-run is expected)', v_total;
+END;
+$grant$;
+
+-- ── THE GATE: assert the END STATE, not the row count ─────────────────────
+--
+-- 🔴 THIS IS WHAT MAKES THE WRITE MEANINGFUL. Inserting rows is not the goal;
+-- the goal is that a signed-in viewer can REACH the insurance, towing and fleet
+-- workspaces. So the end state is asserted here and the transaction ROLLS BACK
+-- if it is not true — rather than reporting success and leaving the live suite
+-- to skip again twenty minutes later.
+--
+-- It asserts the ORGANISATION count as well as the roles, because the
+-- organisation switcher is the control the harness actually drives and it too
+-- renders nothing below two options.
+DO $gate$
+DECLARE
+    v_email   text := current_setting('live.email', true);
+    v_orgs    int;
+    v_roles   text[];
+    v_missing text[];
+BEGIN
+    PERFORM set_config('app.current_role', 'admin', true);
+
+    SELECT count(DISTINCT m.organization_id),
+           array_agg(DISTINCT m.role_name)
+      INTO v_orgs, v_roles
+      FROM identity.users u
+      JOIN identity.memberships m ON m.user_id = u.id AND m.status = 'active'
+     WHERE u.email = v_email;
+
+    SELECT array_agg(r) INTO v_missing
+      FROM unnest(ARRAY['insurance_owner','towing_owner','fleet_administrator']) AS r
+     WHERE NOT (r = ANY(COALESCE(v_roles, ARRAY[]::text[])));
+
+    IF v_missing IS NOT NULL THEN
+        RAISE EXCEPTION 'the grants did not take: % still missing for %. The [AUDIT] '
+                        'organisations have changed shape since run 32293446882 — '
+                        're-run diagnose-live-identity-roles.yml and re-measure the ids.',
+                        v_missing, v_email;
+    END IF;
+
+    -- The organisation switcher renders nothing below two options, so this is
+    -- the harness's actual precondition — not a restatement of the roles check.
+    IF v_orgs < 2 THEN
+        RAISE EXCEPTION 'the account holds % organisation(s); the organisation switcher '
+                        'renders nothing below two, so the harness still could not reach '
+                        'a partner workspace.', v_orgs;
+    END IF;
+
+    RAISE NOTICE 'gate passed: % organisations, roles %', v_orgs, v_roles;
+END;
+$gate$;
+
+\echo ''
+\echo '=== AFTER — what the live-suite identity holds now ==='
+SELECT u.email, o.name AS organization, o.org_type, m.role_name, m.status
+  FROM identity.users u
+  JOIN identity.memberships m   ON m.user_id = u.id
+  JOIN identity.organizations o ON o.id = m.organization_id
+ WHERE u.email = :'live_email'
+ ORDER BY o.name;
+
+COMMIT;

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n -C 8 "function organizationsFromMemberships|organizationsFromMemberships|function rolesFromMemberships|setActiveOrganizationAction|Active organization|identity.memberships" apps packages infrastructure --glob "*.ts" --glob "*.tsx" --glob "*.sql"' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 598ms:
infrastructure\seed\uat_verify.sql-46-      FROM identity.organizations o
infrastructure\seed\uat_verify.sql-47-      JOIN identity.tenants tn ON tn.id = o.tenant_id
infrastructure\seed\uat_verify.sql-48-     WHERE tn.name LIKE '%UAT-2026-08-14%'
infrastructure\seed\uat_verify.sql-49-       AND o.org_type = 'individual_workshop'
infrastructure\seed\uat_verify.sql-50-)
infrastructure\seed\uat_verify.sql-51-SELECT * FROM (
infrastructure\seed\uat_verify.sql-52-    SELECT  1 AS ord, 'workshops'                 AS use_case, count(*)::text AS actual, '1'  AS expected FROM ws
infrastructure\seed\uat_verify.sql-53-    UNION ALL SELECT  2, 'customers enrolled (requested service)', count(*)::text, '10'
infrastructure\seed\uat_verify.sql:54:      FROM identity.memberships m JOIN ws ON ws.org = m.organization_id
infrastructure\seed\uat_verify.sql-55-     WHERE m.role_name = 'customer' AND m.status = 'active'
infrastructure\seed\uat_verify.sql-56-    UNION ALL SELECT  3, 'technicians', count(*)::text, '5'
infrastructure\seed\uat_verify.sql:57:      FROM identity.memberships m JOIN ws ON ws.org = m.organization_id
infrastructure\seed\uat_verify.sql-58-     WHERE m.role_name = 'technician' AND m.status = 'active'
infrastructure\seed\uat_verify.sql-59-    UNION ALL SELECT  4, 'service requests', count(*)::text, '10'
infrastructure\seed\uat_verify.sql-60-      FROM reception.service_requests s JOIN ws ON ws.org = s.organization_id
infrastructure\seed\uat_verify.sql-61-    UNION ALL SELECT  5, 'job cards', count(*)::text, '10'
infrastructure\seed\uat_verify.sql-62-      FROM repair.job_cards j JOIN ws ON ws.org = j.organization_id
infrastructure\seed\uat_verify.sql-63-    UNION ALL SELECT  6, 'inspection reports (submitted)', count(*)::text, '10'
infrastructure\seed\uat_verify.sql-64-      FROM repair.inspections x JOIN ws ON ws.org = x.organization_id WHERE x.status = 'submitted'
infrastructure\seed\uat_verify.sql-65-    UNION ALL SELECT  7, 'diagnoses (approved)', count(*)::text, '10'
--
infrastructure\seed\uat_population.sql-186-    -- a real UAT step (an administrator reviewing a new business), and it is
infrastructure\seed\uat_population.sql-187-    -- modelled as one rather than worked around by writing `is_published` past
infrastructure\seed\uat_population.sql-188-    -- the trigger.
infrastructure\seed\uat_population.sql-189-    --
infrastructure\seed\uat_population.sql-190-    -- `decided_by` must be non-null when status leaves 'pending' (CHECK on
infrastructure\seed\uat_population.sql-191-    -- `organization_registrations`), so a real platform administrator is
infrastructure\seed\uat_population.sql-192-    -- preferred; the UAT owner stands in only if the platform has none.
infrastructure\seed\uat_population.sql-193-    SELECT m.user_id INTO v_admin
infrastructure\seed\uat_population.sql:194:      FROM identity.memberships m
infrastructure\seed\uat_population.sql-195-     WHERE m.role_name = 'platform_administrator' AND m.status = 'active'
infrastructure\seed\uat_population.sql-196-     LIMIT 1;
infrastructure\seed\uat_population.sql-197-    IF v_admin IS NULL THEN
infrastructure\seed\uat_population.sql-198-        v_admin := v_owner;
infrastructure\seed\uat_population.sql-199-        RAISE NOTICE 'no platform_administrator exists; UAT registrations approved by the UAT owner';
infrastructure\seed\uat_population.sql-200-    END IF;
infrastructure\seed\uat_population.sql-201-
infrastructure\seed\uat_population.sql-202-    UPDATE identity.organization_registrations
--
infrastructure\seed\uat_population.sql-244-    v_tech := ARRAY[]::uuid[];
infrastructure\seed\uat_population.sql-245-    FOR i IN 1..5 LOOP
infrastructure\seed\uat_population.sql-246-        v_subject := 'uat-'||v_tag||'-tech-'||i;
infrastructure\seed\uat_population.sql-247-        PERFORM identity.provision_user_from_subject(
infrastructure\seed\uat_population.sql-248-            v_subject, 'uat.tech'||i||'@aiappinvent.com', 'UAT Technician '||i||' '||v_tag);
infrastructure\seed\uat_population.sql-249-        SELECT id INTO r FROM identity.users WHERE keycloak_subject = v_subject;
infrastructure\seed\uat_population.sql-250-        -- Same shape `MembershipService.grant()` writes: tenant from context,
infrastructure\seed\uat_population.sql-251-        -- role from an allow-list, created_by the granting owner.
infrastructure\seed\uat_population.sql:252:        INSERT INTO identity.memberships
infrastructure\seed\uat_population.sql-253-            (tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure\seed\uat_population.sql-254-        SELECT v_ws_tenant, v_ws_org, v_ws_branch, u.id, 'technician', 'active', v_owner
infrastructure\seed\uat_population.sql-255-          FROM identity.users u WHERE u.keycloak_subject = v_subject;
infrastructure\seed\uat_population.sql-256-        v_tech := v_tech || (SELECT id FROM identity.users WHERE keycloak_subject = v_subject);
infrastructure\seed\uat_population.sql-257-    END LOOP;
infrastructure\seed\uat_population.sql-258-
infrastructure\seed\uat_population.sql-259-    -- ══ 3. THE PARTS SUPPLIER — real registration function ════════════════
infrastructure\seed\uat_population.sql-260-    v_subject := 'uat-'||v_tag||'-supplier';
--
infrastructure\seed\uat_insurance.sql-61-    PERFORM identity.provision_user_from_subject(
infrastructure\seed\uat_insurance.sql-62-        v_subject, 'uat.insurer@aiappinvent.com', 'UAT Insurance Assessor '||v_tag);
infrastructure\seed\uat_insurance.sql-63-    SELECT o_tenant_id, o_organization_id INTO v_tenant, v_org
infrastructure\seed\uat_insurance.sql-64-      FROM identity.register_insurer(v_subject, 'UAT Assurance '||v_tag, 'Accra office');
infrastructure\seed\uat_insurance.sql-65-    SELECT id INTO v_user FROM identity.users WHERE keycloak_subject = v_subject;
infrastructure\seed\uat_insurance.sql-66-
infrastructure\seed\uat_insurance.sql-67-    -- ── 2. A platform administrator verifies the BUSINESS ─────────────────
infrastructure\seed\uat_insurance.sql-68-    SELECT m.user_id INTO v_admin
infrastructure\seed\uat_insurance.sql:69:      FROM identity.memberships m
infrastructure\seed\uat_insurance.sql-70-     WHERE m.role_name = 'platform_administrator' AND m.status = 'active'
infrastructure\seed\uat_insurance.sql-71-     LIMIT 1;
infrastructure\seed\uat_insurance.sql-72-    IF v_admin IS NULL THEN v_admin := v_user; END IF;
infrastructure\seed\uat_insurance.sql-73-
infrastructure\seed\uat_insurance.sql-74-    UPDATE identity.organization_registrations
infrastructure\seed\uat_insurance.sql-75-       SET status = 'approved', decided_by = v_admin, decided_at = now(),
infrastructure\seed\uat_insurance.sql-76-           decision_note = 'UAT '||v_tag||': verified for acceptance testing'
infrastructure\seed\uat_insurance.sql-77-     WHERE organization_id = v_org;
--
infrastructure\seed\repair_audit_org_founders.sql-62--- Transaction-local: this IS one transaction, so `true` is correct here.
infrastructure\seed\repair_audit_org_founders.sql-63-SELECT set_config('app.current_role', 'admin', true);
infrastructure\seed\repair_audit_org_founders.sql-64-
infrastructure\seed\repair_audit_org_founders.sql-65-\echo ''
infrastructure\seed\repair_audit_org_founders.sql-66-\echo '=== BEFORE ==='
infrastructure\seed\repair_audit_org_founders.sql-67-SELECT o.id AS org_id, o.name, o.org_type, m.id AS membership_id,
infrastructure\seed\repair_audit_org_founders.sql-68-       m.role_name, m.status, m.user_id, m.created_by
infrastructure\seed\repair_audit_org_founders.sql-69-  FROM identity.organizations o
infrastructure\seed\repair_audit_org_founders.sql:70:  JOIN identity.memberships m ON m.organization_id = o.id AND m.tenant_id = o.tenant_id
infrastructure\seed\repair_audit_org_founders.sql-71- WHERE o.id IN ('d7d30afd-a615-4c0b-a8d2-fa61c44570bb',
infrastructure\seed\repair_audit_org_founders.sql-72-                'c5c43056-8920-47c9-8735-2d52e8ee3115')
infrastructure\seed\repair_audit_org_founders.sql-73- ORDER BY o.name, m.created_at;
infrastructure\seed\repair_audit_org_founders.sql-74-
infrastructure\seed\repair_audit_org_founders.sql-75-DO $repair$
infrastructure\seed\repair_audit_org_founders.sql-76-DECLARE
infrastructure\seed\repair_audit_org_founders.sql-77-    -- Measured 2026-08-19 by diagnose-085-stranded-orgs.yml run 32253435512.
infrastructure\seed\repair_audit_org_founders.sql-78-    v_ins_org  uuid := 'd7d30afd-a615-4c0b-a8d2-fa61c44570bb';
infrastructure\seed\repair_audit_org_founders.sql-79-    v_ins_mem  uuid := 'ced6b218-bc1e-4f88-b5f3-dc33e84a3851';
infrastructure\seed\repair_audit_org_founders.sql-80-    v_tow_org  uuid := 'c5c43056-8920-47c9-8735-2d52e8ee3115';
infrastructure\seed\repair_audit_org_founders.sql-81-    v_tow_mem  uuid := 'f383715d-c592-47a3-b7fc-1bbd10f20487';
infrastructure\seed\repair_audit_org_founders.sql-82-    v_changed  int;
infrastructure\seed\repair_audit_org_founders.sql-83-    v_total    int := 0;
infrastructure\seed\repair_audit_org_founders.sql-84-BEGIN
infrastructure\seed\repair_audit_org_founders.sql-85-    -- ── the insurer ───────────────────────────────────────────────────────
infrastructure\seed\repair_audit_org_founders.sql:86:    UPDATE identity.memberships m
infrastructure\seed\repair_audit_org_founders.sql-87-       SET role_name  = 'insurance_owner',
infrastructure\seed\repair_audit_org_founders.sql-88-           updated_at = now()
infrastructure\seed\repair_audit_org_founders.sql-89-      FROM identity.organizations o
infrastructure\seed\repair_audit_org_founders.sql-90-     WHERE m.id              = v_ins_mem
infrastructure\seed\repair_audit_org_founders.sql-91-       AND m.organization_id = v_ins_org
infrastructure\seed\repair_audit_org_founders.sql-92-       AND o.id              = m.organization_id
infrastructure\seed\repair_audit_org_founders.sql-93-       AND o.tenant_id       = m.tenant_id
infrastructure\seed\repair_audit_org_founders.sql-94-       AND o.org_type        = 'insurance_company'
infrastructure\seed\repair_audit_org_founders.sql-95-       AND m.status          = 'active'
infrastructure\seed\repair_audit_org_founders.sql-96-       AND m.role_name       = 'insurance_assessor'
infrastructure\seed\repair_audit_org_founders.sql-97-       -- 🔴 AND IT IS STILL THE ONLY ACTIVE MEMBER. If somebody has joined
infrastructure\seed\repair_audit_org_founders.sql-98-       -- since the diagnostic, promoting this row is no longer the same,
infrastructure\seed\repair_audit_org_founders.sql-99-       -- reviewed decision — it becomes a choice between two people.
infrastructure\seed\repair_audit_org_founders.sql:100:       AND (SELECT count(*) FROM identity.memberships x
infrastructure\seed\repair_audit_org_founders.sql-101-             WHERE x.organization_id = v_ins_org AND x.status = 'active') = 1;
infrastructure\seed\repair_audit_org_founders.sql-102-    GET DIAGNOSTICS v_changed = ROW_COUNT;
infrastructure\seed\repair_audit_org_founders.sql-103-    RAISE NOTICE 'insurance: % row(s) promoted to insurance_owner', v_changed;
infrastructure\seed\repair_audit_org_founders.sql-104-    v_total := v_total + v_changed;
infrastructure\seed\repair_audit_org_founders.sql-105-
infrastructure\seed\repair_audit_org_founders.sql-106-    -- ── the towing firm ───────────────────────────────────────────────────
infrastructure\seed\repair_audit_org_founders.sql:107:    UPDATE identity.memberships m
infrastructure\seed\repair_audit_org_founders.sql-108-       SET role_name  = 'towing_owner',
infrastructure\seed\repair_audit_org_founders.sql-109-           updated_at = now()
infrastructure\seed\repair_audit_org_founders.sql-110-      FROM identity.organizations o
infrastructure\seed\repair_audit_org_founders.sql-111-     WHERE m.id              = v_tow_mem
infrastructure\seed\repair_audit_org_founders.sql-112-       AND m.organization_id = v_tow_org
infrastructure\seed\repair_audit_org_founders.sql-113-       AND o.id              = m.organization_id
infrastructure\seed\repair_audit_org_founders.sql-114-       AND o.tenant_id       = m.tenant_id
infrastructure\seed\repair_audit_org_founders.sql-115-       AND o.org_type        = 'towing_company'
infrastructure\seed\repair_audit_org_founders.sql-116-       AND m.status          = 'active'
infrastructure\seed\repair_audit_org_founders.sql-117-       AND m.role_name       = 'towing_operator'
infrastructure\seed\repair_audit_org_founders.sql:118:       AND (SELECT count(*) FROM identity.memberships x
infrastructure\seed\repair_audit_org_founders.sql-119-             WHERE x.organization_id = v_tow_org AND x.status = 'active') = 1;
infrastructure\seed\repair_audit_org_founders.sql-120-    GET DIAGNOSTICS v_changed = ROW_COUNT;
infrastructure\seed\repair_audit_org_founders.sql-121-    RAISE NOTICE 'towing: % row(s) promoted to towing_owner', v_changed;
infrastructure\seed\repair_audit_org_founders.sql-122-    v_total := v_total + v_changed;
infrastructure\seed\repair_audit_org_founders.sql-123-
infrastructure\seed\repair_audit_org_founders.sql-124-    -- ⚠️ IDEMPOTENT BY THE ROLE PREDICATE. Re-running after success changes
infrastructure\seed\repair_audit_org_founders.sql-125-    -- nothing, because the rows no longer hold the operational role — so
infrastructure\seed\repair_audit_org_founders.sql-126-    -- `v_total = 0` on a second run is SUCCESS, not failure. That is why this
--
infrastructure\seed\repair_audit_org_founders.sql-142-BEGIN
infrastructure\seed\repair_audit_org_founders.sql-143-    PERFORM set_config('app.current_role', 'admin', true);
infrastructure\seed\repair_audit_org_founders.sql-144-
infrastructure\seed\repair_audit_org_founders.sql-145-    SELECT count(*) INTO v_stranded
infrastructure\seed\repair_audit_org_founders.sql-146-      FROM identity.organizations o
infrastructure\seed\repair_audit_org_founders.sql-147-     WHERE o.org_type IN ('insurance_company', 'towing_company')
infrastructure\seed\repair_audit_org_founders.sql-148-       AND o.status = 'active'
infrastructure\seed\repair_audit_org_founders.sql-149-       AND NOT EXISTS (
infrastructure\seed\repair_audit_org_founders.sql:150:             SELECT 1 FROM identity.memberships m
infrastructure\seed\repair_audit_org_founders.sql-151-              WHERE m.organization_id = o.id
infrastructure\seed\repair_audit_org_founders.sql-152-                AND m.tenant_id       = o.tenant_id
infrastructure\seed\repair_audit_org_founders.sql-153-                AND m.status          = 'active'
infrastructure\seed\repair_audit_org_founders.sql-154-                AND m.role_name IN ('insurance_owner', 'towing_owner'));
infrastructure\seed\repair_audit_org_founders.sql-155-
infrastructure\seed\repair_audit_org_founders.sql-156-    IF v_stranded > 0 THEN
infrastructure\seed\repair_audit_org_founders.sql-157-        RAISE EXCEPTION 'repair did not clear the way: % organisation(s) still have '
infrastructure\seed\repair_audit_org_founders.sql-158-                        'no member who can grant a membership, so migration 085 would '
--
infrastructure\seed\repair_audit_org_founders.sql-163-    RAISE NOTICE 'gate passed: every active insurance/towing organisation now has an org admin';
infrastructure\seed\repair_audit_org_founders.sql-164-END;
infrastructure\seed\repair_audit_org_founders.sql-165-$gate$;
infrastructure\seed\repair_audit_org_founders.sql-166-
infrastructure\seed\repair_audit_org_founders.sql-167-\echo ''
infrastructure\seed\repair_audit_org_founders.sql-168-\echo '=== AFTER ==='
infrastructure\seed\repair_audit_org_founders.sql-169-SELECT o.id AS org_id, o.name, o.org_type, m.role_name, m.status
infrastructure\seed\repair_audit_org_founders.sql-170-  FROM identity.organizations o
infrastructure\seed\repair_audit_org_founders.sql:171:  JOIN identity.memberships m ON m.organization_id = o.id AND m.tenant_id = o.tenant_id
infrastructure\seed\repair_audit_org_founders.sql-172- WHERE o.org_type IN ('insurance_company','towing_company')
infrastructure\seed\repair_audit_org_founders.sql-173- ORDER BY o.name;
infrastructure\seed\repair_audit_org_founders.sql-174-
infrastructure\seed\repair_audit_org_founders.sql-175-COMMIT;
--
infrastructure\seed\marketplace_population.sql-104-    IF NOT identity.is_platform_admin() THEN
infrastructure\seed\marketplace_population.sql-105-        RAISE EXCEPTION 'seed: the platform-admin escape is not live; this run '
infrastructure\seed\marketplace_population.sql-106-                        'would read and write into a database it cannot see.';
infrastructure\seed\marketplace_population.sql-107-    END IF;
infrastructure\seed\marketplace_population.sql-108-
infrastructure\seed\marketplace_population.sql-109-    -- ── The owner's own organisation, RESOLVED, never assumed ──────────────
infrastructure\seed\marketplace_population.sql-110-    SELECT m.organization_id, m.tenant_id INTO v_owner_org, v_owner_ten
infrastructure\seed\marketplace_population.sql-111-      FROM identity.users u
infrastructure\seed\marketplace_population.sql:112:      JOIN identity.memberships m ON m.user_id = u.id AND m.status = 'active'
infrastructure\seed\marketplace_population.sql-113-     WHERE lower(u.email) = lower(v_owner_email)
infrastructure\seed\marketplace_population.sql-114-     ORDER BY CASE WHEN m.role_name = 'workshop_owner' THEN 0 ELSE 1 END
infrastructure\seed\marketplace_population.sql-115-     LIMIT 1;
infrastructure\seed\marketplace_population.sql-116-
infrastructure\seed\marketplace_population.sql-117-    IF v_owner_org IS NULL THEN
infrastructure\seed\marketplace_population.sql-118-        RAISE EXCEPTION 'seed: % holds no active membership, so there is no '
infrastructure\seed\marketplace_population.sql-119-                        'organisation for the 20 customers to join. Register a '
infrastructure\seed\marketplace_population.sql-120-                        'workshop for that account first.', v_owner_email;
--
infrastructure\seed\marketplace_population.sql-122-
infrastructure\seed\marketplace_population.sql-123-    RAISE NOTICE 'owner organisation resolved: % (tenant %)', v_owner_org, v_owner_ten;
infrastructure\seed\marketplace_population.sql-124-
infrastructure\seed\marketplace_population.sql-125-    -- ── 10 workshops ──────────────────────────────────────────────────────
infrastructure\seed\marketplace_population.sql-126-    FOR i IN 1..10 LOOP
infrastructure\seed\marketplace_population.sql-127-        v_subject := format('demo-workshop-%s-%s', lpad(i::text, 2, '0'), v_tag);
infrastructure\seed\marketplace_population.sql-128-
infrastructure\seed\marketplace_population.sql-129-        IF EXISTS (SELECT 1 FROM identity.users u
infrastructure\seed\marketplace_population.sql:130:                    JOIN identity.memberships m ON m.user_id = u.id
infrastructure\seed\marketplace_population.sql-131-                   WHERE u.keycloak_subject = v_subject) THEN
infrastructure\seed\marketplace_population.sql-132-            skipped := skipped + 1;
infrastructure\seed\marketplace_population.sql-133-            CONTINUE;
infrastructure\seed\marketplace_population.sql-134-        END IF;
infrastructure\seed\marketplace_population.sql-135-
infrastructure\seed\marketplace_population.sql-136-        IF v_apply THEN
infrastructure\seed\marketplace_population.sql-137-            PERFORM identity.provision_user_from_subject(
infrastructure\seed\marketplace_population.sql-138-                v_subject,
--
infrastructure\seed\marketplace_population.sql-146-        made_ws := made_ws + 1;
infrastructure\seed\marketplace_population.sql-147-    END LOOP;
infrastructure\seed\marketplace_population.sql-148-
infrastructure\seed\marketplace_population.sql-149-    -- ── 10 suppliers ──────────────────────────────────────────────────────
infrastructure\seed\marketplace_population.sql-150-    FOR i IN 1..10 LOOP
infrastructure\seed\marketplace_population.sql-151-        v_subject := format('demo-supplier-%s-%s', lpad(i::text, 2, '0'), v_tag);
infrastructure\seed\marketplace_population.sql-152-
infrastructure\seed\marketplace_population.sql-153-        IF EXISTS (SELECT 1 FROM identity.users u
infrastructure\seed\marketplace_population.sql:154:                    JOIN identity.memberships m ON m.user_id = u.id
infrastructure\seed\marketplace_population.sql-155-                   WHERE u.keycloak_subject = v_subject) THEN
infrastructure\seed\marketplace_population.sql-156-            skipped := skipped + 1;
infrastructure\seed\marketplace_population.sql-157-            CONTINUE;
infrastructure\seed\marketplace_population.sql-158-        END IF;
infrastructure\seed\marketplace_population.sql-159-
infrastructure\seed\marketplace_population.sql-160-        IF v_apply THEN
infrastructure\seed\marketplace_population.sql-161-            PERFORM identity.provision_user_from_subject(
infrastructure\seed\marketplace_population.sql-162-                v_subject,
--
infrastructure\seed\grant_live_suite_partner_memberships.sql-18--- uses, and each has exactly one member — the operator:
infrastructure\seed\grant_live_suite_partner_memberships.sql-19---
infrastructure\seed\grant_live_suite_partner_memberships.sql-20---   [AUDIT] Insurance Company  d7d30afd-…  insurance_company  insurance_owner
infrastructure\seed\grant_live_suite_partner_memberships.sql-21---   [AUDIT] Towing Company     c5c43056-…  towing_company     towing_owner
infrastructure\seed\grant_live_suite_partner_memberships.sql-22---   [AUDIT] Fleet Operator     f9dc95da-…  fleet_operator     fleet_administrator
infrastructure\seed\grant_live_suite_partner_memberships.sql-23---
infrastructure\seed\grant_live_suite_partner_memberships.sql-24--- All three live in tenant 7adce423-8a76-49f0-8174-7b40b66ef8c5. The live-suite
infrastructure\seed\grant_live_suite_partner_memberships.sql-25--- account lives in its OWN tenant, so these memberships are deliberately
infrastructure\seed\grant_live_suite_partner_memberships.sql:26:-- CROSS-TENANT — which `identity.memberships` represents natively (`users` is
infrastructure\seed\grant_live_suite_partner_memberships.sql-27--- not tenant-scoped, by the comment in migration 001) and which the operator's
infrastructure\seed\grant_live_suite_partner_memberships.sql-28--- own account does not exercise, because all seven of its roles sit in one
infrastructure\seed\grant_live_suite_partner_memberships.sql-29--- tenant.
infrastructure\seed\grant_live_suite_partner_memberships.sql-30---
infrastructure\seed\grant_live_suite_partner_memberships.sql-31--- ── 🔴 WHY GRANTING THE MEMBERSHIPS IS NOT, BY ITSELF, THE FIX ────────────
infrastructure\seed\grant_live_suite_partner_memberships.sql-32---
infrastructure\seed\grant_live_suite_partner_memberships.sql-33--- The resume pointer prescribed exactly this write and stopped there. Read
infrastructure\seed\grant_live_suite_partner_memberships.sql-34--- against source, that would have been INERT:
--
infrastructure\seed\grant_live_suite_partner_memberships.sql-92--- The e-mail, carried across the dollar-quoting boundary. `true` again: it must
infrastructure\seed\grant_live_suite_partner_memberships.sql-93--- not outlive this transaction.
infrastructure\seed\grant_live_suite_partner_memberships.sql-94-SELECT set_config('live.email', :'live_email', true) AS live_email;
infrastructure\seed\grant_live_suite_partner_memberships.sql-95-
infrastructure\seed\grant_live_suite_partner_memberships.sql-96-\echo ''
infrastructure\seed\grant_live_suite_partner_memberships.sql-97-\echo '=== BEFORE — what the live-suite identity holds ==='
infrastructure\seed\grant_live_suite_partner_memberships.sql-98-SELECT u.email, o.name AS organization, o.org_type, m.role_name, m.status
infrastructure\seed\grant_live_suite_partner_memberships.sql-99-  FROM identity.users u
infrastructure\seed\grant_live_suite_partner_memberships.sql:100:  LEFT JOIN identity.memberships m   ON m.user_id = u.id
infrastructure\seed\grant_live_suite_partner_memberships.sql-101-  LEFT JOIN identity.organizations o ON o.id = m.organization_id
infrastructure\seed\grant_live_suite_partner_memberships.sql-102- WHERE u.email = :'live_email'
infrastructure\seed\grant_live_suite_partner_memberships.sql-103- ORDER BY o.name;
infrastructure\seed\grant_live_suite_partner_memberships.sql-104-
infrastructure\seed\grant_live_suite_partner_memberships.sql-105-DO $grant$
infrastructure\seed\grant_live_suite_partner_memberships.sql-106-DECLARE
infrastructure\seed\grant_live_suite_partner_memberships.sql-107-    -- Measured 2026-08-19 by diagnose-live-identity-roles.yml run 32293446882.
infrastructure\seed\grant_live_suite_partner_memberships.sql-108-    v_tenant    uuid := '7adce423-8a76-49f0-8174-7b40b66ef8c5';
--
infrastructure\seed\grant_live_suite_partner_memberships.sql-151-    -- claim about history this script cannot establish — the same reasoning
infrastructure\seed\grant_live_suite_partner_memberships.sql-152-    -- that made repair_audit_org_founders.sql set the role rather than
infrastructure\seed\grant_live_suite_partner_memberships.sql-153-    -- backfill `created_by`. The existing [AUDIT] rows are NULL too.
infrastructure\seed\grant_live_suite_partner_memberships.sql-154-    --
infrastructure\seed\grant_live_suite_partner_memberships.sql-155-    -- `tenant_id` comes from the ORGANISATION ROW, never from a literal or from
infrastructure\seed\grant_live_suite_partner_memberships.sql-156-    -- the user's own tenant. A membership whose tenant disagrees with its
infrastructure\seed\grant_live_suite_partner_memberships.sql-157-    -- organisation is the shape RLS cannot express and every join would then
infrastructure\seed\grant_live_suite_partner_memberships.sql-158-    -- silently drop.
infrastructure\seed\grant_live_suite_partner_memberships.sql:159:    INSERT INTO identity.memberships (tenant_id, organization_id, user_id, role_name, status)
infrastructure\seed\grant_live_suite_partner_memberships.sql-160-    SELECT o.tenant_id, o.id, v_user, 'insurance_owner', 'active'
infrastructure\seed\grant_live_suite_partner_memberships.sql-161-      FROM identity.organizations o
infrastructure\seed\grant_live_suite_partner_memberships.sql-162-     WHERE o.id        = v_ins_org
infrastructure\seed\grant_live_suite_partner_memberships.sql-163-       AND o.tenant_id = v_tenant
infrastructure\seed\grant_live_suite_partner_memberships.sql-164-       AND o.org_type  = 'insurance_company'
infrastructure\seed\grant_live_suite_partner_memberships.sql-165-       AND o.status    = 'active'
infrastructure\seed\grant_live_suite_partner_memberships.sql-166-    ON CONFLICT (organization_id, user_id, role_name) DO NOTHING;
infrastructure\seed\grant_live_suite_partner_memberships.sql-167-    GET DIAGNOSTICS v_changed = ROW_COUNT;
infrastructure\seed\grant_live_suite_partner_memberships.sql-168-    RAISE NOTICE 'insurance: % membership(s) granted', v_changed;
infrastructure\seed\grant_live_suite_partner_memberships.sql-169-    v_total := v_total + v_changed;
infrastructure\seed\grant_live_suite_partner_memberships.sql-170-
infrastructure\seed\grant_live_suite_partner_memberships.sql:171:    INSERT INTO identity.memberships (tenant_id, organization_id, user_id, role_name, status)
infrastructure\seed\grant_live_suite_partner_memberships.sql-172-    SELECT o.tenant_id, o.id, v_user, 'towing_owner', 'active'
infrastructure\seed\grant_live_suite_partner_memberships.sql-173-      FROM identity.organizations o
infrastructure\seed\grant_live_suite_partner_memberships.sql-174-     WHERE o.id        = v_tow_org
infrastructure\seed\grant_live_suite_partner_memberships.sql-175-       AND o.tenant_id = v_tenant
infrastructure\seed\grant_live_suite_partner_memberships.sql-176-       AND o.org_type  = 'towing_company'
infrastructure\seed\grant_live_suite_partner_memberships.sql-177-       AND o.status    = 'active'
infrastructure\seed\grant_live_suite_partner_memberships.sql-178-    ON CONFLICT (organization_id, user_id, role_name) DO NOTHING;
infrastructure\seed\grant_live_suite_partner_memberships.sql-179-    GET DIAGNOSTICS v_changed = ROW_COUNT;
infrastructure\seed\grant_live_suite_partner_memberships.sql-180-    RAISE NOTICE 'towing: % membership(s) granted', v_changed;
infrastructure\seed\grant_live_suite_partner_memberships.sql-181-    v_total := v_total + v_changed;
infrastructure\seed\grant_live_suite_partner_memberships.sql-182-
infrastructure\seed\grant_live_suite_partner_memberships.sql:183:    INSERT INTO identity.memberships (tenant_id, organization_id, user_id, role_name, status)
infrastructure\seed\grant_live_suite_partner_memberships.sql-184-    SELECT o.tenant_id, o.id, v_user, 'fleet_administrator', 'active'
infrastructure\seed\grant_live_suite_partner_memberships.sql-185-      FROM identity.organizations o
infrastructure\seed\grant_live_suite_partner_memberships.sql-186-     WHERE o.id        = v_fleet_org
infrastructure\seed\grant_live_suite_partner_memberships.sql-187-       AND o.tenant_id = v_tenant
infrastructure\seed\grant_live_suite_partner_memberships.sql-188-       AND o.org_type  = 'fleet_operator'
infrastructure\seed\grant_live_suite_partner_memberships.sql-189-       AND o.status    = 'active'
infrastructure\seed\grant_live_suite_partner_memberships.sql-190-    ON CONFLICT (organization_id, user_id, role_name) DO NOTHING;
infrastructure\seed\grant_live_suite_partner_memberships.sql-191-    GET DIAGNOSTICS v_changed = ROW_COUNT;
--
infrastructure\seed\grant_live_suite_partner_memberships.sql-215-    v_missing text[];
infrastructure\seed\grant_live_suite_partner_memberships.sql-216-BEGIN
infrastructure\seed\grant_live_suite_partner_memberships.sql-217-    PERFORM set_config('app.current_role', 'admin', true);
infrastructure\seed\grant_live_suite_partner_memberships.sql-218-
infrastructure\seed\grant_live_suite_partner_memberships.sql-219-    SELECT count(DISTINCT m.organization_id),
infrastructure\seed\grant_live_suite_partner_memberships.sql-220-           array_agg(DISTINCT m.role_name)
infrastructure\seed\grant_live_suite_partner_memberships.sql-221-      INTO v_orgs, v_roles
infrastructure\seed\grant_live_suite_partner_memberships.sql-222-      FROM identity.users u
infrastructure\seed\grant_live_suite_partner_memberships.sql:223:      JOIN identity.memberships m ON m.user_id = u.id AND m.status = 'active'
infrastructure\seed\grant_live_suite_partner_memberships.sql-224-     WHERE u.email = v_email;
infrastructure\seed\grant_live_suite_partner_memberships.sql-225-
infrastructure\seed\grant_live_suite_partner_memberships.sql-226-    SELECT array_agg(r) INTO v_missing
infrastructure\seed\grant_live_suite_partner_memberships.sql-227-      FROM unnest(ARRAY['insurance_owner','towing_owner','fleet_administrator']) AS r
infrastructure\seed\grant_live_suite_partner_memberships.sql-228-     WHERE NOT (r = ANY(COALESCE(v_roles, ARRAY[]::text[])));
infrastructure\seed\grant_live_suite_partner_memberships.sql-229-
infrastructure\seed\grant_live_suite_partner_memberships.sql-230-    IF v_missing IS NOT NULL THEN
infrastructure\seed\grant_live_suite_partner_memberships.sql-231-        RAISE EXCEPTION 'the grants did not take: % still missing for %. The [AUDIT] '
--
infrastructure\seed\grant_live_suite_partner_memberships.sql-245-    RAISE NOTICE 'gate passed: % organisations, roles %', v_orgs, v_roles;
infrastructure\seed\grant_live_suite_partner_memberships.sql-246-END;
infrastructure\seed\grant_live_suite_partner_memberships.sql-247-$gate$;
infrastructure\seed\grant_live_suite_partner_memberships.sql-248-
infrastructure\seed\grant_live_suite_partner_memberships.sql-249-\echo ''
infrastructure\seed\grant_live_suite_partner_memberships.sql-250-\echo '=== AFTER — what the live-suite identity holds now ==='
infrastructure\seed\grant_live_suite_partner_memberships.sql-251-SELECT u.email, o.name AS organization, o.org_type, m.role_name, m.status
infrastructure\seed\grant_live_suite_partner_memberships.sql-252-  FROM identity.users u
infrastructure\seed\grant_live_suite_partner_memberships.sql:253:  JOIN identity.memberships m   ON m.user_id = u.id
infrastructure\seed\grant_live_suite_partner_memberships.sql-254-  JOIN identity.organizations o ON o.id = m.organization_id
infrastructure\seed\grant_live_suite_partner_memberships.sql-255- WHERE u.email = :'live_email'
infrastructure\seed\grant_live_suite_partner_memberships.sql-256- ORDER BY o.name;
infrastructure\seed\grant_live_suite_partner_memberships.sql-257-
infrastructure\seed\grant_live_suite_partner_memberships.sql-258-COMMIT;
--
infrastructure\seed\diagnose_live_identity_roles.sql-35--- `(0 rows)` against a populated table.
infrastructure\seed\diagnose_live_identity_roles.sql-36-SELECT set_config('app.current_role', 'admin', false) AS platform_context;
infrastructure\seed\diagnose_live_identity_roles.sql-37-
infrastructure\seed\diagnose_live_identity_roles.sql-38-\echo ''
infrastructure\seed\diagnose_live_identity_roles.sql-39-\echo '=== 0. can we see anything? (0 here means the escape failed) ==='
infrastructure\seed\diagnose_live_identity_roles.sql-40-SELECT current_user AS running_as,
infrastructure\seed\diagnose_live_identity_roles.sql-41-       (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_superuser,
infrastructure\seed\diagnose_live_identity_roles.sql-42-       (SELECT count(*) FROM identity.users)       AS users_visible,
infrastructure\seed\diagnose_live_identity_roles.sql:43:       (SELECT count(*) FROM identity.memberships) AS memberships_visible;
infrastructure\seed\diagnose_live_identity_roles.sql-44-
infrastructure\seed\diagnose_live_identity_roles.sql-45-\echo ''
infrastructure\seed\diagnose_live_identity_roles.sql-46-\echo '=== 1. CANDIDATE IDENTITIES, and how many ACTIVE roles each holds ==='
infrastructure\seed\diagnose_live_identity_roles.sql-47--- 🔴 `active_roles` IS THE ANSWER. `RoleSwitcher` returns null below 2, so any
infrastructure\seed\diagnose_live_identity_roles.sql-48--- account showing 1 here cannot verify a partner-role screen no matter how many
infrastructure\seed\diagnose_live_identity_roles.sql-49--- times the suite runs.
infrastructure\seed\diagnose_live_identity_roles.sql-50-SELECT u.email,
infrastructure\seed\diagnose_live_identity_roles.sql-51-       u.display_name,
infrastructure\seed\diagnose_live_identity_roles.sql-52-       u.status,
infrastructure\seed\diagnose_live_identity_roles.sql-53-       count(m.id) FILTER (WHERE m.status = 'active')                       AS active_memberships,
infrastructure\seed\diagnose_live_identity_roles.sql-54-       count(DISTINCT m.role_name) FILTER (WHERE m.status = 'active')       AS active_roles,
infrastructure\seed\diagnose_live_identity_roles.sql-55-       string_agg(DISTINCT m.role_name, ', ') FILTER (WHERE m.status = 'active') AS roles
infrastructure\seed\diagnose_live_identity_roles.sql-56-  FROM identity.users u
infrastructure\seed\diagnose_live_identity_roles.sql:57:  LEFT JOIN identity.memberships m ON m.user_id = u.id
infrastructure\seed\diagnose_live_identity_roles.sql-58- WHERE u.email ILIKE '%aiappinvent.com'
infrastructure\seed\diagnose_live_identity_roles.sql-59-    OR u.email ILIKE '%yahoo.com'
infrastructure\seed\diagnose_live_identity_roles.sql-60- GROUP BY u.id, u.email, u.display_name, u.status
infrastructure\seed\diagnose_live_identity_roles.sql-61- ORDER BY active_roles DESC, u.email;
infrastructure\seed\diagnose_live_identity_roles.sql-62-
infrastructure\seed\diagnose_live_identity_roles.sql-63-\echo ''
infrastructure\seed\diagnose_live_identity_roles.sql-64-\echo '=== 2. the [AUDIT] partner organisations, and who is in them ==='
infrastructure\seed\diagnose_live_identity_roles.sql-65--- These are the organisations a CI identity would need memberships in for the
--
infrastructure\seed\diagnose_live_identity_roles.sql-67-SELECT o.name,
infrastructure\seed\diagnose_live_identity_roles.sql-68-       o.org_type,
infrastructure\seed\diagnose_live_identity_roles.sql-69-       o.id                AS organization_id,
infrastructure\seed\diagnose_live_identity_roles.sql-70-       o.tenant_id,
infrastructure\seed\diagnose_live_identity_roles.sql-71-       u.email             AS member,
infrastructure\seed\diagnose_live_identity_roles.sql-72-       m.role_name,
infrastructure\seed\diagnose_live_identity_roles.sql-73-       m.status
infrastructure\seed\diagnose_live_identity_roles.sql-74-  FROM identity.organizations o
infrastructure\seed\diagnose_live_identity_roles.sql:75:  LEFT JOIN identity.memberships m ON m.organization_id = o.id AND m.tenant_id = o.tenant_id
infrastructure\seed\diagnose_live_identity_roles.sql-76-  LEFT JOIN identity.users u       ON u.id = m.user_id
infrastructure\seed\diagnose_live_identity_roles.sql-77- WHERE o.org_type IN ('insurance_company', 'towing_company', 'fleet_operator')
infrastructure\seed\diagnose_live_identity_roles.sql-78- ORDER BY o.org_type, o.name, u.email;
infrastructure\seed\diagnose_live_identity_roles.sql-79-
infrastructure\seed\diagnose_live_identity_roles.sql-80-\echo ''
infrastructure\seed\diagnose_live_identity_roles.sql-81-\echo '=== 3. what a fleet membership would even be worth — is there a fleet org? ==='
infrastructure\seed\diagnose_live_identity_roles.sql-82--- Slice 20 built nine fleet screens. If no fleet_operator organisation exists on
infrastructure\seed\diagnose_live_identity_roles.sql-83--- production, no signed-in viewer can reach them at all, which is a separate
--
infrastructure\seed\diagnose_085_stranded_orgs.sql-24---     have created it, because the organisation did not exist a moment before).
infrastructure\seed\diagnose_085_stranded_orgs.sql-25---
infrastructure\seed\diagnose_085_stranded_orgs.sql-26--- Something in production breaks one of those. This file asks which, rather
infrastructure\seed\diagnose_085_stranded_orgs.sql-27--- than guessing — five confident diagnoses were wrong on 2026-08-13 and each
infrastructure\seed\diagnose_085_stranded_orgs.sql-28--- cost a cycle.
infrastructure\seed\diagnose_085_stranded_orgs.sql-29---
infrastructure\seed\diagnose_085_stranded_orgs.sql-30--- ── 🔴 WHY `is_local = false` AND NOT `true` ──────────────────────────────
infrastructure\seed\diagnose_085_stranded_orgs.sql-31---
infrastructure\seed\diagnose_085_stranded_orgs.sql:32:-- `identity.memberships` and `identity.organizations` are under FORCE ROW LEVEL
infrastructure\seed\diagnose_085_stranded_orgs.sql-33--- SECURITY, and on Render the owner is NOT a superuser, so without the platform
infrastructure\seed\diagnose_085_stranded_orgs.sql-34--- escape every SELECT below returns ZERO ROWS and this file reports a clean
infrastructure\seed\diagnose_085_stranded_orgs.sql-35--- database that is nothing of the sort.
infrastructure\seed\diagnose_085_stranded_orgs.sql-36---
infrastructure\seed\diagnose_085_stranded_orgs.sql-37--- `set_config(..., true)` is TRANSACTION-LOCAL, and each psql statement outside
infrastructure\seed\diagnose_085_stranded_orgs.sql-38--- an explicit transaction IS its own transaction — so the context would be
infrastructure\seed\diagnose_085_stranded_orgs.sql-39--- discarded before the next statement ran. That exact mistake was made on
infrastructure\seed\diagnose_085_stranded_orgs.sql-40--- 2026-08-16: the diagnostic printed `(0 rows)` and was read as "the grant is
--
infrastructure\seed\diagnose_085_stranded_orgs.sql-51-
infrastructure\seed\diagnose_085_stranded_orgs.sql-52-SELECT set_config('app.current_role', 'admin', false) AS platform_context;
infrastructure\seed\diagnose_085_stranded_orgs.sql-53-
infrastructure\seed\diagnose_085_stranded_orgs.sql-54-\echo ''
infrastructure\seed\diagnose_085_stranded_orgs.sql-55-\echo '=== 0. Can we see anything at all? (if these are 0, the escape failed) ==='
infrastructure\seed\diagnose_085_stranded_orgs.sql-56-SELECT current_user                                              AS running_as,
infrastructure\seed\diagnose_085_stranded_orgs.sql-57-       (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_superuser,
infrastructure\seed\diagnose_085_stranded_orgs.sql-58-       (SELECT count(*) FROM identity.organizations)             AS organizations_visible,
infrastructure\seed\diagnose_085_stranded_orgs.sql:59:       (SELECT count(*) FROM identity.memberships)               AS memberships_visible;
infrastructure\seed\diagnose_085_stranded_orgs.sql-60-
infrastructure\seed\diagnose_085_stranded_orgs.sql-61-\echo ''
infrastructure\seed\diagnose_085_stranded_orgs.sql-62-\echo '=== 1. Every insurance/towing organisation, and whether 085 would strand it ==='
infrastructure\seed\diagnose_085_stranded_orgs.sql-63--- `stranded` reproduces the guard's own predicate exactly, so this table says
infrastructure\seed\diagnose_085_stranded_orgs.sql-64--- which two rows produced the count in the error message.
infrastructure\seed\diagnose_085_stranded_orgs.sql-65-SELECT o.id,
infrastructure\seed\diagnose_085_stranded_orgs.sql-66-       o.name,
infrastructure\seed\diagnose_085_stranded_orgs.sql-67-       o.org_type,
infrastructure\seed\diagnose_085_stranded_orgs.sql-68-       o.status,
infrastructure\seed\diagnose_085_stranded_orgs.sql-69-       o.created_at,
infrastructure\seed\diagnose_085_stranded_orgs.sql:70:       EXISTS (SELECT 1 FROM identity.memberships m
infrastructure\seed\diagnose_085_stranded_orgs.sql-71-                WHERE m.organization_id = o.id
infrastructure\seed\diagnose_085_stranded_orgs.sql-72-                  AND m.tenant_id      = o.tenant_id
infrastructure\seed\diagnose_085_stranded_orgs.sql-73-                  AND m.status         = 'active'
infrastructure\seed\diagnose_085_stranded_orgs.sql-74-                  AND m.role_name IN ('insurance_owner','towing_owner')) AS has_owner_role,
infrastructure\seed\diagnose_085_stranded_orgs.sql:75:       (SELECT count(*) FROM identity.memberships m
infrastructure\seed\diagnose_085_stranded_orgs.sql-76-         WHERE m.organization_id = o.id AND m.tenant_id = o.tenant_id)   AS memberships_total,
infrastructure\seed\diagnose_085_stranded_orgs.sql:77:       (SELECT count(*) FROM identity.memberships m
infrastructure\seed\diagnose_085_stranded_orgs.sql-78-         WHERE m.organization_id = o.id AND m.tenant_id = o.tenant_id
infrastructure\seed\diagnose_085_stranded_orgs.sql-79-           AND m.status = 'active')                                      AS memberships_active
infrastructure\seed\diagnose_085_stranded_orgs.sql-80-  FROM identity.organizations o
infrastructure\seed\diagnose_085_stranded_orgs.sql-81- WHERE o.org_type IN ('insurance_company','towing_company')
infrastructure\seed\diagnose_085_stranded_orgs.sql-82- ORDER BY o.status, o.org_type, o.created_at;
infrastructure\seed\diagnose_085_stranded_orgs.sql-83-
infrastructure\seed\diagnose_085_stranded_orgs.sql-84-\echo ''
infrastructure\seed\diagnose_085_stranded_orgs.sql-85-\echo '=== 2. THE ANSWER: every membership of each STRANDED org, ranked ==='
--
infrastructure\seed\diagnose_085_stranded_orgs.sql-94--- second defect Codex found in 085's first draft: the organisation's first
infrastructure\seed\diagnose_085_stranded_orgs.sql-95--- member was created by SOMEBODY ELSE. 085 deliberately refuses to skip past it
infrastructure\seed\diagnose_085_stranded_orgs.sql-96--- to a later self-created row, because doing so promotes an ordinary assessor.
infrastructure\seed\diagnose_085_stranded_orgs.sql-97-WITH stranded AS (
infrastructure\seed\diagnose_085_stranded_orgs.sql-98-    SELECT o.id, o.tenant_id, o.name, o.org_type
infrastructure\seed\diagnose_085_stranded_orgs.sql-99-      FROM identity.organizations o
infrastructure\seed\diagnose_085_stranded_orgs.sql-100-     WHERE o.org_type IN ('insurance_company','towing_company')
infrastructure\seed\diagnose_085_stranded_orgs.sql-101-       AND o.status = 'active'
infrastructure\seed\diagnose_085_stranded_orgs.sql:102:       AND NOT EXISTS (SELECT 1 FROM identity.memberships m
infrastructure\seed\diagnose_085_stranded_orgs.sql-103-                        WHERE m.organization_id = o.id
infrastructure\seed\diagnose_085_stranded_orgs.sql-104-                          AND m.tenant_id      = o.tenant_id
infrastructure\seed\diagnose_085_stranded_orgs.sql-105-                          AND m.status         = 'active'
infrastructure\seed\diagnose_085_stranded_orgs.sql-106-                          AND m.role_name IN ('insurance_owner','towing_owner'))
infrastructure\seed\diagnose_085_stranded_orgs.sql-107-)
infrastructure\seed\diagnose_085_stranded_orgs.sql-108-SELECT s.name                              AS org_name,
infrastructure\seed\diagnose_085_stranded_orgs.sql-109-       s.org_type,
infrastructure\seed\diagnose_085_stranded_orgs.sql-110-       m.id                                AS membership_id,
--
infrastructure\seed\diagnose_085_stranded_orgs.sql-114-       row_number() OVER (PARTITION BY m.organization_id ORDER BY m.created_at) = 1
infrastructure\seed\diagnose_085_stranded_orgs.sql-115-                                           AS is_earliest,
infrastructure\seed\diagnose_085_stranded_orgs.sql-116-       (m.created_by = m.user_id)          AS is_self_created,
infrastructure\seed\diagnose_085_stranded_orgs.sql-117-       m.user_id,
infrastructure\seed\diagnose_085_stranded_orgs.sql-118-       m.created_by,
infrastructure\seed\diagnose_085_stranded_orgs.sql-119-       u.email                             AS member_email,
infrastructure\seed\diagnose_085_stranded_orgs.sql-120-       cb.email                            AS created_by_email
infrastructure\seed\diagnose_085_stranded_orgs.sql-121-  FROM stranded s
infrastructure\seed\diagnose_085_stranded_orgs.sql:122:  JOIN identity.memberships m ON m.organization_id = s.id AND m.tenant_id = s.tenant_id
infrastructure\seed\diagnose_085_stranded_orgs.sql-123-  LEFT JOIN identity.users u  ON u.id  = m.user_id
infrastructure\seed\diagnose_085_stranded_orgs.sql-124-  LEFT JOIN identity.users cb ON cb.id = m.created_by
infrastructure\seed\diagnose_085_stranded_orgs.sql-125- ORDER BY s.name, m.created_at;
infrastructure\seed\diagnose_085_stranded_orgs.sql-126-
infrastructure\seed\diagnose_085_stranded_orgs.sql-127-\echo ''
infrastructure\seed\diagnose_085_stranded_orgs.sql-128-\echo '=== 3. Were these registered by the product, or seeded by hand? ==='
infrastructure\seed\diagnose_085_stranded_orgs.sql-129--- A registration row means `identity.register_insurer` / `register_towing_operator`
infrastructure\seed\diagnose_085_stranded_orgs.sql-130--- created it, and those DO write `created_by = user_id`. Its ABSENCE points at a
--
apps\web\app\_shared\org-staff\org-staff-core.ts-85-
apps\web\app\_shared\org-staff\org-staff-core.ts-86-  for (const path of revalidate) revalidatePath(path);
apps\web\app\_shared\org-staff\org-staff-core.ts-87-  return { created: 'Added. They can sign in and will see this organisation immediately.' };
apps\web\app\_shared\org-staff\org-staff-core.ts-88-}
apps\web\app\_shared\org-staff\org-staff-core.ts-89-
apps\web\app\_shared\org-staff\org-staff-core.ts-90-/**
apps\web\app\_shared\org-staff\org-staff-core.ts-91- * Remove somebody's access.
apps\web\app\_shared\org-staff\org-staff-core.ts-92- *
apps\web\app\_shared\org-staff\org-staff-core.ts:93: * ⚠️ A STATUS CHANGE, NEVER A DELETE. `identity.memberships` keeps the row so
apps\web\app\_shared\org-staff\org-staff-core.ts-94- * that "was this person ever granted access, and by whom?" stays answerable —
apps\web\app\_shared\org-staff\org-staff-core.ts-95- * the API exposes `PATCH /:id/status` and no DELETE at all, deliberately.
apps\web\app\_shared\org-staff\org-staff-core.ts-96- *
apps\web\app\_shared\org-staff\org-staff-core.ts-97- * 🔴 THIS IS THE HALF THAT WAS UNREACHABLE. `withdraw()` needs a membership id,
apps\web\app\_shared\org-staff\org-staff-core.ts-98- * and the only source of one is `GET /memberships` — which was gated on
apps\web\app\_shared\org-staff\org-staff-core.ts-99- * `assertWorkshopStaff` and refused every partner role. So before this screen
apps\web\app\_shared\org-staff\org-staff-core.ts-100- * existed, an appointment made through the API could never be reversed.
apps\web\app\_shared\org-staff\org-staff-core.ts-101- */
--
apps\web\app\onboarding\account-types.ts-22- *
apps\web\app\onboarding\account-types.ts-23- * ── 🔴 WHY THIS FILE IS A LIST OF FOUR AND NOT A LIST OF THIRTEEN ────────────
apps\web\app\onboarding\account-types.ts-24- *
apps\web\app\onboarding\account-types.ts-25- * `MembershipService.GRANTABLE_ROLES` names thirteen roles, but a role being
apps\web\app\onboarding\account-types.ts-26- * grantable says only that an existing owner may confer it. The question this
apps\web\app\onboarding\account-types.ts-27- * screen answers is different and much narrower: *which roles does a production
apps\web\app\onboarding\account-types.ts-28- * path WRITE for somebody who belongs nowhere yet?*
apps\web\app\onboarding\account-types.ts-29- *
apps\web\app\onboarding\account-types.ts:30: * Measured, not assumed — every `INSERT INTO identity.memberships` across all
apps\web\app\onboarding\account-types.ts-31- * 79 migrations in `infrastructure/migrations/` writes exactly four role
apps\web\app\onboarding\account-types.ts-32- * literals:
apps\web\app\onboarding\account-types.ts-33- *
apps\web\app\onboarding\account-types.ts-34- *     workshop_owner (036/037/071/072) · supplier_owner (068/069/071/072)
apps\web\app\onboarding\account-types.ts-35- *     fleet_administrator (075/076)    · customer (061)
apps\web\app\onboarding\account-types.ts-36- *
apps\web\app\onboarding\account-types.ts-37- * So four is not an editorial choice about what to show. It is the complete set
apps\web\app\onboarding\account-types.ts-38- * of doors that exist. Offering a fifth would be offering a button that cannot
--
apps\web\app\onboarding\account-types.spec.ts-138-    // 🔴 READ FROM THE MIGRATIONS, WHICH ARE THE ONLY AUTHORITY ON WHAT A
apps\web\app\onboarding\account-types.spec.ts-139-    // SELF-SERVICE DOOR ACTUALLY WRITES. `GRANTABLE_ROLES` is a different and
apps\web\app\onboarding\account-types.spec.ts-140-    // much wider question — it is what an EXISTING owner may confer, and a
apps\web\app\onboarding\account-types.spec.ts-141-    // handover note conflated the two lists on 2026-08-13. Offering a role from
apps\web\app\onboarding\account-types.spec.ts-142-    // that wider set would put a button on this screen with no door behind it.
apps\web\app\onboarding\account-types.spec.ts-143-    // 🔴 THE LAST DEFINITION OF EACH DOOR WINS, NOT THE UNION OF ALL OF THEM.
apps\web\app\onboarding\account-types.spec.ts-144-    //
apps\web\app\onboarding\account-types.spec.ts-145-    // This reader used to add every role literal it found near an
apps\web\app\onboarding\account-types.spec.ts:146:    // `INSERT INTO identity.memberships` in ANY migration, into one flat set.
apps\web\app\onboarding\account-types.spec.ts-147-    // That is wrong the first time a function is redefined, and migration 085
apps\web\app\onboarding\account-types.spec.ts-148-    // is that first time: it `CREATE OR REPLACE`s `register_insurer` to write
apps\web\app\onboarding\account-types.spec.ts-149-    // `insurance_owner` instead of `insurance_assessor`, and 080 still sits on
apps\web\app\onboarding\account-types.spec.ts-150-    // disk containing the old literal for ever. The union therefore claimed the
apps\web\app\onboarding\account-types.spec.ts-151-    // insurance door writes BOTH roles, when the database runs only the later
apps\web\app\onboarding\account-types.spec.ts-152-    // body.
apps\web\app\onboarding\account-types.spec.ts-153-    //
apps\web\app\onboarding\account-types.spec.ts-154-    // A migration directory is an ordered ledger, not a bag of files. Keyed by
--
apps\web\app\onboarding\account-types.spec.ts-169-      for (const fn of sql.matchAll(
apps\web\app\onboarding\account-types.spec.ts-170-        /CREATE OR REPLACE FUNCTION identity\.(register_\w+)\s*\(/g,
apps\web\app\onboarding\account-types.spec.ts-171-      )) {
apps\web\app\onboarding\account-types.spec.ts-172-        const name = fn[1];
apps\web\app\onboarding\account-types.spec.ts-173-        if (!name || fn.index === undefined) continue;
apps\web\app\onboarding\account-types.spec.ts-174-        // The body ends at the function's closing `$$;`.
apps\web\app\onboarding\account-types.spec.ts-175-        const close = sql.indexOf('$$;', fn.index);
apps\web\app\onboarding\account-types.spec.ts-176-        const body = sql.slice(fn.index, close === -1 ? sql.length : close);
apps\web\app\onboarding\account-types.spec.ts:177:        const ins = body.indexOf('INSERT INTO identity.memberships');
apps\web\app\onboarding\account-types.spec.ts-178-        if (ins === -1) continue;
apps\web\app\onboarding\account-types.spec.ts-179-        const role = /role_name[\s\S]{0,400}?'([a-z_]+)'\s*,\s*'active'/.exec(
apps\web\app\onboarding\account-types.spec.ts-180-          body.slice(ins, ins + 700),
apps\web\app\onboarding\account-types.spec.ts-181-        );
apps\web\app\onboarding\account-types.spec.ts-182-        if (role?.[1]) doorWrites.set(name, role[1]);
apps\web\app\onboarding\account-types.spec.ts-183-      }
apps\web\app\onboarding\account-types.spec.ts-184-    }
apps\web\app\onboarding\account-types.spec.ts-185-
--
apps\web\app\onboarding\account-types.spec.ts-189-    ).toBeGreaterThanOrEqual(5);
apps\web\app\onboarding\account-types.spec.ts-190-
apps\web\app\onboarding\account-types.spec.ts-191-    const written = new Set(doorWrites.values());
apps\web\app\onboarding\account-types.spec.ts-192-
apps\web\app\onboarding\account-types.spec.ts-193-    const offered = new Set(
apps\web\app\onboarding\account-types.spec.ts-194-      ACCOUNT_TYPES.map((t) => t.roleName).filter((r): r is string => r !== null),
apps\web\app\onboarding\account-types.spec.ts-195-    );
apps\web\app\onboarding\account-types.spec.ts-196-    // ⚠️ NO `customer` FILTER ANY MORE, AND THAT IS A REAL NARROWING, NOT A
apps\web\app\onboarding\account-types.spec.ts:197:    // TIDY-UP. The old reader scanned every `INSERT INTO identity.memberships`
apps\web\app\onboarding\account-types.spec.ts-198-    // in every migration, so it saw `customer` (migration 061 enrols a vehicle
apps\web\app\onboarding\account-types.spec.ts-199-    // owner into an existing workshop) and had to strip it. This reader only
apps\web\app\onboarding\account-types.spec.ts-200-    // inspects `CREATE OR REPLACE FUNCTION identity.register_*` bodies, so
apps\web\app\onboarding\account-types.spec.ts-201-    // `customer` can never appear and the filter was dead code describing a
apps\web\app\onboarding\account-types.spec.ts-202-    // rule it no longer enforced. Removed rather than left to mislead.
apps\web\app\onboarding\account-types.spec.ts-203-    //
apps\web\app\onboarding\account-types.spec.ts-204-    // 🔴 THE COST, STATED: a future self-service door written as a plain
apps\web\app\onboarding\account-types.spec.ts-205-    // `CREATE FUNCTION`, or named outside `register_*`, or writing its
--
packages\next-shell\src\ViewerSwitchers.tsx-1-import * as React from 'react';
packages\next-shell\src\ViewerSwitchers.tsx-2-import { OrganizationSwitcher } from './OrganizationSwitcher';
packages\next-shell\src\ViewerSwitchers.tsx:3:import { setActiveOrganizationAction } from './set-organization-action';
packages\next-shell\src\ViewerSwitchers.tsx:4:import { organizationsFromMemberships } from './viewer-contract';
packages\next-shell\src\ViewerSwitchers.tsx-5-import type { ViewerDescription } from './viewer-contract';
packages\next-shell\src\ViewerSwitchers.tsx-6-
packages\next-shell\src\ViewerSwitchers.tsx-7-/**
packages\next-shell\src\ViewerSwitchers.tsx-8- * The "WHERE am I" control — the organisation switcher, mounted once, used by
packages\next-shell\src\ViewerSwitchers.tsx-9- * all seven apps.
packages\next-shell\src\ViewerSwitchers.tsx-10- *
packages\next-shell\src\ViewerSwitchers.tsx-11- * ⚠️ THE ROLE SWITCHER USED TO LIVE HERE AND DELIBERATELY NO LONGER DOES
packages\next-shell\src\ViewerSwitchers.tsx-12- * (owner request 2026-08-03). This node is passed as `organizationSwitcher`,
--
packages\next-shell\src\ViewerSwitchers.tsx-39- * Renders NOTHING when there is no viewer, and nothing below two organizations
packages\next-shell\src\ViewerSwitchers.tsx-40- * — a `<select>` that cannot change anything invites the user to interact with
packages\next-shell\src\ViewerSwitchers.tsx-41- * something inert. `TopNav` then falls back to its read-only Organization chip,
packages\next-shell\src\ViewerSwitchers.tsx-42- * so the organisation is still stated; only the control disappears.
packages\next-shell\src\ViewerSwitchers.tsx-43- */
packages\next-shell\src\ViewerSwitchers.tsx-44-export function ViewerSwitchers({ viewer }: { viewer: ViewerDescription | null }) {
packages\next-shell\src\ViewerSwitchers.tsx-45-  if (!viewer) return null;
packages\next-shell\src\ViewerSwitchers.tsx-46-
packages\next-shell\src\ViewerSwitchers.tsx:47:  const organizations = organizationsFromMemberships(viewer.memberships);
packages\next-shell\src\ViewerSwitchers.tsx-48-
packages\next-shell\src\ViewerSwitchers.tsx-49-  // Below the render threshold: emit nothing at all rather than an empty flex
packages\next-shell\src\ViewerSwitchers.tsx-50-  // wrapper. ⚠️ Returning `null` is what lets `TopNav` fall back to the chip —
packages\next-shell\src\ViewerSwitchers.tsx-51-  // `organizationSwitcher ?? <Selector …>` treats an empty wrapper as a supplied
packages\next-shell\src\ViewerSwitchers.tsx-52-  // control and would leave the organisation unnamed.
packages\next-shell\src\ViewerSwitchers.tsx-53-  if (organizations.length < 2) return null;
packages\next-shell\src\ViewerSwitchers.tsx-54-
packages\next-shell\src\ViewerSwitchers.tsx-55-  return (
packages\next-shell\src\ViewerSwitchers.tsx-56-    <OrganizationSwitcher
packages\next-shell\src\ViewerSwitchers.tsx-57-      organizations={organizations}
packages\next-shell\src\ViewerSwitchers.tsx-58-      activeId={viewer.organizationId}
packages\next-shell\src\ViewerSwitchers.tsx:59:      action={setActiveOrganizationAction}
packages\next-shell\src\ViewerSwitchers.tsx-60-    />
packages\next-shell\src\ViewerSwitchers.tsx-61-  );
packages\next-shell\src\ViewerSwitchers.tsx-62-}
--
packages\next-shell\src\viewer.test.ts-6-  workspaces,
packages\next-shell\src\viewer.test.ts-7-  type PermissionKey,
packages\next-shell\src\viewer.test.ts-8-} from '@autoworkshop/navigation';
packages\next-shell\src\viewer.test.ts-9-import {
packages\next-shell\src\viewer.test.ts-10-  grantsFor,
packages\next-shell\src\viewer.test.ts-11-  navRoleFor,
packages\next-shell\src\viewer.test.ts-12-  viewerLabels,
packages\next-shell\src\viewer.test.ts-13-  NO_GRANTS,
packages\next-shell\src\viewer.test.ts:14:  organizationsFromMemberships,
packages\next-shell\src\viewer.test.ts-15-  rolesFromMemberships,
packages\next-shell\src\viewer.test.ts-16-  holdsRoleInActiveOrganization,
packages\next-shell\src\viewer.test.ts-17-  type ViewerDescription,
packages\next-shell\src\viewer.test.ts-18-} from './viewer-contract';
packages\next-shell\src\viewer.test.ts-19-
packages\next-shell\src\viewer.test.ts-20-/**
packages\next-shell\src\viewer.test.ts-21- * REGRESSION GUARD: the navigation and the router must resolve from the SAME
packages\next-shell\src\viewer.test.ts-22- * viewer.
--
packages\next-shell\src\viewer.test.ts-367-      tenantId: 't1',
packages\next-shell\src\viewer.test.ts-368-      organizationId: 'o1',
packages\next-shell\src\viewer.test.ts-369-      branchId: null,
packages\next-shell\src\viewer.test.ts-370-      activeRole: 'workshop_supervisor',
packages\next-shell\src\viewer.test.ts-371-      permissions: [],
packages\next-shell\src\viewer.test.ts-372-      memberships: [],
packages\next-shell\src\viewer.test.ts-373-    } as never);
packages\next-shell\src\viewer.test.ts-374-    // `workshop_supervisor` reads badly in a top bar; `Workshop supervisor`
packages\next-shell\src\viewer.test.ts:375:    // does. Derived, not looked up, so a role added to `identity.memberships`
packages\next-shell\src\viewer.test.ts-376-    // is readable the day it exists rather than rendering blank.
packages\next-shell\src\viewer.test.ts-377-    expect(labels.roleLabel).toBe('Workshop supervisor');
packages\next-shell\src\viewer.test.ts-378-  });
packages\next-shell\src\viewer.test.ts-379-
packages\next-shell\src\viewer.test.ts-380-  /**
packages\next-shell\src\viewer.test.ts-381-   * 🔴 THE ROLE COMES FROM `activeRole`, NOT FROM THE MATCHED MEMBERSHIP ROW.
packages\next-shell\src\viewer.test.ts-382-   *
packages\next-shell\src\viewer.test.ts-383-   * The row is matched by organisation and branch, and one user can hold
--
packages\next-shell\src\viewer.test.ts-412-    expect(viewerLabels(null).roleLabel).toBeUndefined();
packages\next-shell\src\viewer.test.ts-413-  });
packages\next-shell\src\viewer.test.ts-414-});
packages\next-shell\src\viewer.test.ts-415-
packages\next-shell\src\viewer.test.ts-416-/**
packages\next-shell\src\viewer.test.ts-417- * The two switcher option lists — the pure half of the control group that
packages\next-shell\src\viewer.test.ts-418- * `ViewerSwitchers` mounts in all seven apps.
packages\next-shell\src\viewer.test.ts-419- *
packages\next-shell\src\viewer.test.ts:420: * `organizationsFromMemberships` shipped with T-0016 and had NO test at all
packages\next-shell\src\viewer.test.ts-421- * until the role switcher was rolled out beside it, which is worth stating
packages\next-shell\src\viewer.test.ts-422- * plainly: the dedupe it exists to perform was never asserted.
packages\next-shell\src\viewer.test.ts-423- *
packages\next-shell\src\viewer.test.ts-424- * What CANNOT be tested here is the security property, and that is by design —
packages\next-shell\src\viewer.test.ts-425- * neither function is the control. `resolveTenantContext` refuses an unheld
packages\next-shell\src\viewer.test.ts-426- * organisation or role, and its 8 tests in `apps/api` are where that lives.
packages\next-shell\src\viewer.test.ts-427- * These guard the list a human is OFFERED.
packages\next-shell\src\viewer.test.ts-428- */
--
packages\next-shell\src\viewer.test.ts-434-    { organizationId: 'o1', organizationName: 'Abossey Motors', branchId: 'b1', branchName: 'Main', roleName: 'workshop_supervisor' },
packages\next-shell\src\viewer.test.ts-435-    { organizationId: 'o2', organizationName: 'Tema Auto', branchId: null, branchName: null, roleName: 'technician' },
packages\next-shell\src\viewer.test.ts-436-  ];
packages\next-shell\src\viewer.test.ts-437-
packages\next-shell\src\viewer.test.ts-438-  it('offers each organization once, however many branches and roles it holds', () => {
packages\next-shell\src\viewer.test.ts-439-    // Four rows, two organizations. Feeding the rows straight to a <select>
packages\next-shell\src\viewer.test.ts-440-    // renders "Abossey Motors" three times, which reads as a bug and makes the
packages\next-shell\src\viewer.test.ts-441-    // switcher look like it has choices it does not.
packages\next-shell\src\viewer.test.ts:442:    expect(organizationsFromMemberships(memberships)).toEqual([
packages\next-shell\src\viewer.test.ts-443-      { id: 'o1', name: 'Abossey Motors' },
packages\next-shell\src\viewer.test.ts-444-      { id: 'o2', name: 'Tema Auto' },
packages\next-shell\src\viewer.test.ts-445-    ]);
packages\next-shell\src\viewer.test.ts-446-  });
packages\next-shell\src\viewer.test.ts-447-
packages\next-shell\src\viewer.test.ts-448-  it('offers each role once per organization, not once per branch', () => {
packages\next-shell\src\viewer.test.ts-449-    // `technician` is held at two branches of o1. It is ONE choice — branch is
packages\next-shell\src\viewer.test.ts-450-    // not something this control selects. A duplicate option would be a control
--
packages\next-shell\src\viewer.test.ts-475-  });
packages\next-shell\src\viewer.test.ts-476-
packages\next-shell\src\viewer.test.ts-477-  it('SCOPING: an organization the viewer does not hold offers nothing', () => {
packages\next-shell\src\viewer.test.ts-478-    // Fails closed. The switcher renders nothing rather than every role.
packages\next-shell\src\viewer.test.ts-479-    expect(rolesFromMemberships(memberships, 'o-not-mine')).toEqual([]);
packages\next-shell\src\viewer.test.ts-480-  });
packages\next-shell\src\viewer.test.ts-481-
packages\next-shell\src\viewer.test.ts-482-  it('labels a role the mapping has never seen rather than dropping it', () => {
packages\next-shell\src\viewer.test.ts:483:    // A role added to `identity.memberships` must never appear as a blank
packages\next-shell\src\viewer.test.ts-484-    // option. `roleLabel` derives the text instead of looking it up, so a new
packages\next-shell\src\viewer.test.ts-485-    // role is readable the day it exists — even one with no navigation tree,
packages\next-shell\src\viewer.test.ts-486-    // which `navRoleFor` correctly resolves to the workspace default.
packages\next-shell\src\viewer.test.ts-487-    expect(rolesFromMemberships([{ organizationId: 'o1', roleName: 'brand_new_role' }], 'o1')).toEqual([
packages\next-shell\src\viewer.test.ts-488-      { name: 'brand_new_role', label: 'Brand new role' },
packages\next-shell\src\viewer.test.ts-489-    ]);
packages\next-shell\src\viewer.test.ts-490-  });
packages\next-shell\src\viewer.test.ts-491-
--
packages\next-shell\src\viewer.test.ts-523-      expect(holdsRoleInActiveOrganization({ organizationId: 'o1', memberships: [] }, 'technician')).toBe(false);
packages\next-shell\src\viewer.test.ts-524-    });
packages\next-shell\src\viewer.test.ts-525-  });
packages\next-shell\src\viewer.test.ts-526-
packages\next-shell\src\viewer.test.ts-527-  it('returns nothing for a viewer with no memberships', () => {
packages\next-shell\src\viewer.test.ts-528-    // Below the switchers' own two-option threshold, so nothing renders. A
packages\next-shell\src\viewer.test.ts-529-    // viewer in this state is signed in but holds no membership — the API
packages\next-shell\src\viewer.test.ts-530-    // gives them no tenant context either.
packages\next-shell\src\viewer.test.ts:531:    expect(organizationsFromMemberships([])).toEqual([]);
packages\next-shell\src\viewer.test.ts-532-    expect(rolesFromMemberships([], 'o1')).toEqual([]);
packages\next-shell\src\viewer.test.ts-533-  });
packages\next-shell\src\viewer.test.ts-534-});
--
packages\next-shell\src\viewer-contract.ts-33- */
packages\next-shell\src\viewer-contract.ts-34-export interface ViewerDescription {
packages\next-shell\src\viewer-contract.ts-35-  userId: string;
packages\next-shell\src\viewer-contract.ts-36-  displayName: string;
packages\next-shell\src\viewer-contract.ts-37-  email: string;
packages\next-shell\src\viewer-contract.ts-38-  tenantId: string;
packages\next-shell\src\viewer-contract.ts-39-  organizationId: string;
packages\next-shell\src\viewer-contract.ts-40-  branchId: string | null;
packages\next-shell\src\viewer-contract.ts:41:  /** The ONE role active for this request — `identity.memberships.role_name`. */
packages\next-shell\src\viewer-contract.ts-42-  activeRole: string;
packages\next-shell\src\viewer-contract.ts-43-  /** Derived server-side from that role. Never sent by the client. */
packages\next-shell\src\viewer-contract.ts-44-  permissions: readonly string[];
packages\next-shell\src\viewer-contract.ts-45-  memberships: Array<{
packages\next-shell\src\viewer-contract.ts-46-    organizationId: string;
packages\next-shell\src\viewer-contract.ts-47-    organizationName: string;
packages\next-shell\src\viewer-contract.ts-48-    branchId: string | null;
packages\next-shell\src\viewer-contract.ts-49-    branchName: string | null;
packages\next-shell\src\viewer-contract.ts-50-    roleName: string;
packages\next-shell\src\viewer-contract.ts-51-  }>;
packages\next-shell\src\viewer-contract.ts-52-}
packages\next-shell\src\viewer-contract.ts-53-
packages\next-shell\src\viewer-contract.ts-54-/**
packages\next-shell\src\viewer-contract.ts:55: * `identity.memberships.role_name` → the navigation's `RoleId`.
packages\next-shell\src\viewer-contract.ts-56- *
packages\next-shell\src\viewer-contract.ts-57- * TWO VOCABULARIES, AND THEY ARE NOT THE SAME ONE. The database and the API
packages\next-shell\src\viewer-contract.ts-58- * speak the snake_case names in `MembershipService`'s grantable-role allow-list
packages\next-shell\src\viewer-contract.ts-59- * (`workshop_owner`, `reception_staff`, `quality_control_inspector`); the
packages\next-shell\src\viewer-contract.ts-60- * navigation model speaks `07.txt` part 2 §50's role ids (`owner`, `reception`,
packages\next-shell\src\viewer-contract.ts-61- * `quality-control`). Nothing mapped between them before, because until now
packages\next-shell\src\viewer-contract.ts-62- * nothing had a real role to map.
packages\next-shell\src\viewer-contract.ts-63- *
--
packages\next-shell\src\viewer-contract.ts-378- * user who is a service adviser at two branches of one workshop has two rows
packages\next-shell\src\viewer-contract.ts-379- * naming the same organization. Feeding those straight to a `<select>` renders
packages\next-shell\src\viewer-contract.ts-380- * the same option twice, which reads as a bug and — worse — makes the switcher
packages\next-shell\src\viewer-contract.ts-381- * look like it has choices it does not.
packages\next-shell\src\viewer-contract.ts-382- *
packages\next-shell\src\viewer-contract.ts-383- * Pure, so it can be asserted without a Next runtime. Order is preserved from
packages\next-shell\src\viewer-contract.ts-384- * the API, which already sorts by organization name.
packages\next-shell\src\viewer-contract.ts-385- */
packages\next-shell\src\viewer-contract.ts:386:export function organizationsFromMemberships(
packages\next-shell\src\viewer-contract.ts-387-  memberships: readonly { organizationId: string; organizationName: string }[],
packages\next-shell\src\viewer-contract.ts-388-): Array<{ id: string; name: string }> {
packages\next-shell\src\viewer-contract.ts-389-  const seen = new Set<string>();
packages\next-shell\src\viewer-contract.ts-390-  const out: Array<{ id: string; name: string }> = [];
packages\next-shell\src\viewer-contract.ts-391-  for (const m of memberships) {
packages\next-shell\src\viewer-contract.ts-392-    if (seen.has(m.organizationId)) continue;
packages\next-shell\src\viewer-contract.ts-393-    seen.add(m.organizationId);
packages\next-shell\src\viewer-contract.ts-394-    out.push({ id: m.organizationId, name: m.organizationName });
--
packages\next-shell\src\viewer-contract.ts-455-  viewer: Pick<ViewerDescription, 'organizationId' | 'memberships'>,
packages\next-shell\src\viewer-contract.ts-456-  roleName: string,
packages\next-shell\src\viewer-contract.ts-457-): boolean {
packages\next-shell\src\viewer-contract.ts-458-  return viewer.memberships.some(
packages\next-shell\src\viewer-contract.ts-459-    (m) => m.roleName === roleName && m.organizationId === viewer.organizationId,
packages\next-shell\src\viewer-contract.ts-460-  );
packages\next-shell\src\viewer-contract.ts-461-}
packages\next-shell\src\viewer-contract.ts-462-
packages\next-shell\src\viewer-contract.ts:463:export function rolesFromMemberships(
packages\next-shell\src\viewer-contract.ts-464-  memberships: readonly { organizationId: string; roleName: string }[],
packages\next-shell\src\viewer-contract.ts-465-  organizationId: string,
packages\next-shell\src\viewer-contract.ts-466-): Array<{ name: string; label: string }> {
packages\next-shell\src\viewer-contract.ts-467-  const seen = new Set<string>();
packages\next-shell\src\viewer-contract.ts-468-  const out: Array<{ name: string; label: string }> = [];
packages\next-shell\src\viewer-contract.ts-469-  for (const m of memberships) {
packages\next-shell\src\viewer-contract.ts-470-    if (m.organizationId !== organizationId) continue;
packages\next-shell\src\viewer-contract.ts-471-    if (seen.has(m.roleName)) continue;
--
packages\next-shell\src\set-role-action.ts-62- * WHY IT LIVES HERE RATHER THAN IN EACH APP'S LAYOUT. `RoleSwitcher` posts a
packages\next-shell\src\set-role-action.ts-63- * form, so it needs `(formData) => …`; `setActiveRoleAction` takes a string
packages\next-shell\src\set-role-action.ts-64- * because that is the useful signature for any other caller. The gap was
packages\next-shell\src\set-role-action.ts-65- * previously closed by an inline `'use server'` closure written out in
packages\next-shell\src\set-role-action.ts-66- * `workshop-web`'s layout — which is exactly the thing that does not survive
packages\next-shell\src\set-role-action.ts-67- * being copied into six more layouts, because a rule that exists in seven
packages\next-shell\src\set-role-action.ts-68- * places drifts in six of them.
packages\next-shell\src\set-role-action.ts-69- *
packages\next-shell\src\set-role-action.ts:70: * `setActiveOrganizationAction` already has this shape, so both switchers now
packages\next-shell\src\set-role-action.ts-71- * take a plain exported action and the app layouts declare no actions at all.
packages\next-shell\src\set-role-action.ts-72- */
packages\next-shell\src\set-role-action.ts-73-export async function setActiveRoleFromFormAction(formData: FormData): Promise<void> {
packages\next-shell\src\set-role-action.ts-74-  const roleName = String(formData.get('roleName') ?? '');
packages\next-shell\src\set-role-action.ts-75-  await setActiveRoleAction(roleName);
packages\next-shell\src\set-role-action.ts-76-
packages\next-shell\src\set-role-action.ts-77-  // 🔴 THEN GO WHERE THAT ROLE LIVES. Revalidating in place was right until
packages\next-shell\src\set-role-action.ts-78-  // ADR-021 and is wrong now.
--
packages\next-shell\src\set-organization-action.ts-23- *
packages\next-shell\src\set-organization-action.ts-24- * A malformed value is dropped rather than stored, which is not security —
packages\next-shell\src\set-organization-action.ts-25- * it just stops a junk cookie making every subsequent request fail with a
packages\next-shell\src\set-organization-action.ts-26- * confusing error instead of simply doing nothing.
packages\next-shell\src\set-organization-action.ts-27- */
packages\next-shell\src\set-organization-action.ts-28-
packages\next-shell\src\set-organization-action.ts-29-const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
packages\next-shell\src\set-organization-action.ts-30-
packages\next-shell\src\set-organization-action.ts:31:export async function setActiveOrganizationAction(formData: FormData): Promise<void> {
packages\next-shell\src\set-organization-action.ts-32-  const id = String(formData.get('organizationId') ?? '').trim();
packages\next-shell\src\set-organization-action.ts-33-  if (!UUID.test(id)) return;
packages\next-shell\src\set-organization-action.ts-34-
packages\next-shell\src\set-organization-action.ts-35-  const store = await cookies();
packages\next-shell\src\set-organization-action.ts-36-  store.set(ACTIVE_ORG_COOKIE, id, {
packages\next-shell\src\set-organization-action.ts-37-    path: '/',
packages\next-shell\src\set-organization-action.ts-38-    // Readable by the client: the switcher shows which option is active, and
packages\next-shell\src\set-organization-action.ts-39-    // the value is the user's own choice, not a secret. See the note in
--
packages\next-shell\src\RoleSwitcher.tsx-24- * ⚠️ CHANGING ROLE CHANGES THE NAVIGATION, not just the page. The action
packages\next-shell\src\RoleSwitcher.tsx-25- * revalidates the whole layout for that reason — a partial revalidation would
packages\next-shell\src\RoleSwitcher.tsx-26- * leave the shell showing the old role's menu around the new role's content,
packages\next-shell\src\RoleSwitcher.tsx-27- * which is exactly the nav/router divergence `packages/navigation` exists to
packages\next-shell\src\RoleSwitcher.tsx-28- * prevent.
packages\next-shell\src\RoleSwitcher.tsx-29- */
packages\next-shell\src\RoleSwitcher.tsx-30-
packages\next-shell\src\RoleSwitcher.tsx-31-export interface RoleOption {
packages\next-shell\src\RoleSwitcher.tsx:32:  /** The `role_name` as stored in `identity.memberships`. */
packages\next-shell\src\RoleSwitcher.tsx-33-  name: string;
packages\next-shell\src\RoleSwitcher.tsx-34-  /** Human label — `workshop_supervisor` reads badly in a top bar. */
packages\next-shell\src\RoleSwitcher.tsx-35-  label: string;
packages\next-shell\src\RoleSwitcher.tsx-36-}
packages\next-shell\src\RoleSwitcher.tsx-37-
packages\next-shell\src\RoleSwitcher.tsx-38-export function RoleSwitcher({
packages\next-shell\src\RoleSwitcher.tsx-39-  roles,
packages\next-shell\src\RoleSwitcher.tsx-40-  activeRole,
--
packages\next-shell\src\role-label.ts-12- * ⚠️ TYPECHECK, LINT AND `next build` ALL PASSED ON THE BROKEN VERSION. The
packages\next-shell\src\role-label.ts-13- * server/client boundary is enforced at RUNTIME, so every gate was green while
packages\next-shell\src\role-label.ts-14- * every page in the app returned "a server-side exception occurred". The only
packages\next-shell\src\role-label.ts-15- * thing that catches this is loading the page — which is why `/verify` exists
packages\next-shell\src\role-label.ts-16- * and why a clean build is not evidence a screen works.
packages\next-shell\src\role-label.ts-17- *
packages\next-shell\src\role-label.ts-18- * A pure string function has no business being in a client module anyway. Kept
packages\next-shell\src\role-label.ts-19- * derived rather than a lookup table: a table renders a NEW role as a blank
packages\next-shell\src\role-label.ts:20: * option, and a role added to `identity.memberships` must never appear in the
packages\next-shell\src\role-label.ts-21- * switcher as an empty choice.
packages\next-shell\src\role-label.ts-22- */
packages\next-shell\src\role-label.ts-23-export function roleLabel(roleName: string): string {
packages\next-shell\src\role-label.ts-24-  const words = roleName.replace(/_/g, ' ').trim();
packages\next-shell\src\role-label.ts-25-  return words.charAt(0).toUpperCase() + words.slice(1);
packages\next-shell\src\role-label.ts-26-}
--
packages\next-shell\src\OrganizationSwitcher.tsx-47-  // viewer was in exactly this state until a second membership existed.
packages\next-shell\src\OrganizationSwitcher.tsx-48-  if (organizations.length < 2) return null;
packages\next-shell\src\OrganizationSwitcher.tsx-49-
packages\next-shell\src\OrganizationSwitcher.tsx-50-  return (
packages\next-shell\src\OrganizationSwitcher.tsx-51-    <form ref={formRef} action={action} style={{ display: 'inline-flex' }}>
packages\next-shell\src\OrganizationSwitcher.tsx-52-      {/* Labelled for assistive technology without spending top-bar width on a
packages\next-shell\src\OrganizationSwitcher.tsx-53-          visible label — the selected organisation name is the visible text. */}
packages\next-shell\src\OrganizationSwitcher.tsx-54-      <label htmlFor="aw-org-switcher" style={SR_ONLY}>
packages\next-shell\src\OrganizationSwitcher.tsx:55:        Active organization
packages\next-shell\src\OrganizationSwitcher.tsx-56-      </label>
packages\next-shell\src\OrganizationSwitcher.tsx-57-      <select
packages\next-shell\src\OrganizationSwitcher.tsx-58-        id="aw-org-switcher"
packages\next-shell\src\OrganizationSwitcher.tsx-59-        name="organizationId"
packages\next-shell\src\OrganizationSwitcher.tsx-60-        /**
packages\next-shell\src\OrganizationSwitcher.tsx-61-         * ⚠️ SAME FIX AS `RoleSwitcher`, AND THE SAME LATENT DEFECT — this one
packages\next-shell\src\OrganizationSwitcher.tsx-62-         * was simply never exercised, because no account held two organisations
packages\next-shell\src\OrganizationSwitcher.tsx-63-         * until the seed data grew one.
--
packages\next-shell\src\index.ts-14- * model it is meant to guard.
packages\next-shell\src\index.ts-15- */
packages\next-shell\src\index.ts-16-export {
packages\next-shell\src\index.ts-17-  grantsFor,
packages\next-shell\src\index.ts-18-  navRoleFor,
packages\next-shell\src\index.ts-19-  isForeignToWorkshop,
packages\next-shell\src\index.ts-20-  viewerLabels,
packages\next-shell\src\index.ts-21-  NO_GRANTS,
packages\next-shell\src\index.ts:22:  organizationsFromMemberships,
packages\next-shell\src\index.ts-23-  rolesFromMemberships,
packages\next-shell\src\index.ts-24-  holdsRoleInActiveOrganization,
packages\next-shell\src\index.ts-25-  homeWorkspaceFor,
packages\next-shell\src\index.ts-26-} from './viewer-contract';
packages\next-shell\src\index.ts-27-export { viewerHasSession } from './viewer';
packages\next-shell\src\index.ts-28-export { hasWorkspaceAccess, WorkspaceAccessDenied } from './WorkspaceGate';
packages\next-shell\src\index.ts-29-export { requireWorkspaceAccess } from './require-access';
packages\next-shell\src\index.ts-30-export { requireNavRoute } from './require-route';
--
packages\next-shell\src\index.ts-32- * Resolves an "Add new …" target out of the viewer's OWN visible navigation,
packages\next-shell\src\index.ts-33- * so a create button can never point somewhere its owner would be refused.
packages\next-shell\src\index.ts-34- */
packages\next-shell\src\index.ts-35-export { quickCreateHref } from './quick-create';
packages\next-shell\src\index.ts-36-export { apiGet, apiPost, apiPut, apiPatch, apiDelete, describeApiFailure } from './api';
packages\next-shell\src\index.ts-37-export { ApiFailure } from './ApiFailure';
packages\next-shell\src\index.ts-38-export { OrganizationSwitcher } from './OrganizationSwitcher';
packages\next-shell\src\index.ts-39-export type { OrganizationOption } from './OrganizationSwitcher';
packages\next-shell\src\index.ts:40:export { setActiveOrganizationAction } from './set-organization-action';
packages\next-shell\src\index.ts-41-export { activeOrganizationId, ACTIVE_ORG_COOKIE } from './active-organization';
packages\next-shell\src\index.ts-42-export type { ApiResult } from './api';
packages\next-shell\src\index.ts-43-export type { ViewerDescription, ViewerLabels } from './viewer-contract';
packages\next-shell\src\index.ts-44-
packages\next-shell\src\index.ts-45-// Role switcher — one login acting as any role it holds, without signing out.
packages\next-shell\src\index.ts-46-export { RoleSwitcher } from './RoleSwitcher';
packages\next-shell\src\index.ts-47-// Server-safe: a pure string helper the app LAYOUT calls. Must not live in a
packages\next-shell\src\index.ts-48-// 'use client' module — see role-label.ts.
--
infrastructure\migrations\verify\087_fleet_data_layer.sql-442-    DELETE FROM core.vehicles          WHERE tenant_id IN (rf.o_tenant_id, v_ws_ten);
infrastructure\migrations\verify\087_fleet_data_layer.sql-443-    DELETE FROM core.customers         WHERE tenant_id IN (rf.o_tenant_id, v_ws_ten);
infrastructure\migrations\verify\087_fleet_data_layer.sql-444-    DELETE FROM catalogue.mechanic_directory WHERE id = v_ws_dir;
infrastructure\migrations\verify\087_fleet_data_layer.sql-445-    DELETE FROM comms.notifications
infrastructure\migrations\verify\087_fleet_data_layer.sql-446-     WHERE resource_type = 'organization_registration'
infrastructure\migrations\verify\087_fleet_data_layer.sql-447-       AND resource_id IN (SELECT id FROM identity.organization_registrations
infrastructure\migrations\verify\087_fleet_data_layer.sql-448-                            WHERE tenant_id = rf.o_tenant_id);
infrastructure\migrations\verify\087_fleet_data_layer.sql-449-    DELETE FROM identity.organization_registrations WHERE tenant_id = rf.o_tenant_id;
infrastructure\migrations\verify\087_fleet_data_layer.sql:450:    DELETE FROM identity.memberships   WHERE tenant_id IN (rf.o_tenant_id, v_ws_ten, v_third_ten);
infrastructure\migrations\verify\087_fleet_data_layer.sql-451-    DELETE FROM identity.branches      WHERE tenant_id IN (rf.o_tenant_id, v_ws_ten, v_third_ten);
infrastructure\migrations\verify\087_fleet_data_layer.sql-452-    DELETE FROM identity.organizations WHERE tenant_id IN (rf.o_tenant_id, v_ws_ten, v_third_ten);
infrastructure\migrations\verify\087_fleet_data_layer.sql-453-    DELETE FROM identity.tenants       WHERE id IN (rf.o_tenant_id, v_ws_ten, v_third_ten);
infrastructure\migrations\verify\087_fleet_data_layer.sql-454-    DELETE FROM identity.users         WHERE id IN (v_user_f, v_user_w);
infrastructure\migrations\verify\087_fleet_data_layer.sql-455-
infrastructure\migrations\verify\087_fleet_data_layer.sql-456-    RAISE NOTICE 'verify/087: % checks passed. Checks 4 and 5 are the evidence — the '
infrastructure\migrations\verify\087_fleet_data_layer.sql-457-                 'WORKSHOP reads a row in the FLEET''s tenant, and a third organisation '
infrastructure\migrations\verify\087_fleet_data_layer.sql-458-                 'reads nothing. Check 6 proves the boundary column is derived from the '
--
infrastructure\migrations\verify\086_insurance_enquiries.sql-429-    DELETE FROM insurance.enquiries WHERE tenant_id IN (ra.o_tenant_id, rb.o_tenant_id);
infrastructure\migrations\verify\086_insurance_enquiries.sql-430-    DELETE FROM insurance.products  WHERE tenant_id IN (ra.o_tenant_id, rb.o_tenant_id);
infrastructure\migrations\verify\086_insurance_enquiries.sql-431-    DELETE FROM comms.notifications
infrastructure\migrations\verify\086_insurance_enquiries.sql-432-     WHERE resource_type = 'organization_registration'
infrastructure\migrations\verify\086_insurance_enquiries.sql-433-       AND resource_id IN (SELECT id FROM identity.organization_registrations
infrastructure\migrations\verify\086_insurance_enquiries.sql-434-                            WHERE tenant_id IN (ra.o_tenant_id, rb.o_tenant_id));
infrastructure\migrations\verify\086_insurance_enquiries.sql-435-    DELETE FROM identity.organization_registrations
infrastructure\migrations\verify\086_insurance_enquiries.sql-436-     WHERE tenant_id IN (ra.o_tenant_id, rb.o_tenant_id);
infrastructure\migrations\verify\086_insurance_enquiries.sql:437:    DELETE FROM identity.memberships   WHERE tenant_id IN (ra.o_tenant_id, rb.o_tenant_id);
infrastructure\migrations\verify\086_insurance_enquiries.sql-438-    DELETE FROM identity.branches      WHERE tenant_id IN (ra.o_tenant_id, rb.o_tenant_id);
infrastructure\migrations\verify\086_insurance_enquiries.sql-439-    DELETE FROM identity.organizations WHERE tenant_id IN (ra.o_tenant_id, rb.o_tenant_id);
infrastructure\migrations\verify\086_insurance_enquiries.sql-440-    DELETE FROM identity.tenants       WHERE id IN (ra.o_tenant_id, rb.o_tenant_id);
infrastructure\migrations\verify\086_insurance_enquiries.sql-441-    DELETE FROM identity.users         WHERE id IN (v_user_a, v_user_b);
infrastructure\migrations\verify\086_insurance_enquiries.sql-442-
infrastructure\migrations\verify\086_insurance_enquiries.sql-443-    RAISE NOTICE 'verify/086: % checks passed. Check 3 is the privilege evidence '
infrastructure\migrations\verify\086_insurance_enquiries.sql-444-                 '(the app role cannot write this table at all) and 4a/4b are the '
infrastructure\migrations\verify\086_insurance_enquiries.sql-445-                 'policy evidence, forging ONLY the tenant so the foreign key cannot '
--
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-72-    -- Not raw INSERTs. Ask of any green proof: could the PRODUCT have produced
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-73-    -- this fixture? Here it did.
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-74-    SELECT * INTO ri FROM identity.register_insurer(v_subject_i, 'Verify 085 Assurance', 'Head office');
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-75-    SELECT * INTO rt FROM identity.register_towing_operator(v_subject_t, 'Verify 085 Recovery', 'Main depot');
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-76-    passed := passed + 1;
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-77-
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-78-    -- ── 3. the founder holds the ORG-ADMIN role, not the operational one ───
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-79-    SELECT role_name INTO v_role
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql:80:      FROM identity.memberships WHERE id = ri.o_membership_id;
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-81-    IF v_role <> 'insurance_owner' THEN
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-82-        RAISE EXCEPTION 'verify/085 #3: register_insurer wrote role % — expected '
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-83-                        'insurance_owner. An insurer whose founder is an assessor '
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-84-                        'can never appoint anybody.', v_role;
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-85-    END IF;
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-86-
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-87-    SELECT role_name INTO v_role
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql:88:      FROM identity.memberships WHERE id = rt.o_membership_id;
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-89-    IF v_role <> 'towing_owner' THEN
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-90-        RAISE EXCEPTION 'verify/085 #3: register_towing_operator wrote role % — '
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-91-                        'expected towing_owner.', v_role;
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-92-    END IF;
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-93-    passed := passed + 1;
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-94-
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-95-    -- ── 4. a second membership can EXIST in each organisation ─────────────
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-96-    --
--
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-108-    -- insert would still succeed if `insurance_owner` were deleted from every
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-109-    -- allow-list in the API — so a green run here is necessary and NOT
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-110-    -- sufficient.
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-111-    --
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-112-    -- ▶ The authority half is asserted in `membership-role-fit.spec.ts`
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-113-    --   ("every organisation type that can be REGISTERED has a role that can
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-114-    --   GRANT"), which reads `CAN_GRANT_MEMBERSHIP` as text. The two halves
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-115-    --   together are the proof; neither alone is.
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql:116:    INSERT INTO identity.memberships
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-117-        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-118-    VALUES (gen_random_uuid(), ri.o_tenant_id, ri.o_organization_id, ri.o_branch_id,
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-119-            v_staff, 'insurance_assessor', 'active', v_user_i);
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-120-
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-121-    SELECT count(*) INTO n
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql:122:      FROM identity.memberships
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-123-     WHERE organization_id = ri.o_organization_id AND status = 'active';
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-124-    IF n <> 2 THEN
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-125-        RAISE EXCEPTION 'verify/085 #4a: the insurer has % active member(s) after '
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-126-                        'a second was added — expected 2.', n;
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-127-    END IF;
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-128-
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-129-    -- 🔴 TOWING TOO. The first version of this file asserted only the insurance
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-130-    -- side while its header claimed both organisation types could build a team
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-131-    -- — a header that described a test that was not there.
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql:132:    INSERT INTO identity.memberships
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-133-        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-134-    VALUES (gen_random_uuid(), rt.o_tenant_id, rt.o_organization_id, rt.o_branch_id,
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-135-            v_staff, 'towing_operator', 'active', v_user_t);
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-136-
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-137-    SELECT count(*) INTO n
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql:138:      FROM identity.memberships
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-139-     WHERE organization_id = rt.o_organization_id AND status = 'active';
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-140-    IF n <> 2 THEN
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-141-        RAISE EXCEPTION 'verify/085 #4b: the towing firm has % active member(s) '
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-142-                        'after a second was added — expected 2.', n;
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-143-    END IF;
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-144-    passed := passed + 1;
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-145-
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-146-    -- ── 5. every insurance/towing organisation has a grantor ───────────────
--
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-148-    -- against whatever the database actually contains — including rows the
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-149-    -- backfill touched, which the migration's own check ran before this file
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-150-    -- ever existed.
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-151-    SELECT count(*) INTO n
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-152-      FROM identity.organizations o
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-153-     WHERE o.org_type IN ('insurance_company', 'towing_company')
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-154-       AND o.status = 'active'
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-155-       AND NOT EXISTS (
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql:156:             SELECT 1 FROM identity.memberships m
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-157-              WHERE m.organization_id = o.id
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-158-                AND m.tenant_id = o.tenant_id
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-159-                AND m.status = 'active'
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-160-                AND m.role_name IN ('insurance_owner', 'towing_owner')
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-161-           );
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-162-    IF n > 0 THEN
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-163-        RAISE EXCEPTION 'verify/085 #5: % insurance/towing organisation(s) have '
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-164-                        'no member who can grant a membership.', n;
--
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-191-    -- which runs once, before any grant is possible.
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-192-    --
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-193-    -- What IS durable is a statement about THIS FILE'S OWN FIXTURES, whose
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-194-    -- history is fully known: two organisations were registered a few
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-195-    -- statements ago and one operational member was added to each, so each must
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-196-    -- hold exactly one org admin. That catches a backfill promoting by role
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-197-    -- name without making a claim about rows this file did not create.
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-198-    SELECT count(*) INTO n
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql:199:      FROM identity.memberships
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-200-     WHERE organization_id IN (ri.o_organization_id, rt.o_organization_id)
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-201-       AND status = 'active'
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-202-       AND role_name IN ('insurance_owner', 'towing_owner');
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-203-    IF n <> 2 THEN
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-204-        RAISE EXCEPTION 'verify/085 #6: this file''s two fixture organisations '
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-205-                        'hold % org admin(s) between them — expected exactly 2 '
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-206-                        '(one each). More than that is the signature of a '
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-207-                        'backfill promoting by role name rather than by founder.', n;
--
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-245-    VALUES ('verify-085-solo', 'verify-085-solo-' || replace(gen_random_uuid()::text,'-',''))
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-246-    RETURNING id INTO v_solo_ten;
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-247-
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-248-    INSERT INTO identity.organizations (tenant_id, name, org_type, status)
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-249-    VALUES (v_solo_ten, 'Verify 085 Succession Insurer', 'insurance_company', 'active')
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-250-    RETURNING id INTO v_solo_org;
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-251-
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-252-    -- The real founder, self-created and EARLIEST — but no longer active.
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql:253:    INSERT INTO identity.memberships
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-254-        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-255-    VALUES (gen_random_uuid(), v_solo_ten, v_solo_org, NULL,
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-256-            v_user_i, 'insurance_owner', 'revoked', v_user_i);
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-257-
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-258-    -- The sole surviving member: an ordinary assessor, appointed by the founder.
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql:259:    INSERT INTO identity.memberships
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-260-        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by,
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-261-         created_at)
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-262-    VALUES (gen_random_uuid(), v_solo_ten, v_solo_org, NULL,
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-263-            v_staff, 'insurance_assessor', 'active', v_user_i, now() + interval '1 second')
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-264-    RETURNING id INTO v_solo_mem;
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-265-
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-266-    -- The migration's founder rule, as it actually stands.
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-267-    WITH ranked AS (
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-268-        SELECT m.id, m.created_by, m.user_id,
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-269-               row_number() OVER (PARTITION BY m.organization_id
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-270-                                      ORDER BY m.created_at ASC, m.id ASC) AS rn
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql:271:          FROM identity.memberships m
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-272-          JOIN identity.organizations o
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-273-            ON o.id = m.organization_id AND o.tenant_id = m.tenant_id
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-274-         WHERE o.org_type IN ('insurance_company','towing_company')
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-275-           AND m.status = 'active'
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-276-           AND o.id = v_solo_org
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-277-    )
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-278-    SELECT count(*) INTO n
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-279-      FROM ranked
--
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-284-        RAISE EXCEPTION 'verify/085 #6: the sole surviving ASSESSOR of an organisation '
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-285-                        'whose founder was revoked matched the founder rule and would be '
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-286-                        'promoted to insurance_owner — gaining organization.admin and '
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-287-                        'finance.read. `rn = 1` means EARLIEST ACTIVE, not FIRST EVER. '
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-288-                        'Do not widen this rule on the surviving population; name the '
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-289-                        'organisations explicitly instead.';
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-290-    END IF;
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-291-
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql:292:    DELETE FROM identity.memberships   WHERE tenant_id = v_solo_ten;
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-293-    DELETE FROM identity.organizations WHERE tenant_id = v_solo_ten;
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-294-    DELETE FROM identity.tenants       WHERE id = v_solo_ten;
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-295-    passed := passed + 1;
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-296-
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-297-    -- ── CLEANUP ───────────────────────────────────────────────────────────
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-298-    -- Explicit DELETEs in dependency order, matching verify/080 rather than an
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-299-    -- exception-rollback: a verify that leaves fixtures behind pollutes the
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-300-    -- directory counts every later assertion reads, and check 5 above is
--
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-305-    -- one check 4 created, which is why this deletes by tenant rather than by
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-306-    -- the founder's membership id.
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-307-    DELETE FROM comms.notifications
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-308-     WHERE resource_type = 'organization_registration'
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-309-       AND resource_id IN (SELECT id FROM identity.organization_registrations
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-310-                            WHERE tenant_id IN (ri.o_tenant_id, rt.o_tenant_id));
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-311-    DELETE FROM identity.organization_registrations
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-312-     WHERE tenant_id IN (ri.o_tenant_id, rt.o_tenant_id);
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql:313:    DELETE FROM identity.memberships   WHERE tenant_id IN (ri.o_tenant_id, rt.o_tenant_id);
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-314-    DELETE FROM identity.branches      WHERE tenant_id IN (ri.o_tenant_id, rt.o_tenant_id);
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-315-    DELETE FROM identity.organizations WHERE tenant_id IN (ri.o_tenant_id, rt.o_tenant_id);
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-316-    DELETE FROM identity.tenants       WHERE id IN (ri.o_tenant_id, rt.o_tenant_id);
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-317-    DELETE FROM identity.users         WHERE id IN (v_user_i, v_user_t, v_staff);
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-318-
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-319-    RAISE NOTICE 'verify/085: % checks passed. Check 4 is the evidence — a '
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-320-                 'SECOND membership inside an insurer founded by the product, '
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql-321-                 'which was impossible before 085.', passed;
--
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-179-    -- perfectly correct database and name a role the product deliberately
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-180-    -- stopped writing. Found by the Supervisor, 2026-08-17.
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-181-    --
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-182-    -- What 080 actually proved, and what still holds, is that the FUNCTION
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-183-    -- writes an active founder membership at all: before 080 no production code
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-184-    -- path could create one. That claim is preserved; only the role vocabulary
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-185-    -- is widened to include its 085 successor. The 085-specific assertion —
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-186-    -- that the role is precisely the org admin — lives in `verify/085`.
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql:187:    SELECT count(*) INTO n FROM identity.memberships
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-188-     WHERE id = ri.o_membership_id AND user_id = v_user_i
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-189-       AND organization_id = ri.o_organization_id
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-190-       AND role_name IN ('insurance_assessor', 'insurance_owner')
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-191-       AND status = 'active';
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-192-    IF n <> 1 THEN
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-193-        RAISE EXCEPTION 'verify/080 #4c: no active insurance founder membership '
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-194-                        'was written — the role still cannot exist in production';
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-195-    END IF;
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-196-
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql:197:    SELECT count(*) INTO n FROM identity.memberships
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-198-     WHERE id = rt.o_membership_id AND user_id = v_user_t
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-199-       AND organization_id = rt.o_organization_id
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-200-       AND role_name IN ('towing_operator', 'towing_owner')
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-201-       AND status = 'active';
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-202-    IF n <> 1 THEN
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-203-        RAISE EXCEPTION 'verify/080 #4d: no active towing founder membership was '
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-204-                        'written — the role still cannot exist in production';
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-205-    END IF;
--
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-288-    -- Notifications first, then the registration row, then the organisation:
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-289-    -- 069 scopes the registration to the org.
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-290-    DELETE FROM comms.notifications
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-291-     WHERE resource_type = 'organization_registration'
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-292-       AND resource_id IN (SELECT id FROM identity.organization_registrations
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-293-                            WHERE tenant_id IN (ri.o_tenant_id, rt.o_tenant_id));
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-294-    DELETE FROM identity.organization_registrations
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-295-     WHERE tenant_id IN (ri.o_tenant_id, rt.o_tenant_id);
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql:296:    DELETE FROM identity.memberships   WHERE tenant_id IN (ri.o_tenant_id, rt.o_tenant_id);
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-297-    DELETE FROM identity.branches      WHERE tenant_id IN (ri.o_tenant_id, rt.o_tenant_id);
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-298-    DELETE FROM identity.organizations WHERE tenant_id IN (ri.o_tenant_id, rt.o_tenant_id);
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-299-    DELETE FROM identity.tenants       WHERE id IN (ri.o_tenant_id, rt.o_tenant_id);
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-300-    DELETE FROM identity.users         WHERE id IN (v_user_i, v_user_t);
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-301-
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-302-    RAISE NOTICE 'verify/080: % checks passed. Checks 4c and 4d are the evidence '
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-303-                 '— an ACTIVE insurance and towing FOUNDER membership written by '
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql-304-                 'the PRODUCT, not by a seed script. (085 changed WHICH role that '
--
infrastructure\migrations\verify\075_fleet_registration.sql-94-        RAISE EXCEPTION 'verify/075 #4b: the organisation is not an active '
infrastructure\migrations\verify\075_fleet_registration.sql-95-                        'fleet_operator';
infrastructure\migrations\verify\075_fleet_registration.sql-96-    END IF;
infrastructure\migrations\verify\075_fleet_registration.sql-97-
infrastructure\migrations\verify\075_fleet_registration.sql-98-    -- 🔴 AND THE MEMBERSHIP IS THE ROLE THE NAVIGATION TREE EXPECTS. A merely
infrastructure\migrations\verify\075_fleet_registration.sql-99-    -- plausible name here resolves to no tree and no permissions, and the
infrastructure\migrations\verify\075_fleet_registration.sql-100-    -- registrant lands somewhere they can see nothing — failing CLOSED and
infrastructure\migrations\verify\075_fleet_registration.sql-101-    -- silently, which is how `quality_controller` survived for months.
infrastructure\migrations\verify\075_fleet_registration.sql:102:    SELECT count(*) INTO n FROM identity.memberships
infrastructure\migrations\verify\075_fleet_registration.sql-103-     WHERE id = r.o_membership_id
infrastructure\migrations\verify\075_fleet_registration.sql-104-       AND user_id = v_user
infrastructure\migrations\verify\075_fleet_registration.sql-105-       AND organization_id = r.o_organization_id
infrastructure\migrations\verify\075_fleet_registration.sql-106-       AND role_name = 'fleet_administrator'
infrastructure\migrations\verify\075_fleet_registration.sql-107-       AND status = 'active';
infrastructure\migrations\verify\075_fleet_registration.sql-108-    IF n <> 1 THEN
infrastructure\migrations\verify\075_fleet_registration.sql-109-        RAISE EXCEPTION 'verify/075 #4c: no active fleet_administrator membership '
infrastructure\migrations\verify\075_fleet_registration.sql-110-                        'was written — the role still cannot exist in production';
--
infrastructure\migrations\verify\075_fleet_registration.sql-143-    IF NOT refused THEN
infrastructure\migrations\verify\075_fleet_registration.sql-144-        RAISE EXCEPTION 'verify/075 #6: one account registered two fleets';
infrastructure\migrations\verify\075_fleet_registration.sql-145-    END IF;
infrastructure\migrations\verify\075_fleet_registration.sql-146-    passed := passed + 1;
infrastructure\migrations\verify\075_fleet_registration.sql-147-
infrastructure\migrations\verify\075_fleet_registration.sql-148-    -- ── CLEANUP ───────────────────────────────────────────────────────────
infrastructure\migrations\verify\075_fleet_registration.sql-149-    -- The registration row before the organisation: 069 scopes it to the org.
infrastructure\migrations\verify\075_fleet_registration.sql-150-    DELETE FROM identity.organization_registrations WHERE tenant_id = r.o_tenant_id;
infrastructure\migrations\verify\075_fleet_registration.sql:151:    DELETE FROM identity.memberships   WHERE tenant_id = r.o_tenant_id;
infrastructure\migrations\verify\075_fleet_registration.sql-152-    DELETE FROM identity.branches      WHERE tenant_id = r.o_tenant_id;
infrastructure\migrations\verify\075_fleet_registration.sql-153-    DELETE FROM identity.organizations WHERE tenant_id = r.o_tenant_id;
infrastructure\migrations\verify\075_fleet_registration.sql-154-    DELETE FROM identity.tenants       WHERE id = r.o_tenant_id;
infrastructure\migrations\verify\075_fleet_registration.sql-155-    DELETE FROM identity.users         WHERE id = v_user;
infrastructure\migrations\verify\075_fleet_registration.sql-156-
infrastructure\migrations\verify\075_fleet_registration.sql-157-    RAISE NOTICE 'verify/075: % / 5 passed. Check 4 is the evidence — a '
infrastructure\migrations\verify\075_fleet_registration.sql-158-                 'fleet_administrator membership written by the PRODUCT, not by '
infrastructure\migrations\verify\075_fleet_registration.sql-159-                 'a seed script.', passed;
--
infrastructure\migrations\verify\060_notifications.sql-197-    --     Proven with a REAL customer membership, not by reading the role list:
infrastructure\migrations\verify\060_notifications.sql-198-    --     a check that inspects the source of the thing it is checking passes
infrastructure\migrations\verify\060_notifications.sql-199-    --     for the same reason the code was written, which is no evidence at all.
infrastructure\migrations\verify\060_notifications.sql-200-    INSERT INTO identity.users (id, keycloak_subject, email, display_name, created_by)
infrastructure\migrations\verify\060_notifications.sql-201-    VALUES (gen_random_uuid(), 'verify060-cust-' || gen_random_uuid()::text,
infrastructure\migrations\verify\060_notifications.sql-202-            'verify060-customer@example.test', 'Verify 060 Customer', me)
infrastructure\migrations\verify\060_notifications.sql-203-    RETURNING id INTO other_user;
infrastructure\migrations\verify\060_notifications.sql-204-
infrastructure\migrations\verify\060_notifications.sql:205:    INSERT INTO identity.memberships
infrastructure\migrations\verify\060_notifications.sql-206-        (tenant_id, organization_id, user_id, role_name, status, created_by)
infrastructure\migrations\verify\060_notifications.sql-207-    VALUES (tid, oid, other_user, 'customer', 'active', me)
infrastructure\migrations\verify\060_notifications.sql-208-    ON CONFLICT (organization_id, user_id, role_name) DO NOTHING;
infrastructure\migrations\verify\060_notifications.sql-209-
infrastructure\migrations\verify\060_notifications.sql-210-    PERFORM comms.notify_workshop_staff(
infrastructure\migrations\verify\060_notifications.sql-211-        tid, oid, 'service_request.created', 'Intake', 'A customer asked for service.',
infrastructure\migrations\verify\060_notifications.sql-212-        'service_request', gen_random_uuid(), 'verify060-staff:' || gen_random_uuid()::text);
infrastructure\migrations\verify\060_notifications.sql-213-
--
infrastructure\migrations\verify\060_notifications.sql-285-    passed := passed + 1;
infrastructure\migrations\verify\060_notifications.sql-286-
infrastructure\migrations\verify\060_notifications.sql-287-    -- Restore the caller for the cleanup below.
infrastructure\migrations\verify\060_notifications.sql-288-    PERFORM set_config('app.user_id', me::text, true);
infrastructure\migrations\verify\060_notifications.sql-289-    PERFORM set_config('app.current_role', 'reception_staff', true);
infrastructure\migrations\verify\060_notifications.sql-290-
infrastructure\migrations\verify\060_notifications.sql-291-    DELETE FROM comms.notifications WHERE dedupe_key LIKE 'verify060%';
infrastructure\migrations\verify\060_notifications.sql-292-    DELETE FROM comms.notifications WHERE recipient_id = other_user;
infrastructure\migrations\verify\060_notifications.sql:293:    DELETE FROM identity.memberships WHERE user_id = other_user;
infrastructure\migrations\verify\060_notifications.sql-294-    DELETE FROM identity.users WHERE id = other_user;
infrastructure\migrations\verify\060_notifications.sql-295-    DELETE FROM core.notification_preferences
infrastructure\migrations\verify\060_notifications.sql-296-     WHERE organization_id = oid AND event_key IN ('quiet.event','mixed.event');
infrastructure\migrations\verify\060_notifications.sql-297-
infrastructure\migrations\verify\060_notifications.sql-298-    RAISE NOTICE 'verify/060: % / 15 passed (4 and 11 are only MEANINGFUL under rehearsal — locally a superuser bypasses RLS)', passed;
infrastructure\migrations\verify\060_notifications.sql-299-END
infrastructure\migrations\verify\060_notifications.sql-300-$verify$;
--
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-48-GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA identity TO verify039_owner;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-49--- The policies call `identity.is_platform_admin()` and friends, which are
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-50--- REVOKEd from PUBLIC — without EXECUTE the owner fails on the helper rather
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-51--- than on the policy, and the run reports a permission error that reads like the
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-52--- fix breaking registration. This role stands in for `autoworkshop`, which owns
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-53--- them all and needs no grant.
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-54-GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA identity TO verify039_owner;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-55-
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql:56:ALTER FUNCTION identity.memberships_for_subject(TEXT)                 OWNER TO verify039_owner;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-57-ALTER FUNCTION identity.register_workshop(TEXT, TEXT, TEXT)           OWNER TO verify039_owner;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-58-ALTER FUNCTION identity.provision_user_from_subject(TEXT, TEXT, TEXT) OWNER TO verify039_owner;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-59-
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-60-SET LOCAL ROLE autoworkshop_app;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-61-
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-62-DO $$
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-63-DECLARE
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-64-  s        TEXT := (SELECT v FROM _fx39 WHERE k = 'subject');
--
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-74-  -- ── 0. IS THIS MEASUREMENT EVEN VALID? ────────────────────────────────────
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-75-  IF current_user <> 'autoworkshop_app' THEN
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-76-    RAISE EXCEPTION 'MEASUREMENT INVALID: caller is %, not autoworkshop_app', current_user;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-77-  END IF;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-78-
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-79-  SELECT r.rolsuper INTO owner_su
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-80-    FROM pg_proc p
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-81-    JOIN pg_roles r ON r.oid = p.proowner
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql:82:   WHERE p.oid = 'identity.memberships_for_subject(text)'::regprocedure;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-83-
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-84-  IF owner_su IS NOT FALSE THEN
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-85-    RAISE EXCEPTION
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-86-      'MEASUREMENT INVALID: memberships_for_subject still executes as a SUPERUSER, '
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-87-      'so RLS is bypassed and NOTHING below is being tested. This is the blind spot '
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-88-      'that let 037 and 038 both ship green while the READ path stayed broken.';
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-89-  END IF;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-90-  -- ⚠️ AND THEY MUST DIFFER. Without this the run passes checks 0-5 and fails 6
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-91-  -- for a reason that has nothing to do with the product.
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-92-  IF (SELECT r.rolname
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-93-        FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql:94:       WHERE p.oid = 'identity.memberships_for_subject(text)'::regprocedure) = current_user THEN
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-95-    RAISE EXCEPTION
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-96-      'MEASUREMENT INVALID: the function owner and the caller are the same role, '
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-97-      'so the owner check cannot discriminate and check 6 tests nothing.';
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-98-  END IF;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-99-  RAISE NOTICE 'PASS 0  the lookup executes as a NON-superuser that is not the caller';
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-100-
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-101-  -- ── 1. a brand-new person resolves, with no membership ────────────────────
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-102-  -- The honest "no workshop yet" case, which must keep working: it is what the
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-103-  -- onboarding screen is for.
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-104-  uid := identity.provision_user_from_subject(s, 'verify039@example.com', 'Verify Threenine');
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-105-  IF uid IS NULL THEN RAISE EXCEPTION 'FAIL 1: sign-up returned no user id'; END IF;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-106-
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql:107:  SELECT count(*) INTO n FROM identity.memberships_for_subject(s) WHERE tenant_id IS NOT NULL;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-108-  IF n <> 0 THEN
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-109-    RAISE EXCEPTION 'FAIL 1b: a new user already has % membership(s)', n;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-110-  END IF;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-111-  RAISE NOTICE 'PASS 1  a new user resolves with no membership';
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-112-
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-113-  -- ── 2. THE DEFECT ITSELF ──────────────────────────────────────────────────
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-114-  -- Register a workshop, then look the same subject up again. Before 039 this
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-115-  -- returned ONE row with tenant_id NULL — the user survived the LEFT JOIN, the
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-116-  -- membership was filtered out by RLS, and the application read that as "this
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-117-  -- person has no workshop".
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-118-  SELECT * INTO reg FROM identity.register_workshop(s, 'Verify039 Workshop', 'Verify039 Branch');
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-119-  IF reg.membership_id IS NULL THEN
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-120-    RAISE EXCEPTION 'FAIL 2: registration did not return a membership id';
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-121-  END IF;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-122-
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql:123:  SELECT count(*) INTO n FROM identity.memberships_for_subject(s) WHERE tenant_id IS NOT NULL;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-124-  IF n <> 1 THEN
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-125-    RAISE EXCEPTION
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-126-      'FAIL 2b: the lookup returned % membership rows, expected 1. This is THE '
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-127-      'defect: RLS filtered the membership and the LEFT JOIN turned "refused" '
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-128-      'into "has none".', n;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-129-  END IF;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-130-  RAISE NOTICE 'PASS 2  after registering, the lookup FINDS the membership';
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-131-
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-132-  -- ── 3. it resolves to the right role, not merely to a row ─────────────────
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql:133:  SELECT * INTO row1 FROM identity.memberships_for_subject(s) WHERE tenant_id IS NOT NULL;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-134-  IF row1.role_name <> 'workshop_owner' THEN
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-135-    RAISE EXCEPTION 'FAIL 3: resolved role is %, expected workshop_owner',
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-136-      COALESCE(row1.role_name, '(none)');
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-137-  END IF;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-138-  IF row1.tenant_id <> reg.tenant_id THEN
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-139-    RAISE EXCEPTION 'FAIL 3b: resolved a DIFFERENT tenant than registration created';
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-140-  END IF;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-141-  RAISE NOTICE 'PASS 3  it resolves the right tenant and the right role';
--
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-157-  END IF;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-158-  RAISE NOTICE 'PASS 5  the lookup flag is cleared before the function returns';
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-159-
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-160-  -- ── 6. THE APP ROLE CANNOT OPEN THE DOOR ITSELF ───────────────────────────
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-161-  -- `set_config` is not privileged, so the flag alone is forgeable — that was
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-162-  -- 038's finding on the write side, and it applies identically here. The owner
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-163-  -- check is what makes it safe. Prove it by DOING the forbidden thing.
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-164-  PERFORM set_config('app.membership_lookup', s, true);
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql:165:  SELECT count(*) INTO leaked FROM identity.memberships WHERE user_id = uid;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-166-  PERFORM set_config('app.membership_lookup', '', true);
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-167-  IF leaked <> 0 THEN
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-168-    RAISE EXCEPTION
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-169-      'FAIL 6: the app role set the flag itself and read % membership row(s) '
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-170-      'directly. The owner check is not holding.', leaked;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-171-  END IF;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-172-  RAISE NOTICE 'PASS 6  setting the flag from the app role opens nothing';
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-173-
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-174-  -- ── 7. IT CANNOT REACH ANOTHER PERSON'S MEMBERSHIPS ───────────────────────
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-175-  -- The policy pins user_id to the subject being resolved. A second person's
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-176-  -- rows must stay invisible even while the door is open for the first.
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-177-  uid2 := identity.provision_user_from_subject(s2, 'verify039b@example.com', 'Verify Threenine B');
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-178-  PERFORM identity.register_workshop(s2, 'Verify039 Other Workshop', 'Other Branch');
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-179-
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-180-  SELECT count(*) INTO n
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql:181:    FROM identity.memberships_for_subject(s)
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-182-   WHERE tenant_id IS NOT NULL AND user_id = uid2;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-183-  IF n <> 0 THEN
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-184-    RAISE EXCEPTION 'FAIL 7: looking up one subject returned ANOTHER user''s membership';
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-185-  END IF;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-186-
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql:187:  SELECT count(*) INTO n FROM identity.memberships_for_subject(s) WHERE tenant_id IS NOT NULL;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-188-  IF n <> 1 THEN
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-189-    RAISE EXCEPTION 'FAIL 7b: the lookup returned % rows for one subject, expected 1', n;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-190-  END IF;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-191-  RAISE NOTICE 'PASS 7  one subject in, only that subject''s membership out';
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-192-
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-193-  -- ── 8. AND THE SECOND PERSON STILL RESOLVES ───────────────────────────────
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-194-  -- A policy that returns nothing for everybody would pass check 7 while
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-195-  -- breaking the product. Check 7 alone cannot tell those apart.
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql:196:  SELECT count(*) INTO n FROM identity.memberships_for_subject(s2) WHERE tenant_id IS NOT NULL;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-197-  IF n <> 1 THEN
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-198-    RAISE EXCEPTION 'FAIL 8: the SECOND user resolves % memberships, expected 1', n;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-199-  END IF;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-200-  RAISE NOTICE 'PASS 8  the other user resolves their own membership too';
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-201-
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-202-  -- ── 9. TENANT ISOLATION IS UNTOUCHED ──────────────────────────────────────
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-203-  -- 039 adds a policy to a table carrying the product's Severity-1 control. An
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-204-  -- ordinary read with no context must still see nothing.
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql:205:  SELECT count(*) INTO leaked FROM identity.memberships;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-206-  IF leaked <> 0 THEN
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-207-    RAISE EXCEPTION
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-208-      'FAIL 9: a plain SELECT with no tenant context returned % membership row(s). '
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-209-      '039 has widened tenant isolation, which it must not.', leaked;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-210-  END IF;
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-211-  RAISE NOTICE 'PASS 9  tenant isolation still denies a context-free read';
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-212-
infrastructure\migrations\verify\039_membership_lookup_can_read_own_rows.sql-213-  RAISE NOTICE 'verify/039: 10/10';
--
infrastructure\migrations\verify\038_bootstrap_door_requires_definer.sql-114-    WHEN raise_exception THEN
infrastructure\migrations\verify\038_bootstrap_door_requires_definer.sql-115-      IF SQLERRM LIKE 'FAIL 2:%' THEN RAISE; END IF;
infrastructure\migrations\verify\038_bootstrap_door_requires_definer.sql-116-      RAISE NOTICE 'PASS 2  the app role cannot open the door: %', SQLERRM;
infrastructure\migrations\verify\038_bootstrap_door_requires_definer.sql-117-  END;
infrastructure\migrations\verify\038_bootstrap_door_requires_definer.sql-118-
infrastructure\migrations\verify\038_bootstrap_door_requires_definer.sql-119-  -- ── 3. nor read a membership through it ──────────────────────────────────
infrastructure\migrations\verify\038_bootstrap_door_requires_definer.sql-120-  -- The SELECT policy carried the same flaw. A forged flag must not turn the
infrastructure\migrations\verify\038_bootstrap_door_requires_definer.sql-121-  -- narrow duplicate-check read into a general one.
infrastructure\migrations\verify\038_bootstrap_door_requires_definer.sql:122:  IF EXISTS (SELECT 1 FROM identity.memberships WHERE user_id = uid) THEN
infrastructure\migrations\verify\038_bootstrap_door_requires_definer.sql-123-    RAISE EXCEPTION
infrastructure\migrations\verify\038_bootstrap_door_requires_definer.sql-124-      'FAIL 3: the app role read a membership through the forged bootstrap flag';
infrastructure\migrations\verify\038_bootstrap_door_requires_definer.sql-125-  END IF;
infrastructure\migrations\verify\038_bootstrap_door_requires_definer.sql-126-  RAISE NOTICE 'PASS 3  the forged flag opens no read either';
infrastructure\migrations\verify\038_bootstrap_door_requires_definer.sql-127-
infrastructure\migrations\verify\038_bootstrap_door_requires_definer.sql-128-  -- ── 4. and the helper itself says so ─────────────────────────────────────
infrastructure\migrations\verify\038_bootstrap_door_requires_definer.sql-129-  -- Asserted directly, so a future change to the policies cannot quietly leave
infrastructure\migrations\verify\038_bootstrap_door_requires_definer.sql-130-  -- the predicate true for the app role while the INSERTs happen to fail for
--
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-107-  END IF;
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-108-  RAISE NOTICE 'PASS 2  registration creates tenant + organisation + branch + membership under FORCE RLS';
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-109-
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-110-  -- ── 3. the rows are real, seen through the boundary the app itself uses ───
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-111-  -- NOT a direct SELECT: that correctly returns zero under RLS with no tenant
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-112-  -- context, and reading that as a failure is how verify/036's first draft
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-113-  -- reported a working registration as broken.
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-114-  SELECT role_name INTO role
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql:115:    FROM identity.memberships_for_subject(s) WHERE tenant_id IS NOT NULL;
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-116-  IF role IS DISTINCT FROM 'workshop_owner' THEN
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-117-    RAISE EXCEPTION 'FAIL 3: resolved role is %, expected workshop_owner', COALESCE(role, '(none)');
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-118-  END IF;
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-119-  RAISE NOTICE 'PASS 3  the registrant resolves as workshop_owner — the nav tree and permissions will bind';
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-120-
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-121-  -- ── 4. 🔴 THE DUPLICATE GUARD ACTUALLY FIRES NOW ──────────────────────────
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-122-  -- This is the second defect 037 closes. The guard is a SELECT on
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql:123:  -- identity.memberships; under FORCE RLS with no tenant context it returned
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-124-  -- ZERO ROWS for everybody, so it could not fire at all. It has been reading
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-125-  -- as a safety net while being incapable of catching anything. Had 037 opened
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-126-  -- only the INSERT door, this would have shipped as a working duplicate bug.
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-127-  BEGIN
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-128-    PERFORM identity.register_workshop(s, 'Duplicate Motors', 'X');
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-129-    RAISE EXCEPTION 'FAIL 4: a SECOND registration was allowed for the same person';
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-130-  EXCEPTION WHEN raise_exception THEN
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-131-    IF SQLERRM LIKE 'FAIL 4:%' THEN RAISE; END IF;
--
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-174-      IF SQLERRM LIKE 'FAIL 7:%' THEN RAISE; END IF;
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-175-      RAISE NOTICE 'PASS 7  the door is pinned to one user: %', SQLERRM;
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-176-  END;
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-177-
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-178-  -- ── 8. GUARD, INJECTED: a membership cannot be minted for someone else ────
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-179-  -- The membership policy pins created_by AND user_id, because created_by alone
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-180-  -- would let this door grant somebody else access to a tenant.
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-181-  BEGIN
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql:182:    INSERT INTO identity.memberships
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-183-      (tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-184-    VALUES (reg.tenant_id, reg.organization_id, reg.branch_id, uid,
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-185-            'workshop_owner', 'active', uid2);
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-186-    RAISE EXCEPTION 'FAIL 8: the bootstrap door granted a membership to a third party';
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-187-  EXCEPTION
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-188-    WHEN insufficient_privilege THEN
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-189-      RAISE NOTICE 'PASS 8  a membership for a third party is refused';
infrastructure\migrations\verify\037_registration_rls_bootstrap.sql-190-    WHEN raise_exception THEN
--
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-63-  -- ── 2. idempotent, and Keycloak stays authoritative for the profile ───────
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-64-  IF identity.provision_user_from_subject(s, 'renamed@example.com', 'Renamed') <> uid THEN
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-65-    RAISE EXCEPTION 'FAIL 2: a second sign-in created a SECOND user for one subject';
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-66-  END IF;
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-67-  RAISE NOTICE 'PASS 2  re-signing in reconciles the same row, never duplicates it';
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-68-
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-69-  -- ── 3. authentication is NOT authorization ────────────────────────────────
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-70-  -- Observed through the boundary function, because a direct SELECT on
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql:71:  -- identity.memberships returns zero here for RLS reasons and would "pass"
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-72-  -- whatever the truth was.
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-73-  SELECT count(*) INTO n
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql:74:    FROM identity.memberships_for_subject(s) WHERE tenant_id IS NOT NULL;
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-75-  IF n <> 0 THEN
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-76-    RAISE EXCEPTION 'FAIL 3: signing up granted % membership(s) — it must grant none', n;
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-77-  END IF;
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-78-  RAISE NOTICE 'PASS 3  a new user holds NO membership: every workshop route still refuses them';
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-79-
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-80-  -- ── 4. registration ───────────────────────────────────────────────────────
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-81-  SELECT * INTO reg FROM identity.register_workshop(s, 'Verify Motors', 'Verify Branch');
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-82-  IF reg.tenant_id IS NULL OR reg.organization_id IS NULL
--
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-85-  END IF;
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-86-  RAISE NOTICE 'PASS 4  registering creates tenant + organisation + branch + membership atomically';
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-87-
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-88-  -- ── 5. and the guard can now resolve them, as the RIGHT role ──────────────
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-89-  -- `workshop_owner` spelled exactly as permission-matrix.ts and ROLE_TO_NAV
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-90-  -- expect. A merely plausible role name resolves to no navigation tree and no
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-91-  -- permissions, and the owner lands in a workshop showing them nothing.
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-92-  SELECT role_name INTO role
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql:93:    FROM identity.memberships_for_subject(s) WHERE tenant_id IS NOT NULL;
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-94-  IF role IS DISTINCT FROM 'workshop_owner' THEN
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-95-    RAISE EXCEPTION 'FAIL 5: resolved role is %, expected workshop_owner', COALESCE(role, '(none)');
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-96-  END IF;
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-97-  RAISE NOTICE 'PASS 5  the guard resolves the registrant as workshop_owner';
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-98-
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-99-  -- ── 6. GUARD, INJECTED: a repeated registration is REFUSED ────────────────
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-100-  -- A double-submitted form would otherwise create a SECOND tenant with the
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-101-  -- same owner, and no screen anywhere would reveal the duplicate.
--
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-121-  uid2 := identity.provision_user_from_subject(s2, 'suspended@example.com', 'Suspended Person');
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-122-  UPDATE identity.users SET status = 'suspended' WHERE id = uid2;
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-123-  PERFORM identity.provision_user_from_subject(s2, 'suspended@example.com', 'Suspended Person');
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-124-  SELECT count(*) INTO n FROM identity.users WHERE id = uid2 AND status = 'active';
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-125-  IF n <> 0 THEN
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-126-    RAISE EXCEPTION 'FAIL 8: a suspended user reactivated themselves by signing in';
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-127-  END IF;
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-128-  -- And the consequence that matters: they resolve to nothing, so both guards refuse.
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql:129:  SELECT count(*) INTO n FROM identity.memberships_for_subject(s2);
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-130-  IF n <> 0 THEN
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-131-    RAISE EXCEPTION 'FAIL 8b: a suspended user is still resolvable by the guards';
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-132-  END IF;
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-133-  RAISE NOTICE 'PASS 8  a suspended user stays suspended, and resolves to no user at all';
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-134-
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-135-  -- ── 9. a blank subject is refused rather than written ─────────────────────
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-136-  -- Two blank subjects would collide on the unique index and quietly merge two
infrastructure\migrations\verify\036_signup_and_workshop_registration.sql-137-  -- people into one account.
--
apps\web\app\customer\_screens\request-service-actions.ts-34-    // somebody typed rather than followed. Say what to do rather than posting a
apps\web\app\customer\_screens\request-service-actions.ts-35-    // request nobody will receive.
apps\web\app\customer\_screens\request-service-actions.ts-36-    return { error: 'Choose a workshop first — open this form from a workshop in the directory.' };
apps\web\app\customer\_screens\request-service-actions.ts-37-  }
apps\web\app\customer\_screens\request-service-actions.ts-38-
apps\web\app\customer\_screens\request-service-actions.ts-39-  // 🔴 ENROL FIRST, OR THE REQUEST BELOW 401s — AND `POST /registration/customer`
apps\web\app\customer\_screens\request-service-actions.ts-40-  // HAD NO CALLER AT ALL UNTIL THIS LINE.
apps\web\app\customer\_screens\request-service-actions.ts-41-  //
apps\web\app\customer\_screens\request-service-actions.ts:42:  // Measured 2026-08-08: `identity.memberships` has only two writers in the
apps\web\app\customer\_screens\request-service-actions.ts-43-  // product — `register_workshop` (grants workshop_owner) and the admin-only
apps\web\app\customer\_screens\request-service-actions.ts-44-  // `MembershipService.grant()`. Neither can produce a `customer`. So a real
apps\web\app\customer\_screens\request-service-actions.ts-45-  // Keycloak sign-up reached this form holding NO membership, and
apps\web\app\customer\_screens\request-service-actions.ts-46-  // `POST /service-requests` — which is behind `TenantGuard` — refused them.
apps\web\app\customer\_screens\request-service-actions.ts-47-  // The whole funnel ended on a wall.
apps\web\app\customer\_screens\request-service-actions.ts-48-  //
apps\web\app\customer\_screens\request-service-actions.ts-49-  // Migration 061 and `POST /registration/customer` were built to fix that, and
apps\web\app\customer\_screens\request-service-actions.ts-50-  // then nothing called them: the route was deployed, gated, tested and
--
apps\web\app\customer\_screens\request-service-actions.spec.ts-2-
apps\web\app\customer\_screens\request-service-actions.spec.ts-3-/**
apps\web\app\customer\_screens\request-service-actions.spec.ts-4- * THE FUNNEL'S LAST LINK — enrol, THEN send.
apps\web\app\customer\_screens\request-service-actions.spec.ts-5- *
apps\web\app\customer\_screens\request-service-actions.spec.ts-6- * ══════════════════════════════════════════════════════════════════════════
apps\web\app\customer\_screens\request-service-actions.spec.ts-7- * 🔴 WHY THIS FILE EXISTS: `POST /registration/customer` WAS BUILT, DEPLOYED,
apps\web\app\customer\_screens\request-service-actions.spec.ts-8- *    GATED, TESTED — AND CALLED BY NOTHING.
apps\web\app\customer\_screens\request-service-actions.spec.ts-9- *
apps\web\app\customer\_screens\request-service-actions.spec.ts:10: * Measured 2026-08-08. `identity.memberships` has only two writers in the whole
apps\web\app\customer\_screens\request-service-actions.spec.ts-11- * product: `register_workshop`, which grants `workshop_owner`, and the
apps\web\app\customer\_screens\request-service-actions.spec.ts-12- * admin-only `MembershipService.grant()`. Neither can produce a `customer`. So
apps\web\app\customer\_screens\request-service-actions.spec.ts-13- * a real Keycloak sign-up arrived at the Request for Service form holding no
apps\web\app\customer\_screens\request-service-actions.spec.ts-14- * membership at all, and `POST /service-requests` — behind `TenantGuard` —
apps\web\app\customer\_screens\request-service-actions.spec.ts-15- * refused them. The funnel ended on a wall.
apps\web\app\customer\_screens\request-service-actions.spec.ts-16- *
apps\web\app\customer\_screens\request-service-actions.spec.ts-17- * Migration 061 and the enrolment route were built to fix exactly that, and
apps\web\app\customer\_screens\request-service-actions.spec.ts-18- * then no client ever called them. The route answered 401 on live and looked
--
infrastructure\migrations\verify\025_platform_admin_role_name.sql-44-
infrastructure\migrations\verify\025_platform_admin_role_name.sql-45-DO $$
infrastructure\migrations\verify\025_platform_admin_role_name.sql-46-DECLARE
infrastructure\migrations\verify\025_platform_admin_role_name.sql-47-  n INTEGER;
infrastructure\migrations\verify\025_platform_admin_role_name.sql-48-BEGIN
infrastructure\migrations\verify\025_platform_admin_role_name.sql-49-  PERFORM set_config('app.user_id', (SELECT v FROM _fx WHERE k='supplier_member')::text, true);
infrastructure\migrations\verify\025_platform_admin_role_name.sql-50-
infrastructure\migrations\verify\025_platform_admin_role_name.sql-51-  -- 1. 🔴 THE REGRESSION ITSELF. `platform_administrator` is the role name the
infrastructure\migrations\verify\025_platform_admin_role_name.sql:52:  --    application actually sets, from `identity.memberships.role_name`. Before
infrastructure\migrations\verify\025_platform_admin_role_name.sql-53-  --    025 this UPDATE affected ZERO rows and raised nothing at all.
infrastructure\migrations\verify\025_platform_admin_role_name.sql-54-  PERFORM set_config('app.current_role', 'platform_administrator', true);
infrastructure\migrations\verify\025_platform_admin_role_name.sql-55-  UPDATE catalogue.parts SET is_published = TRUE WHERE part_number = 'VERIFY-025-DRAFT';
infrastructure\migrations\verify\025_platform_admin_role_name.sql-56-  GET DIAGNOSTICS n = ROW_COUNT;
infrastructure\migrations\verify\025_platform_admin_role_name.sql-57-  IF n <> 1 THEN
infrastructure\migrations\verify\025_platform_admin_role_name.sql-58-    RAISE EXCEPTION
infrastructure\migrations\verify\025_platform_admin_role_name.sql-59-      'check 1 FAILED: a platform_administrator published % rows, expected 1 — '
infrastructure\migrations\verify\025_platform_admin_role_name.sql-60-      'the admin policies are still unreachable from the application', n;
--
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-49-CREATE ROLE aw_rehearse_075 NOSUPERUSER NOBYPASSRLS NOLOGIN NOCREATEDB NOCREATEROLE;
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-50-
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-51-GRANT USAGE ON SCHEMA identity TO aw_rehearse_075;
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-52-GRANT SELECT, INSERT, UPDATE ON
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-53-    identity.users,
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-54-    identity.tenants,
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-55-    identity.organizations,
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-56-    identity.branches,
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql:57:    identity.memberships,
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-58-    identity.organization_registrations
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-59-  TO aw_rehearse_075;
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-60-
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-61--- The alert trigger writes a notification; give the rehearsal role what the
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-62--- real owner would have, or the failure would be a privilege error rather than
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-63--- the RLS answer we are here to observe.
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-64-GRANT USAGE ON SCHEMA comms TO aw_rehearse_075;
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-65-GRANT SELECT, INSERT, UPDATE ON comms.notifications TO aw_rehearse_075;
--
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-104-
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-105-    -- Counted BEFORE the call. A delta cannot be fooled by guessing which
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-106-    -- column the alert stamps its resource id into — two earlier drafts of this
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-107-    -- check filtered on the wrong `event_key` and then on the wrong
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-108-    -- `resource_id`, and BOTH reported "no alert" against an alert that fired.
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-109-    SELECT count(*) INTO v_before FROM comms.notifications
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-110-     WHERE event_key = 'organization.registered';
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-111-
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql:112:    SELECT count(*) INTO v_admins FROM identity.memberships
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-113-     WHERE role_name = 'platform_administrator' AND status = 'active';
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-114-
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-115-    INSERT INTO identity.users (id, keycloak_subject, email, display_name, status)
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-116-    VALUES (v_user, v_subject, v_subject || '@example.test', 'Rehearse 075', 'active');
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-117-
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-118-    -- ── THE CALL, under Render's privileges ───────────────────────────────
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-119-    SELECT * INTO r FROM identity.register_fleet(v_subject, 'Rehearse Haulage', 'Depot');
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-120-
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql:121:    SELECT count(*) INTO n FROM identity.memberships
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-122-     WHERE id = r.o_membership_id AND role_name = 'fleet_administrator' AND status = 'active';
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-123-    IF n <> 1 THEN
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-124-        RAISE EXCEPTION 'rehearse/075: NO fleet_administrator membership under '
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-125-                        'Render''s privilege shape. 037''s bootstrap policies '
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-126-                        'refused an INSERT that succeeds locally as a superuser — '
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-127-                        'registration would fail on the first real sign-up.';
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-128-    END IF;
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql-129-
--
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-83-    -- reading exactly like a failure of the product. This repository has lost
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-84-    -- hours to that distinction before.
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-85-    EXECUTE format('GRANT USAGE ON SCHEMA identity, catalogue, core TO %I', sim_role);
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-86-    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA identity, catalogue, core TO %I', sim_role);
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-87-    EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA identity, catalogue TO %I', sim_role);
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-88-
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-89-    EXECUTE format('ALTER FUNCTION identity.enrol_as_customer(TEXT, uuid) OWNER TO %I', sim_role);
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-90-    EXECUTE format('ALTER FUNCTION identity.register_workshop(TEXT, TEXT, TEXT) OWNER TO %I', sim_role);
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql:91:    EXECUTE format('ALTER TABLE identity.memberships   OWNER TO %I', sim_role);
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-92-    EXECUTE format('ALTER TABLE identity.organizations OWNER TO %I', sim_role);
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-93-    EXECUTE format('ALTER TABLE identity.branches      OWNER TO %I', sim_role);
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-94-    EXECUTE format('ALTER TABLE identity.users         OWNER TO %I', sim_role);
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-95-    EXECUTE format('ALTER TABLE catalogue.mechanic_directory OWNER TO %I', sim_role);
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-96-
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-97-    -- ── seed: a workshop, published; a stranger; a staff member ────────────
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-98-    -- Seeded as the superuser BEFORE dropping privileges, so the fixture itself
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-99-    -- never depends on the door being open.
--
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-115-    INSERT INTO identity.users (keycloak_subject, email, display_name, status)
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-116-    VALUES (v_sub, 'rehearse-061-stranger@example.test', 'Rehearsal Stranger', 'active')
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-117-    RETURNING id INTO v_stranger;
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-118-
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-119-    INSERT INTO identity.users (keycloak_subject, email, display_name, status)
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-120-    VALUES (v_staffsub, 'rehearse-061-staff@example.test', 'Rehearsal Staff', 'active')
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-121-    RETURNING id INTO v_staff;
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-122-
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql:123:    INSERT INTO identity.memberships
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-124-        (tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-125-    VALUES (v_tenant, v_org, v_branch, v_staff, 'technician', 'active', v_staff);
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-126-
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-127-    -- ── drop to the non-bypassing role, with NO user and NO tenant context ──
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-128-    EXECUTE format('SET LOCAL ROLE %I', sim_role);
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-129-
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-130-    IF (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) THEN
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-131-        RAISE EXCEPTION 'rehearse/061: acting role % still bypasses RLS — this rehearsal proves nothing', current_user;
--
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-148-    END;
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-149-
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-150-    -- ── 2. the row really is a `customer`, and really is committed ─────────
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-151-    -- Read as the superuser: the point is what EXISTS, not what the enrolling
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-152-    -- caller can see. Checking through the same door that wrote it would be a
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-153-    -- check walking through its own gap.
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-154-    RESET ROLE;
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-155-    SELECT count(*) INTO n
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql:156:      FROM identity.memberships
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-157-     WHERE user_id = v_stranger AND organization_id = v_org
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-158-       AND role_name = 'customer' AND status = 'active';
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-159-    IF n = 1 THEN
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-160-        passes := passes + 1;
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-161-        RAISE NOTICE 'PASS 2 — exactly one active customer membership exists';
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-162-    ELSE
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-163-        fails := fails + 1;
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-164-        RAISE WARNING 'FAIL 2 — expected exactly 1 customer membership, found %', n;
--
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-177-        END IF;
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-178-    EXCEPTION WHEN OTHERS THEN
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-179-        fails := fails + 1;
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-180-        RAISE WARNING 'FAIL 3 — the idempotent path RAISED: %', SQLERRM;
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-181-    END;
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-182-
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-183-    RESET ROLE;
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-184-    SELECT count(*) INTO n
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql:185:      FROM identity.memberships
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-186-     WHERE user_id = v_stranger AND organization_id = v_org AND role_name = 'customer';
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-187-    IF n = 1 THEN
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-188-        passes := passes + 1;
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-189-        RAISE NOTICE 'PASS 4 — still exactly one row after the second call';
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-190-    ELSE
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-191-        fails := fails + 1;
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-192-        RAISE WARNING 'FAIL 4 — % customer membership rows after two calls', n;
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-193-    END IF;
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-194-
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-195-    -- ── 5. an UNPUBLISHED workshop cannot be joined ────────────────────────
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-196-    -- Constraint 2 in migration 061: publishing is the workshop's consent.
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-197-    UPDATE catalogue.mechanic_directory SET is_published = FALSE WHERE organization_id = v_org;
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql:198:    DELETE FROM identity.memberships WHERE user_id = v_stranger AND organization_id = v_org;
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-199-    EXECUTE format('SET LOCAL ROLE %I', sim_role);
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-200-    BEGIN
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-201-        SELECT * INTO r FROM identity.enrol_as_customer(v_sub, v_org);
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-202-        fails := fails + 1;
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-203-        RAISE WARNING 'FAIL 5 — enrolled into an UNPUBLISHED workshop. Any stranger can join any tenant.';
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-204-    EXCEPTION WHEN OTHERS THEN
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-205-        IF SQLERRM LIKE '%not accepting customers%' THEN
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-206-            passes := passes + 1;
--
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-255-    RESET ROLE;
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-256-    SET LOCAL ROLE autoworkshop_app;
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-257-    IF current_user <> 'autoworkshop_app' THEN
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-258-        RAISE EXCEPTION 'rehearse/061 check 8 is not acting as the application role (current_user=%)', current_user;
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-259-    END IF;
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-260-    PERFORM set_config('app.bootstrap',      'on',           true);
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-261-    PERFORM set_config('app.bootstrap_user', v_stranger::text, true);
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-262-    BEGIN
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql:263:        INSERT INTO identity.memberships
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-264-            (tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-265-        VALUES (v_tenant, v_org, v_branch, v_stranger, 'workshop_owner', 'active', v_stranger);
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-266-        fails := fails + 1;
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-267-        RAISE WARNING 'FAIL 8 — forged the bootstrap door WITHOUT a definer function and minted workshop_owner';
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-268-    EXCEPTION WHEN insufficient_privilege OR check_violation THEN
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-269-        passes := passes + 1;
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-270-        RAISE NOTICE 'PASS 8 — the raw settings alone do not open the door';
infrastructure\migrations\rehearse\061_customer_enrolment_render_privileges.sql-271-    WHEN OTHERS THEN
--
infrastructure\migrations\rehearse\060_notifications_render_privileges.sql-142-    EXECUTE format('ALTER FUNCTION comms.notify_workshop_staff(uuid,uuid,text,text,text,text,uuid,text) OWNER TO %I', sim_role);
infrastructure\migrations\rehearse\060_notifications_render_privileges.sql-143-    EXECUTE format('ALTER FUNCTION comms.claim_pending_notifications(integer) OWNER TO %I', sim_role);
infrastructure\migrations\rehearse\060_notifications_render_privileges.sql-144-    EXECUTE format('ALTER FUNCTION comms.record_notification_result(uuid,boolean,text) OWNER TO %I', sim_role);
infrastructure\migrations\rehearse\060_notifications_render_privileges.sql-145-
infrastructure\migrations\rehearse\060_notifications_render_privileges.sql-146-    -- The definer functions read these; on Render the owner has rights to them
infrastructure\migrations\rehearse\060_notifications_render_privileges.sql-147-    -- because it owns the whole schema. Granted explicitly here so that a
infrastructure\migrations\rehearse\060_notifications_render_privileges.sql-148-    -- failure below is a POLICY failure and never a missing-privilege failure —
infrastructure\migrations\rehearse\060_notifications_render_privileges.sql-149-    -- the two look identical in the error and mean opposite things.
infrastructure\migrations\rehearse\060_notifications_render_privileges.sql:150:    EXECUTE format('GRANT SELECT ON identity.users, identity.memberships, core.notification_preferences TO %I', sim_role);
infrastructure\migrations\rehearse\060_notifications_render_privileges.sql-151-
infrastructure\migrations\rehearse\060_notifications_render_privileges.sql-152-    -- The POLICIES call these — `is_platform_admin()`, `current_user_id()`,
infrastructure\migrations\rehearse\060_notifications_render_privileges.sql-153-    -- `current_organization_id()` and friends — so without EXECUTE every check
infrastructure\migrations\rehearse\060_notifications_render_privileges.sql-154-    -- below dies on "permission denied for function ..." BEFORE reaching the
infrastructure\migrations\rehearse\060_notifications_render_privileges.sql-155-    -- policy it was meant to test, which would read as a failure of the drain
infrastructure\migrations\rehearse\060_notifications_render_privileges.sql-156-    -- rather than of the scaffolding.
infrastructure\migrations\rehearse\060_notifications_render_privileges.sql-157-    --
infrastructure\migrations\rehearse\060_notifications_render_privileges.sql-158-    -- Granted schema-wide rather than function-by-function on purpose: on Render
--
apps\web\app\workshop\_screens\staff-actions.ts-7-/**
apps\web\app\workshop\_screens\staff-actions.ts-8- * Adding and removing workshop staff — `07.txt` pt2 §50.
apps\web\app\workshop\_screens\staff-actions.ts-9- *
apps\web\app\workshop\_screens\staff-actions.ts-10- * ── 🔴 WHY THIS EXISTS AT ALL ───────────────────────────────────────────────
apps\web\app\workshop\_screens\staff-actions.ts-11- *
apps\web\app\workshop\_screens\staff-actions.ts-12- * `MembershipService.grant()` has been complete since Phase 2 — role gate,
apps\web\app\workshop\_screens\staff-actions.ts-13- * tenant check, branch check, audit — and until now it had **no reachable
apps\web\app\workshop\_screens\staff-actions.ts-14- * caller**. It took a `userId`, and the only source of one is `GET /users`,
apps\web\app\workshop\_screens\staff-actions.ts:15: * which is driven FROM `identity.memberships` and therefore lists people who
apps\web\app\workshop\_screens\staff-actions.ts-16- * are ALREADY members. So there was no path, from any screen that could exist,
apps\web\app\workshop\_screens\staff-actions.ts-17- * to add a colleague. A workshop owner could not hire anybody.
apps\web\app\workshop\_screens\staff-actions.ts-18- *
apps\web\app\workshop\_screens\staff-actions.ts-19- * The same shape as Solar's `link_sponsor_user()`, which also had no caller
apps\web\app\workshop\_screens\staff-actions.ts-20- * outside its tests and made third-level approval unreachable. A capability
apps\web\app\workshop\_screens\staff-actions.ts-21- * with no way in is not a feature, it is a wall.
apps\web\app\workshop\_screens\staff-actions.ts-22- *
apps\web\app\workshop\_screens\staff-actions.ts-23- * The API now accepts `userEmail` and resolves it server-side, which is why
--
apps\web\app\workshop\_screens\staff-actions.ts-67-    revalidatePath(path);
apps\web\app\workshop\_screens\staff-actions.ts-68-  }
apps\web\app\workshop\_screens\staff-actions.ts-69-  return { created: 'Added. They can sign in and will see this workshop immediately.' };
apps\web\app\workshop\_screens\staff-actions.ts-70-}
apps\web\app\workshop\_screens\staff-actions.ts-71-
apps\web\app\workshop\_screens\staff-actions.ts-72-/**
apps\web\app\workshop\_screens\staff-actions.ts-73- * Remove someone's access.
apps\web\app\workshop\_screens\staff-actions.ts-74- *
apps\web\app\workshop\_screens\staff-actions.ts:75: * ⚠️ A STATUS CHANGE, NEVER A DELETE. `identity.memberships` keeps the row so
apps\web\app\workshop\_screens\staff-actions.ts-76- * that "was this person ever granted access, and by whom?" stays answerable —
apps\web\app\workshop\_screens\staff-actions.ts-77- * the API exposes `PATCH /:id/status` and no DELETE at all, deliberately.
apps\web\app\workshop\_screens\staff-actions.ts-78- */
apps\web\app\workshop\_screens\staff-actions.ts-79-export async function withdrawStaffAction(formData: FormData): Promise<ActionResult> {
apps\web\app\workshop\_screens\staff-actions.ts-80-  const membershipId = String(formData.get('membershipId') ?? '').trim();
apps\web\app\workshop\_screens\staff-actions.ts-81-  if (!membershipId) return { error: 'Nothing was selected. Reload the page and try again.' };
apps\web\app\workshop\_screens\staff-actions.ts-82-
apps\web\app\workshop\_screens\staff-actions.ts-83-  const result = await apiPatch('workshop', `/memberships/${membershipId}/status`, {
--
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-8--- Measured on 2026-08-16 and re-measured on 2026-08-17 before writing this:
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-9---
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-10---     CAN_GRANT_MEMBERSHIP  (apps/api/src/identity/membership.service.ts:35)
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-11---       = { platform_administrator, workshop_owner,
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-12---           supplier_owner, fleet_administrator }
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-13---
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-14--- `insurance_assessor` is not in it. `towing_operator` is not in it. That set
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-15--- is the ONLY gate on granting, `membership.service.ts:345` is the ONLY
infrastructure\migrations\085_insurance_and_towing_org_admin.sql:16:-- `INSERT INTO identity.memberships` in the entire API, and migration 080
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-17--- writes just the founder's own membership. Three independent measurements,
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-18--- one conclusion: **an insurance company or a towing firm could create exactly
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-19--- one member — the founder — and never a second one, for ever.**
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-20---
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-21--- Ten insurance screens and ten towing screens exist above a team that cannot
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-22--- be built. This is the same defect class as the five roles that had no
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-23--- production writer (`customer`, `supplier_owner`, `fleet_administrator`,
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-24--- `insurance_assessor`/`towing_operator`, `platform_administrator`) — and it
--
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-110-
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-111-    -- ── the door opens here, and only here ─────────────────────────────────
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-112-    PERFORM set_config('app.bootstrap',      'on',         true);
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-113-    PERFORM set_config('app.bootstrap_user', v_user::text, true);
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-114-
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-115-    -- One organisation per person. AFTER the flag is set AND after the lock:
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-116-    -- under FORCE RLS with no tenant context this read returns zero rows for
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-117-    -- everybody, so placing it earlier would make it a check that cannot fire.
infrastructure\migrations\085_insurance_and_towing_org_admin.sql:118:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-119-                WHERE user_id = v_user AND status = 'active') THEN
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-120-        PERFORM set_config('app.bootstrap',      '', true);
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-121-        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-122-        RAISE EXCEPTION 'this account already belongs to an organisation. Sign in with a different account to register an insurance company, or ask a platform administrator to add you to an existing one.';
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-123-    END IF;
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-124-
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-125-    v_slug := regexp_replace(lower(btrim(p_insurer_name)), '[^a-z0-9]+', '-', 'g');
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-126-    v_slug := btrim(v_slug, '-');
--
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-155-    -- Writing the operational role here is what left insurers unable to appoint
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-156-    -- anyone: `insurance_assessor` is not in `CAN_GRANT_MEMBERSHIP`, so the only
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-157-    -- member an insurer had was also the only member it could ever have.
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-158-    --
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-159-    -- ⚠️ The spelling must match `permission-matrix.ts` and `membership.service.ts`
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-160-    -- exactly. Two literals in two files that cannot be type-checked into
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-161-    -- agreement is this repository's most-recorded root cause, which is why
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-162-    -- `verify/085` asserts the role written here against those allow-lists.
infrastructure\migrations\085_insurance_and_towing_org_admin.sql:163:    INSERT INTO identity.memberships
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-164-        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-165-    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'insurance_owner', 'active', v_user);
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-166-
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-167-    -- Queued INSIDE the same transaction that creates the insurer.
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-168-    INSERT INTO identity.organization_registrations
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-169-        (tenant_id, organization_id, kind, status, submitted_by)
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-170-    VALUES (v_tenant, v_org, 'insurance', 'pending', v_user);
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-171-
--
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-230-    END IF;
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-231-
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-232-    -- Same per-identity lock as the other four doors. See `register_insurer`.
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-233-    PERFORM pg_advisory_xact_lock(hashtextextended('identity.register:' || v_user::text, 0));
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-234-
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-235-    PERFORM set_config('app.bootstrap',      'on',         true);
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-236-    PERFORM set_config('app.bootstrap_user', v_user::text, true);
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-237-
infrastructure\migrations\085_insurance_and_towing_org_admin.sql:238:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-239-                WHERE user_id = v_user AND status = 'active') THEN
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-240-        PERFORM set_config('app.bootstrap',      '', true);
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-241-        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-242-        RAISE EXCEPTION 'this account already belongs to an organisation. Sign in with a different account to register a towing company, or ask a platform administrator to add you to an existing one.';
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-243-    END IF;
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-244-
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-245-    v_slug := regexp_replace(lower(btrim(p_company_name)), '[^a-z0-9]+', '-', 'g');
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-246-    v_slug := btrim(v_slug, '-');
--
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-263-
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-264-    INSERT INTO identity.branches (id, tenant_id, organization_id, name, status, created_by)
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-265-    VALUES (v_branch, v_tenant, v_org,
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-266-            COALESCE(NULLIF(btrim(p_location_name), ''), 'Main depot'),
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-267-            'active', v_user);
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-268-
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-269-    -- 🔴 LITERAL 2 of 2, AND THE ONE LINE 085 CHANGES: `towing_owner`.
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-270-    -- Same reasoning as `register_insurer` above — the founder is the admin.
infrastructure\migrations\085_insurance_and_towing_org_admin.sql:271:    INSERT INTO identity.memberships
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-272-        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-273-    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'towing_owner', 'active', v_user);
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-274-
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-275-    INSERT INTO identity.organization_registrations
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-276-        (tenant_id, organization_id, kind, status, submitted_by)
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-277-    VALUES (v_tenant, v_org, 'towing', 'pending', v_user);
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-278-
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-279-    PERFORM set_config('app.bootstrap',      '', true);
--
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-314--- That would promote EVERY assessor in the organisation to administrator —
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-315--- turning a fix for a missing write path into a privilege escalation for
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-316--- every existing member. Exactly one membership per organisation changes.
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-317--- 🔴 TWO DEFECTS CODEX FOUND IN THE FIRST VERSION OF THIS BLOCK, 2026-08-17.
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-318--- Both are recorded because each was invisible on this workstation and only
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-319--- one of them would have been visible in production.
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-320---
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-321--- 1. IT RAN WITHOUT AN ADMIN CONTEXT, SO ON RENDER IT WOULD HAVE UPDATED
infrastructure\migrations\085_insurance_and_towing_org_admin.sql:322:--    NOTHING. `identity.memberships` and `identity.organizations` are under
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-323---    FORCE ROW LEVEL SECURITY. Locally the migration owner is a SUPERUSER and
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-324---    bypasses RLS, so the backfill worked and every check passed. On Render the
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-325---    owner is NOT a superuser: the CTE would have seen zero rows, promoted
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-326---    nobody, and the guard below — which DOES set the admin context — would
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-327---    then have found every existing insurer stranded and ABORTED THE MIGRATION.
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-328---    A green local apply over a change that cannot work in production is this
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-329---    repository's most expensive recorded trap, and it caught this file.
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-330---
--
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-349-        -- what broke this, and rank must be computed over the real population.
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-350-        SELECT m.id,
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-351-               m.created_by,
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-352-               m.user_id,
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-353-               m.role_name,
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-354-               o.org_type,
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-355-               row_number() OVER (PARTITION BY m.organization_id
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-356-                                      ORDER BY m.created_at ASC, m.id ASC) AS rn
infrastructure\migrations\085_insurance_and_towing_org_admin.sql:357:          FROM identity.memberships m
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-358-          JOIN identity.organizations o
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-359-            ON o.id = m.organization_id
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-360-           AND o.tenant_id = m.tenant_id
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-361-         WHERE o.org_type IN ('insurance_company', 'towing_company')
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-362-           -- 🔴 `status = 'active'` IS PRODUCTION-BLOCKING IF OMITTED, and it was
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-363-           -- omitted until the Supervisor pass on 2026-08-17.
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-364-           --
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-365-           -- Without it `ranked` includes REVOKED and SUSPENDED rows, so an
--
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-374-           AND m.status = 'active'
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-375-    ),
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-376-    founders AS (
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-377-        SELECT id, org_type
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-378-          FROM ranked
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-379-         WHERE rn = 1                       -- the organisation's FIRST member
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-380-           AND created_by = user_id         -- who created their own membership
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-381-    )
infrastructure\migrations\085_insurance_and_towing_org_admin.sql:382:    UPDATE identity.memberships m
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-383-       SET role_name = CASE f.org_type
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-384-                         WHEN 'insurance_company' THEN 'insurance_owner'
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-385-                         ELSE 'towing_owner'
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-386-                       END,
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-387-           updated_at = now()
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-388-      FROM founders f
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-389-     WHERE m.id = f.id
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-390-       -- Idempotent: a row already carrying the org-admin role is left alone,
--
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-418-    -- exact condition this migration exists to remove. If any remain, the
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-419-    -- backfill's founder rule did not match reality and we must not ship.
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-420-    SELECT count(*) INTO v_stranded
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-421-      FROM identity.organizations o
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-422-     WHERE o.org_type IN ('insurance_company', 'towing_company')
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-423-       AND o.status = 'active'
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-424-       AND NOT EXISTS (
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-425-             SELECT 1
infrastructure\migrations\085_insurance_and_towing_org_admin.sql:426:               FROM identity.memberships m
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-427-              WHERE m.organization_id = o.id
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-428-                AND m.tenant_id = o.tenant_id
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-429-                AND m.status = 'active'
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-430-                AND m.role_name IN ('insurance_owner', 'towing_owner')
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-431-           );
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-432-
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-433-    IF v_stranded > 0 THEN
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-434-        RAISE EXCEPTION
--
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-448-    -- it is not: `insurance_owner` is grantable, so an owner may legitimately
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-449-    -- appoint a second owner during a handover, and the same query would then
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-450-    -- fail against a perfectly correct database. Codex caught that the check
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-451-    -- was both misplaced and non-repeatable.
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-452-    SELECT count(*) INTO v_stranded
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-453-      FROM (
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-454-        SELECT o.id
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-455-          FROM identity.organizations o
infrastructure\migrations\085_insurance_and_towing_org_admin.sql:456:          JOIN identity.memberships m
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-457-            ON m.organization_id = o.id AND m.tenant_id = o.tenant_id
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-458-         WHERE o.org_type IN ('insurance_company', 'towing_company')
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-459-           AND m.status = 'active'
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-460-           AND m.role_name IN ('insurance_owner', 'towing_owner')
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-461-         GROUP BY o.id
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-462-        HAVING count(*) > 1
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-463-      ) AS over_promoted;
infrastructure\migrations\085_insurance_and_towing_org_admin.sql-464-
--
infrastructure\migrations\080_insurance_and_towing_registration.sql-4--- 🔴 THE FOURTH AND FIFTH TIME THE ROLE QUESTION HAS FOUND A ROLE THAT COULD
infrastructure\migrations\080_insurance_and_towing_registration.sql-5--- NOT EXIST. Asked before building any screen, exactly as 075 asked it of
infrastructure\migrations\080_insurance_and_towing_registration.sql-6--- `fleet_administrator`, 068 of `supplier_owner` and 061 of `customer`:
infrastructure\migrations\080_insurance_and_towing_registration.sql-7--- **which production code path WRITES this membership?**
infrastructure\migrations\080_insurance_and_towing_registration.sql-8---
infrastructure\migrations\080_insurance_and_towing_registration.sql-9---     insurance_assessor  → none
infrastructure\migrations\080_insurance_and_towing_registration.sql-10---     towing_operator     → none
infrastructure\migrations\080_insurance_and_towing_registration.sql-11---
infrastructure\migrations\080_insurance_and_towing_registration.sql:12:-- Measured, not assumed. Every `INSERT INTO identity.memberships` across the
infrastructure\migrations\080_insurance_and_towing_registration.sql-13--- 79 migrations in this directory writes exactly four role literals —
infrastructure\migrations\080_insurance_and_towing_registration.sql-14--- `workshop_owner`, `supplier_owner`, `fleet_administrator`, `customer`.
infrastructure\migrations\080_insurance_and_towing_registration.sql-15---
infrastructure\migrations\080_insurance_and_towing_registration.sql-16--- ⚠️ AND `MembershipService.grant()` IS NOT THE ESCAPE HATCH IT LOOKS LIKE.
infrastructure\migrations\080_insurance_and_towing_registration.sql-17--- Both roles ARE in its `GRANTABLE_ROLES` allow-list, which is why a 2026-08-13
infrastructure\migrations\080_insurance_and_towing_registration.sql-18--- handover recorded `insurance_assessor` as "grantable, only the door is
infrastructure\migrations\080_insurance_and_towing_registration.sql-19--- missing". That reading is wrong, and the reason is worth stating because it
infrastructure\migrations\080_insurance_and_towing_registration.sql-20--- is the same circularity 075 found in `CAN_CREATE_ORG`:
--
infrastructure\migrations\080_insurance_and_towing_registration.sql-163-    -- SUCCESS path leaves the caller's transaction open.
infrastructure\migrations\080_insurance_and_towing_registration.sql-164-    PERFORM set_config('app.bootstrap',      'on',         true);
infrastructure\migrations\080_insurance_and_towing_registration.sql-165-    PERFORM set_config('app.bootstrap_user', v_user::text, true);
infrastructure\migrations\080_insurance_and_towing_registration.sql-166-
infrastructure\migrations\080_insurance_and_towing_registration.sql-167-    -- One organisation per person. AFTER the flag is set AND after the lock:
infrastructure\migrations\080_insurance_and_towing_registration.sql-168-    -- under FORCE RLS with no tenant context this read returns zero rows for
infrastructure\migrations\080_insurance_and_towing_registration.sql-169-    -- everybody, so placing it earlier would make it a check that cannot fire —
infrastructure\migrations\080_insurance_and_towing_registration.sql-170-    -- the bug 037 fixed in `register_workshop`.
infrastructure\migrations\080_insurance_and_towing_registration.sql:171:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure\migrations\080_insurance_and_towing_registration.sql-172-                WHERE user_id = v_user AND status = 'active') THEN
infrastructure\migrations\080_insurance_and_towing_registration.sql-173-        PERFORM set_config('app.bootstrap',      '', true);
infrastructure\migrations\080_insurance_and_towing_registration.sql-174-        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure\migrations\080_insurance_and_towing_registration.sql-175-        -- ⚠️ THE MESSAGE NAMES A REACHABLE ALTERNATIVE. A rule with no way past
infrastructure\migrations\080_insurance_and_towing_registration.sql-176-        -- it is a wall, and the person in front of it files a bug rather than
infrastructure\migrations\080_insurance_and_towing_registration.sql-177-        -- acting.
infrastructure\migrations\080_insurance_and_towing_registration.sql-178-        RAISE EXCEPTION 'this account already belongs to an organisation. Sign in with a different account to register an insurance company, or ask a platform administrator to add you to an existing one.';
infrastructure\migrations\080_insurance_and_towing_registration.sql-179-    END IF;
--
infrastructure\migrations\080_insurance_and_towing_registration.sql-200-    VALUES (v_org, v_tenant, btrim(p_insurer_name), 'insurance_company', 'active', v_user);
infrastructure\migrations\080_insurance_and_towing_registration.sql-201-
infrastructure\migrations\080_insurance_and_towing_registration.sql-202-    INSERT INTO identity.branches (id, tenant_id, organization_id, name, status, created_by)
infrastructure\migrations\080_insurance_and_towing_registration.sql-203-    VALUES (v_branch, v_tenant, v_org,
infrastructure\migrations\080_insurance_and_towing_registration.sql-204-            COALESCE(NULLIF(btrim(p_location_name), ''), 'Head office'),
infrastructure\migrations\080_insurance_and_towing_registration.sql-205-            'active', v_user);
infrastructure\migrations\080_insurance_and_towing_registration.sql-206-
infrastructure\migrations\080_insurance_and_towing_registration.sql-207-    -- 🔴 LITERAL 2 of 2: the role, spelled as every consumer expects.
infrastructure\migrations\080_insurance_and_towing_registration.sql:208:    INSERT INTO identity.memberships
infrastructure\migrations\080_insurance_and_towing_registration.sql-209-        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure\migrations\080_insurance_and_towing_registration.sql-210-    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'insurance_assessor', 'active', v_user);
infrastructure\migrations\080_insurance_and_towing_registration.sql-211-
infrastructure\migrations\080_insurance_and_towing_registration.sql-212-    -- Queued INSIDE the same transaction that creates the insurer. Written
infrastructure\migrations\080_insurance_and_towing_registration.sql-213-    -- afterwards on a separate connection it could survive a rolled-back
infrastructure\migrations\080_insurance_and_towing_registration.sql-214-    -- sign-up and describe a company that does not exist — or be lost, leaving
infrastructure\migrations\080_insurance_and_towing_registration.sql-215-    -- an insurer nobody is ever asked to verify.
infrastructure\migrations\080_insurance_and_towing_registration.sql-216-    INSERT INTO identity.organization_registrations
--
infrastructure\migrations\080_insurance_and_towing_registration.sql-279-
infrastructure\migrations\080_insurance_and_towing_registration.sql-280-    -- Same per-identity lock as the other four doors. See the note in
infrastructure\migrations\080_insurance_and_towing_registration.sql-281-    -- `register_insurer` above for why the key is the identity and not the kind.
infrastructure\migrations\080_insurance_and_towing_registration.sql-282-    PERFORM pg_advisory_xact_lock(hashtextextended('identity.register:' || v_user::text, 0));
infrastructure\migrations\080_insurance_and_towing_registration.sql-283-
infrastructure\migrations\080_insurance_and_towing_registration.sql-284-    PERFORM set_config('app.bootstrap',      'on',         true);
infrastructure\migrations\080_insurance_and_towing_registration.sql-285-    PERFORM set_config('app.bootstrap_user', v_user::text, true);
infrastructure\migrations\080_insurance_and_towing_registration.sql-286-
infrastructure\migrations\080_insurance_and_towing_registration.sql:287:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure\migrations\080_insurance_and_towing_registration.sql-288-                WHERE user_id = v_user AND status = 'active') THEN
infrastructure\migrations\080_insurance_and_towing_registration.sql-289-        PERFORM set_config('app.bootstrap',      '', true);
infrastructure\migrations\080_insurance_and_towing_registration.sql-290-        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure\migrations\080_insurance_and_towing_registration.sql-291-        RAISE EXCEPTION 'this account already belongs to an organisation. Sign in with a different account to register a towing company, or ask a platform administrator to add you to an existing one.';
infrastructure\migrations\080_insurance_and_towing_registration.sql-292-    END IF;
infrastructure\migrations\080_insurance_and_towing_registration.sql-293-
infrastructure\migrations\080_insurance_and_towing_registration.sql-294-    v_slug := regexp_replace(lower(btrim(p_company_name)), '[^a-z0-9]+', '-', 'g');
infrastructure\migrations\080_insurance_and_towing_registration.sql-295-    v_slug := btrim(v_slug, '-');
--
infrastructure\migrations\080_insurance_and_towing_registration.sql-312-
infrastructure\migrations\080_insurance_and_towing_registration.sql-313-    INSERT INTO identity.branches (id, tenant_id, organization_id, name, status, created_by)
infrastructure\migrations\080_insurance_and_towing_registration.sql-314-    VALUES (v_branch, v_tenant, v_org,
infrastructure\migrations\080_insurance_and_towing_registration.sql-315-            COALESCE(NULLIF(btrim(p_location_name), ''), 'Main depot'),
infrastructure\migrations\080_insurance_and_towing_registration.sql-316-            'active', v_user);
infrastructure\migrations\080_insurance_and_towing_registration.sql-317-
infrastructure\migrations\080_insurance_and_towing_registration.sql-318-    -- 🔴 LITERAL 2 of 2: `towing_operator`, as `permission-matrix.ts:109` and
infrastructure\migrations\080_insurance_and_towing_registration.sql-319-    -- the `02.txt` §52 navigation tree spell it.
infrastructure\migrations\080_insurance_and_towing_registration.sql:320:    INSERT INTO identity.memberships
infrastructure\migrations\080_insurance_and_towing_registration.sql-321-        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure\migrations\080_insurance_and_towing_registration.sql-322-    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'towing_operator', 'active', v_user);
infrastructure\migrations\080_insurance_and_towing_registration.sql-323-
infrastructure\migrations\080_insurance_and_towing_registration.sql-324-    INSERT INTO identity.organization_registrations
infrastructure\migrations\080_insurance_and_towing_registration.sql-325-        (tenant_id, organization_id, kind, status, submitted_by)
infrastructure\migrations\080_insurance_and_towing_registration.sql-326-    VALUES (v_tenant, v_org, 'towing', 'pending', v_user);
infrastructure\migrations\080_insurance_and_towing_registration.sql-327-
infrastructure\migrations\080_insurance_and_towing_registration.sql-328-    PERFORM set_config('app.bootstrap',      '', true);
--
infrastructure\migrations\080_insurance_and_towing_registration.sql-482-                ELSE NEW.kind
infrastructure\migrations\080_insurance_and_towing_registration.sql-483-              END;
infrastructure\migrations\080_insurance_and_towing_registration.sql-484-
infrastructure\migrations\080_insurance_and_towing_registration.sql-485-    -- ── the admin-lookup door opens ────────────────────────────────────────
infrastructure\migrations\080_insurance_and_towing_registration.sql-486-    PERFORM set_config('app.admin_lookup', 'on', true);
infrastructure\migrations\080_insurance_and_towing_registration.sql-487-
infrastructure\migrations\080_insurance_and_towing_registration.sql-488-    FOR v_admin IN
infrastructure\migrations\080_insurance_and_towing_registration.sql-489-        SELECT DISTINCT m.user_id
infrastructure\migrations\080_insurance_and_towing_registration.sql:490:          FROM identity.memberships m
infrastructure\migrations\080_insurance_and_towing_registration.sql-491-         WHERE m.role_name = 'platform_administrator'
infrastructure\migrations\080_insurance_and_towing_registration.sql-492-           AND m.status = 'active'
infrastructure\migrations\080_insurance_and_towing_registration.sql-493-    LOOP
infrastructure\migrations\080_insurance_and_towing_registration.sql-494-        v_written := v_written + comms.notify_user(
infrastructure\migrations\080_insurance_and_towing_registration.sql-495-            NEW.tenant_id,
infrastructure\migrations\080_insurance_and_towing_registration.sql-496-            NEW.organization_id,
infrastructure\migrations\080_insurance_and_towing_registration.sql-497-            v_admin.user_id,
infrastructure\migrations\080_insurance_and_towing_registration.sql-498-            'organization.registered',
--
infrastructure\migrations\077_platform_administrator_grants.sql-11--- writes from `TenantContext.activeRole`, which `resolveTenantContext` takes
infrastructure\migrations\077_platform_administrator_grants.sql-12--- from a MEMBERSHIP ROW's `role_name`. So platform authority — the predicate
infrastructure\migrations\077_platform_administrator_grants.sql-13--- that opens EVERY tenant table in this database — was conferred by a text
infrastructure\migrations\077_platform_administrator_grants.sql-14--- column on a row inside one organisation.
infrastructure\migrations\077_platform_administrator_grants.sql-15---
infrastructure\migrations\077_platform_administrator_grants.sql-16--- Three consequences, all real:
infrastructure\migrations\077_platform_administrator_grants.sql-17---
infrastructure\migrations\077_platform_administrator_grants.sql-18---   1. A PLATFORM ADMINISTRATOR HAD TO BELONG TO SOMEBODY'S WORKSHOP.
infrastructure\migrations\077_platform_administrator_grants.sql:19:--      `identity.memberships.organization_id` and `.tenant_id` are both NOT
infrastructure\migrations\077_platform_administrator_grants.sql-20---      NULL, so the grant workflow attaches the platform administrator to an
infrastructure\migrations\077_platform_administrator_grants.sql-21---      organisation they have no business being a member of — the owner's own
infrastructure\migrations\077_platform_administrator_grants.sql-22---      garage, in production today. The model forced a false statement.
infrastructure\migrations\077_platform_administrator_grants.sql-23---
infrastructure\migrations\077_platform_administrator_grants.sql-24---   2. THE ONLY THING STOPPING SELF-PROMOTION WAS APPLICATION CODE.
infrastructure\migrations\077_platform_administrator_grants.sql-25---      `MembershipService.GRANTABLE_ROLES` deliberately omits
infrastructure\migrations\077_platform_administrator_grants.sql-26---      `platform_administrator`, and that is good — but its own comment records
infrastructure\migrations\077_platform_administrator_grants.sql-27---      that `role_name` is "a plain TEXT column with no database CHECK".
--
infrastructure\migrations\077_platform_administrator_grants.sql-228--- authority came from one has none. In production that is the owner's own
infrastructure\migrations\077_platform_administrator_grants.sql-229--- account. So every existing active `platform_administrator` membership becomes
infrastructure\migrations\077_platform_administrator_grants.sql-230--- a grant first, in the same transaction.
infrastructure\migrations\077_platform_administrator_grants.sql-231-INSERT INTO identity.platform_administrators (user_id, granted_at, granted_actor, granted_reason)
infrastructure\migrations\077_platform_administrator_grants.sql-232-SELECT m.user_id,
infrastructure\migrations\077_platform_administrator_grants.sql-233-       min(m.created_at),
infrastructure\migrations\077_platform_administrator_grants.sql-234-       'migration 077',
infrastructure\migrations\077_platform_administrator_grants.sql-235-       'backfilled from an existing active platform_administrator membership'
infrastructure\migrations\077_platform_administrator_grants.sql:236:  FROM identity.memberships m
infrastructure\migrations\077_platform_administrator_grants.sql-237- WHERE m.role_name = 'platform_administrator'
infrastructure\migrations\077_platform_administrator_grants.sql-238-   AND m.status = 'active'
infrastructure\migrations\077_platform_administrator_grants.sql-239- GROUP BY m.user_id
infrastructure\migrations\077_platform_administrator_grants.sql-240-ON CONFLICT DO NOTHING;
infrastructure\migrations\077_platform_administrator_grants.sql-241-
infrastructure\migrations\077_platform_administrator_grants.sql-242--- ── The predicate itself ───────────────────────────────────────────────────
infrastructure\migrations\077_platform_administrator_grants.sql-243---
infrastructure\migrations\077_platform_administrator_grants.sql-244--- `'admin'` REMAINS, and is not the same kind of thing as the name being
--
infrastructure\migrations\077_platform_administrator_grants.sql-302--- removing. The privilege-shape assertions live in verify/077, which really
infrastructure\migrations\077_platform_administrator_grants.sql-303--- does switch role.
infrastructure\migrations\077_platform_administrator_grants.sql-304-DO $$
infrastructure\migrations\077_platform_administrator_grants.sql-305-DECLARE
infrastructure\migrations\077_platform_administrator_grants.sql-306-  v_memberships int;
infrastructure\migrations\077_platform_administrator_grants.sql-307-  v_grants      int;
infrastructure\migrations\077_platform_administrator_grants.sql-308-BEGIN
infrastructure\migrations\077_platform_administrator_grants.sql-309-  SELECT count(DISTINCT user_id) INTO v_memberships
infrastructure\migrations\077_platform_administrator_grants.sql:310:    FROM identity.memberships
infrastructure\migrations\077_platform_administrator_grants.sql-311-   WHERE role_name = 'platform_administrator' AND status = 'active';
infrastructure\migrations\077_platform_administrator_grants.sql-312-
infrastructure\migrations\077_platform_administrator_grants.sql-313-  SELECT count(*) INTO v_grants
infrastructure\migrations\077_platform_administrator_grants.sql-314-    FROM identity.platform_administrators
infrastructure\migrations\077_platform_administrator_grants.sql-315-   WHERE revoked_at IS NULL;
infrastructure\migrations\077_platform_administrator_grants.sql-316-
infrastructure\migrations\077_platform_administrator_grants.sql-317-  -- ⚠️ PER USER, NOT A COUNT. Comparing totals lets an UNRELATED active grant
infrastructure\migrations\077_platform_administrator_grants.sql-318-  -- mask a missing one — the check would pass while a real administrator was
infrastructure\migrations\077_platform_administrator_grants.sql-319-  -- locked out. Codex, this diff.
infrastructure\migrations\077_platform_administrator_grants.sql-320-  IF EXISTS (
infrastructure\migrations\077_platform_administrator_grants.sql-321-      SELECT 1
infrastructure\migrations\077_platform_administrator_grants.sql:322:        FROM identity.memberships m
infrastructure\migrations\077_platform_administrator_grants.sql-323-       WHERE m.role_name = 'platform_administrator'
infrastructure\migrations\077_platform_administrator_grants.sql-324-         AND m.status = 'active'
infrastructure\migrations\077_platform_administrator_grants.sql-325-         AND NOT EXISTS (SELECT 1 FROM identity.platform_administrators pa
infrastructure\migrations\077_platform_administrator_grants.sql-326-                          WHERE pa.user_id = m.user_id AND pa.revoked_at IS NULL)) THEN
infrastructure\migrations\077_platform_administrator_grants.sql-327-    RAISE EXCEPTION
infrastructure\migrations\077_platform_administrator_grants.sql-328-      'backfill incomplete: at least one active platform_administrator membership has no active '
infrastructure\migrations\077_platform_administrator_grants.sql-329-      'grant, so that administrator has just lost every authority they had';
infrastructure\migrations\077_platform_administrator_grants.sql-330-  END IF;
--
infrastructure\migrations\076_fleet_registration_race.sql-101-    PERFORM set_config('app.bootstrap',      'on',         true);
infrastructure\migrations\076_fleet_registration_race.sql-102-    PERFORM set_config('app.bootstrap_user', v_user::text, true);
infrastructure\migrations\076_fleet_registration_race.sql-103-
infrastructure\migrations\076_fleet_registration_race.sql-104-    -- One organisation per person. AFTER the flag is set: under FORCE RLS with
infrastructure\migrations\076_fleet_registration_race.sql-105-    -- no tenant context this read returns zero rows for everybody, so placing
infrastructure\migrations\076_fleet_registration_race.sql-106-    -- it earlier would make it a check that cannot fire — the bug migration 037
infrastructure\migrations\076_fleet_registration_race.sql-107-    -- fixed in `register_workshop`. And after the LOCK, which is what makes the
infrastructure\migrations\076_fleet_registration_race.sql-108-    -- read meaningful when two requests arrive together.
infrastructure\migrations\076_fleet_registration_race.sql:109:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure\migrations\076_fleet_registration_race.sql-110-                WHERE user_id = v_user AND status = 'active') THEN
infrastructure\migrations\076_fleet_registration_race.sql-111-        PERFORM set_config('app.bootstrap',      '', true);
infrastructure\migrations\076_fleet_registration_race.sql-112-        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure\migrations\076_fleet_registration_race.sql-113-        -- ⚠️ THE MESSAGE NAMES A REACHABLE ALTERNATIVE. A rule with no way past
infrastructure\migrations\076_fleet_registration_race.sql-114-        -- it is a wall, and the person in front of it files a bug rather than
infrastructure\migrations\076_fleet_registration_race.sql-115-        -- acting.
infrastructure\migrations\076_fleet_registration_race.sql-116-        --
infrastructure\migrations\076_fleet_registration_race.sql-117-        -- 🔴 AND THE WORDING IS A CONTRACT. `RegistrationController.registerFleet`
--
infrastructure\migrations\076_fleet_registration_race.sql-148-    -- A depot immediately. `resolveTenantContext` copes with a NULL branch, but
infrastructure\migrations\076_fleet_registration_race.sql-149-    -- a fleet with nowhere to keep vehicles is not a state worth representing.
infrastructure\migrations\076_fleet_registration_race.sql-150-    INSERT INTO identity.branches (id, tenant_id, organization_id, name, status, created_by)
infrastructure\migrations\076_fleet_registration_race.sql-151-    VALUES (v_branch, v_tenant, v_org,
infrastructure\migrations\076_fleet_registration_race.sql-152-            COALESCE(NULLIF(btrim(p_location_name), ''), 'Main depot'),
infrastructure\migrations\076_fleet_registration_race.sql-153-            'active', v_user);
infrastructure\migrations\076_fleet_registration_race.sql-154-
infrastructure\migrations\076_fleet_registration_race.sql-155-    -- 🔴 LITERAL 2 of 2: the role, spelled as every consumer expects.
infrastructure\migrations\076_fleet_registration_race.sql:156:    INSERT INTO identity.memberships
infrastructure\migrations\076_fleet_registration_race.sql-157-        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure\migrations\076_fleet_registration_race.sql-158-    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'fleet_administrator', 'active', v_user);
infrastructure\migrations\076_fleet_registration_race.sql-159-
infrastructure\migrations\076_fleet_registration_race.sql-160-    -- Queued for verification INSIDE the same transaction that creates the
infrastructure\migrations\076_fleet_registration_race.sql-161-    -- fleet. Written afterwards on a separate connection it could survive a
infrastructure\migrations\076_fleet_registration_race.sql-162-    -- rolled-back sign-up and describe a fleet that does not exist — or be
infrastructure\migrations\076_fleet_registration_race.sql-163-    -- lost, leaving a fleet nobody is ever asked to verify.
infrastructure\migrations\076_fleet_registration_race.sql-164-    INSERT INTO identity.organization_registrations
--
infrastructure\migrations\075_fleet_registration.sql-3--- ══════════════════════════════════════════════════════════════════════════
infrastructure\migrations\075_fleet_registration.sql-4--- 🔴 THE THIRD TIME. Asked of the role BEFORE building any of fleet-web's 29
infrastructure\migrations\075_fleet_registration.sql-5--- screens, exactly as 08-09 asked it of `supplier_owner` and 08-08 of
infrastructure\migrations\075_fleet_registration.sql-6--- `customer`: **which production code path WRITES a `fleet_administrator`
infrastructure\migrations\075_fleet_registration.sql-7--- membership?**
infrastructure\migrations\075_fleet_registration.sql-8---
infrastructure\migrations\075_fleet_registration.sql-9---     None.
infrastructure\migrations\075_fleet_registration.sql-10---
infrastructure\migrations\075_fleet_registration.sql:11:-- `identity.memberships` has four writers and this was checked against
infrastructure\migrations\075_fleet_registration.sql-12--- `pg_proc`, not against a grep of the source:
infrastructure\migrations\075_fleet_registration.sql-13---
infrastructure\migrations\075_fleet_registration.sql-14---     register_workshop   → always 'workshop_owner'
infrastructure\migrations\075_fleet_registration.sql-15---     register_supplier   → always 'supplier_owner'
infrastructure\migrations\075_fleet_registration.sql-16---     enrol_as_customer   → always 'customer'
infrastructure\migrations\075_fleet_registration.sql-17---     MembershipService.grant()  → admin-only, and needs an organisation that
infrastructure\migrations\075_fleet_registration.sql-18---                                  already exists with a member who can grant
infrastructure\migrations\075_fleet_registration.sql-19---
--
infrastructure\migrations\075_fleet_registration.sql-122-    -- SUCCESS path leaves the caller's transaction open.
infrastructure\migrations\075_fleet_registration.sql-123-    PERFORM set_config('app.bootstrap',      'on',         true);
infrastructure\migrations\075_fleet_registration.sql-124-    PERFORM set_config('app.bootstrap_user', v_user::text, true);
infrastructure\migrations\075_fleet_registration.sql-125-
infrastructure\migrations\075_fleet_registration.sql-126-    -- One organisation per person. AFTER the flag is set: under FORCE RLS with
infrastructure\migrations\075_fleet_registration.sql-127-    -- no tenant context this read returns zero rows for everybody, so placing
infrastructure\migrations\075_fleet_registration.sql-128-    -- it earlier would make it a check that cannot fire — the bug migration 037
infrastructure\migrations\075_fleet_registration.sql-129-    -- fixed in `register_workshop`.
infrastructure\migrations\075_fleet_registration.sql:130:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure\migrations\075_fleet_registration.sql-131-                WHERE user_id = v_user AND status = 'active') THEN
infrastructure\migrations\075_fleet_registration.sql-132-        PERFORM set_config('app.bootstrap',      '', true);
infrastructure\migrations\075_fleet_registration.sql-133-        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure\migrations\075_fleet_registration.sql-134-        -- ⚠️ THE MESSAGE NAMES A REACHABLE ALTERNATIVE. A rule with no way past
infrastructure\migrations\075_fleet_registration.sql-135-        -- it is a wall, and the person in front of it files a bug rather than
infrastructure\migrations\075_fleet_registration.sql-136-        -- acting.
infrastructure\migrations\075_fleet_registration.sql-137-        RAISE EXCEPTION 'this account already belongs to an organisation. Sign in with a different account to register a fleet, or ask a platform administrator to add you to an existing fleet.';
infrastructure\migrations\075_fleet_registration.sql-138-    END IF;
--
infrastructure\migrations\075_fleet_registration.sql-163-    -- A depot immediately. `resolveTenantContext` copes with a NULL branch, but
infrastructure\migrations\075_fleet_registration.sql-164-    -- a fleet with nowhere to keep vehicles is not a state worth representing.
infrastructure\migrations\075_fleet_registration.sql-165-    INSERT INTO identity.branches (id, tenant_id, organization_id, name, status, created_by)
infrastructure\migrations\075_fleet_registration.sql-166-    VALUES (v_branch, v_tenant, v_org,
infrastructure\migrations\075_fleet_registration.sql-167-            COALESCE(NULLIF(btrim(p_location_name), ''), 'Main depot'),
infrastructure\migrations\075_fleet_registration.sql-168-            'active', v_user);
infrastructure\migrations\075_fleet_registration.sql-169-
infrastructure\migrations\075_fleet_registration.sql-170-    -- 🔴 LITERAL 2 of 2: the role, spelled as every consumer expects.
infrastructure\migrations\075_fleet_registration.sql:171:    INSERT INTO identity.memberships
infrastructure\migrations\075_fleet_registration.sql-172-        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure\migrations\075_fleet_registration.sql-173-    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'fleet_administrator', 'active', v_user);
infrastructure\migrations\075_fleet_registration.sql-174-
infrastructure\migrations\075_fleet_registration.sql-175-    -- Queued for verification INSIDE the same transaction that creates the
infrastructure\migrations\075_fleet_registration.sql-176-    -- fleet. Written afterwards on a separate connection it could survive a
infrastructure\migrations\075_fleet_registration.sql-177-    -- rolled-back sign-up and describe a fleet that does not exist — or be
infrastructure\migrations\075_fleet_registration.sql-178-    -- lost, leaving a fleet nobody is ever asked to verify.
infrastructure\migrations\075_fleet_registration.sql-179-    INSERT INTO identity.organization_registrations
--
infrastructure\migrations\075_fleet_registration.sql-325-    -- Transaction-local, so a pooled connection cannot carry it into the next
infrastructure\migrations\075_fleet_registration.sql-326-    -- request even on an abort. Cleared explicitly below as well, because the
infrastructure\migrations\075_fleet_registration.sql-327-    -- caller's transaction continues after this trigger returns and must not
infrastructure\migrations\075_fleet_registration.sql-328-    -- keep a read exemption it never asked for.
infrastructure\migrations\075_fleet_registration.sql-329-    PERFORM set_config('app.admin_lookup', 'on', true);
infrastructure\migrations\075_fleet_registration.sql-330-
infrastructure\migrations\075_fleet_registration.sql-331-    FOR v_admin IN
infrastructure\migrations\075_fleet_registration.sql-332-        SELECT DISTINCT m.user_id
infrastructure\migrations\075_fleet_registration.sql:333:          FROM identity.memberships m
infrastructure\migrations\075_fleet_registration.sql-334-         WHERE m.role_name = 'platform_administrator'
infrastructure\migrations\075_fleet_registration.sql-335-           AND m.status = 'active'
infrastructure\migrations\075_fleet_registration.sql-336-    LOOP
infrastructure\migrations\075_fleet_registration.sql-337-        v_written := v_written + comms.notify_user(
infrastructure\migrations\075_fleet_registration.sql-338-            NEW.tenant_id,
infrastructure\migrations\075_fleet_registration.sql-339-            NEW.organization_id,
infrastructure\migrations\075_fleet_registration.sql-340-            v_admin.user_id,
infrastructure\migrations\075_fleet_registration.sql-341-            'organization.registered',
--
infrastructure\migrations\072_registration_defects_from_supervisor.sql-199-        RAISE EXCEPTION 'no active application user for this identity';
infrastructure\migrations\072_registration_defects_from_supervisor.sql-200-    END IF;
infrastructure\migrations\072_registration_defects_from_supervisor.sql-201-
infrastructure\migrations\072_registration_defects_from_supervisor.sql-202-    PERFORM pg_advisory_xact_lock(hashtextextended('identity.register:' || v_user::text, 0));
infrastructure\migrations\072_registration_defects_from_supervisor.sql-203-
infrastructure\migrations\072_registration_defects_from_supervisor.sql-204-    PERFORM set_config('app.bootstrap',      'on',         true);
infrastructure\migrations\072_registration_defects_from_supervisor.sql-205-    PERFORM set_config('app.bootstrap_user', v_user::text, true);
infrastructure\migrations\072_registration_defects_from_supervisor.sql-206-
infrastructure\migrations\072_registration_defects_from_supervisor.sql:207:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure\migrations\072_registration_defects_from_supervisor.sql-208-                WHERE user_id = v_user AND status = 'active') THEN
infrastructure\migrations\072_registration_defects_from_supervisor.sql-209-        PERFORM set_config('app.bootstrap',      '', true);
infrastructure\migrations\072_registration_defects_from_supervisor.sql-210-        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure\migrations\072_registration_defects_from_supervisor.sql-211-        RAISE EXCEPTION 'this account already belongs to an organisation. Sign in with a different account to register a supplier, or ask a platform administrator to add you to an existing supplier.';
infrastructure\migrations\072_registration_defects_from_supervisor.sql-212-    END IF;
infrastructure\migrations\072_registration_defects_from_supervisor.sql-213-
infrastructure\migrations\072_registration_defects_from_supervisor.sql-214-    v_slug := regexp_replace(lower(btrim(p_supplier_name)), '[^a-z0-9]+', '-', 'g');
infrastructure\migrations\072_registration_defects_from_supervisor.sql-215-    v_slug := btrim(v_slug, '-');
--
infrastructure\migrations\072_registration_defects_from_supervisor.sql-230-    INSERT INTO identity.organizations (id, tenant_id, name, org_type, status, created_by)
infrastructure\migrations\072_registration_defects_from_supervisor.sql-231-    VALUES (v_org, v_tenant, btrim(p_supplier_name), 'parts_supplier', 'active', v_user);
infrastructure\migrations\072_registration_defects_from_supervisor.sql-232-
infrastructure\migrations\072_registration_defects_from_supervisor.sql-233-    INSERT INTO identity.branches (id, tenant_id, organization_id, name, status, created_by)
infrastructure\migrations\072_registration_defects_from_supervisor.sql-234-    VALUES (v_branch, v_tenant, v_org,
infrastructure\migrations\072_registration_defects_from_supervisor.sql-235-            COALESCE(NULLIF(btrim(p_location_name), ''), 'Main location'),
infrastructure\migrations\072_registration_defects_from_supervisor.sql-236-            'active', v_user);
infrastructure\migrations\072_registration_defects_from_supervisor.sql-237-
infrastructure\migrations\072_registration_defects_from_supervisor.sql:238:    INSERT INTO identity.memberships
infrastructure\migrations\072_registration_defects_from_supervisor.sql-239-        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure\migrations\072_registration_defects_from_supervisor.sql-240-    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'supplier_owner', 'active', v_user);
infrastructure\migrations\072_registration_defects_from_supervisor.sql-241-
infrastructure\migrations\072_registration_defects_from_supervisor.sql-242-    INSERT INTO catalogue.suppliers
infrastructure\migrations\072_registration_defects_from_supervisor.sql-243-        (id, organization_id, slug, name, country, is_published, is_verified, created_by)
infrastructure\migrations\072_registration_defects_from_supervisor.sql-244-    VALUES (v_supplier, v_org, v_slug, btrim(p_supplier_name), 'GH', FALSE, FALSE, v_user);
infrastructure\migrations\072_registration_defects_from_supervisor.sql-245-
infrastructure\migrations\072_registration_defects_from_supervisor.sql-246-    -- 🔴 DEFECT A — BOTH ROWS, OR THE LISTING IS AN ORPHAN NOBODY CAN
--
infrastructure\migrations\072_registration_defects_from_supervisor.sql-296-        RAISE EXCEPTION 'no active application user for this identity';
infrastructure\migrations\072_registration_defects_from_supervisor.sql-297-    END IF;
infrastructure\migrations\072_registration_defects_from_supervisor.sql-298-
infrastructure\migrations\072_registration_defects_from_supervisor.sql-299-    PERFORM pg_advisory_xact_lock(hashtextextended('identity.register:' || v_user::text, 0));
infrastructure\migrations\072_registration_defects_from_supervisor.sql-300-
infrastructure\migrations\072_registration_defects_from_supervisor.sql-301-    PERFORM set_config('app.bootstrap',      'on',          true);
infrastructure\migrations\072_registration_defects_from_supervisor.sql-302-    PERFORM set_config('app.bootstrap_user', v_user::text,  true);
infrastructure\migrations\072_registration_defects_from_supervisor.sql-303-
infrastructure\migrations\072_registration_defects_from_supervisor.sql:304:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure\migrations\072_registration_defects_from_supervisor.sql-305-                WHERE user_id = v_user AND status = 'active') THEN
infrastructure\migrations\072_registration_defects_from_supervisor.sql-306-        PERFORM set_config('app.bootstrap',      '', true);
infrastructure\migrations\072_registration_defects_from_supervisor.sql-307-        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure\migrations\072_registration_defects_from_supervisor.sql-308-        RAISE EXCEPTION 'this account already belongs to an organisation';
infrastructure\migrations\072_registration_defects_from_supervisor.sql-309-    END IF;
infrastructure\migrations\072_registration_defects_from_supervisor.sql-310-
infrastructure\migrations\072_registration_defects_from_supervisor.sql-311-    v_slug := regexp_replace(lower(btrim(p_workshop_name)), '[^a-z0-9]+', '-', 'g');
infrastructure\migrations\072_registration_defects_from_supervisor.sql-312-    v_slug := btrim(v_slug, '-');
--
infrastructure\migrations\072_registration_defects_from_supervisor.sql-326-    INSERT INTO identity.organizations (id, tenant_id, name, org_type, status, created_by)
infrastructure\migrations\072_registration_defects_from_supervisor.sql-327-    VALUES (v_org, v_tenant, btrim(p_workshop_name), 'individual_workshop', 'active', v_user);
infrastructure\migrations\072_registration_defects_from_supervisor.sql-328-
infrastructure\migrations\072_registration_defects_from_supervisor.sql-329-    INSERT INTO identity.branches (id, tenant_id, organization_id, name, status, created_by)
infrastructure\migrations\072_registration_defects_from_supervisor.sql-330-    VALUES (v_branch, v_tenant, v_org,
infrastructure\migrations\072_registration_defects_from_supervisor.sql-331-            COALESCE(NULLIF(btrim(p_branch_name), ''), 'Main branch'),
infrastructure\migrations\072_registration_defects_from_supervisor.sql-332-            'active', v_user);
infrastructure\migrations\072_registration_defects_from_supervisor.sql-333-
infrastructure\migrations\072_registration_defects_from_supervisor.sql:334:    INSERT INTO identity.memberships
infrastructure\migrations\072_registration_defects_from_supervisor.sql-335-        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure\migrations\072_registration_defects_from_supervisor.sql-336-    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'workshop_owner', 'active', v_user);
infrastructure\migrations\072_registration_defects_from_supervisor.sql-337-
infrastructure\migrations\072_registration_defects_from_supervisor.sql-338-    -- 🔴 DEFECT B — THE DIRECTORY DRAFT, so approval has a row to publish.
infrastructure\migrations\072_registration_defects_from_supervisor.sql-339-    -- Unpublished, which is all the new INSERT policy permits. `city` and
infrastructure\migrations\072_registration_defects_from_supervisor.sql-340-    -- `country` are NOT NULL and the form asks for neither; the workshop fills
infrastructure\migrations\072_registration_defects_from_supervisor.sql-341-    -- them in from Settings, and until it does the row is invisible to everyone.
infrastructure\migrations\072_registration_defects_from_supervisor.sql-342-    INSERT INTO catalogue.mechanic_directory
--
infrastructure\migrations\071_registration_defects_from_codex.sql-3--- ══════════════════════════════════════════════════════════════════════════
infrastructure\migrations\071_registration_defects_from_codex.sql-4--- Codex reviewed the self-service registration path on 2026-08-09 and returned
infrastructure\migrations\071_registration_defects_from_codex.sql-5--- three HIGH findings. All three were confirmed by measurement before anything
infrastructure\migrations\071_registration_defects_from_codex.sql-6--- here was written; none was accepted on argument alone.
infrastructure\migrations\071_registration_defects_from_codex.sql-7---
infrastructure\migrations\071_registration_defects_from_codex.sql-8--- 🔴 FINDING 3 IS THE ONE THAT MATTERS MOST, AND MY OWN REHEARSAL COULD NOT
infrastructure\migrations\071_registration_defects_from_codex.sql-9--- HAVE CAUGHT IT.
infrastructure\migrations\071_registration_defects_from_codex.sql-10---
infrastructure\migrations\071_registration_defects_from_codex.sql:11:-- 070's trigger reads `identity.memberships` to find platform administrators.
infrastructure\migrations\071_registration_defects_from_codex.sql-12--- It is SECURITY DEFINER, and I wrote in its header that this is what makes the
infrastructure\migrations\071_registration_defects_from_codex.sql-13--- read work under FORCE RLS. THAT IS WRONG. SECURITY DEFINER changes WHO the
infrastructure\migrations\071_registration_defects_from_codex.sql-14--- query runs as; it does not exempt anybody from RLS. Only `rolbypassrls` or
infrastructure\migrations\071_registration_defects_from_codex.sql-15--- table ownership without FORCE does that.
infrastructure\migrations\071_registration_defects_from_codex.sql-16---
infrastructure\migrations\071_registration_defects_from_codex.sql-17--- Measured on this database:
infrastructure\migrations\071_registration_defects_from_codex.sql-18---
infrastructure\migrations\071_registration_defects_from_codex.sql-19---     rolname          | rolsuper | rolbypassrls
--
infrastructure\migrations\071_registration_defects_from_codex.sql-82-
infrastructure\migrations\071_registration_defects_from_codex.sql-83-REVOKE ALL ON FUNCTION identity.in_admin_lookup() FROM PUBLIC;
infrastructure\migrations\071_registration_defects_from_codex.sql-84-GRANT EXECUTE ON FUNCTION identity.in_admin_lookup() TO autoworkshop_app;
infrastructure\migrations\071_registration_defects_from_codex.sql-85-
infrastructure\migrations\071_registration_defects_from_codex.sql-86--- ⚠️ THE NARROWEST POSSIBLE DOOR. It exposes ONLY active
infrastructure\migrations\071_registration_defects_from_codex.sql-87--- `platform_administrator` rows — not every membership — so even if the owner
infrastructure\migrations\071_registration_defects_from_codex.sql-88--- check were somehow satisfied outside the alert, what leaks is the list of
infrastructure\migrations\071_registration_defects_from_codex.sql-89--- administrators' user ids and nothing else. A door sized to the job.
infrastructure\migrations\071_registration_defects_from_codex.sql:90:DROP POLICY IF EXISTS admin_lookup_select ON identity.memberships;
infrastructure\migrations\071_registration_defects_from_codex.sql:91:CREATE POLICY admin_lookup_select ON identity.memberships FOR SELECT USING (
infrastructure\migrations\071_registration_defects_from_codex.sql-92-  identity.in_admin_lookup()
infrastructure\migrations\071_registration_defects_from_codex.sql-93-  AND role_name = 'platform_administrator'
infrastructure\migrations\071_registration_defects_from_codex.sql-94-  AND status = 'active'
infrastructure\migrations\071_registration_defects_from_codex.sql-95-);
infrastructure\migrations\071_registration_defects_from_codex.sql-96-
infrastructure\migrations\071_registration_defects_from_codex.sql-97-CREATE OR REPLACE FUNCTION identity.alert_admins_of_registration()
infrastructure\migrations\071_registration_defects_from_codex.sql-98-RETURNS trigger
infrastructure\migrations\071_registration_defects_from_codex.sql-99-LANGUAGE plpgsql
--
infrastructure\migrations\071_registration_defects_from_codex.sql-120-    -- Transaction-local, so a pooled connection cannot carry it into the next
infrastructure\migrations\071_registration_defects_from_codex.sql-121-    -- request even on an abort. Cleared explicitly below as well, because the
infrastructure\migrations\071_registration_defects_from_codex.sql-122-    -- caller's transaction continues after this trigger returns and must not
infrastructure\migrations\071_registration_defects_from_codex.sql-123-    -- keep a read exemption it never asked for.
infrastructure\migrations\071_registration_defects_from_codex.sql-124-    PERFORM set_config('app.admin_lookup', 'on', true);
infrastructure\migrations\071_registration_defects_from_codex.sql-125-
infrastructure\migrations\071_registration_defects_from_codex.sql-126-    FOR v_admin IN
infrastructure\migrations\071_registration_defects_from_codex.sql-127-        SELECT DISTINCT m.user_id
infrastructure\migrations\071_registration_defects_from_codex.sql:128:          FROM identity.memberships m
infrastructure\migrations\071_registration_defects_from_codex.sql-129-         WHERE m.role_name = 'platform_administrator'
infrastructure\migrations\071_registration_defects_from_codex.sql-130-           AND m.status = 'active'
infrastructure\migrations\071_registration_defects_from_codex.sql-131-    LOOP
infrastructure\migrations\071_registration_defects_from_codex.sql-132-        v_written := v_written + comms.notify_user(
infrastructure\migrations\071_registration_defects_from_codex.sql-133-            NEW.tenant_id,
infrastructure\migrations\071_registration_defects_from_codex.sql-134-            NEW.organization_id,
infrastructure\migrations\071_registration_defects_from_codex.sql-135-            v_admin.user_id,
infrastructure\migrations\071_registration_defects_from_codex.sql-136-            'organization.registered',
--
infrastructure\migrations\071_registration_defects_from_codex.sql-219-    -- as 064's `lead_insert`, which pins a new lead to `status = 'new'`.
infrastructure\migrations\071_registration_defects_from_codex.sql-220-    AND is_published = FALSE
infrastructure\migrations\071_registration_defects_from_codex.sql-221-    AND is_verified  = FALSE
infrastructure\migrations\071_registration_defects_from_codex.sql-222-  );
infrastructure\migrations\071_registration_defects_from_codex.sql-223-
infrastructure\migrations\071_registration_defects_from_codex.sql-224--- ═══════════════════════════════════════════════════════════════════════════
infrastructure\migrations\071_registration_defects_from_codex.sql-225--- FINDING 1 — "one organisation per person" was an unlocked read
infrastructure\migrations\071_registration_defects_from_codex.sql-226---
infrastructure\migrations\071_registration_defects_from_codex.sql:227:-- Both functions check `IF EXISTS (SELECT 1 FROM identity.memberships WHERE
infrastructure\migrations\071_registration_defects_from_codex.sql-228--- user_id = ...)` with nothing serialising it. Two concurrent requests for the
infrastructure\migrations\071_registration_defects_from_codex.sql-229--- same subject — which is what a double-submitted form on a slow connection IS
infrastructure\migrations\071_registration_defects_from_codex.sql-230--- — both see no membership and both create a tenant. The caller ends up owning
infrastructure\migrations\071_registration_defects_from_codex.sql-231--- two organisations, and `resolveTenantContext` then has to pick one.
infrastructure\migrations\071_registration_defects_from_codex.sql-232---
infrastructure\migrations\071_registration_defects_from_codex.sql-233--- ⚠️ A UNIQUE INDEX ON `(user_id) WHERE status='active'` WAS REJECTED. It reads
infrastructure\migrations\071_registration_defects_from_codex.sql-234--- like the obvious fix and it would forbid something the product allows:
infrastructure\migrations\071_registration_defects_from_codex.sql-235--- `MembershipService.grant()` can legitimately add a person to a second
--
infrastructure\migrations\071_registration_defects_from_codex.sql-281-    END IF;
infrastructure\migrations\071_registration_defects_from_codex.sql-282-
infrastructure\migrations\071_registration_defects_from_codex.sql-283-    -- FINDING 1 — serialise this identity's registrations before reading.
infrastructure\migrations\071_registration_defects_from_codex.sql-284-    PERFORM pg_advisory_xact_lock(hashtextextended('identity.register:' || v_user::text, 0));
infrastructure\migrations\071_registration_defects_from_codex.sql-285-
infrastructure\migrations\071_registration_defects_from_codex.sql-286-    PERFORM set_config('app.bootstrap',      'on',          true);
infrastructure\migrations\071_registration_defects_from_codex.sql-287-    PERFORM set_config('app.bootstrap_user', v_user::text,  true);
infrastructure\migrations\071_registration_defects_from_codex.sql-288-
infrastructure\migrations\071_registration_defects_from_codex.sql:289:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure\migrations\071_registration_defects_from_codex.sql-290-                WHERE user_id = v_user AND status = 'active') THEN
infrastructure\migrations\071_registration_defects_from_codex.sql-291-        PERFORM set_config('app.bootstrap',      '', true);
infrastructure\migrations\071_registration_defects_from_codex.sql-292-        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure\migrations\071_registration_defects_from_codex.sql-293-        RAISE EXCEPTION 'this account already belongs to an organisation';
infrastructure\migrations\071_registration_defects_from_codex.sql-294-    END IF;
infrastructure\migrations\071_registration_defects_from_codex.sql-295-
infrastructure\migrations\071_registration_defects_from_codex.sql-296-    v_slug := regexp_replace(lower(btrim(p_workshop_name)), '[^a-z0-9]+', '-', 'g');
infrastructure\migrations\071_registration_defects_from_codex.sql-297-    v_slug := btrim(v_slug, '-');
--
infrastructure\migrations\071_registration_defects_from_codex.sql-311-    INSERT INTO identity.organizations (id, tenant_id, name, org_type, status, created_by)
infrastructure\migrations\071_registration_defects_from_codex.sql-312-    VALUES (v_org, v_tenant, btrim(p_workshop_name), 'individual_workshop', 'active', v_user);
infrastructure\migrations\071_registration_defects_from_codex.sql-313-
infrastructure\migrations\071_registration_defects_from_codex.sql-314-    INSERT INTO identity.branches (id, tenant_id, organization_id, name, status, created_by)
infrastructure\migrations\071_registration_defects_from_codex.sql-315-    VALUES (v_branch, v_tenant, v_org,
infrastructure\migrations\071_registration_defects_from_codex.sql-316-            COALESCE(NULLIF(btrim(p_branch_name), ''), 'Main branch'),
infrastructure\migrations\071_registration_defects_from_codex.sql-317-            'active', v_user);
infrastructure\migrations\071_registration_defects_from_codex.sql-318-
infrastructure\migrations\071_registration_defects_from_codex.sql:319:    INSERT INTO identity.memberships
infrastructure\migrations\071_registration_defects_from_codex.sql-320-        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure\migrations\071_registration_defects_from_codex.sql-321-    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'workshop_owner', 'active', v_user);
infrastructure\migrations\071_registration_defects_from_codex.sql-322-
infrastructure\migrations\071_registration_defects_from_codex.sql-323-    INSERT INTO identity.organization_registrations
infrastructure\migrations\071_registration_defects_from_codex.sql-324-        (tenant_id, organization_id, kind, status, submitted_by)
infrastructure\migrations\071_registration_defects_from_codex.sql-325-    VALUES (v_tenant, v_org, 'workshop', 'pending', v_user);
infrastructure\migrations\071_registration_defects_from_codex.sql-326-
infrastructure\migrations\071_registration_defects_from_codex.sql-327-    PERFORM set_config('app.bootstrap',      '', true);
--
infrastructure\migrations\071_registration_defects_from_codex.sql-368-    END IF;
infrastructure\migrations\071_registration_defects_from_codex.sql-369-
infrastructure\migrations\071_registration_defects_from_codex.sql-370-    -- FINDING 1 — serialise this identity's registrations before reading.
infrastructure\migrations\071_registration_defects_from_codex.sql-371-    PERFORM pg_advisory_xact_lock(hashtextextended('identity.register:' || v_user::text, 0));
infrastructure\migrations\071_registration_defects_from_codex.sql-372-
infrastructure\migrations\071_registration_defects_from_codex.sql-373-    PERFORM set_config('app.bootstrap',      'on',         true);
infrastructure\migrations\071_registration_defects_from_codex.sql-374-    PERFORM set_config('app.bootstrap_user', v_user::text, true);
infrastructure\migrations\071_registration_defects_from_codex.sql-375-
infrastructure\migrations\071_registration_defects_from_codex.sql:376:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure\migrations\071_registration_defects_from_codex.sql-377-                WHERE user_id = v_user AND status = 'active') THEN
infrastructure\migrations\071_registration_defects_from_codex.sql-378-        PERFORM set_config('app.bootstrap',      '', true);
infrastructure\migrations\071_registration_defects_from_codex.sql-379-        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure\migrations\071_registration_defects_from_codex.sql-380-        RAISE EXCEPTION 'this account already belongs to an organisation. Sign in with a different account to register a supplier, or ask a platform administrator to add you to an existing supplier.';
infrastructure\migrations\071_registration_defects_from_codex.sql-381-    END IF;
infrastructure\migrations\071_registration_defects_from_codex.sql-382-
infrastructure\migrations\071_registration_defects_from_codex.sql-383-    v_slug := regexp_replace(lower(btrim(p_supplier_name)), '[^a-z0-9]+', '-', 'g');
infrastructure\migrations\071_registration_defects_from_codex.sql-384-    v_slug := btrim(v_slug, '-');
--
infrastructure\migrations\071_registration_defects_from_codex.sql-398-    INSERT INTO identity.organizations (id, tenant_id, name, org_type, status, created_by)
infrastructure\migrations\071_registration_defects_from_codex.sql-399-    VALUES (v_org, v_tenant, btrim(p_supplier_name), 'parts_supplier', 'active', v_user);
infrastructure\migrations\071_registration_defects_from_codex.sql-400-
infrastructure\migrations\071_registration_defects_from_codex.sql-401-    INSERT INTO identity.branches (id, tenant_id, organization_id, name, status, created_by)
infrastructure\migrations\071_registration_defects_from_codex.sql-402-    VALUES (v_branch, v_tenant, v_org,
infrastructure\migrations\071_registration_defects_from_codex.sql-403-            COALESCE(NULLIF(btrim(p_location_name), ''), 'Main location'),
infrastructure\migrations\071_registration_defects_from_codex.sql-404-            'active', v_user);
infrastructure\migrations\071_registration_defects_from_codex.sql-405-
infrastructure\migrations\071_registration_defects_from_codex.sql:406:    INSERT INTO identity.memberships
infrastructure\migrations\071_registration_defects_from_codex.sql-407-        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure\migrations\071_registration_defects_from_codex.sql-408-    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'supplier_owner', 'active', v_user);
infrastructure\migrations\071_registration_defects_from_codex.sql-409-
infrastructure\migrations\071_registration_defects_from_codex.sql-410-    -- ── FINDING 2 — THE MARKETPLACE LISTING IS CREATED HERE, BOUND TO THE ORG.
infrastructure\migrations\071_registration_defects_from_codex.sql-411-    --
infrastructure\migrations\071_registration_defects_from_codex.sql-412-    -- Unpublished and unverified, which is what the new INSERT policy above
infrastructure\migrations\071_registration_defects_from_codex.sql-413-    -- allows and nothing more. Approval later flips both flags BY
infrastructure\migrations\071_registration_defects_from_codex.sql-414-    -- `organization_id`, so it can never reach another business's row and can
--
infrastructure\migrations\071_registration_defects_from_codex.sql-446--- ═══════════════════════════════════════════════════════════════════════════
infrastructure\migrations\071_registration_defects_from_codex.sql-447-DO $$
infrastructure\migrations\071_registration_defects_from_codex.sql-448-DECLARE
infrastructure\migrations\071_registration_defects_from_codex.sql-449-    v_admins integer;
infrastructure\migrations\071_registration_defects_from_codex.sql-450-    v_total  integer;
infrastructure\migrations\071_registration_defects_from_codex.sql-451-BEGIN
infrastructure\migrations\071_registration_defects_from_codex.sql-452-    -- No administrators at all is legitimate on a fresh deployment, and this
infrastructure\migrations\071_registration_defects_from_codex.sql-453-    -- check must not make the first one impossible to create.
infrastructure\migrations\071_registration_defects_from_codex.sql:454:    SELECT count(*) INTO v_total FROM identity.memberships
infrastructure\migrations\071_registration_defects_from_codex.sql-455-     WHERE role_name = 'platform_administrator' AND status = 'active';
infrastructure\migrations\071_registration_defects_from_codex.sql-456-
infrastructure\migrations\071_registration_defects_from_codex.sql-457-    -- 🔴 `CREATE ROLE` NEEDS `CREATEROLE`, AND THE PREMISE OF THIS WHOLE FILE
infrastructure\migrations\071_registration_defects_from_codex.sql-458-    -- IS THAT RENDER'S MIGRATION ROLE IS NOT A SUPERUSER.
infrastructure\migrations\071_registration_defects_from_codex.sql-459-    --
infrastructure\migrations\071_registration_defects_from_codex.sql-460-    -- Without the attribute this block raises, the transaction rolls back, and
infrastructure\migrations\071_registration_defects_from_codex.sql-461-    -- migrations 067-072 never apply — ON PRODUCTION ONLY, while passing
infrastructure\migrations\071_registration_defects_from_codex.sql-462-    -- locally where the owner is `rolsuper=t`. A verification step that can
--
infrastructure\migrations\071_registration_defects_from_codex.sql-482-        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA identity TO migration_071_norls;
infrastructure\migrations\071_registration_defects_from_codex.sql-483-
infrastructure\migrations\071_registration_defects_from_codex.sql-484-        -- The exact conditions inside the trigger: the bootstrap door open for
infrastructure\migrations\071_registration_defects_from_codex.sql-485-        -- some registrant, and the admin-lookup flag on.
infrastructure\migrations\071_registration_defects_from_codex.sql-486-        PERFORM set_config('app.bootstrap', 'on', true);
infrastructure\migrations\071_registration_defects_from_codex.sql-487-        PERFORM set_config('app.admin_lookup', 'on', true);
infrastructure\migrations\071_registration_defects_from_codex.sql-488-
infrastructure\migrations\071_registration_defects_from_codex.sql-489-        SET LOCAL ROLE migration_071_norls;
infrastructure\migrations\071_registration_defects_from_codex.sql:490:        SELECT count(*) INTO v_admins FROM identity.memberships
infrastructure\migrations\071_registration_defects_from_codex.sql-491-         WHERE role_name = 'platform_administrator' AND status = 'active';
infrastructure\migrations\071_registration_defects_from_codex.sql-492-        RESET ROLE;
infrastructure\migrations\071_registration_defects_from_codex.sql-493-
infrastructure\migrations\071_registration_defects_from_codex.sql-494-        PERFORM set_config('app.bootstrap', '', true);
infrastructure\migrations\071_registration_defects_from_codex.sql-495-        PERFORM set_config('app.admin_lookup', '', true);
infrastructure\migrations\071_registration_defects_from_codex.sql-496-
infrastructure\migrations\071_registration_defects_from_codex.sql-497-        -- ⚠️ `DROP OWNED BY` FIRST, OR THE DROP FAILS AND TAKES THE MIGRATION
infrastructure\migrations\071_registration_defects_from_codex.sql-498-        -- WITH IT. A role cannot be dropped while any grant still references
--
infrastructure\migrations\071_registration_defects_from_codex.sql-509-        -- ⚠️ `v_admins` IS EXPECTED TO BE 0 HERE AND THAT IS CORRECT. The new
infrastructure\migrations\071_registration_defects_from_codex.sql-510-        -- policy requires `in_admin_lookup()`, which requires `current_user` to
infrastructure\migrations\071_registration_defects_from_codex.sql-511-        -- be the ALERT FUNCTION'S OWNER — and this block runs as a throwaway
infrastructure\migrations\071_registration_defects_from_codex.sql-512-        -- role that is deliberately NOT that owner. What is being proven is
infrastructure\migrations\071_registration_defects_from_codex.sql-513-        -- that the door does NOT open for an arbitrary role that merely sets
infrastructure\migrations\071_registration_defects_from_codex.sql-514-        -- the flag, i.e. that finding 3's fix did not become finding 3's hole.
infrastructure\migrations\071_registration_defects_from_codex.sql-515-        IF v_admins <> 0 THEN
infrastructure\migrations\071_registration_defects_from_codex.sql-516-            RAISE EXCEPTION
infrastructure\migrations\071_registration_defects_from_codex.sql:517:                'app.admin_lookup opened identity.memberships to a role that is NOT '
infrastructure\migrations\071_registration_defects_from_codex.sql-518-                'the alert function''s owner (% rows). set_config is not privileged, '
infrastructure\migrations\071_registration_defects_from_codex.sql-519-                'so this door would be forgeable by any application connection. '
infrastructure\migrations\071_registration_defects_from_codex.sql-520-                'Nothing has been applied.', v_admins;
infrastructure\migrations\071_registration_defects_from_codex.sql-521-        END IF;
infrastructure\migrations\071_registration_defects_from_codex.sql-522-    END IF;
infrastructure\migrations\071_registration_defects_from_codex.sql-523-
infrastructure\migrations\071_registration_defects_from_codex.sql-524-    -- ── THE POSITIVE ARM ───────────────────────────────────────────────────
infrastructure\migrations\071_registration_defects_from_codex.sql-525-    --
--
infrastructure\migrations\071_registration_defects_from_codex.sql-535-    -- ⚠️ AND IT IS ONLY MEANINGFUL ON RENDER, WHICH IS STATED RATHER THAN
infrastructure\migrations\071_registration_defects_from_codex.sql-536-    -- GLOSSED. Locally the owner is `rolbypassrls=t`, so it would see the rows
infrastructure\migrations\071_registration_defects_from_codex.sql-537-    -- with or without the policy and passes for the wrong reason. On Render the
infrastructure\migrations\071_registration_defects_from_codex.sql-538-    -- migration role is not a superuser and FORCE RLS binds it, so there the
infrastructure\migrations\071_registration_defects_from_codex.sql-539-    -- policy is the only thing that can make this succeed — which is exactly
infrastructure\migrations\071_registration_defects_from_codex.sql-540-    -- where the assertion needs to bite.
infrastructure\migrations\071_registration_defects_from_codex.sql-541-    IF v_total > 0 THEN
infrastructure\migrations\071_registration_defects_from_codex.sql-542-        PERFORM set_config('app.admin_lookup', 'on', true);
infrastructure\migrations\071_registration_defects_from_codex.sql:543:        SELECT count(*) INTO v_admins FROM identity.memberships
infrastructure\migrations\071_registration_defects_from_codex.sql-544-         WHERE role_name = 'platform_administrator' AND status = 'active';
infrastructure\migrations\071_registration_defects_from_codex.sql-545-        PERFORM set_config('app.admin_lookup', '', true);
infrastructure\migrations\071_registration_defects_from_codex.sql-546-
infrastructure\migrations\071_registration_defects_from_codex.sql-547-        IF v_admins < v_total THEN
infrastructure\migrations\071_registration_defects_from_codex.sql-548-            RAISE EXCEPTION
infrastructure\migrations\071_registration_defects_from_codex.sql-549-                'the admin-lookup door does NOT open for %: it sees % of % active '
infrastructure\migrations\071_registration_defects_from_codex.sql-550-                'platform administrators. alert_admins_of_registration would write '
infrastructure\migrations\071_registration_defects_from_codex.sql-551-                'zero alerts and raise only a NOTICE. Nothing has been applied.',
--
infrastructure\migrations\070_alert_admins_of_registrations.sql-29--- ⚠️ AND IT AVOIDS RE-EMITTING THE TWO REGISTRATION FUNCTION BODIES A THIRD
infrastructure\migrations\070_alert_admins_of_registrations.sql-30--- TIME. `CREATE OR REPLACE` requires the whole body; 069 already restated both
infrastructure\migrations\070_alert_admins_of_registrations.sql-31--- in full. A third copy is a third thing to keep in step, and the copy that
infrastructure\migrations\070_alert_admins_of_registrations.sql-32--- silently falls behind is how a function stops meaning what its migration
infrastructure\migrations\070_alert_admins_of_registrations.sql-33--- says.
infrastructure\migrations\070_alert_admins_of_registrations.sql-34---
infrastructure\migrations\070_alert_admins_of_registrations.sql-35--- ── ⚠️ THE ADMINS ARE FOUND BY ROLE, AND THE FUNCTION IS SECURITY DEFINER ──
infrastructure\migrations\070_alert_admins_of_registrations.sql-36---
infrastructure\migrations\070_alert_admins_of_registrations.sql:37:-- `identity.memberships` is under FORCE RLS, and the registration transaction
infrastructure\migrations\070_alert_admins_of_registrations.sql-38--- has no tenant context at all — the registrant does not belong anywhere yet
infrastructure\migrations\070_alert_admins_of_registrations.sql-39--- (that is what is being fixed). An INVOKER-rights trigger would therefore read
infrastructure\migrations\070_alert_admins_of_registrations.sql-40--- ZERO administrators and write ZERO alerts, silently, on every sign-up.
infrastructure\migrations\070_alert_admins_of_registrations.sql-41---
infrastructure\migrations\070_alert_admins_of_registrations.sql-42--- 🔴 SO THIS MUST BE REHEARSED AS `autoworkshop_app`, NOT AS THE LOCAL OWNER.
infrastructure\migrations\070_alert_admins_of_registrations.sql-43--- The local owner is a superuser and bypasses RLS, so a local test of a definer
infrastructure\migrations\070_alert_admins_of_registrations.sql-44--- path proves nothing about Render, where the owner is NOT a superuser and
infrastructure\migrations\070_alert_admins_of_registrations.sql-45--- FORCE RLS binds it. That is a recorded scar in this repository, and the
--
infrastructure\migrations\070_alert_admins_of_registrations.sql-93-
infrastructure\migrations\070_alert_admins_of_registrations.sql-94-    v_kind := CASE NEW.kind WHEN 'supplier' THEN 'parts supplier' ELSE 'workshop' END;
infrastructure\migrations\070_alert_admins_of_registrations.sql-95-
infrastructure\migrations\070_alert_admins_of_registrations.sql-96-    -- Every ACTIVE platform administrator. DISTINCT because one person may hold
infrastructure\migrations\070_alert_admins_of_registrations.sql-97-    -- the role in more than one organisation, and telling them twice about one
infrastructure\migrations\070_alert_admins_of_registrations.sql-98-    -- registration is how an alert becomes noise.
infrastructure\migrations\070_alert_admins_of_registrations.sql-99-    FOR v_admin IN
infrastructure\migrations\070_alert_admins_of_registrations.sql-100-        SELECT DISTINCT m.user_id
infrastructure\migrations\070_alert_admins_of_registrations.sql:101:          FROM identity.memberships m
infrastructure\migrations\070_alert_admins_of_registrations.sql-102-         WHERE m.role_name = 'platform_administrator'
infrastructure\migrations\070_alert_admins_of_registrations.sql-103-           AND m.status = 'active'
infrastructure\migrations\070_alert_admins_of_registrations.sql-104-    LOOP
infrastructure\migrations\070_alert_admins_of_registrations.sql-105-        v_written := v_written + comms.notify_user(
infrastructure\migrations\070_alert_admins_of_registrations.sql-106-            NEW.tenant_id,
infrastructure\migrations\070_alert_admins_of_registrations.sql-107-            NEW.organization_id,
infrastructure\migrations\070_alert_admins_of_registrations.sql-108-            v_admin.user_id,
infrastructure\migrations\070_alert_admins_of_registrations.sql-109-            'organization.registered',
--
infrastructure\migrations\070_alert_admins_of_registrations.sql-142-    RETURN NEW;
infrastructure\migrations\070_alert_admins_of_registrations.sql-143-END;
infrastructure\migrations\070_alert_admins_of_registrations.sql-144-$$;
infrastructure\migrations\070_alert_admins_of_registrations.sql-145-
infrastructure\migrations\070_alert_admins_of_registrations.sql-146-COMMENT ON FUNCTION identity.alert_admins_of_registration() IS
infrastructure\migrations\070_alert_admins_of_registrations.sql-147-'Writes one in-app notification per active platform administrator when a '
infrastructure\migrations\070_alert_admins_of_registrations.sql-148-'workshop or parts supplier registers itself. SECURITY DEFINER because the '
infrastructure\migrations\070_alert_admins_of_registrations.sql-149-'registering transaction has no tenant context, so an invoker-rights read of '
infrastructure\migrations\070_alert_admins_of_registrations.sql:150:'identity.memberships under FORCE RLS would find zero administrators and '
infrastructure\migrations\070_alert_admins_of_registrations.sql-151-'silently alert nobody.';
infrastructure\migrations\070_alert_admins_of_registrations.sql-152-
infrastructure\migrations\070_alert_admins_of_registrations.sql-153-REVOKE ALL ON FUNCTION identity.alert_admins_of_registration() FROM PUBLIC;
infrastructure\migrations\070_alert_admins_of_registrations.sql-154-
infrastructure\migrations\070_alert_admins_of_registrations.sql-155--- AFTER INSERT: the registration row must exist before anything is said about
infrastructure\migrations\070_alert_admins_of_registrations.sql-156--- it, and `NEW.id` is referenced as the notification's resource.
infrastructure\migrations\070_alert_admins_of_registrations.sql-157-DROP TRIGGER IF EXISTS trg_alert_admins_of_registration
infrastructure\migrations\070_alert_admins_of_registrations.sql-158-    ON identity.organization_registrations;
--
infrastructure\migrations\069_organization_registrations.sql-210-
infrastructure\migrations\069_organization_registrations.sql-211-    IF v_user IS NULL THEN
infrastructure\migrations\069_organization_registrations.sql-212-        RAISE EXCEPTION 'no active application user for this identity';
infrastructure\migrations\069_organization_registrations.sql-213-    END IF;
infrastructure\migrations\069_organization_registrations.sql-214-
infrastructure\migrations\069_organization_registrations.sql-215-    PERFORM set_config('app.bootstrap',      'on',          true);
infrastructure\migrations\069_organization_registrations.sql-216-    PERFORM set_config('app.bootstrap_user', v_user::text,  true);
infrastructure\migrations\069_organization_registrations.sql-217-
infrastructure\migrations\069_organization_registrations.sql:218:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure\migrations\069_organization_registrations.sql-219-                WHERE user_id = v_user AND status = 'active') THEN
infrastructure\migrations\069_organization_registrations.sql-220-        PERFORM set_config('app.bootstrap',      '', true);
infrastructure\migrations\069_organization_registrations.sql-221-        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure\migrations\069_organization_registrations.sql-222-        RAISE EXCEPTION 'this account already belongs to an organisation';
infrastructure\migrations\069_organization_registrations.sql-223-    END IF;
infrastructure\migrations\069_organization_registrations.sql-224-
infrastructure\migrations\069_organization_registrations.sql-225-    v_slug := regexp_replace(lower(btrim(p_workshop_name)), '[^a-z0-9]+', '-', 'g');
infrastructure\migrations\069_organization_registrations.sql-226-    v_slug := btrim(v_slug, '-');
--
infrastructure\migrations\069_organization_registrations.sql-240-    INSERT INTO identity.organizations (id, tenant_id, name, org_type, status, created_by)
infrastructure\migrations\069_organization_registrations.sql-241-    VALUES (v_org, v_tenant, btrim(p_workshop_name), 'individual_workshop', 'active', v_user);
infrastructure\migrations\069_organization_registrations.sql-242-
infrastructure\migrations\069_organization_registrations.sql-243-    INSERT INTO identity.branches (id, tenant_id, organization_id, name, status, created_by)
infrastructure\migrations\069_organization_registrations.sql-244-    VALUES (v_branch, v_tenant, v_org,
infrastructure\migrations\069_organization_registrations.sql-245-            COALESCE(NULLIF(btrim(p_branch_name), ''), 'Main branch'),
infrastructure\migrations\069_organization_registrations.sql-246-            'active', v_user);
infrastructure\migrations\069_organization_registrations.sql-247-
infrastructure\migrations\069_organization_registrations.sql:248:    INSERT INTO identity.memberships
infrastructure\migrations\069_organization_registrations.sql-249-        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure\migrations\069_organization_registrations.sql-250-    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'workshop_owner', 'active', v_user);
infrastructure\migrations\069_organization_registrations.sql-251-
infrastructure\migrations\069_organization_registrations.sql-252-    -- ── THE ONLY CHANGE FROM 037 ───────────────────────────────────────────
infrastructure\migrations\069_organization_registrations.sql-253-    -- Queued for verification, inside the SAME transaction that creates the
infrastructure\migrations\069_organization_registrations.sql-254-    -- workshop. A registration written afterwards on a separate connection
infrastructure\migrations\069_organization_registrations.sql-255-    -- could survive a rolled-back sign-up and describe a workshop that does not
infrastructure\migrations\069_organization_registrations.sql-256-    -- exist — or be lost, leaving a workshop nobody is ever asked to verify.
--
infrastructure\migrations\069_organization_registrations.sql-299-
infrastructure\migrations\069_organization_registrations.sql-300-    IF v_user IS NULL THEN
infrastructure\migrations\069_organization_registrations.sql-301-        RAISE EXCEPTION 'no active application user for this identity';
infrastructure\migrations\069_organization_registrations.sql-302-    END IF;
infrastructure\migrations\069_organization_registrations.sql-303-
infrastructure\migrations\069_organization_registrations.sql-304-    PERFORM set_config('app.bootstrap',      'on',         true);
infrastructure\migrations\069_organization_registrations.sql-305-    PERFORM set_config('app.bootstrap_user', v_user::text, true);
infrastructure\migrations\069_organization_registrations.sql-306-
infrastructure\migrations\069_organization_registrations.sql:307:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure\migrations\069_organization_registrations.sql-308-                WHERE user_id = v_user AND status = 'active') THEN
infrastructure\migrations\069_organization_registrations.sql-309-        PERFORM set_config('app.bootstrap',      '', true);
infrastructure\migrations\069_organization_registrations.sql-310-        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure\migrations\069_organization_registrations.sql-311-        RAISE EXCEPTION 'this account already belongs to an organisation. Sign in with a different account to register a supplier, or ask a platform administrator to add you to an existing supplier.';
infrastructure\migrations\069_organization_registrations.sql-312-    END IF;
infrastructure\migrations\069_organization_registrations.sql-313-
infrastructure\migrations\069_organization_registrations.sql-314-    v_slug := regexp_replace(lower(btrim(p_supplier_name)), '[^a-z0-9]+', '-', 'g');
infrastructure\migrations\069_organization_registrations.sql-315-    v_slug := btrim(v_slug, '-');
--
infrastructure\migrations\069_organization_registrations.sql-329-    INSERT INTO identity.organizations (id, tenant_id, name, org_type, status, created_by)
infrastructure\migrations\069_organization_registrations.sql-330-    VALUES (v_org, v_tenant, btrim(p_supplier_name), 'parts_supplier', 'active', v_user);
infrastructure\migrations\069_organization_registrations.sql-331-
infrastructure\migrations\069_organization_registrations.sql-332-    INSERT INTO identity.branches (id, tenant_id, organization_id, name, status, created_by)
infrastructure\migrations\069_organization_registrations.sql-333-    VALUES (v_branch, v_tenant, v_org,
infrastructure\migrations\069_organization_registrations.sql-334-            COALESCE(NULLIF(btrim(p_location_name), ''), 'Main location'),
infrastructure\migrations\069_organization_registrations.sql-335-            'active', v_user);
infrastructure\migrations\069_organization_registrations.sql-336-
infrastructure\migrations\069_organization_registrations.sql:337:    INSERT INTO identity.memberships
infrastructure\migrations\069_organization_registrations.sql-338-        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure\migrations\069_organization_registrations.sql-339-    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'supplier_owner', 'active', v_user);
infrastructure\migrations\069_organization_registrations.sql-340-
infrastructure\migrations\069_organization_registrations.sql-341-    -- ── THE ONLY CHANGE FROM 068 ───────────────────────────────────────────
infrastructure\migrations\069_organization_registrations.sql-342-    INSERT INTO identity.organization_registrations
infrastructure\migrations\069_organization_registrations.sql-343-        (tenant_id, organization_id, kind, status, submitted_by)
infrastructure\migrations\069_organization_registrations.sql-344-    VALUES (v_tenant, v_org, 'supplier', 'pending', v_user);
infrastructure\migrations\069_organization_registrations.sql-345-
--
infrastructure\migrations\068_supplier_registration.sql-5---
infrastructure\migrations\068_supplier_registration.sql-6--- Owner, 2026-08-09: *"create another button called register as parts supplier,
infrastructure\migrations\068_supplier_registration.sql-7--- when click the potential supplier creates account and login to the supplier
infrastructure\migrations\068_supplier_registration.sql-8--- functionalities only."*
infrastructure\migrations\068_supplier_registration.sql-9---
infrastructure\migrations\068_supplier_registration.sql-10--- Before adding that button, the same question that caught the customer role on
infrastructure\migrations\068_supplier_registration.sql-11--- 2026-08-08 was asked of this one: WHICH PRODUCTION CODE PATH WRITES A
infrastructure\migrations\068_supplier_registration.sql-12--- `supplier_owner` MEMBERSHIP? The answer, from a repo-wide grep, is NONE.
infrastructure\migrations\068_supplier_registration.sql:13:-- `identity.memberships` has exactly two writers:
infrastructure\migrations\068_supplier_registration.sql-14---
infrastructure\migrations\068_supplier_registration.sql-15---   · `identity.register_workshop` — grants `workshop_owner`, always;
infrastructure\migrations\068_supplier_registration.sql-16---   · `MembershipService.grant()`  — admin-only, and requires an EXISTING
infrastructure\migrations\068_supplier_registration.sql-17---     organisation the admin already administers.
infrastructure\migrations\068_supplier_registration.sql-18---
infrastructure\migrations\068_supplier_registration.sql-19--- `supplier_owner` appears in `permission-matrix.ts`, in `ROLE_PRECEDENCE`, in
infrastructure\migrations\068_supplier_registration.sql-20--- `branch.service.ts`, in `organization.service.ts`, in the supplier navigation
infrastructure\migrations\068_supplier_registration.sql-21--- tree and in the `supplier-web` app — and nothing could ever create one. Every
--
infrastructure\migrations\068_supplier_registration.sql-132-    -- SUCCESS path leaves the caller's transaction open.
infrastructure\migrations\068_supplier_registration.sql-133-    PERFORM set_config('app.bootstrap',      'on',         true);
infrastructure\migrations\068_supplier_registration.sql-134-    PERFORM set_config('app.bootstrap_user', v_user::text, true);
infrastructure\migrations\068_supplier_registration.sql-135-
infrastructure\migrations\068_supplier_registration.sql-136-    -- CONSTRAINT 4 — one organisation per person. AFTER the flag is set: under
infrastructure\migrations\068_supplier_registration.sql-137-    -- FORCE RLS with no tenant context this read returns zero rows for
infrastructure\migrations\068_supplier_registration.sql-138-    -- everybody, so placing it earlier would make it a check that cannot fire.
infrastructure\migrations\068_supplier_registration.sql-139-    -- That is precisely the bug migration 037 fixed in `register_workshop`.
infrastructure\migrations\068_supplier_registration.sql:140:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure\migrations\068_supplier_registration.sql-141-                WHERE user_id = v_user AND status = 'active') THEN
infrastructure\migrations\068_supplier_registration.sql-142-        PERFORM set_config('app.bootstrap',      '', true);
infrastructure\migrations\068_supplier_registration.sql-143-        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure\migrations\068_supplier_registration.sql-144-        -- ⚠️ THE MESSAGE NAMES A REACHABLE ALTERNATIVE. "Every refusal must name
infrastructure\migrations\068_supplier_registration.sql-145-        -- a reachable alternative" is this repository's most expensive
infrastructure\migrations\068_supplier_registration.sql-146-        -- recurring defect — a rule with no way past it is a wall, and the
infrastructure\migrations\068_supplier_registration.sql-147-        -- person in front of it files a bug instead of acting.
infrastructure\migrations\068_supplier_registration.sql-148-        RAISE EXCEPTION 'this account already belongs to an organisation. Sign in with a different account to register a supplier, or ask a platform administrator to add you to an existing supplier.';
--
infrastructure\migrations\068_supplier_registration.sql-180-            COALESCE(NULLIF(btrim(p_location_name), ''), 'Main location'),
infrastructure\migrations\068_supplier_registration.sql-181-            'active', v_user);
infrastructure\migrations\068_supplier_registration.sql-182-
infrastructure\migrations\068_supplier_registration.sql-183-    -- CONSTRAINT 2 — the role is a LITERAL, spelled exactly as
infrastructure\migrations\068_supplier_registration.sql-184-    -- `permission-matrix.ts`, `ROLE_PRECEDENCE` and the supplier navigation
infrastructure\migrations\068_supplier_registration.sql-185-    -- tree expect. A merely plausible role name resolves to no tree and no
infrastructure\migrations\068_supplier_registration.sql-186-    -- permissions, and the person lands in an organisation they can see nothing
infrastructure\migrations\068_supplier_registration.sql-187-    -- in — the `quality_controller` defect, which failed CLOSED for months.
infrastructure\migrations\068_supplier_registration.sql:188:    INSERT INTO identity.memberships
infrastructure\migrations\068_supplier_registration.sql-189-        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure\migrations\068_supplier_registration.sql-190-    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'supplier_owner', 'active', v_user);
infrastructure\migrations\068_supplier_registration.sql-191-
infrastructure\migrations\068_supplier_registration.sql-192-    -- ── and the door closes ────────────────────────────────────────────────
infrastructure\migrations\068_supplier_registration.sql-193-    PERFORM set_config('app.bootstrap',      '', true);
infrastructure\migrations\068_supplier_registration.sql-194-    PERFORM set_config('app.bootstrap_user', '', true);
infrastructure\migrations\068_supplier_registration.sql-195-
infrastructure\migrations\068_supplier_registration.sql-196-    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
--
infrastructure\migrations\063_one_customer_record_per_user_per_workshop.sql-1--- 063 — one customer record per person per workshop
infrastructure\migrations\063_one_customer_record_per_user_per_workshop.sql-2---
infrastructure\migrations\063_one_customer_record_per_user_per_workshop.sql-3--- ── WHY THIS IS NEEDED NOW ─────────────────────────────────────────────────
infrastructure\migrations\063_one_customer_record_per_user_per_workshop.sql-4---
infrastructure\migrations\063_one_customer_record_per_user_per_workshop.sql-5--- Migration 061 made customer enrolment self-service, and the funnel calls it
infrastructure\migrations\063_one_customer_record_per_user_per_workshop.sql-6--- on EVERY visit to a workshop's Request for Service page. The membership half
infrastructure\migrations\063_one_customer_record_per_user_per_workshop.sql:7:-- is already race-safe: `identity.memberships` is unique on
infrastructure\migrations\063_one_customer_record_per_user_per_workshop.sql-8--- (organization_id, user_id, role_name), so a double-submitted form hits
infrastructure\migrations\063_one_customer_record_per_user_per_workshop.sql-9--- `ON CONFLICT DO NOTHING` and the loser reads the winner's row.
infrastructure\migrations\063_one_customer_record_per_user_per_workshop.sql-10---
infrastructure\migrations\063_one_customer_record_per_user_per_workshop.sql-11--- The `core.customers` half had no such constraint. `CustomerEnrolmentService`
infrastructure\migrations\063_one_customer_record_per_user_per_workshop.sql-12--- creates the customer record after the membership, and a check-then-insert
infrastructure\migrations\063_one_customer_record_per_user_per_workshop.sql-13--- under READ COMMITTED lets two concurrent requests BOTH see "no row" and BOTH
infrastructure\migrations\063_one_customer_record_per_user_per_workshop.sql-14--- insert. The result is two customer records for one person at one workshop —
infrastructure\migrations\063_one_customer_record_per_user_per_workshop.sql-15--- and because every customer-scoped read resolves through
--
infrastructure\migrations\061_customer_enrolment.sql-1--- 061 — a person who signs up can become a CUSTOMER of a workshop
infrastructure\migrations\061_customer_enrolment.sql-2---
infrastructure\migrations\061_customer_enrolment.sql-3--- ══════════════════════════════════════════════════════════════════════════
infrastructure\migrations\061_customer_enrolment.sql-4--- 🔴 THE DEFECT THIS CLOSES: THE CUSTOMER ROLE COULD NOT EXIST ON PRODUCTION.
infrastructure\migrations\061_customer_enrolment.sql-5---
infrastructure\migrations\061_customer_enrolment.sql-6--- Measured 2026-08-08, not argued. Two facts, and their intersection is the
infrastructure\migrations\061_customer_enrolment.sql-7--- whole bug:
infrastructure\migrations\061_customer_enrolment.sql-8---
infrastructure\migrations\061_customer_enrolment.sql:9:--   1. `identity.memberships` is written by exactly TWO code paths in the
infrastructure\migrations\061_customer_enrolment.sql-10---      entire product — `identity.register_workshop` (036/037), which grants
infrastructure\migrations\061_customer_enrolment.sql-11---      `workshop_owner`, and `MembershipService.grant()`, which requires an
infrastructure\migrations\061_customer_enrolment.sql-12---      administrator who is ALREADY inside an organisation. Neither can produce
infrastructure\migrations\061_customer_enrolment.sql-13---      a `customer`.
infrastructure\migrations\061_customer_enrolment.sql-14---   2. Every customer-facing route — `POST /service-requests`, `/vehicles`,
infrastructure\migrations\061_customer_enrolment.sql-15---      `/job-cards` — sits behind `TenantGuard`, which calls
infrastructure\migrations\061_customer_enrolment.sql-16---      `resolveTenantContext` and throws `user holds no active membership`
infrastructure\migrations\061_customer_enrolment.sql-17---      when there is none.
--
infrastructure\migrations\061_customer_enrolment.sql-59---   3. IT CANNOT TOUCH AN ACCOUNT THAT ALREADY HAS A ROLE THERE. If the caller
infrastructure\migrations\061_customer_enrolment.sql-60---      already holds ANY active membership in that organisation, the function
infrastructure\migrations\061_customer_enrolment.sql-61---      either returns the existing customer membership unchanged (idempotent)
infrastructure\migrations\061_customer_enrolment.sql-62---      or refuses. It can never stack `customer` onto a technician, and it can
infrastructure\migrations\061_customer_enrolment.sql-63---      never be used to alter a staff account.
infrastructure\migrations\061_customer_enrolment.sql-64---
infrastructure\migrations\061_customer_enrolment.sql-65---   4. IT GRANTS ONLY TO ITSELF. The RLS door it opens is migration 037's
infrastructure\migrations\061_customer_enrolment.sql-66---      EXISTING `registration_bootstrap_insert` policy on
infrastructure\migrations\061_customer_enrolment.sql:67:--      `identity.memberships`, whose WITH CHECK already requires BOTH
infrastructure\migrations\061_customer_enrolment.sql-68---      `created_by` AND `user_id` to equal `app.bootstrap_user`. There is no
infrastructure\migrations\061_customer_enrolment.sql-69---      shape of this call that writes a row for another person.
infrastructure\migrations\061_customer_enrolment.sql-70---
infrastructure\migrations\061_customer_enrolment.sql-71---      ⚠️ BE EXACT ABOUT WHAT "ITSELF" MEANS HERE. `p_subject` IS a function
infrastructure\migrations\061_customer_enrolment.sql-72---      parameter — an earlier draft of this header said the caller is "resolved
infrastructure\migrations\061_customer_enrolment.sql-73---      from the Keycloak SUBJECT, never from a parameter", which is a sentence
infrastructure\migrations\061_customer_enrolment.sql-74---      that reads as a guarantee and is not one (Codex, 2026-08-08). The
infrastructure\migrations\061_customer_enrolment.sql-75---      accurate statement is:
--
infrastructure\migrations\061_customer_enrolment.sql-278-        PERFORM set_config('app.bootstrap_org',  '', true);
infrastructure\migrations\061_customer_enrolment.sql-279-        -- Worded for the person reading it. "Not published" is our vocabulary,
infrastructure\migrations\061_customer_enrolment.sql-280-        -- not theirs, and §70 forbids leaving a user unsure what happened.
infrastructure\migrations\061_customer_enrolment.sql-281-        RAISE EXCEPTION 'that workshop is not accepting customers online';
infrastructure\migrations\061_customer_enrolment.sql-282-    END IF;
infrastructure\migrations\061_customer_enrolment.sql-283-
infrastructure\migrations\061_customer_enrolment.sql-284-    -- ⚠️ CONSTRAINT 3 — never touch an account that already has a role here.
infrastructure\migrations\061_customer_enrolment.sql-285-    -- Readable because 037's `registration_bootstrap_select` on
infrastructure\migrations\061_customer_enrolment.sql:286:    -- `identity.memberships` admits `user_id = app.bootstrap_user`.
infrastructure\migrations\061_customer_enrolment.sql-287-    SELECT m.id, m.role_name, m.tenant_id, m.branch_id
infrastructure\migrations\061_customer_enrolment.sql-288-      INTO v_existing
infrastructure\migrations\061_customer_enrolment.sql:289:      FROM identity.memberships m
infrastructure\migrations\061_customer_enrolment.sql-290-     WHERE m.user_id = v_user
infrastructure\migrations\061_customer_enrolment.sql-291-       AND m.organization_id = p_organization_id
infrastructure\migrations\061_customer_enrolment.sql-292-       AND m.status = 'active'
infrastructure\migrations\061_customer_enrolment.sql-293-     LIMIT 1;
infrastructure\migrations\061_customer_enrolment.sql-294-
infrastructure\migrations\061_customer_enrolment.sql-295-    IF v_existing.id IS NOT NULL THEN
infrastructure\migrations\061_customer_enrolment.sql-296-        PERFORM set_config('app.bootstrap',      '', true);
infrastructure\migrations\061_customer_enrolment.sql-297-        PERFORM set_config('app.bootstrap_user', '', true);
--
infrastructure\migrations\061_customer_enrolment.sql-340-     LIMIT 1;
infrastructure\migrations\061_customer_enrolment.sql-341-
infrastructure\migrations\061_customer_enrolment.sql-342-    v_member := gen_random_uuid();
infrastructure\migrations\061_customer_enrolment.sql-343-
infrastructure\migrations\061_customer_enrolment.sql-344-    -- ⚠️ THE ROLE IS A LITERAL. See constraint 1 in the header.
infrastructure\migrations\061_customer_enrolment.sql-345-    -- `created_by = v_user` is not decoration: 037's bootstrap policy WITH
infrastructure\migrations\061_customer_enrolment.sql-346-    -- CHECK requires created_by AND user_id to BOTH equal app.bootstrap_user,
infrastructure\migrations\061_customer_enrolment.sql-347-    -- so a row attributed to anyone else is rejected by the database.
infrastructure\migrations\061_customer_enrolment.sql:348:    INSERT INTO identity.memberships
infrastructure\migrations\061_customer_enrolment.sql-349-        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure\migrations\061_customer_enrolment.sql-350-    VALUES (v_member, v_tenant, p_organization_id, v_branch, v_user, 'customer', 'active', v_user)
infrastructure\migrations\061_customer_enrolment.sql-351-    ON CONFLICT (organization_id, user_id, role_name) DO NOTHING
infrastructure\migrations\061_customer_enrolment.sql-352-    RETURNING id INTO v_member;
infrastructure\migrations\061_customer_enrolment.sql-353-
infrastructure\migrations\061_customer_enrolment.sql-354-    IF v_member IS NULL THEN
infrastructure\migrations\061_customer_enrolment.sql-355-        -- Lost the race against a concurrent identical call — a
infrastructure\migrations\061_customer_enrolment.sql-356-        -- double-submitted form. The winner's row is the answer.
infrastructure\migrations\061_customer_enrolment.sql-357-        SELECT m.id, m.tenant_id, m.branch_id
infrastructure\migrations\061_customer_enrolment.sql-358-          INTO v_existing
infrastructure\migrations\061_customer_enrolment.sql:359:          FROM identity.memberships m
infrastructure\migrations\061_customer_enrolment.sql-360-         WHERE m.user_id = v_user
infrastructure\migrations\061_customer_enrolment.sql-361-           AND m.organization_id = p_organization_id
infrastructure\migrations\061_customer_enrolment.sql-362-           AND m.role_name = 'customer';
infrastructure\migrations\061_customer_enrolment.sql-363-
infrastructure\migrations\061_customer_enrolment.sql-364-        PERFORM set_config('app.bootstrap',      '', true);
infrastructure\migrations\061_customer_enrolment.sql-365-        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure\migrations\061_customer_enrolment.sql-366-        PERFORM set_config('app.bootstrap_org',  '', true);
infrastructure\migrations\061_customer_enrolment.sql-367-
--
infrastructure\migrations\060_notifications.sql-340--- ══════════════════════════════════════════════════════════════════════════
infrastructure\migrations\060_notifications.sql-341---
infrastructure\migrations\060_notifications.sql-342--- 🔴 WHY THE RECIPIENTS ARE RESOLVED IN HERE AND NOT IN THE APPLICATION.
infrastructure\migrations\060_notifications.sql-343---
infrastructure\migrations\060_notifications.sql-344--- The event that most needs this is a CUSTOMER filing a service request, and
infrastructure\migrations\060_notifications.sql-345--- the people who must hear about it are the workshop's STAFF. Resolving them in
infrastructure\migrations\060_notifications.sql-346--- the API would mean running that query in the customer's own session, where:
infrastructure\migrations\060_notifications.sql-347---
infrastructure\migrations\060_notifications.sql:348:--   1. IT RETURNS NOTHING. `identity.memberships` restricts a caller to their
infrastructure\migrations\060_notifications.sql-349---      own rows (migration 039), so the customer would resolve zero recipients
infrastructure\migrations\060_notifications.sql-350---      and the workshop would never be told — a complete feature with no
infrastructure\migrations\060_notifications.sql-351---      reachable caller, which this repository has recorded four times.
infrastructure\migrations\060_notifications.sql-352---   2. IT WOULD BE WORSE IF IT WORKED. Loosening that policy to make it work
infrastructure\migrations\060_notifications.sql-353---      would hand every customer the workshop's staff list AND THEIR EMAIL
infrastructure\migrations\060_notifications.sql-354---      ADDRESSES — the same class of leak as the call participants defect,
infrastructure\migrations\060_notifications.sql-355---      where a name and an email were rendered back across a boundary.
infrastructure\migrations\060_notifications.sql-356---
--
infrastructure\migrations\060_notifications.sql-377-AS $$
infrastructure\migrations\060_notifications.sql-378-DECLARE
infrastructure\migrations\060_notifications.sql-379-    r record;
infrastructure\migrations\060_notifications.sql-380-    n integer := 0;
infrastructure\migrations\060_notifications.sql-381-    v_id uuid;
infrastructure\migrations\060_notifications.sql-382-BEGIN
infrastructure\migrations\060_notifications.sql-383-    FOR r IN
infrastructure\migrations\060_notifications.sql-384-        SELECT DISTINCT u.id, u.email
infrastructure\migrations\060_notifications.sql:385:          FROM identity.memberships m
infrastructure\migrations\060_notifications.sql-386-          JOIN identity.users u ON u.id = m.user_id
infrastructure\migrations\060_notifications.sql-387-         WHERE m.organization_id = p_organization_id
infrastructure\migrations\060_notifications.sql-388-           -- 'active' is a STATUS, not a boolean. There is no `is_active`
infrastructure\migrations\060_notifications.sql-389-           -- column on this table.
infrastructure\migrations\060_notifications.sql-390-           AND m.status = 'active'
infrastructure\migrations\060_notifications.sql-391-           AND u.status = 'active'
infrastructure\migrations\060_notifications.sql-392-           AND m.role_name IN ('reception_staff', 'workshop_manager', 'workshop_owner')
infrastructure\migrations\060_notifications.sql-393-    LOOP
--
infrastructure\migrations\045_workshop_settings.sql-140--- proof that limits are applied, which is the "comment claiming a guard that
infrastructure\migrations\045_workshop_settings.sql-141--- does not exist" defect recorded four times in this repository.
infrastructure\migrations\045_workshop_settings.sql-142-
infrastructure\migrations\045_workshop_settings.sql-143-CREATE TABLE IF NOT EXISTS core.approval_limits (
infrastructure\migrations\045_workshop_settings.sql-144-    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
infrastructure\migrations\045_workshop_settings.sql-145-    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
infrastructure\migrations\045_workshop_settings.sql-146-    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
infrastructure\migrations\045_workshop_settings.sql-147-
infrastructure\migrations\045_workshop_settings.sql:148:    -- The role NAME as `identity.memberships` spells it. Not a FK: roles are a
infrastructure\migrations\045_workshop_settings.sql-149-    -- vocabulary in this codebase, not a table, and inventing one here would
infrastructure\migrations\045_workshop_settings.sql-150-    -- create a second place where a role can be defined.
infrastructure\migrations\045_workshop_settings.sql-151-    role_name        TEXT NOT NULL CHECK (length(btrim(role_name)) > 0),
infrastructure\migrations\045_workshop_settings.sql-152-
infrastructure\migrations\045_workshop_settings.sql-153-    -- What this role may approve without escalating. 0 is meaningful: "may
infrastructure\migrations\045_workshop_settings.sql-154-    -- approve nothing", which is not the same as having no row.
infrastructure\migrations\045_workshop_settings.sql-155-    max_amount       numeric(14,2) NOT NULL CHECK (max_amount >= 0),
infrastructure\migrations\045_workshop_settings.sql-156-    currency         TEXT NOT NULL DEFAULT 'GHS' CHECK (currency ~ '^[A-Z]{3}$'),
--
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-2---
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-3--- ══════════════════════════════════════════════════════════════════════════
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-4--- THE DEFECT, MEASURED ON PRODUCTION 2026-08-05
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-5--- ══════════════════════════════════════════════════════════════════════════
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-6---
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-7--- With 037 + 038 applied, registration WORKS: a workshop was created through
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-8--- the real form, and a second submit is correctly refused with "this account
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-9--- already belongs to an organisation". That refusal is a SELECT on
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql:10:-- identity.memberships inside register_workshop, so the row demonstrably
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-11--- exists.
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-12---
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-13--- And yet a fresh session for the same account showed the onboarding form, an
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-14--- org chip reading "No workshop yet", and zero KPI tiles. The application did
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-15--- not believe the workshop it had just created existed.
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-16---
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-17--- `Diagnose identity RLS` (run 30963160097) measured why:
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-18---
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-19---   connected role            autoworkshop | superuser=f | bypassrls=f
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-20---   identity.users            rls=f  forced=f          <- NOT the problem
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql:21:--   identity.memberships      rls=t  forced=t
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-22---   policies on memberships   tenant_isolation      ALL     tenant_id = current_tenant_id()
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-23---                             registration_bootstrap_insert INSERT
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-24---                             registration_bootstrap_select SELECT  in_registration_bootstrap()
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-25---
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql:26:--   SELECT count(*) FROM identity.memberships_for_subject(<subject>)  ->  1
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-27---
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-28--- One row — and its membership columns are NULL.
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-29---
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-30--- ── WHY, EXACTLY ──────────────────────────────────────────────────────────
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-31---
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-32--- `memberships_for_subject` is SECURITY DEFINER, and everyone reading it
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-33--- assumed that made it exempt. It does not: its owner is `autoworkshop`, which
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-34--- on Render is NOT a superuser (`rolsuper=f`, `rolbypassrls=f`), and
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql:35:-- identity.memberships is FORCE ROW LEVEL SECURITY — which binds the table
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-36--- OWNER as well. So inside the definer, every policy still applies:
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-37---
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-38---   tenant_isolation              needs a tenant context, and this query is
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-39---                                 what ESTABLISHES the tenant context
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-40---   registration_bootstrap_select needs app.bootstrap, only set inside
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-41---                                 register_workshop
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-42---
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-43--- Neither holds during a normal `/me`, so every membership row is filtered out.
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-44---
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-45--- 🔴 AND THE FUNCTION USES A **LEFT** JOIN:
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-46---
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-47---       FROM identity.users u
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql:48:--       LEFT JOIN identity.memberships m ON m.user_id = u.id
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-49---
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-50--- so the user row survives with NULL membership columns, and
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-51--- `membership.repository.ts` then does exactly what it should with that:
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-52---
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-53---       rows.filter((r) => r.tenant_id !== null)   ->  []
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-54---       hasWorkshop: active.length > 0             ->  false
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-55---
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-56--- ⚠️ THE LEFT JOIN TURNS "REFUSED BY RLS" INTO "HAS NO MEMBERSHIP", and those
--
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-72--- transaction-local door that ONLY this function can open, pinned to the one
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-73--- subject being resolved.
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-74---
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-75--- 1. `identity.in_membership_lookup()` — true when the flag is set AND the
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-76---    effective user is the owner of `memberships_for_subject`. NOT security
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-77---    definer, for the reason 038 documents at length: as a definer it would
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-78---    always see its own owner and return true for everybody, restoring the hole.
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-79---
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql:80:-- 2. A SELECT policy on identity.memberships admitting only rows whose
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-81---    `user_id` matches the subject currently being looked up.
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-82---
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-83--- 3. `memberships_for_subject` becomes plpgsql so it can open the door, read,
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-84---    and CLOSE IT AGAIN before returning. A `LANGUAGE sql` function cannot
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-85---    `SET LOCAL`, which is why it could not do this before.
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-86---
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-87--- ⚠️ WHY NOT SIMPLY `ALTER ROLE autoworkshop BYPASSRLS`? Because that would
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-88--- exempt the owner from every policy on every table, which is precisely the
--
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-106--- dropped function takes its privileges with it — forgetting that would leave
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-107--- `autoworkshop_app` unable to execute the one function every request needs, and
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-108--- the failure would look like a broken login rather than a missing grant.
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-109---
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-110--- Ordered before `in_membership_lookup`, which names this function via
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-111--- `::regprocedure`: build the thing that is referred to before the thing that
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-112--- refers to it.
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-113-
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql:114:DROP FUNCTION IF EXISTS identity.memberships_for_subject(TEXT);
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-115-
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-116--- ── 1. the lookup, with display_name and the door it opens ─────────────────
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-117-
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql:118:CREATE OR REPLACE FUNCTION identity.memberships_for_subject(p_subject TEXT)
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-119-RETURNS TABLE (
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-120-    user_id         uuid,
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-121-    tenant_id       uuid,
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-122-    organization_id uuid,
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-123-    branch_id       uuid,
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-124-    role_name       TEXT,
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-125-    status          TEXT,
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-126-    -- ⚠️ NEW COLUMN, AND IT REMOVES A JOIN FROM THE CALLER.
--
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-155-        SELECT u.id,
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-156-               m.tenant_id,
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-157-               m.organization_id,
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-158-               m.branch_id,
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-159-               m.role_name,
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-160-               m.status,
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-161-               u.display_name
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-162-          FROM identity.users u
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql:163:     LEFT JOIN identity.memberships m ON m.user_id = u.id
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-164-         WHERE u.keycloak_subject = p_subject
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-165-           AND u.status = 'active';
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-166-
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-167-    -- ⚠️ SHUT BEFORE RETURNING, exactly as register_workshop does. The caller
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-168-    -- continues in the same transaction, and a door left open is one the next
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-169-    -- statement can walk through.
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-170-    PERFORM set_config('app.membership_lookup', '', true);
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-171-END;
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-172-$$;
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-173-
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql:174:COMMENT ON FUNCTION identity.memberships_for_subject(TEXT) IS
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-175-'Bootstrap lookup: resolves a validated Keycloak subject to its own memberships. '
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-176-'SECURITY DEFINER is NOT sufficient on its own -- the owner is not a superuser in '
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql:177:'production and identity.memberships is FORCE RLS, which binds owners too. It '
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-178-'therefore opens a transaction-local door (039) pinned to this one subject, reads, '
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-179-'and closes it. Accepts only a subject taken from a signature-validated token.';
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-180-
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql:181:REVOKE ALL ON FUNCTION identity.memberships_for_subject(TEXT) FROM PUBLIC;
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql:182:GRANT EXECUTE ON FUNCTION identity.memberships_for_subject(TEXT) TO autoworkshop_app;
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-183-
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-184--- ── 2. the gate ─────────────────────────────────────────────────────────────
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-185-
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-186-CREATE OR REPLACE FUNCTION identity.in_membership_lookup()
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-187-RETURNS boolean
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-188-LANGUAGE sql
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-189-STABLE
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-190--- NOT SECURITY DEFINER, deliberately — see 038. It must observe the CALLER's
--
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-193-SET search_path = identity, pg_catalog, pg_temp
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-194-AS $$
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-195-  SELECT current_setting('app.membership_lookup', true) IS NOT NULL
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-196-     AND current_setting('app.membership_lookup', true) <> ''
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-197-     AND current_user = (
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-198-           SELECT r.rolname
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-199-             FROM pg_proc p
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-200-             JOIN pg_roles r ON r.oid = p.proowner
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql:201:            WHERE p.oid = 'identity.memberships_for_subject(text)'::regprocedure
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-202-         );
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-203-$$;
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-204-
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-205-COMMENT ON FUNCTION identity.in_membership_lookup() IS
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql:206:'TRUE only inside identity.memberships_for_subject: the app.membership_lookup '
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-207-'flag is set AND the effective user is that function''s owner. set_config is not '
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-208-'privileged, so the flag alone is settable by any caller -- the owner check is '
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-209-'the half that cannot be forged from an application connection (lesson of 038).';
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-210-
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-211-REVOKE ALL ON FUNCTION identity.in_membership_lookup() FROM PUBLIC;
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-212-GRANT EXECUTE ON FUNCTION identity.in_membership_lookup() TO autoworkshop_app;
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-213-
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-214--- ── 3. the policy ───────────────────────────────────────────────────────────
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-215---
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-216--- SELECT only. It grants no INSERT, UPDATE or DELETE, and it cannot reach a row
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-217--- belonging to anybody other than the subject being resolved: `user_id` is
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-218--- pinned to the flag, and the flag holds a subject taken from a
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-219--- signature-validated token.
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-220-
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql:221:DROP POLICY IF EXISTS membership_lookup_select ON identity.memberships;
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql:222:CREATE POLICY membership_lookup_select ON identity.memberships
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-223-    FOR SELECT
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-224-    USING (
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-225-        identity.in_membership_lookup()
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-226-        AND user_id = (
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-227-              SELECT u.id
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-228-                FROM identity.users u
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-229-               WHERE u.keycloak_subject = current_setting('app.membership_lookup', true)
infrastructure\migrations\039_membership_lookup_can_read_own_rows.sql-230-            )
--
infrastructure\migrations\038_bootstrap_door_requires_definer.sql-103-DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.branches;
infrastructure\migrations\038_bootstrap_door_requires_definer.sql-104-CREATE POLICY registration_bootstrap_insert ON identity.branches
infrastructure\migrations\038_bootstrap_door_requires_definer.sql-105-    FOR INSERT
infrastructure\migrations\038_bootstrap_door_requires_definer.sql-106-    WITH CHECK (
infrastructure\migrations\038_bootstrap_door_requires_definer.sql-107-        identity.in_registration_bootstrap()
infrastructure\migrations\038_bootstrap_door_requires_definer.sql-108-        AND created_by::text = current_setting('app.bootstrap_user', true)
infrastructure\migrations\038_bootstrap_door_requires_definer.sql-109-    );
infrastructure\migrations\038_bootstrap_door_requires_definer.sql-110-
infrastructure\migrations\038_bootstrap_door_requires_definer.sql:111:DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.memberships;
infrastructure\migrations\038_bootstrap_door_requires_definer.sql:112:CREATE POLICY registration_bootstrap_insert ON identity.memberships
infrastructure\migrations\038_bootstrap_door_requires_definer.sql-113-    FOR INSERT
infrastructure\migrations\038_bootstrap_door_requires_definer.sql-114-    WITH CHECK (
infrastructure\migrations\038_bootstrap_door_requires_definer.sql-115-        identity.in_registration_bootstrap()
infrastructure\migrations\038_bootstrap_door_requires_definer.sql-116-        AND created_by::text = current_setting('app.bootstrap_user', true)
infrastructure\migrations\038_bootstrap_door_requires_definer.sql-117-        AND user_id::text   = current_setting('app.bootstrap_user', true)
infrastructure\migrations\038_bootstrap_door_requires_definer.sql-118-    );
infrastructure\migrations\038_bootstrap_door_requires_definer.sql-119-
infrastructure\migrations\038_bootstrap_door_requires_definer.sql:120:DROP POLICY IF EXISTS registration_bootstrap_select ON identity.memberships;
infrastructure\migrations\038_bootstrap_door_requires_definer.sql:121:CREATE POLICY registration_bootstrap_select ON identity.memberships
infrastructure\migrations\038_bootstrap_door_requires_definer.sql-122-    FOR SELECT
infrastructure\migrations\038_bootstrap_door_requires_definer.sql-123-    USING (
infrastructure\migrations\038_bootstrap_door_requires_definer.sql-124-        identity.in_registration_bootstrap()
infrastructure\migrations\038_bootstrap_door_requires_definer.sql-125-        AND user_id::text = current_setting('app.bootstrap_user', true)
infrastructure\migrations\038_bootstrap_door_requires_definer.sql-126-    );
infrastructure\migrations\038_bootstrap_door_requires_definer.sql-127-
infrastructure\migrations\038_bootstrap_door_requires_definer.sql-128-COMMENT ON POLICY registration_bootstrap_insert ON identity.tenants IS
infrastructure\migrations\038_bootstrap_door_requires_definer.sql-129-'Sign-up only. Admits an INSERT while identity.register_workshop holds '
--
infrastructure\migrations\037_registration_rls_bootstrap.sql-15--- The function is byte-identical in both places. **The ROLE is not.** This is
infrastructure\migrations\037_registration_rls_bootstrap.sql-16--- why anything touching RLS is rehearsed ON LIVE, as the app role, and never
infrastructure\migrations\037_registration_rls_bootstrap.sql-17--- believed on the strength of a local pass.
infrastructure\migrations\037_registration_rls_bootstrap.sql-18---
infrastructure\migrations\037_registration_rls_bootstrap.sql-19--- ── THE SECOND DEFECT, FOUND WHILE FIXING THE FIRST ─────────────────────────
infrastructure\migrations\037_registration_rls_bootstrap.sql-20---
infrastructure\migrations\037_registration_rls_bootstrap.sql-21--- 🔴 THE DUPLICATE-REGISTRATION GUARD HAS NEVER RUN IN PRODUCTION EITHER.
infrastructure\migrations\037_registration_rls_bootstrap.sql-22---
infrastructure\migrations\037_registration_rls_bootstrap.sql:23:--     IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure\migrations\037_registration_rls_bootstrap.sql-24---                 WHERE user_id = v_user AND status = 'active') THEN
infrastructure\migrations\037_registration_rls_bootstrap.sql-25---         RAISE EXCEPTION 'this account already belongs to an organisation';
infrastructure\migrations\037_registration_rls_bootstrap.sql-26---     END IF;
infrastructure\migrations\037_registration_rls_bootstrap.sql-27---
infrastructure\migrations\037_registration_rls_bootstrap.sql-28--- That is a SELECT against a FORCE-RLS table with NO tenant context. Its policy
infrastructure\migrations\037_registration_rls_bootstrap.sql-29--- evaluates `tenant_id = NULL` for every row, so the query returns ZERO ROWS —
infrastructure\migrations\037_registration_rls_bootstrap.sql-30--- always, for everybody. The guard cannot fire. It has been reading as a safety
infrastructure\migrations\037_registration_rls_bootstrap.sql-31--- net while being incapable of catching anything, which is the failure shape
--
infrastructure\migrations\037_registration_rls_bootstrap.sql-108-        current_setting('app.bootstrap', true) = 'on'
infrastructure\migrations\037_registration_rls_bootstrap.sql-109-        AND created_by::text = current_setting('app.bootstrap_user', true)
infrastructure\migrations\037_registration_rls_bootstrap.sql-110-    );
infrastructure\migrations\037_registration_rls_bootstrap.sql-111-
infrastructure\migrations\037_registration_rls_bootstrap.sql-112--- The membership row is the one that grants the caller their own access, so it
infrastructure\migrations\037_registration_rls_bootstrap.sql-113--- is pinned on BOTH columns: the row must be created by the registering user
infrastructure\migrations\037_registration_rls_bootstrap.sql-114--- AND be about the registering user. `created_by` alone would let a future
infrastructure\migrations\037_registration_rls_bootstrap.sql-115--- caller of this door mint a membership for somebody else.
infrastructure\migrations\037_registration_rls_bootstrap.sql:116:DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.memberships;
infrastructure\migrations\037_registration_rls_bootstrap.sql:117:CREATE POLICY registration_bootstrap_insert ON identity.memberships
infrastructure\migrations\037_registration_rls_bootstrap.sql-118-    FOR INSERT
infrastructure\migrations\037_registration_rls_bootstrap.sql-119-    WITH CHECK (
infrastructure\migrations\037_registration_rls_bootstrap.sql-120-        current_setting('app.bootstrap', true) = 'on'
infrastructure\migrations\037_registration_rls_bootstrap.sql-121-        AND created_by::text = current_setting('app.bootstrap_user', true)
infrastructure\migrations\037_registration_rls_bootstrap.sql-122-        AND user_id::text   = current_setting('app.bootstrap_user', true)
infrastructure\migrations\037_registration_rls_bootstrap.sql-123-    );
infrastructure\migrations\037_registration_rls_bootstrap.sql-124-
infrastructure\migrations\037_registration_rls_bootstrap.sql-125--- 🔴 THIS ONE IS WHAT MAKES THE DUPLICATE GUARD REAL.
infrastructure\migrations\037_registration_rls_bootstrap.sql-126--- Without it the guard reads zero rows forever and one person can own several
infrastructure\migrations\037_registration_rls_bootstrap.sql-127--- workshops. It exposes a single person's OWN membership rows, and only while
infrastructure\migrations\037_registration_rls_bootstrap.sql-128--- the flag is on — it is not a general read of the table.
infrastructure\migrations\037_registration_rls_bootstrap.sql:129:DROP POLICY IF EXISTS registration_bootstrap_select ON identity.memberships;
infrastructure\migrations\037_registration_rls_bootstrap.sql:130:CREATE POLICY registration_bootstrap_select ON identity.memberships
infrastructure\migrations\037_registration_rls_bootstrap.sql-131-    FOR SELECT
infrastructure\migrations\037_registration_rls_bootstrap.sql-132-    USING (
infrastructure\migrations\037_registration_rls_bootstrap.sql-133-        current_setting('app.bootstrap', true) = 'on'
infrastructure\migrations\037_registration_rls_bootstrap.sql-134-        AND user_id::text = current_setting('app.bootstrap_user', true)
infrastructure\migrations\037_registration_rls_bootstrap.sql-135-    );
infrastructure\migrations\037_registration_rls_bootstrap.sql-136-
infrastructure\migrations\037_registration_rls_bootstrap.sql-137-COMMENT ON POLICY registration_bootstrap_insert ON identity.tenants IS
infrastructure\migrations\037_registration_rls_bootstrap.sql-138-'Sign-up only. Admits an INSERT while identity.register_workshop holds '
infrastructure\migrations\037_registration_rls_bootstrap.sql-139-'app.bootstrap=on, and only for a row attributed to app.bootstrap_user. '
infrastructure\migrations\037_registration_rls_bootstrap.sql-140-'Registration is the one operation that legitimately has no tenant context — '
infrastructure\migrations\037_registration_rls_bootstrap.sql-141-'it is what CREATES the tenant a context is later made from.';
infrastructure\migrations\037_registration_rls_bootstrap.sql-142-
infrastructure\migrations\037_registration_rls_bootstrap.sql:143:COMMENT ON POLICY registration_bootstrap_select ON identity.memberships IS
infrastructure\migrations\037_registration_rls_bootstrap.sql-144-'Lets identity.register_workshop see whether the registering user ALREADY '
infrastructure\migrations\037_registration_rls_bootstrap.sql-145-'belongs to an organisation. Under FORCE RLS with no tenant context that check '
infrastructure\migrations\037_registration_rls_bootstrap.sql-146-'returned zero rows for everyone, so the one-workshop-per-person rule could '
infrastructure\migrations\037_registration_rls_bootstrap.sql-147-'never fire. Scoped to that single user, and only while app.bootstrap=on.';
infrastructure\migrations\037_registration_rls_bootstrap.sql-148-
infrastructure\migrations\037_registration_rls_bootstrap.sql-149--- ── 2. the function, taught to open and close the door ──────────────────────
infrastructure\migrations\037_registration_rls_bootstrap.sql-150-
infrastructure\migrations\037_registration_rls_bootstrap.sql-151-CREATE OR REPLACE FUNCTION identity.register_workshop(
--
infrastructure\migrations\037_registration_rls_bootstrap.sql-198-    PERFORM set_config('app.bootstrap_user', v_user::text,  true);
infrastructure\migrations\037_registration_rls_bootstrap.sql-199-
infrastructure\migrations\037_registration_rls_bootstrap.sql-200-    -- ⚠️ ONE WORKSHOP PER PERSON, and this check only became CAPABLE of firing
infrastructure\migrations\037_registration_rls_bootstrap.sql-201-    -- in migration 037: under FORCE RLS with no tenant context it read zero
infrastructure\migrations\037_registration_rls_bootstrap.sql-202-    -- rows for everybody. It sits AFTER the flag is set for that reason.
infrastructure\migrations\037_registration_rls_bootstrap.sql-203-    -- A retried request — a double-submitted form, a client that resends on a
infrastructure\migrations\037_registration_rls_bootstrap.sql-204-    -- slow response — would otherwise create a SECOND tenant with the same
infrastructure\migrations\037_registration_rls_bootstrap.sql-205-    -- owner, and there is no UI anywhere that would reveal the duplicate.
infrastructure\migrations\037_registration_rls_bootstrap.sql:206:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure\migrations\037_registration_rls_bootstrap.sql-207-                WHERE user_id = v_user AND status = 'active') THEN
infrastructure\migrations\037_registration_rls_bootstrap.sql-208-        PERFORM set_config('app.bootstrap',      '', true);
infrastructure\migrations\037_registration_rls_bootstrap.sql-209-        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure\migrations\037_registration_rls_bootstrap.sql-210-        RAISE EXCEPTION 'this account already belongs to an organisation';
infrastructure\migrations\037_registration_rls_bootstrap.sql-211-    END IF;
infrastructure\migrations\037_registration_rls_bootstrap.sql-212-
infrastructure\migrations\037_registration_rls_bootstrap.sql-213-    -- A readable, unique slug. `identity.tenants.slug` is NOT NULL and unique;
infrastructure\migrations\037_registration_rls_bootstrap.sql-214-    -- deriving it from the name alone would collide on the second "Auto Fix".
--
infrastructure\migrations\037_registration_rls_bootstrap.sql-245-    VALUES (v_branch, v_tenant, v_org,
infrastructure\migrations\037_registration_rls_bootstrap.sql-246-            COALESCE(NULLIF(btrim(p_branch_name), ''), 'Main branch'),
infrastructure\migrations\037_registration_rls_bootstrap.sql-247-            'active', v_user);
infrastructure\migrations\037_registration_rls_bootstrap.sql-248-
infrastructure\migrations\037_registration_rls_bootstrap.sql-249-    -- `workshop_owner`, spelled exactly as `permission-matrix.ts` and
infrastructure\migrations\037_registration_rls_bootstrap.sql-250-    -- `viewer-contract.ts`'s ROLE_TO_NAV expect. A role name that is merely
infrastructure\migrations\037_registration_rls_bootstrap.sql-251-    -- plausible resolves to no navigation tree and no permissions, and the user
infrastructure\migrations\037_registration_rls_bootstrap.sql-252-    -- lands in a workshop they can see nothing in.
infrastructure\migrations\037_registration_rls_bootstrap.sql:253:    INSERT INTO identity.memberships
infrastructure\migrations\037_registration_rls_bootstrap.sql-254-        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure\migrations\037_registration_rls_bootstrap.sql-255-    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'workshop_owner', 'active', v_user);
infrastructure\migrations\037_registration_rls_bootstrap.sql-256-
infrastructure\migrations\037_registration_rls_bootstrap.sql-257-    -- ── and the door closes ────────────────────────────────────────────────
infrastructure\migrations\037_registration_rls_bootstrap.sql-258-    -- The caller's transaction continues after this function returns. Leaving
infrastructure\migrations\037_registration_rls_bootstrap.sql-259-    -- the flag set would hand the rest of that transaction a bypass it was
infrastructure\migrations\037_registration_rls_bootstrap.sql-260-    -- never meant to have — a bypass whose blast radius is small (it is pinned
infrastructure\migrations\037_registration_rls_bootstrap.sql-261-    -- to this user) but which would still be an exemption nobody asked for.
--
infrastructure\migrations\036_signup_and_workshop_registration.sql-35--- grants is over a tenant THAT DID NOT EXIST A MOMENT AGO. It cannot name an
infrastructure\migrations\036_signup_and_workshop_registration.sql-36--- existing tenant, cannot accept a tenant id, and cannot add anyone to anything
infrastructure\migrations\036_signup_and_workshop_registration.sql-37--- that already has members. Adding a person to an EXISTING organisation stays
infrastructure\migrations\036_signup_and_workshop_registration.sql-38--- where it already is — `MembershipService.grant()`, which requires an
infrastructure\migrations\036_signup_and_workshop_registration.sql-39--- authenticated admin of that organisation. Do not "simplify" these together.
infrastructure\migrations\036_signup_and_workshop_registration.sql-40---
infrastructure\migrations\036_signup_and_workshop_registration.sql-41--- ── WHY SECURITY DEFINER, AGAIN ─────────────────────────────────────────────
infrastructure\migrations\036_signup_and_workshop_registration.sql-42---
infrastructure\migrations\036_signup_and_workshop_registration.sql:43:-- Same reason as `identity.memberships_for_subject` (migration 003), and the
infrastructure\migrations\036_signup_and_workshop_registration.sql:44:-- same measured failure behind it: `identity.memberships` is under ENABLE +
infrastructure\migrations\036_signup_and_workshop_registration.sql-45--- FORCE RLS, so with no tenant context its policy evaluates `tenant_id = NULL`
infrastructure\migrations\036_signup_and_workshop_registration.sql-46--- and the INSERT's WITH CHECK cannot pass. These functions run BEFORE any
infrastructure\migrations\036_signup_and_workshop_registration.sql-47--- tenant context exists — they are what creates the thing a context is made of.
infrastructure\migrations\036_signup_and_workshop_registration.sql-48---
infrastructure\migrations\036_signup_and_workshop_registration.sql-49--- Both are small, pinned to a fixed `search_path`, accept only a subject taken
infrastructure\migrations\036_signup_and_workshop_registration.sql-50--- from a signature-validated token, and are executable only by the application
infrastructure\migrations\036_signup_and_workshop_registration.sql-51--- role. That is the whole tenant-boundary crossing, and it stays auditable.
infrastructure\migrations\036_signup_and_workshop_registration.sql-52--- ============================================================================
--
infrastructure\migrations\036_signup_and_workshop_registration.sql-164-        RAISE EXCEPTION 'no active application user for this identity';
infrastructure\migrations\036_signup_and_workshop_registration.sql-165-    END IF;
infrastructure\migrations\036_signup_and_workshop_registration.sql-166-
infrastructure\migrations\036_signup_and_workshop_registration.sql-167-    -- ⚠️ ONE WORKSHOP PER PERSON, FOR NOW, AND IT IS CHECKED HERE rather than in
infrastructure\migrations\036_signup_and_workshop_registration.sql-168-    -- the service. A retried request — a double-submitted form, a client that
infrastructure\migrations\036_signup_and_workshop_registration.sql-169-    -- resends on a slow response — would otherwise create a SECOND tenant with
infrastructure\migrations\036_signup_and_workshop_registration.sql-170-    -- the same owner, and there is no UI anywhere that would reveal the
infrastructure\migrations\036_signup_and_workshop_registration.sql-171-    -- duplicate. The user would simply be in whichever one sorted first.
infrastructure\migrations\036_signup_and_workshop_registration.sql:172:    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure\migrations\036_signup_and_workshop_registration.sql-173-                WHERE user_id = v_user AND status = 'active') THEN
infrastructure\migrations\036_signup_and_workshop_registration.sql-174-        RAISE EXCEPTION 'this account already belongs to an organisation';
infrastructure\migrations\036_signup_and_workshop_registration.sql-175-    END IF;
infrastructure\migrations\036_signup_and_workshop_registration.sql-176-
infrastructure\migrations\036_signup_and_workshop_registration.sql-177-    -- A readable, unique slug. `identity.tenants.slug` is NOT NULL and unique;
infrastructure\migrations\036_signup_and_workshop_registration.sql-178-    -- deriving it from the name alone would collide on the second "Auto Fix".
infrastructure\migrations\036_signup_and_workshop_registration.sql-179-    v_slug := regexp_replace(lower(btrim(p_workshop_name)), '[^a-z0-9]+', '-', 'g');
infrastructure\migrations\036_signup_and_workshop_registration.sql-180-    v_slug := btrim(v_slug, '-');
--
infrastructure\migrations\036_signup_and_workshop_registration.sql-205-            COALESCE(NULLIF(btrim(p_branch_name), ''), 'Main branch'),
infrastructure\migrations\036_signup_and_workshop_registration.sql-206-            'active', v_user)
infrastructure\migrations\036_signup_and_workshop_registration.sql-207-    RETURNING id INTO v_branch;
infrastructure\migrations\036_signup_and_workshop_registration.sql-208-
infrastructure\migrations\036_signup_and_workshop_registration.sql-209-    -- `workshop_owner`, spelled exactly as `permission-matrix.ts` and
infrastructure\migrations\036_signup_and_workshop_registration.sql-210-    -- `viewer-contract.ts`'s ROLE_TO_NAV expect. A role name that is merely
infrastructure\migrations\036_signup_and_workshop_registration.sql-211-    -- plausible resolves to no navigation tree and no permissions, and the user
infrastructure\migrations\036_signup_and_workshop_registration.sql-212-    -- lands in a workshop they can see nothing in.
infrastructure\migrations\036_signup_and_workshop_registration.sql:213:    INSERT INTO identity.memberships
infrastructure\migrations\036_signup_and_workshop_registration.sql-214-        (tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure\migrations\036_signup_and_workshop_registration.sql-215-    VALUES (v_tenant, v_org, v_branch, v_user, 'workshop_owner', 'active', v_user)
infrastructure\migrations\036_signup_and_workshop_registration.sql-216-    RETURNING id INTO v_member;
infrastructure\migrations\036_signup_and_workshop_registration.sql-217-
infrastructure\migrations\036_signup_and_workshop_registration.sql-218-    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
infrastructure\migrations\036_signup_and_workshop_registration.sql-219-END;
infrastructure\migrations\036_signup_and_workshop_registration.sql-220-$$;
infrastructure\migrations\036_signup_and_workshop_registration.sql-221-
--
infrastructure\migrations\025_platform_admin_role_name.sql-3--- 🔴 EVERY ADMIN POLICY IN THE CATALOGUE AND MARKETPLACE SCHEMAS IS CURRENTLY
infrastructure\migrations\025_platform_admin_role_name.sql-4--- UNREACHABLE FROM THE APPLICATION. Nine policies and three triggers, across
infrastructure\migrations\025_platform_admin_role_name.sql-5--- migrations 021 to 024, gate on:
infrastructure\migrations\025_platform_admin_role_name.sql-6---
infrastructure\migrations\025_platform_admin_role_name.sql-7---     identity.current_role_name() = 'admin'
infrastructure\migrations\025_platform_admin_role_name.sql-8---
infrastructure\migrations\025_platform_admin_role_name.sql-9--- and no request this application makes ever sets that value.
infrastructure\migrations\025_platform_admin_role_name.sql-10--- `tenantSessionStatements` sets `app.current_role` from `ctx.activeRole`,
infrastructure\migrations\025_platform_admin_role_name.sql:11:-- which is the `identity.memberships.role_name` — for a platform administrator
infrastructure\migrations\025_platform_admin_role_name.sql-12--- that string is `platform_administrator`. The literal `admin` is set by
infrastructure\migrations\025_platform_admin_role_name.sql-13--- exactly two things: `scripts/seed-dev-catalogue.sh` and hand-run psql.
infrastructure\migrations\025_platform_admin_role_name.sql-14---
infrastructure\migrations\025_platform_admin_role_name.sql-15--- MEASURED, NOT INFERRED (2026-08-01, against the live local database):
infrastructure\migrations\025_platform_admin_role_name.sql-16---
infrastructure\migrations\025_platform_admin_role_name.sql-17---   set_config('app.current_role','platform_administrator') → UPDATE 0
infrastructure\migrations\025_platform_admin_role_name.sql-18---   set_config('app.current_role','admin')                  → UPDATE 20
infrastructure\migrations\025_platform_admin_role_name.sql-19---
--
infrastructure\migrations\023_supplier_accounts.sql-91-     WHERE su.supplier_id = p_supplier_id
infrastructure\migrations\023_supplier_accounts.sql-92-       AND su.user_id = identity.current_user_id()
infrastructure\migrations\023_supplier_accounts.sql-93-       AND su.status = 'active'
infrastructure\migrations\023_supplier_accounts.sql-94-  );
infrastructure\migrations\023_supplier_accounts.sql-95-$$;
infrastructure\migrations\023_supplier_accounts.sql-96-
infrastructure\migrations\023_supplier_accounts.sql-97--- A SECURITY DEFINER function is executable by PUBLIC unless told otherwise,
infrastructure\migrations\023_supplier_accounts.sql-98--- and PUBLIC includes every role the database will ever have. Same REVOKE as
infrastructure\migrations\023_supplier_accounts.sql:99:-- `identity.memberships_for_subject` in 003.
infrastructure\migrations\023_supplier_accounts.sql-100-REVOKE ALL ON FUNCTION catalogue.current_user_supplies(UUID) FROM PUBLIC;
infrastructure\migrations\023_supplier_accounts.sql-101-GRANT EXECUTE ON FUNCTION catalogue.current_user_supplies(UUID) TO autoworkshop_app;
infrastructure\migrations\023_supplier_accounts.sql-102-
infrastructure\migrations\023_supplier_accounts.sql-103--- ---------------------------------------------------------------------------
infrastructure\migrations\023_supplier_accounts.sql-104--- What a supplier is allowed to change on an order.
infrastructure\migrations\023_supplier_accounts.sql-105--- ---------------------------------------------------------------------------
infrastructure\migrations\023_supplier_accounts.sql-106--- Returns the columns a supplier-context UPDATE may touch. Written as a
infrastructure\migrations\023_supplier_accounts.sql-107--- function rather than inlined so the trigger and any future test assert the
--
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-10--- ── DEFECT 1: authorization could never succeed ─────────────────────────────
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-11---
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-12--- `MembershipRepository.findByKeycloakSubject()` resolves which tenants a user
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-13--- belongs to. It has to run WITHOUT a tenant context, because it is the query
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-14--- that ESTABLISHES the tenant context -- there is nothing to scope it to yet.
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-15--- It therefore used `queryWithoutTenant()`, which issues a plain pool query and
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-16--- sets no `app.*` settings at all.
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-17---
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql:18:-- But `identity.memberships` is under ENABLE + FORCE RLS, and its policy reads
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-19---     USING (is_platform_admin() OR tenant_id = current_tenant_id())
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-20--- With nothing set, `current_tenant_id()` is NULL and `current_role_name()` is
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-21--- 'none', so the policy evaluates `tenant_id = NULL` -> NULL -> not visible.
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-22---
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-23--- Measured on the running database, as the real application role:
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-24---     current_user = autoworkshop_app, rolsuper = f
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-25---     memberships actually present : 1   (technician, active)
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-26---     memberships visible          : 0
--
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-44---     widen it to another user, and no way to enumerate.
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-45---   * `search_path` is pinned. A SECURITY DEFINER function without that can be
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-46---     hijacked by a caller-controlled search_path resolving `identity.users` to
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-47---     something else entirely.
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-48---   * EXECUTE is revoked from PUBLIC and granted only to the application role.
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-49---
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-50--- The tenant boundary is crossed in exactly one place, deliberately, in about
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-51--- ten lines -- which is far easier to audit than the alternative of widening a
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql:52:-- policy on `identity.memberships` itself.
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-53---
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-54--- ── DEFECT 2: audit.events had no row-level security ────────────────────────
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-55---
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-56--- Every tenant-owned table in 001 gets ENABLE + FORCE. `audit.events` got
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-57--- neither, while 002 grants SELECT on it to `autoworkshop_app`. Confirmed live:
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-58---     audit.events           enabled=f forced=f
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql:59:--     identity.memberships   enabled=t forced=t
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-60---
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-61--- The table carries `tenant_id`, `actor_user_id`, `correlation_id` and a
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-62--- `detail` jsonb. Any audit-viewing endpoint, any over-broad internal query, or
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-63--- any SQL injection reaching the app role could read every tenant's audit trail.
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-64--- CLAUDE.md §7 requires RLS on every tenant-owned table; this one was missed.
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-65---
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-66--- THE POLICY IS ASYMMETRIC ON PURPOSE. A naive `tenant_id = current_tenant_id()`
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-67--- on both sides would break the audit trail: system and pre-authentication
--
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-78--- Append-only is unaffected: the DO INSTEAD NOTHING rules on UPDATE and DELETE
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-79--- from 001 still stand, and this migration grants nothing new.
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-80--- ============================================================================
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-81-
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-82-BEGIN;
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-83-
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-84--- ── defect 1: bootstrap membership resolution ───────────────────────────────
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-85-
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql:86:CREATE OR REPLACE FUNCTION identity.memberships_for_subject(p_subject TEXT)
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-87-RETURNS TABLE (
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-88-    user_id         uuid,
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-89-    tenant_id       uuid,
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-90-    organization_id uuid,
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-91-    branch_id       uuid,
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-92-    role_name       TEXT,
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-93-    status          TEXT
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-94-)
--
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-101-AS $$
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-102-    SELECT u.id,
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-103-           m.tenant_id,
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-104-           m.organization_id,
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-105-           m.branch_id,
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-106-           m.role_name,
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-107-           m.status
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-108-      FROM identity.users u
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql:109: LEFT JOIN identity.memberships m ON m.user_id = u.id
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-110-     WHERE u.keycloak_subject = p_subject
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-111-       AND u.status = 'active';
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-112-$$;
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-113-
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql:114:COMMENT ON FUNCTION identity.memberships_for_subject(TEXT) IS
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-115-'Bootstrap lookup: resolves a validated Keycloak subject to its own memberships. '
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql:116:'SECURITY DEFINER because identity.memberships is under FORCE RLS and this query '
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-117-'runs before any tenant context exists -- it is what establishes it. Accepts only '
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-118-'a subject taken from a signature-validated token; returns only that user''s rows.';
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-119-
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-120--- Not for the world. Only the application role may resolve a subject.
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql:121:REVOKE ALL ON FUNCTION identity.memberships_for_subject(TEXT) FROM PUBLIC;
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql:122:GRANT EXECUTE ON FUNCTION identity.memberships_for_subject(TEXT) TO autoworkshop_app;
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-123-
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-124--- ── defect 2: RLS on the audit trail ────────────────────────────────────────
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-125-
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-126-ALTER TABLE audit.events ENABLE ROW LEVEL SECURITY;
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-127--- FORCE, so the owner is bound by the policy too. Without it, isolation is off
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-128--- in precisely the environment where it matters most -- the lesson of 002.
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-129-ALTER TABLE audit.events FORCE  ROW LEVEL SECURITY;
infrastructure\migrations\003_identity_bootstrap_and_audit_rls.sql-130-
--
infrastructure\migrations\001_tenancy_foundation.sql-133-);
infrastructure\migrations\001_tenancy_foundation.sql-134-
infrastructure\migrations\001_tenancy_foundation.sql-135-CREATE INDEX IF NOT EXISTS idx_users_email ON identity.users(lower(email));
infrastructure\migrations\001_tenancy_foundation.sql-136-
infrastructure\migrations\001_tenancy_foundation.sql-137--- ── memberships ─────────────────────────────────────────────────────────────
infrastructure\migrations\001_tenancy_foundation.sql-138--- A user gains access ONLY through a membership. A user may belong to several
infrastructure\migrations\001_tenancy_foundation.sql-139--- tenants, but every request resolves exactly one active tenant context.
infrastructure\migrations\001_tenancy_foundation.sql-140-
infrastructure\migrations\001_tenancy_foundation.sql:141:CREATE TABLE IF NOT EXISTS identity.memberships (
infrastructure\migrations\001_tenancy_foundation.sql-142-    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
infrastructure\migrations\001_tenancy_foundation.sql-143-    tenant_id       uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
infrastructure\migrations\001_tenancy_foundation.sql-144-    organization_id uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
infrastructure\migrations\001_tenancy_foundation.sql-145-    branch_id       uuid REFERENCES identity.branches(id) ON DELETE SET NULL,
infrastructure\migrations\001_tenancy_foundation.sql-146-    user_id         uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
infrastructure\migrations\001_tenancy_foundation.sql-147-    role_name       TEXT NOT NULL,
infrastructure\migrations\001_tenancy_foundation.sql-148-    status          TEXT NOT NULL DEFAULT 'active'
infrastructure\migrations\001_tenancy_foundation.sql-149-                    CHECK (status IN ('active', 'suspended', 'revoked')),
infrastructure\migrations\001_tenancy_foundation.sql-150-    created_at      timestamptz NOT NULL DEFAULT now(),
infrastructure\migrations\001_tenancy_foundation.sql-151-    created_by      uuid,
infrastructure\migrations\001_tenancy_foundation.sql-152-    updated_at      timestamptz,
infrastructure\migrations\001_tenancy_foundation.sql-153-    updated_by      uuid,
infrastructure\migrations\001_tenancy_foundation.sql-154-    UNIQUE (organization_id, user_id, role_name)
infrastructure\migrations\001_tenancy_foundation.sql-155-);
infrastructure\migrations\001_tenancy_foundation.sql-156-
infrastructure\migrations\001_tenancy_foundation.sql:157:CREATE INDEX IF NOT EXISTS idx_memberships_tenant ON identity.memberships(tenant_id);
infrastructure\migrations\001_tenancy_foundation.sql:158:CREATE INDEX IF NOT EXISTS idx_memberships_user   ON identity.memberships(user_id);
infrastructure\migrations\001_tenancy_foundation.sql-159-
infrastructure\migrations\001_tenancy_foundation.sql-160--- ── row-level security ──────────────────────────────────────────────────────
infrastructure\migrations\001_tenancy_foundation.sql-161--- ENABLE alone is not enough: without FORCE, the table owner bypasses the
infrastructure\migrations\001_tenancy_foundation.sql-162--- policy entirely — which would silently defeat isolation in exactly the
infrastructure\migrations\001_tenancy_foundation.sql-163--- environment where it matters most.
infrastructure\migrations\001_tenancy_foundation.sql-164-
infrastructure\migrations\001_tenancy_foundation.sql-165-ALTER TABLE identity.tenants       ENABLE ROW LEVEL SECURITY;
infrastructure\migrations\001_tenancy_foundation.sql-166-ALTER TABLE identity.tenants       FORCE  ROW LEVEL SECURITY;
infrastructure\migrations\001_tenancy_foundation.sql-167-ALTER TABLE identity.organizations ENABLE ROW LEVEL SECURITY;
infrastructure\migrations\001_tenancy_foundation.sql-168-ALTER TABLE identity.organizations FORCE  ROW LEVEL SECURITY;
infrastructure\migrations\001_tenancy_foundation.sql-169-ALTER TABLE identity.branches      ENABLE ROW LEVEL SECURITY;
infrastructure\migrations\001_tenancy_foundation.sql-170-ALTER TABLE identity.branches      FORCE  ROW LEVEL SECURITY;
infrastructure\migrations\001_tenancy_foundation.sql:171:ALTER TABLE identity.memberships   ENABLE ROW LEVEL SECURITY;
infrastructure\migrations\001_tenancy_foundation.sql:172:ALTER TABLE identity.memberships   FORCE  ROW LEVEL SECURITY;
infrastructure\migrations\001_tenancy_foundation.sql-173-
infrastructure\migrations\001_tenancy_foundation.sql-174-DROP POLICY IF EXISTS tenant_isolation ON identity.tenants;
infrastructure\migrations\001_tenancy_foundation.sql-175-CREATE POLICY tenant_isolation ON identity.tenants
infrastructure\migrations\001_tenancy_foundation.sql-176-    USING (identity.is_platform_admin() OR id = identity.current_tenant_id())
infrastructure\migrations\001_tenancy_foundation.sql-177-    WITH CHECK (identity.is_platform_admin() OR id = identity.current_tenant_id());
infrastructure\migrations\001_tenancy_foundation.sql-178-
infrastructure\migrations\001_tenancy_foundation.sql-179-DROP POLICY IF EXISTS tenant_isolation ON identity.organizations;
infrastructure\migrations\001_tenancy_foundation.sql-180-CREATE POLICY tenant_isolation ON identity.organizations
infrastructure\migrations\001_tenancy_foundation.sql-181-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure\migrations\001_tenancy_foundation.sql-182-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure\migrations\001_tenancy_foundation.sql-183-
infrastructure\migrations\001_tenancy_foundation.sql-184-DROP POLICY IF EXISTS tenant_isolation ON identity.branches;
infrastructure\migrations\001_tenancy_foundation.sql-185-CREATE POLICY tenant_isolation ON identity.branches
infrastructure\migrations\001_tenancy_foundation.sql-186-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure\migrations\001_tenancy_foundation.sql-187-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure\migrations\001_tenancy_foundation.sql-188-
infrastructure\migrations\001_tenancy_foundation.sql:189:DROP POLICY IF EXISTS tenant_isolation ON identity.memberships;
infrastructure\migrations\001_tenancy_foundation.sql:190:CREATE POLICY tenant_isolation ON identity.memberships
infrastructure\migrations\001_tenancy_foundation.sql-191-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure\migrations\001_tenancy_foundation.sql-192-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure\migrations\001_tenancy_foundation.sql-193-
infrastructure\migrations\001_tenancy_foundation.sql-194--- identity.users is deliberately NOT tenant-scoped: one human may hold
infrastructure\migrations\001_tenancy_foundation.sql-195--- memberships in several tenants. Visibility of a user is granted through
infrastructure\migrations\001_tenancy_foundation.sql-196--- membership joins, which ARE tenant-scoped.
infrastructure\migrations\001_tenancy_foundation.sql-197-
infrastructure\migrations\001_tenancy_foundation.sql-198--- ── audit log (append-only) ─────────────────────────────────────────────────
--
apps\e2e\tests\live-signed-in.spec.ts-417-   *
apps\e2e\tests\live-signed-in.spec.ts-418-   * Run 32290511884: `getByLabel('Acting as role')` — ELEMENT NOT FOUND.
apps\e2e\tests\live-signed-in.spec.ts-419-   * `RoleSwitcher` returns `null` when the viewer holds fewer than two roles
apps\e2e\tests\live-signed-in.spec.ts-420-   * ("one role is not a choice"), so the control was absent, not broken. The
apps\e2e\tests\live-signed-in.spec.ts-421-   * conclusion drawn was that the CI identity holds one role, and
apps\e2e\tests\live-signed-in.spec.ts-422-   * `diagnose-live-identity-roles.yml` run 32293446882 asked production and
apps\e2e\tests\live-signed-in.spec.ts-423-   * CONFIRMED it: one active membership, `workshop_owner`.
apps\e2e\tests\live-signed-in.spec.ts-424-   *
apps\e2e\tests\live-signed-in.spec.ts:425:   * ▶ BUT THE PRESCRIBED FIX — "give the CI identity memberships in the
apps\e2e\tests\live-signed-in.spec.ts-426-   *   `[AUDIT]` organisations" — WOULD HAVE LEFT THIS CHECK SKIPPING ANYWAY,
apps\e2e\tests\live-signed-in.spec.ts-427-   *   and that is the thing worth remembering:
apps\e2e\tests\live-signed-in.spec.ts-428-   *
apps\e2e\tests\live-signed-in.spec.ts-429-   *     viewer-contract.ts:470   if (m.organizationId !== organizationId) continue;
apps\e2e\tests\live-signed-in.spec.ts-430-   *
apps\e2e\tests\live-signed-in.spec.ts-431-   *   `rolesFromMemberships` is SCOPED TO THE ACTIVE ORGANISATION, on purpose.
apps\e2e\tests\live-signed-in.spec.ts-432-   *   Every request carries `x-organization-id` AND `x-role-name` and
apps\e2e\tests\live-signed-in.spec.ts-433-   *   `resolveTenantContext` requires ONE membership matching BOTH, so a role
apps\e2e\tests\live-signed-in.spec.ts-434-   *   held in a DIFFERENT organisation is never offered here — offering it
apps\e2e\tests\live-signed-in.spec.ts-435-   *   would offer a pair the API refuses. The `[AUDIT]` organisations are in
apps\e2e\tests\live-signed-in.spec.ts-436-   *   the operator's tenant; the live-suite account is in its own. So the role
apps\e2e\tests\live-signed-in.spec.ts-437-   *   switcher can never be the control that reaches them.
apps\e2e\tests\live-signed-in.spec.ts-438-   *
apps\e2e\tests\live-signed-in.spec.ts-439-   * ▶ THE CONTROL THAT CROSSES ORGANISATIONS IS THE ORGANISATION SWITCHER.
apps\e2e\tests\live-signed-in.spec.ts:440:   *   `organizationsFromMemberships` does NOT filter by tenant, and
apps\e2e\tests\live-signed-in.spec.ts:441:   *   `setActiveOrganizationAction` CLEARS the stored role on the way out so
apps\e2e\tests\live-signed-in.spec.ts-442-   *   the API re-defaults to the strongest role held in the organisation just
apps\e2e\tests\live-signed-in.spec.ts-443-   *   entered. That is why this check now drives that control instead.
apps\e2e\tests\live-signed-in.spec.ts-444-   *
apps\e2e\tests\live-signed-in.spec.ts-445-   * ⚠️ IT STILL SKIPS RATHER THAN FAILS WHEN THE MEMBERSHIPS ARE ABSENT. That
apps\e2e\tests\live-signed-in.spec.ts-446-   * is a fixture gap, not a product defect — a red would say something is
apps\e2e\tests\live-signed-in.spec.ts-447-   * broken when nothing is, and a silent skip would hide that four screens are
apps\e2e\tests\live-signed-in.spec.ts-448-   * unverified. Passed, failed and SKIPPED are three states here.
apps\e2e\tests\live-signed-in.spec.ts-449-   */
--
apps\e2e\tests\live-signed-in.spec.ts-452-
apps\e2e\tests\live-signed-in.spec.ts-453-    // Asserted first and separately: the shell DID resolve a viewer. Without
apps\e2e\tests\live-signed-in.spec.ts-454-    // this, "no switcher" and "no shell" would look identical, and the second
apps\e2e\tests\live-signed-in.spec.ts-455-    // is a real defect.
apps\e2e\tests\live-signed-in.spec.ts-456-    await expect(page.getByRole('button', { name: /Sign out/ }).first()).toBeVisible({
apps\e2e\tests\live-signed-in.spec.ts-457-      timeout: 60_000,
apps\e2e\tests\live-signed-in.spec.ts-458-    });
apps\e2e\tests\live-signed-in.spec.ts-459-
apps\e2e\tests\live-signed-in.spec.ts:460:    // ⚠️ `Active organization` — the LABEL's spelling, which is American while
apps\e2e\tests\live-signed-in.spec.ts-461-    // the prose here is not. Matching the prose would silently find nothing.
apps\e2e\tests\live-signed-in.spec.ts:462:    const switcher = page.getByLabel('Active organization');
apps\e2e\tests\live-signed-in.spec.ts-463-    const hasSwitcher = (await switcher.count()) > 0;
apps\e2e\tests\live-signed-in.spec.ts-464-
apps\e2e\tests\live-signed-in.spec.ts-465-    test.skip(
apps\e2e\tests\live-signed-in.spec.ts-466-      !hasSwitcher,
apps\e2e\tests\live-signed-in.spec.ts-467-      'A3 UNANSWERED: this CI identity belongs to ONE organisation, so the ' +
apps\e2e\tests\live-signed-in.spec.ts-468-        'organisation switcher is not rendered and the insurance, towing and ' +
apps\e2e\tests\live-signed-in.spec.ts-469-        'fleet screens CANNOT be reached by a signed-in viewer here. Not a ' +
apps\e2e\tests\live-signed-in.spec.ts-470-        'product defect and not a pass. Fix: run ' +
--
apps\e2e\tests\live-signed-in.spec.ts-485-   * Enter a partner workspace by switching ORGANISATION, and say whether it
apps\e2e\tests\live-signed-in.spec.ts-486-   * was possible.
apps\e2e\tests\live-signed-in.spec.ts-487-   *
apps\e2e\tests\live-signed-in.spec.ts-488-   * 🔴 WHY ORGANISATION AND NOT ROLE. `rolesFromMemberships` filters to the
apps\e2e\tests\live-signed-in.spec.ts-489-   * ACTIVE organisation, so a role held only in another organisation is never
apps\e2e\tests\live-signed-in.spec.ts-490-   * in the role switcher — the earlier `actAs` could not have reached the
apps\e2e\tests\live-signed-in.spec.ts-491-   * `[AUDIT]` organisations however many memberships were granted. The
apps\e2e\tests\live-signed-in.spec.ts-492-   * organisation switcher is unfiltered by tenant, and
apps\e2e\tests\live-signed-in.spec.ts:493:   * `setActiveOrganizationAction` deletes the stored role cookie before
apps\e2e\tests\live-signed-in.spec.ts-494-   * redirecting to `/`, so the API re-resolves the STRONGEST role held in the
apps\e2e\tests\live-signed-in.spec.ts-495-   * organisation just entered (`ROLE_PRECEDENCE`). Switching organisation is
apps\e2e\tests\live-signed-in.spec.ts-496-   * therefore sufficient on its own, and switching role afterwards would be
apps\e2e\tests\live-signed-in.spec.ts-497-   * both unnecessary and — inside a single-role organisation, where the
apps\e2e\tests\live-signed-in.spec.ts-498-   * switcher is absent — impossible.
apps\e2e\tests\live-signed-in.spec.ts-499-   *
apps\e2e\tests\live-signed-in.spec.ts-500-   * ⚠️ SWITCHING ALSO NAVIGATES, to `/`, which dispatches to the new role's
apps\e2e\tests\live-signed-in.spec.ts-501-   * home pack. The caller's own `page.goto` follows, so this only has to wait
--
apps\e2e\tests\live-signed-in.spec.ts-504-   * 🔴 COUNT, DO NOT WAIT — kept from the fix on 2026-08-19. The first version
apps\e2e\tests\live-signed-in.spec.ts-505-   * of this helper called `waitFor({ state: 'visible' })` on a control whose
apps\e2e\tests\live-signed-in.spec.ts-506-   * ABSENCE is the expected case, which THROWS after 60s, so it could never
apps\e2e\tests\live-signed-in.spec.ts-507-   * return `false` and the callers' skip branch was unreachable. The suite went
apps\e2e\tests\live-signed-in.spec.ts-508-   * red twice for a fixture gap the checks were written to skip on. Absence
apps\e2e\tests\live-signed-in.spec.ts-509-   * must be a value this returns, never an exception it raises.
apps\e2e\tests\live-signed-in.spec.ts-510-   */
apps\e2e\tests\live-signed-in.spec.ts-511-  async function actInOrganization(page: import('@playwright/test').Page, match: RegExp) {
apps\e2e\tests\live-signed-in.spec.ts:512:    const switcher = page.getByLabel('Active organization');
apps\e2e\tests\live-signed-in.spec.ts-513-    if ((await switcher.count()) === 0) return false;
apps\e2e\tests\live-signed-in.spec.ts-514-    const options = await switcher.locator('option').all();
apps\e2e\tests\live-signed-in.spec.ts-515-    for (const o of options) {
apps\e2e\tests\live-signed-in.spec.ts-516-      const label = (await o.textContent()) ?? '';
apps\e2e\tests\live-signed-in.spec.ts-517-      if (match.test(label)) {
apps\e2e\tests\live-signed-in.spec.ts-518-        await switcher.selectOption({ label });
apps\e2e\tests\live-signed-in.spec.ts-519-        await page.waitForLoadState('networkidle', { timeout: 120_000 });
apps\e2e\tests\live-signed-in.spec.ts-520-        return true;
--
apps\api\src\tenancy\tenant-context.ts-86-   * never introduce a role the user does not hold.
apps\api\src\tenancy\tenant-context.ts-87-   *
apps\api\src\tenancy\tenant-context.ts-88-   * ⚠️ THE CLIENT NAMES A PREFERENCE, NEVER A GRANT. If this ever admitted a
apps\api\src\tenancy\tenant-context.ts-89-   * role with no membership row behind it, that is privilege escalation by
apps\api\src\tenancy\tenant-context.ts-90-   * header — the confused-deputy attack `1.txt` §9 forbids. Asking for a role
apps\api\src\tenancy\tenant-context.ts-91-   * you do not hold THROWS; it is never quietly downgraded to one you do,
apps\api\src\tenancy\tenant-context.ts-92-   * because a silent downgrade hides an authorization probe.
apps\api\src\tenancy\tenant-context.ts-93-   *
apps\api\src\tenancy\tenant-context.ts:94:   * Why this exists: `identity.memberships` is unique on
apps\api\src\tenancy\tenant-context.ts-95-   * (organization_id, user_id, role_name), so one user holding several roles is
apps\api\src\tenancy\tenant-context.ts-96-   * already representable — but the default selection below sorts on
apps\api\src\tenancy\tenant-context.ts-97-   * ORGANISATION ID ALONE. Two roles in the SAME organisation compare equal, so
apps\api\src\tenancy\tenant-context.ts-98-   * the winner fell out of database row order and a user could resolve as the
apps\api\src\tenancy\tenant-context.ts-99-   * weaker of their own roles. Stacking roles without this parameter produces a
apps\api\src\tenancy\tenant-context.ts-100-   * confusing account, not a powerful one.
apps\api\src\tenancy\tenant-context.ts-101-   */
apps\api\src\tenancy\tenant-context.ts-102-  requestedRoleName?: string;
--
apps\api\src\tenancy\tenant-context.spec.ts-365-        membership({ organizationId: 'org-9', roleName: 'workshop_manager' }),
apps\api\src\tenancy\tenant-context.spec.ts-366-      ],
apps\api\src\tenancy\tenant-context.spec.ts-367-      correlationId: 'c',
apps\api\src\tenancy\tenant-context.spec.ts-368-    });
apps\api\src\tenancy\tenant-context.spec.ts-369-    expect(reversed.organizationId).toBe('org-2');
apps\api\src\tenancy\tenant-context.spec.ts-370-  });
apps\api\src\tenancy\tenant-context.spec.ts-371-
apps\api\src\tenancy\tenant-context.spec.ts-372-  it('an UNRANKED role sorts last — it never outranks a governance role', () => {
apps\api\src\tenancy\tenant-context.spec.ts:373:    // A role added to `identity.memberships` before it is added to
apps\api\src\tenancy\tenant-context.spec.ts-374-    // `ROLE_PRECEDENCE` must fail the SAFE way. Ranking it first would let a
apps\api\src\tenancy\tenant-context.spec.ts-375-    // new, unreviewed role name become the default for everyone holding it.
apps\api\src\tenancy\tenant-context.spec.ts-376-    const ctx = resolveTenantContext({
apps\api\src\tenancy\tenant-context.spec.ts-377-      userId: 'owner',
apps\api\src\tenancy\tenant-context.spec.ts-378-      memberships: [
apps\api\src\tenancy\tenant-context.spec.ts-379-        membership({ organizationId: 'org-1', roleName: 'brand_new_role' }),
apps\api\src\tenancy\tenant-context.spec.ts-380-        membership({ organizationId: 'org-1', roleName: 'workshop_owner' }),
apps\api\src\tenancy\tenant-context.spec.ts-381-      ],
--
apps\api\src\tenancy\tenant-context.spec.ts-446-  });
apps\api\src\tenancy\tenant-context.spec.ts-447-});
apps\api\src\tenancy\tenant-context.spec.ts-448-
apps\api\src\tenancy\tenant-context.spec.ts-449-/**
apps\api\src\tenancy\tenant-context.spec.ts-450- * 🔴 PLATFORM AUTHORITY IS A GRANT, AND THE MEMBERSHIP ROLE NAME BUYS NOTHING.
apps\api\src\tenancy\tenant-context.spec.ts-451- *
apps\api\src\tenancy\tenant-context.spec.ts-452- * This block is the API half of migration 077, which hardened the DATABASE on
apps\api\src\tenancy\tenant-context.spec.ts-453- * 2026-08-10 and deliberately left the API deriving `platform.admin` from
apps\api\src\tenancy\tenant-context.spec.ts:454: * `identity.memberships.role_name`. For a day, revoking a grant on production
apps\api\src\tenancy\tenant-context.spec.ts-455- * removed database reach and left every API gate open — and two of those gates
apps\api\src\tenancy\tenant-context.spec.ts-456- * (`GET /security/posture`, `GET /operations/report`) sit on endpoints that read
apps\api\src\tenancy\tenant-context.spec.ts-457- * server-wide catalogues with no row-level security underneath, so the
apps\api\src\tenancy\tenant-context.spec.ts-458- * application check IS the enforcement there.
apps\api\src\tenancy\tenant-context.spec.ts-459- *
apps\api\src\tenancy\tenant-context.spec.ts-460- * The fix is here rather than at the thirty-three call sites that consume the
apps\api\src\tenancy\tenant-context.spec.ts-461- * role name. Seven endpoints test the permission directly; the string also
apps\api\src\tenancy\tenant-context.spec.ts-462- * appears in a role ALLOW-LIST in twenty-nine further files, several of which
--
apps\api\src\tenancy\organisation-isolation.integration.spec.ts-57- */
apps\api\src\tenancy\organisation-isolation.integration.spec.ts-58-const NO_ORG_PREDICATE_EXPECTED = new Set([
apps\api\src\tenancy\organisation-isolation.integration.spec.ts-59-  // identity: the tenancy spine. An organisation predicate on the table that
apps\api\src\tenancy\organisation-isolation.integration.spec.ts-60-  // DEFINES organisations is circular, and registration writes these before any
apps\api\src\tenancy\organisation-isolation.integration.spec.ts-61-  // organisation exists to be named.
apps\api\src\tenancy\organisation-isolation.integration.spec.ts-62-  'identity.tenants',
apps\api\src\tenancy\organisation-isolation.integration.spec.ts-63-  'identity.organizations',
apps\api\src\tenancy\organisation-isolation.integration.spec.ts-64-  'identity.users',
apps\api\src\tenancy\organisation-isolation.integration.spec.ts:65:  'identity.memberships',
apps\api\src\tenancy\organisation-isolation.integration.spec.ts-66-  'identity.branches',
apps\api\src\tenancy\organisation-isolation.integration.spec.ts-67-  'identity.roles',
apps\api\src\tenancy\organisation-isolation.integration.spec.ts-68-  'identity.role_permissions',
apps\api\src\tenancy\organisation-isolation.integration.spec.ts-69-  // public marketplace: reached by buyers with no workshop, via withUser().
apps\api\src\tenancy\organisation-isolation.integration.spec.ts-70-  'catalogue.orders',
apps\api\src\tenancy\organisation-isolation.integration.spec.ts-71-  'catalogue.order_lines',
apps\api\src\tenancy\organisation-isolation.integration.spec.ts-72-  'catalogue.order_events',
apps\api\src\tenancy\organisation-isolation.integration.spec.ts-73-  // the public parts catalogue and supplier surface: read anonymously.
--
apps\api\src\settings\settings.service.ts-797-   */
apps\api\src\settings\settings.service.ts-798-  async listBranches(ctx: TenantContext): Promise<BranchRow[]> {
apps\api\src\settings\settings.service.ts-799-    this.assertMayReadConfig(ctx);
apps\api\src\settings\settings.service.ts-800-    return this.db.withTenant(ctx, async (client) => {
apps\api\src\settings\settings.service.ts-801-      const r = await client.query(
apps\api\src\settings\settings.service.ts-802-        `SELECT b.id, b.name, b.location, b.status,
apps\api\src\settings\settings.service.ts-803-                count(m.id) FILTER (WHERE m.status = 'active') AS member_count
apps\api\src\settings\settings.service.ts-804-           FROM identity.branches b
apps\api\src\settings\settings.service.ts:805:           LEFT JOIN identity.memberships m ON m.branch_id = b.id
apps\api\src\settings\settings.service.ts-806-          WHERE b.tenant_id = $1 AND b.organization_id = $2
apps\api\src\settings\settings.service.ts-807-          GROUP BY b.id, b.name, b.location, b.status
apps\api\src\settings\settings.service.ts-808-          ORDER BY b.name`,
apps\api\src\settings\settings.service.ts-809-        [ctx.tenantId, ctx.organizationId],
apps\api\src\settings\settings.service.ts-810-      );
apps\api\src\settings\settings.service.ts-811-      return r.rows.map((x) => ({
apps\api\src\settings\settings.service.ts-812-        id: x.id as string,
apps\api\src\settings\settings.service.ts-813-        name: x.name as string,
--
apps\api\src\settings\settings.service.ts-855-   * is inert, recorded five or more times across these two projects.
apps\api\src\settings\settings.service.ts-856-   */
apps\api\src\settings\settings.service.ts-857-  async securityPosture(ctx: TenantContext): Promise<SecurityPostureRow> {
apps\api\src\settings\settings.service.ts-858-    this.assertMayGovern(ctx);
apps\api\src\settings\settings.service.ts-859-    return this.db.withTenant(ctx, async (client) => {
apps\api\src\settings\settings.service.ts-860-      const admins = await client.query(
apps\api\src\settings\settings.service.ts-861-        `SELECT u.id, COALESCE(NULLIF(btrim(u.display_name), ''), u.email) AS display_name,
apps\api\src\settings\settings.service.ts-862-                m.role_name
apps\api\src\settings\settings.service.ts:863:           FROM identity.memberships m
apps\api\src\settings\settings.service.ts-864-           JOIN identity.users u ON u.id = m.user_id
apps\api\src\settings\settings.service.ts-865-          WHERE m.tenant_id = $1 AND m.organization_id = $2
apps\api\src\settings\settings.service.ts-866-            AND m.status = 'active'
apps\api\src\settings\settings.service.ts-867-            AND m.role_name IN ('workshop_owner', 'workshop_manager', 'platform_administrator')
apps\api\src\settings\settings.service.ts-868-          ORDER BY m.role_name, display_name`,
apps\api\src\settings\settings.service.ts-869-        [ctx.tenantId, ctx.organizationId],
apps\api\src\settings\settings.service.ts-870-      );
apps\api\src\settings\settings.service.ts-871-
--
apps\web\app\workshop\_screens\branches-screen.tsx-12-import { navLabelFor } from './nav-label';
apps\web\app\workshop\_screens\branches-screen.tsx-13-import { createBranchAction } from './settings-actions';
apps\web\app\workshop\_screens\branches-screen.tsx-14-
apps\web\app\workshop\_screens\branches-screen.tsx-15-/**
apps\web\app\workshop\_screens\branches-screen.tsx-16- * BRANCHES — slice 6.
apps\web\app\workshop\_screens\branches-screen.tsx-17- *
apps\web\app\workshop\_screens\branches-screen.tsx-18- * ⚠️ NO NEW TABLE. `identity.branches` has existed since migration 002 and is
apps\web\app\workshop\_screens\branches-screen.tsx-19- * already referenced by `repair.job_cards.branch_id` and
apps\web\app\workshop\_screens\branches-screen.tsx:20: * `identity.memberships.branch_id`; it simply had no screen. Adding a second
apps\web\app\workshop\_screens\branches-screen.tsx-21- * "sites" table would have been the duplicate-module failure the Project
apps\web\app\workshop\_screens\branches-screen.tsx-22- * Execution Directive §3 exists to stop — and worse, job cards would have kept
apps\web\app\workshop\_screens\branches-screen.tsx-23- * pointing at the old one.
apps\web\app\workshop\_screens\branches-screen.tsx-24- *
apps\web\app\workshop\_screens\branches-screen.tsx-25- * ⚠️ MOUNTED AT TWO ROUTES. The owner tree calls it
apps\web\app\workshop\_screens\branches-screen.tsx-26- * `/workshop-management/branches` and the settings group calls it
apps\web\app\workshop\_screens\branches-screen.tsx-27- * `/settings/branches`. One implementation, and `navLabelFor` reads the heading
apps\web\app\workshop\_screens\branches-screen.tsx-28- * back from whichever tree the viewer is in, so the menu and the heading agree
--
apps\api\src\security\security.controller.ts-43-    // This was written the other way first and Codex was right to reject it.
apps\api\src\security\security.controller.ts-44-    //
apps\api\src\security\security.controller.ts-45-    // That constant is the list of role names the SQL predicate in migration 025
apps\api\src\security\security.controller.ts-46-    // accepts, and it deliberately includes the literal `admin` because seed
apps\api\src\security\security.controller.ts-47-    // scripts, migrations and hand-run psql set that GUC. It is a DATABASE
apps\api\src\security\security.controller.ts-48-    // compatibility alias, not an identity.
apps\api\src\security\security.controller.ts-49-    //
apps\api\src\security\security.controller.ts-50-    // Using it here made the API strictly MORE permissive than the navigation,
apps\api\src\security\security.controller.ts:51:    // which gates on `platform.admin` — and `identity.memberships.role_name`
apps\api\src\security\security.controller.ts-52-    // has no CHECK constraint (verified: the only constraint on that table is
apps\api\src\security\security.controller.ts-53-    // on `status`), so a membership row carrying `role_name = 'admin'` is
apps\api\src\security\security.controller.ts-54-    // insertable, would pass this check, and would appear in no navigation tree.
apps\api\src\security\security.controller.ts-55-    // On an endpoint with row-level security beneath it that is survivable. This
apps\api\src\security\security.controller.ts-56-    // endpoint reads `pg_catalog`, which has no policies, so this check IS the
apps\api\src\security\security.controller.ts-57-    // enforcement and it must be the NARROWER of the two, never the wider.
apps\api\src\security\security.controller.ts-58-    //
apps\api\src\security\security.controller.ts-59-    // `permissionsForRole` returns `[]` for any name absent from
--
apps\api\src\security\security-posture.spec.ts-87-    ).audit();
apps\api\src\security\security-posture.spec.ts-88-    const c = control(posture, 'rls.enabled');
apps\api\src\security\security-posture.spec.ts-89-    expect(c.status).toBe('fail');
apps\api\src\security\security-posture.spec.ts-90-    expect(c.findings[0]).toContain('repair.job_cards');
apps\api\src\security\security-posture.spec.ts-91-  });
apps\api\src\security\security-posture.spec.ts-92-
apps\api\src\security\security-posture.spec.ts-93-  it('PASSES a table without RLS only when the exemption carries a reason', async () => {
apps\api\src\security\security-posture.spec.ts-94-    // `identity.users` is exempt and the exemption states its compensating
apps\api\src\security\security-posture.spec.ts:95:    // control: every query reaches it by joining identity.memberships.
apps\api\src\security\security-posture.spec.ts-96-    const posture = await new SecurityPostureService(
apps\api\src\security\security-posture.spec.ts-97-      healthy({ rlsEnabled: [{ table_name: 'identity.users' }] }),
apps\api\src\security\security-posture.spec.ts-98-    ).audit();
apps\api\src\security\security-posture.spec.ts-99-    const c = control(posture, 'rls.enabled');
apps\api\src\security\security-posture.spec.ts-100-    expect(c.status).toBe('pass');
apps\api\src\security\security-posture.spec.ts:101:    expect(c.findings[0]).toContain('identity.memberships');
apps\api\src\security\security-posture.spec.ts-102-  });
apps\api\src\security\security-posture.spec.ts-103-
apps\api\src\security\security-posture.spec.ts-104-  it('FAILS when RLS is enabled but not forced, because the policies are inert', async () => {
apps\api\src\security\security-posture.spec.ts-105-    const posture = await new SecurityPostureService(
apps\api\src\security\security-posture.spec.ts-106-      healthy({ rlsForced: [{ table_name: 'repair.quotations' }] }),
apps\api\src\security\security-posture.spec.ts-107-    ).audit();
apps\api\src\security\security-posture.spec.ts-108-    expect(control(posture, 'rls.forced').status).toBe('fail');
apps\api\src\security\security-posture.spec.ts-109-  });
--
apps\api\src\security\security-posture.service.ts-100- * Tables deliberately NOT under row-level security, with the compensating
apps\api\src\security\security-posture.service.ts-101- * control that makes each one safe. Same discipline as `ACCEPTED_WITHOUT_FK`:
apps\api\src\security\security-posture.service.ts-102- * the reason is mandatory, and each claim is asserted by a test elsewhere.
apps\api\src\security\security-posture.service.ts-103- */
apps\api\src\security\security-posture.service.ts-104-const ACCEPTED_WITHOUT_RLS: Record<string, string> = {
apps\api\src\security\security-posture.service.ts-105-  'identity.users':
apps\api\src\security\security-posture.service.ts-106-    'One human may hold memberships in several tenants, so a user row cannot ' +
apps\api\src\security\security-posture.service.ts-107-    'belong to any single tenant (migration 001). Compensating control: every ' +
apps\api\src\security\security-posture.service.ts:108:    'query reaches it ONLY by joining identity.memberships, which is ENABLE+FORCE. ' +
apps\api\src\security\security-posture.service.ts-109-    'Asserted by user_directory_is_scoped_by_membership, not by comment.',
apps\api\src\security\security-posture.service.ts-110-  'core.vehicle_makes':
apps\api\src\security\security-posture.service.ts-111-    'Shared reference data — the list of vehicle manufacturers is the same for ' +
apps\api\src\security\security-posture.service.ts-112-    'every tenant and contains nothing tenant-owned. Read-only to the application.',
apps\api\src\security\security-posture.service.ts-113-  'core.vehicle_models':
apps\api\src\security\security-posture.service.ts-114-    'Shared reference data, as core.vehicle_makes.',
apps\api\src\security\security-posture.service.ts-115-};
apps\api\src\security\security-posture.service.ts-116-
--
apps\api\src\reception\customer-value-chain.integration.spec.ts-26- * that shipped:
apps\api\src\reception\customer-value-chain.integration.spec.ts-27- *
apps\api\src\reception\customer-value-chain.integration.spec.ts-28- *   1. HTTP-LAYER PROOFS. They asserted the routes exist and 401 without a
apps\api\src\reception\customer-value-chain.integration.spec.ts-29- *      token. A route that answers 401 to everyone alive answers 401 correctly.
apps\api\src\reception\customer-value-chain.integration.spec.ts-30- *   2. SERVICE PROOFS AGAINST A SEEDED CUSTOMER. `customer-records.integration
apps\api\src\reception\customer-value-chain.integration.spec.ts-31- *      .spec.ts` and every sibling build their `customer` membership with a raw
apps\api\src\reception\customer-value-chain.integration.spec.ts-32- *      INSERT, the same way `scripts/seed-dev-identity.sh` does. **NO
apps\api\src\reception\customer-value-chain.integration.spec.ts-33- *      PRODUCTION CODE PATH CAN CREATE THAT ROW.** Until migration 061 the
apps\api\src\reception\customer-value-chain.integration.spec.ts:34: *      product's only two writers of `identity.memberships` were
apps\api\src\reception\customer-value-chain.integration.spec.ts-35- *      `register_workshop` (grants `workshop_owner`) and the admin-only
apps\api\src\reception\customer-value-chain.integration.spec.ts-36- *      `MembershipService.grant()`. So a real Keycloak sign-up produced an
apps\api\src\reception\customer-value-chain.integration.spec.ts-37- *      account with no membership, `TenantGuard` threw `user holds no active
apps\api\src\reception\customer-value-chain.integration.spec.ts-38- *      membership`, and the Request for Service form POSTed into a 401 —
apps\api\src\reception\customer-value-chain.integration.spec.ts-39- *      while every test in this repository stayed green against a fixture the
apps\api\src\reception\customer-value-chain.integration.spec.ts-40- *      product cannot produce.
apps\api\src\reception\customer-value-chain.integration.spec.ts-41- *
apps\api\src\reception\customer-value-chain.integration.spec.ts-42- * SO THE CUSTOMER IN THIS FILE IS ENROLLED BY `CustomerEnrolmentService.enrol()`
--
apps\api\src\reception\customer-value-chain.integration.spec.ts-312-    ).rows[0]!.id;
apps\api\src\reception\customer-value-chain.integration.spec.ts-313-
apps\api\src\reception\customer-value-chain.integration.spec.ts-314-  receptionUserId = await mkUser('cvc-reception', `cvc-reception-${tag}@example.test`, 'Rita Reception');
apps\api\src\reception\customer-value-chain.integration.spec.ts-315-  ownerUserId = await mkUser('cvc-owner', `cvc-owner-${tag}@example.test`, 'Otto Owner');
apps\api\src\reception\customer-value-chain.integration.spec.ts-316-  technicianUserId = await mkUser('cvc-tech', `cvc-tech-${tag}@example.test`, 'Tina Technician');
apps\api\src\reception\customer-value-chain.integration.spec.ts-317-
apps\api\src\reception\customer-value-chain.integration.spec.ts-318-  const grant = async (userId: string, role: string) =>
apps\api\src\reception\customer-value-chain.integration.spec.ts-319-    c.query(
apps\api\src\reception\customer-value-chain.integration.spec.ts:320:      `INSERT INTO identity.memberships
apps\api\src\reception\customer-value-chain.integration.spec.ts-321-         (tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
apps\api\src\reception\customer-value-chain.integration.spec.ts-322-       VALUES ($1,$2,$3,$4,$5,'active',$4)`,
apps\api\src\reception\customer-value-chain.integration.spec.ts-323-      [tenantId, orgId, branchId, userId, role],
apps\api\src\reception\customer-value-chain.integration.spec.ts-324-    );
apps\api\src\reception\customer-value-chain.integration.spec.ts-325-  await grant(receptionUserId, 'reception_staff');
apps\api\src\reception\customer-value-chain.integration.spec.ts-326-  await grant(ownerUserId, 'workshop_owner');
apps\api\src\reception\customer-value-chain.integration.spec.ts-327-  await grant(technicianUserId, 'technician');
apps\api\src\reception\customer-value-chain.integration.spec.ts-328-
--
apps\api\src\reception\customer-value-chain.integration.spec.ts-461-  dbIt('step 1 — BOTH halves landed: a `customer` membership AND a linked customer record', async () => {
apps\api\src\reception\customer-value-chain.integration.spec.ts-462-    // Read back independently of the return value, under the APP role. The
apps\api\src\reception\customer-value-chain.integration.spec.ts-463-    // question is what is IN the database for a caller RLS applies to, not what
apps\api\src\reception\customer-value-chain.integration.spec.ts-464-    // the method said.
apps\api\src\reception\customer-value-chain.integration.spec.ts-465-    const ctx = ctxFor(userA, 'customer');
apps\api\src\reception\customer-value-chain.integration.spec.ts-466-
apps\api\src\reception\customer-value-chain.integration.spec.ts-467-    const m = await asApp<{ role_name: string; status: string }>(
apps\api\src\reception\customer-value-chain.integration.spec.ts-468-      ctx,
apps\api\src\reception\customer-value-chain.integration.spec.ts:469:      `SELECT role_name, status FROM identity.memberships
apps\api\src\reception\customer-value-chain.integration.spec.ts-470-        WHERE user_id = $1 AND organization_id = $2`,
apps\api\src\reception\customer-value-chain.integration.spec.ts-471-      [userA, orgId],
apps\api\src\reception\customer-value-chain.integration.spec.ts-472-    );
apps\api\src\reception\customer-value-chain.integration.spec.ts-473-    expect(m).toHaveLength(1);
apps\api\src\reception\customer-value-chain.integration.spec.ts-474-    expect(m[0]!.role_name).toBe('customer');
apps\api\src\reception\customer-value-chain.integration.spec.ts-475-    expect(m[0]!.status).toBe('active');
apps\api\src\reception\customer-value-chain.integration.spec.ts-476-
apps\api\src\reception\customer-value-chain.integration.spec.ts-477-    // 🔴 THE HALF NOTHING IN THE PRODUCT HAD EVER WRITTEN. Every customer-scoped
--
apps\api\src\notifications\notifications.service.ts-308-   * ungated-read defects — so an "all members" query would email the workshop's
apps\api\src\notifications\notifications.service.ts-309-   * intake to the customers who filed them.
apps\api\src\notifications\notifications.service.ts-310-   */
apps\api\src\notifications\notifications.service.ts-311-  /**
apps\api\src\notifications\notifications.service.ts-312-   * Tell the workshop's staff. Returns how many notifications were written.
apps\api\src\notifications\notifications.service.ts-313-   *
apps\api\src\notifications\notifications.service.ts-314-   * 🔴 THE RECIPIENTS ARE RESOLVED IN THE DATABASE, not here.
apps\api\src\notifications\notifications.service.ts-315-   *
apps\api\src\notifications\notifications.service.ts:316:   * ⚠️ CORRECTED 2026-08-07: this comment used to claim `identity.memberships`
apps\api\src\notifications\notifications.service.ts-317-   * "restricts a caller to their own rows (migration 039)". IT DOES NOT. The
apps\api\src\notifications\notifications.service.ts-318-   * base policy is `tenant_isolation` from migration 001 — TENANT-scoped, not
apps\api\src\notifications\notifications.service.ts-319-   * user-scoped — and 039 added a NARROWER ADDITIONAL door for the subject
apps\api\src\notifications\notifications.service.ts-320-   * lookup without restricting it. The Supervisor caught the false premise, and
apps\api\src\notifications\notifications.service.ts-321-   * this repository has a standing lesson about a comment that asserts a rule
apps\api\src\notifications\notifications.service.ts-322-   * which does not exist.
apps\api\src\notifications\notifications.service.ts-323-   *
apps\api\src\notifications\notifications.service.ts-324-   * The design is still right, for the reason that survives: a customer's
--
apps\api\src\knowledge\knowledge.service.ts-413-    },
apps\api\src\knowledge\knowledge.service.ts-414-  ): Promise<CertificationRow[]> {
apps\api\src\knowledge\knowledge.service.ts-415-    this.assertMayWrite(ctx);
apps\api\src\knowledge\knowledge.service.ts-416-    await this.db.withTenant(ctx, async (client) => {
apps\api\src\knowledge\knowledge.service.ts-417-      // The holder must be a member of THIS workshop. Recording a
apps\api\src\knowledge\knowledge.service.ts-418-      // certification against somebody else's staff would be nonsense, and the
apps\api\src\knowledge\knowledge.service.ts-419-      // FK alone would allow it — `identity.users` is not organisation-scoped.
apps\api\src\knowledge\knowledge.service.ts-420-      const member = await client.query(
apps\api\src\knowledge\knowledge.service.ts:421:        `SELECT 1 FROM identity.memberships
apps\api\src\knowledge\knowledge.service.ts-422-          WHERE tenant_id = $1 AND organization_id = $2 AND user_id = $3
apps\api\src\knowledge\knowledge.service.ts-423-            AND status = 'active' LIMIT 1`,
apps\api\src\knowledge\knowledge.service.ts-424-        [ctx.tenantId, ctx.organizationId, input.userId],
apps\api\src\knowledge\knowledge.service.ts-425-      );
apps\api\src\knowledge\knowledge.service.ts-426-      if (!member.rowCount) {
apps\api\src\knowledge\knowledge.service.ts-427-        throw new ForbiddenException(
apps\api\src\knowledge\knowledge.service.ts-428-          'That person is not an active member of this workshop, so a certification cannot be recorded against them. ' +
apps\api\src\knowledge\knowledge.service.ts-429-            'Add them under Staff and Roles first.',
--
apps\api\src\repair\job-card.service.ts-165-/**
apps\api\src\repair\job-card.service.ts-166- * ⚠️ ONE DEFINITION OF "may this person be given a job", used by BOTH the
apps\api\src\repair\job-card.service.ts-167- * create path and the reassign path below.
apps\api\src\repair\job-card.service.ts-168- *
apps\api\src\repair\job-card.service.ts-169- * Two copies would drift, and the drift would be silent: a card assigned to
apps\api\src\repair\job-card.service.ts-170- * somebody who is not a technician appears on NO technician's "My Assigned
apps\api\src\repair\job-card.service.ts-171- * Work", so the job does not fail loudly — it simply never gets picked up.
apps\api\src\repair\job-card.service.ts-172- */
apps\api\src\repair\job-card.service.ts:173:const ACTIVE_TECHNICIAN_SQL = `SELECT 1 FROM identity.memberships
apps\api\src\repair\job-card.service.ts-174-            WHERE user_id = $1 AND organization_id = $2
apps\api\src\repair\job-card.service.ts-175-              AND status = 'active' AND role_name = 'technician'`;
apps\api\src\repair\job-card.service.ts-176-
apps\api\src\repair\job-card.service.ts-177-@Injectable()
apps\api\src\repair\job-card.service.ts-178-export class JobCardService {
apps\api\src\repair\job-card.service.ts-179-  constructor(
apps\api\src\repair\job-card.service.ts-180-    private readonly db: DatabaseService,
apps\api\src\repair\job-card.service.ts-181-    private readonly audit: AuditService,
--
apps\api\src\identity\user.service.ts-30- *
apps\api\src\identity\user.service.ts-31- * The consequence is sharp, and it is the opposite of everywhere else in this
apps\api\src\identity\user.service.ts-32- * codebase: **RLS will not save you here.** A plain
apps\api\src\identity\user.service.ts-33- * `SELECT * FROM identity.users` inside `withTenant` returns every user on the
apps\api\src\identity\user.service.ts-34- * platform, across every tenant, and no policy stops it. It will look correct
apps\api\src\identity\user.service.ts-35- * in review, pass typecheck, and leak the entire user base.
apps\api\src\identity\user.service.ts-36- *
apps\api\src\identity\user.service.ts-37- * Every query below therefore reaches users ONLY through
apps\api\src\identity\user.service.ts:38: * `identity.memberships`, which IS under `ENABLE` + `FORCE ROW LEVEL SECURITY`.
apps\api\src\identity\user.service.ts-39- * The join is what scopes the result: rows survive only for users who hold a
apps\api\src\identity\user.service.ts-40- * membership visible to the current tenant. `user_directory_is_scoped_by_
apps\api\src\identity\user.service.ts-41- * membership` in the spec file asserts this property, because a comment does
apps\api\src\identity\user.service.ts-42- * not stop anyone.
apps\api\src\identity\user.service.ts-43- *
apps\api\src\identity\user.service.ts-44- * This also matches the authority model in PLAN_EXTENSION_v1 §2.1 — authority
apps\api\src\identity\user.service.ts-45- * derives from membership, never from the user record itself.
apps\api\src\identity\user.service.ts-46- */
--
apps\api\src\identity\user.service.ts-94-      const res = await client.query(
apps\api\src\identity\user.service.ts-95-        `SELECT u.id,
apps\api\src\identity\user.service.ts-96-                u.email,
apps\api\src\identity\user.service.ts-97-                u.display_name,
apps\api\src\identity\user.service.ts-98-                u.phone,
apps\api\src\identity\user.service.ts-99-                u.preferred_locale,
apps\api\src\identity\user.service.ts-100-                u.status,
apps\api\src\identity\user.service.ts-101-                array_agg(m.role_name ORDER BY m.role_name) AS roles
apps\api\src\identity\user.service.ts:102:           FROM identity.memberships m
apps\api\src\identity\user.service.ts-103-           JOIN identity.users u ON u.id = m.user_id
apps\api\src\identity\user.service.ts-104-          WHERE m.status = 'active'
apps\api\src\identity\user.service.ts-105-            AND m.tenant_id = $1
apps\api\src\identity\user.service.ts-106-            AND ($2::uuid IS NULL OR m.organization_id = $2::uuid)
apps\api\src\identity\user.service.ts-107-          GROUP BY u.id, u.email, u.display_name, u.phone, u.preferred_locale, u.status
apps\api\src\identity\user.service.ts-108-          ORDER BY u.display_name`,
apps\api\src\identity\user.service.ts-109-        [ctx.tenantId, orgScoped ? ctx.organizationId : null],
apps\api\src\identity\user.service.ts-110-      );
--
apps\api\src\identity\user.service.ts-132-      const res = await client.query(
apps\api\src\identity\user.service.ts-133-        `SELECT u.id,
apps\api\src\identity\user.service.ts-134-                u.email,
apps\api\src\identity\user.service.ts-135-                u.display_name,
apps\api\src\identity\user.service.ts-136-                u.phone,
apps\api\src\identity\user.service.ts-137-                u.preferred_locale,
apps\api\src\identity\user.service.ts-138-                u.status,
apps\api\src\identity\user.service.ts-139-                array_agg(m.role_name ORDER BY m.role_name) AS roles
apps\api\src\identity\user.service.ts:140:           FROM identity.memberships m
apps\api\src\identity\user.service.ts-141-           JOIN identity.users u ON u.id = m.user_id
apps\api\src\identity\user.service.ts-142-          WHERE u.id = $1
apps\api\src\identity\user.service.ts-143-            AND m.status = 'active'
apps\api\src\identity\user.service.ts-144-            AND m.tenant_id = $2
apps\api\src\identity\user.service.ts-145-          GROUP BY u.id, u.email, u.display_name, u.phone, u.preferred_locale, u.status`,
apps\api\src\identity\user.service.ts-146-        [id, ctx.tenantId],
apps\api\src\identity\user.service.ts-147-      );
apps\api\src\identity\user.service.ts-148-      const row = res.rows[0];
--
apps\api\src\identity\org-admin-access.spec.ts-143-   * is in this tenant. Codex found it on the staff screens, whose hidden field
apps\api\src\identity\org-admin-access.spec.ts-144-   * is exactly the forgeable input.
apps\api\src\identity\org-admin-access.spec.ts-145-   */
apps\api\src\identity\org-admin-access.spec.ts-146-  it('scopes withdrawal to the caller organisation unless they act as platform admin', () => {
apps\api\src\identity\org-admin-access.spec.ts-147-    const text = source('membership.service.ts');
apps\api\src\identity\org-admin-access.spec.ts-148-
apps\api\src\identity\org-admin-access.spec.ts-149-    // 🔴 ANCHORED ON `async withdraw(`, NOT ON THE FIRST `UPDATE`.
apps\api\src\identity\org-admin-access.spec.ts-150-    //
apps\api\src\identity\org-admin-access.spec.ts:151:    // The first version sliced from `indexOf('UPDATE identity.memberships')`,
apps\api\src\identity\org-admin-access.spec.ts-152-    // which finds the REINSTATE update inside `grant()` — a different statement
apps\api\src\identity\org-admin-access.spec.ts-153-    // entirely — and ran to end of file. So it would have passed if the
apps\api\src\identity\org-admin-access.spec.ts-154-    // organisation predicate were moved to `grant()` and DELETED from
apps\api\src\identity\org-admin-access.spec.ts-155-    // `withdraw()`: a regression net that did not cover the statement it names.
apps\api\src\identity\org-admin-access.spec.ts-156-    // My own test had the defect it was written to catch. (Supervisor.)
apps\api\src\identity\org-admin-access.spec.ts-157-    const start = text.indexOf('async withdraw(');
apps\api\src\identity\org-admin-access.spec.ts-158-    expect(start, 'withdraw() not found — this test is anchored on it').toBeGreaterThan(-1);
apps\api\src\identity\org-admin-access.spec.ts-159-    const withdrawBody = text.slice(start);
--
apps\api\src\identity\membership.service.ts-194-  // role into an organisation type called `constructor`.
apps\api\src\identity\membership.service.ts-195-  if (!Object.hasOwn(ROLES_BY_ORG_TYPE, orgType)) return false;
apps\api\src\identity\membership.service.ts-196-  return ROLES_BY_ORG_TYPE[orgType]!.includes(roleName);
apps\api\src\identity\membership.service.ts-197-}
apps\api\src\identity\membership.service.ts-198-
apps\api\src\identity\membership.service.ts-199-/**
apps\api\src\identity\membership.service.ts-200- * Membership domain service — T-0003.
apps\api\src\identity\membership.service.ts-201- *
apps\api\src\identity\membership.service.ts:202: * `identity.memberships` is tenant-scoped and under `ENABLE` + `FORCE ROW LEVEL
apps\api\src\identity\membership.service.ts-203- * SECURITY`, so cross-tenant reads fail closed at the database. The rules that
apps\api\src\identity\membership.service.ts-204- * RLS cannot express — who may grant, which roles exist, and that nobody may
apps\api\src\identity\membership.service.ts-205- * quietly widen their own access — live here.
apps\api\src\identity\membership.service.ts-206- */
apps\api\src\identity\membership.service.ts-207-@Injectable()
apps\api\src\identity\membership.service.ts-208-export class MembershipService {
apps\api\src\identity\membership.service.ts-209-  constructor(
apps\api\src\identity\membership.service.ts-210-    private readonly db: DatabaseService,
--
apps\api\src\identity\membership.service.ts-246-        where.push(`user_id = $${values.length}`);
apps\api\src\identity\membership.service.ts-247-      }
apps\api\src\identity\membership.service.ts-248-      if (filter.organizationId) {
apps\api\src\identity\membership.service.ts-249-        values.push(filter.organizationId);
apps\api\src\identity\membership.service.ts-250-        where.push(`organization_id = $${values.length}`);
apps\api\src\identity\membership.service.ts-251-      }
apps\api\src\identity\membership.service.ts-252-      const res = await client.query(
apps\api\src\identity\membership.service.ts-253-        `SELECT id, organization_id, branch_id, user_id, role_name, status, created_at
apps\api\src\identity\membership.service.ts:254:           FROM identity.memberships
apps\api\src\identity\membership.service.ts-255-          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
apps\api\src\identity\membership.service.ts-256-          ORDER BY created_at`,
apps\api\src\identity\membership.service.ts-257-        values,
apps\api\src\identity\membership.service.ts-258-      );
apps\api\src\identity\membership.service.ts-259-      return res.rows.map(this.toDomain);
apps\api\src\identity\membership.service.ts-260-    });
apps\api\src\identity\membership.service.ts-261-  }
apps\api\src\identity\membership.service.ts-262-
--
apps\api\src\identity\membership.service.ts-424-          `SELECT 1 FROM identity.branches
apps\api\src\identity\membership.service.ts-425-              WHERE id = $1 AND organization_id = $2 AND tenant_id = $3`,
apps\api\src\identity\membership.service.ts-426-          [input.branchId, input.organizationId, ctx.tenantId],
apps\api\src\identity\membership.service.ts-427-        );
apps\api\src\identity\membership.service.ts-428-        if (branch.rows.length === 0) throw new NotFoundException('branch not found');
apps\api\src\identity\membership.service.ts-429-      }
apps\api\src\identity\membership.service.ts-430-
apps\api\src\identity\membership.service.ts-431-      const res = await client.query(
apps\api\src\identity\membership.service.ts:432:        `INSERT INTO identity.memberships
apps\api\src\identity\membership.service.ts-433-           (tenant_id, organization_id, branch_id, user_id, role_name, created_by)
apps\api\src\identity\membership.service.ts-434-         VALUES ($1, $2, $3, $4, $5, $6)
apps\api\src\identity\membership.service.ts-435-         ON CONFLICT (organization_id, user_id, role_name) DO NOTHING
apps\api\src\identity\membership.service.ts-436-         RETURNING id, organization_id, branch_id, user_id, role_name, status, created_at`,
apps\api\src\identity\membership.service.ts-437-        [
apps\api\src\identity\membership.service.ts-438-          // From the resolved context, never the request body. RLS `WITH CHECK`
apps\api\src\identity\membership.service.ts-439-          // would reject a mismatch anyway — both layers, by design.
apps\api\src\identity\membership.service.ts-440-          ctx.tenantId,
--
apps\api\src\identity\membership.service.ts-456-        // answerable. But the row still occupies the unique key, so re-hiring
apps\api\src\identity\membership.service.ts-457-        // somebody previously removed hit `ON CONFLICT DO NOTHING` and was
apps\api\src\identity\membership.service.ts-458-        // refused with "membership already exists" — a message that is the
apps\api\src\identity\membership.service.ts-459-        // OPPOSITE of the truth, told to an owner looking at a colleague who
apps\api\src\identity\membership.service.ts-460-        // demonstrably has no access, with nothing anywhere to undo it.
apps\api\src\identity\membership.service.ts-461-        //
apps\api\src\identity\membership.service.ts-462-        // A rule whose escape hatch is unreachable is a wall, not a rule.
apps\api\src\identity\membership.service.ts-463-        const existing = await client.query(
apps\api\src\identity\membership.service.ts:464:          `UPDATE identity.memberships
apps\api\src\identity\membership.service.ts-465-              -- 🔴 THE BRANCH IS RE-SET, NOT INHERITED. The unique key is
apps\api\src\identity\membership.service.ts-466-              -- (organization_id, user_id, role_name) and does NOT include the
apps\api\src\identity\membership.service.ts-467-              -- branch, so re-hiring the same person into the same role at a
apps\api\src\identity\membership.service.ts-468-              -- DIFFERENT site matched the old row and would have reactivated
apps\api\src\identity\membership.service.ts-469-              -- it with the OLD branch_id — quietly granting access to a site
apps\api\src\identity\membership.service.ts-470-              -- nobody approved, which is exactly what §50's "approved role AND
apps\api\src\identity\membership.service.ts-471-              -- branch" forbids. The branchId parameter has already been
apps\api\src\identity\membership.service.ts-472-              -- validated against this organization above.
--
apps\api\src\identity\membership.service.ts-592-      // administrator. The next request fails in `resolveTenantContext` with
apps\api\src\identity\membership.service.ts-593-      // "user holds no active membership", and recovery needs a
apps\api\src\identity\membership.service.ts-594-      // `platform_administrator` — a role this repository has recorded as
apps\api\src\identity\membership.service.ts-595-      // having no production write path.
apps\api\src\identity\membership.service.ts-596-      //
apps\api\src\identity\membership.service.ts-597-      // `grant()` already refuses to let a caller widen their own access. This
apps\api\src\identity\membership.service.ts-598-      // is the symmetric refusal, and it was missing. (Supervisor, 2026-08-17.)
apps\api\src\identity\membership.service.ts-599-      const res = await client.query(
apps\api\src\identity\membership.service.ts:600:        `UPDATE identity.memberships
apps\api\src\identity\membership.service.ts-601-            SET status = $2, updated_at = now(), updated_by = $3
apps\api\src\identity\membership.service.ts-602-          WHERE id = $1
apps\api\src\identity\membership.service.ts-603-            AND status = 'active'
apps\api\src\identity\membership.service.ts-604-            AND tenant_id = $4
apps\api\src\identity\membership.service.ts-605-            AND ($5::uuid IS NULL OR organization_id = $5::uuid)
apps\api\src\identity\membership.service.ts-606-            AND ($6::uuid IS NULL OR user_id <> $6::uuid)
apps\api\src\identity\membership.service.ts-607-        RETURNING id, organization_id, branch_id, user_id, role_name, status, created_at`,
apps\api\src\identity\membership.service.ts-608-        [
--
apps\api\src\identity\membership.service.ts-620-      if (!row) {
apps\api\src\identity\membership.service.ts-621-        // ⚠️ THE SELF-WITHDRAWAL CASE GETS ITS OWN MESSAGE, and that leaks
apps\api\src\identity\membership.service.ts-622-        // nothing: you already know your own membership id. A refusal must name
apps\api\src\identity\membership.service.ts-623-        // a reachable alternative — the most expensive defect class recorded
apps\api\src\identity\membership.service.ts-624-        // here — and "not found" would send an administrator hunting for a row
apps\api\src\identity\membership.service.ts-625-        // they are looking straight at.
apps\api\src\identity\membership.service.ts-626-        if (!isActingAsPlatformAdmin(ctx)) {
apps\api\src\identity\membership.service.ts-627-          const self = await client.query<{ id: string }>(
apps\api\src\identity\membership.service.ts:628:            `SELECT id FROM identity.memberships
apps\api\src\identity\membership.service.ts-629-              WHERE id = $1 AND tenant_id = $2 AND user_id = $3 AND status = 'active'`,
apps\api\src\identity\membership.service.ts-630-            [id, ctx.tenantId, ctx.userId],
apps\api\src\identity\membership.service.ts-631-          );
apps\api\src\identity\membership.service.ts-632-          if (self.rows.length > 0) {
apps\api\src\identity\membership.service.ts-633-            throw new BadRequestException(
apps\api\src\identity\membership.service.ts-634-              'You cannot withdraw your own access. If you are leaving, appoint ' +
apps\api\src\identity\membership.service.ts-635-                'another administrator first and ask them to remove you — an ' +
apps\api\src\identity\membership.service.ts-636-                'organisation whose last administrator removes themselves cannot ' +
--
apps\api\src\identity\membership.repository.ts-8- * This runs WITHOUT a tenant context on purpose: it is the query that
apps\api\src\identity\membership.repository.ts-9- * *establishes* which tenants a user belongs to, so it cannot itself be scoped
apps\api\src\identity\membership.repository.ts-10- * to one. It is therefore keyed strictly on the Keycloak subject taken from a
apps\api\src\identity\membership.repository.ts-11- * validated token signature, and returns nothing else.
apps\api\src\identity\membership.repository.ts-12- *
apps\api\src\identity\membership.repository.ts-13- * This is the one place a tenant boundary is crossed, which is exactly why it
apps\api\src\identity\membership.repository.ts-14- * is small, parameterised, and does not accept a tenant id from anywhere.
apps\api\src\identity\membership.repository.ts-15- *
apps\api\src\identity\membership.repository.ts:16: * IT MUST GO THROUGH `identity.memberships_for_subject()` (migration 003), NOT
apps\api\src\identity\membership.repository.ts:17: * a plain SELECT. `identity.memberships` is under ENABLE + FORCE RLS, and with
apps\api\src\identity\membership.repository.ts-18- * no tenant context its policy evaluates `tenant_id = NULL`, which hides every
apps\api\src\identity\membership.repository.ts-19- * row. Measured on the live database as `autoworkshop_app`: 1 membership
apps\api\src\identity\membership.repository.ts-20- * present, 0 visible, and the bootstrap query returning the user with a NULL
apps\api\src\identity\membership.repository.ts-21- * tenant. That returned an empty membership list for every user alive —
apps\api\src\identity\membership.repository.ts-22- * authorization failing closed for everyone, with the whole test suite green.
apps\api\src\identity\membership.repository.ts-23- *
apps\api\src\identity\membership.repository.ts-24- * The SECURITY DEFINER function is the tenant-boundary crossing, and it is
apps\api\src\identity\membership.repository.ts-25- * about ten auditable lines. Reverting to a direct query reintroduces the
--
apps\api\src\identity\membership.repository.ts-54-      branch_id: string | null;
apps\api\src\identity\membership.repository.ts-55-      role_name: string;
apps\api\src\identity\membership.repository.ts-56-      status: 'active' | 'suspended' | 'revoked';
apps\api\src\identity\membership.repository.ts-57-    }>(
apps\api\src\identity\membership.repository.ts-58-      /*
apps\api\src\identity\membership.repository.ts-59-       * 🔴 NO JOIN. `display_name` is returned by the function itself since
apps\api\src\identity\membership.repository.ts-60-       * migration 039.
apps\api\src\identity\membership.repository.ts-61-       *
apps\api\src\identity\membership.repository.ts:62:       * This used to be `FROM identity.memberships_for_subject($1) m JOIN
apps\api\src\identity\membership.repository.ts-63-       * identity.users u ON u.id = m.user_id`, with a comment saying the join
apps\api\src\identity\membership.repository.ts-64-       * "costs nothing" because the function already joins that table. It was
apps\api\src\identity\membership.repository.ts-65-       * free only because `identity.users` happens to carry no RLS — which is
apps\api\src\identity\membership.repository.ts-66-       * true today and is not a property anything guarantees. A SECURITY
apps\api\src\identity\membership.repository.ts-67-       * DEFINER function's exemption does NOT extend to a join written outside
apps\api\src\identity\membership.repository.ts-68-       * it: that join runs as the caller.
apps\api\src\identity\membership.repository.ts-69-       *
apps\api\src\identity\membership.repository.ts-70-       * ⚠️ AND IT IS STILL A LEFT JOIN INSIDE THE FUNCTION, which is the shape
--
apps\api\src\identity\membership.repository.ts-72-       * row with NULL membership columns, indistinguishable from a user who
apps\api\src\identity\membership.repository.ts-73-       * genuinely has none — so `rows.filter(tenant_id !== null)` reported
apps\api\src\identity\membership.repository.ts-74-       * "no workshop" to somebody who had just created one. 039 makes the
apps\api\src\identity\membership.repository.ts-75-       * lookup able to read those rows; the filter below is still correct for
apps\api\src\identity\membership.repository.ts-76-       * a genuinely new user, which is the case it was written for.
apps\api\src\identity\membership.repository.ts-77-       */
apps\api\src\identity\membership.repository.ts-78-      `SELECT m.user_id, m.display_name, m.tenant_id, m.organization_id,
apps\api\src\identity\membership.repository.ts-79-              m.branch_id, m.role_name, m.status
apps\api\src\identity\membership.repository.ts:80:         FROM identity.memberships_for_subject($1) m`,
apps\api\src\identity\membership.repository.ts-81-      [subject],
apps\api\src\identity\membership.repository.ts-82-    );
apps\api\src\identity\membership.repository.ts-83-
apps\api\src\identity\membership.repository.ts-84-    if (rows.length === 0) return null;
apps\api\src\identity\membership.repository.ts-85-
apps\api\src\identity\membership.repository.ts-86-    const userId = rows[0]!.user_id;
apps\api\src\identity\membership.repository.ts-87-    const memberships = rows
apps\api\src\identity\membership.repository.ts-88-      .filter((r) => r.tenant_id !== null)
--
apps\api\src\identity\membership.repository.ts-288-      membershipId: row.membership_id,
apps\api\src\identity\membership.repository.ts-289-    };
apps\api\src\identity\membership.repository.ts-290-  }
apps\api\src\identity\membership.repository.ts-291-
apps\api\src\identity\membership.repository.ts-292-  /**
apps\api\src\identity\membership.repository.ts-293-   * REGISTRATION — an identity becomes a PARTS SUPPLIER (migration 068).
apps\api\src\identity\membership.repository.ts-294-   *
apps\api\src\identity\membership.repository.ts-295-   * 🔴 THE SAME DEFECT THE CUSTOMER ROLE HAD, FOUND BEFORE IT SHIPPED. A grep
apps\api\src\identity\membership.repository.ts:296:   * for writers of `identity.memberships` returned exactly two —
apps\api\src\identity\membership.repository.ts-297-   * `register_workshop` (always `workshop_owner`) and the admin-only
apps\api\src\identity\membership.repository.ts-298-   * `MembershipService.grant()` — so NO production code path could create a
apps\api\src\identity\membership.repository.ts-299-   * `supplier_owner`, even though the role appears in `ROLE_PRECEDENCE`, the
apps\api\src\identity\membership.repository.ts-300-   * permission matrix, the supplier navigation tree and the `supplier-web` app.
apps\api\src\identity\membership.repository.ts-301-   * A "Register as parts supplier" button without this would have produced an
apps\api\src\identity\membership.repository.ts-302-   * account that signs in and is then refused by every supplier route.
apps\api\src\identity\membership.repository.ts-303-   *
apps\api\src\identity\membership.repository.ts-304-   * ⚠️ SAME RULES AS `registerWorkshop`, for the same reasons: the caller is
--
apps\api\src\identity\membership.repository.ts-487-  }
apps\api\src\identity\membership.repository.ts-488-
apps\api\src\identity\membership.repository.ts-489-  /**
apps\api\src\identity\membership.repository.ts-490-   * ENROLMENT — an identity becomes a CUSTOMER of a workshop that publishes
apps\api\src\identity\membership.repository.ts-491-   * itself (migration 061).
apps\api\src\identity\membership.repository.ts-492-   *
apps\api\src\identity\membership.repository.ts-493-   * 🔴 THE DEFECT THIS EXISTS FOR: until 061, `registerWorkshop` above and the
apps\api\src\identity\membership.repository.ts-494-   * admin-only `MembershipService.grant()` were the ONLY two writers of
apps\api\src\identity\membership.repository.ts:495:   * `identity.memberships` in the product, and neither produces a `customer`.
apps\api\src\identity\membership.repository.ts-496-   * So on production the customer role could not exist, and every customer
apps\api\src\identity\membership.repository.ts-497-   * route — which all sit behind `TenantGuard` — answered 401 to a person who
apps\api\src\identity\membership.repository.ts-498-   * had just signed in successfully. It survived every test because
apps\api\src\identity\membership.repository.ts-499-   * `scripts/seed-dev-identity.sh` INSERTs the membership with raw SQL, so
apps\api\src\identity\membership.repository.ts-500-   * locally the role always existed.
apps\api\src\identity\membership.repository.ts-501-   *
apps\api\src\identity\membership.repository.ts-502-   * ⚠️ Same rules as `registerWorkshop`: the caller is the token SUBJECT, never
apps\api\src\identity\membership.repository.ts-503-   * a user id from a body, and the ROLE is not a parameter here or in the
--
apps\api\src\identity\membership-role-fit.spec.ts-173-  });
apps\api\src\identity\membership-role-fit.spec.ts-174-
apps\api\src\identity\membership-role-fit.spec.ts-175-  it('grant() actually calls the check, and refuses before inserting', () => {
apps\api\src\identity\membership-role-fit.spec.ts-176-    // 🔴 THE ASSERTION THAT MATTERS MOST. A perfect map that nothing consults
apps\api\src\identity\membership-role-fit.spec.ts-177-    // is the "config reads correct while the mechanism is INERT" defect this
apps\api\src\identity\membership-role-fit.spec.ts-178-    // repository has recorded five or more times. The call must exist, and it
apps\api\src\identity\membership-role-fit.spec.ts-179-    // must sit BEFORE the INSERT.
apps\api\src\identity\membership-role-fit.spec.ts-180-    const callIndex = source.indexOf('roleSuitsOrganisation(input.roleName, orgType)');
apps\api\src\identity\membership-role-fit.spec.ts:181:    const insertIndex = source.indexOf('INSERT INTO identity.memberships');
apps\api\src\identity\membership-role-fit.spec.ts-182-    expect(callIndex, 'grant() never calls roleSuitsOrganisation').toBeGreaterThan(-1);
apps\api\src\identity\membership-role-fit.spec.ts-183-    expect(insertIndex).toBeGreaterThan(-1);
apps\api\src\identity\membership-role-fit.spec.ts-184-    expect(
apps\api\src\identity\membership-role-fit.spec.ts-185-      callIndex,
apps\api\src\identity\membership-role-fit.spec.ts-186-      'the fit check runs AFTER the insert, so it refuses nothing',
apps\api\src\identity\membership-role-fit.spec.ts-187-    ).toBeLessThan(insertIndex);
apps\api\src\identity\membership-role-fit.spec.ts-188-  });
apps\api\src\identity\membership-role-fit.spec.ts-189-});
--
apps\api\src\identity\me.service.ts-50-
apps\api\src\identity\me.service.ts-51-  async describe(ctx: TenantContext): Promise<Viewer> {
apps\api\src\identity\me.service.ts-52-    return this.db.withTenant(ctx, async (client) => {
apps\api\src\identity\me.service.ts-53-      // The profile, reached THROUGH memberships rather than from
apps\api\src\identity\me.service.ts-54-      // `identity.users` directly — that table has no RLS, so a bare select
apps\api\src\identity\me.service.ts-55-      // would cross tenants. Same rule as `UserService`; see its header.
apps\api\src\identity\me.service.ts-56-      const profile = await client.query(
apps\api\src\identity\me.service.ts-57-        `SELECT u.id, u.display_name, u.email
apps\api\src\identity\me.service.ts:58:           FROM identity.memberships m
apps\api\src\identity\me.service.ts-59-           JOIN identity.users u ON u.id = m.user_id
apps\api\src\identity\me.service.ts-60-          WHERE u.id = $1
apps\api\src\identity\me.service.ts-61-            AND m.tenant_id = $2
apps\api\src\identity\me.service.ts-62-          LIMIT 1`,
apps\api\src\identity\me.service.ts-63-        [ctx.userId, ctx.tenantId],
apps\api\src\identity\me.service.ts-64-      );
apps\api\src\identity\me.service.ts-65-
apps\api\src\identity\me.service.ts-66-      // Memberships visible in the ACTIVE tenant, with the names the switchers
--
apps\api\src\identity\me.service.ts-68-      // other tenants are deliberately not listed here, because switching
apps\api\src\identity\me.service.ts-69-      // tenant is a re-authentication concern, not a dropdown.
apps\api\src\identity\me.service.ts-70-      const memberships = await client.query(
apps\api\src\identity\me.service.ts-71-        `SELECT m.organization_id,
apps\api\src\identity\me.service.ts-72-                o.name        AS organization_name,
apps\api\src\identity\me.service.ts-73-                m.branch_id,
apps\api\src\identity\me.service.ts-74-                b.name        AS branch_name,
apps\api\src\identity\me.service.ts-75-                m.role_name
apps\api\src\identity\me.service.ts:76:           FROM identity.memberships m
apps\api\src\identity\me.service.ts-77-           JOIN identity.organizations o ON o.id = m.organization_id
apps\api\src\identity\me.service.ts-78-      LEFT JOIN identity.branches b      ON b.id = m.branch_id
apps\api\src\identity\me.service.ts-79-          WHERE m.user_id = $1
apps\api\src\identity\me.service.ts-80-            AND m.status = 'active'
apps\api\src\identity\me.service.ts-81-            AND m.tenant_id = $2
apps\api\src\identity\me.service.ts-82-          ORDER BY o.name, b.name NULLS FIRST`,
apps\api\src\identity\me.service.ts-83-        [ctx.userId, ctx.tenantId],
apps\api\src\identity\me.service.ts-84-      );
--
apps\api\src\identity\identity.spec.ts-159-   * `identity.users` has no `tenant_id` and no row-level security — migration
apps\api\src\identity\identity.spec.ts-160-   * 001 says so explicitly, because one human may belong to several tenants. So
apps\api\src\identity\identity.spec.ts-161-   * unlike every other table in this schema, a query starting `FROM
apps\api\src\identity\identity.spec.ts-162-   * identity.users` inside `withTenant` is NOT protected by anything: it
apps\api\src\identity\identity.spec.ts-163-   * returns every user on the platform. It type-checks, it reads naturally, and
apps\api\src\identity\identity.spec.ts-164-   * it leaks the entire user base.
apps\api\src\identity\identity.spec.ts-165-   *
apps\api\src\identity\identity.spec.ts-166-   * The only thing that scopes these queries is starting from
apps\api\src\identity\identity.spec.ts:167:   * `identity.memberships`, which IS under FORCE RLS, and joining outward.
apps\api\src\identity\identity.spec.ts-168-   * These tests assert the shape of the query itself, because that shape is the
apps\api\src\identity\identity.spec.ts-169-   * security control.
apps\api\src\identity\identity.spec.ts-170-   */
apps\api\src\identity\identity.spec.ts:171:  it('every user query starts FROM identity.memberships and joins to users', async () => {
apps\api\src\identity\identity.spec.ts-172-    const { db, queries } = fakeDb([]);
apps\api\src\identity\identity.spec.ts-173-    const svc = new UserService(db);
apps\api\src\identity\identity.spec.ts-174-    await svc.list(ctx());
apps\api\src\identity\identity.spec.ts-175-    await svc.findById(ctx(), 'user-2').catch(() => undefined);
apps\api\src\identity\identity.spec.ts-176-
apps\api\src\identity\identity.spec.ts-177-    expect(queries.length).toBeGreaterThan(0);
apps\api\src\identity\identity.spec.ts-178-    for (const q of queries) {
apps\api\src\identity\identity.spec.ts-179-      expect(
--
apps\api\src\identity\identity.schemas.ts-2-import { optionalText, requiredText, uuid } from '../common/validation/validated-body';
apps\api\src\identity\identity.schemas.ts-3-
apps\api\src\identity\identity.schemas.ts-4-/**
apps\api\src\identity\identity.schemas.ts-5- * Request schemas for branches and memberships.
apps\api\src\identity\identity.schemas.ts-6- *
apps\api\src\identity\identity.schemas.ts-7- * 🔴 THE MEMBERSHIP ENDPOINT IS THE SHARPEST ONE IN THE API. `grant` decides
apps\api\src\identity\identity.schemas.ts-8- * WHO HOLDS WHICH ROLE, and `role_name` has no CHECK constraint in the database
apps\api\src\identity\identity.schemas.ts-9- * — recorded on 2026-08-01, when the Supervisor confirmed that
apps\api\src\identity\identity.schemas.ts:10: * `identity.memberships` constrains `status` and not `role_name`, so an
apps\api\src\identity\identity.schemas.ts-11- * arbitrary role string is insertable. The authorization layer then maps an
apps\api\src\identity\identity.schemas.ts-12- * unknown role to no permissions, which fails safe; but a typo'd role silently
apps\api\src\identity\identity.schemas.ts-13- * grants nothing while looking granted, and there is no barrier at all against
apps\api\src\identity\identity.schemas.ts-14- * junk accumulating in the column.
apps\api\src\identity\identity.schemas.ts-15- *
apps\api\src\identity\identity.schemas.ts-16- * `roleName` is therefore validated as a bounded, shaped string here. It is
apps\api\src\identity\identity.schemas.ts-17- * deliberately NOT an enum of the eight known roles: `ROLE_TO_NAV` maps eight
apps\api\src\identity\identity.schemas.ts-18- * while only four navigation trees exist, that mapping is still in flux, and a
--
apps\api\src\identity\identity.schemas.ts-30-  operatingHours: optionalText(300),
apps\api\src\identity\identity.schemas.ts-31-});
apps\api\src\identity\identity.schemas.ts-32-export type CreateBranchBody = z.infer<typeof CreateBranchBody>;
apps\api\src\identity\identity.schemas.ts-33-
apps\api\src\identity\identity.schemas.ts-34-/**
apps\api\src\identity\identity.schemas.ts-35- * 🔴 `userEmail` EXISTS BECAUSE `userId` MADE THIS ROUTE UNREACHABLE.
apps\api\src\identity\identity.schemas.ts-36- *
apps\api\src\identity\identity.schemas.ts-37- * `grant` took a uuid, and the only way to discover one is `GET /users` — which
apps\api\src\identity\identity.schemas.ts:38: * is driven FROM `identity.memberships`, so it lists people who are ALREADY
apps\api\src\identity\identity.schemas.ts-39- * members. There was therefore no path, from any screen that could exist, to
apps\api\src\identity\identity.schemas.ts-40- * add somebody new: the platform's privilege-granting operation had no
apps\api\src\identity\identity.schemas.ts-41- * reachable caller. Exactly the shape that made Solar's third-level approval
apps\api\src\identity\identity.schemas.ts-42- * unreachable, and the repo's own rule — a rule whose escape hatch is
apps\api\src\identity\identity.schemas.ts-43- * unreachable is a wall, not a rule.
apps\api\src\identity\identity.schemas.ts-44- *
apps\api\src\identity\identity.schemas.ts-45- * ⚠️ AN EMAIL, NOT A SEARCH ENDPOINT, AND THAT IS THE SECURITY CHOICE. A
apps\api\src\identity\identity.schemas.ts-46- * `GET /users?q=` lookup would be an enumeration oracle over every account on
--
apps\api\src\identity\identity.schemas.ts-75-    message: 'send exactly one of userId or userEmail',
apps\api\src\identity\identity.schemas.ts-76-    path: ['userEmail'],
apps\api\src\identity\identity.schemas.ts-77-  });
apps\api\src\identity\identity.schemas.ts-78-export type GrantMembershipBody = z.infer<typeof GrantMembershipBody>;
apps\api\src\identity\identity.schemas.ts-79-
apps\api\src\identity\identity.schemas.ts-80-/**
apps\api\src\identity\identity.schemas.ts-81- * Withdrawing a membership.
apps\api\src\identity\identity.schemas.ts-82- *
apps\api\src\identity\identity.schemas.ts:83: * Enumerated because the migration enumerates it: `identity.memberships.status`
apps\api\src\identity\identity.schemas.ts-84- * carries a CHECK of active/suspended/revoked, and this endpoint may only move
apps\api\src\identity\identity.schemas.ts-85- * a membership to the latter two. Sending 'active' here would be a
apps\api\src\identity\identity.schemas.ts-86- * REINSTATEMENT dressed as a withdrawal, so it is refused by name.
apps\api\src\identity\identity.schemas.ts-87- */
apps\api\src\identity\identity.schemas.ts-88-export const WithdrawMembershipBody = z.object({
apps\api\src\identity\identity.schemas.ts-89-  status: z.enum(['suspended', 'revoked']),
apps\api\src\identity\identity.schemas.ts-90-});
apps\api\src\identity\identity.schemas.ts-91-export type WithdrawMembershipBody = z.infer<typeof WithdrawMembershipBody>;
--
apps\api\src\identity\identity-bootstrap.integration.spec.ts-6- *
apps\api\src\identity\identity-bootstrap.integration.spec.ts-7- * WHY THESE TESTS EXIST AND WHY THEY MUST CONNECT AS THE APP ROLE
apps\api\src\identity\identity-bootstrap.integration.spec.ts-8- *
apps\api\src\identity\identity-bootstrap.integration.spec.ts-9- * Both defects were invisible to the entire suite -- typecheck, lint, 122 unit
apps\api\src\identity\identity-bootstrap.integration.spec.ts-10- * tests and a 10-target build were all green while authorization could not
apps\api\src\identity\identity-bootstrap.integration.spec.ts-11- * succeed for a single user. Neither is reachable by a unit test, because both
apps\api\src\identity\identity-bootstrap.integration.spec.ts-12- * are properties of the DATABASE ROLE and the SESSION STATE, not of TypeScript:
apps\api\src\identity\identity-bootstrap.integration.spec.ts-13- *
apps\api\src\identity\identity-bootstrap.integration.spec.ts:14: *   1. `identity.memberships` is under FORCE RLS. With no tenant context its
apps\api\src\identity\identity-bootstrap.integration.spec.ts-15- *      policy evaluates `tenant_id = NULL`, hiding every row -- so the bootstrap
apps\api\src\identity\identity-bootstrap.integration.spec.ts-16- *      lookup that ESTABLISHES tenant context returned nothing, for everyone.
apps\api\src\identity\identity-bootstrap.integration.spec.ts-17- *      Measured before the fix: 1 membership present, 0 visible.
apps\api\src\identity\identity-bootstrap.integration.spec.ts-18- *   2. `audit.events` had no RLS at all while the app role held SELECT.
apps\api\src\identity\identity-bootstrap.integration.spec.ts-19- *
apps\api\src\identity\identity-bootstrap.integration.spec.ts-20- * A superuser bypasses RLS entirely, so a test run as one proves nothing. These
apps\api\src\identity\identity-bootstrap.integration.spec.ts-21- * connect as `autoworkshop_app`, exactly as the application does.
apps\api\src\identity\identity-bootstrap.integration.spec.ts-22- *
--
apps\api\src\identity\identity-bootstrap.integration.spec.ts-54-    // defects were in the HARNESS, not the product".
apps\api\src\identity\identity-bootstrap.integration.spec.ts-55-    //
apps\api\src\identity\identity-bootstrap.integration.spec.ts-56-    // The join makes the selection describe what the test needs. If nothing
apps\api\src\identity\identity-bootstrap.integration.spec.ts-57-    // matches, `seededSubject` stays null and the assertion SKIPS by its own
apps\api\src\identity\identity-bootstrap.integration.spec.ts-58-    // guard rather than failing — an empty database is not a regression.
apps\api\src\identity\identity-bootstrap.integration.spec.ts-59-    const r = await pool.query<{ keycloak_subject: string }>(
apps\api\src\identity\identity-bootstrap.integration.spec.ts-60-      `SELECT u.keycloak_subject
apps\api\src\identity\identity-bootstrap.integration.spec.ts-61-         FROM identity.users u
apps\api\src\identity\identity-bootstrap.integration.spec.ts:62:         JOIN identity.memberships m ON m.user_id = u.id AND m.status = 'active'
apps\api\src\identity\identity-bootstrap.integration.spec.ts-63-        WHERE u.status = 'active'
apps\api\src\identity\identity-bootstrap.integration.spec.ts-64-        ORDER BY u.keycloak_subject
apps\api\src\identity\identity-bootstrap.integration.spec.ts-65-        LIMIT 1`,
apps\api\src\identity\identity-bootstrap.integration.spec.ts-66-    );
apps\api\src\identity\identity-bootstrap.integration.spec.ts-67-    seededSubject = r.rows[0]?.keycloak_subject ?? null;
apps\api\src\identity\identity-bootstrap.integration.spec.ts-68-  } catch {
apps\api\src\identity\identity-bootstrap.integration.spec.ts-69-    reachable = false;
apps\api\src\identity\identity-bootstrap.integration.spec.ts-70-    await pool?.end().catch(() => undefined);
--
apps\api\src\identity\identity-bootstrap.integration.spec.ts-88-  it('REGRESSION: resolves memberships with NO tenant context set', async () => {
apps\api\src\identity\identity-bootstrap.integration.spec.ts-89-    if (!reachable || !pool || !seededSubject) return;
apps\api\src\identity\identity-bootstrap.integration.spec.ts-90-    // This is the exact call MembershipRepository makes. Before migration 003
apps\api\src\identity\identity-bootstrap.integration.spec.ts-91-    // the equivalent direct query returned the user with a NULL tenant, which
apps\api\src\identity\identity-bootstrap.integration.spec.ts-92-    // the repository filtered to an empty membership list -- a platform-wide
apps\api\src\identity\identity-bootstrap.integration.spec.ts-93-    // authorization outage.
apps\api\src\identity\identity-bootstrap.integration.spec.ts-94-    const r = await pool.query<{ tenant_id: string | null; role_name: string | null }>(
apps\api\src\identity\identity-bootstrap.integration.spec.ts-95-      `SELECT user_id, tenant_id, organization_id, branch_id, role_name, status
apps\api\src\identity\identity-bootstrap.integration.spec.ts:96:         FROM identity.memberships_for_subject($1)`,
apps\api\src\identity\identity-bootstrap.integration.spec.ts-97-      [seededSubject],
apps\api\src\identity\identity-bootstrap.integration.spec.ts-98-    );
apps\api\src\identity\identity-bootstrap.integration.spec.ts-99-    expect(r.rows.length).toBeGreaterThan(0);
apps\api\src\identity\identity-bootstrap.integration.spec.ts-100-    // The point of the fix: a REAL tenant, not NULL.
apps\api\src\identity\identity-bootstrap.integration.spec.ts-101-    expect(r.rows.some((row) => row.tenant_id !== null)).toBe(true);
apps\api\src\identity\identity-bootstrap.integration.spec.ts-102-  });
apps\api\src\identity\identity-bootstrap.integration.spec.ts-103-
apps\api\src\identity\identity-bootstrap.integration.spec.ts-104-  it('does NOT weaken RLS: a direct read of memberships is still blocked', async () => {
apps\api\src\identity\identity-bootstrap.integration.spec.ts-105-    if (!reachable || !pool) return;
apps\api\src\identity\identity-bootstrap.integration.spec.ts-106-    // If this ever returns rows, the fix was applied by loosening the policy
apps\api\src\identity\identity-bootstrap.integration.spec.ts-107-    // rather than by the narrowly scoped SECURITY DEFINER function, and tenant
apps\api\src\identity\identity-bootstrap.integration.spec.ts-108-    // isolation has been traded away for a login fix.
apps\api\src\identity\identity-bootstrap.integration.spec.ts-109-    const r = await pool.query<{ n: string }>(
apps\api\src\identity\identity-bootstrap.integration.spec.ts:110:      `SELECT count(*)::text AS n FROM identity.memberships`,
apps\api\src\identity\identity-bootstrap.integration.spec.ts-111-    );
apps\api\src\identity\identity-bootstrap.integration.spec.ts-112-    expect(r.rows[0]?.n).toBe('0');
apps\api\src\identity\identity-bootstrap.integration.spec.ts-113-  });
apps\api\src\identity\identity-bootstrap.integration.spec.ts-114-
apps\api\src\identity\identity-bootstrap.integration.spec.ts-115-  it('cannot be used to enumerate: an unknown subject returns nothing', async () => {
apps\api\src\identity\identity-bootstrap.integration.spec.ts-116-    if (!reachable || !pool) return;
apps\api\src\identity\identity-bootstrap.integration.spec.ts-117-    const r = await pool.query(
apps\api\src\identity\identity-bootstrap.integration.spec.ts:118:      `SELECT * FROM identity.memberships_for_subject($1)`,
apps\api\src\identity\identity-bootstrap.integration.spec.ts-119-      ['no-such-subject-does-not-exist'],
apps\api\src\identity\identity-bootstrap.integration.spec.ts-120-    );
apps\api\src\identity\identity-bootstrap.integration.spec.ts-121-    expect(r.rows.length).toBe(0);
apps\api\src\identity\identity-bootstrap.integration.spec.ts-122-  });
apps\api\src\identity\identity-bootstrap.integration.spec.ts-123-});
apps\api\src\identity\identity-bootstrap.integration.spec.ts-124-
apps\api\src\identity\identity-bootstrap.integration.spec.ts-125-describe('audit.events row-level security (migration 003)', () => {
apps\api\src\identity\identity-bootstrap.integration.spec.ts-126-  it('has RLS both ENABLED and FORCED', async () => {
--
apps\api\src\identity\customer-enrolment.service.ts-6-
apps\api\src\identity\customer-enrolment.service.ts-7-/**
apps\api\src\identity\customer-enrolment.service.ts-8- * ENROLMENT — a signed-up person becomes a customer of a workshop.
apps\api\src\identity\customer-enrolment.service.ts-9- *
apps\api\src\identity\customer-enrolment.service.ts-10- * ══════════════════════════════════════════════════════════════════════════
apps\api\src\identity\customer-enrolment.service.ts-11- * 🔴 THE DEFECT THIS SERVICE CLOSES, MEASURED 2026-08-08:
apps\api\src\identity\customer-enrolment.service.ts-12- * THE `customer` ROLE COULD NOT EXIST ON PRODUCTION.
apps\api\src\identity\customer-enrolment.service.ts-13- *
apps\api\src\identity\customer-enrolment.service.ts:14: * `identity.memberships` had exactly two writers in the whole product —
apps\api\src\identity\customer-enrolment.service.ts-15- * `register_workshop` (grants `workshop_owner`) and the admin-only
apps\api\src\identity\customer-enrolment.service.ts-16- * `MembershipService.grant()`. Neither can produce a `customer`. Every
apps\api\src\identity\customer-enrolment.service.ts-17- * customer route sits behind `TenantGuard`, which throws `user holds no active
apps\api\src\identity\customer-enrolment.service.ts-18- * membership` when there is none.
apps\api\src\identity\customer-enrolment.service.ts-19- *
apps\api\src\identity\customer-enrolment.service.ts-20- * So a real Keycloak sign-up produced an account that could browse the
apps\api\src\identity\customer-enrolment.service.ts-21- * marketplace and nothing else: sign-in succeeded, `/vehicles` 401'd into an
apps\api\src\identity\customer-enrolment.service.ts-22- * empty garage, and the Request for Service form POSTed into a 401. From
--
apps\api\src\identity\customer-enrolment.integration.spec.ts-199-    expect(result.organizationId).toBe(orgId);
apps\api\src\identity\customer-enrolment.integration.spec.ts-200-    expect(result.customerId).toBeTruthy();
apps\api\src\identity\customer-enrolment.integration.spec.ts-201-  });
apps\api\src\identity\customer-enrolment.integration.spec.ts-202-
apps\api\src\identity\customer-enrolment.integration.spec.ts-203-  dbIt('the membership really exists, and really is `customer`', async () => {
apps\api\src\identity\customer-enrolment.integration.spec.ts-204-    // Read it back independently rather than trusting the return value — the
apps\api\src\identity\customer-enrolment.integration.spec.ts-205-    // question is what is IN the database, not what the method said.
apps\api\src\identity\customer-enrolment.integration.spec.ts-206-    const res = await client!.query<{ role_name: string; status: string }>(
apps\api\src\identity\customer-enrolment.integration.spec.ts:207:      `SELECT role_name, status FROM identity.memberships
apps\api\src\identity\customer-enrolment.integration.spec.ts-208-        WHERE user_id = $1 AND organization_id = $2`,
apps\api\src\identity\customer-enrolment.integration.spec.ts-209-      [strangerId, orgId],
apps\api\src\identity\customer-enrolment.integration.spec.ts-210-    );
apps\api\src\identity\customer-enrolment.integration.spec.ts-211-    expect(res.rowCount).toBe(1);
apps\api\src\identity\customer-enrolment.integration.spec.ts-212-    expect(res.rows[0]!.role_name).toBe('customer');
apps\api\src\identity\customer-enrolment.integration.spec.ts-213-    expect(res.rows[0]!.status).toBe('active');
apps\api\src\identity\customer-enrolment.integration.spec.ts-214-  });
apps\api\src\identity\customer-enrolment.integration.spec.ts-215-
--
apps\api\src\identity\customer-enrolment.integration.spec.ts-231-      strangerSubject,
apps\api\src\identity\customer-enrolment.integration.spec.ts-232-      orgId,
apps\api\src\identity\customer-enrolment.integration.spec.ts-233-      'Ada Stranger',
apps\api\src\identity\customer-enrolment.integration.spec.ts-234-      'enrolment-spec-stranger@example.test',
apps\api\src\identity\customer-enrolment.integration.spec.ts-235-    );
apps\api\src\identity\customer-enrolment.integration.spec.ts-236-    expect(again.created).toBe(false);
apps\api\src\identity\customer-enrolment.integration.spec.ts-237-
apps\api\src\identity\customer-enrolment.integration.spec.ts-238-    const memberships = await client!.query(
apps\api\src\identity\customer-enrolment.integration.spec.ts:239:      `SELECT 1 FROM identity.memberships WHERE user_id = $1 AND organization_id = $2`,
apps\api\src\identity\customer-enrolment.integration.spec.ts-240-      [strangerId, orgId],
apps\api\src\identity\customer-enrolment.integration.spec.ts-241-    );
apps\api\src\identity\customer-enrolment.integration.spec.ts-242-    const customers = await client!.query(
apps\api\src\identity\customer-enrolment.integration.spec.ts-243-      `SELECT 1 FROM core.customers WHERE user_id = $1 AND organization_id = $2`,
apps\api\src\identity\customer-enrolment.integration.spec.ts-244-      [strangerId, orgId],
apps\api\src\identity\customer-enrolment.integration.spec.ts-245-    );
apps\api\src\identity\customer-enrolment.integration.spec.ts-246-    // Both halves must be idempotent. A second membership is blocked by the
apps\api\src\identity\customer-enrolment.integration.spec.ts-247-    // unique constraint; a second customer row is blocked by migration 063's
--
apps\api\src\crm\leads.integration.spec.ts-173-  // that is honest HERE where it would not be in the value-chain spec. That file
apps\api\src\crm\leads.integration.spec.ts-174-  // exists to prove enrolment can happen at all, so a hand-written membership
apps\api\src\crm\leads.integration.spec.ts-175-  // would beg its question. This file exists to prove REFUSAL, and a fixture
apps\api\src\crm\leads.integration.spec.ts-176-  // that hands the refused party a membership it might not otherwise hold errs
apps\api\src\crm\leads.integration.spec.ts-177-  // in the conservative direction: it makes the refusal harder to achieve, not
apps\api\src\crm\leads.integration.spec.ts-178-  // easier. Since migration 061 the product can create this row anyway.
apps\api\src\crm\leads.integration.spec.ts-179-  const grant = async (userId: string, role: string, orgId: string, branchId: string) =>
apps\api\src\crm\leads.integration.spec.ts-180-    c.query(
apps\api\src\crm\leads.integration.spec.ts:181:      `INSERT INTO identity.memberships
apps\api\src\crm\leads.integration.spec.ts-182-         (tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
apps\api\src\crm\leads.integration.spec.ts-183-       VALUES ($1,$2,$3,$4,$5,'active',$4)`,
apps\api\src\crm\leads.integration.spec.ts-184-      [tenantId, orgId, branchId, userId, role],
apps\api\src\crm\leads.integration.spec.ts-185-    );
apps\api\src\crm\leads.integration.spec.ts-186-  await grant(ownerA, 'workshop_owner', orgA, branchA);
apps\api\src\crm\leads.integration.spec.ts-187-  await grant(technicianA, 'technician', orgA, branchA);
apps\api\src\crm\leads.integration.spec.ts-188-  await grant(customerA, 'customer', orgA, branchA);
apps\api\src\crm\leads.integration.spec.ts-189-  await grant(ownerB, 'workshop_owner', orgB, branchB);
--
apps\api\src\calls\calls.service.ts-308-      // attacker, across the tenant boundary, silently.
apps\api\src\calls\calls.service.ts-309-      //
apps\api\src\calls\calls.service.ts-310-      // ⚠️ AND A CUSTOMER'S LIST IS IGNORED ENTIRELY, which is what the comment
apps\api\src\calls\calls.service.ts-311-      // below always claimed and the code did not do: it MERGED their list with
apps\api\src\calls\calls.service.ts-312-      // the front desk rather than replacing it.
apps\api\src\calls\calls.service.ts-313-      if (ctx.activeRole !== 'customer') {
apps\api\src\calls\calls.service.ts-314-        for (const userId of input.participantUserIds ?? []) {
apps\api\src\calls\calls.service.ts-315-          const reachable = await client.query(
apps\api\src\calls\calls.service.ts:316:            `SELECT 1 FROM identity.memberships
apps\api\src\calls\calls.service.ts-317-              WHERE tenant_id = $1 AND organization_id = $2
apps\api\src\calls\calls.service.ts-318-                AND user_id = $3 AND status = 'active'
apps\api\src\calls\calls.service.ts-319-              LIMIT 1
apps\api\src\calls\calls.service.ts-320-             UNION ALL
apps\api\src\calls\calls.service.ts-321-             SELECT 1 FROM core.customers
apps\api\src\calls\calls.service.ts-322-              WHERE tenant_id = $1 AND organization_id = $2
apps\api\src\calls\calls.service.ts-323-                AND user_id = $3
apps\api\src\calls\calls.service.ts-324-              LIMIT 1`,
--
apps\api\src\calls\calls.service.ts-333-        }
apps\api\src\calls\calls.service.ts-334-      }
apps\api\src\calls\calls.service.ts-335-
apps\api\src\calls\calls.service.ts-336-      // A customer cannot name workshop staff, so their call reaches the front
apps\api\src\calls\calls.service.ts-337-      // desk — the same rule slice 7 applies to threads, and refusing loudly
apps\api\src\calls\calls.service.ts-338-      // when there is nobody to reach beats ringing into a void.
apps\api\src\calls\calls.service.ts-339-      if (ctx.activeRole === 'customer') {
apps\api\src\calls\calls.service.ts-340-        const desk = await client.query<{ user_id: string }>(
apps\api\src\calls\calls.service.ts:341:          `SELECT DISTINCT user_id FROM identity.memberships
apps\api\src\calls\calls.service.ts-342-            WHERE tenant_id = $1 AND organization_id = $2 AND status = 'active'
apps\api\src\calls\calls.service.ts-343-              AND role_name = ANY($3::text[])`,
apps\api\src\calls\calls.service.ts-344-          [ctx.tenantId, ctx.organizationId, [...CUSTOMER_CALL_RECEIVERS]],
apps\api\src\calls\calls.service.ts-345-        );
apps\api\src\calls\calls.service.ts-346-        for (const row of desk.rows) invited.add(row.user_id);
apps\api\src\calls\calls.service.ts-347-        if (desk.rowCount === 0) {
apps\api\src\calls\calls.service.ts-348-          throw new BadRequestException(
apps\api\src\calls\calls.service.ts-349-            'This workshop has nobody set up to take calls yet, so nobody would be rung. Please phone them instead — the number is on the workshop profile.',
--
apps\api\src\authz\role-vocabulary.spec.ts-2-import { join, resolve } from 'node:path';
apps\api\src\authz\role-vocabulary.spec.ts-3-import { describe, expect, it } from 'vitest';
apps\api\src\authz\role-vocabulary.spec.ts-4-import { ROLE_PRECEDENCE } from './permission-matrix';
apps\api\src\authz\role-vocabulary.spec.ts-5-
apps\api\src\authz\role-vocabulary.spec.ts-6-/**
apps\api\src\authz\role-vocabulary.spec.ts-7- * 🔴 A ROLE NAME THAT DOES NOT EXIST IS A SILENT LOCKOUT.
apps\api\src\authz\role-vocabulary.spec.ts-8- *
apps\api\src\authz\role-vocabulary.spec.ts-9- * `WORKSHOP_STAFF_ROLES` listed `'quality_controller'`. There is no such role:
apps\api\src\authz\role-vocabulary.spec.ts:10: * the name in `identity.memberships.role_name`, in `ROLE_PERMISSIONS`, in
apps\api\src\authz\role-vocabulary.spec.ts-11- * `ROLE_PRECEDENCE`, in `MembershipService`'s grantable list and in every
apps\api\src\authz\role-vocabulary.spec.ts-12- * `repair/*-rules.ts` set is `'quality_control_inspector'`. The phantom had
apps\api\src\authz\role-vocabulary.spec.ts-13- * been copied into six more lists — settings, reports, knowledge (twice), comms
apps\api\src\authz\role-vocabulary.spec.ts-14- * and calls — so a quality control inspector was refused by `assertWorkshopStaff`
apps\api\src\authz\role-vocabulary.spec.ts-15- * and by every one of those gates, while `CAN_INSPECT` and `ROLE_TARGET_STAGES`
apps\api\src\authz\role-vocabulary.spec.ts-16- * correctly admitted them to the quality-control stage they exist to run.
apps\api\src\authz\role-vocabulary.spec.ts-17- *
apps\api\src\authz\role-vocabulary.spec.ts-18- * It fails CLOSED, so it was a lockout and not a leak. That is exactly why it
--
apps\api\src\authz\role-vocabulary.spec.ts-61- * ⚠️ TWO OTHER VOCABULARIES EXIST AND ARE NOT WRONG. Named here with the reason
apps\api\src\authz\role-vocabulary.spec.ts-62- * rather than silently skipped, because an unexplained exclusion is how the
apps\api\src\authz\role-vocabulary.spec.ts-63- * next real defect gets excluded too.
apps\api\src\authz\role-vocabulary.spec.ts-64- */
apps\api\src\authz\role-vocabulary.spec.ts-65-const OTHER_VOCABULARIES: Readonly<Record<string, string>> = {
apps\api\src\authz\role-vocabulary.spec.ts-66-  /**
apps\api\src\authz\role-vocabulary.spec.ts-67-   * `catalogue.supplier_members.role` — `'owner' | 'staff'`, mirroring
apps\api\src\authz\role-vocabulary.spec.ts-68-   * `ck_supplier_member_role` in migration 023. A supplier is not an
apps\api\src\authz\role-vocabulary.spec.ts:69:   * organisation in this schema, and these are not `identity.memberships`
apps\api\src\authz\role-vocabulary.spec.ts-70-   * role names at all.
apps\api\src\authz\role-vocabulary.spec.ts-71-   */
apps\api\src\authz\role-vocabulary.spec.ts-72-  SUPPLIER_MEMBER_ROLES: 'catalogue.supplier_members.role, per migration 023',
apps\api\src\authz\role-vocabulary.spec.ts-73-  /**
apps\api\src\authz\role-vocabulary.spec.ts-74-   * The names POSTGRES accepts as the platform administrator, which
apps\api\src\authz\role-vocabulary.spec.ts-75-   * deliberately includes the bare literal `'admin'` that seed scripts,
apps\api\src\authz\role-vocabulary.spec.ts-76-   * migrations and hand-run psql set. Its own comment explains why, and
apps\api\src\authz\role-vocabulary.spec.ts-77-   * `permission-matrix.spec` asserts it against the SQL text of migration 025.
--
apps\api\src\authz\permission-matrix.ts-42-// ROLE_PERMISSIONS may reference it — it is added by permissionsForContext
apps\api\src\authz\permission-matrix.ts-43-// from the grant, and by nothing else. Leaving it in scope would make
apps\api\src\authz\permission-matrix.ts-44-// re-adding it to a role a one-word edit.
apps\api\src\authz\permission-matrix.ts-45-const { financeRead, organizationAdmin } = PERMISSIONS;
apps\api\src\authz\permission-matrix.ts-46-
apps\api\src\authz\permission-matrix.ts-47-/**
apps\api\src\authz\permission-matrix.ts-48- * Role name → the permissions it confers.
apps\api\src\authz\permission-matrix.ts-49- *
apps\api\src\authz\permission-matrix.ts:50: * Role names are the `identity.memberships.role_name` values accepted by
apps\api\src\authz\permission-matrix.ts-51- * `MembershipService`'s grantable-role allow-list. The two lists must agree: a
apps\api\src\authz\permission-matrix.ts-52- * role that can be granted but has no entry here silently receives NO
apps\api\src\authz\permission-matrix.ts-53- * permissions, which fails closed but looks like a bug at the screen. The test
apps\api\src\authz\permission-matrix.ts-54- * `every grantable role has a matrix entry` asserts they stay in step.
apps\api\src\authz\permission-matrix.ts-55- */
apps\api\src\authz\permission-matrix.ts-56-export const ROLE_PERMISSIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
apps\api\src\authz\permission-matrix.ts-57-  // ── 07 pt2 §50, the eight workshop roles ────────────────────────────────
apps\api\src\authz\permission-matrix.ts-58-  /** "Full workshop governance, staff, financial and reporting access." */
--
apps\api\src\comms\comms.service.ts-337-      const invited = new Set<string>([ctx.userId, ...(input.participantUserIds ?? [])]);
apps\api\src\comms\comms.service.ts-338-
apps\api\src\comms\comms.service.ts-339-      // …and a CUSTOMER's thread is addressed to the front desk, because a
apps\api\src\comms\comms.service.ts-340-      // customer cannot name the staff to invite. Without this a customer's
apps\api\src\comms\comms.service.ts-341-      // message would sit in a thread only they could read.
apps\api\src\comms\comms.service.ts-342-      if (ctx.activeRole === 'customer') {
apps\api\src\comms\comms.service.ts-343-        const desk = await client.query<{ user_id: string }>(
apps\api\src\comms\comms.service.ts-344-          `SELECT DISTINCT user_id
apps\api\src\comms\comms.service.ts:345:             FROM identity.memberships
apps\api\src\comms\comms.service.ts-346-            WHERE tenant_id = $1 AND organization_id = $2
apps\api\src\comms\comms.service.ts-347-              AND status = 'active'
apps\api\src\comms\comms.service.ts-348-              AND role_name = ANY($3::text[])`,
apps\api\src\comms\comms.service.ts-349-          [ctx.tenantId, ctx.organizationId, [...CUSTOMER_THREAD_RECEIVERS]],
apps\api\src\comms\comms.service.ts-350-        );
apps\api\src\comms\comms.service.ts-351-        for (const row of desk.rows) invited.add(row.user_id);
apps\api\src\comms\comms.service.ts-352-
apps\api\src\comms\comms.service.ts-353-        // ⚠️ IF THE WORKSHOP HAS NOBODY ON THE FRONT DESK, SAY SO rather than
--
apps\web\app\supplier\_screens\create-supplier-actions.ts-9- *
apps\web\app\supplier\_screens\create-supplier-actions.ts-10- * The end of the chain that starts at the landing page's "Register as parts
apps\web\app\supplier\_screens\create-supplier-actions.ts-11- * supplier" button: sign up at Keycloak, the first API call provisions the
apps\web\app\supplier\_screens\create-supplier-actions.ts-12- * application user, and this turns that user into a `parts_supplier`
apps\web\app\supplier\_screens\create-supplier-actions.ts-13- * organisation with themselves as `supplier_owner`.
apps\web\app\supplier\_screens\create-supplier-actions.ts-14- *
apps\web\app\supplier\_screens\create-supplier-actions.ts-15- * 🔴 UNTIL MIGRATION 068 NOTHING IN THE PRODUCT COULD DO THIS. `supplier_owner`
apps\web\app\supplier\_screens\create-supplier-actions.ts-16- * appeared in the permission matrix, in `ROLE_PRECEDENCE`, in this app's
apps\web\app\supplier\_screens\create-supplier-actions.ts:17: * navigation tree — and the only two writers of `identity.memberships` were
apps\web\app\supplier\_screens\create-supplier-actions.ts-18- * `register_workshop` (always `workshop_owner`) and an admin-only grant. A
apps\web\app\supplier\_screens\create-supplier-actions.ts-19- * button shipped before that migration would have produced an account that
apps\web\app\supplier\_screens\create-supplier-actions.ts-20- * signs in successfully and is refused by every supplier route. That is exactly
apps\web\app\supplier\_screens\create-supplier-actions.ts-21- * what happened to the `customer` role, and it survived every test because the
apps\web\app\supplier\_screens\create-supplier-actions.ts-22- * dev seed script INSERTs the membership with raw SQL.
apps\web\app\supplier\_screens\create-supplier-actions.ts-23- *
apps\web\app\supplier\_screens\create-supplier-actions.ts-24- * ⚠️ THE BODY NAMES THE SUPPLIER AND NOTHING ELSE. The owner is taken from the
apps\web\app\supplier\_screens\create-supplier-actions.ts-25- * validated token subject server-side, and the ROLE is a literal inside
--
apps\api\src\agents\service-request-triage.agent.ts-215-        display_name: string;
apps\api\src\agents\service-request-triage.agent.ts-216-        specialisms: string[] | null;
apps\api\src\agents\service-request-triage.agent.ts-217-        open_jobs: string;
apps\api\src\agents\service-request-triage.agent.ts-218-      }>(
apps\api\src\agents\service-request-triage.agent.ts-219-        `SELECT u.id,
apps\api\src\agents\service-request-triage.agent.ts-220-                u.display_name,
apps\api\src\agents\service-request-triage.agent.ts-221-                NULL::text[] AS specialisms,
apps\api\src\agents\service-request-triage.agent.ts-222-                COALESCE(j.open_jobs, 0) AS open_jobs
apps\api\src\agents\service-request-triage.agent.ts:223:           FROM identity.memberships m
apps\api\src\agents\service-request-triage.agent.ts-224-           JOIN identity.users u ON u.id = m.user_id
apps\api\src\agents\service-request-triage.agent.ts-225-           LEFT JOIN (
apps\api\src\agents\service-request-triage.agent.ts-226-             SELECT assigned_technician_id, count(*) AS open_jobs
apps\api\src\agents\service-request-triage.agent.ts-227-               FROM repair.job_cards
apps\api\src\agents\service-request-triage.agent.ts-228-              -- The stage names are read from job-card-stages.ts, not guessed.
apps\api\src\agents\service-request-triage.agent.ts-229-              -- There is no 'released' or 'cancelled' stage in this product:
apps\api\src\agents\service-request-triage.agent.ts-230-              -- the 20 stages end at 'completed', with 'warranty_follow_up'
apps\api\src\agents\service-request-triage.agent.ts-231-              -- after it. A plausible-looking name matching nothing would make

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -l "organizationsFromMemberships|Active organization|setActiveOrganizationAction" apps packages' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 666ms:
packages\next-shell\src\ViewerSwitchers.tsx
packages\next-shell\src\viewer.test.ts
packages\next-shell\src\viewer-contract.ts
packages\next-shell\src\set-role-action.ts
packages\next-shell\src\set-organization-action.ts
packages\next-shell\src\OrganizationSwitcher.tsx
packages\next-shell\src\index.ts
apps\e2e\tests\live-signed-in.spec.ts

2026-08-19T20:03:51.352896Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$p='"'packages/next-shell/src/viewer-contract.ts'; "'$c=Get-Content -LiteralPath $p; for($i=420;$i -le 510;$i++){ if($i -le $c.Count){'"'{0,4}: {1}' -f "'$i,$c[$i-1]}}; Get-Content -LiteralPath packages/next-shell/src/set-organization-action.ts; Get-Content -LiteralPath packages/next-shell/src/OrganizationSwitcher.tsx'` rejected: blocked by policy
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$p='"'packages/next-shell/src/viewer-contract.ts'; "'$c=Get-Content -LiteralPath $p; for($i=420;$i -le 510;$i++){ if($i -le $c.Count){'"'{0,4}: {1}' -f "'$i,$c[$i-1]}}; Get-Content -LiteralPath packages/next-shell/src/set-organization-action.ts; Get-Content -LiteralPath packages/next-shell/src/OrganizationSwitcher.tsx' in C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$p='"'packages/next-shell/src/viewer-contract.ts'; "'$c=Get-Content -LiteralPath $p; for($i=420;$i -le 510;$i++){ if($i -le $c.Count){'"'{0,4}: {1}' -f "'$i,$c[$i-1]}}; Get-Content -LiteralPath packages/next-shell/src/set-organization-action.ts; Get-Content -LiteralPath packages/next-shell/src/OrganizationSwitcher.tsx'` rejected: blocked by policy
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n -C 18 "organizationsFromMemberships|rolesFromMemberships" packages/next-shell/src/viewer-contract.ts' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 340ms:
368- * makes every gated item visible and the fail-closed tests skip. That exact
369- * failure is why `at least one workspace must exercise permission gating`
370- * exists.
371- */
372-export const NO_GRANTS: readonly PermissionKey[] = Object.freeze([]);
373-
374-/**
375- * The DISTINCT organizations a viewer belongs to, for the §5 switcher.
376- *
377- * `/me` returns one membership row per organization AND BRANCH AND ROLE, so a
378- * user who is a service adviser at two branches of one workshop has two rows
379- * naming the same organization. Feeding those straight to a `<select>` renders
380- * the same option twice, which reads as a bug and — worse — makes the switcher
381- * look like it has choices it does not.
382- *
383- * Pure, so it can be asserted without a Next runtime. Order is preserved from
384- * the API, which already sorts by organization name.
385- */
386:export function organizationsFromMemberships(
387-  memberships: readonly { organizationId: string; organizationName: string }[],
388-): Array<{ id: string; name: string }> {
389-  const seen = new Set<string>();
390-  const out: Array<{ id: string; name: string }> = [];
391-  for (const m of memberships) {
392-    if (seen.has(m.organizationId)) continue;
393-    seen.add(m.organizationId);
394-    out.push({ id: m.organizationId, name: m.organizationName });
395-  }
396-  return out;
397-}
398-
399-/**
400- * The DISTINCT roles a viewer may act as IN ONE ORGANIZATION.
401- *
402- * ⚠️ SCOPED TO THE ACTIVE ORGANIZATION, AND THAT IS THE WHOLE CORRECTNESS
403- * ARGUMENT. Every API call sends `x-organization-id` AND `x-role-name`
404- * together (`api.ts`), and `resolveTenantContext` requires a membership
--
445- * failure.
446- *
447- * Anchored on the RESOLVED organization (`viewer.organizationId`) rather than
448- * the cookie: that is the organization the API actually chose for this render,
449- * so it is the one the next request will be judged against.
450- *
451- * Pure, so the rule can be asserted without a Next runtime — which is the
452- * reason it lives here rather than inline in `viewer.ts`.
453- */
454-export function holdsRoleInActiveOrganization(
455-  viewer: Pick<ViewerDescription, 'organizationId' | 'memberships'>,
456-  roleName: string,
457-): boolean {
458-  return viewer.memberships.some(
459-    (m) => m.roleName === roleName && m.organizationId === viewer.organizationId,
460-  );
461-}
462-
463:export function rolesFromMemberships(
464-  memberships: readonly { organizationId: string; roleName: string }[],
465-  organizationId: string,
466-): Array<{ name: string; label: string }> {
467-  const seen = new Set<string>();
468-  const out: Array<{ name: string; label: string }> = [];
469-  for (const m of memberships) {
470-    if (m.organizationId !== organizationId) continue;
471-    if (seen.has(m.roleName)) continue;
472-    seen.add(m.roleName);
473-    out.push({ name: m.roleName, label: roleLabel(m.roleName) });
474-  }
475-  return out;
476-}

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -LiteralPath packages/next-shell/src/set-organization-action.ts' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 401ms:
'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACTIVE_ORG_COOKIE } from './active-organization';
import { ACTIVE_ROLE_COOKIE } from './active-role';

/**
 * Store which organization the viewer is working in â€” T-0016.
 *
 * âš ï¸ IT VALIDATES NOTHING, ON PURPOSE, AND THAT IS SAFE FOR ONE REASON: the
 * value is not trusted anywhere. It is sent to the API as `x-organization-id`,
 * and `resolveTenantContext` uses it ONLY to select among memberships the
 * server has already proved the user holds â€” a value naming an organization
 * they do not hold is REFUSED outright, never silently downgraded.
 *
 * So the worst a tampered cookie achieves is that the viewer's own requests
 * start failing until they pick again. Re-checking membership here as well
 * would need a second round trip on every switch and would still not be the
 * control, because a server action is a public endpoint that anyone can call
 * directly. The check belongs where it cannot be skipped (CLAUDE.md Â§8).
 *
 * A malformed value is dropped rather than stored, which is not security â€”
 * it just stops a junk cookie making every subsequent request fail with a
 * confusing error instead of simply doing nothing.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setActiveOrganizationAction(formData: FormData): Promise<void> {
  const id = String(formData.get('organizationId') ?? '').trim();
  if (!UUID.test(id)) return;

  const store = await cookies();
  store.set(ACTIVE_ORG_COOKIE, id, {
    path: '/',
    // Readable by the client: the switcher shows which option is active, and
    // the value is the user's own choice, not a secret. See the note in
    // `active-organization.ts`.
    httpOnly: false,
    sameSite: 'lax',
    // Follows the deployment, not `NODE_ENV`. Hard-coding `secure` from the
    // build environment is exactly the defect that made the session cookie
    // name wrong under `next start` over http (2026-07-28) â€” the cookie was
    // set with a flag the URL scheme did not match, so nothing ever read it.
    secure: process.env['AUTH_URL']?.startsWith('https://') ?? false,
    maxAge: 60 * 60 * 24 * 365,
  });

  // âš ï¸ CHANGING ORGANIZATION CLEARS THE STORED ROLE, and without this the pair
  // can be left half-changed. The two values travel together on every request
  // (`x-organization-id` + `x-role-name`) and `resolveTenantContext` requires a
  // membership matching BOTH â€” so keeping a role from the organization you just
  // LEFT makes every subsequent request refused, with a switcher that appears
  // to have worked.
  //
  // The mirror of the fix in `rolesFromMemberships`, which stops the role list
  // offering a role from another organization. That one guards the role change;
  // this one guards the organization change. Either alone leaves the other
  // direction broken.
  //
  // Clearing is not a downgrade: the API then takes its own deterministic
  // default in the new organization, which is the STRONGEST role held there
  // (`ROLE_PRECEDENCE`). The viewer picks again from a list that now describes
  // where they actually are.
  store.delete(ACTIVE_ROLE_COOKIE);

  // Every screen is scoped by organization, so all of them are now stale.
  revalidatePath('/', 'layout');

  // ðŸ”´ AND NAVIGATE, FOR THE SAME REASON THE ROLE SWITCHER DOES.
  //
  // Found by Codex reviewing the role-switch fix: fixing that one alone left
  // this one broken in exactly the same way, which is why it is in the same
  // change. Changing organisation clears the role above, so the API then picks
  // the STRONGEST role held in the NEW organisation â€” and that role may belong
  // to a different pack. Switching organisation while on `/admin/...` into an
  // organisation whose default is `workshop_owner` strands the viewer on a pack
  // they can no longer enter: the identical ADR-021 failure.
  //
  // `/` RATHER THAN A COMPUTED PACK, deliberately. The new role is not known
  // here â€” it was just cleared, and only the API can resolve it. The front door
  // already does exactly this dispatch (`apps/web/app/page.tsx`), so sending
  // the viewer there resolves the new context once, in the one place that owns
  // the decision, instead of guessing it twice.
  //
  // âš ï¸ `redirect()` THROWS by design (NEXT_REDIRECT). Keep it LAST and never
  // inside a try/catch.
  redirect('/');
}

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -LiteralPath packages/next-shell/src/OrganizationSwitcher.tsx' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 397ms:
'use client';

import * as React from 'react';
import { themeVar, primitive } from '@autoworkshop/design-tokens';

/**
 * The organization switcher â€” `01 (1).txt` Â§5, T-0016.
 *
 * A NATIVE `<select>` INSIDE A FORM, deliberately, rather than a custom
 * dropdown panel. It is keyboard accessible, screen-reader correct and usable
 * on a phone with no work, it needs no focus-trap or outside-click handling,
 * and it keeps working if JavaScript fails â€” the form posts to a server action
 * either way. A hand-rolled listbox would be more code to get less.
 *
 * IT SUBMITS ON CHANGE, and that is a considered trade rather than an
 * oversight. A separate "Apply" button would be one more thing to forget after
 * choosing, and the action is instantly reversible: pick the other option back.
 * The `<noscript>` submit button covers the case where the change handler
 * cannot run.
 *
 * âš ï¸ NOT AN AUTHORIZATION CONTROL. The list only contains organizations the
 * API already reported as the viewer's own memberships, and the API re-validates
 * the choice against those memberships anyway â€” a request naming an organization
 * the user does not hold is REFUSED, not silently downgraded. Rendering fewer
 * options here is a convenience; it protects nothing on its own (CLAUDE.md Â§8).
 */

export interface OrganizationOption {
  id: string;
  name: string;
}

export function OrganizationSwitcher({
  organizations,
  activeId,
  action,
}: {
  organizations: readonly OrganizationOption[];
  activeId: string;
  /** Server action: stores the selection and revalidates. */
  action: (formData: FormData) => void | Promise<void>;
}) {
  const formRef = React.useRef<HTMLFormElement>(null);

  // One organization is not a choice. Rendering a select with a single option
  // invites the user to interact with something that cannot change â€” and every
  // viewer was in exactly this state until a second membership existed.
  if (organizations.length < 2) return null;

  return (
    <form ref={formRef} action={action} style={{ display: 'inline-flex' }}>
      {/* Labelled for assistive technology without spending top-bar width on a
          visible label â€” the selected organisation name is the visible text. */}
      <label htmlFor="aw-org-switcher" style={SR_ONLY}>
        Active organization
      </label>
      <select
        id="aw-org-switcher"
        name="organizationId"
        /**
         * âš ï¸ SAME FIX AS `RoleSwitcher`, AND THE SAME LATENT DEFECT â€” this one
         * was simply never exercised, because no account held two organisations
         * until the seed data grew one.
         *
         * `defaultValue` initialises an UNCONTROLLED input at mount only. After
         * the server action revalidates the layout, React reconciles the
         * existing node and does not re-apply it, so the select falls back to
         * the value it was born with and names the organisation the viewer just
         * LEFT. Re-keying on the resolved id remounts it, so what it displays is
         * always what the server actually resolved.
         */
        key={activeId}
        defaultValue={activeId}
        onChange={() => formRef.current?.requestSubmit()}
        style={{
          padding: `${primitive.space[1]} ${primitive.space[2]}`,
          border: `1px solid ${themeVar.borderDefault}`,
          borderRadius: primitive.radius.md,
          background: themeVar.backgroundSecondary,
          color: themeVar.textPrimary,
          fontSize: primitive.fontSize.sm,
          fontFamily: 'inherit',
          maxWidth: '14rem',
        }}
      >
        {organizations.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" style={{ marginLeft: primitive.space[1] }}>
          Switch
        </button>
      </noscript>
    </form>
  );
}

/** Visually hidden, still announced. Not `display:none`, which removes it. */
const SR_ONLY: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n -C 10 \"CREATE TABLE identity.memberships|UNIQUE \\(organization_id, user_id, role_name\\)|memberships.*UNIQUE|CREATE POLICY.*memberships|ALTER TABLE identity.memberships\" infrastructure/migrations" in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 419ms:
infrastructure/migrations\001_tenancy_foundation.sql-144-    organization_id uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
infrastructure/migrations\001_tenancy_foundation.sql-145-    branch_id       uuid REFERENCES identity.branches(id) ON DELETE SET NULL,
infrastructure/migrations\001_tenancy_foundation.sql-146-    user_id         uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
infrastructure/migrations\001_tenancy_foundation.sql-147-    role_name       TEXT NOT NULL,
infrastructure/migrations\001_tenancy_foundation.sql-148-    status          TEXT NOT NULL DEFAULT 'active'
infrastructure/migrations\001_tenancy_foundation.sql-149-                    CHECK (status IN ('active', 'suspended', 'revoked')),
infrastructure/migrations\001_tenancy_foundation.sql-150-    created_at      timestamptz NOT NULL DEFAULT now(),
infrastructure/migrations\001_tenancy_foundation.sql-151-    created_by      uuid,
infrastructure/migrations\001_tenancy_foundation.sql-152-    updated_at      timestamptz,
infrastructure/migrations\001_tenancy_foundation.sql-153-    updated_by      uuid,
infrastructure/migrations\001_tenancy_foundation.sql:154:    UNIQUE (organization_id, user_id, role_name)
infrastructure/migrations\001_tenancy_foundation.sql-155-);
infrastructure/migrations\001_tenancy_foundation.sql-156-
infrastructure/migrations\001_tenancy_foundation.sql-157-CREATE INDEX IF NOT EXISTS idx_memberships_tenant ON identity.memberships(tenant_id);
infrastructure/migrations\001_tenancy_foundation.sql-158-CREATE INDEX IF NOT EXISTS idx_memberships_user   ON identity.memberships(user_id);
infrastructure/migrations\001_tenancy_foundation.sql-159-
infrastructure/migrations\001_tenancy_foundation.sql-160--- ── row-level security ──────────────────────────────────────────────────────
infrastructure/migrations\001_tenancy_foundation.sql-161--- ENABLE alone is not enough: without FORCE, the table owner bypasses the
infrastructure/migrations\001_tenancy_foundation.sql-162--- policy entirely — which would silently defeat isolation in exactly the
infrastructure/migrations\001_tenancy_foundation.sql-163--- environment where it matters most.
infrastructure/migrations\001_tenancy_foundation.sql-164-
infrastructure/migrations\001_tenancy_foundation.sql-165-ALTER TABLE identity.tenants       ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\001_tenancy_foundation.sql-166-ALTER TABLE identity.tenants       FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\001_tenancy_foundation.sql-167-ALTER TABLE identity.organizations ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\001_tenancy_foundation.sql-168-ALTER TABLE identity.organizations FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\001_tenancy_foundation.sql-169-ALTER TABLE identity.branches      ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\001_tenancy_foundation.sql-170-ALTER TABLE identity.branches      FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\001_tenancy_foundation.sql:171:ALTER TABLE identity.memberships   ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\001_tenancy_foundation.sql:172:ALTER TABLE identity.memberships   FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\001_tenancy_foundation.sql-173-
infrastructure/migrations\001_tenancy_foundation.sql-174-DROP POLICY IF EXISTS tenant_isolation ON identity.tenants;
infrastructure/migrations\001_tenancy_foundation.sql-175-CREATE POLICY tenant_isolation ON identity.tenants
infrastructure/migrations\001_tenancy_foundation.sql-176-    USING (identity.is_platform_admin() OR id = identity.current_tenant_id())
infrastructure/migrations\001_tenancy_foundation.sql-177-    WITH CHECK (identity.is_platform_admin() OR id = identity.current_tenant_id());
infrastructure/migrations\001_tenancy_foundation.sql-178-
infrastructure/migrations\001_tenancy_foundation.sql-179-DROP POLICY IF EXISTS tenant_isolation ON identity.organizations;
infrastructure/migrations\001_tenancy_foundation.sql-180-CREATE POLICY tenant_isolation ON identity.organizations
infrastructure/migrations\001_tenancy_foundation.sql-181-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\001_tenancy_foundation.sql-182-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\001_tenancy_foundation.sql-183-
infrastructure/migrations\001_tenancy_foundation.sql-184-DROP POLICY IF EXISTS tenant_isolation ON identity.branches;
infrastructure/migrations\001_tenancy_foundation.sql-185-CREATE POLICY tenant_isolation ON identity.branches
infrastructure/migrations\001_tenancy_foundation.sql-186-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\001_tenancy_foundation.sql-187-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\001_tenancy_foundation.sql-188-
infrastructure/migrations\001_tenancy_foundation.sql-189-DROP POLICY IF EXISTS tenant_isolation ON identity.memberships;
infrastructure/migrations\001_tenancy_foundation.sql:190:CREATE POLICY tenant_isolation ON identity.memberships
infrastructure/migrations\001_tenancy_foundation.sql-191-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\001_tenancy_foundation.sql-192-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\001_tenancy_foundation.sql-193-
infrastructure/migrations\001_tenancy_foundation.sql-194--- identity.users is deliberately NOT tenant-scoped: one human may hold
infrastructure/migrations\001_tenancy_foundation.sql-195--- memberships in several tenants. Visibility of a user is granted through
infrastructure/migrations\001_tenancy_foundation.sql-196--- membership joins, which ARE tenant-scoped.
infrastructure/migrations\001_tenancy_foundation.sql-197-
infrastructure/migrations\001_tenancy_foundation.sql-198--- ── audit log (append-only) ─────────────────────────────────────────────────
infrastructure/migrations\001_tenancy_foundation.sql-199--- `1.txt` §55: audit records are tamper-resistant and separate from ordinary
infrastructure/migrations\001_tenancy_foundation.sql-200--- application logs. Enforced with rules rather than convention.
--
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-102-
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-103-DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.branches;
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-104-CREATE POLICY registration_bootstrap_insert ON identity.branches
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-105-    FOR INSERT
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-106-    WITH CHECK (
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-107-        identity.in_registration_bootstrap()
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-108-        AND created_by::text = current_setting('app.bootstrap_user', true)
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-109-    );
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-110-
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-111-DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.memberships;
infrastructure/migrations\038_bootstrap_door_requires_definer.sql:112:CREATE POLICY registration_bootstrap_insert ON identity.memberships
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-113-    FOR INSERT
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-114-    WITH CHECK (
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-115-        identity.in_registration_bootstrap()
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-116-        AND created_by::text = current_setting('app.bootstrap_user', true)
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-117-        AND user_id::text   = current_setting('app.bootstrap_user', true)
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-118-    );
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-119-
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-120-DROP POLICY IF EXISTS registration_bootstrap_select ON identity.memberships;
infrastructure/migrations\038_bootstrap_door_requires_definer.sql:121:CREATE POLICY registration_bootstrap_select ON identity.memberships
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-122-    FOR SELECT
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-123-    USING (
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-124-        identity.in_registration_bootstrap()
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-125-        AND user_id::text = current_setting('app.bootstrap_user', true)
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-126-    );
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-127-
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-128-COMMENT ON POLICY registration_bootstrap_insert ON identity.tenants IS
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-129-'Sign-up only. Admits an INSERT while identity.register_workshop holds '
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-130-'app.bootstrap=on AND the effective user is that function''s owner, and only '
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-131-'for a row attributed to app.bootstrap_user. The owner requirement (038) is '
--
infrastructure/migrations\037_registration_rls_bootstrap.sql-107-    WITH CHECK (
infrastructure/migrations\037_registration_rls_bootstrap.sql-108-        current_setting('app.bootstrap', true) = 'on'
infrastructure/migrations\037_registration_rls_bootstrap.sql-109-        AND created_by::text = current_setting('app.bootstrap_user', true)
infrastructure/migrations\037_registration_rls_bootstrap.sql-110-    );
infrastructure/migrations\037_registration_rls_bootstrap.sql-111-
infrastructure/migrations\037_registration_rls_bootstrap.sql-112--- The membership row is the one that grants the caller their own access, so it
infrastructure/migrations\037_registration_rls_bootstrap.sql-113--- is pinned on BOTH columns: the row must be created by the registering user
infrastructure/migrations\037_registration_rls_bootstrap.sql-114--- AND be about the registering user. `created_by` alone would let a future
infrastructure/migrations\037_registration_rls_bootstrap.sql-115--- caller of this door mint a membership for somebody else.
infrastructure/migrations\037_registration_rls_bootstrap.sql-116-DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.memberships;
infrastructure/migrations\037_registration_rls_bootstrap.sql:117:CREATE POLICY registration_bootstrap_insert ON identity.memberships
infrastructure/migrations\037_registration_rls_bootstrap.sql-118-    FOR INSERT
infrastructure/migrations\037_registration_rls_bootstrap.sql-119-    WITH CHECK (
infrastructure/migrations\037_registration_rls_bootstrap.sql-120-        current_setting('app.bootstrap', true) = 'on'
infrastructure/migrations\037_registration_rls_bootstrap.sql-121-        AND created_by::text = current_setting('app.bootstrap_user', true)
infrastructure/migrations\037_registration_rls_bootstrap.sql-122-        AND user_id::text   = current_setting('app.bootstrap_user', true)
infrastructure/migrations\037_registration_rls_bootstrap.sql-123-    );
infrastructure/migrations\037_registration_rls_bootstrap.sql-124-
infrastructure/migrations\037_registration_rls_bootstrap.sql-125--- 🔴 THIS ONE IS WHAT MAKES THE DUPLICATE GUARD REAL.
infrastructure/migrations\037_registration_rls_bootstrap.sql-126--- Without it the guard reads zero rows forever and one person can own several
infrastructure/migrations\037_registration_rls_bootstrap.sql-127--- workshops. It exposes a single person's OWN membership rows, and only while
infrastructure/migrations\037_registration_rls_bootstrap.sql-128--- the flag is on — it is not a general read of the table.
infrastructure/migrations\037_registration_rls_bootstrap.sql-129-DROP POLICY IF EXISTS registration_bootstrap_select ON identity.memberships;
infrastructure/migrations\037_registration_rls_bootstrap.sql:130:CREATE POLICY registration_bootstrap_select ON identity.memberships
infrastructure/migrations\037_registration_rls_bootstrap.sql-131-    FOR SELECT
infrastructure/migrations\037_registration_rls_bootstrap.sql-132-    USING (
infrastructure/migrations\037_registration_rls_bootstrap.sql-133-        current_setting('app.bootstrap', true) = 'on'
infrastructure/migrations\037_registration_rls_bootstrap.sql-134-        AND user_id::text = current_setting('app.bootstrap_user', true)
infrastructure/migrations\037_registration_rls_bootstrap.sql-135-    );
infrastructure/migrations\037_registration_rls_bootstrap.sql-136-
infrastructure/migrations\037_registration_rls_bootstrap.sql-137-COMMENT ON POLICY registration_bootstrap_insert ON identity.tenants IS
infrastructure/migrations\037_registration_rls_bootstrap.sql-138-'Sign-up only. Admits an INSERT while identity.register_workshop holds '
infrastructure/migrations\037_registration_rls_bootstrap.sql-139-'app.bootstrap=on, and only for a row attributed to app.bootstrap_user. '
infrastructure/migrations\037_registration_rls_bootstrap.sql-140-'Registration is the one operation that legitimately has no tenant context — '
--
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-212-GRANT EXECUTE ON FUNCTION identity.in_membership_lookup() TO autoworkshop_app;
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-213-
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-214--- ── 3. the policy ───────────────────────────────────────────────────────────
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-215---
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-216--- SELECT only. It grants no INSERT, UPDATE or DELETE, and it cannot reach a row
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-217--- belonging to anybody other than the subject being resolved: `user_id` is
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-218--- pinned to the flag, and the flag holds a subject taken from a
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-219--- signature-validated token.
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-220-
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-221-DROP POLICY IF EXISTS membership_lookup_select ON identity.memberships;
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql:222:CREATE POLICY membership_lookup_select ON identity.memberships
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-223-    FOR SELECT
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-224-    USING (
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-225-        identity.in_membership_lookup()
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-226-        AND user_id = (
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-227-              SELECT u.id
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-228-                FROM identity.users u
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-229-               WHERE u.keycloak_subject = current_setting('app.membership_lookup', true)
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-230-            )
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-231-    );
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-232-
--
infrastructure/migrations\071_registration_defects_from_codex.sql-81-'the half that cannot be forged from an application connection.';
infrastructure/migrations\071_registration_defects_from_codex.sql-82-
infrastructure/migrations\071_registration_defects_from_codex.sql-83-REVOKE ALL ON FUNCTION identity.in_admin_lookup() FROM PUBLIC;
infrastructure/migrations\071_registration_defects_from_codex.sql-84-GRANT EXECUTE ON FUNCTION identity.in_admin_lookup() TO autoworkshop_app;
infrastructure/migrations\071_registration_defects_from_codex.sql-85-
infrastructure/migrations\071_registration_defects_from_codex.sql-86--- ⚠️ THE NARROWEST POSSIBLE DOOR. It exposes ONLY active
infrastructure/migrations\071_registration_defects_from_codex.sql-87--- `platform_administrator` rows — not every membership — so even if the owner
infrastructure/migrations\071_registration_defects_from_codex.sql-88--- check were somehow satisfied outside the alert, what leaks is the list of
infrastructure/migrations\071_registration_defects_from_codex.sql-89--- administrators' user ids and nothing else. A door sized to the job.
infrastructure/migrations\071_registration_defects_from_codex.sql-90-DROP POLICY IF EXISTS admin_lookup_select ON identity.memberships;
infrastructure/migrations\071_registration_defects_from_codex.sql:91:CREATE POLICY admin_lookup_select ON identity.memberships FOR SELECT USING (
infrastructure/migrations\071_registration_defects_from_codex.sql-92-  identity.in_admin_lookup()
infrastructure/migrations\071_registration_defects_from_codex.sql-93-  AND role_name = 'platform_administrator'
infrastructure/migrations\071_registration_defects_from_codex.sql-94-  AND status = 'active'
infrastructure/migrations\071_registration_defects_from_codex.sql-95-);
infrastructure/migrations\071_registration_defects_from_codex.sql-96-
infrastructure/migrations\071_registration_defects_from_codex.sql-97-CREATE OR REPLACE FUNCTION identity.alert_admins_of_registration()
infrastructure/migrations\071_registration_defects_from_codex.sql-98-RETURNS trigger
infrastructure/migrations\071_registration_defects_from_codex.sql-99-LANGUAGE plpgsql
infrastructure/migrations\071_registration_defects_from_codex.sql-100-SECURITY DEFINER
infrastructure/migrations\071_registration_defects_from_codex.sql-101-SET search_path = identity, comms, pg_catalog, pg_temp
--
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-81-    -- PUBLIC. Without these grants the rehearsal dies on `permission denied for
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-82-    -- schema identity` and proves nothing about RLS — a failure of the harness
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-83-    -- reading exactly like a failure of the product. This repository has lost
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-84-    -- hours to that distinction before.
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-85-    EXECUTE format('GRANT USAGE ON SCHEMA identity, catalogue, core TO %I', sim_role);
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-86-    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA identity, catalogue, core TO %I', sim_role);
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-87-    EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA identity, catalogue TO %I', sim_role);
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-88-
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-89-    EXECUTE format('ALTER FUNCTION identity.enrol_as_customer(TEXT, uuid) OWNER TO %I', sim_role);
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-90-    EXECUTE format('ALTER FUNCTION identity.register_workshop(TEXT, TEXT, TEXT) OWNER TO %I', sim_role);
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql:91:    EXECUTE format('ALTER TABLE identity.memberships   OWNER TO %I', sim_role);
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-92-    EXECUTE format('ALTER TABLE identity.organizations OWNER TO %I', sim_role);
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-93-    EXECUTE format('ALTER TABLE identity.branches      OWNER TO %I', sim_role);
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-94-    EXECUTE format('ALTER TABLE identity.users         OWNER TO %I', sim_role);
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-95-    EXECUTE format('ALTER TABLE catalogue.mechanic_directory OWNER TO %I', sim_role);
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-96-
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-97-    -- ── seed: a workshop, published; a stranger; a staff member ────────────
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-98-    -- Seeded as the superuser BEFORE dropping privileges, so the fixture itself
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-99-    -- never depends on the door being open.
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-100-    SELECT o.tenant_id, o.id, b.id INTO v_tenant, v_org, v_branch
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-101-      FROM identity.organizations o

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "actInOrganization|organisation switcher offers|insurance owner reaches|fleet administrator|towing" apps/e2e/tests/live-signed-in.spec.ts' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 407ms:
378: * insurance and towing an org-admin role, T1a built the screens, slice 17 built
393: * and towing organisations were created on 2026-08-16 so the owner could reach
450:  test('the organisation switcher offers the partner organisations', async ({ page }) => {
468:        'organisation switcher is not rendered and the insurance, towing and ' +
511:  async function actInOrganization(page: import('@playwright/test').Page, match: RegExp) {
526:  test('an insurance owner reaches their own users screen', async ({ page }) => {
528:    const switched = await actInOrganization(page, /insurance/i);
550:  test('an insurance owner reaches My Products, with the enquiry inbox on it', async ({
554:    const switched = await actInOrganization(page, /insurance/i);
579:  test('a fleet administrator reaches the fleet screens built in slice 20', async ({ page }) => {
581:    const switched = await actInOrganization(page, /fleet/i);

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "ON CONFLICT|v_orgs|v_roles|v_missing|SELECT id INTO v_user|WHERE u.email" infrastructure/seed/grant_live_suite_partner_memberships.sql' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 563ms:
102: WHERE u.email = :'live_email'
128:    SELECT id INTO v_user
147:    -- `ON CONFLICT` on the natural key `(organization_id, user_id, role_name)`
166:    ON CONFLICT (organization_id, user_id, role_name) DO NOTHING;
178:    ON CONFLICT (organization_id, user_id, role_name) DO NOTHING;
190:    ON CONFLICT (organization_id, user_id, role_name) DO NOTHING;
213:    v_orgs    int;
214:    v_roles   text[];
215:    v_missing text[];
221:      INTO v_orgs, v_roles
224:     WHERE u.email = v_email;
226:    SELECT array_agg(r) INTO v_missing
228:     WHERE NOT (r = ANY(COALESCE(v_roles, ARRAY[]::text[])));
230:    IF v_missing IS NOT NULL THEN
234:                        v_missing, v_email;
239:    IF v_orgs < 2 THEN
242:                        'a partner workspace.', v_orgs;
245:    RAISE NOTICE 'gate passed: % organisations, roles %', v_orgs, v_roles;
255: WHERE u.email = :'live_email'

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n -C 5 "CREATE TABLE IF NOT EXISTS identity.users|CREATE TABLE identity.users|email.*UNIQUE|UNIQUE.*email" infrastructure/migrations/001_tenancy_foundation.sql infrastructure/migrations' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 390ms:
infrastructure/migrations/001_tenancy_foundation.sql-115--- ── users ───────────────────────────────────────────────────────────────────
infrastructure/migrations/001_tenancy_foundation.sql-116--- Authentication lives in Keycloak (ADR-005). This table holds the application
infrastructure/migrations/001_tenancy_foundation.sql-117--- profile and links to the Keycloak subject. No password material is ever
infrastructure/migrations/001_tenancy_foundation.sql-118--- stored here.
infrastructure/migrations/001_tenancy_foundation.sql-119-
infrastructure/migrations/001_tenancy_foundation.sql:120:CREATE TABLE IF NOT EXISTS identity.users (
infrastructure/migrations/001_tenancy_foundation.sql-121-    id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
infrastructure/migrations/001_tenancy_foundation.sql-122-    keycloak_subject  TEXT NOT NULL UNIQUE,
infrastructure/migrations/001_tenancy_foundation.sql-123-    email             TEXT NOT NULL,
infrastructure/migrations/001_tenancy_foundation.sql-124-    display_name      TEXT NOT NULL,
infrastructure/migrations/001_tenancy_foundation.sql-125-    phone             TEXT,
--
infrastructure/migrations\001_tenancy_foundation.sql-115--- ── users ───────────────────────────────────────────────────────────────────
infrastructure/migrations\001_tenancy_foundation.sql-116--- Authentication lives in Keycloak (ADR-005). This table holds the application
infrastructure/migrations\001_tenancy_foundation.sql-117--- profile and links to the Keycloak subject. No password material is ever
infrastructure/migrations\001_tenancy_foundation.sql-118--- stored here.
infrastructure/migrations\001_tenancy_foundation.sql-119-
infrastructure/migrations\001_tenancy_foundation.sql:120:CREATE TABLE IF NOT EXISTS identity.users (
infrastructure/migrations\001_tenancy_foundation.sql-121-    id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
infrastructure/migrations\001_tenancy_foundation.sql-122-    keycloak_subject  TEXT NOT NULL UNIQUE,
infrastructure/migrations\001_tenancy_foundation.sql-123-    email             TEXT NOT NULL,
infrastructure/migrations\001_tenancy_foundation.sql-124-    display_name      TEXT NOT NULL,
infrastructure/migrations\001_tenancy_foundation.sql-125-    phone             TEXT,

codex
I found five actionable defects. `docs/IMPLEMENTATION_LOG.md` is absent; README.md provides only repository-wide security/operational requirements, not a specific A3 acceptance statement.

- [ ] **Critical** — [grant_live_suite_partner_memberships.sql:128](C:/Users/USER/Documents/autoworkshop-ai/infrastructure/seed/grant_live_suite_partner_memberships.sql:128)  
  **What’s wrong:** The comment promises to refuse unless the email resolves to exactly one account, but `SELECT id INTO v_user` without `STRICT` silently chooses one row. `identity.users.email` is not unique. Duplicate active emails could therefore grant production partner authority to an arbitrary account.  
  **Recommended fix:** Resolve by immutable unique `keycloak_subject`, or use `SELECT ... INTO STRICT` and explicitly handle `NO_DATA_FOUND` and `TOO_MANY_ROWS`. If email remains the identifier, first assert `count(*) = 1`.  
  **Why it matters:** This is a real production authorization grant and contradicts the fail-closed authentication/authorization promise in README.md.

- [ ] **High** — [grant_live_suite_partner_memberships.sql:166](C:/Users/USER/Documents/autoworkshop-ai/infrastructure/seed/grant_live_suite_partner_memberships.sql:166)  
  **What’s wrong:** All three inserts use `ON CONFLICT ... DO NOTHING`. If a matching membership already exists with `status = 'suspended'` or `revoked`, no active membership is created and the workflow can never achieve its stated end state. The same defect occurs at lines 178 and 190.  
  **Recommended fix:** Decide explicitly whether this operator action may reactivate memberships. If so, use a guarded `DO UPDATE SET status = 'active', updated_at = now()`; otherwise detect the inactive conflict and emit a precise refusal explaining the required remediation.  
  **Why it matters:** The advertised idempotent repair fails permanently on a valid schema state and produces a misleading “grants did not take” diagnosis.

- [ ] **High** — [grant_live_suite_partner_memberships.sql:221](C:/Users/USER/Documents/autoworkshop-ai/infrastructure/seed/grant_live_suite_partner_memberships.sql:221)  
  **What’s wrong:** The transaction gate aggregates roles across every organization and merely checks that the user has at least two organizations. It does not verify the three exact `(organization_id, tenant_id, role_name, status)` memberships the workflow claims to create. A matching role held elsewhere can mask a failed target grant, allowing the transaction to commit while one named `[AUDIT]` organization remains unreachable.  
  **Recommended fix:** Gate with three explicit `EXISTS` checks joining each measured organization and requiring the expected tenant, type, active organization, active membership, user, and role. Assert all three target organization IDs, not global role names/counts.  
  **Why it matters:** The workflow can report success without producing the fixture that the tests and run summary promise.

- [ ] **High** — [live-signed-in.spec.ts:519](C:/Users/USER/Documents/autoworkshop-ai/apps/e2e/tests/live-signed-in.spec.ts:519)  
  **What’s wrong:** `selectOption()` is followed by `waitForLoadState('networkidle')`. Because the current page may already be idle, this can resolve before the server-action navigation begins. The subsequent `page.goto()` can then race the cookie-setting action or its redirect.  
  **Recommended fix:** Synchronize against the navigation initiated by the selection, for example with `Promise.all([page.waitForURL(...), switcher.selectOption(...)])`, or wait for an observable post-switch state such as the selected organization/viewer context. Avoid `networkidle` as the sole synchronization signal.  
  **Why it matters:** The new organization-switching path can be flaky or test the old organization, undermining the live verification it was added to provide.

- [ ] **Medium** — [live-signed-in.spec.ts:526](C:/Users/USER/Documents/autoworkshop-ai/apps/e2e/tests/live-signed-in.spec.ts:526)  
  **What’s wrong:** The production workflow grants insurance, towing, and fleet memberships, and the switcher test claims all three partner areas become verifiable, but the suite only enters insurance and fleet organizations. There is no signed-in towing workspace assertion.  
  **Recommended fix:** Add a towing-owner reachability test for at least one concrete towing route and its distinctive content, including the existing “not built yet” exclusion. Alternatively, stop granting towing and narrow all A3 claims if towing is intentionally out of scope.  
  **Why it matters:** One third of the production fixture mutation remains unused and towing can regress while the advertised A3 verification stays green.
tokens used
57,044
