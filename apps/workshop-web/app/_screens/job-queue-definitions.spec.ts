import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JOB_QUEUES } from './job-queue-definitions';

/**
 * 🔴 EVERY STAGE NAMED BY A QUEUE MUST EXIST IN THE DATABASE'S VOCABULARY.
 *
 * This is the whole reason the file has a test. A wrong stage key does not
 * throw, does not warn and does not render an error: `filter` simply matches
 * nothing and the screen says "nothing is waiting" — which is exactly what a
 * quiet workshop looks like. The failure is invisible precisely when somebody
 * is relying on the queue to tell them what to do next.
 *
 * The authority is migration 006's CHECK constraint, transcribed into
 * `job-card-stages.ts`. This reads that file rather than restating the list,
 * because a hand-copied list drifts with the same edit that breaks it.
 */
describe('job queue stage keys', () => {
  const source = readFileSync(
    join(__dirname, '../../../api/src/repair/job-card-stages.ts'),
    'utf8',
  );

  const block = /export const STAGES = \[([\s\S]*?)\] as const;/.exec(source);
  const known = new Set([...(block?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));

  it('found the real stage list to compare against', () => {
    // Guards the regex itself. If this silently matched nothing, every
    // assertion below would pass against an empty set and prove nothing —
    // the "check that walks through its own gap" failure this repo keeps
    // recording.
    expect(block, 'could not find STAGES in job-card-stages.ts').toBeTruthy();
    expect(known.size).toBeGreaterThan(15);
    expect(known.has('repair_in_progress')).toBe(true);
  });

  it.each(Object.entries(JOB_QUEUES))('%s names only real stages', (_route, queue) => {
    const unknown = queue.stages.filter((s) => !known.has(s));
    expect(unknown, `unknown stage(s): ${unknown.join(', ')}`).toEqual([]);
  });

  it('proves the check would CATCH a typo', () => {
    // Injecting the failure, rather than trusting that a pass means anything.
    expect(known.has('inspection_required')).toBe(false);
  });

  it('every queue explains its empty state in words a person can act on', () => {
    for (const [route, queue] of Object.entries(JOB_QUEUES)) {
      expect(queue.emptyTitle.length, `${route} has no empty title`).toBeGreaterThan(0);
      expect(queue.emptyBody.length, `${route} has no empty body`).toBeGreaterThan(20);
      expect(queue.description.length, `${route} has no description`).toBeGreaterThan(0);
      // "No results" is exactly the uninformative text this guards against.
      expect(queue.emptyTitle.toLowerCase()).not.toBe('no results');
    }
  });
});
