import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * EVERY `FormShell` MUST CONTAIN A `SubmitButton`.
 *
 * ── 🔴 WHY THIS TEST EXISTS ───────────────────────────────────────────────
 *
 * Owner, 2026-08-07: "the customer request for service form dont have submit
 * butoom". They were right, and it was worse than one screen.
 *
 * `FormShell` renders the `<form>`, runs validation, calls the action and shows
 * the outcome — but it does NOT render a submit control. Each screen supplies
 * its own `<SubmitButton>`. That is a reasonable design (the label belongs to
 * the screen: "Send request", "Add vehicle", "Save"), and it has exactly one
 * failure mode: FORGET IT, AND THE FORM STILL COMPILES, STILL TYPE-CHECKS,
 * STILL LINTS, AND STILL RENDERS. It just cannot be submitted.
 *
 * A sweep on 2026-08-07 found 2 of 49 in that state:
 *
 *   apps/customer-web/.../request-service-screen.tsx   ← the owner's whole funnel
 *   apps/workshop-web/.../parts-requests-screen.tsx    ← nobody had reported it
 *
 * The first is the last step of the value chain the product exists to serve, so
 * `service_request.created` — the notification that tells the front desk to
 * route and assign the job — could never fire, because no request could ever be
 * created. A complete backend feature with no reachable caller, which this
 * repository has now recorded five times.
 *
 * ── ⚠️ WHY A STATIC SCAN AND NOT A BROWSER TEST ───────────────────────────
 *
 * A Playwright test proves one form on one route, needs the stack running, and
 * needs a signed-in session per role. This reads every file in seconds and
 * cannot be defeated by a route being unreachable in the fixture. It is the
 * cheaper half of the answer; driving the form for real is still worth doing.
 *
 * ⚠️ IT IS A TEXT SCAN, and it says so rather than implying more. It cannot see
 * a `SubmitButton` behind a conditional that is never true. It catches the
 * failure that actually happened — the component missing altogether.
 */

/** Repo root from `packages/ui/src`. */
const ROOT = resolve(__dirname, '../../..');
const APPS = join(ROOT, 'apps');

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    // `.next` and `dist` hold BUILT copies of these same screens. Scanning them
    // would double every finding and report generated files as source.
    if (entry === 'node_modules' || entry === '.next' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

describe('every FormShell has a way to submit it', () => {
  const files = walk(APPS);

  it('finds the screens at all — a scan of nothing passes vacuously', () => {
    // 🔴 THE GUARD ON THE GUARD. If `apps/` moved, or the walk silently
    // returned nothing, every assertion below would pass while checking zero
    // files — "a green gate that runs NOTHING", which this repository has
    // recorded for Playwright exiting 0 with no tests collected.
    expect(files.length).toBeGreaterThan(50);
    const withShell = files.filter((f) => readFileSync(f, 'utf8').includes('<FormShell'));
    expect(withShell.length).toBeGreaterThan(20);
  });

  it('no form is missing its SubmitButton', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      if (!source.includes('<FormShell')) continue;
      // 🔴 EACH FORM IS CHECKED INSIDE ITS OWN BOUNDARIES, NOT FILE-WIDE.
      //
      // The first version counted `<FormShell` and submit controls across the
      // whole file and compared totals. Codex proved that does not catch the
      // regression it claims: in `parts-requests-screen.tsx`, deleting the
      // button inside the FormShell would still pass, because an unrelated
      // submit button further down the same file kept the totals equal. A
      // guard that can be satisfied by a control belonging to a different form
      // is exactly the "check that walks through its own gap" this repository
      // has recorded four times — and it would have been introduced by the
      // test written to stop that class of bug.
      //
      // FormShell is never nested (verified across all 49 call sites), so the
      // region between an opening tag and the next `</FormShell>` is that
      // form's own body.
      const segments = source.split(/<FormShell[\s>]/).slice(1);
      for (const [index, segment] of segments.entries()) {
        const end = segment.indexOf('</FormShell>');
        // An unterminated FormShell is a broken file, not a passing one.
        if (end === -1) {
          offenders.push(
            `${relative(ROOT, file).replace(/\\/g, '/')} — FormShell #${index + 1} has no closing tag`,
          );
          continue;
        }
        const body = segment.slice(0, end);

        // 🔴 A RAW `type="submit"` COUNTS, AND THE FIRST VERSION GOT THAT
        // WRONG TOO. It required `<SubmitButton>` and flagged
        // `staff-form.tsx`, whose "Remove" control is a plain
        // `<button type="submit">` with a confirm handler — perfectly
        // submittable, and deliberately styled as destructive rather than as
        // the shared primary button. The invariant is "this form CAN BE
        // SUBMITTED", not "this form uses our component"; a test that enforces
        // house style while claiming to enforce reachability sends the next
        // reader to add a button to a form that already had one.
        //
        // ⚠️ Single AND double quotes, and `<input type="submit">`, because the
        // codebase is free to write any of them.
        const submittable =
          /<SubmitButton[\s>]/.test(body) || /type=["']submit["']/.test(body);
        if (!submittable) {
          offenders.push(
            `${relative(ROOT, file).replace(/\\/g, '/')} — FormShell #${index + 1} of ${segments.length} contains no submit control`,
          );
        }
      }
    }

    expect(
      offenders,
      'These forms render but cannot be submitted. FormShell does not supply a ' +
        'submit control; add <SubmitButton>…</SubmitButton> as a child:\n  ' +
        offenders.join('\n  '),
    ).toEqual([]);
  });
});
