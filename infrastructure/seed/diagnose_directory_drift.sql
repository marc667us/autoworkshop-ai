-- Why does a mechanic_directory row exist for a workshop registered seconds ago?
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 THE QUESTION, STATED EXACTLY. On 2026-08-14 the UAT seeder registered a
-- workshop through `identity.register_workshop`, approved its registration,
-- and then failed inserting into `catalogue.mechanic_directory` with
-- `duplicate key value violates unique constraint "uq_directory_org"`.
--
-- A row for that brand-new organisation already existed. On the local database
-- the same sequence inserts cleanly: the same UNIQUE constraint is present and
-- the only trigger on `identity.organization_registrations` is the admin
-- alert.
--
-- So production does something local does not, and this file finds out WHAT
-- rather than assuming. Five confident diagnoses were wrong on 2026-08-13 and
-- each cost a deploy cycle; this reads the catalogue instead of theorising.
--
-- READ-ONLY. Every statement is a SELECT against system catalogues. It writes
-- nothing, and it takes no locks beyond catalogue reads.
-- ══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
\pset format aligned

\echo '=== 1. Triggers on identity.organization_registrations ==='
-- Local has exactly one: trg_alert_admins_of_registration. Anything else here
-- is a candidate for the writer.
SELECT t.tgname,
       CASE t.tgtype & 1 WHEN 1 THEN 'ROW' ELSE 'STATEMENT' END AS level,
       p.proname AS function
  FROM pg_trigger t
  JOIN pg_proc p ON p.oid = t.tgfoid
 WHERE t.tgrelid = 'identity.organization_registrations'::regclass
   AND NOT t.tgisinternal
 ORDER BY t.tgname;

\echo ''
\echo '=== 2. Triggers on identity.organizations ==='
SELECT t.tgname, p.proname AS function
  FROM pg_trigger t
  JOIN pg_proc p ON p.oid = t.tgfoid
 WHERE t.tgrelid = 'identity.organizations'::regclass
   AND NOT t.tgisinternal
 ORDER BY t.tgname;

\echo ''
\echo '=== 3. Triggers on catalogue.mechanic_directory ==='
SELECT t.tgname, p.proname AS function
  FROM pg_trigger t
  JOIN pg_proc p ON p.oid = t.tgfoid
 WHERE t.tgrelid = 'catalogue.mechanic_directory'::regclass
   AND NOT t.tgisinternal
 ORDER BY t.tgname;

\echo ''
\echo '=== 4. ANY function whose body writes mechanic_directory ==='
-- 🔴 THE DECISIVE QUERY. Whatever creates the row must contain an INSERT into
-- that table, wherever it lives. Searching the catalogue finds it even if it
-- is a function nobody thought to look at.
SELECT n.nspname||'.'||p.proname AS function,
       CASE p.prosecdef WHEN true THEN 'DEFINER' ELSE 'INVOKER' END AS security
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname NOT IN ('pg_catalog','information_schema')
   -- ⚠️ `prokind = 'f'` OR `pg_get_functiondef` ERRORS. It refuses aggregates
   -- and window functions ("array_agg is an aggregate function"), which aborts
   -- the whole query rather than skipping the row. Measured locally first.
   AND p.prokind = 'f'
   AND pg_get_functiondef(p.oid) ILIKE '%mechanic_directory%'
   AND pg_get_functiondef(p.oid) ILIKE '%INSERT%'
 ORDER BY 1;

\echo ''
\echo '=== 5. Does register_workshop itself write it? ==='
SELECT CASE
         WHEN pg_get_functiondef('identity.register_workshop(text,text,text)'::regprocedure)
              ILIKE '%mechanic_directory%'
         THEN 'YES — register_workshop touches mechanic_directory on THIS database'
         ELSE 'no — register_workshop does not mention mechanic_directory'
       END AS answer;

\echo ''
\echo '=== 6. The migration ledger tip, to rule out drift in what was applied ==='
-- ⚠️ the column is `version`, not `name`.
SELECT version, applied_at
  FROM public.schema_migrations
 ORDER BY version DESC
 LIMIT 5;

\echo ''
\echo '=== 7. The exact lines of register_workshop that mention the directory ==='
-- 🔴 NAMES THE DRIFT INSTEAD OF ASSERTING IT. Section 5 proves production's
-- function mentions the table and local's does not; this prints WHAT it does
-- with it, so the difference is a quotable fact rather than an inference.
SELECT ln AS line
  FROM (
    SELECT row_number() OVER () AS n, ln
      FROM regexp_split_to_table(
             pg_get_functiondef('identity.register_workshop(text,text,text)'::regprocedure),
             E'
') AS ln
  ) t
 WHERE ln ILIKE '%mechanic_directory%'
    OR ln ILIKE '%is_published%'
    OR ln ILIKE '%trading_name%';

\echo ''
\echo '=== 8. Migration ledger checksum for the migration that defines it ==='
-- If a file changed after being applied, run.sh's checksum guard should have
-- said so. Printing it makes the ledger's own opinion visible.
SELECT version, applied_at, left(checksum, 16) AS checksum_head
  FROM public.schema_migrations
 WHERE version LIKE '036%' OR version LIKE '037%' OR version LIKE '07%'
 ORDER BY version;
