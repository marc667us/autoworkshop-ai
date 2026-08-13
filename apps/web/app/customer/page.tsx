import { redirect } from 'next/navigation';

/**
 * `/customer` — the customer pack's index.
 *
 * WHY THIS FILE HAD TO BE WRITTEN RATHER THAN MOVED. Every other pack arrived
 * with an index of its own, because each was a deployed application and `/` was
 * its front door. The customer pack's front door was the PUBLIC MARKETPLACE,
 * and under ADR-021 that belongs to the artifact, not to a pack — a stranger
 * looking for parts should land on `autoworkshop.aiappinvent.com`, not on
 * `/customer`. So its old index was hoisted to `app/page.tsx` and this mount
 * was left with nothing.
 *
 * 🔴 IT 404'd, AND ONLY RUNNING THE APP FOUND IT. Typecheck, lint and a
 * 345-route build were all green: nothing about a missing index is a type
 * error, and `/customer/my-vehicles/garage` answered 200 throughout, so every
 * check that walked the navigation tree passed. The hole was exactly one URL
 * wide — the one a person reaches by deleting the rest of the path, which is
 * what somebody does when they are lost.
 *
 * Sends people to the dashboard rather than rendering anything, matching what
 * the other six packs do. `redirect()` is the same call the customer's old
 * index made for a signed-in visitor.
 */
export default function CustomerIndex() {
  redirect('/customer/home/dashboard');
}
