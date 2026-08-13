/**
 * Which repair a vehicle is CURRENTLY in — the garage card's status.
 *
 * ── 🔴 THE DEFECT THIS EXISTS TO FIX ────────────────────────────────────────
 *
 * The garage card showed `vehicle.status`, which is the VEHICLE RECORD's
 * lifecycle field and reads `active` or `draft`. It was the only badge on the
 * card, so a customer whose car was in the workshop being repaired saw the word
 * "active" and learned nothing at all about their car. Owner, 2026-08-06:
 * *"they must have views on each section or card outputs on what the status on
 * their vehicle repair"*.
 *
 * ── WHY THIS IS A SEPARATE MODULE ───────────────────────────────────────────
 *
 * Purely so it can be TESTED. `garage-screen.tsx` imports
 * `@autoworkshop/next-shell`, which pulls in `next-auth`, which cannot be loaded
 * in a plain vitest run — so anything exported from the screen is untestable in
 * practice. The decisions below are the ones most likely to be quietly wrong, so
 * they live where a test can reach them. `repair-journey.ts` is the same shape
 * for the same reason.
 *
 * ⚠️ NO IMPORTS. Keep it that way, or it becomes untestable exactly as the
 * screen is.
 */

export interface JobCardStatus {
  /** Used ONLY to break a timestamp tie deterministically. See below. */
  id: string;
  vehicleId: string;
  stage: string;
  stageChangedAt: string;
  closedAt?: string | null;
}

/**
 * The current OPEN repair for each vehicle, keyed by vehicle id.
 *
 * ⚠️ CLOSED CARDS ARE EXCLUDED, and that is the difference between a useful
 * badge and a misleading one. A car with three completed repairs and nothing
 * open is not "being repaired", it is parked — stamping a stale "Ready for
 * collection" on it would be a confident lie on the owner's own garage screen,
 * and it would be MOST wrong for the customer who uses the product most.
 *
 * Among the open ones the most recently moved wins, because that is the card
 * whose stage describes where the car actually is. A vehicle should not carry
 * two open cards, but the data model permits it, and choosing arbitrarily would
 * make the badge flip between two truths depending on the order rows came back.
 */
export function currentRepairByVehicle(
  cards: readonly JobCardStatus[],
): Map<string, JobCardStatus> {
  const current = new Map<string, JobCardStatus>();
  for (const c of cards) {
    if (c.closedAt) continue;
    const seen = current.get(c.vehicleId);
    if (!seen || wins(c, seen)) current.set(c.vehicleId, c);
  }
  return current;
}

/**
 * Does `a` describe the vehicle better than `b`?
 *
 * 🔴 THE TIE-BREAK IS THE POINT, AND THE COMMENT HERE USED TO BE FALSE. This was
 * a bare `a.stageChangedAt > b.stageChangedAt`, above a comment asserting that
 * strict `>` made equal timestamps order-independent. It does the exact
 * opposite: on a tie the comparison is false, so the FIRST row seen is kept and
 * `[a, b]` and `[b, a]` select different cards. The test named
 * "order-independent" used DIFFERENT timestamps, so it never touched the tie and
 * passed while the claim was wrong. Caught by Codex, 2026-08-06 — the second
 * time in this repository that a confident comment described a guard that was
 * not there.
 *
 * Two open cards on one vehicle should not happen, but the data model permits
 * it, and two cards written in the same transaction share a timestamp to the
 * millisecond. `id` is compared only to settle that: it carries no meaning, it
 * is simply STABLE, which is the whole requirement. A badge that flips between
 * "Being repaired" and "Waiting for your approval" depending on row order is
 * worse than either answer.
 */
function wins(a: JobCardStatus, b: JobCardStatus): boolean {
  if (a.stageChangedAt !== b.stageChangedAt) return a.stageChangedAt > b.stageChangedAt;
  return a.id > b.id;
}
