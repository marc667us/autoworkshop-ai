import { apiGet } from '@autoworkshop/next-shell';

/**
 * THE NAVIGATION BADGES, COUNTED FROM REAL RECORDS — slice 7.
 *
 * ── 🔴 WHAT THIS REPLACES ──────────────────────────────────────────────────
 *
 * `layout.tsx` carried seven hardcoded figures — 7 open tasks, 3 approvals, 4
 * complaints, 6 appointments, 12 active jobs, 2 proposals, 5 unread messages —
 * plus a reorder warning of 2 and three more counts on the top-nav actions. A
 * comment called them "placeholder figures", but nothing on screen said so. A
 * workshop with three jobs was told it had twelve, on the first page it saw,
 * every time.
 *
 * ── ⚠️ THE RULE HERE: COUNT IT OR OMIT IT ──────────────────────────────────
 *
 * A key absent from the returned record renders NO badge, which says nothing.
 * A key present with a wrong number says something false. So this returns only
 * what the API can count today and leaves the rest out — the remaining keys
 * gain numbers as their slices land, and until then the navigation is quiet
 * rather than wrong.
 *
 * ── ⚠️ AND IT NEVER BREAKS THE SHELL ───────────────────────────────────────
 *
 * Every failure path returns empty. The badges are decoration on the frame that
 * renders every page; a messaging outage must not take the navigation down with
 * it. That is the opposite of the rule inside a screen, where a failed read has
 * to be visible — here the honest fallback genuinely is silence.
 */

interface InboxItem {
  kind: string;
  count: number;
}

export interface LiveCounters {
  counters: Record<string, number>;
  warnings: Record<string, number>;
}

const EMPTY: LiveCounters = { counters: {}, warnings: {} };

export async function liveCounters(signedIn: boolean): Promise<LiveCounters> {
  // A signed-out visitor has no workshop to count anything in, and asking would
  // be a guaranteed 401 on every public page load.
  if (!signedIn) return EMPTY;

  const inbox = await apiGet<InboxItem[]>('workshop', '/comms/inbox');
  if (!inbox.ok) return EMPTY;

  const by = new Map(inbox.data.map((i) => [i.kind, i.count]));

  const counters: Record<string, number> = {};
  const warnings: Record<string, number> = {};

  // Only set a key when there is something to say. Zero is deliberately treated
  // as "no badge" rather than "a badge reading 0" — an empty inbox should look
  // empty, not annotated.
  const unread = by.get('messages') ?? 0;
  if (unread > 0) counters['workshop.messages.unread'] = unread;

  const approvals = by.get('approvals') ?? 0;
  if (approvals > 0) counters['workshop.approvals.pending'] = approvals;

  // A reorder level reached is a WARNING rather than a count: it is not work
  // waiting in a queue, it is a condition that wants attention.
  const reorder = by.get('stock') ?? 0;
  if (reorder > 0) warnings['workshop.parts.reorderAlerts'] = reorder;

  return { counters, warnings };
}
