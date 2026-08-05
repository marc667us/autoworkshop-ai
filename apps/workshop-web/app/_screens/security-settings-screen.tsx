import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { DataTable, EmptyState, PageHeader, StatusBadge } from '@autoworkshop/ui';

import { navLabelFor } from './nav-label';

/**
 * SECURITY — slice 6. A READ of the real posture, with no table of its own.
 *
 * ── 🔴 THIS SCREEN ONLY EXISTS BECAUSE A8 WAS FIXED FIRST ──────────────────
 *
 * Before `PermissionDenialAuditFilter`, `audit.events` held no denial rows at
 * all, so a security page would have shown a permanently empty table for a
 * reason no reader could ever guess. That is precisely the `SuppliersScreen`
 * defect of slice 4 — a screen calling `/public/suppliers`, which does not
 * exist, whose main table would have been empty forever.
 *
 * So the order was: build the mechanism that produces the data, then the screen
 * that reads it. The denial list below is real, it fills as refusals happen, and
 * an empty one now means "nobody has been refused anything", which is a true and
 * useful statement rather than a broken page.
 *
 * ── ⚠️ THE RLS FIGURES ARE MEASURED FROM `pg_class`, NOT MAINTAINED BY HAND ─
 *
 * A hand-kept list of "tables we secured" is the thing that reads correct while
 * the mechanism is inert — recorded five or more times across these two
 * projects. Counting `relrowsecurity` and `relforcerowsecurity` straight from
 * the catalogue means this number cannot drift from what the database is
 * actually doing.
 *
 * ⚠️ ENABLED-BUT-NOT-FORCED IS NOT SECURITY. Postgres exempts a table's OWNER
 * from RLS unless FORCE is set, and the application connects as a role that owns
 * these tables. An "enabled" count on its own would be the reassuring half of
 * the number, which is why both are shown and the unforced one is flagged.
 */

interface Posture {
  administrators: { userId: string; displayName: string; roleName: string }[];
  recentDenials: { at: string; actor: string | null; route: string | null; reason: string | null }[];
  forcedRlsTables: number;
  unforcedRlsTables: number;
}

function when(iso: string): string {
  try {
    return new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

const ROLE_LABEL: Record<string, string> = {
  workshop_owner: 'Owner',
  workshop_manager: 'Manager',
  platform_administrator: 'Platform administrator',
};

export async function SecuritySettingsScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Security');
  const posture = await apiGet<Posture>('workshop', '/settings/security-posture');

  const header = (
    <PageHeader
      title={title}
      description="Who holds administrative access to this workshop, what has recently been refused, and whether the database's own isolation is switched on."
    />
  );

  if (!posture.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={posture.reason} workspaceId="workshop" />
      </>
    );
  }

  const { administrators, recentDenials, forcedRlsTables, unforcedRlsTables } = posture.data;

  return (
    <>
      {header}

      <h2 style={{ marginTop: '2rem' }}>Administrative access</h2>
      {administrators.length === 0 ? (
        <EmptyState
          title="No administrators are recorded"
          description="That should not be possible for a workshop that was registered normally — the person who registered it holds the owner role. Check Staff and Roles."
        />
      ) : (
        <DataTable
          caption={`${administrators.length} people can change this workshop's configuration`}
          rows={administrators}
          rowKey={(r) => r.userId}
          columns={[
            { key: 'who', header: 'Person', cell: (r) => r.displayName },
            {
              key: 'role',
              header: 'Role',
              cell: (r) => ROLE_LABEL[r.roleName] ?? r.roleName,
            },
          ]}
        />
      )}

      <h2 style={{ marginTop: '2rem' }}>Recently refused</h2>
      {recentDenials.length === 0 ? (
        <EmptyState
          title="Nothing has been refused"
          description="No permission denial has been recorded for this workshop. This list fills as refusals happen — an empty list means there have been none, not that they are going unrecorded."
        />
      ) : (
        <DataTable
          caption={`the last ${recentDenials.length} refusals`}
          rows={recentDenials}
          rowKey={(r) => `${r.at}-${r.route ?? ''}`}
          columns={[
            { key: 'at', header: 'When', nowrap: true, cell: (r) => when(r.at) },
            { key: 'route', header: 'What was attempted', cell: (r) => r.route ?? '—' },
            { key: 'why', header: 'Why it was refused', cell: (r) => r.reason ?? '—' },
          ]}
        />
      )}

      <h2 style={{ marginTop: '2rem' }}>Database isolation</h2>
      <p style={{ maxWidth: '60ch' }}>
        Row-level security is what stops one workshop reading another&apos;s records
        even if the application layer were wrong. Postgres exempts a table&apos;s
        owner from it unless it is <strong>forced</strong>, and this application
        connects as an owner — so &ldquo;enabled&rdquo; on its own would not be
        protection.
      </p>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', margin: '0.75rem 0' }}>
        <StatusBadge kind="complete" label={`${forcedRlsTables} tables forced`} />
        {unforcedRlsTables > 0 ? (
          <StatusBadge
            kind="attention"
            label={`${unforcedRlsTables} enabled but NOT forced`}
          />
        ) : (
          <StatusBadge kind="complete" label="none enabled-but-unforced" />
        )}
      </div>

      <h2 style={{ marginTop: '2rem' }}>Passwords and sign-in</h2>
      <p style={{ maxWidth: '60ch' }}>
        Sign-in, passwords, password resets and multi-factor settings are held by
        the identity server, not by this application — this platform never stores
        a password. Change yours from the account menu, which takes you to the
        identity server&apos;s own account page.
      </p>
    </>
  );
}
