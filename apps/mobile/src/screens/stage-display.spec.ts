import { describe, expect, it } from 'vitest';
import { humanStage, normaliseOptions, stageAvailability } from './stage-display';

/**
 * The two pure functions the detail screen depends on. Both exist because the
 * screen must not crash on data it did not expect — a phone in a workshop is
 * the worst place to meet a white screen.
 */

describe('humanStage', () => {
  it('turns a snake_case stage into words a person reads', () => {
    expect(humanStage('initial_inspection')).toBe('Initial inspection');
    expect(humanStage('ready_for_collection')).toBe('Ready for collection');
  });

  it('leaves a single word alone but still capitalises it', () => {
    expect(humanStage('closed')).toBe('Closed');
  });

  // Not decoration: `humanStage('')` running `.charAt(0).toUpperCase()` on an
  // empty string must not throw, because an absent stage is renderable data.
  it('survives an empty stage', () => {
    expect(humanStage('')).toBe('');
  });
});

describe('normaliseOptions', () => {
  // 🔴 THE SHAPE HAS BEEN SEEN BOTH WAYS. Accepting only one and crashing on
  // the other would make the screen depend on an API detail it does not own.
  it('accepts a list of plain strings', () => {
    expect(normaliseOptions(['work_in_progress', 'quality_control'])).toEqual([
      { value: 'work_in_progress', label: 'Work in progress' },
      { value: 'quality_control', label: 'Quality control' },
    ]);
  });

  it('accepts a list of {value,label} and keeps the server label', () => {
    expect(normaliseOptions([{ value: 'closed', label: 'Close the job' }])).toEqual([
      { value: 'closed', label: 'Close the job' },
    ]);
  });

  it('derives a label when the object omits one', () => {
    expect(normaliseOptions([{ value: 'awaiting_parts' }])).toEqual([
      { value: 'awaiting_parts', label: 'Awaiting parts' },
    ]);
  });

  // An absent field is the ordinary case for a closed card, not an error.
  it('treats undefined and a non-array as no options', () => {
    expect(normaliseOptions(undefined)).toEqual([]);
    expect(normaliseOptions('nonsense' as never)).toEqual([]);
  });

  // A blank value would render a button that sends an empty stage — the API
  // would refuse it, but offering it at all is a promise the screen cannot keep.
  it('drops entries with no usable value', () => {
    expect(normaliseOptions([{ value: '' }, { value: 'ok' }])).toEqual([
      { value: 'ok', label: 'Ok' },
    ]);
  });
});

/**
 * 🔴 A DRIFT CHECK AGAINST THE API'S OWN INTERFACE.
 *
 * The field was first written as `stageOptions`, which the API does not return.
 * Nothing threw: the screen rendered its "your role cannot move this job" text
 * to everyone, including the users who could. A wrong field name in a tolerant
 * reader is invisible — so this reads the API source and fails if the name this
 * app depends on stops existing there.
 */
describe('the field name this screen depends on', () => {
  it("`allowedStages` is what the API's JobCard actually declares", async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(
      join(__dirname, '../../../api/src/repair/job-card.service.ts'),
      'utf8',
    );

    const iface = /export interface JobCard \{([\s\S]*?)\n\}/.exec(source);
    expect(iface, 'could not find the JobCard interface in the API').toBeTruthy();
    const body = iface?.[1] ?? '';

    // Guards the regex: an empty match would make every assertion below vacuous.
    expect(body.length).toBeGreaterThan(100);
    expect(body).toContain('allowedStages');
    // And the name that caused the bug must NOT be there, so this test fails
    // loudly if the API ever renames it back.
    expect(body).not.toContain('stageOptions');
  });
});

describe('stageAvailability — four different reasons, four different answers', () => {
  it('offers the moves when the server sent some', () => {
    const a = stageAvailability({ allowedStages: ['quality_control'], closedAt: null });
    expect(a.kind).toBe('options');
    expect(a.kind === 'options' && a.options[0]?.label).toBe('Quality control');
  });

  // A closed job is about the JOB, and outranks everything else.
  it('reports closed even when a stray option list is present', () => {
    expect(stageAvailability({ allowedStages: ['x'], closedAt: '2026-01-01' }).kind).toBe('closed');
  });

  // Present but empty IS the server's answer about this viewer.
  it('reports noMoves for an empty list', () => {
    expect(stageAvailability({ allowedStages: [], closedAt: null }).kind).toBe('noMoves');
  });

  // 🔴 THE ONE THAT MATTERS. A missing or malformed field is an APP problem,
  // and must never be reported as a statement about the user's permissions.
  it('reports unavailable — not a permission claim — when the field is missing', () => {
    expect(stageAvailability({ closedAt: null }).kind).toBe('unavailable');
  });

  it('reports unavailable when the field is not a list', () => {
    expect(stageAvailability({ allowedStages: 'nope' as never, closedAt: null }).kind).toBe(
      'unavailable',
    );
  });

  // An all-junk list is still a real list: the server answered, the entries are
  // simply unusable. Treated as noMoves rather than a contract break.
  it('reports noMoves when every entry is unusable', () => {
    expect(stageAvailability({ allowedStages: [{ value: '' }], closedAt: null }).kind).toBe(
      'noMoves',
    );
  });
});
