import { AuthErrorScreen } from '@autoworkshop/next-shell';

/**
 * /auth/error — where `pages.error` sends a failed sign-in.
 *
 * 🔴 ADR-021 — THERE IS ONE OF THESE NOW, AT THE ARTIFACT ROOT, AND IT NEARLY
 * WAS NOT. Seven identical copies moved with their packs and every one landed
 * at `/<pack>/auth/error`, while `workspace-auth.ts` sets
 * `pages: { error: '/auth/error' }` — an ARTIFACT path. So the seven copies
 * covered a route nothing pointed at, and the route Auth.js actually redirects
 * to did not exist. A failed sign-in would have hit a bare 404 instead of the
 * honest "Keycloak is starting up" screen this file exists to show, which is
 * the worst possible moment to lose an explanation: Keycloak has been measured
 * here at 126-137s from cold, so a first-visit sign-in is precisely when people
 * meet this page.
 *
 * Nothing failed to build. Seven mounted routes and one dangling config string
 * typecheck perfectly.
 *
 * ⚠️ THIS ROUTE MUST EXIST IN ALL SEVEN APPS. `workspace-auth.ts` sets
 * `pages.error` for every workspace from one shared config, so an app without
 * this file turns a recoverable Keycloak cold start into a 404 — strictly worse
 * than the default screen it replaced. `auth-error-route.spec.ts` asserts all
 * seven are present.
 *
 * Deliberately NOT gated: it is reached BY someone who could not sign in.
 */
export const dynamic = 'force-dynamic';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Next 15: `searchParams` is a promise.
  const { error } = await searchParams;
  return <AuthErrorScreen error={error} />;
}
