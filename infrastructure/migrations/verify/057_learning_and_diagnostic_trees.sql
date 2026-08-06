-- verify/057 — PROVEN BY INJECTING EACH FAILURE.
--
-- The two claims worth testing are both CONDITIONAL, and both have a half that
-- a one-sided check would miss:
--   · a video needs a link; an assessment does not.
--   · every node needs the answer that leads to it; the ROOT does not.
-- A constraint that demanded the thing universally would break the other half,
-- and a check that only tested the strict direction would never notice.

DO $verify$
DECLARE
    tid uuid; oid uuid; me uuid;
    course uuid; mat uuid; tree uuid; root uuid; child uuid;
    n int; refused boolean;
    passed int := 0;
BEGIN
    SELECT id INTO me FROM identity.users LIMIT 1;
    IF me IS NULL THEN RAISE EXCEPTION 'verify/057: no user rows'; END IF;

    tid := identity.current_tenant_id();
    IF tid IS NULL THEN
        tid := gen_random_uuid(); oid := gen_random_uuid();
        PERFORM set_config('app.bootstrap', 'on', true);
        PERFORM set_config('app.bootstrap_user', me::text, true);
        INSERT INTO identity.tenants (id, name, slug, created_by)
        VALUES (tid, 'verify-057', 'verify-057-' || replace(tid::text,'-',''), me);
        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
        VALUES (oid, tid, 'verify-057 workshop', 'individual_workshop', me);
        PERFORM set_config('app.bootstrap', 'off', true);
    ELSE
        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
    END IF;
    IF oid IS NULL THEN RAISE EXCEPTION 'verify/057: tenant % has no organisation', tid; END IF;

    PERFORM set_config('app.tenant_id', tid::text, true);
    PERFORM set_config('app.organization_ids', oid::text, true);

    INSERT INTO learning.courses (tenant_id, organization_id, title, created_by)
    VALUES (tid, oid, 'verify-057 course', me) RETURNING id INTO course;

    -- 1. a video WITH a link is accepted
    INSERT INTO learning.course_materials
      (tenant_id, organization_id, course_id, material_kind, title, external_url, created_by)
    VALUES (tid, oid, course, 'video', 'verify-057 video',
            'https://example.test/v', me)
    RETURNING id INTO mat;
    passed := passed + 1;
    RAISE NOTICE '  1/8 a video with a link is accepted';

    -- 2. 🔴 THE EMPTY PLAYER, INJECTED: a video with NO link.
    refused := false;
    BEGIN
        INSERT INTO learning.course_materials
          (tenant_id, organization_id, course_id, material_kind, title, created_by)
        VALUES (tid, oid, course, 'video', 'verify-057 no link', me);
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'a VIDEO with no link was ACCEPTED — that is the empty player '
                        'this migration exists to prevent';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  2/8 a video with no link is refused';

    -- 3. …but an ASSESSMENT needs no link. The other half: a constraint
    -- demanding a URL on every material would have broken every assessment.
    INSERT INTO learning.course_materials
      (tenant_id, organization_id, course_id, material_kind, title, created_by)
    VALUES (tid, oid, course, 'assessment', 'verify-057 assessment', me);
    passed := passed + 1;
    RAISE NOTICE '  3/8 an assessment needs no link';

    -- 4. an insecure link is refused
    refused := false;
    BEGIN
        INSERT INTO learning.course_materials
          (tenant_id, organization_id, course_id, material_kind, title, external_url, created_by)
        VALUES (tid, oid, course, 'audio', 'verify-057 http', 'http://example.test/a', me);
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN RAISE EXCEPTION 'an http:// training link was ACCEPTED'; END IF;
    passed := passed + 1;
    RAISE NOTICE '  4/8 an http link is refused';

    -- 5. one completion per person per material; a retake UPDATES
    INSERT INTO learning.completions
      (tenant_id, organization_id, material_id, user_id, score_percent, recorded_by)
    VALUES (tid, oid, mat, me, 70, me);
    refused := false;
    BEGIN
        INSERT INTO learning.completions
          (tenant_id, organization_id, material_id, user_id, score_percent, recorded_by)
        VALUES (tid, oid, mat, me, 90, me);
    EXCEPTION WHEN unique_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'the same person completed the same material TWICE — '
                        '"have they done it?" now has two answers';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  5/8 a second completion for the same person is refused';

    -- ── diagnostic trees ───────────────────────────────────────────────────
    INSERT INTO knowledge.diagnostic_trees (tenant_id, organization_id, title, created_by)
    VALUES (tid, oid, 'verify-057 no-start tree', me) RETURNING id INTO tree;

    -- 6. a ROOT carries no answer, and a CHILD must
    INSERT INTO knowledge.diagnostic_tree_nodes
      (tenant_id, organization_id, tree_id, node_kind, text, created_by)
    VALUES (tid, oid, tree, 'question', 'Does the starter turn?', me)
    RETURNING id INTO root;
    INSERT INTO knowledge.diagnostic_tree_nodes
      (tenant_id, organization_id, tree_id, parent_id, answer, node_kind, text, created_by)
    VALUES (tid, oid, tree, root, 'No', 'outcome', 'Check the battery and earth strap.', me)
    RETURNING id INTO child;
    passed := passed + 1;
    RAISE NOTICE '  6/8 a root with no answer and a child with one are both accepted';

    -- 7. 🔴 A CHILD WITH NO ANSWER — the tree could not be walked.
    refused := false;
    BEGIN
        INSERT INTO knowledge.diagnostic_tree_nodes
          (tenant_id, organization_id, tree_id, parent_id, node_kind, text, created_by)
        VALUES (tid, oid, tree, root, 'question', 'verify-057 orphan branch', me);
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'a branch with NO ANSWER leading to it was ACCEPTED — '
                        'the tree cannot be walked';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  7/8 a branch with no answer is refused';

    -- 8. 🔴 TWO ROOTS IS NOT A TREE. The walker would pick whichever came back
    -- first, and two technicians would get different advice from one tree.
    refused := false;
    BEGIN
        INSERT INTO knowledge.diagnostic_tree_nodes
          (tenant_id, organization_id, tree_id, node_kind, text, created_by)
        VALUES (tid, oid, tree, 'question', 'verify-057 second root', me);
    EXCEPTION WHEN unique_violation THEN refused := true;
    END;
    IF NOT refused THEN RAISE EXCEPTION 'a SECOND ROOT was accepted on one tree'; END IF;
    passed := passed + 1;
    RAISE NOTICE '  8/8 a second root on one tree is refused';

    RAISE NOTICE 'verify/057: % of 8 checks passed', passed;
    IF passed < 8 THEN
        RAISE EXCEPTION 'verify/057: % checks did NOT run', 8 - passed;
    END IF;
END
$verify$;
