import { viewerHasSession } from '@autoworkshop/next-shell';
import { PageHeader, EmptyState } from '@autoworkshop/ui';
import { RequestServiceScreen } from '../../../_screens/request-service-screen';
import { REQUEST_SERVICE_PATH } from '@autoworkshop/marketplace-ui';

/**
 * `/service-and-repairs/request-service?workshop=<id>` — the owner's value
 * chain, step 4-5.
 *
 * ⚠️ NO `requireNavRoute`. This route is reached from a MECHANIC CARD in the
 * public directory, not from the customer's own menu, so it is deliberately not
 * a menu entry — and gating it on the nav tree would 404 the one link the whole
 * funnel depends on. Authorization is where it belongs: `POST /service-requests`
 * requires a session, and RLS pins the author to the caller.
 *
 * ── 🔴 WHY A SIGNED-OUT VISITOR IS STOPPED BEFORE THE FORM, NOT AFTER IT ────
 *
 * Found by the Supervisor, 2026-08-07. The landing's "Request repair service"
 * button lives on the APEX (workshop-web) and points HERE — a DIFFERENT HOST.
 * Cookies are host-scoped and each app runs its own Auth.js instance with its
 * own session cookie (`apps/e2e/verify/verify-single-sign-on.mjs`), so somebody
 * who is signed in on the apex arrives on this page ANONYMOUS.
 *
 * The form rendered for them anyway: `/vehicles` 401s and is swallowed into an
 * empty garage, which is indistinguishable from a customer with no cars yet. So
 * they described their fault, chose a workshop, pressed Send — and only then got
 * "Your session has ended. Sign in again, then resend", **with everything they
 * had typed gone**. That is the owner's primary funnel, and it lost people at
 * the last step.
 *
 * A visible refusal BEFORE the form is the honest version: it costs one click
 * and cannot lose anything. `callbackUrl` carries the visitor back to this exact
 * page — the chosen workshop included — so signing in resumes the request rather
 * than restarting it. Keycloak's own login page carries the Register link, so
 * somebody with no account still reaches the form in one journey.
 *
 * ⚠️ `viewerHasSession` decrypts the LOCAL cookie and makes no network call, so
 * this cannot mistake a cold or sleeping API for a signed-out visitor. That
 * distinction is a recorded defect in this repository ("a transport failure is
 * not an authorization fact"), and it is why the check is this one and not a
 * `/me` lookup.
 */
export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const raw = params['workshop'];
  const workshopId = Array.isArray(raw) ? raw[0] : raw;

  if (!(await viewerHasSession('customer'))) {
    // The workshop they already chose is preserved, so the round trip through
    // sign-in returns them to the request they had started.
    const back = workshopId
      ? `${REQUEST_SERVICE_PATH}?workshop=${encodeURIComponent(workshopId)}`
      : REQUEST_SERVICE_PATH;
    return (
      <>
        <PageHeader
          title="Request for Service"
          description="Tell the workshop what is wrong. They will confirm before any work starts."
        />
        <EmptyState
          title="Sign in to send a service request"
          description="The workshop needs to know who is asking and how to reach you. Signing in takes you straight back to this form, and the workshop you picked is kept."
          action={
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href={`/api/auth/signin?callbackUrl=${encodeURIComponent(back)}`}>
                Sign in and continue
              </a>
              {/* No account yet: Keycloak's registration form, then back here. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/api/auth/register">Create an account</a>
            </div>
          }
        />
      </>
    );
  }

  return <RequestServiceScreen workshopId={workshopId} />;
}
