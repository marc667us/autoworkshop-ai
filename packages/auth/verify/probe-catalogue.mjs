/**
 * Probe the supplier-catalogue endpoints with REAL Keycloak access tokens — Slice B.
 *
 * WHY THIS EXISTS. The important rules in this slice are REFUSALS, and a screen
 * cannot demonstrate one: hiding a Publish button proves nothing about what the
 * API accepts. Worse, the specific failure this slice was built around is
 * SILENT — migration 025 existed because an admin write matched no policy and
 * affected zero rows without raising. An endpoint that returns 200 having
 * changed nothing looks identical to one that worked.
 *
 * So every publication assertion below re-READS the row afterwards. A 200 is not
 * evidence.
 *
 * ── IT NEEDS TWO IDENTITIES ────────────────────────────────────────────────
 *
 * The rule under test is "a supplier may write its catalogue but may not
 * publish it", and that has two halves which a single session cannot separate:
 * what the supplier is refused, and what the administrator is allowed. A
 * supplier-only probe would assert every refusal and never notice that
 * publication is impossible for everybody — which was true of this codebase
 * until migration 025.
 *
 *   (cd apps/api && node dist/main.js)
 *   (cd apps/e2e && node verify/capture-session.mjs --url http://localhost:3001 \
 *        --user owner@autoworkshop.local --out .verify-admin-cookies.json)
 *   (cd apps/e2e && node verify/capture-session.mjs --url http://localhost:3002 \
 *        --user supplier@autoworkshop.local --out .verify-sup-cookies.json)
 *   (cd packages/auth && node verify/probe-catalogue.mjs)
 *
 * Everything it creates is TAGGED with the run marker, so no assertion can be
 * satisfied by a row an earlier run left behind — the "harness measuring its own
 * residue" defect that produced two phantom product bugs in slice 3b.
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

const base = process.env['API_BASE_URL'] ?? 'http://localhost:4000';
const RUN = `probe-${process.pid}`;

async function tokenFrom(file) {
  const cookies = JSON.parse(readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf-8'));
  const header = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const token = await getToken({
    req: { headers: new Headers({ cookie: header }) },
    secret: SECRET,
    secureCookie: false,
  });
  const accessToken = token?.keycloak?.accessToken;
  if (!accessToken) {
    console.error(`NO access token in ${file} — nothing can be proven`);
    process.exit(2);
  }
  return accessToken;
}

const SUPPLIER = await tokenFrom(flag('--sup-session', '.verify-sup-cookies.json'));
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
function check(label, ok, detail) {
  checks += 1;
  if (ok) console.log(`  PASS  ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
  }
}

console.log(`\nprobe-catalogue  run=${RUN}  base=${base}`);

// ── 1. apply ────────────────────────────────────────────────────────────────
console.log('\n1. applying to be listed');
const applied = await call(SUPPLIER, '/catalogue/suppliers', 'POST', {
  name: `Probe Parts ${RUN}`,
  country: 'GH',
  city: 'Accra',
});
check('a signed-in user can apply', applied.status === 201 || applied.status === 200, applied);
const supplierId = applied.json?.id;
check('the application returns an id', Boolean(supplierId), applied.json);
check(
  'the slug was DERIVED, not accepted from the client',
  typeof applied.json?.slug === 'string' && applied.json.slug.startsWith('probe-parts'),
  applied.json,
);

const mine = await call(SUPPLIER, '/catalogue/suppliers');
const found = (mine.json ?? []).find((s) => s.id === supplierId);
check('the applicant is an owner of what they created', found?.memberRole === 'owner', found);
// ⚠️ THE PROPERTY THAT MATTERS MOST ABOUT AN APPLICATION: it is not public yet.
check('the application is NOT published', found?.isPublished === false, found);
check('the application is NOT verified', found?.isVerified === false, found);

// ── 2. parts ────────────────────────────────────────────────────────────────
console.log('\n2. managing parts');
const cats = await call(SUPPLIER, '/catalogue/categories');
const categoryId = cats.json?.[0]?.id;
check('categories are readable for the form', Boolean(categoryId), cats.json?.slice?.(0, 1));

const created = await call(SUPPLIER, `/catalogue/suppliers/${supplierId}/parts`, 'POST', {
  categoryId,
  partNumber: `PN-${RUN}`,
  name: 'Probe Brake Disc',
  price: 120.5,
});
check('a supplier can add a part', created.status === 201 || created.status === 200, created);
const partId = created.json?.id;
check('the new part is NOT published', created.json?.isPublished === false, created.json);
check('the price survives the NUMERIC round trip as a number', created.json?.price === 120.5, created.json);
check('the currency defaults to GHS, not the column default GBP', created.json?.currency === 'GHS', created.json);

const patched = await call(SUPPLIER, `/catalogue/parts/${partId}`, 'PATCH', { price: 130 });
check('a supplier can edit its own part', patched.json?.price === 130, patched);
check('an unmentioned field was NOT cleared by the patch', patched.json?.name === 'Probe Brake Disc', patched.json);

const dupe = await call(SUPPLIER, `/catalogue/suppliers/${supplierId}/parts`, 'POST', {
  categoryId,
  partNumber: `PN-${RUN}`,
  name: 'Duplicate',
});
check(
  'a duplicate part number is refused with a readable message, not a 500',
  dupe.status === 400 && /already list a part/.test(JSON.stringify(dupe.json)),
  dupe,
);

const badPrice = await call(SUPPLIER, `/catalogue/suppliers/${supplierId}/parts`, 'POST', {
  categoryId,
  partNumber: `PN-ZERO-${RUN}`,
  name: 'Free?',
  price: 0,
});
check('a zero price is refused before it reaches the database', badPrice.status === 400, badPrice);

// ── 3. the headline refusal ─────────────────────────────────────────────────
console.log('\n3. a supplier may not publish');
const selfPublish = await call(SUPPLIER, `/catalogue/parts/${partId}`, 'PATCH', {
  isPublished: true,
});
// The patch surface carries no route to `is_published`, so this is a 400
// ("nothing to update") rather than a 403 — the field is not refused, it does
// not exist. Either is acceptable; what must NOT happen is publication.
const afterAttempt = await call(SUPPLIER, `/catalogue/suppliers/${supplierId}/parts`);
const stillDraft = (afterAttempt.json ?? []).find((p) => p.id === partId);
check(
  'the part is STILL unpublished after the attempt',
  stillDraft?.isPublished === false,
  { status: selfPublish.status, part: stillDraft },
);

const adminRoute = await call(SUPPLIER, `/admin/catalogue/review-queue`);
check(
  'a supplier cannot reach the administrator routes at all',
  adminRoute.status === 401 || adminRoute.status === 403,
  adminRoute.status,
);

// ── 4. the administrator publishes — AND IT ACTUALLY HAPPENS ────────────────
console.log('\n4. the administrator publishes (re-read, never trust the 200)');
const queue = await call(ADMIN, '/admin/catalogue/review-queue');
check('the administrator can read the review queue', queue.status === 200, queue.status);
check(
  'the new application appears in the queue',
  (queue.json?.suppliers ?? []).some((s) => s.id === supplierId),
  queue.json?.suppliers?.length,
);
check(
  'the draft part appears in the queue',
  (queue.json?.parts ?? []).some((p) => p.id === partId),
  queue.json?.parts?.length,
);

const pubSupplier = await call(ADMIN, `/admin/catalogue/suppliers/${supplierId}/publication`, 'PATCH', {
  published: true,
  verified: true,
});
check('publishing the supplier returns 200', pubSupplier.status === 200, pubSupplier);

const pubPart = await call(ADMIN, `/admin/catalogue/parts/${partId}/publication`, 'PATCH', {
  published: true,
});
check('publishing the part returns 200', pubPart.status === 200, pubPart);

// ⚠️ THE CHECK THIS WHOLE FILE EXISTS FOR. Before migration 025 both calls above
// would have returned 200 having changed NOTHING. Re-read from a different
// route — the PUBLIC one, which requires no account — so the answer comes from
// the database rather than from the response we just parsed.
const publicSearch = await fetch(`${base}/api/v1/public/parts?q=Probe%20Brake%20Disc`);
const publicJson = await publicSearch.json();
const publiclyVisible = (publicJson?.items ?? publicJson?.parts ?? []).some((p) => p.id === partId);
check(
  'the part is now visible on the PUBLIC endpoint — publication really happened',
  publiclyVisible,
  { status: publicSearch.status, count: (publicJson?.items ?? publicJson?.parts ?? []).length },
);

// ── 5. fitments follow publication (migration 026) ──────────────────────────
console.log('\n5. fitments on a published part are an administrator decision');
const lateFitment = await call(SUPPLIER, `/catalogue/parts/${partId}/fitments`, 'POST', {
  make: 'Toyota',
  model: 'Corolla',
  yearFrom: 2012,
  yearTo: 2018,
});
check(
  'a supplier cannot add a public compatibility claim to a LIVE part',
  lateFitment.status === 403,
  lateFitment,
);
check(
  'and the refusal NAMES the way forward rather than just saying no',
  /withdraw/i.test(JSON.stringify(lateFitment.json)),
  lateFitment.json,
);

// The named route must be walkable, or the rule is a wall.
const withdraw = await call(ADMIN, `/admin/catalogue/parts/${partId}/publication`, 'PATCH', {
  published: false,
});
check('an administrator can withdraw the part', withdraw.json?.isPublished === false, withdraw);

const nowFitment = await call(SUPPLIER, `/catalogue/parts/${partId}/fitments`, 'POST', {
  make: 'Toyota',
  model: 'Corolla',
  yearFrom: 2012,
  yearTo: 2018,
});
check('the supplier can now add the fitment', nowFitment.status === 201 || nowFitment.status === 200, nowFitment);

const republish = await call(ADMIN, `/admin/catalogue/parts/${partId}/publication`, 'PATCH', {
  published: true,
});
check('and the administrator can republish', republish.json?.isPublished === true, republish);

const badRange = await call(SUPPLIER, `/catalogue/parts/${partId}/fitments`, 'POST', {
  make: 'Toyota',
  model: 'Hilux',
  yearFrom: 2018,
  yearTo: 2012,
});
check('an inverted year range is refused with a reason', badRange.status === 403 || badRange.status === 400, badRange);

// ── 6. isolation ────────────────────────────────────────────────────────────
console.log('\n6. isolation');
const others = await call(ADMIN, '/catalogue/suppliers');
const adminSeesProbe = (others.json ?? []).some((s) => s.id === supplierId);
check(
  'the administrator is NOT a member of the probe supplier — /catalogue is membership-scoped',
  adminSeesProbe === false,
  others.json?.map?.((s) => s.name),
);

// ── 7. two applicants, one name ─────────────────────────────────────────────
//
// 🔴 REGRESSION GUARD. The first implementation read the table for a free slug
// and then inserted it — but the reader is the CALLER, and a caller cannot see
// another user's UNPUBLISHED supplier (024's `supplier_read_own`). So the
// pre-check said "free" for a slug taken by a draft it could not see and the
// second applicant got a 500. Found by Codex, reproduced, and fixed by letting
// the unique index arbitrate inside a SAVEPOINT.
//
// ⚠️ THE FIRST APPLICATION IS ASSERTED BEFORE THE SECOND. An earlier version of
// this probe reported "collision handled" against a pair of expired-token 401s
// — a check that passes when nothing happened is worse than no check.
console.log('\n7. two applicants with the SAME name');
const sharedName = `Collide Parts ${RUN}`;
const firstApply = await call(SUPPLIER, '/catalogue/suppliers', 'POST', {
  name: sharedName,
  country: 'GH',
});
check('CONTROL: the first application succeeds', firstApply.status === 201, firstApply.status);

const secondApply = await call(ADMIN, '/catalogue/suppliers', 'POST', {
  name: sharedName,
  country: 'GH',
});
check(
  'the second application does NOT 500 — the database arbitrates the slug',
  secondApply.status === 201,
  secondApply,
);
check(
  'and it is given a DIFFERENT slug rather than failing',
  Boolean(secondApply.json?.slug) && secondApply.json.slug !== firstApply.json?.slug,
  { first: firstApply.json?.slug, second: secondApply.json?.slug },
);

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
