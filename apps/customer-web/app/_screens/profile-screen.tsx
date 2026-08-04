import { Suspense } from 'react';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { LoadingState, PageHeader } from '@autoworkshop/ui';
import { primitive, themeVar } from '@autoworkshop/design-tokens';

/**
 * /settings/profile — the customer's own details, `01 (1).txt` §33.
 *
 * A REAL screen rather than a planned one, because the data already exists:
 * `GET /me` returns the identity the API resolved from the validated token plus
 * membership records. Nothing here is invented.
 *
 * ⚠️ READ-ONLY, AND IT SAYS SO. The profile is owned by the sign-in service —
 * `provision_user_from_subject` reconciles name and email from Keycloak on
 * every request, so anything typed here would be silently overwritten at the
 * next sign-in. A form that quietly loses what you typed is worse than no form,
 * so the screen names where the details actually come from instead.
 */

export const dynamic = 'force-dynamic';

/** Field names taken from `MeService.describe` — never guessed. */
interface Me {
  userId: string;
  displayName: string;
  email: string;
  activeRole: string;
  organizationId: string;
  memberships: Array<{
    organizationId: string;
    organizationName: string;
    roleName: string;
  }>;
}

export function ProfileScreen() {
  return (
    <>
      <PageHeader
        title="Your profile"
        description="The details this workshop holds for you, and where they come from."
      />
      <Suspense fallback={<LoadingState label="Loading your profile…" />}>
        <Profile />
      </Suspense>
    </>
  );
}

async function Profile() {
  const me = await apiGet<Me>('customer', '/me');
  if (!me.ok) return <ApiFailure reason={me.reason} workspaceId="customer" />;

  return (
    <div
      style={{
        border: `1px solid ${themeVar.borderDefault}`,
        borderRadius: primitive.radius.xl,
        background: themeVar.surfaceRaised,
        padding: primitive.space[6],
        maxWidth: '38rem',
        display: 'flex',
        flexDirection: 'column',
        gap: primitive.space[4],
      }}
    >
      <dl style={{ display: 'grid', gap: primitive.space[4], margin: 0 }}>
        <Fact label="Name" value={me.data.displayName} />
        <Fact label="Email address" value={me.data.email} />
      </dl>

      <p
        style={{
          margin: 0,
          paddingTop: primitive.space[4],
          borderTop: `1px solid ${themeVar.borderDefault}`,
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.sm,
          lineHeight: 1.7,
        }}
      >
        {/*
          Says WHERE to change it rather than offering a control that would not
          stick. Keycloak is authoritative for the profile and reconciles it on
          every sign-in, so an edit form here would be overwritten silently.
        */}
        Your name and email come from your sign-in account and are refreshed each
        time you sign in — change them there and they update here. Your password
        is managed there too; use “Forgot password” on the sign-in screen.
      </p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.xs }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: primitive.fontSize.base }}>{value}</dd>
    </div>
  );
}
