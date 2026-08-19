import { Suspense } from 'react';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import {
  DataTable,
  EmptyState,
  Field,
  FormShell,
  LoadingState,
  Select,
  StatusBadge,
  SubmitButton,
} from '@autoworkshop/ui';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import { respondToFleetRequestAction } from './fleet-requests-actions';

/**
 * WORK ASKED FOR BY A FLEET OPERATOR — the workshop's side of ADR-023.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 WITHOUT THIS PANEL THE CONTRACT IS ONE-SIDED, AND A FLEET SENDS REQUESTS
 * INTO A VOID.
 *
 * Migration 087 made `fleet.service_requests` readable by BOTH parties, and
 * slice 20 built the fleet's half. `GET /fleet/incoming-requests` and
 * `PATCH /fleet/incoming-requests/:id` existed with no screen behind them — the
 * exact shape this repository has recorded four times in one day: a write half
 * opened and the read half left shut. A fleet manager would have watched every
 * request sit at "Awaiting the workshop" for ever, and every probe would have
 * looked green.
 *
 * ── ⚠️ WHY A PANEL ON AN EXISTING SCREEN AND NOT A NEW MENU ENTRY ─────────
 *
 * `CLAUDE.md` prohibits *changing approved navigation without review*, and the
 * workshop tree has no entry for fleet work. The precedent set on 2026-08-17 is
 * the one followed here: towing's org-staff roster was rendered INSIDE its
 * existing settings screen rather than given a route of its own. Reception's
 * Service Requests screen is where a workshop already looks for work it has
 * been asked to do, so this sits below it under its own heading.
 *
 * ▶ RECORDED AS A FOLLOW-UP, NOT AS DONE: fleet work deserves its own entry.
 *   That is an owner decision.
 *
 * ── WHAT THE WORKSHOP CAN AND CANNOT SEE ─────────────────────────────────
 *
 * Only the snapshots on the request: which fleet, which registration, what was
 * asked. Not the fleet's other vehicles, its drivers, its costs or its users —
 * and not because this component declines to render them, but because
 * `fleet.service_requests` is the only row the workshop-side RLS policy admits
 * and it carries nothing else (ADR-023 §3).
 * ══════════════════════════════════════════════════════════════════════════
 */

export const dynamic = 'force-dynamic';

interface IncomingRequest {
  id: string;
  reference: string;
  fleetName: string;
  vehicleRegistration: string;
  vehicleDescription: string | null;
  requestType: string;
  summary: string;
  detail: string | null;
  priority: string;
  preferredDate: string | null;
  odometerKm: number | null;
  status: string;
  declineReason: string | null;
  createdAt: string;
}

/** What the workshop may do next, given where the request is. */
const NEXT_MOVES: Record<string, { value: string; label: string }[]> = {
  submitted: [
    { value: 'accepted', label: 'Accept this work' },
    { value: 'declined', label: 'Decline it' },
  ],
  accepted: [{ value: 'in_progress', label: 'Start work' }],
  in_progress: [{ value: 'completed', label: 'Mark completed' }],
};

function badge(status: string) {
  switch (status) {
    case 'completed':
      return <StatusBadge kind="complete" label="Completed" />;
    case 'in_progress':
      return <StatusBadge kind="active" label="In progress" />;
    case 'accepted':
      return <StatusBadge kind="active" label="Accepted" />;
    case 'declined':
      return <StatusBadge kind="blocked" label="Declined" />;
    case 'cancelled':
      return <StatusBadge kind="draft" label="Withdrawn by the fleet" />;
    default:
      // 🔴 `attention`, because this is the one state that needs the WORKSHOP
      // to do something. Colour is not carrying the meaning on its own — the
      // label says it too.
      return <StatusBadge kind="attention" label="Needs a decision" />;
  }
}

export function FleetRequestsPanel() {
  return (
    <section style={{ marginTop: primitive.space[12] }} aria-labelledby="fleet-requests-heading">
      <h2
        id="fleet-requests-heading"
        style={{
          margin: `0 0 ${primitive.space[2]}`,
          fontSize: '1.125rem',
          color: themeVar.textPrimary,
        }}
      >
        From fleet operators
      </h2>
      <p
        style={{
          margin: `0 0 ${primitive.space[5]}`,
          fontSize: '0.875rem',
          color: themeVar.textSecondary,
        }}
      >
        Fleets that found this workshop in the public directory. Accepting one does not
        create a job card — record the vehicle and raise the job as you normally would.
      </p>
      <Suspense fallback={<LoadingState label="Loading fleet requests…" />}>
        <Rows />
      </Suspense>
    </section>
  );
}

