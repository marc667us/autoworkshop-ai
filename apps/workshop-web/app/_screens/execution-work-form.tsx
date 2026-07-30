'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import {
  completeRepairAction,
  recordEvidenceAction,
  recordPartUsedAction,
  recordReadinessAction,
  setTaskStatusAction,
  startTimeAction,
  stopTimeAction,
} from './execution-actions';
import {
  EVIDENCE_KIND_LABEL,
  EVIDENCE_KIND_ORDER,
  TASK_STATUS_LABEL,
  TASK_STATUS_ORDER,
  TIME_KIND_LABEL,
  TIME_KIND_ORDER,
  formatHours,
} from './execution-labels';

/**
 * Recording the work — `07.txt` §32-§33, §6-§10, §13.
 *
 * ── THE CLOCK IS THE FIRST THING ON THE SCREEN ─────────────────────────────
 *
 * §33 gives the technician Start, Pause, Resume and five named categories of lost time,
 * and every one of them is a button pressed with dirty hands beside a car. So the clock
 * sits at the top, its state is stated in words rather than implied by a colour, and
 * switching to a delay is ONE press — the service closes the running entry itself, so
 * the same minutes can never be booked twice.
 *
 * ⚠️ NOT THE AUTHORIZATION POINT and not the rule layer. Renders only when the API said
 * `editable`. Every rule is in `ExecutionService`: the approved-proposal requirement,
 * the mandatory reasons, and the completion gates.
 */

interface Task {
  id: string;
  position: number;
  title: string;
  estimatedLabourHours: number | null;
  findingDescription: string | null;
  status: string;
  statusNote: string | null;
  workedHours: number;
}

