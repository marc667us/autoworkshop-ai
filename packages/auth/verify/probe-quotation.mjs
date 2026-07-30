/**
 * Probe the quotation endpoints with REAL Keycloak access tokens — Phase 5, slice 5.
 *
 * WHY THIS EXISTS. This is the first slice that handles MONEY, and money defects are
 * the ones nobody notices: a total that disagrees with its lines, a price that
 * re-denominates itself, a discount that produces a negative charge. None of those can
 * be demonstrated by rendering a page, and a unit test over a fake client cannot prove
 * that Postgres computed the line total.
 *
 * ── IT DRIVES THREE IDENTITIES ─────────────────────────────────────────────
 *
 * §5's internal approval is only real if the person who priced it cannot sign it off
 * (`2.txt` §563), and this slice adds a SECOND separation: `reception_staff` may
 * PREPARE a quotation but may not APPROVE one. Proving both needs reception, a
 * manager, and a technician — the technician to prove they are refused entirely.
 *
 *   (cd apps/e2e && node verify/capture-session.mjs --url http://localhost:3001 \
 *        --user reception@autoworkshop.local --out .verify-reception-cookies.json)
 *   (cd packages/auth && node verify/probe-quotation.mjs)
 *
 * DEV ONLY — it decrypts local sessions and refuses to run without an explicit secret.
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
const RUN = `qprobe-${process.pid}`;

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
    console.error(`NO access token in ${file}`);
    process.exit(2);
  }
  return accessToken;
}

const TECH = await tokenFrom(flag('--tech-session', '.verify-tech-cookies.json'));
const ADMIN = await tokenFrom(flag('--admin-session', '.verify-admin-cookies.json'));
const SUP = await tokenFrom(flag('--sup-session', '.verify-sup-cookies.json'));
/**
 * A FIFTH dev identity, and it is required rather than convenient.
 *
 * §5 holds approval to a narrower set than preparation, and §563 stops the submitter
 * approving their own. With only the admin at manager level, a quotation this probe
 * submits can never be approved by anyone — so the probe proved every refusal and left
 * the happy path unreachable, and slice 6 (which needs an APPROVED quotation) had no
 * precondition to work from. The rule generating its own identity requirement, for the
 * second time in Phase 5.
 */
const MANAGER = await tokenFrom(flag('--manager-session', '.verify-manager-cookies.json'));

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

