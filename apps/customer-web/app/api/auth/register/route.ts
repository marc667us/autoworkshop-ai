import { NextRequest, NextResponse } from 'next/server';
import { clientIdForWorkspace, keycloakIssuer } from '@autoworkshop/auth';

/**
 * "Create an account" — sends the visitor to Keycloak's REGISTRATION page.
 *
 * ⚠️ WHY THIS ROUTE EXISTS RATHER THAN A LINK ON THE LANDING PAGE. Keycloak's
 * registration form lives at `/protocol/openid-connect/registrations`, which
 * needs the client id, the redirect URI and a response type — i.e. the same
 * parameters as a login request. Building that URL in the page would put the
 * Keycloak client id into the rendered HTML of a PUBLIC page and hardcode the
 * issuer at two call sites. Redirecting from the server keeps both in config.
 *
 * ⚠️ AND WHY IT IS NOT `/api/auth/signin`. Auth.js's sign-in route lands on the
 * LOGIN form. Keycloak does render a "Register" link there, but only when the
 * realm allows registration, and it is a second click on a form that has
 * already asked for a password the visitor does not have. Sending them to the
 * registration form directly is what the landing page's button says it does.
 *
 * The realm must have `registration_allowed = true` — verified true for the
 * `autoworkshop` realm. If that is ever turned off, Keycloak answers this URL
 * with its own "registration not enabled" page rather than a broken redirect,
 * which is the right failure: visible, and owned by the identity provider.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const issuer = keycloakIssuer();
  const clientId = clientIdForWorkspace('customer');

  // The origin is taken from the incoming request rather than from config so a
  // tunnel or a preview host redirects back to ITSELF. A hardcoded localhost
  // here is the classic "works on my machine, dead on the tunnel" bug, and this
  // repo already has a standing rule to test the tunnel URL, not 127.0.0.1.
  const origin = request.nextUrl.origin;

  const url = new URL(`${issuer}/protocol/openid-connect/registrations`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid profile email');
  url.searchParams.set('redirect_uri', `${origin}/api/auth/callback/keycloak`);

  return NextResponse.redirect(url.toString());
}
