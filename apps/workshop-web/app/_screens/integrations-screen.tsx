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
import { saveIntegrationAction } from './settings-actions';

/**
 * INTEGRATIONS — bring your own connection. Slice 6, implementing D7 / ADR-015.
 *
 * ── 🔴 THIS SCREEN NEVER ACCEPTS A CREDENTIAL ──────────────────────────────
 *
 * D7 says a tenant connects its OWN SMS gateway, payment merchant, SMTP or OBD
 * device, and that the app works fully with none configured. The obvious build —
 * a form with an "API key" box writing into a `config` column — is a plaintext
 * credential store with extra steps, and it is the shape this deliberately does
 * not have.
 *
 * Three layers, and they are in the right order:
 *
 *   1. this form only offers NON-SECRET fields, so there is nothing to paste in;
 *   2. `settings-actions.ts` builds `config` from a NAMED LIST, so a field added
 *      to this page later cannot be forwarded by accident;
 *   3. migration 045's trigger REFUSES any key that looks like a credential, on
 *      INSERT and on UPDATE, and verify/045 proves it by trying both.
 *
 * Layer 3 is the authority. Layers 1 and 2 exist so that nobody ever has to
 * discover layer 3 the hard way.
 *
 * ── ⚠️ NOTHING HERE COSTS MONEY, AND NOTHING HERE PROPOSES SPENDING IT ─────
 *
 * ADR-012 is zero-cost including production. A workshop that connects no
 * provider at all still has a fully working app: in-app notifications, cash and
 * bank-transfer payments recorded by hand, and no OBD import. These connections
 * are the workshop's own existing accounts, not a purchase this platform asks
 * for.
 */

interface IntegrationRow {
  id: string;
  providerKind: string;
  providerName: string;
  status: string;
  config: Record<string, unknown>;
  hasSecret: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
}

const KINDS = [
  { value: 'sms', label: 'Text messaging' },
  { value: 'email', label: 'Email sending' },
  { value: 'payment', label: 'Card / mobile money' },
  { value: 'accounting', label: 'Accounting' },
  { value: 'obd', label: 'OBD diagnostic device' },
  { value: 'storage', label: 'File storage' },
];

const STATUSES = [
  { value: 'configured', label: 'Settings recorded' },
  { value: 'connected', label: 'Working' },
  { value: 'disconnected', label: 'Not connected' },
  { value: 'failed', label: 'Failing' },
];

const TONE: Record<string, 'draft' | 'active' | 'complete' | 'attention' | 'blocked'> = {
  disconnected: 'draft',
  configured: 'attention',
  connected: 'complete',
  failed: 'blocked',
};

function label(list: { value: string; label: string }[], value: string): string {
  return list.find((x) => x.value === value)?.label ?? value;
}

function describeConfig(config: Record<string, unknown>): string {
  const keys = Object.keys(config);
  if (keys.length === 0) return 'no settings recorded';
  return keys.map((k) => `${k}: ${String(config[k])}`).join(' · ');
}

export async function IntegrationsScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Integrations');
  const integrations = await apiGet<IntegrationRow[]>('workshop', '/settings/integrations');

  const header = (
    <PageHeader
      title={title}
      description="This workshop's own external accounts. The app works fully with none of these connected — they are here so a workshop can use the providers it already pays for, not so it has to buy any."
    />
  );

  if (!integrations.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={integrations.reason} workspaceId="workshop" />
      </>
    );
  }

  const form = (
    <FormShell action={saveIntegrationAction} successPrefix="Saved">
      <Field label="What it does" htmlFor="providerKind">
        <Select id="providerKind" name="providerKind" options={KINDS} defaultValue="sms" />
      </Field>
      <Field label="Provider" htmlFor="providerName" hint="The company or device, in your own words.">
        <TextInput id="providerName" name="providerName" required maxLength={200} />
      </Field>
      <Field label="Account label" htmlFor="accountLabel" hint="How you refer to this account.">
        <TextInput id="accountLabel" name="accountLabel" maxLength={200} />
      </Field>
      <Field label="Sender ID" htmlFor="senderId" hint="For text messages — the name recipients see.">
        <TextInput id="senderId" name="senderId" maxLength={200} />
      </Field>
      <Field label="Region" htmlFor="region">
        <TextInput id="region" name="region" maxLength={200} />
      </Field>
      <Field label="Endpoint" htmlFor="endpoint" hint="The address the provider gave you, if any.">
        <TextInput id="endpoint" name="endpoint" maxLength={200} />
      </Field>
      <Field label="State" htmlFor="status">
        <Select id="status" name="status" options={STATUSES} defaultValue="configured" />
      </Field>
      <SubmitButton>Save connection</SubmitButton>
    </FormShell>
  );

  return (
    <>
      {header}

      {/* 🔴 SAID BEFORE THE FORM, NOT AFTER IT. Somebody looking for the "API
          key" box needs to know why there isn't one BEFORE they go hunting for
          a field to paste it into. */}
      <div style={{ margin: '1rem 0' }}>
        <StatusBadge kind="attention" label="Never paste a key, token or password on this page" />
        <p style={{ margin: '0.5rem 0 0', maxWidth: '60ch' }}>
          These fields are for settings only — an account name, a sender ID, a
          region. Credentials are refused outright and are never stored here.
          When a provider needs a secret, the workshop owner installs it
          separately and this record only remembers that one exists.
        </p>
      </div>

      {integrations.data.length === 0 ? (
        <EmptyState
          title="No external accounts are connected"
          description="Nothing is missing. The workshop runs on in-app notifications, and payments and messages recorded by hand, until it chooses to connect an account it already has."
        />
      ) : (
        <DataTable
          caption={`${integrations.data.length} connections`}
          rows={integrations.data}
          rowKey={(r) => r.id}
          columns={[
            { key: 'kind', header: 'What it does', cell: (r) => label(KINDS, r.providerKind) },
            { key: 'name', header: 'Provider', cell: (r) => r.providerName },
            { key: 'config', header: 'Settings', cell: (r) => describeConfig(r.config) },
            {
              key: 'secret',
              header: 'Secret installed?',
              cell: (r) =>
                r.hasSecret ? (
                  <StatusBadge kind="complete" label="Yes" />
                ) : (
                  <StatusBadge kind="draft" label="No" />
                ),
            },
            {
              key: 'status',
              header: 'State',
              cell: (r) => (
                <StatusBadge kind={TONE[r.status] ?? 'draft'} label={label(STATUSES, r.status)} />
              ),
            },
            { key: 'error', header: 'Last problem', cell: (r) => r.lastError ?? '—' },
          ]}
        />
      )}

      {form}
    </>
  );
}