export function ExecutionWorkForm({
  executionId,
  jobNumber,
  tasks,
  runningEntryCount,
  productiveHours,
  estimatedHours,
  outstandingTaskCount,
  readiness,
}: {
  executionId: string;
  jobNumber: string;
  tasks: Task[];
  runningEntryCount: number;
  productiveHours: number;
  estimatedHours: number;
  outstandingTaskCount: number;
  readiness: {
    customerApprovalConfirmed: boolean;
    partsAvailableConfirmed: boolean;
    toolsAvailableConfirmed: boolean;
    bayAvailableConfirmed: boolean;
    safetyConfirmed: boolean;
    serviceBay: string | null;
    readinessNote: string | null;
  };
}) {
  const router = useRouter();
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [delayKind, setDelayKind] = React.useState<string>('waiting_for_parts');

  async function run(
    key: string,
    action: (d: FormData) => Promise<{ error?: string; created?: string }>,
    data: FormData,
  ): Promise<boolean> {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const outcome = await action(data);
      if (outcome.error) {
        setError(outcome.error);
        return false;
      }
      setNotice(outcome.created ?? 'Saved');
      // `revalidatePath` marks the server cache stale; it does not repaint the page the
      // technician is looking at, and the clock's state is the whole point here.
      router.refresh();
      return true;
    } catch {
      setError('The request could not be completed. Nothing was recorded.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  const completionBlocked = outstandingTaskCount > 0 || runningEntryCount > 0;

  return (
    <div style={{ display: 'grid', gap: primitive.space[6] }}>
      {notice ? (
        <p role="status" style={{ margin: 0, fontSize: primitive.fontSize.sm, color: themeVar.textPrimary }}>
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: primitive.fontSize.sm, color: primitive.color.red[700] }}>
          {error}
        </p>
      ) : null}

      {/* ── §33: THE CLOCK ─────────────────────────────────────────────── */}
      <section style={panel}>
        <h2 style={heading}>Time</h2>
        <p style={{ ...hint, color: runningEntryCount > 0 ? primitive.color.red[700] : themeVar.textSecondary }}>
          {/* Stated in words, never colour alone (§66). */}
          {runningEntryCount > 0
            ? 'A clock is running on this repair.'
            : 'No clock is running.'}{' '}
          {formatHours(productiveHours)} worked
          {estimatedHours > 0 ? ` of ${formatHours(estimatedHours)} planned` : ''}.
        </p>

        <div style={{ display: 'flex', gap: primitive.space[2], flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <form
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              const d = new FormData();
              d.set('executionId', executionId);
              d.set('entryKind', 'productive');
              await run('start-clock', startTimeAction, d);
            }}
          >
            <button type="submit" disabled={busy !== null} style={primary(busy === 'start-clock')}>
              {busy === 'start-clock' ? 'Starting…' : runningEntryCount > 0 ? 'Resume work' : 'Start work'}
            </button>
          </form>

          <form
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              const d = new FormData();
              d.set('executionId', executionId);
              await run('stop-clock', stopTimeAction, d);
            }}
          >
            <button type="submit" disabled={busy !== null} style={secondary}>
              {busy === 'stop-clock' ? 'Stopping…' : 'Pause work'}
            </button>
          </form>
        </div>

        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const d = new FormData(form);
            d.set('executionId', executionId);
            d.set('entryKind', delayKind);
            if (await run('delay', startTimeAction, d)) form.reset();
          }}
          style={{ display: 'grid', gap: primitive.space[2], marginTop: primitive.space[3] }}
        >
          <p style={{ ...hint, margin: 0 }}>
            {/* §33's categories each name somebody who can stop it happening again —
                parts is procurement, approval is reception, a tool delay is the
                workshop. Collapsing them into "delay" loses that. */}
            Recording a delay closes the working clock automatically, so the same minutes
            are never booked twice.
          </p>
          <div style={twoUp}>
            <div style={{ display: 'grid', gap: primitive.space[1], minWidth: 0 }}>
              <label htmlFor="delay-kind" style={labelStyle}>What is holding it up?</label>
              <select
                id="delay-kind"
                value={delayKind}
                onChange={(ev) => setDelayKind(ev.target.value)}
                style={input}
              >
                {TIME_KIND_ORDER.filter((k) => k !== 'productive').map((k) => (
                  <option key={k} value={k}>{TIME_KIND_LABEL[k]}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'grid', gap: primitive.space[1], minWidth: 0 }}>
              <label htmlFor="delay-note" style={labelStyle}>What exactly? *</label>
              <input id="delay-note" name="note" maxLength={2000} placeholder="Coil on back order, ETA Friday" style={input} />
            </div>
          </div>
          <button type="submit" disabled={busy !== null} style={secondary}>
            {busy === 'delay' ? 'Recording…' : 'Record delay'}
          </button>
        </form>
      </section>

      {/* ── §6: THE APPROVED TASKS ─────────────────────────────────────── */}
      <section style={panel}>
        <h2 style={heading}>Approved tasks</h2>
        <p style={hint}>
          These are what the customer agreed to pay for. A task that turns out not to be
          needed can be marked so — with a reason — but it cannot simply be left.
        </p>
        {tasks.length === 0 ? (
          <p style={{ margin: 0, color: themeVar.textSecondary }}>No tasks on this repair.</p>
        ) : (
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: primitive.space[3] }}>
            {tasks.map((t) => (
              <li key={t.id}>
                <TaskRow executionId={executionId} task={t} busy={busy} run={run} />
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ── §7: PARTS FITTED ───────────────────────────────────────────── */}
      <section style={panel}>
        <h2 style={heading}>Parts fitted</h2>
        <p style={hint}>
          What you actually fitted, which is not always what the plan expected — and that
          difference is how an invoice that differs from the quotation is explained.
        </p>
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const d = new FormData(form);
            d.set('executionId', executionId);
            if (await run('part', recordPartUsedAction, d)) form.reset();
          }}
          style={{ display: 'grid', gap: primitive.space[2] }}
        >
          <div style={twoUp}>
            <Field label="Part *" htmlFor="part-desc">
              <input id="part-desc" name="description" maxLength={500} placeholder="Ignition coil" style={input} />
            </Field>
            <Field label="Part number" htmlFor="part-no">
              <input id="part-no" name="partNumber" maxLength={200} style={input} />
            </Field>
          </div>
          <div style={twoUp}>
            <Field label="How many *" htmlFor="part-qty">
              <input id="part-qty" name="quantity" inputMode="decimal" defaultValue="1" style={input} />
            </Field>
            <Field label="Unit" htmlFor="part-unit">
              <input id="part-unit" name="unit" maxLength={50} placeholder="each" style={input} />
            </Field>
          </div>
          <button type="submit" disabled={busy !== null} style={primary(busy === 'part')}>
            {busy === 'part' ? 'Recording…' : 'Record part fitted'}
          </button>
        </form>
      </section>

      {/* ── §8-§9: MEASUREMENTS AND EVIDENCE ───────────────────────────── */}
      <section style={panel}>
        <h2 style={heading}>Measurements and evidence</h2>
        <p style={hint}>
          What you observed, so somebody else can check it. Photographs and video are
          recorded here by description and reference — file upload is a later slice, and a
          box that claimed to store one would be a lie.
        </p>
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const d = new FormData(form);
            d.set('executionId', executionId);
            if (await run('evidence', recordEvidenceAction, d)) form.reset();
          }}
          style={{ display: 'grid', gap: primitive.space[2] }}
        >
          <div style={twoUp}>
            <Field label="Kind *" htmlFor="ev-kind">
              <select id="ev-kind" name="evidenceKind" defaultValue="observation" style={input}>
                {EVIDENCE_KIND_ORDER.map((k) => (
                  <option key={k} value={k}>{EVIDENCE_KIND_LABEL[k]}</option>
                ))}
              </select>
            </Field>
            <Field label="Reading (measurements only)" htmlFor="ev-value">
              <input id="ev-value" name="recordedValue" maxLength={500} placeholder="0.52 ohm" style={input} />
            </Field>
          </div>
          <Field label="What you observed *" htmlFor="ev-desc">
            <input id="ev-desc" name="description" maxLength={2000} style={input} />
          </Field>
          <Field label="Where the file is, if there is one" htmlFor="ev-ref">
            <input id="ev-ref" name="externalReference" maxLength={500} style={input} />
          </Field>
          <button type="submit" disabled={busy !== null} style={primary(busy === 'evidence')}>
            {busy === 'evidence' ? 'Recording…' : 'Record evidence'}
          </button>
        </form>
      </section>

      {/* ── §32: THE PRE-START CHECKS ──────────────────────────────────── */}
      <section style={panel}>
        <h2 style={heading}>Pre-start checks</h2>
        <p style={hint}>
          §32 asks you to confirm these. They are a RECORD that you checked — the
          customer&rsquo;s approval itself is enforced by the system and cannot be ticked
          past.
        </p>
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            d.set('executionId', executionId);
            await run('readiness', recordReadinessAction, d);
          }}
          style={{ display: 'grid', gap: primitive.space[2] }}
        >
          {(
            [
              ['customerApprovalConfirmed', 'Customer approval received', readiness.customerApprovalConfirmed],
              ['partsAvailableConfirmed', 'Parts available', readiness.partsAvailableConfirmed],
              ['toolsAvailableConfirmed', 'Tools available', readiness.toolsAvailableConfirmed],
              ['bayAvailableConfirmed', 'Service bay available', readiness.bayAvailableConfirmed],
              ['safetyConfirmed', 'Safety requirements met', readiness.safetyConfirmed],
            ] as const
          ).map(([name, label, checked]) => (
            <label key={name} style={{ display: 'flex', gap: primitive.space[2], alignItems: 'center', fontSize: primitive.fontSize.sm, color: themeVar.textPrimary }}>
              <input type="checkbox" name={name} defaultChecked={checked} />
              {label}
            </label>
          ))}
          <div style={twoUp}>
            <Field label="Service bay" htmlFor="ready-bay">
              <input id="ready-bay" name="serviceBay" maxLength={200} defaultValue={readiness.serviceBay ?? ''} style={input} />
            </Field>
            <Field label="Anything worth noting" htmlFor="ready-note">
              <input id="ready-note" name="readinessNote" maxLength={8000} defaultValue={readiness.readinessNote ?? ''} style={input} />
            </Field>
          </div>
          <button type="submit" disabled={busy !== null} style={primary(busy === 'readiness')}>
            {busy === 'readiness' ? 'Saving…' : 'Save checks'}
          </button>
        </form>
      </section>

      {/* ── §13: COMPLETE ──────────────────────────────────────────────── */}
      <section style={panel}>
        <h2 style={heading}>Complete the repair</h2>
        {completionBlocked ? (
          // Says WHICH rule and what to do, rather than disabling a control in silence.
          <p style={{ margin: `0 0 ${primitive.space[2]} 0`, fontSize: primitive.fontSize.sm, color: primitive.color.red[700] }}>
            {outstandingTaskCount > 0
              ? `${outstandingTaskCount} approved task(s) are still unfinished. Complete them, or mark one that is genuinely not required with a reason.`
              : 'A clock is still running. Pause it first, or the end of somebody’s work is lost.'}
          </p>
        ) : null}
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            d.set('executionId', executionId);
            await run('complete', completeRepairAction, d);
          }}
          style={{ display: 'grid', gap: primitive.space[2] }}
        >
          <Field label="What you did" htmlFor="done-note">
            <textarea id="done-note" name="completionNote" rows={2} maxLength={8000} style={input} />
          </Field>
          <Field
            label="Anything unexpected you found (§10)"
            htmlFor="done-unexpected"
            note="⚠️ If it is CHARGEABLE, it must be raised as a variation — a new quotation and a new proposal version — not simply carried out. Record it here so it is not lost."
          >
            <textarea id="done-unexpected" name="unexpectedFindings" rows={2} maxLength={8000} style={input} />
          </Field>
          <button
            type="submit"
            disabled={busy !== null || completionBlocked}
            aria-label={`Complete the repair for job card ${jobNumber}`}
            style={primary(busy === 'complete', completionBlocked)}
          >
            {busy === 'complete' ? 'Completing…' : 'Complete repair'}
          </button>
        </form>
      </section>
    </div>
  );
}

