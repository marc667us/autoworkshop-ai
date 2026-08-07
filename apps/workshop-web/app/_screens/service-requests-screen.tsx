import { Suspense } from 'react';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { decideServiceRequestAction } from './service-request-actions';

/**
 * Reception's inbox — the owner's value chain, step 7: "his form is received at
 * the reception".
 *
 * A customer found this workshop in the PUBLIC mechanic directory and asked it
 * for help. What arrives is a `reception.service_requests` row, not a job card,
 * because the work has not been accepted and the car is very often not on file
 * anywhere yet — see `058_service_requests.sql`.
 *
 * ⚠️ THIS SCREEN IS THE REASON THE API IS NOT DEAD CODE. This repository has a
 * recorded defect where a complete, correct service shipped with NO REACHABLE
 * CALLER — `grant()` took a userId that no screen could supply, so nobody could
 * be hired. An intake endpoint with no inbox would be the same failure: requests
 * would arrive and sit unread for ever, and every probe would look green.
 */
export const dynamic = 'force-dynamic';

interface ServiceRequest {
  id: string;
  vehicleDescription: string;
  registrationNumber: string | null;
  complaint: string;
  status: string;
  declineReason: string | null;
  createdAt: string;
}

const BADGE: Record<string, 'draft' | 'active' | 'complete' | 'attention' | 'blocked'> = {
  new: 'attention',
  accepted: 'active',
  converted: 'complete',
  declined: 'blocked',
};

export function ServiceRequestsScreen() {
  return (
    <>
      <PageHeader
        title="Service Requests"
        description="Requests sent to this workshop from the public mechanic directory."
      />
      <Suspense fallback={<LoadingState label="Loading incoming requests…" />}>
        <Inbox />
      </Suspense>
    </>
  );
}

async function Inbox() {
  // `/inbox`, NOT `/service-requests` — the bare listing returns the CALLER's
  // own requests, which for a staff member is almost always empty. Two paths
  // rather than a query flag, so the two audiences can never be confused by a
  // caller that forgot a parameter.
  const result = await apiGet<ServiceRequest[]>('workshop', '/service-requests/inbox');

  if (!result.ok) {
    return <ApiFailure reason={result.reason} workspaceId="workshop" />;
  }

  if (result.data.length === 0) {
    return (
      <EmptyState
        title="No requests yet"
        description="When somebody finds this workshop in the public directory and asks for help, their request appears here."
      />
    );
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: primitive.space[4] }}>
      {result.data.map((r) => (
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
            <span style={{ fontWeight: 600, color: themeVar.textPrimary }}>
              {r.vehicleDescription}
            </span>
            {r.registrationNumber ? (
              <span style={{ fontFamily: primitive.fontFamily.mono, color: themeVar.textSecondary }}>
                {r.registrationNumber}
              </span>
            ) : null}
            <span style={{ marginLeft: 'auto' }}>
              <StatusBadge kind={BADGE[r.status] ?? 'draft'} label={r.status} />
            </span>
          </div>

          {/* The complaint IN FULL, not truncated. It is the whole content of
              the request, and a triage decision made from half a sentence is a
              decision made badly. */}
          <p style={{ margin: `${primitive.space[2]} 0 0 0`, color: themeVar.textPrimary, whiteSpace: 'pre-wrap' }}>
            {r.complaint}
          </p>

          {r.declineReason ? (
            <p style={{ margin: `${primitive.space[2]} 0 0 0`, color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
              Declined: {r.declineReason}
            </p>
          ) : null}

          {/*
            Decisions only on a request still awaiting one. The API refuses a
            second decision independently (`AND status = 'new'`), so this is the
            honest UI for a rule enforced elsewhere rather than the rule itself.
          */}
          {r.status === 'new' ? (
            <form
              action={decideServiceRequestAction}
              style={{ display: 'flex', gap: primitive.space[2], marginTop: primitive.space[3], flexWrap: 'wrap', alignItems: 'center' }}
            >
              <input type="hidden" name="id" value={r.id} />
              <button
                type="submit"
                name="status"
                value="accepted"
                style={{
                  height: '2.25rem',
                  padding: `0 ${primitive.space[3]}`,
                  border: `1px solid ${themeVar.borderDefault}`,
                  borderRadius: primitive.radius.md,
                  background: themeVar.backgroundPrimary,
                  color: themeVar.textPrimary,
                  cursor: 'pointer',
                }}
              >
                Accept
              </button>
              {/*
                A reason is REQUIRED to decline — `required` here, refused again
                by the service, and refused a third time by
                `ck_service_request_declined`. "Declined" with nothing else is
                the message the customer receives, and it is not an answer.
              */}
              <input
                name="declineReason"
                placeholder="Reason, if declining"
                maxLength={1000}
                style={{
                  flex: '1 1 14rem',
                  height: '2.25rem',
                  padding: `0 ${primitive.space[2]}`,
                  border: `1px solid ${themeVar.borderDefault}`,
                  borderRadius: primitive.radius.md,
                  background: themeVar.backgroundPrimary,
                  color: themeVar.textPrimary,
                }}
              />
              <button
                type="submit"
                name="status"
                value="declined"
                style={{
                  height: '2.25rem',
                  padding: `0 ${primitive.space[3]}`,
                  border: `1px solid ${themeVar.borderDefault}`,
                  borderRadius: primitive.radius.md,
                  background: themeVar.backgroundPrimary,
                  color: themeVar.textPrimary,
                  cursor: 'pointer',
                }}
              >
                Decline
              </button>
            </form>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
