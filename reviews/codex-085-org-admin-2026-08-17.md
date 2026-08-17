codex.cmd : OpenAI Codex v0.147.0
At line:1 char:435
+ ...  -Raw; $p | & C:\Users\USER\nodejs\codex.cmd exec --skip-git-repo-che ...
+                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (OpenAI Codex v0.147.0:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
--------
workdir: C:\Users\USER\Documents\autoworkshop-ai
model: gpt-5.6-sol
provider: openai
approval: never
sandbox: read-only
reasoning effort: none
reasoning summaries: none
session id: 01a01098-1b6d-7923-be35-58a36b2a0c1d
--------
user
Review the uncommitted change in this repository (`git status --short`, then
`git diff` and read the two new files under infrastructure/migrations/).

WHAT IT DOES. Two of the six self-service organisation types could never appoint
anybody. Measured three ways: CAN_GRANT_MEMBERSHIP (membership.service.ts) held
only { platform_administrator, workshop_owner, supplier_owner,
fleet_administrator }; membership.service.ts:345 is the ONLY
`INSERT INTO identity.memberships` in the whole API; and migration 080's
registration functions write just the founder. So an insurance company or a
towing firm had exactly one member, for ever, under ten screens each.

The change adds `insurance_owner` and `towing_owner` as ORG-ADMIN roles
mirroring `supplier_owner`/`fleet_administrator`:
  - migration 085 CREATE OR REPLACEs register_insurer and
    register_towing_operator to write the new roles, and backfills existing
    founders (identified as created_by = user_id AND the organisation's earliest
    membership), with an in-transaction guard that RAISEs if any insurance or
    towing organisation would still have no grant-capable member.
  - verify/085 proves the CAPABILITY (a second membership can exist), not the
    name.
  - TS: CAN_GRANT_MEMBERSHIP, GRANTABLE_ROLES, WORKSHOP_ROLE_SET filter,
    ROLES_BY_ORG_TYPE, ROLE_PERMISSIONS, ROLE_PRECEDENCE, INSURANCE_ROLES,
    TOWING_ROLES, NON_WORKSHOP_ROLES, HOME_WORKSPACE, account-types.ts,
    registration.controller.ts.
  - specs updated: permission-matrix.spec.ts, membership-role-fit.spec.ts,
    account-types.spec.ts.

REVIEW FOR, concretely:
1. SECURITY / PRIVILEGE ESCALATION. Does the backfill promote anyone it should
   not? Is the founder rule (created_by = user_id AND earliest) correct and
   sufficient? Could a non-founder be promoted, or a founder be missed?
2. Did I MISS A SITE? I measured 33 files mentioning the old two roles. Is there
   any allow-list, gate, navigation map or guard where the new roles must appear
   and do not â€” such that the role exists but silently gets nothing, or its
   holder is refused their own workspace?
3. The migration reproduces two large plpgsql function bodies from 080 with one
   literal changed. Did I alter any behaviour I did not intend â€” lock, bootstrap
   flag, exception path, org type, registration row?
4. Is the in-migration guard able to FAIL? Does it read rows under FORCE RLS, or
   is it a check that passes vacuously? Same question for verify/085.
5. Existing insurance_assessor / towing_operator holders: does anything now
   refuse them that did not before?
6. Anything a comment claims that the code does not do.

Be concrete: file, line, what breaks, and the failing input. Severity
CRITICAL/HIGH/MEDIUM/LOW. If a claim of mine is wrong, say so plainly.


codex
I’ll inspect the working tree, the full diff, and both migration files first. Then I’ll trace every relevant role allow-list and compare the copied registration functions against migration 080, 
including RLS behavior.
2026-08-17T16:40:30.138677Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git status --short; git diff --no-ext-diff; 
Get-ChildItem -Path infrastructure/migrations -Recurse -File | Where-Object { $_.Name -match '"'085' } | Select-Object -ExpandProperty FullName"` rejected: blocked by policy
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git status --short; git diff --no-ext-diff; Get-ChildItem -Path infrastructure/migrations -Recurse -File | Where-Object 
{ $_.Name -match '"'085' } | Select-Object -ExpandProperty FullName" in C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git status --short; git diff --no-ext-diff; Get-ChildItem -Path infrastructure/migrations -Recurse -File | Where-Object 
{ $_.Name -match '"'085' } | Select-Object -ExpandProperty FullName"` rejected: blocked by policy
codex
The combined read command was rejected by the workspace policy, so I’m splitting the inspection into individual read-only commands.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git status --short' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 497ms:
 M apps/api/src/authz/permission-matrix.spec.ts
 M apps/api/src/authz/permission-matrix.ts
 M apps/api/src/identity/membership-role-fit.spec.ts
 M apps/api/src/identity/membership.service.ts
 M apps/api/src/identity/registration.controller.ts
 M apps/api/src/insurance/insurance-roles.ts
 M apps/api/src/towing/towing-roles.ts
 M apps/web/app/onboarding/account-types.spec.ts
 M apps/web/app/onboarding/account-types.ts
 M packages/next-shell/src/viewer-contract.ts
?? infrastructure/migrations/085_insurance_and_towing_org_admin.sql
?? infrastructure/migrations/verify/085_insurance_and_towing_org_admin.sql
?? reviews/codex-085-org-admin-2026-08-17.md

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git diff --no-ext-diff' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 561ms:
diff --git a/apps/api/src/authz/permission-matrix.spec.ts b/apps/api/src/authz/permission-matrix.spec.ts
index 72423fb..0838e29 100644
--- a/apps/api/src/authz/permission-matrix.spec.ts
+++ b/apps/api/src/authz/permission-matrix.spec.ts
@@ -110,7 +110,13 @@ describe('the matrix and the grantable-role allow-list must stay in step', () =>
     'cashier',
     'supplier_owner',
     'fleet_administrator',
+    // 085 — the org admins for insurance and towing. Retyped here, not
+    // imported, for the reason stated above: importing would make the two lists
+    // agree by construction and prove nothing. Adding a role to
+    // `GRANTABLE_ROLES` without adding it here is SUPPOSED to fail this file.
+    'insurance_owner',
     'insurance_assessor',
+    'towing_owner',
     'towing_operator',
     'customer',
   ];
diff --git a/apps/api/src/authz/permission-matrix.ts b/apps/api/src/authz/permission-matrix.ts
index 95ee4d3..0dc2ad6 100644
--- a/apps/api/src/authz/permission-matrix.ts
+++ b/apps/api/src/authz/permission-matrix.ts
@@ -103,8 +103,30 @@ export const ROLE_PERMISSIONS: Readonly<Record<string, readonly string[]>> = Obj
   supplier_owner: [financeRead, organizationAdmin],
   /** §36's fleet tree gates Invoices on finance.read. */
   fleet_administrator: [financeRead, organizationAdmin],
+  /**
+   * 085 — the insurer's ORG ADMIN.
+   *
+   * `organizationAdmin` is what makes the role meaningful: it is the permission
+   * the insurance and towing organisations had NO holder of, which is why they
+   * could never appoint a second member. Modelled on `supplier_owner` and
+   * `fleet_administrator` above, which have carried exactly this pair since
+   * they were written.
+   *
+   * ⚠️ A GRANTABLE ROLE WITH NO ENTRY IN THIS MAP SILENTLY GETS NOTHING —
+   * `permissionsForRole` returns `[]` for an unknown key rather than throwing.
+   * That is the fail-closed direction and it is also how a new role ships
+   * looking present and doing nothing, so an addition to `GRANTABLE_ROLES`
+   * without an addition here is a defect, not an omission.
+   */
+  insurance_owner: [financeRead, organizationAdmin],
   /** §37's insurance tree gates Payments and Claim Costs on finance.read. */
   insurance_assessor: [financeRead],
+  /**
+   * 085 — the towing firm's ORG ADMIN. `financeRead` because the admin sees the
+   * firm's own invoices; §52's operational tree still has no gated entry, which
+   * is why `towing_operator` below keeps its empty list.
+   */
+  towing_owner: [financeRead, organizationAdmin],
   /** §52's towing tree has no gated entry. */
   towing_operator: [],
   /** §33's customer tree has no gated entry — a customer's own invoices are
@@ -275,6 +297,19 @@ export const ROLE_PRECEDENCE: readonly string[] = Object.freeze([
   'workshop_owner',
   'supplier_owner',
   'fleet_administrator',
+  // 🔴 085 — AND THIS IS THE SITE THE ORIGINAL ELEVEN-FILE SURVEY MISSED.
+  //
+  // A role absent from this list ranks WEAKEST (`Number.MAX_SAFE_INTEGER`, see
+  // `rolePrecedence` below), so default-role selection silently prefers ANY
+  // other membership the person holds. An org admin that loses the tie-break to
+  // `customer` would sign in to the wrong workspace and read as a permissions
+  // bug rather than a missing list entry.
+  //
+  // Placed beside the other three org admins because that is what they are:
+  // each is the top authority inside one organisation type, and none outranks
+  // another. Their operational roles keep their existing, lower positions.
+  'insurance_owner',
+  'towing_owner',
   'workshop_manager',
   'workshop_supervisor',
   'quality_control_inspector',
diff --git a/apps/api/src/identity/membership-role-fit.spec.ts b/apps/api/src/identity/membership-role-fit.spec.ts
index 21ad435..e1c8857 100644
--- a/apps/api/src/identity/membership-role-fit.spec.ts
+++ b/apps/api/src/identity/membership-role-fit.spec.ts
@@ -68,20 +68,82 @@ describe('role ↔ organisation-type fit', () => {
     }
   });
 
-  it('the partner organisation types each admit exactly their own role', () => {
+  it('the partner organisation types each admit exactly their designed roles', () => {
     // Read as literal text rather than evaluated, so this asserts what the file
-    // SAYS. The four partner types are one-role each by design; widening one is
-    // a decision that should fail a test rather than pass unnoticed.
-    for (const [orgType, role] of [
-      ['parts_supplier', 'supplier_owner'],
-      ['fleet_operator', 'fleet_administrator'],
-      ['insurance_company', 'insurance_assessor'],
-      ['towing_company', 'towing_operator'],
+    // SAYS. Widening one of these is a decision that should fail a test rather
+    // than pass unnoticed — and on 2026-08-17 it did exactly that, which is why
+    // the expectations below changed rather than the assertion being relaxed.
+    //
+    // 🔴 THE DECISION THIS NOW ENCODES (migration 085). Insurance and towing
+    // each gained an ORG ADMIN, because neither had one: `insurance_assessor`
+    // and `towing_operator` are absent from `CAN_GRANT_MEMBERSHIP`, so those two
+    // organisation types could hold exactly one member — the founder — for ever.
+    // Supplier and fleet were never affected: `supplier_owner` and
+    // `fleet_administrator` are org admins already, which is why they remain
+    // one-role entries and are the model the other two were fitted to.
+    //
+    // ⚠️ ORDER MATTERS HERE and it is not incidental: the admin is listed first
+    // in the source, mirroring `ROLE_PRECEDENCE`, so a reader of either file
+    // sees the same authority ordering.
+    for (const [orgType, roles] of [
+      ['parts_supplier', ['supplier_owner']],
+      ['fleet_operator', ['fleet_administrator']],
+      ['insurance_company', ['insurance_owner', 'insurance_assessor']],
+      ['towing_company', ['towing_owner', 'towing_operator']],
     ] as const) {
       const line = new RegExp(`${orgType}:\\s*\\[([^\\]]*)\\]`).exec(source);
       expect(line, `${orgType} has no entry`).toBeTruthy();
-      const roles = [...(line?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
-      expect(roles, `${orgType} should admit exactly ${role}`).toEqual([role]);
+      const found = [...(line?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
+      expect(found, `${orgType} should admit exactly ${roles.join(', ')}`).toEqual([...roles]);
+    }
+  });
+
+  it('every organisation type that can be REGISTERED has a role that can GRANT', () => {
+    // 🔴 THE CHECK THAT WOULD HAVE CAUGHT THIS CLASS ON 2026-08-14, when the
+    // insurance marketplace shipped, rather than on 08-16 when somebody thought
+    // to ask. It is the generalisation of the defect, not a restatement of the
+    // fix: a self-service organisation type whose roles are all ungranting can
+    // never build a team, and every screen above it is unreachable for everyone
+    // except its founder.
+    //
+    // Both lists are read as TEXT from their own source files. Importing them
+    // would make them agree by construction — the same reasoning
+    // `permission-matrix.spec.ts` gives for retyping `GRANTABLE_ROLES`.
+    const service = readFileSync(
+      join(__dirname, 'membership.service.ts'),
+      'utf8',
+    );
+    const grantBlock = /CAN_GRANT_MEMBERSHIP\s*=\s*new Set\(\[([\s\S]*?)\]\)/.exec(service);
+    expect(grantBlock, 'could not find CAN_GRANT_MEMBERSHIP').toBeTruthy();
+    const canGrant = new Set(
+      [...(grantBlock?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]),
+    );
+    // Guard: without this the assertion below runs against an empty set and
+    // passes while proving nothing.
+    expect(canGrant.size).toBeGreaterThanOrEqual(4);
+
+    // The six organisation types a person can create for themselves through
+    // `/onboarding` — each has a `register_*` function in the migrations.
+    for (const orgType of [
+      'individual_workshop',
+      'parts_supplier',
+      'fleet_operator',
+      'insurance_company',
+      'towing_company',
+    ] as const) {
+      const line = new RegExp(`${orgType}:\\s*(\\[[^\\]]*\\]|[A-Z_]+)`).exec(source);
+      expect(line, `${orgType} has no entry`).toBeTruthy();
+      const literal = line?.[1] ?? '';
+      // `individual_workshop` points at WORKSHOP_ROLE_SET rather than an inline
+      // array; it contains `workshop_owner`, which is in the grant set.
+      const roles = literal.startsWith('[')
+        ? [...literal.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!)
+        : ['workshop_owner'];
+      expect(
+        roles.some((r) => canGrant.has(r)),
+        `${orgType} admits [${roles.join(', ')}], none of which may grant a membership — ` +
+          'an organisation of this type could never appoint a second member',
+      ).toBe(true);
     }
   });
 
diff --git a/apps/api/src/identity/membership.service.ts b/apps/api/src/identity/membership.service.ts
index 30b4cf1..6722653 100644
--- a/apps/api/src/identity/membership.service.ts
+++ b/apps/api/src/identity/membership.service.ts
@@ -37,6 +37,20 @@ const CAN_GRANT_MEMBERSHIP = new Set([
   'workshop_owner',
   'supplier_owner',
   'fleet_administrator',
+  // 🔴 ADDED BY 085. Until then this set had FOUR entries and two of the six
+  // self-service organisation types were absent from it — so an insurance
+  // company and a towing firm could create exactly ONE member, the founder,
+  // and never a second one. Ten insurance screens and ten towing screens sat
+  // above a team that could not be assembled.
+  //
+  // ⚠️ These are ORG-ADMIN roles, deliberately distinct from the operational
+  // `insurance_assessor` / `towing_operator`. Adding the OPERATIONAL roles here
+  // would have been one line shorter and wrong: it hands the person who
+  // assesses a claim the authority to appoint the person who approves it,
+  // destroying the separation of duty the insurance-governance slice exists to
+  // create. Migration 085 has the full reasoning and the two rejected options.
+  'insurance_owner',
+  'towing_owner',
 ]);
 
 /**
@@ -63,7 +77,13 @@ const GRANTABLE_ROLES = new Set([
   // other workspaces
   'supplier_owner',
   'fleet_administrator',
+  // 085 — the org admins for insurance and towing. Grantable so that a
+  // platform administrator can appoint a replacement when a founder leaves;
+  // without that an insurer whose founder departs is unadministrable for ever,
+  // which is the same dead end 085 exists to remove, one step later.
+  'insurance_owner',
   'insurance_assessor',
+  'towing_owner',
   'towing_operator',
   'customer',
 ]);
@@ -81,7 +101,9 @@ const WORKSHOP_ROLE_SET: readonly string[] = [
     (r) =>
       r !== 'supplier_owner' &&
       r !== 'fleet_administrator' &&
+      r !== 'insurance_owner' &&
       r !== 'insurance_assessor' &&
+      r !== 'towing_owner' &&
       r !== 'towing_operator',
   ),
   // Not in `GRANTABLE_ROLES` — it cannot be granted through this service at all
@@ -124,8 +146,14 @@ const ROLES_BY_ORG_TYPE: Readonly<Record<string, readonly string[]>> = Object.fr
 
   parts_supplier: ['supplier_owner'],
   fleet_operator: ['fleet_administrator'],
-  insurance_company: ['insurance_assessor'],
-  towing_company: ['towing_operator'],
+  // 085 — each of these now admits its ORG ADMIN and its OPERATIONAL role.
+  // The admin is what `CAN_GRANT_MEMBERSHIP` recognises; the operational role
+  // is what the admin appoints. Before 085 each list held only the operational
+  // role, so the only member these organisations could have was one nobody
+  // could have granted — and in fact nobody did: migration 080's registration
+  // function wrote it directly, which is why the dead end was invisible.
+  insurance_company: ['insurance_owner', 'insurance_assessor'],
+  towing_company: ['towing_owner', 'towing_operator'],
 
   // The platform's own organisation, if one is ever created. Named because
   // leaving it out would refuse the one role that obviously belongs in it.
diff --git a/apps/api/src/identity/registration.controller.ts b/apps/api/src/identity/registration.controller.ts
index dcf0ba2..e2daf36 100644
--- a/apps/api/src/identity/registration.controller.ts
+++ b/apps/api/src/identity/registration.controller.ts
@@ -403,7 +403,11 @@ export class RegistrationController {
         parsed.insurerName,
         parsed.locationName,
       );
-      return { ...created, roleName: 'insurance_assessor', verificationStatus: 'pending' };
+      // 085 — mirrors migration 085's `register_insurer`, which now writes the
+      // ORG ADMIN. This literal is a REPORT of what the database did, so it is
+      // wrong the moment it disagrees with the function; `verify/085` asserts
+      // the function's side and `registration.controller` carries this side.
+      return { ...created, roleName: 'insurance_owner', verificationStatus: 'pending' };
     } catch (err) {
       // 🔴 THE DATABASE'S REFUSAL MUST REACH THE USER AS AN ANSWER, NOT A 500.
       // `registerWorkshop` shipped that exact defect: a double-submitted form
@@ -449,7 +453,8 @@ export class RegistrationController {
         parsed.companyName,
         parsed.locationName,
       );
-      return { ...created, roleName: 'towing_operator', verificationStatus: 'pending' };
+      // 085 — see the insurance route above; the founder is the firm's admin.
+      return { ...created, roleName: 'towing_owner', verificationStatus: 'pending' };
     } catch (err) {
       const message = err instanceof Error ? err.message : String(err);
       if (message.includes('already belongs to an organisation')) {
diff --git a/apps/api/src/insurance/insurance-roles.ts b/apps/api/src/insurance/insurance-roles.ts
index fd5e2fe..f4424a5 100644
--- a/apps/api/src/insurance/insurance-roles.ts
+++ b/apps/api/src/insurance/insurance-roles.ts
@@ -30,7 +30,17 @@ import type { TenantContext } from '../tenancy/tenant-context';
  * It confers nothing extra here — the RLS policies still scope every read to
  * the caller's own organisation unless they hold the platform grant.
  */
-export const INSURANCE_ROLES = ['insurance_assessor', 'platform_administrator'] as const;
+// 🔴 `insurance_owner` ADDED BY 085, AND ITS ABSENCE WOULD HAVE BEEN SILENT.
+// From 085 onward the founder of an insurance company holds `insurance_owner`,
+// so leaving this list unchanged would have refused every insurer's OWN
+// administrator from every insurance endpoint — the organisation's only member
+// locked out of the module it exists to use. This is the same shape as the
+// defect recorded on 2026-08-09, where a role gate refused four apps' own users.
+export const INSURANCE_ROLES = [
+  'insurance_owner',
+  'insurance_assessor',
+  'platform_administrator',
+] as const;
 
 export function isInsuranceOperator(ctx: TenantContext): boolean {
   return (INSURANCE_ROLES as readonly string[]).includes(ctx.activeRole);
diff --git a/apps/api/src/towing/towing-roles.ts b/apps/api/src/towing/towing-roles.ts
index fcf890a..884f88a 100644
--- a/apps/api/src/towing/towing-roles.ts
+++ b/apps/api/src/towing/towing-roles.ts
@@ -33,6 +33,12 @@ import type { TenantContext } from '../tenancy/tenant-context';
  * role the navigation gives no way to reach.
  */
 export const TOWING_ROLES = [
+  // 🔴 `towing_owner` ADDED BY 085 — see the note in `insurance-roles.ts`.
+  // From 085 onward the founder of a towing company holds this role, so its
+  // absence here would refuse every towing firm's own administrator from the
+  // towing module: ten screens, and the organisation's only member unable to
+  // open any of them.
+  'towing_owner',
   'towing_operator',
   'workshop_owner',
   'workshop_manager',
diff --git a/apps/web/app/onboarding/account-types.spec.ts b/apps/web/app/onboarding/account-types.spec.ts
index 79a2ea9..84856c6 100644
--- a/apps/web/app/onboarding/account-types.spec.ts
+++ b/apps/web/app/onboarding/account-types.spec.ts
@@ -140,24 +140,55 @@ describe('the roles the onboarding screen names', () => {
     // much wider question — it is what an EXISTING owner may confer, and a
     // handover note conflated the two lists on 2026-08-13. Offering a role from
     // that wider set would put a button on this screen with no door behind it.
+    // 🔴 THE LAST DEFINITION OF EACH DOOR WINS, NOT THE UNION OF ALL OF THEM.
+    //
+    // This reader used to add every role literal it found near an
+    // `INSERT INTO identity.memberships` in ANY migration, into one flat set.
+    // That is wrong the first time a function is redefined, and migration 085
+    // is that first time: it `CREATE OR REPLACE`s `register_insurer` to write
+    // `insurance_owner` instead of `insurance_assessor`, and 080 still sits on
+    // disk containing the old literal for ever. The union therefore claimed the
+    // insurance door writes BOTH roles, when the database runs only the later
+    // body.
+    //
+    // A migration directory is an ordered ledger, not a bag of files. Keyed by
+    // FUNCTION and replayed in order, this asks the question the test name
+    // claims: what does each self-service door write TODAY?
+    //
+    // ⚠️ The role vocabulary is no longer hardcoded either. It used to be an
+    // alternation of six names, so a genuinely new role was invisible to the
+    // check — it could not fail, which is this repository's most-recorded
+    // defect class. Now any single-quoted literal in the membership INSERT is
+    // read, and it is `expected` vs `offered` that has to agree.
     const migrations = join(__dirname, '../../../../infrastructure/migrations');
-    const written = new Set<string>();
-    for (const file of readdirSync(migrations).filter((f) => f.endsWith('.sql'))) {
+    const doorWrites = new Map<string, string>();
+    for (const file of readdirSync(migrations)
+      .filter((f) => f.endsWith('.sql'))
+      .sort()) {
       const sql = readFileSync(join(migrations, file), 'utf8');
-      for (const m of sql.matchAll(/INSERT INTO identity\.memberships[\s\S]{0,600}?/g)) {
-        const window = sql.slice(m.index, m.index + 600);
-        for (const r of window.matchAll(
-          /'(workshop_owner|supplier_owner|fleet_administrator|customer|insurance_assessor|towing_operator)'/g,
-        )) {
-          if (r[1]) written.add(r[1]);
-        }
+      for (const fn of sql.matchAll(
+        /CREATE OR REPLACE FUNCTION identity\.(register_\w+)\s*\(/g,
+      )) {
+        const name = fn[1];
+        if (!name || fn.index === undefined) continue;
+        // The body ends at the function's closing `$$;`.
+        const close = sql.indexOf('$$;', fn.index);
+        const body = sql.slice(fn.index, close === -1 ? sql.length : close);
+        const ins = body.indexOf('INSERT INTO identity.memberships');
+        if (ins === -1) continue;
+        const role = /role_name[\s\S]{0,400}?'([a-z_]+)'\s*,\s*'active'/.exec(
+          body.slice(ins, ins + 700),
+        );
+        if (role?.[1]) doorWrites.set(name, role[1]);
       }
     }
 
     expect(
-      written.size,
-      'no self-service role literal found in any migration — the reader is broken, not the product',
-    ).toBeGreaterThanOrEqual(6);
+      doorWrites.size,
+      'no self-service registration function found — the reader is broken, not the product',
+    ).toBeGreaterThanOrEqual(5);
+
+    const written = new Set(doorWrites.values());
 
     const offered = new Set(
       ACCOUNT_TYPES.map((t) => t.roleName).filter((r): r is string => r !== null),
diff --git a/apps/web/app/onboarding/account-types.ts b/apps/web/app/onboarding/account-types.ts
index 5c06e41..7843906 100644
--- a/apps/web/app/onboarding/account-types.ts
+++ b/apps/web/app/onboarding/account-types.ts
@@ -248,7 +248,11 @@ export const ACCOUNT_TYPES: readonly AccountType[] = [
       'Review claims on vehicles being repaired, assess damage, and authorise repair work.',
     href: '/insurance/home/dashboard',
     cta: 'Register my company',
-    roleName: 'insurance_assessor',
+    // 085 — the founder is the company's ADMINISTRATOR, not one of its
+    // assessors. This field documents "the role literal the migration writes",
+    // so it must track migration 085's `register_insurer`; a stale value here
+    // tells the person signing up they will become something they will not.
+    roleName: 'insurance_owner',
     features: groupsOf('insurance'),
     // 🔴 THE TENANCY GUARANTEE, STATED WHERE THE DECISION IS MADE. Migration
     // 080 gives the company its own tenant precisely because an insurer and the
@@ -264,7 +268,9 @@ export const ACCOUNT_TYPES: readonly AccountType[] = [
       'Take recovery requests, run a dispatch board, and manage your drivers and recovery vehicles.',
     href: '/towing/operations/dashboard',
     cta: 'Register my company',
-    roleName: 'towing_operator',
+    // 085 — the founder is the firm's ADMINISTRATOR. Same reasoning as the
+    // insurance door above.
+    roleName: 'towing_owner',
     features: groupsOf('towing'),
     // ⚠️ THE ONLY DOOR WHOSE WORKSPACE IS ALREADY FINISHED. Migration 074 built
     // all ten towing screens on 2026-08-09; only the door was missing. Said
diff --git a/packages/next-shell/src/viewer-contract.ts b/packages/next-shell/src/viewer-contract.ts
index ac3ec45..50ce451 100644
--- a/packages/next-shell/src/viewer-contract.ts
+++ b/packages/next-shell/src/viewer-contract.ts
@@ -126,7 +126,15 @@ const NON_WORKSHOP_ROLES: ReadonlySet<string> = new Set([
   'customer',
   'supplier_owner',
   'fleet_administrator',
+  // 085 — the two org admins are as foreign to the workshop as the operational
+  // roles they administer. Omitting them would have had the OPPOSITE effect of
+  // the bug this set was written for: instead of refusing a role its own
+  // workspace, it would have handed an insurer's administrator the workshop's
+  // default staff tree, which is precisely what happened to
+  // `platform_administrator` and was reported by the owner on 2026-08-09.
+  'insurance_owner',
   'insurance_assessor',
+  'towing_owner',
   'towing_operator',
 ]);
 
@@ -161,7 +169,15 @@ const HOME_WORKSPACE: Readonly<Record<string, string>> = {
   customer: 'customer',
   supplier_owner: 'supplier',
   fleet_administrator: 'fleet',
+  // 085 — an org admin lands in the workspace it administers. A role in
+  // `NON_WORKSHOP_ROLES` but absent from THIS map is foreign to the workshop
+  // and at home nowhere, which is the strictly worst of the two lists to be
+  // half-listed in: `homeWorkspaceFor()` is also what the role and organisation
+  // switchers now use to decide where to send someone, so a missing entry
+  // strands the viewer exactly as the 2026-08-16 switcher defect did.
+  insurance_owner: 'insurance',
   insurance_assessor: 'insurance',
+  towing_owner: 'towing',
   towing_operator: 'towing',
   /**
    * 🔴 THE OWNER'S REPORT, 2026-08-09: "if i log in as the owner and sign out
warning: in the working copy of 'apps/api/src/authz/permission-matrix.spec.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'apps/api/src/authz/permission-matrix.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'apps/api/src/identity/membership-role-fit.spec.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'apps/api/src/insurance/insurance-roles.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'apps/api/src/towing/towing-roles.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'apps/web/app/onboarding/account-types.spec.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'apps/web/app/onboarding/account-types.ts', LF will be replaced by CRLF the next time Git touches it

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content infrastructure/migrations/085_insurance_and_towing_org_admin.sql; Get-Content 
infrastructure/migrations/verify/085_insurance_and_towing_org_admin.sql' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 719ms:
-- 085 â€” insurance and towing get an ORG ADMIN, the way supplier and fleet have one.
--
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â
•â•â•â•â•â•â•â•â•â•â•
-- WHY THIS EXISTS: TWO OF THE SIX SELF-SERVICE ORGANISATION TYPES COULD NEVER
-- APPOINT ANYBODY.
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â
•â•â•â•â•â•â•â•â•â•â•
--
-- Measured on 2026-08-16 and re-measured on 2026-08-17 before writing this:
--
--     CAN_GRANT_MEMBERSHIP  (apps/api/src/identity/membership.service.ts:35)
--       = { platform_administrator, workshop_owner,
--           supplier_owner, fleet_administrator }
--
-- `insurance_assessor` is not in it. `towing_operator` is not in it. That set
-- is the ONLY gate on granting, `membership.service.ts:345` is the ONLY
-- `INSERT INTO identity.memberships` in the entire API, and migration 080
-- writes just the founder's own membership. Three independent measurements,
-- one conclusion: **an insurance company or a towing firm could create exactly
-- one member â€” the founder â€” and never a second one, for ever.**
--
-- Ten insurance screens and ten towing screens exist above a team that cannot
-- be built. This is the same defect class as the five roles that had no
-- production writer (`customer`, `supplier_owner`, `fleet_administrator`,
-- `insurance_assessor`/`towing_operator`, `platform_administrator`) â€” and it
-- was found by asking that same question of a role BEFORE building it, which
-- is what stopped `claims_approver` from becoming the sixth.
--
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â
•â•â•â•â•â•â•â•â•â•â•
-- THE SHAPE, AND THE TWO ALTERNATIVES THAT WERE REJECTED
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â
•â•â•â•â•â•â•â•â•â•â•
--
-- Chosen: a distinct org-admin role per organisation type â€” `insurance_owner`
-- and `towing_owner` â€” exactly mirroring `supplier_owner` and
-- `fleet_administrator`, which already work this way. The founder becomes the
-- org admin; the operational role stays operational.
--
-- REJECTED 1 â€” add `insurance_assessor` to `CAN_GRANT_MEMBERSHIP`. Cheapest,
-- one line, and wrong: it hands the person who ASSESSES claims the authority
-- to appoint the person who APPROVES them. The separation of duty that the
-- insurance-governance slice exists to create would not exist in practice.
--
-- REJECTED 2 â€” platform-administrator-only appointment. Honest, but it makes
-- every appointment a support ticket. That is an operating procedure, not a
-- product, and this repository has already rejected the identical argument
-- once: it is why the admin insurance-verification SCREEN was built rather
-- than leaving verification to hand-called API endpoints.
--
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â
•â•â•â•â•â•â•â•â•â•â•
-- WHY A NEW NUMBER RATHER THAN AN EDIT TO 080
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â
•â•â•â•â•â•â•â•â•â•â•
--
-- 080 is applied and checksummed. Editing an applied migration was an error
-- made on 2026-08-14 and the rule it produced has no exception: a fix goes in
-- the next number. `CREATE OR REPLACE FUNCTION` is the supported way to change
-- a function's body without touching the migration that first created it.
--
-- âš ï¸ `CREATE OR REPLACE FUNCTION` HAS NO PARTIAL FORM â€” 080 says so itself, at
-- its own line 436. Each function below is REPRODUCED IN FULL from 080 with
-- exactly one literal changed, because there is no way to replace only the
-- INSERT. The bodies were read from 080 rather than remembered.

-- â”€â”€ 1. the insurer's founder is the insurer's ADMIN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE OR REPLACE FUNCTION identity.register_insurer(
    p_subject       TEXT,
    p_insurer_name  TEXT,
    p_location_name TEXT
)
-- âš ï¸ THE `o_` PREFIX IS LOAD-BEARING â€” 061's note, inherited. A `RETURNS TABLE`
-- column is an ordinary plpgsql variable inside the body, so a column named
-- `organization_id` makes every unqualified reference ambiguous, and plpgsql
-- resolves identifiers when the statement FIRST EXECUTES. The failure is at
-- runtime; `CREATE FUNCTION` reports success either way.
RETURNS TABLE (
    o_tenant_id       uuid,
    o_organization_id uuid,
    o_branch_id       uuid,
    o_membership_id   uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = identity, pg_catalog, pg_temp
AS $$
DECLARE
    v_user   uuid;
    v_tenant uuid;
    v_org    uuid;
    v_branch uuid;
    v_member uuid;
    v_slug   TEXT;
BEGIN
    IF p_insurer_name IS NULL OR btrim(p_insurer_name) = '' THEN
        RAISE EXCEPTION 'an insurance company needs a name';
    END IF;

    SELECT id INTO v_user
      FROM identity.users
     WHERE keycloak_subject = p_subject
       AND status = 'active';

    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no active application user for this identity';
    END IF;

    -- The per-identity advisory lock, unchanged from 080. The KEY IS THE
    -- IDENTITY, NOT THE KIND: it serialises one person's registrations across
    -- ALL five doors. `_xact_`, so it is released when the transaction ends
    -- including on the exception paths below.
    PERFORM pg_advisory_xact_lock(hashtextextended('identity.register:' || v_user::text, 0));

    -- â”€â”€ the door opens here, and only here â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    PERFORM set_config('app.bootstrap',      'on',         true);
    PERFORM set_config('app.bootstrap_user', v_user::text, true);

    -- One organisation per person. AFTER the flag is set AND after the lock:
    -- under FORCE RLS with no tenant context this read returns zero rows for
    -- everybody, so placing it earlier would make it a check that cannot fire.
    IF EXISTS (SELECT 1 FROM identity.memberships
                WHERE user_id = v_user AND status = 'active') THEN
        PERFORM set_config('app.bootstrap',      '', true);
        PERFORM set_config('app.bootstrap_user', '', true);
        RAISE EXCEPTION 'this account already belongs to an organisation. Sign in with a different account to register an insurance company, or ask a platform administrator to add you to an 
existing one.';
    END IF;

    v_slug := regexp_replace(lower(btrim(p_insurer_name)), '[^a-z0-9]+', '-', 'g');
    v_slug := btrim(v_slug, '-');
    IF v_slug = '' THEN
        v_slug := 'insurer';
    END IF;
    v_slug := left(v_slug, 40) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

    v_tenant := gen_random_uuid();
    v_org    := gen_random_uuid();
    v_branch := gen_random_uuid();
    v_member := gen_random_uuid();

    INSERT INTO identity.tenants (id, name, slug, status, created_by)
    VALUES (v_tenant, btrim(p_insurer_name), v_slug, 'active', v_user);

    -- ðŸ”´ LITERAL 1 of 2: `insurance_company`, one of the ten values
    -- `organizations_org_type_check` admits. Not `insurer`, which is plausible
    -- and absent; `register_workshop` died on exactly that mistake.
    INSERT INTO identity.organizations (id, tenant_id, name, org_type, status, created_by)
    VALUES (v_org, v_tenant, btrim(p_insurer_name), 'insurance_company', 'active', v_user);

    INSERT INTO identity.branches (id, tenant_id, organization_id, name, status, created_by)
    VALUES (v_branch, v_tenant, v_org,
            COALESCE(NULLIF(btrim(p_location_name), ''), 'Head office'),
            'active', v_user);

    -- ðŸ”´ LITERAL 2 of 2, AND THE ONE LINE 085 CHANGES: `insurance_owner`, not
    -- `insurance_assessor`.
    --
    -- The founder registers the COMPANY, so the founder is its administrator.
    -- Writing the operational role here is what left insurers unable to appoint
    -- anyone: `insurance_assessor` is not in `CAN_GRANT_MEMBERSHIP`, so the only
    -- member an insurer had was also the only member it could ever have.
    --
    -- âš ï¸ The spelling must match `permission-matrix.ts` and `membership.service.ts`
    -- exactly. Two literals in two files that cannot be type-checked into
    -- agreement is this repository's most-recorded root cause, which is why
    -- `verify/085` asserts the role written here against those allow-lists.
    INSERT INTO identity.memberships
        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'insurance_owner', 'active', v_user);

    -- Queued INSIDE the same transaction that creates the insurer.
    INSERT INTO identity.organization_registrations
        (tenant_id, organization_id, kind, status, submitted_by)
    VALUES (v_tenant, v_org, 'insurance', 'pending', v_user);

    -- â”€â”€ and the door closes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    PERFORM set_config('app.bootstrap',      '', true);
    PERFORM set_config('app.bootstrap_user', '', true);

    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
END;
$$;

COMMENT ON FUNCTION identity.register_insurer(TEXT, TEXT, TEXT) IS
'Self-service registration for an insurance company: creates a tenant, an '
'insurance_company organisation, one office and an INSURANCE_OWNER membership '
'for the CALLER, resolved from the token subject, and queues the company for '
'admin verification. The role and the org type are literals, never parameters. '
'085 changed the founder role from insurance_assessor to insurance_owner: the '
'assessor role cannot grant memberships, so an insurer founded before 085 '
'could never appoint a second member. insurance_owner is the org admin and '
'grants insurance_assessor (and later claims_approver), mirroring '
'supplier_owner and fleet_administrator.';

-- â”€â”€ 2. the towing firm's founder is the towing firm's ADMIN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE OR REPLACE FUNCTION identity.register_towing_operator(
    p_subject       TEXT,
    p_company_name  TEXT,
    p_location_name TEXT
)
RETURNS TABLE (
    o_tenant_id       uuid,
    o_organization_id uuid,
    o_branch_id       uuid,
    o_membership_id   uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = identity, pg_catalog, pg_temp
AS $$
DECLARE
    v_user   uuid;
    v_tenant uuid;
    v_org    uuid;
    v_branch uuid;
    v_member uuid;
    v_slug   TEXT;
BEGIN
    IF p_company_name IS NULL OR btrim(p_company_name) = '' THEN
        RAISE EXCEPTION 'a towing company needs a name';
    END IF;

    SELECT id INTO v_user
      FROM identity.users
     WHERE keycloak_subject = p_subject
       AND status = 'active';

    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no active application user for this identity';
    END IF;

    -- Same per-identity lock as the other four doors. See `register_insurer`.
    PERFORM pg_advisory_xact_lock(hashtextextended('identity.register:' || v_user::text, 0));

    PERFORM set_config('app.bootstrap',      'on',         true);
    PERFORM set_config('app.bootstrap_user', v_user::text, true);

    IF EXISTS (SELECT 1 FROM identity.memberships
                WHERE user_id = v_user AND status = 'active') THEN
        PERFORM set_config('app.bootstrap',      '', true);
        PERFORM set_config('app.bootstrap_user', '', true);
        RAISE EXCEPTION 'this account already belongs to an organisation. Sign in with a different account to register a towing company, or ask a platform administrator to add you to an existing 
one.';
    END IF;

    v_slug := regexp_replace(lower(btrim(p_company_name)), '[^a-z0-9]+', '-', 'g');
    v_slug := btrim(v_slug, '-');
    IF v_slug = '' THEN
        v_slug := 'towing';
    END IF;
    v_slug := left(v_slug, 40) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

    v_tenant := gen_random_uuid();
    v_org    := gen_random_uuid();
    v_branch := gen_random_uuid();
    v_member := gen_random_uuid();

    INSERT INTO identity.tenants (id, name, slug, status, created_by)
    VALUES (v_tenant, btrim(p_company_name), v_slug, 'active', v_user);

    -- ðŸ”´ LITERAL 1 of 2: `towing_company`.
    INSERT INTO identity.organizations (id, tenant_id, name, org_type, status, created_by)
    VALUES (v_org, v_tenant, btrim(p_company_name), 'towing_company', 'active', v_user);

    INSERT INTO identity.branches (id, tenant_id, organization_id, name, status, created_by)
    VALUES (v_branch, v_tenant, v_org,
            COALESCE(NULLIF(btrim(p_location_name), ''), 'Main depot'),
            'active', v_user);

    -- ðŸ”´ LITERAL 2 of 2, AND THE ONE LINE 085 CHANGES: `towing_owner`.
    -- Same reasoning as `register_insurer` above â€” the founder is the admin.
    INSERT INTO identity.memberships
        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'towing_owner', 'active', v_user);

    INSERT INTO identity.organization_registrations
        (tenant_id, organization_id, kind, status, submitted_by)
    VALUES (v_tenant, v_org, 'towing', 'pending', v_user);

    PERFORM set_config('app.bootstrap',      '', true);
    PERFORM set_config('app.bootstrap_user', '', true);

    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
END;
$$;

COMMENT ON FUNCTION identity.register_towing_operator(TEXT, TEXT, TEXT) IS
'Self-service registration for a towing company: creates a tenant, a '
'towing_company organisation, one depot and a TOWING_OWNER membership for the '
'CALLER, resolved from the token subject, and queues the company for admin '
'verification. 085 changed the founder role from towing_operator to '
'towing_owner for the same reason as register_insurer: the operator role '
'cannot grant memberships, so a towing firm founded before 085 could never '
'appoint a driver or a second operator.';

-- â”€â”€ 3. the founders who already exist â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
--
-- ðŸ”´ A MIGRATION THAT ONLY FIXES THE FUTURE LEAVES EVERY EXISTING INSURER AND
-- TOWING FIRM PERMANENTLY UNABLE TO BUILD A TEAM. The whole defect is about
-- organisations that exist; skipping the backfill would fix the door and leave
-- everyone already inside it stuck.
--
-- WHO IS A FOUNDER, defined so the rule is auditable rather than guessed:
-- the registration functions above insert the founder with
-- `created_by = user_id` (they created their own membership â€” nobody else
-- could have, since the organisation did not exist a moment earlier), and it
-- is the organisation's EARLIEST membership. Both conditions are required:
--
--   Â· `created_by = user_id` alone would also match a hypothetical
--     self-granted row, and
--   Â· "earliest" alone would match an organisation whose first member was
--     added by someone else.
--
-- âš ï¸ DELIBERATELY NOT `UPDATE ... WHERE role_name = 'insurance_assessor'`.
-- That would promote EVERY assessor in the organisation to administrator â€”
-- turning a fix for a missing write path into a privilege escalation for
-- every existing member. Exactly one membership per organisation changes.
WITH founders AS (
    SELECT DISTINCT ON (m.organization_id)
           m.id,
           o.org_type
      FROM identity.memberships m
      JOIN identity.organizations o
        ON o.id = m.organization_id
       AND o.tenant_id = m.tenant_id
     WHERE o.org_type IN ('insurance_company', 'towing_company')
       AND m.created_by = m.user_id
       AND m.role_name IN ('insurance_assessor', 'towing_operator')
     ORDER BY m.organization_id, m.created_at ASC, m.id ASC
)
UPDATE identity.memberships m
   SET role_name = CASE f.org_type
                     WHEN 'insurance_company' THEN 'insurance_owner'
                     ELSE 'towing_owner'
                   END,
       updated_at = now()
  FROM founders f
 WHERE m.id = f.id;

-- â”€â”€ 4. prove the backfill did what it claims, in the same transaction â”€â”€â”€â”€â”€â”€â”€
--
-- ðŸ”´ AN ORPHAN CHECK THAT RUNS AFTER COMMIT IS A REPORT, NOT A GUARD. This
-- RAISEs inside the migration's own transaction, so a failure rolls the whole
-- thing back rather than leaving a half-migrated role vocabulary.
--
-- âš ï¸ AND IT MUST BE ABLE TO SEE THE ROWS. This migration runs as the owner
-- credential; under FORCE RLS a check with no tenant context reads zero rows
-- and "passes" vacuously â€” the failure mode recorded on 2026-08-16, where a
-- diagnostic reported `(0 rows)` because its `set_config` was transaction-local
-- and had already been discarded. `app.current_role` is set LOCAL here, which
-- is correct precisely because this IS one transaction.
DO $$
DECLARE
    v_stranded INT;
BEGIN
    PERFORM set_config('app.current_role', 'admin', true);

    -- An insurance or towing organisation with NO member who can grant is the
    -- exact condition this migration exists to remove. If any remain, the
    -- backfill's founder rule did not match reality and we must not ship.
    SELECT count(*) INTO v_stranded
      FROM identity.organizations o
     WHERE o.org_type IN ('insurance_company', 'towing_company')
       AND o.status = 'active'
       AND NOT EXISTS (
             SELECT 1
               FROM identity.memberships m
              WHERE m.organization_id = o.id
                AND m.tenant_id = o.tenant_id
                AND m.status = 'active'
                AND m.role_name IN ('insurance_owner', 'towing_owner')
           );

    IF v_stranded > 0 THEN
        RAISE EXCEPTION
          '085 would leave % insurance/towing organisation(s) with no member '
          'who can grant a membership. The founder rule (created_by = user_id '
          'AND earliest membership) did not match those organisations. '
          'Inspect them before re-running â€” do NOT relax the rule to '
          'role_name alone, which would promote every assessor.', v_stranded;
    END IF;
END;
$$;
-- verify/085 â€” an insurer and a towing firm can now BUILD A TEAM, and the
-- proof is a second membership granted by the founder, not by the platform.
--
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â
•â•â•â•â•â•â•â•â•â•
-- ðŸ”´ CHECK 4 IS THE WHOLE POINT. Everything before it is scaffolding.
--
-- 080's verify proved a founder membership could EXIST. That was necessary and
-- it was not sufficient: the founder held `insurance_assessor`, which is absent
-- from `CAN_GRANT_MEMBERSHIP`, so the organisation's first member was also its
-- LAST. Ten insurance screens and ten towing screens sat above a team that
-- could never be assembled.
--
-- So this file does not assert that a role name changed. It asserts the
-- CAPABILITY the role name exists to confer: that the founder produced by the
-- production registration function can grant a second membership, and that the
-- operational role still cannot. A test that only read `role_name` would pass
-- against a rename that fixed nothing.
--
-- âš ï¸ CHECK 5 IS THE ONE THAT WOULD CATCH A SILENT REGRESSION. The API's
-- allow-lists are TypeScript; this is SQL. Two literals in two files that
-- cannot be type-checked into agreement is this repository's most-recorded
-- root cause (nav vs router, landing vs pack, release.yml vs _deploy-render).
-- Check 5 reads the role the FUNCTION writes and fails if it is not one this
-- migration's own vocabulary admits â€” so a future edit to 085's literal that
-- forgets the TypeScript side is caught here rather than in production.
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â
•â•â•â•â•â•â•â•â•â•

DO $verify$
DECLARE
    v_subject_i TEXT := 'verify-085-i-' || replace(gen_random_uuid()::text, '-', '');
    v_subject_t TEXT := 'verify-085-t-' || replace(gen_random_uuid()::text, '-', '');
    v_subject_s TEXT := 'verify-085-s-' || replace(gen_random_uuid()::text, '-', '');
    v_user_i    uuid;
    v_user_t    uuid;
    v_staff     uuid;
    ri          record;
    rt          record;
    n           int;
    v_role      TEXT;
    passed      int := 0;
BEGIN
    PERFORM set_config('app.current_role', 'admin', true);

    -- â”€â”€ 1. three application users, created the way the product does â”€â”€â”€â”€â”€â”€â”€
    -- âš ï¸ `identity.users` is PLATFORM-GLOBAL and has no tenant_id â€” recorded
    -- 2026-08-16 after a diagnostic assumed otherwise and wrote nothing.
    INSERT INTO identity.users (id, keycloak_subject, email, display_name, status)
    VALUES (gen_random_uuid(), v_subject_i, v_subject_i || '@verify.local', 'Verify Insurer', 'active')
    RETURNING id INTO v_user_i;

    INSERT INTO identity.users (id, keycloak_subject, email, display_name, status)
    VALUES (gen_random_uuid(), v_subject_t, v_subject_t || '@verify.local', 'Verify Towing', 'active')
    RETURNING id INTO v_user_t;

    INSERT INTO identity.users (id, keycloak_subject, email, display_name, status)
    VALUES (gen_random_uuid(), v_subject_s, v_subject_s || '@verify.local', 'Verify Staff', 'active')
    RETURNING id INTO v_staff;

    passed := passed + 1;

    -- â”€â”€ 2. register both organisations through the PRODUCTION functions â”€â”€â”€â”€
    -- Not raw INSERTs. Ask of any green proof: could the PRODUCT have produced
    -- this fixture? Here it did.
    SELECT * INTO ri FROM identity.register_insurer(v_subject_i, 'Verify 085 Assurance', 'Head office');
    SELECT * INTO rt FROM identity.register_towing_operator(v_subject_t, 'Verify 085 Recovery', 'Main depot');
    passed := passed + 1;

    -- â”€â”€ 3. the founder holds the ORG-ADMIN role, not the operational one â”€â”€â”€
    SELECT role_name INTO v_role
      FROM identity.memberships WHERE id = ri.o_membership_id;
    IF v_role <> 'insurance_owner' THEN
        RAISE EXCEPTION 'verify/085 #3: register_insurer wrote role % â€” expected '
                        'insurance_owner. An insurer whose founder is an assessor '
                        'can never appoint anybody.', v_role;
    END IF;

    SELECT role_name INTO v_role
      FROM identity.memberships WHERE id = rt.o_membership_id;
    IF v_role <> 'towing_owner' THEN
        RAISE EXCEPTION 'verify/085 #3: register_towing_operator wrote role % â€” '
                        'expected towing_owner.', v_role;
    END IF;
    passed := passed + 1;

    -- â”€â”€ 4. ðŸ”´ THE CAPABILITY, NOT THE NAME â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- The founder's organisation can now receive a SECOND member. This is what
    -- was impossible before 085 and it is the only assertion that would fail
    -- against a rename that changed nothing else.
    --
    -- âš ï¸ The grant authority itself lives in the API (`CAN_GRANT_MEMBERSHIP`),
    -- not in a database CHECK â€” `role_name` is plain TEXT by design, documented
    -- in membership.service.ts. So this check proves the DATA SHAPE the API's
    -- rule depends on: an org-admin membership exists to be the grantor, and
    -- the roleâ†”organisation fit that `ROLES_BY_ORG_TYPE` enforces is satisfiable.
    INSERT INTO identity.memberships
        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
    VALUES (gen_random_uuid(), ri.o_tenant_id, ri.o_organization_id, ri.o_branch_id,
            v_staff, 'insurance_assessor', 'active', v_user_i);

    SELECT count(*) INTO n
      FROM identity.memberships
     WHERE organization_id = ri.o_organization_id AND status = 'active';
    IF n <> 2 THEN
        RAISE EXCEPTION 'verify/085 #4: the insurer has % active member(s) after '
                        'the founder appointed one â€” expected 2. The team cannot '
                        'be built, which is the entire defect 085 exists to fix.', n;
    END IF;
    passed := passed + 1;

    -- â”€â”€ 5. every insurance/towing organisation has a grantor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- The same invariant migration 085 asserts at apply time, re-asserted here
    -- against whatever the database actually contains â€” including rows the
    -- backfill touched, which the migration's own check ran before this file
    -- ever existed.
    SELECT count(*) INTO n
      FROM identity.organizations o
     WHERE o.org_type IN ('insurance_company', 'towing_company')
       AND o.status = 'active'
       AND NOT EXISTS (
             SELECT 1 FROM identity.memberships m
              WHERE m.organization_id = o.id
                AND m.tenant_id = o.tenant_id
                AND m.status = 'active'
                AND m.role_name IN ('insurance_owner', 'towing_owner')
           );
    IF n > 0 THEN
        RAISE EXCEPTION 'verify/085 #5: % insurance/towing organisation(s) have '
                        'no member who can grant a membership.', n;
    END IF;
    passed := passed + 1;

    -- â”€â”€ 6. the backfill promoted the FOUNDER ONLY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- ðŸ”´ THE FAILURE MODE THIS CATCHES IS PRIVILEGE ESCALATION, not a missing
    -- row. `UPDATE ... WHERE role_name = 'insurance_assessor'` would have been
    -- one word shorter and would have made every assessor an administrator.
    -- No organisation may hold more than one org admin as a result of 085.
    SELECT count(*) INTO n
      FROM (
        SELECT o.id
          FROM identity.organizations o
          JOIN identity.memberships m
            ON m.organization_id = o.id AND m.tenant_id = o.tenant_id
         WHERE o.org_type IN ('insurance_company', 'towing_company')
           AND m.status = 'active'
           AND m.role_name IN ('insurance_owner', 'towing_owner')
         GROUP BY o.id
        HAVING count(*) > 1
      ) AS over_promoted;
    IF n > 0 THEN
        RAISE EXCEPTION 'verify/085 #6: % organisation(s) have MORE THAN ONE '
                        'org admin. The backfill promoted more than the founder '
                        'â€” that is privilege escalation, not a migration.', n;
    END IF;
    passed := passed + 1;

    -- â”€â”€ CLEANUP 
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- Explicit DELETEs in dependency order, matching verify/080 rather than an
    -- exception-rollback: a verify that leaves fixtures behind pollutes the
    -- directory counts every later assertion reads, and check 5 above is
    -- exactly such a count.
    --
    -- âš ï¸ Notifications first, then the registration row, then the organisation
    -- â€” 069 scopes the registration to the org. Memberships include the SECOND
    -- one check 4 created, which is why this deletes by tenant rather than by
    -- the founder's membership id.
    DELETE FROM comms.notifications
     WHERE resource_type = 'organization_registration'
       AND resource_id IN (SELECT id FROM identity.organization_registrations
                            WHERE tenant_id IN (ri.o_tenant_id, rt.o_tenant_id));
    DELETE FROM identity.organization_registrations
     WHERE tenant_id IN (ri.o_tenant_id, rt.o_tenant_id);
    DELETE FROM identity.memberships   WHERE tenant_id IN (ri.o_tenant_id, rt.o_tenant_id);
    DELETE FROM identity.branches      WHERE tenant_id IN (ri.o_tenant_id, rt.o_tenant_id);
    DELETE FROM identity.organizations WHERE tenant_id IN (ri.o_tenant_id, rt.o_tenant_id);
    DELETE FROM identity.tenants       WHERE id IN (ri.o_tenant_id, rt.o_tenant_id);
    DELETE FROM identity.users         WHERE id IN (v_user_i, v_user_t, v_staff);

    RAISE NOTICE 'verify/085: % checks passed. Check 4 is the evidence â€” a '
                 'SECOND membership inside an insurer founded by the product, '
                 'which was impossible before 085.', passed;
END
$verify$;

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n --hidden --glob '"'!node_modules/**'"' --glob '"'!reviews/**'"' 
\"insurance_assessor|towing_operator|supplier_owner|fleet_administrator|insurance_owner|towing_owner|current_role|bootstrap\" ." in C:\Users\USER\Documents\autoworkshop-ai
codex
I’ve reached the key risk area: both SQL checks rely on `app.current_role = 'admin'`, so I’m now verifying the actual RLS policy predicates and whether “admin” is a recognized bypass value. I’m 
also checking all old-role references outside the edited files for missed routing or authorization gates.
2026-08-17T16:41:17.481323Z ERROR codex_core::tools::router: error=Exit code: 124
Wall time: 34.1 seconds
Output:
command timed out after 34051 milliseconds

 exited 124 in 34051ms:
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -l "insurance_assessor|towing_operator|supplier_owner|fleet_administrator|insurance_owner|towing_owner" apps packages 
infrastructure --glob "!**/dist/**" --glob "!**/.next/**"' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 1193ms:
infrastructure\seed\marketplace_population.sql
packages\next-shell\src\viewer.test.ts
packages\next-shell\src\viewer-contract.ts
packages\next-shell\src\switch-destination.test.ts
packages\next-shell\src\foreign-workspace.test.ts
infrastructure\migrations\verify\085_insurance_and_towing_org_admin.sql
infrastructure\migrations\verify\080_insurance_and_towing_registration.sql
infrastructure\migrations\verify\075_fleet_registration.sql
packages\navigation\src\pack-base.ts
packages\navigation\src\landing-path.test.ts
apps\web\app\towing\_screens\create-towing-screen.tsx
apps\web\app\towing\_screens\create-towing-actions.ts
apps\web\app\towing\operations\dashboard\page.tsx
infrastructure\migrations\verify\059_supplier_requests.sql
apps\web\app\supplier\_screens\create-supplier-actions.ts
apps\web\app\supplier\products\add-product\page.tsx
apps\web\app\page.tsx
apps\web\app\onboarding\account-types.ts
apps\web\app\onboarding\account-types.spec.ts
apps\web\app\insurance\_screens\create-insurer-screen.tsx
apps\web\app\insurance\home\dashboard\page.tsx
apps\web\app\fleet\_screens\create-fleet-screen.tsx
apps\web\app\fleet\home\dashboard\page.tsx
infrastructure\migrations\verify\025_platform_admin_role_name.sql
infrastructure\migrations\rehearse\075_fleet_registration_render_privileges.sql
infrastructure\migrations\085_insurance_and_towing_org_admin.sql
infrastructure\migrations\080_insurance_and_towing_registration.sql
infrastructure\migrations\076_fleet_registration_race.sql
infrastructure\migrations\075_fleet_registration.sql
infrastructure\migrations\072_registration_defects_from_supervisor.sql
infrastructure\migrations\071_registration_defects_from_codex.sql
infrastructure\migrations\069_organization_registrations.sql
infrastructure\migrations\068_supplier_registration.sql
infrastructure\keycloak\realm-autoworkshop.json
apps\api\src\towing\towing.spec.ts
apps\api\src\towing\towing-roles.ts
apps\api\src\catalogue\directory.spec.ts
apps\api\src\settings\settings.spec.ts
apps\api\src\insurance\insurance-roles.ts
apps\api\src\insurance\insurance-review-queue.integration.spec.ts
apps\api\src\identity\registration.controller.ts
apps\api\src\identity\organization.service.ts
apps\api\src\identity\organization-registration.service.ts
apps\api\src\identity\membership.service.ts
apps\api\src\identity\membership.repository.ts
apps\api\src\identity\membership-role-fit.spec.ts
apps\api\src\repair\repair.spec.ts
apps\api\src\identity\fleet-registration.spec.ts
apps\api\src\identity\branch.service.ts
apps\api\src\repair\pricing.spec.ts
apps\api\src\finance\finance.spec.ts
apps\api\src\parts\supplier-request.spec.ts
apps\api\src\authz\workshop-roles.spec.ts
apps\api\src\authz\permission-matrix.ts
apps\api\src\authz\permission-matrix.spec.ts

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n -C 4 "insurance_assessor|towing_operator|insurance_owner|towing_owner" packages/navigation apps/web/app/page.tsx 
apps/web/app/insurance apps/web/app/towing infrastructure/keycloak/realm-autoworkshop.json apps/api/src/identity/organization.service.ts apps/api/src/identity/organization-registration.service.ts 
apps/api/src/identity/membership.repository.ts apps/api/src/identity/branch.service.ts' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 628ms:
apps/web/app/page.tsx-128-      // probably the "access is denied to users" report that the 08-13 handover
apps/web/app/page.tsx-129-      // recorded as unverified against a session-cookie hypothesis.
apps/web/app/page.tsx-130-      //
apps/web/app/page.tsx-131-      // Towing was invisible for a different reason: no production path could
apps/web/app/page.tsx:132:      // write a `towing_operator` membership until migration 080, so the line
apps/web/app/page.tsx-133-      // had never once executed for that role.
apps/web/app/page.tsx-134-      //
apps/web/app/page.tsx-135-      // `landingPathFor` reads the tree the ROUTER resolves against, so the
apps/web/app/page.tsx-136-      // dispatch and the router cannot disagree. `null` only when a workspace
--
infrastructure/keycloak/realm-autoworkshop.json-112-        "name": "fleet_approver",
infrastructure/keycloak/realm-autoworkshop.json-113-        "description": "Approves fleet repair proposals within thresholds"
infrastructure/keycloak/realm-autoworkshop.json-114-      },
infrastructure/keycloak/realm-autoworkshop.json-115-      {
infrastructure/keycloak/realm-autoworkshop.json:116:        "name": "insurance_assessor",
infrastructure/keycloak/realm-autoworkshop.json-117-        "description": "Assesses damage and reviews estimates"
infrastructure/keycloak/realm-autoworkshop.json-118-      },
infrastructure/keycloak/realm-autoworkshop.json-119-      {
infrastructure/keycloak/realm-autoworkshop.json-120-        "name": "claims_approver",
--
apps/api/src/identity/membership.repository.ts-416-    };
apps/api/src/identity/membership.repository.ts-417-  }
apps/api/src/identity/membership.repository.ts-418-
apps/api/src/identity/membership.repository.ts-419-  /**
apps/api/src/identity/membership.repository.ts:420:   * The two doors migration 080 opened — `insurance_assessor` and
apps/api/src/identity/membership.repository.ts:421:   * `towing_operator`.
apps/api/src/identity/membership.repository.ts-422-   *
apps/api/src/identity/membership.repository.ts-423-   * 🔴 THE FOURTH AND FIFTH ROLE THAT COULD NOT EXIST IN PRODUCTION. Both were
apps/api/src/identity/membership.repository.ts-424-   * in `GRANTABLE_ROLES`, in the permission matrix and each owned a navigation
apps/api/src/identity/membership.repository.ts-425-   * tree, and no code path could write either. `grant()` was not the escape
--
apps/api/src/identity/membership.repository.ts-434-   * platform's privilege-granting surface; the two literals below are the whole
apps/api/src/identity/membership.repository.ts-435-   * safety property and they must not become a parameter that travels.
apps/api/src/identity/membership.repository.ts-436-   */
apps/api/src/identity/membership.repository.ts-437-  private async registerOrganisation(
apps/api/src/identity/membership.repository.ts:438:    fn: 'identity.register_insurer' | 'identity.register_towing_operator',
apps/api/src/identity/membership.repository.ts-439-    subject: string,
apps/api/src/identity/membership.repository.ts-440-    name: string,
apps/api/src/identity/membership.repository.ts-441-    locationName: string | undefined,
apps/api/src/identity/membership.repository.ts-442-  ): Promise<{
--
apps/api/src/identity/membership.repository.ts-478-  }
apps/api/src/identity/membership.repository.ts-479-
apps/api/src/identity/membership.repository.ts-480-  async registerTowingOperator(subject: string, companyName: string, locationName?: string) {
apps/api/src/identity/membership.repository.ts-481-    return this.registerOrganisation(
apps/api/src/identity/membership.repository.ts:482:      'identity.register_towing_operator',
apps/api/src/identity/membership.repository.ts-483-      subject,
apps/api/src/identity/membership.repository.ts-484-      companyName,
apps/api/src/identity/membership.repository.ts-485-      locationName,
apps/api/src/identity/membership.repository.ts-486-    );
--
packages/navigation\src\landing-path.test.ts-11- * does not** — `02.txt` §52 gives it `operations`, so its dashboard is at
packages/navigation\src\landing-path.test.ts-12- * `/towing/operations/dashboard`.
packages/navigation\src\landing-path.test.ts-13- *
packages/navigation\src\landing-path.test.ts-14- * `renderModulePage` ends `if (!group || !item) notFound()`, so a
packages/navigation\src\landing-path.test.ts:15: * `towing_operator` arriving at the front door would have been 404'd on their
packages/navigation\src\landing-path.test.ts-16- * own dashboard.
packages/navigation\src\landing-path.test.ts-17- *
packages/navigation\src\landing-path.test.ts:18: * ⚠️ IT HAD NEVER RUN. No production path could write a `towing_operator`
packages/navigation\src\landing-path.test.ts-19- * membership until migration 080, so that redirect had never once executed for
packages/navigation\src\landing-path.test.ts-20- * this role — while migration 074 shipped all ten towing screens. A defect
packages/navigation\src\landing-path.test.ts-21- * behind an unreachable state stays green for ever; opening the door is what
packages/navigation\src\landing-path.test.ts-22- * found it.
--
packages/navigation\src\pack-base.ts-140- * `app/towing/page.tsx` already redirects to correctly, and which the front
packages/navigation\src\pack-base.ts-141- * door did not know.
packages/navigation\src\pack-base.ts-142- *
packages/navigation\src\pack-base.ts-143- * So `/towing/home/dashboard` is not in the towing tree, `renderModulePage`
packages/navigation\src\pack-base.ts:144: * ends `if (!group || !item) notFound()`, and a `towing_operator` signing in at
packages/navigation\src\pack-base.ts-145- * the front door would have been **404'd on their own dashboard**.
packages/navigation\src\pack-base.ts-146- *
packages/navigation\src\pack-base.ts-147- * ⚠️ IT WAS INVISIBLE BECAUSE THE ROLE COULD NOT EXIST. Nothing in the product
packages/navigation\src\pack-base.ts:148: * could write a `towing_operator` membership until migration 080, so the
packages/navigation\src\pack-base.ts-149- * dispatch line had never once been executed for this role — while migration
packages/navigation\src\pack-base.ts-150- * 074 built towing end to end and shipped all ten of its screens. Opening the
packages/navigation\src\pack-base.ts-151- * door is what exposed it. That is this repository's recurring shape: a defect
packages/navigation\src\pack-base.ts-152- * behind an unreachable state stays green for ever, and the fix that makes the
--
apps/web/app/insurance\_screens\create-insurer-screen.tsx-7- * before they belong anywhere.
apps/web/app/insurance\_screens\create-insurer-screen.tsx-8- *
apps/web/app/insurance\_screens\create-insurer-screen.tsx-9- * 🔴 THIS IS THE FIRST THING IN THE INSURANCE PACK THAT IS NOT A PLACEHOLDER,
apps/web/app/insurance\_screens\create-insurer-screen.tsx-10- * and it is first on purpose. The pack shipped with 0 of 28 screens built and,
apps/web/app/insurance\_screens\create-insurer-screen.tsx:11: * more to the point, with no way for an `insurance_assessor` to exist at all —
apps/web/app/insurance\_screens\create-insurer-screen.tsx-12- * so every one of those 28 routes rendered to an account that could never gain
apps/web/app/insurance\_screens\create-insurer-screen.tsx-13- * the role. Building screens before the door is building rooms onto a house
apps/web/app/insurance\_screens\create-insurer-screen.tsx-14- * with no entrance.
apps/web/app/insurance\_screens\create-insurer-screen.tsx-15- *
--
apps/web/app/towing\_screens\create-towing-actions.ts-16-/**
apps/web/app/towing\_screens\create-towing-actions.ts-17- * Register a towing company — the CALLER for `POST /registration/towing`.
apps/web/app/towing\_screens\create-towing-actions.ts-18- *
apps/web/app/towing\_screens\create-towing-actions.ts-19- * 🔴 WITHOUT THIS FILE THE ROUTE IS NOT SHIPPED. Migration 080 created
apps/web/app/towing\_screens\create-towing-actions.ts:20: * `identity.register_towing_operator` and the controller now exposes it, and neither
apps/web/app/towing\_screens\create-towing-actions.ts-21- * fact puts a towing operator in the database. `POST /registration/customer`
apps/web/app/towing\_screens\create-towing-actions.ts-22- * was deployed, gated, tested, answering 401 on live, and called by NOTHING for
apps/web/app/towing\_screens\create-towing-actions.ts-23- * a day — every gate green throughout. A route with no caller is as unshipped as
apps/web/app/towing\_screens\create-towing-actions.ts-24- * a caller with no route.
--
apps/web/app/towing\_screens\create-towing-screen.tsx-7- * before they belong anywhere.
apps/web/app/towing\_screens\create-towing-screen.tsx-8- *
apps/web/app/towing\_screens\create-towing-screen.tsx-9- * 🔴 THE SHARPEST INSTANCE OF THE ROLE QUESTION IN THIS REPOSITORY. Unlike the
apps/web/app/towing\_screens\create-towing-screen.tsx-10- * insurance pack, towing is NOT unbuilt: migration 074 built it end to end on
apps/web/app/towing\_screens\create-towing-screen.tsx:11: * 2026-08-09 and all ten of its screens work. And `towing_operator` still had
apps/web/app/towing\_screens\create-towing-screen.tsx-12- * no production writer, so those ten working screens belonged to a role nobody
apps/web/app/towing\_screens\create-towing-screen.tsx-13- * could hold. Ten finished rooms and no entrance — every gate green.
apps/web/app/towing\_screens\create-towing-screen.tsx-14- *
apps/web/app/towing\_screens\create-towing-screen.tsx-15- * ⚠️ IT REPLACES THE PAGE RATHER THAN REDIRECTING TO ONE, for the reason
--
apps/web/app/insurance\home\dashboard\page.tsx-7- * 🔴 THE FIRST CONCRETE PAGE IN THIS PACK. Until now every route here, including
apps/web/app/insurance\home\dashboard\page.tsx-8- * this one, fell through to the catch-all and rendered the honest "not built
apps/web/app/insurance\home\dashboard\page.tsx-9- * yet" placeholder — correct for a screen with no content, and wrong for the one
apps/web/app/insurance\home\dashboard\page.tsx-10- * screen that has to exist before any of the others can matter: the one that
apps/web/app/insurance\home\dashboard\page.tsx:11: * lets an `insurance_assessor` come into being.
apps/web/app/insurance\home\dashboard\page.tsx-12- *
apps/web/app/insurance\home\dashboard\page.tsx-13- * ⚠️ THE GATE, AND WHAT IT ACTUALLY ASKS. `needsWorkshop(status)` is the same
apps/web/app/insurance\home\dashboard\page.tsx-14- * predicate the other packs use, and it is MISNAMED: `hasWorkshop` is computed
apps/web/app/insurance\home\dashboard\page.tsx-15- * in `registration.controller.ts` as `active.length > 0` over ALL of the
--
apps/web/app/towing\operations\dashboard\page.tsx-9- *
apps/web/app/towing\operations\dashboard\page.tsx-10- * ── 🔴 THE ONBOARDING BRANCH, AND WHY IT COMES FIRST ───────────────────────
apps/web/app/towing\operations\dashboard\page.tsx-11- *
apps/web/app/towing\operations\dashboard\page.tsx-12- * Migration 074 built this pack end to end and all ten screens work. Nothing
apps/web/app/towing\operations\dashboard\page.tsx:13: * could create a `towing_operator` membership until migration 080, so every one
apps/web/app/towing\operations\dashboard\page.tsx-14- * of those screens belonged to a role nobody could hold — ten finished rooms
apps/web/app/towing\operations\dashboard\page.tsx-15- * with no entrance, and every gate green over it. This branch is the entrance.
apps/web/app/towing\operations\dashboard\page.tsx-16- *
apps/web/app/towing\operations\dashboard\page.tsx-17- * ⚠️ THE REGISTRATION CHECK IS BEFORE `requireNavRoute`, DELIBERATELY, AND IT IS
--
apps/web/app/towing\operations\dashboard\page.tsx-29- *
apps/web/app/towing\operations\dashboard\page.tsx-30- * So the branch that needs no permissions is answered before permissions are
apps/web/app/towing\operations\dashboard\page.tsx-31- * consulted. It grants nothing: `registrationStatus` is on `UserGuard`, it
apps/web/app/towing\operations\dashboard\page.tsx-32- * describes only the CALLER, and the screen it returns writes through
apps/web/app/towing\operations\dashboard\page.tsx:33: * `register_towing_operator`, whose role literal is inside the migration.
apps/web/app/towing\operations\dashboard\page.tsx-34- */
apps/web/app/towing\operations\dashboard\page.tsx-35-export default async function Page() {
apps/web/app/towing\operations\dashboard\page.tsx-36-  const status = await registrationStatus('towing');
apps/web/app/towing\operations\dashboard\page.tsx-37-  if (needsWorkshop(status)) {

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n -C 5 "CREATE POLICY|FORCE ROW LEVEL SECURITY|current_role.*admin|app.current_role|bootstrap_user|app.bootstrap" 
infrastructure/migrations --glob "*.sql"' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 580ms:
infrastructure/migrations\008_job_card_stage_events.sql-104--- isolation is present but inert — the lesson migration 002 paid for.
infrastructure/migrations\008_job_card_stage_events.sql-105-ALTER TABLE repair.job_card_stage_events ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\008_job_card_stage_events.sql-106-ALTER TABLE repair.job_card_stage_events FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\008_job_card_stage_events.sql-107-
infrastructure/migrations\008_job_card_stage_events.sql-108-DROP POLICY IF EXISTS tenant_isolation ON repair.job_card_stage_events;
infrastructure/migrations\008_job_card_stage_events.sql:109:CREATE POLICY tenant_isolation ON repair.job_card_stage_events
infrastructure/migrations\008_job_card_stage_events.sql-110-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\008_job_card_stage_events.sql-111-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\008_job_card_stage_events.sql-112-
infrastructure/migrations\008_job_card_stage_events.sql-113--- ── grants — append-only ────────────────────────────────────────────────────
infrastructure/migrations\008_job_card_stage_events.sql-114-GRANT SELECT, INSERT ON repair.job_card_stage_events TO autoworkshop_app;
--
infrastructure/migrations\006_repair_job_cards.sql-153--- run as — bypasses the policy entirely, leaving it present and inert.
infrastructure/migrations\006_repair_job_cards.sql-154-ALTER TABLE repair.job_cards ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\006_repair_job_cards.sql-155-ALTER TABLE repair.job_cards FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\006_repair_job_cards.sql-156-
infrastructure/migrations\006_repair_job_cards.sql-157-DROP POLICY IF EXISTS tenant_isolation ON repair.job_cards;
infrastructure/migrations\006_repair_job_cards.sql:158:CREATE POLICY tenant_isolation ON repair.job_cards
infrastructure/migrations\006_repair_job_cards.sql-159-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\006_repair_job_cards.sql-160-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\006_repair_job_cards.sql-161-
infrastructure/migrations\006_repair_job_cards.sql-162--- `repair.job_number_counters` holds no tenant data — one integer per
infrastructure/migrations\006_repair_job_cards.sql-163--- organisation — but it IS keyed by organisation, so it is scoped too rather
infrastructure/migrations\006_repair_job_cards.sql-164--- than left as the one readable-by-anyone table in the schema.
infrastructure/migrations\006_repair_job_cards.sql-165-ALTER TABLE repair.job_number_counters ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\006_repair_job_cards.sql-166-ALTER TABLE repair.job_number_counters FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\006_repair_job_cards.sql-167-
infrastructure/migrations\006_repair_job_cards.sql-168-DROP POLICY IF EXISTS org_isolation ON repair.job_number_counters;
infrastructure/migrations\006_repair_job_cards.sql:169:CREATE POLICY org_isolation ON repair.job_number_counters
infrastructure/migrations\006_repair_job_cards.sql-170-    USING (identity.is_platform_admin()
infrastructure/migrations\006_repair_job_cards.sql-171-           OR organization_id IN (SELECT id FROM identity.organizations))
infrastructure/migrations\006_repair_job_cards.sql-172-    WITH CHECK (identity.is_platform_admin()
infrastructure/migrations\006_repair_job_cards.sql-173-           OR organization_id IN (SELECT id FROM identity.organizations));
infrastructure/migrations\006_repair_job_cards.sql-174-
--
infrastructure/migrations\004_core_customers_and_vehicles.sql-22---
infrastructure/migrations\004_core_customers_and_vehicles.sql-23--- But **a foreign key cannot carry a tenant predicate**. `vehicle.customer_id`
infrastructure/migrations\004_core_customers_and_vehicles.sql-24--- guarantees the customer row exists; it says nothing about whose tenant may
infrastructure/migrations\004_core_customers_and_vehicles.sql-25--- read it. Integrity and isolation are different problems with different
infrastructure/migrations\004_core_customers_and_vehicles.sql-26--- mechanisms, so every tenant-owned table below gets BOTH: real FKs, and
infrastructure/migrations\004_core_customers_and_vehicles.sql:27:-- `tenant_id` + ENABLE + FORCE ROW LEVEL SECURITY + the tenant index baseline.
infrastructure/migrations\004_core_customers_and_vehicles.sql-28--- Migration 001 is the worked example and this follows it exactly.
infrastructure/migrations\004_core_customers_and_vehicles.sql-29---
infrastructure/migrations\004_core_customers_and_vehicles.sql-30--- ── FIELDS ARE FROM THE SPEC, NOT INVENTED ─────────────────────────────────
infrastructure/migrations\004_core_customers_and_vehicles.sql-31---
infrastructure/migrations\004_core_customers_and_vehicles.sql-32--- `2.txt` §537: "register one or more vehicles by entering or scanning the
--
infrastructure/migrations\004_core_customers_and_vehicles.sql-229-ALTER TABLE core.customers FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\004_core_customers_and_vehicles.sql-230-ALTER TABLE core.vehicles  ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\004_core_customers_and_vehicles.sql-231-ALTER TABLE core.vehicles  FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\004_core_customers_and_vehicles.sql-232-
infrastructure/migrations\004_core_customers_and_vehicles.sql-233-DROP POLICY IF EXISTS tenant_isolation ON core.customers;
infrastructure/migrations\004_core_customers_and_vehicles.sql:234:CREATE POLICY tenant_isolation ON core.customers
infrastructure/migrations\004_core_customers_and_vehicles.sql-235-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\004_core_customers_and_vehicles.sql-236-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\004_core_customers_and_vehicles.sql-237-
infrastructure/migrations\004_core_customers_and_vehicles.sql-238-DROP POLICY IF EXISTS tenant_isolation ON core.vehicles;
infrastructure/migrations\004_core_customers_and_vehicles.sql:239:CREATE POLICY tenant_isolation ON core.vehicles
infrastructure/migrations\004_core_customers_and_vehicles.sql-240-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\004_core_customers_and_vehicles.sql-241-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\004_core_customers_and_vehicles.sql-242-
infrastructure/migrations\004_core_customers_and_vehicles.sql-243--- core.vehicle_makes and core.vehicle_models carry no RLS on purpose — see the
infrastructure/migrations\004_core_customers_and_vehicles.sql-244--- note at their definition. They hold no tenant data; withholding them would
--
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql-131-DROP POLICY IF EXISTS audit_tenant_read  ON audit.events;
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql-132-DROP POLICY IF EXISTS audit_tenant_write ON audit.events;
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql-133-
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql-134--- Read: own tenant only. NULL-tenant system events are platform-admin only,
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql-135--- rather than visible to whichever tenant happens to be asking.
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:136:CREATE POLICY audit_tenant_read ON audit.events
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql-137-    FOR SELECT
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql-138-    USING (
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql-139-        identity.is_platform_admin()
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql-140-        OR (tenant_id IS NOT NULL AND tenant_id = identity.current_tenant_id())
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql-141-    );
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql-142-
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql-143--- Write: system events (tenant_id IS NULL) are permitted, because losing them
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql-144--- is worse than the exposure this closes. Attributing an event to a DIFFERENT
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql-145--- tenant is not.
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql:146:CREATE POLICY audit_tenant_write ON audit.events
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql-147-    FOR INSERT
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql-148-    WITH CHECK (
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql-149-        identity.is_platform_admin()
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql-150-        OR tenant_id IS NULL
infrastructure/migrations\003_identity_bootstrap_and_audit_rls.sql-151-        OR tenant_id = identity.current_tenant_id()
--
infrastructure/migrations\019_repair_execution.sql-558-ALTER TABLE repair.execution_parts_used    FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\019_repair_execution.sql-559-ALTER TABLE repair.execution_evidence      ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\019_repair_execution.sql-560-ALTER TABLE repair.execution_evidence      FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\019_repair_execution.sql-561-
infrastructure/migrations\019_repair_execution.sql-562-DROP POLICY IF EXISTS tenant_isolation ON repair.repair_executions;
infrastructure/migrations\019_repair_execution.sql:563:CREATE POLICY tenant_isolation ON repair.repair_executions
infrastructure/migrations\019_repair_execution.sql-564-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\019_repair_execution.sql-565-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\019_repair_execution.sql-566-
infrastructure/migrations\019_repair_execution.sql-567-DROP POLICY IF EXISTS tenant_isolation ON repair.execution_tasks;
infrastructure/migrations\019_repair_execution.sql:568:CREATE POLICY tenant_isolation ON repair.execution_tasks
infrastructure/migrations\019_repair_execution.sql-569-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\019_repair_execution.sql-570-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\019_repair_execution.sql-571-
infrastructure/migrations\019_repair_execution.sql-572-DROP POLICY IF EXISTS tenant_isolation ON repair.execution_time_entries;
infrastructure/migrations\019_repair_execution.sql:573:CREATE POLICY tenant_isolation ON repair.execution_time_entries
infrastructure/migrations\019_repair_execution.sql-574-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\019_repair_execution.sql-575-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\019_repair_execution.sql-576-
infrastructure/migrations\019_repair_execution.sql-577-DROP POLICY IF EXISTS tenant_isolation ON repair.execution_parts_used;
infrastructure/migrations\019_repair_execution.sql:578:CREATE POLICY tenant_isolation ON repair.execution_parts_used
infrastructure/migrations\019_repair_execution.sql-579-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\019_repair_execution.sql-580-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\019_repair_execution.sql-581-
infrastructure/migrations\019_repair_execution.sql-582-DROP POLICY IF EXISTS tenant_isolation ON repair.execution_evidence;
infrastructure/migrations\019_repair_execution.sql:583:CREATE POLICY tenant_isolation ON repair.execution_evidence
infrastructure/migrations\019_repair_execution.sql-584-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\019_repair_execution.sql-585-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\019_repair_execution.sql-586-
infrastructure/migrations\019_repair_execution.sql-587--- ── grants ──────────────────────────────────────────────────────────────────
infrastructure/migrations\019_repair_execution.sql-588---
--
infrastructure/migrations\001_tenancy_foundation.sql-5---   tenant -> organization -> branch -> membership
infrastructure/migrations\001_tenancy_foundation.sql-6--- plus the RLS helper functions and the standard policy shape.
infrastructure/migrations\001_tenancy_foundation.sql-7---
infrastructure/migrations\001_tenancy_foundation.sql-8--- Rules enforced here (docs/05-database/DATABASE_MIGRATIONS.md):
infrastructure/migrations\001_tenancy_foundation.sql-9---   * TEXT, never VARCHAR(n), on free-text columns
infrastructure/migrations\001_tenancy_foundation.sql:10:--   * every tenant-owned table gets ENABLE + FORCE ROW LEVEL SECURITY
infrastructure/migrations\001_tenancy_foundation.sql-11---   * FORCE matters — without it the table owner silently bypasses the policy
infrastructure/migrations\001_tenancy_foundation.sql-12---   * audit columns on every tenant-owned table
infrastructure/migrations\001_tenancy_foundation.sql-13--- ============================================================================
infrastructure/migrations\001_tenancy_foundation.sql-14-
infrastructure/migrations\001_tenancy_foundation.sql-15-BEGIN;
--
infrastructure/migrations\001_tenancy_foundation.sql-40-
infrastructure/migrations\001_tenancy_foundation.sql-41-CREATE OR REPLACE FUNCTION identity.current_role_name()
infrastructure/migrations\001_tenancy_foundation.sql-42-RETURNS text
infrastructure/migrations\001_tenancy_foundation.sql-43-LANGUAGE sql STABLE
infrastructure/migrations\001_tenancy_foundation.sql-44-AS $$
infrastructure/migrations\001_tenancy_foundation.sql:45:  SELECT COALESCE(NULLIF(current_setting('app.current_role', true), ''), 'none');
infrastructure/migrations\001_tenancy_foundation.sql-46-$$;
infrastructure/migrations\001_tenancy_foundation.sql-47-
infrastructure/migrations\001_tenancy_foundation.sql-48--- Platform administration is the ONLY cross-tenant scope, and it is always
infrastructure/migrations\001_tenancy_foundation.sql-49--- audited. Everything else is confined to one resolved tenant.
infrastructure/migrations\001_tenancy_foundation.sql-50-CREATE OR REPLACE FUNCTION identity.is_platform_admin()
infrastructure/migrations\001_tenancy_foundation.sql-51-RETURNS boolean
infrastructure/migrations\001_tenancy_foundation.sql-52-LANGUAGE sql STABLE
infrastructure/migrations\001_tenancy_foundation.sql-53-AS $$
infrastructure/migrations\001_tenancy_foundation.sql:54:  SELECT identity.current_role_name() IN ('admin', 'platform_administrator');
infrastructure/migrations\001_tenancy_foundation.sql-55-$$;
infrastructure/migrations\001_tenancy_foundation.sql-56-
infrastructure/migrations\001_tenancy_foundation.sql-57--- ── tenants ─────────────────────────────────────────────────────────────────
infrastructure/migrations\001_tenancy_foundation.sql-58--- A tenant is the legal/commercial isolation boundary.
infrastructure/migrations\001_tenancy_foundation.sql-59-
--
infrastructure/migrations\001_tenancy_foundation.sql-170-ALTER TABLE identity.branches      FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\001_tenancy_foundation.sql-171-ALTER TABLE identity.memberships   ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\001_tenancy_foundation.sql-172-ALTER TABLE identity.memberships   FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\001_tenancy_foundation.sql-173-
infrastructure/migrations\001_tenancy_foundation.sql-174-DROP POLICY IF EXISTS tenant_isolation ON identity.tenants;
infrastructure/migrations\001_tenancy_foundation.sql:175:CREATE POLICY tenant_isolation ON identity.tenants
infrastructure/migrations\001_tenancy_foundation.sql-176-    USING (identity.is_platform_admin() OR id = identity.current_tenant_id())
infrastructure/migrations\001_tenancy_foundation.sql-177-    WITH CHECK (identity.is_platform_admin() OR id = identity.current_tenant_id());
infrastructure/migrations\001_tenancy_foundation.sql-178-
infrastructure/migrations\001_tenancy_foundation.sql-179-DROP POLICY IF EXISTS tenant_isolation ON identity.organizations;
infrastructure/migrations\001_tenancy_foundation.sql:180:CREATE POLICY tenant_isolation ON identity.organizations
infrastructure/migrations\001_tenancy_foundation.sql-181-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\001_tenancy_foundation.sql-182-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\001_tenancy_foundation.sql-183-
infrastructure/migrations\001_tenancy_foundation.sql-184-DROP POLICY IF EXISTS tenant_isolation ON identity.branches;
infrastructure/migrations\001_tenancy_foundation.sql:185:CREATE POLICY tenant_isolation ON identity.branches
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
--
infrastructure/migrations\002_application_role.sql-1--- ============================================================================
infrastructure/migrations\002_application_role.sql-2--- Migration 002 — the non-superuser application role
infrastructure/migrations\002_application_role.sql-3---
infrastructure/migrations\002_application_role.sql-4--- WHY THIS EXISTS
infrastructure/migrations\002_application_role.sql-5---
infrastructure/migrations\002_application_role.sql:6:-- Migration 001 enabled ENABLE + FORCE ROW LEVEL SECURITY on every tenant-owned
infrastructure/migrations\002_application_role.sql-7--- table. That is necessary but NOT sufficient: **a superuser bypasses RLS
infrastructure/migrations\002_application_role.sql-8--- entirely, even with FORCE**. The bootstrap role created by POSTGRES_USER is a
infrastructure/migrations\002_application_role.sql-9--- superuser, so an application connecting as that role would have row-level
infrastructure/migrations\002_application_role.sql-10--- security silently switched off — every policy present, none of them applied.
infrastructure/migrations\002_application_role.sql-11---
--
infrastructure/migrations\018_organization_profile.sql-90-
infrastructure/migrations\018_organization_profile.sql-91-ALTER TABLE core.organization_profile ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\018_organization_profile.sql-92-ALTER TABLE core.organization_profile FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\018_organization_profile.sql-93-
infrastructure/migrations\018_organization_profile.sql-94-DROP POLICY IF EXISTS tenant_isolation ON core.organization_profile;
infrastructure/migrations\018_organization_profile.sql:95:CREATE POLICY tenant_isolation ON core.organization_profile
infrastructure/migrations\018_organization_profile.sql-96-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\018_organization_profile.sql-97-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\018_organization_profile.sql-98-
infrastructure/migrations\018_organization_profile.sql-99--- DELETE withheld: a business identity is superseded by an edit, never removed —
infrastructure/migrations\018_organization_profile.sql-100--- and a document already issued must still be explicable.
--
infrastructure/migrations\017_repair_proposals.sql-347-
infrastructure/migrations\017_repair_proposals.sql-348-ALTER TABLE repair.repair_proposals ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\017_repair_proposals.sql-349-ALTER TABLE repair.repair_proposals FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\017_repair_proposals.sql-350-
infrastructure/migrations\017_repair_proposals.sql-351-DROP POLICY IF EXISTS tenant_isolation ON repair.repair_proposals;
infrastructure/migrations\017_repair_proposals.sql:352:CREATE POLICY tenant_isolation ON repair.repair_proposals
infrastructure/migrations\017_repair_proposals.sql-353-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\017_repair_proposals.sql-354-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\017_repair_proposals.sql-355-
infrastructure/migrations\017_repair_proposals.sql-356--- ── grants ──────────────────────────────────────────────────────────────────
infrastructure/migrations\017_repair_proposals.sql-357---
--
infrastructure/migrations\016_quotations.sql-486--- is the role the app connects as — isolation present and inert.
infrastructure/migrations\016_quotations.sql-487-
infrastructure/migrations\016_quotations.sql-488-ALTER TABLE repair.organization_pricing ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\016_quotations.sql-489-ALTER TABLE repair.organization_pricing FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\016_quotations.sql-490-DROP POLICY IF EXISTS tenant_isolation ON repair.organization_pricing;
infrastructure/migrations\016_quotations.sql:491:CREATE POLICY tenant_isolation ON repair.organization_pricing
infrastructure/migrations\016_quotations.sql-492-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\016_quotations.sql-493-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\016_quotations.sql-494-
infrastructure/migrations\016_quotations.sql-495-ALTER TABLE repair.quotations ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\016_quotations.sql-496-ALTER TABLE repair.quotations FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\016_quotations.sql-497-DROP POLICY IF EXISTS tenant_isolation ON repair.quotations;
infrastructure/migrations\016_quotations.sql:498:CREATE POLICY tenant_isolation ON repair.quotations
infrastructure/migrations\016_quotations.sql-499-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\016_quotations.sql-500-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\016_quotations.sql-501-
infrastructure/migrations\016_quotations.sql-502-ALTER TABLE repair.quotation_lines ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\016_quotations.sql-503-ALTER TABLE repair.quotation_lines FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\016_quotations.sql-504-DROP POLICY IF EXISTS tenant_isolation ON repair.quotation_lines;
infrastructure/migrations\016_quotations.sql:505:CREATE POLICY tenant_isolation ON repair.quotation_lines
infrastructure/migrations\016_quotations.sql-506-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\016_quotations.sql-507-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\016_quotations.sql-508-
infrastructure/migrations\016_quotations.sql-509--- ── grants ──────────────────────────────────────────────────────────────────
infrastructure/migrations\016_quotations.sql-510---
--
infrastructure/migrations\029_pricing_write_scope.sql-37--- and writing can differ — the same shape 028 needed for the directory.
infrastructure/migrations\029_pricing_write_scope.sql-38-DROP POLICY IF EXISTS tenant_isolation ON repair.organization_pricing;
infrastructure/migrations\029_pricing_write_scope.sql-39-
infrastructure/migrations\029_pricing_write_scope.sql-40--- Anyone in the tenant may read the rates. Unchanged in effect from 016 for
infrastructure/migrations\029_pricing_write_scope.sql-41--- SELECT, so quotation preparation is untouched.
infrastructure/migrations\029_pricing_write_scope.sql:42:CREATE POLICY tenant_read ON repair.organization_pricing
infrastructure/migrations\029_pricing_write_scope.sql-43-  FOR SELECT
infrastructure/migrations\029_pricing_write_scope.sql-44-  USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\029_pricing_write_scope.sql-45-
infrastructure/migrations\029_pricing_write_scope.sql-46--- ⚠️ WRITES ARE OWNER-ONLY AND ORGANIZATION-SCOPED. `07.txt` pt2 §50 gives the
infrastructure/migrations\029_pricing_write_scope.sql-47--- owner "full workshop governance, staff, FINANCIAL and reporting access"; the
--
infrastructure/migrations\029_pricing_write_scope.sql-51---
infrastructure/migrations\029_pricing_write_scope.sql-52--- Both `USING` and `WITH CHECK` carry the full predicate. `WITH CHECK` alone
infrastructure/migrations\029_pricing_write_scope.sql-53--- would let an owner UPDATE a row into another organization; `USING` alone
infrastructure/migrations\029_pricing_write_scope.sql-54--- would let them create one there. 027's directory policy documents the same
infrastructure/migrations\029_pricing_write_scope.sql-55--- pair for the same reason.
infrastructure/migrations\029_pricing_write_scope.sql:56:CREATE POLICY owner_write ON repair.organization_pricing
infrastructure/migrations\029_pricing_write_scope.sql-57-  FOR INSERT
infrastructure/migrations\029_pricing_write_scope.sql-58-  WITH CHECK (
infrastructure/migrations\029_pricing_write_scope.sql-59-    organization_id = identity.current_organization_id()
infrastructure/migrations\029_pricing_write_scope.sql-60-    AND tenant_id = identity.current_tenant_id()
infrastructure/migrations\029_pricing_write_scope.sql-61-    AND identity.current_user_governs_organization()
infrastructure/migrations\029_pricing_write_scope.sql-62-  );
infrastructure/migrations\029_pricing_write_scope.sql-63-
infrastructure/migrations\029_pricing_write_scope.sql:64:CREATE POLICY owner_update ON repair.organization_pricing
infrastructure/migrations\029_pricing_write_scope.sql-65-  FOR UPDATE
infrastructure/migrations\029_pricing_write_scope.sql-66-  USING (
infrastructure/migrations\029_pricing_write_scope.sql-67-    organization_id = identity.current_organization_id()
infrastructure/migrations\029_pricing_write_scope.sql-68-    AND tenant_id = identity.current_tenant_id()
infrastructure/migrations\029_pricing_write_scope.sql-69-    AND identity.current_user_governs_organization()
--
infrastructure/migrations\028_directory_member_read.sql-40--- No role condition, deliberately. Every member of the organization may see
infrastructure/migrations\028_directory_member_read.sql-41--- their own workshop's public listing and its state; that is not privileged
infrastructure/migrations\028_directory_member_read.sql-42--- information inside the organization, and hiding it is what produced the
infrastructure/migrations\028_directory_member_read.sql-43--- misleading screen. The ORGANIZATION predicate is still the isolation
infrastructure/migrations\028_directory_member_read.sql-44--- boundary, and it is the same one 027 uses.
infrastructure/migrations\028_directory_member_read.sql:45:CREATE POLICY member_read_own ON catalogue.mechanic_directory
infrastructure/migrations\028_directory_member_read.sql-46-  FOR SELECT
infrastructure/migrations\028_directory_member_read.sql-47-  USING (organization_id = identity.current_organization_id());
infrastructure/migrations\028_directory_member_read.sql-48-
infrastructure/migrations\028_directory_member_read.sql-49-COMMIT;
--
infrastructure/migrations\027_mechanic_directory_optin.sql-60-
infrastructure/migrations\027_mechanic_directory_optin.sql-61--- ---------------------------------------------------------------------------
infrastructure/migrations\027_mechanic_directory_optin.sql-62--- Who may speak for the workshop in public.
infrastructure/migrations\027_mechanic_directory_optin.sql-63--- ---------------------------------------------------------------------------
infrastructure/migrations\027_mechanic_directory_optin.sql-64--- ⚠️ A HELPER RATHER THAN AN INLINE PREDICATE, ON PURPOSE. Migrations 021-024
infrastructure/migrations\027_mechanic_directory_optin.sql:65:-- hand-rolled `current_role_name() = 'admin'` instead of calling
infrastructure/migrations\027_mechanic_directory_optin.sql-66--- `identity.is_platform_admin()`, which had existed since migration 001 and
infrastructure/migrations\027_mechanic_directory_optin.sql-67--- already handled both role names — and every one of those policies was
infrastructure/migrations\027_mechanic_directory_optin.sql-68--- unreachable from the application until 025 repointed them. Restating a role
infrastructure/migrations\027_mechanic_directory_optin.sql-69--- test inline is exactly how that happened, so this one gets a name.
infrastructure/migrations\027_mechanic_directory_optin.sql-70---
--
infrastructure/migrations\027_mechanic_directory_optin.sql-98--- taking over that workshop's public listing — `USING` tests the row as it WAS
infrastructure/migrations\027_mechanic_directory_optin.sql-99--- and would happily permit the change. The same trap 024 documents for
infrastructure/migrations\027_mechanic_directory_optin.sql-100--- `parts.supplier_id`, which needed a trigger because the column had to stay
infrastructure/migrations\027_mechanic_directory_optin.sql-101--- editable by an administrator; here the predicate alone is enough because
infrastructure/migrations\027_mechanic_directory_optin.sql-102--- nobody may move a listing at all.
infrastructure/migrations\027_mechanic_directory_optin.sql:103:CREATE POLICY owner_manage_own ON catalogue.mechanic_directory
infrastructure/migrations\027_mechanic_directory_optin.sql-104-  FOR ALL
infrastructure/migrations\027_mechanic_directory_optin.sql-105-  USING (
infrastructure/migrations\027_mechanic_directory_optin.sql-106-    organization_id = identity.current_organization_id()
infrastructure/migrations\027_mechanic_directory_optin.sql-107-    AND identity.current_user_governs_organization()
infrastructure/migrations\027_mechanic_directory_optin.sql-108-  )
--
infrastructure/migrations\012_repair_diagnoses.sql-303-
infrastructure/migrations\012_repair_diagnoses.sql-304-ALTER TABLE repair.diagnoses ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\012_repair_diagnoses.sql-305-ALTER TABLE repair.diagnoses FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\012_repair_diagnoses.sql-306-
infrastructure/migrations\012_repair_diagnoses.sql-307-DROP POLICY IF EXISTS tenant_isolation ON repair.diagnoses;
infrastructure/migrations\012_repair_diagnoses.sql:308:CREATE POLICY tenant_isolation ON repair.diagnoses
infrastructure/migrations\012_repair_diagnoses.sql-309-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\012_repair_diagnoses.sql-310-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\012_repair_diagnoses.sql-311-
infrastructure/migrations\012_repair_diagnoses.sql-312-ALTER TABLE repair.diagnostic_findings ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\012_repair_diagnoses.sql-313-ALTER TABLE repair.diagnostic_findings FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\012_repair_diagnoses.sql-314-
infrastructure/migrations\012_repair_diagnoses.sql-315-DROP POLICY IF EXISTS tenant_isolation ON repair.diagnostic_findings;
infrastructure/migrations\012_repair_diagnoses.sql:316:CREATE POLICY tenant_isolation ON repair.diagnostic_findings
infrastructure/migrations\012_repair_diagnoses.sql-317-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\012_repair_diagnoses.sql-318-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\012_repair_diagnoses.sql-319-
infrastructure/migrations\012_repair_diagnoses.sql-320--- ── grants ──────────────────────────────────────────────────────────────────
infrastructure/migrations\012_repair_diagnoses.sql-321--- UPDATE granted because a diagnosis is worked on over a shift and then reviewed;
--
infrastructure/migrations\025_platform_admin_role_name.sql-2---
infrastructure/migrations\025_platform_admin_role_name.sql-3--- 🔴 EVERY ADMIN POLICY IN THE CATALOGUE AND MARKETPLACE SCHEMAS IS CURRENTLY
infrastructure/migrations\025_platform_admin_role_name.sql-4--- UNREACHABLE FROM THE APPLICATION. Nine policies and three triggers, across
infrastructure/migrations\025_platform_admin_role_name.sql-5--- migrations 021 to 024, gate on:
infrastructure/migrations\025_platform_admin_role_name.sql-6---
infrastructure/migrations\025_platform_admin_role_name.sql:7:--     identity.current_role_name() = 'admin'
infrastructure/migrations\025_platform_admin_role_name.sql-8---
infrastructure/migrations\025_platform_admin_role_name.sql-9--- and no request this application makes ever sets that value.
infrastructure/migrations\025_platform_admin_role_name.sql:10:-- `tenantSessionStatements` sets `app.current_role` from `ctx.activeRole`,
infrastructure/migrations\025_platform_admin_role_name.sql-11--- which is the `identity.memberships.role_name` — for a platform administrator
infrastructure/migrations\025_platform_admin_role_name.sql-12--- that string is `platform_administrator`. The literal `admin` is set by
infrastructure/migrations\025_platform_admin_role_name.sql-13--- exactly two things: `scripts/seed-dev-catalogue.sh` and hand-run psql.
infrastructure/migrations\025_platform_admin_role_name.sql-14---
infrastructure/migrations\025_platform_admin_role_name.sql-15--- MEASURED, NOT INFERRED (2026-08-01, against the live local database):
infrastructure/migrations\025_platform_admin_role_name.sql-16---
infrastructure/migrations\025_platform_admin_role_name.sql:17:--   set_config('app.current_role','platform_administrator') → UPDATE 0
infrastructure/migrations\025_platform_admin_role_name.sql:18:--   set_config('app.current_role','admin')                  → UPDATE 20
infrastructure/migrations\025_platform_admin_role_name.sql-19---
infrastructure/migrations\025_platform_admin_role_name.sql-20--- So the 07-30 outstanding item "nothing can publish a catalogue row except the
infrastructure/migrations\025_platform_admin_role_name.sql-21--- seed script" was never only a missing screen. The database refuses the write
infrastructure/migrations\025_platform_admin_role_name.sql-22--- regardless of who is signed in, and an administrator publishing a part
infrastructure/migrations\025_platform_admin_role_name.sql-23--- through a perfectly correct API would have silently changed nothing —
--
infrastructure/migrations\025_platform_admin_role_name.sql-59-CREATE OR REPLACE FUNCTION identity.is_platform_admin()
infrastructure/migrations\025_platform_admin_role_name.sql-60-RETURNS BOOLEAN
infrastructure/migrations\025_platform_admin_role_name.sql-61-LANGUAGE sql
infrastructure/migrations\025_platform_admin_role_name.sql-62-STABLE
infrastructure/migrations\025_platform_admin_role_name.sql-63-AS $$
infrastructure/migrations\025_platform_admin_role_name.sql:64:  SELECT identity.current_role_name() IN ('admin', 'platform_administrator');
infrastructure/migrations\025_platform_admin_role_name.sql-65-$$;
infrastructure/migrations\025_platform_admin_role_name.sql-66-
infrastructure/migrations\025_platform_admin_role_name.sql-67-COMMENT ON FUNCTION identity.is_platform_admin() IS
infrastructure/migrations\025_platform_admin_role_name.sql:68:  'True when app.current_role names the platform administrator. Accepts the '
infrastructure/migrations\025_platform_admin_role_name.sql-69-  'application role name (platform_administrator) AND the seed/psql one (admin). '
infrastructure/migrations\025_platform_admin_role_name.sql-70-  'Added in 025 because every admin policy in 021-024 tested only the latter and '
infrastructure/migrations\025_platform_admin_role_name.sql-71-  'was therefore unreachable from the application.';
infrastructure/migrations\025_platform_admin_role_name.sql-72-
infrastructure/migrations\025_platform_admin_role_name.sql-73-REVOKE ALL ON FUNCTION identity.is_platform_admin() FROM PUBLIC;
--
infrastructure/migrations\025_platform_admin_role_name.sql-75-
infrastructure/migrations\025_platform_admin_role_name.sql-76--- ---------------------------------------------------------------------------
infrastructure/migrations\025_platform_admin_role_name.sql-77--- 021 — the public catalogue.
infrastructure/migrations\025_platform_admin_role_name.sql-78--- ---------------------------------------------------------------------------
infrastructure/migrations\025_platform_admin_role_name.sql-79-DROP POLICY admin_write ON catalogue.suppliers;
infrastructure/migrations\025_platform_admin_role_name.sql:80:CREATE POLICY admin_write ON catalogue.suppliers
infrastructure/migrations\025_platform_admin_role_name.sql-81-  FOR ALL USING (identity.is_platform_admin())
infrastructure/migrations\025_platform_admin_role_name.sql-82-  WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\025_platform_admin_role_name.sql-83-
infrastructure/migrations\025_platform_admin_role_name.sql-84-DROP POLICY admin_write ON catalogue.part_categories;
infrastructure/migrations\025_platform_admin_role_name.sql:85:CREATE POLICY admin_write ON catalogue.part_categories
infrastructure/migrations\025_platform_admin_role_name.sql-86-  FOR ALL USING (identity.is_platform_admin())
infrastructure/migrations\025_platform_admin_role_name.sql-87-  WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\025_platform_admin_role_name.sql-88-
infrastructure/migrations\025_platform_admin_role_name.sql-89-DROP POLICY admin_write ON catalogue.parts;
infrastructure/migrations\025_platform_admin_role_name.sql:90:CREATE POLICY admin_write ON catalogue.parts
infrastructure/migrations\025_platform_admin_role_name.sql-91-  FOR ALL USING (identity.is_platform_admin())
infrastructure/migrations\025_platform_admin_role_name.sql-92-  WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\025_platform_admin_role_name.sql-93-
infrastructure/migrations\025_platform_admin_role_name.sql-94-DROP POLICY admin_write ON catalogue.part_fitments;
infrastructure/migrations\025_platform_admin_role_name.sql:95:CREATE POLICY admin_write ON catalogue.part_fitments
infrastructure/migrations\025_platform_admin_role_name.sql-96-  FOR ALL USING (identity.is_platform_admin())
infrastructure/migrations\025_platform_admin_role_name.sql-97-  WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\025_platform_admin_role_name.sql-98-
infrastructure/migrations\025_platform_admin_role_name.sql-99-DROP POLICY admin_write ON catalogue.mechanic_directory;
infrastructure/migrations\025_platform_admin_role_name.sql:100:CREATE POLICY admin_write ON catalogue.mechanic_directory
infrastructure/migrations\025_platform_admin_role_name.sql-101-  FOR ALL USING (identity.is_platform_admin())
infrastructure/migrations\025_platform_admin_role_name.sql-102-  WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\025_platform_admin_role_name.sql-103-
infrastructure/migrations\025_platform_admin_role_name.sql-104--- ---------------------------------------------------------------------------
infrastructure/migrations\025_platform_admin_role_name.sql-105--- 022 — marketplace orders.
--
infrastructure/migrations\025_platform_admin_role_name.sql-107--- ⚠️ `order_events` STAYS APPEND-ONLY. This restores the administrator's reach,
infrastructure/migrations\025_platform_admin_role_name.sql-108--- it does not widen it: 022 REVOKEd UPDATE and DELETE on that table from the
infrastructure/migrations\025_platform_admin_role_name.sql-109--- application role entirely, and a policy cannot grant back a privilege the
infrastructure/migrations\025_platform_admin_role_name.sql-110--- role does not hold.
infrastructure/migrations\025_platform_admin_role_name.sql-111-DROP POLICY admin_all ON catalogue.orders;
infrastructure/migrations\025_platform_admin_role_name.sql:112:CREATE POLICY admin_all ON catalogue.orders
infrastructure/migrations\025_platform_admin_role_name.sql-113-  FOR ALL USING (identity.is_platform_admin())
infrastructure/migrations\025_platform_admin_role_name.sql-114-  WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\025_platform_admin_role_name.sql-115-
infrastructure/migrations\025_platform_admin_role_name.sql-116-DROP POLICY admin_all ON catalogue.order_lines;
infrastructure/migrations\025_platform_admin_role_name.sql:117:CREATE POLICY admin_all ON catalogue.order_lines
infrastructure/migrations\025_platform_admin_role_name.sql-118-  FOR ALL USING (identity.is_platform_admin())
infrastructure/migrations\025_platform_admin_role_name.sql-119-  WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\025_platform_admin_role_name.sql-120-
infrastructure/migrations\025_platform_admin_role_name.sql-121-DROP POLICY admin_all ON catalogue.order_events;
infrastructure/migrations\025_platform_admin_role_name.sql:122:CREATE POLICY admin_all ON catalogue.order_events
infrastructure/migrations\025_platform_admin_role_name.sql-123-  FOR ALL USING (identity.is_platform_admin())
infrastructure/migrations\025_platform_admin_role_name.sql-124-  WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\025_platform_admin_role_name.sql-125-
infrastructure/migrations\025_platform_admin_role_name.sql-126--- ---------------------------------------------------------------------------
infrastructure/migrations\025_platform_admin_role_name.sql-127--- 023 — supplier accounts.
infrastructure/migrations\025_platform_admin_role_name.sql-128--- ---------------------------------------------------------------------------
infrastructure/migrations\025_platform_admin_role_name.sql-129-DROP POLICY admin_all ON catalogue.supplier_users;
infrastructure/migrations\025_platform_admin_role_name.sql:130:CREATE POLICY admin_all ON catalogue.supplier_users
infrastructure/migrations\025_platform_admin_role_name.sql-131-  FOR ALL USING (identity.is_platform_admin())
infrastructure/migrations\025_platform_admin_role_name.sql-132-  WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\025_platform_admin_role_name.sql-133-
infrastructure/migrations\025_platform_admin_role_name.sql-134--- ---------------------------------------------------------------------------
infrastructure/migrations\025_platform_admin_role_name.sql-135--- The three column-guard triggers.
--
infrastructure/migrations\024_supplier_catalogue.sql-69-AS $$
infrastructure/migrations\024_supplier_catalogue.sql-70-BEGIN
infrastructure/migrations\024_supplier_catalogue.sql-71-  -- Platform admin is unconstrained: verifying and publishing a supplier is
infrastructure/migrations\024_supplier_catalogue.sql-72-  -- precisely the administrator's job, and support must be able to correct a
infrastructure/migrations\024_supplier_catalogue.sql-73-  -- listing.
infrastructure/migrations\024_supplier_catalogue.sql:74:  IF identity.current_role_name() = 'admin' THEN
infrastructure/migrations\024_supplier_catalogue.sql-75-    RETURN NEW;
infrastructure/migrations\024_supplier_catalogue.sql-76-  END IF;
infrastructure/migrations\024_supplier_catalogue.sql-77-
infrastructure/migrations\024_supplier_catalogue.sql-78-  IF TG_OP = 'INSERT' THEN
infrastructure/migrations\024_supplier_catalogue.sql-79-    -- An applicant may not arrive pre-approved. Belt and braces with the
--
infrastructure/migrations\024_supplier_catalogue.sql-129-CREATE OR REPLACE FUNCTION catalogue.reject_part_overreach()
infrastructure/migrations\024_supplier_catalogue.sql-130-RETURNS trigger
infrastructure/migrations\024_supplier_catalogue.sql-131-LANGUAGE plpgsql
infrastructure/migrations\024_supplier_catalogue.sql-132-AS $$
infrastructure/migrations\024_supplier_catalogue.sql-133-BEGIN
infrastructure/migrations\024_supplier_catalogue.sql:134:  IF identity.current_role_name() = 'admin' THEN
infrastructure/migrations\024_supplier_catalogue.sql-135-    RETURN NEW;
infrastructure/migrations\024_supplier_catalogue.sql-136-  END IF;
infrastructure/migrations\024_supplier_catalogue.sql-137-
infrastructure/migrations\024_supplier_catalogue.sql-138-  IF TG_OP = 'INSERT' THEN
infrastructure/migrations\024_supplier_catalogue.sql-139-    IF NOT catalogue.current_user_supplies(NEW.supplier_id) THEN
--
infrastructure/migrations\024_supplier_catalogue.sql-185-
infrastructure/migrations\024_supplier_catalogue.sql-186--- A member sees their own supplier row whether or not it is published — which
infrastructure/migrations\024_supplier_catalogue.sql-187--- is the entire point: an applicant must be able to see the listing they are
infrastructure/migrations\024_supplier_catalogue.sql-188--- waiting to have approved. The `created_by` arm covers the window between
infrastructure/migrations\024_supplier_catalogue.sql-189--- creating the row and the ownership row existing.
infrastructure/migrations\024_supplier_catalogue.sql:190:CREATE POLICY supplier_read_own ON catalogue.suppliers
infrastructure/migrations\024_supplier_catalogue.sql-191-  FOR SELECT USING (
infrastructure/migrations\024_supplier_catalogue.sql-192-    catalogue.current_user_supplies(id) OR created_by = identity.current_user_id()
infrastructure/migrations\024_supplier_catalogue.sql-193-  );
infrastructure/migrations\024_supplier_catalogue.sql-194-
infrastructure/migrations\024_supplier_catalogue.sql-195--- Anybody signed in may APPLY. The row is invisible to the public until an
infrastructure/migrations\024_supplier_catalogue.sql-196--- administrator publishes it, so the worst an abusive applicant achieves is a
infrastructure/migrations\024_supplier_catalogue.sql-197--- row in a queue — and `is_published`/`is_verified` are pinned FALSE here as
infrastructure/migrations\024_supplier_catalogue.sql-198--- well as in the trigger.
infrastructure/migrations\024_supplier_catalogue.sql:199:CREATE POLICY applicant_insert ON catalogue.suppliers
infrastructure/migrations\024_supplier_catalogue.sql-200-  FOR INSERT WITH CHECK (
infrastructure/migrations\024_supplier_catalogue.sql-201-    identity.current_user_id() IS NOT NULL
infrastructure/migrations\024_supplier_catalogue.sql-202-    AND created_by = identity.current_user_id()
infrastructure/migrations\024_supplier_catalogue.sql-203-    AND is_published = FALSE
infrastructure/migrations\024_supplier_catalogue.sql-204-    AND is_verified = FALSE
infrastructure/migrations\024_supplier_catalogue.sql-205-  );
infrastructure/migrations\024_supplier_catalogue.sql-206-
infrastructure/migrations\024_supplier_catalogue.sql:207:CREATE POLICY supplier_update_own ON catalogue.suppliers
infrastructure/migrations\024_supplier_catalogue.sql-208-  FOR UPDATE USING (catalogue.current_user_supplies(id))
infrastructure/migrations\024_supplier_catalogue.sql-209-  WITH CHECK (catalogue.current_user_supplies(id));
infrastructure/migrations\024_supplier_catalogue.sql-210-
infrastructure/migrations\024_supplier_catalogue.sql-211--- ---------------------------------------------------------------------------
infrastructure/migrations\024_supplier_catalogue.sql-212--- Policies — parts and fitments.
--
infrastructure/migrations\024_supplier_catalogue.sql-214--- FOR ALL: a supplier reads its drafts, adds stock, edits it and removes it.
infrastructure/migrations\024_supplier_catalogue.sql-215--- DELETE is granted deliberately — a part is reference data, not a record of
infrastructure/migrations\024_supplier_catalogue.sql-216--- something that happened, and 022 snapshots price, currency and supplier onto
infrastructure/migrations\024_supplier_catalogue.sql-217--- `order_lines` at order time precisely so a placed order does not depend on
infrastructure/migrations\024_supplier_catalogue.sql-218--- the catalogue row still existing.
infrastructure/migrations\024_supplier_catalogue.sql:219:CREATE POLICY supplier_manage_own ON catalogue.parts
infrastructure/migrations\024_supplier_catalogue.sql-220-  FOR ALL USING (catalogue.current_user_supplies(supplier_id))
infrastructure/migrations\024_supplier_catalogue.sql-221-  WITH CHECK (catalogue.current_user_supplies(supplier_id));
infrastructure/migrations\024_supplier_catalogue.sql-222-
infrastructure/migrations\024_supplier_catalogue.sql:223:CREATE POLICY supplier_manage_own ON catalogue.part_fitments
infrastructure/migrations\024_supplier_catalogue.sql-224-  FOR ALL USING (
infrastructure/migrations\024_supplier_catalogue.sql-225-    EXISTS (
infrastructure/migrations\024_supplier_catalogue.sql-226-      SELECT 1 FROM catalogue.parts p
infrastructure/migrations\024_supplier_catalogue.sql-227-       WHERE p.id = part_id AND catalogue.current_user_supplies(p.supplier_id)
infrastructure/migrations\024_supplier_catalogue.sql-228-    )
--
infrastructure/migrations\024_supplier_catalogue.sql-245--- the five suppliers in the dev catalogue were created exactly that way.
infrastructure/migrations\024_supplier_catalogue.sql-246---
infrastructure/migrations\024_supplier_catalogue.sql-247--- So: you may make YOURSELF the OWNER of a supplier YOU created, once.
infrastructure/migrations\024_supplier_catalogue.sql-248--- Inviting further members is `supplier_users`' own concern and stays with the
infrastructure/migrations\024_supplier_catalogue.sql-249--- administrator until a supplier-side invitation flow exists.
infrastructure/migrations\024_supplier_catalogue.sql:250:CREATE POLICY founder_insert ON catalogue.supplier_users
infrastructure/migrations\024_supplier_catalogue.sql-251-  FOR INSERT WITH CHECK (
infrastructure/migrations\024_supplier_catalogue.sql-252-    user_id = identity.current_user_id()
infrastructure/migrations\024_supplier_catalogue.sql-253-    AND member_role = 'owner'
infrastructure/migrations\024_supplier_catalogue.sql-254-    AND status = 'active'
infrastructure/migrations\024_supplier_catalogue.sql-255-    AND EXISTS (
--
infrastructure/migrations\023_supplier_accounts.sql-111-LANGUAGE plpgsql
infrastructure/migrations\023_supplier_accounts.sql-112-AS $$
infrastructure/migrations\023_supplier_accounts.sql-113-BEGIN
infrastructure/migrations\023_supplier_accounts.sql-114-  -- Platform admin is not constrained here; support has to be able to correct
infrastructure/migrations\023_supplier_accounts.sql-115-  -- an order, and every such correction is an `order_events` row.
infrastructure/migrations\023_supplier_accounts.sql:116:  IF identity.current_role_name() = 'admin' THEN
infrastructure/migrations\023_supplier_accounts.sql-117-    RETURN NEW;
infrastructure/migrations\023_supplier_accounts.sql-118-  END IF;
infrastructure/migrations\023_supplier_accounts.sql-119-
infrastructure/migrations\023_supplier_accounts.sql-120-  -- Not a supplier member for this order => this trigger has no opinion. The
infrastructure/migrations\023_supplier_accounts.sql-121-  -- RLS policies already decided whether the row was reachable at all; the
--
infrastructure/migrations\023_supplier_accounts.sql-179--- A member sees their own membership rows, and every membership of a supplier
infrastructure/migrations\023_supplier_accounts.sql-180--- they belong to — an owner has to be able to see who else has access in order
infrastructure/migrations\023_supplier_accounts.sql-181--- to revoke it. Note this reads `supplier_users` from within a policy ON
infrastructure/migrations\023_supplier_accounts.sql-182--- `supplier_users`, so it goes through the SECURITY DEFINER function rather
infrastructure/migrations\023_supplier_accounts.sql-183--- than a direct subquery, which would recurse.
infrastructure/migrations\023_supplier_accounts.sql:184:CREATE POLICY member_read ON catalogue.supplier_users
infrastructure/migrations\023_supplier_accounts.sql-185-  FOR SELECT USING (
infrastructure/migrations\023_supplier_accounts.sql-186-    user_id = identity.current_user_id()
infrastructure/migrations\023_supplier_accounts.sql-187-    OR catalogue.current_user_supplies(supplier_id)
infrastructure/migrations\023_supplier_accounts.sql-188-  );
infrastructure/migrations\023_supplier_accounts.sql-189-
infrastructure/migrations\023_supplier_accounts.sql:190:CREATE POLICY admin_all ON catalogue.supplier_users
infrastructure/migrations\023_supplier_accounts.sql:191:  FOR ALL USING (identity.current_role_name() = 'admin')
infrastructure/migrations\023_supplier_accounts.sql:192:  WITH CHECK (identity.current_role_name() = 'admin');
infrastructure/migrations\023_supplier_accounts.sql-193-
infrastructure/migrations\023_supplier_accounts.sql-194--- ---------------------------------------------------------------------------
infrastructure/migrations\023_supplier_accounts.sql-195--- Supplier reach into orders.
infrastructure/migrations\023_supplier_accounts.sql-196--- ---------------------------------------------------------------------------
infrastructure/migrations\023_supplier_accounts.sql-197--- ⚠️ THE SUPPLIER SEES THE BUYER'S DELIVERY DETAILS, AND THAT IS INTENDED.
infrastructure/migrations\023_supplier_accounts.sql-198--- They cannot deliver to an address they cannot read. What they do NOT get is
infrastructure/migrations\023_supplier_accounts.sql-199--- the buyer's account: no email, no other orders, no vehicle or workshop
infrastructure/migrations\023_supplier_accounts.sql-200--- record — the order row carries only the recipient, phone and address the
infrastructure/migrations\023_supplier_accounts.sql-201--- buyer supplied FOR THIS DELIVERY. That is the same consented-copy principle
infrastructure/migrations\023_supplier_accounts.sql-202--- 021 used for `mechanic_directory`.
infrastructure/migrations\023_supplier_accounts.sql:203:CREATE POLICY supplier_read ON catalogue.orders
infrastructure/migrations\023_supplier_accounts.sql-204-  FOR SELECT USING (catalogue.current_user_supplies(supplier_id));
infrastructure/migrations\023_supplier_accounts.sql-205-
infrastructure/migrations\023_supplier_accounts.sql-206--- UPDATE is granted at row level here and narrowed to specific COLUMNS by
infrastructure/migrations\023_supplier_accounts.sql-207--- `trg_orders_supplier_scope` above. Both are required: the policy decides
infrastructure/migrations\023_supplier_accounts.sql-208--- WHICH orders, the trigger decides WHAT may change.
infrastructure/migrations\023_supplier_accounts.sql:209:CREATE POLICY supplier_update ON catalogue.orders
infrastructure/migrations\023_supplier_accounts.sql-210-  FOR UPDATE USING (catalogue.current_user_supplies(supplier_id))
infrastructure/migrations\023_supplier_accounts.sql-211-  WITH CHECK (catalogue.current_user_supplies(supplier_id));
infrastructure/migrations\023_supplier_accounts.sql-212-
infrastructure/migrations\023_supplier_accounts.sql:213:CREATE POLICY supplier_read ON catalogue.order_lines
infrastructure/migrations\023_supplier_accounts.sql-214-  FOR SELECT USING (
infrastructure/migrations\023_supplier_accounts.sql-215-    EXISTS (
infrastructure/migrations\023_supplier_accounts.sql-216-      SELECT 1 FROM catalogue.orders o
infrastructure/migrations\023_supplier_accounts.sql-217-      WHERE o.id = order_id AND catalogue.current_user_supplies(o.supplier_id)
infrastructure/migrations\023_supplier_accounts.sql-218-    )
infrastructure/migrations\023_supplier_accounts.sql-219-  );
infrastructure/migrations\023_supplier_accounts.sql-220-
infrastructure/migrations\023_supplier_accounts.sql:221:CREATE POLICY supplier_read ON catalogue.order_events
infrastructure/migrations\023_supplier_accounts.sql-222-  FOR SELECT USING (
infrastructure/migrations\023_supplier_accounts.sql-223-    EXISTS (
infrastructure/migrations\023_supplier_accounts.sql-224-      SELECT 1 FROM catalogue.orders o
infrastructure/migrations\023_supplier_accounts.sql-225-      WHERE o.id = order_id AND catalogue.current_user_supplies(o.supplier_id)
infrastructure/migrations\023_supplier_accounts.sql-226-    )
infrastructure/migrations\023_supplier_accounts.sql-227-  );
infrastructure/migrations\023_supplier_accounts.sql-228-
infrastructure/migrations\023_supplier_accounts.sql-229--- A supplier confirming or dispatching an order must be able to say so. Insert
infrastructure/migrations\023_supplier_accounts.sql-230--- only — `order_events` remains append-only for every actor, enforced by the
infrastructure/migrations\023_supplier_accounts.sql-231--- REVOKE in 022.
infrastructure/migrations\023_supplier_accounts.sql:232:CREATE POLICY supplier_insert ON catalogue.order_events
infrastructure/migrations\023_supplier_accounts.sql-233-  FOR INSERT WITH CHECK (
infrastructure/migrations\023_supplier_accounts.sql-234-    EXISTS (
infrastructure/migrations\023_supplier_accounts.sql-235-      SELECT 1 FROM catalogue.orders o
infrastructure/migrations\023_supplier_accounts.sql-236-      WHERE o.id = order_id AND catalogue.current_user_supplies(o.supplier_id)
infrastructure/migrations\023_supplier_accounts.sql-237-    )
--
infrastructure/migrations\010_repair_inspections.sql-299-
infrastructure/migrations\010_repair_inspections.sql-300-ALTER TABLE repair.inspections ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\010_repair_inspections.sql-301-ALTER TABLE repair.inspections FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\010_repair_inspections.sql-302-
infrastructure/migrations\010_repair_inspections.sql-303-DROP POLICY IF EXISTS tenant_isolation ON repair.inspections;
infrastructure/migrations\010_repair_inspections.sql:304:CREATE POLICY tenant_isolation ON repair.inspections
infrastructure/migrations\010_repair_inspections.sql-305-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\010_repair_inspections.sql-306-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\010_repair_inspections.sql-307-
infrastructure/migrations\010_repair_inspections.sql-308-ALTER TABLE repair.inspection_items ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\010_repair_inspections.sql-309-ALTER TABLE repair.inspection_items FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\010_repair_inspections.sql-310-
infrastructure/migrations\010_repair_inspections.sql-311-DROP POLICY IF EXISTS tenant_isolation ON repair.inspection_items;
infrastructure/migrations\010_repair_inspections.sql:312:CREATE POLICY tenant_isolation ON repair.inspection_items
infrastructure/migrations\010_repair_inspections.sql-313-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\010_repair_inspections.sql-314-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\010_repair_inspections.sql-315-
infrastructure/migrations\010_repair_inspections.sql-316--- ── grants ──────────────────────────────────────────────────────────────────
infrastructure/migrations\010_repair_inspections.sql-317--- UPDATE is granted here, unlike `job_card_stage_events`: an in-progress
--
infrastructure/migrations\022_marketplace_orders.sql-26---    inbox. It cannot be built yet and faking it would be worse than saying so:
infrastructure/migrations\022_marketplace_orders.sql-27---    `catalogue.suppliers` has no `identity.users` link, no organization and no
infrastructure/migrations\022_marketplace_orders.sql-28---    membership, by explicit design in 021. There is therefore no subject a
infrastructure/migrations\022_marketplace_orders.sql-29---    supplier policy could key on — a supplier cannot sign in at all. The
infrastructure/migrations\022_marketplace_orders.sql-30---    schema below is shaped so that adding one later is additive: the order
infrastructure/migrations\022_marketplace_orders.sql:31:--    header carries `supplier_id`, so the future policy is one CREATE POLICY
infrastructure/migrations\022_marketplace_orders.sql-32---    against whatever links a supplier to a user, and no column moves.
infrastructure/migrations\022_marketplace_orders.sql-33---
infrastructure/migrations\022_marketplace_orders.sql-34--- 2. NO PAYMENT PROVIDER, AND NO DEFAULT THAT IMPLIES ONE. `payment_method` is
infrastructure/migrations\022_marketplace_orders.sql-35---    NULLABLE WITH NO DEFAULT on purpose. In-app payment needs a provider, and
infrastructure/migrations\022_marketplace_orders.sql-36---    choosing one is a spend decision that belongs to the owner alone
--
infrastructure/migrations\022_marketplace_orders.sql-274--- Spelling both out means the INSERT rule is stated rather than inherited.
infrastructure/migrations\022_marketplace_orders.sql-275---
infrastructure/migrations\022_marketplace_orders.sql-276--- No UPDATE policy for the buyer: a placed order is not editable by the person
infrastructure/migrations\022_marketplace_orders.sql-277--- who placed it. Cancellation is a service operation that writes a status and
infrastructure/migrations\022_marketplace_orders.sql-278--- an event, and it runs under the admin path until the supplier side exists.
infrastructure/migrations\022_marketplace_orders.sql:279:CREATE POLICY buyer_read ON catalogue.orders
infrastructure/migrations\022_marketplace_orders.sql-280-  FOR SELECT USING (buyer_user_id = identity.current_user_id());
infrastructure/migrations\022_marketplace_orders.sql:281:CREATE POLICY buyer_insert ON catalogue.orders
infrastructure/migrations\022_marketplace_orders.sql-282-  FOR INSERT WITH CHECK (buyer_user_id = identity.current_user_id());
infrastructure/migrations\022_marketplace_orders.sql-283-
infrastructure/migrations\022_marketplace_orders.sql-284--- A line is visible exactly when ITS ORDER is. Written as a subquery rather
infrastructure/migrations\022_marketplace_orders.sql-285--- than a copied buyer_user_id column so the two can never disagree — a
infrastructure/migrations\022_marketplace_orders.sql-286--- denormalised owner here would be a second place to forget.
infrastructure/migrations\022_marketplace_orders.sql:287:CREATE POLICY buyer_read ON catalogue.order_lines
infrastructure/migrations\022_marketplace_orders.sql-288-  FOR SELECT USING (
infrastructure/migrations\022_marketplace_orders.sql-289-    EXISTS (
infrastructure/migrations\022_marketplace_orders.sql-290-      SELECT 1 FROM catalogue.orders o
infrastructure/migrations\022_marketplace_orders.sql-291-      WHERE o.id = order_id AND o.buyer_user_id = identity.current_user_id()
infrastructure/migrations\022_marketplace_orders.sql-292-    )
infrastructure/migrations\022_marketplace_orders.sql-293-  );
infrastructure/migrations\022_marketplace_orders.sql:294:CREATE POLICY buyer_insert ON catalogue.order_lines
infrastructure/migrations\022_marketplace_orders.sql-295-  FOR INSERT WITH CHECK (
infrastructure/migrations\022_marketplace_orders.sql-296-    EXISTS (
infrastructure/migrations\022_marketplace_orders.sql-297-      SELECT 1 FROM catalogue.orders o
infrastructure/migrations\022_marketplace_orders.sql-298-      WHERE o.id = order_id AND o.buyer_user_id = identity.current_user_id()
infrastructure/migrations\022_marketplace_orders.sql-299-    )
infrastructure/migrations\022_marketplace_orders.sql-300-  );
infrastructure/migrations\022_marketplace_orders.sql-301-
infrastructure/migrations\022_marketplace_orders.sql:302:CREATE POLICY buyer_read ON catalogue.order_events
infrastructure/migrations\022_marketplace_orders.sql-303-  FOR SELECT USING (
infrastructure/migrations\022_marketplace_orders.sql-304-    EXISTS (
infrastructure/migrations\022_marketplace_orders.sql-305-      SELECT 1 FROM catalogue.orders o
infrastructure/migrations\022_marketplace_orders.sql-306-      WHERE o.id = order_id AND o.buyer_user_id = identity.current_user_id()
infrastructure/migrations\022_marketplace_orders.sql-307-    )
infrastructure/migrations\022_marketplace_orders.sql-308-  );
infrastructure/migrations\022_marketplace_orders.sql:309:CREATE POLICY buyer_insert ON catalogue.order_events
infrastructure/migrations\022_marketplace_orders.sql-310-  FOR INSERT WITH CHECK (
infrastructure/migrations\022_marketplace_orders.sql-311-    EXISTS (
infrastructure/migrations\022_marketplace_orders.sql-312-      SELECT 1 FROM catalogue.orders o
infrastructure/migrations\022_marketplace_orders.sql-313-      WHERE o.id = order_id AND o.buyer_user_id = identity.current_user_id()
infrastructure/migrations\022_marketplace_orders.sql-314-    )
infrastructure/migrations\022_marketplace_orders.sql-315-  );
infrastructure/migrations\022_marketplace_orders.sql-316-
infrastructure/migrations\022_marketplace_orders.sql-317--- Platform admin, same convention as 021. FOR ALL, and permissive policies OR
infrastructure/migrations\022_marketplace_orders.sql-318--- together, so this is what lets support read and correct an order.
infrastructure/migrations\022_marketplace_orders.sql:319:CREATE POLICY admin_all ON catalogue.orders
infrastructure/migrations\022_marketplace_orders.sql:320:  FOR ALL USING (identity.current_role_name() = 'admin')
infrastructure/migrations\022_marketplace_orders.sql:321:  WITH CHECK (identity.current_role_name() = 'admin');
infrastructure/migrations\022_marketplace_orders.sql:322:CREATE POLICY admin_all ON catalogue.order_lines
infrastructure/migrations\022_marketplace_orders.sql:323:  FOR ALL USING (identity.current_role_name() = 'admin')
infrastructure/migrations\022_marketplace_orders.sql:324:  WITH CHECK (identity.current_role_name() = 'admin');
infrastructure/migrations\022_marketplace_orders.sql:325:CREATE POLICY admin_all ON catalogue.order_events
infrastructure/migrations\022_marketplace_orders.sql:326:  FOR ALL USING (identity.current_role_name() = 'admin')
infrastructure/migrations\022_marketplace_orders.sql:327:  WITH CHECK (identity.current_role_name() = 'admin');
infrastructure/migrations\022_marketplace_orders.sql-328-
infrastructure/migrations\022_marketplace_orders.sql-329--- ---------------------------------------------------------------------------
infrastructure/migrations\022_marketplace_orders.sql-330--- Grants.
infrastructure/migrations\022_marketplace_orders.sql-331--- ---------------------------------------------------------------------------
infrastructure/migrations\022_marketplace_orders.sql-332-GRANT SELECT, INSERT, UPDATE, DELETE ON catalogue.orders       TO autoworkshop_app;
--
infrastructure/migrations\020_repair_testing.sql-414-ALTER TABLE repair.repair_test_sessions FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\020_repair_testing.sql-415-ALTER TABLE repair.repair_test_results  ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\020_repair_testing.sql-416-ALTER TABLE repair.repair_test_results  FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\020_repair_testing.sql-417-
infrastructure/migrations\020_repair_testing.sql-418-DROP POLICY IF EXISTS tenant_isolation ON repair.repair_test_sessions;
infrastructure/migrations\020_repair_testing.sql:419:CREATE POLICY tenant_isolation ON repair.repair_test_sessions
infrastructure/migrations\020_repair_testing.sql-420-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\020_repair_testing.sql-421-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\020_repair_testing.sql-422-
infrastructure/migrations\020_repair_testing.sql-423-DROP POLICY IF EXISTS tenant_isolation ON repair.repair_test_results;
infrastructure/migrations\020_repair_testing.sql:424:CREATE POLICY tenant_isolation ON repair.repair_test_results
infrastructure/migrations\020_repair_testing.sql-425-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\020_repair_testing.sql-426-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\020_repair_testing.sql-427-
infrastructure/migrations\020_repair_testing.sql-428--- ── grants ──────────────────────────────────────────────────────────────────
infrastructure/migrations\020_repair_testing.sql-429---
--
infrastructure/migrations\021_public_catalogue.sql-199-ALTER TABLE catalogue.mechanic_directory ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\021_public_catalogue.sql-200-ALTER TABLE catalogue.mechanic_directory FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\021_public_catalogue.sql-201-
infrastructure/migrations\021_public_catalogue.sql-202--- Anybody may read PUBLISHED rows. No tenant context required, and that is the
infrastructure/migrations\021_public_catalogue.sql-203--- deliberate difference from every other policy in this repository.
infrastructure/migrations\021_public_catalogue.sql:204:CREATE POLICY public_read ON catalogue.suppliers
infrastructure/migrations\021_public_catalogue.sql-205-  FOR SELECT USING (is_published);
infrastructure/migrations\021_public_catalogue.sql:206:CREATE POLICY public_read ON catalogue.parts
infrastructure/migrations\021_public_catalogue.sql-207-  FOR SELECT USING (is_published);
infrastructure/migrations\021_public_catalogue.sql:208:CREATE POLICY public_read ON catalogue.mechanic_directory
infrastructure/migrations\021_public_catalogue.sql-209-  FOR SELECT USING (is_published);
infrastructure/migrations\021_public_catalogue.sql-210-
infrastructure/migrations\021_public_catalogue.sql-211--- Categories are labels, not content — publishing them individually would mean
infrastructure/migrations\021_public_catalogue.sql-212--- a category chip could exist with no readable name. They are readable always.
infrastructure/migrations\021_public_catalogue.sql:213:CREATE POLICY public_read ON catalogue.part_categories
infrastructure/migrations\021_public_catalogue.sql-214-  FOR SELECT USING (TRUE);
infrastructure/migrations\021_public_catalogue.sql-215-
infrastructure/migrations\021_public_catalogue.sql-216--- A fitment is readable exactly when ITS PART is. Written as a subquery rather
infrastructure/migrations\021_public_catalogue.sql-217--- than a copied `is_published` column so the two can never disagree — a
infrastructure/migrations\021_public_catalogue.sql-218--- denormalised flag here would be a second place to forget to unpublish.
infrastructure/migrations\021_public_catalogue.sql:219:CREATE POLICY public_read ON catalogue.part_fitments
infrastructure/migrations\021_public_catalogue.sql-220-  FOR SELECT USING (
infrastructure/migrations\021_public_catalogue.sql-221-    EXISTS (SELECT 1 FROM catalogue.parts p WHERE p.id = part_id AND p.is_published)
infrastructure/migrations\021_public_catalogue.sql-222-  );
infrastructure/migrations\021_public_catalogue.sql-223-
infrastructure/migrations\021_public_catalogue.sql:224:-- Writes are platform-admin only, via the same `app.current_role` convention
infrastructure/migrations\021_public_catalogue.sql-225--- the rest of the repo seeds with. Note this is FOR ALL, so an admin also
infrastructure/migrations\021_public_catalogue.sql-226--- SELECTs unpublished drafts — permissive policies OR together.
infrastructure/migrations\021_public_catalogue.sql:227:CREATE POLICY admin_write ON catalogue.suppliers
infrastructure/migrations\021_public_catalogue.sql:228:  FOR ALL USING (identity.current_role_name() = 'admin')
infrastructure/migrations\021_public_catalogue.sql:229:  WITH CHECK (identity.current_role_name() = 'admin');
infrastructure/migrations\021_public_catalogue.sql:230:CREATE POLICY admin_write ON catalogue.part_categories
infrastructure/migrations\021_public_catalogue.sql:231:  FOR ALL USING (identity.current_role_name() = 'admin')
infrastructure/migrations\021_public_catalogue.sql:232:  WITH CHECK (identity.current_role_name() = 'admin');
infrastructure/migrations\021_public_catalogue.sql:233:CREATE POLICY admin_write ON catalogue.parts
infrastructure/migrations\021_public_catalogue.sql:234:  FOR ALL USING (identity.current_role_name() = 'admin')
infrastructure/migrations\021_public_catalogue.sql:235:  WITH CHECK (identity.current_role_name() = 'admin');
infrastructure/migrations\021_public_catalogue.sql:236:CREATE POLICY admin_write ON catalogue.part_fitments
infrastructure/migrations\021_public_catalogue.sql:237:  FOR ALL USING (identity.current_role_name() = 'admin')
infrastructure/migrations\021_public_catalogue.sql:238:  WITH CHECK (identity.current_role_name() = 'admin');
infrastructure/migrations\021_public_catalogue.sql:239:CREATE POLICY admin_write ON catalogue.mechanic_directory
infrastructure/migrations\021_public_catalogue.sql:240:  FOR ALL USING (identity.current_role_name() = 'admin')
infrastructure/migrations\021_public_catalogue.sql:241:  WITH CHECK (identity.current_role_name() = 'admin');
infrastructure/migrations\021_public_catalogue.sql-242-
infrastructure/migrations\021_public_catalogue.sql-243--- ---------------------------------------------------------------------------
infrastructure/migrations\021_public_catalogue.sql-244--- Grants.
infrastructure/migrations\021_public_catalogue.sql-245--- ---------------------------------------------------------------------------
infrastructure/migrations\021_public_catalogue.sql-246-GRANT SELECT, INSERT, UPDATE, DELETE ON catalogue.suppliers          TO autoworkshop_app;
--
infrastructure/migrations\044_parts_stock.sql-436-        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
infrastructure/migrations\044_parts_stock.sql-437-        EXECUTE format('ALTER TABLE %s FORCE  ROW LEVEL SECURITY', t);
infrastructure/migrations\044_parts_stock.sql-438-
infrastructure/migrations\044_parts_stock.sql-439-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'tenant_select', t);
infrastructure/migrations\044_parts_stock.sql-440-        EXECUTE format(
infrastructure/migrations\044_parts_stock.sql:441:            'CREATE POLICY %I ON %s FOR SELECT USING '
infrastructure/migrations\044_parts_stock.sql-442-            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
infrastructure/migrations\044_parts_stock.sql-443-            'tenant_select', t);
infrastructure/migrations\044_parts_stock.sql-444-
infrastructure/migrations\044_parts_stock.sql-445-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'tenant_insert', t);
infrastructure/migrations\044_parts_stock.sql-446-        EXECUTE format(
infrastructure/migrations\044_parts_stock.sql:447:            'CREATE POLICY %I ON %s FOR INSERT WITH CHECK '
infrastructure/migrations\044_parts_stock.sql-448-            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
infrastructure/migrations\044_parts_stock.sql-449-            'tenant_insert', t);
infrastructure/migrations\044_parts_stock.sql-450-
infrastructure/migrations\044_parts_stock.sql-451-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'tenant_update', t);
infrastructure/migrations\044_parts_stock.sql-452-        EXECUTE format(
infrastructure/migrations\044_parts_stock.sql:453:            'CREATE POLICY %I ON %s FOR UPDATE USING '
infrastructure/migrations\044_parts_stock.sql-454-            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id()) '
infrastructure/migrations\044_parts_stock.sql-455-            'WITH CHECK '
infrastructure/migrations\044_parts_stock.sql-456-            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
infrastructure/migrations\044_parts_stock.sql-457-            'tenant_update', t);
infrastructure/migrations\044_parts_stock.sql-458-    END LOOP;
--
infrastructure/migrations\043_warranty.sql-226-        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
infrastructure/migrations\043_warranty.sql-227-        EXECUTE format('ALTER TABLE %s FORCE  ROW LEVEL SECURITY', t);
infrastructure/migrations\043_warranty.sql-228-
infrastructure/migrations\043_warranty.sql-229-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'tenant_select', t);
infrastructure/migrations\043_warranty.sql-230-        EXECUTE format(
infrastructure/migrations\043_warranty.sql:231:            'CREATE POLICY %I ON %s FOR SELECT USING '
infrastructure/migrations\043_warranty.sql-232-            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
infrastructure/migrations\043_warranty.sql-233-            'tenant_select', t);
infrastructure/migrations\043_warranty.sql-234-
infrastructure/migrations\043_warranty.sql-235-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'tenant_insert', t);
infrastructure/migrations\043_warranty.sql-236-        EXECUTE format(
infrastructure/migrations\043_warranty.sql:237:            'CREATE POLICY %I ON %s FOR INSERT WITH CHECK '
infrastructure/migrations\043_warranty.sql-238-            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
infrastructure/migrations\043_warranty.sql-239-            'tenant_insert', t);
infrastructure/migrations\043_warranty.sql-240-
infrastructure/migrations\043_warranty.sql-241-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'tenant_update', t);
infrastructure/migrations\043_warranty.sql-242-        EXECUTE format(
infrastructure/migrations\043_warranty.sql:243:            'CREATE POLICY %I ON %s FOR UPDATE USING '
infrastructure/migrations\043_warranty.sql-244-            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id()) '
infrastructure/migrations\043_warranty.sql-245-            'WITH CHECK '
infrastructure/migrations\043_warranty.sql-246-            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
infrastructure/migrations\043_warranty.sql-247-            'tenant_update', t);
infrastructure/migrations\043_warranty.sql-248-    END LOOP;
--
infrastructure/migrations\042_finance.sql-474-        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
infrastructure/migrations\042_finance.sql-475-        EXECUTE format('ALTER TABLE %s FORCE  ROW LEVEL SECURITY', t);
infrastructure/migrations\042_finance.sql-476-
infrastructure/migrations\042_finance.sql-477-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'tenant_select', t);
infrastructure/migrations\042_finance.sql-478-        EXECUTE format(
infrastructure/migrations\042_finance.sql:479:            'CREATE POLICY %I ON %s FOR SELECT USING '
infrastructure/migrations\042_finance.sql-480-            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
infrastructure/migrations\042_finance.sql-481-            'tenant_select', t);
infrastructure/migrations\042_finance.sql-482-
infrastructure/migrations\042_finance.sql-483-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'tenant_insert', t);
infrastructure/migrations\042_finance.sql-484-        EXECUTE format(
infrastructure/migrations\042_finance.sql:485:            'CREATE POLICY %I ON %s FOR INSERT WITH CHECK '
infrastructure/migrations\042_finance.sql-486-            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
infrastructure/migrations\042_finance.sql-487-            'tenant_insert', t);
infrastructure/migrations\042_finance.sql-488-
infrastructure/migrations\042_finance.sql-489-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'tenant_update', t);
infrastructure/migrations\042_finance.sql-490-        EXECUTE format(
infrastructure/migrations\042_finance.sql:491:            'CREATE POLICY %I ON %s FOR UPDATE USING '
infrastructure/migrations\042_finance.sql-492-            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id()) '
infrastructure/migrations\042_finance.sql-493-            'WITH CHECK '
infrastructure/migrations\042_finance.sql-494-            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
infrastructure/migrations\042_finance.sql-495-            'tenant_update', t);
infrastructure/migrations\042_finance.sql-496-    END LOOP;
--
infrastructure/migrations\051_supervisor_findings.sql-80-END;
infrastructure/migrations\051_supervisor_findings.sql-81-$$;
infrastructure/migrations\051_supervisor_findings.sql-82-
infrastructure/migrations\051_supervisor_findings.sql-83--- ── 🔴 FINDING B — DELETE WAS GRANTED WHERE NO DELETE POLICY EXISTS ────────
infrastructure/migrations\051_supervisor_findings.sql-84---
infrastructure/migrations\051_supervisor_findings.sql:85:-- Under FORCE ROW LEVEL SECURITY a command with no matching policy matches ZERO
infrastructure/migrations\051_supervisor_findings.sql-86--- ROWS. It does not raise. So `core.vehicle_documents`, `core.maintenance_
infrastructure/migrations\051_supervisor_findings.sql-87--- schedules` (047) and `comms.participants` (046) each hold a `GRANT ... DELETE`
infrastructure/migrations\051_supervisor_findings.sql-88--- while their policy loops created SELECT, INSERT and UPDATE only.
infrastructure/migrations\051_supervisor_findings.sql-89---
infrastructure/migrations\051_supervisor_findings.sql-90--- This fails CLOSED, so it is not a hole — but it is the exact shape of the
--
infrastructure/migrations\051_supervisor_findings.sql-98--- the customer's record and should be corrected, not erased) and the policy is
infrastructure/migrations\051_supervisor_findings.sql-99--- added for `comms.participants`, where leaving a conversation is a real thing
infrastructure/migrations\051_supervisor_findings.sql-100--- a person will need to do.
infrastructure/migrations\051_supervisor_findings.sql-101-
infrastructure/migrations\051_supervisor_findings.sql-102-DROP POLICY IF EXISTS org_delete ON comms.participants;
infrastructure/migrations\051_supervisor_findings.sql:103:CREATE POLICY org_delete ON comms.participants FOR DELETE USING
infrastructure/migrations\051_supervisor_findings.sql-104-  (identity.is_platform_admin()
infrastructure/migrations\051_supervisor_findings.sql-105-   OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\051_supervisor_findings.sql-106-       AND organization_id = identity.current_organization_id()));
infrastructure/migrations\051_supervisor_findings.sql-107-
infrastructure/migrations\051_supervisor_findings.sql-108--- A document or a scheduled service is the customer's own record. Correcting
--
infrastructure/migrations\041_reception.sql-329-        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
infrastructure/migrations\041_reception.sql-330-        EXECUTE format('ALTER TABLE %s FORCE  ROW LEVEL SECURITY', t);
infrastructure/migrations\041_reception.sql-331-
infrastructure/migrations\041_reception.sql-332-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'tenant_select', t);
infrastructure/migrations\041_reception.sql-333-        EXECUTE format(
infrastructure/migrations\041_reception.sql:334:            'CREATE POLICY %I ON %s FOR SELECT USING '
infrastructure/migrations\041_reception.sql-335-            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
infrastructure/migrations\041_reception.sql-336-            'tenant_select', t);
infrastructure/migrations\041_reception.sql-337-
infrastructure/migrations\041_reception.sql-338-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'tenant_insert', t);
infrastructure/migrations\041_reception.sql-339-        EXECUTE format(
infrastructure/migrations\041_reception.sql:340:            'CREATE POLICY %I ON %s FOR INSERT WITH CHECK '
infrastructure/migrations\041_reception.sql-341-            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
infrastructure/migrations\041_reception.sql-342-            'tenant_insert', t);
infrastructure/migrations\041_reception.sql-343-
infrastructure/migrations\041_reception.sql-344-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'tenant_update', t);
infrastructure/migrations\041_reception.sql-345-        EXECUTE format(
infrastructure/migrations\041_reception.sql:346:            'CREATE POLICY %I ON %s FOR UPDATE USING '
infrastructure/migrations\041_reception.sql-347-            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id()) '
infrastructure/migrations\041_reception.sql-348-            'WITH CHECK '
infrastructure/migrations\041_reception.sql-349-            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
infrastructure/migrations\041_reception.sql-350-            'tenant_update', t);
infrastructure/migrations\041_reception.sql-351-    END LOOP;
--
infrastructure/migrations\040_media_assets.sql-226-
infrastructure/migrations\040_media_assets.sql-227-ALTER TABLE media.assets ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\040_media_assets.sql-228-ALTER TABLE media.assets FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\040_media_assets.sql-229-
infrastructure/migrations\040_media_assets.sql-230-DROP POLICY IF EXISTS assets_select ON media.assets;
infrastructure/migrations\040_media_assets.sql:231:CREATE POLICY assets_select ON media.assets FOR SELECT
infrastructure/migrations\040_media_assets.sql-232-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\040_media_assets.sql-233-
infrastructure/migrations\040_media_assets.sql-234-DROP POLICY IF EXISTS assets_insert ON media.assets;
infrastructure/migrations\040_media_assets.sql:235:CREATE POLICY assets_insert ON media.assets FOR INSERT
infrastructure/migrations\040_media_assets.sql-236-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\040_media_assets.sql-237-
infrastructure/migrations\040_media_assets.sql-238-DROP POLICY IF EXISTS assets_update ON media.assets;
infrastructure/migrations\040_media_assets.sql:239:CREATE POLICY assets_update ON media.assets FOR UPDATE
infrastructure/migrations\040_media_assets.sql-240-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\040_media_assets.sql-241-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\040_media_assets.sql-242-
infrastructure/migrations\040_media_assets.sql-243-ALTER TABLE media.links ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\040_media_assets.sql-244-ALTER TABLE media.links FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\040_media_assets.sql-245-
infrastructure/migrations\040_media_assets.sql-246-DROP POLICY IF EXISTS links_select ON media.links;
infrastructure/migrations\040_media_assets.sql:247:CREATE POLICY links_select ON media.links FOR SELECT
infrastructure/migrations\040_media_assets.sql-248-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\040_media_assets.sql-249-
infrastructure/migrations\040_media_assets.sql-250-DROP POLICY IF EXISTS links_insert ON media.links;
infrastructure/migrations\040_media_assets.sql:251:CREATE POLICY links_insert ON media.links FOR INSERT
infrastructure/migrations\040_media_assets.sql-252-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\040_media_assets.sql-253-
infrastructure/migrations\040_media_assets.sql-254-DROP POLICY IF EXISTS links_delete ON media.links;
infrastructure/migrations\040_media_assets.sql:255:CREATE POLICY links_delete ON media.links FOR DELETE
infrastructure/migrations\040_media_assets.sql-256-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\040_media_assets.sql-257-
infrastructure/migrations\040_media_assets.sql-258--- ── grants ──────────────────────────────────────────────────────────────────
infrastructure/migrations\040_media_assets.sql-259---
infrastructure/migrations\040_media_assets.sql-260--- ⚠️ THE REVOKE IS NOT REDUNDANT. Migration 006's `ALTER DEFAULT PRIVILEGES`
--
infrastructure/migrations\049_comms_calls.sql-250-        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
infrastructure/migrations\049_comms_calls.sql-251-        EXECUTE format('ALTER TABLE %s FORCE  ROW LEVEL SECURITY', t);
infrastructure/migrations\049_comms_calls.sql-252-
infrastructure/migrations\049_comms_calls.sql-253-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_select', t);
infrastructure/migrations\049_comms_calls.sql-254-        EXECUTE format(
infrastructure/migrations\049_comms_calls.sql:255:            'CREATE POLICY %I ON %s FOR SELECT USING '
infrastructure/migrations\049_comms_calls.sql-256-            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\049_comms_calls.sql-257-            'AND organization_id = identity.current_organization_id()))',
infrastructure/migrations\049_comms_calls.sql-258-            'org_select', t);
infrastructure/migrations\049_comms_calls.sql-259-
infrastructure/migrations\049_comms_calls.sql-260-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_insert', t);
infrastructure/migrations\049_comms_calls.sql-261-        EXECUTE format(
infrastructure/migrations\049_comms_calls.sql:262:            'CREATE POLICY %I ON %s FOR INSERT WITH CHECK '
infrastructure/migrations\049_comms_calls.sql-263-            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\049_comms_calls.sql-264-            'AND organization_id = identity.current_organization_id()))',
infrastructure/migrations\049_comms_calls.sql-265-            'org_insert', t);
infrastructure/migrations\049_comms_calls.sql-266-
infrastructure/migrations\049_comms_calls.sql-267-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_update', t);
infrastructure/migrations\049_comms_calls.sql-268-        EXECUTE format(
infrastructure/migrations\049_comms_calls.sql:269:            'CREATE POLICY %I ON %s FOR UPDATE USING '
infrastructure/migrations\049_comms_calls.sql-270-            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\049_comms_calls.sql-271-            'AND organization_id = identity.current_organization_id())) '
infrastructure/migrations\049_comms_calls.sql-272-            'WITH CHECK '
infrastructure/migrations\049_comms_calls.sql-273-            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\049_comms_calls.sql-274-            'AND organization_id = identity.current_organization_id()))',
--
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-30--- ── WHY, EXACTLY ──────────────────────────────────────────────────────────
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-31---
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-32--- `memberships_for_subject` is SECURITY DEFINER, and everyone reading it
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-33--- assumed that made it exempt. It does not: its owner is `autoworkshop`, which
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-34--- on Render is NOT a superuser (`rolsuper=f`, `rolbypassrls=f`), and
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql:35:-- identity.memberships is FORCE ROW LEVEL SECURITY — which binds the table
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-36--- OWNER as well. So inside the definer, every policy still applies:
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-37---
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-38---   tenant_isolation              needs a tenant context, and this query is
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-39---                                 what ESTABLISHES the tenant context
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql:40:--   registration_bootstrap_select needs app.bootstrap, only set inside
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-41---                                 register_workshop
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-42---
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-43--- Neither holds during a normal `/me`, so every membership row is filtered out.
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-44---
infrastructure/migrations\039_membership_lookup_can_read_own_rows.sql-45--- 🔴 AND THE FUNCTION USES A **LEFT** JOIN:
--
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
--
infrastructure/migrations\048_knowledge_learning.sql-228-    WHERE expires_on IS NOT NULL;
infrastructure/migrations\048_knowledge_learning.sql-229-
infrastructure/migrations\048_knowledge_learning.sql-230--- ── 🔴 THE SEED RUNS BEFORE RLS IS FORCED, AND THAT ORDER IS LOAD-BEARING ──
infrastructure/migrations\048_knowledge_learning.sql-231---
infrastructure/migrations\048_knowledge_learning.sql-232--- This block used to sit at the END of the file, after
infrastructure/migrations\048_knowledge_learning.sql:233:-- `ALTER TABLE knowledge.fault_codes FORCE ROW LEVEL SECURITY` and after a
infrastructure/migrations\048_knowledge_learning.sql-234--- policy that grants SELECT and nothing else. Under FORCE RLS an INSERT with no
infrastructure/migrations\048_knowledge_learning.sql-235--- INSERT policy is REFUSED — including for the table's owner, which is what
infrastructure/migrations\048_knowledge_learning.sql-236--- FORCE means.
infrastructure/migrations\048_knowledge_learning.sql-237---
infrastructure/migrations\048_knowledge_learning.sql-238--- It passed locally anyway, because the local `autoworkshop` role is
--
infrastructure/migrations\048_knowledge_learning.sql-298-        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
infrastructure/migrations\048_knowledge_learning.sql-299-        EXECUTE format('ALTER TABLE %s FORCE  ROW LEVEL SECURITY', t);
infrastructure/migrations\048_knowledge_learning.sql-300-
infrastructure/migrations\048_knowledge_learning.sql-301-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_select', t);
infrastructure/migrations\048_knowledge_learning.sql-302-        EXECUTE format(
infrastructure/migrations\048_knowledge_learning.sql:303:            'CREATE POLICY %I ON %s FOR SELECT USING '
infrastructure/migrations\048_knowledge_learning.sql-304-            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\048_knowledge_learning.sql-305-            'AND organization_id = identity.current_organization_id()))',
infrastructure/migrations\048_knowledge_learning.sql-306-            'org_select', t);
infrastructure/migrations\048_knowledge_learning.sql-307-
infrastructure/migrations\048_knowledge_learning.sql-308-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_insert', t);
infrastructure/migrations\048_knowledge_learning.sql-309-        EXECUTE format(
infrastructure/migrations\048_knowledge_learning.sql:310:            'CREATE POLICY %I ON %s FOR INSERT WITH CHECK '
infrastructure/migrations\048_knowledge_learning.sql-311-            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\048_knowledge_learning.sql-312-            'AND organization_id = identity.current_organization_id()))',
infrastructure/migrations\048_knowledge_learning.sql-313-            'org_insert', t);
infrastructure/migrations\048_knowledge_learning.sql-314-
infrastructure/migrations\048_knowledge_learning.sql-315-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_update', t);
infrastructure/migrations\048_knowledge_learning.sql-316-        EXECUTE format(
infrastructure/migrations\048_knowledge_learning.sql:317:            'CREATE POLICY %I ON %s FOR UPDATE USING '
infrastructure/migrations\048_knowledge_learning.sql-318-            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\048_knowledge_learning.sql-319-            'AND organization_id = identity.current_organization_id())) '
infrastructure/migrations\048_knowledge_learning.sql-320-            'WITH CHECK '
infrastructure/migrations\048_knowledge_learning.sql-321-            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\048_knowledge_learning.sql-322-            'AND organization_id = identity.current_organization_id()))',
--
infrastructure/migrations\048_knowledge_learning.sql-330--- refused to the application role entirely (see the grants) — the table is
infrastructure/migrations\048_knowledge_learning.sql-331--- reference data, maintained by migration, not by a workshop.
infrastructure/migrations\048_knowledge_learning.sql-332-ALTER TABLE knowledge.fault_codes ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\048_knowledge_learning.sql-333-ALTER TABLE knowledge.fault_codes FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\048_knowledge_learning.sql-334-DROP POLICY IF EXISTS everyone_reads ON knowledge.fault_codes;
infrastructure/migrations\048_knowledge_learning.sql:335:CREATE POLICY everyone_reads ON knowledge.fault_codes FOR SELECT USING (true);
infrastructure/migrations\048_knowledge_learning.sql-336-
infrastructure/migrations\048_knowledge_learning.sql-337--- ── grants ──────────────────────────────────────────────────────────────────
infrastructure/migrations\048_knowledge_learning.sql-338---
infrastructure/migrations\048_knowledge_learning.sql-339--- ⚠️ THE REVOKES ARE NOT REDUNDANT — 006's ALTER DEFAULT PRIVILEGES grants
infrastructure/migrations\048_knowledge_learning.sql-340--- UPDATE and DELETE on every new table in these schemas.
--
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-4--- ── THE DEFECT, AND IT IS ONE I WROTE ───────────────────────────────────────
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-5---
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-6--- Migration 037's policies admit a row when two transaction-local settings say
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-7--- so:
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-8---
infrastructure/migrations\038_bootstrap_door_requires_definer.sql:9:--     current_setting('app.bootstrap', true) = 'on'
infrastructure/migrations\038_bootstrap_door_requires_definer.sql:10:--     AND created_by::text = current_setting('app.bootstrap_user', true)
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-11---
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-12--- 037's own header claims: "The bypass must be reachable only from inside this
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-13--- function." **THAT SENTENCE WAS FALSE WHEN IT WAS WRITTEN.** `set_config` is
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-14--- not privileged, and migration 002 grants `autoworkshop_app` INSERT on every
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-15--- table in `identity` — so the application role can open the door for itself
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-16--- and write directly, with `identity.register_workshop` never involved.
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-17---
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-18--- Measured, as `autoworkshop_app`, with no function in the call path:
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-19---
infrastructure/migrations\038_bootstrap_door_requires_definer.sql:20:--     SET app.bootstrap = 'on';
infrastructure/migrations\038_bootstrap_door_requires_definer.sql:21:--     SET app.bootstrap_user = '<any user id>';
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-22---     INSERT INTO identity.tenants (...) VALUES (...);   -- INSERT 0 1
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-23---
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-24--- Found by Codex. It is the "a comment that claims a safety net which does not
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-25--- exist" failure this repository has now recorded three times — and the most
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-26--- expensive kind, because a confident sentence stops the next reader checking.
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-27---
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-28--- ── HOW BAD, STATED HONESTLY ────────────────────────────────────────────────
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-29---
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-30--- Narrow, and not nothing. The policies still pin every row to
infrastructure/migrations\038_bootstrap_door_requires_definer.sql:31:-- `app.bootstrap_user`, so the door cannot write into somebody else's tenant or
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-32--- read another customer's data — the blast radius is "create a tenant, an
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-33--- organisation and a membership attributed to a chosen user", which is what
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-34--- registration legitimately does. It is a widening of an intended path, not an
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-35--- open door to other tenants. It is fixed here because the gap between what the
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-36--- policy does and what its comment claims is itself the hazard.
--
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-59--- NOT SECURITY DEFINER, deliberately: it must observe the CALLER's effective
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-60--- user. As SECURITY DEFINER it would always see its own owner and return true
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-61--- for everybody, which would restore the exact hole it closes.
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-62-SET search_path = identity, pg_catalog, pg_temp
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-63-AS $$
infrastructure/migrations\038_bootstrap_door_requires_definer.sql:64:  SELECT current_setting('app.bootstrap', true) = 'on'
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-65-     AND current_user = (
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-66-           SELECT r.rolname
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-67-             FROM pg_proc p
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-68-             JOIN pg_roles r ON r.oid = p.proowner
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-69-            WHERE p.oid = 'identity.register_workshop(text,text,text)'::regprocedure
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-70-         );
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-71-$$;
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-72-
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-73-COMMENT ON FUNCTION identity.in_registration_bootstrap() IS
infrastructure/migrations\038_bootstrap_door_requires_definer.sql:74:'TRUE only inside identity.register_workshop: the app.bootstrap flag is set AND '
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-75-'the effective user is that function''s owner. The flag alone is settable by any '
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-76-'caller (set_config is not privileged), so the owner check is the half that '
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-77-'cannot be forged from an application connection.';
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-78-
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-79-REVOKE ALL ON FUNCTION identity.in_registration_bootstrap() FROM PUBLIC;
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-80-GRANT EXECUTE ON FUNCTION identity.in_registration_bootstrap() TO autoworkshop_app;
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-81-
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-82--- ── the five policies, re-stated with the owner requirement ─────────────────
infrastructure/migrations\038_bootstrap_door_requires_definer.sql:83:-- Each still pins the row to app.bootstrap_user. That pin is what keeps the
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-84--- door from touching another person's tenant; this migration adds who may
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-85--- knock at all.
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-86-
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-87-DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.tenants;
infrastructure/migrations\038_bootstrap_door_requires_definer.sql:88:CREATE POLICY registration_bootstrap_insert ON identity.tenants
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-89-    FOR INSERT
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-90-    WITH CHECK (
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-91-        identity.in_registration_bootstrap()
infrastructure/migrations\038_bootstrap_door_requires_definer.sql:92:        AND created_by::text = current_setting('app.bootstrap_user', true)
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-93-    );
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-94-
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-95-DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.organizations;
infrastructure/migrations\038_bootstrap_door_requires_definer.sql:96:CREATE POLICY registration_bootstrap_insert ON identity.organizations
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-97-    FOR INSERT
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-98-    WITH CHECK (
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-99-        identity.in_registration_bootstrap()
infrastructure/migrations\038_bootstrap_door_requires_definer.sql:100:        AND created_by::text = current_setting('app.bootstrap_user', true)
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-101-    );
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-102-
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-103-DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.branches;
infrastructure/migrations\038_bootstrap_door_requires_definer.sql:104:CREATE POLICY registration_bootstrap_insert ON identity.branches
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-105-    FOR INSERT
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-106-    WITH CHECK (
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-107-        identity.in_registration_bootstrap()
infrastructure/migrations\038_bootstrap_door_requires_definer.sql:108:        AND created_by::text = current_setting('app.bootstrap_user', true)
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-109-    );
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-110-
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-111-DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.memberships;
infrastructure/migrations\038_bootstrap_door_requires_definer.sql:112:CREATE POLICY registration_bootstrap_insert ON identity.memberships
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-113-    FOR INSERT
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-114-    WITH CHECK (
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-115-        identity.in_registration_bootstrap()
infrastructure/migrations\038_bootstrap_door_requires_definer.sql:116:        AND created_by::text = current_setting('app.bootstrap_user', true)
infrastructure/migrations\038_bootstrap_door_requires_definer.sql:117:        AND user_id::text   = current_setting('app.bootstrap_user', true)
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-118-    );
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-119-
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-120-DROP POLICY IF EXISTS registration_bootstrap_select ON identity.memberships;
infrastructure/migrations\038_bootstrap_door_requires_definer.sql:121:CREATE POLICY registration_bootstrap_select ON identity.memberships
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-122-    FOR SELECT
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-123-    USING (
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-124-        identity.in_registration_bootstrap()
infrastructure/migrations\038_bootstrap_door_requires_definer.sql:125:        AND user_id::text = current_setting('app.bootstrap_user', true)
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-126-    );
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-127-
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-128-COMMENT ON POLICY registration_bootstrap_insert ON identity.tenants IS
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-129-'Sign-up only. Admits an INSERT while identity.register_workshop holds '
infrastructure/migrations\038_bootstrap_door_requires_definer.sql:130:'app.bootstrap=on AND the effective user is that function''s owner, and only '
infrastructure/migrations\038_bootstrap_door_requires_definer.sql:131:'for a row attributed to app.bootstrap_user. The owner requirement (038) is '
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-132-'what makes this unreachable from an ordinary application connection — the flag '
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-133-'alone was settable by the app role, which 037''s header wrongly claimed it was not.';
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-134-
infrastructure/migrations\038_bootstrap_door_requires_definer.sql-135-COMMIT;
--
infrastructure/migrations\047_customer_self_service.sql-303-        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
infrastructure/migrations\047_customer_self_service.sql-304-        EXECUTE format('ALTER TABLE %s FORCE  ROW LEVEL SECURITY', t);
infrastructure/migrations\047_customer_self_service.sql-305-
infrastructure/migrations\047_customer_self_service.sql-306-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_select', t);
infrastructure/migrations\047_customer_self_service.sql-307-        EXECUTE format(
infrastructure/migrations\047_customer_self_service.sql:308:            'CREATE POLICY %I ON %s FOR SELECT USING '
infrastructure/migrations\047_customer_self_service.sql-309-            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\047_customer_self_service.sql-310-            'AND organization_id = identity.current_organization_id()))',
infrastructure/migrations\047_customer_self_service.sql-311-            'org_select', t);
infrastructure/migrations\047_customer_self_service.sql-312-
infrastructure/migrations\047_customer_self_service.sql-313-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_insert', t);
infrastructure/migrations\047_customer_self_service.sql-314-        EXECUTE format(
infrastructure/migrations\047_customer_self_service.sql:315:            'CREATE POLICY %I ON %s FOR INSERT WITH CHECK '
infrastructure/migrations\047_customer_self_service.sql-316-            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\047_customer_self_service.sql-317-            'AND organization_id = identity.current_organization_id()))',
infrastructure/migrations\047_customer_self_service.sql-318-            'org_insert', t);
infrastructure/migrations\047_customer_self_service.sql-319-
infrastructure/migrations\047_customer_self_service.sql-320-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_update', t);
infrastructure/migrations\047_customer_self_service.sql-321-        EXECUTE format(
infrastructure/migrations\047_customer_self_service.sql:322:            'CREATE POLICY %I ON %s FOR UPDATE USING '
infrastructure/migrations\047_customer_self_service.sql-323-            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\047_customer_self_service.sql-324-            'AND organization_id = identity.current_organization_id())) '
infrastructure/migrations\047_customer_self_service.sql-325-            'WITH CHECK '
infrastructure/migrations\047_customer_self_service.sql-326-            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\047_customer_self_service.sql-327-            'AND organization_id = identity.current_organization_id()))',
--
infrastructure/migrations\037_registration_rls_bootstrap.sql-7---
infrastructure/migrations\037_registration_rls_bootstrap.sql-8--- `identity.register_workshop` (migration 036) is SECURITY DEFINER and owned by
infrastructure/migrations\037_registration_rls_bootstrap.sql-9--- the `autoworkshop` database user. LOCALLY that user is a SUPERUSER, and a
infrastructure/migrations\037_registration_rls_bootstrap.sql-10--- superuser bypasses row-level security entirely — so all four INSERTs sailed
infrastructure/migrations\037_registration_rls_bootstrap.sql-11--- through and `verify/036` reported 9 of 9. ON RENDER the same user is merely
infrastructure/migrations\037_registration_rls_bootstrap.sql:12:-- the table OWNER, and migration 001 applied `FORCE ROW LEVEL SECURITY`, which
infrastructure/migrations\037_registration_rls_bootstrap.sql-13--- exists precisely so that owners are NOT exempt. The first INSERT is refused.
infrastructure/migrations\037_registration_rls_bootstrap.sql-14---
infrastructure/migrations\037_registration_rls_bootstrap.sql-15--- The function is byte-identical in both places. **The ROLE is not.** This is
infrastructure/migrations\037_registration_rls_bootstrap.sql-16--- why anything touching RLS is rehearsed ON LIVE, as the app role, and never
infrastructure/migrations\037_registration_rls_bootstrap.sql-17--- believed on the strength of a local pass.
--
infrastructure/migrations\037_registration_rls_bootstrap.sql-41---
infrastructure/migrations\037_registration_rls_bootstrap.sql-42--- A controlled bypass, scoped to this one function, visible in the catalogue as
infrastructure/migrations\037_registration_rls_bootstrap.sql-43--- named policies rather than hidden in a role attribute:
infrastructure/migrations\037_registration_rls_bootstrap.sql-44---
infrastructure/migrations\037_registration_rls_bootstrap.sql-45---   1. `register_workshop` sets two transaction-local GUCs before it touches a
infrastructure/migrations\037_registration_rls_bootstrap.sql:46:--      tenant-owned table: `app.bootstrap = 'on'` and `app.bootstrap_user` =
infrastructure/migrations\037_registration_rls_bootstrap.sql-47---      the id of the user being registered. It CLEARS them again before it
infrastructure/migrations\037_registration_rls_bootstrap.sql-48---      returns.
infrastructure/migrations\037_registration_rls_bootstrap.sql-49---   2. This migration adds one permissive policy per table, admitting a row
infrastructure/migrations\037_registration_rls_bootstrap.sql-50---      ONLY when the flag is on AND the row is attributed to that same user.
infrastructure/migrations\037_registration_rls_bootstrap.sql-51---
infrastructure/migrations\037_registration_rls_bootstrap.sql-52--- ⚠️ The bypass is NOT "ignore RLS while the flag is set". Every policy below
infrastructure/migrations\037_registration_rls_bootstrap.sql:53:-- also pins `created_by` (or `user_id`) to `app.bootstrap_user`, so even with
infrastructure/migrations\037_registration_rls_bootstrap.sql-54--- the flag forced on, the door can only create rows belonging to the one person
infrastructure/migrations\037_registration_rls_bootstrap.sql-55--- registering. It cannot read or write anybody else's tenant.
infrastructure/migrations\037_registration_rls_bootstrap.sql-56---
infrastructure/migrations\037_registration_rls_bootstrap.sql-57--- ⚠️ FAIL-CLOSED IN BOTH DIRECTIONS, deliberately:
infrastructure/migrations\037_registration_rls_bootstrap.sql-58---   · `current_setting(..., true)` returns NULL when unset. `NULL = 'on'` is
infrastructure/migrations\037_registration_rls_bootstrap.sql-59---     NULL, which is not TRUE, so the policy refuses. An unset flag is a
infrastructure/migrations\037_registration_rls_bootstrap.sql-60---     closed door, not an open one.
infrastructure/migrations\037_registration_rls_bootstrap.sql-61---   · The user comparison is made on TEXT, not uuid. A junk value in
infrastructure/migrations\037_registration_rls_bootstrap.sql:62:--     `app.bootstrap_user` therefore fails to match rather than RAISEing a
infrastructure/migrations\037_registration_rls_bootstrap.sql-63---     cast error — no remote input can turn this into a 500.
infrastructure/migrations\037_registration_rls_bootstrap.sql-64---
infrastructure/migrations\037_registration_rls_bootstrap.sql-65--- ⚠️ REJECTED ALTERNATIVE: a `BYPASSRLS` role owning the function. It needs
infrastructure/migrations\037_registration_rls_bootstrap.sql-66--- privileges Render's user probably lacks, and it would move the exemption from
infrastructure/migrations\037_registration_rls_bootstrap.sql-67--- a policy anyone can read in `pg_policies` into a role attribute nobody looks
--
infrastructure/migrations\037_registration_rls_bootstrap.sql-84--- Permissive, so each is OR'd with the existing `tenant_isolation` policy
infrastructure/migrations\037_registration_rls_bootstrap.sql-85--- rather than replacing it. FOR INSERT only, except on memberships, which also
infrastructure/migrations\037_registration_rls_bootstrap.sql-86--- needs the narrow SELECT the duplicate guard depends on.
infrastructure/migrations\037_registration_rls_bootstrap.sql-87-
infrastructure/migrations\037_registration_rls_bootstrap.sql-88-DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.tenants;
infrastructure/migrations\037_registration_rls_bootstrap.sql:89:CREATE POLICY registration_bootstrap_insert ON identity.tenants
infrastructure/migrations\037_registration_rls_bootstrap.sql-90-    FOR INSERT
infrastructure/migrations\037_registration_rls_bootstrap.sql-91-    WITH CHECK (
infrastructure/migrations\037_registration_rls_bootstrap.sql:92:        current_setting('app.bootstrap', true) = 'on'
infrastructure/migrations\037_registration_rls_bootstrap.sql:93:        AND created_by::text = current_setting('app.bootstrap_user', true)
infrastructure/migrations\037_registration_rls_bootstrap.sql-94-    );
infrastructure/migrations\037_registration_rls_bootstrap.sql-95-
infrastructure/migrations\037_registration_rls_bootstrap.sql-96-DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.organizations;
infrastructure/migrations\037_registration_rls_bootstrap.sql:97:CREATE POLICY registration_bootstrap_insert ON identity.organizations
infrastructure/migrations\037_registration_rls_bootstrap.sql-98-    FOR INSERT
infrastructure/migrations\037_registration_rls_bootstrap.sql-99-    WITH CHECK (
infrastructure/migrations\037_registration_rls_bootstrap.sql:100:        current_setting('app.bootstrap', true) = 'on'
infrastructure/migrations\037_registration_rls_bootstrap.sql:101:        AND created_by::text = current_setting('app.bootstrap_user', true)
infrastructure/migrations\037_registration_rls_bootstrap.sql-102-    );
infrastructure/migrations\037_registration_rls_bootstrap.sql-103-
infrastructure/migrations\037_registration_rls_bootstrap.sql-104-DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.branches;
infrastructure/migrations\037_registration_rls_bootstrap.sql:105:CREATE POLICY registration_bootstrap_insert ON identity.branches
infrastructure/migrations\037_registration_rls_bootstrap.sql-106-    FOR INSERT
infrastructure/migrations\037_registration_rls_bootstrap.sql-107-    WITH CHECK (
infrastructure/migrations\037_registration_rls_bootstrap.sql:108:        current_setting('app.bootstrap', true) = 'on'
infrastructure/migrations\037_registration_rls_bootstrap.sql:109:        AND created_by::text = current_setting('app.bootstrap_user', true)
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
infrastructure/migrations\037_registration_rls_bootstrap.sql:120:        current_setting('app.bootstrap', true) = 'on'
infrastructure/migrations\037_registration_rls_bootstrap.sql:121:        AND created_by::text = current_setting('app.bootstrap_user', true)
infrastructure/migrations\037_registration_rls_bootstrap.sql:122:        AND user_id::text   = current_setting('app.bootstrap_user', true)
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
infrastructure/migrations\037_registration_rls_bootstrap.sql:133:        current_setting('app.bootstrap', true) = 'on'
infrastructure/migrations\037_registration_rls_bootstrap.sql:134:        AND user_id::text = current_setting('app.bootstrap_user', true)
infrastructure/migrations\037_registration_rls_bootstrap.sql-135-    );
infrastructure/migrations\037_registration_rls_bootstrap.sql-136-
infrastructure/migrations\037_registration_rls_bootstrap.sql-137-COMMENT ON POLICY registration_bootstrap_insert ON identity.tenants IS
infrastructure/migrations\037_registration_rls_bootstrap.sql-138-'Sign-up only. Admits an INSERT while identity.register_workshop holds '
infrastructure/migrations\037_registration_rls_bootstrap.sql:139:'app.bootstrap=on, and only for a row attributed to app.bootstrap_user. '
infrastructure/migrations\037_registration_rls_bootstrap.sql-140-'Registration is the one operation that legitimately has no tenant context — '
infrastructure/migrations\037_registration_rls_bootstrap.sql-141-'it is what CREATES the tenant a context is later made from.';
infrastructure/migrations\037_registration_rls_bootstrap.sql-142-
infrastructure/migrations\037_registration_rls_bootstrap.sql-143-COMMENT ON POLICY registration_bootstrap_select ON identity.memberships IS
infrastructure/migrations\037_registration_rls_bootstrap.sql-144-'Lets identity.register_workshop see whether the registering user ALREADY '
infrastructure/migrations\037_registration_rls_bootstrap.sql-145-'belongs to an organisation. Under FORCE RLS with no tenant context that check '
infrastructure/migrations\037_registration_rls_bootstrap.sql-146-'returned zero rows for everyone, so the one-workshop-per-person rule could '
infrastructure/migrations\037_registration_rls_bootstrap.sql:147:'never fire. Scoped to that single user, and only while app.bootstrap=on.';
infrastructure/migrations\037_registration_rls_bootstrap.sql-148-
infrastructure/migrations\037_registration_rls_bootstrap.sql-149--- ── 2. the function, taught to open and close the door ──────────────────────
infrastructure/migrations\037_registration_rls_bootstrap.sql-150-
infrastructure/migrations\037_registration_rls_bootstrap.sql-151-CREATE OR REPLACE FUNCTION identity.register_workshop(
infrastructure/migrations\037_registration_rls_bootstrap.sql-152-    p_subject       TEXT,
--
infrastructure/migrations\037_registration_rls_bootstrap.sql-192-    -- Both settings are transaction-local (`is_local => true`), so a connection
infrastructure/migrations\037_registration_rls_bootstrap.sql-193-    -- returned to the pool cannot carry them to the next request even if this
infrastructure/migrations\037_registration_rls_bootstrap.sql-194-    -- function were to abort. They are cleared explicitly below as well,
infrastructure/migrations\037_registration_rls_bootstrap.sql-195-    -- because the SUCCESS path leaves the caller's transaction open and the
infrastructure/migrations\037_registration_rls_bootstrap.sql-196-    -- flag must not still be set when control returns to the service.
infrastructure/migrations\037_registration_rls_bootstrap.sql:197:    PERFORM set_config('app.bootstrap',      'on',          true);
infrastructure/migrations\037_registration_rls_bootstrap.sql:198:    PERFORM set_config('app.bootstrap_user', v_user::text,  true);
infrastructure/migrations\037_registration_rls_bootstrap.sql-199-
infrastructure/migrations\037_registration_rls_bootstrap.sql-200-    -- ⚠️ ONE WORKSHOP PER PERSON, and this check only became CAPABLE of firing
infrastructure/migrations\037_registration_rls_bootstrap.sql-201-    -- in migration 037: under FORCE RLS with no tenant context it read zero
infrastructure/migrations\037_registration_rls_bootstrap.sql-202-    -- rows for everybody. It sits AFTER the flag is set for that reason.
infrastructure/migrations\037_registration_rls_bootstrap.sql-203-    -- A retried request — a double-submitted form, a client that resends on a
infrastructure/migrations\037_registration_rls_bootstrap.sql-204-    -- slow response — would otherwise create a SECOND tenant with the same
infrastructure/migrations\037_registration_rls_bootstrap.sql-205-    -- owner, and there is no UI anywhere that would reveal the duplicate.
infrastructure/migrations\037_registration_rls_bootstrap.sql-206-    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\037_registration_rls_bootstrap.sql-207-                WHERE user_id = v_user AND status = 'active') THEN
infrastructure/migrations\037_registration_rls_bootstrap.sql:208:        PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\037_registration_rls_bootstrap.sql:209:        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\037_registration_rls_bootstrap.sql-210-        RAISE EXCEPTION 'this account already belongs to an organisation';
infrastructure/migrations\037_registration_rls_bootstrap.sql-211-    END IF;
infrastructure/migrations\037_registration_rls_bootstrap.sql-212-
infrastructure/migrations\037_registration_rls_bootstrap.sql-213-    -- A readable, unique slug. `identity.tenants.slug` is NOT NULL and unique;
infrastructure/migrations\037_registration_rls_bootstrap.sql-214-    -- deriving it from the name alone would collide on the second "Auto Fix".
--
infrastructure/migrations\037_registration_rls_bootstrap.sql-257-    -- ── and the door closes ────────────────────────────────────────────────
infrastructure/migrations\037_registration_rls_bootstrap.sql-258-    -- The caller's transaction continues after this function returns. Leaving
infrastructure/migrations\037_registration_rls_bootstrap.sql-259-    -- the flag set would hand the rest of that transaction a bypass it was
infrastructure/migrations\037_registration_rls_bootstrap.sql-260-    -- never meant to have — a bypass whose blast radius is small (it is pinned
infrastructure/migrations\037_registration_rls_bootstrap.sql-261-    -- to this user) but which would still be an exemption nobody asked for.
infrastructure/migrations\037_registration_rls_bootstrap.sql:262:    PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\037_registration_rls_bootstrap.sql:263:    PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\037_registration_rls_bootstrap.sql-264-
infrastructure/migrations\037_registration_rls_bootstrap.sql-265-    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
infrastructure/migrations\037_registration_rls_bootstrap.sql-266-END;
infrastructure/migrations\037_registration_rls_bootstrap.sql-267-$$;
infrastructure/migrations\037_registration_rls_bootstrap.sql-268-
--
infrastructure/migrations\037_registration_rls_bootstrap.sql-270-'Registration: creates tenant + organisation + branch + owner membership for the '
infrastructure/migrations\037_registration_rls_bootstrap.sql-271-'caller, atomically. The ONLY function that grants a membership to its own caller, '
infrastructure/migrations\037_registration_rls_bootstrap.sql-272-'and safe only because the tenant did not exist a moment earlier: it accepts no '
infrastructure/migrations\037_registration_rls_bootstrap.sql-273-'tenant id and refuses a caller who already belongs to one. Adding a person to an '
infrastructure/migrations\037_registration_rls_bootstrap.sql-274-'EXISTING organisation is MembershipService.grant(), which requires an admin. '
infrastructure/migrations\037_registration_rls_bootstrap.sql:275:'Opens a narrow RLS bootstrap door (app.bootstrap / app.bootstrap_user, both '
infrastructure/migrations\037_registration_rls_bootstrap.sql-276-'transaction-local) because it runs as a NON-superuser owner on production, where '
infrastructure/migrations\037_registration_rls_bootstrap.sql:277:'FORCE ROW LEVEL SECURITY applies to owners too. Closes it before returning.';
infrastructure/migrations\037_registration_rls_bootstrap.sql-278-
infrastructure/migrations\037_registration_rls_bootstrap.sql-279-REVOKE ALL ON FUNCTION identity.register_workshop(TEXT, TEXT, TEXT) FROM PUBLIC;
infrastructure/migrations\037_registration_rls_bootstrap.sql-280-GRANT EXECUTE ON FUNCTION identity.register_workshop(TEXT, TEXT, TEXT) TO autoworkshop_app;
infrastructure/migrations\037_registration_rls_bootstrap.sql-281-
infrastructure/migrations\037_registration_rls_bootstrap.sql-282-COMMIT;
--
infrastructure/migrations\046_comms_messaging.sql-217-        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
infrastructure/migrations\046_comms_messaging.sql-218-        EXECUTE format('ALTER TABLE %s FORCE  ROW LEVEL SECURITY', t);
infrastructure/migrations\046_comms_messaging.sql-219-
infrastructure/migrations\046_comms_messaging.sql-220-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_select', t);
infrastructure/migrations\046_comms_messaging.sql-221-        EXECUTE format(
infrastructure/migrations\046_comms_messaging.sql:222:            'CREATE POLICY %I ON %s FOR SELECT USING '
infrastructure/migrations\046_comms_messaging.sql-223-            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\046_comms_messaging.sql-224-            'AND organization_id = identity.current_organization_id()))',
infrastructure/migrations\046_comms_messaging.sql-225-            'org_select', t);
infrastructure/migrations\046_comms_messaging.sql-226-
infrastructure/migrations\046_comms_messaging.sql-227-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_insert', t);
infrastructure/migrations\046_comms_messaging.sql-228-        EXECUTE format(
infrastructure/migrations\046_comms_messaging.sql:229:            'CREATE POLICY %I ON %s FOR INSERT WITH CHECK '
infrastructure/migrations\046_comms_messaging.sql-230-            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\046_comms_messaging.sql-231-            'AND organization_id = identity.current_organization_id()))',
infrastructure/migrations\046_comms_messaging.sql-232-            'org_insert', t);
infrastructure/migrations\046_comms_messaging.sql-233-
infrastructure/migrations\046_comms_messaging.sql-234-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_update', t);
infrastructure/migrations\046_comms_messaging.sql-235-        EXECUTE format(
infrastructure/migrations\046_comms_messaging.sql:236:            'CREATE POLICY %I ON %s FOR UPDATE USING '
infrastructure/migrations\046_comms_messaging.sql-237-            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\046_comms_messaging.sql-238-            'AND organization_id = identity.current_organization_id())) '
infrastructure/migrations\046_comms_messaging.sql-239-            'WITH CHECK '
infrastructure/migrations\046_comms_messaging.sql-240-            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\046_comms_messaging.sql-241-            'AND organization_id = identity.current_organization_id()))',
--
infrastructure/migrations\045_workshop_settings.sql-370-
infrastructure/migrations\045_workshop_settings.sql-371-        -- BOTH predicates. See the header: tenant alone is not isolation here,
infrastructure/migrations\045_workshop_settings.sql-372-        -- because a tenant in this database holds more than one organisation.
infrastructure/migrations\045_workshop_settings.sql-373-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_select', t);
infrastructure/migrations\045_workshop_settings.sql-374-        EXECUTE format(
infrastructure/migrations\045_workshop_settings.sql:375:            'CREATE POLICY %I ON %s FOR SELECT USING '
infrastructure/migrations\045_workshop_settings.sql-376-            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\045_workshop_settings.sql-377-            'AND organization_id = identity.current_organization_id()))',
infrastructure/migrations\045_workshop_settings.sql-378-            'org_select', t);
infrastructure/migrations\045_workshop_settings.sql-379-
infrastructure/migrations\045_workshop_settings.sql-380-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_insert', t);
infrastructure/migrations\045_workshop_settings.sql-381-        EXECUTE format(
infrastructure/migrations\045_workshop_settings.sql:382:            'CREATE POLICY %I ON %s FOR INSERT WITH CHECK '
infrastructure/migrations\045_workshop_settings.sql-383-            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\045_workshop_settings.sql-384-            'AND organization_id = identity.current_organization_id()))',
infrastructure/migrations\045_workshop_settings.sql-385-            'org_insert', t);
infrastructure/migrations\045_workshop_settings.sql-386-
infrastructure/migrations\045_workshop_settings.sql-387-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_update', t);
infrastructure/migrations\045_workshop_settings.sql-388-        EXECUTE format(
infrastructure/migrations\045_workshop_settings.sql:389:            'CREATE POLICY %I ON %s FOR UPDATE USING '
infrastructure/migrations\045_workshop_settings.sql-390-            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\045_workshop_settings.sql-391-            'AND organization_id = identity.current_organization_id())) '
infrastructure/migrations\045_workshop_settings.sql-392-            'WITH CHECK '
infrastructure/migrations\045_workshop_settings.sql-393-            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\045_workshop_settings.sql-394-            'AND organization_id = identity.current_organization_id()))',
infrastructure/migrations\045_workshop_settings.sql-395-            'org_update', t);
infrastructure/migrations\045_workshop_settings.sql-396-
infrastructure/migrations\045_workshop_settings.sql-397-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_delete', t);
infrastructure/migrations\045_workshop_settings.sql-398-        EXECUTE format(
infrastructure/migrations\045_workshop_settings.sql:399:            'CREATE POLICY %I ON %s FOR DELETE USING '
infrastructure/migrations\045_workshop_settings.sql-400-            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\045_workshop_settings.sql-401-            'AND organization_id = identity.current_organization_id()))',
infrastructure/migrations\045_workshop_settings.sql-402-            'org_delete', t);
infrastructure/migrations\045_workshop_settings.sql-403-    END LOOP;
infrastructure/migrations\045_workshop_settings.sql-404-END $$;
infrastructure/migrations\045_workshop_settings.sql-405-
infrastructure/migrations\045_workshop_settings.sql-406--- The two publishable tables, and only those two. Copied from
infrastructure/migrations\045_workshop_settings.sql-407--- `catalogue.mechanic_directory.public_read`, which is the proven precedent in
infrastructure/migrations\045_workshop_settings.sql-408--- this database for "readable with no tenant context at all".
infrastructure/migrations\045_workshop_settings.sql-409-DROP POLICY IF EXISTS public_read ON core.opening_hours;
infrastructure/migrations\045_workshop_settings.sql:410:CREATE POLICY public_read ON core.opening_hours FOR SELECT USING (is_published);
infrastructure/migrations\045_workshop_settings.sql-411-
infrastructure/migrations\045_workshop_settings.sql-412-DROP POLICY IF EXISTS public_read ON core.service_categories;
infrastructure/migrations\045_workshop_settings.sql:413:CREATE POLICY public_read ON core.service_categories FOR SELECT USING (is_published AND is_active);
infrastructure/migrations\045_workshop_settings.sql-414-
infrastructure/migrations\045_workshop_settings.sql-415--- ── grants ──────────────────────────────────────────────────────────────────
infrastructure/migrations\045_workshop_settings.sql-416---
infrastructure/migrations\045_workshop_settings.sql-417--- ⚠️ THE REVOKES ARE NOT REDUNDANT — 006's ALTER DEFAULT PRIVILEGES grants
infrastructure/migrations\045_workshop_settings.sql-418--- UPDATE and DELETE on every new table in these schemas, so a table that should
--
infrastructure/migrations\033_variation_hardening.sql-76-    ON repair.variation_decisions(variation_id, decided_at DESC);
infrastructure/migrations\033_variation_hardening.sql-77-
infrastructure/migrations\033_variation_hardening.sql-78-ALTER TABLE repair.variation_decisions ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\033_variation_hardening.sql-79-ALTER TABLE repair.variation_decisions FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\033_variation_hardening.sql-80-DROP POLICY IF EXISTS tenant_isolation ON repair.variation_decisions;
infrastructure/migrations\033_variation_hardening.sql:81:CREATE POLICY tenant_isolation ON repair.variation_decisions
infrastructure/migrations\033_variation_hardening.sql-82-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\033_variation_hardening.sql-83-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\033_variation_hardening.sql-84-
infrastructure/migrations\033_variation_hardening.sql-85--- Append-only in the strongest sense available: no UPDATE, no DELETE. 006's
infrastructure/migrations\033_variation_hardening.sql-86--- ALTER DEFAULT PRIVILEGES grants both on new tables, so both REVOKEs are
--
infrastructure/migrations\032_repair_variations.sql-235--- the app connects as — isolation present and inert.
infrastructure/migrations\032_repair_variations.sql-236-ALTER TABLE repair.repair_variations ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\032_repair_variations.sql-237-ALTER TABLE repair.repair_variations FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\032_repair_variations.sql-238-
infrastructure/migrations\032_repair_variations.sql-239-DROP POLICY IF EXISTS tenant_isolation ON repair.repair_variations;
infrastructure/migrations\032_repair_variations.sql:240:CREATE POLICY tenant_isolation ON repair.repair_variations
infrastructure/migrations\032_repair_variations.sql-241-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\032_repair_variations.sql-242-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\032_repair_variations.sql-243-
infrastructure/migrations\032_repair_variations.sql-244--- ── grants ──────────────────────────────────────────────────────────────────
infrastructure/migrations\032_repair_variations.sql-245---
--
infrastructure/migrations\069_organization_registrations.sql-114--- customer enrolled at a workshop seeing that the workshop is approved tells
infrastructure/migrations\069_organization_registrations.sql-115--- them nothing they cannot see from the public directory. Stated because the
infrastructure/migrations\069_organization_registrations.sql-116--- 059/062/066/067 sequence has made "no role clause" look like an oversight by
infrastructure/migrations\069_organization_registrations.sql-117--- default, and here it is a decision.
infrastructure/migrations\069_organization_registrations.sql-118-DROP POLICY IF EXISTS org_registration_select ON identity.organization_registrations;
infrastructure/migrations\069_organization_registrations.sql:119:CREATE POLICY org_registration_select ON identity.organization_registrations FOR SELECT USING (
infrastructure/migrations\069_organization_registrations.sql-120-  identity.is_platform_admin()
infrastructure/migrations\069_organization_registrations.sql-121-  OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\069_organization_registrations.sql-122-      AND organization_id = identity.current_organization_id())
infrastructure/migrations\069_organization_registrations.sql-123-);
infrastructure/migrations\069_organization_registrations.sql-124-
infrastructure/migrations\069_organization_registrations.sql-125--- ── INSERT: ONLY THROUGH A REGISTRATION FUNCTION ───────────────────────────
infrastructure/migrations\069_organization_registrations.sql:126:-- 🔴 `identity.in_registration_bootstrap()`, NOT the raw `app.bootstrap`
infrastructure/migrations\069_organization_registrations.sql-127--- setting. `set_config` is NOT a privileged operation — any application
infrastructure/migrations\069_organization_registrations.sql-128--- connection can set that flag — so a policy reading it directly is a door with
infrastructure/migrations\069_organization_registrations.sql-129--- the key taped to it. That is the hole 038 exists to close and the one the
infrastructure/migrations\069_organization_registrations.sql-130--- first draft of 061 reopened. The owner-identity half cannot be forged from an
infrastructure/migrations\069_organization_registrations.sql-131--- application connection.
--
infrastructure/migrations\069_organization_registrations.sql-133--- There is deliberately NO admin INSERT arm. An administrator who wants to
infrastructure/migrations\069_organization_registrations.sql-134--- onboard a business uses the existing organisation and membership services;
infrastructure/migrations\069_organization_registrations.sql-135--- this queue is for SELF-registration, and a hand-written row here would
infrastructure/migrations\069_organization_registrations.sql-136--- describe a sign-up that never happened.
infrastructure/migrations\069_organization_registrations.sql-137-DROP POLICY IF EXISTS org_registration_insert ON identity.organization_registrations;
infrastructure/migrations\069_organization_registrations.sql:138:CREATE POLICY org_registration_insert ON identity.organization_registrations FOR INSERT WITH CHECK (
infrastructure/migrations\069_organization_registrations.sql-139-  identity.in_registration_bootstrap()
infrastructure/migrations\069_organization_registrations.sql-140-);
infrastructure/migrations\069_organization_registrations.sql-141-
infrastructure/migrations\069_organization_registrations.sql-142--- ── UPDATE: THE DECISION, AND ONLY A PLATFORM ADMIN MAKES IT ───────────────
infrastructure/migrations\069_organization_registrations.sql-143--- 🔴 THE REGISTRANT MUST NOT BE ABLE TO APPROVE THEMSELVES. That is the entire
--
infrastructure/migrations\069_organization_registrations.sql-145--- `USING` decides which rows are visible to update, `WITH CHECK` decides what
infrastructure/migrations\069_organization_registrations.sql-146--- they may become, and Postgres does NOT reuse one for the other on UPDATE.
infrastructure/migrations\069_organization_registrations.sql-147--- Omitting the second would let a row be updated INTO a shape the first would
infrastructure/migrations\069_organization_registrations.sql-148--- never have selected.
infrastructure/migrations\069_organization_registrations.sql-149-DROP POLICY IF EXISTS org_registration_update ON identity.organization_registrations;
infrastructure/migrations\069_organization_registrations.sql:150:CREATE POLICY org_registration_update ON identity.organization_registrations FOR UPDATE
infrastructure/migrations\069_organization_registrations.sql-151-  USING (identity.is_platform_admin())
infrastructure/migrations\069_organization_registrations.sql-152-  WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\069_organization_registrations.sql-153-
infrastructure/migrations\069_organization_registrations.sql-154-COMMENT ON TABLE identity.organization_registrations IS
infrastructure/migrations\069_organization_registrations.sql-155-'The verification queue for SELF-registered workshops and parts suppliers. A '
--
infrastructure/migrations\069_organization_registrations.sql-210-
infrastructure/migrations\069_organization_registrations.sql-211-    IF v_user IS NULL THEN
infrastructure/migrations\069_organization_registrations.sql-212-        RAISE EXCEPTION 'no active application user for this identity';
infrastructure/migrations\069_organization_registrations.sql-213-    END IF;
infrastructure/migrations\069_organization_registrations.sql-214-
infrastructure/migrations\069_organization_registrations.sql:215:    PERFORM set_config('app.bootstrap',      'on',          true);
infrastructure/migrations\069_organization_registrations.sql:216:    PERFORM set_config('app.bootstrap_user', v_user::text,  true);
infrastructure/migrations\069_organization_registrations.sql-217-
infrastructure/migrations\069_organization_registrations.sql-218-    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\069_organization_registrations.sql-219-                WHERE user_id = v_user AND status = 'active') THEN
infrastructure/migrations\069_organization_registrations.sql:220:        PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\069_organization_registrations.sql:221:        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\069_organization_registrations.sql-222-        RAISE EXCEPTION 'this account already belongs to an organisation';
infrastructure/migrations\069_organization_registrations.sql-223-    END IF;
infrastructure/migrations\069_organization_registrations.sql-224-
infrastructure/migrations\069_organization_registrations.sql-225-    v_slug := regexp_replace(lower(btrim(p_workshop_name)), '[^a-z0-9]+', '-', 'g');
infrastructure/migrations\069_organization_registrations.sql-226-    v_slug := btrim(v_slug, '-');
--
infrastructure/migrations\069_organization_registrations.sql-256-    -- exist — or be lost, leaving a workshop nobody is ever asked to verify.
infrastructure/migrations\069_organization_registrations.sql-257-    INSERT INTO identity.organization_registrations
infrastructure/migrations\069_organization_registrations.sql-258-        (tenant_id, organization_id, kind, status, submitted_by)
infrastructure/migrations\069_organization_registrations.sql-259-    VALUES (v_tenant, v_org, 'workshop', 'pending', v_user);
infrastructure/migrations\069_organization_registrations.sql-260-
infrastructure/migrations\069_organization_registrations.sql:261:    PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\069_organization_registrations.sql:262:    PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\069_organization_registrations.sql-263-
infrastructure/migrations\069_organization_registrations.sql-264-    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
infrastructure/migrations\069_organization_registrations.sql-265-END;
infrastructure/migrations\069_organization_registrations.sql-266-$$;
infrastructure/migrations\069_organization_registrations.sql-267-
--
infrastructure/migrations\069_organization_registrations.sql-299-
infrastructure/migrations\069_organization_registrations.sql-300-    IF v_user IS NULL THEN
infrastructure/migrations\069_organization_registrations.sql-301-        RAISE EXCEPTION 'no active application user for this identity';
infrastructure/migrations\069_organization_registrations.sql-302-    END IF;
infrastructure/migrations\069_organization_registrations.sql-303-
infrastructure/migrations\069_organization_registrations.sql:304:    PERFORM set_config('app.bootstrap',      'on',         true);
infrastructure/migrations\069_organization_registrations.sql:305:    PERFORM set_config('app.bootstrap_user', v_user::text, true);
infrastructure/migrations\069_organization_registrations.sql-306-
infrastructure/migrations\069_organization_registrations.sql-307-    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\069_organization_registrations.sql-308-                WHERE user_id = v_user AND status = 'active') THEN
infrastructure/migrations\069_organization_registrations.sql:309:        PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\069_organization_registrations.sql:310:        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\069_organization_registrations.sql-311-        RAISE EXCEPTION 'this account already belongs to an organisation. Sign in with a different account to register a supplier, 
or ask a platform administrator to add you to an existing supplier.';
infrastructure/migrations\069_organization_registrations.sql-312-    END IF;
infrastructure/migrations\069_organization_registrations.sql-313-
infrastructure/migrations\069_organization_registrations.sql-314-    v_slug := regexp_replace(lower(btrim(p_supplier_name)), '[^a-z0-9]+', '-', 'g');
infrastructure/migrations\069_organization_registrations.sql-315-    v_slug := btrim(v_slug, '-');
--
infrastructure/migrations\069_organization_registrations.sql-341-    -- ── THE ONLY CHANGE FROM 068 ───────────────────────────────────────────
infrastructure/migrations\069_organization_registrations.sql-342-    INSERT INTO identity.organization_registrations
infrastructure/migrations\069_organization_registrations.sql-343-        (tenant_id, organization_id, kind, status, submitted_by)
infrastructure/migrations\069_organization_registrations.sql-344-    VALUES (v_tenant, v_org, 'supplier', 'pending', v_user);
infrastructure/migrations\069_organization_registrations.sql-345-
infrastructure/migrations\069_organization_registrations.sql:346:    PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\069_organization_registrations.sql:347:    PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\069_organization_registrations.sql-348-
infrastructure/migrations\069_organization_registrations.sql-349-    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
infrastructure/migrations\069_organization_registrations.sql-350-END;
infrastructure/migrations\069_organization_registrations.sql-351-$$;
infrastructure/migrations\069_organization_registrations.sql-352-
--
infrastructure/migrations\030_quality_control.sql-267--- the app connects as — isolation present and inert.
infrastructure/migrations\030_quality_control.sql-268-ALTER TABLE repair.quality_inspections ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\030_quality_control.sql-269-ALTER TABLE repair.quality_inspections FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\030_quality_control.sql-270-
infrastructure/migrations\030_quality_control.sql-271-DROP POLICY IF EXISTS tenant_isolation ON repair.quality_inspections;
infrastructure/migrations\030_quality_control.sql:272:CREATE POLICY tenant_isolation ON repair.quality_inspections
infrastructure/migrations\030_quality_control.sql-273-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\030_quality_control.sql-274-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\030_quality_control.sql-275-
infrastructure/migrations\030_quality_control.sql-276--- ── grants ──────────────────────────────────────────────────────────────────
infrastructure/migrations\030_quality_control.sql-277---
--
infrastructure/migrations\068_supplier_registration.sql-62---      `resolveTenantContext`'s precedence at every login, and the role
infrastructure/migrations\068_supplier_registration.sql-63---      switcher would offer a role the product never meant them to hold. Same
infrastructure/migrations\068_supplier_registration.sql-64---      rule `register_workshop` enforces, and it also makes a double-submitted
infrastructure/migrations\068_supplier_registration.sql-65---      form a refusal rather than a second silent tenant.
infrastructure/migrations\068_supplier_registration.sql-66---   5. THE RLS DOOR IS `in_registration_bootstrap()`, NOT the raw
infrastructure/migrations\068_supplier_registration.sql:67:--      `app.bootstrap` setting. 🔴 `set_config` IS NOT PRIVILEGED — any
infrastructure/migrations\068_supplier_registration.sql-68---      application connection can set that flag — so reading it directly is the
infrastructure/migrations\068_supplier_registration.sql-69---      hole migration 038 exists to close, and the first draft of 061 reopened
infrastructure/migrations\068_supplier_registration.sql-70---      it by doing exactly that. The owner-identity half is the part that
infrastructure/migrations\068_supplier_registration.sql-71---      cannot be forged.
infrastructure/migrations\068_supplier_registration.sql-72---
--
infrastructure/migrations\068_supplier_registration.sql-128-
infrastructure/migrations\068_supplier_registration.sql-129-    -- ── the door opens here, and only here ─────────────────────────────────
infrastructure/migrations\068_supplier_registration.sql-130-    -- Transaction-local, so a pooled connection cannot carry the flag into the
infrastructure/migrations\068_supplier_registration.sql-131-    -- next request even on an abort. Cleared explicitly as well, because the
infrastructure/migrations\068_supplier_registration.sql-132-    -- SUCCESS path leaves the caller's transaction open.
infrastructure/migrations\068_supplier_registration.sql:133:    PERFORM set_config('app.bootstrap',      'on',         true);
infrastructure/migrations\068_supplier_registration.sql:134:    PERFORM set_config('app.bootstrap_user', v_user::text, true);
infrastructure/migrations\068_supplier_registration.sql-135-
infrastructure/migrations\068_supplier_registration.sql-136-    -- CONSTRAINT 4 — one organisation per person. AFTER the flag is set: under
infrastructure/migrations\068_supplier_registration.sql-137-    -- FORCE RLS with no tenant context this read returns zero rows for
infrastructure/migrations\068_supplier_registration.sql-138-    -- everybody, so placing it earlier would make it a check that cannot fire.
infrastructure/migrations\068_supplier_registration.sql-139-    -- That is precisely the bug migration 037 fixed in `register_workshop`.
infrastructure/migrations\068_supplier_registration.sql-140-    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\068_supplier_registration.sql-141-                WHERE user_id = v_user AND status = 'active') THEN
infrastructure/migrations\068_supplier_registration.sql:142:        PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\068_supplier_registration.sql:143:        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\068_supplier_registration.sql-144-        -- ⚠️ THE MESSAGE NAMES A REACHABLE ALTERNATIVE. "Every refusal must name
infrastructure/migrations\068_supplier_registration.sql-145-        -- a reachable alternative" is this repository's most expensive
infrastructure/migrations\068_supplier_registration.sql-146-        -- recurring defect — a rule with no way past it is a wall, and the
infrastructure/migrations\068_supplier_registration.sql-147-        -- person in front of it files a bug instead of acting.
infrastructure/migrations\068_supplier_registration.sql-148-        RAISE EXCEPTION 'this account already belongs to an organisation. Sign in with a different account to register a supplier, or 
ask a platform administrator to add you to an existing supplier.';
--
infrastructure/migrations\068_supplier_registration.sql-188-    INSERT INTO identity.memberships
infrastructure/migrations\068_supplier_registration.sql-189-        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure/migrations\068_supplier_registration.sql-190-    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'supplier_owner', 'active', v_user);
infrastructure/migrations\068_supplier_registration.sql-191-
infrastructure/migrations\068_supplier_registration.sql-192-    -- ── and the door closes ────────────────────────────────────────────────
infrastructure/migrations\068_supplier_registration.sql:193:    PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\068_supplier_registration.sql:194:    PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\068_supplier_registration.sql-195-
infrastructure/migrations\068_supplier_registration.sql-196-    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
infrastructure/migrations\068_supplier_registration.sql-197-END;
infrastructure/migrations\068_supplier_registration.sql-198-$$;
infrastructure/migrations\068_supplier_registration.sql-199-
--
infrastructure/migrations\060_notifications.sql-134-    ON comms.notifications (organization_id, event_key, created_at DESC);
infrastructure/migrations\060_notifications.sql-135-
infrastructure/migrations\060_notifications.sql-136-ALTER TABLE comms.notifications ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\060_notifications.sql-137--- FORCE: the app connects as the table owner on Render, and an un-FORCEd
infrastructure/migrations\060_notifications.sql-138--- policy is inert for the owner.
infrastructure/migrations\060_notifications.sql:139:ALTER TABLE comms.notifications FORCE ROW LEVEL SECURITY;
infrastructure/migrations\060_notifications.sql-140-
infrastructure/migrations\060_notifications.sql-141--- ── SELECT: THE RECIPIENT, AND NOBODY ELSE ────────────────────────────────
infrastructure/migrations\060_notifications.sql-142---
infrastructure/migrations\060_notifications.sql-143--- Deliberately NOT "anyone in the organisation". A notification carries the
infrastructure/migrations\060_notifications.sql-144--- subject and body of a message addressed to one person — a customer's repair
--
infrastructure/migrations\060_notifications.sql-150---
infrastructure/migrations\060_notifications.sql-151--- The first version said "the DRAIN does not read through this policy: it runs
infrastructure/migrations\060_notifications.sql-152--- as a definer function". That is wrong twice. A SECURITY DEFINER function runs
infrastructure/migrations\060_notifications.sql-153--- as the function's OWNER, and the owner of this table is `autoworkshop`, which
infrastructure/migrations\060_notifications.sql-154--- ON RENDER IS NOT A SUPERUSER (migration 037's header records exactly this) —
infrastructure/migrations\060_notifications.sql:155:-- and the table is FORCE ROW LEVEL SECURITY, which is precisely the setting
infrastructure/migrations\060_notifications.sql-156--- that stops the owner being exempt. So the drain DOES read through this
infrastructure/migrations\060_notifications.sql-157--- policy, with no `app.user_id` set, and both disjuncts above are false.
infrastructure/migrations\060_notifications.sql-158---
infrastructure/migrations\060_notifications.sql-159--- MEASURED, not reasoned: as `autoworkshop_app` with no user context this table
infrastructure/migrations\060_notifications.sql-160--- returned 0 rows — and still 0 with `app.notify=on`, because the flag was on
--
infrastructure/migrations\060_notifications.sql-167---
infrastructure/migrations\060_notifications.sql-168--- Found by the Supervisor. It passed locally for the one reason this repository
infrastructure/migrations\060_notifications.sql-169--- has been burned by more than any other: the local role is a superuser and
infrastructure/migrations\060_notifications.sql-170--- bypasses RLS entirely.
infrastructure/migrations\060_notifications.sql-171-DROP POLICY IF EXISTS notification_select ON comms.notifications;
infrastructure/migrations\060_notifications.sql:172:CREATE POLICY notification_select ON comms.notifications FOR SELECT USING (
infrastructure/migrations\060_notifications.sql-173-  identity.is_platform_admin()
infrastructure/migrations\060_notifications.sql-174-  OR recipient_id = identity.current_user_id()
infrastructure/migrations\060_notifications.sql-175-  -- The drain's door, open only inside a transaction one of the definer
infrastructure/migrations\060_notifications.sql-176-  -- functions below has opened.
infrastructure/migrations\060_notifications.sql-177-  OR current_setting('app.notify', true) = 'on'
--
infrastructure/migrations\060_notifications.sql-181---
infrastructure/migrations\060_notifications.sql-182--- See the header. `app.notify` is set by `comms.enqueue_notification` for the
infrastructure/migrations\060_notifications.sql-183--- duration of one transaction and by nothing else, so a direct INSERT from the
infrastructure/migrations\060_notifications.sql-184--- app role is refused even though the app role holds the grant.
infrastructure/migrations\060_notifications.sql-185-DROP POLICY IF EXISTS notification_insert ON comms.notifications;
infrastructure/migrations\060_notifications.sql:186:CREATE POLICY notification_insert ON comms.notifications FOR INSERT WITH CHECK (
infrastructure/migrations\060_notifications.sql-187-  identity.is_platform_admin()
infrastructure/migrations\060_notifications.sql-188-  OR current_setting('app.notify', true) = 'on'
infrastructure/migrations\060_notifications.sql-189-);
infrastructure/migrations\060_notifications.sql-190-
infrastructure/migrations\060_notifications.sql-191--- ── UPDATE: the recipient marks it READ; the sender marks it SENT ─────────
infrastructure/migrations\060_notifications.sql-192---
infrastructure/migrations\060_notifications.sql-193--- Two different writers with two different rights, so the WITH CHECK is not a
infrastructure/migrations\060_notifications.sql-194--- copy of the USING clause. A recipient may touch their own row (to read it);
infrastructure/migrations\060_notifications.sql-195--- delivery bookkeeping happens through the definer function, under `app.notify`.
infrastructure/migrations\060_notifications.sql-196-DROP POLICY IF EXISTS notification_update ON comms.notifications;
infrastructure/migrations\060_notifications.sql:197:CREATE POLICY notification_update ON comms.notifications FOR UPDATE USING (
infrastructure/migrations\060_notifications.sql-198-  identity.is_platform_admin()
infrastructure/migrations\060_notifications.sql-199-  OR recipient_id = identity.current_user_id()
infrastructure/migrations\060_notifications.sql-200-  OR current_setting('app.notify', true) = 'on'
infrastructure/migrations\060_notifications.sql-201-) WITH CHECK (
infrastructure/migrations\060_notifications.sql-202-  identity.is_platform_admin()
--
infrastructure/migrations\067_settings_org_select_excludes_customer.sql-95-        'core.workflow_rules',
infrastructure/migrations\067_settings_org_select_excludes_customer.sql-96-        'core.integrations'
infrastructure/migrations\067_settings_org_select_excludes_customer.sql-97-    ] LOOP
infrastructure/migrations\067_settings_org_select_excludes_customer.sql-98-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_select', t);
infrastructure/migrations\067_settings_org_select_excludes_customer.sql-99-        EXECUTE format(
infrastructure/migrations\067_settings_org_select_excludes_customer.sql:100:            'CREATE POLICY %I ON %s FOR SELECT USING '
infrastructure/migrations\067_settings_org_select_excludes_customer.sql-101-            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\067_settings_org_select_excludes_customer.sql-102-            'AND organization_id = identity.current_organization_id() '
infrastructure/migrations\067_settings_org_select_excludes_customer.sql-103-            -- ── THE ONLY DIFFERENCE FROM 045 ────────────────────────────
infrastructure/migrations\067_settings_org_select_excludes_customer.sql-104-            -- Same clause, same spelling, as 062's `supplier_request_select`
infrastructure/migrations\067_settings_org_select_excludes_customer.sql-105-            -- and 066's two. Spelled identically on purpose: a grep for
--
infrastructure/migrations\067_settings_org_select_excludes_customer.sql-112-END $$;
infrastructure/migrations\067_settings_org_select_excludes_customer.sql-113-
infrastructure/migrations\067_settings_org_select_excludes_customer.sql-114--- ── PROVE IT IN THE MIGRATION, NOT ONLY IN A TEST ──────────────────────────
infrastructure/migrations\067_settings_org_select_excludes_customer.sql-115---
infrastructure/migrations\067_settings_org_select_excludes_customer.sql-116--- 🔴 A POLICY THAT DID NOT TAKE EFFECT LOOKS EXACTLY LIKE ONE THAT DID.
infrastructure/migrations\067_settings_org_select_excludes_customer.sql:117:-- `CREATE POLICY` reports success for a predicate that never matches what the
infrastructure/migrations\067_settings_org_select_excludes_customer.sql-118--- application actually sends, and this repository has been bitten by precisely
infrastructure/migrations\067_settings_org_select_excludes_customer.sql-119--- that shape twice in a week (061's `ON CONFLICT` ambiguity reported success at
infrastructure/migrations\067_settings_org_select_excludes_customer.sql-120--- CREATE time and failed at RUNTIME; the first 061 draft read the raw
infrastructure/migrations\067_settings_org_select_excludes_customer.sql:121:-- `app.bootstrap` setting and silently reopened 038's hole). So the migration
infrastructure/migrations\067_settings_org_select_excludes_customer.sql-122--- asserts its own effect before committing: every one of the five must now
infrastructure/migrations\067_settings_org_select_excludes_customer.sql-123--- carry the clause, or this transaction aborts and nothing is applied.
infrastructure/migrations\067_settings_org_select_excludes_customer.sql-124-DO $$
infrastructure/migrations\067_settings_org_select_excludes_customer.sql-125-DECLARE
infrastructure/migrations\067_settings_org_select_excludes_customer.sql-126-    missing text;
--
infrastructure/migrations\059_supplier_requests.sql-130-    ON parts.supplier_requests (tenant_id);
infrastructure/migrations\059_supplier_requests.sql-131-
infrastructure/migrations\059_supplier_requests.sql-132-ALTER TABLE parts.supplier_requests ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\059_supplier_requests.sql-133--- FORCE: the app connects as the table owner on Render, and an un-FORCEd policy
infrastructure/migrations\059_supplier_requests.sql-134--- is inert for the owner.
infrastructure/migrations\059_supplier_requests.sql:135:ALTER TABLE parts.supplier_requests FORCE ROW LEVEL SECURITY;
infrastructure/migrations\059_supplier_requests.sql-136-
infrastructure/migrations\059_supplier_requests.sql-137-/*
infrastructure/migrations\059_supplier_requests.sql-138- * Is the caller a user of this supplier?
infrastructure/migrations\059_supplier_requests.sql-139- *
infrastructure/migrations\059_supplier_requests.sql-140- * SECURITY DEFINER because the policy must read `catalogue.supplier_users`,
--
infrastructure/migrations\059_supplier_requests.sql-166--- Two parties, one row, and neither may read the other's rows. The supplier arm
infrastructure/migrations\059_supplier_requests.sql-167--- is a MEMBERSHIP test, not an organisation one, because a supplier is not an
infrastructure/migrations\059_supplier_requests.sql-168--- organisation in this schema at all — `catalogue.suppliers` is platform-wide,
infrastructure/migrations\059_supplier_requests.sql-169--- which is what makes the directory a marketplace.
infrastructure/migrations\059_supplier_requests.sql-170-DROP POLICY IF EXISTS supplier_request_select ON parts.supplier_requests;
infrastructure/migrations\059_supplier_requests.sql:171:CREATE POLICY supplier_request_select ON parts.supplier_requests FOR SELECT USING (
infrastructure/migrations\059_supplier_requests.sql-172-  identity.is_platform_admin()
infrastructure/migrations\059_supplier_requests.sql-173-  OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\059_supplier_requests.sql-174-      AND organization_id = identity.current_organization_id())
infrastructure/migrations\059_supplier_requests.sql-175-  OR parts.current_user_supplies(supplier_id)
infrastructure/migrations\059_supplier_requests.sql-176-);
--
infrastructure/migrations\059_supplier_requests.sql-178--- ── INSERT: the asking workshop only, and only as `new` ────────────────────
infrastructure/migrations\059_supplier_requests.sql-179---
infrastructure/migrations\059_supplier_requests.sql-180--- A supplier cannot raise a request against itself, and nobody can file one
infrastructure/migrations\059_supplier_requests.sql-181--- pre-quoted or pre-accepted.
infrastructure/migrations\059_supplier_requests.sql-182-DROP POLICY IF EXISTS supplier_request_insert ON parts.supplier_requests;
infrastructure/migrations\059_supplier_requests.sql:183:CREATE POLICY supplier_request_insert ON parts.supplier_requests FOR INSERT WITH CHECK (
infrastructure/migrations\059_supplier_requests.sql-184-  identity.is_platform_admin()
infrastructure/migrations\059_supplier_requests.sql-185-  OR (requested_by = identity.current_user_id()
infrastructure/migrations\059_supplier_requests.sql-186-      AND tenant_id = identity.current_tenant_id()
infrastructure/migrations\059_supplier_requests.sql-187-      AND organization_id = identity.current_organization_id()
infrastructure/migrations\059_supplier_requests.sql-188-      AND identity.current_role_name() <> 'customer'
--
infrastructure/migrations\059_supplier_requests.sql-195--- WHO may write the row, and `SupplierRequestService` says WHAT each side may
infrastructure/migrations\059_supplier_requests.sql-196--- change: the supplier quotes or declines, the workshop accepts or cancels.
infrastructure/migrations\059_supplier_requests.sql-197--- Stating that here so the next reader does not mistake this policy for the
infrastructure/migrations\059_supplier_requests.sql-198--- whole rule — CLAUDE.md §8, and the reason the service checks too.
infrastructure/migrations\059_supplier_requests.sql-199-DROP POLICY IF EXISTS supplier_request_update ON parts.supplier_requests;
infrastructure/migrations\059_supplier_requests.sql:200:CREATE POLICY supplier_request_update ON parts.supplier_requests FOR UPDATE USING (
infrastructure/migrations\059_supplier_requests.sql-201-  identity.is_platform_admin()
infrastructure/migrations\059_supplier_requests.sql-202-  OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\059_supplier_requests.sql-203-      AND organization_id = identity.current_organization_id()
infrastructure/migrations\059_supplier_requests.sql-204-      AND identity.current_role_name() <> 'customer')
infrastructure/migrations\059_supplier_requests.sql-205-  OR parts.current_user_supplies(supplier_id)
--
infrastructure/migrations\066_settings_reads_exclude_customer.sql-75--- replaced, and only their organisation arm differs from 045.
infrastructure/migrations\066_settings_reads_exclude_customer.sql-76-
infrastructure/migrations\066_settings_reads_exclude_customer.sql-77-BEGIN;
infrastructure/migrations\066_settings_reads_exclude_customer.sql-78-
infrastructure/migrations\066_settings_reads_exclude_customer.sql-79-DROP POLICY IF EXISTS org_select ON core.service_categories;
infrastructure/migrations\066_settings_reads_exclude_customer.sql:80:CREATE POLICY org_select ON core.service_categories FOR SELECT USING (
infrastructure/migrations\066_settings_reads_exclude_customer.sql-81-  identity.is_platform_admin()
infrastructure/migrations\066_settings_reads_exclude_customer.sql-82-  OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\066_settings_reads_exclude_customer.sql-83-      AND organization_id = identity.current_organization_id()
infrastructure/migrations\066_settings_reads_exclude_customer.sql-84-      -- ── THE ONLY DIFFERENCE FROM 045 ────────────────────────────────────
infrastructure/migrations\066_settings_reads_exclude_customer.sql-85-      -- A customer of this workshop is inside this organisation and must not
--
infrastructure/migrations\066_settings_reads_exclude_customer.sql-87-      -- same spelling, as `supplier_request_select` in 062.
infrastructure/migrations\066_settings_reads_exclude_customer.sql-88-      AND identity.current_role_name() <> 'customer')
infrastructure/migrations\066_settings_reads_exclude_customer.sql-89-);
infrastructure/migrations\066_settings_reads_exclude_customer.sql-90-
infrastructure/migrations\066_settings_reads_exclude_customer.sql-91-DROP POLICY IF EXISTS org_select ON core.opening_hours;
infrastructure/migrations\066_settings_reads_exclude_customer.sql:92:CREATE POLICY org_select ON core.opening_hours FOR SELECT USING (
infrastructure/migrations\066_settings_reads_exclude_customer.sql-93-  identity.is_platform_admin()
infrastructure/migrations\066_settings_reads_exclude_customer.sql-94-  OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\066_settings_reads_exclude_customer.sql-95-      AND organization_id = identity.current_organization_id()
infrastructure/migrations\066_settings_reads_exclude_customer.sql-96-      -- As above. Draft opening hours are a rota the workshop has not agreed
infrastructure/migrations\066_settings_reads_exclude_customer.sql-97-      -- to publish; the published ones remain readable through `public_read`.
--
infrastructure/migrations\058_service_requests.sql-126-
infrastructure/migrations\058_service_requests.sql-127-ALTER TABLE reception.service_requests ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\058_service_requests.sql-128--- FORCE, because the app connects as the table owner on Render and an
infrastructure/migrations\058_service_requests.sql-129--- un-FORCEd policy is inert for the owner — the defect that made every
infrastructure/migrations\058_service_requests.sql-130--- enterprise policy in the Solar schema decorative for weeks.
infrastructure/migrations\058_service_requests.sql:131:ALTER TABLE reception.service_requests FORCE ROW LEVEL SECURITY;
infrastructure/migrations\058_service_requests.sql-132-
infrastructure/migrations\058_service_requests.sql-133--- ── SELECT: the workshop it was sent to, OR the customer who sent it ───────
infrastructure/migrations\058_service_requests.sql-134---
infrastructure/migrations\058_service_requests.sql-135--- Two audiences, one row, and neither may see the other's. A customer must
infrastructure/migrations\058_service_requests.sql-136--- never read another customer's request even at the same workshop, which is why
infrastructure/migrations\058_service_requests.sql-137--- the author branch is `requested_by = current_user_id()` and NOT merely
infrastructure/migrations\058_service_requests.sql-138--- "belongs to my organisation" — a customer IS a member of the workshop's org,
infrastructure/migrations\058_service_requests.sql-139--- so an org-only predicate would show them the workshop's entire inbox. That is
infrastructure/migrations\058_service_requests.sql-140--- the exact shape of the 45-screen leak, one layer down.
infrastructure/migrations\058_service_requests.sql-141-DROP POLICY IF EXISTS service_request_select ON reception.service_requests;
infrastructure/migrations\058_service_requests.sql:142:CREATE POLICY service_request_select ON reception.service_requests FOR SELECT USING (
infrastructure/migrations\058_service_requests.sql-143-  identity.is_platform_admin()
infrastructure/migrations\058_service_requests.sql-144-  OR requested_by = identity.current_user_id()
infrastructure/migrations\058_service_requests.sql-145-  OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\058_service_requests.sql-146-      AND organization_id = identity.current_organization_id()
infrastructure/migrations\058_service_requests.sql-147-      AND identity.current_role_name() <> 'customer')
--
infrastructure/migrations\058_service_requests.sql-152--- `requested_by` is pinned to the caller. The organisation is deliberately NOT
infrastructure/migrations\058_service_requests.sql-153--- constrained to the caller's own — see the header. `tenant_id` still is,
infrastructure/migrations\058_service_requests.sql-154--- because the workshop and the request must sit in one tenant for every
infrastructure/migrations\058_service_requests.sql-155--- downstream join to hold.
infrastructure/migrations\058_service_requests.sql-156-DROP POLICY IF EXISTS service_request_insert ON reception.service_requests;
infrastructure/migrations\058_service_requests.sql:157:CREATE POLICY service_request_insert ON reception.service_requests FOR INSERT WITH CHECK (
infrastructure/migrations\058_service_requests.sql-158-  identity.is_platform_admin()
infrastructure/migrations\058_service_requests.sql-159-  OR (requested_by = identity.current_user_id()
infrastructure/migrations\058_service_requests.sql-160-      AND tenant_id = identity.current_tenant_id()
infrastructure/migrations\058_service_requests.sql-161-      AND status = 'new')
infrastructure/migrations\058_service_requests.sql-162-);
--
infrastructure/migrations\058_service_requests.sql-165---
infrastructure/migrations\058_service_requests.sql-166--- A customer may not accept their own request, and `<> 'customer'` is what says
infrastructure/migrations\058_service_requests.sql-167--- so. Without it a customer holding a membership in the workshop's org could
infrastructure/migrations\058_service_requests.sql-168--- mark their own request `converted`.
infrastructure/migrations\058_service_requests.sql-169-DROP POLICY IF EXISTS service_request_update ON reception.service_requests;
infrastructure/migrations\058_service_requests.sql:170:CREATE POLICY service_request_update ON reception.service_requests FOR UPDATE USING (
infrastructure/migrations\058_service_requests.sql-171-  identity.is_platform_admin()
infrastructure/migrations\058_service_requests.sql-172-  OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\058_service_requests.sql-173-      AND organization_id = identity.current_organization_id()
infrastructure/migrations\058_service_requests.sql-174-      AND identity.current_role_name() <> 'customer')
infrastructure/migrations\058_service_requests.sql-175-) WITH CHECK (
--
infrastructure/migrations\057_learning_and_diagnostic_trees.sql-192-        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
infrastructure/migrations\057_learning_and_diagnostic_trees.sql-193-        EXECUTE format('ALTER TABLE %s FORCE  ROW LEVEL SECURITY', t);
infrastructure/migrations\057_learning_and_diagnostic_trees.sql-194-
infrastructure/migrations\057_learning_and_diagnostic_trees.sql-195-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_select', t);
infrastructure/migrations\057_learning_and_diagnostic_trees.sql-196-        EXECUTE format(
infrastructure/migrations\057_learning_and_diagnostic_trees.sql:197:            'CREATE POLICY %I ON %s FOR SELECT USING '
infrastructure/migrations\057_learning_and_diagnostic_trees.sql-198-            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\057_learning_and_diagnostic_trees.sql-199-            'AND organization_id = identity.current_organization_id()))', 'org_select', t);
infrastructure/migrations\057_learning_and_diagnostic_trees.sql-200-
infrastructure/migrations\057_learning_and_diagnostic_trees.sql-201-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_insert', t);
infrastructure/migrations\057_learning_and_diagnostic_trees.sql-202-        EXECUTE format(
infrastructure/migrations\057_learning_and_diagnostic_trees.sql:203:            'CREATE POLICY %I ON %s FOR INSERT WITH CHECK '
infrastructure/migrations\057_learning_and_diagnostic_trees.sql-204-            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\057_learning_and_diagnostic_trees.sql-205-            'AND organization_id = identity.current_organization_id()))', 'org_insert', t);
infrastructure/migrations\057_learning_and_diagnostic_trees.sql-206-
infrastructure/migrations\057_learning_and_diagnostic_trees.sql-207-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_update', t);
infrastructure/migrations\057_learning_and_diagnostic_trees.sql-208-        EXECUTE format(
infrastructure/migrations\057_learning_and_diagnostic_trees.sql:209:            'CREATE POLICY %I ON %s FOR UPDATE USING '
infrastructure/migrations\057_learning_and_diagnostic_trees.sql-210-            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\057_learning_and_diagnostic_trees.sql-211-            'AND organization_id = identity.current_organization_id())) WITH CHECK '
infrastructure/migrations\057_learning_and_diagnostic_trees.sql-212-            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
infrastructure/migrations\057_learning_and_diagnostic_trees.sql-213-            'AND organization_id = identity.current_organization_id()))', 'org_update', t);
infrastructure/migrations\057_learning_and_diagnostic_trees.sql-214-
--
infrastructure/migrations\064_agent_proposals_and_leads.sql-135-CREATE UNIQUE INDEX IF NOT EXISTS uq_proposal_open_per_resource
infrastructure/migrations\064_agent_proposals_and_leads.sql-136-    ON agents.proposals (agent_name, resource_type, resource_id)
infrastructure/migrations\064_agent_proposals_and_leads.sql-137-    WHERE status IN ('proposed','awaiting-approval') AND resource_id IS NOT NULL;
infrastructure/migrations\064_agent_proposals_and_leads.sql-138-
infrastructure/migrations\064_agent_proposals_and_leads.sql-139-ALTER TABLE agents.proposals ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\064_agent_proposals_and_leads.sql:140:ALTER TABLE agents.proposals FORCE ROW LEVEL SECURITY;
infrastructure/migrations\064_agent_proposals_and_leads.sql-141-GRANT SELECT, INSERT, UPDATE ON agents.proposals TO autoworkshop_app;
infrastructure/migrations\064_agent_proposals_and_leads.sql-142--- No DELETE grant. `rejected` is how a proposal goes away, so the record of
infrastructure/migrations\064_agent_proposals_and_leads.sql-143--- what an agent suggested and what a human did about it survives.
infrastructure/migrations\064_agent_proposals_and_leads.sql-144-
infrastructure/migrations\064_agent_proposals_and_leads.sql-145--- ── SELECT: the workshop's own staff. NOT its customers. ──────────────────
--
infrastructure/migrations\064_agent_proposals_and_leads.sql-150--- migration 061 made the customer role SELF-SERVICE, "a customer" now means
infrastructure/migrations\064_agent_proposals_and_leads.sql-151--- "any signed-up stranger who enrolled at a published workshop" — so a missing
infrastructure/migrations\064_agent_proposals_and_leads.sql-152--- read clause here would publish the workshop's AI-suggested pricing, staffing
infrastructure/migrations\064_agent_proposals_and_leads.sql-153--- and lead pipeline to the public.
infrastructure/migrations\064_agent_proposals_and_leads.sql-154-DROP POLICY IF EXISTS proposal_select ON agents.proposals;
infrastructure/migrations\064_agent_proposals_and_leads.sql:155:CREATE POLICY proposal_select ON agents.proposals FOR SELECT USING (
infrastructure/migrations\064_agent_proposals_and_leads.sql-156-  identity.is_platform_admin()
infrastructure/migrations\064_agent_proposals_and_leads.sql-157-  OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\064_agent_proposals_and_leads.sql-158-      AND organization_id = identity.current_organization_id()
infrastructure/migrations\064_agent_proposals_and_leads.sql-159-      AND identity.current_role_name() <> 'customer')
infrastructure/migrations\064_agent_proposals_and_leads.sql-160-);
infrastructure/migrations\064_agent_proposals_and_leads.sql-161-
infrastructure/migrations\064_agent_proposals_and_leads.sql-162-DROP POLICY IF EXISTS proposal_insert ON agents.proposals;
infrastructure/migrations\064_agent_proposals_and_leads.sql:163:CREATE POLICY proposal_insert ON agents.proposals FOR INSERT WITH CHECK (
infrastructure/migrations\064_agent_proposals_and_leads.sql-164-  identity.is_platform_admin()
infrastructure/migrations\064_agent_proposals_and_leads.sql-165-  OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\064_agent_proposals_and_leads.sql-166-      AND organization_id = identity.current_organization_id()
infrastructure/migrations\064_agent_proposals_and_leads.sql-167-      -- A proposal always arrives undecided. Nothing may file one pre-approved,
infrastructure/migrations\064_agent_proposals_and_leads.sql-168-      -- which would turn "an agent suggested it" into "a human authorised it"
--
infrastructure/migrations\064_agent_proposals_and_leads.sql-175--- TOUCHES. This policy says WHO may write the row; `AgentProposalService` says
infrastructure/migrations\064_agent_proposals_and_leads.sql-176--- WHAT may change (status, decided_by, decided_at, decision_note and nothing
infrastructure/migrations\064_agent_proposals_and_leads.sql-177--- else). Stated here so the next reader does not mistake this policy for the
infrastructure/migrations\064_agent_proposals_and_leads.sql-178--- whole rule — the same note migration 059 carries, for the same reason.
infrastructure/migrations\064_agent_proposals_and_leads.sql-179-DROP POLICY IF EXISTS proposal_update ON agents.proposals;
infrastructure/migrations\064_agent_proposals_and_leads.sql:180:CREATE POLICY proposal_update ON agents.proposals FOR UPDATE USING (
infrastructure/migrations\064_agent_proposals_and_leads.sql-181-  identity.is_platform_admin()
infrastructure/migrations\064_agent_proposals_and_leads.sql-182-  OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\064_agent_proposals_and_leads.sql-183-      AND organization_id = identity.current_organization_id()
infrastructure/migrations\064_agent_proposals_and_leads.sql-184-      AND identity.current_role_name() <> 'customer')
infrastructure/migrations\064_agent_proposals_and_leads.sql-185-) WITH CHECK (
--
infrastructure/migrations\064_agent_proposals_and_leads.sql-254-CREATE INDEX IF NOT EXISTS idx_leads_tenant      ON crm.leads (tenant_id);
infrastructure/migrations\064_agent_proposals_and_leads.sql-255-CREATE INDEX IF NOT EXISTS idx_leads_org_status  ON crm.leads (organization_id, status);
infrastructure/migrations\064_agent_proposals_and_leads.sql-256-CREATE INDEX IF NOT EXISTS idx_leads_org_created ON crm.leads (organization_id, created_at DESC);
infrastructure/migrations\064_agent_proposals_and_leads.sql-257-
infrastructure/migrations\064_agent_proposals_and_leads.sql-258-ALTER TABLE crm.leads ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\064_agent_proposals_and_leads.sql:259:ALTER TABLE crm.leads FORCE ROW LEVEL SECURITY;
infrastructure/migrations\064_agent_proposals_and_leads.sql-260-GRANT SELECT, INSERT, UPDATE ON crm.leads TO autoworkshop_app;
infrastructure/migrations\064_agent_proposals_and_leads.sql-261-
infrastructure/migrations\064_agent_proposals_and_leads.sql-262--- Staff only, on every command. A customer of the workshop must never read its
infrastructure/migrations\064_agent_proposals_and_leads.sql-263--- sales pipeline — and since migration 061 a customer is any stranger who
infrastructure/migrations\064_agent_proposals_and_leads.sql-264--- enrolled.
infrastructure/migrations\064_agent_proposals_and_leads.sql-265-DROP POLICY IF EXISTS lead_select ON crm.leads;
infrastructure/migrations\064_agent_proposals_and_leads.sql:266:CREATE POLICY lead_select ON crm.leads FOR SELECT USING (
infrastructure/migrations\064_agent_proposals_and_leads.sql-267-  identity.is_platform_admin()
infrastructure/migrations\064_agent_proposals_and_leads.sql-268-  OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\064_agent_proposals_and_leads.sql-269-      AND organization_id = identity.current_organization_id()
infrastructure/migrations\064_agent_proposals_and_leads.sql-270-      AND identity.current_role_name() <> 'customer')
infrastructure/migrations\064_agent_proposals_and_leads.sql-271-);
infrastructure/migrations\064_agent_proposals_and_leads.sql-272-
infrastructure/migrations\064_agent_proposals_and_leads.sql-273-DROP POLICY IF EXISTS lead_insert ON crm.leads;
infrastructure/migrations\064_agent_proposals_and_leads.sql:274:CREATE POLICY lead_insert ON crm.leads FOR INSERT WITH CHECK (
infrastructure/migrations\064_agent_proposals_and_leads.sql-275-  identity.is_platform_admin()
infrastructure/migrations\064_agent_proposals_and_leads.sql-276-  OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\064_agent_proposals_and_leads.sql-277-      AND organization_id = identity.current_organization_id()
infrastructure/migrations\064_agent_proposals_and_leads.sql-278-      AND identity.current_role_name() <> 'customer'
infrastructure/migrations\064_agent_proposals_and_leads.sql-279-      -- A lead is born `new`. Nothing may file one already `contacted`, which
infrastructure/migrations\064_agent_proposals_and_leads.sql-280-      -- would record an outreach that never happened.
infrastructure/migrations\064_agent_proposals_and_leads.sql-281-      AND status = 'new')
infrastructure/migrations\064_agent_proposals_and_leads.sql-282-);
infrastructure/migrations\064_agent_proposals_and_leads.sql-283-
infrastructure/migrations\064_agent_proposals_and_leads.sql-284-DROP POLICY IF EXISTS lead_update ON crm.leads;
infrastructure/migrations\064_agent_proposals_and_leads.sql:285:CREATE POLICY lead_update ON crm.leads FOR UPDATE USING (
infrastructure/migrations\064_agent_proposals_and_leads.sql-286-  identity.is_platform_admin()
infrastructure/migrations\064_agent_proposals_and_leads.sql-287-  OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\064_agent_proposals_and_leads.sql-288-      AND organization_id = identity.current_organization_id()
infrastructure/migrations\064_agent_proposals_and_leads.sql-289-      AND identity.current_role_name() <> 'customer')
infrastructure/migrations\064_agent_proposals_and_leads.sql-290-) WITH CHECK (
--
infrastructure/migrations\056_resource_bookings.sql-150-
infrastructure/migrations\056_resource_bookings.sql-151-ALTER TABLE parts.resource_bookings ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\056_resource_bookings.sql-152-ALTER TABLE parts.resource_bookings FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\056_resource_bookings.sql-153-
infrastructure/migrations\056_resource_bookings.sql-154-DROP POLICY IF EXISTS org_select ON parts.resource_bookings;
infrastructure/migrations\056_resource_bookings.sql:155:CREATE POLICY org_select ON parts.resource_bookings FOR SELECT USING
infrastructure/migrations\056_resource_bookings.sql-156-  (identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\056_resource_bookings.sql-157-   AND organization_id = identity.current_organization_id()));
infrastructure/migrations\056_resource_bookings.sql-158-
infrastructure/migrations\056_resource_bookings.sql-159-DROP POLICY IF EXISTS org_insert ON parts.resource_bookings;
infrastructure/migrations\056_resource_bookings.sql:160:CREATE POLICY org_insert ON parts.resource_bookings FOR INSERT WITH CHECK
infrastructure/migrations\056_resource_bookings.sql-161-  (identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\056_resource_bookings.sql-162-   AND organization_id = identity.current_organization_id()));
infrastructure/migrations\056_resource_bookings.sql-163-
infrastructure/migrations\056_resource_bookings.sql-164-DROP POLICY IF EXISTS org_update ON parts.resource_bookings;
infrastructure/migrations\056_resource_bookings.sql:165:CREATE POLICY org_update ON parts.resource_bookings FOR UPDATE USING
infrastructure/migrations\056_resource_bookings.sql-166-  (identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\056_resource_bookings.sql-167-   AND organization_id = identity.current_organization_id()))
infrastructure/migrations\056_resource_bookings.sql-168-  WITH CHECK
infrastructure/migrations\056_resource_bookings.sql-169-  (identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\056_resource_bookings.sql-170-   AND organization_id = identity.current_organization_id()));
--
infrastructure/migrations\054_organisation_isolation.sql-138-        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
infrastructure/migrations\054_organisation_isolation.sql-139-        EXECUTE format('ALTER TABLE %s FORCE  ROW LEVEL SECURITY', t);
infrastructure/migrations\054_organisation_isolation.sql-140-
infrastructure/migrations\054_organisation_isolation.sql-141-        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_restrict', t);
infrastructure/migrations\054_organisation_isolation.sql-142-        EXECUTE format(
infrastructure/migrations\054_organisation_isolation.sql:143:            'CREATE POLICY %I ON %s AS RESTRICTIVE FOR ALL '
infrastructure/migrations\054_organisation_isolation.sql-144-            'USING (identity.is_platform_admin() '
infrastructure/migrations\054_organisation_isolation.sql-145-            '       OR organization_id = identity.current_organization_id()) '
infrastructure/migrations\054_organisation_isolation.sql-146-            'WITH CHECK (identity.is_platform_admin() '
infrastructure/migrations\054_organisation_isolation.sql-147-            '       OR organization_id = identity.current_organization_id())',
infrastructure/migrations\054_organisation_isolation.sql-148-            'org_restrict', t);
--
infrastructure/migrations\062_supplier_request_select_excludes_customer.sql-58--- replaced, and only its middle arm differs.
infrastructure/migrations\062_supplier_request_select_excludes_customer.sql-59-
infrastructure/migrations\062_supplier_request_select_excludes_customer.sql-60-BEGIN;
infrastructure/migrations\062_supplier_request_select_excludes_customer.sql-61-
infrastructure/migrations\062_supplier_request_select_excludes_customer.sql-62-DROP POLICY IF EXISTS supplier_request_select ON parts.supplier_requests;
infrastructure/migrations\062_supplier_request_select_excludes_customer.sql:63:CREATE POLICY supplier_request_select ON parts.supplier_requests FOR SELECT USING (
infrastructure/migrations\062_supplier_request_select_excludes_customer.sql-64-  identity.is_platform_admin()
infrastructure/migrations\062_supplier_request_select_excludes_customer.sql-65-  OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\062_supplier_request_select_excludes_customer.sql-66-      AND organization_id = identity.current_organization_id()
infrastructure/migrations\062_supplier_request_select_excludes_customer.sql-67-      -- ── THE ONLY DIFFERENCE FROM 059 ────────────────────────────────────
infrastructure/migrations\062_supplier_request_select_excludes_customer.sql-68-      -- Matches `supplier_request_insert` and `supplier_request_update`
--
infrastructure/migrations\061_customer_enrolment.sql-63---      never be used to alter a staff account.
infrastructure/migrations\061_customer_enrolment.sql-64---
infrastructure/migrations\061_customer_enrolment.sql-65---   4. IT GRANTS ONLY TO ITSELF. The RLS door it opens is migration 037's
infrastructure/migrations\061_customer_enrolment.sql-66---      EXISTING `registration_bootstrap_insert` policy on
infrastructure/migrations\061_customer_enrolment.sql-67---      `identity.memberships`, whose WITH CHECK already requires BOTH
infrastructure/migrations\061_customer_enrolment.sql:68:--      `created_by` AND `user_id` to equal `app.bootstrap_user`. There is no
infrastructure/migrations\061_customer_enrolment.sql-69---      shape of this call that writes a row for another person.
infrastructure/migrations\061_customer_enrolment.sql-70---
infrastructure/migrations\061_customer_enrolment.sql-71---      ⚠️ BE EXACT ABOUT WHAT "ITSELF" MEANS HERE. `p_subject` IS a function
infrastructure/migrations\061_customer_enrolment.sql-72---      parameter — an earlier draft of this header said the caller is "resolved
infrastructure/migrations\061_customer_enrolment.sql-73---      from the Keycloak SUBJECT, never from a parameter", which is a sentence
--
infrastructure/migrations\061_customer_enrolment.sql-99---      exists to keep that honest, and `verify/061` asserts it.
infrastructure/migrations\061_customer_enrolment.sql-100---
infrastructure/migrations\061_customer_enrolment.sql-101--- ── WHY A DATABASE FUNCTION AND NOT SERVICE CODE ──────────────────────────
infrastructure/migrations\061_customer_enrolment.sql-102---
infrastructure/migrations\061_customer_enrolment.sql-103--- Same reason as 037: on Render the application connects as a NON-superuser and
infrastructure/migrations\061_customer_enrolment.sql:104:-- `FORCE ROW LEVEL SECURITY` applies to table owners too, so a plain INSERT
infrastructure/migrations\061_customer_enrolment.sql-105--- from a caller with no tenant context is rejected by policy. Locally the owner
infrastructure/migrations\061_customer_enrolment.sql-106--- IS a superuser and bypasses RLS entirely — which is precisely why 036 passed
infrastructure/migrations\061_customer_enrolment.sql-107--- 9/9 against a defect that existed only in production. Anything membership-
infrastructure/migrations\061_customer_enrolment.sql-108--- shaped is rehearsed under production's privilege shape before it is believed.
infrastructure/migrations\061_customer_enrolment.sql-109---
--
infrastructure/migrations\061_customer_enrolment.sql-147--- (organization_id, user_id, role_name) makes the race harmless; the second
infrastructure/migrations\061_customer_enrolment.sql-148--- caller reads the winner's row rather than failing.
infrastructure/migrations\061_customer_enrolment.sql-149-
infrastructure/migrations\061_customer_enrolment.sql-150--- ── 1. the bootstrap door, widened by exactly two SELECTs ───────────────────
infrastructure/migrations\061_customer_enrolment.sql-151---
infrastructure/migrations\061_customer_enrolment.sql:152:-- 037 opened `app.bootstrap` + `app.bootstrap_user` and pinned every policy to
infrastructure/migrations\061_customer_enrolment.sql-153--- that user. This function additionally needs to READ the organisation it is
infrastructure/migrations\061_customer_enrolment.sql-154--- joining — for its `tenant_id` and a branch — and `identity.organizations` and
infrastructure/migrations\061_customer_enrolment.sql-155--- `identity.branches` are both `rls=true forced=true` (verified against the
infrastructure/migrations\061_customer_enrolment.sql-156--- live-shaped local database), so with no tenant context they return zero rows.
infrastructure/migrations\061_customer_enrolment.sql-157---
infrastructure/migrations\061_customer_enrolment.sql:158:-- A third setting, `app.bootstrap_org`, keeps that read as narrow as the rest:
infrastructure/migrations\061_customer_enrolment.sql-159--- ONE organisation, named before the door opens, readable only while the flag
infrastructure/migrations\061_customer_enrolment.sql-160--- is on. A policy of the form `bootstrap = 'on'` alone would have made every
infrastructure/migrations\061_customer_enrolment.sql-161--- organisation in the platform readable inside any bootstrap transaction.
infrastructure/migrations\061_customer_enrolment.sql-162---
infrastructure/migrations\061_customer_enrolment.sql-163--- ⚠️ SELECT ONLY. Neither policy admits INSERT, UPDATE or DELETE, so no
infrastructure/migrations\061_customer_enrolment.sql-164--- bootstrap path can modify somebody else's organisation or branch.
infrastructure/migrations\061_customer_enrolment.sql-165-
infrastructure/migrations\061_customer_enrolment.sql-166--- 🔴 `identity.in_registration_bootstrap()`, NEVER THE RAW SETTING.
infrastructure/migrations\061_customer_enrolment.sql-167---
infrastructure/migrations\061_customer_enrolment.sql-168--- Migration 038 exists because 037's policies tested
infrastructure/migrations\061_customer_enrolment.sql:169:-- `current_setting('app.bootstrap', true) = 'on'` directly, and `set_config` is
infrastructure/migrations\061_customer_enrolment.sql-170--- NOT privileged: migration 002 grants `autoworkshop_app` INSERT on every table
infrastructure/migrations\061_customer_enrolment.sql-171--- in `identity`, so the application role could open the door for itself and
infrastructure/migrations\061_customer_enrolment.sql-172--- write with no function in the call path. Measured, not theorised. 038 added
infrastructure/migrations\061_customer_enrolment.sql-173--- the predicate the app role cannot satisfy — the effective user must be the
infrastructure/migrations\061_customer_enrolment.sql-174--- OWNER of the registration function, which only SECURITY DEFINER produces.
infrastructure/migrations\061_customer_enrolment.sql-175---
infrastructure/migrations\061_customer_enrolment.sql-176--- Writing the raw `current_setting` here would silently reopen exactly that
infrastructure/migrations\061_customer_enrolment.sql-177--- hole for two more tables. The first draft of this migration did.
infrastructure/migrations\061_customer_enrolment.sql-178-
infrastructure/migrations\061_customer_enrolment.sql-179-DROP POLICY IF EXISTS enrolment_bootstrap_select ON identity.organizations;
infrastructure/migrations\061_customer_enrolment.sql:180:CREATE POLICY enrolment_bootstrap_select ON identity.organizations
infrastructure/migrations\061_customer_enrolment.sql-181-    FOR SELECT
infrastructure/migrations\061_customer_enrolment.sql-182-    USING (
infrastructure/migrations\061_customer_enrolment.sql-183-        identity.in_registration_bootstrap()
infrastructure/migrations\061_customer_enrolment.sql:184:        AND id::text = current_setting('app.bootstrap_org', true)
infrastructure/migrations\061_customer_enrolment.sql-185-    );
infrastructure/migrations\061_customer_enrolment.sql-186-
infrastructure/migrations\061_customer_enrolment.sql-187-DROP POLICY IF EXISTS enrolment_bootstrap_select ON identity.branches;
infrastructure/migrations\061_customer_enrolment.sql:188:CREATE POLICY enrolment_bootstrap_select ON identity.branches
infrastructure/migrations\061_customer_enrolment.sql-189-    FOR SELECT
infrastructure/migrations\061_customer_enrolment.sql-190-    USING (
infrastructure/migrations\061_customer_enrolment.sql-191-        identity.in_registration_bootstrap()
infrastructure/migrations\061_customer_enrolment.sql:192:        AND organization_id::text = current_setting('app.bootstrap_org', true)
infrastructure/migrations\061_customer_enrolment.sql-193-    );
infrastructure/migrations\061_customer_enrolment.sql-194-
infrastructure/migrations\061_customer_enrolment.sql-195-COMMENT ON POLICY enrolment_bootstrap_select ON identity.organizations IS
infrastructure/migrations\061_customer_enrolment.sql-196-'Lets identity.enrol_as_customer read the ONE organisation a caller is joining, '
infrastructure/migrations\061_customer_enrolment.sql:197:'and only while app.bootstrap=on. SELECT only. Without it the function runs with '
infrastructure/migrations\061_customer_enrolment.sql-198-'no tenant context under FORCE RLS and cannot see the organisation it was asked '
infrastructure/migrations\061_customer_enrolment.sql-199-'about — the 036 failure mode, which is invisible locally because the local owner '
infrastructure/migrations\061_customer_enrolment.sql-200-'is a superuser.';
infrastructure/migrations\061_customer_enrolment.sql-201-
infrastructure/migrations\061_customer_enrolment.sql-202-COMMENT ON POLICY enrolment_bootstrap_select ON identity.branches IS
infrastructure/migrations\061_customer_enrolment.sql-203-'The branch half of enrolment_bootstrap_select on identity.organizations. Scoped '
infrastructure/migrations\061_customer_enrolment.sql:204:'to the same single organisation named in app.bootstrap_org. SELECT only.';
infrastructure/migrations\061_customer_enrolment.sql-205-
infrastructure/migrations\061_customer_enrolment.sql-206--- ── 2. the function ─────────────────────────────────────────────────────────
infrastructure/migrations\061_customer_enrolment.sql-207-
infrastructure/migrations\061_customer_enrolment.sql-208-CREATE OR REPLACE FUNCTION identity.enrol_as_customer(
infrastructure/migrations\061_customer_enrolment.sql-209-    p_subject         TEXT,
--
infrastructure/migrations\061_customer_enrolment.sql-257-    END IF;
infrastructure/migrations\061_customer_enrolment.sql-258-
infrastructure/migrations\061_customer_enrolment.sql-259-    -- ── the door opens ─────────────────────────────────────────────────────
infrastructure/migrations\061_customer_enrolment.sql-260-    -- All three are transaction-local (`is_local => true`), so a pooled
infrastructure/migrations\061_customer_enrolment.sql-261-    -- connection cannot carry them into the next request even on an abort.
infrastructure/migrations\061_customer_enrolment.sql:262:    PERFORM set_config('app.bootstrap',      'on',                      true);
infrastructure/migrations\061_customer_enrolment.sql:263:    PERFORM set_config('app.bootstrap_user', v_user::text,              true);
infrastructure/migrations\061_customer_enrolment.sql:264:    PERFORM set_config('app.bootstrap_org',  p_organization_id::text,   true);
infrastructure/migrations\061_customer_enrolment.sql-265-
infrastructure/migrations\061_customer_enrolment.sql-266-    -- ⚠️ CONSTRAINT 2 — the workshop must have invited the public in.
infrastructure/migrations\061_customer_enrolment.sql-267-    -- `catalogue.mechanic_directory`'s `public_read` policy is `USING
infrastructure/migrations\061_customer_enrolment.sql-268-    -- (is_published)`, so this read needs no bypass and cannot see an
infrastructure/migrations\061_customer_enrolment.sql-269-    -- unpublished listing even by accident.
--
infrastructure/migrations\061_customer_enrolment.sql-271-      FROM catalogue.mechanic_directory
infrastructure/migrations\061_customer_enrolment.sql-272-     WHERE mechanic_directory.organization_id = p_organization_id
infrastructure/migrations\061_customer_enrolment.sql-273-       AND is_published;
infrastructure/migrations\061_customer_enrolment.sql-274-
infrastructure/migrations\061_customer_enrolment.sql-275-    IF v_published IS NULL THEN
infrastructure/migrations\061_customer_enrolment.sql:276:        PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\061_customer_enrolment.sql:277:        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\061_customer_enrolment.sql:278:        PERFORM set_config('app.bootstrap_org',  '', true);
infrastructure/migrations\061_customer_enrolment.sql-279-        -- Worded for the person reading it. "Not published" is our vocabulary,
infrastructure/migrations\061_customer_enrolment.sql-280-        -- not theirs, and §70 forbids leaving a user unsure what happened.
infrastructure/migrations\061_customer_enrolment.sql-281-        RAISE EXCEPTION 'that workshop is not accepting customers online';
infrastructure/migrations\061_customer_enrolment.sql-282-    END IF;
infrastructure/migrations\061_customer_enrolment.sql-283-
infrastructure/migrations\061_customer_enrolment.sql-284-    -- ⚠️ CONSTRAINT 3 — never touch an account that already has a role here.
infrastructure/migrations\061_customer_enrolment.sql-285-    -- Readable because 037's `registration_bootstrap_select` on
infrastructure/migrations\061_customer_enrolment.sql:286:    -- `identity.memberships` admits `user_id = app.bootstrap_user`.
infrastructure/migrations\061_customer_enrolment.sql-287-    SELECT m.id, m.role_name, m.tenant_id, m.branch_id
infrastructure/migrations\061_customer_enrolment.sql-288-      INTO v_existing
infrastructure/migrations\061_customer_enrolment.sql-289-      FROM identity.memberships m
infrastructure/migrations\061_customer_enrolment.sql-290-     WHERE m.user_id = v_user
infrastructure/migrations\061_customer_enrolment.sql-291-       AND m.organization_id = p_organization_id
infrastructure/migrations\061_customer_enrolment.sql-292-       AND m.status = 'active'
infrastructure/migrations\061_customer_enrolment.sql-293-     LIMIT 1;
infrastructure/migrations\061_customer_enrolment.sql-294-
infrastructure/migrations\061_customer_enrolment.sql-295-    IF v_existing.id IS NOT NULL THEN
infrastructure/migrations\061_customer_enrolment.sql:296:        PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\061_customer_enrolment.sql:297:        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\061_customer_enrolment.sql:298:        PERFORM set_config('app.bootstrap_org',  '', true);
infrastructure/migrations\061_customer_enrolment.sql-299-
infrastructure/migrations\061_customer_enrolment.sql-300-        IF v_existing.role_name = 'customer' THEN
infrastructure/migrations\061_customer_enrolment.sql-301-            -- Already a customer here. The funnel calls this on every visit;
infrastructure/migrations\061_customer_enrolment.sql-302-            -- returning the existing row is the whole point of idempotence.
infrastructure/migrations\061_customer_enrolment.sql-303-            RETURN QUERY SELECT v_existing.tenant_id, p_organization_id,
--
infrastructure/migrations\061_customer_enrolment.sql-318-      FROM identity.organizations o
infrastructure/migrations\061_customer_enrolment.sql-319-     WHERE o.id = p_organization_id
infrastructure/migrations\061_customer_enrolment.sql-320-       AND o.status = 'active';
infrastructure/migrations\061_customer_enrolment.sql-321-
infrastructure/migrations\061_customer_enrolment.sql-322-    IF v_tenant IS NULL THEN
infrastructure/migrations\061_customer_enrolment.sql:323:        PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\061_customer_enrolment.sql:324:        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\061_customer_enrolment.sql:325:        PERFORM set_config('app.bootstrap_org',  '', true);
infrastructure/migrations\061_customer_enrolment.sql-326-        -- Reachable when a published listing outlives its organisation. Not a
infrastructure/migrations\061_customer_enrolment.sql-327-        -- 500: the customer chose a workshop that is no longer there.
infrastructure/migrations\061_customer_enrolment.sql-328-        RAISE EXCEPTION 'that workshop is not accepting customers online';
infrastructure/migrations\061_customer_enrolment.sql-329-    END IF;
infrastructure/migrations\061_customer_enrolment.sql-330-
--
infrastructure/migrations\061_customer_enrolment.sql-341-
infrastructure/migrations\061_customer_enrolment.sql-342-    v_member := gen_random_uuid();
infrastructure/migrations\061_customer_enrolment.sql-343-
infrastructure/migrations\061_customer_enrolment.sql-344-    -- ⚠️ THE ROLE IS A LITERAL. See constraint 1 in the header.
infrastructure/migrations\061_customer_enrolment.sql-345-    -- `created_by = v_user` is not decoration: 037's bootstrap policy WITH
infrastructure/migrations\061_customer_enrolment.sql:346:    -- CHECK requires created_by AND user_id to BOTH equal app.bootstrap_user,
infrastructure/migrations\061_customer_enrolment.sql-347-    -- so a row attributed to anyone else is rejected by the database.
infrastructure/migrations\061_customer_enrolment.sql-348-    INSERT INTO identity.memberships
infrastructure/migrations\061_customer_enrolment.sql-349-        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure/migrations\061_customer_enrolment.sql-350-    VALUES (v_member, v_tenant, p_organization_id, v_branch, v_user, 'customer', 'active', v_user)
infrastructure/migrations\061_customer_enrolment.sql-351-    ON CONFLICT (organization_id, user_id, role_name) DO NOTHING
--
infrastructure/migrations\061_customer_enrolment.sql-359-          FROM identity.memberships m
infrastructure/migrations\061_customer_enrolment.sql-360-         WHERE m.user_id = v_user
infrastructure/migrations\061_customer_enrolment.sql-361-           AND m.organization_id = p_organization_id
infrastructure/migrations\061_customer_enrolment.sql-362-           AND m.role_name = 'customer';
infrastructure/migrations\061_customer_enrolment.sql-363-
infrastructure/migrations\061_customer_enrolment.sql:364:        PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\061_customer_enrolment.sql:365:        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\061_customer_enrolment.sql:366:        PERFORM set_config('app.bootstrap_org',  '', true);
infrastructure/migrations\061_customer_enrolment.sql-367-
infrastructure/migrations\061_customer_enrolment.sql-368-        RETURN QUERY SELECT v_existing.tenant_id, p_organization_id,
infrastructure/migrations\061_customer_enrolment.sql-369-                            v_existing.branch_id, v_existing.id, FALSE;
infrastructure/migrations\061_customer_enrolment.sql-370-        RETURN;
infrastructure/migrations\061_customer_enrolment.sql-371-    END IF;
infrastructure/migrations\061_customer_enrolment.sql-372-
infrastructure/migrations\061_customer_enrolment.sql-373-    -- ── and the door closes ────────────────────────────────────────────────
infrastructure/migrations\061_customer_enrolment.sql-374-    -- The caller's transaction continues after this returns; leaving the flags
infrastructure/migrations\061_customer_enrolment.sql-375-    -- set would hand the rest of it a bypass nobody asked for.
infrastructure/migrations\061_customer_enrolment.sql:376:    PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\061_customer_enrolment.sql:377:    PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\061_customer_enrolment.sql:378:    PERFORM set_config('app.bootstrap_org',  '', true);
infrastructure/migrations\061_customer_enrolment.sql-379-
infrastructure/migrations\061_customer_enrolment.sql-380-    RETURN QUERY SELECT v_tenant, p_organization_id, v_branch, v_member, TRUE;
infrastructure/migrations\061_customer_enrolment.sql-381-END;
infrastructure/migrations\061_customer_enrolment.sql-382-$$;
infrastructure/migrations\061_customer_enrolment.sql-383-
--
infrastructure/migrations\verify\013_finding_removal.sql-58-
infrastructure/migrations\verify\013_finding_removal.sql-59-    -- The RLS context the application sets per request. Without it every statement
infrastructure/migrations\verify\013_finding_removal.sql-60-    -- below is invisible to its own policy and the test would "pass" by touching
infrastructure/migrations\verify\013_finding_removal.sql-61-    -- nothing.
infrastructure/migrations\verify\013_finding_removal.sql-62-    PERFORM set_config('app.tenant_id', v_tenant::text, true);
infrastructure/migrations\verify\013_finding_removal.sql:63:    PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\013_finding_removal.sql-64-
infrastructure/migrations\verify\013_finding_removal.sql-65-    INSERT INTO repair.diagnoses (tenant_id, organization_id, job_card_id, attempt_no)
infrastructure/migrations\verify\013_finding_removal.sql-66-    VALUES (v_tenant, v_org, v_card, 9001)
infrastructure/migrations\verify\013_finding_removal.sql-67-    RETURNING id INTO v_diag;
infrastructure/migrations\verify\013_finding_removal.sql-68-
--
infrastructure/migrations\078_platform_grant_lookup.sql-22---
infrastructure/migrations\078_platform_grant_lookup.sql-23--- ── THE TRAP: 077'S SELF-READ POLICY CANNOT FIRE WHERE THE API NEEDS IT ────
infrastructure/migrations\078_platform_grant_lookup.sql-24---
infrastructure/migrations\078_platform_grant_lookup.sql-25--- 077 granted the application role SELECT and added:
infrastructure/migrations\078_platform_grant_lookup.sql-26---
infrastructure/migrations\078_platform_grant_lookup.sql:27:--     CREATE POLICY platform_administrators_self_read ... FOR SELECT
infrastructure/migrations\078_platform_grant_lookup.sql-28---       USING (user_id = identity.current_user_id()
infrastructure/migrations\078_platform_grant_lookup.sql:29:--           OR identity.current_role_name() = 'admin');
infrastructure/migrations\078_platform_grant_lookup.sql-30---
infrastructure/migrations\078_platform_grant_lookup.sql-31--- `identity.current_user_id()` reads `app.user_id`. That setting is written by
infrastructure/migrations\078_platform_grant_lookup.sql-32--- `tenantSessionStatements`, which runs AFTER `resolveTenantContext` has already
infrastructure/migrations\078_platform_grant_lookup.sql-33--- decided who the caller is. The grant must be known BEFORE that, inside
infrastructure/migrations\078_platform_grant_lookup.sql-34--- `TenantGuard`, where no tenant context exists yet and `app.user_id` is unset.
infrastructure/migrations\078_platform_grant_lookup.sql-35---
infrastructure/migrations\078_platform_grant_lookup.sql:36:-- `identity.platform_administrators` is ENABLE + FORCE ROW LEVEL SECURITY, so
infrastructure/migrations\078_platform_grant_lookup.sql-37--- with the setting unset the policy evaluates `user_id = NULL` and hides every
infrastructure/migrations\078_platform_grant_lookup.sql-38--- row. A plain SELECT from the guard would return zero rows FOR EVERY USER,
infrastructure/migrations\078_platform_grant_lookup.sql-39--- including real administrators — and it would do so silently, with no error.
infrastructure/migrations\078_platform_grant_lookup.sql-40---
infrastructure/migrations\078_platform_grant_lookup.sql-41--- 🔴 THAT EXACT FAILURE HAS ALREADY HAPPENED IN THIS REPOSITORY, and
--
infrastructure/migrations\078_platform_grant_lookup.sql-196--- detail: that predicate reads this very table, so referencing it from a policy
infrastructure/migrations\078_platform_grant_lookup.sql-197--- ON this table is infinite recursion at the first SELECT after deploy.
infrastructure/migrations\078_platform_grant_lookup.sql-198--- verify/077 asserts it stays absent and verify/078 asserts it here too.
infrastructure/migrations\078_platform_grant_lookup.sql-199-
infrastructure/migrations\078_platform_grant_lookup.sql-200-DROP POLICY IF EXISTS platform_grant_lookup_select ON identity.platform_administrators;
infrastructure/migrations\078_platform_grant_lookup.sql:201:CREATE POLICY platform_grant_lookup_select
infrastructure/migrations\078_platform_grant_lookup.sql-202-  ON identity.platform_administrators
infrastructure/migrations\078_platform_grant_lookup.sql-203-  FOR SELECT
infrastructure/migrations\078_platform_grant_lookup.sql-204-  USING (
infrastructure/migrations\078_platform_grant_lookup.sql-205-      identity.in_platform_grant_lookup()
infrastructure/migrations\078_platform_grant_lookup.sql-206-      AND user_id = (
--
infrastructure/migrations\077_platform_administrator_grants.sql-3--- ══════════════════════════════════════════════════════════════════════════
infrastructure/migrations\077_platform_administrator_grants.sql-4--- WHAT WAS WRONG, AND WHY IT WAS NOT MERELY UNTIDY.
infrastructure/migrations\077_platform_administrator_grants.sql-5---
infrastructure/migrations\077_platform_administrator_grants.sql-6--- `identity.is_platform_admin()` has answered this since migration 001:
infrastructure/migrations\077_platform_administrator_grants.sql-7---
infrastructure/migrations\077_platform_administrator_grants.sql:8:--     current_role_name() IN ('admin', 'platform_administrator')
infrastructure/migrations\077_platform_administrator_grants.sql-9---
infrastructure/migrations\077_platform_administrator_grants.sql:10:-- `current_role_name()` reads `app.current_role`, which `tenantSessionStatements`
infrastructure/migrations\077_platform_administrator_grants.sql-11--- writes from `TenantContext.activeRole`, which `resolveTenantContext` takes
infrastructure/migrations\077_platform_administrator_grants.sql-12--- from a MEMBERSHIP ROW's `role_name`. So platform authority — the predicate
infrastructure/migrations\077_platform_administrator_grants.sql-13--- that opens EVERY tenant table in this database — was conferred by a text
infrastructure/migrations\077_platform_administrator_grants.sql-14--- column on a row inside one organisation.
infrastructure/migrations\077_platform_administrator_grants.sql-15---
--
infrastructure/migrations\077_platform_administrator_grants.sql-78-BEGIN;
infrastructure/migrations\077_platform_administrator_grants.sql-79-
infrastructure/migrations\077_platform_administrator_grants.sql-80--- The seeding escape, per the standing rule. Asserted live below rather than
infrastructure/migrations\077_platform_administrator_grants.sql-81--- assumed: migration 073's orphan check read 6 rows as the owner and 0 as the
infrastructure/migrations\077_platform_administrator_grants.sql-82--- Render role, and reported success either way.
infrastructure/migrations\077_platform_administrator_grants.sql:83:SELECT set_config('app.current_role', 'admin', true);
infrastructure/migrations\077_platform_administrator_grants.sql-84-
infrastructure/migrations\077_platform_administrator_grants.sql-85-DO $$
infrastructure/migrations\077_platform_administrator_grants.sql-86-BEGIN
infrastructure/migrations\077_platform_administrator_grants.sql-87-  IF NOT identity.is_platform_admin() THEN
infrastructure/migrations\077_platform_administrator_grants.sql-88-    RAISE EXCEPTION
--
infrastructure/migrations\077_platform_administrator_grants.sql-197---
infrastructure/migrations\077_platform_administrator_grants.sql-198--- So these policies deliberately use ONLY the primitive settings accessors and
infrastructure/migrations\077_platform_administrator_grants.sql-199--- never the derived predicate. A future edit adding `is_platform_admin()` here
infrastructure/migrations\077_platform_administrator_grants.sql-200--- would deadlock the database; verify/077 asserts it stays absent.
infrastructure/migrations\077_platform_administrator_grants.sql-201-ALTER TABLE identity.platform_administrators ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\077_platform_administrator_grants.sql:202:ALTER TABLE identity.platform_administrators FORCE ROW LEVEL SECURITY;
infrastructure/migrations\077_platform_administrator_grants.sql-203-
infrastructure/migrations\077_platform_administrator_grants.sql-204--- A user may see their OWN grant — which is all `is_platform_admin()` needs,
infrastructure/migrations\077_platform_administrator_grants.sql-205--- because it only ever asks about the current user.
infrastructure/migrations\077_platform_administrator_grants.sql:206:CREATE POLICY platform_administrators_self_read
infrastructure/migrations\077_platform_administrator_grants.sql-207-  ON identity.platform_administrators
infrastructure/migrations\077_platform_administrator_grants.sql-208-  FOR SELECT
infrastructure/migrations\077_platform_administrator_grants.sql-209-  USING (user_id = identity.current_user_id()
infrastructure/migrations\077_platform_administrator_grants.sql:210:      OR identity.current_role_name() = 'admin');
infrastructure/migrations\077_platform_administrator_grants.sql-211-
infrastructure/migrations\077_platform_administrator_grants.sql-212--- Writing is the seed/operator path only. There is deliberately no application
infrastructure/migrations\077_platform_administrator_grants.sql-213--- write path: conferring platform authority is an out-of-band operation with a
infrastructure/migrations\077_platform_administrator_grants.sql-214--- workflow behind it, not an API call. If that ever changes it needs its own
infrastructure/migrations\077_platform_administrator_grants.sql-215--- migration, its own service and its own review.
infrastructure/migrations\077_platform_administrator_grants.sql:216:CREATE POLICY platform_administrators_admin_write
infrastructure/migrations\077_platform_administrator_grants.sql-217-  ON identity.platform_administrators
infrastructure/migrations\077_platform_administrator_grants.sql-218-  FOR ALL
infrastructure/migrations\077_platform_administrator_grants.sql:219:  USING (identity.current_role_name() = 'admin')
infrastructure/migrations\077_platform_administrator_grants.sql:220:  WITH CHECK (identity.current_role_name() = 'admin');
infrastructure/migrations\077_platform_administrator_grants.sql-221-
infrastructure/migrations\077_platform_administrator_grants.sql-222-GRANT SELECT ON identity.platform_administrators TO autoworkshop_app;
infrastructure/migrations\077_platform_administrator_grants.sql-223-
infrastructure/migrations\077_platform_administrator_grants.sql-224--- ── Backfill BEFORE the predicate changes ──────────────────────────────────
infrastructure/migrations\077_platform_administrator_grants.sql-225---
--
infrastructure/migrations\077_platform_administrator_grants.sql-242--- ── The predicate itself ───────────────────────────────────────────────────
infrastructure/migrations\077_platform_administrator_grants.sql-243---
infrastructure/migrations\077_platform_administrator_grants.sql-244--- `'admin'` REMAINS, and is not the same kind of thing as the name being
infrastructure/migrations\077_platform_administrator_grants.sql-245--- removed. It is the seed/psql/migration escape — it cannot arrive from a
infrastructure/migrations\077_platform_administrator_grants.sql-246--- membership row, because `resolveTenantContext` only ever writes a real
infrastructure/migrations\077_platform_administrator_grants.sql:247:-- `role_name` into `app.current_role`, and `admin` is not a grantable role. It
infrastructure/migrations\077_platform_administrator_grants.sql-248--- is set by `set_config` inside migrations and seed scripts, i.e. by whoever
infrastructure/migrations\077_platform_administrator_grants.sql-249--- already holds the database credential.
infrastructure/migrations\077_platform_administrator_grants.sql-250---
infrastructure/migrations\077_platform_administrator_grants.sql-251--- `'platform_administrator'` is REMOVED. That string is a membership role name,
infrastructure/migrations\077_platform_administrator_grants.sql-252--- and a membership role name is exactly what must stop conferring this.
--
infrastructure/migrations\077_platform_administrator_grants.sql-255-LANGUAGE sql
infrastructure/migrations\077_platform_administrator_grants.sql-256-STABLE
infrastructure/migrations\077_platform_administrator_grants.sql-257-AS $$
infrastructure/migrations\077_platform_administrator_grants.sql-258-  SELECT (
infrastructure/migrations\077_platform_administrator_grants.sql-259-           -- 🔴 THE SEED ESCAPE NOW REQUIRES A REAL DATABASE PRINCIPAL, NOT
infrastructure/migrations\077_platform_administrator_grants.sql:260:           -- ONLY A SETTING. `app.current_role` is a custom GUC and ANY role
infrastructure/migrations\077_platform_administrator_grants.sql-261-           -- can write it, including `autoworkshop_app` — so on the first
infrastructure/migrations\077_platform_administrator_grants.sql-262-           -- version of this migration a single injected
infrastructure/migrations\077_platform_administrator_grants.sql:263:           -- `set_config('app.current_role','admin',true)` restored platform
infrastructure/migrations\077_platform_administrator_grants.sql-264-           -- authority over every table, through the very function written to
infrastructure/migrations\077_platform_administrator_grants.sql-265-           -- stop that. The grant table was irrelevant: the escape bypassed it.
infrastructure/migrations\077_platform_administrator_grants.sql-266-           -- Codex found this and was right; my own security pass missed it by
infrastructure/migrations\077_platform_administrator_grants.sql-267-           -- reasoning about who may WRITE the grant table rather than about
infrastructure/migrations\077_platform_administrator_grants.sql-268-           -- who may skip reading it.
infrastructure/migrations\077_platform_administrator_grants.sql-269-           --
infrastructure/migrations\077_platform_administrator_grants.sql-270-           -- `current_user` is not settable by SQL the attacker controls, so
infrastructure/migrations\077_platform_administrator_grants.sql-271-           -- pairing the two means the escape belongs to whoever holds the
infrastructure/migrations\077_platform_administrator_grants.sql-272-           -- OWNER credential — migrations, seeds and hand-run psql — and to
infrastructure/migrations\077_platform_administrator_grants.sql-273-           -- nobody reachable from the application connection.
infrastructure/migrations\077_platform_administrator_grants.sql:274:           identity.current_role_name() = 'admin'
infrastructure/migrations\077_platform_administrator_grants.sql-275-           AND current_user = (SELECT pg_get_userbyid(relowner)
infrastructure/migrations\077_platform_administrator_grants.sql-276-                                 FROM pg_class
infrastructure/migrations\077_platform_administrator_grants.sql-277-                                WHERE oid = 'identity.platform_administrators'::regclass)
infrastructure/migrations\077_platform_administrator_grants.sql-278-         )
infrastructure/migrations\077_platform_administrator_grants.sql-279-      OR EXISTS (
--
infrastructure/migrations\077_platform_administrator_grants.sql-283-              AND pa.revoked_at IS NULL);
infrastructure/migrations\077_platform_administrator_grants.sql-284-$$;
infrastructure/migrations\077_platform_administrator_grants.sql-285-
infrastructure/migrations\077_platform_administrator_grants.sql-286-COMMENT ON FUNCTION identity.is_platform_admin() IS
infrastructure/migrations\077_platform_administrator_grants.sql-287-  'True for a user holding an un-revoked row in identity.platform_administrators, '
infrastructure/migrations\077_platform_administrator_grants.sql:288:  'or for the seed/psql escape — which requires BOTH app.current_role = admin AND '
infrastructure/migrations\077_platform_administrator_grants.sql:289:  'the caller to be the owner of that table, because app.current_role is a GUC any '
infrastructure/migrations\077_platform_administrator_grants.sql-290-  'role can set and the application role could otherwise grant itself everything. '
infrastructure/migrations\077_platform_administrator_grants.sql-291-  'Migration 077 removed the membership role name platform_administrator from this '
infrastructure/migrations\077_platform_administrator_grants.sql-292-  'test: authority is a grant record, never a text column on a row inside one '
infrastructure/migrations\077_platform_administrator_grants.sql-293-  'organisation. NOTE: the API still derives platform.admin from the membership '
infrastructure/migrations\077_platform_administrator_grants.sql-294-  'role, so revoking a grant does not yet revoke API authority — see the header.';
--
infrastructure/migrations\rehearse\075_fleet_registration_render_privileges.sql-13---     alert_admins_of_registration   | autoworkshop | t
infrastructure/migrations\rehearse\075_fleet_registration_render_privileges.sql-14---
infrastructure/migrations\rehearse\075_fleet_registration_render_privileges.sql-15--- A SECURITY DEFINER function runs as its OWNER. Locally that owner holds
infrastructure/migrations\rehearse\075_fleet_registration_render_privileges.sql-16--- BYPASSRLS, so migration 037's bootstrap policies are never consulted and a
infrastructure/migrations\rehearse\075_fleet_registration_render_privileges.sql-17--- green verify proves only that the SQL parses. On Render the owner is an
infrastructure/migrations\rehearse\075_fleet_registration_render_privileges.sql:18:-- ordinary role and every identity table is FORCE ROW LEVEL SECURITY — the one
infrastructure/migrations\rehearse\075_fleet_registration_render_privileges.sql-19--- setting that stops even the owner being exempt.
infrastructure/migrations\rehearse\075_fleet_registration_render_privileges.sql-20---
infrastructure/migrations\rehearse\075_fleet_registration_render_privileges.sql-21--- This is not a hypothetical. On 2026-08-09 the admin-alert trigger was found
infrastructure/migrations\rehearse\075_fleet_registration_render_privileges.sql-22--- INERT on Render for exactly this reason: the local owner saw 2 administrators
infrastructure/migrations\rehearse\075_fleet_registration_render_privileges.sql-23--- and a NOBYPASSRLS role saw 0, so every registration would have been queued
--
infrastructure/migrations\076_fleet_registration_race.sql-96-
infrastructure/migrations\076_fleet_registration_race.sql-97-    -- ── the door opens here, and only here ─────────────────────────────────
infrastructure/migrations\076_fleet_registration_race.sql-98-    -- Transaction-local, so a pooled connection cannot carry the flag into the
infrastructure/migrations\076_fleet_registration_race.sql-99-    -- next request even on an abort. Cleared explicitly as well, because the
infrastructure/migrations\076_fleet_registration_race.sql-100-    -- SUCCESS path leaves the caller's transaction open.
infrastructure/migrations\076_fleet_registration_race.sql:101:    PERFORM set_config('app.bootstrap',      'on',         true);
infrastructure/migrations\076_fleet_registration_race.sql:102:    PERFORM set_config('app.bootstrap_user', v_user::text, true);
infrastructure/migrations\076_fleet_registration_race.sql-103-
infrastructure/migrations\076_fleet_registration_race.sql-104-    -- One organisation per person. AFTER the flag is set: under FORCE RLS with
infrastructure/migrations\076_fleet_registration_race.sql-105-    -- no tenant context this read returns zero rows for everybody, so placing
infrastructure/migrations\076_fleet_registration_race.sql-106-    -- it earlier would make it a check that cannot fire — the bug migration 037
infrastructure/migrations\076_fleet_registration_race.sql-107-    -- fixed in `register_workshop`. And after the LOCK, which is what makes the
infrastructure/migrations\076_fleet_registration_race.sql-108-    -- read meaningful when two requests arrive together.
infrastructure/migrations\076_fleet_registration_race.sql-109-    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\076_fleet_registration_race.sql-110-                WHERE user_id = v_user AND status = 'active') THEN
infrastructure/migrations\076_fleet_registration_race.sql:111:        PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\076_fleet_registration_race.sql:112:        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\076_fleet_registration_race.sql-113-        -- ⚠️ THE MESSAGE NAMES A REACHABLE ALTERNATIVE. A rule with no way past
infrastructure/migrations\076_fleet_registration_race.sql-114-        -- it is a wall, and the person in front of it files a bug rather than
infrastructure/migrations\076_fleet_registration_race.sql-115-        -- acting.
infrastructure/migrations\076_fleet_registration_race.sql-116-        --
infrastructure/migrations\076_fleet_registration_race.sql-117-        -- 🔴 AND THE WORDING IS A CONTRACT. `RegistrationController.registerFleet`
--
infrastructure/migrations\076_fleet_registration_race.sql-164-    INSERT INTO identity.organization_registrations
infrastructure/migrations\076_fleet_registration_race.sql-165-        (tenant_id, organization_id, kind, status, submitted_by)
infrastructure/migrations\076_fleet_registration_race.sql-166-    VALUES (v_tenant, v_org, 'fleet', 'pending', v_user);
infrastructure/migrations\076_fleet_registration_race.sql-167-
infrastructure/migrations\076_fleet_registration_race.sql-168-    -- ── and the door closes ────────────────────────────────────────────────
infrastructure/migrations\076_fleet_registration_race.sql:169:    PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\076_fleet_registration_race.sql:170:    PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\076_fleet_registration_race.sql-171-
infrastructure/migrations\076_fleet_registration_race.sql-172-    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
infrastructure/migrations\076_fleet_registration_race.sql-173-END;
infrastructure/migrations\076_fleet_registration_race.sql-174-$$;
infrastructure/migrations\076_fleet_registration_race.sql-175-
--
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-11--- — none of them are exercised. The function would pass here even if every
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-12--- policy were wrong.
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-13---
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-14--- That is not a hypothetical. Migration 036 passed 9/9 locally against a defect
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-15--- that existed ONLY on production, where the same role is merely the table
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql:16:-- OWNER and `FORCE ROW LEVEL SECURITY` therefore binds it. That cost a session
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-17--- and produced a live 500 on `POST /registration/workshop`.
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-18---
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-19--- So this re-owns the functions and tables to a NOSUPERUSER NOBYPASSRLS role,
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-20--- drives the enrolment **with no user and no tenant context**, and ROLLS BACK.
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-21--- ══════════════════════════════════════════════════════════════════════════
--
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-230-    END;
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-231-
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-232-    -- ── 7. the door is SHUT again afterwards ───────────────────────────────
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-233-    -- The function leaves the caller's transaction open, so a flag left set
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-234-    -- would hand the rest of it a bypass nobody asked for.
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql:235:    IF COALESCE(current_setting('app.bootstrap', true), '') = 'on' THEN
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-236-        fails := fails + 1;
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql:237:        RAISE WARNING 'FAIL 7 — app.bootstrap is STILL on after the function returned';
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-238-    ELSE
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-239-        passes := passes + 1;
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql:240:        RAISE NOTICE 'PASS 7 — app.bootstrap cleared on every exit path';
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-241-    END IF;
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-242-
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-243-    -- ── 8. the app role cannot forge the door (migration 038) ──────────────
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-244-    -- The whole point of `in_registration_bootstrap()`. `set_config` is not
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-245-    -- privileged, so without 038 the application role could open the door and
--
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-255-    RESET ROLE;
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-256-    SET LOCAL ROLE autoworkshop_app;
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-257-    IF current_user <> 'autoworkshop_app' THEN
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-258-        RAISE EXCEPTION 'rehearse/061 check 8 is not acting as the application role (current_user=%)', 
current_user;
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-259-    END IF;
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql:260:    PERFORM set_config('app.bootstrap',      'on',           true);
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql:261:    PERFORM set_config('app.bootstrap_user', v_stranger::text, true);
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-262-    BEGIN
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-263-        INSERT INTO identity.memberships
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-264-            (tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-265-        VALUES (v_tenant, v_org, v_branch, v_stranger, 'workshop_owner', 'active', v_stranger);
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-266-        fails := fails + 1;
--
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-275-        ELSE
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-276-            fails := fails + 1;
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-277-            RAISE WARNING 'FAIL 8 — unexpected error: %', SQLERRM;
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-278-        END IF;
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-279-    END;
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql:280:    PERFORM set_config('app.bootstrap', '', true);
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql:281:    PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-282-
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-283-    RESET ROLE;
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-284-    RAISE NOTICE '────────────────────────────────────────';
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-285-    RAISE NOTICE 'rehearse/061: % passed, % failed', passes, fails;
infrastructure/migrations\rehearse\061_customer_enrolment_render_privileges.sql-286-    IF fails > 0 THEN
--
infrastructure/migrations\075_fleet_registration.sql-118-
infrastructure/migrations\075_fleet_registration.sql-119-    -- ── the door opens here, and only here ─────────────────────────────────
infrastructure/migrations\075_fleet_registration.sql-120-    -- Transaction-local, so a pooled connection cannot carry the flag into the
infrastructure/migrations\075_fleet_registration.sql-121-    -- next request even on an abort. Cleared explicitly as well, because the
infrastructure/migrations\075_fleet_registration.sql-122-    -- SUCCESS path leaves the caller's transaction open.
infrastructure/migrations\075_fleet_registration.sql:123:    PERFORM set_config('app.bootstrap',      'on',         true);
infrastructure/migrations\075_fleet_registration.sql:124:    PERFORM set_config('app.bootstrap_user', v_user::text, true);
infrastructure/migrations\075_fleet_registration.sql-125-
infrastructure/migrations\075_fleet_registration.sql-126-    -- One organisation per person. AFTER the flag is set: under FORCE RLS with
infrastructure/migrations\075_fleet_registration.sql-127-    -- no tenant context this read returns zero rows for everybody, so placing
infrastructure/migrations\075_fleet_registration.sql-128-    -- it earlier would make it a check that cannot fire — the bug migration 037
infrastructure/migrations\075_fleet_registration.sql-129-    -- fixed in `register_workshop`.
infrastructure/migrations\075_fleet_registration.sql-130-    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\075_fleet_registration.sql-131-                WHERE user_id = v_user AND status = 'active') THEN
infrastructure/migrations\075_fleet_registration.sql:132:        PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\075_fleet_registration.sql:133:        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\075_fleet_registration.sql-134-        -- ⚠️ THE MESSAGE NAMES A REACHABLE ALTERNATIVE. A rule with no way past
infrastructure/migrations\075_fleet_registration.sql-135-        -- it is a wall, and the person in front of it files a bug rather than
infrastructure/migrations\075_fleet_registration.sql-136-        -- acting.
infrastructure/migrations\075_fleet_registration.sql-137-        RAISE EXCEPTION 'this account already belongs to an organisation. Sign in with a different account to register a fleet, or ask a 
platform administrator to add you to an existing fleet.';
infrastructure/migrations\075_fleet_registration.sql-138-    END IF;
--
infrastructure/migrations\075_fleet_registration.sql-179-    INSERT INTO identity.organization_registrations
infrastructure/migrations\075_fleet_registration.sql-180-        (tenant_id, organization_id, kind, status, submitted_by)
infrastructure/migrations\075_fleet_registration.sql-181-    VALUES (v_tenant, v_org, 'fleet', 'pending', v_user);
infrastructure/migrations\075_fleet_registration.sql-182-
infrastructure/migrations\075_fleet_registration.sql-183-    -- ── and the door closes ────────────────────────────────────────────────
infrastructure/migrations\075_fleet_registration.sql:184:    PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\075_fleet_registration.sql:185:    PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\075_fleet_registration.sql-186-
infrastructure/migrations\075_fleet_registration.sql-187-    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
infrastructure/migrations\075_fleet_registration.sql-188-END;
infrastructure/migrations\075_fleet_registration.sql-189-$$;
infrastructure/migrations\075_fleet_registration.sql-190-
--
infrastructure/migrations\075_fleet_registration.sql-293-    -- without ever showing up.
infrastructure/migrations\075_fleet_registration.sql-294-    --
infrastructure/migrations\075_fleet_registration.sql-295-    -- The three policies on `identity.organizations` are: `tenant_isolation`
infrastructure/migrations\075_fleet_registration.sql-296-    -- (needs a tenant context, and registration has none), a bootstrap policy
infrastructure/migrations\075_fleet_registration.sql-297-    -- that is INSERT-only, and `enrolment_bootstrap_select`, which admits
infrastructure/migrations\075_fleet_registration.sql:298:    -- exactly one organisation — the one named by `app.bootstrap_org`. No
infrastructure/migrations\075_fleet_registration.sql-299-    -- registration function ever set it.
infrastructure/migrations\075_fleet_registration.sql-300-    --
infrastructure/migrations\075_fleet_registration.sql-301-    -- So the existing mechanism is reused rather than a new policy invented,
infrastructure/migrations\075_fleet_registration.sql-302-    -- and it is CLEARED immediately: the caller's transaction continues after
infrastructure/migrations\075_fleet_registration.sql-303-    -- this trigger returns and must not keep a read exemption it never asked
infrastructure/migrations\075_fleet_registration.sql-304-    -- for. This fixes all three kinds, not just fleet.
infrastructure/migrations\075_fleet_registration.sql:305:    PERFORM set_config('app.bootstrap_org', NEW.organization_id::text, true);
infrastructure/migrations\075_fleet_registration.sql-306-
infrastructure/migrations\075_fleet_registration.sql-307-    SELECT o.name INTO v_org
infrastructure/migrations\075_fleet_registration.sql-308-      FROM identity.organizations o
infrastructure/migrations\075_fleet_registration.sql-309-     WHERE o.id = NEW.organization_id;
infrastructure/migrations\075_fleet_registration.sql-310-
infrastructure/migrations\075_fleet_registration.sql:311:    PERFORM set_config('app.bootstrap_org', '', true);
infrastructure/migrations\075_fleet_registration.sql-312-
infrastructure/migrations\075_fleet_registration.sql-313-    v_kind := CASE NEW.kind
infrastructure/migrations\075_fleet_registration.sql-314-                WHEN 'supplier' THEN 'parts supplier'
infrastructure/migrations\075_fleet_registration.sql-315-                WHEN 'fleet'    THEN 'fleet operator'
infrastructure/migrations\075_fleet_registration.sql-316-                WHEN 'workshop' THEN 'workshop'
--
infrastructure/migrations\074_towing.sql-357-DECLARE t text;
infrastructure/migrations\074_towing.sql-358-BEGIN
infrastructure/migrations\074_towing.sql-359-    FOREACH t IN ARRAY ARRAY['recovery_vehicles','drivers','requests','recoveries','incidents','invoices','settings']
infrastructure/migrations\074_towing.sql-360-    LOOP
infrastructure/migrations\074_towing.sql-361-        EXECUTE format('ALTER TABLE towing.%I ENABLE ROW LEVEL SECURITY', t);
infrastructure/migrations\074_towing.sql:362:        EXECUTE format('ALTER TABLE towing.%I FORCE ROW LEVEL SECURITY', t);
infrastructure/migrations\074_towing.sql-363-        EXECUTE format('GRANT SELECT, INSERT, UPDATE ON towing.%I TO autoworkshop_app', t);
infrastructure/migrations\074_towing.sql-364-
infrastructure/migrations\074_towing.sql-365-        EXECUTE format($p$
infrastructure/migrations\074_towing.sql:366:            CREATE POLICY towing_%1$s_select ON towing.%1$I FOR SELECT USING (
infrastructure/migrations\074_towing.sql-367-              identity.is_platform_admin()
infrastructure/migrations\074_towing.sql-368-              OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\074_towing.sql-369-                  AND organization_id = identity.current_organization_id()
infrastructure/migrations\074_towing.sql-370-                  AND identity.current_role_name() <> 'customer')
infrastructure/migrations\074_towing.sql-371-            )$p$, t);
infrastructure/migrations\074_towing.sql-372-
infrastructure/migrations\074_towing.sql-373-        EXECUTE format($p$
infrastructure/migrations\074_towing.sql:374:            CREATE POLICY towing_%1$s_insert ON towing.%1$I FOR INSERT WITH CHECK (
infrastructure/migrations\074_towing.sql-375-              identity.is_platform_admin()
infrastructure/migrations\074_towing.sql-376-              OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\074_towing.sql-377-                  AND organization_id = identity.current_organization_id()
infrastructure/migrations\074_towing.sql-378-                  AND identity.current_role_name() <> 'customer')
infrastructure/migrations\074_towing.sql-379-            )$p$, t);
infrastructure/migrations\074_towing.sql-380-
infrastructure/migrations\074_towing.sql-381-        -- ⚠️ RLS says WHO may write the row; the service says WHICH COLUMNS may
infrastructure/migrations\074_towing.sql-382-        -- change. A policy cannot restrict an UPDATE to particular columns —
infrastructure/migrations\074_towing.sql-383-        -- the same note 059 and 064 carry, for the same reason.
infrastructure/migrations\074_towing.sql-384-        EXECUTE format($p$
infrastructure/migrations\074_towing.sql:385:            CREATE POLICY towing_%1$s_update ON towing.%1$I FOR UPDATE USING (
infrastructure/migrations\074_towing.sql-386-              identity.is_platform_admin()
infrastructure/migrations\074_towing.sql-387-              OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\074_towing.sql-388-                  AND organization_id = identity.current_organization_id()
infrastructure/migrations\074_towing.sql-389-                  AND identity.current_role_name() <> 'customer')
infrastructure/migrations\074_towing.sql-390-            ) WITH CHECK (
--
infrastructure/migrations\rehearse\060_notifications_render_privileges.sql-22---     record_notification_result   | autoworkshop | t        | t
infrastructure/migrations\rehearse\060_notifications_render_privileges.sql-23---
infrastructure/migrations\rehearse\060_notifications_render_privileges.sql-24--- A SECURITY DEFINER function runs as its OWNER. Locally that owner holds
infrastructure/migrations\rehearse\060_notifications_render_privileges.sql-25--- BYPASSRLS, so no policy on `comms.notifications` is ever consulted and a green
infrastructure/migrations\rehearse\060_notifications_render_privileges.sql-26--- drain test proves only that nodemailer works. On Render the owner is an
infrastructure/migrations\rehearse\060_notifications_render_privileges.sql:27:-- ordinary role and the table is FORCE ROW LEVEL SECURITY — the one setting that
infrastructure/migrations\rehearse\060_notifications_render_privileges.sql-28--- stops even the owner being exempt — so the policies bind and the drain is
infrastructure/migrations\rehearse\060_notifications_render_privileges.sql-29--- subject to every one of them.
infrastructure/migrations\rehearse\060_notifications_render_privileges.sql-30---
infrastructure/migrations\rehearse\060_notifications_render_privileges.sql-31--- verify/060 is honest about this: its checks 4 and 11 RAISE NOTICE locally and
infrastructure/migrations\rehearse\060_notifications_render_privileges.sql-32--- are counted only under `Rehearse Migration On Live`. That is correct, but it
--
infrastructure/migrations\rehearse\060_notifications_render_privileges.sql-203-    -- fixture enqueued TO the same user it set as the caller.
infrastructure/migrations\rehearse\060_notifications_render_privileges.sql-204-    -- ══════════════════════════════════════════════════════════════════════
infrastructure/migrations\rehearse\060_notifications_render_privileges.sql-205-    PERFORM set_config('app.tenant_id', '', true);
infrastructure/migrations\rehearse\060_notifications_render_privileges.sql-206-    PERFORM set_config('app.user_id', '', true);
infrastructure/migrations\rehearse\060_notifications_render_privileges.sql-207-    PERFORM set_config('app.organization_ids', '', true);
infrastructure/migrations\rehearse\060_notifications_render_privileges.sql:208:    PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\rehearse\060_notifications_render_privileges.sql-209-
infrastructure/migrations\rehearse\060_notifications_render_privileges.sql-210-    -- 🔴 THE CALLER IS THE APP ROLE, NOT THE OWNER. That is Render exactly: the
infrastructure/migrations\rehearse\060_notifications_render_privileges.sql-211-    -- API connects as `autoworkshop_app`, and the definer functions it calls run
infrastructure/migrations\rehearse\060_notifications_render_privileges.sql-212-    -- as their owner (`aw_render_sim` here). Acting as the owner instead would
infrastructure/migrations\rehearse\060_notifications_render_privileges.sql-213-    -- quietly test a caller the product does not have.
--
infrastructure/migrations\073_relationships.sql-55--- the row be written.
infrastructure/migrations\073_relationships.sql-56---
infrastructure/migrations\073_relationships.sql-57--- ── 🔴 WHY A PLAIN `REFERENCES repair.job_cards(id)` WOULD ALSO BE WRONG ───
infrastructure/migrations\073_relationships.sql-58---
infrastructure/migrations\073_relationships.sql-59--- REFERENTIAL INTEGRITY CHECKS BYPASS ROW LEVEL SECURITY — PostgreSQL
infrastructure/migrations\073_relationships.sql:60:-- documents it (CREATE POLICY, "Notes") and FORCE RLS does not change it. A
infrastructure/migrations\073_relationships.sql-61--- single-column key would accept another workshop's id with no policy
infrastructure/migrations\073_relationships.sql-62--- consulted: it closes "points at nothing" and leaves "points at someone
infrastructure/migrations\073_relationships.sql-63--- else's" wide open, while looking in a diff like the problem was solved.
infrastructure/migrations\073_relationships.sql-64---
infrastructure/migrations\073_relationships.sql-65--- Every key below is scoped to the composite its parent publishes:
--
infrastructure/migrations\073_relationships.sql-172---
infrastructure/migrations\073_relationships.sql-173--- 🔴 THIS BLOCK IS THE ONE THAT ALMOST SHIPPED INERT, AND IT IS WORTH READING.
infrastructure/migrations\073_relationships.sql-174---
infrastructure/migrations\073_relationships.sql-175--- The first draft simply counted orphans. On THIS laptop that works, because
infrastructure/migrations\073_relationships.sql-176--- the migration role is a superuser. On Render it is not, and every one of
infrastructure/migrations\073_relationships.sql:177:-- these eighteen tables is ENABLE + FORCE ROW LEVEL SECURITY with
infrastructure/migrations\073_relationships.sql-178---
infrastructure/migrations\073_relationships.sql-179---     USING (identity.is_platform_admin() OR tenant_id = current_tenant_id())
infrastructure/migrations\073_relationships.sql-180---
infrastructure/migrations\073_relationships.sql-181--- `run.sh` sets no `app.*` settings, so `current_tenant_id()` is NULL and
infrastructure/migrations\073_relationships.sql-182--- `is_platform_admin()` is false. Measured, as `autoworkshop_app`:
--
infrastructure/migrations\073_relationships.sql-191--- RLS. The migration would abort with a bare constraint name: exactly the
infrastructure/migrations\073_relationships.sql-192--- outcome this block exists to prevent. The Supervisor found it.
infrastructure/migrations\073_relationships.sql-193---
infrastructure/migrations\073_relationships.sql-194--- The escape is the one every policy here already carries. Both the permissive
infrastructure/migrations\073_relationships.sql-195--- and the RESTRICTIVE (054) policies read `is_platform_admin() OR ...`, and
infrastructure/migrations\073_relationships.sql:196:-- `is_platform_admin()` is `current_role_name() IN ('admin',
infrastructure/migrations\073_relationships.sql-197--- 'platform_administrator')`. Measured again with it set: 0 → 6.
infrastructure/migrations\073_relationships.sql-198---
infrastructure/migrations\073_relationships.sql-199--- ⚠️ AND THE ESCAPE IS ASSERTED, NOT ASSUMED. If a future policy drops the
infrastructure/migrations\073_relationships.sql-200--- admin clause this block must FAIL LOUDLY, not quietly return to counting
infrastructure/migrations\073_relationships.sql-201--- zero over an invisible table.
--
infrastructure/migrations\073_relationships.sql-207-    report     text := '';
infrastructure/migrations\073_relationships.sql-208-    offenders  int := 0;
infrastructure/migrations\073_relationships.sql-209-    checked    int := 0;
infrastructure/migrations\073_relationships.sql-210-    populated  int := 0;
infrastructure/migrations\073_relationships.sql-211-BEGIN
infrastructure/migrations\073_relationships.sql:212:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\073_relationships.sql-213-
infrastructure/migrations\073_relationships.sql-214-    IF NOT identity.is_platform_admin() THEN
infrastructure/migrations\073_relationships.sql-215-        RAISE EXCEPTION
infrastructure/migrations\073_relationships.sql-216-            '073: cannot see the rows it is about to constrain. Every table '
infrastructure/migrations\073_relationships.sql-217-            'here is FORCE RLS and the migration role does not bypass it, so '
infrastructure/migrations\073_relationships.sql-218-            'without the platform-admin escape this check would report a '
infrastructure/migrations\073_relationships.sql:219:            'confident zero over invisible rows. Setting app.current_role did '
infrastructure/migrations\073_relationships.sql-220-            'not make is_platform_admin() true — a policy or that function has '
infrastructure/migrations\073_relationships.sql-221-            'changed and this block must be rewritten, not skipped.';
infrastructure/migrations\073_relationships.sql-222-    END IF;
infrastructure/migrations\073_relationships.sql-223-
infrastructure/migrations\073_relationships.sql-224-    FOR r IN
--
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-107-    -- ALL five doors. `_xact_`, so it is released when the transaction ends
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-108-    -- including on the exception paths below.
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-109-    PERFORM pg_advisory_xact_lock(hashtextextended('identity.register:' || v_user::text, 0));
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-110-
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-111-    -- ── the door opens here, and only here ─────────────────────────────────
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:112:    PERFORM set_config('app.bootstrap',      'on',         true);
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:113:    PERFORM set_config('app.bootstrap_user', v_user::text, true);
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-114-
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-115-    -- One organisation per person. AFTER the flag is set AND after the lock:
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-116-    -- under FORCE RLS with no tenant context this read returns zero rows for
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-117-    -- everybody, so placing it earlier would make it a check that cannot fire.
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-118-    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-119-                WHERE user_id = v_user AND status = 'active') THEN
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:120:        PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:121:        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-122-        RAISE EXCEPTION 'this account already belongs to an organisation. Sign in with a different account to register an 
insurance company, or ask a platform administrator to add you to an existing one.';
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-123-    END IF;
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-124-
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-125-    v_slug := regexp_replace(lower(btrim(p_insurer_name)), '[^a-z0-9]+', '-', 'g');
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-126-    v_slug := btrim(v_slug, '-');
--
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-168-    INSERT INTO identity.organization_registrations
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-169-        (tenant_id, organization_id, kind, status, submitted_by)
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-170-    VALUES (v_tenant, v_org, 'insurance', 'pending', v_user);
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-171-
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-172-    -- ── and the door closes ────────────────────────────────────────────────
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:173:    PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:174:    PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-175-
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-176-    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-177-END;
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-178-$$;
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-179-
--
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-227-    END IF;
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-228-
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-229-    -- Same per-identity lock as the other four doors. See `register_insurer`.
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-230-    PERFORM pg_advisory_xact_lock(hashtextextended('identity.register:' || v_user::text, 0));
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-231-
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:232:    PERFORM set_config('app.bootstrap',      'on',         true);
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:233:    PERFORM set_config('app.bootstrap_user', v_user::text, true);
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-234-
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-235-    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-236-                WHERE user_id = v_user AND status = 'active') THEN
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:237:        PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:238:        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-239-        RAISE EXCEPTION 'this account already belongs to an organisation. Sign in with a different account to register a 
towing company, or ask a platform administrator to add you to an existing one.';
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-240-    END IF;
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-241-
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-242-    v_slug := regexp_replace(lower(btrim(p_company_name)), '[^a-z0-9]+', '-', 'g');
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-243-    v_slug := btrim(v_slug, '-');
--
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-271-
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-272-    INSERT INTO identity.organization_registrations
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-273-        (tenant_id, organization_id, kind, status, submitted_by)
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-274-    VALUES (v_tenant, v_org, 'towing', 'pending', v_user);
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-275-
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:276:    PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:277:    PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-278-
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-279-    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-280-END;
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-281-$$;
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-282-
--
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-341---
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-342--- ⚠️ AND IT MUST BE ABLE TO SEE THE ROWS. This migration runs as the owner
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-343--- credential; under FORCE RLS a check with no tenant context reads zero rows
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-344--- and "passes" vacuously — the failure mode recorded on 2026-08-16, where a
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-345--- diagnostic reported `(0 rows)` because its `set_config` was transaction-local
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:346:-- and had already been discarded. `app.current_role` is set LOCAL here, which
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-347--- is correct precisely because this IS one transaction.
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-348-DO $$
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-349-DECLARE
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-350-    v_stranded INT;
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-351-BEGIN
infrastructure/migrations\085_insurance_and_towing_org_admin.sql:352:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-353-
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-354-    -- An insurance or towing organisation with NO member who can grant is the
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-355-    -- exact condition this migration exists to remove. If any remain, the
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-356-    -- backfill's founder rule did not match reality and we must not ship.
infrastructure/migrations\085_insurance_and_towing_org_admin.sql-357-    SELECT count(*) INTO v_stranded
--
infrastructure/migrations\072_registration_defects_from_supervisor.sql-141--- ═══════════════════════════════════════════════════════════════════════════
infrastructure/migrations\072_registration_defects_from_supervisor.sql-142-
infrastructure/migrations\072_registration_defects_from_supervisor.sql-143--- The registration functions must be able to write both rows. Same door, same
infrastructure/migrations\072_registration_defects_from_supervisor.sql-144--- reasoning, as 069 and 071: `in_registration_bootstrap()`, never the raw flag.
infrastructure/migrations\072_registration_defects_from_supervisor.sql-145-DROP POLICY IF EXISTS registration_bootstrap_directory_insert ON catalogue.mechanic_directory;
infrastructure/migrations\072_registration_defects_from_supervisor.sql:146:CREATE POLICY registration_bootstrap_directory_insert ON catalogue.mechanic_directory FOR INSERT
infrastructure/migrations\072_registration_defects_from_supervisor.sql-147-  WITH CHECK (
infrastructure/migrations\072_registration_defects_from_supervisor.sql-148-    identity.in_registration_bootstrap()
infrastructure/migrations\072_registration_defects_from_supervisor.sql-149-    -- 🔴 UNPUBLISHED ONLY. Without this the bootstrap door could publish a
infrastructure/migrations\072_registration_defects_from_supervisor.sql-150-    -- listing directly and skip the queue — the same clause 071 puts on
infrastructure/migrations\072_registration_defects_from_supervisor.sql-151-    -- `catalogue.suppliers`, and the same shape as 064's `lead_insert` pinning
infrastructure/migrations\072_registration_defects_from_supervisor.sql-152-    -- a new lead to `status = 'new'`.
infrastructure/migrations\072_registration_defects_from_supervisor.sql-153-    AND is_published = FALSE
infrastructure/migrations\072_registration_defects_from_supervisor.sql-154-  );
infrastructure/migrations\072_registration_defects_from_supervisor.sql-155-
infrastructure/migrations\072_registration_defects_from_supervisor.sql-156-DROP POLICY IF EXISTS registration_bootstrap_supplier_user_insert ON catalogue.supplier_users;
infrastructure/migrations\072_registration_defects_from_supervisor.sql:157:CREATE POLICY registration_bootstrap_supplier_user_insert ON catalogue.supplier_users FOR INSERT
infrastructure/migrations\072_registration_defects_from_supervisor.sql-158-  WITH CHECK (identity.in_registration_bootstrap());
infrastructure/migrations\072_registration_defects_from_supervisor.sql-159-
infrastructure/migrations\072_registration_defects_from_supervisor.sql-160--- `catalogue.supplier_users` may not have had RLS enabled with an INSERT arm
infrastructure/migrations\072_registration_defects_from_supervisor.sql-161--- for this path; make sure the grant exists either way.
infrastructure/migrations\072_registration_defects_from_supervisor.sql-162-GRANT SELECT, INSERT, UPDATE ON catalogue.supplier_users TO autoworkshop_app;
--
infrastructure/migrations\072_registration_defects_from_supervisor.sql-199-        RAISE EXCEPTION 'no active application user for this identity';
infrastructure/migrations\072_registration_defects_from_supervisor.sql-200-    END IF;
infrastructure/migrations\072_registration_defects_from_supervisor.sql-201-
infrastructure/migrations\072_registration_defects_from_supervisor.sql-202-    PERFORM pg_advisory_xact_lock(hashtextextended('identity.register:' || v_user::text, 0));
infrastructure/migrations\072_registration_defects_from_supervisor.sql-203-
infrastructure/migrations\072_registration_defects_from_supervisor.sql:204:    PERFORM set_config('app.bootstrap',      'on',         true);
infrastructure/migrations\072_registration_defects_from_supervisor.sql:205:    PERFORM set_config('app.bootstrap_user', v_user::text, true);
infrastructure/migrations\072_registration_defects_from_supervisor.sql-206-
infrastructure/migrations\072_registration_defects_from_supervisor.sql-207-    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\072_registration_defects_from_supervisor.sql-208-                WHERE user_id = v_user AND status = 'active') THEN
infrastructure/migrations\072_registration_defects_from_supervisor.sql:209:        PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\072_registration_defects_from_supervisor.sql:210:        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\072_registration_defects_from_supervisor.sql-211-        RAISE EXCEPTION 'this account already belongs to an organisation. Sign in with a different account to register a 
supplier, or ask a platform administrator to add you to an existing supplier.';
infrastructure/migrations\072_registration_defects_from_supervisor.sql-212-    END IF;
infrastructure/migrations\072_registration_defects_from_supervisor.sql-213-
infrastructure/migrations\072_registration_defects_from_supervisor.sql-214-    v_slug := regexp_replace(lower(btrim(p_supplier_name)), '[^a-z0-9]+', '-', 'g');
infrastructure/migrations\072_registration_defects_from_supervisor.sql-215-    v_slug := btrim(v_slug, '-');
--
infrastructure/migrations\072_registration_defects_from_supervisor.sql-251-
infrastructure/migrations\072_registration_defects_from_supervisor.sql-252-    INSERT INTO identity.organization_registrations
infrastructure/migrations\072_registration_defects_from_supervisor.sql-253-        (tenant_id, organization_id, kind, status, submitted_by)
infrastructure/migrations\072_registration_defects_from_supervisor.sql-254-    VALUES (v_tenant, v_org, 'supplier', 'pending', v_user);
infrastructure/migrations\072_registration_defects_from_supervisor.sql-255-
infrastructure/migrations\072_registration_defects_from_supervisor.sql:256:    PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\072_registration_defects_from_supervisor.sql:257:    PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\072_registration_defects_from_supervisor.sql-258-
infrastructure/migrations\072_registration_defects_from_supervisor.sql-259-    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
infrastructure/migrations\072_registration_defects_from_supervisor.sql-260-END;
infrastructure/migrations\072_registration_defects_from_supervisor.sql-261-$$;
infrastructure/migrations\072_registration_defects_from_supervisor.sql-262-
--
infrastructure/migrations\072_registration_defects_from_supervisor.sql-296-        RAISE EXCEPTION 'no active application user for this identity';
infrastructure/migrations\072_registration_defects_from_supervisor.sql-297-    END IF;
infrastructure/migrations\072_registration_defects_from_supervisor.sql-298-
infrastructure/migrations\072_registration_defects_from_supervisor.sql-299-    PERFORM pg_advisory_xact_lock(hashtextextended('identity.register:' || v_user::text, 0));
infrastructure/migrations\072_registration_defects_from_supervisor.sql-300-
infrastructure/migrations\072_registration_defects_from_supervisor.sql:301:    PERFORM set_config('app.bootstrap',      'on',          true);
infrastructure/migrations\072_registration_defects_from_supervisor.sql:302:    PERFORM set_config('app.bootstrap_user', v_user::text,  true);
infrastructure/migrations\072_registration_defects_from_supervisor.sql-303-
infrastructure/migrations\072_registration_defects_from_supervisor.sql-304-    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\072_registration_defects_from_supervisor.sql-305-                WHERE user_id = v_user AND status = 'active') THEN
infrastructure/migrations\072_registration_defects_from_supervisor.sql:306:        PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\072_registration_defects_from_supervisor.sql:307:        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\072_registration_defects_from_supervisor.sql-308-        RAISE EXCEPTION 'this account already belongs to an organisation';
infrastructure/migrations\072_registration_defects_from_supervisor.sql-309-    END IF;
infrastructure/migrations\072_registration_defects_from_supervisor.sql-310-
infrastructure/migrations\072_registration_defects_from_supervisor.sql-311-    v_slug := regexp_replace(lower(btrim(p_workshop_name)), '[^a-z0-9]+', '-', 'g');
infrastructure/migrations\072_registration_defects_from_supervisor.sql-312-    v_slug := btrim(v_slug, '-');
--
infrastructure/migrations\072_registration_defects_from_supervisor.sql-345-
infrastructure/migrations\072_registration_defects_from_supervisor.sql-346-    INSERT INTO identity.organization_registrations
infrastructure/migrations\072_registration_defects_from_supervisor.sql-347-        (tenant_id, organization_id, kind, status, submitted_by)
infrastructure/migrations\072_registration_defects_from_supervisor.sql-348-    VALUES (v_tenant, v_org, 'workshop', 'pending', v_user);
infrastructure/migrations\072_registration_defects_from_supervisor.sql-349-
infrastructure/migrations\072_registration_defects_from_supervisor.sql:350:    PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\072_registration_defects_from_supervisor.sql:351:    PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\072_registration_defects_from_supervisor.sql-352-
infrastructure/migrations\072_registration_defects_from_supervisor.sql-353-    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
infrastructure/migrations\072_registration_defects_from_supervisor.sql-354-END;
infrastructure/migrations\072_registration_defects_from_supervisor.sql-355-$$;
infrastructure/migrations\072_registration_defects_from_supervisor.sql-356-
--
infrastructure/migrations\084_insurance_public_insurer_name.sql-56--- The first attempt failed on production with
infrastructure/migrations\084_insurance_public_insurer_name.sql-57---
infrastructure/migrations\084_insurance_public_insurer_name.sql-58---     ERROR: column "insurer_name" of relation "products" contains null values
infrastructure/migrations\084_insurance_public_insurer_name.sql-59---
infrastructure/migrations\084_insurance_public_insurer_name.sql-60--- because the backfill below joins `identity.organizations`, which is under
infrastructure/migrations\084_insurance_public_insurer_name.sql:61:-- FORCE ROW LEVEL SECURITY. A migration runs as the OWNER, and on Render the
infrastructure/migrations\084_insurance_public_insurer_name.sql-62--- owner is NOT a superuser, so with no tenant context that join matched ZERO
infrastructure/migrations\084_insurance_public_insurer_name.sql-63--- rows — the UPDATE silently did nothing and `SET NOT NULL` then refused.
infrastructure/migrations\084_insurance_public_insurer_name.sql-64---
infrastructure/migrations\084_insurance_public_insurer_name.sql-65--- LOCALLY it worked, because the local `autoworkshop` role IS a superuser and
infrastructure/migrations\084_insurance_public_insurer_name.sql-66--- bypasses RLS. That is the THIRD time in one day this difference has produced
infrastructure/migrations\084_insurance_public_insurer_name.sql-67--- a green local result and a red production one:
infrastructure/migrations\084_insurance_public_insurer_name.sql-68---   · the backup's pg_dump refused by FORCE RLS
infrastructure/migrations\084_insurance_public_insurer_name.sql-69---   · the public listing's join to organizations returning nothing
infrastructure/migrations\084_insurance_public_insurer_name.sql-70---   · this
infrastructure/migrations\084_insurance_public_insurer_name.sql-71---
infrastructure/migrations\084_insurance_public_insurer_name.sql:72:-- `app.current_role = 'admin'` paired with the owner's `current_user` is the
infrastructure/migrations\084_insurance_public_insurer_name.sql-73--- escape `identity.is_platform_admin()` defines, and it is what every seed
infrastructure/migrations\084_insurance_public_insurer_name.sql-74--- script in this repository already sets for exactly this reason. Transaction-
infrastructure/migrations\084_insurance_public_insurer_name.sql-75--- local, so it cannot leak past COMMIT.
infrastructure/migrations\084_insurance_public_insurer_name.sql-76--- ══════════════════════════════════════════════════════════════════════════
infrastructure/migrations\084_insurance_public_insurer_name.sql:77:SELECT set_config('app.current_role', 'admin', true);
infrastructure/migrations\084_insurance_public_insurer_name.sql-78-
infrastructure/migrations\084_insurance_public_insurer_name.sql-79-ALTER TABLE insurance.products ADD COLUMN insurer_name TEXT;
infrastructure/migrations\084_insurance_public_insurer_name.sql-80-
infrastructure/migrations\084_insurance_public_insurer_name.sql-81--- Backfill under the platform escape, which this migration runs with.
infrastructure/migrations\084_insurance_public_insurer_name.sql-82-UPDATE insurance.products p
--
infrastructure/migrations\071_registration_defects_from_codex.sql-20---     -----------------+----------+-------------
infrastructure/migrations\071_registration_defects_from_codex.sql-21---     autoworkshop     | t        | t            <- the function's owner, LOCALLY
infrastructure/migrations\071_registration_defects_from_codex.sql-22---     autoworkshop_app | f        | f
infrastructure/migrations\071_registration_defects_from_codex.sql-23---
infrastructure/migrations\071_registration_defects_from_codex.sql-24--- and then the trigger's exact query, with the settings a registration really
infrastructure/migrations\071_registration_defects_from_codex.sql:25:-- carries (`app.bootstrap='on'`, `app.bootstrap_user=<registrant>`):
infrastructure/migrations\071_registration_defects_from_codex.sql-26---
infrastructure/migrations\071_registration_defects_from_codex.sql-27---     as the local owner (superuser, bypasses RLS) : 2 administrators visible
infrastructure/migrations\071_registration_defects_from_codex.sql-28---     as a NOBYPASSRLS role (what Render is)       : 0 administrators visible
infrastructure/migrations\071_registration_defects_from_codex.sql-29---
infrastructure/migrations\071_registration_defects_from_codex.sql-30--- So on Render the alert writes NOTHING and raises only its non-fatal notice.
--
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
--
infrastructure/migrations\071_registration_defects_from_codex.sql-208-
infrastructure/migrations\071_registration_defects_from_codex.sql-209--- The registration functions must be able to write that row. Same door, same
infrastructure/migrations\071_registration_defects_from_codex.sql-210--- reasoning, as 069's INSERT policy: `in_registration_bootstrap()`, never the
infrastructure/migrations\071_registration_defects_from_codex.sql-211--- raw flag.
infrastructure/migrations\071_registration_defects_from_codex.sql-212-DROP POLICY IF EXISTS registration_bootstrap_supplier_insert ON catalogue.suppliers;
infrastructure/migrations\071_registration_defects_from_codex.sql:213:CREATE POLICY registration_bootstrap_supplier_insert ON catalogue.suppliers FOR INSERT
infrastructure/migrations\071_registration_defects_from_codex.sql-214-  WITH CHECK (
infrastructure/migrations\071_registration_defects_from_codex.sql-215-    identity.in_registration_bootstrap()
infrastructure/migrations\071_registration_defects_from_codex.sql-216-    -- 🔴 AND IT MAY ONLY CREATE AN UNPUBLISHED, UNVERIFIED ROW. Without these
infrastructure/migrations\071_registration_defects_from_codex.sql-217-    -- two clauses the bootstrap door could publish a listing directly and skip
infrastructure/migrations\071_registration_defects_from_codex.sql-218-    -- the entire verification queue this work exists to build. The same shape
--
infrastructure/migrations\071_registration_defects_from_codex.sql-281-    END IF;
infrastructure/migrations\071_registration_defects_from_codex.sql-282-
infrastructure/migrations\071_registration_defects_from_codex.sql-283-    -- FINDING 1 — serialise this identity's registrations before reading.
infrastructure/migrations\071_registration_defects_from_codex.sql-284-    PERFORM pg_advisory_xact_lock(hashtextextended('identity.register:' || v_user::text, 0));
infrastructure/migrations\071_registration_defects_from_codex.sql-285-
infrastructure/migrations\071_registration_defects_from_codex.sql:286:    PERFORM set_config('app.bootstrap',      'on',          true);
infrastructure/migrations\071_registration_defects_from_codex.sql:287:    PERFORM set_config('app.bootstrap_user', v_user::text,  true);
infrastructure/migrations\071_registration_defects_from_codex.sql-288-
infrastructure/migrations\071_registration_defects_from_codex.sql-289-    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\071_registration_defects_from_codex.sql-290-                WHERE user_id = v_user AND status = 'active') THEN
infrastructure/migrations\071_registration_defects_from_codex.sql:291:        PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\071_registration_defects_from_codex.sql:292:        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\071_registration_defects_from_codex.sql-293-        RAISE EXCEPTION 'this account already belongs to an organisation';
infrastructure/migrations\071_registration_defects_from_codex.sql-294-    END IF;
infrastructure/migrations\071_registration_defects_from_codex.sql-295-
infrastructure/migrations\071_registration_defects_from_codex.sql-296-    v_slug := regexp_replace(lower(btrim(p_workshop_name)), '[^a-z0-9]+', '-', 'g');
infrastructure/migrations\071_registration_defects_from_codex.sql-297-    v_slug := btrim(v_slug, '-');
--
infrastructure/migrations\071_registration_defects_from_codex.sql-322-
infrastructure/migrations\071_registration_defects_from_codex.sql-323-    INSERT INTO identity.organization_registrations
infrastructure/migrations\071_registration_defects_from_codex.sql-324-        (tenant_id, organization_id, kind, status, submitted_by)
infrastructure/migrations\071_registration_defects_from_codex.sql-325-    VALUES (v_tenant, v_org, 'workshop', 'pending', v_user);
infrastructure/migrations\071_registration_defects_from_codex.sql-326-
infrastructure/migrations\071_registration_defects_from_codex.sql:327:    PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\071_registration_defects_from_codex.sql:328:    PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\071_registration_defects_from_codex.sql-329-
infrastructure/migrations\071_registration_defects_from_codex.sql-330-    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
infrastructure/migrations\071_registration_defects_from_codex.sql-331-END;
infrastructure/migrations\071_registration_defects_from_codex.sql-332-$$;
infrastructure/migrations\071_registration_defects_from_codex.sql-333-
--
infrastructure/migrations\071_registration_defects_from_codex.sql-368-    END IF;
infrastructure/migrations\071_registration_defects_from_codex.sql-369-
infrastructure/migrations\071_registration_defects_from_codex.sql-370-    -- FINDING 1 — serialise this identity's registrations before reading.
infrastructure/migrations\071_registration_defects_from_codex.sql-371-    PERFORM pg_advisory_xact_lock(hashtextextended('identity.register:' || v_user::text, 0));
infrastructure/migrations\071_registration_defects_from_codex.sql-372-
infrastructure/migrations\071_registration_defects_from_codex.sql:373:    PERFORM set_config('app.bootstrap',      'on',         true);
infrastructure/migrations\071_registration_defects_from_codex.sql:374:    PERFORM set_config('app.bootstrap_user', v_user::text, true);
infrastructure/migrations\071_registration_defects_from_codex.sql-375-
infrastructure/migrations\071_registration_defects_from_codex.sql-376-    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\071_registration_defects_from_codex.sql-377-                WHERE user_id = v_user AND status = 'active') THEN
infrastructure/migrations\071_registration_defects_from_codex.sql:378:        PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\071_registration_defects_from_codex.sql:379:        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\071_registration_defects_from_codex.sql-380-        RAISE EXCEPTION 'this account already belongs to an organisation. Sign in with a different account to register a 
supplier, or ask a platform administrator to add you to an existing supplier.';
infrastructure/migrations\071_registration_defects_from_codex.sql-381-    END IF;
infrastructure/migrations\071_registration_defects_from_codex.sql-382-
infrastructure/migrations\071_registration_defects_from_codex.sql-383-    v_slug := regexp_replace(lower(btrim(p_supplier_name)), '[^a-z0-9]+', '-', 'g');
infrastructure/migrations\071_registration_defects_from_codex.sql-384-    v_slug := btrim(v_slug, '-');
--
infrastructure/migrations\071_registration_defects_from_codex.sql-426-
infrastructure/migrations\071_registration_defects_from_codex.sql-427-    INSERT INTO identity.organization_registrations
infrastructure/migrations\071_registration_defects_from_codex.sql-428-        (tenant_id, organization_id, kind, status, submitted_by)
infrastructure/migrations\071_registration_defects_from_codex.sql-429-    VALUES (v_tenant, v_org, 'supplier', 'pending', v_user);
infrastructure/migrations\071_registration_defects_from_codex.sql-430-
infrastructure/migrations\071_registration_defects_from_codex.sql:431:    PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\071_registration_defects_from_codex.sql:432:    PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\071_registration_defects_from_codex.sql-433-
infrastructure/migrations\071_registration_defects_from_codex.sql-434-    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
infrastructure/migrations\071_registration_defects_from_codex.sql-435-END;
infrastructure/migrations\071_registration_defects_from_codex.sql-436-$$;
infrastructure/migrations\071_registration_defects_from_codex.sql-437-
--
infrastructure/migrations\071_registration_defects_from_codex.sql-481-        GRANT SELECT ON ALL TABLES IN SCHEMA identity TO migration_071_norls;
infrastructure/migrations\071_registration_defects_from_codex.sql-482-        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA identity TO migration_071_norls;
infrastructure/migrations\071_registration_defects_from_codex.sql-483-
infrastructure/migrations\071_registration_defects_from_codex.sql-484-        -- The exact conditions inside the trigger: the bootstrap door open for
infrastructure/migrations\071_registration_defects_from_codex.sql-485-        -- some registrant, and the admin-lookup flag on.
infrastructure/migrations\071_registration_defects_from_codex.sql:486:        PERFORM set_config('app.bootstrap', 'on', true);
infrastructure/migrations\071_registration_defects_from_codex.sql-487-        PERFORM set_config('app.admin_lookup', 'on', true);
infrastructure/migrations\071_registration_defects_from_codex.sql-488-
infrastructure/migrations\071_registration_defects_from_codex.sql-489-        SET LOCAL ROLE migration_071_norls;
infrastructure/migrations\071_registration_defects_from_codex.sql-490-        SELECT count(*) INTO v_admins FROM identity.memberships
infrastructure/migrations\071_registration_defects_from_codex.sql-491-         WHERE role_name = 'platform_administrator' AND status = 'active';
infrastructure/migrations\071_registration_defects_from_codex.sql-492-        RESET ROLE;
infrastructure/migrations\071_registration_defects_from_codex.sql-493-
infrastructure/migrations\071_registration_defects_from_codex.sql:494:        PERFORM set_config('app.bootstrap', '', true);
infrastructure/migrations\071_registration_defects_from_codex.sql-495-        PERFORM set_config('app.admin_lookup', '', true);
infrastructure/migrations\071_registration_defects_from_codex.sql-496-
infrastructure/migrations\071_registration_defects_from_codex.sql-497-        -- ⚠️ `DROP OWNED BY` FIRST, OR THE DROP FAILS AND TAKES THE MIGRATION
infrastructure/migrations\071_registration_defects_from_codex.sql-498-        -- WITH IT. A role cannot be dropped while any grant still references
infrastructure/migrations\071_registration_defects_from_codex.sql-499-        -- it, and this one was just granted SELECT on every table and EXECUTE
--
infrastructure/migrations\083_insurance_public_read.sql-57--- ⚠️ PERMISSIVE, AND ADDITIVE. Postgres ORs permissive policies together, so
infrastructure/migrations\083_insurance_public_read.sql-58--- this widens the table by exactly the published-and-verified set and changes
infrastructure/migrations\083_insurance_public_read.sql-59--- nothing else. `products_tenant_isolation` still governs everything an
infrastructure/migrations\083_insurance_public_read.sql-60--- insurer does with its own drafts, and this policy is SELECT-only — it grants
infrastructure/migrations\083_insurance_public_read.sql-61--- no write of any kind.
infrastructure/migrations\083_insurance_public_read.sql:62:CREATE POLICY products_public_read ON insurance.products
infrastructure/migrations\083_insurance_public_read.sql-63-    FOR SELECT
infrastructure/migrations\083_insurance_public_read.sql-64-    USING (is_published AND is_verified);
infrastructure/migrations\083_insurance_public_read.sql-65-
infrastructure/migrations\083_insurance_public_read.sql-66-COMMENT ON POLICY products_public_read ON insurance.products IS
infrastructure/migrations\083_insurance_public_read.sql-67-'The marketplace listing. Only published AND verified products, read-only. '
--
infrastructure/migrations\080_insurance_and_towing_registration.sql-159-
infrastructure/migrations\080_insurance_and_towing_registration.sql-160-    -- ── the door opens here, and only here ─────────────────────────────────
infrastructure/migrations\080_insurance_and_towing_registration.sql-161-    -- Transaction-local, so a pooled connection cannot carry the flag into the
infrastructure/migrations\080_insurance_and_towing_registration.sql-162-    -- next request even on an abort. Cleared explicitly as well, because the
infrastructure/migrations\080_insurance_and_towing_registration.sql-163-    -- SUCCESS path leaves the caller's transaction open.
infrastructure/migrations\080_insurance_and_towing_registration.sql:164:    PERFORM set_config('app.bootstrap',      'on',         true);
infrastructure/migrations\080_insurance_and_towing_registration.sql:165:    PERFORM set_config('app.bootstrap_user', v_user::text, true);
infrastructure/migrations\080_insurance_and_towing_registration.sql-166-
infrastructure/migrations\080_insurance_and_towing_registration.sql-167-    -- One organisation per person. AFTER the flag is set AND after the lock:
infrastructure/migrations\080_insurance_and_towing_registration.sql-168-    -- under FORCE RLS with no tenant context this read returns zero rows for
infrastructure/migrations\080_insurance_and_towing_registration.sql-169-    -- everybody, so placing it earlier would make it a check that cannot fire —
infrastructure/migrations\080_insurance_and_towing_registration.sql-170-    -- the bug 037 fixed in `register_workshop`.
infrastructure/migrations\080_insurance_and_towing_registration.sql-171-    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\080_insurance_and_towing_registration.sql-172-                WHERE user_id = v_user AND status = 'active') THEN
infrastructure/migrations\080_insurance_and_towing_registration.sql:173:        PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\080_insurance_and_towing_registration.sql:174:        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\080_insurance_and_towing_registration.sql-175-        -- ⚠️ THE MESSAGE NAMES A REACHABLE ALTERNATIVE. A rule with no way past
infrastructure/migrations\080_insurance_and_towing_registration.sql-176-        -- it is a wall, and the person in front of it files a bug rather than
infrastructure/migrations\080_insurance_and_towing_registration.sql-177-        -- acting.
infrastructure/migrations\080_insurance_and_towing_registration.sql-178-        RAISE EXCEPTION 'this account already belongs to an organisation. Sign in with a different account to register an 
insurance company, or ask a platform administrator to add you to an existing one.';
infrastructure/migrations\080_insurance_and_towing_registration.sql-179-    END IF;
--
infrastructure/migrations\080_insurance_and_towing_registration.sql-216-    INSERT INTO identity.organization_registrations
infrastructure/migrations\080_insurance_and_towing_registration.sql-217-        (tenant_id, organization_id, kind, status, submitted_by)
infrastructure/migrations\080_insurance_and_towing_registration.sql-218-    VALUES (v_tenant, v_org, 'insurance', 'pending', v_user);
infrastructure/migrations\080_insurance_and_towing_registration.sql-219-
infrastructure/migrations\080_insurance_and_towing_registration.sql-220-    -- ── and the door closes ────────────────────────────────────────────────
infrastructure/migrations\080_insurance_and_towing_registration.sql:221:    PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\080_insurance_and_towing_registration.sql:222:    PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\080_insurance_and_towing_registration.sql-223-
infrastructure/migrations\080_insurance_and_towing_registration.sql-224-    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
infrastructure/migrations\080_insurance_and_towing_registration.sql-225-END;
infrastructure/migrations\080_insurance_and_towing_registration.sql-226-$$;
infrastructure/migrations\080_insurance_and_towing_registration.sql-227-
--
infrastructure/migrations\080_insurance_and_towing_registration.sql-279-
infrastructure/migrations\080_insurance_and_towing_registration.sql-280-    -- Same per-identity lock as the other four doors. See the note in
infrastructure/migrations\080_insurance_and_towing_registration.sql-281-    -- `register_insurer` above for why the key is the identity and not the kind.
infrastructure/migrations\080_insurance_and_towing_registration.sql-282-    PERFORM pg_advisory_xact_lock(hashtextextended('identity.register:' || v_user::text, 0));
infrastructure/migrations\080_insurance_and_towing_registration.sql-283-
infrastructure/migrations\080_insurance_and_towing_registration.sql:284:    PERFORM set_config('app.bootstrap',      'on',         true);
infrastructure/migrations\080_insurance_and_towing_registration.sql:285:    PERFORM set_config('app.bootstrap_user', v_user::text, true);
infrastructure/migrations\080_insurance_and_towing_registration.sql-286-
infrastructure/migrations\080_insurance_and_towing_registration.sql-287-    IF EXISTS (SELECT 1 FROM identity.memberships
infrastructure/migrations\080_insurance_and_towing_registration.sql-288-                WHERE user_id = v_user AND status = 'active') THEN
infrastructure/migrations\080_insurance_and_towing_registration.sql:289:        PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\080_insurance_and_towing_registration.sql:290:        PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\080_insurance_and_towing_registration.sql-291-        RAISE EXCEPTION 'this account already belongs to an organisation. Sign in with a different account to register a 
towing company, or ask a platform administrator to add you to an existing one.';
infrastructure/migrations\080_insurance_and_towing_registration.sql-292-    END IF;
infrastructure/migrations\080_insurance_and_towing_registration.sql-293-
infrastructure/migrations\080_insurance_and_towing_registration.sql-294-    v_slug := regexp_replace(lower(btrim(p_company_name)), '[^a-z0-9]+', '-', 'g');
infrastructure/migrations\080_insurance_and_towing_registration.sql-295-    v_slug := btrim(v_slug, '-');
--
infrastructure/migrations\080_insurance_and_towing_registration.sql-323-
infrastructure/migrations\080_insurance_and_towing_registration.sql-324-    INSERT INTO identity.organization_registrations
infrastructure/migrations\080_insurance_and_towing_registration.sql-325-        (tenant_id, organization_id, kind, status, submitted_by)
infrastructure/migrations\080_insurance_and_towing_registration.sql-326-    VALUES (v_tenant, v_org, 'towing', 'pending', v_user);
infrastructure/migrations\080_insurance_and_towing_registration.sql-327-
infrastructure/migrations\080_insurance_and_towing_registration.sql:328:    PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\080_insurance_and_towing_registration.sql:329:    PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\080_insurance_and_towing_registration.sql-330-
infrastructure/migrations\080_insurance_and_towing_registration.sql-331-    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
infrastructure/migrations\080_insurance_and_towing_registration.sql-332-END;
infrastructure/migrations\080_insurance_and_towing_registration.sql-333-$$;
infrastructure/migrations\080_insurance_and_towing_registration.sql-334-
--
infrastructure/migrations\080_insurance_and_towing_registration.sql-456-
infrastructure/migrations\080_insurance_and_towing_registration.sql-457-    -- 🔴 THE NAME IS UNREADABLE WITHOUT OPENING A DOOR (075's finding). The
infrastructure/migrations\080_insurance_and_towing_registration.sql-458-    -- three policies on `identity.organizations` are `tenant_isolation` (needs
infrastructure/migrations\080_insurance_and_towing_registration.sql-459-    -- a tenant context, and registration has none), a bootstrap policy that is
infrastructure/migrations\080_insurance_and_towing_registration.sql-460-    -- INSERT-only, and `enrolment_bootstrap_select`, which admits exactly the
infrastructure/migrations\080_insurance_and_towing_registration.sql:461:    -- organisation named by `app.bootstrap_org`. Cleared immediately: the
infrastructure/migrations\080_insurance_and_towing_registration.sql-462-    -- caller's transaction continues after this trigger returns and must not
infrastructure/migrations\080_insurance_and_towing_registration.sql-463-    -- keep a read exemption it never asked for.
infrastructure/migrations\080_insurance_and_towing_registration.sql:464:    PERFORM set_config('app.bootstrap_org', NEW.organization_id::text, true);
infrastructure/migrations\080_insurance_and_towing_registration.sql-465-
infrastructure/migrations\080_insurance_and_towing_registration.sql-466-    SELECT o.name INTO v_org
infrastructure/migrations\080_insurance_and_towing_registration.sql-467-      FROM identity.organizations o
infrastructure/migrations\080_insurance_and_towing_registration.sql-468-     WHERE o.id = NEW.organization_id;
infrastructure/migrations\080_insurance_and_towing_registration.sql-469-
infrastructure/migrations\080_insurance_and_towing_registration.sql:470:    PERFORM set_config('app.bootstrap_org', '', true);
infrastructure/migrations\080_insurance_and_towing_registration.sql-471-
infrastructure/migrations\080_insurance_and_towing_registration.sql-472-    v_kind := CASE NEW.kind
infrastructure/migrations\080_insurance_and_towing_registration.sql-473-                WHEN 'supplier'  THEN 'parts supplier'
infrastructure/migrations\080_insurance_and_towing_registration.sql-474-                WHEN 'fleet'     THEN 'fleet operator'
infrastructure/migrations\080_insurance_and_towing_registration.sql-475-                WHEN 'workshop'  THEN 'workshop'
--
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql-37-    rt          record;
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql-38-    n           int;
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql-39-    v_role      TEXT;
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql-40-    passed      int := 0;
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql-41-BEGIN
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql:42:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql-43-
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql-44-    -- ── 1. three application users, created the way the product does ───────
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql-45-    -- ⚠️ `identity.users` is PLATFORM-GLOBAL and has no tenant_id — recorded
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql-46-    -- 2026-08-16 after a diagnostic assumed otherwise and wrote nothing.
infrastructure/migrations\verify\085_insurance_and_towing_org_admin.sql-47-    INSERT INTO identity.users (id, keycloak_subject, email, display_name, status)
--
infrastructure/migrations\079_organisation_scoped_keys.sql-97-    -- Render. 073's own orphan check read 6 rows as the owner and 0 as the
infrastructure/migrations\079_organisation_scoped_keys.sql-98-    -- Render role. A confident zero over invisible rows is the worst possible
infrastructure/migrations\079_organisation_scoped_keys.sql-99-    -- result for a check that gates a schema change.
infrastructure/migrations\079_organisation_scoped_keys.sql-100-    --
infrastructure/migrations\079_organisation_scoped_keys.sql-101-    -- ⚠️ AND THE ESCAPE IS ASSERTED, NOT ASSUMED — migration 077 changed
infrastructure/migrations\079_organisation_scoped_keys.sql:102:    -- `is_platform_admin()` so that `app.current_role = 'admin'` is no longer
infrastructure/migrations\079_organisation_scoped_keys.sql-103-    -- sufficient on its own: the caller must ALSO own
infrastructure/migrations\079_organisation_scoped_keys.sql-104-    -- `identity.platform_administrators`. A migration does, which is exactly
infrastructure/migrations\079_organisation_scoped_keys.sql-105-    -- the case 077 preserved for seeds and psql. If that ever stops being true
infrastructure/migrations\079_organisation_scoped_keys.sql-106-    -- this block must be rewritten, never skipped.
infrastructure/migrations\079_organisation_scoped_keys.sql:107:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\079_organisation_scoped_keys.sql-108-
infrastructure/migrations\079_organisation_scoped_keys.sql-109-    IF NOT identity.is_platform_admin() THEN
infrastructure/migrations\079_organisation_scoped_keys.sql-110-        RAISE EXCEPTION
infrastructure/migrations\079_organisation_scoped_keys.sql-111-            '079: cannot see the rows it is about to constrain. Setting '
infrastructure/migrations\079_organisation_scoped_keys.sql:112:            'app.current_role did not make is_platform_admin() true — since 077 '
infrastructure/migrations\079_organisation_scoped_keys.sql-113-            'that predicate also requires the caller to own '
infrastructure/migrations\079_organisation_scoped_keys.sql-114-            'identity.platform_administrators. A policy or that function has '
infrastructure/migrations\079_organisation_scoped_keys.sql-115-            'changed and this block must be rewritten, not skipped.';
infrastructure/migrations\079_organisation_scoped_keys.sql-116-    END IF;
infrastructure/migrations\079_organisation_scoped_keys.sql-117-
--
infrastructure/migrations\082_insurance_marketplace.sql-353--- `organisation-isolation.integration.spec.ts` failed it with the reason
infrastructure/migrations\082_insurance_marketplace.sql-354--- spelled out: "a tenant here holds more than one organisation, so these are
infrastructure/migrations\082_insurance_marketplace.sql-355--- isolated by the application layer alone". Migrations 073 and 079 closed that
infrastructure/migrations\082_insurance_marketplace.sql-356--- class for eighteen relationships; a policy that omits it puts one insurer's
infrastructure/migrations\082_insurance_marketplace.sql-357--- products inside another's reach whenever a tenant holds two organisations.
infrastructure/migrations\082_insurance_marketplace.sql:358:CREATE POLICY products_tenant_isolation ON insurance.products
infrastructure/migrations\082_insurance_marketplace.sql-359-    FOR ALL
infrastructure/migrations\082_insurance_marketplace.sql-360-    USING (identity.is_platform_admin()
infrastructure/migrations\082_insurance_marketplace.sql-361-           OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\082_insurance_marketplace.sql-362-               AND organization_id = identity.current_organization_id()))
infrastructure/migrations\082_insurance_marketplace.sql-363-    WITH CHECK (identity.is_platform_admin()
--
infrastructure/migrations\082_insurance_marketplace.sql-367--- Policies: the selling insurer, a platform administrator — and THE BUYER.
infrastructure/migrations\082_insurance_marketplace.sql-368--- 🔴 THE BUYER CLAUSE IS NOT DECORATION. Without it a person could not see the
infrastructure/migrations\082_insurance_marketplace.sql-369--- policy they bought: it lives in the INSURER's tenant, and every other read
infrastructure/migrations\082_insurance_marketplace.sql-370--- path in this product is tenant-scoped. `identity.current_user_id()` is the
infrastructure/migrations\082_insurance_marketplace.sql-371--- validated application user, so this admits exactly one person's own policies.
infrastructure/migrations\082_insurance_marketplace.sql:372:CREATE POLICY policies_tenant_isolation ON insurance.policies
infrastructure/migrations\082_insurance_marketplace.sql-373-    FOR ALL
infrastructure/migrations\082_insurance_marketplace.sql-374-    USING (identity.is_platform_admin()
infrastructure/migrations\082_insurance_marketplace.sql-375-           OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\082_insurance_marketplace.sql-376-               AND organization_id = identity.current_organization_id())
infrastructure/migrations\082_insurance_marketplace.sql-377-           -- The buyer clause is NOT organisation-scoped, and must not be: the
--
infrastructure/migrations\082_insurance_marketplace.sql-382-           OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\082_insurance_marketplace.sql-383-               AND organization_id = identity.current_organization_id()));
infrastructure/migrations\082_insurance_marketplace.sql-384-
infrastructure/migrations\082_insurance_marketplace.sql-385--- Levies: the insurer who owes it, and the platform. NOT the buyer — what the
infrastructure/migrations\082_insurance_marketplace.sql-386--- platform charges the insurer is not the customer's business.
infrastructure/migrations\082_insurance_marketplace.sql:387:CREATE POLICY levies_tenant_isolation ON insurance.platform_levies
infrastructure/migrations\082_insurance_marketplace.sql-388-    FOR ALL
infrastructure/migrations\082_insurance_marketplace.sql-389-    USING (identity.is_platform_admin()
infrastructure/migrations\082_insurance_marketplace.sql-390-           OR (tenant_id = identity.current_tenant_id()
infrastructure/migrations\082_insurance_marketplace.sql-391-               AND organization_id = identity.current_organization_id()))
infrastructure/migrations\082_insurance_marketplace.sql-392-    WITH CHECK (identity.is_platform_admin()
--
infrastructure/migrations\082_insurance_marketplace.sql-394-               AND organization_id = identity.current_organization_id()));
infrastructure/migrations\082_insurance_marketplace.sql-395-
infrastructure/migrations\082_insurance_marketplace.sql-396--- Rates: readable by the organisation it names and by the platform; writable by
infrastructure/migrations\082_insurance_marketplace.sql-397--- the platform only. Two policies, because a levy an insurer could edit is not
infrastructure/migrations\082_insurance_marketplace.sql-398--- a levy.
infrastructure/migrations\082_insurance_marketplace.sql:399:CREATE POLICY levy_rates_read ON insurance.levy_rates
infrastructure/migrations\082_insurance_marketplace.sql-400-    FOR SELECT
infrastructure/migrations\082_insurance_marketplace.sql-401-    -- ⚠️ `current_organization_id()`, SINGULAR. I wrote
infrastructure/migrations\082_insurance_marketplace.sql-402-    -- `current_organization_ids()` and the migration refused to apply —
infrastructure/migrations\082_insurance_marketplace.sql-403-    -- `resolveTenantContext` resolves exactly ONE organisation per request, so
infrastructure/migrations\082_insurance_marketplace.sql-404-    -- there is no plural form and there should not be. Measured from `pg_proc`,
infrastructure/migrations\082_insurance_marketplace.sql-405-    -- not assumed.
infrastructure/migrations\082_insurance_marketplace.sql-406-    USING (identity.is_platform_admin()
infrastructure/migrations\082_insurance_marketplace.sql-407-           OR organization_id IS NULL
infrastructure/migrations\082_insurance_marketplace.sql-408-           OR organization_id = identity.current_organization_id());
infrastructure/migrations\082_insurance_marketplace.sql-409-
infrastructure/migrations\082_insurance_marketplace.sql:410:CREATE POLICY levy_rates_platform_writes ON insurance.levy_rates
infrastructure/migrations\082_insurance_marketplace.sql-411-    FOR ALL
infrastructure/migrations\082_insurance_marketplace.sql-412-    USING (identity.is_platform_admin())
infrastructure/migrations\082_insurance_marketplace.sql-413-    WITH CHECK (identity.is_platform_admin());
infrastructure/migrations\082_insurance_marketplace.sql-414-
infrastructure/migrations\082_insurance_marketplace.sql-415-GRANT SELECT, INSERT, UPDATE ON insurance.products        TO autoworkshop_app;
--
infrastructure/migrations\verify\056_resource_bookings.sql-16-    IF me IS NULL THEN RAISE EXCEPTION 'verify/056: no user rows'; END IF;
infrastructure/migrations\verify\056_resource_bookings.sql-17-
infrastructure/migrations\verify\056_resource_bookings.sql-18-    tid := identity.current_tenant_id();
infrastructure/migrations\verify\056_resource_bookings.sql-19-    IF tid IS NULL THEN
infrastructure/migrations\verify\056_resource_bookings.sql-20-        tid := gen_random_uuid(); oid := gen_random_uuid();
infrastructure/migrations\verify\056_resource_bookings.sql:21:        PERFORM set_config('app.bootstrap', 'on', true);
infrastructure/migrations\verify\056_resource_bookings.sql:22:        PERFORM set_config('app.bootstrap_user', me::text, true);
infrastructure/migrations\verify\056_resource_bookings.sql-23-        INSERT INTO identity.tenants (id, name, slug, created_by)
infrastructure/migrations\verify\056_resource_bookings.sql-24-        VALUES (tid, 'verify-056', 'verify-056-' || replace(tid::text,'-',''), me);
infrastructure/migrations\verify\056_resource_bookings.sql-25-        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
infrastructure/migrations\verify\056_resource_bookings.sql-26-        VALUES (oid, tid, 'verify-056 workshop', 'individual_workshop', me);
infrastructure/migrations\verify\056_resource_bookings.sql:27:        PERFORM set_config('app.bootstrap', 'off', true);
infrastructure/migrations\verify\056_resource_bookings.sql-28-    ELSE
infrastructure/migrations\verify\056_resource_bookings.sql-29-        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
infrastructure/migrations\verify\056_resource_bookings.sql-30-    END IF;
infrastructure/migrations\verify\056_resource_bookings.sql-31-    IF oid IS NULL THEN RAISE EXCEPTION 'verify/056: tenant % has no organisation', tid; END IF;
infrastructure/migrations\verify\056_resource_bookings.sql-32-
--
infrastructure/migrations\verify\082_insurance_marketplace.sql-19-    v_levy    record;
infrastructure/migrations\verify\082_insurance_marketplace.sql-20-    n         int;
infrastructure/migrations\verify\082_insurance_marketplace.sql-21-    refused   boolean;
infrastructure/migrations\verify\082_insurance_marketplace.sql-22-    passed    int := 0;
infrastructure/migrations\verify\082_insurance_marketplace.sql-23-BEGIN
infrastructure/migrations\verify\082_insurance_marketplace.sql:24:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\082_insurance_marketplace.sql-25-
infrastructure/migrations\verify\082_insurance_marketplace.sql-26-    -- A throwaway insurer, and a throwaway WORKSHOP to prove the negative.
infrastructure/migrations\verify\082_insurance_marketplace.sql-27-    v_tenant := gen_random_uuid(); v_org := gen_random_uuid(); v_user := gen_random_uuid();
infrastructure/migrations\verify\082_insurance_marketplace.sql-28-    INSERT INTO identity.users (id, keycloak_subject, email, display_name, status)
infrastructure/migrations\verify\082_insurance_marketplace.sql-29-    VALUES (v_user, 'verify-082-'||v_user, 'verify082@example.test', 'Verify 082', 'active');
--
infrastructure/migrations\verify\055_customer_tail.sql-19-    IF me IS NULL THEN RAISE EXCEPTION 'verify/055: no user rows'; END IF;
infrastructure/migrations\verify\055_customer_tail.sql-20-
infrastructure/migrations\verify\055_customer_tail.sql-21-    tid := identity.current_tenant_id();
infrastructure/migrations\verify\055_customer_tail.sql-22-    IF tid IS NULL THEN
infrastructure/migrations\verify\055_customer_tail.sql-23-        tid := gen_random_uuid(); oid := gen_random_uuid();
infrastructure/migrations\verify\055_customer_tail.sql:24:        PERFORM set_config('app.bootstrap', 'on', true);
infrastructure/migrations\verify\055_customer_tail.sql:25:        PERFORM set_config('app.bootstrap_user', me::text, true);
infrastructure/migrations\verify\055_customer_tail.sql-26-        INSERT INTO identity.tenants (id, name, slug, created_by)
infrastructure/migrations\verify\055_customer_tail.sql-27-        VALUES (tid, 'verify-055', 'verify-055-' || replace(tid::text,'-',''), me);
infrastructure/migrations\verify\055_customer_tail.sql-28-        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
infrastructure/migrations\verify\055_customer_tail.sql-29-        VALUES (oid, tid, 'verify-055 workshop', 'individual_workshop', me);
infrastructure/migrations\verify\055_customer_tail.sql:30:        PERFORM set_config('app.bootstrap', 'off', true);
infrastructure/migrations\verify\055_customer_tail.sql-31-    ELSE
infrastructure/migrations\verify\055_customer_tail.sql-32-        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
infrastructure/migrations\verify\055_customer_tail.sql-33-    END IF;
infrastructure/migrations\verify\055_customer_tail.sql-34-    IF oid IS NULL THEN RAISE EXCEPTION 'verify/055: tenant % has no organisation', tid; END IF;
infrastructure/migrations\verify\055_customer_tail.sql-35-
--
infrastructure/migrations\verify\044_parts_stock.sql-20-    IF me IS NULL THEN RAISE EXCEPTION 'verify/044: no user rows — cannot build a fixture'; END IF;
infrastructure/migrations\verify\044_parts_stock.sql-21-
infrastructure/migrations\verify\044_parts_stock.sql-22-    tid := identity.current_tenant_id();
infrastructure/migrations\verify\044_parts_stock.sql-23-    IF tid IS NULL THEN
infrastructure/migrations\verify\044_parts_stock.sql-24-        tid := gen_random_uuid(); oid := gen_random_uuid();
infrastructure/migrations\verify\044_parts_stock.sql:25:        PERFORM set_config('app.bootstrap', 'on', true);
infrastructure/migrations\verify\044_parts_stock.sql:26:        PERFORM set_config('app.bootstrap_user', me::text, true);
infrastructure/migrations\verify\044_parts_stock.sql-27-        INSERT INTO identity.tenants (id, name, slug, created_by)
infrastructure/migrations\verify\044_parts_stock.sql-28-        VALUES (tid, 'verify-044 tenant', 'verify-044-' || replace(tid::text,'-',''), me);
infrastructure/migrations\verify\044_parts_stock.sql-29-        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
infrastructure/migrations\verify\044_parts_stock.sql-30-        VALUES (oid, tid, 'verify-044 workshop', 'individual_workshop', me);
infrastructure/migrations\verify\044_parts_stock.sql-31-        -- Shut it immediately: every check below must run under the permissions
infrastructure/migrations\verify\044_parts_stock.sql-32-        -- the application actually has, not the bootstrap's.
infrastructure/migrations\verify\044_parts_stock.sql:33:        PERFORM set_config('app.bootstrap', 'off', true);
infrastructure/migrations\verify\044_parts_stock.sql-34-    ELSE
infrastructure/migrations\verify\044_parts_stock.sql-35-        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
infrastructure/migrations\verify\044_parts_stock.sql-36-    END IF;
infrastructure/migrations\verify\044_parts_stock.sql-37-    PERFORM set_config('app.tenant_id', tid::text, true);
infrastructure/migrations\verify\044_parts_stock.sql-38-    IF oid IS NULL THEN RAISE EXCEPTION 'verify/044: tenant % has no organisation', tid; END IF;
--
infrastructure/migrations\verify\042_finance.sql-59-    -- Everything below is created inside the caller's transaction and is rolled
infrastructure/migrations\verify\042_finance.sql-60-    -- back with it. `rehearse-migration.yml` re-reads `schema_migrations`
infrastructure/migrations\verify\042_finance.sql-61-    -- afterwards to prove nothing persisted.
infrastructure/migrations\verify\042_finance.sql-62-    -- Any real user row; `identity.users` carries no RLS, so this is readable
infrastructure/migrations\verify\042_finance.sql-63-    -- with no tenant context. The bootstrap door requires `created_by` to match
infrastructure/migrations\verify\042_finance.sql:64:    -- `app.bootstrap_user`, so it must be a genuine id rather than a random one.
infrastructure/migrations\verify\042_finance.sql-65-    SELECT id INTO me FROM identity.users LIMIT 1;
infrastructure/migrations\verify\042_finance.sql-66-    IF me IS NULL THEN
infrastructure/migrations\verify\042_finance.sql-67-        RAISE EXCEPTION 'verify/042: no user rows at all — cannot build a fixture';
infrastructure/migrations\verify\042_finance.sql-68-    END IF;
infrastructure/migrations\verify\042_finance.sql-69-
--
infrastructure/migrations\verify\042_finance.sql-71-
infrastructure/migrations\verify\042_finance.sql-72-    IF tid IS NULL THEN
infrastructure/migrations\verify\042_finance.sql-73-        tid := gen_random_uuid();
infrastructure/migrations\verify\042_finance.sql-74-        oid := gen_random_uuid();
infrastructure/migrations\verify\042_finance.sql-75-
infrastructure/migrations\verify\042_finance.sql:76:        PERFORM set_config('app.bootstrap', 'on', true);
infrastructure/migrations\verify\042_finance.sql:77:        PERFORM set_config('app.bootstrap_user', me::text, true);
infrastructure/migrations\verify\042_finance.sql-78-
infrastructure/migrations\verify\042_finance.sql-79-        -- `slug` and `org_type` are NOT NULL with no default. The slug is
infrastructure/migrations\verify\042_finance.sql-80-        -- suffixed with the tenant's own uuid so two rehearsals running at once
infrastructure/migrations\verify\042_finance.sql-81-        -- cannot collide on a unique index.
infrastructure/migrations\verify\042_finance.sql-82-        INSERT INTO identity.tenants (id, name, slug, created_by)
--
infrastructure/migrations\verify\042_finance.sql-87-
infrastructure/migrations\verify\042_finance.sql-88-        -- Shut the door again the moment it is no longer needed. Leaving it open
infrastructure/migrations\verify\042_finance.sql-89-        -- for the rest of the transaction would mean every later statement in
infrastructure/migrations\verify\042_finance.sql-90-        -- this verify ran under a permission the application never has, and the
infrastructure/migrations\verify\042_finance.sql-91-        -- checks below would be testing the wrong world.
infrastructure/migrations\verify\042_finance.sql:92:        PERFORM set_config('app.bootstrap', 'off', true);
infrastructure/migrations\verify\042_finance.sql-93-        built_own_world := true;
infrastructure/migrations\verify\042_finance.sql-94-    ELSE
infrastructure/migrations\verify\042_finance.sql-95-        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
infrastructure/migrations\verify\042_finance.sql-96-    END IF;
infrastructure/migrations\verify\042_finance.sql-97-
--
infrastructure/migrations\verify\054_organisation_isolation.sql-58-
infrastructure/migrations\verify\054_organisation_isolation.sql-59-    -- ── the fixture: TWO organisations in ONE tenant ────────────────────────
infrastructure/migrations\verify\054_organisation_isolation.sql-60-    tid := identity.current_tenant_id();
infrastructure/migrations\verify\054_organisation_isolation.sql-61-    IF tid IS NULL THEN
infrastructure/migrations\verify\054_organisation_isolation.sql-62-        tid := gen_random_uuid();
infrastructure/migrations\verify\054_organisation_isolation.sql:63:        PERFORM set_config('app.bootstrap', 'on', true);
infrastructure/migrations\verify\054_organisation_isolation.sql:64:        PERFORM set_config('app.bootstrap_user', me::text, true);
infrastructure/migrations\verify\054_organisation_isolation.sql-65-        INSERT INTO identity.tenants (id, name, slug, created_by)
infrastructure/migrations\verify\054_organisation_isolation.sql-66-        VALUES (tid, 'verify-054', 'verify-054-' || replace(tid::text,'-',''), me);
infrastructure/migrations\verify\054_organisation_isolation.sql:67:        PERFORM set_config('app.bootstrap', 'off', true);
infrastructure/migrations\verify\054_organisation_isolation.sql-68-    END IF;
infrastructure/migrations\verify\054_organisation_isolation.sql-69-
infrastructure/migrations\verify\054_organisation_isolation.sql-70-    PERFORM set_config('app.tenant_id', tid::text, true);
infrastructure/migrations\verify\054_organisation_isolation.sql:71:    PERFORM set_config('app.bootstrap', 'on', true);
infrastructure/migrations\verify\054_organisation_isolation.sql:72:    PERFORM set_config('app.bootstrap_user', me::text, true);
infrastructure/migrations\verify\054_organisation_isolation.sql-73-    org_a := gen_random_uuid(); org_b := gen_random_uuid();
infrastructure/migrations\verify\054_organisation_isolation.sql-74-    INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
infrastructure/migrations\verify\054_organisation_isolation.sql-75-    VALUES (org_a, tid, 'verify-054 A', 'individual_workshop', me),
infrastructure/migrations\verify\054_organisation_isolation.sql-76-           (org_b, tid, 'verify-054 B', 'individual_workshop', me);
infrastructure/migrations\verify\054_organisation_isolation.sql:77:    PERFORM set_config('app.bootstrap', 'off', true);
infrastructure/migrations\verify\054_organisation_isolation.sql-78-
infrastructure/migrations\verify\054_organisation_isolation.sql-79-    -- a customer, a vehicle and a job card, all inside organisation B
infrastructure/migrations\verify\054_organisation_isolation.sql-80-    PERFORM set_config('app.organization_ids', org_b::text, true);
infrastructure/migrations\verify\054_organisation_isolation.sql-81-    INSERT INTO core.customers (tenant_id, organization_id, display_name, created_by)
infrastructure/migrations\verify\054_organisation_isolation.sql-82-    VALUES (tid, org_b, 'verify-054 B customer', me) RETURNING id INTO cust_b;
--
infrastructure/migrations\verify\079_organisation_scoped_keys.sql-29-    org_a     uuid;
infrastructure/migrations\verify\079_organisation_scoped_keys.sql-30-    org_b     uuid;
infrastructure/migrations\verify\079_organisation_scoped_keys.sql-31-    asset_b   uuid;
infrastructure/migrations\verify\079_organisation_scoped_keys.sql-32-    failed    boolean;
infrastructure/migrations\verify\079_organisation_scoped_keys.sql-33-BEGIN
infrastructure/migrations\verify\079_organisation_scoped_keys.sql:34:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\079_organisation_scoped_keys.sql-35-    IF NOT identity.is_platform_admin() THEN
infrastructure/migrations\verify\079_organisation_scoped_keys.sql-36-        RAISE EXCEPTION 'verify/079: the platform-admin escape is not live; every '
infrastructure/migrations\verify\079_organisation_scoped_keys.sql-37-                        'count below would be a confident zero over invisible rows.';
infrastructure/migrations\verify\079_organisation_scoped_keys.sql-38-    END IF;
infrastructure/migrations\verify\079_organisation_scoped_keys.sql-39-
--
infrastructure/migrations\verify\053_customer_owns_its_records.sql-32-    -- `USING (id = current_tenant_id())`, so with no context it returns zero
infrastructure/migrations\verify\053_customer_owns_its_records.sql-33-    -- rows by design. That cost five refused rehearsals on 2026-08-06.
infrastructure/migrations\verify\053_customer_owns_its_records.sql-34-    tid := identity.current_tenant_id();
infrastructure/migrations\verify\053_customer_owns_its_records.sql-35-    IF tid IS NULL THEN
infrastructure/migrations\verify\053_customer_owns_its_records.sql-36-        tid := gen_random_uuid(); oid := gen_random_uuid();
infrastructure/migrations\verify\053_customer_owns_its_records.sql:37:        PERFORM set_config('app.bootstrap', 'on', true);
infrastructure/migrations\verify\053_customer_owns_its_records.sql:38:        PERFORM set_config('app.bootstrap_user', me::text, true);
infrastructure/migrations\verify\053_customer_owns_its_records.sql-39-        INSERT INTO identity.tenants (id, name, slug, created_by)
infrastructure/migrations\verify\053_customer_owns_its_records.sql-40-        VALUES (tid, 'verify-053 tenant', 'verify-053-' || replace(tid::text,'-',''), me);
infrastructure/migrations\verify\053_customer_owns_its_records.sql-41-        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
infrastructure/migrations\verify\053_customer_owns_its_records.sql-42-        VALUES (oid, tid, 'verify-053 workshop', 'individual_workshop', me);
infrastructure/migrations\verify\053_customer_owns_its_records.sql:43:        PERFORM set_config('app.bootstrap', 'off', true);
infrastructure/migrations\verify\053_customer_owns_its_records.sql-44-    ELSE
infrastructure/migrations\verify\053_customer_owns_its_records.sql-45-        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
infrastructure/migrations\verify\053_customer_owns_its_records.sql-46-    END IF;
infrastructure/migrations\verify\053_customer_owns_its_records.sql-47-    IF oid IS NULL THEN RAISE EXCEPTION 'verify/053: tenant % has no organisation', tid; END IF;
infrastructure/migrations\verify\053_customer_owns_its_records.sql-48-
--
infrastructure/migrations\verify\038_bootstrap_door_requires_definer.sql-98-  RAISE NOTICE 'PASS 1  registration still creates tenant + org + branch + membership';
infrastructure/migrations\verify\038_bootstrap_door_requires_definer.sql-99-
infrastructure/migrations\verify\038_bootstrap_door_requires_definer.sql-100-  -- ── 2. 🔴 THE HEADLINE: THE APP ROLE CANNOT OPEN THE DOOR ────────────────
infrastructure/migrations\verify\038_bootstrap_door_requires_definer.sql-101-  -- Exactly the sequence that succeeded before 038. No function in the call
infrastructure/migrations\verify\038_bootstrap_door_requires_definer.sql-102-  -- path: just the two settings and a direct INSERT.
infrastructure/migrations\verify\038_bootstrap_door_requires_definer.sql:103:  PERFORM set_config('app.bootstrap',      'on',       true);
infrastructure/migrations\verify\038_bootstrap_door_requires_definer.sql:104:  PERFORM set_config('app.bootstrap_user', uid::text,  true);
infrastructure/migrations\verify\038_bootstrap_door_requires_definer.sql-105-  BEGIN
infrastructure/migrations\verify\038_bootstrap_door_requires_definer.sql-106-    INSERT INTO identity.tenants (name, slug, status, created_by)
infrastructure/migrations\verify\038_bootstrap_door_requires_definer.sql-107-    VALUES ('Spoofed Motors', 'spoof-' || substr(gen_random_uuid()::text, 1, 8), 'active', uid);
infrastructure/migrations\verify\038_bootstrap_door_requires_definer.sql-108-    RAISE EXCEPTION
infrastructure/migrations\verify\038_bootstrap_door_requires_definer.sql-109-      'FAIL 2: the application role opened the bootstrap door BY ITSELF — '
--
infrastructure/migrations\verify\038_bootstrap_door_requires_definer.sql-132-  IF identity.in_registration_bootstrap() THEN
infrastructure/migrations\verify\038_bootstrap_door_requires_definer.sql-133-    RAISE EXCEPTION 'FAIL 4: in_registration_bootstrap() is TRUE for the application role';
infrastructure/migrations\verify\038_bootstrap_door_requires_definer.sql-134-  END IF;
infrastructure/migrations\verify\038_bootstrap_door_requires_definer.sql-135-  RAISE NOTICE 'PASS 4  in_registration_bootstrap() is FALSE outside the function';
infrastructure/migrations\verify\038_bootstrap_door_requires_definer.sql-136-
infrastructure/migrations\verify\038_bootstrap_door_requires_definer.sql:137:  PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\verify\038_bootstrap_door_requires_definer.sql:138:  PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\verify\038_bootstrap_door_requires_definer.sql-139-
infrastructure/migrations\verify\038_bootstrap_door_requires_definer.sql-140-  RAISE NOTICE 'ALL 5 CHECKS PASSED (as %)', current_user;
infrastructure/migrations\verify\038_bootstrap_door_requires_definer.sql-141-END;
infrastructure/migrations\verify\038_bootstrap_door_requires_definer.sql-142-$$;
infrastructure/migrations\verify\038_bootstrap_door_requires_definer.sql-143-
--
infrastructure/migrations\verify\077_platform_administrator_grants.sql-16--- of the role that asks it in production.
infrastructure/migrations\verify\077_platform_administrator_grants.sql-17---
infrastructure/migrations\verify\077_platform_administrator_grants.sql-18--- The distinction is the point of the file: this repository has twice shipped a
infrastructure/migrations\verify\077_platform_administrator_grants.sql-19--- guard that passed as the owner and was inert as the application role.
infrastructure/migrations\verify\077_platform_administrator_grants.sql-20---
infrastructure/migrations\verify\077_platform_administrator_grants.sql:21:-- 🔴 CHECK 2 IS THE WHOLE POINT. Before 077, `app.current_role =
infrastructure/migrations\verify\077_platform_administrator_grants.sql-22--- 'platform_administrator'` — a plain TEXT column on a membership row inside
infrastructure/migrations\verify\077_platform_administrator_grants.sql-23--- ONE organisation — opened every tenant table in the database. It must now buy
infrastructure/migrations\verify\077_platform_administrator_grants.sql-24--- nothing at all.
infrastructure/migrations\verify\077_platform_administrator_grants.sql-25---
infrastructure/migrations\verify\077_platform_administrator_grants.sql-26--- 🔴 CHECK 5 GUARDS AGAINST A CHANGE THAT WOULD HANG THE DATABASE. This table's
--
infrastructure/migrations\verify\077_platform_administrator_grants.sql-70-
infrastructure/migrations\verify\077_platform_administrator_grants.sql-71-    SET LOCAL ROLE autoworkshop_app;
infrastructure/migrations\verify\077_platform_administrator_grants.sql-72-
infrastructure/migrations\verify\077_platform_administrator_grants.sql-73-    -- ── 1. A GRANT CONFERS AUTHORITY, WHATEVER THE ROLE NAME SAYS ──────────
infrastructure/migrations\verify\077_platform_administrator_grants.sql-74-    PERFORM set_config('app.user_id', v_granted::text, true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql:75:    PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql-76-    SELECT identity.is_platform_admin() INTO v_answer;
infrastructure/migrations\verify\077_platform_administrator_grants.sql-77-    IF NOT v_answer THEN
infrastructure/migrations\verify\077_platform_administrator_grants.sql-78-        RAISE EXCEPTION 'check 1 FAILED: a user holding an active grant is not a platform '
infrastructure/migrations\verify\077_platform_administrator_grants.sql-79-                        'administrator. The 077 backfill has locked out every existing '
infrastructure/migrations\verify\077_platform_administrator_grants.sql-80-                        'administrator, including the owner.';
infrastructure/migrations\verify\077_platform_administrator_grants.sql-81-    END IF;
infrastructure/migrations\verify\077_platform_administrator_grants.sql-82-    RAISE NOTICE 'check 1 OK — an active grant confers authority even under role=technician';
infrastructure/migrations\verify\077_platform_administrator_grants.sql-83-
infrastructure/migrations\verify\077_platform_administrator_grants.sql-84-    -- ── 2. 🔴 THE ROLE NAME ALONE BUYS NOTHING ─────────────────────────────
infrastructure/migrations\verify\077_platform_administrator_grants.sql-85-    PERFORM set_config('app.user_id', v_ungranted::text, true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql:86:    PERFORM set_config('app.current_role', 'platform_administrator', true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql-87-    SELECT identity.is_platform_admin() INTO v_answer;
infrastructure/migrations\verify\077_platform_administrator_grants.sql-88-    IF v_answer THEN
infrastructure/migrations\verify\077_platform_administrator_grants.sql-89-        RAISE EXCEPTION 'check 2 FAILED: claiming role_name platform_administrator still '
infrastructure/migrations\verify\077_platform_administrator_grants.sql-90-                        'confers platform authority. This is the escalation 077 exists to '
infrastructure/migrations\verify\077_platform_administrator_grants.sql-91-                        'close — any path that writes that TEXT value owns every tenant.';
infrastructure/migrations\verify\077_platform_administrator_grants.sql-92-    END IF;
infrastructure/migrations\verify\077_platform_administrator_grants.sql-93-    RAISE NOTICE 'check 2 OK — role_name platform_administrator confers nothing without a grant';
infrastructure/migrations\verify\077_platform_administrator_grants.sql-94-
infrastructure/migrations\verify\077_platform_administrator_grants.sql-95-    -- ── 3a. 🔴 THE ADMIN GUC ALONE MUST NOT WORK FROM THE APPLICATION ──────
infrastructure/migrations\verify\077_platform_administrator_grants.sql-96-    --
infrastructure/migrations\verify\077_platform_administrator_grants.sql:97:    -- `app.current_role` is a custom GUC and ANY role can set it, including the
infrastructure/migrations\verify\077_platform_administrator_grants.sql-98-    -- application's. The first version of 077 accepted it unconditionally, so a
infrastructure/migrations\verify\077_platform_administrator_grants.sql:99:    -- single injected `set_config('app.current_role','admin',true)` restored
infrastructure/migrations\verify\077_platform_administrator_grants.sql-100-    -- authority over every table WITHOUT any grant — through the function
infrastructure/migrations\verify\077_platform_administrator_grants.sql-101-    -- written to prevent exactly that. Codex found it; this check exists so it
infrastructure/migrations\verify\077_platform_administrator_grants.sql-102-    -- cannot come back. Still running as `autoworkshop_app` here, which is the
infrastructure/migrations\verify\077_platform_administrator_grants.sql-103-    -- role the API connects as on Render too (deploy-api proves it is not a
infrastructure/migrations\verify\077_platform_administrator_grants.sql-104-    -- superuser), so this is production's shape and not a local artefact.
infrastructure/migrations\verify\077_platform_administrator_grants.sql-105-    PERFORM set_config('app.user_id', '', true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql:106:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql-107-    SELECT identity.is_platform_admin() INTO v_answer;
infrastructure/migrations\verify\077_platform_administrator_grants.sql-108-    IF v_answer THEN
infrastructure/migrations\verify\077_platform_administrator_grants.sql:109:        RAISE EXCEPTION 'check 3a FAILED: setting app.current_role = admin from the APPLICATION '
infrastructure/migrations\verify\077_platform_administrator_grants.sql-110-                        'role confers platform authority with no grant. SQL injection anywhere '
infrastructure/migrations\verify\077_platform_administrator_grants.sql-111-                        'in the API is a full RLS bypass.';
infrastructure/migrations\verify\077_platform_administrator_grants.sql-112-    END IF;
infrastructure/migrations\verify\077_platform_administrator_grants.sql-113-    RAISE NOTICE 'check 3a OK — the admin GUC buys nothing from the application role';
infrastructure/migrations\verify\077_platform_administrator_grants.sql-114-
infrastructure/migrations\verify\077_platform_administrator_grants.sql-115-    RESET ROLE;
infrastructure/migrations\verify\077_platform_administrator_grants.sql-116-
infrastructure/migrations\verify\077_platform_administrator_grants.sql-117-    -- ── 3b. AND IT MUST STILL WORK FOR THE OWNER, OR EVERY MIGRATION BREAKS ─
infrastructure/migrations\verify\077_platform_administrator_grants.sql-118-    PERFORM set_config('app.user_id', '', true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql:119:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql-120-    SELECT identity.is_platform_admin() INTO v_answer;
infrastructure/migrations\verify\077_platform_administrator_grants.sql-121-    IF NOT v_answer THEN
infrastructure/migrations\verify\077_platform_administrator_grants.sql-122-        RAISE EXCEPTION 'check 3b FAILED: the owner can no longer use the admin escape. Every '
infrastructure/migrations\verify\077_platform_administrator_grants.sql-123-                        'migration and seed script would write nothing, silently, under RLS.';
infrastructure/migrations\verify\077_platform_administrator_grants.sql-124-    END IF;
--
infrastructure/migrations\verify\077_platform_administrator_grants.sql-128-
infrastructure/migrations\verify\077_platform_administrator_grants.sql-129-    -- ── 4. NO RECURSION: a table whose policy calls the predicate is readable ─
infrastructure/migrations\verify\077_platform_administrator_grants.sql-130-    -- If this table's policies ever call `is_platform_admin()`, this statement
infrastructure/migrations\verify\077_platform_administrator_grants.sql-131-    -- does not fail — it never returns. Kept as a real read for that reason.
infrastructure/migrations\verify\077_platform_administrator_grants.sql-132-    PERFORM set_config('app.user_id', v_granted::text, true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql:133:    PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql-134-    SELECT count(*) INTO v_count FROM identity.tenants;
infrastructure/migrations\verify\077_platform_administrator_grants.sql-135-    RAISE NOTICE 'check 4 OK — identity.tenants read through an is_platform_admin() policy (% rows)', v_count;
infrastructure/migrations\verify\077_platform_administrator_grants.sql-136-
infrastructure/migrations\verify\077_platform_administrator_grants.sql-137-    RESET ROLE;
infrastructure/migrations\verify\077_platform_administrator_grants.sql-138-
--
infrastructure/migrations\verify\077_platform_administrator_grants.sql-149-                        'style problem.', v_policies;
infrastructure/migrations\verify\077_platform_administrator_grants.sql-150-    END IF;
infrastructure/migrations\verify\077_platform_administrator_grants.sql-151-    RAISE NOTICE 'check 5 OK — no policy on the grant table calls the predicate that reads it';
infrastructure/migrations\verify\077_platform_administrator_grants.sql-152-
infrastructure/migrations\verify\077_platform_administrator_grants.sql-153-    -- ── 6. APPEND-ONLY IS ENFORCED BY THE DATABASE ─────────────────────────
infrastructure/migrations\verify\077_platform_administrator_grants.sql:154:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql-155-    BEGIN
infrastructure/migrations\verify\077_platform_administrator_grants.sql-156-        DELETE FROM identity.platform_administrators WHERE revoked_at IS NULL;
infrastructure/migrations\verify\077_platform_administrator_grants.sql-157-        RAISE EXCEPTION 'check 6 FAILED: a grant row was DELETED. The authority ledger is '
infrastructure/migrations\verify\077_platform_administrator_grants.sql-158-                        'supposed to be append-only, so a revocation leaves no trace.';
infrastructure/migrations\verify\077_platform_administrator_grants.sql-159-    EXCEPTION
--
infrastructure/migrations\verify\077_platform_administrator_grants.sql-183-    -- UPDATE matched ZERO rows whenever the revoked grant was the only active
infrastructure/migrations\verify\077_platform_administrator_grants.sql-184-    -- one — no trigger fired, no exception was raised, and the check reported a
infrastructure/migrations\verify\077_platform_administrator_grants.sql-185-    -- failure for a correct database. It passed here only because this instance
infrastructure/migrations\verify\077_platform_administrator_grants.sql-186-    -- happened to hold a SECOND grant. A check whose result depends on how much
infrastructure/migrations\verify\077_platform_administrator_grants.sql-187-    -- data exists is not a check. Found by Codex.
infrastructure/migrations\verify\077_platform_administrator_grants.sql:188:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql-189-    BEGIN
infrastructure/migrations\verify\077_platform_administrator_grants.sql-190-        UPDATE identity.platform_administrators
infrastructure/migrations\verify\077_platform_administrator_grants.sql-191-           SET revoked_by = user_id
infrastructure/migrations\verify\077_platform_administrator_grants.sql-192-         WHERE revoked_at IS NULL;
infrastructure/migrations\verify\077_platform_administrator_grants.sql-193-        RAISE EXCEPTION 'check 8 FAILED: a live grant was edited without being revoked.';
--
infrastructure/migrations\verify\077_platform_administrator_grants.sql-209-                        'A revocation check that revokes nothing proves nothing.', v_count;
infrastructure/migrations\verify\077_platform_administrator_grants.sql-210-    END IF;
infrastructure/migrations\verify\077_platform_administrator_grants.sql-211-
infrastructure/migrations\verify\077_platform_administrator_grants.sql-212-    SET LOCAL ROLE autoworkshop_app;
infrastructure/migrations\verify\077_platform_administrator_grants.sql-213-    PERFORM set_config('app.user_id', v_granted::text, true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql:214:    PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\077_platform_administrator_grants.sql-215-    SELECT identity.is_platform_admin() INTO v_answer;
infrastructure/migrations\verify\077_platform_administrator_grants.sql-216-    IF v_answer THEN
infrastructure/migrations\verify\077_platform_administrator_grants.sql-217-        RAISE EXCEPTION 'check 9 FAILED: a revoked administrator is still a platform '
infrastructure/migrations\verify\077_platform_administrator_grants.sql-218-                        'administrator in the same session.';
infrastructure/migrations\verify\077_platform_administrator_grants.sql-219-    END IF;
--
infrastructure/migrations\verify\050_codex_findings.sql-19-    END IF;
infrastructure/migrations\verify\050_codex_findings.sql-20-
infrastructure/migrations\verify\050_codex_findings.sql-21-    tid := identity.current_tenant_id();
infrastructure/migrations\verify\050_codex_findings.sql-22-    IF tid IS NULL THEN
infrastructure/migrations\verify\050_codex_findings.sql-23-        tid := gen_random_uuid(); oid := gen_random_uuid();
infrastructure/migrations\verify\050_codex_findings.sql:24:        PERFORM set_config('app.bootstrap', 'on', true);
infrastructure/migrations\verify\050_codex_findings.sql:25:        PERFORM set_config('app.bootstrap_user', me::text, true);
infrastructure/migrations\verify\050_codex_findings.sql-26-        INSERT INTO identity.tenants (id, name, slug, created_by)
infrastructure/migrations\verify\050_codex_findings.sql-27-        VALUES (tid, 'verify-050 tenant', 'verify-050-' || replace(tid::text,'-',''), me);
infrastructure/migrations\verify\050_codex_findings.sql-28-        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
infrastructure/migrations\verify\050_codex_findings.sql-29-        VALUES (oid, tid, 'verify-050 workshop', 'individual_workshop', me);
infrastructure/migrations\verify\050_codex_findings.sql:30:        PERFORM set_config('app.bootstrap', 'off', true);
infrastructure/migrations\verify\050_codex_findings.sql-31-    ELSE
infrastructure/migrations\verify\050_codex_findings.sql-32-        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
infrastructure/migrations\verify\050_codex_findings.sql-33-    END IF;
infrastructure/migrations\verify\050_codex_findings.sql-34-    PERFORM set_config('app.tenant_id', tid::text, true);
infrastructure/migrations\verify\050_codex_findings.sql-35-    PERFORM set_config('app.organization_ids', oid::text, true);
--
infrastructure/migrations\verify\049_comms_calls.sql-23-    SELECT id INTO you FROM identity.users WHERE id <> me ORDER BY created_at LIMIT 1;
infrastructure/migrations\verify\049_comms_calls.sql-24-
infrastructure/migrations\verify\049_comms_calls.sql-25-    tid := identity.current_tenant_id();
infrastructure/migrations\verify\049_comms_calls.sql-26-    IF tid IS NULL THEN
infrastructure/migrations\verify\049_comms_calls.sql-27-        tid := gen_random_uuid(); oid := gen_random_uuid(); other_oid := gen_random_uuid();
infrastructure/migrations\verify\049_comms_calls.sql:28:        PERFORM set_config('app.bootstrap', 'on', true);
infrastructure/migrations\verify\049_comms_calls.sql:29:        PERFORM set_config('app.bootstrap_user', me::text, true);
infrastructure/migrations\verify\049_comms_calls.sql-30-        INSERT INTO identity.tenants (id, name, slug, created_by)
infrastructure/migrations\verify\049_comms_calls.sql-31-        VALUES (tid, 'verify-049 tenant', 'verify-049-' || replace(tid::text,'-',''), me);
infrastructure/migrations\verify\049_comms_calls.sql-32-        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
infrastructure/migrations\verify\049_comms_calls.sql-33-        VALUES (oid, tid, 'verify-049 workshop', 'individual_workshop', me),
infrastructure/migrations\verify\049_comms_calls.sql-34-               (other_oid, tid, 'verify-049 OTHER workshop', 'individual_workshop', me);
infrastructure/migrations\verify\049_comms_calls.sql:35:        PERFORM set_config('app.bootstrap', 'off', true);
infrastructure/migrations\verify\049_comms_calls.sql-36-    ELSE
infrastructure/migrations\verify\049_comms_calls.sql-37-        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
infrastructure/migrations\verify\049_comms_calls.sql-38-        SELECT id INTO other_oid FROM identity.organizations
infrastructure/migrations\verify\049_comms_calls.sql-39-         WHERE tenant_id = tid AND id <> oid LIMIT 1;
infrastructure/migrations\verify\049_comms_calls.sql-40-    END IF;
--
infrastructure/migrations\verify\048_knowledge_learning.sql-17-    IF me IS NULL THEN RAISE EXCEPTION 'verify/048: no user rows — cannot build a fixture'; END IF;
infrastructure/migrations\verify\048_knowledge_learning.sql-18-
infrastructure/migrations\verify\048_knowledge_learning.sql-19-    tid := identity.current_tenant_id();
infrastructure/migrations\verify\048_knowledge_learning.sql-20-    IF tid IS NULL THEN
infrastructure/migrations\verify\048_knowledge_learning.sql-21-        tid := gen_random_uuid(); oid := gen_random_uuid(); other_oid := gen_random_uuid();
infrastructure/migrations\verify\048_knowledge_learning.sql:22:        PERFORM set_config('app.bootstrap', 'on', true);
infrastructure/migrations\verify\048_knowledge_learning.sql:23:        PERFORM set_config('app.bootstrap_user', me::text, true);
infrastructure/migrations\verify\048_knowledge_learning.sql-24-        INSERT INTO identity.tenants (id, name, slug, created_by)
infrastructure/migrations\verify\048_knowledge_learning.sql-25-        VALUES (tid, 'verify-048 tenant', 'verify-048-' || replace(tid::text,'-',''), me);
infrastructure/migrations\verify\048_knowledge_learning.sql-26-        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
infrastructure/migrations\verify\048_knowledge_learning.sql-27-        VALUES (oid, tid, 'verify-048 workshop', 'individual_workshop', me),
infrastructure/migrations\verify\048_knowledge_learning.sql-28-               (other_oid, tid, 'verify-048 OTHER workshop', 'individual_workshop', me);
infrastructure/migrations\verify\048_knowledge_learning.sql:29:        PERFORM set_config('app.bootstrap', 'off', true);
infrastructure/migrations\verify\048_knowledge_learning.sql-30-    ELSE
infrastructure/migrations\verify\048_knowledge_learning.sql-31-        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
infrastructure/migrations\verify\048_knowledge_learning.sql-32-        SELECT id INTO other_oid FROM identity.organizations
infrastructure/migrations\verify\048_knowledge_learning.sql-33-         WHERE tenant_id = tid AND id <> oid LIMIT 1;
infrastructure/migrations\verify\048_knowledge_learning.sql-34-    END IF;
--
infrastructure/migrations\verify\074_towing.sql-63-                        'invoice->recovery), found %', n;
infrastructure/migrations\verify\074_towing.sql-64-    END IF;
infrastructure/migrations\verify\074_towing.sql-65-    passed := passed + 1;
infrastructure/migrations\verify\074_towing.sql-66-
infrastructure/migrations\verify\074_towing.sql-67-    -- ── FIXTURES: two organisations in one tenant ─────────────────────────
infrastructure/migrations\verify\074_towing.sql:68:    PERFORM set_config('app.bootstrap', 'on', true);
infrastructure/migrations\verify\074_towing.sql:69:    PERFORM set_config('app.bootstrap_user', me::text, true);
infrastructure/migrations\verify\074_towing.sql-70-    INSERT INTO identity.tenants (id, name, slug, created_by)
infrastructure/migrations\verify\074_towing.sql-71-      VALUES (tid, 'verify-074', 'verify-074-' || replace(tid::text,'-',''), me);
infrastructure/migrations\verify\074_towing.sql-72-    INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
infrastructure/migrations\verify\074_towing.sql-73-      VALUES (orgA, tid, 'Recovery A', 'individual_workshop', me),
infrastructure/migrations\verify\074_towing.sql-74-             (orgB, tid, 'Recovery B', 'individual_workshop', me);
infrastructure/migrations\verify\074_towing.sql:75:    PERFORM set_config('app.bootstrap', 'off', true);
infrastructure/migrations\verify\074_towing.sql-76-
infrastructure/migrations\verify\074_towing.sql-77-    INSERT INTO towing.recovery_vehicles (id, tenant_id, organization_id, registration, label)
infrastructure/migrations\verify\074_towing.sql-78-      VALUES (vehA, tid, orgA, 'TR-A-01', 'Flatbed 1'),
infrastructure/migrations\verify\074_towing.sql-79-             (vehB, tid, orgB, 'TR-B-01', 'Flatbed 1');
infrastructure/migrations\verify\074_towing.sql-80-    INSERT INTO towing.drivers (id, tenant_id, organization_id, full_name, phone)
--
infrastructure/migrations\verify\074_towing.sql-112-    -- ── 5. 🔴 RLS UNDER RENDER'S ROLE: A sees only A ──────────────────────
infrastructure/migrations\verify\074_towing.sql-113-    PERFORM set_config('role', 'autoworkshop_app', true);
infrastructure/migrations\verify\074_towing.sql-114-    PERFORM set_config('app.tenant_id', tid::text, true);
infrastructure/migrations\verify\074_towing.sql-115-    PERFORM set_config('app.organization_ids', orgA::text, true);
infrastructure/migrations\verify\074_towing.sql-116-    PERFORM set_config('app.user_id', me::text, true);
infrastructure/migrations\verify\074_towing.sql:117:    PERFORM set_config('app.current_role', 'workshop_owner', true);
infrastructure/migrations\verify\074_towing.sql-118-
infrastructure/migrations\verify\074_towing.sql-119-    IF (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) THEN
infrastructure/migrations\verify\074_towing.sql-120-        RAISE EXCEPTION 'verify/074 #5: running as a role that bypasses RLS — '
infrastructure/migrations\verify\074_towing.sql-121-                        'this check would pass against no policies at all';
infrastructure/migrations\verify\074_towing.sql-122-    END IF;
--
infrastructure/migrations\verify\074_towing.sql-141-    -- ── 6. 🔴 A CUSTOMER SEES NOTHING ─────────────────────────────────────
infrastructure/migrations\verify\074_towing.sql-142-    --
infrastructure/migrations\verify\074_towing.sql-143-    -- Since 061 "a customer" is any stranger who enrolled at a published
infrastructure/migrations\verify\074_towing.sql-144-    -- workshop. Without the `<> 'customer'` clause this workspace would publish
infrastructure/migrations\verify\074_towing.sql-145-    -- a driver roster and an incident log.
infrastructure/migrations\verify\074_towing.sql:146:    PERFORM set_config('app.current_role', 'customer', true);
infrastructure/migrations\verify\074_towing.sql-147-    SELECT count(*) INTO n FROM towing.requests;
infrastructure/migrations\verify\074_towing.sql-148-    IF n <> 0 THEN
infrastructure/migrations\verify\074_towing.sql-149-        RAISE EXCEPTION 'verify/074 #6: a customer can read % towing request(s)', n;
infrastructure/migrations\verify\074_towing.sql-150-    END IF;
infrastructure/migrations\verify\074_towing.sql-151-    SELECT count(*) INTO n FROM towing.drivers;
--
infrastructure/migrations\verify\047_customer_self_service.sql-17-    IF me IS NULL THEN RAISE EXCEPTION 'verify/047: no user rows — cannot build a fixture'; END IF;
infrastructure/migrations\verify\047_customer_self_service.sql-18-
infrastructure/migrations\verify\047_customer_self_service.sql-19-    tid := identity.current_tenant_id();
infrastructure/migrations\verify\047_customer_self_service.sql-20-    IF tid IS NULL THEN
infrastructure/migrations\verify\047_customer_self_service.sql-21-        tid := gen_random_uuid(); oid := gen_random_uuid(); other_oid := gen_random_uuid();
infrastructure/migrations\verify\047_customer_self_service.sql:22:        PERFORM set_config('app.bootstrap', 'on', true);
infrastructure/migrations\verify\047_customer_self_service.sql:23:        PERFORM set_config('app.bootstrap_user', me::text, true);
infrastructure/migrations\verify\047_customer_self_service.sql-24-        INSERT INTO identity.tenants (id, name, slug, created_by)
infrastructure/migrations\verify\047_customer_self_service.sql-25-        VALUES (tid, 'verify-047 tenant', 'verify-047-' || replace(tid::text,'-',''), me);
infrastructure/migrations\verify\047_customer_self_service.sql-26-        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
infrastructure/migrations\verify\047_customer_self_service.sql-27-        VALUES (oid, tid, 'verify-047 workshop', 'individual_workshop', me),
infrastructure/migrations\verify\047_customer_self_service.sql-28-               (other_oid, tid, 'verify-047 OTHER workshop', 'individual_workshop', me);
infrastructure/migrations\verify\047_customer_self_service.sql:29:        PERFORM set_config('app.bootstrap', 'off', true);
infrastructure/migrations\verify\047_customer_self_service.sql-30-    ELSE
infrastructure/migrations\verify\047_customer_self_service.sql-31-        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
infrastructure/migrations\verify\047_customer_self_service.sql-32-        SELECT id INTO other_oid FROM identity.organizations
infrastructure/migrations\verify\047_customer_self_service.sql-33-         WHERE tenant_id = tid AND id <> oid LIMIT 1;
infrastructure/migrations\verify\047_customer_self_service.sql-34-    END IF;
--
infrastructure/migrations\verify\073_relationships.sql-157-                        'deliberately did not duplicate them', n;
infrastructure/migrations\verify\073_relationships.sql-158-    END IF;
infrastructure/migrations\verify\073_relationships.sql-159-    passed := passed + 1;
infrastructure/migrations\verify\073_relationships.sql-160-
infrastructure/migrations\verify\073_relationships.sql-161-    -- ── FIXTURES: two workshops in ONE tenant ─────────────────────────────
infrastructure/migrations\verify\073_relationships.sql:162:    PERFORM set_config('app.bootstrap', 'on', true);
infrastructure/migrations\verify\073_relationships.sql:163:    PERFORM set_config('app.bootstrap_user', me::text, true);
infrastructure/migrations\verify\073_relationships.sql-164-    INSERT INTO identity.tenants (id, name, slug, created_by)
infrastructure/migrations\verify\073_relationships.sql-165-      VALUES (tid, 'verify-073', 'verify-073-' || replace(tid::text,'-',''), me);
infrastructure/migrations\verify\073_relationships.sql-166-    INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
infrastructure/migrations\verify\073_relationships.sql-167-      VALUES (orgA, tid, 'verify-073 workshop A', 'individual_workshop', me),
infrastructure/migrations\verify\073_relationships.sql-168-             (orgB, tid, 'verify-073 workshop B', 'individual_workshop', me);
infrastructure/migrations\verify\073_relationships.sql:169:    PERFORM set_config('app.bootstrap', 'off', true);
infrastructure/migrations\verify\073_relationships.sql-170-
infrastructure/migrations\verify\073_relationships.sql-171-    PERFORM set_config('app.tenant_id', tid::text, true);
infrastructure/migrations\verify\073_relationships.sql-172-    PERFORM set_config('app.user_id', me::text, true);
infrastructure/migrations\verify\073_relationships.sql-173-    PERFORM set_config('app.organization_ids', orgA::text || ',' || orgB::text, true);
infrastructure/migrations\verify\073_relationships.sql:174:    PERFORM set_config('app.current_role', 'workshop_owner', true);
infrastructure/migrations\verify\073_relationships.sql-175-
infrastructure/migrations\verify\073_relationships.sql-176-    INSERT INTO core.customers (id, tenant_id, organization_id, customer_type, display_name, preferred_contact)
infrastructure/migrations\verify\073_relationships.sql-177-      VALUES (custA, tid, orgA, 'individual', 'A customer', 'phone'),
infrastructure/migrations\verify\073_relationships.sql-178-             (custB, tid, orgB, 'individual', 'B customer', 'phone');
infrastructure/migrations\verify\073_relationships.sql-179-    INSERT INTO core.vehicles (id, tenant_id, organization_id, customer_id, registration_number, make_id)
--
infrastructure/migrations\verify\046_comms_messaging.sql-28-    SELECT id INTO you FROM identity.users WHERE id <> me ORDER BY created_at LIMIT 1;
infrastructure/migrations\verify\046_comms_messaging.sql-29-
infrastructure/migrations\verify\046_comms_messaging.sql-30-    tid := identity.current_tenant_id();
infrastructure/migrations\verify\046_comms_messaging.sql-31-    IF tid IS NULL THEN
infrastructure/migrations\verify\046_comms_messaging.sql-32-        tid := gen_random_uuid(); oid := gen_random_uuid(); other_oid := gen_random_uuid();
infrastructure/migrations\verify\046_comms_messaging.sql:33:        PERFORM set_config('app.bootstrap', 'on', true);
infrastructure/migrations\verify\046_comms_messaging.sql:34:        PERFORM set_config('app.bootstrap_user', me::text, true);
infrastructure/migrations\verify\046_comms_messaging.sql-35-        INSERT INTO identity.tenants (id, name, slug, created_by)
infrastructure/migrations\verify\046_comms_messaging.sql-36-        VALUES (tid, 'verify-046 tenant', 'verify-046-' || replace(tid::text,'-',''), me);
infrastructure/migrations\verify\046_comms_messaging.sql-37-        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
infrastructure/migrations\verify\046_comms_messaging.sql-38-        VALUES (oid, tid, 'verify-046 workshop', 'individual_workshop', me),
infrastructure/migrations\verify\046_comms_messaging.sql-39-               (other_oid, tid, 'verify-046 OTHER workshop', 'individual_workshop', me);
infrastructure/migrations\verify\046_comms_messaging.sql:40:        PERFORM set_config('app.bootstrap', 'off', true);
infrastructure/migrations\verify\046_comms_messaging.sql-41-    ELSE
infrastructure/migrations\verify\046_comms_messaging.sql-42-        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
infrastructure/migrations\verify\046_comms_messaging.sql-43-        SELECT id INTO other_oid FROM identity.organizations
infrastructure/migrations\verify\046_comms_messaging.sql-44-         WHERE tenant_id = tid AND id <> oid LIMIT 1;
infrastructure/migrations\verify\046_comms_messaging.sql-45-    END IF;
--
infrastructure/migrations\verify\060_notifications.sql-23-    IF me IS NULL THEN RAISE EXCEPTION 'verify/060: no user rows'; END IF;
infrastructure/migrations\verify\060_notifications.sql-24-
infrastructure/migrations\verify\060_notifications.sql-25-    tid := identity.current_tenant_id();
infrastructure/migrations\verify\060_notifications.sql-26-    IF tid IS NULL THEN
infrastructure/migrations\verify\060_notifications.sql-27-        tid := gen_random_uuid(); oid := gen_random_uuid();
infrastructure/migrations\verify\060_notifications.sql:28:        PERFORM set_config('app.bootstrap', 'on', true);
infrastructure/migrations\verify\060_notifications.sql:29:        PERFORM set_config('app.bootstrap_user', me::text, true);
infrastructure/migrations\verify\060_notifications.sql-30-        INSERT INTO identity.tenants (id, name, slug, created_by)
infrastructure/migrations\verify\060_notifications.sql-31-        VALUES (tid, 'verify-060', 'verify-060-' || replace(tid::text,'-',''), me);
infrastructure/migrations\verify\060_notifications.sql-32-        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
infrastructure/migrations\verify\060_notifications.sql-33-        VALUES (oid, tid, 'verify-060 workshop', 'individual_workshop', me);
infrastructure/migrations\verify\060_notifications.sql:34:        PERFORM set_config('app.bootstrap', 'off', true);
infrastructure/migrations\verify\060_notifications.sql-35-    ELSE
infrastructure/migrations\verify\060_notifications.sql-36-        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
infrastructure/migrations\verify\060_notifications.sql-37-    END IF;
infrastructure/migrations\verify\060_notifications.sql-38-    IF oid IS NULL THEN RAISE EXCEPTION 'verify/060: no organisation'; END IF;
infrastructure/migrations\verify\060_notifications.sql-39-
infrastructure/migrations\verify\060_notifications.sql-40-    PERFORM set_config('app.tenant_id', tid::text, true);
infrastructure/migrations\verify\060_notifications.sql-41-    PERFORM set_config('app.user_id', me::text, true);
infrastructure/migrations\verify\060_notifications.sql-42-    PERFORM set_config('app.organization_ids', oid::text, true);
infrastructure/migrations\verify\060_notifications.sql:43:    PERFORM set_config('app.current_role', 'reception_staff', true);
infrastructure/migrations\verify\060_notifications.sql-44-
infrastructure/migrations\verify\060_notifications.sql-45-    -- 1. The table exists with the columns delivery depends on.
infrastructure/migrations\verify\060_notifications.sql-46-    SELECT count(*) INTO n FROM information_schema.columns
infrastructure/migrations\verify\060_notifications.sql-47-     WHERE table_schema = 'comms' AND table_name = 'notifications'
infrastructure/migrations\verify\060_notifications.sql-48-       AND column_name IN ('recipient_id','event_key','channel','subject','body',
--
infrastructure/migrations\verify\060_notifications.sql-173-    --     subject and body of a message addressed to one person. An
infrastructure/migrations\verify\060_notifications.sql-174-    --     organisation-wide predicate here would let every member of a workshop
infrastructure/migrations\verify\060_notifications.sql-175-    --     read every customer's quotes — the 45-screen leak, one layer down.
infrastructure/migrations\verify\060_notifications.sql-176-    other_user := gen_random_uuid();
infrastructure/migrations\verify\060_notifications.sql-177-    PERFORM set_config('app.user_id', other_user::text, true);
infrastructure/migrations\verify\060_notifications.sql:178:    PERFORM set_config('app.current_role', 'customer', true);
infrastructure/migrations\verify\060_notifications.sql-179-    SELECT count(*) INTO n FROM comms.notifications WHERE id = nid;
infrastructure/migrations\verify\060_notifications.sql-180-    IF n <> 0 THEN
infrastructure/migrations\verify\060_notifications.sql-181-        RAISE NOTICE 'verify/060 #11: another user read this notification — expected locally (superuser bypasses RLS), a DEFECT under 
rehearsal';
infrastructure/migrations\verify\060_notifications.sql-182-    ELSE
infrastructure/migrations\verify\060_notifications.sql-183-        passed := passed + 1;
infrastructure/migrations\verify\060_notifications.sql-184-    END IF;
infrastructure/migrations\verify\060_notifications.sql-185-
infrastructure/migrations\verify\060_notifications.sql-186-    -- Restore the caller so the rest can write.
infrastructure/migrations\verify\060_notifications.sql-187-    PERFORM set_config('app.user_id', me::text, true);
infrastructure/migrations\verify\060_notifications.sql:188:    PERFORM set_config('app.current_role', 'reception_staff', true);
infrastructure/migrations\verify\060_notifications.sql-189-
infrastructure/migrations\verify\060_notifications.sql-190-    -- 12. 🔴 A CUSTOMER IS NEVER NOTIFIED AS "STAFF". `customer` is a real
infrastructure/migrations\verify\060_notifications.sql-191-    --     membership role in the workshop's OWN organisation — the fact behind
infrastructure/migrations\verify\060_notifications.sql-192-    --     every ungated-read defect in this codebase. If the recipient query
infrastructure/migrations\verify\060_notifications.sql-193-    --     said "everyone in the org", the workshop's intake would be emailed
--
infrastructure/migrations\verify\060_notifications.sql-256-    -- rehearsal while the production drain claimed nothing at all, which is this
infrastructure/migrations\verify\060_notifications.sql-257-    -- repository's "a check that walks through its own gap" lesson exactly.
infrastructure/migrations\verify\060_notifications.sql-258-    -- Clearing the user is what makes checks 14 and 15 test the drain
infrastructure/migrations\verify\060_notifications.sql-259-    -- (Supervisor, 2026-08-07).
infrastructure/migrations\verify\060_notifications.sql-260-    PERFORM set_config('app.user_id', '', true);
infrastructure/migrations\verify\060_notifications.sql:261:    PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\060_notifications.sql-262-
infrastructure/migrations\verify\060_notifications.sql-263-    SELECT count(*) INTO n FROM comms.claim_pending_notifications(100) c WHERE c.id = nid;
infrastructure/migrations\verify\060_notifications.sql-264-    IF n <> 1 THEN RAISE EXCEPTION 'verify/060 #14: the first claim did not return the pending row'; END IF;
infrastructure/migrations\verify\060_notifications.sql-265-
infrastructure/migrations\verify\060_notifications.sql-266-    SELECT count(*) INTO n FROM comms.claim_pending_notifications(100) c WHERE c.id = nid;
--
infrastructure/migrations\verify\060_notifications.sql-284-    IF n <> 0 THEN RAISE EXCEPTION 'verify/060 #15: an exhausted message was claimed again'; END IF;
infrastructure/migrations\verify\060_notifications.sql-285-    passed := passed + 1;
infrastructure/migrations\verify\060_notifications.sql-286-
infrastructure/migrations\verify\060_notifications.sql-287-    -- Restore the caller for the cleanup below.
infrastructure/migrations\verify\060_notifications.sql-288-    PERFORM set_config('app.user_id', me::text, true);
infrastructure/migrations\verify\060_notifications.sql:289:    PERFORM set_config('app.current_role', 'reception_staff', true);
infrastructure/migrations\verify\060_notifications.sql-290-
infrastructure/migrations\verify\060_notifications.sql-291-    DELETE FROM comms.notifications WHERE dedupe_key LIKE 'verify060%';
infrastructure/migrations\verify\060_notifications.sql-292-    DELETE FROM comms.notifications WHERE recipient_id = other_user;
infrastructure/migrations\verify\060_notifications.sql-293-    DELETE FROM identity.memberships WHERE user_id = other_user;
infrastructure/migrations\verify\060_notifications.sql-294-    DELETE FROM identity.users WHERE id = other_user;
--
infrastructure/migrations\verify\045_workshop_settings.sql-53-    IF me IS NULL THEN RAISE EXCEPTION 'verify/045: no user rows — cannot build a fixture'; END IF;
infrastructure/migrations\verify\045_workshop_settings.sql-54-
infrastructure/migrations\verify\045_workshop_settings.sql-55-    tid := identity.current_tenant_id();
infrastructure/migrations\verify\045_workshop_settings.sql-56-    IF tid IS NULL THEN
infrastructure/migrations\verify\045_workshop_settings.sql-57-        tid := gen_random_uuid(); oid := gen_random_uuid();
infrastructure/migrations\verify\045_workshop_settings.sql:58:        PERFORM set_config('app.bootstrap', 'on', true);
infrastructure/migrations\verify\045_workshop_settings.sql:59:        PERFORM set_config('app.bootstrap_user', me::text, true);
infrastructure/migrations\verify\045_workshop_settings.sql-60-        INSERT INTO identity.tenants (id, name, slug, created_by)
infrastructure/migrations\verify\045_workshop_settings.sql-61-        VALUES (tid, 'verify-045 tenant', 'verify-045-' || replace(tid::text,'-',''), me);
infrastructure/migrations\verify\045_workshop_settings.sql-62-        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
infrastructure/migrations\verify\045_workshop_settings.sql-63-        VALUES (oid, tid, 'verify-045 workshop', 'individual_workshop', me);
infrastructure/migrations\verify\045_workshop_settings.sql-64-        -- 🔴 THE SECOND ORGANISATION IS THE WHOLE POINT OF THIS FILE.
--
infrastructure/migrations\verify\045_workshop_settings.sql-66-        -- slice's tenant-wide RLS insufficient. Without a sibling org there is
infrastructure/migrations\verify\045_workshop_settings.sql-67-        -- nothing to be isolated FROM and checks 6-7 would pass vacuously.
infrastructure/migrations\verify\045_workshop_settings.sql-68-        other_oid := gen_random_uuid();
infrastructure/migrations\verify\045_workshop_settings.sql-69-        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
infrastructure/migrations\verify\045_workshop_settings.sql-70-        VALUES (other_oid, tid, 'verify-045 OTHER workshop', 'individual_workshop', me);
infrastructure/migrations\verify\045_workshop_settings.sql:71:        PERFORM set_config('app.bootstrap', 'off', true);
infrastructure/migrations\verify\045_workshop_settings.sql-72-    ELSE
infrastructure/migrations\verify\045_workshop_settings.sql-73-        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
infrastructure/migrations\verify\045_workshop_settings.sql-74-        SELECT id INTO other_oid FROM identity.organizations
infrastructure/migrations\verify\045_workshop_settings.sql-75-         WHERE tenant_id = tid AND id <> oid LIMIT 1;
infrastructure/migrations\verify\045_workshop_settings.sql-76-    END IF;
--
infrastructure/migrations\verify\058_service_requests.sql-35-    IF me IS NULL THEN RAISE EXCEPTION 'verify/058: no user rows'; END IF;
infrastructure/migrations\verify\058_service_requests.sql-36-
infrastructure/migrations\verify\058_service_requests.sql-37-    tid := identity.current_tenant_id();
infrastructure/migrations\verify\058_service_requests.sql-38-    IF tid IS NULL THEN
infrastructure/migrations\verify\058_service_requests.sql-39-        tid := gen_random_uuid(); oid := gen_random_uuid();
infrastructure/migrations\verify\058_service_requests.sql:40:        PERFORM set_config('app.bootstrap', 'on', true);
infrastructure/migrations\verify\058_service_requests.sql:41:        PERFORM set_config('app.bootstrap_user', me::text, true);
infrastructure/migrations\verify\058_service_requests.sql-42-        INSERT INTO identity.tenants (id, name, slug, created_by)
infrastructure/migrations\verify\058_service_requests.sql-43-        VALUES (tid, 'verify-058', 'verify-058-' || replace(tid::text,'-',''), me);
infrastructure/migrations\verify\058_service_requests.sql-44-        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
infrastructure/migrations\verify\058_service_requests.sql-45-        VALUES (oid, tid, 'verify-058 workshop', 'individual_workshop', me);
infrastructure/migrations\verify\058_service_requests.sql:46:        PERFORM set_config('app.bootstrap', 'off', true);
infrastructure/migrations\verify\058_service_requests.sql-47-    ELSE
infrastructure/migrations\verify\058_service_requests.sql-48-        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
infrastructure/migrations\verify\058_service_requests.sql-49-    END IF;
infrastructure/migrations\verify\058_service_requests.sql-50-    IF oid IS NULL THEN RAISE EXCEPTION 'verify/058: no organisation'; END IF;
infrastructure/migrations\verify\058_service_requests.sql-51-
infrastructure/migrations\verify\058_service_requests.sql-52-    -- 🔴 THE CALLER. Without these the policies see no user, no tenant and no
infrastructure/migrations\verify\058_service_requests.sql-53-    -- organisation, and refuse everything — which is what failed the first
infrastructure/migrations\verify\058_service_requests.sql:54:    -- rehearsal. `app.current_role` is deliberately a STAFF role here so the
infrastructure/migrations\verify\058_service_requests.sql-55-    -- setup below can write; the customer cases set it to `customer` themselves.
infrastructure/migrations\verify\058_service_requests.sql-56-    PERFORM set_config('app.tenant_id', tid::text, true);
infrastructure/migrations\verify\058_service_requests.sql-57-    PERFORM set_config('app.user_id', me::text, true);
infrastructure/migrations\verify\058_service_requests.sql-58-    PERFORM set_config('app.organization_ids', oid::text, true);
infrastructure/migrations\verify\058_service_requests.sql:59:    PERFORM set_config('app.current_role', 'reception_staff', true);
infrastructure/migrations\verify\058_service_requests.sql-60-
infrastructure/migrations\verify\058_service_requests.sql-61-    -- 1. The table exists with the columns the feature depends on.
infrastructure/migrations\verify\058_service_requests.sql-62-    SELECT count(*) INTO n FROM information_schema.columns
infrastructure/migrations\verify\058_service_requests.sql-63-     WHERE table_schema = 'reception' AND table_name = 'service_requests'
infrastructure/migrations\verify\058_service_requests.sql-64-       AND column_name IN ('organization_id','requested_by','vehicle_description',
--
infrastructure/migrations\verify\058_service_requests.sql-228-    --     this table: every other table requires `organization_id =
infrastructure/migrations\verify\058_service_requests.sql-229-    --     current_organization_id()`. If a copied policy ever replaces this
infrastructure/migrations\verify\058_service_requests.sql-230-    --     one, the whole public mechanic directory becomes decorative — a
infrastructure/migrations\verify\058_service_requests.sql-231-    --     customer could search workshops and ask none of them. The check sets
infrastructure/migrations\verify\058_service_requests.sql-232-    --     the caller's organisation to something ELSE entirely.
infrastructure/migrations\verify\058_service_requests.sql:233:    PERFORM set_config('app.current_role', 'customer', true);
infrastructure/migrations\verify\058_service_requests.sql-234-    PERFORM set_config('app.organization_ids', gen_random_uuid()::text, true);
infrastructure/migrations\verify\058_service_requests.sql-235-    INSERT INTO reception.service_requests
infrastructure/migrations\verify\058_service_requests.sql-236-        (tenant_id, organization_id, requested_by, vehicle_description, complaint)
infrastructure/migrations\verify\058_service_requests.sql-237-    VALUES (tid, oid, me, 'Policy test car', 'Policy test complaint')
infrastructure/migrations\verify\058_service_requests.sql-238-    RETURNING id INTO req;
--
infrastructure/migrations\verify\058_service_requests.sql-293-    --     branch is `requested_by = current_user_id()`, NOT "belongs to my
infrastructure/migrations\verify\058_service_requests.sql-294-    --     organisation" — because a customer IS a member of the workshop's org,
infrastructure/migrations\verify\058_service_requests.sql-295-    --     and an org-only predicate would show them the workshop's entire
infrastructure/migrations\verify\058_service_requests.sql-296-    --     inbox. That is the 45-screen leak's exact shape, one layer down.
infrastructure/migrations\verify\058_service_requests.sql-297-    PERFORM set_config('app.user_id', gen_random_uuid()::text, true);
infrastructure/migrations\verify\058_service_requests.sql:298:    PERFORM set_config('app.current_role', 'customer', true);
infrastructure/migrations\verify\058_service_requests.sql-299-    SELECT count(*) INTO n FROM reception.service_requests WHERE id = req;
infrastructure/migrations\verify\058_service_requests.sql-300-    IF n <> 0 THEN
infrastructure/migrations\verify\058_service_requests.sql-301-        RAISE NOTICE 'verify/058 #18: a customer read ANOTHER customer''s request — expected locally (superuser bypasses RLS), a 
DEFECT under rehearsal';
infrastructure/migrations\verify\058_service_requests.sql-302-    ELSE
infrastructure/migrations\verify\058_service_requests.sql-303-        passed := passed + 1;
infrastructure/migrations\verify\058_service_requests.sql-304-    END IF;
infrastructure/migrations\verify\058_service_requests.sql-305-
infrastructure/migrations\verify\058_service_requests.sql-306-    -- Restore the staff caller so the cleanup can see the row it created.
infrastructure/migrations\verify\058_service_requests.sql-307-    PERFORM set_config('app.user_id', me::text, true);
infrastructure/migrations\verify\058_service_requests.sql:308:    PERFORM set_config('app.current_role', 'reception_staff', true);
infrastructure/migrations\verify\058_service_requests.sql-309-    PERFORM set_config('app.organization_ids', oid::text, true);
infrastructure/migrations\verify\058_service_requests.sql-310-    DELETE FROM reception.service_requests WHERE id = req;
infrastructure/migrations\verify\058_service_requests.sql-311-
infrastructure/migrations\verify\058_service_requests.sql-312-    RAISE NOTICE 'verify/058: % / 18 passed (15-18 are only MEANINGFUL under rehearsal — locally a superuser bypasses RLS)', passed;
infrastructure/migrations\verify\058_service_requests.sql-313-END
--
infrastructure/migrations\verify\057_learning_and_diagnostic_trees.sql-18-    IF me IS NULL THEN RAISE EXCEPTION 'verify/057: no user rows'; END IF;
infrastructure/migrations\verify\057_learning_and_diagnostic_trees.sql-19-
infrastructure/migrations\verify\057_learning_and_diagnostic_trees.sql-20-    tid := identity.current_tenant_id();
infrastructure/migrations\verify\057_learning_and_diagnostic_trees.sql-21-    IF tid IS NULL THEN
infrastructure/migrations\verify\057_learning_and_diagnostic_trees.sql-22-        tid := gen_random_uuid(); oid := gen_random_uuid();
infrastructure/migrations\verify\057_learning_and_diagnostic_trees.sql:23:        PERFORM set_config('app.bootstrap', 'on', true);
infrastructure/migrations\verify\057_learning_and_diagnostic_trees.sql:24:        PERFORM set_config('app.bootstrap_user', me::text, true);
infrastructure/migrations\verify\057_learning_and_diagnostic_trees.sql-25-        INSERT INTO identity.tenants (id, name, slug, created_by)
infrastructure/migrations\verify\057_learning_and_diagnostic_trees.sql-26-        VALUES (tid, 'verify-057', 'verify-057-' || replace(tid::text,'-',''), me);
infrastructure/migrations\verify\057_learning_and_diagnostic_trees.sql-27-        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
infrastructure/migrations\verify\057_learning_and_diagnostic_trees.sql-28-        VALUES (oid, tid, 'verify-057 workshop', 'individual_workshop', me);
infrastructure/migrations\verify\057_learning_and_diagnostic_trees.sql:29:        PERFORM set_config('app.bootstrap', 'off', true);
infrastructure/migrations\verify\057_learning_and_diagnostic_trees.sql-30-    ELSE
infrastructure/migrations\verify\057_learning_and_diagnostic_trees.sql-31-        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
infrastructure/migrations\verify\057_learning_and_diagnostic_trees.sql-32-    END IF;
infrastructure/migrations\verify\057_learning_and_diagnostic_trees.sql-33-    IF oid IS NULL THEN RAISE EXCEPTION 'verify/057: tenant % has no organisation', tid; END IF;
infrastructure/migrations\verify\057_learning_and_diagnostic_trees.sql-34-
--
infrastructure/migrations\verify\059_supplier_requests.sql-26-    IF me IS NULL THEN RAISE EXCEPTION 'verify/059: no user rows'; END IF;
infrastructure/migrations\verify\059_supplier_requests.sql-27-
infrastructure/migrations\verify\059_supplier_requests.sql-28-    tid := identity.current_tenant_id();
infrastructure/migrations\verify\059_supplier_requests.sql-29-    IF tid IS NULL THEN
infrastructure/migrations\verify\059_supplier_requests.sql-30-        tid := gen_random_uuid(); oid := gen_random_uuid();
infrastructure/migrations\verify\059_supplier_requests.sql:31:        PERFORM set_config('app.bootstrap', 'on', true);
infrastructure/migrations\verify\059_supplier_requests.sql:32:        PERFORM set_config('app.bootstrap_user', me::text, true);
infrastructure/migrations\verify\059_supplier_requests.sql-33-        INSERT INTO identity.tenants (id, name, slug, created_by)
infrastructure/migrations\verify\059_supplier_requests.sql-34-        VALUES (tid, 'verify-059', 'verify-059-' || replace(tid::text,'-',''), me);
infrastructure/migrations\verify\059_supplier_requests.sql-35-        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
infrastructure/migrations\verify\059_supplier_requests.sql-36-        VALUES (oid, tid, 'verify-059 workshop', 'individual_workshop', me);
infrastructure/migrations\verify\059_supplier_requests.sql:37:        PERFORM set_config('app.bootstrap', 'off', true);
infrastructure/migrations\verify\059_supplier_requests.sql-38-    ELSE
infrastructure/migrations\verify\059_supplier_requests.sql-39-        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
infrastructure/migrations\verify\059_supplier_requests.sql-40-    END IF;
infrastructure/migrations\verify\059_supplier_requests.sql-41-    IF oid IS NULL THEN RAISE EXCEPTION 'verify/059: no organisation'; END IF;
infrastructure/migrations\verify\059_supplier_requests.sql-42-
infrastructure/migrations\verify\059_supplier_requests.sql-43-    -- THE CALLER: a workshop storekeeper, which is who asks a supplier for a part.
infrastructure/migrations\verify\059_supplier_requests.sql-44-    PERFORM set_config('app.tenant_id', tid::text, true);
infrastructure/migrations\verify\059_supplier_requests.sql-45-    PERFORM set_config('app.user_id', me::text, true);
infrastructure/migrations\verify\059_supplier_requests.sql-46-    PERFORM set_config('app.organization_ids', oid::text, true);
infrastructure/migrations\verify\059_supplier_requests.sql:47:    PERFORM set_config('app.current_role', 'storekeeper', true);
infrastructure/migrations\verify\059_supplier_requests.sql-48-
infrastructure/migrations\verify\059_supplier_requests.sql-49-    SELECT id INTO sup FROM catalogue.suppliers LIMIT 1;
infrastructure/migrations\verify\059_supplier_requests.sql-50-    IF sup IS NULL THEN
infrastructure/migrations\verify\059_supplier_requests.sql-51-        INSERT INTO catalogue.suppliers (name, slug, country, created_by)
infrastructure/migrations\verify\059_supplier_requests.sql-52-        VALUES ('verify-059 supplier', 'verify-059-' || replace(gen_random_uuid()::text,'-',''), 'GH', me)
--
infrastructure/migrations\verify\059_supplier_requests.sql-192-    ELSE
infrastructure/migrations\verify\059_supplier_requests.sql-193-        -- Re-address the request to the supplier that user actually works for.
infrastructure/migrations\verify\059_supplier_requests.sql-194-        UPDATE parts.supplier_requests SET supplier_id = link_supplier WHERE id = req;
infrastructure/migrations\verify\059_supplier_requests.sql-195-
infrastructure/migrations\verify\059_supplier_requests.sql-196-        PERFORM set_config('app.user_id', link_user::text, true);
infrastructure/migrations\verify\059_supplier_requests.sql:197:        PERFORM set_config('app.current_role', 'supplier_owner', true);
infrastructure/migrations\verify\059_supplier_requests.sql-198-        PERFORM set_config('app.organization_ids', gen_random_uuid()::text, true);  -- NOT the workshop's
infrastructure/migrations\verify\059_supplier_requests.sql-199-        SELECT count(*) INTO n FROM parts.supplier_requests WHERE id=req;
infrastructure/migrations\verify\059_supplier_requests.sql-200-        IF n <> 1 THEN
infrastructure/migrations\verify\059_supplier_requests.sql-201-            RAISE NOTICE 'verify/059 #11: supplier could NOT read a request sent to them (n=%) — a DEFECT under rehearsal', n;
infrastructure/migrations\verify\059_supplier_requests.sql-202-        ELSE
--
infrastructure/migrations\verify\059_supplier_requests.sql-222-        END IF;
infrastructure/migrations\verify\059_supplier_requests.sql-223-        -- Put it back as the workshop, which can still see the row. The USER id
infrastructure/migrations\verify\059_supplier_requests.sql-224-        -- must be restored too — it was switched to the supplier's above, and
infrastructure/migrations\verify\059_supplier_requests.sql-225-        -- leaving it would make every later check run as the wrong person.
infrastructure/migrations\verify\059_supplier_requests.sql-226-        PERFORM set_config('app.user_id', me::text, true);
infrastructure/migrations\verify\059_supplier_requests.sql:227:        PERFORM set_config('app.current_role', 'storekeeper', true);
infrastructure/migrations\verify\059_supplier_requests.sql-228-        PERFORM set_config('app.organization_ids', oid::text, true);
infrastructure/migrations\verify\059_supplier_requests.sql-229-        UPDATE parts.supplier_requests SET supplier_id=COALESCE(link_supplier, sup) WHERE id=req;
infrastructure/migrations\verify\059_supplier_requests.sql-230-    END IF;
infrastructure/migrations\verify\059_supplier_requests.sql-231-
infrastructure/migrations\verify\059_supplier_requests.sql-232-    -- Restore the workshop caller before the customer check, in case 11/12 were
--
infrastructure/migrations\verify\059_supplier_requests.sql-236-
infrastructure/migrations\verify\059_supplier_requests.sql-237-    -- 13. 🔴 A CUSTOMER MAY NOT RAISE A PARTS REQUEST. Parts procurement is not
infrastructure/migrations\verify\059_supplier_requests.sql-238-    --     a customer function, and a customer holds a real membership in the
infrastructure/migrations\verify\059_supplier_requests.sql-239-    --     workshop's organisation — so an org-only predicate would have allowed
infrastructure/migrations\verify\059_supplier_requests.sql-240-    --     it. Same shape as the 45-screen leak, one layer down.
infrastructure/migrations\verify\059_supplier_requests.sql:241:    PERFORM set_config('app.current_role', 'customer', true);
infrastructure/migrations\verify\059_supplier_requests.sql-242-    refused := false;
infrastructure/migrations\verify\059_supplier_requests.sql-243-    BEGIN
infrastructure/migrations\verify\059_supplier_requests.sql-244-        INSERT INTO parts.supplier_requests
infrastructure/migrations\verify\059_supplier_requests.sql-245-            (tenant_id, organization_id, requested_by, supplier_id, part_description, quantity)
infrastructure/migrations\verify\059_supplier_requests.sql-246-        VALUES (tid, oid, me, sup, 'Customer should not be able to order this', 1);
--
infrastructure/migrations\verify\059_supplier_requests.sql-252-         WHERE part_description = 'Customer should not be able to order this';
infrastructure/migrations\verify\059_supplier_requests.sql-253-    ELSE
infrastructure/migrations\verify\059_supplier_requests.sql-254-        passed := passed + 1;
infrastructure/migrations\verify\059_supplier_requests.sql-255-    END IF;
infrastructure/migrations\verify\059_supplier_requests.sql-256-
infrastructure/migrations\verify\059_supplier_requests.sql:257:    PERFORM set_config('app.current_role', 'storekeeper', true);
infrastructure/migrations\verify\059_supplier_requests.sql-258-    DELETE FROM parts.supplier_requests WHERE id=req;
infrastructure/migrations\verify\059_supplier_requests.sql-259-
infrastructure/migrations\verify\059_supplier_requests.sql-260-    RAISE NOTICE 'verify/059: % / 13 passed (10-13 are only MEANINGFUL under rehearsal — locally a superuser bypasses RLS)', passed;
infrastructure/migrations\verify\059_supplier_requests.sql-261-END
infrastructure/migrations\verify\059_supplier_requests.sql-262-$verify$;
--
infrastructure/migrations\verify\026_fitment_publication_guard.sql-16---
infrastructure/migrations\verify\026_fitment_publication_guard.sql-17--- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.
infrastructure/migrations\verify\026_fitment_publication_guard.sql-18-
infrastructure/migrations\verify\026_fitment_publication_guard.sql-19-BEGIN;
infrastructure/migrations\verify\026_fitment_publication_guard.sql-20-
infrastructure/migrations\verify\026_fitment_publication_guard.sql:21:SELECT set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\026_fitment_publication_guard.sql-22-
infrastructure/migrations\verify\026_fitment_publication_guard.sql-23-CREATE TEMP TABLE _fx (k TEXT PRIMARY KEY, v UUID) ON COMMIT DROP;
infrastructure/migrations\verify\026_fitment_publication_guard.sql-24-GRANT SELECT ON _fx TO autoworkshop_app;
infrastructure/migrations\verify\026_fitment_publication_guard.sql-25-
infrastructure/migrations\verify\026_fitment_publication_guard.sql-26-INSERT INTO _fx (k, v) VALUES ('member', gen_random_uuid());
--
infrastructure/migrations\verify\026_fitment_publication_guard.sql-60-DO $$
infrastructure/migrations\verify\026_fitment_publication_guard.sql-61-DECLARE
infrastructure/migrations\verify\026_fitment_publication_guard.sql-62-  n INTEGER;
infrastructure/migrations\verify\026_fitment_publication_guard.sql-63-BEGIN
infrastructure/migrations\verify\026_fitment_publication_guard.sql-64-  -- 0. Not running as an administrator, or every refusal below is vacuous.
infrastructure/migrations\verify\026_fitment_publication_guard.sql:65:  PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\026_fitment_publication_guard.sql-66-  IF identity.is_platform_admin() THEN
infrastructure/migrations\verify\026_fitment_publication_guard.sql-67-    RAISE EXCEPTION 'check 0 FAILED: assertions are running as admin';
infrastructure/migrations\verify\026_fitment_publication_guard.sql-68-  END IF;
infrastructure/migrations\verify\026_fitment_publication_guard.sql-69-  PERFORM set_config('app.user_id', (SELECT v FROM _fx WHERE k='member')::text, true);
infrastructure/migrations\verify\026_fitment_publication_guard.sql-70-  RAISE NOTICE 'check 0 OK: assertions run as a non-admin supplier member';
--
infrastructure/migrations\verify\026_fitment_publication_guard.sql-122-
infrastructure/migrations\verify\026_fitment_publication_guard.sql-123-  -- 6. THE ALTERNATIVE THE REFUSAL NAMES IS REACHABLE. The error tells the
infrastructure/migrations\verify\026_fitment_publication_guard.sql-124-  --    supplier to have the part withdrawn, edited and republished. If any step
infrastructure/migrations\verify\026_fitment_publication_guard.sql-125-  --    of that were impossible the rule would be a wall, which in this
infrastructure/migrations\verify\026_fitment_publication_guard.sql-126-  --    repository has been the most expensive defect class of all. Walk it.
infrastructure/migrations\verify\026_fitment_publication_guard.sql:127:  PERFORM set_config('app.current_role', 'platform_administrator', true);
infrastructure/migrations\verify\026_fitment_publication_guard.sql-128-  UPDATE catalogue.parts SET is_published = FALSE WHERE id = (SELECT v FROM _fx WHERE k='live');
infrastructure/migrations\verify\026_fitment_publication_guard.sql-129-  GET DIAGNOSTICS n = ROW_COUNT;
infrastructure/migrations\verify\026_fitment_publication_guard.sql-130-  IF n <> 1 THEN
infrastructure/migrations\verify\026_fitment_publication_guard.sql-131-    RAISE EXCEPTION 'check 6 FAILED: an administrator could not withdraw the part (% rows)', n;
infrastructure/migrations\verify\026_fitment_publication_guard.sql-132-  END IF;
infrastructure/migrations\verify\026_fitment_publication_guard.sql-133-
infrastructure/migrations\verify\026_fitment_publication_guard.sql:134:  PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\026_fitment_publication_guard.sql-135-  INSERT INTO catalogue.part_fitments (part_id, make, model, year_from, year_to)
infrastructure/migrations\verify\026_fitment_publication_guard.sql-136-  VALUES ((SELECT v FROM _fx WHERE k='live'), 'Toyota', 'Corolla', 2012, 2018);
infrastructure/migrations\verify\026_fitment_publication_guard.sql-137-  GET DIAGNOSTICS n = ROW_COUNT;
infrastructure/migrations\verify\026_fitment_publication_guard.sql-138-  IF n <> 1 THEN
infrastructure/migrations\verify\026_fitment_publication_guard.sql-139-    RAISE EXCEPTION 'check 6 FAILED: the supplier still could not edit after withdrawal (% rows)', n;
infrastructure/migrations\verify\026_fitment_publication_guard.sql-140-  END IF;
infrastructure/migrations\verify\026_fitment_publication_guard.sql-141-
infrastructure/migrations\verify\026_fitment_publication_guard.sql:142:  PERFORM set_config('app.current_role', 'platform_administrator', true);
infrastructure/migrations\verify\026_fitment_publication_guard.sql-143-  UPDATE catalogue.parts SET is_published = TRUE WHERE id = (SELECT v FROM _fx WHERE k='live');
infrastructure/migrations\verify\026_fitment_publication_guard.sql-144-  GET DIAGNOSTICS n = ROW_COUNT;
infrastructure/migrations\verify\026_fitment_publication_guard.sql-145-  IF n <> 1 THEN
infrastructure/migrations\verify\026_fitment_publication_guard.sql-146-    RAISE EXCEPTION 'check 6 FAILED: an administrator could not republish (% rows)', n;
infrastructure/migrations\verify\026_fitment_publication_guard.sql-147-  END IF;
infrastructure/migrations\verify\026_fitment_publication_guard.sql-148-  RAISE NOTICE 'check 6 OK: withdraw -> supplier edits -> republish is genuinely walkable';
infrastructure/migrations\verify\026_fitment_publication_guard.sql-149-
infrastructure/migrations\verify\026_fitment_publication_guard.sql-150-  -- 7. An administrator may correct a live fitment directly, without the
infrastructure/migrations\verify\026_fitment_publication_guard.sql-151-  --    withdraw dance. Support needs one route that does not require taking a
infrastructure/migrations\verify\026_fitment_publication_guard.sql-152-  --    listing off the internet.
infrastructure/migrations\verify\026_fitment_publication_guard.sql:153:  PERFORM set_config('app.current_role', 'platform_administrator', true);
infrastructure/migrations\verify\026_fitment_publication_guard.sql-154-  UPDATE catalogue.part_fitments SET year_to = 2020
infrastructure/migrations\verify\026_fitment_publication_guard.sql-155-   WHERE part_id = (SELECT v FROM _fx WHERE k='live') AND model = 'Camry';
infrastructure/migrations\verify\026_fitment_publication_guard.sql-156-  GET DIAGNOSTICS n = ROW_COUNT;
infrastructure/migrations\verify\026_fitment_publication_guard.sql-157-  IF n <> 1 THEN
infrastructure/migrations\verify\026_fitment_publication_guard.sql-158-    RAISE EXCEPTION 'check 7 FAILED: an administrator could not correct a live fitment (% rows)', n;
--
infrastructure/migrations\verify\025_platform_admin_role_name.sql-11---
infrastructure/migrations\verify\025_platform_admin_role_name.sql-12--- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.
infrastructure/migrations\verify\025_platform_admin_role_name.sql-13-
infrastructure/migrations\verify\025_platform_admin_role_name.sql-14-BEGIN;
infrastructure/migrations\verify\025_platform_admin_role_name.sql-15-
infrastructure/migrations\verify\025_platform_admin_role_name.sql:16:SELECT set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\025_platform_admin_role_name.sql-17-
infrastructure/migrations\verify\025_platform_admin_role_name.sql-18-CREATE TEMP TABLE _fx (k TEXT PRIMARY KEY, v UUID) ON COMMIT DROP;
infrastructure/migrations\verify\025_platform_admin_role_name.sql-19-GRANT SELECT ON _fx TO autoworkshop_app;
infrastructure/migrations\verify\025_platform_admin_role_name.sql-20-
infrastructure/migrations\verify\025_platform_admin_role_name.sql-21--- `stranger` holds NO supplier membership, which is what makes checks 6 and 7
--
infrastructure/migrations\verify\025_platform_admin_role_name.sql-49-  PERFORM set_config('app.user_id', (SELECT v FROM _fx WHERE k='supplier_member')::text, true);
infrastructure/migrations\verify\025_platform_admin_role_name.sql-50-
infrastructure/migrations\verify\025_platform_admin_role_name.sql-51-  -- 1. 🔴 THE REGRESSION ITSELF. `platform_administrator` is the role name the
infrastructure/migrations\verify\025_platform_admin_role_name.sql-52-  --    application actually sets, from `identity.memberships.role_name`. Before
infrastructure/migrations\verify\025_platform_admin_role_name.sql-53-  --    025 this UPDATE affected ZERO rows and raised nothing at all.
infrastructure/migrations\verify\025_platform_admin_role_name.sql:54:  PERFORM set_config('app.current_role', 'platform_administrator', true);
infrastructure/migrations\verify\025_platform_admin_role_name.sql-55-  UPDATE catalogue.parts SET is_published = TRUE WHERE part_number = 'VERIFY-025-DRAFT';
infrastructure/migrations\verify\025_platform_admin_role_name.sql-56-  GET DIAGNOSTICS n = ROW_COUNT;
infrastructure/migrations\verify\025_platform_admin_role_name.sql-57-  IF n <> 1 THEN
infrastructure/migrations\verify\025_platform_admin_role_name.sql-58-    RAISE EXCEPTION
infrastructure/migrations\verify\025_platform_admin_role_name.sql-59-      'check 1 FAILED: a platform_administrator published % rows, expected 1 — '
--
infrastructure/migrations\verify\025_platform_admin_role_name.sql-80-  RAISE NOTICE 'check 3 OK: platform_administrator CAN approve a supplier';
infrastructure/migrations\verify\025_platform_admin_role_name.sql-81-
infrastructure/migrations\verify\025_platform_admin_role_name.sql-82-  -- 4. The seed/psql name STILL works. Dropping it would break
infrastructure/migrations\verify\025_platform_admin_role_name.sql-83-  --    `seed-dev-catalogue.sh` and every verify script in this directory —
infrastructure/migrations\verify\025_platform_admin_role_name.sql-84-  --    breakage that is loud, but pointless.
infrastructure/migrations\verify\025_platform_admin_role_name.sql:85:  PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\025_platform_admin_role_name.sql-86-  UPDATE catalogue.parts SET description = 'touched by admin' WHERE part_number = 'VERIFY-025-DRAFT';
infrastructure/migrations\verify\025_platform_admin_role_name.sql-87-  GET DIAGNOSTICS n = ROW_COUNT;
infrastructure/migrations\verify\025_platform_admin_role_name.sql-88-  IF n <> 1 THEN
infrastructure/migrations\verify\025_platform_admin_role_name.sql-89-    RAISE EXCEPTION 'check 4 FAILED: the literal admin role lost its write access (% rows)', n;
infrastructure/migrations\verify\025_platform_admin_role_name.sql-90-  END IF;
infrastructure/migrations\verify\025_platform_admin_role_name.sql-91-  RAISE NOTICE 'check 4 OK: the seed/psql `admin` name still works';
infrastructure/migrations\verify\025_platform_admin_role_name.sql-92-
infrastructure/migrations\verify\025_platform_admin_role_name.sql-93-  -- 5. 🔴 THE FIX DID NOT WIDEN THE DOOR. A supplier member is still refused —
infrastructure/migrations\verify\025_platform_admin_role_name.sql-94-  --    if this passes, 025 has turned every signed-in supplier into an
infrastructure/migrations\verify\025_platform_admin_role_name.sql-95-  --    administrator, which is far worse than the bug it fixes.
infrastructure/migrations\verify\025_platform_admin_role_name.sql:96:  PERFORM set_config('app.current_role', 'supplier_owner', true);
infrastructure/migrations\verify\025_platform_admin_role_name.sql-97-  BEGIN
infrastructure/migrations\verify\025_platform_admin_role_name.sql-98-    UPDATE catalogue.parts SET is_published = TRUE WHERE part_number = 'VERIFY-025-DRAFT';
infrastructure/migrations\verify\025_platform_admin_role_name.sql-99-    RAISE EXCEPTION 'check 5 FAILED: a supplier published a part after 025';
infrastructure/migrations\verify\025_platform_admin_role_name.sql-100-  EXCEPTION WHEN insufficient_privilege THEN
infrastructure/migrations\verify\025_platform_admin_role_name.sql-101-    RAISE NOTICE 'check 5 OK: a supplier is still refused';
--
infrastructure/migrations\verify\025_platform_admin_role_name.sql-104-  -- ⚠️ SWITCH TO A NON-MEMBER FOR THE REMAINING CHECKS, and this correction is
infrastructure/migrations\verify\025_platform_admin_role_name.sql-105-  -- worth recording. Written first with `app.user_id` still set to the supplier
infrastructure/migrations\verify\025_platform_admin_role_name.sql-106-  -- MEMBER, check 6 failed at `1 rows` — and the migration was right, the test
infrastructure/migrations\verify\025_platform_admin_role_name.sql-107-  -- was wrong. 024's `supplier_manage_own` policy is keyed on MEMBERSHIP, not
infrastructure/migrations\verify\025_platform_admin_role_name.sql-108-  -- on role, so a supplier member renaming their own part is allowed however
infrastructure/migrations\verify\025_platform_admin_role_name.sql:109:  -- `app.current_role` is set. The check proved nothing about role names
infrastructure/migrations\verify\025_platform_admin_role_name.sql-110-  -- because membership had already granted the write.
infrastructure/migrations\verify\025_platform_admin_role_name.sql-111-  --
infrastructure/migrations\verify\025_platform_admin_role_name.sql-112-  -- To ask "is this ROLE an administrator?" the actor must hold no other route
infrastructure/migrations\verify\025_platform_admin_role_name.sql-113-  -- to the row.
infrastructure/migrations\verify\025_platform_admin_role_name.sql-114-  PERFORM set_config('app.user_id', (SELECT v FROM _fx WHERE k='stranger')::text, true);
infrastructure/migrations\verify\025_platform_admin_role_name.sql-115-
infrastructure/migrations\verify\025_platform_admin_role_name.sql-116-  -- 6. An ordinary workshop role is not an administrator. `admin` and
infrastructure/migrations\verify\025_platform_admin_role_name.sql-117-  --    `platform_administrator` are the ONLY accepted names, so a role that
infrastructure/migrations\verify\025_platform_admin_role_name.sql-118-  --    merely sounds senior must write nothing.
infrastructure/migrations\verify\025_platform_admin_role_name.sql:119:  PERFORM set_config('app.current_role', 'workshop_owner', true);
infrastructure/migrations\verify\025_platform_admin_role_name.sql-120-  UPDATE catalogue.parts SET name = 'renamed by a workshop owner'
infrastructure/migrations\verify\025_platform_admin_role_name.sql-121-   WHERE part_number = 'VERIFY-025-DRAFT';
infrastructure/migrations\verify\025_platform_admin_role_name.sql-122-  GET DIAGNOSTICS n = ROW_COUNT;
infrastructure/migrations\verify\025_platform_admin_role_name.sql-123-  IF n <> 0 THEN
infrastructure/migrations\verify\025_platform_admin_role_name.sql-124-    RAISE EXCEPTION 'check 6 FAILED: workshop_owner wrote the public catalogue (% rows)', n;
--
infrastructure/migrations\verify\025_platform_admin_role_name.sql-126-  RAISE NOTICE 'check 6 OK: a workshop_owner is not a platform administrator';
infrastructure/migrations\verify\025_platform_admin_role_name.sql-127-
infrastructure/migrations\verify\025_platform_admin_role_name.sql-128-  -- 6b. CONTROL for check 6. A zero row count also happens when the row cannot
infrastructure/migrations\verify\025_platform_admin_role_name.sql-129-  --     be FOUND, so prove the same statement as an administrator reaches it —
infrastructure/migrations\verify\025_platform_admin_role_name.sql-130-  --     otherwise check 6 would pass against a typo in the part number.
infrastructure/migrations\verify\025_platform_admin_role_name.sql:131:  PERFORM set_config('app.current_role', 'platform_administrator', true);
infrastructure/migrations\verify\025_platform_admin_role_name.sql-132-  UPDATE catalogue.parts SET name = 'renamed by an administrator'
infrastructure/migrations\verify\025_platform_admin_role_name.sql-133-   WHERE part_number = 'VERIFY-025-DRAFT';
infrastructure/migrations\verify\025_platform_admin_role_name.sql-134-  GET DIAGNOSTICS n = ROW_COUNT;
infrastructure/migrations\verify\025_platform_admin_role_name.sql-135-  IF n <> 1 THEN
infrastructure/migrations\verify\025_platform_admin_role_name.sql-136-    RAISE EXCEPTION
--
infrastructure/migrations\verify\025_platform_admin_role_name.sql-138-      'check 6 passed vacuously', n;
infrastructure/migrations\verify\025_platform_admin_role_name.sql-139-  END IF;
infrastructure/migrations\verify\025_platform_admin_role_name.sql-140-  RAISE NOTICE 'check 6b OK: the same statement DOES reach the row as an administrator';
infrastructure/migrations\verify\025_platform_admin_role_name.sql-141-
infrastructure/migrations\verify\025_platform_admin_role_name.sql-142-  -- 7. And an unset role writes nothing. Fail closed.
infrastructure/migrations\verify\025_platform_admin_role_name.sql:143:  PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\025_platform_admin_role_name.sql-144-  UPDATE catalogue.parts SET name = 'renamed by nobody' WHERE part_number = 'VERIFY-025-DRAFT';
infrastructure/migrations\verify\025_platform_admin_role_name.sql-145-  GET DIAGNOSTICS n = ROW_COUNT;
infrastructure/migrations\verify\025_platform_admin_role_name.sql-146-  IF n <> 0 THEN
infrastructure/migrations\verify\025_platform_admin_role_name.sql-147-    RAISE EXCEPTION 'check 7 FAILED: an unset role wrote the catalogue (% rows)', n;
infrastructure/migrations\verify\025_platform_admin_role_name.sql-148-  END IF;
--
infrastructure/migrations\verify\024_supplier_catalogue.sql-23--- sets this before every catalogue write for the same reason.
infrastructure/migrations\verify\024_supplier_catalogue.sql-24---
infrastructure/migrations\verify\024_supplier_catalogue.sql-25--- It is CLEARED again at the top of the assertion block below. Leaving it set
infrastructure/migrations\verify\024_supplier_catalogue.sql-26--- would make every check run as an administrator, and every refusal test would
infrastructure/migrations\verify\024_supplier_catalogue.sql-27--- pass by never being reached — check 0 exists to prove that did not happen.
infrastructure/migrations\verify\024_supplier_catalogue.sql:28:SELECT set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\024_supplier_catalogue.sql-29-
infrastructure/migrations\verify\024_supplier_catalogue.sql-30-CREATE TEMP TABLE _fx (k TEXT PRIMARY KEY, v UUID) ON COMMIT DROP;
infrastructure/migrations\verify\024_supplier_catalogue.sql-31-GRANT SELECT ON _fx TO autoworkshop_app;
infrastructure/migrations\verify\024_supplier_catalogue.sql-32-
infrastructure/migrations\verify\024_supplier_catalogue.sql-33-INSERT INTO _fx (k, v) VALUES
--
infrastructure/migrations\verify\024_supplier_catalogue.sql-75-  v_draft UUID;
infrastructure/migrations\verify\024_supplier_catalogue.sql-76-  v_new_supplier UUID;
infrastructure/migrations\verify\024_supplier_catalogue.sql-77-BEGIN
infrastructure/migrations\verify\024_supplier_catalogue.sql-78-  -- 0. THE TEST IS NOT RUNNING AS AN ADMINISTRATOR.
infrastructure/migrations\verify\024_supplier_catalogue.sql-79-  --
infrastructure/migrations\verify\024_supplier_catalogue.sql:80:  -- The seed phase above needed `app.current_role='admin'`, and that GUC is
infrastructure/migrations\verify\024_supplier_catalogue.sql-81-  -- transaction-local — it survives into this block unless cleared. If it did,
infrastructure/migrations\verify\024_supplier_catalogue.sql-82-  -- every trigger below would take its admin early-return and all eleven
infrastructure/migrations\verify\024_supplier_catalogue.sql-83-  -- refusal tests would pass without exercising a single rule. This is the
infrastructure/migrations\verify\024_supplier_catalogue.sql-84-  -- check that makes the rest of the file mean something.
infrastructure/migrations\verify\024_supplier_catalogue.sql:85:  PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\024_supplier_catalogue.sql:86:  IF identity.current_role_name() = 'admin' THEN
infrastructure/migrations\verify\024_supplier_catalogue.sql-87-    RAISE EXCEPTION 'check 0 FAILED: assertions are running as admin — every refusal below is vacuous';
infrastructure/migrations\verify\024_supplier_catalogue.sql-88-  END IF;
infrastructure/migrations\verify\024_supplier_catalogue.sql-89-  RAISE NOTICE 'check 0 OK: assertions run as a non-admin supplier member';
infrastructure/migrations\verify\024_supplier_catalogue.sql-90-
infrastructure/migrations\verify\024_supplier_catalogue.sql-91-  PERFORM set_config('app.user_id', (SELECT v FROM _fx WHERE k='owner_1')::text, true);
--
infrastructure/migrations\verify\024_supplier_catalogue.sql-301-  END;
infrastructure/migrations\verify\024_supplier_catalogue.sql-302-
infrastructure/migrations\verify\024_supplier_catalogue.sql-303-  -- 15. THE GUARD IS NOT A WALL. An administrator publishes — the action the
infrastructure/migrations\verify\024_supplier_catalogue.sql-304-  --     whole slice exists to route through them. If this fails, suppliers can
infrastructure/migrations\verify\024_supplier_catalogue.sql-305-  --     never be approved and the marketplace still cannot grow.
infrastructure/migrations\verify\024_supplier_catalogue.sql:306:  PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\024_supplier_catalogue.sql-307-  UPDATE catalogue.parts SET is_published = TRUE WHERE id = v_draft;
infrastructure/migrations\verify\024_supplier_catalogue.sql-308-  GET DIAGNOSTICS n = ROW_COUNT;
infrastructure/migrations\verify\024_supplier_catalogue.sql-309-  IF n <> 1 THEN
infrastructure/migrations\verify\024_supplier_catalogue.sql-310-    RAISE EXCEPTION 'check 15 FAILED: an ADMINISTRATOR could not publish a part (% rows)', n;
infrastructure/migrations\verify\024_supplier_catalogue.sql-311-  END IF;
--
infrastructure/migrations\014_repair_plans.sql-522-
infrastructure/migrations\014_repair_plans.sql-523-ALTER TABLE repair.repair_plans ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\014_repair_plans.sql-524-ALTER TABLE repair.repair_plans FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\014_repair_plans.sql-525-
infrastructure/migrations\014_repair_plans.sql-526-DROP POLICY IF EXISTS tenant_isolation ON repair.repair_plans;
infrastructure/migrations\014_repair_plans.sql:527:CREATE POLICY tenant_isolation ON repair.repair_plans
infrastructure/migrations\014_repair_plans.sql-528-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\014_repair_plans.sql-529-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\014_repair_plans.sql-530-
infrastructure/migrations\014_repair_plans.sql-531-ALTER TABLE repair.repair_plan_tasks ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\014_repair_plans.sql-532-ALTER TABLE repair.repair_plan_tasks FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\014_repair_plans.sql-533-
infrastructure/migrations\014_repair_plans.sql-534-DROP POLICY IF EXISTS tenant_isolation ON repair.repair_plan_tasks;
infrastructure/migrations\014_repair_plans.sql:535:CREATE POLICY tenant_isolation ON repair.repair_plan_tasks
infrastructure/migrations\014_repair_plans.sql-536-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\014_repair_plans.sql-537-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\014_repair_plans.sql-538-
infrastructure/migrations\014_repair_plans.sql-539-ALTER TABLE repair.repair_plan_resources ENABLE ROW LEVEL SECURITY;
infrastructure/migrations\014_repair_plans.sql-540-ALTER TABLE repair.repair_plan_resources FORCE  ROW LEVEL SECURITY;
infrastructure/migrations\014_repair_plans.sql-541-
infrastructure/migrations\014_repair_plans.sql-542-DROP POLICY IF EXISTS tenant_isolation ON repair.repair_plan_resources;
infrastructure/migrations\014_repair_plans.sql:543:CREATE POLICY tenant_isolation ON repair.repair_plan_resources
infrastructure/migrations\014_repair_plans.sql-544-    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
infrastructure/migrations\014_repair_plans.sql-545-    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());
infrastructure/migrations\014_repair_plans.sql-546-
infrastructure/migrations\014_repair_plans.sql-547--- ── grants ──────────────────────────────────────────────────────────────────
infrastructure/migrations\014_repair_plans.sql-548---
--
infrastructure/migrations\verify\021_public_catalogue.sql-12--- seeded database without changing it.
infrastructure/migrations\verify\021_public_catalogue.sql-13-
infrastructure/migrations\verify\021_public_catalogue.sql-14-BEGIN;
infrastructure/migrations\verify\021_public_catalogue.sql-15-
infrastructure/migrations\verify\021_public_catalogue.sql-16-SET LOCAL ROLE autoworkshop_app;
infrastructure/migrations\verify\021_public_catalogue.sql:17:-- Deliberately NOT set: app.current_tenant, app.current_role. A public reader
infrastructure/migrations\verify\021_public_catalogue.sql-18--- has neither, and if any check below needs one the endpoint is not public.
infrastructure/migrations\verify\021_public_catalogue.sql-19-
infrastructure/migrations\verify\021_public_catalogue.sql-20-DO $$
infrastructure/migrations\verify\021_public_catalogue.sql-21-DECLARE
infrastructure/migrations\verify\021_public_catalogue.sql-22-  n INTEGER;
--
infrastructure/migrations\verify\021_public_catalogue.sql-111-  END IF;
infrastructure/migrations\verify\021_public_catalogue.sql-112-  SELECT count(*) INTO total FROM catalogue.mechanic_directory;
infrastructure/migrations\verify\021_public_catalogue.sql-113-  RAISE NOTICE 'check 8 OK: all % readable mechanic listings are published', total;
infrastructure/migrations\verify\021_public_catalogue.sql-114-
infrastructure/migrations\verify\021_public_catalogue.sql-115-  -- 9. THE PUBLIC ROLE CANNOT WRITE. Reading the catalogue is public; changing
infrastructure/migrations\verify\021_public_catalogue.sql:116:  --    it is not. Without app.current_role='admin' the admin_write policy's
infrastructure/migrations\verify\021_public_catalogue.sql-117-  --    WITH CHECK must refuse the insert.
infrastructure/migrations\verify\021_public_catalogue.sql-118-  BEGIN
infrastructure/migrations\verify\021_public_catalogue.sql-119-    INSERT INTO catalogue.suppliers (slug, name, country, is_published)
infrastructure/migrations\verify\021_public_catalogue.sql-120-    VALUES ('injected-supplier', 'Injected', 'Nowhere', TRUE);
infrastructure/migrations\verify\021_public_catalogue.sql-121-    RAISE EXCEPTION 'check 9 FAILED: public role INSERTED a supplier';
--
infrastructure/migrations\verify\016_quotations.sql-36-    IF v_c IS NULL THEN
infrastructure/migrations\verify\016_quotations.sql-37-        RAISE EXCEPTION 'no job card — run scripts/seed-dev-core.sh first';
infrastructure/migrations\verify\016_quotations.sql-38-    END IF;
infrastructure/migrations\verify\016_quotations.sql-39-
infrastructure/migrations\verify\016_quotations.sql-40-    PERFORM set_config('app.tenant_id', v_t::text, true);
infrastructure/migrations\verify\016_quotations.sql:41:    PERFORM set_config('app.current_role', 'workshop_manager', true);
infrastructure/migrations\verify\016_quotations.sql-42-
infrastructure/migrations\verify\016_quotations.sql-43-    INSERT INTO repair.diagnoses (tenant_id, organization_id, job_card_id, attempt_no)
infrastructure/migrations\verify\016_quotations.sql-44-    VALUES (v_t, v_o, v_c, 9501) RETURNING id INTO v_diag;
infrastructure/migrations\verify\016_quotations.sql-45-    INSERT INTO repair.repair_plans (tenant_id, organization_id, job_card_id, diagnosis_id, attempt_no)
infrastructure/migrations\verify\016_quotations.sql-46-    VALUES (v_t, v_o, v_c, v_diag, 9501) RETURNING id INTO v_plan_a;
--
infrastructure/migrations\verify\015_plan_identity_immutable.sql-47-    IF v_card IS NULL THEN
infrastructure/migrations\verify\015_plan_identity_immutable.sql-48-        RAISE EXCEPTION 'no job card to test against — run scripts/seed-dev-core.sh first';
infrastructure/migrations\verify\015_plan_identity_immutable.sql-49-    END IF;
infrastructure/migrations\verify\015_plan_identity_immutable.sql-50-
infrastructure/migrations\verify\015_plan_identity_immutable.sql-51-    PERFORM set_config('app.tenant_id', v_tenant::text, true);
infrastructure/migrations\verify\015_plan_identity_immutable.sql:52:    PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\015_plan_identity_immutable.sql-53-
infrastructure/migrations\verify\015_plan_identity_immutable.sql-54-    INSERT INTO repair.diagnoses (tenant_id, organization_id, job_card_id, attempt_no)
infrastructure/migrations\verify\015_plan_identity_immutable.sql-55-    VALUES (v_tenant, v_org, v_card, 9401) RETURNING id INTO v_diag_a;
infrastructure/migrations\verify\015_plan_identity_immutable.sql-56-    INSERT INTO repair.diagnoses (tenant_id, organization_id, job_card_id, attempt_no)
infrastructure/migrations\verify\015_plan_identity_immutable.sql-57-    VALUES (v_tenant, v_org, v_card, 9402) RETURNING id INTO v_diag_b;
--
infrastructure/migrations\verify\030_quality_control.sql-14---
infrastructure/migrations\verify\030_quality_control.sql-15--- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.
infrastructure/migrations\verify\030_quality_control.sql-16-
infrastructure/migrations\verify\030_quality_control.sql-17-BEGIN;
infrastructure/migrations\verify\030_quality_control.sql-18-
infrastructure/migrations\verify\030_quality_control.sql:19:SELECT set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\030_quality_control.sql-20-
infrastructure/migrations\verify\030_quality_control.sql-21-CREATE TEMP TABLE _fx (k TEXT PRIMARY KEY, v UUID) ON COMMIT DROP;
infrastructure/migrations\verify\030_quality_control.sql-22-GRANT SELECT ON _fx TO autoworkshop_app;
infrastructure/migrations\verify\030_quality_control.sql-23-
infrastructure/migrations\verify\030_quality_control.sql-24--- A job card that has a SUBMITTED test session, which is the only state QC may
--
infrastructure/migrations\verify\030_quality_control.sql-110-  worker   UUID := (SELECT v FROM _fx WHERE k='worker');
infrastructure/migrations\verify\030_quality_control.sql-111-  outsider UUID := (SELECT v FROM _fx WHERE k='outsider');
infrastructure/migrations\verify\030_quality_control.sql-112-BEGIN
infrastructure/migrations\verify\030_quality_control.sql-113-  PERFORM set_config('app.tenant_id', ten::text, true);
infrastructure/migrations\verify\030_quality_control.sql-114-  PERFORM set_config('app.organization_ids', org::text, true);
infrastructure/migrations\verify\030_quality_control.sql:115:  PERFORM set_config('app.current_role', 'quality_control_inspector', true);
infrastructure/migrations\verify\030_quality_control.sql-116-
infrastructure/migrations\verify\030_quality_control.sql-117-  -- ── 1. THE PREDICATE ITSELF ───────────────────────────────────────────────
infrastructure/migrations\verify\030_quality_control.sql-118-  IF NOT repair.user_worked_on_job_card(card, worker) THEN
infrastructure/migrations\verify\030_quality_control.sql-119-    RAISE EXCEPTION 'check 1 FAILED: the worker is not recognised as having worked on the card';
infrastructure/migrations\verify\030_quality_control.sql-120-  END IF;
--
infrastructure/migrations\verify\014_repair_plans.sql-59-
infrastructure/migrations\verify\014_repair_plans.sql-60-    -- The RLS context the application sets per request. Without it every statement
infrastructure/migrations\verify\014_repair_plans.sql-61-    -- below is invisible to its own policy and the test would "pass" by touching
infrastructure/migrations\verify\014_repair_plans.sql-62-    -- nothing.
infrastructure/migrations\verify\014_repair_plans.sql-63-    PERFORM set_config('app.tenant_id', v_tenant::text, true);
infrastructure/migrations\verify\014_repair_plans.sql:64:    PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\014_repair_plans.sql-65-
infrastructure/migrations\verify\014_repair_plans.sql-66-    -- ── fixtures: one approved diagnosis with a confirmed and a suspected
infrastructure/migrations\verify\014_repair_plans.sql-67-    --    finding, plus a SECOND diagnosis whose finding belongs to nobody here ──
infrastructure/migrations\verify\014_repair_plans.sql-68-    INSERT INTO repair.diagnoses (tenant_id, organization_id, job_card_id, attempt_no)
infrastructure/migrations\verify\014_repair_plans.sql-69-    VALUES (v_tenant, v_org, v_card, 9101)
--
infrastructure/migrations\verify\029_pricing_write_scope.sql-20---
infrastructure/migrations\verify\029_pricing_write_scope.sql-21--- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.
infrastructure/migrations\verify\029_pricing_write_scope.sql-22-
infrastructure/migrations\verify\029_pricing_write_scope.sql-23-BEGIN;
infrastructure/migrations\verify\029_pricing_write_scope.sql-24-
infrastructure/migrations\verify\029_pricing_write_scope.sql:25:SELECT set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\029_pricing_write_scope.sql-26-
infrastructure/migrations\verify\029_pricing_write_scope.sql-27-CREATE TEMP TABLE _fx (k TEXT PRIMARY KEY, v UUID) ON COMMIT DROP;
infrastructure/migrations\verify\029_pricing_write_scope.sql-28-GRANT SELECT ON _fx TO autoworkshop_app;
infrastructure/migrations\verify\029_pricing_write_scope.sql-29-
infrastructure/migrations\verify\029_pricing_write_scope.sql-30--- ⚠️ THE TWO ORGANIZATIONS MUST SHARE A TENANT or check 6 is vacuous: it would
--
infrastructure/migrations\verify\029_pricing_write_scope.sql-96-  PERFORM set_config('app.tenant_id', tid::text, true);
infrastructure/migrations\verify\029_pricing_write_scope.sql-97-  PERFORM set_config('app.organization_ids', org1::text, true);
infrastructure/migrations\verify\029_pricing_write_scope.sql-98-
infrastructure/migrations\verify\029_pricing_write_scope.sql-99-  -- ── 1. THE ORIGINAL DEFECT ────────────────────────────────────────────────
infrastructure/migrations\verify\029_pricing_write_scope.sql-100-  -- Before 029 this UPDATE reported 1 row and the rate became 1.00.
infrastructure/migrations\verify\029_pricing_write_scope.sql:101:  PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\029_pricing_write_scope.sql-102-  UPDATE repair.organization_pricing SET default_labour_rate = 1.00
infrastructure/migrations\verify\029_pricing_write_scope.sql-103-   WHERE organization_id = org1;
infrastructure/migrations\verify\029_pricing_write_scope.sql-104-  GET DIAGNOSTICS n = ROW_COUNT;
infrastructure/migrations\verify\029_pricing_write_scope.sql-105-  IF n <> 0 THEN
infrastructure/migrations\verify\029_pricing_write_scope.sql-106-    RAISE EXCEPTION 'check 1 FAILED: a TECHNICIAN rewrote the labour rate (% rows)', n;
--
infrastructure/migrations\verify\029_pricing_write_scope.sql-108-  RAISE NOTICE 'check 1 OK: a technician cannot rewrite the labour rate';
infrastructure/migrations\verify\029_pricing_write_scope.sql-109-
infrastructure/migrations\verify\029_pricing_write_scope.sql-110-  -- 2. Nor may a MANAGER. `07.txt` pt2 §50 gives the manager "daily operational
infrastructure/migrations\verify\029_pricing_write_scope.sql-111-  --    control" with no financial authority — a separate check because the
infrastructure/migrations\verify\029_pricing_write_scope.sql-112-  --    manager is the role most likely to be quietly re-admitted later.
infrastructure/migrations\verify\029_pricing_write_scope.sql:113:  PERFORM set_config('app.current_role', 'workshop_manager', true);
infrastructure/migrations\verify\029_pricing_write_scope.sql-114-  UPDATE repair.organization_pricing SET default_labour_rate = 2.00
infrastructure/migrations\verify\029_pricing_write_scope.sql-115-   WHERE organization_id = org1;
infrastructure/migrations\verify\029_pricing_write_scope.sql-116-  GET DIAGNOSTICS n = ROW_COUNT;
infrastructure/migrations\verify\029_pricing_write_scope.sql-117-  IF n <> 0 THEN
infrastructure/migrations\verify\029_pricing_write_scope.sql-118-    RAISE EXCEPTION 'check 2 FAILED: a MANAGER rewrote the labour rate (% rows)', n;
--
infrastructure/migrations\verify\029_pricing_write_scope.sql-120-  RAISE NOTICE 'check 2 OK: a manager cannot rewrite the labour rate';
infrastructure/migrations\verify\029_pricing_write_scope.sql-121-
infrastructure/migrations\verify\029_pricing_write_scope.sql-122-  -- ── 3. CONTROL ────────────────────────────────────────────────────────────
infrastructure/migrations\verify\029_pricing_write_scope.sql-123-  -- The owner CAN. Without this, checks 1 and 2 would also pass against a table
infrastructure/migrations\verify\029_pricing_write_scope.sql-124-  -- nobody can write at all, which would be a broken feature reported as a fix.
infrastructure/migrations\verify\029_pricing_write_scope.sql:125:  PERFORM set_config('app.current_role', 'workshop_owner', true);
infrastructure/migrations\verify\029_pricing_write_scope.sql-126-  UPDATE repair.organization_pricing SET default_labour_rate = 95.50
infrastructure/migrations\verify\029_pricing_write_scope.sql-127-   WHERE organization_id = org1;
infrastructure/migrations\verify\029_pricing_write_scope.sql-128-  GET DIAGNOSTICS n = ROW_COUNT;
infrastructure/migrations\verify\029_pricing_write_scope.sql-129-  IF n <> 1 THEN
infrastructure/migrations\verify\029_pricing_write_scope.sql-130-    RAISE EXCEPTION 'check 3 FAILED: the OWNER could not write either (% rows) — checks 1-2 were vacuous', n;
--
infrastructure/migrations\verify\029_pricing_write_scope.sql-134-  -- ── 4. READS STAY TENANT-WIDE, DELIBERATELY ───────────────────────────────
infrastructure/migrations\verify\029_pricing_write_scope.sql-135-  -- `quotation.service.ts` reads this table as whichever role is preparing the
infrastructure/migrations\verify\029_pricing_write_scope.sql-136-  -- quotation. Narrowing the READ to the owner would break quotation
infrastructure/migrations\verify\029_pricing_write_scope.sql-137-  -- preparation for reception, managers and technicians — a worse outcome than
infrastructure/migrations\verify\029_pricing_write_scope.sql-138-  -- the defect being fixed. 029 split SELECT from write precisely to avoid it.
infrastructure/migrations\verify\029_pricing_write_scope.sql:139:  PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\029_pricing_write_scope.sql-140-  SELECT default_labour_rate INTO rate FROM repair.organization_pricing
infrastructure/migrations\verify\029_pricing_write_scope.sql-141-   WHERE organization_id = org1;
infrastructure/migrations\verify\029_pricing_write_scope.sql-142-  IF rate IS NULL THEN
infrastructure/migrations\verify\029_pricing_write_scope.sql-143-    RAISE EXCEPTION 'check 4 FAILED: a technician cannot READ the rate — quotation preparation is broken';
infrastructure/migrations\verify\029_pricing_write_scope.sql-144-  END IF;
--
infrastructure/migrations\verify\029_pricing_write_scope.sql-149-
infrastructure/migrations\verify\029_pricing_write_scope.sql-150-  -- ── 5. THE INSERT POLICY, GENUINELY EXERCISED ─────────────────────────────
infrastructure/migrations\verify\029_pricing_write_scope.sql-151-  -- org_2 has NO pricing row, so this INSERT reaches `owner_write`'s WITH CHECK
infrastructure/migrations\verify\029_pricing_write_scope.sql-152-  -- instead of being refused by the primary key first. The role is the OWNER and
infrastructure/migrations\verify\029_pricing_write_scope.sql-153-  -- the tenant matches; only the ORGANIZATION predicate can refuse it.
infrastructure/migrations\verify\029_pricing_write_scope.sql:154:  PERFORM set_config('app.current_role', 'workshop_owner', true);
infrastructure/migrations\verify\029_pricing_write_scope.sql-155-  BEGIN
infrastructure/migrations\verify\029_pricing_write_scope.sql-156-    INSERT INTO repair.organization_pricing (organization_id, tenant_id, default_labour_rate)
infrastructure/migrations\verify\029_pricing_write_scope.sql-157-    VALUES (org2, tid, 5.00);
infrastructure/migrations\verify\029_pricing_write_scope.sql-158-    RAISE EXCEPTION 'check 5 FAILED: workshop 1 owner CREATED pricing for workshop 2';
infrastructure/migrations\verify\029_pricing_write_scope.sql-159-  EXCEPTION WHEN insufficient_privilege THEN
--
infrastructure/migrations\verify\029_pricing_write_scope.sql-173-
infrastructure/migrations\verify\029_pricing_write_scope.sql-174-  -- 7. And a technician in org_1 reads the sibling workshop's rate — unchanged
infrastructure/migrations\verify\029_pricing_write_scope.sql-175-  --    from 016. Stated as a check so a later narrowing of the read predicate is
infrastructure/migrations\verify\029_pricing_write_scope.sql-176-  --    caught here rather than by a broken quotation.
infrastructure/migrations\verify\029_pricing_write_scope.sql-177-  PERFORM set_config('app.organization_ids', org1::text, true);
infrastructure/migrations\verify\029_pricing_write_scope.sql:178:  PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\029_pricing_write_scope.sql-179-  SELECT default_labour_rate INTO rate FROM repair.organization_pricing
infrastructure/migrations\verify\029_pricing_write_scope.sql-180-   WHERE organization_id = org2;
infrastructure/migrations\verify\029_pricing_write_scope.sql-181-  IF rate IS NULL THEN
infrastructure/migrations\verify\029_pricing_write_scope.sql-182-    RAISE EXCEPTION 'check 7 FAILED: the tenant-wide READ was narrowed';
infrastructure/migrations\verify\029_pricing_write_scope.sql-183-  END IF;
--
infrastructure/migrations\verify\029_pricing_write_scope.sql-185-
infrastructure/migrations\verify\029_pricing_write_scope.sql-186-  -- ── 8. THE WRONG-KEY DEFECT ───────────────────────────────────────────────
infrastructure/migrations\verify\029_pricing_write_scope.sql-187-  -- 🔴 The heart of it. `app.organization_ids` is org_1 and the role is the
infrastructure/migrations\verify\029_pricing_write_scope.sql-188-  -- OWNER — every condition the old TENANT-keyed policy tested is satisfied.
infrastructure/migrations\verify\029_pricing_write_scope.sql-189-  -- Only the organization predicate 029 added can refuse this.
infrastructure/migrations\verify\029_pricing_write_scope.sql:190:  PERFORM set_config('app.current_role', 'workshop_owner', true);
infrastructure/migrations\verify\029_pricing_write_scope.sql-191-  UPDATE repair.organization_pricing SET default_labour_rate = 3.00
infrastructure/migrations\verify\029_pricing_write_scope.sql-192-   WHERE organization_id = org2;
infrastructure/migrations\verify\029_pricing_write_scope.sql-193-  GET DIAGNOSTICS n = ROW_COUNT;
infrastructure/migrations\verify\029_pricing_write_scope.sql-194-  IF n <> 0 THEN
infrastructure/migrations\verify\029_pricing_write_scope.sql-195-    RAISE EXCEPTION
--
infrastructure/migrations\verify\028_directory_member_read.sql-13---
infrastructure/migrations\verify\028_directory_member_read.sql-14--- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.
infrastructure/migrations\verify\028_directory_member_read.sql-15-
infrastructure/migrations\verify\028_directory_member_read.sql-16-BEGIN;
infrastructure/migrations\verify\028_directory_member_read.sql-17-
infrastructure/migrations\verify\028_directory_member_read.sql:18:SELECT set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\028_directory_member_read.sql-19-
infrastructure/migrations\verify\028_directory_member_read.sql-20-CREATE TEMP TABLE _fx (k TEXT PRIMARY KEY, v UUID) ON COMMIT DROP;
infrastructure/migrations\verify\028_directory_member_read.sql-21-GRANT SELECT ON _fx TO autoworkshop_app;
infrastructure/migrations\verify\028_directory_member_read.sql-22-
infrastructure/migrations\verify\028_directory_member_read.sql-23-INSERT INTO _fx (k, v)
--
infrastructure/migrations\verify\028_directory_member_read.sql-44-
infrastructure/migrations\verify\028_directory_member_read.sql-45-DO $$
infrastructure/migrations\verify\028_directory_member_read.sql-46-DECLARE
infrastructure/migrations\verify\028_directory_member_read.sql-47-  n INTEGER;
infrastructure/migrations\verify\028_directory_member_read.sql-48-BEGIN
infrastructure/migrations\verify\028_directory_member_read.sql:49:  PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\028_directory_member_read.sql-50-  PERFORM set_config('app.organization_ids', (SELECT v FROM _fx WHERE k='org_1')::text, true);
infrastructure/migrations\verify\028_directory_member_read.sql-51-
infrastructure/migrations\verify\028_directory_member_read.sql-52-  -- 1. 🔴 THE REGRESSION. Before 028 every one of these returned 0.
infrastructure/migrations\verify\028_directory_member_read.sql:53:  PERFORM set_config('app.current_role', 'workshop_manager', true);
infrastructure/migrations\verify\028_directory_member_read.sql-54-  SELECT count(*) INTO n FROM catalogue.mechanic_directory
infrastructure/migrations\verify\028_directory_member_read.sql-55-   WHERE organization_id = (SELECT v FROM _fx WHERE k='org_1');
infrastructure/migrations\verify\028_directory_member_read.sql-56-  IF n <> 1 THEN
infrastructure/migrations\verify\028_directory_member_read.sql-57-    RAISE EXCEPTION 'check 1 FAILED: a manager cannot see its own unpublished listing (% rows)', n;
infrastructure/migrations\verify\028_directory_member_read.sql-58-  END IF;
infrastructure/migrations\verify\028_directory_member_read.sql-59-  RAISE NOTICE 'check 1 OK: a MANAGER sees its own unpublished listing';
infrastructure/migrations\verify\028_directory_member_read.sql-60-
infrastructure/migrations\verify\028_directory_member_read.sql:61:  PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\028_directory_member_read.sql-62-  SELECT count(*) INTO n FROM catalogue.mechanic_directory
infrastructure/migrations\verify\028_directory_member_read.sql-63-   WHERE organization_id = (SELECT v FROM _fx WHERE k='org_1');
infrastructure/migrations\verify\028_directory_member_read.sql-64-  IF n <> 1 THEN
infrastructure/migrations\verify\028_directory_member_read.sql-65-    RAISE EXCEPTION 'check 2 FAILED: a technician cannot see its own unpublished listing (% rows)', n;
infrastructure/migrations\verify\028_directory_member_read.sql-66-  END IF;
--
infrastructure/migrations\verify\028_directory_member_read.sql-86-  END IF;
infrastructure/migrations\verify\028_directory_member_read.sql-87-  RAISE NOTICE 'check 4 OK: a technician still cannot publish';
infrastructure/migrations\verify\028_directory_member_read.sql-88-
infrastructure/migrations\verify\028_directory_member_read.sql-89-  -- 5. CONTROL. The owner still can, so check 4 is about the ROLE and not about
infrastructure/migrations\verify\028_directory_member_read.sql-90-  --    an unreachable row.
infrastructure/migrations\verify\028_directory_member_read.sql:91:  PERFORM set_config('app.current_role', 'workshop_owner', true);
infrastructure/migrations\verify\028_directory_member_read.sql-92-  UPDATE catalogue.mechanic_directory SET is_published = TRUE
infrastructure/migrations\verify\028_directory_member_read.sql-93-   WHERE organization_id = (SELECT v FROM _fx WHERE k='org_1');
infrastructure/migrations\verify\028_directory_member_read.sql-94-  GET DIAGNOSTICS n = ROW_COUNT;
infrastructure/migrations\verify\028_directory_member_read.sql-95-  IF n <> 1 THEN
infrastructure/migrations\verify\028_directory_member_read.sql-96-    RAISE EXCEPTION 'check 5 FAILED: the owner could not publish either — check 4 was vacuous';
infrastructure/migrations\verify\028_directory_member_read.sql-97-  END IF;
infrastructure/migrations\verify\028_directory_member_read.sql-98-  RAISE NOTICE 'check 5 OK: the owner CAN still publish';
infrastructure/migrations\verify\028_directory_member_read.sql-99-
infrastructure/migrations\verify\028_directory_member_read.sql-100-  -- 6. Anonymous readers are unaffected: published only.
infrastructure/migrations\verify\028_directory_member_read.sql:101:  PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\028_directory_member_read.sql-102-  PERFORM set_config('app.organization_ids', '', true);
infrastructure/migrations\verify\028_directory_member_read.sql-103-  SELECT count(*) INTO n FROM catalogue.mechanic_directory WHERE NOT is_published;
infrastructure/migrations\verify\028_directory_member_read.sql-104-  IF n <> 0 THEN
infrastructure/migrations\verify\028_directory_member_read.sql-105-    RAISE EXCEPTION 'check 6 FAILED: an anonymous reader sees % unpublished listings', n;
infrastructure/migrations\verify\028_directory_member_read.sql-106-  END IF;
--
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-14---
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-15--- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-16-
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-17-BEGIN;
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-18-
infrastructure/migrations\verify\027_mechanic_directory_optin.sql:19:SELECT set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-20-
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-21-CREATE TEMP TABLE _fx (k TEXT PRIMARY KEY, v UUID) ON COMMIT DROP;
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-22-GRANT SELECT ON _fx TO autoworkshop_app;
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-23-
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-24--- TWO organizations. One alone cannot show that the predicate keys on
--
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-47-DO $$
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-48-DECLARE
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-49-  n INTEGER;
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-50-BEGIN
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-51-  -- 0. Not an administrator, or every refusal below is vacuous.
infrastructure/migrations\verify\027_mechanic_directory_optin.sql:52:  PERFORM set_config('app.current_role', 'workshop_owner', true);
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-53-  PERFORM set_config('app.organization_ids', (SELECT v FROM _fx WHERE k='org_1')::text, true);
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-54-  IF identity.is_platform_admin() THEN
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-55-    RAISE EXCEPTION 'check 0 FAILED: assertions are running as admin';
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-56-  END IF;
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-57-  IF identity.current_organization_id() <> (SELECT v FROM _fx WHERE k='org_1') THEN
--
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-138-  END;
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-139-
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-140-  -- 8. ROLE. A technician in the SAME organization may not speak for the
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-141-  --    workshop in public. Role and organization are separate conditions and
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-142-  --    this is the one a policy keyed only on organization would miss.
infrastructure/migrations\verify\027_mechanic_directory_optin.sql:143:  PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-144-  UPDATE catalogue.mechanic_directory SET is_published = TRUE
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-145-   WHERE organization_id = (SELECT v FROM _fx WHERE k='org_1');
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-146-  GET DIAGNOSTICS n = ROW_COUNT;
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-147-  IF n <> 0 THEN
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-148-    RAISE EXCEPTION 'check 8 FAILED: a technician published the workshop (% rows)', n;
--
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-151-
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-152-  -- 8a. A MANAGER is not an owner either, and this is the likelier accidental
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-153-  --     allow of the two: "daily operational control" (§50) sounds like it
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-154-  --     ought to cover the workshop's own profile. Testing only `technician`
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-155-  --     would let a later widening to manager pass unnoticed — Codex, LOW.
infrastructure/migrations\verify\027_mechanic_directory_optin.sql:156:  PERFORM set_config('app.current_role', 'workshop_manager', true);
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-157-  UPDATE catalogue.mechanic_directory SET is_published = TRUE
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-158-   WHERE organization_id = (SELECT v FROM _fx WHERE k='org_1');
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-159-  GET DIAGNOSTICS n = ROW_COUNT;
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-160-  IF n <> 0 THEN
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-161-    RAISE EXCEPTION 'check 8a FAILED: a workshop_manager published the workshop (% rows)', n;
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-162-  END IF;
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-163-  RAISE NOTICE 'check 8a OK: a workshop_manager cannot publish the workshop';
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-164-
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-165-  -- 8b. CONTROL for check 8. A zero row count also happens when the row cannot
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-166-  --     be found, so prove the owner still reaches the same row.
infrastructure/migrations\verify\027_mechanic_directory_optin.sql:167:  PERFORM set_config('app.current_role', 'workshop_owner', true);
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-168-  UPDATE catalogue.mechanic_directory SET is_published = TRUE
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-169-   WHERE organization_id = (SELECT v FROM _fx WHERE k='org_1');
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-170-  GET DIAGNOSTICS n = ROW_COUNT;
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-171-  IF n <> 1 THEN
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-172-    RAISE EXCEPTION 'check 8b FAILED: the owner could not reach the row either — check 8 was vacuous';
--
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-178-  --
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-179-  -- ⚠️ THERE MUST BE AN UNPUBLISHED ROW TO FAIL AGAINST. Check 8b republished
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-180-  -- org_1, so without this withdrawal the anonymous count below would be zero
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-181-  -- because nothing was unpublished — passing while testing nothing. Codex
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-182-  -- rated it LOW; it is the vacuous-pass class this file exists to avoid.
infrastructure/migrations\verify\027_mechanic_directory_optin.sql:183:  PERFORM set_config('app.current_role', 'workshop_owner', true);
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-184-  UPDATE catalogue.mechanic_directory SET is_published = FALSE
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-185-   WHERE organization_id = (SELECT v FROM _fx WHERE k='org_1');
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-186-  GET DIAGNOSTICS n = ROW_COUNT;
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-187-  IF n <> 1 THEN
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-188-    RAISE EXCEPTION 'check 9 SETUP FAILED: no unpublished row to test against (% rows)', n;
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-189-  END IF;
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-190-
infrastructure/migrations\verify\027_mechanic_directory_optin.sql:191:  PERFORM set_config('app.current_role', '', true);
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-192-  PERFORM set_config('app.organization_ids', '', true);
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-193-  PERFORM set_config('app.user_id', '', true);
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-194-  SELECT count(*) INTO n FROM catalogue.mechanic_directory WHERE NOT is_published;
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-195-  IF n <> 0 THEN
infrastructure/migrations\verify\027_mechanic_directory_optin.sql-196-    RAISE EXCEPTION 'check 9 FAILED: an anonymous reader sees % unpublished listings', n;
--
infrastructure/migrations\verify\032_repair_variations.sql-13---
infrastructure/migrations\verify\032_repair_variations.sql-14--- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.
infrastructure/migrations\verify\032_repair_variations.sql-15-
infrastructure/migrations\verify\032_repair_variations.sql-16-BEGIN;
infrastructure/migrations\verify\032_repair_variations.sql-17-
infrastructure/migrations\verify\032_repair_variations.sql:18:SELECT set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\032_repair_variations.sql-19-
infrastructure/migrations\verify\032_repair_variations.sql-20-CREATE TEMP TABLE _fx (k TEXT PRIMARY KEY, v UUID) ON COMMIT DROP;
infrastructure/migrations\verify\032_repair_variations.sql-21-GRANT SELECT ON _fx TO autoworkshop_app;
infrastructure/migrations\verify\032_repair_variations.sql-22-
infrastructure/migrations\verify\032_repair_variations.sql-23-DO $$
--
infrastructure/migrations\verify\032_repair_variations.sql-60-  who  UUID := (SELECT v FROM _fx WHERE k='who');
infrastructure/migrations\verify\032_repair_variations.sql-61-  reviewer UUID := (SELECT v FROM _fx WHERE k='reviewer');
infrastructure/migrations\verify\032_repair_variations.sql-62-BEGIN
infrastructure/migrations\verify\032_repair_variations.sql-63-  PERFORM set_config('app.tenant_id', ten::text, true);
infrastructure/migrations\verify\032_repair_variations.sql-64-  PERFORM set_config('app.organization_ids', org::text, true);
infrastructure/migrations\verify\032_repair_variations.sql:65:  PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\032_repair_variations.sql-66-
infrastructure/migrations\verify\032_repair_variations.sql-67-  INSERT INTO repair.repair_variations
infrastructure/migrations\verify\032_repair_variations.sql-68-    (tenant_id, organization_id, job_card_id, execution_id, variation_no,
infrastructure/migrations\verify\032_repair_variations.sql-69-     original_complaint, original_approved_work, new_finding, additional_work,
infrastructure/migrations\verify\032_repair_variations.sql-70-     additional_cost, currency, created_by)
--
infrastructure/migrations\verify\032_repair_variations.sql-109-
infrastructure/migrations\verify\032_repair_variations.sql-110-  -- ── 5. CONTROL. The proper sequence IS accepted. ─────────────────────────
infrastructure/migrations\verify\032_repair_variations.sql-111-  -- The review is performed by a SUPERVISOR who did not raise it. 033 enforces
infrastructure/migrations\verify\032_repair_variations.sql-112-  -- both halves in the database; doing it as the raiser here is what the first
infrastructure/migrations\verify\032_repair_variations.sql-113-  -- version got wrong.
infrastructure/migrations\verify\032_repair_variations.sql:114:  PERFORM set_config('app.current_role', 'workshop_supervisor', true);
infrastructure/migrations\verify\032_repair_variations.sql-115-  UPDATE repair.repair_variations
infrastructure/migrations\verify\032_repair_variations.sql-116-     SET status='internally_reviewed', internally_reviewed_by=reviewer, internally_reviewed_at=now()
infrastructure/migrations\verify\032_repair_variations.sql-117-   WHERE id = vid;
infrastructure/migrations\verify\032_repair_variations.sql-118-  GET DIAGNOSTICS n = ROW_COUNT;
infrastructure/migrations\verify\032_repair_variations.sql-119-  IF n <> 1 THEN RAISE EXCEPTION 'check 5 FAILED: internal review was refused'; END IF;
--
infrastructure/migrations\verify\032_repair_variations.sql-178-      (tenant_id, organization_id, job_card_id, execution_id, variation_no,
infrastructure/migrations\verify\032_repair_variations.sql-179-       original_complaint, original_approved_work, new_finding, additional_work,
infrastructure/migrations\verify\032_repair_variations.sql-180-       additional_cost, created_by)
infrastructure/migrations\verify\032_repair_variations.sql-181-    VALUES (ten, org, card, ex, 9002, 'c', 'w', 'f', 'a', 300.00, who)
infrastructure/migrations\verify\032_repair_variations.sql-182-    RETURNING id INTO v2;
infrastructure/migrations\verify\032_repair_variations.sql:183:    PERFORM set_config('app.current_role', 'workshop_supervisor', true);
infrastructure/migrations\verify\032_repair_variations.sql-184-    UPDATE repair.repair_variations
infrastructure/migrations\verify\032_repair_variations.sql-185-       SET status='internally_reviewed', internally_reviewed_by=reviewer, internally_reviewed_at=now()
infrastructure/migrations\verify\032_repair_variations.sql-186-     WHERE id=v2;
infrastructure/migrations\verify\032_repair_variations.sql-187-    UPDATE repair.repair_variations SET status='sent_to_customer' WHERE id=v2;
infrastructure/migrations\verify\032_repair_variations.sql-188-    BEGIN
--
infrastructure/migrations\verify\032_repair_variations.sql-214-      (tenant_id, organization_id, job_card_id, execution_id, variation_no,
infrastructure/migrations\verify\032_repair_variations.sql-215-       original_complaint, original_approved_work, new_finding, additional_work,
infrastructure/migrations\verify\032_repair_variations.sql-216-       additional_cost, created_by)
infrastructure/migrations\verify\032_repair_variations.sql-217-    VALUES (ten, org, card, ex, 9003, 'c', 'w', 'loose clip', 're-seat it', 0, who)
infrastructure/migrations\verify\032_repair_variations.sql-218-    RETURNING id INTO v3;
infrastructure/migrations\verify\032_repair_variations.sql:219:    PERFORM set_config('app.current_role', 'workshop_supervisor', true);
infrastructure/migrations\verify\032_repair_variations.sql-220-    UPDATE repair.repair_variations
infrastructure/migrations\verify\032_repair_variations.sql-221-       SET status='internally_reviewed', internally_reviewed_by=reviewer, internally_reviewed_at=now()
infrastructure/migrations\verify\032_repair_variations.sql-222-     WHERE id=v3;
infrastructure/migrations\verify\032_repair_variations.sql-223-    UPDATE repair.repair_variations SET status='sent_to_customer' WHERE id=v3;
infrastructure/migrations\verify\032_repair_variations.sql-224-    UPDATE repair.repair_variations
--
infrastructure/migrations\verify\031_quality_control_hardening.sql-16---
infrastructure/migrations\verify\031_quality_control_hardening.sql-17--- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.
infrastructure/migrations\verify\031_quality_control_hardening.sql-18-
infrastructure/migrations\verify\031_quality_control_hardening.sql-19-BEGIN;
infrastructure/migrations\verify\031_quality_control_hardening.sql-20-
infrastructure/migrations\verify\031_quality_control_hardening.sql:21:SELECT set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\031_quality_control_hardening.sql-22-
infrastructure/migrations\verify\031_quality_control_hardening.sql-23-CREATE TEMP TABLE _fx (k TEXT PRIMARY KEY, v UUID) ON COMMIT DROP;
infrastructure/migrations\verify\031_quality_control_hardening.sql-24-GRANT SELECT ON _fx TO autoworkshop_app;
infrastructure/migrations\verify\031_quality_control_hardening.sql-25-
infrastructure/migrations\verify\031_quality_control_hardening.sql-26-DO $$
--
infrastructure/migrations\verify\031_quality_control_hardening.sql-99-  outsider UUID := (SELECT v FROM _fx WHERE k='outsider');
infrastructure/migrations\verify\031_quality_control_hardening.sql-100-  other_card UUID := (SELECT v FROM _fx WHERE k='other_card');
infrastructure/migrations\verify\031_quality_control_hardening.sql-101-BEGIN
infrastructure/migrations\verify\031_quality_control_hardening.sql-102-  PERFORM set_config('app.tenant_id', ten::text, true);
infrastructure/migrations\verify\031_quality_control_hardening.sql-103-  PERFORM set_config('app.organization_ids', org::text, true);
infrastructure/migrations\verify\031_quality_control_hardening.sql:104:  PERFORM set_config('app.current_role', 'quality_control_inspector', true);
infrastructure/migrations\verify\031_quality_control_hardening.sql-105-
infrastructure/migrations\verify\031_quality_control_hardening.sql-106-  -- ── 1. 🔴 THE SESSION MUST BELONG TO THE CARD ────────────────────────────
infrastructure/migrations\verify\031_quality_control_hardening.sql-107-  -- The attack: carry the real session but name a DIFFERENT job card, so the
infrastructure/migrations\verify\031_quality_control_hardening.sql-108-  -- independence trigger checks the inspector against a car they never touched.
infrastructure/migrations\verify\031_quality_control_hardening.sql-109-  BEGIN
--
infrastructure/migrations\verify\031_quality_control_hardening.sql-184-  RAISE NOTICE 'check 6 OK: the application role retains EXECUTE';
infrastructure/migrations\verify\031_quality_control_hardening.sql-185-
infrastructure/migrations\verify\031_quality_control_hardening.sql-186-  -- ── 7. 🔴 A DECIDED INSPECTION SURVIVES ITS PARENTS ──────────────────────
infrastructure/migrations\verify\031_quality_control_hardening.sql-187-  -- DELETE is revoked on the table, but a CASCADE is not a DELETE by the app —
infrastructure/migrations\verify\031_quality_control_hardening.sql-188-  -- so 030's `ON DELETE CASCADE` erased inspections whenever a job card went.
infrastructure/migrations\verify\031_quality_control_hardening.sql:189:  PERFORM set_config('app.current_role', 'workshop_owner', true);
infrastructure/migrations\verify\031_quality_control_hardening.sql-190-  BEGIN
infrastructure/migrations\verify\031_quality_control_hardening.sql-191-    DELETE FROM repair.job_cards WHERE id = card;
infrastructure/migrations\verify\031_quality_control_hardening.sql-192-    RAISE EXCEPTION 'check 7 FAILED: deleting the job card cascaded away its inspection';
infrastructure/migrations\verify\031_quality_control_hardening.sql-193-  EXCEPTION
infrastructure/migrations\verify\031_quality_control_hardening.sql-194-    WHEN foreign_key_violation THEN
--
infrastructure/migrations\verify\031_quality_control_hardening.sql-215-      'check 8 FAILED: the job-card and test-session foreign keys are not both ON DELETE RESTRICT (% of 2)', n;
infrastructure/migrations\verify\031_quality_control_hardening.sql-216-  END IF;
infrastructure/migrations\verify\031_quality_control_hardening.sql-217-  RAISE NOTICE 'check 8 OK: both parent foreign keys are ON DELETE RESTRICT';
infrastructure/migrations\verify\031_quality_control_hardening.sql-218-
infrastructure/migrations\verify\031_quality_control_hardening.sql-219-  -- ── 9. A PASS CARRIES NO DEFECT DESCRIPTION ──────────────────────────────
infrastructure/migrations\verify\031_quality_control_hardening.sql:220:  PERFORM set_config('app.current_role', 'quality_control_inspector', true);
infrastructure/migrations\verify\031_quality_control_hardening.sql-221-  BEGIN
infrastructure/migrations\verify\031_quality_control_hardening.sql-222-    UPDATE repair.quality_inspections
infrastructure/migrations\verify\031_quality_control_hardening.sql-223-       SET status='passed', complaint_addressed=true, new_defect_found=false,
infrastructure/migrations\verify\031_quality_control_hardening.sql-224-           new_defect_description='left over from a failed attempt', decided_at=now()
infrastructure/migrations\verify\031_quality_control_hardening.sql-225-     WHERE id = qc;
--
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-134-
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-135-  -- ── 5. THE DOOR IS SHUT AGAIN ON THE WAY OUT ──────────────────────────────
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-136-  -- The caller's transaction continues after the function returns. If the flag
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-137-  -- were still set, the rest of that transaction would hold a bypass nobody
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-138-  -- asked for.
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql:139:  IF COALESCE(current_setting('app.bootstrap', true), '') = 'on' THEN
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql:140:    RAISE EXCEPTION 'FAIL 5: app.bootstrap is STILL ON after the function returned';
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-141-  END IF;
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql:142:  RAISE NOTICE 'PASS 5  app.bootstrap is cleared before control returns to the caller';
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-143-
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-144-  -- ── 6. GUARD, INJECTED: with the door shut, a bare INSERT is refused ──────
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-145-  -- Proves the bypass is the ONLY way through, and that 037 did not simply
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-146-  -- weaken the table.
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-147-  BEGIN
--
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-155-      IF SQLERRM LIKE 'FAIL 6:%' THEN RAISE; END IF;
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-156-      RAISE NOTICE 'PASS 6  an INSERT outside the function is still refused: %', SQLERRM;
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-157-  END;
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-158-
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-159-  -- ── 7. GUARD, INJECTED: the flag alone is NOT enough ──────────────────────
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql:160:  -- The policies pin the row to app.bootstrap_user. Force the flag on but name
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-161-  -- somebody else, and the write must still be refused — otherwise the bypass
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-162-  -- would be "RLS off" wearing a nicer name.
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-163-  uid2 := identity.provision_user_from_subject(s2, 'verify037b@example.com', 'Other Person');
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql:164:  PERFORM set_config('app.bootstrap',      'on',         true);
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql:165:  PERFORM set_config('app.bootstrap_user', uid2::text,   true);
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-166-  BEGIN
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-167-    INSERT INTO identity.tenants (name, slug, status, created_by)
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-168-    VALUES ('Impersonation Motors', 'imp-' || substr(gen_random_uuid()::text,1,8), 'active', uid);
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-169-    RAISE EXCEPTION 'FAIL 7: the bootstrap door wrote a row attributed to ANOTHER user';
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-170-  EXCEPTION
--
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-189-      RAISE NOTICE 'PASS 8  a membership for a third party is refused';
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-190-    WHEN raise_exception THEN
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-191-      IF SQLERRM LIKE 'FAIL 8:%' THEN RAISE; END IF;
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-192-      RAISE NOTICE 'PASS 8  a membership for a third party is refused: %', SQLERRM;
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-193-  END;
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql:194:  PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql:195:  PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-196-
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-197-  -- ── 9. GUARD, INJECTED: junk in the GUC fails CLOSED, and does not 500 ────
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-198-  -- The comparison is made on TEXT precisely so a non-uuid cannot RAISE a cast
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-199-  -- error. A guard that turns bad input into a 500 is a denial of service with
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-200-  -- good intentions.
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql:201:  PERFORM set_config('app.bootstrap',      'on',           true);
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql:202:  PERFORM set_config('app.bootstrap_user', 'not-a-uuid-at-all', true);
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-203-  BEGIN
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-204-    INSERT INTO identity.tenants (name, slug, status, created_by)
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-205-    VALUES ('Junk Motors', 'junk-' || substr(gen_random_uuid()::text,1,8), 'active', uid);
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql:206:    RAISE EXCEPTION 'FAIL 9: a junk app.bootstrap_user was accepted';
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-207-  EXCEPTION
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-208-    WHEN insufficient_privilege THEN
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql:209:      RAISE NOTICE 'PASS 9  a junk bootstrap_user is refused, not crashed on';
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-210-    WHEN raise_exception THEN
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-211-      IF SQLERRM LIKE 'FAIL 9:%' THEN RAISE; END IF;
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql:212:      RAISE NOTICE 'PASS 9  a junk bootstrap_user is refused: %', SQLERRM;
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-213-  END;
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql:214:  PERFORM set_config('app.bootstrap',      '', true);
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql:215:  PERFORM set_config('app.bootstrap_user', '', true);
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-216-
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-217-  -- ── 10. GUARD, INJECTED: an unknown subject still cannot register ────────
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-218-  BEGIN
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-219-    PERFORM identity.register_workshop('subject-037-does-not-exist', 'Ghost Motors', 'X');
infrastructure/migrations\verify\037_registration_rls_bootstrap.sql-220-    RAISE EXCEPTION 'FAIL 10: an unprovisioned subject registered a workshop';
--
infrastructure/migrations\verify\033_variation_hardening.sql-15---
infrastructure/migrations\verify\033_variation_hardening.sql-16--- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.
infrastructure/migrations\verify\033_variation_hardening.sql-17-
infrastructure/migrations\verify\033_variation_hardening.sql-18-BEGIN;
infrastructure/migrations\verify\033_variation_hardening.sql-19-
infrastructure/migrations\verify\033_variation_hardening.sql:20:SELECT set_config('app.current_role', 'admin', true);
infrastructure/migrations\verify\033_variation_hardening.sql-21-
infrastructure/migrations\verify\033_variation_hardening.sql-22-CREATE TEMP TABLE _fx (k TEXT PRIMARY KEY, v UUID) ON COMMIT DROP;
infrastructure/migrations\verify\033_variation_hardening.sql-23-GRANT SELECT ON _fx TO autoworkshop_app;
infrastructure/migrations\verify\033_variation_hardening.sql-24-
infrastructure/migrations\verify\033_variation_hardening.sql-25-DO $$
--
infrastructure/migrations\verify\033_variation_hardening.sql-58-  raiser   UUID := (SELECT v FROM _fx WHERE k='raiser');
infrastructure/migrations\verify\033_variation_hardening.sql-59-  reviewer UUID := (SELECT v FROM _fx WHERE k='reviewer');
infrastructure/migrations\verify\033_variation_hardening.sql-60-BEGIN
infrastructure/migrations\verify\033_variation_hardening.sql-61-  PERFORM set_config('app.tenant_id', ten::text, true);
infrastructure/migrations\verify\033_variation_hardening.sql-62-  PERFORM set_config('app.organization_ids', org::text, true);
infrastructure/migrations\verify\033_variation_hardening.sql:63:  PERFORM set_config('app.current_role', 'technician', true);
infrastructure/migrations\verify\033_variation_hardening.sql-64-
infrastructure/migrations\verify\033_variation_hardening.sql-65-  -- ── 1. 🔴 THE CRITICAL HOLE: a pre-approved INSERT ───────────────────────
infrastructure/migrations\verify\033_variation_hardening.sql-66-  -- 032 fired only on UPDATE, so this created a variation already approved and
infrastructure/migrations\verify\033_variation_hardening.sql-67-  -- already authorised, having never been reviewed or sent to anybody.
infrastructure/migrations\verify\033_variation_hardening.sql-68-  BEGIN
--
infrastructure/migrations\verify\033_variation_hardening.sql-110-  EXCEPTION WHEN insufficient_privilege THEN
infrastructure/migrations\verify\033_variation_hardening.sql-111-    RAISE NOTICE 'check 4 OK: a technician cannot review a variation';
infrastructure/migrations\verify\033_variation_hardening.sql-112-  END;
infrastructure/migrations\verify\033_variation_hardening.sql-113-
infrastructure/migrations\verify\033_variation_hardening.sql-114-  -- ── 5. 🔴 THE RAISER CANNOT REVIEW THEIR OWN, whatever their role ────────
infrastructure/migrations\verify\033_variation_hardening.sql:115:  PERFORM set_config('app.current_role', 'workshop_supervisor', true);
infrastructure/migrations\verify\033_variation_hardening.sql-116-  BEGIN
infrastructure/migrations\verify\033_variation_hardening.sql-117-    UPDATE repair.repair_variations
infrastructure/migrations\verify\033_variation_hardening.sql-118-       SET status='internally_reviewed', internally_reviewed_by=raiser, internally_reviewed_at=now()
infrastructure/migrations\verify\033_variation_hardening.sql-119-     WHERE id = vid;
infrastructure/migrations\verify\033_variation_hardening.sql-120-    RAISE EXCEPTION 'check 5 FAILED: the raiser reviewed their own variation';

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n -A 145 "CREATE OR REPLACE FUNCTION identity.register_insurer" 
infrastructure/migrations/080_insurance_and_towing_registration.sql; rg -n -A 130 "CREATE OR REPLACE FUNCTION identity.register_towing_operator" 
infrastructure/migrations/080_insurance_and_towing_registration.sql' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 674ms:
106:CREATE OR REPLACE FUNCTION identity.register_insurer(
107-    p_subject       TEXT,
108-    p_insurer_name  TEXT,
109-    p_location_name TEXT
110-)
111--- ⚠️ THE `o_` PREFIX IS LOAD-BEARING — 061's note, inherited. A `RETURNS TABLE`
112--- column is an ordinary plpgsql variable inside the body, so a column named
113--- `organization_id` makes every unqualified reference ambiguous, and plpgsql
114--- resolves identifiers when the statement FIRST EXECUTES. The failure is at
115--- runtime; `CREATE FUNCTION` reports success either way.
116-RETURNS TABLE (
117-    o_tenant_id       uuid,
118-    o_organization_id uuid,
119-    o_branch_id       uuid,
120-    o_membership_id   uuid
121-)
122-LANGUAGE plpgsql
123-SECURITY DEFINER
124-SET search_path = identity, pg_catalog, pg_temp
125-AS $$
126-DECLARE
127-    v_user   uuid;
128-    v_tenant uuid;
129-    v_org    uuid;
130-    v_branch uuid;
131-    v_member uuid;
132-    v_slug   TEXT;
133-BEGIN
134-    IF p_insurer_name IS NULL OR btrim(p_insurer_name) = '' THEN
135-        RAISE EXCEPTION 'an insurance company needs a name';
136-    END IF;
137-
138-    SELECT id INTO v_user
139-      FROM identity.users
140-     WHERE keycloak_subject = p_subject
141-       AND status = 'active';
142-
143-    IF v_user IS NULL THEN
144-        RAISE EXCEPTION 'no active application user for this identity';
145-    END IF;
146-
147-    -- 🔴 THE PER-IDENTITY ADVISORY LOCK, TAKEN FROM THE START RATHER THAN IN A
148-    -- FOLLOW-UP MIGRATION. 071 and 072 added it to `register_workshop` and
149-    -- `register_supplier`; 075 shipped `register_fleet` WITHOUT it and 076 had
150-    -- to go back for it, because two simultaneous submits could each find no
151-    -- membership and create a tenant apiece — and a fleet submit could race a
152-    -- workshop one, which held a lock the fleet function never joined.
153-    --
154-    -- The KEY IS THE IDENTITY, NOT THE KIND, which is the entire point: it
155-    -- serialises one person's registrations across ALL five doors. `_xact_`, so
156-    -- it is released when the transaction ends including on the exception paths
157-    -- below — no code path can leak it and block that account for ever.
158-    PERFORM pg_advisory_xact_lock(hashtextextended('identity.register:' || v_user::text, 0));
159-
160-    -- ── the door opens here, and only here ─────────────────────────────────
161-    -- Transaction-local, so a pooled connection cannot carry the flag into the
162-    -- next request even on an abort. Cleared explicitly as well, because the
163-    -- SUCCESS path leaves the caller's transaction open.
164-    PERFORM set_config('app.bootstrap',      'on',         true);
165-    PERFORM set_config('app.bootstrap_user', v_user::text, true);
166-
167-    -- One organisation per person. AFTER the flag is set AND after the lock:
168-    -- under FORCE RLS with no tenant context this read returns zero rows for
169-    -- everybody, so placing it earlier would make it a check that cannot fire —
170-    -- the bug 037 fixed in `register_workshop`.
171-    IF EXISTS (SELECT 1 FROM identity.memberships
172-                WHERE user_id = v_user AND status = 'active') THEN
173-        PERFORM set_config('app.bootstrap',      '', true);
174-        PERFORM set_config('app.bootstrap_user', '', true);
175-        -- ⚠️ THE MESSAGE NAMES A REACHABLE ALTERNATIVE. A rule with no way past
176-        -- it is a wall, and the person in front of it files a bug rather than
177-        -- acting.
178-        RAISE EXCEPTION 'this account already belongs to an organisation. Sign in with a different account to register an insurance company, or ask a platform administrator to add you to an 
existing one.';
179-    END IF;
180-
181-    v_slug := regexp_replace(lower(btrim(p_insurer_name)), '[^a-z0-9]+', '-', 'g');
182-    v_slug := btrim(v_slug, '-');
183-    IF v_slug = '' THEN
184-        v_slug := 'insurer';
185-    END IF;
186-    v_slug := left(v_slug, 40) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
187-
188-    v_tenant := gen_random_uuid();
189-    v_org    := gen_random_uuid();
190-    v_branch := gen_random_uuid();
191-    v_member := gen_random_uuid();
192-
193-    INSERT INTO identity.tenants (id, name, slug, status, created_by)
194-    VALUES (v_tenant, btrim(p_insurer_name), v_slug, 'active', v_user);
195-
196-    -- 🔴 LITERAL 1 of 2: `insurance_company`, one of the ten values
197-    -- `organizations_org_type_check` admits. Not `insurer`, which is plausible
198-    -- and absent; `register_workshop` died on exactly that mistake.
199-    INSERT INTO identity.organizations (id, tenant_id, name, org_type, status, created_by)
200-    VALUES (v_org, v_tenant, btrim(p_insurer_name), 'insurance_company', 'active', v_user);
201-
202-    INSERT INTO identity.branches (id, tenant_id, organization_id, name, status, created_by)
203-    VALUES (v_branch, v_tenant, v_org,
204-            COALESCE(NULLIF(btrim(p_location_name), ''), 'Head office'),
205-            'active', v_user);
206-
207-    -- 🔴 LITERAL 2 of 2: the role, spelled as every consumer expects.
208-    INSERT INTO identity.memberships
209-        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
210-    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'insurance_assessor', 'active', v_user);
211-
212-    -- Queued INSIDE the same transaction that creates the insurer. Written
213-    -- afterwards on a separate connection it could survive a rolled-back
214-    -- sign-up and describe a company that does not exist — or be lost, leaving
215-    -- an insurer nobody is ever asked to verify.
216-    INSERT INTO identity.organization_registrations
217-        (tenant_id, organization_id, kind, status, submitted_by)
218-    VALUES (v_tenant, v_org, 'insurance', 'pending', v_user);
219-
220-    -- ── and the door closes ────────────────────────────────────────────────
221-    PERFORM set_config('app.bootstrap',      '', true);
222-    PERFORM set_config('app.bootstrap_user', '', true);
223-
224-    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
225-END;
226-$$;
227-
228-COMMENT ON FUNCTION identity.register_insurer(TEXT, TEXT, TEXT) IS
229-'Self-service registration for an insurance company: creates a tenant, an '
230-'insurance_company organisation, one office and an insurance_assessor '
231-'membership for the CALLER, resolved from the token subject, and queues the '
232-'company for admin verification. The role and the org type are literals, never '
233-'parameters. Refuses an account that already belongs to an organisation. '
234-'Before this function existed NO production code path could create an '
235-'insurance_assessor membership or an independent insurance_company at all.';
236-
237--- 🔴 EXECUTE GRANTED TO THE APPLICATION ROLE AND REVOKED FROM PUBLIC. A
238--- SECURITY DEFINER function reachable by PUBLIC is reachable by every role in
239--- the database, including any future read-only or reporting role.
240-REVOKE ALL ON FUNCTION identity.register_insurer(TEXT, TEXT, TEXT) FROM PUBLIC;
241-GRANT EXECUTE ON FUNCTION identity.register_insurer(TEXT, TEXT, TEXT) TO autoworkshop_app;
242-
243-
244-CREATE OR REPLACE FUNCTION identity.register_towing_operator(
245-    p_subject       TEXT,
246-    p_company_name  TEXT,
247-    p_location_name TEXT
248-)
249-RETURNS TABLE (
250-    o_tenant_id       uuid,
251-    o_organization_id uuid,
244:CREATE OR REPLACE FUNCTION identity.register_towing_operator(
245-    p_subject       TEXT,
246-    p_company_name  TEXT,
247-    p_location_name TEXT
248-)
249-RETURNS TABLE (
250-    o_tenant_id       uuid,
251-    o_organization_id uuid,
252-    o_branch_id       uuid,
253-    o_membership_id   uuid
254-)
255-LANGUAGE plpgsql
256-SECURITY DEFINER
257-SET search_path = identity, pg_catalog, pg_temp
258-AS $$
259-DECLARE
260-    v_user   uuid;
261-    v_tenant uuid;
262-    v_org    uuid;
263-    v_branch uuid;
264-    v_member uuid;
265-    v_slug   TEXT;
266-BEGIN
267-    IF p_company_name IS NULL OR btrim(p_company_name) = '' THEN
268-        RAISE EXCEPTION 'a towing company needs a name';
269-    END IF;
270-
271-    SELECT id INTO v_user
272-      FROM identity.users
273-     WHERE keycloak_subject = p_subject
274-       AND status = 'active';
275-
276-    IF v_user IS NULL THEN
277-        RAISE EXCEPTION 'no active application user for this identity';
278-    END IF;
279-
280-    -- Same per-identity lock as the other four doors. See the note in
281-    -- `register_insurer` above for why the key is the identity and not the kind.
282-    PERFORM pg_advisory_xact_lock(hashtextextended('identity.register:' || v_user::text, 0));
283-
284-    PERFORM set_config('app.bootstrap',      'on',         true);
285-    PERFORM set_config('app.bootstrap_user', v_user::text, true);
286-
287-    IF EXISTS (SELECT 1 FROM identity.memberships
288-                WHERE user_id = v_user AND status = 'active') THEN
289-        PERFORM set_config('app.bootstrap',      '', true);
290-        PERFORM set_config('app.bootstrap_user', '', true);
291-        RAISE EXCEPTION 'this account already belongs to an organisation. Sign in with a different account to register a towing company, or ask a platform administrator to add you to an 
existing one.';
292-    END IF;
293-
294-    v_slug := regexp_replace(lower(btrim(p_company_name)), '[^a-z0-9]+', '-', 'g');
295-    v_slug := btrim(v_slug, '-');
296-    IF v_slug = '' THEN
297-        v_slug := 'towing';
298-    END IF;
299-    v_slug := left(v_slug, 40) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
300-
301-    v_tenant := gen_random_uuid();
302-    v_org    := gen_random_uuid();
303-    v_branch := gen_random_uuid();
304-    v_member := gen_random_uuid();
305-
306-    INSERT INTO identity.tenants (id, name, slug, status, created_by)
307-    VALUES (v_tenant, btrim(p_company_name), v_slug, 'active', v_user);
308-
309-    -- 🔴 LITERAL 1 of 2: `towing_company`.
310-    INSERT INTO identity.organizations (id, tenant_id, name, org_type, status, created_by)
311-    VALUES (v_org, v_tenant, btrim(p_company_name), 'towing_company', 'active', v_user);
312-
313-    INSERT INTO identity.branches (id, tenant_id, organization_id, name, status, created_by)
314-    VALUES (v_branch, v_tenant, v_org,
315-            COALESCE(NULLIF(btrim(p_location_name), ''), 'Main depot'),
316-            'active', v_user);
317-
318-    -- 🔴 LITERAL 2 of 2: `towing_operator`, as `permission-matrix.ts:109` and
319-    -- the `02.txt` §52 navigation tree spell it.
320-    INSERT INTO identity.memberships
321-        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
322-    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'towing_operator', 'active', v_user);
323-
324-    INSERT INTO identity.organization_registrations
325-        (tenant_id, organization_id, kind, status, submitted_by)
326-    VALUES (v_tenant, v_org, 'towing', 'pending', v_user);
327-
328-    PERFORM set_config('app.bootstrap',      '', true);
329-    PERFORM set_config('app.bootstrap_user', '', true);
330-
331-    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
332-END;
333-$$;
334-
335-COMMENT ON FUNCTION identity.register_towing_operator(TEXT, TEXT, TEXT) IS
336-'Self-service registration for a towing company: creates a tenant, a '
337-'towing_company organisation, one depot and a towing_operator membership for '
338-'the CALLER, resolved from the token subject, and queues the company for admin '
339-'verification. The role and the org type are literals, never parameters. '
340-'Refuses an account that already belongs to an organisation. Before this '
341-'function existed NO production code path could create a towing_operator '
342-'membership or an independent towing_company at all.';
343-
344-REVOKE ALL ON FUNCTION identity.register_towing_operator(TEXT, TEXT, TEXT) FROM PUBLIC;
345-GRANT EXECUTE ON FUNCTION identity.register_towing_operator(TEXT, TEXT, TEXT) TO autoworkshop_app;
346-
347-
348--- ── 3. PROVE THE BOOTSTRAP DOOR ACTUALLY OPENS FOR BOTH ───────────────────
349---
350--- 🔴 THE ONE FAILURE `CREATE FUNCTION` WOULD NOT REPORT.
351--- `in_registration_bootstrap()` admits a caller only when `current_user` equals
352--- the owner of `register_workshop`. A SECURITY DEFINER function runs as its OWN
353--- owner, so if this file were applied by a different role than 037 was, every
354--- INSERT above would be refused by 037's policies — at runtime, on a real
355--- registrant's first sign-up, long after this migration reported success.
356---
357--- 🔴 AND THE LOCK IS ASSERTED HERE TOO, not merely written above. 076 exists
358--- because 075's lock was intended and absent; a guard that reads the INSTALLED
359--- definition cannot be fooled by an edit that looked right.
360-DO $guard$
361-DECLARE
362-    v_workshop_owner text;
363-    v_owner          text;
364-    v_fn             text;
365-    v_missing        text := '';
366-BEGIN
367-    SELECT r.rolname INTO v_workshop_owner
368-      FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
369-     WHERE p.oid = 'identity.register_workshop(text,text,text)'::regprocedure;
370-
371-    FOREACH v_fn IN ARRAY ARRAY[
372-        'identity.register_insurer(text,text,text)',
373-        'identity.register_towing_operator(text,text,text)'
374-    ]

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content packages/navigation/src/pack-base.ts -TotalCount 240; rg -n 
"activeRole|roleName|roles|INSURANCE_ROLES|TOWING_ROLES" apps/web/app/insurance apps/web/app/towing packages/navigation packages/next-shell/src --glob "*.ts" --glob "*.tsx"' in 
C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 1778ms:
import type { WorkspaceId } from './types';

/**
 * WHERE A PACK'S ROUTES LIVE INSIDE THE ONE ARTIFACT (ADR-021).
 *
 * Until 2026-08-13 each of the seven packs was its own deployed application on
 * its own hostname, so every pack could own the path `/home/dashboard` and
 * `workspaces.ts` could transcribe the spec's routes literally as
 * `/<group>/<item>`. One artifact means one path namespace, and seven packs
 * cannot all own `/home/dashboard`. Each therefore mounts under its own prefix.
 *
 * ðŸ”´ THE TRANSCRIPTION IN `workspaces.ts` IS DELIBERATELY LEFT ALONE. Its
 * header says the tree is *transcribed, not designed* â€” every href comes
 * straight from `01 (1).txt` Â§33-Â§39 â€” and rewriting 405 literals to carry a
 * deployment detail would destroy the property that makes that file checkable
 * against the spec. The prefix is applied at RESOLUTION time instead, by the
 * three functions that produce or match hrefs.
 *
 * âš ï¸ THE SYMMETRY IS THE WHOLE POINT, AND GETTING IT WRONG IS SILENT. Nav hrefs
 * are what a link points at; `pathname` is what the browser reports. If one
 * side gains the prefix and the other does not, `requireNavRoute` finds no
 * match for any route and calls `notFound()` â€” so every gated page in the
 * product 404s while typecheck, lint and the build all stay green. That is why
 * the base is DERIVED from the workspace id inside those functions rather than
 * passed in as an optional argument: an argument can be forgotten at one call
 * site, and this repository has already paid for "two literals in two files
 * cannot be type-checked into agreement" once.
 */

/**
 * The seven mount points, as a value rather than a type.
 *
 * Kept here rather than derived from `workspaces` to avoid a circular import â€”
 * `workspaces.ts` is the largest module in the package and this one is imported
 * by `resolve.ts`, which it in turn imports.
 */
const PACK_IDS = [
  'customer', 'workshop', 'supplier', 'fleet', 'insurance', 'towing', 'admin',
] as const;

/** `customer` â†’ `/customer`. The prefix a pack's routes are mounted under. */
export function packBase(workspaceId: WorkspaceId | string): string {
  return `/${workspaceId}`;
}

/**
 * Add the pack prefix to a route that does not already carry it.
 *
 * IDEMPOTENT ON PURPOSE. Callers reach this from three directions â€” a page
 * passing its own literal path, a catch-all assembling one from `params.slug`,
 * and the browser's `pathname`, which already has the prefix. Making it safe to
 * apply twice removes the need for every caller to know which of the three it
 * is holding.
 */
export function withPackBase(workspaceId: WorkspaceId | string, path: string): string {
  const base = packBase(workspaceId);
  if (path === base || path.startsWith(base + '/')) return path;

  // âš ï¸ THE ROOT PATH IS THE ONE THAT BITES. A naive concatenation turns `/` into
  // `/customer/` â€” with a trailing slash that matches no navigation href, so the
  // route resolves to nothing and the page renders its not-found branch. It is
  // reachable: `renderModulePage` builds its path from `params.slug`, and an
  // empty slug produces exactly `/`. Measured, not imagined.
  if (path === '' || path === '/') return base;

  // ðŸ”´ A PATH CARRYING ANOTHER PACK'S PREFIX IS A BUG, AND WITHOUT THIS IT IS A
  // SILENT ONE. Codex finding 2: `withPackBase('customer', '/workshop/home/
  // dashboard')` produced `/customer/workshop/home/dashboard` â€” a path no pack
  // serves and no href advertises, so `requireNavRoute` 404s with nothing in any
  // log to say why. Returning it unchanged still 404s (customer's tree does not
  // advertise a workshop route) but it 404s the ORIGINAL path, which is the one
  // a person can search for.
  //
  // Deliberately NOT a throw. This runs inside server components on every gated
  // page; turning a mis-typed link into a 500 across the artifact would be a far
  // worse trade than a legible 404.
  if (PACK_IDS.some((id) => path === `/${id}` || path.startsWith(`/${id}/`))) {
    return path;
  }

  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

/**
 * Remove the pack prefix, if present.
 *
 * Needed by anything that must compare a real URL against the spec's own route
 * strings â€” the navigation audits do exactly that, and they should keep
 * checking the transcription rather than the mounting.
 */
export function withoutPackBase(workspaceId: WorkspaceId | string, path: string): string {
  const base = packBase(workspaceId);
  if (path === base) return '/';
  return path.startsWith(base + '/') ? path.slice(base.length) : path;
}

/**
 * WHICH PACK SERVES AN UNMOUNTED, PRE-ADR-021 ROUTE.
 *
 * ðŸ”´ WRITTEN BECAUSE THE CONSOLIDATION BROKE EVERY EXISTING LINK AND I DID NOT
 * NOTICE. Before 2026-08-13 the apex served `workshop-web`, so `/home/dashboard`
 * and `/customer-reception/customers` were real URLs â€” in bookmarks, in emails,
 * in muscle memory. Mounting the packs moved all of them and left nothing
 * behind, so every one of those now 404s. Measured on production, and reported
 * by the owner as "some page does not exist" before any test noticed: the live
 * suite passed 70/0/1 throughout, because it only ever asks for paths the NEW
 * topology advertises.
 *
 * This resolves an old path against the navigation model, which already knows
 * every route every pack serves. It is data we have, not a list to maintain.
 *
 * Returns the pack id when exactly ONE pack advertises the route, and null when
 * none or several do â€” `/home/dashboard` exists in six of the seven trees, so
 * guessing between them would send people somewhere they may not belong. The
 * caller sends those to `/`, which resolves the viewer and dispatches properly.
 */
export function packServingLegacyPath(
  path: string,
  workspaces: ReadonlyArray<{ id: string; groups: ReadonlyArray<{ items: ReadonlyArray<{ href: string }> }> }>,
): string | null {
  const matches = workspaces
    .filter((w) => w.groups.some((g) => g.items.some((i) => i.href === path)))
    .map((w) => w.id);
  return matches.length === 1 ? matches[0]! : null;
}

/**
 * WHERE A WORKSPACE'S FRONT DOOR SHOULD SEND SOMEBODY â€” read from the
 * navigation model rather than assumed.
 *
 * â”€â”€ ðŸ”´ THE DEFECT THIS FIXES, AND WHY NOTHING COULD SEE IT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 * `app/page.tsx` dispatched a signed-in viewer with
 *
 *     redirect(`/${homeWorkspaceFor(activeRole)}/home/dashboard`)
 *
 * and SIX of the seven packs do have a `home` group whose first item is
 * `dashboard`. **Towing does not.** `02.txt` Â§52 gives it an `operations` group
 * instead, so its dashboard lives at `/towing/operations/dashboard` â€” which
 * `app/towing/page.tsx` already redirects to correctly, and which the front
 * door did not know.
 *
 * So `/towing/home/dashboard` is not in the towing tree, `renderModulePage`
 * ends `if (!group || !item) notFound()`, and a `towing_operator` signing in at
 * the front door would have been **404'd on their own dashboard**.
 *
 * âš ï¸ IT WAS INVISIBLE BECAUSE THE ROLE COULD NOT EXIST. Nothing in the product
 * could write a `towing_operator` membership until migration 080, so the
 * dispatch line had never once been executed for this role â€” while migration
 * 074 built towing end to end and shipped all ten of its screens. Opening the
 * door is what exposed it. That is this repository's recurring shape: a defect
 * behind an unreachable state stays green for ever, and the fix that makes the
 * state reachable is what finds it.
 *
 * âš ï¸ DERIVED, NOT LISTED. A second map of "which pack lands where" is the
 * "two literals in two files cannot be type-checked into agreement" trap that
 * has already cost this repo a sign-out outage and a job-card link class. The
 * navigation model already states every route every pack serves; this reads it.
 * A future workspace whose first group is not `home` is correct automatically.
 *
 * Returns `null` when the workspace is unknown or has no items at all, so the
 * caller decides what to do rather than being handed a plausible-looking path
 * that 404s.
 */
export function landingPathFor(
  workspaceId: WorkspaceId | string,
  workspaces: ReadonlyArray<{
    id: string;
    groups: ReadonlyArray<{
      permission?: string;
      items: ReadonlyArray<{ href: string; permission?: string }>;
    }>;
  }>,
  /**
   * ðŸ”´ THE VIEWER'S GRANTS, AND OMITTING THEM IS NOT A NEUTRAL DEFAULT.
   *
   * Codex asked whether the first item of the first group is ever
   * PERMISSION-GATED, and I had not checked. It is: `adminGroups` opens with
   *
   *     group('home', 'Home', 'home', [['operations-dashboard', â€¦]], 'platform.admin')
   *
   * â€” the whole group is behind `platform.admin`. `renderModulePage` resolves
   * against `visibleGroups(workspace, grants)`, the FILTERED tree, so a viewer
   * who lacks that permission is 404'd on a path the unfiltered tree happily
   * returned. Since migration 078, `platform.admin` comes from a grant RECORD
   * and not from the role name, so a `platform_administrator` whose grant has
   * been revoked is exactly that viewer â€” and revocation is a case the product
   * is supposed to handle well, not dump on a 404.
   *
   * Passing grants makes this function answer the same question the router
   * will. `undefined` means "not known", and the ungated-only tree is then the
   * safe reading: it can only ever return a route ANY member of the workspace
   * may open.
   *
   * âš ï¸ THIS IS NOT A SECURITY CONTROL, like everything else in this package. It
   * decides where to SEND somebody; the API and RLS decide what they may see.
   */
  grants?: readonly string[],
): string | null {
  const workspace = workspaces.find((w) => w.id === workspaceId);
  if (!workspace) return null;

  const held = new Set(grants ?? []);
  const maySee = (permission?: string) => permission === undefined || held.has(permission);
  // The FIRST item of the FIRST group â€” `01 (1).txt` Â§18 makes the dashboard a
  // workspace's landing page, and in every transcribed tree that dashboard is
  // exactly this position. Reading the position rather than searching for the
  // word "dashboard" keeps it true of a tree that names its landing screen
  // something else.
  for (const group of workspace.groups) {
    if (!maySee(group.permission)) continue;
    // The first item THIS VIEWER may open, not the first item that exists. A
    // group can be ungated while its opening item is not.
    const first = group.items.find((i) => maySee(i.permission));
    // ðŸ”´ MOUNTED BEFORE IT IS RETURNED. `item()` builds every href as
    // `/${groupId}/${id}` â€” UNMOUNTED â€” and the pack base is applied later by
    // `withPackBase`. A caller passing the raw value to `redirect()` would send
    // a towing operator to `/operations/dashboard` at the ARTIFACT root, where
    // the legacy redirector would then resolve it and, because towing is the
    // only pack advertising that path, land them correctly by accident. That
    // accident is not worth depending on, and it breaks the moment a second
    // pack adds an `operations` group. Mounting here means the value is a real
    // URL, and `landing-path.test.ts` asserts every one of them resolves in its
    // own tree.
    if (first) return withPackBase(workspaceId, first.href);
  }
  return null;
}
packages/navigation\src\workspaces.ts:151:    // `organization.admin` is the right key because among those five roles ONLY
packages/navigation\src\workspaces.ts:262:      ['staff-and-roles', 'Staff and Roles'],
packages/navigation\src\workspaces.ts:336:      ['users-and-roles', 'Users and Roles'],
packages/navigation\src\workspaces.ts:587:      ['roles-and-permissions', 'Role and Permission Management'],
packages/navigation\src\workspaces.ts:654:    ['roles-and-permissions', 'Roles and Permissions'],
packages/navigation\src\types.ts:81: * restarts its own numbering at §1; these roles are part 2's §50, not part 1's.
packages/navigation\src\types.ts:83: * §50 names eight workshop roles. Four of them (§46-§49) are given a complete,
packages/navigation\src\resolve.ts:16: * of its own. §50 defines eight workshop roles but only four trees, so the
packages/navigation\src\resolve.test.ts:287:  it('gives each of the four specified roles its own distinct tree', () => {
packages/navigation\src\resolve.test.ts:293:    // roles were wired to the same array by a copy-paste slip.
packages/navigation\src\pack-base.ts:135: *     redirect(`/${homeWorkspaceFor(activeRole)}/home/dashboard`)
packages/navigation\src\landing-path.test.ts:9: * `redirect(`/${homeWorkspaceFor(activeRole)}/home/dashboard`)`. Six of the
packages/next-shell/src\WorkspaceShell.tsx:132:   * Computed in the server layout with `isForeignToWorkshop(viewer?.activeRole)`
apps/web/app/towing\_screens\create-towing-actions.ts:12:  roleName: string;
apps/web/app/insurance\_screens\create-insurer-actions.ts:12:  roleName: string;
packages/next-shell/src\WorkspaceGate.test.ts:19:    activeRole: 'technician',
packages/next-shell/src\ModulePage.tsx:90:  if (isForeignToWorkspace(workspaceId, (await currentViewer(workspaceId))?.activeRole))
packages/next-shell/src\viewer.ts:12:import { activeRoleName, rawRoleHeader } from './active-role';
packages/next-shell/src\viewer.ts:111:        // `aw.activeRole` and `apiGet` duly sent `x-role-name` on every PAGE
packages/next-shell/src\viewer.ts:112:        // request, but `/me` did not — so `viewer.activeRole` was always the
packages/next-shell/src\viewer.ts:114:        // role, `navRoleFor(viewer.activeRole)` kept building the OLD role's
packages/next-shell/src\viewer.ts:121:        // It survived a full session because no account held two roles: the
packages/next-shell/src\viewer.ts:138:    if (!response.ok && ((await activeOrganizationId()) || (await activeRoleName()))) {
packages/next-shell/src\viewer.ts:218:  return navRoleFor(viewer?.activeRole);
packages/next-shell/src\viewer.ts:264:export async function activeRoleHeader(
packages/next-shell/src\viewer.ts:267:  const role = await activeRoleName();
packages/next-shell/src\index.ts:23:  rolesFromMemberships,
packages/next-shell/src\index.ts:59: * holds several roles, and `null` when they hold one so `TopNav` shows its
packages/next-shell/src\index.ts:64:export { activeRoleName, ACTIVE_ROLE_COOKIE } from './active-role';
packages/next-shell/src\index.ts:65:export { activeRoleHeader } from './viewer';
apps/web/app/towing\layout.tsx:47:      role={navRoleFor(viewer?.activeRole)}
apps/web/app/towing\layout.tsx:63:      // Renders the switcher only for a viewer holding several roles; a
packages/next-shell/src\foreign-workspace.test.ts:15:function menuItemCountFor(activeRole: string | undefined, grants: string[] = []) {
packages/next-shell/src\foreign-workspace.test.ts:16:  if (isForeignToWorkshop(activeRole)) return 0; // what the shell + gate now do
packages/next-shell/src\foreign-workspace.test.ts:17:  const ws = workspaceForRole(getWorkspace('workshop')!, navRoleFor(activeRole));
packages/next-shell/src\foreign-workspace.test.ts:143: * fleet-web — the four apps those roles exist for. The guards were handed a
packages/next-shell/src\foreign-workspace.test.ts:147: * was written (no `LIVE_OWNER_EMAIL`), and because three of these four roles
apps/web/app/insurance\layout.tsx:47:      role={navRoleFor(viewer?.activeRole)}
apps/web/app/insurance\layout.tsx:63:      // Renders the switcher only for a viewer holding several roles; a
packages/next-shell/src\viewer.test.ts:15:  rolesFromMemberships,
packages/next-shell/src\viewer.test.ts:39:function viewer(activeRole: string, permissions: readonly string[]): ViewerDescription {
packages/next-shell/src\viewer.test.ts:47:    activeRole,
packages/next-shell/src\viewer.test.ts:70:  it('maps every one of the eight workshop roles to a navigation role', () => {
packages/next-shell/src\viewer.test.ts:84:  it('returns undefined for roles of OTHER workspaces, which is correct', () => {
packages/next-shell/src\viewer.test.ts:98:    // be handed to `workspaceForRole` as if they were roles. Same defect the
packages/next-shell/src\viewer.test.ts:135:        const role = navRoleFor(v?.activeRole);
packages/next-shell/src\viewer.test.ts:212:        const tree = workspaceForRole(base, navRoleFor(v?.activeRole));
packages/next-shell/src\viewer.test.ts:242:        visibleGroups(workspaceForRole(workshop, navRoleFor(v?.activeRole)), grantsFor(v)).flatMap(
packages/next-shell/src\viewer.test.ts:292:      workspaceForRole(workshop, navRoleFor(v.activeRole)),
packages/next-shell/src\viewer.test.ts:350:      activeRole: 'technician',
packages/next-shell/src\viewer.test.ts:361:   * roles, which is the state of most accounts.
packages/next-shell/src\viewer.test.ts:370:      activeRole: 'workshop_supervisor',
packages/next-shell/src\viewer.test.ts:381:   * 🔴 THE ROLE COMES FROM `activeRole`, NOT FROM THE MATCHED MEMBERSHIP ROW.
packages/next-shell/src\viewer.test.ts:384:   * SEVERAL roles in one organisation — the dev `owner@` identity holds three.
packages/next-shell/src\viewer.test.ts:386:   * while every page on screen had been fetched as `activeRole`: a top bar
packages/next-shell/src\viewer.test.ts:397:      activeRole: 'workshop_owner',
packages/next-shell/src\viewer.test.ts:401:        { organizationId: 'o1', organizationName: 'Abossey Motors', branchId: 'b1', branchName: 'Main', roleName: 'technician' },
packages/next-shell/src\viewer.test.ts:402:        { organizationId: 'o1', organizationName: 'Abossey Motors', branchId: 'b1', branchName: 'Main', roleName: 'workshop_owner' },
packages/next-shell/src\viewer.test.ts:432:    { organizationId: 'o1', organizationName: 'Abossey Motors', branchId: 'b1', branchName: 'Main', roleName: 'technician' },
packages/next-shell/src\viewer.test.ts:433:    { organizationId: 'o1', organizationName: 'Abossey Motors', branchId: 'b2', branchName: 'Spintex', roleName: 'technician' },
packages/next-shell/src\viewer.test.ts:434:    { organizationId: 'o1', organizationName: 'Abossey Motors', branchId: 'b1', branchName: 'Main', roleName: 'workshop_supervisor' },
packages/next-shell/src\viewer.test.ts:435:    { organizationId: 'o2', organizationName: 'Tema Auto', branchId: null, branchName: null, roleName: 'technician' },
packages/next-shell/src\viewer.test.ts:438:  it('offers each organization once, however many branches and roles it holds', () => {
packages/next-shell/src\viewer.test.ts:452:    expect(rolesFromMemberships(memberships, 'o1')).toEqual([
packages/next-shell/src\viewer.test.ts:472:    expect(rolesFromMemberships(memberships, 'o2')).toEqual([
packages/next-shell/src\viewer.test.ts:479:    expect(rolesFromMemberships(memberships, 'o-not-mine')).toEqual([]);
packages/next-shell/src\viewer.test.ts:487:    expect(rolesFromMemberships([{ organizationId: 'o1', roleName: 'brand_new_role' }], 'o1')).toEqual([
packages/next-shell/src\viewer.test.ts:532:    expect(rolesFromMemberships([], 'o1')).toEqual([]);
packages/next-shell/src\api.ts:3:import { activeOrganizationHeader, activeRoleHeader, currentViewer } from './viewer';
packages/next-shell/src\api.ts:92: * `activeRole === 'customer'`; for a `workshop_manager` it correctly returns
packages/next-shell/src\api.ts:119:  const isCustomer = viewer.memberships.some((m) => m.roleName === 'customer');
packages/next-shell/src\api.ts:208:        ...(await activeRoleHeader(workspaceId)),
packages/next-shell/src\api.ts:381:        ...(await activeRoleHeader(workspaceId)),
packages/next-shell/src\ActingAsControl.tsx:4:import { rolesFromMemberships } from './viewer-contract';
packages/next-shell/src\ActingAsControl.tsx:65:  // `rolesFromMemberships`.
packages/next-shell/src\ActingAsControl.tsx:66:  const roles = rolesFromMemberships(viewer.memberships, viewer.organizationId);
packages/next-shell/src\ActingAsControl.tsx:71:  if (roles.length < 2) return null;
packages/next-shell/src\ActingAsControl.tsx:75:      roles={roles}
packages/next-shell/src\ActingAsControl.tsx:76:      activeRole={viewer.activeRole}
packages/next-shell/src\viewer-contract.ts:42:  activeRole: string;
packages/next-shell/src\viewer-contract.ts:50:    roleName: string;
packages/next-shell/src\viewer-contract.ts:64: * Only the eight WORKSHOP roles appear. That is correct, not an omission: the
packages/next-shell/src\viewer-contract.ts:87:export function navRoleFor(activeRole: string | undefined): RoleId | undefined {
packages/next-shell/src\viewer-contract.ts:88:  if (!activeRole) return undefined;
packages/next-shell/src\viewer-contract.ts:89:  return Object.hasOwn(ROLE_TO_NAV, activeRole) ? ROLE_TO_NAV[activeRole] : undefined;
packages/next-shell/src\viewer-contract.ts:130:  // roles they administer. Omitting them would have had the OPPOSITE effect of
packages/next-shell/src\viewer-contract.ts:153: * their own workspace's screens — the four apps those roles exist for.
packages/next-shell/src\viewer-contract.ts:157: * written (gap A1), and the four roles above could not be created in production
packages/next-shell/src\viewer-contract.ts:187:   * `aw.activeRole` / `aw.activeOrganization` switcher cookies, which was fixed
packages/next-shell/src\viewer-contract.ts:241:export function homeWorkspaceFor(activeRole: string | undefined): string {
packages/next-shell/src\viewer-contract.ts:242:  if (activeRole === undefined) return 'workshop';
packages/next-shell/src\viewer-contract.ts:243:  return HOME_WORKSPACE[activeRole] ?? 'workshop';
packages/next-shell/src\viewer-contract.ts:248:  activeRole: string | undefined,
packages/next-shell/src\viewer-contract.ts:250:  if (activeRole === undefined) return false;
packages/next-shell/src\viewer-contract.ts:251:  return (HOME_WORKSPACE[activeRole] ?? 'workshop') !== workspaceId;
packages/next-shell/src\viewer-contract.ts:262:export function isForeignToWorkshop(activeRole: string | undefined): boolean {
packages/next-shell/src\viewer-contract.ts:263:  return activeRole !== undefined && NON_WORKSHOP_ROLES.has(activeRole);
packages/next-shell/src\viewer-contract.ts:352:    // ⚠️ FROM `activeRole`, NOT from the membership row matched above. The
packages/next-shell/src\viewer-contract.ts:354:    // SEVERAL roles in one organisation — `owner@` holds three. `activeRole` is
packages/next-shell/src\viewer-contract.ts:358:    roleLabel: roleLabel(viewer.activeRole),
packages/next-shell/src\viewer-contract.ts:400: * The DISTINCT roles a viewer may act as IN ONE ORGANIZATION.
packages/next-shell/src\viewer-contract.ts:406: * organization, which is a rule with its own test. So a switcher listing roles
packages/next-shell/src\viewer-contract.ts:439: * UI any more — the switcher only offers roles held in the active organization,
packages/next-shell/src\viewer-contract.ts:456:  roleName: string,
packages/next-shell/src\viewer-contract.ts:459:    (m) => m.roleName === roleName && m.organizationId === viewer.organizationId,
packages/next-shell/src\viewer-contract.ts:463:export function rolesFromMemberships(
packages/next-shell/src\viewer-contract.ts:464:  memberships: readonly { organizationId: string; roleName: string }[],
packages/next-shell/src\viewer-contract.ts:471:    if (seen.has(m.roleName)) continue;
packages/next-shell/src\viewer-contract.ts:472:    seen.add(m.roleName);
packages/next-shell/src\viewer-contract.ts:473:    out.push({ name: m.roleName, label: roleLabel(m.roleName) });
packages/next-shell/src\active-role.ts:45:export async function activeRoleName(): Promise<string | undefined> {
packages/next-shell/src\active-role.ts:54: * ⚠️ THE UNCHECKED VARIANT EXISTS BECAUSE THE CHECK NEEDS `/me`. `activeRoleHeader`
packages/next-shell/src\active-role.ts:67:  const role = await activeRoleName();
packages/next-shell/src\registration.ts:40:  organizations: Array<{ organizationId: string; roleName: string }>;
packages/next-shell/src\role-label.ts:23:export function roleLabel(roleName: string): string {
packages/next-shell/src\role-label.ts:24:  const words = roleName.replace(/_/g, ' ').trim();
packages/next-shell/src\require-route.ts:91:  // FLEET-web — the apps those roles exist for. See `isForeignToWorkspace`.
packages/next-shell/src\require-route.ts:92:  if (isForeignToWorkspace(workspaceId, viewer?.activeRole)) notFound();
packages/next-shell/src\set-organization-action.ts:58:  // The mirror of the fix in `rolesFromMemberships`, which stops the role list
packages/next-shell/src\RoleSwitcher.tsx:17: * contains only roles the API already reported as the viewer's own memberships,
packages/next-shell/src\RoleSwitcher.tsx:39:  roles,
packages/next-shell/src\RoleSwitcher.tsx:40:  activeRole,
packages/next-shell/src\RoleSwitcher.tsx:43:  roles: readonly RoleOption[];
packages/next-shell/src\RoleSwitcher.tsx:44:  activeRole: string;
packages/next-shell/src\RoleSwitcher.tsx:53:  if (roles.length < 2) return null;
packages/next-shell/src\RoleSwitcher.tsx:62:        name="roleName"
packages/next-shell/src\RoleSwitcher.tsx:81:        key={activeRole}
packages/next-shell/src\RoleSwitcher.tsx:82:        defaultValue={activeRole}
packages/next-shell/src\RoleSwitcher.tsx:95:        {roles.map((r) => (
packages/next-shell/src\switch-destination.test.ts:56:  it('has roles to test', () => {
packages/next-shell/src\switch-destination.test.ts:72:  // `roleName` arrives from a form field the user controls. It is never
packages/next-shell/src\set-role-action.ts:23: * The control that calls this only OFFERS roles the viewer holds, which is a
packages/next-shell/src\set-role-action.ts:27:export async function setActiveRoleAction(roleName: string): Promise<void> {
packages/next-shell/src\set-role-action.ts:29:  const value = roleName.trim();
packages/next-shell/src\set-role-action.ts:74:  const roleName = String(formData.get('roleName') ?? '');
packages/next-shell/src\set-role-action.ts:75:  await setActiveRoleAction(roleName);
packages/next-shell/src\set-role-action.ts:96:  // ⚠️ NOT AN OPEN REDIRECT even though `roleName` is user-controlled: it is
packages/next-shell/src\set-role-action.ts:104:  redirect(roleName.trim() === '' ? '/' : `/${homeWorkspaceFor(roleName.trim())}`);

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content apps/api/src/identity/membership.service.ts | Select-Object -Skip 300 -First 130; Get-Content 
apps/api/src/authz/permission-matrix.ts | Select-Object -Skip 250 -First 100; git diff --check' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 1960ms:
      // `tenant_id = <A>` with `organization_id = <an org in tenant B>`
      // satisfies the FK and the policy at once. On the platform's
      // privilege-GRANTING operation, that is a membership filed under one
      // tenant and pointing into another's organization.
      //
      // Both lookups work because those tables are under FORCE RLS: a row in
      // another tenant is simply invisible here and returns nothing.
      const org = await client.query<{ org_type: string }>(
        // ðŸ”´ `org_type`, NOT `1`. See the compatibility check below â€” the row's
        // EXISTENCE was all this asked for, and existence is not the whole
        // question on the privilege-granting operation.
        `SELECT org_type FROM identity.organizations WHERE id = $1 AND tenant_id = $2`,
        [input.organizationId, ctx.tenantId],
      );
      if (org.rows.length === 0) throw new NotFoundException('organization not found');

      // â”€â”€ ðŸ”´ THE ROLE MUST SUIT THE ORGANISATION IT IS GRANTED IN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      //
      // MEASURED, NOT HYPOTHETICAL. Before this check, a query of the
      // development database returned:
      //
      //     parts_supplier | reception_staff | 1
      //
      // â€” a workshop reception role inside a PARTS SUPPLIER organisation. Every
      // gate above passed it: `reception_staff` is in `GRANTABLE_ROLES`, the
      // organisation was in the caller's tenant, and RLS `WITH CHECK` validates
      // the tenant of the row being inserted and says nothing about whether the
      // role makes sense where it landed.
      //
      // The consequence is not a cross-tenant leak â€” `resolveTenantContext`
      // still pins the request to this organisation â€” it is INCOHERENCE, which
      // fails in the quiet direction this repository keeps paying for. A
      // `reception_staff` in a supplier organisation resolves the WORKSHOP
      // reception navigation tree (`workspaceForRole`), so the person is shown
      // Vehicle Intake and Customer Complaints for an organisation that has
      // neither, and `isForeignToWorkspace` sends them to the workshop pack,
      // where every API call is scoped to a supplier's tenant. Nothing errors.
      //
      // âš ï¸ ENFORCED ON THE GRANT, NOT ON EXISTING ROWS. This is a forward
      // constraint: the row above keeps working and is not migrated away, so no
      // live membership breaks. A database CHECK would have been the stronger
      // place and is not available â€” the pairing spans two tables.
      //
      // âš ï¸ `platform_administrator` IS DELIBERATELY VALID IN A WORKSHOP. It is
      // the documented compromise the model forces (the owner holds it via a
      // membership attached to their own workshop), and since migration 078 the
      // AUTHORITY comes from a grant record rather than this name, so admitting
      // the name here confers nothing on its own.
      const orgType = org.rows[0]!.org_type;
      if (!roleSuitsOrganisation(input.roleName, orgType)) {
        // Names the mismatch without enumerating the taxonomy, matching the
        // deliberately vague 'unknown role' above: the caller learns that the
        // pair is wrong, not what the full set of valid pairs is.
        throw new BadRequestException(
          `role '${input.roleName}' cannot be granted in a ${orgType} organisation`,
        );
      }

      if (input.branchId) {
        // Also asserts the branch belongs to THIS organization â€” a branch from
        // a sibling organization in the same tenant would pass a bare
        // existence check while scoping the membership to the wrong site,
        // which Â§50's "approved role and branch" rule forbids.
        const branch = await client.query(
          `SELECT 1 FROM identity.branches
              WHERE id = $1 AND organization_id = $2 AND tenant_id = $3`,
          [input.branchId, input.organizationId, ctx.tenantId],
        );
        if (branch.rows.length === 0) throw new NotFoundException('branch not found');
      }

      const res = await client.query(
        `INSERT INTO identity.memberships
           (tenant_id, organization_id, branch_id, user_id, role_name, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (organization_id, user_id, role_name) DO NOTHING
         RETURNING id, organization_id, branch_id, user_id, role_name, status, created_at`,
        [
          // From the resolved context, never the request body. RLS `WITH CHECK`
          // would reject a mismatch anyway â€” both layers, by design.
          ctx.tenantId,
          input.organizationId,
          input.branchId ?? null,
          userId,
          input.roleName,
          ctx.userId,
        ],
      );

      let row = res.rows[0];
      if (!row) {
        // â”€â”€ the unique constraint fired: this grant already exists â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        //
        // ðŸ”´ AND IT MAY BE A REVOKED ONE, WHICH USED TO BE A DEAD END. A
        // membership is never deleted â€” withdrawal sets `status = 'revoked'`
        // and keeps the row so "was this person ever granted access?" stays
        // answerable. But the row still occupies the unique key, so re-hiring
        // somebody previously removed hit `ON CONFLICT DO NOTHING` and was
        // refused with "membership already exists" â€” a message that is the
        // OPPOSITE of the truth, told to an owner looking at a colleague who
        // demonstrably has no access, with nothing anywhere to undo it.
        //
        // A rule whose escape hatch is unreachable is a wall, not a rule.
        const existing = await client.query(
          `UPDATE identity.memberships
              -- ðŸ”´ THE BRANCH IS RE-SET, NOT INHERITED. The unique key is
              -- (organization_id, user_id, role_name) and does NOT include the
              -- branch, so re-hiring the same person into the same role at a
              -- DIFFERENT site matched the old row and would have reactivated
              -- it with the OLD branch_id â€” quietly granting access to a site
              -- nobody approved, which is exactly what Â§50's "approved role AND
              -- branch" forbids. The branchId parameter has already been
              -- validated against this organization above.
              --
              -- NO BACKTICKS IN THIS COMMENT: it sits inside a TS template
              -- literal, so one terminates the string. FIFTH instance.
              -- (Codex, 2026-08-04.)
              SET status = 'active', branch_id = $6,
                  updated_at = now(), updated_by = $1
            WHERE organization_id = $2 AND user_id = $3 AND role_name = $4
              AND tenant_id = $5
              -- Only a WITHDRAWN one is reinstated. An ACTIVE row matches
              -- nothing here and still falls through to the refusal below,
              -- because "add them again" when they are already there changed
              -- nothing and must not read as though it did.
              AND status <> 'active'
            RETURNING id, organization_id, branch_id, user_id, role_name, status, created_at`,
          [ctx.userId, input.organizationId, userId, input.roleName, ctx.tenantId,
           input.branchId ?? null],
        );
 * TEXT column on a row inside ONE organisation and had no business opening every
 * tenant table in the database.
 *
 * ðŸ”´ THIS IS NOT A LIST OF ADMINISTRATORS AND MUST NEVER BE USED AS AN
 * AUTHORIZATION GATE. It contains `admin` â€” the literal that seed scripts,
 * migrations and hand-run psql set â€” and a real platform administrator's
 * `activeRole` is NOT in it. Gate on `PERMISSIONS.platformAdmin` via
 * `permissionsForRole`, as `security.controller.ts`, `operations.controller.ts`
 * and (since 077) `catalogue.controller.ts` all do.
 */
export const DB_PLATFORM_ADMIN_ROLE_NAMES: readonly string[] = Object.freeze(['admin']);

/**
 * Role authority, STRONGEST FIRST â€” the tie-break for the default selection in
 * `resolveTenantContext`.
 *
 * âš ï¸ WHY THIS IS NEEDED, AND WHY IT IS NOT COSMETIC. The default sorts
 * memberships by ORGANISATION ID ALONE. Two roles in the SAME organisation
 * therefore compare equal, and `Array.prototype.sort` is stable â€” so the winner
 * was whatever order the database returned the rows in. A user holding both
 * `workshop_owner` and `technician` at one workshop could resolve as the
 * TECHNICIAN and see less than they hold, with nothing on screen to explain it,
 * and the result could differ between two identical requests after a VACUUM.
 *
 * That is precisely why the owner account was given ONE strong role instead of
 * several weak ones (2026-07-31). Stacking roles is only safe once the default
 * is deterministic, which is what this list makes it.
 *
 * âš ï¸ IT GRANTS NOTHING. Every candidate it ranks is already an active
 * membership the server proved from the validated token subject. Choosing the
 * strongest of them cannot reach a role the user does not hold â€” and the role
 * switcher exists so they can deliberately act as a weaker one. Compare the
 * REQUESTED-role path, which throws rather than picking: there a client named
 * something, and silently substituting would hide an authorization probe. Here
 * nothing was named, so there is nothing to contradict.
 *
 * ORDERING IS SOURCED, not invented: `07.txt` pt2 Â§50 describes owner as "full
 * workshop governance, staff, financial and reporting access" and each
 * subsequent role as a narrower slice. `platform_administrator` leads because
 * Â§32 gives it the administration surface in its entirety.
 *
 * An UNRANKED role sorts LAST rather than first â€” a role added to the database
 * before it is added here must never silently outrank a governance role.
 */
export const ROLE_PRECEDENCE: readonly string[] = Object.freeze([
  'platform_administrator',
  'workshop_owner',
  'supplier_owner',
  'fleet_administrator',
  // ðŸ”´ 085 â€” AND THIS IS THE SITE THE ORIGINAL ELEVEN-FILE SURVEY MISSED.
  //
  // A role absent from this list ranks WEAKEST (`Number.MAX_SAFE_INTEGER`, see
  // `rolePrecedence` below), so default-role selection silently prefers ANY
  // other membership the person holds. An org admin that loses the tie-break to
  // `customer` would sign in to the wrong workspace and read as a permissions
  // bug rather than a missing list entry.
  //
  // Placed beside the other three org admins because that is what they are:
  // each is the top authority inside one organisation type, and none outranks
  // another. Their operational roles keep their existing, lower positions.
  'insurance_owner',
  'towing_owner',
  'workshop_manager',
  'workshop_supervisor',
  'quality_control_inspector',
  'insurance_assessor',
  'reception_staff',
  'cashier',
  'storekeeper',
  'technician',
  'towing_operator',
  'customer',
]);

/**
 * Rank for the tie-break: LOWER IS STRONGER, unknown roles last.
 *
 * `Number.MAX_SAFE_INTEGER` rather than `Infinity` so the value survives a JSON
 * round trip if it is ever logged â€” `JSON.stringify(Infinity)` is `null`, and a
 * null in a comparator is a silent zero.
 */
export function rolePrecedence(roleName: string): number {
  const i = ROLE_PRECEDENCE.indexOf(roleName);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}
warning: in the working copy of 'apps/api/src/authz/permission-matrix.spec.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'apps/api/src/authz/permission-matrix.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'apps/api/src/identity/membership-role-fit.spec.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'apps/api/src/insurance/insurance-roles.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'apps/api/src/towing/towing-roles.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'apps/web/app/onboarding/account-types.spec.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'apps/web/app/onboarding/account-types.ts', LF will be replaced by CRLF the next time Git touches it

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n -B 15 -A 30 \"CAN_GRANT_MEMBERSHIP.has|GRANTABLE_ROLES.has\" apps/api/src/identity/membership.service.ts; rg -n 
\"insurance_assessor|towing_operator\" apps/api/src --glob \"*.ts\" | rg -v \"\\.spec\\.ts|insurance-roles|towing-roles|registration.controller|membership.service|membership.repository\"" in 
C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 2251ms:
224-   * `07.txt` part 2 §3 (staff invitation): role and approval limits are set at
225-   * invitation. §50's closing rule governs the result: "No user shall receive
226-   * functions outside the user's approved role and branch."
227-   */
228-  async grant(
229-    ctx: TenantContext,
230-    input: {
231-      userId?: string;
232-      /** The person's email — resolved here, so no lookup endpoint exists to harvest. */
233-      userEmail?: string;
234-      organizationId: string;
235-      branchId?: string | null;
236-      roleName: string;
237-    },
238-  ): Promise<Membership> {
239:    if (!CAN_GRANT_MEMBERSHIP.has(ctx.activeRole)) {
240-      throw new ForbiddenException(
241-        `role '${ctx.activeRole}' may not grant a membership`,
242-      );
243-    }
244-    // 🔴 THE "EXACTLY ONE" RULE BELONGS HERE, NOT ONLY IN THE ZOD SCHEMA.
245-    //
246-    // `GrantMembershipBody` refines it at the HTTP boundary, and this service is
247-    // NOT only reached over HTTP: ADR-010/013 route agents through MCP into
248-    // these same domain services, and CLAUDE.md is explicit that business rules
249-    // live in the service. A direct caller sending BOTH would have had `userId`
250-    // silently win, and one sending NEITHER would have run an email lookup for
251-    // `undefined` — on the platform's privilege-granting operation, either is a
252-    // silent disagreement about WHO is being given access. (Codex, 2026-08-04.)
253-    if (Boolean(input.userId) === Boolean(input.userEmail)) {
254-      throw new BadRequestException('send exactly one of userId or userEmail');
255-    }
256:    if (!GRANTABLE_ROLES.has(input.roleName)) {
257-      // Names the constraint, not the valid set: enumerating grantable roles in
258-      // an error message hands a caller the platform's authorization taxonomy,
259-      // which is the disclosure the catch-all route was already fixed to avoid.
260-      throw new BadRequestException('unknown role');
261-    }
262-
263-    return this.db.withTenant(ctx, async (client) => {
264-      // ── resolve WHO, before anything else ────────────────────────────────
265-      //
266-      // `identity.users` is deliberately NOT tenant-scoped (one human may hold
267-      // memberships in several tenants), so this lookup can see an account that
268-      // is not yet a member — which is the entire point: without it there was
269-      // no way to add anybody who was not already inside.
270-      //
271-      // ⚠️ EXACT MATCH, CASE-INSENSITIVE, ONE ROW. Not a prefix, not a LIKE.
272-      // The caller learns only whether the single address they already typed
273-      // has an account, and only after passing the role gate above. That is not
274-      // an enumeration oracle; a search endpoint would have been one.
275-      let userId = input.userId ?? null;
276-      if (!userId) {
277-        const found = await client.query(
278-          `SELECT id FROM identity.users WHERE lower(email) = lower($1)`,
279-          [input.userEmail],
280-        );
281-        if (found.rows.length === 0) {
282-          // Names the way forward rather than just refusing. There is no invite
283-          // flow yet (T-0028), so the honest instruction is that the person
284-          // signs up first — a refusal with no reachable next step is the wall
285-          // this repository keeps writing down.
286-          throw new NotFoundException(
--
456-  }
457-
458-  /**
459-   * Suspend or revoke a membership — withdrawing access.
460-   *
461-   * Status only ever moves toward LESS access. Re-granting is a new grant, with
462-   * its own audit row, rather than a status flip: the audit trail for approvals
463-   * and access is append-only per CLAUDE.md, and a reversible toggle would make
464-   * "was this person ever revoked?" unanswerable.
465-   */
466-  async withdraw(
467-    ctx: TenantContext,
468-    id: string,
469-    status: 'suspended' | 'revoked',
470-  ): Promise<Membership> {
471:    if (!CAN_GRANT_MEMBERSHIP.has(ctx.activeRole)) {
472-      throw new ForbiddenException(
473-        `role '${ctx.activeRole}' may not withdraw a membership`,
474-      );
475-    }
476-
477-    // Validate the target status AT RUNTIME. The parameter's union type is
478-    // erased at compile time, and the controller passes the request body
479-    // straight through, so `{ "status": "active" }` reached this method as a
480-    // string the database's CHECK constraint happily accepts — turning a
481-    // withdrawal into a silent no-op that still wrote an audit row reading
482-    // `membership.active`, an action this service never performs. Any other
483-    // string produced a constraint violation and a 500 where a 400 was owed.
484-    //
485-    // The check belongs HERE and not only in the controller because an MCP tool
486-    // calls this service directly, without passing through any controller. A
487-    // rule enforced only at the HTTP edge is not enforced for agents — which is
488-    // the whole premise of the AI boundary (`0.txt` §13, §26).
489-    if (status !== 'suspended' && status !== 'revoked') {
490-      throw new BadRequestException('status must be suspended or revoked');
491-    }
492-
493-    return this.db.withTenant(ctx, async (client) => {
494-      const res = await client.query(
495-        `UPDATE identity.memberships
496-            SET status = $2, updated_at = now(), updated_by = $3
497-          WHERE id = $1
498-            AND status = 'active'
499-            AND tenant_id = $4
500-        RETURNING id, organization_id, branch_id, user_id, role_name, status, created_at`,
501-        [id, status, ctx.userId, ctx.tenantId],
apps/api/src\authz\permission-matrix.ts:123:  insurance_assessor: [financeRead],
apps/api/src\authz\permission-matrix.ts:127:   * is why `towing_operator` below keeps its empty list.
apps/api/src\authz\permission-matrix.ts:131:  towing_operator: [],
apps/api/src\authz\permission-matrix.ts:316:  'insurance_assessor',
apps/api/src\authz\permission-matrix.ts:321:  'towing_operator',

codex
Two concrete issues are emerging. First, the backfill does not actually test “earliest membership”; it finds the earliest row only after filtering to self-created operational roles, which can 
promote a later non-founder. Second, verify/085 performs a raw SQL insert while running as database admin, so it does not prove the API grant capability its comments claim. I’m checking for any 
additional missed role sites and test failures before finalizing severity.
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content package.json -TotalCount 160; rg -n "insurance_owner|towing_owner|insurance_assessor|towing_operator" 
packages/next-shell/src/*.test.ts packages/navigation/src/*.test.ts apps/api/src/**/*.spec.ts apps/web/app/**/*.spec.ts' in C:\Users\USER\Documents\autoworkshop-ai
2026-08-17T16:42:15.802564Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 0.9 seconds
Output:
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
rg: packages/next-shell/src/*.test.ts: The filename, directory name, or volume label syntax is incorrect. (os error 123)
rg: packages/navigation/src/*.test.ts: The filename, directory name, or volume label syntax is incorrect. (os error 123)
rg: apps/api/src/**/*.spec.ts: The filename, directory name, or volume label syntax is incorrect. (os error 123)
rg: apps/web/app/**/*.spec.ts: The filename, directory name, or volume label syntax is incorrect. (os error 123)

 exited 1 in 884ms:
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
rg: packages/next-shell/src/*.test.ts: The filename, directory name, or volume label syntax is incorrect. (os error 123)
rg: packages/navigation/src/*.test.ts: The filename, directory name, or volume label syntax is incorrect. (os error 123)
rg: apps/api/src/**/*.spec.ts: The filename, directory name, or volume label syntax is incorrect. (os error 123)
rg: apps/web/app/**/*.spec.ts: The filename, directory name, or volume label syntax is incorrect. (os error 123)

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content apps/api/package.json; Get-Content apps/web/package.json; Get-Content packages/next-shell/package.json' in 
C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 739ms:
{
  "name": "@autoworkshop/api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "dev": "nest start --watch",
    "start": "node dist/main.js",
    "lint": "eslint src --ext .ts --max-warnings 0",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.15",
    "@nestjs/config": "^3.3.0",
    "@nestjs/core": "^10.4.15",
    "@nestjs/jwt": "^11.0.2",
    "@nestjs/platform-express": "^10.4.15",
    "@nestjs/terminus": "^10.2.3",
    "jsonwebtoken": "^9.0.3",
    "jwks-rsa": "^4.1.0",
    "nodemailer": "^9.0.5",
    "pg": "^8.22.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@autoworkshop/config": "workspace:*",
    "@nestjs/cli": "^10.4.9",
    "@nestjs/schematics": "^10.2.3",
    "@types/express": "^5.0.0",
    "@types/jsonwebtoken": "^9.0.10",
    "@types/nodemailer": "^8.0.1",
    "@types/pg": "^8.20.0",
    "@typescript-eslint/eslint-plugin": "^8.18.1",
    "@typescript-eslint/parser": "^8.18.1",
    "eslint": "^8.57.1",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
{
  "name": "@autoworkshop/web",
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
    "@autoworkshop/marketplace-ui": "workspace:*",
    "@autoworkshop/navigation": "workspace:*",
    "@autoworkshop/next-shell": "workspace:*",
    "@autoworkshop/ui": "workspace:*",
    "next": "15.1.3",
    "react": "18.3.1",
    "react-dom": "18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.17",
    "@types/react-dom": "^18.3.5",
    "eslint": "^8.57.1",
    "eslint-config-next": "15.1.3",
    "typescript": "^5.7.2",
    "vitest": "^2.1.9"
  }
}
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

2026-08-17T16:42:25.359615Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'pnpm --filter @autoworkshop/api test -- 
src/authz/permission-matrix.spec.ts src/identity/membership-role-fit.spec.ts; pnpm --filter @autoworkshop/web test -- app/onboarding/account-types.spec.ts; pnpm --filter @autoworkshop/next-shell 
test'` rejected: blocked by policy
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'pnpm --filter @autoworkshop/api test -- src/authz/permission-matrix.spec.ts src/identity/membership-role-fit.spec.ts; 
pnpm --filter @autoworkshop/web test -- app/onboarding/account-types.spec.ts; pnpm --filter @autoworkshop/next-shell test' in C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'pnpm --filter @autoworkshop/api test -- src/authz/permission-matrix.spec.ts src/identity/membership-role-fit.spec.ts; 
pnpm --filter @autoworkshop/web test -- app/onboarding/account-types.spec.ts; pnpm --filter @autoworkshop/next-shell test'` rejected: blocked by policy
2026-08-17T16:42:30.226154Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'pnpm --filter @autoworkshop/api test -- 
src/authz/permission-matrix.spec.ts src/identity/membership-role-fit.spec.ts'` rejected: blocked by policy
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'pnpm --filter @autoworkshop/api test -- src/authz/permission-matrix.spec.ts src/identity/membership-role-fit.spec.ts' in 
C:\Users\USER\Documents\autoworkshop-ai
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'pnpm --filter @autoworkshop/api test -- src/authz/permission-matrix.spec.ts src/identity/membership-role-fit.spec.ts'` 
rejected: blocked by policy
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'pnpm --filter @autoworkshop/web test -- app/onboarding/account-types.spec.ts' in C:\Users\USER\Documents\autoworkshop-ai
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'pnpm --filter @autoworkshop/next-shell test' in C:\Users\USER\Documents\autoworkshop-ai
2026-08-17T16:42:30.287923Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'pnpm --filter @autoworkshop/web test -- 
app/onboarding/account-types.spec.ts'` rejected: blocked by policy
2026-08-17T16:42:30.387745Z ERROR codex_core::tools::router: error=`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'pnpm --filter @autoworkshop/next-shell test'` 
rejected: blocked by policy
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'pnpm --filter @autoworkshop/web test -- app/onboarding/account-types.spec.ts'` rejected: blocked by policy
 declined in 0ms:
`"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'pnpm --filter @autoworkshop/next-shell test'` rejected: blocked by policy
exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"WITH founders|m.created_by = m.user_id|ORDER BY m.organization_id|PERFORM set_config\\('app.current_role'|INSERT 
INTO identity.memberships|CHECK 4|No organisation may hold more than one|grants insurance_assessor|can grant a membership|GRANTABLE_ROLES|insurance_company:|towing_company:\" 
infrastructure/migrations/085_insurance_and_towing_org_admin.sql infrastructure/migrations/verify/085_insurance_and_towing_org_admin.sql apps/api/src/identity/membership.service.ts" in 
C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 552ms:
apps/api/src/identity/membership.service.ts:67:const GRANTABLE_ROLES = new Set([
apps/api/src/identity/membership.service.ts:95: * Derived from `GRANTABLE_ROLES` rather than retyped, so a role added above
apps/api/src/identity/membership.service.ts:100:  ...[...GRANTABLE_ROLES].filter(
apps/api/src/identity/membership.service.ts:109:  // Not in `GRANTABLE_ROLES` — it cannot be granted through this service at all
apps/api/src/identity/membership.service.ts:155:  insurance_company: ['insurance_owner', 'insurance_assessor'],
apps/api/src/identity/membership.service.ts:156:  towing_company: ['towing_owner', 'towing_operator'],
apps/api/src/identity/membership.service.ts:256:    if (!GRANTABLE_ROLES.has(input.roleName)) {
apps/api/src/identity/membership.service.ts:325:      // gate above passed it: `reception_staff` is in `GRANTABLE_ROLES`, the
apps/api/src/identity/membership.service.ts:373:        `INSERT INTO identity.memberships
infrastructure/migrations/verify/085_insurance_and_towing_org_admin.sql:5:-- 🔴 CHECK 4 IS THE WHOLE POINT. Everything before it is scaffolding.
infrastructure/migrations/verify/085_insurance_and_towing_org_admin.sql:42:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations/verify/085_insurance_and_towing_org_admin.sql:95:    INSERT INTO identity.memberships
infrastructure/migrations/verify/085_insurance_and_towing_org_admin.sql:128:                        'no member who can grant a membership.', n;
infrastructure/migrations/verify/085_insurance_and_towing_org_admin.sql:136:    -- No organisation may hold more than one org admin as a result of 085.
infrastructure/migrations/085_insurance_and_towing_org_admin.sql:16:-- `INSERT INTO identity.memberships` in the entire API, and migration 080
infrastructure/migrations/085_insurance_and_towing_org_admin.sql:163:    INSERT INTO identity.memberships
infrastructure/migrations/085_insurance_and_towing_org_admin.sql:188:'grants insurance_assessor (and later claims_approver), mirroring '
infrastructure/migrations/085_insurance_and_towing_org_admin.sql:268:    INSERT INTO identity.memberships
infrastructure/migrations/085_insurance_and_towing_org_admin.sql:314:WITH founders AS (
infrastructure/migrations/085_insurance_and_towing_org_admin.sql:323:       AND m.created_by = m.user_id
infrastructure/migrations/085_insurance_and_towing_org_admin.sql:325:     ORDER BY m.organization_id, m.created_at ASC, m.id ASC
infrastructure/migrations/085_insurance_and_towing_org_admin.sql:352:    PERFORM set_config('app.current_role', 'admin', true);
infrastructure/migrations/085_insurance_and_towing_org_admin.sql:373:          'who can grant a membership. The founder rule (created_by = user_id '

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n -C 2 '\"name\": 
\"(supplier_owner|fleet_administrator|towing_operator|insurance_assessor|platform_administrator)\"' infrastructure/keycloak/realm-autoworkshop.json; rg -n 
\"realm_access|resource_access|Keycloak.*role|roles.*includes|platform_administrator\" apps/api/src/auth apps/api/src --glob \"*.ts\" | Select-Object -First 120" in 
C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 2007ms:
apps/api/src/auth\tenant.guard.ts:102:    // SUBJECT — never on `realm_access.roles` and never on a membership
apps/api/src/auth\keycloak-jwt.spec.ts:57:    const token = sign({ sub: 'user-123', email: 'a@b.c', realm_access: { roles: ['mechanic'] } });
apps/api/src/auth\keycloak-jwt.service.ts:99:      (payload['realm_access'] as { roles?: string[] } | undefined)?.roles ?? [];
apps/api/src\towing\towing.spec.ts:36:    for (const role of ['workshop_owner', 'workshop_manager', 'platform_administrator']) {
apps/api/src\towing\towing-roles.ts:27: *   platform_administrator §32 gives it the administration surface entire
apps/api/src\towing\towing-roles.ts:45:  'platform_administrator',
apps/api/src\insurance\insurance.controller.ts:144: * `identity.platform_administrators`, not from a membership `role_name` — so
apps/api/src\insurance\insurance-roles.ts:28: * `platform_administrator` is included for the same reason it is in
apps/api/src\insurance\insurance-roles.ts:42:  'platform_administrator',
apps/api/src\tenancy\tenant-context.ts:26:   * Does this user hold an un-revoked row in `identity.platform_administrators`?
apps/api/src\tenancy\tenant-context.ts:30:   * (migration 078), keyed on the validated Keycloak subject — never on a role
apps/api/src\tenancy\tenant-context.ts:42:   * to SELECT a `platform_administrator` membership without it, so a role name
apps/api/src\tenancy\tenant-context.ts:131:  // 🔴 A `platform_administrator` MEMBERSHIP IS NOT ELIGIBLE WITHOUT A GRANT.
apps/api/src\tenancy\tenant-context.ts:138:  // or on `activeRole === 'platform_administrator'` directly. But the role name
apps/api/src\tenancy\tenant-context.ts:155:  // `platform_administrator` and whose grant has been revoked holds no authority
apps/api/src\tenancy\tenant-context.ts:180:        'identity.platform_administrators; the membership role alone confers none',
apps/api/src\tenancy\tenant-context.ts:192:        ? 'the only active membership is platform_administrator and no un-revoked ' +
apps/api/src\tenancy\tenant-context.ts:264:    // `platform_administrator`, `workshop_owner` and `technician` at one
apps/api/src\tenancy\tenant-context.ts:267:    //     customer@1f290945 | platform_administrator@aaaaaaaa | ... -> customer
apps/api/src\tenancy\tenant-context.ts:311:    // requires the grant AND `activeRole === 'platform_administrator'`, so a
apps/api/src\tenancy\tenant-context.spec.ts:158:    membership({ organizationId: 'org-1', roleName: 'platform_administrator' }),
apps/api/src\tenancy\tenant-context.spec.ts:172:    for (const role of ['technician', 'workshop_supervisor', 'platform_administrator']) {
apps/api/src\tenancy\tenant-context.spec.ts:186:   * be `platform_administrator`. It must THROW — never fall back to the role
apps/api/src\tenancy\tenant-context.spec.ts:196:        requestedRoleName: 'platform_administrator',
apps/api/src\tenancy\tenant-context.spec.ts:209:        // ⚠️ `workshop_owner`, NOT `platform_administrator`. It was the
apps/api/src\tenancy\tenant-context.spec.ts:227:          membership({ roleName: 'platform_administrator', status: 'revoked' }),
apps/api/src\tenancy\tenant-context.spec.ts:229:        requestedRoleName: 'platform_administrator',
apps/api/src\tenancy\tenant-context.spec.ts:280:    expect(ctx.activeRole).toBe('platform_administrator');
apps/api/src\tenancy\tenant-context.spec.ts:293:    expect(ctx.activeRole).toBe('platform_administrator');
apps/api/src\tenancy\tenant-context.spec.ts:310:    // platform_administrator + workshop_owner + technician resolved to
apps/api/src\tenancy\tenant-context.spec.ts:325:    expect(ctx.activeRole).toBe('platform_administrator');
apps/api/src\tenancy\tenant-context.spec.ts:398:    // the validated token subject. Opening as `platform_administrator` of
apps/api/src\tenancy\tenant-context.spec.ts:407:    // platform_administrator, workshop_owner and technician was pinned to
apps/api/src\tenancy\tenant-context.spec.ts:422:        membership({ tenantId: 'tenant-b', organizationId: 'org-2', roleName: 'platform_administrator' }),
apps/api/src\tenancy\tenant-context.spec.ts:430:    expect(ctx.activeRole).toBe('platform_administrator');
apps/api/src\tenancy\tenant-context.spec.ts:478:  const adminOnly = [membership({ organizationId: 'org-1', roleName: 'platform_administrator' })];
apps/api/src\tenancy\tenant-context.spec.ts:480:  it('🔴 DENIES: a platform_administrator membership with NO grant confers nothing', () => {
apps/api/src\tenancy\tenant-context.spec.ts:498:    expect(ctx.activeRole).toBe('platform_administrator');
apps/api/src\tenancy\tenant-context.spec.ts:504:    // `platform_administrator` AND `workshop_owner` at their own workshop.
apps/api/src\tenancy\tenant-context.spec.ts:510:        membership({ organizationId: 'org-1', roleName: 'platform_administrator' }),
apps/api/src\tenancy\tenant-context.spec.ts:527:          membership({ organizationId: 'org-1', roleName: 'platform_administrator' }),
apps/api/src\tenancy\tenant-context.spec.ts:530:        requestedRoleName: 'platform_administrator',
apps/api/src\tenancy\tenant-context.spec.ts:558:          membership({ organizationId: 'org-1', roleName: 'platform_administrator', status: 'revoked' }),
apps/api/src\insurance\insurance-review-queue.integration.spec.ts:83: * `identity.platform_administrators` can make it visible, so it is the one
apps/api/src\insurance\insurance-review-queue.integration.spec.ts:98: * `platform_administrator` membership without an un-revoked grant row. Setting
apps/api/src\insurance\insurance-review-queue.integration.spec.ts:107:  activeRole: 'platform_administrator',
apps/api/src\insurance\insurance-review-queue.integration.spec.ts:207:      `INSERT INTO identity.platform_administrators (user_id, granted_actor, granted_reason)
apps/api/src\insurance\insurance-review-queue.integration.spec.ts:325:    // it; only an un-revoked row in identity.platform_administrators can. If
apps/api/src\settings\settings.service.ts:92:  'technician', 'storekeeper', 'cashier', 'quality_control_inspector', 'platform_administrator',
apps/api/src\settings\settings.service.ts:96:const MAY_ADMINISTER = ['workshop_owner', 'workshop_manager', 'platform_administrator'] as const;
apps/api/src\settings\settings.service.ts:103:const MAY_GOVERN = ['workshop_owner', 'platform_administrator'] as const;
apps/api/src\settings\settings.service.ts:867:            AND m.role_name IN ('workshop_owner', 'workshop_manager', 'platform_administrator')
apps/api/src\identity\platform-grant.spec.ts:110:    { organization_id: 'o', organization_name: 'Alpha Motors', branch_id: null, branch_name: null, role_name: 'platform_administrator' },
apps/api/src\identity\platform-grant.spec.ts:125:  it('🔴 hides platform_administrator when no grant backs it', async () => {
apps/api/src\identity\platform-grant.spec.ts:143:      'platform_administrator',
apps/api/src\identity\organization.service.ts:16:const CAN_CREATE_ORG = new Set(['platform_administrator', 'workshop_owner', 'supplier_owner', 'fleet_administrator']);
apps/api/src\identity\organization-registration.service.ts:118:  // Since migration 078 the resolver refuses to make `platform_administrator`
apps/api/src\identity\organization-registration.service.ts:120:  // `identity.platform_administrators`, so the role test below is already
apps/api/src\identity\organization-registration.service.ts:126:  if (!ctx.hasPlatformGrant || ctx.activeRole !== 'platform_administrator') {
apps/api/src\identity\organization-registration.service.ts:144:  'platform_administrator',
apps/api/src\identity\membership.service.ts:36:  'platform_administrator',
apps/api/src\identity\membership.service.ts:113:  'platform_administrator',
apps/api/src\identity\membership.service.ts:142:  // plus `platform_administrator`, the documented compromise described above.
apps/api/src\identity\membership.service.ts:160:  platform_operator: ['platform_administrator'],
apps/api/src\identity\membership.service.ts:344:      // ⚠️ `platform_administrator` IS DELIBERATELY VALID IN A WORKSHOP. It is
apps/api/src\identity\membership.repository.ts:108:   * `identity.platform_administrators` is ENABLE + FORCE ROW LEVEL SECURITY.
apps/api/src\identity\membership-role-fit.spec.ts:150:  it('a workshop organisation still admits platform_administrator', () => {
apps/api/src\identity\membership-role-fit.spec.ts:152:    // `platform_administrator` through a membership attached to their own
apps/api/src\identity\membership-role-fit.spec.ts:154:    // `individual_workshop | platform_administrator` appears twice in the
apps/api/src\identity\membership-role-fit.spec.ts:158:    expect(source).toMatch(/'platform_administrator',?\s*\n?\];/);
apps/api/src\identity\me.service.ts:105:           * `resolveTenantContext` refuses `platform_administrator` without an
apps/api/src\identity\me.service.ts:116:           * sends `x-role-name: platform_administrator` regardless is still
apps/api/src\identity\fleet-registration.spec.ts:71:      pipe.transform({ fleetName: 'Accra Logistics Fleet Ltd', roleName: 'platform_administrator' }, BODY_META),
apps/api/src\identity\branch.service.ts:26:  'platform_administrator',
apps/api/src\security\security.controller.spec.ts:38: * `platform_administrator` itself, buys nothing on this endpoint. Only a call
apps/api/src\security\security.controller.spec.ts:40: * `identity.platform_administrators` — gets in.
apps/api/src\security\security.controller.spec.ts:65:    await expect(ctrl.getPosture(req('platform_administrator', true))).resolves.toBe(posture);
apps/api/src\security\security.controller.spec.ts:102:  it('🔴 NO ROLE NAME ADMITS ANYONE — not even platform_administrator', async () => {
apps/api/src\security\security.controller.spec.ts:129:      admitted.ctrl.getPosture(req('platform_administrator', true)),
apps/api/src\core\vehicle.service.ts:62:  'platform_administrator',
apps/api/src\core\vehicle.service.ts:87:  'platform_administrator',
apps/api/src\core\customer.service.ts:50:  'platform_administrator',
apps/api/src\core\customer.service.ts:85: *   · `platform_administrator` — the cross-tenant support role.
apps/api/src\core\customer.service.ts:99:  'platform_administrator',
apps/api/src\core\core.spec.ts:103:      'platform_administrator',
apps/api/src\reports\reports.service.ts:43:  'workshop_owner', 'workshop_manager', 'cashier', 'platform_administrator',
apps/api/src\reports\reports.service.ts:49:  'technician', 'storekeeper', 'cashier', 'quality_control_inspector', 'platform_administrator',
apps/api/src\comms\comms.service.ts:48:  'technician', 'storekeeper', 'cashier', 'quality_control_inspector', 'platform_administrator',
apps/api/src\operations\operations.controller.spec.ts:37: * `platform_administrator` itself, buys nothing on this endpoint. Only a call
apps/api/src\operations\operations.controller.spec.ts:39: * `identity.platform_administrators` — gets in.
apps/api/src\operations\operations.controller.spec.ts:63:    await expect(ctrl.report(req('platform_administrator', true))).resolves.toBe(report);
apps/api/src\operations\operations.controller.spec.ts:91:  it('🔴 NO ROLE NAME ADMITS ANYONE — not even platform_administrator', async () => {
apps/api/src\operations\operations.controller.spec.ts:106:    await expect(admitted.ctrl.report(req('platform_administrator', true))).resolves.toBe(report);
apps/api/src\repair\variation-rules.ts:47:  'platform_administrator',
apps/api/src\repair\variation-rules.ts:64:  'platform_administrator',
apps/api/src\repair\testing-rules.ts:118:  'platform_administrator',
apps/api/src\repair\testing-rules.ts:134:  'platform_administrator',
apps/api/src\repair\testing-rules.ts:150:  'platform_administrator',
apps/api/src\repair\repair-plan-rules.ts:131:  'platform_administrator',
apps/api/src\repair\repair-plan-rules.ts:153:  'platform_administrator',
apps/api/src\repair\repair-plan-rules.ts:178:  'platform_administrator',
apps/api/src\repair\quotation-rules.ts:75:  'platform_administrator',
apps/api/src\repair\quotation-rules.ts:94:  'platform_administrator',
apps/api/src\repair\quotation-rules.ts:115:  'platform_administrator',
apps/api/src\repair\quality-rules.ts:47:  'platform_administrator',
apps/api/src\repair\proposal-rules.ts:102:  'platform_administrator',
apps/api/src\repair\proposal-rules.ts:136:  'platform_administrator',
apps/api/src\knowledge\knowledge.service.ts:45:  'technician', 'storekeeper', 'cashier', 'quality_control_inspector', 'platform_administrator',
apps/api/src\knowledge\knowledge.service.ts:51:  'technician', 'quality_control_inspector', 'platform_administrator',
apps/api/src\repair\pricing.service.ts:60:    if (ctx.activeRole !== 'workshop_owner' && ctx.activeRole !== 'platform_administrator') {
apps/api/src\repair\pricing.service.ts:134:          ctx.activeRole === 'workshop_owner' || ctx.activeRole === 'platform_administrator',
apps/api/src\repair\job-card.service.ts:90:  'platform_administrator',
apps/api/src\repair\job-card.service.ts:114:  'platform_administrator',
apps/api/src\repair\job-card-stages.ts:175:  platform_administrator: STAGES,
apps/api/src\repair\job-card-stages.ts:262:  'platform_administrator',
apps/api/src\repair\inspection-checklist.ts:122:  'platform_administrator',
apps/api/src\repair\inspection-checklist.ts:146:  'platform_administrator',
apps/api/src\repair\execution-rules.ts:118:  'platform_administrator',
apps/api/src\repair\execution-rules.ts:136:  'platform_administrator',
apps/api/src\repair\diagnosis-rules.ts:126:  'platform_administrator',

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content apps/api/src/identity/organization.service.ts -TotalCount 140; Get-Content 
apps/api/src/identity/branch.service.ts -TotalCount 100; rg -n \"supplier_owner|fleet_administrator\" apps packages --glob \"*.ts\" --glob \"*.tsx\" | rg -v 
\"\\.spec\\.ts|membership.service.ts|permission-matrix.ts|viewer-contract.ts|account-types.ts\"" in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 2673ms:
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';
import { assertWorkshopStaff } from '../authz/workshop-roles';

export interface Organization {
  id: string;
  name: string;
  orgType: string;
  status: string;
  createdAt: string;
}

/** Roles permitted to create an organization. */
const CAN_CREATE_ORG = new Set(['platform_administrator', 'workshop_owner', 'supplier_owner', 'fleet_administrator']);

/**
 * Organization domain service.
 *
 * Authoritative business rules live HERE, not in the controller and not in an
 * MCP tool. A REST controller and an MCP tool are both thin callers of this
 * same service, so the identical rules apply whether the caller is a human or
 * an AI agent (`0.txt` Â§13, Â§26).
 */
@Injectable()
export class OrganizationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: TenantContext): Promise<Organization[]> {
    // ðŸ”´ STAFF ONLY (A5). `customer` is a real membership role inside
    // this same organisation and the controller carries only TenantGuard â€”
    // who you are, not what you may do. See `authz/workshop-roles.ts`.
    assertWorkshopStaff(ctx, 'The organisations in this tenant');
    return this.db.withTenant(ctx, async (client) => {
      // CLAUDE.md Â§6 requires BOTH layers: the application filters, and RLS is
      // the backstop. This query used to be left bare with a comment claiming
      // the repository layer filtered it â€” there is no such layer, so RLS was
      // the only control.
      //
      // That was not merely a policy breach. The RLS policy reads
      // `is_platform_admin() OR tenant_id = current_tenant_id()`, so for a
      // platform administrator a bare query returns EVERY tenant's
      // organizations from an endpoint scoped to one. The explicit predicate is
      // what makes this endpoint mean the same thing for every role.
      const res = await client.query(
        `SELECT id, name, org_type, status, created_at
           FROM identity.organizations
          WHERE tenant_id = $1
          ORDER BY name`,
        [ctx.tenantId],
      );
      return res.rows.map(this.toDomain);
    });
  }

  async findById(ctx: TenantContext, id: string): Promise<Organization> {
    // ðŸ”´ STAFF ONLY (A5). `customer` is a real membership role inside
    // this same organisation and the controller carries only TenantGuard â€”
    // who you are, not what you may do. See `authz/workshop-roles.ts`.
    assertWorkshopStaff(ctx, 'This organisation');
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `SELECT id, name, org_type, status, created_at
           FROM identity.organizations WHERE id = $1 AND tenant_id = $2`,
        [id, ctx.tenantId],
      );
      const row = res.rows[0];
      if (!row) {
        // A row in another tenant is invisible under RLS, so this is a 404 and
        // not a 403 â€” deliberately. Returning 403 would confirm the id exists,
        // turning the error code into a cross-tenant existence oracle.
        throw new NotFoundException('organization not found');
      }
      return this.toDomain(row);
    });
  }

  async create(
    ctx: TenantContext,
    input: { name: string; orgType: string },
  ): Promise<Organization> {
    if (!CAN_CREATE_ORG.has(ctx.activeRole)) {
      throw new ForbiddenException(
        `role '${ctx.activeRole}' may not create an organization`,
      );
    }

    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `INSERT INTO identity.organizations (tenant_id, name, org_type, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, org_type, status, created_at`,
        [ctx.tenantId, input.name, input.orgType, ctx.userId],
      );
      const row = res.rows[0];

      // Same transaction as the insert: the change and its audit row commit or
      // roll back together.
      await this.audit.write(client, ctx, {
        action: 'organization.created',
        resourceType: 'organization',
        resourceId: row.id,
        detail: { name: input.name, orgType: input.orgType },
      });

      return this.toDomain(row);
    });
  }

  private toDomain = (row: {
    id: string;
    name: string;
    org_type: string;
    status: string;
    created_at: Date;
  }): Organization => ({
    id: row.id,
    name: row.name,
    orgType: row.org_type,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  });
}
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import type { TenantContext } from '../tenancy/tenant-context';
import { assertWorkshopStaff } from '../authz/workshop-roles';

export interface Branch {
  id: string;
  organizationId: string;
  name: string;
  location: string | null;
  operatingHours: string | null;
  status: string;
  createdAt: string;
}

/**
 * Roles permitted to create a branch.
 *
 * `07.txt` part 2 Â§46 puts Branches under the Workshop Owner's WORKSHOP
 * MANAGEMENT group, and Â§50 gives the owner "full workshop governance". A
 * manager has "daily operational control", which is not the same as creating
 * legal operating locations, so the manager is deliberately absent.
 */
const CAN_CREATE_BRANCH = new Set([
  'platform_administrator',
  'workshop_owner',
  'supplier_owner',
  'fleet_administrator',
]);

/**
 * Branch domain service â€” T-0003.
 *
 * Follows `OrganizationService` exactly, for the same reason: a REST controller
 * and an MCP tool are both thin callers of this one service, so the identical
 * rules apply whether the caller is a human or an agent (`0.txt` Â§13, Â§26).
 *
 * `identity.branches` carries `tenant_id` and is under `ENABLE` + `FORCE ROW
 * LEVEL SECURITY`, so the database is the final backstop. Queries here are
 * deliberately written WITHOUT a hand-added tenant filter, exactly as
 * `OrganizationService` does â€” the isolation proof in
 * `tests/tenant-isolation/` depends on those queries being bare, because a
 * query that filters in application code proves nothing about the policy.
 */
@Injectable()
export class BranchService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  /** Branches in the active tenant, optionally narrowed to one organization. */
  async list(ctx: TenantContext, organizationId?: string): Promise<Branch[]> {
    // ðŸ”´ STAFF ONLY (A5). `customer` is a real membership role inside
    // this same organisation and the controller carries only TenantGuard â€”
    // who you are, not what you may do. See `authz/workshop-roles.ts`.
    assertWorkshopStaff(ctx, 'The workshop branch list');
    return this.db.withTenant(ctx, async (client) => {
      const res = organizationId
        ? await client.query(
            `SELECT id, organization_id, name, location, operating_hours, status, created_at
               FROM identity.branches
              WHERE organization_id = $1 AND tenant_id = $2
              ORDER BY name`,
            [organizationId, ctx.tenantId],
          )
        : await client.query(
            `SELECT id, organization_id, name, location, operating_hours, status, created_at
               FROM identity.branches
              WHERE tenant_id = $1
              ORDER BY name`,
            [ctx.tenantId],
          );
      return res.rows.map(this.toDomain);
    });
  }

  async findById(ctx: TenantContext, id: string): Promise<Branch> {
    // ðŸ”´ STAFF ONLY (A5). `customer` is a real membership role inside
    // this same organisation and the controller carries only TenantGuard â€”
    // who you are, not what you may do. See `authz/workshop-roles.ts`.
    assertWorkshopStaff(ctx, 'This branch');
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `SELECT id, organization_id, name, location, operating_hours, status, created_at
           FROM identity.branches WHERE id = $1 AND tenant_id = $2`,
        [id, ctx.tenantId],
      );
      const row = res.rows[0];
      if (!row) {
        // 404 and not 403, deliberately: a branch in another tenant is
        // invisible under RLS, and answering 403 would confirm the id exists,
        // turning the status code into a cross-tenant existence oracle.
        throw new NotFoundException('branch not found');
      }
      return this.toDomain(row);
    });
  }

packages\next-shell\src\viewer.test.ts:87:    expect(navRoleFor('supplier_owner')).toBeUndefined();
packages\next-shell\src\viewer.test.ts:88:    expect(navRoleFor('fleet_administrator')).toBeUndefined();
packages\next-shell\src\switch-destination.test.ts:35:  'supplier_owner',
packages\next-shell\src\switch-destination.test.ts:36:  'fleet_administrator',
packages\next-shell\src\foreign-workspace.test.ts:24:  it.each(['customer', 'supplier_owner', 'fleet_administrator', 'insurance_assessor', 'towing_operator'])(
packages\next-shell\src\foreign-workspace.test.ts:154:    ['supplier_owner', 'supplier'],
packages\next-shell\src\foreign-workspace.test.ts:155:    ['fleet_administrator', 'fleet'],
apps\web\app\fleet\_screens\create-fleet-screen.tsx:11: * point, with no way for a `fleet_administrator` to exist at all ? so every one
apps\web\app\fleet\home\dashboard\page.tsx:12: * one that lets a `fleet_administrator` come into being.
apps\web\app\supplier\_screens\create-supplier-actions.ts:13: * organisation with themselves as `supplier_owner`.
apps\web\app\supplier\_screens\create-supplier-actions.ts:15: * ?? UNTIL MIGRATION 068 NOTHING IN THE PRODUCT COULD DO THIS. `supplier_owner`
apps\api\src\towing\towing-roles.ts:11: * it in `NON_WORKSHOP_ROLES` alongside `customer` and `fleet_administrator`).
apps\web\app\supplier\products\add-product\page.tsx:11: *    rendering the SUPPLIER app. `supplier_owner` is in that set, so the
apps\api\src\identity\registration.controller.ts:48: * (`supplier_owner`) and the organisation type (`parts_supplier`) are literals
apps\api\src\identity\registration.controller.ts:62: * (`fleet_administrator`) and the organisation type (`fleet_operator`) are
apps\api\src\identity\registration.controller.ts:236:   * A 401. Nothing in the product could create a `supplier_owner` membership
apps\api\src\identity\registration.controller.ts:266:        roleName: 'supplier_owner',
apps\api\src\identity\registration.controller.ts:302:   * `fleet_administrator` remained a role no production path could write ?
apps\api\src\identity\registration.controller.ts:344:        roleName: 'fleet_administrator',
apps\api\src\identity\organization.service.ts:16:const CAN_CREATE_ORG = new Set(['platform_administrator', 'workshop_owner', 'supplier_owner', 'fleet_administrator']);
apps\api\src\identity\organization-registration.service.ts:147:  'supplier_owner',
apps\api\src\identity\membership.repository.ts:299:   * `supplier_owner`, even though the role appears in `ROLE_PRECEDENCE`, the
apps\api\src\identity\membership.repository.ts:352:   * caller. `customer` (2026-08-08) and `supplier_owner` (2026-08-09) each
apps\api\src\identity\membership.repository.ts:357:   * `fleet_administrator` was found the same way and migration 075 built the
apps\api\src\identity\membership.repository.ts:367:   * (`fleet_administrator`) and the ORG TYPE (`fleet_operator`) are literals
apps\api\src\identity\branch.service.ts:28:  'supplier_owner',
apps\api\src\identity\branch.service.ts:29:  'fleet_administrator',

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content apps/api/src/authz/workshop-roles.ts -TotalCount 180; rg -n "CAN_CREATE_BRANCH.has" 
apps/api/src/identity/branch.service.ts; Get-Content apps/api/src/identity/organization-registration.service.ts | Select-Object -Skip 130 -First 35' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 953ms:
import { ForbiddenException } from '@nestjs/common';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * WHO IS STAFF OF THIS WORKSHOP, AND WHO IS MERELY INSIDE ITS ORGANISATION.
 *
 * â”€â”€ ðŸ”´ WHY THIS EXISTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 * `customer` is a real, grantable membership role (`permission-matrix.ts`), and
 * a customer's `TenantContext.organizationId` IS THE WORKSHOP'S. Row-level
 * security is organisation-scoped, so it cannot tell a customer apart from the
 * staff they buy from â€” both are inside the same organisation.
 *
 * That means every `list*` method which returns "everything in this
 * organisation" is readable by a customer unless the SERVICE says otherwise.
 * Nothing else says otherwise: the controllers carry `TenantGuard`, which
 * establishes WHO you are and WHICH tenant, not WHAT you may do, and there is
 * no global guard in this application.
 *
 * It was found three times in two passes â€” settings, knowledge, then finance,
 * warranty and parts â€” so it stops being a per-service oversight and becomes a
 * shared, named rule.
 *
 * â”€â”€ âš ï¸ THE ASYMMETRY IS THE WHOLE POINT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 * Writes were gated everywhere; reads were gated nowhere. A workshop's books,
 * stock levels, supplier prices and warranty decisions are exactly the things a
 * customer must not browse, and they were the things left open.
 *
 * âš ï¸ THIS IS NOT "CUSTOMERS SEE NOTHING". A customer must absolutely see THEIR
 * OWN invoices, payments and warranty claims. That is a different query â€” one
 * carrying a customer predicate derived from the session â€” not a relaxation of
 * this one. `SelfServiceService` is the pattern.
 */
export const WORKSHOP_STAFF_ROLES = [
  'workshop_owner',
  'workshop_manager',
  'workshop_supervisor',
  'reception_staff',
  'technician',
  'storekeeper',
  'cashier',
  'quality_control_inspector',
  'platform_administrator',
] as const;

export function isWorkshopStaff(ctx: TenantContext): boolean {
  return (WORKSHOP_STAFF_ROLES as readonly string[]).includes(ctx.activeRole);
}

/**
 * Refuse a non-staff caller, naming what they CAN reach.
 *
 * âš ï¸ EVERY REFUSAL NAMES A REACHABLE ALTERNATIVE. A rule whose escape hatch
 * does not exist is a wall, and walls are the most expensive defect class
 * recorded in this repository.
 */
export function assertWorkshopStaff(ctx: TenantContext, what: string): void {
  if (!isWorkshopStaff(ctx)) {
    throw new ForbiddenException(
      `${what} belongs to the workshop, not to a customer account. ` +
        'Your own repairs, invoices, payments and warranty claims are on your own pages.',
    );
  }
}
110:    if (!CAN_CREATE_BRANCH.has(ctx.activeRole)) {
}

/**
 * Who may read their OWN organisation's verification status.
 *
 * The people who run the business, not everybody inside it. A technician has no
 * reason to know, and since migration 061 a `customer` is any signed-up
 * stranger enrolled at the workshop â€” whose active organisation IS the
 * workshop's, so organisation-scoped RLS cannot tell them apart from staff.
 * That is the same structural gap 062, 066 and 067 each closed on another
 * table, and the reason this check exists in the application layer.
 */
const MAY_READ_OWN_REGISTRATION = new Set([
  'platform_administrator',
  'workshop_owner',
  'workshop_manager',
  'supplier_owner',
]);

function assertMayReadOwnRegistration(ctx: TenantContext): void {
  if (!MAY_READ_OWN_REGISTRATION.has(ctx.activeRole)) {
    throw new ForbiddenException(
      'Only the owner or a manager of this business can see its verification status. Ask one of them if you need to know where the registration stands.',
    );
  }
}

@Injectable()
export class OrganizationRegistrationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  /**

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "getOwn|own.*registration|MAY_READ_OWN_REGISTRATION|registration/status|organization-registration" apps/api/src 
apps/web packages/next-shell/src --glob "*.ts" --glob "*.tsx"' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 459ms:
packages/next-shell/src\registration.ts:15: * `/registration/status` is on `UserGuard`, which proves who you are without
packages/next-shell/src\registration.ts:51:    const result = await apiGet<RegistrationStatus>(workspaceId, '/registration/status');
apps/web\app\insurance\home\dashboard\page.tsx:27: * or customer opening this pack is NOT shown the registration screen — they fall
apps/web\app\fleet\home\dashboard\page.tsx:28: * or customer opening fleet-web is NOT shown this registration screen — they
apps/web\app\customer\_screens\dashboard-screen.tsx:224:                No expiry recorded for {unknown.map((v) => v.registrationNumber).join(', ')}, so
apps/api/src\identity\registration.controller.ts:124:   * `GET /registration/status` — do I belong to a workshop yet?
apps/web\app\customer\(app)\layout.tsx:98:          // The name comes from /registration/status, which is on UserGuard and
apps/web\app\api\auth\register\route.ts:22: * with its own "registration not enabled" page rather than a broken redirect,
apps/web\app\admin\_screens\registration-actions.ts:67:  const result = await apiPost<unknown>('admin', `/registrations/${registrationId}/decision`, {
apps/api/src\identity\organization-registration.service.ts:143:const MAY_READ_OWN_REGISTRATION = new Set([
apps/api/src\identity\organization-registration.service.ts:151:  if (!MAY_READ_OWN_REGISTRATION.has(ctx.activeRole)) {
apps/api/src\identity\organization-registration.service.ts:153:      'Only the owner or a manager of this business can see its verification status. Ask one of them if you need to know where the 
registration stands.',
apps/api/src\identity\organization-registration.service.ts:194:   * What the REGISTRANT sees about their own registration.
apps/api/src\identity\organization-registration.controller.ts:5:import { OrganizationRegistrationService } from './organization-registration.service';
apps/api/src\identity\identity.module.ts:15:import { OrganizationRegistrationController } from './organization-registration.controller';
apps/api/src\identity\identity.module.ts:16:import { OrganizationRegistrationService } from './organization-registration.service';
apps/web\app\supplier\home\dashboard\page.tsx:32:  // branch below. `/registration/status` is the one route reachable with a
apps/web\app\supplier\home\dashboard\page.tsx:51:  // `/registration/status` returns null and this renders the normal dashboard,

exec
"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content apps/api/src/identity/organization-registration.controller.ts; Get-Content 
apps/api/src/identity/organization-registration.service.ts | Select-Object -Skip 185 -First 65' in C:\Users\USER\Documents\autoworkshop-ai
 succeeded in 508ms:
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import { validatedBody } from '../common/validation/validated-body';
import { OrganizationRegistrationService } from './organization-registration.service';

/**
 * `/registrations` â€” the verification queue, and a registrant's own status.
 *
 * âš ï¸ SEPARATE FROM `RegistrationController`, which is on `UserGuard` because
 * its callers belong nowhere yet. Everything here is the opposite: the queue is
 * read by a platform administrator acting in an organisation, and `mine` is
 * read by a registrant acting in the organisation they just created. Both need
 * a tenant context, so both are on `TenantGuard`.
 *
 * âš ï¸ THERE IS NO ROUTE THAT CREATES A REGISTRATION. Rows are written only by
 * `identity.register_workshop` / `register_supplier`, and migration 069's
 * INSERT policy admits nothing else â€” it is keyed on
 * `in_registration_bootstrap()`, which is only true inside those functions. A
 * create route here would let somebody file a registration for a sign-up that
 * never happened.
 */

const DecisionBody = z.object({
  decision: z.enum(['approved', 'rejected']),
  /**
   * The status the screen was showing when the button was pressed â€” optimistic
   * concurrency. Omitted means "I believe this is undecided", which is what a
   * first decision is.
   *
   * âš ï¸ THIS IS NOT AN AUTHORIZATION INPUT. It can only narrow the UPDATE's
   * WHERE clause, never widen it; who may decide is asserted in the service and
   * again by migration 069's policy on both USING and WITH CHECK.
   */
  expectedStatus: z.enum(['pending', 'approved', 'rejected']).optional(),
  // Optional in the schema, REQUIRED for a rejection in the service. The rule
  // lives there because it is conditional on another field, and expressing it
  // here would split one rule across two files.
  note: z.string().trim().max(1000).optional(),
});
type DecisionBody = z.infer<typeof DecisionBody>;

@Controller('registrations')
@UseGuards(TenantGuard)
export class OrganizationRegistrationController {
  constructor(private readonly registrations: OrganizationRegistrationService) {}

  /** The queue. Platform administrator only â€” asserted in the service. */
  @Get()
  async list(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('kind') kind?: string,
  ) {
    return this.registrations.list(req.tenantContext, { status, kind });
  }

  /**
   * The caller's OWN registration, so a waiting business can be told where it
   * stands rather than wondering why it is not on the map.
   *
   * âš ï¸ MOUNTED BEFORE ANY `:id` ROUTE WOULD BE. Nest matches in declaration
   * order, so a `@Get(':id')` declared above this would swallow `/mine` and
   * `ParseUUIDPipe` would answer 400 for a path that is not a UUID. There is no
   * `:id` GET today; this note is here so adding one does not break it.
   */
  @Get('mine')
  async mine(@Req() req: AuthenticatedRequest) {
    return this.registrations.mine(req.tenantContext);
  }

  /** Approve or reject. Attributed to the caller, and it publishes. */
  @Post(':id/decision')
  async decide(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validatedBody(DecisionBody)) body: DecisionBody,
  ) {
    return this.registrations.decide(
      req.tenantContext,
      id,
      body.decision,
      body.note,
      body.expectedStatus ?? 'pending',
    );
  }
}
          LIMIT 200`,
        [opts.status ?? null, opts.kind ?? null],
      );
      return res.rows.map((r) => toRow(r as Record<string, unknown>));
    });
  }

  /**
   * What the REGISTRANT sees about their own registration.
   *
   * ðŸ”´ A SEPARATE METHOD, DELIBERATELY NOT `list` WITH A WIDER GATE. The queue
   * is administrators' and this is the registrant's own row; giving them one
   * method with a role branch is how a filter eventually gets dropped and a
   * supplier reads every other business's verification state.
   *
   * Migration 069's SELECT policy already confines a non-admin to their own
   * organisation, so this is the app-layer half of the same rule.
   */
  async mine(ctx: TenantContext): Promise<RegistrationRow | null> {
    // ðŸ”´ GATED, AND IT WAS NOT. Supervisor, 2026-08-09: 069's SELECT policy
    // admits the whole ORGANISATION, not the registrant â€” so RLS does not
    // narrow this at all, and every write on this table is gated twice while
    // this read was gated nowhere. Since migration 061 a `customer` is any
    // stranger who enrolled, and their active organisation IS the workshop's,
    // so a customer could read the submitter's name and email and the platform
    // administrator's rejection note.
    //
    // âš ï¸ NOT `assertPlatformAdmin` â€” this method exists FOR the registrant. The
    // audience is whoever runs the business: the roles that can create an
    // organisation in the first place (`organization.service.ts`'s
    // `CAN_CREATE_ORG`), plus the manager who would chase the verification.
    assertMayReadOwnRegistration(ctx);
    return this.db.withTenant(ctx, async (client) => {
      const res = await client.query(
        `SELECT ${SELECT_COLUMNS}
           FROM identity.organization_registrations r
           JOIN identity.organizations o ON o.id = r.organization_id
           LEFT JOIN identity.users u ON u.id = r.submitted_by
          WHERE r.organization_id = $1`,
        [ctx.organizationId],
      );
      const row = res.rows[0];
      return row ? toRow(row as Record<string, unknown>) : null;
    });
  }

  /**
   * Approve or reject, and publish or un-publish accordingly.
   *
   * âš ï¸ A REJECTION REQUIRES A REASON. "No" with nothing attached cannot be
   * acted on by the business receiving it, so they register again and the queue
   * grows. An approval does not require one â€” "yes" is self-explanatory.
   */
  async decide(
    ctx: TenantContext,
    id: string,
    decision: 'approved' | 'rejected',
    note: string | undefined,
    /**
     * The status the caller believes this registration currently has â€”
     * optimistic concurrency, defaulting to a first decision.
     *
     * âš ï¸ SUPPLIED BY THE CALLER AND THAT IS SAFE, because it can only ever make
     * the UPDATE match FEWER rows. It is not an authorization input: who may
     * decide is `assertPlatformAdmin` plus 069's policy on both USING and WITH

codex
## Findings

- **HIGH — backfill can promote a non-founder.**  
  [085_insurance_and_towing_org_admin.sql](C:/Users/USER/Documents/autoworkshop-ai/infrastructure/migrations/085_insurance_and_towing_org_admin.sql:314) filters to `created_by = user_id` before 
choosing the earliest row. Therefore “earliest” means earliest *self-created operational membership*, not the organisation’s earliest membership as the comments claim.  
  Failing input: an insurance organisation’s first membership was created by an administrator; a later assessor row has `created_by = user_id`. The later assessor is selected and promoted to 
`insurance_owner`.  
  Fix by ranking all memberships first, then requiring the selected first row to satisfy the founder predicates.

- **HIGH — the backfill itself runs without an RLS bypass.**  
  The founder `UPDATE` starts at [line 314](C:/Users/USER/Documents/autoworkshop-ai/infrastructure/migrations/085_insurance_and_towing_org_admin.sql:314), but `app.current_role = 'admin'` is not 
set until the guard at [line 352](C:/Users/USER/Documents/autoworkshop-ai/infrastructure/migrations/085_insurance_and_towing_org_admin.sql:352). Both tables use `FORCE ROW LEVEL SECURITY`. Under 
the stated non-superuser owner credential, the CTE sees no rows and updates nothing. The later guard does see rows, because `admin` is accepted by `identity.is_platform_admin()`, and consequently 
aborts any database containing an existing active insurer/towing organisation.  
  The guard is not vacuous; the backfill is. Set the admin context before the backfill, ideally in the same surrounding block/transaction.

- **MEDIUM — verify/085 does not prove the capability it claims.**  
  [verify/085](C:/Users/USER/Documents/autoworkshop-ai/infrastructure/migrations/verify/085_insurance_and_towing_org_admin.sql:42) sets the database role context to `admin`, then directly inserts 
the second membership at [line 95](C:/Users/USER/Documents/autoworkshop-ai/infrastructure/migrations/verify/085_insurance_and_towing_org_admin.sql:95). It never invokes 
`MembershipService.grant()`, so it does not exercise `CAN_GRANT_MEMBERSHIP`, `GRANTABLE_ROLES`, role/organisation fit, or the caller’s organisation. The same raw insert would succeed if 
`insurance_owner` were removed from every TypeScript allow-list.  
  The claim “proves the CAPABILITY” is false. It proves only that an admin-context SQL insert is structurally possible. It also never creates a second towing membership, despite the file header 
claiming both organisation types can build a team.

- **MEDIUM — three matching org-admin allow-lists were missed.**

  - [organization.service.ts](C:/Users/USER/Documents/autoworkshop-ai/apps/api/src/identity/organization.service.ts:16): `CAN_CREATE_ORG` contains `supplier_owner` and `fleet_administrator`, but 
not either new owner. An `insurance_owner` calling the organisation-create endpoint receives 403.
  - [branch.service.ts](C:/Users/USER/Documents/autoworkshop-ai/apps/api/src/identity/branch.service.ts:25): `CAN_CREATE_BRANCH` has the same omission. A towing founder attempting to create a 
second depot receives 403.
  - [organization-registration.service.ts](C:/Users/USER/Documents/autoworkshop-ai/apps/api/src/identity/organization-registration.service.ts:143): `MAY_READ_OWN_REGISTRATION` omits both new 
founder roles. An insurer/towing founder calling `GET /registrations/mine` receives 403 and cannot read the verification row their registration created.

  The first two depend on whether “mirroring supplier/fleet admin” includes organisation and branch creation. The third is unambiguously relevant to these self-service registrants.

- **MEDIUM — verify check 6 rejects a valid state and is not repeatable.**  
  [verify/085](C:/Users/USER/Documents/autoworkshop-ai/infrastructure/migrations/verify/085_insurance_and_towing_org_admin.sql:136) asserts that no organisation has more than one owner. The API 
explicitly makes the new owner roles grantable and permits an owner to grant another owner in the same organisation. After a legitimate administrator handover or shared ownership, verification 
fails even though migration 085 did not over-promote anyone. The comment “as a result of 085” is not something this aggregate query can establish.

- **LOW — comments overstate the role restriction.**  
  The function comment at [085 migration line 188](C:/Users/USER/Documents/autoworkshop-ai/infrastructure/migrations/085_insurance_and_towing_org_admin.sql:188) says `insurance_owner` “grants 
insurance_assessor (and later claims_approver).” In reality, [membership.service.ts](C:/Users/USER/Documents/autoworkshop-ai/apps/api/src/identity/membership.service.ts:67) also lets it grant 
`insurance_owner`, because there is no grantor-to-target-role hierarchy. The equivalent is true for towing.

## Other requested checks

The reproduced registration function behavior matches migration 080 apart from the intended membership role literals and comments: advisory-lock keys, bootstrap setup/cleanup, exception messages, 
organisation types, branch defaults, and registration kinds/statuses are unchanged. Replacing the functions also preserves their existing execute privileges.

The guard and verify queries can see through RLS after setting `app.current_role = 'admin'`; `identity.is_platform_admin()` explicitly accepts `admin`. Their invariant queries therefore do not 
pass vacuously.

Existing `insurance_assessor` and `towing_operator` holders are not generally refused by the TypeScript changes. Their existing gates and permissions remain. The selected backfill row changes 
roles, but the new owner roles were added to the insurance/towing endpoint gates, navigation workspace maps, permission matrix, and precedence list. The security problem is selecting the wrong 
row, not loss of access for untouched operational members.

I found no additional production role-name gate in the navigation packages or insurance/towing endpoint modules. The Keycloak realm omits the new names, but application authorization is resolved 
from database memberships rather than trusted realm-role claims, so that omission is not currently blocking.

I could not execute the targeted test commands because repository command execution was rejected by the managed workspace policy; `git diff --check` itself passed.
tokens used
86,786
## Findings

- **HIGH — backfill can promote a non-founder.**  
  [085_insurance_and_towing_org_admin.sql](C:/Users/USER/Documents/autoworkshop-ai/infrastructure/migrations/085_insurance_and_towing_org_admin.sql:314) filters to `created_by = user_id` before choosing the earliest row. Therefore “earliest” means earliest *self-created operational membership*, not the organisation’s earliest membership as the comments claim.  
  Failing input: an insurance organisation’s first membership was created by an administrator; a later assessor row has `created_by = user_id`. The later assessor is selected and promoted to `insurance_owner`.  
  Fix by ranking all memberships first, then requiring the selected first row to satisfy the founder predicates.

- **HIGH — the backfill itself runs without an RLS bypass.**  
  The founder `UPDATE` starts at [line 314](C:/Users/USER/Documents/autoworkshop-ai/infrastructure/migrations/085_insurance_and_towing_org_admin.sql:314), but `app.current_role = 'admin'` is not set until the guard at [line 352](C:/Users/USER/Documents/autoworkshop-ai/infrastructure/migrations/085_insurance_and_towing_org_admin.sql:352). Both tables use `FORCE ROW LEVEL SECURITY`. Under the stated non-superuser owner credential, the CTE sees no rows and updates nothing. The later guard does see rows, because `admin` is accepted by `identity.is_platform_admin()`, and consequently aborts any database containing an existing active insurer/towing organisation.  
  The guard is not vacuous; the backfill is. Set the admin context before the backfill, ideally in the same surrounding block/transaction.

- **MEDIUM — verify/085 does not prove the capability it claims.**  
  [verify/085](C:/Users/USER/Documents/autoworkshop-ai/infrastructure/migrations/verify/085_insurance_and_towing_org_admin.sql:42) sets the database role context to `admin`, then directly inserts the second membership at [line 95](C:/Users/USER/Documents/autoworkshop-ai/infrastructure/migrations/verify/085_insurance_and_towing_org_admin.sql:95). It never invokes `MembershipService.grant()`, so it does not exercise `CAN_GRANT_MEMBERSHIP`, `GRANTABLE_ROLES`, role/organisation fit, or the caller’s organisation. The same raw insert would succeed if `insurance_owner` were removed from every TypeScript allow-list.  
  The claim “proves the CAPABILITY” is false. It proves only that an admin-context SQL insert is structurally possible. It also never creates a second towing membership, despite the file header claiming both organisation types can build a team.

- **MEDIUM — three matching org-admin allow-lists were missed.**

  - [organization.service.ts](C:/Users/USER/Documents/autoworkshop-ai/apps/api/src/identity/organization.service.ts:16): `CAN_CREATE_ORG` contains `supplier_owner` and `fleet_administrator`, but not either new owner. An `insurance_owner` calling the organisation-create endpoint receives 403.
  - [branch.service.ts](C:/Users/USER/Documents/autoworkshop-ai/apps/api/src/identity/branch.service.ts:25): `CAN_CREATE_BRANCH` has the same omission. A towing founder attempting to create a second depot receives 403.
  - [organization-registration.service.ts](C:/Users/USER/Documents/autoworkshop-ai/apps/api/src/identity/organization-registration.service.ts:143): `MAY_READ_OWN_REGISTRATION` omits both new founder roles. An insurer/towing founder calling `GET /registrations/mine` receives 403 and cannot read the verification row their registration created.

  The first two depend on whether “mirroring supplier/fleet admin” includes organisation and branch creation. The third is unambiguously relevant to these self-service registrants.

- **MEDIUM — verify check 6 rejects a valid state and is not repeatable.**  
  [verify/085](C:/Users/USER/Documents/autoworkshop-ai/infrastructure/migrations/verify/085_insurance_and_towing_org_admin.sql:136) asserts that no organisation has more than one owner. The API explicitly makes the new owner roles grantable and permits an owner to grant another owner in the same organisation. After a legitimate administrator handover or shared ownership, verification fails even though migration 085 did not over-promote anyone. The comment “as a result of 085” is not something this aggregate query can establish.

- **LOW — comments overstate the role restriction.**  
  The function comment at [085 migration line 188](C:/Users/USER/Documents/autoworkshop-ai/infrastructure/migrations/085_insurance_and_towing_org_admin.sql:188) says `insurance_owner` “grants insurance_assessor (and later claims_approver).” In reality, [membership.service.ts](C:/Users/USER/Documents/autoworkshop-ai/apps/api/src/identity/membership.service.ts:67) also lets it grant `insurance_owner`, because there is no grantor-to-target-role hierarchy. The equivalent is true for towing.

## Other requested checks

The reproduced registration function behavior matches migration 080 apart from the intended membership role literals and comments: advisory-lock keys, bootstrap setup/cleanup, exception messages, organisation types, branch defaults, and registration kinds/statuses are unchanged. Replacing the functions also preserves their existing execute privileges.

The guard and verify queries can see through RLS after setting `app.current_role = 'admin'`; `identity.is_platform_admin()` explicitly accepts `admin`. Their invariant queries therefore do not pass vacuously.

Existing `insurance_assessor` and `towing_operator` holders are not generally refused by the TypeScript changes. Their existing gates and permissions remain. The selected backfill row changes roles, but the new owner roles were added to the insurance/towing endpoint gates, navigation workspace maps, permission matrix, and precedence list. The security problem is selecting the wrong row, not loss of access for untouched operational members.

I found no additional production role-name gate in the navigation packages or insurance/towing endpoint modules. The Keycloak realm omits the new names, but application authorization is resolved from database memberships rather than trusted realm-role claims, so that omission is not currently blocking.

I could not execute the targeted test commands because repository command execution was rejected by the managed workspace policy; `git diff --check` itself passed.
