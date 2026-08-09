import { Suspense } from 'react';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState, DataTable } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { Badge, INCIDENT_BADGE, humanise, when } from './shared';

export const dynamic = 'force-dynamic';

interface Incident {
  id: string;
  kind: string;
  severity: string;
  summary: string;
  status: string;
  resolution: string | null;
  reportedAt: string;
  reference: string;
  driverName: string;
}

/**
 * `/operations/incidents` — damage, injuries, disputes and delays.
 *
 * ⚠️ REPORTING HAPPENS ON THE RECOVERY, NOT HERE. An incident is always ABOUT
 * one recovery (`fk_incident_recovery_scope`), so the form lives beside the job
 * it concerns on Active Recoveries. This screen is the log, and the empty state
 * says where to file one rather than leaving a reader to guess — a screen that
 * refuses without naming the alternative is the "wall" defect.
 *
 * ⚠️ THERE IS NO DELETE. An incident log that can be emptied is not a log, and
 * migration 074 grants no DELETE to the application role, so one could not be
 * built here without changing the grant first.
 */
export function IncidentsScreen() {
  return (
    <>
      <PageHeader
        title="Incidents"
        description="Open first, then by severity. Report one from the recovery it happened on."
      />
      <Suspense fallback={<LoadingState label="Loading the incident log…" />}>
        <Rows />
      </Suspense>
    </>
  );
}

async function Rows() {
  const result = await apiGet<Incident[]>('towing', '/towing/incidents');
  if (!result.ok) return <ApiFailure reason={result.reason} workspaceId="towing" />;

  if (result.data.length === 0) {
    return (
      <EmptyState
        title="No incidents reported"
        description="Report one from the job it happened on, under “Report an incident on this recovery” on Active Recoveries."
      />
    );
  }

  const open = result.data.filter((i) => i.status !== 'resolved').length;

  return (
    <DataTable
      caption="Towing incidents"
      summary={`${result.data.length} reported · ${open} still open`}
      rows={result.data}
      rowKey={(i) => i.id}
      columns={[
        { key: 'ref', header: 'Recovery', nowrap: true, cell: (i) => i.reference },
        { key: 'kind', header: 'Kind', nowrap: true, cell: (i) => humanise(i.kind) },
        {
          key: 'severity',
          header: 'Severity',
          nowrap: true,
          // High severity is bold rather than colour-only: colour alone fails
          // WCAG 1.4.1 and this table is read in a hurry.
          cell: (i) => (
            <span style={{ fontWeight: i.severity === 'high' ? 700 : 400 }}>{humanise(i.severity)}</span>
          ),
        },
        { key: 'driver', header: 'Driver', cell: (i) => i.driverName },
        {
          key: 'summary',
          header: 'What happened',
          cell: (i) => (
            <>
              <div style={{ color: themeVar.textPrimary }}>{i.summary}</div>
              {i.resolution ? (
                <div style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
                  Resolved: {i.resolution}
                </div>
              ) : null}
            </>
          ),
        },
        { key: 'when', header: 'Reported', numeric: true, nowrap: true, cell: (i) => when(i.reportedAt) },
        {
          key: 'status',
          header: 'Status',
          nowrap: true,
          cell: (i) => <Badge map={INCIDENT_BADGE} value={i.status} />,
        },
      ]}
    />
  );
}
