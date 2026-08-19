-- One-off: let the live-suite identity REACH the partner workspaces.
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 WHAT THIS CLOSES — A3, AND ONLY HALF OF IT.
--
-- `diagnose-live-identity-roles.yml` run 32293446882 asked production rather
-- than inferring, and the inference held:
--
--   live-owner@aiappinvent.com   1 active membership   1 active role
--                                roles: workshop_owner
--   marc667us@yahoo.com          7 active memberships  7 active roles
--
-- So the signed-in half of the live suite holds ONE role and `RoleSwitcher`
-- renders nothing below two. Four A3 checks skip, and four screens built in
-- slices 17 and 20 are unverified by any signed-in viewer.
--
-- The three `[AUDIT]` partner organisations are the ones the operator already
-- uses, and each has exactly one member — the operator:
--
--   [AUDIT] Insurance Company  d7d30afd-…  insurance_company  insurance_owner
--   [AUDIT] Towing Company     c5c43056-…  towing_company     towing_owner
--   [AUDIT] Fleet Operator     f9dc95da-…  fleet_operator     fleet_administrator
--
-- All three live in tenant 7adce423-8a76-49f0-8174-7b40b66ef8c5. The live-suite
-- account lives in its OWN tenant, so these memberships are deliberately
-- CROSS-TENANT — which `identity.memberships` represents natively (`users` is
-- not tenant-scoped, by the comment in migration 001) and which the operator's
-- own account does not exercise, because all seven of its roles sit in one
-- tenant.
--
-- ── 🔴 WHY GRANTING THE MEMBERSHIPS IS NOT, BY ITSELF, THE FIX ────────────
--
-- The resume pointer prescribed exactly this write and stopped there. Read
-- against source, that would have been INERT:
--
--   viewer-contract.ts:470   if (m.organizationId !== organizationId) continue;
--
-- `rolesFromMemberships` is SCOPED TO THE ACTIVE ORGANISATION, deliberately —
-- every request sends `x-organization-id` AND `x-role-name` together and
-- `resolveTenantContext` requires ONE membership matching BOTH, so offering a
-- role held only elsewhere would offer a pair the API refuses. A role held in
-- another organisation therefore NEVER appears in the role switcher, no matter
-- how many memberships this script writes.
--
-- ▶ The control that crosses organisations is the ORGANISATION switcher, and
--   changing organisation CLEARS the stored role (`set-organization-action.ts`)
--   so the API re-resolves a role within the new organisation. (NOT reliably
--   the strongest one: with a requested organisation `resolveTenantContext`
--   takes `active.find(...)`, first row order, and only sorts by
--   `ROLE_PRECEDENCE` when no organisation was requested. Harmless here because
--   this account holds one role per `[AUDIT]` organisation.)
--   The harness change is in `apps/e2e/tests/live-signed-in.spec.ts`, and
--   WITHOUT IT this script changes nothing a test can observe.
--
-- ── ⚠️ WHY THE DEFAULT LANDING DOES NOT MOVE ─────────────────────────────
--
-- `resolveTenantContext` defaults by ROLE AUTHORITY first, organisation id only
-- as a tie-break. In `ROLE_PRECEDENCE`, `workshop_owner` is index 1 and outranks
-- `supplier_owner`(2), `fleet_administrator`(3), `insurance_owner`(4) and
-- `towing_owner`(5); only `platform_administrator`(0) beats it. So after this
-- runs, the live-suite account still signs in to its own workshop, and the four
-- currently-passing signed-in checks keep passing. That was checked BEFORE
-- writing, because adding memberships to the account the suite signs in as is
-- exactly the kind of change that turns a green suite red for a reason nobody
-- expects.
--
-- ── ⚠️ THE E-MAIL IS NOT HARDCODED HERE ──────────────────────────────────
--
-- `LIVE_OWNER_EMAIL` is a repository secret. This script takes it as
-- `:live_email` from the workflow, which reads the SAME secret the live suite
-- signs in with — so the account provisioned, the account granted and the
-- account tested cannot drift apart. A literal in this file could.
--
-- ⚠️ AND IT IS RE-EXPORTED AS A GUC IMMEDIATELY BELOW, WHICH IS NOT
-- REDUNDANT. psql substitutes `:'live_email'` in ordinary statement text but
-- NOT inside dollar-quoted bodies, so a `:'live_email'` written inside the
-- `DO $grant$ … $grant$` block below would be sent to the server verbatim and
-- fail to parse. The blocks read `current_setting('live.email')` instead.
--
-- 🔴 EVERY WRITE IS GUARDED BY THE FULL SHAPE THAT WAS MEASURED — organisation
-- id, tenant id, org_type, active status — and is idempotent through the
-- natural key. If production has moved since the diagnostic, nothing is written
-- and the gate says so rather than reporting success.
-- ══════════════════════════════════════════════════════════════════════════

