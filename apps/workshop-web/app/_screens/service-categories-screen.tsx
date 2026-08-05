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
import { createServiceCategoryAction } from './settings-actions';
import { ToggleServiceCategory } from './toggle-service-category';

/**
 * SERVICE CATEGORIES — what this workshop sells. Slice 6.
 *
 * ⚠️ THIS IS NOT `catalogue.part_categories`. That is the PUBLIC MARKETPLACE's
 * taxonomy of parts suppliers list for sale. This is the workshop's own list of
 * SERVICES — a diagnostic, a brake overhaul, an air-conditioning regas. Merging
 * them would let a supplier's product tree decide what labour a workshop offers,
 * which is the same category error slice 4 refused between marketplace stock and
 * shelf stock.
 *
 * 🔴 DEACTIVATED, NEVER DELETED. A category that priced past jobs must stay
 * readable or those jobs stop explaining themselves. The migration withholds
 * DELETE from the application role, so the soft delete is not merely a
 * convention this screen happens to follow.
 */

interface CategoryRow {
  id: string;
  name: string;
  description: string | null;
  defaultDurationMinutes: number | null;
  indicativePrice: string | null;
  currency: string;
  isActive: boolean;
  isPublished: boolean;
  displayOrder: number;
}

function money(amount: string | null, currency: string): string {
  if (amount === null) return '—';
  return `${currency} ${Number(amount).toFixed(2)}`;
}

function duration(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export async function ServiceCategoriesScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Service Categories');
  const cats = await apiGet<CategoryRow[]>('workshop', '/settings/service-categories');

  const header = (
    <PageHeader
      title={title}
      description="The services this workshop offers, with the time and price it expects. Published categories appear on the workshop's public profile; the rest are for internal booking only."
    />
  );

  if (!cats.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={cats.reason} workspaceId="workshop" />
      </>
    );
  }

  const form = (
    <FormShell action={createServiceCategoryAction} successPrefix="Added">
      <Field label="Name" htmlFor="name">
        <TextInput id="name" name="name" required maxLength={200} />
      </Field>
      <Field label="Description" htmlFor="description">
        <TextInput id="description" name="description" maxLength={2000} />
      </Field>
      <Field
        label="Typical duration (minutes)"
        htmlFor="defaultDurationMinutes"
        hint="What the workshop expects the job to take. Leave blank if it varies too much to say — blank means 'we have not said', which is different from zero."
      >
        <TextInput
          id="defaultDurationMinutes"
          name="defaultDurationMinutes"
          type="number"
          min={1}
          step={1}
        />
      </Field>
      <Field
        label="Indicative price"
        htmlFor="indicativePrice"
        hint="A guide, not a quotation. The quotation is what a customer is asked to approve."
      >
        <TextInput id="indicativePrice" name="indicativePrice" type="number" min={0} step="0.01" />
      </Field>
      <Field label="Show on the public profile" htmlFor="isPublished">
        <input id="isPublished" name="isPublished" type="checkbox" />
      </Field>
      <SubmitButton>Add category</SubmitButton>
    </FormShell>
  );

  if (cats.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="This workshop has not listed any services"
          description="Until a category exists, reception has nothing to pick when booking a job, and the public profile shows no services at all."
        />
        {form}
      </>
    );
  }

  const active = cats.data.filter((c) => c.isActive).length;

  return (
    <>
      {header}
      <DataTable
        caption={`${cats.data.length} categories · ${active} active`}
        rows={cats.data}
        rowKey={(r) => r.id}
        columns={[
          { key: 'name', header: 'Service', cell: (r) => r.name },
          { key: 'desc', header: 'Description', cell: (r) => r.description ?? '—' },
          {
            key: 'duration',
            header: 'Typical time',
            numeric: true,
            nowrap: true,
            cell: (r) => duration(r.defaultDurationMinutes),
          },
          {
            key: 'price',
            header: 'Indicative price',
            numeric: true,
            nowrap: true,
            cell: (r) => money(r.indicativePrice, r.currency),
          },
          {
            key: 'state',
            header: 'State',
            cell: (r) =>
              r.isActive ? (
                <StatusBadge kind="complete" label="Active" />
              ) : (
                <StatusBadge kind="draft" label="Retired" />
              ),
          },
          {
            key: 'public',
            header: 'Public profile',
            cell: (r) =>
              r.isPublished ? (
                <StatusBadge kind="active" label="Shown" />
              ) : (
                <StatusBadge kind="draft" label="Not shown" />
              ),
          },
          {
            key: 'act',
            header: 'Change',
            cell: (r) => <ToggleServiceCategory id={r.id} isActive={r.isActive} name={r.name} />,
          },
        ]}
      />
      {form}
    </>
  );
}
