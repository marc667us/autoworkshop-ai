# Review: codex-security-review

_Generated: 2026-07-27T16:15:54-07:00 · backend: codex · model: llama3.2_

## Prompt

> You are Codex acting as Independent Security Reviewer. Review the latest code for authentication, authorization, tenant isolation, PostgreSQL RLS coverage, hidden-route protection, file access protection, token handling, and unsafe data exposure. Pay special attention to: (1) every query on a tenant-owned table must filter by tenant_id; (2) every tenant-owned table must have an RLS policy ENABLE ROW LEVEL SECURITY + tenant policy; (3) hidden admin routes must be backend-protected even if a user guesses the URL; (4) logout must revoke refresh tokens, not just clear browser storage. Return findings with: severity, file:line, attack scenario, recommended fix.

## Repository context

### Changed files (HEAD~1..HEAD)
```
 reviews/codex-review.md             | 2757 +++++++++++++++++++++++++++++++++++
 scripts/guardrails/verify_claims.py |   55 +-
 2 files changed, 2802 insertions(+), 10 deletions(-)
```

### Diff snippet (first 100 lines)
```diff
diff --git a/reviews/codex-review.md b/reviews/codex-review.md
new file mode 100644
index 0000000..c7efd85
--- /dev/null
+++ b/reviews/codex-review.md
@@ -0,0 +1,2757 @@
+# Review: codex-review
+
+_Generated: 2026-07-27T16:05:16-07:00 · backend: codex · model: llama3.2_
+
+## Prompt
+
+> You are Codex acting as Independent Pair Programmer for this repository. Review the latest implementation against the stated requirement in README.md and (if present) docs/IMPLEMENTATION_LOG.md. Identify anything Claude Code missed, misunderstood, or only partially implemented. Return a checklist of defects with: severity (critical/high/medium/low), file:line, what's wrong, recommended fix, why it matters.
+
+## Repository context
+
+### Changed files (HEAD~1..HEAD)
+```
+ apps/admin-web/next.config.mjs      | 14 -------------
+ apps/customer-web/next.config.mjs   | 14 -------------
+ apps/fleet-web/next.config.mjs      | 14 -------------
+ apps/insurance-web/next.config.mjs  | 14 -------------
+ apps/supplier-web/next.config.mjs   | 14 -------------
+ apps/towing-web/next.config.mjs     | 14 -------------
+ apps/workshop-web/next.config.mjs   | 14 -------------
+ scripts/guardrails/verify_claims.py | 40 +++++++++++++++++++++++++++++--------
+ 8 files changed, 32 insertions(+), 106 deletions(-)
+```
+
+### Diff snippet (first 100 lines)
+```diff
+diff --git a/apps/admin-web/next.config.mjs b/apps/admin-web/next.config.mjs
+index 9d12f4b..ac1fcc3 100644
+--- a/apps/admin-web/next.config.mjs
++++ b/apps/admin-web/next.config.mjs
+@@ -22,20 +22,6 @@ const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';
+ const nextConfig = {
+   eslint: { ignoreDuringBuilds: constrainedBuild },
+   typescript: { ignoreBuildErrors: constrainedBuild },
+-  /**
+-   * One worker, in-process, on the deploy builder.
+-   *
+-   * After the checks were skipped the build still died — instantly, in the same
+-   * second, with no output, at "Collecting page data". That step forks a worker
+-   * pool sized from the CPU count, and an immediate silent death there is the
+-   * pool failing to start rather than a page failing to load: a page that
+-   * throws prints its own stack. Next swallows a worker that never comes up.
+-   *
+-   * `cpus: 1` plus `workerThreads: false` keeps page collection in one process.
+-   * It is slower, which is irrelevant for a deploy and would be annoying
+-   * locally — hence the flag.
+-   */
+-  experimental: constrainedBuild ? { cpus: 1, workerThreads: false } : {},
+   reactStrictMode: true,
+   // Shared workspace packages are compiled by this app rather than pre-built,
+   // so a token change is picked up without a separate build step.
+diff --git a/apps/customer-web/next.config.mjs b/apps/customer-web/next.config.mjs
+index 9d12f4b..ac1fcc3 100644
+--- a/apps/customer-web/next.config.mjs
++++ b/apps/customer-web/next.config.mjs
+@@ -22,20 +22,6 @@ const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';
+ const nextConfig = {
+   eslint: { ignoreDuringBuilds: constrainedBuild },
+   typescript: { ignoreBuildErrors: constrainedBuild },
+-  /**
+-   * One worker, in-process, on the deploy builder.
+-   *
+-   * After the checks were skipped the build still died — instantly, in the same
+-   * second, with no output, at "Collecting page data". That step forks a worker
+-   * pool sized from the CPU count, and an immediate silent death there is the
+-   * pool failing to start rather than a page failing to load: a page that
+-   * throws prints its own stack. Next swallows a worker that never comes up.
+-   *
+-   * `cpus: 1` plus `workerThreads: false` keeps page collection in one process.
+-   * It is slower, which is irrelevant for a deploy and would be annoying
+-   * locally — hence the flag.
+-   */
+-  experimental: constrainedBuild ? { cpus: 1, workerThreads: false } : {},
+   reactStrictMode: true,
+   // Shared workspace packages are compiled by this app rather than pre-built,
+   // so a token change is picked up without a separate build step.
+diff --git a/apps/fleet-web/next.config.mjs b/apps/fleet-web/next.config.mjs
+index 9d12f4b..ac1fcc3 100644
+--- a/apps/fleet-web/next.config.mjs
++++ b/apps/fleet-web/next.config.mjs
+@@ -22,20 +22,6 @@ const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';
+ const nextConfig = {
+   eslint: { ignoreDuringBuilds: constrainedBuild },
+   typescript: { ignoreBuildErrors: constrainedBuild },
+-  /**
+-   * One worker, in-process, on the deploy builder.
+-   *
+-   * After the checks were skipped the build still died — instantly, in the same
+-   * second, with no output, at "Collecting page data". That step forks a worker
+-   * pool sized from the CPU count, and an immediate silent death there is the
+-   * pool failing to start rather than a page failing to load: a page that
+-   * throws prints its own stack. Next swallows a worker that never comes up.
+-   *
+-   * `cpus: 1` plus `workerThreads: false` keeps page collection in one process.
+-   * It is slower, which is irrelevant for a deploy and would be annoying
```

## Findings

**Findings**

1. **High** — [apps/api/src/identity/membership.repository.ts:24](</C:/Users/USER/Documents/autoworkshop-ai/apps/api/src/identity/membership.repository.ts:24>)  
   **Issue:** `findByKeycloakSubject()` uses `queryWithoutTenant()` while joining `identity.memberships`, but `identity.memberships` is under RLS and no `app.tenant_id` / admin role is set yet. PostgreSQL will hide all membership rows, so the guard cannot resolve an active tenant context for real users.  
   **Attack scenario:** Any valid Keycloak user is effectively denied because their memberships resolve as empty; auth becomes a platform-wide login outage.  
   **Recommended fix:** Split identity bootstrap from tenant RLS safely: either add a narrowly scoped SECURITY DEFINER function for subject-to-membership resolution, or add a dedicated policy for this lookup keyed by validated server-side subject, not client tenant input. Add an integration test proving `/api/v1/me` resolves memberships as `autoworkshop_app`.

2. **High** — [infrastructure/migrations/001_tenancy_foundation.sql:204](</C:/Users/USER/Documents/autoworkshop-ai/infrastructure/migrations/001_tenancy_foundation.sql:204>) and [infrastructure/migrations/002_application_role.sql:53](</C:/Users/USER/Documents/autoworkshop-ai/infrastructure/migrations/002_application_role.sql:53>)  
   **Issue:** `audit.events` has `tenant_id` and sensitive `detail`, but no `ENABLE ROW LEVEL SECURITY`, no `FORCE ROW LEVEL SECURITY`, and the app role has `SELECT`.  
   **Attack scenario:** Any future audit viewer, SQL injection, or over-broad internal query running as `autoworkshop_app` can read audit events across every tenant, including resource IDs, actor IDs, correlation IDs, and event details.  
   **Recommended fix:** Enable and force RLS on `audit.events`; add a tenant policy using `tenant_id = identity.current_tenant_id()` plus an explicit platform-admin policy if cross-tenant audit access is required. Prefer removing app-level `SELECT` until a scoped audit-read API exists.

3. **High** — [apps/api/src/identity/organization.service.ts:38](</C:/Users/USER/Documents/autoworkshop-ai/apps/api/src/identity/organization.service.ts:38>), [apps/api/src/identity/branch.service.ts:57](</C:/Users/USER/Documents/autoworkshop-ai/apps/api/src/identity/branch.service.ts:57>), [apps/api/src/identity/membership.service.ts:97](</C:/Users/USER/Documents/autoworkshop-ai/apps/api/src/identity/membership.service.ts:97>)  
   **Issue:** Tenant-owned table queries intentionally omit `tenant_id` filters and rely on RLS only. This violates the stated rule that every query on a tenant-owned table must filter by `tenant_id`. It is also an actual exposure path for `platform_administrator`, because the RLS policy allows platform admins to see all tenant rows.  
   **Attack scenario:** A platform admin or compromised admin session hitting a tenant-scoped endpoint like `GET /organizations` can receive all organizations because the query has no `WHERE tenant_id = $ctxTenant`. Direct-ID lookups have the same issue for platform admins.  
   **Recommended fix:** Add explicit `tenant_id = $n` predicates to all tenant-scoped service queries, including list/find/update parent checks. Keep RLS as the backstop, not the only filter. Where true cross-tenant admin views are needed, create separate methods/endpoints named for that behavior and audit them.

4. **Medium** — [apps/admin-web/middleware.ts:14](</C:/Users/USER/Documents/autoworkshop-ai/apps/admin-web/middleware.ts:14>) and [packages/next-shell/src/ModulePage.tsx:72](</C:/Users/USER/Documents/autoworkshop-ai/packages/next-shell/src/ModulePage.tsx:72>)  
   **Issue:** Admin route protection is implemented as route-tree filtering in the catch-all renderer, while middleware explicitly “does NOT gate access.” Concrete `app/.../page.tsx` routes bypass the catch-all by Next.js precedence.  
   **Attack scenario:** When a real admin page is added as a concrete route, a user who guesses the URL can hit that backend-rendered page unless the page repeats the platform-admin check. Hiding the nav entry will not protect it.  
   **Recommended fix:** Add an admin-web middleware or shared server guard that requires an authenticated viewer with `platform.admin` before rendering any non-auth admin route. Keep per-API authorization as well.

5. **Medium** — [packages/auth/src/workspace-auth.ts:220](</C:/Users/USER/Documents/autoworkshop-ai/packages/auth/src/workspace-auth.ts:220>) and [packages/auth/src/workspace-auth.ts:288](</C:/Users/USER/Documents/autoworkshop-ai/packages/auth/src/workspace-auth.ts:288>)  
   **Issue:** The exported `signOut` is Auth.js local sign-out, and the Keycloak logout URL helper is unused. There is no implemented logout flow that revokes the stored refresh token.  
   **Attack scenario:** If a refresh token is stolen before logout, clearing the browser cookie does not invalidate that refresh token; the attacker can continue rotating it until Keycloak session/token expiry.  
   **Recommended fix:** Implement server-side logout that reads the refresh token from the JWT and calls Keycloak’s token revocation endpoint with `token_type_hint=refresh_token`, then clears the local session. Also redirect through Keycloak end-session if SSO logout is required.
ps/fleet-web/next.config.mjs b/apps/fleet-web/next.config.mjs
+index 9d12f4b..ac1fcc3 100644
+--- a/apps/fleet-web/next.config.mjs
++++ b/apps/fleet-web/next.config.mjs
+@@ -22,20 +22,6 @@ const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';
+ const nextConfig = {
+   eslint: { ignoreDuringBuilds: constrainedBuild },
+   typescript: { ignoreBuildErrors: constrainedBuild },
+-  /**
+-   * One worker, in-process, on the deploy builder.
+-   *
+-   * After the checks were skipped the build still died — instantly, in the same
+-   * second, with no output, at "Collecting page data". That step forks a worker
+-   * pool sized from the CPU count, and an immediate silent death there is the
+-   * pool failing to start rather than a page failing to load: a page that
+-   * throws prints its own stack. Next swallows a worker that never comes up.
+-   *
+-   * `cpus: 1` plus `workerThreads: false` keeps page collection in one process.
+-   * It is slower, which is irrelevant for a deploy and would be annoying
```
codex
I’ll review this as a security audit, starting from the current diff but widening into auth/RLS/tenant-owned query paths where the change could hide or document missed issues. I’ll inspect schema/migrations, backend route guards, token/logout flows, and file-serving paths before returning findings only.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg --files' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git status --short' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git diff --stat HEAD~1..HEAD; git diff --name-only HEAD~1..HEAD' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 730ms:
VERSION
turbo.json
tsconfig.base.json
tests\tenant-isolation\rls_proof.sql
SECURITY.md
scripts\_codex-runner.sh
scripts\supervise-codex.sh
scripts\seed-dev-identity.sh
scripts\quality-gate.sh
scripts\guardrails\verify_claims.py
scripts\guardrails\scoped-review.sh
scripts\guardrails\README.md
scripts\guardrails\rag.py
scripts\guardrails\lint-shell-idioms.sh
scripts\codex-test-review.sh
scripts\codex-security-review.sh
scripts\codex-review.sh
scripts\codex-performance-review.sh
scripts\codex-db-review.sh
ROADMAP.md
reviews\supervisor-adjudication-t0030-harness.md
reviews\supervisor-adjudication-t0027-workspace-role.md
reviews\supervisor-adjudication-t0018-scheduling.md
reviews\supervisor-adjudication-t0003-identity.md
reviews\supervisor-adjudication-phase3.md
reviews\supervisor-adjudication-c3-backup.md
reviews\codex-security-review.md
reviews\codex-review.md
reviews\codex-review-t0030-harness.md
reviews\codex-review-t0027-workspace-role.md
reviews\codex-review-t0018-scheduling.md
reviews\codex-review-t0003-identity.md
reviews\codex-review-phase3-pass2.md
reviews\codex-review-phase3-pass1.md
reviews\codex-review-guardrail-selftest.md
reviews\codex-review-c3-backup.md
render.yaml
README.md
pnpm-workspace.yaml
pnpm-lock.yaml
packages\design-tokens\tsconfig.json
packages\ui\vitest.config.ts
packages\ui\tsconfig.json
packages\design-tokens\src\themes.ts
packages\design-tokens\src\primitive.ts
packages\design-tokens\src\index.ts
packages\design-tokens\package.json
packages\ui\src\useMediaQuery.ts
packages\ui\src\useFocusTrap.ts
packages\ui\src\TopNav.tsx
packages\ui\src\ThemeProvider.tsx
packages\ui\src\Tabs.tsx
packages\ui\src\Tabs.test.ts
packages\ui\src\StatusBadge.tsx
packages\ui\src\SideNav.tsx
packages\ui\src\PageHeader.tsx
packages\ui\src\index.ts
packages\ui\src\Drawer.tsx
packages\ui\src\Dialog.tsx
packages\ui\src\Breadcrumbs.tsx
packages\ui\src\AppShell.tsx
packages\ui\src\AiAssistantPanel.tsx
packages\ui\package.json
packages\config\tsconfig.node.json
packages\config\tsconfig.next.json
packages\config\package.json
packages\config\eslint.base.cjs
packages\auth\vitest.config.ts
packages\auth\tsconfig.json
packages\auth\src\workspace-auth.ts
packages\auth\src\tokens.ts
packages\auth\src\tokens.test.ts
packages\auth\src\index.ts
packages\auth\src\config.ts
packages\auth\package.json
packages\next-shell\vitest.config.ts
packages\next-shell\tsconfig.json
package.json
MEMORY.md
MCP.md
packages\next-shell\src\WorkspaceShell.tsx
packages\next-shell\src\viewer.ts
packages\next-shell\src\viewer.test.ts
packages\next-shell\src\viewer-contract.ts
packages\next-shell\src\ModulePage.tsx
packages\next-shell\src\index.ts
packages\next-shell\package.json
packages\navigation\tsconfig.json
packages\navigation\src\workspaces.ts
packages\navigation\src\types.ts
packages\navigation\src\resolve.ts
packages\navigation\src\resolve.test.ts
packages\navigation\src\index.ts
packages\navigation\package.json
infrastructure\migrations\run.sh
infrastructure\migrations\002_application_role.sql
infrastructure\migrations\001_tenancy_foundation.sql
infrastructure\keycloak\realm-autoworkshop.json
infrastructure\keycloak\README.md
infrastructure\keycloak\import-realm.sh
infrastructure\keycloak\client-scope-audience.json
infrastructure\docker\README.md
infrastructure\docker\docker-compose.yml
infrastructure\backup\verify-archiving.sh
infrastructure\backup\schedule\install-windows.ps1
infrastructure\backup\schedule\autoworkshop-backup.cron
infrastructure\backup\run-scheduled.sh
infrastructure\backup\restore-drill.sh
infrastructure\backup\lib.sh
docs\01-product\USER_ROLES.md
docs\01-product\PERMISSION_MATRIX.md
docs\01-product\BUSINESS_RULES.md
infrastructure\backup\drills\drill-20260726T183132Z.md
infrastructure\backup\drills\drill-20260726T175716Z.md
infrastructure\backup\drills\drill-20260726T175053Z.md
infrastructure\backup\drills\drill-20260726T174727Z.md
infrastructure\backup\drills\drill-20260726T173706Z.md
infrastructure\backup\check-backup-health.sh
infrastructure\backup\backup.sh
ARCHITECTURE.md
docs\00-project\RELEASE_PLAN.md
docs\00-project\PROJECT_SCOPE.md
docs\00-project\PLAN_EXTENSION_v1.md
docs\00-project\IMPLEMENTATION_PROGRAMME.md
docs\00-project\DEFINITION_OF_DONE.md
docs\00-project\COMBINED_PLAN_v2.md
CONTRIBUTING.md
context.MD
CLAUDE.md
CHANGELOG.md
apps\workshop-web\tsconfig.json
apps\workshop-web\package.json
apps\workshop-web\next.config.mjs
apps\workshop-web\next-env.d.ts
apps\workshop-web\middleware.ts
apps\workshop-web\Dockerfile
apps\workshop-web\auth.ts
docs\05-database\DATABASE_MIGRATIONS.md
docs\05-database\BACKUP_AND_RESTORE.md
docs\04-security\TENANT_ISOLATION.md
docs\04-security\RBAC.md
apps\workshop-web\app\[...slug]\page.tsx
apps\workshop-web\app\page.tsx
apps\workshop-web\app\layout.tsx
apps\workshop-web\app\home\dashboard\page.tsx
docs\02-architecture\adr\ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md
docs\02-architecture\adr\ADR-016-ZERO-COST-NOW.md
docs\02-architecture\adr\ADR-015-BRING-YOUR-OWN-CONNECTION-FOR-EXTERNAL-PROVIDERS.md
docs\02-architecture\adr\ADR-014-NATS-FOR-DOMAIN-EVENTS;-POSTGRES-FTS-NOW.md
docs\02-architecture\adr\ADR-013-GOOGLE-ADK-OVER-MCP-—-THE-PYTHON\TYPESCRIPT-SPLIT.md
docs\02-architecture\adr\ADR-012-ZERO-COST-TOOLING.md
docs\02-architecture\adr\ADR-011-MULTI-TENANCY-AND-THE-SOLAR-BOUNDARY.md
docs\02-architecture\adr\ADR-010-MCP-GATEWAY-AS-THE-SOLE-AI-BOUNDARY.md
docs\02-architecture\adr\ADR-009-PLAYWRIGHT-FOR-E2E.md
docs\02-architecture\adr\ADR-008-STORYBOOK-AS-THE-COMPONENT-CATALOGUE.md
docs\02-architecture\adr\ADR-007-PENPOT.md
docs\02-architecture\adr\ADR-006-REDIS-FOR-CACHE-AND-SHORT-LIVED-JOBS-ONLY.md
docs\02-architecture\adr\ADR-005-KEYCLOAK-IS-MANDATORY.md
docs\02-architecture\adr\ADR-004-POSTGRESQL-WITH-ROW-LEVEL-SECURITY.md
docs\02-architecture\adr\ADR-003-NESTJS-MODULAR-MONOLITH.md
docs\02-architecture\adr\ADR-002-NEXT.JS-APP-ROUTER-FOR-ALL-SEVEN-WEB-APPLICATIONS.md
docs\02-architecture\adr\ADR-001-MONOREPO.md
apps\workshop-web\app\api\auth\[...nextauth]\route.ts
apps\towing-web\tsconfig.json
apps\towing-web\package.json
apps\towing-web\next.config.mjs
apps\towing-web\next-env.d.ts
apps\towing-web\middleware.ts
apps\towing-web\auth.ts
docs\10-testing\TEST_STRATEGY.md
apps\fleet-web\tsconfig.json
apps\fleet-web\package.json
apps\fleet-web\next.config.mjs
apps\fleet-web\next-env.d.ts
apps\fleet-web\middleware.ts
apps\fleet-web\auth.ts
apps\towing-web\app\[...slug]\page.tsx
apps\towing-web\app\page.tsx
apps\admin-web\tsconfig.json
apps\admin-web\package.json
apps\admin-web\next.config.mjs
apps\admin-web\next-env.d.ts
apps\admin-web\middleware.ts
apps\admin-web\auth.ts
apps\towing-web\app\layout.tsx
apps\fleet-web\app\[...slug]\page.tsx
apps\fleet-web\app\page.tsx
apps\fleet-web\app\layout.tsx
apps\admin-web\app\[...slug]\page.tsx
apps\admin-web\app\page.tsx
apps\admin-web\app\layout.tsx
apps\towing-web\app\api\auth\[...nextauth]\route.ts
apps\fleet-web\app\api\auth\[...nextauth]\route.ts
apps\supplier-web\tsconfig.json
apps\supplier-web\package.json
apps\supplier-web\next.config.mjs
apps\supplier-web\next-env.d.ts
apps\supplier-web\middleware.ts
apps\supplier-web\auth.ts
apps\admin-web\app\api\auth\[...nextauth]\route.ts
ai-coworkers\task-handoff-template.md
ai-coworkers\supervisor-role.md
ai-coworkers\supervisor-prompts.md
ai-coworkers\supervisor-checklist.md
ai-coworkers\quality-gates.md
ai-coworkers\pair-review-checklist.md
ai-coworkers\codex-role.md
ai-coworkers\codex-review-prompts.md
ai-coworkers\claude-role.md
.env.example
apps\supplier-web\app\[...slug]\page.tsx
apps\supplier-web\app\page.tsx
apps\supplier-web\app\layout.tsx
apps\api\vitest.config.ts
apps\api\tsconfig.json
apps\api\src\tenancy\tenant-context.ts
apps\api\src\tenancy\tenant-context.spec.ts
apps\api\src\main.ts
apps\supplier-web\app\api\auth\[...nextauth]\route.ts
apps\api\src\identity\user.service.ts
apps\api\src\identity\organization.service.ts
apps\api\src\identity\organization.controller.ts
apps\api\src\identity\membership.service.ts
apps\api\src\identity\membership.repository.ts
apps\api\src\identity\me.service.ts
apps\api\src\identity\identity.spec.ts
apps\api\src\identity\identity.module.ts
apps\api\src\identity\identity.controllers.ts
apps\api\src\identity\branch.service.ts
apps\storybook\tsconfig.json
apps\api\src\health\health.controller.ts
apps\api\src\health\health.controller.spec.ts
apps\api\src\database\database.service.ts
apps\api\src\database\database.module.ts
apps\api\src\database\database.integration.spec.ts
apps\api\src\authz\permission-matrix.ts
apps\api\src\authz\permission-matrix.spec.ts
apps\storybook\stories\TopNav.stories.tsx
apps\storybook\stories\ThemeToggle.stories.tsx
apps\storybook\stories\Tabs.stories.tsx
apps\storybook\stories\StatusBadge.stories.tsx
apps\storybook\stories\SideNav.stories.tsx
apps\storybook\stories\PageHeader.stories.tsx
apps\storybook\stories\Drawer.stories.tsx
apps\storybook\stories\Dialog.stories.tsx
apps\storybook\stories\Breadcrumbs.stories.tsx
apps\storybook\stories\AppShell.stories.tsx
apps\api\src\auth\tenant.guard.ts
apps\storybook\stories\AiAssistantPanel.stories.tsx
apps\api\src\auth\keycloak-jwt.spec.ts
apps\api\src\auth\keycloak-jwt.service.ts
apps\api\src\auth\auth.module.ts
apps\storybook\package.json
apps\api\src\audit\audit.service.ts
apps\api\src\audit\audit.module.ts
apps\api\src\app.module.ts
apps\api\package.json
apps\api\nest-cli.json
apps\customer-web\tsconfig.json
apps\customer-web\package.json
apps\customer-web\next.config.mjs
apps\customer-web\next-env.d.ts
apps\customer-web\middleware.ts
apps\customer-web\auth.ts
apps\customer-web\app\layout.tsx
apps\customer-web\app\[...slug]\page.tsx
apps\customer-web\app\page.tsx
apps\e2e\tsconfig.json
apps\insurance-web\tsconfig.json
apps\insurance-web\package.json
apps\insurance-web\next.config.mjs
apps\insurance-web\next-env.d.ts
apps\insurance-web\middleware.ts
apps\insurance-web\auth.ts
apps\e2e\tests\shell-journey.spec.ts
apps\e2e\tests\component-behaviour.spec.ts
apps\e2e\tests\build-freshness.setup.ts
apps\e2e\tests\a11y-workspaces.spec.ts
apps\e2e\tests\a11y-storybook.spec.ts
apps\e2e\playwright.config.ts
apps\e2e\package.json
apps\customer-web\app\api\auth\[...nextauth]\route.ts
apps\insurance-web\app\layout.tsx
apps\insurance-web\app\[...slug]\page.tsx
apps\insurance-web\app\page.tsx
apps\insurance-web\app\api\auth\[...nextauth]\route.ts

 succeeded in 777ms:
?? reviews/codex-security-review.md

 succeeded in 878ms:
 reviews/codex-review.md             | 2757 +++++++++++++++++++++++++++++++++++
 scripts/guardrails/verify_claims.py |   55 +-
 2 files changed, 2802 insertions(+), 10 deletions(-)
reviews/codex-review.md
scripts/guardrails/verify_claims.py

codex
The worktree has one untracked review file already present, so I’ll leave it alone and focus on reading. The current commit only changed a generated review and a guardrail script, but your requested security surface spans the API, migrations, and web auth middleware.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"tenant_id|tenantId|SET app|current_setting|ENABLE ROW LEVEL SECURITY|CREATE POLICY|ALTER TABLE|CREATE TABLE\" infrastructure apps\\api tests docs\\04-security" in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "logout|signOut|refresh|refresh_token|NEXTAUTH|session|jwt|token|Keycloak|revoke" apps packages infrastructure' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"Guard|UseGuards|Controller|Get\\(|Post\\(|Delete\\(|Patch\\(|Put\\(|Roles|admin|hidden|route|middleware|matcher|redirect|notFound|unauthorized\" apps packages" in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"readFile|createReadStream|sendFile|static|download|upload|file|path\\.join|Storage|S3|blob|bucket|public\" apps packages infrastructure" in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 2022ms:
apps\workshop-web\middleware.ts:6: * Running `auth` as middleware is what PERSISTS a refreshed Keycloak access
apps\workshop-web\middleware.ts:7: * token. The refresh itself happens in the `jwt` callback, but only middleware
apps\workshop-web\middleware.ts:19: * The matcher is written out rather than imported because Next requires
apps\workshop-web\middleware.ts:27:  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
apps\workshop-web\Dockerfile:48:# `auth` as middleware and Auth.js resolves its config while the route is built,
apps\workshop-web\Dockerfile:80:# Render assigns the port and routes to it. A server listening on a hardcoded
apps\workshop-web\auth.ts:6: * `workspaceAuth` memoises per workspace, so the route handler, the middleware
apps\workshop-web\app\[...slug]\page.tsx:4: * Catch-all for every navigable route in this workspace. The navigation tree is
apps\workshop-web\app\[...slug]\page.tsx:12:  // advertise a module whose route then 404s.
apps\workshop-web\app\page.tsx:1:import { redirect } from 'next/navigation';
apps\workshop-web\app\page.tsx:5: * A redirect, so the dashboard keeps exactly ONE canonical URL — two routes
apps\workshop-web\app\page.tsx:10:  redirect('/home/dashboard');
apps\workshop-web\app\layout.tsx:23: * single source shared with this workspace's catch-all route — React's
apps\workshop-web\app\layout.tsx:25: * navigation and the router cannot disagree about what may be seen.
apps\workshop-web\app\home\dashboard\page.tsx:18: * first loads the route, so with a real session the first visitor's role and
apps\workshop-web\app\home\dashboard\page.tsx:44:     * A concrete `page.tsx` takes precedence over the catch-all, so this route
apps\workshop-web\app\home\dashboard\page.tsx:148:                by then correctly hidden. A page that explains the permission
apps\workshop-web\app\home\dashboard\page.tsx:150:                misinformation. Same lesson as the nav/router grants split. */}
apps\workshop-web\app\home\dashboard\page.tsx:183:            <strong>Page content is not built yet.</strong> Every other route renders an honest “not built” page
apps\workshop-web\app\api\auth\[...nextauth]\route.ts:6: * The Keycloak redirect URI registered in the realm is `/api/auth/callback/
apps\workshop-web\app\api\auth\[...nextauth]\route.ts:8: * realm's `redirectUris` would have to move with it.
apps\towing-web\middleware.ts:6: * Running `auth` as middleware is what PERSISTS a refreshed Keycloak access
apps\towing-web\middleware.ts:7: * token. The refresh itself happens in the `jwt` callback, but only middleware
apps\towing-web\middleware.ts:19: * The matcher is written out rather than imported because Next requires
apps\towing-web\middleware.ts:27:  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
apps\towing-web\auth.ts:6: * `workspaceAuth` memoises per workspace, so the route handler, the middleware
apps\towing-web\app\[...slug]\page.tsx:4: * Catch-all for every navigable route in this workspace. The navigation tree is
apps\towing-web\app\[...slug]\page.tsx:12:  // advertise a module whose route then 404s.
apps\towing-web\app\page.tsx:1:import { redirect } from 'next/navigation';
apps\towing-web\app\page.tsx:5: * A redirect, so the dashboard keeps exactly ONE canonical URL — two routes
apps\towing-web\app\page.tsx:10:  redirect('/operations/dashboard');
apps\towing-web\app\layout.tsx:23: * single source shared with this workspace's catch-all route — React's
apps\towing-web\app\layout.tsx:25: * navigation and the router cannot disagree about what may be seen.
apps\towing-web\app\api\auth\[...nextauth]\route.ts:6: * The Keycloak redirect URI registered in the realm is `/api/auth/callback/
apps\towing-web\app\api\auth\[...nextauth]\route.ts:8: * realm's `redirectUris` would have to move with it.
apps\supplier-web\middleware.ts:6: * Running `auth` as middleware is what PERSISTS a refreshed Keycloak access
apps\supplier-web\middleware.ts:7: * token. The refresh itself happens in the `jwt` callback, but only middleware
apps\supplier-web\middleware.ts:19: * The matcher is written out rather than imported because Next requires
apps\supplier-web\middleware.ts:27:  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
apps\supplier-web\auth.ts:6: * `workspaceAuth` memoises per workspace, so the route handler, the middleware
apps\supplier-web\app\[...slug]\page.tsx:4: * Catch-all for every navigable route in this workspace. The navigation tree is
apps\supplier-web\app\[...slug]\page.tsx:12:  // advertise a module whose route then 404s.
apps\supplier-web\app\page.tsx:1:import { redirect } from 'next/navigation';
apps\supplier-web\app\page.tsx:5: * A redirect, so the dashboard keeps exactly ONE canonical URL — two routes
apps\supplier-web\app\page.tsx:10:  redirect('/home/dashboard');
apps\supplier-web\app\layout.tsx:23: * single source shared with this workspace's catch-all route — React's
apps\supplier-web\app\layout.tsx:25: * navigation and the router cannot disagree about what may be seen.
apps\supplier-web\app\api\auth\[...nextauth]\route.ts:6: * The Keycloak redirect URI registered in the realm is `/api/auth/callback/
apps\supplier-web\app\api\auth\[...nextauth]\route.ts:8: * realm's `redirectUris` would have to move with it.
apps\storybook\stories\Tabs.stories.tsx:41: * exists and is not yet reachable, which a hidden tab cannot do.
apps\storybook\stories\SideNav.stories.tsx:13: * The route and the API deny independently — see CLAUDE.md §8. The router was
apps\storybook\stories\SideNav.stories.tsx:125:/** Platform admin — the largest tree, 25 entries (§39). */
apps\storybook\stories\SideNav.stories.tsx:129:    groups: requireWorkspace('admin').groups,
apps\storybook\stories\SideNav.stories.tsx:131:    expanded: requireWorkspace('admin').groups.map((g) => g.id),
packages\next-shell\src\WorkspaceShell.tsx:42:   * what protects the page — the route guard, the API and RLS deny
packages\next-shell\src\WorkspaceShell.tsx:58:   * router cannot end up on different trees. Threading the value is not a
apps\storybook\stories\AppShell.stories.tsx:83:  args: { ...base, workspace: requireWorkspace('admin'), pathname: '/tenants' },
apps\storybook\stories\AppShell.stories.tsx:88: * and the router, reading the same grants, 404s those URLs rather than
apps\insurance-web\middleware.ts:6: * Running `auth` as middleware is what PERSISTS a refreshed Keycloak access
apps\insurance-web\middleware.ts:7: * token. The refresh itself happens in the `jwt` callback, but only middleware
apps\insurance-web\middleware.ts:19: * The matcher is written out rather than imported because Next requires
apps\insurance-web\middleware.ts:27:  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
apps\insurance-web\auth.ts:6: * `workspaceAuth` memoises per workspace, so the route handler, the middleware
apps\insurance-web\app\[...slug]\page.tsx:4: * Catch-all for every navigable route in this workspace. The navigation tree is
apps\insurance-web\app\[...slug]\page.tsx:12:  // advertise a module whose route then 404s.
apps\insurance-web\app\page.tsx:1:import { redirect } from 'next/navigation';
apps\insurance-web\app\page.tsx:5: * A redirect, so the dashboard keeps exactly ONE canonical URL — two routes
apps\insurance-web\app\page.tsx:10:  redirect('/home/dashboard');
apps\insurance-web\app\layout.tsx:23: * single source shared with this workspace's catch-all route — React's
apps\insurance-web\app\layout.tsx:25: * navigation and the router cannot disagree about what may be seen.
packages\next-shell\src\viewer.ts:23: * exist. Enforcement is the API's `TenantGuard` and Postgres RLS, which deny
packages\next-shell\src\viewer.ts:31: * page and a catch-all route all asking who the viewer is produce ONE HTTP call
packages\next-shell\src\viewer.ts:34: * disagree if a membership changed mid-render, which is precisely the nav/router
packages\next-shell\src\viewer.ts:39:  // No session, or a session whose access token has expired without middleware
packages\next-shell\src\viewer.ts:49:      // the next user who lands on the same rendered route.
packages\next-shell\src\viewer.ts:77: * and the route resolver.
apps\insurance-web\app\api\auth\[...nextauth]\route.ts:6: * The Keycloak redirect URI registered in the realm is `/api/auth/callback/
apps\insurance-web\app\api\auth\[...nextauth]\route.ts:8: * realm's `redirectUris` would have to move with it.
apps\fleet-web\middleware.ts:6: * Running `auth` as middleware is what PERSISTS a refreshed Keycloak access
apps\fleet-web\middleware.ts:7: * token. The refresh itself happens in the `jwt` callback, but only middleware
apps\fleet-web\middleware.ts:19: * The matcher is written out rather than imported because Next requires
apps\fleet-web\middleware.ts:27:  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
apps\fleet-web\auth.ts:6: * `workspaceAuth` memoises per workspace, so the route handler, the middleware
apps\fleet-web\app\[...slug]\page.tsx:4: * Catch-all for every navigable route in this workspace. The navigation tree is
apps\fleet-web\app\[...slug]\page.tsx:12:  // advertise a module whose route then 404s.
apps\fleet-web\app\page.tsx:1:import { redirect } from 'next/navigation';
apps\fleet-web\app\page.tsx:5: * A redirect, so the dashboard keeps exactly ONE canonical URL — two routes
apps\fleet-web\app\page.tsx:10:  redirect('/home/dashboard');
apps\fleet-web\app\layout.tsx:23: * single source shared with this workspace's catch-all route — React's
apps\fleet-web\app\layout.tsx:25: * navigation and the router cannot disagree about what may be seen.
apps\fleet-web\app\api\auth\[...nextauth]\route.ts:6: * The Keycloak redirect URI registered in the realm is `/api/auth/callback/
apps\fleet-web\app\api\auth\[...nextauth]\route.ts:8: * realm's `redirectUris` would have to move with it.
apps\e2e\tests\shell-journey.spec.ts:23: * two routes over.
apps\e2e\tests\shell-journey.spec.ts:73: * this viewer does not hold. Derived, never hardcoded: hardcoding a route makes
apps\e2e\tests\shell-journey.spec.ts:74: * the test stop testing the moment that route's permission changes.
apps\e2e\tests\shell-journey.spec.ts:154:      // `"grants":["organization.admin"]`: the viewer's own grants, which the
apps\e2e\tests\shell-journey.spec.ts:178:   * for this viewer. That skip is legitimate per workspace — a platform admin
apps\e2e\tests\shell-journey.spec.ts:196:        'catch-all route is completely untested. That is how this assertion silently ' +
apps\e2e\tests\shell-journey.spec.ts:203:test.describe('nav and router agree — defect 3: two literals in two files', () => {
apps\e2e\tests\shell-journey.spec.ts:208:   * this asserts it in a real browser against the real router, which is where
apps\e2e\tests\build-freshness.setup.ts:52: * The URL must be percent-DECODED first. Next's catch-all route ships as
apps\e2e\tests\build-freshness.setup.ts:82:    // Scanning only form 1 leaves a false-pass path: a route whose stale chunk
apps\e2e\tests\a11y-storybook.spec.ts:41:  // Guards against the whole suite passing vacuously because the index was
apps\e2e\playwright.config.ts:34:  { name: 'admin', port: 3006 },
apps\e2e\playwright.config.ts:133:        // in. Since T-0005 every app runs `auth` as middleware on every matched
apps\e2e\playwright.config.ts:135:        // so without this the suite would get a 500 from every route and report
apps\customer-web\middleware.ts:6: * Running `auth` as middleware is what PERSISTS a refreshed Keycloak access
apps\customer-web\middleware.ts:7: * token. The refresh itself happens in the `jwt` callback, but only middleware
apps\customer-web\middleware.ts:19: * The matcher is written out rather than imported because Next requires
apps\customer-web\middleware.ts:27:  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
apps\customer-web\auth.ts:6: * `workspaceAuth` memoises per workspace, so the route handler, the middleware
apps\customer-web\app\[...slug]\page.tsx:4: * Catch-all for every navigable route in this workspace. The navigation tree is
apps\customer-web\app\[...slug]\page.tsx:12:  // advertise a module whose route then 404s.
apps\customer-web\app\page.tsx:1:import { redirect } from 'next/navigation';
apps\customer-web\app\page.tsx:5: * A redirect, so the dashboard keeps exactly ONE canonical URL — two routes
apps\customer-web\app\page.tsx:10:  redirect('/home/dashboard');
apps\customer-web\app\layout.tsx:23: * single source shared with this workspace's catch-all route — React's
apps\customer-web\app\layout.tsx:25: * navigation and the router cannot disagree about what may be seen.
apps\customer-web\app\api\auth\[...nextauth]\route.ts:6: * The Keycloak redirect URI registered in the realm is `/api/auth/callback/
apps\customer-web\app\api\auth\[...nextauth]\route.ts:8: * realm's `redirectUris` would have to move with it.
apps\api\src\identity\organization.service.ts:14:/** Roles permitted to create an organization. */
apps\api\src\identity\organization.service.ts:15:const CAN_CREATE_ORG = new Set(['platform_administrator', 'workshop_owner', 'supplier_owner', 'fleet_administrator']);
apps\api\src\identity\organization.controller.ts:3:  Controller,
apps\api\src\identity\organization.controller.ts:9:  UseGuards,
apps\api\src\identity\organization.controller.ts:11:import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
apps\api\src\identity\organization.controller.ts:22:@Controller('organizations')
apps\api\src\identity\organization.controller.ts:23:@UseGuards(TenantGuard)
apps\api\src\identity\organization.controller.ts:24:export class OrganizationController {
apps\api\src\identity\organization.controller.ts:27:  @Get()
apps\api\src\identity\organization.controller.ts:32:  @Get(':id')
apps\api\src\identity\organization.controller.ts:40:  @Post()
apps\api\src\identity\membership.service.ts:22: * Roles permitted to grant or withdraw a membership.
apps\api\src\identity\membership.service.ts:35:  'platform_administrator',
apps\api\src\identity\membership.service.ts:38:  'fleet_administrator',
apps\api\src\identity\membership.service.ts:42: * Roles a membership may confer.
apps\api\src\identity\membership.service.ts:64:  'fleet_administrator',
apps\api\src\identity\membership.service.ts:132:      // which is the disclosure the catch-all route was already fixed to avoid.
apps\api\src\identity\me.service.ts:39: * role arrives from `TenantContext`, which `TenantGuard` resolved from the
apps\api\src\identity\me.service.ts:44: * it and requests a gated route still meets the API's own role checks and RLS,
apps\api\src\identity\identity.spec.ts:211:    // the same disclosure the catch-all route was already fixed to avoid.
apps\api\src\identity\identity.spec.ts:309:    // Guards against a revoked membership being silently reactivated by a
apps\api\src\identity\identity.module.ts:4:  BranchController,
apps\api\src\identity\identity.module.ts:5:  MeController,
apps\api\src\identity\identity.module.ts:6:  MembershipController,
apps\api\src\identity\identity.module.ts:7:  UserController,
apps\api\src\identity\identity.module.ts:12:import { OrganizationController } from './organization.controller';
apps\api\src\identity\identity.module.ts:18:    OrganizationController,
apps\api\src\identity\identity.module.ts:19:    BranchController,
apps\api\src\identity\identity.module.ts:20:    UserController,
apps\api\src\identity\identity.module.ts:21:    MembershipController,
apps\api\src\identity\identity.module.ts:22:    MeController,
apps\api\src\identity\identity.controllers.ts:3:  Controller,
apps\api\src\identity\identity.controllers.ts:11:  UseGuards,
apps\api\src\identity\identity.controllers.ts:13:import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
apps\api\src\identity\identity.controllers.ts:22: * Thin by design, exactly like `OrganizationController`: authenticate, resolve
apps\api\src\identity\identity.controllers.ts:32:@Controller('branches')
apps\api\src\identity\identity.controllers.ts:33:@UseGuards(TenantGuard)
apps\api\src\identity\identity.controllers.ts:34:export class BranchController {
apps\api\src\identity\identity.controllers.ts:37:  @Get()
apps\api\src\identity\identity.controllers.ts:42:  @Get(':id')
apps\api\src\identity\identity.controllers.ts:47:  @Post()
apps\api\src\identity\identity.controllers.ts:56:@Controller('users')
apps\api\src\identity\identity.controllers.ts:57:@UseGuards(TenantGuard)
apps\api\src\identity\identity.controllers.ts:58:export class UserController {
apps\api\src\identity\identity.controllers.ts:61:  @Get()
apps\api\src\identity\identity.controllers.ts:66:  @Get(':id')
apps\api\src\identity\identity.controllers.ts:72:@Controller('memberships')
apps\api\src\identity\identity.controllers.ts:73:@UseGuards(TenantGuard)
apps\api\src\identity\identity.controllers.ts:74:export class MembershipController {
apps\api\src\identity\identity.controllers.ts:77:  @Get()
apps\api\src\identity\identity.controllers.ts:86:  @Post()
apps\api\src\identity\identity.controllers.ts:99:  @Patch(':id/status')
apps\api\src\identity\identity.controllers.ts:116:@Controller('me')
apps\api\src\identity\identity.controllers.ts:117:@UseGuards(TenantGuard)
apps\api\src\identity\identity.controllers.ts:118:export class MeController {
apps\api\src\identity\identity.controllers.ts:121:  @Get()
apps\api\src\identity\branch.service.ts:17: * Roles permitted to create a branch.
apps\api\src\identity\branch.service.ts:25:  'platform_administrator',
apps\api\src\identity\branch.service.ts:28:  'fleet_administrator',
apps\api\src\health\health.controller.ts:1:import { Controller, Get } from '@nestjs/common';
apps\api\src\health\health.controller.ts:3:@Controller('health')
apps\api\src\health\health.controller.ts:4:export class HealthController {
apps\api\src\health\health.controller.ts:5:  @Get()
apps\api\src\health\health.controller.spec.ts:2:import { HealthController } from './health.controller';
apps\api\src\health\health.controller.spec.ts:4:describe('HealthController', () => {
apps\api\src\health\health.controller.spec.ts:6:    const result = new HealthController().check();
apps\api\src\authz\permission-matrix.ts:7: * `finance.read`, `organization.admin` and `platform.admin`, and no code
apps\api\src\authz\permission-matrix.ts:16: *   · `02.txt` §58 / `01 (1).txt` §32 — the administration surface is visible
apps\api\src\authz\permission-matrix.ts:17: *     only to authorised administrative, security and operational users, which
apps\api\src\authz\permission-matrix.ts:18: *     is what `platform.admin` gates.
apps\api\src\authz\permission-matrix.ts:36:  organizationAdmin: 'organization.admin',
apps\api\src\authz\permission-matrix.ts:37:  /** §32 — the platform administration surface in its entirety. */
apps\api\src\authz\permission-matrix.ts:38:  platformAdmin: 'platform.admin',
apps\api\src\authz\permission-matrix.ts:76:  /** §32 — the whole administration surface, plus the two it supersedes. */
apps\api\src\authz\permission-matrix.ts:77:  platform_administrator: [platformAdmin, organizationAdmin, financeRead],
apps\api\src\authz\permission-matrix.ts:81:  fleet_administrator: [financeRead, organizationAdmin],
apps\api\src\authz\permission-matrix.spec.ts:21:  it('grants platform.admin to exactly one role', () => {
apps\api\src\authz\permission-matrix.spec.ts:22:    // §32 — the administration surface is for authorised administrative users.
apps\api\src\authz\permission-matrix.spec.ts:27:    expect(holders).toEqual(['platform_administrator']);
apps\api\src\authz\permission-matrix.spec.ts:59:  it('does not let an operational role administer the organisation', () => {
apps\api\src\authz\permission-matrix.spec.ts:92:    'fleet_administrator',
apps\api\src\authz\permission-matrix.spec.ts:106:    const grantable = new Set([...GRANTABLE, 'platform_administrator']);
apps\api\src\authz\permission-matrix.spec.ts:112:    // Guards against the matrix growing speculative keys no screen consumes,
apps\api\src\auth\tenant.guard.ts:38:export class TenantGuard implements CanActivate {
apps\api\src\auth\keycloak-jwt.spec.ts:60:    expect(v.realmRoles).toContain('mechanic');
apps\api\src\auth\keycloak-jwt.service.ts:10:  realmRoles: string[];
apps\api\src\auth\keycloak-jwt.service.ts:85:    // Roles are read for observability and coarse checks only. Authorization
apps\api\src\auth\keycloak-jwt.service.ts:88:    const realmRoles: string[] =
apps\api\src\auth\keycloak-jwt.service.ts:94:      realmRoles,
apps\api\src\auth\auth.module.ts:4:import { TenantGuard } from './tenant.guard';
apps\api\src\auth\auth.module.ts:9:  providers: [KeycloakJwtService, TenantGuard],
apps\api\src\auth\auth.module.ts:10:  exports: [KeycloakJwtService, TenantGuard],
apps\api\src\app.module.ts:6:import { HealthController } from './health/health.controller';
apps\api\src\app.module.ts:25:  controllers: [HealthController],
apps\admin-web\package.json:2:  "name": "@autoworkshop/admin-web",
apps\admin-web\middleware.ts:6: * Running `auth` as middleware is what PERSISTS a refreshed Keycloak access
apps\admin-web\middleware.ts:7: * token. The refresh itself happens in the `jwt` callback, but only middleware
apps\admin-web\middleware.ts:19: * The matcher is written out rather than imported because Next requires
apps\admin-web\middleware.ts:27:  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
apps\admin-web\auth.ts:4: * This app's Auth.js instance — the admin workspace.
apps\admin-web\auth.ts:6: * `workspaceAuth` memoises per workspace, so the route handler, the middleware
apps\admin-web\auth.ts:12: * (`autoworkshop-admin-web`); there is nothing per-app to configure here.
apps\admin-web\auth.ts:24:const instance: WorkspaceAuth = workspaceAuth('admin');
apps\admin-web\app\[...slug]\page.tsx:4: * Catch-all for every navigable route in this workspace. The navigation tree is
apps\admin-web\app\[...slug]\page.tsx:12:  // advertise a module whose route then 404s.
apps\admin-web\app\[...slug]\page.tsx:13:  return renderModulePage('admin', slug, await viewerGrants('admin'));
apps\admin-web\app\page.tsx:1:import { redirect } from 'next/navigation';
apps\admin-web\app\page.tsx:5: * A redirect, so the dashboard keeps exactly ONE canonical URL — two routes
apps\admin-web\app\page.tsx:10:  redirect('/home/operations-dashboard');
apps\admin-web\app\layout.tsx:13:  description: 'Platform administrators — organizations, security, incidents',
apps\admin-web\app\layout.tsx:23: * single source shared with this workspace's catch-all route — React's
apps\admin-web\app\layout.tsx:25: * navigation and the router cannot disagree about what may be seen.
apps\admin-web\app\layout.tsx:31:  const viewer = await currentViewer('admin');
apps\admin-web\app\layout.tsx:42:          workspaceId="admin"
apps\admin-web\app\api\auth\[...nextauth]\route.ts:6: * The Keycloak redirect URI registered in the realm is `/api/auth/callback/
apps\admin-web\app\api\auth\[...nextauth]\route.ts:8: * realm's `redirectUris` would have to move with it.
packages\auth\src\workspace-auth.ts:59:  /** Mount at `app/api/auth/[...nextauth]/route.ts`. */
packages\auth\src\workspace-auth.ts:61:  /** Read the session in a server component, route handler or middleware. */
packages\auth\src\workspace-auth.ts:90: * skips the middleware will re-refresh on every render and persist none of it.
packages\auth\src\workspace-auth.ts:99:    // than when Next collects this route during `next build` — otherwise the
packages\auth\src\workspace-auth.ts:115:     * host decides which absolute URL is sent to Keycloak as `redirect_uri`, so
packages\auth\src\workspace-auth.ts:118:     * explicit `redirectUris` allow-list, and a `redirect_uri` outside it is
packages\auth\src\workspace-auth.ts:137:         * route fails with `InvalidEndpoints: Provider "keycloak" is missing
packages\auth\src\workspace-auth.ts:141:         * never touch the provider — only `/api/auth/*` and the middleware do.
packages\auth\src\workspace-auth.ts:236:      // an app with no auth configured fail every route with a 500 — including
packages\auth\src\workspace-auth.ts:272: * on every render. More importantly the app's route handler and the shell's
packages\auth\src\workspace-auth.ts:301:  url.searchParams.set('post_logout_redirect_uri', postLogoutRedirect);
packages\auth\src\index.ts:8: * Which requests the auth middleware must see.
packages\auth\src\index.ts:10: * MIDDLEWARE IS NOT OPTIONAL and this matcher is why. The `jwt` callback
packages\auth\src\index.ts:11: * refreshes the Keycloak access token, but only middleware may write the
packages\auth\src\index.ts:17: * `api/auth` is excluded because Auth.js's own routes manage the cookie
packages\auth\src\config.ts:7: * module load. A module-scope read is evaluated when Next collects the route
packages\auth\src\config.ts:55: * which fails at the Keycloak redirect with "Client not found", after the user
packages\next-shell\src\viewer.test.ts:12: * REGRESSION GUARD: the navigation and the router must resolve from the SAME
packages\next-shell\src\viewer.test.ts:16: * to the shell while the catch-all route resolved with none, so the workshop
packages\next-shell\src\viewer.test.ts:53:  { label: 'workshop owner', viewer: viewer('workshop_owner', ['finance.read', 'organization.admin']) },
packages\next-shell\src\viewer.test.ts:55:    label: 'platform administrator',
packages\next-shell\src\viewer.test.ts:56:    viewer: viewer('platform_administrator', ['platform.admin', 'organization.admin', 'finance.read']),
packages\next-shell\src\viewer.test.ts:79:    expect(navRoleFor('fleet_administrator')).toBeUndefined();
packages\next-shell\src\viewer.test.ts:99:    // The demo implementation returned `['organization.admin']` to everyone,
packages\next-shell\src\viewer.test.ts:109:    const owner = viewer('workshop_owner', ['finance.read', 'organization.admin']);
packages\next-shell\src\viewer.test.ts:110:    expect(grantsFor(owner)).toEqual(['finance.read', 'organization.admin']);
packages\next-shell\src\viewer.test.ts:114:describe('nav and router must agree — for every identity, in every workspace', () => {
packages\next-shell\src\viewer.test.ts:137:        const routerTree = workspaceForRole(base, role);
packages\next-shell\src\viewer.test.ts:139:          visibleGroups(routerTree, grants).flatMap((g) => g.items.map((i) => i.href)),
packages\next-shell\src\viewer.test.ts:143:        // a signed-out viewer in the admin workspace, where every group is
packages\next-shell\src\viewer.test.ts:144:        // gated behind `platform.admin` — see the dedicated test below, which
packages\next-shell\src\viewer.test.ts:150:            `${label}/${id}: nav advertises ${href} but the router would 404 it`,
packages\next-shell\src\viewer.test.ts:157:  it('a signed-out viewer is shown NOTHING in the platform-admin workspace', () => {
packages\next-shell\src\viewer.test.ts:158:    // Every group in the admin tree is gated behind `platform.admin` (`02.txt`
packages\next-shell\src\viewer.test.ts:161:    // administration menu.
packages\next-shell\src\viewer.test.ts:164:    // `platform.admin`, so the admin nav was always fully populated and the
packages\next-shell\src\viewer.test.ts:167:    // ⚠️ CONSEQUENCE WORTH KNOWING: the admin app therefore renders a shell
packages\next-shell\src\viewer.test.ts:170:    // redirect-to-sign-in on this app specifically. Recorded in the handover.
packages\next-shell\src\viewer.test.ts:171:    const adminAdvertised = visibleGroups(workspaces.admin, grantsFor(null)).flatMap((g) =>
packages\next-shell\src\viewer.test.ts:174:    expect(adminAdvertised).toEqual([]);
packages\next-shell\src\viewer.test.ts:177:    // admin tree were simply empty.
packages\next-shell\src\viewer.test.ts:178:    const withAdmin = visibleGroups(workspaces.admin, ['platform.admin']).flatMap((g) =>
packages\next-shell\src\viewer.test.ts:181:    expect(withAdmin.length, 'the admin tree has no gated content to withhold').toBeGreaterThan(0);
packages\next-shell\src\viewer.test.ts:185:    // The counterpart to the admin case: if every workspace went blank for a
packages\next-shell\src\viewer.test.ts:271:      'the role tree must contain routes the default tree does not, or role resolution is a no-op',
packages\next-shell\src\viewer.test.ts:275:  it('a router still reading the DEFAULT tree would break — proving the wiring matters', () => {
packages\next-shell\src\viewer.test.ts:277:    // `workspaceForRole` and reads `workspace.groups` again, these routes 404
packages\next-shell\src\viewer-contract.ts:91: * computes (`finance.read`, `organization.admin`, `platform.admin`) are already
packages\next-shell\src\viewer-contract.ts:151: * The previous demo implementation returned `['organization.admin']` to anyone
packages\next-shell\src\ModulePage.tsx:1:import { notFound } from 'next/navigation';
packages\next-shell\src\ModulePage.tsx:14: * route.
packages\next-shell\src\ModulePage.tsx:22: * The nav tree doubles as the route allow-list — a path that is not in it
packages\next-shell\src\ModulePage.tsx:58:  if (!base) notFound();
packages\next-shell\src\ModulePage.tsx:62:  // would put the menu and the router back on different maps — defect 3, one
packages\next-shell\src\ModulePage.tsx:63:  // layer up: every route the technician's menu advertises would 404.
packages\next-shell\src\ModulePage.tsx:73:  // module hidden from the side nav is still reachable by typing its URL.
packages\next-shell\src\ModulePage.tsx:77:  if (!group || !item) notFound();
packages\ui\src\AiAssistantPanel.tsx:12: * a route, and the page stays visible and usable beside it.
packages\ui\src\AiAssistantPanel.tsx:20: * that decided its own permissions would be exactly the "hidden ≠ secure"
packages\ui\src\Breadcrumbs.tsx:45:                <span aria-hidden="true" style={{ color: themeVar.borderDefault }}>
packages\ui\src\AppShell.tsx:41:  /** Current route, e.g. `/workshop-floor/repair-staging`. */
packages\ui\src\AppShell.tsx:106:  // several groups expanded, and stamping over that on every route change
packages\ui\src\AppShell.tsx:258:        {/* The AI assistant (`02.txt` §8) — a side panel, never a route, so the
packages\navigation\src\resolve.test.ts:18:  it('matches the exact route', () => {
packages\navigation\src\resolve.test.ts:22:  it('matches a deeper child route', () => {
packages\navigation\src\resolve.test.ts:32:  it('does NOT match a sibling route sharing a prefix', () => {
packages\navigation\src\resolve.test.ts:45:    const groups = visibleGroups(workshop, ['organization.admin']);
packages\navigation\src\resolve.test.ts:95:  it('returns only the workspace crumb for an unknown route rather than inventing a trail', () => {
packages\navigation\src\resolve.test.ts:101:  it('opens only the group containing the current route', () => {
packages\navigation\src\resolve.test.ts:106:  it('opens nothing when the route is outside the tree', () => {
packages\navigation\src\resolve.test.ts:171:  it('platform administration covers all 25 entries of 02.txt §58', () => {
packages\navigation\src\resolve.test.ts:172:    const items = workspaces.admin.groups.flatMap((g) => g.items);
packages\navigation\src\resolve.test.ts:177:   * §32: the administration surface is "visible only to authorized
packages\navigation\src\resolve.test.ts:178:   * administrative, security and operational users." Every group must be
packages\navigation\src\resolve.test.ts:179:   * gated — an ungated admin group would leak the platform's structure.
packages\navigation\src\resolve.test.ts:181:  it('every platform-administration group is gated on platform.admin', () => {
packages\navigation\src\resolve.test.ts:182:    for (const g of workspaces.admin.groups) {
packages\navigation\src\resolve.test.ts:183:      expect(g.permission).toBe('platform.admin');
packages\navigation\src\resolve.test.ts:185:    expect(visibleGroups(workspaces.admin, [])).toHaveLength(0);
packages\navigation\src\resolve.test.ts:186:    expect(visibleGroups(workspaces.admin, ['platform.admin']).length).toBeGreaterThan(0);
packages\navigation\src\resolve.test.ts:191:      ['admin', 'customer', 'fleet', 'insurance', 'supplier', 'towing', 'workshop'].sort(),
packages\navigation\src\resolve.test.ts:195:  it('every item href follows /group/item so routes stay derivable', () => {
packages\navigation\src\resolve.test.ts:278:    const withFinance = hrefs(['finance.read', 'organization.admin']);
packages\navigation\src\resolve.test.ts:279:    const withoutFinance = hrefs(['organization.admin']);
packages\navigation\src\resolve.test.ts:286:    // Guards the failure where a role tree is reachable but produces bare
packages\navigation\src\resolve.test.ts:328:   * Gating it on `finance.read` would have hidden a core reception function
packages\ui\src\Drawer.tsx:19: *     the page is right and a route change is wrong.
packages\ui\src\Drawer.tsx:134:            <span aria-hidden="true">×</span>
packages\navigation\src\resolve.ts:4: * Pure functions over the navigation tree. No React, no router, no fetch, so
packages\navigation\src\resolve.ts:27: * every existing consumer — the shell, `breadcrumbsFor`, the catch-all route
packages\navigation\src\resolve.ts:32: * nav and the router each held their own copy of the viewer's grants and
packages\navigation\src\resolve.ts:33: * disagreed, so the menu advertised routes that 404'd.
packages\navigation\src\resolve.ts:57:  // nav/router divergence this whole design exists to prevent. Dropping the
packages\navigation\src\resolve.ts:70: * usability feature. The route guard, the API and RLS deny independently.
packages\navigation\src\resolve.ts:89: * Is `href` the active route for `pathname`?
packages\navigation\src\resolve.ts:101:/** Does any item in this group match the current route? Drives auto-expand. */
packages\navigation\src\resolve.ts:119: * Derive breadcrumbs for the current route (§2 layout, "Page Header and
packages\navigation\src\resolve.ts:158: * fuzzy matcher would also return things sharing scattered letters, which reads
packages\navigation\src\types.ts:34:   * Hiding is a usability affordance, NOT a security control — the route and
packages\navigation\src\types.ts:59:  /** Group is hidden wholesale unless the user holds this permission. */
packages\navigation\src\types.ts:75:  | 'admin';
packages\navigation\src\workspaces.ts:13: * doubling as the group landing page. That keeps route files mechanically
packages\navigation\src\workspaces.ts:187:      ['staff-and-roles', 'Staff and Roles'],
packages\navigation\src\workspaces.ts:191:    // Whole group is admin-only.
packages\navigation\src\workspaces.ts:192:    'organization.admin',
packages\navigation\src\workspaces.ts:256:      ['users-and-roles', 'Users and Roles'],
packages\navigation\src\workspaces.ts:261:    'organization.admin',
packages\navigation\src\workspaces.ts:319:    'organization.admin',
packages\navigation\src\workspaces.ts:376:    'organization.admin',
packages\navigation\src\workspaces.ts:401:    ['settings', 'Settings', { permission: 'organization.admin' }],
packages\navigation\src\workspaces.ts:414: * The whole workspace is gated on `platform.admin` — §32: "visible only to
packages\navigation\src\workspaces.ts:415: * authorized administrative, security and operational users."
packages\navigation\src\workspaces.ts:418:const adminGroups: NavGroup[] = [
packages\navigation\src\workspaces.ts:419:  group('home', 'Home', 'home', [['operations-dashboard', 'Operations Dashboard']], 'platform.admin'),
packages\navigation\src\workspaces.ts:435:    'platform.admin',
packages\navigation\src\workspaces.ts:445:    'platform.admin',
packages\navigation\src\workspaces.ts:458:    'platform.admin',
packages\navigation\src\workspaces.ts:467:      ['incidents', 'Incidents', { warningKey: 'admin.incidents.active' }],
packages\navigation\src\workspaces.ts:471:    'platform.admin',
packages\navigation\src\workspaces.ts:481:    'platform.admin',
packages\navigation\src\workspaces.ts:483:  group('reports', 'Reports', 'chart', [['reports', 'Reports']], 'platform.admin'),
packages\navigation\src\workspaces.ts:519:    ['roles-and-permissions', 'Roles and Permissions'],
packages\navigation\src\workspaces.ts:601:    'organization.admin',
packages\navigation\src\workspaces.ts:725:  // catch-all renders an honest "not built yet" page for every unbuilt route.
packages\navigation\src\workspaces.ts:769:/** §46-§49. Roles from §50 with no tree of their own are deliberately absent. */
packages\navigation\src\workspaces.ts:827:  admin: {
packages\navigation\src\workspaces.ts:828:    id: 'admin',
packages\navigation\src\workspaces.ts:830:    audience: 'Platform administrators — organizations, security, incidents, MCP, agents',
packages\navigation\src\workspaces.ts:831:    groups: adminGroups,
packages\navigation\src\workspaces.ts:840: *   `02.txt`     §52 towing   · §58 platform administration
packages\ui\src\SideNav.tsx:71:      // Not aria-hidden: the number is real information. It is announced as
packages\ui\src\SideNav.tsx:125:        overflowX: 'hidden',
packages\ui\src\SideNav.tsx:208:                <span aria-hidden="true" style={{ width: '1rem', flexShrink: 0 }}>
packages\ui\src\SideNav.tsx:215:                  <span aria-hidden="true" style={{ color: themeVar.textSecondary, marginLeft: primitive.space[1] }}>
packages\ui\src\SideNav.tsx:222:                  collapsed shows group icons plus tooltips — rendering hidden
packages\ui\src\Tabs.tsx:195:          hidden={tab.id !== selected}
packages\ui\src\ThemeProvider.tsx:190:        overflow: 'hidden',
packages\ui\src\ThemeProvider.tsx:222:            <span aria-hidden="true">{o.glyph}</span>
packages\ui\src\TopNav.tsx:60: * hidden-with-no-alternative is acceptable only while the alternatives do not
packages\ui\src\TopNav.tsx:104:  // aria-hidden: the glyph is decorative — the accessible name comes from the
packages\ui\src\TopNav.tsx:107:    <span aria-hidden="true" style={{ fontSize: primitive.fontSize.base, lineHeight: 1 }}>
packages\ui\src\TopNav.tsx:211:      <span aria-hidden="true" style={{ color: themeVar.textSecondary }}>
packages\ui\src\TopNav.tsx:305:          {/* Visually hidden but present for screen readers — a placeholder is
packages\ui\src\TopNav.tsx:312:              overflow: 'hidden',
packages\ui\src\useFocusTrap.ts:31:  'input:not([disabled]):not([type="hidden"])',
packages\ui\src\useFocusTrap.ts:94:        // offsetParent is null for display:none — a hidden control must not
packages\ui\src\useFocusTrap.ts:142:    document.body.style.overflow = 'hidden';

 succeeded in 3885ms:
apps\api\src\tenancy\tenant-context.ts:15:  readonly tenantId: string;
apps\api\src\tenancy\tenant-context.ts:37:  tenantId: string;
apps\api\src\tenancy\tenant-context.ts:93:    tenantId: selected.tenantId,
apps\api\src\tenancy\tenant-context.ts:136:    set('app.tenant_id', ctx.tenantId),
docs\04-security\TENANT_ISOLATION.md:49:SET LOCAL app.tenant_id        = '<uuid>';
apps\api\src\tenancy\tenant-context.spec.ts:10:  tenantId: 'tenant-a',
apps\api\src\tenancy\tenant-context.spec.ts:25:    expect(ctx.tenantId).toBe('tenant-a');
apps\api\src\tenancy\tenant-context.spec.ts:67:        membership({ tenantId: 'tenant-b', organizationId: 'org-2', roleName: 'workshop_owner' }),
apps\api\src\tenancy\tenant-context.spec.ts:72:    expect(ctx.tenantId).toBe('tenant-b');
apps\api\src\tenancy\tenant-context.spec.ts:92:      tenantId: "'; DROP TABLE identity.tenants; --",
apps\api\src\identity\branch.service.ts:38: * `identity.branches` carries `tenant_id` and is under `ENABLE` + `FORCE ROW
apps\api\src\identity\branch.service.ts:109:      // the `tenant_id` of the row being INSERTED, not the tenant of the row it
apps\api\src\identity\branch.service.ts:110:      // points at. So `tenant_id = <A>` with `organization_id = <an org in
apps\api\src\identity\branch.service.ts:128:      // `tenant_id` comes from the RESOLVED context, never from the caller's
apps\api\src\identity\branch.service.ts:133:           (tenant_id, organization_id, name, location, operating_hours, created_by)
apps\api\src\identity\branch.service.ts:137:          ctx.tenantId,
apps\api\src\identity\organization.service.ts:77:        `INSERT INTO identity.organizations (tenant_id, name, org_type, created_by)
apps\api\src\identity\organization.service.ts:80:        [ctx.tenantId, input.name, input.orgType, ctx.userId],
apps\api\src\identity\membership.service.ts:143:      // tenant predicate — and RLS `WITH CHECK` validates the `tenant_id` of
apps\api\src\identity\membership.service.ts:145:      // `tenant_id = <A>` with `organization_id = <an org in tenant B>`
apps\api\src\identity\membership.service.ts:172:           (tenant_id, organization_id, branch_id, user_id, role_name, created_by)
apps\api\src\identity\membership.service.ts:179:          ctx.tenantId,
apps\api\src\identity\membership.repository.ts:26:      tenant_id: string;
apps\api\src\identity\membership.repository.ts:33:              m.tenant_id     AS tenant_id,
apps\api\src\identity\membership.repository.ts:49:      .filter((r) => r.tenant_id !== null)
apps\api\src\identity\membership.repository.ts:51:        tenantId: r.tenant_id,
apps\api\src\identity\me.service.ts:18:  tenantId: string;
apps\api\src\identity\me.service.ts:94:        tenantId: ctx.tenantId,
apps\api\src\identity\identity.spec.ts:21:  tenantId: 'tenant-a',
apps\api\src\identity\identity.spec.ts:89:  it('takes tenant_id from the resolved context, never from the caller', async () => {
apps\api\src\identity\identity.spec.ts:107:      expect.objectContaining({ tenantId: 'tenant-a' }),
apps\api\src\identity\identity.spec.ts:114:    // only the INSERTED tenant_id, so `tenant_id = A` + `organization_id = <org
apps\api\src\identity\identity.spec.ts:140:   * `identity.users` has no `tenant_id` and no row-level security — migration
apps\api\src\identity\identity.controllers.ts:27: * Note what is NOT here: no endpoint accepts a `tenantId`. Tenant context comes
apps\api\src\database\database.integration.spec.ts:24:const ctx = (tenantId: string): TenantContext => ({
apps\api\src\database\database.integration.spec.ts:25:  tenantId,
apps\api\src\database\database.integration.spec.ts:96:      c.query('SELECT id, tenant_id FROM identity.organizations'),
apps\api\src\database\database.integration.spec.ts:99:    expect(a.rows.every((r) => r.tenant_id === TENANT_A)).toBe(true);
apps\api\src\database\database.integration.spec.ts:105:      c.query('SELECT id FROM identity.organizations WHERE tenant_id = $1', [TENANT_B]),
apps\api\src\database\database.integration.spec.ts:117:      const r = await client.query(`SELECT current_setting('app.tenant_id', true) AS t`);
apps\api\src\audit\audit.service.ts:37:         (tenant_id, organization_id, actor_user_id, actor_agent_id, actor_kind,
apps\api\src\audit\audit.service.ts:42:        ctx.tenantId,
tests\tenant-isolation\rls_proof.sql:36:INSERT INTO identity.organizations (id, tenant_id, name, org_type)
tests\tenant-isolation\rls_proof.sql:43:INSERT INTO identity.branches (id, tenant_id, organization_id, name)
tests\tenant-isolation\rls_proof.sql:60:    PERFORM set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
tests\tenant-isolation\rls_proof.sql:86:        INSERT INTO identity.organizations (tenant_id, name, org_type)
tests\tenant-isolation\rls_proof.sql:95:    PERFORM set_config('app.tenant_id', '22222222-2222-2222-2222-222222222222', true);
tests\tenant-isolation\rls_proof.sql:105:    PERFORM set_config('app.tenant_id', '', true);
infrastructure\backup\lib.sh:142:    CREATE TABLE IF NOT EXISTS _backup.archive_heartbeat(
infrastructure\migrations\run.sh:19:CREATE TABLE IF NOT EXISTS public.schema_migrations (
infrastructure\migrations\001_tenancy_foundation.sql:27:CREATE OR REPLACE FUNCTION identity.current_tenant_id()
infrastructure\migrations\001_tenancy_foundation.sql:31:  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
infrastructure\migrations\001_tenancy_foundation.sql:38:  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
infrastructure\migrations\001_tenancy_foundation.sql:45:  SELECT COALESCE(NULLIF(current_setting('app.current_role', true), ''), 'none');
infrastructure\migrations\001_tenancy_foundation.sql:60:CREATE TABLE IF NOT EXISTS identity.tenants (
infrastructure\migrations\001_tenancy_foundation.sql:75:CREATE TABLE IF NOT EXISTS identity.organizations (
infrastructure\migrations\001_tenancy_foundation.sql:77:    tenant_id    uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
infrastructure\migrations\001_tenancy_foundation.sql:93:CREATE INDEX IF NOT EXISTS idx_organizations_tenant ON identity.organizations(tenant_id);
infrastructure\migrations\001_tenancy_foundation.sql:97:CREATE TABLE IF NOT EXISTS identity.branches (
infrastructure\migrations\001_tenancy_foundation.sql:99:    tenant_id       uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
infrastructure\migrations\001_tenancy_foundation.sql:112:CREATE INDEX IF NOT EXISTS idx_branches_tenant ON identity.branches(tenant_id);
infrastructure\migrations\001_tenancy_foundation.sql:120:CREATE TABLE IF NOT EXISTS identity.users (
infrastructure\migrations\001_tenancy_foundation.sql:141:CREATE TABLE IF NOT EXISTS identity.memberships (
infrastructure\migrations\001_tenancy_foundation.sql:143:    tenant_id       uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
infrastructure\migrations\001_tenancy_foundation.sql:157:CREATE INDEX IF NOT EXISTS idx_memberships_tenant ON identity.memberships(tenant_id);
infrastructure\migrations\001_tenancy_foundation.sql:165:ALTER TABLE identity.tenants       ENABLE ROW LEVEL SECURITY;
infrastructure\migrations\001_tenancy_foundation.sql:166:ALTER TABLE identity.tenants       FORCE  ROW LEVEL SECURITY;
infrastructure\migrations\001_tenancy_foundation.sql:167:ALTER TABLE identity.organizations ENABLE ROW LEVEL SECURITY;
infrastructure\migrations\001_tenancy_foundation.sql:168:ALTER TABLE identity.organizations FORCE  ROW LEVEL SECURITY;
infrastructure\migrations\001_tenancy_foundation.sql:169:ALTER TABLE identity.branches      ENABLE ROW LEVEL SECURITY;
infrastructure\migrations\001_tenancy_foundation.sql:170:ALTER TABLE identity.branches      FORCE  ROW LEVEL SECURITY;
infrastructure\migrations\001_tenancy_foundation.sql:171:ALTER TABLE identity.memberships   ENABLE ROW LEVEL SECURITY;
infrastructure\migrations\001_tenancy_foundation.sql:172:ALTER TABLE identity.memberships   FORCE  ROW LEVEL SECURITY;
infrastructure\migrations\001_tenancy_foundation.sql:175:CREATE POLICY tenant_isolation ON identity.tenants
infrastructure\migrations\001_tenancy_foundation.sql:176:    USING (identity.is_platform_admin() OR id = identity.current_tenant_id())
infrastructure\migrations\001_tenancy_foundation.sql:177:    WITH CHECK (identity.is_platform_admin() OR id = identity.current_tenant_id());
infrastructure\migrations\001_tenancy_foundation.sql:180:CREATE POLICY tenant_isolation ON identity.organizations
infrastructure\migrations\001_tenancy_foundation.sql:181:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure\migrations\001_tenancy_foundation.sql:182:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure\migrations\001_tenancy_foundation.sql:185:CREATE POLICY tenant_isolation ON identity.branches
infrastructure\migrations\001_tenancy_foundation.sql:186:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure\migrations\001_tenancy_foundation.sql:187:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure\migrations\001_tenancy_foundation.sql:190:CREATE POLICY tenant_isolation ON identity.memberships
infrastructure\migrations\001_tenancy_foundation.sql:191:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure\migrations\001_tenancy_foundation.sql:192:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure\migrations\001_tenancy_foundation.sql:204:CREATE TABLE IF NOT EXISTS audit.events (
infrastructure\migrations\001_tenancy_foundation.sql:207:    tenant_id        uuid,
infrastructure\migrations\001_tenancy_foundation.sql:223:CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON audit.events(tenant_id, occurred_at DESC);
infrastructure\backup\restore-drill.sh:80:CREATE TABLE IF NOT EXISTS _drill.canary (
infrastructure\backup\restore-drill.sh:233:  SELECT set_config('app.tenant_id','00000000-0000-0000-0000-000000000000',false);
infrastructure\keycloak\README.md:57:identifier supplied only by the client"*). A `tenant_id` baked into a token becomes a stale, client-carried

 succeeded in 2031ms:
infrastructure\migrations\run.sh:19:CREATE TABLE IF NOT EXISTS public.schema_migrations (
infrastructure\migrations\run.sh:29:for file in "$DIR"/[0-9]*.sql; do
infrastructure\migrations\run.sh:30:  version="$(basename "$file" .sql)"
infrastructure\migrations\run.sh:31:  checksum="$(sha256sum "$file" | cut -d' ' -f1)"
infrastructure\migrations\run.sh:33:  existing="$(psql_run -tAc "SELECT checksum FROM public.schema_migrations WHERE version = '$version'" || true)"
infrastructure\migrations\run.sh:39:      # and the file no longer agree, and applying it again would compound the
infrastructure\migrations\run.sh:53:  psql_run -q < "$file"
infrastructure\migrations\run.sh:54:  psql_run -q -c "INSERT INTO public.schema_migrations (version, checksum) VALUES ('$version', '$checksum')"
infrastructure\migrations\002_application_role.sql:44:GRANT USAGE ON SCHEMA public   TO autoworkshop_app;
infrastructure\migrations\002_application_role.sql:56:GRANT SELECT ON public.schema_migrations TO autoworkshop_app;
infrastructure\migrations\001_tenancy_foundation.sql:117:-- profile and links to the Keycloak subject. No password material is ever
infrastructure\keycloak\realm-autoworkshop.json:158:      "publicClient": true,
infrastructure\keycloak\realm-autoworkshop.json:180:      "publicClient": true,
infrastructure\keycloak\realm-autoworkshop.json:201:      "publicClient": true,
infrastructure\keycloak\realm-autoworkshop.json:220:      "publicClient": true,
infrastructure\keycloak\realm-autoworkshop.json:239:      "publicClient": true,
infrastructure\keycloak\realm-autoworkshop.json:258:      "publicClient": true,
infrastructure\keycloak\realm-autoworkshop.json:277:      "publicClient": true,
infrastructure\keycloak\realm-autoworkshop.json:296:      "publicClient": false,
infrastructure\keycloak\README.md:28:Declaring the audience scope inline left the realm with only 2 scopes — no `profile`, `email`, `roles`,
infrastructure\keycloak\README.md:31:The audience scope is therefore created *after* import, from its own file, and standard scopes are
infrastructure\keycloak\README.md:49:| PKCE | `S256` on all 7 public clients | §11 — a browser cannot keep a secret |
infrastructure\keycloak\README.md:69:scope        : email profile autoworkshop-audience
apps\workshop-web\next.config.mjs:7: * killed rather than reporting a fault. A genuine type error prints the file
apps\workshop-web\next.config.mjs:41:   * symlinks into ../../node_modules/.pnpm, and file tracing rooted at the app
apps\workshop-web\next.config.mjs:42:   * directory would follow those links outside its root and drop the files.
infrastructure\keycloak\import-realm.sh:43:  echo "    NOTE: update does not remove roles or clients deleted from the file."
infrastructure\keycloak\import-realm.sh:65:STANDARD_SCOPES="profile email roles web-origins acr basic autoworkshop-audience"
apps\workshop-web\next-env.d.ts:4:// NOTE: This file should not be edited
apps\workshop-web\middleware.ts:9: * and has no way to store it. Without this file the app would re-refresh on
apps\workshop-web\middleware.ts:20: * `config` to be statically analysable — an imported constant is not. It is the
apps\workshop-web\middleware.ts:27:  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
apps\workshop-web\Dockerfile:18:# (>=20.19.0 <21) and to the pnpm version in `packageManager`, so the lockfile is
apps\workshop-web\Dockerfile:33:# Manifests and the lockfile first, so the dependency layer is reused whenever
apps\workshop-web\Dockerfile:34:# only source changed. The workspace file is required for `--filter` to resolve
apps\workshop-web\Dockerfile:43:RUN pnpm install --frozen-lockfile --filter "@autoworkshop/workshop-web..."
apps\workshop-web\Dockerfile:78:COPY --from=builder --chown=node:node /repo/apps/workshop-web/.next/static ./apps/workshop-web/.next/static
infrastructure\docker\README.md:17:| MinIO | 9000 / 9001 | S3-compatible object storage |
infrastructure\docker\docker-compose.yml:4:# managed or paid dependency. The same compose file scales to the always-free
infrastructure\docker\docker-compose.yml:118:    # S3-compatible object storage (`1.txt` §7). Media never touches Postgres.
infrastructure\docker\docker-compose.yml:124:      MINIO_ROOT_USER: ${S3_ACCESS_KEY:-minioadmin}
infrastructure\docker\docker-compose.yml:125:      MINIO_ROOT_PASSWORD: ${S3_SECRET_KEY:-change_me_locally}
infrastructure\backup\schedule\install-windows.ps1:10:    logging and status files are identical on either platform. The scheduler is
infrastructure\backup\schedule\autoworkshop-backup.cron:8:# `/etc/cron.d` rather than a user crontab because it is a file in the repo:
infrastructure\backup\schedule\autoworkshop-backup.cron:33:# This is the one that matters. Everything above produces files; only this
packages\auth\src\workspace-auth.ts:29: * session object is public to the client.** The tokens are deliberately left in
packages\auth\src\workspace-auth.ts:143:         * it is why this file is verified by starting the app and calling the
apps\workshop-web\app\home\dashboard\page.tsx:24: * was: this file only exists inside the workshop app.
packages\auth\src\tokens.test.ts:64:  it('sends no client secret — these are public clients', async () => {
packages\auth\src\index.ts:18: * themselves; static assets are excluded because running a session decrypt for
packages\auth\src\index.ts:22:  '/((?!api/auth|_next/static|_next/image|favicon.ico).*)',
infrastructure\backup\run-scheduled.sh:54:# Lock. `mkdir` is atomic on every filesystem that matters, and Git Bash has no
infrastructure\backup\run-scheduled.sh:69:    # identical to a job that is running fine: the status file just keeps its
infrastructure\backup\run-scheduled.sh:120:# Status file. Written on success AND failure — a status file that only appears
infrastructure\backup\restore-drill.sh:57:key_file_or_create
infrastructure\backup\restore-drill.sh:98:SRC_MIGRATIONS="$(src 'SELECT count(*) FROM public.schema_migrations')"
infrastructure\backup\restore-drill.sh:212:R_MIGRATIONS="$(d 'SELECT count(*) FROM public.schema_migrations')"
infrastructure\backup\lib.sh:59:# on the workstation filesystem outside it — an honest approximation, and
infrastructure\backup\lib.sh:66:key_file_or_create() {
infrastructure\backup\lib.sh:77:# This file exports MSYS_NO_PATHCONV=1 (so Git Bash stops rewriting the
infrastructure\backup\lib.sh:80:# cannot open it: "BIO_new_file:no such file". `fd:` is not supported by this
infrastructure\backup\lib.sh:85:    echo "file:$(cygpath -w "$KEY_FILE")"
infrastructure\backup\lib.sh:87:    echo "file:${KEY_FILE}"
infrastructure\backup\lib.sh:176:# This used to reuse S3_ACCESS_KEY/S3_SECRET_KEY, which are MinIO's ROOT
infrastructure\backup\lib.sh:187:# touch ONLY the backup bucket. The root credential is used once, to create it,
infrastructure\backup\lib.sh:190:BACKUP_S3_USER="${BACKUP_S3_USER:-aw-backup-writer}"
infrastructure\backup\lib.sh:191:BACKUP_S3_SECRET="${BACKUP_S3_SECRET:-}"
infrastructure\backup\lib.sh:193:backup_secret_file() { echo "${BACKUP_HOME}/.backup-s3-secret"; }
infrastructure\backup\lib.sh:198:  local sf; sf="$(backup_secret_file)"
infrastructure\backup\lib.sh:199:  if [ -z "$BACKUP_S3_SECRET" ]; then
infrastructure\backup\lib.sh:205:    BACKUP_S3_SECRET="$(tr -d ' \r\n' < "$sf")"
infrastructure\backup\lib.sh:208:  # Root alias — used ONLY to provision the scoped user and bucket.
infrastructure\backup\lib.sh:210:    mc alias set root http://localhost:9000 '${S3_ACCESS_KEY:-minioadmin}' '${S3_SECRET_KEY:-change_me_locally}' >/dev/null 2>&1
infrastructure\backup\lib.sh:229:    mc admin user add root '${BACKUP_S3_USER}' '${BACKUP_S3_SECRET}' >/dev/null 2>&1 || true
infrastructure\backup\lib.sh:231:    mc admin policy attach root aw-backup-only --user '${BACKUP_S3_USER}' >/dev/null 2>&1 || true
infrastructure\backup\lib.sh:235:    mc alias set backup http://localhost:9000 '${BACKUP_S3_USER}' '${BACKUP_S3_SECRET}' >/dev/null 2>&1
infrastructure\backup\lib.sh:252:      warn "off-host: FAILED to upload ${f}"
infrastructure\backup\lib.sh:298:# `[ -s file ]` is not good enough here. `openssl enc` fed an empty stream still
infrastructure\backup\lib.sh:300:# non-empty file that passes every "is it there?" check. The floor below is
infrastructure\backup\lib.sh:305:assert_plausible() { # assert_plausible <file> <min-bytes> <description>
packages\navigation\src\workspaces.ts:13: * doubling as the group landing page. That keeps route files mechanically
packages\navigation\src\workspaces.ts:81:    ['shared-files', 'Shared Files'],
packages\navigation\src\workspaces.ts:96:    ['profile', 'Profile'],
packages\navigation\src\workspaces.ts:185:      ['workshop-profile', 'Workshop Profile'],
packages\navigation\src\workspaces.ts:206:  group('business-profile', 'Business Profile', 'building', [
packages\navigation\src\workspaces.ts:207:    ['supplier-profile', 'Supplier Profile'],
packages\navigation\src\workspaces.ts:215:    ['bulk-upload', 'Bulk Upload'],
packages\navigation\src\workspaces.ts:235:    ['marketplace-profile', 'Marketplace Profile'],
packages\navigation\src\workspaces.ts:492: * number from this file.
packages\navigation\src\workspaces.ts:516:    ['workshop-profile', 'Workshop Profile'],
packages\navigation\src\types.ts:10: * Source of truth: `autoworkshop 01 (1).txt` — the whole file is the approved
packages\navigation\src\types.ts:13: * label is not in that spec it does not belong in this file.
packages\navigation\src\types.ts:80: * ⚠️ `07.txt` is TWO documents in one file. Part 2 begins at line 1798 and
apps\towing-web\next.config.mjs:7: * killed rather than reporting a fault. A genuine type error prints the file
apps\towing-web\next-env.d.ts:4:// NOTE: This file should not be edited
apps\towing-web\middleware.ts:9: * and has no way to store it. Without this file the app would re-refresh on
apps\towing-web\middleware.ts:20: * `config` to be statically analysable — an imported constant is not. It is the
apps\towing-web\middleware.ts:27:  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
infrastructure\backup\check-backup-health.sh:9:# scheduler keeps firing, and the only symptom is an absence — a file that was
infrastructure\backup\check-backup-health.sh:119:  # backup" while four of them sat in the bucket. A false CRITICAL is not a safe
infrastructure\backup\check-backup-health.sh:130:        mc alias set root http://localhost:9000 '${S3_ACCESS_KEY:-minioadmin}' '${S3_SECRET_KEY:-change_me_locally}' >/dev/null 2>&1
infrastructure\backup\check-backup-health.sh:136:    # Could not list the bucket. That is not "zero backups" and must not be
infrastructure\backup\check-backup-health.sh:142:    crit_up "cannot list off-host bucket '${BACKUP_BUCKET}' — off-host copies UNCONFIRMED"
infrastructure\backup\backup.sh:8:#   <name>.sha256               checksum of each artefact, written BEFORE upload
infrastructure\backup\backup.sh:53:key_file_or_create
infrastructure\backup\backup.sh:118:  # file sat in the container.
infrastructure\backup\backup.sh:132:    warn "keycloak export produced no usable realm file — the realm is NOT backed up this run"
infrastructure\backup\backup.sh:149:#    rather than trusting a filename (§36 "backup identity and timestamp").
infrastructure\backup\backup.sh:161:# a consumer would read as a filename.
infrastructure\backup\backup.sh:187:# The application's S3 key cannot reach the backup bucket, and the backup key
packages\ui\src\TopNav.tsx:12: *   [+ Create v] [Tasks] [Messages] [Notifications] [AI Assistant] [Help] [Profile v]
packages\ui\src\TopNav.tsx:26: * this bar is focusable-but-inert. An earlier revision of this file claimed
packages\ui\src\TopNav.tsx:84:   * Theme switcher (§15 sits beside the user profile in the right-hand
packages\ui\src\TopNav.tsx:100:  profile: '◍',
packages\ui\src\ThemeProvider.tsx:38: * Without this the server renders light, the client reads localStorage, and the
packages\ui\src\ThemeProvider.tsx:43: * Wrapped in try/catch because localStorage throws in Safari private mode and
packages\ui\src\ThemeProvider.tsx:47:export const themeBootScript = `(function(){try{var p=localStorage.getItem('${STORAGE_KEY}');if(p==='dark'||p==='light'){document.documentElement.setAttribute('data-theme',p);}}catch(e){}})();`;
packages\ui\src\ThemeProvider.tsx:60:  // the server has no localStorage, and reading it in a useState initialiser
packages\ui\src\ThemeProvider.tsx:65:      const stored = localStorage.getItem(STORAGE_KEY);
packages\ui\src\ThemeProvider.tsx:90:      localStorage.setItem(STORAGE_KEY, p);
packages\config\package.json:6:  "files": [
apps\insurance-web\next.config.mjs:7: * killed rather than reporting a fault. A genuine type error prints the file
apps\insurance-web\next-env.d.ts:4:// NOTE: This file should not be edited
apps\insurance-web\middleware.ts:9: * and has no way to store it. Without this file the app would re-refresh on
apps\insurance-web\middleware.ts:20: * `config` to be statically analysable — an imported constant is not. It is the
apps\insurance-web\middleware.ts:27:  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
packages\next-shell\src\viewer.ts:9: * This file is what the previous demo implementation promised would replace it:
packages\next-shell\src\viewer.test.ts:19: * because a disagreement between two literals in two files is not a type error.
packages\next-shell\src\viewer-contract.ts:16: * So: this file knows how to TURN a viewer into navigation decisions and never
apps\customer-web\next.config.mjs:7: * killed rather than reporting a fault. A genuine type error prints the file
apps\customer-web\next-env.d.ts:4:// NOTE: This file should not be edited
apps\customer-web\middleware.ts:9: * and has no way to store it. Without this file the app would re-refresh on
apps\customer-web\middleware.ts:20: * `config` to be statically analysable — an imported constant is not. It is the
apps\customer-web\middleware.ts:27:  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
apps\fleet-web\next.config.mjs:7: * killed rather than reporting a fault. A genuine type error prints the file
apps\fleet-web\next-env.d.ts:4:// NOTE: This file should not be edited
apps\fleet-web\middleware.ts:9: * and has no way to store it. Without this file the app would re-refresh on
apps\fleet-web\middleware.ts:20: * `config` to be statically analysable — an imported constant is not. It is the
apps\fleet-web\middleware.ts:27:  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
apps\supplier-web\next.config.mjs:7: * killed rather than reporting a fault. A genuine type error prints the file
apps\supplier-web\next-env.d.ts:4:// NOTE: This file should not be edited
apps\supplier-web\middleware.ts:9: * and has no way to store it. Without this file the app would re-refresh on
apps\supplier-web\middleware.ts:20: * `config` to be statically analysable — an imported constant is not. It is the
apps\supplier-web\middleware.ts:27:  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
apps\e2e\tests\shell-journey.spec.ts:203:test.describe('nav and router agree — defect 3: two literals in two files', () => {
apps\e2e\tests\shell-journey.spec.ts:205:   * The 7 `layout.tsx` files passed a hardcoded grants array while the
apps\api\src\identity\user.service.ts:36: * membership` in the spec file asserts this property, because a comment does
apps\e2e\tests\build-freshness.setup.ts:39: * `/_next/static/**` asset the served HTML references, and assert that each one
apps\e2e\tests\build-freshness.setup.ts:40: * exists in that app's `.next` directory. A reference to a file that is not on
apps\e2e\tests\build-freshness.setup.ts:50: * `/_next/static/chunks/x.js` -> `<app>/.next/static/chunks/x.js`
apps\e2e\tests\build-freshness.setup.ts:55: * filesystem reports that file as missing on a perfectly fresh build — a guard
apps\e2e\tests\build-freshness.setup.ts:75:    // Every static asset the document references, in BOTH forms Next emits:
apps\e2e\tests\build-freshness.setup.ts:77:    //   1. `<script src="/_next/static/chunks/….js">` — the tags the browser
apps\e2e\tests\build-freshness.setup.ts:79:    //   2. `\"static/chunks/….js\"` inside the RSC flight payload — the same
apps\e2e\tests\build-freshness.setup.ts:80:    //      files, listed without the `/_next/` prefix and with escaped quotes.
apps\e2e\tests\build-freshness.setup.ts:86:    const prefixed = html.match(/\/_next\/static\/[^"'\\\s>)]+/g) ?? [];
apps\e2e\tests\build-freshness.setup.ts:87:    const bare = (html.match(/(?<!\/_next\/)\bstatic\/(?:chunks|css|media)\/[^"'\\\s>)]+/g) ?? []).map(
apps\e2e\tests\build-freshness.setup.ts:94:      `${server.name}-web referenced no /_next/static assets at all, which means this ` +
apps\e2e\tests\a11y-storybook.spec.ts:3:import { readFileSync } from 'node:fs';
apps\e2e\tests\a11y-storybook.spec.ts:22:const indexPath = resolve(__dirname, '../../storybook/storybook-static/index.json');
apps\e2e\tests\a11y-storybook.spec.ts:27:    raw = readFileSync(indexPath, 'utf-8');
apps\e2e\playwright.config.ts:105:  // Serving the static Storybook build and the seven built Next apps. Playwright
apps\e2e\playwright.config.ts:110:      command: `npx http-server ../storybook/storybook-static -p ${STORYBOOK_PORT} --silent`,
apps\e2e\playwright.config.ts:120:      // it dies on a missing `font-manifest.json`, a file Next 15 no longer
apps\api\src\identity\membership.service.ts:147:      // privilege-GRANTING operation, that is a membership filed under one
apps\api\src\identity\me.service.ts:53:      // The profile, reached THROUGH memberships rather than from
apps\api\src\identity\me.service.ts:56:      const profile = await client.query(
apps\api\src\identity\me.service.ts:84:      const row = profile.rows[0];
apps\api\src\identity\me.service.ts:88:        // A viewer with a context but no readable profile row is a data fault,
apps\api\src\identity\me.service.ts:91:        // would take out every page including the ones that need no profile.
apps\api\src\identity\identity.spec.ts:138:   * THE defect this file exists to prevent.
apps\api\src\identity\branch.service.ts:112:      // a branch filed under tenant A that belongs to someone else's
apps\storybook\package.json:7:    "build": "storybook build -o storybook-static",
apps\storybook\stories\AppShell.stories.tsx:89: * rendering them. Two literals in two files cannot be type-checked into
apps\api\src\auth\keycloak-jwt.spec.ts:15:const { privateKey, publicKey } = generateKeyPairSync('rsa', {
apps\api\src\auth\keycloak-jwt.spec.ts:17:  publicKeyEncoding: { type: 'spki', format: 'pem' },
apps\api\src\auth\keycloak-jwt.spec.ts:33:    getSigningKey: async () => ({ getPublicKey: () => publicKey }),
apps\api\src\auth\keycloak-jwt.spec.ts:66:      publicKeyEncoding: { type: 'spki', format: 'pem' },
apps\api\src\auth\keycloak-jwt.service.ts:27: *                algorithm and sign with the public key
apps\admin-web\next.config.mjs:7: * killed rather than reporting a fault. A genuine type error prints the file
apps\admin-web\next-env.d.ts:4:// NOTE: This file should not be edited
apps\admin-web\middleware.ts:9: * and has no way to store it. Without this file the app would re-refresh on
apps\admin-web\middleware.ts:20: * `config` to be statically analysable — an imported constant is not. It is the
apps\admin-web\middleware.ts:27:  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],

 succeeded in 3822ms:
apps\workshop-web\package.json:15:    "@autoworkshop/design-tokens": "workspace:*",
apps\workshop-web\next.config.mjs:47:  // so a token change is picked up without a separate build step.
apps\workshop-web\next.config.mjs:48:  transpilePackages: ['@autoworkshop/ui', '@autoworkshop/design-tokens'],
apps\workshop-web\middleware.ts:6: * Running `auth` as middleware is what PERSISTS a refreshed Keycloak access
apps\workshop-web\middleware.ts:7: * token. The refresh itself happens in the `jwt` callback, but only middleware
apps\workshop-web\middleware.ts:8: * may write the session cookie — a server component can compute a renewed token
apps\workshop-web\middleware.ts:9: * and has no way to store it. Without this file the app would re-refresh on
apps\workshop-web\middleware.ts:11: * null a few minutes into every session, with the shell quietly degrading to
apps\workshop-web\middleware.ts:17: * here would couple the whole Playwright suite to a running Keycloak and API.
apps\workshop-web\Dockerfile:7:# sessions and two of them were fixes for wrong diagnoses. The identical command
apps\workshop-web\auth.ts:9: * produce a session this app could set and not read back.
apps\workshop-web\auth.ts:11: * The Keycloak client is derived from the workspace id
apps\workshop-web\auth.ts:29:export const signOut: WorkspaceAuth['signOut'] = instance.signOut;
apps\workshop-web\app\layout.tsx:21: * `currentViewer()` resolves the signed-in user from the Keycloak session and
apps\workshop-web\app\home\dashboard\page.tsx:2:import { themeVar, primitive } from '@autoworkshop/design-tokens';
apps\workshop-web\app\home\dashboard\page.tsx:18: * first loads the route, so with a real session the first visitor's role and
apps\workshop-web\app\api\auth\[...nextauth]\route.ts:4: * Auth.js's own endpoints: sign-in, callback, sign-out, session, CSRF.
apps\workshop-web\app\api\auth\[...nextauth]\route.ts:6: * The Keycloak redirect URI registered in the realm is `/api/auth/callback/
apps\towing-web\package.json:15:    "@autoworkshop/design-tokens": "workspace:*",
apps\towing-web\next.config.mjs:27:  // so a token change is picked up without a separate build step.
apps\towing-web\next.config.mjs:28:  transpilePackages: ['@autoworkshop/ui', '@autoworkshop/design-tokens'],
apps\towing-web\middleware.ts:6: * Running `auth` as middleware is what PERSISTS a refreshed Keycloak access
apps\towing-web\middleware.ts:7: * token. The refresh itself happens in the `jwt` callback, but only middleware
apps\towing-web\middleware.ts:8: * may write the session cookie — a server component can compute a renewed token
apps\towing-web\middleware.ts:9: * and has no way to store it. Without this file the app would re-refresh on
apps\towing-web\middleware.ts:11: * null a few minutes into every session, with the shell quietly degrading to
apps\towing-web\middleware.ts:17: * here would couple the whole Playwright suite to a running Keycloak and API.
apps\towing-web\auth.ts:9: * produce a session this app could set and not read back.
apps\towing-web\auth.ts:11: * The Keycloak client is derived from the workspace id
apps\towing-web\auth.ts:29:export const signOut: WorkspaceAuth['signOut'] = instance.signOut;
apps\towing-web\app\layout.tsx:21: * `currentViewer()` resolves the signed-in user from the Keycloak session and
apps\towing-web\app\api\auth\[...nextauth]\route.ts:4: * Auth.js's own endpoints: sign-in, callback, sign-out, session, CSRF.
apps\towing-web\app\api\auth\[...nextauth]\route.ts:6: * The Keycloak redirect URI registered in the realm is `/api/auth/callback/
packages\auth\src\workspace-auth.ts:2:import Keycloak from 'next-auth/providers/keycloak';
packages\auth\src\workspace-auth.ts:3:import { getToken } from 'next-auth/jwt';
packages\auth\src\workspace-auth.ts:9:  refreshAccessToken,
packages\auth\src\workspace-auth.ts:11:  type KeycloakTokenSet,
packages\auth\src\workspace-auth.ts:12:} from './tokens';
packages\auth\src\workspace-auth.ts:18: * value — which Keycloak client they authenticate as — and that value is
packages\auth\src\workspace-auth.ts:19: * derivable from the workspace id. Seven copies of a token-refresh callback is
packages\auth\src\workspace-auth.ts:24: * WHAT THE BROWSER GETS. The session cookie is an encrypted JWE, httpOnly, and
packages\auth\src\workspace-auth.ts:25: * the Keycloak tokens live inside it. The browser therefore holds the tokens in
packages\auth\src\workspace-auth.ts:27: * serves whatever the `session` callback returns as JSON at
packages\auth\src\workspace-auth.ts:28: * `/api/auth/session`, to the browser, on request. **Anything placed on the
packages\auth\src\workspace-auth.ts:29: * session object is public to the client.** The tokens are deliberately left in
packages\auth\src\workspace-auth.ts:30: * the JWT and never copied onto the session; `getAccessToken()` below reads
packages\auth\src\workspace-auth.ts:33: * WHAT THIS IS NOT. A session proves who the viewer is. It authorises nothing:
packages\auth\src\workspace-auth.ts:34: * the API re-verifies the token's signature, issuer, audience and expiry on
packages\auth\src\workspace-auth.ts:39:/** What the browser is allowed to know about its own session. */
packages\auth\src\workspace-auth.ts:43:     * Set when the refresh token stopped working. The UI uses it to send the
packages\auth\src\workspace-auth.ts:51:declare module 'next-auth/jwt' {
packages\auth\src\workspace-auth.ts:53:    keycloak?: KeycloakTokenSet;
packages\auth\src\workspace-auth.ts:61:  /** Read the session in a server component, route handler or middleware. */
packages\auth\src\workspace-auth.ts:64:  signOut: NextAuthResult['signOut'];
packages\auth\src\workspace-auth.ts:65:  /** The Keycloak client this workspace authenticates as. */
packages\auth\src\workspace-auth.ts:68:   * The current Keycloak ACCESS TOKEN, server-side only.
packages\auth\src\workspace-auth.ts:70:   * Returns `null` when there is no session, or when the stored token has
packages\auth\src\workspace-auth.ts:71:   * expired. **Expired means null, never a refresh** — see the note on
packages\auth\src\workspace-auth.ts:72:   * `createWorkspaceAuth` about why refreshing here would break the session.
packages\auth\src\workspace-auth.ts:81: * TOKEN REFRESH HAS EXACTLY ONE OWNER: the `jwt` callback below. That is not
packages\auth\src\workspace-auth.ts:82: * tidiness, it is forced by the realm — `revokeRefreshToken: true` with
packages\auth\src\workspace-auth.ts:83: * `refreshTokenMaxReuse: 0` means using a refresh token revokes it, so a second
packages\auth\src\workspace-auth.ts:84: * refresher would silently invalidate the session the first one just renewed.
packages\auth\src\workspace-auth.ts:87: * The refreshed cookie is persisted by MIDDLEWARE, which is the only place in
packages\auth\src\workspace-auth.ts:90: * skips the middleware will re-refresh on every render and persist none of it.
packages\auth\src\workspace-auth.ts:102:    session: { strategy: 'jwt' as const },
packages\auth\src\workspace-auth.ts:110:     * `/api/auth/signin` and `/api/auth/session` fail while ordinary pages keep
packages\auth\src\workspace-auth.ts:115:     * host decides which absolute URL is sent to Keycloak as `redirect_uri`, so
packages\auth\src\workspace-auth.ts:117:     * delivered somewhere else. Keycloak refuses that: each client carries an
packages\auth\src\workspace-auth.ts:131:      Keycloak({
packages\auth\src\workspace-auth.ts:136:         * provider has no authorization, token or JWKS URL and every auth
packages\auth\src\workspace-auth.ts:147:         * two variables, combined the same way, as the API's token validation.
packages\auth\src\workspace-auth.ts:153:        // send, so the token endpoint must not be given one; `none` says so
packages\auth\src\workspace-auth.ts:155:        // Keycloak rejects as a malformed client credential.
packages\auth\src\workspace-auth.ts:157:        // A confidential client would authenticate the token exchange itself
packages\auth\src\workspace-auth.ts:162:        // the change that introduces sessions at all.
packages\auth\src\workspace-auth.ts:163:        client: { token_endpoint_auth_method: 'none' },
packages\auth\src\workspace-auth.ts:168:      async jwt({ token, account }) {
packages\auth\src\workspace-auth.ts:169:        // First call after a successful sign-in: `account` carries the tokens.
packages\auth\src\workspace-auth.ts:171:          token.keycloak = {
packages\auth\src\workspace-auth.ts:172:            accessToken: account.access_token as string,
packages\auth\src\workspace-auth.ts:173:            refreshToken: account.refresh_token as string | undefined,
packages\auth\src\workspace-auth.ts:179:            idToken: account.id_token as string | undefined,
packages\auth\src\workspace-auth.ts:181:          delete token.error;
packages\auth\src\workspace-auth.ts:182:          return token;
packages\auth\src\workspace-auth.ts:185:        const current = token.keycloak;
packages\auth\src\workspace-auth.ts:186:        if (!current) return token;
packages\auth\src\workspace-auth.ts:187:        if (!isExpired(current)) return token;
packages\auth\src\workspace-auth.ts:189:        if (!current.refreshToken) {
packages\auth\src\workspace-auth.ts:190:          // Nothing to refresh with. Marking the token rather than clearing it
packages\auth\src\workspace-auth.ts:192:          token.error = 'RefreshFailed';
packages\auth\src\workspace-auth.ts:193:          return token;
packages\auth\src\workspace-auth.ts:197:          token.keycloak = await refreshAccessToken(clientId, current.refreshToken);
packages\auth\src\workspace-auth.ts:198:          delete token.error;
packages\auth\src\workspace-auth.ts:202:          // token is marked, `getAccessToken()` still returns null once it
packages\auth\src\workspace-auth.ts:205:          token.error = 'RefreshFailed';
packages\auth\src\workspace-auth.ts:207:        return token;
packages\auth\src\workspace-auth.ts:211:      // `/api/auth/session`. Tokens are absent from this object ON PURPOSE.
packages\auth\src\workspace-auth.ts:212:      async session({ session, token }) {
packages\auth\src\workspace-auth.ts:213:        if (token.error) session.error = token.error;
packages\auth\src\workspace-auth.ts:214:        return session;
packages\auth\src\workspace-auth.ts:223:    signOut: result.signOut,
packages\auth\src\workspace-auth.ts:227:      // `auth()` returns the SESSION and the session deliberately has no
packages\auth\src\workspace-auth.ts:228:      // tokens on it.
packages\auth\src\workspace-auth.ts:237:      // for a visitor who has no session and needs none, which is every visitor
packages\auth\src\workspace-auth.ts:242:      // session, no secret required. A cookie that IS present must be
packages\auth\src\workspace-auth.ts:251:      const token = await getToken({
packages\auth\src\workspace-auth.ts:257:      const keycloak = token?.keycloak;
packages\auth\src\workspace-auth.ts:259:      // Expired is not refreshed here — see the header note. A caller that
packages\auth\src\workspace-auth.ts:288: * The URL that ends the KEYCLOAK session, not just the local cookie.
packages\auth\src\workspace-auth.ts:290: * `signOut()` clears this app's cookie and nothing else. The Keycloak SSO
packages\auth\src\workspace-auth.ts:291: * session outlives it, so the next sign-in completes silently and the viewer
packages\auth\src\workspace-auth.ts:295: * `id_token_hint` is what lets Keycloak end the session without an interstitial
packages\auth\src\workspace-auth.ts:299:  const url = new URL(`${keycloakIssuer()}/protocol/openid-connect/logout`);
packages\auth\src\workspace-auth.ts:300:  if (idToken) url.searchParams.set('id_token_hint', idToken);
packages\auth\src\workspace-auth.ts:301:  url.searchParams.set('post_logout_redirect_uri', postLogoutRedirect);
apps\supplier-web\package.json:15:    "@autoworkshop/design-tokens": "workspace:*",
apps\supplier-web\next.config.mjs:27:  // so a token change is picked up without a separate build step.
apps\supplier-web\next.config.mjs:28:  transpilePackages: ['@autoworkshop/ui', '@autoworkshop/design-tokens'],
apps\supplier-web\middleware.ts:6: * Running `auth` as middleware is what PERSISTS a refreshed Keycloak access
apps\supplier-web\middleware.ts:7: * token. The refresh itself happens in the `jwt` callback, but only middleware
apps\supplier-web\middleware.ts:8: * may write the session cookie — a server component can compute a renewed token
apps\supplier-web\middleware.ts:9: * and has no way to store it. Without this file the app would re-refresh on
apps\supplier-web\middleware.ts:11: * null a few minutes into every session, with the shell quietly degrading to
apps\supplier-web\middleware.ts:17: * here would couple the whole Playwright suite to a running Keycloak and API.
apps\supplier-web\auth.ts:9: * produce a session this app could set and not read back.
apps\supplier-web\auth.ts:11: * The Keycloak client is derived from the workspace id
apps\supplier-web\auth.ts:29:export const signOut: WorkspaceAuth['signOut'] = instance.signOut;
apps\supplier-web\app\layout.tsx:21: * `currentViewer()` resolves the signed-in user from the Keycloak session and
apps\supplier-web\app\api\auth\[...nextauth]\route.ts:4: * Auth.js's own endpoints: sign-in, callback, sign-out, session, CSRF.
apps\supplier-web\app\api\auth\[...nextauth]\route.ts:6: * The Keycloak redirect URI registered in the realm is `/api/auth/callback/
apps\storybook\stories\SideNav.stories.tsx:17: * is the Keycloak session behind `currentViewer()`, not a demo array.
apps\storybook\package.json:13:    "@autoworkshop/design-tokens": "workspace:*",
packages\auth\src\tokens.ts:4: * The Keycloak tokens carried by a session.
packages\auth\src\tokens.ts:6: * Kept separate from Auth.js's own types so the refresh logic below is a plain
packages\auth\src\tokens.ts:10:export interface KeycloakTokenSet {
packages\auth\src\tokens.ts:13:   * Absent when Keycloak declined to issue one. Treated as "cannot refresh"
packages\auth\src\tokens.ts:14:   * rather than "refresh with undefined", which would send the string
packages\auth\src\tokens.ts:15:   * "undefined" to the token endpoint and get a 400 that reads like a
packages\auth\src\tokens.ts:18:  refreshToken?: string;
packages\auth\src\tokens.ts:19:  /** Absolute expiry in epoch SECONDS — the unit Keycloak's `exp` uses. */
packages\auth\src\tokens.ts:21:  /** Needed at sign-out: Keycloak's end-session endpoint wants `id_token_hint`. */
packages\auth\src\tokens.ts:28: * The realm issues 300-second access tokens. A token that is valid when the
packages\auth\src\tokens.ts:31: * session a moment earlier. Thirty seconds covers request latency and modest
packages\auth\src\tokens.ts:32: * clock skew between this host and Keycloak.
packages\auth\src\tokens.ts:37:  tokenSet: Pick<KeycloakTokenSet, 'expiresAt'>,
packages\auth\src\tokens.ts:41:  return nowSeconds >= tokenSet.expiresAt - skewSeconds;
packages\auth\src\tokens.ts:44:/** Raised when a refresh cannot succeed and the user must sign in again. */
packages\auth\src\tokens.ts:53:  access_token?: string;
packages\auth\src\tokens.ts:54:  refresh_token?: string;
packages\auth\src\tokens.ts:55:  id_token?: string;
packages\auth\src\tokens.ts:62: * Exchange a refresh token for a fresh access token.
packages\auth\src\tokens.ts:65: * `revokeRefreshToken: true` with `refreshTokenMaxReuse: 0`, so the token
packages\auth\src\tokens.ts:66: * presented here is revoked the instant this call succeeds and the response's
packages\auth\src\tokens.ts:67: * NEW refresh token is the only usable one. Two consequences that are easy to
packages\auth\src\tokens.ts:70: *   · the caller must persist `refreshToken` from the result — keeping the old
packages\auth\src\tokens.ts:71: *     one turns the next refresh into a hard sign-out, roughly five minutes
packages\auth\src\tokens.ts:73: *   · two concurrent refreshes with the same token cannot both win. The loser
packages\auth\src\tokens.ts:77: * No client secret is sent: these are PUBLIC clients (PKCE S256), so the token
packages\auth\src\tokens.ts:78: * endpoint authenticates the request by the refresh token alone.
packages\auth\src\tokens.ts:80:export async function refreshAccessToken(
packages\auth\src\tokens.ts:82:  refreshToken: string,
packages\auth\src\tokens.ts:84:): Promise<KeycloakTokenSet> {
packages\auth\src\tokens.ts:85:  const response = await fetchImpl(`${keycloakIssuer()}/protocol/openid-connect/token`, {
packages\auth\src\tokens.ts:89:      grant_type: 'refresh_token',
packages\auth\src\tokens.ts:91:      refresh_token: refreshToken,
packages\auth\src\tokens.ts:97:  if (!response.ok || !payload.access_token) {
packages\auth\src\tokens.ts:98:    // `error_description` is Keycloak's own text ("Token is not active", say).
packages\auth\src\tokens.ts:100:    // server log — and without it every refresh failure looks identical.
packages\auth\src\tokens.ts:102:      payload.error_description ?? payload.error ?? `token endpoint returned ${response.status}`,
packages\auth\src\tokens.ts:107:    accessToken: payload.access_token,
packages\auth\src\tokens.ts:108:    // Fall back to the presented token only if Keycloak returned none. With
packages\auth\src\tokens.ts:111:    refreshToken: payload.refresh_token ?? refreshToken,
packages\auth\src\tokens.ts:113:    idToken: payload.id_token,
apps\insurance-web\package.json:15:    "@autoworkshop/design-tokens": "workspace:*",
apps\insurance-web\next.config.mjs:27:  // so a token change is picked up without a separate build step.
apps\insurance-web\next.config.mjs:28:  transpilePackages: ['@autoworkshop/ui', '@autoworkshop/design-tokens'],
apps\insurance-web\middleware.ts:6: * Running `auth` as middleware is what PERSISTS a refreshed Keycloak access
apps\insurance-web\middleware.ts:7: * token. The refresh itself happens in the `jwt` callback, but only middleware
apps\insurance-web\middleware.ts:8: * may write the session cookie — a server component can compute a renewed token
apps\insurance-web\middleware.ts:9: * and has no way to store it. Without this file the app would re-refresh on
apps\insurance-web\middleware.ts:11: * null a few minutes into every session, with the shell quietly degrading to
apps\insurance-web\middleware.ts:17: * here would couple the whole Playwright suite to a running Keycloak and API.
apps\insurance-web\auth.ts:9: * produce a session this app could set and not read back.
apps\insurance-web\auth.ts:11: * The Keycloak client is derived from the workspace id
apps\insurance-web\auth.ts:29:export const signOut: WorkspaceAuth['signOut'] = instance.signOut;
packages\auth\src\tokens.test.ts:4:  refreshAccessToken,
packages\auth\src\tokens.test.ts:7:} from './tokens';
packages\auth\src\tokens.test.ts:12:  it('is false while the token has more than the skew left', () => {
packages\auth\src\tokens.test.ts:16:  it('is true once the token is inside the skew window, before it actually expires', () => {
packages\auth\src\tokens.test.ts:17:    // The point of the skew: a token still technically valid must be refreshed
packages\auth\src\tokens.test.ts:22:  it('is true for an already-expired token', () => {
packages\auth\src\tokens.test.ts:32:describe('refreshAccessToken', () => {
packages\auth\src\tokens.test.ts:46:  it('returns the rotated refresh token, not the one it was given', async () => {
packages\auth\src\tokens.test.ts:47:    // The realm sets revokeRefreshToken with refreshTokenMaxReuse 0, so the
packages\auth\src\tokens.test.ts:48:    // presented token is dead the moment this succeeds. Keeping it would turn
packages\auth\src\tokens.test.ts:49:    // the NEXT refresh into a sign-out, five minutes later and far enough from
packages\auth\src\tokens.test.ts:52:      access_token: 'new-access',
packages\auth\src\tokens.test.ts:53:      refresh_token: 'rotated-refresh',
packages\auth\src\tokens.test.ts:57:    const result = await refreshAccessToken('autoworkshop-workshop-web', 'old-refresh', impl);
packages\auth\src\tokens.test.ts:60:    expect(result.refreshToken).toBe('rotated-refresh');
packages\auth\src\tokens.test.ts:65:    const { impl, calls } = stubFetch(200, { access_token: 'a', expires_in: 300 });
packages\auth\src\tokens.test.ts:67:    await refreshAccessToken('autoworkshop-fleet-web', 'r', impl);
packages\auth\src\tokens.test.ts:70:    expect(body.get('grant_type')).toBe('refresh_token');
packages\auth\src\tokens.test.ts:72:    expect(body.get('refresh_token')).toBe('r');
packages\auth\src\tokens.test.ts:76:  it('keeps the presented token when the realm returns none', async () => {
packages\auth\src\tokens.test.ts:77:    const { impl } = stubFetch(200, { access_token: 'a', expires_in: 300 });
packages\auth\src\tokens.test.ts:78:    const result = await refreshAccessToken('c', 'still-valid', impl);
packages\auth\src\tokens.test.ts:79:    expect(result.refreshToken).toBe('still-valid');
packages\auth\src\tokens.test.ts:88:    await expect(refreshAccessToken('c', 'dead', impl)).rejects.toThrowError(RefreshFailedError);
packages\auth\src\tokens.test.ts:89:    await expect(refreshAccessToken('c', 'dead', impl)).rejects.toThrowError('Token is not active');
packages\auth\src\tokens.test.ts:92:  it('treats a 200 with no access_token as a failure', async () => {
packages\auth\src\tokens.test.ts:96:    await expect(refreshAccessToken('c', 'r', impl)).rejects.toThrowError(RefreshFailedError);
packages\auth\src\tokens.test.ts:105:          throw new SyntaxError('Unexpected token < in JSON');
packages\auth\src\tokens.test.ts:109:    // A proxy returning an HTML error page must surface as a refresh failure,
packages\auth\src\tokens.test.ts:110:    // not as a SyntaxError thrown out of the jwt callback — which would fail
packages\auth\src\tokens.test.ts:111:    // the whole request instead of just the session.
packages\auth\src\tokens.test.ts:112:    await expect(refreshAccessToken('c', 'r', impl)).rejects.toThrowError(RefreshFailedError);
packages\auth\src\tokens.test.ts:113:    await expect(refreshAccessToken('c', 'r', impl)).rejects.toThrowError('502');
packages\auth\src\index.ts:4:export { isExpired, refreshAccessToken, RefreshFailedError, REFRESH_SKEW_SECONDS } from './tokens';
packages\auth\src\index.ts:5:export type { KeycloakTokenSet } from './tokens';
packages\auth\src\index.ts:10: * MIDDLEWARE IS NOT OPTIONAL and this matcher is why. The `jwt` callback
packages\auth\src\index.ts:11: * refreshes the Keycloak access token, but only middleware may write the
packages\auth\src\index.ts:12: * resulting cookie — a server component can compute a refreshed token and has
packages\auth\src\index.ts:13: * no way to persist it, so an app without this runs the refresh on every render
packages\auth\src\index.ts:14: * and keeps none of it. With a 300-second access-token lifespan that means
packages\auth\src\index.ts:15: * `getAccessToken()` starts returning null a few minutes into any session.
packages\auth\src\index.ts:18: * themselves; static assets are excluded because running a session decrypt for
apps\insurance-web\app\layout.tsx:21: * `currentViewer()` resolves the signed-in user from the Keycloak session and
apps\insurance-web\app\api\auth\[...nextauth]\route.ts:4: * Auth.js's own endpoints: sign-in, callback, sign-out, session, CSRF.
apps\insurance-web\app\api\auth\[...nextauth]\route.ts:6: * The Keycloak redirect URI registered in the realm is `/api/auth/callback/
apps\fleet-web\package.json:15:    "@autoworkshop/design-tokens": "workspace:*",
apps\fleet-web\next.config.mjs:27:  // so a token change is picked up without a separate build step.
apps\fleet-web\next.config.mjs:28:  transpilePackages: ['@autoworkshop/ui', '@autoworkshop/design-tokens'],
apps\fleet-web\middleware.ts:6: * Running `auth` as middleware is what PERSISTS a refreshed Keycloak access
apps\fleet-web\middleware.ts:7: * token. The refresh itself happens in the `jwt` callback, but only middleware
apps\fleet-web\middleware.ts:8: * may write the session cookie — a server component can compute a renewed token
apps\fleet-web\middleware.ts:9: * and has no way to store it. Without this file the app would re-refresh on
apps\fleet-web\middleware.ts:11: * null a few minutes into every session, with the shell quietly degrading to
apps\fleet-web\middleware.ts:17: * here would couple the whole Playwright suite to a running Keycloak and API.
apps\fleet-web\auth.ts:9: * produce a session this app could set and not read back.
apps\fleet-web\auth.ts:11: * The Keycloak client is derived from the workspace id
apps\fleet-web\auth.ts:29:export const signOut: WorkspaceAuth['signOut'] = instance.signOut;
packages\auth\src\config.ts:4: * Where Keycloak is, and which client each workspace authenticates as.
packages\auth\src\config.ts:26:    // AUTH_SECRET must stop the app, not silently produce a session nobody
packages\auth\src\config.ts:36: * This exact string is also what the API's `KeycloakJwtService` validates the
packages\auth\src\config.ts:38: * two variables. If they drift, tokens this package mints are rejected by the
packages\auth\src\config.ts:39: * API with "token rejected: jwt issuer invalid" — an error that reads like a
packages\auth\src\config.ts:49: * The Keycloak client id for a workspace.
packages\auth\src\config.ts:55: * which fails at the Keycloak redirect with "Client not found", after the user
packages\auth\src\config.ts:65:/** The session encryption key. Absent = hard failure, never a generated default. */
infrastructure\docker\README.md:18:| Keycloak | 8080 | Identity — **own realm**, never Solar's (D2a) |
infrastructure\docker\README.md:27:- **Keycloak heap is capped at 512MB.** Solar's Keycloak OOM'd on a constrained
infrastructure\docker\docker-compose.yml:149:      # Solar's Keycloak OOM'd on a constrained free host. Cap the heap here so
infrastructure\docker\docker-compose.yml:158:      # Keycloak ships with the Quarkus datasource health check disabled, so
infrastructure\docker\docker-compose.yml:181:      # Keycloak re-augments its Quarkus config on first boot after an image or
apps\fleet-web\app\layout.tsx:21: * `currentViewer()` resolves the signed-in user from the Keycloak session and
apps\fleet-web\app\api\auth\[...nextauth]\route.ts:4: * Auth.js's own endpoints: sign-in, callback, sign-out, session, CSRF.
apps\fleet-web\app\api\auth\[...nextauth]\route.ts:6: * The Keycloak redirect URI registered in the realm is `/api/auth/callback/
apps\e2e\tests\shell-journey.spec.ts:32: * Since T-0005 the viewer comes from a Keycloak session, and Playwright starts
apps\e2e\tests\shell-journey.spec.ts:47: * that needs a running Keycloak and API, and is tracked as its own task.
apps\e2e\tests\build-freshness.setup.ts:14: * horizontally by 161px. It survived a session boundary as an open red defect.
apps\e2e\playwright.config.ts:66:     * reported, recorded and carried across a session boundary as live. It was
apps\e2e\playwright.config.ts:140:        // (`SUITE_VIEWER` is null), so this secret encrypts nothing: no session
apps\e2e\playwright.config.ts:145:        AUTH_SECRET: 'e2e-suite-secret-never-used-for-a-real-session',
apps\customer-web\package.json:15:    "@autoworkshop/design-tokens": "workspace:*",
apps\customer-web\next.config.mjs:27:  // so a token change is picked up without a separate build step.
apps\customer-web\next.config.mjs:28:  transpilePackages: ['@autoworkshop/ui', '@autoworkshop/design-tokens'],
apps\customer-web\middleware.ts:6: * Running `auth` as middleware is what PERSISTS a refreshed Keycloak access
apps\customer-web\middleware.ts:7: * token. The refresh itself happens in the `jwt` callback, but only middleware
apps\customer-web\middleware.ts:8: * may write the session cookie — a server component can compute a renewed token
apps\customer-web\middleware.ts:9: * and has no way to store it. Without this file the app would re-refresh on
apps\customer-web\middleware.ts:11: * null a few minutes into every session, with the shell quietly degrading to
apps\customer-web\middleware.ts:17: * here would couple the whole Playwright suite to a running Keycloak and API.
apps\customer-web\auth.ts:9: * produce a session this app could set and not read back.
apps\customer-web\auth.ts:11: * The Keycloak client is derived from the workspace id
apps\customer-web\auth.ts:29:export const signOut: WorkspaceAuth['signOut'] = instance.signOut;
apps\customer-web\app\layout.tsx:21: * `currentViewer()` resolves the signed-in user from the Keycloak session and
apps\customer-web\app\api\auth\[...nextauth]\route.ts:4: * Auth.js's own endpoints: sign-in, callback, sign-out, session, CSRF.
apps\customer-web\app\api\auth\[...nextauth]\route.ts:6: * The Keycloak redirect URI registered in the realm is `/api/auth/callback/
apps\api\src\tenancy\tenant-context.ts:11: * a validated Keycloak token plus a membership lookup. There is deliberately
apps\api\src\tenancy\tenant-context.ts:33: * A validated membership record, as loaded from the database after the token
apps\api\src\tenancy\tenant-context.ts:41:  status: 'active' | 'suspended' | 'revoked';
apps\api\src\tenancy\tenant-context.spec.ts:33:        memberships: [membership({ status: 'revoked' })],
apps\api\src\main.ts:9:  // derived from validated Keycloak claims + membership in Phase 2.
apps\api\src\identity\membership.service.ts:17:  status: 'active' | 'suspended' | 'revoked';
apps\api\src\identity\membership.service.ts:213:   * Suspend or revoke a membership — withdrawing access.
apps\api\src\identity\membership.service.ts:218:   * "was this person ever revoked?" unanswerable.
apps\api\src\identity\membership.service.ts:223:    status: 'suspended' | 'revoked',
apps\api\src\identity\membership.service.ts:243:    if (status !== 'suspended' && status !== 'revoked') {
apps\api\src\identity\membership.service.ts:244:      throw new BadRequestException('status must be suspended or revoked');
apps\api\src\identity\membership.repository.ts:10: * to one. It is therefore keyed strictly on the Keycloak subject taken from a
apps\api\src\identity\membership.repository.ts:11: * validated token signature, and returns nothing else.
apps\api\src\identity\membership.repository.ts:20:  async findByKeycloakSubject(subject: string): Promise<{
apps\api\src\identity\membership.repository.ts:30:      status: 'active' | 'suspended' | 'revoked';
apps\api\src\identity\me.service.ts:34: * Next apps hold a Keycloak session they call this instead, and every value
apps\api\src\identity\me.service.ts:35: * below is derived server-side from a validated token plus membership records.
apps\api\src\identity\me.service.ts:40: * token subject and the membership table — there is no request field that can
apps\api\src\identity\identity.spec.ts:302:    const { db, queries } = fakeDb([{ ...membershipRow, status: 'revoked' }]);
apps\api\src\identity\identity.spec.ts:305:    await svc.withdraw(ctx(), 'm1', 'revoked');
apps\api\src\identity\identity.spec.ts:309:    // Guards against a revoked membership being silently reactivated by a
apps\api\src\identity\identity.spec.ts:315:      expect.objectContaining({ action: 'membership.revoked' }),
apps\api\src\identity\identity.spec.ts:319:  it('rejects a withdrawal status outside suspended/revoked, at RUNTIME', async () => {
apps\api\src\identity\identity.spec.ts:327:        svc.withdraw(ctx(), 'm1', bad as 'suspended' | 'revoked'),
apps\api\src\identity\identity.spec.ts:328:      ).rejects.toThrow(/status must be suspended or revoked/);
apps\api\src\identity\identity.spec.ts:341:      /status must be suspended or revoked/,
apps\api\src\identity\identity.controllers.ts:28: * only from the validated token plus membership (`1.txt` §9), and adding such a
apps\api\src\identity\identity.controllers.ts:103:    @Body() body: { status: 'suspended' | 'revoked' },
apps\api\src\identity\identity.controllers.ts:113: * derived from the validated token plus membership records; no field of the
apps\api\src\auth\tenant.guard.ts:15:import { KeycloakJwtService } from './keycloak-jwt.service';
apps\api\src\auth\tenant.guard.ts:26: *   1. verify the token signature, issuer, audience, expiry and algorithm
apps\api\src\auth\tenant.guard.ts:27: *   2. look up memberships by the token SUBJECT
apps\api\src\auth\tenant.guard.ts:40:    private readonly jwtService: KeycloakJwtService,
apps\api\src\auth\tenant.guard.ts:49:      throw new UnauthorizedException('missing bearer token');
apps\api\src\auth\tenant.guard.ts:52:    const verified = await this.jwtService.verify(header.slice(7));
apps\api\src\auth\tenant.guard.ts:54:    const record = await this.memberships.findByKeycloakSubject(verified.subject);
apps\api\src\auth\tenant.guard.ts:56:      // A valid Keycloak token whose subject has no application user. Refused:
apps\api\src\auth\keycloak-jwt.spec.ts:3:import * as jwt from 'jsonwebtoken';
apps\api\src\auth\keycloak-jwt.spec.ts:5:import { KeycloakJwtService } from './keycloak-jwt.service';
apps\api\src\auth\keycloak-jwt.spec.ts:11: * and stub the JWKS lookup, so they run without Keycloak and still exercise the
apps\api\src\auth\keycloak-jwt.spec.ts:12: * real `jsonwebtoken` verification path — the code that actually decides
apps\api\src\auth\keycloak-jwt.spec.ts:24:function makeService(): KeycloakJwtService {
apps\api\src\auth\keycloak-jwt.spec.ts:30:  const svc = new KeycloakJwtService(config);
apps\api\src\auth\keycloak-jwt.spec.ts:40:const sign = (payload: object, opts: jwt.SignOptions = {}): string =>
apps\api\src\auth\keycloak-jwt.spec.ts:41:  jwt.sign(payload, privateKey, {
apps\api\src\auth\keycloak-jwt.spec.ts:50:let svc: KeycloakJwtService;
apps\api\src\auth\keycloak-jwt.spec.ts:55:describe('KeycloakJwtService', () => {
apps\api\src\auth\keycloak-jwt.spec.ts:56:  it('accepts a correctly signed token', async () => {
apps\api\src\auth\keycloak-jwt.spec.ts:57:    const token = sign({ sub: 'user-123', email: 'a@b.c', realm_access: { roles: ['mechanic'] } });
apps\api\src\auth\keycloak-jwt.spec.ts:58:    const v = await svc.verify(token);
apps\api\src\auth\keycloak-jwt.spec.ts:63:  it('SECURITY: rejects a token signed by a different key', async () => {
apps\api\src\auth\keycloak-jwt.spec.ts:69:    const forged = jwt.sign({ sub: 'attacker' }, attacker, {
apps\api\src\auth\keycloak-jwt.spec.ts:73:    await expect(svc.verify(forged)).rejects.toThrow(/token rejected/);
apps\api\src\auth\keycloak-jwt.spec.ts:76:  it('SECURITY: rejects alg=none (unsigned token)', async () => {
apps\api\src\auth\keycloak-jwt.spec.ts:78:    const unsigned = jwt.sign({ sub: 'attacker', iss: ISSUER, aud: AUDIENCE }, '', {
apps\api\src\auth\keycloak-jwt.spec.ts:79:      algorithm: 'none' as jwt.Algorithm,
apps\api\src\auth\keycloak-jwt.spec.ts:85:  it('SECURITY: rejects a token from a DIFFERENT realm', async () => {
apps\api\src\auth\keycloak-jwt.spec.ts:86:    // A valid Solar token must not authenticate here. This is ADR-011
apps\api\src\auth\keycloak-jwt.spec.ts:87:    // non-entanglement enforced at the token layer.
apps\api\src\auth\keycloak-jwt.spec.ts:89:    await expect(svc.verify(otherRealm)).rejects.toThrow(/token rejected/);
apps\api\src\auth\keycloak-jwt.spec.ts:92:  it('SECURITY: rejects a token minted for another audience', async () => {
apps\api\src\auth\keycloak-jwt.spec.ts:94:    await expect(svc.verify(wrongAud)).rejects.toThrow(/token rejected/);
apps\api\src\auth\keycloak-jwt.spec.ts:97:  it('SECURITY: rejects an expired token', async () => {
apps\api\src\auth\keycloak-jwt.spec.ts:99:    await expect(svc.verify(expired)).rejects.toThrow(/token rejected/);
apps\api\src\auth\keycloak-jwt.spec.ts:102:  it('SECURITY: rejects a token with no subject', async () => {
apps\api\src\auth\keycloak-jwt.spec.ts:106:  it('rejects a malformed token', async () => {
apps\api\src\auth\keycloak-jwt.spec.ts:107:    await expect(svc.verify('not-a-jwt')).rejects.toThrow(/malformed token/);
apps\api\src\auth\keycloak-jwt.service.ts:3:import * as jwt from 'jsonwebtoken';
apps\api\src\auth\keycloak-jwt.service.ts:7:  /** Keycloak subject — the ONLY identity input we trust from the token. */
apps\api\src\auth\keycloak-jwt.service.ts:14: * Keycloak access-token verification.
apps\api\src\auth\keycloak-jwt.service.ts:19: *   signature  — a token minted by anyone else
apps\api\src\auth\keycloak-jwt.service.ts:20: *   issuer     — a valid token from a DIFFERENT realm (Solar's, for instance),
apps\api\src\auth\keycloak-jwt.service.ts:22: *   audience   — a token minted for another client being replayed at this API
apps\api\src\auth\keycloak-jwt.service.ts:23: *                (`0.txt` §16 audience-restricted tokens)
apps\api\src\auth\keycloak-jwt.service.ts:24: *   expiry     — replay of an old token
apps\api\src\auth\keycloak-jwt.service.ts:30:export class KeycloakJwtService {
apps\api\src\auth\keycloak-jwt.service.ts:52:  async verify(token: string): Promise<VerifiedToken> {
apps\api\src\auth\keycloak-jwt.service.ts:55:    const decoded = jwt.decode(token, { complete: true });
apps\api\src\auth\keycloak-jwt.service.ts:57:      throw new UnauthorizedException('malformed token');
apps\api\src\auth\keycloak-jwt.service.ts:68:    let payload: jwt.JwtPayload;
apps\api\src\auth\keycloak-jwt.service.ts:70:      payload = jwt.verify(token, key, {
apps\api\src\auth\keycloak-jwt.service.ts:74:      }) as jwt.JwtPayload;
apps\api\src\auth\keycloak-jwt.service.ts:77:        `token rejected: ${(err as Error).message}`,
apps\api\src\auth\keycloak-jwt.service.ts:82:      throw new UnauthorizedException('token has no subject');
apps\api\src\auth\keycloak-jwt.service.ts:86:    // uses the ACTIVE role from the membership record, not this list — a token
apps\api\src\auth\keycloak-jwt.service.ts:87:    // role set can be stale relative to a membership that was just revoked.
apps\api\src\auth\auth.module.ts:3:import { KeycloakJwtService } from './keycloak-jwt.service';
apps\api\src\auth\auth.module.ts:9:  providers: [KeycloakJwtService, TenantGuard],
apps\api\src\auth\auth.module.ts:10:  exports: [KeycloakJwtService, TenantGuard],
apps\api\package.json:17:    "@nestjs/jwt": "^11.0.2",
apps\api\package.json:20:    "jsonwebtoken": "^9.0.3",
apps\api\package.json:30:    "@types/jsonwebtoken": "^9.0.10",
apps\admin-web\package.json:15:    "@autoworkshop/design-tokens": "workspace:*",
apps\admin-web\next.config.mjs:27:  // so a token change is picked up without a separate build step.
apps\admin-web\next.config.mjs:28:  transpilePackages: ['@autoworkshop/ui', '@autoworkshop/design-tokens'],
apps\admin-web\middleware.ts:6: * Running `auth` as middleware is what PERSISTS a refreshed Keycloak access
apps\admin-web\middleware.ts:7: * token. The refresh itself happens in the `jwt` callback, but only middleware
apps\admin-web\middleware.ts:8: * may write the session cookie — a server component can compute a renewed token
apps\admin-web\middleware.ts:9: * and has no way to store it. Without this file the app would re-refresh on
apps\admin-web\middleware.ts:11: * null a few minutes into every session, with the shell quietly degrading to
apps\admin-web\middleware.ts:17: * here would couple the whole Playwright suite to a running Keycloak and API.
apps\admin-web\auth.ts:9: * produce a session this app could set and not read back.
apps\admin-web\auth.ts:11: * The Keycloak client is derived from the workspace id
apps\admin-web\auth.ts:29:export const signOut: WorkspaceAuth['signOut'] = instance.signOut;
apps\admin-web\app\layout.tsx:21: * `currentViewer()` resolves the signed-in user from the Keycloak session and
apps\admin-web\app\api\auth\[...nextauth]\route.ts:4: * Auth.js's own endpoints: sign-in, callback, sign-out, session, CSRF.
apps\admin-web\app\api\auth\[...nextauth]\route.ts:6: * The Keycloak redirect URI registered in the realm is `/api/auth/callback/
infrastructure\migrations\001_tenancy_foundation.sql:23:-- ── session context helpers ─────────────────────────────────────────────────
infrastructure\migrations\001_tenancy_foundation.sql:24:-- The application sets these per transaction after validating Keycloak claims
infrastructure\migrations\001_tenancy_foundation.sql:116:-- Authentication lives in Keycloak (ADR-005). This table holds the application
infrastructure\migrations\001_tenancy_foundation.sql:117:-- profile and links to the Keycloak subject. No password material is ever
infrastructure\migrations\001_tenancy_foundation.sql:149:                    CHECK (status IN ('active', 'suspended', 'revoked')),
infrastructure\backup\restore-drill.sh:298:  echo "or Keycloak realm restore, which is exported but not yet drilled."
infrastructure\keycloak\import-realm.sh:5:# reviewable in a diff, and restorable after a Keycloak loss. `1.txt` §32
infrastructure\keycloak\import-realm.sh:52:# the realm representation REPLACES Keycloak's built-in scopes wholesale — which
infrastructure\keycloak\import-realm.sh:53:# left the realm with only 2 scopes and no `roles` scope at all, so tokens
infrastructure\keycloak\client-scope-audience.json:3:  "description": "Adds the API as an audience so tokens are audience-restricted (0.txt S16)",
infrastructure\keycloak\client-scope-audience.json:6:    "include.in.token.scope": "true",
infrastructure\keycloak\client-scope-audience.json:16:        "id.token.claim": "false",
infrastructure\keycloak\client-scope-audience.json:17:        "access.token.claim": "true"
infrastructure\keycloak\README.md:1:# Keycloak — AutoWorkshop realm
infrastructure\keycloak\README.md:3:Identity is Keycloak (ADR-005 — mandatory; there is no alternative auth product).
infrastructure\keycloak\README.md:27:**1. A `clientScopes` array in the realm JSON REPLACES Keycloak's built-in scopes.**
infrastructure\keycloak\README.md:30:not have authorized anything. It looked fine in the config; it was broken in the token.
infrastructure\keycloak\README.md:36:with only whatever already exists. Removed; Keycloak seeds its own.
infrastructure\keycloak\README.md:38:Both were found by **listing the realm's actual scopes and decoding a real token** — not by reading the
infrastructure\keycloak\README.md:45:| Access token lifetime | 300 s | `1.txt` §11 short-lived tokens |
infrastructure\keycloak\README.md:46:| Refresh token rotation | `revokeRefreshToken`, `refreshTokenMaxReuse: 0` | §11 reuse detection |
infrastructure\keycloak\README.md:50:| API client | `bearerOnly` — validates tokens, never initiates login | it is an audience, not a client |
infrastructure\keycloak\README.md:51:| Audience | tokens carry `aud: autoworkshop-api` | `0.txt` §16 audience-restricted tokens |
infrastructure\keycloak\README.md:52:| Events | login, logout, register, password, token errors; 30-day retention | `1.txt` §55 |
infrastructure\keycloak\README.md:54:## There is deliberately NO tenant claim in the token
infrastructure\keycloak\README.md:57:identifier supplied only by the client"*). A `tenant_id` baked into a token becomes a stale, client-carried
infrastructure\keycloak\README.md:58:value the moment memberships change — and it would move the isolation boundary into a bearer token.
infrastructure\keycloak\README.md:63:A real token was minted and decoded (test user and the temporary password grant both removed afterwards):
infrastructure\keycloak\realm-autoworkshop.json:18:  "revokeRefreshToken": true,
infrastructure\keycloak\realm-autoworkshop.json:19:  "refreshTokenMaxReuse": 0,
infrastructure\keycloak\realm-autoworkshop.json:165:        "post.logout.redirect.uris": "+"
infrastructure\keycloak\realm-autoworkshop.json:186:        "post.logout.redirect.uris": "+"
infrastructure\keycloak\realm-autoworkshop.json:207:        "post.logout.redirect.uris": "+"
infrastructure\keycloak\realm-autoworkshop.json:226:        "post.logout.redirect.uris": "+"
infrastructure\keycloak\realm-autoworkshop.json:245:        "post.logout.redirect.uris": "+"
infrastructure\keycloak\realm-autoworkshop.json:264:        "post.logout.redirect.uris": "+"
infrastructure\keycloak\realm-autoworkshop.json:283:        "post.logout.redirect.uris": "+"
packages\ui\package.json:8:    "@autoworkshop/design-tokens": "workspace:*",
packages\ui\src\AppShell.tsx:4:import { themeVar, primitive } from '@autoworkshop/design-tokens';
packages\ui\src\AiAssistantPanel.tsx:4:import { themeVar, primitive } from '@autoworkshop/design-tokens';
packages\ui\src\Breadcrumbs.tsx:4:import { themeVar, primitive } from '@autoworkshop/design-tokens';
packages\ui\src\Dialog.tsx:4:import { themeVar, primitive } from '@autoworkshop/design-tokens';
packages\ui\src\Dialog.tsx:22: * blocked/danger status token AND requires an explicit `confirmLabel` naming the
infrastructure\backup\backup.sh:99:# 3. Keycloak realm export (`1.txt` §32 — daily and after any change).
infrastructure\backup\backup.sh:114:  # HTTP interface on :9000 — which the already-running Keycloak owns. It dies
packages\next-shell\src\WorkspaceShell.tsx:13:import { themeVar, primitive } from '@autoworkshop/design-tokens';
packages\next-shell\src\WorkspaceShell.tsx:51:   * this is a CLIENT component, and since T-0005 the role comes from a Keycloak
packages\next-shell\src\WorkspaceShell.tsx:52:   * session read on the server. A client component cannot await it.
packages\next-shell\src\viewer.ts:7: * WHO THE VIEWER IS — resolved from a validated Keycloak session (T-0005).
packages\next-shell\src\viewer.ts:11: * read of the validated Keycloak claims and the viewer's membership records."
packages\next-shell\src\viewer.ts:15: * SERVER ONLY. The access token is read from the encrypted session cookie and
packages\next-shell\src\viewer.ts:20: * permissions from the token subject plus membership records.
packages\next-shell\src\viewer.ts:39:  // No session, or a session whose access token has expired without middleware
packages\next-shell\src\viewer.ts:83: * session the risk is worse, not better — two call sites could resolve two
packages\next-shell\src\viewer.test.ts:21: * WHAT CHANGED WITH T-0005. The grants and role now come from a Keycloak
packages\next-shell\src\viewer.test.ts:22: * session via `GET /api/v1/me`, so they can no longer be evaluated in a unit
packages\next-shell\src\viewer-contract.ts:7: * Keycloak session, which needs `next/headers`, which only exists inside a Next
packages\next-shell\src\ModulePage.tsx:10:import { themeVar, primitive } from '@autoworkshop/design-tokens';
packages\next-shell\src\ModulePage.tsx:33: * §8: "Hidden ≠ secure". Since T-0005 `grants` originate in a validated Keycloak
packages\next-shell\src\ModulePage.tsx:34: * session rather than a demo array, which makes them ACCURATE — it does not make
packages\next-shell\src\ModulePage.tsx:65:  // Since T-0005 this is a session read, so it is awaited. It resolves to the
packages\next-shell\package.json:9:    "@autoworkshop/design-tokens": "workspace:*",
infrastructure\backup\drills\drill-20260726T183132Z.md:46:or Keycloak realm restore, which is exported but not yet drilled.
infrastructure\backup\drills\drill-20260726T175716Z.md:46:or Keycloak realm restore, which is exported but not yet drilled.
infrastructure\backup\drills\drill-20260726T175053Z.md:46:or Keycloak realm restore, which is exported but not yet drilled.
infrastructure\backup\drills\drill-20260726T174727Z.md:46:or Keycloak realm restore, which is exported but not yet drilled.
infrastructure\backup\drills\drill-20260726T173706Z.md:46:or Keycloak realm restore, which is exported but not yet drilled.
packages\design-tokens\src\primitive.ts:2: * Primitive tokens — raw values, the base of the token hierarchy
packages\design-tokens\src\primitive.ts:12:/** Primitive tokens — raw values. Never referenced directly by components. */
packages\design-tokens\src\index.ts:6: * AutoWorkshop AI design tokens.
packages\design-tokens\src\index.ts:17:/** Semantic tokens — purpose, not appearance. Components use these. */
packages\design-tokens\package.json:2:  "name": "@autoworkshop/design-tokens",
packages\ui\src\Drawer.tsx:4:import { themeVar, primitive } from '@autoworkshop/design-tokens';
packages\ui\src\PageHeader.tsx:4:import { themeVar, primitive } from '@autoworkshop/design-tokens';
packages\ui\src\SideNav.tsx:4:import { themeVar, primitive } from '@autoworkshop/design-tokens';
packages\ui\src\StatusBadge.tsx:2:import { statusVar, type StatusKind } from '@autoworkshop/design-tokens';
packages\ui\src\Tabs.tsx:4:import { themeVar, primitive } from '@autoworkshop/design-tokens';
packages\ui\src\ThemeProvider.tsx:4:import { themeStylesheet, themeVar, primitive, type ThemeName } from '@autoworkshop/design-tokens';
packages\ui\src\ThemeProvider.tsx:92:      /* ignore — the in-memory choice still applies for this session */
packages\ui\src\TopNav.tsx:4:import { themeVar, primitive } from '@autoworkshop/design-tokens';
packages\ui\src\useMediaQuery.ts:4:import { breakpoint } from '@autoworkshop/design-tokens';
packages\ui\src\useMediaQuery.ts:44: * The threshold is `breakpoint.tabletPortrait` from the design tokens rather

codex
A few areas stand out for closer reading: the migration enables RLS only on some identity tables, the audit table is tenant-scoped but may not be protected, and the admin route guard depends on viewer resolution rather than just nav hiding. I’ll verify those against the actual source before calling them findings.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=1; Get-Content apps'"\\api\\src\\tenancy\\tenant-context.ts | ForEach-Object { '{0,4}: {1}' -f "'$i, $_; $i++ }' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=1; Get-Content apps'"\\api\\src\\auth\\tenant.guard.ts | ForEach-Object { '{0,4}: {1}' -f "'$i, $_; $i++ }' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=1; Get-Content infrastructure'"\\migrations\\001_tenancy_foundation.sql | ForEach-Object { '{0,4}: {1}' -f "'$i, $_; $i++ }' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=1; Get-Content apps'"\\api\\src\\database\\database.service.ts | ForEach-Object { '{0,4}: {1}' -f "'$i, $_; $i++ }' in C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=1; Get-Content apps'"\\api\\src\\tenancy\\tenant-context.ts | ForEach-Object { '{0,4}: {1}' -f "'$i, $_; $i++ }'` rejected: blocked by policy
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=1; Get-Content infrastructure'"\\migrations\\001_tenancy_foundation.sql | ForEach-Object { '{0,4}: {1}' -f "'$i, $_; $i++ }'` rejected: blocked by policy
2026-07-27T23:17:00.375553Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=1; Get-Content apps'"\\api\\src\\tenancy\\tenant-context.ts | ForEach-Object { '{0,4}: {1}' -f "'$i, $_; $i++ }'` rejected: blocked by policy
2026-07-27T23:17:00.376350Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=1; Get-Content infrastructure'"\\migrations\\001_tenancy_foundation.sql | ForEach-Object { '{0,4}: {1}' -f "'$i, $_; $i++ }'` rejected: blocked by policy
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=1; Get-Content apps'"\\api\\src\\auth\\tenant.guard.ts | ForEach-Object { '{0,4}: {1}' -f "'$i, $_; $i++ }'` rejected: blocked by policy
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=1; Get-Content apps'"\\api\\src\\database\\database.service.ts | ForEach-Object { '{0,4}: {1}' -f "'$i, $_; $i++ }'` rejected: blocked by policy
2026-07-27T23:17:00.541412Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=1; Get-Content apps'"\\api\\src\\auth\\tenant.guard.ts | ForEach-Object { '{0,4}: {1}' -f "'$i, $_; $i++ }'` rejected: blocked by policy
2026-07-27T23:17:00.541508Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=1; Get-Content apps'"\\api\\src\\database\\database.service.ts | ForEach-Object { '{0,4}: {1}' -f "'$i, $_; $i++ }'` rejected: blocked by policy
codex
The line-numbering command was blocked by the shell policy, so I’m switching to `rg -n` for file reads. That still gives stable file:line references without changing anything.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "." infrastructure/migrations/001_tenancy_foundation.sql' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "." apps/api/src/database/database.service.ts' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "." apps/api/src/auth/tenant.guard.ts' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "." apps/api/src/tenancy/tenant-context.ts' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 1093ms:
1:import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
2:import { ConfigService } from '@nestjs/config';
3:import { Pool, type PoolClient } from 'pg';
4:import {
5:  tenantSessionStatements,
6:  type TenantContext,
7:} from '../tenancy/tenant-context';
8:
9:/**
10: * Database access.
11: *
12: * The application connects as `autoworkshop_app` — a NOSUPERUSER, NOBYPASSRLS
13: * role created by migration 002. This is not a preference: **a superuser
14: * bypasses row-level security entirely, even with FORCE**, so connecting as the
15: * bootstrap role would leave every RLS policy present and none of them applied.
16: * That was observed against a live database before this code existed.
17: */
18:@Injectable()
19:export class DatabaseService implements OnModuleInit, OnModuleDestroy {
20:  private pool!: Pool;
21:
22:  constructor(private readonly config: ConfigService) {}
23:
24:  onModuleInit(): void {
25:    const url = this.config.get<string>('DATABASE_URL');
26:    if (!url) {
27:      throw new Error('DATABASE_URL is not configured');
28:    }
29:    if (/:\/\/autoworkshop:/.test(url)) {
30:      // Fail loudly at boot rather than silently running without isolation.
31:      throw new Error(
32:        'DATABASE_URL uses the bootstrap superuser. The application must ' +
33:          'connect as autoworkshop_app (NOSUPERUSER, NOBYPASSRLS) or row-level ' +
34:          'security is bypassed and tenant isolation does not apply.',
35:      );
36:    }
37:    this.pool = new Pool({ connectionString: url, max: 10 });
38:  }
39:
40:  async onModuleDestroy(): Promise<void> {
41:    await this.pool?.end();
42:  }
43:
44:  /**
45:   * Run work inside a transaction bound to one tenant context.
46:   *
47:   * This is the ONLY sanctioned way to reach tenant data. The context settings
48:   * are transaction-local (`set_config(..., true)`), so when the connection
49:   * returns to the pool it carries nothing: the next request that borrows it
50:   * cannot inherit the previous tenant's context.
51:   *
52:   * Parameters are bound, never interpolated — the context values reach
53:   * PostgreSQL as data, so a crafted role or tenant string cannot alter the
54:   * statement.
55:   */
56:  async withTenant<T>(
57:    ctx: TenantContext,
58:    work: (client: PoolClient) => Promise<T>,
59:  ): Promise<T> {
60:    const client = await this.pool.connect();
61:    try {
62:      await client.query('BEGIN');
63:      for (const stmt of tenantSessionStatements(ctx)) {
64:        await client.query(stmt.text, stmt.values);
65:      }
66:      const result = await work(client);
67:      await client.query('COMMIT');
68:      return result;
69:    } catch (err) {
70:      await client.query('ROLLBACK').catch(() => undefined);
71:      throw err;
72:    } finally {
73:      client.release();
74:    }
75:  }
76:
77:  /**
78:   * Escape hatch for genuinely tenant-less work — health checks, migrations
79:   * ledger reads. RLS still applies; with no tenant context set, policies
80:   * return zero rows rather than everything (fail closed).
81:   */
82:  async queryWithoutTenant<T = unknown>(
83:    text: string,
84:    values: unknown[] = [],
85:  ): Promise<T[]> {
86:    const res = await this.pool.query(text, values);
87:    return res.rows as T[];
88:  }
89:}

 succeeded in 1122ms:
1:-- ============================================================================
2:-- Migration 001 — tenancy foundation
3:--
4:-- Establishes the isolation model every later migration depends on:
5:--   tenant -> organization -> branch -> membership
6:-- plus the RLS helper functions and the standard policy shape.
7:--
8:-- Rules enforced here (docs/05-database/DATABASE_MIGRATIONS.md):
9:--   * TEXT, never VARCHAR(n), on free-text columns
10:--   * every tenant-owned table gets ENABLE + FORCE ROW LEVEL SECURITY
11:--   * FORCE matters — without it the table owner silently bypasses the policy
12:--   * audit columns on every tenant-owned table
13:-- ============================================================================
14:
15:BEGIN;
16:
17:CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
18:CREATE EXTENSION IF NOT EXISTS "pg_trgm";
19:CREATE EXTENSION IF NOT EXISTS "vector";
20:
21:CREATE SCHEMA IF NOT EXISTS identity;
22:
23:-- ── session context helpers ─────────────────────────────────────────────────
24:-- The application sets these per transaction after validating Keycloak claims
25:-- and membership. They are NEVER derived from client input (`1.txt` §9).
26:
27:CREATE OR REPLACE FUNCTION identity.current_tenant_id()
28:RETURNS uuid
29:LANGUAGE sql STABLE
30:AS $$
31:  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
32:$$;
33:
34:CREATE OR REPLACE FUNCTION identity.current_user_id()
35:RETURNS uuid
36:LANGUAGE sql STABLE
37:AS $$
38:  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
39:$$;
40:
41:CREATE OR REPLACE FUNCTION identity.current_role_name()
42:RETURNS text
43:LANGUAGE sql STABLE
44:AS $$
45:  SELECT COALESCE(NULLIF(current_setting('app.current_role', true), ''), 'none');
46:$$;
47:
48:-- Platform administration is the ONLY cross-tenant scope, and it is always
49:-- audited. Everything else is confined to one resolved tenant.
50:CREATE OR REPLACE FUNCTION identity.is_platform_admin()
51:RETURNS boolean
52:LANGUAGE sql STABLE
53:AS $$
54:  SELECT identity.current_role_name() IN ('admin', 'platform_administrator');
55:$$;
56:
57:-- ── tenants ─────────────────────────────────────────────────────────────────
58:-- A tenant is the legal/commercial isolation boundary.
59:
60:CREATE TABLE IF NOT EXISTS identity.tenants (
61:    id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
62:    name         TEXT NOT NULL,
63:    slug         TEXT NOT NULL UNIQUE,
64:    status       TEXT NOT NULL DEFAULT 'active'
65:                 CHECK (status IN ('active', 'suspended', 'closed')),
66:    created_at   timestamptz NOT NULL DEFAULT now(),
67:    created_by   uuid,
68:    updated_at   timestamptz,
69:    updated_by   uuid
70:);
71:
72:-- ── organizations ───────────────────────────────────────────────────────────
73:-- Organization types from `1.txt` Domain 1.
74:
75:CREATE TABLE IF NOT EXISTS identity.organizations (
76:    id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
77:    tenant_id    uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
78:    name         TEXT NOT NULL,
79:    org_type     TEXT NOT NULL
80:                 CHECK (org_type IN (
81:                   'vehicle_owner', 'individual_workshop', 'multi_branch_workshop',
82:                   'mobile_technician', 'parts_supplier', 'fleet_operator',
83:                   'insurance_company', 'towing_company', 'training_institution',
84:                   'platform_operator')),
85:    status       TEXT NOT NULL DEFAULT 'active'
86:                 CHECK (status IN ('active', 'suspended', 'closed')),
87:    created_at   timestamptz NOT NULL DEFAULT now(),
88:    created_by   uuid,
89:    updated_at   timestamptz,
90:    updated_by   uuid
91:);
92:
93:CREATE INDEX IF NOT EXISTS idx_organizations_tenant ON identity.organizations(tenant_id);
94:
95:-- ── branches ────────────────────────────────────────────────────────────────
96:
97:CREATE TABLE IF NOT EXISTS identity.branches (
98:    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
99:    tenant_id       uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
100:    organization_id uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
101:    name            TEXT NOT NULL,
102:    location        TEXT,
103:    operating_hours TEXT,
104:    status          TEXT NOT NULL DEFAULT 'active'
105:                    CHECK (status IN ('active', 'suspended', 'closed')),
106:    created_at      timestamptz NOT NULL DEFAULT now(),
107:    created_by      uuid,
108:    updated_at      timestamptz,
109:    updated_by      uuid
110:);
111:
112:CREATE INDEX IF NOT EXISTS idx_branches_tenant ON identity.branches(tenant_id);
113:CREATE INDEX IF NOT EXISTS idx_branches_org    ON identity.branches(organization_id);
114:
115:-- ── users ───────────────────────────────────────────────────────────────────
116:-- Authentication lives in Keycloak (ADR-005). This table holds the application
117:-- profile and links to the Keycloak subject. No password material is ever
118:-- stored here.
119:
120:CREATE TABLE IF NOT EXISTS identity.users (
121:    id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
122:    keycloak_subject  TEXT NOT NULL UNIQUE,
123:    email             TEXT NOT NULL,
124:    display_name      TEXT NOT NULL,
125:    phone             TEXT,
126:    preferred_locale  TEXT NOT NULL DEFAULT 'en',
127:    status            TEXT NOT NULL DEFAULT 'active'
128:                      CHECK (status IN ('active', 'suspended', 'closed')),
129:    created_at        timestamptz NOT NULL DEFAULT now(),
130:    created_by        uuid,
131:    updated_at        timestamptz,
132:    updated_by        uuid
133:);
134:
135:CREATE INDEX IF NOT EXISTS idx_users_email ON identity.users(lower(email));
136:
137:-- ── memberships ─────────────────────────────────────────────────────────────
138:-- A user gains access ONLY through a membership. A user may belong to several
139:-- tenants, but every request resolves exactly one active tenant context.
140:
141:CREATE TABLE IF NOT EXISTS identity.memberships (
142:    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
143:    tenant_id       uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
144:    organization_id uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
145:    branch_id       uuid REFERENCES identity.branches(id) ON DELETE SET NULL,
146:    user_id         uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
147:    role_name       TEXT NOT NULL,
148:    status          TEXT NOT NULL DEFAULT 'active'
149:                    CHECK (status IN ('active', 'suspended', 'revoked')),
150:    created_at      timestamptz NOT NULL DEFAULT now(),
151:    created_by      uuid,
152:    updated_at      timestamptz,
153:    updated_by      uuid,
154:    UNIQUE (organization_id, user_id, role_name)
155:);
156:
157:CREATE INDEX IF NOT EXISTS idx_memberships_tenant ON identity.memberships(tenant_id);
158:CREATE INDEX IF NOT EXISTS idx_memberships_user   ON identity.memberships(user_id);
159:
160:-- ── row-level security ──────────────────────────────────────────────────────
161:-- ENABLE alone is not enough: without FORCE, the table owner bypasses the
162:-- policy entirely — which would silently defeat isolation in exactly the
163:-- environment where it matters most.
164:
165:ALTER TABLE identity.tenants       ENABLE ROW LEVEL SECURITY;
166:ALTER TABLE identity.tenants       FORCE  ROW LEVEL SECURITY;
167:ALTER TABLE identity.organizations ENABLE ROW LEVEL SECURITY;
168:ALTER TABLE identity.organizations FORCE  ROW LEVEL SECURITY;
169:ALTER TABLE identity.branches      ENABLE ROW LEVEL SECURITY;
170:ALTER TABLE identity.branches      FORCE  ROW LEVEL SECURITY;
171:ALTER TABLE identity.memberships   ENABLE ROW LEVEL SECURITY;
172:ALTER TABLE identity.memberships   FORCE  ROW LEVEL SECURITY;
173:
174:DROP POLICY IF EXISTS tenant_isolation ON identity.tenants;
175:CREATE POLICY tenant_isolation ON identity.tenants
176:    USING (identity.is_platform_admin() OR id = identity.current_tenant_id())
177:    WITH CHECK (identity.is_platform_admin() OR id = identity.current_tenant_id());
178:
179:DROP POLICY IF EXISTS tenant_isolation ON identity.organizations;
180:CREATE POLICY tenant_isolation ON identity.organizations
181:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
182:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
183:
184:DROP POLICY IF EXISTS tenant_isolation ON identity.branches;
185:CREATE POLICY tenant_isolation ON identity.branches
186:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
187:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
188:
189:DROP POLICY IF EXISTS tenant_isolation ON identity.memberships;
190:CREATE POLICY tenant_isolation ON identity.memberships
191:    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
192:    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
193:
194:-- identity.users is deliberately NOT tenant-scoped: one human may hold
195:-- memberships in several tenants. Visibility of a user is granted through
196:-- membership joins, which ARE tenant-scoped.
197:
198:-- ── audit log (append-only) ─────────────────────────────────────────────────
199:-- `1.txt` §55: audit records are tamper-resistant and separate from ordinary
200:-- application logs. Enforced with rules rather than convention.
201:
202:CREATE SCHEMA IF NOT EXISTS audit;
203:
204:CREATE TABLE IF NOT EXISTS audit.events (
205:    id               bigserial PRIMARY KEY,
206:    occurred_at      timestamptz NOT NULL DEFAULT now(),
207:    tenant_id        uuid,
208:    organization_id  uuid,
209:    actor_user_id    uuid,
210:    actor_agent_id   TEXT,
211:    actor_kind       TEXT NOT NULL DEFAULT 'user'
212:                     CHECK (actor_kind IN ('user', 'agent', 'system')),
213:    action           TEXT NOT NULL,
214:    resource_type    TEXT,
215:    resource_id      TEXT,
216:    correlation_id   TEXT,
217:    approval_status  TEXT,
218:    result           TEXT NOT NULL DEFAULT 'success'
219:                     CHECK (result IN ('success', 'denied', 'error')),
220:    detail           jsonb NOT NULL DEFAULT '{}'::jsonb
221:);
222:
223:CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON audit.events(tenant_id, occurred_at DESC);
224:CREATE INDEX IF NOT EXISTS idx_audit_correlation ON audit.events(correlation_id);
225:
226:-- Append-only. An audit trail that can be edited is not an audit trail.
227:CREATE OR REPLACE RULE audit_events_no_update AS
228:    ON UPDATE TO audit.events DO INSTEAD NOTHING;
229:CREATE OR REPLACE RULE audit_events_no_delete AS
230:    ON DELETE TO audit.events DO INSTEAD NOTHING;
231:
232:COMMIT;

 succeeded in 1148ms:
1:/**
2: * Tenant context.
3: *
4: * The single most important rule in the platform (`autoworkshop 1.txt` §9):
5: *
6: *   "The gateway must never trust a tenant identifier supplied only by the
7: *    client. Tenant context shall be derived from the validated identity and
8: *    membership claims."
9: *
10: * Every request resolves EXACTLY ONE active tenant context, server-side, from
11: * a validated Keycloak token plus a membership lookup. There is deliberately
12: * no constructor path that accepts a client-supplied tenant id.
13: */
14:export interface TenantContext {
15:  readonly tenantId: string;
16:  readonly organizationId: string;
17:  readonly branchId: string | null;
18:  readonly userId: string;
19:  /** The ONE active role for this request, not the user's full role set. */
20:  readonly activeRole: string;
21:  readonly correlationId: string;
22:}
23:
24:/** Raised when a request cannot resolve exactly one tenant context. */
25:export class TenantResolutionError extends Error {
26:  constructor(reason: string) {
27:    super(`tenant context could not be resolved: ${reason}`);
28:    this.name = 'TenantResolutionError';
29:  }
30:}
31:
32:/**
33: * A validated membership record, as loaded from the database after the token
34: * signature and claims have been verified.
35: */
36:export interface ValidatedMembership {
37:  tenantId: string;
38:  organizationId: string;
39:  branchId: string | null;
40:  roleName: string;
41:  status: 'active' | 'suspended' | 'revoked';
42:}
43:
44:/**
45: * Resolve the active tenant context.
46: *
47: * `requestedOrganizationId` may come from the client (the org switcher), but it
48: * is only ever used to SELECT among memberships the server already proved the
49: * user holds. It can never introduce a tenant the user has no membership in —
50: * which is the confused-deputy attack this design exists to prevent.
51: */
52:export function resolveTenantContext(params: {
53:  userId: string;
54:  memberships: readonly ValidatedMembership[];
55:  requestedOrganizationId?: string;
56:  correlationId: string;
57:}): TenantContext {
58:  const { userId, memberships, requestedOrganizationId, correlationId } = params;
59:
60:  const active = memberships.filter((m) => m.status === 'active');
61:  if (active.length === 0) {
62:    throw new TenantResolutionError('user holds no active membership');
63:  }
64:
65:  let selected: ValidatedMembership | undefined;
66:
67:  if (requestedOrganizationId) {
68:    selected = active.find((m) => m.organizationId === requestedOrganizationId);
69:    if (!selected) {
70:      // The user asked for an organization they are not a member of. This is
71:      // refused, not silently downgraded to a default — a silent fallback would
72:      // hide an authorization probe.
73:      throw new TenantResolutionError(
74:        'requested organization is not among the user active memberships',
75:      );
76:    }
77:  } else if (active.length === 1) {
78:    selected = active[0];
79:  } else {
80:    throw new TenantResolutionError(
81:      'user holds multiple memberships and no organization was selected',
82:    );
83:  }
84:
85:  // Narrowed explicitly rather than with a non-null assertion: `!` would
86:  // silence the compiler without proving anything, and this is the function
87:  // that decides which tenant's data a request may touch.
88:  if (!selected) {
89:    throw new TenantResolutionError('no membership selected');
90:  }
91:
92:  return {
93:    tenantId: selected.tenantId,
94:    organizationId: selected.organizationId,
95:    branchId: selected.branchId,
96:    userId,
97:    activeRole: selected.roleName,
98:    correlationId,
99:  };
100:}
101:
102:/** A parameterised statement: SQL text plus bound values. */
103:export interface BoundStatement {
104:  readonly text: string;
105:  /** Mutable by design — `pg` accepts `any[]`, not a readonly array. */
106:  readonly values: string[];
107:}
108:
109:/**
110: * The statements that bind the resolved context to the database transaction,
111: * so PostgreSQL RLS becomes the final backstop.
112: *
113: * Two deliberate choices:
114: *
115: * 1. `set_config(..., true)` rather than `SET LOCAL app.current_role = '...'`.
116: *    `current_role` is a RESERVED KEYWORD in PostgreSQL and the SET LOCAL form
117: *    is a syntax error — verified against a live database, which rejected it
118: *    with: syntax error at or near "current_role".
119: *
120: * 2. Values are BOUND, never interpolated. Even though these values originate
121: *    from validated membership rows rather than user input, building SQL by
122: *    string concatenation is how injection defects are introduced later, when
123: *    someone adds a field whose provenance is less certain. Binding removes the
124: *    question entirely.
125: *
126: * The `true` third argument makes each setting transaction-local, so a pooled
127: * connection cannot carry one tenant's context into the next request.
128: */
129:export function tenantSessionStatements(ctx: TenantContext): BoundStatement[] {
130:  const set = (key: string, value: string): BoundStatement => ({
131:    text: 'SELECT set_config($1, $2, true)',
132:    values: [key, value],
133:  });
134:
135:  return [
136:    set('app.tenant_id', ctx.tenantId),
137:    set('app.user_id', ctx.userId),
138:    set('app.current_role', ctx.activeRole),
139:    set('app.organization_ids', ctx.organizationId),
140:    set('app.branch_ids', ctx.branchId ?? ''),
141:  ];
142:}

 succeeded in 1184ms:
1:import {
2:  CanActivate,
3:  ExecutionContext,
4:  Injectable,
5:  UnauthorizedException,
6:} from '@nestjs/common';
7:import { randomUUID } from 'node:crypto';
8:import type { Request } from 'express';
9:import { MembershipRepository } from '../identity/membership.repository';
10:import {
11:  resolveTenantContext,
12:  TenantResolutionError,
13:  type TenantContext,
14:} from '../tenancy/tenant-context';
15:import { KeycloakJwtService } from './keycloak-jwt.service';
16:
17:export interface AuthenticatedRequest extends Request {
18:  tenantContext: TenantContext;
19:}
20:
21:/**
22: * The single gate between an HTTP request and tenant data.
23: *
24: * Order matters and is deliberate:
25: *
26: *   1. verify the token signature, issuer, audience, expiry and algorithm
27: *   2. look up memberships by the token SUBJECT
28: *   3. resolve exactly one active tenant context from those memberships
29: *
30: * Step 3 never reads a tenant id from the request. The client may name an
31: * ORGANIZATION it wants to act in (the workspace switcher), and that value is
32: * used only to select among memberships the server has already proved the user
33: * holds. Naming an organization the user is not a member of is refused, not
34: * silently downgraded to a default — a silent fallback would mask an
35: * authorization probe (`1.txt` §9).
36: */
37:@Injectable()
38:export class TenantGuard implements CanActivate {
39:  constructor(
40:    private readonly jwtService: KeycloakJwtService,
41:    private readonly memberships: MembershipRepository,
42:  ) {}
43:
44:  async canActivate(context: ExecutionContext): Promise<boolean> {
45:    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
46:
47:    const header = req.headers.authorization;
48:    if (!header?.startsWith('Bearer ')) {
49:      throw new UnauthorizedException('missing bearer token');
50:    }
51:
52:    const verified = await this.jwtService.verify(header.slice(7));
53:
54:    const record = await this.memberships.findByKeycloakSubject(verified.subject);
55:    if (!record) {
56:      // A valid Keycloak token whose subject has no application user. Refused:
57:      // authentication is not authorization.
58:      throw new UnauthorizedException('no application user for this identity');
59:    }
60:
61:    // Correlation id ties the HTTP request, the database transaction and the
62:    // audit row together (`1.txt` §28).
63:    const correlationId =
64:      (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID();
65:
66:    const requestedOrganizationId =
67:      (req.headers['x-organization-id'] as string | undefined) ?? undefined;
68:
69:    try {
70:      req.tenantContext = resolveTenantContext({
71:        userId: record.userId,
72:        memberships: record.memberships,
73:        requestedOrganizationId,
74:        correlationId,
75:      });
76:    } catch (err) {
77:      if (err instanceof TenantResolutionError) {
78:        throw new UnauthorizedException(err.message);
79:      }
80:      throw err;
81:    }
82:
83:    return true;
84:  }
85:}

codex
The migration confirms one candidate: `audit.events` stores tenant data and detailed request context but has no RLS at all. I’m checking whether application grants make that exploitable, and whether service-level filters are compensating anywhere.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "." apps/api/src/audit/audit.service.ts' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "." infrastructure/migrations/002_application_role.sql' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "." apps/api/src/identity/branch.service.ts' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "." apps/api/src/identity/membership.service.ts' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "." apps/api/src/identity/organization.service.ts' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 901ms:
1:import {
2:  BadRequestException,
3:  ForbiddenException,
4:  Injectable,
5:  NotFoundException,
6:} from '@nestjs/common';
7:import { AuditService } from '../audit/audit.service';
8:import { DatabaseService } from '../database/database.service';
9:import type { TenantContext } from '../tenancy/tenant-context';
11:export interface Membership {
12:  id: string;
13:  organizationId: string;
14:  branchId: string | null;
15:  userId: string;
16:  roleName: string;
17:  status: 'active' | 'suspended' | 'revoked';
18:  createdAt: string;
19:}
21:/**
22: * Roles permitted to grant or withdraw a membership.
23: *
24: * Deliberately the narrowest list in the identity module. A membership IS the
25: * authority — PLAN_EXTENSION_v1 §2.1: "Authority derives from membership and
26: * role, never from the account type claim itself." Whoever can mint one can
27: * mint access, so this is the privilege-escalation surface of the whole
28: * platform and it is not shared with operational roles.
29: *
30: * `07.txt` part 2 §3 assigns roles and approval limits at INVITATION time, and
31: * §50 gives only the owner "full workshop governance, staff ... access". The
32: * manager, who has "daily operational control", is excluded on purpose.
33: */
34:const CAN_GRANT_MEMBERSHIP = new Set([
35:  'platform_administrator',
36:  'workshop_owner',
37:  'supplier_owner',
38:  'fleet_administrator',
39:]);
41:/**
42: * Roles a membership may confer.
43: *
44: * An allow-list, not free text. `role_name` is a plain `TEXT` column with no
45: * database CHECK, so without this the grant endpoint would accept any string —
46: * including one that a future authorization rule happens to treat as
47: * privileged. An unconstrained role name is a privilege-escalation hole that
48: * types cannot catch.
49: *
50: * The eight workshop roles are `07.txt` part 2 §50 verbatim.
51: */
52:const GRANTABLE_ROLES = new Set([
53:  // 07 pt2 §50 — workshop
54:  'workshop_owner',
55:  'workshop_manager',
56:  'reception_staff',
57:  'workshop_supervisor',
58:  'technician',
59:  'storekeeper',
60:  'quality_control_inspector',
61:  'cashier',
62:  // other workspaces
63:  'supplier_owner',
64:  'fleet_administrator',
65:  'insurance_assessor',
66:  'towing_operator',
67:  'customer',
68:]);
70:/**
71: * Membership domain service — T-0003.
72: *
73: * `identity.memberships` is tenant-scoped and under `ENABLE` + `FORCE ROW LEVEL
74: * SECURITY`, so cross-tenant reads fail closed at the database. The rules that
75: * RLS cannot express — who may grant, which roles exist, and that nobody may
76: * quietly widen their own access — live here.
77: */
78:@Injectable()
79:export class MembershipService {
80:  constructor(
81:    private readonly db: DatabaseService,
82:    private readonly audit: AuditService,
83:  ) {}
85:  async list(ctx: TenantContext, filter: { userId?: string; organizationId?: string } = {}) {
86:    return this.db.withTenant(ctx, async (client) => {
87:      const where: string[] = [];
88:      const values: unknown[] = [];
89:      if (filter.userId) {
90:        values.push(filter.userId);
91:        where.push(`user_id = $${values.length}`);
92:      }
93:      if (filter.organizationId) {
94:        values.push(filter.organizationId);
95:        where.push(`organization_id = $${values.length}`);
96:      }
97:      const res = await client.query(
98:        `SELECT id, organization_id, branch_id, user_id, role_name, status, created_at
99:           FROM identity.memberships
100:          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
101:          ORDER BY created_at`,
102:        values,
103:      );
104:      return res.rows.map(this.toDomain);
105:    });
106:  }
108:  /**
109:   * Grant a membership — the platform's privilege-granting operation.
110:   *
111:   * `07.txt` part 2 §3 (staff invitation): role and approval limits are set at
112:   * invitation. §50's closing rule governs the result: "No user shall receive
113:   * functions outside the user's approved role and branch."
114:   */
115:  async grant(
116:    ctx: TenantContext,
117:    input: {
118:      userId: string;
119:      organizationId: string;
120:      branchId?: string | null;
121:      roleName: string;
122:    },
123:  ): Promise<Membership> {
124:    if (!CAN_GRANT_MEMBERSHIP.has(ctx.activeRole)) {
125:      throw new ForbiddenException(
126:        `role '${ctx.activeRole}' may not grant a membership`,
127:      );
128:    }
129:    if (!GRANTABLE_ROLES.has(input.roleName)) {
130:      // Names the constraint, not the valid set: enumerating grantable roles in
131:      // an error message hands a caller the platform's authorization taxonomy,
132:      // which is the disclosure the catch-all route was already fixed to avoid.
133:      throw new BadRequestException('unknown role');
134:    }
136:    return this.db.withTenant(ctx, async (client) => {
137:      // The organization must belong to the ACTIVE TENANT, and the branch (if
138:      // given) must belong to that organization. Nothing else in the stack
139:      // checks either of these.
140:      //
141:      // The foreign keys reference `identity.organizations(id)` and
142:      // `identity.branches(id)` by id alone — a foreign key cannot carry a
143:      // tenant predicate — and RLS `WITH CHECK` validates the `tenant_id` of
144:      // the row being INSERTED, not the tenant of the rows it points at. So
145:      // `tenant_id = <A>` with `organization_id = <an org in tenant B>`
146:      // satisfies the FK and the policy at once. On the platform's
147:      // privilege-GRANTING operation, that is a membership filed under one
148:      // tenant and pointing into another's organization.
149:      //
150:      // Both lookups work because those tables are under FORCE RLS: a row in
151:      // another tenant is simply invisible here and returns nothing.
152:      const org = await client.query(
153:        `SELECT 1 FROM identity.organizations WHERE id = $1`,
154:        [input.organizationId],
155:      );
156:      if (org.rows.length === 0) throw new NotFoundException('organization not found');
158:      if (input.branchId) {
159:        // Also asserts the branch belongs to THIS organization — a branch from
160:        // a sibling organization in the same tenant would pass a bare
161:        // existence check while scoping the membership to the wrong site,
162:        // which §50's "approved role and branch" rule forbids.
163:        const branch = await client.query(
164:          `SELECT 1 FROM identity.branches WHERE id = $1 AND organization_id = $2`,
165:          [input.branchId, input.organizationId],
166:        );
167:        if (branch.rows.length === 0) throw new NotFoundException('branch not found');
168:      }
170:      const res = await client.query(
171:        `INSERT INTO identity.memberships
172:           (tenant_id, organization_id, branch_id, user_id, role_name, created_by)
173:         VALUES ($1, $2, $3, $4, $5, $6)
174:         ON CONFLICT (organization_id, user_id, role_name) DO NOTHING
175:         RETURNING id, organization_id, branch_id, user_id, role_name, status, created_at`,
176:        [
177:          // From the resolved context, never the request body. RLS `WITH CHECK`
178:          // would reject a mismatch anyway — both layers, by design.
179:          ctx.tenantId,
180:          input.organizationId,
181:          input.branchId ?? null,
182:          input.userId,
183:          input.roleName,
184:          ctx.userId,
185:        ],
186:      );
188:      const row = res.rows[0];
189:      if (!row) {
190:        // The unique constraint fired: this exact grant already exists. Report
191:        // it as a conflict rather than silently returning success, so an
192:        // "invitation" that changed nothing cannot read as one that did.
193:        throw new BadRequestException('membership already exists');
194:      }
196:      await this.audit.write(client, ctx, {
197:        action: 'membership.granted',
198:        resourceType: 'membership',
199:        resourceId: row.id,
200:        detail: {
201:          userId: input.userId,
202:          organizationId: input.organizationId,
203:          branchId: input.branchId ?? null,
204:          roleName: input.roleName,
205:        },
206:      });
208:      return this.toDomain(row);
209:    });
210:  }
212:  /**
213:   * Suspend or revoke a membership — withdrawing access.
214:   *
215:   * Status only ever moves toward LESS access. Re-granting is a new grant, with
216:   * its own audit row, rather than a status flip: the audit trail for approvals
217:   * and access is append-only per CLAUDE.md, and a reversible toggle would make
218:   * "was this person ever revoked?" unanswerable.
219:   */
220:  async withdraw(
221:    ctx: TenantContext,
222:    id: string,
223:    status: 'suspended' | 'revoked',
224:  ): Promise<Membership> {
225:    if (!CAN_GRANT_MEMBERSHIP.has(ctx.activeRole)) {
226:      throw new ForbiddenException(
227:        `role '${ctx.activeRole}' may not withdraw a membership`,
228:      );
229:    }
231:    // Validate the target status AT RUNTIME. The parameter's union type is
232:    // erased at compile time, and the controller passes the request body
233:    // straight through, so `{ "status": "active" }` reached this method as a
234:    // string the database's CHECK constraint happily accepts — turning a
235:    // withdrawal into a silent no-op that still wrote an audit row reading
236:    // `membership.active`, an action this service never performs. Any other
237:    // string produced a constraint violation and a 500 where a 400 was owed.
238:    //
239:    // The check belongs HERE and not only in the controller because an MCP tool
240:    // calls this service directly, without passing through any controller. A
241:    // rule enforced only at the HTTP edge is not enforced for agents — which is
242:    // the whole premise of the AI boundary (`0.txt` §13, §26).
243:    if (status !== 'suspended' && status !== 'revoked') {
244:      throw new BadRequestException('status must be suspended or revoked');
245:    }
247:    return this.db.withTenant(ctx, async (client) => {
248:      const res = await client.query(
249:        `UPDATE identity.memberships
250:            SET status = $2, updated_at = now(), updated_by = $3
251:          WHERE id = $1
252:            AND status = 'active'
253:        RETURNING id, organization_id, branch_id, user_id, role_name, status, created_at`,
254:        [id, status, ctx.userId],
255:      );
256:      const row = res.rows[0];
257:      if (!row) {
258:        // Either it is not in this tenant (RLS hid it) or it was not active.
259:        // One message for both, so the response cannot be used to probe which.
260:        throw new NotFoundException('active membership not found');
261:      }
263:      await this.audit.write(client, ctx, {
264:        action: `membership.${status}`,
265:        resourceType: 'membership',
266:        resourceId: row.id,
267:        detail: { userId: row.user_id, roleName: row.role_name },
268:      });
270:      return this.toDomain(row);
271:    });
272:  }
274:  private toDomain = (row: {
275:    id: string;
276:    organization_id: string;
277:    branch_id: string | null;
278:    user_id: string;
279:    role_name: string;
280:    status: Membership['status'];
281:    created_at: Date;
282:  }): Membership => ({
283:    id: row.id,
284:    organizationId: row.organization_id,
285:    branchId: row.branch_id,
286:    userId: row.user_id,
287:    roleName: row.role_name,
288:    status: row.status,
289:    createdAt: row.created_at.toISOString(),
290:  });
291:}

 succeeded in 997ms:
1:import { Injectable } from '@nestjs/common';
2:import type { PoolClient } from 'pg';
3:import type { TenantContext } from '../tenancy/tenant-context';
4:
5:export interface AuditEvent {
6:  action: string;
7:  resourceType?: string;
8:  resourceId?: string;
9:  actorKind?: 'user' | 'agent' | 'system';
10:  agentId?: string;
11:  approvalStatus?: string;
12:  result?: 'success' | 'denied' | 'error';
13:  detail?: Record<string, unknown>;
14:}
15:
16:/**
17: * Audit trail.
18: *
19: * `audit.events` is append-only, enforced in the database by DO INSTEAD NOTHING
20: * rules on UPDATE and DELETE, and reinforced by withholding those grants from
21: * the application role. An audit trail that can be edited is not an audit trail.
22: *
23: * `write` takes the SAME transaction client as the work it records, so the
24: * business change and its audit row commit or roll back together. An audit
25: * written on a separate connection could survive a rolled-back change and
26: * describe something that never happened.
27: */
28:@Injectable()
29:export class AuditService {
30:  async write(
31:    client: PoolClient,
32:    ctx: TenantContext,
33:    event: AuditEvent,
34:  ): Promise<void> {
35:    await client.query(
36:      `INSERT INTO audit.events
37:         (tenant_id, organization_id, actor_user_id, actor_agent_id, actor_kind,
38:          action, resource_type, resource_id, correlation_id, approval_status,
39:          result, detail)
40:       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
41:      [
42:        ctx.tenantId,
43:        ctx.organizationId,
44:        ctx.userId,
45:        event.agentId ?? null,
46:        event.actorKind ?? 'user',
47:        event.action,
48:        event.resourceType ?? null,
49:        event.resourceId ?? null,
50:        ctx.correlationId,
51:        event.approvalStatus ?? null,
52:        event.result ?? 'success',
53:        JSON.stringify(event.detail ?? {}),
54:      ],
55:    );
56:  }
57:}

 succeeded in 933ms:
1:import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
2:import { AuditService } from '../audit/audit.service';
3:import { DatabaseService } from '../database/database.service';
4:import type { TenantContext } from '../tenancy/tenant-context';
6:export interface Branch {
7:  id: string;
8:  organizationId: string;
9:  name: string;
10:  location: string | null;
11:  operatingHours: string | null;
12:  status: string;
13:  createdAt: string;
14:}
16:/**
17: * Roles permitted to create a branch.
18: *
19: * `07.txt` part 2 §46 puts Branches under the Workshop Owner's WORKSHOP
20: * MANAGEMENT group, and §50 gives the owner "full workshop governance". A
21: * manager has "daily operational control", which is not the same as creating
22: * legal operating locations, so the manager is deliberately absent.
23: */
24:const CAN_CREATE_BRANCH = new Set([
25:  'platform_administrator',
26:  'workshop_owner',
27:  'supplier_owner',
28:  'fleet_administrator',
29:]);
31:/**
32: * Branch domain service — T-0003.
33: *
34: * Follows `OrganizationService` exactly, for the same reason: a REST controller
35: * and an MCP tool are both thin callers of this one service, so the identical
36: * rules apply whether the caller is a human or an agent (`0.txt` §13, §26).
37: *
38: * `identity.branches` carries `tenant_id` and is under `ENABLE` + `FORCE ROW
39: * LEVEL SECURITY`, so the database is the final backstop. Queries here are
40: * deliberately written WITHOUT a hand-added tenant filter, exactly as
41: * `OrganizationService` does — the isolation proof in
42: * `tests/tenant-isolation/` depends on those queries being bare, because a
43: * query that filters in application code proves nothing about the policy.
44: */
45:@Injectable()
46:export class BranchService {
47:  constructor(
48:    private readonly db: DatabaseService,
49:    private readonly audit: AuditService,
50:  ) {}
52:  /** Branches in the active tenant, optionally narrowed to one organization. */
53:  async list(ctx: TenantContext, organizationId?: string): Promise<Branch[]> {
54:    return this.db.withTenant(ctx, async (client) => {
55:      const res = organizationId
56:        ? await client.query(
57:            `SELECT id, organization_id, name, location, operating_hours, status, created_at
58:               FROM identity.branches
59:              WHERE organization_id = $1
60:              ORDER BY name`,
61:            [organizationId],
62:          )
63:        : await client.query(
64:            `SELECT id, organization_id, name, location, operating_hours, status, created_at
65:               FROM identity.branches
66:              ORDER BY name`,
67:          );
68:      return res.rows.map(this.toDomain);
69:    });
70:  }
72:  async findById(ctx: TenantContext, id: string): Promise<Branch> {
73:    return this.db.withTenant(ctx, async (client) => {
74:      const res = await client.query(
75:        `SELECT id, organization_id, name, location, operating_hours, status, created_at
76:           FROM identity.branches WHERE id = $1`,
77:        [id],
78:      );
79:      const row = res.rows[0];
80:      if (!row) {
81:        // 404 and not 403, deliberately: a branch in another tenant is
82:        // invisible under RLS, and answering 403 would confirm the id exists,
83:        // turning the status code into a cross-tenant existence oracle.
84:        throw new NotFoundException('branch not found');
85:      }
86:      return this.toDomain(row);
87:    });
88:  }
90:  async create(
91:    ctx: TenantContext,
92:    input: {
93:      organizationId: string;
94:      name: string;
95:      location?: string;
96:      operatingHours?: string;
97:    },
98:  ): Promise<Branch> {
99:    if (!CAN_CREATE_BRANCH.has(ctx.activeRole)) {
100:      throw new ForbiddenException(`role '${ctx.activeRole}' may not create a branch`);
101:    }
103:    return this.db.withTenant(ctx, async (client) => {
104:      // The parent organization must belong to the ACTIVE TENANT, and nothing
105:      // else in the stack checks that.
106:      //
107:      // The foreign key references `identity.organizations(id)` alone — a
108:      // foreign key cannot carry a tenant predicate. RLS `WITH CHECK` validates
109:      // the `tenant_id` of the row being INSERTED, not the tenant of the row it
110:      // points at. So `tenant_id = <A>` with `organization_id = <an org in
111:      // tenant B>` satisfies the FK and the policy simultaneously, and creates
112:      // a branch filed under tenant A that belongs to someone else's
113:      // organization.
114:      //
115:      // The lookup below closes it precisely because `identity.organizations`
116:      // IS under FORCE RLS: an organization in another tenant is invisible
117:      // here, so it returns no row. The check is the join, not a comparison we
118:      // could get wrong.
119:      const parent = await client.query(
120:        `SELECT 1 FROM identity.organizations WHERE id = $1`,
121:        [input.organizationId],
122:      );
123:      if (parent.rows.length === 0) {
124:        // 404, not 403 — same non-oracle reasoning as findById.
125:        throw new NotFoundException('organization not found');
126:      }
128:      // `tenant_id` comes from the RESOLVED context, never from the caller's
129:      // body. The RLS `WITH CHECK` clause would reject a mismatched value
130:      // anyway, which is the point of having both layers.
131:      const res = await client.query(
132:        `INSERT INTO identity.branches
133:           (tenant_id, organization_id, name, location, operating_hours, created_by)
134:         VALUES ($1, $2, $3, $4, $5, $6)
135:         RETURNING id, organization_id, name, location, operating_hours, status, created_at`,
136:        [
137:          ctx.tenantId,
138:          input.organizationId,
139:          input.name,
140:          input.location ?? null,
141:          input.operatingHours ?? null,
142:          ctx.userId,
143:        ],
144:      );
145:      const row = res.rows[0];
147:      // Same transaction as the insert: the change and its audit row commit or
148:      // roll back together.
149:      await this.audit.write(client, ctx, {
150:        action: 'branch.created',
151:        resourceType: 'branch',
152:        resourceId: row.id,
153:        detail: { name: input.name, organizationId: input.organizationId },
154:      });
156:      return this.toDomain(row);
157:    });
158:  }
160:  private toDomain = (row: {
161:    id: string;
162:    organization_id: string;
163:    name: string;
164:    location: string | null;
165:    operating_hours: string | null;
166:    status: string;
167:    created_at: Date;
168:  }): Branch => ({
169:    id: row.id,
170:    organizationId: row.organization_id,
171:    name: row.name,
172:    location: row.location,
173:    operatingHours: row.operating_hours,
174:    status: row.status,
175:    createdAt: row.created_at.toISOString(),
176:  });
177:}

 succeeded in 1026ms:
1:-- ============================================================================
2:-- Migration 002 — the non-superuser application role
3:--
4:-- WHY THIS EXISTS
5:--
6:-- Migration 001 enabled ENABLE + FORCE ROW LEVEL SECURITY on every tenant-owned
7:-- table. That is necessary but NOT sufficient: **a superuser bypasses RLS
8:-- entirely, even with FORCE**. The bootstrap role created by POSTGRES_USER is a
9:-- superuser, so an application connecting as that role would have row-level
10:-- security silently switched off — every policy present, none of them applied.
11:--
12:-- This was caught by running tests/tenant-isolation/rls_proof.sql against a
13:-- live database: tenant A could see 2 organizations when it should have seen 1.
14:-- The policies were correct; the connecting role was wrong.
15:--
16:-- RULE: the application connects as `autoworkshop_app`, NEVER as the bootstrap
17:-- superuser. The isolation proof runs as `autoworkshop_app` for the same
18:-- reason — a proof run as a superuser proves nothing.
19:-- ============================================================================
20:
21:BEGIN;
22:
23:DO $$
24:BEGIN
25:    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'autoworkshop_app') THEN
26:        -- NOSUPERUSER / NOBYPASSRLS are the entire point of this role.
27:        CREATE ROLE autoworkshop_app
28:            LOGIN
29:            NOSUPERUSER
30:            NOCREATEDB
31:            NOCREATEROLE
32:            NOBYPASSRLS
33:            PASSWORD 'change_me_locally';
34:    ELSE
35:        -- Enforce the properties even if the role predates this migration.
36:        ALTER ROLE autoworkshop_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
37:    END IF;
38:END $$;
39:
40:GRANT CONNECT ON DATABASE autoworkshop TO autoworkshop_app;
41:
42:GRANT USAGE ON SCHEMA identity TO autoworkshop_app;
43:GRANT USAGE ON SCHEMA audit    TO autoworkshop_app;
44:GRANT USAGE ON SCHEMA public   TO autoworkshop_app;
45:
46:-- Least privilege: DML only. No DDL — schema change belongs to migrations,
47:-- which run as the owner, not to the running application.
48:GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA identity TO autoworkshop_app;
49:GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA identity TO autoworkshop_app;
50:
51:-- audit.events is append-only: INSERT and SELECT only. The DO INSTEAD NOTHING
52:-- rules from 001 are belt; withholding UPDATE/DELETE here is braces.
53:GRANT SELECT, INSERT ON audit.events TO autoworkshop_app;
54:GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA audit TO autoworkshop_app;
55:
56:GRANT SELECT ON public.schema_migrations TO autoworkshop_app;
57:
58:-- Future tables in these schemas inherit the same grants, so a later migration
59:-- cannot accidentally create a table the application cannot reach — or one it
60:-- can reach with more privilege than intended.
61:ALTER DEFAULT PRIVILEGES IN SCHEMA identity
62:    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO autoworkshop_app;
63:ALTER DEFAULT PRIVILEGES IN SCHEMA identity
64:    GRANT USAGE, SELECT ON SEQUENCES TO autoworkshop_app;
65:ALTER DEFAULT PRIVILEGES IN SCHEMA audit
66:    GRANT SELECT, INSERT ON TABLES TO autoworkshop_app;
67:ALTER DEFAULT PRIVILEGES IN SCHEMA audit
68:    GRANT USAGE, SELECT ON SEQUENCES TO autoworkshop_app;
69:
70:COMMIT;

 succeeded in 1046ms:
1:import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
2:import { AuditService } from '../audit/audit.service';
3:import { DatabaseService } from '../database/database.service';
4:import type { TenantContext } from '../tenancy/tenant-context';
5:
6:export interface Organization {
7:  id: string;
8:  name: string;
9:  orgType: string;
10:  status: string;
11:  createdAt: string;
12:}
13:
14:/** Roles permitted to create an organization. */
15:const CAN_CREATE_ORG = new Set(['platform_administrator', 'workshop_owner', 'supplier_owner', 'fleet_administrator']);
16:
17:/**
18: * Organization domain service.
19: *
20: * Authoritative business rules live HERE, not in the controller and not in an
21: * MCP tool. A REST controller and an MCP tool are both thin callers of this
22: * same service, so the identical rules apply whether the caller is a human or
23: * an AI agent (`0.txt` §13, §26).
24: */
25:@Injectable()
26:export class OrganizationService {
27:  constructor(
28:    private readonly db: DatabaseService,
29:    private readonly audit: AuditService,
30:  ) {}
31:
32:  async list(ctx: TenantContext): Promise<Organization[]> {
33:    return this.db.withTenant(ctx, async (client) => {
34:      // No explicit tenant filter is written here — RLS applies it. The
35:      // application filter is still enforced at the repository layer for
36:      // defence in depth; this query is deliberately left bare to prove the
37:      // database backstop works (see tests/tenant-isolation/rls_proof.sql).
38:      const res = await client.query(
39:        `SELECT id, name, org_type, status, created_at
40:           FROM identity.organizations
41:          ORDER BY name`,
42:      );
43:      return res.rows.map(this.toDomain);
44:    });
45:  }
46:
47:  async findById(ctx: TenantContext, id: string): Promise<Organization> {
48:    return this.db.withTenant(ctx, async (client) => {
49:      const res = await client.query(
50:        `SELECT id, name, org_type, status, created_at
51:           FROM identity.organizations WHERE id = $1`,
52:        [id],
53:      );
54:      const row = res.rows[0];
55:      if (!row) {
56:        // A row in another tenant is invisible under RLS, so this is a 404 and
57:        // not a 403 — deliberately. Returning 403 would confirm the id exists,
58:        // turning the error code into a cross-tenant existence oracle.
59:        throw new NotFoundException('organization not found');
60:      }
61:      return this.toDomain(row);
62:    });
63:  }
64:
65:  async create(
66:    ctx: TenantContext,
67:    input: { name: string; orgType: string },
68:  ): Promise<Organization> {
69:    if (!CAN_CREATE_ORG.has(ctx.activeRole)) {
70:      throw new ForbiddenException(
71:        `role '${ctx.activeRole}' may not create an organization`,
72:      );
73:    }
74:
75:    return this.db.withTenant(ctx, async (client) => {
76:      const res = await client.query(
77:        `INSERT INTO identity.organizations (tenant_id, name, org_type, created_by)
78:         VALUES ($1, $2, $3, $4)
79:         RETURNING id, name, org_type, status, created_at`,
80:        [ctx.tenantId, input.name, input.orgType, ctx.userId],
81:      );
82:      const row = res.rows[0];
83:
84:      // Same transaction as the insert: the change and its audit row commit or
85:      // roll back together.
86:      await this.audit.write(client, ctx, {
87:        action: 'organization.created',
88:        resourceType: 'organization',
89:        resourceId: row.id,
90:        detail: { name: input.name, orgType: input.orgType },
91:      });
92:
93:      return this.toDomain(row);
94:    });
95:  }
96:
97:  private toDomain = (row: {
98:    id: string;
99:    name: string;
100:    org_type: string;
101:    status: string;
102:    created_at: Date;
103:  }): Organization => ({
104:    id: row.id,
105:    name: row.name,
106:    orgType: row.org_type,
107:    status: row.status,
108:    createdAt: row.created_at.toISOString(),
109:  });
110:}

codex
The app role is granted `SELECT` on audit rows, so missing audit RLS is not just theoretical. I’m also checking for the stricter requirement you called out: application queries against tenant-owned tables should carry `tenant_id`, not rely solely on RLS.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "." apps/api/src/identity/identity.controllers.ts' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "." apps/api/src/identity/organization.controller.ts' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "." apps/api/src/identity/membership.repository.ts' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "." apps/api/src/identity/me.service.ts' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "." apps/api/src/identity/user.service.ts' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 1114ms:
1:import { Injectable } from '@nestjs/common';
2:import { DatabaseService } from '../database/database.service';
3:import { permissionsForRole } from '../authz/permission-matrix';
4:import type { TenantContext } from '../tenancy/tenant-context';
6:export interface ViewerMembership {
7:  organizationId: string;
8:  organizationName: string;
9:  branchId: string | null;
10:  branchName: string | null;
11:  roleName: string;
12:}
14:export interface Viewer {
15:  userId: string;
16:  displayName: string;
17:  email: string;
18:  tenantId: string;
19:  organizationId: string;
20:  branchId: string | null;
21:  /** The ONE role active for this request, not the user's full role set. */
22:  activeRole: string;
23:  /** What that role may see. Derived server-side; never sent by the client. */
24:  permissions: readonly string[];
25:  /** Everything the org/branch switchers may offer (T-0016). */
26:  memberships: ViewerMembership[];
27:}
29:/**
30: * The viewer contract — T-0005.
31: *
32: * This is the endpoint that ends `viewerGrants()`/`viewerRole()` being demo
33: * data. Both currently return hardcoded arrays in the browser bundle; once the
34: * Next apps hold a Keycloak session they call this instead, and every value
35: * below is derived server-side from a validated token plus membership records.
36: *
37: * WHY PERMISSIONS ARE COMPUTED HERE AND NOT SENT BY THE CLIENT. `1.txt` §9:
38: * the gateway must never trust an identifier supplied only by the client. The
39: * role arrives from `TenantContext`, which `TenantGuard` resolved from the
40: * token subject and the membership table — there is no request field that can
41: * influence it. The permission list is then a pure function of that role.
42: *
43: * The response is a VIEW, not an authorization decision. A client that ignores
44: * it and requests a gated route still meets the API's own role checks and RLS,
45: * which deny independently (CLAUDE.md §8).
46: */
47:@Injectable()
48:export class MeService {
49:  constructor(private readonly db: DatabaseService) {}
51:  async describe(ctx: TenantContext): Promise<Viewer> {
52:    return this.db.withTenant(ctx, async (client) => {
53:      // The profile, reached THROUGH memberships rather than from
54:      // `identity.users` directly — that table has no RLS, so a bare select
55:      // would cross tenants. Same rule as `UserService`; see its header.
56:      const profile = await client.query(
57:        `SELECT u.id, u.display_name, u.email
58:           FROM identity.memberships m
59:           JOIN identity.users u ON u.id = m.user_id
60:          WHERE u.id = $1
61:          LIMIT 1`,
62:        [ctx.userId],
63:      );
65:      // Memberships visible in the ACTIVE tenant, with the names the switchers
66:      // need. RLS scopes this to the current tenant; a user's memberships in
67:      // other tenants are deliberately not listed here, because switching
68:      // tenant is a re-authentication concern, not a dropdown.
69:      const memberships = await client.query(
70:        `SELECT m.organization_id,
71:                o.name        AS organization_name,
72:                m.branch_id,
73:                b.name        AS branch_name,
74:                m.role_name
75:           FROM identity.memberships m
76:           JOIN identity.organizations o ON o.id = m.organization_id
77:      LEFT JOIN identity.branches b      ON b.id = m.branch_id
78:          WHERE m.user_id = $1
79:            AND m.status = 'active'
80:          ORDER BY o.name, b.name NULLS FIRST`,
81:        [ctx.userId],
82:      );
84:      const row = profile.rows[0];
86:      return {
87:        userId: ctx.userId,
88:        // A viewer with a context but no readable profile row is a data fault,
89:        // not an auth fault: the guard already proved the identity. Degrade to
90:        // an honest placeholder rather than 500-ing the whole shell, which
91:        // would take out every page including the ones that need no profile.
92:        displayName: row?.display_name ?? 'Unknown user',
93:        email: row?.email ?? '',
94:        tenantId: ctx.tenantId,
95:        organizationId: ctx.organizationId,
96:        branchId: ctx.branchId,
97:        activeRole: ctx.activeRole,
98:        permissions: permissionsForRole(ctx.activeRole),
99:        memberships: memberships.rows.map((m: {
100:          organization_id: string;
101:          organization_name: string;
102:          branch_id: string | null;
103:          branch_name: string | null;
104:          role_name: string;
105:        }) => ({
106:          organizationId: m.organization_id,
107:          organizationName: m.organization_name,
108:          branchId: m.branch_id,
109:          branchName: m.branch_name,
110:          roleName: m.role_name,
111:        })),
112:      };
113:    });
114:  }
115:}

 succeeded in 1128ms:
1:import { Injectable } from '@nestjs/common';
2:import { DatabaseService } from '../database/database.service';
3:import type { ValidatedMembership } from '../tenancy/tenant-context';
4:
5:/**
6: * Membership lookup — the source of truth for what a user may access.
7: *
8: * This runs WITHOUT a tenant context on purpose: it is the query that
9: * *establishes* which tenants a user belongs to, so it cannot itself be scoped
10: * to one. It is therefore keyed strictly on the Keycloak subject taken from a
11: * validated token signature, and returns nothing else.
12: *
13: * This is the one place a tenant boundary is crossed, which is exactly why it
14: * is small, parameterised, and does not accept a tenant id from anywhere.
15: */
16:@Injectable()
17:export class MembershipRepository {
18:  constructor(private readonly db: DatabaseService) {}
19:
20:  async findByKeycloakSubject(subject: string): Promise<{
21:    userId: string;
22:    memberships: ValidatedMembership[];
23:  } | null> {
24:    const rows = await this.db.queryWithoutTenant<{
25:      user_id: string;
26:      tenant_id: string;
27:      organization_id: string;
28:      branch_id: string | null;
29:      role_name: string;
30:      status: 'active' | 'suspended' | 'revoked';
31:    }>(
32:      `SELECT u.id            AS user_id,
33:              m.tenant_id     AS tenant_id,
34:              m.organization_id,
35:              m.branch_id,
36:              m.role_name,
37:              m.status
38:         FROM identity.users u
39:    LEFT JOIN identity.memberships m ON m.user_id = u.id
40:        WHERE u.keycloak_subject = $1
41:          AND u.status = 'active'`,
42:      [subject],
43:    );
44:
45:    if (rows.length === 0) return null;
46:
47:    const userId = rows[0]!.user_id;
48:    const memberships = rows
49:      .filter((r) => r.tenant_id !== null)
50:      .map((r) => ({
51:        tenantId: r.tenant_id,
52:        organizationId: r.organization_id,
53:        branchId: r.branch_id,
54:        roleName: r.role_name,
55:        status: r.status,
56:      }));
57:
58:    return { userId, memberships };
59:  }
60:}

 succeeded in 1134ms:
1:import {
2:  Body,
3:  Controller,
4:  Get,
5:  Param,
6:  ParseUUIDPipe,
7:  Post,
8:  Req,
9:  UseGuards,
10:} from '@nestjs/common';
11:import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
12:import { OrganizationService } from './organization.service';
13:
14:/**
15: * Thin by design.
16: *
17: * The controller authenticates, resolves tenant context (via the guard) and
18: * delegates. Every business rule lives in OrganizationService, so an MCP tool
19: * calling the same service gets the same rules — the property the whole AI
20: * boundary depends on (`0.txt` §13, §26).
21: */
22:@Controller('organizations')
23:@UseGuards(TenantGuard)
24:export class OrganizationController {
25:  constructor(private readonly organizations: OrganizationService) {}
26:
27:  @Get()
28:  list(@Req() req: AuthenticatedRequest) {
29:    return this.organizations.list(req.tenantContext);
30:  }
31:
32:  @Get(':id')
33:  findOne(
34:    @Req() req: AuthenticatedRequest,
35:    @Param('id', new ParseUUIDPipe()) id: string,
36:  ) {
37:    return this.organizations.findById(req.tenantContext, id);
38:  }
39:
40:  @Post()
41:  create(
42:    @Req() req: AuthenticatedRequest,
43:    @Body() body: { name: string; orgType: string },
44:  ) {
45:    return this.organizations.create(req.tenantContext, body);
46:  }
47:}

 succeeded in 1101ms:
1:import { Injectable, NotFoundException } from '@nestjs/common';
2:import { DatabaseService } from '../database/database.service';
3:import type { TenantContext } from '../tenancy/tenant-context';
5:export interface TenantUser {
6:  id: string;
7:  email: string;
8:  displayName: string;
9:  phone: string | null;
10:  preferredLocale: string;
11:  status: string;
12:  /** The roles this user holds IN THE ACTIVE TENANT — never across tenants. */
13:  roles: string[];
14:}
16:/**
17: * User directory, scoped to the active tenant — T-0003.
18: *
19: * ⚠️ READ THIS BEFORE ADDING A QUERY TO THIS FILE. ⚠️
20: *
21: * `identity.users` is the ONE table in the identity schema that is deliberately
22: * NOT tenant-scoped and has NO row-level security. Migration 001 says so
23: * explicitly: one human may hold memberships in several tenants, so the user
24: * row cannot belong to any single one of them.
25: *
26: * The consequence is sharp, and it is the opposite of everywhere else in this
27: * codebase: **RLS will not save you here.** A plain
28: * `SELECT * FROM identity.users` inside `withTenant` returns every user on the
29: * platform, across every tenant, and no policy stops it. It will look correct
30: * in review, pass typecheck, and leak the entire user base.
31: *
32: * Every query below therefore reaches users ONLY through
33: * `identity.memberships`, which IS under `ENABLE` + `FORCE ROW LEVEL SECURITY`.
34: * The join is what scopes the result: rows survive only for users who hold a
35: * membership visible to the current tenant. `user_directory_is_scoped_by_
36: * membership` in the spec file asserts this property, because a comment does
37: * not stop anyone.
38: *
39: * This also matches the authority model in PLAN_EXTENSION_v1 §2.1 — authority
40: * derives from membership, never from the user record itself.
41: */
42:@Injectable()
43:export class UserService {
44:  constructor(private readonly db: DatabaseService) {}
46:  /**
47:   * Users who hold a membership in the active tenant.
48:   *
49:   * Aggregating roles rather than returning one row per membership: a user with
50:   * three roles is one person in the directory, and `07.txt` part 2 §46's Staff
51:   * screen lists people, not role assignments.
52:   */
53:  async list(ctx: TenantContext): Promise<TenantUser[]> {
54:    return this.db.withTenant(ctx, async (client) => {
55:      const res = await client.query(
56:        `SELECT u.id,
57:                u.email,
58:                u.display_name,
59:                u.phone,
60:                u.preferred_locale,
61:                u.status,
62:                array_agg(m.role_name ORDER BY m.role_name) AS roles
63:           FROM identity.memberships m
64:           JOIN identity.users u ON u.id = m.user_id
65:          WHERE m.status = 'active'
66:          GROUP BY u.id, u.email, u.display_name, u.phone, u.preferred_locale, u.status
67:          ORDER BY u.display_name`,
68:      );
69:      return res.rows.map(this.toDomain);
70:    });
71:  }
73:  /**
74:   * One user, but only if they are a member of the active tenant.
75:   *
76:   * Driving from `memberships` rather than from `users` is what makes this
77:   * safe: an id belonging to a user in another tenant simply matches no
78:   * membership row and yields 404 — the same non-oracle behaviour as the other
79:   * services, arrived at through the join instead of through a policy.
80:   */
81:  async findById(ctx: TenantContext, id: string): Promise<TenantUser> {
82:    return this.db.withTenant(ctx, async (client) => {
83:      const res = await client.query(
84:        `SELECT u.id,
85:                u.email,
86:                u.display_name,
87:                u.phone,
88:                u.preferred_locale,
89:                u.status,
90:                array_agg(m.role_name ORDER BY m.role_name) AS roles
91:           FROM identity.memberships m
92:           JOIN identity.users u ON u.id = m.user_id
93:          WHERE u.id = $1
94:            AND m.status = 'active'
95:          GROUP BY u.id, u.email, u.display_name, u.phone, u.preferred_locale, u.status`,
96:        [id],
97:      );
98:      const row = res.rows[0];
99:      if (!row) throw new NotFoundException('user not found');
100:      return this.toDomain(row);
101:    });
102:  }
104:  private toDomain = (row: {
105:    id: string;
106:    email: string;
107:    display_name: string;
108:    phone: string | null;
109:    preferred_locale: string;
110:    status: string;
111:    roles: string[] | null;
112:  }): TenantUser => ({
113:    id: row.id,
114:    email: row.email,
115:    displayName: row.display_name,
116:    phone: row.phone,
117:    preferredLocale: row.preferred_locale,
118:    status: row.status,
119:    roles: row.roles ?? [],
120:  });
121:}

 succeeded in 1161ms:
1:import {
2:  Body,
3:  Controller,
4:  Get,
5:  Param,
6:  ParseUUIDPipe,
7:  Patch,
8:  Post,
9:  Query,
10:  Req,
11:  UseGuards,
12:} from '@nestjs/common';
13:import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
14:import { BranchService } from './branch.service';
15:import { MembershipService } from './membership.service';
16:import { MeService } from './me.service';
17:import { UserService } from './user.service';
18:
19:/**
20: * Identity controllers — T-0003.
21: *
22: * Thin by design, exactly like `OrganizationController`: authenticate, resolve
23: * tenant context via the guard, delegate. No business rule lives here, so an
24: * MCP tool calling the same service gets identical behaviour — the property the
25: * whole AI boundary rests on (`0.txt` §13, §26).
26: *
27: * Note what is NOT here: no endpoint accepts a `tenantId`. Tenant context comes
28: * only from the validated token plus membership (`1.txt` §9), and adding such a
29: * parameter would be the confused-deputy hole the design exists to prevent.
30: */
31:
32:@Controller('branches')
33:@UseGuards(TenantGuard)
34:export class BranchController {
35:  constructor(private readonly branches: BranchService) {}
36:
37:  @Get()
38:  list(@Req() req: AuthenticatedRequest, @Query('organizationId') organizationId?: string) {
39:    return this.branches.list(req.tenantContext, organizationId);
40:  }
41:
42:  @Get(':id')
43:  findOne(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
44:    return this.branches.findById(req.tenantContext, id);
45:  }
46:
47:  @Post()
48:  create(
49:    @Req() req: AuthenticatedRequest,
50:    @Body() body: { organizationId: string; name: string; location?: string; operatingHours?: string },
51:  ) {
52:    return this.branches.create(req.tenantContext, body);
53:  }
54:}
55:
56:@Controller('users')
57:@UseGuards(TenantGuard)
58:export class UserController {
59:  constructor(private readonly users: UserService) {}
60:
61:  @Get()
62:  list(@Req() req: AuthenticatedRequest) {
63:    return this.users.list(req.tenantContext);
64:  }
65:
66:  @Get(':id')
67:  findOne(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
68:    return this.users.findById(req.tenantContext, id);
69:  }
70:}
71:
72:@Controller('memberships')
73:@UseGuards(TenantGuard)
74:export class MembershipController {
75:  constructor(private readonly memberships: MembershipService) {}
76:
77:  @Get()
78:  list(
79:    @Req() req: AuthenticatedRequest,
80:    @Query('userId') userId?: string,
81:    @Query('organizationId') organizationId?: string,
82:  ) {
83:    return this.memberships.list(req.tenantContext, { userId, organizationId });
84:  }
85:
86:  @Post()
87:  grant(
88:    @Req() req: AuthenticatedRequest,
89:    @Body() body: { userId: string; organizationId: string; branchId?: string | null; roleName: string },
90:  ) {
91:    return this.memberships.grant(req.tenantContext, body);
92:  }
93:
94:  /**
95:   * PATCH, not DELETE: a membership is never removed. Withdrawal is a status
96:   * transition that leaves the row and its audit trail intact, because
97:   * "was this person ever granted access?" must stay answerable.
98:   */
99:  @Patch(':id/status')
100:  withdraw(
101:    @Req() req: AuthenticatedRequest,
102:    @Param('id', new ParseUUIDPipe()) id: string,
103:    @Body() body: { status: 'suspended' | 'revoked' },
104:  ) {
105:    return this.memberships.withdraw(req.tenantContext, id, body.status);
106:  }
107:}
108:
109:/**
110: * `GET /me` — who the caller is, and what their role may see.
111: *
112: * The endpoint the Next apps call to stop guessing. Everything it returns is
113: * derived from the validated token plus membership records; no field of the
114: * request can influence the role or the permission list (`1.txt` §9).
115: */
116:@Controller('me')
117:@UseGuards(TenantGuard)
118:export class MeController {
119:  constructor(private readonly me: MeService) {}
120:
121:  @Get()
122:  describe(@Req() req: AuthenticatedRequest) {
123:    return this.me.describe(req.tenantContext);
124:  }
125:}

codex
There is also a more basic auth failure: the guard’s membership lookup runs “without tenant” against an RLS-protected memberships table. With no `app.tenant_id`, PostgreSQL hides every membership row, so real users cannot resolve a tenant context at all. I’m checking tests to see whether this is covered or masked by fakes.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "findByKeycloakSubject|queryWithoutTenant|membershipRow|fakeDb|RLS|no tenant|memberships" apps/api/src/**/*.spec.ts apps/api/src/**/**/*.spec.ts' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "." tests/tenant-isolation/rls_proof.sql' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \".\" packages/next-shell/src/ModulePage.tsx packages/next-shell/src/viewer.ts apps/admin-web/app/layout.tsx apps/admin-web/app/\\[...slug\\]/page.tsx" in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "." apps/api/src/database/database.integration.spec.ts' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 959ms:
1:import { describe, expect, it, beforeAll, afterAll } from 'vitest';
2:import { Pool } from 'pg';
3:import { tenantSessionStatements, type TenantContext } from '../tenancy/tenant-context';
4:
5:/**
6: * Integration proof that withTenant()'s mechanism actually enforces RLS.
7: *
8: * The unit tests prove the CONTEXT RESOLUTION logic. They cannot prove that the
9: * resulting statements isolate anything — only a real PostgreSQL can. Last
10: * night the policies were textbook-correct and completely inert because the
11: * connecting role was a superuser; that class of defect is invisible to unit
12: * tests by construction.
13: *
14: * Skips cleanly when no database is reachable, so CI without infrastructure
15: * stays green rather than silently passing a test that never ran.
16: */
17:const APP_URL =
18:  process.env.DATABASE_URL_APP ??
19:  'postgresql://autoworkshop_app:change_me_locally@localhost:5432/autoworkshop';
20:
21:const TENANT_A = '11111111-1111-1111-1111-111111111111';
22:const TENANT_B = '22222222-2222-2222-2222-222222222222';
23:
24:const ctx = (tenantId: string): TenantContext => ({
25:  tenantId,
26:  organizationId: 'aaaaaaaa-0000-0000-0000-000000000001',
27:  branchId: null,
28:  userId: '00000000-0000-0000-0000-0000000000ff',
29:  activeRole: 'workshop_owner',
30:  correlationId: 'integration-test',
31:});
32:
33:let pool: Pool | null = null;
34:let reachable = false;
35:
36:beforeAll(async () => {
37:  try {
38:    pool = new Pool({ connectionString: APP_URL, max: 2, connectionTimeoutMillis: 3000 });
39:    await pool.query('SELECT 1');
40:    reachable = true;
41:  } catch {
42:    reachable = false;
43:    await pool?.end().catch(() => undefined);
44:    pool = null;
45:  }
46:});
47:
48:afterAll(async () => {
49:  await pool?.end().catch(() => undefined);
50:});
51:
52:interface QueryResultLike {
53:  rows: Array<Record<string, unknown>>;
54:}
55:interface ClientLike {
56:  query: (text: string, values?: unknown[]) => Promise<QueryResultLike>;
57:  release: () => void;
58:}
59:
60:/** Mirrors DatabaseService.withTenant without needing the Nest container. */
61:async function withTenant<T>(
62:  c: TenantContext,
63:  work: (client: ClientLike) => Promise<T>,
64:): Promise<T> {
65:  const client = (await pool!.connect()) as unknown as ClientLike;
66:  try {
67:    await client.query('BEGIN');
68:    for (const stmt of tenantSessionStatements(c)) {
69:      await client.query(stmt.text, stmt.values);
70:    }
71:    const out = await work(client);
72:    await client.query('COMMIT');
73:    return out;
74:  } catch (e) {
75:    await client.query('ROLLBACK').catch(() => undefined);
76:    throw e;
77:  } finally {
78:    client.release();
79:  }
80:}
81:
82:describe('DatabaseService.withTenant — RLS enforcement (integration)', () => {
83:  it('the application role is NOT a superuser and cannot bypass RLS', async () => {
84:    if (!reachable) return;
85:    const r = await pool!.query(
86:      'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
87:    );
88:    // If either is true, every RLS policy in the system is decorative.
89:    expect(r.rows[0].rolsuper).toBe(false);
90:    expect(r.rows[0].rolbypassrls).toBe(false);
91:  });
92:
93:  it('scopes reads to the bound tenant', async () => {
94:    if (!reachable) return;
95:    const a = await withTenant(ctx(TENANT_A), (c) =>
96:      c.query('SELECT id, tenant_id FROM identity.organizations'),
97:    );
98:    expect(a.rows.length).toBeGreaterThan(0);
99:    expect(a.rows.every((r) => r.tenant_id === TENANT_A)).toBe(true);
100:  });
101:
102:  it('cannot read another tenant by direct id', async () => {
103:    if (!reachable) return;
104:    const res = await withTenant(ctx(TENANT_A), (c) =>
105:      c.query('SELECT id FROM identity.organizations WHERE tenant_id = $1', [TENANT_B]),
106:    );
107:    expect(res.rows).toHaveLength(0);
108:  });
109:
110:  it('does not leak context to the next connection borrowed from the pool', async () => {
111:    if (!reachable) return;
112:    // The heart of the pooling risk: settings are transaction-local, so a
113:    // later borrow must start with no tenant context at all.
114:    await withTenant(ctx(TENANT_A), (c) => c.query('SELECT 1'));
115:    const client = await pool!.connect();
116:    try {
117:      const r = await client.query(`SELECT current_setting('app.tenant_id', true) AS t`);
118:      expect(r.rows[0].t === null || r.rows[0].t === '').toBe(true);
119:    } finally {
120:      client.release();
121:    }
122:  });
123:
124:  it('FAILS CLOSED: no tenant context returns zero rows, never all rows', async () => {
125:    if (!reachable) return;
126:    const client = await pool!.connect();
127:    try {
128:      const r = await client.query('SELECT count(*)::int AS n FROM identity.organizations');
129:      expect(r.rows[0].n).toBe(0);
130:    } finally {
131:      client.release();
132:    }
133:  });
134:});

 exited 1 in 1009ms:
packages/next-shell/src/viewer.ts:1:import { cache } from 'react';
packages/next-shell/src/viewer.ts:2:import type { PermissionKey, RoleId, WorkspaceId } from '@autoworkshop/navigation';
packages/next-shell/src/viewer.ts:3:import { apiBaseUrl, workspaceAuth } from '@autoworkshop/auth';
packages/next-shell/src/viewer.ts:4:import { grantsFor, navRoleFor, NO_GRANTS, type ViewerDescription } from './viewer-contract';
packages/next-shell/src/viewer.ts:6:/**
packages/next-shell/src/viewer.ts:7: * WHO THE VIEWER IS — resolved from a validated Keycloak session (T-0005).
packages/next-shell/src/viewer.ts:8: *
packages/next-shell/src/viewer.ts:9: * This file is what the previous demo implementation promised would replace it:
packages/next-shell/src/viewer.ts:10: * "WHEN PHASE 2 LANDS, this is the one function to replace. Its body becomes a
packages/next-shell/src/viewer.ts:11: * read of the validated Keycloak claims and the viewer's membership records."
packages/next-shell/src/viewer.ts:12: * It now is. `viewerGrants()` no longer returns a fixed array to everybody, and
packages/next-shell/src/viewer.ts:13: * `viewerRole()` no longer hardcodes `technician` for the workshop app.
packages/next-shell/src/viewer.ts:14: *
packages/next-shell/src/viewer.ts:15: * SERVER ONLY. The access token is read from the encrypted session cookie and
packages/next-shell/src/viewer.ts:16: * used to call the API from the Next server. The browser never receives it, and
packages/next-shell/src/viewer.ts:17: * never receives the raw `/me` response either — only the shell rendered from
packages/next-shell/src/viewer.ts:18: * it. `1.txt` §9: the tenant identifier must never come from the client, and
packages/next-shell/src/viewer.ts:19: * here nothing does: the API derives tenant, organisation, branch, role and
packages/next-shell/src/viewer.ts:20: * permissions from the token subject plus membership records.
packages/next-shell/src/viewer.ts:21: *
packages/next-shell/src/viewer.ts:22: * STILL NOT A SECURITY CONTROL. These values decide which doors the UI admits
packages/next-shell/src/viewer.ts:23: * exist. Enforcement is the API's `TenantGuard` and Postgres RLS, which deny
packages/next-shell/src/viewer.ts:24: * independently of anything decided here. CLAUDE.md §8: "Hidden ≠ secure."
packages/next-shell/src/viewer.ts:25: */
packages/next-shell/src/viewer.ts:27:/**
packages/next-shell/src/viewer.ts:28: * The `/me` call, deduplicated per request.
packages/next-shell/src/viewer.ts:29: *
packages/next-shell/src/viewer.ts:30: * `cache()` is React's per-request memo, not a time-based cache: a layout, a
packages/next-shell/src/viewer.ts:31: * page and a catch-all route all asking who the viewer is produce ONE HTTP call
packages/next-shell/src/viewer.ts:32: * per render, and the next request starts clean. Without it every navigation
packages/next-shell/src/viewer.ts:33: * would make three identical round trips to the API, and — worse — they could
packages/next-shell/src/viewer.ts:34: * disagree if a membership changed mid-render, which is precisely the nav/router
packages/next-shell/src/viewer.ts:35: * split that has already shipped once here.
packages/next-shell/src/viewer.ts:36: */
packages/next-shell/src/viewer.ts:37:const fetchViewer = cache(async (workspaceId: string): Promise<ViewerDescription | null> => {
packages/next-shell/src/viewer.ts:38:  const accessToken = await workspaceAuth(workspaceId).getAccessToken();
packages/next-shell/src/viewer.ts:39:  // No session, or a session whose access token has expired without middleware
packages/next-shell/src/viewer.ts:40:  // renewing it. Either way the viewer is unauthenticated for this render.
packages/next-shell/src/viewer.ts:41:  if (!accessToken) return null;
packages/next-shell/src/viewer.ts:43:  let response: Response;
packages/next-shell/src/viewer.ts:44:  try {
packages/next-shell/src/viewer.ts:45:    response = await fetch(`${apiBaseUrl()}/api/v1/me`, {
packages/next-shell/src/viewer.ts:46:      headers: { Authorization: `Bearer ${accessToken}` },
packages/next-shell/src/viewer.ts:47:      // The viewer's role and permissions are per-request facts. Next caches
packages/next-shell/src/viewer.ts:48:      // fetches by default; caching this one would serve one user's grants to
packages/next-shell/src/viewer.ts:49:      // the next user who lands on the same rendered route.
packages/next-shell/src/viewer.ts:50:      cache: 'no-store',
packages/next-shell/src/viewer.ts:51:    });
packages/next-shell/src/viewer.ts:52:  } catch {
packages/next-shell/src/viewer.ts:53:    // The API being unreachable must degrade to "unauthenticated", never throw:
packages/next-shell/src/viewer.ts:54:    // an exception here takes out the whole page, including the parts that need
packages/next-shell/src/viewer.ts:55:    // no API at all. Fail closed and let the shell render its signed-out state.
packages/next-shell/src/viewer.ts:56:    return null;
packages/next-shell/src/viewer.ts:57:  }
packages/next-shell/src/viewer.ts:59:  if (!response.ok) return null;
packages/next-shell/src/viewer.ts:61:  try {
packages/next-shell/src/viewer.ts:62:    return (await response.json()) as ViewerDescription;
packages/next-shell/src/viewer.ts:63:  } catch {
packages/next-shell/src/viewer.ts:64:    return null;
packages/next-shell/src/viewer.ts:65:  }
packages/next-shell/src/viewer.ts:66:});
packages/next-shell/src/viewer.ts:68:/** The viewer, or `null` when nobody is signed in. */
packages/next-shell/src/viewer.ts:69:export async function currentViewer(
packages/next-shell/src/viewer.ts:70:  workspaceId: WorkspaceId | string,
packages/next-shell/src/viewer.ts:71:): Promise<ViewerDescription | null> {
packages/next-shell/src/viewer.ts:72:  return fetchViewer(workspaceId);
packages/next-shell/src/viewer.ts:73:}
packages/next-shell/src/viewer.ts:75:/**
packages/next-shell/src/viewer.ts:76: * The viewer's permission grants — THE single source, for both the navigation
packages/next-shell/src/viewer.ts:77: * and the route resolver.
packages/next-shell/src/viewer.ts:78: *
packages/next-shell/src/viewer.ts:79: * The reason it is one function has not changed since it held demo data: the
packages/next-shell/src/viewer.ts:80: * grants were briefly supplied in two places, the side nav advertised modules
packages/next-shell/src/viewer.ts:81: * that answered 404 when clicked, and two sources of truth for "what may this
packages/next-shell/src/viewer.ts:82: * user see" produced that bug immediately. Now that the value comes from a
packages/next-shell/src/viewer.ts:83: * session the risk is worse, not better — two call sites could resolve two
packages/next-shell/src/viewer.ts:84: * different identities.
packages/next-shell/src/viewer.ts:85: */
packages/next-shell/src/viewer.ts:86:export async function viewerGrants(
packages/next-shell/src/viewer.ts:87:  workspaceId: WorkspaceId | string,
packages/next-shell/src/viewer.ts:88:): Promise<readonly PermissionKey[]> {
packages/next-shell/src/viewer.ts:89:  return grantsFor(await fetchViewer(workspaceId));
packages/next-shell/src/viewer.ts:90:}
packages/next-shell/src/viewer.ts:92:/**
packages/next-shell/src/viewer.ts:93: * The viewer's ROLE within a workspace — `07.txt` part 2 §46-§49 (T-0027).
packages/next-shell/src/viewer.ts:94: *
packages/next-shell/src/viewer.ts:95: * The role decides WHICH navigation tree the viewer is on; the grants decide
packages/next-shell/src/viewer.ts:96: * which of its entries they may open. Both must come from the same resolved
packages/next-shell/src/viewer.ts:97: * viewer, which is why they share `fetchViewer` rather than each fetching.
packages/next-shell/src/viewer.ts:98: *
packages/next-shell/src/viewer.ts:99: * ROLE IS NOT AUTHORITY. Selecting a tree grants nothing: every item in it is
packages/next-shell/src/viewer.ts:100: * still permission-filtered, and the API plus RLS deny independently. §50's rule
packages/next-shell/src/viewer.ts:101: * — "No user shall receive functions outside the user's approved role and
packages/next-shell/src/viewer.ts:102: * branch" — is enforced there, not by which menu got rendered.
packages/next-shell/src/viewer.ts:103: *
packages/next-shell/src/viewer.ts:104: * An unauthenticated viewer has no role, so the workspace's own default tree is
packages/next-shell/src/viewer.ts:105: * shown. That is the honest rendering of "we do not know who you are"; it is
packages/next-shell/src/viewer.ts:106: * not a fallback to a privileged view, because the default tree is filtered by
packages/next-shell/src/viewer.ts:107: * `NO_GRANTS`.
packages/next-shell/src/viewer.ts:108: */
packages/next-shell/src/viewer.ts:109:export async function viewerRole(
packages/next-shell/src/viewer.ts:110:  workspaceId: WorkspaceId | string,
packages/next-shell/src/viewer.ts:111:): Promise<RoleId | undefined> {
packages/next-shell/src/viewer.ts:112:  const viewer = await fetchViewer(workspaceId);
packages/next-shell/src/viewer.ts:113:  return navRoleFor(viewer?.activeRole);
packages/next-shell/src/viewer.ts:114:}
packages/next-shell/src/viewer.ts:116:export { grantsFor, navRoleFor, NO_GRANTS };
packages/next-shell/src/viewer.ts:117:export type { ViewerDescription };
apps/admin-web/app/layout.tsx:1:import type { Metadata } from 'next';
apps/admin-web/app/layout.tsx:2:import {
apps/admin-web/app/layout.tsx:3:  WorkspaceShell,
apps/admin-web/app/layout.tsx:4:  currentViewer,
apps/admin-web/app/layout.tsx:5:  grantsFor,
apps/admin-web/app/layout.tsx:6:  navRoleFor,
apps/admin-web/app/layout.tsx:7:  viewerLabels,
apps/admin-web/app/layout.tsx:8:} from '@autoworkshop/next-shell';
apps/admin-web/app/layout.tsx:9:import { themeBootScript } from '@autoworkshop/ui';
apps/admin-web/app/layout.tsx:11:export const metadata: Metadata = {
apps/admin-web/app/layout.tsx:12:  title: 'AutoWorkshop AI — Platform Administration',
apps/admin-web/app/layout.tsx:13:  description: 'Platform administrators — organizations, security, incidents',
apps/admin-web/app/layout.tsx:14:};
apps/admin-web/app/layout.tsx:16:/**
apps/admin-web/app/layout.tsx:17: * All seven apps share one shell (`@autoworkshop/next-shell`). Only the
apps/admin-web/app/layout.tsx:18: * workspace id differs — the navigation itself comes from
apps/admin-web/app/layout.tsx:19: * `@autoworkshop/navigation`, transcribed from the approved spec.
apps/admin-web/app/layout.tsx:20: *
apps/admin-web/app/layout.tsx:21: * `currentViewer()` resolves the signed-in user from the Keycloak session and
apps/admin-web/app/layout.tsx:22: * `GET /api/v1/me` (T-0005). The grants and the role derived from it are the
apps/admin-web/app/layout.tsx:23: * single source shared with this workspace's catch-all route — React's
apps/admin-web/app/layout.tsx:24: * `cache()` makes both resolve the SAME viewer within one render, so the
apps/admin-web/app/layout.tsx:25: * navigation and the router cannot disagree about what may be seen.
apps/admin-web/app/layout.tsx:26: *
apps/admin-web/app/layout.tsx:27: * Accurate is not the same as enforcing: hiding a nav entry protects nothing.
apps/admin-web/app/layout.tsx:28: * The API's tenant guard and Postgres RLS deny independently (CLAUDE.md §8).
apps/admin-web/app/layout.tsx:29: */
apps/admin-web/app/layout.tsx:30:export default async function RootLayout({ children }: { children: React.ReactNode }) {
apps/admin-web/app/layout.tsx:31:  const viewer = await currentViewer('admin');
apps/admin-web/app/layout.tsx:33:  return (
apps/admin-web/app/layout.tsx:34:    <html lang="en" suppressHydrationWarning>
apps/admin-web/app/layout.tsx:35:      <head>
apps/admin-web/app/layout.tsx:36:        {/* Applies the stored theme before first paint — prevents the
apps/admin-web/app/layout.tsx:37:            flash of incorrect theme. Must be inline and synchronous. */}
apps/admin-web/app/layout.tsx:38:        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
apps/admin-web/app/layout.tsx:39:      </head>
apps/admin-web/app/layout.tsx:40:      <body style={{ margin: 0, background: 'var(--aw-background-primary)', color: 'var(--aw-text-primary)' }}>
apps/admin-web/app/layout.tsx:41:        <WorkspaceShell
apps/admin-web/app/layout.tsx:42:          workspaceId="admin"
apps/admin-web/app/layout.tsx:43:          grants={grantsFor(viewer)}
apps/admin-web/app/layout.tsx:44:          role={navRoleFor(viewer?.activeRole)}
apps/admin-web/app/layout.tsx:45:          {...viewerLabels(viewer)}
apps/admin-web/app/layout.tsx:46:          topNavActions={[
apps/admin-web/app/layout.tsx:47:            { id: 'create', label: 'Create', icon: 'create' },
apps/admin-web/app/layout.tsx:48:            { id: 'tasks', label: 'Tasks and approvals', icon: 'tasks' },
apps/admin-web/app/layout.tsx:49:            { id: 'messages', label: 'Messages and calls', icon: 'messages' },
apps/admin-web/app/layout.tsx:50:            { id: 'notifications', label: 'Notifications', icon: 'notifications' },
apps/admin-web/app/layout.tsx:51:            { id: 'ai', label: 'AI assistant', icon: 'ai' },
apps/admin-web/app/layout.tsx:52:            { id: 'help', label: 'Help and support', icon: 'help' },
apps/admin-web/app/layout.tsx:53:          ]}
apps/admin-web/app/layout.tsx:54:        >
apps/admin-web/app/layout.tsx:55:          {children}
apps/admin-web/app/layout.tsx:56:        </WorkspaceShell>
apps/admin-web/app/layout.tsx:57:      </body>
apps/admin-web/app/layout.tsx:58:    </html>
apps/admin-web/app/layout.tsx:59:  );
apps/admin-web/app/layout.tsx:60:}
packages/next-shell/src/ModulePage.tsx:1:import { notFound } from 'next/navigation';
packages/next-shell/src/ModulePage.tsx:2:import { PageHeader, EmptyState, StatusBadge } from '@autoworkshop/ui';
packages/next-shell/src/ModulePage.tsx:3:import {
packages/next-shell/src/ModulePage.tsx:4:  getWorkspace,
packages/next-shell/src/ModulePage.tsx:5:  visibleGroups,
packages/next-shell/src/ModulePage.tsx:6:  workspaceForRole,
packages/next-shell/src/ModulePage.tsx:7:  type PermissionKey,
packages/next-shell/src/ModulePage.tsx:8:} from '@autoworkshop/navigation';
packages/next-shell/src/ModulePage.tsx:9:import { viewerRole } from './viewer';
packages/next-shell/src/ModulePage.tsx:10:import { themeVar, primitive } from '@autoworkshop/design-tokens';
packages/next-shell/src/ModulePage.tsx:12:/**
packages/next-shell/src/ModulePage.tsx:13: * The shared "screen not built yet" page behind each workspace's catch-all
packages/next-shell/src/ModulePage.tsx:14: * route.
packages/next-shell/src/ModulePage.tsx:15: *
packages/next-shell/src/ModulePage.tsx:16: * WHY IT IS HONEST RATHER THAN A MOCK. `05.txt` §2 explicitly prohibits
packages/next-shell/src/ModulePage.tsx:17: * "disconnected mock pages". A convincing fake screen gets demoed, believed,
packages/next-shell/src/ModulePage.tsx:18: * and then discovered to be empty at the worst possible moment. This page says
packages/next-shell/src/ModulePage.tsx:19: * what is true: the navigation, routing and breadcrumbs around this screen
packages/next-shell/src/ModulePage.tsx:20: * work; the screen's own content is scheduled.
packages/next-shell/src/ModulePage.tsx:21: *
packages/next-shell/src/ModulePage.tsx:22: * The nav tree doubles as the route allow-list — a path that is not in it
packages/next-shell/src/ModulePage.tsx:23: * returns a real 404, so a typo in a link cannot be masked by a friendly
packages/next-shell/src/ModulePage.tsx:24: * placeholder.
packages/next-shell/src/ModulePage.tsx:25: *
packages/next-shell/src/ModulePage.tsx:26: * PERMISSIONS — READ THIS BEFORE WIRING A REAL SCREEN.
packages/next-shell/src/ModulePage.tsx:27: * The catch-all resolves against the grant-FILTERED tree, so a module the
packages/next-shell/src/ModulePage.tsx:28: * viewer cannot see returns 404 rather than a placeholder naming it. That
packages/next-shell/src/ModulePage.tsx:29: * closes the enumeration hole where hiding a nav entry was the only thing
packages/next-shell/src/ModulePage.tsx:30: * standing between a user and the knowledge that a module exists.
packages/next-shell/src/ModulePage.tsx:31: *
packages/next-shell/src/ModulePage.tsx:32: * It is NOT, and must never be mistaken for, an authorization control. Directive
packages/next-shell/src/ModulePage.tsx:33: * §8: "Hidden ≠ secure". Since T-0005 `grants` originate in a validated Keycloak
packages/next-shell/src/ModulePage.tsx:34: * session rather than a demo array, which makes them ACCURATE — it does not make
packages/next-shell/src/ModulePage.tsx:35: * them enforcing. Real enforcement is the API's tenant guard plus Postgres RLS,
packages/next-shell/src/ModulePage.tsx:36: * which deny independently; this filter only decides what the UI admits exists.
packages/next-shell/src/ModulePage.tsx:37: * No screen may rely on it to protect data.
packages/next-shell/src/ModulePage.tsx:38: *
packages/next-shell/src/ModulePage.tsx:39: * The default remains `[]` and not "everything": a caller that forgets to pass
packages/next-shell/src/ModulePage.tsx:40: * grants must show the ungated modules only. Widening that default is a security
packages/next-shell/src/ModulePage.tsx:41: * change, not a convenience.
packages/next-shell/src/ModulePage.tsx:42: *
packages/next-shell/src/ModulePage.tsx:43: * As each screen is genuinely built it gets `app/<group>/<item>/page.tsx`,
packages/next-shell/src/ModulePage.tsx:44: * which Next resolves ahead of the catch-all. No migration, no cleanup.
packages/next-shell/src/ModulePage.tsx:45: */
packages/next-shell/src/ModulePage.tsx:47:export async function renderModulePage(
packages/next-shell/src/ModulePage.tsx:48:  workspaceId: string,
packages/next-shell/src/ModulePage.tsx:49:  slug: string[] | undefined,
packages/next-shell/src/ModulePage.tsx:50:  /**
packages/next-shell/src/ModulePage.tsx:51:   * The viewer's grants. Defaults to none: an unauthenticated render must see
packages/next-shell/src/ModulePage.tsx:52:   * the ungated modules only, never the full tree. Widening this default is a
packages/next-shell/src/ModulePage.tsx:53:   * security change, not a convenience.
packages/next-shell/src/ModulePage.tsx:54:   */
packages/next-shell/src/ModulePage.tsx:55:  grants: readonly PermissionKey[] = [],
packages/next-shell/src/ModulePage.tsx:56:) {
packages/next-shell/src/ModulePage.tsx:57:  const base = getWorkspace(workspaceId);
packages/next-shell/src/ModulePage.tsx:58:  if (!base) notFound();
packages/next-shell/src/ModulePage.tsx:60:  // Resolve the ROLE tree from the same function the shell's layout uses
packages/next-shell/src/ModulePage.tsx:61:  // (T-0027). Reading `base.groups` here while the shell rendered a role tree
packages/next-shell/src/ModulePage.tsx:62:  // would put the menu and the router back on different maps — defect 3, one
packages/next-shell/src/ModulePage.tsx:63:  // layer up: every route the technician's menu advertises would 404.
packages/next-shell/src/ModulePage.tsx:64:  //
packages/next-shell/src/ModulePage.tsx:65:  // Since T-0005 this is a session read, so it is awaited. It resolves to the
packages/next-shell/src/ModulePage.tsx:66:  // SAME viewer the layout saw: `viewerRole` is memoised per request with
packages/next-shell/src/ModulePage.tsx:67:  // React's `cache()`, which is what keeps one render from resolving two
packages/next-shell/src/ModulePage.tsx:68:  // identities.
packages/next-shell/src/ModulePage.tsx:69:  const workspace = workspaceForRole(base, await viewerRole(workspaceId));
packages/next-shell/src/ModulePage.tsx:71:  const pathname = '/' + (slug ?? []).join('/');
packages/next-shell/src/ModulePage.tsx:72:  // Resolve against the filtered tree, not `workspace.groups` — otherwise a
packages/next-shell/src/ModulePage.tsx:73:  // module hidden from the side nav is still reachable by typing its URL.
packages/next-shell/src/ModulePage.tsx:74:  const groups = visibleGroups(workspace, grants);
packages/next-shell/src/ModulePage.tsx:75:  const group = groups.find((g) => g.items.some((i) => i.href === pathname));
packages/next-shell/src/ModulePage.tsx:76:  const item = group?.items.find((i) => i.href === pathname);
packages/next-shell/src/ModulePage.tsx:77:  if (!group || !item) notFound();
packages/next-shell/src/ModulePage.tsx:79:  return (
packages/next-shell/src/ModulePage.tsx:80:    <>
packages/next-shell/src/ModulePage.tsx:81:      <PageHeader
packages/next-shell/src/ModulePage.tsx:82:        title={item.label}
packages/next-shell/src/ModulePage.tsx:83:        description={`${group.label} · ${workspace.label} workspace`}
packages/next-shell/src/ModulePage.tsx:84:        actions={<StatusBadge kind="draft" label="Not built yet" />}
packages/next-shell/src/ModulePage.tsx:85:      />
packages/next-shell/src/ModulePage.tsx:87:      <EmptyState
packages/next-shell/src/ModulePage.tsx:88:        title={`${item.label} has not been built yet`}
packages/next-shell/src/ModulePage.tsx:89:        description="The navigation, routing and breadcrumbs for this screen are working — the screen's own content is scheduled for a later phase. Access control arrives with this module's own API, which enforces it server-side."
packages/next-shell/src/ModulePage.tsx:90:      />
packages/next-shell/src/ModulePage.tsx:92:      <section
packages/next-shell/src/ModulePage.tsx:93:        style={{
packages/next-shell/src/ModulePage.tsx:94:          border: `1px solid ${themeVar.borderDefault}`,
packages/next-shell/src/ModulePage.tsx:95:          borderRadius: primitive.radius.lg,
packages/next-shell/src/ModulePage.tsx:96:          padding: primitive.space[4],
packages/next-shell/src/ModulePage.tsx:97:          background: themeVar.backgroundSecondary,
packages/next-shell/src/ModulePage.tsx:98:          fontSize: primitive.fontSize.sm,
packages/next-shell/src/ModulePage.tsx:99:          color: themeVar.textSecondary,
packages/next-shell/src/ModulePage.tsx:100:        }}
packages/next-shell/src/ModulePage.tsx:101:      >
packages/next-shell/src/ModulePage.tsx:102:        {/* Route and group ids only. The required permission name is
packages/next-shell/src/ModulePage.tsx:103:            deliberately NOT printed: the viewer already passed the filter to
packages/next-shell/src/ModulePage.tsx:104:            reach this page, so it tells them nothing they need, and publishing
packages/next-shell/src/ModulePage.tsx:105:            the permission taxonomy hands an attacker a map of the authorization
packages/next-shell/src/ModulePage.tsx:106:            model for free. */}
packages/next-shell/src/ModulePage.tsx:107:        <p style={{ margin: 0 }}>
packages/next-shell/src/ModulePage.tsx:108:          Route <code>{pathname}</code> · group <code>{group.id}</code> · item <code>{item.id}</code>
packages/next-shell/src/ModulePage.tsx:109:        </p>
packages/next-shell/src/ModulePage.tsx:110:      </section>
packages/next-shell/src/ModulePage.tsx:111:    </>
packages/next-shell/src/ModulePage.tsx:112:  );
packages/next-shell/src/ModulePage.tsx:113:}
rg: apps/admin-web/app/\[...slug\]/page.tsx: The system cannot find the path specified. (os error 3)

2026-07-27T23:18:10.573094Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 1 seconds
Output:
packages/next-shell/src/viewer.ts:1:import { cache } from 'react';
packages/next-shell/src/viewer.ts:2:import type { PermissionKey, RoleId, WorkspaceId } from '@autoworkshop/navigation';
packages/next-shell/src/viewer.ts:3:import { apiBaseUrl, workspaceAuth } from '@autoworkshop/auth';
packages/next-shell/src/viewer.ts:4:import { grantsFor, navRoleFor, NO_GRANTS, type ViewerDescription } from './viewer-contract';
packages/next-shell/src/viewer.ts:6:/**
packages/next-shell/src/viewer.ts:7: * WHO THE VIEWER IS — resolved from a validated Keycloak session (T-0005).
packages/next-shell/src/viewer.ts:8: *
packages/next-shell/src/viewer.ts:9: * This file is what the previous demo implementation promised would replace it:
packages/next-shell/src/viewer.ts:10: * "WHEN PHASE 2 LANDS, this is the one function to replace. Its body becomes a
packages/next-shell/src/viewer.ts:11: * read of the validated Keycloak claims and the viewer's membership records."
packages/next-shell/src/viewer.ts:12: * It now is. `viewerGrants()` no longer returns a fixed array to everybody, and
packages/next-shell/src/viewer.ts:13: * `viewerRole()` no longer hardcodes `technician` for the workshop app.
packages/next-shell/src/viewer.ts:14: *
packages/next-shell/src/viewer.ts:15: * SERVER ONLY. The access token is read from the encrypted session cookie and
packages/next-shell/src/viewer.ts:16: * used to call the API from the Next server. The browser never receives it, and
packages/next-shell/src/viewer.ts:17: * never receives the raw `/me` response either — only the shell rendered from
packages/next-shell/src/viewer.ts:18: * it. `1.txt` §9: the tenant identifier must never come from the client, and
packages/next-shell/src/viewer.ts:19: * here nothing does: the API derives tenant, organisation, branch, role and
packages/next-shell/src/viewer.ts:20: * permissions from the token subject plus membership records.
packages/next-shell/src/viewer.ts:21: *
packages/next-shell/src/viewer.ts:22: * STILL NOT A SECURITY CONTROL. These values decide which doors the UI admits
packages/next-shell/src/viewer.ts:23: * exist. Enforcement is the API's `TenantGuard` and Postgres RLS, which deny
packages/next-shell/src/viewer.ts:24: * independently of anything decided here. CLAUDE.md §8: "Hidden ≠ secure."
packages/next-shell/src/viewer.ts:25: */
packages/next-shell/src/viewer.ts:27:/**
packages/next-shell/src/viewer.ts:28: * The `/me` call, deduplicated per request.
packages/next-shell/src/viewer.ts:29: *
packages/next-shell/src/viewer.ts:30: * `cache()` is React's per-request memo, not a time-based cache: a layout, a
packages/next-shell/src/viewer.ts:31: * page and a catch-all route all asking who the viewer is produce ONE HTTP call
packages/next-shell/src/viewer.ts:32: * per render, and the next request starts clean. Without it every navigation
packages/next-shell/src/viewer.ts:33: * would make three identical round trips to the API, and — worse — they could
packages/next-shell/src/viewer.ts:34: * disagree if a membership changed mid-render, which is precisely the nav/router
packages/next-shell/src/viewer.ts:35: * split that has already shipped once here.
packages/next-shell/src/viewer.ts:36: */
packages/next-shell/src/viewer.ts:37:const fetchViewer = cache(async (workspaceId: string): Promise<ViewerDescription | null> => {
packages/next-shell/src/viewer.ts:38:  const accessToken = await workspaceAuth(workspaceId).getAccessToken();
packages/next-shell/src/viewer.ts:39:  // No session, or a session whose access token has expired without middleware
packages/next-shell/src/viewer.ts:40:  // renewing it. Either way the viewer is unauthenticated for this render.
packages/next-shell/src/viewer.ts:41:  if (!accessToken) return null;
packages/next-shell/src/viewer.ts:43:  let response: Response;
packages/next-shell/src/viewer.ts:44:  try {
packages/next-shell/src/viewer.ts:45:    response = await fetch(`${apiBaseUrl()}/api/v1/me`, {
packages/next-shell/src/viewer.ts:46:      headers: { Authorization: `Bearer ${accessToken}` },
packages/next-shell/src/viewer.ts:47:      // The viewer's role and permissions are per-request facts. Next caches
packages/next-shell/src/viewer.ts:48:      // fetches by default; caching this one would serve one user's grants to
packages/next-shell/src/viewer.ts:49:      // the next user who lands on the same rendered route.
packages/next-shell/src/viewer.ts:50:      cache: 'no-store',
packages/next-shell/src/viewer.ts:51:    });
packages/next-shell/src/viewer.ts:52:  } catch {
packages/next-shell/src/viewer.ts:53:    // The API being unreachable must degrade to "unauthenticated", never throw:
packages/next-shell/src/viewer.ts:54:    // an exception here takes out the whole page, including the parts that need
packages/next-shell/src/viewer.ts:55:    // no API at all. Fail closed and let the shell render its signed-out state.
packages/next-shell/src/viewer.ts:56:    return null;
packages/next-shell/src/viewer.ts:57:  }
packages/next-shell/src/viewer.ts:59:  if (!response.ok) return null;
packages/next-shell/src/viewer.ts:61:  try {
packages/next-shell/src/viewer.ts:62:    return (await response.json()) as ViewerDescription;
packages/next-shell/src/viewer.ts:63:  } catch {
packages/next-shell/src/viewer.ts:64:    return null;
packages/next-shell/src/viewer.ts:65:  }
packages/next-shell/src/viewer.ts:66:});
packages/next-shell/src/viewer.ts:68:/** The viewer, or `null` when nobody is signed in. */
packages/next-shell/src/viewer.ts:69:export async function currentViewer(
packages/next-shell/src/viewer.ts:70:  workspaceId: WorkspaceId | string,
packages/next-shell/src/viewer.ts:71:): Promise<ViewerDescription | null> {
packages/next-shell/src/viewer.ts:72:  return fetchViewer(workspaceId);
packages/next-shell/src/viewer.ts:73:}
packages/next-shell/src/viewer.ts:75:/**
packages/next-shell/src/viewer.ts:76: * The viewer's permission grants — THE single source, for both the navigation
packages/next-shell/src/viewer.ts:77: * and the route resolver.
packages/next-shell/src/viewer.ts:78: *
packages/next-shell/src/viewer.ts:79: * The reason it is one function has not changed since it held demo data: the
packages/next-shell/src/viewer.ts:80: * grants were briefly supplied in two places, the side nav advertised modules
packages/next-shell/src/viewer.ts:81: * that answered 404 when clicked, and two sources of truth for "what may this
packages/next-shell/src/viewer.ts:82: * user see" produced that bug immediately. Now that the value comes from a
packages/next-shell/src/viewer.ts:83: * session the risk is worse, not better — two call sites could resolve two
packages/next-shell/src/viewer.ts:84: * different identities.
packages/next-shell/src/viewer.ts:85: */
packages/next-shell/src/viewer.ts:86:export async function viewerGrants(
packages/next-shell/src/viewer.ts:87:  workspaceId: WorkspaceId | string,
packages/next-shell/src/viewer.ts:88:): Promise<readonly PermissionKey[]> {
packages/next-shell/src/viewer.ts:89:  return grantsFor(await fetchViewer(workspaceId));
packages/next-shell/src/viewer.ts:90:}
packages/next-shell/src/viewer.ts:92:/**
packages/next-shell/src/viewer.ts:93: * The viewer's ROLE within a workspace — `07.txt` part 2 §46-§49 (T-0027).
packages/next-shell/src/viewer.ts:94: *
packages/next-shell/src/viewer.ts:95: * The role decides WHICH navigation tree the viewer is on; the grants decide
packages/next-shell/src/viewer.ts:96: * which of its entries they may open. Both must come from the same resolved
packages/next-shell/src/viewer.ts:97: * viewer, which is why they share `fetchViewer` rather than each fetching.
packages/next-shell/src/viewer.ts:98: *
packages/next-shell/src/viewer.ts:99: * ROLE IS NOT AUTHORITY. Selecting a tree grants nothing: every item in it is
packages/next-shell/src/viewer.ts:100: * still permission-filtered, and the API plus RLS deny independently. §50's rule
packages/next-shell/src/viewer.ts:101: * — "No user shall receive functions outside the user's approved role and
packages/next-shell/src/viewer.ts:102: * branch" — is enforced there, not by which menu got rendered.
packages/next-shell/src/viewer.ts:103: *
packages/next-shell/src/viewer.ts:104: * An unauthenticated viewer has no role, so the workspace's own default tree is
packages/next-shell/src/viewer.ts:105: * shown. That is the honest rendering of "we do not know who you are"; it is
packages/next-shell/src/viewer.ts:106: * not a fallback to a privileged view, because the default tree is filtered by
packages/next-shell/src/viewer.ts:107: * `NO_GRANTS`.
packages/next-shell/src/viewer.ts:108: */
packages/next-shell/src/viewer.ts:109:export async function viewerRole(
packages/next-shell/src/viewer.ts:110:  workspaceId: WorkspaceId | string,
packages/next-shell/src/viewer.ts:111:): Promise<RoleId | undefined> {
packages/next-shell/src/viewer.ts:112:  const viewer = await fetchViewer(workspaceId);
packages/next-shell/src/viewer.ts:113:  return navRoleFor(viewer?.activeRole);
packages/next-shell/src/viewer.ts:114:}
packages/next-shell/src/viewer.ts:116:export { grantsFor, navRoleFor, NO_GRANTS };
packages/next-shell/src/viewer.ts:117:export type { ViewerDescription };
apps/admin-web/app/layout.tsx:1:import type { Metadata } from 'next';
apps/admin-web/app/layout.tsx:2:import {
apps/admin-web/app/layout.tsx:3:  WorkspaceShell,
apps/admin-web/app/layout.tsx:4:  currentViewer,
apps/admin-web/app/layout.tsx:5:  grantsFor,
apps/admin-web/app/layout.tsx:6:  navRoleFor,
apps/admin-web/app/layout.tsx:7:  viewerLabels,
apps/admin-web/app/layout.tsx:8:} from '@autoworkshop/next-shell';
apps/admin-web/app/layout.tsx:9:import { themeBootScript } from '@autoworkshop/ui';
apps/admin-web/app/layout.tsx:11:export const metadata: Metadata = {
apps/admin-web/app/layout.tsx:12:  title: 'AutoWorkshop AI — Platform Administration',
apps/admin-web/app/layout.tsx:13:  description: 'Platform administrators — organizations, security, incidents',
apps/admin-web/app/layout.tsx:14:};
apps/admin-web/app/layout.tsx:16:/**
apps/admin-web/app/layout.tsx:17: * All seven apps share one shell (`@autoworkshop/next-shell`). Only the
apps/admin-web/app/layout.tsx:18: * workspace id differs — the navigation itself comes from
apps/admin-web/app/layout.tsx:19: * `@autoworkshop/navigation`, transcribed from the approved spec.
apps/admin-web/app/layout.tsx:20: *
apps/admin-web/app/layout.tsx:21: * `currentViewer()` resolves the signed-in user from the Keycloak session and
apps/admin-web/app/layout.tsx:22: * `GET /api/v1/me` (T-0005). The grants and the role derived from it are the
apps/admin-web/app/layout.tsx:23: * single source shared with this workspace's catch-all route — React's
apps/admin-web/app/layout.tsx:24: * `cache()` makes both resolve the SAME viewer within one render, so the
apps/admin-web/app/layout.tsx:25: * navigation and the router cannot disagree about what may be seen.
apps/admin-web/app/layout.tsx:26: *
apps/admin-web/app/layout.tsx:27: * Accurate is not the same as enforcing: hiding a nav entry protects nothing.
apps/admin-web/app/layout.tsx:28: * The API's tenant guard and Postgres RLS deny independently (CLAUDE.md §8).
apps/admin-web/app/layout.tsx:29: */
apps/admin-web/app/layout.tsx:30:export default async function RootLayout({ children }: { children: React.ReactNode }) {
apps/admin-web/app/layout.tsx:31:  const viewer = await currentViewer('admin');
apps/admin-web/app/layout.tsx:33:  return (
apps/admin-web/app/layout.tsx:34:    <html lang="en" suppressHydrationWarning>
apps/admin-web/app/layout.tsx:35:      <head>
apps/admin-web/app/layout.tsx:36:        {/* Applies the stored theme before first paint — prevents the
apps/admin-web/app/layout.tsx:37:            flash of incorrect theme. Must be inline and synchronous. */}
apps/admin-web/app/layout.tsx:38:        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
apps/admin-web/app/layout.tsx:39:      </head>
apps/admin-web/app/layout.tsx:40:      <body style={{ margin: 0, background: 'var(--aw-background-primary)', color: 'var(--aw-text-primary)' }}>
apps/admin-web/app/layout.tsx:41:        <WorkspaceShell
apps/admin-web/app/layout.tsx:42:          workspaceId="admin"
apps/admin-web/app/layout.tsx:43:          grants={grantsFor(viewer)}
apps/admin-web/app/layout.tsx:44:          role={navRoleFor(viewer?.activeRole)}
apps/admin-web/app/layout.tsx:45:          {...viewerLabels(viewer)}
apps/admin-web/app/layout.tsx:46:          topNavActions={[
apps/admin-web/app/layout.tsx:47:            { id: 'create', label: 'Create', icon: 'create' },
apps/admin-web/app/layout.tsx:48:            { id: 'tasks', label: 'Tasks and approvals', icon: 'tasks' },
apps/admin-web/app/layout.tsx:49:            { id: 'messages', label: 'Messages and calls', icon: 'messages' },
apps/admin-web/app/layout.tsx:50:            { id: 'notifications', label: 'Notifications', icon: 'notifications' },
apps/admin-web/app/layout.tsx:51:            { id: 'ai', label: 'AI assistant', icon: 'ai' },
apps/admin-web/app/layout.tsx:52:            { id: 'help', label: 'Help and support', icon: 'help' },
apps/admin-web/app/layout.tsx:53:          ]}
apps/admin-web/app/layout.tsx:54:        >
apps/admin-web/app/layout.tsx:55:          {children}
apps/admin-web/app/layout.tsx:56:        </WorkspaceShell>
apps/admin-web/app/layout.tsx:57:      </body>
apps/admin-web/app/layout.tsx:58:    </html>
apps/admin-web/app/layout.tsx:59:  );
apps/admin-web/app/layout.tsx:60:}
packages/next-shell/src/ModulePage.tsx:1:import { notFound } from 'next/navigation';
packages/next-shell/src/ModulePage.tsx:2:import { PageHeader, EmptyState, StatusBadge } from '@autoworkshop/ui';
packages/next-shell/src/ModulePage.tsx:3:import {
packages/next-shell/src/ModulePage.tsx:4:  getWorkspace,
packages/next-shell/src/ModulePage.tsx:5:  visibleGroups,
packages/next-shell/src/ModulePage.tsx:6:  workspaceForRole,
packages/next-shell/src/ModulePage.tsx:7:  type PermissionKey,
packages/next-shell/src/ModulePage.tsx:8:} from '@autoworkshop/navigation';
packages/next-shell/src/ModulePage.tsx:9:import { viewerRole } from './viewer';
packages/next-shell/src/ModulePage.tsx:10:import { themeVar, primitive } from '@autoworkshop/design-tokens';
packages/next-shell/src/ModulePage.tsx:12:/**
packages/next-shell/src/ModulePage.tsx:13: * The shared "screen not built yet" page behind each workspace's catch-all
packages/next-shell/src/ModulePage.tsx:14: * route.
packages/next-shell/src/ModulePage.tsx:15: *
packages/next-shell/src/ModulePage.tsx:16: * WHY IT IS HONEST RATHER THAN A MOCK. `05.txt` §2 explicitly prohibits
packages/next-shell/src/ModulePage.tsx:17: * "disconnected mock pages". A convincing fake screen gets demoed, believed,
packages/next-shell/src/ModulePage.tsx:18: * and then discovered to be empty at the worst possible moment. This page says
packages/next-shell/src/ModulePage.tsx:19: * what is true: the navigation, routing and breadcrumbs around this screen
packages/next-shell/src/ModulePage.tsx:20: * work; the screen's own content is scheduled.
packages/next-shell/src/ModulePage.tsx:21: *
packages/next-shell/src/ModulePage.tsx:22: * The nav tree doubles as the route allow-list — a path that is not in it
packages/next-shell/src/ModulePage.tsx:23: * returns a real 404, so a typo in a link cannot be masked by a friendly
packages/next-shell/src/ModulePage.tsx:24: * placeholder.
packages/next-shell/src/ModulePage.tsx:25: *
packages/next-shell/src/ModulePage.tsx:26: * PERMISSIONS — READ THIS BEFORE WIRING A REAL SCREEN.
packages/next-shell/src/ModulePage.tsx:27: * The catch-all resolves against the grant-FILTERED tree, so a module the
packages/next-shell/src/ModulePage.tsx:28: * viewer cannot see returns 404 rather than a placeholder naming it. That
packages/next-shell/src/ModulePage.tsx:29: * closes the enumeration hole where hiding a nav entry was the only thing
packages/next-shell/src/ModulePage.tsx:30: * standing between a user and the knowledge that a module exists.
packages/next-shell/src/ModulePage.tsx:31: *
packages/next-shell/src/ModulePage.tsx:32: * It is NOT, and must never be mistaken for, an authorization control. Directive
packages/next-shell/src/ModulePage.tsx:33: * §8: "Hidden ≠ secure". Since T-0005 `grants` originate in a validated Keycloak
packages/next-shell/src/ModulePage.tsx:34: * session rather than a demo array, which makes them ACCURATE — it does not make
packages/next-shell/src/ModulePage.tsx:35: * them enforcing. Real enforcement is the API's tenant guard plus Postgres RLS,
packages/next-shell/src/ModulePage.tsx:36: * which deny independently; this filter only decides what the UI admits exists.
packages/next-shell/src/ModulePage.tsx:37: * No screen may rely on it to protect data.
packages/next-shell/src/ModulePage.tsx:38: *
packages/next-shell/src/ModulePage.tsx:39: * The default remains `[]` and not "everything": a caller that forgets to pass
packages/next-shell/src/ModulePage.tsx:40: * grants must show the ungated modules only. Widening that default is a security
packages/next-shell/src/ModulePage.tsx:41: * change, not a convenience.
packages/next-shell/src/ModulePage.tsx:42: *
packages/next-shell/src/ModulePage.tsx:43: * As each screen is genuinely built it gets `app/<group>/<item>/page.tsx`,
packages/next-shell/src/ModulePage.tsx:44: * which Next resolves ahead of the catch-all. No migration, no cleanup.
packages/next-shell/src/ModulePage.tsx:45: */
packages/next-shell/src/ModulePage.tsx:47:export async function renderModulePage(
packages/next-shell/src/ModulePage.tsx:48:  workspaceId: string,
packages/next-shell/src/ModulePage.tsx:49:  slug: string[] | undefined,
packages/next-shell/src/ModulePage.tsx:50:  /**
packages/next-shell/src/ModulePage.tsx:51:   * The viewer's grants. Defaults to none: an unauthenticated render must see
packages/next-shell/src/ModulePage.tsx:52:   * the ungated modules only, never the full tree. Widening this default is a
packages/next-shell/src/ModulePage.tsx:53:   * security change, not a convenience.
packages/next-shell/src/ModulePage.tsx:54:   */
packages/next-shell/src/ModulePage.tsx:55:  grants: readonly PermissionKey[] = [],
packages/next-shell/src/ModulePage.tsx:56:) {
packages/next-shell/src/ModulePage.tsx:57:  const base = getWorkspace(workspaceId);
packages/next-shell/src/ModulePage.tsx:58:  if (!base) notFound();
packages/next-shell/src/ModulePage.tsx:60:  // Resolve the ROLE tree from the same function the shell's layout uses
packages/next-shell/src/ModulePage.tsx:61:  // (T-0027). Reading `base.groups` here while the shell rendered a role tree
packages/next-shell/src/ModulePage.tsx:62:  // would put the menu and the router back on different maps — defect 3, one
packages/next-shell/src/ModulePage.tsx:63:  // layer up: every route the technician's menu advertises would 404.
packages/next-shell/src/ModulePage.tsx:64:  //
packages/next-shell/src/ModulePage.tsx:65:  // Since T-0005 this is a session read, so it is awaited. It resolves to the
packages/next-shell/src/ModulePage.tsx:66:  // SAME viewer the layout saw: `viewerRole` is memoised per request with
packages/next-shell/src/ModulePage.tsx:67:  // React's `cache()`, which is what keeps one render from resolving two
packages/next-shell/src/ModulePage.tsx:68:  // identities.
packages/next-shell/src/ModulePage.tsx:69:  const workspace = workspaceForRole(base, await viewerRole(workspaceId));
packages/next-shell/src/ModulePage.tsx:71:  const pathname = '/' + (slug ?? []).join('/');
packages/next-shell/src/ModulePage.tsx:72:  // Resolve against the filtered tree, not `workspace.groups` — otherwise a
packages/next-shell/src/ModulePage.tsx:73:  // module hidden from the side nav is still reachable by typing its URL.
packages/next-shell/src/ModulePage.tsx:74:  const groups = visibleGroups(workspace, grants);
packages/next-shell/src/ModulePage.tsx:75:  const group = groups.find((g) => g.items.some((i) => i.href === pathname));
packages/next-shell/src/ModulePage.tsx:76:  const item = group?.items.find((i) => i.href === pathname);
packages/next-shell/src/ModulePage.tsx:77:  if (!group || !item) notFound();
packages/next-shell/src/ModulePage.tsx:79:  return (
packages/next-shell/src/ModulePage.tsx:80:    <>
packages/next-shell/src/ModulePage.tsx:81:      <PageHeader
packages/next-shell/src/ModulePage.tsx:82:        title={item.label}
packages/next-shell/src/ModulePage.tsx:83:        description={`${group.label} · ${workspace.label} workspace`}
packages/next-shell/src/ModulePage.tsx:84:        actions={<StatusBadge kind="draft" label="Not built yet" />}
packages/next-shell/src/ModulePage.tsx:85:      />
packages/next-shell/src/ModulePage.tsx:87:      <EmptyState
packages/next-shell/src/ModulePage.tsx:88:        title={`${item.label} has not been built yet`}
packages/next-shell/src/ModulePage.tsx:89:        description="The navigation, routing and breadcrumbs for this screen are working — the screen's own content is scheduled for a later phase. Access control arrives with this module's own API, which enforces it server-side."
packages/next-shell/src/ModulePage.tsx:90:      />
packages/next-shell/src/ModulePage.tsx:92:      <section
packages/next-shell/src/ModulePage.tsx:93:        style={{
packages/next-shell/src/ModulePage.tsx:94:          border: `1px solid ${themeVar.borderDefault}`,
packages/next-shell/src/ModulePage.tsx:95:          borderRadius: primitive.radius.lg,
packages/next-shell/src/ModulePage.tsx:96:          padding: primitive.space[4],
packages/next-shell/src/ModulePage.tsx:97:          background: themeVar.backgroundSecondary,
packages/next-shell/src/ModulePage.tsx:98:          fontSize: primitive.fontSize.sm,
packages/next-shell/src/ModulePage.tsx:99:          color: themeVar.textSecondary,
packages/next-shell/src/ModulePage.tsx:100:        }}
packages/next-shell/src/ModulePage.tsx:101:      >
packages/next-shell/src/ModulePage.tsx:102:        {/* Route and group ids only. The required permission name is
packages/next-shell/src/ModulePage.tsx:103:            deliberately NOT printed: the viewer already passed the filter to
packages/next-shell/src/ModulePage.tsx:104:            reach this page, so it tells them nothing they need, and publishing
packages/next-shell/src/ModulePage.tsx:105:            the permission taxonomy hands an attacker a map of the authorization
packages/next-shell/src/ModulePage.tsx:106:            model for free. */}
packages/next-shell/src/ModulePage.tsx:107:        <p style={{ margin: 0 }}>
packages/next-shell/src/ModulePage.tsx:108:          Route <code>{pathname}</code> · group <code>{group.id}</code> · item <code>{item.id}</code>
packages/next-shell/src/ModulePage.tsx:109:        </p>
packages/next-shell/src/ModulePage.tsx:110:      </section>
packages/next-shell/src/ModulePage.tsx:111:    </>
packages/next-shell/src/ModulePage.tsx:112:  );
packages/next-shell/src/ModulePage.tsx:113:}
rg: apps/admin-web/app/\[...slug\]/page.tsx: The system cannot find the path specified. (os error 3)

 succeeded in 1070ms:
1:-- ============================================================================
2:-- Tenant isolation proof.
3:--
4:-- This is the single most important test in the platform. Cross-tenant exposure
5:-- is a Severity-1 incident (docs/04-security/TENANT_ISOLATION.md), so the
6:-- isolation claim is PROVEN against a real database rather than asserted in a
7:-- document.
8:--
9:-- It runs as a non-superuser. Superusers bypass RLS entirely, so a "passing"
10:-- run as postgres would prove nothing at all.
11:--
12:-- Exit code 0 = isolation holds. Any raised exception = isolation is broken.
13:-- ============================================================================
14:
15:\set ON_ERROR_STOP on
16:
17:-- ── arrange: two tenants, each with an organization and a branch ────────────
18:-- NOTE: `current_role` is a RESERVED KEYWORD in PostgreSQL, so
19:--   SET LOCAL app.current_role = '...'
20:-- is a syntax error. set_config() is the only working form. This is the
21:-- same reason Solar's RLS seeding needed set_config().
22:-- `true` = transaction-local. psql runs each statement in its OWN implicit
23:-- transaction, so a transaction-local setting would evaporate before the very
24:-- next INSERT. Seeding therefore uses `false` (session-scoped).
25:--
26:-- The application does the opposite on purpose: it sets context with `true`
27:-- INSIDE the same transaction as the query, so a pooled connection cannot carry
28:-- one tenant's context into the next request. See tenantSessionStatements().
29:SELECT set_config('app.current_role', 'admin', false);  -- session-scoped, seeding only
30:
31:INSERT INTO identity.tenants (id, name, slug)
32:VALUES ('11111111-1111-1111-1111-111111111111', 'Tenant A', 'tenant-a'),
33:       ('22222222-2222-2222-2222-222222222222', 'Tenant B', 'tenant-b')
34:ON CONFLICT (slug) DO NOTHING;
35:
36:INSERT INTO identity.organizations (id, tenant_id, name, org_type)
37:VALUES ('aaaaaaaa-0000-0000-0000-000000000001',
38:        '11111111-1111-1111-1111-111111111111', 'Alpha Motors', 'individual_workshop'),
39:       ('bbbbbbbb-0000-0000-0000-000000000001',
40:        '22222222-2222-2222-2222-222222222222', 'Beta Auto',    'individual_workshop')
41:ON CONFLICT (id) DO NOTHING;
42:
43:INSERT INTO identity.branches (id, tenant_id, organization_id, name)
44:VALUES ('aaaaaaaa-0000-0000-0000-000000000002',
45:        '11111111-1111-1111-1111-111111111111',
46:        'aaaaaaaa-0000-0000-0000-000000000001', 'Alpha Accra'),
47:       ('bbbbbbbb-0000-0000-0000-000000000002',
48:        '22222222-2222-2222-2222-222222222222',
49:        'bbbbbbbb-0000-0000-0000-000000000001', 'Beta Kumasi')
50:ON CONFLICT (id) DO NOTHING;
51:
52:DO $$
53:DECLARE
54:    visible_orgs      int;
55:    visible_branches  int;
56:    leaked            int;
57:BEGIN
58:    -- ── act: become tenant A, with a non-admin role ─────────────────────────
59:    PERFORM set_config('app.current_role', 'workshop_owner', true);
60:    PERFORM set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
61:
62:    -- ── assert 1: tenant A sees exactly its own organization ────────────────
63:    SELECT count(*) INTO visible_orgs FROM identity.organizations;
64:    IF visible_orgs <> 1 THEN
65:        RAISE EXCEPTION 'ISOLATION BROKEN: tenant A sees % organizations, expected 1', visible_orgs;
66:    END IF;
67:
68:    -- ── assert 2: tenant A cannot see tenant B by direct id ─────────────────
69:    SELECT count(*) INTO leaked
70:    FROM identity.organizations
71:    WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001';
72:    IF leaked <> 0 THEN
73:        RAISE EXCEPTION 'ISOLATION BROKEN: tenant A read tenant B organization by id';
74:    END IF;
75:
76:    -- ── assert 3: branches are isolated too ─────────────────────────────────
77:    SELECT count(*) INTO visible_branches FROM identity.branches;
78:    IF visible_branches <> 1 THEN
79:        RAISE EXCEPTION 'ISOLATION BROKEN: tenant A sees % branches, expected 1', visible_branches;
80:    END IF;
81:
82:    -- ── assert 4: tenant A cannot WRITE into tenant B ───────────────────────
83:    -- WITH CHECK must reject this. If it succeeds, one tenant can plant rows
84:    -- inside another — worse than a read leak.
85:    BEGIN
86:        INSERT INTO identity.organizations (tenant_id, name, org_type)
87:        VALUES ('22222222-2222-2222-2222-222222222222', 'Injected', 'individual_workshop');
88:        RAISE EXCEPTION 'ISOLATION BROKEN: tenant A wrote a row into tenant B';
89:    EXCEPTION
90:        WHEN insufficient_privilege OR check_violation THEN
91:            NULL;  -- expected: the WITH CHECK clause refused it
92:    END;
93:
94:    -- ── assert 5: the other direction, to rule out a one-way policy bug ─────
95:    PERFORM set_config('app.tenant_id', '22222222-2222-2222-2222-222222222222', true);
96:    SELECT count(*) INTO leaked
97:    FROM identity.organizations
98:    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
99:    IF leaked <> 0 THEN
100:        RAISE EXCEPTION 'ISOLATION BROKEN: tenant B read tenant A organization';
101:    END IF;
102:
103:    -- ── assert 6: no tenant context = no rows, never all rows ───────────────
104:    -- Fail closed. A missing context must not silently mean "unrestricted".
105:    PERFORM set_config('app.tenant_id', '', true);
106:    SELECT count(*) INTO visible_orgs FROM identity.organizations;
107:    IF visible_orgs <> 0 THEN
108:        RAISE EXCEPTION 'FAIL-OPEN: no tenant context exposed % organizations', visible_orgs;
109:    END IF;
110:
111:    RAISE NOTICE 'TENANT ISOLATION: all 6 assertions passed';
112:END $$;
113:
114:-- ── audit log must be append-only ───────────────────────────────────────────
115:DO $$
116:DECLARE
117:    before_count int;
118:    after_count  int;
119:BEGIN
120:    INSERT INTO audit.events (action, actor_kind, result)
121:    VALUES ('rls.proof', 'system', 'success');
122:
123:    SELECT count(*) INTO before_count FROM audit.events WHERE action = 'rls.proof';
124:
125:    UPDATE audit.events SET action = 'tampered' WHERE action = 'rls.proof';
126:    DELETE FROM audit.events WHERE action = 'rls.proof';
127:
128:    SELECT count(*) INTO after_count FROM audit.events WHERE action = 'rls.proof';
129:
130:    IF after_count <> before_count THEN
131:        RAISE EXCEPTION 'AUDIT MUTABLE: % rows before, % after update+delete', before_count, after_count;
132:    END IF;
133:
134:    RAISE NOTICE 'AUDIT APPEND-ONLY: update and delete were both refused';
135:END $$;

 exited 1 in 1229ms:
rg: apps/api/src/**/*.spec.ts: The filename, directory name, or volume label syntax is incorrect. (os error 123)
rg: apps/api/src/**/**/*.spec.ts: The filename, directory name, or volume label syntax is incorrect. (os error 123)

2026-07-27T23:18:10.682909Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 1.2 seconds
Output:
rg: apps/api/src/**/*.spec.ts: The filename, directory name, or volume label syntax is incorrect. (os error 123)
rg: apps/api/src/**/**/*.spec.ts: The filename, directory name, or volume label syntax is incorrect. (os error 123)

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "." packages/auth/src/tokens.ts' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "." packages/auth/src/workspace-auth.ts' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "findByKeycloakSubject|queryWithoutTenant|membershipRow|fakeDb|RLS|no tenant|memberships" apps/api/src' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "renderModulePage|viewerGrants|page" apps/admin-web/app apps/workshop-web/app apps/customer-web/app apps/fleet-web/app apps/insurance-web/app apps/supplier-web/app apps/towing-web/app' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 1257ms:
1:import NextAuth, { type NextAuthResult } from 'next-auth';
2:import Keycloak from 'next-auth/providers/keycloak';
3:import { getToken } from 'next-auth/jwt';
4:import { headers } from 'next/headers';
5:import type { WorkspaceId } from '@autoworkshop/navigation';
6:import { apiBaseUrl, authSecret, clientIdForWorkspace, keycloakIssuer } from './config';
7:import {
8:  isExpired,
9:  refreshAccessToken,
10:  RefreshFailedError,
11:  type KeycloakTokenSet,
12:} from './tokens';
14:/**
15: * ONE Auth.js configuration, consumed by all seven Next apps.
16: *
17: * WHY A FACTORY AND NOT SEVEN `auth.ts` FILES. The apps differ by exactly one
18: * value — which Keycloak client they authenticate as — and that value is
19: * derivable from the workspace id. Seven copies of a token-refresh callback is
20: * seven chances for six of them to fall behind the seventh, which is the
21: * duplication root CLAUDE.md §0.3 forbids and the same reasoning that put the
22: * `next/link` adapter in `@autoworkshop/next-shell` instead of in every app.
23: *
24: * WHAT THE BROWSER GETS. The session cookie is an encrypted JWE, httpOnly, and
25: * the Keycloak tokens live inside it. The browser therefore holds the tokens in
26: * a form it cannot read — but that is not the whole story, because Auth.js
27: * serves whatever the `session` callback returns as JSON at
28: * `/api/auth/session`, to the browser, on request. **Anything placed on the
29: * session object is public to the client.** The tokens are deliberately left in
30: * the JWT and never copied onto the session; `getAccessToken()` below reads
31: * them back server-side.
32: *
33: * WHAT THIS IS NOT. A session proves who the viewer is. It authorises nothing:
34: * the API re-verifies the token's signature, issuer, audience and expiry on
35: * every call and resolves the tenant from membership records, and Postgres RLS
36: * denies underneath that. CLAUDE.md §5, §8.
37: */
39:/** What the browser is allowed to know about its own session. */
40:declare module 'next-auth' {
41:  interface Session {
42:    /**
43:     * Set when the refresh token stopped working. The UI uses it to send the
44:     * viewer back through sign-in rather than rendering a shell whose every
45:     * API call is about to 401.
46:     */
47:    error?: 'RefreshFailed';
48:  }
49:}
51:declare module 'next-auth/jwt' {
52:  interface JWT {
53:    keycloak?: KeycloakTokenSet;
54:    error?: 'RefreshFailed';
55:  }
56:}
58:export interface WorkspaceAuth {
59:  /** Mount at `app/api/auth/[...nextauth]/route.ts`. */
60:  handlers: NextAuthResult['handlers'];
61:  /** Read the session in a server component, route handler or middleware. */
62:  auth: NextAuthResult['auth'];
63:  signIn: NextAuthResult['signIn'];
64:  signOut: NextAuthResult['signOut'];
65:  /** The Keycloak client this workspace authenticates as. */
66:  clientId: string;
67:  /**
68:   * The current Keycloak ACCESS TOKEN, server-side only.
69:   *
70:   * Returns `null` when there is no session, or when the stored token has
71:   * expired. **Expired means null, never a refresh** — see the note on
72:   * `createWorkspaceAuth` about why refreshing here would break the session.
73:   * Callers must treat `null` as "unauthenticated" and fail closed.
74:   */
75:  getAccessToken: () => Promise<string | null>;
76:}
78:/**
79: * Build the Auth.js instance for one workspace.
80: *
81: * TOKEN REFRESH HAS EXACTLY ONE OWNER: the `jwt` callback below. That is not
82: * tidiness, it is forced by the realm — `revokeRefreshToken: true` with
83: * `refreshTokenMaxReuse: 0` means using a refresh token revokes it, so a second
84: * refresher would silently invalidate the session the first one just renewed.
85: * The failure surfaces minutes later as a spontaneous sign-out.
86: *
87: * The refreshed cookie is persisted by MIDDLEWARE, which is the only place in
88: * the App Router that both runs before a render and may set a cookie. A server
89: * component can run the callback but cannot write the result, so an app that
90: * skips the middleware will re-refresh on every render and persist none of it.
91: * `createAuthMiddleware()` exists so that is one import rather than a thing to
92: * remember.
93: */
94:export function createWorkspaceAuth(workspaceId: WorkspaceId | string): WorkspaceAuth {
95:  const clientId = clientIdForWorkspace(workspaceId);
97:  const result = NextAuth(() => ({
98:    // The config is a FUNCTION so the environment is read per request rather
99:    // than when Next collects this route during `next build` — otherwise the
100:    // build machine's realm and secret are baked into the deployed bundle.
101:    secret: authSecret(),
102:    session: { strategy: 'jwt' as const },
103:    /**
104:     * Accept the request's Host header when building callback URLs.
105:     *
106:     * WITHOUT THIS EVERY AUTH ENDPOINT RETURNS 500. Auth.js v5 refuses an
107:     * unrecognised host by default — `UntrustedHost: Host must be trusted` —
108:     * and it only auto-detects Vercel. Behind Render, a Cloudflare tunnel, a
109:     * reverse proxy, or plain `next start` on any port but the one it guessed,
110:     * `/api/auth/signin` and `/api/auth/session` fail while ordinary pages keep
111:     * returning 200. That asymmetry is why typecheck, lint, the unit suite and
112:     * a ten-target build were all green with sign-in completely broken.
113:     *
114:     * WHY TRUSTING THE HOST IS SAFE HERE, AND WHERE THE REAL CONTROL IS. The
115:     * host decides which absolute URL is sent to Keycloak as `redirect_uri`, so
116:     * a forged Host header is an attempt to have the authorization code
117:     * delivered somewhere else. Keycloak refuses that: each client carries an
118:     * explicit `redirectUris` allow-list, and a `redirect_uri` outside it is
119:     * rejected before any code is issued — the browser never leaves the login
120:     * page. The allow-list in `realm-autoworkshop.json` is therefore the
121:     * control, and it is a server-side one that no header can influence.
122:     *
123:     * KEEP THAT ALLOW-LIST TIGHT. It is currently `http://localhost:<port>/*`
124:     * plus the production hostnames. Widening it to a wildcard host would
125:     * remove the only thing making this setting safe.
126:     */
127:    trustHost: true,
128:    // Auth.js's own pages are fine; there is no branded sign-in screen yet and
129:    // a half-styled one would be worse than the default.
130:    providers: [
131:      Keycloak({
132:        clientId,
133:        /**
134:         * The realm. Auth.js discovers every endpoint from
135:         * `${issuer}/.well-known/openid-configuration`, so without it the
136:         * provider has no authorization, token or JWKS URL and every auth
137:         * route fails with `InvalidEndpoints: Provider "keycloak" is missing
138:         * both 'issuer' and 'authorization' endpoint config`.
139:         *
140:         * Ordinary pages keep returning 200 while this is wrong, because they
141:         * never touch the provider — only `/api/auth/*` and the middleware do.
142:         * That is the same asymmetry that hid the `trustHost` fault above, and
143:         * it is why this file is verified by starting the app and calling the
144:         * endpoints rather than by building it.
145:         *
146:         * Resolved per request from KEYCLOAK_URL + KEYCLOAK_REALM — the same
147:         * two variables, combined the same way, as the API's token validation.
148:         */
149:        issuer: keycloakIssuer(),
150:        // PUBLIC client with PKCE S256 — `realm-autoworkshop.json` defines all
151:        // seven browser clients that way, and the realm enforces the challenge
152:        // method through `pkce.code.challenge.method`. There is no secret to
153:        // send, so the token endpoint must not be given one; `none` says so
154:        // explicitly rather than letting Auth.js send an empty string, which
155:        // Keycloak rejects as a malformed client credential.
156:        //
157:        // A confidential client would authenticate the token exchange itself
158:        // and is the stronger option now that the exchange happens on the Next
159:        // server rather than in the browser. It is deliberately NOT changed
160:        // here: that is a realm change affecting seven clients plus seven
161:        // secrets, and it belongs in its own reviewed step, not folded into
162:        // the change that introduces sessions at all.
163:        client: { token_endpoint_auth_method: 'none' },
164:        checks: ['pkce', 'state'],
165:      }),
166:    ],
167:    callbacks: {
168:      async jwt({ token, account }) {
169:        // First call after a successful sign-in: `account` carries the tokens.
170:        if (account) {
171:          token.keycloak = {
172:            accessToken: account.access_token as string,
173:            refreshToken: account.refresh_token as string | undefined,
174:            // `expires_at` is epoch SECONDS and may be absent; deriving it from
175:            // `expires_in` keeps the unit consistent either way.
176:            expiresAt:
177:              (account.expires_at as number | undefined) ??
178:              Math.floor(Date.now() / 1000) + ((account.expires_in as number | undefined) ?? 300),
179:            idToken: account.id_token as string | undefined,
180:          };
181:          delete token.error;
182:          return token;
183:        }
185:        const current = token.keycloak;
186:        if (!current) return token;
187:        if (!isExpired(current)) return token;
189:        if (!current.refreshToken) {
190:          // Nothing to refresh with. Marking the token rather than clearing it
191:          // keeps the viewer's identity readable for the sign-in prompt.
192:          token.error = 'RefreshFailed';
193:          return token;
194:        }
196:        try {
197:          token.keycloak = await refreshAccessToken(clientId, current.refreshToken);
198:          delete token.error;
199:        } catch (err) {
200:          // Do NOT rethrow: an exception here fails the whole request, taking
201:          // out pages that need no API call at all. Fail closed instead — the
202:          // token is marked, `getAccessToken()` still returns null once it
203:          // expires, and the viewer resolves to no grants.
204:          if (!(err instanceof RefreshFailedError)) throw err;
205:          token.error = 'RefreshFailed';
206:        }
207:        return token;
208:      },
210:      // Everything returned here is served to the browser at
211:      // `/api/auth/session`. Tokens are absent from this object ON PURPOSE.
212:      async session({ session, token }) {
213:        if (token.error) session.error = token.error;
214:        return session;
215:      },
216:    },
217:  }));
219:  return {
220:    handlers: result.handlers,
221:    auth: result.auth,
222:    signIn: result.signIn,
223:    signOut: result.signOut,
224:    clientId,
225:    async getAccessToken() {
226:      // Reads the cookie directly rather than going through `auth()`, because
227:      // `auth()` returns the SESSION and the session deliberately has no
228:      // tokens on it.
229:      const req = { headers: await headers() };
230:      const secureCookie = process.env['NODE_ENV'] === 'production';
232:      // IS THERE A SESSION AT ALL? Asked FIRST, and without the secret.
233:      //
234:      // `authSecret()` throws when AUTH_SECRET is unset, and this function runs
235:      // on every render of every page. Demanding the secret up front would make
236:      // an app with no auth configured fail every route with a 500 — including
237:      // for a visitor who has no session and needs none, which is every visitor
238:      // to a signed-out page and every page the Playwright suite loads.
239:      //
240:      // `raw: true` returns the cookie's contents undecrypted, and `getToken`
241:      // checks for the cookie before it checks for a secret. So: no cookie, no
242:      // session, no secret required. A cookie that IS present must be
243:      // decryptable, and if the secret is missing then the throw below is the
244:      // correct outcome — that is a real misconfiguration, not a signed-out user.
245:      const rawToken = await getToken({ req, secret: '', secureCookie, raw: true });
246:      if (!rawToken) return null;
248:      // `getToken` decrypts the JWT with the same secret; the salt defaults to
249:      // the cookie name, which is why `secureCookie` must match how the cookie
250:      // was written or decryption silently returns null.
251:      const token = await getToken({
252:        req,
253:        secret: authSecret(),
254:        secureCookie,
255:      });
257:      const keycloak = token?.keycloak;
258:      if (!keycloak) return null;
259:      // Expired is not refreshed here — see the header note. A caller that
260:      // receives null must behave as unauthenticated.
261:      if (isExpired(keycloak, Math.floor(Date.now() / 1000), 0)) return null;
262:      return keycloak.accessToken;
263:    },
264:  };
265:}
267:/**
268: * The one instance per workspace.
269: *
270: * `createWorkspaceAuth` builds a NextAuth instance; calling it per request would
271: * build a new provider, a new cookie configuration and a new set of callbacks
272: * on every render. More importantly the app's route handler and the shell's
273: * viewer resolution MUST agree on the cookie name and secret, and the surest
274: * way for them to agree is to be the same object.
275: */
276:const instances = new Map<string, WorkspaceAuth>();
278:export function workspaceAuth(workspaceId: WorkspaceId | string): WorkspaceAuth {
279:  let existing = instances.get(workspaceId);
280:  if (!existing) {
281:    existing = createWorkspaceAuth(workspaceId);
282:    instances.set(workspaceId, existing);
283:  }
284:  return existing;
285:}
287:/**
288: * The URL that ends the KEYCLOAK session, not just the local cookie.
289: *
290: * `signOut()` clears this app's cookie and nothing else. The Keycloak SSO
291: * session outlives it, so the next sign-in completes silently and the viewer
292: * appears never to have been signed out — which on a shared workshop terminal
293: * is the whole point of signing out.
294: *
295: * `id_token_hint` is what lets Keycloak end the session without an interstitial
296: * "do you want to log out?" confirmation.
297: */
298:export function keycloakSignOutUrl(idToken: string | undefined, postLogoutRedirect: string): string {
299:  const url = new URL(`${keycloakIssuer()}/protocol/openid-connect/logout`);
300:  if (idToken) url.searchParams.set('id_token_hint', idToken);
301:  url.searchParams.set('post_logout_redirect_uri', postLogoutRedirect);
302:  return url.toString();
303:}
305:/** Re-exported so callers need one import to reach the API. */
306:export { apiBaseUrl };

 succeeded in 1429ms:
1:import { keycloakIssuer } from './config';
3:/**
4: * The Keycloak tokens carried by a session.
5: *
6: * Kept separate from Auth.js's own types so the refresh logic below is a plain
7: * function over plain data and can be tested without standing up a provider,
8: * a request, or a cookie.
9: */
10:export interface KeycloakTokenSet {
11:  accessToken: string;
12:  /**
13:   * Absent when Keycloak declined to issue one. Treated as "cannot refresh"
14:   * rather than "refresh with undefined", which would send the string
15:   * "undefined" to the token endpoint and get a 400 that reads like a
16:   * credential fault.
17:   */
18:  refreshToken?: string;
19:  /** Absolute expiry in epoch SECONDS — the unit Keycloak's `exp` uses. */
20:  expiresAt: number;
21:  /** Needed at sign-out: Keycloak's end-session endpoint wants `id_token_hint`. */
22:  idToken?: string;
23:}
25:/**
26: * Refresh a little BEFORE expiry, not at it.
27: *
28: * The realm issues 300-second access tokens. A token that is valid when the
29: * server component starts rendering can be expired by the time the `/me` call
30: * reaches the API, and the failure is a 401 on a page that had a perfectly good
31: * session a moment earlier. Thirty seconds covers request latency and modest
32: * clock skew between this host and Keycloak.
33: */
34:export const REFRESH_SKEW_SECONDS = 30;
36:export function isExpired(
37:  tokenSet: Pick<KeycloakTokenSet, 'expiresAt'>,
38:  nowSeconds: number = Math.floor(Date.now() / 1000),
39:  skewSeconds: number = REFRESH_SKEW_SECONDS,
40:): boolean {
41:  return nowSeconds >= tokenSet.expiresAt - skewSeconds;
42:}
44:/** Raised when a refresh cannot succeed and the user must sign in again. */
45:export class RefreshFailedError extends Error {
46:  constructor(message: string) {
47:    super(message);
48:    this.name = 'RefreshFailedError';
49:  }
50:}
52:interface TokenEndpointResponse {
53:  access_token?: string;
54:  refresh_token?: string;
55:  id_token?: string;
56:  expires_in?: number;
57:  error?: string;
58:  error_description?: string;
59:}
61:/**
62: * Exchange a refresh token for a fresh access token.
63: *
64: * ⚠️ THE REALM ROTATES REFRESH TOKENS. `realm-autoworkshop.json` sets
65: * `revokeRefreshToken: true` with `refreshTokenMaxReuse: 0`, so the token
66: * presented here is revoked the instant this call succeeds and the response's
67: * NEW refresh token is the only usable one. Two consequences that are easy to
68: * get wrong:
69: *
70: *   · the caller must persist `refreshToken` from the result — keeping the old
71: *     one turns the next refresh into a hard sign-out, roughly five minutes
72: *     later, which is far enough from the cause to look unrelated;
73: *   · two concurrent refreshes with the same token cannot both win. The loser
74: *     gets `invalid_grant`. Auth.js serialises this per request, but a caller
75: *     that fans out must not.
76: *
77: * No client secret is sent: these are PUBLIC clients (PKCE S256), so the token
78: * endpoint authenticates the request by the refresh token alone.
79: */
80:export async function refreshAccessToken(
81:  clientId: string,
82:  refreshToken: string,
83:  fetchImpl: typeof fetch = fetch,
84:): Promise<KeycloakTokenSet> {
85:  const response = await fetchImpl(`${keycloakIssuer()}/protocol/openid-connect/token`, {
86:    method: 'POST',
87:    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
88:    body: new URLSearchParams({
89:      grant_type: 'refresh_token',
90:      client_id: clientId,
91:      refresh_token: refreshToken,
92:    }),
93:  });
95:  const payload = (await response.json().catch(() => ({}))) as TokenEndpointResponse;
97:  if (!response.ok || !payload.access_token) {
98:    // `error_description` is Keycloak's own text ("Token is not active", say).
99:    // It describes the grant, not the user, so it is safe to surface into a
100:    // server log — and without it every refresh failure looks identical.
101:    throw new RefreshFailedError(
102:      payload.error_description ?? payload.error ?? `token endpoint returned ${response.status}`,
103:    );
104:  }
106:  return {
107:    accessToken: payload.access_token,
108:    // Fall back to the presented token only if Keycloak returned none. With
109:    // rotation on it always does; without this the field would silently become
110:    // undefined on a realm configured differently.
111:    refreshToken: payload.refresh_token ?? refreshToken,
112:    expiresAt: Math.floor(Date.now() / 1000) + (payload.expires_in ?? 300),
113:    idToken: payload.id_token,
114:  };
115:}

 succeeded in 1380ms:
apps/customer-web/app\[...slug]\page.tsx:1:import { renderModulePage, viewerGrants } from '@autoworkshop/next-shell';
apps/customer-web/app\[...slug]\page.tsx:7: * own `app/<group>/<item>/page.tsx`, which Next resolves ahead of this.
apps/customer-web/app\[...slug]\page.tsx:13:  return renderModulePage('customer', slug, await viewerGrants('customer'));
apps/customer-web/app\page.tsx:4: * §18: "The Dashboard shall be the default landing page for each workspace."
apps/customer-web/app\page.tsx:6: * rendering the same page is how breadcrumbs and active-nav highlighting start
apps/admin-web/app\[...slug]\page.tsx:1:import { renderModulePage, viewerGrants } from '@autoworkshop/next-shell';
apps/admin-web/app\[...slug]\page.tsx:7: * own `app/<group>/<item>/page.tsx`, which Next resolves ahead of this.
apps/admin-web/app\[...slug]\page.tsx:13:  return renderModulePage('admin', slug, await viewerGrants('admin'));
apps/admin-web/app\page.tsx:4: * §18: "The Dashboard shall be the default landing page for each workspace."
apps/admin-web/app\page.tsx:6: * rendering the same page is how breadcrumbs and active-nav highlighting start
apps/workshop-web/app\[...slug]\page.tsx:1:import { renderModulePage, viewerGrants } from '@autoworkshop/next-shell';
apps/workshop-web/app\[...slug]\page.tsx:7: * own `app/<group>/<item>/page.tsx`, which Next resolves ahead of this.
apps/workshop-web/app\[...slug]\page.tsx:13:  return renderModulePage('workshop', slug, await viewerGrants('workshop'));
apps/workshop-web/app\page.tsx:4: * §18: "The Dashboard shall be the default landing page for each workspace."
apps/workshop-web/app\page.tsx:6: * rendering the same page is how breadcrumbs and active-nav highlighting start
apps/towing-web/app\[...slug]\page.tsx:1:import { renderModulePage, viewerGrants } from '@autoworkshop/next-shell';
apps/towing-web/app\[...slug]\page.tsx:7: * own `app/<group>/<item>/page.tsx`, which Next resolves ahead of this.
apps/towing-web/app\[...slug]\page.tsx:13:  return renderModulePage('towing', slug, await viewerGrants('towing'));
apps/towing-web/app\page.tsx:4: * §18: "The Dashboard shall be the default landing page for each workspace."
apps/towing-web/app\page.tsx:6: * rendering the same page is how breadcrumbs and active-nav highlighting start
apps/workshop-web/app\home\dashboard\page.tsx:7: * Everything this page says about the navigation is COMPUTED from the model it
apps/workshop-web/app\home\dashboard\page.tsx:11: * when the demo grants were narrowed. A page whose job is to explain the system
apps/workshop-web/app\home\dashboard\page.tsx:42:     * This page's own title, taken from the navigation entry that points at it.
apps/workshop-web/app\home\dashboard\page.tsx:44:     * A concrete `page.tsx` takes precedence over the catch-all, so this route
apps/workshop-web/app\home\dashboard\page.tsx:52:    pageTitle:
apps/workshop-web/app\home\dashboard\page.tsx:59: * Workshop dashboard — §18, the default landing page for the workspace.
apps/workshop-web/app\home\dashboard\page.tsx:103:        title={nav.pageTitle}
apps/workshop-web/app\home\dashboard\page.tsx:148:                by then correctly hidden. A page that explains the permission
apps/workshop-web/app\home\dashboard\page.tsx:183:            <strong>Page content is not built yet.</strong> Every other route renders an honest “not built” page
apps/insurance-web/app\[...slug]\page.tsx:1:import { renderModulePage, viewerGrants } from '@autoworkshop/next-shell';
apps/insurance-web/app\[...slug]\page.tsx:7: * own `app/<group>/<item>/page.tsx`, which Next resolves ahead of this.
apps/insurance-web/app\[...slug]\page.tsx:13:  return renderModulePage('insurance', slug, await viewerGrants('insurance'));
apps/insurance-web/app\page.tsx:4: * §18: "The Dashboard shall be the default landing page for each workspace."
apps/insurance-web/app\page.tsx:6: * rendering the same page is how breadcrumbs and active-nav highlighting start
apps/supplier-web/app\[...slug]\page.tsx:1:import { renderModulePage, viewerGrants } from '@autoworkshop/next-shell';
apps/supplier-web/app\[...slug]\page.tsx:7: * own `app/<group>/<item>/page.tsx`, which Next resolves ahead of this.
apps/supplier-web/app\[...slug]\page.tsx:13:  return renderModulePage('supplier', slug, await viewerGrants('supplier'));
apps/supplier-web/app\page.tsx:4: * §18: "The Dashboard shall be the default landing page for each workspace."
apps/supplier-web/app\page.tsx:6: * rendering the same page is how breadcrumbs and active-nav highlighting start
apps/fleet-web/app\[...slug]\page.tsx:1:import { renderModulePage, viewerGrants } from '@autoworkshop/next-shell';
apps/fleet-web/app\[...slug]\page.tsx:7: * own `app/<group>/<item>/page.tsx`, which Next resolves ahead of this.
apps/fleet-web/app\[...slug]\page.tsx:13:  return renderModulePage('fleet', slug, await viewerGrants('fleet'));
apps/fleet-web/app\page.tsx:4: * §18: "The Dashboard shall be the default landing page for each workspace."
apps/fleet-web/app\page.tsx:6: * rendering the same page is how breadcrumbs and active-nav highlighting start

 succeeded in 1486ms:
apps/api/src\database\database.service.ts:12: * The application connects as `autoworkshop_app` — a NOSUPERUSER, NOBYPASSRLS
apps/api/src\database\database.service.ts:15: * bootstrap role would leave every RLS policy present and none of them applied.
apps/api/src\database\database.service.ts:33:          'connect as autoworkshop_app (NOSUPERUSER, NOBYPASSRLS) or row-level ' +
apps/api/src\database\database.service.ts:79:   * ledger reads. RLS still applies; with no tenant context set, policies
apps/api/src\database\database.service.ts:82:  async queryWithoutTenant<T = unknown>(
apps/api/src\database\database.integration.spec.ts:6: * Integration proof that withTenant()'s mechanism actually enforces RLS.
apps/api/src\database\database.integration.spec.ts:82:describe('DatabaseService.withTenant — RLS enforcement (integration)', () => {
apps/api/src\database\database.integration.spec.ts:83:  it('the application role is NOT a superuser and cannot bypass RLS', async () => {
apps/api/src\database\database.integration.spec.ts:88:    // If either is true, every RLS policy in the system is decorative.
apps/api/src\database\database.integration.spec.ts:113:    // later borrow must start with no tenant context at all.
apps/api/src\database\database.integration.spec.ts:124:  it('FAILS CLOSED: no tenant context returns zero rows, never all rows', async () => {
apps/api/src\identity\user.service.ts:23: * explicitly: one human may hold memberships in several tenants, so the user
apps/api/src\identity\user.service.ts:27: * codebase: **RLS will not save you here.** A plain
apps/api/src\identity\user.service.ts:33: * `identity.memberships`, which IS under `ENABLE` + `FORCE ROW LEVEL SECURITY`.
apps/api/src\identity\user.service.ts:63:           FROM identity.memberships m
apps/api/src\identity\user.service.ts:76:   * Driving from `memberships` rather than from `users` is what makes this
apps/api/src\identity\user.service.ts:91:           FROM identity.memberships m
apps/api/src\identity\organization.service.ts:34:      // No explicit tenant filter is written here — RLS applies it. The
apps/api/src\identity\organization.service.ts:56:        // A row in another tenant is invisible under RLS, so this is a 404 and
apps/api/src\identity\identity.spec.ts:14: * They deliberately do NOT re-test row-level security. RLS is proven against a
apps/api/src\identity\identity.spec.ts:37:function fakeDb(rows: unknown[] = [], rowsFor?: (text: string) => unknown[] | undefined) {
apps/api/src\identity\identity.spec.ts:68:const membershipRow = {
apps/api/src\identity\identity.spec.ts:80:    const { db } = fakeDb();
apps/api/src\identity\identity.spec.ts:90:    const { db, queries } = fakeDb([branchRow]);
apps/api/src\identity\identity.spec.ts:101:    const { db } = fakeDb([branchRow]);
apps/api/src\identity\identity.spec.ts:113:    // The FK references organizations(id) alone and RLS WITH CHECK validates
apps/api/src\identity\identity.spec.ts:116:    // it: under FORCE RLS a foreign organization is invisible and returns no
apps/api/src\identity\identity.spec.ts:118:    const { db, queries } = fakeDb([], (text) =>
apps/api/src\identity\identity.spec.ts:130:    const { db } = fakeDb([]);
apps/api/src\identity\identity.spec.ts:136:describe('UserService — the directory must be scoped by MEMBERSHIP, not by RLS', () => {
apps/api/src\identity\identity.spec.ts:148:   * `identity.memberships`, which IS under FORCE RLS, and joining outward.
apps/api/src\identity\identity.spec.ts:152:  it('every user query starts FROM identity.memberships and joins to users', async () => {
apps/api/src\identity\identity.spec.ts:153:    const { db, queries } = fakeDb([]);
apps/api/src\identity\identity.spec.ts:161:        /FROM\s+identity\.memberships\s+m/i.test(q.text),
apps/api/src\identity\identity.spec.ts:162:        `a user query did not start from memberships and is therefore unscoped:\n${q.text}`,
apps/api/src\identity\identity.spec.ts:166:        `a user query selected directly FROM identity.users, which has NO RLS:\n${q.text}`,
apps/api/src\identity\identity.spec.ts:172:    const { db } = fakeDb([]);
apps/api/src\identity\identity.spec.ts:180:    const { db } = fakeDb();
apps/api/src\identity\identity.spec.ts:194:    const { db } = fakeDb();
apps/api/src\identity\identity.spec.ts:205:    const { db } = fakeDb();
apps/api/src\identity\identity.spec.ts:227:      const { db } = fakeDb([{ ...membershipRow, role_name: roleName }]);
apps/api/src\identity\identity.spec.ts:236:    const { db, queries } = fakeDb([], (text) =>
apps/api/src\identity\identity.spec.ts:237:      /FROM identity\.organizations/.test(text) ? [] : [membershipRow],
apps/api/src\identity\identity.spec.ts:247:    expect(queries.some((q) => /INSERT INTO identity\.memberships/.test(q.text))).toBe(false);
apps/api/src\identity\identity.spec.ts:254:    const { db, queries } = fakeDb([], (text) => {
apps/api/src\identity\identity.spec.ts:257:      return [membershipRow];
apps/api/src\identity\identity.spec.ts:268:    expect(queries.some((q) => /INSERT INTO identity\.memberships/.test(q.text))).toBe(false);
apps/api/src\identity\identity.spec.ts:277:    const { db } = fakeDb([], (text) =>
apps/api/src\identity\identity.spec.ts:278:      /INSERT INTO identity\.memberships/.test(text) ? [] : [{ '?column?': 1 }],
apps/api/src\identity\identity.spec.ts:287:    const { db } = fakeDb([membershipRow]);
apps/api/src\identity\identity.spec.ts:302:    const { db, queries } = fakeDb([{ ...membershipRow, status: 'revoked' }]);
apps/api/src\identity\identity.spec.ts:307:    const update = queries.find((q) => /UPDATE identity\.memberships/.test(q.text));
apps/api/src\identity\identity.spec.ts:323:    const { db, queries } = fakeDb([membershipRow]);
apps/api/src\identity\identity.spec.ts:331:    expect(queries.some((q) => /UPDATE identity\.memberships/.test(q.text))).toBe(false);
apps/api/src\identity\identity.spec.ts:338:    const { db } = fakeDb([membershipRow]);
apps/api/src\identity\identity.spec.ts:346:    const { db } = fakeDb();
apps/api/src\identity\membership.service.ts:73: * `identity.memberships` is tenant-scoped and under `ENABLE` + `FORCE ROW LEVEL
apps/api/src\identity\membership.service.ts:75: * RLS cannot express — who may grant, which roles exist, and that nobody may
apps/api/src\identity\membership.service.ts:99:           FROM identity.memberships
apps/api/src\identity\membership.service.ts:143:      // tenant predicate — and RLS `WITH CHECK` validates the `tenant_id` of
apps/api/src\identity\membership.service.ts:150:      // Both lookups work because those tables are under FORCE RLS: a row in
apps/api/src\identity\membership.service.ts:171:        `INSERT INTO identity.memberships
apps/api/src\identity\membership.service.ts:177:          // From the resolved context, never the request body. RLS `WITH CHECK`
apps/api/src\identity\membership.service.ts:249:        `UPDATE identity.memberships
apps/api/src\identity\membership.service.ts:258:        // Either it is not in this tenant (RLS hid it) or it was not active.
apps/api/src\identity\membership.repository.ts:20:  async findByKeycloakSubject(subject: string): Promise<{
apps/api/src\identity\membership.repository.ts:22:    memberships: ValidatedMembership[];
apps/api/src\identity\membership.repository.ts:24:    const rows = await this.db.queryWithoutTenant<{
apps/api/src\identity\membership.repository.ts:39:    LEFT JOIN identity.memberships m ON m.user_id = u.id
apps/api/src\identity\membership.repository.ts:48:    const memberships = rows
apps/api/src\identity\membership.repository.ts:58:    return { userId, memberships };
apps/api/src\identity\identity.controllers.ts:72:@Controller('memberships')
apps/api/src\identity\identity.controllers.ts:75:  constructor(private readonly memberships: MembershipService) {}
apps/api/src\identity\identity.controllers.ts:83:    return this.memberships.list(req.tenantContext, { userId, organizationId });
apps/api/src\identity\identity.controllers.ts:91:    return this.memberships.grant(req.tenantContext, body);
apps/api/src\identity\identity.controllers.ts:105:    return this.memberships.withdraw(req.tenantContext, id, body.status);
apps/api/src\identity\me.service.ts:26:  memberships: ViewerMembership[];
apps/api/src\identity\me.service.ts:44: * it and requests a gated route still meets the API's own role checks and RLS,
apps/api/src\identity\me.service.ts:53:      // The profile, reached THROUGH memberships rather than from
apps/api/src\identity\me.service.ts:54:      // `identity.users` directly — that table has no RLS, so a bare select
apps/api/src\identity\me.service.ts:58:           FROM identity.memberships m
apps/api/src\identity\me.service.ts:66:      // need. RLS scopes this to the current tenant; a user's memberships in
apps/api/src\identity\me.service.ts:69:      const memberships = await client.query(
apps/api/src\identity\me.service.ts:75:           FROM identity.memberships m
apps/api/src\identity\me.service.ts:99:        memberships: memberships.rows.map((m: {
apps/api/src\authz\permission-matrix.ts:27: * Enforcement is the API's own role checks plus Postgres RLS, which deny
apps/api/src\authz\permission-matrix.ts:46: * Role names are the `identity.memberships.role_name` values accepted by
apps/api/src\identity\branch.service.ts:82:        // invisible under RLS, and answering 403 would confirm the id exists,
apps/api/src\identity\branch.service.ts:108:      // foreign key cannot carry a tenant predicate. RLS `WITH CHECK` validates
apps/api/src\identity\branch.service.ts:116:      // IS under FORCE RLS: an organization in another tenant is invisible
apps/api/src\identity\branch.service.ts:129:      // body. The RLS `WITH CHECK` clause would reject a mismatched value
apps/api/src\tenancy\tenant-context.spec.ts:22:      memberships: [membership()],
apps/api/src\tenancy\tenant-context.spec.ts:33:        memberships: [membership({ status: 'revoked' })],
apps/api/src\tenancy\tenant-context.spec.ts:39:  it('refuses to guess when several memberships exist and none was selected', () => {
apps/api/src\tenancy\tenant-context.spec.ts:43:        memberships: [membership(), membership({ organizationId: 'org-2' })],
apps/api/src\tenancy\tenant-context.spec.ts:46:    ).toThrow(/multiple memberships/);
apps/api/src\tenancy\tenant-context.spec.ts:55:        memberships: [membership()],
apps/api/src\tenancy\tenant-context.spec.ts:59:    ).toThrow(/not among the user active memberships/);
apps/api/src\tenancy\tenant-context.spec.ts:62:  it('SECURITY: a client-supplied org can only select among proven memberships', () => {
apps/api/src\tenancy\tenant-context.spec.ts:65:      memberships: [
apps/api/src\tenancy\tenant-context.spec.ts:80:        memberships: [membership()],
apps/api/src\tenancy\tenant-context.ts:48: * is only ever used to SELECT among memberships the server already proved the
apps/api/src\tenancy\tenant-context.ts:54:  memberships: readonly ValidatedMembership[];
apps/api/src\tenancy\tenant-context.ts:58:  const { userId, memberships, requestedOrganizationId, correlationId } = params;
apps/api/src\tenancy\tenant-context.ts:60:  const active = memberships.filter((m) => m.status === 'active');
apps/api/src\tenancy\tenant-context.ts:74:        'requested organization is not among the user active memberships',
apps/api/src\tenancy\tenant-context.ts:81:      'user holds multiple memberships and no organization was selected',
apps/api/src\tenancy\tenant-context.ts:111: * so PostgreSQL RLS becomes the final backstop.
apps/api/src\auth\tenant.guard.ts:27: *   2. look up memberships by the token SUBJECT
apps/api/src\auth\tenant.guard.ts:28: *   3. resolve exactly one active tenant context from those memberships
apps/api/src\auth\tenant.guard.ts:32: * used only to select among memberships the server has already proved the user
apps/api/src\auth\tenant.guard.ts:41:    private readonly memberships: MembershipRepository,
apps/api/src\auth\tenant.guard.ts:54:    const record = await this.memberships.findByKeycloakSubject(verified.subject);
apps/api/src\auth\tenant.guard.ts:72:        memberships: record.memberships,

codex
The catch-all hidden-route guard is present, but concrete pages bypass it because Next resolves them first. The workshop dashboard is a concrete page, so I’m reading it and the middleware to see whether an unauthenticated or wrong-role user can still fetch backend-rendered route content.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "api/v1|setGlobalPrefix|enableCors|helmet|cookie|csrf" apps/api/src apps/*-web/app apps/*-web/middleware.ts packages' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "." apps/workshop-web/middleware.ts apps/admin-web/middleware.ts packages/auth/src/index.ts' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"signOut\\(|keycloakSignOutUrl|logout|idToken|refreshToken\" apps packages -g \"*.tsx\" -g \"*.ts\"" in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "." apps/workshop-web/app/home/dashboard/page.tsx' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 980ms:
1:import { PageHeader, StatusBadge } from '@autoworkshop/ui';
2:import { themeVar, primitive } from '@autoworkshop/design-tokens';
3:import { currentViewer, grantsFor, navRoleFor } from '@autoworkshop/next-shell';
4:import { getWorkspace, visibleGroups, workspaceForRole } from '@autoworkshop/navigation';
5:
6:/**
7: * Everything this page says about the navigation is COMPUTED from the model it
8: * is describing, never restated. Both facts below were previously written out
9: * by hand and both went false the moment the model changed — the group/item
10: * counts when T-0027 introduced per-role trees, and the granted-permission list
11: * when the demo grants were narrowed. A page whose job is to explain the system
12: * has to read the system.
13: *
14: * ⚠️ THIS RUNS PER REQUEST AND MUST NOT MOVE BACK TO MODULE SCOPE.
15: *
16: * Every value below used to be a module-level `const`. That worked only while
17: * the viewer was a hardcoded demo: module scope is evaluated ONCE, when Next
18: * first loads the route, so with a real session the first visitor's role and
19: * grants would have been baked in and served to every subsequent visitor —
20: * including a signed-out one, and including across users. A dashboard that
21: * describes somebody else's permissions is worse than one that describes none.
22: *
23: * The `!` on `getWorkspace('workshop')` is safe for the same reason it always
24: * was: this file only exists inside the workshop app.
25: */
26:const THIS_ROUTE = '/home/dashboard';
27:
28:async function describeNavigation() {
29:  const viewer = await currentViewer('workshop');
30:  const role = navRoleFor(viewer?.activeRole);
31:  const visible = visibleGroups(
32:    workspaceForRole(getWorkspace('workshop')!, role),
33:    grantsFor(viewer),
34:  );
35:
36:  return {
37:    grants: grantsFor(viewer),
38:    groupCount: visible.length,
39:    itemCount: visible.reduce((n, g) => n + g.items.length, 0),
40:    roleLabel: role ? `${role} role` : 'workspace default',
41:    /**
42:     * This page's own title, taken from the navigation entry that points at it.
43:     *
44:     * A concrete `page.tsx` takes precedence over the catch-all, so this route
45:     * is the one place where the header text is written by hand instead of
46:     * being derived from the nav item — and it promptly disagreed with it: the
47:     * technician tree calls `/home/dashboard` "Technician Dashboard" while the
48:     * header said "Workshop Dashboard", so the menu, the breadcrumb and the
49:     * heading named the same screen three ways. Reading the label from the
50:     * model removes the second source rather than syncing it.
51:     */
52:    pageTitle:
53:      visible.flatMap((g) => g.items).find((i) => i.href === THIS_ROUTE)?.label ??
54:      'Workshop Dashboard',
55:  };
56:}
57:
58:/**
59: * Workshop dashboard — §18, the default landing page for the workspace.
60: *
61: * The figures below are DEMO DATA and are labelled as such on screen. Phase 5
62: * replaces them with real job-card and staging-board queries. Labelling fake
63: * numbers is not decoration: an unlabelled demo dashboard is indistinguishable
64: * from a real one that is silently returning wrong figures.
65: */
66:
67:const tiles = [
68:  { label: 'Active job cards', value: 12, kind: 'active' as const, hint: 'On the staging board now' },
69:  { label: 'Awaiting approval', value: 2, kind: 'attention' as const, hint: 'Customer proposals pending' },
70:  { label: 'New complaints', value: 4, kind: 'attention' as const, hint: 'Received today' },
71:  { label: 'Ready for collection', value: 3, kind: 'complete' as const, hint: 'Passed quality control' },
72:  { label: 'Reorder alerts', value: 2, kind: 'blocked' as const, hint: 'Parts below minimum stock' },
73:  { label: 'Appointments today', value: 6, kind: 'active' as const, hint: 'Across 4 service bays' },
74:];
75:
76:function Tile({ label, value, kind, hint }: (typeof tiles)[number]) {
77:  return (
78:    <div
79:      style={{
80:        border: `1px solid ${themeVar.borderDefault}`,
81:        borderRadius: primitive.radius.lg,
82:        padding: primitive.space[4],
83:        background: themeVar.surfaceRaised,
84:        display: 'flex',
85:        flexDirection: 'column',
86:        gap: primitive.space[2],
87:      }}
88:    >
89:      <span style={{ fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>{label}</span>
90:      <span style={{ fontSize: primitive.fontSize['3xl'], fontWeight: 600, color: themeVar.textPrimary }}>{value}</span>
91:      {/* Colour is never the only signal (§66) — every tile carries a text label too. */}
92:      <StatusBadge kind={kind} label={hint} />
93:    </div>
94:  );
95:}
96:
97:export default async function Dashboard() {
98:  const nav = await describeNavigation();
99:
100:  return (
101:    <>
102:      <PageHeader
103:        title={nav.pageTitle}
104:        description="Today at Demo Motors Ltd — Accra Main"
105:        actions={<StatusBadge kind="draft" label="Demo data — not yet wired to the API" />}
106:      />
107:
108:      <section
109:        aria-label="Key figures"
110:        style={{
111:          display: 'grid',
112:          gridTemplateColumns: 'repeat(auto-fill, minmax(15rem, 1fr))',
113:          gap: primitive.space[4],
114:        }}
115:      >
116:        {tiles.map((t) => (
117:          <Tile key={t.label} {...t} />
118:        ))}
119:      </section>
120:
121:      <section
122:        aria-label="About this build"
123:        style={{
124:          border: `1px solid ${themeVar.borderDefault}`,
125:          borderRadius: primitive.radius.lg,
126:          padding: primitive.space[4],
127:          background: themeVar.backgroundSecondary,
128:        }}
129:      >
130:        <h2 style={{ margin: 0, fontSize: primitive.fontSize.lg, color: themeVar.textPrimary }}>
131:          What is real in this build
132:        </h2>
133:        <ul style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm, lineHeight: 1.7 }}>
134:          <li>
135:            {/* DERIVED for the same reason as the permissions line below: the
136:                counts used to be written out as "11 groups, 55 items" and went
137:                wrong the moment T-0027 gave this workspace a per-role tree. */}
138:            <strong>Navigation is real and complete.</strong> Every group and item is transcribed from the
139:            approved specification — <code>autoworkshop 01 (1).txt</code> §34 for the workspace, and{' '}
140:            <code>autoworkshop 07.txt</code> part 2 §46–§49 for the four workshop roles. You are seeing the{' '}
141:            <strong>{nav.roleLabel}</strong> navigation: {nav.groupCount} groups, {nav.itemCount} items.
142:            Expand, collapse, search the menu, and collapse the whole sidebar from the ☰ button.
143:          </li>
144:          <li>
145:            {/* DERIVED, never restated. This sentence used to name the granted
146:                permissions as literal text, and it went false the moment the
147:                demo grants changed — describing visible finance items that were
148:                by then correctly hidden. A page that explains the permission
149:                model must read the permission model, or it becomes confident
150:                misinformation. Same lesson as the nav/router grants split. */}
151:            <strong>Permission-aware visibility is real.</strong>{' '}
152:            {nav.grants.length === 0 ? (
153:              <>
154:                {/* The signed-out wording is not a nicety. The old sentence read
155:                    "This viewer holds , so only the groups those grants unlock
156:                    are listed" once the grants became genuinely empty — a
157:                    dangling clause that describes nothing. An empty grant list
158:                    is now the common case, not an edge one: it is what every
159:                    visitor sees before signing in. */}
160:                This viewer holds <strong>no permission grants</strong>, because nobody is signed in.
161:                Only ungated modules are listed; everything gated is absent from the menu
162:              </>
163:            ) : (
164:              <>
165:                This viewer holds{' '}
166:                {nav.grants.map((grant, i, all) => (
167:                  <span key={grant}>
168:                    <code>{grant}</code>
169:                    {i < all.length - 1 ? ' and ' : ''}
170:                  </span>
171:                ))}
172:                , so only the groups those grants unlock are listed. Modules gated behind any other
173:                permission — the finance items among them — are absent from the menu
174:              </>
175:            )}{' '}
176:            <em>and</em> answer 404 if their URL is typed directly.
177:          </li>
178:          <li>
179:            <strong>Counters and warning badges are real mechanics, fake numbers.</strong> They resolve through the
180:            same code path the API will use.
181:          </li>
182:          <li>
183:            <strong>Page content is not built yet.</strong> Every other route renders an honest “not built” page
184:            rather than a convincing mock — Phases 4–7 fill them in.
185:          </li>
186:        </ul>
187:      </section>
188:    </>
189:  );
190:}

 exited 1 in 1001ms:
packages\auth\src\workspace-auth.ts:24: * WHAT THE BROWSER GETS. The session cookie is an encrypted JWE, httpOnly, and
packages\auth\src\workspace-auth.ts:87: * The refreshed cookie is persisted by MIDDLEWARE, which is the only place in
packages\auth\src\workspace-auth.ts:88: * the App Router that both runs before a render and may set a cookie. A server
packages\auth\src\workspace-auth.ts:226:      // Reads the cookie directly rather than going through `auth()`, because
packages\auth\src\workspace-auth.ts:240:      // `raw: true` returns the cookie's contents undecrypted, and `getToken`
packages\auth\src\workspace-auth.ts:241:      // checks for the cookie before it checks for a secret. So: no cookie, no
packages\auth\src\workspace-auth.ts:242:      // session, no secret required. A cookie that IS present must be
packages\auth\src\workspace-auth.ts:249:      // the cookie name, which is why `secureCookie` must match how the cookie
packages\auth\src\workspace-auth.ts:271: * build a new provider, a new cookie configuration and a new set of callbacks
packages\auth\src\workspace-auth.ts:273: * viewer resolution MUST agree on the cookie name and secret, and the surest
packages\auth\src\workspace-auth.ts:288: * The URL that ends the KEYCLOAK session, not just the local cookie.
packages\auth\src\workspace-auth.ts:290: * `signOut()` clears this app's cookie and nothing else. The Keycloak SSO
packages\auth\src\tokens.ts:8: * a request, or a cookie.
packages\auth\src\index.ts:12: * resulting cookie — a server component can compute a refreshed token and has
packages\auth\src\index.ts:17: * `api/auth` is excluded because Auth.js's own routes manage the cookie
packages\ui\src\ThemeProvider.tsx:44: * under some cookie-blocking settings. A theme preference is never worth taking
apps/api/src\main.ts:10:  app.setGlobalPrefix('api/v1');
packages\next-shell\src\viewer.ts:15: * SERVER ONLY. The access token is read from the encrypted session cookie and
packages\next-shell\src\viewer.ts:45:    response = await fetch(`${apiBaseUrl()}/api/v1/me`, {
packages\next-shell\src\viewer.test.ts:22: * session via `GET /api/v1/me`, so they can no longer be evaluated in a unit
packages\next-shell\src\viewer-contract.ts:21: * `GET /api/v1/me` — the shape the API returns.
rg: apps/*-web/app: The filename, directory name, or volume label syntax is incorrect. (os error 123)
rg: apps/*-web/middleware.ts: The filename, directory name, or volume label syntax is incorrect. (os error 123)

2026-07-27T23:18:42.044195Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 1 seconds
Output:
packages\auth\src\workspace-auth.ts:24: * WHAT THE BROWSER GETS. The session cookie is an encrypted JWE, httpOnly, and
packages\auth\src\workspace-auth.ts:87: * The refreshed cookie is persisted by MIDDLEWARE, which is the only place in
packages\auth\src\workspace-auth.ts:88: * the App Router that both runs before a render and may set a cookie. A server
packages\auth\src\workspace-auth.ts:226:      // Reads the cookie directly rather than going through `auth()`, because
packages\auth\src\workspace-auth.ts:240:      // `raw: true` returns the cookie's contents undecrypted, and `getToken`
packages\auth\src\workspace-auth.ts:241:      // checks for the cookie before it checks for a secret. So: no cookie, no
packages\auth\src\workspace-auth.ts:242:      // session, no secret required. A cookie that IS present must be
packages\auth\src\workspace-auth.ts:249:      // the cookie name, which is why `secureCookie` must match how the cookie
packages\auth\src\workspace-auth.ts:271: * build a new provider, a new cookie configuration and a new set of callbacks
packages\auth\src\workspace-auth.ts:273: * viewer resolution MUST agree on the cookie name and secret, and the surest
packages\auth\src\workspace-auth.ts:288: * The URL that ends the KEYCLOAK session, not just the local cookie.
packages\auth\src\workspace-auth.ts:290: * `signOut()` clears this app's cookie and nothing else. The Keycloak SSO
packages\auth\src\tokens.ts:8: * a request, or a cookie.
packages\auth\src\index.ts:12: * resulting cookie — a server component can compute a refreshed token and has
packages\auth\src\index.ts:17: * `api/auth` is excluded because Auth.js's own routes manage the cookie
packages\ui\src\ThemeProvider.tsx:44: * under some cookie-blocking settings. A theme preference is never worth taking
apps/api/src\main.ts:10:  app.setGlobalPrefix('api/v1');
packages\next-shell\src\viewer.ts:15: * SERVER ONLY. The access token is read from the encrypted session cookie and
packages\next-shell\src\viewer.ts:45:    response = await fetch(`${apiBaseUrl()}/api/v1/me`, {
packages\next-shell\src\viewer.test.ts:22: * session via `GET /api/v1/me`, so they can no longer be evaluated in a unit
packages\next-shell\src\viewer-contract.ts:21: * `GET /api/v1/me` — the shape the API returns.
rg: apps/*-web/app: The filename, directory name, or volume label syntax is incorrect. (os error 123)
rg: apps/*-web/middleware.ts: The filename, directory name, or volume label syntax is incorrect. (os error 123)

 succeeded in 1022ms:
packages/auth/src/index.ts:1:export { createWorkspaceAuth, workspaceAuth, keycloakSignOutUrl } from './workspace-auth';
packages/auth/src/index.ts:2:export type { WorkspaceAuth } from './workspace-auth';
packages/auth/src/index.ts:3:export { apiBaseUrl, clientIdForWorkspace, keycloakIssuer, AuthConfigError } from './config';
packages/auth/src/index.ts:4:export { isExpired, refreshAccessToken, RefreshFailedError, REFRESH_SKEW_SECONDS } from './tokens';
packages/auth/src/index.ts:5:export type { KeycloakTokenSet } from './tokens';
packages/auth/src/index.ts:7:/**
packages/auth/src/index.ts:8: * Which requests the auth middleware must see.
packages/auth/src/index.ts:9: *
packages/auth/src/index.ts:10: * MIDDLEWARE IS NOT OPTIONAL and this matcher is why. The `jwt` callback
packages/auth/src/index.ts:11: * refreshes the Keycloak access token, but only middleware may write the
packages/auth/src/index.ts:12: * resulting cookie — a server component can compute a refreshed token and has
packages/auth/src/index.ts:13: * no way to persist it, so an app without this runs the refresh on every render
packages/auth/src/index.ts:14: * and keeps none of it. With a 300-second access-token lifespan that means
packages/auth/src/index.ts:15: * `getAccessToken()` starts returning null a few minutes into any session.
packages/auth/src/index.ts:16: *
packages/auth/src/index.ts:17: * `api/auth` is excluded because Auth.js's own routes manage the cookie
packages/auth/src/index.ts:18: * themselves; static assets are excluded because running a session decrypt for
packages/auth/src/index.ts:19: * every image is pure cost.
packages/auth/src/index.ts:20: */
packages/auth/src/index.ts:21:export const AUTH_MIDDLEWARE_MATCHER = [
packages/auth/src/index.ts:22:  '/((?!api/auth|_next/static|_next/image|favicon.ico).*)',
packages/auth/src/index.ts:23:];
apps/admin-web/middleware.ts:1:import { auth } from './auth';
apps/admin-web/middleware.ts:3:/**
apps/admin-web/middleware.ts:4: * MIDDLEWARE IS NOT OPTIONAL HERE.
apps/admin-web/middleware.ts:5: *
apps/admin-web/middleware.ts:6: * Running `auth` as middleware is what PERSISTS a refreshed Keycloak access
apps/admin-web/middleware.ts:7: * token. The refresh itself happens in the `jwt` callback, but only middleware
apps/admin-web/middleware.ts:8: * may write the session cookie — a server component can compute a renewed token
apps/admin-web/middleware.ts:9: * and has no way to store it. Without this file the app would re-refresh on
apps/admin-web/middleware.ts:10: * every render, keep none of it, and `getAccessToken()` would start returning
apps/admin-web/middleware.ts:11: * null a few minutes into every session, with the shell quietly degrading to
apps/admin-web/middleware.ts:12: * its signed-out state.
apps/admin-web/middleware.ts:13: *
apps/admin-web/middleware.ts:14: * It does NOT gate access. An unauthenticated visitor still reaches the shell
apps/admin-web/middleware.ts:15: * and sees the ungated navigation; the API and Postgres RLS are what deny.
apps/admin-web/middleware.ts:16: * Redirect-to-sign-in is a deliberate later step (see the handover): forcing it
apps/admin-web/middleware.ts:17: * here would couple the whole Playwright suite to a running Keycloak and API.
apps/admin-web/middleware.ts:18: *
apps/admin-web/middleware.ts:19: * The matcher is written out rather than imported because Next requires
apps/admin-web/middleware.ts:20: * `config` to be statically analysable — an imported constant is not. It is the
apps/admin-web/middleware.ts:21: * same value as `AUTH_MIDDLEWARE_MATCHER` in `@autoworkshop/auth`, which is the
apps/admin-web/middleware.ts:22: * canonical copy.
apps/admin-web/middleware.ts:23: */
apps/admin-web/middleware.ts:24:export default auth;
apps/admin-web/middleware.ts:26:export const config = {
apps/admin-web/middleware.ts:27:  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
apps/admin-web/middleware.ts:28:};
apps/workshop-web/middleware.ts:1:import { auth } from './auth';
apps/workshop-web/middleware.ts:3:/**
apps/workshop-web/middleware.ts:4: * MIDDLEWARE IS NOT OPTIONAL HERE.
apps/workshop-web/middleware.ts:5: *
apps/workshop-web/middleware.ts:6: * Running `auth` as middleware is what PERSISTS a refreshed Keycloak access
apps/workshop-web/middleware.ts:7: * token. The refresh itself happens in the `jwt` callback, but only middleware
apps/workshop-web/middleware.ts:8: * may write the session cookie — a server component can compute a renewed token
apps/workshop-web/middleware.ts:9: * and has no way to store it. Without this file the app would re-refresh on
apps/workshop-web/middleware.ts:10: * every render, keep none of it, and `getAccessToken()` would start returning
apps/workshop-web/middleware.ts:11: * null a few minutes into every session, with the shell quietly degrading to
apps/workshop-web/middleware.ts:12: * its signed-out state.
apps/workshop-web/middleware.ts:13: *
apps/workshop-web/middleware.ts:14: * It does NOT gate access. An unauthenticated visitor still reaches the shell
apps/workshop-web/middleware.ts:15: * and sees the ungated navigation; the API and Postgres RLS are what deny.
apps/workshop-web/middleware.ts:16: * Redirect-to-sign-in is a deliberate later step (see the handover): forcing it
apps/workshop-web/middleware.ts:17: * here would couple the whole Playwright suite to a running Keycloak and API.
apps/workshop-web/middleware.ts:18: *
apps/workshop-web/middleware.ts:19: * The matcher is written out rather than imported because Next requires
apps/workshop-web/middleware.ts:20: * `config` to be statically analysable — an imported constant is not. It is the
apps/workshop-web/middleware.ts:21: * same value as `AUTH_MIDDLEWARE_MATCHER` in `@autoworkshop/auth`, which is the
apps/workshop-web/middleware.ts:22: * canonical copy.
apps/workshop-web/middleware.ts:23: */
apps/workshop-web/middleware.ts:24:export default auth;
apps/workshop-web/middleware.ts:26:export const config = {
apps/workshop-web/middleware.ts:27:  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
apps/workshop-web/middleware.ts:28:};

 succeeded in 1063ms:
packages\auth\src\workspace-auth.ts:83: * `refreshTokenMaxReuse: 0` means using a refresh token revokes it, so a second
packages\auth\src\workspace-auth.ts:173:            refreshToken: account.refresh_token as string | undefined,
packages\auth\src\workspace-auth.ts:179:            idToken: account.id_token as string | undefined,
packages\auth\src\workspace-auth.ts:189:        if (!current.refreshToken) {
packages\auth\src\workspace-auth.ts:197:          token.keycloak = await refreshAccessToken(clientId, current.refreshToken);
packages\auth\src\workspace-auth.ts:290: * `signOut()` clears this app's cookie and nothing else. The Keycloak SSO
packages\auth\src\workspace-auth.ts:298:export function keycloakSignOutUrl(idToken: string | undefined, postLogoutRedirect: string): string {
packages\auth\src\workspace-auth.ts:299:  const url = new URL(`${keycloakIssuer()}/protocol/openid-connect/logout`);
packages\auth\src\workspace-auth.ts:300:  if (idToken) url.searchParams.set('id_token_hint', idToken);
packages\auth\src\workspace-auth.ts:301:  url.searchParams.set('post_logout_redirect_uri', postLogoutRedirect);
packages\auth\src\tokens.ts:18:  refreshToken?: string;
packages\auth\src\tokens.ts:22:  idToken?: string;
packages\auth\src\tokens.ts:65: * `revokeRefreshToken: true` with `refreshTokenMaxReuse: 0`, so the token
packages\auth\src\tokens.ts:70: *   · the caller must persist `refreshToken` from the result — keeping the old
packages\auth\src\tokens.ts:82:  refreshToken: string,
packages\auth\src\tokens.ts:91:      refresh_token: refreshToken,
packages\auth\src\tokens.ts:111:    refreshToken: payload.refresh_token ?? refreshToken,
packages\auth\src\tokens.ts:113:    idToken: payload.id_token,
packages\auth\src\tokens.test.ts:47:    // The realm sets revokeRefreshToken with refreshTokenMaxReuse 0, so the
packages\auth\src\tokens.test.ts:60:    expect(result.refreshToken).toBe('rotated-refresh');
packages\auth\src\tokens.test.ts:79:    expect(result.refreshToken).toBe('still-valid');
packages\auth\src\index.ts:1:export { createWorkspaceAuth, workspaceAuth, keycloakSignOutUrl } from './workspace-auth';

codex
I have enough for the main findings. I’m doing one pass over the guardrail script and review artifact only to make sure the latest commit did not add a new security-relevant issue there, then I’ll summarize with severity, scenario, and fixes.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "." scripts/guardrails/verify_claims.py' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git diff --unified=80 HEAD~1..HEAD -- scripts/guardrails/verify_claims.py' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "tenant_id|RLS|logout|refresh|admin|hidden|unsafe|security|critical|high" reviews/codex-review.md' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 789ms:
1:#!/usr/bin/env python3
2:"""
3:Claim verifier (guardrail layer 2) -- catches hallucinated and stale assertions.
4:
5:WHY THIS EXISTS
6:---------------
7:On 2026-07-26 the control files stated that T-0018 and T-0019 were the top open
8:items. They had shipped hours earlier in 71a17fd. Nothing detected it, because
9:nothing checks documentation against reality -- documentation is the one artifact
10:in the repo with no compiler, no test and no type system behind it.
11:
12:Worse, the fix itself introduced new false claims: a reference to two review
13:files that did not exist, and a "working tree clean at 3877835" written while
14:five files were modified. Prose is where unverified assertions accumulate, and a
15:confidently wrong status file is more dangerous than an obviously stale one --
16:the next session trusts it and plans against it.
17:
18:WHAT IT CHECKS (all machine-checkable -- no model, no judgement, no network)
19:---------------------------------------------------------------------------
20:  1. PATHS      every repo-relative path referenced in prose must exist
21:  2. COMMITS    every git SHA cited must resolve in this repository
22:  3. TASK IDS   every T-#### referenced must exist in TASK_QUEUE.md
23:  4. STATUS     no document may contradict TASK_QUEUE.md about a task's status
24:                -- this is the exact failure of 2026-07-26
25:  5. CITATIONS  every `file:line` citation must exist and be in range
26:
27:Historical statements are exempt from check 4: a sentence containing "was",
28:"until", "previously", "no longer" and similar is describing the past on
29:purpose, and forcing those to match current state would make honest history
30:unwritable.
31:
32:Exit codes: 0 clean · 1 findings · 2 usage error.
33:
34:    python verify_claims.py                 # check the default document set
35:    python verify_claims.py --strict        # warnings become failures
36:    python verify_claims.py PATH...         # check specific files
37:"""
38:
39:from __future__ import annotations
40:
41:import argparse
42:import re
43:import subprocess
44:import sys
45:from pathlib import Path
46:
47:# Documents whose factual claims are load-bearing for the next session.
48:DEFAULT_TARGETS = [
49:    ".claude/SESSION_HANDOVER.md",
50:    ".claude/TASK_QUEUE.md",
51:    ".claude/CURRENT_PHASE.md",
52:    ".claude/CURRENT_TASK.md",
53:    "docs/05-database/BACKUP_AND_RESTORE.md",
54:    "README.md",
55:]
56:
57:# `reviews/` is deliberately NOT in the default set. A review is a point-in-time
58:# record: it SHOULD say "nothing is scheduled" if that was true when it was
59:# written. Rewriting history to satisfy a linter would destroy the audit trail.
60:# Their citations are still checkable via --citations-only.
61:
62:TASK_QUEUE = Path(".claude/TASK_QUEUE.md")
63:
64:# "closed" is how the queue records a task investigated and dismissed -- T-0030
65:# and T-0031 are both "**closed ... NOT A DEFECT**". Its absence here did not
66:# merely mislabel them: because presence used to be inferred from status parsing,
67:# an unrecognised word made a row that plainly exists invisible, and the checker
68:# reported 15 real, correctly-documented references as missing from the queue.
69:#
70:# ORDER MATTERS -- the first word found in the status cell wins, so the most
71:# specific verdicts must come first. T-0005 reads "**code complete 2026-07-27,
72:# GATES PENDING**". Matching "complete" there normalised to "done" and reported
73:# the repo's one piece of knowingly unreviewed work as finished, in the very
74:# checker built to stop stale status claims. "gates pending" must be seen first.
75:STATUS_WORDS = ["gates pending", "in progress", "done", "queued", "partial", "blocked",
76:                "complete", "open", "withdrawn", "closed"]
77:HISTORICAL_MARKERS = [
78:    "was ", "were ", "until", "previously", "no longer", "used to", "had ",
79:    "shipped without", "said otherwise", "went stale", "before", "history",
80:    "originally", "at the time", "old ", "stale", "stopped", "stated",
81:]
82:
83:# A token that looks like a path: has a slash and a file-ish suffix.
84:PATH_RE = re.compile(r"`([A-Za-z0-9_./\-]+\.(?:ts|tsx|js|sh|ps1|sql|py|md|json|yml|yaml|cron|txt))`")
85:# file:line or file:line-line
86:CITE_RE = re.compile(r"`?([A-Za-z0-9_./\-]+\.(?:ts|tsx|js|sh|ps1|sql|py|md|json|yml|yaml|cron)):(\d+)(?:-(\d+))?`?")
87:SHA_RE = re.compile(r"`([0-9a-f]{7,40})`")
88:TASK_RE = re.compile(r"\bT-(\d{4})\b")
89:
90:# How close a status word must be to a task id to count as a claim about it.
91:PROXIMITY = 45
92:
93:
94:class Findings:
95:    def __init__(self) -> None:
96:        self.items: list[tuple[str, str, str]] = []   # (level, where, message)
97:
98:    def add(self, level: str, where: str, msg: str) -> None:
99:        self.items.append((level, where, msg))
100:
101:    @property
102:    def failures(self) -> int:
103:        return sum(1 for lvl, _, _ in self.items if lvl == "FAIL")
104:
105:    @property
106:    def warnings(self) -> int:
107:        return sum(1 for lvl, _, _ in self.items if lvl == "WARN")
108:
109:
110:def git_object_exists(sha: str) -> bool:
111:    try:
112:        r = subprocess.run(
113:            ["git", "cat-file", "-t", sha],
114:            capture_output=True, text=True, timeout=15,
115:        )
116:        return r.returncode == 0 and r.stdout.strip() == "commit"
117:    except (OSError, subprocess.SubprocessError):
118:        return False
119:
120:
121:def canonical_task_status(queue_text: str) -> tuple[set[str], dict[str, str], list[str]]:
122:    """
123:    Parse the TASK_QUEUE table -- it is the single source of truth for status.
124:
125:    Returns (known_ids, statuses). THESE ARE TWO DIFFERENT QUESTIONS and
126:    conflating them was a bug: a row whose status cell used a word outside
127:    STATUS_WORDS produced no entry at all, so "does this task exist" answered
128:    NO for a task documented on its own line. That reported 15 correct
129:    references as missing and failed the gate for the wrong reason -- the sort
130:    of false positive that gets a guardrail switched off.
131:
132:    So presence is now recorded for EVERY row carrying a task id, and status is
133:    recorded only when it can actually be read.
134:
135:    The status cell is prose as well as a verdict: T-0003 reads
136:    "**partial** -- organizations + tenant DB layer + audit done; ... outstanding".
137:    Scanning for the first status word anywhere in that cell returns "done",
138:    which is the opposite of what the row says. So the **bolded** verdict wins,
139:    and only if there is none do we fall back to a bare scan.
140:    """
141:    known: set[str] = set()
142:    statuses: dict[str, str] = {}
143:    unparsed: list[str] = []
144:    for line in queue_text.splitlines():
145:        if not line.strip().startswith("|"):
146:            continue
147:        cells = [c.strip() for c in line.strip().strip("|").split("|")]
148:        if len(cells) < 4:
149:            continue
150:        m = TASK_RE.search(cells[0])
151:        if not m:
152:            continue
153:        known.add(f"T-{m.group(1)}")
154:        cell = cells[3]
155:        bold = re.findall(r"\*\*([^*]+)\*\*", cell)
156:        candidates = [b.lower() for b in bold] or [cell.lower()]
157:        chosen = None
158:        for cand in candidates:
159:            for w in STATUS_WORDS:
160:                if w in cand:
161:                    chosen = w
162:                    break
163:            if chosen:
164:                break
165:        if chosen:
166:            statuses[f"T-{m.group(1)}"] = chosen
167:        else:
168:            # Presence is recorded above, so this no longer breaks the task-id
169:            # check -- but staying silent would trade a false failure for a
170:            # false green: a typo or a new status word would simply exempt that
171:            # row from status checking forever. Make it visible instead.
172:            unparsed.append(f"T-{m.group(1)}")
173:    return known, statuses, unparsed
174:
175:
176:def resolve_path(ref: str, repo_files: dict[str, list[Path]]) -> bool:
177:    """
178:    Does this referenced path point at a real file?
179:
180:    Documentation legitimately writes paths relative to the directory it is
181:    talking about -- `./check-backup-health.sh` inside a section whose commands
182:    all run from `infrastructure/backup`. Demanding repo-root-relative paths
183:    everywhere would flag correct prose, and a checker that flags correct prose
184:    is one an operator learns to ignore. So: try root-relative first, then
185:    accept any unambiguous suffix match elsewhere in the repo.
186:    """
187:    clean = ref.lstrip("./")
188:    if Path(ref).exists() or Path(clean).exists():
189:        return True
190:    name = Path(clean).name
191:    # Codex asked for exactly-one-match here, on the reasoning that an ambiguous
192:    # reference is not really grounded. Implemented literally it produced 25 new
193:    # FAILs reading "cited file does not exist: tsconfig.json" -- a file that
194:    # exists seven times over. `tsconfig.json`, `page.tsx` and `main.ts` are
195:    # ordinary things to name in a review, and multiplicity is evidence the file
196:    # EXISTS, not evidence it is missing.
197:    #
198:    # This function answers one question -- does this reference point at a real
199:    # file -- and for that, any match is a yes. Imprecision is a different
200:    # complaint and does not belong behind a word like "does not exist".
201:    matches = [c for c in repo_files.get(name, [])
202:               if str(c).replace("\\", "/").endswith(clean)]
203:    return bool(matches)
204:
205:
206:def index_repo_files() -> dict[str, list[Path]]:
207:    """Map basename -> paths, so a relative reference can be resolved by suffix."""
208:    out: dict[str, list[Path]] = {}
209:    skip = {".git", "node_modules", ".next", "dist", "build", ".guardrails", "__pycache__"}
210:    for p in Path(".").rglob("*"):
211:        parts = set(p.parts)
212:        if parts & skip or not p.is_file():
213:            continue
214:        out.setdefault(p.name, []).append(p)
215:    return out
216:
217:
218:def is_historical(line: str) -> bool:
219:    low = line.lower()
220:    return any(mark in low for mark in HISTORICAL_MARKERS)
221:
222:
223:def check_document(path: Path, known_ids: set[str], canonical: dict[str, str],
224:                   f: Findings, citations_only: bool,
225:                   repo_files: dict[str, list[Path]]) -> None:
226:    try:
227:        text = path.read_text(encoding="utf-8", errors="replace")
228:    except OSError as e:
229:        f.add("FAIL", str(path), f"cannot read: {e}")
230:        return
231:
232:    for lineno, line in enumerate(text.splitlines(), 1):
233:        where = f"{path}:{lineno}"
234:
235:        # --- 5. citations: file:line must exist and be in range ------------
236:        for m in CITE_RE.finditer(line):
237:            target, start, end = m.group(1), int(m.group(2)), m.group(3)
238:            tp = Path(target)
239:            if not tp.exists():
240:                # "handled by the path check below" was not true in two ways.
241:                # PATH_RE requires the path to be wrapped in backticks, and a
242:                # citation is usually written `file.ts:42` -- the trailing :42
243:                # keeps PATH_RE from matching at all. And in --citations-only
244:                # mode the path check never runs, which is precisely the mode
245:                # the README recommends for reviews/. So a review could cite a
246:                # file that does not exist and still pass. Check it here.
247:                if not resolve_path(target, repo_files):
248:                    f.add("FAIL", where, f"cited file does not exist: {target}")
249:                continue
250:            try:
251:                n_lines = len(tp.read_text(encoding="utf-8", errors="replace").splitlines())
252:            except OSError:
253:                continue
254:            hi = int(end) if end else start
255:            if start < 1 or hi > n_lines:
256:                f.add("FAIL", where,
257:                      f"citation {target}:{m.group(2)}{'-' + end if end else ''} is out of range "
258:                      f"(file has {n_lines} lines)")
259:
260:        if citations_only:
261:            continue
262:
263:        # --- 1. paths must exist -------------------------------------------
264:        for m in PATH_RE.finditer(line):
265:            ref = m.group(1)
266:            if ref.startswith(("http", "//")) or " " in ref:
267:                continue
268:            # Bare filenames without a directory are usually generic prose
269:            # ("a package.json"), not a claim about a specific file here.
270:            if "/" not in ref:
271:                continue
272:            if not resolve_path(ref, repo_files):
273:                f.add("FAIL", where, f"referenced path does not exist: {ref}")
274:
275:        # --- 2. commit SHAs must resolve ------------------------------------
276:        for m in SHA_RE.finditer(line):
277:            sha = m.group(1)
278:            if not re.fullmatch(r"[0-9a-f]+", sha):
279:                continue
280:            # Skip things that are plainly not SHAs: all digits, or hex that is
281:            # actually a status code like 0xC000013A written without the 0x.
282:            if sha.isdigit():
283:                continue
284:            if not git_object_exists(sha):
285:                f.add("WARN", where, f"cited commit does not resolve in this repo: {sha}")
286:
287:        # --- 3 & 4. task ids and status agreement ---------------------------
288:        for m in TASK_RE.finditer(line):
289:            tid = f"T-{m.group(1)}"
290:            if tid not in known_ids:
291:                f.add("FAIL", where, f"{tid} is referenced but is not in TASK_QUEUE.md")
292:                continue
293:            # The row exists but its verdict is not machine-readable. That is a
294:            # documentation nit, not a contradiction, and there is nothing to
295:            # compare a claim against -- so say nothing rather than guess.
296:            if tid not in canonical:
297:                continue
298:            if path.samefile(TASK_QUEUE) if TASK_QUEUE.exists() else False:
299:                continue
300:            if is_historical(line):
301:                continue
302:            # Only a status word in the SAME CLAUSE is a claim about this id.
303:            # "the backup thread is complete, with delivery outstanding as
304:            # T-0023" describes the thread; "(T-0018). Phase 4 is blocked by..."
305:            # describes Phase 4. Clause boundaries separate them; raw proximity
306:            # does not, and a checker that flags correct prose gets switched off.
307:            lo = max((line.rfind(c, 0, m.start()) for c in ".;:"), default=-1) + 1
308:            hi_candidates = [line.find(c, m.end()) for c in ".;:"]
309:            hi_candidates = [h for h in hi_candidates if h != -1]
310:            hi = min(hi_candidates) if hi_candidates else len(line)
311:            clause = line[lo:hi]
312:            low = clause.lower()
313:
314:            # "X is blocked ON T-0003" states a dependency, not T-0003's status.
315:            dep = re.search(r"blocked\s+on\s+" + re.escape(tid), clause, re.I)
316:            claimed = [w for w in STATUS_WORDS if w in low]
317:            if dep:
318:                claimed = [w for w in claimed if w != "blocked"]
319:            if not claimed:
320:                continue
321:            truth = canonical[tid]
322:            # "complete" and "done" are the same claim.
323:            norm = {"complete": "done"}
324:            claimed_n = {norm.get(c, c) for c in claimed}
325:            truth_n = norm.get(truth, truth)
326:            if truth_n not in claimed_n:
327:                f.add("WARN", where,
328:                      f"{tid} is described as {sorted(claimed_n)} but TASK_QUEUE.md says '{truth}'")
329:
330:
331:def main() -> int:
332:    ap = argparse.ArgumentParser(description="Verify factual claims in project documentation.")
333:    ap.add_argument("targets", nargs="*", help="files to check (default: control files)")
334:    ap.add_argument("--strict", action="store_true", help="treat warnings as failures")
335:    ap.add_argument("--citations-only", action="store_true",
336:                    help="only validate file:line citations (safe for reviews/)")
337:    args = ap.parse_args()
338:
339:    if not TASK_QUEUE.exists():
340:        print(f"! {TASK_QUEUE} not found -- run from the repository root", file=sys.stderr)
341:        return 2
342:
343:    known_ids, canonical, unparsed = canonical_task_status(
344:        TASK_QUEUE.read_text(encoding="utf-8", errors="replace"))
345:    targets = [Path(t) for t in (args.targets or DEFAULT_TARGETS)]
346:
347:    repo_files = index_repo_files()
348:    f = Findings()
349:    for tid in unparsed:
350:        f.add("WARN", str(TASK_QUEUE),
351:              f"{tid} has a status cell no known status word matches -- it is exempt "
352:              f"from status checking until the wording or STATUS_WORDS is fixed")
353:    checked = 0
354:    for t in targets:
355:        if not t.exists():
356:            f.add("WARN", str(t), "target document does not exist")
357:            continue
358:        checked += 1
359:        check_document(t, known_ids, canonical, f, args.citations_only, repo_files)
360:
361:    print(f"=== claim verification -- {checked} document(s), "
362:          f"{len(known_ids)} known task ids ===")
363:    if not f.items:
364:        print("  OK        every checked claim resolves")
365:    for level, where, msg in f.items:
366:        print(f"  {level:<9} {where}: {msg}")
367:
368:    print()
369:    if f.failures or (args.strict and f.warnings):
370:        print(f"RESULT: FAIL -- {f.failures} failure(s), {f.warnings} warning(s)")
371:        return 1
372:    if f.warnings:
373:        print(f"RESULT: PASS WITH WARNINGS -- {f.warnings} warning(s)")
374:        return 0
375:    print("RESULT: PASS")
376:    return 0
377:
378:
379:if __name__ == "__main__":
380:    sys.exit(main())

 succeeded in 754ms:
diff --git a/scripts/guardrails/verify_claims.py b/scripts/guardrails/verify_claims.py
index 6c4e231..b6fe726 100644
--- a/scripts/guardrails/verify_claims.py
+++ b/scripts/guardrails/verify_claims.py
@@ -1,345 +1,380 @@
 #!/usr/bin/env python3
 """
 Claim verifier (guardrail layer 2) -- catches hallucinated and stale assertions.
 
 WHY THIS EXISTS
 ---------------
 On 2026-07-26 the control files stated that T-0018 and T-0019 were the top open
 items. They had shipped hours earlier in 71a17fd. Nothing detected it, because
 nothing checks documentation against reality -- documentation is the one artifact
 in the repo with no compiler, no test and no type system behind it.
 
 Worse, the fix itself introduced new false claims: a reference to two review
 files that did not exist, and a "working tree clean at 3877835" written while
 five files were modified. Prose is where unverified assertions accumulate, and a
 confidently wrong status file is more dangerous than an obviously stale one --
 the next session trusts it and plans against it.
 
 WHAT IT CHECKS (all machine-checkable -- no model, no judgement, no network)
 ---------------------------------------------------------------------------
   1. PATHS      every repo-relative path referenced in prose must exist
   2. COMMITS    every git SHA cited must resolve in this repository
   3. TASK IDS   every T-#### referenced must exist in TASK_QUEUE.md
   4. STATUS     no document may contradict TASK_QUEUE.md about a task's status
                 -- this is the exact failure of 2026-07-26
   5. CITATIONS  every `file:line` citation must exist and be in range
 
 Historical statements are exempt from check 4: a sentence containing "was",
 "until", "previously", "no longer" and similar is describing the past on
 purpose, and forcing those to match current state would make honest history
 unwritable.
 
 Exit codes: 0 clean · 1 findings · 2 usage error.
 
     python verify_claims.py                 # check the default document set
     python verify_claims.py --strict        # warnings become failures
     python verify_claims.py PATH...         # check specific files
 """
 
 from __future__ import annotations
 
 import argparse
 import re
 import subprocess
 import sys
 from pathlib import Path
 
 # Documents whose factual claims are load-bearing for the next session.
 DEFAULT_TARGETS = [
     ".claude/SESSION_HANDOVER.md",
     ".claude/TASK_QUEUE.md",
     ".claude/CURRENT_PHASE.md",
     ".claude/CURRENT_TASK.md",
     "docs/05-database/BACKUP_AND_RESTORE.md",
     "README.md",
 ]
 
 # `reviews/` is deliberately NOT in the default set. A review is a point-in-time
 # record: it SHOULD say "nothing is scheduled" if that was true when it was
 # written. Rewriting history to satisfy a linter would destroy the audit trail.
 # Their citations are still checkable via --citations-only.
 
 TASK_QUEUE = Path(".claude/TASK_QUEUE.md")
 
 # "closed" is how the queue records a task investigated and dismissed -- T-0030
 # and T-0031 are both "**closed ... NOT A DEFECT**". Its absence here did not
 # merely mislabel them: because presence used to be inferred from status parsing,
 # an unrecognised word made a row that plainly exists invisible, and the checker
 # reported 15 real, correctly-documented references as missing from the queue.
-STATUS_WORDS = ["done", "queued", "partial", "blocked", "in progress", "complete", "open",
-                "withdrawn", "closed"]
+#
+# ORDER MATTERS -- the first word found in the status cell wins, so the most
+# specific verdicts must come first. T-0005 reads "**code complete 2026-07-27,
+# GATES PENDING**". Matching "complete" there normalised to "done" and reported
+# the repo's one piece of knowingly unreviewed work as finished, in the very
+# checker built to stop stale status claims. "gates pending" must be seen first.
+STATUS_WORDS = ["gates pending", "in progress", "done", "queued", "partial", "blocked",
+                "complete", "open", "withdrawn", "closed"]
 HISTORICAL_MARKERS = [
     "was ", "were ", "until", "previously", "no longer", "used to", "had ",
     "shipped without", "said otherwise", "went stale", "before", "history",
     "originally", "at the time", "old ", "stale", "stopped", "stated",
 ]
 
 # A token that looks like a path: has a slash and a file-ish suffix.
 PATH_RE = re.compile(r"`([A-Za-z0-9_./\-]+\.(?:ts|tsx|js|sh|ps1|sql|py|md|json|yml|yaml|cron|txt))`")
 # file:line or file:line-line
 CITE_RE = re.compile(r"`?([A-Za-z0-9_./\-]+\.(?:ts|tsx|js|sh|ps1|sql|py|md|json|yml|yaml|cron)):(\d+)(?:-(\d+))?`?")
 SHA_RE = re.compile(r"`([0-9a-f]{7,40})`")
 TASK_RE = re.compile(r"\bT-(\d{4})\b")
 
 # How close a status word must be to a task id to count as a claim about it.
 PROXIMITY = 45
 
 
 class Findings:
     def __init__(self) -> None:
         self.items: list[tuple[str, str, str]] = []   # (level, where, message)
 
     def add(self, level: str, where: str, msg: str) -> None:
         self.items.append((level, where, msg))
 
     @property
     def failures(self) -> int:
         return sum(1 for lvl, _, _ in self.items if lvl == "FAIL")
 
     @property
     def warnings(self) -> int:
         return sum(1 for lvl, _, _ in self.items if lvl == "WARN")
 
 
 def git_object_exists(sha: str) -> bool:
     try:
         r = subprocess.run(
             ["git", "cat-file", "-t", sha],
             capture_output=True, text=True, timeout=15,
         )
         return r.returncode == 0 and r.stdout.strip() == "commit"
     except (OSError, subprocess.SubprocessError):
         return False
 
 
-def canonical_task_status(queue_text: str) -> tuple[set[str], dict[str, str]]:
+def canonical_task_status(queue_text: str) -> tuple[set[str], dict[str, str], list[str]]:
     """
     Parse the TASK_QUEUE table -- it is the single source of truth for status.
 
     Returns (known_ids, statuses). THESE ARE TWO DIFFERENT QUESTIONS and
     conflating them was a bug: a row whose status cell used a word outside
     STATUS_WORDS produced no entry at all, so "does this task exist" answered
     NO for a task documented on its own line. That reported 15 correct
     references as missing and failed the gate for the wrong reason -- the sort
     of false positive that gets a guardrail switched off.
 
     So presence is now recorded for EVERY row carrying a task id, and status is
     recorded only when it can actually be read.
 
     The status cell is prose as well as a verdict: T-0003 reads
     "**partial** -- organizations + tenant DB layer + audit done; ... outstanding".
     Scanning for the first status word anywhere in that cell returns "done",
     which is the opposite of what the row says. So the **bolded** verdict wins,
     and only if there is none do we fall back to a bare scan.
     """
     known: set[str] = set()
     statuses: dict[str, str] = {}
+    unparsed: list[str] = []
     for line in queue_text.splitlines():
         if not line.strip().startswith("|"):
             continue
         cells = [c.strip() for c in line.strip().strip("|").split("|")]
         if len(cells) < 4:
             continue
         m = TASK_RE.search(cells[0])
         if not m:
             continue
         known.add(f"T-{m.group(1)}")
         cell = cells[3]
         bold = re.findall(r"\*\*([^*]+)\*\*", cell)
         candidates = [b.lower() for b in bold] or [cell.lower()]
         chosen = None
         for cand in candidates:
             for w in STATUS_WORDS:
                 if w in cand:
                     chosen = w
                     break
             if chosen:
                 break
         if chosen:
             statuses[f"T-{m.group(1)}"] = chosen
-    return known, statuses
+        else:
+            # Presence is recorded above, so this no longer breaks the task-id
+            # check -- but staying silent would trade a false failure for a
+            # false green: a typo or a new status word would simply exempt that
+            # row from status checking forever. Make it visible instead.
+            unparsed.append(f"T-{m.group(1)}")
+    return known, statuses, unparsed
 
 
 def resolve_path(ref: str, repo_files: dict[str, list[Path]]) -> bool:
     """
     Does this referenced path point at a real file?
 
     Documentation legitimately writes paths relative to the directory it is
     talking about -- `./check-backup-health.sh` inside a section whose commands
     all run from `infrastructure/backup`. Demanding repo-root-relative paths
     everywhere would flag correct prose, and a checker that flags correct prose
     is one an operator learns to ignore. So: try root-relative first, then
     accept any unambiguous suffix match elsewhere in the repo.
     """
     clean = ref.lstrip("./")
     if Path(ref).exists() or Path(clean).exists():
         return True
     name = Path(clean).name
-    for cand in repo_files.get(name, []):
-        if str(cand).replace("\\", "/").endswith(clean):
-            return True
-    return False
+    # Codex asked for exactly-one-match here, on the reasoning that an ambiguous
+    # reference is not really grounded. Implemented literally it produced 25 new
+    # FAILs reading "cited file does not exist: tsconfig.json" -- a file that
+    # exists seven times over. `tsconfig.json`, `page.tsx` and `main.ts` are
+    # ordinary things to name in a review, and multiplicity is evidence the file
+    # EXISTS, not evidence it is missing.
+    #
+    # This function answers one question -- does this reference point at a real
+    # file -- and for that, any match is a yes. Imprecision is a different
+    # complaint and does not belong behind a word like "does not exist".
+    matches = [c for c in repo_files.get(name, [])
+               if str(c).replace("\\", "/").endswith(clean)]
+    return bool(matches)
 
 
 def index_repo_files() -> dict[str, list[Path]]:
     """Map basename -> paths, so a relative reference can be resolved by suffix."""
     out: dict[str, list[Path]] = {}
     skip = {".git", "node_modules", ".next", "dist", "build", ".guardrails", "__pycache__"}
     for p in Path(".").rglob("*"):
         parts = set(p.parts)
         if parts & skip or not p.is_file():
             continue
         out.setdefault(p.name, []).append(p)
     return out
 
 
 def is_historical(line: str) -> bool:
     low = line.lower()
     return any(mark in low for mark in HISTORICAL_MARKERS)
 
 
 def check_document(path: Path, known_ids: set[str], canonical: dict[str, str],
                    f: Findings, citations_only: bool,
                    repo_files: dict[str, list[Path]]) -> None:
     try:
         text = path.read_text(encoding="utf-8", errors="replace")
     except OSError as e:
         f.add("FAIL", str(path), f"cannot read: {e}")
         return
 
     for lineno, line in enumerate(text.splitlines(), 1):
         where = f"{path}:{lineno}"
 
         # --- 5. citations: file:line must exist and be in range ------------
         for m in CITE_RE.finditer(line):
             target, start, end = m.group(1), int(m.group(2)), m.group(3)
             tp = Path(target)
             if not tp.exists():
-                continue        # handled by the path check below
+                # "handled by the path check below" was not true in two ways.
+                # PATH_RE requires the path to be wrapped in backticks, and a
+                # citation is usually written `file.ts:42` -- the trailing :42
+                # keeps PATH_RE from matching at all. And in --citations-only
+                # mode the path check never runs, which is precisely the mode
+                # the README recommends for reviews/. So a review could cite a
+                # file that does not exist and still pass. Check it here.
+                if not resolve_path(target, repo_files):
+                    f.add("FAIL", where, f"cited file does not exist: {target}")
+                continue
             try:
                 n_lines = len(tp.read_text(encoding="utf-8", errors="replace").splitlines())
             except OSError:
                 continue
             hi = int(end) if end else start
             if start < 1 or hi > n_lines:
                 f.add("FAIL", where,
                       f"citation {target}:{m.group(2)}{'-' + end if end else ''} is out of range "
                       f"(file has {n_lines} lines)")
 
         if citations_only:
             continue
 
         # --- 1. paths must exist -------------------------------------------
         for m in PATH_RE.finditer(line):
             ref = m.group(1)
             if ref.startswith(("http", "//")) or " " in ref:
                 continue
             # Bare filenames without a directory are usually generic prose
             # ("a package.json"), not a claim about a specific file here.
             if "/" not in ref:
                 continue
             if not resolve_path(ref, repo_files):
                 f.add("FAIL", where, f"referenced path does not exist: {ref}")
 
         # --- 2. commit SHAs must resolve ------------------------------------
         for m in SHA_RE.finditer(line):
             sha = m.group(1)
             if not re.fullmatch(r"[0-9a-f]+", sha):
                 continue
             # Skip things that are plainly not SHAs: all digits, or hex that is
             # actually a status code like 0xC000013A written without the 0x.
             if sha.isdigit():
                 continue
             if not git_object_exists(sha):
                 f.add("WARN", where, f"cited commit does not resolve in this repo: {sha}")
 
         # --- 3 & 4. task ids and status agreement ---------------------------
         for m in TASK_RE.finditer(line):
             tid = f"T-{m.group(1)}"
             if tid not in known_ids:
                 f.add("FAIL", where, f"{tid} is referenced but is not in TASK_QUEUE.md")
                 continue
             # The row exists but its verdict is not machine-readable. That is a
             # documentation nit, not a contradiction, and there is nothing to
             # compare a claim against -- so say nothing rather than guess.
             if tid not in canonical:
                 continue
             if path.samefile(TASK_QUEUE) if TASK_QUEUE.exists() else False:
                 continue
             if is_historical(line):
                 continue
             # Only a status word in the SAME CLAUSE is a claim about this id.
             # "the backup thread is complete, with delivery outstanding as
             # T-0023" describes the thread; "(T-0018). Phase 4 is blocked by..."
             # describes Phase 4. Clause boundaries separate them; raw proximity
             # does not, and a checker that flags correct prose gets switched off.
             lo = max((line.rfind(c, 0, m.start()) for c in ".;:"), default=-1) + 1
             hi_candidates = [line.find(c, m.end()) for c in ".;:"]
             hi_candidates = [h for h in hi_candidates if h != -1]
             hi = min(hi_candidates) if hi_candidates else len(line)
             clause = line[lo:hi]
             low = clause.lower()
 
             # "X is blocked ON T-0003" states a dependency, not T-0003's status.
             dep = re.search(r"blocked\s+on\s+" + re.escape(tid), clause, re.I)
             claimed = [w for w in STATUS_WORDS if w in low]
             if dep:
                 claimed = [w for w in claimed if w != "blocked"]
             if not claimed:
                 continue
             truth = canonical[tid]
             # "complete" and "done" are the same claim.
             norm = {"complete": "done"}
             claimed_n = {norm.get(c, c) for c in claimed}
             truth_n = norm.get(truth, truth)
             if truth_n not in claimed_n:
                 f.add("WARN", where,
                       f"{tid} is described as {sorted(claimed_n)} but TASK_QUEUE.md says '{truth}'")
 
 
 def main() -> int:
     ap = argparse.ArgumentParser(description="Verify factual claims in project documentation.")
     ap.add_argument("targets", nargs="*", help="files to check (default: control files)")
     ap.add_argument("--strict", action="store_true", help="treat warnings as failures")
     ap.add_argument("--citations-only", action="store_true",
                     help="only validate file:line citations (safe for reviews/)")
     args = ap.parse_args()
 
     if not TASK_QUEUE.exists():
         print(f"! {TASK_QUEUE} not found -- run from the repository root", file=sys.stderr)
         return 2
 
-    known_ids, canonical = canonical_task_status(
+    known_ids, canonical, unparsed = canonical_task_status(
         TASK_QUEUE.read_text(encoding="utf-8", errors="replace"))
     targets = [Path(t) for t in (args.targets or DEFAULT_TARGETS)]
 
     repo_files = index_repo_files()
     f = Findings()
+    for tid in unparsed:
+        f.add("WARN", str(TASK_QUEUE),
+              f"{tid} has a status cell no known status word matches -- it is exempt "
+              f"from status checking until the wording or STATUS_WORDS is fixed")
     checked = 0
     for t in targets:
         if not t.exists():
             f.add("WARN", str(t), "target document does not exist")
             continue
         checked += 1
         check_document(t, known_ids, canonical, f, args.citations_only, repo_files)
 
     print(f"=== claim verification -- {checked} document(s), "
           f"{len(known_ids)} known task ids ===")
     if not f.items:
         print("  OK        every checked claim resolves")
     for level, where, msg in f.items:
         print(f"  {level:<9} {where}: {msg}")
 
     print()
     if f.failures or (args.strict and f.warnings):
         print(f"RESULT: FAIL -- {f.failures} failure(s), {f.warnings} warning(s)")
         return 1
     if f.warnings:
         print(f"RESULT: PASS WITH WARNINGS -- {f.warnings} warning(s)")
         return 0
     print("RESULT: PASS")
     return 0
 
 
 if __name__ == "__main__":
     sys.exit(main())

 succeeded in 795ms:
7:> You are Codex acting as Independent Pair Programmer for this repository. Review the latest implementation against the stated requirement in README.md and (if present) docs/IMPLEMENTATION_LOG.md. Identify anything Claude Code missed, misunderstood, or only partially implemented. Return a checklist of defects with: severity (critical/high/medium/low), file:line, what's wrong, recommended fix, why it matters.
13: apps/admin-web/next.config.mjs      | 14 -------------
26:diff --git a/apps/admin-web/next.config.mjs b/apps/admin-web/next.config.mjs
28:--- a/apps/admin-web/next.config.mjs
29:+++ b/apps/admin-web/next.config.mjs
148:- [ ] **Low** — [apps/admin-web/next.config.mjs](/C:/Users/USER/Documents/autoworkshop-ai/apps/admin-web/next.config.mjs:15) and the other non-`workshop-web` configs: comments still say “Only the deploy sets `SKIP_BUILD_CHECKS=1`,” while ADR-017 says the other six Next apps have no deployment story yet.
152:No critical defects found. I could not run `python scripts/guardrails/verify_claims.py` in this sandbox because script execution was rejected by policy, so this is a static review. The removal of `experimental: { cpus: 1, workerThreads: false }` itself matches ADR-017 and looks correct.
230: apps/admin-web/next.config.mjs      | 14 -------------
277:| Database | PostgreSQL + `pgvector` â€” row-level security (`FORCE`) on every tenant table |
287:**The AI never touches the database.** Agents hold no database, storage, payment or admin credentials;
296:apps/        customer-web workshop-web supplier-web fleet-web insurance-web towing-web admin-web
415:apps\admin-web\package.json:7:    "build": "next build",
416:apps\admin-web\next.config.mjs:2: * `next build` re-runs ESLint and the TypeScript checker.
417:apps\admin-web\next.config.mjs:4: * On a constrained deploy builder that step is the one that dies — and it dies
418:apps\admin-web\next.config.mjs:5: * SILENTLY: the Render build log ends at "Linting and checking validity of
419:apps\admin-web\next.config.mjs:15: * OPT-IN, NEVER THE DEFAULT. Only the deploy sets SKIP_BUILD_CHECKS=1. A local
420:apps\admin-web\next.config.mjs:16: * or CI `pnpm build` still lints and type-checks in full, so a broken build
421:apps\admin-web\next.config.mjs:19:const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';
422:apps\admin-web\next.config.mjs:21:/** @type {import('next').NextConfig} */
423:apps\admin-web\next.config.mjs:27:  // so a token change is picked up without a separate build step.
424:apps\admin-web\middleware.ts:19: * The matcher is written out rather than imported because Next requires
425:docs\04-security\TENANT_ISOLATION.md:11:| 1 | Request context | NestJS request-scoped tenant context from **validated Keycloak claims + membership records only** |
450:apps\admin-web\app\[...slug]\page.tsx:7: * own `app/<group>/<item>/page.tsx`, which Next resolves ahead of this.
474:docs\02-architecture\adr\ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md:35:and became "why is Render's builder in the critical path at all".
533:docs\00-project\COMBINED_PLAN_v2.md:156:│   ├── insurance-web/ towing-web/ admin-web/     Next.js — 7 apps per `01 (1).txt` §86
539:docs\00-project\COMBINED_PLAN_v2.md:306:| 11 Hardening + Release | **1.0** | Full test suite, security + accessibility + responsive review, backup/restore drill, DR exercise, production build, deploy, pilot onboarding |
1018:and became "why is Render's builder in the critical path at all".
1122:| T-0006 | RLS FORCE + tenant-isolation test suite | 2 | **partial** â€” RLS proven as non-superuser; full suite outstanding |
1402:apps\admin-web\next.config.mjs:15: * OPT-IN, NEVER THE DEFAULT. Only the deploy sets SKIP_BUILD_CHECKS=1. A local
1403:apps\admin-web\next.config.mjs:19:const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';
1404:apps\admin-web\next.config.mjs:23:  eslint: { ignoreDuringBuilds: constrainedBuild },
1405:apps\admin-web\next.config.mjs:24:  typescript: { ignoreBuildErrors: constrainedBuild },
1417: apps/admin-web/next.config.mjs      | 14 -------------
1458:apps/admin-web/next.config.mjs
1476:"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content -Path apps/admin-web/next.config.mjs' in C:\Users\USER\Documents\autoworkshop-ai
1904:"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"Render builds|Render runs|other six|output: 'standalone'|SKIP_BUILD_CHECKS|experimental.cpus|workerThreads\" apps/workshop-web/next.config.mjs apps/admin-web/next.config.mjs docs/02-architecture/adr/ADR-017-PREBUILT-IMAGES-FOR-PRODUCTION-DEPLOYS.md README.md" in C:\Users\USER\Documents\autoworkshop-ai
1914:apps/admin-web/next.config.mjs:15: * OPT-IN, NEVER THE DEFAULT. Only the deploy sets SKIP_BUILD_CHECKS=1. A local
1915:apps/admin-web/next.config.mjs:19:const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';
1976:apps. Keycloak provider, public client + PKCE, JWT session, refresh owned by the `jwt`
2034:**The admin app renders a blank sidebar when signed out.** Every group in that tree is
2035:gated behind `platform.admin`, so an unauthenticated viewer correctly sees nothing. This
2039:platform-admin workspace`.
2247:  `02.txt` Â§52/Â§58. 27 tests, including that all 25 platform-admin entries are present.
2339:The source is fixed; the live descriptions refresh on the next `install-windows.ps1` run. Triggers
2361:customer 3000 Â· workshop 3001 Â· supplier 3002 Â· fleet 3003 Â· insurance 3004 Â· towing 3005 Â· admin 3006.
2437:1. **The only security-relevant test in the suite had never once executed.** `"<workspace>: a gated
2475:  essentially any edit, so coverage is high but not total. Extending to a sample of routes is a cheap
2481:legitimate skips** (admin holds every grant; customer has no gated item). The three tests left
2520:took custody of the vehicle, not a payment receipt â€” gating it would have hidden a core reception
2542:**`identity.users` has NO `tenant_id` and NO row-level security** â€” deliberately, because one human
2543:may hold memberships in several tenants. So unlike everywhere else in this schema, **RLS will not
2547:Every `UserService` query therefore starts `FROM identity.memberships` (which IS under FORCE RLS) and
2548:joins outward. **The join is the security control**, and `identity.spec.ts` asserts the query SHAPE
2554:   `organizations(id)`/`branches(id)` by id alone, and RLS `WITH CHECK` validates the tenant of the
2555:   INSERTED row, never the tenant of the row it points at. So `tenant_id = A` +
2557:   looking the parent up through the RLS-protected table first: a foreign organization is invisible
2592:`finance.read`, `organization.admin` and `platform.admin`, and no code anywhere mapped a role to any
2671:    give integrity, RLS gives isolation, and you need both.
2751:- [ ] **Low** — [apps/admin-web/next.config.mjs](/C:/Users/USER/Documents/autoworkshop-ai/apps/admin-web/next.config.mjs:15) and the other non-`workshop-web` configs: comments still say “Only the deploy sets `SKIP_BUILD_CHECKS=1`,” while ADR-017 says the other six Next apps have no deployment story yet.
2755:No critical defects found. I could not run `python scripts/guardrails/verify_claims.py` in this sandbox because script execution was rejected by policy, so this is a static review. The removal of `experimental: { cpus: 1, workerThreads: false }` itself matches ADR-017 and looks correct.

codex
**Findings**

1. **High** — [apps/api/src/identity/membership.repository.ts:24](</C:/Users/USER/Documents/autoworkshop-ai/apps/api/src/identity/membership.repository.ts:24>)  
   **Issue:** `findByKeycloakSubject()` uses `queryWithoutTenant()` while joining `identity.memberships`, but `identity.memberships` is under RLS and no `app.tenant_id` / admin role is set yet. PostgreSQL will hide all membership rows, so the guard cannot resolve an active tenant context for real users.  
   **Attack scenario:** Any valid Keycloak user is effectively denied because their memberships resolve as empty; auth becomes a platform-wide login outage.  
   **Recommended fix:** Split identity bootstrap from tenant RLS safely: either add a narrowly scoped SECURITY DEFINER function for subject-to-membership resolution, or add a dedicated policy for this lookup keyed by validated server-side subject, not client tenant input. Add an integration test proving `/api/v1/me` resolves memberships as `autoworkshop_app`.

2. **High** — [infrastructure/migrations/001_tenancy_foundation.sql:204](</C:/Users/USER/Documents/autoworkshop-ai/infrastructure/migrations/001_tenancy_foundation.sql:204>) and [infrastructure/migrations/002_application_role.sql:53](</C:/Users/USER/Documents/autoworkshop-ai/infrastructure/migrations/002_application_role.sql:53>)  
   **Issue:** `audit.events` has `tenant_id` and sensitive `detail`, but no `ENABLE ROW LEVEL SECURITY`, no `FORCE ROW LEVEL SECURITY`, and the app role has `SELECT`.  
   **Attack scenario:** Any future audit viewer, SQL injection, or over-broad internal query running as `autoworkshop_app` can read audit events across every tenant, including resource IDs, actor IDs, correlation IDs, and event details.  
   **Recommended fix:** Enable and force RLS on `audit.events`; add a tenant policy using `tenant_id = identity.current_tenant_id()` plus an explicit platform-admin policy if cross-tenant audit access is required. Prefer removing app-level `SELECT` until a scoped audit-read API exists.

3. **High** — [apps/api/src/identity/organization.service.ts:38](</C:/Users/USER/Documents/autoworkshop-ai/apps/api/src/identity/organization.service.ts:38>), [apps/api/src/identity/branch.service.ts:57](</C:/Users/USER/Documents/autoworkshop-ai/apps/api/src/identity/branch.service.ts:57>), [apps/api/src/identity/membership.service.ts:97](</C:/Users/USER/Documents/autoworkshop-ai/apps/api/src/identity/membership.service.ts:97>)  
   **Issue:** Tenant-owned table queries intentionally omit `tenant_id` filters and rely on RLS only. This violates the stated rule that every query on a tenant-owned table must filter by `tenant_id`. It is also an actual exposure path for `platform_administrator`, because the RLS policy allows platform admins to see all tenant rows.  
   **Attack scenario:** A platform admin or compromised admin session hitting a tenant-scoped endpoint like `GET /organizations` can receive all organizations because the query has no `WHERE tenant_id = $ctxTenant`. Direct-ID lookups have the same issue for platform admins.  
   **Recommended fix:** Add explicit `tenant_id = $n` predicates to all tenant-scoped service queries, including list/find/update parent checks. Keep RLS as the backstop, not the only filter. Where true cross-tenant admin views are needed, create separate methods/endpoints named for that behavior and audit them.

4. **Medium** — [apps/admin-web/middleware.ts:14](</C:/Users/USER/Documents/autoworkshop-ai/apps/admin-web/middleware.ts:14>) and [packages/next-shell/src/ModulePage.tsx:72](</C:/Users/USER/Documents/autoworkshop-ai/packages/next-shell/src/ModulePage.tsx:72>)  
   **Issue:** Admin route protection is implemented as route-tree filtering in the catch-all renderer, while middleware explicitly “does NOT gate access.” Concrete `app/.../page.tsx` routes bypass the catch-all by Next.js precedence.  
   **Attack scenario:** When a real admin page is added as a concrete route, a user who guesses the URL can hit that backend-rendered page unless the page repeats the platform-admin check. Hiding the nav entry will not protect it.  
   **Recommended fix:** Add an admin-web middleware or shared server guard that requires an authenticated viewer with `platform.admin` before rendering any non-auth admin route. Keep per-API authorization as well.

5. **Medium** — [packages/auth/src/workspace-auth.ts:220](</C:/Users/USER/Documents/autoworkshop-ai/packages/auth/src/workspace-auth.ts:220>) and [packages/auth/src/workspace-auth.ts:288](</C:/Users/USER/Documents/autoworkshop-ai/packages/auth/src/workspace-auth.ts:288>)  
   **Issue:** The exported `signOut` is Auth.js local sign-out, and the Keycloak logout URL helper is unused. There is no implemented logout flow that revokes the stored refresh token.  
   **Attack scenario:** If a refresh token is stolen before logout, clearing the browser cookie does not invalidate that refresh token; the attacker can continue rotating it until Keycloak session/token expiry.  
   **Recommended fix:** Implement server-side logout that reads the refresh token from the JWT and calls Keycloak’s token revocation endpoint with `token_type_hint=refresh_token`, then clears the local session. Also redirect through Keycloak end-session if SSO logout is required.
tokens used
132,328
