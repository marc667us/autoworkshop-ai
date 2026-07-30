/**
 * Probe the post-repair testing endpoints with REAL Keycloak tokens — Phase 5, slice 8.
 *
 * WHY THIS EXISTS. §35's rule is the one worth proving against a real database:
 * "the repair shall not be marked technically complete where an unresolved critical
 * fault remains WITHOUT DOCUMENTED APPROVAL." That is a CHECK constraint plus a
 * narrower role set, and the only way to show it holds is to try to submit past it —
 * and then to try to approve it as the person who is not allowed to.
 *
 *   (cd packages/auth && node verify/probe-testing.mjs)
 *
 * DEV ONLY — decrypts local sessions, refuses to run without an explicit secret.
 */
import { readFileSync } from 'node:fs';
import { getToken } from 'next-auth/jwt';

const SECRET = process.env['AUTH_SECRET'];
if (!SECRET) {
  console.error('AUTH_SECRET must be set (source the repo .env)');
  process.exit(2);
}
const args = process.argv.slice(2);
const flag = (n, f) => {
  const i = args.indexOf(n);
  return i === -1 ? f : args[i + 1];
};
const base = process.env['API_BASE_URL'] ?? 'http://localhost:4000';
const RUN = `tprobe-${process.pid}`;

async function tokenFrom(file) {
  const cookies = JSON.parse(readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf-8'));
  const header = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const t = await getToken({
    req: { headers: new Headers({ cookie: header }) },
    secret: SECRET,
    // The captured session came from http://localhost, so Auth.js used the NON-secure
    // cookie name. Getting this wrong reads as "no session" rather than as an error.
    secureCookie: false,
  });
  const at = t?.keycloak?.accessToken;
  if (!at) { console.error(`NO access token in ${file}`); process.exit(2); }
  return at;
}

const ADMIN = await tokenFrom(flag('--admin-session', '.verify-admin-cookies.json'));
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
  try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: res.status, json, text };
}

let failures = 0, checks = 0;
function check(label, ok, detail) {
  checks += 1;
  if (ok) console.log(`  PASS  ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${detail}`);
  }
}
const ok2 = (r) => r.status === 200 || r.status === 201;
const message = (r) => (typeof r.json?.message === 'string' ? r.json.message : r.text.slice(0, 300));

// ── locate a card with a COMPLETED repair ───────────────────────────────────

const executions = (await call(ADMIN, '/repair-executions')).json ?? [];
const done = executions.find((e) => e.status === 'completed');
if (!done) {
  console.error('no COMPLETED repair anywhere — run probe-execution.mjs first');
  process.exit(2);
}
const cards = (await call(ADMIN, '/job-cards')).json ?? [];
const card = cards.find((c) => c.id === done.jobCardId);
if (!card) { console.error('the completed repair is on a card this identity cannot see'); process.exit(2); }
console.log(`\nCard ${card.jobNumber} · repair attempt ${done.attemptNo} · run ${RUN}\n`);

// Settle residue so the run repeats.
const prior = ((await call(ADMIN, `/job-cards/${card.id}/test-sessions`)).json ?? [])
  .find((s) => s.status === 'in_progress');
if (prior) {
  console.log(`  note  settling residue: test session attempt ${prior.attemptNo} is open`);
  if (prior.results.length === 0) {
    await call(ADMIN, `/test-sessions/${prior.id}/results`, 'POST', {
      testCategory: 'visual_inspection', testName: 'residue', outcome: 'pass',
    });
  }
  await call(ADMIN, `/test-sessions/${prior.id}/scan`, 'PATCH', { criticalFaultsRemain: false });
  await call(ADMIN, `/test-sessions/${prior.id}/road-test`, 'PATCH', { roadTestPerformed: false });
  const settled = await call(ADMIN, `/test-sessions/${prior.id}/submit`, 'POST', {});
  if (!ok2(settled)) {
    console.error(`could not settle the open session: HTTP ${settled.status} ${message(settled)}`);
    process.exit(2);
  }
}

