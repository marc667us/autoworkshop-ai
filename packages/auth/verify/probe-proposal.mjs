/**
 * Probe the proposal endpoints with REAL Keycloak access tokens — Phase 5, slice 6.
 *
 * WHY THIS EXISTS. §424 — "approved proposals shall be immutable; a material change
 * shall create a new version requiring new approval" — is the strongest rule in Phase 5
 * and the only one whose failure is invisible: an edited approval still looks like an
 * approval. It cannot be demonstrated by rendering a page.
 *
 * It also proves the DOCUMENT assembles. §410-§422 lists twelve things a customer must
 * be shown, ten of them read from four different frozen records. A missing join there
 * produces a document with a silently empty section, which is exactly the kind of defect
 * a screenshot does not reveal.
 *
 *   (cd packages/auth && node verify/probe-proposal.mjs)
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
const RUN = `pprobe-${process.pid}`;

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
  const at = token?.keycloak?.accessToken;
  if (!at) {
    console.error(`NO access token in ${file}`);
    process.exit(2);
  }
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
const message = (r) => (typeof r.json?.message === 'string' ? r.json.message : r.text.slice(0, 300));

// ── locate a card with an APPROVED quotation ────────────────────────────────

const allQuotes = (await call(ADMIN, '/quotations')).json ?? [];
const approvedQuote = allQuotes.find((q) => q.status === 'approved');
if (!approvedQuote) {
  console.error('no APPROVED quotation anywhere — run probe-quotation.mjs first');
  process.exit(2);
}
const cards = (await call(ADMIN, '/job-cards')).json ?? [];
const card = cards.find((c) => c.id === approvedQuote.jobCardId);
if (!card) { console.error('the approved quotation is on a card this identity cannot see'); process.exit(2); }
console.log(`\nCard ${card.jobNumber} at '${card.stage}' · run ${RUN}\n`);

// Settle any residue so the run repeats.
const prior = (await call(ADMIN, `/job-cards/${card.id}/proposals`)).json ?? [];
const openProposal = prior.find((p) => p.status === 'draft' || p.status === 'issued');
if (openProposal) {
  console.log(`  note  settling residue: version ${openProposal.versionNo} is '${openProposal.status}'`);
  if (openProposal.status === 'draft') {
    await call(ADMIN, `/proposals/${openProposal.id}`, 'PATCH', { expectedResult: 'residue' });
    await call(ADMIN, `/proposals/${openProposal.id}/issue`, 'POST', {});
  }
  await call(ADMIN, `/proposals/${openProposal.id}/decision`, 'POST', {
    decision: 'declined', decidedByName: 'probe residue', decisionChannel: 'in_person',
    note: 'settled by a re-run of probe-proposal.mjs',
  });
}

// ── 1. roles and preconditions ──────────────────────────────────────────────

console.log('1. Who may make an offer to a customer');

const techPrepare = await call(TECH, `/job-cards/${card.id}/proposals`, 'POST', {});
check(
  'a TECHNICIAN may not prepare a customer proposal',
  techPrepare.status === 403 && /may not prepare/.test(message(techPrepare)),
  `HTTP ${techPrepare.status}: ${message(techPrepare)}`,
);
const supPrepare = await call(SUP, `/job-cards/${card.id}/proposals`, 'POST', {});
check(
  '⚠️ nor may a SUPERVISOR — their §50 authority is technical and stops at the customer',
  supPrepare.status === 403,
  `HTTP ${supPrepare.status}: ${message(supPrepare)}`,
);

// ── 2. the document assembles ───────────────────────────────────────────────

console.log('\n2. §410-§422 — the document, assembled from frozen records');

const prepared = await call(ADMIN, `/job-cards/${card.id}/proposals`, 'POST', {});
check('a proposal is prepared', prepared.status === 201 || prepared.status === 200, message(prepared));
const p = prepared.json;
if (!p?.id) { console.error('no proposal'); process.exit(2); }
const v = p.presentation;

check('§410 — what was reported is present', typeof v.complaint === 'string' && v.complaint.length > 0, v.complaint);
check('§414 — the confirmed faults are present', Array.isArray(v.confirmedFaults) && v.confirmedFaults.length > 0, JSON.stringify(v.confirmedFaults));
check(
  '⚠️ §416 — WHAT REMAINS SUSPECTED is carried too, not only what was confirmed',
  Array.isArray(v.suspectedFaults),
  JSON.stringify(v.suspectedFaults),
);
check('§418 — the proposed work is present', v.proposedWork.length > 0, `${v.proposedWork.length} tasks`);
check('§420 — the time is summed from the plan', typeof v.estimatedLabourHours === 'number' && v.estimatedLabourHours > 0, String(v.estimatedLabourHours));
check(
  '§420 — both price tiers are computed, and comprehensive is never below recommended',
  typeof v.recommendedTotal === 'number' && v.comprehensiveTotal >= v.recommendedTotal,
  `${v.recommendedTotal} / ${v.comprehensiveTotal}`,
);
check('§422 — the warranty is carried from the quotation', 'warrantyTerms' in v);

check(
  '⚠️ THE LETTERHEAD RESOLVES — a document with no issuer cannot be acted on',
  typeof v.issuer?.name === 'string' && v.issuer.name.length > 0,
  JSON.stringify(v.issuer),
);
check(
  'and it carries an address and a tax registration',
  Boolean(v.issuer.address) && Boolean(v.issuer.vatRegistrationNumber),
  `${v.issuer.address} / ${v.issuer.vatRegistrationNumber}`,
);
check(
  'THE ADDRESSEE RESOLVES — a document addressed to nobody is a draft',
  typeof v.addressee?.name === 'string' && v.addressee.name.length > 0,
  JSON.stringify(v.addressee),
);
check(
  'and it carries a document reference both sides can quote',
  /^PROP-.+-V\d+$/.test(v.documentReference ?? ''),
  v.documentReference,
);
check('the vehicle is described, not just registered', typeof v.vehicleDescription === 'string', v.vehicleDescription);

// ── 3. issuing ──────────────────────────────────────────────────────────────

console.log('\n3. §418 — a price with no promise attached is not a proposal');

const tooEarly = await call(ADMIN, `/proposals/${p.id}/issue`, 'POST', {});
check(
  'it cannot be issued without saying what the work should achieve',
  tooEarly.status === 400 && /what the work should achieve/.test(message(tooEarly)),
  `HTTP ${tooEarly.status}: ${message(tooEarly)}`,
);

const narrative = await call(ADMIN, `/proposals/${p.id}`, 'PATCH', {
  expectedResult: `${RUN} the misfire will be cleared and the warning light will go out`,
  uncertainties: `${RUN} a second coil may also be weak`,
});
check('the narrative can be recorded', narrative.status === 200, message(narrative));

const issued = await call(ADMIN, `/proposals/${p.id}/issue`, 'POST', {});
check('and then it issues', issued.status === 200 || issued.status === 201, message(issued));
check('its status is issued', issued.json?.status === 'issued', issued.json?.status);

const editAfterIssue = await call(ADMIN, `/proposals/${p.id}`, 'PATCH', {
  expectedResult: 'changed while the customer is reading it',
});
check(
  '⚠️ an ISSUED proposal is frozen — the customer is reading this exact document',
  editAfterIssue.status === 409,
  `HTTP ${editAfterIssue.status}: ${message(editAfterIssue)}`,
);

// ── 4. §7's decision, and its attribution ───────────────────────────────────

console.log('\n4. §7 — the decision, and who made it');

const noName = await call(ADMIN, `/proposals/${p.id}/decision`, 'POST', {
  decision: 'approved', approvedOption: 'recommended', decisionChannel: 'telephone',
});
check(
  '⚠️ an approval with nobody named is refused',
  noName.status === 400 && /decidedByName/.test(message(noName)),
  `HTTP ${noName.status}: ${message(noName)}`,
);
const noChannel = await call(ADMIN, `/proposals/${p.id}/decision`, 'POST', {
  decision: 'approved', approvedOption: 'recommended', decidedByName: 'Kwame Mensah',
});
check(
  'and an approval with no channel is refused — "approved" alone is an assertion',
  noChannel.status === 400,
  `HTTP ${noChannel.status}: ${message(noChannel)}`,
);
const noReason = await call(ADMIN, `/proposals/${p.id}/decision`, 'POST', {
  decision: 'declined', decidedByName: 'Kwame Mensah', decisionChannel: 'telephone',
});
check('a decline with no reason is refused', noReason.status === 400, `HTTP ${noReason.status}`);

const decided = await call(ADMIN, `/proposals/${p.id}/decision`, 'POST', {
  decision: 'approved',
  approvedOption: 'recommended',
  decidedByName: 'Kwame Mensah',
  decisionChannel: 'telephone',
  note: `${RUN} agreed on the phone`,
});
check('a properly attributed approval is accepted', decided.status === 200 || decided.status === 201, message(decided));
check('the customer name is recorded, not the staff member', decided.json?.decidedByName === 'Kwame Mensah', decided.json?.decidedByName);
check('the channel is recorded', decided.json?.decisionChannel === 'telephone', decided.json?.decisionChannel);
check(
  '⚠️ the staff member who captured it is recorded SEPARATELY',
  typeof decided.json?.recordedByName === 'string' && decided.json.recordedByName !== 'Kwame Mensah',
  decided.json?.recordedByName,
);
check(
  'and the agreed total is the tier they chose, not the highest one',
  decided.json?.agreedTotal === decided.json?.presentation?.recommendedTotal,
  `${decided.json?.agreedTotal} vs ${decided.json?.presentation?.recommendedTotal}`,
);

// ── 5. §424 — immutability ──────────────────────────────────────────────────

console.log('\n5. §424 — an approved proposal is IMMUTABLE');

const editAfterApproval = await call(ADMIN, `/proposals/${p.id}`, 'PATCH', {
  expectedResult: 'quietly changed after the customer agreed',
});
check(
  '⚠️ IT CANNOT BE EDITED — this is the rule the whole slice exists for',
  editAfterApproval.status === 409 && /424/.test(message(editAfterApproval)),
  `HTTP ${editAfterApproval.status}: ${message(editAfterApproval)}`,
);

const decideAgain = await call(ADMIN, `/proposals/${p.id}/decision`, 'POST', {
  decision: 'declined', decidedByName: 'Someone Else', decisionChannel: 'email', note: 'no',
});
check(
  'and the decision cannot be overwritten',
  decideAgain.status === 409,
  `HTTP ${decideAgain.status}: ${message(decideAgain)}`,
);

const newVersion = await call(ADMIN, `/job-cards/${card.id}/proposals`, 'POST', {});
check(
  '⚠️ a new version is REFUSED on an approved proposal without a fresh quotation',
  newVersion.status === 409 && /APPROVED by the customer/.test(message(newVersion)),
  `HTTP ${newVersion.status}: ${message(newVersion)}`,
);
check(
  'and that refusal names where to go',
  /Quotations screen/.test(message(newVersion)),
  message(newVersion),
);

// ── 6. scope ────────────────────────────────────────────────────────────────

console.log('\n6. Scope');
const missing = await call(ADMIN, '/proposals/00000000-0000-4000-8000-000000000000');
check('an unknown id is 404, never 403', missing.status === 404, `HTTP ${missing.status}`);
const techRead = await call(TECH, `/proposals/${p.id}`);
check(
  'a technician on the card may READ the approval — §32 has them confirm it before starting',
  techRead.status === 200,
  `HTTP ${techRead.status}: ${message(techRead)}`,
);

console.log(`\n${checks - failures}/${checks} passed\n`);
process.exit(failures === 0 ? 0 : 1);
