-- verify/052 — A7, PROVEN BY TRYING THE REWRITE THAT USED TO SUCCEED.

DO $verify$
DECLARE
    item uuid; first_by uuid; other_user uuid; refused boolean; n int;
    passed int := 0;
BEGIN
    SELECT id INTO first_by FROM identity.users ORDER BY created_at LIMIT 1;
    SELECT id INTO other_user FROM identity.users WHERE id <> first_by ORDER BY created_at LIMIT 1;

    -- 1. the append-only guard is BACK ON. The migration disables it for the
    -- backfill; leaving it disabled would silently un-protect every submitted
    -- inspection in the product, which is a far worse defect than the one being
    -- fixed.
    SELECT count(*) INTO n FROM pg_trigger
     WHERE tgname = 'trg_inspection_items_immutable' AND tgenabled = 'O';
    IF n <> 1 THEN
        RAISE EXCEPTION 'trg_inspection_items_immutable is NOT enabled after the backfill — '
                        'every submitted inspection is now editable';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  1/4 the append-only guard was re-enabled after the backfill';

    -- 2. existing findings carry a first recorder
    SELECT count(*) INTO n FROM repair.inspection_items
     WHERE recorded_by IS NOT NULL AND first_recorded_by IS NULL;
    IF n <> 0 THEN
        RAISE EXCEPTION '% recorded findings still have no first_recorded_by', n;
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  2/4 every recorded finding carries a first recorder';

    -- 3. 🔴 THE REWRITE THAT USED TO SUCCEED IS NOW REFUSED.
    SELECT id INTO item FROM repair.inspection_items
     WHERE first_recorded_by IS NOT NULL LIMIT 1;
    IF item IS NULL THEN
        RAISE WARNING '  3-4/4 SKIPPED: no recorded findings exist to test against. NOT A PASS.';
    ELSE
        refused := false;
        BEGIN
            UPDATE repair.inspection_items
               SET first_recorded_by = COALESCE(other_user, gen_random_uuid())
             WHERE id = item;
        EXCEPTION WHEN check_violation THEN refused := true;
        END;
        IF NOT refused THEN
            RAISE EXCEPTION 'first_recorded_by was OVERWRITTEN — who found this is lost again';
        END IF;
        passed := passed + 1;
        RAISE NOTICE '  3/4 first_recorded_by cannot be overwritten';

        -- 4. …and nor can it be erased, which an edit-to-NULL would be.
        refused := false;
        BEGIN
            UPDATE repair.inspection_items SET first_recorded_by = NULL WHERE id = item;
        EXCEPTION WHEN check_violation THEN refused := true;
        END;
        IF NOT refused THEN
            RAISE EXCEPTION 'first_recorded_by was ERASED to NULL';
        END IF;
        passed := passed + 1;
        RAISE NOTICE '  4/4 first_recorded_by cannot be erased either';
    END IF;

    RAISE NOTICE 'verify/052: % of 4 checks passed', passed;
END
$verify$;