// ── 1. testing follows a completed repair ───────────────────────────────────

console.log('1. §34 — testing follows a COMPLETED repair');

const started = await call(ADMIN, `/job-cards/${card.id}/test-sessions`, 'POST', {});
check('a test session opens', ok2(started), message(started));
const s = started.json;
if (!s?.id) { console.error('no session'); process.exit(2); }
check('it records WHICH repair it tests', s.executionId === done.id, s.executionId);

const second = await call(ADMIN, `/job-cards/${card.id}/test-sessions`, 'POST', {});
check('a second session is refused while one is open', second.status === 409, `HTTP ${second.status}`);

// ── 2. §34's results ────────────────────────────────────────────────────────

console.log('\n2. §34 — the fourteen fields, and what a failure must say');

const bareFail = await call(ADMIN, `/test-sessions/${s.id}/results`, 'POST', {
  testCategory: 'brake', testName: `${RUN} brake efficiency`, outcome: 'fail',
});
check(
  '⚠️ a FAILED test with no actual result and no comment is refused',
  bareFail.status === 400 && /cannot act on/.test(message(bareFail)),
  `HTTP ${bareFail.status}: ${message(bareFail)}`,
);

const badCategory = await call(ADMIN, `/test-sessions/${s.id}/results`, 'POST', {
  testCategory: 'vibes', testName: 'x', outcome: 'pass',
});
check('a category outside §34s eighteen is refused', badCategory.status === 400, `HTTP ${badCategory.status}`);

const pass = await call(ADMIN, `/test-sessions/${s.id}/results`, 'POST', {
  testCategory: 'diagnostic_scan',
  testName: `${RUN} post-repair scan`,
  testEquipment: 'Autel MS906',
  equipmentIdentifier: 'AUTEL-004',
  calibrationStatus: 'Calibrated 2026-06-01',
  expectedResult: 'No stored codes',
  actualResult: 'No stored codes',
  outcome: 'pass',
});
check('a passing test is recorded', ok2(pass), message(pass));
check(
  '§34 — the calibration status is kept, not dropped as bureaucracy',
  pass.json?.results?.some((r) => r.calibrationStatus === 'Calibrated 2026-06-01'),
);

const fail = await call(ADMIN, `/test-sessions/${s.id}/results`, 'POST', {
  testCategory: 'brake',
  testName: `${RUN} brake efficiency`,
  outcome: 'fail',
  actualResult: '48% offside front',
  unitOfMeasurement: '%',
});
check('a failing test with an actual result is accepted', ok2(fail), message(fail));
check(
  'passes and failures are counted separately',
  fail.json?.passCount === 1 && fail.json?.failCount === 1,
  `${fail.json?.passCount} / ${fail.json?.failCount}`,
);

// ── 3. §36's road test ──────────────────────────────────────────────────────

console.log('\n3. §36 — the road test');

const backwards = await call(ADMIN, `/test-sessions/${s.id}/road-test`, 'PATCH', {
  roadTestPerformed: true,
  roadTestDriver: 'A. Technician',
  roadTestStartMileage: 50000,
  roadTestEndMileage: 49990,
  roadTestOutcome: 'symptom_resolved',
});
check(
  'a car cannot come back with fewer miles on it',
  backwards.status === 400 && /lower than the start/.test(message(backwards)),
  `HTTP ${backwards.status}: ${message(backwards)}`,
);

const halfRoadTest = await call(ADMIN, `/test-sessions/${s.id}/road-test`, 'PATCH', {
  roadTestPerformed: true,
  roadTestDriver: 'A. Technician',
  roadTestStartMileage: 50000,
});
check('a partial road test can be saved as a draft', ok2(halfRoadTest), message(halfRoadTest));

const blockedBySubmit = await call(ADMIN, `/test-sessions/${s.id}/submit`, 'POST', {});
check(
  '⚠️ but SUBMISSION refuses half a road test, and names what is missing',
  blockedBySubmit.status === 400 && /end mileage/.test(message(blockedBySubmit)),
  `HTTP ${blockedBySubmit.status}: ${message(blockedBySubmit)}`,
);