\pset pager off
\set ON_ERROR_STOP on

BEGIN;

-- Transaction-local: this IS one transaction, so `true` is correct. The
-- diagnostic needed `false` because each of its statements was its own
-- transaction; copying that here would leak the setting past COMMIT.
SELECT set_config('app.current_role', 'admin', true) AS platform_context;

-- The e-mail, carried across the dollar-quoting boundary. `true` again: it must
-- not outlive this transaction.
--
-- 🔴 AND THE VALUE IS NOT ECHOED. `set_config` RETURNS what it was given, so
-- `SELECT set_config(...) AS live_email` printed the secret address on stdout —
-- which is the stream the workflow `tee`s to a file and `cat`s into the job
-- summary, where Actions masking does not reach. Redacting the two display
-- queries was not enough on its own; this line was the actual disclosure.
SELECT CASE WHEN set_config('live.email', :'live_email', true) = '' THEN 'EMPTY'
            ELSE 'set' END AS live_email;

-- ⚠️ THE ADDRESS IS NOT SELECTED, IN EITHER DISPLAY QUERY. `LIVE_OWNER_EMAIL`
-- is a repository secret, and this output is `tee`d to a file which the
-- workflow then `cat`s verbatim into `$GITHUB_STEP_SUMMARY`. Actions masking
-- applies to LOG INGESTION, not to a file written and re-emitted, so selecting
-- `u.email` here would render the secret in plain text on the run summary page
-- for anyone with read access to the repository. Found by the Supervisor. The
-- constant below keeps the rows attributable without disclosing anything, and
-- the gate has already pinned exactly which account these rows belong to.
\echo ''
\echo '=== BEFORE — what the live-suite identity holds ==='
SELECT '(LIVE_OWNER_EMAIL)' AS account, o.name AS organization, o.org_type,
       m.role_name, m.status
  FROM identity.users u
  LEFT JOIN identity.memberships m   ON m.user_id = u.id
  LEFT JOIN identity.organizations o ON o.id = m.organization_id
 WHERE u.email = :'live_email'
 ORDER BY o.name;

DO $grant$
DECLARE
    -- Measured 2026-08-19 by diagnose-live-identity-roles.yml run 32293446882.
    v_tenant    uuid := '7adce423-8a76-49f0-8174-7b40b66ef8c5';
    v_ins_org   uuid := 'd7d30afd-a615-4c0b-a8d2-fa61c44570bb';
    v_tow_org   uuid := 'c5c43056-8920-47c9-8735-2d52e8ee3115';
    v_fleet_org uuid := 'f9dc95da-d225-49b2-a4ed-adae414e2b2d';
    v_email     text := current_setting('live.email', true);
    v_user      uuid;
    v_matches   int;
    v_changed   int;
    v_total     int := 0;
