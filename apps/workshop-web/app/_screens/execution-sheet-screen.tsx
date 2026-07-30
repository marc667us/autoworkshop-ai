import { Suspense } from 'react';
import Link from 'next/link';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { ExecutionWorkForm } from './execution-work-form';
import {
  EVIDENCE_KIND_LABEL,
  EXECUTION_STATUS_KIND,
  EXECUTION_STATUS_LABEL,
  TASK_STATUS_KIND,
  TASK_STATUS_LABEL,
  TIME_KIND_LABEL,
  formatHours,
} from './execution-labels';

/**
 * One repair — `07.txt` §31-§33.
 *
 * Two states, genuinely different: OPEN and being recorded against, or FINISHED and
 * frozen. There is no third "read-only because your role cannot write" rendering to
 * design around — the same read-only record serves a storekeeper reconciling parts and
 * a QC inspector reading the whole thing, and both need it complete rather than
 * abbreviated.
 */

interface Task {
  id: string;
  position: number;
  title: string;
  estimatedLabourHours: number | null;
  findingDescription: string | null;
  status: string;
  statusNote: string | null;
  completedByName: string | null;
  workedHours: number;
}

interface Execution {
  id: string;
  jobCardId: string;
  jobNumber: string;
  registrationNumber: string;
  proposalVersionNo: number;
  attemptNo: number;
  status: 'in_progress' | 'completed' | 'abandoned';
  customerApprovalConfirmed: boolean;
  partsAvailableConfirmed: boolean;
  toolsAvailableConfirmed: boolean;
  bayAvailableConfirmed: boolean;
  safetyConfirmed: boolean;
  readinessNote: string | null;
  serviceBay: string | null;
  startedByName: string | null;
  startedAt: string;
  completedByName: string | null;
  completedAt: string | null;
  completionNote: string | null;
  unexpectedFindings: string | null;
  tasks: Task[];
  timeEntries: Array<{
    id: string;
    entryKind: string;
    technicianName: string | null;
    serviceBay: string | null;
    repairStage: string | null;
    startedAt: string;
    endedAt: string | null;
    note: string | null;
    hours: number | null;
  }>;
  partsUsed: Array<{
    id: string;
    description: string;
    partNumber: string | null;
    quantity: number;
    unit: string | null;
    repairPlanResourceId: string | null;
    recordedByName: string | null;
  }>;
  evidence: Array<{
    id: string;
    evidenceKind: string;
    description: string;
    recordedValue: string | null;
    externalReference: string | null;
    recordedByName: string | null;
  }>;
  productiveHours: number;
  nonProductiveHours: number;
  estimatedHours: number;
  completedTaskCount: number;
  outstandingTaskCount: number;
  runningEntryCount: number;
  editable: boolean;
}

export async function ExecutionSheetScreen({
  route,
  executionId,
}: {
  route: string;
  executionId: string;
}) {
  return (
    <Suspense fallback={<LoadingState label="Loading the repair…" />}>
      <Sheet route={route} executionId={executionId} />
    </Suspense>
  );
}

