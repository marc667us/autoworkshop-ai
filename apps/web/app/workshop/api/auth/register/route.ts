import { NextRequest, NextResponse } from 'next/server';
import { clientIdForWorkspace, keycloakIssuer } from '@autoworkshop/auth';

/**
 * ⚠️ MOUNTED IN workshop-web TOO, BECAUSE workshop-web OWNS THE APEX.
 *
 * Codex, 2026-08-05: the shared landing hard-codes `/api/auth/register` on its
 * primary call to action, and this route existed only in customer-web. So on
 * `autoworkshop.aiappinvent.com` — the one address anybody has — "Create a free
 * account" answered 404. The single most important button on the public front
 * door was dead, and the page looked perfectly healthy either side of it.
 *
 * The client id differs (`workshop`, not `customer`), which is why this is a
 * sibling route rather than a re-export: each app registers its own Keycloak
 * client and a shared handler would send visitors through the wrong one.
 *
 * ⚠️ VERIFIED AGAINST THE LIVE REALM, 2026-08-05, AND THE COMMITTED REALM FILE
 * DISAGREES WITH IT. `infrastructure/keycloak/realm-autoworkshop.json` lists
 * `autoworkshop-workshop-web` with redirect URIs `http://localhost:3001/*` and
 * `https://workshop.autoworkshop.aiappinvent.com/*` — the APEX is on the
 * *customer* client there. Read literally, this route would send the apex a
 * `redirect_uri` Keycloak rejects, and the security review flagged exactly that.
 *
 * The live realm has drifted: driving it directly, both
 * `.../protocol/openid-connect/auth` and `.../registrations` answer **302** for
 * `client_id=autoworkshop-workshop-web` with
 * `redirect_uri=https://autoworkshop.aiappinvent.com/api/auth/callback/keycloak`.
 * So this works today — but a re-import of the committed file would silently
 * break both sign-in and sign-up on the apex, and that file should be brought
 * back in step with production.
 *
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
  const clientId = clientIdForWorkspace('workshop');

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
