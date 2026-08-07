import { describe, expect, it } from 'vitest';

import { REQUEST_SERVICE_PATH, requestServiceHrefFrom } from './customer-app';

/**
 * These assertions exist because the button this governs shipped on 2026-08-07
 * having passed typecheck, lint, unit tests, a container smoke test and a
 * Render deploy — and could not render on live, because nothing had ever
 * checked that the variable it reads was actually set to something usable.
 *
 * So the REFUSALS carry the weight here. A test that only proves the happy
 * path would have passed on the day the feature was invisible.
 */
describe('requestServiceHrefFrom', () => {
  it('builds an absolute href from the customer app origin', () => {
    expect(requestServiceHrefFrom({ CUSTOMER_WEB_URL: 'https://autoworkshop-customer.onrender.com' }))
      .toBe(`https://autoworkshop-customer.onrender.com${REQUEST_SERVICE_PATH}`);
  });

  it('tolerates a trailing slash rather than producing a doubled one', () => {
    expect(requestServiceHrefFrom({ CUSTOMER_WEB_URL: 'https://example.test/' }))
      .toBe(`https://example.test${REQUEST_SERVICE_PATH}`);
  });

  it('still accepts the older NEXT_PUBLIC_ name so a configured environment keeps working', () => {
    expect(requestServiceHrefFrom({ NEXT_PUBLIC_CUSTOMER_WEB_URL: 'https://example.test' }))
      .toBe(`https://example.test${REQUEST_SERVICE_PATH}`);
  });

  it('prefers the runtime name when both are present', () => {
    expect(
      requestServiceHrefFrom({
        CUSTOMER_WEB_URL: 'https://new.test',
        NEXT_PUBLIC_CUSTOMER_WEB_URL: 'https://old.test',
      }),
    ).toBe(`https://new.test${REQUEST_SERVICE_PATH}`);
  });

  it('refuses when unset — a missing button beats a button that goes nowhere', () => {
    expect(requestServiceHrefFrom({})).toBeUndefined();
  });

  it('refuses a BLANK value, which is what Render returns for a declared-but-unset variable', () => {
    // Interpolating '' would yield the path alone: a same-host link that 404s
    // on the apex while looking perfectly configured.
    expect(requestServiceHrefFrom({ CUSTOMER_WEB_URL: '' })).toBeUndefined();
    expect(requestServiceHrefFrom({ CUSTOMER_WEB_URL: '   ' })).toBeUndefined();
  });

  it('refuses a RELATIVE value — the form is on another host, so only absolute works', () => {
    expect(requestServiceHrefFrom({ CUSTOMER_WEB_URL: '/customer' })).toBeUndefined();
    expect(requestServiceHrefFrom({ CUSTOMER_WEB_URL: 'autoworkshop-customer.onrender.com' }))
      .toBeUndefined();
  });

  it('refuses a non-http scheme — this value is interpolated into an anchor', () => {
    expect(requestServiceHrefFrom({ CUSTOMER_WEB_URL: 'javascript:alert(1)' })).toBeUndefined();
    expect(requestServiceHrefFrom({ CUSTOMER_WEB_URL: 'mailto:someone@example.test' })).toBeUndefined();
  });
});
