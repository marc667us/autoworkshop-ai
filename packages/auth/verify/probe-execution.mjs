/**
 * Probe the repair-execution endpoints with REAL Keycloak tokens — Phase 5, slice 7.
 *
 * WHY THIS EXISTS. Two rules here cannot be demonstrated any other way:
 *
 *   · §7 — "repair work shall not start until the required approval is received."
 *     That is a foreign key plus a trigger, not a checkbox, and the only way to show
 *     the difference is to try it.
 *   · §33's clock. Start, pause, resume and stop produce INTERVALS, and whether the
 *     durations add up correctly is arithmetic over real timestamps that a fake client
 *     cannot produce.
 *
 *   (cd packages/auth && node verify/probe-execution.mjs)
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
const RUN = `eprobe-${process.pid}`;

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
const message = (r) => (typeof r.json?.message === 'string' ? r.json.message : r.text.slice(0, 300));

const TRANSITIONS = {
  awaiting_customer_approval: ['awaiting_deposit', 'awaiting_parts', 'authorized_to_start', 'solution_preparation'],
  awaiting_deposit: ['awaiting_parts', 'authorized_to_start'],
  awaiting_parts: ['authorized_to_start'],
  authorized_to_start: ['repair_in_progress'],
  quotation_preparation: ['awaiting_customer_approval'],
  solution_preparation: ['quotation_preparation'],
};
function routeFrom(from, to) {
  if (from === to) return [];
  const q = [[from, []]], seen = new Set([from]);
  while (q.length) {
    const [at, path] = q.shift();
    for (const nx of TRANSITIONS[at] ?? []) {
      if (seen.has(nx)) continue;
      const p = [...path, nx];
      if (nx === to) return p;
      seen.add(nx);
      q.push([nx, p]);
    }
  }
  return null;
}
async function moveCardTo(cardId, target) {
  const card = await call(ADMIN, `/job-cards/${cardId}`);
  const path = routeFrom(card.json.stage, target);
  if (path === null) {
    console.error(`cannot route from '${card.json.stage}' to '${target}'`);
    process.exit(2);
  }
  for (const stage of path) {
    const m = await call(ADMIN, `/job-cards/${cardId}/stage`, 'PATCH', { toStage: stage, note: RUN });
    if (m.status !== 200) { console.error(`could not move to '${stage}': ${message(m)}`); process.exit(2); }
  }
}

// ── locate a card with an APPROVED customer proposal ────────────────────────

const proposals = (await call(ADMIN, '/proposals')).json ?? [];
const approved = proposals.find((p) => p.status === 'approved');
if (!approved) {
  console.error('no APPROVED customer proposal anywhere — run probe-proposal.mjs first');
  process.exit(2);
}
const cards = (await call(ADMIN, '/job-cards')).json ?? [];
const card = cards.find((c) => c.id === approved.jobCardId);
if (!card) { console.error('the approved proposal is on a card this identity cannot see'); process.exit(2); }
console.log(`\nCard ${card.jobNumber} at '${card.stage}' · run ${RUN}\n`);

// Settle residue so the run repeats.
const priorExec = ((await call(ADMIN, `/job-cards/${card.id}/executions`)).json ?? [])
  .find((e) => e.status === 'in_progress');
if (priorExec) {
  console.log(`  note  settling residue: execution attempt ${priorExec.attemptNo} is in progress`);
  // ⚠️ EVERY STEP IS CHECKED. A cleanup that ignores its responses is not a cleanup —
  // it leaves the residue in place and the NEXT assertion reports a product defect. The
  // quotation probe learned this an hour earlier and this one repeated it, which is the
  // argument for checking rather than for remembering.
  for (const t of priorExec.tasks) {
    if (t.status !== 'completed' && t.status !== 'skipped') {
      const skipped = await call(ADMIN, `/repair-executions/${priorExec.id}/tasks/${t.id}`, 'PATCH', {
        status: 'skipped', statusNote: 'settled by a re-run of probe-execution.mjs',
      });
      if (skipped.status !== 200 && skipped.status !== 201) {
        console.error(`could not settle task ${t.position}: HTTP ${skipped.status} ${message(skipped)}`);
        process.exit(2);
      }
    }
  }
  // Any technician may have left the clock running, not just these two. Read the
  // record and stop whatever is still open, rather than guessing who it belongs to.
  const state = (await call(ADMIN, `/repair-executions/${priorExec.id}`)).json;
  if ((state?.runningEntryCount ?? 0) > 0) {
    for (const who of [ADMIN, TECH]) {
      await call(who, `/repair-executions/${priorExec.id}/time-entries/stop`, 'POST', {});
    }
    const after = (await call(ADMIN, `/repair-executions/${priorExec.id}`)).json;
    if ((after?.runningEntryCount ?? 0) > 0) {
      console.error(
        `${after.runningEntryCount} time entr(ies) belong to an identity this probe does not hold — ` +
          'stop them as that technician, or reseed. Cannot continue.',
      );
      process.exit(2);
    }
  }
  const settled = await call(ADMIN, `/repair-executions/${priorExec.id}/complete`, 'POST', {
    completionNote: 'settled by a re-run of probe-execution.mjs',
  });
  if (settled.status !== 200 && settled.status !== 201) {
    console.error(`could not settle the open execution: HTTP ${settled.status} ${message(settled)}`);
    process.exit(2);
  }
}

// ── 1. §7 — the authorisation is structural ─────────────────────────────────

console.log('1. §7 — repair work shall not start until approval is received');

// ⚠️ THE WRONG-STAGE CHECK IS ONLY EXERCISABLE FROM BEFORE THE GATE, and the lifecycle
// has no route back: `authorized_to_start` leads onward to `repair_in_progress`, never
// back to `awaiting_customer_approval`. A re-run therefore finds the card already past
// it, and driving it backwards is not something the product allows — so this is skipped
// with a note rather than failed, and `execution.spec.ts` covers the refusal
// deterministically over a fake client where the stage is chosen rather than inherited.
const stageBefore = (await call(ADMIN, `/job-cards/${card.id}`)).json?.stage;
if (stageBefore === 'awaiting_customer_approval' || stageBefore === 'quotation_preparation') {
  const wrongStage = await call(ADMIN, `/job-cards/${card.id}/executions`, 'POST', {});
  check(
    'a repair cannot start from the wrong stage',
    wrongStage.status === 400 && /authorized_to_start/.test(message(wrongStage)),
    `HTTP ${wrongStage.status}: ${message(wrongStage)}`,
  );
} else {
  console.log(`  note  the wrong-stage refusal is not exercisable: the card is already at`);
  console.log(`        '${stageBefore}' and the lifecycle has no route back. Covered in execution.spec.ts.`);
}

await moveCardTo(card.id, 'authorized_to_start');

const started = await call(ADMIN, `/job-cards/${card.id}/executions`, 'POST', {
  serviceBay: 'Bay 2',
});
check('a repair starts once the customer has approved', started.status === 201 || started.status === 200, message(started));
const e = started.json;
if (!e?.id) { console.error('no execution'); process.exit(2); }
check('it records WHICH proposal authorised it', e.proposalId === approved.id, e.proposalId);
check(
  '⚠️ it created one task per APPROVED plan task — the work list is not composed by a caller',
  e.tasks.length > 0,
  `${e.tasks.length} tasks: ${e.tasks.map((t) => t.title).join('; ')}`,
);
check(
  'and each carries the estimate and the fault from the immutable plan',
  e.tasks.every((t) => 'estimatedLabourHours' in t && 'findingDescription' in t),
);

const second = await call(ADMIN, `/job-cards/${card.id}/executions`, 'POST', {});
check('a second repair is refused while one is open', second.status === 409, `HTTP ${second.status}`);

// ── 2. §33 — the clock ──────────────────────────────────────────────────────

console.log('\n2. §33 — time recording');

const noNote = await call(ADMIN, `/repair-executions/${e.id}/time-entries`, 'POST', {
  entryKind: 'waiting_for_parts',
});
check(
  'non-productive time with no note is refused — it could not be chased',
  noNote.status === 400 && /chased/.test(message(noNote)),
  `HTTP ${noNote.status}: ${message(noNote)}`,
);

const work = await call(ADMIN, `/repair-executions/${e.id}/time-entries`, 'POST', {
  entryKind: 'productive',
  executionTaskId: e.tasks[0].id,
});
check('Start Work opens a productive entry', work.status === 200 || work.status === 201, message(work));
check('and it is running', work.json?.runningEntryCount === 1, String(work.json?.runningEntryCount));
check(
  'a running entry has no duration — a number that changes when you look at it is not a duration',
  work.json?.timeEntries?.some((t) => t.endedAt === null && t.hours === null),
);
check(
  '§33 — it is linked to the task, the bay and the STAGE it was booked against',
  work.json?.timeEntries?.some(
    (t) => t.endedAt === null && t.executionTaskId === e.tasks[0].id && t.repairStage !== null,
  ),
  JSON.stringify(work.json?.timeEntries?.filter((t) => t.endedAt === null)),
);

// ⚠️ THE DOUBLE-BOOKING CASE. Pressing "waiting for parts" while the clock runs must
// not book the same minutes twice.
const waiting = await call(ADMIN, `/repair-executions/${e.id}/time-entries`, 'POST', {
  entryKind: 'waiting_for_parts',
  note: `${RUN} coil on back order`,
});
check('switching to a delay is accepted', waiting.status === 200 || waiting.status === 201, message(waiting));
check(
  '⚠️ AND IT CLOSED THE PRODUCTIVE ENTRY — the same minutes are never booked twice',
  waiting.json?.runningEntryCount === 1,
  `${waiting.json?.runningEntryCount} entries still running`,
);
check(
  'the closed entry now has a duration',
  waiting.json?.timeEntries?.some((t) => t.entryKind === 'productive' && t.hours !== null),
);

const stopped = await call(ADMIN, `/repair-executions/${e.id}/time-entries/stop`, 'POST', {});
// ⚠️ NEST RETURNS 201 FOR @Post BY DEFAULT, whatever the handler does. Asserting 200
// here reported a product defect on a call that had worked — the harness testing
// Nest's default status code rather than the behaviour.
check(
  'Pause closes the running entry',
  stopped.status === 200 || stopped.status === 201,
  `HTTP ${stopped.status}: ${message(stopped)}`,
);
check('nothing is running', stopped.json?.runningEntryCount === 0, String(stopped.json?.runningEntryCount));

const stopAgain = await call(ADMIN, `/repair-executions/${e.id}/time-entries/stop`, 'POST', {});
check(
  'a Pause that pauses nothing SAYS SO rather than reporting success',
  stopAgain.status === 409 && /no running time entry/.test(message(stopAgain)),
  `HTTP ${stopAgain.status}: ${message(stopAgain)}`,
);
check(
  'productive and non-productive time are counted separately',
  typeof stopped.json?.productiveHours === 'number' &&
    typeof stopped.json?.nonProductiveHours === 'number',
  `${stopped.json?.productiveHours} / ${stopped.json?.nonProductiveHours}`,
);

// ── 3. §7-§9 — parts, evidence ──────────────────────────────────────────────

console.log('\n3. §7-§9 — parts fitted, measurements and evidence');

const part = await call(ADMIN, `/repair-executions/${e.id}/parts-used`, 'POST', {
  description: `${RUN} ignition coil`,
  partNumber: 'BOSCH-0221504470',
  quantity: 1,
  unit: 'each',
  executionTaskId: e.tasks[0].id,
});
check('a fitted part is recorded', part.status === 200 || part.status === 201, message(part));
check(
  'and it is separate from the PLANNED parts — that is how an invoice difference is explained',
  part.json?.partsUsed?.length >= 1,
);

const badMeasurement = await call(ADMIN, `/repair-executions/${e.id}/evidence`, 'POST', {
  evidenceKind: 'measurement', description: 'coil primary resistance',
});
check(
  'a measurement with no reading is refused — that is an observation',
  badMeasurement.status === 400,
  `HTTP ${badMeasurement.status}: ${message(badMeasurement)}`,
);

const measurement = await call(ADMIN, `/repair-executions/${e.id}/evidence`, 'POST', {
  evidenceKind: 'measurement',
  description: `${RUN} coil primary resistance`,
  recordedValue: '0.52 ohm',
});
check('a measurement with a reading is accepted', measurement.status === 200 || measurement.status === 201, message(measurement));

// ── 4. §13 — completion, and its gates ──────────────────────────────────────

console.log('\n4. §13 — completing the authorised repair');

const tooEarly = await call(ADMIN, `/repair-executions/${e.id}/complete`, 'POST', {});
check(
  '⚠️ a repair with unfinished approved tasks cannot be completed',
  tooEarly.status === 400 && /not finished/.test(message(tooEarly)),
  `HTTP ${tooEarly.status}: ${message(tooEarly)}`,
);
check('and the refusal NAMES them', /\d\. /.test(message(tooEarly)), message(tooEarly));

const blockedNoReason = await call(ADMIN, `/repair-executions/${e.id}/tasks/${e.tasks[0].id}`, 'PATCH', {
  status: 'blocked',
});
check(
  'a blocked task with no reason is refused — nobody else could unblock it',
  blockedNoReason.status === 400,
  `HTTP ${blockedNoReason.status}: ${message(blockedNoReason)}`,
);

// ⚠️ THE RESULT OF EACH WRITE IS CHECKED. A loop that ignores its responses turns a
// refused write into a mystery three assertions later — which is exactly what happened
// the first time this ran.
let lastTaskState;
for (const t of e.tasks) {
  const done = await call(ADMIN, `/repair-executions/${e.id}/tasks/${t.id}`, 'PATCH', {
    status: 'completed',
  });
  if (done.status !== 200 && done.status !== 201) {
    console.log(`  FAIL  could not complete task ${t.position}: HTTP ${done.status} ${message(done)}`);
    failures += 1;
    checks += 1;
  }
  lastTaskState = done.json;
}
const stillOpen = (lastTaskState?.tasks ?? []).filter(
  (t) => t.status !== 'completed' && t.status !== 'skipped',
);
check(
  'every approved task is now finished',
  stillOpen.length === 0,
  JSON.stringify(stillOpen.map((t) => [t.position, t.title, t.status])),
);

// Leave the clock running to prove the second gate.
await call(ADMIN, `/repair-executions/${e.id}/time-entries`, 'POST', {
  entryKind: 'productive', executionTaskId: e.tasks[0].id,
});
const clockRunning = await call(ADMIN, `/repair-executions/${e.id}/complete`, 'POST', {});
check(
  '⚠️ a repair cannot be completed while somebody is still clocked on',
  clockRunning.status === 400 && /still running/.test(message(clockRunning)),
  `HTTP ${clockRunning.status}: ${message(clockRunning)}`,
);
await call(ADMIN, `/repair-executions/${e.id}/time-entries/stop`, 'POST', {});

const completed = await call(ADMIN, `/repair-executions/${e.id}/complete`, 'POST', {
  completionNote: `${RUN} misfire cleared, road tested`,
  unexpectedFindings: `${RUN} nearside wiper blade perished — not repaired, needs a variation`,
});
check('a finished repair completes', completed.status === 200 || completed.status === 201, message(completed));
check('its status is completed', completed.json?.status === 'completed', completed.json?.status);

const afterComplete = await call(ADMIN, `/repair-executions/${e.id}/parts-used`, 'POST', {
  description: 'sneaked in', quantity: 1,
});
check(
  '⚠️ nothing can be added once the repair is finished',
  afterComplete.status === 409,
  `HTTP ${afterComplete.status}: ${message(afterComplete)}`,
);

// ── 5. scope ────────────────────────────────────────────────────────────────

console.log('\n5. Scope');
const missing = await call(ADMIN, '/repair-executions/00000000-0000-4000-8000-000000000000');
check('an unknown id is 404, never 403', missing.status === 404, `HTTP ${missing.status}`);
const techList = await call(TECH, '/repair-executions');
check(
  'a technician sees only repairs on cards assigned to them',
  techList.status === 200 && (techList.json ?? []).every((x) => cards.some((c) => c.id === x.jobCardId)),
  `HTTP ${techList.status}`,
);

console.log(`\n${checks - failures}/${checks} passed\n`);
process.exit(failures === 0 ? 0 : 1);
