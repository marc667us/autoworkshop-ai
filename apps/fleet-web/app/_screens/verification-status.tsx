import { apiGet } from '@autoworkshop/next-shell';
import { themeVar, primitive } from '@autoworkshop/design-tokens';

/**
 * "Waiting to be verified" — the follow-through on a promise the sign-up makes.
 *
 * 🔴 WITHOUT THIS, THE PROMISE HAD NOWHERE TO LAND. `CreateFleetScreen` tells
 * the registrant "a platform administrator checks every new organisation" and
 * the API returns `verificationStatus: 'pending'` — and then fleet-web showed
 * them nothing, ever. `GET /registrations/mine` was already deployed and had no
 * caller in this app. supplier-web renders its equivalent above the dashboard;
 * this is the same component for the same reason, found by the Supervisor
 * reviewing the registration door.
 *
 * A person told to wait, with no way to see whether the wait has ended, checks
 * by re-registering — and is refused with a 409 that reads like a bug.
 */
interface MyRegistration {
  // ⚠️ INCLUDES `'fleet'`. The union here is what this app can be told about
  // itself; omitting its own kind is how a screen ends up unable to describe the
  // thing it exists for.
  kind: 'workshop' | 'supplier' | 'fleet';
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
}

const TONE: Record<MyRegistration['status'], { border: string; title: string }> = {
  pending: { border: themeVar.statusAttention, title: 'Waiting to be verified' },
  // ⚠️ NOT "Verified and listed", WHICH IS supplier-web's WORDING AND WOULD BE
  // FALSE HERE. A fleet is never listed anywhere public — `approveOrRegister`
  // publishes nothing for `kind = 'fleet'` precisely because there is no
  // registry to publish into. Copying the supplier's sentence would promise a
  // listing this product will never produce.
  approved: { border: themeVar.statusSuccess, title: 'Verified' },
  rejected: { border: themeVar.statusDanger, title: 'Not approved' },
};

export async function VerificationStatus() {
  const result = await apiGet<MyRegistration | null>('fleet', '/registrations/mine');

  // 🔴 A FAILED READ IS NOT A STATUS. Rendering "not verified" because the API
  // was asleep would be a confident claim built on a transport failure — the
  // defect class this repository has recorded five times. Silence is the only
  // honest degraded state here.
  if (!result.ok || !result.data) return null;

  const reg = result.data;
  const tone = TONE[reg.status];

  return (
    <section
      aria-labelledby="verification-status-heading"
      style={{
        borderLeft: `3px solid ${tone.border}`,
        padding: `${primitive.space[3]} ${primitive.space[4]}`,
        marginBottom: primitive.space[5],
        background: themeVar.surfaceRaised,
        borderRadius: primitive.radius.md,
      }}
    >
      <h2
        id="verification-status-heading"
        style={{ margin: 0, fontSize: primitive.fontSize.base, color: themeVar.textPrimary }}
      >
        {tone.title}
      </h2>
      <p
        style={{
          margin: `${primitive.space[2]} 0 0`,
          fontSize: primitive.fontSize.sm,
          color: themeVar.textSecondary,
          lineHeight: 1.6,
        }}
      >
        {reg.status === 'pending' ? (
          <>
            A platform administrator is checking your organisation. Your fleet workspace works in
            the meantime — verification affects what other businesses can see of you, not your own
            vehicles and drivers.
          </>
        ) : reg.status === 'approved' ? (
          <>Your fleet is verified. Workshops and suppliers can now deal with you as one.</>
        ) : (
          <>
            {reg.decisionNote ??
              'A platform administrator did not approve this registration. Contact support to find out what is needed.'}
          </>
        )}
      </p>
    </section>
  );
}
