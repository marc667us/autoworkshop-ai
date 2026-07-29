/**
 * Probe the inspection endpoints with REAL Keycloak access tokens — Phase 5,
 * slice 3a.
 *
 * WHY THIS EXISTS. `.claude/CURRENT_TASK.md` states the rule this slice inherits
 * from slice 2: "Prove endpoints with `call-api-as.mjs`, not with the screen. A
 * board that declines to OFFER a move proves nothing about what the API
 * accepts." The same holds here — a form that hides its submit button says
 * nothing about whether the API would accept an incomplete inspection.
 *
 * ── WHY IT LIVES HERE AND NOT IN `apps/e2e` ────────────────────────────────
 *
 * It needs `next-auth/jwt` to decrypt the captured session, and under pnpm's
 * isolated store that only resolves from `packages/auth` — the same seam
 * `call-api-as.mjs` and `try-refresh.mjs` document. It also needs the FULL
 * response body, which `call-api-as.mjs` deliberately truncates to 400 characters
 * because its output is pasted into review notes. So it does its own fetch rather
 * than shelling out to that tool and parsing a summary.
 *
 *   (cd apps/api && node dist/main.js)
 *   (cd apps/e2e && node verify/capture-session.mjs --url http://localhost:3001 \
 *        --user technician@autoworkshop.local)
 *   (cd packages/auth && node verify/probe-inspection.mjs --card JC-000003)
 *
 * Re-runnable: it works from whatever stage the card is at, and each run records
 * a new ATTEMPT rather than editing an old one — which is what the domain does
 * anyway, so repeated runs cannot corrupt the data they measure.
 *
 * DEV ONLY — it decrypts a local session and refuses to run without an explicit
 * secret, so it cannot be pointed at a deployed environment by accident.
 */
import { readFileSync } from 'node:fs';
import { getToken } from 'next-auth/jwt';

const SEAM = new URL('../../../.verify-session-cookies.json', import.meta.url);

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

const cookies = JSON.parse(readFileSync(SEAM, 'utf-8'));
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
  console.error('NO access token in the captured session — nothing can be proven');
  process.exit(2);
}