function TaskRow({
  executionId,
  task,
  busy,
  run,
}: {
  executionId: string;
  task: Task;
  busy: string | null;
  run: (
    key: string,
    action: (d: FormData) => Promise<{ error?: string; created?: string }>,
    data: FormData,
  ) => Promise<boolean>;
}) {
  const [status, setStatus] = React.useState(task.status);
  const needsReason = status === 'blocked' || status === 'skipped';

  return (
    <div style={row}>
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          d.set('executionId', executionId);
          d.set('taskId', task.id);
          d.set('status', status);
          await run(`task-${task.id}`, setTaskStatusAction, d);
        }}
        style={{ display: 'grid', gap: primitive.space[2], flex: 1, minWidth: 0 }}
      >
        <div style={{ display: 'flex', gap: primitive.space[2], alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: primitive.fontFamily.mono, fontWeight: 600, color: themeVar.textSecondary }}>
            {task.position}.
          </span>
          <strong style={{ color: themeVar.textPrimary }}>{task.title}</strong>
          <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
            {formatHours(task.workedHours)}
            {task.estimatedLabourHours !== null ? ` of ${formatHours(task.estimatedLabourHours)}` : ''}
          </span>
        </div>
        {task.findingDescription ? (
          <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
            {/* The fault this task addresses — the link slice 9's quality control walks. */}
            Addresses: {task.findingDescription}
          </span>
        ) : null}

        <div style={twoUp}>
          <select
            value={status}
            onChange={(ev) => setStatus(ev.target.value)}
            aria-label={`Status of task ${task.position}`}
            style={input}
          >
            {TASK_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>
            ))}
          </select>
          <input
            name="statusNote"
            defaultValue={task.statusNote ?? ''}
            maxLength={8000}
            placeholder={needsReason ? 'Reason — required' : 'Note (optional)'}
            aria-label={`Note on task ${task.position}`}
            style={input}
          />
        </div>

        <div style={{ display: 'flex', gap: primitive.space[2], flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="submit" disabled={busy !== null} aria-label={`Save task ${task.position}`} style={secondary}>
            {busy === `task-${task.id}` ? 'Saving…' : 'Save'}
          </button>
          <form
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              const d = new FormData();
              d.set('executionId', executionId);
              d.set('entryKind', 'productive');
              d.set('executionTaskId', task.id);
              await run(`clock-${task.id}`, startTimeAction, d);
            }}
          >
            <button
              type="submit"
              disabled={busy !== null}
              aria-label={`Start the clock on task ${task.position}`}
              style={secondary}
            >
              {busy === `clock-${task.id}` ? 'Starting…' : 'Work on this'}
            </button>
          </form>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  note,
  children,
}: {
  label: string;
  htmlFor: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'grid', gap: primitive.space[1], minWidth: 0 }}>
      {/* A REAL <label>, never `visuallyHidden` — that class is `position: absolute` and
          escapes any ancestor that is not positioned. */}
      <label htmlFor={htmlFor} style={labelStyle}>{label}</label>
      {note ? (
        <p style={{ margin: 0, fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>{note}</p>
      ) : null}
      {children}
    </div>
  );
}

