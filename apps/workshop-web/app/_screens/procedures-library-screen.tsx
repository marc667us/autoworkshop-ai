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
import { createProcedureAction } from './knowledge-actions';

/**
 * REPAIR PROCEDURES LIBRARY — slice 10.
 *
 * 🔴 SAFETY NOTES ARE THEIR OWN COLUMN, NOT A PARAGRAPH INSIDE THE STEPS. A
 * warning buried in step nine is a warning read after step eight. Migration 048
 * gives it a dedicated field for the same reason, and this screen renders it
 * FIRST — before the steps, never after.
 *
 * 🔴 AND THE CERTIFICATION REQUIREMENT IS PRINTED AS UNENFORCED. `requires_
 * certification` records what a workshop expects; nothing checks a technician's
 * certifications before they open a procedure. A screen that implied otherwise
 * would be the "comment claiming a guard that does not exist" defect — recorded
 * four times here — rendered as a user interface, and on a safety feature.
 */

interface Procedure {
  id: string;
  title: string;
  appliesTo: string | null;
  steps: string;
  estimatedMinutes: number | null;
  safetyNotes: string | null;
  requiresCertification: string | null;
  isActive: boolean;
  certificationIsEnforced: boolean;
}

function duration(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export async function ProceduresLibraryScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Repair Procedures Library');
  const procedures = await apiGet<Procedure[]>('workshop', '/knowledge/procedures');

  const header = (
    <PageHeader
      title={title}
      description="How this workshop does the jobs it does often, written down so it is done the same way every time."
    />
  );

  if (!procedures.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={procedures.reason} workspaceId="workshop" />
      </>
    );
  }

  const form = (
    <FormShell action={createProcedureAction} successPrefix="Saved">
      <Field label="Title" htmlFor="title">
        <TextInput id="title" name="title" required maxLength={300} />
      </Field>
      <Field label="Applies to" htmlFor="appliesTo" hint="Which system, model or situation.">
        <TextInput id="appliesTo" name="appliesTo" maxLength={300} />
      </Field>
      <Field
        label="Safety notes"
        htmlFor="safetyNotes"
        hint="Anything that must be read BEFORE starting. This is shown first, above the steps."
      >
        <TextInput id="safetyNotes" name="safetyNotes" maxLength={10000} />
      </Field>
      <Field label="Steps" htmlFor="steps">
        <TextInput id="steps" name="steps" required maxLength={50000} />
      </Field>
      <Field label="Typical time (minutes)" htmlFor="estimatedMinutes">
        <TextInput id="estimatedMinutes" name="estimatedMinutes" type="number" min={1} step={1} />
      </Field>
      <Field
        label="Certification required"
        htmlFor="requiresCertification"
        hint="Recorded as this workshop's expectation. Nothing stops an uncertified technician opening the procedure — see the note below."
      >
        <TextInput id="requiresCertification" name="requiresCertification" maxLength={200} />
      </Field>
      <SubmitButton>Save procedure</SubmitButton>
    </FormShell>
  );

  if (procedures.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="No procedures written down"
          description="Every job here currently depends on whoever does it remembering how. Writing one down is what makes the result the same regardless of who is on shift."
        />
        {form}
      </>
    );
  }

  const withCert = procedures.data.filter((p) => p.requiresCertification !== null).length;

  return (
    <>
      {header}
      <DataTable
        caption={`${procedures.data.length} procedures`}
        rows={procedures.data}
        rowKey={(r) => r.id}
        columns={[
          { key: 'title', header: 'Procedure', cell: (r) => r.title },
          { key: 'applies', header: 'Applies to', cell: (r) => r.appliesTo ?? '—' },
          {
            key: 'safety',
            header: 'Safety',
            // First among the content columns, deliberately — see the header.
            cell: (r) =>
              r.safetyNotes ? (
                <StatusBadge kind="attention" label={r.safetyNotes} />
              ) : (
                <StatusBadge kind="draft" label="None recorded" />
              ),
          },
          { key: 'time', header: 'Typical time', numeric: true, nowrap: true, cell: (r) => duration(r.estimatedMinutes) },
          {
            key: 'cert',
            header: 'Certification',
            cell: (r) => (r.requiresCertification === null ? '—' : r.requiresCertification),
          },
          {
            key: 'state',
            header: 'State',
            cell: (r) =>
              r.isActive ? (
                <StatusBadge kind="complete" label="In use" />
              ) : (
                <StatusBadge kind="draft" label="Retired" />
              ),
          },
        ]}
      />

      {withCert > 0 ? (
        <div style={{ margin: '1.5rem 0' }}>
          <StatusBadge kind="attention" label="Certification requirements are recorded, not enforced" />
          <p style={{ margin: '0.5rem 0 0', maxWidth: '60ch' }}>
            {withCert} of these procedures name a certification. Nothing currently
            checks whether the technician opening one holds it — the requirement
            is this workshop&apos;s stated expectation and a record of who set it.
            Treat it as a supervision rule, not a lock.
          </p>
        </div>
      ) : null}

      {form}
    </>
  );
}