const roadTest = await call(ADMIN, `/test-sessions/${s.id}/road-test`, 'PATCH', {
  roadTestPerformed: true,
  roadTestDriver: 'A. Technician',
  roadTestStartMileage: 50000,
  roadTestEndMileage: 50012,
  roadTestRoute: 'Spintex to Tema and back',
  roadTestWeather: 'Dry',
  roadTestOutcome: 'symptom_improved',
});
check('a complete road test is accepted', ok2(roadTest), message(roadTest));
check(
  'and the distance is derived from the odometer pair',
  roadTest.json?.roadTestDistance === 12,
  String(roadTest.json?.roadTestDistance),
);
check(
  '§36 — "improved" survives as its own outcome rather than collapsing to a boolean',
  roadTest.json?.roadTestOutcome === 'symptom_improved',
);

// ── 4. §35 — the rule of this slice ─────────────────────────────────────────

console.log('\n4. §35 — no technical completion with a critical fault, WITHOUT documented approval');

const scan = await call(ADMIN, `/test-sessions/${s.id}/scan`, 'PATCH', {
  scanPerformed: true,
  preRepairFaultCodes: 'P0301, C1234',
  codesCleared: 'P0301',
  codesRemaining: 'C1234',
  newCodes: 'none',
  warningLightStatus: 'ABS lamp still on',
  criticalFaultsRemain: true,
});
check('the scan records a remaining critical fault', ok2(scan), message(scan));
check('and the record says so', scan.json?.criticalFaultsRemain === true);

const blocked = await call(ADMIN, `/test-sessions/${s.id}/submit`, 'POST', {});
check(
  '⚠️ SUBMISSION IS REFUSED while a critical fault remains unapproved',
  blocked.status === 400 && /§35/.test(message(blocked)),
  `HTTP ${blocked.status}: ${message(blocked)}`,
);
check(
  'and the refusal says an approval is needed and cannot be your own',
  /cannot approve your own/.test(message(blocked)),
  message(blocked),
);

const techOverride = await call(TECH, `/test-sessions/${s.id}/critical-override`, 'POST', {
  reason: 'letting it go',
});
check(
  '⚠️ a TECHNICIAN may not approve releasing a car with a live fault',
  techOverride.status === 403 && /may not approve/.test(message(techOverride)),
  `HTTP ${techOverride.status}: ${message(techOverride)}`,
);

const noReason = await call(SUP, `/test-sessions/${s.id}/critical-override`, 'POST', {});
check('an approval with no reason is refused', noReason.status === 400, `HTTP ${noReason.status}`);

const approved = await call(SUP, `/test-sessions/${s.id}/critical-override`, 'POST', {
  reason: `${RUN} customer informed of the ABS fault and has agreed to return for it`,
});
check('a supervisor may approve it, with a reason', ok2(approved), message(approved));
check('and the approver is named on the record', approved.json?.overrideApprovedByName !== null, approved.json?.overrideApprovedByName);

const submitted = await call(ADMIN, `/test-sessions/${s.id}/submit`, 'POST', {});
check('the session then submits', ok2(submitted), message(submitted));
check('its status is submitted', submitted.json?.status === 'submitted', submitted.json?.status);

const afterSubmit = await call(ADMIN, `/test-sessions/${s.id}/results`, 'POST', {
  testCategory: 'tyre', testName: 'sneaked in', outcome: 'pass',
});
check(
  '⚠️ nothing can be added once it is with quality control',
  afterSubmit.status === 409,
  `HTTP ${afterSubmit.status}: ${message(afterSubmit)}`,
);

// ── 5. scope ────────────────────────────────────────────────────────────────

console.log('\n5. Scope');
const missing = await call(ADMIN, '/test-sessions/00000000-0000-4000-8000-000000000000');
check('an unknown id is 404, never 403', missing.status === 404, `HTTP ${missing.status}`);

console.log(`\n${checks - failures}/${checks} passed\n`);
process.exit(failures === 0 ? 0 : 1);
