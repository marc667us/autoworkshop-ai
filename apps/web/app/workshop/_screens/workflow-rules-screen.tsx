import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import {
  DataTable,
  EmptyState,
  Field,
  FormShell,
  PageHeader,
  Select,
  StatusBadge,
  SubmitButton,
  TextInput,
} from '@autoworkshop/ui';
import { navLabelFor } from './nav-label';
import { createWorkflowRuleAction } from './settings-actions';

/**
 * WORKFLOW RULES — slice 6.
 *
 * 🔴 SAME HONESTY AS APPROVAL LIMITS, FOR THE SAME REASON. `core.workflow_rules`
 * records what a workshop wants to happen automatically. The stage machine in
 * `repair` is what would carry it out, and it does not read these rows yet, so
 * every row shows "Recorded only" until it does.
 *
 * The alternative — a rules screen that looks live — is exactly the
 * "disconnected mock page" `05.txt` §2 forbids, with the added harm that a
 * workshop would rely on an automation that never runs.
 */

interface RuleRow {
  id: string;
  name: string;
  triggerEvent: string;
  actionKind: string;
  executionOrder: number;
  isActive: boolean;
  isEnforced: boolean;
}

const TRIGGERS = [
  { value: 'job.created', label: 'A job card is opened' },
  { value: 'job.stage_changed', label: 'A job moves to a new stage' },
  { value: 'job.on_hold', label: 'A job goes on hold' },
  { value: 'quotation.issued', label: 'A quotation is issued' },
  { value: 'approval.overdue', label: 'An approval goes overdue' },
  { value: 'part.out_of_stock', label: 'A required part is out of stock' },
  { value: 'qc.failed', label: 'Quality control fails' },
];

const ACTIONS = [
  { value: 'notify', label: 'Notify somebody' },
  { value: 'assign', label: 'Assign it to a role' },
  { value: 'require_approval', label: 'Require an approval' },
  { value: 'block_transition', label: 'Block the move' },
  { value: 'set_priority', label: 'Change the priority' },
];

function label(list: { value: string; label: string }[], value: string): string {
  return list.find((x) => x.value === value)?.label ?? value;
}

export async function WorkflowRulesScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Workflow Rules');
  const rules = await apiGet<RuleRow[]>('workshop', '/settings/workflow-rules');

  const header = (
    <PageHeader
      title={title}
      description="What this workshop wants to happen automatically. Rules run in order, lowest number first, so a rule that blocks a move should sit ahead of one that merely notifies."
    />
  );

  if (!rules.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={rules.reason} workspaceId="workshop" />
      </>
    );
  }

  const form = (
    <FormShell action={createWorkflowRuleAction} successPrefix="Added">
      <Field label="Name" htmlFor="name">
        <TextInput id="name" name="name" required maxLength={200} />
      </Field>
      <Field label="When" htmlFor="triggerEvent">
        <Select
          id="triggerEvent"
          name="triggerEvent"
          options={TRIGGERS}
          defaultValue={TRIGGERS[0]!.value}
        />
      </Field>
      <Field label="Then" htmlFor="actionKind">
        <Select id="actionKind" name="actionKind" options={ACTIONS} defaultValue="notify" />
      </Field>
      <Field
        label="Order"
        htmlFor="executionOrder"
        hint="Lower runs first. Leave blank for the default of 100."
      >
        <TextInput id="executionOrder" name="executionOrder" type="number" min={0} step={1} />
      </Field>
      <SubmitButton>Add rule</SubmitButton>
    </FormShell>
  );

  return (
    <>
      {header}

      {rules.data.length === 0 ? (
        <EmptyState
          title="No workflow rules are recorded"
          description="The workshop currently runs on its people rather than on automation. Writing a rule down here records the intent and who set it."
        />
      ) : (
        <DataTable
          caption={`${rules.data.length} rules`}
          rows={rules.data}
          rowKey={(r) => r.id}
          columns={[
            { key: 'order', header: 'Order', numeric: true, nowrap: true, cell: (r) => r.executionOrder },
            { key: 'name', header: 'Rule', cell: (r) => r.name },
            { key: 'when', header: 'When', cell: (r) => label(TRIGGERS, r.triggerEvent) },
            { key: 'then', header: 'Then', cell: (r) => label(ACTIONS, r.actionKind) },
            {
              key: 'state',
              header: 'Running?',
              cell: (r) =>
                r.isEnforced ? (
                  <StatusBadge kind="complete" label="Running" />
                ) : (
                  <StatusBadge kind="attention" label="Recorded only" />
                ),
            },
          ]}
        />
      )}

      <div style={{ margin: '1.5rem 0' }}>
        <StatusBadge kind="attention" label="These rules are recorded, not yet running" />
        <p style={{ margin: '0.5rem 0 0', maxWidth: '60ch' }}>
          Nothing reads these rows yet, so no rule below is firing. They are the
          workshop&apos;s written intent and an audit record of who set them.
          Stage moves are governed today by the rules built into the job card,
          which the staging board shows.
        </p>
      </div>

      {form}
    </>
  );
}
