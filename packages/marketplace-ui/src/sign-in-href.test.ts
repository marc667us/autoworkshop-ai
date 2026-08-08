import { describe, expect, it } from 'vitest';
import { signInHrefFor } from './marketplace-landing';

/**
 * 🔴 SEPARATE HOSTS ARE SEPARATE SESSIONS, AND THIS IS THE LINK THAT FORGOT IT.
 *
 * The owner, three times: "customer page comes up when owner logs in", then
 * "there is user role conflict between owner and customer".
 *
 * Reading the LIVE apex HTML is what found it. The mechanic card's
 * "Sign in to request service" rendered as:
 *
 *   /api/auth/signin?callbackUrl=https%3A%2F%2Fautoworkshop-customer.onrender.com%2F…
 *
 * — the APEX's own sign-in route, handed a CUSTOMER-WEB destination. On the
 * apex `requestServiceHref` is absolute, because the form lives in a different
 * app on a different host. Auth.js sessions do not cross hosts here (the cookie
 * is per workspace, set on one origin), so that link authenticates somebody as
 * the WORKSHOP and drops them on customer-web as a stranger.
 *
 * From the owner's seat that is "I logged in and got the customer app" — a role
 * conflict that is really a HOST conflict. And Auth.js refuses a cross-origin
 * `callbackUrl` anyway, so the destination was silently dropped too.
 */
describe('signInHrefFor — sign in on the host that owns the destination', () => {
  const ORG = 'd1032918-870e-473a-8d63-e31bba0193be';

  it('🔴 an ABSOLUTE href signs in at ITS OWN origin, not the current one', () => {
    const href = signInHrefFor(
      'https://autoworkshop-customer.onrender.com/service-and-repairs/request-service',
      ORG,
    );
    expect(href.startsWith('https://autoworkshop-customer.onrender.com/api/auth/signin')).toBe(
      true,
    );
    // ⚠️ AND THE CALLBACK IS PATH-ONLY. A cross-origin callbackUrl is refused by
    // Auth.js and silently dropped, which would land the visitor on that app's
    // landing instead of the form they asked for.
    const cb = decodeURIComponent(new URL(href).searchParams.get('callbackUrl') ?? '');
    expect(cb.startsWith('/service-and-repairs/request-service')).toBe(true);
    expect(cb).toContain(`workshop=${ORG}`);
    expect(cb).not.toMatch(/^https?:/);
  });

  it('a RELATIVE href uses the local sign-in route', () => {
    // customer-web passes a relative path — the form is in the same app, so the
    // local route is correct and an origin would be wrong.
    const href = signInHrefFor('/service-and-repairs/request-service', ORG);
    expect(href.startsWith('/api/auth/signin?callbackUrl=')).toBe(true);
    expect(decodeURIComponent(href)).toContain(`/service-and-repairs/request-service?workshop=${ORG}`);
  });

  it('falls back to the dashboard rather than building a link to nowhere', () => {
    const href = signInHrefFor(undefined, ORG);
    expect(decodeURIComponent(href)).toContain('/home/dashboard');
  });

  it('carries the workshop, so the funnel does not lose the chosen garage', () => {
    // Losing it sends the visitor back to hunt for the card they just clicked.
    for (const base of ['/x', 'https://h.example/x']) {
      expect(decodeURIComponent(signInHrefFor(base, ORG))).toContain(ORG);
    }
  });
});
