/**
 * Probe the repair-plan endpoints with REAL Keycloak access tokens — Phase 5, slice 4.
 *
 * WHY THIS EXISTS. A form that hides a button proves nothing about what the API
 * accepts, and this slice's most important rules are REFUSALS: a plan started without
 * an approved diagnosis, a task addressing a fault that is only suspected, a plan
 * submitted with an unestimated task, and a reviewer who is the submitter. None of
 * those can be demonstrated by rendering a page.
 *
 * ── IT NEEDS TWO IDENTITIES, WHICH IS THE WHOLE POINT ──────────────────────
 *
 * §30-§31's review is only real if the person who wrote the plan cannot sign it off
 * (`2.txt` §563). Proving that needs a technician session AND a supervisor session
 * held at the same time, so both are captured to separate seam files and this probe
 * switches between them. A single-session probe would assert the role check and
 * silently skip the identity check — which is the half a role list cannot express.
 *
 * ── IT ALSO PROVES THE SLICE 3B → SLICE 4 HANDOFF ──────────────────────────
 *
 * The fixture is not inserted; it is DRIVEN through the product. The probe records a
 * diagnosis, confirms a fault, submits it, has the supervisor approve it, moves the
 * card on, and only then plans against it. If the handoff between the two slices ever
 * breaks, this fails at the step that broke rather than reporting a repair-plan
 * defect.
 *
 * ── WHY IT LIVES HERE AND NOT IN `apps/e2e` ────────────────────────────────
 *
 * It needs `next-auth/jwt` to decrypt the captured session, and under pnpm's isolated
 * store that only resolves from `packages/auth` — the same seam `probe-inspection.mjs`
 * and `probe-diagnosis.mjs` document. Confirmed again this session: the identical
 * script placed anywhere else dies on `ERR_MODULE_NOT_FOUND: next-auth`.
 *
 *   (cd apps/api && node dist/main.js)
 *   (cd apps/e2e && node verify/capture-session.mjs --url http://localhost:3001 \
 *        --user technician@autoworkshop.local --out .verify-tech-cookies.json)
 *   (cd apps/e2e && node verify/capture-session.mjs --url http://localhost:3001 \
 *        --user supervisor@autoworkshop.local --out .verify-sup-cookies.json)
 *   (cd packages/auth && node verify/probe-repair-plan.mjs)
 *
 * Re-runnable: each run records a new ATTEMPT rather than editing an old one — which
 * is what the domain does anyway, so repeated runs cannot corrupt the data they
 * measure. Everything it creates is TAGGED with the run marker below, so no assertion
 * can be satisfied by a row an earlier run left behind: that is the "harness measuring
 * its own residue" defect, which produced two phantom product bugs in slice 3b.
 *
 * DEV ONLY — it decrypts local sessions and refuses to run without an explicit secret,
 * so it cannot be pointed at a deployed environment by accident.
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

const base = process.env['API_BASE_URL'] ?? 'http://localhost:4000';
/**
 * Everything this run creates carries this marker.
 *
 * ⚠️ NOT COSMETIC. Findings and tasks accumulate across runs, and slice 3b lost time
 * to a harness that used `filter({hasText})` + `.first()` and picked a row an earlier
 * run had already edited — then reported two product defects that did not exist.
 */
const RUN = `probe-${process.pid}`;