async function Sheet({ route, executionId }: { route: string; executionId: string }) {
  const result = await apiGet<Execution>('workshop', `/repair-executions/${executionId}`);
  if (!result.ok) return <ApiFailure reason={result.reason} workspaceId="workshop" />;
  const e = result.data;

  return (
    <>
      <PageHeader title={`Repair — ${e.jobNumber}`} description={describe(e)} />

      <p style={{ margin: `0 0 ${primitive.space[3]} 0` }}>
        <Link href={route} style={{ color: primitive.color.blue[600] }}>
          Back to the repairs list
        </Link>
      </p>

      {e.runningEntryCount > 0 ? (
        // The one thing worth interrupting for: a clock left running is money, and
        // nobody is chasing it.
        <p
          role="alert"
          style={{
            margin: `0 0 ${primitive.space[4]} 0`,
            padding: primitive.space[2],
            border: `1px solid ${primitive.color.red[700]}`,
            borderRadius: primitive.radius.md,
            color: themeVar.textPrimary,
            fontSize: primitive.fontSize.sm,
          }}
        >
          {e.runningEntryCount} clock(s) still running on this repair.
        </p>
      ) : null}

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
          gap: primitive.space[3],
          margin: `0 0 ${primitive.space[4]} 0`,
        }}
      >
        <Fact label="Vehicle" value={e.registrationNumber} mono />
        <Fact
          label="Status"
          value={
            <StatusBadge
              kind={EXECUTION_STATUS_KIND[e.status] ?? 'draft'}
              label={EXECUTION_STATUS_LABEL[e.status] ?? e.status}
            />
          }
        />
        <Fact label="Attempt" value={String(e.attemptNo)} />
        {/* Which customer approval authorised this — §7's requirement, made visible. */}
        <Fact label="Authorised by" value={`Proposal v${e.proposalVersionNo}`} />
        <Fact label="Service bay" value={e.serviceBay ?? 'Not recorded'} />
        <Fact label="Started by" value={e.startedByName ?? 'Unknown'} />
        {e.completedByName ? <Fact label="Completed by" value={e.completedByName} /> : null}
        <Fact
          label="Tasks"
          value={`${e.completedTaskCount} of ${e.tasks.length} done`}
        />
        <Fact
          label="Time worked"
          value={`${formatHours(e.productiveHours)}${e.estimatedHours > 0 ? ` of ${formatHours(e.estimatedHours)}` : ''}`}
        />
        {e.nonProductiveHours > 0 ? (
          <Fact label="Time lost" value={formatHours(e.nonProductiveHours)} />
        ) : null}
      </dl>

      {e.editable ? (
        <ExecutionWorkForm
          executionId={e.id}
          jobNumber={e.jobNumber}
          tasks={e.tasks}
          runningEntryCount={e.runningEntryCount}
          productiveHours={e.productiveHours}
          estimatedHours={e.estimatedHours}
          outstandingTaskCount={e.outstandingTaskCount}
          readiness={{
            customerApprovalConfirmed: e.customerApprovalConfirmed,
            partsAvailableConfirmed: e.partsAvailableConfirmed,
            toolsAvailableConfirmed: e.toolsAvailableConfirmed,
            bayAvailableConfirmed: e.bayAvailableConfirmed,
            safetyConfirmed: e.safetyConfirmed,
            serviceBay: e.serviceBay,
            readinessNote: e.readinessNote,
          }}
        />
      ) : null}

      {/* The record itself, always shown — for an open repair it is what the technician
          has entered so far, and for a finished one it is what slice 8's testing and
          slice 9's quality control read. */}
      <Section title="Approved tasks">
        {e.tasks.length === 0 ? (
          <p style={{ margin: 0, color: themeVar.textSecondary }}>No tasks on this repair.</p>
        ) : (
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: primitive.space[2] }}>
            {e.tasks.map((t) => (
              <li key={t.id} style={record}>
                <div style={{ display: 'flex', gap: primitive.space[2], alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: primitive.fontFamily.mono, color: themeVar.textSecondary }}>
                    {t.position}.
                  </span>
                  <StatusBadge
                    kind={TASK_STATUS_KIND[t.status] ?? 'draft'}
                    label={TASK_STATUS_LABEL[t.status] ?? t.status}
                  />
                  <strong style={{ color: themeVar.textPrimary }}>{t.title}</strong>
                  <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
                    {formatHours(t.workedHours)}
                    {t.estimatedLabourHours !== null ? ` of ${formatHours(t.estimatedLabourHours)}` : ''}
                  </span>
                </div>
                {t.findingDescription ? (
                  <div style={sub}>Addresses: {t.findingDescription}</div>
                ) : null}
                {t.statusNote ? <div style={sub}>{t.statusNote}</div> : null}
                {t.completedByName ? <div style={sub}>Completed by {t.completedByName}</div> : null}
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Time recorded">
        {e.timeEntries.length === 0 ? (
          <p style={{ margin: 0, color: themeVar.textSecondary }}>No time has been booked.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: primitive.space[1] }}>
            {e.timeEntries.map((t) => (
              <li key={t.id} style={{ color: themeVar.textPrimary, fontSize: primitive.fontSize.sm }}>
                <strong>{TIME_KIND_LABEL[t.entryKind] ?? t.entryKind}</strong>
                {' — '}
                {/* A running entry says so rather than showing a duration that changes
                    every time somebody looks at it. */}
                {t.hours === null ? 'still running' : formatHours(t.hours)}
                <span style={{ color: themeVar.textSecondary }}>
                  {t.technicianName ? ` · ${t.technicianName}` : ''}
                  {t.serviceBay ? ` · ${t.serviceBay}` : ''}
                  {t.repairStage ? ` · booked at ${t.repairStage}` : ''}
                  {t.note ? ` · ${t.note}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Parts fitted">
        {e.partsUsed.length === 0 ? (
          <p style={{ margin: 0, color: themeVar.textSecondary }}>No parts recorded.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: primitive.space[1] }}>
            {e.partsUsed.map((p) => (
              <li key={p.id} style={{ color: themeVar.textPrimary, fontSize: primitive.fontSize.sm }}>
                <strong>{p.description}</strong>
                <span style={{ color: themeVar.textSecondary }}>
                  {' — '}
                  {p.quantity}
                  {p.unit ? ` ${p.unit}` : ''}
                  {p.partNumber ? ` · ${p.partNumber}` : ''}
                  {/* Whether the plan expected it. An unplanned part is what a variation
                      is made of, so it is worth saying on the record. */}
                  {p.repairPlanResourceId === null ? ' · NOT in the approved plan' : ''}
                  {p.recordedByName ? ` · ${p.recordedByName}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Measurements and evidence">
        {e.evidence.length === 0 ? (
          <p style={{ margin: 0, color: themeVar.textSecondary }}>Nothing recorded.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: primitive.space[1] }}>
            {e.evidence.map((v) => (
              <li key={v.id} style={{ color: themeVar.textPrimary, fontSize: primitive.fontSize.sm }}>
                <strong>{EVIDENCE_KIND_LABEL[v.evidenceKind] ?? v.evidenceKind}</strong>
                {' — '}
                {v.description}
                <span style={{ color: themeVar.textSecondary }}>
                  {v.recordedValue ? ` · ${v.recordedValue}` : ''}
                  {v.externalReference ? ` · ${v.externalReference}` : ''}
                  {v.recordedByName ? ` · ${v.recordedByName}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {e.completionNote || e.unexpectedFindings ? (
        <Section title="On completion">
          {e.completionNote ? <p style={{ margin: 0 }}>{e.completionNote}</p> : null}
          {e.unexpectedFindings ? (
            <p style={{ margin: `${primitive.space[2]} 0 0 0` }}>
              <strong>Unexpected findings:</strong> {e.unexpectedFindings}
            </p>
          ) : null}
        </Section>
      ) : null}
    </>
  );
}

function describe(e: Execution): string {
  switch (e.status) {
    case 'in_progress':
      return e.editable
        ? 'Record the work as you do it. The repair cannot be completed while an approved task is unfinished or a clock is still running.'
        : 'This repair is under way. Your role can read the record but not change it.';
    case 'completed':
      return 'Completed. The record is frozen — this is what post-repair testing and quality control are checked against.';
    default:
      return 'Abandoned. Kept as the record of what was done before the work stopped.';
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h2
        style={{
          fontSize: primitive.fontSize.base,
          color: themeVar.textPrimary,
          margin: `${primitive.space[4]} 0 ${primitive.space[2]} 0`,
        }}
      >
        {title}
      </h2>
      {children}
    </>
  );
}

function Fact({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>{label}</dt>
      <dd
        style={{
          margin: 0,
          color: themeVar.textPrimary,
          fontFamily: mono ? primitive.fontFamily.mono : 'inherit',
        }}
      >
        {value}
      </dd>
    </div>
  );
}

const record = {
  padding: primitive.space[2],
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.md,
  background: themeVar.surfaceRaised,
  // Positioned containing block, for the reason every container in these slices has one.
  position: 'relative' as const,
};

const sub = {
  color: themeVar.textSecondary,
  fontSize: primitive.fontSize.sm,
  marginTop: primitive.space[1],
};