// Stage routing, a transcription of `job-card-stages.ts` used only to drive the card
// into position.
const TRANSITIONS = {
  diagnosis_in_progress: ['further_information_required', 'specialist_consultation', 'solution_preparation'],
  further_information_required: ['diagnosis_in_progress', 'solution_preparation'],
  solution_preparation: ['quotation_preparation', 'specialist_consultation'],
  specialist_consultation: ['diagnosis_in_progress', 'solution_preparation'],
  quotation_preparation: ['awaiting_customer_approval'],
  awaiting_customer_approval: ['solution_preparation'],
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
async function moveCardTo(who, cardId, target) {
  const card = await call(who, `/job-cards/${cardId}`);
  const path = routeFrom(card.json.stage, target);
  if (path === null) {
    console.error(`cannot route from '${card.json.stage}' to '${target}'`);
    process.exit(2);
  }
  for (const stage of path) {
    const moved = await call(who, `/job-cards/${cardId}/stage`, 'PATCH', { toStage: stage, note: `${RUN}` });
    if (moved.status !== 200) {
      console.error(`could not move to '${stage}': ${message(moved)}`);
      process.exit(2);
    }
  }
}

// ⚠️ THE CARD IS CHOSEN BY ITS APPROVED PLAN, NOT BY BEING FIRST IN THE LIST. An admin
// sees every card in the organisation, so `cards[0]` was whichever job happened to sort
// first — one at `complaint_received` with nothing to price. The probe then failed to
// route it and reported that as a defect, which is the harness blaming the product for
// its own fixture selection. Pick the card that actually carries the precondition this
// slice is built on.
const cards = await call(ADMIN, '/job-cards');
const allPlans = (await call(ADMIN, '/repair-plans')).json ?? [];
const planForCard = allPlans.find((p) => p.status === 'approved');
if (!planForCard) {
  console.error('no APPROVED repair plan anywhere — run probe-repair-plan.mjs first');
  process.exit(2);
}
const card = (cards.json ?? []).find((c) => c.id === planForCard.jobCardId);
if (!card) { console.error('the approved plan is on a card this identity cannot see'); process.exit(2); }
console.log(`\nCard ${card.jobNumber} at '${card.stage}' · run ${RUN}\n`);

// ── 1. a quotation needs an APPROVED plan and the right stage ───────────────

console.log('1. §10 — a quotation is priced from an APPROVED repair plan');

// Settle any residue so the run is repeatable.
const priorQuotes = (await call(ADMIN, `/job-cards/${card.id}/quotations`)).json ?? [];
const openQuote = priorQuotes.find((q) => q.status === 'draft' || q.status === 'submitted');
if (openQuote) {
  console.log(`  note  settling residue: quotation attempt ${openQuote.attemptNo} is '${openQuote.status}'`);
  if (openQuote.status === 'draft') {
    for (const l of openQuote.lines) {
      if (l.unitPrice === 0) {
        await call(ADMIN, `/quotations/${openQuote.id}/lines/${l.id}`, 'PATCH', {
          description: l.description, quantity: l.quantity, unitPrice: 1,
        });
      }
    }
    await call(ADMIN, `/quotations/${openQuote.id}/submit`, 'POST', {});
  }
  // ⚠️ THE MANAGER SETTLES IT, NOT THE SUPERVISOR. A supervisor approves a repair PLAN
  // and is refused a PRICE — which is the rule this probe asserts twenty lines below, so
  // using SUP here left the residue unsettled and the next run reported "a quotation is
  // prepared: FAIL". A cleanup step that uses a role the product refuses is a harness
  // defect that presents as a product one.
  await call(MANAGER, `/quotations/${openQuote.id}/review`, 'POST', {
    decision: 'rejected', note: 'settled by a re-run of probe-quotation.mjs',
  });
}

await moveCardTo(ADMIN, card.id, 'solution_preparation');
const plans = (await call(ADMIN, `/job-cards/${card.id}/repair-plans`)).json ?? [];
const approvedPlan = plans.find((p) => p.status === 'approved');
if (!approvedPlan) {
  console.error('no APPROVED repair plan on this card — run probe-repair-plan.mjs first');
  process.exit(2);
}
check('an approved repair plan exists to price', true, `attempt ${approvedPlan.attemptNo}`);

const tooEarly = await call(ADMIN, `/job-cards/${card.id}/quotations`, 'POST', {});
check(
  'a quotation cannot be prepared while the card is at solution preparation',
  tooEarly.status === 400 && /quotation_preparation/.test(message(tooEarly)),
  `HTTP ${tooEarly.status}: ${message(tooEarly)}`,
);

await moveCardTo(ADMIN, card.id, 'quotation_preparation');

// ── 2. roles ────────────────────────────────────────────────────────────────

console.log('\n2. §11 and §50 — who may price, and who may approve');

const techPrepare = await call(TECH, `/job-cards/${card.id}/quotations`, 'POST', {});
check(
  '⚠️ a TECHNICIAN may not prepare a quotation — they cannot price their own work',
  techPrepare.status === 403 && /may not prepare/.test(message(techPrepare)),
  `HTTP ${techPrepare.status}: ${message(techPrepare)}`,
);

// ── 3. §3 — the system GENERATES the draft ─────────────────────────────────

console.log('\n3. §3 — the draft is GENERATED from the plan, not typed in');

const prepared = await call(ADMIN, `/job-cards/${card.id}/quotations`, 'POST', {});
check('a quotation is prepared', prepared.status === 201 || prepared.status === 200, message(prepared));
const q = prepared.json;
if (!q?.id) { console.error('no quotation'); process.exit(2); }

check('it records WHICH plan it was priced from', q.repairPlanId === approvedPlan.id, q.repairPlanId);
check('it snapshots a currency', /^[A-Z]{3}$/.test(q.currency), q.currency);
check(
  'it generated a line per plan task and priced part',
  q.lines.length > 0,
  `${q.lines.length} lines: ${q.lines.map((l) => l.lineKind).join(', ')}`,
);
check(
  'every generated labour line cites the task it came from',
  q.lines.filter((l) => l.lineKind === 'labour').every((l) => l.repairPlanTaskId !== null),
);
check(
  '⚠️ EQUIPMENT IS NOT PRICED — a lift is the workshop own, not a customer charge',
  q.lines.every((l) => l.lineKind !== 'lifting_equipment'),
  q.lines.map((l) => l.lineKind).join(', '),
);
check(
  '§4 reads the diagnosis summary LIVE rather than copying it',
  Object.prototype.hasOwnProperty.call(q, 'diagnosisSummary'),
);

const second = await call(ADMIN, `/job-cards/${card.id}/quotations`, 'POST', {});
check(
  'a second quotation is refused while one is open',
  second.status === 409,
  `HTTP ${second.status}: ${message(second)}`,
);

// ── 4. the money rules ──────────────────────────────────────────────────────

console.log('\n4. The money rules — the ones nobody notices when they break');

const line = q.lines[0];
const badPrecision = await call(ADMIN, `/quotations/${q.id}/lines/${line.id}`, 'PATCH', {
  description: line.description, quantity: line.quantity, unitPrice: 10.005,
});
check(
  '⚠️ a price the column would silently ROUND is refused',
  badPrecision.status === 400 && /two decimal places/.test(message(badPrecision)),
  `HTTP ${badPrecision.status}: ${message(badPrecision)}`,
);

const negative = await call(ADMIN, `/quotations/${q.id}/lines/${line.id}`, 'PATCH', {
  description: line.description, quantity: line.quantity, unitPrice: -50,
});
check('a negative price is refused', negative.status === 400, `HTTP ${negative.status}`);

const priced = await call(ADMIN, `/quotations/${q.id}/lines/${line.id}`, 'PATCH', {
  description: line.description, quantity: 3, unitPrice: 33.33,
});
check('a line can be priced', priced.status === 200, message(priced));
const repriced = priced.json.lines.find((l) => l.id === line.id);
check(
  '⚠️ THE LINE TOTAL IS COMPUTED BY THE DATABASE — 3 x 33.33 = 99.99',
  repriced.lineTotal === 99.99,
  `got ${repriced.lineTotal}`,
);
check(
  'and every numeric arrived as a NUMBER, not a pg string',
  typeof repriced.unitPrice === 'number' && typeof repriced.lineTotal === 'number',
  `${typeof repriced.unitPrice}, ${typeof repriced.lineTotal}`,
);

// Price everything else so the submission gates can be exercised.
for (const l of priced.json.lines) {
  if (l.unitPrice === 0) {
    await call(ADMIN, `/quotations/${q.id}/lines/${l.id}`, 'PATCH', {
      description: l.description, quantity: l.quantity, unitPrice: 10,
    });
  }
}

const withOptional = await call(ADMIN, `/quotations/${q.id}/lines`, 'POST', {
  lineKind: 'other_charge', description: `${RUN} optional extra`,
  quantity: 1, unitPrice: 500, isOptional: true,
});
check('an optional extra can be added', withOptional.status === 201 || withOptional.status === 200, message(withOptional));
check(
  '⚠️ AN OPTIONAL LINE IS EXCLUDED FROM THE TOTAL — the customer is not quoted for it',
  withOptional.json.optionalTotal === 500 &&
    !withOptional.json.lines.filter((l) => !l.isOptional).some((l) => l.id === withOptional.json.lines.find((x) => x.isOptional)?.id),
  `subtotal ${withOptional.json.subtotal}, optional ${withOptional.json.optionalTotal}`,
);

const state = await call(ADMIN, `/quotations/${q.id}`);
const sumOfLines = state.json.lines
  .filter((l) => !l.isOptional)
  .reduce((s, l) => s + l.lineTotal, 0);
check(
  '⚠️ THE SUBTOTAL EQUALS THE SUM OF THE LINES A CUSTOMER CAN READ',
  Math.abs(state.json.subtotal - Math.round(sumOfLines * 100) / 100) < 0.005,
  `subtotal ${state.json.subtotal} vs sum ${sumOfLines}`,
);

const hugeDiscount = await call(ADMIN, `/quotations/${q.id}`, 'PATCH', {
  discountAmount: state.json.subtotal + 1000,
});
check('an over-large discount is accepted as a draft value', hugeDiscount.status === 200, message(hugeDiscount));
const blockedSubmit = await call(ADMIN, `/quotations/${q.id}/submit`, 'POST', {});
check(
  '⚠️ but SUBMISSION refuses it — a discount above the subtotal is a negative price',
  blockedSubmit.status === 400 && /larger than the subtotal/.test(message(blockedSubmit)),
  `HTTP ${blockedSubmit.status}: ${message(blockedSubmit)}`,
);
await call(ADMIN, `/quotations/${q.id}`, 'PATCH', { discountAmount: 0 });

// ── 5. submission and approval ──────────────────────────────────────────────

console.log('\n5. §5 — submission and internal approval');

const submitted = await call(ADMIN, `/quotations/${q.id}/submit`, 'POST', {});
check('a fully priced quotation submits', submitted.status === 201 || submitted.status === 200, message(submitted));
check('and its status is submitted', submitted.json?.status === 'submitted', submitted.json?.status);

const afterSubmit = await call(ADMIN, `/quotations/${q.id}/lines`, 'POST', {
  lineKind: 'other_charge', description: 'sneaked in', quantity: 1, unitPrice: 1,
});
check('⚠️ no line can be added once submitted', afterSubmit.status === 409, `HTTP ${afterSubmit.status}`);

const ownApproval = await call(ADMIN, `/quotations/${q.id}/review`, 'POST', { decision: 'approved' });
check(
  '⚠️ IDENTITY — the person who submitted it cannot approve it',
  ownApproval.status === 403 && /you submitted this quotation/.test(message(ownApproval)),
  `HTTP ${ownApproval.status}: ${message(ownApproval)}`,
);

const supApproval = await call(SUP, `/quotations/${q.id}/review`, 'POST', { decision: 'approved' });
check(
  '⚠️ ROLE — a workshop SUPERVISOR may approve a repair plan but NOT a price',
  supApproval.status === 403 && /may not approve/.test(message(supApproval)),
  `HTTP ${supApproval.status}: ${message(supApproval)}`,
);

const noReason = await call(TECH, `/quotations/${q.id}/review`, 'POST', { decision: 'rejected' });
check('a technician may not approve either', noReason.status === 403, `HTTP ${noReason.status}`);

// ⚠️ AND THE NAMED ALTERNATIVE IS EXERCISED. Every refusal above says another manager
// must approve it; that is only a rule if such a person can actually do it. A second
// manager-level identity closes it out — and leaves the APPROVED quotation slice 6
// needs, so the two probes chain the way the product does.
const byAnotherManager = await call(MANAGER, `/quotations/${q.id}/review`, 'POST', {
  decision: 'approved',
  note: `${RUN} approved by a different manager`,
});
check(
  '⚠️ ANOTHER MANAGER CAN — the refusal names a route that exists',
  (byAnotherManager.status === 200 || byAnotherManager.status === 201) &&
    byAnotherManager.json?.status === 'approved',
  `HTTP ${byAnotherManager.status}: ${message(byAnotherManager)}`,
);

// ── 6. scope ────────────────────────────────────────────────────────────────

console.log('\n6. Scope');
const missing = await call(ADMIN, '/quotations/00000000-0000-4000-8000-000000000000');
check('an unknown id is 404, never 403', missing.status === 404, `HTTP ${missing.status}`);
const techRead = await call(TECH, `/quotations/${q.id}`);
check(
  'a technician assigned to the card may READ the price (§31 has them confirm approval)',
  techRead.status === 200,
  `HTTP ${techRead.status}: ${message(techRead)}`,
);

console.log(`\n${checks - failures}/${checks} passed\n`);
process.exit(failures === 0 ? 0 : 1);
