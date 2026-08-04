import { AuthErrorScreen } from '@autoworkshop/next-shell';

/**
 * /auth/error — where `pages.error` sends a failed sign-in.
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
