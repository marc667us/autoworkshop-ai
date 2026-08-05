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
import { createToolAction } from './parts-actions';

/**
 * TOOLS AND EQUIPMENT — slice 4. §34 `/workshop-floor/tools-and-equipment` and
 * §46 `/workshop-management/tools-and-equipment`.
 *
 * ── ⚠️ A TOOL IS NOT A STOCK ITEM ──────────────────────────────────────────
 *
 * It is not consumed; it is BORROWED and comes back. Modelling it as stock would
 * make every loan a negative movement and every return a positive one, so the
 * shelf count would swing about while the tool never left the building — and
 * `available` would be meaningless for both.
 *
 * ── ⚠️ CALIBRATION IS SHOWN AS A DATE AND A STATE ──────────────────────────
 *
 * A torque wrench or a diagnostic tool that is out of calibration produces
 * measurements a repair is then JUDGED on — including in a warranty dispute. So
 * an overdue tool sorts to the top and says how overdue, rather than being a
 * colour somebody has to notice.
 */

interface ToolRow {
  id: string;
  asset_tag: string;
  name: string;
  tool_type: string;
  location: string | null;
  status: string;
  calibration_due_on: string | null;
  notes: string | null;
}

const TYPES = [
  { value: 'hand_tool', label: 'Hand tool' },
  { value: 'power_tool', label: 'Power tool' },
  { value: 'diagnostic', label: 'Diagnostic' },
  { value: 'lifting', label: 'Lifting' },
  { value: 'measurement', label: 'Measurement' },
  { value: 'specialist', label: 'Specialist' },
  { value: 'other', label: 'Other' },
];

const STATUS_TONE: Record<string, 'draft' | 'active' | 'complete' | 'attention' | 'blocked'> = {
  available: 'complete',
  in_use: 'active',
  maintenance: 'attention',
  calibration: 'attention',
  lost: 'blocked',
  retired: 'draft',
};

function daysOverdue(due: string | null): number | null {
  if (!due) return null;
  const ms = Date.now() - new Date(due).getTime();
  return ms > 0 ? Math.floor(ms / 86_400_000) : null;
}

export async function ToolsScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Tools and Equipment');
  const tools = await apiGet<ToolRow[]>('workshop', '/tools');

  const header = (
    <PageHeader
      title={title}
      description="The workshop's own tools, where they are, and which need calibrating. A tool out of calibration produces measurements a repair is later judged on."
    />
  );

  if (!tools.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={tools.reason} workspaceId="workshop" />
      </>
    );
  }

  const overdue = tools.data.filter((t) => daysOverdue(t.calibration_due_on) !== null);

  return (
    <>
      {header}

      {tools.data.length === 0 ? (
        <EmptyState
          title="No tools recorded"
          description="Add the workshop's tools and equipment. Give the ones that need it a calibration date and this screen will keep track."
        />
      ) : (
        <DataTable
          caption="Tools and equipment"
          summary={
            overdue.length > 0
              ? `⚠️ ${overdue.length} past calibration · ${tools.data.length} on record`
              : `${tools.data.length} on record, none past calibration`
          }
          rowKey={(t) => t.id}
          rows={tools.data}
          columns={[
            { key: 'tag', header: 'Asset tag', nowrap: true, cell: (t) => t.asset_tag },
            { key: 'name', header: 'Tool', cell: (t) => t.name },
            {
              key: 'type', header: 'Type', secondary: true,
              cell: (t) => TYPES.find((x) => x.value === t.tool_type)?.label ?? t.tool_type,
            },
            { key: 'where', header: 'Where', cell: (t) => t.location ?? '—' },
            {
              key: 'calibration', header: 'Calibration',
              cell: (t) => {
                const over = daysOverdue(t.calibration_due_on);
                if (t.calibration_due_on === null) return <span style={{ opacity: 0.7 }}>Not tracked</span>;
                // The NUMBER of days, not a colour — §66, and it is what the
                // person deciding whether to use it actually needs.
                if (over !== null) {
                  return <StatusBadge kind="blocked" label={`${over} day${over === 1 ? '' : 's'} overdue`} />;
                }
                return <span>Due {t.calibration_due_on}</span>;
              },
            },
            {
              key: 'status', header: 'Status',
              cell: (t) => <StatusBadge kind={STATUS_TONE[t.status] ?? 'draft'} label={t.status.replace('_', ' ')} />,
            },
          ]}
        />
      )}

      <h2 style={{ fontSize: '1rem', marginTop: '2rem' }}>Add a tool</h2>
      <FormShell action={createToolAction} successPrefix="Added">
        <Field label="Asset tag" hint="However the workshop labels it. Must be unique." htmlFor="assetTag">
          <TextInput id="assetTag" name="assetTag" required maxLength={60} />
        </Field>
        <Field label="Name" htmlFor="name">
          <TextInput id="name" name="name" required maxLength={300} />
        </Field>
        <Field label="Type" htmlFor="toolType">
          <Select id="toolType" name="toolType" options={TYPES} defaultValue="hand_tool" />
        </Field>
        <Field label="Where it lives" htmlFor="location">
          <TextInput id="location" name="location" maxLength={120} />
        </Field>
        <Field
          label="Calibration due"
          hint="Leave blank for anything that does not need calibrating — a blank means NOT TRACKED, not 'fine'."
          htmlFor="calibrationDueOn"
        >
          <TextInput id="calibrationDueOn" name="calibrationDueOn" type="date" />
        </Field>
        <SubmitButton>Add the tool</SubmitButton>
      </FormShell>
    </>
  );
}
