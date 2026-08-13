import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE FUNNEL'S LAST LINK — enrol, THEN send.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 WHY THIS FILE EXISTS: `POST /registration/customer` WAS BUILT, DEPLOYED,
 *    GATED, TESTED — AND CALLED BY NOTHING.
 *
 * Measured 2026-08-08. `identity.memberships` has only two writers in the whole
 * product: `register_workshop`, which grants `workshop_owner`, and the
 * admin-only `MembershipService.grant()`. Neither can produce a `customer`. So
 * a real Keycloak sign-up arrived at the Request for Service form holding no
 * membership at all, and `POST /service-requests` — behind `TenantGuard` —
 * refused them. The funnel ended on a wall.
 *
 * Migration 061 and the enrolment route were built to fix exactly that, and
 * then no client ever called them. The route answered 401 on live and looked
 * perfectly healthy doing it. That is the "complete service with no reachable
 * caller" defect this repository has shipped before, and it was found by
 * grepping for a caller — not by any test, because no test asked.
 *
 * So this asserts the WIRING, which is the part that was missing. The route's
 * own behaviour is covered by `customer-enrolment.integration.spec.ts` against
 * a real database.
 * ══════════════════════════════════════════════════════════════════════════
 */

const apiPost = vi.fn();
vi.mock('@autoworkshop/next-shell', () => ({ apiPost: (...a: unknown[]) => apiPost(...a) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { requestServiceAction } = await import('./request-service-actions');

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const VALID = {
  organizationId: 'd1032918-870e-473a-8d63-e31bba0193be',
  vehicleDescription: 'Toyota Corolla 2014',
  complaint: 'Grinding when I brake',
};

beforeEach(() => {
  apiPost.mockReset();
});

describe('requestServiceAction enrols the customer before sending', () => {
  it('🔴 calls /registration/customer FIRST, then /service-requests', async () => {
    apiPost
      .mockResolvedValueOnce({ ok: true, data: { created: true } })
      .mockResolvedValueOnce({ ok: true, data: { id: 'req-1' } });

    const result = await requestServiceAction(form(VALID));

    expect(result).toEqual({ created: 'req-1' });
    expect(apiPost).toHaveBeenCalledTimes(2);

    // ⚠️ THE ORDER IS THE ASSERTION. Enrolling AFTER the request would be a
    // no-op: the request is what needs the membership, and it would already
    // have been refused.
    const [firstWorkspace, firstPath, firstBody] = apiPost.mock.calls[0]!;
    expect(firstWorkspace).toBe('customer');
    expect(firstPath).toBe('/registration/customer');
    expect(firstBody).toEqual({ organizationId: VALID.organizationId });

    const [, secondPath] = apiPost.mock.calls[1]!;
    expect(secondPath).toBe('/service-requests');
  });

  it('enrols at the workshop the customer actually chose', async () => {
    // A different organisation must produce a different enrolment — pinning
    // that the id is threaded through rather than hardcoded anywhere.
    const other = '11111111-2222-3333-4444-555555555555';
    apiPost
      .mockResolvedValueOnce({ ok: true, data: { created: false } })
      .mockResolvedValueOnce({ ok: true, data: { id: 'req-2' } });

    await requestServiceAction(form({ ...VALID, organizationId: other }));

    expect(apiPost.mock.calls[0]![2]).toEqual({ organizationId: other });
  });

  it('an expired session is reported BEFORE anything is sent', async () => {
    // The person can still recover what they typed at this point, which is the
    // whole reason this is checked here rather than after the request.
    apiPost.mockResolvedValueOnce({ ok: false, reason: 'unauthenticated' });

    const result = await requestServiceAction(form(VALID));

    expect(result.error).toMatch(/session has ended/i);
    expect(result.error).toMatch(/nothing has been sent/i);
    // 🔴 AND THE REQUEST WAS NEVER ATTEMPTED. If it were, "nothing has been
    // sent" would be a lie, and a person told that will resend — which is how
    // one car gets booked into a workshop twice.
    expect(apiPost).toHaveBeenCalledTimes(1);
  });

  it('a non-auth enrolment failure still lets the request speak for itself', async () => {
    // An unpublished workshop, or an account that already holds a staff role
    // there, are refusals the REQUEST reports in its own words. Two differently
    // worded walls for one cause is worse than one.
    apiPost
      .mockResolvedValueOnce({ ok: false, reason: 'invalid', message: 'not accepting customers' })
      .mockResolvedValueOnce({ ok: false, reason: 'notFound' });

    const result = await requestServiceAction(form(VALID));

    expect(apiPost).toHaveBeenCalledTimes(2);
    expect(result.error).toMatch(/no longer listed/i);
  });

  it('refuses with no workshop, and sends nothing at all', async () => {
    const result = await requestServiceAction(
      form({ vehicleDescription: 'x', complaint: 'y' }),
    );
    expect(result.error).toMatch(/Choose a workshop first/i);
    expect(apiPost).not.toHaveBeenCalled();
  });
});
