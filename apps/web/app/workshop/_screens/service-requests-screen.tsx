import { Suspense } from 'react';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { decideServiceRequestAction, convertServiceRequestAction } from './service-request-actions';
import { FleetRequestsPanel } from './fleet-requests-panel';

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

/** Mirrors `create-job-card-screen.tsx` — the same `/memberships` payload. */
interface StaffOption {
  userId: string;
  displayName: string;
  roleName: string;
}

interface WorkshopVehicle {
  id: string;
  registrationNumber: string;
  make: string;
  model: string | null;
}

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
  // A state the system passes THROUGH while a job card is being opened. Seeing
  // it settled here means the card failed after the claim and the release did
  // not run — rare, and it must be VISIBLE rather than rendering as an unknown
  // status, because a request nobody can act on is exactly the failure the claim
  // was introduced to avoid trading for.
  converting: 'attention',
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
      {/* 🔴 THE WORKSHOP'S SIDE OF ADR-023. Without it a fleet's requests
          arrive and nobody ever sees them — the write half opened and the read
          half left shut, four times in one day on 2026-08-17. It sits here
          rather than on a new menu entry because changing approved navigation
          needs review; see the panel's own header. */}
      <FleetRequestsPanel />
    </>
  );
}

async function Inbox() {
  // `/inbox`, NOT `/service-requests` — the bare listing returns the CALLER's
  // own requests, which for a staff member is almost always empty. Two paths
  // rather than a query flag, so the two audiences can never be confused by a
  // caller that forgot a parameter.
  // The workshop's vehicles, so an ACCEPTED request can be converted without
  // typing a uuid. Allowed to fail: the inbox is still readable and decidable
  // without it, and only the convert control depends on it.
  // ⚠️ THE STAFF LIST IS ALLOWED TO FAIL, exactly like the vehicle list above.
  // Assigning at conversion is OPTIONAL, so a failure here must cost the
  // picker and nothing else — the request must still be convertible.
  const [result, vehicles, staff] = await Promise.all([
    apiGet<ServiceRequest[]>('workshop', '/service-requests/inbox'),
    apiGet<WorkshopVehicle[]>('workshop', '/vehicles'),
    apiGet<StaffOption[]>('workshop', '/memberships'),
  ]);

  // Only technicians may be assigned work — `JobCardService.create` refuses
  // anything else, so offering the whole staff list would build a control whose
  // choices the server rejects. Same filter as `create-job-card-screen.tsx`,
  // which is the screen this mirrors.
  const technicians = staff.ok ? staff.data.filter((m) => m.roleName === 'technician') : [];

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
              <StatusBadge
                kind={BADGE[r.status] ?? 'draft'}
                label={r.status === 'converting' ? 'opening job card…' : r.status}
              />
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

          {/*
            🔴 STEP 8 — "an ai agent use the form to register the customer and
            the customer vihicles and final the assignment of the requets".
            What is automated here is real: the job card is opened, the
            complaint carried across VERBATIM from the customer's own words, and
            the request closed out and linked.
            What is NOT automated is which vehicle. The customer typed their car
            as free text at a workshop that had never seen it, and inferring a
            make from prose would create wrong vehicle records under a real
            person's name — wrong data being far harder to undo than absent
            data. So reception names the car, registering it first if need be.
          */}
          {r.status === 'accepted' ? (
            vehicles.ok && vehicles.data.length > 0 ? (
              <form
                action={convertServiceRequestAction}
                style={{ display: 'flex', gap: primitive.space[2], marginTop: primitive.space[3], flexWrap: 'wrap', alignItems: 'center' }}
              >
                <input type="hidden" name="id" value={r.id} />
                <label htmlFor={`veh-${r.id}`} style={{ fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
                  Vehicle
                </label>
                <select
                  id={`veh-${r.id}`}
                  name="vehicleId"
                  required
                  defaultValue=""
                  style={{
                    height: '2.25rem',
                    padding: `0 ${primitive.space[2]}`,
                    border: `1px solid ${themeVar.borderDefault}`,
                    borderRadius: primitive.radius.md,
                    background: themeVar.backgroundPrimary,
                    color: themeVar.textPrimary,
                  }}
                >
                  <option value="" disabled>
                    Choose the vehicle…
                  </option>
                  {vehicles.data.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.registrationNumber} — {v.make}
                      {v.model ? ` ${v.model}` : ''}
                    </option>
                  ))}
                </select>

                {/*
                  🔴 THE FIELD WHOSE ABSENCE LEFT EVERY CONVERTED CARD UNASSIGNED.
                  `JobCardService.create` has always accepted and validated
                  `assignedTechnicianId`; `convert()` simply never passed one on,
                  and there is no separate assign endpoint to follow up with — so
                  the owner's "assign technicians, get job started" stopped at the
                  job card. Proved by `customer-value-chain.integration.spec.ts`,
                  which asserted that gap before this closed it.

                  ⚠️ RENDERED ONLY WHEN THERE IS SOMEBODY TO ASSIGN. An empty
                  dropdown labelled "Technician" reads as a broken control.
                  Optional either way: reception books the car in, the floor
                  decides who works on it.
                */}
                {technicians.length > 0 ? (
                  <>
                    <label
                      htmlFor={`tech-${r.id}`}
                      style={{ fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}
                    >
                      Assign to
                    </label>
                    <select
                      id={`tech-${r.id}`}
                      name="assignedTechnicianId"
                      defaultValue=""
                      style={{
                        height: '2.25rem',
                        padding: `0 ${primitive.space[2]}`,
                        border: `1px solid ${themeVar.borderDefault}`,
                        borderRadius: primitive.radius.md,
                        background: themeVar.backgroundPrimary,
                        color: themeVar.textPrimary,
                      }}
                    >
                      <option value="">Leave unassigned</option>
                      {technicians.map((t) => (
                        <option key={t.userId} value={t.userId}>
                          {t.displayName}
                        </option>
                      ))}
                    </select>
                  </>
                ) : null}
                <button
                  type="submit"
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
                  Open job card
                </button>
              </form>
            ) : (
              // An honest dead end rather than a disabled control with no
              // explanation: the car has to exist before work can be booked
              // against it, and this says where to make that happen.
              <p style={{ margin: `${primitive.space[3]} 0 0 0`, fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
                Register this vehicle first, then convert this request to a job card.
              </p>
            )
          ) : null}
        </li>
      ))}
    </ul>
  );
}
