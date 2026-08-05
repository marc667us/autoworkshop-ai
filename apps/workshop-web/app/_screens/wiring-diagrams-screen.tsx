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
import { createDiagramAction } from './knowledge-actions';

/**
 * WIRING DIAGRAMS — slice 10, and the one screen in this slice that sits
 * directly on the staging boundary.
 *
 * ── 🔴 WHAT IS STAGED IS THE OEM'S COPYRIGHT, NOT THIS FEATURE ─────────────
 *
 * `CLAUDE.md` §4 stages licensed content — OEM wiring diagrams and
 * vehicle-specific 3D geometry — and nothing else. It would be easy to read
 * that as "diagrams are not built". They are: a workshop can file its OWN
 * sketches and photographs today, and that is the common case for the kind of
 * garage this platform serves.
 *
 * A row marked `licensed_pending` records a diagram the workshop WANTS and has
 * not licensed. Migration 048 REFUSES such a row that carries a file, so the
 * boundary is a constraint rather than a promise — verify/048 check 3 proves it
 * by trying, and also proves a `licensed` row MAY carry one, so the constraint
 * discriminates rather than simply forbidding every file.
 *
 * ⚠️ THE FORM DEFAULTS TO `own`. Defaulting to `licensed` would let somebody
 * assert a licence by not choosing, on the one field here with legal weight.
 */

interface Diagram {
  id: string;
  title: string;
  diagramKind: string;
  appliesTo: string | null;
  source: string;
  licenceNote: string | null;
  hasFile: boolean;
}

const KINDS = [
  { value: 'wiring', label: 'Wiring' },
  { value: 'hydraulic', label: 'Hydraulic' },
  { value: 'exploded_view', label: 'Exploded view' },
  { value: 'routing', label: 'Routing' },
  { value: 'other', label: 'Other' },
];

const SOURCES = [
  { value: 'own', label: 'Our own drawing or photograph' },
  { value: 'licensed', label: 'Licensed to this workshop' },
  { value: 'licensed_pending', label: 'Wanted — not licensed yet' },
];

const SOURCE_TONE: Record<string, 'draft' | 'active' | 'complete' | 'attention' | 'blocked'> = {
  own: 'complete',
  licensed: 'active',
  licensed_pending: 'attention',
};

function label(list: { value: string; label: string }[], v: string): string {
  return list.find((x) => x.value === v)?.label ?? v;
}

export async function WiringDiagramsScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Wiring Diagrams');
  const diagrams = await apiGet<Diagram[]>('workshop', '/knowledge/diagrams');

  const header = (
    <PageHeader
      title={title}
      description="Diagrams this workshop holds. Your own drawings and photographs work fully; manufacturer diagrams need a licence this platform does not include."
    />
  );

  if (!diagrams.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={diagrams.reason} workspaceId="workshop" />
      </>
    );
  }

  const form = (
    <FormShell action={createDiagramAction} successPrefix="Recorded">
      <Field label="Title" htmlFor="title">
        <TextInput id="title" name="title" required maxLength={300} />
      </Field>
      <Field label="Kind" htmlFor="diagramKind">
        <Select id="diagramKind" name="diagramKind" options={KINDS} defaultValue="wiring" />
      </Field>
      <Field label="Applies to" htmlFor="appliesTo" hint="Which model, system or year range.">
        <TextInput id="appliesTo" name="appliesTo" maxLength={300} />
      </Field>
      <Field
        label="Where it came from"
        htmlFor="source"
        hint="A diagram marked as not licensed yet is a note that you want it — it cannot hold a file until the licence exists."
      >
        <Select id="source" name="source" options={SOURCES} defaultValue="own" />
      </Field>
      <Field label="Licence note" htmlFor="licenceNote">
        <TextInput id="licenceNote" name="licenceNote" maxLength={1000} />
      </Field>
      <SubmitButton>Record diagram</SubmitButton>
    </FormShell>
  );

  return (
    <>
      {header}

      {/* Said BEFORE the table, so somebody looking for the OEM library knows
          why it is not here before they conclude the feature is broken. */}
      <div style={{ margin: '1rem 0' }}>
        <StatusBadge kind="attention" label="Manufacturer diagrams are licensed content" />
        <p style={{ margin: '0.5rem 0 0', maxWidth: '60ch' }}>
          This platform ships no OEM wiring diagrams — they are somebody
          else&apos;s copyright and would have to be licensed. What works fully
          today is your own drawings and photographs. You can also record a
          diagram you <em>want</em>, so a procedure can reference it; that entry
          cannot hold a file until the licence exists.
        </p>
      </div>

      {diagrams.data.length === 0 ? (
        <EmptyState
          title="No diagrams recorded"
          description="Photograph a loom or sketch a routing once and every technician after you has it. That works today and needs no licence."
        />
      ) : (
        <DataTable
          caption={`${diagrams.data.length} diagrams`}
          rows={diagrams.data}
          rowKey={(r) => r.id}
          columns={[
            { key: 'title', header: 'Diagram', cell: (r) => r.title },
            { key: 'kind', header: 'Kind', nowrap: true, cell: (r) => label(KINDS, r.diagramKind) },
            { key: 'applies', header: 'Applies to', cell: (r) => r.appliesTo ?? '—' },
            {
              key: 'source',
              header: 'Source',
              cell: (r) => (
                <StatusBadge kind={SOURCE_TONE[r.source] ?? 'draft'} label={label(SOURCES, r.source)} />
              ),
            },
            {
              key: 'file',
              header: 'File',
              cell: (r) =>
                r.hasFile ? (
                  <StatusBadge kind="complete" label="Held" />
                ) : r.source === 'licensed_pending' ? (
                  <StatusBadge kind="attention" label="Awaiting licence" />
                ) : (
                  <StatusBadge kind="draft" label="Not uploaded" />
                ),
            },
            { key: 'note', header: 'Licence note', cell: (r) => r.licenceNote ?? '—' },
          ]}
        />
      )}

      {form}
    </>
  );
}
