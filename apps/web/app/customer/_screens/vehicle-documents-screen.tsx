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
import { addDocumentAction } from './selfservice-actions';

/**
 * MY VEHICLE DOCUMENTS — slice 9.
 *
 * 🔴 `'customer'`, NOT `'workshop'`. A copied file carrying its origin's
 * workspace id is a recorded defect here THREE times, and local testing cannot
 * catch it: `:3000` and `:3001` share one cookie jar because cookies ignore the
 * port.
 *
 * ⚠️ EXPIRY IS THE POINT OF THIS SCREEN. A document with no expiry date is not
 * overdue — it simply does not expire, and the two must never render the same
 * way. `daysUntilExpiry` is null in that case and the screen says "no expiry"
 * rather than showing a red badge for a policy that is perfectly valid.
 */

interface DocumentRow {
  id: string;
  vehicleId: string;
  registrationNumber: string | null;
  documentKind: string;
  title: string;
  reference: string | null;
  expiresOn: string | null;
  daysUntilExpiry: number | null;
  hasFile: boolean;
}

interface VehicleOption { id: string; registrationNumber: string | null }

const KINDS = [
  { value: 'insurance', label: 'Insurance' },
  { value: 'roadworthiness', label: 'Roadworthiness certificate' },
  { value: 'registration', label: 'Registration' },
  { value: 'warranty', label: 'Warranty' },
  { value: 'service_book', label: 'Service book' },
  { value: 'purchase_receipt', label: 'Purchase receipt' },
  { value: 'other', label: 'Other' },
];

function kindLabel(v: string): string {
  return KINDS.find((k) => k.value === v)?.label ?? v;
}

function expiry(row: DocumentRow) {
  if (row.expiresOn === null) return <StatusBadge kind="draft" label="No expiry" />;
  const days = row.daysUntilExpiry ?? 0;
  if (days < 0) return <StatusBadge kind="blocked" label={`Expired ${Math.abs(days)}d ago`} />;
  if (days <= 30) return <StatusBadge kind="attention" label={`${days}d left`} />;
  return <StatusBadge kind="complete" label={row.expiresOn} />;
}

export async function VehicleDocumentsScreen({ route }: { route: string }) {
  const [docs, vehicles] = await Promise.all([
    apiGet<DocumentRow[]>('customer', '/self-service/documents'),
    apiGet<VehicleOption[]>('customer', '/vehicles'),
  ]);

  const header = (
    <PageHeader
      title="Vehicle Documents"
      description="Insurance, roadworthiness and registration papers for your vehicles, with what expires when."
    />
  );

  if (!docs.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={docs.reason} workspaceId="customer" />
      </>
    );
  }

  const form = (
    <FormShell action={addDocumentAction} successPrefix="Saved">
      <Field label="Vehicle" htmlFor="vehicleId">
        <Select
          id="vehicleId"
          name="vehicleId"
          required
          options={
            vehicles.ok
              ? vehicles.data.map((v) => ({ value: v.id, label: v.registrationNumber ?? 'Vehicle' }))
              : []
          }
        />
      </Field>
      <Field label="Type" htmlFor="documentKind">
        <Select id="documentKind" name="documentKind" options={KINDS} defaultValue="insurance" />
      </Field>
      <Field label="Title" htmlFor="title">
        <TextInput id="title" name="title" required maxLength={300} />
      </Field>
      <Field label="Reference number" htmlFor="reference">
        <TextInput id="reference" name="reference" maxLength={200} />
      </Field>
      <Field
        label="Expires on"
        htmlFor="expiresOn"
        hint="Leave blank if it does not expire. Blank means no expiry, which is not the same as expired."
      >
        <TextInput id="expiresOn" name="expiresOn" type="date" />
      </Field>
      <SubmitButton>Save document</SubmitButton>
    </FormShell>
  );

  if (docs.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="No documents recorded"
          description="Recording an insurance or roadworthiness expiry here means you and the workshop can both see what is running out."
        />
        {form}
      </>
    );
  }

  return (
    <>
      {header}
      <DataTable
        caption={`${docs.data.length} documents`}
        rows={docs.data}
        rowKey={(r) => r.id}
        columns={[
          { key: 'title', header: 'Document', cell: (r) => r.title },
          { key: 'kind', header: 'Type', cell: (r) => kindLabel(r.documentKind) },
          { key: 'veh', header: 'Vehicle', nowrap: true, cell: (r) => r.registrationNumber ?? '—' },
          { key: 'ref', header: 'Reference', nowrap: true, cell: (r) => r.reference ?? '—' },
          { key: 'exp', header: 'Expiry', nowrap: true, cell: (r) => expiry(r) },
          {
            key: 'file',
            header: 'File',
            cell: (r) =>
              r.hasFile ? (
                <StatusBadge kind="complete" label="Attached" />
              ) : (
                <StatusBadge kind="draft" label="Details only" />
              ),
          },
        ]}
      />
      {form}
    </>
  );
}
