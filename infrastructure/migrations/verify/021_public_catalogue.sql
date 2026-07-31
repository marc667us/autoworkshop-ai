-- Proof by effect for migration 021.
--
-- Runs as `autoworkshop_app` with NO tenant context and NO admin role — i.e.
-- exactly the connection a signed-out visitor's request uses. Asserting the
-- policy TEXT would prove nothing; the question is whether the database
-- actually refuses, so every check below reads rows and counts them.
--
--   docker exec -i aw-postgres psql -U autoworkshop -d autoworkshop \
--     -v ON_ERROR_STOP=1 -f - < infrastructure/migrations/verify/021_public_catalogue.sql
--
-- Wrapped in a transaction that ROLLS BACK: this must be re-runnable against a
-- seeded database without changing it.

BEGIN;

SET LOCAL ROLE autoworkshop_app;
-- Deliberately NOT set: app.current_tenant, app.current_role. A public reader
-- has neither, and if any check below needs one the endpoint is not public.

DO $$
DECLARE
  n INTEGER;
  total INTEGER;
BEGIN
  -- 1. RLS is ENABLED *and* FORCED on all five tables. ENABLE alone exempts the
  --    table owner, and migrations run as the owner, so a policy without FORCE
  --    is decorative.
  SELECT count(*) INTO n
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'catalogue' AND c.relkind = 'r'
     AND c.relrowsecurity AND c.relforcerowsecurity;
  IF n <> 5 THEN
    RAISE EXCEPTION 'check 1 FAILED: expected 5 catalogue tables with ENABLE+FORCE RLS, found %', n;
  END IF;
  RAISE NOTICE 'check 1 OK: 5 catalogue tables are ENABLE + FORCE row level security';

  -- 2. An unpublished SUPPLIER is invisible. The seed leaves 'draft-supplier'
  --    unpublished precisely so this check can fail if the policy breaks.
  SELECT count(*) INTO n FROM catalogue.suppliers WHERE slug = 'draft-supplier';
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 2 FAILED: unpublished supplier is readable by the public role';
  END IF;
  RAISE NOTICE 'check 2 OK: unpublished supplier is invisible to autoworkshop_app';

  -- 3. Published suppliers ARE visible — otherwise check 2 would pass on an
  --    empty table and prove nothing.
  SELECT count(*) INTO n FROM catalogue.suppliers;
  IF n < 1 THEN
    RAISE EXCEPTION 'check 3 FAILED: no published suppliers readable — check 2 was vacuous';
  END IF;
  RAISE NOTICE 'check 3 OK: % published suppliers readable', n;

  -- 4. An unpublished PART belonging to a published supplier is invisible. This
  --    is the part gate acting independently of the supplier gate.
  SELECT count(*) INTO n FROM catalogue.parts WHERE part_number = 'BRK-9999';
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 4 FAILED: unpublished part is readable by the public role';
  END IF;
  RAISE NOTICE 'check 4 OK: unpublished part invisible even though its supplier is published';

  -- 5. Every readable part is published. Stronger than check 4: that one names a
  --    row, this one admits no exception anywhere in the table.
  SELECT count(*) INTO n FROM catalogue.parts WHERE NOT is_published;
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 5 FAILED: % unpublished parts are readable', n;
  END IF;
  SELECT count(*) INTO total FROM catalogue.parts;
  RAISE NOTICE 'check 5 OK: all % readable parts are published', total;

  -- 6. A FITMENT follows its part. 'FLT-9999' is published but its SUPPLIER is
  --    not — the part row itself is readable, so this checks the join the
  --    public query must make, not the fitment policy. Covered by check 7.
  --    Here: no fitment may reference an unreadable part.
  SELECT count(*) INTO n
    FROM catalogue.part_fitments f
   WHERE NOT EXISTS (SELECT 1 FROM catalogue.parts p WHERE p.id = f.part_id);
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 6 FAILED: % fitments readable whose part is not', n;
  END IF;
  RAISE NOTICE 'check 6 OK: every readable fitment belongs to a readable part';

  -- 7. ⚠️ THE ORPHAN CASE, and the reason the public query must JOIN suppliers
  --    rather than trusting `parts.is_published` alone. 'FLT-9999' IS published;
  --    its supplier is NOT. The row is therefore readable at the table level and
  --    the RLS policy is behaving correctly — publishing a part does not
  --    publish its supplier. Nothing in the database stops this part reaching a
  --    visitor; only the query does. This check ASSERTS the row is readable, so
  --    that the API test which must exclude it has something real to exclude.
  SELECT count(*) INTO n FROM catalogue.parts WHERE part_number = 'FLT-9999';
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 7 FAILED: expected the orphan part to be readable at table level (found %) — the API-level supplier join is what must exclude it', n;
  END IF;
  RAISE NOTICE 'check 7 OK: orphan part readable at table level — API must exclude it via the supplier join';

  -- 8. Unpublished mechanic listings are invisible. Currently both are
  --    published, so this asserts the invariant rather than a specific row.
  SELECT count(*) INTO n FROM catalogue.mechanic_directory WHERE NOT is_published;
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 8 FAILED: % unpublished mechanic listings readable', n;
  END IF;
  SELECT count(*) INTO total FROM catalogue.mechanic_directory;
  RAISE NOTICE 'check 8 OK: all % readable mechanic listings are published', total;

  -- 9. THE PUBLIC ROLE CANNOT WRITE. Reading the catalogue is public; changing
  --    it is not. Without app.current_role='admin' the admin_write policy's
  --    WITH CHECK must refuse the insert.
  BEGIN
    INSERT INTO catalogue.suppliers (slug, name, country, is_published)
    VALUES ('injected-supplier', 'Injected', 'Nowhere', TRUE);
    RAISE EXCEPTION 'check 9 FAILED: public role INSERTED a supplier';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'check 9 OK: public role refused INSERT (RLS policy violation)';
  END;

  -- 10. The public role cannot PUBLISH an unpublished row either — the write
  --     gate must cover UPDATE, not only INSERT. An UPDATE that matches no
  --     readable row affects zero rows rather than raising, so this asserts the
  --     COUNT, which is the failure mode a bare "it didn't error" would miss.
  UPDATE catalogue.parts SET is_published = TRUE WHERE part_number = 'BRK-9999';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 10 FAILED: public role updated % unpublished part row(s)', n;
  END IF;
  RAISE NOTICE 'check 10 OK: public role could not publish a draft part (0 rows affected)';

  RAISE NOTICE '--- 021 verify: 10/10 checks passed ---';
END $$;

ROLLBACK;