BEGIN
    IF v_email IS NULL OR v_email = '' THEN
        RAISE EXCEPTION 'live.email is not set — the workflow did not pass '
                        '-v live_email, so this script does not know which account '
                        'to grant. Refusing rather than guessing.';
    END IF;

    -- ── resolve the account, and REFUSE on anything but exactly one ───────
    --
    -- 🔴 COUNT FIRST. `identity.users.email` carries NO UNIQUE CONSTRAINT —
    -- migration 001 declares only `keycloak_subject TEXT NOT NULL UNIQUE`,
    -- because one human may hold several Keycloak identities. So a bare
    -- `SELECT ... INTO` here would take an ARBITRARY row of however many match
    -- and grant production partner authority to whichever one the planner
    -- happened to return, while the comment above it claimed exactly one.
    --
    -- Codex found that on this file: the promise was in the prose and not in
    -- the code. Counting first is what makes the refusal real. `INTO STRICT`
    -- would also raise, but its `TOO_MANY_ROWS` says nothing about WHICH
    -- e-mail is duplicated or how many rows there are, and this is a message
    -- somebody will read at speed while a production write is half-done.
    SELECT count(*) INTO v_matches
      FROM identity.users
     WHERE email = v_email AND status = 'active';

    IF v_matches = 0 THEN
        RAISE EXCEPTION 'no ACTIVE identity.users row with e-mail %. LIVE_OWNER_EMAIL '
                        'names an account that does not exist on production — run '
                        'provision-live-suite-account.yml first, or the secret is wrong.',
                        v_email;
    END IF;

    IF v_matches > 1 THEN
        RAISE EXCEPTION 'e-mail % matches % ACTIVE identity.users rows. That column has '
                        'no UNIQUE constraint (only keycloak_subject does), so this '
                        'script cannot tell which account the live suite signs in as — '
                        'and guessing would grant partner authority to the wrong one. '
                        'Resolve the duplicate, or re-key this script on keycloak_subject.',
                        v_email, v_matches;
    END IF;

    SELECT id INTO v_user
      FROM identity.users
     WHERE email = v_email AND status = 'active';

    -- The USER ID, not the address. A NOTICE goes to stderr rather than into
    -- the summary file, so this is the lesser of the two exposures — but the id
    -- identifies the row just as well for anyone debugging, and discloses
    -- nothing. The refusal messages below still name the address deliberately:
    -- they only fire when the transaction is aborting and the operator needs to
    -- know WHICH address failed to resolve.
    RAISE NOTICE 'granting partner memberships to user %', v_user;

    -- ── the three grants ─────────────────────────────────────────────────
    -- One statement per organisation rather than a loop over a VALUES list:
    -- each names its own org_type, so a mistyped pairing (a towing role into
    -- the insurance organisation) cannot insert anything. A loop would make
    -- all three share one predicate and lose exactly that check.
    --
    -- `ON CONFLICT` on the natural key `(organization_id, user_id, role_name)`
    -- makes a re-run a no-op, so `0 granted` on the second run is SUCCESS.
    --
    -- 🔴 DO UPDATE, NOT DO NOTHING, AND THE DIFFERENCE IS NOT COSMETIC.
    -- `status` is NOT part of that key. With `DO NOTHING`, an existing
    -- `suspended` or `revoked` row would swallow the insert, leave the account
    -- without an ACTIVE membership, and send the gate below into a "the grants
    -- did not take" message blaming the [AUDIT] organisations — pointing the
    -- next reader at the wrong thing entirely. Codex found it; nothing on
    -- production is in that state today, which is exactly why it would have
    -- sat here unnoticed until it mattered.
    --
    -- ⚠️ REACTIVATING IS A DECISION, TAKEN DELIBERATELY. The target is never a
    -- real person: it is the dedicated live-suite fixture named by
    -- `LIVE_OWNER_EMAIL`, which `provision-live-suite-account.yml` creates for
    -- this purpose and documents as "never the owner's own". Reactivating a
    -- withdrawn membership on a REAL account would be a privilege decision this
    -- script has no standing to make. The `WHERE` clause keeps it honest: an
    -- already-active row is untouched, so `updated_at` still means something.
    --
    -- `created_by` is left NULL, deliberately. Naming a grantor would write a
    -- claim about history this script cannot establish — the same reasoning
    -- that made repair_audit_org_founders.sql set the role rather than
    -- backfill `created_by`. The existing [AUDIT] rows are NULL too.
    --
    -- `tenant_id` comes from the ORGANISATION ROW, never from a literal or from
    -- the user's own tenant. A membership whose tenant disagrees with its
    -- organisation is the shape RLS cannot express and every join would then
    -- silently drop.
    INSERT INTO identity.memberships (tenant_id, organization_id, user_id, role_name, status)
    SELECT o.tenant_id, o.id, v_user, 'insurance_owner', 'active'
      FROM identity.organizations o
     WHERE o.id        = v_ins_org
       AND o.tenant_id = v_tenant
       AND o.org_type  = 'insurance_company'
       AND o.status    = 'active'
    ON CONFLICT (organization_id, user_id, role_name) DO UPDATE
       SET status = 'active', updated_at = now()
     WHERE identity.memberships.status <> 'active';
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    RAISE NOTICE 'insurance: % membership(s) granted', v_changed;
    v_total := v_total + v_changed;

    INSERT INTO identity.memberships (tenant_id, organization_id, user_id, role_name, status)
    SELECT o.tenant_id, o.id, v_user, 'towing_owner', 'active'
      FROM identity.organizations o
     WHERE o.id        = v_tow_org
       AND o.tenant_id = v_tenant
       AND o.org_type  = 'towing_company'
       AND o.status    = 'active'
    ON CONFLICT (organization_id, user_id, role_name) DO UPDATE
       SET status = 'active', updated_at = now()
     WHERE identity.memberships.status <> 'active';
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    RAISE NOTICE 'towing: % membership(s) granted', v_changed;
    v_total := v_total + v_changed;

    INSERT INTO identity.memberships (tenant_id, organization_id, user_id, role_name, status)
    SELECT o.tenant_id, o.id, v_user, 'fleet_administrator', 'active'
      FROM identity.organizations o
     WHERE o.id        = v_fleet_org
       AND o.tenant_id = v_tenant
       AND o.org_type  = 'fleet_operator'
       AND o.status    = 'active'
    ON CONFLICT (organization_id, user_id, role_name) DO UPDATE
       SET status = 'active', updated_at = now()
     WHERE identity.memberships.status <> 'active';
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    RAISE NOTICE 'fleet: % membership(s) granted', v_changed;
    v_total := v_total + v_changed;

    RAISE NOTICE 'total granted this run: % (0 on a re-run is expected)', v_total;
