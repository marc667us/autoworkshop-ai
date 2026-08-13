import { Suspense } from 'react';
import { apiGet } from '@autoworkshop/next-shell';
import { LoadingState, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';

/**
 * The customer's own Requests for Service — what they asked, and what came back.
 *
 * ── 🔴 THE GAP THIS CLOSES ─────────────────────────────────────────────────
 *
 * `GET /service-requests` returns the caller's own requests and NOTHING
 * rendered it. A customer could pick a workshop from the public directory, file
 * a request, and then have no way to see whether anyone had read it, accepted
 * it, or turned it away — the workshop's inbox existed and the customer's side
 * of the same conversation did not.
 *
 * That is the customer half of a failure this repository has already shipped
 * once: a complete, correct service with no reachable caller.
 *
 * ⚠️ THE DECLINE REASON IS SHOWN, PROMINENTLY. A workshop that turns work away
 * owes the person an answer, and the whole chain — the form's `required`, the
 * service's refusal, and `ck_service_request_declined` — exists to guarantee
 * there IS one. Collecting a reason and never displaying it would make all three
 * guards pointless.
 */
interface MyServiceRequest {
  id: string;
  organizationName: string;
  vehicleDescription: string;
  complaint: string;
  status: string;
  declineReason: string | null;
  createdAt: string;
}

/** What each status means TO THE CUSTOMER, in their words rather than the
 *  database's. `converting` is deliberately spoken as progress, because from
 *  outside the workshop that is exactly what it is. */
const SAID: Record<string, { label: string; kind: 'draft' | 'active' | 'complete' | 'attention' | 'blocked'; detail: string }> = {
  new: {
    label: 'Sent',
    kind: 'attention',
    detail: 'The workshop has your request and has not answered yet.',
  },
  accepted: {
    label: 'Accepted',
    kind: 'active',
    detail: 'The workshop has accepted your request and will open a job for your car.',
  },
  converting: {
    label: 'Starting work',
    kind: 'active',
    detail: 'The workshop is opening a job card for your car now.',
  },
  converted: {
    label: 'Job opened',
    kind: 'complete',
    detail: 'Your repair has a job card. Track it under Repair Tracking.',
  },
  declined: {
    label: 'Declined',
    kind: 'blocked',
    detail: 'This workshop cannot take the work. You can ask another from the directory.',
  },
};

export function MyServiceRequests() {
  return (
    <Suspense fallback={<LoadingState label="Loading your requests…" />}>
      <List />
    </Suspense>
  );
}

async function List() {
  const result = await apiGet<MyServiceRequest[]>('customer', '/service-requests');

  // ⚠️ SILENT WHEN IT FAILS OR IS EMPTY, DELIBERATELY. This renders ABOVE the
  // repair list on a page that works without it. An error block here would put
  // a failure notice on top of a perfectly good screen, and an empty state would
  // tell every customer who has never used the directory that something is
  // missing. Absent is the honest rendering of "nothing to say".
  if (!result.ok || result.data.length === 0) return null;

  return (
    <section style={{ marginBottom: primitive.space[6] }}>
      <h2 style={{ margin: `0 0 ${primitive.space[3]} 0`, fontSize: primitive.fontSize.lg, color: themeVar.textPrimary }}>
        Your service requests
      </h2>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: primitive.space[3] }}>
        {result.data.map((r) => {
          const said = SAID[r.status] ?? {
            label: r.status,
            kind: 'draft' as const,
            detail: 'This request is with the workshop.',
          };
          return (
            <li
              key={r.id}
              style={{
                border: `1px solid ${themeVar.borderDefault}`,
                borderRadius: primitive.radius.lg,
                padding: primitive.space[4],
                background: themeVar.surfaceRaised,
              }}
            >
              <div style={{ display: 'flex', gap: primitive.space[3], alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, color: themeVar.textPrimary }}>{r.organizationName}</span>
                <span style={{ color: themeVar.textSecondary }}>{r.vehicleDescription}</span>
                <span style={{ marginLeft: 'auto' }}>
                  <StatusBadge kind={said.kind} label={said.label} />
                </span>
              </div>
              <p style={{ margin: `${primitive.space[2]} 0 0 0`, color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
                {said.detail}
              </p>
              {/* The reason, when there is one. Emphasised rather than tucked
                  away: it is the only thing the customer can act on. */}
              {r.declineReason ? (
                <p style={{ margin: `${primitive.space[2]} 0 0 0`, color: themeVar.textPrimary }}>
                  Reason given: {r.declineReason}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
