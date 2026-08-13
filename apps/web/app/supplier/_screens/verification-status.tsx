import { apiGet } from '@autoworkshop/next-shell';
import { themeVar, primitive } from '@autoworkshop/design-tokens';

/**
 * "Where does my verification stand?" — the answer to a promise this app makes.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 WHY THIS EXISTS: `GET /registrations/mine` HAD NO CALLER.
 *
 * The route was deployed, guarded, and referenced by nothing — a grep across
 * `apps/` and `packages/` found zero uses. Meanwhile `CreateSupplierScreen`
 * tells every new business "your listing goes live once you are verified", and
 * no screen anywhere could say whether it had.
 *
 * That is this repository's recorded lesson in both directions at once: a route
 * with no caller is not shipped, and a promise with no follow-through is worse
 * than one never made — the supplier waits, sees nothing, and concludes the
 * product is broken. Supervisor, 2026-08-09.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ IT RENDERS NOTHING WHEN THERE IS NOTHING TO SAY. A business that predates
 * self-registration has no row, and `mine()` returns null — no banner, rather
 * than a reassuring box that means nothing. And a REFUSAL renders nothing too:
 * the route is management-only (`assertMayReadOwnRegistration`), so a staff
 * member seeing no banner is correct, not an error to display.
 */

interface MyRegistration {
  kind: 'workshop' | 'supplier';
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
}

const TONE: Record<MyRegistration['status'], { border: string; title: string }> = {
  pending: { border: themeVar.statusAttention, title: 'Waiting to be verified' },
  approved: { border: themeVar.statusSuccess, title: 'Verified and listed' },
  rejected: { border: themeVar.statusDanger, title: 'Not approved' },
};

export async function VerificationStatus() {
  const result = await apiGet<MyRegistration | null>('supplier', '/registrations/mine');

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
        style={{
          margin: 0,
          fontSize: primitive.fontSize.base,
          color: themeVar.textPrimary,
        }}
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
            A platform administrator is checking your business. You can keep setting up your
            catalogue and locations in the meantime — nothing is lost, and your listing appears in
            the parts marketplace as soon as you are approved.
          </>
        ) : reg.status === 'approved' ? (
          <>
            Your business is verified and listed in the public parts marketplace. Buyers can find
            you and send parts requests.
          </>
        ) : (
          <>
            {/* 🔴 THE REASON IS SHOWN. The API requires a note for a rejection
                precisely so the business can act on it; withholding it here
                would make that requirement pointless and leave them with a
                refusal they cannot answer. */}
            Your registration was not approved
            {reg.decisionNote ? <> — {reg.decisionNote}</> : '.'} Correct what is described above
            and ask a platform administrator to look again; your account and everything in it are
            untouched.
          </>
        )}
      </p>
    </section>
  );
}