async function call(path, method = 'GET', body) {
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
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

const cards = await call('/job-cards');
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

// ── 1. the vehicle must be present ──────────────────────────────────────────

console.log('1. an inspection only exists once the vehicle is present');
if (card.stage !== 'initial_inspection') {
  const refused = await call(`/job-cards/${card.id}/inspections`, 'POST', {});
  check(
    `start refused at '${card.stage}' with 400`,
    refused.status === 400 &&
      /may only be started while the job card is at/.test(refused.json?.message ?? ''),
    `HTTP ${refused.status} ${refused.text.slice(0, 200)}`,
  );
  const moved = await call(`/job-cards/${card.id}/stage`, 'PATCH', { toStage: 'initial_inspection' });
  check('technician may move the card to initial_inspection', moved.status === 200, `HTTP ${moved.status}`);
} else {
  console.log('  ....  card already at initial_inspection (re-run) — stage refusal not re-proven');
}

// ── 2. start ────────────────────────────────────────────────────────────────

console.log('\n2. starting the sheet writes the whole checklist');

/**
 * A sheet already open on this card is ADOPTED rather than treated as a failure.
 *
 * The service refuses a second open inspection — correctly, and §3 below proves
 * it — so a probe that always POSTs would fail on its second run against the
 * same card and report a defect that is really its own leftover state. Adopting
 * keeps the run honest AND re-runnable, and it says which assertions it could not
 * exercise instead of quietly skipping them.
 */
const existing = await call(`/job-cards/${card.id}/inspections`);
const open = Array.isArray(existing.json)
  ? existing.json.find((i) => i.status === 'in_progress')
  : undefined;

let sheet;
if (open) {
  console.log(`  ....  adopting the open attempt ${open.attemptNo} from a previous run`);
  console.log('        (start-time assertions below are re-checked against it)');
  sheet = open;
  check('the adopted sheet has 19 checkpoints', sheet.items?.length === 19, `got ${sheet.items?.length}`);
  check('editable for the assigned technician', sheet.editable === true);
} else {
  const started = await call(`/job-cards/${card.id}/inspections`, 'POST', { mileageReading: 84950 });
  check(
    'start accepted',
    started.status === 200 || started.status === 201,
    `HTTP ${started.status} ${started.text.slice(0, 300)}`,
  );
  sheet = started.json;
  if (!sheet?.id) {
    console.error('no inspection returned — cannot continue');
    process.exit(1);
  }
  check('19 checkpoints created', sheet.items?.length === 19, `got ${sheet.items?.length}`);
  check('every result starts NULL', sheet.items.every((i) => i.result === null));
  check('answeredCount is 0', sheet.answeredCount === 0, String(sheet.answeredCount));
  check('mileage recorded as sent', sheet.mileageReading === 84950, String(sheet.mileageReading));
  check('editable for the assigned technician', sheet.editable === true);
}
check(
  'first checkpoint is §2930 Vehicle identification',
  sheet.items[0]?.label === 'Vehicle identification',
  sheet.items[0]?.label,
);
check(
  'last checkpoint is §2966 Roadworthiness concerns',
  sheet.items[18]?.label === 'Roadworthiness concerns',
  sheet.items[18]?.label,
);

// ── 3. one open sheet at a time ─────────────────────────────────────────────

console.log('\n3. a second OPEN sheet is refused');
const second = await call(`/job-cards/${card.id}/inspections`, 'POST', {});
check(
  'refused with 409',
  second.status === 409 && /already has an inspection in progress/.test(second.json?.message ?? ''),
  `HTTP ${second.status} ${second.text.slice(0, 200)}`,
);

// ── 4. recording ────────────────────────────────────────────────────────────

console.log('\n4. recording results');
const bad = await call(`/inspections/${sheet.id}/items`, 'PATCH', {
  items: [{ checkpointCode: 'flux_capacitor', result: 'fail' }],
});
check(
  'an unknown checkpoint is refused with 400',
  bad.status === 400 && /not a checkpoint on this checklist/.test(bad.json?.message ?? ''),
  `HTTP ${bad.status} ${bad.text.slice(0, 200)}`,
);

const badResult = await call(`/inspections/${sheet.id}/items`, 'PATCH', {
  items: [{ checkpointCode: 'brakes', result: 'probably_fine' }],
});
check('a result outside the four answers is refused', badResult.status === 400, `HTTP ${badResult.status}`);

const dupe = await call(`/inspections/${sheet.id}/items`, 'PATCH', {
  items: [
    { checkpointCode: 'brakes', result: 'pass' },
    { checkpointCode: 'brakes', result: 'fail' },
  ],
});
check(
  'the same checkpoint twice in one request is refused',
  dupe.status === 400 && /appears more than once/.test(dupe.json?.message ?? ''),
  `HTTP ${dupe.status}`,
);

const partial = await call(`/inspections/${sheet.id}/items`, 'PATCH', {
  items: [
    { checkpointCode: 'brakes', result: 'fail', note: 'Pads at 2mm, discs scored.' },
    { checkpointCode: 'tyres', result: 'requires_testing' },
    { checkpointCode: 'air_conditioning', result: 'not_applicable' },
  ],
});
check('three results recorded', partial.status === 200, `HTTP ${partial.status} ${partial.text.slice(0, 200)}`);
check('answeredCount is 3', partial.json?.answeredCount === 3, String(partial.json?.answeredCount));
check(
  'findingCount counts fail AND requires_testing, not not_applicable',
  partial.json?.findingCount === 2,
  String(partial.json?.findingCount),
);

// ── 5. the completeness gate ────────────────────────────────────────────────

console.log('\n5. an incomplete sheet cannot be submitted');
const early = await call(`/inspections/${sheet.id}/submit`, 'POST', {});
check(
  'refused with 400 naming the count',
  early.status === 400 && /16 checkpoint\(s\) unanswered/.test(early.json?.message ?? ''),
  `HTTP ${early.status} ${early.text.slice(0, 300)}`,
);
check(
  'the message NAMES the checkpoints, not just the count',
  /Engine condition/.test(early.json?.message ?? ''),
  early.json?.message?.slice(0, 200),
);
check(
  'and says how to legitimately pass one by',
  /not applicable/i.test(early.json?.message ?? ''),
);

// ── 6. complete and submit ──────────────────────────────────────────────────

console.log('\n6. completing and submitting');
const rest = sheet.items
  .filter((i) => !['brakes', 'tyres', 'air_conditioning'].includes(i.checkpointCode))
  .map((i) => ({ checkpointCode: i.checkpointCode, result: 'pass' }));
const filled = await call(`/inspections/${sheet.id}/items`, 'PATCH', {
  items: rest,
  summary: 'Roadworthy apart from the braking system. Front pads and discs need replacing.',
});
check(
  'the remaining 16 recorded',
  filled.status === 200 && filled.json?.answeredCount === 19,
  `HTTP ${filled.status} answered ${filled.json?.answeredCount}`,
);

const submitted = await call(`/inspections/${sheet.id}/submit`, 'POST', {});
check(
  'submit accepted',
  submitted.status === 200 || submitted.status === 201,
  `HTTP ${submitted.status} ${submitted.text.slice(0, 200)}`,
);
check('status is submitted', submitted.json?.status === 'submitted', submitted.json?.status);
check('editable is now FALSE', submitted.json?.editable === false, String(submitted.json?.editable));
check('submittedAt is set', Boolean(submitted.json?.submittedAt), String(submitted.json?.submittedAt));
check('submittedByName is attributed', Boolean(submitted.json?.submittedByName), String(submitted.json?.submittedByName));

// ── 7. immutability ────────────────────────────────────────────────────────

console.log('\n7. a submitted sheet is immutable through the API');
const tamper = await call(`/inspections/${sheet.id}/items`, 'PATCH', {
  items: [{ checkpointCode: 'brakes', result: 'pass' }],
});
check(
  'writing to it is refused with 409',
  tamper.status === 409 && /submitted and cannot be changed/.test(tamper.json?.message ?? ''),
  `HTTP ${tamper.status} ${tamper.text.slice(0, 200)}`,
);
const resubmit = await call(`/inspections/${sheet.id}/submit`, 'POST', {});
check('re-submitting is refused with 409', resubmit.status === 409, `HTTP ${resubmit.status}`);

const readBack = await call(`/inspections/${sheet.id}`);
const brakes = readBack.json?.items?.find((i) => i.checkpointCode === 'brakes');
check('the brakes result is still FAIL, not the tampered pass', brakes?.result === 'fail', brakes?.result);
check('the note survived', /2mm/.test(brakes?.note ?? ''), brakes?.note);
check('the summary survived', /braking system/.test(readBack.json?.summary ?? ''), readBack.json?.summary);

// ── 8. attempts ────────────────────────────────────────────────────────────

console.log('\n8. a second look is a NEW attempt, not an edit');
const again = await call(`/job-cards/${card.id}/inspections`, 'POST', {});
check('a new inspection may be started', again.status === 200 || again.status === 201, `HTTP ${again.status}`);
check('it is attempt 2 or later', (again.json?.attemptNo ?? 0) >= 2, String(again.json?.attemptNo));
check('with a fresh, unanswered checklist', again.json?.answeredCount === 0, String(again.json?.answeredCount));

const history = await call(`/job-cards/${card.id}/inspections`);
check('every attempt is readable', (history.json?.length ?? 0) >= 2, String(history.json?.length));
check(
  'newest attempt first',
  (history.json?.[0]?.attemptNo ?? 0) > (history.json?.[1]?.attemptNo ?? 99),
  history.json?.map((h) => h.attemptNo).join(','),
);
check(
  'the submitted attempt is still submitted and still not editable',
  history.json?.some((h) => h.id === sheet.id && h.status === 'submitted' && h.editable === false),
);

// ── 9. the assignment scope ────────────────────────────────────────────────

console.log('\n9. the technician scope reaches the inspection, not only the card');
check(
  'the job card list contains ONLY their assigned card',
  cards.json.length === 1 && cards.json[0].jobNumber === JOB_NUMBER,
  cards.json.map((c) => c.jobNumber).join(','),
);
const all = await call('/inspections');
check(
  'every inspection returned belongs to that card',
  Array.isArray(all.json) && all.json.every((i) => i.jobCardId === card.id),
  `${all.json?.length} rows`,
);

console.log(
  `\n${failures === 0 ? 'PROBE OK' : `PROBE FAILED — ${failures} of ${checks} checks`}` +
    ` — ${checks - failures}/${checks} passed (read the COUNT, never the exit code)`,
);
process.exit(failures === 0 ? 0 : 1);