/** Decrypt one captured session into a bearer token. */
async function tokenFrom(file) {
  const cookies = JSON.parse(readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf-8'));
  const header = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const token = await getToken({
    req: { headers: new Headers({ cookie: header }) },
    secret: SECRET,
    // The captured session came from http://localhost, so Auth.js used the NON-secure
    // cookie name. Getting this wrong reads as "no session" rather than as an error.
    secureCookie: false,
  });
  const accessToken = token?.keycloak?.accessToken;
  if (!accessToken) {
    console.error(`NO access token in ${file} — nothing can be proven`);
    process.exit(2);
  }
  return accessToken;
}

// ⚠️ REPO-ROOT RELATIVE, not `apps/e2e/`-relative, even though `capture-session.mjs`
// is invoked from there — `--out` resolves against the repo root, which is where the
// `.gitignore` glob for these files lives too. Getting it wrong is an ENOENT rather
// than a silent pass, which is the one mercy here.
const TECH = await tokenFrom(flag('--tech-session', '.verify-tech-cookies.json'));
const SUP = await tokenFrom(flag('--sup-session', '.verify-sup-cookies.json'));
/**
 * A THIRD identity, and it is not decoration.
 *
 * §563's rule is that the submitter may not review, and proving it needs a reviewer to
 * submit something — which leaves a plan only a DIFFERENT reviewer can settle. With two
 * sessions that residue is permanent and the next run cannot start a plan at all. So
 * the admin closes it out, and in doing so proves the thing the refusal promises: "another
 * supervisor must review it" is a route that exists, not a sentence. A rule whose named
 * alternative is unreachable is the most expensive defect class in this repository.
 */
const ADMIN = await tokenFrom(flag('--admin-session', '.verify-admin-cookies.json'));

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

const message = (r) => (typeof r.json?.message === 'string' ? r.json.message : r.text.slice(0, 300));

// ── stage routing ───────────────────────────────────────────────────────────
//
// A TRANSCRIPTION of `job-card-stages.ts`'s adjacency, used only to drive the card
// into position. Deliberately a subset: the probe never needs to reach the money or
// quality stages, and a full copy would be a second authority on the lifecycle.
const TRANSITIONS = {
  complaint_received: ['appointment_confirmed', 'vehicle_received'],
  appointment_confirmed: ['vehicle_received'],
  vehicle_received: ['initial_inspection'],
  initial_inspection: ['diagnosis_in_progress', 'further_information_required'],
  diagnosis_in_progress: ['further_information_required', 'specialist_consultation', 'solution_preparation'],
  further_information_required: ['initial_inspection', 'diagnosis_in_progress', 'solution_preparation'],
  solution_preparation: ['specialist_consultation'],
  specialist_consultation: ['diagnosis_in_progress', 'solution_preparation'],
};

/** Breadth-first, so the probe takes the shortest legal route rather than a guess. */
function routeFrom(from, to) {
  if (from === to) return [];
  const queue = [[from, []]];
  const seen = new Set([from]);
  while (queue.length > 0) {
    const [at, path] = queue.shift();
    for (const next of TRANSITIONS[at] ?? []) {
      if (seen.has(next)) continue;
      const nextPath = [...path, next];
      if (next === to) return nextPath;
      seen.add(next);
      queue.push([next, nextPath]);
    }
  }
  return null;
}

async function moveCardTo(cardId, target) {
  const card = await call(TECH, `/job-cards/${cardId}`);
  const path = routeFrom(card.json.stage, target);
  if (path === null) {
    console.error(`cannot route from '${card.json.stage}' to '${target}' — reseed the dev data`);
    process.exit(2);
  }
  for (const stage of path) {
    const moved = await call(TECH, `/job-cards/${cardId}/stage`, 'PATCH', {
      toStage: stage,
      note: `${RUN} staging`,
    });
    if (moved.status !== 200) {
      console.error(`could not move to '${stage}' (HTTP ${moved.status}): ${message(moved)}`);
      process.exit(2);
    }
  }
}

// ── locate the technician's card ────────────────────────────────────────────

const cards = await call(TECH, '/job-cards');
if (cards.status !== 200 || !Array.isArray(cards.json) || cards.json.length === 0) {
  console.error(`could not list job cards (HTTP ${cards.status}): ${cards.text.slice(0, 300)}`);
  process.exit(2);
}
const card = cards.json[0];
console.log(`\nCard ${card.jobNumber} — ${card.registrationNumber}, at '${card.stage}'`);
console.log(`Run marker: ${RUN}\n`);

// ── 1. an APPROVED diagnosis, driven through the product ────────────────────

console.log('1. The slice 3b handoff — an approved diagnosis with a confirmed fault');

// ── SETTLE ANY RESIDUE FIRST ────────────────────────────────────────────────
//
// ⚠️ A PROBE THAT ASSUMES A CLEAN DATABASE REPORTS ITS OWN LEFTOVERS AS DEFECTS.
// This one has already been run, and the previous attempt left an open diagnosis and a
// submitted plan behind — both of which the product correctly refuses to duplicate. So
// the state is ADOPTED and the run says which assertions it therefore exercised
// differently, rather than failing on a rule working exactly as designed.
const priorPlans = (await call(SUP, `/job-cards/${card.id}/repair-plans`)).json ?? [];
const openPlan = priorPlans.find((p) => p.status === 'in_progress' || p.status === 'submitted');
if (openPlan) {
  console.log(`  note  adopting residue: plan attempt ${openPlan.attemptNo} is '${openPlan.status}'`);
  if (openPlan.status === 'submitted') {
    // Whoever submitted it cannot settle it, so the admin does — the same route this
    // probe proves in section 9.
    await call(ADMIN, `/repair-plans/${openPlan.id}/review`, 'POST', {
      decision: 'rejected',
      note: 'settled by a re-run of probe-repair-plan.mjs',
    });
  } else {
    // ⚠️ EVERY UNESTIMATED TASK MUST BE ESTIMATED FIRST, not just one added.
    // Submission refuses a plan with ANY unestimated task, and the layout harness
    // leaves one behind — so the first version of this settler added a task, called
    // submit, got a 400 it ignored, and left the plan open. The next run then failed at
    // "a plan starts once the diagnosis is approved" and reported it as a product
    // defect. A cleanup step whose failure is not checked is not a cleanup step.
    const open = (await call(TECH, `/repair-plans/${openPlan.id}`)).json;
    for (const task of open?.tasks ?? []) {
      if (task.estimatedLabourHours === null) {
        await call(TECH, `/repair-plans/${openPlan.id}/tasks/${task.id}`, 'PATCH', {
          title: task.title,
          estimatedLabourHours: 1,
        });
      }
    }
    if ((open?.tasks ?? []).length === 0) {
      await call(TECH, `/repair-plans/${openPlan.id}/tasks`, 'POST', {
        title: 'residue',
        estimatedLabourHours: 1,
      });
    }
    const settled = await call(TECH, `/repair-plans/${openPlan.id}/submit`, 'POST', {});
    if (settled.status !== 200 && settled.status !== 201) {
      console.error(`could not settle the open plan: ${message(settled)}`);
      process.exit(2);
    }
    await call(ADMIN, `/repair-plans/${openPlan.id}/review`, 'POST', {
      decision: 'rejected',
      note: 'settled by a re-run of probe-repair-plan.mjs',
    });
  }
}

await moveCardTo(card.id, 'diagnosis_in_progress');

// ── the diagnosis, adopted or started ───────────────────────────────────────
const priorDiagnoses = (await call(TECH, `/job-cards/${card.id}/diagnoses`)).json ?? [];
// Read BEFORE this run records anything — see section 2. The service plans from the
// NEWEST approved diagnosis, so that is the one that decides whether a plan can start.
const newestApproved = priorDiagnoses.find((d) => d.status === 'approved');
const basisBefore =
  newestApproved && newestApproved.confirmedCount > 0 ? newestApproved : null;
// The API orders by `attempt_no DESC`, so the first is the current record.
let current = priorDiagnoses[0];

if (!current || current.status === 'approved' || current.status === 'rejected') {
  const started = await call(TECH, `/job-cards/${card.id}/diagnoses`, 'POST', {});
  check('a diagnosis can be started', started.status === 201 || started.status === 200, message(started));
  current = started.json;
} else {
  console.log(`  note  adopting an existing diagnosis at '${current.status}'`);
}

const diagnosisId = current?.id;
if (!diagnosisId) {
  console.error('no diagnosis to plan from — cannot continue');
  process.exit(2);
}

const CONFIRMED_TEXT = `${RUN} confirmed fault`;
const SUSPECTED_TEXT = `${RUN} suspected fault`;

if (current.status === 'in_progress') {
  const confirmed = await call(TECH, `/diagnoses/${diagnosisId}/findings`, 'POST', {
    faultDescription: CONFIRMED_TEXT,
    affectedSystem: 'electrical',
    findingStatus: 'confirmed',
  });
  check('a confirmed finding is recorded', confirmed.status === 201 || confirmed.status === 200, message(confirmed));

  const suspected = await call(TECH, `/diagnoses/${diagnosisId}/findings`, 'POST', {
    faultDescription: SUSPECTED_TEXT,
    affectedSystem: 'mechanical',
    findingStatus: 'suspected',
  });
  check('a suspected finding is recorded', suspected.status === 201 || suspected.status === 200, message(suspected));
  current = suspected.json;

  const submittedDiagnosis = await call(TECH, `/diagnoses/${diagnosisId}/submit`, 'POST', {});
  check('the diagnosis submits', submittedDiagnosis.status === 201 || submittedDiagnosis.status === 200, message(submittedDiagnosis));
  current = submittedDiagnosis.json ?? current;
}

const findings = current?.findings ?? [];
const confirmedFinding = findings.find((f) => f.faultDescription === CONFIRMED_TEXT)
  // An adopted diagnosis carries an earlier run's findings; any CONFIRMED one serves as
  // the thing a task may address, and any SUSPECTED one as the thing it may not.
  ?? findings.find((f) => f.findingStatus === 'confirmed');
const suspectedFinding = findings.find((f) => f.faultDescription === SUSPECTED_TEXT)
  ?? findings.find((f) => f.findingStatus === 'suspected');
check(
  'this run can identify a confirmed and a suspected finding to plan against',
  Boolean(confirmedFinding && suspectedFinding),
  JSON.stringify(findings.map((f) => [f.findingStatus, f.faultDescription])),
);
if (!confirmedFinding || !suspectedFinding) {
  console.error('cannot continue without both a confirmed and a suspected fault');
  process.exit(2);
}

// ── 2. the plan cannot be built from an UNAPPROVED diagnosis ────────────────

console.log('\n2. §22-§25 — a plan is built from an APPROVED diagnosis, not any diagnosis');

const tooEarly = await call(TECH, `/job-cards/${card.id}/repair-plans`, 'POST', {});
check(
  'a plan cannot be started while the card is still at diagnosis',
  tooEarly.status === 400 && /solution_preparation/.test(message(tooEarly)),
  `HTTP ${tooEarly.status}: ${message(tooEarly)}`,
);

await moveCardTo(card.id, 'solution_preparation');

// ⚠️ WHETHER THIS REFUSAL IS EXERCISABLE DEPENDS ON HISTORY THIS PROBE DOES NOT OWN.
// `basisBefore` was read BEFORE this run touched anything: if an earlier run already
// left an approved diagnosis carrying a confirmed fault on this card, then a plan
// SHOULD start here and asserting a refusal would be asserting a bug. Skipped with a
// note rather than failed — and it is not left unproven, because `repair-plan.spec.ts`
// drives both refusals deterministically over a fake client, where the state is chosen
// rather than inherited.
if (basisBefore) {
  console.log(
    `  note  the no-basis refusal is not exercisable: attempt ${basisBefore.attemptNo} is already`,
  );
  console.log('        approved with a confirmed fault. Covered deterministically in repair-plan.spec.ts.');
}

const unapproved = basisBefore
  ? null
  : await call(TECH, `/job-cards/${card.id}/repair-plans`, 'POST', {});
// ⚠️ EITHER REFUSAL IS CORRECT, and asserting only the first one reported a product
// defect that did not exist. There are two ways a card can fail to offer something to
// plan from, and which one fires depends on history this probe does not control:
//
//   · NO approved diagnosis at all — "built from the confirmed faults of an APPROVED
//     diagnosis, and this job card has none".
//   · The newest APPROVED diagnosis confirmed nothing. A card that has been diagnosed
//     nine times can easily have an older approved attempt with zero confirmed faults
//     sitting in front of a newer submitted one, which is exactly the state this run
//     found. Planning from a SUPERSEDED older diagnosis would be planning from a
//     statement a later review has replaced, so taking the newest approved one and
//     refusing is the right behaviour — not a bug in the lookup.
//
// What matters, and what is therefore asserted, is that the plan is refused and that
// the refusal points at the diagnosis.
if (unapproved) {
  const noBasis = /APPROVED diagnosis/.test(message(unapproved)) ||
    /confirmed no faults/.test(message(unapproved));
  check(
    'a plan cannot be started without an approved diagnosis carrying a confirmed fault',
    unapproved.status === 409 && noBasis,
    `HTTP ${unapproved.status}: ${message(unapproved)}`,
  );
  check(
    'and that refusal names a reachable route back to the diagnosis',
    /Diagnosis screen/.test(message(unapproved)) ||
      /Record a further diagnosis/.test(message(unapproved)),
    message(unapproved),
  );
}

// The supervisor approves it — a DIFFERENT identity, which is the rule under test in
// slice 3b and the precondition for everything below.
const approved = await call(SUP, `/diagnoses/${diagnosisId}/review`, 'POST', { decision: 'approved' });
check('a supervisor who did not submit it can approve', approved.status === 201 || approved.status === 200, message(approved));

// ── 3. starting the plan ────────────────────────────────────────────────────

console.log('\n3. §26 — starting the plan');

const plan = await call(TECH, `/job-cards/${card.id}/repair-plans`, 'POST', {
  repairProcedure: `${RUN} procedure`,
});
check('a plan starts once the diagnosis is approved', plan.status === 201 || plan.status === 200, message(plan));
const planId = plan.json?.id;
if (!planId) {
  console.error('no plan — cannot continue');
  process.exit(2);
}
check('it records WHICH diagnosis it was built from', plan.json.diagnosisId === diagnosisId, plan.json.diagnosisId);
// ⚠️ ASSERTED AS A MEMBERSHIP TEST, NOT A COUNT. An adopted diagnosis may carry an
// earlier run's findings too, and `length === 1` would then fail on a product that is
// working — the harness measuring its own residue, which produced two phantom defects
// in slice 3b. What the rule actually says is that CONFIRMED faults appear and
// SUSPECTED ones do not, so that is what is checked.
const faultIds = (plan.json.confirmedFaults ?? []).map((f) => f.id);
check(
  '§25 — it loads the confirmed fault',
  faultIds.includes(confirmedFinding.id),
  JSON.stringify(plan.json.confirmedFaults),
);
check(
  '§25 — and does NOT load the suspected one',
  !faultIds.includes(suspectedFinding.id),
  JSON.stringify(plan.json.confirmedFaults),
);
check(
  'it starts with every confirmed fault unaddressed',
  plan.json.unaddressedFaultCount === plan.json.confirmedFaults.length,
  `${plan.json.unaddressedFaultCount} of ${plan.json.confirmedFaults.length}`,
);

const second = await call(TECH, `/job-cards/${card.id}/repair-plans`, 'POST', {});
check(
  'a second plan is refused while one is open',
  second.status === 409 && /already has a repair plan in progress/.test(message(second)),
  `HTTP ${second.status}: ${message(second)}`,
);

// ── 4. tasks ────────────────────────────────────────────────────────────────

console.log('\n4. §27-§29 — tasks, and the fault link');

const noTitle = await call(TECH, `/repair-plans/${planId}/tasks`, 'POST', { title: '   ' });
check('a task with no description is refused', noTitle.status === 400, `HTTP ${noTitle.status}: ${message(noTitle)}`);

const againstSuspected = await call(TECH, `/repair-plans/${planId}/tasks`, 'POST', {
  title: `${RUN} against a guess`,
  findingId: suspectedFinding?.id,
});
check(
  '⚠️ a task may NOT address a SUSPECTED fault',
  againstSuspected.status === 400 && /CONFIRMED fault/.test(message(againstSuspected)),
  `HTTP ${againstSuspected.status}: ${message(againstSuspected)}`,
);

const foreign = await call(TECH, `/repair-plans/${planId}/tasks`, 'POST', {
  title: `${RUN} foreign fault`,
  findingId: '00000000-0000-4000-8000-000000000000',
});
check(
  "a task may not address a fault that is not on this plan's diagnosis",
  foreign.status === 404,
  `HTTP ${foreign.status}: ${message(foreign)}`,
);

const badHours = await call(TECH, `/repair-plans/${planId}/tasks`, 'POST', {
  title: `${RUN} rounding`,
  estimatedLabourHours: 1.005,
});
check(
  'an estimate the column would silently ROUND is refused',
  badHours.status === 400 && /two decimal places/.test(message(badHours)),
  `HTTP ${badHours.status}: ${message(badHours)}`,
);

const taskA = await call(TECH, `/repair-plans/${planId}/tasks`, 'POST', {
  title: `${RUN} task A — replace the part`,
  findingId: confirmedFinding?.id,
  estimatedLabourHours: 1.5,
  requiredSkill: 'auto electrician',
});
check('a task addressing the confirmed fault is accepted', taskA.status === 201 || taskA.status === 200, message(taskA));
// Relative, for the same residue reason as above: one fault has moved from unaddressed
// to addressed, whatever the starting count was.
check(
  'and that fault is then addressed',
  taskA.json?.unaddressedFaultCount === plan.json.unaddressedFaultCount - 1,
  `${plan.json.unaddressedFaultCount} -> ${taskA.json?.unaddressedFaultCount}`,
);

const taskB = await call(TECH, `/repair-plans/${planId}/tasks`, 'POST', {
  title: `${RUN} task B — road test`,
});
check('a task need not address a fault', taskB.status === 201 || taskB.status === 200, message(taskB));

const tasks = taskB.json?.tasks ?? [];
const a = tasks.find((t) => t.title.endsWith('task A — replace the part'));
const b = tasks.find((t) => t.title.endsWith('task B — road test'));
check('both tasks are on the plan, in sequence', a?.position === 1 && b?.position === 2, JSON.stringify(tasks.map((t) => [t.position, t.title])));
check('the fault link is returned as the fault it names', a?.findingDescription === CONFIRMED_TEXT, a?.findingDescription);

// ── 5. the sequence ─────────────────────────────────────────────────────────

console.log('\n5. §28 — the technician defines the task sequence');

const movedUp = await call(TECH, `/repair-plans/${planId}/tasks/${b.id}/move`, 'POST', { direction: 'up' });
check('a task can be moved earlier', movedUp.status === 201 || movedUp.status === 200, message(movedUp));
const reordered = movedUp.json?.tasks ?? [];
check(
  'the order actually changed',
  reordered[0]?.id === b.id && reordered[1]?.id === a.id,
  JSON.stringify(reordered.map((t) => [t.position, t.title])),
);

const atTop = await call(TECH, `/repair-plans/${planId}/tasks/${b.id}/move`, 'POST', { direction: 'up' });
check(
  'moving the first task earlier says so rather than silently succeeding',
  atTop.status === 409 && /already first/.test(message(atTop)),
  `HTTP ${atTop.status}: ${message(atTop)}`,
);

const badDirection = await call(TECH, `/repair-plans/${planId}/tasks/${b.id}/move`, 'POST', { direction: 'sideways' });
check('an invalid direction is refused', badDirection.status === 400, `HTTP ${badDirection.status}`);

// ── 6. resources ────────────────────────────────────────────────────────────

console.log('\n6. §29 — parts, consumables, tools and equipment');

const noQuantity = await call(TECH, `/repair-plans/${planId}/resources`, 'POST', {
  resourceKind: 'part',
  name: `${RUN} coil`,
});
check('a resource with no quantity is refused, never defaulted', noQuantity.status === 400, `HTTP ${noQuantity.status}: ${message(noQuantity)}`);

const badKind = await call(TECH, `/repair-plans/${planId}/resources`, 'POST', {
  resourceKind: 'spaceship',
  name: 'x',
  quantity: 1,
});
check('a kind outside §29s vocabulary is refused', badKind.status === 400, `HTTP ${badKind.status}`);

const part = await call(TECH, `/repair-plans/${planId}/resources`, 'POST', {
  resourceKind: 'part',
  name: `${RUN} ignition coil`,
  reference: 'BOSCH-0221504470',
  quantity: 1,
  unit: 'each',
  taskId: a.id,
});
check('a part is recorded against a task', part.status === 201 || part.status === 200, message(part));

const lift = await call(TECH, `/repair-plans/${planId}/resources`, 'POST', {
  resourceKind: 'lifting_equipment',
  name: `${RUN} two-post lift`,
  quantity: 1,
});
check('equipment is recorded against the plan as a whole', lift.status === 201 || lift.status === 200, message(lift));
check(
  'materials and equipment are counted separately for the quotation',
  lift.json?.partCount === 1 && lift.json?.equipmentCount === 1,
  `parts ${lift.json?.partCount}, equipment ${lift.json?.equipmentCount}`,
);

const foreignTask = await call(TECH, `/repair-plans/${planId}/resources`, 'POST', {
  resourceKind: 'part',
  name: 'x',
  quantity: 1,
  taskId: '00000000-0000-4000-8000-000000000000',
});
check('a resource cannot name a task on another plan', foreignTask.status === 404, `HTTP ${foreignTask.status}`);

const resources = lift.json?.resources ?? [];
const liftRow = resources.find((r) => r.name.endsWith('two-post lift'));
const removedResource = await call(TECH, `/repair-plans/${planId}/resources/${liftRow.id}`, 'DELETE');
check('a resource entered in error can be removed while the plan is open', removedResource.status === 200, message(removedResource));
check('and it is gone', (removedResource.json?.resources ?? []).every((r) => r.id !== liftRow.id));

// ── 7. submission ───────────────────────────────────────────────────────────

console.log('\n7. §29.10 — the two submission gates');

const unestimated = await call(TECH, `/repair-plans/${planId}/submit`, 'POST', {});
check(
  '⚠️ a plan with an unestimated task is refused',
  unestimated.status === 400 && /estimated labour time/.test(message(unestimated)),
  `HTTP ${unestimated.status}: ${message(unestimated)}`,
);
check(
  'and the refusal NAMES the task, so it can be acted on',
  /road test/.test(message(unestimated)),
  message(unestimated),
);

const estimated = await call(TECH, `/repair-plans/${planId}/tasks/${b.id}`, 'PATCH', {
  title: b.title,
  estimatedLabourHours: 0.5,
});
check('the estimate can be added', estimated.status === 200, message(estimated));
check(
  'the total is a NUMBER, summed and rounded',
  estimated.json?.totalEstimatedLabourHours === 2,
  String(estimated.json?.totalEstimatedLabourHours),
);

// The empty-plan gate, proven by emptying a plan rather than by assuming. Both tasks
// come off, submission is refused, then they go back.
const rmA = await call(TECH, `/repair-plans/${planId}/tasks/${a.id}`, 'DELETE');
const rmB = await call(TECH, `/repair-plans/${planId}/tasks/${b.id}`, 'DELETE');
check('tasks can be removed while the plan is open', rmA.status === 200 && rmB.status === 200);
const empty = await call(TECH, `/repair-plans/${planId}/submit`, 'POST', {});
check(
  'an EMPTY plan cannot be submitted',
  empty.status === 400 && /no tasks/.test(message(empty)),
  `HTTP ${empty.status}: ${message(empty)}`,
);

const readd = await call(TECH, `/repair-plans/${planId}/tasks`, 'POST', {
  title: `${RUN} task C — the real work`,
  findingId: confirmedFinding?.id,
  estimatedLabourHours: 2.25,
});
check('the plan can be rebuilt', readd.status === 201 || readd.status === 200, message(readd));

const submitted = await call(TECH, `/repair-plans/${planId}/submit`, 'POST', {});
check('a complete plan submits', submitted.status === 201 || submitted.status === 200, message(submitted));
check('and its status is submitted', submitted.json?.status === 'submitted', submitted.json?.status);

const afterSubmit = await call(TECH, `/repair-plans/${planId}/tasks`, 'POST', {
  title: `${RUN} sneaked in`,
  estimatedLabourHours: 1,
});
check(
  '⚠️ nothing can be added once the plan is submitted',
  afterSubmit.status === 409,
  `HTTP ${afterSubmit.status}: ${message(afterSubmit)}`,
);

const secondWhileSubmitted = await call(TECH, `/job-cards/${card.id}/repair-plans`, 'POST', {});
check(
  '⚠️ and a NEW plan is refused while this one awaits review — the slice 3b review bypass',
  secondWhileSubmitted.status === 409 && /awaiting supervisor review/.test(message(secondWhileSubmitted)),
  `HTTP ${secondWhileSubmitted.status}: ${message(secondWhileSubmitted)}`,
);

// ── 8. the review, with both independence rules ─────────────────────────────

console.log('\n8. §30-§31 and §563 — the internal technical review');

const techReview = await call(TECH, `/repair-plans/${planId}/review`, 'POST', { decision: 'approved' });
check(
  'ROLE — a technician may not review a plan',
  techReview.status === 403 && /may not review/.test(message(techReview)),
  `HTTP ${techReview.status}: ${message(techReview)}`,
);

const noReason = await call(SUP, `/repair-plans/${planId}/review`, 'POST', { decision: 'rejected' });
check('a rejection with no reason is refused', noReason.status === 400, `HTTP ${noReason.status}: ${message(noReason)}`);

const supervisorView = await call(SUP, `/repair-plans/${planId}`);
check('the supervisor can see the plan', supervisorView.status === 200, message(supervisorView));
check('and is offered the review', supervisorView.json?.reviewable === true, String(supervisorView.json?.reviewable));

const reviewed = await call(SUP, `/repair-plans/${planId}/review`, 'POST', {
  decision: 'approved',
  note: `${RUN} approved`,
});
check('a supervisor who did not submit it may approve', reviewed.status === 201 || reviewed.status === 200, message(reviewed));
check('the plan is approved', reviewed.json?.status === 'approved', reviewed.json?.status);

const again = await call(SUP, `/repair-plans/${planId}/review`, 'POST', { decision: 'rejected', note: 'no' });
check(
  'a settled plan cannot be reviewed twice',
  again.status === 409 && /already approved/.test(message(again)),
  `HTTP ${again.status}: ${message(again)}`,
);

// ── 9. IDENTITY — the submitter may not review, whatever their role ─────────
//
// ⚠️ THE HALF A ROLE LIST CANNOT EXPRESS, and the reason this probe holds two
// sessions. The supervisor builds and submits a plan of their own, then tries to
// approve it. Role alone would allow this; only the identity rule refuses it.

console.log('\n9. §563 — the SUBMITTER may not review, even holding the reviewing role');

await moveCardTo(card.id, 'solution_preparation');
const supPlan = await call(SUP, `/job-cards/${card.id}/repair-plans`, 'POST', {});
check('a supervisor can build a plan', supPlan.status === 201 || supPlan.status === 200, message(supPlan));

if (supPlan.json?.id) {
  const supPlanId = supPlan.json.id;
  await call(SUP, `/repair-plans/${supPlanId}/tasks`, 'POST', {
    title: `${RUN} supervisor's own task`,
    estimatedLabourHours: 1,
  });
  const supSubmitted = await call(SUP, `/repair-plans/${supPlanId}/submit`, 'POST', {});
  check('and submit it', supSubmitted.status === 201 || supSubmitted.status === 200, message(supSubmitted));

  const ownReview = await call(SUP, `/repair-plans/${supPlanId}/review`, 'POST', { decision: 'approved' });
  check(
    '⚠️ IDENTITY — the supervisor who submitted it is REFUSED, 403',
    ownReview.status === 403 && /you submitted this repair plan/.test(message(ownReview)),
    `HTTP ${ownReview.status}: ${message(ownReview)}`,
  );

  const asRead = await call(SUP, `/repair-plans/${supPlanId}`);
  check(
    'and the record does not offer them the review either',
    asRead.json?.reviewable === false,
    String(asRead.json?.reviewable),
  );

  // ⚠️ THE NAMED ALTERNATIVE, EXERCISED. The refusal above says "another supervisor
  // must review it". That sentence is only a rule if such a person can actually do it —
  // otherwise it is a wall, which is the defect class this repository has paid for three
  // slices running. So a THIRD identity settles it, and the assertion is the proof.
  const byAnother = await call(ADMIN, `/repair-plans/${supPlanId}/review`, 'POST', {
    decision: 'approved',
    note: `${RUN} approved by a different reviewer`,
  });
  check(
    'and ANOTHER reviewer can — the refusal names a route that exists',
    (byAnother.status === 200 || byAnother.status === 201) && byAnother.json?.status === 'approved',
    `HTTP ${byAnother.status}: ${message(byAnother)}`,
  );
}

// ── 10. scope ───────────────────────────────────────────────────────────────

console.log('\n10. Scope — 404, never 403, and never an oracle');

const missing = await call(TECH, '/repair-plans/00000000-0000-4000-8000-000000000000');
check('an unknown id is 404', missing.status === 404, `HTTP ${missing.status}`);

const listed = await call(TECH, '/repair-plans');
check('the technician can list their own plans', listed.status === 200 && Array.isArray(listed.json), `HTTP ${listed.status}`);
check(
  'and every plan returned is on a card assigned to them',
  (listed.json ?? []).every((p) => cards.json.some((c) => c.id === p.jobCardId)),
);

console.log(`\n${checks - failures}/${checks} passed\n`);
process.exit(failures === 0 ? 0 : 1);
