#!/usr/bin/env bash
#
# Seeds ONE proposal ISSUED to the dev customer, so the customer approval screen
# has something to answer.
#
# 🔴 WHY THIS EXISTS. `verify-customer-workflow.mjs` asserts the approval screen
# is in a coherent state — either it offers an answer, or it honestly says
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
# verify script's `offersAnswer` branch — including the "has a submit button"
# assertion — actually runs.
#
# ⚠️ THE VERIFY RUN CONSUMES THIS FIXTURE if it submits an answer: an answered
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
     -- APPROVED quotations only. `repair.assert_proposal_quotation_approved`
     -- (migration 017) refuses a proposal built on a draft or rejected price,
     -- and `prepare()` filters the same way. A fixture that picks any quotation
     -- either dies on the trigger or seeds a document the product would never
     -- have produced.
     AND EXISTS (SELECT 1 FROM repair.quotations q
                  WHERE q.job_card_id = j.id AND q.status = 'approved')
   ORDER BY j.opened_at DESC
   LIMIT 1;

  IF card IS NULL THEN
    -- Refuse loudly rather than seeding nothing and letting the verify run
    -- report a clean pass on its empty branch — which is the whole failure this
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
     AND status = 'approved'
   ORDER BY attempt_no DESC
   LIMIT 1;

  IF quote IS NULL THEN
    RAISE EXCEPTION 'card % has no APPROVED quotation to build a proposal from', card;
  END IF;

  -- ── 🔴 RESET THE FIXTURE'S OWN PREVIOUS ROW, IF THE LAST RUN ANSWERED IT ──
  --
  -- The verify run CONSUMES this fixture by approving it, and the product then
  -- refuses to move on: `prepare()` will not supersede an APPROVED proposal
  -- ("a material change needs a new quotation first"), and the CHECK constraint
  -- `proposal_option_only_when_approved` makes `status='superseded'` impossible
  -- while `approved_option` is set. Both are CORRECT — replacing an agreement a
  -- customer has given is a commercial act, not a button press.
  --
  -- So there is no legitimate forward path on that card, and the fixture has to
  -- go backwards: it un-answers the row IT created. That means suspending
  -- `trg_proposals_immutable`, the trigger enforcing §424 immutability.
  --
  -- ⚠️ THIS IS THE ONLY PLACE IN THE REPOSITORY THAT DISABLES THAT TRIGGER, and
  -- it is confined to a DEV container, to rows this fixture wrote (matched on
  -- its own marker text), and re-enabled in the same transaction so a failure
  -- rolls the whole thing back rather than leaving the guard off. It exists so
  -- the approval path can be re-verified on demand; nothing else may do it.
  ALTER TABLE repair.repair_proposals DISABLE TRIGGER trg_proposals_immutable;

  UPDATE repair.repair_proposals
     SET status = 'issued', decision = NULL, approved_option = NULL,
         decided_at = NULL, decided_by_name = NULL, decision_channel = NULL,
         decision_note = NULL, recorded_by = NULL, superseded_by = NULL,
         updated_at = now()
   WHERE job_card_id = card AND tenant_id = ten
     AND decision IS NOT NULL
     -- ONLY this fixture's own rows. A real proposal answered by a real
     -- customer must never be silently un-answered, not even in dev.
     AND expected_result = 'The rough idle is corrected and the vehicle idles within specification.'
     -- 🔴 AND ONLY THE LATEST ONE. Resetting every fixture row un-answered the
     -- whole history at once, so several versions read `issued` together — the
     -- customer screen then offered two proposals, answering one left the other
     -- waiting, and the verify run failed on a state the fixture had created.
     -- The product allows exactly one answerable version per card; a fixture
     -- that produces more is not seeding, it is corrupting.
     AND version_no = (SELECT max(version_no) FROM repair.repair_proposals
                        WHERE job_card_id = card AND tenant_id = ten);

  ALTER TABLE repair.repair_proposals ENABLE TRIGGER trg_proposals_immutable;

  -- 🔴 IF ONE IS ALREADY WAITING, REUSE IT. DO NOT ADD ANOTHER.
  --
  -- The first version of this script always inserted the next version and only
  -- set `superseded_by` on the previous one — leaving the previous row at
  -- status `issued`. Two runs therefore produced TWO answerable proposals on
  -- one card, which the real flow cannot produce at all: `prepare()` refuses a
  -- new version while one is still with the customer ("version N is with the
  -- customer and has not been answered").
  --
  -- So the fixture was manufacturing a state the product forbids, and then the
  -- verify run failed on it — a harness defect wearing a product defect's
  -- clothes, which is 7 of the 11 "defects" one day in this repo turned out to
  -- be. Seeding must reproduce reality, not merely populate a table.
  -- ⚠️ `superseded_by IS NULL` TOO — the same definition of "answerable" the
  -- API uses for `decidable`. Testing only on status found a SUPERSEDED row
  -- still marked `issued`, declared the card already covered, and seeded
  -- nothing — so the verify run fell back to its "nothing is waiting" branch
  -- and passed without ever exercising the form. A fixture whose idea of
  -- "ready" differs from the product's is how a suite goes green on an empty
  -- shop.
  IF EXISTS (SELECT 1 FROM repair.repair_proposals
              WHERE job_card_id = card AND tenant_id = ten
                AND status = 'issued' AND superseded_by IS NULL) THEN
    UPDATE repair.job_cards
       SET stage = 'awaiting_customer_approval', stage_changed_at = now()
     WHERE id = card AND tenant_id = ten;
    RAISE NOTICE 'a proposal is already awaiting an answer on card % — reused, none added', card;
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

  -- §424: the previous version points at its replacement rather than being
  -- edited or deleted. Only `superseded_by` is writable on a decided proposal,
  -- and that is deliberate — see migration 017.
  -- 🔴 STATUS TOO, NOT JUST THE POINTER. Setting `superseded_by` alone leaves
  -- the old row reading `issued`, which is precisely the impossible pair the
  -- service now refuses — `status = 'issued'` AND `superseded_by IS NOT NULL`.
  -- The first version of this script did exactly that and manufactured a state
  -- the product cannot produce, which then failed the verify run as if it were
  -- a product defect. `ProposalService.prepare()` sets both; so does this.
  -- ⚠️ NEVER an APPROVED row. `prepare()` refuses to supersede one, and the
  -- CHECK constraint forbids `status='superseded'` while `approved_option` is
  -- set — so writing that pair would both corrupt the model and fail. Mirrors
  -- the product exactly: supersede only what the product would supersede.
  IF latest > 0 THEN
    UPDATE repair.repair_proposals
       SET superseded_by = new_id, status = 'superseded'
     WHERE job_card_id = card AND tenant_id = ten AND version_no = latest
       AND status NOT IN ('approved', 'superseded');
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
