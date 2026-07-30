/**
 * Probe the diagnosis endpoints with REAL Keycloak access tokens — Phase 5, slice 3b.
 *
 * WHY THIS EXISTS. A form that hides a button proves nothing about what the API
 * accepts, and this slice's most important rules are refusals: a diagnosis with no
 * findings, a new attempt while the last one awaits review, and a reviewer who is
 * the submitter. None of those can be demonstrated by rendering a page.
 *
 * ── IT NEEDS TWO IDENTITIES, WHICH IS THE WHOLE POINT ──────────────────────
 *
 * §1292's review is only real if the person who wrote the diagnosis cannot sign it
 * off (`2.txt` §563). Proving that needs a technician session AND a supervisor
 * session held at the same time, so both are captured to separate seam files and
 * this probe switches between them. A single-session probe would assert the role
 * check and silently skip the identity check — which is the half that a role list
 * cannot express.
 *
 * ── WHY IT LIVES HERE AND NOT IN `apps/e2e` ────────────────────────────────
 *
 * It needs `next-auth/jwt` to decrypt the captured session, and under pnpm's
 * isolated store that only resolves from `packages/auth` — the same seam
 * `probe-inspection.mjs` documents. It also needs FULL response bodies, which
 * `call-api-as.mjs` truncates to 400 characters for review notes.
 *
 *   (cd apps/api && node dist/main.js)
 *   (cd apps/e2e && node verify/capture-session.mjs --url http://localhost:3001 \
 *        --user technician@autoworkshop.local --out .verify-tech-cookies.json)
 *   (cd apps/e2e && node verify/capture-session.mjs --url http://localhost:3001 \
 *        --user supervisor@autoworkshop.local --out .verify-sup-cookies.json)
 *   (cd packages/auth && node verify/probe-diagnosis.mjs --card JC-000003)
 *
 * Re-runnable: each run records a new ATTEMPT rather than editing an old one — which
 * is what the domain does anyway, so repeated runs cannot corrupt the data they
 * measure. Where a previous run left state behind, the probe ADOPTS it and says
 * which assertions it therefore could not exercise, rather than reporting its own
 * leftovers as a defect.
 *
 * DEV ONLY — it decrypts local sessions and refuses to run without an explicit
 * secret, so it cannot be pointed at a deployed environment by accident.
 */
import { readFileSync } from 'node:fs';
import { getToken } from 'next-auth/jwt';

const SECRET = process.env['AUTH_SECRET'];
if (!SECRET) {
  console.error('AUTH_SECRET must be set (source the repo .env)');
  process.exit(2);
}

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};

const JOB_NUMBER = flag('--card', 'JC-000003');
const base = process.env['API_BASE_URL'] ?? 'http://localhost:4000';

/** Decrypt one captured session into a bearer token. */
async function tokenFrom(file) {
  const cookies = JSON.parse(readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf-8'));
  const header = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const token = await getToken({
    req: { headers: new Headers({ cookie: header }) },
    secret: SECRET,
    // The captured session came from http://localhost, so Auth.js used the
    // NON-secure cookie name. Getting this wrong reads as "no session" rather than
    // as an error — the defect found on 2026-07-28.
    secureCookie: false,
  });
  const accessToken = token?.keycloak?.accessToken;
  if (!accessToken) {
    console.error(`NO access token in ${file} — nothing can be proven`);
    process.exit(2);
  }
  return accessToken;
}

const TECH = await tokenFrom(flag('--tech-session', '.verify-tech-cookies.json'));
const SUP = await tokenFrom(flag('--sup-session', '.verify-sup-cookies.json'));

async function call(who, path, method = 'GET', body) {
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${who}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, json, text };
}

