import Link from 'next/link';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { landingPathFor, workspaces } from '@autoworkshop/navigation';
import {
  currentViewer,
  homeWorkspaceFor,
  registrationStatus,
  viewerHasSession,
} from '@autoworkshop/next-shell';
import { ACCOUNT_TYPES, NOT_SELF_SERVICE } from './account-types';

/**
 * `/onboarding` — WHAT A PERSON WHO HAS JUST SIGNED UP IS ACTUALLY FOR.
 *
 * ── 🔴 THE GAP THIS CLOSES, MEASURED ────────────────────────────────────────
 *
 * Signing up does not assign a role. `POST /api/auth/register` redirects to
 * Keycloak's registration form and does nothing else; `TenantGuard` then
 * provisions an application user on the first authenticated call but grants no
 * membership (`tenant.guard.ts:63-79`), so `/api/v1/me` 401s. Back at `/`,
 * `viewerHasSession` is true while `viewer?.activeRole` is undefined, and
 * `app/page.tsx` falls through to the public marketplace.
 *
 * The result: somebody who signed up thirty seconds ago saw the identical page
 * to a stranger, with a "Create an account" button they had just used, and was
 * offered no route to become anything. The three registration screens existed —
 * at `/workshop/home/dashboard`, `/supplier/home/dashboard` and
 * `/fleet/home/dashboard` — but you had to type the URL of a dashboard you did
 * not have in order to reach them. That is the honest explanation for the
 * owner's report that "access is denied to users".
 *
 * ── ⚠️ THIS PAGE NEVER REDIRECTS AWAY, AND THAT IS DELIBERATE ───────────────
 *
 * `CreateWorkshopScreen`'s comment (`create-workshop-screen.tsx:9-14`) records
 * why the workshop onboarding renders in place instead of redirecting: "a
 * redirect needs a condition on the onboarding route to send finished users
 * away again, and the two conditions are then free to disagree — which is a
 * redirect loop, on the very first screen a new user ever reaches, with no way
 * out but clearing cookies."
 *
 * That warning applies to this route directly. So there is exactly ONE
 * condition in the system, and it lives on `/`, which OFFERS this page. This
 * page itself renders for everybody: a person who already belongs somewhere is
 * shown a LINK to their workspace, never sent there. One condition cannot
 * disagree with itself.
 *
 * ── ⚠️ AND IT IS NOT REACHED BY A FORCED REDIRECT EITHER ────────────────────
 *
 * The first design had `/` redirect here whenever the API said the viewer held
 * no membership. Codex refused it, correctly: `hasWorkshop: false` means "no
 * active membership at all", and the parts buyer who never joins a workshop is
 * a PERMANENT member of that set — the storefront is the product for them.
 * Redirecting would have taken them off the marketplace on every single visit.
 * `/` therefore keeps rendering the marketplace and shows an invitation above
 * it. Same lesson as 2026-08-13, when replacing the landing for a signed-in
 * account with no workshop made the free VIN tool unreachable for exactly the
 * people it converts.
 *
 * ⚠️ `force-dynamic`: this reads the session cookie. A cached render would
 * serve one visitor's page to the next.
 */
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'AutoWorkshop AI — Set up your account',
  description: 'Choose how you will use AutoWorkshop.',
};

