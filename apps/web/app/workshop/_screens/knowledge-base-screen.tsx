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
import { createArticleAction } from './knowledge-actions';

/**
 * THE KNOWLEDGE BASE — slice 10. ONE screen at two routes.
 *
 * §49 calls it "Repair Knowledge" and "Fault and Repair Knowledge Base"; both
 * are the same thing — the standard fault-code index plus what THIS workshop
 * has written about each. `navLabelFor` reads the heading back from whichever
 * tree the viewer is in, so two entries do not become two implementations.
 *
 * ── 🔴 THE CODES ARE GLOBAL, THE NOTES ARE NOT ─────────────────────────────
 *
 * P0300 means the same thing in every workshop on earth — a published standard,
 * not anybody's property — so `knowledge.fault_codes` carries no tenant and is
 * readable by every organisation. A workshop's own note about P0300 is
 * emphatically not: publishing a garage's method to its competitors is
 * something nobody consented to. verify/048 checks 7 and 8 assert BOTH halves,
 * because a policy that is merely restrictive would fail the second.
 *
 * ── ⚠️ NINE CODES IS NOT THE WHOLE STANDARD, AND THE SCREEN SAYS SO ────────
 *
 * Migration 048 seeds the generic OBD-II codes every scanner reports. The full
 * manufacturer-specific set runs to tens of thousands and is exactly the
 * licensed content CLAUDE.md §4 stages. Seeding a plausible-looking subset and
 * letting it read as complete would be the "disconnected mock page" failure in
 * data form.
 */

interface FaultCode {
  code: string;
  system: string;
  title: string;
  description: string | null;
  commonCauses: string | null;
  workshopNotes: number;
}

interface Article {
  id: string;
  title: string;
  body: string;
  category: string;
  faultCode: string | null;
  isShared: boolean;
  createdAt: string;
}

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'diagnostic', label: 'Diagnostic' },
  { value: 'repair', label: 'Repair' },
  { value: 'safety', label: 'Safety' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'customer_service', label: 'Customer service' },
];

const SYSTEM_LABEL: Record<string, string> = {
  powertrain: 'Powertrain',
  chassis: 'Chassis',
  body: 'Body',
  network: 'Network',
  undefined: 'Undefined',
};

function preview(body: string): string {
  const oneLine = body.replace(/\s+/g, ' ').trim();
  return oneLine.length > 120 ? `${oneLine.slice(0, 120)}…` : oneLine;
}

export async function KnowledgeBaseScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Knowledge Base');

  const [codes, articles] = await Promise.all([
    apiGet<FaultCode[]>('workshop', '/knowledge/fault-codes'),
    apiGet<Article[]>('workshop', '/knowledge/articles'),
  ]);

  const header = (
    <PageHeader
      title={title}
      description="The standard fault codes, and what this workshop has learned about them. Your notes stay yours — they are not shared with other workshops."
    />
  );

  if (!codes.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={codes.reason} workspaceId="workshop" />
      </>
    );
  }

  const form = (
    <FormShell action={createArticleAction} successPrefix="Saved">
      <Field label="Title" htmlFor="title">
        <TextInput id="title" name="title" required maxLength={300} />
      </Field>
      <Field label="Category" htmlFor="category">
        <Select id="category" name="category" options={CATEGORIES} defaultValue="diagnostic" />
      </Field>
      <Field
        label="About which fault code?"
        htmlFor="faultCode"
        hint="Optional. Linking a note to a code is what makes it appear beside that code for the next person who meets it."
      >
        <Select
          id="faultCode"
          name="faultCode"
          defaultValue=""
          options={[
            { value: '', label: 'Not about a specific code' },
            ...codes.data.map((c) => ({ value: c.code, label: `${c.code} — ${c.title}` })),
          ]}
        />
      </Field>
      <Field label="What you learned" htmlFor="body">
        <TextInput id="body" name="body" required maxLength={50000} />
      </Field>
      <SubmitButton>Save note</SubmitButton>
    </FormShell>
  );

  return (
    <>
      {header}

      <h2 style={{ marginTop: '2rem' }}>Fault codes</h2>
      <DataTable
        caption={`${codes.data.length} standard codes held`}
        rows={codes.data}
        rowKey={(r) => r.code}
        columns={[
          { key: 'code', header: 'Code', nowrap: true, cell: (r) => r.code },
          { key: 'system', header: 'System', nowrap: true, cell: (r) => SYSTEM_LABEL[r.system] ?? r.system },
          { key: 'title', header: 'Meaning', cell: (r) => r.title },
          { key: 'causes', header: 'Common causes', cell: (r) => r.commonCauses ?? '—' },
          {
            key: 'notes',
            header: 'Our notes',
            numeric: true,
            nowrap: true,
            cell: (r) =>
              r.workshopNotes > 0 ? (
                <StatusBadge kind="complete" label={`${r.workshopNotes}`} />
              ) : (
                <StatusBadge kind="draft" label="none" />
              ),
          },
        ]}
      />

      {/* 🔴 SAID PLAINLY. Nine codes could easily read as "the fault code
          index", and a technician who searched for a manufacturer code and
          found nothing would conclude the feature was broken. */}
      <p style={{ margin: '0.75rem 0 0', maxWidth: '60ch' }}>
        These are the <strong>generic OBD-II codes</strong> every scanner reports.
        Manufacturer-specific codes run to tens of thousands and are licensed
        content this platform does not ship — a code that is not listed here is
        not an error, and you can still write a note about it under a general
        category.
      </p>

      <h2 style={{ marginTop: '2rem' }}>This workshop&apos;s notes</h2>
      {articles.ok && articles.data.length > 0 ? (
        <DataTable
          caption={`${articles.data.length} notes`}
          rows={articles.data}
          rowKey={(r) => r.id}
          columns={[
            { key: 'title', header: 'Note', cell: (r) => r.title },
            {
              key: 'cat',
              header: 'Category',
              cell: (r) => CATEGORIES.find((c) => c.value === r.category)?.label ?? r.category,
            },
            { key: 'code', header: 'Fault code', nowrap: true, cell: (r) => r.faultCode ?? '—' },
            { key: 'body', header: 'Summary', cell: (r) => preview(r.body) },
            {
              key: 'shared',
              header: 'Visibility',
              cell: (r) =>
                r.isShared ? (
                  <StatusBadge kind="active" label="Shared" />
                ) : (
                  <StatusBadge kind="draft" label="This workshop only" />
                ),
            },
          ]}
        />
      ) : (
        <EmptyState
          title="Nothing written down yet"
          description="What one technician works out today is what the next one has to work out again tomorrow, unless it is written here."
        />
      )}

      {form}
    </>
  );
}