let failures = 0;
let checks = 0;
function check(label, condition, detail) {
  checks += 1;
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${detail}`);
  }
}

// ── locate the card ─────────────────────────────────────────────────────────

const cards = await call(TECH, '/job-cards');
if (cards.status !== 200 || !Array.isArray(cards.json)) {
  console.error(`could not list job cards (HTTP ${cards.status}): ${cards.text.slice(0, 300)}`);
  process.exit(2);
}
const card = cards.json.find((c) => c.jobNumber === JOB_NUMBER);
if (!card) {
  console.error(`${JOB_NUMBER} is not visible to this session — is it assigned to this technician?`);
  process.exit(2);
}
console.log(`card ${card.jobNumber} (${card.registrationNumber}) at '${card.stage}'\n`);

// ── 1. the card must have reached diagnosis ─────────────────────────────────

console.log('1. a diagnosis only exists once the card has reached diagnosis');
if (card.stage !== 'diagnosis_in_progress') {
  const refused = await call(TECH, `/job-cards/${card.id}/diagnoses`, 'POST', {});
  check(
    `start refused at '${card.stage}' with 400`,
    refused.status === 400 &&
      /may only be started while the job card is at/.test(refused.json?.message ?? ''),
    `HTTP ${refused.status} ${refused.text.slice(0, 200)}`,
  );

  // Walk the card to diagnosis through the REAL stage machine, one legal hop at a
  // time — never by writing the column. A shortcut here would prove the diagnosis
  // rules against a state the lifecycle cannot actually produce.
  for (const stage of ['vehicle_received', 'initial_inspection', 'diagnosis_in_progress']) {
    const moved = await call(TECH, `/job-cards/${card.id}/stage`, 'PATCH', { toStage: stage });
    if (moved.status === 200) {
      console.log(`  ....  moved to '${stage}'`);
      card.stage = stage;
    }
  }
  check('card reached diagnosis_in_progress', card.stage === 'diagnosis_in_progress', card.stage);
} else {
  console.log('  ....  card already at diagnosis_in_progress (re-run) — stage refusal not re-proven');
}

// ── 2. start ────────────────────────────────────────────────────────────────

console.log('\n2. starting a diagnosis');
const existing = await call(TECH, `/job-cards/${card.id}/diagnoses`);
const open = Array.isArray(existing.json)
  ? existing.json.find((d) => d.status === 'in_progress')
  : undefined;

let diagnosis;
if (open) {
  console.log(`  ....  adopting the open attempt ${open.attemptNo} from a previous run`);
  diagnosis = open;
} else {
  const started = await call(TECH, `/job-cards/${card.id}/diagnoses`, 'POST', {});
  check(
    'start accepted',
    started.status === 200 || started.status === 201,
    `HTTP ${started.status} ${started.text.slice(0, 300)}`,
  );
  diagnosis = started.json;
  if (!diagnosis?.id) {
    console.error('no diagnosis returned — cannot continue');
    process.exit(1);
  }
  // ⚠️ EMPTY IS THE CORRECT START. Unlike an inspection there is no template to
  // pre-create — the findings are what the diagnosis discovers. That is exactly why
  // the zero-findings submission gate in §5 matters more here than it did in 3a.
  check('starts with NO findings', diagnosis.findings?.length === 0, String(diagnosis.findings?.length));
  check('status is in_progress', diagnosis.status === 'in_progress', diagnosis.status);
}
check('editable for the assigned technician', diagnosis.editable === true);
check('NOT reviewable while in progress', diagnosis.reviewable === false);

// ── 3. a second OPEN diagnosis is refused ──────────────────────────────────

console.log('\n3. a second OPEN diagnosis is refused');
const second = await call(TECH, `/job-cards/${card.id}/diagnoses`, 'POST', {});
check(
  'refused with 409',
  second.status === 409 && /already has a diagnosis in progress/.test(second.json?.message ?? ''),
  `HTTP ${second.status} ${second.text.slice(0, 200)}`,
);

// ── 4. recording findings ──────────────────────────────────────────────────

console.log('\n4. recording findings — §3026-§3046');

const noDescription = await call(TECH, `/diagnoses/${diagnosis.id}/findings`, 'POST', {
  affectedSystem: 'electrical',
});
check(
  'a finding with no description is refused with 400',
  noDescription.status === 400 && /faultDescription/.test(noDescription.json?.message ?? ''),
  `HTTP ${noDescription.status} ${noDescription.text.slice(0, 200)}`,
);

const badSystem = await call(TECH, `/diagnoses/${diagnosis.id}/findings`, 'POST', {
  faultDescription: 'Misfire',
  affectedSystem: 'gremlins',
});
check(
  'an affected system outside §9 is refused with 400',
  badSystem.status === 400 && /affectedSystem must be one of/.test(badSystem.json?.message ?? ''),
  `HTTP ${badSystem.status} ${badSystem.text.slice(0, 200)}`,
);

const added = await call(TECH, `/diagnoses/${diagnosis.id}/findings`, 'POST', {
  faultDescription: 'Cylinder 1 ignition coil open circuit',
  affectedSystem: 'electrical',
  faultCode: 'P0301',
  observedSymptom: 'Rough idle, misfire under load',
  testPerformed: 'Coil primary resistance across pins 1-2',
  expectedResult: '0.4-0.6 ohm',
  actualResult: 'Open circuit',
  interpretation: 'Coil pack has failed open',
  findingStatus: 'confirmed',
});
check('finding accepted', added.status === 200 || added.status === 201, `HTTP ${added.status} ${added.text.slice(0, 300)}`);
const confirmed = added.json?.findings?.find((f) => f.faultCode === 'P0301');
check('recorded as confirmed', confirmed?.findingStatus === 'confirmed', confirmed?.findingStatus);
// §1294 made structural: a confirmed fault can always answer "who says so".
check('a confirmed finding NAMES its confirmer', typeof confirmed?.confirmedByName === 'string' && confirmed.confirmedByName.length > 0, String(confirmed?.confirmedByName));
check('source is technician, never taken from the caller', confirmed?.source === 'technician', confirmed?.source);

// §1294 — the caller must not be able to name its own source.
const spoofed = await call(TECH, `/diagnoses/${diagnosis.id}/findings`, 'POST', {
  faultDescription: 'Attempted AI-sourced finding',
  affectedSystem: 'other',
  source: 'ai_suggestion',
});
const spoofedRow = spoofed.json?.findings?.find((f) => f.faultDescription === 'Attempted AI-sourced finding');
check(
  '§1294: a caller CANNOT file a finding as an AI suggestion',
  spoofedRow?.source === 'technician',
  `source came back as ${spoofedRow?.source}`,
);

// §1290 — a fault RULED OUT is a finding too.
const excluded = await call(TECH, `/diagnoses/${diagnosis.id}/findings`, 'POST', {
  faultDescription: 'Fuel injector 1 blockage',
  affectedSystem: 'fluid_thermal',
  testPerformed: 'Injector flow test',
  actualResult: 'Within spec',
  findingStatus: 'excluded',
});
const excludedRow = excluded.json?.findings?.find((f) => f.findingStatus === 'excluded');
check('§1290: an EXCLUDED fault can be recorded', excludedRow !== undefined);
check('an excluded finding names NO confirmer', excludedRow?.confirmedByName === null, String(excludedRow?.confirmedByName));

// ── 5. correcting a finding, including CLEARING a field ────────────────────

console.log('\n5. correcting a finding — the Codex MEDIUM fix');

const cleared = await call(
  TECH,
  `/diagnoses/${diagnosis.id}/findings/${excludedRow.id}`,
  'PATCH',
  // `null` means CLEAR. Before the fix this was indistinguishable from "omitted",
  // so a wrong value could be overwritten but never removed.
  { faultCode: null, actualResult: null },
);
const clearedRow = cleared.json?.findings?.find((f) => f.id === excludedRow.id);
check('a nullable field can be CLEARED', clearedRow?.actualResult === null, String(clearedRow?.actualResult));
check('the untouched fields survive the clear', clearedRow?.testPerformed === 'Injector flow test', String(clearedRow?.testPerformed));
check('the standing survives an unrelated edit', clearedRow?.findingStatus === 'excluded', clearedRow?.findingStatus);

const cannotClear = await call(
  TECH,
  `/diagnoses/${diagnosis.id}/findings/${excludedRow.id}`,
  'PATCH',
  { faultDescription: '' },
);
check(
  'fault_description CANNOT be cleared — 400, not a 500 from the constraint',
  cannotClear.status === 400 && /faultDescription/.test(cannotClear.json?.message ?? ''),
  `HTTP ${cannotClear.status} ${cannotClear.text.slice(0, 200)}`,
);

// The signature must move in BOTH directions.
const downgraded = await call(
  TECH,
  `/diagnoses/${diagnosis.id}/findings/${confirmed.id}`,
  'PATCH',
  { findingStatus: 'suspected' },
);
const downgradedRow = downgraded.json?.findings?.find((f) => f.id === confirmed.id);
check(
  'downgrading from confirmed CLEARS the confirmer',
  downgradedRow?.confirmedByName === null && downgradedRow?.confirmedAt === null,
  `${downgradedRow?.confirmedByName} / ${downgradedRow?.confirmedAt}`,
);
const repromoted = await call(
  TECH,
  `/diagnoses/${diagnosis.id}/findings/${confirmed.id}`,
  'PATCH',
  { findingStatus: 'confirmed' },
);
const repromotedRow = repromoted.json?.findings?.find((f) => f.id === confirmed.id);
check(
  're-confirming stamps the confirmer again',
  typeof repromotedRow?.confirmedByName === 'string' && repromotedRow.confirmedByName.length > 0,
  String(repromotedRow?.confirmedByName),
);

// ── 6. removing a finding entered in error ─────────────────────────────────

console.log('\n6. a finding entered in error can be removed — migration 013');
const throwaway = await call(TECH, `/diagnoses/${diagnosis.id}/findings`, 'POST', {
  faultDescription: 'Entered in error, to be removed',
  affectedSystem: 'other',
});
const throwawayRow = throwaway.json?.findings?.find(
  (f) => f.faultDescription === 'Entered in error, to be removed',
);
check('the throwaway finding was created', throwawayRow !== undefined);
const removed = await call(
  TECH,
  `/diagnoses/${diagnosis.id}/findings/${throwawayRow.id}`,
  'DELETE',
);
check('remove accepted', removed.status === 200, `HTTP ${removed.status} ${removed.text.slice(0, 200)}`);
check(
  'and the row is actually GONE — not a silently skipped delete',
  removed.json?.findings?.every((f) => f.id !== throwawayRow.id) === true,
);
const removeAgain = await call(
  TECH,
  `/diagnoses/${diagnosis.id}/findings/${throwawayRow.id}`,
  'DELETE',
);
check(
  'removing it twice is a 404, not a silent success',
  removeAgain.status === 404,
  `HTTP ${removeAgain.status}`,
);

// ── 7. submission ──────────────────────────────────────────────────────────

console.log('\n7. submission — §1292');

// ⚠️ THE ZERO-FINDINGS GATE IS PROVEN IN §10, NOT HERE, and deliberately so.
//
// It needs a diagnosis that HAS no findings, and this one has several by now. The
// first version of this probe looked for a SPARE CARD already sitting at diagnosis,
// which on a normal seeded database does not exist — so the single most important
// gate in the slice printed "NOT exercised this run" and the probe still said
// 47/47. A conditional check that usually skips is a check that is not there;
// §10 exercises it against the empty attempt §9 creates, which the probe makes
// itself and can therefore always rely on.

const submitted = await call(TECH, `/diagnoses/${diagnosis.id}/submit`, 'POST', {});
check('submit accepted', submitted.status === 200 || submitted.status === 201, `HTTP ${submitted.status} ${submitted.text.slice(0, 300)}`);
check('status is submitted', submitted.json?.status === 'submitted', submitted.json?.status);
check('no longer editable', submitted.json?.editable === false);
check(
  'the SUBMITTER may not review their own diagnosis',
  submitted.json?.reviewable === false,
  String(submitted.json?.reviewable),
);

const frozen = await call(TECH, `/diagnoses/${diagnosis.id}/findings`, 'POST', {
  faultDescription: 'Added after submission',
  affectedSystem: 'other',
});
check(
  'findings are FROZEN after submission — 409',
  frozen.status === 409 && /cannot be changed/.test(frozen.json?.message ?? ''),
  `HTTP ${frozen.status} ${frozen.text.slice(0, 200)}`,
);
check(
  'and the refusal names a REACHABLE alternative',
  /start a new diagnosis/.test(frozen.json?.message ?? ''),
  frozen.json?.message,
);

const frozenDelete = await call(
  TECH,
  `/diagnoses/${diagnosis.id}/findings/${excludedRow.id}`,
  'DELETE',
);
check(
  'a submitted diagnosis findings cannot be DELETED either — 409',
  frozenDelete.status === 409,
  `HTTP ${frozenDelete.status} ${frozenDelete.text.slice(0, 200)}`,
);

// ⚠️ THE CODEX HIGH FINDING. Starting a new attempt while the last awaits review
// would make the submitted one stop being "the current record" in every queue.
const jumpQueue = await call(TECH, `/job-cards/${card.id}/diagnoses`, 'POST', {});
check(
  'a NEW ATTEMPT is refused while the last one awaits review — 409',
  jumpQueue.status === 409 && /awaiting supervisor review/.test(jumpQueue.json?.message ?? ''),
  `HTTP ${jumpQueue.status} ${jumpQueue.text.slice(0, 200)}`,
);

// ── 8. the review, and §563's independence ─────────────────────────────────

console.log('\n8. §1292 review — role AND identity');

const techReview = await call(TECH, `/diagnoses/${diagnosis.id}/review`, 'POST', {
  decision: 'approved',
});
check(
  'a TECHNICIAN may not review at all — 403',
  techReview.status === 403 && /may not review a diagnosis/.test(techReview.json?.message ?? ''),
  `HTTP ${techReview.status} ${techReview.text.slice(0, 200)}`,
);

// Now the supervisor — a DIFFERENT person, which is what §563 requires.
const supView = await call(SUP, `/diagnoses/${diagnosis.id}`);
check('the supervisor can read the submitted diagnosis', supView.status === 200, `HTTP ${supView.status}`);
check(
  'and it IS reviewable for them — they did not submit it',
  supView.json?.reviewable === true,
  String(supView.json?.reviewable),
);

const noReason = await call(SUP, `/diagnoses/${diagnosis.id}/review`, 'POST', {
  decision: 'rejected',
});
check(
  'a rejection with NO reason is refused with 400',
  noReason.status === 400 && /must give a reason/.test(noReason.json?.message ?? ''),
  `HTTP ${noReason.status} ${noReason.text.slice(0, 200)}`,
);

const approved = await call(SUP, `/diagnoses/${diagnosis.id}/review`, 'POST', {
  decision: 'approved',
  note: 'Coil test is conclusive. Proceed to repair planning.',
});
check('the supervisor may approve', approved.status === 200 || approved.status === 201, `HTTP ${approved.status} ${approved.text.slice(0, 300)}`);
check('status is approved', approved.json?.status === 'approved', approved.json?.status);
check('the reviewer is NAMED on the record', typeof approved.json?.reviewedByName === 'string' && approved.json.reviewedByName.length > 0, String(approved.json?.reviewedByName));
check(
  'and the submitter is STILL named separately',
  typeof approved.json?.submittedByName === 'string' && approved.json.submittedByName.length > 0,
  String(approved.json?.submittedByName),
);

const reviewTwice = await call(SUP, `/diagnoses/${diagnosis.id}/review`, 'POST', {
  decision: 'rejected',
  note: 'changed my mind',
});
check(
  'a settled diagnosis cannot be re-reviewed — 409',
  reviewTwice.status === 409 && /already approved/.test(reviewTwice.json?.message ?? ''),
  `HTTP ${reviewTwice.status} ${reviewTwice.text.slice(0, 200)}`,
);

const editSettled = await call(TECH, `/diagnoses/${diagnosis.id}`, 'PATCH', { summary: 'late edit' });
check(
  'and it cannot be edited afterwards either — 409',
  editSettled.status === 409,
  `HTTP ${editSettled.status} ${editSettled.text.slice(0, 200)}`,
);

// ── 9. a new attempt IS allowed once settled ───────────────────────────────

console.log('\n9. once settled, a further opinion is a new attempt');
const newAttempt = await call(TECH, `/job-cards/${card.id}/diagnoses`, 'POST', {});
check(
  'a new attempt is accepted after the review',
  newAttempt.status === 200 || newAttempt.status === 201,
  `HTTP ${newAttempt.status} ${newAttempt.text.slice(0, 200)}`,
);
check(
  'and its attempt number advanced',
  (newAttempt.json?.attemptNo ?? 0) > diagnosis.attemptNo,
  `${diagnosis.attemptNo} -> ${newAttempt.json?.attemptNo}`,
);

// ── 10. the zero-findings gate ─────────────────────────────────────────────

console.log('\n10. a diagnosis that says nothing cannot be submitted');

// The attempt §9 just created is EMPTY, which is exactly the state this gate exists
// for — and it exists because a diagnosis legitimately starts empty, unlike an
// inspection where the template is written with the header. Slice 3a shipped the
// mirror image of this hole (a vacuous "is any checkpoint unanswered" over zero
// checkpoints) and only the Supervisor caught it.
if (newAttempt.json?.id) {
  check(
    'the new attempt really is empty',
    newAttempt.json.findings?.length === 0,
    String(newAttempt.json.findings?.length),
  );
  const empty = await call(TECH, `/diagnoses/${newAttempt.json.id}/submit`, 'POST', {});
  check(
    'submitting it is refused with 400',
    empty.status === 400 && /no findings recorded/.test(empty.json?.message ?? ''),
    `HTTP ${empty.status} ${empty.text.slice(0, 200)}`,
  );
  // Without this sentence the refusal reads as "you must find something wrong",
  // which invents faults. §1290's `excluded` is the honest way past it.
  check(
    'and the refusal says a ruled-out fault counts as a finding',
    /excluded/.test(empty.json?.message ?? ''),
    empty.json?.message,
  );

  // Then the way past it, so the gate is a rule and not a wall.
  await call(TECH, `/diagnoses/${newAttempt.json.id}/findings`, 'POST', {
    faultDescription: 'Secondary ignition harness chafing',
    affectedSystem: 'electrical',
    findingStatus: 'suspected',
  });
  const nowOk = await call(TECH, `/diagnoses/${newAttempt.json.id}/submit`, 'POST', {});
  check(
    'and it submits once ONE finding exists',
    nowOk.status === 200 || nowOk.status === 201,
    `HTTP ${nowOk.status} ${nowOk.text.slice(0, 200)}`,
  );
} else {
  // Loud, not a skip. A gate that reports "not exercised" and still counts toward a
  // green total is the green-gate-that-runs-nothing failure in miniature.
  failures += 1;
  checks += 1;
  console.log('  FAIL  no new attempt to test the zero-findings gate against');
}

// ── summary ────────────────────────────────────────────────────────────────

console.log(`\n${checks - failures}/${checks} passed`);
process.exit(failures === 0 ? 0 : 1);
