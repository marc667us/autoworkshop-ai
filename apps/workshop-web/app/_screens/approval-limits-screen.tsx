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
import { setApprovalLimitAction } from './settings-actions';

/**
 * APPROVAL LIMITS — slice 6.
 *
 * 🔴 THIS SCREEN SAYS, IN AS MANY WORDS, THAT THE LIMITS ARE NOT YET APPLIED.
 *
 * `core.approval_limits` RECORDS what a workshop has decided. The approval path
 * in `repair` is what would enforce it, and it does not read these rows yet. A
 * settings screen that quietly implies otherwise is worse than no screen: an
 * owner would set a limit, believe money was being gated, and find out when it
 * was not. That is the "comment claiming a guard that does not exist" defect —
 * recorded four times in this repository — rendered as a user interface.
 *
 * So `isEnforced` comes from the API on every row and the state column prints
 * it. When the approval path starts reading these rows, the API flips the flag
 * and this screen tells the truth without being edited.
 *
 * ⚠️ ONLY THE OWNER MAY CHANGE THESE. A manager who can raise their own
 * approval limit does not have an approval limit. `SettingsService` refuses
 * anyone else and names what they can still do.
 */

interface LimitRow {
  id: string;
  roleName: string;
  scope: string;
  maxAmount: string;
  currency: string;
  isEnforced: boolean;
}

const SCOPES = [
  { value: 'repair_approval', label: 'Repair approval' },
  { value: 'quotation', label: 'Quotation' },
  { value: 'purchase_order', label: 'Purchase order' },
  { value: 'refund', label: 'Refund' },
  { value: 'credit_note', label: 'Credit note' },
  { value: 'warranty_claim', label: 'Warranty claim' },
];

const ROLES = [
  { value: 'workshop_manager', label: 'Workshop manager' },
  { value: 'workshop_supervisor', label: 'Workshop supervisor' },
  { value: 'reception_staff', label: 'Reception' },
  { value: 'storekeeper', label: 'Storekeeper' },
  { value: 'cashier', label: 'Cashier' },
  { value: 'technician', label: 'Technician' },
];

function label(list: { value: string; label: string }[], value: string): string {
  return list.find((x) => x.value === value)?.label ?? value;
}

export async function ApprovalLimitsScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Approval Limits');
  const limits = await apiGet<LimitRow[]>('workshop', '/settings/approval-limits');

  const header = (
    <PageHeader
      title={title}
      description="What each role may approve without asking the owner. Setting a limit of zero is a real answer — it means that role approves nothing, which is not the same as having no limit recorded."
    />
  );

  if (!limits.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={limits.reason} workspaceId="workshop" />
      </>
    );
  }

  const form = (
    <FormShell action={setApprovalLimitAction} successPrefix="Saved">
      <Field label="Role" htmlFor="roleName">
        <Select id="roleName" name="roleName" options={ROLES} defaultValue="workshop_manager" />
      </Field>
      <Field
        label="Decision"
        htmlFor="scope"
        hint="A workshop can trust a supervisor with parts and not with a refund, so the limit is set per kind of decision."
      >
        <Select id="scope" name="scope" options={SCOPES} defaultValue="repair_approval" />
      </Field>
      <Field label="Maximum amount" htmlFor="maxAmount">
        <TextInput id="maxAmount" name="maxAmount" type="number" min={0} step="0.01" required />
      </Field>
      <SubmitButton>Save limit</SubmitButton>
    </FormShell>
  );

  return (
    <>
      {header}

      {limits.data.length === 0 ? (
        <EmptyState
          title="No approval limits are recorded"
          description="Every decision currently goes to the workshop owner. Recording a limit here writes down who may approve what — see the note below about when that becomes enforcement."
        />
      ) : (
        <DataTable
          caption={`${limits.data.length} limits recorded`}
          rows={limits.data}
          rowKey={(r) => r.id}
          columns={[
            { key: 'role', header: 'Role', cell: (r) => label(ROLES, r.roleName) },
            { key: 'scope', header: 'Decision', cell: (r) => label(SCOPES, r.scope) },
            {
              key: 'amount',
              header: 'Up to',
              numeric: true,
              nowrap: true,
              cell: (r) => `${r.currency} ${Number(r.maxAmount).toFixed(2)}`,
            },
            {
              key: 'enforced',
              header: 'Applied?',
              cell: (r) =>
                r.isEnforced ? (
                  <StatusBadge kind="complete" label="Enforced" />
                ) : (
                  <StatusBadge kind="attention" label="Recorded only" />
                ),
            },
          ]}
        />
      )}

      {/* 🔴 THE HONEST NOTE — still the most important thing on this page,
          and it now says something different because the code changed. */}
      <div style={{ margin: '1.5rem 0' }}>
        <StatusBadge kind="complete" label="Repair approvals are enforced" />
        <p style={{ margin: '0.5rem 0 0', maxWidth: '60ch' }}>
          A <strong>repair approval</strong> limit is now applied by the system: when a
          variation&apos;s extra cost is above the reviewing role&apos;s limit, the internal
          review is refused and the message names who can approve it instead. The
          workshop owner is never limited, and a role with <em>no</em> row here is not
          limited either &mdash; setting a limit is what turns it on.
        </p>
        <p style={{ margin: '0.5rem 0 0', maxWidth: '60ch' }}>
          The other scopes &mdash; quotations, purchase orders and the rest &mdash; are still
          <strong> recorded only</strong>. The &ldquo;Applied?&rdquo; column tells you which is
          which, per row, and it reads from the code rather than from a promise.
        </p>
      </div>

      {form}
    </>
  );
}
