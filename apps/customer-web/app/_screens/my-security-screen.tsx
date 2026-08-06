import Link from 'next/link';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { DataTable, PageHeader } from '@autoworkshop/ui';
import { themeVar } from '@autoworkshop/design-tokens';

/**
 * YOUR ACCOUNT SECURITY — slice 13.
 *
 * ── 🔴 WHAT THIS PAGE DELIBERATELY DOES NOT SHOW ──────────────────────────
 *
 * The obvious build is "active sessions" and "recent sign-ins" with a Revoke
 * button beside each. **This product does not hold that data.** Sessions are
 * Keycloak's, and nothing here mirrors them. A session list assembled from
 * anything else would be a plausible table of invented rows, and a customer
 * would rely on it to decide whether somebody else was in their account.
 *
 * A "Revoke" button that revoked nothing would be worse still.
 *
 * ⚠️ THIS IS NOT `/settings/security` FROM THE WORKSHOP TREE. That one is the
 * workshop's security posture — the admin roster, permission denials, the RLS
 * posture — and a customer reading it was one of the eleven leaks closed on
 * 2026-08-07. This page is about the reader's OWN account and nothing else.
 *
 * So it shows what is true and reachable: who you are signed in as, what that
 * account can reach, and the two real controls — signing out, and changing your
 * password where passwords actually live.
 */

interface Membership {
  organizationId: string;
  organizationName: string;
  roleName: string;
}

interface Viewer {
  userId: string;
  displayName: string;
  email: string;
  activeRole: string;
  memberships: Membership[];
}

export async function MySecurityScreen() {
  const me = await apiGet<Viewer>('customer', '/me');

  const header = (
    <PageHeader
      title="Security"
      description="Who you are signed in as, and the controls you have over this account."
    />
  );

  if (!me.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={me.reason} workspaceId="customer" />
      </>
    );
  }

  const v = me.data;

  return (
    <>
      {header}

      <DataTable
        caption="This account"
        rows={[
          { k: 'Name', v: v.displayName },
          { k: 'Email', v: v.email || 'not recorded' },
          { k: 'Signed in as', v: v.activeRole.replace(/_/g, ' ') },
          {
            k: 'Workshops',
            v:
              v.memberships.length === 0
                ? 'none'
                : v.memberships.map((m) => m.organizationName).join(', '),
          },
        ]}
        rowKey={(r) => r.k}
        columns={[
          { key: 'k', header: 'Detail', nowrap: true, cell: (r) => r.k },
          { key: 'v', header: '', cell: (r) => r.v },
        ]}
      />

      <h2 style={{ fontSize: '1.05rem', margin: '1.5rem 0 0.5rem' }}>Your password</h2>
      <p style={{ margin: 0, maxWidth: '65ch' }}>
        Your password is not stored by this application. Sign-in is handled by the workshop&apos;s
        identity provider, and that is where a password is changed or reset — use{' '}
        <strong>Forgotten password</strong> on the sign-in screen, which sends the reset to the
        email address above.
      </p>

      <h2 style={{ fontSize: '1.05rem', margin: '1.5rem 0 0.5rem' }}>If you think someone else has access</h2>
      <p style={{ margin: '0 0 0.75rem', maxWidth: '65ch' }}>
        Reset your password first — that ends every signed-in session everywhere, including any
        you cannot see. Then tell the workshop, so they can check what was looked at.
      </p>
      <p style={{ margin: 0, maxWidth: '65ch', color: themeVar.textSecondary }}>
        {/* 🔴 THE HONEST ABSENCE, STATED. Better than a session table this
            product cannot populate truthfully. */}
        This page does not list your active sessions or past sign-ins: those are held by the
        identity provider, not by this application, so anything shown here would be a guess.
      </p>

      <p style={{ margin: '1.5rem 0 0' }}>
        <Link href="/support/support-cases">Tell the workshop about a security concern</Link>
      </p>
    </>
  );
}
