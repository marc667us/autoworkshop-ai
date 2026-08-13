'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import {
  addPlanResourceAction,
  addPlanTaskAction,
  movePlanTaskAction,
  recordPlanDetailsAction,
  removePlanResourceAction,
  removePlanTaskAction,
  submitRepairPlanAction,
  updatePlanTaskAction,
} from './repair-plan-actions';
import {
  MATERIAL_KINDS,
  RESOURCE_KIND_LABEL,
  RESOURCE_KIND_ORDER,
  formatHours,
  formatQuantity,
} from './repair-plan-labels';

/**
 * Building a repair plan — `07.txt` §25-§29.10.
 *
 * ── THE CONFIRMED FAULTS ARE THE FIRST THING ON THE SCREEN ─────────────────
 *
 * §25 says "the application loads confirmed faults", and that is a REQUIREMENT about
 * what the technician sees before planning, not a data-loading note. They are rendered
 * at the top, each with its own "add a task for this fault" control, so the normal way
 * to build a plan is fault-first — which is exactly what makes the `finding_id` link
 * populated rather than technically-possible-but-never-used. A screen where attaching
 * the fault is an optional dropdown at the bottom of a long form produces plans with
 * null links, and slice 9's quality control would then have nothing to read.
 *
 * ── WHY EACH ROW IS ITS OWN FORM ───────────────────────────────────────────
 *
 * One big form posting the whole plan would mean a technician losing a half-typed task
 * because an unrelated field failed validation, and it would make "remove task 3" and
 * "save task 1" the same submission. Each task and each resource owns its form; the
 * plan-level details own another; submission owns a third.
 *
 * ⚠️ NOT THE AUTHORIZATION POINT, and not the rule layer either. This component
 * renders only when the API said `editable`. Every rule — role, stage, plan status,
 * that a task addresses only a CONFIRMED fault of this plan's own diagnosis, that a
 * submitted plan has tasks and every task an estimate — is enforced in
 * `RepairPlanService` and, for the finding link, by a trigger in migration 014. Anyone
 * can call the server actions directly (CLAUDE.md §8).
 */

interface ConfirmedFault {
  id: string;
  position: number;
  faultCode: string | null;
  faultDescription: string;
  affectedSystem: string;
  taskCount: number;
}

interface PlanTask {
  id: string;
  position: number;
  findingId: string | null;
  findingDescription: string | null;
  title: string;
  description: string | null;
  requiredSkill: string | null;
  serviceBay: string | null;
  estimatedLabourHours: number | null;
}

interface PlanResource {
  id: string;
  position: number;
  taskId: string | null;
  resourceKind: string;
  resourceKindLabel: string;
  name: string;
  reference: string | null;
  quantity: number;
  unit: string | null;
  note: string | null;
}

