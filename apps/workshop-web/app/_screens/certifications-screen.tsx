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
import { recordCertificationAction } from './knowledge-actions';

/**
 * CERTIFICATIONS — slice 10.
 *
 * ⚠️ "NO EXPIRY" IS NOT "EXPIRED", and the two must never render alike. A
 * certification with a null `expires_on` does not expire; showing it in the
 * same colour as one that lapsed last month would send a supervisor chasing a
 * qualification that is perfectly valid. Migration 048 keeps the column
 * nullable for exactly this, and slice 9 makes the same distinction about
 * vehicle documents.
 *
 * ⚠️ THE HOLDER MUST BE AN ACTIVE MEMBER OF THIS WORKSHOP. The FK alone would
 * not give that — `identity.users` is not organisation-scoped, so any user id
 * would satisfy it. `KnowledgeService` checks the membership and refuses with a
 * sentence naming where to add somebody.
 */

interface Certification {
  id: string;
  userId: string;
  holderName: string;
  name: string;
  awardedOn: string;
  expiresOn: string | null;
  daysUntilExpiry: number | null;
  reference: string | null;
}

/**
 * 🔴 THE ENDPOINT IS `/memberships`, NOT `/members`, AND IT RETURNS NO NAME.
 *
 * The first draft of this screen called `/members` — which does not exist — and
 * expected a `displayName`. It would have shipped a permanently empty "who
 * holds it" dropdown, making the whole form unusable for a reason no reader
 * could guess. That is precisely the slice-4 `SuppliersScreen` defect, caught
 * the same way: by grepping the controller instead of assuming.
 *
 * `MembershipService.list` returns id / organizationId / branchId / userId /
 * roleName / status / createdAt. There is no display name, so the option label
 * is built from the role and a short id — enough to tell two colleagues apart
 * without inventing a field the API does not return.
 */
interface Membership {
  id: string;
  userId: string;
  roleName: string;
  status: string;
}

const ROLE_LABEL: Record<string, string> = {
  workshop_owner: 'Owner',
  workshop_manager: 'Manager',
  workshop_supervisor: 'Supervisor',
  reception_staff: 'Reception',
  technician: 'Technician',
  storekeeper: 'Storekeeper',
  cashier: 'Cashier',
  quality_controller: 'Quality control',
  platform_administrator: 'Platform administrator',
};
interface Course { id: string; title: string; grantsCertification: string | null }

function expiry(r: Certification) {
  if (r.expiresOn === null) return <StatusBadge kind="complete" label="Does not expire" />;
  const days = r.daysUntilExpiry ?? 0;
  if (days < 0) return <StatusBadge kind="blocked" label={`Lapsed ${Math.abs(days)}d ago`} />;
  if (days <= 60) return <StatusBadge kind="attention" label={`${days}d left`} />;
  return <StatusBadge kind="complete" label={r.expiresOn} />;
}

export async function CertificationsScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Certifications');

  const [certs, members, courses] = await Promise.all([
    apiGet<Certification[]>('workshop', '/knowledge/certifications'),
    apiGet<Membership[]>('workshop', '/memberships'),
    apiGet<Course[]>('workshop', '/knowledge/courses'),
  ]);

  const header = (
    <PageHeader
      title={title}
      description="Who is qualified to do what, and what is running out. A certification with no expiry date does not expire — that is different from having lapsed."
    />
  );

  if (!certs.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={certs.reason} workspaceId="workshop" />
      </>
    );
  }

  const form = (
    <FormShell action={recordCertificationAction} successPrefix="Recorded">
      <Field label="Who holds it" htmlFor="userId">
        <Select
          id="userId"
          name="userId"
          required
          options={
            members.ok
              ? members.data
                  // Only active members can hold a certification here — the
                  // service refuses anyone else, so offering them would be a
                  // control that leads to a refusal.
                  .filter((m) => m.status === 'active')
                  .map((m) => ({
                    value: m.userId,
                    label: `${ROLE_LABEL[m.roleName] ?? m.roleName} · ${m.userId.slice(0, 8)}`,
                  }))
              : []
          }
        />
      </Field>
      <Field label="Certification" htmlFor="name">
        <TextInput id="name" name="name" required maxLength={200} />
      </Field>
      <Field label="From which course?" htmlFor="courseId">
        <Select
          id="courseId"
          name="courseId"
          defaultValue=""
          options={[
            { value: '', label: 'Not from a recorded course' },
            ...(courses.ok ? courses.data.map((c) => ({ value: c.id, label: c.title })) : []),
          ]}
        />
      </Field>
      <Field label="Awarded on" htmlFor="awardedOn">
        <TextInput id="awardedOn" name="awardedOn" type="date" required />
      </Field>
      <Field
        label="Expires on"
        htmlFor="expiresOn"
        hint="Leave blank if it does not expire. Blank means no expiry, which is not the same as expired."
      >
        <TextInput id="expiresOn" name="expiresOn" type="date" />
      </Field>
      <Field label="Reference number" htmlFor="reference">
        <TextInput id="reference" name="reference" maxLength={200} />
      </Field>
      <SubmitButton>Record certification</SubmitButton>
    </FormShell>
  );

  if (certs.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="No certifications recorded"
          description="Recording who is qualified is what lets a procedure's certification requirement mean something, and what shows a supervisor whose qualification is running out."
        />
        {form}
      </>
    );
  }

  const lapsing = certs.data.filter(
    (c) => c.daysUntilExpiry !== null && c.daysUntilExpiry <= 60,
  ).length;

  return (
    <>
      {header}
      <DataTable
        caption={`${certs.data.length} certifications · ${lapsing} lapsed or lapsing within 60 days`}
        rows={certs.data}
        rowKey={(r) => r.id}
        columns={[
          { key: 'who', header: 'Person', cell: (r) => r.holderName },
          { key: 'what', header: 'Certification', cell: (r) => r.name },
          { key: 'awarded', header: 'Awarded', nowrap: true, cell: (r) => r.awardedOn },
          { key: 'expiry', header: 'Expiry', nowrap: true, cell: (r) => expiry(r) },
          { key: 'ref', header: 'Reference', nowrap: true, cell: (r) => r.reference ?? '—' },
        ]}
      />
      {form}
    </>
  );
}
