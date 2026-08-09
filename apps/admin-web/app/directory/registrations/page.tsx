import { Suspense } from 'react';
import { ApiFailure, apiGet, requireNavRoute } from '@autoworkshop/next-shell';
import { DataTable, EmptyState, LoadingState, PageHeader, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import {
  RegistrationDecision,
  type RegistrationStatus,
} from '../../_screens/registration-decision';

/**
 * `/directory/registrations` — the verification queue.
 *
 * Owner, 2026-08-09: *"when [a new] workshop or supplier [registers] the admin
 * is alerted to verify and approve and update the registries."* The alert is a
 * database trigger (migration 070); this is where the administrator acts on it.
 *
 * ⚠️ `requireNavRoute` FIRST, BEFORE ANY DATA ACCESS. A concrete page resolves
 * ahead of `app/[...slug]`, so the catch-all's tree check stops happening the
 * moment this file exists. It is NOT the control — `OrganizationRegistrationService`
 * asserts `platform_administrator` and migration 069's UPDATE policy carries the
 * same rule on both USING and WITH CHECK, so a non-admin who reaches this URL is
 * refused by the API and by the database independently (CLAUDE.md §8).
 *
 * 🔴 THE PATH IN THIS FILE MUST BE THE PATH THIS FILE IS MOUNTED AT. A page
 * written at one route and moved to another keeps its old string and calls
 * `notFound()` for every viewer, while the menu audit counts it as a working
 * screen. That has happened here before, to the Leads screen.
 */
export const dynamic = 'force-dynamic';

interface ApiRegistration {
  id: string;
  organizationId: string;
  organizationName: string | null;
  // ⚠️ THIS LOCAL COPY IS WHY THE MISLABEL WAS INVISIBLE. It said
  // `'workshop' | 'supplier'` while the database's CHECK constraint admitted a
  // third value from migration 075, so TypeScript proved a two-branch render was
  // exhaustive over a union that was already wrong. `string` at the end keeps
  // the display honest when the schema gains a fourth kind before this file
  // hears about it — the render names an unknown kind rather than borrowing a
  // known one.
  kind: 'workshop' | 'supplier' | 'fleet' | (string & {});
  status: RegistrationStatus;
  submittedByName: string | null;
  submittedByEmail: string | null;
  submittedAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
}

const BADGE: Record<string, 'draft' | 'active' | 'complete' | 'attention' | 'blocked'> = {
  pending: 'attention',
  approved: 'complete',
  rejected: 'blocked',
};

export default async function Page() {
  await requireNavRoute('admin', '/directory/registrations');
  return (
    <>
      <PageHeader
        title="Registrations"
        description="Workshops and parts suppliers that signed themselves up. They can set up their own account already — approving one is what puts it in the public directory or the parts marketplace."
      />
      {/* §70 loading state. `Suspense` rather than a flag so the header and the
          navigation render immediately even when the API is cold — measured at
          21.6s on a Render free-tier cold start. */}
      <Suspense fallback={<LoadingState label="Loading the verification queue…" />}>
        <Queue />
      </Suspense>
    </>
  );
}

async function Queue() {
  const result = await apiGet<ApiRegistration[]>('admin', '/registrations');
  // `ApiFailure` distinguishes "sign in again", "you do not have access" and
  // "the service is unreachable", because the remedies differ and collapsing
  // them reports a session problem as an outage.
  if (!result.ok) return <ApiFailure reason={result.reason} workspaceId="admin" />;

  if (result.data.length === 0) {
    return (
      <EmptyState
        title="Nothing waiting"
        description="No workshop or supplier has registered yet. When one does, every platform administrator is notified and it appears here."
      />
    );
  }

  const pending = result.data.filter((r) => r.status === 'pending').length;

  return (
    <div style={{ display: 'grid', gap: primitive.space[4] }}>
      <p style={{ margin: 0, fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
        {/* The count says what is WAITING, not how many rows are on screen —
            decided ones are kept below as the record of who decided what. */}
        {pending === 0
          ? 'Nothing is waiting. Decided registrations are kept below.'
          : `${pending} waiting for a decision.`}
      </p>
      <DataTable<ApiRegistration>
        caption="Businesses that registered themselves"
        summary={`${result.data.length} registration${result.data.length === 1 ? '' : 's'}`}
        rows={result.data}
        rowKey={(r) => r.id}
        columns={[
          {
            key: 'business',
            header: 'Business',
            cell: (r) => (
              <>
                <div style={{ fontWeight: 600 }}>{r.organizationName ?? 'unnamed'}</div>
                <div style={{ fontSize: primitive.fontSize.xs, color: themeVar.textSecondary }}>
                  {/* ⚠️ NAME EVERY KIND, AND FALL BACK TO THE RAW VALUE.
                      This read `kind === 'supplier' ? … : 'Workshop'`, so the
                      first fleet registration would have been presented to an
                      administrator as a WORKSHOP — and they would have approved
                      it believing that. A ternary is a two-value assumption;
                      `kind` is now three and the database will admit a fourth
                      before this file hears about it, so an unknown kind shows
                      itself rather than borrowing the name of a known one. */}
                  {r.kind === 'supplier'
                    ? 'Parts supplier'
                    : r.kind === 'fleet'
                      ? 'Fleet operator'
                      : r.kind === 'workshop'
                        ? 'Workshop'
                        : r.kind}
                </div>
              </>
            ),
          },
          {
            key: 'who',
            header: 'Registered by',
            cell: (r) => (
              <>
                {r.submittedByName ? <div>{r.submittedByName}</div> : null}
                {/* 🔴 THE EMAIL IS THE VERIFICATION EVIDENCE, not decoration.
                    An administrator is being asked whether a business is real,
                    and the only contact detail the sign-up captured is this. */}
                {r.submittedByEmail ? (
                  <div style={{ fontSize: primitive.fontSize.xs, color: themeVar.textSecondary }}>
                    {r.submittedByEmail}
                  </div>
                ) : null}
                {!r.submittedByName && !r.submittedByEmail ? '—' : null}
              </>
            ),
          },
          {
            key: 'submitted',
            header: 'Submitted',
            nowrap: true,
            secondary: true,
            cell: (r) => new Date(r.submittedAt).toLocaleDateString(),
          },
          {
            key: 'status',
            header: 'Status',
            cell: (r) => (
              <div style={{ display: 'grid', gap: primitive.space[1] }}>
                <StatusBadge kind={BADGE[r.status] ?? 'draft'} label={r.status} />
                {r.decisionNote ? (
                  <span style={{ fontSize: primitive.fontSize.xs, color: themeVar.textSecondary }}>
                    {r.decisionNote}
                  </span>
                ) : null}
              </div>
            ),
          },
          {
            key: 'decision',
            header: 'Decision',
            cell: (r) => (
              <RegistrationDecision
                registrationId={r.id}
                status={r.status}
                label={r.organizationName ?? 'this business'}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