export function RepairPlanBuilderForm({
  planId,
  jobNumber,
  confirmedFaults,
  tasks,
  resources,
  repairProcedure,
  safetyPrecautions,
  postRepairTests,
  notes,
  unestimatedTaskCount,
  totalEstimatedLabourHours,
}: {
  planId: string;
  jobNumber: string;
  confirmedFaults: ConfirmedFault[];
  tasks: PlanTask[];
  resources: PlanResource[];
  repairProcedure: string | null;
  safetyPrecautions: string | null;
  postRepairTests: string | null;
  notes: string | null;
  unestimatedTaskCount: number;
  totalEstimatedLabourHours: number;
}) {
  const router = useRouter();
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  // Which fault the "add task" form is pre-filled for. Held here rather than in the
  // form so pressing the control on a fault card scrolls the same single form into
  // context instead of opening one form per fault.
  const [forFault, setForFault] = React.useState<string>('');
  const addTaskRef = React.useRef<HTMLFormElement>(null);

  /**
   * Runs one action and reports it.
   *
   * ⚠️ `router.refresh()` ON SUCCESS, ALWAYS. `revalidatePath` in the action marks the
   * server cache stale; it does NOT repaint the page the technician is already looking
   * at. Without this a removed task stays on screen and the next click acts on a row
   * the server has already deleted.
   */
  async function run(
    key: string,
    action: (data: FormData) => Promise<{ error?: string; created?: string }>,
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
      router.refresh();
      return true;
    } catch {
      setError('The request could not be completed. Nothing was recorded.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  const submitBlocked = tasks.length === 0 || unestimatedTaskCount > 0;

  return (
    // `space[6]`, not `space[5]` — the scale is 0/1/2/3/4/6/8/12/16 and there is no 5.
    // It is a `const` object, so an absent step is a compile error rather than an
    // `undefined` that renders as no gap at all.
    <div style={{ display: 'grid', gap: primitive.space[6] }}>
      {/* One notice region for the whole builder, rather than one per row: a screen
          reader announcing from six live regions is worse than one. `role="status"` for
          success and `role="alert"` for a refusal, because the two are not equally
          interruptive. */}
      {notice ? (
        <p
          role="status"
          style={{ margin: 0, fontSize: primitive.fontSize.sm, color: themeVar.textPrimary }}
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          style={{ margin: 0, fontSize: primitive.fontSize.sm, color: primitive.color.red[700] }}
        >
          {error}
        </p>
      ) : null}

      {/* ── §25: the confirmed faults this plan is built from ──────────────── */}
      <section style={panel}>
        <h2 style={heading}>Confirmed faults from the approved diagnosis</h2>
        <p style={hint}>
          These are what the plan is built from. A task attached to a fault is what lets
          quality control later ask whether that fault was actually repaired — so attach
          it here rather than describing it in words.
        </p>
        {confirmedFaults.length === 0 ? (
          // Should be unreachable: the service refuses to start a plan when the approved
          // diagnosis confirmed nothing. Said out loud anyway, because a blank panel
          // reads as a loading failure.
          <p style={{ margin: 0, color: themeVar.textSecondary }}>
            No confirmed faults are attached to this plan’s diagnosis.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: primitive.space[2] }}>
            {confirmedFaults.map((fault) => (
              <li key={fault.id} style={row}>
                <div style={{ display: 'grid', gap: primitive.space[1] }}>
                  <strong style={{ color: themeVar.textPrimary }}>
                    {fault.faultDescription}
                    {fault.faultCode ? (
                      <code
                        style={{
                          marginLeft: primitive.space[2],
                          fontFamily: primitive.fontFamily.mono,
                          fontSize: primitive.fontSize.sm,
                          color: themeVar.textSecondary,
                        }}
                      >
                        {fault.faultCode}
                      </code>
                    ) : null}
                  </strong>
                  <span
                    style={{
                      fontSize: primitive.fontSize.sm,
                      // Not colour alone (§66): the word "No tasks" carries the meaning.
                      color: fault.taskCount === 0 ? primitive.color.red[700] : themeVar.textSecondary,
                    }}
                  >
                    {fault.taskCount === 0
                      ? 'No tasks address this fault yet'
                      : `${fault.taskCount} task(s) address this fault`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setForFault(fault.id);
                    addTaskRef.current?.scrollIntoView({ block: 'center' });
                  }}
                  aria-label={`Add a repair task for the fault: ${fault.faultDescription}`}
                  style={secondaryButton}
                >
                  Add a task for this fault
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── §27-§28: the tasks, in sequence ────────────────────────────────── */}
      <section style={panel}>
        <h2 style={heading}>Repair tasks, in the order they will be carried out</h2>
        {tasks.length === 0 ? (
          <p style={{ margin: 0, color: themeVar.textSecondary }}>
            No tasks yet. A plan cannot be submitted until it has at least one.
          </p>
        ) : (
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: primitive.space[3] }}>
            {tasks.map((task, index) => (
              <li key={task.id}>
                <TaskRow
                  planId={planId}
                  task={task}
                  index={index}
                  total={tasks.length}
                  confirmedFaults={confirmedFaults}
                  busy={busy}
                  run={run}
                />
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ── add a task ─────────────────────────────────────────────────────── */}
      <section style={panel}>
        <h2 style={heading}>Add a repair task</h2>
        <form
          ref={addTaskRef}
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            data.set('planId', planId);
            if (await run('add-task', addPlanTaskAction, data)) {
              form.reset();
              setForFault('');
            }
          }}
          style={{ display: 'grid', gap: primitive.space[2] }}
        >
          <Field label="What must be done" htmlFor="task-title" required>
            <input
              id="task-title"
              name="title"
              maxLength={500}
              placeholder="Replace the ignition coil on cylinder 1"
              style={input}
            />
          </Field>

          <Field label="Fault this task addresses" htmlFor="task-finding">
            {/* A SELECT, not a free-text id. The list is exactly what the API will
                accept — only CONFIRMED faults of this plan's own diagnosis — so the
                normal path cannot produce the refusal the service and the trigger are
                there to catch. */}
            <select
              id="task-finding"
              name="findingId"
              value={forFault}
              onChange={(event) => setForFault(event.target.value)}
              style={input}
            >
              <option value="">Not tied to a single fault (a road test, a refill)</option>
              {confirmedFaults.map((fault) => (
                <option key={fault.id} value={fault.id}>
                  {fault.faultDescription}
                </option>
              ))}
            </select>
          </Field>

          <div style={twoUp}>
            <Field label="Estimated labour (hours)" htmlFor="task-hours">
              <input
                id="task-hours"
                name="estimatedLabourHours"
                inputMode="decimal"
                placeholder="1.50"
                style={input}
              />
            </Field>
            <Field label="Skill required" htmlFor="task-skill">
              <input id="task-skill" name="requiredSkill" maxLength={200} style={input} />
            </Field>
          </div>

          <div style={twoUp}>
            <Field label="Service bay" htmlFor="task-bay">
              <input id="task-bay" name="serviceBay" maxLength={200} style={input} />
            </Field>
            <Field label="Detail" htmlFor="task-description">
              <input id="task-description" name="description" maxLength={8000} style={input} />
            </Field>
          </div>

          <p style={hint}>
            The estimate can be added later, but the plan cannot be submitted while any
            task is unestimated — the quotation is priced from these hours.
          </p>

          <button type="submit" disabled={busy !== null} style={primaryButton(busy === 'add-task')}>
            {busy === 'add-task' ? 'Adding…' : 'Add task'}
          </button>
        </form>
      </section>

      {/* ── §29: parts, consumables, tools, equipment ──────────────────────── */}
      <section style={panel}>
        <h2 style={heading}>Parts, consumables, tools and equipment</h2>
        {resources.length === 0 ? (
          <p style={{ margin: 0, color: themeVar.textSecondary }}>
            Nothing recorded yet.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: `0 0 ${primitive.space[3]} 0`, display: 'grid', gap: primitive.space[2] }}>
            {resources.map((resource) => (
              <li key={resource.id} style={row}>
                <div>
                  <strong style={{ color: themeVar.textPrimary }}>{resource.name}</strong>{' '}
                  <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
                    — {resource.resourceKindLabel} ·{' '}
                    {formatQuantity(resource.quantity, resource.unit)}
                    {resource.reference ? ` · ${resource.reference}` : ''}
                    {/* Which of §29's nine kinds this is decides who acts on it: a part
                        is bought, a lift is booked. Named rather than left to the
                        reader. */}
                    {MATERIAL_KINDS.includes(resource.resourceKind)
                      ? ' · to be supplied'
                      : ' · to be reserved'}
                  </span>
                </div>
                <form
                  noValidate
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const data = new FormData();
                    data.set('planId', planId);
                    data.set('resourceId', resource.id);
                    await run(`rm-res-${resource.id}`, removePlanResourceAction, data);
                  }}
                >
                  <button
                    type="submit"
                    disabled={busy !== null}
                    // `aria-label` rather than a hidden span — an attribute has no
                    // layout, so it cannot escape a scroll container. And the accessible
                    // name is then NOT the visible text, which is why the browser proof
                    // matches on the label rather than on "Remove".
                    aria-label={`Remove ${resource.name} from the plan`}
                    style={dangerButton(busy === `rm-res-${resource.id}`)}
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <form
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            data.set('planId', planId);
            if (await run('add-res', addPlanResourceAction, data)) form.reset();
          }}
          style={{ display: 'grid', gap: primitive.space[2] }}
        >
          <div style={twoUp}>
            <Field label="Name" htmlFor="res-name" required>
              <input id="res-name" name="name" maxLength={500} placeholder="Ignition coil" style={input} />
            </Field>
            <Field label="Kind" htmlFor="res-kind" required>
              <select id="res-kind" name="resourceKind" defaultValue="part" style={input}>
                {RESOURCE_KIND_ORDER.map((kind) => (
                  <option key={kind} value={kind}>
                    {RESOURCE_KIND_LABEL[kind]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div style={twoUp}>
            <Field label="Quantity" htmlFor="res-qty" required>
              <input id="res-qty" name="quantity" inputMode="decimal" defaultValue="1" style={input} />
            </Field>
            <Field label="Unit" htmlFor="res-unit">
              <input id="res-unit" name="unit" maxLength={50} placeholder="each" style={input} />
            </Field>
          </div>
          <Field label="Part or asset number" htmlFor="res-ref">
            <input id="res-ref" name="reference" maxLength={200} style={input} />
          </Field>
          <p style={hint}>
            Nothing here reserves stock or books equipment — the inventory and bay
            registries are later slices. This records what the job REQUIRES.
          </p>
          <button type="submit" disabled={busy !== null} style={primaryButton(busy === 'add-res')}>
            {busy === 'add-res' ? 'Adding…' : 'Add resource'}
          </button>
        </form>
      </section>

      {/* ── §26, §29, §29.9: the plan-level record ─────────────────────────── */}
      <section style={panel}>
        <h2 style={heading}>Procedure, safety and testing</h2>
        <form
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            data.set('planId', planId);
            await run('details', recordPlanDetailsAction, data);
          }}
          style={{ display: 'grid', gap: primitive.space[2] }}
        >
          <Field label="Repair procedure (§26)" htmlFor="plan-procedure">
            <textarea
              id="plan-procedure"
              name="repairProcedure"
              rows={2}
              maxLength={8000}
              defaultValue={repairProcedure ?? ''}
              style={input}
            />
          </Field>
          <Field label="Safety precautions (§29)" htmlFor="plan-safety">
            <textarea
              id="plan-safety"
              name="safetyPrecautions"
              rows={2}
              maxLength={8000}
              defaultValue={safetyPrecautions ?? ''}
              style={input}
            />
          </Field>
          <Field label="Tests required after the repair (§29.9)" htmlFor="plan-tests">
            <textarea
              id="plan-tests"
              name="postRepairTests"
              rows={2}
              maxLength={8000}
              defaultValue={postRepairTests ?? ''}
              style={input}
            />
          </Field>
          <Field label="Notes" htmlFor="plan-notes">
            <textarea
              id="plan-notes"
              name="notes"
              rows={2}
              maxLength={8000}
              defaultValue={notes ?? ''}
              style={input}
            />
          </Field>
          <p style={hint}>
            {/* The asymmetry the Supervisor caught in slice 3b, stated rather than
                discovered: every one of these columns is nullable, so emptying a box
                CLEARS it. Refusing to clear a field the schema allows to be absent would
                be a rule the database does not have. */}
            Emptying a box clears it. Recording the post-repair tests here is what slice
            8’s testing is checked against — a test plan written after the repair proves
            nothing.
          </p>
          <button type="submit" disabled={busy !== null} style={primaryButton(busy === 'details')}>
            {busy === 'details' ? 'Saving…' : 'Save procedure, safety and testing'}
          </button>
        </form>
      </section>

      {/* ── §29.10: submit ─────────────────────────────────────────────────── */}
      <section style={panel}>
        <h2 style={heading}>Submit for supervisor review</h2>
        <p style={hint}>
          {tasks.length} task(s), {formatHours(totalEstimatedLabourHours)} of labour.
          Once submitted the plan is frozen — the supervisor reviews what was proposed,
          so it must not move underneath them — and a revised proposal is a new attempt.
        </p>
        {submitBlocked ? (
          // ⚠️ SAYS WHICH RULE AND WHAT TO DO, rather than disabling a button silently.
          // A disabled control with no explanation is how a technician comes to believe
          // the screen is broken. The service refuses these too; this is the screen
          // agreeing with it in advance, not the rule.
          <p
            style={{
              margin: 0,
              fontSize: primitive.fontSize.sm,
              color: primitive.color.red[700],
            }}
          >
            {tasks.length === 0
              ? 'Add at least one repair task first — a plan with no tasks is a supervisor asked to approve silence.'
              : `${unestimatedTaskCount} task(s) still have no labour estimate. The quotation is priced from those hours, so they are needed before review.`}
          </p>
        ) : null}
        <form
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData();
            data.set('planId', planId);
            await run('submit', submitRepairPlanAction, data);
          }}
        >
          <button
            type="submit"
            disabled={busy !== null || submitBlocked}
            aria-label={`Submit the repair plan for job card ${jobNumber} for supervisor review`}
            style={primaryButton(busy === 'submit', submitBlocked)}
          >
            {busy === 'submit' ? 'Submitting…' : 'Submit plan for review'}
          </button>
        </form>
      </section>
    </div>
  );
}

/**
 * One task: its fields, its sequence controls, and its removal.
 *
 * The whole row is an editable form rather than a read-only row with an "edit" mode.
 * A technician revising an estimate should not have to find and press an edit button
 * first, and a two-mode row is two renderings that can disagree about what the record
 * says.
 */
function TaskRow({
  planId,
  task,
  index,
  total,
  confirmedFaults,
  busy,
  run,
}: {
  planId: string;
  task: PlanTask;
  index: number;
  total: number;
  confirmedFaults: ConfirmedFault[];
  busy: string | null;
  run: (
    key: string,
    action: (data: FormData) => Promise<{ error?: string; created?: string }>,
    data: FormData,
  ) => Promise<boolean>;
}) {
  const move = async (direction: 'up' | 'down') => {
    const data = new FormData();
    data.set('planId', planId);
    data.set('taskId', task.id);
    data.set('direction', direction);
    await run(`move-${task.id}`, movePlanTaskAction, data);
  };

  return (
    <div style={row}>
      <form
        noValidate
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          data.set('planId', planId);
          data.set('taskId', task.id);
          await run(`save-${task.id}`, updatePlanTaskAction, data);
        }}
        style={{ display: 'grid', gap: primitive.space[2], flex: 1, minWidth: 0 }}
      >
        <div style={{ display: 'flex', gap: primitive.space[2], alignItems: 'baseline' }}>
          <span
            style={{
              fontFamily: primitive.fontFamily.mono,
              fontWeight: 600,
              color: themeVar.textSecondary,
            }}
          >
            {task.position}.
          </span>
          <input
            name="title"
            defaultValue={task.title}
            maxLength={500}
            aria-label={`What must be done, task ${task.position}`}
            style={{ ...input, flex: 1, minWidth: 0 }}
          />
        </div>

        <div style={twoUp}>
          <select
            name="findingId"
            defaultValue={task.findingId ?? ''}
            aria-label={`Fault addressed by task ${task.position}`}
            style={input}
          >
            <option value="">Not tied to a single fault</option>
            {confirmedFaults.map((fault) => (
              <option key={fault.id} value={fault.id}>
                {fault.faultDescription}
              </option>
            ))}
            {/*
              ⚠️ THE STORED VALUE MAY NOT BE IN THE LIST, and the option below is what
              stops that silently detaching the task. A fault the plan's diagnosis no
              longer confirms would otherwise leave the select falling back to its first
              option — "Not tied to a single fault" — and the next save would CLEAR a
              link nobody meant to touch. Rendering it keeps the select honest about what
              is actually stored.
            */}
            {task.findingId && !confirmedFaults.some((f) => f.id === task.findingId) ? (
              <option value={task.findingId}>
                {task.findingDescription ?? 'A fault no longer listed'}
              </option>
            ) : null}
          </select>
          <input
            name="estimatedLabourHours"
            defaultValue={task.estimatedLabourHours === null ? '' : task.estimatedLabourHours.toFixed(2)}
            inputMode="decimal"
            placeholder="Hours"
            aria-label={`Estimated labour hours for task ${task.position}`}
            style={input}
          />
        </div>

        <div style={twoUp}>
          <input
            name="requiredSkill"
            defaultValue={task.requiredSkill ?? ''}
            maxLength={200}
            placeholder="Skill required"
            aria-label={`Skill required for task ${task.position}`}
            style={input}
          />
          <input
            name="serviceBay"
            defaultValue={task.serviceBay ?? ''}
            maxLength={200}
            placeholder="Service bay"
            aria-label={`Service bay for task ${task.position}`}
            style={input}
          />
        </div>

        <input
          name="description"
          defaultValue={task.description ?? ''}
          maxLength={8000}
          placeholder="Detail"
          aria-label={`Detail for task ${task.position}`}
          style={input}
        />

        {task.estimatedLabourHours === null ? (
          <span style={{ fontSize: primitive.fontSize.sm, color: primitive.color.red[700] }}>
            {formatHours(null)} — needed before the plan can be submitted
          </span>
        ) : null}

        <div style={{ display: 'flex', gap: primitive.space[2], flexWrap: 'wrap' }}>
          <button
            type="submit"
            disabled={busy !== null}
            aria-label={`Save task ${task.position}`}
            style={secondaryButton}
          >
            {busy === `save-${task.id}` ? 'Saving…' : 'Save'}
          </button>
          {/* §28's sequence. Disabled at the ends rather than offered and refused — the
              service answers "this task is already first in the sequence", which is the
              right message for a direct API call and a pointless one for a button the
              screen knew could not work. */}
          <button
            type="button"
            disabled={busy !== null || index === 0}
            onClick={() => void move('up')}
            aria-label={`Move task ${task.position} earlier in the sequence`}
            style={secondaryButton}
          >
            ↑ Earlier
          </button>
          <button
            type="button"
            disabled={busy !== null || index === total - 1}
            onClick={() => void move('down')}
            aria-label={`Move task ${task.position} later in the sequence`}
            style={secondaryButton}
          >
            ↓ Later
          </button>
        </div>
      </form>

      <form
        noValidate
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData();
          data.set('planId', planId);
          data.set('taskId', task.id);
          await run(`rm-${task.id}`, removePlanTaskAction, data);
        }}
      >
        {/* THE ESCAPE HATCH. `update` can correct a task but cannot remove a duplicate,
            and a second attempt cannot be started while this one is open — so without
            this a wrong task would stand and be quoted for. Migration 014 grants the
            DELETE for exactly this, and its trigger withdraws it once the plan is
            submitted. */}
        <button
          type="submit"
          disabled={busy !== null}
          aria-label={`Remove task ${task.position}, ${task.title}`}
          style={dangerButton(busy === `rm-${task.id}`)}
        >
          Remove
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  required = false,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'grid', gap: primitive.space[1], minWidth: 0 }}>
      {/* A REAL <label>, never `visuallyHidden`. That class is `position: absolute` and
          escapes any ancestor that is not positioned — the defect that stretched the
          document twice. Where a visible label would be noise (a table row), an
          `aria-label` attribute is used instead, because an attribute has no layout. */}
      <label
        htmlFor={htmlFor}
        style={{ fontSize: primitive.fontSize.sm, fontWeight: 600, color: themeVar.textPrimary }}
      >
        {label}
        {required ? ' *' : ''}
      </label>
      {children}
    </div>
  );
}