END;
$grant$;

-- ── THE GATE: assert the END STATE, not the row count ─────────────────────
--
-- 🔴 THIS IS WHAT MAKES THE WRITE MEANINGFUL. Inserting rows is not the goal;
-- the goal is that a signed-in viewer can REACH the insurance, towing and fleet
-- workspaces. So the end state is asserted here and the transaction ROLLS BACK
-- if it is not true — rather than reporting success and leaving the live suite
-- to skip again twenty minutes later.
--
-- It asserts the ORGANISATION count as well as the memberships, because the
-- organisation switcher is the control the harness actually drives and it too
-- renders nothing below two options.
--
-- 🔴 EACH TARGET IS ASSERTED BY ITS OWN ORGANISATION ID, NOT BY ROLE NAME.
-- The first version of this gate asked "does the account hold these three role
-- NAMES anywhere?", which Codex showed can pass while a target grant failed:
-- the live-suite account may hold `fleet_administrator` in its own Live Suite
-- Fleet organisation, so a silently-skipped insert into `[AUDIT] Fleet
-- Operator` would have been masked by a role held somewhere else entirely. The
-- transaction would then COMMIT and report success while one named
-- organisation stayed unreachable — the exact failure this gate exists to
-- prevent, wearing the badge of the thing that prevents it.
--
-- So each check names the organisation id, its tenant, its type, and requires
-- an ACTIVE membership for THIS user with THAT role in THAT organisation.
DO $gate$
DECLARE
    v_email   text := current_setting('live.email', true);
    v_orgs    int;
    v_missing text[] := ARRAY[]::text[];
    v_target  record;