export default async function OnboardingPage() {
  // Resolved together for the same reason the pack layouts do it: `/me` can
  // fail while the session is perfectly live, and this page must still render.
  const [signedIn, viewer, status] = await Promise.all([
    viewerHasSession('customer'),
    currentViewer('customer'),
    registrationStatus('customer'),
  ]);

  // 🔴 `status.organizations`, NOT `viewer`. A viewer resolves only when the
  // API could build a tenant context, which is precisely what the audience of
  // this page cannot do — so branching on `viewer` alone would tell every
  // person who needs this screen that they belong nowhere even when they do,
  // and tell nobody anything when the API is merely slow.
  //
  // ⚠️ NULL IS NOT "NO MEMBERSHIP". `registrationStatus` returns null when the
  // question could not be ANSWERED (no usable access token, API unreachable).
  // `/` is in `PUBLIC_PATHS` so the Auth.js middleware does not refresh the
  // token there, which makes a null genuinely reachable on a return visit —
  // measured reasoning, not hypothetical. Treating null as "no membership"
  // would greet an established workshop owner with an invitation to create the
  // workshop they already have. Fail to "unknown", never to "new".
  const alreadyBelongs = (status?.organizations.length ?? 0) > 0;
  const unknown = status === null;

  return (
    <main
      style={{
        maxWidth: '58rem',
        margin: '0 auto',
        padding: primitive.space[8],
        color: themeVar.textPrimary,
      }}
    >
      <h1 style={{ fontSize: primitive.fontSize.xl, marginBottom: primitive.space[2] }}>
        {status?.displayName ? `Welcome, ${status.displayName}.` : 'Welcome.'}
      </h1>

      <p
        style={{
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.sm,
          lineHeight: 1.6,
          marginBottom: primitive.space[6],
          maxWidth: '44rem',
        }}
      >
        {/* Names what happened, because the most common worry here is that
            sign-up failed — a working account with an empty application looks
            exactly like a broken one. The same reasoning as
            `CreateWorkshopScreen`'s opening paragraph. */}
        Your sign-in works. It is not attached to an organisation yet, which is
        why the application looks empty — signing up creates the account, and
        this page is where you say what it is for.
      </p>

      {/* ── the already-a-member case: a LINK, never a redirect ───────────── */}
      {alreadyBelongs && (
        <section
          style={{
            border: `1px solid ${themeVar.borderDefault}`,
            borderRadius: primitive.radius.md,
            padding: primitive.space[4],
            marginBottom: primitive.space[6],
          }}
        >
          <p style={{ fontSize: primitive.fontSize.sm, marginBottom: primitive.space[2] }}>
            You already belong to an organisation, so there is nothing to set up
            here.
          </p>
          {/* ⚠️ THE SAME `landingPathFor` THE FRONT DOOR USES. Written as
              `/${workspace}/home/dashboard` here too, and it would have sent a
              platform administrator and a towing operator to a 404 from this
              page as well — a third copy of the literal, in the one screen
              whose entire job is to stop people reaching dead ends. */}
          <Link
            href={
              landingPathFor(homeWorkspaceFor(viewer?.activeRole), Object.values(workspaces)) ?? '/'
            }
            style={{ color: themeVar.actionPrimary }}
          >
            Open your workspace
          </Link>
        </section>
      )}

      {/* ⚠️ SAYS SO WHEN IT DOES NOT KNOW, rather than rendering the choices as
          though they were checked. Somebody whose token has expired would
          otherwise be invited to register a second workshop and be refused with
          a 409 they did nothing to deserve. */}
      {unknown && signedIn && (
        <p
          style={{
            color: themeVar.textSecondary,
            fontSize: primitive.fontSize.xs,
            marginBottom: primitive.space[6],
          }}
        >
          We could not check what your account is attached to just now. The
          choices below are still correct; if you already have a workshop,
          supplier account or fleet, open it from the front page instead.
        </p>
      )}

      {!signedIn && (
        <p style={{ marginBottom: primitive.space[6], fontSize: primitive.fontSize.sm }}>
          {/* Rendered rather than redirected, for the same no-loop reason as the
              rest of this page. */}
          <Link href="/api/auth/signin" style={{ color: themeVar.actionPrimary }}>
            Sign in first
          </Link>{' '}
          — these choices attach to your account.
        </p>
      )}

      <h2 style={{ fontSize: primitive.fontSize.lg, marginBottom: primitive.space[4] }}>
        How will you use AutoWorkshop?
      </h2>

      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'grid',
          gap: primitive.space[4],
          // Two columns where there is room, one where there is not. The
          // responsive check is a definition-of-complete item (`05.txt` §6).
          gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))',
        }}
      >
        {ACCOUNT_TYPES.map((type) => (
          <li
            key={type.id}
            style={{
              border: `1px solid ${themeVar.borderDefault}`,
              borderRadius: primitive.radius.md,
              padding: primitive.space[5],
              display: 'flex',
              flexDirection: 'column',
              gap: primitive.space[2],
            }}
          >
            <h3 style={{ fontSize: primitive.fontSize.base, margin: 0 }}>{type.label}</h3>

            <p
              style={{
                color: themeVar.textSecondary,
                fontSize: primitive.fontSize.sm,
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              {type.summary}
            </p>

            {/* 🔴 THE FEATURES OF THE ROLE, READ FROM THE NAVIGATION MODEL.
                Not a hand-written list: `account-types.ts` maps each entry to
                the workspace's real groups, so renaming a section of the
                product renames it here too. A second copy would drift, and
                somebody is choosing what to BECOME from this text. */}
            <p
              style={{
                fontSize: primitive.fontSize.xs,
                color: themeVar.textSecondary,
                margin: 0,
                lineHeight: 1.6,
              }}
            >
              <strong style={{ color: themeVar.textPrimary }}>You get:</strong>{' '}
              {type.features.join(' · ')}
            </p>

            {type.caveat && (
              <p
                style={{
                  fontSize: primitive.fontSize.xs,
                  color: themeVar.textSecondary,
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                {type.caveat}
              </p>
            )}

            <div style={{ marginTop: 'auto', paddingTop: primitive.space[3] }}>
              <Link
                href={type.href}
                style={{ color: themeVar.actionPrimary, fontSize: primitive.fontSize.sm }}
              >
                {type.cta} →
              </Link>
            </div>
          </li>
        ))}
      </ul>

      {/* ── the roles this screen does NOT offer, and why ──────────────────── */}
      <h2
        style={{
          fontSize: primitive.fontSize.base,
          marginTop: primitive.space[8],
          marginBottom: primitive.space[3],
        }}
      >
        Looking for something else?
      </h2>

      <dl style={{ margin: 0 }}>
        {NOT_SELF_SERVICE.map((role) => (
          <div key={role.id} style={{ marginBottom: primitive.space[4] }}>
            <dt style={{ fontSize: primitive.fontSize.sm, fontWeight: 600 }}>{role.label}</dt>
            <dd
              style={{
                margin: 0,
                fontSize: primitive.fontSize.sm,
                color: themeVar.textSecondary,
                lineHeight: 1.6,
              }}
            >
              {role.reason}
            </dd>
          </div>
        ))}
      </dl>

      {/* 🔴 THE WAY BACK TO THE STOREFRONT, ON EVERY RENDER. Codex's Q1: the
          parts buyer who never joins an organisation is a permanent and
          intended user, and this page must not read as a wall they have to get
          past. Browsing and buying parts needs no organisation at all. */}
      <p
        style={{
          marginTop: primitive.space[8],
          fontSize: primitive.fontSize.sm,
          color: themeVar.textSecondary,
        }}
      >
        None of these?{' '}
        <Link href="/" style={{ color: themeVar.actionPrimary }}>
          Browse and buy parts
        </Link>{' '}
        — that needs no organisation, and your account already works for it.
      </p>
    </main>
  );
}