const labelStyle = { fontSize: primitive.fontSize.sm, fontWeight: 600, color: themeVar.textPrimary };
const panel = {
  padding: primitive.space[4],
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.md,
  position: 'relative' as const,
};
const heading = { margin: `0 0 ${primitive.space[2]} 0`, fontSize: primitive.fontSize.base, color: themeVar.textPrimary };
const hint = { margin: `0 0 ${primitive.space[3]} 0`, fontSize: primitive.fontSize.sm, color: themeVar.textSecondary };
const row = {
  display: 'flex',
  gap: primitive.space[3],
  alignItems: 'flex-start',
  flexWrap: 'wrap' as const,
  padding: primitive.space[3],
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.md,
  background: themeVar.surfaceRaised,
  position: 'relative' as const,
};
const twoUp = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(14rem, 100%), 1fr))',
  gap: primitive.space[2],
  minWidth: 0,
};
const input = {
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box' as const,
  padding: primitive.space[2],
  fontSize: primitive.fontSize.sm,
  fontFamily: 'inherit',
  color: themeVar.textPrimary,
  background: themeVar.surfaceRaised,
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.md,
};
function primary(busy: boolean, blocked = false) {
  return {
    padding: primitive.space[2],
    fontSize: primitive.fontSize.sm,
    fontWeight: 600,
    fontFamily: 'inherit',
    color: primitive.color.grey[0],
    background: busy || blocked ? primitive.color.grey[400] : primitive.color.blue[600],
    border: 'none',
    borderRadius: primitive.radius.md,
    cursor: busy ? ('progress' as const) : blocked ? ('not-allowed' as const) : ('pointer' as const),
    justifySelf: 'start' as const,
  };
}
const secondary = {
  padding: primitive.space[1],
  fontSize: primitive.fontSize.sm,
  fontWeight: 600,
  fontFamily: 'inherit',
  color: primitive.color.blue[600],
  background: 'transparent',
  border: `1px solid ${primitive.color.blue[600]}`,
  borderRadius: primitive.radius.md,
  cursor: 'pointer' as const,
};