const panel = {
  padding: primitive.space[4],
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.md,
  // Positioned containing block, for the reason recorded on every container in this
  // slice: an absolutely positioned descendant must not escape and stretch the page.
  position: 'relative' as const,
};

const heading = {
  margin: `0 0 ${primitive.space[2]} 0`,
  fontSize: primitive.fontSize.base,
  color: themeVar.textPrimary,
};

const hint = {
  margin: `0 0 ${primitive.space[3]} 0`,
  fontSize: primitive.fontSize.sm,
  color: themeVar.textSecondary,
};

const row = {
  display: 'flex',
  gap: primitive.space[3],
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  flexWrap: 'wrap' as const,
  padding: primitive.space[3],
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.md,
  background: themeVar.surfaceRaised,
  position: 'relative' as const,
};

const twoUp = {
  display: 'grid',
  // `minmax(0, 1fr)` rather than `1fr`: a grid track's default minimum is `auto`, which
  // is the content's size, so a long value would push the track wider than its share
  // and the row would scroll the page sideways.
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

function primaryButton(busy: boolean, blocked = false) {
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

const secondaryButton = {
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

function dangerButton(busy: boolean) {
  return {
    padding: primitive.space[1],
    fontSize: primitive.fontSize.sm,
    fontWeight: 600,
    fontFamily: 'inherit',
    color: primitive.color.red[700],
    background: 'transparent',
    border: `1px solid ${primitive.color.red[700]}`,
    borderRadius: primitive.radius.md,
    cursor: busy ? ('progress' as const) : ('pointer' as const),
  };
}
