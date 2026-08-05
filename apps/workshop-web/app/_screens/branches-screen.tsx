import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import {
  DataTable,
  EmptyState,
  Field,
  FormShell,
  PageHeader,
  StatusBadge,
  SubmitButton,
  TextInput,
} from '@autoworkshop/ui';
import { navLabelFor } from './nav-label';
import { createBranchAction } from './settings-actions';

/**
 * BRANCHES — slice 6.
 *
 * ⚠️ NO NEW TABLE. `identity.branches` has existed since migration 002 and is
 * already referenced by `repair.job_cards.branch_id` and
 * `identity.memberships.branch_id`; it simply had no screen. Adding a second
 * "sites" table would have been the duplicate-module failure the Project
 * Execution Directive §3 exists to stop — and worse, job cards would have kept
 * pointing at the old one.
 *
 * ⚠️ MOUNTED AT TWO ROUTES. The owner tree calls it
 * `/workshop-management/branches` and the settings group calls it
 * `/settings/branches`. One implementation, and `navLabelFor` reads the heading
 * back from whichever tree the viewer is in, so the menu and the heading agree
 * without a per-route copy of the wording to drift.
 *
 * ⚠️ A BRANCHLESS WORKSHOP IS THE NORMAL CASE, not an empty state to apologise
 * for. Most workshops have one site, `branch_id` is nullable everywhere it
 * appears, and nothing breaks without a row here.
 */

interface BranchRow {
  id: string;
  name: string;
  location: string | null;
  status: string;
  memberCount: number;
}

const TONE: Record<string, 'draft' | 'active' | 'complete' | 'attention' | 'blocked'> = {
  active: 'complete',
  suspended: 'attention',
  closed: 'draft',
};

export async function BranchesScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Branches');
  const branches = await apiGet<BranchRow[]>('workshop', '/settings/branches');

  const header = (
    <PageHeader
      title={title}
      description="The sites this workshop operates. Staff and job cards can be attached to a branch, so the staging board and reports can be read one site at a time."
    />
  );

  if (!branches.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={branches.reason} workspaceId="workshop" />
      </>
    );
  }

  const form = (
    <FormShell action={createBranchAction} successPrefix="Added">
      <Field label="Name" htmlFor="name">
        <TextInput id="name" name="name" required maxLength={200} />
      </Field>
      <Field label="Location" htmlFor="location" hint="Where it is, in your own words.">
        <TextInput id="location" name="location" maxLength={500} />
      </Field>
      <SubmitButton>Add branch</SubmitButton>
    </FormShell>
  );

  if (branches.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="This workshop runs from one site"
          description="That is the normal case and nothing is missing — staff, job cards and opening hours all work without a branch. Add one only when there is a second site to tell apart."
        />
        {form}
      </>
    );
  }

  return (
    <>
      {header}
      <DataTable
        caption={`${branches.data.length} branches`}
        rows={branches.data}
        rowKey={(r) => r.id}
        columns={[
          { key: 'name', header: 'Branch', cell: (r) => r.name },
          { key: 'location', header: 'Location', cell: (r) => r.location ?? '—' },
          {
            key: 'people',
            header: 'Staff attached',
            numeric: true,
            nowrap: true,
            cell: (r) => r.memberCount,
          },
          {
            key: 'status',
            header: 'State',
            cell: (r) => <StatusBadge kind={TONE[r.status] ?? 'draft'} label={r.status} />,
          },
        ]}
      />
      {form}
    </>
  );
}
