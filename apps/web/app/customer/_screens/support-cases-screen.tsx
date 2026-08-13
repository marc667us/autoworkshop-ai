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
import { raiseCaseAction } from './selfservice-actions';

/**
 * SUPPORT CASES — slice 9.
 *
 * 🔴 A RESOLVED CASE ALWAYS CARRIES ITS RESOLUTION, enforced by a CHECK in
 * migration 047 rather than by this screen remembering to show one. A case that
 * closes with no word about what was done is one the customer cannot tell was
 * handled — worse than an open case, because it looks finished.
 *
 * ⚠️ THE REFERENCE COMES FROM THE DATABASE'S ALLOCATOR. The first draft of the
 * service built it from `count(*) + 1`, which two simultaneous complaints
 * resolve identically; one would have been rejected by the unique constraint
 * and vanished behind a 500, at exactly the moment two people complain at once.
 * Migration 047 copies the job-number allocator from 006 instead of inventing a
 * second, worse one.
 */

interface CaseRow {
  id: string;
  reference: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  resolution: string | null;
  jobNumber: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

const CATEGORIES = [
  { value: 'billing', label: 'A bill or payment' },
  { value: 'quality', label: 'The quality of the work' },
  { value: 'delay', label: 'How long it is taking' },
  { value: 'warranty', label: 'A warranty question' },
  { value: 'account', label: 'My account' },
  { value: 'other', label: 'Something else' },
];

const TONE: Record<string, 'draft' | 'active' | 'complete' | 'attention' | 'blocked'> = {
  open: 'attention',
  in_progress: 'active',
  resolved: 'complete',
  closed: 'draft',
};

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  in_progress: 'Being looked at',
  resolved: 'Resolved',
  closed: 'Closed',
};

function when(iso: string): string {
  try {
    return new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export async function SupportCasesScreen({ route }: { route: string }) {
  const cases = await apiGet<CaseRow[]>('customer', '/self-service/cases');

  const header = (
    <PageHeader
      title="Support Cases"
      description="Anything you have raised with this workshop, and what came of it. Every resolved case says what was done."
    />
  );

  if (!cases.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={cases.reason} workspaceId="customer" />
      </>
    );
  }

  const form = (
    <FormShell action={raiseCaseAction} successPrefix="Raised">
      <Field label="What is it about?" htmlFor="category">
        <Select id="category" name="category" options={CATEGORIES} defaultValue="quality" />
      </Field>
      <Field label="Subject" htmlFor="subject">
        <TextInput id="subject" name="subject" required maxLength={300} />
      </Field>
      <Field label="Tell us what happened" htmlFor="description">
        <TextInput id="description" name="description" required maxLength={10000} />
      </Field>
      <SubmitButton>Raise a case</SubmitButton>
    </FormShell>
  );

  if (cases.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="You have not raised anything"
          description="A case is the formal record of a complaint or a question. Anything raised here is kept with your history, so it cannot be lost track of."
        />
        {form}
      </>
    );
  }

  const open = cases.data.filter((c) => c.status === 'open' || c.status === 'in_progress').length;

  return (
    <>
      {header}
      <DataTable
        caption={`${cases.data.length} cases · ${open} still open`}
        rows={cases.data}
        rowKey={(r) => r.id}
        columns={[
          { key: 'ref', header: 'Reference', nowrap: true, cell: (r) => r.reference },
          { key: 'subject', header: 'Subject', cell: (r) => r.subject },
          {
            key: 'cat',
            header: 'About',
            cell: (r) => CATEGORIES.find((c) => c.value === r.category)?.label ?? r.category,
          },
          { key: 'job', header: 'Repair', nowrap: true, cell: (r) => r.jobNumber ?? '—' },
          { key: 'raised', header: 'Raised', nowrap: true, cell: (r) => when(r.createdAt) },
          {
            key: 'state',
            header: 'Status',
            cell: (r) => (
              <StatusBadge kind={TONE[r.status] ?? 'draft'} label={STATUS_LABEL[r.status] ?? r.status} />
            ),
          },
          { key: 'outcome', header: 'What was done', cell: (r) => r.resolution ?? 'Not resolved yet' },
        ]}
      />
      {form}
    </>
  );
}