BEGIN
    PERFORM set_config('app.current_role', 'admin', true);

    -- Named pairs, measured — the same three the grant block writes. Kept as a
    -- literal list so the gate cannot be satisfied by anything the grant block
    -- did not actually target.
    FOR v_target IN
        SELECT * FROM (VALUES
            ('d7d30afd-a615-4c0b-a8d2-fa61c44570bb'::uuid, 'insurance_company', 'insurance_owner',     '[AUDIT] Insurance Company'),
            ('c5c43056-8920-47c9-8735-2d52e8ee3115'::uuid, 'towing_company',    'towing_owner',        '[AUDIT] Towing Company'),
            ('f9dc95da-d225-49b2-a4ed-adae414e2b2d'::uuid, 'fleet_operator',    'fleet_administrator', '[AUDIT] Fleet Operator')
        ) AS t(org_id, org_type, role_name, label)
    LOOP
        IF NOT EXISTS (
            SELECT 1
              FROM identity.users u
              JOIN identity.memberships m   ON m.user_id = u.id
              JOIN identity.organizations o ON o.id = m.organization_id
                                           AND o.tenant_id = m.tenant_id
             WHERE u.email          = v_email
               AND u.status         = 'active'
               AND m.organization_id = v_target.org_id
               AND m.role_name      = v_target.role_name
               AND m.status         = 'active'
               AND o.org_type       = v_target.org_type
               AND o.status         = 'active'
        ) THEN
            v_missing := v_missing || format('%s (%s in %s)',
                                             v_target.label, v_target.role_name, v_target.org_id);
        END IF;
    END LOOP;

    IF array_length(v_missing, 1) > 0 THEN
        RAISE EXCEPTION 'the grants did not take for %: %. Each is named by ORGANISATION '
                        'ID, so this is not a missing role name somewhere — one of the '
                        '[AUDIT] organisations has changed shape since run 32293446882. '
                        'Re-run diagnose-live-identity-roles.yml and re-measure the ids.',
                        v_email, array_to_string(v_missing, '; ');
    END IF;

    -- ⚠️ `u.status = 'active'` IS NOT DECORATION HERE. Every other predicate in
    -- this script requires it; this one did not, and the Supervisor pointed out
    -- what that costs given the script's own headline fact — `identity.users.email`
    -- has NO UNIQUE constraint. A single INACTIVE duplicate row carrying an old
    -- membership would push this count to 2 and let the `< 2` gate pass while
    -- the LIVE account still belonged to one organisation: precisely the
    -- "reports success, suite skips again twenty minutes later" outcome the gate
    -- exists to prevent.
    SELECT count(DISTINCT m.organization_id) INTO v_orgs
      FROM identity.users u
      JOIN identity.memberships m ON m.user_id = u.id AND m.status = 'active'
     WHERE u.email = v_email
       AND u.status = 'active';

    -- The organisation switcher renders nothing below two options, so this is
    -- the harness's actual precondition — not a restatement of the checks above.
    IF v_orgs < 2 THEN
        RAISE EXCEPTION 'the account holds % organisation(s); the organisation switcher '
                        'renders nothing below two, so the harness still could not reach '
                        'a partner workspace.', v_orgs;
    END IF;

    RAISE NOTICE 'gate passed: all three named [AUDIT] memberships active, % organisations total', v_orgs;
END;
$gate$;

\echo ''
\echo '=== AFTER — what the live-suite identity holds now ==='
SELECT '(LIVE_OWNER_EMAIL)' AS account, o.name AS organization, o.org_type,
       m.role_name, m.status
  FROM identity.users u
  JOIN identity.memberships m   ON m.user_id = u.id
  JOIN identity.organizations o ON o.id = m.organization_id
 WHERE u.email = :'live_email'
 ORDER BY o.name;

COMMIT;
