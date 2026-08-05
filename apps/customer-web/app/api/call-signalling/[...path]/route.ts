import { NextRequest, NextResponse } from 'next/server';
import { apiBaseUrl, workspaceAuth } from '@autoworkshop/auth';
import { activeOrganizationHeader, activeRoleHeader } from '@autoworkshop/next-shell';

/**
 * THE SIGNALLING PROXY (CUSTOMER WORKSPACE) — slice 11.
 *
 * 🔴 IDENTICAL TO workshop-web'S EXCEPT FOR THE WORKSPACE ID, which is the one
 * character of difference LOCAL TESTING CANNOT CATCH: `:3000` and `:3001`
 * share one cookie jar because cookies ignore the PORT, so a wrong id works
 * perfectly on a developer's machine and fails only on the deployed hosts.
 * Recorded three times in this repository.
 * The one place this product lets the BROWSER
 * reach the API, and it is deliberately the narrowest door in the building.
 *
 * ── 🔴 WHY A PROXY AT ALL, WHEN EVERY OTHER SCREEN READS SERVER-SIDE ───────
 *
 * `apiGet` is server-only on purpose: the access token lives in an encrypted
 * httpOnly cookie and never reaches the browser, so a page renders data without
 * the browser ever holding a credential it could leak.
 *
 * WebRTC breaks that pattern for one reason only: the negotiation happens
 * IN THE BROWSER, over a few seconds, and each ICE candidate must be delivered
 * as it is discovered. A server component cannot do that — it renders once.
 *
 * ── 🔴 SO THE TOKEN STILL NEVER LEAVES THE SERVER ──────────────────────────
 *
 * The browser calls THIS route with its session cookie; this route reads the
 * token server-side and forwards. The credential is added here and is never
 * present in any response. That is the whole point of the proxy — a client that
 * fetched the API directly would need the bearer token in JavaScript.
 *
 * ── 🔴 AND IT FORWARDS ONLY CALL SIGNALLING ────────────────────────────────
 *
 * A general `/api/[...path]` proxy would hand the browser the ENTIRE API under
 * the viewer's identity — every endpoint this product has, callable from the
 * console, with the tenant context attached. That is a far larger hole than the
 * problem being solved.
 *
 * The allow-list below is therefore a whitelist of exact shapes, not a prefix
 * check. `/calls/<uuid>/signals`, `/calls/<uuid>/events`, `/calls/<uuid>/join`
 * and `/calls/ice-servers` — nothing else, whatever path is requested.
 *
 * ⚠️ AUTHORISATION IS STILL THE API'S. `CallsService.assertParticipant` refuses
 * a call the viewer is not on. This route decides WHICH ENDPOINTS are reachable
 * from a browser; it does not decide who may use them, and it must never be
 * read as if it did.
 */

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

/** Exact shapes. A prefix check would let `/calls/../../users` through. */
const ALLOWED: { method: 'GET' | 'POST'; pattern: RegExp }[] = [
  { method: 'GET', pattern: new RegExp(`^calls/ice-servers$`) },
  { method: 'GET', pattern: new RegExp(`^calls/${UUID}/signals$`) },
  { method: 'POST', pattern: new RegExp(`^calls/${UUID}/signals$`) },
  { method: 'POST', pattern: new RegExp(`^calls/${UUID}/events$`) },
  { method: 'POST', pattern: new RegExp(`^calls/${UUID}/join$`) },
];

function permitted(method: 'GET' | 'POST', path: string): boolean {
  return ALLOWED.some((a) => a.method === method && a.pattern.test(path));
}

async function forward(
  req: NextRequest,
  method: 'GET' | 'POST',
  segments: string[],
): Promise<NextResponse> {
  const path = segments.join('/');

  if (!permitted(method, path)) {
    // Deliberately terse. A browser reaching for something outside the
    // signalling surface is not a user who needs guidance.
    return NextResponse.json({ error: 'not a signalling endpoint' }, { status: 404 });
  }

  // `getAccessToken()`, not `auth()`. The former REFRESHES an expired
  // Keycloak token; reading `session.accessToken` directly would hand the
  // API a stale bearer a few minutes into any call and the signalling would
  // start 401ing mid-negotiation.
  const token = await workspaceAuth('customer').getAccessToken();
  if (!token) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // The same organisation and role headers every server-side read sends, so a
  // signalling call resolves the SAME tenant context as the page that started
  // it. Omitting them would let a call be negotiated in one organisation and
  // read in another.
  //
  // ⚠️ BOTH HELPERS RETURN A HEADER RECORD, not a bare id — they check the
  // viewer actually holds that organisation and role before emitting
  // anything, and return {} when they do not. Reading them as strings would
  // have sent the literal "[object Object]".
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    ...(await activeOrganizationHeader('customer')),
    ...(await activeRoleHeader('customer')),
  };

  const search = req.nextUrl.search ?? '';
  const body = method === 'POST' ? await req.text() : undefined;

  try {
    const res = await fetch(`${apiBaseUrl()}/${path}${search}`, {
      method,
      headers,
      body,
      cache: 'no-store',
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
    });
  } catch {
    // Never throws: a failed signalling poll must not take out the call room.
    // The client keeps polling and reports `connection_failed` if ICE gives up.
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params;
  return forward(req, 'GET', path);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params;
  return forward(req, 'POST', path);
}
