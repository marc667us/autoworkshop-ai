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
import { saveTemplateAction } from './settings-actions';

/**
 * DOCUMENT AND MESSAGE TEMPLATES — slice 6.
 *
 * What this workshop's invoices, quotations, emails and text messages say, in
 * its own words rather than the platform's defaults.
 *
 * ⚠️ AN EMAIL TEMPLATE WITHOUT A SUBJECT CANNOT BE SENT, and that rule is
 * enforced in three places on purpose: a CHECK constraint in migration 045, a
 * `.refine` on the request schema, and `required` on this field when the channel
 * is email. The constraint is the authority; the other two exist so the person
 * typing gets a sentence instead of a 500.
 *
 * ⚠️ SAVING IS AN UPSERT ON `template_key`. Editing is therefore the same
 * action as creating — type the existing key and the body is replaced. That is
 * deliberate: a second template with the same key would leave two candidates and
 * no rule for which one an invoice uses.
 */

interface TemplateRow {
  id: string;
  templateKey: string;
  channel: string;
  name: string;
  subject: string | null;
  body: string;
  isActive: boolean;
}

const CHANNELS = [
  { value: 'document', label: 'Document (invoice / quotation)' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'Text message' },
  { value: 'in_app', label: 'In-app message' },
];

function channelLabel(value: string): string {
  return CHANNELS.find((c) => c.value === value)?.label ?? value;
}

/** A body can be twenty thousand characters. A table cell cannot. */
function preview(body: string): string {
  const oneLine = body.replace(/\s+/g, ' ').trim();
  return oneLine.length > 90 ? `${oneLine.slice(0, 90)}…` : oneLine;
}

export async function TemplatesScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Templates');
  const templates = await apiGet<TemplateRow[]>('workshop', '/settings/templates');

  const header = (
    <PageHeader
      title={title}
      description="The wording this workshop uses on its documents and messages. Saving against an existing key replaces that template rather than adding a second one."
    />
  );

  if (!templates.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={templates.reason} workspaceId="workshop" />
      </>
    );
  }

  const form = (
    <FormShell action={saveTemplateAction} successPrefix="Saved">
      <Field
        label="Key"
        htmlFor="templateKey"
        hint="Lower case letters, digits and underscores — for example invoice_footer. Saving against a key that already exists replaces it."
      >
        <TextInput
          id="templateKey"
          name="templateKey"
          required
          pattern="[a-z][a-z0-9_]{2,60}"
          maxLength={60}
        />
      </Field>
      <Field label="Channel" htmlFor="channel">
        <Select id="channel" name="channel" options={CHANNELS} defaultValue="document" />
      </Field>
      <Field label="Name" htmlFor="name">
        <TextInput id="name" name="name" required maxLength={200} />
      </Field>
      <Field
        label="Subject"
        htmlFor="subject"
        hint="Required for an email — an email with no subject line cannot be sent. Leave blank for the other channels."
      >
        <TextInput id="subject" name="subject" maxLength={300} />
      </Field>
      <Field label="Body" htmlFor="body">
        <TextInput id="body" name="body" required maxLength={20000} />
      </Field>
      <SubmitButton>Save template</SubmitButton>
    </FormShell>
  );

  if (templates.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="No templates are recorded"
          description="Documents and messages currently use the platform's default wording. Anything saved here replaces that default for this workshop only."
        />
        {form}
      </>
    );
  }

  return (
    <>
      {header}
      <DataTable
        caption={`${templates.data.length} templates`}
        rows={templates.data}
        rowKey={(r) => r.id}
        columns={[
          { key: 'name', header: 'Template', cell: (r) => r.name },
          { key: 'key', header: 'Key', nowrap: true, cell: (r) => r.templateKey },
          { key: 'channel', header: 'Channel', cell: (r) => channelLabel(r.channel) },
          { key: 'subject', header: 'Subject', cell: (r) => r.subject ?? '—' },
          { key: 'body', header: 'Body', cell: (r) => preview(r.body) },
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
      {form}
    </>
  );
}