async function Rows() {
  const result = await apiGet<IncomingRequest[]>('workshop', '/fleet/incoming-requests');
  if (!result.ok) return <ApiFailure reason={result.reason} workspaceId="workshop" />;

  if (result.data.length === 0) {
    return (
      <EmptyState
        title="No fleet requests"
        // ⚠️ NAMES THE MECHANISM, because "none" here is not a fault and there
        // is nothing the workshop can do about it except be listed.
        description="A fleet can only send work to a workshop that has published a public directory entry. If yours is not published, no fleet can reach you."
      />
    );
  }

  const decidable = result.data.filter((r) => NEXT_MOVES[r.status]);

  return (
    <>
      <DataTable<IncomingRequest>
        caption="Service requests from fleet operators"
        rowKey={(r) => r.id}
        rows={result.data}
        summary={`${result.data.length} request${result.data.length === 1 ? '' : 's'}`}
        columns={[
          { key: 'ref', header: 'Reference', cell: (r) => r.reference },
          { key: 'fleet', header: 'Fleet', cell: (r) => r.fleetName },
          {
            key: 'vehicle',
            header: 'Vehicle',
            cell: (r) => (
              <>
                {r.vehicleRegistration}
                {r.vehicleDescription ? (
                  <>
                    <br />
                    <span style={{ color: themeVar.textSecondary, fontSize: '0.8125rem' }}>
                      {r.vehicleDescription}
                    </span>
                  </>
                ) : null}
              </>
            ),
          },
          {
            key: 'what',
            header: 'What is asked',
            cell: (r) => (
              <>
                {r.summary}
                {r.detail ? (
                  <>
                    <br />
                    <span style={{ color: themeVar.textSecondary, fontSize: '0.8125rem' }}>
                      {r.detail}
                    </span>
                  </>
                ) : null}
              </>
            ),
          },
          {
            key: 'priority',
            header: 'Priority',
            cell: (r) =>
              r.priority === 'vehicle_off_road' ? 'Vehicle off road' : r.priority,
          },
          { key: 'when', header: 'Preferred', cell: (r) => r.preferredDate ?? '—' },
          {
            key: 'odo',
            header: 'Odometer',
            numeric: true,
            cell: (r) => (r.odometerKm === null ? '—' : `${r.odometerKm} km`),
          },
          { key: 'status', header: 'Status', cell: (r) => badge(r.status) },
        ]}
      />

      {decidable.length > 0 ? (
        <div
          style={{
            marginTop: primitive.space[6],
            maxWidth: '32rem',
            border: `1px solid ${themeVar.borderDefault}`,
            borderRadius: primitive.radius.xl,
            padding: primitive.space[5],
          }}
        >
          {/* ⚠️ ONE FORM, NOT ONE PER ROW. `FormShell` is what surfaces an
              ActionResult; a bare `<form action={...}>` cannot, because React
              requires a void-returning action — so the API's refusal for an
              illegal transition would be swallowed silently. That refusal names
              the moves that ARE available, which is the most useful sentence
              on this panel. */}
          <FormShell action={respondToFleetRequestAction} successPrefix="The request is">
            <Field label="Request" htmlFor="requestId" required>
              <Select
                id="requestId"
                name="requestId"
                options={decidable.map((r) => ({
                  value: r.id,
                  label: `${r.reference} — ${r.fleetName}, ${r.vehicleRegistration}`,
                }))}
              />
            </Field>
            <Field label="Decision" htmlFor="status" required>
              {/* 🔴 THE UNION OF EVERY LEGAL NEXT MOVE, not the moves for one
                  row — a static select cannot depend on the row chosen beside
                  it. The API refuses an illegal pairing and says which moves
                  the request actually has, so a wrong combination is answered
                  rather than silently accepted. */}
              <Select
                id="status"
                name="status"
                options={[
                  { value: 'accepted', label: 'Accept this work' },
                  { value: 'declined', label: 'Decline it' },
                  { value: 'in_progress', label: 'Start work' },
                  { value: 'completed', label: 'Mark completed' },
                ]}
              />
            </Field>
            <Field label="If declining, say why" htmlFor="declineReason">
              <input
                id="declineReason"
                name="declineReason"
                maxLength={2000}
                placeholder="The fleet sees only this"
              />
            </Field>
            <SubmitButton>Send decision</SubmitButton>
          </FormShell>
        </div>
      ) : null}
    </>
  );
}
